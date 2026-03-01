import { useEffect, useRef, useState } from 'react'
import { Bot, Command, MessageSquareText, Monitor, PlugZap, Search, Edit, Play, CheckCircle, XCircle, FileText } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import type { Session } from '../App'
import type { TerminalController } from './terminalController'

interface TerminalPanelProps {
  controller: TerminalController
  sessions: Session[]
  activeSessionId: string | null
}

const AGENT_META = {
  claude: { label: 'Claude Code', color: '#E8915A' },
  codex: { label: 'Codex', color: '#E5E7EB' },
  gemini: { label: 'Gemini CLI', color: '#60A5FA' },
  opencode: { label: 'OpenCode', color: '#78716C' },
  openclaw: { label: 'OpenClaw', color: '#EF4444' },
} as const

// 颜色常量
const C = {
  bg0: '#08090d', bg1: '#0e1015', bg2: '#151820', bg3: '#1b1f2b', bgH: '#222738',
  bd: '#282d3e', bds: '#1d2030',
  t1: '#e2e4ed', t2: '#8b8fa7', t3: '#4e5270',
  acc: '#E8915A', accD: '#E8915A1e',
  grn: '#4ADE80', red: '#F87171', blu: '#60A5FA', ylw: '#FBBF24', pur: '#C084FC',
}

// 示例对话消息
interface DemoMessage {
  id: string
  type: 'user' | 'thinking' | 'assistant' | 'edit' | 'command' | 'result' | 'usage'
  text?: string
  files?: string[]
  file?: string
  rm?: string
  add?: string
  isNew?: boolean
  command?: string
  ok?: boolean
  summary?: string
}

const DEMO_MESSAGES: DemoMessage[] = [
  { id: '1', type: 'user', text: 'fix the authentication bug in login.ts' },
  { id: '2', type: 'thinking', text: 'Reading project structure...', files: ['src/auth/login.ts', 'src/auth/session.ts'] },
  { id: '3', type: 'assistant', text: 'Found the issue: token validation uses wrong expiry field. The code checks decoded.expiresAt but the JWT library uses decoded.exp.' },
  { id: '4', type: 'edit', file: 'src/auth/login.ts', rm: 'if (decoded.expiresAt < Date.now()/1000) {', add: 'if (decoded.exp < Date.now()/1000) {' },
  { id: '5', type: 'command', command: 'npm test' },
  { id: '6', type: 'result', ok: true, summary: 'All 23 tests passed' },
  { id: '7', type: 'assistant', text: 'Fixed. JWT token was checking the wrong field name for expiration. All tests pass now.' },
  { id: '8', type: 'usage', text: '↑12,847 ↓1,203 $0.018' },
]

// 消息组件
function DemoChatMessage({ message }: { message: DemoMessage }) {
  switch (message.type) {
    case 'user':
      return (
        <div className="flex justify-end mb-[14px]">
          <div className="max-w-[85%] px-3.5 py-2.5 rounded-[13px_13px_4px_13px] text-[12.5px] leading-relaxed"
               style={{ background: C.bg3, border: `1px solid ${C.bd}`, color: C.t1 }}>
            {message.text}
          </div>
        </div>
      )
    case 'thinking':
      return (
        <div className="mb-2.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px]"
               style={{ background: C.bg2, border: `1px solid ${C.bds}`, color: C.pur }}>
            <Search size={12} />
            {message.text}
            {message.files && (
              <span className="text-[10px]" style={{ color: C.t3 }}>
                ({message.files.length} files)
              </span>
            )}
          </div>
        </div>
      )
    case 'assistant':
      return (
        <div className="mb-[14px] py-2 px-3 text-[12.5px] leading-[1.65]" style={{ color: C.t1 }}>
          {message.text}
        </div>
      )
    case 'edit':
      return (
        <div className="mb-2.5 p-2.5 rounded-md" style={{ background: C.bg2, border: `1px solid ${C.bds}` }}>
          <div className="flex items-center gap-2 mb-1.5">
            {message.isNew ? <FileText size={12} style={{ color: C.blu }} /> : <Edit size={12} style={{ color: C.blu }} />}
            <span className="text-[11px] font-semibold" style={{ color: C.blu }}>
              {message.isNew ? '📄 ' : '✏️ '}{message.file}
            </span>
          </div>
          {message.rm && message.add && (
            <div className="font-mono text-[11px] leading-relaxed">
              <div style={{ color: C.red }}>- {message.rm}</div>
              <div style={{ color: C.grn }}>+ {message.add}</div>
            </div>
          )}
        </div>
      )
    case 'command':
      return (
        <div className="mb-2.5 p-2.5 rounded-md" style={{ background: C.bg2, border: `1px solid ${C.bds}` }}>
          <div className="flex items-center gap-1.5">
            <Play size={10} style={{ color: C.blu }} />
            <span className="text-[11px] font-semibold" style={{ color: C.blu }}>
              {message.command}
            </span>
          </div>
        </div>
      )
    case 'result':
      return (
        <div className="mb-[14px] flex justify-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold"
               style={{
                 background: message.ok ? `${C.grn}10` : `${C.red}10`,
                 color: message.ok ? C.grn : C.red,
               }}>
            {message.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {message.summary}
          </div>
        </div>
      )
    case 'usage':
      return (
        <div className="mb-2.5 flex justify-center">
          <div className="font-mono text-[10px] px-2.5 py-[3px] rounded-md"
               style={{ background: C.bg2, color: C.t3 }}>
            {message.text}
          </div>
        </div>
      )
    default:
      return null
  }
}

// 对话面板组件
function ChatPanel() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* 标题栏 */}
      <div className="px-3 py-1.5 border-b shrink-0 flex items-center gap-1.5"
           style={{ background: C.bg2, borderColor: C.bds }}>
        <MessageSquareText size={12} style={{ color: C.t2 }} />
        <span className="text-[11px] font-semibold" style={{ color: C.t2 }}>
          对话
        </span>
        <span className="h-5 px-2 rounded-md border flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] ml-auto"
              style={{
                color: C.grn,
                background: `${C.grn}12`,
                borderColor: `${C.grn}20`,
              }}>
          示例
        </span>
      </div>

      {/* 消息内容区域 - 可滚动 */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md mb-4"
             style={{ background: `${C.pur}08`, border: `1px solid ${C.pur}20` }}>
          <span style={{ fontSize: '10.5px', color: C.pur }}>
            💬 此为示例对话界面，实际对话功能开发中
          </span>
        </div>

        {DEMO_MESSAGES.map((msg) => (
          <DemoChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      {/* 输入框 - 固定在底部 */}
      <div className="shrink-0 px-3 py-2.5 border-t"
           style={{ background: C.bg0, borderColor: C.bds }}>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border"
             style={{ background: C.bg2, borderColor: C.bds }}>
          <span className="flex-1 text-[12px]" style={{ color: C.t3 }}>
            输入指令...
          </span>
          <span className="text-[9px] px-1.5 py-[2px] rounded-md font-semibold tracking-wide"
                style={{ color: C.blu, background: `${C.blu}15`, border: `1px solid ${C.blu}25` }}>
            示例
          </span>
          <span className="text-[12px]" style={{ color: C.t3 }}>
            ↵
          </span>
        </div>
      </div>
    </div>
  )
}

const getAgentMeta = (session: Session | undefined) => {
  if (!session?.agentId) {
    return { label: 'Terminal', color: '#8b8fa7' }
  }

  return AGENT_META[session.agentId as keyof typeof AGENT_META] ?? {
    label: session.agentId,
    color: '#8b8fa7',
  }
}

const getStatusTone = (status: Session['status']) => {
  if (status === 'connected') {
    return {
      label: 'Connected',
      color: '#4ADE80',
      background: 'rgba(74, 222, 128, 0.12)',
      border: 'rgba(74, 222, 128, 0.2)',
    }
  }

  if (status === 'connecting') {
    return {
      label: 'Connecting',
      color: '#FBBF24',
      background: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(251, 191, 36, 0.2)',
    }
  }

  return {
    label: 'Disconnected',
    color: '#F87171',
    background: 'rgba(248, 113, 113, 0.12)',
    border: 'rgba(248, 113, 113, 0.2)',
  }
}

const getSessionModeMeta = (session: Session) => {
  if (!session.projectId && !session.agentId) {
    return {
      label: 'PTY Terminal',
      icon: Monitor,
      color: '#FBBF24',
      background: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(251, 191, 36, 0.2)',
    }
  }

  if (session.mode === 'chat') {
    return {
      label: 'Chat Agent',
      icon: MessageSquareText,
      color: '#C084FC',
      background: 'rgba(192, 132, 252, 0.12)',
      border: 'rgba(192, 132, 252, 0.2)',
    }
  }

  return {
    label: 'Agent Terminal',
    icon: Command,
    color: '#60A5FA',
    background: 'rgba(96, 165, 250, 0.12)',
    border: 'rgba(96, 165, 250, 0.2)',
  }
}

const PANE_TRANSITION = '320ms cubic-bezier(0.22, 1, 0.36, 1)'

const getTerminalPaneStyle = (viewMode: 'terminal' | 'split' | 'chat') => {
  if (viewMode === 'chat') {
    return {
      left: '0%',
      width: '100%',
      transform: 'translateX(-100%)',
      opacity: 0,
      pointerEvents: 'none' as const,
      zIndex: 1,
    }
  }

  if (viewMode === 'split') {
    return {
      left: '0%',
      width: '50%',
      transform: 'translateX(0)',
      opacity: 1,
      pointerEvents: 'auto' as const,
      zIndex: 2,
    }
  }

  return {
    left: '0%',
    width: '100%',
    transform: 'translateX(0)',
    opacity: 1,
    pointerEvents: 'auto' as const,
    zIndex: 2,
  }
}

const getChatPaneStyle = (viewMode: 'terminal' | 'split' | 'chat') => {
  if (viewMode === 'terminal') {
    return {
      left: '0%',
      width: '100%',
      transform: 'translateX(100%)',
      opacity: 0,
      pointerEvents: 'none' as const,
      zIndex: 1,
    }
  }

  if (viewMode === 'split') {
    return {
      left: '50%',
      width: '50%',
      transform: 'translateX(0)',
      opacity: 1,
      pointerEvents: 'auto' as const,
      zIndex: 2,
    }
  }

  return {
    left: '0%',
    width: '100%',
    transform: 'translateX(0)',
    opacity: 1,
    pointerEvents: 'auto' as const,
    zIndex: 2,
  }
}

export default function TerminalPanel({ controller, sessions, activeSessionId }: TerminalPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<'terminal' | 'split' | 'chat'>('terminal')

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    controller.mount(containerRef.current)
    controller.setContext(sessions, activeSessionId)
    controller.scheduleResize()
  }, [controller, sessions, activeSessionId])

  useEffect(() => {
    if (!panelRef.current || !containerRef.current) {
      return
    }

    const handleResize = () => {
      controller.scheduleResize()
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(panelRef.current)
    observer.observe(containerRef.current)
    handleResize()

    return () => {
      observer.disconnect()
    }
  }, [controller, viewMode]) // 添加 viewMode 依赖，切换时触发 resize

  const activeSession = sessions.find(session => session.id === activeSessionId)
  const agentMeta = getAgentMeta(activeSession)
  const statusTone = activeSession ? getStatusTone(activeSession.status) : null
  const sessionModeMeta = activeSession ? getSessionModeMeta(activeSession) : null
  const SessionModeIcon = sessionModeMeta?.icon ?? PlugZap
  const terminalPaneStyle = getTerminalPaneStyle(viewMode)
  const chatPaneStyle = getChatPaneStyle(viewMode)

  return (
    <div ref={panelRef} className="flex-1 bg-[#08090d] relative overflow-hidden flex flex-col min-h-0">
      {activeSession && statusTone && sessionModeMeta && (
        <div className="px-4 py-3 border-b border-[#1d2030] bg-[#0e1015] flex items-center gap-3 shrink-0">
          <div
            className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
            style={{
              background: `${agentMeta.color}1c`,
              borderColor: `${agentMeta.color}30`,
              color: agentMeta.color,
            }}
          >
            <Bot size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-[#f5f7fb] truncate">
                {activeSession.projectId || activeSession.name}
              </span>
              <span
                className="h-5 px-2 rounded-md border flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] flex-shrink-0"
                style={{
                  color: sessionModeMeta.color,
                  background: sessionModeMeta.background,
                  borderColor: sessionModeMeta.border,
                }}
              >
                <SessionModeIcon size={10} />
                {sessionModeMeta.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-[#6f748f] min-w-0">
              <span className="font-mono truncate">{agentMeta.label}</span>
              {activeSession.projectPath && (
                <>
                  <span className="text-[#3f435a]">/</span>
                  <span className="font-mono truncate">{activeSession.projectPath}</span>
                </>
              )}
            </div>
          </div>

          {/* 视图切换按钮 */}
          <div className="flex gap-[2px] p-[2px] rounded-md shrink-0"
               style={{ background: C.bg0, border: `1px solid ${C.bds}` }}>
            {[
              { id: 'terminal' as const, icon: Monitor, label: '终端' },
              { id: 'split' as const, icon: Command, label: '分屏' },
              { id: 'chat' as const, icon: MessageSquareText, label: '对话' },
            ].map((v) => {
              const active = viewMode === v.id
              const Icon = v.icon
              return (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className="px-2.5 py-1 rounded-md border-none cursor-pointer text-[11px] font-medium flex items-center gap-[3px] transition-colors"
                  style={{
                    background: active ? C.bg3 : 'transparent',
                    color: active ? C.t1 : C.t3,
                  }}
                >
                  <Icon size={10} />
                  {v.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="h-6 px-2.5 rounded-md border flex items-center gap-2 text-[10px] font-semibold"
              style={{
                color: statusTone.color,
                background: statusTone.background,
                borderColor: statusTone.border,
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${activeSession.status === 'connecting' ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: statusTone.color }}
              />
              {statusTone.label}
            </span>
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {/* 终端面板 */}
        <div
          className="absolute top-0 bottom-0 min-h-0 overflow-hidden"
          style={{
            background: C.bg0,
            display: 'flex',
            flexDirection: 'column',
            transition: `left ${PANE_TRANSITION}, width ${PANE_TRANSITION}, transform ${PANE_TRANSITION}, opacity 220ms ease`,
            willChange: 'left, width, transform, opacity',
            ...terminalPaneStyle,
          }}
        >
          <div
            ref={containerRef}
            className="w-full h-full min-h-0"
            style={{ display: activeSession ? 'block' : 'none' }}
          />
        </div>

        {/* 分隔线 */}
        <div
          className="absolute top-0 bottom-0 w-[1px] shrink-0"
          style={{
            background: C.bds,
            left: '50%',
            opacity: viewMode === 'split' ? 1 : 0,
            transform: 'translateX(-50%)',
            transition: `opacity ${PANE_TRANSITION}`,
            visibility: viewMode === 'split' ? 'visible' : 'hidden',
          }}
        />

        {/* 对话面板 */}
        <div
          className="absolute top-0 bottom-0 min-h-0 overflow-hidden"
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: C.bg0,
            transition: `left ${PANE_TRANSITION}, width ${PANE_TRANSITION}, transform ${PANE_TRANSITION}, opacity 220ms ease`,
            willChange: 'left, width, transform, opacity',
            ...chatPaneStyle,
          }}
        >
          <ChatPanel />
        </div>
      </div>

      {!activeSession && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#08090d]">
          <div className="text-center max-w-sm px-6">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl border border-[#282d3e] bg-[#151820] flex items-center justify-center text-[#8b8fa7]">
              <Monitor size={24} />
            </div>
            <div className="text-[15px] font-medium text-[#e2e4ed]">No active session</div>
            <div className="text-[12px] mt-2 text-[#6f748f]">
              Start a new terminal or select an existing session from the sidebar.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
