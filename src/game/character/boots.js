import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'

import { emit } from '../burst'
import { mergeColored } from '../world/geometry'
import { BOOT_BY_ID } from '../../shared/gameData.js'

/**
 * Procedural boots, in the avatar rig's units (the rig is 6.4 tall, a leg
 * about 1.4 wide): sole at y = 0, toe towards +Z, about 1.6 tall so they cover
 * the foot and lower shin like real boots.
 *
 * Every tier shares one smooth shape — a side profile extruded across the
 * foot with rounded edges: a chunky sole, the upper, a toe cap, a padded
 * collar, laces and a heel tab — in its own colours, glossy, so they read as
 * one family. The first two are low (Fluffy Slippers, Sneakers); the rest add
 * their trademark on top and escalate: springs, thrusters, glowing cracks,
 * ice crystals, lightning, stars, rainbow bands, diamond facets and the
 * Hydra's serpent heads. `updateBoot` animates them and emits their particles
 * (pooled, see burst.js) from wherever the foot is.
 *
 * Geometry is shared by every boot; materials are shared per tier.
 */

const RAINBOW = ['#ff3b3b', '#ffb03b', '#fff03b', '#3bff6e', '#3bb5ff', '#a03bff']

/** Half the width of the upper (across the foot), and how far its rounded edges bulge. */
const HALF_WIDTH = 0.8
const BEVEL = 0.1

/**
 * A side profile (points [z, y], drawn as a smooth closed curve through them)
 * extruded `width` wide across X, centred, with rounded edges.
 */
function profileSolid(points, width, bevel = BEVEL) {
  const shape = new Shape()
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const n = points.length
  // A smooth loop: quadratic curves through the midpoints, the points as controls.
  const start = mid(points[n - 1], points[0])
  shape.moveTo(start[0], start[1])
  for (let i = 0; i < n; i += 1) {
    const ctrl = points[i]
    const end = mid(points[i], points[(i + 1) % n])
    shape.quadraticCurveTo(ctrl[0], ctrl[1], end[0], end[1])
  }
  const geometry = new ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10 })
  // Shape X is along the boot (Z), the extrusion goes across it (X).
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(width / 2 - bevel, 0, 0)
  return geometry
}

const TALL_UPPER = [
  [-0.9, 0.24],
  [-1.0, 0.7],
  [-0.94, 1.52],
  [0.56, 1.52],
  [0.62, 1.0],
  [1.1, 0.8],
  [1.42, 0.62],
  [1.48, 0.3],
  [1.3, 0.22],
]
const LOW_UPPER = [
  [-0.9, 0.24],
  [-1.0, 0.62],
  [-0.9, 0.98],
  [0.3, 0.98],
  [0.62, 0.86],
  [1.1, 0.74],
  [1.42, 0.58],
  [1.48, 0.3],
  [1.3, 0.22],
]

const GEO = {
  // The sole: thick, a little wider and longer than the upper, rounded at both ends.
  sole: profileSolid(
    [
      [-0.98, 0.0],
      [-1.08, 0.14],
      [-0.98, 0.3],
      [1.4, 0.3],
      [1.6, 0.16],
      [1.42, 0.0],
    ],
    HALF_WIDTH * 2 + 0.2,
    0.08,
  ),
  tread: new BoxGeometry(HALF_WIDTH * 2 + 0.24, 0.07, 0.24),
  upper: profileSolid(TALL_UPPER, HALF_WIDTH * 2),
  lowUpper: profileSolid(LOW_UPPER, HALF_WIDTH * 2),
  // The toe cap: over the front of the upper, a hair bigger all round.
  toe: profileSolid(
    [
      [0.98, 0.26],
      [1.0, 0.78],
      [1.44, 0.66],
      [1.56, 0.3],
      [1.36, 0.2],
    ],
    HALF_WIDTH * 2 + 0.08,
    0.12,
  ),
  collar: new TorusGeometry(0.78, 0.15, 10, 28),
  lowCollar: new TorusGeometry(0.66, 0.13, 10, 24),
  lace: new CapsuleGeometry(0.06, 0.78, 3, 8),
  heelTab: new BoxGeometry(0.42, 0.42, 0.12),
  stripe: new BoxGeometry(HALF_WIDTH * 2 + 0.26, 0.14, 1.62),
  side: new BoxGeometry(0.06, 0.16, 1.1),
  coil: new TorusGeometry(0.26, 0.07, 6, 14),
  wrap: new TorusGeometry(1.0, 0.08, 6, 20),
  thruster: new CylinderGeometry(0.22, 0.28, 0.7, 12),
  fin: new BoxGeometry(0.08, 0.5, 0.5),
  flame: new ConeGeometry(0.34, 1.1, 8),
  crack: new BoxGeometry(0.06, 0.06, 0.8),
  crystal: new OctahedronGeometry(0.3, 0),
  bolt: new BoxGeometry(0.14, 0.42, 0.06),
  star: new OctahedronGeometry(0.11, 0),
  orbit: new TorusGeometry(1.0, 0.035, 4, 28),
  band: new BoxGeometry(HALF_WIDTH * 2 + 0.24, 0.11, 1.66),
  facet: new OctahedronGeometry(0.26, 0),
  spike: new ConeGeometry(0.16, 0.6, 5),
  neck: new CylinderGeometry(0.1, 0.13, 0.8, 6),
  head: new BoxGeometry(0.3, 0.22, 0.42),
  eye: new SphereGeometry(0.05, 6, 4),
  fluff: new SphereGeometry(0.34, 10, 8),
  pom: new SphereGeometry(0.3, 12, 10),
  puff: new SphereGeometry(1, 20, 14),
}

const materials = new Map()
const merged = new Map()

/** The two vertex-coloured materials a compacted boot of this tier draws with (lit ones glossy). */
export function bootMaterials(id) {
  if (merged.has(id)) return merged.get(id)
  const shiny = id === 'diamond' || id === 'frost'
  const set = {
    lit: new MeshPhysicalMaterial({
      vertexColors: true,
      roughness: shiny ? 0.2 : 0.42,
      metalness: id === 'diamond' || id === 'hydra' ? 0.25 : 0.04,
      clearcoat: 0.6,
      clearcoatRoughness: 0.32,
      emissive: id === 'diamond' ? '#9feeff' : '#000000',
      emissiveIntensity: id === 'diamond' ? 0.25 : 0,
    }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }
  merged.set(id, set)
  return set
}

function mats(id) {
  if (materials.has(id)) return materials.get(id)
  const def = BOOT_BY_ID[id] ?? BOOT_BY_ID.starter
  const glow = def.glow && def.glow !== 'rainbow' ? def.glow : def.accent
  const set = {
    body: new MeshStandardMaterial({ color: def.color, roughness: 0.5 }),
    accent: new MeshStandardMaterial({ color: def.accent, roughness: 0.45 }),
    sole: new MeshStandardMaterial({ color: id === 'lava' ? '#1a0e0a' : id === 'starter' ? '#ffffff' : '#2a2c36', roughness: 0.9 }),
    tread: new MeshStandardMaterial({ color: id === 'starter' ? '#ffd6e6' : '#1a1b22', roughness: 0.9 }),
    lace: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
    metal: new MeshStandardMaterial({ color: '#d6dbe4', roughness: 0.25, metalness: 0.6 }),
    glow: new MeshBasicMaterial({ color: glow, toneMapped: false }),
    flame: new MeshBasicMaterial({ color: id === 'thunder' ? '#fff07a' : '#ffb03b', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
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

/** Two jagged lightning arcs per Thunder boot, re-rolled every few frames. */
function createArcs() {
  const positions = new Float32Array(2 * 6 * 2 * 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color: '#fff9a8', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  lines.frustumCulled = false
  return lines
}

function rollArcs(lines) {
  const p = lines.geometry.attributes.position.array
  let o = 0
  for (let arc = 0; arc < 2; arc += 1) {
    // From the sole edge up to the collar, zig-zagging round the boot.
    const side = arc ? -1 : 1
    let x = side * 0.9
    let y = 0.2
    let z = (Math.random() - 0.3) * 1.6
    for (let s = 0; s < 6; s += 1) {
      const nx = side * (0.86 + Math.random() * 0.3)
      const ny = y + 0.22 + Math.random() * 0.12
      const nz = z + (Math.random() - 0.5) * 0.7
      p[o++] = x
      p[o++] = y
      p[o++] = z
      p[o++] = nx
      p[o++] = ny
      p[o++] = nz
      x = nx
      y = ny
      z = nz
    }
  }
  lines.geometry.attributes.position.needsUpdate = true
}

/** The shared parts: sole (with tread), upper, toe cap, collar, laces and heel tab. */
function addShell(group, m, low) {
  add(group, GEO.sole, m.sole, 0, 0, 0)
  for (const z of [-0.55, 0.1, 0.75]) add(group, GEO.tread, m.tread, 0, 0.035, z)
  add(group, low ? GEO.lowUpper : GEO.upper, m.body, 0, 0, 0)
  add(group, GEO.toe, m.accent, 0, 0, 0)
  const collar = add(group, low ? GEO.lowCollar : GEO.collar, m.accent, 0, low ? 0.98 : 1.52, low ? -0.2 : -0.19, Math.PI / 2)
  collar.scale.set(low ? 1.28 : 1.12, low ? 1.1 : 1.04, 1)
  // Laces across the instep, following its slope.
  const laces = low
    ? [
        [0.42, 0.95],
        [0.72, 0.88],
      ]
    : [
        [0.64, 1.28],
        [0.7, 1.04],
        [0.98, 0.88],
      ]
  for (const [z, y] of laces) add(group, GEO.lace, m.lace, 0, y + 0.06, z + 0.04, 0, 0, Math.PI / 2)
  add(group, GEO.heelTab, m.accent, 0, low ? 0.86 : 1.38, -1.0)
}

/**
 * One boot of type `id`. `side` is +1 for the left foot, -1 for the right
 * (details on the outside of the foot mirror across).
 * Returns { id, group, flames, heads, arcs, facets, timer }.
 */
export function createBoot(id, side = 1) {
  const m = mats(id)
  const group = new Group()
  group.name = `boot:${id}`
  const boot = { id, side, group, flames: [], heads: [], arcs: null, facets: [], timer: Math.random(), emitAcc: 0 }

  if (id === 'starter') {
    // Fluffy Slippers: a soft, puffy pink slipper with a white sole, a fluffy rim and a pom-pom.
    add(group, GEO.sole, m.sole, 0, 0, 0)
    const puff = add(group, GEO.puff, m.body, 0, 0.42, 0.26)
    puff.scale.set(0.92, 0.42, 1.3)
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2
      add(group, GEO.fluff, m.accent, Math.cos(a) * 0.7, 0.74, -0.25 + Math.sin(a) * 0.62)
    }
    add(group, GEO.pom, m.accent, 0, 0.82, 1.18)
    mergeColored(group, bootMaterials(id))
    return boot
  }

  addShell(group, m, id === 'sneakers')

  switch (id) {
    case 'sneakers':
      // A swoosh down each side and a coloured tread line.
      for (const k of [-1, 1]) add(group, GEO.side, m.accent, k * 0.87, 0.55, 0.2, 0.3)
      break
    case 'bouncy':
      add(group, GEO.stripe, m.accent, 0, 0.92, -0.2)
      for (const y of [0.34, 0.54, 0.74]) add(group, GEO.coil, m.metal, 0, y, -1.06, Math.PI / 2)
      break
    case 'rocket':
      for (const x of [-0.42, 0.42]) {
        add(group, GEO.thruster, m.metal, x, 1.0, -1.08, 0.25)
        boot.flames.push(add(group, GEO.flame, m.flame, x, 0.5, -1.18, Math.PI))
      }
      add(group, GEO.fin, m.accent, side * 0.9, 1.1, -0.45)
      break
    case 'lava':
      for (const [y, z, r] of [[0.5, 0.3, 0.3], [0.9, -0.25, -0.4], [1.25, 0.1, 0.5]]) {
        add(group, GEO.crack, m.glow, 0.89, y, z, r)
        add(group, GEO.crack, m.glow, -0.89, y + 0.1, z - 0.1, -r)
      }
      break
    case 'frost':
      for (const [x, y, z, s] of [[0.92, 1.2, 0.0, 1], [0.9, 0.62, -0.45, 0.8], [-0.9, 1.0, -0.25, 0.9], [0.22, 1.72, -0.55, 1.1], [-0.3, 1.7, 0.25, 0.8]]) {
        add(group, GEO.crystal, m.glow, x, y, z, 0.2, 0.6, 0.3).scale.set(0.8 * s, 1.6 * s, 0.8 * s)
      }
      break
    case 'thunder':
      for (const sgn of [1, -1]) {
        add(group, GEO.bolt, m.glow, sgn * 0.88, 1.22, 0.0, 0, 0, 0.5)
        add(group, GEO.bolt, m.glow, sgn * 0.88, 0.92, -0.12, 0, 0, -0.5)
        add(group, GEO.bolt, m.glow, sgn * 0.88, 0.62, 0.0, 0, 0, 0.5)
      }
      boot.flames.push(add(group, GEO.flame, m.flame, 0, -0.35, -0.4, Math.PI))
      boot.arcs = createArcs()
      group.add(boot.arcs)
      rollArcs(boot.arcs)
      break
    case 'galaxy':
      for (let i = 0; i < 10; i += 1) {
        const a = i * 2.4
        add(group, GEO.star, m.glow, Math.cos(a) * 0.9, 0.5 + (i % 4) * 0.26, -0.2 + Math.sin(a) * 0.75, 0, a, 0.7)
      }
      boot.facets.push(add(group, GEO.orbit, m.glow, 0, 1.0, -0.19, Math.PI / 2 - 0.25, 0, 0.2))
      break
    case 'rainbow':
      RAINBOW.forEach((_, i) => add(group, GEO.band, m.rainbow[i], 0, 0.62 + i * 0.13, -0.2))
      boot.flames.push(add(group, GEO.flame, m.flame, 0, -0.35, -0.4, Math.PI))
      break
    case 'diamond':
      for (const [x, y, z] of [[0, 1.15, 0.72], [0.9, 1.05, -0.2], [-0.9, 0.95, 0.0], [0.9, 0.55, 0.35], [0, 1.78, -0.35]]) {
        boot.facets.push(add(group, GEO.facet, m.glow, x, y, z, 0, 0.4, 0))
      }
      boot.flames.push(add(group, GEO.flame, m.flame, 0, -0.35, -0.4, Math.PI))
      break
    case 'hydra':
      for (let i = 0; i < 5; i += 1) add(group, GEO.spike, m.glow, side * 0.4, 0.75 + i * 0.22, -0.95 - i * 0.04, -0.9, 0, side * 0.4)
      for (const k of [-1, 1]) {
        const neck = new Group()
        // Rising from the collar, outside the leg so they're never hidden.
        neck.position.set(k * 1.02, 1.35, -0.4)
        const n = add(neck, GEO.neck, m.body, 0, 0.35, 0)
        n.rotation.z = -k * 0.35
        const head = add(neck, GEO.head, m.body, k * 0.1, 0.78, 0.12)
        add(head, GEO.eye, m.glow, 0.09, 0.05, 0.18)
        add(head, GEO.eye, m.glow, -0.09, 0.05, 0.18)
        group.add(neck)
        boot.heads.push(neck)
      }
      boot.flames.push(add(group, GEO.flame, m.flame, 0, -0.35, -0.4, Math.PI))
      break
    default:
  }

  // Bake it down to two draw calls; animated parts stay separate.
  const keep = new Set([...boot.flames, ...boot.heads, boot.arcs, id === 'galaxy' ? boot.facets[0] : null])
  mergeColored(group, bootMaterials(id), { keep: (node) => keep.has(node) })
  for (const neck of boot.heads) mergeColored(neck, bootMaterials(id))
  return boot
}

const _p = new Vector3()
const _c = new Color()

/**
 * Animates a boot and emits its particles.
 * ctx = { time, dt, power (0..1: running, jumping), moving, air, fx (0..1
 * emission scale: 1 for you, less for others, 0 when far away) }
 */
export function updateBoot(boot, { time = 0, dt = 0.016, power = 0, moving = false, air = false, fx = 1 }) {
  // Flames: thrusters flare on jumps and while running fast.
  for (let i = 0; i < boot.flames.length; i += 1) {
    const flame = boot.flames[i]
    const flicker = 0.75 + 0.25 * Math.sin(time * 31 + i * 2.1) + 0.1 * Math.sin(time * 53)
    const s = (0.25 + 1.1 * power) * flicker
    flame.scale.set(s, s * (1 + power * 1.4), s)
    flame.visible = power > 0.05
  }
  for (const [i, neck] of boot.heads.entries()) {
    neck.rotation.x = Math.sin(time * 2.4 + i * 1.7) * 0.25 - 0.1
    neck.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(time * 1.7 + i) * 0.15)
  }
  if (boot.id === 'galaxy') boot.facets[0].rotation.z = time * 1.4
  if (boot.id === 'diamond') {
    const shine = 0.5 + 0.5 * Math.sin(time * 3 + boot.timer * 9)
    bootMaterials('diamond').lit.emissiveIntensity = 0.15 + shine * 0.35
  }
  if (boot.arcs) {
    boot.timer += dt
    if (boot.timer > 0.07) {
      boot.timer = 0
      rollArcs(boot.arcs)
      boot.arcs.visible = Math.random() < 0.75
    }
  }

  if (fx <= 0) return
  const rate = EMIT_RATE[boot.id]
  if (!rate) return
  boot.emitAcc += dt * rate * fx * (moving || air ? 1.6 : 1)
  if (boot.emitAcc < 1) return
  boot.group.getWorldPosition(_p)
  const scale = boot.group.parent ? boot.group.getWorldScale(_s).y : 1
  while (boot.emitAcc >= 1) {
    boot.emitAcc -= 1
    emitFor(boot, _p, scale, time, moving, air)
  }
}

const _s = new Vector3()

/** Particles per second (before the moving / far-away scaling). */
const EMIT_RATE = {
  rocket: 6,
  lava: 9,
  frost: 10,
  thunder: 6,
  galaxy: 10,
  rainbow: 18,
  diamond: 10,
  hydra: 16,
}

const r = (k) => (Math.random() - 0.5) * k

function emitFor(boot, p, scale, time, moving, air) {
  const s = scale * 6.4 // boot units -> studs (the rig is 6.4 tall)
  const x = p.x + r(1.2 * s * 0.2)
  const y = p.y + Math.random() * 1.5 * s * 0.15
  const z = p.z + r(1.2 * s * 0.2)
  switch (boot.id) {
    case 'rocket':
      if (air || moving) emit({ x, y: p.y, z, vx: r(2), vy: -3 - Math.random() * 3, vz: r(2), color: Math.random() < 0.5 ? '#ffd23a' : '#ff6a00', size: 0.7, sizeEnd: 0.1, life: 0.35, drag: 2 })
      break
    case 'lava':
      // Glowing drips that fall, and the odd ember that rises.
      if (Math.random() < 0.7) emit({ x, y, z, vx: r(0.6), vy: -1, vz: r(0.6), color: '#ff7a1a', size: 0.42, sizeEnd: 0.18, life: 0.7, gravity: 22 })
      else emit({ x, y: y + 0.4, z, vx: r(1), vy: 2.5, vz: r(1), color: '#ffcf4a', size: 0.32, sizeEnd: 0.05, life: 0.9, gravity: -1 })
      break
    case 'frost':
      if (Math.random() < 0.65) emit({ x, y: p.y + 0.2, z, vx: r(1.4), vy: -0.2, vz: r(1.4), color: '#eaf8ff', alpha: 0.42, size: 1.1, sizeEnd: 2.4, life: 1.2, drag: 1.2, blend: 'normal' })
      else emit({ x, y, z, vx: r(1), vy: 1, vz: r(1), color: '#bff2ff', size: 0.3, sizeEnd: 0.05, life: 0.8, gravity: 2 })
      break
    case 'thunder':
      emit({ x, y, z, vx: r(6), vy: 2 + Math.random() * 3, vz: r(6), color: Math.random() < 0.5 ? '#fff07a' : '#ffffff', size: 0.28, sizeEnd: 0.05, life: 0.3, drag: 3 })
      break
    case 'galaxy': {
      const a = time * 3 + Math.random() * 6
      emit({ x: p.x + Math.cos(a) * 0.7, y: y + 0.3, z: p.z + Math.sin(a) * 0.7, vx: r(0.6), vy: 0.8 + Math.random(), vz: r(0.6), color: ['#ffffff', '#ff9df5', '#b98bff', '#9fe8ff'][Math.floor(Math.random() * 4)], size: 0.35, sizeEnd: 0.05, life: 1.1, drag: 0.5 })
      break
    }
    case 'rainbow':
      if (!moving && !air) break
      _c.setHSL((time * 0.6 + Math.random() * 0.1) % 1, 0.95, 0.6)
      emit({ x, y: p.y + 0.2, z, vx: r(0.5), vy: 0.4, vz: r(0.5), color: `#${_c.getHexString()}`, size: 0.7, sizeEnd: 0.15, life: 0.8, drag: 1 })
      break
    case 'diamond':
      emit({ x: x + r(0.6), y: y + Math.random() * 0.6, z: z + r(0.6), vx: 0, vy: 0.3, vz: 0, color: '#ffffff', size: 0.45, sizeEnd: 0, life: 0.45 })
      break
    case 'hydra':
      // A dark aura curling up round the feet, shot through with teal.
      if (Math.random() < 0.7) emit({ x: x + r(1.6), y: p.y + 0.2, z: z + r(1.6), vx: r(0.6), vy: 1.2 + Math.random(), vz: r(0.6), color: Math.random() < 0.5 ? '#14062a' : '#062a2a', alpha: 0.55, size: 1.1, sizeEnd: 1.8, life: 1.1, drag: 1, blend: 'normal' })
      else emit({ x: x + r(1.2), y: y + 0.3, z: z + r(1.2), vx: r(0.8), vy: 1.6, vz: r(0.8), color: '#2fffd0', size: 0.32, sizeEnd: 0.05, life: 0.8 })
      break
    default:
  }
}

/** Whether a boot type shows on the feet (plain Starter Boots leave your own shoes). */
export const bootVisible = (id) => Boolean(id)
