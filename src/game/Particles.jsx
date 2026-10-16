import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'

import { particleObjects, stepParticles } from './burst'
import RingFx from './fx/RingFx'

/** Renders the particle pools (see burst.js) and the ground ring bursts. */
export function Particles() {
  const objects = useMemo(() => particleObjects(), [])
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  useFrame((_, delta) => {
    // Pixels per world unit at distance 1, so particle sizes are in studs.
    const scale = (size.height * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360))
    stepParticles(delta, scale)
  })
  return (
    <>
      {objects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
      <RingFx />
    </>
  )
}

export default Particles
