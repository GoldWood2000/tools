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

let currentRecord = null;

function setStatus(msg, kind) {
  const s = $("#d-status");
  s.textContent = msg;
  s.className = "status" + (kind ? " " + kind : "");
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

$("#d-random").addEventListener("click", doRandom);
$("#d-generate").addEventListener("click", doGenerate);
