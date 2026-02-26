import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TerminalPanel from './components/TerminalPanel'

export interface Session {
  id: string
  name: string
  type: 'local' | 'ssh'
  envId?: string          // Associated environment ID
  projectId?: string      // Project name if project-based session
  projectPath?: string    // Project directory path
  agentId?: string        // Associated Agent
  status: 'connecting' | 'connected' | 'disconnected'
  mode: 'terminal' | 'chat'  // View mode
  statusText?: string     // Status description (e.g., "运行中", "对话中")
  lastMsg?: string        // Last message or task description
}

export interface Env {
  id: string
  name: string
  type: 'local' | 'ssh'
  host?: string
  port?: number
  username?: string
  auth_type?: string
  icon?: string
  status: 'online' | 'offline'
}

export interface Project {
  id: string
  name: string
  path: string
  env_id: string
  lang?: string
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const addSession = (session: Session) => {
    setSessions([...sessions, session])
    setActiveSessionId(session.id)
  }

  const updateSessionStatus = (id: string, status: Session['status']) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, status } : s
    ))
  }

  const closeSession = async (id: string) => {
    const session = sessions.find(s => s.id === id)
    if (session) {
      try {
        await invoke('close_session', {
          sessionId: id,
          sessionType: session.type,
        })
      } catch (error) {
        console.error('Failed to close session:', error)
      }
    }

    const newSessions = sessions.filter(s => s.id !== id)
    setSessions(newSessions)
    if (activeSessionId === id) {
      setActiveSessionId(newSessions.length > 0 ? newSessions[0].id : null)
    }
  }

  return (
    <div className="h-screen w-screen flex bg-dark-900 text-gray-200 overflow-hidden">
      <Sidebar
        onAddSession={addSession}
        onSessionStatusChange={updateSessionStatus}
        onSelectSession={setActiveSessionId}
        activeSessionId={activeSessionId}
        sessions={sessions}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onCloseSession={closeSession}
        />
        <TerminalPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionStatusChange={updateSessionStatus}
        />
      </div>
    </div>
  )
}

export default App
