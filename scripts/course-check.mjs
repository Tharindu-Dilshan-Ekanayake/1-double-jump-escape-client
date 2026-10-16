/**
 * Course sanity check: for every stage, does every gap — the long jump in and
 * every hop after it — need exactly the stage's jumps in its boots (one fewer
 * can't make it, the stage's own make it with room to spare)? Is the build of
 * the stage before held back? And does every stage that needs new boots or
 * more rebirths have its door?
 *
 *   npm run check:course
 */
import { BOOTS, BOOT_BY_ID, STAGES, jumpsFor, moveStats } from '../src/shared/gameData.js'
import { STAGE_RISE, gapReach, getLayout, jumpsForGap, stageBuild } from '../src/shared/layout.js'

const layout = getLayout()
let failures = 0
const fmt = (n) => n.toFixed(1).padStart(7)

console.log('stage  boots             jumps  r    gate  reach  margin  hops (needs)        | door')
for (const stage of layout.stages) {
  const def = STAGES[stage.index - 1]
  const build = stageBuild(stage.index)
  const prev = stageBuild(stage.index - 1)
  const reach = gapReach(build, STAGE_RISE)
  const margin = reach / stage.gateSize
  const gateNeeds = jumpsForGap(stage.gateSize, STAGE_RISE, build.speed)
  const prevMakes = gapReach(prev, STAGE_RISE) >= stage.gateSize
  let ok = margin >= 1.035 && gateNeeds === def.jumps
  if (build.jumps !== def.jumps) ok = false

  // Every hop after the long jump needs the stage's jumps as well.
  const hops = stage.jumps.map((jump) => {
    const needs = jumpsForGap(jump.gap, Math.max(0, jump.rise), build.speed)
    const room = gapReach(build, Math.max(0, jump.rise)) / jump.gap
    if (needs !== def.jumps || room < 1.035) ok = false
    return `${jump.gap.toFixed(0)}(${needs})`
  })
  if (!ok) failures += 1

  // New boots or more rebirths than the stage before: there must be a door.
  const before = STAGES[stage.index - 2]
  const needsDoor = before && (before.boot !== def.boot || before.rebirths < def.rebirths)
  const door = layout.doors.find((d) => d.stage === stage.index)
  if (needsDoor && !door) failures += 1
  const doorText = door ? `${BOOT_BY_ID[door.bootId].name}${door.rebirths ? ` + ${door.rebirths} rebirth${door.rebirths > 1 ? 's' : ''}` : ''}` : needsDoor ? 'MISSING!' : '-'

  console.log(
    `${String(stage.index).padStart(5)}  ${BOOT_BY_ID[def.boot].name.padEnd(16)}  ${String(def.jumps).padStart(5)}  ${def.rebirths} ${fmt(stage.gateSize)}${fmt(reach)}   ${margin.toFixed(2)}${ok ? ' ' : '!'}${prevMakes ? '~' : ' '} ${hops.join(' ').padEnd(20)} | ${doorText}`,
  )
}

// Every pair of boots below the limited one opens stages.
for (const boot of BOOTS) {
  if (!boot.limited && !boot.stages) {
    failures += 1
    console.log(`! ${boot.name} opens no stage`)
  }
}

const first = moveStats(0)
console.log(`\nLevel 0 in slippers: speed ${first.speed}, ${jumpsFor(0)} jump of ${first.height}, reach ${gapReach(first).toFixed(1)}  (~ = the stage before's build makes this gate too)`)
console.log(`Boots → stages: ${BOOTS.filter((b) => b.stages).map((b) => `${b.name} ${b.stages[0]}-${b.stages[1]}`).join(', ')}`)
console.log(`Course length: ${Math.abs(layout.courseEndZ).toFixed(0)} studs, ${layout.boxes.length} boxes, ${layout.doors.length} doors, ${layout.spikes.length} spikes, ${layout.sharks.length} sharks`)
console.log(failures ? `\n${failures} problem(s)` : '\nEvery gap needs exactly its stage\'s jumps, and every new pair of boots has its door.')
process.exitCode = failures ? 1 : 0
