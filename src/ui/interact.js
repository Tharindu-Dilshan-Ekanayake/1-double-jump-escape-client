import { sound } from '../audio/sound'
import { send } from '../net/connection'
import { BOOTS, BOOT_BY_ID, EGG_BY_ID, PAD_BY_ID, WORLD_BY_ID, formatDuration, formatNumber } from '../shared/gameData.js'
import { gameState } from '../store/gameStore'
import { progressState } from '../store/progression'

/**
 * "Press E": what the lobby thing you're standing at offers, and doing it.
 * Shared by the keyboard, the on-screen prompt and the touch E button. Prices
 * and states come from the progression store.
 */

const bootState = (id) => progressState().boots?.find((b) => b.id === id)

/** { icon, text, active, poor } for the prompt, or null when there's nothing to say. */
export function promptInfo(prompt, me) {
  if (!prompt || !me) return null
  const now = Date.now()
  const progress = progressState()
  switch (prompt.kind) {
    case 'boot': {
      const boot = bootState(prompt.id)
      if (!boot) return null
      const opens = boot.stages ? ` · opens Stages ${boot.stages[0]}-${boot.stages[1]}` : ''
      if (boot.state === 'equipped') return { icon: '✓', text: `Wearing ${boot.name} (x${boot.mult} XP, ${boot.speed} speed)`, active: false }
      if (boot.state === 'owned') return { icon: 'E', text: `Wear ${boot.name}`, active: true }
      if (boot.state === 'soldout') return { icon: '🔒', text: `${boot.name} · SOLD OUT`, active: false }
      if (boot.state === 'locked') return { icon: '🔒', text: `Buy ${BOOTS[boot.tier - 1]?.name ?? 'the boots before'} first`, active: false }
      const price = boot.price ? `🏆 ${formatNumber(boot.price)}` : 'FREE'
      return { icon: 'E', text: `Buy ${boot.name} · ${price}${opens}`, active: boot.state === 'buy', poor: boot.state === 'poor' }
    }
    case 'jumpPad': {
      const def = PAD_BY_ID[prompt.id]
      const pad = progress.pads?.find((p) => p.id === prompt.id)
      if (pad?.open) return { icon: '🦘', text: `${def.name}: ${def.rate} jumps a second while you stand on it`, active: false }
      if (def.price && !pad?.owned) {
        return { icon: 'E', text: `Buy the ${def.name} · 🏆 ${formatNumber(def.price)} · ${def.rate} jumps a second`, active: Boolean(pad?.affordable), poor: !pad?.affordable }
      }
      return { icon: '🔒', text: `${def.name} · Rebirth ${def.rebirths} time${def.rebirths > 1 ? 's' : ''} to unlock`, active: false }
    }
    case 'egg': {
      const egg = progress.eggs?.find((e) => e.id === prompt.id)
      if (!egg) return null
      if (!egg.open) return { icon: '🔒', text: `${egg.name} · Rebirth ${egg.rebirths} time${egg.rebirths > 1 ? 's' : ''} to unlock`, active: false }
      return { icon: 'E', text: `Hatch the ${egg.name} · 🏆 ${formatNumber(egg.price)}`, active: egg.affordable, poor: !egg.affordable }
    }
    case 'winsShop':
      return { icon: 'E', text: 'Open the Wins Shop', active: true }
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
    case 'world': {
      const world = WORLD_BY_ID[prompt.id]
      if ((me.rebirths ?? 0) < world.rebirths) {
        return { icon: '🔒', text: `${world.name} · Rebirth ${world.rebirths > 1 ? `${world.rebirths} times` : 'once'} to unlock`, active: false }
      }
      return { icon: 'E', text: world.id === 1 ? 'Back to World 1' : `Go to ${world.name}!`, active: true }
    }
    default:
      return null
  }
}

function needWins(me, price) {
  sound.error()
  gameState().toast(`Need 🏆 ${formatNumber(price - me.wins)} more Wins!`, 'error')
}

/** Does what the prompt offers. */
export function interact(prompt, me) {
  if (!prompt || !me) return
  const store = gameState()
  const progress = progressState()
  switch (prompt.kind) {
    case 'boot': {
      const boot = bootState(prompt.id)
      if (!boot || boot.state === 'equipped' || boot.state === 'soldout') return
      if (boot.state === 'locked') {
        sound.error()
        store.openPanel('boots')
        return
      }
      if (boot.state === 'poor') {
        needWins(me, BOOT_BY_ID[prompt.id].price)
        return
      }
      sound.click()
      send(boot.state === 'owned' ? 'equip' : 'buy', { cat: 'boot', id: prompt.id })
      return
    }
    case 'jumpPad': {
      const def = PAD_BY_ID[prompt.id]
      const pad = progress.pads?.find((p) => p.id === prompt.id)
      if (!def?.price || pad?.owned) return
      if (!pad?.affordable) {
        needWins(me, def.price)
        return
      }
      sound.click()
      send('buy', { cat: 'pad', id: prompt.id })
      return
    }
    case 'egg': {
      const egg = progress.eggs?.find((e) => e.id === prompt.id)
      if (!egg?.open) {
        sound.error()
        return
      }
      if (!egg.affordable) {
        needWins(me, EGG_BY_ID[prompt.id].price)
        return
      }
      sound.click()
      send('buy', { cat: 'egg', id: prompt.id })
      return
    }
    case 'winsShop':
      sound.click()
      store.openPanel('winsShop')
      return
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
    case 'world':
      goToWorld(prompt.id, me)
      return
    default:
  }
}

/** Asks the server to go to world `id` (or shows what it takes when it's locked). */
export function goToWorld(id, me) {
  const world = WORLD_BY_ID[id]
  if (!world || !me) return
  if ((me.rebirths ?? 0) < world.rebirths) {
    sound.error()
    gameState().openPanel('rebirth')
    return
  }
  sound.click()
  send('world', { id })
}
