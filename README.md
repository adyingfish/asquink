# AgentHub

AI Agent Terminal Hub - Unified management for Claude Code, Codex, and more.

## Development Status

- [x] Phase 1: SSH + PTY Connection
- [x] Phase 2: Claude Code Integration (Ready for trial!)
- [ ] Phase 3: Multi-Tab & Configuration
- [ ] Phase 4: Release

## Quick Start

```bash
# Clone repository
git clone https://github.com/adyingfish/agenthub.git
cd agenthub

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev
```

## Usage

1. **Configure API Key**: Click Settings → Enter Anthropic API Key → Save
2. **Connect**: Click "Local Terminal" or add SSH server
3. **Launch Claude**: Switch to Agents tab → Click "Launch Claude"
4. **Start Coding**: Type `/help` or ask Claude to help with your code

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.

## Tech Stack

- Tauri v2 + Rust
- React + TypeScript
- xterm.js + Tailwind CSS

## License

MIT
