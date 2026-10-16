/**
 * Breaking bridges. Step on a plank and it shakes for a moment (so you can
 * react), then drops away; a few seconds later it's back. Each player's
 * bridges break on their own screen only, so this lives on the client.
 *
 * The collision world asks `bridgeSolid(id)` (see physics.js); the world
 * draws each plank from `bridgePhase(id)`; the local player calls
 * `touchBridge(id)` while standing on one.
 */

/** Seconds a plank shakes before it goes, falls for, and stays gone (counting from the touch). */
export const BRIDGE_SHAKE = 0.55
export const BRIDGE_FALL = 0.7
export const BRIDGE_BACK = 3.5

/** bridge id -> time it was first stepped on */
const touched = new Map()
let clock = 0

/** Call once a frame with the current time (seconds). */
export function updateBridges(t) {
  clock = t
  for (const [id, at] of touched) if (t - at >= BRIDGE_BACK) touched.delete(id)
}

export function touchBridge(id) {
  if (!touched.has(id)) touched.set(id, clock)
}

/** { phase: 'idle' | 'shake' | 'fall' | 'gone', k (0..1 through that phase) } */
export function bridgePhase(id) {
  const at = touched.get(id)
  if (at === undefined) return { phase: 'idle', k: 0 }
  const age = clock - at
  if (age < BRIDGE_SHAKE) return { phase: 'shake', k: age / BRIDGE_SHAKE }
  if (age < BRIDGE_SHAKE + BRIDGE_FALL) return { phase: 'fall', k: (age - BRIDGE_SHAKE) / BRIDGE_FALL }
  return { phase: 'gone', k: 1 }
}

/** False once a plank has started to fall. */
export function bridgeSolid(id) {
  const at = touched.get(id)
  return at === undefined || clock - at < BRIDGE_SHAKE
}

/** Puts every plank back (going home, respawning). */
export function resetBridges() {
  touched.clear()
}
