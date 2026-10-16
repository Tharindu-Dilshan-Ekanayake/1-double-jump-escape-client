/**
 * Balance simulation: plays an average player through six rebirths with the
 * real formulas (src/shared/progression.js) and prints when each stage,
 * boots pair and rebirth happens, against the design's targets.
 *
 *   npm run simulate              (average of 24 players)
 *   npm run simulate -- --levels  (also every level of the first player)
 *   npm run simulate -- --fit     (fit the XP curve to the rebirth targets)
 *   npm run simulate -- --balance (fit the XP curve and the boot prices together)
 *   npm run simulate -- --tune    (search the XP constants for the targets)
 *
 * The average player, every second:
 *  - runs and jumps 55% of the time (stages, the lobby): steps at 80% of
 *    their boots' speed and CONFIG.handJumpRate jumps a second, +1 XP each;
 *  - bounces on their best jump pad 35% of the time (AFK);
 *  - the other 10% is menus and looking around;
 *  - beats each new stage as soon as its door is open (boots, rebirths) and
 *    their level makes the jumps, then spends their hand-jumping time
 *    replaying the best stage they can for Wins (a stage takes 25 s + 3 s
 *    per stage number);
 *  - opens the chest every 15 min and their playtime gifts (40-minute sessions);
 *  - saves up for the next boots once their stages are within this rebirth's
 *    reach; otherwise every 5 s spends Wins on whatever raises their XP the
 *    most per Win (boots, perks, eggs);
 *  - rebirths the moment they hit MAX level.
 * It also checks the boots are paced right: each pair should be bought around
 * when the level for its first stage comes (never a long wall, never long
 * before), so every pair gets used.
 */
import {
  BOOTS,
  CHEST_COOLDOWN_MS,
  CONFIG,
  EGGS,
  GIFTS,
  JUMP_PADS,
  PET_BY_ID,
  SHOP_PERKS,
  STAGE_TABLE,
  applyXp,
  bestBootTier,
  bestPadRate,
  bestPets,
  chestReward,
  eggOpen,
  gainBreakdown,
  giftReward,
  hatch,
  jumpsFor,
  maxLevel,
  padOwned,
  perkPrice,
  petSlots,
  rarityOdds,
  stageOpen,
  stageWins,
  stepsPerSecond,
} from '../src/shared/progression.js'

const TARGETS = [9, 13, 18, 23, 32, 43]
const RUNS = 24
const showLevels = process.argv.includes('--levels')

const HAND = 0.55
const PAD = 0.35
const LUCKY = 1 + CONFIG.luckyChance * (CONFIG.luckyMult - 1)
/** A stage takes about this long to run (they grow along the course). */
const stageSeconds = (index) => 25 + 3 * index
const SESSION_SECONDS = 40 * 60

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PERK_FIELD = { gain: 'perkGain', wins: 'perkWins', speed: 'perkSpeed', luck: 'perkLuck', slots: 'perkSlots' }

function newPlayer() {
  return {
    level: 0,
    xp: 0,
    rebirths: 0,
    wins: 0,
    boot: 'starter',
    bootsOwned: 'starter',
    padsOwned: '',
    bestStage: 0,
    lifetimeLevels: 0,
    pass2xJump: false,
    boostUntil: 0,
    pets: [],
    petsEquipped: '',
    perkGain: 0,
    perkWins: 0,
    perkSpeed: 0,
    perkLuck: 0,
    perkSlots: 0,
  }
}

/** XP a second for this player right now (by hand and on their best jump pad). */
function xpPerSecond(p) {
  // Running about (80% of flat out) and jumping by hand, or bouncing on the best pad.
  const jumps = HAND * (CONFIG.handJumpRate + 0.8 * stepsPerSecond(p.boot, p.perkSpeed)) + PAD * bestPadRate(p)
  return jumps * gainBreakdown(p, { now: 0 }).total * LUCKY
}

function equipBest(p) {
  p.petsEquipped = bestPets(p.pets, petSlots(p)).join(',')
}

function buyBoot(p, boot) {
  p.bootsOwned = `${p.bootsOwned},${boot.id}`
  p.boot = boot.id
}

/** Every purchase on offer: { price, value (relative XP gain), buy }. */
function offers(p, rng) {
  const list = []
  const current = gainBreakdown(p, { now: 0 }).total
  const tier = bestBootTier(p)
  const next = BOOTS[tier + 1]
  if (next && !next.limited) {
    list.push({ what: `boots ${next.id}`, price: next.price, value: next.mult / BOOTS[tier].mult - 1, buy: () => buyBoot(p, next) })
  }
  // Jump pads sold for Wins: worth the extra XP a second they give.
  for (const pad of JUMP_PADS) {
    if (!pad.price || padOwned(p, pad) || p.rebirths < pad.rebirths) continue
    const padsOwned = [p.padsOwned, pad.id].filter(Boolean).join(',')
    list.push({
      what: `pad ${pad.id}`,
      price: pad.price,
      value: xpPerSecond({ ...p, padsOwned }) / xpPerSecond(p) - 1,
      buy: () => {
        p.padsOwned = padsOwned
      },
    })
  }
  for (const id of Object.keys(PERK_FIELD)) {
    const perk = SHOP_PERKS[id]
    const level = p[PERK_FIELD[id]]
    if (level >= perk.max) continue
    let value = 0
    if (id === 'gain') value = (1 + perk.per * (level + 1)) / (1 + perk.per * level) - 1
    if (id === 'wins') value = ((1 + perk.per * (level + 1)) / (1 + perk.per * level) - 1) * 0.5
    if (id === 'speed') value = 0.02
    if (id === 'luck') value = 0.05
    if (id === 'slots') {
      const sorted = [...p.pets].sort((a, b) => PET_BY_ID[b].bonus - PET_BY_ID[a].bonus)
      const extra = sorted[petSlots(p)]
      value = extra ? PET_BY_ID[extra].bonus / (current / gainBreakdown({ ...p, petsEquipped: '' }, { now: 0 }).total) : 0
    }
    list.push({
      what: `perk ${id}`,
      price: perkPrice(id, level),
      value,
      buy: () => {
        p[PERK_FIELD[id]] += 1
        if (id === 'slots') equipBest(p)
      },
    })
  }
  for (const egg of EGGS) {
    if (!eggOpen(p, egg) || p.pets.length >= CONFIG.petInventory) continue
    const odds = rarityOdds(p.perkLuck)
    const expected = egg.pets.reduce((sum, pet, i) => sum + odds[i] * pet.bonus, 0)
    const equipped = p.petsEquipped ? p.petsEquipped.split(',') : []
    const worst = equipped.length < petSlots(p) ? 0 : Math.min(...equipped.map((id) => PET_BY_ID[id].bonus))
    const petsMultNow = 1 + equipped.reduce((s, id) => s + PET_BY_ID[id].bonus, 0)
    list.push({
      what: `egg ${egg.id}`,
      price: egg.price,
      value: Math.max(0, expected - worst) / petsMultNow,
      buy: () => {
        p.pets.push(hatch(egg.id, p.perkLuck, rng()))
        equipBest(p)
      },
    })
  }
  return list
}

/**
 * The next pair of boots, once its stages are within this rebirth's reach:
 * worth saving every Win for (the HUD points at it the same way).
 */
function neededBoot(p) {
  const next = BOOTS[bestBootTier(p) + 1]
  if (!next || next.limited || !next.stages) return null
  return p.rebirths >= STAGE_TABLE[next.stages[0] - 1].rebirths ? next : null
}

function shop(p, rng, log) {
  for (let guard = 0; guard < 50; guard += 1) {
    // The next boots come first: buy them, or save up for them.
    const need = neededBoot(p)
    if (need) {
      if (p.wins < need.price) return
      p.wins -= need.price
      buyBoot(p, need)
      log?.push(`boots ${need.id}`)
      continue
    }
    const list = offers(p, rng).filter((o) => o.value > 0)
    if (!list.length) return
    list.sort((a, b) => b.value / b.price - a.value / a.price)
    const best = list[0]
    const pick = best.price <= p.wins ? best : list.find((o) => o.price <= p.wins && o.value / o.price >= 0.7 * (best.value / best.price))
    if (!pick) return
    p.wins -= pick.price
    pick.buy()
    log?.push(pick.what)
  }
}

function simulate(seed, verbose = false) {
  const rng = mulberry32(seed)
  const p = newPlayer()
  let t = 0
  let cycleStart = 0
  let farm = 0
  let stageBusy = 0
  let atMax = 0
  let nextChest = CHEST_COOLDOWN_MS / 1000
  const claimed = new Set()
  const rebirthTimes = []
  const levelTimes = []
  /** Per stage: when its level came, when its door opened, when it was beaten. */
  const stages = STAGE_TABLE.map(() => ({ level: null, door: null, beaten: null }))
  const buys = []
  const econ = []
  while (rebirthTimes.length < TARGETS.length && t < 6 * 3600) {
    // XP.
    const gained = applyXp(p.level, p.xp, xpPerSecond(p), p.rebirths)
    if (gained.gained && verbose) for (let l = p.level + 1; l <= gained.level; l += 1) levelTimes.push({ r: p.rebirths, level: l, t })
    p.lifetimeLevels += gained.gained
    p.level = gained.level
    p.xp = gained.xp

    // When each stage became possible (its level, its door).
    STAGE_TABLE.forEach((row, i) => {
      const s = stages[i]
      if (s.level === null && p.rebirths >= row.rebirths && jumpsFor(p.level, p.rebirths) >= row.jumps) s.level = t
      if (s.door === null && stageOpen(p, i + 1)) s.door = t
    })

    // Stages: the next one as soon as it's open and the level allows, then farming the best.
    const next = STAGE_TABLE[p.bestStage]
    if (stageBusy > 0) stageBusy -= 1
    else if (next && stageOpen(p, p.bestStage + 1) && jumpsFor(p.level, p.rebirths) >= next.jumps) {
      stageBusy = stageSeconds(p.bestStage + 1)
      p.bestStage += 1
      p.wins += stageWins(p.bestStage, p)
      stages[p.bestStage - 1].beaten = t
      stages[p.bestStage - 1].r = p.rebirths
      stages[p.bestStage - 1].lv = p.level
    } else if (p.bestStage > 0) {
      // Farm the best stage this player can get into and make.
      let best = p.bestStage
      while (best > 1 && (!stageOpen(p, best) || STAGE_TABLE[best - 1].jumps > jumpsFor(p.level, p.rebirths))) best -= 1
      farm += HAND
      if (farm >= stageSeconds(best)) {
        farm = 0
        p.wins += stageWins(best, p)
      }
    }

    // Chest and playtime gifts.
    if (t >= nextChest) {
      p.wins += chestReward(p).wins
      nextChest += CHEST_COOLDOWN_MS / 1000
    }
    const session = Math.floor(t / SESSION_SECONDS)
    const inSession = t - session * SESSION_SECONDS
    GIFTS.forEach((gift, i) => {
      const key = `${session}:${i}`
      if (claimed.has(key) || inSession < gift.minutes * 60) return
      claimed.add(key)
      const reward = giftReward(gift, p)
      if (reward.wins) p.wins += reward.wins
      if (reward.xp) {
        const g = applyXp(p.level, p.xp, reward.xp, p.rebirths)
        p.lifetimeLevels += g.gained
        p.level = g.level
        p.xp = g.xp
      }
    })

    if (t % 5 === 0) shop(p, rng, verbose ? buys : null)

    // Rebirth at MAX, after beating a stage they're already able to (or busy
    // with) — and after waiting up to 2.5 minutes for the boots it needs.
    const reachable = next && p.rebirths >= next.rebirths && jumpsFor(p.level, p.rebirths) >= next.jumps
    const beatable = reachable && stageOpen(p, p.bestStage + 1)
    const saving = reachable && !beatable && bestBootTier(p) + 1 === BOOTS.findIndex((b) => b.id === next.boot)
    if (p.level >= maxLevel(p.rebirths)) atMax += 1
    if (p.level >= maxLevel(p.rebirths) && !beatable && stageBusy === 0 && (!saving || atMax > 150)) {
      atMax = 0
      if (verbose) {
        const g = gainBreakdown(p, { now: 0 })
        econ.push(`r${p.rebirths}->${p.rebirths + 1} @${(t / 60).toFixed(1)}m: boots ${p.boot} x${g.boots} pets x${g.pets.toFixed(1)} shop x${g.shop} rebirth x${g.rebirth} = x${Math.round(g.total)} | xp/s ${Math.round(xpPerSecond(p))} | wins ${Math.round(p.wins)}`)
      }
      rebirthTimes.push((t - cycleStart) / 60)
      cycleStart = t
      p.rebirths += 1
      p.level = 0
      p.xp = 0
    }
    t += 1
  }
  return { rebirthTimes, levelTimes, stages, buys, econ, p }
}

function average(count, verboseFirst = false) {
  const runs = Array.from({ length: count }, (_, i) => simulate(1000 + i * 7919, verboseFirst && i === 0))
  return { runs, avg: TARGETS.map((_, i) => runs.reduce((s, r) => s + (r.rebirthTimes[i] ?? 999), 0) / count) }
}

const score = (avg) => Math.max(...avg.map((m, i) => Math.abs(m - TARGETS[i]) / TARGETS[i]))

/** Mean seconds each pair of boots kept players waiting after the level for its first stage (negative = bought early). */
function bootWaits(runs) {
  const out = {}
  STAGE_TABLE.forEach((row, i) => {
    if (i === 0 || STAGE_TABLE[i - 1].boot === row.boot) return
    const waits = runs.map((r) => (r.stages[i].door ?? 1e9) - (r.stages[i].level ?? 1e9)).filter((w) => Math.abs(w) < 1e8)
    if (waits.length >= runs.length / 2) out[row.boot] = waits.reduce((a, b) => a + b, 0) / waits.length
  })
  return out
}

/** Two significant figures: 1534 -> 1500. */
const nice = (n) => {
  if (n < 20) return Math.max(1, Math.round(n))
  const p = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / p) * p
}

/**
 * Boot prices: each pair should be bought about half a minute before the
 * level for its first stage comes. Nudges every price towards that (damped:
 * boots are XP too, so the levels move with them). Returns true when settled.
 */
function balancePrices(rounds, log = console.log) {
  const TARGET_WAIT = -30
  for (let round = 0; round < rounds; round += 1) {
    const { runs, avg } = average(12)
    const waits = bootWaits(runs)
    const changes = []
    for (const boot of BOOTS) {
      if (!(boot.id in waits)) continue
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(-(waits[boot.id] - TARGET_WAIT) / 400)))
      const price = nice(boot.price * factor)
      if (price !== boot.price) changes.push(`${boot.id} ${boot.price}->${price} (${Math.round(waits[boot.id])}s)`)
      boot.price = price
    }
    // Pairs no one reached keep growing like the ones before them.
    for (let i = 1; i < BOOTS.length; i += 1) {
      if (!(BOOTS[i].id in waits) && !BOOTS[i].limited && BOOTS[i - 1].price) BOOTS[i].price = Math.max(BOOTS[i].price, nice(BOOTS[i - 1].price * 3))
    }
    log(`  prices: rebirths ${avg.map((m) => m.toFixed(1)).join(' ')} | ${changes.join(', ') || 'settled'}`)
    if (!changes.length) return true
  }
  return false
}

/**
 * Each rebirth's time rises with its own XP factor (and the ones before),
 * so fit them in order by bisection: xpBase for rebirth #1, then the factor
 * of rebirth k for rebirth #k+1.
 */
function fitXp(log = console.log) {
  const timeOf = (i) => average(12).avg[i]
  const bisect = (set, lo, hi, i) => {
    for (let k = 0; k < 12; k += 1) {
      const mid = Math.sqrt(lo * hi)
      set(mid)
      if (timeOf(i) < TARGETS[i]) lo = mid
      else hi = mid
    }
    const value = Math.round(Math.sqrt(lo * hi) * 100) / 100
    set(value)
    return value
  }
  bisect((v) => (CONFIG.xpBase = v), 2, 400, 0)
  const factors = [...CONFIG.xpRebirth]
  for (let i = 0; i < factors.length; i += 1) {
    bisect((v) => {
      factors[i] = v
      CONFIG.xpRebirth = [...factors]
    }, 0.5, 64, i + 1)
  }
  log(`  xp: xpBase ${CONFIG.xpBase}, xpRebirth ${JSON.stringify(CONFIG.xpRebirth)}`)
}

if (process.argv.includes('--balance')) {
  // XP curve and boot prices together: fit, nudge prices, fit again...
  for (let outer = 0; outer < 5; outer += 1) {
    console.log(`pass ${outer + 1}`)
    fitXp()
    if (balancePrices(3) && outer > 0) break
  }
  fitXp()
  console.log('prices', BOOTS.map((b) => `${b.id}: ${b.price}`).join(', '))
  process.exit(0)
}

if (process.argv.includes('--fit')) {
  fitXp()
  process.exit(0)
}

if (process.argv.includes('--tune')) {
  // Coordinate search over the XP curve: nudge one knob at a time, keep what
  // lowers the misses (squared), halve the steps when stuck.
  const r = CONFIG.xpRebirth
  const knobs = {
    xpBase: { value: CONFIG.xpBase, step: 0.5, min: 2, max: 200 },
    r1: { value: r[0], step: 0.1, min: 1, max: 4.5 },
    r2: { value: r[1], step: 0.1, min: 1, max: 4.5 },
    r3: { value: r[2], step: 0.1, min: 1, max: 4.5 },
    r4: { value: r[3], step: 0.1, min: 1, max: 4.5 },
    r5: { value: r[4], step: 0.1, min: 1, max: 4.5 },
  }
  const apply = () => {
    CONFIG.xpBase = knobs.xpBase.value
    CONFIG.xpRebirth = [knobs.r1.value, knobs.r2.value, knobs.r3.value, knobs.r4.value, knobs.r5.value]
  }
  const evaluate = () => {
    apply()
    const { avg } = average(12)
    const s = avg.reduce((sum, m, i) => sum + ((m - TARGETS[i]) / TARGETS[i]) ** 2, 0)
    return { s, worst: score(avg), avg }
  }
  let best = evaluate()
  for (let round = 0; round < 10; round += 1) {
    let improved = false
    for (const [name, k] of Object.entries(knobs)) {
      for (const dir of [1, -1]) {
        const old = k.value
        k.value = Math.round(Math.min(k.max, Math.max(k.min, old + dir * k.step)) * 1000) / 1000
        const res = evaluate()
        if (res.s < best.s) {
          best = res
          improved = true
          console.log(`  ${name} ${old} -> ${k.value}: worst miss ${Math.round(res.worst * 100)}%  ${res.avg.map((m) => m.toFixed(1)).join(' ')}`)
        } else k.value = old
      }
    }
    if (!improved) for (const k of Object.values(knobs)) k.step /= 2
  }
  apply()
  console.log('best', JSON.stringify(Object.fromEntries(Object.entries(knobs).map(([n, k]) => [n, k.value]))), 'worst miss', `${Math.round(best.worst * 100)}%`)
  process.exit(0)
}

const { runs, avg } = average(RUNS, true)
const first = runs[0]
const fmt = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`

console.log('\nTime per rebirth (minutes, average of', RUNS, 'players):')
console.log('rebirth  MAX  target   sim    off')
let ok = true
avg.forEach((m, i) => {
  const off = (m - TARGETS[i]) / TARGETS[i]
  const good = Math.abs(off) <= 0.15
  ok &&= good
  console.log(`  #${i + 1}     ${String(maxLevel()).padStart(2)}   ${String(TARGETS[i]).padStart(3)}    ${fmt(m).padStart(5)}  ${(off >= 0 ? '+' : '') + Math.round(off * 100)}%${good ? '' : '  !'}`)
})
const total = avg.reduce((a, b) => a + b, 0)
console.log(`  total to rebirth #6: ${fmt(total)}`)

// Boots pacing, averaged over every player: for a stage that needs new boots,
// how long the boots kept the player waiting after their level was ready
// (wall), or how long before the level they were bought (early).
console.log('\nStages (first player) and boots pacing (average of every player):')
console.log('stage  boots            level  jumps  beaten   level ready  door open  boots wait')
let paced = true
STAGE_TABLE.forEach((row, i) => {
  const s = first.stages[i]
  const newBoots = i === 0 || STAGE_TABLE[i - 1].boot !== row.boot
  let wait = ''
  if (newBoots && i > 0) {
    const waits = runs.map((r) => (r.stages[i].door ?? 1e9) - (r.stages[i].level ?? 1e9)).filter((w) => Math.abs(w) < 1e8)
    const mean = waits.reduce((a, b) => a + b, 0) / Math.max(1, waits.length)
    // Waiting on boots for over a tenth of that rebirth's target time, or
    // buying them over four tenths early, is off (90 s and 6 min in World 1).
    const span = TARGETS[Math.min(row.rebirths, TARGETS.length - 1)] * 60
    const good = mean <= Math.max(90, span * 0.1) && mean >= -Math.max(360, span * 0.4)
    paced &&= good
    wait = `${mean >= 0 ? 'wall ' : 'early '}${Math.round(Math.abs(mean))}s${good ? '' : '  !'}`
  }
  const at = (v) => (v === null || v === undefined ? '   -  ' : fmt(v / 60).padStart(6))
  const boot = BOOTS.find((b) => b.id === row.boot)
  console.log(`  ${String(i + 1).padStart(2)}   ${boot.name.padEnd(16)} L${String(row.level).padStart(2)}    ${String(row.jumps).padStart(2)}   ${at(s.beaten)}    ${at(s.level)}     ${at(s.door)}    ${wait}`)
})

if (showLevels) {
  console.log('\nLevels (first player):')
  let line = []
  let r = 0
  for (const l of first.levelTimes) {
    if (l.r !== r) {
      console.log(`  r${r}: ${line.join(' ')}`)
      line = []
      r = l.r
    }
    line.push(`L${l.level}@${fmt(l.t / 60)}`)
  }
  if (line.length) console.log(`  r${r}: ${line.join(' ')}`)
  console.log('\nPurchases (first player):', first.buys.join(', '))
}

console.log('\nEconomy at each rebirth (first player):')
for (const line of first.econ) console.log(`  ${line}`)

const end = first.p
console.log(`\nAfter rebirth #6 (first player): boots ${end.boot}, perks gain ${end.perkGain} wins ${end.perkWins} speed ${end.perkSpeed} luck ${end.perkLuck} slots ${end.perkSlots}, ${end.pets.length} pets (x${(1 + bestPets(end.pets, petSlots(end)).reduce((s, id) => s + PET_BY_ID[id].bonus, 0)).toFixed(1)}), ${Math.round(end.wins)} Wins left`)
const stage1 = first.stages[0].beaten
console.log(stage1 !== null && stage1 <= 60 ? `Stage 1 beaten at ${stage1}s (within the first minute) ✓` : `Stage 1 beaten at ${stage1}s — too slow!`)
console.log(paced ? 'Every pair of boots arrives on time (no long walls).' : 'Some boots are paced badly (see "!").')
console.log(ok ? '\nAll rebirth times are within ±15% of the targets.' : '\nSome rebirth times are off by more than 15%.')
process.exitCode = ok && paced ? 0 : 1
