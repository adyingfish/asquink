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

// ── v9 sidebar data: env → project → sessions ──
var SIDEBAR = [
  {
    envId: "wsl", envName: "WSL Ubuntu", envIcon: "🐧", status: "online",
    projects: [
      {
        projId: "web", projName: "web-app", dir: "~/web-app",
        sessions: [
          { id: "s1", name: "fix auth bug", agent: "Claude Code", agentIcon: "🟠", agentColor: C.acc, conn: "terminal", ts: "14:32" },
          { id: "s2", name: "implement caching", agent: "Claude Code", agentIcon: "🟠", agentColor: C.acc, conn: "acp", ts: "16:05" },
          { id: "s3", name: "refactor routes", agent: "Codex CLI", agentIcon: "🟢", agentColor: C.grn, conn: "terminal", ts: "11:20" },
        ],
      },
      {
        projId: "lib", projName: "shared-lib", dir: "~/shared-lib",
        sessions: [
          { id: "s4", name: "add type exports", agent: "Claude Code", agentIcon: "🟠", agentColor: C.acc, conn: "acp", ts: "09:45" },
        ],
      },
    ],
  },
  {
    envId: "dev", envName: "dev-server", envIcon: "☁️", status: "online",
    projects: [
      {
        projId: "api", projName: "api-server", dir: "~/api-server",
        sessions: [
          { id: "s5", name: "migrate to TypeORM", agent: "Codex CLI", agentIcon: "🟢", agentColor: C.grn, conn: "terminal", ts: "15:01" },
          { id: "s6", name: "fix N+1 queries", agent: "Claude Code", agentIcon: "🟠", agentColor: C.acc, conn: "acp", ts: "13:30" },
        ],
      },
    ],
  },
  {
    envId: "gpu", envName: "gpu-node", envIcon: "⚡", status: "online",
    projects: [
      {
        projId: "ml", projName: "ml-train", dir: "~/ml-train",
        sessions: [
          { id: "s7", name: "debug pipeline", agent: "Gemini CLI", agentIcon: "🔵", agentColor: C.blu, conn: "acp", ts: "10:15" },
        ],
      },
    ],
  },
];

// ── Terminal CLI events (PTY parsed) ──
var TERM_EVENTS = [
  { id: "t1", type: "user_input", text: "fix the authentication bug in login.ts", conf: 0.95 },
  { id: "t2", type: "thinking", text: "Reading project structure...", files: ["src/auth/login.ts", "src/auth/session.ts"], conf: 0.7 },
  { id: "t3", type: "agent_text", text: "Found the issue: token validation uses wrong expiry field. The code checks decoded.expiresAt but the JWT library uses decoded.exp.", conf: 0.85 },
  { id: "t4", type: "edit_file", file: "src/auth/login.ts", rm: "if (decoded.expiresAt < Date.now()/1000) {", add: "if (decoded.exp < Date.now()/1000) {", conf: 0.9 },
  { id: "t5", type: "run_cmd", command: "npm test", conf: 0.9 },
  { id: "t6", type: "result", ok: true, summary: "All 23 tests passed", conf: 0.85 },
  { id: "t7", type: "agent_text", text: "Fixed. JWT token was checking the wrong field name for expiration. All tests pass now.", conf: 0.8 },
  { id: "t8", type: "usage", inp: 12847, out: 1203, cost: 0.018, conf: 0.6 },
];

var TERM_LINES = [
  { c: C.t3, t: "Connected to WSL  ~/web-app  Claude Code v1.0.23", s: 10.5 },
  { c: null },
  { c: C.acc, t: " > ", b: true, af: "fix the authentication bug in login.ts", ac: C.ylw, eid: "t1" },
  { c: null },
  { c: C.pur, t: "  * Reading project structure...", eid: "t2" },
  { c: C.t3, t: "    src/auth/login.ts", eid: "t2" },
  { c: C.t3, t: "    src/auth/session.ts", eid: "t2" },
  { c: null },
  { c: C.t1, t: "  Found the issue: token validation uses wrong expiry", eid: "t3" },
  { c: C.t1, t: "  field. decoded.expiresAt should be decoded.exp.", eid: "t3" },
  { c: null },
  { c: C.blu, t: "  [edit] src/auth/login.ts", b: true, eid: "t4" },
  { c: C.red, t: "  - if (decoded.expiresAt < Date.now()/1000) {", eid: "t4" },
  { c: C.grn, t: "  + if (decoded.exp < Date.now()/1000) {", eid: "t4" },
  { c: null },
  { c: C.blu, t: "  [run] npm test", b: true, eid: "t5" },
  { c: C.grn, t: "  OK All 23 tests passed", b: true, eid: "t6" },
  { c: null },
  { c: C.t1, t: "  Fixed. JWT token was checking the wrong field name", eid: "t7" },
  { c: C.t1, t: "  for expiration. All tests pass now.", eid: "t7" },
  { c: null },
  { c: C.t3, t: "  --- 12,847 in | 1,203 out | $0.018 ---", s: 10.5, eid: "t8" },
  { c: null },
  { c: C.acc, t: " > _", b: true },
];

// ── ACP events (structured, all conf 1.0) ──
var ACP_EVENTS = [
  { id: "c1", type: "user_input", text: "implement a Redis caching layer for the API responses", conf: 1.0 },
  { id: "c2", type: "thinking", text: "Analyzing current API architecture...", files: ["src/api/routes.ts", "src/middleware/cache.ts", "package.json"], conf: 1.0 },
  { id: "c3", type: "agent_text", text: "I'll implement a Redis caching layer with TTL-based invalidation. This involves setting up a Redis client, creating cache middleware, and adding cache headers.", conf: 1.0 },
  { id: "c4", type: "edit_file", file: "src/lib/redis.ts", rm: null, add: null, isNew: true, conf: 1.0 },
  { id: "c5", type: "edit_file", file: "src/middleware/cache.ts", rm: "// TODO: implement caching", add: "export const cacheMiddleware = (ttl) => async (req, res, next) => {\n  const cached = await redis.get(req.url);\n  if (cached) return res.json(JSON.parse(cached));\n}", conf: 1.0 },
  { id: "c6", type: "edit_file", file: "src/api/routes.ts", rm: "app.get('/users', getUsers);", add: "app.get('/users', cacheMiddleware(300), getUsers);", conf: 1.0 },
  { id: "c7", type: "run_cmd", command: "npm test", conf: 1.0 },
  { id: "c8", type: "result", ok: true, summary: "All 31 tests passed", conf: 1.0 },
  { id: "c9", type: "run_cmd", command: "npm run bench -- --endpoint /users", conf: 1.0 },
  { id: "c10", type: "result", ok: true, summary: "p50: 12ms (was 89ms), p99: 28ms (was 340ms)", conf: 1.0 },
  { id: "c11", type: "agent_text", text: "Redis caching implemented. p50 latency dropped from 89ms to 12ms. Cache uses 5-minute TTL with auto-invalidation on writes.", conf: 1.0 },
  { id: "c12", type: "usage", inp: 18420, out: 2850, cost: 0.032, conf: 1.0 },
];

// ── Components ──

function ConfTag(props) {
  if (props.conf >= 1.0) return null;
  var color = props.conf >= 0.8 ? C.grn : C.ylw;
  return (
    <span style={{ position: "absolute", top: -6, right: -4, fontSize: 8, padding: "1px 4px", borderRadius: 3, fontWeight: 600, fontFamily: mono, background: color + "20", color: color, border: "1px solid " + color + "30" }}>
      {Math.round(props.conf * 100) + "%"}
    </span>
  );
}

function Bubble(props) {
  var ev = props.ev;
  var isHL = props.hl === ev.id;
  var low = ev.conf < 0.7;
  var base = { borderRadius: 10, transition: "all 0.12s", outline: isHL ? "2px solid " + C.acc + "50" : "2px solid transparent", position: "relative" };
  var h = { onMouseEnter: function() { props.onH(ev.id); }, onMouseLeave: function() { props.onH(null); } };

  if (ev.type === "user_input") return (
    <div {...h} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
      <div style={Object.assign({}, base, { maxWidth: "85%", padding: "9px 13px", borderRadius: "13px 13px 4px 13px", background: isHL ? C.bgH : C.bg3, border: "1px solid " + (isHL ? C.acc : C.bd), fontSize: 12.5, lineHeight: 1.6 })}>
        <ConfTag conf={ev.conf} />{ev.text}
      </div>
    </div>
  );
  if (ev.type === "thinking") return (
    <div {...h} style={{ marginBottom: 10 }}>
      <div style={Object.assign({}, base, { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: C.bg2, border: "1px solid " + C.bds, fontSize: 11.5, color: C.pur })}>
        <ConfTag conf={ev.conf} />{"🔍 " + ev.text}
        {ev.files && <span style={{ color: C.t3, fontSize: 10 }}>{"(" + ev.files.length + " files)"}</span>}
      </div>
    </div>
  );
  if (ev.type === "agent_text") return (
    <div {...h} style={{ marginBottom: 14 }}>
      <div style={Object.assign({}, base, { padding: "8px 12px", background: isHL ? C.acc + "06" : "transparent", fontSize: 12.5, lineHeight: 1.65, borderLeft: low ? "2px dashed " + C.ylw + "40" : "none", paddingLeft: low ? 12 : 8 })}>
        <ConfTag conf={ev.conf} />{ev.text}
      </div>
    </div>
  );
  if (ev.type === "edit_file") return (
    <div {...h} style={{ marginBottom: 10 }}>
      <div style={Object.assign({}, base, { padding: "9px 12px", background: isHL ? C.blu + "10" : C.bg2, border: "1px solid " + (isHL ? C.blu + "40" : C.bds) })}>
        <ConfTag conf={ev.conf} />
        <div style={{ fontSize: 11, fontWeight: 600, color: C.blu, marginBottom: ev.rm || ev.isNew ? 5 : 0 }}>
          {(ev.isNew ? "📄 " : "✏️ ") + ev.file}
        </div>
        {ev.rm && ev.add && (
          <div style={{ fontFamily: mono, fontSize: 11, lineHeight: 1.5 }}>
            <div style={{ color: C.red }}>{"- " + ev.rm}</div>
            <div style={{ color: C.grn }}>{"+ " + ev.add}</div>
          </div>
        )}
        {ev.add && !ev.rm && !ev.isNew && (
          <pre style={{ fontFamily: mono, fontSize: 10.5, color: C.grn, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>{ev.add}</pre>
        )}
        {ev.isNew && !ev.add && (
          <div style={{ fontSize: 10.5, color: C.t3, fontStyle: "italic" }}>{"新文件已创建"}</div>
        )}
        {!ev.rm && !ev.isNew && !ev.add && ev.conf < 1.0 && (
          <div style={{ fontSize: 10.5, color: C.ylw, fontStyle: "italic" }}>{"diff 未解析，查看终端获取完整内容"}</div>
        )}
      </div>
    </div>
  );
  if (ev.type === "run_cmd") return (
    <div {...h} style={{ marginBottom: 10 }}>
      <div style={Object.assign({}, base, { padding: "9px 12px", background: isHL ? C.blu + "10" : C.bg2, border: "1px solid " + (isHL ? C.blu + "40" : C.bds) })}>
        <ConfTag conf={ev.conf} />
        <div style={{ fontSize: 11, fontWeight: 600, color: C.blu }}>{"▶ " + ev.command}</div>
      </div>
    </div>
  );
  if (ev.type === "result") return (
    <div {...h} style={{ marginBottom: 14 }}>
      <div style={Object.assign({}, base, { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", background: ev.ok ? C.grn + "10" : C.red + "10", borderRadius: 7, fontSize: 12, fontWeight: 550, color: ev.ok ? C.grn : C.red })}>
        <ConfTag conf={ev.conf} />{(ev.ok ? "✅ " : "❌ ") + ev.summary}
      </div>
    </div>
  );
  if (ev.type === "usage") return (
    <div {...h} style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
      <div style={Object.assign({}, base, { fontSize: 10, color: C.t3, fontFamily: mono, padding: "3px 10px", background: C.bg2, borderRadius: 5 })}>
        <ConfTag conf={ev.conf} />{"↑" + (ev.inp || 0).toLocaleString() + " ↓" + (ev.out || 0).toLocaleString() + " $" + ev.cost}
      </div>
    </div>
  );
  return null;
}

function TermLine(props) {
  var l = props.line;
  var isHL = l.eid && props.hl === l.eid;
  return (
    <div onMouseEnter={function() { l.eid && props.onH(l.eid); }} onMouseLeave={function() { l.eid && props.onH(null); }}
      style={{
        color: l.c || "transparent", fontWeight: l.b ? 500 : 400, fontSize: l.s || 11.5,
        minHeight: !l.t ? 14 : undefined, whiteSpace: "pre-wrap",
        borderLeft: isHL ? "2px solid " + C.acc : "2px solid transparent",
        paddingLeft: isHL ? 6 : 8, marginLeft: -2,
        background: isHL ? C.acc + "06" : "transparent", borderRadius: 3,
      }}>
      {l.t || ""}{l.af && <span style={{ color: l.ac || C.t1 }}>{l.af}</span>}
    </div>
  );
}

// ── Chat pane ──
function ChatPane(props) {
  var events = props.events;
  var isAcp = props.isAcp;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {props.showHeader && (
        <div style={{ padding: "5px 12px", borderBottom: "1px solid " + C.bds, background: C.bg2, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>{"💬 对话"}</span>
          {isAcp && <span style={{ fontSize: 10, color: C.grn, background: C.grn + "12", padding: "1px 6px", borderRadius: 3, marginLeft: "auto" }}>{"ACP"}</span>}
          {!isAcp && <span style={{ fontSize: 10, color: C.ylw, background: C.ylw + "12", padding: "1px 6px", borderRadius: 3, marginLeft: "auto" }}>{"PTY 解析"}</span>}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {!isAcp && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, background: C.ylw + "08", border: "1px solid " + C.ylw + "20", marginBottom: 14, fontSize: 10.5, color: C.ylw }}>
            {"⚠ 对话内容由终端输出解析生成"}
          </div>
        )}
        {events.map(function(ev) { return <Bubble key={ev.id} ev={ev} hl={props.hl} onH={props.onH} />; })}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid " + C.bds, background: C.bg2, marginTop: 8 }}>
          <span style={{ flex: 1, fontSize: 12, color: C.t3 }}>{"输入指令..."}</span>
          {!isAcp && <span style={{ fontSize: 9, color: C.ylw, background: C.ylw + "12", padding: "2px 6px", borderRadius: 3 }}>{"→ PTY"}</span>}
          <span style={{ fontSize: 12, color: C.t3 }}>{"↵"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Term pane ──
function TermPane(props) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "5px 12px", borderBottom: "1px solid " + C.bds, background: C.bg2, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>{"⌨ 终端"}</span>
        <span style={{ fontSize: 10, color: C.ylw, background: C.ylw + "12", padding: "1px 6px", borderRadius: 3, marginLeft: "auto" }}>{"PTY"}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", fontFamily: mono, fontSize: 11.5, lineHeight: 1.7 }}>
        {TERM_LINES.map(function(l, i) { return <TermLine key={i} line={l} hl={props.hl} onH={props.onH} />; })}
      </div>
    </div>
  );
}

// ── Session content area ──
function SessionContent(props) {
  var session = props.session;
  var isTerm = session.conn === "terminal";
  var [view, setView] = useState(isTerm ? "split" : "chat");
  var [hl, setHL] = useState(null);

  var events = isTerm ? TERM_EVENTS : ACP_EVENTS;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Session header bar */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid " + C.bds, display: "flex", alignItems: "center", gap: 10, background: C.bg1, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: session.agentColor + "20", border: "1px solid " + session.agentColor + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{session.agentIcon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name}</span>
            {isTerm && <span style={{ fontSize: 9, color: C.ylw, background: C.ylw + "12", padding: "1px 6px", borderRadius: 3, fontWeight: 500, flexShrink: 0 }}>{"🖥 终端 CLI"}</span>}
            {!isTerm && <span style={{ fontSize: 9, color: C.grn, background: C.grn + "12", padding: "1px 6px", borderRadius: 3, fontWeight: 500, flexShrink: 0 }}>{"🔌 ACP"}</span>}
          </div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: mono, marginTop: 1 }}>
            {session.agent}
          </div>
        </div>

        {/* View toggle: only for terminal sessions */}
        {isTerm ? (
          <div style={{ display: "flex", gap: 1, padding: 2, borderRadius: 7, background: C.bg0, border: "1px solid " + C.bds, flexShrink: 0 }}>
            {[
              { id: "term", icon: "⌨", label: "终端" },
              { id: "split", icon: "◧", label: "分屏" },
              { id: "chat", icon: "💬", label: "对话" },
            ].map(function(v) {
              var active = view === v.id;
              return (
                <button key={v.id} onClick={function() { setView(v.id); }} style={{
                  padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer",
                  fontFamily: sans, fontSize: 11, fontWeight: 530,
                  background: active ? C.bg3 : "transparent",
                  color: active ? C.t1 : C.t3,
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <span style={{ fontSize: 10 }}>{v.icon}</span>{v.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: C.bg0, border: "1px solid " + C.bds, flexShrink: 0 }}>
            <span style={{ fontSize: 10 }}>{"💬"}</span>
            <span style={{ fontSize: 11, fontWeight: 530, color: C.t2 }}>{"对话"}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {isTerm && view === "term" && <TermPane hl={hl} onH={setHL} />}
        {isTerm && view === "chat" && <ChatPane events={events} hl={hl} onH={setHL} isAcp={false} showHeader={false} />}
        {isTerm && view === "split" && (
          <>
            <TermPane hl={hl} onH={setHL} />
            <div style={{ width: 1, background: C.bds, flexShrink: 0 }} />
            <ChatPane events={events} hl={hl} onH={setHL} isAcp={false} showHeader={true} />
          </>
        )}
        {!isTerm && <ChatPane events={events} hl={hl} onH={setHL} isAcp={true} showHeader={false} />}
      </div>
    </div>
  );
}

// ── Main with v9 sidebar ──
export default function App() {
  var [sel, setSel] = useState("s1");
  var [collapsed, setCollapsed] = useState({});

  // Find selected session
  var selSession = null;
  SIDEBAR.forEach(function(env) {
    env.projects.forEach(function(proj) {
      proj.sessions.forEach(function(s) {
        if (s.id === sel) selSession = s;
      });
    });
  });

  function toggleEnv(id) {
    var next = Object.assign({}, collapsed);
    next[id] = !next[id];
    setCollapsed(next);
  }

  return (
    <div style={{ fontFamily: sans, background: C.bg0, color: C.t1, height: "100vh", display: "flex", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{"*{margin:0;padding:0;box-sizing:border-box} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:" + C.bd + ";border-radius:3px}"}</style>

      {/* ── Sidebar: env → project → session ── */}
      <div style={{ width: 260, borderRight: "1px solid " + C.bds, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid " + C.bds, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, " + C.acc + ", #D46A28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{"🦑"}</div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{"一鱿"}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 14, color: C.t3, cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>{"＋"}</span>
        </div>

        {/* Session tree */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {SIDEBAR.map(function(env) {
            var isCol = collapsed[env.envId];
            var sessionCount = 0;
            env.projects.forEach(function(p) { sessionCount += p.sessions.length; });
            return (
              <div key={env.envId} style={{ marginBottom: 4 }}>
                {/* Env header */}
                <div onClick={function() { toggleEnv(env.envId); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
                  onMouseEnter={function(e) { e.currentTarget.style.background = C.bgH; }}
                  onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 8, color: C.t3, transition: "transform 0.15s", transform: isCol ? "rotate(-90deg)" : "rotate(0deg)" }}>{"▼"}</span>
                  <span style={{ fontSize: 14 }}>{env.envIcon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{env.envName}</span>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: env.status === "online" ? C.grn : C.red }} />
                  <span style={{ fontSize: 9, color: C.t3, fontFamily: mono }}>{sessionCount}</span>
                </div>

                {/* Projects + sessions */}
                {!isCol && env.projects.map(function(proj) {
                  return (
                    <div key={proj.projId} style={{ marginLeft: 14 }}>
                      {/* Project header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px" }}>
                        <span style={{ fontSize: 10, color: C.t3 }}>{"📁"}</span>
                        <span style={{ fontSize: 11, fontWeight: 550, color: C.t2 }}>{proj.projName}</span>
                        <span style={{ fontSize: 9, color: C.t3, fontFamily: mono }}>{proj.dir}</span>
                      </div>

                      {/* Sessions */}
                      {proj.sessions.map(function(s) {
                        var isSel = sel === s.id;
                        var isTerm = s.conn === "terminal";
                        return (
                          <div key={s.id} onClick={function() { setSel(s.id); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 20px",
                              borderRadius: 6, cursor: "pointer", marginBottom: 1,
                              background: isSel ? C.accD : "transparent",
                              border: isSel ? "1px solid " + C.acc + "40" : "1px solid transparent",
                            }}
                            onMouseEnter={function(e) { if (!isSel) e.currentTarget.style.background = C.bgH; }}
                            onMouseLeave={function(e) { if (!isSel) e.currentTarget.style.background = isSel ? C.accD : "transparent"; }}
                          >
                            <span style={{ fontSize: 12 }}>{s.agentIcon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11.5, fontWeight: isSel ? 550 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                            </div>
                            {/* Connection type badge */}
                            <span style={{
                              fontSize: 8, fontWeight: 600, padding: "1px 4px", borderRadius: 3, fontFamily: mono,
                              color: isTerm ? C.ylw : C.grn,
                              background: isTerm ? C.ylw + "15" : C.grn + "15",
                            }}>{isTerm ? "PTY" : "ACP"}</span>
                            <span style={{ fontSize: 9, color: C.t3, fontFamily: mono, flexShrink: 0 }}>{s.ts}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid " + C.bds, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.t3, cursor: "pointer" }}
            onMouseEnter={function(e) { e.currentTarget.style.color = C.acc; }}
            onMouseLeave={function(e) { e.currentTarget.style.color = C.t3; }}
          >{"⚙ 管理"}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.ylw }} />
              <span style={{ fontSize: 9, color: C.t3 }}>{"PTY"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.grn }} />
              <span style={{ fontSize: 9, color: C.t3 }}>{"ACP"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      {selSession ? (
        <SessionContent key={sel} session={selSession} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t3 }}>{"选择一个会话"}</div>
      )}
    </div>
  );
}
