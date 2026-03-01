import { CheckCircle, Edit, FileText, MessageSquareText, Play, Search, XCircle } from 'lucide-react'

const C = {
  bg0: '#08090d', bg2: '#151820', bg3: '#1b1f2b',
  bd: '#282d3e', bds: '#1d2030',
  t1: '#e2e4ed', t2: '#8b8fa7', t3: '#4e5270',
  grn: '#4ADE80', red: '#F87171', blu: '#60A5FA', pur: '#C084FC',
}

interface DemoMessage {
  id: string
  type: 'user' | 'thinking' | 'assistant' | 'edit' | 'command' | 'result' | 'usage'
  text?: string
  files?: string[]
  file?: string
  rm?: string
  add?: string
  isNew?: boolean
  command?: string
  ok?: boolean
  summary?: string
}

const DEMO_MESSAGES: DemoMessage[] = [
  { id: '1', type: 'user', text: 'fix the authentication bug in login.ts' },
  { id: '2', type: 'thinking', text: 'Reading project structure...', files: ['src/auth/login.ts', 'src/auth/session.ts'] },
  { id: '3', type: 'assistant', text: 'Found the issue: token validation uses wrong expiry field. The code checks decoded.expiresAt but the JWT library uses decoded.exp.' },
  { id: '4', type: 'edit', file: 'src/auth/login.ts', rm: 'if (decoded.expiresAt < Date.now()/1000) {', add: 'if (decoded.exp < Date.now()/1000) {' },
  { id: '5', type: 'command', command: 'npm test' },
  { id: '6', type: 'result', ok: true, summary: 'All 23 tests passed' },
  { id: '7', type: 'assistant', text: 'Fixed. JWT token was checking the wrong field name for expiration. All tests pass now.' },
  { id: '8', type: 'usage', text: '↑12,847 ↓1,203 $0.018' },
]

function DemoChatMessage({ message }: { message: DemoMessage }) {
  switch (message.type) {
    case 'user':
      return (
        <div className="flex justify-end mb-[14px]">
          <div
            className="max-w-[85%] px-3.5 py-2.5 rounded-[13px_13px_4px_13px] text-[12.5px] leading-relaxed"
            style={{ background: C.bg3, border: `1px solid ${C.bd}`, color: C.t1 }}
          >
            {message.text}
          </div>
        </div>
      )
    case 'thinking':
      return (
        <div className="mb-2.5">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px]"
            style={{ background: C.bg2, border: `1px solid ${C.bds}`, color: C.pur }}
          >
            <Search size={12} />
            {message.text}
            {message.files && (
              <span className="text-[10px]" style={{ color: C.t3 }}>
                ({message.files.length} files)
              </span>
            )}
          </div>
        </div>
      )
    case 'assistant':
      return (
        <div className="mb-[14px] py-2 px-3 text-[12.5px] leading-[1.65]" style={{ color: C.t1 }}>
          {message.text}
        </div>
      )
    case 'edit':
      return (
        <div className="mb-2.5 p-2.5 rounded-md" style={{ background: C.bg2, border: `1px solid ${C.bds}` }}>
          <div className="flex items-center gap-2 mb-1.5">
            {message.isNew ? <FileText size={12} style={{ color: C.blu }} /> : <Edit size={12} style={{ color: C.blu }} />}
            <span className="text-[11px] font-semibold" style={{ color: C.blu }}>
              {message.isNew ? '📄 ' : '✏️ '}
              {message.file}
            </span>
          </div>
          {message.rm && message.add && (
            <div className="font-mono text-[11px] leading-relaxed">
              <div style={{ color: C.red }}>- {message.rm}</div>
              <div style={{ color: C.grn }}>+ {message.add}</div>
            </div>
          )}
        </div>
      )
    case 'command':
      return (
        <div className="mb-2.5 p-2.5 rounded-md" style={{ background: C.bg2, border: `1px solid ${C.bds}` }}>
          <div className="flex items-center gap-1.5">
            <Play size={10} style={{ color: C.blu }} />
            <span className="text-[11px] font-semibold" style={{ color: C.blu }}>
              {message.command}
            </span>
          </div>
        </div>
      )
    case 'result':
      return (
        <div className="mb-[14px] flex justify-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold"
            style={{
              background: message.ok ? `${C.grn}10` : `${C.red}10`,
              color: message.ok ? C.grn : C.red,
            }}
          >
            {message.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {message.summary}
          </div>
        </div>
      )
    case 'usage':
      return (
        <div className="mb-2.5 flex justify-center">
          <div className="font-mono text-[10px] px-2.5 py-[3px] rounded-md" style={{ background: C.bg2, color: C.t3 }}>
            {message.text}
          </div>
        </div>
      )
    default:
      return null
  }
}

export default function ChatView() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-3 py-1.5 border-b shrink-0 flex items-center gap-1.5" style={{ background: C.bg2, borderColor: C.bds }}>
        <MessageSquareText size={12} style={{ color: C.t2 }} />
        <span className="text-[11px] font-semibold" style={{ color: C.t2 }}>
          对话
        </span>
        <span
          className="h-5 px-2 rounded-md border flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] ml-auto"
          style={{
            color: C.grn,
            background: `${C.grn}12`,
            borderColor: `${C.grn}20`,
          }}
        >
          示例
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3.5 min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md mb-4" style={{ background: `${C.pur}08`, border: `1px solid ${C.pur}20` }}>
          <span style={{ fontSize: '10.5px', color: C.pur }}>
            💬 此为示例对话界面，实际对话功能开发中
          </span>
        </div>

        {DEMO_MESSAGES.map((message) => (
          <DemoChatMessage key={message.id} message={message} />
        ))}
      </div>

      <div className="shrink-0 px-3 py-2.5 border-t" style={{ background: C.bg0, borderColor: C.bds }}>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border" style={{ background: C.bg2, borderColor: C.bds }}>
          <span className="flex-1 text-[12px]" style={{ color: C.t3 }}>
            输入指令...
          </span>
          <span
            className="text-[9px] px-1.5 py-[2px] rounded-md font-semibold tracking-wide"
            style={{ color: C.blu, background: `${C.blu}15`, border: `1px solid ${C.blu}25` }}
          >
            示例
          </span>
          <span className="text-[12px]" style={{ color: C.t3 }}>
            ↵
          </span>
        </div>
      </div>
    </div>
  )
}
