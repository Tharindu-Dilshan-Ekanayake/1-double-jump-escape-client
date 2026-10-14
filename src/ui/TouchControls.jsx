import { useRef, useState } from 'react'

import { input, pressJump, releaseJump } from '../game/input'
import { gameState, useGameStore } from '../store/gameStore'
import { interact, promptInfo } from './interact'

const RADIUS = 60
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Virtual joystick, jump button and (near lobby things) an E button, only on touch screens. */
export function TouchControls() {
  const phase = useGameStore((s) => s.phase)
  const prompt = useGameStore((s) => s.prompt)
  const me = useGameStore((s) => s.me)
  const hydraLeft = useGameStore((s) => s.hydraLeft)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const origin = useRef(null)
  if (phase !== 'playing' || !isTouchDevice()) return null
  const info = promptInfo(prompt, me, hydraLeft)

  const move = (e) => {
    if (!origin.current) return
    let dx = e.clientX - origin.current.x
    let dy = e.clientY - origin.current.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    input.joyX = dx / RADIUS
    input.joyY = -dy / RADIUS
    setKnob({ x: dx, y: dy })
  }
  const end = () => {
    origin.current = null
    input.joyX = 0
    input.joyY = 0
    setKnob({ x: 0, y: 0 })
  }

  return (
    <>
      <div
        className="joystick"
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e)
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      {info?.active && (
        <button
          type="button"
          className="e-touch game-text"
          onPointerDown={() => {
            const s = gameState()
            interact(s.prompt, s.me, s.hydraLeft)
          }}
          aria-label="Use"
        >
          E
        </button>
      )}
      <button
        type="button"
        className="jump-touch"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pressJump()
        }}
        onPointerUp={releaseJump}
        onPointerCancel={releaseJump}
        onLostPointerCapture={releaseJump}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Jump"
      >
        ⏫
      </button>
    </>
  )
}

export default TouchControls
