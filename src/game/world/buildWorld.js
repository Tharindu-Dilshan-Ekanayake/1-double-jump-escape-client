import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
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

import { BOOT_BY_ID, STAGES, WORLD_BY_ID, bestBootTier, formatNumber } from '../../shared/gameData.js'
import { CORRIDOR_HALF, THEMES, doorOpen, getLayout } from '../../shared/layout.js'
import { progressState } from '../../store/progression'
import { bridgePhase } from '../bridges'
import { burst } from '../burst'
import { laserCharge, laserY, sweeperAngle } from '../hazards'
import { decorateHub, decorateLobby, decorateStage } from './decor'
import { GeoBatch, Props, worldBox, worldBoxSides, worldPlane } from './geometry'
import { animateMaterials, fallMaterial, glowMaterial, propsMaterial, riverMaterial, surfaceMaterial } from './materials'
import {
  buildBootStand,
  buildCheckpointDoor,
  buildChest,
  buildEggStand,
  buildGateSign,
  buildJumpPad,
  buildLeaderboard,
  buildShark,
  buildShopStand,
  buildSpawnDecal,
  buildStageDoor,
  buildTrailsStand,
  buildTrophy,
  buildWorldDoor,
  fadeLabels,
  fadeNear,
} from './models'
import { FONT_TITLE, gapSign, stageNeedsSign, stageTitleSign, textPlane, textSprite, worldInfoBoard } from './signs'
import { LIQUIDS, getSurfaceTexture, shade, surfaceTile } from './textures'

const LASER_COLORS = { red: '#ff2a2a', yellow: '#ffdd1f', green: '#6bff3a', magenta: '#ff3af2' }

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
    // Bridge planks move: they're drawn on their own (see buildBridges).
    if (!box.visible || box.mat === 'none' || box.bridge) continue
    if (box.mat.startsWith('liquid_')) {
      addLiquid(batch, box)
      continue
    }
    batch.add(`${box.mat}#${box.zone}`, worldBox(box.min, box.max, surfaceTile(box.mat)), surfaceMaterial(box.mat))
  }

  for (const entry of layout.decor) {
    if (entry.kind === 'lobby') decorateLobby(props(0), entry)
    else if (entry.kind === 'hub') decorateHub(props(entry.zone), entry)
    else {
      const stage = layout.stages[entry.index - 1]
      decorateStage(props(entry.zone), stage, THEMES[stage.theme], stage.sideTop)
    }
  }

  // Spikes, laser emitters and sweeper hubs are static: merged with the props.
  // Spikes: plain grey cones like the original, a shade darker at the foot.
  for (const s of layout.spikes) {
    const theme = THEMES[layout.stages[s.zone - 1].theme]
    const p = props(s.zone)
    p.cone(theme.spike, [s.x, s.y + s.h / 2, s.z], s.r, s.h, { segments: 12 })
    p.cylinder(shade(theme.spike, -0.35), [s.x, s.y + 0.15, s.z], s.r * 1.04, s.r * 1.1, 0.3, { segments: 12 })
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

  // --- Moving hazards (instanced: one draw call per kind).
  const hazards = buildHazardMeshes(layout, root)

  // --- Lobby features.
  const boards = layout.leaderboards.map((board) => {
    const built = buildLeaderboard(board)
    root.add(built.group)
    return built
  })
  const bootStands = layout.bootStands.map((stand) => {
    const built = buildBootStand(stand, props(0))
    root.add(built.group)
    animated.push(built)
    return built
  })
  const jumpPads = layout.jumpPads.map((pad) => {
    const built = buildJumpPad(pad, props(0))
    root.add(built.group)
    animated.push(built)
    return built
  })
  const eggStands = layout.eggStands.map((stand) => {
    const built = buildEggStand(stand, props(0))
    built.id = stand.egg
    root.add(built.group)
    animated.push(built)
    return built
  })
  const shopStand = buildShopStand(layout.shopStand)
  root.add(shopStand.group)
  const plaza = buildPlaza(layout.plaza)
  root.add(plaza.group)
  animated.push(plaza)
  const bridges = buildBridges(layout, root)
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
    const built = buildStageDoor(d)
    root.add(built.group)
    animated.push(built)
    return built
  })
  for (const shark of layout.sharks) {
    const built = buildShark(shark)
    root.add(built.group)
    animated.push(built)
  }
  const worldDoors = layout.worldDoors.map((d) => {
    const built = buildWorldDoor(d)
    built.req = d.rebirths
    root.add(built.group)
    animated.push(built)
    return built
  })
  const final = layout.stages[layout.stages.length - 1]
  if (final.trophy) {
    const trophy = buildTrophy(final.trophy)
    root.add(trophy.group)
    animated.push(trophy)
  }

  buildSigns(layout, root)

  // Everything static (the course, decor, and the stands' and pads' bases) as a
  // few merged meshes per material and zone.
  for (const mesh of batch.build()) root.add(mesh)

  // Signs, displays, lasers and doors: hidden when the camera is far away.
  const culler = createDistanceCuller(root.children)

  // Almost all of the world never moves: freeze its matrices so three.js doesn't
  // recompute hundreds of them every frame. The animated pieces (stands, pads,
  // doors, sharks...) keep updating.
  freezeStatic(root, animated)
  // Every shadow caster is drawn twice (once more for the shadow map): keep the
  // shadows that show (walls, platforms, boards, players), drop the rest.
  pruneShadowCasters(root, [...bootStands, ...jumpPads, ...eggStands, shopStand, plaza, door, trails, spawnDecal, chest].map((item) => item.group))

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
      bridges.update(t)
      for (const item of animated) item.update(t, dt)
      if (camera) {
        culler.update(camera.position, dt)
        fadeLabels(camera)
      }

      // Labels and doors follow what you own (only when that changes).
      if (me) {
        const state = `${me.wins}|${me.boot}|${me.bootsOwned}|${me.padsOwned}|${me.rebirths}|${hydraLeft}|${Math.ceil(Math.max(0, me.chestAt - Date.now()) / 1000)}`
        if (state !== lastState && progressState().ready) {
          lastState = state
          syncLabels({ me, progress: progressState(), hydraLeft, bootStands, jumpPads, eggStands, doors, worldDoors, chest })
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

/**
 * No shadows from the lobby's stands and pads (small, on the ground), from
 * unlit glows, or from thin floor overlays; they cost a draw call each in the
 * shadow pass and barely show.
 */
function pruneShadowCasters(root, lobbyGroups) {
  for (const group of lobbyGroups) group?.traverse((o) => (o.castShadow = false))
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return
    if (o.material?.isMeshBasicMaterial) {
      o.castShadow = false
      return
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const box = o.geometry.boundingBox
    if (box.max.y - box.min.y <= 1.5) o.castShadow = false
  })
}

/** Turns off per-frame matrix updates for everything under `root` but the animated items' groups. */
function freezeStatic(root, animated) {
  root.updateMatrixWorld(true)
  const moving = new Set()
  for (const item of animated) item.group?.traverse((o) => moving.add(o))
  root.traverse((o) => {
    if (moving.has(o)) return
    o.matrixAutoUpdate = false
    o.updateMatrix()
  })
}

/** The floor under a sweeper's hub. */
function layoutFloor(sweeper) {
  return sweeper.center[1] - 2.4
}

/** Lobby labels and doors from the progression store (what you own and can afford). */
function syncLabels({ me, progress, hydraLeft, bootStands, jumpPads, eggStands, doors, worldDoors, chest }) {
  const boots = Object.fromEntries(progress.boots.map((b) => [b.id, b]))
  for (const stand of bootStands) stand.setState(boots[stand.def.id]?.state ?? 'buy', hydraLeft)
  for (const pad of jumpPads) pad.setState(progress.pads.find((x) => x.id === pad.id))
  for (const stand of eggStands) {
    const egg = progress.eggs.find((e) => e.id === stand.id)
    stand.setState(!egg?.open ? 'locked' : egg.affordable ? 'buy' : 'poor')
  }
  const tier = bestBootTier(me)
  for (const door of doors) door.setOpen(doorOpen(door.door, me.rebirths, tier))
  for (const door of worldDoors) door.setOpen(me.rebirths >= door.req)
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
 * The spawn plaza and the breaking bridges
 * ------------------------------------------------------------------------- */

/** The plaza round the spawn: a stone circle with a blue ring and a sunburst of tiles. */
function plazaTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const g = canvas.getContext('2d')
  const c = 256
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(c, c, 250, 0, Math.PI * 2)
  g.fill()
  // Alternating warm wedges, like paving laid in a circle.
  for (let i = 0; i < 24; i += 1) {
    g.fillStyle = i % 2 ? '#f6ecd6' : '#fff8ea'
    g.beginPath()
    g.moveTo(c, c)
    g.arc(c, c, 236, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2)
    g.closePath()
    g.fill()
  }
  g.lineWidth = 18
  g.strokeStyle = '#4fa8ff'
  g.beginPath()
  g.arc(c, c, 240, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 6
  g.strokeStyle = '#ffd23a'
  g.beginPath()
  g.arc(c, c, 222, 0, Math.PI * 2)
  g.stroke()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function buildPlaza(plaza) {
  const mesh = new Mesh(
    new CircleGeometry(plaza.radius, 64),
    new MeshStandardMaterial({ map: plazaTexture(), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(plaza.x, 0.05, plaza.z)
  mesh.receiveShadow = true
  mesh.name = 'plaza'
  return { group: mesh, update() {} }
}

const _plank = new Object3D()

/**
 * Every bridge plank, one instanced mesh: still, shaking (after you step on
 * it), dropping away, gone, and back (see bridges.js).
 */
function buildBridges(layout, root) {
  const planks = layout.bridges
  if (!planks.length) return { update() {} }
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ map: getSurfaceTexture('bridgePlank'), roughness: 0.8 }), planks.length)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.name = 'bridges'
  root.add(mesh)
  const last = new Array(planks.length).fill('')
  return {
    update(t) {
      let dirty = false
      planks.forEach((p, i) => {
        const { phase, k } = bridgePhase(p.id)
        if (phase === 'idle' && last[i] === 'idle') return
        last[i] = phase
        dirty = true
        const cx = (p.min[0] + p.max[0]) / 2
        const cy = (p.min[1] + p.max[1]) / 2
        const cz = (p.min[2] + p.max[2]) / 2
        _plank.position.set(cx, cy, cz)
        _plank.rotation.set(0, 0, 0)
        _plank.scale.set(p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2])
        if (phase === 'shake') {
          const j = 0.08 + k * 0.18
          _plank.position.x += Math.sin(t * 61 + i) * j
          _plank.position.z += Math.cos(t * 53 + i) * j * 0.6
          _plank.rotation.z = Math.sin(t * 47 + i) * 0.03 * (1 + k)
        } else if (phase === 'fall') {
          _plank.position.y -= k * k * 28
          _plank.rotation.set(k * 0.9, 0, k * 0.5 * (i % 2 ? 1 : -1))
        } else if (phase === 'gone') {
          _plank.scale.setScalar(0.0001)
        }
        _plank.updateMatrix()
        mesh.setMatrixAt(i, _plank.matrix)
      })
      if (dirty) mesh.instanceMatrix.needsUpdate = true
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
    } else if (sign.kind === 'gapSign') {
      object = gapSign(sign.jumps, sign.first)
      // Only as you come up the corridor to the jump (from the stage before it would sit behind the
      // door's sign), and gone before the camera reaches it (it would fill the screen).
      fadeNear(object, [12, 18], [28, 38])
    } else if (sign.kind === 'stageTitle') {
      object = stageTitleSign(sign.text, 9)
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
                { text: 'x2 Wins!', size: 62, fill: ['#fff47a', '#ffb21f'] },
                { text: `+${formatNumber(sign.wins * 2)} · Touch to Claim`, size: 34, fill: '#ffffff' },
              ],
              { height: 4 },
            )
    } else if (sign.kind === 'stageNeeds') {
      object = stageNeedsSign({ jumps: sign.jumps, bootName: BOOT_BY_ID[sign.boot]?.name, rebirths: sign.rebirths })
    } else if (sign.kind === 'worldEnd') {
      const next = WORLD_BY_ID[sign.next]
      object = textSprite(
        [
          { text: `${WORLD_BY_ID[sign.world].name.toUpperCase()} COMPLETE!`, size: 130, font: FONT_TITLE, weight: 400, fill: ['#fff6c4', '#ffb81f'], strokeWidth: 16 },
          { text: `Rebirth ${sign.rebirths > 1 ? `${sign.rebirths} times` : 'once'}, then take the ${next.name} portal in the lobby!`, size: 48, fill: '#ffffff' },
        ],
        { height: 8 },
      )
    } else if (sign.kind === 'worldInfo') {
      object = new Group()
      const world = WORLD_BY_ID[sign.world]
      const board = worldInfoBoard(world, STAGES, BOOT_BY_ID[STAGES[world.firstStage - 1].boot]?.name)
      board.position.y = 3.6 + board.geometry.parameters.height / 2
      object.add(board)
      for (const x of [-4.5, 4.5]) {
        const leg = new Mesh(POST_GEOMETRY, POST_MATERIAL)
        leg.position.set(x, 2.4, -0.2)
        object.add(leg)
      }
      object.rotation.y = sign.rotY
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
        item.object.visible = !item.object.userData.hidden && dx * dx + dz * dz < item.range2
      }
      for (const item of zones) item.object.visible = item.box.distanceToPoint(position) < item.range
    },
  }
}
