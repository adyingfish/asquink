# ACP Agent 功能实现说明

## 1. 文档目的

这份文档专门说明 ASquink 中 `ACP Agent` 功能应如何实现、当前做到哪里、后续该按什么顺序开发。

这里的 `ACP`，在本项目里按 `Agent Client Protocol` 理解。

ACP 官方文档连接地址：https://agentclientprotocol.com

目标不是继续做一个“ACP 风格 UI”，而是把 ASquink 从“能检测本地 agent”推进到“能作为 ACP client 与 agent 正式通信”。

---

## 2. 当前实现状态

### 2.1 已完成

- `ACP Agent` 已加入统一 Agent 注册表
- 新建会话时可以选择 `ACP Agent`
- `ACP Agent` 会话默认使用 `chat` 模式
- `ACP Agent` 不支持终端和分屏
- 顶部标签、侧边栏、主视图已识别 `ACP Agent`
- 数据库 `agents` 表已有内置 `acp` 记录
- 环境与 Agent 管理页已有 ACP 专区
- ACP 管理页已经能显示真实安装状态和版本号
- Windows 下版本探测已做兼容处理

### 2.2 当前只是“半真实版”

目前系统还没有真正跑 ACP 协议链路。

当前 ACP 管理页里的状态本质上是：

- `not_installed`: 未安装 CLI
- `disconnected`: 已安装，但未检测到相关进程
- `connected`: 已安装，并检测到相关本地进程

这里的 `connected` 只是“进程存在”，不是“ACP 握手成功”。

### 2.3 当前缺失

- 没有 ACP runtime 模块
- 没有真实 handshake
- 没有 ACP session 生命周期管理
- 没有消息发送 / 流式接收
- 没有 `messages` 持久化
- 没有会话恢复后的消息恢复
- 管理页还没有真实连接控制

---

## 3. 目标定义

完整的 ACP Agent 功能，应该满足下面这条链路：

1. 用户在项目中创建 `ACP Agent` 会话
2. 后端启动或连接指定 agent
3. ASquink 与 agent 完成 ACP 握手
4. 前端聊天窗口可以发送消息
5. agent 的回复以流式方式回到前端
6. 消息持久化到数据库
7. 会话关闭、重开、恢复时状态一致
8. 管理页显示真实连接状态，而不是仅显示进程状态

---

## 4. 总体架构

建议把 ACP 功能拆成 4 层。

### 4.1 Agent 定义层

当前已有：

- `src/utils/agents.ts`

职责：

- 定义 agent 元信息
- 区分 `cli` 和 `acp`
- 决定默认会话模式
- 决定是否自动按 CLI 启动

后续可继续保留这层作为前端单一配置源。

### 4.2 ACP Runtime 层

建议新增：

- `src-tauri/src/acp.rs`

职责：

- 启动 ACP agent 子进程
- 建立 stdio 通道
- 进行 ACP handshake
- 维护请求 id 与响应映射
- 接收 agent 事件并转发给前端
- 管理 session 的关闭、超时、异常退出

这是 ACP 功能真正的核心。

### 4.3 ACP Session 层

需要把 ACP 会话从普通 PTY 会话里区分出来。

建议在后端状态里增加：

- `acp_sessions: Arc<Mutex<HashMap<String, AcpSession>>>`

`AcpSession` 需要包含：

- `session_id`
- `agent_id`
- `project_id`
- `working_dir`
- `child process handle`
- `stdin writer`
- `runtime state`
- `handshake status`

### 4.4 Chat UI 层

当前已有 chat-only 外壳：

- `src/components/TerminalView.tsx`

后续职责：

- 发送消息
- 显示消息列表
- 显示流式输出
- 显示错误态 / 重试态
- 会话恢复时回填历史消息

---

## 5. 推荐的后端实现方案

## 5.1 新增模块

建议新增文件：

- `src-tauri/src/acp.rs`

建议拆分结构：

- `AcpManager`
- `AcpSession`
- `AcpClientMessage`
- `AcpServerMessage`
- `AcpHandshakeState`

## 5.2 Tauri 命令

建议新增这些命令：

- `create_acp_session`
- `send_acp_message`
- `close_acp_session`
- `list_acp_agents`
- `refresh_acp_agent_status`

其中：

- `list_acp_agents` 已有，但目前还是检测型实现
- 后续应补真实握手状态和错误信息

## 5.3 事件模型

建议使用 Tauri event 向前端推送 ACP 数据。

例如：

- `acp-session-opened-{sessionId}`
- `acp-message-delta-{sessionId}`
- `acp-message-complete-{sessionId}`
- `acp-session-error-{sessionId}`
- `acp-session-closed-{sessionId}`

这样前端不需要主动轮询。

## 5.4 子进程与通信

ACP 建议按“子进程 + stdio”实现。

典型流程：

1. 启动 agent 可执行命令
2. 拿到 `stdin/stdout/stderr`
3. runtime 写 JSON-RPC 请求到 `stdin`
4. 持续读取 `stdout`
5. 解析消息并分发到对应 session

需要特别处理：

- Windows 下命令入口差异
- agent 退出
- 超时
- 输出不是合法 JSON 的异常情况

## 5.5 握手状态

建议把握手状态显式建模：

- `starting`
- `handshaking`
- `ready`
- `error`
- `closed`

然后把 ACP 管理页和聊天页都绑定到这套状态，而不是继续用“有没有进程”代替。

---

## 6. 推荐的前端实现方案

## 6.1 会话创建

当前 `ACP Agent` 会话只是创建了一个 chat 模式会话。

后续应该改成：

1. 用户新建 ACP 会话
2. 前端调用 `create_acp_session`
3. 后端返回真实 `session_id`
4. 前端订阅该 session 的 ACP 事件
5. 聊天窗口进入 ready / loading / error 状态

涉及文件：

- `src/App.tsx`
- `src/components/Sidebar.tsx`

## 6.2 聊天消息状态

建议前端消息模型至少包含：

- `id`
- `sessionId`
- `role`
- `content`
- `status`
- `createdAt`

其中 `status` 可以有：

- `pending`
- `streaming`
- `done`
- `error`

## 6.3 聊天视图

`src/components/TerminalView.tsx` 里当前的 chat-only 区域需要升级为真实对话面板。

至少包含：

- 消息列表
- 输入框
- 发送按钮
- streaming 占位
- 错误提示
- 重新发送

## 6.4 管理页

`src/components/EnvManagePage.tsx` 后续应承担真实 ACP 连接态展示：

- 是否安装
- 当前 handshake 状态
- 最后错误信息
- 版本号
- 可用模型
- 当前 active model

同时需要清理当前残留的 mock 结构。

---

## 7. 数据库设计建议

## 7.1 保留现有 `agents`

`agents` 表先不要重做。

它当前适合继续保存：

- `id`
- `name`
- `command`
- `is_builtin`

## 7.2 新增 `messages`

建议新增 `messages` 表：

| 字段 | 用途 |
|------|------|
| `id` | 消息主键 |
| `session_id` | 所属会话 |
| `role` | `user/assistant/system` |
| `content` | 消息正文 |
| `status` | `pending/streaming/done/error` |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

如果后续需要更丰富结构，再补：

- `parts_json`
- `tool_calls_json`
- `metadata_json`

## 7.3 可选的 ACP 会话扩展

如果后续需要更细状态，可以考虑给 `sessions` 补字段，或者单独建 `acp_session_meta`：

- `handshake_status`
- `last_error`
- `agent_version`
- `protocol_version`

---

## 8. 推荐开发顺序

不要同时做 UI、协议、存储三条线，容易失控。

建议按下面顺序推进。

### 第一步：后端骨架

- 新增 `src-tauri/src/acp.rs`
- 定义 `AcpSession`
- 定义 `create_acp_session`
- 完成子进程启动和关闭
- 先打通“创建 session -> 启动 agent -> 关闭 session”

验收：

- 可以稳定启动 / 关闭 ACP agent
- 出错时能返回明确错误

### 第二步：握手

- 加入 ACP handshake
- 引入 `ready/error` 状态
- 让管理页和聊天页都能读取握手结果

验收：

- `connected` 不再依赖进程检测
- 管理页可显示真实握手结果

### 第三步：消息流

- 实现 `send_acp_message`
- 实现流式事件转发
- 前端聊天页接入 streaming

验收：

- 可以发一条消息并收到流式回复

### 第四步：持久化

- 新增 `messages` 表
- 消息入库
- 会话恢复时加载历史消息

验收：

- 重开应用后能恢复 ACP 会话消息历史

### 第五步：管理页完善

- 清理 mock 残留
- 显示真实 endpoint / protocol / model metadata
- 连接 / 断开按钮接真实行为

验收：

- 管理页信息与真实运行状态一致

---

## 9. 当前最值得先做的任务

如果现在继续开发，我建议优先做这 3 项：

1. 新建 `src-tauri/src/acp.rs`，把 ACP 生命周期从 `main.rs` 拆出去
2. 打通 `create_acp_session`
3. 落 `messages` 表，为后续真实 chat 做准备

原因很直接：

- 不先拆 runtime，后面逻辑会继续堆在 `main.rs`
- 不先打通 session，就只能继续停留在 chat 占位界面
- 不先落消息存储，后续聊天页会反复返工

---

## 10. 风险与注意事项

### 10.1 不要把“进程检测”误当成“协议连接”

这是当前实现最容易误导的地方。

检测到 `claude/codex/gemini/opencode` 进程，只能说明命令在运行，不能说明：

- ACP 已握手
- 当前 session 可用
- 消息可以正常发送

### 10.2 不要把 ACP 会话混进 PTY 会话模型

PTY 是字节流终端，ACP 是结构化协议。

两者生命周期和数据流不同，建议独立建模。

### 10.3 先完成最小闭环，再做丰富信息

先保证：

- 建会话
- 握手
- 发消息
- 收消息

再去做：

- 模型列表
- 余额
- 高级 metadata
- 管理页复杂交互

---

## 11. 一句话总结

ASquink 当前的 `ACP Agent` 已经完成了“入口接入 + 管理页半真实检测 + chat-only 会话收口”，但还没有进入真正的 ACP 协议阶段。

后续开发应以 `acp.rs + 真实 session + 消息流 + messages 持久化` 为主线推进，而不是继续优先堆 UI。

---

## 12. 2026-03-02 Correction

This document should not treat `ACP Agent` as one fixed backend anymore.

The correct model is:

- `agent_id = acp` means the session uses ACP chat mode
- `acp_agent_id` stores the concrete ACP runtime/provider selected for that session
- The "project coding" flow must allow choosing any installed/configured ACP provider
- Session persistence and reconnect must restore the selected `acp_agent_id`
- Backend runtime selection must be per session, not globally hardcoded

Tracked ACP providers:

- `claude`
- `codex`
- `gemini`
- `opencode`

Provider detection also needs two separate states:

- CLI installed: the base provider command such as `claude` or `codex` exists locally
- ACP runtime available: the command that can actually speak ACP is available for session startup

The management UI must not treat "CLI installed" and "ACP runtime available" as the same thing.
For example, `claude` and `codex` may be present locally while still lacking the ACP adapter/runtime needed for ASquink to start an ACP session.

On Windows hosts, ACP detection and launch should also distinguish:

- Windows-installed runtimes
- WSL-installed runtimes, scoped to a concrete distro

When the user selects a WSL project/environment, the ACP runtime should be scanned and launched inside that WSL distro instead of assuming the Windows-side install.
WSL ACP should not auto-scan every distro. The user must explicitly choose one WSL environment in ACP settings, and only that single configured WSL environment may be used for ACP until the user switches it.
