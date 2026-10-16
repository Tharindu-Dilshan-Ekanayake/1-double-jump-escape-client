import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BackSide,
  Color,
  Fog,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { SEA_Y, THEMES, getLayout, mulberry32, stageAt, worldAt } from '../../shared/layout.js'
import { localPlayer } from '../playerState'
import { getGlowTexture, getLiquidTexture } from './textures'

/**
 * Sky colours per mood (top of the dome, horizon/fog, below the horizon).
 * The lobby and the first stages are a soft blue day; each stage's theme picks a mood and the
 * sky eases between them as you go.
 */
const MOODS = {
  lobby: ['#4aa6e0', '#c4e2f4', '#e3eff7'],
  day: ['#4aa6e0', '#c4e2f4', '#e3eff7'],
  bright: ['#5ea6dc', '#dde9f2', '#eff4f8'],
  dusk: ['#ff7a4d', '#ffc9a0', '#ffe4cf'],
  warm: ['#4fa6e8', '#ffe2b0', '#fff2d9'],
  cold: ['#6fb4e8', '#e4f4ff', '#f4fbff'],
  pink: ['#d98fb8', '#f2dde8', '#f8eef3'],
  night: ['#120c2e', '#3b2d6b', '#5a4a8a'],
  toxic: ['#2f6b2a', '#c9f59a', '#e4ffc9'],
  space: ['#050414', '#1d1640', '#2a2050'],
  world2: ['#4b2bb8', '#c9b2ff', '#e6dcff'],
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 below;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y;
    vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, below, pow(-h, 0.6));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

/** Puffy clouds scattered around (but off) the course, merged into one mesh. */
function buildClouds() {
  const rng = mulberry32(99)
  const parts = []
  const end = getLayout().courseEndZ
  for (let i = 0; i < 260; i += 1) {
    const side = rng() < 0.5 ? -1 : 1
    const x = side * (90 + rng() * 900)
    const z = 400 + rng() * (end - 800)
    const y = 30 + rng() * 520
    const s = 6 + rng() * 14
    const puffs = 4 + Math.floor(rng() * 4)
    for (let k = 0; k < puffs; k += 1) {
      const g = new SphereGeometry(s * (0.6 + rng() * 0.5), 10, 7)
      g.scale(1.3, 0.7, 1)
      g.translate(x + (k - puffs / 2) * s * 0.9, y + rng() * s * 0.4, z + (rng() - 0.5) * s)
      parts.push(g)
    }
  }
  const geometry = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  return new Mesh(geometry, new MeshLambertMaterial({ color: '#ffffff', emissive: '#dceeff', emissiveIntensity: 0.5 }))
}

const moodAt = (position) => {
  const layout = getLayout()
  const stage = stageAt(layout, position.z)
  if (stage) return THEMES[stage.theme].sky
  return worldAt(layout, position.z).id > 1 ? 'world2' : 'lobby'
}

/** Horizon-coloured background and fog that reaches past the longest gaps; returns the cleanup. */
function setAtmosphere(scene) {
  scene.background = new Color(MOODS.lobby[1])
  scene.fog = new Fog(MOODS.lobby[1], 500, 2400)
  return () => {
    scene.fog = null
  }
}

/** Keeps the dome and sun on the camera, drifts the sea and eases the sky towards the mood. */
function stepSky({ dome, sun, sea, target, scene }, camera, delta) {
  dome.position.copy(camera.position)
  sun.position.set(camera.position.x + 900, camera.position.y + 1100, camera.position.z - 1600)
  const map = sea.material.map
  map.offset.x = (map.offset.x + delta * 0.02) % 1

  const mood = moodAt(localPlayer.position)
  if (mood !== target.mood) {
    target.mood = mood
    const [top, horizon, below] = MOODS[mood] || MOODS.day
    target.top.set(top)
    target.horizon.set(horizon)
    target.below.set(below)
  }
  const k = 1 - Math.exp(-Math.min(delta, 0.1) * 1.5)
  const u = dome.material.uniforms
  u.top.value.lerp(target.top, k)
  u.horizon.value.lerp(target.horizon, k)
  u.below.value.lerp(target.below, k)
  scene.fog?.color.copy(u.horizon.value)
  scene.background?.copy?.(u.horizon.value)
  const dark = mood === 'night' || mood === 'space'
  sun.material.opacity += ((dark ? 0.25 : 1) - sun.material.opacity) * k
}

export function Sky() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  const dome = useMemo(() => {
    const [top, horizon, below] = MOODS.lobby
    const material = new ShaderMaterial({
      uniforms: { top: { value: new Color(top) }, horizon: { value: new Color(horizon) }, below: { value: new Color(below) } },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: BackSide,
      depthWrite: false,
      fog: false,
    })
    const mesh = new Mesh(new SphereGeometry(4000, 32, 16), material)
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    return mesh
  }, [])

  const sun = useMemo(() => {
    const sprite = new Sprite(
      new SpriteMaterial({ map: getGlowTexture(), color: '#fff3c8', blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }),
    )
    sprite.scale.setScalar(520)
    return sprite
  }, [])

  const clouds = useMemo(() => buildClouds(), [])

  const sea = useMemo(() => {
    const texture = getLiquidTexture('water').clone()
    texture.repeat.set(3200, 3200)
    texture.needsUpdate = true
    const mesh = new Mesh(new PlaneGeometry(60000, 60000), new MeshStandardMaterial({ map: texture, color: '#9fd8ff', roughness: 0.2, metalness: 0.05 }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(0, SEA_Y + 0.5, -4000)
    mesh.receiveShadow = true
    return mesh
  }, [])

  const target = useMemo(() => ({ top: new Color(), horizon: new Color(), below: new Color(), mood: null }), [])
  useEffect(() => setAtmosphere(scene), [scene])

  useFrame((_, delta) => stepSky({ dome, sun, sea, target, scene }, camera, delta))

  return (
    <>
      <primitive object={dome} />
      <primitive object={sun} />
      <primitive object={clouds} />
      <primitive object={sea} />
    </>
  )
}

export default Sky
