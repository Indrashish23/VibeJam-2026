/**
 * Minimal generic pub/sub used by SceneStore + registries. Intentionally tiny —
 * no wildcard listeners, no once(), no priority. Returns an unsubscribe thunk
 * from `on()` so call sites never need to track listener references.
 */
export class EventBus<EventMap extends Record<string, unknown>> {
  private listeners: Map<keyof EventMap, Set<(payload: never) => void>> = new Map()

  on<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(cb as (payload: never) => void)
    return () => this.off(event, cb)
  }

  off<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): void {
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(cb as (payload: never) => void)
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    /* iterate a snapshot so handlers can safely `off` themselves mid-dispatch */
    for (const fn of [...set]) {
      try {
        ;(fn as (payload: EventMap[K]) => void)(payload)
      } catch (err) {
        console.error('[editor] event listener threw', event, err)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
