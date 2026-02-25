import { X } from 'lucide-react'
import type { Session } from '../App'

// Agent definitions for color coding
const AGENTS = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A' },
  { id: 'codex', name: 'Codex CLI', short: 'Codex', color: '#4ADE80' },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA' },
  { id: 'openclaw', name: 'OpenClaw', short: 'OClaw', color: '#C084FC' },
]

interface TabBarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
}

export default function TabBar({ sessions, activeSessionId, onSelectSession, onCloseSession }: TabBarProps) {
  const getTabTitle = (session: Session) => {
    // For project-based sessions: <project_name> › <agent_short>
    // For standalone sessions: <agent_name>
    const agent = AGENTS.find(a => a.id === session.agentId)

    if (session.projectId) {
      // Project-based session
      return {
        primary: session.projectId, // Would be project name in future
        secondary: agent?.short || session.name,
        agent
      }
    }

    // Standalone session
    return {
      primary: agent?.short || session.name,
      secondary: null,
      agent
    }
  }

  return (
    <div className="h-9 bg-[#161822] flex items-center border-b border-[#1e2130] overflow-x-auto">
      {sessions.map(session => {
        const { primary, secondary, agent } = getTabTitle(session)
        const isActive = activeSessionId === session.id

        return (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`h-full px-3 flex items-center gap-2 border-r border-[#1e2130] cursor-pointer min-w-[100px] max-w-[180px] group transition-colors ${
              isActive
                ? 'bg-[#0a0b0f] text-white border-b-2 border-b-[#E8915A]'
                : 'bg-transparent text-[#555872] hover:bg-[#161822] hover:text-[#8b8fa7]'
            }`}
          >
            {/* Agent color indicator */}
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: agent?.color || '#555872' }}
            />

            {/* Primary title */}
            <span className="text-xs font-medium truncate">
              {primary}
            </span>

            {/* Secondary (agent short name) for project sessions */}
            {secondary && (
              <>
                <span className="text-[#555872] text-[10px]">›</span>
                <span className="text-xs truncate text-[#8b8fa7]">{secondary}</span>
              </>
            )}

            {/* Environment icon */}
            <span className="text-xs flex-shrink-0">
              {session.type === 'local' ? '💻' : '☁️'}
            </span>

            {/* Standalone session badge */}
            {!session.projectId && (
              <span
                className="text-[8px] px-1 rounded flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(192, 132, 252, 0.1)',
                  color: '#C084FC'
                }}
              >
                💬
              </span>
            )}

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(session.id)
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#232738] transition-opacity flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}

      {sessions.length === 0 && (
        <div className="h-full px-4 flex items-center text-[#555872] text-xs">
          Click + to open a terminal
        </div>
      )}
    </div>
  )
}
