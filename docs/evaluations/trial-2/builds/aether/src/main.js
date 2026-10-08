import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createGame, start, turn, tick, togglePause, restart } from './game.js'
import { attachInput } from './input.js'
import { loadHighScore, saveHighScore } from './storage.js'
import { createHud, hudModel } from './hud.js'
import { createLoop } from './loop.js'
import { THEME } from './render/theme.js'
import { buildWorld, fogRange, frameCamera } from './render/world.js'
import { createSnakeView } from './render/snake-view.js'

const WIDTH = 20
const HEIGHT = 20
const MAX_PIXEL_RATIO = 2
const SHAKE_MS = 350

function readSeed() {
  const raw = new URLSearchParams(window.location.search).get('seed')
  if (raw !== null && /^-?\d+$/.test(raw.trim())) return Number(raw) >>> 0
  return (Math.random() * 0x100000000) >>> 0
}

function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const storage = getStorage()
const canvas = document.getElementById('game')

// Renderer: antialiasing, shadows, ACES Filmic tone mapping, sRGB output.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.info.autoReset = false

const scene = new THREE.Scene()
scene.background = new THREE.Color(THEME.colors.background)
scene.fog = new THREE.Fog(THEME.colors.fog, 25, 70) // resize() fits it to the camera
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
scene.add(buildWorld({ width: WIDTH, height: HEIGHT, theme: THEME }))
const view = createSnakeView({ scene, theme: THEME, width: WIDTH, height: HEIGHT })

// Post-processing: bloom, then tone mapping and color space conversion. The
// composer draws the scene off-screen, so its target is multisampled for antialiasing.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), THEME.bloom.strength, THEME.bloom.radius, THEME.bloom.threshold)
composer.addPass(bloom)
composer.addPass(new OutputPass())

const hud = createHud(document.getElementById('hud'))
const highScore = { value: loadHighScore(storage) }
let game = createGame({ width: WIDTH, height: HEIGHT, seed: readSeed() })
let isNewBest = false
let shakeUntil = 0
let pulseUntil = 0
const loop = createLoop({ startMs: performance.now() })
const cameraBase = new THREE.Vector3()

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  renderer.setPixelRatio(ratio)
  renderer.setSize(w, h, false)
  composer.setPixelRatio(ratio)
  composer.setSize(w, h)
  frameCamera(camera, { width: WIDTH, height: HEIGHT, aspect: w / h })
  camera.updateProjectionMatrix()
  cameraBase.copy(camera.position)
  Object.assign(scene.fog, fogRange(camera))
}
window.addEventListener('resize', resize)
resize()

function refreshHud() {
  hud.update(hudModel({
    status: game.status,
    score: game.score,
    highScore: highScore.value,
    level: game.level,
    isNewBest,
  }))
}

function shake(nowMs) {
  shakeUntil = nowMs + SHAKE_MS
}

function endGame() {
  const previousBest = highScore.value
  highScore.value = saveHighScore(storage, game.score)
  isNewBest = game.score > previousBest
}

// Runs one rules tick and fires the feedback for what happened.
function runTick(nowMs) {
  const before = game
  game = tick(game)
  if (game === before) return
  if (game.foodsEaten > before.foodsEaten) {
    view.onEat(before.food)
    if (game.level > before.level) {
      pulseUntil = nowMs + 700
      shake(nowMs)
    }
  }
  if (game.status === 'over' || game.status === 'won') {
    if (game.status === 'over') {
      view.onGameOver()
      shake(nowMs)
    }
    endGame()
  }
}

function newGame() {
  game = restart(game)
  isNewBest = false
  view.reset()
  loop.reset(performance.now())
}

function onCommand(command, source) {
  const now = performance.now()
  // On a phone, a tap or a swipe on the end screens plays again, and a tap starts.
  if (source === 'touch') {
    const ended = game.status === 'over' || game.status === 'won'
    if (ended || (game.status === 'ready' && command === 'pause')) command = 'restart'
  }
  if (command === 'pause') {
    const wasPaused = game.status === 'paused'
    game = togglePause(game)
    // Resume from the held alpha, so the snake carries on from where it stopped.
    if (wasPaused && game.status === 'running') loop.reset(now - lastAlpha * game.tickMs)
  } else if (command === 'restart') {
    if (game.status === 'over' || game.status === 'won') newGame()
    else if (game.status === 'ready') {
      game = start(game)
      loop.reset(now)
    }
  } else {
    if (game.status === 'ready') {
      game = start(game)
      loop.reset(now)
    }
    game = turn(game, command)
  }
  refreshHud()
}
attachInput(window, onCommand)

// A hidden tab gets no frames; pausing keeps the return from running a burst of ticks.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.status === 'running') {
    game = togglePause(game)
    refreshHud()
  }
})

let lastAlpha = 1

function frame(nowMs) {
  if (game.status === 'running') {
    const due = loop.advance(nowMs, game.tickMs)
    for (let i = 0; i < due.ticks && game.status === 'running'; i++) runTick(nowMs)
    if (game.status === 'running') lastAlpha = due.alpha
    else lastAlpha = 1
    if (due.ticks > 0) refreshHud()
  } else if (game.status === 'ready' || game.status === 'over' || game.status === 'won') {
    lastAlpha = 1
  }
  // While paused the last alpha is held so the snake does not jump.
  view.update(game, lastAlpha, nowMs)

  camera.position.copy(cameraBase)
  if (nowMs < shakeUntil) {
    const k = ((shakeUntil - nowMs) / SHAKE_MS) * 0.25
    camera.position.x += (Math.random() - 0.5) * k
    camera.position.y += (Math.random() - 0.5) * k
  }
  bloom.strength = THEME.bloom.strength + (nowMs < pulseUntil ? ((pulseUntil - nowMs) / 700) * 1.2 : 0)

  renderer.info.reset()
  composer.render()
  requestAnimationFrame(frame)
}

refreshHud()
loop.reset(performance.now())
requestAnimationFrame(frame)

// Debug API for automated play-testing; it only reads.
window.snake = {
  getState() {
    const head = game.snake[0]
    return {
      status: game.status,
      score: game.score,
      highScore: highScore.value,
      level: game.level,
      length: game.snake.length,
      head: { x: head.x, y: head.y },
      food: game.food ? { x: game.food.x, y: game.food.y } : null,
      direction: game.direction,
      width: game.width,
      height: game.height,
      tickMs: game.tickMs,
      foodsEaten: game.foodsEaten,
      ticks: game.ticks,
    }
  },
  getRenderInfo() {
    const { calls, triangles } = renderer.info.render
    const { geometries, textures } = renderer.info.memory
    return { calls, triangles, geometries, textures }
  },
}
