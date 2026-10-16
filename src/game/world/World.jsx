import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'

import { devState } from '../../dev/devTools'
import { BOOTS } from '../../shared/gameData.js'
import { gameState, useGameStore } from '../../store/gameStore'
import { hazardTime } from '../hazards'
import { buildWorld } from './buildWorld'
import { worldRef } from './worldRef'

/** The lobby, every stage and their moving parts. Built once (needs fonts loaded). */
export function World() {
  const world = useMemo(() => buildWorld(), [])
  const leaderboards = useGameStore((s) => s.leaderboards)

  useEffect(() => {
    worldRef.current = world
    return () => {
      worldRef.current = null
    }
  }, [world])

  useEffect(() => world.updateLeaderboards(leaderboards), [world, leaderboards])

  useFrame((state, delta) => {
    const { me, hydraLeft } = gameState()
    // Dev tools' "open doors" opens them on screen too.
    const shown = import.meta.env.DEV && me && devState().doors ? { ...me, rebirths: Infinity, bootsOwned: BOOTS.map((b) => b.id).join(',') } : me
    world.update(hazardTime(), Math.min(delta, 0.1), state.camera, shown, hydraLeft)
  })

  return <primitive object={world.root} />
}

export default World
