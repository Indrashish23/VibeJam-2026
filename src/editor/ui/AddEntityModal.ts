import type { EditorAPI } from '../types'

/**
 * "+ Add Entity" modal. Grid of registered entity types (generic + vibejam). On pick,
 * creates via `api.scene.create(type)` which routes through the command stack, then
 * selects the new entity.
 */
export function openAddEntityModal(api: EditorAPI, parentId: string | null = null): void {
  const backdrop = document.createElement('div')
  backdrop.className = 'editor-root-modal-backdrop'

  const modal = document.createElement('div')
  modal.className = 'editor-root-modal'

  const heading = document.createElement('h2')
  heading.textContent = parentId ? 'Add child entity' : 'Add entity'
  modal.appendChild(heading)

  const grid = document.createElement('div')
  grid.className = 'type-grid'
  for (const def of api.entityTypes.list()) {
    const tile = document.createElement('div')
    tile.className = 'type-tile'

    const icon = document.createElement('div')
    icon.className = 'icon'
    icon.textContent = def.icon

    const label = document.createElement('div')
    label.className = 'label'
    label.textContent = def.label

    tile.appendChild(icon)
    tile.appendChild(label)
    tile.addEventListener('click', () => {
      const entity = api.scene.create(def.id, { parentId: parentId })
      api.scene.select(entity.id)
      close()
    })
    grid.appendChild(tile)
  }
  modal.appendChild(grid)

  const footer = document.createElement('div')
  footer.className = 'modal-footer'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', () => close())
  footer.appendChild(cancel)
  modal.appendChild(footer)

  backdrop.appendChild(modal)
  document.body.appendChild(backdrop)

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  window.addEventListener('keydown', escHandler)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })

  function close(): void {
    window.removeEventListener('keydown', escHandler)
    backdrop.remove()
  }
}
