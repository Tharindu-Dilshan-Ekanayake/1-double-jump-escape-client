import { CORRIDOR_HALF as C, LOBBY_HALF_X, SEA_Y, WALL_THICK, mulberry32 } from '../../shared/layout.js'

/**
 * Scenery. None of it collides — walls and invisible barriers keep players on
 * the course — so it is free to be cute and busy. Flat-coloured props are
 * merged per zone through `Props` (one draw call per zone and material).
 */

const PASTELS = ['#ff8fc7', '#ffd23a', '#8fd8ff', '#b98bff', '#7dffb0', '#ff9a6b']

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

function roundTree(p, x, y, z, s = 1, leaf = '#5fd14a') {
  p.cylinder('#8a5a34', [x, y + 2 * s, z], 0.55 * s, 0.7 * s, 4 * s, { segments: 8 })
  p.sphere(leaf, [x, y + 5.6 * s, z], 2.8 * s, { segments: 10, rings: 8 })
  p.sphere(leaf, [x + 1.4 * s, y + 4.8 * s, z + 0.6 * s], 1.8 * s, { segments: 9, rings: 7 })
  p.sphere(leaf, [x - 1.3 * s, y + 5 * s, z - 0.5 * s], 1.9 * s, { segments: 9, rings: 7 })
}

function cottonTree(p, x, y, z, s = 1, leaf = '#ffb7da') {
  p.cylinder('#f4f4f4', [x, y + 2.2 * s, z], 0.45 * s, 0.6 * s, 4.4 * s, { segments: 8 })
  p.sphere(leaf, [x, y + 5.8 * s, z], 2.6 * s, { segments: 10, rings: 8 })
  p.sphere(leaf, [x + 1.2 * s, y + 6.6 * s, z + 0.4 * s], 1.7 * s, { segments: 9, rings: 7 })
}

/** A fluffy cloud, unlit so it stays white from below. */
function cloud(p, x, y, z, s = 1) {
  p.sphere('#f4f8fc', [x, y, z], 3 * s, { scale: [1.5, 0.8, 1], segments: 10, rings: 7, glow: true })
  p.sphere('#eef3f9', [x - 3 * s, y - 0.4 * s, z], 2.2 * s, { scale: [1.3, 0.8, 1], segments: 9, rings: 6, glow: true })
  p.sphere('#eef3f9', [x + 3.2 * s, y - 0.3 * s, z], 2.4 * s, { scale: [1.3, 0.8, 1], segments: 9, rings: 6, glow: true })
}

function fence(p, x0, x1, z, y = 0, color = '#ffffff') {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 2.4))
  for (let i = 0; i <= n; i += 1) {
    const x = x0 + ((x1 - x0) * i) / n
    p.box(color, [x, y + 1.1, z], [0.4, 2.2, 0.4])
  }
  p.box(color, [(x0 + x1) / 2, y + 1.5, z], [Math.abs(x1 - x0), 0.3, 0.25])
  p.box(color, [(x0 + x1) / 2, y + 0.8, z], [Math.abs(x1 - x0), 0.3, 0.25])
}

function hill(p, x, y, z, s, color = '#7fdc5a') {
  p.sphere(color, [x, y, z], 10 * s, { scale: [1.6, 0.6, 1.2], segments: 12, rings: 8 })
}

function rock(p, x, y, z, s = 1, color = '#8a8f9a') {
  p.rock(color, [x, y + s * 0.7, z], s, { rot: [0.3, s, 0.2], scale: [1.2, 0.8, 1] })
}

function crystal(p, x, y, z, s, color, glow = true) {
  p.crystal(color, [x, y + 2 * s, z], 1.4 * s, { scale: [0.7, 2, 0.7], rot: [0, s, 0.15], glow })
}

function torch(p, x, y, z, flame = '#ff8a1a') {
  p.box('#5a3a22', [x, y + 1, z], [0.5, 2, 0.5])
  p.cone(flame, [x, y + 2.6, z], 0.45, 1.2, { glow: true, segments: 6 })
}

function mushroom(p, x, y, z, s = 1, cap = '#ff4d6d') {
  p.cylinder('#fff3dc', [x, y + 1.2 * s, z], 0.5 * s, 0.6 * s, 2.4 * s, { segments: 8 })
  p.sphere(cap, [x, y + 2.6 * s, z], 1.6 * s, { scale: [1, 0.6, 1], segments: 10, rings: 6 })
}

function lollipop(p, x, y, z, s = 1, color = '#ff5fa8') {
  p.cylinder('#ffffff', [x, y + 3 * s, z], 0.25 * s, 0.25 * s, 6 * s, { segments: 6 })
  p.cylinder(color, [x, y + 7 * s, z], 2.2 * s, 2.2 * s, 0.5 * s, { rot: [Math.PI / 2, 0, 0], segments: 18 })
  p.cylinder('#ffffff', [x, y + 7 * s, z + 0.05], 1.4 * s, 1.4 * s, 0.52 * s, { rot: [Math.PI / 2, 0, 0], segments: 16 })
}

function snowPine(p, x, y, z, s = 1) {
  p.box('#6b4223', [x, y + 1.2 * s, z], [0.8 * s, 2.4 * s, 0.8 * s])
  ;[
    [5, 2.6],
    [3.8, 4.4],
    [2.5, 6.1],
  ].forEach(([w, h], i) => p.cone(i % 2 ? '#ffffff' : '#2f8f4a', [x, y + h * s, z], (w / 2) * s, 2.6 * s, { segments: 8 }))
}

function neonPillar(p, x, y, z, s, color) {
  p.box('#1d1638', [x, y + 4 * s, z], [1.4 * s, 8 * s, 1.4 * s])
  p.box(color, [x, y + 4 * s, z], [1.5 * s, 0.3 * s, 1.5 * s], { glow: true })
  p.box(color, [x, y + 7 * s, z], [1.5 * s, 0.3 * s, 1.5 * s], { glow: true })
}

function gravestone(p, x, y, z, s = 1) {
  p.box('#8a8699', [x, y + 1.2 * s, z], [1.8 * s, 2.4 * s, 0.5 * s])
  p.cylinder('#8a8699', [x, y + 2.4 * s, z], 0.9 * s, 0.9 * s, 0.5 * s, { rot: [Math.PI / 2, 0, 0], segments: 10 })
}

function gear(p, x, y, z, s = 1) {
  p.torus('#9aa3b2', [x, y + 2 * s, z], 1.6 * s, 0.45 * s, { rot: [0, Math.PI / 2, 0], tubularSegments: 14 })
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    p.box('#9aa3b2', [x, y + 2 * s + Math.sin(a) * 2 * s, z + Math.cos(a) * 2 * s], [0.5 * s, 0.6 * s, 0.6 * s], { rot: [a, 0, 0] })
  }
}

function planet(p, x, y, z, s, color, rng) {
  p.sphere(color, [x, y, z], 6 * s, { segments: 14, rings: 10 })
  if (rng() < 0.6) p.torus('#ffe9b0', [x, y, z], 9 * s, 0.5 * s, { rot: [1.2, 0.3, 0], tubularSegments: 28 })
}

/* ---------------------------------------------------------------------------
 * Lobby: a sunny park. Flower beds along the hedges, strings of pennants,
 * banners on the gate wall, trees in the corners, and the gardens, hills and
 * clouds beyond the hedges. (No lamp posts: they cluttered the open paths.)
 * ------------------------------------------------------------------------- */

const FLOWERS = ['#ff5f8f', '#ffd23a', '#ffffff', '#b98bff', '#ff9a3b', '#5fb8ff']

/** A long wooden planter full of flowers along x (or z when `alongZ`). */
function flowerBed(p, x, z, length, alongZ, rng) {
  const [w, d] = alongZ ? [2.4, length] : [length, 2.4]
  p.box('#9a6a3e', [x, 0.5, z], [w, 1, d])
  p.box('#5a3a22', [x, 1.02, z], [w - 0.5, 0.06, d - 0.5])
  const count = Math.round(length / 1.3)
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count - 0.5
    const fx = alongZ ? x + (rng() - 0.5) * 1.2 : x + t * (length - 1)
    const fz = alongZ ? z + t * (length - 1) : z + (rng() - 0.5) * 1.2
    p.cylinder('#3fa84a', [fx, 1.4, fz], 0.08, 0.08, 0.8, { segments: 4 })
    p.sphere(FLOWERS[Math.floor(rng() * FLOWERS.length)], [fx, 1.9, fz], 0.38 + rng() * 0.16, { segments: 7, rings: 5 })
  }
}

/** A string of pennants from (x0, z0) to (x1, z1) at height y, sagging in the middle. */
function pennants(p, x0, z0, x1, z1, y) {
  const n = Math.max(4, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.2))
  const yaw = Math.atan2(x1 - x0, z1 - z0)
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const sag = Math.sin(t * Math.PI) * 1.6
    const x = x0 + (x1 - x0) * t
    const z = z0 + (z1 - z0) * t
    p.cone(PASTELS[i % PASTELS.length], [x, y - sag - 0.7, z], 0.6, 1.3, { segments: 3, rot: [Math.PI, yaw, 0] })
  }
}

/** A tall pole for pennants. */
function pole(p, x, z, h) {
  p.cylinder('#ffffff', [x, h / 2, z], 0.22, 0.28, h, { segments: 8 })
  p.sphere('#ffd23a', [x, h + 0.3, z], 0.45, { segments: 8, rings: 6 })
}

export function decorateLobby(p, lobby) {
  const hx = LOBBY_HALF_X
  const { front, back, wallH } = lobby
  const rng = mulberry32(7)

  // Flower beds along the inside of the hedges (leaving room by the boots
  // gallery, the jump pads and the back row).
  for (const z of [16, 32]) flowerBed(p, hx - 2, z, 12, true, rng)
  flowerBed(p, hx - 2, 100, 14, true, rng)
  flowerBed(p, -hx + 2, 128, 10, true, rng)
  flowerBed(p, hx - 2, 130, 10, true, rng)
  // Round planters with trees in the corners by the gate.
  for (const side of [-1, 1]) {
    for (const z of [6, 20]) {
      const x = side * (hx - 6)
      if (side > 0 && z === 6) continue // the chest stands there
      p.cylinder('#9a6a3e', [x, 0.7, z], 2.2, 2.4, 1.4, { segments: 12 })
      p.cylinder('#5a3a22', [x, 1.42, z], 1.9, 1.9, 0.06, { segments: 12 })
      roundTree(p, x, 1.4, z, 1.1, z === 6 ? '#5fd14a' : '#8fe05a')
    }
  }

  // Pennants on poles along the hedges and across the back.
  const poles = [
    [-hx + 1.5, 4],
    [-hx + 1.5, 60],
    [-hx + 1.5, back - 4],
    [hx - 1.5, 4],
    [hx - 1.5, 60],
    [hx - 1.5, back - 4],
  ]
  for (const [x, z] of poles) pole(p, x, z, 12)
  pennants(p, -hx + 1.5, 4, -hx + 1.5, 60, 12)
  pennants(p, -hx + 1.5, 60, -hx + 1.5, back - 4, 12)
  pennants(p, hx - 1.5, 4, hx - 1.5, 60, 12)
  pennants(p, hx - 1.5, 60, hx - 1.5, back - 4, 12)

  // Banners down the gate wall either side of the towers.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const x = side * (24 + k * 8)
      const color = ['#3fa8ff', '#ffd23a', '#ff5f8f'][k]
      p.box(color, [x, wallH - 7, front + 0.25], [4.5, 10, 0.3])
      p.cone(color, [x, wallH - 13, front + 0.25], 2.25, 2, { segments: 3, rot: [0, 0, Math.PI] })
      p.box('#ffffff', [x, wallH - 6, front + 0.45], [2.4, 2.4, 0.1])
    }
  }
  // A gold star on top of each gate tower.
  for (const side of [-1, 1]) {
    p.sphere('#ffd23a', [side * 18, wallH + 6, front - 2], 1.6, { glow: true, segments: 10, rings: 8 })
  }

  // Outside the hedges: the gardens, trees, hills and fluffy clouds.
  for (let i = 0; i < 52; i += 1) {
    const side = i % 2 ? 1 : -1
    const x = side * (hx + 10 + rng() * 120)
    const z = -120 + rng() * 360
    if (Math.abs(x) < hx + 8 && z > front - 6) continue
    if (rng() < 0.5) roundTree(p, x, -0.6, z, 1.2 + rng() * 0.8, rng() < 0.3 ? '#8fe05a' : '#5fd14a')
    else cottonTree(p, x, -0.6, z, 1.1 + rng() * 0.7, PASTELS[i % PASTELS.length])
  }
  for (let i = 0; i < 26; i += 1) {
    const x = (rng() - 0.5) * 200
    const z = back + 14 + rng() * 120
    if (rng() < 0.5) roundTree(p, x, -0.6, z, 1.3 + rng(), '#5fd14a')
    else cottonTree(p, x, -0.6, z, 1.2 + rng() * 0.6, PASTELS[i % PASTELS.length])
  }
  for (let i = 0; i < 10; i += 1) hill(p, (rng() - 0.5) * 420, -4, back + 60 + rng() * 140, 1 + rng() * 1.5, rng() < 0.5 ? '#7fdc5a' : '#6fcf4f')
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k += 1) hill(p, side * (hx + 40 + k * 30), -6, 20 + k * 22 + rng() * 10, 0.8 + rng(), rng() < 0.5 ? '#7fdc5a' : '#6fcf4f')
  }
  fence(p, -hx - 4, -hx - 30, back + 10, -0.6)
  fence(p, hx + 4, hx + 30, back + 10, -0.6)
  for (let i = 0; i < 14; i += 1) cloud(p, (rng() - 0.5) * 300, 50 + rng() * 40, back + 40 + rng() * 200, 1 + rng() * 1.5)
}

/* ---------------------------------------------------------------------------
 * World 2's lobby: glowing crystals in the corners.
 * ------------------------------------------------------------------------- */

export function decorateHub(p, hub) {
  const { y, front, back } = hub
  const rng = mulberry32(hub.world * 97)
  for (const sx of [-1, 1]) {
    for (const z of [back - 6, front + 8]) {
      for (let k = 0; k < 3; k += 1) crystal(p, sx * (C - 4 - k * 2.4), y, z + (rng() - 0.5) * 4, 1.2 + rng() * 0.9, k % 2 ? '#ffd23a' : '#b98bff')
    }
  }
}

/* ---------------------------------------------------------------------------
 * Stages: things on top of the corridor walls and banners down their faces.
 * ------------------------------------------------------------------------- */

/** Stages built like the original keep their walls bare (no props or banners). */
const PLAIN = new Set(['brick', 'red', 'lava', 'shark', 'spike'])

const WALL_PROPS = {
  ice: (p, x, y, z, s) => snowPine(p, x, y, z, s),
  candy: (p, x, y, z, s, r) => lollipop(p, x, y, z, s, PASTELS[Math.floor(r * PASTELS.length)]),
  jungle: (p, x, y, z, s) => roundTree(p, x, y, z, 1.3 * s, '#2f9e3a'),
  neon: (p, x, y, z, s, r) => neonPillar(p, x, y, z, s, r < 0.5 ? '#3dfffa' : '#ff3df2'),
  volcano: (p, x, y, z) => torch(p, x, y, z, '#ff5a12'),
  cloud: (p, x, y, z, s) => cloud(p, x, y + 2, z, 0.6 * s),
  toxic: (p, x, y, z, s) => crystal(p, x, y, z, s, '#8cff3a'),
  haunted: (p, x, y, z, s, r) => (r < 0.5 ? gravestone(p, x, y, z, s) : mushroom(p, x, y, z, s, '#7a4dff')),
  crystal: (p, x, y, z, s) => crystal(p, x, y, z, s, '#c9a2ff'),
  factory: (p, x, y, z, s) => gear(p, x, y, z, s),
  sakura: (p, x, y, z, s) => cottonTree(p, x, y, z, 1.2 * s, '#ffb3dc'),
  magma: (p, x, y, z, s) => rock(p, x, y, z, 2 * s, '#2d2523'),
  space: (p, x, y, z, s) => crystal(p, x, y, z, s, '#3dfffa'),
  galaxy: (p, x, y, z, s) => crystal(p, x, y, z, s, '#ff6ef7'),
  golden: (p, x, y, z, s) => crystal(p, x, y, z, s, '#ffd23a'),
}

const BANNERS = {
  candy: ['#ff8fd1', '#ffffff'],
  neon: ['#3dfffa', '#ff3df2'],
  golden: ['#ffd447', '#ffffff'],
}

export function decorateStage(p, stage, theme, sideTop) {
  if (PLAIN.has(stage.theme)) return
  const rng = mulberry32(1000 + stage.index * 31)
  const place = WALL_PROPS[stage.theme] || ((pp, x, y, z, sc) => roundTree(pp, x, y, z, sc))
  const z0 = stage.zStart
  const z1 = stage.plateauZ1
  const length = z0 - z1
  // Props along the top of both corridor walls.
  const count = Math.max(4, Math.round(length / 26))
  for (let i = 0; i < count; i += 1) {
    const z = z0 - ((i + 0.5) / count) * length
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue
      place(p, side * (C + WALL_THICK / 2), sideTop, z + (rng() - 0.5) * 8, 0.8 + rng() * 0.5, rng())
    }
  }
  // Banners hanging on the walls by the plateau.
  const colors = BANNERS[stage.theme] || [theme.spikeBanner || '#ff8a1f', '#ffffff']
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const z = stage.plateauZ0 - 10 - k * 16
      const x = side * (C - 0.25)
      p.box(colors[k % 2], [x, stage.floorY + 16, z], [0.3, 9, 4.5])
      p.cone(colors[k % 2], [x, stage.floorY + 10.6, z], 2.2, 1.6, { segments: 3, rot: [Math.PI, Math.PI / 2, 0] })
    }
  }
  // Space and the galaxy get planets in the sky.
  if (stage.theme === 'space' || stage.theme === 'galaxy') {
    for (let i = 0; i < 4; i += 1) {
      const side = rng() < 0.5 ? -1 : 1
      planet(p, side * (C + 60 + rng() * 120), sideTop + 30 + rng() * 120, z0 - rng() * length, 1 + rng() * 2, PASTELS[i % PASTELS.length], rng)
    }
  }
  // The sky castle floats on clouds.
  if (stage.theme === 'cloud') {
    for (let i = 0; i < 10; i += 1) {
      const side = rng() < 0.5 ? -1 : 1
      cloud(p, side * (C + 12 + rng() * 40), SEA_Y + 30 + rng() * 40, z0 - rng() * length, 1.5 + rng() * 2)
    }
  }
}
