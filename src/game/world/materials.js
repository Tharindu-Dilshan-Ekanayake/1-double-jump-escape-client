import { MeshBasicMaterial, MeshStandardMaterial } from 'three'

import { LIQUIDS, getLiquidTexture, getSurfaceTexture } from './textures'

/** Shared materials, created on first use and cached by key. */

const surfaces = new Map()
const falls = new Map()
const rivers = new Map()

/** Surfaces that glow a little (lava checker, neon grids...), by emissive strength. */
const GLOWING = {
  yellowChecker: 0.18,
  lavaChecker: 0.5,
  neonFloor: 0.7,
  neonWall: 0.6,
  slimeFloor: 0.3,
  magmaTile: 0.35,
  galaxyWall: 0.35,
  spaceTile: 0.3,
  rainbowTile: 0.25,
  yellowStud: 0.08,
  lavaCells: 0.75,
  edgeStripe: 0.35,
  killRed: 0.22,
}

export function surfaceMaterial(key) {
  let material = surfaces.get(key)
  if (material) return material
  const map = getSurfaceTexture(key)
  if (GLOWING[key]) {
    material = new MeshStandardMaterial({ map, roughness: 0.7, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: GLOWING[key] })
  } else if (key === 'crystalTile' || key === 'crystalWall' || key === 'poolTile' || key === 'pedestal') {
    material = new MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.05 })
  } else if (key === 'gold' || key === 'goldWall') {
    material = new MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.3, emissive: '#6b4500', emissiveIntensity: 0.2 })
  } else if (key === 'ice' || key === 'iceWall') {
    material = new MeshStandardMaterial({ map, roughness: 0.25, metalness: 0.05 })
  } else if (key === 'returnPad' || key === 'doublePad') {
    material = new MeshStandardMaterial({ map, roughness: 0.5, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.18 })
  } else if (key === 'spawn') {
    material = new MeshStandardMaterial({ map, roughness: 0.6, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.08 })
  } else {
    material = new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 })
  }
  surfaces.set(key, material)
  return material
}

/** The sides of a stage's lava (and the step between two stages' lava levels). */
export function fallMaterial(kind) {
  let material = falls.get(kind)
  if (material) return material
  const spec = LIQUIDS[kind] || LIQUIDS.water
  const map = getLiquidTexture(kind).clone()
  map.needsUpdate = true
  material = new MeshStandardMaterial({
    map,
    roughness: 0.25,
    emissive: '#ffffff',
    emissiveMap: map,
    emissiveIntensity: spec.glow ?? 0.25,
  })
  material.userData.noShadow = true
  falls.set(kind, material)
  return material
}

/** The deadly liquid along a stage, flowing back towards the lobby (+Z). */
export function riverMaterial(kind) {
  let material = rivers.get(kind)
  if (material) return material
  const spec = LIQUIDS[kind] || LIQUIDS.water
  const map = getLiquidTexture(kind).clone()
  map.needsUpdate = true
  material = new MeshStandardMaterial({
    map,
    roughness: spec.glow ? 0.55 : 0.12,
    metalness: 0.05,
    emissive: '#ffffff',
    emissiveMap: map,
    emissiveIntensity: spec.glow ?? 0.14,
  })
  material.userData.flow = spec.flow ?? 0.06
  // Casts no shadow, but players' shadows still fall on it.
  material.userData.noShadow = true
  rivers.set(kind, material)
  return material
}

/** Flat-coloured decoration; colours come from the geometry's vertex colours. */
export const propsMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 })
/** Unlit vertex-coloured glow (lava streaks, neon trims, crystals). */
export const glowMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
glowMaterial.userData.noShadow = true

/** Scrolls every liquid texture; call once per frame. */
export function animateMaterials(dt) {
  for (const material of falls.values()) {
    material.map.offset.y = (material.map.offset.y + dt * 0.5) % 1
  }
  for (const material of rivers.values()) {
    material.map.offset.y = (material.map.offset.y - dt * material.userData.flow) % 1
  }
}
