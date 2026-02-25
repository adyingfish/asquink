# AgentHub MVP 开发清单（精简版）

**当前状态：Phase 1 & 2 已完成 ✅**
- Tauri + React 项目结构
- SSH/本地终端连接（TerminalSession trait）
- Claude Code 启动与对话

**MVP 目标：** 多环境统一管理 + 多 Tab 会话 + 项目型 Agent 绑定

---

## Phase 3：环境抽象与多 Tab（MVP 核心）

**目标：** 从单一 SSH 连接升级到"环境"概念，支持多会话 Tab

### 3.1 环境模型重构（envs 替代 servers）
- [ ] 3.1.1 数据库迁移：`servers` 表 → `envs` 表，新增 `type` 字段（ssh/local）
- [ ] 3.1.2 统一环境列表 UI（侧边栏显示所有环境：本地终端 + SSH 服务器）
- [ ] 3.1.3 环境在线状态检测（ping/连接测试）
- [ ] 3.1.4 快速连接入口（点击环境直接新建会话）

### 3.2 多 Tab 会话管理
- [ ] 3.2.1 SessionManager 统一管理活跃会话
- [ ] 3.2.2 Tab 栏组件：创建/切换/关闭 Tab
- [ ] 3.2.3 Tab 标题规则：`<env_name>` 或 `<project_name> › <agent>`
- [ ] 3.2.4 会话状态同步（连接中/已连接/已断开）
- [ ] 3.2.5 关闭会话时清理资源

### 3.3 项目型 Agent 基础支持
- [ ] 3.3.1 `projects` 表：path + name + lang + env_id
- [ ] 3.3.2 项目注册 UI（选择环境 → 输入路径 → 设置语言）
- [ ] 3.3.3 项目列表展示（侧边栏【项目】Tab）
- [ ] 3.3.4 从项目启动 Agent：自动 `cd` 到项目目录再启动
- [ ] 3.3.5 `agents.needs_project` 字段：区分项目型（Claude）vs 独立型（OpenClaw）

**Phase 3 验收：**
- 侧边栏看到【环境】列表（本地 + SSH）
- 点击环境新建 Tab → 连接成功
- 注册项目 → 从项目启动 Claude → 自动进入项目目录
- 同时开多个 Tab（不同环境/不同项目）

---

## Phase 4：视图模式与会话信息（MVP 增强）

**目标：** 项目型 Agent 支持终端/对话双视图，右侧信息面板

### 4.1 视图模式切换
- [ ] 4.1.1 顶部视图切换：[⌨ 终端] [💬 对话] [◧ 分屏]
- [ ] 4.1.2 视图约束：项目型 Agent 支持三种，独立型仅对话
- [ ] 4.1.3 对话视图组件：消息流（user/agent 区分）+ thinking 状态
- [ ] 4.1.4 消息存储：`messages` 表（session_id, role, text, parts, thinking）

### 4.2 右侧 InfoPanel
- [ ] 4.2.1 Connection 信息：环境、Agent、项目路径
- [ ] 4.2.2 同环境会话列表（快速跳转）
- [ ] 4.2.3 快捷 Prompt 面板（常用模板）

**Phase 4 验收：**
- Claude Code 支持终端/对话/分屏切换
- 右侧显示当前连接信息和快捷操作
- 对话消息能显示 thinking 状态

---

## Phase 5：稳定性与打包（MVP 收尾）

**目标：** 生产可用，跨平台打包

### 5.1 稳定性
- [ ] 5.1.1 SSH 断线检测 + 自动重连
- [ ] 5.1.2 终端自适应窗口大小（resize 实时同步）
- [ ] 5.1.3 会话持久化：重启后恢复未关闭的会话（可选）

### 5.2 打包发布
- [ ] 5.2.1 应用图标 + 窗口控制（最小化到托盘）
- [ ] 5.2.2 Linux AppImage 打包
- [ ] 5.2.3 README + 使用文档

**Phase 5 验收：**
- SSH 断网后自动重连
- 打包后双击可用

---

## 数据模型变更（从旧方案迁移）

| 旧表 | 新表 | 变更 |
|------|------|------|
| `servers` | `envs` | 新增 `type` 字段（ssh/local），预留 wsl/k8s |
| - | `projects` | 新增项目表 |
| `agents` | `agents` | 新增 `needs_project` 布尔字段 |
| `sessions` | `sessions` | 新增 `project_id`, `view_mode` |
| - | `messages` | 新增消息表（对话视图用）|

---

## 🚀 当前优先级

**立即开始：Phase 3.1** - 环境模型重构

先做数据库迁移和统一环境列表，这是新方案的根基。

```rust
// 3.1.1 数据库迁移思路
// 1. 创建新 envs 表
// 2. 将 servers 数据迁移到 envs，type='ssh'
// 3. 添加默认 local 环境
// 4. 更新代码引用
```

**本周目标：** 完成 Phase 3（多环境 + 多 Tab + 项目绑定）

需要我开始 Phase 3.1 开发，还是你有其他调整？
