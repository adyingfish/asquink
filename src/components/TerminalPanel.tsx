import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { listen, Event } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import '@xterm/xterm/css/xterm.css'
import type { Session } from '../App'

interface TerminalPanelProps {
  sessions: Session[]
  activeSessionId: string | null
  onSessionStatusChange?: (id: string, status: Session['status']) => void
}

export default function TerminalPanel({ sessions, activeSessionId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const disposableRef = useRef<{ dispose: () => void } | null>(null)
  const listenerSetupRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  // Refs to track latest values for clipboard handlers
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  const isCopyingRef = useRef(false)

  // Keep refs updated
  useEffect(() => {
    sessionsRef.current = sessions
    activeSessionIdRef.current = activeSessionId
  }, [sessions, activeSessionId])

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: {
        background: '#0f0f0f',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#404040',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#bfbfbf',
      },
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()
    // Ensure scrollbar is at bottom after initial render
    terminal.scrollToBottom()

    // Handle clipboard shortcuts
    terminal.onKey(({ domEvent, key }) => {
      // Ctrl+C: Copy if selection exists
      if (domEvent.ctrlKey && (domEvent.key === 'c' || key === '\x03')) {
        const selection = terminal.getSelection()
        if (selection) {
          // Copy to clipboard using Tauri API
          writeText(selection).catch(console.error)
          terminal.clearSelection()
          // Set flag to prevent onData from sending ^C
          isCopyingRef.current = true
          setTimeout(() => { isCopyingRef.current = false }, 50)
          domEvent.preventDefault()
          domEvent.stopPropagation()
          return
        }
        // No selection - let Ctrl+C through as interrupt signal
      }

      // Ctrl+Shift+C: Always copy selection
      if (domEvent.ctrlKey && domEvent.shiftKey && domEvent.key === 'C') {
        const selection = terminal.getSelection()
        if (selection) {
          writeText(selection).catch(console.error)
          terminal.clearSelection()
        }
        domEvent.preventDefault()
        domEvent.stopPropagation()
        return
      }

      // Ctrl+V: Paste - handled by paste event listener
    })

    // Handle paste event
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const currentSessionId = activeSessionIdRef.current
      const activeSession = sessionsRef.current.find(s => s.id === currentSessionId)

      readText().then(text => {
        if (text && activeSession?.status === 'connected' && currentSessionId) {
          invoke('write_to_session', {
            sessionId: currentSessionId,
            sessionType: activeSession.type,
            data: text,
          }).catch(console.error)
        }
      }).catch(err => {
        console.error('Paste failed:', err)
      })
    }

    // Listen for paste events
    const textarea = containerRef.current.querySelector('textarea.xterm-helper-textarea')
    if (textarea) {
      textarea.addEventListener('paste', handlePaste as EventListener)
    }
    containerRef.current.addEventListener('paste', handlePaste as EventListener)

    // Write welcome message
    terminal.writeln('\x1b[1;34m╔══════════════════════════════════════╗\x1b[0m')
    terminal.writeln('\x1b[1;34m║       Welcome to AgentHub            ║\x1b[0m')
    terminal.writeln('\x1b[1;34m╚══════════════════════════════════════╝\x1b[0m')
    terminal.writeln('')
    terminal.writeln('\x1b[90m1. Configure your API key in Settings\x1b[0m')
    terminal.writeln('\x1b[90m2. Connect to a server or open local terminal\x1b[0m')
    terminal.writeln('\x1b[90m3. Launch Claude Code from the Agents tab\x1b[0m')
    terminal.writeln('')

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle resize
    const handleResize = () => {
      fitAddonRef.current?.fit()
      // Notify backend of resize
      if (activeSessionId) {
        const session = sessions.find(s => s.id === activeSessionId)
        if (session && session.status === 'connected') {
          const dims = fitAddonRef.current?.proposeDimensions()
          if (dims) {
            invoke('resize_session', {
              sessionId: activeSessionId,
              sessionType: session.type,
              cols: dims.cols,
              rows: dims.rows,
            }).catch(console.error)
          }
        }
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      // Remove paste event listeners
      if (containerRef.current) {
        containerRef.current.removeEventListener('paste', handlePaste as EventListener)
        const textarea = containerRef.current.querySelector('textarea.xterm-helper-textarea')
        if (textarea) {
          textarea.removeEventListener('paste', handlePaste as EventListener)
        }
      }
      terminal.dispose()
    }
  }, [])

  // Handle session change - setup data listener
  useEffect(() => {
    if (!activeSessionId || !terminalRef.current) return

    const activeSession = sessions.find(s => s.id === activeSessionId)
    if (!activeSession) return

    const terminal = terminalRef.current
    const currentSessionId = activeSessionId

    // Mark this effect as the current one
    listenerSetupRef.current.cancelled = false

    // Refit terminal now that container is visible
    fitAddonRef.current?.fit()
    // Ensure scrollbar is at bottom after session switch
    terminal.scrollToBottom()

    // Sync terminal size to PTY immediately
    const dims = fitAddonRef.current?.proposeDimensions()
    if (dims && activeSession.status === 'connected') {
      invoke('resize_session', {
        sessionId: activeSessionId,
        sessionType: activeSession.type,
        cols: dims.cols,
        rows: dims.rows,
      }).catch(console.error)
    }

    // Clear and show session info
    terminal.clear()
    terminal.writeln(`\x1b[1;32mSession: ${activeSession.name}\x1b[0m`)
    terminal.writeln(`\x1b[90mStatus: ${activeSession.status}\x1b[0m`)
    terminal.writeln('')

    // Setup event listener for terminal data
    const setupListener = async () => {
      // Check if this effect is still valid (not cancelled by session switch)
      if (listenerSetupRef.current.cancelled) return

      // Clean up previous listener
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      const unlisten = await listen(`terminal-data-${currentSessionId}`, (event: Event<unknown>) => {
        // Ignore events for other sessions
        if (activeSessionIdRef.current !== currentSessionId) return

        if (event.payload instanceof Array) {
          const data = new Uint8Array(event.payload as number[])
          const decoder = new TextDecoder()
          terminal.write(decoder.decode(data), () => {
            terminal.scrollToBottom()
          })
        } else if (typeof event.payload === 'string') {
          terminal.write(event.payload, () => {
            terminal.scrollToBottom()
          })
        }
      })

      // Check again after async operation
      if (listenerSetupRef.current.cancelled) {
        unlisten()
        return
      }

      unlistenRef.current = unlisten
    }

    setupListener()

    // Handle keyboard input
    if (disposableRef.current) {
      disposableRef.current.dispose()
    }
    disposableRef.current = terminal.onData((data: string) => {
      // Check if we just handled a copy operation - don't send ^C
      if (isCopyingRef.current) {
        return
      }

      // Check if this session is still active
      if (activeSessionIdRef.current !== currentSessionId) return

      const session = sessionsRef.current.find(s => s.id === currentSessionId)
      if (session?.status === 'connected') {
        invoke('write_to_session', {
          sessionId: currentSessionId,
          sessionType: session.type,
          data,
        }).catch(console.error)
      }
    })

    return () => {
      // Mark this effect as cancelled
      listenerSetupRef.current.cancelled = true

      if (disposableRef.current) {
        disposableRef.current.dispose()
        disposableRef.current = null
      }
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [activeSessionId])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div className="flex-1 bg-dark-900 relative overflow-hidden flex flex-col">
      {activeSession && (
        <div className="flex items-center gap-4 px-4 py-2 bg-dark-800 border-b border-dark-600 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Session:</span>
            <span className="font-medium">{activeSession.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <span className={`font-medium ${
              activeSession.status === 'connected' ? 'text-green-400' :
              activeSession.status === 'connecting' ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {activeSession.status}
            </span>
            {activeSession.status === 'connecting' && (
              <span className="animate-pulse">...</span>
            )}
          </div>
        </div>
      )}
      {/* Terminal container - always in DOM so xterm can initialize on mount */}
      <div ref={containerRef} className={`flex-1 p-2 ${activeSession ? '' : 'invisible'}`} />
      {!activeSession && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-4">🖥️</div>
            <div className="text-lg">No active session</div>
            <div className="text-sm mt-2 text-gray-500">
              Click the + button or select a server to start
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
