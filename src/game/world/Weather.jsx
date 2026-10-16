import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Points, PointsMaterial } from 'three'

import { getLayout, stageAt, worldAt } from '../../shared/layout.js'
import { localPlayer } from '../playerState'
import { getGlowTexture } from './textures'

/**
 * Ambient particles around the camera, themed by the stage the player is on:
 * snow, embers, petals, leaves, sparkles, bubbles…
 *
 * `rise` is vertical speed (negative falls), `drift` the sideways sway,
 * `twinkle` makes particles pulse.
 */
const WEATHER = {
  lobby: { color: '#ffffff', size: 0.5, rise: -0.7, drift: 1.4, opacity: 0.6 },
  world2: { color: '#ffe27a', size: 0.55, rise: 0.8, drift: 1.2, glow: true, twinkle: true },
  brick: { color: '#ffb066', size: 0.5, rise: 2.5, drift: 1, glow: true, twinkle: true },
  red: { color: '#ffffff', size: 0.45, rise: -0.6, drift: 1.2, opacity: 0.55 },
  lava: { color: '#ff8a2a', size: 0.7, rise: 4, drift: 1.2, glow: true, twinkle: true },
  shark: { color: '#ffb066', size: 0.5, rise: 2.5, drift: 1.4, glow: true, twinkle: true },
  spike: { color: '#ff8a2a', size: 0.6, rise: 3.5, drift: 1.2, glow: true, twinkle: true },
  ice: { color: '#ffffff', size: 0.9, rise: -6, drift: 1.6, opacity: 0.95 },
  candy: { color: '#ffc2ee', size: 0.7, rise: -1.4, drift: 1.6, glow: true, twinkle: true },
  jungle: { color: '#7dd65a', size: 0.7, rise: -2, drift: 2.2, opacity: 0.85 },
  neon: { color: '#3dfffa', size: 0.5, rise: 1, drift: 1, glow: true, twinkle: true },
  volcano: { color: '#ff6a2f', size: 0.75, rise: 4.5, drift: 1.2, glow: true, twinkle: true },
  cloud: { color: '#fff3a0', size: 0.6, rise: -0.8, drift: 1.4, glow: true, twinkle: true },
  toxic: { color: '#8cff3a', size: 0.8, rise: 3, drift: 0.8, glow: true },
  haunted: { color: '#b58cff', size: 1.1, rise: 1.2, drift: 1.4, glow: true, twinkle: true },
  crystal: { color: '#d9c4ff', size: 0.6, rise: 0.6, drift: 0.8, glow: true, twinkle: true },
  factory: { color: '#ffcc1a', size: 0.5, rise: 2.5, drift: 1.5, glow: true, twinkle: true },
  sakura: { color: '#ffb3dc', size: 0.85, rise: -2.4, drift: 2.8, opacity: 0.9 },
  magma: { color: '#ff6a2f', size: 0.75, rise: 4.5, drift: 1.2, glow: true, twinkle: true },
  space: { color: '#bfe6ff', size: 0.45, rise: 0.2, drift: 0.4, glow: true, twinkle: true },
  galaxy: { color: '#e0c4ff', size: 0.5, rise: 0.3, drift: 0.5, glow: true, twinkle: true },
  golden: { color: '#ffe27a', size: 0.7, rise: 1.5, drift: 1, glow: true, twinkle: true },
}

const COUNT = 520
const HALF = [70, 36, 70]
const _color = new Color()

function themeAt(layout, position) {
  return stageAt(layout, position.z)?.theme ?? (worldAt(layout, position.z).id > 1 ? 'world2' : 'lobby')
}

function createWeather() {
  const positions = new Float32Array(COUNT * 3)
  const colors = new Float32Array(COUNT * 3)
  const phases = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i += 1) {
    positions[i * 3] = (Math.random() * 2 - 1) * HALF[0]
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * HALF[1]
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * HALF[2]
    phases[i] = Math.random() * Math.PI * 2
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  const material = new PointsMaterial({
    map: getGlowTexture(),
    size: 0.6,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  return { points, positions, colors, phases, theme: null, spec: WEATHER.lobby }
}

/** Moves the particles and wraps them into a box around the camera. */
function stepWeather(w, layout, camera, delta) {
  const dt = Math.min(delta, 0.05)
  const theme = themeAt(layout, localPlayer.position)
  if (theme !== w.theme) {
    w.theme = theme
    w.spec = WEATHER[theme] || WEATHER.lobby
    const m = w.points.material
    m.size = w.spec.size
    m.opacity = w.spec.opacity ?? 0.9
    m.blending = w.spec.glow ? AdditiveBlending : NormalBlending
    m.toneMapped = !w.spec.glow
    m.needsUpdate = true
  }
  const { rise, drift, twinkle } = w.spec
  _color.set(w.spec.color)
  const t = performance.now() / 1000
  const c = camera.position
  const { positions: p, colors, phases } = w
  for (let i = 0; i < COUNT; i += 1) {
    const o = i * 3
    const phase = phases[i]
    p[o] += Math.sin(t * 0.7 + phase) * drift * dt
    p[o + 1] += rise * (0.7 + 0.3 * Math.sin(phase * 3)) * dt
    p[o + 2] += Math.cos(t * 0.5 + phase) * drift * 0.6 * dt
    for (let k = 0; k < 3; k += 1) {
      const span = HALF[k] * 2
      const rel = p[o + k] - c.getComponent(k)
      if (rel > HALF[k]) p[o + k] -= span
      else if (rel < -HALF[k]) p[o + k] += span
    }
    const glow = twinkle ? 0.45 + 0.55 * Math.abs(Math.sin(t * 2.2 + phase)) : 1
    colors[o] = _color.r * glow
    colors[o + 1] = _color.g * glow
    colors[o + 2] = _color.b * glow
  }
  w.points.geometry.attributes.position.needsUpdate = true
  w.points.geometry.attributes.color.needsUpdate = true
}

export function Weather() {
  const camera = useThree((s) => s.camera)
  const weather = useMemo(() => createWeather(), [])
  useFrame((_, delta) => stepWeather(weather, getLayout(), camera, delta))
  return <primitive object={weather.points} />
}

export default Weather
