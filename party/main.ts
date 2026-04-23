import type * as Party from 'partykit/server'

/**
 * In-memory lobby: JSON text only (displayName, presence, startMatch). No persistence.
 */
export default class Main implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(_conn: Party.Connection): void {
    this.broadcastPresence()
  }

  onMessage(message: string, sender: Party.Connection): void {
    if (typeof message !== 'string') return
    this.room.broadcast(message, [sender.id])
  }

  onClose(_conn: Party.Connection): void {
    this.broadcastPresence()
  }

  private broadcastPresence(): void {
    const count = [...this.room.getConnections()].length
    this.room.broadcast(JSON.stringify({ type: 'presence', count }))
  }
}
