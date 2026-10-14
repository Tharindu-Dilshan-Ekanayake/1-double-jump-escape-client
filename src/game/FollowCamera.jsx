import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { gameState } from '../store/gameStore'
import { cameraRig } from './cameraRig'
import { getCollisionWorld } from './collisionWorld'
import { localPlayer } from './playerState'
import { speedFeel } from './speedFeel'

/** How high above the player's feet the camera aims. */
const LOOK_HEIGHT = 3.8

const MIN_DISTANCE = 6
const MAX_DISTANCE = 60

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the floor.
const MIN_PITCH = -0.25
const MAX_PITCH = 1.35

const DRAG_SENSITIVITY = 0.0055
const ZOOM_SENSITIVITY = 0.02
const BASE_FOV = 70
/** Extra field of view at full speed: the world rushes past a little more. */
const SPEED_FOV = 14
/** After a manual orbit, wait this long before easing back behind the player. */
const AUTO_FOLLOW_DELAY = 1.6
/** Keep the camera this far off walls. */
const WALL_PAD = 0.8

function setFov(camera, fov) {
  if (Math.abs(camera.fov - fov) < 0.01) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}

/** Screen shake: a quick random jitter that dies away (see cameraRig.shake). */
function applyShake(camera, dt) {
  if (cameraRig.shake <= 0.001) return
  const amp = cameraRig.shake * cameraRig.shake * 0.9
  camera.position.x += (Math.random() - 0.5) * amp
  camera.position.y += (Math.random() - 0.5) * amp
  camera.position.z += (Math.random() - 0.5) * amp
  cameraRig.shake = Math.max(0, cameraRig.shake - dt * 2.8)
}

const _desired = new Vector3()
const _target = new Vector3()

/**
 * Third-person orbit camera.
 *
 * Drag (left or right button, or one finger) orbits, the wheel zooms. While
 * the player runs forwards the camera eases back behind them; it pulls in
 * when a wall would block the view, so it never clips into the corridor.
 * Before joining, it slowly circles the lobby.
 */
export function FollowCamera() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const look = useRef(new Vector3())
  const state = useRef({ lastDrag: -10, seenTeleport: -1, initialised: false, distance: cameraRig.distance })

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let pointerId = null
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e) => {
      if (e.button !== 0 && e.button !== 2) return
      dragging = true
      pointerId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e) => {
      if (!dragging || e.pointerId !== pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      cameraRig.yaw -= dx * DRAG_SENSITIVITY
      cameraRig.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, cameraRig.pitch + dy * DRAG_SENSITIVITY))
      state.current.lastDrag = performance.now() / 1000
    }
    const endDrag = (e) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }
    const onWheel = (e) => {
      // Without this the page scrolls behind the canvas.
      e.preventDefault()
      cameraRig.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, cameraRig.distance + e.deltaY * ZOOM_SENSITIVITY))
    }
    // Right-dragging otherwise opens the browser context menu mid-orbit.
    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    // passive:false is required for preventDefault() on wheel to take effect.
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = state.current

    if (gameState().phase !== 'playing') {
      // Before joining: a slow cinematic circle over the lobby.
      const a = now * 0.07
      camera.position.set(Math.sin(a) * 70, 36, 48 + Math.cos(a) * 70)
      look.current.set(0, 4, 46)
      camera.lookAt(look.current)
      setFov(camera, BASE_FOV)
      s.initialised = false
      return
    }

    const lp = localPlayer
    _target.copy(lp.position)
    _target.y += LOOK_HEIGHT

    // Snap (no swoop) on the first frame and after any teleport.
    const snap = !s.initialised || lp.teleportedAt !== s.seenTeleport
    const speed = lp.motion.speed
    if (snap) {
      cameraRig.yaw = lp.yaw + Math.PI
    } else if (now - s.lastDrag > AUTO_FOLLOW_DELAY && speed > 6) {
      // Ease behind the player while they run forwards-ish (never while
      // strafing towards the camera, which would spin it round).
      const behind = lp.yaw + Math.PI
      const diff = Math.atan2(Math.sin(behind - cameraRig.yaw), Math.cos(behind - cameraRig.yaw))
      if (Math.abs(diff) < 2.2) cameraRig.yaw += diff * (1 - Math.exp(-dt * Math.min(speed / 24, 1.6)))
    }

    // Pull in when a wall is between the player and the camera.
    const { yaw, pitch } = cameraRig
    const dirX = Math.sin(yaw) * Math.cos(pitch)
    const dirY = Math.sin(pitch)
    const dirZ = Math.cos(yaw) * Math.cos(pitch)
    _desired.set(_target.x + dirX * cameraRig.distance, _target.y + dirY * cameraRig.distance, _target.z + dirZ * cameraRig.distance)
    const free = getCollisionWorld().raycast(_target, _desired, WALL_PAD)
    const want = Math.max(2.5, Math.min(cameraRig.distance, free - WALL_PAD))
    // Snap in instantly (no clipping), ease back out.
    s.distance = want < s.distance ? want : s.distance + (want - s.distance) * (1 - Math.exp(-dt * 4))
    _desired.set(_target.x + dirX * s.distance, _target.y + dirY * s.distance, _target.z + dirZ * s.distance)

    if (snap) {
      s.initialised = true
      s.seenTeleport = lp.teleportedAt
      s.distance = want
      _desired.set(_target.x + dirX * want, _target.y + dirY * want, _target.z + dirZ * want)
      camera.position.copy(_desired)
      look.current.copy(_target)
    } else {
      look.current.lerp(_target, 1 - Math.exp(-dt * 18))
      camera.position.lerp(_desired, 1 - Math.exp(-dt * 16))
    }
    camera.lookAt(look.current)
    applyShake(camera, dt)
    const fov = BASE_FOV + SPEED_FOV * speedFeel.amount + 5 * speedFeel.kick
    setFov(camera, camera.fov + (fov - camera.fov) * (1 - Math.exp(-dt * 4)))
  })

  return null
}

export default FollowCamera
