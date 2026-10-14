import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'

/**
 * Expanding rings (a shockwave under the feet on every air jump, trampoline
 * bounces, big landings and spawns). A small pool of meshes is reused; idle
 * ones are hidden, so they cost nothing.
 */

const POOL = 12
const queue = []

/** A ring on the ground at { x, y, z }, growing to `radius` studs over `life` seconds. */
export function ringBurst(position, { color = '#ffffff', radius = 3.2, life = 0.42, opacity = 0.9 } = {}) {
  if (queue.length < POOL) queue.push({ x: position.x, y: position.y, z: position.z, color, radius, life, opacity })
}

const geometry = new RingGeometry(0.82, 1, 40, 1)
geometry.rotateX(-Math.PI / 2)

export function createRingPool() {
  const group = new Group()
  const rings = Array.from({ length: POOL }, () => {
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false }),
    )
    mesh.visible = false
    mesh.renderOrder = 5
    group.add(mesh)
    return { mesh, age: 0, life: 1, radius: 1, opacity: 1 }
  })
  return { group, rings, cursor: 0 }
}

export function stepRings(pool, dt) {
  while (queue.length) {
    const q = queue.shift()
    const r = pool.rings[pool.cursor]
    pool.cursor = (pool.cursor + 1) % POOL
    r.age = 0
    r.life = q.life
    r.radius = q.radius
    r.opacity = q.opacity
    r.mesh.position.set(q.x, q.y + 0.08, q.z)
    r.mesh.material.color.set(q.color)
    r.mesh.visible = true
  }
  for (const r of pool.rings) {
    if (!r.mesh.visible) continue
    r.age += dt
    const k = r.age / r.life
    if (k >= 1) {
      r.mesh.visible = false
      continue
    }
    // Fast out, easing to a stop; fades as it widens.
    const e = 1 - (1 - k) ** 3
    const s = 0.3 + r.radius * e
    r.mesh.scale.set(s, 1, s)
    r.mesh.material.opacity = r.opacity * (1 - k) ** 1.5
  }
}
