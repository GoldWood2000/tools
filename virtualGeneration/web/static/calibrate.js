"use strict";

const $ = (s) => document.querySelector(s);
const SAMPLE = {
  plate: "粤B88888", vehicle_type: "小型轿车", owner: "张伟",
  address: "某省某市西湖区中山路123号", use_char: "非营运",
  model: "比亚迪牌ABC1234XY", vin: "LSVAA1234567890XY", engine: "12345678",
  register_date: "2020-05-20", issue_date: "2020-05-23",
  file_no: "376132214300", passengers: "5人", gross_mass: "1800kg",
  curb_mass: "1500kg", load_mass: "0kg", dimensions: "4800X1800X1500",
  traction_mass: "0kg", inspect_year: "2031", inspect_month: "6",
};

let state = { front: [], back: [] };
let sizes = { front: [629, 408], back: [632, 411] };
let side = "front";
let sel = -1;       // selected field index
let scale = 1;      // display px per template px

const stage = $("#stage");
const tpl = $("#tpl");

// ---- load ----
async function load() {
  const res = await fetch("/api/driver/regions");
  const data = await res.json();
  state.front = data.front.map((f) => ({ ...f, region: [...f.region] }));
  state.back = data.back.map((f) => ({ ...f, region: [...f.region] }));
  sizes = data.sizes;
  switchSide("front");
}

function fields() { return state[side]; }

function switchSide(s) {
  side = s;
  sel = -1;
  $("#seg-front").classList.toggle("on", s === "front");
  $("#seg-back").classList.toggle("on", s === "back");
  $("#side-label").textContent = s === "front" ? "正页" : "反页";
  tpl.src = `/api/driver/template/${s}?t=` + Date.now();
  tpl.onload = () => {
    scale = tpl.clientWidth / sizes[s][0];
    renderBoxes();
    renderRows();
  };
}

// ---- boxes on image ----
function renderBoxes() {
  // remove old boxes (keep img)
  [...stage.querySelectorAll(".box")].forEach((b) => b.remove());
  fields().forEach((fd, i) => {
    const [x0, y0, x1, y1] = fd.region;
    const box = document.createElement("div");
    box.className = "box" + (i === sel ? " sel" : "");
    box.style.left = x0 * scale + "px";
    box.style.top = y0 * scale + "px";
    box.style.width = (x1 - x0) * scale + "px";
    box.style.height = (y1 - y0) * scale + "px";
    box.innerHTML = `<span class="tag">${fd.key}</span><span class="h"></span>`;
    box.addEventListener("mousedown", (e) => startDrag(e, i, box));
    stage.append(box);
  });
}

function renderRows() {
  const tb = $("#rows");
  tb.innerHTML = "";
  fields().forEach((fd, i) => {
    const tr = document.createElement("tr");
    if (i === sel) tr.className = "sel";
    const name = document.createElement("td");
    name.textContent = fd.key;
    name.addEventListener("click", () => { sel = i; renderBoxes(); renderRows(); });
    tr.append(name);
    fd.region.forEach((v, j) => {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.className = "num";
      inp.value = v;
      inp.addEventListener("change", () => {
        fd.region[j] = parseInt(inp.value, 10) || 0;
        renderBoxes();
      });
      td.append(inp);
      tr.append(td);
    });
    tb.append(tr);
  });
}

// ---- drag / resize ----
function startDrag(e, i, box) {
  e.preventDefault();
  sel = i;
  renderRows();
  [...stage.querySelectorAll(".box")].forEach((b, j) =>
    b.classList.toggle("sel", j === i));
  const fd = fields()[i];
  const resize = e.target.classList.contains("h");
  const startX = e.clientX, startY = e.clientY;
  const orig = [...fd.region];

  function move(ev) {
    const dx = Math.round((ev.clientX - startX) / scale);
    const dy = Math.round((ev.clientY - startY) / scale);
    if (resize) {
      fd.region[2] = Math.max(orig[0] + 4, orig[2] + dx);
      fd.region[3] = Math.max(orig[1] + 4, orig[3] + dy);
    } else {
      fd.region[0] = orig[0] + dx;
      fd.region[1] = orig[1] + dy;
      fd.region[2] = orig[2] + dx;
      fd.region[3] = orig[3] + dy;
    }
    // live update this box + its row inputs
    const [x0, y0, x1, y1] = fd.region;
    box.style.left = x0 * scale + "px";
    box.style.top = y0 * scale + "px";
    box.style.width = (x1 - x0) * scale + "px";
    box.style.height = (y1 - y0) * scale + "px";
    syncRowInputs(i);
  }
  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
  }
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

function syncRowInputs(i) {
  const tr = $("#rows").children[i];
  if (!tr) return;
  const inputs = tr.querySelectorAll("input.num");
  fields()[i].region.forEach((v, j) => { if (inputs[j]) inputs[j].value = v; });
}

// ---- save ----
async function save() {
  setStatus("保存中…");
  const res = await fetch("/api/driver/regions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front: state.front, back: state.back }),
  });
  if (res.ok) setStatus("已保存到 regions.json", "ok");
  else setStatus("保存失败", "err");
}

// ---- preview ----
async function preview() {
  setStatus("渲染预览…");
  // 先保存当前坐标，确保后端用最新
  await fetch("/api/driver/regions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front: state.front, back: state.back }),
  });
  const res = await fetch(`/api/driver/preview/${side}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(SAMPLE),
  });
  if (!res.ok) return setStatus("预览失败", "err");
  const data = await res.json();
  $("#preview-body").innerHTML =
    `<img src="data:image/png;base64,${data.png}" alt="预览">`;
  setStatus("预览已更新", "ok");
}

function setStatus(msg, kind) {
  const s = $("#status");
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
}

$("#seg-front").addEventListener("click", () => switchSide("front"));
$("#seg-back").addEventListener("click", () => switchSide("back"));
$("#btn-save").addEventListener("click", save);
$("#btn-preview").addEventListener("click", preview);

load();
