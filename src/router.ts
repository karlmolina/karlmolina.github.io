import './style.css';

import { html } from 'htl';
import Navigo from 'navigo';
import p5 from 'p5';

import { $ } from './lib/html-utils.ts';
import { setAppContent } from './lib/set-app-content.ts';
import tornadoHole from './sketches/tornado-hole.ts';
import tree from './sketches/tree.ts';
import sketchUtils from './utils/sketch-utils.ts';

const router = new Navigo('/', { hash: true });

const sketchList = ['connected', 'slinky monster', 'tree', 'tornado hole'];
let sketch: p5 | undefined;
let resize: () => void;
router
  .hooks({
    before: (done) => {
      sketch?.remove();
      resize && window.removeEventListener('resize', resize);
      done();
    },
  })
  .on(() => {
    const link = (name: string) =>
      html`<li class="my-2 sm:my-4">
        <a
          class="inline-block w-full text-2xl hover:bg-teal-100 sm:text-4xl"
          href="#/${name}"
          >${name}</a
        >
      </li>`;
    setAppContent(html`
      <div class="m-auto max-w-screen-lg px-8 pt-16 sm:px-16 sm:pt-24">
        <h1
          class="
          border-b-0.05em mb-1 mt-2 box-border break-words border-teal-500 font-[questrial] text-4xl font-normal tracking-tighter text-[1A936F] underline sm:text-6xl md:text-8xl"
        >
          karlmolina.com
        </h1>
        <ul class="font-barlow my-4 list-none text-left text-[114b5f]">
          ${sketchList.map((name) => link(name))}
        </ul>
      </div>
    `);
  });

for (const name of sketchList) {
  // url encode name
  const encodedName = name.replace(/ /g, '%20');
  router.on(`/${encodedName}`, () => {
    document.title = name;
    setAppContent(html`<div id="canvas"></div>`);
    sketch = new p5(sketchUtils.wrapSketch(tree), $('canvas'));
  });
}
router.on('/tornado%20hole', () => {
  document.title = 'tornado hole';
  let app = tornadoHole();
  document.body.replaceChildren(app.view);
  resize = () => {
    app.destroy(true);
    app = tornadoHole();
    document.body.replaceChildren(app.view);
  };
  window.addEventListener('resize', resize);
});
router.resolve();
export default router;
