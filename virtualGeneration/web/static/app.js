"use strict";

const $ = (s) => document.querySelector(s);

// 字段中文标签
const LABELS = {
  plate: "号牌号码",
  vehicle_type: "车辆类型",
  owner: "所有人",
  address: "住址",
  use_char: "使用性质",
  model: "品牌型号",
  vin: "车辆识别代号",
  engine: "发动机号码",
  register_date: "注册日期",
  issue_date: "发证日期",
  file_no: "档案编号",
  passengers: "核定载人数",
  gross_mass: "总质量",
  curb_mass: "整备质量",
  load_mass: "核定载质量",
  dimensions: "外廓尺寸",
  traction_mass: "准牵引总质量",
  inspect_year: "检验有效期(年)",
  inspect_month: "检验有效期(月)",
};

const ORDER = Object.keys(LABELS);

const ID_LABELS = {
  name: "姓名",
  gender: "性别",
  nation: "民族",
  birth_year: "出生年",
  birth_month: "出生月",
  birth_day: "出生日",
  address: "住址",
  id_no: "公民身份号码",
};

const ID_ORDER = Object.keys(ID_LABELS);

let currentRecord = null;
let currentIdRecord = null;

function setStatus(msg, kind) {
  const s = $("#d-status");
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
}

function setIdStatus(msg, kind) {
  const s = $("#i-status");
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
}

function switchModule(mod) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mod === mod);
  });
  document.querySelectorAll(".module").forEach((section) => {
    section.classList.toggle("hidden", section.id !== "mod-" + mod);
  });
}

// 渲染记录为可编辑表单
function renderRecord(rec) {
  currentRecord = rec;
  const box = $("#d-record");
  box.innerHTML = "";
  for (const key of ORDER) {
    if (!(key in rec)) continue;
    const label = document.createElement("label");
    label.textContent = LABELS[key];
    const input = document.createElement("input");
    input.value = rec[key];
    input.dataset.key = key;
    input.addEventListener("change", () => {
      currentRecord[key] = input.value;
    });
    label.append(input);
    box.append(label);
  }
  $("#d-record-card").classList.remove("hidden");
}

function renderIdRecord(rec) {
  currentIdRecord = rec;
  const box = $("#i-record");
  box.innerHTML = "";
  for (const key of ID_ORDER) {
    if (!(key in rec)) continue;
    const label = document.createElement("label");
    label.textContent = ID_LABELS[key];
    const input = document.createElement("input");
    input.value = rec[key];
    input.dataset.key = key;
    input.addEventListener("change", () => {
      currentIdRecord[key] = input.value;
    });
    label.append(input);
    box.append(label);
  }
  $("#i-record-card").classList.remove("hidden");
}

async function doRandom() {
  setStatus("生成随机记录中…");
  const body = {
    plate: $("#d-plate").value.trim() || null,
    owner: $("#d-owner").value.trim() || null,
  };
  let res;
  try {
    res = await fetch("/api/driver/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return setStatus("网络错误: " + e.message, "error");
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return setStatus(d.detail || "随机生成失败", "error");
  }
  const rec = await res.json();
  renderRecord(rec);
  setStatus("已生成随机记录，可编辑后点生成", "ok");
}

async function doGenerate() {
  // 没记录则先随机一份
  if (!currentRecord) {
    await doRandom();
    if (!currentRecord) return;
  }
  // 同步号牌/所有人输入框（优先用户输入）
  const plate = $("#d-plate").value.trim();
  const owner = $("#d-owner").value.trim();
  if (plate) currentRecord.plate = plate;
  if (owner) currentRecord.owner = owner;

  setStatus("渲染中…");
  let res;
  try {
    res = await fetch("/api/driver/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentRecord),
    });
  } catch (e) {
    return setStatus("网络错误: " + e.message, "error");
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return setStatus(d.detail || "渲染失败", "error");
  }
  const data = await res.json();
  const front = "data:image/png;base64," + data.front_png;
  const back = "data:image/png;base64," + data.back_png;
  $("#d-front").src = front;
  $("#d-back").src = back;
  $("#d-front-dl").href = front;
  $("#d-back-dl").href = back;
  $("#d-result-card").classList.remove("hidden");
  setStatus("生成成功", "ok");
}

async function doIdRandom() {
  setIdStatus("生成随机记录中…");
  const body = { name: $("#i-name").value.trim() || null };
  let res;
  try {
    res = await fetch("/api/idcard/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return setIdStatus("网络错误: " + e.message, "error");
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return setIdStatus(d.detail || "随机生成失败", "error");
  }
  const rec = await res.json();
  renderIdRecord(rec);
  setIdStatus("已生成随机记录，可编辑后点生成", "ok");
}

async function doIdGenerate() {
  if (!currentIdRecord) {
    await doIdRandom();
    if (!currentIdRecord) return;
  }
  const name = $("#i-name").value.trim();
  if (name) currentIdRecord.name = name;

  setIdStatus("渲染中…");
  let res;
  try {
    res = await fetch("/api/idcard/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentIdRecord),
    });
  } catch (e) {
    return setIdStatus("网络错误: " + e.message, "error");
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return setIdStatus(d.detail || "渲染失败", "error");
  }
  const data = await res.json();
  const front = "data:image/png;base64," + data.front_png;
  const back = "data:image/png;base64," + data.back_png;
  $("#i-front").src = front;
  $("#i-back").src = back;
  $("#i-front-dl").href = front;
  $("#i-back-dl").href = back;
  $("#i-result-card").classList.remove("hidden");
  setIdStatus("生成成功", "ok");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchModule(tab.dataset.mod));
});
$("#d-random").addEventListener("click", doRandom);
$("#d-generate").addEventListener("click", doGenerate);
$("#i-random").addEventListener("click", doIdRandom);
$("#i-generate").addEventListener("click", doIdGenerate);
