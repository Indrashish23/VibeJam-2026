import PartySocket from 'partysocket'
import { getPartyKitHost } from './net/partyKitHost'

function randomRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `vj-${s}`
}

function wireLobbyDom(): {
  overlay: HTMLDivElement
  intro: HTMLElement
  err: HTMLElement
  create: HTMLButtonElement
  joinCode: HTMLInputElement
  joinBtn: HTMLButtonElement
  offline: HTMLButtonElement
  codeRow: HTMLElement
  codeDisplay: HTMLElement
  copyBtn: HTMLButtonElement
  status: HTMLElement
  start: HTMLButtonElement
} {
  return {
    overlay: document.getElementById('lobby-overlay') as HTMLDivElement,
    intro: document.getElementById('lobby-intro') as HTMLElement,
    err: document.getElementById('lobby-error') as HTMLElement,
    create: document.getElementById('lobby-create') as HTMLButtonElement,
    joinCode: document.getElementById('lobby-join-code') as HTMLInputElement,
    joinBtn: document.getElementById('lobby-join') as HTMLButtonElement,
    offline: document.getElementById('lobby-offline') as HTMLButtonElement,
    codeRow: document.getElementById('lobby-code-row') as HTMLElement,
    codeDisplay: document.getElementById('lobby-code-display') as HTMLElement,
    copyBtn: document.getElementById('lobby-copy') as HTMLButtonElement,
    status: document.getElementById('lobby-status') as HTMLElement,
    start: document.getElementById('lobby-start') as HTMLButtonElement,
  }
}

/**
 * After display name is set: optional PartyKit lobby, then into the match.
 * Text-only messages; no audio or DB.
 */
export function runLobbyGate(displayName: string): Promise<void> {
  const pkHost = getPartyKitHost()
  const ui = wireLobbyDom()

  ui.overlay.hidden = false
  ui.intro.textContent = `Signed in as ${displayName}. Create a code for a friend, join theirs, or play offline.`
  ui.err.hidden = true
  ui.err.textContent = ''
  ui.codeRow.hidden = true
  ui.start.hidden = true
  ui.status.textContent = pkHost
    ? `Realtime host: ${pkHost}${import.meta.env.DEV ? ' · run npm run party:dev in another terminal' : ''}`
    : import.meta.env.PROD
      ? 'Lobby disabled: add VITE_PARTYKIT_HOST in Vercel → Project → Settings → Environment Variables (your PartyKit host, no https://), then redeploy.'
      : 'PartyKit host missing. Use Play offline, or create .env.local with VITE_PARTYKIT_HOST=localhost:1999'
  ui.create.disabled = !pkHost
  ui.joinBtn.disabled = !pkHost
  ui.joinCode.disabled = !pkHost

  return new Promise((resolve) => {
    let socket: PartySocket | null = null
    let isHost = false
    let roomId = ''
    let guestSeen = false

    const cleanup = () => {
      socket?.close()
      socket = null
    }

    const done = () => {
      cleanup()
      ui.overlay.hidden = true
      ui.start.hidden = true
      ui.codeRow.hidden = true
      resolve()
    }

    const setErr = (msg: string) => {
      ui.err.textContent = msg
      ui.err.hidden = false
    }

    const clearErr = () => {
      ui.err.hidden = true
      ui.err.textContent = ''
    }

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return
      let data: { type?: string; displayName?: string; role?: string; count?: number }
      try {
        data = JSON.parse(ev.data) as typeof data
      } catch {
        return
      }
      if (data.type === 'presence' && typeof data.count === 'number') {
        ui.status.textContent = `In lobby (${roomId}): ${data.count} connected`
        if (isHost && data.count >= 2) {
          guestSeen = true
          ui.start.hidden = false
        }
        return
      }
      if (data.type === 'hello' && data.role === 'guest') {
        guestSeen = true
        ui.status.textContent = `Guest joined: ${data.displayName ?? 'Player'}`
        if (isHost) ui.start.hidden = false
        return
      }
      if (data.type === 'hello' && data.role === 'host') {
        ui.status.textContent = `Host is ${data.displayName ?? 'Player'}`
        return
      }
      if (data.type === 'startMatch') {
        done()
      }
    }

    ui.offline.onclick = () => {
      clearErr()
      done()
    }

    ui.copyBtn.onclick = async () => {
      const code = roomId.replace(/^vj-/, '')
      try {
        await navigator.clipboard.writeText(code)
        ui.status.textContent = 'Code copied.'
      } catch {
        ui.status.textContent = `Code: ${code} (copy manually)`
      }
    }

    ui.create.onclick = () => {
      clearErr()
      cleanup()
      isHost = true
      roomId = randomRoomId()
      const code = roomId.replace(/^vj-/, '')
      ui.codeRow.hidden = false
      ui.codeDisplay.textContent = code
      ui.start.hidden = true
      guestSeen = false

      if (!pkHost) return
      socket = new PartySocket({ host: pkHost, room: roomId })
      socket.addEventListener('open', () => {
        socket?.send(
          JSON.stringify({ type: 'hello', displayName, role: 'host' }),
        )
      })
      socket.addEventListener('message', onMessage)
      socket.addEventListener('error', () => setErr('Connection error — check PartyKit dev server or host env.'))
    }

    ui.joinBtn.onclick = () => {
      clearErr()
      cleanup()
      isHost = false
      const raw = ui.joinCode.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      if (raw.length < 4) {
        setErr('Enter a lobby code (at least 4 characters).')
        return
      }
      roomId = raw.startsWith('vj-') ? raw : `vj-${raw}`
      ui.codeRow.hidden = true
      ui.start.hidden = true

      if (!pkHost) return
      socket = new PartySocket({ host: pkHost, room: roomId })
      socket.addEventListener('open', () => {
        socket?.send(
          JSON.stringify({ type: 'hello', displayName, role: 'guest' }),
        )
      })
      socket.addEventListener('message', onMessage)
      socket.addEventListener('error', () => setErr('Could not join — check code and PartyKit host.'))
    }

    ui.start.onclick = () => {
      if (!isHost || !guestSeen) return
      socket?.send(JSON.stringify({ type: 'startMatch' }))
      done()
    }
  })
}
