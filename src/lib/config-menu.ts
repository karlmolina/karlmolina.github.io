type Control<T> = {
  key: keyof T & string
  label: string
  rebuild?: boolean
} & (
  | { type: 'checkbox' }
  | { type: 'range'; min: number; max: number; step: number }
)

const loadSaved = (storageKey: string): Record<string, number | boolean> => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}')
  } catch {
    return {}
  }
}
const save = (storageKey: string, values: unknown) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(values))
  } catch {
    // storage unavailable (private mode, quota); settings just won't persist
  }
}

// A collapsible panel in the top right that edits `config` in place and
// remembers its values. Controls marked `rebuild` call onRebuild when changed;
// the rest are read live by the sketch.
export default <T extends object>(
  title: string,
  storageKey: string,
  controls: Control<T>[],
  config: T,
  onRebuild: () => void,
) => {
  const values = config as Record<string, number | boolean>
  const saved = loadSaved(storageKey)
  for (const { key, type } of controls) {
    if (typeof saved[key] === (type === 'checkbox' ? 'boolean' : 'number')) {
      values[key] = saved[key]
    }
  }
  const persist = () => save(storageKey, values)

  const element = document.body.appendChild(document.createElement('details'))
  element.style.cssText =
    'position:fixed;top:8px;right:12px;width:190px;color:#fff;font:12px monospace'
  // keep clicks and drags on the panel from reaching the page
  element.addEventListener('pointerdown', (e) => e.stopPropagation())
  element.addEventListener('dblclick', (e) => e.stopPropagation())
  const summary = element.appendChild(document.createElement('summary'))
  summary.textContent = title
  summary.style.cssText = 'cursor:pointer;text-align:right;font-size:14px'
  const panel = element.appendChild(document.createElement('div'))
  panel.style.cssText =
    'margin-top:6px;padding:8px 10px;background:rgba(0,0,0,0.6);border-radius:4px'

  const syncers: (() => void)[] = []
  for (const control of controls) {
    const row = panel.appendChild(document.createElement('label'))
    row.style.cssText = 'display:block;margin:4px 0'
    const text = document.createElement('div')
    const input = document.createElement('input')
    if (control.type === 'checkbox') {
      input.type = 'checkbox'
      input.style.cssText = 'margin:0 0 0 6px;vertical-align:middle'
      const show = () => {
        input.checked = values[control.key] as boolean
        text.textContent = `${control.label}:`
        text.appendChild(input)
      }
      input.addEventListener('change', () => {
        values[control.key] = input.checked
        persist()
        if (control.rebuild) onRebuild()
      })
      syncers.push(show)
    } else {
      input.type = 'range'
      input.min = String(control.min)
      input.max = String(control.max)
      input.step = String(control.step)
      input.style.cssText = 'width:100%'
      const show = () => {
        input.value = String(values[control.key])
        text.textContent = `${control.label}: ${input.value}`
      }
      input.addEventListener('input', () => {
        values[control.key] = Number(input.value)
        persist()
        text.textContent = `${control.label}: ${input.value}`
      })
      // rebuilding on every drag tick is wasteful; wait for release
      if (control.rebuild) input.addEventListener('change', onRebuild)
      syncers.push(show)
    }
    row.append(text, input)
  }
  const sync = () => syncers.forEach((fn) => fn())
  sync()
  return {
    element,
    // call after changing config from outside the panel
    sync: () => {
      sync()
      persist()
    },
  }
}
