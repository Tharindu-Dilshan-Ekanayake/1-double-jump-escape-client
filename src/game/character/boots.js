import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
} from 'three'

import { BOOT_BY_ID } from '../../shared/gameData.js'

/**
 * Procedural boots, in the avatar rig's units (the rig is 6.4 tall, a leg
 * about 1.4 wide): sole at y = 0, toe towards +Z. Every pair of a type shares
 * geometry and materials; a new Group is built per foot.
 */

const RAINBOW = ['#ff3b3b', '#ffb03b', '#fff03b', '#3bff6e', '#3bb5ff', '#a03bff']

const box = (w, h, d) => new BoxGeometry(w, h, d)
const GEO = {
  sole: box(1.62, 0.32, 2.2),
  foot: box(1.5, 0.72, 1.95),
  shaft: box(1.56, 1.15, 1.56),
  cuff: box(1.72, 0.32, 1.72),
  toe: box(1.52, 0.52, 0.42),
  strip: box(1.64, 0.14, 1.64),
  side: box(0.14, 0.9, 0.9),
  flame: new ConeGeometry(0.42, 1.1, 7),
  spike: new ConeGeometry(0.2, 0.7, 5),
  gem: new OctahedronGeometry(0.32, 0),
  bolt: box(0.2, 0.9, 0.1),
  wing: box(0.12, 0.7, 1.2),
}

const materials = new Map()

function mats(id) {
  if (materials.has(id)) return materials.get(id)
  const def = BOOT_BY_ID[id] ?? BOOT_BY_ID.starter
  const glow = def.glow && def.glow !== 'rainbow' ? def.glow : null
  const set = {
    body: new MeshStandardMaterial({ color: def.color, roughness: 0.55, metalness: id === 'diamond' || id === 'hydra' ? 0.35 : 0.05 }),
    accent: new MeshStandardMaterial({
      color: def.accent,
      roughness: 0.45,
      emissive: glow ? def.accent : '#000000',
      emissiveIntensity: glow ? 0.55 : 0,
    }),
    sole: new MeshStandardMaterial({ color: '#2a2a33', roughness: 0.9 }),
    glow: new MeshBasicMaterial({ color: glow ?? def.accent, toneMapped: false }),
    rainbow: RAINBOW.map((color) => new MeshBasicMaterial({ color, toneMapped: false })),
  }
  materials.set(id, set)
  return set
}

function add(group, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = true
  group.add(mesh)
  return mesh
}

/**
 * One boot of type `id`. `side` is +1 for the left foot, -1 for the right
 * (details that sit on the outside of the foot mirror across).
 * Returns { group, flames } — flames flicker (see animateBoot).
 */
export function createBoot(id, side = 1) {
  const m = mats(id)
  const group = new Group()
  group.name = `boot:${id}`
  const flames = []

  add(group, GEO.sole, m.sole, 0, 0.16, 0.22)
  add(group, GEO.foot, m.body, 0, 0.66, 0.2)
  add(group, GEO.shaft, m.body, 0, 1.55, -0.05)
  add(group, GEO.cuff, m.accent, 0, 2.16, -0.05)
  add(group, GEO.toe, m.accent, 0, 0.6, 1.02)

  switch (id) {
    case 'bouncy':
      add(group, GEO.strip, m.accent, 0, 1.2, -0.05)
      break
    case 'spring':
      for (const y of [0.98, 1.35, 1.72]) add(group, GEO.strip, m.accent, 0, y, -0.05)
      break
    case 'rocket':
    case 'lava':
      flames.push(add(group, GEO.flame, m.glow, 0, -0.45, -0.45, Math.PI, 0, 0))
      add(group, GEO.side, m.accent, side * 0.8, 1.2, -0.05)
      break
    case 'frost':
      add(group, GEO.gem, m.glow, side * 0.85, 1.55, 0, 0, 0.4, 0)
      add(group, GEO.gem, m.glow, side * 0.85, 0.9, 0.6, 0, 0.2, 0.3)
      break
    case 'thunder':
      add(group, GEO.bolt, m.glow, side * 0.83, 1.55, 0.1, 0, Math.PI / 2, 0.5)
      add(group, GEO.bolt, m.glow, side * 0.83, 1.05, -0.15, 0, Math.PI / 2, -0.5)
      flames.push(add(group, GEO.flame, m.glow, 0, -0.4, -0.4, Math.PI, 0, 0))
      break
    case 'galaxy':
      for (const [y, z] of [[1.7, 0.3], [1.2, -0.4], [0.75, 0.7]]) add(group, GEO.gem, m.glow, side * 0.82, y, z, 0.3, 0.6, 0)
      add(group, GEO.wing, m.accent, side * 0.86, 1.65, -0.5, 0.5, 0, 0)
      break
    case 'rainbow':
      RAINBOW.forEach((_, i) => add(group, box(1.58, 0.16, 1.58), m.rainbow[i], 0, 0.95 + i * 0.19, -0.05))
      flames.push(add(group, GEO.flame, m.rainbow[4], 0, -0.4, -0.4, Math.PI, 0, 0))
      break
    case 'diamond':
      add(group, GEO.gem, m.glow, 0, 1.55, 0.82, 0, 0.3, 0)
      add(group, GEO.gem, m.glow, side * 0.84, 1.3, -0.1, 0, 0.6, 0)
      add(group, GEO.wing, m.glow, side * 0.9, 1.75, -0.55, 0.6, 0, side * 0.3)
      flames.push(add(group, GEO.flame, m.glow, 0, -0.4, -0.4, Math.PI, 0, 0))
      break
    case 'hydra':
      for (let i = 0; i < 4; i += 1) add(group, GEO.spike, m.glow, side * 0.8, 1.0 + i * 0.32, -0.45 + i * 0.25, 0, 0, -side * 1.3)
      add(group, GEO.wing, m.accent, side * 0.92, 1.8, -0.6, 0.7, 0, side * 0.4)
      flames.push(add(group, GEO.flame, m.glow, 0, -0.45, -0.4, Math.PI, 0, 0))
      break
    default:
  }
  return { group, flames }
}

/** Flickers a boot's flames; `power` 0..1 grows them (running, jumping). */
export function animateBoot(boot, time, power = 0) {
  for (let i = 0; i < boot.flames.length; i += 1) {
    const flame = boot.flames[i]
    const flicker = 0.75 + 0.25 * Math.sin(time * 31 + i * 2.1) + 0.1 * Math.sin(time * 53)
    const s = (0.35 + 0.9 * power) * flicker
    flame.scale.set(s, s * (1 + power), s)
    flame.visible = power > 0.05
  }
}

/** Whether a boot type shows on the feet (plain Starter Boots leave your own shoes). */
export const bootVisible = (id) => Boolean(id) && id !== 'starter'
