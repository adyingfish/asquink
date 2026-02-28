import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Session, Env, Project, AgentInfo } from '../App'

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
  refreshKey?: number
  getPreferredPtySize: () => { cols: number; rows: number }
}

// Agent definitions with colors
const AGENTS = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A', needsProject: true },
  { id: 'codex', name: 'Codex', short: 'Codex', color: '#E5E7EB', needsProject: true },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA', needsProject: true },
  { id: 'opencode', name: 'OpenCode', short: 'OpenCode', color: '#78716C', needsProject: true },
  { id: 'openclaw', name: 'OpenClaw', short: 'OpenClaw', color: '#EF4444', needsProject: false },
]

const getProjectNameFromPath = (value: string) => {
  const normalized = value.trim().replace(/[\\/]+$/, '')
  if (!normalized) return ''

  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || normalized
}

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
  refreshKey,
  getPreferredPtySize,
}: SidebarProps) {
  const [envs, setEnvs] = useState<Env[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
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
  }, [refreshKey])

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

      // Show result message
      if (status === 'online') {
        setError('') // Clear any previous error
      } else {
        setError('连接失败: 无法连接到该环境')
      }
    } catch (error) {
      console.error('Failed to check env status:', error)
      setError('连接失败: ' + error)
    }
  }

  const getEnvIcon = (env: Env) => {
    if (env.type === 'local') return '💻'
    if (env.type === 'wsl') return '🐧'
    return '☁️'
  }

  const getEnvDetail = (env: Env) => {
    if (env.type === 'local') return env.detail || 'Local Machine'
    if (env.type === 'wsl') return env.wsl_distro || 'WSL'
    if (env.host && env.username) return `${env.username}@${env.host}`
    if (env.host) return env.host
    return env.name
  }

  // 创建本地会话（带 Agent 和可选项目）
  const createLocalSessionWithAgent = async (env: Env, agentId: string | null, projectId?: string, projectPath?: string) => {
    const id = `local-${Date.now()}`
    const agent = agentId ? AGENTS.find(a => a.id === agentId) : null

    console.log('Creating local session:', { id, envId: env.id, agentId, projectId, projectPath })

    onAddSession({
      id,
      name: env.name,
      type: 'local',
      envId: env.id,
      agentId: agentId || undefined,
      projectId,
      projectPath,
      status: 'connecting',
      mode: agent?.needsProject === false ? 'chat' : 'terminal',
      statusText: '连接中...',
    })

    try {
      const { cols, rows } = getPreferredPtySize()
      const sessionInfo = {
        name: env.name,
        envId: env.id,
        envType: 'local',
        agentId: agentId || null,
        projectId: projectId || null,
        projectPath: projectPath || null,
        workingDir: projectPath || null,
      }

      console.log('Invoking create_local_session with:', { sessionId: id, workingDir: projectPath, sessionInfo })

      await invoke('create_local_session', {
        sessionId: id,
        shell: null,
        cols,
        rows,
        workingDir: projectPath || null,
        sessionInfo,
      })
      onSessionStatusChange?.(id, 'connected')

      // Auto-launch agent if selected
      if (agentId) {
        const agentInfo = AGENTS.find(a => a.id === agentId)
        if (agentInfo) {
          // Wait a bit for terminal to be ready
          setTimeout(async () => {
            try {
              await invoke('launch_agent', {
                sessionId: id,
                sessionType: 'local',
                agent: agentInfo.id,
              })
            } catch (err) {
              console.error('Failed to launch agent:', err)
            }
          }, 500)
        }
      }
    } catch (error) {
      console.error('Failed to create local session:', error)
      onSessionStatusChange?.(id, 'disconnected')
      setError('Failed to create local session: ' + error)
    }
  }

  // 创建 SSH 会话（带 Agent 和可选项目）
  const createSshSessionWithAgent = async (env: Env, agentId: string | null, projectId?: string, projectPath?: string, pwd?: string | null) => {
    const sessionId = `ssh-${Date.now()}`
    const agent = agentId ? AGENTS.find(a => a.id === agentId) : null

    onAddSession({
      id: sessionId,
      name: env.name,
      type: 'ssh',
      envId: env.id,
      agentId: agentId || undefined,
      projectId,
      projectPath,
      status: 'connecting',
      mode: agent?.needsProject === false ? 'chat' : 'terminal',
      statusText: '连接中...',
    })

    try {
      const { cols, rows } = getPreferredPtySize()
      await invoke('create_ssh_session', {
        sessionId,
        cols,
        rows,
        req: {
          serverId: env.id,
          password: pwd,
        },
        sessionInfo: {
          name: env.name,
          envId: env.id,
          envType: 'ssh',
          agentId: agentId || null,
          projectId,
          projectPath,
          workingDir: projectPath,
        }
      })
      onSessionStatusChange?.(sessionId, 'connected')
      setShowPasswordPrompt(null)
      setPassword('')

      // Auto-launch agent if selected
      if (agentId) {
        const agentInfo = AGENTS.find(a => a.id === agentId)
        if (agentInfo) {
          // Wait a bit for terminal to be ready
          setTimeout(async () => {
            try {
              await invoke('launch_agent', {
                sessionId,
                sessionType: 'ssh',
                agent: agentInfo.id,
              })
            } catch (err) {
              console.error('Failed to launch agent:', err)
            }
          }, 500)
        }
      }
    } catch (error: any) {
      console.error('Failed to create SSH session:', error)
      onSessionStatusChange?.(sessionId, 'disconnected')
      setError(`SSH connection failed: ${error}`)
    }
  }

  // 创建 WSL 会话（带 Agent 和可选项目）
  const createWslSessionWithAgent = async (env: Env, agentId: string | null, projectId?: string, projectPath?: string) => {
    const sessionId = `wsl-${Date.now()}`
    const agent = agentId ? AGENTS.find(a => a.id === agentId) : null

    onAddSession({
      id: sessionId,
      name: env.name,
      type: 'wsl',
      envId: env.id,
      agentId: agentId || undefined,
      projectId,
      projectPath,
      status: 'connecting',
      mode: agent?.needsProject === false ? 'chat' : 'terminal',
      statusText: '连接中...',
    })

    try {
      const { cols, rows } = getPreferredPtySize()
      await invoke('create_wsl_session', {
        sessionId,
        envId: env.id,
        cols,
        rows,
        workingDir: projectPath || null,
        sessionInfo: {
          name: env.name,
          envId: env.id,
          envType: 'wsl',
          agentId: agentId || null,
          projectId,
          projectPath,
          workingDir: projectPath,
        }
      })
      onSessionStatusChange?.(sessionId, 'connected')

      // Auto-launch agent if selected
      if (agentId) {
        const agentInfo = AGENTS.find(a => a.id === agentId)
        if (agentInfo) {
          // Wait a bit for terminal to be ready
          setTimeout(async () => {
            try {
              await invoke('launch_agent', {
                sessionId,
                sessionType: 'wsl',
                agent: agentInfo.id,
              })
            } catch (err) {
              console.error('Failed to launch agent:', err)
            }
          }, 500)
        }
      }
    } catch (error: any) {
      console.error('Failed to create WSL session:', error)
      onSessionStatusChange?.(sessionId, 'disconnected')
      setError(`WSL connection failed: ${error}`)
    }
  }

  // 创建会话的主入口
  const createSessionWithAgent = async (env: Env, agentId: string | null, projectId?: string, projectPath?: string) => {
    if (env.type === 'local') {
      await createLocalSessionWithAgent(env, agentId, projectId, projectPath)
    } else if (env.type === 'wsl') {
      await createWslSessionWithAgent(env, agentId, projectId, projectPath)
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
  }).sort((a, b) => {
    // 1. Local environment always first
    if (a.type === 'local') return -1
    if (b.type === 'local') return 1

    // 2. Environment with connecting sessions comes first
    const aSessions = sessionsByEnv[a.id] || []
    const bSessions = sessionsByEnv[b.id] || []
    const aHasConnecting = aSessions.some(s => s.status === 'connecting' || s.status === 'connected')
    const bHasConnecting = bSessions.some(s => s.status === 'connecting' || s.status === 'connected')

    if (aHasConnecting && !bHasConnecting) return -1
    if (!aHasConnecting && bHasConnecting) return 1

    // 3. Keep original order
    return 0
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
          ⚠️ {error}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        checkEnvStatus(env.id)
                      }}
                      className="text-[10px] text-[#4e5270] cursor-pointer px-2 py-1 rounded hover:bg-[#222738]"
                      onMouseEnter={(e) => e.currentTarget.style.color = '#E8915A'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
                    >
                      ↻ 重新连接
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
                                  className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-[#4ADE80] text-xs"
                                >
                                  ↻
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                                  className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-red-400 text-xs"
                                >
                                  🗑
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
                            className="flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer"
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
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-medium font-mono truncate">
                                {projSessions[0]?.projectId}
                              </div>
                              <div className="text-[10px] text-[#4e5270] truncate">
                                {projSessions[0]?.projectPath}
                              </div>
                            </div>
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
                            <span className="text-[9px] font-mono text-[#4e5270] bg-[#1b1f2b] px-1.5 py-0.5 rounded">
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
                                          className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-[#4ADE80] text-xs"
                                        >
                                          ↻
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                                          className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-red-400 text-xs"
                                        >
                                          🗑
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              <div
                                className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#4e5270] cursor-pointer rounded-md"
                                onClick={() => setShowNewSession(true)}
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
                                className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-[#4ADE80] text-xs"
                              >
                                ↻
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                                className="p-1 hover:bg-[#1e2130] rounded text-[#4e5270] hover:text-red-400 text-xs"
                              >
                                🗑
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* New session in env */}
                    <div
                      className="flex items-center gap-1.25 px-2 py-1.25 text-[11px] text-[#4e5270] cursor-pointer rounded-md mt-0.5"
                      onClick={() => setShowNewSession(true)}
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
      <div className="px-2.5 py-2 border-t border-[#1d2030] flex flex-col gap-1">
        <button
          onClick={() => setShowNewSession(true)}
          className="w-full py-2.5 rounded-lg border border-[#E8915A]/30 bg-gradient-to-br from-[#E8915A]/[0.09] to-[#E8915A]/[0.03] text-[#E8915A] text-[12.5px] font-semibold flex items-center justify-center gap-1.5 hover:from-[#E8915A]/[0.15] hover:to-[#E8915A]/[0.06] transition-all cursor-pointer"
        >
          ＋ 新建会话
        </button>
        <div className="flex justify-center gap-4 py-1">
          <span
            onClick={onOpenEnvManage}
            className="text-[11px] text-[#4e5270] cursor-pointer"
            onMouseEnter={(e) => e.currentTarget.style.color = '#E8915A'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
          >
            ⚙ 环境管理
          </span>
          <span
            className="text-[11px] text-[#4e5270] cursor-pointer"
            onMouseEnter={(e) => e.currentTarget.style.color = '#8b8fa7'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4e5270'}
          >
            🔑 API Keys
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

      {showNewSession && (
        <NewSessionModal
          envs={envs}
          projects={projects}
          onClose={() => setShowNewSession(false)}
          onCreateSession={(env, agentId, projectId, projectPath) => {
            createSessionWithAgent(env, agentId, projectId, projectPath)
            setShowNewSession(false)
          }}
          onCreateSshSession={(env, agentId, projectId, projectPath, password) => {
            createSshSessionWithAgent(env, agentId, projectId, projectPath, password)
            setShowNewSession(false)
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
    <div className="flex flex-col items-end justify-center gap-0.5 flex-shrink-0 min-h-[34px]">
      <span
        className="text-[8.5px] px-1.5 py-0.5 rounded"
        style={{
          background: s.mode === 'chat' ? 'rgba(192, 132, 252, 0.08)' : 'rgba(96, 165, 250, 0.08)',
          color: s.mode === 'chat' ? '#C084FC' : '#60A5FA',
        }}
      >
        {s.mode === 'chat' ? '💬' : '⌨'}
      </span>
      <span className="text-[9px] min-h-[12px]">
        {s.status === 'connected' && s.statusText && (
          <span className="text-[#4ADE80] font-medium">{s.statusText}</span>
        )}
        {s.status === 'disconnected' && (
          <span className="text-[#60A5FA]">✓ 已断开</span>
        )}
      </span>
    </div>
  )
}

// Password Prompt Modal
function PasswordPromptModal({
  envId: _envId,
  envs: _envs,
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
      setError('请填写所有必填字段')
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
    <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1b1f2b] rounded-2xl w-[420px] border border-[#282d3e] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1d2030]">
          <div className="text-base font-semibold">☁️ 添加 SSH 环境</div>
          <div className="text-xs text-[#4e5270] mt-1">配置远程服务器连接</div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {error && (
            <div className="p-2.5 bg-[#F87171]/10 border border-[#F87171]/30 rounded-lg text-xs text-[#F87171]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1.5">环境名称 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：生产服务器"
              className="w-full px-3.5 py-2.5 bg-[#151820] rounded-lg border border-[#282d3e] text-[#e2e4ed] placeholder-[#4e5270] text-sm outline-none focus:border-[#E8915A]"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#8b8fa7] mb-1.5">主机地址 *</label>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3.5 py-2.5 bg-[#151820] rounded-lg border border-[#282d3e] text-[#e2e4ed] placeholder-[#4e5270] text-sm outline-none focus:border-[#E8915A]"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-[#8b8fa7] mb-1.5">端口</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
                className="w-full px-3.5 py-2.5 bg-[#151820] rounded-lg border border-[#282d3e] text-[#e2e4ed] placeholder-[#4e5270] text-sm outline-none focus:border-[#E8915A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1.5">用户名 *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
              className="w-full px-3.5 py-2.5 bg-[#151820] rounded-lg border border-[#282d3e] text-[#e2e4ed] placeholder-[#4e5270] text-sm outline-none focus:border-[#E8915A]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b8fa7] mb-1.5">认证方式</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAuthType('key')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  authType === 'key'
                    ? 'bg-[#E8915A]/20 border border-[#E8915A]/50 text-[#E8915A]'
                    : 'bg-[#151820] border border-[#282d3e] text-[#8b8fa7] hover:border-[#E8915A]/50'
                }`}
              >
                🔑 密钥
              </button>
              <button
                onClick={() => setAuthType('password')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  authType === 'password'
                    ? 'bg-[#E8915A]/20 border border-[#E8915A]/50 text-[#E8915A]'
                    : 'bg-[#151820] border border-[#282d3e] text-[#8b8fa7] hover:border-[#E8915A]/50'
                }`}
              >
                🔐 密码
              </button>
            </div>
          </div>

          {authType === 'key' && (
            <div>
              <label className="block text-xs text-[#8b8fa7] mb-1.5">私钥路径</label>
              <input
                value={privateKeyPath}
                onChange={(e) => setPrivateKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="w-full px-3.5 py-2.5 bg-[#151820] rounded-lg border border-[#282d3e] text-[#e2e4ed] placeholder-[#4e5270] text-sm font-mono outline-none focus:border-[#E8915A]"
              />
              <div className="text-[10px] text-[#4e5270] mt-1.5">留空则使用默认密钥 (~/.ssh/id_rsa)</div>
            </div>
          )}

          {authType === 'password' && (
            <div className="p-3 bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-lg">
              <div className="text-xs text-[#FBBF24] font-medium">⚠️ 密码认证说明</div>
              <div className="text-[11px] text-[#8b8fa7] mt-1">
                选择密码认证时，每次建立连接都需要输入密码。建议使用密钥认证以获得更好的体验。
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1d2030] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[#282d3e] bg-transparent text-[#8b8fa7] text-sm font-medium hover:bg-[#222738] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-[#E8915A] to-[#D46A28] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? '添加中...' : '添加环境'}
          </button>
        </div>
      </div>
    </div>
  )
}

// New Session Modal - Multi-step wizard
function NewSessionModal({
  envs,
  projects,
  onClose,
  onCreateSession,
  onCreateSshSession: _onCreateSshSession,
}: {
  envs: Env[]
  projects: Project[]
  onClose: () => void
  onCreateSession: (env: Env, agentId: string, projectId?: string, projectPath?: string) => void
  onCreateSshSession: (env: Env, agentId: string, projectId?: string, projectPath?: string, password?: string) => void
}) {
  const [step, setStep] = useState<'intent' | 'project' | 'agent' | 'env'>('intent')
  const [intent, setIntent] = useState<'project' | 'chat' | 'terminal' | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedEnv, setSelectedEnv] = useState<Env | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [browseEnv, setBrowseEnv] = useState<Env | null>(null)
  const [browseDir, setBrowseDir] = useState('')
  const [browseProjectName, setBrowseProjectName] = useState('')
  const [detectedAgents, setDetectedAgents] = useState<AgentInfo[] | null>(null)
  const [scanningAgents, setScanningAgents] = useState(false)

  // Agent definitions
  const PROJECT_AGENTS = AGENTS.filter(a => a.needsProject)
  const CHAT_AGENTS = AGENTS.filter(a => !a.needsProject)

  const scanAgents = async () => {
    // Only scan for local environment for now
    // For SSH/WSL, we need a connected session to scan
    setScanningAgents(true)
    try {
      const agents = await invoke<AgentInfo[]>('scan_agents')
      setDetectedAgents(agents)
    } catch (error) {
      console.error('Failed to scan agents:', error)
      setDetectedAgents(null)
    } finally {
      setScanningAgents(false)
    }
  }

  const reset = () => {
    setStep('intent')
    setIntent(null)
    setSelectedProject(null)
    setSelectedAgent(null)
    setSelectedEnv(null)
    setBrowsing(false)
    setBrowseEnv(null)
    setBrowseDir('')
    setBrowseProjectName('')
    setDetectedAgents(null)
  }

  const goBack = () => {
    if (browsing) {
      setBrowsing(false)
      setBrowseEnv(null)
      setBrowseDir('')
      setBrowseProjectName('')
      return
    }
    if (step === 'agent' && intent === 'project') {
      setStep('project')
      setSelectedAgent(null)
      return
    }
    reset()
  }

  const handleIntent = (i: 'project' | 'chat' | 'terminal') => {
    setIntent(i)
    if (i === 'project') setStep('project')
    else if (i === 'chat') {
      setStep('agent')
      // Auto-select local env and scan agents for chat mode
      const localEnv = envs.find(e => e.type === 'local')
      if (localEnv) {
        setSelectedEnv(localEnv)
        scanAgents()
      }
    }
    else if (i === 'terminal') setStep('env')
  }

  const handlePickProject = (p: Project) => {
    setSelectedProject(p)
    const env = envs.find(e => e.id === p.env_id)
    if (env) {
      setSelectedEnv(env)
      // Scan agents when selecting a local environment
      if (env.type === 'local') {
        scanAgents()
      }
    }
    setStep('agent')
  }

  const handleBrowseConfirm = async () => {
    const path = browseDir.trim()
    const name = browseProjectName.trim()

    if (!browseEnv || !path || !name) return

    // Create project in database
    try {
      const projectId = await invoke<string>('create_project', {
        req: { name, path, env_id: browseEnv.id }
      })

      setSelectedProject({ id: projectId, name, path, env_id: browseEnv.id } as Project)
      setSelectedEnv(browseEnv)
      setBrowsing(false)
      setBrowseDir('')
      setBrowseProjectName('')
      setStep('agent')
    } catch (err) {
      console.error('Failed to create project:', err)
      return
    }
  }

  const handleBrowseDirChange = (value: string) => {
    const previousSuggestedName = getProjectNameFromPath(browseDir)
    const nextSuggestedName = getProjectNameFromPath(value)

    setBrowseDir(value)

    if (!browseProjectName || browseProjectName === previousSuggestedName) {
      setBrowseProjectName(nextSuggestedName)
    }
  }

  const handleLaunch = () => {
    if (intent === 'terminal') {
      // Pure terminal session - requires selectedEnv
      if (!selectedEnv) return
      onCreateSession(selectedEnv, null as any, undefined, undefined)
    } else if (intent === 'chat' && selectedAgent) {
      // AI chat - use selected env or fallback to local env
      const env = selectedEnv || envs.find(e => e.type === 'local')
      if (!env) return
      onCreateSession(env, selectedAgent, undefined, undefined)
    } else if (intent === 'project' && selectedAgent) {
      if (!selectedEnv) return
      onCreateSession(selectedEnv, selectedAgent, selectedProject?.name, selectedProject?.path)
    }
  }

  const canLaunch =
    (intent === 'project' && selectedProject && selectedAgent) ||
    (intent === 'chat' && selectedAgent) ||
    (intent === 'terminal' && selectedEnv)

  const getSummary = () => {
    const parts: string[] = []
    if (selectedEnv) parts.push(`${selectedEnv.type === 'local' ? '💻' : '☁️'} ${selectedEnv.name}`)
    if (selectedProject) parts.push(`📁 ${selectedProject.name}`)
    if (selectedAgent) {
      const agent = AGENTS.find(a => a.id === selectedAgent)
      if (agent) parts.push(agent.name)
    }
    if (intent === 'terminal') parts.push('纯终端')
    return parts.join('  ›  ')
  }

  const getStepTitle = () => {
    if (step === 'intent') return { title: '🚀 新建会话', sub: '你想做什么？' }
    if (step === 'project') {
      if (browsing) return { title: '📂 浏览目录', sub: browseEnv ? '输入工作目录路径' : '在哪个环境上？' }
      return { title: '📁 选择项目', sub: '选择一个工作目录，或浏览新目录' }
    }
    if (step === 'agent') {
      if (intent === 'project') {
        return { title: '🤖 选择 Agent', sub: `项目: ${selectedProject?.name} · ${selectedEnv?.type === 'local' ? '💻' : '☁️'} ${selectedEnv?.name}` }
      }
      return { title: '🤖 选择 Agent', sub: '选择一个 AI 对话助手' }
    }
    if (step === 'env') return { title: '🖥 选择环境', sub: '连接到哪台机器？' }
    return { title: '🚀 新建会话', sub: '' }
  }

  const t = getStepTitle()

  return (
    <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 backdrop-blur-sm">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] bg-[#1b1f2b] border border-[#282d3e] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1d2030] flex-shrink-0">
          <div className="text-base font-semibold">{t.title}</div>
          <div className="text-xs text-[#4e5270] mt-1">{t.sub}</div>
        </div>

        {/* Breadcrumb */}
        {step !== 'intent' && (
          <div className="px-5 py-2 border-b border-[#1d2030] flex items-center gap-2 text-[11px] text-[#4e5270] flex-shrink-0">
            <span
              onClick={reset}
              className="cursor-pointer hover:text-[#E8915A]"
            >
              {intent === 'project' ? '📁 项目编码' : intent === 'chat' ? '💬 AI 对话' : '🖥 纯终端'}
            </span>
            {step === 'agent' && selectedProject && (
              <>
                <span>›</span>
                <span
                  onClick={() => { setStep('project'); setSelectedAgent(null); }}
                  className="cursor-pointer hover:text-[#E8915A]"
                >
                  {selectedProject.name}
                </span>
              </>
            )}
            {selectedAgent && (
              <>
                <span>›</span>
                <span style={{ color: AGENTS.find(a => a.id === selectedAgent)?.color }}>
                  {AGENTS.find(a => a.id === selectedAgent)?.name}
                </span>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-5 flex flex-col gap-2 overflow-y-auto flex-1">
          {/* Step: Intent */}
          {step === 'intent' && (
            <>
              <IntentCard
                icon="📁"
                title="在项目中编码"
                desc="选择目录 → 选择 Agent → 开始编码"
                onClick={() => handleIntent('project')}
              />
              <IntentCard
                icon="💬"
                title="开一个 AI 对话"
                desc="无需项目目录，直接与 AI 交流"
                onClick={() => handleIntent('chat')}
              />
              <IntentCard
                icon="🖥️"
                title="打开纯终端"
                desc="SSH / 本地 Shell，不启动 Agent"
                onClick={() => handleIntent('terminal')}
              />
            </>
          )}

          {/* Step: Pick Project */}
          {step === 'project' && !browsing && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-1">最近使用的项目</div>
              {projects.slice(0, 5).map((p) => {
                const env = envs.find(e => e.id === p.env_id)
                const isOffline = env?.status === 'offline'
                return (
                  <div
                    key={p.id}
                    onClick={() => !isOffline && handlePickProject(p)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer bg-[#151820] border border-transparent hover:border-[#282d3e] ${isOffline ? 'opacity-40 cursor-default' : ''}`}
                  >
                    <span className="text-sm">📁</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium font-mono">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b1f2b] text-[#4e5270]">
                          {env?.type === 'local' ? '💻' : '☁️'} {env?.name}
                        </span>
                        <span className="text-[10px] text-[#4e5270] font-mono">{p.path}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Browse new directory */}
              <div
                onClick={() => setBrowsing(true)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer border border-dashed border-[#282d3e] text-[#8b8fa7] hover:border-[#E8915A] hover:text-[#E8915A] transition-colors mt-2"
              >
                <span className="text-base">📂</span>
                <div>
                  <div className="text-[13px] font-medium">浏览新目录...</div>
                  <div className="text-[11px] text-[#4e5270]">选择环境，输入路径，自动记为项目</div>
                </div>
              </div>
            </>
          )}

          {/* Sub-flow: Browse directory */}
          {step === 'project' && browsing && !browseEnv && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-1">选择环境</div>
              {envs.map((e) => (
                <EnvCard
                  key={e.id}
                  env={e}
                  selected={false}
                  disabled={e.status === 'offline'}
                  onClick={() => setBrowseEnv(e)}
                />
              ))}
            </>
          )}

          {step === 'project' && browsing && browseEnv && (
            <>
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#151820]">
                <span className="text-base">{browseEnv.type === 'local' ? '💻' : '☁️'}</span>
                <span className="text-[13px] font-medium">{browseEnv.name}</span>
                <span
                  onClick={() => setBrowseEnv(null)}
                  className="ml-auto text-[11px] text-[#4e5270] cursor-pointer hover:text-[#E8915A]"
                >
                  更换
                </span>
              </div>

              <div className="mt-2">
                <div className="text-[11px] text-[#4e5270] mb-2">输入工作目录的绝对路径</div>
                <input
                  value={browseDir}
                  onChange={(e) => handleBrowseDirChange(e.target.value)}
                  placeholder="~/my-project  或  /home/user/project"
                  className="w-full px-4 py-3 rounded-lg border border-[#282d3e] bg-[#151820] text-[#e2e4ed] font-mono text-[13px] outline-none focus:border-[#E8915A]"
                  autoFocus
                />
                <div className="text-[11px] text-[#4e5270] mb-2 mt-3">Project name</div>
                <input
                  value={browseProjectName}
                  onChange={(e) => setBrowseProjectName(e.target.value)}
                  placeholder="my-project"
                  className="w-full px-4 py-3 rounded-lg border border-[#282d3e] bg-[#151820] text-[#e2e4ed] text-[13px] outline-none focus:border-[#E8915A]"
                />
                {browseDir.trim() && (
                  <div className="mt-3 px-4 py-3 rounded-lg bg-[#151820] border border-[#1d2030]">
                    <div className="text-[11px] text-[#4e5270] mb-2">将创建为项目</div>
                    <div className="flex items-center gap-2">
                      <span>📁</span>
                      <span className="text-[13px] font-mono font-medium">{browseProjectName.trim() || getProjectNameFromPath(browseDir)}</span>
                      <span className="text-[11px] text-[#4e5270]">on {browseEnv.type === 'local' ? '💻' : '☁️'} {browseEnv.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step: Pick Agent (for project) */}
          {step === 'agent' && intent === 'project' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#151820] mb-2">
                <span>📁</span>
                <span className="text-[12px] font-mono font-medium">{selectedProject?.name}</span>
                <span className="text-[10px] text-[#4e5270]">{selectedEnv?.type === 'local' ? '💻' : '☁️'} {selectedEnv?.name} · {selectedProject?.path}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270]">选择 Agent</div>
                {scanningAgents && (
                  <span className="text-[10px] text-[#4e5270] animate-pulse">扫描中...</span>
                )}
              </div>
              {PROJECT_AGENTS.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  selected={selectedAgent === a.id}
                  onClick={() => setSelectedAgent(a.id)}
                  detectedInfo={detectedAgents?.find(d => d.id === a.id)}
                />
              ))}
            </>
          )}

          {/* Step: Pick Agent (for chat) */}
          {step === 'agent' && intent === 'chat' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270]">选择 Agent</div>
                {scanningAgents && (
                  <span className="text-[10px] text-[#4e5270] animate-pulse">扫描中...</span>
                )}
              </div>
              {CHAT_AGENTS.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  selected={selectedAgent === a.id}
                  onClick={() => setSelectedAgent(a.id)}
                  detectedInfo={detectedAgents?.find(d => d.id === a.id)}
                />
              ))}

              {selectedAgent && (
                <>
                  <div className="h-px bg-[#1d2030] my-2" />
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-1">运行环境（可选）</div>
                  <div className="text-[11px] text-[#4e5270] mb-1">独立对话默认本地运行，也可以选择远程环境</div>
                  {envs.filter(e => e.status === 'online').map((e) => (
                    <EnvCard
                      key={e.id}
                      env={e}
                      selected={selectedEnv?.id === e.id}
                      onClick={() => setSelectedEnv(selectedEnv?.id === e.id ? null : e)}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* Step: Pick Env (for terminal) */}
          {step === 'env' && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-1">选择环境</div>
              {envs.map((e) => (
                <EnvCard
                  key={e.id}
                  env={e}
                  selected={selectedEnv?.id === e.id}
                  disabled={e.status === 'offline'}
                  onClick={() => setSelectedEnv(e)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1d2030] flex items-center gap-3 flex-shrink-0">
          <button
            onClick={step === 'intent' ? onClose : goBack}
            className="px-4 py-2 rounded-lg border border-[#282d3e] bg-transparent text-[#8b8fa7] text-[12px] font-medium hover:bg-[#222738] transition-colors"
          >
            {step === 'intent' ? '取消' : '← 返回'}
          </button>

          <div className="flex-1 text-[11px] text-[#4e5270] font-mono text-center truncate">
            {getSummary()}
          </div>

          {browsing && browseEnv && browseDir.trim() && browseProjectName.trim() ? (
            <button
              onClick={handleBrowseConfirm}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#E8915A] to-[#D46A28] text-white text-[12px] font-semibold shadow-lg"
            >
              确认目录 →
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={!canLaunch}
              className={`px-5 py-2 rounded-lg text-[12px] font-semibold ${
                canLaunch
                  ? 'bg-gradient-to-r from-[#E8915A] to-[#D46A28] text-white shadow-lg'
                  : 'bg-[#222738] text-[#4e5270]'
              }`}
            >
              🚀 启动
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Intent Card Component
function IntentCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer bg-[#151820] border border-transparent hover:border-[#E8915A] hover:bg-[#1b1f2b] transition-all"
    >
      <span className="text-[28px] w-11 text-center">{icon}</span>
      <div className="flex-1">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[12px] text-[#4e5270] mt-0.5">{desc}</div>
      </div>
      <span className="text-sm text-[#4e5270]">→</span>
    </div>
  )
}

// Agent Card Component
function AgentCard({ agent, selected, onClick, detectedInfo }: {
  agent: typeof AGENTS[0];
  selected: boolean;
  onClick: () => void;
  detectedInfo?: AgentInfo | null;
}) {
  const isInstalled = detectedInfo?.installed ?? null
  const version = detectedInfo?.version

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors ${
        selected
          ? 'bg-[#E8915A]/[0.09] border border-[#E8915A]/60'
          : 'bg-[#151820] border border-transparent hover:border-[#282d3e]'
      }`}
    >
      <div className="w-1.5 h-5.5 rounded" style={{ backgroundColor: agent.color }} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-medium">{agent.name}</div>
          {isInstalled === true && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
              已安装
            </span>
          )}
          {isInstalled === false && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400">
              未找到
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-[#4e5270]">{agent.short}</div>
          {version && (
            <div className="text-[10px] text-[#6b7280] font-mono">{version}</div>
          )}
        </div>
      </div>
      {selected && <span style={{ color: agent.color }} className="text-base">✓</span>}
    </div>
  )
}

// Env Card Component
function EnvCard({ env, selected, disabled, onClick }: { env: Env; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${
        disabled ? 'cursor-default opacity-35' : 'cursor-pointer'
      } ${
        selected
          ? 'bg-[#E8915A]/[0.12] border border-[#E8915A]/60'
          : 'bg-[#151820] border border-transparent hover:border-[#282d3e]'
      } transition-colors`}
    >
      <span className="text-lg">{env.type === 'local' ? '💻' : '☁️'}</span>
      <div className="flex-1">
        <div className="text-[13px] font-medium">{env.name}</div>
        <div className="text-[10px] text-[#4e5270] font-mono">{env.host || 'localhost'}</div>
      </div>
      {disabled && <span className="text-[10px] text-[#F87171]">离线</span>}
      {!disabled && (
        <div className="w-[7px] h-[7px] rounded-full bg-[#4ADE80] shadow-sm shadow-[#4ADE80]" />
      )}
      {selected && <span className="text-[#E8915A] text-base">✓</span>}
    </div>
  )
}
