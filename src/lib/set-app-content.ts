import { $ } from './html-utils';

export function setAppContent(...nodes: Node[]) {
  const app = $('#app');
  if (!app) {
    throw Error('#app not found!');
  }
  app.replaceChildren(...nodes);
}
