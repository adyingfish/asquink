import { useState, useEffect, useRef } from "react";

// ── Data ──
const ENVS = [
  { id: "local", name: "本地终端", icon: "💻", status: "online", detail: "macOS" },
  { id: "wsl", name: "WSL Ubuntu", icon: "🐧", status: "online", detail: "Ubuntu 22.04" },
  { id: "dev", name: "dev-server", icon: "☁️", status: "online", detail: "10.0.1.42" },
  { id: "prod", name: "prod-cluster", icon: "☁️", status: "offline", detail: "10.0.2.10" },
];

const PROJECTS = [
  { id: "p1", envId: "wsl", path: "~/web-app", name: "web-app", lang: "TS" },
  { id: "p2", envId: "wsl", path: "~/api-server", name: "api-server", lang: "Rust" },
  { id: "p3", envId: "wsl", path: "~/infra", name: "infra", lang: "TF" },
  { id: "p4", envId: "dev", path: "~/deploy", name: "deploy", lang: "Py" },
  { id: "p5", envId: "local", path: "~/docs", name: "docs", lang: "MD" },
];

const AGENTS = [
  { id: "claude", name: "Claude Code", short: "Claude", color: "#E8915A", needsProject: true },
  { id: "codex", name: "Codex CLI", short: "Codex", color: "#4ADE80", needsProject: true },
  { id: "gemini", name: "Gemini CLI", short: "Gemini", color: "#60A5FA", needsProject: true },
  { id: "openclaw", name: "OpenClaw", short: "OClaw", color: "#C084FC", needsProject: false },
];

const SESSIONS = [
  { id: "s1", envId: "wsl", projectId: "p1", agentId: "claude" },
  { id: "s2", envId: "wsl", projectId: "p2", agentId: "claude" },
  { id: "s3", envId: "wsl", projectId: "p3", agentId: "codex" },
  { id: "s4", envId: "dev", projectId: "p4", agentId: "codex" },
  { id: "s5", envId: "local", projectId: null, agentId: "openclaw" },
  { id: "s6", envId: "dev", projectId: null, agentId: "openclaw" },
];

const TERM_LINES = [
  { c: "#555872", t: "Connected to WSL (Ubuntu 22.04) · ~/web-app", i: true },
  { c: "#555872", t: "Environment: ANTHROPIC_API_KEY ✓", i: true },
  { c: "#4ADE80", t: "user@ubuntu:~/web-app$", b: true },
  { c: "#e2e4ed", t: " claude", b: true },
  { c: null, t: "" },
  { c: "#E8915A", t: "╭──────────────────────────────────────────────────────────╮" },
  { c: "#E8915A", t: "│  Claude Code v1.0.23       cwd: ~/web-app               │" },
  { c: "#E8915A", t: "╰──────────────────────────────────────────────────────────╯" },
  { c: null, t: "" },
  { c: "#E8915A", t: " > fix the authentication bug in login.ts", b: true },
  { c: null, t: "" },
  { c: "#A78BFA", t: "  ● Reading project structure..." },
  { c: "#8b8fa7", t: "    📄 src/auth/login.ts" },
  { c: "#8b8fa7", t: "    📄 src/auth/session.ts" },
  { c: null, t: "" },
  { c: "#60A5FA", t: "  ✏️  Editing src/auth/login.ts", b: true },
  { c: null, t: "" },
  { c: "#555872", t: "  ┌─ src/auth/login.ts ────────────────────────────────┐" },
  { c: "#F87171", t: "  │ - if (decoded.expiresAt < Date.now() / 1000) {    │" },
  { c: "#4ADE80", t: "  │ + if (decoded.exp < Date.now() / 1000) {           │" },
  { c: "#555872", t: "  └─────────────────────────────────────────────────────┘" },
  { c: null, t: "" },
  { c: "#4ADE80", t: "  ✅ All 23 tests passed", b: true },
  { c: "#555872", t: "  ─── 12,847 in · 1,203 out · $0.018 ───" },
  { c: null, t: "" },
  { c: "#E8915A", t: " > █", b: true },
];

const CHAT_MSGS = [
  { role: "user", text: "帮我对比 Redis 和 Memcached，并发 5k QPS，数据结构复杂。" },
  { role: "agent", agentId: "openclaw", parts: [
    "基于你的场景（5k QPS + 复杂数据结构），推荐 Redis。",
    "Redis 原生支持 Hash、List、Set、Sorted Set 等结构；Memcached 只支持简单 key-value，复杂数据需要应用层序列化。",
    "5k QPS 两者都能处理，Redis 6.0+ 多线程 I/O 余量充足。",
    "Redis 还支持持久化、Pub/Sub、Lua 脚本，扩展性更强。"
  ], tokens: "↑856 ↓1,420 $0.003" },
  { role: "user", text: "Redis 集群模式和哨兵模式怎么选？" },
  { role: "agent", agentId: "openclaw", parts: null, thinking: "分析 Redis 高可用架构..." },
];

// ── Styles ──
const S = {
  app: { fontFamily: "'Outfit', sans-serif", background: "#0a0b0f", color: "#e2e4ed", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", userSelect: "none" },
  titlebar: { height: 44, background: "#0f1117", borderBottom: "1px solid #1e2130", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 },
  squid: { width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg, #E8915A, #D46A28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, boxShadow: "0 2px 8px #E8915A44" },
  main: { flex: 1, display: "flex", overflow: "hidden" },
  sidebar: { width: 256, background: "#0f1117", borderRight: "1px solid #1e2130", display: "flex", flexDirection: "column", flexShrink: 0 },
  sidebarTabs: { display: "flex", borderBottom: "1px solid #1e2130", flexShrink: 0 },
  content: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  tabbar: { height: 36, background: "#161822", display: "flex", alignItems: "stretch", borderBottom: "1px solid #1e2130", overflowX: "auto", flexShrink: 0 },
  vtBar: { height: 34, background: "#161822", borderBottom: "1px solid #1e2130", display: "flex", alignItems: "center", padding: "0 14px", gap: 6, flexShrink: 0 },
  termArea: { flex: 1, display: "flex", overflow: "hidden" },
  terminal: { flex: 1, background: "#0a0b0f", padding: "12px 16px", overflowY: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, lineHeight: 1.65 },
  statusbar: { height: 24, background: "#161822", borderTop: "1px solid #1e2130", display: "flex", alignItems: "center", padding: "0 12px", gap: 14, fontSize: 10.5, color: "#555872", flexShrink: 0 },
};

const btn = (active) => ({
  padding: "4px 12px", borderRadius: 4, border: "none",
  background: active ? "#1c1f2e" : "transparent",
  color: active ? "#e2e4ed" : "#555872",
  fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 500, cursor: "pointer",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
});

const sideTabStyle = (active) => ({
  flex: 1, textAlign: "center", padding: "9px 0", fontSize: 11, fontWeight: 550, cursor: "pointer",
  color: active ? "#e2e4ed" : "#555872",
  borderBottom: active ? "2px solid #E8915A" : "2px solid transparent",
  background: active ? "#161822" : "transparent",
});

// ── Components ──
function TerminalView({ lines, count, termRef }) {
  return (
    <div style={S.terminal} ref={termRef}>
      {lines.slice(0, count).map((l, i) => (
        <div key={i} style={{
          whiteSpace: "pre-wrap", wordBreak: "break-all",
          color: l.c || "transparent",
          fontWeight: l.b ? 500 : 400,
          fontStyle: l.i ? "italic" : "normal",
          fontSize: l.i ? 11 : 12.5,
          minHeight: l.t === "" ? 20 : undefined,
        }}>{l.t}</div>
      ))}
    </div>
  );
}

function ChatView() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0b0f" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 24px" }}>
          {CHAT_MSGS.map((msg, i) => {
            if (msg.role === "user") return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", background: "#1c1f2e", border: "1px solid #2a2d3e", fontSize: 13, lineHeight: 1.6 }}>
                  {msg.text}
                </div>
              </div>
            );
            const agent = AGENTS.find(a => a.id === msg.agentId);
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 22 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: (agent?.color || "#888") + "22", border: `1px solid ${(agent?.color || "#888")}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🦑</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: agent?.color, marginBottom: 5 }}>{agent?.name}</div>
                  {msg.thinking && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 7, background: "#161822", fontSize: 12, color: "#A78BFA", border: "1px solid #A78BFA22" }}>
                      <span style={{ animation: "pulse 1.5s ease infinite" }}>●</span> {msg.thinking}
                    </div>
                  )}
                  {msg.parts && msg.parts.map((p, j) => (
                    <div key={j} style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 8 }}>{p}</div>
                  ))}
                  {msg.tokens && (
                    <div style={{ fontSize: 10, color: "#555872", fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{msg.tokens}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "12px 24px 16px", borderTop: "1px solid #1e2130", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 700, width: "100%", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #2a2d3e", background: "#161822", color: "#e2e4ed", fontFamily: "'Outfit', sans-serif", fontSize: 13, resize: "none", outline: "none", minHeight: 42, maxHeight: 120 }}
            placeholder="输入消息..."
            rows={1}
          />
          <button style={{ width: 42, height: 42, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #E8915A, #D46A28)", color: "white", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px #E8915A44" }}>↑</button>
        </div>
      </div>
    </div>
  );
}

function SessionItem({ sess, active, onClick }) {
  const ag = AGENTS.find(a => a.id === sess.agentId);
  const proj = sess.projectId ? PROJECTS.find(p => p.id === sess.projectId) : null;
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7, padding: "5px 8px 5px 12px",
      borderRadius: 6, cursor: "pointer", marginBottom: 1, position: "relative",
      background: active ? "#E8915A22" : "transparent",
      borderLeft: active ? "2.5px solid #E8915A" : "2.5px solid transparent",
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: ag?.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, fontFamily: proj ? "'JetBrains Mono', monospace" : "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {proj ? proj.name : ag?.name}
        </div>
        <div style={{ fontSize: 10, color: "#555872" }}>{proj ? ag?.short : "独立会话"}</div>
      </div>
      <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: proj ? "#60A5FA15" : "#C084FC15", color: proj ? "#60A5FA" : "#C084FC" }}>
        {proj ? "📁" : "💬"}
      </span>
    </div>
  );
}

function EnvGroup({ env, sessions, activeTab, setActiveTab, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  if (sessions.length === 0) return null;
  return (
    <div style={{ marginBottom: 2 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "#8b8fa7" }}>
        <span style={{ fontSize: 9, color: "#555872", width: 12, textAlign: "center", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        <span style={{ fontSize: 13 }}>{env.icon}</span>
        <span style={{ fontWeight: 500, flex: 1 }}>{env.name}</span>
        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", background: "#232738", color: "#555872", padding: "0 4px", borderRadius: 3 }}>{sessions.length}</span>
      </div>
      {open && (
        <div style={{ paddingLeft: 18 }}>
          {sessions.map(s => (
            <SessionItem key={s.id} sess={s} active={activeTab === s.id} onClick={() => setActiveTab(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function InfoPanel({ session }) {
  const ag = session ? AGENTS.find(a => a.id === session.agentId) : null;
  const env = session ? ENVS.find(e => e.id === session.envId) : null;
  const proj = session?.projectId ? PROJECTS.find(p => p.id === session.projectId) : null;
  const siblings = session ? SESSIONS.filter(s => s.envId === session.envId && s.id !== session.id) : [];

  const Row = ({ k, v, vc }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ fontSize: 11, color: "#8b8fa7" }}>{k}</span>
      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: vc || "#e2e4ed" }}>{v}</span>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ padding: "10px 13px", borderBottom: "1px solid #1e2130" }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: "#555872", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ width: 248, background: "#0f1117", borderLeft: "1px solid #1e2130", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
      <div style={{ padding: "10px 13px", borderBottom: "1px solid #1e2130", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#555872" }}>Session Info</div>

      <Section title="Connection">
        <Row k="环境" v={env?.name} />
        <Row k="Agent" v={ag?.name} vc={ag?.color} />
        <Row k="类型" v={ag?.needsProject ? "📁 项目型" : "💬 独立型"} />
        {proj && <Row k="项目" v={proj.path} vc="#E8915A" />}
        {proj && <Row k="语言" v={proj.lang} />}
      </Section>

      {siblings.length > 0 && (
        <Section title="同环境会话">
          {siblings.map(s => {
            const sag = AGENTS.find(a => a.id === s.agentId);
            const sp = s.projectId ? PROJECTS.find(p => p.id === s.projectId) : null;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, background: "#161822", marginBottom: 3, cursor: "pointer" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: sag?.color }} />
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, flex: 1 }}>{sp ? sp.name : sag?.name}</span>
                <span style={{ fontSize: 10, color: "#555872" }}>{sp ? sag?.short : "💬"}</span>
              </div>
            );
          })}
        </Section>
      )}

      <Section title="Token 用量">
        <Row k="输入" v="12,847" />
        <Row k="输出" v="1,203" />
        <Row k="费用" v="$0.018" vc="#FBBF24" />
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 4, borderRadius: 3, background: "#232738", overflow: "hidden" }}>
            <div style={{ height: "100%", width: "7%", borderRadius: 3, background: "linear-gradient(90deg, #E8915A, #D46A28)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9.5, color: "#555872", fontFamily: "'JetBrains Mono', monospace" }}>
            <span>14k</span><span>200k</span>
          </div>
        </div>
      </Section>

      <Section title="快捷 Prompt">
        {(ag?.needsProject ? ["review this file", "write tests", "explain this", "refactor"] : ["对比方案", "生成报告", "解释概念", "头脑风暴"]).map(p => (
          <div key={p} style={{ padding: "5px 8px", borderRadius: 4, background: "#161822", marginBottom: 3, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#8b8fa7", cursor: "pointer" }}>› {p}</div>
        ))}
      </Section>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [activeTab, setActiveTab] = useState("s1");
  const [viewMode, setViewMode] = useState("terminal");
  const [sidebarTab, setSidebarTab] = useState("sessions");
  const [lines, setLines] = useState(0);
  const termRef = useRef(null);

  const sess = SESSIONS.find(s => s.id === activeTab);
  const agent = sess ? AGENTS.find(a => a.id === sess.agentId) : null;
  const env = sess ? ENVS.find(e => e.id === sess.envId) : null;
  const proj = sess?.projectId ? PROJECTS.find(p => p.id === sess.projectId) : null;

  // Determine effective view
  const isProjectAgent = agent?.needsProject === true;
  const view = !isProjectAgent ? "chat" : viewMode;

  // Terminal animation
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => { i++; setLines(i); if (i >= TERM_LINES.length) clearInterval(t); }, 55);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [lines]);

  // Auto switch view when changing tabs
  const handleTabChange = (id) => {
    setActiveTab(id);
    const s = SESSIONS.find(x => x.id === id);
    const a = s ? AGENTS.find(x => x.id === s.agentId) : null;
    if (a && !a.needsProject) setViewMode("chat");
    else if (a && a.needsProject) setViewMode("terminal");
  };

  // Group sessions by env
  const grouped = {};
  SESSIONS.forEach(s => { if (!grouped[s.envId]) grouped[s.envId] = []; grouped[s.envId].push(s); });

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } } ::-webkit-scrollbar { width: 5px } ::-webkit-scrollbar-track { background: transparent } ::-webkit-scrollbar-thumb { background: #2a2d3e; border-radius: 3px } * { margin:0; padding:0; box-sizing:border-box; }`}</style>

      {/* Titlebar */}
      <div style={S.titlebar}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={S.squid}>🦑</div>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>一只贪心的鱿鱼</span>
          <span style={{ fontSize: 10.5, color: "#555872" }}>agreedysquid</span>
        </div>
        <div style={{ flex: 1 }} />
        {["⚙", "─", "□", "✕"].map(c => (
          <button key={c} style={{ width: 30, height: 30, borderRadius: 6, border: "none", background: "transparent", color: "#555872", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{c}</button>
        ))}
      </div>

      <div style={S.main}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={S.sidebarTabs}>
            {["sessions", "envs", "projects"].map(t => (
              <div key={t} onClick={() => setSidebarTab(t)} style={sideTabStyle(sidebarTab === t)}>
                {t === "sessions" ? "会话" : t === "envs" ? "环境" : "项目"}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 4px" }}>
            {sidebarTab === "sessions" && (
              <>
                {ENVS.filter(e => e.status === "online" && grouped[e.id]).map(e => (
                  <EnvGroup key={e.id} env={e} sessions={grouped[e.id] || []} activeTab={activeTab} setActiveTab={handleTabChange} defaultOpen={true} />
                ))}
              </>
            )}

            {sidebarTab === "envs" && (
              <>
                <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "#555872", padding: "4px 8px", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>已添加环境</span><span style={{ cursor: "pointer", fontSize: 14, fontWeight: 400 }}>＋</span>
                </div>
                {ENVS.map(e => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 1 }}>
                    <span style={{ fontSize: 14 }}>{e.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{e.name}</div>
                      <div style={{ fontSize: 10, color: "#555872", fontFamily: "'JetBrains Mono', monospace" }}>{e.detail}</div>
                    </div>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: e.status === "online" ? "#4ADE80" : "#555872", boxShadow: e.status === "online" ? "0 0 5px #4ADE80" : "none" }} />
                  </div>
                ))}
                <div style={{ padding: "12px 8px", fontSize: 11, color: "#555872", lineHeight: 1.6 }}>
                  环境是你的机器和服务器。添加后可创建项目或启动独立会话。
                </div>
              </>
            )}

            {sidebarTab === "projects" && (
              <>
                <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "#555872", padding: "4px 8px", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>已注册项目</span><span style={{ cursor: "pointer", fontSize: 14, fontWeight: 400 }}>＋</span>
                </div>
                {PROJECTS.map(p => {
                  const pe = ENVS.find(e => e.id === p.envId);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 1 }}>
                      <span style={{ fontSize: 12 }}>📁</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{p.path}</div>
                        <div style={{ fontSize: 10, color: "#555872", display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 9, padding: "0 5px", borderRadius: 3, background: "#232738" }}>{pe?.icon} {pe?.name}</span>
                          <span>{p.lang}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding: "12px 8px", fontSize: 11, color: "#555872", lineHeight: 1.6 }}>
                  项目型 Agent（Claude Code 等）需要绑定项目目录；独立型 Agent（OpenClaw）不需要。
                </div>
              </>
            )}
          </div>

          {/* Agents */}
          <div style={{ borderTop: "1px solid #1e2130", padding: "8px 8px 4px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "#555872", padding: "0 8px", marginBottom: 4 }}>Agents</div>
            {AGENTS.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 6, marginBottom: 1 }}>
                <div style={{ width: 3, height: 16, borderRadius: 2, background: a.color }} />
                <span style={{ fontSize: 12, flex: 1 }}>{a.name}</span>
                <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: a.needsProject ? "#60A5FA12" : "#C084FC12", color: a.needsProject ? "#60A5FA" : "#C084FC" }}>
                  {a.needsProject ? "📁" : "💬"}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: 8, borderTop: "1px solid #1e2130" }}>
            <button style={{ width: "100%", padding: 8, borderRadius: 7, border: "1px dashed #2a2d3e", background: "transparent", color: "#8b8fa7", fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>＋ 新建会话</button>
          </div>
        </div>

        {/* Content */}
        <div style={S.content}>
          {/* Tab bar */}
          <div style={S.tabbar}>
            {SESSIONS.map(s => {
              const sa = AGENTS.find(a => a.id === s.agentId);
              const se = ENVS.find(e => e.id === s.envId);
              const sp = s.projectId ? PROJECTS.find(p => p.id === s.projectId) : null;
              const isActive = activeTab === s.id;
              return (
                <div key={s.id} onClick={() => handleTabChange(s.id)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "0 13px",
                  fontSize: 11.5, fontWeight: 450, cursor: "pointer", whiteSpace: "nowrap",
                  borderRight: "1px solid #1e2130", position: "relative",
                  color: isActive ? "#e2e4ed" : "#555872",
                  background: isActive ? "#0a0b0f" : "transparent",
                  borderBottom: isActive ? "2px solid #E8915A" : "2px solid transparent",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: sa?.color }} />
                  <span>{sp ? sp.name : sa?.short}</span>
                  <span style={{ color: "#555872", fontSize: 10 }}>›</span>
                  <span>{sp ? sa?.short : se?.name}</span>
                  <span style={{ fontSize: 10 }}>{se?.icon}</span>
                  {!sp && <span style={{ fontSize: 8, padding: "0 3px", borderRadius: 3, background: "#C084FC15", color: "#C084FC" }}>💬</span>}
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, color: "#555872", cursor: "pointer", fontSize: 15 }}>＋</div>
          </div>

          {/* View toggle */}
          <div style={S.vtBar}>
            <div style={{ display: "flex", background: "#0a0b0f", borderRadius: 6, padding: 2, border: "1px solid #1e2130" }}>
              {isProjectAgent && <button style={btn(viewMode === "terminal")} onClick={() => setViewMode("terminal")}>⌨ 终端</button>}
              <button style={btn(view === "chat")} onClick={() => setViewMode("chat")}>💬 对话</button>
              {isProjectAgent && <button style={btn(viewMode === "split")} onClick={() => setViewMode("split")}>◧ 分屏</button>}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10.5, color: "#555872", fontFamily: "'JetBrains Mono', monospace", display: "flex", gap: 10 }}>
              <span>{env?.icon} {env?.name}</span>
              <span style={{ color: agent?.color }}>{agent?.name}</span>
              {proj && <span style={{ color: "#E8915A" }}>📁 {proj.path}</span>}
              {!proj && <span style={{ color: "#C084FC" }}>独立会话</span>}
            </div>
          </div>

          {/* Main view */}
          <div style={S.termArea}>
            {(view === "terminal" || view === "split") && (
              <TerminalView lines={TERM_LINES} count={lines} termRef={termRef} />
            )}
            {view === "split" && <div style={{ width: 1, background: "#1e2130" }} />}
            {(view === "chat" || view === "split") && <ChatView />}
            <InfoPanel session={sess} />
          </div>
        </div>
      </div>

      {/* Statusbar */}
      <div style={S.statusbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 4px #4ADE80" }} />
          Connected
        </div>
        <span style={{ color: agent?.color }}>● {agent?.name}</span>
        <span>{env?.icon} {env?.name}</span>
        {proj && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#E8915A" }}>📁 {proj.path}</span>}
        {!proj && <span style={{ color: "#C084FC" }}>💬 独立</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
          <span>↑1.2K</span><span>↓14.8K</span>
        </div>
      </div>
    </div>
  );
}
