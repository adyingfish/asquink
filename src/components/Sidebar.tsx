import { useState, useEffect } from 'react'
import { Monitor, Server, Plus, Settings, Terminal, Play, AlertCircle, CheckCircle } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import SettingsModal from './SettingsModal'

interface SidebarProps {
  onAddSession: (session: { id: string; name: string; type: 'local' | 'ssh' | 'wsl'; status: 'connecting' | 'connected' | 'disconnected' }) => void
  onSessionStatusChange?: (id: string, status: 'connecting' | 'connected' | 'disconnected') => void
  activeSessionId: string | null
  sessions: Array<{ id: string; name: string; type: 'local' | 'ssh' | 'wsl'; status: 'connecting' | 'connected' | 'disconnected' }>
}

interface ServerConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_type: string
}

interface AgentStatus {
  installed: boolean
  version: string | null
}

export default function Sidebar({ onAddSession, onSessionStatusChange, activeSessionId, sessions }: SidebarProps) {
  const [activeSection, setActiveSection] = useState<'environments' | 'agents'>('environments')
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [password, setPassword] = useState('')
  const [claudeStatus, setClaudeStatus] = useState<AgentStatus>({ installed: false, version: null })
  const [hasApiKey, setHasApiKey] = useState(false)
  const [error, setError] = useState('')

  // Load servers and check agent status
  useEffect(() => {
    loadServers()
    checkClaudeStatus()
    checkApiKey()
  }, [])

  const loadServers = async () => {
    try {
      const serverList = await invoke<ServerConfig[]>('list_servers')
      setServers(serverList)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }

  const checkClaudeStatus = async () => {
    try {
      const status = await invoke<AgentStatus>('check_agent_installed', { agent: 'claude' })
      setClaudeStatus(status)
    } catch (error) {
      console.error('Failed to check Claude status:', error)
    }
  }

  const checkApiKey = async () => {
    try {
      const key = await invoke<string | null>('get_api_key')
      setHasApiKey(!!key)
    } catch (error) {
      console.error('Failed to check API key:', error)
    }
  }

  const createLocalSession = async () => {
    const id = `local-${Date.now()}`
    onAddSession({
      id,
      name: 'Local Terminal',
      type: 'local',
      status: 'connecting'
    })

    try {
      await invoke('create_local_session', { sessionId: id, shell: null })
      onSessionStatusChange?.(id, 'connected')
    } catch (error) {
      console.error('Failed to create local session:', error)
      onSessionStatusChange?.(id, 'disconnected')
      setError('Failed to create local session')
    }
  }

  const createSshSession = async (server: ServerConfig) => {
    if (server.auth_type === 'password') {
      setShowPasswordPrompt(server.id)
      return
    }
    
    await connectSsh(server.id, null, server.name)
  }

  const connectSsh = async (serverId: string, pwd: string | null, serverName: string) => {
    const sessionId = `ssh-${Date.now()}`
    onAddSession({
      id: sessionId,
      name: serverName,
      type: 'ssh',
      status: 'connecting'
    })

    try {
      await invoke('create_ssh_session', {
        sessionId,
        req: {
          server_id: serverId,
          password: pwd,
        }
      })
      onSessionStatusChange?.(sessionId, 'connected')
      setShowPasswordPrompt(null)
      setPassword('')
    } catch (error: any) {
      console.error('Failed to create SSH session:', error)
      onSessionStatusChange?.(sessionId, 'disconnected')
      setError(`SSH connection failed: ${error}`)
    }
  }

  const launchClaude = async () => {
    if (!activeSessionId) {
      setError('Please connect to a server first')
      return
    }

    if (!hasApiKey) {
      setError('Please configure API key in Settings')
      setShowSettings(true)
      return
    }

    const activeSession = sessions.find(s => s.id === activeSessionId)
    if (!activeSession) {
      setError('No active session')
      return
    }

    if (activeSession.status !== 'connected') {
      setError('Session not connected yet')
      return
    }

    try {
      await invoke('launch_agent', {
        sessionId: activeSessionId,
        agent: 'claude',
        workingDir: null
      })
    } catch (error: any) {
      console.error('Failed to launch Claude:', error)
      setError(`Failed to launch: ${error}`)
    }
  }

  return (
    <div className="w-56 bg-dark-800 border-r border-dark-600 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-dark-600">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">A</span>
          </div>
          <span className="font-semibold text-lg">AgentHub</span>
        </div>
        
        <div className="flex gap-1">
          <button
            onClick={() => setActiveSection('environments')}
            className={`flex-1 py-1.5 px-2 text-sm rounded transition-colors ${
              activeSection === 'environments' 
                ? 'bg-dark-600 text-blue-400' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server size={14} className="inline mr-1" />
            Environments
          </button>
          <button
            onClick={() => setActiveSection('agents')}
            className={`flex-1 py-1.5 px-2 text-sm rounded transition-colors ${
              activeSection === 'agents' 
                ? 'bg-dark-600 text-blue-400' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Monitor size={14} className="inline mr-1" />
            Agents
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeSection === 'environments' ? (
          <>
            {/* Quick Actions */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-2 px-2">Quick Connect</div>
              <button
                onClick={createLocalSession}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-dark-700 transition-colors"
              >
                <Terminal size={16} className="text-green-400" />
                Local Terminal
              </button>
            </div>

            {/* Servers */}
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-xs text-gray-500 uppercase font-semibold">Servers</span>
                <button 
                  onClick={() => setShowAddServer(true)}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <Plus size={14} />
                </button>
              </div>
              
              {servers.map(server => (
                <button
                  key={server.id}
                  onClick={() => createSshSession(server)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-dark-700 transition-colors mb-1"
                >
                  <Server size={16} className="text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{server.name}</div>
                    <div className="text-xs text-gray-500 truncate">{server.username}@{server.host}</div>
                  </div>
                </button>
              ))}

              {servers.length === 0 && (
                <div className="text-xs text-gray-500 px-3 py-2">
                  No servers configured
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {/* Claude Agent */}
            <div className="p-3 bg-dark-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${claudeStatus.installed ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="font-medium text-sm">Claude Code</span>
                {claudeStatus.version && (
                  <span className="text-xs text-gray-500">{claudeStatus.version}</span>
                )}
              </div>
              
              {!claudeStatus.installed ? (
                <div className="text-xs text-gray-400">
                  <p className="mb-2">Not installed</p>
                  <code className="block bg-dark-800 p-2 rounded text-xs">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                </div>
              ) : !hasApiKey ? (
                <div className="text-xs text-gray-400">
                  <p className="mb-2">API key required</p>
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="text-blue-400 hover:underline"
                  >
                    Configure in Settings →
                  </button>
                </div>
              ) : (
                <button
                  onClick={launchClaude}
                  disabled={!activeSessionId}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600/20 text-orange-400 rounded hover:bg-orange-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={14} />
                  Launch Claude
                </button>
              )}
            </div>

            {/* Status */}
            <div className="p-3 text-xs text-gray-500">
              <div className="flex items-center gap-2 mb-1">
                {hasApiKey ? (
                  <><CheckCircle size={12} className="text-green-400" /> API key configured</>
                ) : (
                  <><AlertCircle size={12} className="text-yellow-400" /> API key missing</>
                )}
              </div>
              {activeSessionId && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-green-400" />
                  Session active
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-dark-600">
        <button 
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-400 hover:bg-dark-700 transition-colors"
        >
          <Settings size={16} />
          Settings
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => {
          setShowSettings(false)
          checkApiKey()
        }}
        onApiKeyChange={(hasKey) => setHasApiKey(hasKey)}
      />

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-4 w-80 border border-dark-600">
            <h3 className="text-lg font-semibold mb-3">Enter Password</h3>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SSH password"
              className="w-full px-3 py-2 bg-dark-700 rounded border border-dark-600 text-white placeholder-gray-500 mb-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const server = servers.find(s => s.id === showPasswordPrompt)
                  if (server) connectSsh(showPasswordPrompt, password, server.name)
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPasswordPrompt(null)
                  setPassword('')
                }}
                className="flex-1 px-3 py-2 bg-dark-700 rounded text-sm hover:bg-dark-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const server = servers.find(s => s.id === showPasswordPrompt)
                  if (server) connectSsh(showPasswordPrompt, password, server.name)
                }}
                className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
