import { useState } from 'react'

import { sound } from '../../audio/sound'
import { localPlayer } from '../../game/playerState'
import { send } from '../../net/connection'
import {
  DAILY_MAX_STREAK,
  GIFTS,
  MAX_LEVEL,
  STAGES,
  XP_GROWTH,
  canRebirth,
  dailyReward,
  describeReward,
  formatDuration,
  formatNumber,
  giftReward,
  moveStats,
  parseList,
  rebirthJumpBonus,
  rebirthMoveBonus,
  rebirthProgress,
  rebirthWinsBonus,
} from '../../shared/gameData.js'
import { getLayout } from '../../shared/layout.js'
import { gameState, useGameStore } from '../../store/gameStore'
import { RebirthIcon } from '../icons'
import { useNow } from '../useNow'
import { Grid, Modal } from './Modal'
import { action } from './actions'

const pct = (n) => `${formatNumber(Math.round(n * 100))}%`

/* ---------------------------------------------------------------------------
 * Rebirth
 * ------------------------------------------------------------------------- */

export function RebirthPanel({ me }) {
  const ready = canRebirth(me)
  const next = me.rebirths + 1
  const nextDoor = STAGES.find((s) => s.rebirths > me.rebirths)
  const rows = [
    ['⭐ Jump gain', `+${pct(rebirthJumpBonus(me.rebirths))}`, `+${pct(rebirthJumpBonus(next))}`],
    ['🏆 Wins', `+${pct(rebirthWinsBonus(me.rebirths))}`, `+${pct(rebirthWinsBonus(next))}`],
    ['💨 Speed & Jump Height', `+${pct(rebirthMoveBonus(me.rebirths))}`, `+${pct(rebirthMoveBonus(next))}`],
  ]
  return (
    <Modal title="Rebirth" icon={<RebirthIcon width="48" height="48" />} color="#ff4f6d" width="min(640px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="title-text text-[36px]">Rebirths: {formatNumber(me.rebirths)}</div>
        <div className="flex w-full flex-col gap-2">
          {rows.map(([label, now, then]) => (
            <div key={label} className="rebirth-row">
              <span className="ink-text text-[18px] font-bold">{label}</span>
              <span className="game-text text-[24px] text-[#d27bff]">{now}</span>
              <span className="game-text text-[24px]">➜</span>
              <span className="game-text text-[24px] text-[#4dff6a]">{then}</span>
            </div>
          ))}
        </div>
        {nextDoor && (
          <div className="ink-text text-[16px]">
            🔓 Rebirth {nextDoor.rebirths} opens the door to <b>Stage {STAGES.indexOf(nextDoor) + 1}</b>
          </div>
        )}
        {ready ? (
          <div className="title-text mt-1 text-[28px] text-[#ffd23a]">You're MAX level — rebirth now!</div>
        ) : (
          <>
            <div className="ink-text mt-1 text-[19px] font-bold">
              Reach Level MAX ({Math.min(me.level, MAX_LEVEL)}/{MAX_LEVEL})
            </div>
            <div className="progress-mini">
              <div style={{ width: `${rebirthProgress(me) * 100}%` }} />
            </div>
          </>
        )}
        <button
          type="button"
          className={`btn-chunky ${ready ? 'btn-green press' : 'btn-gray'} game-text mt-2 px-12 py-2 text-[36px]`}
          disabled={!ready}
          onClick={action('rebirth')}
        >
          REBIRTH
        </button>
        <div className="ink-text text-[14px] opacity-75">
          Your level (and jumps) go back to 1, and each level takes {Math.round((XP_GROWTH - 1) * 100)}% longer. You keep your Wins, boots, trampolines and trails.
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Playtime gifts
 * ------------------------------------------------------------------------- */

export function GiftsPanel({ me }) {
  const now = useNow(1000)
  const claimed = parseList(me.gifts)
  return (
    <Modal title="Gifts" icon="🎁" color="#2fbf55" width="min(860px, 95vw)">
      <div className="ink-text mb-3 text-center text-[17px]">Free gifts for playing — the longer you play, the bigger they get!</div>
      <Grid min={175}>
        {GIFTS.map((gift, i) => {
          const done = claimed.includes(String(i))
          const wait = me.sessionAt + gift.minutes * 60_000 - now
          const reward = giftReward(gift, me)
          return (
            <div key={i} className={`card ${!done && wait <= 0 ? 'is-highlight' : ''}`}>
              <div className="text-[46px] leading-none">{gift.kind === 'boost' ? '⚡' : gift.kind === 'jump' ? '⭐' : '🏆'}</div>
              <div className="ink-text text-[16px] font-bold leading-tight">{describeReward(reward)}</div>
              {done ? (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  CLAIMED ✓
                </button>
              ) : wait > 0 ? (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  {formatDuration(wait)}
                </button>
              ) : (
                <button type="button" className="btn-chunky btn-green press card-button game-text" onClick={action('claim', { what: 'gift', index: i })}>
                  CLAIM!
                </button>
              )}
            </div>
          )
        })}
      </Grid>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Teleport
 * ------------------------------------------------------------------------- */

function lobbySpots() {
  const layout = getLayout()
  const stand = layout.bootStands[0]
  const tramp = layout.trampolines[0]
  return [
    { id: 'spawn', icon: '🏠', label: 'Spawn', go: () => localPlayer.goHome() },
    { id: 'boots', icon: '🥾', label: 'Boots Shop', go: () => localPlayer.teleportTo({ x: stand.pos[0] + 7, y: 0.2, z: stand.pos[2] - 4, yaw: -Math.PI / 2 }) },
    { id: 'tramps', icon: '⏫', label: 'Trampolines', go: () => localPlayer.teleportTo({ x: tramp.center[0] - 9, y: 0.2, z: tramp.center[1] - 6, yaw: Math.PI / 2 }) },
  ]
}

export function TeleportPanel({ me }) {
  const best = me.bestStage || 0
  return (
    <Modal title="Teleport" icon="🌀" color="#7a5cff" width="min(860px, 95vw)">
      <div className="game-text mb-2 text-[22px]">Lobby</div>
      <Grid min={180}>
        {lobbySpots().map((spot) => (
          <button
            key={spot.id}
            type="button"
            className="card press"
            onClick={() => {
              sound.click()
              spot.go()
              gameState().closePanel()
            }}
          >
            <span className="text-[40px] leading-none">{spot.icon}</span>
            <span className="ink-text text-[19px] font-bold">{spot.label}</span>
          </button>
        ))}
      </Grid>
      <div className="game-text mb-2 mt-4 text-[22px]">Stage checkpoints</div>
      <div className="ink-text mb-3 text-[15px]">Start from the end of a stage you've beaten — then beat the next one for its Wins.</div>
      <div className="grid grid-cols-5 gap-3">
        {STAGES.map((stage, i) => {
          const index = i + 1
          const open = index <= best
          return (
            <button
              key={stage.name}
              type="button"
              className={`stage-tile press ${open ? 'is-open' : ''}`}
              disabled={!open}
              title={stage.name}
              onClick={() => {
                sound.click()
                send('checkpoint', { stage: index })
              }}
            >
              <span className="title-text text-[26px]">{open ? index : '🔒'}</span>
              <span className="game-text text-[12px] leading-tight">{stage.name}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Codes, settings, custom jump height
 * ------------------------------------------------------------------------- */

export function CodesPanel() {
  const [code, setCode] = useState('')
  const submit = () => {
    if (!code.trim()) return
    sound.click()
    send('code', { code })
    setCode('')
  }
  return (
    <Modal title="Codes" icon="🎟️" color="#ff5fa8" width="min(560px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="ink-text text-[20px]">Enter a code for free rewards!</div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
          }}
          placeholder="TYPE CODE HERE"
          maxLength={32}
          className="ink-text w-full rounded-xl border-4 border-[#15151d] bg-[#f4f6fb] px-4 py-2 text-center text-[28px] font-bold outline-none"
        />
        <button type="button" className="btn-chunky btn-green press game-text px-10 py-2 text-[28px]" onClick={submit}>
          REDEEM
        </button>
        <div className="ink-text text-[15px] opacity-70">Psst… try RELEASE</div>
      </div>
    </Modal>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      type="button"
      className="card press w-full flex-row justify-between px-5"
      onClick={() => {
        sound.click()
        onChange(!value)
      }}
    >
      <span className="ink-text text-[22px] font-bold">{label}</span>
      <span className={`chip text-white ${value ? 'bg-[#2fbf4a]' : 'bg-[#9aa3b2]'}`}>{value ? 'ON' : 'OFF'}</span>
    </button>
  )
}

export function SettingsPanel() {
  const settings = useGameStore((s) => s.settings)
  const set = (key) => (value) => {
    gameState().setSetting(key, value)
    if (key === 'music') sound.setMusic(value)
    if (key === 'sfx') sound.setSfx(value)
  }
  return (
    <Modal title="Settings" icon="⚙️" color="#6b7a94" width="min(580px, 95vw)">
      <div className="flex flex-col gap-3">
        <Toggle label="🎵 Music" value={settings.music} onChange={set('music')} />
        <Toggle label="🔊 Sound effects" value={settings.sfx} onChange={set('sfx')} />
        <div className="card flex-row justify-between px-5">
          <span className="ink-text text-[22px] font-bold">🖥️ Graphics</span>
          <div className="flex gap-2">
            {['low', 'medium', 'high'].map((q) => (
              <button
                key={q}
                type="button"
                className={`chip press ${settings.quality === q ? 'bg-[#2f8cff] text-white' : 'bg-white text-[#15151d]'}`}
                onClick={() => set('quality')(q)}
              >
                {q.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="card items-start px-5 text-left">
          <div className="ink-text text-[20px] font-bold">Controls</div>
          <div className="ink-text text-[16px]">
            WASD / arrows run · SPACE jump (tap again in the air, or hold to keep jumping) · E use · drag to look around · scroll to zoom · the letter on
            each button opens it
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function JumpHeightPanel({ me }) {
  const custom = useGameStore((s) => s.settings.customJump)
  const max = moveStats(me.level, me.boot, me.rebirths).height
  const value = custom ? Math.min(custom, max) : max
  const set = (v) => gameState().setSetting('customJump', v >= max - 0.05 ? null : v)
  return (
    <Modal title="Custom Jump Height" icon="✏️" color="#ff5a7a" width="min(560px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="title-text text-[64px] text-[#ff5a7a]">{value.toFixed(1)}</div>
        <input
          type="range"
          min={3}
          max={max}
          step={0.1}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="jump-slider w-full"
        />
        <div className="flex w-full justify-between">
          <span className="ink-text text-[15px]">3</span>
          <span className="ink-text text-[15px] font-bold">Max: {max.toFixed(1)}</span>
        </div>
        <button
          type="button"
          className="btn-chunky btn-blue press game-text px-8 py-2 text-[24px]"
          onClick={() => {
            sound.click()
            set(max)
          }}
        >
          USE MAX
        </button>
        <div className="ink-text text-[15px] opacity-75">Lower jumps help with tricky platforms. Level up, better boots and rebirths raise your max.</div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Welcome and daily reward
 * ------------------------------------------------------------------------- */

export function WelcomePanel() {
  return (
    <Modal title="Welcome!" icon="🦘" color="#ff9a1f" width="min(700px, 95vw)">
      <div className="flex flex-col gap-2 text-left">
        {[
          ['⭐', 'Run and jump to gain Jump every second. Jump fills your level bar.'],
          ['⏫', 'Every level is +1 jump in the air (up to 5), more speed and higher jumps. Tap SPACE in the air to double jump, or hold it to keep jumping.'],
          ['🔥', 'Escape over the lava! Long gaps and tall walls need a higher level.'],
          ['🏆', 'Beat a stage and step on the yellow Return pad for Wins.'],
          ['🥾', 'Spend Wins on Boots and Trampolines in the lobby — walk up and press E.'],
          ['🔄', 'At MAX level, Rebirth for big permanent bonuses and to open the rebirth doors.'],
        ].map(([icon, text]) => (
          <div key={text} className="welcome-row">
            <span className="text-[30px] leading-none">{icon}</span>
            <span className="ink-text text-[17px] leading-snug">{text}</span>
          </div>
        ))}
        <button type="button" className="btn-chunky btn-green press game-text mt-2 py-2 text-[32px]" onClick={() => gameState().closePanel()}>
          LET&apos;S JUMP!
        </button>
      </div>
    </Modal>
  )
}

export function DailyPanel({ me, props }) {
  const streak = props.streak ?? 1
  return (
    <Modal title="Daily Reward" icon="📅" color="#ffb81f" width="min(700px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="title-text text-[40px] text-[#ff9a1f]">Day {streak} streak!</div>
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: DAILY_MAX_STREAK }, (_, i) => (
            <div key={i} className={`day-chip ${i + 1 <= streak ? 'is-done' : ''} ${i + 1 === streak ? 'is-today' : ''}`}>
              <span className="game-text text-[15px]">Day {i + 1}</span>
              <span className="game-text text-[17px]">🏆 {formatNumber(dailyReward(me, i + 1).wins)}</span>
            </div>
          ))}
        </div>
        <div className="title-text text-[34px] text-[#3bd16b]">{describeReward(props.reward ?? {})}</div>
        <div className="ink-text text-[15px] opacity-75">Come back tomorrow to keep your streak — rewards grow every day for a week.</div>
        <button type="button" className="btn-chunky btn-green press game-text px-12 py-2 text-[30px]" onClick={() => gameState().closePanel()}>
          AWESOME!
        </button>
      </div>
    </Modal>
  )
}
