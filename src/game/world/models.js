import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'

import { BOOT_BY_ID, TRAMPOLINE_BY_ID, formatNumber, multLabel } from '../../shared/gameData.js'
import { TRAMP_RADIUS, TRAMP_TOP } from '../../shared/layout.js'
import { createBoot } from '../character/boots'
import { RIG_HEIGHT } from '../character/blockyAvatar'
import { mergeByMaterial } from './geometry'
import { FONT_TITLE, canvasTexture, doorSign, drawLeaderboard, textPlane, textSprite } from './signs'
import { shade, spawnStarCanvas } from './textures'

const _spark = new Object3D()

const RAINBOW = ['#ff3b3b', '#ffb03b', '#fff03b', '#3bff6e', '#3bb5ff', '#a03bff']
const standard = (color, opts = {}) => new MeshStandardMaterial({ color, roughness: 0.6, ...opts })

function mesh(geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = shadow
  return m
}

/** Replaces a sprite's canvas text (labels that change: prices, owned...). */
function relabel(holder, lines, opts) {
  const old = holder.sprite
  const sprite = textSprite(lines, opts)
  sprite.position.copy(old.position)
  holder.group.add(sprite)
  holder.group.remove(old)
  old.material.map.dispose()
  old.material.dispose()
  holder.sprite = sprite
}

/* ---------------------------------------------------------------------------
 * Boot pedestals: a pair of boots spinning over a glowing ring, with a label.
 * ------------------------------------------------------------------------- */

const BOOT_DISPLAY_SCALE = (5 / RIG_HEIGHT) * 2.1

export function buildBootStand(stand) {
  const def = BOOT_BY_ID[stand.boot]
  const group = new Group()
  group.position.set(stand.pos[0], stand.pos[1], stand.pos[2])

  const ringColor = def.glow && def.glow !== 'rainbow' ? def.glow : def.accent
  const ring = mesh(new TorusGeometry(2.6, 0.18, 8, 36), new MeshBasicMaterial({ color: ringColor, toneMapped: false }), 0, 0.12, 0, false)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const glow = mesh(new CircleGeometry(2.6, 32), new MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }), 0, 0.06, 0, false)
  glow.rotation.x = -Math.PI / 2
  group.add(glow)

  const pair = new Group()
  for (const side of [1, -1]) {
    const boot = createBoot(def.id, side)
    boot.group.position.x = side * 0.95
    for (const flame of boot.flames) flame.scale.setScalar(0.8)
    pair.add(boot.group)
  }
  // A pair is ~20 little meshes: merge them into one per material.
  mergeByMaterial(pair)
  pair.position.y = 2.2
  pair.scale.setScalar(BOOT_DISPLAY_SCALE)
  group.add(pair)

  const holder = { group, sprite: textSprite([{ text: ' ', size: 20 }], { height: 1 }), state: '' }
  holder.sprite.position.y = 7.4
  group.add(holder.sprite)

  return {
    group,
    def,
    /** state: 'equipped' | 'owned' | 'buy' | 'poor' | 'soldout'; `left` for limited boots. */
    setState(state, left) {
      const key = `${state}:${left ?? ''}`
      if (key === holder.state) return
      holder.state = key
      const lines = []
      if (def.limited) lines.push({ text: `[LIMITED] ${formatNumber(left ?? 0)}/${def.limited} LEFT`, size: 34, fill: '#ff5a7a' })
      lines.push({ text: `+${formatNumber(def.rate)} Jump/s`, size: 64, fill: ['#ffffff', '#d6ecff'] })
      if (state === 'equipped') lines.push({ text: 'EQUIPPED ✓', size: 40, fill: '#7dff8a' })
      else if (state === 'owned') lines.push({ text: 'OWNED · Press E', size: 38, fill: '#9fe3ff' })
      else if (state === 'soldout') lines.push({ text: 'SOLD OUT', size: 40, fill: '#ff7a7a' })
      else lines.push({ text: def.price ? `🏆 ${formatNumber(def.price)} Wins` : 'FREE', size: 42, fill: state === 'poor' ? '#ff9a9a' : '#ffd23a' })
      lines.push({ text: def.name, size: 32, fill: '#ffffff' })
      relabel(holder, lines, { height: def.limited ? 6.2 : 5.2 })
    },
    update(t) {
      pair.rotation.y = t * 0.9
      pair.position.y = 2.2 + Math.sin(t * 2 + stand.pos[2]) * 0.25
      ring.rotation.z = t * 0.5
    },
  }
}

/* ---------------------------------------------------------------------------
 * Trampolines
 * ------------------------------------------------------------------------- */

function bedTexture(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  const fill = (c) => {
    if (c !== 'rainbow') return c
    const grad = g.createConicGradient(0, 128, 128)
    RAINBOW.forEach((col, i) => grad.addColorStop(i / RAINBOW.length, col))
    grad.addColorStop(1, RAINBOW[0])
    return grad
  }
  g.fillStyle = '#1d2233'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = fill(color)
  g.beginPath()
  g.arc(128, 128, 126, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(20,24,40,0.85)'
  g.beginPath()
  g.arc(128, 128, 96, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.18)'
  g.lineWidth = 3
  for (let r = 24; r < 96; r += 18) {
    g.beginPath()
    g.arc(128, 128, r, 0, Math.PI * 2)
    g.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function buildTrampoline(t) {
  const def = TRAMPOLINE_BY_ID[t.id]
  const color = def.color === 'rainbow' ? '#ff6ef7' : def.color
  const group = new Group()
  group.position.set(t.center[0], 0, t.center[1])
  const frame = standard('#3a3f52', { metalness: 0.3 })
  const rimColor = def.color === 'rainbow' ? '#ffffff' : color
  const body = new Group()
  const rim = mesh(new TorusGeometry(TRAMP_RADIUS - 0.15, 0.32, 10, 40), standard(rimColor, { emissive: rimColor, emissiveIntensity: 0.25 }), 0, TRAMP_TOP - 0.15, 0)
  rim.rotation.x = Math.PI / 2
  body.add(rim)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    body.add(mesh(new CylinderGeometry(0.16, 0.2, TRAMP_TOP, 6), frame, Math.cos(a) * (TRAMP_RADIUS - 0.4), TRAMP_TOP / 2, Math.sin(a) * (TRAMP_RADIUS - 0.4)))
  }
  const bed = mesh(new CircleGeometry(TRAMP_RADIUS - 0.3, 40), new MeshStandardMaterial({ map: bedTexture(def.color), roughness: 0.5 }), 0, TRAMP_TOP - 0.1, 0)
  bed.rotation.x = -Math.PI / 2
  body.add(bed)
  group.add(mergeByMaterial(body, { castShadow: true }))

  // Effect: a glowing column for the higher multipliers.
  const fxColor = new Color(color)
  const column = mesh(
    new CylinderGeometry(TRAMP_RADIUS - 0.6, TRAMP_RADIUS - 0.2, 7, 24, 1, true),
    new MeshBasicMaterial({ color: fxColor, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    0,
    TRAMP_TOP + 3.5,
    0,
    false,
  )
  column.visible = def.mult > 1
  group.add(column)
  // Sparks rising round the bed: one instanced mesh.
  const SPARKS = def.mult > 1 ? 10 : 0
  const sparks = SPARKS ? new InstancedMesh(new BoxGeometry(0.28, 0.28, 0.28), new MeshBasicMaterial({ color: fxColor, toneMapped: false }), SPARKS) : null
  if (sparks) {
    sparks.frustumCulled = false
    if (def.color === 'rainbow') for (let i = 0; i < SPARKS; i += 1) sparks.setColorAt(i, new Color().setHSL(i / SPARKS, 0.9, 0.6))
    group.add(sparks)
  }

  const holder = { group, sprite: textSprite([{ text: ' ', size: 20 }], { height: 1 }), state: '' }
  holder.sprite.position.y = 9.2
  group.add(holder.sprite)

  return {
    group,
    setState(state) {
      if (state === holder.state) return
      holder.state = state
      const fill = def.color === 'rainbow' ? ['#ff6ef7', '#ffd23a', '#3bffb0'] : [shade(color, 0.5), color]
      const lines = [{ text: `${multLabel(def.mult)} Jump`, size: 70, font: FONT_TITLE, weight: 400, fill, strokeWidth: 10 }]
      if (state === 'owned') lines.push({ text: def.price ? 'UNLOCKED ✓' : 'FREE', size: 38, fill: '#7dff8a' })
      else lines.push({ text: `🔒 🏆 ${formatNumber(def.price)} · Press E`, size: 36, fill: state === 'poor' ? '#ff9a9a' : '#ffd23a' })
      relabel(holder, lines, { height: 4.2 })
      column.material.opacity = state === 'owned' ? 0.12 : 0.04
    },
    update(t) {
      if (!sparks) return
      column.rotation.y = t * 0.6
      for (let i = 0; i < SPARKS; i += 1) {
        const phase = i / SPARKS
        const k = (t * 0.45 + phase) % 1
        const a = phase * Math.PI * 2 + t * (def.fx === 'lightning' ? 3 : 1.2)
        const r = TRAMP_RADIUS - 0.8 - k * 1.5
        _spark.position.set(Math.cos(a) * r, TRAMP_TOP + k * 8, Math.sin(a) * r)
        _spark.scale.setScalar(1 - k * 0.8)
        _spark.rotation.set(t * 3 + i, t * 2, 0)
        _spark.updateMatrix()
        sparks.setMatrixAt(i, _spark.matrix)
      }
      sparks.instanceMatrix.needsUpdate = true
    },
  }
}

/* ---------------------------------------------------------------------------
 * Lobby features
 * ------------------------------------------------------------------------- */

function swirlTexture(inner, mid, outer) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.4, mid)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 10
  for (let arm = 0; arm < 4; arm += 1) {
    g.beginPath()
    for (let i = 0; i < 60; i += 1) {
      const a = arm * (Math.PI / 2) + i * 0.09
      const r = i * 2.1
      g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r)
    }
    g.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** The pink "TELEPORT STAGE CHECKPOINT" arch from the original, facing +Z. */
export function buildCheckpointDoor(door) {
  const group = new Group()
  group.position.set(door.pos[0], door.pos[1], door.pos[2])
  const pink = standard('#ff8fd8', { emissive: '#ff5fc0', emissiveIntensity: 0.15 })
  const stone = standard('#9aa1b5')
  for (const x of [-5.6, 5.6]) group.add(mesh(new BoxGeometry(1.6, 10, 1.6), stone, x, 5, 0))
  const arch = mesh(new TorusGeometry(5.6, 0.85, 10, 28, Math.PI), stone, 0, 10, 0)
  group.add(arch)
  const portal = new Mesh(
    new PlaneGeometry(9.6, 15),
    new MeshBasicMaterial({ map: swirlTexture('#ffffff', '#ff8fd8', '#a8238a'), transparent: true, opacity: 0.92, toneMapped: false }),
  )
  portal.position.set(0, 7.5, 0.1)
  group.add(portal)
  const sign = textPlane(
    [
      { text: 'TELEPORT', size: 70, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#ffd6f0'] },
      { text: 'STAGE CHECKPOINT', size: 46, fill: '#ffffff' },
    ],
    { height: 3.4, background: '#ff5fb0', border: '#ffffff', padding: 16, radius: 18 },
  )
  sign.position.set(0, 17.2, 0.4)
  group.add(sign)
  group.add(mesh(new BoxGeometry(12.4, 0.4, 3), pink, 0, 0.2, 1.2))
  return {
    group,
    update(t) {
      portal.material.map.rotation = t * 0.8
      portal.material.map.center.set(0.5, 0.5)
    },
  }
}

/** A little booth with a swirl of ribbons: "TRAILS — Press E". */
export function buildTrailsStand(stand) {
  const group = new Group()
  group.position.set(stand.pos[0], stand.pos[1], stand.pos[2])
  const wood = standard('#ffe2b8')
  const roof = standard('#b98bff')
  group.add(mesh(new BoxGeometry(8, 3, 6), wood, 0, 1.5, 0))
  group.add(mesh(new BoxGeometry(8.4, 0.4, 6.4), standard('#ffffff'), 0, 3.1, 0))
  for (const x of [-3.7, 3.7]) group.add(mesh(new BoxGeometry(0.5, 4.5, 0.5), wood, x, 5.4, -2.6))
  const top = mesh(new ConeGeometry(5.6, 2.4, 4), roof, 0, 8.6, -0.4)
  top.rotation.y = Math.PI / 4
  group.add(top)
  const ribbons = new Group()
  ribbons.position.set(0, 5.2, 0)
  RAINBOW.forEach((color, i) => {
    const r = mesh(new TorusGeometry(1.1 + i * 0.12, 0.1, 6, 24), new MeshBasicMaterial({ color, toneMapped: false }), 0, 0, 0, false)
    r.rotation.set(i * 0.5, i * 0.9, 0)
    ribbons.add(r)
  })
  group.add(ribbons)
  const sign = textSprite([{ text: '✨ TRAILS', size: 70, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#e2c9ff'] }, { text: 'Press E', size: 34, fill: '#ffd23a' }], { height: 3.6 })
  sign.position.set(0, 11.4, 0)
  group.add(sign)
  return {
    group,
    update(t) {
      ribbons.rotation.y = t * 1.2
      ribbons.rotation.x = Math.sin(t) * 0.3
    },
  }
}

/** The free chest: gold, wobbling when it's ready, with a countdown above. */
export function buildChest(chest) {
  const group = new Group()
  group.position.set(chest.pos[0], chest.pos[1], chest.pos[2])
  const gold = standard('#ffc933', { metalness: 0.35, roughness: 0.35, emissive: '#6b4500', emissiveIntensity: 0.25 })
  const wood = standard('#a8622e')
  const body = new Group()
  body.add(mesh(new BoxGeometry(4.2, 2.2, 3), wood, 0, 1.1, 0))
  const lid = mesh(new CylinderGeometry(1.5, 1.5, 4.2, 14, 1, false, 0, Math.PI), wood, 0, 2.2, 0)
  lid.rotation.z = Math.PI / 2
  body.add(lid)
  for (const x of [-1.6, 1.6]) body.add(mesh(new BoxGeometry(0.4, 3.8, 3.1), gold, x, 1.9, 0))
  body.add(mesh(new BoxGeometry(0.8, 0.9, 0.3), gold, 0, 1.9, 1.55))
  group.add(body)
  const holder = { group, sprite: textSprite([{ text: ' ', size: 20 }], { height: 1 }), state: '' }
  holder.sprite.position.y = 6.2
  group.add(holder.sprite)
  return {
    group,
    setState(text, ready) {
      const key = `${text}:${ready}`
      if (key === holder.state) return
      holder.state = key
      relabel(holder, [{ text: 'FREE CHEST', size: 54, font: FONT_TITLE, weight: 400, fill: ['#fff6c4', '#ffb81f'] }, { text, size: 40, fill: ready ? '#7dff8a' : '#ffffff' }], { height: 3.6 })
      holder.ready = ready
    },
    update(t) {
      body.rotation.z = holder.ready ? Math.sin(t * 9) * 0.06 * Math.max(0, Math.sin(t * 1.4)) : 0
    },
  }
}

/** A leaderboard on two legs, its panel redrawn when new top-10 lists arrive. */
export function buildLeaderboard(board) {
  const group = new Group()
  group.position.set(board.pos[0], board.pos[1], board.pos[2])
  group.rotation.y = board.rotY
  const frame = standard(board.color, { roughness: 0.65 })
  const dark = standard(shade(board.color, -0.35), { roughness: 0.7 })
  group.add(mesh(new BoxGeometry(1.6, 4, 1.6), dark, -4.5, 2, 0))
  group.add(mesh(new BoxGeometry(1.6, 4, 1.6), dark, 4.5, 2, 0))
  group.add(mesh(new BoxGeometry(15, 17.6, 1.3), frame, 0, 12.6, 0))
  group.add(mesh(new BoxGeometry(16.2, 1.4, 2), dark, 0, 4.2, 0))
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 880
  const texture = canvasTexture(canvas)
  const panel = new Mesh(new PlaneGeometry(13.2, 16.1), new MeshBasicMaterial({ map: texture }))
  panel.position.set(0, 12.7, 0.67)
  group.add(panel)
  const title = textSprite([{ text: board.title, size: 96, font: FONT_TITLE, weight: 400, fill: [shade(board.color, 0.55), board.color], strokeWidth: 12 }], { height: 4.2 })
  title.position.set(0, 24.2, 0)
  group.add(title)
  const update = (data) => {
    drawLeaderboard(canvas, board, data?.[board.stat] || [])
    texture.needsUpdate = true
  }
  update(null)
  return { group, update }
}

/** The star painted on the spawn pad, spinning slowly. */
export function buildSpawnDecal(spawn) {
  const texture = new CanvasTexture(spawnStarCanvas())
  texture.colorSpace = SRGBColorSpace
  const decal = new Mesh(new PlaneGeometry(13, 13), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))
  decal.rotation.x = -Math.PI / 2
  decal.position.set(spawn.x, 0.22, spawn.z)
  decal.receiveShadow = true
  return {
    group: decal,
    update(t) {
      decal.rotation.z = t * 0.15
    },
  }
}

/** "ESCAPE ➜" over the lobby's front gate. */
export function buildGateSign(sign) {
  const plane = textPlane(
    [
      { text: 'ESCAPE!', size: 120, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#ffd6f0'], strokeWidth: 14 },
      { text: 'Stage 1 this way ➜', size: 48, fill: '#ffd23a' },
    ],
    { height: 5.6, background: '#ff5fb0', border: '#ffffff', padding: 20, radius: 26 },
  )
  // Readable from the lobby side.
  plane.position.set(sign.pos[0], sign.pos[1], sign.pos[2] + 2.2)
  return plane
}

/* ---------------------------------------------------------------------------
 * Course features
 * ------------------------------------------------------------------------- */

/** A force field across the corridor that opens at enough rebirths. */
export function buildRebirthDoor(door, halfWidth) {
  const group = new Group()
  group.position.set(0, door.y, door.z)
  const height = 42
  const material = new MeshBasicMaterial({ color: '#d36bff', transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false })
  const field = new Mesh(new PlaneGeometry(halfWidth * 2, height, 1, 1), material)
  field.position.y = height / 2
  group.add(field)
  const bars = new MeshBasicMaterial({ color: '#f3c9ff', toneMapped: false })
  for (let i = -3; i <= 3; i += 1) {
    const bar = mesh(new BoxGeometry(0.25, height, 0.25), bars, (i / 3.4) * halfWidth, height / 2, 0, false)
    group.add(bar)
  }
  group.add(mesh(new BoxGeometry(halfWidth * 2, 0.6, 1.2), new MeshBasicMaterial({ color: '#f3c9ff', toneMapped: false }), 0, height, 0, false))
  const sign = doorSign(door.rebirths)
  sign.position.set(0, 9, 0.3)
  group.add(sign)
  const back = doorSign(door.rebirths)
  back.position.set(0, 9, -0.3)
  back.rotation.y = Math.PI
  group.add(back)
  let open = null
  return {
    group,
    setOpen(isOpen) {
      if (isOpen === open) return
      open = isOpen
      material.color.set(isOpen ? '#4dff9a' : '#d36bff')
      bars.color.set(isOpen ? '#c9ffe0' : '#f3c9ff')
      material.opacity = isOpen ? 0.12 : 0.32
      sign.visible = back.visible = !isOpen
    },
    update(t) {
      material.opacity = (open ? 0.1 : 0.26) + Math.sin(t * 3 + door.z * 0.01) * 0.05
    },
  }
}

/** The trophy at the very end. */
export function buildTrophy(pos) {
  const group = new Group()
  group.position.set(pos[0], pos[1], pos[2])
  const gold = standard('#ffc933', { metalness: 0.5, roughness: 0.3, emissive: '#8a5a00', emissiveIntensity: 0.35 })
  group.add(mesh(new BoxGeometry(8, 2, 8), standard('#ffffff'), 0, 1, 0))
  group.add(mesh(new CylinderGeometry(1.2, 2.2, 4, 16), gold, 0, 4, 0))
  group.add(mesh(new CylinderGeometry(5, 2.2, 7, 24, 1, true), gold, 0, 9.5, 0))
  for (const side of [-1, 1]) {
    const handle = mesh(new TorusGeometry(2, 0.5, 8, 18, Math.PI), gold, side * 5, 10, 0)
    handle.rotation.z = side * -Math.PI / 2
    group.add(handle)
  }
  const star = mesh(new SphereGeometry(1.2, 12, 10), new MeshBasicMaterial({ color: '#fff6c4', toneMapped: false }), 0, 15, 0, false)
  group.add(star)
  return {
    group,
    update(t) {
      group.rotation.y = t * 0.4
      star.position.y = 15 + Math.sin(t * 2) * 0.6
    },
  }
}

/** A low-poly shark circling in the lava (Shark Bay). */
export function buildShark(shark) {
  const group = new Group()
  const body = standard('#4f6f9a', { roughness: 0.5 })
  const belly = standard('#e8eef6')
  const fish = new Group()
  const torso = mesh(new SphereGeometry(1.6, 12, 8), body)
  torso.scale.set(1, 1, 3)
  fish.add(torso)
  const under = mesh(new SphereGeometry(1.45, 12, 8), belly, 0, -0.35, 0.2)
  under.scale.set(0.9, 0.7, 2.6)
  fish.add(under)
  const fin = mesh(new ConeGeometry(0.9, 2.6, 4), body, 0, 2, 0)
  fin.rotation.x = -0.4
  fish.add(fin)
  const tail = mesh(new ConeGeometry(1.2, 2.4, 4), body, 0, 0.4, -5.2)
  tail.rotation.x = -Math.PI / 2
  fish.add(tail)
  for (const side of [-1, 1]) {
    const eye = mesh(new SphereGeometry(0.22, 8, 6), new MeshBasicMaterial({ color: '#15151d' }), side * 1.05, 0.5, 3.4, false)
    fish.add(eye)
  }
  group.add(fish)
  return {
    group,
    update(t) {
      const a = shark.phase + t * shark.speed
      group.position.set(Math.cos(a) * shark.range, shark.y + 0.6 + Math.sin(t * 2 + shark.phase) * 0.4, shark.z + Math.sin(a) * shark.range * 0.6)
      // Face along the path (the fish's nose is +Z).
      group.rotation.y = Math.atan2(-Math.sin(a), 0.6 * Math.cos(a)) * Math.sign(shark.speed || 1)
      fish.rotation.z = Math.sin(t * 4 + shark.phase) * 0.12
    },
  }
}
