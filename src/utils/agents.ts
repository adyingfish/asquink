export type AgentSessionMode = 'terminal' | 'chat'
export type AgentLaunchStrategy = 'cli' | 'acp'

export interface AgentDefinition {
  id: string
  name: string
  short: string
  color: string
  needsProject: boolean
  sessionMode: AgentSessionMode
  launchStrategy: AgentLaunchStrategy
}

export const AGENTS: AgentDefinition[] = [
  { id: 'claude', name: 'Claude Code', short: 'Claude', color: '#E8915A', needsProject: true, sessionMode: 'terminal', launchStrategy: 'cli' },
  { id: 'codex', name: 'Codex', short: 'Codex', color: '#E5E7EB', needsProject: true, sessionMode: 'terminal', launchStrategy: 'cli' },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', color: '#60A5FA', needsProject: true, sessionMode: 'terminal', launchStrategy: 'cli' },
  { id: 'opencode', name: 'OpenCode', short: 'OpenCode', color: '#78716C', needsProject: true, sessionMode: 'terminal', launchStrategy: 'cli' },
  { id: 'acp', name: 'ACP Agent', short: 'ACP', color: '#4ADE80', needsProject: true, sessionMode: 'chat', launchStrategy: 'acp' },
  { id: 'openclaw', name: 'OpenClaw', short: 'OpenClaw', color: '#EF4444', needsProject: false, sessionMode: 'chat', launchStrategy: 'cli' },
]

export const PROJECT_AGENTS = AGENTS.filter((agent) => agent.needsProject)
export const CHAT_AGENTS = AGENTS.filter((agent) => !agent.needsProject)

export const getAgentDefinition = (agentId?: string | null) =>
  agentId ? AGENTS.find((agent) => agent.id === agentId) ?? null : null

export const getAgentSessionMode = (agentId?: string | null): AgentSessionMode =>
  getAgentDefinition(agentId)?.sessionMode ?? 'terminal'

export const shouldAutoLaunchAgent = (agentId?: string | null) =>
  getAgentDefinition(agentId)?.launchStrategy === 'cli'
