import { create } from 'zustand'

import {
  BOOTS,
  CONFIG,
  DAILY_MAX_STREAK,
  EGGS,
  GIFTS,
  JUMP_PADS,
  PET_BY_ID,
  PRODUCTS,
  RARITIES,
  SHOP_PERKS,
  STAGE_TABLE,
  TITLES,
  WORLDS,
  XP_PACKS,
  bestBootTier,
  canRebirth,
  dailyReward,
  eggOpen,
  gainBreakdown,
  giftReward,
  maxLevel,
  minutesOfXp,
  mostImportant,
  moveStats,
  nextBoot,
  nextGoal,
  nextJumpLevel,
  padOpen,
  padOwned,
  parseList,
  parsePets,
  perkLevel,
  perkPrice,
  petSlots,
  petsMult,
  productPrice,
  rarityOdds,
  rebirthMult,
  rebirthProgress,
  stageNeeds,
  titleIndex,
  trainingRate,
  winsMult,
  winsUnit,
  xpToNext,
  jumpsFor,
} from '../shared/gameData.js'
import { useGameStore } from './gameStore'

/**
 * The client's one progression store.
 *
 * Everything the HUD, panels and lobby labels show about levels, XP, jumps,
 * speed, rebirth, boots, jump pads, the Wins Shop, pets, titles, what the
 * next stage needs, the next goal and the red "!" — derived from the
 * server's numbers (`me` in the game store) with the formulas in
 * shared/progression.js, recomputed when they change (and once a second, for
 * timed boosts). Components only read it: no progression math in
 * components. The server alone decides what anyone earns; this is how it
 * looks.
 *
 * It also keeps the last gain report from the server (lucky jumps, pads).
 */

const EMPTY = { ready: false }

function derive(me, hydraLeft, now) {
  if (!me) return EMPTY
  const level = me.level ?? 0
  const rebirths = me.rebirths ?? 0
  const max = maxLevel()
  const isMax = level >= max
  const xpNeed = isMax ? 0 : xpToNext(level, rebirths)
  const stats = moveStats(level, me.boot, me.perkSpeed, rebirths)
  const breakdown = gainBreakdown(me, { now })
  const ownedBoots = parseList(me.bootsOwned)
  const tier = bestBootTier(me)
  const next = nextBoot(me)
  const tIndex = titleIndex(me.lifetimeLevels ?? 0)
  const ownedPets = parsePets(me.pets)
  const equippedPets = parsePets(me.petsEquipped)
  const slots = petSlots(me)

  const boots = BOOTS.map((boot, i) => {
    const owned = ownedBoots.includes(boot.id)
    let state = 'buy'
    if (me.boot === boot.id) state = 'equipped'
    else if (owned) state = 'owned'
    else if (boot.limited && hydraLeft <= 0) state = 'soldout'
    else if (i > tier + 1) state = 'locked'
    else if (me.wins < boot.price) state = 'poor'
    return { ...boot, tier: i, owned, state, isNext: next?.id === boot.id }
  })

  const perks = Object.entries(SHOP_PERKS).map(([id, perk]) => {
    const lvl = perkLevel(me, id)
    const maxed = lvl >= perk.max
    const price = maxed ? 0 : perkPrice(id, lvl)
    return { id, ...perk, level: lvl, maxed, price, affordable: !maxed && me.wins >= price }
  })

  const odds = rarityOdds(perkLevel(me, 'luck'))
  const eggs = EGGS.map((egg) => ({
    ...egg,
    open: eggOpen(me, egg),
    affordable: me.wins >= egg.price,
    odds: egg.pets.map((pet, i) => ({ ...pet, rarity: RARITIES[i], chance: odds[i] })),
  }))

  // Pets grouped by type: how many you own and how many are equipped.
  const petCounts = new Map()
  for (const id of ownedPets) {
    const pet = PET_BY_ID[id]
    petCounts.set(id, { id, ...pet, rarityName: RARITIES[pet.rarity].name, rarityColor: RARITIES[pet.rarity].color, owned: (petCounts.get(id)?.owned ?? 0) + 1, equipped: 0 })
  }
  for (const id of equippedPets) if (petCounts.has(id)) petCounts.get(id).equipped += 1
  const petList = [...petCounts.values()].sort((a, b) => b.bonus - a.bonus)

  const packs = XP_PACKS.map((id) => ({ id, ...PRODUCTS[id], price: productPrice(id, me), xp: minutesOfXp(me, PRODUCTS[id].minutes) }))
  const passes = ['pass2xJump', 'pass2xWins'].map((id) => ({ id, ...PRODUCTS[id], price: productPrice(id, me), owned: Boolean(me[id]) }))

  // What the next stage needs, and what's missing.
  const best = me.bestStage ?? 0
  let nextStage = null
  if (best < STAGE_TABLE.length) {
    const needs = stageNeeds(best + 1)
    const missing = {
      boot: tier < needs.bootTier ? BOOTS[needs.bootTier] : null,
      jumps: stats.jumps < needs.jumps ? needs.jumps : null,
      rebirths: rebirths < needs.rebirths ? needs.rebirths : null,
    }
    nextStage = { index: best + 1, ...needs, bootName: BOOTS[needs.bootTier].name, missing, ready: !missing.boot && !missing.jumps && !missing.rebirths }
  }

  const nextRebirth = {
    mult: rebirthMult(rebirths + 1),
    max,
    /** Jumps at level 0 and at level 15 after the rebirth (one more each). */
    jumps: [jumpsFor(0, rebirths + 1), jumpsFor(max, rebirths + 1)],
    wins: Math.round((winsMult({ ...me, rebirths: rebirths + 1 }) - 1) * 100),
    pad: JUMP_PADS.find((p) => p.rebirths === rebirths + 1) ?? null,
    egg: EGGS.find((e) => e.rebirths === rebirths + 1) ?? null,
    world: WORLDS.find((w) => w.rebirths === rebirths + 1) ?? null,
    stages: STAGE_TABLE.map((row, i) => (row.rebirths === rebirths + 1 ? i + 1 : 0)).filter(Boolean),
  }

  return {
    ready: true,
    level,
    maxLevel: max,
    isMax,
    xp: me.xp ?? 0,
    xpNeed,
    xpFill: isMax ? 1 : Math.max(0, Math.min(1, (me.xp ?? 0) / xpNeed)),
    jumps: stats.jumps,
    speed: stats.speed,
    height: stats.height,
    nextJumpLevel: nextJumpLevel(level),
    /** Jumps that come from rebirths (one each). */
    rebirthJumps: jumpsFor(0, rebirths) - jumpsFor(0, 0),
    breakdown,
    /** XP one jump pays (before luck). */
    xpPerJump: breakdown.total,
    /** Jumps a second at your best training (jump pad, or by hand). */
    trainingRate: trainingRate(me),
    winsMult: winsMult(me),
    rebirths,
    rebirthMult: rebirthMult(rebirths),
    canRebirth: canRebirth(me),
    rebirthProgress: rebirthProgress(me),
    rebirth: {
      now: { mult: rebirthMult(rebirths), max, jumps: [jumpsFor(0, rebirths), jumpsFor(max, rebirths)], wins: Math.round((winsMult(me) - 1) * 100) },
      next: nextRebirth,
    },
    lifetimeLevels: me.lifetimeLevels ?? 0,
    titleIndex: tIndex,
    title: TITLES[tIndex],
    nextTitle: TITLES[tIndex + 1] ?? null,
    goal: nextGoal(me),
    badge: mostImportant(me, { hydraLeft }),
    boots,
    bootTier: tier,
    nextBoot: next,
    nextStage,
    perks,
    eggs,
    pets: { list: petList, count: ownedPets.length, capacity: CONFIG.petInventory, equipped: equippedPets, slots, mult: petsMult(me) },
    // open: you can train on it; owned: free or bought; affordable: Wins for a pad on sale.
    pads: JUMP_PADS.map((p) => ({ ...p, open: padOpen(me, p), owned: padOwned(me, p), affordable: (me.wins ?? 0) >= (p.price ?? 0) })),
    packs,
    passes,
    gifts: GIFTS.map((gift) => ({ ...gift, reward: giftReward(gift, me) })),
    daily: Array.from({ length: DAILY_MAX_STREAK }, (_, i) => dailyReward(me, i + 1)),
    winsUnit: winsUnit(me),
    boostActive: (me.boostUntil ?? 0) > now,
  }
}

export const useProgress = create(() => ({
  ...EMPTY,
  /** The last gain report: when, lucky jumps so far, and the rate of the jump pad it came from (0: by hand). */
  gains: { at: 0, lucky: 0, luckyAt: 0, pad: 0 },
}))

export const progressState = () => useProgress.getState()

function recompute() {
  const { me, hydraLeft } = useGameStore.getState()
  useProgress.setState(derive(me, hydraLeft, Date.now()))
}

let lastMe = null
let lastHydra = null
useGameStore.subscribe((state) => {
  if (state.me === lastMe && state.hydraLeft === lastHydra) return
  lastMe = state.me
  lastHydra = state.hydraLeft
  recompute()
})
// Timed boosts run out on their own.
setInterval(() => {
  if (useGameStore.getState().me) recompute()
}, 1000)

/** A gain report from the server: { n, jumps, lucky, pad (the jump pad's rate, or 0) }. */
export function reportGains({ lucky = 0, pad = 0 }) {
  const now = Date.now()
  const gains = progressState().gains
  useProgress.setState({ gains: { at: now, lucky: gains.lucky + lucky, luckyAt: lucky ? now : gains.luckyAt, pad } })
}
