import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { listen, Event } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import '@xterm/xterm/css/xterm.css'
import type { Session } from '../App'

interface TerminalPanelProps {
  sessions: Session[]
  activeSessionId: string | null
  onSessionStatusChange?: (id: string, status: Session['status']) => void
}

export default function TerminalPanel({ sessions, activeSessionId, onSessionStatusChange }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

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
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

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
      terminal.dispose()
    }
  }, [])

  // Handle session change - setup data listener
  useEffect(() => {
    if (!activeSessionId || !terminalRef.current) return
    
    const activeSession = sessions.find(s => s.id === activeSessionId)
    if (!activeSession) return

    const terminal = terminalRef.current
    
    // Clear and show session info
    terminal.clear()
    terminal.writeln(`\x1b[1;32mSession: ${activeSession.name}\x1b[0m`)
    terminal.writeln(`\x1b[90mStatus: ${activeSession.status}\x1b[0m`)
    terminal.writeln('')

    // Update status to connected after a delay (simulating connection)
    if (activeSession.status === 'connecting') {
      setTimeout(() => {
        onSessionStatusChange?.(activeSessionId, 'connected')
      }, 1000)
    }

    // Setup event listener for terminal data
    const setupListener = async () => {
      // Clean up previous listener
      if (unlistenRef.current) {
        unlistenRef.current()
      }

      const unlisten = await listen(`terminal-data-${activeSessionId}`, (event: Event<unknown>) => {
        if (event.payload instanceof Array) {
          const data = new Uint8Array(event.payload as number[])
          const decoder = new TextDecoder()
          terminal.write(decoder.decode(data))
        } else if (typeof event.payload === 'string') {
          terminal.write(event.payload)
        }
      })
      
      unlistenRef.current = unlisten
    }

    setupListener()

    // Handle keyboard input
    const onData = (data: string) => {
      if (activeSession.status === 'connected') {
        invoke('write_to_session', {
          sessionId: activeSessionId,
          sessionType: activeSession.type,
          data,
        }).catch(console.error)
      }
    }
    
    const disposable = terminal.onData(onData)

    return () => {
      disposable.dispose()
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [activeSessionId, sessions])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div className="flex-1 bg-dark-900 relative overflow-hidden">
      {activeSession ? (
        <div className="w-full h-full flex flex-col">
          {/* Status bar */}
          <div className="flex items-center gap-4 px-4 py-2 bg-dark-800 border-b border-dark-600 text-xs">
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
          {/* Terminal */}
          <div ref={containerRef} className="flex-1 p-2" />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600">
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
