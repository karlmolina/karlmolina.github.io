import './style.css'

import { html } from 'htl'
import Navigo from 'navigo'
import p5 from 'p5'

import configMenu from './lib/config-menu.ts'
import { $ } from './lib/html-utils.ts'
import home from './pages/home.ts'
import blob, { blobControls, defaultBlobConfig } from './sketches/blob.ts'
import connected from './sketches/connected.ts'
import electricBirds, {
  defaultElectricBirdsConfig,
  electricBirdsControls,
} from './sketches/electric-birds.ts'
import rain, { defaultRainConfig, rainControls } from './sketches/rain.ts'
import slinkyMonster from './sketches/slinky-monster.ts'
import tornadoHole, {
  defaultTornadoHoleConfig,
} from './sketches/tornado-hole.ts'
import tree from './sketches/tree.ts'
import sketchUtils from './utils/sketch-utils.ts'

const navigo = new Navigo('/', { hash: true })

const sketchList = [
  'connected',
  'slinky monster',
  'tree',
  'tornado hole',
  'blob',
  'electric birds',
  'rain',
]
const p5Sketches = {
  connected: connected,
  'slinky monster': slinkyMonster,
  tree: tree,
}
let sketch: p5 | undefined
let resize: () => void
let teardown: (() => void) | undefined
navigo
  .hooks({
    before: (done) => {
      document.body.replaceChildren()
      sketch?.remove()
      teardown?.()
      teardown = undefined
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
  const config = defaultTornadoHoleConfig()
  const menu = configMenu(
    'tornado-hole-config',
    [
      {
        type: 'checkbox',
        key: 'lockEdges',
        label: 'lock edges',
        rebuild: true,
      },
      {
        type: 'range',
        key: 'dots',
        label: 'dots',
        min: 1000,
        max: 1000000,
        step: 1000,
        rebuild: true,
      },
      {
        type: 'range',
        key: 'dotSize',
        label: 'dot size',
        min: 1,
        max: 30,
        step: 1,
      },
      {
        type: 'range',
        key: 'spring',
        label: 'spring',
        min: 0.01,
        max: 0.5,
        step: 0.01,
      },
      {
        type: 'range',
        key: 'damping',
        label: 'damping',
        min: 0.9,
        max: 1,
        step: 0.001,
      },
    ],
    config,
    () => restart(),
  )
  let current = tornadoHole(config)
  const restart = () => {
    current.then((s) => {
      s.destroy()
      current = tornadoHole(config)
    })
  }
  resize = restart
  const toggleLockEdges = () => {
    config.lockEdges = !config.lockEdges
    menu.sync()
    restart()
  }
  window.addEventListener('resize', resize)
  window.addEventListener('dblclick', toggleLockEdges)
  teardown = () => {
    window.removeEventListener('dblclick', toggleLockEdges)
    menu.element.remove()
    current.then((s) => s.destroy())
  }
})
navigo.on('/blob', () => {
  document.title = 'blob'
  const config = defaultBlobConfig()
  const menu = configMenu('blob-config', blobControls, config, () => resize())
  // the page is white, so the menu text needs to be dark
  menu.element.style.color = '#000'
  let app = blob(config)
  document.body.appendChild(app.view)
  resize = () => {
    app.destroy(true)
    app = blob(config)
    document.body.appendChild(app.view)
  }
  window.addEventListener('resize', resize)
  teardown = () => {
    menu.element.remove()
  }
})
navigo.on('/electric%20birds', () => {
  document.title = 'electric birds'
  const config = defaultElectricBirdsConfig()
  const menu = configMenu(
    'electric-birds-config',
    electricBirdsControls,
    config,
    () => restart(),
  )
  const showFps = (fps: number) => menu.setStatus(`${fps} fps`)
  let current = electricBirds(config, showFps)
  const restart = () => {
    current.then((s) => {
      s.destroy()
      current = electricBirds(config, showFps)
    })
  }
  resize = restart
  window.addEventListener('resize', resize)
  teardown = () => {
    menu.element.remove()
    current.then((s) => s.destroy())
  }
})
navigo.on('/rain', () => {
  document.title = 'rain'
  const config = defaultRainConfig()
  const menu = configMenu('rain-config', rainControls, config, () => restart())
  const showFps = (fps: number) => menu.setStatus(`${fps} fps`)
  let current = rain(config, showFps)
  const restart = () => {
    current.then((s) => {
      s.destroy()
      current = rain(config, showFps)
    })
  }
  resize = restart
  window.addEventListener('resize', resize)
  teardown = () => {
    menu.element.remove()
    current.then((s) => s.destroy())
  }
})
navigo.on('/github', () => {
  window.location.href = 'https://github.com/karlmolina'
})
navigo.resolve()
export default navigo
