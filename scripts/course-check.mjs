/**
 * Course sanity check: for every stage, can its recommended build clear the
 * gate (and the stepping platforms), and is the build before it held back?
 *
 *   npm run check:course
 */
import { STAGES, moveStats } from '../src/shared/gameData.js'
import { STAGE_RISE, climbHeight, gapReach, getLayout, stageBuild } from '../src/shared/layout.js'

const layout = getLayout()
let failures = 0
const fmt = (n) => n.toFixed(1).padStart(7)

console.log('stage  gate   size    build   prev   margin  | lvl boot     rb | spd   hgt  jumps | z range')
for (const stage of layout.stages) {
  const def = STAGES[stage.index - 1]
  const cur = stageBuild(stage.index)
  const prev = stageBuild(stage.index - 1)
  const wall = def.gate === 'wall'
  const c = wall ? climbHeight(cur) : gapReach(cur, STAGE_RISE)
  const p = wall ? climbHeight(prev) : gapReach(prev, STAGE_RISE)
  const margin = c / stage.gateSize
  const ok = margin >= 1.05
  const held = p < stage.gateSize
  if (!ok) failures += 1
  console.log(
    `${String(stage.index).padStart(5)}  ${def.gate.padEnd(5)}${fmt(stage.gateSize)} ${fmt(c)}${fmt(p)}   ${margin.toFixed(2)}${ok ? ' ' : '!'}${held ? ' ' : '~'} | ${String(def.level).padStart(3)} ${def.boot.padEnd(8)} ${String(def.rebirths).padStart(2)} | ${cur.speed.toFixed(0).padStart(4)} ${cur.height.toFixed(1).padStart(5)} ${String(cur.jumps).padStart(4)}  | ${stage.zStart.toFixed(0)}..${stage.plateauZ1.toFixed(0)}`,
  )

  // Every stepping-platform gap must be easy for the build before this stage.
  for (const pl of stage.platforms) {
    const rise = Math.max(0, pl.y - (stage.prevTop - 3))
    const reach = gapReach(prev, rise)
    if (pl.gap > reach * 0.75) {
      failures += 1
      console.log(`   ! platform gap ${pl.gap.toFixed(1)} vs reach ${reach.toFixed(1)} for the previous build`)
    }
  }
}

const first = moveStats(1)
console.log(`\nLevel 1: speed ${first.speed}, jump ${first.height}, reach ${gapReach(first).toFixed(1)}, climb ${climbHeight(first).toFixed(1)}`)
console.log(`Course length: ${Math.abs(layout.courseEndZ).toFixed(0)} studs, ${layout.boxes.length} boxes, ${layout.spikes.length} spikes, ${layout.lasers.length} lasers, ${layout.sweepers.length} sweepers`)
console.log(failures ? `\n${failures} problem(s)` : '\nAll stages are clearable by their recommended builds.')
process.exitCode = failures ? 1 : 0
