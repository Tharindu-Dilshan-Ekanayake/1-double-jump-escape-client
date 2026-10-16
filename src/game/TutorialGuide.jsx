import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ConeGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Shape, ShapeGeometry, Vector3 } from 'three'

import { sound } from '../audio/sound'
import { padOpen } from '../shared/gameData.js'
import { getLayout, inLobby, padAt } from '../shared/layout.js'
import { gameState, useGameStore } from '../store/gameStore'
import { getCollisionWorld } from './collisionWorld'
import { localPlayer } from './playerState'
import { PAD_SECONDS, TARGETS, markPadStepDone, padStepDone, tutorialStep, tutorialText } from './tutorial'

/**
 * The first-time guide in the world (see tutorial.js): a trail of yellow
 * chevrons on the ground flowing from the player towards the next goal, and
 * a big bobbing arrow over the goal itself. Hidden once the guide is done.
 */

const ARROWS = 14
/** Studs between chevrons, and how far ahead of the player the first one is. */
const SPACING = 3.6
const AHEAD = 3
const COLOR = '#ffe23a'
const layout = getLayout()

/** A flat chevron pointing along -z, lying on the ground. */
function chevronGeometry() {
  const s = new Shape()
  s.moveTo(0, 1.1)
  s.lineTo(1.3, -0.3)
  s.lineTo(0.75, -0.75)
  s.lineTo(0, 0.1)
  s.lineTo(-0.75, -0.75)
  s.lineTo(-1.3, -0.3)
  s.closePath()
  const geometry = new ShapeGeometry(s)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function createGuide() {
  const group = new Group()
  group.visible = false
  const material = new MeshBasicMaterial({ color: COLOR, toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false, side: DoubleSide })
  const arrows = new InstancedMesh(chevronGeometry(), material, ARROWS)
  arrows.frustumCulled = false
  arrows.renderOrder = 5
  group.add(arrows)

  // Over the goal: a big arrow pointing down, and a ring on the ground. Not fogged, so it shows from afar.
  const markerMaterial = new MeshBasicMaterial({ color: COLOR, toneMapped: false, fog: false })
  const cone = new ConeGeometry(1.3, 2.6, 4)
  cone.rotateX(Math.PI)
  const marker = new Mesh(cone, markerMaterial)
  group.add(marker)
  const ring = new Mesh(new RingGeometry(2.6, 3.2, 40), new MeshBasicMaterial({ color: COLOR, toneMapped: false, transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide, fog: false }))
  ring.rotation.x = -Math.PI / 2
  group.add(ring)

  const m = new Matrix4()
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const pos = new Vector3()
  const scale = new Vector3()

  return {
    group,
    hide() {
      group.visible = false
    },
    /** Shows the chevrons from `from` towards `target` ([x, y, z]) and the marker on the goal. */
    update(from, target, t) {
      group.visible = true
      const [tx, ty, tz] = target
      const dx = tx - from.x
      const dz = tz - from.z
      const dist = Math.hypot(dx, dz)
      const yaw = Math.atan2(-dx, -dz)
      q.setFromAxisAngle(up, yaw)
      const world = getCollisionWorld()
      const flow = (t * 3) % SPACING
      let count = 0
      for (let i = 0; i < ARROWS; i += 1) {
        const d = AHEAD + flow + i * SPACING
        if (d > dist - 2.5) break
        const k = d / dist
        const x = from.x + dx * k
        const z = from.z + dz * k
        // On the floor under the line; none over a gap.
        const ground = world.groundAt(x, z, Math.max(from.y, ty) + 3)
        if (ground === null) continue
        // Fade in near the player and out at the far end (by size).
        const s = Math.min(1, (d - AHEAD) / 2.5 + 0.3) * Math.min(1, (ARROWS * SPACING - i * SPACING) / (SPACING * 2))
        m.compose(pos.set(x, ground + 0.12, z), q, scale.set(s, 1, s))
        arrows.setMatrixAt(count, m)
        count += 1
      }
      arrows.count = count
      arrows.instanceMatrix.needsUpdate = true

      marker.position.set(tx, ty + 6.5 + Math.sin(t * 3.2) * 0.7, tz)
      marker.rotation.y = t * 1.6
      ring.position.set(tx, ty + 0.1, tz)
      const pulse = 1 + 0.12 * Math.sin(t * 5)
      ring.scale.set(pulse, pulse, pulse)
    },
    dispose() {
      arrows.geometry.dispose()
      material.dispose()
      cone.dispose()
      markerMaterial.dispose()
      ring.geometry.dispose()
      ring.material.dispose()
    },
  }
}

export function TutorialGuide() {
  const guide = useMemo(() => createGuide(), [])
  useEffect(() => () => guide.dispose(), [guide])
  const stateRef = useRef({ padDone: padStepDone(), padSeconds: 0, shownKey: '', seenStep: false, doneToast: false })

  useFrame((frame, delta) => {
    const state = stateRef.current
    const store = gameState()
    const lp = localPlayer
    const step = store.phase === 'playing' ? tutorialStep(store.me, state.padDone) : null
    if (!step) {
      guide.hide()
      if (state.shownKey) {
        state.shownKey = ''
        useGameStore.setState({ tutorial: null })
      }
      // Finished it this visit: a cheer and what to do next.
      if (state.seenStep && !state.doneToast && store.me) {
        state.doneToast = true
        store.toast('🎉 You did it! Now train, level up for more jumps and escape further!', 'success', 5000)
        sound.cheer()
      }
      return
    }
    state.seenStep = true

    // Step 1: a few seconds bouncing on a jump pad.
    if (step === 'pad') {
      // On a pad that trains you (not one still for sale).
      const onPad = padAt(layout, lp.position.x, lp.position.y, lp.position.z)
      if (onPad && padOpen(store.me, onPad)) state.padSeconds += Math.min(delta, 0.1)
      if (state.padSeconds >= PAD_SECONDS) {
        state.padDone = true
        markPadStepDone()
        sound.win()
      }
    }

    const onCourse = !inLobby(lp.position.z)
    const target = step === 'pad' ? TARGETS.pad : step === 'boots' ? TARGETS.boots : onCourse ? TARGETS.stage : TARGETS.gate
    if (lp.motion.dead) guide.hide()
    else guide.update(lp.position, target, frame.clock.elapsedTime)

    const banner = tutorialText(step, { onCourse, padSeconds: state.padSeconds })
    const key = `${banner.index}|${banner.text}`
    if (key !== state.shownKey) {
      state.shownKey = key
      useGameStore.setState({ tutorial: banner })
    }
  })

  return <primitive object={guide.group} />
}

export default TutorialGuide
