import { Vector3 } from 'three'

import { gameState } from '../store/gameStore'
import { localPlayer } from './playerState'

/** How "fast" it feels, 0 when jogging to 1 when flying (drives speed lines, blur and FOV). */
export function speedIntensity(speed) {
  return Math.max(0, Math.min(1, (speed - 20) / 60))
}

/**
 * The speed feel shared by the camera, the WebGL edge blur and the 2D speed
 * lines, updated once per rendered frame by `updateSpeedFeel`.
 *
 *  amount   0..1, eased: how strong the effects are
 *  kick     0..1, a burst on every jump that fades in a fraction of a second
 *  focusX/Y where the player is heading on screen (0..1, y up): the blur and
 *           the lines stream out from there, so they rise when you jump up
 */
export const speedFeel = { amount: 0, kick: 0, focusX: 0.5, focusY: 0.5 }

const _ahead = new Vector3()
let lastVy = 0

export function updateSpeedFeel(camera, dt) {
  const lp = localPlayer
  const playing = gameState().phase === 'playing'
  const vy = lp.velocity.y
  const target = playing ? speedIntensity(Math.hypot(lp.motion.speed, lp.motion.air ? vy * 0.45 : 0)) : 0
  speedFeel.amount += (target - speedFeel.amount) * (1 - Math.exp(-dt * 5))

  // A sudden upward kick in velocity is a jump.
  if (playing && vy - lastVy > 15 && lp.motion.speed > 8) speedFeel.kick = 1
  lastVy = vy
  speedFeel.kick = Math.max(0, speedFeel.kick - dt * 2.6)

  // Project a point a little ahead along the rider's motion to find the heading on screen.
  let fx = 0.5
  let fy = 0.5
  if (playing && speedFeel.amount > 0.01) {
    _ahead.copy(lp.velocity).multiplyScalar(0.6).add(lp.position)
    _ahead.y += 3.6
    _ahead.project(camera)
    if (_ahead.z < 1) {
      fx = Math.min(0.7, Math.max(0.3, _ahead.x * 0.5 + 0.5))
      fy = Math.min(0.75, Math.max(0.3, _ahead.y * 0.5 + 0.5))
    }
  }
  const ease = 1 - Math.exp(-dt * 4)
  speedFeel.focusX += (fx - speedFeel.focusX) * ease
  speedFeel.focusY += (fy - speedFeel.focusY) * ease
}
