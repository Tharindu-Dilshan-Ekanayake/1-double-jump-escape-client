import { useEffect, useRef } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { isTyping } from '../game/input'
import { localPlayer } from '../game/playerState'
import { send } from '../net/connection'
import {
  BOOTS,
  GIFTS,
  MAX_LEVEL,
  PRODUCTS,
  TRAILS,
  canRebirth,
  formatDuration,
  formatNumber,
  goalAt,
  goalValue,
  moveStats,
  parseList,
  rebirthProgress,
  reviveCost,
  xpForLevel,
} from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import { RebirthIcon, TrophyIcon } from './icons'
import { interact, promptInfo } from './interact'
import RaceTracker from './RaceTracker'
import { useNow } from './useNow'

const withClick = (fn) => () => {
  sound.click()
  fn()
}

/** Opens a window, or closes it when that same window is already open. */
function toggle(id, props = {}) {
  sound.click()
  const { panel, openPanel, closePanel } = gameState()
  if (panel?.id === id) closePanel()
  else openPanel(id, props)
}

/** Small key cap in a button's top-left corner showing its shortcut. */
function KeyBadge({ k }) {
  return <span className="key-badge">{k}</span>
}

function buyProduct(id) {
  sound.click()
  const me = gameState().me
  const product = PRODUCTS[id]
  if (me && me.wins < product.price) {
    sound.error()
    gameState().toast(`Need 🏆 ${formatNumber(product.price - me.wins)} more Wins!`, 'error')
    return
  }
  send('buy', { cat: 'product', id })
}

const parseCounters = (text) => {
  try {
    return JSON.parse(text || '{}') || {}
  } catch {
    return {}
  }
}

/** How many playtime gifts are ready to open. */
function readyGifts(me, now) {
  const claimed = parseList(me.gifts)
  return GIFTS.filter((g, i) => !claimed.includes(String(i)) && now - me.sessionAt >= g.minutes * 60_000).length
}

/* ---------------------------------------------------------------------------
 * Top: the goal banner ("GET 3 WINS! (2/3)") and where you are on the course
 * ------------------------------------------------------------------------- */

function GoalBanner({ me }) {
  const goalDone = useGameStore((s) => s.goalDone)
  const now = useNow(500)
  const celebrating = goalDone && now - goalDone.at < 2600
  const counters = parseCounters(me.counters)
  const goal = goalAt(me.goal, me, counters, me.goalTarget)
  const maxed = me.level >= MAX_LEVEL && goal.kind !== 'rebirths'

  let content
  if (celebrating) {
    content = (
      <span key={goalDone.at} className="goal-text goal-done">
        ✓ {goalDone.text || 'GOAL COMPLETE!'}
      </span>
    )
  } else if (maxed) {
    content = <span className="goal-text goal-rebirth">REBIRTH TO PROGRESS FURTHER!</span>
  } else {
    const value = Math.min(goalValue(goal.kind, me, counters), goal.target)
    content = (
      <span className="goal-text">
        {goal.text} ({formatNumber(value)}/{formatNumber(goal.target)})
      </span>
    )
  }
  return <div className="hud-scaled goal-banner pointer-events-none">{content}</div>
}

/* ---------------------------------------------------------------------------
 * Left: the big square buttons
 * ------------------------------------------------------------------------- */

function Tile({ kind, emoji, label, badge, alert, hotkey, onClick }) {
  return (
    <button type="button" className={`tile tile-${kind} press`} onClick={onClick}>
      <KeyBadge k={hotkey} />
      <span className="tile-icon">{emoji}</span>
      <span className="tile-label game-text">{label}</span>
      {badge && <span className="tile-badge game-text">{badge}</span>}
      {alert && <span className="alert-badge">{alert}</span>}
    </button>
  )
}

function LeftTiles({ me }) {
  const now = useNow(1000)
  const ready = canRebirth(me)
  const progress = Math.floor(rebirthProgress(me) * 100)
  const ownedTrails = parseList(me.trailsOwned)
  const newTrail = TRAILS.some((t) => !ownedTrails.includes(t.id) && me.wins >= t.price)
  const ownedBoots = parseList(me.bootsOwned)
  const newBoot = BOOTS.some((b) => !ownedBoots.includes(b.id) && !b.limited && me.wins >= b.price)
  const gifts = readyGifts(me, now)
  return (
    <div className="hud-scaled hud-left pointer-events-auto fixed left-3 top-1/2 grid -translate-y-1/2 grid-cols-2 gap-x-4 gap-y-8">
      <Tile
        kind="rebirth"
        emoji={<RebirthIcon width="64" height="64" />}
        label="Rebirth"
        hotkey="R"
        badge={ready ? null : `${progress}%`}
        alert={ready ? '!' : null}
        onClick={() => toggle('rebirth')}
      />
      <Tile kind="trails" emoji="✨" label="Trails" hotkey="T" badge={newTrail ? 'New!' : null} onClick={() => toggle('trails')} />
      <Tile kind="boots" emoji="🥾" label="Boots" hotkey="B" badge={newBoot ? 'New!' : null} onClick={() => toggle('boots')} />
      <Tile kind="gifts" emoji="🎁" label="Gifts" hotkey="G" alert={gifts > 0 ? gifts : null} onClick={() => toggle('gifts')} />
      <Tile kind="teleport" emoji="🌀" label="Teleport" hotkey="P" onClick={() => toggle('teleport')} />
      <Tile kind="codes" emoji="🎟️" label="Codes" hotkey="C" onClick={() => toggle('codes')} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Right: free chest, custom jump height, 2x Jump, settings
 * ------------------------------------------------------------------------- */

function RightColumn({ me }) {
  const now = useNow(1000)
  const music = useGameStore((s) => s.settings.music)
  const custom = useGameStore((s) => s.settings.customJump)
  const stats = moveStats(me.level, me.boot, me.rebirths)
  const height = custom ? Math.min(custom, stats.height) : stats.height
  const chestWait = me.chestAt - now
  return (
    <div className="hud-scaled hud-right pointer-events-auto fixed right-3 top-[15%] flex w-[250px] flex-col items-center gap-3">
      <button
        type="button"
        className={`chest-card press ${chestWait <= 0 ? 'is-ready' : ''}`}
        onClick={withClick(() => {
          if (chestWait <= 0) send('claim', { what: 'chest' })
          else gameState().toast(`Free Chest refills in ${formatDuration(chestWait)}`, 'info', 1800)
        })}
      >
        <span className="text-[44px] leading-none">🎁</span>
        <span className="flex flex-col items-start leading-tight">
          <span className="title-text text-[22px]">FREE CHEST</span>
          <span className={`game-text text-[22px] ${chestWait <= 0 ? 'text-[#7dff8a]' : ''}`}>{chestWait <= 0 ? 'CLAIM!' : formatDuration(chestWait)}</span>
        </span>
      </button>

      <div className="game-text -mb-2 text-[22px]">Custom Jump Height</div>
      <button type="button" className="jump-height-box press" onClick={() => toggle('jumpHeight')}>
        <KeyBadge k="J" />
        <span className="text-[34px]">✏️</span>
        <span className="flex flex-col items-center leading-none">
          <span className="title-text text-[40px] text-[#ff5a7a]">{formatNumber(Math.round(height))}</span>
          <span className="game-text text-[18px]">Max: {formatNumber(Math.round(stats.height))}</span>
        </span>
      </button>

      <button type="button" className="btn-chunky btn-shine btn-rainbow press mt-1 w-full py-2" onClick={() => buy2xJump(me)}>
        <KeyBadge k="X" />
        <span className="title-text text-[42px]">2x Jump</span>
      </button>
      <div className="title-text -mt-2 text-[30px]">
        {me.pass2xJump ? <span className="text-[#7dff8a]">ACTIVE ✓</span> : <>ONLY 🏆{PRODUCTS.pass2xJump.price}</>}
      </div>

      <div className="mt-1 flex gap-4">
        <button type="button" className="round-icon round-blue press" title="Settings" onClick={() => toggle('settings')}>
          <KeyBadge k="O" />
          <span>⚙️</span>
        </button>
        <button type="button" className="round-icon round-purple press" title="Music" onClick={withClick(toggleMusic)}>
          <KeyBadge k="M" />
          <span>{music ? '🎵' : '🔇'}</span>
        </button>
        <button type="button" className="round-icon round-pink press" title="Shop" onClick={() => toggle('shop')}>
          <KeyBadge k="H" />
          <span>🛒</span>
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Bottom: Wins, jumps, the level bar and Jump packs
 * ------------------------------------------------------------------------- */

function WinsCounter({ me }) {
  return (
    <div className="hud-scaled wins-counter pointer-events-auto fixed bottom-4 left-4 flex items-center gap-2">
      <TrophyIcon className="wins-icon" width="78" height="78" />
      <span key={me.wins} className="title-text stat-bump text-[64px] leading-none">
        {formatNumber(me.wins)}
      </span>
      <button type="button" className="wins-plus press" onClick={() => toggle('shop')} aria-label="Get more Wins">
        +
      </button>
    </div>
  )
}

const PACKS = [
  ['jump10k', '+10k', 'btn-orange'],
  ['jump100k', '+100k', 'btn-orange'],
  ['jump1m', '+1M Jump', 'btn-rainbow-pink'],
  ['jump10m', '+10M Jump', 'btn-rainbow'],
]

function BottomHud({ me }) {
  const jumps = useGameStore((s) => s.jumps)
  const maxed = me.level >= MAX_LEVEL
  const need = xpForLevel(me.level, me.rebirths)
  const fill = maxed ? 1 : Math.max(0, Math.min(1, me.xp / need))
  return (
    <div className="hud-scaled pointer-events-none fixed bottom-2 left-1/2 flex w-[920px] -translate-x-1/2 flex-col items-center">
      <div key={`${jumps.left}/${jumps.max}`} className={`jumps-text title-text ${jumps.left === 0 ? 'is-empty' : ''}`}>
        Jumps {jumps.left}/{jumps.max}
      </div>
      <div className="level-bar mt-1">
        <div className="level-fill" style={{ width: `${fill * 100}%` }} />
        <div className="level-text title-text">
          <span>Level {maxed ? 'MAX' : me.level}</span>
          <span>{maxed ? `${formatNumber(me.totalJump)} Jump` : `${formatNumber(Math.floor(me.xp))} / ${formatNumber(need)}`}</span>
        </div>
      </div>
      <div className="pointer-events-auto mt-2 flex gap-2">
        {PACKS.map(([id, label, color], i) => (
          <button
            key={id}
            type="button"
            title={`${PRODUCTS[id].name} for ${PRODUCTS[id].price} Wins`}
            className={`btn-chunky ${color} press pack-btn`}
            onClick={() => buyProduct(id)}
          >
            <KeyBadge k={i + 1} />
            <span className="title-text">{label}</span>
            <span className="price game-text">🏆 {formatNumber(PRODUCTS[id].price)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BoostChip({ me }) {
  const now = useNow(1000)
  if (me.boostUntil <= now) return null
  return (
    <div className="hud-scaled boost-chip game-text pointer-events-none">⚡ 2x Jump boost {formatDuration(me.boostUntil - now)}</div>
  )
}

/* ---------------------------------------------------------------------------
 * "Press E"
 * ------------------------------------------------------------------------- */

function InteractPrompt({ me }) {
  const prompt = useGameStore((s) => s.prompt)
  const hydraLeft = useGameStore((s) => s.hydraLeft)
  useNow(1000)
  const info = promptInfo(prompt, me, hydraLeft)
  if (!info) return null
  return (
    <button
      type="button"
      key={`${prompt.kind}:${prompt.id ?? ''}`}
      className={`hud-scaled e-prompt press pointer-events-auto fixed left-1/2 top-[66%] ${info.active ? 'is-active' : ''} ${info.poor ? 'is-poor' : ''}`}
      onClick={() => interact(prompt, me, hydraLeft)}
    >
      <span className="e-prompt-key">{info.icon}</span>
      <span className="game-text text-[26px]">{info.text}</span>
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * Top right: who you're playing as (Bloxity account or guest)
 * ------------------------------------------------------------------------- */

function ProfileTag() {
  const { identity, isLoggedIn, user } = useBloxity()
  const name = identity?.displayName || identity?.username || 'Guest'
  const handle = isLoggedIn ? `@${user.username || identity.username}` : 'Guest'
  return (
    <div className="hud-scaled profile-tag pointer-events-none fixed right-3 top-3">
      {identity?.pfp ? (
        <img src={identity.pfp} alt="" draggable={false} className="profile-pfp" />
      ) : (
        <span className="profile-pfp game-text grid place-items-center text-[22px]">{name.charAt(0).toUpperCase()}</span>
      )}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="profile-name">{name}</span>
        <span className={`profile-handle ${isLoggedIn ? 'is-account' : ''}`}>{handle}</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Overlays: level up, toasts, revive
 * ------------------------------------------------------------------------- */

function useExpire(selector, key, ms) {
  const value = useGameStore(selector)
  useEffect(() => {
    if (!value) return undefined
    const timer = setTimeout(() => useGameStore.setState({ [key]: null }), ms)
    return () => clearTimeout(timer)
  }, [value, key, ms])
  return value
}

function Overlays() {
  const levelUp = useExpire((s) => s.levelUp, 'levelUp', 3200)
  const toasts = useGameStore((s) => s.toasts)

  return (
    <>
      {levelUp && (
        <div key={levelUp.at} className="hud-scaled levelup-pop pointer-events-none fixed left-1/2 top-[27%] -translate-x-1/2 text-center leading-[1.05]">
          <div className="title-text text-[64px] text-[#ffd23a]">
            Level {levelUp.from} ➜ {levelUp.to >= MAX_LEVEL ? 'MAX' : levelUp.to}
          </div>
          {levelUp.jumpsTo > levelUp.jumpsFrom && <div className="title-text text-[50px] text-[#ff8fd8]">+1 JUMP! ({levelUp.jumpsTo} jumps)</div>}
          <div className="game-text text-[34px] text-[#7fd4ff]">
            Speed {formatNumber(levelUp.speedFrom)} ➜ {formatNumber(levelUp.speedTo)} · Jump {formatNumber(levelUp.heightFrom)} ➜ {formatNumber(levelUp.heightTo)}
          </div>
        </div>
      )}
      <div className="hud-scaled pointer-events-none fixed left-1/2 top-[46%] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind} game-text`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  )
}

const REVIVE_SECONDS = 8

/** "Revive?" after falling on the course: pay Wins to carry on, or go home. */
function RevivePanel({ me }) {
  const death = useGameStore((s) => s.death)
  const now = useNow(250)
  const left = death ? Math.max(0, REVIVE_SECONDS - (now - death.at) / 1000) : 0
  const expired = Boolean(death) && left <= 0
  useEffect(() => {
    if (!expired) return
    useGameStore.setState({ death: null })
    localPlayer.goHome()
  }, [expired])
  if (!death) return null
  const cost = reviveCost(death.stage)
  const affordable = me.wins >= cost
  const no = () => {
    sound.click()
    useGameStore.setState({ death: null })
    localPlayer.goHome()
  }
  return (
    <div className="modal-backdrop pointer-events-auto">
      <div className="panel revive-panel ui-scaled">
        <div className="panel-header" style={{ background: 'linear-gradient(#ff7ab4, #ff3f86)' }}>
          <span>💀</span>
          <span className="title-text">Revive?</span>
          <button type="button" className="panel-close btn-chunky btn-red press" onClick={no} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="panel-body flex flex-col items-center gap-4 px-10 py-8">
          <div className="ink-text text-center text-[20px]">Carry on from your last safe spot on Stage {death.stage}?</div>
          <button
            type="button"
            className={`btn-chunky ${affordable ? 'btn-green' : 'btn-gray'} press revive-btn game-text`}
            disabled={!affordable}
            onClick={() => {
              sound.click()
              send('revive', { stage: death.stage, ...death.safe })
            }}
          >
            🏆 {formatNumber(cost)}
          </button>
          {!affordable && <div className="ink-text -mt-2 text-[16px] font-bold text-[#d8203f]">Need 🏆 {formatNumber(cost - me.wins)} more Wins</div>}
          <button type="button" className="btn-chunky btn-red press revive-btn game-text" onClick={no}>
            No! ({Math.ceil(left)})
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Hotkeys
 * ------------------------------------------------------------------------- */

function buy2xJump(me) {
  if (me.pass2xJump) gameState().toast('2x Jump is active forever!', 'success')
  else buyProduct('pass2xJump')
}

function toggleMusic() {
  const music = !gameState().settings.music
  gameState().setSetting('music', music)
  sound.setMusic(music)
}

/** Every HUD button's keyboard shortcut (shown on its key badge). */
const HOTKEYS = {
  KeyR: () => toggle('rebirth'),
  KeyT: () => toggle('trails'),
  KeyB: () => toggle('boots'),
  KeyG: () => toggle('gifts'),
  KeyP: () => toggle('teleport'),
  KeyC: () => toggle('codes'),
  KeyO: () => toggle('settings'),
  KeyH: () => toggle('shop'),
  KeyJ: () => toggle('jumpHeight'),
  KeyX: (me) => buy2xJump(me),
  KeyM: () => {
    sound.click()
    toggleMusic()
  },
  Digit1: () => buyProduct(PACKS[0][0]),
  Digit2: () => buyProduct(PACKS[1][0]),
  Digit3: () => buyProduct(PACKS[2][0]),
  Digit4: () => buyProduct(PACKS[3][0]),
  KeyE: (me) => {
    const { prompt, hydraLeft } = gameState()
    interact(prompt, me, hydraLeft)
  },
}

/** Listens for the HUD shortcuts while playing (not while typing or dead). */
function useHotkeys(me) {
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  })
  useEffect(() => {
    const onKey = (e) => {
      const action = HOTKEYS[e.code]
      const current = meRef.current
      if (!action || !current || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return
      if (isTyping() || gameState().death) return
      e.preventDefault()
      action(current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function Hud() {
  const phase = useGameStore((s) => s.phase)
  const me = useGameStore((s) => s.me)
  useHotkeys(phase === 'playing' ? me : null)
  if (phase !== 'playing' || !me) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <ProfileTag />
      <div className="top-stack">
        <GoalBanner me={me} />
        <RaceTracker />
        <BoostChip me={me} />
      </div>
      <LeftTiles me={me} />
      <RightColumn me={me} />
      <WinsCounter me={me} />
      <BottomHud me={me} />
      <InteractPrompt me={me} />
      <Overlays />
      <RevivePanel me={me} />
    </div>
  )
}

export default Hud
