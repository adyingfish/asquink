# ASquink 快速开始

## 安装依赖

```bash
# 安装 Rust（如果未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Node.js 依赖
npm install

# 安装 Tauri CLI
cargo install tauri-cli
```

## 开发运行

```bash
# 启动开发服务器
npm run tauri:dev
```

## 配置 API Key

1. 点击左下角 "Settings"
2. 输入你的 Anthropic API Key
3. 点击 Save

获取 API Key: https://console.anthropic.com

## 使用步骤

1. **连接服务器**
   - 点击侧边栏 "Local Terminal" 启动本地终端，或
   - 添加 SSH 服务器配置并连接

2. **启动 Claude Code**
   - 切换到 "Agents" 标签
   - 点击 "Launch Claude" 按钮
   - Claude Code 将在当前会话中启动

3. **开始对话**
   - 在终端中输入 `/help` 查看 Claude 命令
   - 或直接输入编程任务开始对话

## 安装 Claude Code（如未安装）

```bash
npm install -g @anthropic-ai/claude-code
```

## 构建发布版本

```bash
npm run tauri:build
```

构建产物在 `src-tauri/target/release/bundle/`
