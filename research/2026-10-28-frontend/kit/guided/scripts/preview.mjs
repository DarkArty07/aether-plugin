// Shows the parts of the game that exist before src/main.js does: the theme, the world, the snake view and
// the HUD, each through the interfaces the spec gives. A missing part is left out. Used by `npm run shots`.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const parts = []
async function load(path) {
  try {
    const m = await import(path)
    parts.push(path)
    return m
  } catch (e) {
    if (!/Failed to fetch|404|Cannot find/.test(String(e))) console.error(`preview: ${path} failed to load: ${e.message}`)
    return null
  }
}
const themeMod = await load('../src/render/theme.js')
const worldMod = await load('../src/render/world.js')
const viewMod = await load('../src/render/snake-view.js')
const hudMod = await load('../src/hud.js')

const THEME = themeMod?.THEME ?? { colors: { background: 0x101018, fog: 0x101018 }, bloom: { strength: 0.8, radius: 0.5, threshold: 0.7 } }
const W = 20
const H = 20
const canvas = document.getElementById('game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.setSize(window.innerWidth, window.innerHeight, false)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color(THEME.colors.background)
scene.fog = new THREE.Fog(THEME.colors.fog, 25, 90)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500)
if (worldMod?.buildWorld) scene.add(worldMod.buildWorld({ width: W, height: H, theme: THEME }))
else {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.2))
  const key = new THREE.DirectionalLight(0xffffff, 2)
  key.position.set(-8, 20, 10)
  scene.add(key)
}
if (worldMod?.frameCamera) worldMod.frameCamera(camera, { width: W, height: H, aspect: window.innerWidth / window.innerHeight })
else {
  camera.position.set(0, 22, 16)
  camera.lookAt(0, 0, 0)
}
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), THEME.bloom.strength, THEME.bloom.radius, THEME.bloom.threshold))
composer.addPass(new OutputPass())

// A fake game the view can draw: an 8-cell snake gliding around a rectangle, and food ahead of it.
const path = []
for (let x = 4; x <= 15; x++) path.push({ x, y: 6, d: 'right' })
for (let y = 7; y <= 13; y++) path.push({ x: 15, y, d: 'down' })
for (let x = 14; x >= 4; x--) path.push({ x, y: 13, d: 'left' })
for (let y = 12; y >= 7; y--) path.push({ x: 4, y, d: 'up' })
let ticks = 0
const game = () => {
  const head = (ticks + 8) % path.length
  const snake = []
  for (let i = 0; i < 8; i++) snake.push({ x: path[(head - i + path.length) % path.length].x, y: path[(head - i + path.length) % path.length].y })
  const food = path[(head + 3) % path.length]
  return { snake, direction: path[head].d, ticks, food: { x: food.x, y: food.y }, status: phase === 'over' ? 'over' : 'running', width: W, height: H, score: 120, level: 2 }
}
let phase = 'play'
const view = viewMod?.createSnakeView ? viewMod.createSnakeView({ scene, theme: THEME, width: W, height: H }) : null

if (hudMod?.createHud && hudMod?.hudModel) {
  const hud = hudMod.createHud(document.getElementById('hud'))
  hud.update(hudMod.hudModel({ status: 'running', score: 120, highScore: 340, level: 2, isNewBest: false }))
  window.previewHud = (status, isNewBest = false) => hud.update(hudMod.hudModel({ status, score: 120, highScore: 340, level: 2, isNewBest }))
}

const start = performance.now()
let lastTick = start
let ate = false
let over = false
function frame(now) {
  const t = now - start
  while (now - lastTick >= 150 && phase === 'play') {
    lastTick += 150
    ticks++
  }
  const alpha = Math.min(1, (now - lastTick) / 150)
  if (view) {
    if (!ate && t > 1000) {
      ate = true
      view.onEat?.(game().food)
    }
    if (!over && t > 2500) {
      over = true
      phase = 'over'
      view.onGameOver?.()
    }
    view.update(game(), alpha, now)
  }
  composer.render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.preview = { parts, ready: true }
