import { formatNumber } from '../shared/gameData.js'

/**
 * Fire-and-forget DOM effects: the "+27 Jump" star popups, reward pops, screen
 * flashes and confetti. They live outside React because they fire several times
 * a second and never need re-rendering — each element animates via CSS and
 * removes itself.
 */

let layer = null
let liveGainPops = 0

function getLayer() {
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'fx-layer'
    document.body.appendChild(layer)
  }
  return layer
}

/** The yellow star from the original's "+Jump" popups. */
export const STAR_ICON = `
<svg viewBox="0 0 64 64" width="1.25em" height="1.25em" aria-hidden="true">
  <path d="M32 4l8.6 17.4 19.2 2.8-13.9 13.5 3.3 19.1L32 47.8 14.8 56.8l3.3-19.1L4.2 24.2l19.2-2.8z" fill="#ffd23a" stroke="#15151d" stroke-width="4" stroke-linejoin="round"/>
  <path d="M32 12l5.9 12 13.2 1.9" fill="none" stroke="#fff6c8" stroke-width="3" stroke-linecap="round"/>
</svg>`

/**
 * "+27 Jump" with a star, floating up near the player (a little to either side
 * of the centre of the screen). `boosted` paints it gold (trampolines, passes).
 */
export function spawnGainPopup(amount, boosted = false) {
  if (liveGainPops > 10) return
  liveGainPops += 1
  const el = document.createElement('div')
  el.className = `gain-pop game-text${boosted ? ' boosted' : ''}`
  el.innerHTML = `${STAR_ICON}<span>+${formatNumber(amount)} Jump</span>`
  const side = Math.random() < 0.5 ? -1 : 1
  el.style.left = `${50 + side * (6 + Math.random() * 14)}%`
  el.style.top = `${34 + Math.random() * 22}%`
  getLayer().appendChild(el)
  el.addEventListener('animationend', () => {
    el.remove()
    liveGainPops -= 1
  })
}

/** Big centred pop for wins / purchases. `kind`: 'wins' | 'reward' | 'jump'. */
export function spawnRewardPopup(text, kind = 'reward') {
  const el = document.createElement('div')
  el.className = `reward-pop title-text reward-${kind}`
  const icon = kind === 'wins' ? ' 🏆' : ''
  el.textContent = `${text}${icon}`
  getLayer().appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}

const STAR_HINTS = ['', 'Clear it without a revive for ★★', 'Beat the par time for ★★★', 'All stars!']

/**
 * "★★★ Stage 4" card: the stage's stars, the newly earned ones popping in one
 * after another, with the time against par and a hint for the next star.
 */
export function spawnStarsPopup(stage, stars, before, seconds, par) {
  const el = document.createElement('div')
  el.className = 'stars-pop'
  const row = document.createElement('div')
  row.className = 'stars-row'
  for (let i = 0; i < 3; i += 1) {
    const star = document.createElement('span')
    star.textContent = '★'
    star.className = i < before ? 'is-on' : i < stars ? 'is-on is-new' : ''
    if (i >= before && i < stars) star.style.animationDelay = `${0.25 + (i - before) * 0.28}s`
    row.append(star)
  }
  const title = document.createElement('div')
  title.className = 'stars-title title-text'
  title.textContent = `Stage ${stage} · ${stars === 3 ? 'PERFECT!' : 'NEW STARS!'}`
  const sub = document.createElement('div')
  sub.className = 'stars-sub game-text'
  sub.textContent = seconds != null ? `${seconds}s (par ${par}s) · ${STAR_HINTS[stars]}` : STAR_HINTS[stars]
  el.append(row, title, sub)
  getLayer().appendChild(el)
  el.addEventListener('animationend', (e) => {
    if (e.target === el) el.remove()
  })
}

export function flashScreen(kind = 'death') {
  const el = document.createElement('div')
  el.className = `screen-flash flash-${kind}`
  getLayer().appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}

const CONFETTI = ['#ff4d6d', '#ffd23a', '#3bd16b', '#3ba8ff', '#b45cff', '#ff9a1f', '#ffffff']

/** A burst of confetti from the top of the screen (level ups, rebirths, goals). */
export function confetti(count = 60) {
  const root = getLayer()
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div')
    el.className = 'confetti'
    el.style.left = `${Math.random() * 100}%`
    el.style.background = CONFETTI[i % CONFETTI.length]
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 240}px`)
    el.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`)
    el.style.animationDelay = `${Math.random() * 0.35}s`
    el.style.animationDuration = `${1.6 + Math.random() * 1.2}s`
    if (i % 3 === 0) el.style.borderRadius = '50%'
    root.appendChild(el)
    el.addEventListener('animationend', () => el.remove())
  }
}
