import { sound } from '../audio/sound'
import { send } from '../net/connection'
import { BOOT_BY_ID, TRAMPOLINE_BY_ID, formatDuration, formatNumber, multLabel, parseList } from '../shared/gameData.js'
import { gameState } from '../store/gameStore'

/**
 * "Press E": what the lobby thing you're standing at offers, and doing it.
 * Shared by the keyboard, the on-screen prompt and the touch E button.
 */

export function bootStatus(me, id, hydraLeft) {
  const def = BOOT_BY_ID[id]
  if (me.boot === id) return 'equipped'
  if (parseList(me.bootsOwned).includes(id)) return 'owned'
  if (def.limited && hydraLeft <= 0) return 'soldout'
  return me.wins >= def.price ? 'buy' : 'poor'
}

const ownsTramp = (me, id) => TRAMPOLINE_BY_ID[id]?.price === 0 || parseList(me.tramps).includes(id)

/** { icon, text, active } for the prompt, or null when there's nothing to say. */
export function promptInfo(prompt, me, hydraLeft) {
  if (!prompt || !me) return null
  const now = Date.now()
  switch (prompt.kind) {
    case 'boot': {
      const def = BOOT_BY_ID[prompt.id]
      const status = bootStatus(me, prompt.id, hydraLeft)
      if (status === 'equipped') return { icon: '✓', text: `Wearing ${def.name}`, active: false }
      if (status === 'owned') return { icon: 'E', text: `Equip ${def.name}`, active: true }
      if (status === 'soldout') return { icon: '🔒', text: `${def.name} · SOLD OUT`, active: false }
      const price = def.price ? `🏆 ${formatNumber(def.price)}` : 'FREE'
      return { icon: 'E', text: `Buy ${def.name} · ${price}`, active: status === 'buy', poor: status === 'poor' }
    }
    case 'tramp': {
      const def = TRAMPOLINE_BY_ID[prompt.id]
      if (ownsTramp(me, prompt.id)) return { icon: '⏫', text: `Bounce here for ${multLabel(def.mult)} Jump!`, active: false }
      return { icon: 'E', text: `Unlock ${multLabel(def.mult)} Trampoline · 🏆 ${formatNumber(def.price)}`, active: me.wins >= def.price, poor: me.wins < def.price }
    }
    case 'checkpoint':
      if ((me.bestStage || 0) < 1) return { icon: '🔒', text: 'Beat Stage 1 to unlock checkpoints', active: false }
      return { icon: 'E', text: `Teleport to Stage ${me.bestStage}`, active: true }
    case 'trails':
      return { icon: 'E', text: 'Open the Trails shop', active: true }
    case 'chest': {
      const wait = me.chestAt - now
      if (wait > 0) return { icon: '⏳', text: `Free Chest refills in ${formatDuration(wait)}`, active: false }
      return { icon: 'E', text: 'Open the Free Chest!', active: true }
    }
    default:
      return null
  }
}

/** Does what the prompt offers. */
export function interact(prompt, me, hydraLeft) {
  if (!prompt || !me) return
  const store = gameState()
  switch (prompt.kind) {
    case 'boot': {
      const def = BOOT_BY_ID[prompt.id]
      const status = bootStatus(me, prompt.id, hydraLeft)
      if (status === 'equipped') return
      if (status === 'poor') {
        sound.error()
        store.toast(`Need 🏆 ${formatNumber(def.price - me.wins)} more Wins!`, 'error')
        return
      }
      if (status === 'soldout') {
        sound.error()
        return
      }
      sound.click()
      send(status === 'owned' ? 'equip' : 'buy', { cat: 'boot', id: prompt.id })
      return
    }
    case 'tramp': {
      const def = TRAMPOLINE_BY_ID[prompt.id]
      if (ownsTramp(me, prompt.id)) return
      if (me.wins < def.price) {
        sound.error()
        store.toast(`Need 🏆 ${formatNumber(def.price - me.wins)} more Wins!`, 'error')
        return
      }
      sound.click()
      send('buy', { cat: 'tramp', id: prompt.id })
      return
    }
    case 'checkpoint':
      if ((me.bestStage || 0) < 1) {
        sound.error()
        return
      }
      sound.click()
      if (me.bestStage > 1) store.openPanel('teleport')
      else send('checkpoint', { stage: 1 })
      return
    case 'trails':
      sound.click()
      store.openPanel('trails')
      return
    case 'chest':
      if (me.chestAt > Date.now()) return
      sound.click()
      send('claim', { what: 'chest' })
      return
    default:
  }
}
