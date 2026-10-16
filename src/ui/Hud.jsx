import { useEffect, useRef } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { isTyping } from '../game/input'
import { send } from '../net/connection'
import { STAGES, formatDuration, formatMult, formatNumber, parseList } from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import { progressState, useProgress } from '../store/progression'
import { RebirthIcon, TrophyIcon } from './icons'
import { interact, promptInfo } from './interact'
import RaceTracker from './RaceTracker'
import { useNow } from './useNow'

/**
 * The HUD. Every number on it comes from the progression store (which
 * derives it from the server's values with shared/progression.js) — nothing
 * here does progression math.
 */

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

/** Buys a product (pass or XP pack) at the price the store shows. */
function buyProduct(id) {
  sound.click()
  const me = gameState().me
  const { packs, passes } = progressState()
  const product = [...(packs ?? []), ...(passes ?? [])].find((p) => p.id === id)
  if (!me || !product) return
  if (me.wins < product.price) {
    sound.error()
    gameState().toast(`Need 🏆 ${formatNumber(product.price - me.wins)} more Wins!`, 'error')
    return
  }
  send('buy', { cat: 'product', id })
}

/** How many playtime gifts are ready to open. */
function readyGifts(me, gifts, now) {
  const claimed = parseList(me.gifts)
  return gifts.filter((g, i) => !claimed.includes(String(i)) && now - me.sessionAt >= g.minutes * 60_000).length
}

/* ---------------------------------------------------------------------------
 * Top: the one next goal, and where you are on the course
 * ------------------------------------------------------------------------- */

function GoalBanner() {
  const goal = useProgress((s) => s.goal)
  const tutorial = useGameStore((s) => s.tutorial)
  // A new player's first steps (the arrows on the ground lead there too).
  if (tutorial) {
    return (
      <div className="hud-scaled goal-banner pointer-events-none">
        <span key={tutorial.text} className="goal-text goal-tutorial">
          <span className="goal-step">STEP {tutorial.index}/3</span> {tutorial.icon} {tutorial.text}
        </span>
      </div>
    )
  }
  if (!goal) return null
  const counted = goal.kind === 'level' || goal.kind === 'title'
  return (
    <div className="hud-scaled goal-banner pointer-events-none">
      <span key={goal.text} className={`goal-text ${goal.kind === 'rebirth' ? 'goal-rebirth' : ''} ${goal.kind === 'boots' ? 'goal-boots' : ''}`}>
        {goal.text}
        {counted && ` (${formatNumber(goal.value)}/${formatNumber(goal.target)})`}
        {goal.kind === 'boots' && ` (🏆 ${formatNumber(goal.value)}/${formatNumber(goal.target)})`}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Left: the big square buttons. Only the single most important thing you can
 * afford gets the red "!".
 * ------------------------------------------------------------------------- */

function Tile({ kind, emoji, label, badge, alert, hotkey, pulse, onClick }) {
  return (
    <button type="button" className={`tile tile-${kind} press ${pulse ? 'tile-pulse' : ''}`} onClick={onClick}>
      <KeyBadge k={hotkey} />
      <span className="tile-icon">{emoji}</span>
      <span className="tile-label game-text">{label}</span>
      {badge && <span className="tile-badge game-text">{badge}</span>}
      {alert && <span className={`alert-badge ${alert === '!' ? '' : 'alert-count'}`}>{alert}</span>}
    </button>
  )
}

/** The Shop tab the red "!" points at. */
const SHOP_TAB_FOR_BADGE = { boots: 'boots', pets: 'pets', shop: 'upgrades' }

function LeftTiles({ me }) {
  const now = useNow(1000)
  const badge = useProgress((s) => s.badge)
  const ready = useProgress((s) => s.canRebirth)
  const progress = useProgress((s) => Math.floor((s.rebirthProgress ?? 0) * 100))
  const rebirths = useProgress((s) => s.rebirths ?? 0)
  const rebirthJumps = useProgress((s) => s.rebirthJumps ?? 0)
  const rebirthMult = useProgress((s) => s.rebirthMult ?? 1)
  const gifts = useProgress((s) => s.gifts ?? [])
  const giftsReady = readyGifts(me, gifts, now)
  const shopTab = SHOP_TAB_FOR_BADGE[badge]
  return (
    <div className="hud-scaled hud-left pointer-events-auto fixed left-3 top-1/2 flex -translate-y-1/2 flex-col items-start gap-7">
      <div className="grid grid-cols-2 gap-x-4 gap-y-7">
        <Tile
          kind="rebirth"
          emoji={<RebirthIcon width="64" height="64" />}
          label="Rebirth"
          hotkey="R"
          badge={ready ? null : `${progress}%`}
          alert={badge === 'rebirth' ? '!' : null}
          pulse={ready}
          onClick={() => toggle('rebirth')}
        />
        <Tile kind="shop" emoji="🛒" label="Shop" hotkey="B" alert={shopTab ? '!' : null} onClick={() => toggle('shop', { tab: shopTab ?? 'boots' })} />
        <Tile kind="teleport" emoji="🌀" label="Teleport" hotkey="T" onClick={() => toggle('teleport')} />
        <Tile kind="gifts" emoji="🎁" label="Gifts" hotkey="G" alert={giftsReady > 0 ? giftsReady : null} onClick={() => toggle('gifts')} />
      </div>
      <button type="button" className="rebirth-count game-text press" onClick={() => toggle('rebirth')} title="Every rebirth: +1 jump for good, x2 XP, +50% Wins">
        <span className="rebirth-count-num title-text">
          <RebirthIcon width="36" height="36" />
          {formatNumber(rebirths)}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span>Rebirth{rebirths === 1 ? '' : 's'}</span>
          <span className="rebirth-count-perks">
            +{rebirthJumps} jump{rebirthJumps === 1 ? '' : 's'} · {formatMult(rebirthMult)} XP
          </span>
        </span>
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Right: free chest, 2x XP, and round buttons for jump height, settings, music, shop
 * ------------------------------------------------------------------------- */

function RightColumn({ me }) {
  const now = useNow(1000)
  const music = useGameStore((s) => s.settings.music)
  const custom = useGameStore((s) => s.settings.customJump)
  const maxHeight = useProgress((s) => s.height ?? 8)
  const pass = useProgress((s) => s.passes?.find((p) => p.id === 'pass2xJump'))
  const height = custom ? Math.min(custom, maxHeight) : maxHeight
  const chestWait = me.chestAt - now
  return (
    <div className="hud-scaled hud-right pointer-events-auto fixed right-3 top-[15%] flex w-[290px] flex-col items-center gap-4">
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

      <button type="button" className="btn-chunky btn-shine btn-rainbow press pass-btn w-full" onClick={() => buy2xXp(me)}>
        <KeyBadge k="X" />
        <span className="title-text text-[38px] leading-none">2x XP</span>
        <span className="pass-price game-text">{me.pass2xJump ? 'ACTIVE ✓' : `🏆 ${formatNumber(pass?.price ?? 0)} · forever`}</span>
      </button>

      <div className="flex gap-3">
        <button type="button" className="round-icon round-green press" title="Custom jump height" onClick={() => toggle('jumpHeight')}>
          <KeyBadge k="J" />
          <span className="round-stack">
            <span className="round-number title-text">{formatNumber(Math.round(height))}</span>
            <span className="round-caption game-text">HEIGHT</span>
          </span>
        </button>
        <button type="button" className="round-icon round-blue press" title="Settings" onClick={() => toggle('settings')}>
          <KeyBadge k="O" />
          <span>⚙️</span>
        </button>
        <button type="button" className="round-icon round-purple press" title="Music" onClick={withClick(toggleMusic)}>
          <KeyBadge k="M" />
          <span>{music ? '🎵' : '🔇'}</span>
        </button>
        <button type="button" className="round-icon round-pink press" title="Shop" onClick={() => toggle('shop', { tab: 'upgrades' })}>
          <KeyBadge k="H" />
          <span>🛒</span>
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Bottom: Wins, jumps, the XP bar with your stats, jump pad and lucky chips, XP packs
 * ------------------------------------------------------------------------- */

function WinsCounter({ me }) {
  return (
    <div className="hud-scaled wins-counter pointer-events-auto fixed bottom-4 left-4 flex items-center gap-2">
      <TrophyIcon className="wins-icon" width="78" height="78" />
      <span key={me.wins} className="title-text stat-bump text-[64px] leading-none">
        {formatNumber(me.wins)}
      </span>
      <button type="button" className="wins-plus press" onClick={() => toggle('shop', { tab: 'upgrades' })} aria-label="Get more Wins">
        +
      </button>
    </div>
  )
}

const PACK_COLORS = ['btn-orange', 'btn-orange', 'btn-rainbow-pink', 'btn-rainbow']

/** "JUMP PAD 3 jumps/s" while a jump pad trains you; "LUCKY x5!" on a lucky jump. */
function GainChips() {
  const now = useNow(250)
  const gains = useProgress((s) => s.gains)
  const onPad = gains.pad > 0 && now - gains.at < 1200
  const lucky = now - (useGameStore.getState().luckyAt || 0) < 900
  return (
    <div className="walk-chips">
      {onPad && <span className="walk-chip track-chip">🦘 JUMP PAD · {formatNumber(gains.pad)} jumps/s</span>}
      {lucky && <span className="walk-chip lucky-chip">✨ LUCKY x5!</span>}
    </div>
  )
}

function BottomHud() {
  const jumps = useGameStore((s) => s.jumps)
  const p = useProgress()
  if (!p.ready) return null
  return (
    <div className="hud-scaled pointer-events-none fixed bottom-2 left-1/2 flex w-[920px] -translate-x-1/2 flex-col items-center">
      <GainChips />
      <div key={`${jumps.left}/${jumps.max}`} className={`jumps-text title-text ${jumps.left === 0 ? 'is-empty' : ''}`}>
        Jumps {jumps.left}/{jumps.max}
      </div>
      <div className="level-bar mt-1">
        <div className="level-fill" style={{ width: `${p.xpFill * 100}%` }} />
        <div className="level-text title-text">
          <span>Level {p.isMax ? 'MAX' : `${p.level}/${p.maxLevel}`}</span>
          <span>{p.isMax ? 'REBIRTH!' : `${formatNumber(Math.floor(p.xp))} / ${formatNumber(p.xpNeed)}`}</span>
        </div>
      </div>
      <div className="stats-row game-text">
        <span title="XP every step and every jump gives you">⭐ +{formatNumber(p.xpPerJump)} a step &amp; jump</span>
        <span title="Jumps per air-time (from your level)">🦘 {p.jumps} jumps</span>
        <span title="Run speed (from your boots)">💨 {formatNumber(p.speed)} speed</span>
        <span title="Every multiplier on your XP">✖️ {formatMult(p.breakdown.total)}</span>
      </div>
      <div className="pointer-events-auto mt-2 flex gap-2">
        {p.packs.map((pack, i) => (
          <button
            key={pack.id}
            type="button"
            title={`${formatNumber(pack.xp)} XP for ${formatNumber(pack.price)} Wins`}
            className={`btn-chunky ${PACK_COLORS[i]} press pack-btn`}
            onClick={() => buyProduct(pack.id)}
          >
            <KeyBadge k={i + 1} />
            <span className="title-text">{pack.name}</span>
            <span className="price game-text">🏆 {formatNumber(pack.price)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BoostChip({ me }) {
  const now = useNow(1000)
  if (me.boostUntil <= now) return null
  return <div className="hud-scaled boost-chip game-text pointer-events-none">⚡ 2x XP boost {formatDuration(me.boostUntil - now)}</div>
}

/* ---------------------------------------------------------------------------
 * "Press E"
 * ------------------------------------------------------------------------- */

function InteractPrompt({ me }) {
  const prompt = useGameStore((s) => s.prompt)
  const hydraLeft = useGameStore((s) => s.hydraLeft)
  useProgress((s) => s.boots)
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
 * Top right: who you're playing as (Bloxity account or guest) and your title
 * ------------------------------------------------------------------------- */

function ProfileTag() {
  const { identity, isLoggedIn, user } = useBloxity()
  const title = useProgress((s) => s.title)
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
        {title && (
          <span className="profile-title" style={{ color: title.color }}>
            {title.name}
          </span>
        )}
        <span className={`profile-handle ${isLoggedIn ? 'is-account' : ''}`}>{handle}</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Overlays: level up, new title, "need more jumps", toasts
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
  const titleUp = useExpire((s) => s.titleUp, 'titleUp', 3600)
  const needJumps = useExpire((s) => s.needJumps, 'needJumps', 3800)
  const stageBanner = useExpire((s) => s.stageBanner, 'stageBanner', 2300)
  const toasts = useGameStore((s) => s.toasts)
  const bannerStage = stageBanner ? STAGES[stageBanner.index - 1] : null

  return (
    <>
      {bannerStage && (
        <div key={stageBanner.at} className="hud-scaled stage-banner pointer-events-none fixed left-1/2 top-[19%] -translate-x-1/2 whitespace-nowrap">
          <span className="stage-banner-num title-text">STAGE {stageBanner.index}</span>
          <span className="title-text text-[46px] text-white">
            {bannerStage.icon} {bannerStage.name}
          </span>
        </div>
      )}
      {levelUp && !titleUp && (
        <div key={levelUp.at} className="hud-scaled levelup-pop pointer-events-none fixed left-1/2 top-[27%] -translate-x-1/2 text-center leading-[1.05]">
          <div className="title-text text-[64px] text-[#ffd23a]">
            Level {levelUp.from} ➜ {levelUp.to >= levelUp.max ? 'MAX' : levelUp.to}
          </div>
          {levelUp.jumpsTo > levelUp.jumpsFrom && <div className="title-text text-[50px] text-[#ff8fd8]">+1 JUMP! ({levelUp.jumpsTo} jumps)</div>}
        </div>
      )}
      {titleUp && (
        <div key={titleUp.at} className="hud-scaled levelup-pop title-pop pointer-events-none fixed left-1/2 top-[24%] -translate-x-1/2 text-center leading-[1.05]">
          <div className="game-text text-[34px] text-white">NEW TITLE!</div>
          <div className="title-text text-[84px]" style={{ color: titleUp.title.color }}>
            {titleUp.title.name}
          </div>
        </div>
      )}
      {needJumps && (
        <div key={needJumps.at} className="hud-scaled need-jumps pointer-events-none fixed left-1/2 top-[38%] -translate-x-1/2 text-center">
          <div className="title-text text-[58px] text-[#ff5a7a]">Need {needJumps.jumps} jumps!</div>
          <div className="title-text text-[40px] text-[#ffd23a]">{needJumps.rebirth ? 'Rebirth for +1 jump!' : `Reach Level ${needJumps.level}`}</div>
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

/* ---------------------------------------------------------------------------
 * Hotkeys
 * ------------------------------------------------------------------------- */

function buy2xXp(me) {
  if (me.pass2xJump) gameState().toast('2x XP is active forever!', 'success')
  else buyProduct('pass2xJump')
}

function toggleMusic() {
  const music = !gameState().settings.music
  gameState().setSetting('music', music)
  sound.setMusic(music)
}

const packId = (i) => progressState().packs?.[i]?.id

/** Every HUD button's keyboard shortcut (shown on its key badge). */
const HOTKEYS = {
  KeyR: () => toggle('rebirth'),
  KeyB: () => toggle('shop', { tab: SHOP_TAB_FOR_BADGE[progressState().badge] ?? 'boots' }),
  KeyG: () => toggle('gifts'),
  // Not P: on Boxity (and CrazyGames) P opens the platform's pause menu.
  KeyT: () => toggle('teleport'),
  KeyO: () => toggle('settings'),
  KeyH: () => toggle('shop', { tab: 'upgrades' }),
  KeyJ: () => toggle('jumpHeight'),
  KeyX: (me) => buy2xXp(me),
  KeyM: () => {
    sound.click()
    toggleMusic()
  },
  Digit1: () => buyProduct(packId(0)),
  Digit2: () => buyProduct(packId(1)),
  Digit3: () => buyProduct(packId(2)),
  Digit4: () => buyProduct(packId(3)),
  KeyE: (me) => {
    const { prompt, hydraLeft } = gameState()
    interact(prompt, me, hydraLeft)
  },
}

/** Listens for the HUD shortcuts while playing (not while typing or falling). */
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
        <GoalBanner />
        <RaceTracker />
        <BoostChip me={me} />
      </div>
      <LeftTiles me={me} />
      <RightColumn me={me} />
      <WinsCounter me={me} />
      <BottomHud />
      <InteractPrompt me={me} />
      <Overlays />
    </div>
  )
}

export default Hud
