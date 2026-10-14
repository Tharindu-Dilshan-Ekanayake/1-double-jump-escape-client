import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

import { mulberry32 } from '../../shared/layout.js'

/**
 * Procedural canvas textures: Roblox-style stud tiles for every surface and
 * animated liquids. Generated once on load; nothing is downloaded.
 */

const SIZE = 256

function makeCanvas(size = SIZE) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return [canvas, canvas.getContext('2d')]
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Lightens (+) or darkens (-) a #rrggbb colour by a fraction; returns #rrggbb. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 + amount))))
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`
}

/**
 * `cells`×`cells` studs per texture. With two colours and `checker` > 0 the
 * colours alternate in squares of `checker` studs.
 */
function studs({
  colors,
  cells = 4,
  checker = 0,
  outline = 'rgba(0,0,0,0.25)',
  shine = 'rgba(255,255,255,0.10)',
  inset = 0.13,
  radius = 0.24,
  line = 3,
  jitter = 0.035,
  seed = 1,
  after,
}) {
  const [canvas, g] = makeCanvas()
  const cell = SIZE / cells
  const rng = mulberry32(seed)
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const index = checker ? (Math.floor(i / checker) + Math.floor(j / checker)) % colors.length : 0
      g.fillStyle = shade(colors[index], (rng() - 0.5) * jitter * 2)
      g.fillRect(i * cell, j * cell, cell, cell)
      const pad = cell * inset
      roundRect(g, i * cell + pad, j * cell + pad, cell - pad * 2, cell - pad * 2, cell * radius)
      g.fillStyle = shine
      g.fill()
      g.lineWidth = line
      g.strokeStyle = outline
      g.stroke()
    }
  }
  after?.(g, rng)
  return canvas
}

function cracks(g, rng) {
  g.strokeStyle = 'rgba(255,120,30,0.85)'
  g.lineWidth = 3
  g.lineCap = 'round'
  for (let k = 0; k < 6; k += 1) {
    let x = rng() * SIZE
    let y = rng() * SIZE
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 4; s += 1) {
      x += (rng() - 0.5) * 70
      y += (rng() - 0.5) * 70
      g.lineTo(x, y)
    }
    g.stroke()
  }
}

function starDots(g, rng) {
  for (let k = 0; k < 40; k += 1) {
    g.fillStyle = `rgba(255,255,255,${0.4 + rng() * 0.6})`
    const r = rng() * 1.8 + 0.4
    g.beginPath()
    g.arc(rng() * SIZE, rng() * SIZE, r, 0, Math.PI * 2)
    g.fill()
  }
}

function rainbowStuds() {
  const [canvas, g] = makeCanvas()
  const cells = 6
  const cell = SIZE / cells
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const hue = (i / cells) * 360
      g.fillStyle = `hsl(${hue}, 85%, ${j % 2 ? 62 : 58}%)`
      g.fillRect(i * cell, j * cell, cell, cell)
      roundRect(g, i * cell + cell * 0.13, j * cell + cell * 0.13, cell * 0.74, cell * 0.74, cell * 0.22)
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fill()
      g.lineWidth = 3
      g.strokeStyle = 'rgba(0,0,0,0.18)'
      g.stroke()
    }
  }
  return canvas
}

/** The spawn pad: soft white studs (the star is a separate decal, see spawnStarCanvas). */
function spawnTile() {
  return studs({ colors: ['#ffffff', '#fff0f8'], cells: 4, checker: 1, outline: 'rgba(220,120,180,0.25)', shine: 'rgba(255,255,255,0.2)' })
}

/** A pink ring and a big yellow star on a transparent canvas, for the spawn decal. */
export function spawnStarCanvas() {
  const [canvas, g] = makeCanvas()
  const c = SIZE / 2
  g.lineWidth = 12
  g.strokeStyle = '#ff8fc7'
  g.beginPath()
  g.arc(c, c, SIZE * 0.4, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? SIZE * 0.13 : SIZE * 0.31
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = '#ffd23a'
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = '#e8a010'
  g.stroke()
  return canvas
}

/** Material key -> { draw, tile } where tile = studs covered by one texture repeat. */
const SPECS = {
  plaza: { tile: 8, draw: () => studs({ colors: ['#f1e4c8', '#e9d9b8'], checker: 2, outline: 'rgba(150,110,50,0.26)', shine: 'rgba(255,255,255,0.12)' }) },
  trainZone: { tile: 8, draw: () => studs({ colors: ['#a6dcff', '#92d0fb'], checker: 2, outline: 'rgba(30,100,170,0.26)', shine: 'rgba(255,255,255,0.14)', seed: 54 }) },
  shopZone: { tile: 8, draw: () => studs({ colors: ['#e6d0ff', '#dac0fd'], checker: 2, outline: 'rgba(110,60,170,0.24)', shine: 'rgba(255,255,255,0.14)', seed: 55 }) },
  lobbyRoad: { tile: 8, draw: () => bricks('#e0663f', '#cf5634', 'rgba(110,35,15,0.55)') },
  stairs: { tile: 4, draw: () => studs({ colors: ['#a6a9af'], outline: 'rgba(28,30,36,0.36)', seed: 2 }) },
  spawn: { tile: 4, draw: spawnTile },
  grass: { tile: 8, draw: () => studs({ colors: ['#63c52f', '#55b628'], checker: 2, outline: 'rgba(25,80,10,0.30)', seed: 3 }) },
  checkerBlue: { tile: 8, draw: () => studs({ colors: ['#4c84ec', '#3d72da'], checker: 2, outline: 'rgba(10,30,100,0.30)', seed: 4 }) },
  redStud: { tile: 4, draw: () => studs({ colors: ['#e2372b'], outline: 'rgba(95,8,8,0.42)', shine: 'rgba(255,255,255,0.08)', seed: 5 }) },
  dirt: { tile: 8, draw: () => studs({ colors: ['#8b5a31', '#7d4f2a'], checker: 1, outline: 'rgba(40,20,5,0.3)', seed: 6 }) },
  cloudWhite: { tile: 8, draw: () => studs({ colors: ['#ffffff', '#ecf4ff'], checker: 2, outline: 'rgba(120,150,195,0.28)', seed: 7 }) },
  cloudStone: { tile: 8, draw: () => studs({ colors: ['#d8e6f6', '#c9dbef'], checker: 2, outline: 'rgba(90,120,160,0.28)', seed: 8 }) },
  darkRock: { tile: 8, draw: () => studs({ colors: ['#3e3634', '#342d2c'], checker: 1, outline: 'rgba(0,0,0,0.35)', seed: 9, after: cracks }) },
  candy: { tile: 8, draw: () => studs({ colors: ['#ff9fd0', '#fff0f8'], checker: 1, outline: 'rgba(200,60,130,0.28)', seed: 10 }) },
  candyWall: { tile: 8, draw: () => studs({ colors: ['#ff70b8', '#ff8ac8'], checker: 2, outline: 'rgba(150,20,90,0.28)', seed: 11 }) },
  chocolate: { tile: 8, draw: () => studs({ colors: ['#6b3f22', '#5c351c'], checker: 1, outline: 'rgba(30,10,0,0.35)', seed: 12 }) },
  ice: { tile: 8, draw: () => studs({ colors: ['#d6f3ff', '#bfe8fc'], checker: 1, outline: 'rgba(255,255,255,0.85)', shine: 'rgba(255,255,255,0.25)', seed: 13 }) },
  iceWall: { tile: 8, draw: () => studs({ colors: ['#9fdcf8', '#8dd0f0'], checker: 2, outline: 'rgba(255,255,255,0.5)', seed: 14 }) },
  snow: { tile: 8, draw: () => studs({ colors: ['#f6fbff', '#e8f3fb'], checker: 2, outline: 'rgba(150,180,210,0.25)', seed: 15 }) },
  sandTile: { tile: 8, draw: () => studs({ colors: ['#f3d48e', '#e8c579'], checker: 1, outline: 'rgba(140,90,20,0.25)', seed: 16 }) },
  sandstone: { tile: 8, draw: () => studs({ colors: ['#d8a65c', '#ca984e'], checker: 2, outline: 'rgba(100,60,10,0.3)', seed: 17 }) },
  sand: { tile: 8, draw: () => studs({ colors: ['#f0d08a', '#e8c67e'], checker: 2, outline: 'rgba(140,100,30,0.18)', seed: 18 }) },
  jungleTile: { tile: 8, draw: () => studs({ colors: ['#3f9c3b', '#348a30'], checker: 1, outline: 'rgba(10,50,10,0.32)', seed: 19 }) },
  mossStone: { tile: 8, draw: () => studs({ colors: ['#72895c', '#627a4e'], checker: 2, outline: 'rgba(20,40,10,0.32)', seed: 20 }) },
  jungleGrass: { tile: 8, draw: () => studs({ colors: ['#2f8f3a', '#287f33'], checker: 2, outline: 'rgba(10,50,10,0.3)', seed: 21 }) },
  toxicTile: { tile: 8, draw: () => studs({ colors: ['#5c307e', '#4c266a'], checker: 1, outline: 'rgba(140,255,60,0.55)', seed: 22 }) },
  metal: { tile: 4, draw: () => studs({ colors: ['#7f8a97'], outline: 'rgba(20,25,35,0.45)', shine: 'rgba(255,255,255,0.14)', seed: 23 }) },
  spaceTile: { tile: 8, draw: () => studs({ colors: ['#2c2554', '#231d46'], checker: 1, outline: 'rgba(90,220,255,0.55)', seed: 24, after: starDots }) },
  rainbowTile: { tile: 12, draw: rainbowStuds },
  gold: { tile: 4, draw: () => studs({ colors: ['#ffd447'], outline: 'rgba(150,90,0,0.38)', shine: 'rgba(255,255,255,0.28)', seed: 25 }) },
  goldWall: { tile: 8, draw: () => studs({ colors: ['#eab626', '#dba81d'], checker: 2, outline: 'rgba(120,70,0,0.35)', seed: 26 }) },
  returnPad: { tile: 4, draw: () => studs({ colors: ['#ffd53c', '#ffc21a'], checker: 1, outline: 'rgba(150,90,0,0.4)', shine: 'rgba(255,255,255,0.22)', seed: 27 }) },
  doublePad: { tile: 4, draw: () => studs({ colors: ['#a75cff', '#9147f2'], checker: 1, outline: 'rgba(60,10,120,0.45)', shine: 'rgba(255,255,255,0.2)', seed: 28 }) },
  standPad: { tile: 6, draw: () => studs({ colors: ['#45e3ff', '#2fcff0'], checker: 1, outline: 'rgba(255,255,255,0.6)', shine: 'rgba(255,255,255,0.2)', seed: 29 }) },
  galleryPad: { tile: 6, draw: () => studs({ colors: ['#59ef7f', '#3fdc6a'], checker: 1, outline: 'rgba(255,255,255,0.65)', shine: 'rgba(255,255,255,0.2)', seed: 30 }) },

  // Lobby: soft pastels.
  lobbyFloor: { tile: 8, draw: () => studs({ colors: ['#f4e8ff', '#ffe6f3'], checker: 2, outline: 'rgba(170,110,200,0.2)', shine: 'rgba(255,255,255,0.2)', seed: 80 }) },
  lobbyPath: { tile: 8, draw: () => bricks('#ffd6b0', '#ffc99e', 'rgba(205,130,95,0.55)', 81) },
  lawn: { tile: 8, draw: () => studs({ colors: ['#7fdc5a', '#71d04c'], checker: 2, outline: 'rgba(30,100,20,0.24)', seed: 82 }) },
  lobbyWall: { tile: 8, draw: () => bricks('#b4defc', '#a5d4f8', 'rgba(255,255,255,0.85)', 83) },
  lobbyTrim: { tile: 4, draw: () => studs({ colors: ['#ffffff'], outline: 'rgba(140,170,210,0.35)', shine: 'rgba(255,255,255,0.3)', seed: 84 }) },
  lobbyTower: { tile: 8, draw: () => studs({ colors: ['#ffb7da', '#ffa8d2'], checker: 2, outline: 'rgba(200,70,130,0.28)', seed: 85 }) },
  stageStep: { tile: 8, draw: () => studs({ colors: ['#b8f5dc', '#a6efd0'], checker: 2, outline: 'rgba(40,150,110,0.26)', seed: 86 }) },
  pedestal: { tile: 4, draw: () => studs({ colors: ['#ffffff', '#eef3fb'], checker: 1, outline: 'rgba(110,130,170,0.35)', shine: 'rgba(255,255,255,0.3)', seed: 87 }) },
  mintStud: { tile: 8, draw: () => studs({ colors: ['#b4ffd9', '#9df3c8'], checker: 2, outline: 'rgba(30,140,90,0.28)', seed: 88 }) },

  // Course surfaces.
  grassChecker: { tile: 16, draw: () => studs({ colors: ['#6fe04a', '#5bcf38'], cells: 8, checker: 2, outline: 'rgba(25,90,15,0.28)', shine: 'rgba(255,255,255,0.14)', seed: 89 }) },
  stoneWall: { tile: 8, draw: () => bricks('#b9bec8', '#aeb3bd', 'rgba(70,76,90,0.6)', 90) },
  lilacStud: { tile: 4, draw: () => studs({ colors: ['#a3aaf2'], outline: 'rgba(40,40,120,0.35)', shine: 'rgba(255,255,255,0.12)', seed: 91 }) },
  lilacDark: { tile: 8, draw: () => studs({ colors: ['#6e76cc', '#646bc2'], checker: 2, outline: 'rgba(20,20,80,0.35)', seed: 92 }) },
  blueBrick: { tile: 8, draw: () => studs({ colors: ['#5a63c9', '#525bbd'], checker: 1, outline: 'rgba(15,18,70,0.4)', seed: 93 }) },
  yellowStud: { tile: 8, draw: () => studs({ colors: ['#f6d743', '#efcd31'], checker: 2, outline: 'rgba(140,100,0,0.3)', shine: 'rgba(255,255,255,0.16)', seed: 94 }) },
  brownBrick: { tile: 8, draw: () => bricks('#a97a55', '#9a6c49', 'rgba(70,40,20,0.6)', 95) },

  // Stage surfaces.
  stoneGrey: { tile: 4, draw: () => studs({ colors: ['#a3a6ac'], outline: 'rgba(28,30,36,0.38)', shine: 'rgba(255,255,255,0.07)', seed: 31 }) },
  stoneLight: { tile: 8, draw: () => studs({ colors: ['#cfd2d8', '#c3c7ce'], checker: 2, outline: 'rgba(60,66,80,0.3)', seed: 32 }) },
  road: { tile: 4, draw: () => studs({ colors: ['#b4b8bf'], outline: 'rgba(40,44,52,0.32)', shine: 'rgba(255,255,255,0.1)', seed: 33 }) },
  forestTop: { tile: 16, draw: () => studs({ colors: ['#57dc3c', '#43c92e'], cells: 8, checker: 2, outline: 'rgba(20,90,10,0.28)', shine: 'rgba(255,255,255,0.12)', seed: 34 }) },
  yellowChecker: { tile: 16, draw: () => studs({ colors: ['#ffd62a', '#ffb81c'], cells: 8, checker: 2, outline: 'rgba(170,90,0,0.3)', shine: 'rgba(255,255,255,0.18)', seed: 35 }) },
  poolTile: { tile: 8, draw: poolTiles },
  darkChecker: { tile: 16, draw: () => studs({ colors: ['#2a3146', '#1f2536'], cells: 8, checker: 2, outline: 'rgba(0,0,0,0.4)', shine: 'rgba(120,150,255,0.07)', seed: 36 }) },
  lavaChecker: { tile: 16, draw: () => studs({ colors: ['#ff8a1f', '#ff5a12'], cells: 8, checker: 2, outline: 'rgba(140,30,0,0.35)', shine: 'rgba(255,240,120,0.2)', seed: 37 }) },
  neonFloor: { tile: 8, draw: () => neonGrid('#151229', '#3dfffa', '#ff3df2') },
  neonWall: { tile: 8, draw: () => neonGrid('#241a44', '#ff3df2', '#7a5cff') },
  moonRock: { tile: 8, draw: () => studs({ colors: ['#a3a8b4', '#959aa6'], checker: 1, outline: 'rgba(40,44,60,0.3)', seed: 38, after: craters }) },
  planks: { tile: 8, draw: () => planks('#d39a5b', '#b97f45') },
  woodWall: { tile: 8, draw: () => planks('#8a5a34', '#734a2a') },
  slimeFloor: { tile: 8, draw: () => studs({ colors: ['#4fbf2a', '#3fa822'], checker: 1, outline: 'rgba(200,255,120,0.5)', seed: 39 }) },
  hauntedTile: { tile: 8, draw: () => studs({ colors: ['#463a5c', '#3b3050'], checker: 1, outline: 'rgba(160,110,255,0.35)', seed: 40 }) },
  hauntedStone: { tile: 8, draw: () => studs({ colors: ['#55506a', '#4a465d'], checker: 2, outline: 'rgba(0,0,0,0.35)', seed: 41, after: cracksPurple }) },
  hauntedGround: { tile: 8, draw: () => studs({ colors: ['#33402e', '#2b3727'], checker: 2, outline: 'rgba(0,0,0,0.3)', seed: 42 }) },
  crystalTile: { tile: 8, draw: () => studs({ colors: ['#e0d2ff', '#cdb8ff'], checker: 1, outline: 'rgba(255,255,255,0.8)', shine: 'rgba(255,255,255,0.3)', seed: 43 }) },
  crystalWall: { tile: 8, draw: () => studs({ colors: ['#a585ff', '#9070f2'], checker: 2, outline: 'rgba(255,255,255,0.45)', seed: 44 }) },
  hazardStripe: { tile: 8, draw: hazardStripes },
  metalDark: { tile: 4, draw: () => studs({ colors: ['#4c535e'], outline: 'rgba(10,12,18,0.5)', shine: 'rgba(255,255,255,0.1)', seed: 45 }) },
  sakuraTile: { tile: 8, draw: () => studs({ colors: ['#ffe0ee', '#ffcfe4'], checker: 1, outline: 'rgba(220,90,150,0.3)', seed: 46 }) },
  sakuraGrass: { tile: 8, draw: () => studs({ colors: ['#ff9fd2', '#ff8cc6'], checker: 2, outline: 'rgba(170,40,110,0.25)', seed: 47 }) },
  magmaTile: { tile: 8, draw: () => studs({ colors: ['#3a2622', '#30201c'], checker: 1, outline: 'rgba(0,0,0,0.4)', seed: 48, after: cracks }) },
  galaxyWall: { tile: 8, draw: () => studs({ colors: ['#2e1d63', '#251752'], checker: 2, outline: 'rgba(200,120,255,0.4)', seed: 49, after: starDots }) },
  w2plaza: { tile: 8, draw: () => studs({ colors: ['#f6e3f4', '#eed4ec'], checker: 2, outline: 'rgba(160,70,140,0.24)', shine: 'rgba(255,255,255,0.12)', seed: 50 }) },
  trainFrame: { tile: 4, draw: () => studs({ colors: ['#3b404c'], outline: 'rgba(0,0,0,0.45)', shine: 'rgba(255,255,255,0.08)', seed: 51 }) },
  trainConsole: { tile: 4, draw: () => studs({ colors: ['#2a2e38'], outline: 'rgba(0,0,0,0.5)', shine: 'rgba(120,200,255,0.12)', seed: 52 }) },
}

/** Running-bond bricks (paths and walls). */
function bricks(light, dark, mortar, seed = 56, rows = 8) {
  const [canvas, g] = makeCanvas()
  const rng = mulberry32(seed)
  const h = SIZE / rows
  const w = SIZE / 4
  g.fillStyle = mortar
  g.fillRect(0, 0, SIZE, SIZE)
  for (let r = 0; r < rows; r += 1) {
    const shift = r % 2 ? w / 2 : 0
    for (let c = -1; c < 5; c += 1) {
      g.fillStyle = rng() < 0.5 ? light : dark
      roundRect(g, c * w + shift + 3, r * h + 3, w - 6, h - 6, 5)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(c * w + shift + 8, r * h + 6, w - 16, 4)
    }
  }
  return canvas
}


function poolTiles() {
  const canvas = studs({ colors: ['#86d6ff', '#6cc8fb'], cells: 4, checker: 1, outline: 'rgba(255,255,255,0.75)', shine: 'rgba(255,255,255,0.12)', line: 2, seed: 53 })
  const g = canvas.getContext('2d')
  const rng = mulberry32(54)
  g.strokeStyle = 'rgba(255,255,255,0.45)'
  g.lineWidth = 3
  g.lineCap = 'round'
  for (let k = 0; k < 10; k += 1) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    g.beginPath()
    g.moveTo(x, y)
    g.bezierCurveTo(x + 10, y - 8, x + 20, y + 8, x + 32, y)
    g.stroke()
  }
  return canvas
}

function neonGrid(base, lineA, lineB) {
  const [canvas, g] = makeCanvas()
  g.fillStyle = base
  g.fillRect(0, 0, SIZE, SIZE)
  const cell = SIZE / 4
  for (let i = 0; i <= 4; i += 1) {
    for (const [color, width] of [
      [i % 2 ? lineB : lineA, 6],
      ['rgba(255,255,255,0.8)', 1.5],
    ]) {
      g.strokeStyle = color
      g.lineWidth = width
      g.beginPath()
      g.moveTo(i * cell, 0)
      g.lineTo(i * cell, SIZE)
      g.moveTo(0, i * cell)
      g.lineTo(SIZE, i * cell)
      g.stroke()
    }
  }
  return canvas
}

function planks(light, dark) {
  const [canvas, g] = makeCanvas()
  const rows = 4
  const h = SIZE / rows
  const rng = mulberry32(light.length * 13)
  for (let r = 0; r < rows; r += 1) {
    g.fillStyle = r % 2 ? dark : light
    g.fillRect(0, r * h, SIZE, h)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, r * h + h - 4, SIZE, 4)
    const seam = (r % 2 ? 0.25 : 0.7) * SIZE
    g.fillRect(seam, r * h, 4, h)
    g.strokeStyle = 'rgba(0,0,0,0.12)'
    g.lineWidth = 2
    for (let k = 0; k < 3; k += 1) {
      const y = r * h + 8 + rng() * (h - 16)
      g.beginPath()
      g.moveTo(rng() * SIZE * 0.3, y)
      g.lineTo(SIZE * (0.5 + rng() * 0.5), y + (rng() - 0.5) * 6)
      g.stroke()
    }
  }
  return canvas
}

function hazardStripes() {
  const [canvas, g] = makeCanvas()
  g.fillStyle = '#ffcc1a'
  g.fillRect(0, 0, SIZE, SIZE)
  g.fillStyle = '#1d1f26'
  const w = SIZE / 4
  for (let i = -4; i < 8; i += 1) {
    g.beginPath()
    g.moveTo(i * w, 0)
    g.lineTo(i * w + w / 2, 0)
    g.lineTo(i * w + w / 2 + SIZE, SIZE)
    g.lineTo(i * w + SIZE, SIZE)
    g.closePath()
    g.fill()
  }
  return canvas
}

function craters(g, rng) {
  for (let k = 0; k < 7; k += 1) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const r = 8 + rng() * 18
    g.fillStyle = 'rgba(40,44,60,0.22)'
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.lineWidth = 2
    g.stroke()
  }
}

function cracksPurple(g, rng) {
  g.strokeStyle = 'rgba(170,110,255,0.6)'
  g.lineWidth = 2
  for (let k = 0; k < 5; k += 1) {
    let x = rng() * SIZE
    let y = rng() * SIZE
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 3; s += 1) {
      x += (rng() - 0.5) * 60
      y += (rng() - 0.5) * 60
      g.lineTo(x, y)
    }
    g.stroke()
  }
}

/**
 * The running trail: white chevrons ("»»»") along u, soft edges across v.
 * Tinted per trail by vertex colours.
 */
function stripeTrail() {
  const [canvas, g] = makeCanvas(128)
  g.clearRect(0, 0, 128, 128)
  // Two chevrons per repeat, pointing along +u (backwards along the trail).
  g.fillStyle = '#ffffff'
  for (const x0 of [8, 72]) {
    g.beginPath()
    g.moveTo(x0, 10)
    g.lineTo(x0 + 26, 10)
    g.lineTo(x0 + 50, 64)
    g.lineTo(x0 + 26, 118)
    g.lineTo(x0, 118)
    g.lineTo(x0 + 24, 64)
    g.closePath()
    g.fill()
  }
  // Fade the long edges so the ribbon looks soft.
  g.globalCompositeOperation = 'destination-in'
  const fade = g.createLinearGradient(0, 0, 0, 128)
  fade.addColorStop(0, 'rgba(255,255,255,0.35)')
  fade.addColorStop(0.25, 'rgba(255,255,255,1)')
  fade.addColorStop(0.75, 'rgba(255,255,255,1)')
  fade.addColorStop(1, 'rgba(255,255,255,0.35)')
  g.fillStyle = fade
  g.fillRect(0, 0, 128, 128)
  g.globalCompositeOperation = 'source-over'
  return canvas
}

export function getStripeTexture() {
  if (!cache.has('stripes')) {
    const texture = new CanvasTexture(stripeTrail())
    texture.wrapS = RepeatWrapping
    texture.colorSpace = SRGBColorSpace
    cache.set('stripes', texture)
  }
  return cache.get('stripes')
}

/* ---------------------------------------------------------------------------
 * Liquids
 * ------------------------------------------------------------------------- */

function blobs(base, blobColors, { count = 26, min = 10, max = 34, seed = 1, sparkle = 0 } = {}) {
  const [canvas, g] = makeCanvas()
  const rng = mulberry32(seed)
  g.fillStyle = base
  g.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < count; i += 1) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const r = min + rng() * (max - min)
    g.fillStyle = blobColors[i % blobColors.length]
    // Draw wrapped copies so the texture tiles seamlessly.
    for (const dx of [-SIZE, 0, SIZE]) {
      for (const dy of [-SIZE, 0, SIZE]) {
        g.beginPath()
        g.ellipse(x + dx, y + dy, r, r * 0.7, rng() * Math.PI, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  if (sparkle) starDots(g, rng)
  return canvas
}

/**
 * A river surface: soft lanes and streaks running along v (the course's Z), so
 * scrolling it reads as a current. `crust` adds floating plates (lava, slag),
 * `bands` paints stripes across the flow (rainbow), `petals` floats pink petals.
 * Everything is drawn wrapped so the texture tiles seamlessly.
 */
function riverCanvas({ base, light, dark, foam = 'rgba(255,255,255,0.6)', crust = null, bands = null, petals = false, seed }) {
  const [canvas, g] = makeCanvas()
  const rng = mulberry32(seed)
  const wrapped = (draw) => {
    for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) draw(dx, dy)
  }
  g.fillStyle = base
  g.fillRect(0, 0, SIZE, SIZE)
  if (bands) {
    const w = SIZE / bands.length
    bands.forEach((color, i) => {
      g.fillStyle = color
      g.fillRect(i * w, 0, w + 1, SIZE)
    })
  }
  // Wide, soft lanes of deeper and lighter water.
  for (let i = 0; i < 7; i += 1) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const rx = 10 + rng() * 22
    const ry = 50 + rng() * 80
    g.fillStyle = rng() < 0.5 ? dark : light
    g.globalAlpha = 0.22
    wrapped((dx, dy) => {
      g.beginPath()
      g.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2)
      g.fill()
    })
  }
  g.globalAlpha = 1
  if (crust) {
    for (let i = 0; i < 12; i += 1) {
      const cx = rng() * SIZE
      const cy = rng() * SIZE
      const r = 9 + rng() * 18
      const pts = Array.from({ length: 7 }, (_, k) => {
        const a = (k / 7) * Math.PI * 2 + rng() * 0.5
        const d = r * (0.65 + rng() * 0.45)
        return [Math.cos(a) * d, Math.sin(a) * d * 1.5]
      })
      wrapped((dx, dy) => {
        g.beginPath()
        pts.forEach(([px, py], k) => (k ? g.lineTo(cx + px + dx, cy + py + dy) : g.moveTo(cx + px + dx, cy + py + dy)))
        g.closePath()
        g.fillStyle = crust
        g.fill()
        g.strokeStyle = light
        g.lineWidth = 2.5
        g.stroke()
      })
    }
  }
  // Flow streaks.
  g.lineCap = 'round'
  for (let i = 0; i < 70; i += 1) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const len = 14 + rng() * 52
    const bend = (rng() - 0.5) * 8
    g.strokeStyle = rng() < 0.75 ? light : foam
    g.globalAlpha = 0.3 + rng() * 0.45
    g.lineWidth = 1.5 + rng() * 3
    wrapped((dx, dy) => {
      g.beginPath()
      g.moveTo(x + dx, y + dy)
      g.quadraticCurveTo(x + dx + bend, y + dy + len / 2, x + dx, y + dy + len)
      g.stroke()
    })
  }
  // Foam flecks (or petals).
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const r = petals ? 3 + rng() * 3 : 1.2 + rng() * 2
    g.fillStyle = petals ? (rng() < 0.5 ? '#ffd0ea' : '#ff9fd2') : foam
    g.globalAlpha = 0.85
    wrapped((dx, dy) => {
      g.beginPath()
      g.ellipse(x + dx, y + dy, r, r * (petals ? 0.6 : 1), rng() * Math.PI, 0, Math.PI * 2)
      g.fill()
    })
  }
  g.globalAlpha = 1
  return canvas
}

/**
 * kind -> { draw, tile, speed (uv/sec, for pools), flow (uv/sec, as a river),
 * glow, opacity }. Each stage theme names its river kind in layout.js THEMES.
 */
export const LIQUIDS = {
  water: { tile: 24, speed: 0.04, flow: 0.09, opacity: 0.9, draw: () => riverCanvas({ base: '#2794e6', light: '#8fd8ff', dark: '#155fb4', seed: 61 }) },
  icewater: { tile: 24, speed: 0.03, flow: 0.06, opacity: 0.88, draw: () => riverCanvas({ base: '#6fd2fb', light: '#e2f8ff', dark: '#3a9fd6', seed: 62 }) },
  lava: { tile: 24, speed: 0.025, flow: 0.05, glow: 1.0, draw: () => riverCanvas({ base: '#ff6400', light: '#ffd23a', dark: '#c43200', foam: '#fff07a', crust: '#3b1a12', seed: 63 }) },
  chocolate: { tile: 24, flow: 0.05, draw: () => riverCanvas({ base: '#7a4320', light: '#b0703f', dark: '#552c12', foam: 'rgba(255,236,214,0.55)', seed: 64 }) },
  neon: { tile: 24, flow: 0.1, glow: 0.75, draw: () => riverCanvas({ base: '#1a1238', light: '#3dfffa', dark: '#ff3df2', foam: '#ffffff', seed: 65 }) },
  rainbow: {
    tile: 32,
    flow: 0.08,
    glow: 0.3,
    draw: () => riverCanvas({ base: '#ffffff', light: '#ffffff', dark: '#b9c8ff', bands: ['#ff8a8a', '#ffc27a', '#fff07a', '#8ff0a6', '#8fd0ff', '#c4a3ff'], seed: 66 }),
  },
  gold: { tile: 24, flow: 0.05, glow: 0.55, draw: () => riverCanvas({ base: '#ffb81c', light: '#fff3a0', dark: '#d48400', foam: '#ffffff', seed: 67 }) },
  sea: { tile: 24, flow: 0.07, opacity: 0.92, draw: () => riverCanvas({ base: '#17b3c6', light: '#a4f4ff', dark: '#0f80a3', seed: 68 }) },
  ghost: { tile: 24, flow: 0.05, glow: 0.35, draw: () => riverCanvas({ base: '#3b2d63', light: '#b59cff', dark: '#1d1438', foam: '#e2d6ff', seed: 69 }) },
  crystal: { tile: 24, flow: 0.07, glow: 0.3, draw: () => riverCanvas({ base: '#7fd4ff', light: '#ffffff', dark: '#8a70ff', seed: 70 }) },
  molten: { tile: 24, flow: 0.06, glow: 0.9, draw: () => riverCanvas({ base: '#ff7a1a', light: '#fff07a', dark: '#b8420a', foam: '#ffffff', crust: '#4a4e58', seed: 71 }) },
  sakura: { tile: 24, flow: 0.07, opacity: 0.92, draw: () => riverCanvas({ base: '#5cbcf5', light: '#d6f2ff', dark: '#2f8fd6', petals: true, seed: 72 }) },
  goo: { tile: 16, speed: 0.03, glow: 0.25, draw: () => blobs('#ff6fc0', ['#ff9fd6', '#ffd0ea', '#e84fa8'], { seed: 34 }) },
  quicksand: { tile: 16, speed: 0.012, flow: 0.025, draw: () => blobs('#d4a960', ['#c39552', '#e2bd78'], { seed: 35, count: 30 }) },
  swamp: { tile: 16, speed: 0.015, flow: 0.04, draw: () => blobs('#476f25', ['#3a5d1d', '#5c8a32', '#7aa84a'], { seed: 36 }) },
  slime: { tile: 16, speed: 0.03, flow: 0.06, glow: 0.8, draw: () => blobs('#5ee62b', ['#b6ff3a', '#3cc41f', '#e6ff7a'], { seed: 37 }) },
  void: { tile: 24, speed: 0.01, flow: 0.02, glow: 0.4, draw: () => blobs('#120c2b', ['#2a1b5c', '#1c1240', '#3b1d6e'], { seed: 38, sparkle: true }) },
}

/* ---------------------------------------------------------------------------
 * Cache
 * ------------------------------------------------------------------------- */

const cache = new Map()

function toTexture(canvas) {
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Texture for a surface material key, or null if the key has no texture. */
export function getSurfaceTexture(key) {
  const spec = SPECS[key]
  if (!spec) return null
  if (!cache.has(key)) cache.set(key, toTexture(spec.draw()))
  return cache.get(key)
}

export const surfaceTile = (key) => SPECS[key]?.tile ?? 4

export function getLiquidTexture(kind) {
  const spec = LIQUIDS[kind] || LIQUIDS.water
  const key = `liquid:${kind}`
  if (!cache.has(key)) cache.set(key, toTexture(spec.draw()))
  return cache.get(key)
}

/** A soft round glow used for sprites, particles and the sun. */
export function getGlowTexture() {
  if (!cache.has('glow')) {
    const [canvas, g] = makeCanvas(128)
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    cache.set('glow', texture)
  }
  return cache.get('glow')
}
