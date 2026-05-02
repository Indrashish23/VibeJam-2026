import type {
  Command,
  ComponentInstance,
  Entity,
  EntityTypeDefinition,
  Vec3,
} from './types'
import { cloneEntity, type SceneStore } from './SceneStore'

/**
 * Command factories — the ONLY module allowed to call SceneStore's underscored
 * mutators. Anything that changes scene state must go through here so undo works.
 */

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID()
  }
  return `e-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

export function buildEntityFromTypeDef(
  def: EntityTypeDefinition,
  partial?: Partial<Entity>,
): Entity {
  const base: Entity = {
    id: partial?.id ?? uuid(),
    name: partial?.name ?? def.label,
    type: def.id,
    parentId: partial?.parentId ?? null,
    children: partial?.children ? [...partial.children] : [],
    transform: {
      position: (partial?.transform?.position ?? [0, 0, 0]).slice(0, 3) as Vec3,
      rotation: (partial?.transform?.rotation ?? [0, 0, 0]).slice(0, 3) as Vec3,
      scale: (partial?.transform?.scale ?? [1, 1, 1]).slice(0, 3) as Vec3,
    },
    properties: { ...def.defaultProperties, ...(partial?.properties ?? {}) },
    components: partial?.components
      ? partial.components.map((c) => ({ componentId: c.componentId, properties: { ...c.properties } }))
      : [],
    metadata: { ...(partial?.metadata ?? {}) },
  }
  try {
    def.onCreate?.(base)
  } catch (err) {
    console.warn('[editor] onCreate threw for', def.id, err)
  }
  return base
}

/* ---------- create / delete ---------- */

export function createEntityCmd(store: SceneStore, entity: Entity): Command {
  return {
    label: `Create ${entity.name}`,
    execute() {
      store._insert(entity)
    },
    undo() {
      store._remove(entity.id)
    },
  }
}

export function deleteEntityCmd(store: SceneStore, id: string): Command {
  const target = store.get(id)
  if (!target) {
    return { label: 'Delete (missing)', execute() {}, undo() {} }
  }
  /* Snapshot full subtree in deterministic order so undo re-inserts parents before children. */
  const subtree: Entity[] = []
  const walk = (rootId: string): void => {
    const e = store.get(rootId)
    if (!e) return
    subtree.push(cloneEntity(e))
    for (const c of e.children) walk(c)
  }
  walk(id)

  return {
    label: `Delete ${target.name}`,
    execute() {
      store._remove(id)
    },
    undo() {
      /* Re-insert roots before children so parent links resolve. */
      for (const snap of subtree) {
        /* Reset `children` — `_insert` doesn't walk the stored children array,
         * it relies on each child's own `_insert` to register its parent link. */
        const clone = cloneEntity(snap)
        clone.children = []
        store._insert(clone)
      }
      /* Second pass: restore child order on each parent exactly as snapshotted. */
      for (const snap of subtree) {
        const live = store.get(snap.id)
        if (live) live.children = [...snap.children]
      }
    },
  }
}

/* ---------- update / rename / transform ---------- */

export function updateEntityCmd(store: SceneStore, id: string, patch: Partial<Entity>): Command {
  const prev = store.snapshot(id)
  if (!prev) return { label: 'Update (missing)', execute() {}, undo() {} }
  return {
    label: `Update ${prev.name}`,
    execute() {
      store._patch(id, patch)
    },
    undo() {
      store._patch(id, {
        name: prev.name,
        transform: prev.transform,
        properties: { ...prev.properties },
        components: prev.components.map((c) => ({ componentId: c.componentId, properties: { ...c.properties } })),
        metadata: { ...prev.metadata },
      })
    },
  }
}

export function renameCmd(store: SceneStore, id: string, name: string): Command {
  const prev = store.get(id)?.name ?? ''
  return {
    label: `Rename to ${name}`,
    execute() {
      store._patch(id, { name })
    },
    undo() {
      store._patch(id, { name: prev })
    },
  }
}

export function setTransformCmd(
  store: SceneStore,
  id: string,
  next: { position?: Vec3; rotation?: Vec3; scale?: Vec3 },
): Command {
  const snap = store.snapshot(id)
  if (!snap) return { label: 'Transform (missing)', execute() {}, undo() {} }
  const prev = snap.transform
  const merged = {
    position: (next.position ?? prev.position).slice(0, 3) as Vec3,
    rotation: (next.rotation ?? prev.rotation).slice(0, 3) as Vec3,
    scale: (next.scale ?? prev.scale).slice(0, 3) as Vec3,
  }
  return {
    label: `Transform ${snap.name}`,
    execute() {
      store._patch(id, { transform: merged })
    },
    undo() {
      store._patch(id, { transform: prev })
    },
  }
}

/* ---------- reparent ---------- */

export function reparentCmd(store: SceneStore, childId: string, nextParentId: string | null): Command {
  const child = store.get(childId)
  const prev = child?.parentId ?? null
  return {
    label: 'Reparent',
    execute() {
      store._setParent(childId, nextParentId)
    },
    undo() {
      store._setParent(childId, prev)
    },
  }
}

/* ---------- components ---------- */

export function addComponentCmd(
  store: SceneStore,
  entityId: string,
  component: ComponentInstance,
): Command {
  return {
    label: `Add ${component.componentId}`,
    execute() {
      const e = store.get(entityId)
      if (!e) return
      const next = [...e.components, { componentId: component.componentId, properties: { ...component.properties } }]
      store._patch(entityId, { components: next })
    },
    undo() {
      const e = store.get(entityId)
      if (!e) return
      /* Remove last matching componentId — matches the allow-multiple scenario too. */
      const idx = e.components.map((c) => c.componentId).lastIndexOf(component.componentId)
      if (idx < 0) return
      const next = e.components.filter((_, i) => i !== idx)
      store._patch(entityId, { components: next })
    },
  }
}

export function removeComponentCmd(store: SceneStore, entityId: string, index: number): Command {
  const e = store.get(entityId)
  const snapshot = e?.components[index]
    ? { componentId: e.components[index].componentId, properties: { ...e.components[index].properties } }
    : null
  return {
    label: `Remove component`,
    execute() {
      const cur = store.get(entityId)
      if (!cur) return
      const next = cur.components.filter((_, i) => i !== index)
      store._patch(entityId, { components: next })
    },
    undo() {
      if (!snapshot) return
      const cur = store.get(entityId)
      if (!cur) return
      const next = [...cur.components]
      next.splice(index, 0, { componentId: snapshot.componentId, properties: { ...snapshot.properties } })
      store._patch(entityId, { components: next })
    },
  }
}

export function updateComponentCmd(
  store: SceneStore,
  entityId: string,
  index: number,
  patch: Record<string, unknown>,
): Command {
  const e = store.get(entityId)
  const prev = e?.components[index] ? { ...e.components[index].properties } : {}
  return {
    label: `Edit component`,
    execute() {
      const cur = store.get(entityId)
      if (!cur) return
      const next = cur.components.map((c, i) => (i === index ? { componentId: c.componentId, properties: { ...c.properties, ...patch } } : c))
      store._patch(entityId, { components: next })
    },
    undo() {
      const cur = store.get(entityId)
      if (!cur) return
      const next = cur.components.map((c, i) => (i === index ? { componentId: c.componentId, properties: { ...prev } } : c))
      store._patch(entityId, { components: next })
    },
  }
}

/* ---------- select (not undoable by design — selection is UI state) ---------- */

export function selectEntity(store: SceneStore, id: string | null): void {
  store._setSelected(id)
}
