import { sound } from '../../audio/sound'
import { localPlayer } from '../../game/playerState'
import { send } from '../../net/connection'
import { BOOT_BY_ID, EGG_BY_ID, PET_BY_ID, RARITIES, STAGES, WORLDS, describeReward, formatDuration, formatMult, formatNumber, formatSpan, parseList } from '../../shared/gameData.js'
import { getLayout } from '../../shared/layout.js'
import { gameState, useGameStore } from '../../store/gameStore'
import { useProgress } from '../../store/progression'
import { RebirthIcon } from '../icons'
import { goToWorld } from '../interact'
import { useNow } from '../useNow'
import { Grid, Modal } from './Modal'
import { action } from './actions'

/* ---------------------------------------------------------------------------
 * Rebirth
 * ------------------------------------------------------------------------- */

export function RebirthPanel() {
  const p = useProgress()
  if (!p.ready) return null
  const { now, next } = p.rebirth
  const rows = [
    ['🦘 Jumps (level 0 → 15)', `${now.jumps[0]}–${now.jumps[1]}`, `${next.jumps[0]}–${next.jumps[1]}`],
    ['⭐ XP multiplier', formatMult(now.mult), formatMult(next.mult)],
    ['🏆 Wins bonus', `+${now.wins}%`, `+${next.wins}%`],
  ]
  return (
    <Modal title="Rebirth" icon={<RebirthIcon width="48" height="48" />} color="#ff4f6d" width="min(640px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="title-text text-[36px]">Rebirths: {formatNumber(p.rebirths)}</div>
        <div className="flex w-full flex-col gap-2">
          {rows.map(([label, a, b]) => (
            <div key={label} className="rebirth-row">
              <span className="ink-text text-[18px] font-bold">{label}</span>
              <span className="game-text text-[24px] text-[#d27bff]">{a}</span>
              <span className="game-text text-[24px]">➜</span>
              <span className="game-text text-[24px] text-[#4dff6a]">{b}</span>
            </div>
          ))}
        </div>
        {next.pad && (
          <div className="ink-text text-[16px]">
            🦘 Unlocks the <b>{next.pad.name}</b> ({next.pad.rate} jumps a second)
          </div>
        )}
        {next.egg && (
          <div className="ink-text text-[16px]">
            🥚 Unlocks the <b>{next.egg.name}</b>
          </div>
        )}
        {next.world && (
          <div className="ink-text text-[16px]">
            {next.world.icon} Opens <b>{next.world.name}</b> (the portal at the back of the lobby)
          </div>
        )}
        {next.stages.length > 0 && (
          <div className="ink-text text-[16px]">
            🔓 Opens <b>Stage{next.stages.length > 1 ? 's' : ''} {next.stages.join(' & ')}</b> (with {STAGES[next.stages[0] - 1] && BOOT_BY_ID[STAGES[next.stages[0] - 1].boot].name})
          </div>
        )}
        {p.canRebirth ? (
          <div className="title-text mt-1 text-[28px] text-[#ffd23a]">You're level {p.maxLevel} — rebirth now!</div>
        ) : (
          <>
            <div className="ink-text mt-1 text-[19px] font-bold">
              Reach Level {p.maxLevel} ({p.level}/{p.maxLevel})
            </div>
            <div className="progress-mini">
              <div style={{ width: `${p.rebirthProgress * 100}%` }} />
            </div>
          </>
        )}
        <button
          type="button"
          className={`btn-chunky ${p.canRebirth ? 'btn-green press rebirth-go' : 'btn-gray'} game-text mt-2 px-12 py-2 text-[36px]`}
          disabled={!p.canRebirth}
          onClick={action('rebirth')}
        >
          REBIRTH
        </button>
        <div className="ink-text text-[14px] opacity-75">
          Back to level 0, with +1 jump for good. You keep your Wins, boots, pets, upgrades, stages and title.
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Playtime gifts
 * ------------------------------------------------------------------------- */

const GIFT_ICON = { wins: '🏆', boost: '⚡', xp: '⭐' }

export function GiftsPanel({ me }) {
  const now = useNow(1000)
  const gifts = useProgress((s) => s.gifts ?? [])
  const claimed = parseList(me.gifts)
  return (
    <Modal title="Gifts" icon="🎁" color="#2fbf55" width="min(860px, 95vw)">
      <div className="ink-text mb-3 text-center text-[17px]">Free gifts for playing — the longer you play, the bigger they get!</div>
      <Grid min={175}>
        {gifts.map((gift, i) => {
          const done = claimed.includes(String(i))
          const wait = me.sessionAt + gift.minutes * 60_000 - now
          return (
            <div key={i} className={`card ${!done && wait <= 0 ? 'is-highlight' : ''}`}>
              <div className="text-[46px] leading-none">{GIFT_ICON[gift.kind]}</div>
              <div className="ink-text text-[16px] font-bold leading-tight">{describeReward(gift.reward)}</div>
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
  const pad = layout.jumpPads[0]
  const egg = layout.eggStands[0]
  return [
    { id: 'spawn', icon: '🏠', label: 'Spawn', go: () => localPlayer.goHome() },
    { id: 'boots', icon: '🥾', label: 'Boots', go: () => localPlayer.teleportTo({ x: stand.pos[0] + 7, y: 0.2, z: stand.pos[2] - 4, yaw: -Math.PI / 2 }) },
    { id: 'pads', icon: '🦘', label: 'Jump Pads', go: () => localPlayer.teleportTo({ x: pad.center[0] - 9, y: 0.2, z: pad.center[1], yaw: Math.PI / 2 }) },
    { id: 'eggs', icon: '🥚', label: 'Pet Eggs', go: () => localPlayer.teleportTo({ x: egg.pos[0] + 12, y: 0.2, z: egg.pos[2] - 12, yaw: 0 }) },
  ]
}

export function TeleportPanel({ me }) {
  const best = me.bestStage || 0
  return (
    <Modal title="Teleport" icon="🌀" color="#7a5cff" width="min(860px, 95vw)">
      <div className="game-text mb-2 text-[22px]">Lobby</div>
      <Grid min={170}>
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
      <div className="game-text mb-2 mt-4 text-[22px]">Worlds</div>
      <Grid min={180}>
        {WORLDS.map((world) => {
          const locked = (me.rebirths ?? 0) < world.rebirths
          return (
            <button key={world.id} type="button" className="card press" onClick={() => goToWorld(world.id, me)}>
              <span className="text-[40px] leading-none">{locked ? '🔒' : world.icon}</span>
              <span className="ink-text text-[19px] font-bold">{world.name}</span>
              <span className="ink-text text-[13px]">
                {locked ? `${world.rebirths} Rebirth${world.rebirths > 1 ? 's' : ''} needed` : `Stages ${world.firstStage}-${world.lastStage}`}
              </span>
            </button>
          )
        })}
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
 * Settings, custom jump height
 * ------------------------------------------------------------------------- */

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

/** A 0..1 volume slider (sized for thumbs). */
function Volume({ label, value, disabled, onChange, onRelease }) {
  return (
    <label className={`card volume-row flex-row items-center gap-4 px-5 ${disabled ? 'opacity-50' : ''}`}>
      <span className="ink-text shrink-0 text-[18px] font-bold">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round((value ?? 0) * 100)}
        aria-label={label}
        className="volume-slider min-w-0 flex-1"
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onRelease}
      />
      <span className="ink-text w-12 shrink-0 text-right text-[18px] font-bold">{Math.round((value ?? 0) * 100)}</span>
    </label>
  )
}

export function SettingsPanel() {
  const settings = useGameStore((s) => s.settings)
  const set = (key) => (value) => {
    gameState().setSetting(key, value)
    if (key === 'music') sound.setMusic(value)
    if (key === 'sfx') sound.setSfx(value)
    if (key === 'musicVolume') sound.setMusicVolume(value)
    if (key === 'sfxVolume') sound.setSfxVolume(value)
  }
  return (
    <Modal title="Settings" icon="⚙️" color="#6b7a94" width="min(580px, 95vw)">
      <div className="flex flex-col gap-3">
        <Toggle label="🎵 Music" value={settings.music} onChange={set('music')} />
        <Volume label="Music volume" value={settings.musicVolume} disabled={!settings.music} onChange={set('musicVolume')} />
        <Toggle label="🔊 Sound effects" value={settings.sfx} onChange={set('sfx')} />
        <Volume label="Effects volume" value={settings.sfxVolume} disabled={!settings.sfx} onChange={set('sfxVolume')} onRelease={() => sound.coin()} />
        <div className="card flex-row justify-between px-5">
          <span className="ink-text text-[22px] font-bold">🖥️ Graphics</span>
          <div className="flex gap-2">
            {['low', 'medium', 'high'].map((q) => (
              <button
                key={q}
                type="button"
                className={`chip press ${settings.quality === q ? 'bg-[#2f8cff] text-white' : 'bg-white text-[#15151d]'}`}
                onClick={() => {
                  set('quality')(q)
                  // Picked by hand: no automatic changes any more.
                  gameState().setSetting('autoQuality', false)
                }}
              >
                {q.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="card items-start px-5 text-left">
          <div className="ink-text text-[20px] font-bold">Controls</div>
          <div className="ink-text text-[16px]">
            WASD / arrows walk · SPACE jump (tap again in the air, or hold to keep jumping) · E use · drag to look around · scroll to zoom · the letter on
            each button opens it
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function JumpHeightPanel() {
  const custom = useGameStore((s) => s.settings.customJump)
  const max = useProgress((s) => s.height ?? 8)
  const value = custom ? Math.min(custom, max) : max
  const set = (v) => gameState().setSetting('customJump', v >= max - 0.05 ? null : v)
  return (
    <Modal title="Custom Jump Height" icon="✏️" color="#ff5a7a" width="min(560px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="title-text text-[64px] text-[#ff5a7a]">{value.toFixed(1)}</div>
        <input type="range" min={3} max={max} step={0.1} value={value} onChange={(e) => set(Number(e.target.value))} className="jump-slider w-full" />
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
        <div className="ink-text text-[15px] opacity-75">Lower jumps help with tricky platforms. Levels give you more jumps, not higher ones.</div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Welcome, daily reward, offline earnings, egg hatching
 * ------------------------------------------------------------------------- */

export function WelcomePanel() {
  return (
    <Modal title="Welcome!" icon="🦘" color="#ff9a1f" width="min(700px, 95vw)">
      <div className="flex flex-col gap-2 text-left">
        {[
          ['🦘', 'Every jump gives XP! Stand on a JUMP PAD in the lobby and it bounces you — training even while you rest.'],
          ['⏫', 'Levels give you more jumps in the air: 2 at level 4, 3 at level 8, 5 at level 15…'],
          ['🔥', 'Escape over the lava: every stage starts with a long jump. Jump at the edge, then again in the air.'],
          ['🏆', 'Beat a stage and step on the yellow Return pad for Wins.'],
          ['🥾', 'Spend Wins on Boots: faster running, more XP, and every pair opens two new stages.'],
          ['🔄', 'At MAX level, Rebirth: x2 XP for good, a higher MAX level and better jump pads.'],
        ].map(([icon, text]) => (
          <div key={text} className="welcome-row">
            <span className="text-[30px] leading-none">{icon}</span>
            <span className="ink-text text-[17px] leading-snug">{text}</span>
          </div>
        ))}
        <button type="button" className="btn-chunky btn-green press game-text mt-2 py-2 text-[32px]" onClick={() => gameState().closePanel()}>
          LET&apos;S GO!
        </button>
      </div>
    </Modal>
  )
}

export function DailyPanel({ props }) {
  const streak = props.streak ?? 1
  const daily = useProgress((s) => s.daily ?? [])
  return (
    <Modal title="Daily Reward" icon="📅" color="#ffb81f" width="min(700px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="title-text text-[40px] text-[#ff9a1f]">Day {streak} streak!</div>
        <div className="flex flex-wrap justify-center gap-2">
          {daily.map((reward, i) => (
            <div key={i} className={`day-chip ${i + 1 <= streak ? 'is-done' : ''} ${i + 1 === streak ? 'is-today' : ''}`}>
              <span className="game-text text-[15px]">Day {i + 1}</span>
              <span className="game-text text-[17px]">🏆 {formatNumber(reward.wins)}</span>
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

/** "While you were away": your best jump pad kept bouncing (at 30%), up to 8 hours. */
export function OfflinePanel({ props }) {
  return (
    <Modal title="Welcome back!" icon="🌙" color="#5b6bff" width="min(600px, 95vw)">
      <div className="card gap-3 px-6">
        <div className="ink-text text-[19px]">While you were away for {formatSpan(props.seconds)}, your jump pad kept bouncing:</div>
        <div className="title-text text-[44px] text-[#ffd23a]">+{formatNumber(props.jumps)} jumps</div>
        <div className="title-text text-[34px] text-[#7fd4ff]">+{formatNumber(props.xp)} XP</div>
        {props.levels > 0 && <div className="title-text text-[30px] text-[#ff8fd8]">+{props.levels} level{props.levels > 1 ? 's' : ''}!</div>}
        <div className="ink-text text-[14px] opacity-75">Away time pays 30% of your best jump pad, for up to 8 hours.</div>
        <button type="button" className="btn-chunky btn-green press game-text px-12 py-2 text-[30px]" onClick={() => gameState().closePanel()}>
          COLLECT!
        </button>
      </div>
    </Modal>
  )
}

/** An egg cracking open: the pet, its rarity and bonus. */
export function HatchPanel({ props }) {
  const pet = PET_BY_ID[props.pet]
  const egg = EGG_BY_ID[props.egg]
  const p = useProgress((s) => s.eggs?.find((e) => e.id === props.egg))
  if (!pet) return null
  const rarity = RARITIES[pet.rarity]
  return (
    <Modal title={egg?.name ?? 'Egg'} icon="🥚" color={rarity.color} width="min(520px, 95vw)">
      <div className="card hatch-card gap-2 px-6" key={props.at}>
        <div className="hatch-burst" style={{ '--rarity': rarity.color }}>
          <span className="hatch-pet" style={{ background: pet.color, borderColor: pet.accent }}>
            {pet.name.charAt(0)}
          </span>
        </div>
        <div className="title-text text-[26px]" style={{ color: rarity.color }}>
          {rarity.name.toUpperCase()}!
        </div>
        <div className="title-text text-[44px]">{pet.name}</div>
        <div className="game-text text-[26px] text-[#7dff8a]">+{Math.round(pet.bonus * 100)}% XP</div>
        <div className="mt-2 flex gap-3">
          {p?.open && (
            <button
              type="button"
              className={`btn-chunky ${p.affordable ? 'btn-green' : 'btn-gray'} press game-text px-6 py-2 text-[22px]`}
              disabled={!p.affordable}
              onClick={action('buy', { cat: 'egg', id: props.egg })}
            >
              AGAIN · 🏆 {formatNumber(egg.price)}
            </button>
          )}
          <button type="button" className="btn-chunky btn-blue press game-text px-6 py-2 text-[22px]" onClick={() => gameState().openPanel('pets')}>
            MY PETS
          </button>
        </div>
      </div>
    </Modal>
  )
}
