export function setAppContent(...nodes: Node[]) {
  document.body.replaceChildren(...nodes);
}
