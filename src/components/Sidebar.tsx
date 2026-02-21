import { useState, useEffect } from 'react'
import { Monitor, Server, Plus, Settings } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

interface SidebarProps {
  onAddSession: (session: { id: string; name: string; type: 'local' | 'ssh' | 'wsl'; status: 'connecting' }) => void
}

interface ServerConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_type: string
}

export default function Sidebar({ onAddSession }: SidebarProps) {
  const [activeSection, setActiveSection] = useState<'environments' | 'agents'>('environments')
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  // Load servers on mount
  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    try {
      const serverList = await invoke<ServerConfig[]>('list_servers')
      setServers(serverList)
    } catch (error) {
      console.error('Failed to load servers:', error)
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
      await invoke('create_local_session', { shell: null })
    } catch (error) {
      console.error('Failed to create local session:', error)
    }
  }

  const createSshSession = async (server: ServerConfig) => {
    if (server.auth_type === 'password') {
      setShowPasswordPrompt(server.id)
      return
    }
    
    // For key auth, connect directly
    await connectSsh(server.id, null)
  }

  const connectSsh = async (serverId: string, pwd: string | null) => {
    const server = servers.find(s => s.id === serverId)
    if (!server) return

    const sessionId = `ssh-${Date.now()}`
    onAddSession({
      id: sessionId,
      name: server.name,
      type: 'ssh',
      status: 'connecting'
    })

    try {
      await invoke('create_ssh_session', {
        req: {
          server_id: serverId,
          password: pwd,
        }
      })
      setShowPasswordPrompt(null)
      setPassword('')
    } catch (error) {
      console.error('Failed to create SSH session:', error)
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
            环境
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
            Agent
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeSection === 'environments' ? (
          <>
            {/* Quick Actions */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-2 px-2">快速连接</div>
              <button
                onClick={createLocalSession}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-dark-700 transition-colors"
              >
                <Plus size={16} className="text-green-400" />
                本地终端
              </button>
            </div>

            {/* Servers */}
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-xs text-gray-500 uppercase font-semibold">服务器</span>
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
                  暂无服务器配置
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <Monitor size={32} className="mx-auto mb-2 opacity-50" />
            <div className="text-sm">Agent 功能</div>
            <div className="text-xs mt-1">Phase 2 开发中</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-dark-600">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-400 hover:bg-dark-700 transition-colors">
          <Settings size={16} />
          设置
        </button>
      </div>

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-lg p-4 w-80">
            <h3 className="text-lg font-semibold mb-3">输入密码</h3>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SSH 密码"
              className="w-full px-3 py-2 bg-dark-700 rounded border border-dark-600 text-white placeholder-gray-500 mb-3"
              onKeyDown={(e) => e.key === 'Enter' && connectSsh(showPasswordPrompt, password)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPasswordPrompt(null)
                  setPassword('')
                }}
                className="flex-1 px-3 py-2 bg-dark-700 rounded text-sm hover:bg-dark-600"
              >
                取消
              </button>
              <button
                onClick={() => connectSsh(showPasswordPrompt, password)}
                className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500"
              >
                连接
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
