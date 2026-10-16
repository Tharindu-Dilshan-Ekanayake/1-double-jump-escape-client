import { BOOT_BY_ID, EGG_BY_ID, PAD_BY_ID, PET_BY_ID, PRODUCTS, RARITIES, SHOP_PERKS, TRAIL_BY_ID, formatDuration, formatNumber } from '../shared/gameData.js'

/**
 * The words for every action result. The server only ever answers with codes
 * (`{ action, ok, code, ... }`); what the player reads is decided here, by the
 * client — no server text is ever shown.
 *
 * Returns { text, kind } or null (nothing to say).
 */
export function resultMessage(m) {
  const need = m.need ? `Need 🏆 ${formatNumber(m.need)} more Wins!` : 'Not enough Wins!'
  if (!m.ok) {
    switch (m.code) {
      case 'poor':
        return { text: need, kind: 'error' }
      case 'owned':
        return { text: 'You already own this!', kind: 'info' }
      case 'soldout':
        return { text: 'Sold out! Every pair is gone.', kind: 'error' }
      case 'notOwned':
        return { text: "You don't own that yet!", kind: 'error' }
      case 'notReady':
        return m.action === 'rebirth' ? { text: 'Reach level 15 to rebirth!', kind: 'error' } : { text: 'Not ready yet!', kind: 'info' }
      case 'cooldown':
        return { text: `Chest refills in ${formatDuration((m.at ?? Date.now()) - Date.now())}`, kind: 'info' }
      case 'claimed':
        return { text: 'Already claimed!', kind: 'info' }
      case 'locked':
        if (m.cat === 'egg') return { text: `🔒 Rebirth ${m.need} time${m.need > 1 ? 's' : ''} to open this egg!`, kind: 'error' }
        if (m.cat === 'trail') return { text: `🔒 Reach Stage ${m.stage} to unlock this trail!`, kind: 'error' }
        if (m.boot) return { text: `🔒 This stage needs ${BOOT_BY_ID[m.boot]?.name ?? 'better boots'}!`, kind: 'error' }
        return { text: 'Rebirth more to use this!', kind: 'error' }
      case 'order':
        return { text: `Buy ${BOOT_BY_ID[m.need]?.name ?? 'the boots before'} first!`, kind: 'error' }
      case 'maxed':
        return { text: 'Already maxed out!', kind: 'info' }
      case 'full':
        return { text: 'Your pet bag is full! Delete some pets first.', kind: 'error' }
      case 'slots':
        return { text: 'No free pet slot! Unequip one or buy more slots.', kind: 'error' }
      case 'noStage':
        return { text: 'Beat Stage 1 first!', kind: 'info' }
      default:
        return null
    }
  }

  switch (m.code) {
    case 'bought':
      if (m.cat === 'boot') {
        const boot = BOOT_BY_ID[m.id]
        const opens = boot?.stages ? ` · Stages ${boot.stages[0]}-${boot.stages[1]} open!` : ''
        return { text: `🥾 ${boot?.name}! x${boot?.mult} XP · ⚡ ${boot?.speed} speed${opens}`, kind: 'success' }
      }
      if (m.cat === 'trail') return { text: `✨ ${TRAIL_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      if (m.cat === 'pad') return { text: `🦘 ${PAD_BY_ID[m.id]?.name} is yours! ${PAD_BY_ID[m.id]?.rate} jumps a second`, kind: 'success' }
      if (m.cat === 'perk') return { text: `${SHOP_PERKS[m.id]?.icon} ${SHOP_PERKS[m.id]?.name} level ${m.level}!`, kind: 'success' }
      if (m.cat === 'product' && PRODUCTS[m.id] && !PRODUCTS[m.id].minutes) return { text: `${PRODUCTS[m.id].name} unlocked forever!`, kind: 'success' }
      return null
    case 'hatched': {
      const pet = PET_BY_ID[m.pet]
      return pet ? { text: `🥚 ${EGG_BY_ID[m.id]?.name}: ${RARITIES[pet.rarity].name} ${pet.name}! (+${Math.round(pet.bonus * 100)}%)`, kind: 'success' } : null
    }
    case 'equipped':
      if (m.cat === 'boot') return { text: `🥾 ${BOOT_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      if (m.cat === 'trail') return { text: `✨ ${TRAIL_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      return null
    case 'rebirth':
      return { text: `REBIRTH #${formatNumber(m.rebirths)}! +1 jump (${m.jumps} at level 0) · x${formatNumber(m.mult)} XP`, kind: 'success' }
    default:
      return null
  }
}
