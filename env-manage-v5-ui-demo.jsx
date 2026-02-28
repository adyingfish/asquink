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

const AGENT_REGISTRY = {
  claude:   { name: "Claude Code",  color: "#E8915A", icon: "🟠", install: "npm install -g @anthropic-ai/claude-code", docs: "https://docs.anthropic.com/claude-code" },
  codex:    { name: "Codex CLI",    color: "#4ADE80", icon: "🟢", install: "npm install -g @openai/codex",             docs: "https://github.com/openai/codex" },
  gemini:   { name: "Gemini CLI",   color: "#60A5FA", icon: "🔵", install: "npm install -g @google/gemini-cli",        docs: "https://github.com/google/gemini-cli" },
  opencode: { name: "OpenCode",     color: "#F472B6", icon: "🩷", install: "npm install -g opencode",                  docs: "https://github.com/opencode-ai/opencode" },
};

const ENVS = [
  { id: "wsl", name: "WSL Ubuntu", icon: "🐧", type: "WSL", status: "online", host: "localhost", os: "Ubuntu 22.04 LTS", cpu: "i9-13900K", mem: "32GB", uptime: "14天" },
  { id: "dev", name: "dev-server", icon: "☁️", type: "SSH", status: "online", host: "10.0.1.42", port: 22, user: "deploy", os: "Debian 12", cpu: "8 vCPU", mem: "16GB", uptime: "47天" },
  { id: "local", name: "本地终端", icon: "💻", type: "Local", status: "online", host: "localhost", os: "macOS Sonoma 14.3", cpu: "M2 Pro", mem: "16GB", uptime: "3天" },
  { id: "gpu", name: "gpu-node", icon: "⚡", type: "SSH", status: "online", host: "10.0.3.88", port: 22, user: "ml", os: "Ubuntu 22.04", cpu: "EPYC + A100×2", mem: "128GB", uptime: "62天" },
];

const ACP_AGENTS = [
  { id: "claude", status: "connected", endpoint: "localhost:7862", protocol: "ACP/1.2", version: "1.0.23", pid: 48210, models: ["sonnet-4", "opus-4"], activeModel: "sonnet-4", apiKey: "sk-ant-···········4f2m", keyStatus: "valid", balance: "$152.30", monthUsage: "$34.20" },
  { id: "codex", status: "connected", endpoint: "localhost:7863", protocol: "ACP/1.1", version: "0.9.4", pid: 48315, models: ["o3", "o4-mini"], activeModel: "o3", apiKey: "sk-proj-···········x8kn", keyStatus: "valid", balance: "$28.50", monthUsage: "$12.80" },
  { id: "gemini", status: "disconnected", endpoint: "—", protocol: "ACP/1.2", version: "2.1.0", pid: null, models: ["gemini-2.5-pro"], activeModel: "gemini-2.5-pro", apiKey: null, keyStatus: "missing", balance: "—", monthUsage: "—" },
  { id: "opencode", status: "not_installed", endpoint: "—", protocol: "—", version: "—", pid: null, models: [], activeModel: null, apiKey: null, keyStatus: "missing", balance: "—", monthUsage: "—" },
];

const ENV_PROJECTS = {
  wsl: [
    { name: "web-app", dir: "~/web-app", lang: "TypeScript", cost: 12.40 },
    { name: "api-server", dir: "~/api-server", lang: "Rust", cost: 8.70 },
  ],
  dev: [{ name: "deploy", dir: "~/deploy", lang: "Python", cost: 3.10 }],
  gpu: [{ name: "ml-train", dir: "~/ml-train", lang: "Python", cost: 9.80 }],
  local: [], 
};

// ── Shared ──
const Field = ({ label, value, vc }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.bds}` }}>
    <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
    <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 500, color: vc || C.t1 }}>{value}</span>
  </div>
);

const Sec = ({ title, action, onAction, children }) => (
  <div style={{ background: C.bg2, borderRadius: 10, border: `1px solid ${C.bds}`, padding: "14px 16px", marginBottom: 16 }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: C.t3, marginBottom: 10, display: "flex", alignItems: "center" }}>
      {title}
      {action && <span onClick={onAction} style={{ marginLeft: "auto", fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: C.acc, cursor: "pointer" }}>{action}</span>}
    </div>
    {children}
  </div>
);

const Badge = ({ status }) => {
  const m = {
    connected: { bg: `${C.grn}15`, c: C.grn, t: "● 已连接" },
    disconnected: { bg: `${C.ylw}15`, c: C.ylw, t: "○ 未连接" },
    not_installed: { bg: `${C.t3}15`, c: C.t3, t: "✗ 未安装" },
    valid: { bg: `${C.grn}15`, c: C.grn, t: "✓ 有效" },
    missing: { bg: `${C.red}12`, c: C.red, t: "✗ 未配置" },
    online: { bg: `${C.grn}15`, c: C.grn, t: "● 在线" },
    offline: { bg: `${C.red}12`, c: C.red, t: "● 离线" },
  };
  const s = m[status] || m.disconnected;
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: s.bg, color: s.c, fontWeight: 500, whiteSpace: "nowrap" }}>{s.t}</span>;
};

// ── ACP Agent Detail: local service config ──
function AgentDetail({ agent }) {
  const reg = AGENT_REGISTRY[agent.id];
  const isInstalled = agent.status !== "not_installed";
  const isConnected = agent.status === "connected";
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${reg.color}18`, border: `1px solid ${reg.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{reg.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
            {reg.name} <Badge status={agent.status} />
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
            {isConnected && <span style={{ fontFamily: mono }}>{agent.endpoint} · PID {agent.pid} · v{agent.version}</span>}
            {!isConnected && isInstalled && <span>本地已安装，未运行</span>}
            {!isInstalled && <span>本地未安装</span>}
          </div>
        </div>
        {isConnected && <button style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.bd}`, background: "transparent", color: C.t2, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>断开</button>}
        {!isConnected && isInstalled && <button style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${reg.color}50`, background: `${reg.color}12`, color: reg.color, fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>🔗 连接</button>}
      </div>

      {/* ── Not installed ── */}
      {!isInstalled && (
        <div style={{ background: C.bg2, borderRadius: 10, border: `1px solid ${C.bds}`, padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 550, marginBottom: 8 }}>{reg.name} 尚未安装</div>
          <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.7, maxWidth: 400, margin: "0 auto 18px" }}>
            在本地终端安装后，一鱿会通过 ACP 自动检测并连接。
            <br />连接后即可在任意环境的会话中使用。
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, background: C.bg0, border: `1px solid ${C.bds}` }}>
            <span style={{ fontFamily: mono, fontSize: 12.5, color: C.t2 }}>$ {reg.install}</span>
            <span onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              style={{ fontSize: 10, color: copied ? C.grn : C.t3, cursor: "pointer", padding: "2px 8px", borderRadius: 4, background: C.bg3, fontWeight: 500 }}>
              {copied ? "✓ 已复制" : "📋 复制"}
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <a href={reg.docs} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.acc, textDecoration: "none" }}>📖 查看文档 →</a>
          </div>
        </div>
      )}

      {/* ── Installed ── */}
      {isInstalled && (
        <>
          {/* API Key */}
          <Sec title="🔑 API Key" action="编辑">
            {agent.apiKey ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: C.bg3 }}>
                <div style={{ width: 4, height: 20, borderRadius: 2, background: reg.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontFamily: mono }}>{agent.apiKey}</div>
                  <div style={{ fontSize: 10.5, color: C.t3, marginTop: 3 }}>
                    启动会话时通过环境变量注入 · 不写入远程磁盘
                  </div>
                </div>
                <Badge status={agent.keyStatus} />
              </div>
            ) : (
              <div style={{ padding: "16px", borderRadius: 8, border: `1px dashed ${C.bd}`, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 8 }}>未配置 API Key，无法启动会话</div>
                <button style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${reg.color}50`, background: `${reg.color}12`, color: reg.color, fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>＋ 添加 Key</button>
              </div>
            )}
          </Sec>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Model */}
            <Sec title="🧠 默认模型">
              {agent.models.map(m => {
                const active = m === agent.activeModel;
                return (
                  <div key={m} style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 7, cursor: "pointer", marginBottom: 3,
                    background: active ? `${reg.color}15` : C.bg3, border: active ? `1px solid ${reg.color}40` : "1px solid transparent",
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? reg.color : C.t3 }} />
                    <span style={{ fontSize: 12, fontFamily: mono, fontWeight: active ? 530 : 400, flex: 1 }}>{m}</span>
                    {active && <span style={{ fontSize: 9, color: reg.color }}>当前</span>}
                  </div>
                );
              })}
              <div style={{ fontSize: 10.5, color: C.t3, marginTop: 6 }}>新会话默认使用此模型，可在会话中覆盖</div>
            </Sec>

            {/* Usage */}
            <Sec title="📊 用量">
              <Field label="余额" value={agent.balance} vc={C.ylw} />
              <Field label="本月消耗" value={agent.monthUsage} />
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10.5, color: C.acc, cursor: "pointer" }}>查看详细用量 →</span>
              </div>
            </Sec>
          </div>

          {/* ACP connection */}
          <Sec title="🔗 ACP 本地连接">
            <Field label="协议" value={agent.protocol} />
            <Field label="端点" value={agent.endpoint} />
            <Field label="进程" value={agent.pid ? `PID ${agent.pid}` : "—"} vc={agent.pid ? C.t1 : C.t3} />
            <Field label="版本" value={`v${agent.version}`} />
            <div style={{ fontSize: 10.5, color: C.t3, marginTop: 8, lineHeight: 1.6 }}>
              Agent 作为本地服务运行，一鱿通过 ACP 协议与其通信。
              <br />在任意环境的会话中均可调用此 Agent。
            </div>
          </Sec>

          {/* Danger */}
          <div style={{ background: `${C.red}08`, borderRadius: 10, border: `1px solid ${C.red}20`, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>移除此 Agent</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>断开 ACP 连接，清除配置（不卸载 CLI）</div>
              </div>
              <button style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.red}40`, background: "transparent", color: C.red, fontFamily: sans, fontSize: 12, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = `${C.red}15`}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >移除</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Env Detail: pure connection + system, no agent stuff ──
function EnvDetail({ env }) {
  const projects = ENV_PROJECTS[env.id] || [];
  const online = env.status === "online";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `1px solid ${C.bd}` }}>{env.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            {env.name}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: online ? C.grn : C.red, boxShadow: online ? `0 0 6px ${C.grn}` : `0 0 4px ${C.red}` }} />
          </div>
          <div style={{ fontSize: 12, color: C.t3, fontFamily: mono, marginTop: 2 }}>{env.type} · {env.host}{env.port ? `:${env.port}` : ""}</div>
        </div>
        <button style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.bd}`, background: "transparent", color: C.t2, fontFamily: sans, fontSize: 12, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.grn; e.currentTarget.style.color = C.grn; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.color = C.t2; }}
        >🔗 测试连接</button>
        {env.type === "SSH" && (
          <button style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.bd}`, background: "transparent", color: C.t2, fontFamily: sans, fontSize: 12, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.blu; e.currentTarget.style.color = C.blu; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.color = C.t2; }}
          >🖥 打开终端</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Sec title="🔗 连接信息" action="编辑">
          <Field label="类型" value={env.type} />
          <Field label="地址" value={env.host} />
          {env.port && <Field label="端口" value={env.port} />}
          {env.user && <Field label="用户" value={env.user} />}
          {env.type === "SSH" && <Field label="认证" value="🔑 SSH Key" />}
          <Field label="运行时间" value={env.uptime} />
        </Sec>
        <Sec title="💻 系统信息">
          <Field label="操作系统" value={env.os} />
          <Field label="CPU" value={env.cpu} />
          <Field label="内存" value={env.mem} />
        </Sec>
      </div>

      {/* Projects */}
      <Sec title="📁 此环境上的项目">
        {projects.length > 0 ? projects.map(p => (
          <div key={p.dir} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 7, background: C.bg3, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>📁</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 530, fontFamily: mono }}>{p.name}</div>
              <div style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{p.dir}</div>
            </div>
            <span style={{ fontSize: 10, color: C.t3, background: C.bg2, padding: "1px 6px", borderRadius: 3 }}>{p.lang}</span>
            <span style={{ fontSize: 10, color: C.ylw, fontFamily: mono }}>${p.cost}</span>
          </div>
        )) : (
          <div style={{ padding: "12px 0", fontSize: 12, color: C.t3, textAlign: "center" }}>暂无项目记录</div>
        )}
      </Sec>

      {/* Danger */}
      <div style={{ background: `${C.red}08`, borderRadius: 10, border: `1px solid ${C.red}20`, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>删除此环境</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>断开连接并移除关联会话和项目记录</div>
          </div>
          <button style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.red}40`, background: "transparent", color: C.red, fontFamily: sans, fontSize: 12, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = `${C.red}15`}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >删除</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──
export default function EnvManagePage() {
  const [tab, setTab] = useState("envs");
  const [selEnv, setSelEnv] = useState("wsl");
  const [selAgent, setSelAgent] = useState("claude");

  const connectedCount = ACP_AGENTS.filter(a => a.status === "connected").length;

  return (
    <div style={{ fontFamily: sans, background: C.bg0, color: C.t1, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`*{margin:0;padding:0;box-sizing:border-box} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}`}</style>

      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.bds}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 14, color: C.t3, cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
          onMouseEnter={e => { e.currentTarget.style.color = C.acc; e.currentTarget.style.background = C.accD; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "transparent"; }}
        >←</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>⚙ 环境与 Agent 管理</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>管理远程环境连接和本地 ACP Agent</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left panel */}
        <div style={{ width: 280, borderRight: `1px solid ${C.bds}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.bds}`, flexShrink: 0 }}>
            {[
              { id: "envs", label: "🖥 环境", sub: `${ENVS.length} 个` },
              { id: "agents", label: "🤖 ACP Agent", sub: `${connectedCount}/${ACP_AGENTS.length}` },
            ].map(t => (
              <div key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, textAlign: "center", padding: "10px 0", fontSize: 12, fontWeight: 550, cursor: "pointer",
                color: tab === t.id ? C.t1 : C.t3,
                borderBottom: tab === t.id ? `2px solid ${C.acc}` : "2px solid transparent",
                background: tab === t.id ? C.bg2 : "transparent",
              }}>
                {t.label}
                <span style={{ marginLeft: 5, fontSize: 10, fontFamily: mono, background: C.bg3, color: C.t3, padding: "0px 5px", borderRadius: 3 }}>{t.sub}</span>
              </div>
            ))}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
            {tab === "envs" && <>
              {ENVS.map(e => {
                const isSel = selEnv === e.id;
                const online = e.status === "online";
                return (
                  <div key={e.id} onClick={() => setSelEnv(e.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 8, cursor: "pointer", marginBottom: 3,
                    background: isSel ? C.accD : "transparent", border: isSel ? `1px solid ${C.acc}40` : "1px solid transparent",
                  }}
                    onMouseEnter={e2 => { if (!isSel) e2.currentTarget.style.background = C.bgH; }}
                    onMouseLeave={e2 => { if (!isSel) e2.currentTarget.style.background = isSel ? C.accD : "transparent"; }}
                  >
                    <span style={{ fontSize: 18 }}>{e.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 550 }}>{e.name}</div>
                      <div style={{ fontSize: 10, color: C.t3, fontFamily: mono }}>{e.host}{e.port ? `:${e.port}` : ""}</div>
                    </div>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: online ? C.grn : C.red, boxShadow: online ? `0 0 6px ${C.grn}` : `0 0 4px ${C.red}` }} />
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, marginTop: 6, border: `1px dashed ${C.bd}`, cursor: "pointer", color: C.t3, fontSize: 12 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.acc; e.currentTarget.style.color = C.acc; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.color = C.t3; }}
              ><span style={{ fontSize: 15, width: 26, textAlign: "center" }}>＋</span>添加新环境</div>
            </>}

            {tab === "agents" && <>
              {ACP_AGENTS.map(a => {
                const reg = AGENT_REGISTRY[a.id];
                const isSel = selAgent === a.id;
                return (
                  <div key={a.id} onClick={() => setSelAgent(a.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 8, cursor: "pointer", marginBottom: 3,
                    background: isSel ? `${reg.color}15` : "transparent", border: isSel ? `1px solid ${reg.color}40` : "1px solid transparent",
                  }}
                    onMouseEnter={e2 => { if (!isSel) e2.currentTarget.style.background = C.bgH; }}
                    onMouseLeave={e2 => { if (!isSel) e2.currentTarget.style.background = isSel ? `${reg.color}15` : "transparent"; }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${reg.color}18`, border: `1px solid ${reg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{reg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 550 }}>{reg.name}</div>
                      {a.status === "connected" && (
                        <div style={{ fontSize: 10, color: C.t3, fontFamily: mono, marginTop: 2 }}>{a.endpoint}</div>
                      )}
                      {a.status === "disconnected" && (
                        <div style={{ fontSize: 10, color: C.ylw, marginTop: 2 }}>已安装，未运行</div>
                      )}
                      {a.status === "not_installed" && (
                        <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>未安装</div>
                      )}
                    </div>
                    <Badge status={a.status} />
                  </div>
                );
              })}

              {/* ACP info */}
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.bg2, border: `1px solid ${C.bds}` }}>
                <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.6 }}>
                  🔌 Agent 在本地运行，通过 ACP 协议与一鱿通信。连接后可在任意环境的会话中使用。
                </div>
              </div>
            </>}
          </div>
        </div>

        {/* Right detail */}
        {tab === "envs" && selEnv && <EnvDetail env={ENVS.find(e => e.id === selEnv)} />}
        {tab === "agents" && selAgent && <AgentDetail agent={ACP_AGENTS.find(a => a.id === selAgent)} />}
      </div>
    </div>
  );
}
