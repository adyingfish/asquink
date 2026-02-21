# AgentHub 开发任务清单（更新版）

**当前状态：Phase 1 已完成**
- ✅ Tauri + React + TypeScript 项目结构
- ✅ TerminalSession trait 抽象层（SSH + PTY）
- ✅ SSH 连接（密码/私钥认证）
- ✅ 本地 PTY 终端
- ✅ Tauri IPC 层（Commands + Events）
- ✅ 基础 UI（服务器列表 + 终端显示）
- ✅ SQLite 数据库（服务器配置）

---

## Phase 2：Claude Code 对接

**目标：** 在 SSH/本地会话中启动 Claude Code，能正常对话编程

- [ ] 2.1 API Key 安全存储（系统 Keychain + keyring crate）
- [ ] 2.2 环境变量注入机制（启动时 export ANTHROPIC_API_KEY）
- [ ] 2.3 Claude Code 安装检测（which claude）
- [ ] 2.4 工作目录选择（启动前 cd 到指定目录）
- [ ] 2.5 "启动 Claude" 按钮 UI（侧边栏 Agent 列表）
- [ ] 2.6 快捷启动流程（选服务器 → 选目录 → 启动 Claude）
- [ ] 2.7 终端状态检测（判断 Claude 是否已启动）
- [ ] 2.8 安装指引（未安装时显示 npm install 命令）

**验收：** SSH 连上 → 点击"启动 Claude" → 输入 /help 有响应 → 能正常对话编程

---

## Phase 3：多 Tab 与配置完善

**目标：** 多会话并行，配置管理完整

- [ ] 3.1 SessionManager 完整实现（统一管理 SSH/PTY 会话）
- [ ] 3.2 多 Tab 切换（创建/关闭/切换，显示连接状态）
- [ ] 3.3 服务器配置编辑（修改/测试连接）
- [ ] 3.4 服务器分组（开发/生产环境分组）
- [ ] 3.5 终端搜索功能（xterm-addon-search）
- [ ] 3.6 终端复制粘贴（右键菜单/快捷键）
- [ ] 3.7 会话重命名（双击 Tab 标题）
- [ ] 3.8 配置导入导出（JSON 格式备份）

**验收：** 能同时开 3 个 Tab 连不同服务器 → 各自运行 Claude → 配置可备份恢复

---

## Phase 4：稳定与发布

**目标：** 生产可用，打包发布

- [ ] 4.1 SSH 断线检测 + 自动重连（带重试次数限制）
- [ ] 4.2 SSH Keep-Alive（防止长时间无操作断开）
- [ ] 4.3 终端自适应窗口大小（resize 事件实时同步）
- [ ] 4.4 性能优化（WebGL 渲染器、大数据量输出节流）
- [ ] 4.5 错误提示完善（连接失败/认证失败/Agent 未安装）
- [ ] 4.6 日志系统（前端操作日志 + 后端错误日志）
- [ ] 4.7 应用图标 + 系统托盘（最小化到托盘）
- [ ] 4.8 Linux AppImage 打包
- [ ] 4.9 README + 使用文档 + GIF 演示
- [ ] 4.10 GitHub 开源发布

**验收：** SSH 断网恢复后自动重连 → 大输出不卡顿 → 打包后双击可用

---

## 🚀 当前可开始任务

**Phase 2.1** - API Key 存储
```rust
// 新增 src/keychain.rs
use keyring::Entry;

pub fn store_api_key(service: &str, key: &str) -> Result<()> {
    let entry = Entry::new("agenthub", service)?;
    entry.set_password(key)?;
    Ok(())
}
```

**Phase 3.1** - SessionManager 完善
```rust
// 整合现有的 ssh_sessions + pty_manager
pub struct SessionManager {
    sessions: HashMap<String, Box<dyn TerminalSession>>,
}
```

**Phase 4.1** - SSH 重连
```rust
// 在 ssh.rs 中添加重连逻辑
async fn reconnect(&mut self) -> Result<()> {
    // 保存配置 → 断开 → 重新连接
}
```

---

## 优先级建议

1. **先做 2.1-2.5**（Claude Code 核心流程）
2. **再做 3.1-3.3**（多 Tab 是刚需）
3. **最后 4.1-4.4**（稳定性优化）

从哪个任务开始？
