import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3 } from 'three'

import { sound, surfaceOf } from '../audio/sound'
import { send } from '../net/connection'
import { BOOT_BY_ID, PHYSICS, bestBootTier, maxLevel, moveStats, padOpen } from '../shared/gameData.js'
import {
  PAD_BOUNCE_HEIGHT,
  SEA_Y,
  getLayout,
  inLava,
  insideBox,
  jumpAhead,
  jumpVelocity,
  onPlateau,
  padAt,
  platformAt,
  stageAt,
  worldAt,
} from '../shared/layout.js'
import { gameState, useGameStore } from '../store/gameStore'
import { useProgress } from '../store/progression'
import { flashHydra, flashScreen, spawnRewardPopup } from '../ui/fx'
import { resetBridges, touchBridge, updateBridges } from './bridges'
import { burst } from './burst'
import { cameraRig } from './cameraRig'
import { Character } from './character/Character'
import { stopLocalEmote } from './emotes'
import { ringBurst } from './fx/rings'
import { touchingHazard } from './hazards'
import { input, moveAxes } from './input'
import { getCollisionWorld } from './collisionWorld'
import { AUTO_JUMP_SPEED, stepBodyAuto } from './physics'
import { localPlayer } from './playerState'

const SEND_INTERVAL = 0.05
const COYOTE_TIME = 0.12
/** A jump pressed this soon before landing (with no air jumps left) fires on landing. */
const JUMP_BUFFER = 0.15
/** After falling: this long frozen in the poof, then back to the last checkpoint. */
const RESPAWN_DELAY = 0.9
/** How fast a jump pad throws you up (it keeps you over it). */
const PAD_BOUNCE_SPEED = jumpVelocity(PAD_BOUNCE_HEIGHT)
const _probe = new Vector3()

const angleTowards = (from, to, maxStep) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + Math.max(-maxStep, Math.min(maxStep, diff))
}

/** The lobby trigger (boot stand, jump pad, egg, door...) containing the point, if any. */
function triggerAt(layout, x, y, z) {
  for (const t of layout.triggers) if (insideBox(t, x, y, z)) return t
  return null
}

/**
 * The local player: reads input, runs physics, checks hazards, pads, jump
 * pads, bridges and triggers, keeps the last checkpoint, streams the
 * transform to the server and renders the Character. How many jumps you get
 * comes from your level, how fast you run from your boots; what you earn is
 * the server's business.
 */
export function LocalPlayer({ onAvatarReady }) {
  const layout = getLayout()
  const boot = useGameStore((s) => s.me?.boot ?? 'starter')
  const trail = useGameStore((s) => s.me?.trail ?? 'white')
  const name = useGameStore((s) => s.me?.name)
  const pets = useGameStore((s) => s.me?.petsEquipped ?? '')
  const titleIndex = useProgress((s) => s.titleIndex ?? 0)
  const look = useMemo(() => ({ boot, trail, seed: name, titleIndex, pets }), [boot, trail, name, titleIndex, pets])

  const ctl = useRef({
    lastGroundedAt: 0,
    lastJumpAt: 0,
    landedAt: -10,
    usedGroundJump: false,
    fallSpeed: 0,
    sendTimer: 0,
    lastSent: '',
    padKey: null,
    goHomeAt: 0,
    trigger: null,
    dead: false,
    respawnAt: 0,
    /** The platform you last stood on (where falling sends you back to): { found, x }. */
    checkpoint: null,
    bestThisRun: 0,
    stride: 0,
    stage: 0,
    bufferedAt: -10,
    lastBoot: undefined,
    debugTeleport: import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('tp')) || 0 : 0,
  })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const c = ctl.current
    const lp = localPlayer
    const store = gameState()
    const me = store.me
    const now = performance.now() / 1000
    const motion = lp.motion
    updateBridges(now)

    if (store.phase !== 'playing' || !me) {
      motion.speed = 0
      motion.air = false
      return
    }
    const collision = getCollisionWorld()
    collision.rebirths = me.rebirths
    collision.bootTier = bestBootTier(me)

    // New boots on: a poof at the feet (and a full-screen flex for the Hydra).
    if (me.boot !== c.lastBoot) {
      if (c.lastBoot !== undefined) equipFx(me.boot, lp)
      c.lastBoot = me.boot
    }

    // Dev-only shortcut (?tp=<stage>): start on that stage's checkpoint, once.
    if (c.debugTeleport) {
      const stage = layout.stages[c.debugTeleport - 1]
      c.debugTeleport = 0
      if (stage) lp.teleportTo(stage.checkpoint)
    }

    // --- Teleports asked for by the UI, the server (checkpoint, respawn) or a pad.
    if (c.goHomeAt && now >= c.goHomeAt) {
      c.goHomeAt = 0
      lp.goHome()
    }
    if (lp.pending) {
      const point = lp.pending
      lp.pending = null
      lp.place(point)
      c.dead = false
      c.respawnAt = 0
      c.padKey = null
      c.trigger = null
      c.lastSent = ''
      if (point.home) {
        c.bestThisRun = 0
        c.checkpoint = null
        resetBridges()
      }
      flashScreen('teleport')
      if (!point.revive) sound.whoosh()
      else sound.revive()
      useGameStore.setState({ death: null, prompt: null })
      sendMove(c, lp)
    }

    // --- Fallen: a beat in the poof, then back to the lobby.
    if (c.dead) {
      motion.speed = 0
      if (c.respawnAt && now >= c.respawnAt) {
        c.respawnAt = 0
        lp.goHome()
      }
      return
    }

    const stats = moveStats(me.level, me.boot, me.perkSpeed ?? 0, me.rebirths ?? 0)
    const custom = store.settings.customJump
    const height = custom ? Math.max(3, Math.min(custom, stats.height)) : stats.height
    lp.jumpVelocity = jumpVelocity(height)
    const maxJumps = stats.jumps
    // A rebirth mid-air drops the level; never keep more jumps than it allows.
    lp.jumpsLeft = Math.min(lp.jumpsLeft, maxJumps)
    const maxSpeed = Math.min(stats.speed, PHYSICS.maxMoveSpeed)

    // --- Running: camera-relative, facing where you go. Full air control, but
    // letting go in the air keeps your momentum (long jumps stay long).
    const typing = store.panel?.props?.typing
    const { forward, strafe } = typing ? { forward: 0, strafe: 0 } : moveAxes()
    const camYaw = cameraRig.yaw
    const mx = -Math.sin(camYaw) * forward + Math.cos(camYaw) * strafe
    const mz = -Math.cos(camYaw) * forward - Math.sin(camYaw) * strafe
    const amount = Math.min(1, Math.hypot(mx, mz))
    if (amount > 0.05) {
      lp.yaw = angleTowards(lp.yaw, Math.atan2(mx, mz), dt * 14)
      const k = 1 - Math.exp(-(lp.grounded ? 16 : 9) * dt)
      lp.velocity.x += (mx * maxSpeed - lp.velocity.x) * k
      lp.velocity.z += (mz * maxSpeed - lp.velocity.z) * k
    } else if (lp.grounded) {
      const k = 1 - Math.exp(-18 * dt)
      lp.velocity.x -= lp.velocity.x * k
      lp.velocity.z -= lp.velocity.z * k
    }
    // Walking or jumping ends a Boxity emote (here and on everyone else's screen).
    if (motion.emote && (amount > 0.05 || !lp.grounded)) stopLocalEmote()

    // --- Over a jump pad you can use: it keeps you over its middle while it
    // bounces you (AFK training); steering walks you off.
    const jumpPad = padAt(layout, lp.position.x, lp.position.y, lp.position.z)
    const onPad = Boolean(jumpPad && padOpen(me, jumpPad))
    if (onPad && amount <= 0.05) {
      const k = 1 - Math.exp(-6 * dt)
      lp.velocity.x += ((jumpPad.center[0] - lp.position.x) * 2.5 - lp.velocity.x) * k
      lp.velocity.z += ((jumpPad.center[1] - lp.position.z) * 2.5 - lp.velocity.z) * k
    }

    // --- Jumping: the ground jump, then mid-air jumps until they run out.
    const groundJump = () => {
      lp.velocity.y = lp.jumpVelocity
      lp.grounded = false
      lp.jumpsLeft = maxJumps - 1
      c.usedGroundJump = true
      c.lastJumpAt = now
      motion.jumpAt = now
      sound.jump()
      send('jump')
      burst(_probe.set(lp.position.x, lp.position.y + 0.2, lp.position.z), { color: '#e9e4dc', count: 8, speed: 5, up: 1, life: 0.5, gravity: 2, size: 1.4, blend: 'normal' })
    }
    // Everything a mid-air jump does besides the velocity (physics may fire it).
    const onAirJump = () => {
      lp.flips = (lp.flips + 1) & 0xffff
      motion.flips = lp.flips
      c.lastJumpAt = now
      // Higher pitch for every jump in the chain.
      sound.airJump(maxJumps - lp.jumpsLeft)
      send('jump', { air: true })
      const accent = BOOT_BY_ID[me.boot]?.accent ?? '#ffffff'
      ringBurst(lp.position, { color: me.boot === 'starter' ? '#ffffff' : accent, radius: 3.4, life: 0.4 })
      burst(lp.position, { color: '#ffffff', count: 12, speed: 8, up: 0.5, life: 0.4, gravity: 1, size: 0.8 })
    }
    const airJump = () => {
      lp.velocity.y = lp.jumpVelocity
      lp.jumpsLeft -= 1
      onAirJump()
    }
    const canGroundJump = lp.grounded || (now - c.lastGroundedAt < COYOTE_TIME && !c.usedGroundJump)
    if (input.jumpPressed) {
      input.jumpPressed = false
      if (canGroundJump) groundJump()
      else if (lp.jumpsLeft > 0) airJump()
      else c.bufferedAt = now
    } else if (input.jumpHeld) {
      // Holding jump keeps jumping: each jump fires just before the top of the
      // last one (the physics step below fires it at the exact moment; this
      // catches a hold that starts while already falling).
      if (lp.grounded && now - c.landedAt > 0.06) groundJump()
      else if (!lp.grounded && lp.velocity.y < AUTO_JUMP_SPEED && lp.jumpsLeft > 0 && now - c.lastJumpAt > 0.15) airJump()
    }

    // --- Physics.
    c.fallSpeed = Math.max(c.fallSpeed, -lp.velocity.y)
    const auto = input.jumpHeld && !typing ? { left: lp.jumpsLeft } : null
    const { landed, jumped } = stepBodyAuto(collision, lp, dt, auto)
    if (jumped) {
      lp.jumpsLeft = auto.left
      onAirJump()
    }
    if (lp.grounded) {
      c.lastGroundedAt = now
      c.usedGroundJump = false
      lp.jumpsLeft = maxJumps
    }
    const { x, y, z } = lp.position

    if (landed) {
      c.landedAt = now
      if (c.fallSpeed > 40) {
        // Harder landings squash more, kick up more dust and shake the camera.
        const impact = Math.min(1, (c.fallSpeed - 40) / 110)
        motion.landAt = now
        motion.landImpact = impact
        sound.land(impact)
        burst(lp.position, { color: '#e9e4dc', count: 10 + Math.round(impact * 14), speed: 6 + impact * 6, up: 1.5, life: 0.7, gravity: 2, size: 1.6, blend: 'normal' })
        if (impact > 0.35) {
          ringBurst(lp.position, { color: '#ffffff', radius: 3 + impact * 3, life: 0.45, opacity: 0.6 })
          cameraRig.shake = Math.max(cameraRig.shake, impact * 0.7)
        }
      }
      c.fallSpeed = 0
      // A jump pressed just before landing fires now.
      if (now - c.bufferedAt < JUMP_BUFFER) {
        c.bufferedAt = -10
        groundJump()
      }
    }

    // --- Jump pads bounce you as soon as you land on them (unless you're
    // jumping yourself).
    if (onPad && lp.grounded && Math.abs(lp.position.y - jumpPad.top) < 0.3 && !input.jumpHeld) {
      lp.velocity.y = PAD_BOUNCE_SPEED
      lp.grounded = false
      lp.jumpsLeft = maxJumps
      c.usedGroundJump = true
      motion.bounceAt = now
      sound.bounce(1 + jumpPad.rate / 6)
      ringBurst(lp.position, { color: '#ffffff', radius: 2.6, life: 0.35, opacity: 0.55 })
    }
    motion.bounce = onPad && !lp.grounded

    // --- Bridges: a plank you stand on starts to shake, then drops.
    if (lp.grounded) {
      const plank = collision.bridgeBelow(x, y, z)
      if (plank) touchBridge(plank)
    }

    // --- Checkpoints: every platform (and a stage's end) you land on.
    if (lp.grounded) {
      const found = platformAt(layout, x, y, z)
      if (found && found.platform !== c.checkpoint?.found.platform) c.checkpoint = { found, x }
    }

    const stage = stageAt(layout, z)

    // --- The Boxity menu's "Reset Character": the same as a fall.
    if (lp.resetRequested) {
      lp.resetRequested = false
      fall(c, lp, me, layout, now, stats)
      return
    }

    // --- Lava, spikes, sharks: down you go.
    const hazard = touchingHazard(layout, lp.position, now)
    if (inLava(layout, x, y, z) || hazard || y < SEA_Y) {
      fall(c, lp, me, layout, now, stats)
      return
    }

    // --- Stage pads: Return (+Wins, home) and 2x Wins (with the pass).
    let pad = null
    if (lp.grounded) for (const p of layout.pads) if (insideBox(p, x, y, z, 0.2)) pad = p
    const padKey = pad ? `${pad.stage}:${pad.kind}` : null
    if (padKey !== c.padKey) {
      c.padKey = padKey
      if (pad && !c.goHomeAt) {
        if (pad.kind === 'double' && !me.pass2xWins) {
          store.openPanel('shop', { highlight: 'pass2xWins' })
          sound.error()
        } else {
          sendMove(c, lp)
          send('pad', { stage: pad.stage, kind: pad.kind })
          c.goHomeAt = now + 0.45
          sound.whoosh()
        }
      }
    }

    // --- Reaching a new stage this run.
    if (stage && onPlateau(stage, y, z) && stage.index > c.bestThisRun) {
      c.bestThisRun = stage.index
      if (stage.index > (me.bestStage || 0)) {
        spawnRewardPopup(`STAGE ${stage.index} CLEARED!`, 'stage')
        sound.stageClear()
      } else {
        sound.win()
      }
    }

    // --- Lobby things: "Press E" prompts.
    const t = triggerAt(layout, x, y, z)
    const key = t ? `${t.kind}:${t.id ?? ''}` : null
    if (key !== c.trigger) {
      c.trigger = key
      useGameStore.setState({ prompt: t ? { kind: t.kind, id: t.id } : null })
    }

    // --- HUD bits that only change now and then.
    const stageIndex = stage?.index ?? 0
    if (stageIndex !== c.stage) {
      c.stage = stageIndex
      useGameStore.setState({ stage: stageIndex })
    }
    const worldId = worldAt(layout, z).id
    if (worldId !== store.world) {
      useGameStore.setState({ world: worldId })
    }
    const jumpsLeft = lp.grounded ? maxJumps : lp.jumpsLeft
    if (store.jumps.left !== jumpsLeft || store.jumps.max !== maxJumps) useGameStore.setState({ jumps: { left: jumpsLeft, max: maxJumps } })

    // --- Visual motion for the Character.
    motion.position.copy(lp.position)
    motion.yaw = lp.yaw
    motion.speed = Math.hypot(lp.velocity.x, lp.velocity.z)
    motion.vy = lp.velocity.y
    motion.air = !lp.grounded
    if (lp.grounded && motion.speed > 3) {
      c.stride += motion.speed * dt
      if (c.stride > 4.2) {
        c.stride = 0
        sound.step(surfaceOf(getCollisionWorld().surfaceBelow(lp.position.x, lp.position.y, lp.position.z)), motion.speed)
      }
    }

    c.sendTimer += dt
    if (c.sendTimer >= SEND_INTERVAL) {
      c.sendTimer = 0
      sendMove(c, lp)
    }
  })

  return <Character motion={localPlayer.motion} look={look} isLocal onAvatarReady={onAvatarReady} />
}

/** The feet light up when new boots go on; the Hydra gets the whole screen. */
function equipFx(boot, lp) {
  const def = BOOT_BY_ID[boot]
  if (!def || boot === 'starter') return
  const colors = [def.color, def.accent, '#ffffff']
  burst(_probe.set(lp.position.x, lp.position.y + 0.6, lp.position.z), { colors, count: 30, speed: 8, up: 5, life: 0.8, gravity: 8, size: 1 })
  ringBurst(lp.position, { color: def.accent, radius: 5, life: 0.55 })
  if (boot === 'hydra') {
    flashHydra()
    sound.hydra()
    cameraRig.shake = 1
    ringBurst(lp.position, { color: '#2fffd0', radius: 14, life: 0.9 })
    burst(_probe.set(lp.position.x, lp.position.y + 1, lp.position.z), { colors: ['#14062a', '#062a2a', '#0b3b4a'], count: 60, speed: 14, up: 7, life: 1.4, gravity: 3, size: 2.4, blend: 'normal' })
  }
}

/**
 * Falling: a poof, then (after a beat) back to the lobby, like collecting
 * Wins does; the Teleport menu (or the checkpoint door) takes you back to any
 * stage you've reached. If the jump that beat you needs more jumps than you
 * have, say so: "Need 3 jumps! Reach Level 8" (or "Rebirth" when no level can
 * give them yet).
 */
function fall(c, lp, me, layout, now, stats) {
  c.dead = true
  lp.velocity.set(0, 0, 0)
  lp.motion.speed = 0
  // The character freezes for a beat, then dissolves (see Character).
  lp.motion.dead = true
  lp.motion.deadAt = now
  cameraRig.shake = Math.max(cameraRig.shake, 0.55)
  sound.death()
  flashScreen('death')
  sendMove(c, lp)
  c.respawnAt = now + RESPAWN_DELAY
  const cp = c.checkpoint
  const ahead = cp ? jumpAhead(layout, cp.found, stats.speed, me.rebirths ?? 0) : null
  const needs = ahead && ahead.jumps > stats.jumps ? { ...ahead, rebirth: ahead.level > maxLevel(), at: Date.now() } : null
  useGameStore.setState({ death: { at: Date.now(), checkpoint: Boolean(cp) }, needJumps: needs })
}

/** Streams the transform; skipped when nothing changed since the last send. */
function sendMove(c, lp) {
  const payload = {
    x: Math.round(lp.position.x * 100) / 100,
    y: Math.round(lp.position.y * 100) / 100,
    z: Math.round(lp.position.z * 100) / 100,
    r: Math.round(lp.yaw * 1000) / 1000,
    s: Math.round(lp.motion.speed * 10) / 10,
    a: lp.grounded ? 0 : 1,
    f: lp.flips,
    // Fallen: other screens play the poof too.
    d: c.dead ? 1 : 0,
  }
  const key = `${payload.x},${payload.y},${payload.z},${payload.r},${payload.s},${payload.a},${payload.f},${payload.d}`
  if (key === c.lastSent) return
  c.lastSent = key
  send('move', payload)
}

export default LocalPlayer
