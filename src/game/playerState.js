import { Vector3 } from 'three'

import { checkpointFor, getLayout } from '../shared/layout.js'

const spawn = getLayout().spawn

/**
 * The local player's per-frame state.
 *
 * Plain mutable data rather than React state: the controller writes it every
 * frame and the camera, network sender and HUD read it without re-rendering.
 */
export const localPlayer = {
  position: new Vector3(spawn.x, spawn.y, spawn.z),
  velocity: new Vector3(),
  yaw: spawn.yaw,
  grounded: true,
  /** Speed one jump gives (set by the controller from level, boots, rebirths). */
  jumpVelocity: 0,
  jumpsLeft: 1,
  /** Counts mid-air jumps; sent to the server so other screens play the flip. */
  flips: 0,
  /** performance.now() of the last teleport, so the camera snaps instead of swooping. */
  teleportedAt: 0,
  /** Last grounded spot on the course that's safe to revive on. */
  lastSafe: null,
  /** Set by UI buttons; the controller acts on them next frame. */
  pending: null,
  /** Visual motion read by the Character component (same shape as remote players). */
  motion: {
    position: new Vector3(spawn.x, spawn.y, spawn.z),
    yaw: spawn.yaw,
    speed: 0,
    air: false,
    flips: 0,
    jumpAt: 0,
    landAt: 0,
    bounce: false,
    dead: false,
  },

  /** Teleport (from a UI action) next frame: { x, y, z, yaw }. */
  teleportTo(point) {
    this.pending = point
  },

  /** Back to the lobby next frame. */
  goHome() {
    this.pending = { ...spawn, x: spawn.x + (Math.random() - 0.5) * 6, z: spawn.z + (Math.random() - 0.5) * 3, home: true }
  },

  checkpoint(stage) {
    const point = checkpointFor(getLayout(), stage)
    if (point) this.pending = point
  },

  /** Puts the player at a point right now. */
  place({ x, y, z, yaw = Math.PI }) {
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.yaw = yaw
    this.grounded = true
    this.teleportedAt = performance.now()
    this.motion.position.copy(this.position)
    this.motion.yaw = yaw
    this.motion.dead = false
  },
}
