import { create } from 'zustand'

import { STAGES } from '../shared/gameData.js'
import { getLayout, stageAt } from '../shared/layout.js'
import { cameraRig } from '../game/cameraRig'
import { localPlayer } from '../game/playerState'

/**
 * Developer tools (dev builds only, see DevPanel): walk the course stage by
 * stage. Read by the player controller and the world; everything is off by
 * default and only changes things on this screen — the server still keeps
 * your real stats (and won't pay pads after a dev teleport).
 */

const KEY = 'double-jump-escape:dev:v1'

const defaults = {
  open: false,
  /** Lava and hazards don't kill: you walk on the lava. */
  god: false,
  /** Stage doors (boots, rebirths) let you through. */
  doors: false,
  /** Movement build: 'mine' (your real one), 'stage' (the recommended build of the stage ahead) or 'custom'. */
  buildMode: 'mine',
  custom: { level: 15, boot: 'starter', perkSpeed: 0, rebirths: 0 },
  /** The stage the last dev teleport went to ([ and ] step from it). */
  at: 0,
}

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return defaults
  }
}

export const useDevStore = create(load)

useDevStore.subscribe((state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Private mode: dev settings just won't stick.
  }
})

export const devState = () => useDevStore.getState()
export const setDev = (patch) => useDevStore.setState(patch)

/**
 * The stage whose obstacles are ahead of a player at `z`: the one you're in,
 * or the next once you're on its plateau (its long jump is next).
 */
export function stageAhead(z) {
  const stage = stageAt(getLayout(), z)
  if (!stage) return 1
  return z <= stage.plateauZ0 ? Math.min(STAGES.length, stage.index + 1) : stage.index
}

/** The build to move with ({ level, boot, perkSpeed, rebirths }), or null for your real one. */
export function devMoveBuild() {
  const { buildMode, custom } = devState()
  if (buildMode === 'custom') return { level: custom.level, boot: custom.boot ?? 'starter', perkSpeed: custom.perkSpeed ?? 0, rebirths: custom.rebirths ?? 0 }
  if (buildMode === 'stage') {
    const def = STAGES[stageAhead(localPlayer.position.z) - 1]
    return { level: def.level, boot: def.boot, perkSpeed: 0, rebirths: def.rebirths }
  }
  return null
}

/**
 * Where a dev teleport to stage `index` lands:
 *  'jump'  — at the doorway, about to make its long jump in;
 *  'start' — on its landing, just past the long jump;
 *  'end'   — on its plateau, by the Wins pads.
 */
export function stagePoint(index, where) {
  const stage = getLayout().stages[index - 1]
  if (!stage) return null
  if (where === 'start') {
    const landing = stage.platforms.find((p) => p.entry)
    return { x: 0, y: landing.y + 0.2, z: landing.z0 - 4, yaw: Math.PI }
  }
  if (where === 'end') return stage.checkpoint
  return { x: 0, y: stage.prevTop + 0.2, z: stage.zStart + 6, yaw: Math.PI }
}

/** Teleports there, turns the camera down the course and remembers the stage for [ and ]. */
export function devTeleport(index, where = 'jump') {
  const point = stagePoint(index, where)
  if (!point) return
  localPlayer.teleportTo(point)
  cameraRig.yaw = 0
  setDev({ at: index })
}
