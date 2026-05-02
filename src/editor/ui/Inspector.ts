import type { CommandStack } from '../CommandStack'
import type { SceneStore } from '../SceneStore'
import {
  addComponentCmd,
  removeComponentCmd,
  renameCmd,
  setTransformCmd,
  updateComponentCmd,
  updateEntityCmd,
} from '../commands'
import type { AssetRegistry } from '../registries/AssetRegistry'
import type { ComponentRegistry } from '../registries/ComponentRegistry'
import type { EntityTypeRegistry } from '../registries/EntityTypeRegistry'
import type { Entity, PropertySchema, Vec3 } from '../types'
import { renderField } from './PropertyField'

interface InspectorDeps {
  container: HTMLElement
  store: SceneStore
  commandStack: CommandStack
  entityTypes: EntityTypeRegistry
  components: ComponentRegistry
  assets: AssetRegistry
}

/**
 * Right panel. Rebuilds on selection change and on `entity:update` for the currently
 * selected entity. Every mutation goes through the command stack via the commands.ts
 * factories — the Inspector never touches the SceneStore directly.
 *
 * Sections:
 *   - Header (icon, editable name, type, UUID)
 *   - Transform (position/rotation/scale)
 *   - Type Properties (registry-driven schema)
 *   - Components (registry-driven list + add dropdown)
 */
export class Inspector {
  private unsubSelect: () => void
  private unsubUpdate: () => void
  private unsubTypesChange: () => void
  private deps: InspectorDeps

  constructor(deps: InspectorDeps) {
    this.deps = deps
    this.rebuild()
    this.unsubSelect = deps.store.subscribe('entity:select', () => this.rebuild())
    this.unsubUpdate = deps.store.subscribe('entity:update', (payload) => {
      if (payload.entityId && payload.entityId === deps.store.getSelectedId()) this.rebuild()
    })
    /* If new types/components are registered (plugins), refresh so new fields appear. */
    this.unsubTypesChange = deps.components.onChange(() => this.rebuild())
  }

  dispose(): void {
    this.unsubSelect()
    this.unsubUpdate()
    this.unsubTypesChange()
  }

  private rebuild(): void {
    const { container } = this.deps
    const entity = this.deps.store.getSelected()
    container.innerHTML = ''

    if (!entity) {
      const empty = document.createElement('div')
      empty.style.padding = '10px'
      empty.style.color = '#71717a'
      empty.style.fontStyle = 'italic'
      empty.textContent = 'Nothing selected.'
      container.appendChild(empty)
      return
    }

    container.appendChild(this.renderHeader(entity))
    container.appendChild(this.renderTransform(entity))
    container.appendChild(this.renderTypeProperties(entity))
    container.appendChild(this.renderComponents(entity))
  }

  /* ---------- sections ---------- */

  private renderHeader(entity: Entity): HTMLElement {
    const typeDef = this.deps.entityTypes.get(entity.type)
    const section = this.section('Header', false)
    const body = section.querySelector('.inspector-section-body')!

    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    row.style.marginBottom = '6px'

    const icon = document.createElement('span')
    icon.style.fontSize = '18px'
    icon.textContent = typeDef?.icon ?? '⚪'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.value = entity.name
    nameInput.style.flex = '1'
    nameInput.style.padding = '3px 6px'
    nameInput.style.background = '#18181b'
    nameInput.style.border = '1px solid #3f3f46'
    nameInput.style.borderRadius = '3px'
    nameInput.style.color = '#e4e4e7'
    nameInput.addEventListener('change', () => {
      if (nameInput.value.trim() && nameInput.value !== entity.name) {
        this.deps.commandStack.execute(renameCmd(this.deps.store, entity.id, nameInput.value))
      }
    })
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur()
      e.stopPropagation()
    })

    row.appendChild(icon)
    row.appendChild(nameInput)
    body.appendChild(row)

    const badge = document.createElement('div')
    badge.style.fontSize = '10px'
    badge.style.color = '#71717a'
    badge.style.textTransform = 'uppercase'
    badge.style.letterSpacing = '0.5px'
    badge.style.marginBottom = '4px'
    badge.textContent = typeDef?.label ?? entity.type
    body.appendChild(badge)

    const uuid = document.createElement('div')
    uuid.className = 'uuid-row'
    uuid.textContent = entity.id
    uuid.title = 'UUID (read-only)'
    body.appendChild(uuid)

    return section
  }

  private renderTransform(entity: Entity): HTMLElement {
    const section = this.section('Transform', false)
    const body = section.querySelector('.inspector-section-body') as HTMLElement

    const commitTransform = (patch: { position?: Vec3; rotation?: Vec3; scale?: Vec3 }) => {
      this.deps.commandStack.execute(setTransformCmd(this.deps.store, entity.id, patch))
    }

    body.appendChild(
      this.transformRow('Position', entity.transform.position, (next) =>
        commitTransform({ position: next }),
      ),
    )
    body.appendChild(
      this.transformRow('Rotation', entity.transform.rotation, (next) =>
        commitTransform({ rotation: next }),
      ),
    )
    body.appendChild(
      this.transformRow('Scale', entity.transform.scale, (next) => commitTransform({ scale: next })),
    )
    return section
  }

  private transformRow(label: string, value: Vec3, onCommit: (v: Vec3) => void): HTMLElement {
    const row = document.createElement('div')
    row.className = 'field-row'
    const lbl = document.createElement('label')
    lbl.textContent = label
    row.appendChild(lbl)
    row.appendChild(
      renderField({
        schema: { key: label, label, type: 'vector3' },
        value,
        onChange: (next) => onCommit(next as Vec3),
        assets: this.deps.assets,
      }),
    )
    return row
  }

  private renderTypeProperties(entity: Entity): HTMLElement {
    const typeDef = this.deps.entityTypes.get(entity.type)
    const section = this.section('Properties', false)
    const body = section.querySelector('.inspector-section-body') as HTMLElement

    if (!typeDef || typeDef.schema.length === 0) {
      const empty = document.createElement('div')
      empty.style.color = '#71717a'
      empty.style.fontStyle = 'italic'
      empty.textContent = '(no properties)'
      body.appendChild(empty)
      return section
    }

    for (const schema of typeDef.schema) {
      body.appendChild(this.fieldRow(schema, entity.properties[schema.key], (next) => {
        this.deps.commandStack.execute(
          updateEntityCmd(this.deps.store, entity.id, {
            properties: { ...entity.properties, [schema.key]: next },
          }),
        )
      }))
    }
    return section
  }

  private renderComponents(entity: Entity): HTMLElement {
    const section = this.section('Components', false)
    const body = section.querySelector('.inspector-section-body') as HTMLElement

    entity.components.forEach((comp, index) => {
      const compDef = this.deps.components.get(comp.componentId)
      const card = document.createElement('div')
      card.className = 'component-card'

      const header = document.createElement('div')
      header.className = 'component-card-header'
      const label = document.createElement('span')
      label.textContent = compDef?.label ?? comp.componentId
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        this.deps.commandStack.execute(removeComponentCmd(this.deps.store, entity.id, index))
      })
      header.appendChild(label)
      header.appendChild(remove)
      card.appendChild(header)

      const cardBody = document.createElement('div')
      cardBody.className = 'component-card-body'
      if (compDef) {
        for (const schema of compDef.schema) {
          cardBody.appendChild(
            this.fieldRow(schema, comp.properties[schema.key], (next) => {
              this.deps.commandStack.execute(
                updateComponentCmd(this.deps.store, entity.id, index, { [schema.key]: next }),
              )
            }),
          )
        }
      } else {
        const warn = document.createElement('div')
        warn.style.color = '#f59e0b'
        warn.style.fontSize = '11px'
        warn.textContent = `Unknown component: ${comp.componentId}`
        cardBody.appendChild(warn)
      }
      card.appendChild(cardBody)
      body.appendChild(card)
    })

    /* Add Component row */
    const addRow = document.createElement('div')
    addRow.className = 'add-component-row'
    const select = document.createElement('select')
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = '+ Add component…'
    select.appendChild(placeholder)
    const attached = new Set(entity.components.map((c) => c.componentId))
    for (const def of this.deps.components.list()) {
      if (!def.allowMultiple && attached.has(def.id)) continue
      const opt = document.createElement('option')
      opt.value = def.id
      opt.textContent = def.label
      select.appendChild(opt)
    }
    select.addEventListener('change', () => {
      if (!select.value) return
      const def = this.deps.components.get(select.value)
      if (!def) return
      this.deps.commandStack.execute(
        addComponentCmd(this.deps.store, entity.id, {
          componentId: def.id,
          properties: { ...def.defaultProperties },
        }),
      )
      select.value = ''
    })
    addRow.appendChild(select)
    body.appendChild(addRow)

    return section
  }

  /* ---------- helpers ---------- */

  private section(title: string, collapsed: boolean): HTMLElement {
    const section = document.createElement('div')
    section.className = 'inspector-section'
    section.dataset.collapsed = String(collapsed)

    const heading = document.createElement('h3')
    const titleSpan = document.createElement('span')
    titleSpan.textContent = title
    const caret = document.createElement('span')
    caret.className = 'collapsed-caret'
    caret.textContent = '▾'
    heading.appendChild(titleSpan)
    heading.appendChild(caret)
    heading.addEventListener('click', () => {
      section.dataset.collapsed = section.dataset.collapsed === 'true' ? 'false' : 'true'
    })
    section.appendChild(heading)

    const body = document.createElement('div')
    body.className = 'inspector-section-body'
    section.appendChild(body)

    return section
  }

  private fieldRow(
    schema: PropertySchema,
    value: unknown,
    onCommit: (next: unknown) => void,
  ): HTMLElement {
    const row = document.createElement('div')
    row.className = 'field-row'
    const label = document.createElement('label')
    label.textContent = schema.label
    label.title = schema.key
    row.appendChild(label)
    row.appendChild(
      renderField({
        schema,
        value,
        onChange: onCommit,
        assets: this.deps.assets,
      }),
    )
    return row
  }
}
