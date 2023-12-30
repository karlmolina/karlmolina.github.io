export function $(selector: string): HTMLElement {
  const el = document.querySelector(selector)
  return el as HTMLElement
}

export function hide(element: HTMLElement) {
  element.classList.add('hidden')
}

export function show(element: HTMLElement) {
  element.classList.remove('hidden')
}

export function toggle(element: HTMLElement) {
  if (element.classList.contains('hidden')) {
    hide(element)
  } else {
    show(element)
  }
}

export function isVisible(element: HTMLElement) {
  return !element.classList.contains('hidden')
}

export function dispatchModifyDom() {
  document.dispatchEvent(new Event('modifydom'))
}
