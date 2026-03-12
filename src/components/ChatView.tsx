import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { AlertTriangle, ChevronRight, LoaderCircle, MessageSquareText } from 'lucide-react'
import type { Session } from '../App'
import { getAcpRuntimeDefinition } from '../utils/agents'

const C = {
  bg0: 'var(--app-bg)',
  bg2: 'var(--panel-bg-elevated)',
  bg3: 'var(--panel-bg-hover)',
  bd: 'var(--panel-border-strong)',
  bds: 'var(--panel-border)',
  t1: 'var(--text-primary)',
  t2: 'var(--text-secondary)',
  t3: 'var(--text-tertiary)',
  grn: '#4ADE80',
  red: '#F87171',
  blu: '#60A5FA',
  yel: '#FBBF24',
}

interface ChatViewProps {
  session?: Session
}

interface MessageRecord {
  id: string
  sessionId: string
  role: string
  content: string
  status: string
  createdAt?: string | null
  updatedAt?: string | null
}

interface AcpStatusPayload {
  sessionId: string
  status: string
  runtimeAgentId: string
  runtimeAgentName: string
  protocolVersion?: string | null
  runtimeVersion?: string | null
  lastError?: string | null
}

interface AcpMessageDeltaPayload {
  sessionId: string
  messageId: string
  role: string
  delta: string
  content: string
  status: string
}

interface AcpMessageCompletePayload {
  sessionId: string
  messageId: string
  role: string
  content: string
  status: string
  stopReason?: string | null
}

interface AcpErrorPayload {
  sessionId: string
  message: string
  fatal: boolean
}

interface AcpPermissionOptionPayload {
  optionId: string
  name?: string | null
  kind?: string | null
}

interface AcpPermissionRequestPayload {
  sessionId: string
  requestId: string
  toolCallId?: string | null
  title?: string | null
  kind?: string | null
  suggestedOptionId?: string | null
  options: AcpPermissionOptionPayload[]
}

const parseTimestamp = (value?: string | null) => {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

const messageSortKey = (message: MessageRecord) => parseTimestamp(message.createdAt) ?? parseTimestamp(message.updatedAt)

const sortMessages = (messages: MessageRecord[]) =>
  messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const leftTime = messageSortKey(left.message)
      const rightTime = messageSortKey(right.message)

      if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
        return leftTime - rightTime
      }

      if (leftTime === null && rightTime !== null) return 1
      if (leftTime !== null && rightTime === null) return -1

      return left.index - right.index
    })
    .map(({ message }) => message)

const mergeMessage = (messages: MessageRecord[], next: MessageRecord) => {
  const existing = messages.findIndex((message) => message.id === next.id)
  if (existing === -1) {
    return sortMessages([...messages, next])
  }

  const updated = [...messages]
  updated[existing] = { ...updated[existing], ...next }
  return sortMessages(updated)
}

const getStatusTone = (status: string) => {
  if (status === 'ready') return { label: 'Ready', color: C.grn }
  if (status === 'handshaking' || status === 'starting') return { label: 'Handshaking', color: C.yel }
  if (status === 'error') return { label: 'Error', color: C.red }
  if (status === 'closed') return { label: 'Closed', color: C.red }
  return { label: 'Idle', color: C.t2 }
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-2xl border border-[#282d3e] bg-[#151820] flex items-center justify-center text-[#8b8fa7]">
          <MessageSquareText size={20} />
        </div>
        <div className="text-[13px] text-[#8b8fa7] leading-relaxed">{text}</div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: MessageRecord }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-[14px]">
        <div
          className="max-w-[85%] px-3.5 py-2.5 rounded-[13px_13px_4px_13px] text-[12.5px] leading-relaxed whitespace-pre-wrap"
          style={{ background: C.bg3, border: `1px solid ${C.bd}`, color: C.t1 }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-[14px]">
      <div className="py-2 px-3 text-[12.5px] leading-[1.65] whitespace-pre-wrap" style={{ color: C.t1 }}>
        {message.content || (message.status === 'streaming' ? '...' : '')}
      </div>
      {message.status !== 'done' && (
        <div className="px-3 text-[10px] font-medium" style={{ color: message.status === 'error' ? C.red : C.t3 }}>
          {message.status}
        </div>
      )}
    </div>
  )
}

export default function ChatView({ session }: ChatViewProps) {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(session?.status === 'connected' ? 'ready' : 'closed')
  const [runtimeLabel, setRuntimeLabel] = useState(getAcpRuntimeDefinition(session?.acpAgentId)?.name || 'ACP')
  const [runtimeMeta, setRuntimeMeta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissionQueue, setPermissionQueue] = useState<AcpPermissionRequestPayload[]>([])
  const [resolvingPermission, setResolvingPermission] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const draftInputRef = useRef<HTMLTextAreaElement>(null)

  const isAcp = session?.agentId === 'acp'

  useEffect(() => {
    setRuntimeLabel(getAcpRuntimeDefinition(session?.acpAgentId)?.name || 'ACP')
  }, [session?.acpAgentId])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, status, error])

  useEffect(() => {
    setPermissionQueue([])
  }, [isAcp, session?.id])

  const resizeDraftInput = (element?: HTMLTextAreaElement | null) => {
    if (!element) return
    element.style.height = 'auto'
    const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight) || 20
    const maxHeight = lineHeight * 10
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  useLayoutEffect(() => {
    resizeDraftInput(draftInputRef.current)
  }, [draft])

  useEffect(() => {
    let cancelled = false
    let unlisteners: UnlistenFn[] = []

    const loadMessages = async () => {
      if (!session?.id || !isAcp) {
        setMessages([])
        setError(null)
        setPermissionQueue([])
        setStatus(session?.status === 'connected' ? 'ready' : 'closed')
        return
      }

      try {
        const loaded = await invoke<MessageRecord[]>('list_session_messages', { sessionId: session.id })
        if (!cancelled) {
          setMessages(sortMessages(loaded))
          setError(null)
          setStatus(session.status === 'connected' ? 'ready' : 'closed')
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(String(loadError))
        }
      }
    }

    const bindEvents = async () => {
      if (!session?.id || !isAcp) return

      unlisteners = await Promise.all([
        listen<AcpStatusPayload>(`acp-session-status-${session.id}`, (event) => {
          const payload = event.payload
          setStatus(payload.status)
          setRuntimeLabel(payload.runtimeAgentName || payload.runtimeAgentId || 'ACP')
          setRuntimeMeta([
            payload.protocolVersion,
            payload.runtimeVersion ? `v${payload.runtimeVersion}` : null,
          ].filter(Boolean).join(' · ') || null)
          setError(payload.lastError || null)
        }),
        listen<AcpMessageDeltaPayload>(`acp-message-delta-${session.id}`, (event) => {
          const payload = event.payload
          setMessages((current) => mergeMessage(current, {
            id: payload.messageId,
            sessionId: payload.sessionId,
            role: payload.role,
            content: payload.content,
            status: payload.status,
          }))
        }),
        listen<AcpMessageCompletePayload>(`acp-message-complete-${session.id}`, (event) => {
          const payload = event.payload
          setMessages((current) => mergeMessage(current, {
            id: payload.messageId,
            sessionId: payload.sessionId,
            role: payload.role,
            content: payload.content,
            status: payload.status,
          }))
        }),
        listen<AcpErrorPayload>(`acp-session-error-${session.id}`, (event) => {
          setError(event.payload.message)
          if (event.payload.fatal) {
            setStatus('error')
          }
        }),
        listen(`acp-session-closed-${session.id}`, () => {
          setStatus('closed')
        }),
        listen<AcpPermissionRequestPayload>(`acp-permission-request-${session.id}`, (event) => {
          setPermissionQueue((current) => [...current, event.payload])
        }),
      ])
    }

    loadMessages()
    bindEvents()

    return () => {
      cancelled = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isAcp, session?.id, session?.status])

  const currentPermission = permissionQueue[0] || null

  const getOptionIdByKind = (request: AcpPermissionRequestPayload, kind: 'allow_once' | 'allow_always') => {
    const exact = request.options.find((option) => option.kind === kind)?.optionId
    if (exact) return exact

    const hinted = request.options.find((option) => {
      const label = (option.name || '').toLowerCase()
      if (kind === 'allow_always') {
        return label.includes('always')
      }
      return label.includes('once')
    })?.optionId
    if (hinted) return hinted

    if (kind === 'allow_once' && request.suggestedOptionId) {
      return request.suggestedOptionId
    }

    if (kind === 'allow_always') {
      return request.options.find((option) => option.kind === 'allow_once')?.optionId || null
    }

    return request.options[0]?.optionId || null
  }

  const resolvePermission = async (decision: 'allow_once' | 'allow_always' | 'reject') => {
    if (!session?.id || !currentPermission || resolvingPermission) return

    try {
      setResolvingPermission(true)
      const outcome = decision === 'reject' ? 'cancelled' : 'selected'
      const optionId = decision === 'allow_once'
        ? getOptionIdByKind(currentPermission, 'allow_once')
        : decision === 'allow_always'
          ? getOptionIdByKind(currentPermission, 'allow_always')
          : null

      if (outcome === 'selected' && !optionId) {
        throw new Error('No available permission option for approval.')
      }

      await invoke('respond_acp_permission_request', {
        sessionId: session.id,
        requestId: currentPermission.requestId,
        outcome,
        optionId,
      })

      setPermissionQueue((current) => current.slice(1))
    } catch (resolveError) {
      setError(String(resolveError))
    } finally {
      setResolvingPermission(false)
    }
  }

  const handleSend = async () => {
    if (!session?.id || !isAcp || !draft.trim() || sending) return

    const content = draft.trim()
    const optimisticId = `local-user-${Date.now()}`
    setMessages((current) =>
      sortMessages([
        ...current,
        {
          id: optimisticId,
          sessionId: session.id,
          role: 'user',
          content,
          status: 'done',
          createdAt: new Date().toISOString(),
        },
      ]),
    )
    setDraft('')
    setSending(true)
    setError(null)

    try {
      await invoke('send_acp_message', {
        sessionId: session.id,
        content,
      })

      const loaded = await invoke<MessageRecord[]>('list_session_messages', { sessionId: session.id })
      setMessages(sortMessages(loaded))
    } catch (sendError) {
      setError(String(sendError))
      setMessages((current) =>
        sortMessages(current.map((message) =>
          message.id === optimisticId ? { ...message, status: 'error' } : message,
        )),
      )
    } finally {
      setSending(false)
    }
  }

  const tone = getStatusTone(status)

  if (!session) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <EmptyState text="Select a session to view chat messages." />
      </div>
    )
  }

  if (!isAcp) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-3 py-1.5 border-b shrink-0 flex items-center gap-1.5" style={{ background: C.bg2, borderColor: C.bds }}>
          <MessageSquareText size={12} style={{ color: C.t2 }} />
          <span className="text-[11px] font-semibold" style={{ color: C.t2 }}>
            Chat
          </span>
        </div>
        <EmptyState text="This chat panel is wired for ACP sessions. Other chat-mode agents still use the older placeholder flow." />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      <div className="px-3 py-1.5 border-b shrink-0 flex items-center gap-1.5" style={{ background: C.bg2, borderColor: C.bds }}>
        <MessageSquareText size={12} style={{ color: C.t2 }} />
        <span className="text-[11px] font-semibold" style={{ color: C.t2 }}>
          ACP Chat
        </span>
        <span
          className="h-5 px-2 rounded-md border flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] ml-auto"
          style={{
            color: tone.color,
            background: `${tone.color}12`,
            borderColor: `${tone.color}20`,
          }}
        >
          {sending && <LoaderCircle size={10} className="animate-spin" />}
          {tone.label}
        </span>
      </div>

      <div className="px-4 py-2 border-b text-[10px] flex items-center gap-2" style={{ background: C.bg0, borderColor: C.bds, color: C.t3 }}>
        <span className="font-semibold" style={{ color: C.t2 }}>{runtimeLabel}</span>
        {runtimeMeta && <span>{runtimeMeta}</span>}
        {session.projectPath && (
          <>
            <span>/</span>
            <span className="font-mono truncate">{session.projectPath}</span>
          </>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg border flex items-start gap-2 text-[11px]" style={{ borderColor: `${C.red}35`, background: `${C.red}10`, color: C.red }}>
          <AlertTriangle size={14} className="mt-[1px] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3.5 min-h-0">
        {messages.length === 0 ? (
          <EmptyState text={status === 'ready' ? 'Session is ready. Send the first prompt.' : 'Reconnect or wait for the ACP session to become ready.'} />
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      <div className="shrink-0 px-3 py-2.5 border-t" style={{ background: C.bg0, borderColor: C.bds }}>
        <div className="flex items-end gap-2 px-3 py-2.5 rounded-lg border" style={{ background: C.bg2, borderColor: C.bds }}>
          <textarea
            ref={draftInputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              resizeDraftInput(event.target)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            rows={1}
            placeholder={status === 'ready' ? 'Send a prompt to the ACP agent...' : 'ACP session is not ready'}
            disabled={status !== 'ready' || sending}
            className="flex-1 bg-transparent border-none outline-none resize-none text-[12px] leading-5 placeholder-[#4e5270] text-[#e2e4ed] disabled:text-[#4e5270]"
          />
          <button
            onClick={() => void handleSend()}
            disabled={status !== 'ready' || sending || !draft.trim()}
            className="w-8 h-8 rounded-md border flex items-center justify-center disabled:opacity-40"
            style={{
              borderColor: sending || !draft.trim() ? C.bds : `${C.blu}40`,
              color: sending || !draft.trim() ? C.t3 : C.blu,
              background: sending || !draft.trim() ? 'transparent' : `${C.blu}12`,
            }}
          >
            {sending ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {currentPermission && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4" style={{ background: 'rgba(8, 9, 13, 0.75)' }}>
          <div className="w-full max-w-lg rounded-xl border p-4" style={{ background: C.bg2, borderColor: C.bd }}>
            <div className="text-[12px] font-semibold mb-2" style={{ color: C.t1 }}>
              Permission Request
            </div>
            <div className="text-[11px] leading-relaxed mb-3" style={{ color: C.t2 }}>
              {currentPermission.title || 'ACP agent is requesting permission to continue.'}
            </div>
            {(currentPermission.kind || currentPermission.toolCallId) && (
              <div className="text-[10px] mb-3 font-mono" style={{ color: C.t3 }}>
                {[currentPermission.kind, currentPermission.toolCallId].filter(Boolean).join(' / ')}
              </div>
            )}
            {currentPermission.options.length > 0 && (
              <div className="mb-4 space-y-1">
                {currentPermission.options.map((option) => (
                  <div key={option.optionId} className="text-[10px]" style={{ color: C.t2 }}>
                    {option.name || option.kind || option.optionId}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => void resolvePermission('reject')}
                disabled={resolvingPermission}
                className="px-3 h-8 rounded-md border text-[11px] font-semibold disabled:opacity-60"
                style={{ borderColor: `${C.red}40`, color: C.red, background: `${C.red}12` }}
              >
                拒绝
              </button>
              <button
                onClick={() => void resolvePermission('allow_once')}
                disabled={resolvingPermission || !getOptionIdByKind(currentPermission, 'allow_once')}
                className="px-3 h-8 rounded-md border text-[11px] font-semibold disabled:opacity-60"
                style={{ borderColor: `${C.blu}40`, color: C.blu, background: `${C.blu}12` }}
              >
                本次批准
              </button>
              <button
                onClick={() => void resolvePermission('allow_always')}
                disabled={resolvingPermission || !getOptionIdByKind(currentPermission, 'allow_always')}
                className="px-3 h-8 rounded-md border text-[11px] font-semibold disabled:opacity-60"
                style={{ borderColor: `${C.grn}40`, color: C.grn, background: `${C.grn}12` }}
              >
                {resolvingPermission ? '提交中...' : '始终批准'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
