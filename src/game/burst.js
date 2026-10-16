import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three'

import { getGlowTexture } from './world/textures'

/**
 * Pooled world-space particles: jump puffs, landing dust, boot effects,
 * embers, candy sparkles, fireworks.
 *
 * Two fixed pools, each one Points draw call: `add` (additive: glows, sparks,
 * stars, flames) and `normal` (alpha: mist, dust, smoke, dark auras). Each
 * particle has its own size, colour and alpha (a tiny shader), gravity and
 * drag. Spawning writes straight into the pool (a ring buffer, oldest
 * overwritten), so emitting from anywhere never allocates.
 *
 * <Particles> renders both pools and steps them once per frame.
 */

const POOLS = { add: 1600, normal: 700 }

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  varying vec4 vColor;
  void main() {
    float a = vColor.a * texture2D(uMap, gl_PointCoord).a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`

function createPool(count, blending) {
  const positions = new Float32Array(count * 3).fill(-1e5)
  const colors = new Float32Array(count * 4)
  const sizes = new Float32Array(count)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new BufferAttribute(colors, 4))
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
  const material = new ShaderMaterial({
    uniforms: { uMap: { value: getGlowTexture() }, uScale: { value: 600 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 4
  return {
    points,
    positions,
    colors,
    sizes,
    count,
    cursor: 0,
    live: 0,
    // Per-particle simulation state.
    vel: new Float32Array(count * 3),
    life: new Float32Array(count),
    max: new Float32Array(count),
    grav: new Float32Array(count),
    drag: new Float32Array(count),
    size0: new Float32Array(count),
    size1: new Float32Array(count),
    alpha: new Float32Array(count),
    rgb: new Float32Array(count * 3),
  }
}

let pools = null
function getPools() {
  if (!pools) pools = { add: createPool(POOLS.add, AdditiveBlending), normal: createPool(POOLS.normal, NormalBlending) }
  return pools
}

const _c = new Color()

/**
 * One particle. All fields optional except the position.
 * { x, y, z, vx, vy, vz, color, alpha, size, sizeEnd, life, gravity, drag, blend }
 */
export function emit(p) {
  const pool = getPools()[p.blend === 'normal' ? 'normal' : 'add']
  const i = pool.cursor
  pool.cursor = (pool.cursor + 1) % pool.count
  const o = i * 3
  pool.positions[o] = p.x
  pool.positions[o + 1] = p.y
  pool.positions[o + 2] = p.z
  pool.vel[o] = p.vx ?? 0
  pool.vel[o + 1] = p.vy ?? 0
  pool.vel[o + 2] = p.vz ?? 0
  const life = p.life ?? 0.7
  pool.life[i] = life
  pool.max[i] = life
  pool.grav[i] = p.gravity ?? 0
  pool.drag[i] = p.drag ?? 0
  pool.size0[i] = p.size ?? 1
  pool.size1[i] = p.sizeEnd ?? (p.size ?? 1) * 0.4
  pool.alpha[i] = p.alpha ?? 1
  _c.set(p.color ?? '#ffffff')
  pool.rgb[o] = _c.r
  pool.rgb[o + 1] = _c.g
  pool.rgb[o + 2] = _c.b
}

/**
 * A puff of `count` particles flying out from `position`.
 * { color (or colors[]), count, speed, up, life, gravity, size, blend, spread }
 */
export function burst(position, { color = '#ffffff', colors, count = 14, speed = 8, up = 4, life = 0.7, gravity = 10, size = 1.2, blend = 'add', spread = 0, drag = 0.6 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2
    const s = speed * (0.4 + Math.random() * 0.6)
    emit({
      x: position.x + (Math.random() - 0.5) * spread,
      y: position.y + (Math.random() - 0.5) * spread * 0.5,
      z: position.z + (Math.random() - 0.5) * spread,
      vx: Math.cos(a) * s,
      vz: Math.sin(a) * s,
      vy: up * (0.5 + Math.random()),
      color: colors ? colors[i % colors.length] : color,
      life: life * (0.7 + Math.random() * 0.6),
      gravity,
      drag,
      size: size * (0.7 + Math.random() * 0.6),
      blend,
    })
  }
}

function stepPool(pool, dt) {
  const { positions, colors, sizes, vel, life, max, grav, drag, size0, size1, alpha, rgb } = pool
  for (let i = 0; i < pool.count; i += 1) {
    const o = i * 3
    if (life[i] <= 0) {
      if (sizes[i] !== 0) {
        sizes[i] = 0
        positions[o + 1] = -1e5
      }
      continue
    }
    life[i] -= dt
    const damp = Math.max(0, 1 - drag[i] * dt)
    vel[o] *= damp
    vel[o + 2] *= damp
    vel[o + 1] = vel[o + 1] * damp - grav[i] * dt
    positions[o] += vel[o] * dt
    positions[o + 1] += vel[o + 1] * dt
    positions[o + 2] += vel[o + 2] * dt
    const k = Math.max(0, life[i] / max[i])
    sizes[i] = size1[i] + (size0[i] - size1[i]) * k
    const c = i * 4
    // Fade in for the first 10% of life, out over the rest.
    const fade = Math.min(1, (1 - k) * 10) * k
    colors[c] = rgb[o]
    colors[c + 1] = rgb[o + 1]
    colors[c + 2] = rgb[o + 2]
    colors[c + 3] = alpha[i] * Math.min(1, fade * 1.6)
  }
  const attrs = pool.points.geometry.attributes
  attrs.position.needsUpdate = true
  attrs.aColor.needsUpdate = true
  attrs.aSize.needsUpdate = true
}

/** Both pools' Points objects (added to the scene by <Particles>). */
export function particleObjects() {
  const p = getPools()
  return [p.add.points, p.normal.points]
}

/** Steps every particle; `scale` is pixels per world unit at distance 1. */
export function stepParticles(delta, scale) {
  const dt = Math.min(delta, 0.05)
  const p = getPools()
  for (const pool of [p.add, p.normal]) {
    pool.points.material.uniforms.uScale.value = scale
    stepPool(pool, dt)
  }
}
