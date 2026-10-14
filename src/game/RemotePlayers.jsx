import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { getRoom, parseAvatar } from '../net/connection'
import { trampolineAt, getLayout } from '../shared/layout.js'
import { Character } from './character/Character'

const SNAP_DISTANCE = 30
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Everyone else in the lobby. Transforms arrive ~20x/sec from the room state and
 * are smoothed here; appearance (boots, trail, avatar...) is polled twice a
 * second so it only re-renders when it actually changes.
 */
export function RemotePlayers() {
  const [ids, setIds] = useState([])

  useEffect(() => {
    const timer = setInterval(() => {
      const room = getRoom()
      const next = []
      room?.state.players?.forEach((_, sid) => {
        if (sid !== room.sessionId) next.push(sid)
      })
      setIds((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next))
    }, 300)
    return () => clearInterval(timer)
  }, [])

  return ids.map((sid) => <RemotePlayer key={sid} sid={sid} />)
}

/** Eases the displayed player towards the latest synced transform. */
function followServer(motion, p, state, delta) {
  const dt = Math.min(delta, 0.05)
  const now = performance.now() / 1000
  const prevY = motion.position.y
  if (!state.placed || Math.hypot(p.x - motion.position.x, p.z - motion.position.z) > SNAP_DISTANCE) {
    motion.position.set(p.x, p.y, p.z)
    motion.yaw = p.r
    motion.flips = p.flips
    state.placed = true
  } else {
    const k = 1 - Math.exp(-dt * 14)
    motion.position.x += (p.x - motion.position.x) * k
    motion.position.y += (p.y - motion.position.y) * k
    motion.position.z += (p.z - motion.position.z) * k
    motion.yaw += wrapAngle(p.r - motion.yaw) * k
  }
  // Vertical speed, smoothed, for the arms-up / arms-out pose.
  const vy = (motion.position.y - prevY) / Math.max(dt, 1e-3)
  motion.vy += (vy - motion.vy) * Math.min(1, dt * 10)
  motion.speed = p.s
  if (motion.air && !p.air) motion.landAt = now
  if (!motion.air && p.air && p.flips === motion.flips) motion.jumpAt = now
  motion.air = p.air
  motion.flips = p.flips
  motion.bounce = p.air && Boolean(trampolineAt(getLayout(), p.x, p.y, p.z))
  state.timer += dt
}

function RemotePlayer({ sid }) {
  const motion = useMemo(
    () => ({ position: new Vector3(), yaw: 0, speed: 0, vy: 0, air: false, flips: 0, jumpAt: 0, landAt: 0, bounce: false, dead: false }),
    [],
  )
  const [look, setLook] = useState(null)
  const poll = useRef({ timer: 1, signature: '', placed: false })

  useFrame((_, delta) => {
    const room = getRoom()
    const p = room?.state.players?.get(sid)
    if (!p) return
    const state = poll.current
    followServer(motion, p, state, delta)
    if (state.timer < 0.5) return
    state.timer = 0
    // The top jumper in the lobby (counting us) wears a crown.
    let topSid = null
    let top = -1
    room.state.players.forEach((other, otherSid) => {
      if (other.totalJump > top) {
        top = other.totalJump
        topSid = otherSid
      }
    })
    const crown = topSid === sid && p.totalJump > 0
    const signature = `${p.name}|${p.boot}|${p.trail}|${p.avatar}|${p.level}|${crown}`
    if (signature !== state.signature) {
      state.signature = signature
      const avatar = parseAvatar(p.avatar)
      setLook({
        name: p.name,
        boot: p.boot,
        trail: p.trail,
        equipped: avatar.equipped ?? null,
        proportions: avatar.proportions,
        seed: p.name,
        level: p.level,
        crown,
      })
    }
  })

  if (!look) return null
  return <Character motion={motion} look={look} />
}

export default RemotePlayers
