const state = {
  currentJobId: null,
  pollTimer: null,
  running: false,
  fonts: null,
};

const $ = (selector) => document.querySelector(selector);

const els = {
  textInput: $("#textInput"),
  previewInput: $("#previewInput"),
  previewLine: $("#previewLine"),
  charCount: $("#charCount"),
  uniqueCount: $("#uniqueCount"),
  checkButton: $("#checkButton"),
  mergeButton: $("#mergeButton"),
  clearButton: $("#clearButton"),
  refreshButton: $("#refreshButton"),
  sourceSelect: $("#sourceSelect"),
  targetSelect: $("#targetSelect"),
  sourceMeta: $("#sourceMeta"),
  targetMeta: $("#targetMeta"),
  sourceUpload: $("#sourceUpload"),
  targetUpload: $("#targetUpload"),
  sourceUploadButton: $("#sourceUploadButton"),
  targetUploadButton: $("#targetUploadButton"),
  outputName: $("#outputName"),
  logOutput: $("#logOutput"),
  checkResult: $("#checkResult"),
  jobTitle: $("#jobTitle"),
  runState: $("#runState"),
  generatedList: $("#generatedList"),
  resultTitle: $("#resultTitle"),
  downloadLink: $("#downloadLink"),
  dynamicFont: $("#dynamicFont"),
  serverStatus: $("#serverStatus"),
};

function uniqueCharacters(text) {
  return Array.from(new Set(Array.from(text))).length;
}

function setBusy(isBusy) {
  state.running = isBusy;
  const hasText = els.textInput.value.length > 0;
  els.mergeButton.disabled = isBusy || !hasText;
  els.checkButton.disabled = isBusy || !hasText;
  els.sourceSelect.disabled = isBusy;
  els.targetSelect.disabled = isBusy;
  els.mergeButton.dataset.busy = isBusy ? "true" : "false";
  els.checkButton.dataset.busy = isBusy ? "true" : "false";
  const mergeLabel = els.mergeButton.querySelector("span");
  if (mergeLabel) mergeLabel.textContent = isBusy ? "处理中" : "开始合并";
}

function setRunState(label, mode) {
  els.runState.textContent = label;
  els.runState.className = `run-state ${mode}`;
}

function scopeLabel(scope) {
  return {
    source: "source",
    target: "target",
    uploads: "uploads",
    output: "output",
  }[scope] || scope || "font";
}

function updateCounts() {
  const text = els.textInput.value;
  els.charCount.textContent = Array.from(text).length;
  els.uniqueCount.textContent = uniqueCharacters(text);
  const hasText = text.length > 0;
  els.mergeButton.disabled = state.running || !hasText;
  els.checkButton.disabled = state.running || !hasText;
  if (!els.previewInput.dataset.touched) {
    els.previewInput.value = text || "支付账户定价";
    updatePreviewText();
  }
}

function updatePreviewText() {
  els.previewLine.textContent = els.previewInput.value || "支付账户定价";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `请求失败: ${response.status}`);
  }
  return payload;
}

function renderFontSelect(select, fonts, currentRef, placeholder) {
  fonts = Array.isArray(fonts) ? fonts : [];
  const options = [`<option value="">${placeholder}</option>`];
  const labels = {
    source: "源字体",
    target: "目标字体",
    output: "生成文件",
    uploads: "上传字体",
  };
  ["source", "target", "uploads", "output"].forEach((scope) => {
    const scopedFonts = fonts.filter((font) => font.scope === scope);
    if (!scopedFonts.length) return;
    options.push(`<optgroup label="${labels[scope]}">`);
    scopedFonts.forEach((font) => {
      const selected = font.ref === currentRef ? "selected" : "";
      options.push(`<option value="${font.ref}" ${selected}>${font.name}</option>`);
    });
    options.push("</optgroup>");
  });
  select.innerHTML = options.join("");
}

function renderFontCard(slot, record) {
  const meta = slot === "source" ? els.sourceMeta : els.targetMeta;
  if (!meta) return;
  if (!record) {
    meta.textContent = "未选择";
    return;
  }
  meta.textContent = `${scopeLabel(record.scope)} / ${record.name} · ${record.sizeLabel} · ${record.modifiedLabel}`;
  if (slot === "source") {
    els.serverStatus.textContent = `源字体: ${record.name}`;
  } else if (!els.resultTitle.textContent || els.resultTitle.textContent === "暂无输出") {
    els.resultTitle.textContent = record.name;
  }
}

function renderGeneratedFonts(fonts) {
  fonts = Array.isArray(fonts) ? fonts : [];
  if (!fonts.length) {
    els.generatedList.innerHTML = `<div class="empty-list">还没有生成新的字体文件</div>`;
    return;
  }

  els.generatedList.innerHTML = fonts
    .map(
      (font) => `
        <article class="font-item">
          <div>
            <strong>${font.name}</strong>
            <small>${scopeLabel(font.scope)} / ${font.sizeLabel} · ${font.modifiedLabel}</small>
          </div>
          <div class="font-actions">
            <button class="mini-button" data-preview="${font.ref}">预览</button>
            <a class="mini-button" href="${font.downloadUrl}" download>下载</a>
          </div>
        </article>
      `
    )
    .join("");
}

function normalizeFonts(fonts) {
  const normalizeRecord = (font, fallbackScope = "output") => {
    if (!font) return null;
    const scope = font.scope === "root" ? fallbackScope : font.scope || fallbackScope;
    const ref = font.ref && !font.ref.startsWith("root:")
      ? font.ref
      : `${scope}:${font.name}`;
    const downloadUrl = font.downloadUrl && !font.downloadUrl.startsWith("/fonts/root/")
      ? font.downloadUrl
      : `/fonts/${scope}/${font.name}`;
    return {
      ...font,
      ref,
      scope,
      downloadUrl,
      isUploaded: Boolean(font.isUploaded || scope === "uploads"),
      isGenerated: Boolean(font.isGenerated || scope === "output"),
    };
  };

  const source = fonts?.source || null;
  const target = fonts?.target || null;
  const available = Array.isArray(fonts?.available)
    ? fonts.available
    : Array.isArray(fonts?.all)
      ? fonts.all
      : [];
  const normalizedAvailable = available.map((font) => normalizeRecord(font));
  const generated = (Array.isArray(fonts?.generated)
    ? fonts.generated.map((font) => normalizeRecord(font, "output"))
    : normalizedAvailable.filter((font) => font.isGenerated));
  const uploaded = (Array.isArray(fonts?.uploaded)
    ? fonts.uploaded.map((font) => normalizeRecord(font, "uploads"))
    : normalizedAvailable.filter((font) => font.isUploaded));

  return {
    ...fonts,
    source: normalizeRecord(source, "source"),
    target: normalizeRecord(target, "target"),
    available: normalizedAvailable,
    generated,
    uploaded,
  };
}

function previewFont(font) {
  if (!font) return;
  const family = `MergedFont-${font.name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  els.dynamicFont.textContent = `
    @font-face {
      font-family: "${family}";
      src: url("${font.downloadUrl}?v=${encodeURIComponent(font.modified)}") format("truetype");
      font-display: swap;
    }
  `;
  els.previewLine.style.fontFamily = `"${family}", "WorkbenchTitle", "PingFang SC", sans-serif`;
  els.resultTitle.textContent = font.name;
  els.downloadLink.href = font.downloadUrl;
  els.downloadLink.setAttribute("download", font.name);
  els.downloadLink.classList.remove("disabled");
  els.downloadLink.setAttribute("aria-disabled", "false");
}

async function refreshFonts(selectGenerated = false) {
  const payload = await requestJson("/api/fonts");
  state.fonts = normalizeFonts(payload.fonts);

  const sourceRef = els.sourceSelect.value || state.fonts.source?.ref || "";
  const targetRef = els.targetSelect.value || state.fonts.target?.ref || "";
  renderFontSelect(els.sourceSelect, state.fonts.available, sourceRef, "选择源字体");
  renderFontSelect(els.targetSelect, state.fonts.available, targetRef, "选择目标字体");
  renderGeneratedFonts(state.fonts.generated);

  const sourceRecord = state.fonts.available.find((font) => font.ref === els.sourceSelect.value);
  const targetRecord = state.fonts.available.find((font) => font.ref === els.targetSelect.value);
  renderFontCard("source", sourceRecord);
  renderFontCard("target", targetRecord);

  if (selectGenerated && state.fonts.generated.length) {
    previewFont(state.fonts.generated[0]);
  }

  return state.fonts;
}

async function uploadFont(role) {
  const input = role === "source" ? els.sourceUpload : els.targetUpload;
  const file = input.files?.[0];
  if (!file) {
    els.checkResult.textContent = "请先选择一个 TTF 文件再上传。";
    return;
  }

  setBusy(true);
  els.checkResult.textContent = `正在上传 ${file.name}...`;

  try {
    const form = new FormData();
    form.append("role", role);
    form.append("font", file);
    const response = await fetch("/api/upload", {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `上传失败: ${response.status}`);
    }
    await refreshFonts();
    const ref = payload.font.ref;
    if (role === "source") {
      els.sourceSelect.value = ref;
    } else {
      els.targetSelect.value = ref;
    }
    els.checkResult.textContent = `已上传 ${payload.font.name}`;
  } catch (error) {
    els.checkResult.textContent = error.message;
  } finally {
    input.value = "";
    setBusy(false);
  }
}

async function runCheck() {
  const text = els.textInput.value;
  if (!text.length) return;
  setBusy(true);
  setRunState("检查中", "running");
  els.jobTitle.textContent = "字符检查";
  els.logOutput.textContent = "正在检查源字体...\n";
  try {
    const payload = await requestJson("/api/check", {
      method: "POST",
      body: JSON.stringify({
        text,
        sourceRef: els.sourceSelect.value,
      }),
    });
    const result = payload.result;
    els.logOutput.textContent = result.output || "检查完成";
    els.checkResult.textContent = result.output || "检查完成";
    setRunState(result.ok ? "可合并" : "需处理", result.ok ? "done" : "failed");
    els.jobTitle.textContent = result.ok ? "字符可添加" : "存在缺失字符";
  } catch (error) {
    els.logOutput.textContent = error.message;
    els.checkResult.textContent = error.message;
    setRunState("失败", "failed");
  } finally {
    setBusy(false);
  }
}

async function startMerge() {
  const text = els.textInput.value;
  if (!text.length) return;
  setBusy(true);
  setRunState("运行中", "running");
  els.jobTitle.textContent = "merge.sh 运行中";
  els.logOutput.textContent = "正在启动 merge.sh...\n";
  els.checkResult.textContent = "合并任务运行中。";

  try {
    const payload = await requestJson("/api/merge", {
      method: "POST",
      body: JSON.stringify({
        text,
        sourceRef: els.sourceSelect.value,
        targetRef: els.targetSelect.value,
        outputName: els.outputName.value,
      }),
    });
    state.currentJobId = payload.job.id;
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    pollJob();
    state.pollTimer = window.setInterval(pollJob, 700);
  } catch (error) {
    els.logOutput.textContent = error.message;
    els.checkResult.textContent = error.message;
    setRunState("失败", "failed");
    setBusy(false);
  }
}

async function pollJob() {
  if (!state.currentJobId) return;
  try {
    const payload = await requestJson(`/api/jobs/${state.currentJobId}`);
    const job = payload.job;
    els.logOutput.textContent = job.logs.length ? job.logs.join("\n") : "等待日志...";
    els.logOutput.scrollTop = els.logOutput.scrollHeight;

    if (job.status === "running" || job.status === "queued") {
      setRunState(job.status === "queued" ? "排队中" : "运行中", "running");
      return;
    }

    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
    setBusy(false);

    if (job.status === "completed") {
      setRunState("完成", "done");
      els.jobTitle.textContent = "合并完成";
      els.checkResult.textContent = "已生成新的 TTF 文件。";
      await refreshFonts(true);
      if (job.output) previewFont(job.output);
    } else {
      setRunState("失败", "failed");
      els.jobTitle.textContent = `合并失败 (${job.exitCode ?? "unknown"})`;
      els.checkResult.textContent = "合并失败，请查看运行日志。";
      await refreshFonts();
    }
  } catch (error) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
    setBusy(false);
    els.logOutput.textContent = error.message;
    els.checkResult.textContent = error.message;
    setRunState("失败", "failed");
  }
}

function bindEvents() {
  els.textInput.addEventListener("input", updateCounts);
  els.previewInput.addEventListener("input", () => {
    els.previewInput.dataset.touched = "true";
    updatePreviewText();
  });
  els.sourceSelect.addEventListener("change", () => {
    const font = state.fonts?.available.find((item) => item.ref === els.sourceSelect.value);
    renderFontCard("source", font);
  });
  els.targetSelect.addEventListener("change", () => {
    const font = state.fonts?.available.find((item) => item.ref === els.targetSelect.value);
    renderFontCard("target", font);
  });

  els.checkButton.addEventListener("click", runCheck);
  els.mergeButton.addEventListener("click", startMerge);
  els.clearButton.addEventListener("click", () => {
    els.textInput.value = "";
    els.previewInput.dataset.touched = "";
    updateCounts();
    els.textInput.focus();
  });
  els.refreshButton.addEventListener("click", () => refreshFonts(true));
  els.sourceUploadButton.addEventListener("click", () => uploadFont("source"));
  els.targetUploadButton.addEventListener("click", () => uploadFont("target"));

  document.querySelectorAll("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      els.textInput.value = button.dataset.sample;
      els.previewInput.dataset.touched = "";
      updateCounts();
      els.textInput.focus();
    });
  });

  els.generatedList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-preview]");
    if (!button) return;
    const font = state.fonts?.available.find((item) => item.ref === button.dataset.preview);
    previewFont(font);
  });
}

async function boot() {
  bindEvents();
  updateCounts();
  updatePreviewText();
  setBusy(false);
  try {
    await refreshFonts(true);
    const sourceFont = state.fonts?.available.find((item) => item.ref === els.sourceSelect.value);
    const targetFont = state.fonts?.available.find((item) => item.ref === els.targetSelect.value);
    renderFontCard("source", sourceFont);
    renderFontCard("target", targetFont);
  } catch (error) {
    els.serverStatus.textContent = "服务连接异常";
    els.serverStatus.style.color = "#a9331d";
    els.logOutput.textContent = error.message;
  }
}

boot();
