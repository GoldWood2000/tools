# Orbit · ONES 迭代工作台

一个零依赖的交互原型，用于验证以下流程：

1. 连接 ONES；
2. 选择项目和迭代；
3. 筛选与当前用户相关的事项；
4. 全选或多选事项；
5. 选择项目状态并预检每个事项的正向流转路径；
6. 对回退、路径缺失或分支不明确的事项生成 TODO，并重新选择可达节点；
7. 确认后逐事项、逐节点校验并执行工作流；
8. 汇总成功与转为 TODO 的结果。

## 本地运行

```bash
npm start
```

打开 <http://localhost:4173>，点击“使用 ONES OAuth 授权”。页面通过 OAuth Authorization Code + PKCE 连接 `https://sz.ones.cn/mcp`，Access Token 只保存在本机 Node 进程内存中。

需要从局域网 IP 访问时，可指定本机当前 IP 启动：

```bash
ORBIT_HOST=192.168.x.x npm start
```

工作流规则的最小自检可通过 <http://localhost:4173/?self-check=1> 运行，浏览器控制台不应出现断言错误。

## 接入真实 ONES MCP

`server.js` 实现了 MCP Streamable HTTP 初始化、工具发现和调用，页面不会直接接触远程 MCP。演示模式仍可在没有凭据时使用。

| 页面动作 | ONES MCP 工具 |
| --- | --- |
| 获取项目 | `search_for_projects` |
| 获取迭代 | `search_for_sprints` |
| 获取分配给当前用户的事项 | `get_onesql_grammar_help` + `query_issues_by_onesql` |
| 获取项目全部状态 | `get_issue_status` |
| 校验可执行流转 | `get_issue_executable_workflows` |
| 执行状态流转 | `execute_issue_workflow` |

ONES MCP 没有提供完整工作流图接口。本原型会从当前项目的真实事项中按“事项类型 + 当前状态”选择代表事项，读取其可执行下一跳并合并为状态图。只有能够证明为正向路径的事项会进入执行计划；目标在当前节点之前、路径不完整或分支无法确认时会生成 TODO。用户确认执行后，每一步都会重新读取该事项当前可执行的 workflow，远端状态若已变化就立即停止，不会强行跳转。

页面调用的本地接口：

| 接口 | 用途 |
| --- | --- |
| `POST /api/issues` | 读取项目迭代、事项和全部状态 |
| `POST /api/issues/workflows/preview` | 只读采样状态图并生成逐事项计划 |
| `POST /api/issues/workflows/execute` | 按已确认路径逐步重新校验并执行 |

不要把 ONES Open API Token 或“Token 授权客户端”生成的 Token 直接作为 MCP Bearer Token。该服务公开的授权方式为 OAuth Authorization Code；页面会自动完成注册、跳转和 Token 交换，不需要手动填写 Token。
