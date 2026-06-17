"use strict";

// ---- state ----
const state = {
  sessionId: null,
  em: 1000,
  glyphs: [],          // [{codepoint, hex, name, has_outline, ...}]
  used: new Set(),     // used codepoints
  refCodepoint: null,  // global default reference codepoint
  rows: [],            // [{file, codepoint, name, ref}]
};

const PUA_START = 0xe900;

// ---- helpers ----
const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

function nextFreeCodepoint() {
  let cp = PUA_START;
  while (state.used.has(cp)) cp++;
  return cp;
}

function deriveName(filename) {
  const base = filename.replace(/\.svg$/i, "").trim();
  const slug = base
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return "icon-" + (slug || "new");
}

function setStatus(msg, kind) {
  const s = $("#status");
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
}

// ---- drag & drop wiring ----
function wireDrop(dropEl, inputEl, onFiles) {
  dropEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropEl.classList.add("over");
  });
  dropEl.addEventListener("dragleave", () => dropEl.classList.remove("over"));
  dropEl.addEventListener("drop", (e) => {
    e.preventDefault();
    dropEl.classList.remove("over");
    onFiles([...e.dataTransfer.files]);
  });
  inputEl.addEventListener("change", () => onFiles([...inputEl.files]));
}

// ---- step 1: upload font ----
async function uploadFont(file) {
  setStatus("解析字体中…");
  const fd = new FormData();
  fd.append("file", file);
  let res;
  try {
    res = await fetch("/api/font", { method: "POST", body: fd });
  } catch (e) {
    return setStatus("网络错误: " + e.message, "error");
  }
  const data = await res.json();
  if (!res.ok) return setStatus(data.detail || "上传失败", "error");

  state.sessionId = data.session_id;
  state.em = data.em;
  state.glyphs = data.glyphs;
  state.used = new Set(data.glyphs.map((g) => g.codepoint));
  state.refCodepoint = null;
  state.rows = [];

  $("#font-label").textContent = data.filename;
  $("#font-meta").classList.remove("hidden");
  $("#font-meta").textContent =
    `${data.family || "字体"} · em=${data.em} · ${data.glyph_count} 字形`;

  renderGrid();
  $("#step-grid").classList.remove("hidden");
  $("#step-icons").classList.remove("hidden");
  $("#icon-rows").innerHTML = "";
  $("#icon-table").classList.add("hidden");
  $("#step-gen").classList.add("hidden");
  setStatus("");
}

// ---- step 2: glyph grid ----
function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  for (const g of state.glyphs) {
    if (!g.has_outline) continue;
    const img = el("img", {
      src: `/api/thumb/${state.sessionId}/${g.hex}`,
      alt: g.hex,
      loading: "lazy",
    });
    const cell = el(
      "button",
      { className: "cell", title: `U+${g.hex} ${g.name}`, type: "button" },
      img,
      el("span", { className: "cp", textContent: g.hex })
    );
    cell.addEventListener("click", () => setReference(g.codepoint));
    cell.dataset.cp = g.codepoint;
    grid.append(cell);
  }
}

function setReference(cp) {
  state.refCodepoint = cp;
  document.querySelectorAll(".cell").forEach((c) => {
    c.classList.toggle("ref", Number(c.dataset.cp) === cp);
  });
  // refresh ref selectors in existing rows that still track the default
  state.rows.forEach((r) => {
    if (r.refFollowsDefault) {
      r.ref = cp;
      if (r._refSel) r._refSel.value = String(cp);
    }
  });
}

// ---- step 3: add svg rows ----
function addSvgFiles(files) {
  const svgs = files.filter((f) => /\.svg$/i.test(f.name));
  if (!svgs.length) return setStatus("请选择 .svg 文件", "error");
  for (const file of svgs) {
    const cp = nextFreeCodepoint();
    state.used.add(cp);
    const row = {
      file,
      codepoint: cp,
      name: deriveName(file.name),
      ref: state.refCodepoint,
      refFollowsDefault: true,
    };
    state.rows.push(row);
  }
  renderRows();
  $("#icon-table").classList.remove("hidden");
  $("#step-gen").classList.remove("hidden");
  setStatus("");
}

function outlinedGlyphs() {
  return state.glyphs.filter((g) => g.has_outline);
}

function renderRows() {
  const tbody = $("#icon-rows");
  tbody.innerHTML = "";
  state.rows.forEach((row, i) => {
    // preview
    const prev = el("img", { className: "svg-prev" });
    const reader = new FileReader();
    reader.onload = () => (prev.src = reader.result);
    reader.readAsDataURL(row.file);

    // codepoint input
    const cpInput = el("input", {
      className: "cp-input",
      value: row.hex || row.codepoint.toString(16).toUpperCase(),
    });
    cpInput.addEventListener("change", () => {
      const v = parseInt(cpInput.value.replace(/^(0x|U\+)/i, ""), 16);
      if (isNaN(v)) {
        cpInput.classList.add("bad");
        return;
      }
      cpInput.classList.remove("bad");
      row.codepoint = v;
      markCollision(cpInput, v, i);
    });
    markCollision(cpInput, row.codepoint, i);

    // name input
    const nameInput = el("input", { className: "name-input", value: row.name });
    nameInput.addEventListener("change", () => (row.name = nameInput.value.trim()));

    // ref selector
    const refSel = el("select", { className: "ref-sel" });
    refSel.append(el("option", { value: "", textContent: "按 em 居中" }));
    for (const g of outlinedGlyphs()) {
      refSel.append(
        el("option", { value: String(g.codepoint), textContent: "U+" + g.hex })
      );
    }
    refSel.value = row.ref == null ? "" : String(row.ref);
    refSel.addEventListener("change", () => {
      row.ref = refSel.value === "" ? null : Number(refSel.value);
      row.refFollowsDefault = false;
    });
    row._refSel = refSel;

    // remove
    const del = el("button", { type: "button", className: "del", textContent: "✕" });
    del.addEventListener("click", () => {
      state.used.delete(row.codepoint);
      state.rows.splice(i, 1);
      renderRows();
    });

    const tr = el(
      "tr",
      {},
      el("td", { textContent: row.file.name }),
      el("td", {}, prev),
      el("td", {}, el("span", { className: "pre", textContent: "U+" }), cpInput),
      el("td", {}, nameInput),
      el("td", {}, refSel),
      el("td", {}, del)
    );
    tbody.append(tr);
  });
}

function markCollision(input, cp, selfIndex) {
  // collision if cp exists in font OR duplicated by another row
  const inFont = state.glyphs.some((g) => g.codepoint === cp);
  const dupRow = state.rows.some((r, j) => j !== selfIndex && r.codepoint === cp);
  const collide = inFont || dupRow;
  input.classList.toggle("warn", collide);
  input.title = collide ? "码位已占用，将覆盖现有字形" : "";
}

// ---- step 4: generate ----
async function generate() {
  if (!state.rows.length) return setStatus("先添加图标", "error");
  for (const r of state.rows) {
    if (!r.name) return setStatus("有图标缺字形名", "error");
  }
  setStatus("生成中…");
  $("#generate-btn").disabled = true;

  const fd = new FormData();
  fd.append("session_id", state.sessionId);
  fd.append(
    "icons",
    JSON.stringify(
      state.rows.map((r) => ({
        filename: r.file.name,
        codepoint: r.codepoint,
        name: r.name,
        ref_codepoint: r.ref,
      }))
    )
  );
  for (const r of state.rows) fd.append("files", r.file, r.file.name);

  let res;
  try {
    res = await fetch("/api/generate", { method: "POST", body: fd });
  } catch (e) {
    $("#generate-btn").disabled = false;
    return setStatus("网络错误: " + e.message, "error");
  }
  const data = await res.json();
  $("#generate-btn").disabled = false;
  if (!res.ok) return setStatus(data.detail || "生成失败", "error");

  setStatus("生成成功，正在下载…", "ok");
  window.location.href = `/api/download/${state.sessionId}`;

  const list = $("#css-list");
  list.innerHTML = "";
  (data.icons || []).forEach((ic) => {
    list.append(
      el("li", {}, `U+${ic.hex}  ${ic.name}  →  content: "${ic.css}"`)
    );
  });
}

// ---- init ----
wireDrop($("#font-drop"), $("#font-input"), (files) => {
  if (files[0]) uploadFont(files[0]);
});
wireDrop($("#svg-drop"), $("#svg-input"), addSvgFiles);
$("#generate-btn").addEventListener("click", generate);
