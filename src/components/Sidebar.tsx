import { useState, useEffect } from 'react'
import { Server, Plus, Settings, Terminal, AlertCircle, ChevronRight, Folder, MessageSquare } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import SettingsModal from './SettingsModal'
import type { Session, Env, Project } from '../App'

interface SidebarProps {
  onAddSession: (session: Session) => void
  onSessionStatusChange?: (id: string, status: Session['status']) => void
  activeSessionId: string | null
  sessions: Session[]
}

// Agent definitions with colors
const AGENTS = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A', needsProject: true },
  { id: 'codex', name: 'Codex CLI', short: 'Codex', color: '#4ADE80', needsProject: true },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA', needsProject: true },
  { id: 'openclaw', name: 'OpenClaw', short: 'OClaw', color: '#C084FC', needsProject: false },
]

export default function Sidebar({ onAddSession, onSessionStatusChange, activeSessionId, sessions }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'envs' | 'projects'>('sessions')
  const [envs, setEnvs] = useState<Env[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [envStatuses, setEnvStatuses] = useState<Record<string, string>>({})
  const [expandedEnvs, setExpandedEnvs] = useState<Set<string>>(new Set())

  // Load environments and projects
  useEffect(() => {
    loadEnvs()
    loadProjects()
  }, [])

  // Check environment statuses when envs change
  useEffect(() => {
    envs.forEach(env => checkEnvStatus(env.id))
  }, [envs])

  const loadEnvs = async () => {
    try {
      const envList = await invoke<Env[]>('list_envs')
      setEnvs(envList)
      // Initialize all environments as expanded
      setExpandedEnvs(new Set(envList.map(e => e.id)))
    } catch (error) {
      console.error('Failed to load environments:', error)
    }
  }

  const loadProjects = async () => {
    try {
      const projectList = await invoke<Project[]>('list_projects')
      setProjects(projectList)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  const checkEnvStatus = async (envId: string) => {
    try {
      const status = await invoke<string>('check_env_status', { id: envId })
      setEnvStatuses(prev => ({ ...prev, [envId]: status }))
    } catch (error) {
      console.error('Failed to check env status:', error)
    }
  }

  const getEnvIcon = (env: Env) => {
    if (env.type === 'local') return <Terminal size={14} className="text-green-400" />
    return <Server size={14} className="text-blue-400" />
  }

  const getEnvDetail = (env: Env) => {
    if (env.type === 'local') return 'Local Machine'
    if (env.host && env.username) return `${env.username}@${env.host}`
    if (env.host) return env.host
    return env.name
  }

  const createSession = async (env: Env) => {
    if (env.type === 'local') {
      await createLocalSession(env)
    } else {
      await createSshSession(env)
    }
  }

  const createLocalSession = async (env: Env) => {
    const id = `local-${Date.now()}`
    onAddSession({
      id,
      name: env.name,
      type: 'local',
      envId: env.id,
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

  const createSshSession = async (env: Env) => {
    if (env.auth_type === 'password') {
      setShowPasswordPrompt(env.id)
      return
    }

    await connectSsh(env.id, null, env.name)
  }

  const connectSsh = async (envId: string, pwd: string | null, envName: string) => {
    const sessionId = `ssh-${Date.now()}`
    onAddSession({
      id: sessionId,
      name: envName,
      type: 'ssh',
      envId: envId,
      status: 'connecting'
    })

    try {
      await invoke('create_ssh_session', {
        sessionId,
        req: {
          server_id: envId,
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

  const toggleEnvExpand = (envId: string) => {
    setExpandedEnvs(prev => {
      const next = new Set(prev)
      if (next.has(envId)) {
        next.delete(envId)
      } else {
        next.add(envId)
      }
      return next
    })
  }

  // Group sessions by environment
  const sessionsByEnv = sessions.reduce((acc, session) => {
    const envId = session.envId || 'unknown'
    if (!acc[envId]) acc[envId] = []
    acc[envId].push(session)
    return acc
  }, {} as Record<string, Session[]>)

  return (
    <div className="w-64 bg-[#0f1117] border-r border-[#1e2130] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#1e2130]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[#E8915A] to-[#D46A28] rounded-lg flex items-center justify-center shadow-lg shadow-[#E8915A]/20">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-lg">AgentHub</span>
        </div>
      </div>

      {/* Sidebar Tabs */}
      <div className="flex border-b border-[#1e2130]">
        {(['sessions', 'envs', 'projects'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === tab
                ? 'text-white bg-[#161822] border-b-2 border-[#E8915A]'
                : 'text-[#555872] hover:text-[#8b8fa7]'
            }`}
          >
            {tab === 'sessions' ? '会话' : tab === 'envs' ? '环境' : '项目'}
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">x</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'sessions' && (
          <>
            {/* Sessions grouped by environment */}
            {envs.filter(e => envStatuses[e.id] === 'online' && sessionsByEnv[e.id]?.length > 0).map(env => (
              <EnvSessionGroup
                key={env.id}
                env={env}
                sessions={sessionsByEnv[env.id] || []}
                activeSessionId={activeSessionId}
                expanded={expandedEnvs.has(env.id)}
                onToggle={() => toggleEnvExpand(env.id)}
                onSelectSession={(id) => {
                  const session = sessions.find(s => s.id === id)
                  if (session) onAddSession(session)
                }}
              />
            ))}

            {sessions.length === 0 && (
              <div className="text-xs text-[#555872] p-4 text-center">
                No active sessions.<br />
                Go to Environments tab to connect.
              </div>
            )}
          </>
        )}

        {activeTab === 'envs' && (
          <>
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555872]">已添加环境</span>
              <button
                onClick={() => setShowAddServer(true)}
                className="text-[#555872] hover:text-white text-sm"
              >
                +
              </button>
            </div>

            {envs.map(env => (
              <button
                key={env.id}
                onClick={() => createSession(env)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-[#161822] transition-colors mb-0.5 group"
              >
                {getEnvIcon(env)}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[#e2e4ed] text-xs font-medium">{env.name}</div>
                  <div className="text-[10px] text-[#555872] font-mono truncate">{getEnvDetail(env)}</div>
                </div>
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    (envStatuses[env.id] || env.status) === 'online'
                      ? 'bg-[#4ADE80] shadow-sm shadow-[#4ADE80]'
                      : 'bg-[#555872]'
                  }`}
                />
              </button>
            ))}

            <div className="px-3 py-3 text-[11px] text-[#555872] leading-relaxed">
              环境是你的机器和服务器。添加后可创建项目或启动独立会话。
            </div>
          </>
        )}

        {activeTab === 'projects' && (
          <>
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555872]">已注册项目</span>
              <button
                onClick={() => setShowAddProject(true)}
                className="text-[#555872] hover:text-white text-sm"
              >
                +
              </button>
            </div>

            {projects.map(project => {
              const env = envs.find(e => e.id === project.env_id)
              return (
                <button
                  key={project.id}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-[#161822] transition-colors mb-0.5"
                >
                  <Folder size={14} className="text-[#E8915A]" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[#e2e4ed] text-xs font-medium font-mono">{project.path}</div>
                    <div className="text-[10px] text-[#555872] flex gap-1 items-center">
                      <span className="text-[9px] px-1 rounded bg-[#232738]">
                        {env?.type === 'local' ? '💻' : '☁️'} {env?.name}
                      </span>
                      {project.lang && <span>{project.lang}</span>}
                    </div>
                  </div>
                </button>
              )
            })}

            {projects.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-[#555872] leading-relaxed">
                暂无注册项目。点击 + 添加项目目录。
              </div>
            )}

            <div className="px-3 py-3 text-[11px] text-[#555872] leading-relaxed">
              项目型 Agent（Claude Code 等）需要绑定项目目录；独立型 Agent（OpenClaw）不需要。
            </div>
          </>
        )}
      </div>

      {/* Agents section */}
      <div className="border-t border-[#1e2130] p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#555872] px-2 mb-1">Agents</div>
        {AGENTS.map(agent => (
          <div
            key={agent.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
          >
            <div
              className="w-0.5 h-4 rounded"
              style={{ backgroundColor: agent.color }}
            />
            <span className="flex-1 text-[#e2e4ed]">{agent.name}</span>
            <span
              className="text-[8px] px-1 py-0.5 rounded"
              style={{
                backgroundColor: agent.needsProject ? 'rgba(96, 165, 250, 0.1)' : 'rgba(192, 132, 252, 0.1)',
                color: agent.needsProject ? '#60A5FA' : '#C084FC'
              }}
            >
              {agent.needsProject ? <Folder size={10} className="inline" /> : <MessageSquare size={10} className="inline" />}
            </span>
          </div>
        ))}
      </div>

      {/* New session button */}
      <div className="p-2 border-t border-[#1e2130]">
        <button
          onClick={() => setActiveTab('envs')}
          className="w-full py-2 px-3 rounded-lg border border-dashed border-[#2a2d3e] text-[#8b8fa7] text-xs font-medium hover:border-[#3a3d4e] hover:text-white transition-colors flex items-center justify-center gap-1"
        >
          <Plus size={14} /> 新建会话
        </button>
      </div>

      {/* Settings */}
      <div className="p-2 border-t border-[#1e2130]">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-[#555872] hover:bg-[#161822] hover:text-[#8b8fa7] transition-colors"
        >
          <Settings size={16} />
          Settings
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Add Server Modal */}
      {showAddServer && (
        <AddEnvModal
          onClose={() => setShowAddServer(false)}
          onCreated={() => {
            setShowAddServer(false)
            loadEnvs()
          }}
        />
      )}

      {/* Add Project Modal */}
      {showAddProject && (
        <AddProjectModal
          envs={envs}
          onClose={() => setShowAddProject(false)}
          onCreated={() => {
            setShowAddProject(false)
            loadProjects()
          }}
        />
      )}

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0f1117] rounded-lg p-4 w-80 border border-[#1e2130]">
            <h3 className="text-lg font-semibold mb-3">Enter Password</h3>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SSH password"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] mb-3 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const env = envs.find(e => e.id === showPasswordPrompt)
                  if (env) connectSsh(showPasswordPrompt, password, env.name)
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPasswordPrompt(null)
                  setPassword('')
                }}
                className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const env = envs.find(e => e.id === showPasswordPrompt)
                  if (env) connectSsh(showPasswordPrompt, password, env.name)
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

// Session group component for the sessions tab
function EnvSessionGroup({
  env,
  sessions,
  activeSessionId,
  expanded,
  onToggle,
  onSelectSession,
}: {
  env: Env
  sessions: Session[]
  activeSessionId: string | null
  expanded: boolean
  onToggle: () => void
  onSelectSession: (id: string) => void
}) {
  const getAgentColor = (session: Session) => {
    const agent = AGENTS.find(a => a.id === session.agentId)
    return agent?.color || '#555872'
  }

  const getSessionName = (session: Session) => {
    if (session.projectId) {
      return session.projectId // Would be project name in future
    }
    const agent = AGENTS.find(a => a.id === session.agentId)
    return agent?.name || session.name
  }

  return (
    <div className="mb-1">
      <div
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-[11px] text-[#8b8fa7] hover:bg-[#161822]"
      >
        <ChevronRight
          size={10}
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-xs">{env.type === 'local' ? '💻' : '☁️'}</span>
        <span className="font-medium flex-1">{env.name}</span>
        <span className="text-[9px] font-mono bg-[#232738] text-[#555872] px-1 rounded">
          {sessions.length}
        </span>
      </div>
      {expanded && (
        <div className="pl-5">
          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mb-0.5 ${
                activeSessionId === session.id
                  ? 'bg-[#E8915A]/10 border-l-2 border-[#E8915A]'
                  : 'hover:bg-[#161822] border-l-2 border-transparent'
              }`}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getAgentColor(session) }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-[#e2e4ed]">
                  {getSessionName(session)}
                </div>
              </div>
              <span
                className="text-[8px] px-1 rounded"
                style={{
                  backgroundColor: session.projectId ? 'rgba(96, 165, 250, 0.1)' : 'rgba(192, 132, 252, 0.1)',
                  color: session.projectId ? '#60A5FA' : '#C084FC'
                }}
              >
                {session.projectId ? '📁' : '💬'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Add Environment Modal
function AddEnvModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [authType, setAuthType] = useState<'password' | 'key'>('key')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name || !host || !username) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError('')

    try {
      await invoke('create_env', {
        req: {
          name,
          type: 'ssh',
          host,
          port: parseInt(port) || 22,
          username,
          auth_type: authType,
          private_key_path: privateKeyPath || null,
          icon: 'cloud',
        }
      })
      onCreated()
    } catch (err: any) {
      setError(err.toString())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0f1117] rounded-lg p-5 w-96 border border-[#1e2130]">
        <h3 className="text-lg font-semibold mb-4">Add SSH Environment</h3>

        {error && (
          <div className="mb-3 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Server"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-[#8b8fa7] mb-1">Host *</label>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.1"
                className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-[#8b8fa7] mb-1">Port</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
                className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Username *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Auth Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAuthType('key')}
                className={`flex-1 py-2 rounded text-sm ${
                  authType === 'key' ? 'bg-blue-600 text-white' : 'bg-[#161822] text-[#8b8fa7]'
                }`}
              >
                Private Key
              </button>
              <button
                onClick={() => setAuthType('password')}
                className={`flex-1 py-2 rounded text-sm ${
                  authType === 'password' ? 'bg-blue-600 text-white' : 'bg-[#161822] text-[#8b8fa7]'
                }`}
              >
                Password
              </button>
            </div>
          </div>

          {authType === 'key' && (
            <div>
              <label className="block text-xs text-[#8b8fa7] mb-1">Private Key Path</label>
              <input
                value={privateKeyPath}
                onChange={(e) => setPrivateKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Environment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Add Project Modal
function AddProjectModal({
  envs,
  onClose,
  onCreated,
}: {
  envs: Env[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [envId, setEnvId] = useState('')
  const [lang, setLang] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Set default env when envs load
  useEffect(() => {
    if (envs.length > 0 && !envId) {
      setEnvId(envs[0].id)
    }
  }, [envs, envId])

  const handleSubmit = async () => {
    if (!name || !path || !envId) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError('')

    try {
      await invoke('create_project', {
        req: {
          name,
          path,
          env_id: envId,
          lang: lang || null,
        }
      })
      onCreated()
    } catch (err: any) {
      setError(err.toString())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0f1117] rounded-lg p-5 w-96 border border-[#1e2130]">
        <h3 className="text-lg font-semibold mb-4">Add Project</h3>

        {error && (
          <div className="mb-3 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Project Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Path *</label>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="~/projects/my-project"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Environment *</label>
            <select
              value={envId}
              onChange={(e) => setEnvId(e.target.value)}
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white text-sm"
            >
              {envs.map(env => (
                <option key={env.id} value={env.id}>
                  {env.type === 'local' ? '💻' : '☁️'} {env.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Language</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white text-sm"
            >
              <option value="">Auto Detect</option>
              <option value="TS">TypeScript</option>
              <option value="JS">JavaScript</option>
              <option value="Py">Python</option>
              <option value="Rust">Rust</option>
              <option value="Go">Go</option>
              <option value="Java">Java</option>
              <option value="TF">Terraform</option>
              <option value="MD">Markdown</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
