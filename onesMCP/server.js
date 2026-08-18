import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const HOST = process.env.ORBIT_HOST || "127.0.0.1";
const PORT = Number(process.env.ORBIT_PORT || 4173);
const ONES_MCP_URL = "https://sz.ones.cn/mcp";
const STATIC_ROOT = new URL("./dist/", import.meta.url);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

let activeClient = null;
let activeProjects = [];
let oauthSession = null;
let oauthRefreshPromise = null;
const oauthRegistrations = new Map();
const pendingOAuth = new Map();
const workflowObservationCache = new Map();
const OAUTH_METADATA_URL = "https://sz.ones.cn/.well-known/oauth-authorization-server";
const OAUTH_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const OAUTH_REFRESH_LEEWAY = 60_000;

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class McpClient {
  constructor(serverUrl, token) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.sessionId = null;
    this.protocolVersion = "2025-03-26";
    this.nextId = 1;
    this.tools = new Map();
    this.serverInfo = null;
  }

  async connect() {
    const initialized = await this.request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: "orbit-ones-workbench", version: "0.2.0" },
    });
    this.protocolVersion = initialized.protocolVersion || this.protocolVersion;
    this.serverInfo = initialized.serverInfo || null;
    await this.notify("notifications/initialized", {});
    const listed = await this.request("tools/list", {});
    for (const tool of listed.tools || []) this.tools.set(tool.name, tool);
    return initialized;
  }

  async request(method, params = {}) {
    const id = this.nextId++;
    const message = await this.post({ jsonrpc: "2.0", id, method, params });
    if (message?.error) throw new HttpError(502, message.error.message || `MCP ${method} 调用失败`, message.error.data);
    if (!message || message.id !== id) throw new HttpError(502, `MCP ${method} 返回了无效响应`);
    return message.result;
  }

  async notify(method, params = {}) {
    await this.post({ jsonrpc: "2.0", method, params }, true);
  }

  async callTool(name, args = {}) {
    if (!this.tools.has(name)) throw new HttpError(501, `当前 ONES MCP 未提供 ${name}`);
    const result = await this.request("tools/call", { name, arguments: args });
    if (result?.isError) throw new HttpError(502, toolText(result) || `${name} 执行失败`);
    return result;
  }

  tool(name) {
    return this.tools.get(name);
  }

  async post(payload, notification = false) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": this.protocolVersion,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    let response;
    try {
      response = await fetch(this.serverUrl, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new HttpError(502, `无法连接 ONES MCP：${error.message}`);
    }
    this.sessionId ||= response.headers.get("mcp-session-id");
    const text = await response.text();
    if (response.status === 401) throw new HttpError(401, "Token 无效或不是该 MCP 服务签发的 OAuth Access Token");
    if (!response.ok) throw new HttpError(response.status, responseMessage(text) || `ONES MCP 返回 HTTP ${response.status}`);
    if (notification || response.status === 202 || !text.trim()) return null;
    return parseMcpMessage(text, response.headers.get("content-type") || "");
  }
}

function parseMcpMessage(text, contentType) {
  if (!contentType.includes("text/event-stream")) {
    try { return JSON.parse(text); } catch { throw new HttpError(502, "ONES MCP 返回了无法解析的 JSON"); }
  }
  const messages = text.split(/\r?\n\r?\n/).flatMap((event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return [];
    try { return [JSON.parse(data)]; } catch { return []; }
  });
  const message = messages.findLast((item) => item?.result || item?.error);
  if (!message) throw new HttpError(502, "ONES MCP 的事件流中没有结果");
  return message;
}

function responseMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.error_description || parsed.error?.message || parsed.message || parsed.error;
  } catch {
    return text.trim().slice(0, 300);
  }
}

function toolText(result) {
  return (result?.content || []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
}

function unwrapToolResult(result) {
  if (result?.structuredContent && Object.keys(result.structuredContent).length) return result.structuredContent;
  const texts = (result?.content || []).filter((item) => item.type === "text").map((item) => item.text.trim()).filter(Boolean);
  const parsed = texts.map(parseLooseJson).filter((item) => item !== null);
  if (parsed.length === 1) return parsed[0];
  if (parsed.length > 1) return parsed;
  return texts;
}

function parseLooseJson(text) {
  try { return JSON.parse(text); } catch {}
  const start = Math.min(...[text.indexOf("{"), text.indexOf("[")].filter((index) => index >= 0));
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (!Number.isFinite(start) || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function findRecords(value, preferredKeys) {
  if (Array.isArray(value)) {
    if (!value.length || value.some((item) => item && typeof item === "object" && !Array.isArray(item))) return value;
    for (const item of value) {
      const found = findRecords(item, preferredKeys);
      if (found.length) return found;
    }
    return [];
  }
  if (!value || typeof value !== "object") return [];
  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    const found = findRecords(child, preferredKeys);
    if (found.length) return found;
  }
  return [];
}

function valueAt(object, paths) {
  for (const path of paths) {
    let value = object;
    for (const part of path.split(".")) value = value?.[part];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function displayValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  return String(value.name || value.display_name || value.displayName || value.value || value.label || value.title || value.uuid || value.id || "");
}

function normalizeProjects(result) {
  const records = findRecords(unwrapToolResult(result), ["projects", "project_list", "projectList", "items", "records", "data", "results"]);
  return records.map((project, index) => ({
    id: displayValue(valueAt(project, ["uuid", "id", "project_uuid", "project_id", "key"])) || `project-${index + 1}`,
    name: displayValue(valueAt(project, ["name", "project_name", "title", "key"])) || `未命名项目 ${index + 1}`,
  }));
}

function namedField(issue, expression) {
  const fields = valueAt(issue, ["fields", "field_values", "fieldValues"]);
  if (!Array.isArray(fields)) return null;
  const field = fields.find((item) => expression.test(displayValue(item.name || item.field_name || item.field)));
  return field ? (field.value ?? field.values ?? field.option ?? null) : null;
}

function normalizeIssues(result) {
  const records = findRecords(unwrapToolResult(result), ["issues", "issue_list", "issueList", "items", "records", "data", "results"]);
  return records.map((issue, index) => {
    const item = valueAt(issue, ["item", "value.item", "value"]) || issue;
    const iteration = valueAt(item, ["iteration", "sprint", "iteration_info", "sprint_info", "field011"]) || namedField(item, /迭代|sprint/i);
    const assignee = valueAt(item, ["assignee", "owner", "assigned_to", "assignedTo", "field004"]);
    const status = valueAt(item, ["status", "status_name", "statusName", "state", "field005"]);
    const id = displayValue(valueAt(item, ["uuid", "id", "issue_uuid", "issue_id", "key"])) || `issue-${index + 1}`;
    const key = displayValue(valueAt(item, ["key", "issue_key", "number"])) || id.slice(0, 10);
    const title = displayValue(valueAt(item, ["name", "title", "summary", "issue_name", "field001"])) || "未命名事项";
    const priority = displayValue(valueAt(item, ["priority", "priority_name", "priorityName", "field009"])) || "中";
    const type = displayValue(valueAt(item, ["issue_type", "issueType", "type", "type_name", "field007"])) || "任务";
    const assigneeName = displayValue(assignee) || "未分配";
    const dueValue = valueAt(item, ["deadline", "due_date", "dueDate", "end_date", "field010"]);
    const due = typeof dueValue === "number" ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(dueValue) : displayValue(dueValue) || "—";
    return {
      id, key, title, type, priority, status: displayValue(status) || "未知状态",
      statusId: displayValue(valueAt(status || {}, ["uuid", "id"])) || "",
      typeId: displayValue(valueAt(valueAt(item, ["field007"]) || {}, ["uuid", "id"])) || "",
      assignee: assigneeName, initials: assigneeName === "未分配" ? "—" : assigneeName.slice(-2),
      iterationId: displayValue(valueAt(iteration || {}, ["uuid", "id", "key"])) || displayValue(iteration) || "unassigned",
      iterationName: displayValue(valueAt(iteration || {}, ["name", "title"])) || displayValue(iteration) || "未分配迭代",
      due, dueSoon: false, blocked: false, relation: ["assigned"],
    };
  });
}

function normalizeSprints(result) {
  const records = findRecords(unwrapToolResult(result), ["sprints", "sprint_list", "sprintList", "items", "records", "data", "results"]);
  return records.map((sprint, index) => ({
    id: displayValue(valueAt(sprint, ["uuid", "id", "sprint_uuid", "sprint_id", "key"])) || `sprint-${index + 1}`,
    name: displayValue(valueAt(sprint, ["name", "sprint_name", "title"])) || `未命名迭代 ${index + 1}`,
  }));
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ARGUMENT_ALIASES = {
  projectId: ["projectid", "projectuuid", "project"],
  issueId: ["issueid", "issueuuid", "issue"],
  workflowId: ["workflowid", "workflowuuid", "transitionid", "transitionuuid", "workflow", "transition", "id"],
  targetStatus: ["targetstatus", "statusname", "status"],
};

function toolArguments(tool, values) {
  const schema = tool?.inputSchema || {};
  const properties = schema.properties || {};
  const args = {};
  for (const [name, definition] of Object.entries(properties)) {
    const normalized = normalizeName(name);
    for (const [valueName, aliases] of Object.entries(ARGUMENT_ALIASES)) {
      if (values[valueName] !== undefined && aliases.includes(normalized)) args[name] = values[valueName];
    }
    if ((normalized === "limit" || normalized === "pagesize" || normalized === "size") && definition.type === "integer") args[name] = 100;
    if (["keyword", "query", "searchtext"].includes(normalized) && definition.type === "string" && args[name] === undefined) args[name] = "";
  }
  const missing = (schema.required || []).filter((name) => args[name] === undefined);
  if (missing.length) throw new HttpError(422, `${tool.name} 还需要参数：${missing.join("、")}`, { inputSchema: schema });
  return args;
}

function workflowRecords(result) {
  return findRecords(unwrapToolResult(result), ["workflows", "transitions", "items", "records", "data", "results"]);
}

function normalizeStatuses(result) {
  return findRecords(unwrapToolResult(result), ["statuses", "items", "records", "data", "results"]).map((status) => ({
    id: displayValue(valueAt(status, ["uuid", "id", "status_uuid", "status_id", "key"])),
    name: displayValue(valueAt(status, ["name", "status_name", "title"])),
  })).filter((status) => status.id && status.name);
}

function normalizeWorkflows(result, statuses = []) {
  const statusNames = new Map(statuses.map((status) => [status.id, status.name]));
  return workflowRecords(result).map((workflow) => {
    const start = valueAt(workflow, ["start", "start_status", "startStatus", "from_status", "fromStatus"]);
    const end = valueAt(workflow, ["end", "end_status", "endStatus", "target_status", "targetStatus", "to_status", "toStatus"]);
    const startId = displayValue(valueAt(start || {}, ["uuid", "id"])) || displayValue(start);
    const endId = displayValue(valueAt(end || {}, ["uuid", "id"])) || displayValue(end);
    return {
      id: displayValue(valueAt(workflow, ["uuid", "id", "workflow_uuid", "workflow_id", "transition_id", "key"])),
      name: displayValue(valueAt(workflow, ["name", "title"])) || `${statusNames.get(startId) || startId} → ${statusNames.get(endId) || endId}`,
      startId,
      startName: statusNames.get(startId) || displayValue(valueAt(start || {}, ["name", "title"])) || startId,
      endId,
      endName: statusNames.get(endId) || displayValue(valueAt(end || {}, ["name", "title"])) || endId,
    };
  }).filter((workflow) => workflow.id && workflow.startId && workflow.endId);
}

function findWorkflowPath(edges, startId, targetId) {
  if (!startId || !targetId) return null;
  if (startId === targetId) return [];
  const queue = [{ statusId: startId, path: [] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges.filter((item) => item.startId === current.statusId)) {
      if (visited.has(edge.endId)) continue;
      const path = [...current.path, edge];
      if (edge.endId === targetId) return path;
      visited.add(edge.endId);
      queue.push({ statusId: edge.endId, path });
    }
  }
  return null;
}

function reachableWorkflowTargets(edges, startId) {
  const targets = [];
  const queue = [{ statusId: startId, path: [] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges.filter((item) => item.startId === current.statusId)) {
      if (visited.has(edge.endId)) continue;
      const path = [...current.path, edge];
      visited.add(edge.endId);
      targets.push({ id: edge.endId, name: edge.endName, path });
      queue.push({ statusId: edge.endId, path });
    }
  }
  return targets;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function openMcpConnection(token) {
  const client = new McpClient(ONES_MCP_URL, token);
  await client.connect();
  const projectTool = client.tool("search_for_projects") || client.tool("get_project_list");
  if (!projectTool) throw new HttpError(501, "当前 MCP 未提供项目查询工具");
  const projectResult = await client.callTool(projectTool.name, toolArguments(projectTool, {}));
  const projects = normalizeProjects(projectResult);
  return { client, projects, data: {
    serverInfo: client.serverInfo,
    tools: [...client.tools.keys()],
    projects,
    warning: projects.length ? null : "连接成功，但 get_project_list 的返回格式无法识别。",
  } };
}

function activateMcpConnection(connection) {
  activeClient = connection.client;
  activeProjects = connection.projects;
  workflowObservationCache.clear();
}

function clearConnection() {
  activeClient = null;
  activeProjects = [];
  oauthSession = null;
  workflowObservationCache.clear();
}

async function connect(body) {
  if (body.serverUrl !== ONES_MCP_URL) throw new HttpError(400, `当前版本仅允许连接 ${ONES_MCP_URL}`);
  if (typeof body.token !== "string" || body.token.trim().length < 8) throw new HttpError(400, "请输入有效的 Access Token");
  const connection = await openMcpConnection(body.token.trim());
  activateMcpConnection(connection);
  oauthSession = null;
  return connection.data;
}

async function oauthMetadata() {
  const response = await fetch(OAUTH_METADATA_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new HttpError(502, "无法读取 ONES OAuth 元数据");
  return response.json();
}

function base64Url(buffer) {
  return buffer.toString("base64url");
}

function isAllowedOauthHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === HOST.toLowerCase() || normalized.endsWith(".local")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function oauthRedirectUri(request) {
  if (process.env.ORBIT_PUBLIC_ORIGIN) {
    const configured = new URL(process.env.ORBIT_PUBLIC_ORIGIN);
    if (!/^https?:$/.test(configured.protocol) || configured.username || configured.password) throw new HttpError(500, "ORBIT_PUBLIC_ORIGIN 必须是有效的 HTTP(S) 地址");
    return `${configured.origin}/oauth/callback`;
  }
  const host = request.headers.host;
  if (!host) throw new HttpError(400, "请求缺少 Host，无法生成 OAuth 回调地址");
  const origin = new URL(`http://${host}`);
  if (!isAllowedOauthHostname(origin.hostname)) throw new HttpError(400, "OAuth 仅允许 localhost、局域网 IP 或 .local 地址");
  return `${origin.origin}/oauth/callback`;
}

async function ensureOauthRegistration(metadata, redirectUri, fresh = false) {
  if (fresh) oauthRegistrations.delete(redirectUri);
  if (oauthRegistrations.has(redirectUri)) return oauthRegistrations.get(redirectUri);
  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Orbit ONES Workbench",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const registration = await response.json().catch(() => ({}));
  if (!response.ok || !registration.client_id) throw new HttpError(502, registration.error_description || registration.error || "ONES OAuth 客户端注册失败");
  oauthRegistrations.set(redirectUri, registration);
  return registration;
}

async function oauthStart(request, url, response) {
  const metadata = await oauthMetadata();
  const redirectUri = oauthRedirectUri(request);
  const registration = await ensureOauthRegistration(metadata, redirectUri, url.searchParams.get("fresh") === "1");
  const state = base64Url(randomBytes(24));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  pendingOAuth.set(state, { verifier, metadata, registration, redirectUri, createdAt: Date.now() });
  for (const [key, value] of pendingOAuth) if (Date.now() - value.createdAt > 10 * 60_000) pendingOAuth.delete(key);
  const authorizeUrl = new URL(metadata.authorization_endpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", registration.client_id);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("resource", ONES_MCP_URL);
  response.writeHead(302, { Location: authorizeUrl.toString(), "Cache-Control": "no-store" });
  response.end();
}

async function oauthCallback(url, response) {
  const error = url.searchParams.get("error");
  if (error) throw new HttpError(400, url.searchParams.get("error_description") || error);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  if (!code || !pending) throw new HttpError(400, "OAuth 回调无效或已过期，请重新连接");
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.registration.client_id,
    code_verifier: pending.verifier,
    resource: ONES_MCP_URL,
  });
  if (pending.registration.client_secret) form.set("client_secret", pending.registration.client_secret);
  const tokenResponse = await fetch(pending.metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) throw new HttpError(401, token.error_description || token.error || "ONES OAuth Token 交换失败");
  const authorizedAt = Date.now();
  const connection = await openMcpConnection(token.access_token);
  oauthSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: oauthTokenExpiresAt(token, authorizedAt),
    authorizedAt,
    metadata: pending.metadata,
    registration: pending.registration,
  };
  activateMcpConnection(connection);
  response.writeHead(302, { Location: "/?oauth=success", "Cache-Control": "no-store" });
  response.end();
}

function oauthTokenExpiresAt(token, now = Date.now()) {
  const expiresIn = Number(token?.expires_in);
  return now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000;
}

async function refreshOauthClient(force = false) {
  const session = oauthSession;
  if (!session) throw new HttpError(401, "请重新完成 ONES OAuth 授权");
  if (Date.now() >= session.authorizedAt + OAUTH_SESSION_MAX_AGE) {
    clearConnection();
    throw new HttpError(401, "ONES OAuth 授权已保持 7 天，请重新授权");
  }
  if (!force && activeClient && session.expiresAt - Date.now() > OAUTH_REFRESH_LEEWAY) return activeClient;
  if (!session.refreshToken) {
    if (!force && activeClient && Date.now() < session.expiresAt) return activeClient;
    clearConnection();
    throw new HttpError(401, "ONES 未签发可续期的 Refresh Token，请重新授权");
  }
  if (oauthRefreshPromise) return oauthRefreshPromise;

  oauthRefreshPromise = (async () => {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      client_id: session.registration.client_id,
      resource: ONES_MCP_URL,
    });
    if (session.registration.client_secret) form.set("client_secret", session.registration.client_secret);
    let tokenResponse;
    try {
      tokenResponse = await fetch(session.metadata.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new HttpError(502, `ONES OAuth 自动续期失败：${error.message}`);
    }
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) {
      const message = token.error_description || token.error || "ONES OAuth 自动续期失败";
      if (tokenResponse.status === 400 || tokenResponse.status === 401) clearConnection();
      throw new HttpError(tokenResponse.status === 400 || tokenResponse.status === 401 ? 401 : 502, message);
    }
    const refreshedAt = Date.now();
    const connection = await openMcpConnection(token.access_token);
    if (oauthSession !== session) throw new HttpError(401, "ONES OAuth 授权已断开");
    oauthSession = {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || session.refreshToken,
      expiresAt: oauthTokenExpiresAt(token, refreshedAt),
    };
    activateMcpConnection(connection);
    return activeClient;
  })();

  try {
    return await oauthRefreshPromise;
  } finally {
    oauthRefreshPromise = null;
  }
}

async function ensureActiveClient() {
  if (oauthSession) {
    if (Date.now() >= oauthSession.authorizedAt + OAUTH_SESSION_MAX_AGE) {
      clearConnection();
      throw new HttpError(401, "ONES OAuth 授权已保持 7 天，请重新授权");
    }
    if (!activeClient || oauthSession.expiresAt - Date.now() <= OAUTH_REFRESH_LEEWAY) await refreshOauthClient();
  }
  if (!activeClient) throw new HttpError(401, "请先连接 ONES MCP");
  return activeClient;
}

async function callActiveTool(name, args = {}) {
  const client = await ensureActiveClient();
  try {
    return await client.callTool(name, args);
  } catch (error) {
    if (error.status !== 401 || !oauthSession?.refreshToken) throw error;
    if (client === activeClient) await refreshOauthClient(true);
    return activeClient.callTool(name, args);
  }
}

async function sessionState() {
  if (oauthSession) {
    try {
      await ensureActiveClient();
    } catch (error) {
      if (error.status === 401) return { connected: false, projects: [], serverInfo: null, error: error.message };
      throw error;
    }
  }
  return {
    connected: Boolean(activeClient),
    projects: activeProjects,
    serverInfo: activeClient?.serverInfo || null,
    renewable: Boolean(oauthSession?.refreshToken),
    authorizedUntil: oauthSession ? new Date(oauthSession.authorizedAt + OAUTH_SESSION_MAX_AGE).toISOString() : null,
  };
}

async function listIssues(body) {
  await ensureActiveClient();
  const sprintTool = activeClient.tool("search_for_sprints");
  const statusTool = activeClient.tool("get_issue_status");
  const grammarTool = activeClient.tool("get_onesql_grammar_help");
  const queryTool = activeClient.tool("query_issues_by_onesql");
  if (!sprintTool || !statusTool || !grammarTool || !queryTool) throw new HttpError(501, "当前 ONES MCP 缺少状态、迭代或 ONESQL 查询工具");

  const [sprintResult, statusResult] = await Promise.all([
    callActiveTool(sprintTool.name, toolArguments(sprintTool, { projectId: body.projectId })),
    callActiveTool(statusTool.name, toolArguments(statusTool, { projectId: body.projectId })),
  ]);
  const iterations = normalizeSprints(sprintResult);
  const statuses = normalizeStatuses(statusResult);
  if (!iterations.length) return { issues: [], iterations: [], statuses, rawCount: 0 };

  await callActiveTool(grammarTool.name, {});
  const sprintIDs = iterations.map((sprint) => `uid('${String(sprint.id).replaceAll("'", "''")}')`).join(", ");
  const query = `select uid(uuid, field001, field004.uuid, field004.name, field005.uuid, field005.name, field007.uuid, field007.name, field009.uuid, field009.name, field010, field011.uuid, field011.name)\nfrom issue\nwhere uid(field011) in (${sprintIDs}) and uid(field004) in (currentUser())\nlimit 0, 200`;
  const result = await callActiveTool(queryTool.name, { query });
  const issues = normalizeIssues(result);
  return { issues, iterations, statuses, rawCount: issues.length };
}

function issueInput(value) {
  return {
    id: displayValue(value?.id),
    key: displayValue(value?.key),
    title: displayValue(value?.title),
    type: displayValue(value?.type),
    typeId: displayValue(value?.typeId),
    status: displayValue(value?.status),
    statusId: displayValue(value?.statusId),
  };
}

function workflowGroup(issue) {
  return `${issue.typeId || issue.type || "unknown"}:${issue.statusId || issue.status || "unknown"}`;
}

async function previewIssueWorkflows(body) {
  await ensureActiveClient();
  const issues = (Array.isArray(body.issues) ? body.issues : []).map(issueInput).filter((issue) => issue.id);
  const catalog = (Array.isArray(body.catalog) ? body.catalog : []).slice(0, 200).map(issueInput).filter((issue) => issue.id);
  if (!body.projectId || !body.targetStatusId || !issues.length) throw new HttpError(400, "缺少项目、事项或目标状态");
  if (issues.length > 100) throw new HttpError(400, "单次最多预检 100 个事项");

  const statusTool = activeClient.tool("get_issue_status");
  const workflowTool = activeClient.tool("get_issue_executable_workflows");
  if (!statusTool || !workflowTool) throw new HttpError(501, "当前 ONES MCP 缺少状态或工作流工具");
  const statusResult = await callActiveTool(statusTool.name, toolArguments(statusTool, { projectId: body.projectId }));
  const statuses = normalizeStatuses(statusResult);
  const statusNames = new Map(statuses.map((status) => [status.id, status.name]));
  if (!statusNames.has(body.targetStatusId)) throw new HttpError(400, "目标状态不属于当前项目");

  const representatives = new Map();
  for (const issue of [...catalog, ...issues]) representatives.set(workflowGroup(issue), issue);
  await mapLimit([...representatives.values()].slice(0, 60), 5, async (issue) => {
    const result = await callActiveTool(workflowTool.name, toolArguments(workflowTool, { issueId: issue.id }));
    workflowObservationCache.set(`${body.projectId}:${workflowGroup(issue)}`, {
      projectId: body.projectId,
      typeId: issue.typeId || issue.type || "unknown",
      edges: normalizeWorkflows(result, statuses),
    });
  });

  const directByIssue = new Map();
  await mapLimit(issues, 5, async (issue) => {
    const result = await callActiveTool(workflowTool.name, toolArguments(workflowTool, { issueId: issue.id }));
    const edges = normalizeWorkflows(result, statuses);
    directByIssue.set(issue.id, edges);
    const cacheKey = `${body.projectId}:${workflowGroup(issue)}`;
    const cached = workflowObservationCache.get(cacheKey);
    workflowObservationCache.set(cacheKey, {
      projectId: body.projectId,
      typeId: issue.typeId || issue.type || "unknown",
      edges: [...new Map([...(cached?.edges || []), ...edges].map((edge) => [`${edge.startId}:${edge.endId}`, edge])).values()],
    });
  });

  const edgesByType = new Map();
  for (const observation of workflowObservationCache.values()) {
    if (observation.projectId !== body.projectId) continue;
    const edges = edgesByType.get(observation.typeId) || [];
    edgesByType.set(observation.typeId, [...new Map([...edges, ...observation.edges].map((edge) => [`${edge.startId}:${edge.endId}`, edge])).values()]);
  }

  const planned = issues.map((issue) => {
    const typeId = issue.typeId || issue.type || "unknown";
    const direct = directByIssue.get(issue.id) || [];
    const currentStatusId = direct[0]?.startId || issue.statusId;
    const currentStatusName = statusNames.get(currentStatusId) || issue.status || currentStatusId;
    const edges = edgesByType.get(typeId) || direct;
    const common = { ...issue, currentStatusId, currentStatusName, targetStatusId: body.targetStatusId, targetStatusName: statusNames.get(body.targetStatusId) };
    if (currentStatusId === body.targetStatusId) return { ...common, state: "skip", reason: "已经处于目标节点", path: [], allowedTargets: [] };
    const path = findWorkflowPath(edges, currentStatusId, body.targetStatusId);
    if (path && direct.some((edge) => edge.endId === path[0]?.endId)) return { ...common, state: "ready", reason: "正向路径已确认", path, allowedTargets: [] };
    const backwards = findWorkflowPath(edges, body.targetStatusId, currentStatusId);
    return {
      ...common,
      state: "todo",
      reason: backwards ? "目标节点位于当前节点之前，不能回退" : "当前工作流无法确认到目标节点的完整正向路径",
      path: [],
      allowedTargets: reachableWorkflowTargets(edges, currentStatusId).filter((target) => direct.some((edge) => edge.endId === target.path[0]?.endId)),
    };
  });
  return { statuses, targetStatusId: body.targetStatusId, targetStatusName: statusNames.get(body.targetStatusId), items: planned };
}

async function executeIssueWorkflowPlan(body) {
  await ensureActiveClient();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!body.projectId || !items.length) throw new HttpError(400, "缺少项目或执行计划");
  if (items.length > 100) throw new HttpError(400, "单次最多更新 100 个事项");
  const statusTool = activeClient.tool("get_issue_status");
  const workflowTool = activeClient.tool("get_issue_executable_workflows");
  const executeTool = activeClient.tool("execute_issue_workflow");
  if (!statusTool || !workflowTool || !executeTool) throw new HttpError(501, "当前 ONES MCP 缺少状态或工作流工具");
  const statusResult = await callActiveTool(statusTool.name, toolArguments(statusTool, { projectId: body.projectId }));
  const statuses = normalizeStatuses(statusResult);
  const statusNames = new Map(statuses.map((status) => [status.id, status.name]));

  const results = [];
  for (const item of items) {
    const issueId = displayValue(item.issueId);
    const path = Array.isArray(item.path) ? item.path.slice(0, 50) : [];
    const seen = new Set();
    let finalStatusId = displayValue(item.currentStatusId);
    let executedSteps = 0;
    let failure = null;
    try {
      if (!issueId || !path.length) throw new Error("执行路径无效");
      for (const step of path) {
        if (!step?.endId || seen.has(step.endId)) throw new Error("执行路径无效");
        seen.add(step.endId);
      }
      for (const step of path) {
        const listed = await callActiveTool(workflowTool.name, toolArguments(workflowTool, { issueId }));
        const candidates = normalizeWorkflows(listed, statuses);
        const workflow = candidates.find((candidate) => candidate.endId === step.endId && (!finalStatusId || candidate.startId === finalStatusId));
        if (!workflow) { failure = `无法从「${statusNames.get(finalStatusId) || finalStatusId}」正常流转到「${statusNames.get(step.endId) || step.endId}」`; break; }
        const args = toolArguments(executeTool, { issueId, workflowId: workflow.id, targetStatus: workflow.endName });
        await callActiveTool(executeTool.name, args);
        finalStatusId = workflow.endId;
        executedSteps += 1;
      }
    } catch (error) {
      failure = error.message;
    }
    results.push({
      issueId,
      updated: !failure && executedSteps === path.length,
      todo: Boolean(failure),
      reason: failure,
      executedSteps,
      finalStatusId,
      finalStatusName: statusNames.get(finalStatusId) || finalStatusId,
    });
  }
  return { results };
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1_000_000) throw new HttpError(413, "请求体过大");
  }
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "请求 JSON 无效"); }
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function serveStatic(pathname, response) {
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  if (file !== "index.html" && !/^assets\/[\w.-]+$/.test(file)) throw new HttpError(404, "Not found");
  const content = await readFile(new URL(file, STATIC_ROOT));
  response.writeHead(200, {
    "Content-Type": MIME[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(content);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
    if (request.method === "GET" && url.pathname === "/api/oauth/start") return await oauthStart(request, url, response);
    if (request.method === "GET" && url.pathname === "/oauth/callback") return await oauthCallback(url, response);
    if (request.method === "GET" && url.pathname === "/api/session") return sendJson(response, 200, await sessionState());
    if (request.method === "GET") return await serveStatic(url.pathname, response);
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    const body = await readJson(request);
    if (url.pathname === "/api/connect") return sendJson(response, 200, await connect(body));
    if (url.pathname === "/api/issues") return sendJson(response, 200, await listIssues(body));
    if (url.pathname === "/api/issues/workflows/preview") return sendJson(response, 200, await previewIssueWorkflows(body));
    if (url.pathname === "/api/issues/workflows/execute") return sendJson(response, 200, await executeIssueWorkflowPlan(body));
    if (url.pathname === "/api/disconnect") { clearConnection(); return sendJson(response, 200, { disconnected: true }); }
    if (url.pathname === "/api/diagnostics") {
      await ensureActiveClient();
      return sendJson(response, 200, { serverInfo: activeClient.serverInfo, tools: [...activeClient.tools.values()] });
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    sendJson(response, status, { error: error.message || "服务器内部错误", details: error.details });
  }
});

if (process.argv.includes("--self-check")) {
  const [issue] = normalizeIssues({ structuredContent: { data: [{ type: "item", item: {
    uuid: "issue-id", field001: "测试事项", field004: { name: "陈康" },
    field005: { name: "未开始" }, field007: { name: "需求" },
    field011: { uuid: "sprint-id", name: "Sprint 1" },
  } }] } });
  const edges = [
    { id: "w1", startId: "todo", endId: "doing", endName: "进行中" },
    { id: "w2", startId: "doing", endId: "test", endName: "测试中" },
  ];
  if (issue?.id !== "issue-id" || issue.status !== "未开始" || issue.type !== "需求" || issue.iterationId !== "sprint-id"
    || findWorkflowPath(edges, "todo", "test")?.length !== 2 || findWorkflowPath(edges, "test", "todo") !== null
    || reachableWorkflowTargets(edges, "todo").length !== 2 || !isAllowedOauthHostname("192.168.10.20")
    || !isAllowedOauthHostname("localhost") || isAllowedOauthHostname("example.com")
    || OAUTH_SESSION_MAX_AGE !== 604_800_000 || oauthTokenExpiresAt({ expires_in: 3600 }, 1_000) !== 3_601_000) {
    throw new Error("ONESQL 事项解析自检失败");
  }
  console.log("ONESQL 与工作流路径自检通过");
} else {
  server.listen(PORT, HOST, () => {
    console.log(`Orbit 已启动：http://${HOST}:${PORT}`);
    console.log(`ONES MCP：${ONES_MCP_URL}`);
  });
}
