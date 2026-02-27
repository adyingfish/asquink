import { useState } from "react";

const C = {
  bg0: "#08090d", bg1: "#0e1015", bg2: "#151820", bg3: "#1b1f2b", bgH: "#222738",
  bd: "#282d3e", bds: "#1d2030",
  t1: "#e2e4ed", t2: "#8b8fa7", t3: "#4e5270",
  acc: "#E8915A", accD: "#E8915A1e",
  grn: "#4ADE80", red: "#F87171", blu: "#60A5FA", ylw: "#FBBF24", pur: "#C084FC",
};
const mono = "'JetBrains Mono',monospace";
const sans = "'Outfit',sans-serif";

// Mock data
const ENVS = [
  { id: "wsl", name: "WSL Ubuntu", icon: "🐧", status: "online", host: "localhost" },
  { id: "dev", name: "dev-server", icon: "☁️", status: "online", host: "10.0.1.42" },
  { id: "local", name: "本地终端", icon: "💻", status: "online", host: "localhost" },
  { id: "gpu", name: "gpu-node", icon: "⚡", status: "online", host: "10.0.3.88" },
  { id: "prod", name: "prod-cluster", icon: "☁️", status: "offline", host: "10.0.2.10" },
];

const RECENT_PROJECTS = [
  { dir: "~/web-app", name: "web-app", envId: "wsl", lang: "TypeScript", lastUsed: "刚刚" },
  { dir: "~/api-server", name: "api-server", envId: "wsl", lang: "Rust", lastUsed: "3分钟前" },
  { dir: "~/deploy", name: "deploy", envId: "dev", lang: "Python", lastUsed: "1小时前" },
  { dir: "~/ml-train", name: "ml-train", envId: "gpu", lang: "Python", lastUsed: "昨天" },
  { dir: "~/infra", name: "infra", envId: "wsl", lang: "Terraform", lastUsed: "2天前" },
];

const PROJECT_AGENTS = [
  { id: "claude", name: "Claude Code", color: "#E8915A", desc: "Agentic coding · Sonnet 4", icon: "🟠" },
  { id: "codex", name: "Codex CLI", color: "#4ADE80", desc: "Code generation · o3", icon: "🟢" },
  { id: "gemini", name: "Gemini CLI", color: "#60A5FA", desc: "Multi-modal · Gemini 2.5", icon: "🔵" },
];

const CHAT_AGENTS = [
  { id: "openclaw", name: "OpenClaw", color: "#C084FC", desc: "通用对话 · 多模型", icon: "🟣" },
  { id: "claude-chat", name: "Claude (对话)", color: "#E8915A", desc: "无工具调用 · Sonnet 4", icon: "🟠" },
  { id: "gemini-chat", name: "Gemini (对话)", color: "#60A5FA", desc: "无工具调用 · Gemini 2.5", icon: "🔵" },
];

// Steps: intent → (project → agent) | (agent) | (env)
// For "project": intent → pickProject → pickAgent → done
//   pickProject has sub-flow: recent list OR browse (pickEnv → inputDir)
// For "chat": intent → pickChatAgent → (optionally pickEnv) → done
// For "terminal": intent → pickEnv → done

export default function NewSessionModal() {
  const [step, setStep] = useState("intent");
  // Shared state
  const [intent, setIntent] = useState(null);       // "project" | "chat" | "terminal"
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedEnv, setSelectedEnv] = useState(null);
  // Browse sub-flow
  const [browsing, setBrowsing] = useState(false);
  const [browseEnv, setBrowseEnv] = useState(null);
  const [browseDir, setBrowseDir] = useState("");

  const reset = () => {
    setStep("intent"); setIntent(null); setSelectedProject(null);
    setSelectedAgent(null); setSelectedEnv(null);
    setBrowsing(false); setBrowseEnv(null); setBrowseDir("");
  };

  const goBack = () => {
    if (browsing) { setBrowsing(false); setBrowseEnv(null); setBrowseDir(""); return; }
    if (step === "agent" && intent === "project") { setStep("project"); setSelectedAgent(null); return; }
    setStep("intent"); setIntent(null); setSelectedProject(null);
    setSelectedAgent(null); setSelectedEnv(null);
  };

  const handleIntent = (i) => {
    setIntent(i);
    if (i === "project") setStep("project");
    else if (i === "chat") setStep("agent");
    else if (i === "terminal") setStep("env");
  };

  const handlePickProject = (p) => {
    setSelectedProject(p);
    setSelectedEnv(p.envId);
    setStep("agent");
  };

  const handleBrowseConfirm = () => {
    if (!browseEnv || !browseDir.trim()) return;
    const name = browseDir.trim().split("/").pop() || browseDir.trim();
    const newProj = { dir: browseDir.trim(), name, envId: browseEnv, lang: "—", lastUsed: "新" };
    setSelectedProject(newProj);
    setSelectedEnv(browseEnv);
    setBrowsing(false);
    setStep("agent");
  };

  const canLaunch =
    (intent === "project" && selectedProject && selectedAgent) ||
    (intent === "chat" && selectedAgent) ||
    (intent === "terminal" && selectedEnv);

  // Summary line
  const getSummary = () => {
    const parts = [];
    if (selectedEnv) {
      const e = ENVS.find(x => x.id === selectedEnv);
      if (e) parts.push(`${e.icon} ${e.name}`);
    }
    if (selectedProject) parts.push(`📁 ${selectedProject.name}`);
    if (selectedAgent) {
      const allAgents = [...PROJECT_AGENTS, ...CHAT_AGENTS];
      const a = allAgents.find(x => x.id === selectedAgent);
      if (a) parts.push(a.name);
    }
    if (intent === "terminal" && !selectedAgent) parts.push("纯终端");
    return parts.join("  ›  ");
  };

  // ── Render helpers ──
  const IntentCard = ({ icon, title, desc, onClick }) => (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      borderRadius: 10, cursor: "pointer", background: C.bg2, border: `1px solid transparent`,
      transition: "all 0.12s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.acc; e.currentTarget.style.background = C.bg3; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = C.bg2; }}
    >
      <span style={{ fontSize: 28, width: 44, textAlign: "center" }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 550 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 14, color: C.t3 }}>→</span>
    </div>
  );

  const AgentCard = ({ a, selected, onClick }) => (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderRadius: 8, cursor: "pointer",
      background: selected ? `${a.color}18` : C.bg2,
      border: `1px solid ${selected ? `${a.color}60` : "transparent"}`,
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = `${a.color}40`; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = "transparent"; }}
    >
      <div style={{ width: 5, height: 22, borderRadius: 3, background: a.color }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 530 }}>{a.name}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>{a.desc}</div>
      </div>
      {selected && <span style={{ color: a.color, fontSize: 16 }}>✓</span>}
    </div>
  );

  const EnvCard = ({ e, selected, onClick, disabled }) => (
    <div onClick={disabled ? undefined : onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderRadius: 8, cursor: disabled ? "default" : "pointer",
      background: selected ? C.accD : C.bg2,
      border: `1px solid ${selected ? `${C.acc}60` : "transparent"}`,
      opacity: disabled ? 0.35 : 1,
    }}
      onMouseEnter={e2 => { if (!selected && !disabled) e2.currentTarget.style.borderColor = C.bd; }}
      onMouseLeave={e2 => { if (!selected && !disabled) e2.currentTarget.style.borderColor = "transparent"; }}
    >
      <span style={{ fontSize: 18 }}>{e.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 530 }}>{e.name}</div>
        <div style={{ fontSize: 10.5, color: C.t3, fontFamily: mono }}>{e.host}</div>
      </div>
      {disabled && <span style={{ fontSize: 10, color: C.red }}>离线</span>}
      {!disabled && <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.grn, boxShadow: `0 0 5px ${C.grn}` }} />}
      {selected && <span style={{ color: C.acc, fontSize: 16 }}>✓</span>}
    </div>
  );

  // ── Step titles ──
  const titles = {
    intent: { title: "🚀 新建会话", sub: "你想做什么？" },
    project: { title: browsing ? "📂 浏览目录" : "📁 选择项目", sub: browsing ? (browseEnv ? "输入工作目录路径" : "在哪个环境上？") : "选择一个工作目录，或浏览新目录" },
    agent: { title: "🤖 选择 Agent", sub: intent === "project" ? `项目: ${selectedProject?.name} · ${ENVS.find(e => e.id === selectedEnv)?.icon} ${ENVS.find(e => e.id === selectedEnv)?.name}` : "选择一个 AI 对话助手" },
    env: { title: "🖥 选择环境", sub: "连接到哪台机器？" },
  };
  const t = titles[step] || titles.intent;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(6px)", fontFamily: sans, color: C.t1 }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`*{margin:0;padding:0;box-sizing:border-box} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px} input::placeholder,textarea::placeholder{color:${C.t3}}`}</style>

      <div onClick={e => e.stopPropagation()} style={{
        width: 520, background: C.bg3, border: `1px solid ${C.bd}`, borderRadius: 16,
        overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", maxHeight: "80vh",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.bds}`, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t.title}</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>{t.sub}</div>
        </div>

        {/* Breadcrumb trail */}
        {step !== "intent" && (
          <div style={{ padding: "8px 22px", borderBottom: `1px solid ${C.bds}`, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.t3, flexShrink: 0 }}>
            <span onClick={reset} style={{ cursor: "pointer", color: C.t3 }}
              onMouseEnter={e => e.currentTarget.style.color = C.acc}
              onMouseLeave={e => e.currentTarget.style.color = C.t3}
            >{intent === "project" ? "📁 项目编码" : intent === "chat" ? "💬 AI 对话" : "🖥 纯终端"}</span>
            {step === "agent" && selectedProject && <>
              <span style={{ color: C.t3 }}>›</span>
              <span onClick={() => { setStep("project"); setSelectedAgent(null); }} style={{ cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.color = C.acc}
                onMouseLeave={e => e.currentTarget.style.color = C.t3}
              >{selectedProject.name}</span>
            </>}
            {selectedAgent && <>
              <span style={{ color: C.t3 }}>›</span>
              <span style={{ color: [...PROJECT_AGENTS, ...CHAT_AGENTS].find(a => a.id === selectedAgent)?.color }}>
                {[...PROJECT_AGENTS, ...CHAT_AGENTS].find(a => a.id === selectedAgent)?.name}
              </span>
            </>}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1 }}>

          {/* ── Step: Intent ── */}
          {step === "intent" && <>
            <IntentCard icon="📁" title="在项目中编码" desc="选择目录 → 选择 Agent → 开始编码" onClick={() => handleIntent("project")} />
            <IntentCard icon="💬" title="开一个 AI 对话" desc="无需项目目录，直接与 AI 交流" onClick={() => handleIntent("chat")} />
            <IntentCard icon="🖥️" title="打开纯终端" desc="SSH / WSL / 本地 Shell，不启动 Agent" onClick={() => handleIntent("terminal")} />
          </>}

          {/* ── Step: Pick Project ── */}
          {step === "project" && !browsing && <>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: C.t3, marginBottom: -2 }}>最近使用的项目</div>
            {RECENT_PROJECTS.map(p => {
              const pe = ENVS.find(e => e.id === p.envId);
              const isOffline = pe?.status === "offline";
              return (
                <div key={p.dir + p.envId} onClick={() => !isOffline && handlePickProject(p)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  borderRadius: 8, cursor: isOffline ? "default" : "pointer",
                  background: C.bg2, border: "1px solid transparent", opacity: isOffline ? 0.4 : 1,
                }}
                  onMouseEnter={e => { if (!isOffline) e.currentTarget.style.borderColor = C.bd; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}
                >
                  <span style={{ fontSize: 14 }}>📁</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 550, fontFamily: mono }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: C.bg3, color: C.t3 }}>{pe?.icon} {pe?.name}</span>
                      <span style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{p.dir}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: C.t3, background: C.bg3, padding: "1px 6px", borderRadius: 3 }}>{p.lang}</span>
                    <span style={{ fontSize: 9.5, color: C.t3 }}>{p.lastUsed}</span>
                  </div>
                </div>
              );
            })}

            {/* Browse new directory */}
            <div style={{ marginTop: 4 }}>
              <div onClick={() => setBrowsing(true)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                borderRadius: 8, cursor: "pointer", border: `1px dashed ${C.bd}`, color: C.t2, fontSize: 13, fontWeight: 500,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.acc; e.currentTarget.style.color = C.acc; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.color = C.t2; }}
              >
                <span style={{ fontSize: 16 }}>📂</span>
                <div>
                  <div>浏览新目录...</div>
                  <div style={{ fontSize: 11, color: C.t3, fontWeight: 400, marginTop: 1 }}>选择环境，输入路径，自动记为项目</div>
                </div>
              </div>
            </div>
          </>}

          {/* ── Sub-flow: Browse directory ── */}
          {step === "project" && browsing && !browseEnv && <>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: C.t3, marginBottom: -2 }}>选择环境</div>
            {ENVS.map(e => (
              <EnvCard key={e.id} e={e} selected={false} disabled={e.status === "offline"} onClick={() => setBrowseEnv(e.id)} />
            ))}
          </>}

          {step === "project" && browsing && browseEnv && <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: C.bg2 }}>
              <span style={{ fontSize: 16 }}>{ENVS.find(e => e.id === browseEnv)?.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 530 }}>{ENVS.find(e => e.id === browseEnv)?.name}</span>
              <span onClick={() => setBrowseEnv(null)} style={{ marginLeft: "auto", fontSize: 11, color: C.t3, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.color = C.acc}
                onMouseLeave={e => e.currentTarget.style.color = C.t3}
              >更换</span>
            </div>

            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>输入工作目录的绝对路径</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={browseDir}
                  onChange={e => setBrowseDir(e.target.value)}
                  placeholder="~/my-project  或  /home/user/project"
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8,
                    border: `1px solid ${C.bd}`, background: C.bg2, color: C.t1,
                    fontFamily: mono, fontSize: 13, outline: "none",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = C.acc}
                  onBlur={e => e.currentTarget.style.borderColor = C.bd}
                  autoFocus
                />
              </div>
              {browseDir.trim() && (
                <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: C.bg2, border: `1px solid ${C.bds}` }}>
                  <div style={{ fontSize: 11, color: C.t3, marginBottom: 4 }}>将创建为项目</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📁</span>
                    <span style={{ fontSize: 13, fontFamily: mono, fontWeight: 530 }}>{browseDir.trim().split("/").pop() || browseDir.trim()}</span>
                    <span style={{ fontSize: 11, color: C.t3 }}>on {ENVS.find(e => e.id === browseEnv)?.icon} {ENVS.find(e => e.id === browseEnv)?.name}</span>
                  </div>
                </div>
              )}
            </div>
          </>}

          {/* ── Step: Pick Agent (for project) ── */}
          {step === "agent" && intent === "project" && <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: C.bg2, marginBottom: 4 }}>
              <span>📁</span>
              <span style={{ fontSize: 12.5, fontFamily: mono, fontWeight: 530 }}>{selectedProject?.name}</span>
              <span style={{ fontSize: 10.5, color: C.t3 }}>{ENVS.find(e => e.id === selectedEnv)?.icon} {ENVS.find(e => e.id === selectedEnv)?.name} · {selectedProject?.dir}</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: C.t3, marginBottom: -2 }}>选择 Agent</div>
            {PROJECT_AGENTS.map(a => (
              <AgentCard key={a.id} a={a} selected={selectedAgent === a.id} onClick={() => setSelectedAgent(a.id)} />
            ))}
          </>}

          {/* ── Step: Pick Agent (for chat) ── */}
          {step === "agent" && intent === "chat" && <>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: C.t3, marginBottom: -2 }}>选择 Agent</div>
            {CHAT_AGENTS.map(a => (
              <AgentCard key={a.id} a={a} selected={selectedAgent === a.id} onClick={() => setSelectedAgent(a.id)} />
            ))}

            {selectedAgent && <>
              <div style={{ height: 1, background: C.bds, margin: "6px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: C.t3, marginBottom: -2 }}>运行环境（可选）</div>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 2, marginTop: -2 }}>独立对话默认本地运行，也可以选择远程环境</div>
              {ENVS.filter(e => e.status === "online").map(e => (
                <EnvCard key={e.id} e={e} selected={selectedEnv === e.id} onClick={() => setSelectedEnv(selectedEnv === e.id ? null : e.id)} />
              ))}
            </>}
          </>}

          {/* ── Step: Pick Env (for terminal) ── */}
          {step === "env" && <>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: C.t3, marginBottom: -2 }}>选择环境</div>
            {ENVS.map(e => (
              <EnvCard key={e.id} e={e} selected={selectedEnv === e.id} disabled={e.status === "offline"} onClick={() => setSelectedEnv(e.id)} />
            ))}
          </>}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 22px 16px", borderTop: `1px solid ${C.bds}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button onClick={step === "intent" ? undefined : goBack} style={{
            padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.bd}`,
            background: "transparent", color: C.t2, fontFamily: sans, fontSize: 12.5, fontWeight: 500,
            cursor: step === "intent" ? "default" : "pointer",
            opacity: step === "intent" ? 0.3 : 1,
          }}>← 返回</button>

          {/* Summary */}
          <div style={{ flex: 1, fontSize: 11, color: C.t3, fontFamily: mono, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {getSummary() || ""}
          </div>

          {/* Browse confirm or Launch */}
          {browsing && browseEnv && browseDir.trim() ? (
            <button onClick={handleBrowseConfirm} style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${C.acc}, #D46A28)`,
              color: "white", fontFamily: sans, fontSize: 12.5, fontWeight: 550,
              cursor: "pointer", boxShadow: `0 2px 10px ${C.acc}44`,
              display: "flex", alignItems: "center", gap: 5,
            }}>确认目录 →</button>
          ) : (
            <button onClick={() => canLaunch && alert("Launch!")} style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: canLaunch ? `linear-gradient(135deg, ${C.acc}, #D46A28)` : C.bgH,
              color: canLaunch ? "white" : C.t3,
              fontFamily: sans, fontSize: 12.5, fontWeight: 550,
              cursor: canLaunch ? "pointer" : "default",
              boxShadow: canLaunch ? `0 2px 10px ${C.acc}44` : "none",
              display: "flex", alignItems: "center", gap: 5,
            }}>🚀 启动</button>
          )}
        </div>
      </div>
    </div>
  );
}
