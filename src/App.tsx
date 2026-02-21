import { useState } from 'react'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TerminalPanel from './components/TerminalPanel'

export interface Session {
  id: string
  name: string
  type: 'local' | 'ssh' | 'wsl'
  status: 'connecting' | 'connected' | 'disconnected'
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const addSession = (session: Session) => {
    setSessions([...sessions, session])
    setActiveSessionId(session.id)
  }

  const closeSession = (id: string) => {
    const newSessions = sessions.filter(s => s.id !== id)
    setSessions(newSessions)
    if (activeSessionId === id) {
      setActiveSessionId(newSessions.length > 0 ? newSessions[0].id : null)
    }
  }

  return (
    <div className="h-screen w-screen flex bg-dark-900 text-gray-200 overflow-hidden">
      <Sidebar onAddSession={addSession} />
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
        />
      </div>
    </div>
  )
}

export default App
