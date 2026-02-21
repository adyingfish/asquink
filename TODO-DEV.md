# AgentHub 开发任务清单（试用版导向）

**当前状态：Phase 1 已完成** ✅  
**目标：Phase 2 完成后可试用**（SSH 连服务器 + Claude Code 可对话）

---

## Phase 2：可试用版本（MVP 完整功能）

**目标：** 能连 SSH，启动 Claude Code，正常对话编程

### 2.1 API Key 管理
- [ ] 2.1.1 系统 Keychain 集成（keyring crate）
- [ ] 2.1.2 API Key 存储界面（设置页）
- [ ] 2.1.3 API Key 读取和注入

### 2.2 Claude Code 启动
- [ ] 2.2.1 检测 Claude 安装状态（which claude）
- [ ] 2.2.2 未安装时显示安装指引
- [ ] 2.2.3 启动时注入 ANTHROPIC_API_KEY 环境变量
- [ ] 2.2.4 "启动 Claude" 按钮 UI

### 2.3 会话基础管理
- [ ] 2.3.1 会话状态实时显示（连接中/已连接/已断开）
- [ ] 2.3.2 关闭会话功能
- [ ] 2.3.3 简单的错误提示（连接失败、认证失败）

### 2.4 体验基础优化
- [ ] 2.4.1 终端自适应窗口大小
- [ ] 2.4.2 基本的加载/等待状态提示
- [ ] 2.4.3 简单的使用说明文档

**Phase 2 验收标准（可试用）：**
- [ ] 添加服务器配置（IP/用户名/密码或密钥）
- [ ] 点击连接，SSH 成功
- [ ] 点击"启动 Claude"，Claude Code 启动
- [ ] 输入 /help 或简单指令，Claude 正常响应
- [ ] 能进行基础对话编程

---

## Phase 3：体验完善

**目标：** 多会话、配置管理、稳定性提升

### 3.1 多 Tab 支持
- [ ] 3.1.1 Tab 创建/关闭/切换
- [ ] 3.1.2 Tab 标题显示（服务器名/状态）
- [ ] 3.1.3 Tab 拖拽排序

### 3.2 服务器配置管理
- [ ] 3.2.1 服务器配置编辑
- [ ] 3.2.2 服务器分组（开发/生产）
- [ ] 3.2.3 配置导入/导出

### 3.3 终端增强
- [ ] 3.3.1 终端搜索（Ctrl+Shift+F）
- [ ] 3.3.2 复制粘贴支持
- [ ] 3.3.3 终端主题切换

### 3.4 稳定性优化
- [ ] 3.4.1 SSH 断线检测
- [ ] 3.4.2 SSH 自动重连
- [ ] 3.4.3 Keep-Alive 心跳

---

## Phase 4：发布准备

**目标：** 生产可用，打包发布

### 4.1 性能优化
- [ ] 4.1.1 WebGL 渲染器（xterm.js）
- [ ] 4.1.2 大输出量节流处理
- [ ] 4.1.3 内存泄漏检查

### 4.2 打包与发布
- [ ] 4.2.1 Linux AppImage 打包
- [ ] 4.2.2 应用图标和系统托盘
- [ ] 4.2.3 GitHub Release 发布

### 4.3 文档完善
- [ ] 4.3.1 完整 README（安装/使用/截图）
- [ ] 4.3.2 常见问题 FAQ
- [ ] 4.3.3 开发文档（如何贡献）

---

## 🚀 下一步行动

**立即开始 Phase 2.1：API Key 管理**

```rust
// src/keychain.rs - 新增文件
use keyring::Entry;

pub fn store_api_key(key: &str) -> Result<()> {
    let entry = Entry::new("agenthub", "anthropic_api_key")?;
    entry.set_password(key)?;
    Ok(())
}

pub fn get_api_key() -> Result<String> {
    let entry = Entry::new("agenthub", "anthropic_api_key")?;
    entry.get_password()
}
```

需要我开始 Phase 2.1 开发吗？
