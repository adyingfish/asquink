# ASquink

**English** | [中文](./README.zh-CN.md)

> AI Agent terminal hub for local, SSH, and WSL workflows.

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=0b0f14)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Backend-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg?style=flat-square)](./LICENSE)

ASquink is a desktop workspace for AI coding teams and individual developers. It combines local terminals, SSH, WSL, project context, and multi-agent sessions into one interface so you can move faster without losing control.

## Featured Perspective

Whether you work locally or in the cloud, AI agents still need human terminal intervention from time to time, for example updating agent/tool versions, fixing environment issues, handling authentication, or running one-off recovery commands.

This applies to CLI agents and autonomous runtimes like OpenClaw as well. Instead of splitting terminal operations and agent conversation across different tools, ASquink puts both in one app, so you can step in when needed and continue the same workflow without context loss.

## Core Features

- Unified Session Hub: switch across local, SSH, and WSL sessions in one workspace, backed by stable terminal orchestration.
- Project-Aware Context: keep each session tied to its project so your AI workflow stays accurate and focused.
- Multi-Agent Launcher: discover and launch Claude Code, Codex, Gemini CLI, and more with consistent runtime behavior.
- ACP Chat Runtime: run ACP sessions with streaming output and permission confirmation for transparent agent actions.
- Session Persistence: resume terminal and chat history after reconnect, reducing workflow interruption.
- Native Desktop Performance: built on Tauri + Rust for low overhead, responsive UI, and desktop-level reliability.

## Supported Environments

- Local terminal
- SSH server
- WSL distribution

## Supported Agents

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

## Tech Stack

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
