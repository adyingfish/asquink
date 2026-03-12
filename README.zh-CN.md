# ASquink

[English](./README.en.md) | **中文**

> 面向本地、SSH 和 WSL 工作流的 AI Agent 终端工作台。

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=0b0f14)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Backend-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg?style=flat-square)](./LICENSE)

ASquink 是面向个人开发者与团队的 AI 编码桌面工作台。它将本地终端、SSH、WSL、项目上下文和多 Agent 会话统一到一个界面中，让你在提升效率的同时保持可控与稳定。

## 特色理念

无论你是在本地还是云端工作，AI Agent 很多时候仍需要人工通过终端介入，例如更新 Agent/工具版本、修复环境问题、处理认证、执行一次性修复命令。

这不仅适用于 CLI Agent，也适用于 OpenClaw 这类自治型 Agent 运行时。与其把“终端操作”和“Agent 对话”分散在多个工具里，不如放进同一个应用：需要人工接管时可以立即处理，处理完又能无缝回到同一条工作流。

## 核心功能

- 统一会话中心：在同一工作区切换本地、SSH、WSL 会话，底层终端调度稳定可靠。
- 项目感知上下文：会话与项目绑定，确保 AI 工作流始终围绕正确代码上下文。
- 多 Agent 启动器：可快速发现并启动 Claude Code、Codex、Gemini CLI 等 Agent，行为一致。
- ACP 聊天运行时：支持 ACP 流式输出与权限确认，让 Agent 操作过程更透明。
- 会话持久化：断线后可恢复终端与聊天历史，减少上下文丢失和中断成本。
- 原生桌面性能：基于 Tauri + Rust，兼顾轻量资源占用与桌面级响应速度。

## 支持环境

- 本地终端
- SSH 服务器
- WSL 发行版

## 支持 Agent

- Claude Code
- Codex
- Gemini CLI
- OpenCode
- OpenClaw
- ACP Runtime
  - Claude Code ACP
  - Codex ACP
  - Gemini ACP
  - OpenCode ACP

## 技术栈

- Tauri v2
- Rust
- React 19
- TypeScript
- Vite
- Tailwind CSS
- xterm.js
- SQLite (`sqlx`)

## License

MIT
