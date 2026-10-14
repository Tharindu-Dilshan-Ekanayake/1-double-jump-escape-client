import { PHYSICS } from '../shared/gameData.js'
import { stageAt } from '../shared/layout.js'

/**
 * Spikes, bobbing lasers and spinning sweeper bars.
 *
 * The same functions place the meshes (World) and test hits (the controller),
 * so what you see is exactly what kills you. Time is local seconds; hazards don't
 * need to be in sync between players because collisions are checked locally.
 */

export const hazardTime = () => performance.now() / 1000

export const laserY = (laser, t) => laser.yMin + (laser.yMax - laser.yMin) * (0.5 + 0.5 * Math.sin(laser.speed * t + laser.phase))

export const sweeperAngle = (sweeper, t) => sweeper.phase + sweeper.speed * t

/** Forgiving body size: hazards only kill on a clear touch. */
const BODY_RADIUS = PHYSICS.radius * 0.7
const BEAM = 0.3
const BAR = 0.35

const byZone = new WeakMap()

/** The layout's hazards grouped by stage, built once. */
function zones(layout) {
  let index = byZone.get(layout)
  if (!index) {
    index = new Map()
    const bucket = (zone) => {
      if (!index.has(zone)) index.set(zone, { spikes: [], lasers: [], sweepers: [] })
      return index.get(zone)
    }
    for (const s of layout.spikes) bucket(s.zone).spikes.push(s)
    for (const l of layout.lasers) bucket(l.zone).lasers.push(l)
    for (const s of layout.sweepers) bucket(s.zone).sweepers.push(s)
    byZone.set(layout, index)
  }
  return index
}

/** What hit the player at `pos` (feet), or null: 'spike' | 'laser' | 'sweeper'. */
export function touchingHazard(layout, pos, t) {
  const stage = stageAt(layout, pos.z)
  if (!stage) return null
  const set = zones(layout).get(stage.zone)
  if (!set) return null
  const feet = pos.y + 0.3
  const head = pos.y + PHYSICS.height - 0.5

  for (const s of set.spikes) {
    const dx = pos.x - s.x
    const dz = pos.z - s.z
    if (Math.abs(dz) > 3 || Math.abs(dx) > 3) continue
    const above = pos.y - s.y
    if (above > s.h - 0.5 || pos.y + PHYSICS.height < s.y) continue
    const coneRadius = s.r * (1 - Math.max(0, above) / s.h)
    if (Math.hypot(dx, dz) < coneRadius + BODY_RADIUS) return 'spike'
  }

  for (const laser of set.lasers) {
    if (Math.abs(pos.z - laser.z) > BODY_RADIUS + BEAM) continue
    const y = laserY(laser, t)
    if (y > feet && y < head) return 'laser'
  }

  for (const sweeper of set.sweepers) {
    const [cx, cy, cz] = sweeper.center
    if (Math.abs(pos.z - cz) > sweeper.radius + 2 || Math.abs(pos.x - cx) > sweeper.radius + 2) continue
    if (cy < feet || cy > head) continue
    const angle = sweeperAngle(sweeper, t)
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    const px = pos.x - cx
    const pz = pos.z - cz
    if (Math.abs(px * dx + pz * dz) > sweeper.radius) continue
    if (Math.abs(px * dz - pz * dx) < BODY_RADIUS + BAR) return 'sweeper'
  }
  return null
}
