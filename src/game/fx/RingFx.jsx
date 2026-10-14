import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'

import { createRingPool, stepRings } from './rings'

/** Renders the pooled ring bursts queued with ringBurst() (see rings.js). */
export function RingFx() {
  const pool = useMemo(() => createRingPool(), [])
  useFrame((_, delta) => stepRings(pool, Math.min(delta, 0.05)))
  return <primitive object={pool.group} />
}

export default RingFx
