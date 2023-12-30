import './style.css';

import { html } from 'htl';
import Navigo from 'navigo';

import { setAppContent } from './lib/set-app-content.ts';

const router = new Navigo('/', { hash: true });

router
  .on(() => {
    setAppContent(html`
      <div class="m-auto max-w-screen-lg px-8 pt-16 sm:px-16 sm:pt-24">
        <h1
          class="
          border-b-0.05em mb-1 mt-2 box-border break-words border-teal-500 font-[questrial] text-4xl font-normal tracking-tighter text-[1A936F] underline sm:text-6xl md:text-8xl"
        >
          karlmolina.com
        </h1>
        <ul class="sketch-list">
          <li><a class="sketch-link" href="#/connected">connected</a></li>
          <li>
            <a class="sketch-link" href="#/slinky_monster">slinky monster</a>
          </li>
          <li><a class="sketch-link" href="#/tree">tree</a></li>
          <li><a class="sketch-link" href="#/tornado_hole">tornado hole</a></li>
        </ul>
      </div>
    `);
  })
  .on('/tree', () => {
    document.title = 'Tree';
    console.log('tree');
  })
  .resolve();

export default router;
