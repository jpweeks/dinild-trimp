import {
  Color,
  Fog,
  Group,
  HemisphereLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SpotLight,
  WebGLRenderer
} from 'three'

import { RENDER_SETTINGS } from './constants/fidelity'
import { MOUTH_FRAMES_MAP } from './constants/animation'
import { WORD_LOCATIONS } from './constants/phrase'

import { createTaskManager } from './utils/task'
import { createLoop } from './utils/loop'
import { createVector, copyVector } from './utils/vector'
import { TrackballControls } from './controls/TrackballControls'
import { SelectionControls } from './controls/SelectionControls'
import { mapLinear } from './utils/math'
import { SceneState } from './state/SceneState'
import { Dinild } from './entities/Dinild'
import { Needle } from './entities/Needle'
import { NeedleGroup } from './entities/NeedleGroup'

function createColor (...args) {
  return new Color(...args)
}

const cameraOptions = [{
  position: createVector(6, 3, 23),
  target: createVector(3, 0, 1),
  up: createVector(0, 1, 0),
  fov: 92
}, {
  position: createVector(-4.5, 2.5, 22.5),
  target: createVector(3, 0, 1),
  up: createVector(0, 1, 0),
  fov: 92
}, {
  position: createVector(-4, 3.5, 25.5),
  target: createVector(2, 0, 1),
  up: createVector(0, 1, 0),
  fov: 80.5
}]
const cameraStart = cameraOptions[0]

const state = {
  camera: {
    position: createVector(cameraStart.position),
    target: createVector(cameraStart.target),
    up: createVector(cameraStart.up),
    fov: cameraStart.fov,
    reset: () => {
      copyVector(state.camera.position, cameraStart.position)
      copyVector(state.camera.target, cameraStart.target)
      copyVector(state.camera.up, cameraStart.up)
      state.camera.fov = cameraStart.fov
      updateState(state)
    }
  },
  fog: {
    color: createColor(0x11001D),
    near: 11.2,
    far: 15.6
  },
  skin: {
    shininess: 30,
    normalScale: 1,
    textureAnisotropy: 4
  },
  pose: {
    frames: MOUTH_FRAMES_MAP,
    startFrame: 0,
    targetFrame: 1,
    activeFrameWeight: 0
  },
  phrase: {
    words: [],
    preview: {
      position: createVector(0, 0, 0),
      normal: createVector(0, 0, 0),
      visible: false
    }
  },
  lightTop: {
    position: createVector(-13, 21.5, 20.5),
    target: createVector(4.5, -1.5, 5),
    color: createColor(0xCAFF7C),
    intensity: 2.3,
    distance: 35,
    angle: 0.62,
    penumbra: 0.2,
    decay: 0.9,
    castShadow: true
  },
  lightBottom: {
    position: createVector(2, -14, 24.5),
    target: createVector(0, 5.5, 1),
    color: createColor(0xD1F08A),
    intensity: 2.4,
    distance: 40,
    angle: 0.59,
    penumbra: 0.2,
    decay: 0.75,
    castShadow: true
  },
  lightAmbient: {
    skyColor: createColor(0xBCADFF),
    groundColor: createColor(0xDBFFF4),
    intensity: 0.6
  }
}

const container = createContainer()
const tasks = createTaskManager(
  'load', 'update', 'render', 'resize')
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
  renderer.shadowMap.enabled = RENDER_SETTINGS.useShadow
  renderer.shadowMap.type = PCFSoftShadowMap
  tasks.add(() => {
    renderer.setSize(window.innerWidth, window.innerHeight)
  }, 'resize')
  return renderer
}

function createScene () {
  const scene = new Scene()
  scene.fog = new Fog()
  scene.helpers = new Group()
  scene.add(scene.helpers)
  return scene
}

function createCamera () {
  const camera = new PerspectiveCamera(1, 1, 0.1, 100)
  const controls = new TrackballControls(camera, container)
  const selection = new SelectionControls(camera, container)

  Object.assign(camera, {
    controls,
    selection
  })
  Object.assign(controls, {
    rotateSpeed: 1,
    zoomSpeed: 0.8,
    panSpeed: 0.1,
    noZoom: false,
    noPan: false,
    dynamicDampingFactor: 0.3,
    minDistance: 18,
    maxDistance: 30
  })

  selection.addEventListener('start', () => {
    controls.enabled = false
  })
  selection.addEventListener('end', () => {
    controls.enabled = true
  })

  tasks.add((frame) => {
    controls.update(frame)
    selection.update(frame)
  }, 'update')
  tasks.add(() => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    controls.resize()
    selection.resize()
  }, 'resize')

  return camera
}

function createAnimationLoop () {
  const loop = createLoop(null, update, render)
  let animationFrame = 0
  function update () {
    tasks.run('update', animationFrame++)
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

// Lights

function createSpotLight () {
  const light = new SpotLight()
  const { shadowMapSize } = RENDER_SETTINGS
  light.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  return light
}

function createHemiLight () {
  return new HemisphereLight()
}

const lights = {
  top: createSpotLight(),
  bottom: createSpotLight(),
  ambient: createHemiLight()
}
Object.keys(lights).forEach((key) => {
  scene.add(lights[key])
})

function modulateSinPrime (t) {
  const { sin } = Math
  return sin(
    sin(17 * t) +
    sin(23 * t) +
    sin(41 * t) +
    sin(59 * t) +
    sin(127 * t))
}

function modulateIntensity (intensity, scaleMin, t) {
  const base = 1// Math.min(1, t * t * 200)
  return base * mapLinear(-1, 1,
    intensity * scaleMin, intensity,
    modulateSinPrime(t))
}

tasks.add(function animateLights (frame) {
  lights.top.intensity = modulateIntensity(state.lightTop.intensity,
    0.65, frame * 0.0021)
  lights.bottom.intensity = modulateIntensity(state.lightBottom.intensity,
    0.75, frame * 0.0022)
  lights.ambient.intensity = modulateIntensity(state.lightAmbient.intensity,
    0.85, frame * 0.0020)
}, 'update')

// Dinild

const dinild = new Dinild({
  castShadow: RENDER_SETTINGS.useShadow,
  receiveShadow: RENDER_SETTINGS.useShadow,
  useSubsurface: RENDER_SETTINGS.useSubsurface
})
const needles = new NeedleGroup()
const needleCursor = new Needle()

const loadDinild = tasks.defer(dinild, 'load')
const loadNeedle = tasks.defer(needleCursor, 'load')

loadDinild.then(() => {
  dinild.addTo(scene)
  // tasks.add(dinild, 'update')
  tasks.add(dinild, 'render')
})

Promise.all([loadDinild, loadNeedle]).then(() => {
  // needleCursor.bind(dinild.skeleton)
  // needles.bind(dinild.skeleton)

  needleCursor.addTo(dinild)
  needles.addTo(dinild)

  Object.assign(camera.selection, {
    cursorEntity: needleCursor,
    targetEntity: dinild,
    targetOptionUVs: WORD_LOCATIONS
  })

  camera.selection.addEventListener('add', (event) => {
    console.log(event)
    needles.addInstanceFrom(needleCursor)
  })
})

// Link state to scene

const index = new SceneState({
  camera,
  renderer,
  scene,
  tasks
})

function updateState (nextState) {
  index.updateCamera(nextState.camera)
  index.updateFog(nextState.fog)
  // index.updatePose(dinild.pose, dinild.mesh, nextState.pose)
  index.updateSkinMaterial(dinild.material, nextState.skin)
  index.updateSpotLight(lights.top, nextState.lightTop)
  index.updateSpotLight(lights.bottom, nextState.lightBottom)
  index.updateHemiLight(lights.ambient, nextState.lightAmbient)
}

// Start

function inject () {
  container.appendChild(renderer.domElement)
  document.body.appendChild(container)
  tasks.run('resize')
}

function load () {
  tasks.flush('load')
}

function start () {
  updateState(state)
  loop.start()
}

inject()
setTimeout(() => {
  load()
  start()
}, 0)

// FIXME
// #ifdef DEVELOPMENT
require('./index-debug').createDebug({
  renderer,
  scene,
  camera,
  loop,
  state,
  updateState
})
// #endif
