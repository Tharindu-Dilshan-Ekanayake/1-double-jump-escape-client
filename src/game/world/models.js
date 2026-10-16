import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'

import { BOOTS, BOOT_BY_ID, EGG_BY_ID, PAD_BY_ID, RARITIES, WORLD_BY_ID, formatNumber } from '../../shared/gameData.js'
import { burst } from '../burst'
import { bootMaterials, createBoot } from '../character/boots'
import { RIG_HEIGHT } from '../character/blockyAvatar'
import { SHARK_LENGTH, sharkState } from '../hazards'
import { mergeByMaterial, mergeColored } from './geometry'
import { FONT_TITLE, canvasTexture, doorSign, drawLeaderboard, stageTitleSign, textPlane, textSprite } from './signs'
import { shade, spawnSunCanvas } from './textures'

const RAINBOW = ['#ff3b3b', '#ffb03b', '#fff03b', '#3bff6e', '#3bb5ff', '#a03bff']
const standard = (color, opts = {}) => new MeshStandardMaterial({ color, roughness: 0.6, ...opts })
/** Every egg's shell (its colours baked into the vertices). */
const EGG_SHELL_MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })

function mesh(geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = shadow
  return m
}

/** Replaces a sprite's canvas text (labels that change: prices, owned...). */
const _labelAt = new Vector3()
const clamp01 = (v) => Math.max(0, Math.min(1, v))
/**
 * Labels fade with the camera's distance: out as it comes close (`near` =
 * [gone, full], so a label over a spot you stand on doesn't fill the screen)
 * and, with `far` = [full, gone], out in the distance (rows of labels don't
 * pile up from across the lobby).
 */
function fadeNear(sprite, [near0, near1], far) {
  sprite.onBeforeRender = (renderer, scene, camera) => {
    sprite.getWorldPosition(_labelAt)
    const d = camera.position.distanceTo(_labelAt)
    sprite.material.opacity = clamp01((d - near0) / (near1 - near0)) * (far ? clamp01((far[1] - d) / (far[1] - far[0])) : 1)
  }
}

function relabel(holder, lines, opts) {
  const old = holder.sprite
  const sprite = textSprite(lines, opts)
  if (holder.fadeNear) fadeNear(sprite, holder.fadeNear, holder.fadeFar)
  sprite.position.copy(old.position)
  holder.group.add(sprite)
  holder.group.remove(old)
  old.material.map.dispose()
  old.material.dispose()
  holder.sprite = sprite
}

/* ---------------------------------------------------------------------------
 * Boot pedestals: a white marble stand with a gold rim, the pair spinning
 * over it, a ring that says where you stand with them (green: yours, gold:
 * the next to buy, grey: buy the ones before first) and a label: name, what
 * they give, the stages they open, the price.
 * ------------------------------------------------------------------------- */

const BOOT_DISPLAY_SCALE = (5 / RIG_HEIGHT) * 2.1
const RING_COLORS = { equipped: '#3ff07a', owned: '#3ff07a', buy: '#ffd23a', poor: '#ffb35a', locked: '#9aa3b2', soldout: '#9aa3b2' }

/**
 * `props`: the lobby's merged props (geometry.js Props). The pedestal never
 * moves, so it goes in there with everything else: one draw call for every
 * stand's pedestal instead of four each.
 */
export function buildBootStand(stand, props) {
  const def = BOOT_BY_ID[stand.boot]
  const group = new Group()
  group.position.set(stand.pos[0], stand.pos[1], stand.pos[2])

  const [x, y, z] = stand.pos
  props.cylinder('#dfe8f6', [x, y + 0.15, z], 2.6, 2.9, 0.3, { segments: 28 })
  props.cylinder('#ffffff', [x, y + 0.85, z], 2.1, 2.3, 1.1, { segments: 28 })
  props.cylinder('#ffc933', [x, y + 1.45, z], 2.45, 2.45, 0.22, { segments: 28 })
  // The tier's colour on a gem at the front of the stand (facing the plaza, +X).
  props.sphere(def.glow && def.glow !== 'rainbow' ? def.glow : def.color === '#ffffff' ? def.accent : def.color, [x + 2.15, y + 0.85, z], 0.42, { segments: 12, rings: 10, scale: [0.5, 1, 1] })

  const ringMaterial = new MeshBasicMaterial({ color: RING_COLORS.locked, toneMapped: false })
  const ring = mesh(new TorusGeometry(2.05, 0.13, 8, 40), ringMaterial, 0, 1.6, 0, false)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const glow = mesh(new CircleGeometry(2.05, 32), new MeshBasicMaterial({ color: RING_COLORS.locked, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }), 0, 1.58, 0, false)
  glow.rotation.x = -Math.PI / 2
  group.add(glow)

  const pair = new Group()
  for (const side of [1, -1]) {
    const boot = createBoot(def.id, side)
    boot.group.position.x = side * 0.95
    for (const flame of boot.flames) flame.scale.setScalar(0.8)
    pair.add(boot.group)
  }
  // Both boots into one lit and one glowing mesh.
  mergeColored(pair, bootMaterials(def.id))
  pair.position.y = 3.6
  pair.scale.setScalar(BOOT_DISPLAY_SCALE)
  group.add(pair)

  const holder = { group, sprite: textSprite([{ text: ' ', size: 20 }], { height: 1 }), state: '', fadeNear: [4, 9], fadeFar: [30, 44] }
  // Every other label sits higher, so neighbours don't overlap.
  holder.sprite.position.y = stand.tier % 2 ? 11.8 : 8.8
  group.add(holder.sprite)
  let pulse = false

  return {
    group,
    def,
    /** state: 'equipped' | 'owned' | 'buy' | 'poor' | 'locked' | 'soldout'; `left` for limited boots. */
    setState(state, left) {
      const key = `${state}:${left ?? ''}`
      if (key === holder.state) return
      holder.state = key
      ringMaterial.color.set(RING_COLORS[state] ?? RING_COLORS.locked)
      glow.material.color.set(RING_COLORS[state] ?? RING_COLORS.locked)
      pulse = state === 'buy'
      const accent = def.glow && def.glow !== 'rainbow' ? def.glow : def.accent === '#ffffff' ? def.color : def.accent
      const lines = []
      if (def.limited) lines.push({ text: `[LIMITED] ${formatNumber(left ?? 0)}/${def.limited} LEFT`, size: 32, fill: '#ff5a7a' })
      lines.push({ text: def.name, size: 52, font: FONT_TITLE, weight: 400, fill: ['#ffffff', shade(accent, 0.25)], strokeWidth: 10 })
      lines.push({ text: `x${formatNumber(def.mult)} XP · ⚡${def.speed}`, size: 38, fill: '#ffffff' })
      lines.push(def.stages ? { text: `Stages ${def.stages[0]}-${def.stages[1]}`, size: 34, fill: '#9fe3ff' } : { text: 'The legendary flex!', size: 34, fill: '#9fe3ff' })
      if (state === 'equipped') lines.push({ text: 'WEARING ✓', size: 38, fill: '#7dff8a' })
      else if (state === 'owned') lines.push({ text: 'OWNED · E to wear', size: 34, fill: '#7dff8a' })
      else if (state === 'soldout') lines.push({ text: 'SOLD OUT', size: 38, fill: '#ff7a7a' })
      else if (state === 'locked') lines.push({ text: '🔒 Buy the pair before', size: 32, fill: '#c3cad6' })
      else lines.push({ text: def.price ? `🏆 ${formatNumber(def.price)} · Press E` : 'FREE', size: 38, fill: state === 'poor' ? '#ffb35a' : '#ffd23a' })
      relabel(holder, lines, { height: def.limited ? 5.4 : 4.6 })
    },
    update(t) {
      pair.rotation.y = t * 0.9
      pair.position.y = 3.6 + Math.sin(t * 2 + stand.pos[2]) * 0.25
      ring.rotation.z = t * 0.5
      const k = pulse ? 1 + Math.sin(t * 5) * 0.06 : 1
      ring.scale.setScalar(k)
      glow.material.opacity = pulse ? 0.22 + Math.sin(t * 5) * 0.12 : 0.18
    },
  }
}

/* ---------------------------------------------------------------------------
 * Jump pads: a square trampoline in its tier's colour with springs under the
 * corners, a dark mat with a glowing ring and arrows rising up it. Locked
 * ones sit dim with what they need: their price in Wins, or rebirths.
 * ------------------------------------------------------------------------- */

function arrowsTexture(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')
  g.clearRect(0, 0, 128, 128)
  g.fillStyle = color
  // Two chevrons pointing up the texture (towards +V).
  for (const cy of [26, 90]) {
    g.beginPath()
    g.moveTo(64, cy - 18)
    g.lineTo(100, cy + 18)
    g.lineTo(84, cy + 18)
    g.lineTo(64, cy - 2)
    g.lineTo(44, cy + 18)
    g.lineTo(28, cy + 18)
    g.closePath()
    g.fill()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapT = RepeatWrapping
  return texture
}

/** `props`: the lobby's merged props; the pad's base, frame, springs and mat go in there (they never move). */
export function buildJumpPad(pad, props) {
  const def = PAD_BY_ID[pad.id]
  const rainbow = def.color === 'rainbow'
  const color = rainbow ? '#ff6ef7' : def.color
  const half = pad.half
  const top = pad.top
  const group = new Group()
  group.position.set(pad.center[0], 0, pad.center[1])

  const [cx, cz] = pad.center
  props.box('#ffffff', [cx, 0.25, cz], [half * 2, 0.5, half * 2])
  // The frame round the mat, and a spring under each corner.
  for (const [w, d, x, z] of [
    [half * 2, 0.9, 0, half - 0.45],
    [half * 2, 0.9, 0, -half + 0.45],
    [0.9, half * 2, half - 0.45, 0],
    [0.9, half * 2, -half + 0.45, 0],
  ]) {
    props.box(color, [cx + x, top - 0.35, cz + z], [w, 0.7, d])
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        props.torus('#d6dbe4', [cx + sx * (half - 1.4), 0.62 + k * 0.16, cz + sz * (half - 1.4)], 0.32, 0.08, { radialSegments: 6, tubularSegments: 12, rot: [Math.PI / 2, 0, 0] })
      }
    }
  }
  const matSize = half * 2 - 1.8
  props.box('#1d2233', [cx, top - 0.2, cz], [matSize, 0.3, matSize])
  const ringMaterial = new MeshBasicMaterial({ color, toneMapped: false })
  const ring = mesh(new TorusGeometry(matSize * 0.36, 0.14, 8, 40), ringMaterial, 0, top + 0.02, 0, false)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const arrows = new Mesh(
    new PlaneGeometry(matSize * 0.5, matSize * 0.5),
    new MeshBasicMaterial({ map: arrowsTexture('#ffffff'), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  )
  arrows.rotation.x = -Math.PI / 2
  arrows.position.y = top + 0.04
  group.add(arrows)
  const beam = mesh(
    new CylinderGeometry(matSize * 0.36, matSize * 0.36, 6, 32, 1, true),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    0,
    top + 3,
    0,
    false,
  )
  group.add(beam)

  const holder = { group, sprite: textSprite([{ text: ' ', size: 20 }], { height: 1 }), state: '', fadeNear: [6, 13], fadeFar: [45, 62] }
  holder.sprite.position.y = top + 9
  group.add(holder.sprite)
  let open = false
  return {
    group,
    id: pad.id,
    /** `state`: the pad from the progression store ({ open, owned, affordable }). */
    setState(state) {
      const isOpen = Boolean(state?.open)
      const forSale = !isOpen && def.price > 0 && !state?.owned
      const key = `${isOpen}|${forSale}|${Boolean(state?.affordable)}`
      if (key === holder.state) return
      holder.state = key
      open = isOpen
      const fill = rainbow ? ['#ff6ef7', '#ffd23a', '#3bffb0'] : ['#ffffff', shade(color, 0.3)]
      const lines = [
        { text: def.name, size: 58, font: FONT_TITLE, weight: 400, fill, strokeWidth: 10 },
        { text: `🦘 ${def.rate} jumps a second`, size: 40, fill: '#ffffff' },
      ]
      if (isOpen) lines.push({ text: 'Stand on it to train (AFK)', size: 34, fill: '#7dff8a' })
      else if (forSale) lines.push({ text: `🏆 ${formatNumber(def.price)} Wins · Press E`, size: 38, fill: state?.affordable ? '#ffe36b' : '#ff9a9a' })
      else lines.push({ text: `🔒 Rebirth ${def.rebirths} time${def.rebirths > 1 ? 's' : ''}`, size: 36, fill: '#ff9a9a' })
      relabel(holder, lines, { height: 4 })
      ringMaterial.color.set(isOpen ? color : '#4a5064')
      beam.visible = isOpen
      arrows.material.opacity = isOpen ? 0.85 : 0.25
    },
    update(t) {
      if (!open) return
      arrows.material.map.offset.y = (t * 0.8) % 1
      const k = 1 + Math.sin(t * 6 + pad.center[0]) * 0.05
      ring.scale.setScalar(k)
      if (rainbow) ringMaterial.color.setHSL((t * 0.15) % 1, 0.85, 0.6)
      beam.material.opacity = 0.1 + Math.sin(t * 3 + pad.center[1]) * 0.04
    },
  }
}

/* ---------------------------------------------------------------------------
 * Pet eggs and the Wins Shop
 * ------------------------------------------------------------------------- */

/** A spotted egg on a pedestal, wobbling gently; "Press E to hatch" or locked. */
/** `props`: the lobby's merged props, for the stand's base. */
export function buildEggStand(stand, props) {
  const egg = EGG_BY_ID[stand.egg]
  const group = new Group()
  group.position.set(stand.pos[0], stand.pos[1], stand.pos[2])
  const [x, y, z] = stand.pos
  props.cylinder('#40457e', [x, y + 0.7, z], 2.6, 3, 1.4, { segments: 20 })
  props.torus(egg.color, [x, y + 1.45, z], 2.7, 0.18, { radialSegments: 8, tubularSegments: 30, rot: [Math.PI / 2, 0, 0], glow: true })
  const shell = new Group()
  const body = mesh(new SphereGeometry(1.9, 24, 18), standard(egg.color, { roughness: 0.45 }), 0, 0, 0)
  body.scale.set(1, 1.3, 1)
  shell.add(body)
  // Spots in the rarer pets' colours.
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.39
    const y = -0.8 + (i % 4) * 0.55
    const r = Math.sqrt(Math.max(0.2, 1 - (y / 2.5) ** 2)) * 1.9
    const spot = mesh(new SphereGeometry(0.34, 10, 8), standard(RARITIES[2 + (i % 4)].color), Math.cos(a) * r, y, Math.sin(a) * r, false)
    spot.scale.set(1, 1, 0.35)
    spot.lookAt(0, y, 0)
    shell.add(spot)
  }
  shell.position.y = 4.1
  // The egg and its spots: one mesh (the colours baked in).
  mergeColored(shell, { lit: EGG_SHELL_MATERIAL, glow: EGG_SHELL_MATERIAL })
  group.add(shell)
  const holder = { group, sprite: textSprite([{ text: ' ', size: 20 }], { height: 1 }), state: '' }
  holder.sprite.position.y = 8.9
  group.add(holder.sprite)
  return {
    group,
    /** state: 'buy' | 'poor' | 'locked' */
    setState(state) {
      if (state === holder.state) return
      holder.state = state
      const lines = [{ text: egg.name, size: 58, font: FONT_TITLE, weight: 400, fill: ['#ffffff', shade(egg.color === '#fff4dc' ? '#ffd23a' : egg.color, 0.2)], strokeWidth: 10 }]
      if (state === 'locked') lines.push({ text: `🔒 Rebirth ${egg.rebirths} time${egg.rebirths > 1 ? 's' : ''}`, size: 36, fill: '#ff9a9a' })
      else lines.push({ text: `🏆 ${formatNumber(egg.price)} · Press E`, size: 38, fill: state === 'poor' ? '#ff9a9a' : '#ffd23a' })
      relabel(holder, lines, { height: 4 })
    },
    update(t) {
      shell.rotation.y = t * 0.6
      shell.rotation.z = Math.sin(t * 2.4 + stand.pos[0]) * 0.08
    },
  }
}

/** The Wins Shop booth: "WINS SHOP · Press E". */
export function buildShopStand(stand) {
  const group = new Group()
  group.position.set(stand.pos[0], stand.pos[1], stand.pos[2])
  const body = new Group()
  const wood = standard('#2f9e55')
  const gold = standard('#ffc933', { metalness: 0.35, roughness: 0.35, emissive: '#6b4500', emissiveIntensity: 0.25 })
  body.add(mesh(new BoxGeometry(14, 3.2, 5), wood, 0, 1.6, 0))
  body.add(mesh(new BoxGeometry(14.4, 0.4, 5.4), gold, 0, 3.3, 0))
  for (const x of [-6.6, 6.6]) body.add(mesh(new BoxGeometry(0.6, 5, 0.6), gold, x, 5.8, 2))
  const roof = mesh(new BoxGeometry(15.4, 0.8, 6.6), standard('#3fd16b'), 0, 8.6, 0.6)
  roof.rotation.x = -0.18
  body.add(roof)
  // A big trophy on the counter.
  body.add(mesh(new CylinderGeometry(0.4, 0.8, 1.2, 12), gold, 0, 4, 0))
  body.add(mesh(new CylinderGeometry(1.4, 0.5, 1.8, 16, 1, true), gold, 0, 5.4, 0))
  group.add(mergeByMaterial(body, { castShadow: true }))
  const sign = textSprite(
    [
      { text: '🏆 WINS SHOP', size: 72, font: FONT_TITLE, weight: 400, fill: ['#fff6c4', '#ffb81f'], strokeWidth: 12 },
      { text: 'Permanent upgrades · Press E', size: 36, fill: '#ffffff' },
    ],
    { height: 4.4 },
  )
  sign.position.set(0, 12.4, 0)
  group.add(sign)
  return { group, update() {} }
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

const WORLD_DOOR_LOOKS = {
  1: { frame: '#2f6bff', swirl: ['#ffffff', '#8fd8ff', '#1f4fd6'], sign: '#2f6bff' },
  2: { frame: '#5b2bd9', swirl: ['#ffffff', '#c9a2ff', '#3a1488'], sign: '#7a3bff' },
}

/**
 * A door to another world, like the checkpoint door but gold and violet (or
 * blue, back to World 1). Locked, its portal goes dark and the sign says how
 * many rebirths it takes. Built facing +Z, then turned by `rotY`.
 */
export function buildWorldDoor(door) {
  const world = WORLD_BY_ID[door.world]
  const look = WORLD_DOOR_LOOKS[door.world] ?? WORLD_DOOR_LOOKS[2]
  const group = new Group()
  group.position.set(door.pos[0], door.pos[1], door.pos[2])
  group.rotation.y = door.rotY ?? 0
  const gold = standard('#ffc933', { metalness: 0.35, roughness: 0.35, emissive: '#6b4500', emissiveIntensity: 0.25 })
  const frame = standard(look.frame)
  for (const x of [-5.6, 5.6]) group.add(mesh(new BoxGeometry(1.8, 10.4, 1.8), frame, x, 5.2, 0))
  group.add(mesh(new TorusGeometry(5.6, 0.95, 10, 28, Math.PI), gold, 0, 10, 0))
  for (const x of [-5.6, 5.6]) group.add(mesh(new BoxGeometry(2.4, 0.6, 2.4), gold, x, 0.3, 0))
  const portal = new Mesh(
    new PlaneGeometry(9.6, 15),
    new MeshBasicMaterial({ map: swirlTexture(...look.swirl), transparent: true, opacity: 0.92, toneMapped: false }),
  )
  portal.position.set(0, 7.5, 0.1)
  group.add(portal)
  const sign = (sub, subFill) =>
    textPlane(
      [
        { text: world.name.toUpperCase(), size: 74, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#ffe9a8'] },
        { text: sub, size: 44, fill: subFill },
      ],
      { height: 3.8, background: look.sign, border: '#ffd23a', padding: 16, radius: 18 },
    )
  const openSign = sign(door.world === 1 ? 'Back to the lobby · Press E' : 'Press E to enter!', '#ffffff')
  const lockedSign = sign(`🔒 ${door.rebirths} Rebirth${door.rebirths > 1 ? 's' : ''} needed`, '#ffd6ff')
  for (const s of [openSign, lockedSign]) {
    s.position.set(0, 17.6, 0.4)
    group.add(s)
  }
  group.add(mesh(new BoxGeometry(12.4, 0.4, 3), gold, 0, 0.2, 1.2))
  let open = null
  const setOpen = (isOpen) => {
    if (isOpen === open) return
    open = isOpen
    openSign.visible = isOpen
    lockedSign.visible = !isOpen
    portal.material.opacity = isOpen ? 0.92 : 0.35
    portal.material.color.set(isOpen ? '#ffffff' : '#5a5a6e')
  }
  setOpen(door.rebirths <= 0)
  return {
    group,
    setOpen,
    update(t) {
      portal.material.map.rotation = t * (open ? 0.8 : 0.15)
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

/** The black spiky sun painted on the spawn pad, turning slowly. */
export function buildSpawnDecal(spawn) {
  const texture = new CanvasTexture(spawnSunCanvas())
  texture.colorSpace = SRGBColorSpace
  const decal = new Mesh(new PlaneGeometry(13, 13), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))
  decal.rotation.x = -Math.PI / 2
  decal.position.set(spawn.x, 0.22, spawn.z)
  decal.receiveShadow = true
  return {
    group: decal,
    update(t) {
      decal.rotation.z = t * 0.06
    },
  }
}

/** "Stage N" over a world lobby's front gate, like every other doorway. */
export function buildGateSign(sign) {
  const plane = stageTitleSign(sign.text ?? 'Stage 1')
  plane.position.set(sign.pos[0], sign.pos[1], sign.pos[2])
  return plane
}

/* ---------------------------------------------------------------------------
 * Course features
 * ------------------------------------------------------------------------- */

/**
 * A force field across the course into a stage that needs new boots (gold)
 * or only more rebirths (violet), with what it needs written across it on
 * both sides. It opens (and goes faint green) once you have them.
 */
export function buildStageDoor(door) {
  const group = new Group()
  group.position.set(0, door.y, door.z)
  const halfWidth = door.halfWidth
  const height = door.height ?? 42
  const boot = BOOTS[door.boot]
  const shut = door.boot > 0 ? '#ffb81f' : '#d36bff'
  const material = new MeshBasicMaterial({ color: shut, transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false })
  const field = new Mesh(new PlaneGeometry(halfWidth * 2, height, 1, 1), material)
  field.position.y = height / 2
  group.add(field)
  const bars = new MeshBasicMaterial({ color: '#fff3c9', toneMapped: false })
  for (let i = -2; i <= 2; i += 1) group.add(mesh(new BoxGeometry(0.2, height, 0.2), bars, (i / 2.4) * halfWidth, height / 2, 0, false))
  group.add(mesh(new BoxGeometry(halfWidth * 2, 0.6, 1.2), bars, 0, height, 0, false))
  const text = { bootName: boot && door.boot > 0 ? boot.name : null, rebirths: door.rebirths }
  const sign = doorSign(text)
  // Fit the text inside the doorway.
  const fit = Math.min(1, (halfWidth * 2 - 1.5) / sign.geometry.parameters.width)
  sign.scale.setScalar(fit)
  sign.position.set(0, height * 0.42, 0.3)
  group.add(sign)
  const back = doorSign(text)
  back.scale.setScalar(fit)
  back.position.set(0, height * 0.42, -0.3)
  back.rotation.y = Math.PI
  group.add(back)
  // The boots it needs, spinning in the middle of the doorway.
  let pair = null
  if (boot && door.boot > 0) {
    pair = new Group()
    for (const side of [1, -1]) {
      const b = createBoot(boot.id, side)
      b.group.position.x = side * 0.95
      pair.add(b.group)
    }
    mergeColored(pair, bootMaterials(boot.id))
    pair.scale.setScalar(BOOT_DISPLAY_SCALE)
    pair.position.y = height * 0.78
    group.add(pair)
  }
  let open = null
  return {
    group,
    door,
    /** Open doors simply aren't there (the corridor is clear). */
    setOpen(isOpen) {
      if (isOpen === open) return
      open = isOpen
      // (The distance culler leaves hidden things hidden.)
      group.userData.hidden = isOpen
      group.visible = !isOpen
    },
    update(t) {
      if (open) return
      material.opacity = 0.26 + Math.sin(t * 3 + door.z * 0.01) * 0.05
      if (pair) pair.rotation.y = t * 1.2
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


/* ---------------------------------------------------------------------------
 * Sharks
 * ------------------------------------------------------------------------- */

/** A flat fin from a 2D outline (x along the body, y up), `thick` studs thick. */
function finGeometry(points, thick = 0.35) {
  const shape = new Shape()
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)))
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false })
  geometry.translate(0, 0, -thick / 2)
  return geometry
}

let sharkModel = null

/**
 * The shark from the original: navy back, white belly, a red outline, big
 * fins and an open mouth full of teeth. Built once (nose along +X,
 * SHARK_LENGTH long) and shared by every shark.
 */
function sharkTemplate() {
  if (sharkModel) return sharkModel
  const navy = standard('#2b4479', { roughness: 0.45 })
  const belly = standard('#eef2f8', { roughness: 0.5 })
  const dark = new MeshBasicMaterial({ color: '#3a0d14' })
  const white = new MeshBasicMaterial({ color: '#ffffff' })
  const black = new MeshBasicMaterial({ color: '#0e0f16' })
  const outline = new MeshBasicMaterial({ color: '#e3262f', side: BackSide })
  const half = SHARK_LENGTH / 2
  const fish = new Group()
  const outlined = []

  const body = mesh(new SphereGeometry(1, 22, 14), navy)
  body.scale.set(half, 2.1, 2)
  fish.add(body)
  outlined.push([body, 0.22])
  const under = mesh(new SphereGeometry(1, 22, 14), belly, 0.4, -0.62, 0)
  under.scale.set(half - 0.7, 1.55, 1.78)
  fish.add(under)

  const fin = (points, x, y, z, thick) => {
    const part = mesh(finGeometry(points, thick), navy, x, y, z)
    fish.add(part)
    outlined.push([part, 0.1])
    return part
  }
  fin([[1.4, 0], [-1.6, 0], [-2.2, 3.6]], 0.6, 1.6, 0)
  fin([[0.6, 0], [-1.4, 0.2], [-4, 4.6], [-2.4, 0.4]], -half + 1.2, 0.2, 0)
  fin([[0.6, 0], [-1.4, -0.2], [-3, -2.8], [-2.2, -0.3]], -half + 1.2, -0.1, 0)
  for (const side of [-1, 1]) {
    fin([[1.2, 0], [-1, 0], [-2.4, -2.6]], 2.2, -1, side * 1.5, 0.3).rotation.x = side * 0.9
    // Eye with a glint, and three gill slits.
    fish.add(mesh(new SphereGeometry(0.34, 10, 8), black, half - 2.4, 0.55, side * 1.42, false))
    fish.add(mesh(new SphereGeometry(0.11, 6, 5), white, half - 2.3, 0.68, side * 1.68, false))
    for (let g = 0; g < 3; g += 1) fish.add(mesh(new BoxGeometry(0.14, 1.3, 0.1), black, half - 4.4 - g * 0.55, -0.1, side * 1.86, false))
  }
  // The open mouth under the snout, lined with teeth.
  const mouth = mesh(new BoxGeometry(2.8, 0.55, 2.4), dark, half - 1.9, -0.95, 0, false)
  mouth.rotation.z = 0.18
  fish.add(mouth)
  for (let i = 0; i < 6; i += 1) {
    for (const side of [-1, 1]) {
      const tooth = mesh(new ConeGeometry(0.16, 0.45, 4), white, half - 0.9 - i * 0.42, -0.62 - i * 0.07, side * (0.55 + i * 0.12), false)
      tooth.rotation.x = Math.PI
      fish.add(tooth)
    }
  }
  // The red outline: each part again, a little bigger, drawn inside out.
  for (const [part, grow] of outlined) {
    const hull = new Mesh(part.geometry, outline)
    hull.position.copy(part.position)
    hull.rotation.copy(part.rotation)
    if (part === body) hull.scale.set(half + grow, 2.1 + grow, 2 + grow)
    else hull.scale.setScalar(1 + grow)
    fish.add(hull)
  }
  sharkModel = mergeByMaterial(fish, { castShadow: true })
  return sharkModel
}

const _splash = new Vector3()

/**
 * A shark leaping out of the lava (Shark Bay). It follows `sharkState` — the
 * same arc the hazard check uses — and splashes lava as it leaves and dives.
 */
export function buildShark(shark) {
  const group = new Group()
  const midX = (shark.x0 + shark.x1) / 2
  group.position.set(midX, shark.y, shark.z)
  const fish = sharkTemplate().clone()
  fish.scale.setScalar(shark.size)
  fish.visible = false
  group.add(fish)
  const state = {}
  let out = false
  return {
    group,
    update(t) {
      const s = sharkState(shark, t, state)
      fish.visible = Boolean(s)
      const above = Boolean(s) && s.y > shark.y - 2
      if (above !== out) {
        out = above
        // The distance culler hides far sharks: no splashes nobody sees.
        if (group.visible) burst(_splash.set(s ? s.x : midX, shark.y + 0.4, shark.z), { colors: ['#ffd25a', '#ff8a1c', '#ff5a12'], count: 24, speed: 9, up: 12, life: 0.9, gravity: 30, size: 1.6 })
      }
      if (!s) return
      fish.position.set(s.x - midX, s.y - shark.y, 0)
      // Nose along the arc; turn round (not upside down) when flying towards -X.
      fish.rotation.set(0, s.hx < 0 ? Math.PI : 0, Math.atan2(s.hy, Math.abs(s.hx)))
    },
  }
}
