import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'

import { PET_BY_ID, RARITIES } from '../shared/gameData.js'

/**
 * Pets: small chibi animals built from a few shapes (a round body that is
 * mostly head, big eyes, ears or horns by `shape`), in the pet's colour and
 * accent. Rare and better pets glow in their rarity's colour; Legendary and
 * Mythic ones also wear a spinning halo. Models face +z.
 *
 * `followPets` moves a player's equipped pets in a little arc behind them,
 * floating and bobbing, turning to where they're going.
 */

const geometries = new Map()
function geo(key, make) {
  if (!geometries.has(key)) geometries.set(key, make())
  return geometries.get(key)
}
const materials = new Map()
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`
  if (!materials.has(key)) materials.set(key, new MeshStandardMaterial({ color, roughness: 0.55, ...opts }))
  return materials.get(key)
}
const glowMats = new Map()
function glow(color, opacity) {
  const key = `${color}|${opacity}`
  if (!glowMats.has(key)) {
    glowMats.set(key, new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  }
  return glowMats.get(key)
}

const sphere = () => geo('sphere', () => new SphereGeometry(1, 18, 14))
const box = () => geo('box', () => new BoxGeometry(1, 1, 1))
const cone = () => geo('cone', () => new ConeGeometry(1, 1, 12))
const cylinder = () => geo('cyl', () => new CylinderGeometry(1, 1, 1, 12))

function part(geometry, material, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
  const m = new Mesh(geometry, material)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.rotation.set(rx, ry, rz)
  m.castShadow = true
  return m
}

/** Two big shiny eyes on the front, `y` up and `spread` apart. */
function eyes(group, y, z, spread = 0.28, size = 0.17) {
  const black = mat('#15151d', { roughness: 0.2 })
  const white = new MeshBasicMaterial({ color: '#ffffff' })
  for (const side of [-1, 1]) {
    group.add(part(sphere(), black, [side * spread, y, z], [size, size * 1.15, size * 0.6]))
    group.add(part(sphere(), white, [side * spread + 0.05, y + 0.06, z + size * 0.5], [size * 0.35, size * 0.35, size * 0.2]))
  }
  const cheek = mat('#ff8fb1', { roughness: 0.8 })
  for (const side of [-1, 1]) group.add(part(sphere(), cheek, [side * (spread + 0.2), y - 0.2, z - 0.08], [0.12, 0.07, 0.05]))
}

function body(group, def, { sx = 0.78, sy = 0.72, sz = 0.72 } = {}) {
  const fur = mat(def.color)
  group.add(part(sphere(), fur, [0, 0, 0], [sx, sy, sz]))
  // Little feet.
  for (const side of [-1, 1]) group.add(part(sphere(), fur, [side * 0.34, -0.66, 0.18], [0.2, 0.14, 0.24]))
  return fur
}

const BUILDERS = {
  bunny(group, def) {
    const fur = body(group, def)
    const inner = mat(def.accent)
    for (const side of [-1, 1]) {
      group.add(part(sphere(), fur, [side * 0.26, 0.98, -0.05], [0.15, 0.5, 0.11], [0, 0, side * -0.12]))
      group.add(part(sphere(), inner, [side * 0.26, 0.98, 0.04], [0.08, 0.38, 0.05], [0, 0, side * -0.12]))
    }
    eyes(group, 0.1, 0.62)
    group.add(part(sphere(), inner, [0, -0.08, 0.7], [0.08, 0.06, 0.05]))
    group.add(part(sphere(), fur, [0, -0.1, -0.72], [0.22, 0.22, 0.22]))
  },
  cat(group, def) {
    const fur = body(group, def)
    const accent = mat(def.accent)
    for (const side of [-1, 1]) {
      group.add(part(cone(), fur, [side * 0.42, 0.72, 0], [0.22, 0.42, 0.16], [0, 0, side * -0.35]))
      group.add(part(cone(), accent, [side * 0.42, 0.7, 0.07], [0.12, 0.28, 0.06], [0, 0, side * -0.35]))
    }
    group.add(part(sphere(), accent, [0, -0.22, 0.56], [0.3, 0.22, 0.2]))
    eyes(group, 0.1, 0.62)
    // Tail curling up behind.
    group.add(part(cylinder(), fur, [0.2, 0.05, -0.78], [0.09, 0.7, 0.09], [-0.5, 0, -0.5]))
    group.add(part(sphere(), accent, [0.38, 0.33, -0.98], [0.12, 0.12, 0.12]))
  },
  dog(group, def) {
    const fur = body(group, def)
    const accent = mat(def.accent)
    for (const side of [-1, 1]) group.add(part(sphere(), mat(def.color, { roughness: 0.8 }), [side * 0.72, 0.18, -0.02], [0.16, 0.42, 0.26], [0, 0, side * 0.3]))
    group.add(part(sphere(), accent, [0, -0.2, 0.58], [0.34, 0.26, 0.24]))
    group.add(part(sphere(), mat('#15151d'), [0, -0.08, 0.82], [0.1, 0.08, 0.07]))
    eyes(group, 0.16, 0.6)
    group.add(part(sphere(), fur, [0, 0.12, -0.78], [0.12, 0.3, 0.12], [-0.6, 0, 0]))
  },
  bear(group, def) {
    const fur = body(group, def)
    const accent = mat(def.accent)
    for (const side of [-1, 1]) {
      group.add(part(sphere(), fur, [side * 0.52, 0.62, -0.05], [0.22, 0.22, 0.14]))
      group.add(part(sphere(), accent, [side * 0.52, 0.62, 0.03], [0.12, 0.12, 0.08]))
    }
    // A panda's eye patches use the accent too.
    for (const side of [-1, 1]) group.add(part(sphere(), accent, [side * 0.28, 0.1, 0.6], [0.2, 0.24, 0.1], [0, 0, side * 0.4]))
    group.add(part(sphere(), mat(def.accent === '#1d1d26' ? '#ffffff' : def.accent), [0, -0.22, 0.6], [0.26, 0.18, 0.16]))
    group.add(part(sphere(), mat('#15151d'), [0, -0.14, 0.75], [0.08, 0.06, 0.05]))
    eyes(group, 0.12, 0.66, 0.28, 0.13)
  },
  horn(group, def) {
    body(group, def)
    const accent = mat(def.accent, { emissive: def.accent, emissiveIntensity: 0.25 })
    group.add(part(cone(), accent, [0, 0.95, 0.22], [0.12, 0.55, 0.12], [0.35, 0, 0]))
    // Mane / spikes down the back.
    for (let i = 0; i < 4; i += 1) group.add(part(cone(), accent, [0, 0.6 - i * 0.28, -0.42 - i * 0.12], [0.1, 0.24, 0.1], [-0.6 - i * 0.25, 0, 0]))
    // Tiny wings.
    for (const side of [-1, 1]) group.add(part(sphere(), mat(def.accent, { roughness: 0.4 }), [side * 0.78, 0.15, -0.25], [0.32, 0.18, 0.06], [0, side * 0.5, side * 0.35]))
    eyes(group, 0.1, 0.62)
  },
  frog(group, def) {
    body(group, def, { sx: 0.86, sy: 0.6, sz: 0.72 })
    const skin = mat(def.color)
    const accent = mat(def.accent)
    group.add(part(sphere(), accent, [0, -0.25, 0.42], [0.5, 0.3, 0.3]))
    for (const side of [-1, 1]) {
      group.add(part(sphere(), skin, [side * 0.34, 0.5, 0.25], [0.26, 0.26, 0.26]))
      group.add(part(sphere(), mat('#15151d', { roughness: 0.2 }), [side * 0.36, 0.55, 0.47], [0.13, 0.15, 0.08]))
      group.add(part(sphere(), new MeshBasicMaterial({ color: '#ffffff' }), [side * 0.36 + 0.04, 0.6, 0.53], [0.04, 0.04, 0.02]))
    }
    group.add(part(geo('smile', () => new TorusGeometry(0.22, 0.03, 6, 16, Math.PI)), mat('#15151d'), [0, 0.02, 0.66], [1, 1, 1], [0, 0, Math.PI]))
  },
  bird(group, def) {
    const feathers = body(group, def)
    const accent = mat(def.accent)
    group.add(part(cone(), accent, [0, -0.02, 0.86], [0.16, 0.36, 0.14], [Math.PI / 2, 0, 0]))
    for (const side of [-1, 1]) group.add(part(sphere(), feathers, [side * 0.76, -0.05, -0.05], [0.12, 0.36, 0.3], [0, 0, side * 0.5]))
    group.add(part(cone(), accent, [0, 0.82, 0], [0.12, 0.3, 0.12]))
    group.add(part(sphere(), accent, [0, -0.3, 0.5], [0.4, 0.3, 0.2]))
    eyes(group, 0.2, 0.6, 0.3, 0.14)
  },
  robot(group, def) {
    const metal = mat(def.color, { metalness: 0.5, roughness: 0.35 })
    const light = mat(def.accent, { emissive: def.accent, emissiveIntensity: 0.9 })
    group.add(part(box(), metal, [0, 0, 0], [1.25, 1.05, 1.05]))
    group.add(part(box(), mat('#1d2233', { roughness: 0.3 }), [0, 0.06, 0.5], [0.95, 0.6, 0.08]))
    for (const side of [-1, 1]) group.add(part(box(), light, [side * 0.22, 0.1, 0.55], [0.2, 0.12, 0.04]))
    group.add(part(box(), light, [0, -0.1, 0.55], [0.3, 0.04, 0.04]))
    group.add(part(cylinder(), metal, [0, 0.7, 0], [0.04, 0.35, 0.04]))
    group.add(part(sphere(), light, [0, 0.92, 0], [0.11, 0.11, 0.11]))
    for (const side of [-1, 1]) group.add(part(cylinder(), metal, [side * 0.7, 0, 0], [0.16, 0.12, 0.16], [0, 0, Math.PI / 2]))
    for (const side of [-1, 1]) group.add(part(box(), metal, [side * 0.3, -0.62, 0.08], [0.28, 0.2, 0.38]))
  },
  whale(group, def) {
    const skin = mat(def.color)
    const accent = mat(def.accent, { emissive: def.accent, emissiveIntensity: 0.6 })
    group.add(part(sphere(), skin, [0, 0, 0], [0.8, 0.66, 1]))
    group.add(part(sphere(), mat(def.accent, { roughness: 0.4 }), [0, -0.3, 0.2], [0.6, 0.36, 0.7]))
    group.add(part(sphere(), skin, [0, 0.12, -1.02], [0.12, 0.12, 0.4], [0.5, 0, 0]))
    for (const side of [-1, 1]) {
      group.add(part(sphere(), skin, [side * 0.28, 0.32, -1.3], [0.32, 0.06, 0.18], [0, side * 0.4, side * 0.2]))
      group.add(part(sphere(), skin, [side * 0.78, -0.25, 0.1], [0.3, 0.06, 0.16], [0, 0, side * -0.5]))
    }
    for (let i = 0; i < 5; i += 1) {
      const a = i * 1.3
      group.add(part(sphere(), accent, [Math.cos(a) * 0.5, 0.5 - (i % 2) * 0.15, -0.3 + Math.sin(a) * 0.4], [0.06, 0.06, 0.06]))
    }
    eyes(group, 0.12, 0.78, 0.36, 0.13)
  },
}

/**
 * A pet's model: { group, update(t) }. `group` is centred on the body; the
 * caller places it. Shared geometries/materials are cached, so there's nothing
 * to dispose per pet.
 */
export function buildPet(id) {
  const def = PET_BY_ID[id]
  const group = new Group()
  if (!def) return { group, update() {} }
  const model = new Group()
  ;(BUILDERS[def.shape] ?? BUILDERS.bear)(model, def)
  model.scale.setScalar(0.85)
  group.add(model)

  const rarity = RARITIES[def.rarity] ?? RARITIES[0]
  const parts = []
  if (def.rarity >= 2) {
    // A soft aura in the rarity's colour.
    const aura = new Mesh(sphere(), glow(rarity.color, def.rarity >= 4 ? 0.22 : 0.14))
    aura.scale.setScalar(1.15)
    group.add(aura)
    parts.push(aura)
    const shadowGlow = new Mesh(geo('disc', () => new CircleGeometry(1, 24)), glow(rarity.color, 0.35))
    shadowGlow.rotation.x = -Math.PI / 2
    shadowGlow.position.y = -1.05
    shadowGlow.scale.setScalar(0.75)
    group.add(shadowGlow)
  }
  let halo = null
  if (def.rarity >= 4) {
    halo = new Mesh(geo('halo', () => new TorusGeometry(0.42, 0.05, 8, 28)), glow(rarity.color, 0.9))
    halo.position.y = 1.2
    halo.rotation.x = Math.PI / 2
    group.add(halo)
  }
  return {
    group,
    rarity: def.rarity,
    update(t) {
      if (parts[0]) parts[0].scale.setScalar(1.12 + Math.sin(t * 3) * 0.05)
      if (halo) {
        halo.rotation.z = t * 2
        halo.position.y = 1.2 + Math.sin(t * 2.5) * 0.06
      }
    },
  }
}

/** How far behind (and how spread out) pets trail their owner. */
const FOLLOW_BACK = 3.6
const FOLLOW_SPREAD = 2.6
const HOVER = 1.4

/**
 * Moves `pets` (array of { model, pos (Vector3), heading }) towards their slots
 * behind a player at `position` facing `yaw`, bobbing as they float.
 */
export function followPets(pets, position, yaw, t, dt) {
  const n = pets.length
  const k = 1 - Math.exp(-dt * 6)
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  pets.forEach((pet, i) => {
    // Slots fan out in an arc behind the player: -1..1 sideways.
    const side = n === 1 ? 0.7 : (i / (n - 1)) * 2 - 1
    const back = FOLLOW_BACK + Math.abs(side) * -0.6
    const lx = side * FOLLOW_SPREAD
    const lz = -back
    const tx = position.x + lx * cos + lz * sin
    const tz = position.z - lx * sin + lz * cos
    const ty = position.y + HOVER + Math.sin(t * 3.2 + i * 1.7) * 0.25
    const prevX = pet.pos.x
    const prevZ = pet.pos.z
    if (pet.pos.distanceToSquared(position) > 40 * 40) pet.pos.set(tx, ty, tz)
    pet.pos.x += (tx - pet.pos.x) * k
    pet.pos.z += (tz - pet.pos.z) * k
    pet.pos.y += (ty - pet.pos.y) * Math.min(1, k * 1.6)
    const vx = pet.pos.x - prevX
    const vz = pet.pos.z - prevZ
    // Face where they're going, or the way the owner faces when still.
    const want = vx * vx + vz * vz > 1e-5 ? Math.atan2(vx, vz) : yaw
    pet.heading += Math.atan2(Math.sin(want - pet.heading), Math.cos(want - pet.heading)) * Math.min(1, dt * 8)
    pet.model.group.position.copy(pet.pos)
    pet.model.group.rotation.y = pet.heading
    // A little hop-squash while moving.
    const moving = Math.min(1, Math.hypot(vx, vz) / Math.max(dt, 1e-3) / 12)
    pet.model.group.rotation.z = Math.sin(t * 10 + i) * 0.12 * moving
    pet.model.update(t + i)
  })
}
