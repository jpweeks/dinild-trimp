import {
  Fog,
  Group,
  PCFSoftShadowMap,
  Scene,
  WebGLRenderer
} from 'three'

import { RENDER_SETTINGS } from './constants/fidelity'
import { createTaskManager } from './utils/task'
import { createLoop } from './utils/loop'
import { IndexCamera } from './scenes/IndexCamera'
import { IndexInterface } from './scenes/IndexInterface'
import { IndexLights } from './scenes/IndexLights'
import { IndexEntities } from './scenes/IndexEntities'
import { IndexSceneState } from './scenes/IndexSceneState'
import { IndexPhraseState } from './scenes/IndexPhraseState'

const container = createContainer()
const tasks = createTaskManager(
  'load', 'inject', 'populate',
  'syncState', 'update', 'render', 'resize')
const renderer = createRenderer()
const scene = createScene()
const camera = createCamera()
const loop = createAnimationLoop()

function createContainer () {
  const element = document.createElement('div')
  Object.assign(element.style, {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden'
  })
  return element
}

function createRenderer () {
  const renderer = new WebGLRenderer({
    antialias: true
  })
  renderer.autoClear = false
  renderer.shadowMap.type = PCFSoftShadowMap
  function resize () {
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  tasks.defer((container) => {
    container.appendChild(renderer.domElement)
    resize()
    return Promise.resolve()
  }, 'inject')
  tasks.add(resize, 'resize')
  return renderer
}

function createScene () {
  const scene = new Scene()
  scene.fog = new Fog()
  scene.helpers = new Group()
  scene.add(scene.helpers)
  tasks.add(() => {
    scene.helpers.children.forEach((child) => {
      child.update()
    })
  }, 'update')
  return scene
}

function createCamera () {
  const camera = new IndexCamera()
  tasks.defer(camera, 'inject')
  tasks.add(camera, 'update')
  tasks.add(camera, 'resize')
  return camera
}

function createAnimationLoop () {
  const loop = createLoop(null, update, render)
  let animationFrame = 0
  function update () {
    tasks.run('update', animationFrame++, index.state)
  }
  function render () {
    renderer.clear()
    tasks.run('render', renderer, scene, camera)
    renderer.render(scene, camera)
  }
  return loop
}

// Events

window.addEventListener('resize', (event) => {
  tasks.run('resize', event)
}, false)

// Interface

const components = IndexInterface.create()
tasks.defer(components, 'inject')
tasks.add(components, 'render')

// Lights

const lights = IndexLights.create()
tasks.defer(lights, 'populate').then(() => {
  tasks.add(lights, 'update')
})

// Entities

const entities = IndexEntities.create()
tasks.defer(entities, 'load')
tasks.defer(entities, 'populate').then(() => {
  tasks.add(entities, 'update')
  tasks.add(entities, 'render')
})

// Link state to scene

const index = IndexSceneState.create({
  camera,
  renderer,
  scene,
  lights,
  entities
})
tasks.add(index, 'syncState')

// Phrase

const phrase = IndexPhraseState.create({
  camera,
  entities
})
tasks.add(phrase, 'syncState')

// Start

function inject () {
  document.body.appendChild(container)
  tasks.flush('inject', container).then(() => {
    tasks.run('resize')
  })
}

function load () {
  tasks.flush('load').then(() => {
    components.hideLoader()
  })
}

function start (settings) {
  renderer.shadowMap.enabled = settings.useShadow // FIXME
  tasks.run('syncState')
  loop.start()
}

function populate (settings) {
  tasks.flush('populate', scene, camera, settings).then(() => {
    tasks.run('syncState')
  })
}

inject()
setTimeout(() => {
  const settings = RENDER_SETTINGS.MED
  load()
  start(settings)
  populate(settings)
}, 0)

// FIXME
// #ifdef DEVELOPMENT
require('./index-debug').createDebug({
  renderer,
  scene,
  camera,
  loop,
  state: index.state,
  updateState: index.updateState.bind(index)
})
// #endif
