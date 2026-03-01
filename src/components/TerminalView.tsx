import { useEffect, useRef, useState } from 'react'
import { Bot, Command, MessageSquareText, Monitor, PlugZap } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import type { Session } from '../App'
import type { TerminalController } from '../utils/terminalController'
import ChatView from './ChatView'

interface TerminalViewProps {
  controller: TerminalController
  sessions: Session[]
  activeSessionId: string | null
}

const AGENT_META = {
  claude: { label: 'Claude Code', color: '#E8915A' },
  codex: { label: 'Codex', color: '#E5E7EB' },
  gemini: { label: 'Gemini CLI', color: '#60A5FA' },
  opencode: { label: 'OpenCode', color: '#78716C' },
  acp: { label: 'ACP Agent', color: '#4ADE80' },
  openclaw: { label: 'OpenClaw', color: '#EF4444' },
} as const

const C = {
  bg0: '#08090d', bg1: '#0e1015', bg2: '#151820', bg3: '#1b1f2b',
  bds: '#1d2030',
  t1: '#e2e4ed', t3: '#4e5270',
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

const hasProjectContext = (session: Session) => Boolean(session.projectId || session.projectName || session.projectPath)

const getSessionModeMeta = (session: Session) => {
  if (!hasProjectContext(session) && !session.agentId) {
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
      label: session.agentId === 'acp' ? 'ACP Agent' : 'Chat Agent',
      icon: MessageSquareText,
      color: session.agentId === 'acp' ? '#4ADE80' : '#C084FC',
      background: session.agentId === 'acp' ? 'rgba(74, 222, 128, 0.12)' : 'rgba(192, 132, 252, 0.12)',
      border: session.agentId === 'acp' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(192, 132, 252, 0.2)',
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

export default function TerminalView({ controller, sessions, activeSessionId }: TerminalViewProps) {
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
  }, [controller, viewMode])

  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const availableViews = activeSession?.mode === 'chat'
    ? [{ id: 'chat' as const, icon: MessageSquareText, label: '对话' }]
    : [
        { id: 'terminal' as const, icon: Monitor, label: '终端' },
        { id: 'split' as const, icon: Command, label: '分屏' },
        { id: 'chat' as const, icon: MessageSquareText, label: '对话' },
      ]

  useEffect(() => {
    if (!activeSession) {
      setViewMode('terminal')
      return
    }

    setViewMode((current) => {
      if (activeSession.mode === 'chat') {
        return 'chat'
      }

      return current === 'chat' ? 'terminal' : current
    })
  }, [activeSessionId, activeSession?.mode])

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
                {activeSession.projectName || activeSession.name}
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

          <div className="flex gap-[2px] p-[2px] rounded-md shrink-0" style={{ background: C.bg0, border: `1px solid ${C.bds}` }}>
            {availableViews.map((view) => {
              const active = viewMode === view.id
              const Icon = view.icon
              return (
                <button
                  key={view.id}
                  onClick={() => setViewMode(view.id)}
                  className="px-2.5 py-1 rounded-md border-none cursor-pointer text-[11px] font-medium flex items-center gap-[3px] transition-colors"
                  style={{
                    background: active ? C.bg3 : 'transparent',
                    color: active ? C.t1 : C.t3,
                  }}
                >
                  <Icon size={10} />
                  {view.label}
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

      <div className="flex-1 overflow-hidden min-h-0 relative">
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
          <ChatView />
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
