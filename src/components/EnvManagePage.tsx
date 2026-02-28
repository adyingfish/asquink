import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Env, Project, SessionRecord, AgentInfo } from '../App'

// Agent definitions with colors - for ACP Agent management
const AGENT_REGISTRY: Record<string, { name: string; color: string; icon: string; install: string; docs: string }> = {
  claude:   { name: "Claude Code",  color: "#E8915A", icon: "🟠", install: "npm install -g @anthropic-ai/claude-code", docs: "https://docs.anthropic.com/claude-code" },
  codex:    { name: "Codex CLI",    color: "#4ADE80", icon: "🟢", install: "npm install -g @openai/codex",             docs: "https://github.com/openai/codex" },
  gemini:   { name: "Gemini CLI",   color: "#60A5FA", icon: "🔵", install: "npm install -g @google/gemini-cli",        docs: "https://github.com/google/gemini-cli" },
  opencode: { name: "OpenCode",     color: "#F472B6", icon: "🟣", install: "npm install -g opencode",                  docs: "https://github.com/opencode-ai/opencode" },
}

// Agent definitions with colors - for env agent scanning
const AGENTS = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A', needsProject: true },
  { id: 'codex', name: 'Codex', short: 'Codex', color: '#E5E7EB', needsProject: true },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA', needsProject: true },
  { id: 'opencode', name: 'OpenCode', short: 'OpenCode', color: '#78716C', needsProject: true },
  { id: 'openclaw', name: 'OpenClaw', short: 'OpenClaw', color: '#EF4444', needsProject: false },
]

// ACP Agent state type
interface AcpAgent {
  id: string
  status: 'connected' | 'disconnected' | 'not_installed'
  endpoint: string
  protocol: string
  version: string
  pid: number | null
  models: string[]
  activeModel: string | null
  apiKey: string | null
  keyStatus: 'valid' | 'missing' | 'invalid'
  balance: string
  monthUsage: string
}

// Mock ACP Agents data (will be replaced with real data from backend later)
const MOCK_ACP_AGENTS: AcpAgent[] = [
  { id: "claude", status: "connected", endpoint: "localhost:7862", protocol: "ACP/1.2", version: "1.0.23", pid: 48210, models: ["sonnet-4", "opus-4"], activeModel: "sonnet-4", apiKey: "sk-ant-···········4f2m", keyStatus: "valid", balance: "$152.30", monthUsage: "$34.20" },
  { id: "codex", status: "connected", endpoint: "localhost:7863", protocol: "ACP/1.1", version: "0.9.4", pid: 48315, models: ["o3", "o4-mini"], activeModel: "o3", apiKey: "sk-proj-···········x8kn", keyStatus: "valid", balance: "$28.50", monthUsage: "$12.80" },
  { id: "gemini", status: "disconnected", endpoint: "—", protocol: "ACP/1.2", version: "2.1.0", pid: null, models: ["gemini-2.5-pro"], activeModel: "gemini-2.5-pro", apiKey: null, keyStatus: "missing", balance: "—", monthUsage: "—" },
  { id: "opencode", status: "not_installed", endpoint: "—", protocol: "—", version: "—", pid: null, models: [], activeModel: null, apiKey: null, keyStatus: "missing", balance: "—", monthUsage: "—" },
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

// Badge component for status display
const Badge = ({ status }: { status: string }) => {
  const m: Record<string, { bg: string; c: string; t: string }> = {
    connected: { bg: "#4ADE8015", c: "#4ADE80", t: "● 已连接" },
    disconnected: { bg: "#FBBF2415", c: "#FBBF24", t: "○ 未连接" },
    not_installed: { bg: "#4e527015", c: "#4e5270", t: "✗ 未安装" },
    valid: { bg: "#4ADE8015", c: "#4ADE80", t: "✓ 有效" },
    missing: { bg: "#F8717112", c: "#F87171", t: "✗ 未配置" },
    invalid: { bg: "#F8717112", c: "#F87171", t: "✗ 无效" },
  }
  const s = m[status] || m.disconnected
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: s.bg, color: s.c, fontWeight: 500, whiteSpace: "nowrap" }}>{s.t}</span>
}

// ACP Agent Detail component
function AgentDetail({ agent }: { agent: AcpAgent }) {
  const reg = AGENT_REGISTRY[agent.id]
  const isInstalled = agent.status !== "not_installed"
  const isConnected = agent.status === "connected"
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex-1 overflow-y-auto p-7">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
          style={{ background: `${reg.color}18`, border: `1px solid ${reg.color}40` }}
        >
          {reg.icon}
        </div>
        <div className="flex-1">
          <div className="text-lg font-semibold flex items-center gap-2.5">
            {reg.name}
            <Badge status={agent.status} />
          </div>
          <div className="text-xs text-[#4e5270] mt-0.5 font-mono">
            {isConnected && <span>{agent.endpoint} · PID {agent.pid} · v{agent.version}</span>}
            {!isConnected && isInstalled && <span>本地已安装，未运行</span>}
            {!isInstalled && <span>本地未安装</span>}
          </div>
        </div>
        {isConnected && (
          <button className="px-3.5 py-2 rounded-lg border border-[#282d3e] bg-transparent text-[#8b8fa7] text-xs cursor-pointer hover:border-[#F87171] hover:text-[#F87171] transition-colors">
            断开
          </button>
        )}
        {!isConnected && isInstalled && (
          <button
            className="px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{ border: `1px solid ${reg.color}50`, background: `${reg.color}12`, color: reg.color }}
          >
            🔗 连接
          </button>
        )}
      </div>

      {/* Not installed state */}
      {!isInstalled && (
        <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-8 text-center">
          <div className="text-4xl mb-3.5">📦</div>
          <div className="text-base font-medium mb-2">{reg.name} 尚未安装</div>
          <div className="text-xs text-[#4e5270] leading-relaxed max-w-[400px] mx-auto mb-4.5">
            在本地终端安装后，ASquink 会通过 ACP 自动检测并连接。
            <br />连接后即可在任意环境的会话中使用。
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#08090d] border border-[#1d2030]">
            <span className="font-mono text-sm text-[#8b8fa7]">$ {reg.install}</span>
            <span
              onClick={() => copyToClipboard(reg.install)}
              className="text-[10px] px-2 py-1 rounded bg-[#1b1f2b] font-medium cursor-pointer transition-colors"
              style={{ color: copied ? "#4ADE80" : "#4e5270" }}
            >
              {copied ? "✓ 已复制" : "📋 复制"}
            </span>
          </div>
          <div className="mt-3.5">
            <a href={reg.docs} target="_blank" rel="noreferrer" className="text-[11px] text-[#E8915A] no-underline hover:underline">
              📖 查看文档 →
            </a>
          </div>
        </div>
      )}

      {/* Installed state */}
      {isInstalled && (
        <>
          {/* ACP Connection Info */}
          <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-2.5">
              🔗 ACP 本地连接
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#1d2030]">
              <span className="text-xs text-[#8b8fa7]">协议</span>
              <span className="text-xs font-mono font-medium">{agent.protocol}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#1d2030]">
              <span className="text-xs text-[#8b8fa7]">端点</span>
              <span className="text-xs font-mono font-medium">{agent.endpoint}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#1d2030]">
              <span className="text-xs text-[#8b8fa7]">进程</span>
              <span className="text-xs font-mono font-medium" style={{ color: agent.pid ? "#e2e4ed" : "#4e5270" }}>
                {agent.pid ? `PID ${agent.pid}` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-[#8b8fa7]">版本</span>
              <span className="text-xs font-mono font-medium">v{agent.version}</span>
            </div>
            <div className="text-[10.5px] text-[#4e5270] mt-2 leading-relaxed">
              Agent 作为本地服务运行，ASquink 通过 ACP 协议与其通信。
              <br />在任意环境的会话中均可调用此 Agent。
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-[#F87171]/5 rounded-xl border border-[#F87171]/20 p-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">移除此 Agent</div>
                <div className="text-[11px] text-[#4e5270] mt-0.5">断开 ACP 连接，清除配置（不卸载 CLI）</div>
              </div>
              <button className="px-3.5 py-1.5 rounded-lg border border-[#F87171]/40 bg-transparent text-[#F87171] text-xs cursor-pointer hover:bg-[#F87171]/10 transition-colors">
                移除
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
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

  // New state for ACP Agent tab
  const [activeTab, setActiveTab] = useState<'envs' | 'agents'>('envs')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('claude')
  const [acpAgents, setAcpAgents] = useState<AcpAgent[]>(MOCK_ACP_AGENTS)

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
        // Prefer local environment if available
        const localEnv = envList.find(e => e.type === 'local')
        if (localEnv) {
          setSelectedEnvId(localEnv.id)
        } else {
          setSelectedEnvId(envList[0].id)
        }
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
  const selectedAcpAgent = acpAgents.find(a => a.id === selectedAgentId)

  const scanAgents = async () => {
    if (!selectedEnv) {
      setDetectedAgents(null)
      return
    }
    if (selectedEnv.type !== 'local' && selectedEnv.type !== 'wsl') {
      setDetectedAgents(null)
      return
    }
    setScanningAgents(true)
    try {
      let agents: AgentInfo[]
      if (selectedEnv.type === 'local') {
        agents = await invoke<AgentInfo[]>('scan_agents')
      } else {
        agents = await invoke<AgentInfo[]>('scan_agents_for_env', { envId: selectedEnv.id })
      }
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
    if (activeTab === 'envs') {
      scanAgents()
    }
  }, [selectedEnvId, activeTab])

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
          <div className="text-base font-semibold">⚙ 环境与 Agent 管理</div>
          <div className="text-[11px] text-[#4e5270] mt-0.5">管理远程环境连接和本地 ACP Agent</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className="w-[280px] border-r border-[#1d2030] flex flex-col flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-[#1d2030] flex-shrink-0">
            {[
              { id: 'envs' as const, label: '🖥 环境' },
              { id: 'agents' as const, label: '🤖 ACP Agent' },
            ].map(t => (
              <div
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex-1 text-center py-2.5 text-xs font-medium cursor-pointer transition-colors"
                style={{
                  color: activeTab === t.id ? '#e2e4ed' : '#4e5270',
                  borderBottom: activeTab === t.id ? '2px solid #E8915A' : '2px solid transparent',
                  background: activeTab === t.id ? '#151820' : 'transparent',
                }}
              >
                {t.label}
              </div>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2.5">
            {activeTab === 'envs' && (
              <>
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
                  const isOnline = env.status === 'online'
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
                          isOnline
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
              </>
            )}

            {activeTab === 'agents' && (
              <>
                {acpAgents.map(agent => {
                  const reg = AGENT_REGISTRY[agent.id]
                  const isSelected = selectedAgentId === agent.id
                  return (
                    <div
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors"
                      style={{
                        background: isSelected ? `${reg.color}15` : 'transparent',
                        border: isSelected ? `1px solid ${reg.color}40` : '1px solid transparent',
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-md flex items-center justify-center text-base"
                        style={{ background: `${reg.color}18`, border: `1px solid ${reg.color}30` }}
                      >
                        {reg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium">{reg.name}</div>
                        {agent.status === 'connected' && (
                          <div className="text-[10px] text-[#4e5270] font-mono mt-0.5">{agent.endpoint}</div>
                        )}
                        {agent.status === 'disconnected' && (
                          <div className="text-[10px] text-[#FBBF24] mt-0.5">已安装，未运行</div>
                        )}
                        {agent.status === 'not_installed' && (
                          <div className="text-[10px] text-[#4e5270] mt-0.5">未安装</div>
                        )}
                      </div>
                      <Badge status={agent.status} />
                    </div>
                  )
                })}

                {/* ACP info */}
                <div className="mt-3 px-3 py-2.5 rounded-lg bg-[#151820] border border-[#1d2030]">
                  <div className="text-[10px] text-[#4e5270] leading-relaxed">
                    🔌 Agent 在本地运行，通过 ACP 协议与 ASquink 通信。连接后可在任意环境的会话中使用。
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right detail panel */}
        {activeTab === 'envs' && selectedEnv && (
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
                {(selectedEnv?.type === 'local' || selectedEnv?.type === 'wsl') && !scanningAgents && (
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
                          ) : selectedEnv?.type === 'local' || selectedEnv?.type === 'wsl' ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                              -
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                              仅本地/WSL环境
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

        {activeTab === 'agents' && selectedAcpAgent && (
          <AgentDetail agent={selectedAcpAgent} />
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
