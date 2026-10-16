import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three'

import { runStepRate } from '../avatarRig'

/**
 * Classic blocky avatar with the same proportions as Bloxity's player.glb
 * (6.4 tall: hips 2.4, shoulders 4.8). Shown while the real avatar downloads,
 * or instead of it when the avatar CDN can't be reached. Posed with the same
 * conventions as avatarRig.animateRig: a positive swing turns a hanging limb
 * backwards, a positive sway moves it to the character's left (+X).
 */

export const RIG_HEIGHT = 6.4
const SHIRTS = ['#2f6bff', '#e8433a', '#2fbf55', '#ff9a1f', '#9b4dff', '#1fc7c7', '#ff5fa8', '#3a3f4b']
const HAIR = ['#5a3218', '#c56b1c', '#1d1d1d', '#e8c25a', '#8a3b1a']

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

let faceTexture = null
function face() {
  if (faceTexture) return faceTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')
  g.fillStyle = '#f5cd30'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#1b1b1b'
  g.beginPath()
  g.ellipse(44, 52, 7, 12, 0, 0, Math.PI * 2)
  g.ellipse(84, 52, 7, 12, 0, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 7
  g.lineCap = 'round'
  g.strokeStyle = '#1b1b1b'
  g.beginPath()
  g.arc(64, 72, 24, 0.2 * Math.PI, 0.8 * Math.PI)
  g.stroke()
  faceTexture = new CanvasTexture(canvas)
  faceTexture.colorSpace = SRGBColorSpace
  return faceTexture
}

function part(w, h, d, material, y = -h / 2) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material)
  mesh.position.y = y
  mesh.castShadow = true
  return mesh
}

export function createBlockyAvatar(seed = 'player') {
  const h = hash(seed)
  const skin = new MeshStandardMaterial({ color: '#f5cd30', roughness: 0.7 })
  const shirt = new MeshStandardMaterial({ color: SHIRTS[h % SHIRTS.length], roughness: 0.75 })
  const pants = new MeshStandardMaterial({ color: '#2b3140', roughness: 0.8 })
  const hair = new MeshStandardMaterial({ color: HAIR[(h >>> 4) % HAIR.length], roughness: 0.9 })
  const headMats = [skin, skin, hair, skin, new MeshStandardMaterial({ map: face(), roughness: 0.7 }), skin]

  const root = new Group()
  const joints = {}
  const pivot = (name, parent, x, y, z) => {
    const g = new Group()
    g.position.set(x, y, z)
    parent.add(g)
    joints[name] = g
    return g
  }

  const body = pivot('body', root, 0, 0, 0)
  for (const [side, name] of [[1, 'L'], [-1, 'R']]) {
    const hip = pivot(`leg${name}1`, body, 0.6 * side, 2.4, 0)
    hip.add(part(1.3, 1.2, 1.4, pants))
    const knee = pivot(`leg${name}2`, hip, 0, -1.2, 0)
    knee.add(part(1.3, 1.2, 1.4, pants))
    // Where boots go: the bottom of the shin.
    pivot(`foot${name}`, knee, 0, -1.2, 0)
  }

  const spine = pivot('spine', body, 0, 2.4, 0)
  spine.add(part(2.6, 2.4, 1.4, shirt, 1.2))
  const neck = pivot('neck', spine, 0, 2.4, 0)
  const head = new Mesh(new BoxGeometry(1.6, 1.6, 1.6), headMats)
  head.position.y = 0.8
  head.castShadow = true
  neck.add(head)
  const hairCap = new Mesh(new BoxGeometry(1.75, 0.55, 1.75), hair)
  hairCap.position.set(0, 1.55, -0.08)
  neck.add(hairCap)

  for (const [side, name] of [[1, 'L'], [-1, 'R']]) {
    const shoulder = pivot(`arm${name}1`, spine, 1.9 * side, 2.3, 0)
    shoulder.add(part(1.2, 1.2, 1.3, shirt))
    const elbow = pivot(`arm${name}2`, shoulder, 0, -1.2, 0)
    elbow.add(part(1.2, 0.8, 1.3, shirt))
    elbow.add(part(1.2, 0.4, 1.3, skin, -1.0))
  }

  const set = (name, x = 0, z = 0, y = 0) => joints[name].rotation.set(x, y, z)
  const lerp = (a, b, t) => a + (b - a) * t
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

  return {
    group: root,
    joints,
    /** Same motion shape and poses as avatarRig.animateRig. */
    animate({ time = 0, speed = 0, grounded = true, rising = 0, bounce = false, phase: runPhase }) {
      for (const name of ['legL1', 'legL2', 'legR1', 'legR2', 'armL1', 'armL2', 'armR1', 'armR2', 'spine', 'neck']) set(name)
      body.position.y = 0
      if (!grounded) {
        if (bounce) {
          const flap = Math.sin(time * 9) * 0.25
          set('armL1', 0, 1.9 + flap)
          set('armR1', 0, -1.9 - flap)
          set('legL1', 0, 0.35)
          set('legR1', 0, -0.35)
          return
        }
        const up = clamp01(rising / 40)
        const down = 1 - up
        set('legL1', -1.0 * up - 0.25 * down)
        set('legL2', 1.3 * up + 0.3 * down)
        set('legR1', 0.45 * up + 0.2 * down)
        set('legR2', 0.5 * up + 0.4 * down)
        set('armL1', -2.6 * up - 0.4 * down, 0.35 * up + 1.0 * down)
        set('armR1', -2.6 * up - 0.4 * down, -0.35 * up - 1.0 * down)
        set('spine', 0.12 * up - 0.08 * down)
        set('neck', -0.15 * up)
        return
      }
      // Standing: the hyped groove.
      if (speed < 0.6) {
        const beat = time * 6.4
        const pump = Math.sin(beat)
        const dip = 0.5 - 0.5 * Math.cos(beat * 2)
        body.position.y = -dip * 0.16
        set('legL1', -0.32 * dip)
        set('legR1', -0.32 * dip)
        set('legL2', 0.62 * dip)
        set('legR2', 0.62 * dip)
        set('spine', 0.06 + 0.08 * dip, 0, pump * 0.2)
        set('armL1', -0.45 - pump * 0.5, 0.22)
        set('armR1', -0.45 + pump * 0.5, -0.22)
        set('armL2', -1.3)
        set('armR2', -1.3)
        set('neck', 0.1 * dip - 0.04, 0, -pump * 0.12)
        return
      }
      // Running: the sprint, turning into a Naruto run at speed.
      const ratio = Math.min(speed / 18, 1)
      const naruto = clamp01((speed - 9) / 9)
      const phase = runPhase ?? time * runStepRate(speed)
      const cycle = Math.sin(phase)
      const legAmp = (0.95 + 0.4 * naruto) * ratio
      set('legL1', cycle * legAmp - 0.12 * naruto)
      set('legR1', -cycle * legAmp - 0.12 * naruto)
      set('legL2', (0.2 + Math.max(0, cycle) * 1.5) * ratio)
      set('legR2', (0.2 + Math.max(0, -cycle) * 1.5) * ratio)
      const flutter = Math.sin(phase * 2) * 0.08
      set('armL1', lerp(-cycle * 1.0 * ratio, 1.35 + flutter, naruto), 0.28 * naruto)
      set('armR1', lerp(cycle * 1.0 * ratio, 1.35 - flutter, naruto), -0.28 * naruto)
      set('armL2', lerp(-0.6 * ratio - Math.max(0, cycle) * 0.5 * ratio, -0.1, naruto))
      set('armR2', lerp(-0.6 * ratio - Math.max(0, -cycle) * 0.5 * ratio, -0.1, naruto))
      const lean = lerp(0.2 * ratio, 0.55, naruto)
      set('spine', lean, 0, cycle * 0.16 * ratio * (1 - naruto))
      set('neck', -lean * 0.6)
      body.position.y = Math.abs(Math.cos(phase)) * (0.22 + 0.1 * naruto) * ratio
    },
    dispose() {
      root.traverse((node) => node.geometry?.dispose())
    },
  }
}
