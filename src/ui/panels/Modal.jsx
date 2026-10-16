import { useEffect } from 'react'

import { sound } from '../../audio/sound'
import { shade } from '../../game/world/textures'
import { formatNumber } from '../../shared/gameData.js'
import { gameState } from '../../store/gameStore'
import { CurrencyIcon } from '../icons'

/** Chunky Roblox-style window with a coloured title bar and a red ✕. */
export function Modal({ title, icon, color = '#3ba8ff', tabs, width, children }) {
  const close = () => {
    sound.click()
    gameState().closePanel()
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') gameState().closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="modal-backdrop pointer-events-auto"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="panel ui-scaled" style={width ? { width } : undefined}>
        <div className="panel-header" style={{ background: `linear-gradient(${shade(color, 0.3)}, ${color})` }}>
          <span>{icon}</span>
          <span className="title-text">{title}</span>
          <button type="button" className="panel-close btn-chunky btn-red press" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {tabs}
        <div className="panel-body">{children}</div>
      </div>
    </div>
  )
}

export function Grid({ children, min = 180 }) {
  return <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>
}

export function Price({ value }) {
  return (
    <span className="inline-flex items-center gap-1">
      <CurrencyIcon />
      {value ? formatNumber(value) : 'FREE'}
    </span>
  )
}

/** The usual card footer: equipped / equip / buy (red when unaffordable). */
export function OwnButton({ owned, equipped, price, me, onBuy, onEquip, disabled, label }) {
  if (equipped) {
    return (
      <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
        EQUIPPED
      </button>
    )
  }
  if (owned) {
    return (
      <button type="button" className="btn-chunky btn-blue press card-button game-text" onClick={onEquip}>
        EQUIP
      </button>
    )
  }
  if (disabled) {
    return (
      <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
        {label ?? 'LOCKED'}
      </button>
    )
  }
  const affordable = (me?.wins ?? 0) >= price
  return (
    <button type="button" className={`btn-chunky ${affordable ? 'btn-green' : 'btn-red'} press card-button game-text`} onClick={onBuy}>
      <Price value={price} />
    </button>
  )
}
