import { useState, useEffect } from 'react'
import { Plus, AlertCircle, Folder, Trash2, RotateCcw, Settings, Key } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import type { Session, Env, Project } from '../App'

interface SidebarProps {
  onAddSession: (session: Session) => void
  onSessionStatusChange?: (id: string, status: Session['status']) => void
  onSelectSession: (id: string) => void
  activeSessionId: string | null
  sessions: Session[]
  onDeleteSession: (id: string) => void
  onReconnectSession: (session: Session) => void
  isLoading?: boolean
  onOpenEnvManage?: () => void
}

// Agent definitions with colors
const AGENTS = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A', needsProject: true },
  { id: 'codex', name: 'Codex CLI', short: 'Codex', color: '#4ADE80', needsProject: true },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA', needsProject: true },
  { id: 'openclaw', name: 'OpenClaw', short: 'OClaw', color: '#C084FC', needsProject: false },
]

export default function Sidebar({
  onAddSession,
  onSessionStatusChange,
  onSelectSession,
  activeSessionId,
  sessions,
  onDeleteSession,
  onReconnectSession,
  isLoading,
  onOpenEnvManage,
}: SidebarProps) {
  const [envs, setEnvs] = useState<Env[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showAgentSelect, setShowAgentSelect] = useState<{ env: Env; project?: Project } | null>(null)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [envStatuses, setEnvStatuses] = useState<Record<string, string>>({})
  const [expandedEnvs, setExpandedEnvs] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

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
    if (env.type === 'local') return '💻'
    return '☁️'
  }

  const getEnvDetail = (env: Env) => {
    if (env.type === 'local') return env.detail || 'Local Machine'
    if (env.host && env.username) return `${env.username}@${env.host}`
    if (env.host) return env.host
    return env.name
  }

  // 创建本地会话（带 Agent 和可选项目）
  const createLocalSessionWithAgent = async (env: Env, agentId: string, projectId?: string, projectPath?: string) => {
    const id = `local-${Date.now()}`
    const agent = AGENTS.find(a => a.id === agentId)

    onAddSession({
      id,
      name: env.name,
      type: 'local',
      envId: env.id,
      agentId,
      projectId,
      projectPath,
      status: 'connecting',
      mode: agent?.needsProject === false ? 'chat' : 'terminal',
      statusText: '连接中...',
    })

    try {
      await invoke('create_local_session', {
        sessionId: id,
        shell: null,
        cols: 80,
        rows: 24,
        workingDir: projectPath,
        sessionInfo: {
          name: env.name,
          envId: env.id,
          envType: 'local',
          agentId,
          projectId,
          projectPath,
          workingDir: projectPath,
        }
      })
      onSessionStatusChange?.(id, 'connected')
    } catch (error) {
      console.error('Failed to create local session:', error)
      onSessionStatusChange?.(id, 'disconnected')
      setError('Failed to create local session')
    }
  }

  // 创建 SSH 会话（带 Agent 和可选项目）
  const createSshSessionWithAgent = async (env: Env, agentId: string, projectId?: string, projectPath?: string, pwd?: string | null) => {
    const sessionId = `ssh-${Date.now()}`
    const agent = AGENTS.find(a => a.id === agentId)

    onAddSession({
      id: sessionId,
      name: env.name,
      type: 'ssh',
      envId: env.id,
      agentId,
      projectId,
      projectPath,
      status: 'connecting',
      mode: agent?.needsProject === false ? 'chat' : 'terminal',
      statusText: '连接中...',
    })

    try {
      await invoke('create_ssh_session', {
        sessionId,
        req: {
          serverId: env.id,
          password: pwd,
        },
        sessionInfo: {
          name: env.name,
          envId: env.id,
          envType: 'ssh',
          agentId,
          projectId,
          projectPath,
          workingDir: projectPath,
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

  // 创建会话的主入口
  const createSessionWithAgent = async (env: Env, agentId: string, projectId?: string, projectPath?: string) => {
    if (env.type === 'local') {
      await createLocalSessionWithAgent(env, agentId, projectId, projectPath)
    } else if (env.auth_type === 'password') {
      // 需要密码，先保存选择，显示密码输入
      setShowPasswordPrompt(env.id)
      // 保存待创建的会话信息
      sessionStorage.setItem('pending_session', JSON.stringify({ envId: env.id, agentId, projectId, projectPath }))
    } else {
      await createSshSessionWithAgent(env, agentId, projectId, projectPath, null)
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

  const toggleProjectExpand = (projectKey: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectKey)) {
        next.delete(projectKey)
      } else {
        next.add(projectKey)
      }
      return next
    })
  }

  // Group sessions by environment
  const sessionsByEnv = sessions.reduce((acc, session) => {
    const envId = (session.envId && envs.find(e => e.id === session.envId))
      ? session.envId
      : 'unknown'
    if (!acc[envId]) acc[envId] = []
    acc[envId].push(session)
    return acc
  }, {} as Record<string, Session[]>)

  // Filter by search query
  const filteredEnvs = envs.filter(env => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const envMatch = env.name.toLowerCase().includes(query) ||
                     (env.detail?.toLowerCase().includes(query)) ||
                     (env.host?.toLowerCase().includes(query))
    const envSessions = sessionsByEnv[env.id] || []
    const sessionMatch = envSessions.some(s =>
      s.projectId?.toLowerCase().includes(query) ||
      s.lastMsg?.toLowerCase().includes(query) ||
      AGENTS.find(a => a.id === s.agentId)?.name.toLowerCase().includes(query)
    )
    const envProjects = projects.filter(p => p.env_id === env.id)
    const projectMatch = envProjects.some(p =>
      p.name.toLowerCase().includes(query) ||
      p.path.toLowerCase().includes(query)
    )
    return envMatch || sessionMatch || projectMatch
  })

  return (
    <div className="w-[272px] bg-[#0e1015] border-r border-[#1d2030] flex flex-col flex-shrink-0">
      {/* Search */}
      <div className="p-2.5 pb-1">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#151820] border border-[#1d2030]">
          <span className="text-xs text-[#4e5270]">🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索会话 / 项目..."
            className="flex-1 bg-transparent border-none outline-none text-[#e2e4ed] text-xs placeholder-[#4e5270]"
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-2.5 mt-1 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="text-xs text-[#4e5270] p-4 text-center">加载中...</div>
        ) : (
          filteredEnvs.map(env => {
            const online = (envStatuses[env.id] || env.status) === 'online'
            const isOpen = expandedEnvs.has(env.id) && online
            const envSessions = sessionsByEnv[env.id] || []

            // Group sessions by project
            const projectGroups: Record<string, Session[]> = {}
            const standalone: Session[] = []
            envSessions.forEach(s => {
              if (s.projectId && s.projectPath) {
                const key = `${env.id}:${s.projectPath}`
                if (!projectGroups[key]) projectGroups[key] = []
                projectGroups[key].push(s)
              } else {
                standalone.push(s)
              }
            })

            const projectKeys = Object.keys(projectGroups)
            const totalSessions = envSessions.length

            return (
              <div key={env.id} className="mb-0.5">
                {/* Environment header */}
                <div
                  onClick={() => online && toggleEnvExpand(env.id)}
                  className="flex items-center gap-2 px-2.5 py-1.75 rounded-lg cursor-pointer transition-colors"
                  style={{ opacity: online ? 1 : 0.38 }}
                  onMouseEnter={(e) => {
                    if (online) e.currentTarget.style.background = '#222738'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    className="text-[9px] text-[#4e5270] w-3 text-center transition-transform duration-150"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                  >
                    ▶
                  </span>
                  <span className="text-base">{getEnvIcon(env)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-[#e2e4ed]">{env.name}</div>
                    <div className="text-[10px] text-[#4e5270] font-mono truncate">{getEnvDetail(env)}</div>
                  </div>
                  {totalSessions > 0 && (
                    <span className="text-[9px] font-mono bg-[#1b1f2b] text-[#4e5270] px-1.5 py-0.5 rounded">
                      {totalSessions}
                    </span>
                  )}
                  <div
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{
                      background: online ? '#4ADE80' : '#4e5270',
                      boxShadow: online ? '0 0 6px #4ADE80' : 'none',
                    }}
                  />
                </div>

                {/* Offline: reconnect hint */}
                {!online && (
                  <div className="pl-10 mb-1">
                    <span
                      className="text-[10px] text-[#4e5270] cursor-pointer"
                      onMouseEnter={(e) => e.currentTarget.style.color = '#E8915A'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
                    >
                      重新连接
                    </span>
                  </div>
                )}

                {/* Expanded content */}
                {isOpen && (
                  <div className="pl-3.5 mt-0.5">
                    {/* Project groups */}
                    {projectKeys.map(pk => {
                      const projSessions = projectGroups[pk]
                      const pOpen = expandedProjects.has(pk) !== false // default open
                      const hasMultiple = projSessions.length > 1
                      const hasActive = projSessions.some(s => s.status === 'connected')

                      // Single session: show inline
                      if (!hasMultiple) {
                        const s = projSessions[0]
                        const isAct = activeSessionId === s.id
                        const agent = AGENTS.find(a => a.id === s.agentId)
                        const isDisconnected = s.status === 'disconnected'

                        return (
                          <div
                            key={pk}
                            onClick={() => !isDisconnected && onSelectSession(s.id)}
                            className="flex items-center gap-1.75 px-2 py-1.5 rounded-md mb-0.5 cursor-pointer transition-colors group relative"
                            style={{
                              background: isAct && !isDisconnected ? 'rgba(232, 145, 90, 0.12)' : 'transparent',
                              borderLeft: isAct && !isDisconnected ? '2.5px solid #E8915A' : '2.5px solid transparent',
                              opacity: isDisconnected ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isAct || isDisconnected) e.currentTarget.style.background = '#222738'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isAct && !isDisconnected ? 'rgba(232, 145, 90, 0.12)' : 'transparent'
                            }}
                          >
                            <span className="text-[11px] text-[#4e5270]">📁</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-medium font-mono truncate">{s.projectId}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] font-medium" style={{ color: agent?.color || '#4e5270' }}>
                                  {agent?.short || 'Agent'}
                                </span>
                                <span className="text-[10px] text-[#4e5270] font-mono truncate">
                                  {s.projectPath}
                                </span>
                              </div>
                            </div>
                            <SessionBadge s={s} />
                            {isDisconnected && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); onReconnectSession(s) }}
                                  className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-[#4ADE80]"
                                >
                                  <RotateCcw size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                                  className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-red-400"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      }

                      // Multi-session project: collapsible
                      return (
                        <div key={pk} className="mb-0.5">
                          <div
                            onClick={() => toggleProjectExpand(pk)}
                            className="flex items-center gap-1.5 px-2 py-1.25 rounded-md cursor-pointer"
                            onMouseEnter={(e) => e.currentTarget.style.background = '#222738'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span
                              className="text-[8px] text-[#4e5270] w-2.5 text-center transition-transform duration-150"
                              style={{ transform: pOpen ? 'rotate(90deg)' : 'none' }}
                            >
                              ▶
                            </span>
                            <span className="text-[11px] text-[#4e5270]">📁</span>
                            <span className="text-[12px] font-medium font-mono flex-1 truncate">
                              {projSessions[0]?.projectId}
                            </span>
                            {hasActive && (
                              <div
                                className="w-[5px] h-[5px] rounded-full"
                                style={{
                                  background: '#4ADE80',
                                  boxShadow: '0 0 5px rgba(74, 222, 128, 0.53)',
                                  animation: 'pulse 2s ease infinite',
                                }}
                              />
                            )}
                            <span className="text-[9px] font-mono text-[#4e5270] bg-[#1b1f2b] px-1 rounded">
                              {projSessions.length}
                            </span>
                          </div>

                          {pOpen && (
                            <div className="pl-5">
                              {projSessions.map(s => {
                                const isAct = activeSessionId === s.id
                                const agent = AGENTS.find(a => a.id === s.agentId)
                                const isDisconnected = s.status === 'disconnected'

                                return (
                                  <div
                                    key={s.id}
                                    onClick={() => !isDisconnected && onSelectSession(s.id)}
                                    className="flex items-center gap-1.75 px-2 py-1.25 rounded-md mb-0.5 cursor-pointer transition-colors group relative"
                                    style={{
                                      background: isAct && !isDisconnected ? 'rgba(232, 145, 90, 0.12)' : 'transparent',
                                      borderLeft: isAct && !isDisconnected ? '2.5px solid #E8915A' : '2.5px solid transparent',
                                      opacity: isDisconnected ? 0.5 : 1,
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isAct || isDisconnected) e.currentTarget.style.background = '#222738'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = isAct && !isDisconnected ? 'rgba(232, 145, 90, 0.12)' : 'transparent'
                                    }}
                                  >
                                    <div
                                      className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                                      style={{ background: agent?.color || '#4e5270' }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[11.5px] font-medium">{agent?.short || 'Agent'}</div>
                                      {s.lastMsg && (
                                        <div className="text-[10px] text-[#4e5270] truncate">{s.lastMsg}</div>
                                      )}
                                    </div>
                                    <SessionBadge s={s} />
                                    {isDisconnected && (
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onReconnectSession(s) }}
                                          className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-[#4ADE80]"
                                        >
                                          <RotateCcw size={12} />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                                          className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-red-400"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              <div
                                className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#4e5270] cursor-pointer rounded-md"
                                onClick={() => setShowAgentSelect({ env, project: projects.find(p => p.path === projSessions[0]?.projectPath) })}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#E8915A'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
                              >
                                <span>＋</span> 添加 Agent
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Standalone sessions (no project) */}
                    {standalone.length > 0 && projectKeys.length > 0 && (
                      <div className="h-px bg-[#1d2030] my-1.5 mx-2" />
                    )}
                    {standalone.map(s => {
                      const isAct = activeSessionId === s.id
                      const agent = AGENTS.find(a => a.id === s.agentId)
                      const isDisconnected = s.status === 'disconnected'

                      return (
                        <div
                          key={s.id}
                          onClick={() => !isDisconnected && onSelectSession(s.id)}
                          className="flex items-center gap-1.75 px-2 py-1.5 rounded-md mb-0.5 cursor-pointer transition-colors group relative"
                          style={{
                            background: isAct && !isDisconnected ? 'rgba(232, 145, 90, 0.12)' : 'transparent',
                            borderLeft: isAct && !isDisconnected ? '2.5px solid #E8915A' : '2.5px solid transparent',
                            opacity: isDisconnected ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!isAct || isDisconnected) e.currentTarget.style.background = '#222738'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isAct && !isDisconnected ? 'rgba(232, 145, 90, 0.12)' : 'transparent'
                          }}
                        >
                          <span className="text-[11px]">💬</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">
                              {s.lastMsg || agent?.name || s.name}
                            </div>
                            <div className="text-[10px] font-medium mt-0.5" style={{ color: agent?.color || '#4e5270' }}>
                              {agent?.short || 'Agent'}
                            </div>
                          </div>
                          <SessionBadge s={s} />
                          {isDisconnected && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); onReconnectSession(s) }}
                                className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-[#4ADE80]"
                              >
                                <RotateCcw size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                                className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* New session in env */}
                    <div
                      className="flex items-center gap-1.25 px-2 py-1.25 text-[11px] text-[#4e5270] cursor-pointer rounded-md mt-0.5"
                      onClick={() => setShowAgentSelect({ env })}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#E8915A'
                        e.currentTarget.style.background = 'rgba(232, 145, 90, 0.08)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#4e5270'
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span>＋</span> 新建会话
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Empty state */}
        {filteredEnvs.length === 0 && !isLoading && (
          <div className="text-xs text-[#4e5270] p-4 text-center">
            {searchQuery ? '未找到匹配结果' : '暂无环境，请添加新环境'}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="p-2 border-t border-[#1d2030] flex flex-col gap-1">
        <button
          onClick={() => {
            const localEnv = envs.find(e => e.type === 'local')
            if (localEnv) {
              setShowAgentSelect({ env: localEnv })
            } else {
              setShowAddServer(true)
            }
          }}
          className="w-full py-2.25 px-3 rounded-lg border border-[#E8915A]/30 bg-gradient-to-br from-[#E8915A]/10 to-[#E8915A]/5 text-[#E8915A] text-xs font-medium flex items-center justify-center gap-1.5 hover:border-[#E8915A]/50 transition-colors"
        >
          <Plus size={14} /> 新建会话
        </button>
        <div className="flex justify-center gap-4 py-1">
          <span
            onClick={onOpenEnvManage}
            className="text-[11px] text-[#4e5270] cursor-pointer flex items-center gap-1"
            onMouseEnter={(e) => e.currentTarget.style.color = '#E8915A'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
          >
            <Settings size={12} /> 环境管理
          </span>
          <span
            className="text-[11px] text-[#4e5270] cursor-pointer flex items-center gap-1"
            onMouseEnter={(e) => e.currentTarget.style.color = '#8b8fa7'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
          >
            <Key size={12} /> API Keys
          </span>
        </div>
      </div>

      {/* Modals */}
      {showAddServer && (
        <AddEnvModal
          onClose={() => setShowAddServer(false)}
          onCreated={() => {
            setShowAddServer(false)
            loadEnvs()
          }}
        />
      )}

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

      {showAgentSelect && (
        <AgentSelectModal
          env={showAgentSelect.env}
          projects={projects}
          preselectedProject={showAgentSelect.project}
          onClose={() => setShowAgentSelect(null)}
          onSelectAgent={(agentId, projectId, projectPath) => {
            createSessionWithAgent(showAgentSelect!.env, agentId, projectId, projectPath)
            setShowAgentSelect(null)
          }}
        />
      )}

      {showPasswordPrompt && (
        <PasswordPromptModal
          envId={showPasswordPrompt}
          envs={envs}
          password={password}
          setPassword={setPassword}
          onClose={() => {
            setShowPasswordPrompt(null)
            setPassword('')
            sessionStorage.removeItem('pending_session')
          }}
          onSubmit={() => {
            const env = envs.find(e => e.id === showPasswordPrompt)
            const pending = sessionStorage.getItem('pending_session')
            if (env && pending) {
              const { agentId, projectId, projectPath } = JSON.parse(pending)
              createSshSessionWithAgent(env, agentId, projectId, projectPath, password)
              sessionStorage.removeItem('pending_session')
            }
          }}
        />
      )}
    </div>
  )
}

// Session badge component
function SessionBadge({ s }: { s: Session }) {
  return (
    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
      <span
        className="text-[8.5px] px-1.5 py-0.5 rounded"
        style={{
          background: s.mode === 'chat' ? 'rgba(192, 132, 252, 0.08)' : 'rgba(96, 165, 250, 0.08)',
          color: s.mode === 'chat' ? '#C084FC' : '#60A5FA',
        }}
      >
        {s.mode === 'chat' ? '💬' : '⌨'}
      </span>
      {s.status === 'connected' && s.statusText && (
        <span className="text-[9px] text-[#4ADE80] font-medium">{s.statusText}</span>
      )}
      {s.status === 'disconnected' && (
        <span className="text-[9px] text-[#60A5FA]">✓ 已断开</span>
      )}
    </div>
  )
}

// Password Prompt Modal
function PasswordPromptModal({
  envId,
  envs,
  password,
  setPassword,
  onClose,
  onSubmit,
}: {
  envId: string
  envs: Env[]
  password: string
  setPassword: (p: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0f1117] rounded-lg p-4 w-80 border border-[#1e2130]">
        <h3 className="text-lg font-semibold mb-3">输入 SSH 密码</h3>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="SSH password"
          className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] mb-3 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]">
            取消
          </button>
          <button onClick={onSubmit} className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500">
            连接
          </button>
        </div>
      </div>
    </div>
  )
}

// Add Environment Modal
function AddEnvModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
        {error && <div className="mb-3 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-[#8b8fa7] mb-1">Host *</label>
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.1"
                className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm" />
            </div>
            <div className="w-20">
              <label className="block text-xs text-[#8b8fa7] mb-1">Port</label>
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="22"
                className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Username *</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm" />
          </div>
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Auth Type</label>
            <div className="flex gap-2">
              <button onClick={() => setAuthType('key')}
                className={`flex-1 py-2 rounded text-sm ${authType === 'key' ? 'bg-blue-600 text-white' : 'bg-[#161822] text-[#8b8fa7]'}`}>
                Private Key
              </button>
              <button onClick={() => setAuthType('password')}
                className={`flex-1 py-2 rounded text-sm ${authType === 'password' ? 'bg-blue-600 text-white' : 'bg-[#161822] text-[#8b8fa7]'}`}>
                Password
              </button>
            </div>
          </div>
          {authType === 'key' && (
            <div>
              <label className="block text-xs text-[#8b8fa7] mb-1">Private Key Path</label>
              <input value={privateKeyPath} onChange={(e) => setPrivateKeyPath(e.target.value)} placeholder="~/.ssh/id_rsa"
                className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm" />
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500 disabled:opacity-50">
            {loading ? 'Adding...' : 'Add Environment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Add Project Modal
function AddProjectModal({ envs, onClose, onCreated }: { envs: Env[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [envId, setEnvId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (envs.length > 0 && !envId) setEnvId(envs[0].id)
  }, [envs, envId])

  const handleSubmit = async () => {
    if (!name || !path || !envId) {
      setError('Please fill in all required fields')
      return
    }
    setLoading(true)
    setError('')
    try {
      await invoke('create_project', { req: { name, path, env_id: envId } })
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
        {error && <div className="mb-3 p-2 bg-red-600/20 border border-red-600/50 rounded text-xs text-red-400">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Project Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm" />
          </div>
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Path *</label>
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/projects/my-project"
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white placeholder-[#555872] text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1">Environment *</label>
            <select value={envId} onChange={(e) => setEnvId(e.target.value)}
              className="w-full px-3 py-2 bg-[#161822] rounded border border-[#1e2130] text-white text-sm">
              {envs.map(env => (
                <option key={env.id} value={env.id}>
                  {env.type === 'local' ? '💻' : '☁️'} {env.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500 disabled:opacity-50">
            {loading ? 'Adding...' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Agent Select Modal
function AgentSelectModal({
  env,
  projects,
  preselectedProject,
  onClose,
  onSelectAgent,
}: {
  env: Env
  projects: Project[]
  preselectedProject?: Project
  onClose: () => void
  onSelectAgent: (agentId: string, projectId?: string, projectPath?: string) => void
}) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(preselectedProject || null)

  const envProjects = projects.filter(p => p.env_id === env.id)
  const selectedAgentConfig = AGENTS.find(a => a.id === selectedAgent)

  const handleConfirm = () => {
    if (!selectedAgent) return
    const agent = AGENTS.find(a => a.id === selectedAgent)
    if (agent?.needsProject && !selectedProject) return
    onSelectAgent(selectedAgent, selectedProject?.name, selectedProject?.path)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0f1117] rounded-lg p-5 w-96 border border-[#1e2130]">
        <h3 className="text-lg font-semibold mb-1">新建会话</h3>
        <p className="text-xs text-[#4e5270] mb-4">
          环境: {env.type === 'local' ? '💻' : '☁️'} {env.name}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#8b8fa7] mb-2">选择 Agent</label>
            <div className="space-y-1">
              {AGENTS.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    selectedAgent === agent.id
                      ? 'bg-[#E8915A]/20 border border-[#E8915A]/50'
                      : 'bg-[#161822] border border-transparent hover:border-[#1e2130]'
                  }`}
                >
                  <div className="w-2 h-4 rounded" style={{ backgroundColor: agent.color }} />
                  <span className="flex-1 text-[#e2e4ed]">{agent.name}</span>
                  {agent.needsProject ? (
                    <Folder size={12} className="text-[#60A5FA]" />
                  ) : (
                    <span className="text-[10px] text-[#C084FC]">独立</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedAgentConfig?.needsProject && (
            <div>
              <label className="block text-xs text-[#8b8fa7] mb-2">选择项目</label>
              {envProjects.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {envProjects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        selectedProject?.id === project.id
                          ? 'bg-[#E8915A]/20 border border-[#E8915A]/50'
                          : 'bg-[#161822] border border-transparent hover:border-[#1e2130]'
                      }`}
                    >
                      <Folder size={14} className="text-[#E8915A]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#e2e4ed] font-mono text-xs truncate">{project.path}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#4e5270] p-3 bg-[#161822] rounded-lg">
                  该环境下暂无注册项目。请先添加项目。
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130]">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAgent || (selectedAgentConfig?.needsProject && !selectedProject)}
            className="flex-1 px-3 py-2 bg-gradient-to-r from-[#E8915A] to-[#D46A28] rounded text-sm text-white disabled:opacity-50"
          >
            创建会话
          </button>
        </div>
      </div>
    </div>
  )
}
