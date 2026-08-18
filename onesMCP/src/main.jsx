import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import SpotlightCard from "./components/react-bits/SpotlightCard.jsx";
import CountUp from "./components/react-bits/CountUp.jsx";
import StarBorder from "./components/react-bits/StarBorder.jsx";
import Select from "./components/ui/Select.jsx";
import "../styles.css";

let toastSequence = 0;

const statusClass = (status) => /完成|关闭|done/i.test(status) ? "status-done" : /中|进行|实现|测试|研发/i.test(status) ? "status-progress" : "status-todo";
const typeClass = (type) => type === "缺陷" ? "bug" : type === "需求" ? "story" : "task";
const issueInput = (issue) => ({ id: issue.id, key: issue.key || issue.id, title: issue.title, type: issue.type, typeId: issue.typeId, status: issue.status, statusId: issue.statusId });
const sortedStatuses = (statuses) => [...statuses].filter((item) => item?.id && item?.name).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

async function post(path, body = {}) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data;
}

async function get(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data;
}

function Brand({ dark = false }) {
  return <a className={`brand ${dark ? "brand-on-dark" : ""}`} href="#"><span className="brand-mark"><i /><i /></span>Orbit</a>;
}

function Modal({ open, onClose, className = "", children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    if (!open && ref.current.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} className={`dialog ${className}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>{children}</dialog>;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="runtime-error"><h1>页面加载失败</h1><p>{this.state.error.message}</p></main>;
    return this.props.children;
  }
}

function WorkflowRail({ item }) {
  const nodes = [item.currentStatusName, ...(item.path || []).map((step) => step.endName || step.endId)].filter(Boolean);
  return <div className="workflow-rail" aria-label={nodes.join(" 到 ")}>{nodes.map((node, index) => <React.Fragment key={`${node}-${index}`}><span className={index === nodes.length - 1 ? "is-target" : ""}>{node}</span>{index < nodes.length - 1 && <i>→</i>}</React.Fragment>)}</div>;
}

function ConnectView({ error }) {
  const popupRef = useRef(null);
  const pollRef = useRef(null);
  const [oauthStatus, setOauthStatus] = useState("idle");
  const [oauthHint, setOauthHint] = useState("");

  function stopPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function finishOauth() {
    stopPolling();
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    window.location.reload();
  }

  function startPolling() {
    stopPolling();
    let elapsed = 0;
    let checking = false;
    pollRef.current = window.setInterval(async () => {
      if (checking) return;
      checking = true;
      elapsed += 1000;
      try {
        const session = await get("/api/session");
        if (session.connected) return finishOauth();
        if (session.error) {
          stopPolling();
          setOauthStatus("error");
          setOauthHint(session.error);
          return;
        }
        if (popupRef.current?.closed) {
          stopPolling();
          setOauthStatus("error");
          setOauthHint("授权窗口已关闭，但尚未完成授权。请重新打开授权窗口。");
        } else if (elapsed >= 10_000) {
          setOauthStatus("attention");
          setOauthHint("如果窗口停在“已授权 MCP 客户端”管理页，请使用下方按钮重新创建授权会话。");
        }
      } catch (requestError) {
        setOauthStatus("error");
        setOauthHint(requestError.message);
      } finally {
        checking = false;
      }
    }, 1000);
  }

  function openOauth(fresh = false) {
    const width = 600;
    const height = 760;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const path = new URL(`/api/oauth/start${fresh ? "?fresh=1" : ""}`, window.location.origin).href;
    let popup = popupRef.current && !popupRef.current.closed ? popupRef.current : null;
    if (!popup) popup = window.open("about:blank", "orbit-ones-oauth", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      window.location.assign(`/api/oauth/start${fresh ? "?fresh=1" : ""}`);
      return;
    }
    popupRef.current = popup;
    try { popup.opener = null; } catch {}
    try { popup.location.replace(path); } catch { popup.location.href = path; }
    popup.focus();
    setOauthStatus("waiting");
    setOauthHint("请在授权窗口中选择团队、配置授权范围并同意授权。");
    startPolling();
  }

  useEffect(() => () => stopPolling(), []);

  return <section className="connect-view">
    <div className="connect-backdrop"><span className="glow glow-one" /><span className="glow glow-two" /><span className="grid" /></div>
    <div className="connect-intro"><Brand dark /><div className="intro-copy"><span className="eyebrow eyebrow-dark"><i /> ONES ITERATION DESK</span><h1>把迭代里的杂音，<br />变成一次清晰的行动。</h1><p>聚合与你相关的事项，先验证每条工作流，再安全地把任务推进到目标节点。</p></div><div className="feature-row"><span>项目聚合</span><i /><span>路径预检</span><i /><span>逐项回执</span></div></div>
    <div className="connect-panel-wrap"><div className="connect-card"><div className="card-heading"><span className="product-icon">AI</span><div><h2>连接你的 ONES</h2><p>授权后载入真实项目、迭代与工作流</p></div></div><label className="field"><span>MCP 服务器地址</span><span className="input-shell"><b>⌁</b><input value="https://sz.ones.cn/mcp" readOnly /></span></label><div className="oauth-explainer"><span className="oauth-icon">↗</span><div><strong>通过 ONES 官方 OAuth 授权</strong><p>在独立窗口中选择团队和访问范围，完成后自动返回。</p></div></div><p className="security-note">✓ 授权最长保持 7 天，期间自动续期；Token 只保存在当前 Node 进程内存中。</p><StarBorder type="button" className="oauth-button" onClick={() => openOauth(false)}>{oauthStatus === "idle" ? "使用 ONES OAuth 授权" : "打开 ONES 授权窗口"} <span>→</span></StarBorder>{oauthStatus !== "idle" && <div className={`oauth-recovery is-${oauthStatus}`} role="status"><span className="oauth-recovery-icon">{oauthStatus === "error" || oauthStatus === "attention" ? "!" : "↗"}</span><div><strong>{oauthStatus === "waiting" ? "等待 ONES 授权" : "授权尚未完成"}</strong><p>{oauthHint}</p><button type="button" onClick={() => openOauth(true)}>重新创建并打开授权会话</button></div></div>}<p className="form-error" role="alert">{error}</p></div></div>
  </section>;
}

function App() {
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [iterations, setIterations] = useState([]);
  const [iterationId, setIterationId] = useState("all");
  const [issues, setIssues] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [targetStatusId, setTargetStatusId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [progress, setProgress] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function toast(title, detail) {
    const id = ++toastSequence;
    setToasts((items) => [...items, { id, title, detail }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3400);
  }

  async function loadRemote(nextProjectId, notify = true) {
    setLoading(true); setError(""); setSelected(new Set()); setTargetStatusId("");
    try {
      const data = await post("/api/issues", { projectId: nextProjectId });
      setIssues(data.issues || []); setIterations(data.iterations || []); setIterationId("all"); setStatuses(sortedStatuses(data.statuses || []));
      if (notify) toast("真实数据已同步", `已读取 ${data.issues?.length || 0} 个事项和 ${data.iterations?.length || 0} 个迭代`);
    } catch (requestError) { setIssues([]); toast("同步失败", requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    get("/api/session").then(async (session) => {
      if (!session.connected) {
        if (session.error) throw new Error(session.error);
        return;
      }
      if (!session.projects?.length) throw new Error("OAuth 已完成，但没有读取到项目数据");
      setConnected(true); setProjects(session.projects); setProjectId(session.projects[0].id);
      await loadRemote(session.projects[0].id, false);
      if (new URLSearchParams(window.location.search).get("oauth") === "success") toast("ONES OAuth 授权成功", `已读取 ${session.projects.length} 个项目`);
      window.history.replaceState({}, "", "/");
    }).catch((requestError) => setError(requestError.message));
  }, []);

  const visibleIssues = useMemo(() => issues.filter((issue) => {
    const query = search.trim().toLowerCase();
    return (statusFilter === "all" || issue.status === statusFilter)
      && (iterationId === "all" || issue.iterationId === iterationId)
      && (!query || `${issue.key || issue.id} ${issue.title}`.toLowerCase().includes(query));
  }), [issues, iterationId, search, statusFilter]);

  const scopedIssues = useMemo(() => issues.filter((issue) => iterationId === "all" || issue.iterationId === iterationId), [issues, iterationId]);
  const metrics = { total: scopedIssues.length, progress: scopedIssues.filter((item) => /中|进行|实现|测试|研发/.test(item.status)).length, done: scopedIssues.filter((item) => /完成|关闭/.test(item.status)).length, due: scopedIssues.filter((item) => item.dueSoon && !/完成|关闭/.test(item.status)).length };
  const issueStatuses = [...new Set(issues.map((issue) => issue.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const chosenStatus = statuses.find((item) => item.id === targetStatusId);
  const counts = (plan?.items || []).reduce((result, item) => ({ ...result, [item.state]: (result[item.state] || 0) + 1 }), {});
  const canExecute = Boolean(counts.ready) && !counts.todo && !progress;

  function toggleIssue(id) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  async function changeProject(nextProjectId) {
    setProjectId(nextProjectId); setPlan(null);
    await loadRemote(nextProjectId);
  }

  async function refresh() {
    await loadRemote(projectId, false);
    toast("同步完成", "项目、迭代和事项均为最新状态");
  }

  async function preview() {
    if (!chosenStatus || !selected.size) return;
    setPlanOpen(true); setPlanLoading(true); setPlan(null); setPlanError(""); setProgress(null);
    const selectedIssues = [...selected].map((id) => issues.find((issue) => issue.id === id)).filter(Boolean);
    try {
      const nextPlan = await post("/api/issues/workflows/preview", { projectId, targetStatusId, issues: selectedIssues.map(issueInput), catalog: issues.map(issueInput) });
      setPlan(nextPlan);
    } catch (requestError) { setPlanError(requestError.message); toast("工作流预检失败", requestError.message); }
    finally { setPlanLoading(false); }
  }

  function resolveTodo(index, targetId) {
    setPlan((current) => ({ ...current, items: current.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const target = item.allowedTargets.find((candidate) => candidate.id === targetId);
      return target ? { ...item, state: "ready", reason: "已重新选择可达节点", targetStatusId: target.id, targetStatusName: target.name, path: target.path } : item;
    }) }));
  }

  async function executePlan() {
    const ready = plan.items.filter((item) => item.state === "ready");
    if (!ready.length || plan.items.some((item) => item.state === "todo")) return;
    let succeeded = 0; let todo = 0; const failures = [];
    setProgress({ current: 0, total: ready.length, percent: 0, title: "正在更新工作流", copy: "正在重新校验远端状态…" });
    for (let index = 0; index < ready.length; index += 1) {
      const item = ready[index]; let finalName = item.targetStatusName; let finalId = item.targetStatusId; let updated = true; let reason = "";
      try {
        const response = await post("/api/issues/workflows/execute", { projectId, items: [{ issueId: item.id, currentStatusId: item.currentStatusId, targetStatusId: item.targetStatusId, path: item.path }] });
        const result = response.results?.[0]; updated = Boolean(result?.updated); finalName = result?.finalStatusName || item.currentStatusName; finalId = result?.finalStatusId || item.currentStatusId; reason = result?.reason || "工作流已发生变化";
      } catch (requestError) { updated = false; finalName = item.currentStatusName; finalId = item.currentStatusId; reason = requestError.message; }
      setIssues((current) => current.map((issue) => issue.id === item.id ? { ...issue, status: finalName, statusId: finalId, blocked: false } : issue));
      if (updated) succeeded += 1; else { todo += 1; failures.push(`${item.key || item.id}：${reason}`); }
      const current = index + 1; const percent = Math.round(current / ready.length * 100);
      setProgress({ current, total: ready.length, percent, title: "正在更新工作流", copy: `正在处理 ${item.key || item.id} · ${item.title}` });
    }
    const targets = [...new Set(ready.map((item) => item.targetStatusName))];
    setHistory((items) => [{ count: ready.length, target: targets.length === 1 ? targets[0] : "各事项计划节点", succeeded, skipped: todo, time: new Date() }, ...items]);
    setSelected(new Set());
    setProgress({ current: ready.length, total: ready.length, percent: 100, title: "工作流更新完成", copy: todo ? `${succeeded} 项成功，${todo} 项转为 TODO。${failures[0]}` : `${succeeded} 个事项已按预检路径完成流转。` });
    window.setTimeout(() => { setPlanOpen(false); setProgress(null); setPlan(null); toast("批量更新完成", todo ? `${succeeded} 项成功，${todo} 项转为 TODO` : `${succeeded} 项已完成正常流转`); }, 1000);
  }

  if (!connected) return <ConnectView error={error} />;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}><Brand /><nav className="main-nav"><a className="nav-item is-active" href="#workbench"><span>◫</span>迭代工作台</a><button className="nav-item" type="button" onClick={() => setHistoryOpen(true)}><span>↻</span>执行记录 <b className="nav-count">{history.length}</b></button></nav><div className="sidebar-bottom"><div className="sync-card"><i className="pulse-dot" /><div><strong>ONES 已连接</strong><small>真实环境</small></div><button className="icon-button" type="button" aria-label="断开连接" onClick={async () => { await post("/api/disconnect").catch(() => {}); window.location.reload(); }}>↗</button></div><div className="profile-row"><span className="avatar avatar-photo">CK</span><div><strong>陈康</strong><small>产品研发团队</small></div></div></div></aside>
    <main className="main-content"><header className="topbar"><button className="icon-button mobile-menu" type="button" aria-label="打开菜单" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button><div className="breadcrumb"><span>工作台</span><i>/</i><strong>迭代事项</strong></div><span className="environment-badge"><i />真实环境</span></header>
      <div className="page-content" id="workbench"><section className="page-heading"><div><span className="eyebrow"><i /> ITERATION FOCUS</span><h1>迭代事项</h1><p>把与你相关的工作集中在一个清晰的视图里。</p></div><button className="button button-secondary" type="button" disabled={loading} onClick={refresh}>{loading ? "同步中…" : "↻ 同步数据"}</button></section>
        <section className="filters-card" aria-label="事项筛选"><div className="select-field"><span>项目</span><Select ariaLabel="选择项目" value={projectId} onValueChange={changeProject} options={projects.map((project) => ({ value: project.id, label: project.name }))} placeholder="请选择项目" /></div><i className="filter-separator" /><div className="select-field iteration-field"><span>迭代</span><Select ariaLabel="选择迭代" value={iterationId} onValueChange={(value) => { setSelected(new Set()); setIterationId(value); }} options={[{ value: "all", label: "全部迭代" }, ...iterations.map((iteration) => ({ value: iteration.id, label: iteration.name }))]} placeholder="请选择迭代" /></div><i className="filter-separator" /><div className="select-field scope-field"><span>范围</span><Select ariaLabel="事项范围" value="related" disabled options={[{ value: "related", label: "MCP 查询结果" }]} /></div></section>
        <section className="metric-grid" aria-label="迭代概览">{[
          ["相关事项", metrics.total, "项", "本迭代与我相关", "metric-blue"], ["进行中", metrics.progress, "项", "处于执行阶段", "metric-violet"], ["已完成", metrics.done, "项", `${metrics.total ? Math.round(metrics.done / metrics.total * 100) : 0}% 完成率`, "metric-green"], ["即将到期", metrics.due, "项", "请及时处理", "metric-amber"],
        ].map(([label, value, unit, detail, color]) => <SpotlightCard className="metric-card" key={label}><div className="metric-label"><span className={`metric-icon ${color}`}>◆</span>{label}</div><div className="metric-value"><strong><CountUp to={value} /></strong><small>{unit}</small></div><p>{detail}</p></SpotlightCard>)}</section>
        <section className="issues-card"><div className="issues-toolbar"><div><h2>我的事项</h2><span className="result-count">{visibleIssues.length} 项</span></div><div className="toolbar-controls"><label className="search-box"><span>⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题或编号" /></label><Select className="compact-select" ariaLabel="按状态筛选" value={statusFilter} onValueChange={setStatusFilter} options={[{ value: "all", label: "全部状态" }, ...issueStatuses.map((status) => ({ value: status, label: status }))]} /></div></div>
          {loading ? <div className="loading-row"><i />正在从 ONES MCP 读取事项…</div> : visibleIssues.length ? <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="选择全部事项" checked={visibleIssues.length > 0 && visibleIssues.every((issue) => selected.has(issue.id))} ref={(node) => { if (node) node.indeterminate = visibleIssues.some((issue) => selected.has(issue.id)) && !visibleIssues.every((issue) => selected.has(issue.id)); }} onChange={(event) => setSelected((current) => { const next = new Set(current); visibleIssues.forEach((issue) => event.target.checked ? next.add(issue.id) : next.delete(issue.id)); return next; })} /></th><th>事项</th><th>优先级</th><th>状态</th><th>负责人</th><th>截止日期</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{visibleIssues.map((issue) => <tr key={issue.id} className={selected.has(issue.id) ? "is-selected" : ""}><td><input type="checkbox" aria-label={`选择 ${issue.key || issue.id}`} checked={selected.has(issue.id)} onChange={() => toggleIssue(issue.id)} /></td><td><div className="issue-cell"><span className={`issue-type ${typeClass(issue.type)}`}>{issue.type.slice(0, 1)}</span><div className="issue-copy"><strong title={issue.title}>{issue.title}</strong><small>{issue.key || issue.id} · {issue.type}</small></div></div></td><td><span className={`priority ${issue.priority === "高" ? "high" : issue.priority === "中" ? "medium" : "low"}`}><i />{issue.priority}</span></td><td><span className={`status-pill ${statusClass(issue.status)}`}>{issue.status}</span></td><td><span className="assignee"><span className="avatar avatar-photo">{issue.initials}</span>{issue.assignee}</span></td><td><span className={`date ${issue.dueSoon && !/完成|关闭/.test(issue.status) ? "is-due" : ""}`}>{issue.due}</span></td><td><button className="icon-button row-menu" aria-label={`${issue.key || issue.id} 更多操作`}>•••</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><span>⌕</span><h3>没有找到匹配的事项</h3><p>尝试更换关键词或筛选条件。</p></div>}<footer className="table-footer"><span>显示 {visibleIssues.length} 项</span><span>工作流执行前会再次校验</span></footer>
        </section>
      </div>
    </main>
    <div className={`bulk-bar ${selected.size ? "is-visible" : ""}`}><div className="bulk-selection"><span className="selection-count">{selected.size}</span><div><strong>已选择 <b>{selected.size}</b> 项</strong><small>可批量推进工作流</small></div></div><div className="bulk-actions"><div className="bulk-select-field"><span>目标状态</span><Select className="bulk-status-select" ariaLabel="目标状态" value={targetStatusId} placeholder="请选择目标状态" onValueChange={(value) => { setTargetStatusId(value); setPlan(null); }} options={statuses.map((status) => ({ value: status.id, label: status.name }))} /></div><button className="button button-primary" type="button" disabled={!selected.size || !targetStatusId} onClick={preview}>预检流转 →</button><button className="icon-button bulk-close" type="button" aria-label="清除选择" onClick={() => setSelected(new Set())}>×</button></div></div>

    <Modal open={planOpen} onClose={() => !progress && setPlanOpen(false)} className="workflow-dialog"><div className="dialog-content"><button className="icon-button dialog-close" type="button" aria-label="关闭" disabled={Boolean(progress)} onClick={() => setPlanOpen(false)}>×</button>{progress ? <div className="progress-view"><h2>{progress.title}</h2><p>{progress.copy}</p><div className="progress-track"><i style={{ width: `${progress.percent}%` }} /></div><div className="progress-meta"><span>{progress.current} / {progress.total}</span><span>{progress.percent}%</span></div></div> : <><span className="dialog-icon">⌁</span><div className="dialog-copy"><span className="eyebrow"><i /> WORKFLOW CHECK</span><h2>目标节点预检</h2><p>已选择 <strong>{selected.size}</strong> 个事项，首选目标为 <span className={`status-pill ${statusClass(chosenStatus?.name || "")}`}>{chosenStatus?.name || "—"}</span>。</p><div className="dialog-note">ⓘ 系统只执行已确认的正向工作流。TODO 事项必须重新选择可达节点后才能执行。</div>{planLoading ? <div className="plan-loading"><i />正在读取状态图并规划路径…</div> : planError ? <div className="plan-error">{planError}</div> : plan && <><div className="workflow-summary"><span className="is-ready">可执行 {counts.ready || 0}</span><span className="is-todo">待处理 {counts.todo || 0}</span><span>无需处理 {counts.skip || 0}</span></div><div className="workflow-plan">{plan.items.map((item, index) => <article className={`workflow-plan-item is-${item.state}`} key={item.id}><span className="plan-state">{item.state === "ready" ? "✓" : item.state === "skip" ? "—" : "!"}</span><div className="plan-issue"><strong>{item.key || item.id} · {item.title}</strong><small>{item.currentStatusName} · {item.type || "事项"}</small></div>{item.state === "ready" ? <WorkflowRail item={item} /> : item.state === "skip" ? <div className="plan-path">{item.reason}</div> : <div className="plan-todo"><span>{item.reason}</span><Select className="todo-select" ariaLabel={`${item.key || item.id} 重新选择可达节点`} disabled={!item.allowedTargets?.length} placeholder={item.allowedTargets?.length ? "重新选择可达节点" : "没有已确认的可达节点"} onValueChange={(value) => resolveTodo(index, value)} options={(item.allowedTargets || []).map((target) => ({ value: target.id, label: `推进到 ${target.name}` }))} /></div>}</article>)}</div></>}</div><div className="dialog-actions"><button className="button button-quiet" type="button" onClick={() => setPlanOpen(false)}>取消</button><button className="button button-primary" type="button" disabled={!canExecute} onClick={executePlan}>确认并执行</button></div></>}</div></Modal>
    <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} className="history-dialog"><div className="dialog-content"><button className="icon-button dialog-close" type="button" onClick={() => setHistoryOpen(false)}>×</button><span className="eyebrow"><i /> ACTIVITY LOG</span><h2>执行记录</h2><div className="history-list">{history.length ? history.map((item, index) => <article className="history-item" key={`${item.time}-${index}`}><span>✓</span><div><strong>{item.count} 项批量更新到「{item.target}」</strong><small>{item.succeeded} 项成功{item.skipped ? ` · ${item.skipped} 项转为 TODO` : ""}</small></div><time>{item.time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></article>) : <div className="history-empty">还没有批量执行记录。</div>}</div></div></Modal>
    <div className="toast-stack" aria-live="polite">{toasts.map((item) => <div className="toast" key={item.id}><span>✓</span><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}</div>
  </div>;
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
