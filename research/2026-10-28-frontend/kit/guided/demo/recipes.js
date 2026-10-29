// Recipes for a three.js r186 game scene. Each function is self-contained and copyable.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// R1. Renderer: tone mapping, color space, shadows, capped pixel ratio.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // r186: PCFSoftShadowMap is deprecated; soften with light.shadow.radius
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  // With a composer, renderer.info counts only the last pass unless you reset it yourself each frame:
  renderer.info.autoReset = false // call renderer.info.reset() at the start of every frame
  renderer.outputColorSpace = THREE.SRGBColorSpace
  return renderer
}

// R2. Bloom: RenderPass, UnrealBloomPass, then OutputPass (tone mapping and sRGB happen in OutputPass).
export function createComposer(renderer, scene, camera, bloom) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const size = renderer.getSize(new THREE.Vector2())
  const bloomPass = new UnrealBloomPass(size, bloom.strength, bloom.radius, bloom.threshold)
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())
  return { composer, bloomPass }
}

// R3. Resize: renderer, composer and camera together, keeping the board framed.
export function onResize(renderer, composer, camera, frame) {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  camera.aspect = w / h
  frame(camera, w / h)
  camera.updateProjectionMatrix()
}

// R4. Lights: hemisphere fill plus one shadow-casting key light fitted to the board.
export function addLights(scene, { width, height }) {
  scene.add(new THREE.HemisphereLight(0x6a7ad8, 0x3a1810, 1.3))
  const key = new THREE.DirectionalLight(0xbcd0ff, 2.4)
  const s = Math.max(width, height)
  key.position.set(-0.4 * s, 0.7 * s, 0.3 * s)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 4
  const half = s / 2 + 2
  Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: 3 * s })
  key.shadow.camera.updateProjectionMatrix()
  scene.add(key)
  return key
}

// R5. Atmosphere: background and exponential fog of the same family; a starfield as Points.
export function addAtmosphere(scene, { background, fog, size }) {
  scene.background = new THREE.Color(background)
  scene.fog = new THREE.FogExp2(fog, 0.35 / size)
  const n = 600
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1
    const a = Math.random() * Math.PI * 2
    const r = 80
    const k = Math.sqrt(1 - u * u)
    positions.set([r * k * Math.cos(a), Math.abs(r * u) * 0.8 + 5, r * k * Math.sin(a)], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  // Far away points need a size in pixels: sizeAttenuation false, size 2. With attenuation, 0.15 at 80 units is invisible.
  const mat = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false })
  const stars = new THREE.Points(geo, mat)
  scene.add(stars)
  return { stars, twinkle: (t) => (mat.opacity = 0.75 + 0.25 * Math.sin(t * 1.7)) }
}

// R6. A checker board as ONE InstancedMesh (one draw call for every tile).
export function createBoard({ width, height, colorA, colorB, gridToWorld }) {
  const geo = new THREE.BoxGeometry(0.96, 0.12, 0.96)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 })
  const mesh = new THREE.InstancedMesh(geo, mat, width * height)
  mesh.name = 'board'
  mesh.receiveShadow = true
  const m = new THREE.Matrix4()
  const c = new THREE.Color()
  let i = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = gridToWorld(x, y, width, height)
      m.makeTranslation(p.x, -0.06, p.z)
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, c.set((x + y) % 2 ? colorB : colorA))
      i++
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  return mesh
}

// R7. A modeled head facing +Z: rounded box, glowing eyes, horns. Glow = emissiveIntensity above the bloom threshold.
export function createHead({ color, eyeColor }) {
  const head = new THREE.Group()
  head.name = 'snake-head'
  const skin = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, emissive: 0x6b4a00, emissiveIntensity: 0.2 })
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.55, 1.0, 4, 0.18), skin)
  body.castShadow = true
  head.add(body)
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 3 })
  const eyeGeo = new THREE.SphereGeometry(0.09, 12, 8)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.set(0.22 * side, 0.18, 0.42)
    head.add(eye)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8), skin)
    horn.position.set(0.25 * side, 0.36, -0.2)
    horn.rotation.x = -THREE.MathUtils.degToRad(35)
    head.add(horn)
  }
  head.userData.skin = skin
  return head
}

// R8. Turning by the shortest angle; exact target at t = 1.
export function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return t >= 1 ? b : a + d * t
}

// R9. A body of many segments as InstancedMesh, updated every frame with NO allocations:
// reuse one Object3D (or Matrix4), one Color; write matrices, then flag needsUpdate.
export function createBody({ max, radius = 0.42 }) {
  const geo = new THREE.SphereGeometry(radius, 20, 14)
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.35 })
  const mesh = new THREE.InstancedMesh(geo, mat, max)
  mesh.castShadow = true
  mesh.count = 0
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  // points: [{x, z}], from neck to tail; colorAt(i) -> hex; scaleAt(i) -> number; yAt(i) -> number
  function update(points, colorAt, scaleAt, yAt) {
    mesh.count = points.length
    for (let i = 0; i < points.length; i++) {
      dummy.position.set(points[i].x, yAt(i), points[i].z)
      dummy.scale.setScalar(scaleAt(i))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.set(colorAt(i)))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  return { mesh, update }
}

// R10. Interpolate between the previous tick's cells and the current ones (alpha in [0, 1]).
// A grown snake has one more cell than before: the new tail starts where the old tail was.
export function interpolateCells(prev, curr, alpha, out) {
  out.length = curr.length
  for (let i = 0; i < curr.length; i++) {
    const a = prev[Math.min(i, prev.length - 1)] || curr[i]
    const b = curr[i]
    out[i] = out[i] || { x: 0, z: 0 }
    out[i].x = a.x + (b.x - a.x) * alpha
    out[i].z = a.z + (b.z - a.z) * alpha
  }
  return out
}

// R11. A glowing lantern with its own light; animate it with time, not per tick.
export function createLantern({ color }) {
  const group = new THREE.Group()
  group.name = 'food'
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.6 })
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16), glow))
  const capMat = new THREE.MeshStandardMaterial({ color: 0x5a1a10, roughness: 0.5 })
  const cap = new THREE.CylinderGeometry(0.2, 0.26, 0.08, 16)
  const top = new THREE.Mesh(cap, capMat)
  top.position.y = 0.29
  const bottom = new THREE.Mesh(cap, capMat)
  bottom.position.y = -0.29
  bottom.rotation.x = Math.PI
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), capMat)
  tassel.position.y = -0.48
  group.add(top, bottom, tassel)
  const light = new THREE.PointLight(0xff9a4a, 6, 6, 2)
  group.add(light)
  function animate(t, baseY = 0.6) {
    group.position.y = baseY + 0.12 * Math.sin(2.2 * t)
    group.rotation.y = 0.8 * t
    glow.emissiveIntensity = 2.2 + 0.4 * Math.sin(t * Math.PI * 3)
  }
  return { group, animate }
}

// R12. A pooled particle burst: preallocated buffers, additive, no depth write. Call update(dt) every frame.
export function createBurstPool({ count = 36, pools = 6, color, size = 0.18, life = 0.9, gravity = -6 }) {
  const bursts = []
  const group = new THREE.Group()
  for (let p = 0; p < pools; p++) {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    group.add(points)
    bursts.push({ points, pos, vel, mat, age: life })
  }
  function spawn(x, y, z, tint) {
    const b = bursts.reduce((oldest, c) => (c.age > oldest.age ? c : oldest))
    b.age = 0
    if (tint !== undefined) b.mat.color.set(tint)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const up = Math.random()
      const speed = 2.5 + Math.random() * 2
      const k = Math.sqrt(1 - up * up)
      b.pos.set([x, y, z], i * 3)
      b.vel.set([k * Math.cos(a) * speed, up * speed, k * Math.sin(a) * speed], i * 3)
    }
    b.points.geometry.attributes.position.needsUpdate = true
  }
  function update(dt) {
    let live = 0
    for (const b of bursts) {
      if (b.age >= life) continue
      b.age += dt
      const k = Math.max(0, 1 - b.age / life)
      b.mat.opacity = k
      b.mat.size = size * k
      for (let i = 0; i < count; i++) {
        b.vel[i * 3 + 1] += gravity * dt
        b.pos[i * 3] += b.vel[i * 3] * dt
        b.pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt
        b.pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt
      }
      b.points.geometry.attributes.position.needsUpdate = true
      if (b.age < life) live++
    }
    return live
  }
  return { group, spawn, update, active: () => bursts.filter((b) => b.age < life).length }
}

// R13. A shockwave ring on the floor, pooled: scale 1 -> 4 and fade in 0.5 s.
export function createRing({ color }) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 48), mat)
  ring.rotation.x = -Math.PI / 2
  let age = 1
  return {
    mesh: ring,
    spawn(x, z) {
      ring.position.set(x, 0.02, z)
      age = 0
    },
    update(dt) {
      if (age >= 0.5) return (mat.opacity = 0), 0
      age += dt
      const k = Math.min(1, age / 0.5)
      ring.scale.setScalar(1 + 3 * k)
      mat.opacity = 0.9 * (1 - k)
      return 1
    },
  }
}

// R14. Camera shake: an offset that decays; add it after framing, never accumulate into the base position.
export function createShake(camera) {
  const base = new THREE.Vector3()
  let amp = 0
  let left = 0
  let total = 0
  return {
    start(amplitude = 0.3, seconds = 0.5) {
      amp = amplitude
      left = total = seconds
    },
    // call with the framed position each frame
    apply(framed, dt) {
      base.copy(framed)
      if (left > 0) {
        left = Math.max(0, left - dt)
        const k = amp * (left / total)
        camera.position.set(base.x + (Math.random() - 0.5) * 2 * k, base.y + (Math.random() - 0.5) * 2 * k, base.z + (Math.random() - 0.5) * 2 * k)
      } else {
        camera.position.copy(base)
      }
    },
  }
}

// R15. Many decorative objects that move (floating lanterns): one InstancedMesh, per-instance state in typed arrays.
export function createFloaters({ count = 48, inner, outer, color }) {
  const geo = new THREE.CylinderGeometry(0.25, 0.3, 0.45, 10)
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4 })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const s = new Float32Array(count * 5) // angle, radius, y, speed, phase
  for (let i = 0; i < count; i++) {
    s.set([Math.random() * Math.PI * 2, inner + Math.random() * (outer - inner), -2 + Math.random() * 20, 0.3 + Math.random() * 0.4, Math.random() * 10], i * 5)
  }
  const dummy = new THREE.Object3D()
  function update(dt, t) {
    for (let i = 0; i < count; i++) {
      const o = i * 5
      s[o + 2] += s[o + 3] * dt
      if (s[o + 2] > 18) s[o + 2] = -2
      const sway = 0.3 * Math.sin(t * 0.7 + s[o + 4])
      dummy.position.set(Math.cos(s[o]) * s[o + 1] + sway, s[o + 2], Math.sin(s[o]) * s[o + 1] + sway)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  return { mesh, update }
}

// R16. Time: THREE.Timer (r186 deprecates THREE.Clock). Clamp dt so a background tab does not explode the effects.
export function createTime() {
  const timer = new THREE.Timer()
  timer.connect(document) // pauses with the page's visibility
  return {
    step(now) {
      timer.update(now)
      return { dt: Math.min(timer.getDelta(), 0.1), t: timer.getElapsed() }
    },
  }
}

// R17. Freeing what you added: geometries, materials (and their textures).
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose()
      m.dispose()
    }
  })
  root.removeFromParent()
}

// R18. Sound without files: WebAudio, created on the first user gesture.
export function createSound() {
  let ctx = null
  let master = null
  let muted = false
  const ensure = () => {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.25
      master.connect(ctx.destination)
    }
    return ctx
  }
  function tone({ freq, type = 'triangle', dur = 0.18, at = 0, gain = 1 }) {
    if (muted || !ensure()) return
    const t0 = ctx.currentTime + at
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }
  return { unlock: ensure, tone, toggleMute: () => (muted = !muted), get muted() { return muted } }
}
