import { X, Circle } from 'lucide-react'
import type { Session } from '../App'

interface TabBarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
}

export default function TabBar({ sessions, activeSessionId, onSelectSession, onCloseSession }: TabBarProps) {
  return (
    <div className="h-10 bg-dark-800 border-b border-dark-600 flex items-center overflow-x-auto">
      {sessions.map(session => (
        <div
          key={session.id}
          onClick={() => onSelectSession(session.id)}
          className={`h-full px-4 flex items-center gap-2 border-r border-dark-600 cursor-pointer min-w-[140px] max-w-[200px] group transition-colors ${
            activeSessionId === session.id
              ? 'bg-dark-700 text-gray-100'
              : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
          }`}
        >
          <Circle
            size={8}
            className={`fill-current ${
              session.status === 'connected'
                ? 'text-green-500'
                : session.status === 'connecting'
                ? 'text-yellow-500'
                : 'text-red-500'
            }`}
          />
          <span className="flex-1 truncate text-sm">{session.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCloseSession(session.id)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-dark-600 transition-opacity"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {sessions.length === 0 && (
        <div className="h-full px-4 flex items-center text-gray-500 text-sm">
          Click + to open a terminal
        </div>
      )}
    </div>
  )
}
