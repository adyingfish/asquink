import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { Session } from '../App'
import type { TerminalController } from './terminalController'

interface TerminalPanelProps {
  controller: TerminalController
  sessions: Session[]
  activeSessionId: string | null
}

export default function TerminalPanel({ controller, sessions, activeSessionId }: TerminalPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    controller.mount(containerRef.current)
    controller.setContext(sessions, activeSessionId)
    controller.scheduleResize()
  }, [controller, sessions, activeSessionId])

  useEffect(() => {
    if (!panelRef.current || !containerRef.current) {
      return
    }

    const handleResize = () => {
      controller.scheduleResize()
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(panelRef.current)
    observer.observe(containerRef.current)
    handleResize()

    return () => {
      observer.disconnect()
    }
  }, [controller])

  const activeSession = sessions.find(session => session.id === activeSessionId)

  return (
    <div ref={panelRef} className="flex-1 bg-dark-900 relative overflow-hidden flex flex-col min-h-0">
      {activeSession && (
        <div className="flex items-center gap-4 px-4 py-2 bg-dark-800 border-b border-dark-600 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Session:</span>
            <span className="font-medium">{activeSession.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <span
              className={`font-medium ${
                activeSession.status === 'connected'
                  ? 'text-green-400'
                  : activeSession.status === 'connecting'
                    ? 'text-yellow-400'
                    : 'text-red-400'
              }`}
            >
              {activeSession.status}
            </span>
            {activeSession.status === 'connecting' && <span className="animate-pulse">...</span>}
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full min-h-0"
        style={{ display: activeSession ? 'block' : 'none' }}
      />
      {!activeSession && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600">
          <div className="text-center">
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
