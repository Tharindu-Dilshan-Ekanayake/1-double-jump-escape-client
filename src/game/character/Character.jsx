import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'

import { sound } from '../../audio/sound'
import { burst } from '../burst'
import { ringBurst } from '../fx/rings'
import PlayerAvatar from '../PlayerAvatar'
import { textSprite } from '../world/signs'
import { RIG_HEIGHT, createBlockyAvatar } from './blockyAvatar'
import { bootVisible, createBoot, updateBoot } from './boots'
import { StripeTrail } from './StripeTrail'

// Dev-only switch: ?blocky forces the fallback avatar.
const FORCE_BLOCKY = import.meta.env.DEV && new URLSearchParams(window.location.search).has('blocky')

/** Character height in studs. */
export const AVATAR_HEIGHT = 5
const AVATAR_SCALE = AVATAR_HEIGHT / RIG_HEIGHT
/** Height of the flip pivot (roughly the centre of the body). */
const PIVOT_Y = 2.5
const FLIP_TIME = 0.42
/** Death: a short freeze (hit-stop), then the body shrinks away in a poof. */
const HIT_STOP = 0.13
const DISSOLVE = 0.36
/** Spawning in: a quick elastic pop. */
const SPAWN_TIME = 0.45
const DISSOLVE_COLORS = ['#ffffff', '#ff5a7a', '#ffd23a', '#7fd4ff']

/** Falls back to the blocky avatar if the Bloxity avatar can't load. */
class AvatarBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err) {
    console.warn('[character] avatar failed to load, using blocky avatar', err)
  }

  render() {
    return this.props.failed || this.state.failed ? this.props.fallback : this.props.children
  }
}

function BlockyCharacter({ seed, boot, poseRef }) {
  const avatar = useMemo(() => createBlockyAvatar(seed), [seed])
  useEffect(() => () => avatar.dispose(), [avatar])
  const boots = useMemo(() => {
    if (!bootVisible(boot)) return []
    return [
      ['footL', 1],
      ['footR', -1],
    ].map(([joint, side]) => {
      const made = createBoot(boot, side)
      avatar.joints[joint].add(made.group)
      return made
    })
  }, [avatar, boot])
  useEffect(() => () => boots.forEach((b) => b.group.parent?.remove(b.group)), [boots])
  useFrame(() => {
    const pose = poseRef.current
    avatar.animate(pose)
    for (const b of boots) updateBoot(b, pose)
  })
  return (
    <group scale={AVATAR_SCALE}>
      <primitive object={avatar.group} />
    </group>
  )
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
/** 0 -> 1 with an overshoot wobble. */
const elasticOut = (t) => (t >= 1 ? 1 : 1 - Math.cos(t * Math.PI * 3.2) * Math.exp(-6 * t))
const _cam = new Vector3()

/**
 * Per-frame animation: placement, front flips on air jumps (queued from the
 * synced jump counter), squash and stretch, the death freeze and dissolve,
 * the spawn pop, the pose fed to the avatar and boots, and the trail.
 */
function stepCharacter(ctx, camera, delta) {
  const { motion, anim: a, pose, root, pivot, content, trail, anchor, isLocal } = ctx
  if (!root || !pivot || !content) return
  const dt = Math.min(delta, 0.05)
  const now = performance.now() / 1000

  root.position.copy(motion.position)
  root.rotation.y = motion.yaw

  // Other players' boot effects thin out with distance (and stop far away).
  const dist = _cam.copy(camera.position).distanceTo(motion.position)
  pose.fx = isLocal ? 1 : dist < 50 ? 0.6 : dist < 110 ? 0.25 : 0

  // Every mid-air jump queues a front flip; spamming chains them faster.
  const flipsDelta = (motion.flips - a.lastFlips) & 0xffff
  if (flipsDelta > 0 && flipsDelta < 64) {
    a.queue = Math.min(2, a.queue + flipsDelta)
    // (The local player's ring comes from the controller, with its exact feet.)
    if (!isLocal && dist < 90) {
      ringBurst(motion.position, { color: '#ffffff', radius: 2.8, life: 0.4, opacity: 0.7 })
      sound.spatialJump(motion.position, true)
    }
  }
  a.lastFlips = motion.flips
  if (a.flipT < 0 && a.queue > 0) {
    a.queue -= 1
    a.flipT = 0
  }
  let spin = 0
  if (a.flipT >= 0) {
    a.flipT = Math.min(1, a.flipT + (dt / FLIP_TIME) * (motion.air ? 1 : 3) * (a.queue ? 1.5 : 1))
    spin = Math.PI * 2 * easeInOut(a.flipT)
    if (a.flipT >= 1) a.flipT = -1
  }

  // Death: hold still for a beat, then shrink away in a puff.
  let scale = 1
  let frozen = false
  if (motion.dead) {
    const age = now - (motion.deadAt ?? now)
    if (age < HIT_STOP) {
      frozen = true
      root.position.x += (Math.random() - 0.5) * 0.12
      root.position.z += (Math.random() - 0.5) * 0.12
    } else {
      const k = Math.min(1, (age - HIT_STOP) / DISSOLVE)
      scale = 1 - k * k
      spin += k * 5
      if (!a.dissolved) {
        a.dissolved = true
        burst(anchor.set(motion.position.x, motion.position.y + 2.5, motion.position.z), {
          colors: DISSOLVE_COLORS,
          count: 34,
          speed: 9,
          up: 6,
          life: 0.8,
          gravity: 10,
          size: 1.1,
          spread: 1.5,
        })
      }
    }
  } else a.dissolved = false

  // Spawning in (respawn, teleport): an elastic pop with a ring.
  const spawnAge = now - (motion.spawnAt ?? -10)
  if (spawnAge < SPAWN_TIME) {
    scale *= Math.max(0.05, elasticOut(spawnAge / SPAWN_TIME))
    if (!a.spawnRing || a.spawnRing !== motion.spawnAt) {
      a.spawnRing = motion.spawnAt
      ringBurst(motion.position, { color: '#9fe8ff', radius: 4, life: 0.5 })
    }
  }
  content.visible = scale > 0.02

  // Squash on landing (harder landings squash more), stretch on take-off,
  // and a big stretch when a trampoline launches you.
  const landAge = now - motion.landAt
  const impact = 0.1 + 0.16 * Math.min(1, motion.landImpact ?? 0.5)
  const squash = landAge < 0.24 ? Math.sin((landAge / 0.24) * Math.PI) * impact : 0
  const jumpAge = now - motion.jumpAt
  let stretch = jumpAge < 0.22 ? Math.sin((jumpAge / 0.22) * Math.PI) * 0.12 : 0
  const bounceAge = now - (motion.bounceAt ?? -10)
  if (bounceAge < 0.35) stretch = Math.max(stretch, Math.sin((bounceAge / 0.35) * Math.PI) * 0.34)
  pivot.rotation.x = spin
  content.scale.set((1 + squash * 0.5 - stretch * 0.35) * scale, (1 - squash + stretch) * scale, (1 + squash * 0.5 - stretch * 0.35) * scale)

  if (!frozen) {
    pose.time = now
    pose.dt = dt
  } else pose.dt = 0
  pose.speed = motion.speed
  pose.grounded = !motion.air
  pose.rising = motion.vy ?? 0
  pose.bounce = Boolean(motion.bounce)
  pose.moving = motion.speed > 3
  pose.air = motion.air
  pose.power = Math.min(1, motion.speed / 50 + (motion.air ? 0.45 : 0) + (jumpAge < 0.25 ? 0.4 : 0))
  if (motion.dead) pose.fx = 0

  anchor.set(motion.position.x, motion.position.y + 0.12, motion.position.z)
  trail.update(anchor, !motion.dead && (motion.speed > 2 || motion.air), dt, now)
}

/**
 * A player: avatar, boots, trail and (for other players) a name tag.
 *
 * `motion` is a mutable object ({ position, yaw, speed, vy, air, flips, jumpAt,
 * landAt, landImpact, bounce, bounceAt, dead, deadAt, spawnAt }) written by the
 * local controller or the remote interpolator. `look` = { boot, trail,
 * equipped, proportions, seed, name, level, crown }. For the local player
 * `equipped` is undefined, so the avatar comes from the Bloxity session.
 */
export function Character({ motion, look, isLocal = false, onAvatarReady }) {
  const root = useRef(null)
  const pivot = useRef(null)
  const content = useRef(null)
  const poseRef = useRef({ time: 0, dt: 0, speed: 0, grounded: true, rising: 0, bounce: false, power: 0, moving: false, air: false, fx: 1 })
  const anim = useRef({ lastFlips: motion.flips, queue: 0, flipT: -1, dissolved: false, spawnRing: 0 })

  const trail = useMemo(() => new StripeTrail('white'), [])
  useEffect(() => trail.setTrail(look.trail), [trail, look.trail])
  useEffect(() => () => trail.dispose(), [trail])
  const anchor = useMemo(() => new Vector3(), [])

  // Other players' tags: name (with a crown for the lobby's top jumper) and level.
  const { name, level, crown } = look
  const nameTag = useMemo(() => {
    if (isLocal || !name) return null
    const sprite = textSprite(
      [
        { text: crown ? `👑 ${name}` : name, size: 44, fill: crown ? ['#fff3a0', '#ffb21f'] : '#ffffff' },
        { text: `Lv ${level ?? 1}`, size: 30, fill: '#9fe3ff' },
      ],
      { height: 2.2, padding: 8, gap: 0 },
    )
    sprite.position.y = AVATAR_HEIGHT + 2.1
    return sprite
  }, [isLocal, name, level, crown])
  useEffect(
    () => () => {
      nameTag?.material.map.dispose()
      nameTag?.material.dispose()
    },
    [nameTag],
  )

  useFrame((state, delta) => {
    stepCharacter(
      { motion, anim: anim.current, pose: poseRef.current, root: root.current, pivot: pivot.current, content: content.current, trail, anchor, isLocal },
      state.camera,
      delta,
    )
  })

  const seed = look.seed || name || 'player'
  const blocky = <BlockyCharacter seed={seed} boot={look.boot} poseRef={poseRef} />

  return (
    <>
      <group ref={root}>
        <group ref={pivot} position={[0, PIVOT_Y, 0]}>
          <group ref={content} position={[0, -PIVOT_Y, 0]}>
            <AvatarBoundary fallback={blocky} failed={FORCE_BLOCKY}>
              <Suspense fallback={blocky}>
                <PlayerAvatar
                  motionRef={poseRef}
                  targetHeight={AVATAR_HEIGHT}
                  equipped={isLocal ? undefined : look.equipped ?? null}
                  proportions={isLocal ? undefined : look.proportions}
                  boot={look.boot}
                  reportLoading={isLocal}
                  onReady={onAvatarReady}
                />
              </Suspense>
            </AvatarBoundary>
          </group>
        </group>
        {nameTag && <primitive object={nameTag} />}
      </group>
      <primitive object={trail.mesh} />
    </>
  )
}

export default Character
