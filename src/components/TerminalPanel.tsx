import { useEffect, useRef } from 'react'
import { Bot, Command, MessageSquareText, Monitor, PlugZap } from 'lucide-react'
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

export default function TerminalPanel({ controller, sessions, activeSessionId }: TerminalPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
  }, [controller])

  const activeSession = sessions.find(session => session.id === activeSessionId)
  const agentMeta = getAgentMeta(activeSession)
  const statusTone = activeSession ? getStatusTone(activeSession.status) : null
  const sessionModeMeta = activeSession ? getSessionModeMeta(activeSession) : null
  const SessionModeIcon = sessionModeMeta?.icon ?? PlugZap

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

      <div className="flex-1 min-h-0 bg-[#08090d]">
        <div
          ref={containerRef}
          className="w-full h-full min-h-0"
          style={{ display: activeSession ? 'block' : 'none' }}
        />
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
