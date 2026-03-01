import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TerminalView from './components/TerminalView'
import EnvManagePage from './components/EnvManagePage'
import { getAgentSessionMode, shouldAutoLaunchAgent } from './agents'
import { TerminalController } from './utils/terminalController'

export interface AgentInfo {
  id: string
  name: string
  executable: string
  installed: boolean
  version?: string | null
}

export interface Session {
  id: string
  name: string
  type: 'local' | 'ssh' | 'wsl'
  envId?: string          // Associated environment ID
  projectId?: string      // Associated project ID
  projectName?: string    // Project display name
  projectPath?: string    // Project directory path
  agentId?: string        // Associated Agent
  status: 'connecting' | 'connected' | 'disconnected'
  mode: 'terminal' | 'chat'  // View mode
  statusText?: string     // Status description (e.g., "运行中", "对话中")
  lastMsg?: string        // Last message or task description
  startedAt?: string      // Session start time
  endedAt?: string        // Session end time
  isReconnect?: boolean   // Whether this is a historical session to reconnect
  agents?: AgentInfo[]    // Detected agents for this session
}

// Session record from database
export interface SessionRecord {
  id: string
  name: string | null
  env_id: string | null
  env_type: string
  agent_id: string | null
  project_id: string | null
  project_name: string | null
  project_path: string | null
  working_dir: string | null
  started_at: string | null
  ended_at: string | null
}

export interface Env {
  id: string
  name: string
  type: 'local' | 'ssh' | 'wsl'
  host?: string
  port?: number
  username?: string
  auth_type?: string
  icon?: string
  status: 'online' | 'offline'
  detail?: string
  wsl_distro?: string
  wsl_user?: string
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
  const [isLoading, setIsLoading] = useState(true)
  const [showEnvManage, setShowEnvManage] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const terminalControllerRef = useRef<TerminalController | null>(null)

  if (!terminalControllerRef.current) {
    terminalControllerRef.current = new TerminalController()
  }

  // Load historical sessions on app start
  useEffect(() => {
    loadHistoricalSessions()
  }, [])

  useEffect(() => {
    return () => {
      terminalControllerRef.current?.dispose()
    }
  }, [])

  const loadHistoricalSessions = async () => {
    try {
      const records = await invoke<SessionRecord[]>('list_sessions')
      const historicalSessions: Session[] = records.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        type: r.env_type as 'local' | 'ssh' | 'wsl',
        envId: r.env_id || undefined,
        agentId: r.agent_id || undefined,
        projectId: r.project_id || undefined,
        projectName: r.project_name || undefined,
        projectPath: r.project_path || undefined,
        status: 'disconnected',
        mode: getAgentSessionMode(r.agent_id),
        startedAt: r.started_at || undefined,
        endedAt: r.ended_at || undefined,
        isReconnect: true,
      }))
      setSessions(historicalSessions)
    } catch (error) {
      console.error('Failed to load historical sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addSession = (session: Session) => {
    // Remove any existing session with the same ID (from historical)
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== session.id)
      return [...filtered, session]
    })
    setActiveSessionId(session.id)
  }

  const scanAgentsForSession = async (sessionId: string) => {
    try {
      const agents = await invoke<AgentInfo[]>('scan_agents')
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, agents } : s
      ))
    } catch (error) {
      console.error('Failed to scan agents:', error)
    }
  }

  const updateSessionStatus = (id: string, status: Session['status']) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, status } : s
    ))
    // Scan agents when session connects
    if (status === 'connected') {
      scanAgentsForSession(id)
    }
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

    // Update status to disconnected instead of removing
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'disconnected' as const, isReconnect: true } : s
    ))

    if (activeSessionId === id) {
      const connectedSessions = sessions.filter(s => s.id !== id && s.status === 'connected')
      setActiveSessionId(connectedSessions.length > 0 ? connectedSessions[0].id : null)
    }
  }

  const deleteSession = async (id: string) => {
    try {
      await invoke('delete_session_record', { sessionId: id })
      setSessions(prev => prev.filter(s => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(sessions.length > 1 ? sessions.find(s => s.id !== id)?.id || null : null)
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  // Reconnect to a disconnected session
  const reconnectSession = async (oldSession: Session) => {
    // Update status to connecting
    setSessions(prev => prev.map(s =>
      s.id === oldSession.id ? { ...s, status: 'connecting' as const, isReconnect: false } : s
    ))
    setActiveSessionId(oldSession.id)

    try {
      const { cols, rows } = terminalControllerRef.current?.getPreferredPtySize() ?? { cols: 80, rows: 24 }

      // Reopen session in database
      await invoke('reopen_session', { sessionId: oldSession.id })

      // Create PTY/SSH/WSL connection with existing ID
      if (oldSession.type === 'local') {
        await invoke('create_local_session', {
          sessionId: oldSession.id,
          shell: null,
          cols,
          rows,
          workingDir: oldSession.projectPath,
          sessionInfo: null // Don't create new DB record
        })
      } else if (oldSession.type === 'wsl') {
        await invoke('create_wsl_session', {
          sessionId: oldSession.id,
          envId: oldSession.envId,
          cols,
          rows,
          workingDir: oldSession.projectPath,
          sessionInfo: null
        })
      } else {
        // SSH session
        const envs = await invoke<{id: string, auth_type?: string}[]>('list_envs')
        const env = envs.find(e => e.id === oldSession.envId)

        if (env?.auth_type === 'password') {
          // Need password - this case needs special handling
          throw new Error('SSH with password requires re-authentication')
        }

        await invoke('create_ssh_session', {
          sessionId: oldSession.id,
          cols,
          rows,
          req: {
            serverId: oldSession.envId,
            password: null,
          },
          sessionInfo: null
        })
      }

      setSessions(prev => prev.map(s =>
        s.id === oldSession.id ? { ...s, status: 'connected' as const } : s
      ))

      // Auto-launch agent if session has an agent
      if (shouldAutoLaunchAgent(oldSession.agentId)) {
        setTimeout(async () => {
          try {
            await invoke('launch_agent', {
              sessionId: oldSession.id,
              sessionType: oldSession.type,
              agent: oldSession.agentId,
            })
          } catch (err) {
            console.error('Failed to launch agent on reconnect:', err)
          }
        }, 500)
      }
    } catch (error) {
      console.error('Failed to reconnect session:', error)
      setSessions(prev => prev.map(s =>
        s.id === oldSession.id ? { ...s, status: 'disconnected' as const, isReconnect: true } : s
      ))
    }
  }

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id)
    setShowEnvManage(false)
  }

  const handleReconnectSession = (session: Session) => {
    reconnectSession(session)
    setShowEnvManage(false)
  }

  const getPreferredPtySize = () =>
    terminalControllerRef.current?.getPreferredPtySize() ?? { cols: 80, rows: 24 }

  return (
    <div className="h-screen w-screen flex bg-dark-900 text-gray-200 overflow-hidden">
      <Sidebar
        onAddSession={addSession}
        onSessionStatusChange={updateSessionStatus}
        onSelectSession={handleSelectSession}
        activeSessionId={activeSessionId}
        sessions={sessions}
        onDeleteSession={deleteSession}
        onReconnectSession={handleReconnectSession}
        isLoading={isLoading}
        onOpenEnvManage={() => setShowEnvManage(true)}
        refreshKey={refreshKey}
        getPreferredPtySize={getPreferredPtySize}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className={showEnvManage ? 'hidden' : 'flex flex-1 flex-col min-w-0 min-h-0'}>
          <TabBar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onCloseSession={closeSession}
          />
          <TerminalView
            controller={terminalControllerRef.current}
            sessions={sessions}
            activeSessionId={activeSessionId}
          />
        </div>
        <div className={showEnvManage ? 'flex flex-1 min-w-0 min-h-0' : 'hidden'}>
          <EnvManagePage
            onBack={() => setShowEnvManage(false)}
            onEnvChange={() => setRefreshKey(k => k + 1)}
          />
        </div>
      </div>
    </div>
  )
}

export default App
