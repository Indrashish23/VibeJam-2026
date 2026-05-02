import type { Command } from './types'

/**
 * Undo/redo stack. Cap at 200 commands — each command's undo() payload stores a snapshot
 * that may include full subtrees, so unbounded growth would leak memory on long sessions.
 */
const MAX_STACK = 200

export class CommandStack {
  private past: Command[] = []
  private future: Command[] = []
  private listeners: Set<() => void> = new Set()

  execute(cmd: Command): void {
    cmd.execute()
    this.past.push(cmd)
    if (this.past.length > MAX_STACK) this.past.shift()
    this.future = []
    this.emit()
  }

  undo(): void {
    const cmd = this.past.pop()
    if (!cmd) return
    try {
      cmd.undo()
    } catch (err) {
      console.error('[editor] undo threw for', cmd.label, err)
    }
    this.future.push(cmd)
    this.emit()
  }

  redo(): void {
    const cmd = this.future.pop()
    if (!cmd) return
    try {
      cmd.execute()
    } catch (err) {
      console.error('[editor] redo threw for', cmd.label, err)
    }
    this.past.push(cmd)
    this.emit()
  }

  clear(): void {
    this.past = []
    this.future = []
    this.emit()
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  lastLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    for (const cb of [...this.listeners]) {
      try {
        cb()
      } catch (err) {
        console.error('[editor] CommandStack listener threw', err)
      }
    }
  }
}

/** Bundles multiple commands into one undo-step. Used for gizmo drag flush and bulk paste. */
export class CompositeCommand implements Command {
  label: string
  private readonly cmds: Command[]

  constructor(label: string, cmds: Command[]) {
    this.label = label
    this.cmds = cmds
  }

  execute(): void {
    for (const c of this.cmds) c.execute()
  }

  undo(): void {
    for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i].undo()
  }
}
