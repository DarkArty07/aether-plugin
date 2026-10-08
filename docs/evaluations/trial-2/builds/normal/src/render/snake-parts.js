// The meshes and materials of the snake view, built once: the jelly body (two InstancedMeshes that share one
// look: a sphere per segment and a cylinder in each joint, so it reads as one smooth creature, not a string
// of beads), the lamp-like head and the amber lure. snake-view.js moves them; nothing here runs per frame.
import * as THREE from 'three'
import { makeTexture } from './effects.js'

// The uniforms every glowing material shares; the view mutates them in place.
export function createGlow(colors) {
  return { uTime: { value: 0 }, uLife: { value: 1 }, uFlash: { value: 0 }, uDanger: { value: new THREE.Color(colors.danger) } }
}

// Makes a standard material glow like living tissue: its emissive follows the (instance) color, brightens at
// the rim, and obeys the shared uniforms: uLife (1 alive, 0 drained), uFlash (the danger flash) and, for the
// body, a pulse that runs down it. `albedo` darkens the lit surface so the hue stays rich under the bright key
// light, while the glow keeps the full color. `part` is 'segment' or 'link' for the instanced body, and null for
// anything else. A link blends from its own instance color and radius to those in the aEnd attribute along its
// length, so the gradient has no steps and the tube meets each sphere exactly.
function glowing(material, uniforms, { albedo, part = null }) {
  const phase = part === 'link' ? 'position.z + 0.5' : '1.0'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying float vPulse;${part === 'link' ? '\nattribute vec4 aEnd;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPulse = ${part ? `0.5 + 0.5 * sin(uTime * 3.2 - (float(gl_InstanceID) + ${phase}) * 0.84)` : '1.0'};`)
    if (part === 'link') {
      // From the near node's color and radius at one end to the far node's at the other.
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, aEnd.rgb, position.z + 0.5);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xy *= mix(1.0, aEnd.w, position.z + 0.5);')
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uLife;\nuniform float uFlash;\nuniform vec3 uDanger;\nvarying float vPulse;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float grey = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(vec3(grey * 0.5), diffuseColor.rgb, 0.35 + 0.65 * uLife);
        diffuseColor.rgb = mix(diffuseColor.rgb, uDanger, uFlash * 0.8);
        vec3 tint = diffuseColor.rgb;
        diffuseColor.rgb *= ${albedo.toFixed(2)};`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance *= tint * (1.0 + 0.9 * rim) * (0.1 + 0.9 * uLife) * (0.8 + 0.4 * vPulse) * (1.0 + 0.6 * uFlash);`,
      )
  }
  material.customProgramCacheKey = () => `snake-glow-${part}`
  return material
}

function jelly(color, emissiveIntensity, uniforms, options) {
  return glowing(
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, specularIntensity: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.25, emissive: 0xffffff, emissiveIntensity }),
    uniforms,
    options,
  )
}

function instancedPart(geometry, material, capacity, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.name = name
  mesh.count = 0
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage)
  mesh.castShadow = true
  mesh.frustumCulled = false // the instances move every frame; a stale bounding sphere would cull the snake
  return mesh
}

// Instance i of both is the segment behind node i + 1: `segments` its sphere, `links` the tube from the node
// before it to that node. They share the look, so the two meet seamlessly.
export function buildBody(capacity, uniforms) {
  const segments = instancedPart(new THREE.SphereGeometry(1, 20, 14), jelly(0xffffff, 0.8, uniforms, { albedo: 0.22, part: 'segment' }), capacity, 'snake-body')
  const tube = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).rotateX(Math.PI / 2) // along z, one unit long
  const end = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage)
  tube.setAttribute('aEnd', end)
  const links = instancedPart(tube, jelly(0xffffff, 0.8, uniforms, { albedo: 0.22, part: 'link' }), capacity, 'snake-links')
  return { segments, links, end }
}

// A rounded lamp of a head facing +Z: a pair of glossy eyes high on the front (so the camera sees them) and a
// small cyan lure on a curved stalk.
export function buildHead(colors, uniforms) {
  const head = new THREE.Group()
  head.name = 'snake-head'
  const ball = new THREE.SphereGeometry(1, 32, 22)

  const skull = new THREE.Mesh(ball, jelly(new THREE.Color(colors.snakeHead).lerp(new THREE.Color(colors.snakeBody), 0.12), 0.3, uniforms, { albedo: 0.16 }))
  skull.scale.set(0.5, 0.44, 0.56)
  skull.castShadow = true

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x03101a, roughness: 0.1, metalness: 0.2 })
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  glintMaterial.color.multiplyScalar(2.4) // just enough to bloom into a star
  const eyes = new THREE.Group()
  for (const side of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(side * 0.2, 0.26, 0.3)
    const pupil = new THREE.Mesh(ball, eyeMaterial)
    pupil.scale.setScalar(0.14)
    const glint = new THREE.Mesh(ball, glintMaterial)
    glint.scale.setScalar(0.04)
    glint.position.set(-side * 0.035, 0.07, 0.085)
    eye.add(pupil, glint)
    eyes.add(eye)
  }

  // The lure: a thin stalk that rises behind the eyes and curves forward over them.
  const lamp = new THREE.Group()
  lamp.position.set(0, 0.38, -0.14)
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.26, -0.1), new THREE.Vector3(0, 0.44, 0.02), new THREE.Vector3(0, 0.42, 0.2)])
  const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.016, 6, false), new THREE.MeshStandardMaterial({ color: colors.snakeHead, roughness: 0.5 }))
  stalk.castShadow = true
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: colors.accent }))
  const beadColor = new THREE.Color(colors.accent).multiplyScalar(2.6)
  bead.material.color.copy(beadColor)
  bead.position.copy(curve.getPoint(1))
  lamp.add(stalk, bead)

  head.add(skull, eyes, lamp)
  return { head, eyes, lamp, bead, beadColor }
}

// The lure: an amber orb that bobs and pulses, a tilted ring that spins around it, three motes in orbit,
// a pool of light on the board beneath, and a warm light, the only one in the scene.
export function buildFood(colors) {
  const food = new THREE.Group()
  food.name = 'food'
  const orbMaterial = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colors.food).multiplyScalar(0.3), emissive: colors.food, emissiveIntensity: 2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 })
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 22), orbMaterial)
  orb.castShadow = true

  const hot = new THREE.MeshBasicMaterial({ color: colors.food })
  hot.color.multiplyScalar(1.9)
  const spin = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.018, 8, 64), hot)
  spin.add(ring)

  const moteMaterial = new THREE.MeshBasicMaterial({ color: colors.particle })
  moteMaterial.color.multiplyScalar(2)
  const moteGeometry = new THREE.SphereGeometry(0.04, 10, 8)
  const motes = [0, 1, 2].map(() => {
    const mote = new THREE.Mesh(moteGeometry, moteMaterial)
    food.add(mote)
    return mote
  })
  food.add(orb, spin)

  const haloMaterial = new THREE.MeshBasicMaterial({ color: colors.food, map: makeTexture('halo'), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), haloMaterial)
  halo.name = 'food-halo'
  halo.position.y = 0.014
  halo.renderOrder = 2

  const light = new THREE.PointLight(colors.food, 0, 6.5, 2)
  light.name = 'food-light'
  return { food, orbMaterial, spin, ring, motes, halo, light }
}
