import { useState, useEffect, useRef } from "react";

// ── Data ──
const ENVS = [
  { id: "wsl", name: "WSL Ubuntu", icon: "🐧", type: "WSL", status: "online", host: "localhost", os: "Ubuntu 22.04 LTS", cpu: "i9-13900K", mem: "32GB", uptime: "14天" },
  { id: "dev", name: "dev-server", icon: "☁️", type: "SSH", status: "online", host: "10.0.1.42", port: 22, user: "deploy", os: "Debian 12", cpu: "8 vCPU", mem: "16GB", uptime: "47天" },
  { id: "local", name: "本地终端", icon: "💻", type: "Local", status: "online", host: "localhost", os: "macOS Sonoma 14.3", cpu: "M2 Pro", mem: "16GB", uptime: "3天" },
  { id: "gpu", name: "gpu-node", icon: "⚡", type: "SSH", status: "online", host: "10.0.3.88", port: 22, user: "ml", os: "Ubuntu 22.04", cpu: "EPYC + A100×2", mem: "128GB", uptime: "62天" },
  { id: "prod", name: "prod-cluster", icon: "☁️", type: "SSH", status: "offline", host: "10.0.2.10", port: 22, user: "admin", os: "Ubuntu 24.04", cpu: "4 vCPU", mem: "8GB", uptime: "—" },
];

// Projects: implicitly accumulated, keyed by env+dir
const PROJECTS = {
  "wsl:~/web-app": { envId: "wsl", dir: "~/web-app", name: "web-app", lang: "TypeScript", totalCost: 12.40 },
  "wsl:~/api-server": { envId: "wsl", dir: "~/api-server", name: "api-server", lang: "Rust", totalCost: 8.70 },
  "wsl:~/infra": { envId: "wsl", dir: "~/infra", name: "infra", lang: "Terraform", totalCost: 5.20 },
  "dev:~/deploy": { envId: "dev", dir: "~/deploy", name: "deploy", lang: "Python", totalCost: 3.10 },
  "gpu:~/ml-train": { envId: "gpu", dir: "~/ml-train", name: "ml-train", lang: "Python", totalCost: 9.80 },
};

const SESSIONS = [
  // wsl: web-app has 2 agents running
  { id: "s1", envId: "wsl", projKey: "wsl:~/web-app", agent: "Claude Code", agentShort: "Claude", agentColor: "#E8915A", mode: "terminal", status: "active", statusText: "运行中", lastMsg: "fix login.ts auth bug" },
  { id: "s2", envId: "wsl", projKey: "wsl:~/web-app", agent: "Gemini CLI", agentShort: "Gemini", agentColor: "#60A5FA", mode: "terminal", status: "idle", statusText: "", lastMsg: "review PR #42" },
  // wsl: api-server
  { id: "s3", envId: "wsl", projKey: "wsl:~/api-server", agent: "Claude Code", agentShort: "Claude", agentColor: "#E8915A", mode: "terminal", status: "done", statusText: "已完成", lastMsg: "重构用户模块" },
  // wsl: infra
  { id: "s4", envId: "wsl", projKey: "wsl:~/infra", agent: "Codex CLI", agentShort: "Codex", agentColor: "#4ADE80", mode: "terminal", status: "idle", statusText: "", lastMsg: "" },
  // dev: deploy
  { id: "s5", envId: "dev", projKey: "dev:~/deploy", agent: "Codex CLI", agentShort: "Codex", agentColor: "#4ADE80", mode: "terminal", status: "active", statusText: "运行中", lastMsg: "更新 k8s 配置" },
  // dev: standalone chat
  { id: "s6", envId: "dev", projKey: null, agent: "OpenClaw", agentShort: "OClaw", agentColor: "#C084FC", mode: "chat", status: "idle", statusText: "", lastMsg: "Redis vs Memcached" },
  // local: standalone
  { id: "s7", envId: "local", projKey: null, agent: "OpenClaw", agentShort: "OClaw", agentColor: "#C084FC", mode: "chat", status: "active", statusText: "对话中", lastMsg: "系统架构讨论" },
  // gpu: ml-train
  { id: "s8", envId: "gpu", projKey: "gpu:~/ml-train", agent: "Claude Code", agentShort: "Claude", agentColor: "#E8915A", mode: "terminal", status: "active", statusText: "训练中", lastMsg: "epoch 34/100" },
];

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
  { c: null, t: "" },
  { c: "#e2e4ed", t: "  Found the issue: token validation uses wrong expiry field." },
  { c: null, t: "" },
  { c: "#60A5FA", t: "  ✏️  Editing src/auth/login.ts", b: true },
  { c: null, t: "" },
  { c: "#555872", t: "  ┌─ src/auth/login.ts ──────────────────────────┐" },
  { c: "#F87171", t: "  │ - if (decoded.expiresAt < Date.now()/1000) { │" },
  { c: "#4ADE80", t: "  │ + if (decoded.exp < Date.now()/1000) {       │" },
  { c: "#555872", t: "  └──────────────────────────────────────────────┘" },
  { c: null, t: "" },
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
    "Redis 原生支持 Hash、List、Set、Sorted Set 等复杂结构。",
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

// ── Sidebar: Env → Project → Session hierarchy ──
function Sidebar({ activeTab, onSelect, onEnvPage }) {
  const [expanded, setExpanded] = useState({ wsl: true, dev: true, local: true, gpu: true });
  const [projExpanded, setProjExpanded] = useState({});
  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const toggleProj = (key) => setProjExpanded(p => ({ ...p, [key]: p[key] === false ? true : (p[key] === undefined ? false : !p[key]) }));

  return (
    <div style={{ width: 272, background: C.bg1, borderRight: `1px solid ${C.bds}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Search */}
      <div style={{ padding: "10px 10px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.bds}` }}>
          <span style={{ fontSize: 12, color: C.t3 }}>🔍</span>
          <input placeholder="搜索会话 / 项目..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.t1, fontFamily: sans, fontSize: 12 }} />
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 6px" }}>
        {ENVS.map(env => {
          const online = env.status === "online";
          const isOpen = expanded[env.id] && online;
          const envSessions = SESSIONS.filter(s => s.envId === env.id);

          // Group by project
          const projGroups = {};
          const standalone = [];
          envSessions.forEach(s => {
            if (s.projKey) {
              if (!projGroups[s.projKey]) projGroups[s.projKey] = [];
              projGroups[s.projKey].push(s);
            } else {
              standalone.push(s);
            }
          });

          const projKeys = Object.keys(projGroups);
          const totalSessions = envSessions.length;

          return (
            <div key={env.id} style={{ marginBottom: 2 }}>
              {/* ── Env header ── */}
              <div onClick={() => online && toggle(env.id)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 8, cursor: online ? "pointer" : "default", opacity: online ? 1 : 0.38,
              }}
                onMouseEnter={e => { if (online) e.currentTarget.style.background = C.bgH; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 9, color: C.t3, width: 12, textAlign: "center", transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "none" }}>▶</span>
                <span style={{ fontSize: 16 }}>{env.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 550 }}>{env.name}</div>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{env.host}</div>
                </div>
                {totalSessions > 0 && <span style={{ fontSize: 9, fontFamily: mono, background: C.bg3, color: C.t3, padding: "1px 6px", borderRadius: 4 }}>{totalSessions}</span>}
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: online ? C.grn : C.t3, boxShadow: online ? `0 0 6px ${C.grn}` : "none" }} />
              </div>

              {!online && (
                <div style={{ paddingLeft: 38, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: C.t3, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.color = C.acc}
                    onMouseLeave={e => e.currentTarget.style.color = C.t3}
                  >重新连接</span>
                </div>
              )}

              {isOpen && (
                <div style={{ paddingLeft: 14, marginTop: 2 }}>
                  {/* ── Project groups ── */}
                  {projKeys.map(pk => {
                    const proj = PROJECTS[pk];
                    const pSessions = projGroups[pk];
                    const pOpen = projExpanded[pk] !== false; // default open
                    const hasMultiple = pSessions.length > 1;
                    const hasActive = pSessions.some(s => s.status === "active");

                    // Single session project: show inline, no sub-group
                    if (!hasMultiple) {
                      const s = pSessions[0];
                      const isAct = activeTab === s.id;
                      return (
                        <div key={pk} onClick={() => onSelect(s.id)} style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "6px 8px",
                          borderRadius: 7, cursor: "pointer", marginBottom: 1,
                          background: isAct ? C.accD : "transparent",
                          borderLeft: isAct ? `2.5px solid ${C.acc}` : "2.5px solid transparent",
                        }}
                          onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = C.bgH; }}
                          onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = isAct ? C.accD : "transparent"; }}
                        >
                          <span style={{ fontSize: 11, color: C.t3 }}>📁</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 530, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{proj?.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                              <span style={{ fontSize: 10, color: s.agentColor, fontWeight: 500 }}>{s.agentShort}</span>
                              <span style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{proj?.dir}</span>
                            </div>
                          </div>
                          <SessionBadge s={s} />
                        </div>
                      );
                    }

                    // Multi-session project: collapsible sub-group
                    return (
                      <div key={pk} style={{ marginBottom: 2 }}>
                        <div onClick={() => toggleProj(pk)} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                          borderRadius: 6, cursor: "pointer",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.bgH; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{ fontSize: 8, color: C.t3, width: 10, textAlign: "center", transition: "transform 0.15s", transform: pOpen ? "rotate(90deg)" : "none" }}>▶</span>
                          <span style={{ fontSize: 11, color: C.t3 }}>📁</span>
                          <span style={{ fontSize: 12, fontWeight: 530, fontFamily: mono, flex: 1 }}>{proj?.name}</span>
                          {hasActive && <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.grn, boxShadow: `0 0 5px ${C.grn}88`, animation: "pulse 2s ease infinite" }} />}
                          <span style={{ fontSize: 9, fontFamily: mono, color: C.t3, background: C.bg3, padding: "0px 4px", borderRadius: 3 }}>{pSessions.length}</span>
                        </div>

                        {pOpen && (
                          <div style={{ paddingLeft: 20 }}>
                            {pSessions.map(s => {
                              const isAct = activeTab === s.id;
                              return (
                                <div key={s.id} onClick={() => onSelect(s.id)} style={{
                                  display: "flex", alignItems: "center", gap: 7, padding: "5px 8px",
                                  borderRadius: 6, cursor: "pointer", marginBottom: 1,
                                  background: isAct ? C.accD : "transparent",
                                  borderLeft: isAct ? `2.5px solid ${C.acc}` : "2.5px solid transparent",
                                }}
                                  onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = C.bgH; }}
                                  onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = isAct ? C.accD : "transparent"; }}
                                >
                                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.agentColor, flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 500 }}>{s.agentShort}</div>
                                    {s.lastMsg && <div style={{ fontSize: 10, color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.lastMsg}</div>}
                                  </div>
                                  <SessionBadge s={s} />
                                </div>
                              );
                            })}
                            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", fontSize: 10, color: C.t3, cursor: "pointer", borderRadius: 5 }}
                              onMouseEnter={e => { e.currentTarget.style.color = C.acc; }}
                              onMouseLeave={e => { e.currentTarget.style.color = C.t3; }}
                            ><span>＋</span> 添加 Agent</div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Standalone sessions (no project) ── */}
                  {standalone.length > 0 && projKeys.length > 0 && (
                    <div style={{ height: 1, background: C.bds, margin: "5px 8px" }} />
                  )}
                  {standalone.map(s => {
                    const isAct = activeTab === s.id;
                    return (
                      <div key={s.id} onClick={() => onSelect(s.id)} style={{
                        display: "flex", alignItems: "center", gap: 7, padding: "6px 8px",
                        borderRadius: 7, cursor: "pointer", marginBottom: 1,
                        background: isAct ? C.accD : "transparent",
                        borderLeft: isAct ? `2.5px solid ${C.acc}` : "2.5px solid transparent",
                      }}
                        onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = C.bgH; }}
                        onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = isAct ? C.accD : "transparent"; }}
                      >
                        <span style={{ fontSize: 11 }}>💬</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.lastMsg || s.agent}</div>
                          <div style={{ fontSize: 10, color: s.agentColor, fontWeight: 500, marginTop: 1 }}>{s.agentShort}</div>
                        </div>
                        <SessionBadge s={s} />
                      </div>
                    );
                  })}

                  {/* New session in env */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 8px", fontSize: 11, color: C.t3, cursor: "pointer", borderRadius: 6, marginTop: 2 }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.acc; e.currentTarget.style.background = C.accD; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "transparent"; }}
                  ><span>＋</span> 新建会话</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.bds}`, display: "flex", flexDirection: "column", gap: 4 }}>
        <button style={{ width: "100%", padding: "9px", borderRadius: 8, border: `1px solid ${C.acc}30`, background: `linear-gradient(135deg, ${C.acc}18, ${C.acc}08)`, color: C.acc, fontFamily: sans, fontSize: 12.5, fontWeight: 550, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>＋ 新建会话</button>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "4px 0" }}>
          <span onClick={onEnvPage} style={{ fontSize: 11, color: C.t3, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.color = C.acc}
            onMouseLeave={e => e.currentTarget.style.color = C.t3}
          >⚙ 环境管理</span>
          <span style={{ fontSize: 11, color: C.t3, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.color = C.t2}
            onMouseLeave={e => e.currentTarget.style.color = C.t3}
          >🔑 API Keys</span>
        </div>
      </div>
    </div>
  );
}

function SessionBadge({ s }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
      <span style={{ fontSize: 8.5, padding: "1px 5px", borderRadius: 3, background: s.mode === "chat" ? `${C.pur}14` : `${C.blu}14`, color: s.mode === "chat" ? C.pur : C.blu }}>
        {s.mode === "chat" ? "💬" : "⌨"}
      </span>
      {s.status === "active" && <span style={{ fontSize: 9, color: C.grn, fontWeight: 500 }}>{s.statusText}</span>}
      {s.status === "done" && <span style={{ fontSize: 9, color: C.blu }}>✓ 完成</span>}
    </div>
  );
}

// ── Views ──
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
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 28px" }}>
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
                  {m.parts && m.parts.map((p, j) => <div key={j} style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 6 }}>{p}</div>)}
                  {m.tokens && <div style={{ fontSize: 10, color: C.t3, fontFamily: mono, marginTop: 6 }}>{m.tokens}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "12px 28px 18px", borderTop: `1px solid ${C.bds}`, display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 760, width: "100%", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea style={{ flex: 1, padding: "11px 15px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.bg2, color: C.t1, fontFamily: sans, fontSize: 13.5, resize: "none", outline: "none", minHeight: 44 }} placeholder="输入指令..." rows={1} />
          <button style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.acc}, #D46A28)`, color: "white", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 10px ${C.acc}44` }}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ── Env Management Page (from v8) ──
function EnvManagePage({ onBack }) {
  const [selected, setSelected] = useState("wsl");
  const env = ENVS.find(e => e.id === selected);
  const envSessions = SESSIONS.filter(s => s.envId === selected);
  const envProjects = Object.entries(PROJECTS).filter(([k]) => k.startsWith(selected + ":")).map(([, v]) => v);

  const Field = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.bds}` }}>
      <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 500 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg0 }}>
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.bds}`, display: "flex", alignItems: "center", gap: 12 }}>
        <span onClick={onBack} style={{ fontSize: 14, color: C.t3, cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
          onMouseEnter={e => { e.currentTarget.style.color = C.acc; e.currentTarget.style.background = C.accD; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "transparent"; }}
        >←</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>⚙ 环境管理</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>管理服务器、WSL 和本地连接</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left list */}
        <div style={{ width: 260, borderRight: `1px solid ${C.bds}`, overflowY: "auto", padding: 12 }}>
          {ENVS.map(e => {
            const isSel = selected === e.id;
            return (
              <div key={e.id} onClick={() => setSelected(e.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 8, cursor: "pointer", marginBottom: 4,
                background: isSel ? C.accD : "transparent", border: isSel ? `1px solid ${C.acc}40` : "1px solid transparent",
              }}
                onMouseEnter={e2 => { if (!isSel) e2.currentTarget.style.background = C.bgH; }}
                onMouseLeave={e2 => { if (!isSel) e2.currentTarget.style.background = isSel ? C.accD : "transparent"; }}
              >
                <span style={{ fontSize: 20 }}>{e.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 550 }}>{e.name}</div>
                  <div style={{ fontSize: 10.5, color: C.t3, fontFamily: mono }}>{e.host}</div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: e.status === "online" ? C.grn : C.red, boxShadow: e.status === "online" ? `0 0 6px ${C.grn}` : `0 0 4px ${C.red}` }} />
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, marginTop: 8, border: `1px dashed ${C.bd}`, cursor: "pointer", color: C.t3, fontSize: 12.5 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.acc; e.currentTarget.style.color = C.acc; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.color = C.t3; }}
          ><span style={{ fontSize: 16, width: 28, textAlign: "center" }}>＋</span>添加新环境</div>
        </div>

        {/* Right detail */}
        {env && (
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `1px solid ${C.bd}` }}>{env.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  {env.name}
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: env.status === "online" ? C.grn : C.red, boxShadow: env.status === "online" ? `0 0 6px ${C.grn}` : `0 0 4px ${C.red}` }} />
                </div>
                <div style={{ fontSize: 12, color: C.t3, fontFamily: mono, marginTop: 2 }}>{env.type} · {env.host}{env.port ? `:${env.port}` : ""}</div>
              </div>
              <button style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.bd}`, background: "transparent", color: C.t2, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>🔗 测试连接</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: C.bg2, borderRadius: 10, border: `1px solid ${C.bds}`, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: C.t3, marginBottom: 8 }}>🔗 连接</div>
                <Field label="类型" value={env.type} />
                <Field label="地址" value={env.host} />
                {env.port && <Field label="端口" value={env.port} />}
                {env.user && <Field label="用户" value={env.user} />}
                <Field label="运行" value={env.uptime} />
              </div>
              <div style={{ background: C.bg2, borderRadius: 10, border: `1px solid ${C.bds}`, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: C.t3, marginBottom: 8 }}>💻 系统</div>
                <Field label="系统" value={env.os} />
                <Field label="CPU" value={env.cpu} />
                <Field label="内存" value={env.mem} />
                <Field label="会话" value={`${envSessions.length} 个`} />
              </div>
            </div>

            {/* Projects on this env */}
            {envProjects.length > 0 && (
              <div style={{ background: C.bg2, borderRadius: 10, border: `1px solid ${C.bds}`, padding: "14px 16px", marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: C.t3, marginBottom: 10 }}>📁 此环境上的项目</div>
                {envProjects.map(p => (
                  <div key={p.dir} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: C.bg3, marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>📁</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 530, fontFamily: mono }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{p.dir}</div>
                    </div>
                    <span style={{ fontSize: 10, color: C.t3, background: C.bg2, padding: "1px 6px", borderRadius: 3 }}>{p.lang}</span>
                    <span style={{ fontSize: 10, color: C.ylw, fontFamily: mono }}>${p.totalCost}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Danger */}
            <div style={{ background: `${C.red}08`, borderRadius: 10, border: `1px solid ${C.red}20`, padding: "14px 16px", marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>删除此环境</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>断开并移除所有关联会话</div>
                </div>
                <button style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.red}40`, background: "transparent", color: C.red, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>删除</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──
export default function App() {
  const [activeTab, setActiveTab] = useState("s1");
  const [viewMode, setViewMode] = useState("terminal");
  const [page, setPage] = useState("main");
  const [lines, setLines] = useState(0);
  const termRef = useRef(null);

  const sess = SESSIONS.find(s => s.id === activeTab);
  const env = sess ? ENVS.find(e => e.id === sess.envId) : null;
  const proj = sess?.projKey ? PROJECTS[sess.projKey] : null;
  const isProject = !!proj;

  const handleSelect = (id) => {
    setActiveTab(id);
    setPage("main");
    const s = SESSIONS.find(x => x.id === id);
    setViewMode(s?.mode === "chat" ? "chat" : "terminal");
  };

  const view = sess?.mode === "chat" && !isProject ? "chat" : viewMode;

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => { i++; setLines(i); if (i >= TERM.length) clearInterval(t); }, 50);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [lines]);

  const tabIds = ["s1", "s2", "s3", "s5", "s7", "s8"];

  return (
    <div style={{ fontFamily: sans, background: C.bg0, color: C.t1, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", userSelect: "none" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}} *{margin:0;padding:0;box-sizing:border-box} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px} textarea::placeholder{color:${C.t3}}`}</style>

      {/* Titlebar */}
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
        <Sidebar activeTab={activeTab} onSelect={handleSelect} onEnvPage={() => setPage(page === "envs" ? "main" : "envs")} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {page === "envs" ? (
            <EnvManagePage onBack={() => setPage("main")} />
          ) : (
            <>
              {/* Tab bar */}
              <div style={{ height: 36, background: C.bg2, display: "flex", alignItems: "stretch", borderBottom: `1px solid ${C.bds}`, overflowX: "auto", flexShrink: 0 }}>
                {tabIds.map(id => {
                  const s = SESSIONS.find(x => x.id === id);
                  if (!s) return null;
                  const isAct = activeTab === id;
                  const sEnv = ENVS.find(e => e.id === s.envId);
                  const sProj = s.projKey ? PROJECTS[s.projKey] : null;
                  return (
                    <div key={id} onClick={() => handleSelect(id)} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "0 14px",
                      fontSize: 11.5, fontWeight: 450, cursor: "pointer", whiteSpace: "nowrap",
                      borderRight: `1px solid ${C.bds}`, position: "relative",
                      color: isAct ? C.t1 : C.t3, background: isAct ? C.bg0 : "transparent",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.agentColor }} />
                      <span>{sProj ? sProj.name : (s.lastMsg || s.agentShort)}</span>
                      <span style={{ color: C.t3, fontSize: 10 }}>›</span>
                      <span style={{ fontSize: 11, color: C.t3 }}>{s.agentShort}</span>
                      <span style={{ fontSize: 10 }}>{sEnv?.icon}</span>
                      {isAct && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: C.acc, borderRadius: "2px 2px 0 0" }} />}
                    </div>
                  );
                })}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, color: C.t3, cursor: "pointer", fontSize: 15 }}>＋</div>
              </div>

              {/* View toggle + path bar */}
              <div style={{ height: 34, background: C.bg2, borderBottom: `1px solid ${C.bds}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 6, flexShrink: 0 }}>
                <div style={{ display: "flex", background: C.bg0, borderRadius: 6, padding: 2, border: `1px solid ${C.bds}` }}>
                  {isProject && <button onClick={() => setViewMode("terminal")} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: view === "terminal" ? C.bg3 : "transparent", color: view === "terminal" ? C.t1 : C.t3, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>⌨ 终端</button>}
                  <button onClick={() => setViewMode("chat")} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: view === "chat" ? C.bg3 : "transparent", color: view === "chat" ? C.t1 : C.t3, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>💬 对话</button>
                  {isProject && <button onClick={() => setViewMode("split")} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: view === "split" ? C.bg3 : "transparent", color: view === "split" ? C.t1 : C.t3, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>◧ 分屏</button>}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 10.5, color: C.t3, fontFamily: mono, display: "flex", gap: 10, alignItems: "center" }}>
                  <span>{env?.icon} {env?.name}</span>
                  <span style={{ color: sess?.agentColor }}>{sess?.agent}</span>
                  {proj && <span style={{ color: C.acc }}>📁 {proj.dir}</span>}
                </div>
              </div>

              {/* Main view */}
              <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {(view === "terminal" || view === "split") && <TermView termRef={termRef} count={lines} />}
                {view === "split" && <div style={{ width: 1, background: C.bds }} />}
                {(view === "chat" || view === "split") && <ChatView />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Statusbar */}
      <div style={{ height: 24, background: C.bg2, borderTop: `1px solid ${C.bds}`, display: "flex", alignItems: "center", padding: "0 12px", gap: 14, fontSize: 10.5, color: C.t3, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.grn, boxShadow: `0 0 4px ${C.grn}` }} />
          {ENVS.filter(e => e.status === "online").length}/{ENVS.length} 在线
        </div>
        {page === "main" && <>
          <span style={{ color: sess?.agentColor }}>● {sess?.agent}</span>
          <span>{env?.icon} {env?.name}</span>
          {proj && <span style={{ fontFamily: mono, color: C.acc }}>{proj.dir}</span>}
        </>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontFamily: mono, fontSize: 10 }}>
          <span>{SESSIONS.filter(s => s.status === "active").length} 活跃</span>
          <span>↑1.2K</span><span>↓14.8K</span>
        </div>
      </div>
    </div>
  );
}
