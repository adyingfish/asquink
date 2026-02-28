# ASquink 开发路线图

**当前状态：Phase 3 已完成** ✅
**下一目标：Phase 4 - 视图模式切换**

---

## 项目概览

ASquink 是一个多 Agent 终端管理器，支持本地终端和 SSH 远程连接，集成多个 AI Agent（Claude Code、Codex、Gemini CLI、OpenCode、OpenClaw）。

### 技术栈
- **前端**: Tauri v2 + React + TypeScript + Tailwind CSS
- **后端**: Rust + SQLite + russh + portable-pty
- **终端**: xterm.js

---

## Phase 1：基础架构 ✅ 已完成

### 1.1 项目初始化 ✅
- [x] Tauri v2 + React + TypeScript 项目结构
- [x] Tailwind CSS + Vite 配置
- [x] xterm.js 终端组件集成
- [x] 暗色主题 UI

### 1.2 后端架构 ✅
- [x] `session.rs` - TerminalSession trait 抽象层
- [x] `ssh.rs` - SSH 连接实现（russh，支持密码/私钥认证）
- [x] `pty.rs` - 本地 PTY 实现（portable-pty）
- [x] `database.rs` - SQLite 数据持久化

### 1.3 Tauri IPC 层 ✅
- [x] `list_servers` / `create_server` / `delete_server`
- [x] `create_local_session` / `create_ssh_session`
- [x] `write_to_session` / `resize_session` / `close_session`
- [x] Events: `terminal-data-{id}`, `terminal-closed-{id}`

### 1.4 前端组件 ✅
- [x] Sidebar - 服务器列表 + SSH 连接入口
- [x] TerminalPanel - xterm.js 集成
- [x] 密码认证弹窗
- [x] 终端输入输出实时同步

### 1.5 数据模型 ✅
- [x] `servers` 表 - 服务器配置
- [x] `agents` 表 - Agent 预设
- [x] `sessions` 表 - 会话历史

---

## Phase 2：Claude Code 对接 ✅ 已完成

### 2.1 API Key 管理 ✅
- [x] 系统 Keychain 集成（keyring crate）
- [x] API Key 存储界面（设置页）
- [x] API Key 读取和注入

### 2.2 Claude Code 启动 ✅
- [x] 检测 Claude 安装状态
- [x] 未安装时显示安装指引
- [x] 启动时注入 ANTHROPIC_API_KEY 环境变量
- [x] "启动 Claude" 按钮 UI

### 2.3 会话基础管理 ✅
- [x] 会话状态实时显示（连接中/已连接/已断开）
- [x] 关闭会话功能
- [x] 基本的错误提示

---

## Phase 3：环境抽象与多 Tab ✅ 已完成

### 3.1 环境模型重构 ✅
- [x] 数据库迁移：`servers` 表 → `envs` 表，新增 `type` 字段
- [x] 统一环境列表 UI（本地终端 + SSH 服务器 + WSL）
- [x] 环境在线状态检测
- [x] 快速连接入口
- [x] 环境管理页面

### 3.2 多 Tab 会话管理 ✅
- [x] SessionManager 统一管理活跃会话
- [x] Tab 栏组件：创建/切换/关闭 Tab
- [x] Tab 标题规则：`<env_name>` 或 `<project_name> › <agent>`
- [x] 会话状态同步
- [x] 关闭会话时清理资源
- [x] 历史会话重连功能

### 3.3 项目型 Agent 支持 ✅
- [x] `projects` 表：path + name + env_id
- [x] 项目注册 UI（新建会话时自动创建）
- [x] 项目列表展示（侧边栏）
- [x] 从项目启动 Agent：自动 cd 到项目目录
- [x] Agent 类型区分（项目型 vs 独立型）
- [x] 会话重连时自动启动 Agent

### 3.4 WSL 支持 ✅
- [x] WSL 环境检测和管理
- [x] WSL 分发版列表
- [x] WSL 会话创建
- [x] WSL 环境内 Agent 扫描

### 3.5 UI 优化 ✅
- [x] 新建会话弹窗（三意图选择：项目编码/AI对话/纯终端）
- [x] 测试连接功能
- [x] 会话列表高度修复
- [x] 环境排序（本地终端永远在最上）
- [x] 环境管理页面与终端面板切换交互
- [x] PowerShell 换行符兼容性修复

### 3.6 支持的 Agent
| Agent | 名称 | 类型 | 颜色 |
|-------|------|------|------|
| claude | Claude Code | 项目型 | 🟠 #E8915A |
| codex | Codex | 项目型 | 🟢 #4ADE80 |
| gemini | Gemini CLI | 项目型 | 🔵 #60A5FA |
| opencode | OpenCode | 项目型 | 🩷 #F472B6 |
| openclaw | OpenClaw | 独立型 | 🟣 #C084FC |

---

## Phase 4：视图模式切换 🔜 下一步

**目标：** 项目型 Agent 支持终端/对话双视图

### 4.1 视图模式切换
- [ ] 4.1.1 顶部视图切换：[⌨ 终端] [💬 对话] [◧ 分屏]
- [ ] 4.1.2 视图约束：项目型 Agent 支持三种，独立型仅对话
- [ ] 4.1.3 对话视图组件：消息流（user/agent 区分）+ thinking 状态
- [ ] 4.1.4 消息存储：`messages` 表（session_id, role, text, parts, thinking）

**验收标准：**
- Claude Code 支持终端/对话/分屏切换
- 对话消息能显示 thinking 状态

---

## Phase 5：稳定性与打包

**目标：** 生产可用，跨平台打包

### 5.1 稳定性
- [ ] 5.1.1 SSH 断线检测 + 自动重连
- [ ] 5.1.2 终端自适应窗口大小（resize 实时同步）
- [ ] 5.1.3 会话持久化：重启后恢复未关闭的会话

### 5.2 打包发布
- [ ] 5.2.1 应用图标 + 窗口控制（最小化到托盘）
- [ ] 5.2.2 Linux AppImage 打包
- [ ] 5.2.3 README + 使用文档

**验收标准：**
- SSH 断网后自动重连
- 打包后双击可用

---

## 数据模型

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `envs` | 环境配置 | id, name, type(ssh/local/wsl), host, port, username, auth_type |
| `projects` | 项目配置 | id, name, path, env_id |
| `agents` | Agent 预设 | id, name, color, needs_project |
| `sessions` | 会话历史 | id, env_id, agent_id, project_id, working_dir, started_at, ended_at |
| `messages` | 对话消息 | session_id, role, text, parts, thinking |

---

## 开发命令

```bash
# 开发模式
npm run tauri:dev

# 构建
npm run tauri:build

# 类型检查
npx tsc --noEmit
```

---

## 已知限制

1. **SSH 主机密钥**: 暂自动接受所有密钥（未实现验证）
2. **PTY 异步**: portable-pty 的读写为阻塞实现
3. **错误处理**: 部分错误提示需完善

---

## 更新日志

- **2026-03-01**: PowerShell 换行符兼容性修复，WSL 支持完善
- **2025-02-27**: Phase 3 完成，新建会话弹窗重构，添加 OpenCode Agent
- **2025-02-26**: 环境管理页面完善，测试连接功能
- **2025-02-25**: 多 Tab 会话管理，项目型 Agent 支持
- **2025-02-24**: 环境模型重构，servers → envs
