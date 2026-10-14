import {
  BOOT_BY_ID,
  PRODUCTS,
  TRAIL_BY_ID,
  TRAMPOLINE_BY_ID,
  formatDuration,
  formatNumber,
  multLabel,
} from '../shared/gameData.js'

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
        return m.action === 'rebirth' ? { text: 'Reach MAX level to rebirth!', kind: 'error' } : { text: 'Not ready yet!', kind: 'info' }
      case 'cooldown':
        return { text: `Chest refills in ${formatDuration((m.at ?? Date.now()) - Date.now())}`, kind: 'info' }
      case 'claimed':
        return { text: 'Already claimed!', kind: 'info' }
      case 'badCode':
        return { text: 'Invalid code', kind: 'error' }
      case 'usedCode':
        return { text: 'Code already used!', kind: 'info' }
      case 'locked':
        return { text: 'Rebirth more to use this pad!', kind: 'error' }
      case 'noStage':
        return { text: 'Beat Stage 1 first!', kind: 'info' }
      default:
        return null
    }
  }

  switch (m.code) {
    case 'bought':
      if (m.cat === 'boot') return { text: `🥾 ${BOOT_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      if (m.cat === 'tramp') return { text: `Unlocked the ${multLabel(TRAMPOLINE_BY_ID[m.id]?.mult)} Trampoline!`, kind: 'success' }
      if (m.cat === 'trail') return { text: `✨ ${TRAIL_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      if (m.cat === 'product' && PRODUCTS[m.id] && !PRODUCTS[m.id].jump) return { text: `${PRODUCTS[m.id].name} unlocked forever!`, kind: 'success' }
      return null
    case 'equipped':
      if (m.cat === 'boot') return { text: `🥾 ${BOOT_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      if (m.cat === 'trail') return { text: `✨ ${TRAIL_BY_ID[m.id]?.name} equipped!`, kind: 'success' }
      return null
    case 'rebirth':
      return { text: `REBIRTH! You have ${formatNumber(m.rebirths)} now`, kind: 'success' }
    default:
      return null
  }
}
