import type { AssetRegistry } from '../registries/AssetRegistry'
import type { PropertySchema, Vec3 } from '../types'

/**
 * Schema-driven field renderer. One function, dispatches on `schema.type`.
 * Calls `onChange(newValue)` on user commit (blur, change, Enter). The Inspector is
 * responsible for wrapping the commit in a command so undo works.
 *
 * Arrow-key nudge rule for `number`: ↑ = +step, ↓ = -step, default step 0.1 unless
 * schema overrides. Respects min/max clamps.
 */

export interface RenderFieldOpts {
  schema: PropertySchema
  value: unknown
  onChange: (next: unknown) => void
  /** Optional — asset picker needs the registry to show options. */
  assets?: AssetRegistry
}

export function renderField(opts: RenderFieldOpts): HTMLElement {
  const { schema, value, onChange, assets } = opts

  switch (schema.type) {
    case 'string':
      return textField(String(value ?? ''), (next) => onChange(next))
    case 'number':
      return numberField(
        typeof value === 'number' ? value : Number(value ?? 0),
        schema,
        (next) => onChange(next),
      )
    case 'boolean':
      return boolField(!!value, (next) => onChange(next))
    case 'color':
      return colorField(String(value ?? '#ffffff'), (next) => onChange(next))
    case 'vector3':
      return vector3Field(coerceVec3(value), (next) => onChange(next))
    case 'select':
      return selectField(String(value ?? schema.options?.[0] ?? ''), schema.options ?? [], (next) =>
        onChange(next),
      )
    case 'asset':
      return assetField(
        String(value ?? ''),
        schema,
        assets,
        (next) => onChange(next),
      )
  }
}

function coerceVec3(v: unknown): Vec3 {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) {
    return [v[0], v[1], v[2]]
  }
  return [0, 0, 0]
}

function textField(value: string, onChange: (next: string) => void): HTMLElement {
  const wrap = divRow()
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value
  input.addEventListener('change', () => onChange(input.value))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
  })
  wrap.appendChild(input)
  return wrap
}

function numberField(
  value: number,
  schema: PropertySchema,
  onChange: (next: number) => void,
): HTMLElement {
  const wrap = divRow()
  const input = document.createElement('input')
  input.type = 'number'
  input.value = String(value)
  if (schema.min !== undefined) input.min = String(schema.min)
  if (schema.max !== undefined) input.max = String(schema.max)
  const step = schema.step ?? 0.1
  input.step = String(step)

  const commit = () => {
    let n = parseFloat(input.value)
    if (!Number.isFinite(n)) n = 0
    if (schema.min !== undefined) n = Math.max(schema.min, n)
    if (schema.max !== undefined) n = Math.min(schema.max, n)
    onChange(n)
  }
  input.addEventListener('change', commit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
    /* ↑ ↓ with `shift` = ×10 nudge. Browser already nudges by `step`; we stop the default
     * when we want bigger increments, otherwise the native arrow-key step is fine. */
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey) {
      e.preventDefault()
      const dir = e.key === 'ArrowUp' ? 1 : -1
      const cur = parseFloat(input.value) || 0
      input.value = String(cur + dir * step * 10)
      commit()
    }
  })
  wrap.appendChild(input)
  return wrap
}

function boolField(value: boolean, onChange: (next: boolean) => void): HTMLElement {
  const wrap = divRow()
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  wrap.appendChild(input)
  return wrap
}

function colorField(value: string, onChange: (next: string) => void): HTMLElement {
  const wrap = divRow()
  const input = document.createElement('input')
  input.type = 'color'
  input.value = normalizeColor(value)
  input.addEventListener('change', () => onChange(input.value))
  wrap.appendChild(input)
  return wrap
}

function normalizeColor(v: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  return '#ffffff'
}

function vector3Field(value: Vec3, onChange: (next: Vec3) => void): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'field-control vector3-row'

  const inputs: HTMLInputElement[] = []
  for (let i = 0; i < 3; i++) {
    const inp = document.createElement('input')
    inp.type = 'number'
    inp.step = '0.1'
    inp.value = String(value[i])
    const commit = () => {
      const next: Vec3 = [
        parseFloat(inputs[0].value) || 0,
        parseFloat(inputs[1].value) || 0,
        parseFloat(inputs[2].value) || 0,
      ]
      onChange(next)
    }
    inp.addEventListener('change', commit)
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur()
    })
    inputs.push(inp)
    wrap.appendChild(inp)
  }
  return wrap
}

function selectField(value: string, options: string[], onChange: (next: string) => void): HTMLElement {
  const wrap = divRow()
  const sel = document.createElement('select')
  for (const o of options) {
    const opt = document.createElement('option')
    opt.value = o
    opt.textContent = o
    if (o === value) opt.selected = true
    sel.appendChild(opt)
  }
  sel.addEventListener('change', () => onChange(sel.value))
  wrap.appendChild(sel)
  return wrap
}

function assetField(
  value: string,
  schema: PropertySchema,
  assets: AssetRegistry | undefined,
  onChange: (next: string) => void,
): HTMLElement {
  const wrap = divRow()
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = '(asset URL)'
  input.value = value
  input.title = value
  input.addEventListener('change', () => onChange(input.value))

  const picker = document.createElement('select')
  picker.title = 'Pick from registry'
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = '— pick —'
  picker.appendChild(placeholder)
  if (assets) {
    const category = schema.assetCategory
    const options = category ? assets.listByCategory(category) : assets.list()
    for (const a of options) {
      const opt = document.createElement('option')
      opt.value = a.url
      opt.textContent = a.label
      if (a.url === value) opt.selected = true
      picker.appendChild(opt)
    }
  }
  picker.addEventListener('change', () => {
    if (!picker.value) return
    input.value = picker.value
    onChange(picker.value)
  })

  const browse = document.createElement('button')
  browse.type = 'button'
  browse.textContent = '…'
  browse.title = 'Browse local file'
  browse.addEventListener('click', () => {
    const filePicker = document.createElement('input')
    filePicker.type = 'file'
    filePicker.style.display = 'none'
    filePicker.addEventListener('change', () => {
      const file = filePicker.files?.[0]
      if (!file) return
      const url = URL.createObjectURL(file)
      input.value = url
      onChange(url)
    })
    document.body.appendChild(filePicker)
    filePicker.click()
    setTimeout(() => filePicker.remove(), 1000)
  })

  wrap.appendChild(input)
  wrap.appendChild(picker)
  wrap.appendChild(browse)
  return wrap
}

function divRow(): HTMLElement {
  const d = document.createElement('div')
  d.className = 'field-control'
  return d
}
