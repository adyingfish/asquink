import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { listen, type Event } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { Session } from '../App'

function isVisible(element: HTMLElement): boolean {
  return element.offsetParent !== null && element.getClientRects().length > 0
}

interface TerminalState {
  sessionId: string
  terminal: Terminal
  fitAddon: FitAddon
  container: HTMLDivElement | null
  opened: boolean
  pendingOutput: string
  unlisten: (() => void) | null
  dataDisposable: { dispose: () => void } | null
  parsedDisposable: { dispose: () => void } | null
  pasteTarget: HTMLTextAreaElement | null
  handlePaste: ((event: ClipboardEvent) => void) | null
  resizeFrame: number | null
  resizeRetry: number | null
  renderSyncFrame: number | null
  renderSyncRetry: number | null
  outputIdleSync: number | null
  lastTerminalDims: { cols: number; rows: number }
  layoutReady: boolean
  receivedOutput: boolean
}

export class TerminalController {
  private sessions: Session[] = []
  private activeSessionId: string | null = null
  private states = new Map<string, TerminalState>()
  private preferredPtyDims = { cols: 80, rows: 24 }
  private isCopying = false

  mountSession(sessionId: string, container: HTMLDivElement): void {
    const state = this.getOrCreateState(sessionId)
    if (state.container === container && state.opened) {
      return
    }

    state.container = container
    if (!state.opened) {
      state.terminal.open(container)
      state.opened = true
      this.bindPasteHandlers(state)
      if (state.pendingOutput) {
        state.terminal.write(state.pendingOutput)
        state.pendingOutput = ''
      }
    }

    this.scheduleResize(sessionId)
    window.setTimeout(() => this.scheduleResize(sessionId), 150)
  }

  setContext(sessions: Session[], activeSessionId: string | null): void {
    this.sessions = sessions
    this.activeSessionId = activeSessionId
    this.pruneStates()

    if (!activeSessionId) {
      return
    }

    const activeState = this.states.get(activeSessionId)
    if (!activeState) {
      return
    }

    this.scheduleResize(activeSessionId)
    if (activeState.opened) {
      activeState.terminal.focus()
    }
  }

  scheduleResize(sessionId?: string): void {
    const targetSessionId = sessionId ?? this.activeSessionId
    if (!targetSessionId) {
      return
    }

    const state = this.states.get(targetSessionId)
    if (!state || !state.container) {
      return
    }

    if (state.resizeFrame) {
      cancelAnimationFrame(state.resizeFrame)
    }
    if (state.resizeRetry) {
      clearTimeout(state.resizeRetry)
    }

    state.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeNow(state)
      state.resizeRetry = window.setTimeout(() => this.resizeNow(state), 120)
    })
  }

  getPreferredPtySize(): { cols: number; rows: number } {
    if (this.activeSessionId) {
      const activeState = this.states.get(this.activeSessionId)
      if (activeState) {
        this.ensureLayoutReady(activeState)
        if (activeState.terminal.cols > 0 && activeState.terminal.rows > 0) {
          return { cols: activeState.terminal.cols, rows: activeState.terminal.rows }
        }
      }
    }

    return this.preferredPtyDims
  }

  resetSession(sessionId: string): void {
    const state = this.states.get(sessionId)
    if (!state) {
      return
    }

    state.pendingOutput = ''
    state.receivedOutput = false
    state.layoutReady = false
    state.lastTerminalDims = { cols: 0, rows: 0 }

    if (state.opened) {
      state.terminal.reset()
      if (this.activeSessionId === sessionId) {
        this.scheduleResize(sessionId)
      }
    }
  }

  dispose(): void {
    for (const state of this.states.values()) {
      this.disposeState(state)
    }
    this.states.clear()
    this.sessions = []
    this.activeSessionId = null
  }

  private getOrCreateState(sessionId: string): TerminalState {
    const existing = this.states.get(sessionId)
    if (existing) {
      return existing
    }

    const terminal = new Terminal({
      theme: this.getTerminalTheme(),
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    const state: TerminalState = {
      sessionId,
      terminal,
      fitAddon,
      container: null,
      opened: false,
      pendingOutput: '',
      unlisten: null,
      dataDisposable: null,
      parsedDisposable: null,
      pasteTarget: null,
      handlePaste: null,
      resizeFrame: null,
      resizeRetry: null,
      renderSyncFrame: null,
      renderSyncRetry: null,
      outputIdleSync: null,
      lastTerminalDims: { cols: 0, rows: 0 },
      layoutReady: false,
      receivedOutput: false,
    }

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

      if (domEvent.ctrlKey && (domEvent.key.toLowerCase() === 'v' || (domEvent.shiftKey && domEvent.key === 'V'))) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        readText()
          .then((text) => this.writeTextToSession(sessionId, text))
          .catch((err) => {
            console.error('Paste failed:', err)
          })
      }
    })

    state.dataDisposable = terminal.onData((data: string) => {
      if (this.isCopying || this.activeSessionId !== sessionId) {
        return
      }
      this.writeToSession(sessionId, data)
    })

    state.parsedDisposable = terminal.onWriteParsed(() => {
      if (this.activeSessionId !== sessionId) {
        return
      }
      this.syncViewportToBottom(state)
    })

    this.states.set(sessionId, state)
    this.setupOutputListener(state)
    return state
  }

  private async setupOutputListener(state: TerminalState): Promise<void> {
    try {
      const unlisten = await listen(`terminal-data-${state.sessionId}`, (event: Event<unknown>) => {
        let textToWrite = ''
        if (Array.isArray(event.payload)) {
          const data = new Uint8Array(event.payload)
          textToWrite = new TextDecoder().decode(data)
        } else if (event.payload instanceof Uint8Array) {
          textToWrite = new TextDecoder().decode(event.payload)
        } else if (event.payload instanceof ArrayBuffer) {
          textToWrite = new TextDecoder().decode(new Uint8Array(event.payload))
        } else if (typeof event.payload === 'string') {
          textToWrite = event.payload
        } else {
          return
        }

        if (!state.receivedOutput) {
          state.receivedOutput = true
          this.ensureLayoutReady(state)
        }

        if (!state.opened) {
          state.pendingOutput += textToWrite
          if (state.pendingOutput.length > 250000) {
            state.pendingOutput = state.pendingOutput.slice(state.pendingOutput.length - 250000)
          }
          return
        }

        try {
          state.terminal.write(textToWrite)
        } catch (writeError) {
          console.error('Terminal write failed:', writeError)
          return
        }
        this.scheduleOutputIdleSync(state)
      })

      const current = this.states.get(state.sessionId)
      if (current !== state) {
        unlisten()
        return
      }
      state.unlisten = unlisten
    } catch (err) {
      console.error('Failed to setup listener:', err)
    }
  }

  private disposeState(state: TerminalState): void {
    if (state.unlisten) {
      state.unlisten()
      state.unlisten = null
    }
    if (state.dataDisposable) {
      state.dataDisposable.dispose()
      state.dataDisposable = null
    }
    if (state.parsedDisposable) {
      state.parsedDisposable.dispose()
      state.parsedDisposable = null
    }

    this.removePasteHandlers(state)

    if (state.resizeFrame) {
      cancelAnimationFrame(state.resizeFrame)
      state.resizeFrame = null
    }
    if (state.resizeRetry) {
      clearTimeout(state.resizeRetry)
      state.resizeRetry = null
    }
    if (state.renderSyncFrame) {
      cancelAnimationFrame(state.renderSyncFrame)
      state.renderSyncFrame = null
    }
    if (state.renderSyncRetry) {
      clearTimeout(state.renderSyncRetry)
      state.renderSyncRetry = null
    }
    if (state.outputIdleSync) {
      clearTimeout(state.outputIdleSync)
      state.outputIdleSync = null
    }

    state.terminal.dispose()
    state.container = null
    state.opened = false
  }

  private pruneStates(): void {
    const validSessionIds = new Set(this.sessions.map((session) => session.id))

    for (const [sessionId, state] of this.states.entries()) {
      if (!validSessionIds.has(sessionId)) {
        this.disposeState(state)
        this.states.delete(sessionId)
      }
    }
  }

  private resizeNow(state: TerminalState): void {
    if (!state.container || !state.opened) {
      return
    }
    if (!isVisible(state.container)) {
      return
    }

    const { width, height } = state.container.getBoundingClientRect()
    if (width <= 0 || height <= 0) {
      return
    }

    const previous = { cols: state.terminal.cols, rows: state.terminal.rows }
    state.fitAddon.fit()

    const next = { cols: state.terminal.cols, rows: state.terminal.rows }
    const changed = next.cols !== state.lastTerminalDims.cols || next.rows !== state.lastTerminalDims.rows

    state.lastTerminalDims = next
    state.layoutReady = next.cols > 0 && next.rows > 0
    if (next.cols > 0 && next.rows > 0) {
      this.preferredPtyDims = next
    }

    if (!changed) {
      return
    }

    const session = this.sessions.find((item) => item.id === state.sessionId)
    if (session?.status === 'connected') {
      invoke('resize_session', {
        sessionId: state.sessionId,
        sessionType: session.type,
        cols: next.cols,
        rows: next.rows,
      }).catch(console.error)
    }

    if (this.activeSessionId === state.sessionId && (previous.cols !== next.cols || previous.rows !== next.rows)) {
      this.syncViewportToBottom(state)
    }
  }

  private ensureLayoutReady(state: TerminalState): void {
    if (!state.container || !state.opened) {
      return
    }
    if (state.layoutReady) {
      return
    }
    if (!isVisible(state.container)) {
      return
    }

    const { width, height } = state.container.getBoundingClientRect()
    if (width <= 0 || height <= 0) {
      return
    }

    state.fitAddon.fit()
    state.lastTerminalDims = { cols: state.terminal.cols, rows: state.terminal.rows }
    state.layoutReady = state.terminal.cols > 0 && state.terminal.rows > 0
    if (state.layoutReady) {
      this.preferredPtyDims = { cols: state.terminal.cols, rows: state.terminal.rows }
    }
  }

  private syncViewportToBottom(state: TerminalState): void {
    if (!state.opened) {
      return
    }

    if (state.renderSyncFrame) {
      cancelAnimationFrame(state.renderSyncFrame)
    }
    if (state.renderSyncRetry) {
      clearTimeout(state.renderSyncRetry)
    }

    state.renderSyncFrame = window.requestAnimationFrame(() => {
      const buffer = state.terminal.buffer.active
      if (buffer.viewportY !== buffer.baseY) {
        state.terminal.scrollToBottom()
      }
      state.terminal.refresh(0, Math.max(state.terminal.rows - 1, 0))

      state.renderSyncRetry = window.setTimeout(() => {
        const retryBuffer = state.terminal.buffer.active
        if (retryBuffer.viewportY !== retryBuffer.baseY) {
          state.terminal.scrollToBottom()
        }
        state.terminal.refresh(0, Math.max(state.terminal.rows - 1, 0))
      }, 40)
    })
  }

  private scheduleOutputIdleSync(state: TerminalState): void {
    if (state.outputIdleSync) {
      clearTimeout(state.outputIdleSync)
    }

    state.outputIdleSync = window.setTimeout(() => {
      this.ensureLayoutReady(state)
      if (this.activeSessionId === state.sessionId) {
        this.syncViewportToBottom(state)
      }
    }, 120)
  }

  private bindPasteHandlers(state: TerminalState): void {
    if (!state.container) {
      return
    }

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const clipboardText = event.clipboardData?.getData('text')
      if (clipboardText) {
        this.writeTextToSession(state.sessionId, clipboardText)
        return
      }

      readText()
        .then((text) => this.writeTextToSession(state.sessionId, text))
        .catch((err) => {
          console.error('Paste failed:', err)
        })
    }

    state.container.addEventListener('paste', handlePaste as EventListener)
    state.pasteTarget = state.container.querySelector('textarea.xterm-helper-textarea')
    state.pasteTarget?.addEventListener('paste', handlePaste as EventListener)
    state.handlePaste = handlePaste
  }

  private removePasteHandlers(state: TerminalState): void {
    if (!state.handlePaste || !state.container) {
      return
    }

    state.container.removeEventListener('paste', state.handlePaste as EventListener)
    state.pasteTarget?.removeEventListener('paste', state.handlePaste as EventListener)
    state.handlePaste = null
    state.pasteTarget = null
  }

  private writeToSession(sessionId: string, data: string): void {
    if (!data) {
      return
    }

    const session = this.sessions.find((item) => item.id === sessionId)
    if (session?.status !== 'connected') {
      return
    }

    invoke('write_to_session', {
      sessionId,
      sessionType: session.type,
      data,
    }).catch(console.error)
  }

  private writeTextToSession(sessionId: string, text: string): void {
    if (!text) {
      return
    }

    const session = this.sessions.find((item) => item.id === sessionId)
    if (session?.status !== 'connected') {
      return
    }

    let processedText = text
    processedText = processedText.replace(/\r\n/g, '\r')
    processedText = processedText.replace(/\n/g, '\r')

    invoke('write_to_session', {
      sessionId,
      sessionType: session.type,
      data: processedText,
    }).catch(console.error)
  }

  private getTerminalTheme() {
    return {
      background: '#141922',
      foreground: '#e0e0e0',
      cursor: '#e0e0e0',
      selectionBackground: 'rgba(128, 138, 156, 0.35)',
      black: '#000000',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#bfbfbf',
    }
  }
}
