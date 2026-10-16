import { sound } from '../../audio/sound'
import { send } from '../../net/connection'
import { formatNumber } from '../../shared/gameData.js'
import { gameState } from '../../store/gameStore'

/** Click handler that sends a server action with a click sound. */
export function action(type, payload) {
  return () => {
    sound.click()
    send(type, payload)
  }
}

/**
 * Buy something that costs `price` Wins. Checked here first so a click you
 * can't afford answers instantly (the server checks again).
 */
export function purchase(me, price, payload) {
  return () => {
    if (me.wins < price) {
      sound.error()
      gameState().toast(`Need 🏆 ${formatNumber(price - me.wins)} more Wins!`, 'error')
      return
    }
    sound.click()
    send('buy', payload)
  }
}
