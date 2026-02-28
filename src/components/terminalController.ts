import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { listen, type Event } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { Session } from '../App'

function isVisible(element: HTMLElement): boolean {
  return element.offsetParent !== null && element.getClientRects().length > 0
}

export class TerminalController {
  private terminal: Terminal | null = null
  private fitAddon: FitAddon | null = null
  private container: HTMLDivElement | null = null
  private sessions: Session[] = []
  private activeSessionId: string | null = null
  private lastBoundSessionId: string | null = null
  private unlisten: (() => void) | null = null
  private disposable: { dispose: () => void } | null = null
  private parsedDisposable: { dispose: () => void } | null = null
  private listenerState = { cancelled: false, sessionId: null as string | null }
  private scrollTimeout: number | null = null
  private resizeFrame: number | null = null
  private resizeRetry: number | null = null
  private renderSyncFrame: number | null = null
  private renderSyncRetry: number | null = null
  private outputIdleSync: number | null = null
  private lastTerminalDims = { cols: 0, rows: 0 }
  private preferredPtyDims = { cols: 80, rows: 24 }
  private isCopying = false
  private pasteTarget: HTMLTextAreaElement | null = null
  private layoutReady = false
  private receivedOutputForSession = false

  mount(container: HTMLDivElement): void {
    if (this.container === container && this.terminal) {
      return
    }

    this.container = container

    if (!this.terminal) {
      this.initializeTerminal()
    }

    if (!this.terminal || !this.container || this.container.childElementCount > 0) {
      return
    }

    this.terminal.open(this.container)
    this.bindPasteHandlers()
    this.scheduleResize()
    window.setTimeout(() => this.scheduleResize(), 150)
  }

  setContext(sessions: Session[], activeSessionId: string | null): void {
    this.sessions = sessions
    this.activeSessionId = activeSessionId

    if (!this.terminal) {
      return
    }

    if (!activeSessionId) {
      this.lastBoundSessionId = null
      this.teardownSessionBinding()
      return
    }

    const activeSession = this.sessions.find(session => session.id === activeSessionId)
    if (!activeSession) {
      this.lastBoundSessionId = null
      this.teardownSessionBinding()
      return
    }

    if (this.lastBoundSessionId !== activeSessionId) {
      this.bindActiveSession(activeSessionId)
    } else {
      this.scheduleResize()
    }
  }

  scheduleResize(): void {
    if (!this.container) {
      return
    }

    if (this.resizeFrame) {
      cancelAnimationFrame(this.resizeFrame)
    }
    if (this.resizeRetry) {
      clearTimeout(this.resizeRetry)
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeNow()
      this.resizeRetry = window.setTimeout(() => this.resizeNow(), 120)
    })
  }

  getPreferredPtySize(): { cols: number; rows: number } {
    this.ensureLayoutReady()

    if (this.terminal && this.terminal.cols > 0 && this.terminal.rows > 0) {
      return { cols: this.terminal.cols, rows: this.terminal.rows }
    }

    return this.preferredPtyDims
  }

  dispose(): void {
    this.teardownSessionBinding()
    this.removePasteHandlers()

    if (this.resizeFrame) {
      cancelAnimationFrame(this.resizeFrame)
      this.resizeFrame = null
    }
    if (this.resizeRetry) {
      clearTimeout(this.resizeRetry)
      this.resizeRetry = null
    }
    if (this.renderSyncFrame) {
      cancelAnimationFrame(this.renderSyncFrame)
      this.renderSyncFrame = null
    }
    if (this.renderSyncRetry) {
      clearTimeout(this.renderSyncRetry)
      this.renderSyncRetry = null
    }
    if (this.outputIdleSync) {
      clearTimeout(this.outputIdleSync)
      this.outputIdleSync = null
    }
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = null
    }

    this.terminal?.dispose()
    this.terminal = null
    this.fitAddon = null
    this.container = null
    this.lastBoundSessionId = null
    this.lastTerminalDims = { cols: 0, rows: 0 }
    this.layoutReady = false
    this.receivedOutputForSession = false
  }

  private initializeTerminal(): void {
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

    terminal.onKey(({ domEvent, key }) => {
      if (domEvent.ctrlKey && (domEvent.key === 'c' || key === '\x03')) {
        const selection = terminal.getSelection()
        if (selection) {
          writeText(selection).catch(console.error)
          terminal.clearSelection()
          this.isCopying = true
          window.setTimeout(() => {
            this.isCopying = false
          }, 50)
          domEvent.preventDefault()
          domEvent.stopPropagation()
          return
        }
      }

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

      if (domEvent.ctrlKey && (domEvent.key === 'v' || (domEvent.shiftKey && domEvent.key === 'V'))) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        readText()
          .then(text => this.writeToActiveSession(text))
          .catch(err => {
            console.error('Paste failed:', err)
          })
      }
    })

    this.terminal = terminal
    this.fitAddon = fitAddon
  }

  private bindActiveSession(sessionId: string): void {
    if (!this.terminal) {
      return
    }

    this.teardownSessionBinding(false)
    this.lastBoundSessionId = sessionId
    this.listenerState = { cancelled: false, sessionId }
    this.terminal.reset()
    this.lastTerminalDims = { cols: 0, rows: 0 }
    this.layoutReady = false
    this.receivedOutputForSession = false
    this.scheduleResize()
    window.setTimeout(() => {
      if (this.activeSessionId === sessionId) {
        this.scheduleResize()
      }
    }, 180)

    this.setupOutputListener(sessionId)

    this.disposable = this.terminal.onData((data: string) => {
      if (this.isCopying || this.activeSessionId !== sessionId) {
        return
      }

      const session = this.sessions.find(item => item.id === sessionId)
      if (session?.status === 'connected') {
        invoke('write_to_session', {
          sessionId,
          sessionType: session.type,
          data,
        }).catch(console.error)
      }
    })

    this.parsedDisposable = this.terminal.onWriteParsed(() => {
      if (this.activeSessionId !== sessionId) {
        return
      }
      this.syncViewportToBottom()
    })
  }

  private teardownSessionBinding(resetLastBoundSession = true): void {
    this.listenerState.cancelled = true

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = null
    }
    if (this.outputIdleSync) {
      clearTimeout(this.outputIdleSync)
      this.outputIdleSync = null
    }
    if (this.disposable) {
      this.disposable.dispose()
      this.disposable = null
    }
    if (this.parsedDisposable) {
      this.parsedDisposable.dispose()
      this.parsedDisposable = null
    }
    if (this.unlisten) {
      this.unlisten()
      this.unlisten = null
    }
    if (resetLastBoundSession) {
      this.lastBoundSessionId = null
    }
  }

  private async setupOutputListener(sessionId: string): Promise<void> {
    try {
      const unlisten = await listen(`terminal-data-${sessionId}`, (event: Event<unknown>) => {
        if (!this.terminal || this.activeSessionId !== sessionId) {
          return
        }

        let textToWrite = ''
        if (event.payload instanceof Array) {
          const data = new Uint8Array(event.payload as number[])
          textToWrite = new TextDecoder().decode(data)
        } else if (typeof event.payload === 'string') {
          textToWrite = event.payload
        } else {
          return
        }

        if (!this.receivedOutputForSession) {
          this.receivedOutputForSession = true
          this.ensureLayoutReady()
        }

        this.terminal.write(textToWrite)
        this.scheduleOutputIdleSync()
      })

      if (this.listenerState.cancelled || this.listenerState.sessionId !== sessionId) {
        unlisten()
        return
      }

      this.unlisten = unlisten
    } catch (err) {
      console.error('Failed to setup listener:', err)
    }
  }

  private resizeNow(): void {
    if (!this.container || !this.terminal || !this.fitAddon) {
      return
    }
    if (!isVisible(this.container)) {
      return
    }

    const { width, height } = this.container.getBoundingClientRect()
    if (width <= 0 || height <= 0) {
      return
    }

    const previous = { cols: this.terminal.cols, rows: this.terminal.rows }
    this.fitAddon.fit()

    const next = { cols: this.terminal.cols, rows: this.terminal.rows }
    const changed =
      next.cols !== this.lastTerminalDims.cols ||
      next.rows !== this.lastTerminalDims.rows

    this.lastTerminalDims = next
    if (next.cols > 0 && next.rows > 0) {
      this.preferredPtyDims = next
    }
    this.layoutReady = next.cols > 0 && next.rows > 0
    if (!changed || !this.activeSessionId) {
      return
    }

    const session = this.sessions.find(item => item.id === this.activeSessionId)
    if (session?.status === 'connected') {
      invoke('resize_session', {
        sessionId: this.activeSessionId,
        sessionType: session.type,
        cols: next.cols,
        rows: next.rows,
      }).catch(console.error)
    }

    if (previous.cols !== next.cols || previous.rows !== next.rows) {
      this.syncViewportToBottom()
    }
  }

  private syncViewportToBottom(): void {
    if (!this.terminal) {
      return
    }

    if (this.renderSyncFrame) {
      cancelAnimationFrame(this.renderSyncFrame)
    }
    if (this.renderSyncRetry) {
      clearTimeout(this.renderSyncRetry)
    }

    this.renderSyncFrame = window.requestAnimationFrame(() => {
      if (!this.terminal) {
        return
      }

      const buffer = this.terminal.buffer.active
      if (buffer.viewportY !== buffer.baseY) {
        this.terminal.scrollToBottom()
      }
      this.terminal.refresh(0, Math.max(this.terminal.rows - 1, 0))

      this.renderSyncRetry = window.setTimeout(() => {
        if (!this.terminal) {
          return
        }
        const retryBuffer = this.terminal.buffer.active
        if (retryBuffer.viewportY !== retryBuffer.baseY) {
          this.terminal.scrollToBottom()
        }
        this.terminal.refresh(0, Math.max(this.terminal.rows - 1, 0))
      }, 40)
    })
  }

  private ensureLayoutReady(): void {
    if (!this.terminal || !this.fitAddon || !this.container) {
      return
    }
    if (this.layoutReady) {
      return
    }
    if (!isVisible(this.container)) {
      return
    }

    const { width, height } = this.container.getBoundingClientRect()
    if (width <= 0 || height <= 0) {
      return
    }

    this.fitAddon.fit()
    this.lastTerminalDims = { cols: this.terminal.cols, rows: this.terminal.rows }
    if (this.terminal.cols > 0 && this.terminal.rows > 0) {
      this.preferredPtyDims = { cols: this.terminal.cols, rows: this.terminal.rows }
    }
    this.layoutReady = this.terminal.cols > 0 && this.terminal.rows > 0
  }

  private scheduleOutputIdleSync(): void {
    if (this.outputIdleSync) {
      clearTimeout(this.outputIdleSync)
    }

    this.outputIdleSync = window.setTimeout(() => {
      this.ensureLayoutReady()
      this.syncViewportToBottom()
    }, 120)
  }

  private bindPasteHandlers(): void {
    if (!this.container) {
      return
    }

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const clipboardText = event.clipboardData?.getData('text')
      if (clipboardText) {
        this.writeToActiveSession(clipboardText)
        return
      }

      readText()
        .then(text => this.writeToActiveSession(text))
        .catch(err => {
          console.error('Paste failed:', err)
        })
    }

    this.container.addEventListener('paste', handlePaste as EventListener)
    this.pasteTarget = this.container.querySelector('textarea.xterm-helper-textarea')
    this.pasteTarget?.addEventListener('paste', handlePaste as EventListener)
    this.handlePaste = handlePaste
  }

  private handlePaste: ((event: ClipboardEvent) => void) | null = null

  private removePasteHandlers(): void {
    if (!this.handlePaste || !this.container) {
      return
    }

    this.container.removeEventListener('paste', this.handlePaste as EventListener)
    this.pasteTarget?.removeEventListener('paste', this.handlePaste as EventListener)
    this.handlePaste = null
    this.pasteTarget = null
  }

  private writeToActiveSession(text: string): void {
    if (!text || !this.activeSessionId) {
      return
    }

    const session = this.sessions.find(item => item.id === this.activeSessionId)
    if (session?.status !== 'connected') {
      return
    }

    invoke('write_to_session', {
      sessionId: this.activeSessionId,
      sessionType: session.type,
      data: text,
    }).catch(console.error)
  }
}
