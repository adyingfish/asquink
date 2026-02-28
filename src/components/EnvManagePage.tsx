import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Env, Project, SessionRecord, AgentInfo } from '../App'

// Agent definitions with colors
const AGENTS = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A', needsProject: true },
  { id: 'codex', name: 'Codex', short: 'Codex', color: '#E5E7EB', needsProject: true },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA', needsProject: true },
  { id: 'opencode', name: 'OpenCode', short: 'OpenCode', color: '#78716C', needsProject: true },
  { id: 'openclaw', name: 'OpenClaw', short: 'OpenClaw', color: '#EF4444', needsProject: false },
]

// WSL Distro interface
interface WslDistro {
  name: string
  is_default: boolean
  state: string
  version: number
}

interface EnvManagePageProps {
  onBack: () => void
  onEnvChange?: () => void
}

export default function EnvManagePage({ onBack, onEnvChange }: EnvManagePageProps) {
  const [envs, setEnvs] = useState<Env[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [showAddEnv, setShowAddEnv] = useState(false)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [connectionResult, setConnectionResult] = useState<{ id: string; success: boolean; message: string } | null>(null)
  const [addEnvType, setAddEnvType] = useState<'ssh' | 'wsl'>('ssh')
  const [wslDistros, setWslDistros] = useState<WslDistro[]>([])
  const [wslInstalled, setWslInstalled] = useState(false)
  const [addEnvForm, setAddEnvForm] = useState({
    name: '',
    host: '',
    port: '22',
    username: '',
    auth_type: 'key' as 'key' | 'password',
    private_key_path: '',
    wsl_distro: '',
    wsl_user: '',
  })
  const [detectedAgents, setDetectedAgents] = useState<AgentInfo[] | null>(null)
  const [scanningAgents, setScanningAgents] = useState(false)

  useEffect(() => {
    loadData()
    checkWsl()
  }, [])

  const loadData = async () => {
    try {
      const [envList, projectList, sessionList] = await Promise.all([
        invoke<Env[]>('list_envs'),
        invoke<Project[]>('list_projects'),
        invoke<SessionRecord[]>('list_sessions'),
      ])
      setEnvs(envList)
      setProjects(projectList)
      setSessions(sessionList)
      if (envList.length > 0 && !selectedEnvId) {
        setSelectedEnvId(envList[0].id)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const checkWsl = async () => {
    try {
      const installed = await invoke<boolean>('check_wsl_installed')
      setWslInstalled(installed)
      if (installed) {
        const distros = await invoke<WslDistro[]>('list_wsl_distros')
        setWslDistros(distros)
      }
    } catch (error) {
      console.error('Failed to check WSL:', error)
      setWslInstalled(false)
    }
  }

  const selectedEnv = envs.find(e => e.id === selectedEnvId)
  const envProjects = projects.filter(p => p.env_id === selectedEnvId)
  const envSessions = sessions.filter(s => s.env_id === selectedEnvId)

  const scanAgents = async () => {
    if (!selectedEnv || selectedEnv.type !== 'local') {
      setDetectedAgents(null)
      return
    }
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

  // Scan agents when selected environment changes
  useEffect(() => {
    scanAgents()
  }, [selectedEnvId])

  const deleteEnv = async (id: string) => {
    if (!confirm('确定删除此环境？所有关联会话也会被移除。')) return
    try {
      await invoke('delete_env', { id })
      loadData()
      onEnvChange?.()
    } catch (error) {
      console.error('Failed to delete env:', error)
    }
  }

  const testConnection = async (env: Env) => {
    setTestingConnection(env.id)
    setConnectionResult(null)

    try {
      const status = await invoke<string>('check_env_status', { id: env.id })
      setConnectionResult({
        id: env.id,
        success: status === 'online',
        message: status === 'online' ? '连接成功' : '连接失败',
      })
      // Reload to update status
      loadData()
    } catch (error) {
      setConnectionResult({
        id: env.id,
        success: false,
        message: '连接失败: ' + error,
      })
    } finally {
      setTestingConnection(null)
    }
  }

  const handleAddEnv = async () => {
    if (addEnvType === 'ssh') {
      if (!addEnvForm.name || !addEnvForm.host) {
        alert('请填写环境名称和主机地址')
        return
      }
    } else {
      if (!addEnvForm.name || !addEnvForm.wsl_distro) {
        alert('请填写环境名称并选择 WSL 发行版')
        return
      }
    }

    try {
      if (addEnvType === 'ssh') {
        await invoke('create_env', {
          req: {
            name: addEnvForm.name,
            type: 'ssh',
            host: addEnvForm.host,
            port: parseInt(addEnvForm.port) || 22,
            username: addEnvForm.username || 'root',
            auth_type: addEnvForm.auth_type,
            private_key_path: addEnvForm.private_key_path || null,
            icon: 'cloud',
          }
        })
      } else {
        await invoke('create_env', {
          req: {
            name: addEnvForm.name,
            type: 'wsl',
            wsl_distro: addEnvForm.wsl_distro,
            wsl_user: addEnvForm.wsl_user || null,
            icon: 'linux',
          }
        })
      }
      setShowAddEnv(false)
      setAddEnvType('ssh')
      setAddEnvForm({
        name: '',
        host: '',
        port: '22',
        username: '',
        auth_type: 'key',
        private_key_path: '',
        wsl_distro: '',
        wsl_user: '',
      })
      loadData()
      onEnvChange?.()
    } catch (error) {
      console.error('Failed to create env:', error)
      alert('创建环境失败: ' + error)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#08090d]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1d2030] flex items-center gap-3">
        <span
          onClick={onBack}
          className="text-sm text-[#4e5270] cursor-pointer px-2 py-1 rounded-md hover:bg-[#222738] hover:text-[#E8915A] transition-colors"
        >
          ←
        </span>
        <div>
          <div className="text-base font-semibold">⚙ 环境管理</div>
          <div className="text-[11px] text-[#4e5270] mt-0.5">管理服务器和本地连接</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Env list */}
        <div className="w-[260px] border-r border-[#1d2030] overflow-y-auto p-3">
          {[...envs].sort((a, b) => {
            // Local environment always first, WSL second, SSH last
            if (a.type === 'local') return -1
            if (b.type === 'local') return 1
            if (a.type === 'wsl') return -1
            if (b.type === 'wsl') return 1
            return 0
          }).map(env => {
            const isSelected = selectedEnvId === env.id
            const isLocal = env.type === 'local'
            const isWsl = env.type === 'wsl'
            const envIcon = isLocal ? '💻' : isWsl ? '🐧' : '☁️'
            const envDetail = isLocal ? (env.detail || 'localhost') : isWsl ? (env.wsl_distro || 'WSL') : (env.host || '-')
            return (
              <div
                key={env.id}
                onClick={() => setSelectedEnvId(env.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors ${
                  isSelected
                    ? 'bg-[#E8915A]/12 border border-[#E8915A]/40'
                    : 'border border-transparent hover:bg-[#222738]'
                }`}
              >
                <span className="text-xl">{envIcon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{env.name}</div>
                  <div className="text-[10.5px] text-[#4e5270] font-mono truncate">
                    {envDetail}
                  </div>
                </div>
                <div
                  className={`w-[7px] h-[7px] rounded-full ${
                    env.status === 'online'
                      ? 'bg-[#4ADE80] shadow-sm shadow-[#4ADE80]'
                      : 'bg-[#F87171] shadow-sm shadow-[#F87171]'
                  }`}
                />
              </div>
            )
          })}

          <div
            onClick={() => setShowAddEnv(true)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg mt-2 border border-dashed border-[#282d3e] cursor-pointer text-[#4e5270] text-sm hover:border-[#E8915A] hover:text-[#E8915A] transition-colors"
          >
            <span className="text-base w-7 text-center">＋</span>
            <span>添加新环境</span>
          </div>
        </div>

        {/* Right: Env detail */}
        {selectedEnv && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="w-12 h-12 rounded-xl bg-[#1b1f2b] flex items-center justify-center text-3xl border border-[#282d3e]">
                {selectedEnv.type === 'local' ? '💻' : selectedEnv.type === 'wsl' ? '🐧' : '☁️'}
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold flex items-center gap-2">
                  {selectedEnv.name}
                  <div
                    className={`w-2 h-2 rounded-full ${
                      selectedEnv.status === 'online'
                        ? 'bg-[#4ADE80] shadow-sm shadow-[#4ADE80]'
                        : 'bg-[#F87171] shadow-sm shadow-[#F87171]'
                    }`}
                  />
                </div>
                <div className="text-xs text-[#4e5270] font-mono mt-0.5">
                  {selectedEnv.type === 'local' ? 'Local' : selectedEnv.type === 'wsl' ? 'WSL' : 'SSH'} · {selectedEnv.type === 'wsl' ? (selectedEnv.wsl_distro || '-') : (selectedEnv.detail || selectedEnv.host || 'localhost')}
                  {selectedEnv.type === 'ssh' && selectedEnv.port && `:${selectedEnv.port}`}
                </div>
              </div>
              {selectedEnv.type !== 'local' && (
                <div className="flex items-center gap-3">
                  {connectionResult?.id === selectedEnv.id && (
                    <div className={`text-xs px-3 py-1.5 rounded-lg ${connectionResult.success ? 'bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/30' : 'bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30'}`}>
                      {connectionResult.success ? '✓' : '✗'} {connectionResult.message}
                    </div>
                  )}
                  <button
                    onClick={() => testConnection(selectedEnv)}
                    disabled={testingConnection === selectedEnv.id}
                    className="px-4 py-2.5 rounded-lg border border-[#282d3e] bg-transparent text-[#8b8fa7] text-xs font-medium cursor-pointer hover:border-[#E8915A] hover:text-[#E8915A] transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {testingConnection === selectedEnv.id ? '⏳ 测试中...' : '🔗 测试连接'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Connection info */}
              <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-3">🔗 连接</div>
                <Field label="类型" value={selectedEnv.type === 'local' ? 'Local' : selectedEnv.type === 'wsl' ? 'WSL' : 'SSH'} />
                {selectedEnv.type === 'wsl' ? (
                  <>
                    {selectedEnv.wsl_distro && <Field label="发行版" value={selectedEnv.wsl_distro} />}
                    {selectedEnv.wsl_user && <Field label="用户" value={selectedEnv.wsl_user} />}
                  </>
                ) : (
                  <>
                    {selectedEnv.host && <Field label="地址" value={selectedEnv.host} />}
                    {selectedEnv.port && <Field label="端口" value={String(selectedEnv.port)} />}
                    {selectedEnv.username && <Field label="用户" value={selectedEnv.username} />}
                  </>
                )}
              </div>

              {/* System info */}
              <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-3">💻 系统</div>
                <Field label="系统" value={selectedEnv.detail || '-'} />
                <Field label="会话" value={`${envSessions.length} 个`} />
              </div>
            </div>

            {/* Projects on this env */}
            {envProjects.length > 0 && (
              <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4 mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-3">📁 此环境上的项目</div>
                {envProjects.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.75 rounded-lg bg-[#1b1f2b] mb-1.5">
                    <span className="text-sm">📁</span>
                    <div className="flex-1">
                      <div className="text-xs font-medium font-mono">{p.name}</div>
                      <div className="text-[10px] text-[#4e5270] font-mono">{p.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Agents on this env */}
            <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270]">🤖 此环境上的 Agent</div>
                {scanningAgents && (
                  <span className="text-[10px] text-[#4e5270] animate-pulse">扫描中...</span>
                )}
                {selectedEnv?.type === 'local' && !scanningAgents && (
                  <button
                    onClick={scanAgents}
                    className="text-[10px] text-[#8b8fa7] hover:text-[#E8915A] transition-colors"
                  >
                    重新扫描
                  </button>
                )}
              </div>

              {(() => {
                // Separate OpenClaw from others
                const openClawAgent = AGENTS.find(a => a.id === 'openclaw')!
                const mainAgents = AGENTS.filter(a => a.id !== 'openclaw')

                // Sort main agents in fixed order: claude > codex > gemini > opencode
                const sortedMainAgents = [
                  mainAgents.find(a => a.id === 'claude')!,
                  mainAgents.find(a => a.id === 'codex')!,
                  mainAgents.find(a => a.id === 'gemini')!,
                  mainAgents.find(a => a.id === 'opencode')!,
                ].filter(Boolean)

                // Split into installed and not installed
                const installedMainAgents = sortedMainAgents.filter(a => {
                  const detected = detectedAgents?.find(d => d.id === a.id)
                  return detected?.installed === true
                })
                const notInstalledMainAgents = sortedMainAgents.filter(a => {
                  const detected = detectedAgents?.find(d => d.id === a.id)
                  return detected?.installed !== true
                })

                // Render helper
                const renderAgent = (agent: typeof AGENTS[0]) => {
                  const detected = detectedAgents?.find(d => d.id === agent.id)
                  const isInstalled = detected?.installed ?? null
                  const sessionCount = envSessions.filter(s => s.agent_id === agent.id).length

                  return (
                    <div key={agent.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#1b1f2b] mb-1.5">
                      <div className="w-1.5 h-5 rounded" style={{ backgroundColor: agent.color }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-medium">{agent.name}</div>
                          {isInstalled === true ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                              已安装
                            </span>
                          ) : isInstalled === false ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400">
                              未找到
                            </span>
                          ) : selectedEnv?.type === 'local' ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                              -
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                              仅本地环境
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {detected?.version && (
                            <div className="text-[10px] text-[#6b7280] font-mono">{detected.version}</div>
                          )}
                          {sessionCount > 0 && (
                            <div className="text-[10px] text-[#4e5270]">
                              {sessionCount} 个会话
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: `${agent.color}20`, color: agent.color }}>
                        {agent.short}
                      </span>
                    </div>
                  )
                }

                return (
                  <>
                    {/* Installed main agents */}
                    {installedMainAgents.map(renderAgent)}

                    {/* Divider if both sections have content */}
                    {installedMainAgents.length > 0 && notInstalledMainAgents.length > 0 && (
                      <div className="h-px bg-[#1d2030] my-3" />
                    )}

                    {/* Not installed main agents */}
                    {notInstalledMainAgents.map(renderAgent)}

                    {/* Divider before OpenClaw */}
                    <div className="h-px bg-[#1d2030] my-3" />

                    {/* OpenClaw - always at bottom */}
                    {renderAgent(openClawAgent)}
                  </>
                )
              })()}
            </div>

            {/* Danger zone */}
            {selectedEnv.type !== 'local' && (
              <div className="bg-[#F87171]/5 rounded-xl border border-[#F87171]/20 p-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium">删除此环境</div>
                    <div className="text-[11px] text-[#4e5270] mt-0.5">断开并移除所有关联会话</div>
                  </div>
                  <button
                    onClick={() => deleteEnv(selectedEnv.id)}
                    className="px-3.5 py-1.5 rounded-lg border border-[#F87171]/40 bg-transparent text-[#F87171] text-xs cursor-pointer hover:bg-[#F87171]/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Env Modal */}
      {showAddEnv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0f1117] rounded-lg p-5 w-[420px] border border-[#1e2130]">
            <h3 className="text-lg font-semibold mb-4">添加新环境</h3>

            {/* Environment Type Selection */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAddEnvType('ssh')}
                className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                  addEnvType === 'ssh'
                    ? 'bg-[#E8915A]/20 border border-[#E8915A] text-[#E8915A]'
                    : 'bg-[#161822] border border-[#282d3e] text-[#8b8fa7]'
                }`}
              >
                ☁️ SSH
              </button>
              {wslInstalled && (
                <button
                  onClick={() => setAddEnvType('wsl')}
                  className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                    addEnvType === 'wsl'
                      ? 'bg-[#E8915A]/20 border border-[#E8915A] text-[#E8915A]'
                      : 'bg-[#161822] border border-[#282d3e] text-[#8b8fa7]'
                  }`}
                >
                  🐧 WSL
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b8fa7] mb-1">环境名称 *</label>
                <input
                  type="text"
                  value={addEnvForm.name}
                  onChange={e => setAddEnvForm({ ...addEnvForm, name: e.target.value })}
                  placeholder={addEnvType === 'wsl' ? '例如：Ubuntu 开发环境' : '例如：生产服务器'}
                  className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                />
              </div>

              {addEnvType === 'ssh' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-[#8b8fa7] mb-1">主机地址 *</label>
                      <input
                        type="text"
                        value={addEnvForm.host}
                        onChange={e => setAddEnvForm({ ...addEnvForm, host: e.target.value })}
                        placeholder="192.168.1.100"
                        className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8b8fa7] mb-1">端口</label>
                      <input
                        type="text"
                        value={addEnvForm.port}
                        onChange={e => setAddEnvForm({ ...addEnvForm, port: e.target.value })}
                        placeholder="22"
                        className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8b8fa7] mb-1">用户名</label>
                    <input
                      type="text"
                      value={addEnvForm.username}
                      onChange={e => setAddEnvForm({ ...addEnvForm, username: e.target.value })}
                      placeholder="root"
                      className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8b8fa7] mb-1">认证方式</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAddEnvForm({ ...addEnvForm, auth_type: 'key' })}
                        className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                          addEnvForm.auth_type === 'key'
                            ? 'bg-[#E8915A]/20 border border-[#E8915A] text-[#E8915A]'
                            : 'bg-[#161822] border border-[#282d3e] text-[#8b8fa7]'
                        }`}
                      >
                        密钥
                      </button>
                      <button
                        onClick={() => setAddEnvForm({ ...addEnvForm, auth_type: 'password' })}
                        className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                          addEnvForm.auth_type === 'password'
                            ? 'bg-[#E8915A]/20 border border-[#E8915A] text-[#E8915A]'
                            : 'bg-[#161822] border border-[#282d3e] text-[#8b8fa7]'
                        }`}
                      >
                        密码
                      </button>
                    </div>
                  </div>

                  {addEnvForm.auth_type === 'key' && (
                    <div>
                      <label className="block text-xs text-[#8b8fa7] mb-1">私钥路径</label>
                      <input
                        type="text"
                        value={addEnvForm.private_key_path}
                        onChange={e => setAddEnvForm({ ...addEnvForm, private_key_path: e.target.value })}
                        placeholder="~/.ssh/id_rsa"
                        className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* WSL Form */}
                  <div>
                    <label className="block text-xs text-[#8b8fa7] mb-1">WSL 发行版 *</label>
                    <select
                      value={addEnvForm.wsl_distro}
                      onChange={e => setAddEnvForm({ ...addEnvForm, wsl_distro: e.target.value })}
                      className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                    >
                      <option value="">选择发行版...</option>
                      {wslDistros.map(d => (
                        <option key={d.name} value={d.name}>
                          {d.name} {d.is_default ? '(默认)' : ''} - {d.state}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8b8fa7] mb-1">默认用户 (可选)</label>
                    <input
                      type="text"
                      value={addEnvForm.wsl_user}
                      onChange={e => setAddEnvForm({ ...addEnvForm, wsl_user: e.target.value })}
                      placeholder="留空使用默认用户"
                      className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setShowAddEnv(false)
                  setAddEnvType('ssh')
                  setAddEnvForm({
                    name: '',
                    host: '',
                    port: '22',
                    username: '',
                    auth_type: 'key',
                    private_key_path: '',
                    wsl_distro: '',
                    wsl_user: '',
                  })
                }}
                className="flex-1 px-3 py-2 bg-[#161822] rounded text-sm hover:bg-[#1e2130] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddEnv}
                className="flex-1 px-3 py-2 bg-[#E8915A] rounded text-sm text-white hover:bg-[#d07a47] transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#1d2030] last:border-b-0">
      <span className="text-xs text-[#8b8fa7]">{label}</span>
      <span className="text-xs font-mono font-medium">{value}</span>
    </div>
  )
}
