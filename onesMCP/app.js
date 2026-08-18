const demoProjects = [
  { id: "PRJ-1", name: "ONES AI 助手", iterations: ["Sprint 24 · AI 工作流", "Sprint 23 · 工具体验", "Sprint 22 · 基础能力"] },
  { id: "PRJ-2", name: "企业协作平台", iterations: ["Sprint 18 · 权限升级", "Sprint 17 · 搜索优化"] },
  { id: "PRJ-3", name: "移动端体验", iterations: ["Sprint 09 · 离线能力", "Sprint 08 · 性能体验"] },
];

const baseIssues = [
  { id: "AI-248", title: "完善 MCP 工具授权失败时的引导", type: "任务", priority: "高", status: "进行中", assignee: "陈康", initials: "CK", relation: ["assigned", "reported"], due: "今天", dueSoon: true, blocked: false },
  { id: "AI-241", title: "支持按迭代筛选与我相关的事项", type: "需求", priority: "高", status: "待开始", assignee: "陈康", initials: "CK", relation: ["assigned"], due: "08-19", dueSoon: true, blocked: false },
  { id: "AI-239", title: "批量状态流转增加失败回执", type: "任务", priority: "中", status: "进行中", assignee: "陈康", initials: "CK", relation: ["reported"], due: "08-20", dueSoon: false, blocked: true },
  { id: "AI-235", title: "修复 OAuth 回调后页面状态丢失", type: "缺陷", priority: "高", status: "进行中", assignee: "林晓", initials: "LX", relation: ["reported"], due: "今天", dueSoon: true, blocked: false },
  { id: "AI-228", title: "统一工作流状态标签的视觉规范", type: "需求", priority: "中", status: "已完成", assignee: "陈康", initials: "CK", relation: ["assigned"], due: "08-16", dueSoon: false, blocked: false },
  { id: "AI-222", title: "项目选择器支持最近访问排序", type: "任务", priority: "低", status: "待开始", assignee: "周林", initials: "ZL", relation: ["reported"], due: "08-22", dueSoon: false, blocked: false },
  { id: "AI-219", title: "补充 MCP 客户端接入说明", type: "任务", priority: "中", status: "已完成", assignee: "陈康", initials: "CK", relation: ["assigned", "reported"], due: "08-15", dueSoon: false, blocked: false },
  { id: "AI-213", title: "工作台空状态与错误状态设计", type: "需求", priority: "低", status: "待开始", assignee: "陈康", initials: "CK", relation: ["assigned"], due: "08-23", dueSoon: false, blocked: false },
];

const projectIssueSets = {
  "PRJ-1": { prefix: "AI", titles: baseIssues.map((issue) => issue.title) },
  "PRJ-2": { prefix: "COL", titles: [
    "补齐外部成员的项目访问边界", "权限变更增加影响范围预览", "修复成员组同步偶发失败",
    "搜索结果支持按空间权限过滤", "统一角色与权限组命名", "增加权限审计导出", "优化成员选择器加载速度",
  ] },
  "PRJ-3": { prefix: "APP", titles: [
    "离线状态下支持编辑事项草稿", "弱网环境优化附件上传队列", "修复返回前台后列表闪烁",
    "压缩首屏关键资源体积", "统一移动端空状态体验", "补充手势操作的无障碍提示",
  ] },
};

let projects = structuredClone(demoProjects);
let issues = structuredClone(baseIssues);
let selected = new Set();
let history = [];
let connectionMode = "demo";
let workflowStatuses = [];
let workflowPlan = null;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const elements = {
  connectView: $("#connect-view"), appShell: $("#app-shell"), connectForm: $("#connect-form"), demoButton: $("#demo-button"),
  serverUrl: $("#server-url"), formError: $("#form-error"),
  project: $("#project-select"), iteration: $("#iteration-select"), scope: $("#scope-select"), search: $("#search-input"),
  statusFilter: $("#status-filter"), body: $("#issues-body"), empty: $("#empty-state"), selectAll: $("#select-all"),
  bulkBar: $("#bulk-bar"), targetStatus: $("#target-status"), updateButton: $("#update-button"), updateDialog: $("#update-dialog"),
  planLoading: $("#plan-loading"), workflowSummary: $("#workflow-summary"), workflowPlan: $("#workflow-plan"), confirmUpdate: $("#confirm-update"),
  historyDialog: $("#history-dialog"), historyList: $("#history-list"), toastStack: $("#toast-stack"),
};

function sortedStatuses(statuses) {
  return [...statuses]
    .filter((status) => status?.id && status?.name)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function renderTargetStatuses() {
  elements.targetStatus.innerHTML = `<option value="">请选择目标状态</option>${workflowStatuses.map((status) => `<option value="${escapeHtml(status.id)}">${escapeHtml(status.name)}</option>`).join("")}`;
}

function issueWorkflowInput(issue) {
  return {
    id: issue.id,
    key: issue.key || issue.id,
    title: issue.title,
    type: issue.type,
    typeId: issue.typeId,
    status: issue.status,
    statusId: issue.statusId,
  };
}

function initializeProjects() {
  elements.project.innerHTML = projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("");
  updateIterations();
}

function updateIterations() {
  const project = projects.find((item) => item.id === elements.project.value) || projects[0];
  if (connectionMode === "real") {
    elements.iteration.innerHTML = `<option value="all">正在载入迭代…</option>`;
    return;
  }
  elements.iteration.innerHTML = project.iterations.map((name, index) => `<option value="${index}">${escapeHtml(name)}</option>`).join("");
}

function loadIssuesForSelection() {
  const config = projectIssueSets[elements.project.value] || projectIssueSets["PRJ-1"];
  const iterationOffset = Number(elements.iteration.value || 0);
  const count = Math.max(4, config.titles.length - iterationOffset);
  issues = baseIssues.slice(0, count).map((issue, index) => ({
    ...structuredClone(issue),
    id: `${config.prefix}-${248 - index * 7}`,
    title: config.titles[index],
  }));
}

function visibleIssues() {
  const query = elements.search.value.trim().toLowerCase();
  const scope = elements.scope.value;
  const status = elements.statusFilter.value;
  const iterationId = elements.iteration.value;
  return issues.filter((issue) => {
    const matchesScope = scope === "related" || issue.relation.includes(scope);
    const matchesStatus = status === "all" || issue.status === status;
    const matchesIteration = connectionMode !== "real" || iterationId === "all" || issue.iterationId === iterationId;
    const matchesQuery = !query || `${issue.id} ${issue.title}`.toLowerCase().includes(query);
    return matchesScope && matchesStatus && matchesIteration && matchesQuery;
  });
}

function statusClass(status) {
  return { "待开始": "status-todo", "进行中": "status-progress", "已完成": "status-done" }[status] || "status-todo";
}

function typeClass(type) {
  return type === "缺陷" ? "bug" : type === "需求" ? "story" : "task";
}

function renderIssues() {
  const visible = visibleIssues();
  elements.body.innerHTML = visible.map((issue) => `
    <tr class="${selected.has(issue.id) ? "is-selected" : ""}">
      <td><input class="issue-check" type="checkbox" value="${escapeHtml(issue.id)}" aria-label="选择 ${escapeHtml(issue.key || issue.id)}" ${selected.has(issue.id) ? "checked" : ""} /></td>
      <td><div class="issue-cell"><span class="issue-type ${typeClass(issue.type)}">${escapeHtml(issue.type.slice(0, 1))}</span><div class="issue-copy"><strong title="${escapeHtml(issue.title)}">${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.key || issue.id)} · ${escapeHtml(issue.type)}</small></div></div></td>
      <td><span class="priority ${issue.priority === "高" ? "high" : issue.priority === "中" ? "medium" : "low"}"><i></i>${escapeHtml(issue.priority)}</span></td>
      <td><span class="status-pill ${statusClass(issue.status)}">${escapeHtml(issue.status)}</span></td>
      <td><span class="assignee"><span class="avatar avatar-photo">${escapeHtml(issue.initials)}</span>${escapeHtml(issue.assignee)}</span></td>
      <td><span class="date ${issue.dueSoon && issue.status !== "已完成" ? "is-due" : ""}">${escapeHtml(issue.due)}</span></td>
      <td><button class="icon-button row-menu" type="button" aria-label="${escapeHtml(issue.key || issue.id)} 更多操作"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button></td>
    </tr>`).join("");

  elements.body.closest(".table-wrap").hidden = visible.length === 0;
  elements.empty.hidden = visible.length !== 0;
  $("#result-count").textContent = `${visible.length} 项`;
  $("#table-caption").textContent = visible.length ? `显示 1–${visible.length}，共 ${visible.length} 项` : "显示 0 项";
  elements.selectAll.checked = visible.length > 0 && visible.every((issue) => selected.has(issue.id));
  elements.selectAll.indeterminate = visible.some((issue) => selected.has(issue.id)) && !elements.selectAll.checked;

  document.querySelectorAll(".issue-check").forEach((checkbox) => checkbox.addEventListener("change", () => {
    checkbox.checked ? selected.add(checkbox.value) : selected.delete(checkbox.value);
    renderIssues();
    updateBulkBar();
  }));
  renderMetrics();
}

function renderMetrics() {
  const iterationId = elements.iteration.value;
  const related = issues.filter((issue) => issue.relation.length && (connectionMode !== "real" || iterationId === "all" || issue.iterationId === iterationId));
  const progress = related.filter((issue) => issue.status === "进行中");
  const done = related.filter((issue) => issue.status === "已完成");
  $("#metric-total").textContent = related.length;
  $("#metric-progress").textContent = progress.length;
  $("#metric-blocked").textContent = progress.filter((issue) => issue.blocked).length;
  $("#metric-done").textContent = done.length;
  $("#metric-due").textContent = related.filter((issue) => issue.dueSoon && issue.status !== "已完成").length;
  $("#completion-rate").textContent = `${related.length ? Math.round((done.length / related.length) * 100) : 0}%`;
}

function updateBulkBar() {
  const count = selected.size;
  elements.bulkBar.classList.toggle("is-visible", count > 0);
  $("#selection-count").textContent = count;
  $("#selection-label").textContent = count;
  elements.updateButton.disabled = count === 0 || !elements.targetStatus.value;
}

async function api(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
    error.details = data.details;
    throw error;
  }
  return data;
}

async function getApi(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data;
}

async function loadRemoteProject({ notify = true } = {}) {
  const project = projects.find((item) => item.id === elements.project.value) || projects[0];
  if (!project) return;
  elements.iteration.innerHTML = `<option value="all">正在载入迭代…</option>`;
  elements.body.innerHTML = `<tr><td colspan="7"><div class="loading-row"><i></i><span>正在从 ONES MCP 读取事项…</span></div></td></tr>`;
  elements.body.closest(".table-wrap").hidden = false;
  elements.empty.hidden = true;
  try {
    const data = await api("/api/issues", { projectId: project.id });
    issues = data.issues || [];
    const iterations = data.iterations || [];
    workflowStatuses = sortedStatuses(data.statuses || []);
    const statuses = [...new Set(issues.map((issue) => issue.status).filter((status) => status && status !== "未知状态"))].sort((left, right) => left.localeCompare(right, "zh-CN"));
    elements.iteration.innerHTML = `<option value="all">全部迭代</option>${iterations.map((iteration) => `<option value="${escapeHtml(iteration.id)}">${escapeHtml(iteration.name)}</option>`).join("")}`;
    elements.statusFilter.innerHTML = `<option value="all">全部状态</option>${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}`;
    renderTargetStatuses();
    workflowPlan = null;
    selected.clear();
    renderIssues();
    updateBulkBar();
    if (notify) showToast("真实数据已同步", `已读取 ${issues.length} 个事项和 ${iterations.length} 个迭代`);
  } catch (error) {
    issues = [];
    renderIssues();
    showToast("同步失败", error.message);
  }
}

function enterApp(mode) {
  connectionMode = mode;
  elements.connectView.hidden = true;
  elements.appShell.hidden = false;
  initializeProjects();
  if (mode === "demo") {
    workflowStatuses = [
      { id: "demo-todo", name: "待开始" },
      { id: "demo-progress", name: "进行中" },
      { id: "demo-done", name: "已完成" },
    ];
    renderTargetStatuses();
    loadIssuesForSelection();
  }
  else issues = [];
  const badge = $("#environment-badge");
  badge.classList.toggle("is-live", mode === "real");
  badge.lastChild.textContent = mode === "real" ? " 真实环境" : " 演示数据";
  elements.scope.disabled = mode === "real";
  elements.scope.options[0].textContent = mode === "real" ? "MCP 查询结果" : "与我相关";
  renderIssues();
  updateBulkBar();
  if (mode === "demo") showToast("演示数据已载入", "当前操作不会影响真实 ONES 数据");
}

function showToast(title, detail) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></svg></span><div><strong>${title}</strong><small>${detail}</small></div>`;
  elements.toastStack.append(toast);
  window.setTimeout(() => toast.classList.add("is-leaving"), 3200);
  window.setTimeout(() => toast.remove(), 3440);
}

function demoWorkflowPreview(selectedIssues, targetStatusId) {
  const statusIndex = new Map(workflowStatuses.map((status, index) => [status.id, index]));
  const nameToStatus = new Map(workflowStatuses.map((status) => [status.name, status]));
  const target = workflowStatuses.find((status) => status.id === targetStatusId);
  const items = selectedIssues.map((issue) => {
    const current = nameToStatus.get(issue.status) || workflowStatuses[0];
    const common = {
      ...issueWorkflowInput(issue),
      currentStatusId: current.id,
      currentStatusName: current.name,
      targetStatusId: target.id,
      targetStatusName: target.name,
    };
    const currentIndex = statusIndex.get(current.id);
    const targetIndex = statusIndex.get(target.id);
    if (currentIndex === targetIndex) return { ...common, state: "skip", reason: "已经处于目标节点", path: [], allowedTargets: [] };
    const allowedTargets = workflowStatuses.slice(currentIndex + 1).map((status, index) => ({
      ...status,
      path: workflowStatuses.slice(currentIndex + 1, currentIndex + index + 2).map((next, stepIndex) => ({
        id: `demo-${currentIndex + stepIndex}`,
        startId: workflowStatuses[currentIndex + stepIndex].id,
        startName: workflowStatuses[currentIndex + stepIndex].name,
        endId: next.id,
        endName: next.name,
      })),
    }));
    const chosen = allowedTargets.find((status) => status.id === target.id);
    if (chosen) return { ...common, state: "ready", reason: "正向路径已确认", path: chosen.path, allowedTargets: [] };
    return { ...common, state: "todo", reason: "目标节点位于当前节点之前，不能回退", path: [], allowedTargets };
  });
  return { statuses: workflowStatuses, targetStatusId, targetStatusName: target.name, items };
}

function workflowPathText(item) {
  return [item.currentStatusName, ...(item.path || []).map((step) => step.endName || step.endId)].filter(Boolean).join(" → ");
}

function renderWorkflowPlan() {
  const items = workflowPlan?.items || [];
  const counts = items.reduce((result, item) => ({ ...result, [item.state]: (result[item.state] || 0) + 1 }), {});
  elements.workflowSummary.innerHTML = `
    <span class="is-ready">可执行 ${counts.ready || 0}</span>
    <span class="is-todo">待处理 ${counts.todo || 0}</span>
    <span>无需处理 ${counts.skip || 0}</span>`;
  elements.workflowPlan.innerHTML = items.map((item, index) => {
    const stateLabel = item.state === "ready" ? "✓" : item.state === "skip" ? "—" : "!";
    let detail = `<div class="plan-path">${escapeHtml(workflowPathText(item))}</div>`;
    if (item.state === "skip") detail = `<div class="plan-path">${escapeHtml(item.reason || "无需处理")}</div>`;
    if (item.state === "todo") {
      const options = (item.allowedTargets || []).map((target) => `<option value="${escapeHtml(target.id)}">推进到 ${escapeHtml(target.name)}</option>`).join("");
      detail = `<label class="plan-todo"><span>${escapeHtml(item.reason || "无法确认正向路径")}</span><select class="todo-target" data-plan-index="${index}" ${options ? "" : "disabled"}><option value="">${options ? "重新选择可达节点" : "没有已确认的可达节点"}</option>${options}</select></label>`;
    }
    return `<article class="workflow-plan-item is-${escapeHtml(item.state)}">
      <span class="plan-state">${stateLabel}</span>
      <div class="plan-issue"><strong title="${escapeHtml(item.title)}">${escapeHtml(item.key || item.id)} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.currentStatusName)} · ${escapeHtml(item.type || "事项")}</small></div>
      ${detail}
    </article>`;
  }).join("");
  elements.confirmUpdate.disabled = Boolean(counts.todo) || !counts.ready;
}

async function openUpdateDialog() {
  const chosenStatus = workflowStatuses.find((status) => status.id === elements.targetStatus.value);
  if (!chosenStatus || !selected.size) return;
  $("#dialog-count").textContent = selected.size;
  const pill = $("#dialog-target");
  pill.textContent = chosenStatus.name;
  pill.className = `status-pill ${statusClass(chosenStatus.name)}`;
  $("#dialog-copy").hidden = false;
  $("#dialog-icon").hidden = false;
  $("#progress-view").hidden = true;
  $("#dialog-actions").hidden = false;
  $("#dialog-close").hidden = false;
  elements.planLoading.hidden = false;
  elements.workflowSummary.innerHTML = "";
  elements.workflowPlan.innerHTML = "";
  elements.confirmUpdate.disabled = true;
  workflowPlan = null;
  elements.updateDialog.showModal();
  const selectedIssues = [...selected].map((id) => issues.find((issue) => issue.id === id)).filter(Boolean);
  try {
    workflowPlan = connectionMode === "real"
      ? await api("/api/issues/workflows/preview", {
        projectId: elements.project.value,
        targetStatusId: chosenStatus.id,
        issues: selectedIssues.map(issueWorkflowInput),
        catalog: issues.map(issueWorkflowInput),
      })
      : demoWorkflowPreview(selectedIssues, chosenStatus.id);
    renderWorkflowPlan();
  } catch (error) {
    elements.workflowSummary.innerHTML = `<span class="is-todo">预检失败</span>`;
    elements.workflowPlan.innerHTML = `<div class="plan-error">${escapeHtml(error.message)}</div>`;
    showToast("工作流预检失败", error.message);
  } finally {
    elements.planLoading.hidden = true;
  }
}

async function runBatchUpdate() {
  const readyItems = (workflowPlan?.items || []).filter((item) => item.state === "ready");
  if (!readyItems.length || (workflowPlan?.items || []).some((item) => item.state === "todo")) return;
  const targetNames = [...new Set(readyItems.map((item) => item.targetStatusName).filter(Boolean))];
  const target = targetNames.length === 1 ? targetNames[0] : "各事项计划节点";
  const progressBar = $("#progress-bar");
  $("#dialog-copy").hidden = true;
  $("#dialog-icon").hidden = true;
  $("#progress-view").hidden = false;
  $("#dialog-actions").hidden = true;
  $("#dialog-close").hidden = true;
  let succeeded = 0;
  let skipped = 0;
  const failureReasons = [];

  for (let index = 0; index < readyItems.length; index += 1) {
    const planItem = readyItems[index];
    const issue = issues.find((item) => item.id === planItem.id);
    if (connectionMode === "real") {
      try {
        const response = await api("/api/issues/workflows/execute", {
          projectId: elements.project.value,
          items: [{
            issueId: planItem.id,
            currentStatusId: planItem.currentStatusId,
            targetStatusId: planItem.targetStatusId,
            path: planItem.path,
          }],
        });
        const result = response.results?.[0];
        if (result?.finalStatusId) {
          issue.statusId = result.finalStatusId;
          issue.status = result.finalStatusName || issue.status;
        }
        if (result?.updated) {
          succeeded += 1;
        } else {
          skipped += 1;
          failureReasons.push(`${issue.key || issue.id}：${result?.reason || "工作流不可用，已转为 TODO"}`);
        }
      } catch (error) {
        skipped += 1;
        failureReasons.push(`${issue.key || issue.id}：${error.message}`);
      }
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      issue.statusId = planItem.targetStatusId;
      issue.status = planItem.targetStatusName;
      issue.blocked = false;
      succeeded += 1;
    }
    const current = index + 1;
    const percent = Math.round((current / readyItems.length) * 100);
    progressBar.style.width = `${percent}%`;
    $("#progress-detail").textContent = `${current} / ${readyItems.length}`;
    $("#progress-percent").textContent = `${percent}%`;
    $("#progress-copy").textContent = `正在处理 ${issue.key || issue.id} · ${issue.title}`;
  }

  history.unshift({ count: readyItems.length, target, succeeded, skipped, time: new Date() });
  selected.clear();
  renderIssues();
  updateBulkBar();
  renderHistory();
  $("#record-count").textContent = history.length;
  $("#progress-title").textContent = "工作流更新完成";
  $("#progress-copy").textContent = skipped ? `${succeeded} 项成功，${skipped} 项转为 TODO。${failureReasons[0] || "工作流已发生变化。"}` : `${succeeded} 个事项已按预检路径更新。`;
  window.setTimeout(() => {
    elements.updateDialog.close();
    $("#dialog-close").hidden = false;
    progressBar.style.width = "0";
    $("#progress-title").textContent = "正在更新工作流";
    showToast("批量更新完成", skipped ? `${succeeded} 项成功，${skipped} 项转为 TODO` : `${succeeded} 项已完成正常流转`);
  }, 900);
}

function renderHistory() {
  if (!history.length) {
    elements.historyList.innerHTML = `<div class="history-empty">还没有批量执行记录。</div>`;
    return;
  }
  elements.historyList.innerHTML = history.map((item) => `
    <article class="history-item">
      <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></svg></span>
      <div><strong>${item.count} 项批量更新为「${item.target}」</strong><small>${item.succeeded} 项成功${item.skipped ? ` · ${item.skipped} 项跳过` : ""}</small></div>
      <time>${item.time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
    </article>`).join("");
}

elements.connectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  elements.formError.textContent = "";
  const button = elements.connectForm.querySelector('[type="submit"]');
  button.disabled = true;
  button.querySelector("span").textContent = "正在跳转 ONES…";
  window.location.assign("/api/oauth/start");
});

elements.demoButton.addEventListener("click", () => {
  projects = structuredClone(demoProjects);
  enterApp("demo");
});
elements.project.addEventListener("change", async () => {
  selected.clear();
  updateBulkBar();
  if (connectionMode === "real") await loadRemoteProject();
  else { updateIterations(); loadIssuesForSelection(); renderIssues(); showToast("项目已切换", `已载入「${elements.project.selectedOptions[0].text}」`); }
});
elements.iteration.addEventListener("change", () => {
  selected.clear();
  if (connectionMode === "demo") loadIssuesForSelection();
  renderIssues();
  updateBulkBar();
  showToast("迭代已切换", elements.iteration.selectedOptions[0].text);
});
[elements.scope, elements.statusFilter].forEach((select) => select.addEventListener("change", () => { selected.clear(); renderIssues(); updateBulkBar(); }));
elements.search.addEventListener("input", renderIssues);
elements.selectAll.addEventListener("change", () => {
  visibleIssues().forEach((issue) => elements.selectAll.checked ? selected.add(issue.id) : selected.delete(issue.id));
  renderIssues();
  updateBulkBar();
});
$("#clear-selection").addEventListener("click", () => { selected.clear(); renderIssues(); updateBulkBar(); });
elements.updateButton.addEventListener("click", openUpdateDialog);
elements.targetStatus.addEventListener("change", () => {
  workflowPlan = null;
  updateBulkBar();
});
elements.workflowPlan.addEventListener("change", (event) => {
  const select = event.target.closest(".todo-target");
  if (!select || !workflowPlan) return;
  const item = workflowPlan.items[Number(select.dataset.planIndex)];
  const target = item?.allowedTargets?.find((candidate) => candidate.id === select.value);
  if (!item || !target) return;
  item.state = "ready";
  item.reason = "已重新选择可达节点";
  item.targetStatusId = target.id;
  item.targetStatusName = target.name;
  item.path = target.path;
  renderWorkflowPlan();
});
$("#cancel-update").addEventListener("click", () => elements.updateDialog.close());
$("#dialog-close").addEventListener("click", () => elements.updateDialog.close());
elements.confirmUpdate.addEventListener("click", runBatchUpdate);
$("#refresh-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.firstElementChild.style.transform = "rotate(180deg)";
  if (connectionMode === "real") await loadRemoteProject({ notify: false });
  else await new Promise((resolve) => window.setTimeout(resolve, 650));
  try {
    button.disabled = false;
    button.firstElementChild.style.transform = "";
    $("#last-updated").textContent = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    $("#sync-time").textContent = "刚刚同步";
    showToast("同步完成", "项目、迭代和事项均为最新状态");
  } finally {
    button.disabled = false;
    button.firstElementChild.style.transform = "";
  }
});
$("#record-button").addEventListener("click", () => { renderHistory(); elements.historyDialog.showModal(); });
$("#history-close").addEventListener("click", () => elements.historyDialog.close());
$("#disconnect-button").addEventListener("click", async () => {
  if (connectionMode === "real") await api("/api/disconnect").catch(() => {});
  window.location.reload();
});
$("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("is-open"));

renderHistory();

async function restoreOauthSession() {
  const params = new URLSearchParams(window.location.search);
  try {
    const session = await getApi("/api/session");
    if (!session.connected) return;
    if (!session.projects?.length) throw new Error("OAuth 已完成，但没有读取到项目数据");
    projects = session.projects;
    enterApp("real");
    await loadRemoteProject({ notify: false });
    if (params.get("oauth") === "success") showToast("ONES OAuth 授权成功", `已读取 ${projects.length} 个项目`);
    window.history.replaceState({}, "", "/");
  } catch (error) {
    elements.formError.textContent = error.message;
  }
}

restoreOauthSession();
