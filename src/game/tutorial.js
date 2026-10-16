import { BOOT_BY_ID } from '../shared/gameData.js'
import { getLayout } from '../shared/layout.js'

/**
 * The first-time guide: arrows on the ground and a banner take a new player
 * through the core loop once —
 *   1. stand on the Jump Pad for a few seconds (XP, levels, more jumps),
 *   2. run Stage 1 and collect its Wins,
 *   3. back in the lobby, buy the Sneakers with them.
 * Each step is worked out from the player's real progress (only the pad step
 * needs remembering), so it picks up wherever they are and never comes back
 * once they own the Sneakers.
 */

const PAD_DONE_KEY = 'double-jump-escape:tutorial-pad'
/** Seconds on a jump pad that count as having trained. */
export const PAD_SECONDS = 5
const FIRST_BOOT = 'sneakers'

const layout = getLayout()
const pad1 = layout.jumpPads[0]
const sneakers = layout.bootStands.find((s) => s.boot === FIRST_BOOT)
const stage1 = layout.stages[0]
const returnPad = layout.pads.find((p) => p.stage === 1 && p.kind === 'return')

/** Where each step's arrows lead: [x, y, z]. */
export const TARGETS = {
  pad: [pad1.center[0], pad1.top, pad1.center[1]],
  gate: [0, 0, stage1.zStart + 2],
  stage: [(returnPad.min[0] + returnPad.max[0]) / 2, returnPad.max[1], (returnPad.min[2] + returnPad.max[2]) / 2],
  boots: [sneakers.pos[0] + 5, sneakers.pos[1], sneakers.pos[2]],
}

const owns = (csv, id) => String(csv || '').split(',').includes(id)

export function padStepDone() {
  try {
    return localStorage.getItem(PAD_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function markPadStepDone() {
  try {
    localStorage.setItem(PAD_DONE_KEY, '1')
  } catch {
    // Private mode: the step is just remembered for this visit.
  }
}

/**
 * The step a player is on: 'pad', 'stage' or 'boots', or null when they've
 * done the guide (or don't need it).
 */
export function tutorialStep(me, padDone) {
  if (!me) return null
  if ((me.rebirths ?? 0) > 0 || owns(me.bootsOwned, FIRST_BOOT)) return null
  const beaten = (me.bestStage ?? 0) >= 1
  if (!padDone && !beaten && (me.level ?? 0) < 2) return 'pad'
  if (beaten && (me.wins ?? 0) >= BOOT_BY_ID[FIRST_BOOT].price) return 'boots'
  return 'stage'
}

/** What the banner says for a step. */
export function tutorialText(step, { onCourse = false, padSeconds = 0 } = {}) {
  const price = BOOT_BY_ID[FIRST_BOOT].price
  if (step === 'pad') {
    const left = Math.max(0, Math.ceil(PAD_SECONDS - padSeconds))
    return { index: 1, icon: '🦘', text: padSeconds > 0 ? `Training... ${left}s` : 'Stand on the green Jump Pad to train!' }
  }
  if (step === 'stage') {
    return { index: 2, icon: '🏁', text: onCourse ? `Beat Stage 1 and grab its 🏆 ${stage1.wins} Wins!` : `Run through the gate to Stage 1 for 🏆 ${stage1.wins} Wins!` }
  }
  if (step === 'boots') return { index: 3, icon: '🥾', text: `Buy the ${BOOT_BY_ID[FIRST_BOOT].name} for 🏆 ${price} Wins! (Press E)` }
  return null
}
