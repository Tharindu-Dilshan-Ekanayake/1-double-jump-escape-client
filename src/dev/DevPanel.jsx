import { useEffect, useState } from 'react'

import { isTyping } from '../game/input'
import { localPlayer } from '../game/playerState'
import { BOOTS, BOOT_BY_ID, SHOP_PERKS, STAGES, moveStats } from '../shared/gameData.js'
import { STAGE_RISE, gapReach, getLayout } from '../shared/layout.js'
import { useGameStore } from '../store/gameStore'
import { devMoveBuild, devTeleport, setDev, stageAhead, useDevStore } from './devTools'

/**
 * Dev tools (only in `npm run dev`): F2 opens the panel; [ and ] go to the
 * previous / next stage's long jump, \ to the end of the stage you're on.
 */

const STAGE_COUNT = STAGES.length

function useDevHotkeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping()) return
      const stage = useGameStore.getState().stage
      // Step from the stage the last teleport went to, or the one you've walked to since.
      const from = Math.max(useDevStore.getState().at, stage)
      if (e.code === 'F2') setDev({ open: !useDevStore.getState().open })
      else if (e.code === 'BracketRight') devTeleport(Math.min(STAGE_COUNT, from + 1))
      else if (e.code === 'BracketLeft') {
        if (from <= 1) goLobby()
        else devTeleport(from - 1)
      } else if (e.code === 'Backslash') devTeleport(Math.max(1, stage), 'end')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function goLobby() {
  localPlayer.goHome()
  setDev({ at: 0 })
}

/** Re-renders a few times a second while open (position, current stage). */
function useTicker(on) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!on) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [on])
}

function Toggle({ label, on, onClick }) {
  return (
    <button type="button" className={`dev-btn ${on ? 'dev-on' : ''}`} onClick={onClick}>
      {on ? '✓ ' : ''}
      {label}
    </button>
  )
}

function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="dev-stepper">
      <span>{label}</span>
      <button type="button" className="dev-btn" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <b>{value}</b>
      <button type="button" className="dev-btn" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  )
}

/** What you're moving with, and whether it makes the next long jump. */
function Readout({ stageIndex }) {
  const me = useGameStore((s) => s.me)
  const shown = stageAhead(localPlayer.position.z)
  const stage = getLayout().stages[shown - 1]
  const build = devMoveBuild() || me || { level: 0, boot: 'starter', perkSpeed: 0, rebirths: 0 }
  const stats = moveStats(build.level, build.boot, build.perkSpeed ?? 0, build.rebirths ?? 0)
  const reach = gapReach(stats, STAGE_RISE)
  const share = reach / stage.gateSize
  const p = localPlayer.position
  return (
    <div className="dev-readout">
      <div>
        <b>{stageIndex ? `Stage ${stageIndex}` : 'Lobby'}</b>
        {stageIndex ? ` · ${stage.name} · ${stage.pattern}` : ''}
      </div>
      <div>
        Moving as: level {build.level}{build.rebirths ? `, ${build.rebirths} rebirths` : ''} · {BOOT_BY_ID[build.boot]?.name ?? 'Fluffy Slippers'}
        {build.perkSpeed ? ` · Swift Feet ${build.perkSpeed}` : ''}
      </div>
      <div>
        Speed {stats.speed} · jump {stats.height} · {stats.jumps} jumps · reach {reach.toFixed(0)}
      </div>
      <div className={share >= 1 ? 'dev-good' : 'dev-bad'}>
        Next long jump (into Stage {shown}) {stage.gateSize.toFixed(0)} studs: {share >= 1 ? '✓ makes it' : '✗ too short'} ({Math.round(share * 100)}%)
      </div>
      <div className="dev-dim">
        Stage {shown} needs: {STAGES[shown - 1].jumps} jumps (level {stage.level}) · {BOOT_BY_ID[stage.boot].name}
        {stage.rebirths ? ` · ${stage.rebirths} rebirths` : ''} · x {p.x.toFixed(0)} y {p.y.toFixed(0)} z {p.z.toFixed(0)}
      </div>
    </div>
  )
}

export default function DevPanel() {
  const dev = useDevStore()
  const stageIndex = useGameStore((s) => s.stage)
  const playing = useGameStore((s) => s.phase === 'playing')
  useDevHotkeys()
  useTicker(dev.open && playing)
  if (!dev.open || !playing) return null
  const custom = dev.custom
  const setCustom = (patch) => setDev({ custom: { ...custom, ...patch } })

  return (
    // Buttons never take focus, so Space keeps jumping after a click.
    <div className="dev-panel" onMouseDown={(e) => e.preventDefault()}>
      <div className="dev-head">
        <b>DEV TOOLS</b>
        <span className="dev-dim">F2 · [ ] stages · \ stage end</span>
        <button type="button" className="dev-btn" onClick={() => setDev({ open: false })}>
          ✕
        </button>
      </div>

      <Readout stageIndex={stageIndex} />

      <div className="dev-row">
        <Toggle label="God mode" on={dev.god} onClick={() => setDev({ god: !dev.god })} />
        <Toggle label="Open stage doors" on={dev.doors} onClick={() => setDev({ doors: !dev.doors })} />
      </div>

      <div className="dev-label">Move with</div>
      <div className="dev-row">
        <Toggle label="My build" on={dev.buildMode === 'mine'} onClick={() => setDev({ buildMode: 'mine' })} />
        <Toggle label="Stage's recommended" on={dev.buildMode === 'stage'} onClick={() => setDev({ buildMode: 'stage' })} />
        <Toggle label="Custom" on={dev.buildMode === 'custom'} onClick={() => setDev({ buildMode: 'custom' })} />
      </div>
      {dev.buildMode === 'custom' && (
        <div className="dev-custom">
          <div className="dev-row">
            <Stepper label="Level" value={custom.level} min={0} max={15} onChange={(level) => setCustom({ level })} />
            <Stepper label="Rebirths" value={custom.rebirths ?? 0} min={0} max={20} onChange={(rebirths) => setCustom({ rebirths })} />
            <Stepper
              label={`Boots: ${BOOT_BY_ID[custom.boot ?? 'starter'].name}`}
              value={Math.max(0, BOOTS.findIndex((b) => b.id === (custom.boot ?? 'starter')))}
              min={0}
              max={BOOTS.length - 1}
              onChange={(tier) => setCustom({ boot: BOOTS[tier].id })}
            />
            <Stepper label="Swift Feet" value={custom.perkSpeed ?? 0} min={0} max={SHOP_PERKS.speed.max} onChange={(perkSpeed) => setCustom({ perkSpeed })} />
          </div>
        </div>
      )}

      <div className="dev-label">Go to</div>
      <div className="dev-row">
        <button type="button" className="dev-btn" onClick={goLobby}>
          Lobby
        </button>
        {getLayout().worlds.map((w) => (
          <button
            key={w.id}
            type="button"
            className="dev-btn"
            onClick={() => {
              localPlayer.teleportTo(w.spawn)
              setDev({ at: w.firstStage - 1 })
            }}
          >
            {w.icon} {w.name}
          </button>
        ))}
      </div>
      <div className="dev-stages">
        {STAGES.map((def, i) => {
          const index = i + 1
          return (
            <div key={def.name} className={`dev-stage ${index === stageIndex ? 'dev-here' : ''}`}>
              <span>
                {index}. {def.icon} {def.name}
              </span>
              <button type="button" className="dev-btn" title="At the doorway, about to make its long jump in" onClick={() => devTeleport(index, 'jump')}>
                Jump in
              </button>
              <button type="button" className="dev-btn" title="On its landing, past the long jump" onClick={() => devTeleport(index, 'start')}>
                Start
              </button>
              <button type="button" className="dev-btn" title="By its Wins pads" onClick={() => devTeleport(index, 'end')}>
                End
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
