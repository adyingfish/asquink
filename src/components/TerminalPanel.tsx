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
}

export default function TerminalPanel({ sessions, activeSessionId }: TerminalPanelProps) {
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

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

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
        <div ref={containerRef} className="w-full h-full p-2" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-4">🖥️</div>
            <div className="text-lg">No active session</div>
            <div className="text-sm mt-2">Click the + button to open a terminal</div>
          </div>
        </div>
      )}
    </div>
  )
}
