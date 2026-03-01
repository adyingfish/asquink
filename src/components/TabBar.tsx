import { Command, MessageSquareText, Monitor, X } from 'lucide-react'
import type { Session } from '../App'

const AGENTS = [
  { id: 'claude', short: 'Claude', color: '#E8915A' },
  { id: 'codex', short: 'Codex', color: '#4ADE80' },
  { id: 'gemini', short: 'Gemini', color: '#60A5FA' },
  { id: 'openclaw', short: 'OClaw', color: '#C084FC' },
]

interface TabBarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
}

const hasProjectContext = (session: Session) => Boolean(session.projectId || session.projectName || session.projectPath)

const isPureTerminalSession = (session: Session) => !hasProjectContext(session) && !session.agentId

const getSessionTypeLabel = (session: Session) => {
  if (isPureTerminalSession(session)) return 'PTY'
  if (session.mode === 'chat') return 'CHAT'
  return 'AGENT'
}

const getSessionTypeIcon = (session: Session) => {
  if (isPureTerminalSession(session)) return Monitor
  if (session.mode === 'chat') return MessageSquareText
  return Command
}

const getSessionTypeTint = (session: Session) => {
  if (isPureTerminalSession(session)) {
    return {
      color: '#FBBF24',
      background: 'rgba(251, 191, 36, 0.14)',
      border: 'rgba(251, 191, 36, 0.2)',
    }
  }

  if (session.mode === 'chat') {
    return {
      color: '#C084FC',
      background: 'rgba(192, 132, 252, 0.14)',
      border: 'rgba(192, 132, 252, 0.2)',
    }
  }

  return {
    color: '#60A5FA',
    background: 'rgba(96, 165, 250, 0.14)',
    border: 'rgba(96, 165, 250, 0.2)',
  }
}

export default function TabBar({ sessions, activeSessionId, onSelectSession, onCloseSession }: TabBarProps) {
  const getTabTitle = (session: Session) => {
    const agent = AGENTS.find(item => item.id === session.agentId)

    if (hasProjectContext(session)) {
      return {
        primary: session.projectName || session.name,
        secondary: agent?.short || session.name,
        agent,
      }
    }

    return {
      primary: agent?.short || session.name,
      secondary: null,
      agent,
    }
  }

  const visibleSessions = sessions.filter(session => session.status !== 'disconnected')

  return (
    <div className="h-12 bg-[#0e1015] border-b border-[#1d2030] px-3 flex items-center gap-2 overflow-x-auto">
      {visibleSessions.map(session => {
        const { primary, secondary, agent } = getTabTitle(session)
        const isActive = activeSessionId === session.id
        const SessionTypeIcon = getSessionTypeIcon(session)
        const sessionTypeTint = getSessionTypeTint(session)

        return (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`h-[34px] px-3 rounded-lg flex items-center gap-2 cursor-pointer min-w-[148px] max-w-[240px] group transition-all border ${
              isActive
                ? 'bg-[#151820] text-[#f5f7fb] border-[#282d3e] shadow-[0_0_0_1px_rgba(232,145,90,0.14)]'
                : 'bg-transparent text-[#555872] border-transparent hover:bg-[#151820] hover:border-[#1d2030] hover:text-[#8b8fa7]'
            }`}
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center border flex-shrink-0"
              style={{
                background: `${agent?.color || '#4e5270'}18`,
                borderColor: `${agent?.color || '#4e5270'}30`,
                color: agent?.color || '#8b8fa7',
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: agent?.color || '#555872' }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate">{primary}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#6f748f] min-w-0">
                {secondary && <span className="truncate">{secondary}</span>}
                {secondary && <span className="text-[#3f435a]">/</span>}
                <span className="truncate">{session.name}</span>
              </div>
            </div>

            <span
              className="h-5 px-1.5 rounded-md border flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] flex-shrink-0"
              style={{
                color: sessionTypeTint.color,
                background: sessionTypeTint.background,
                borderColor: sessionTypeTint.border,
              }}
            >
              <SessionTypeIcon size={10} />
              {getSessionTypeLabel(session)}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(session.id)
              }}
              className={`p-1 rounded-md transition-all flex-shrink-0 ${
                isActive
                  ? 'opacity-100 text-[#8b8fa7] hover:bg-[#232738] hover:text-[#f5f7fb]'
                  : 'opacity-0 group-hover:opacity-100 text-[#555872] hover:bg-[#232738] hover:text-[#f5f7fb]'
              }`}
              aria-label="Close session"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}

      {visibleSessions.length === 0 && (
        <div className="h-full px-4 flex items-center text-[#555872] text-xs">
          Create a session from the sidebar
        </div>
      )}
    </div>
  )
}
