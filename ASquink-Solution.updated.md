# ASquink — AI 终端代理统一管理平台

## 解决方案说明文档

**版本：** v1.0
**日期：** 2026年2月20日
**文档类型：** 技术解决方案

---

## 目录

1. [项目背景与动机](#1-项目背景与动机)
2. [产品定位与目标用户](#2-产品定位与目标用户)
3. [核心功能概述](#3-核心功能概述)
4. [系统架构设计](#4-系统架构设计)
5. [技术选型与依赖](#5-技术选型与依赖)
6. [连接层详细设计](#6-连接层详细设计)
7. [Agent 管理层详细设计](#7-agent-管理层详细设计)
8. [前端界面设计](#8-前端界面设计)
9. [数据模型设计](#9-数据模型设计)
10. [安全性设计](#10-安全性设计)
11. [核心流程与时序](#11-核心流程与时序)
12. [扩展功能规划](#12-扩展功能规划)
13. [开发路线图](#13-开发路线图)
14. [风险与应对](#14-风险与应对)

---

## 1. 项目背景与动机

### 1.1 行业现状

2025年以来，AI 终端编程代理（Terminal Agent）迎来爆发期。各大 AI 厂商纷纷推出自己的命令行编程助手：

| Agent | 厂商 | 特点 |
|-------|------|------|
| Claude Code | Anthropic | 深度代码理解，支持多文件编辑，强 agentic 能力 |
| Codex CLI | OpenAI | 基于 GPT 模型，擅长代码生成与补全 |
| Gemini CLI | Google | 多模态支持，与 Google 生态集成 |
| OpenClaw | 社区 | 开源方案，可灵活切换后端模型 |

这些 Agent 均以 CLI（命令行界面）形式运行，开发者需要在不同终端中分别启动和管理它们。

### 1.2 痛点分析

当前开发者在使用多个 AI 终端代理时面临以下问题：

**环境碎片化：** 开发者通常同时拥有本地终端、WSL 子系统、多台云服务器等多个开发环境。每个环境中可能需要配置不同的 Agent，管理成本高昂。

**切换成本高：** 在不同 Agent 之间切换需要打开不同终端窗口、切换不同的 API Key 配置、记住不同的命令语法，工作流频繁被打断。

**缺乏统一管理：** API Key 分散存储在各环境的配置文件中，缺乏集中管理。无法方便地对比不同 Agent 在同一任务上的表现，也难以追踪各 Agent 的使用量和费用。

**配置重复：** 在新环境中需要重新安装和配置所有 Agent 工具，无法做到一次配置、处处可用。

### 1.3 项目愿景

ASquink 旨在打造一个统一的桌面应用，让开发者能够在一个界面中连接任意环境、启动任意 AI 终端代理，实现"一个入口，管理所有 AI 编程助手"。

---

## 2. 产品定位与目标用户

### 2.1 产品定位

ASquink 是一款面向开发者的跨平台桌面应用，定位为 **AI 终端代理的统一管理中心**。它不是一个新的 AI Agent，而是所有现有 CLI Agent 的"超级终端"——提供统一的环境连接、Agent 启动、会话管理和配置管理能力。

### 2.2 目标用户画像

**主要用户：全栈开发者 / DevOps 工程师**

- 日常在多台服务器之间切换工作
- 同时使用 2 个以上 AI 编程助手
- 需要在本地、WSL、远程服务器等多种环境中进行开发
- 重视工作效率，希望减少环境配置和切换的时间成本

**次要用户：团队技术负责人**

- 需要为团队统一管理 API Key 和 Agent 配置
- 希望追踪团队的 AI 工具使用情况和费用

### 2.3 核心价值主张

| 价值 | 说明 |
|------|------|
| 统一入口 | 一个应用连接所有环境，启动所有 Agent |
| 零切换成本 | Tab 式多会话管理，即时在不同 Agent/环境间切换 |
| 配置集中化 | API Key、服务器信息、Agent 设置统一管理 |
| 跨平台 | 支持 Windows、macOS、Linux |

---

## 3. 核心功能概述

### 3.1 功能全景

```
ASquink
├── 环境连接管理
│   ├── SSH 远程服务器连接（密码/密钥认证）
│   ├── WSL 子系统连接（支持多发行版）
│   ├── 本地终端（PowerShell / Bash / Zsh）
│   └── 跳板机/代理连接（ProxyJump）
│
├── Agent 生命周期管理
│   ├── Agent 注册与预设配置
│   ├── Agent 安装检测与一键安装
│   ├── Agent 启动与参数配置
│   └── 自定义 Agent 支持
│
├── 终端会话管理
│   ├── 多 Tab 会话（环境 × Agent 组合）
│   ├── 分屏模式（左右/上下分割）
│   ├── 会话持久化与重连
│   └── 会话录制与回放
│
├── 配置与安全
│   ├── 服务器配置管理（增删改查、分组）
│   ├── API Key 加密存储
│   ├── 环境变量模板管理
│   └── 导入/导出配置
│
└── 增强功能
    ├── Agent 输出智能解析（代码块、文件变更提取）
    ├── 快捷 Prompt 面板
    ├── Token 用量与费用追踪
    └── 多 Agent 对比模式
```

### 3.2 MVP（最小可行产品）功能范围

第一版聚焦核心体验，包含以下功能（与 `agreedysquid-ui-v5.jsx` 原型一致）：

- 环境管理：本地终端、WSL、SSH（预留 K8s）统一抽象为“环境（env）”，支持在线状态展示
- 项目注册：为项目型 Agent 绑定项目目录（path）与语言标签
- Agent 预设：Claude Code、Codex CLI、Gemini CLI（项目型）+ OpenClaw（独立型）
- 会话管理：按环境分组的会话列表 + 顶部多 Tab 切换 + 一键新建会话
- 视图模式：项目型 Agent 支持【终端 / 对话 / 分屏】，独立型 Agent 仅【对话】
- 终端对接：本地/WSL PTY，SSH 远端 PTY 转发（可用伪终端模拟先落地）
- 对话消息流：支持 thinking 状态、分段输出（parts）、token 提示
- 会话侧信息面板：连接上下文、同环境会话跳转、token 用量与快捷 Prompt
- API Key/凭据安全存储：Keychain/SecretStore，不落库

---

## 4. 系统架构设计

### 4.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     前端层 (WebView)                          │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ 会话管理  │ │ 终端渲染  │ │ 配置面板   │ │ Agent 启动器  │  │
│  │ (React)  │ │(xterm.js)│ │ (React)   │ │   (React)     │  │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬────────┘  │
│       │            │             │               │            │
├───────┴────────────┴─────────────┴───────────────┴───────────┤
│                    Tauri IPC 层                               │
│              (Commands ↕ Events 双向通信)                      │
├──────────────────────────────────────────────────────────────┤
│                     后端层 (Rust)                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                 SessionManager                        │    │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │    │
│  │  │ SshSession │ │ PtySession │ │   WslSession     │  │    │
│  │  │  (russh)   │ │(portable-  │ │ (portable-pty    │  │    │
│  │  │            │ │   pty)     │ │  + wsl.exe)      │  │    │
│  │  └────────────┘ └────────────┘ └──────────────────┘  │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────┐ ┌──────────────────┐                   │
│  │  AgentLauncher   │ │   ConfigStore    │                   │
│  │  (Agent启动逻辑)  │ │ (配置持久化+加密) │                   │
│  └──────────────────┘ └──────────────────┘                   │
├──────────────────────────────────────────────────────────────┤
│                     系统层                                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────────────────┐ │
│  │ TCP/IP │ │ PTY    │ │ WSL    │ │ OS Keychain           │ │
│  │ (SSH)  │ │(本地)   │ │ API   │ │ (密钥安全存储)         │ │
│  └────────┘ └────────┘ └────────┘ └───────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 分层职责

**前端层（WebView / React）：** 负责所有 UI 渲染和用户交互。终端显示使用 xterm.js，其余界面使用 React 组件。前端不直接处理任何网络连接或进程管理，所有操作通过 Tauri IPC 委托给后端。

**Tauri IPC 层：** 桥接前后端。Commands 用于前端主动调用后端（如连接服务器、发送输入），Events 用于后端主动推送数据到前端（如终端输出流、连接状态变更）。

**后端层（Rust）：** 核心业务逻辑所在。SessionManager 管理所有终端会话的生命周期；AgentLauncher 负责在已建立的终端会话中启动指定 Agent；ConfigStore 管理所有配置数据的持久化和加密。

**系统层：** 操作系统提供的底层能力。SSH 通过 TCP/IP 网络连接远程服务器，PTY 提供本地伪终端，WSL API 提供 Linux 子系统访问，OS Keychain 提供安全的密钥存储。

### 4.3 数据流

以下是用户在远程服务器上使用 Claude Code 的完整数据流：

```
用户键入 "fix the login bug"
    │
    ▼
xterm.js 捕获键入 → onData 回调
    │
    ▼
invoke('send_input', { sessionId, data })
    │
    ▼
Rust SessionManager.send_input()
    │
    ▼
SshSession.write() → SSH Channel → 远程服务器
    │
    ▼
远程服务器上 Claude Code 进程接收输入，执行操作
    │
    ▼
Claude Code 输出结果 → SSH Channel → Rust 读取循环
    │
    ▼
app.emit('terminal-data-{sessionId}', data)
    │
    ▼
前端 listen('terminal-data-{sessionId}') → xterm.js.write(data)
    │
    ▼
用户在终端中看到 Claude Code 的输出
```

---

## 5. 技术选型与依赖

### 5.1 核心技术栈

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 桌面框架 | Tauri | v2.x | 轻量（相比 Electron），原生性能，Rust 后端安全性高 |
| 前端框架 | React | v18+ | 生态成熟，组件化管理复杂 UI |
| 终端模拟 | xterm.js | v5.x | 业界标准（VS Code 同款），完整终端模拟能力 |
| 构建工具 | Vite | v5+ | 极快的 HMR，对 Tauri 支持良好 |
| 样式方案 | Tailwind CSS | v3+ | 快速构建一致性 UI，暗色主题友好 |

### 5.2 Rust 后端依赖

| Crate | 用途 | 说明 |
|-------|------|------|
| `tauri` v2 | 应用框架 | 窗口管理、IPC、打包分发 |
| `russh` v0.45+ | SSH 客户端 | 纯 Rust 异步实现，支持 SSH2 协议全部特性 |
| `russh-keys` v0.45+ | SSH 密钥处理 | 支持 RSA、Ed25519、ECDSA 密钥格式 |
| `portable-pty` v0.8+ | 伪终端 | 跨平台 PTY 实现，用于本地和 WSL 终端 |
| `tokio` v1 | 异步运行时 | 驱动所有异步 I/O 操作 |
| `serde` / `serde_json` | 序列化 | 配置数据和 IPC 消息的序列化 |
| `keyring` v2+ | 密钥存储 | 调用系统 Keychain 安全存储 API Key |
| `sqlx` + SQLite | 数据持久化 | 本地存储服务器配置、Agent 配置、会话历史 |
| `uuid` | ID 生成 | 为每个会话生成唯一标识 |
| `anyhow` / `thiserror` | 错误处理 | 统一的错误类型和传播机制 |

### 5.3 前端依赖

| 包 | 用途 |
|----|------|
| `xterm` | 终端核心渲染 |
| `xterm-addon-fit` | 终端自适应容器大小 |
| `xterm-addon-search` | 终端内搜索 |
| `xterm-addon-web-links` | 自动识别URL并可点击 |
| `@tauri-apps/api` | Tauri 前端 API（invoke、listen） |
| `react-router` | 页面路由 |
| `zustand` | 轻量状态管理 |
| `lucide-react` | 图标库 |

### 5.4 跨平台支持矩阵

| 功能 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 本地 PTY 终端 | ✅ (ConPTY) | ✅ | ✅ |
| WSL 连接 | ✅ | — | — |
| SSH 远程连接 | ✅ | ✅ | ✅ |
| 系统 Keychain | ✅ (Credential Manager) | ✅ (Keychain) | ✅ (Secret Service) |

---

## 6. 连接层详细设计

### 6.1 统一 Session 抽象

所有终端连接类型实现统一的 `TerminalSession` trait，使上层逻辑无需关心底层连接方式：

```rust
#[async_trait]
pub trait TerminalSession: Send + Sync {
    /// 向终端写入数据（用户输入或命令注入）
    async fn write(&self, data: &[u8]) -> Result<()>;

    /// 调整终端窗口大小
    async fn resize(&self, cols: u32, rows: u32) -> Result<()>;

    /// 关闭会话并释放资源
    async fn close(&self) -> Result<()>;

    /// 获取会话状态
    fn status(&self) -> SessionStatus;
}

pub enum SessionStatus {
    Connecting,
    Connected,
    Disconnected,
    Error(String),
}
```

### 6.2 SSH 远程连接

SSH 连接通过 `russh` crate 实现，支持以下认证方式：

**密码认证：** 用户提供用户名和密码，适用于简单场景。

**密钥认证：** 支持 RSA、Ed25519、ECDSA 私钥文件。可配置密钥文件路径和 passphrase。系统默认检查 `~/.ssh/id_rsa`、`~/.ssh/id_ed25519` 等常见路径。

**跳板机连接（ProxyJump）：** 先建立到跳板机的 SSH 连接，再通过跳板机的端口转发连接到目标服务器。支持多级跳转。

连接建立后的关键操作流程：

```
建立 TCP 连接 → SSH 握手 → 认证 → 打开 Channel
→ 请求 PTY (xterm-256color) → 请求 Shell → 就绪
```

PTY 请求中指定终端类型为 `xterm-256color`，初始大小根据前端 xterm.js 容器实际尺寸设定。Shell 启动后，Rust 端启动一个 tokio 任务持续读取 Channel 输出并通过 Tauri Event 推送到前端。

### 6.3 WSL 子系统连接

WSL 连接本质上是在 Windows 主机上启动 `wsl.exe` 进程并将其包装在 PTY 中：

```rust
pub async fn create_wsl_session(
    distro: &str,
    session_id: &str,
    app: &AppHandle,
) -> Result<Box<dyn TerminalSession>> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 40, cols: 120,
        pixel_width: 0, pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new("wsl.exe");
    cmd.args(&["-d", distro, "--cd", "~"]);

    let _child = pair.slave.spawn_command(cmd)?;
    // ... 包装为 TerminalSession
}
```

程序启动时自动检测可用的 WSL 发行版：

```rust
// 获取已安装的 WSL 发行版列表
fn list_wsl_distros() -> Vec<String> {
    let output = Command::new("wsl.exe")
        .args(&["-l", "-q"])
        .output()
        .expect("failed to list WSL distros");
    // 解析输出，返回发行版名称列表
}
```

### 6.4 本地终端连接

本地终端同样使用 `portable-pty` 启动系统默认 Shell：

- **Windows：** 默认启动 PowerShell (`pwsh.exe` 或 `powershell.exe`)，可配置为 CMD
- **macOS：** 默认启动用户 Shell（通常为 zsh）
- **Linux：** 默认启动用户 Shell（通常为 bash）

```rust
pub async fn create_local_session(
    shell: Option<&str>,
    session_id: &str,
    app: &AppHandle,
) -> Result<Box<dyn TerminalSession>> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(default_size())?;

    let shell_path = shell.unwrap_or_else(|| detect_default_shell());
    let mut cmd = CommandBuilder::new(shell_path);

    let _child = pair.slave.spawn_command(cmd)?;
    // ... 包装为 TerminalSession
}
```

### 6.5 Session 管理器

SessionManager 是所有会话的中心管理组件：

```rust
pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, ManagedSession>>>,
}

struct ManagedSession {
    session: Box<dyn TerminalSession>,
    config: SessionConfig,
    created_at: DateTime<Utc>,
    target_env: TargetEnv,
    agent: Option<AgentConfig>,
}

impl SessionManager {
    /// 创建新会话
    pub async fn create(&self, ...) -> Result<String>;

    /// 获取所有活跃会话
    pub async fn list_active(&self) -> Vec<SessionInfo>;

    /// 发送数据到指定会话
    pub async fn send_input(&self, id: &str, data: &[u8]) -> Result<()>;

    /// 调整终端大小
    pub async fn resize(&self, id: &str, cols: u32, rows: u32) -> Result<()>;

    /// 关闭指定会话
    pub async fn close(&self, id: &str) -> Result<()>;

    /// 关闭所有会话（应用退出时调用）
    pub async fn close_all(&self) -> Result<()>;
}
```

---

## 7. Agent 管理层详细设计

### 7.1 Agent 配置模型

每个 Agent 由以下配置定义：

```rust
pub struct AgentConfig {
    /// 唯一标识
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 可执行命令（如 "claude", "codex", "gemini"）
    pub command: String,
    /// 默认启动参数
    pub default_args: Vec<String>,
    /// 必需的环境变量（key → 说明）
    pub required_env: HashMap<String, EnvVarConfig>,
    /// 安装检测命令
    pub install_check_cmd: String,
    /// 安装指引命令
    pub install_cmd: String,
    /// Agent 图标标识
    pub icon: String,
    /// 是否为内置预设
    pub is_builtin: bool,
}

pub struct EnvVarConfig {
    /// 环境变量名
    pub key: String,
    /// 描述说明
    pub description: String,
    /// 是否为敏感信息（如 API Key，需加密存储）
    pub is_secret: bool,
    /// 默认值（如有）
    pub default_value: Option<String>,
}
```

### 7.2 内置 Agent 预设

系统内置以下 Agent 的预设配置，用户开箱即用：

**Claude Code (Anthropic)**

```
命令: claude
安装检测: which claude
安装方式: npm install -g @anthropic-ai/claude-code
环境变量:
  - ANTHROPIC_API_KEY (必需, 敏感)
可选参数:
  --model <model>         指定模型
  --max-turns <n>         最大对话轮次
  --allowedTools <tools>  允许的工具列表
```

**Codex CLI (OpenAI)**

```
命令: codex
安装检测: which codex
安装方式: npm install -g @openai/codex
环境变量:
  - OPENAI_API_KEY (必需, 敏感)
可选参数:
  --model <model>         指定模型
  --approval-mode <mode>  审批模式 (suggest/auto-edit/full-auto)
```

**Gemini CLI (Google)**

```
命令: gemini
安装检测: which gemini
安装方式: npm install -g @anthropic-ai/gemini-cli
环境变量:
  - GOOGLE_API_KEY (必需, 敏感)
可选参数:
  --model <model>         指定模型
```

**OpenClaw (社区)**

```
命令: openclaw
安装检测: which openclaw
安装方式: pip install openclaw
环境变量:
  - 根据后端模型配置不同的 API Key
可选参数:
  --provider <provider>   模型提供方
  --model <model>         指定模型
```

### 7.3 Agent 启动流程

当用户在某个环境中启动 Agent 时，系统按以下步骤执行：

**步骤一：环境检测**

在目标环境中执行 `install_check_cmd`（如 `which claude`），确认 Agent 已安装。如果未安装，提示用户确认后自动执行安装命令。

**步骤二：环境准备**

根据 Agent 配置注入必要的环境变量。对于敏感变量（如 API Key），从系统 Keychain 中读取，通过 `export` 命令注入到终端环境中。

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**步骤三：工作目录切换**

如果用户指定了工作目录，先 `cd` 到该目录：

```bash
cd /path/to/project
```

**步骤四：启动 Agent**

执行 Agent 命令及参数：

```bash
claude --model opus
```

整个过程对用户透明，用户在终端中会看到完整的执行过程。

### 7.4 自定义 Agent 支持

除内置预设外，用户可以注册自定义 Agent。只需提供命令名、参数、环境变量即可。这使得 ASquink 能够支持未来出现的任何新的 CLI Agent，无需等待应用更新。

---

## 8. 前端界面设计

本节以 `agreedysquid-ui-v5.jsx` 中的交互原型为准，统一说明 ASquink 的界面信息架构与关键交互。

### 8.1 整体布局（桌面端）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🦑 agreedysquid / ASquink                                  ⚙ ─ □ ✕     │  ← Titlebar
├───────────────┬───────────────────────────────────────────────────────────┤
│ 侧边栏 Tabs    │  会话 Tabbar: [web-app › Claude] [api-server › Claude] [+]│
│ [会话][环境][项目]├──────────────────────────────────────────────────────────┤
│               │  View Toggle: [⌨ 终端] [💬 对话] [◧ 分屏]                   │
│ 会话分组(按环境)│  ┌─────────────────────────┬───────────────────────────┐ │
│ - WSL Ubuntu   │  │ 终端区(可选)             │ 对话区(可选)              │ │
│   - s1/s2/...  │  │ user@wsl:~/web-app$ ... │ 用户/Agent消息流            │ │
│ - dev-server   │  └─────────────────────────┴───────────────────────────┘ │
│               │                           ┌─────────────────────────────┐ │
│ Agents 列表    │                           │ 右侧 InfoPanel(会话信息)     │ │
│ - Claude Code  │                           │ Connection / Token / Prompt │ │
│ - Codex CLI    │                           └─────────────────────────────┘ │
│ - Gemini CLI   │
│ - OpenClaw     │
├───────────────┴───────────────────────────────────────────────────────────┤
│ Statusbar: Connected · Agent · 环境 · 项目/独立 · ↑/↓ 统计                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.2 侧边栏信息架构

侧边栏顶部提供三类视图切换：

1) 会话（sessions）
- 按环境（env）分组展示会话列表，只展示在线环境下的会话分组。
- EnvGroup 支持折叠/展开（默认展开），并高亮当前激活会话。

2) 环境（envs）
- 展示已添加环境列表（本地终端、WSL、dev-server、prod-cluster 等），包含：图标、名称、细节信息与在线状态。
- 右上 “＋” 入口用于新增环境（后续实现接入向导：本地/WSL/SSH/K8s 等）。

3) 项目（projects）
- 展示已注册项目（path、语言标签、所属环境）。
- 明确提示“项目型 Agent 需要绑定项目目录；独立型 Agent 不需要”。

### 8.3 会话 Tabbar 与上下文提示

- 顶部 Tabbar 一行展示全部会话，点击切换激活会话。
- Tab 标题规则：
  - 项目会话：`<project.name> › <agent.short> + <env.icon>`
  - 独立会话：`<agent.short> › <env.name> + 💬`
- Tabbar 末尾 “＋” 用于新增会话（与侧边栏底部“＋ 新建会话”一致入口）。

### 8.4 视图模式：终端 / 对话 / 分屏

依据 Agent 类型自动约束视图：

- 项目型 Agent（needsProject=true，如 Claude Code / Codex CLI / Gemini CLI）
  - 支持：终端、对话、分屏
  - 切换会话时默认进入终端视图（便于立即执行命令/读写代码）
- 独立型 Agent（needsProject=false，如 OpenClaw）
  - 仅支持：对话
  - 切换会话时自动回落到对话视图（避免出现无意义终端）

### 8.5 对话区（ChatView）

- 消息流区分 user 与 agent：
  - user 消息右对齐气泡
  - agent 消息包含：头像、Agent 名称、可选 thinking 状态条、分段输出（parts）、以及 token 提示（tokens）
- 底部为输入框（textarea）+ 发送按钮，统一走会话级消息通道（后端实现 WebSocket/PTY/HTTP 任选）。

### 8.6 终端区（TerminalView）

- 终端区采用等宽字体与逐行增量渲染（原型中用计时器模拟输出）。
- 真实实现建议：
  - 本地/WSL：基于 PTY（node-pty 或 rust pty）对接 shell
  - 远端：SSH + PTY 转发
  - K8s：kubectl exec 或 API attach

### 8.7 右侧信息面板（InfoPanel）

InfoPanel 固定展示会话关键上下文与快捷操作：

- Connection：环境、Agent、类型（项目型/独立型）、项目路径、语言
- 同环境会话：列出同 env 下其它会话，便于快速跳转/对照
- Token 用量：输入/输出/费用与配额进度条（对接计费/用量统计服务）
- 快捷 Prompt：根据 Agent 类型提供不同快捷模板（项目型偏工程任务，独立型偏内容/分析任务）


## 9. 数据模型设计

本节数据模型按 `agreedysquid-ui-v5.jsx` 中出现的实体抽象为准，并保持可落地到 SQLite 的最小范式。密钥/凭据仍建议落在系统 Keychain/SecretStore，不写入业务库。

### 9.1 核心实体

**envs 表 — 环境配置（原 servers 概念升级为“环境”）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 环境唯一标识（local / wsl / dev / prod 等） |
| name | TEXT | 显示名称（本地终端、WSL Ubuntu、dev-server…） |
| icon | TEXT | 图标（emoji 或图标名） |
| status | TEXT | online / offline |
| detail | TEXT | 详情（OS/版本/IP 等） |
| type | TEXT | local / wsl / ssh / k8s（建议字段） |
| conn_profile | TEXT (JSON) | 连接配置（仅非 local 时需要） |
| created_at | DATETIME | 创建时间 |
| last_seen_at | DATETIME | 最近在线时间 |

注：SSH 私钥路径、token、passphrase 等敏感信息放 Keychain；`conn_profile` 只存引用或非敏感字段。

**projects 表 — 项目注册**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 项目唯一标识（p1/p2…或 UUID） |
| env_id | TEXT FK | 所属环境 |
| path | TEXT | 项目根目录（~/web-app 等） |
| name | TEXT | 展示名（web-app 等） |
| lang | TEXT | 语言/类型标签（TS/Rust/TF/Py/MD…） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**agents 表 — Agent 配置**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | agent 唯一标识（claude/codex/gemini/openclaw…） |
| name | TEXT | 显示名称 |
| short | TEXT | tab 简称 |
| color | TEXT | UI 标识色 |
| needs_project | BOOLEAN | 是否项目型（决定视图能力与会话约束） |
| command | TEXT | 启动命令（CLI/SDK） |
| default_args | TEXT (JSON) | 默认参数 |
| capabilities | TEXT (JSON) | 能力声明（终端/对话/工具调用…） |
| is_builtin | BOOLEAN | 是否内置 |
| created_at | DATETIME | 创建时间 |

**sessions 表 — 会话**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 会话 ID（s1…或 UUID） |
| env_id | TEXT FK | 环境 |
| agent_id | TEXT FK | Agent |
| project_id | TEXT FK NULL | 绑定项目（独立会话为 NULL） |
| view_mode | TEXT | terminal/chat/split（可选持久化） |
| status | TEXT | active/closed |
| started_at | DATETIME | 开始时间 |
| ended_at | DATETIME NULL | 结束时间 |

**messages 表 — 对话消息（ChatView）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 消息 ID |
| session_id | TEXT FK | 所属会话 |
| role | TEXT | user / agent |
| agent_id | TEXT NULL | role=agent 时填充 |
| text | TEXT | 纯文本（用户输入或聚合输出） |
| parts | TEXT (JSON) | 分段输出（原型 msg.parts） |
| thinking | TEXT NULL | thinking 状态（原型 msg.thinking） |
| token_hint | TEXT NULL | token 展示文案（原型 msg.tokens） |
| created_at | DATETIME | 创建时间 |

**usage_daily 表 — 用量统计（支持 InfoPanel/Statusbar）**

| 字段 | 类型 | 说明 |
|------|------|------|
| day | DATE | 日期 |
| agent_id | TEXT | Agent 维度（可选） |
| env_id | TEXT | 环境维度（可选） |
| input_tokens | INTEGER | 输入 tokens |
| output_tokens | INTEGER | 输出 tokens |
| cost_usd | REAL | 费用 |
| updated_at | DATETIME | 更新时间 |

### 9.2 关系与约束

- envs 1—N projects
- envs 1—N sessions
- agents 1—N sessions
- projects 1—N sessions（可选）
- sessions 1—N messages

关键约束（与前端原型一致）：
- needs_project=true 的 agent 创建 session 时必须指定 project_id
- needs_project=false 的 agent 创建 session 时 project_id 必须为 NULL，且 view_mode 强制为 chat

### 9.3 迁移说明（从旧“server”到“env”）

如果已有版本以 servers/session_history 为核心，可按以下兼容策略迁移：
- servers → envs（保留 host/username 等信息映射进 conn_profile）
- session_history.working_dir → sessions.project_id（若能在 projects 表中匹配路径则绑定；否则保持 NULL 并作为独立会话导入）


## 10. 安全性设计

### 10.1 敏感数据保护

**API Key 存储：** 所有 API Key 存储在操作系统原生 Keychain 中（Windows Credential Manager / macOS Keychain / Linux Secret Service）。应用内存中仅在需要时临时读取，使用后不做持久缓存。注入到终端环境时使用 `export` 命令，该命令仅在当前 shell 会话中生效，不会写入持久配置文件。

**SSH 密码/密钥：** SSH 密码同样存储在 Keychain 中。私钥文件保持在用户本地文件系统中，应用仅存储其路径。支持的密钥格式包括 OpenSSH 和 PEM。

**数据库加密：** SQLite 数据库本身不包含敏感信息（密码和 Key 均在 Keychain 中），但可选启用 SQLCipher 对数据库文件加密，防止配置信息泄露。

### 10.2 网络安全

**SSH 主机密钥验证：** 首次连接新服务器时，显示服务器指纹并要求用户确认（类似 ssh 命令的 known_hosts 机制）。已确认的指纹存储在本地 known_hosts 数据库中，后续连接自动验证。指纹不匹配时发出醒目警告。

**端口转发限制：** SSH 连接默认不开启端口转发功能，需要时由用户显式配置。

### 10.3 进程隔离

每个终端会话运行在独立的 PTY 或 SSH Channel 中，相互隔离。一个会话的崩溃不会影响其他会话。Agent 进程的环境变量仅在其所属 Shell 中可见。

---

## 11. 核心流程与时序

### 11.1 应用启动流程

```
应用启动
  │
  ├── 1. 初始化 Tauri 窗口
  ├── 2. 初始化 SQLite 数据库（建表/迁移）
  ├── 3. 初始化 SessionManager（空会话池）
  ├── 4. 加载服务器配置列表
  ├── 5. 加载 Agent 配置列表（内置 + 自定义）
  ├── 6. [仅 Windows] 检测已安装的 WSL 发行版
  ├── 7. 渲染前端界面
  └── 8. 恢复上次打开的会话（可选）
```

### 11.2 新建会话时序

```
前端                    Tauri IPC              Rust 后端
  │                         │                       │
  │  用户点击"新建会话"       │                       │
  │────────────────────────>│                       │
  │                         │  invoke(create_session)│
  │                         │─────────────────────>│
  │                         │                       │
  │                         │      建立终端连接       │
  │                         │    (SSH/PTY/WSL)      │
  │                         │                       │
  │                         │      检测Agent安装     │
  │                         │    (执行install_check) │
  │                         │                       │
  │                         │      注入环境变量       │
  │                         │    (export API_KEY)   │
  │                         │                       │
  │                         │      启动Agent        │
  │                         │    (执行agent命令)     │
  │                         │                       │
  │                         │<─────────────────────│
  │  session_id + 状态       │  Result<session_id>   │
  │<────────────────────────│                       │
  │                         │                       │
  │  创建 xterm.js 实例      │                       │
  │  注册 Event 监听         │                       │
  │                         │                       │
  │                    terminal-data-{id} events     │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
  │                   (持续推送终端输出)               │
```

### 11.3 用户输入数据流时序

```
用户键入字符
    │
    ▼
xterm.js onData(data)
    │
    ▼
invoke('send_input', { sessionId, data })  ── 异步，不等待返回
    │
    ▼
SessionManager.send_input(id, data)
    │
    ├── SSH: channel.data(data)  → 网络传输 → 远程服务器
    ├── PTY: master.write(data)  → 本地进程
    └── WSL: master.write(data)  → WSL进程
    │
    ▼
远程/本地进程产生输出
    │
    ▼
读取循环捕获输出 → app.emit('terminal-data-{id}', output)
    │
    ▼
前端 listen 回调 → xterm.js.write(output)
    │
    ▼
用户在终端中看到响应
```

---

## 12. 扩展功能规划

### 12.1 Agent 输出智能解析

通过分析终端输出流，识别 Agent 产生的结构化内容并在侧边面板中高亮展示：

- **代码块提取：** 识别 Agent 输出中的代码块，提供一键复制功能
- **文件变更预览：** 识别 Agent 提出的文件修改，显示 diff 视图
- **命令执行跟踪：** 识别 Agent 执行的 shell 命令，记录命令历史
- **错误高亮：** 自动识别错误信息并高亮显示

### 12.2 快捷 Prompt 面板

提供常用 Prompt 模板的快速访问面板：

```
┌── 快捷 Prompt ──────────────────────┐
│ 📌 常用                              │
│   "review this file for bugs"       │
│   "write tests for this module"     │
│   "explain this code"               │
│                                      │
│ 📁 项目相关                           │
│   "fix the CI pipeline"             │
│   "update dependencies"             │
│                                      │
│ ✏️ 自定义...                          │
└──────────────────────────────────────┘
```

用户点击后，内容自动填入终端输入。

### 12.3 Token 用量与费用追踪

部分 Agent 在输出中包含 token 使用信息。通过解析这些信息，提供用量仪表盘：

- 按 Agent 分类的 Token 用量统计
- 按时间维度的使用趋势图
- 估算费用计算（基于各厂商公开定价）
- 设置用量预算和告警

### 12.4 多 Agent 对比模式

在分屏模式的基础上增加"同步输入"功能：

- 用户在一个输入框中输入 Prompt
- 同时发送到两个或多个 Agent 会话
- 在分屏终端中同时查看各 Agent 的响应
- 提供对比报告（响应速度、输出长度、代码质量等维度）

### 12.5 团队协作支持（远期）

- 共享服务器配置（加密导出/导入）
- 团队 API Key 池管理
- 会话录制分享（团队成员间分享 Agent 操作过程）

---

## 13. 开发路线图

### Phase 1：基础框架（第 1-2 周）

| 任务 | 说明 |
|------|------|
| 项目初始化 | 创建 Tauri + React + TypeScript 项目结构 |
| 本地 PTY 终端 | 实现 portable-pty 集成，xterm.js 渲染 |
| 单会话终端 | 打通"启动本地终端 → 键盘输入 → 显示输出"完整链路 |
| 基础 UI 框架 | 侧边栏 + Tab 栏 + 终端区域布局 |

### Phase 2：多连接支持（第 3-4 周）

| 任务 | 说明 |
|------|------|
| SSH 连接 | 实现 russh 集成，支持密码和密钥认证 |
| WSL 连接 | 实现 WSL 发行版检测和启动 |
| Session 抽象 | 统一 TerminalSession trait，三种实现 |
| 多 Tab 管理 | 支持同时打开多个会话，Tab 切换 |
| 服务器配置管理 | 添加/编辑/删除服务器配置的 UI 和持久化 |

### Phase 3：Agent 集成（第 5-6 周）

| 任务 | 说明 |
|------|------|
| Agent 配置系统 | 内置预设 + 自定义 Agent 配置 |
| Agent 安装检测 | 在目标环境中检测 Agent 安装状态 |
| Agent 启动流程 | 环境变量注入 + 命令启动 |
| API Key 管理 | Keychain 集成，API Key 安全存储和读取 |
| 新建会话向导 | 环境选择 → Agent 选择 → 配置 → 启动 |

### Phase 4：体验优化（第 7-8 周）

| 任务 | 说明 |
|------|------|
| 终端体验优化 | 搜索、URL识别、字体配置、主题切换 |
| 分屏模式 | 水平/垂直分屏 |
| 连接稳定性 | SSH 断线重连、心跳检测 |
| 性能优化 | 大量输出时的渲染性能、内存管理 |
| 打包分发 | Windows/macOS/Linux 安装包构建 |

### Phase 5：扩展功能（第 9-12 周）

| 任务 | 说明 |
|------|------|
| 会话录制/回放 | 终端输出流记录和回放功能 |
| 快捷 Prompt 面板 | 常用 Prompt 模板管理 |
| 输出智能解析 | 代码块提取、文件变更预览 |
| Token 用量追踪 | 使用统计和费用估算 |
| 多 Agent 对比 | 同步输入 + 分屏对比 |

---

## 14. 风险与应对

### 14.1 技术风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| Agent CLI 接口变更 | Agent 启动失败或功能异常 | Agent 配置外置化，用户可自行更新命令和参数；内置配置通过应用更新同步 |
| SSH 连接不稳定 | 会话中断，Agent 操作丢失 | 实现自动重连机制；SSH Keep-Alive 心跳；建议用户配合 tmux/screen 使用 |
| PTY 跨平台兼容性 | Windows 上部分终端特性不工作 | 使用 ConPTY（Windows 10+）；充分测试各平台；提供降级方案 |
| xterm.js 渲染性能 | 大量输出时卡顿 | 启用 WebGL 渲染器；实现输出节流；限制回滚缓冲区大小 |

### 14.2 产品风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| AI Agent 市场格局快速变化 | 新 Agent 出现，旧 Agent 停更 | 自定义 Agent 机制确保可扩展性；保持对新 Agent 的关注和快速适配 |
| 各 Agent 定价策略变化 | 费用追踪不准确 | 费用追踪标注为"估算"；提供手动更新定价的入口 |
| 用户安全顾虑 | 担心 API Key 泄露 | 透明的安全架构说明；使用系统级 Keychain；开源安全相关模块供审计 |

### 14.3 竞品风险

| 潜在竞品 | 差异化策略 |
|----------|-----------|
| 各 Agent 厂商自建 GUI | ASquink 的价值在于"统一"——不绑定任何单一厂商 |
| VS Code 终端插件 | ASquink 更轻量、专注，不依赖 IDE；支持独立窗口和多服务器管理 |
| Warp / iTerm2 等终端 | 这些是通用终端，ASquink 专注 AI Agent 场景，提供 Agent 感知的增强功能 |

---

## 附录 A：项目结构参考

```
asquink/
├── src/                          # 前端源码
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── EnvList.tsx       # 环境列表
│   │   │   ├── AgentList.tsx     # Agent 列表
│   │   │   └── Sidebar.tsx       # 侧边栏容器
│   │   ├── Terminal/
│   │   │   ├── XtermTerminal.tsx # xterm.js 封装
│   │   │   ├── TerminalTabs.tsx  # Tab 管理
│   │   │   └── SplitView.tsx     # 分屏容器
│   │   ├── Dialogs/
│   │   │   ├── NewSession.tsx    # 新建会话向导
│   │   │   ├── ServerConfig.tsx  # 服务器配置编辑
│   │   │   └── AgentConfig.tsx   # Agent 配置编辑
│   │   └── StatusBar.tsx         # 底部状态栏
│   ├── stores/
│   │   ├── sessionStore.ts       # 会话状态管理
│   │   ├── configStore.ts        # 配置状态管理
│   │   └── uiStore.ts            # UI 状态管理
│   ├── hooks/
│   │   ├── useTerminal.ts        # 终端逻辑 Hook
│   │   └── useTauriEvents.ts     # Tauri 事件监听 Hook
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # Tauri 入口，注册 Commands
│   │   ├── session/
│   │   │   ├── mod.rs            # Session 模块入口
│   │   │   ├── traits.rs         # TerminalSession trait
│   │   │   ├── ssh.rs            # SSH 实现
│   │   │   ├── pty.rs            # 本地 PTY 实现
│   │   │   ├── wsl.rs            # WSL 实现
│   │   │   └── manager.rs        # SessionManager
│   │   ├── agent/
│   │   │   ├── mod.rs            # Agent 模块入口
│   │   │   ├── config.rs         # Agent 配置模型
│   │   │   ├── launcher.rs       # Agent 启动逻辑
│   │   │   └── builtins.rs       # 内置 Agent 预设
│   │   ├── config/
│   │   │   ├── mod.rs            # 配置模块入口
│   │   │   ├── database.rs       # SQLite 操作
│   │   │   └── keychain.rs       # 系统 Keychain 操作
│   │   └── commands.rs           # Tauri Command 定义
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── README.md
```

## 附录 B：Tauri Command 接口清单

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `create_session` | target, agent_id, working_dir | session_id | 创建新终端会话并启动 Agent |
| `close_session` | session_id | — | 关闭指定会话 |
| `send_input` | session_id, data | — | 向终端发送输入 |
| `resize_terminal` | session_id, cols, rows | — | 调整终端大小 |
| `list_sessions` | — | SessionInfo[] | 获取所有活跃会话 |
| `list_servers` | — | ServerConfig[] | 获取服务器配置列表 |
| `save_server` | config | server_id | 保存服务器配置 |
| `delete_server` | server_id | — | 删除服务器配置 |
| `list_agents` | — | AgentConfig[] | 获取 Agent 配置列表 |
| `save_agent` | config | agent_id | 保存 Agent 配置 |
| `check_agent_installed` | agent_id, target | bool | 检测 Agent 是否已安装 |
| `save_api_key` | agent_id, key_name, value | — | 安全存储 API Key |
| `list_wsl_distros` | — | String[] | 获取 WSL 发行版列表 |
| `get_default_shell` | — | String | 获取系统默认 Shell |

## 附录 C：Tauri Event 清单

| Event | 方向 | 数据 | 说明 |
|-------|------|------|------|
| `terminal-data-{id}` | 后端 → 前端 | String (终端输出) | 持续推送终端输出数据 |
| `terminal-closed-{id}` | 后端 → 前端 | — | 终端连接关闭通知 |
| `session-status-{id}` | 后端 → 前端 | SessionStatus | 会话状态变更通知 |
| `agent-detection-{id}` | 后端 → 前端 | DetectionResult | Agent 安装检测结果 |

---

*本文档持续更新，随项目进展同步完善细节设计。*
