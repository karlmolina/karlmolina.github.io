export type Control<T> = {
  key: keyof T & string
  label: string
  // shown on hover and click of the little "i" next to the label
  help?: string
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

// Values shared through the url live in the hash query (`#/rain?a=100&b=1`),
// since routing is hash based. Each control is named by a single character
// from its position in the controls list, so reordering controls changes what
// old links mean.
const urlKey = (index: number) => index.toString(36)
const loadFromUrl = (): URLSearchParams =>
  new URLSearchParams(window.location.hash.split('?')[1] ?? '')
const saveToUrl = (
  controls: { key: string }[],
  values: Record<string, number | boolean>,
) => {
  const params = new URLSearchParams()
  controls.forEach(({ key }, i) => {
    const value = values[key]
    params.set(
      urlKey(i),
      typeof value === 'boolean' ? (value ? '1' : '0') : String(value),
    )
  })
  const path = window.location.hash.split('?')[0]
  window.history.replaceState(null, '', `${path}?${params}`)
}

// A collapsible panel in the top right that edits `config` in place and
// remembers its values. Controls marked `rebuild` call onRebuild when changed;
// the rest are read live by the sketch.
export default <T extends object>(
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
  // values in the url win over locally saved ones so shared links look the same
  const shared = loadFromUrl()
  controls.forEach((control, i) => {
    const raw = shared.get(urlKey(i))
    if (raw === null) return
    if (control.type === 'checkbox') {
      if (raw === '1' || raw === '0') values[control.key] = raw === '1'
    } else if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
      values[control.key] = Math.min(
        control.max,
        Math.max(control.min, Number(raw)),
      )
    }
  })
  let collapsed = saved.collapsed !== false
  const persist = () => {
    save(storageKey, { ...values, collapsed })
    saveToUrl(controls, values)
  }

  const element = document.body.appendChild(document.createElement('div'))
  element.style.cssText =
    'position:fixed;top:8px;right:12px;width:190px;color:#fff;font:12px monospace'
  // keep clicks and drags on the panel from reaching the page
  element.addEventListener('pointerdown', (e) => e.stopPropagation())
  element.addEventListener('dblclick', (e) => e.stopPropagation())
  const toggle = element.appendChild(document.createElement('div'))
  toggle.style.cssText =
    'cursor:pointer;user-select:none;text-align:right;font-size:14px;width:fit-content;margin-left:auto;padding:4px 8px;background:rgba(0,0,0,0.6);border-radius:4px'
  const panel = element.appendChild(document.createElement('div'))
  panel.style.cssText =
    'margin-top:6px;padding:8px 10px;background:rgba(0,0,0,0.6);border-radius:4px'
  const showCollapsed = () => {
    panel.style.display = collapsed ? 'none' : 'block'
    toggle.textContent = collapsed ? 'settings +' : 'settings -'
  }
  toggle.addEventListener('click', () => {
    collapsed = !collapsed
    showCollapsed()
    persist()
  })
  showCollapsed()

  // fps counter at the top of the panel; measured from animation frames so it
  // works for every sketch. The loop stops once the menu is removed.
  const status = panel.appendChild(document.createElement('div'))
  status.style.cssText = 'margin-bottom:4px'
  let frames = 0
  let fpsStart = performance.now()
  const tick = (now: number) => {
    if (!element.isConnected) return
    frames += 1
    if (now - fpsStart >= 500) {
      status.textContent = `${Math.round(
        (frames * 1000) / (now - fpsStart),
      )} fps`
      frames = 0
      fpsStart = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const syncers: (() => void)[] = []
  for (const control of controls) {
    const row = panel.appendChild(document.createElement('div'))
    row.style.cssText = 'display:block;margin:4px 0'
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:6px'
    const text = document.createElement('div')
    const description = document.createElement('div')
    description.style.cssText = 'display:none;margin:2px 0;color:#bbb'
    if (control.help) {
      const info = header.appendChild(document.createElement('span'))
      info.textContent = 'i'
      info.title = control.help
      info.style.cssText =
        'cursor:pointer;flex:none;width:14px;height:14px;line-height:14px;text-align:center;border:1px solid #fff;border-radius:50%;font-size:10px;font-style:italic'
      description.textContent = control.help
      info.addEventListener('click', () => {
        description.style.display =
          description.style.display === 'none' ? 'block' : 'none'
      })
    }
    header.appendChild(text)
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
    row.append(header, description, input)
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
