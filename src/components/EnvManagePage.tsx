import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Env, Project, SessionRecord } from '../App'

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
  const [addEnvForm, setAddEnvForm] = useState({
    name: '',
    host: '',
    port: '22',
    username: '',
    auth_type: 'key' as 'key' | 'password',
    private_key_path: '',
  })

  useEffect(() => {
    loadData()
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

  const selectedEnv = envs.find(e => e.id === selectedEnvId)
  const envProjects = projects.filter(p => p.env_id === selectedEnvId)
  const envSessions = sessions.filter(s => s.env_id === selectedEnvId)

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
    if (!addEnvForm.name || !addEnvForm.host) {
      alert('请填写环境名称和主机地址')
      return
    }

    try {
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
      setShowAddEnv(false)
      setAddEnvForm({
        name: '',
        host: '',
        port: '22',
        username: '',
        auth_type: 'key',
        private_key_path: '',
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
          {envs.map(env => {
            const isSelected = selectedEnvId === env.id
            const isLocal = env.type === 'local'
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
                <span className="text-xl">{isLocal ? '💻' : '☁️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{env.name}</div>
                  <div className="text-[10.5px] text-[#4e5270] font-mono truncate">
                    {isLocal ? (env.detail || 'localhost') : (env.host || '-')}
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
                {selectedEnv.type === 'local' ? '💻' : '☁️'}
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
                  {selectedEnv.type === 'local' ? 'Local' : 'SSH'} · {selectedEnv.detail || selectedEnv.host || 'localhost'}
                  {selectedEnv.port && `:${selectedEnv.port}`}
                </div>
              </div>
              {selectedEnv.type !== 'local' && (
                <button
                  onClick={() => testConnection(selectedEnv)}
                  disabled={testingConnection === selectedEnv.id}
                  className="px-3.5 py-1.75 rounded-lg border border-[#282d3e] bg-transparent text-[#8b8fa7] text-xs cursor-pointer hover:border-[#E8915A] hover:text-[#E8915A] transition-colors disabled:opacity-50"
                >
                  {testingConnection === selectedEnv.id ? '测试中...' : '🔗 测试连接'}
                </button>
              )}
              {connectionResult?.id === selectedEnv.id && (
                <span className={`text-xs ${connectionResult.success ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                  {connectionResult.message}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Connection info */}
              <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] mb-3">🔗 连接</div>
                <Field label="类型" value={selectedEnv.type === 'local' ? 'Local' : 'SSH'} />
                {selectedEnv.host && <Field label="地址" value={selectedEnv.host} />}
                {selectedEnv.port && <Field label="端口" value={String(selectedEnv.port)} />}
                {selectedEnv.username && <Field label="用户" value={selectedEnv.username} />}
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
            <h3 className="text-lg font-semibold mb-4">添加 SSH 环境</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b8fa7] mb-1">环境名称 *</label>
                <input
                  type="text"
                  value={addEnvForm.name}
                  onChange={e => setAddEnvForm({ ...addEnvForm, name: e.target.value })}
                  placeholder="例如：生产服务器"
                  className="w-full px-3 py-2 bg-[#161822] border border-[#282d3e] rounded text-sm focus:border-[#E8915A] focus:outline-none"
                />
              </div>

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
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddEnv(false)}
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
