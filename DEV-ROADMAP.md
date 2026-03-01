# ASquink 开发路线图

**当前状态**: Phase 4 进行中
**当前重点**: ACP Agent 半真实接入、项目型 Agent 视图约束、ACP 管理页收口
**最后更新**: 2026-03-01

---

## 项目概览

ASquink 是一个多 Agent 终端与对话管理器，支持本地终端、WSL、SSH 环境，以及多种本地 CLI Agent / ACP Agent 的统一会话管理。

### 技术栈
- 前端: Tauri v2 + React + TypeScript + Tailwind CSS
- 后端: Rust + SQLite
- 终端: xterm.js + portable-pty
- 远程连接: russh

---

## 当前开发结论

### 已完成
- 环境模型已从 `servers` 统一到 `envs`
- 多 Tab 会话管理、历史恢复、项目型会话已经稳定可用
- 本地终端、SSH、WSL 三类环境都已接入
- 项目型 CLI Agent 已支持自动启动和会话恢复
- `ACP Agent` 已接入新建会话流程，可在“在项目中编码”中选择
- `ACP Agent` 会话已限制为仅对话视图，不支持终端和分屏
- ACP 管理页已从纯 mock 演示升级为“半真实版”
- Windows 下 CLI Agent 版本探测已增强，`claude/codex/gemini/opencode` 版本显示更稳定

### 当前边界
- ACP 会话目前仍是 chat-only UI，不是完整 ACP 协议通信
- ACP 管理页当前的“connected”表示检测到本地相关进程，不代表已完成 ACP 握手
- ACP endpoint、模型列表、连接控制、配置同步仍未接入真实后端
- `EnvManagePage.tsx` 里仍有少量旧 mock 结构残留，虽然不影响当前功能

### 当前建议的下一步
1. 把 ACP 会话从 chat 占位视图升级为真实 ACP 消息收发
2. 把 ACP 管理页的连接状态从“进程检测”升级为“握手状态”
3. 清理 ACP 管理页中残留的 mock 数据结构与未使用组件

---

## Phase 1: 基础架构

### 1.1 项目初始化
- [x] Tauri v2 + React + TypeScript 基础工程
- [x] Tailwind CSS + Vite 配置
- [x] xterm.js 集成
- [x] 深色主题基础 UI

### 1.2 后端基础能力
- [x] 本地 PTY 会话管理
- [x] SSH 会话管理
- [x] SQLite 持久化
- [x] Tauri IPC 基础命令

### 1.3 数据模型
- [x] `envs`
- [x] `projects`
- [x] `agents`
- [x] `sessions`
- [ ] `messages`

---

## Phase 2: CLI Agent 接入

### 2.1 Agent 检测与启动
- [x] 本地 Agent 扫描
- [x] 已安装状态显示
- [x] 版本号探测
- [x] 项目型 Agent 自动启动

### 2.2 已接入 Agent
- [x] Claude Code
- [x] Codex
- [x] Gemini CLI
- [x] OpenCode
- [x] OpenClaw

### 2.3 Windows 兼容性
- [x] PowerShell 换行兼容修复
- [x] `--version` 直接探测
- [x] Windows 下 `cmd /c` 兜底探测
- [x] npm 全局包 `package.json` 版本兜底

---

## Phase 3: 环境抽象与多会话管理

### 3.1 环境层
- [x] `servers -> envs` 迁移
- [x] Local / WSL / SSH 统一环境列表
- [x] 环境状态检测
- [x] 环境管理页

### 3.2 会话层
- [x] 多 Tab 会话管理
- [x] 会话关闭与资源清理
- [x] 历史会话恢复
- [x] 项目型会话标题规则

### 3.3 项目型 Agent
- [x] 项目注册与关联环境
- [x] 新建会话时按项目启动 Agent
- [x] 会话恢复时按 Agent 类型决定是否自动启动
- [x] Agent 元信息统一到 `src/utils/agents.ts`

---

## Phase 4: 视图模式与 ACP Agent

**状态**: 进行中

### 4.1 视图模式
- [x] 会话层支持 `terminal` / `chat` 模式区分
- [x] 普通项目型 CLI Agent 默认走终端模式
- [x] `ACP Agent` 默认走聊天模式
- [x] `ACP Agent` 不支持终端 / 分屏切换
- [ ] 通用消息存储模型 `messages`
- [ ] 完整聊天消息流渲染

### 4.2 ACP Agent 接入
- [x] `ACP Agent` 已加入统一 Agent 注册表
- [x] 新建会话时可选择 `ACP Agent`
- [x] 历史会话恢复时识别 `ACP Agent`
- [x] 顶部标签与主视图区分 `ACP Agent`
- [x] 数据库内置 `acp` Agent 记录
- [ ] 真实 ACP 协议握手
- [ ] ACP 会话消息收发
- [ ] 项目上下文透传到 ACP 会话

### 4.3 ACP 管理页
- [x] 固定展示 4 个 ACP Agent 条目
- [x] 顺序固定为 `Claude Code -> Codex -> Gemini CLI -> OpenCode`
- [x] 检测完成后按“已连接在上，未连接在下”排序
- [x] 初始化时不再空白，先显示骨架条目
- [x] 图标统一为 `Bot`
- [x] 颜色与“此环境中的 Agent”区域统一
- [x] 检测提示放在 ACP Agent 列表底部
- [x] 接入后端 `list_acp_agents`
- [x] 显示真实安装状态和版本号
- [x] 不再展示 PID 和关联会话数
- [ ] 去掉页面中残留的旧 mock 结构
- [ ] 连接/断开按钮接真实行为
- [ ] 显示真实 endpoint / handshake / model metadata

### 4.4 ACP 状态定义
- [x] `not_installed`: 本机未安装对应 CLI
- [x] `disconnected`: 已安装，但未检测到相关运行进程
- [x] `connected`: 已安装，且检测到本地相关运行进程
- [ ] `connected` 切换为真实 ACP 握手状态

---

## Phase 5: 稳定性与发布

### 5.1 稳定性
- [ ] SSH 断线检测与自动重连
- [ ] 会话异常恢复
- [ ] 更完整的错误提示与诊断
- [ ] 环境 / Agent 扫描的超时与重试策略

### 5.2 发布准备
- [ ] 应用图标与窗口控制细化
- [ ] 构建产物整理
- [ ] README 与使用文档更新
- [ ] 安装与排障说明

---

## 当前 Agent 矩阵

| Agent | 类型 | 启动方式 | 默认模式 | 当前状态 |
|------|------|------|------|------|
| Claude Code | 项目型 | CLI | terminal | 已接入 |
| Codex | 项目型 | CLI | terminal | 已接入 |
| Gemini CLI | 项目型 | CLI | terminal | 已接入 |
| OpenCode | 项目型 | CLI | terminal | 已接入 |
| ACP Agent | 项目型 | ACP | chat | 半真实接入 |
| OpenClaw | 独立型 | CLI | chat | 已接入 |

---

## 当前数据模型

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `envs` | 环境配置 | `id`, `name`, `type`, `host`, `port`, `username` |
| `projects` | 项目配置 | `id`, `name`, `path`, `env_id` |
| `agents` | Agent 预设 | `id`, `name`, `command`, `is_builtin` |
| `sessions` | 会话历史 | `id`, `env_id`, `agent_id`, `project_id`, `working_dir`, `started_at`, `ended_at` |
| `messages` | 对话消息 | 计划中，尚未正式接入 |

---

## 验证基线

- [x] `npm.cmd run build`
- [x] `cargo check`
- [ ] ACP 真实协议联调
- [ ] 多平台回归验证

---

## 最近更新

- **2026-03-01**
  - `ACP Agent` 接入新建会话流程
  - `ACP Agent` 会话收口为 chat-only
  - Agent 注册表迁移到 `src/utils/agents.ts`
  - ACP 管理页改为固定 4 条目 + 半真实检测
  - 新增后端 `list_acp_agents`
  - Windows 下 Agent 版本探测增强
  - ACP 列表 UI 细节调整完成
- **2025-02-27**
  - Phase 3 完成，多环境与项目型会话结构稳定
- **2025-02-24 ~ 2025-02-26**
  - 环境模型重构、WSL 接入、环境管理页完善
