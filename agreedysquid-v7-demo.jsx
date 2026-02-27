import { useState, useEffect, useRef } from "react";

// ── Data ──
const ENVS = [
  { id: "wsl", name: "WSL Ubuntu", icon: "🐧", status: "online", detail: "Ubuntu 22.04", sessions: ["s1", "s2", "s3"] },
  { id: "dev", name: "dev-server", icon: "☁️", status: "online", detail: "10.0.1.42", sessions: ["s4", "s5"] },
  { id: "local", name: "本地终端", icon: "💻", status: "online", detail: "macOS Sonoma", sessions: ["s6"] },
  { id: "gpu", name: "gpu-node", icon: "⚡", status: "online", detail: "10.0.3.88", sessions: ["s7"] },
  { id: "prod", name: "prod-cluster", icon: "☁️", status: "offline", detail: "10.0.2.10", sessions: [] },
];

const SESSIONS = {
  s1: { id: "s1", envId: "wsl", project: "web-app", dir: "~/web-app", agent: "Claude Code", agentShort: "Claude", agentColor: "#E8915A", mode: "terminal", status: "active", statusText: "运行中", lastMsg: "fix login.ts auth bug" },
  s2: { id: "s2", envId: "wsl", project: "api-server", dir: "~/api-server", agent: "Claude Code", agentShort: "Claude", agentColor: "#E8915A", mode: "terminal", status: "done", statusText: "已完成", lastMsg: "重构了用户模块" },
  s3: { id: "s3", envId: "wsl", project: "infra", dir: "~/infra", agent: "Codex CLI", agentShort: "Codex", agentColor: "#4ADE80", mode: "terminal", status: "idle", statusText: "空闲", lastMsg: "" },
  s4: { id: "s4", envId: "dev", project: "deploy", dir: "~/deploy", agent: "Codex CLI", agentShort: "Codex", agentColor: "#4ADE80", mode: "terminal", status: "active", statusText: "运行中", lastMsg: "更新 k8s 配置" },
  s5: { id: "s5", envId: "dev", project: null, dir: null, agent: "OpenClaw", agentShort: "OClaw", agentColor: "#C084FC", mode: "chat", status: "idle", statusText: "", lastMsg: "Redis vs Memcached" },
  s6: { id: "s6", envId: "local", project: null, dir: null, agent: "OpenClaw", agentShort: "OClaw", agentColor: "#C084FC", mode: "chat", status: "active", statusText: "对话中", lastMsg: "系统架构讨论" },
  s7: { id: "s7", envId: "gpu", project: "ml-train", dir: "~/ml-train", agent: "Claude Code", agentShort: "Claude", agentColor: "#E8915A", mode: "terminal", status: "active", statusText: "训练中", lastMsg: "epoch 34/100" },
};

const TERM = [
  { c: "#555872", t: "Connected to WSL (Ubuntu 22.04) · ~/web-app", s: 11 },
  { c: "#555872", t: "ANTHROPIC_API_KEY ✓", s: 11 },
  { c: null, t: "" },
  { c: "#4ADE80", t: "user@ubuntu:~/web-app$ claude", b: true },
  { c: null, t: "" },
  { c: "#E8915A", t: "╭──────────────────────────────────────────────────────╮" },
  { c: "#E8915A", t: "│  Claude Code v1.0.23      cwd: ~/web-app            │" },
  { c: "#E8915A", t: "╰──────────────────────────────────────────────────────╯" },
  { c: null, t: "" },
  { c: "#E8915A", t: " > ", b: true, after: "fix the authentication bug in login.ts", ac: "#FBBF24" },
  { c: null, t: "" },
  { c: "#A78BFA", t: "  ● Reading project structure..." },
  { c: "#8b8fa7", t: "    📄 src/auth/login.ts" },
  { c: "#8b8fa7", t: "    📄 src/auth/session.ts" },
  { c: "#8b8fa7", t: "    📄 src/middleware/auth.middleware.ts" },
  { c: null, t: "" },
  { c: "#A78BFA", t: "  ● Analyzing authentication flow..." },
  { c: null, t: "" },
  { c: "#e2e4ed", t: "  Found the issue. In login.ts:47, token validation" },
  { c: "#e2e4ed", t: "  compares against the wrong expiry field." },
  { c: null, t: "" },
  { c: "#60A5FA", t: "  ✏️  Editing src/auth/login.ts", b: true },
  { c: null, t: "" },
  { c: "#555872", t: "  ┌─ src/auth/login.ts ──────────────────────────┐" },
  { c: "#F87171", t: "  │ - if (decoded.expiresAt < Date.now()/1000) { │" },
  { c: "#4ADE80", t: "  │ + if (decoded.exp < Date.now()/1000) {       │" },
  { c: "#555872", t: "  └──────────────────────────────────────────────┘" },
  { c: null, t: "" },
  { c: "#60A5FA", t: "  ▶  Running tests...", b: true },
  { c: "#4ADE80", t: "  ✅ All 23 tests passed", b: true },
  { c: null, t: "" },
  { c: "#555872", t: "  ─── 12,847 in · 1,203 out · $0.018 ───", s: 11 },
  { c: null, t: "" },
  { c: "#E8915A", t: " > █", b: true },
];

const CHATS = [
  { role: "user", text: "帮我对比 Redis 和 Memcached，并发约 5k QPS，数据结构复杂。" },
  { role: "agent", parts: [
    "基于你的场景（5k QPS + 复杂数据结构），推荐 Redis。",
    "Redis 原生支持 Hash、List、Set、Sorted Set 等复杂结构。Memcached 只支持简单 key-value。",
    "5k QPS 两者都能轻松处理，Redis 6.0+ 多线程 I/O 余量充足。",
  ], tokens: "↑856 ↓1,420 $0.003" },
  { role: "user", text: "集群模式和哨兵模式怎么选？" },
  { role: "agent", thinking: "分析 Redis 高可用架构..." },
];

// ── Colors ──
const C = {
  bg0: "#08090d", bg1: "#0e1015", bg2: "#151820", bg3: "#1b1f2b", bgH: "#222738",
  bd: "#282d3e", bds: "#1d2030",
  t1: "#e2e4ed", t2: "#8b8fa7", t3: "#4e5270",
  acc: "#E8915A", accD: "#E8915A1e",
  grn: "#4ADE80", red: "#F87171", blu: "#60A5FA", ylw: "#FBBF24", pur: "#C084FC",
};
const mono = "'JetBrains Mono',monospace";
const sans = "'Outfit',sans-serif";

// ── Helpers ──
const statusDot = (s) => ({
  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
  background: s === "active" ? C.grn : s === "done" ? C.blu : s === "idle" ? C.t3 : C.t3,
  boxShadow: s === "active" ? `0 0 6px ${C.grn}88` : "none",
  animation: s === "active" ? "pulse 2s ease infinite" : "none",
});

const envDot = (online) => ({
  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
  background: online ? C.grn : C.t3,
  boxShadow: online ? `0 0 6px ${C.grn}` : "none",
});

// ── Components ──
function EnvGroup({ env, sessions, activeTab, onSelect, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const online = env.status === "online";
  const count = sessions.length;

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Env header */}
      <div onClick={() => online && setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
        borderRadius: 8, cursor: online ? "pointer" : "default",
        opacity: online ? 1 : 0.38, transition: "background 0.1s",
      }}
        onMouseEnter={e => { if (online) e.currentTarget.style.background = C.bgH; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 9, color: C.t3, width: 12, textAlign: "center", transition: "transform 0.15s", transform: open && online ? "rotate(90deg)" : "none" }}>▶</span>
        <span style={{ fontSize: 16 }}>{env.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{env.name}</div>
          <div style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{env.detail}</div>
        </div>
        {count > 0 && <span style={{ fontSize: 9, fontFamily: mono, background: C.bg3, color: C.t3, padding: "1px 6px", borderRadius: 4 }}>{count}</span>}
        <div style={envDot(online)} />
      </div>

      {/* Sessions */}
      {open && online && (
        <div style={{ paddingLeft: 16, marginTop: 2 }}>
          {sessions.map(s => {
            const isActive = activeTab === s.id;
            const isProject = !!s.project;
            return (
              <div key={s.id} onClick={() => onSelect(s.id)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                borderRadius: 7, cursor: "pointer", marginBottom: 1,
                background: isActive ? C.accD : "transparent",
                borderLeft: isActive ? `2.5px solid ${C.acc}` : "2.5px solid transparent",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.bgH; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? C.accD : "transparent"; }}
              >
                {/* Agent color + status */}
                <div style={{ position: "relative" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.agentColor }} />
                  <div style={{ ...statusDot(s.status), width: 5, height: 5, position: "absolute", bottom: -2, right: -2 }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 530, fontFamily: isProject ? mono : sans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isProject ? s.project : (s.lastMsg || s.agent)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                    <span style={{ fontSize: 10, color: s.agentColor, fontWeight: 500 }}>{s.agentShort}</span>
                    {isProject && <span style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{s.dir}</span>}
                    {!isProject && <span style={{ fontSize: 10, color: C.t3 }}>独立会话</span>}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 8.5, padding: "1px 5px", borderRadius: 3, background: s.mode === "chat" ? `${C.pur}14` : `${C.blu}14`, color: s.mode === "chat" ? C.pur : C.blu }}>
                    {s.mode === "chat" ? "💬" : "⌨"}
                  </span>
                  {s.status === "active" && (
                    <span style={{ fontSize: 9, color: C.grn }}>{s.statusText}</span>
                  )}
                  {s.status === "done" && (
                    <span style={{ fontSize: 9, color: C.blu }}>✓ 完成</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* New session in this env */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, color: C.t3, cursor: "pointer", borderRadius: 6, transition: "all 0.1s" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.acc; e.currentTarget.style.background = C.accD; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "transparent"; }}
          >
            <span>＋</span> 新建会话
          </div>
        </div>
      )}

      {/* Offline env: reconnect hint */}
      {!online && (
        <div style={{ paddingLeft: 38, marginTop: -2, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.t3, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.color = C.acc}
            onMouseLeave={e => e.currentTarget.style.color = C.t3}
          >重新连接</span>
        </div>
      )}
    </div>
  );
}

function TermView({ termRef, count }) {
  return (
    <div ref={termRef} style={{ flex: 1, background: C.bg0, padding: "14px 18px", overflowY: "auto", fontFamily: mono, fontSize: 12.5, lineHeight: 1.7 }}>
      {TERM.slice(0, count).map((l, i) => (
        <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: l.c || "transparent", fontWeight: l.b ? 500 : 400, fontSize: l.s || 12.5, minHeight: !l.t ? 16 : undefined }}>
          {l.t}{l.after && <span style={{ color: l.ac || C.t1 }}>{l.after}</span>}
        </div>
      ))}
    </div>
  );
}

function ChatView() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
          {CHATS.map((m, i) => {
            if (m.role === "user") return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
                <div style={{ maxWidth: "80%", padding: "11px 15px", borderRadius: "16px 16px 4px 16px", background: C.bg3, border: `1px solid ${C.bd}`, fontSize: 13.5, lineHeight: 1.65 }}>{m.text}</div>
              </div>
            );
            return (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.pur}20`, border: `1px solid ${C.pur}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>🦑</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.pur, marginBottom: 6 }}>OpenClaw</div>
                  {m.thinking && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, background: C.bg2, fontSize: 12.5, color: C.pur, border: `1px solid ${C.pur}22` }}>
                      <span style={{ display: "inline-flex", gap: 3 }}>
                        {[0, 1, 2].map(j => <span key={j} style={{ width: 4, height: 4, borderRadius: "50%", background: C.pur, animation: `pulse 1.2s ease ${j * 0.2}s infinite` }} />)}
                      </span>
                      {m.thinking}
                    </div>
                  )}
                  {m.parts && m.parts.map((p, j) => (
                    <div key={j} style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 6 }}>{p}</div>
                  ))}
                  {m.tokens && <div style={{ fontSize: 10, color: C.t3, fontFamily: mono, marginTop: 6 }}>{m.tokens}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "12px 24px 18px", borderTop: `1px solid ${C.bds}`, display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 680, width: "100%", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea style={{ flex: 1, padding: "11px 15px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.bg2, color: C.t1, fontFamily: sans, fontSize: 13.5, resize: "none", outline: "none", minHeight: 44, maxHeight: 120 }} placeholder="输入指令..." rows={1} />
          <button style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.acc}, #D46A28)`, color: "white", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 10px ${C.acc}44` }}>↑</button>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({ s }) {
  if (!s) return null;
  const env = ENVS.find(e => e.id === s.envId);
  const siblings = Object.values(SESSIONS).filter(x => x.envId === s.envId && x.id !== s.id);

  const Row = ({ k, v, vc }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ fontSize: 11, color: C.t2 }}>{k}</span>
      <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 500, color: vc || C.t1 }}>{v}</span>
    </div>
  );
  const Sec = ({ title, children }) => (
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.bds}` }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: C.t3, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ width: 240, background: C.bg1, borderLeft: `1px solid ${C.bds}`, display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
      <Sec title="当前会话">
        <Row k="Agent" v={s.agent} vc={s.agentColor} />
        <Row k="环境" v={`${env?.icon} ${env?.name}`} />
        {s.project && <Row k="项目" v={s.project} vc={C.acc} />}
        {s.dir && <Row k="目录" v={s.dir} vc={C.acc} />}
        <Row k="状态" v={s.statusText || "空闲"} vc={s.status === "active" ? C.grn : C.t2} />
      </Sec>
      {siblings.length > 0 && (
        <Sec title={`${env?.icon} 同环境会话`}>
          {siblings.map(x => (
            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, background: C.bg2, marginBottom: 3, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = C.bgH}
              onMouseLeave={e => e.currentTarget.style.background = C.bg2}
            >
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: x.agentColor }} />
              <span style={{ fontSize: 11, fontFamily: x.project ? mono : sans, fontWeight: 500, flex: 1 }}>{x.project || x.lastMsg || x.agent}</span>
              <span style={{ fontSize: 10, color: C.t3 }}>{x.agentShort}</span>
            </div>
          ))}
        </Sec>
      )}
      <Sec title="Token 用量">
        <Row k="输入" v="12,847" />
        <Row k="输出" v="1,203" />
        <Row k="费用" v="$0.018" vc={C.ylw} />
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 4, borderRadius: 3, background: C.bgH, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "7%", borderRadius: 3, background: `linear-gradient(90deg, ${C.acc}, #D46A28)` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: C.t3, fontFamily: mono }}><span>14k</span><span>200k</span></div>
        </div>
      </Sec>
      <Sec title="快捷指令">
        {(s.mode === "chat" ? ["对比方案", "生成报告", "解释概念", "头脑风暴"] : ["review this file", "write tests", "explain this", "refactor"]).map(p => (
          <div key={p} style={{ padding: "5px 8px", borderRadius: 5, background: C.bg2, marginBottom: 3, fontSize: 11, fontFamily: mono, color: C.t2, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.acc; e.currentTarget.style.background = C.bgH; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.t2; e.currentTarget.style.background = C.bg2; }}
          >› {p}</div>
        ))}
      </Sec>
    </div>
  );
}

// ── Main ──
export default function App() {
  const [activeTab, setActiveTab] = useState("s1");
  const [viewMode, setViewMode] = useState("terminal");
  const [lines, setLines] = useState(0);
  const termRef = useRef(null);

  const sess = SESSIONS[activeTab];
  const env = sess ? ENVS.find(e => e.id === sess.envId) : null;
  const isProject = !!sess?.project;

  const handleSelect = (id) => {
    setActiveTab(id);
    const s = SESSIONS[id];
    setViewMode(s?.mode === "chat" ? "chat" : "terminal");
  };

  const view = sess?.mode === "chat" && !isProject ? "chat" : viewMode;

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => { i++; setLines(i); if (i >= TERM.length) clearInterval(t); }, 50);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [lines]);

  // Tab bar sessions (show first 5)
  const tabIds = ["s1", "s2", "s4", "s5", "s7"];

  return (
    <div style={{ fontFamily: sans, background: C.bg0, color: C.t1, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", userSelect: "none" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}} *{margin:0;padding:0;box-sizing:border-box} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px} textarea::placeholder{color:${C.t3}}`}</style>

      {/* ── Titlebar ── */}
      <div style={{ height: 44, background: C.bg1, borderBottom: `1px solid ${C.bds}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${C.acc}, #D46A28)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, boxShadow: `0 2px 8px ${C.acc}44` }}>🦑</div>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>一只贪心的鱿鱼</span>
        <span style={{ fontSize: 10.5, color: C.t3 }}>agreedysquid</span>
        <div style={{ flex: 1 }} />
        {["⚙", "─", "□", "✕"].map(c => (
          <button key={c} style={{ width: 30, height: 30, borderRadius: 6, border: "none", background: "transparent", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{c}</button>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 268, background: C.bg1, borderRight: `1px solid ${C.bds}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {/* Search */}
          <div style={{ padding: "10px 10px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.bds}` }}>
              <span style={{ fontSize: 12, color: C.t3 }}>🔍</span>
              <input placeholder="搜索会话..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.t1, fontFamily: sans, fontSize: 12 }} />
            </div>
          </div>

          {/* Env groups */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 6px" }}>
            {ENVS.map(env => {
              const sessions = env.sessions.map(id => SESSIONS[id]).filter(Boolean);
              return (
                <EnvGroup
                  key={env.id}
                  env={env}
                  sessions={sessions}
                  activeTab={activeTab}
                  onSelect={handleSelect}
                  defaultOpen={env.status === "online"}
                />
              );
            })}
          </div>

          {/* Bottom */}
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.bds}`, display: "flex", flexDirection: "column", gap: 4 }}>
            <button style={{
              width: "100%", padding: "9px", borderRadius: 8, border: `1px solid ${C.acc}30`,
              background: `linear-gradient(135deg, ${C.acc}18, ${C.acc}08)`,
              color: C.acc, fontFamily: sans, fontSize: 12.5, fontWeight: 550,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>＋ 新建会话</button>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "4px 0" }}>
              <span style={{ fontSize: 11, color: C.t3, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.color = C.t2}
                onMouseLeave={e => e.currentTarget.style.color = C.t3}
              >⚙ 环境管理</span>
              <span style={{ fontSize: 11, color: C.t3, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.color = C.t2}
                onMouseLeave={e => e.currentTarget.style.color = C.t3}
              >🔑 API Keys</span>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Tab bar */}
          <div style={{ height: 36, background: C.bg2, display: "flex", alignItems: "stretch", borderBottom: `1px solid ${C.bds}`, overflowX: "auto", flexShrink: 0 }}>
            {tabIds.map(id => {
              const s = SESSIONS[id];
              const isAct = activeTab === id;
              const sEnv = ENVS.find(e => e.id === s.envId);
              return (
                <div key={id} onClick={() => handleSelect(id)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "0 14px",
                  fontSize: 11.5, fontWeight: 450, cursor: "pointer", whiteSpace: "nowrap",
                  borderRight: `1px solid ${C.bds}`, position: "relative",
                  color: isAct ? C.t1 : C.t3, background: isAct ? C.bg0 : "transparent",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.agentColor }} />
                  <span>{s.project || s.lastMsg || s.agentShort}</span>
                  <span style={{ color: C.t3, fontSize: 10 }}>›</span>
                  <span style={{ fontSize: 11, color: C.t3 }}>{s.agentShort}</span>
                  <span style={{ fontSize: 10 }}>{sEnv?.icon}</span>
                  {isAct && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: C.acc, borderRadius: "2px 2px 0 0" }} />}
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, color: C.t3, cursor: "pointer", fontSize: 15 }}>＋</div>
          </div>

          {/* View toggle */}
          <div style={{ height: 34, background: C.bg2, borderBottom: `1px solid ${C.bds}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 6, flexShrink: 0 }}>
            <div style={{ display: "flex", background: C.bg0, borderRadius: 6, padding: 2, border: `1px solid ${C.bds}` }}>
              {isProject && (
                <button onClick={() => setViewMode("terminal")} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: view === "terminal" ? C.bg3 : "transparent", color: view === "terminal" ? C.t1 : C.t3, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>⌨ 终端</button>
              )}
              <button onClick={() => setViewMode("chat")} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: view === "chat" ? C.bg3 : "transparent", color: view === "chat" ? C.t1 : C.t3, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>💬 对话</button>
              {isProject && (
                <button onClick={() => setViewMode("split")} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: view === "split" ? C.bg3 : "transparent", color: view === "split" ? C.t1 : C.t3, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>◧ 分屏</button>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10.5, color: C.t3, fontFamily: mono, display: "flex", gap: 10, alignItems: "center" }}>
              <span>{env?.icon} {env?.name}</span>
              <span style={{ color: sess?.agentColor }}>{sess?.agent}</span>
              {sess?.dir && <span style={{ color: C.acc }}>{sess.dir}</span>}
            </div>
          </div>

          {/* Main view */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {(view === "terminal" || view === "split") && <TermView termRef={termRef} count={lines} />}
            {view === "split" && <div style={{ width: 1, background: C.bds }} />}
            {(view === "chat" || view === "split") && <ChatView />}
            <InfoPanel s={sess} />
          </div>
        </div>
      </div>

      {/* ── Statusbar ── */}
      <div style={{ height: 24, background: C.bg2, borderTop: `1px solid ${C.bds}`, display: "flex", alignItems: "center", padding: "0 12px", gap: 14, fontSize: 10.5, color: C.t3, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.grn, boxShadow: `0 0 4px ${C.grn}` }} />
          <span>{Object.values(SESSIONS).filter(s => s.status === "active").length} 个活跃</span>
        </div>
        <span style={{ color: sess?.agentColor }}>● {sess?.agent}</span>
        <span>{env?.icon} {env?.name}</span>
        {sess?.dir && <span style={{ fontFamily: mono, color: C.acc }}>{sess.dir}</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontFamily: mono, fontSize: 10 }}>
          <span>↑1.2K</span><span>↓14.8K</span><span>RTT 2ms</span>
        </div>
      </div>
    </div>
  );
}
