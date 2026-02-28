import { useEffect, useRef, useCallback } from 'react'
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
  const listenerSetupRef = useRef<{ cancelled: boolean; sessionId: string | null }>({ cancelled: false, sessionId: null })
  const isContainerVisibleRef = useRef(false)

  // Refs to track latest values for clipboard handlers
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  const isCopyingRef = useRef(false)

  // Keep refs updated
  useEffect(() => {
    sessionsRef.current = sessions
    activeSessionIdRef.current = activeSessionId
  }, [sessions, activeSessionId])

  // Fit terminal function
  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current && isContainerVisibleRef.current) {
      fitAddonRef.current.fit()
      terminalRef.current.scrollToBottom()
    }
  }, [])

  // Watch the entire panel for resize to ensure terminal fits correctly
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panelRef.current) return

    const observer = new ResizeObserver(() => {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        fitTerminal()
      }, 10)
    })

    observer.observe(panelRef.current)

    return () => observer.disconnect()
  }, [fitTerminal])

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

    // Initial fit after a short delay to ensure container is visible
    setTimeout(() => {
      if (containerRef.current) {
        fitAddon.fit()
        terminal.scrollToBottom()
        isContainerVisibleRef.current = true
      }
    }, 100)

    // Handle clipboard shortcuts
    terminal.onKey(({ domEvent, key }) => {
      // Ctrl+C: Copy if selection exists
      if (domEvent.ctrlKey && (domEvent.key === 'c' || key === '\x03')) {
        const selection = terminal.getSelection()
        if (selection) {
          writeText(selection).catch(console.error)
          terminal.clearSelection()
          isCopyingRef.current = true
          setTimeout(() => { isCopyingRef.current = false }, 50)
          domEvent.preventDefault()
          domEvent.stopPropagation()
          return
        }
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

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return () => {
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
    if (!activeSessionId || !terminalRef.current || !containerRef.current) return

    const activeSession = sessions.find(s => s.id === activeSessionId)
    if (!activeSession) return

    const terminal = terminalRef.current
    const currentSessionId = activeSessionId

    // Mark this effect as the current one
    listenerSetupRef.current = { cancelled: false, sessionId: currentSessionId }

    // Mark container as visible and fit
    isContainerVisibleRef.current = true

    // Reset terminal completely for new session
    terminal.reset()

    // Use setTimeout to ensure DOM is updated before fitting
    setTimeout(() => {
      // Check if this is still the active session
      if (activeSessionIdRef.current !== currentSessionId) return

      fitAddonRef.current?.fit()
      terminal.scrollToBottom()

      // Sync terminal size to PTY
      const dims = fitAddonRef.current?.proposeDimensions()
      if (dims && activeSession.status === 'connected') {
        invoke('resize_session', {
          sessionId: currentSessionId,
          sessionType: activeSession.type,
          cols: dims.cols,
          rows: dims.rows,
        }).catch(console.error)
      }
    }, 50)

    // Extra fit after a longer delay to ensure layout is stable
    setTimeout(() => {
      if (activeSessionIdRef.current === currentSessionId) {
        fitAddonRef.current?.fit()
        terminal.scrollToBottom()
      }
    }, 200)

    // Setup event listener for terminal data
    const setupListener = async () => {
      // Check if this effect is still valid
      const state = listenerSetupRef.current
      if (state.cancelled || state.sessionId !== currentSessionId) return

      // Clean up previous listener
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      try {
        const unlisten = await listen(`terminal-data-${currentSessionId}`, (event: Event<unknown>) => {
          // Ignore events for other sessions
          if (activeSessionIdRef.current !== currentSessionId) return

          if (event.payload instanceof Array) {
            const data = new Uint8Array(event.payload as number[])
            const decoder = new TextDecoder()
            terminal.write(decoder.decode(data))
          } else if (typeof event.payload === 'string') {
            terminal.write(event.payload)
          }

          // Scroll to bottom after writing data
          setTimeout(() => {
            terminal.scrollToBottom()
          }, 0)
        })

        // Check again after async operation
        const currentState = listenerSetupRef.current
        if (currentState.cancelled || currentState.sessionId !== currentSessionId) {
          unlisten()
          return
        }

        unlistenRef.current = unlisten
      } catch (err) {
        console.error('Failed to setup listener:', err)
      }
    }

    setupListener()

    // Handle keyboard input
    if (disposableRef.current) {
      disposableRef.current.dispose()
    }
    disposableRef.current = terminal.onData((data: string) => {
      if (isCopyingRef.current) return
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
  }, [activeSessionId, sessions])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div ref={panelRef} className="flex-1 bg-dark-900 relative overflow-hidden flex flex-col">
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
      <div
        ref={containerRef}
        className="flex-1"
        style={{ visibility: activeSession ? 'visible' : 'hidden' }}
      />
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
