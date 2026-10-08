// Snake 3D, "Abyssal Bloom": the wiring. It builds the renderer (ACES Filmic tone mapping, shadows, fog, bloom),
// the world, the snake view, the HUD and the input, then runs one requestAnimationFrame loop: apply the game
// ticks that fell due, tell the view and the cues what happened, draw. Feedback (the burst of a meal, the swell
// of a level-up, the shake and the dimming of a game over) only mutates objects built once, so a frame
// allocates nothing but the HUD's small model. Sound is a tiny synth in audio.js, muted with M.
//
// The game follows the clock, not the frame rate: the ticks that are due are run by each frame, just before each
// command, and by a timeout armed for the next tick boundary while the game runs, so a slow machine still turns
// the snake on the right tick and the state stays within a tick of the clock between frames.
//
// Debug API for automated play-testing: window.snake.getState() returns a plain copy of the game as of the last
// tick that ran (the timer keeps that within about one tick of the clock, even at 4 fps), and
// window.snake.getRenderInfo() returns the counters of the last drawn frame. Both only read: they run no ticks,
// fire no effects and write nothing, so they cannot change play.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createGame, start, turn, tick, togglePause, restart, DIRECTIONS } from './game.js'
import { attachInput } from './input.js'
import { createLoop } from './loop.js'
import { loadHighScore, saveHighScore } from './storage.js'
import { createHud, hudModel } from './hud.js'
import { createAudio } from './audio.js'
import { THEME, lerp, easeOutCubic, clamp01 } from './render/theme.js'
import { buildWorld, frameCamera } from './render/world.js'
import { createSnakeView } from './render/snake-view.js'

const BOARD_SIZE = 20
const MAX_PIXEL_RATIO = 2
const CAMERA_FOV = 50
const FOG_NEAR = 0.9 // as multiples of the camera's distance from the board: clear over the board, hazy past it
const FOG_FAR = 2.7
const RESTART_GRACE_MS = 600 // a key still held at the moment of death must not restart the game
// A touch that moves 24 px, or lasts 500 ms, is a swipe or a hold, not a tap.
const TAP_MAX_MOVE = 24
const TAP_MAX_MS = 500

// --- the page: seed, storage, no-WebGL message -----------------------------------------------------------

// ?seed=<integer> makes a game repeatable; anything else gives a fresh random seed.
function pickSeed(search) {
  const value = new URLSearchParams(search).get('seed')
  if (value !== null && /^-?\d+$/.test(value)) return Number(value) >>> 0
  return globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : (Math.random() * 2 ** 32) >>> 0
}

// Merely reading window.localStorage can throw (privacy modes), so it is fetched here, inside a try.
function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function showNoWebGL(root) {
  const note = document.createElement('p')
  note.textContent = 'Snake 3D needs WebGL, and this browser could not start it. Try a recent Chrome, Firefox, Safari or Edge, with hardware acceleration on.'
  note.style.cssText = 'position:absolute;inset:0;margin:auto;max-width:28em;height:fit-content;padding:1.5em;text-align:center;font-size:1.1rem;line-height:1.5'
  root.replaceChildren(note)
}

// --- the stage: renderer, scene, camera, post-processing -------------------------------------------------

function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // PCFSoftShadowMap was removed in r186
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.info.autoReset = false // frame() resets it once, so the numbers cover every pass of the composer

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(THEME.colors.background)
  scene.fog = new THREE.Fog(THEME.colors.fog, 1, 2) // near and far follow the camera, see fit()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 500)
  const framed = new THREE.Vector3() // where frameCamera put the camera; cues move it around this point

  // The composer's targets are multisampled, or the bloom pipeline would lose the renderer's antialiasing.
  const samples = (window.devicePixelRatio || 1) >= 2 ? 2 : 4
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
  const composer = new EffectComposer(renderer, target)
  const { strength, radius, threshold } = THEME.bloom
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), strength, radius, threshold)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // Resizing keeps the whole board framed: size the buffers, frame the camera, rescale the fog.
  function fit() {
    const width = Math.max(1, window.innerWidth) // a collapsed window must still leave the camera framed
    const height = Math.max(1, window.innerHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height)
    composer.setPixelRatio(ratio)
    composer.setSize(width, height)
    frameCamera(camera, { width: BOARD_SIZE, height: BOARD_SIZE, aspect: width / height })
    framed.copy(camera.position)
    scene.fog.near = framed.length() * FOG_NEAR
    scene.fog.far = framed.length() * FOG_FAR
  }
  fit()
  window.addEventListener('resize', fit)
  window.addEventListener('orientationchange', () => {
    fit()
    requestAnimationFrame(fit) // some phones report the old size until the next frame
  })

  return { renderer, scene, camera, composer, bloom, framed, fit }
}

// --- the cues: what the scene does to tell you about an event ---------------------------------------------

// A level-up swells the bloom and the exposure and lets them settle; a win swells them more and longer; a game
// over shakes the camera and dims the scene (the pause dims it a little); the title screen lets the camera drift.
function createCues({ renderer, camera, bloom, framed }) {
  const rest = { bloom: bloom.strength, exposure: renderer.toneMappingExposure }
  const swell = { at: -1e9, seconds: 1, bloom: 0, exposure: 0 }
  const shake = { at: -1e9, seconds: 0.6, amplitude: 0.7 }
  let dim = 0 // 0 = lit, 1 = the scene of a lost game
  let drift = 1 // 1 = the camera drifts (title screen)
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)') // then the camera stays put: no shake, no drift

  function swellAmount(now) {
    const age = (now - swell.at) / 1000
    if (age < 0 || age >= swell.seconds) return 0
    const rise = easeOutCubic(clamp01(age / 0.1))
    return rise * (1 - clamp01(age / swell.seconds)) ** 2
  }

  function swellFor(now, seconds, bloomGain, exposureGain) {
    swell.at = now
    swell.seconds = seconds
    swell.bloom = bloomGain
    swell.exposure = exposureGain
  }

  function shakeCamera(now) {
    const age = (now - shake.at) / 1000
    if (age >= 0 && age < shake.seconds) {
      const power = shake.amplitude * (1 - age / shake.seconds) ** 2
      camera.position.x += power * Math.sin(age * 61)
      camera.position.y += power * 0.6 * Math.sin(age * 83 + 1.3)
      camera.position.z += power * 0.5 * Math.sin(age * 47 + 2.1)
    }
  }

  function update(now, dt, status) {
    const dimTarget = status === 'over' ? 1 : status === 'paused' ? 0.3 : 0
    dim += (dimTarget - dim) * (1 - Math.exp(-dt * (dimTarget > dim ? 3 : 6)))
    drift += ((status === 'ready' ? 1 : 0) - drift) * (1 - Math.exp(-dt * 2))

    const s = swellAmount(now)
    bloom.strength = rest.bloom * (1 + swell.bloom * s) * lerp(1, 0.45, dim)
    renderer.toneMappingExposure = rest.exposure * (1 + swell.exposure * s) * lerp(1, 0.6, dim)

    camera.position.copy(framed)
    if (calm?.matches) return
    shakeCamera(now)
    camera.position.x += drift * 0.5 * Math.sin(now * 0.0004)
    camera.position.y += drift * 0.12 * Math.sin(now * 0.0007 + 1)
  }

  return {
    levelUp: (now) => swellFor(now, 0.8, 0.9, 0.25),
    won: (now) => swellFor(now, 1.8, 1.6, 0.35),
    over: (now) => {
      shake.at = now
    },
    reset: () => {
      swell.at = shake.at = -1e9
    },
    update,
  }
}

// --- the game ---------------------------------------------------------------------------------------------

function attachTaps(target, onTap) {
  let touch = null
  target.addEventListener('touchstart', (event) => {
    const t = event.touches[0]
    touch = event.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: event.timeStamp } : null
  }, { passive: true })
  target.addEventListener('touchend', (event) => {
    const t = event.changedTouches[0]
    const tapped = touch && t && Math.hypot(t.clientX - touch.x, t.clientY - touch.y) < TAP_MAX_MOVE && event.timeStamp - touch.at < TAP_MAX_MS
    touch = null
    if (tapped) onTap()
  }, { passive: true })
}

function boot(stage) {
  const { renderer, scene, composer } = stage
  const storage = getStorage()
  const audio = createAudio({ storage })
  const hud = createHud(document.getElementById('hud'))
  const world = buildWorld({ width: BOARD_SIZE, height: BOARD_SIZE, theme: THEME })
  scene.add(world)
  const view = createSnakeView({ scene, theme: THEME, width: BOARD_SIZE, height: BOARD_SIZE })
  const cues = createCues(stage)
  const loop = createLoop({ startMs: performance.now() })

  let game = createGame({ width: BOARD_SIZE, height: BOARD_SIZE, seed: pickSeed(window.location.search) })
  let alpha = 1 // how far the view has come toward the latest tick
  let storedBest = loadHighScore(storage)
  let isNewBest = false
  let endedAt = 0 // when the last game ended (ms)

  // --- events of the rules ---

  function endGame(now) {
    const previous = Math.max(storedBest, loadHighScore(storage))
    storedBest = Math.max(previous, saveHighScore(storage, game.score))
    isNewBest = game.score > 0 && game.score > previous
    endedAt = now
    alpha = 1
  }

  // Compares the game before and after one tick and fires the feedback for what changed.
  function announce(before, now) {
    const ate = game.foodsEaten > before.foodsEaten
    const levelUp = game.level > before.level
    if (ate) view.onEat(game.snake[0])
    if (game.status === 'won') {
      cues.won(now)
      audio.won()
      endGame(now)
    } else if (game.status === 'over') {
      view.onGameOver()
      cues.over(now)
      audio.gameOver()
      endGame(now)
    } else if (levelUp) {
      cues.levelUp(now)
      audio.levelUp()
    } else if (ate) {
      audio.eat(game.foodsEaten)
    }
  }

  // Runs the ticks that are due. The frame calls it, and so do each command and the timer, so the game follows
  // the clock and the inputs, never the frame rate: on a slow machine a key press still lands on the right tick.
  // Calling it any number of times is harmless, the loop hands out each tick once.
  function advance(now) {
    if (game.status === 'running') {
      const due = loop.advance(now, game.tickMs)
      alpha = due.alpha
      for (let i = 0; i < due.ticks && game.status === 'running'; i++) {
        const before = game
        game = tick(game)
        announce(before, now)
      }
    } else if (game.status === 'ready') {
      alpha = 1
    }
    // A paused game keeps its alpha, so the picture holds still; endGame() sets it to 1 for over and won.
  }

  // --- the timer between frames ---

  // A frame can take a quarter of a second under software rendering, and the debug API only reads. So while the
  // game runs, a timeout waits for the next tick boundary and runs the ticks that fell due, then arms the next
  // one; the frame still runs and recomputes alpha as before, and a tick the frame took first is not run twice.
  // The chain ends by itself as soon as the game is no longer running (pause, hidden tab, game over); the
  // commands that make it run again (start, resume, restart) arm it anew, unless a timeout is still pending.
  let timer = 0

  function arm() {
    if (timer !== 0 || game.status !== 'running') return
    timer = setTimeout(onTimer, Math.max(1, Math.ceil((1 - alpha) * game.tickMs)))
  }

  function onTimer() {
    timer = 0
    advance(performance.now())
    arm()
  }

  // --- commands ---

  function begin(next, now) {
    game = start(next)
    loop.reset(now)
    alpha = 0
  }

  function newGame(direction, now) {
    game = restart(game)
    if (direction) game = turn(game, direction)
    view.reset()
    cues.reset()
    isNewBest = false
    begin(game, now)
  }

  function pause() {
    game = togglePause(game)
  }

  function resume(now) {
    game = togglePause(game)
    loop.reset(now - alpha * game.tickMs) // go on from where the tick stood, so the snake does not jump back
  }

  // 'tap' is a touch that did not swipe: Space and Enter for phones.
  function handleCommand(command) {
    const now = performance.now()
    advance(now)
    const isDirection = Object.hasOwn(DIRECTIONS, command)
    switch (game.status) {
      case 'ready':
        if (isDirection) begin(turn(game, command), now)
        else if (command === 'restart' || command === 'tap') begin(game, now)
        break
      case 'running':
        if (isDirection) game = turn(game, command)
        else if (command === 'pause') pause()
        break
      case 'paused':
        if (command === 'pause' || command === 'tap') resume(now)
        break
      default: // 'over' and 'won'
        if (command === 'restart') newGame(null, now)
        else if ((isDirection || command === 'tap') && now - endedAt >= RESTART_GRACE_MS) newGame(isDirection ? command : null, now)
    }
    arm() // a start, a resume or a restart has just made the game run
  }

  function autoPause() {
    if (game.status === 'running') pause()
  }

  // --- the frame ---

  const bestShown = () => Math.max(storedBest, game.score)
  let lastFrame = performance.now()
  let lastRatio = window.devicePixelRatio

  function frame() {
    requestAnimationFrame(frame)
    const now = performance.now()
    const dt = Math.min(0.1, (now - lastFrame) / 1000)
    lastFrame = now

    if (window.devicePixelRatio !== lastRatio) {
      lastRatio = window.devicePixelRatio // a window dragged to another screen changes it without a resize event
      stage.fit()
    }
    renderer.info.reset()
    advance(now)
    view.update(game, alpha, now)
    world.userData.update?.(now)
    hud.update(hudModel({ status: game.status, score: game.score, highScore: bestShown(), level: game.level, isNewBest }))
    cues.update(now, dt, game.status)
    composer.render()
  }

  // --- wiring ---

  attachInput(window, handleCommand)
  attachTaps(window, () => handleCommand('tap'))
  for (const type of ['keydown', 'touchend', 'pointerup', 'mousedown', 'click']) window.addEventListener(type, audio.unlock, { passive: true })
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'm' && event.key !== 'M') return
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    audio.toggleMute()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoPause()
  })
  window.addEventListener('blur', autoPause)

  // A pure read: copies of the state, never the live game, and no clock catch-up, so polling cannot change play.
  window.snake = {
    getState() {
      const head = game.snake[0]
      return {
        status: game.status,
        score: game.score,
        highScore: bestShown(),
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
      const { render, memory } = renderer.info
      return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures }
    },
  }

  frame() // one frame at once, so getRenderInfo() has numbers as soon as window.snake exists
}

function main() {
  let stage
  try {
    stage = createStage(document.getElementById('game'))
  } catch (error) {
    console.error(error)
    showNoWebGL(document.getElementById('hud'))
    return
  }
  boot(stage)
}

main()
