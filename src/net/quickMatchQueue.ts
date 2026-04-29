import { createMultiplayerSocket, type MultiplayerWire } from './multiplayerSocket'
import { type CoarseRegion } from './regionTag'

const DEBUG_QM = true
function qmLog(...args: unknown[]): void {
  if (!DEBUG_QM) return
  console.info('[quickMatch]', ...args)
}

/**
 * Queue room id for a coarse region (or `global` for the cross-region fallback).
 * Sharding by region keeps gossip O(N) per region and lets the relay edge route
 * each room close to its participants instead of pinning everyone to one origin.
 */
export const QUICK_MATCH_ROOM_BASE = 'vj-quick-queue'

/** Default time before quick match falls back to a solo match (smart opponent). */
export const QUICK_MATCH_TIMEOUT_MS = 20_000

/** Drop a presence entry that hasn't sent a heartbeat in this long. */
const PRESENCE_STALE_MS = 12_000
/** Heartbeat cadence; multiple ticks must elapse before remote peers prune us. */
const PRESENCE_HEARTBEAT_MS = 3_000
/**
 * Maximum age of a `queuePair` message (compared to `Date.now()`); rejecting old pairs
 * prevents a tab that re-enters the queue from being immediately matched into a stale
 * room broadcast on a previous session.
 */
const PAIR_FRESHNESS_MS = 8_000
/**
 * After this long with no in-region match, also join the global queue room so
 * sparse regions don't always fall through to the bot.
 */
const FALLBACK_TO_GLOBAL_MS = 8_000

type QueueHelloMsg = {
  type: 'queueHello'
  peerId: string
  name: string
  joinedAt: number
  ts: number
}

type QueueByeMsg = {
  type: 'queueBye'
  peerId: string
}

type QueuePairMsg = {
  type: 'queuePair'
  roomId: string
  shortCode: string
  hostPeerId: string
  guestPeerId: string
  ts: number
}

type QueueIncoming = QueueHelloMsg | QueueByeMsg | QueuePairMsg

function isHello(raw: unknown): raw is QueueHelloMsg {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    o.type === 'queueHello' &&
    typeof o.peerId === 'string' &&
    typeof o.name === 'string' &&
    typeof o.joinedAt === 'number' &&
    typeof o.ts === 'number'
  )
}

function isBye(raw: unknown): raw is QueueByeMsg {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return o.type === 'queueBye' && typeof o.peerId === 'string'
}

function isPair(raw: unknown): raw is QueuePairMsg {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    o.type === 'queuePair' &&
    typeof o.roomId === 'string' &&
    typeof o.shortCode === 'string' &&
    typeof o.hostPeerId === 'string' &&
    typeof o.guestPeerId === 'string' &&
    typeof o.ts === 'number'
  )
}

function parseQueueMessage(raw: unknown): QueueIncoming | null {
  if (isHello(raw)) return raw
  if (isBye(raw)) return raw
  if (isPair(raw)) return raw
  return null
}

function generatePeerId(): string {
  return `qp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `vj-${s}`
}

export type QuickMatchPaired = {
  outcome: 'paired'
  role: 'host' | 'guest'
  roomId: string
  shortCode: string
}

export type QuickMatchBotFallback = {
  outcome: 'botFallback'
}

export type QuickMatchCancelled = {
  outcome: 'cancelled'
}

export type QuickMatchResult =
  | QuickMatchPaired
  | QuickMatchBotFallback
  | QuickMatchCancelled

export type QuickMatchHandle = {
  promise: Promise<QuickMatchResult>
  cancel: () => void
}

export type QuickMatchOptions = {
  playerName: string
  /** Coarse region used to pick the regional queue room (and skip the global fallback when already global). */
  region: CoarseRegion
  /** Falls back to {@link QUICK_MATCH_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Called once when the timeout elapses and the bot fallback is being prepared (for UI hints). */
  onTimeoutPhase?: () => void
  /** Called once when the global fallback room is opened (after {@link FALLBACK_TO_GLOBAL_MS}). */
  onGlobalFallback?: () => void
}

type RosterEntry = {
  peerId: string
  name: string
  joinedAt: number
  lastTs: number
}

type QueueRoom = {
  /** Diagnostic label only; e.g. `regional` / `global`. */
  label: string
  roomId: string
  socket: MultiplayerWire
  open: boolean
}

/**
 * Open the per-region queue room (and, after a brief delay, the global room
 * as a fallback) and resolve as soon as we are matched into a fresh
 * `vj-XXXXXX` room as host or guest. If no match happens within `timeoutMs`,
 * resolve with `botFallback` so the caller can spin up a smart-bot match in a
 * fresh room (matching a normal PvP setup).
 *
 * Pairing uses a deterministic election: the lowest peerId across the
 * unified roster (sorted by `joinedAt` then `peerId`) is responsible for
 * proposing pairs. It picks itself as host and the next-oldest waiter as
 * guest, broadcasts `queuePair` to all rooms it is in, then leaves. All
 * other clients drop the paired peers from their roster.
 *
 * Multi-room handling: when the global fallback opens, this client gossips
 * presence on both rooms and the unified roster matches whoever it can see.
 * A peer is "the same peer" iff its `peerId` matches; duplicate hellos from
 * regional + global just refresh the same roster entry.
 */
export function runQuickMatchQueue(opts: QuickMatchOptions): QuickMatchHandle {
  const timeoutMs = opts.timeoutMs ?? QUICK_MATCH_TIMEOUT_MS
  const peerId = generatePeerId()
  const joinedAt = Date.now()
  const roster = new Map<string, RosterEntry>()
  const rooms: QueueRoom[] = []

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pruneTimer: ReturnType<typeof setInterval> | null = null
  let pairProposalTimer: ReturnType<typeof setTimeout> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let globalFallbackTimer: ReturnType<typeof setTimeout> | null = null
  let resolved = false

  let resolveOuter: (r: QuickMatchResult) => void
  let rejectOuter: (e: unknown) => void
  const promise = new Promise<QuickMatchResult>((res, rej) => {
    resolveOuter = res
    rejectOuter = rej
  })

  function regionalRoomId(region: CoarseRegion): string {
    return `${QUICK_MATCH_ROOM_BASE}-${region}`
  }

  function globalRoomId(): string {
    return `${QUICK_MATCH_ROOM_BASE}-global`
  }

  function helloPayload(): QueueHelloMsg {
    return {
      type: 'queueHello',
      peerId,
      name: opts.playerName,
      joinedAt,
      ts: Date.now(),
    }
  }

  function sendOnRoom(room: QueueRoom, payload: QueueIncoming): void {
    if (!room.open) return
    try {
      room.socket.send(JSON.stringify(payload))
    } catch {
      /* ignore — relay may have just closed */
    }
  }

  function broadcast(payload: QueueIncoming): void {
    for (const room of rooms) sendOnRoom(room, payload)
  }

  function handleMessage(msg: QueueIncoming): void {
    if (resolved) return
    if (msg.type === 'queueHello') {
      if (msg.peerId === peerId) return
      const existing = roster.get(msg.peerId)
      if (existing) {
        existing.name = msg.name
        existing.joinedAt = msg.joinedAt
        existing.lastTs = msg.ts
      } else {
        roster.set(msg.peerId, {
          peerId: msg.peerId,
          name: msg.name,
          joinedAt: msg.joinedAt,
          lastTs: msg.ts,
        })
        /* Echo our own presence quickly so a newcomer can see us without waiting for the next heartbeat. */
        sendHello()
      }
      schedulePairProposal()
      return
    }
    if (msg.type === 'queueBye') {
      if (roster.delete(msg.peerId)) schedulePairProposal()
      return
    }
    if (msg.type === 'queuePair') {
      const age = Date.now() - msg.ts
      if (age > PAIR_FRESHNESS_MS || age < -PAIR_FRESHNESS_MS) return
      if (msg.guestPeerId === peerId) {
        settle(
          {
            outcome: 'paired',
            role: 'guest',
            roomId: msg.roomId,
            shortCode: msg.shortCode,
          },
          /* sendBye */ false,
        )
        return
      }
      if (msg.hostPeerId === peerId) {
        /* Already settled when we sent the proposal locally; nothing to do. */
        return
      }
      /* Drop paired peers so we don't try to match with them. */
      roster.delete(msg.hostPeerId)
      roster.delete(msg.guestPeerId)
      schedulePairProposal()
    }
  }

  function attachRoomHandlers(room: QueueRoom): void {
    room.socket.addEventListener('open', () => {
      room.open = true
      qmLog(`open ${room.label} room=${room.roomId} peer=${peerId}`)
      /* Mirror the legacy single-room behaviour: a full `sendHello` not only sends the
       * hello on every open room but also seeds our own roster entry and runs a pair
       * proposal pass — without this, a tab that opens first sat with an empty roster
       * (and never proposed a pair) until either a peer's hello arrived or the next
       * 3s heartbeat tick fired. */
      sendHello()
    })
    room.socket.addEventListener('message', (ev: Event) => {
      const me = ev as MessageEvent
      if (typeof me.data !== 'string') return
      let raw: unknown
      try {
        raw = JSON.parse(me.data) as unknown
      } catch {
        return
      }
      const parsed = parseQueueMessage(raw)
      if (!parsed) return
      qmLog(`recv ${room.label} ${parsed.type} from=${'peerId' in parsed ? parsed.peerId : '(pair)'}`)
      handleMessage(parsed)
    })
    room.socket.addEventListener('error', () => {
      qmLog(`error ${room.label} room=${room.roomId}`)
      /* Errors during quick match aren't fatal — wait out the timeout and fall back to bot. */
    })
    room.socket.addEventListener('close', () => {
      qmLog(`close ${room.label} room=${room.roomId}`)
      room.open = false
    })
  }

  function openRoom(roomId: string, label: string): QueueRoom | null {
    try {
      const socket = createMultiplayerSocket(roomId)
      const room: QueueRoom = { label, roomId, socket, open: false }
      rooms.push(room)
      attachRoomHandlers(room)
      return room
    } catch (err) {
      console.warn(`[quickMatch] failed to open ${label} room ${roomId}`, err)
      return null
    }
  }

  const cleanup = (sendBye: boolean): void => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (pruneTimer !== null) {
      window.clearInterval(pruneTimer)
      pruneTimer = null
    }
    if (pairProposalTimer !== null) {
      window.clearTimeout(pairProposalTimer)
      pairProposalTimer = null
    }
    if (timeoutTimer !== null) {
      window.clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
    if (globalFallbackTimer !== null) {
      window.clearTimeout(globalFallbackTimer)
      globalFallbackTimer = null
    }
    for (const room of rooms) {
      if (sendBye && room.open) {
        try {
          room.socket.send(JSON.stringify({ type: 'queueBye', peerId } satisfies QueueByeMsg))
        } catch {
          /* ignore */
        }
      }
      try {
        room.socket.close()
      } catch {
        /* ignore */
      }
    }
    rooms.length = 0
  }

  const settle = (result: QuickMatchResult, sendBye: boolean): void => {
    if (resolved) return
    resolved = true
    cleanup(sendBye)
    resolveOuter(result)
  }

  const sendHello = (): void => {
    const payload = helloPayload()
    broadcast(payload)
    /* Refresh self-entry so prune doesn't drop us from our own bookkeeping. */
    roster.set(peerId, { peerId, name: opts.playerName, joinedAt, lastTs: payload.ts })
    schedulePairProposal()
  }

  const pruneStale = (): void => {
    const now = Date.now()
    let changed = false
    for (const [k, v] of roster) {
      if (k === peerId) continue
      if (now - v.lastTs > PRESENCE_STALE_MS) {
        roster.delete(k)
        changed = true
      }
    }
    if (changed) schedulePairProposal()
  }

  /**
   * Each client independently runs the same election. Lowest-peerId waiter wins
   * the elector role and proposes itself as host paired with the next waiter.
   * Small jitter avoids two near-simultaneous joiners both proposing pairs.
   */
  const schedulePairProposal = (): void => {
    if (resolved) return
    if (pairProposalTimer !== null) return
    if (roster.size < 2) return
    const sorted = [...roster.values()].sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
      return a.peerId.localeCompare(b.peerId)
    })
    const elector = sorted[0]
    if (!elector || elector.peerId !== peerId) return
    /* Slight jitter so two near-simultaneous arrivals don't collide proposals. */
    const jitterMs = 80 + Math.floor(Math.random() * 220)
    pairProposalTimer = window.setTimeout(() => {
      pairProposalTimer = null
      if (resolved) return
      pruneStale()
      if (roster.size < 2) return
      const fresh = [...roster.values()].sort((a, b) => {
        if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
        return a.peerId.localeCompare(b.peerId)
      })
      const stillElector = fresh[0]
      const guest = fresh[1]
      if (!stillElector || stillElector.peerId !== peerId) return
      if (!guest) return
      const roomId = generateRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      const pair: QueuePairMsg = {
        type: 'queuePair',
        roomId,
        shortCode,
        hostPeerId: peerId,
        guestPeerId: guest.peerId,
        ts: Date.now(),
      }
      broadcast(pair)
      settle(
        { outcome: 'paired', role: 'host', roomId, shortCode },
        /* sendBye */ false,
      )
    }, jitterMs)
  }

  /* Open the regional room first. The client will gossip + try to match here
   * for FALLBACK_TO_GLOBAL_MS before also entering the global room. */
  const startedRegional = openRoom(regionalRoomId(opts.region), 'regional')
  if (!startedRegional) {
    queueMicrotask(() =>
      rejectOuter(new Error(`[quickMatch] no transport — could not open ${opts.region} room`)),
    )
    return {
      promise,
      cancel: () => {
        if (resolved) return
        resolved = true
        resolveOuter({ outcome: 'cancelled' })
      },
    }
  }

  heartbeatTimer = window.setInterval(sendHello, PRESENCE_HEARTBEAT_MS)
  pruneTimer = window.setInterval(pruneStale, 1500)

  /* Global fallback: keep gossiping in the regional room AND join the global
   * pool so we can match across regions if the regional pool stayed empty. */
  if (opts.region !== 'global') {
    globalFallbackTimer = window.setTimeout(() => {
      globalFallbackTimer = null
      if (resolved) return
      const opened = openRoom(globalRoomId(), 'global')
      if (opened) {
        try {
          opts.onGlobalFallback?.()
        } catch {
          /* ignore */
        }
      }
    }, FALLBACK_TO_GLOBAL_MS)
  }

  timeoutTimer = window.setTimeout(() => {
    if (resolved) return
    try {
      opts.onTimeoutPhase?.()
    } catch {
      /* ignore */
    }
    settle({ outcome: 'botFallback' }, /* sendBye */ true)
  }, timeoutMs)

  return {
    promise,
    cancel: () => {
      if (resolved) return
      settle({ outcome: 'cancelled' }, /* sendBye */ true)
    },
  }
}
