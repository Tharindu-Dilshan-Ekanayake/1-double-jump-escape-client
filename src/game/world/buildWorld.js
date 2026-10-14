import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Sphere,
  SRGBColorSpace,
  Vector3,
} from 'three'

import { BOOT_BY_ID, TRAMPOLINE_BY_ID, formatNumber, parseList } from '../../shared/gameData.js'
import { CORRIDOR_HALF, THEMES, getLayout } from '../../shared/layout.js'
import { burst } from '../burst'
import { laserCharge, laserY, sweeperAngle } from '../hazards'
import { decorateLobby, decorateStage } from './decor'
import { GeoBatch, Props, worldBox, worldBoxSides, worldPlane } from './geometry'
import { animateMaterials, fallMaterial, glowMaterial, propsMaterial, riverMaterial, surfaceMaterial } from './materials'
import {
  buildBootStand,
  buildCheckpointDoor,
  buildChest,
  buildGateSign,
  buildLeaderboard,
  buildRebirthDoor,
  buildShark,
  buildSpawnDecal,
  buildTrailsStand,
  buildTrampoline,
  buildTrophy,
} from './models'
import { FONT_TITLE, climbWallSign, gapSign, recommendBoard, textPlane, textSprite } from './signs'
import { LIQUIDS, surfaceTile } from './textures'

const LASER_COLORS = { red: '#ff2a2a', yellow: '#ffdd1f', green: '#6bff3a', magenta: '#ff3af2' }

const TITLE_FILLS = {
  starter: ['#ffffff', '#a8f07a'],
  brick: ['#ffffff', '#f6d743'],
  lava: ['#ffe27a', '#ff4d1f'],
  desert: ['#fff1c4', '#e89a2a'],
  shark: ['#ffffff', '#7fc4ff'],
  ice: ['#ffffff', '#7fe0ff'],
  candy: ['#fff0fa', '#ff5fb8'],
  jungle: ['#e2ff9a', '#2f9e3a'],
  neon: ['#c9fffd', '#ff3df2'],
  volcano: ['#ffe27a', '#ff3a1f'],
  cloud: ['#ffffff', '#9fd8ff'],
  toxic: ['#eaff9a', '#5fe62b'],
  haunted: ['#e6d6ff', '#7a4dff'],
  crystal: ['#ffffff', '#b07bff'],
  factory: ['#ffffff', '#9aa3b2'],
  sakura: ['#ffffff', '#ff7ac8'],
  magma: ['#ffe27a', '#ff3a1f'],
  space: ['#e6f6ff', '#3dfffa'],
  galaxy: ['#ffd6ff', '#7a3bff'],
  golden: ['#fff6c4', '#ffb81f'],
}

/** A stage's deadly liquid: a flowing surface, and sides for where levels step. */
function addLiquid(batch, box) {
  const kind = box.mat.slice('liquid_'.length)
  const zone = `#${box.zone}`
  const tile = LIQUIDS[kind]?.tile ?? 24
  batch.add(`liquid:${kind}${zone}`, worldPlane(box.min[0], box.max[0], box.min[2], box.max[2], box.max[1], tile), riverMaterial(kind))
  batch.add(`liquidSide:${kind}${zone}`, worldBoxSides(box.min, box.max, 8), fallMaterial(kind))
}

/**
 * Builds the lobby and the course from the shared layout.
 *
 * Returns the root Object3D plus hooks: `update(t, dt, camera, me, hydraLeft)`
 * animates hazards, displays and liquids and keeps the lobby labels in step
 * with what you own; `updateLeaderboards(data)` redraws the boards.
 */
export function buildWorld() {
  const layout = getLayout()
  const root = new Group()
  root.name = 'world'
  const batch = new GeoBatch()
  const propsByZone = new Map()
  const props = (zone) => {
    if (!propsByZone.has(zone)) propsByZone.set(zone, new Props(batch, zone, propsMaterial, glowMaterial))
    return propsByZone.get(zone)
  }
  const animated = []

  // --- Static geometry, merged per material and stage.
  for (const box of layout.boxes) {
    if (!box.visible || box.mat === 'none') continue
    if (box.mat.startsWith('liquid_')) {
      addLiquid(batch, box)
      continue
    }
    batch.add(`${box.mat}#${box.zone}`, worldBox(box.min, box.max, surfaceTile(box.mat)), surfaceMaterial(box.mat))
  }

  for (const entry of layout.decor) {
    if (entry.kind === 'lobby') decorateLobby(props(0), entry)
    else {
      const stage = layout.stages[entry.index - 1]
      decorateStage(props(entry.zone), stage, THEMES[stage.theme], stage.sideTop)
    }
  }

  // Spikes, laser emitters and sweeper hubs are static: merged with the props.
  // Spikes: themed body, a bright red tip and a dark base, so the silhouette reads at a glance.
  for (const s of layout.spikes) {
    const theme = THEMES[layout.stages[s.zone - 1].theme]
    const p = props(s.zone)
    p.cone(theme.spike, [s.x, s.y + s.h / 2, s.z], s.r, s.h, { segments: 8 })
    const tip = s.h * 0.36
    p.cone('#ff2f3f', [s.x, s.y + s.h - tip / 2, s.z], s.r * 0.36 * 1.07, tip * 1.02, { segments: 8, glow: true })
    p.cylinder('#1d2029', [s.x, s.y + 0.12, s.z], s.r * 1.12, s.r * 1.2, 0.24, { segments: 8 })
  }
  for (const laser of layout.lasers) {
    const color = LASER_COLORS[laser.color] || LASER_COLORS.red
    for (const side of [-1, 1]) {
      const x = side * (CORRIDOR_HALF - 0.4)
      props(laser.zone).box('#3a3f4c', [x, (laser.yMin + laser.yMax) / 2, laser.z], [0.8, laser.yMax - laser.yMin + 2, 1.2])
      props(laser.zone).box(color, [x - side * 0.42, (laser.yMin + laser.yMax) / 2, laser.z], [0.08, laser.yMax - laser.yMin + 1, 0.3], { glow: true })
    }
  }
  for (const sweeper of layout.sweepers) {
    const [cx, cy, cz] = sweeper.center
    props(sweeper.zone).cylinder('#3a3f4c', [cx, (cy + layoutFloor(sweeper)) / 2, cz], 0.7, 0.9, cy - layoutFloor(sweeper) + 0.6, { segments: 10 })
  }

  for (const mesh of batch.build()) root.add(mesh)

  // --- Moving hazards (instanced: one draw call per kind).
  const hazards = buildHazardMeshes(layout, root)

  // --- Lobby features.
  const boards = layout.leaderboards.map((board) => {
    const built = buildLeaderboard(board)
    root.add(built.group)
    return built
  })
  const bootStands = layout.bootStands.map((stand) => {
    const built = buildBootStand(stand)
    root.add(built.group)
    animated.push(built)
    return built
  })
  const trampolines = layout.trampolines.map((t) => {
    const built = buildTrampoline(t)
    root.add(built.group)
    animated.push(built)
    return built
  })
  const door = buildCheckpointDoor(layout.checkpointDoor)
  root.add(door.group)
  animated.push(door)
  const trails = buildTrailsStand(layout.trailsStand)
  root.add(trails.group)
  animated.push(trails)
  const spawnDecal = buildSpawnDecal(layout.spawn)
  root.add(spawnDecal.group)
  animated.push(spawnDecal)
  const chest = buildChest(layout.chest)
  root.add(chest.group)
  animated.push(chest)

  // --- Course features.
  const doors = layout.doors.map((d) => {
    const built = buildRebirthDoor(d, CORRIDOR_HALF)
    built.req = d.rebirths
    root.add(built.group)
    animated.push(built)
    return built
  })
  for (const shark of layout.sharks) {
    const built = buildShark(shark)
    root.add(built.group)
    animated.push(built)
  }
  const final = layout.stages[layout.stages.length - 1]
  if (final.trophy) {
    const trophy = buildTrophy(final.trophy)
    root.add(trophy.group)
    animated.push(trophy)
  }

  buildSigns(layout, root)

  // Signs, displays, lasers and doors: hidden when the camera is far away.
  const culler = createDistanceCuller(root.children)

  let lastState = ''
  let fireworkAt = 0
  const fireworkSpot = new Vector3()

  return {
    root,
    updateLeaderboards(data) {
      for (const board of boards) board.update(data)
    },
    update(t, dt, camera, me, hydraLeft) {
      animateMaterials(dt)
      hazards.update(t)
      for (const item of animated) item.update(t, dt)
      if (camera) culler.update(camera.position, dt)

      // Labels and doors follow what you own (only when that changes).
      if (me) {
        const state = `${me.wins}|${me.boot}|${me.bootsOwned}|${me.tramps}|${me.rebirths}|${hydraLeft}|${Math.ceil(Math.max(0, me.chestAt - Date.now()) / 1000)}`
        if (state !== lastState) {
          lastState = state
          syncLabels({ me, hydraLeft, bootStands, trampolines, doors, chest })
        }
      }

      // Fireworks over the end of the course.
      if (camera && final.trophy && t > fireworkAt && Math.abs(camera.position.z - final.trophy[2]) < 260) {
        fireworkAt = t + 0.6 + Math.random() * 0.8
        fireworkSpot.set((Math.random() - 0.5) * 30, final.floorY + 30 + Math.random() * 25, final.trophy[2] + (Math.random() - 0.5) * 40)
        burst(fireworkSpot, { color: ['#ff4d6d', '#ffd23a', '#3bd16b', '#3ba8ff', '#b45cff'][Math.floor(Math.random() * 5)], count: 50, speed: 16, up: 2, life: 1.3, gravity: 6 })
      }
    },
  }
}

/** The floor under a sweeper's hub. */
function layoutFloor(sweeper) {
  return sweeper.center[1] - 2.4
}

function syncLabels({ me, hydraLeft, bootStands, trampolines, doors, chest }) {
  const boots = parseList(me.bootsOwned)
  for (const stand of bootStands) {
    const def = stand.def
    let state = 'buy'
    if (me.boot === def.id) state = 'equipped'
    else if (boots.includes(def.id)) state = 'owned'
    else if (def.limited && hydraLeft <= 0) state = 'soldout'
    else if (me.wins < def.price) state = 'poor'
    stand.setState(state, hydraLeft)
  }
  const tramps = parseList(me.tramps)
  trampolines.forEach((t, i) => {
    const def = Object.values(TRAMPOLINE_BY_ID)[i]
    t.setState(def.price === 0 || tramps.includes(def.id) ? 'owned' : me.wins >= def.price ? 'buy' : 'poor')
  })
  for (const door of doors) door.setOpen(me.rebirths >= door.req)
  const wait = me.chestAt - Date.now()
  chest.setState(wait <= 0 ? 'READY! Press E' : formatClock(wait), wait <= 0)
}

function formatClock(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ---------------------------------------------------------------------------
 * Lasers and sweepers
 * ------------------------------------------------------------------------- */

const _o = new Object3D()
const _tint = new Color()
const WHITE = new Color('#ffffff')

/**
 * The trail behind a sweeper bar (bar along local +X, rotating towards +Z):
 * a fan over the last ~45° at each end, brightest at the bar's edge.
 */
function sweepTrailGeometry() {
  const SPAN = 0.8
  const STEPS = 10
  const positions = []
  const colors = []
  const red = new Color('#ff5a4a')
  for (const base of [0, Math.PI]) {
    for (let k = 0; k < STEPS; k += 1) {
      const a0 = base - (k / STEPS) * SPAN
      const a1 = base - ((k + 1) / STEPS) * SPAN
      const f0 = (1 - k / STEPS) ** 1.4 * 0.9
      const f1 = (1 - (k + 1) / STEPS) ** 1.4 * 0.9
      const quad = [
        [Math.cos(a0) * 0.18, Math.sin(a0) * 0.18, f0 * 0.2],
        [Math.cos(a0), Math.sin(a0), f0],
        [Math.cos(a1), Math.sin(a1), f1],
        [Math.cos(a1) * 0.18, Math.sin(a1) * 0.18, f1 * 0.2],
      ]
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const [x, z, alpha] = quad[idx]
        positions.push(x, 0, z)
        colors.push(red.r, red.g, red.b, alpha)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4))
  return geometry
}

/** Red and white bands for the sweeper bars. */
function stripeBarTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 16
  const g = canvas.getContext('2d')
  for (let i = 0; i < 8; i += 1) {
    g.fillStyle = i % 2 ? '#ffffff' : '#ff3030'
    g.fillRect(i * 32, 0, 32, 16)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function buildHazardMeshes(layout, root) {
  const width = CORRIDOR_HALF * 2 - 0.8
  const groups = []

  // Lasers: a hot core and a soft glow per colour.
  const byColor = new Map()
  for (const laser of layout.lasers) {
    const key = laser.color in LASER_COLORS ? laser.color : 'red'
    if (!byColor.has(key)) byColor.set(key, [])
    byColor.get(key).push(laser)
  }
  for (const [key, lasers] of byColor) {
    const color = new Color(LASER_COLORS[key])
    const core = new InstancedMesh(new BoxGeometry(width, 0.3, 0.3), new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), lasers.length)
    // White material tinted per instance: the laser's colour, flaring to white as it charges.
    const glow = new InstancedMesh(
      new BoxGeometry(width, 0.9, 0.9),
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      lasers.length,
    )
    lasers.forEach((_, i) => glow.setColorAt(i, color))
    for (const m of [core, glow]) {
      m.frustumCulled = false
      m.name = 'lasers'
      root.add(m)
    }
    groups.push({ kind: 'laser', items: lasers, meshes: [core, glow], color })
  }

  // Sweepers: a red-and-white striped bar per sweeper, scaled to its radius.
  if (layout.sweepers.length) {
    const bar = new InstancedMesh(
      new BoxGeometry(2, 0.55, 0.55),
      new MeshStandardMaterial({ map: stripeBarTexture(), roughness: 0.4, emissive: '#5a0000', emissiveIntensity: 0.35 }),
      layout.sweepers.length,
    )
    bar.frustumCulled = false
    bar.castShadow = true
    bar.name = 'sweepers'
    root.add(bar)
    // A fading fan behind each end of the bar shows where it's sweeping.
    const trail = new InstancedMesh(sweepTrailGeometry(), new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false }), layout.sweepers.length)
    trail.frustumCulled = false
    trail.name = 'sweepers'
    root.add(trail)
    groups.push({ kind: 'sweeper', items: layout.sweepers, meshes: [bar, trail] })
  }

  return {
    update(t) {
      for (const group of groups) {
        group.items.forEach((item, i) => {
          if (group.kind === 'laser') {
            const charge = laserCharge(item, t)
            _o.position.set(0, laserY(item, t), item.z)
            _o.rotation.set(0, 0, 0)
            _o.scale.set(1, 1, 1)
            _o.updateMatrix()
            group.meshes[0].setMatrixAt(i, _o.matrix)
            // Charging: the glow swells and flickers, brightening towards white.
            const flare = charge > 0 ? charge * (0.8 + 0.4 * Math.sin(t * 40 + i)) : 0
            _o.scale.set(1, 1 + flare * 1.3, 1 + flare * 1.3)
            _o.updateMatrix()
            group.meshes[1].setMatrixAt(i, _o.matrix)
            _tint.copy(group.color).lerp(WHITE, charge * 0.7)
            group.meshes[1].setColorAt(i, _tint)
          } else {
            const [cx, cy, cz] = item.center
            // The bar points along (cos a, 0, sin a): a rotation about Y of -a.
            _o.position.set(cx, cy, cz)
            _o.rotation.set(0, -sweeperAngle(item, t), 0)
            _o.scale.set(item.radius, 1, 1)
            _o.updateMatrix()
            group.meshes[0].setMatrixAt(i, _o.matrix)
            _o.scale.set(item.radius, 1, item.radius * Math.sign(item.speed || 1))
            _o.updateMatrix()
            group.meshes[1].setMatrixAt(i, _o.matrix)
          }
        })
        for (const m of group.meshes) {
          m.instanceMatrix.needsUpdate = true
          if (m.instanceColor) m.instanceColor.needsUpdate = true
        }
      }
    },
  }
}

/* ---------------------------------------------------------------------------
 * Signs
 * ------------------------------------------------------------------------- */

const POST_GEOMETRY = new BoxGeometry(0.6, 4.8, 0.6)
const POST_MATERIAL = new MeshStandardMaterial({ color: '#7a4a26', roughness: 0.8 })

function buildSigns(layout, root) {
  for (const sign of layout.signs) {
    let object = null
    if (sign.kind === 'gate') {
      object = buildGateSign(sign)
    } else if (sign.kind === 'title') {
      const lines = [{ text: sign.text, size: 150, font: FONT_TITLE, weight: 400, fill: ['#ffffff', sign.color], strokeWidth: 16 }]
      if (sign.sub) lines.push({ text: sign.sub, size: 52, fill: '#fff47a' })
      object = textPlane(lines, { height: sign.size + (sign.sub ? 2.4 : 0) })
      object.rotation.y = sign.rotY
    } else if (sign.kind === 'climbWall') {
      object = climbWallSign(sign.level, Math.min(34, CORRIDOR_HALF * 2 - 6), sign.first)
    } else if (sign.kind === 'gapSign') {
      object = gapSign(sign.level, sign.first)
    } else if (sign.kind === 'stageTitle') {
      object = textSprite(
        [
          { text: sign.text, size: 130, font: FONT_TITLE, weight: 400, fill: TITLE_FILLS[sign.theme] || TITLE_FILLS.starter, strokeWidth: 16 },
          { text: sign.sub, size: 52, fill: '#ffffff' },
        ],
        { height: 8.4 },
      )
    } else if (sign.kind === 'padLabel') {
      object =
        sign.pad === 'return'
          ? textSprite(
              [
                { text: `+${formatNumber(sign.wins)} Wins`, size: 66, fill: ['#fff47a', '#ffb21f'] },
                { text: 'Return', size: 40 },
              ],
              { height: 4.2 },
            )
          : textSprite(
              [
                { text: 'x2 Wins!', size: 62, fill: ['#ffd6ff', '#ff5fd2'] },
                { text: `+${formatNumber(sign.wins * 2)} · 2x Wins pass`, size: 34, fill: '#ffffff' },
              ],
              { height: 4 },
            )
    } else if (sign.kind === 'recommend') {
      object = new Group()
      const board = recommendBoard({ stage: sign.stage, level: sign.level, bootName: sign.boot !== 'starter' ? BOOT_BY_ID[sign.boot]?.name : null, rebirths: sign.rebirths })
      // The board sits on top of its two posts.
      board.position.y = 4.4 + board.geometry.parameters.height / 2
      object.add(board)
      for (const x of [-2.2, 2.2]) {
        const leg = new Mesh(POST_GEOMETRY, POST_MATERIAL)
        leg.position.set(x, 2.4, -0.2)
        leg.castShadow = true
        object.add(leg)
      }
    } else if (sign.kind === 'escaped') {
      object = textSprite(
        [
          { text: 'YOU ESCAPED!', size: 150, font: FONT_TITLE, weight: 400, fill: ['#fff6c4', '#ffb81f'], strokeWidth: 18 },
          { text: 'Rebirth and race again for even more Wins!', size: 50, fill: '#ffffff' },
        ],
        { height: 12 },
      )
    }
    if (!object) continue
    object.position.set(sign.pos[0], sign.pos[1], sign.pos[2])
    if (sign.zone) object.name = `sign#${sign.zone}`
    root.add(object)
  }
}

/* ---------------------------------------------------------------------------
 * Culling
 * ------------------------------------------------------------------------- */

/** Merged stage geometry further than this from the camera isn't drawn. */
const ZONE_RANGE = 1500
/** Scenery props further than this aren't drawn. */
const PROPS_RANGE = 650

/**
 * Hides objects the camera is far from. Small things (labels, displays, doors)
 * get a range that grows with their size; a stage's merged geometry and props
 * are hidden once the camera is far from every part of that stage. Each one
 * is a draw call (twice, with shadows), so this keeps the frame cheap even
 * though the whole course exists at once.
 */
function createDistanceCuller(objects) {
  const box = new Box3()
  const sphere = new Sphere()
  const items = []
  const zones = []
  for (const object of objects) {
    const match = /#(\d+)$/.exec(object.name)
    if (match) {
      const zone = Number(match[1])
      if (zone === 0 && !/^(props|glow)#/.test(object.name)) continue
      const range = /^(props|glow|sign)#/.test(object.name) ? PROPS_RANGE : ZONE_RANGE
      zones.push({ object, box: new Box3().setFromObject(object), range })
      continue
    }
    if (object.isPoints || object.isInstancedMesh) continue
    box.setFromObject(object)
    if (box.isEmpty()) continue
    box.getBoundingSphere(sphere)
    const range = Math.min(1600, Math.max(320, 260 + sphere.radius * 8))
    items.push({ object, x: sphere.center.x, z: sphere.center.z, range2: range * range })
  }
  let wait = 0
  return {
    update(position, dt) {
      wait -= dt
      if (wait > 0) return
      wait = 0.2
      for (const item of items) {
        const dx = item.x - position.x
        const dz = item.z - position.z
        item.object.visible = dx * dx + dz * dz < item.range2
      }
      for (const item of zones) item.object.visible = item.box.distanceToPoint(position) < item.range
    },
  }
}
