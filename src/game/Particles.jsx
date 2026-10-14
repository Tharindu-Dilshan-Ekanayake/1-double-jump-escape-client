import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'

import { createParticleSystem, stepParticles } from './burst'

/** Renders the particle bursts queued with `burst()`. */
export function Particles() {
  const system = useMemo(() => createParticleSystem(), [])
  useFrame((_, delta) => stepParticles(system, delta))
  return <primitive object={system.points} />
}

export default Particles
