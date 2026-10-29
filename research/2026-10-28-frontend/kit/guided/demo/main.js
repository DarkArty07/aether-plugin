import * as THREE from 'three'
import * as R from './recipes.js'
const W = 12, H = 12
const gridToWorld = (x, y, w, h) => ({ x: x - w / 2 + 0.5, z: y - h / 2 + 0.5 })
const renderer = R.createRenderer(document.getElementById('game'))
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200)
const framed = new THREE.Vector3()
const frame = (cam, aspect) => { const d = (Math.max(W, H) + 4) / (2 * Math.tan(THREE.MathUtils.degToRad(22.5))) / Math.min(1, aspect); framed.set(0, d * Math.sin(0.96), d * Math.cos(0.96)); cam.position.copy(framed); cam.lookAt(0, 0, 0) }
frame(camera, innerWidth / innerHeight)
const { composer, bloomPass } = R.createComposer(renderer, scene, camera, { strength: 0.9, radius: 0.55, threshold: 0.82 })
R.addLights(scene, { width: W, height: H })
const sky = R.addAtmosphere(scene, { background: 0x0b0d24, fog: 0x161a3a, size: Math.max(W, H) })
scene.add(R.createBoard({ width: W, height: H, colorA: 0x5a1e16, colorB: 0x6a2419, gridToWorld }))
const head = R.createHead({ color: 0xffc94a, eyeColor: 0x7fe0c4 }); head.position.y = 0.42; scene.add(head)
const body = R.createBody({ max: 64 }); scene.add(body.mesh)
const joints = R.createBody({ max: 64 }); scene.add(joints.mesh)
const lantern = R.createLantern({ color: 0xff7a2f }); lantern.group.position.set(2.5, 0.6, 2.5); scene.add(lantern.group)
const sparks = R.createBurstPool({ color: 0xffd27a }); scene.add(sparks.group)
const ring = R.createRing({ color: 0x7fe0c4 }); scene.add(ring.mesh)
const floaters = R.createFloaters({ inner: 11, outer: 24, color: 0xff7a2f }); scene.add(floaters.mesh)
const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 16), new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 2, fog: false })); moon.position.set(-30, 25, -50); scene.add(moon)
const shake = R.createShake(camera)
const time = R.createTime()
const cells = [], pts = []
const tail = new THREE.Color(0xb2362b), gold = new THREE.Color(0xe8a33a), tmp = new THREE.Color()
let nextBurst = 0.3, frames = 0
function loop(now) {
  renderer.info.reset()
  const { dt, t } = time.step(now)
  frames++
  // a snake gliding on a circle
  cells.length = 9
  for (let i = 0; i < 9; i++) { const a = t * 0.6 - i * 0.22; cells[i] = { x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2 } }
  head.position.set(cells[0].x, 0.42, cells[0].z)
  head.rotation.y = R.lerpAngle(head.rotation.y, Math.atan2(-Math.sin(t * 0.6), Math.cos(t * 0.6)) , 1)
  const bodyCells = cells.slice(1)
  body.update(bodyCells, (i) => tmp.copy(gold).lerp(tail, i / bodyCells.length).getHex(), (i) => 1 - 0.4 * i / bodyCells.length, (i) => 0.42 + 0.04 * Math.sin(4 * t + 0.6 * i))
  for (let i = 0; i < cells.length - 1; i++) pts[i] = { x: (cells[i].x + cells[i + 1].x) / 2, z: (cells[i].z + cells[i + 1].z) / 2 }
  pts.length = cells.length - 1
  joints.update(pts, (i) => tmp.copy(gold).lerp(tail, i / pts.length).getHex(), (i) => 0.85 * (1 - 0.4 * i / pts.length), () => 0.42)
  lantern.animate(t)
  if (t > nextBurst) { sparks.spawn(2.5, 0.6, 2.5); ring.spawn(2.5, 2.5); shake.start(0.15, 0.3); nextBurst = t + 1.2 }
  sparks.update(dt); ring.update(dt); floaters.update(dt, t); sky.twinkle(t)
  shake.apply(framed, dt); camera.lookAt(0, 0, 0)
  composer.render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
addEventListener('resize', () => R.onResize(renderer, composer, camera, frame))
window.demo = { frames: () => frames, info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), bursts: () => sparks.active() }
