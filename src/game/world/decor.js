import { CORRIDOR_HALF as C, LOBBY_HALF_X, SEA_Y, WALL_THICK, mulberry32 } from '../../shared/layout.js'

/**
 * Scenery. None of it collides — walls and invisible barriers keep players on
 * the course — so it is free to be cute and busy. Flat-coloured props are
 * merged per zone through `Props` (one draw call per zone and material).
 */

const PASTELS = ['#ff8fc7', '#ffd23a', '#8fd8ff', '#b98bff', '#7dffb0', '#ff9a6b']
const FLOWERS = ['#ff5f9e', '#ffd23a', '#ffffff', '#b98bff', '#ff8a4d', '#5fc8ff']

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

function bush(p, x, y, z, s = 1, color = '#4fc43a') {
  p.sphere(color, [x, y + 0.8 * s, z], 1.4 * s, { scale: [1.2, 0.8, 1.2], segments: 9, rings: 6 })
  p.sphere(color, [x + 0.9 * s, y + 0.7 * s, z + 0.4 * s], 1 * s, { scale: [1, 0.8, 1], segments: 8, rings: 6 })
}

function flower(p, x, y, z, color) {
  p.box('#3f9e3a', [x, y + 0.4, z], [0.18, 0.8, 0.18])
  p.sphere(color, [x, y + 0.95, z], 0.36, { segments: 7, rings: 5 })
  p.sphere('#ffe680', [x, y + 0.98, z + 0.18], 0.14, { segments: 5, rings: 4 })
}

function lamp(p, x, y, z, color = '#fff3b0') {
  p.cylinder('#ffffff', [x, y + 3, z], 0.22, 0.3, 6, { segments: 8 })
  p.cylinder('#ff8fc7', [x, y + 0.3, z], 0.7, 0.8, 0.6, { segments: 10 })
  p.sphere(color, [x, y + 6.5, z], 0.75, { glow: true, segments: 10, rings: 8 })
  p.cone('#ff8fc7', [x, y + 7.45, z], 0.9, 0.7, { segments: 10 })
}

function balloon(p, x, y, z, color) {
  p.sphere(color, [x, y, z], 1.1, { scale: [1, 1.2, 1], segments: 10, rings: 8 })
  p.cone(color, [x, y - 1.35, z], 0.3, 0.4, { segments: 6, rot: [Math.PI, 0, 0] })
  p.box('#ffffff', [x, y - 3, z], [0.06, 3, 0.06])
}

function cloud(p, x, y, z, s = 1) {
  p.sphere('#ffffff', [x, y, z], 3 * s, { scale: [1.5, 0.8, 1], segments: 10, rings: 7 })
  p.sphere('#ffffff', [x - 3 * s, y - 0.4 * s, z], 2.2 * s, { scale: [1.3, 0.8, 1], segments: 9, rings: 6 })
  p.sphere('#ffffff', [x + 3.2 * s, y - 0.3 * s, z], 2.4 * s, { scale: [1.3, 0.8, 1], segments: 9, rings: 6 })
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

/** A string of little triangle flags between two posts. */
function bunting(p, a, b, colors = PASTELS) {
  const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.8))
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const sag = Math.sin(t * Math.PI) * 1.4
    const x = a[0] + (b[0] - a[0]) * t
    const y = a[1] + (b[1] - a[1]) * t - sag
    const z = a[2] + (b[2] - a[2]) * t
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2])
    p.cone(colors[i % colors.length], [x, y - 0.55, z], 0.55, 1.1, { segments: 3, rot: [Math.PI, yaw, 0] })
  }
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

function cactus(p, x, y, z, s = 1) {
  p.box('#3f9c3b', [x, y + 3 * s, z], [1.2 * s, 6 * s, 1.2 * s])
  p.box('#3f9c3b', [x + 1.3 * s, y + 3.6 * s, z], [1 * s, 2.2 * s, 1 * s])
  p.box('#3f9c3b', [x - 1.2 * s, y + 2.6 * s, z], [1 * s, 1.8 * s, 1 * s])
}

function palm(p, x, y, z, s = 1) {
  for (let i = 0; i < 5; i += 1) p.cylinder('#8b5a31', [x + i * 0.22 * s, y + (i + 0.5) * 1.5 * s, z], 0.45 * s, 0.55 * s, 1.5 * s, { segments: 7 })
  const tx = x + 1.1 * s
  const ty = y + 7.5 * s
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    p.box('#2fa83a', [tx + Math.cos(a) * 1.9 * s, ty - 0.4 * s, z + Math.sin(a) * 1.9 * s], [4 * s, 0.3 * s, 1.1 * s], { rot: [0, -a, -0.35] })
  }
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
 * Lobby
 * ------------------------------------------------------------------------- */

export function decorateLobby(p, lobby) {
  const hx = LOBBY_HALF_X
  const { front, back, wallH } = lobby
  const rng = mulberry32(7)

  // Flower beds along the inside of the walls.
  for (let z = front + 4; z < back - 2; z += 1.6) {
    if (z > 12 && z < 86) {
      flower(p, hx - 1.4, 0, z, FLOWERS[Math.floor(rng() * FLOWERS.length)])
    }
  }
  for (let x = -hx + 2; x < hx - 1; x += 1.7) {
    if (Math.abs(x) > 30) flower(p, x, 0, back - 1.4, FLOWERS[Math.floor(rng() * FLOWERS.length)])
  }

  // Lamp posts round the spawn, strung with bunting.
  const posts = [
    [-11, 54],
    [11, 54],
    [-11, 78],
    [11, 78],
  ]
  for (const [x, z] of posts) lamp(p, x, 0, z)
  bunting(p, [-11, 7.2, 54], [11, 7.2, 54])
  // Bunting over the gate too.
  bunting(p, [-17, wallH + 9, front - 2], [17, wallH + 9, front - 2])

  // A balloon bunch either side of the leaderboards.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      balloon(p, side * (36 + rng() * 3), 7 + rng() * 3, 89 + (rng() - 0.5) * 4, PASTELS[(i + (side > 0 ? 2 : 0)) % PASTELS.length])
    }
  }

  // Little bushes and flowers by the leaderboards and the shops.
  for (const x of [-34, -11, 11, 34]) bush(p, x, 0, back - 3, 0.9, '#5fd14a')
  for (let i = 0; i < 10; i += 1) flower(p, -8 + rng() * 16, 0, 46 + rng() * 6, FLOWERS[i % FLOWERS.length])

  // Outside the walls: a garden, trees, hills and fluffy clouds.
  for (let i = 0; i < 46; i += 1) {
    const side = i % 2 ? 1 : -1
    const x = side * (hx + 10 + rng() * 120)
    const z = -120 + rng() * 360
    if (Math.abs(x) < hx + 8 && z > front - 6) continue
    if (rng() < 0.5) roundTree(p, x, -0.6, z, 1.2 + rng() * 0.8, rng() < 0.3 ? '#8fe05a' : '#5fd14a')
    else cottonTree(p, x, -0.6, z, 1.1 + rng() * 0.7, PASTELS[i % PASTELS.length])
  }
  for (let i = 0; i < 24; i += 1) {
    const x = (rng() - 0.5) * 200
    const z = back + 14 + rng() * 120
    if (rng() < 0.5) roundTree(p, x, -0.6, z, 1.3 + rng(), '#5fd14a')
    else cottonTree(p, x, -0.6, z, 1.2 + rng() * 0.6, PASTELS[i % PASTELS.length])
  }
  for (let i = 0; i < 10; i += 1) hill(p, (rng() - 0.5) * 420, -4, back + 60 + rng() * 140, 1 + rng() * 1.5, rng() < 0.5 ? '#7fdc5a' : '#6fcf4f')
  fence(p, -hx - 4, -hx - 30, back + 10, -0.6)
  fence(p, hx + 4, hx + 30, back + 10, -0.6)
  for (let i = 0; i < 14; i += 1) cloud(p, (rng() - 0.5) * 300, 50 + rng() * 40, back + 40 + rng() * 200, 1 + rng() * 1.5)
}

/* ---------------------------------------------------------------------------
 * Stages: things on top of the corridor walls and banners down their faces.
 * ------------------------------------------------------------------------- */

const WALL_PROPS = {
  starter: (p, x, y, z, s) => roundTree(p, x, y, z, s),
  brick: (p, x, y, z) => torch(p, x, y, z),
  lava: (p, x, y, z, s) => rock(p, x, y, z, 2 * s, '#3e3634'),
  desert: (p, x, y, z, s, r) => (r < 0.5 ? cactus(p, x, y, z, s) : palm(p, x, y, z, s)),
  shark: (p, x, y, z, s) => palm(p, x, y, z, s),
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
  starter: ['#5fd14a', '#ffffff'],
  brick: ['#f6d743', '#5a63c9'],
  candy: ['#ff8fd1', '#ffffff'],
  neon: ['#3dfffa', '#ff3df2'],
  golden: ['#ffd447', '#ffffff'],
}

export function decorateStage(p, stage, theme, sideTop) {
  const rng = mulberry32(1000 + stage.index * 31)
  const place = WALL_PROPS[stage.theme] || WALL_PROPS.starter
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
