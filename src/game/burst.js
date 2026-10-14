import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three'

import { getGlowTexture } from './world/textures'

/**
 * World-space particle bursts (jump puffs, landing dust, the death poof) drawn
 * as one additive Points object. Call `burst()` from anywhere; <Particles> steps
 * the simulation every frame.
 */

const MAX = 700
const queue = []
const _color = new Color()

export function burst(position, { color = '#ffffff', count = 14, speed = 8, up = 4, life = 0.7, gravity = 10 } = {}) {
  queue.push({ x: position.x, y: position.y, z: position.z, color, count, speed, up, life, gravity })
}

export function createParticleSystem() {
  const positions = new Float32Array(MAX * 3).fill(-9999)
  const colors = new Float32Array(MAX * 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  const material = new PointsMaterial({
    map: getGlowTexture(),
    size: 1.2,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  const particles = Array.from({ length: MAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, r: 1, gg: 1, b: 1 }))
  return { points, positions, colors, particles, cursor: 0 }
}

export function stepParticles(system, delta) {
  const dt = Math.min(delta, 0.05)
  const { particles, positions, colors } = system
  while (queue.length) {
    const e = queue.shift()
    _color.set(e.color)
    for (let i = 0; i < e.count; i += 1) {
      const p = particles[system.cursor]
      system.cursor = (system.cursor + 1) % MAX
      const a = Math.random() * Math.PI * 2
      const s = e.speed * (0.4 + Math.random() * 0.6)
      p.x = e.x
      p.y = e.y
      p.z = e.z
      p.vx = Math.cos(a) * s
      p.vz = Math.sin(a) * s
      p.vy = e.up * (0.5 + Math.random())
      p.g = e.gravity
      p.max = e.life * (0.7 + Math.random() * 0.6)
      p.life = p.max
      p.r = _color.r
      p.gg = _color.g
      p.b = _color.b
    }
  }
  for (let i = 0; i < MAX; i += 1) {
    const p = particles[i]
    const o = i * 3
    if (p.life <= 0) {
      positions[o + 1] = -9999
      continue
    }
    p.life -= dt
    p.vy -= p.g * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.z += p.vz * dt
    positions[o] = p.x
    positions[o + 1] = p.y
    positions[o + 2] = p.z
    const fade = Math.max(0, p.life / p.max)
    colors[o] = p.r * fade
    colors[o + 1] = p.gg * fade
    colors[o + 2] = p.b * fade
  }
  system.points.geometry.attributes.position.needsUpdate = true
  system.points.geometry.attributes.color.needsUpdate = true
}
