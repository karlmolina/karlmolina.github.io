import './style.css'

import { html } from 'htl'
import Navigo from 'navigo'
import p5 from 'p5'

import { $ } from './lib/html-utils.ts'
import home from './pages/home.ts'
import blob from './sketches/blob.ts'
import connected from './sketches/connected.ts'
import slinkyMonster from './sketches/slinky-monster.ts'
import tornadoHole from './sketches/tornado-hole.ts'
import tree from './sketches/tree.ts'
import sketchUtils from './utils/sketch-utils.ts'

const navigo = new Navigo('/', { hash: true })

const sketchList = [
  'connected',
  'slinky monster',
  'tree',
  'tornado hole',
  'blob',
]
const p5Sketches = {
  connected: connected,
  'slinky monster': slinkyMonster,
  tree: tree,
}
let sketch: p5 | undefined
let resize: () => void
navigo
  .hooks({
    before: (done) => {
      document.body.replaceChildren()
      sketch?.remove()
      resize && window.removeEventListener('resize', resize)
      done()
    },
  })
  .on(() => {
    document.body.replaceChildren(home(sketchList))
  })

for (const [name, sketchFunction] of Object.entries(p5Sketches)) {
  // url encode name
  const encodedName = name.replace(/ /g, '%20')
  navigo.on(`/${encodedName}`, () => {
    document.title = name
    document.body.appendChild(
      html`<div id="canvas">
        <style>
          canvas {
            width: 100% !important;
            height: 100% !important;
          }
        </style>
      </div>`,
    )
    sketch = new p5(sketchUtils.wrapSketch(sketchFunction), $('#canvas'))
  })
}
navigo.on('/tornado%20hole', () => {
  document.title = 'tornado hole'
  const props = { lockEdges: true }
  let app = tornadoHole(props)
  document.body.appendChild(app.view)
  resize = () => {
    app.destroy(true)
    app = tornadoHole(props)
    document.body.appendChild(app.view)
  }
  window.addEventListener('resize', resize)
  const toggleLockEdges = () => {
    if (!app.stage) {
      window.removeEventListener('dblclick', toggleLockEdges)
    }
    props.lockEdges = !props.lockEdges
    resize()
  }
  window.addEventListener('dblclick', toggleLockEdges)
})
navigo.on('/blob', () => {
  document.title = 'blob'
  let app = blob()
  document.body.appendChild(app.view)
  resize = () => {
    app.destroy(true)
    app = blob()
    document.body.appendChild(app.view)
  }
  window.addEventListener('resize', resize)
})
navigo.on('/github', () => {
  window.location.href = 'https://github.com/karlmolina'
})
navigo.resolve()
export default navigo
