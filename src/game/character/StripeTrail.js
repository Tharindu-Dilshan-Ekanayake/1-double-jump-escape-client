import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Vector3,
} from 'three'

import { TRAIL_BY_ID } from '../../shared/gameData.js'
import { getStripeTexture } from '../world/textures'

/**
 * The trail: a flat ribbon of chevrons ("»»»") laid along the path the player's
 * feet take, on the ground and through the air. The chevrons are fixed to the
 * path (u = distance travelled), so they read like a painted streak behind you.
 * White by default; trails from the shop tint it (and some glow).
 */

const POINTS = 56
/** Studs between trail points. */
const SPACING = 0.55
/** Studs per texture repeat (two chevrons). */
const REPEAT = 3.2
const UP = new Vector3(0, 1, 0)
const _tangent = new Vector3()
const _side = new Vector3()
const _color = new Color()

export class StripeTrail {
  constructor(trailId = 'white') {
    /** Newest first: { p: Vector3, d: distance along the path }. */
    this.points = []
    this.pool = Array.from({ length: POINTS + 1 }, () => ({ p: new Vector3(), d: 0 }))
    this.distance = 0
    this.lastSide = new Vector3(1, 0, 0)
    this.fade = 0
    const geometry = new BufferGeometry()
    this.positions = new Float32Array(POINTS * 2 * 3)
    this.uvs = new Float32Array(POINTS * 2 * 2)
    this.colors = new Float32Array(POINTS * 2 * 4)
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    geometry.setAttribute('uv', new BufferAttribute(this.uvs, 2))
    geometry.setAttribute('color', new BufferAttribute(this.colors, 4))
    const index = []
    for (let i = 0; i < POINTS - 1; i += 1) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geometry.setIndex(index)
    this.material = new MeshBasicMaterial({
      map: getStripeTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
    this.mesh = new Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.setTrail(trailId)
  }

  setTrail(trailId) {
    this.def = TRAIL_BY_ID[trailId] || TRAIL_BY_ID.white
    this.material.blending = this.def.glow ? AdditiveBlending : NormalBlending
  }

  /** Drops the whole trail (after a teleport). */
  reset() {
    this.points.length = 0
  }

  /**
   * `anchor` is where the feet are; `moving` false lets the trail shrink away.
   * `time` animates multi-colour trails.
   */
  update(anchor, moving, dt, time) {
    const pts = this.points
    const head = pts[0]
    if (moving && (!head || head.p.distanceToSquared(anchor) > SPACING * SPACING)) {
      // A big jump in position (respawn, teleport) starts a fresh trail.
      if (head && head.p.distanceToSquared(anchor) > 400) pts.length = 0
      const step = head ? head.p.distanceTo(anchor) : 0
      this.distance += step
      const slot = pts.length > POINTS - 1 ? pts.pop() : this.pool.find((s) => !pts.includes(s))
      slot.p.copy(anchor)
      slot.d = this.distance
      pts.unshift(slot)
    } else if (!moving && pts.length) {
      this.fade += dt
      while (this.fade > 0.02 && pts.length) {
        this.fade -= 0.02
        pts.pop()
      }
    }
    if (moving) this.fade = 0

    const n = pts.length
    this.mesh.visible = n > 1
    if (n < 2) return
    const colors = this.def.colors
    const shift = Math.floor(time * 8)
    for (let i = 0; i < POINTS; i += 1) {
      const k = Math.min(i, n - 1)
      const point = pts[k]
      const prev = pts[Math.max(k - 1, 0)].p
      const next = pts[Math.min(k + 1, n - 1)].p
      _tangent.subVectors(prev, next)
      _side.crossVectors(_tangent, UP)
      // Going straight up there is no "sideways": keep the last one.
      if (_side.lengthSq() < 0.01) _side.copy(this.lastSide)
      else {
        _side.normalize()
        if (i === 0) this.lastSide.copy(_side)
      }
      const t = k / (POINTS - 1)
      const half = 0.95 * (1 - t * 0.7)
      const o = i * 6
      this.positions[o] = point.p.x + _side.x * half
      this.positions[o + 1] = point.p.y + _side.y * half
      this.positions[o + 2] = point.p.z + _side.z * half
      this.positions[o + 3] = point.p.x - _side.x * half
      this.positions[o + 4] = point.p.y - _side.y * half
      this.positions[o + 5] = point.p.z - _side.z * half
      const u = point.d / REPEAT
      const uo = i * 4
      this.uvs[uo] = u
      this.uvs[uo + 1] = 0
      this.uvs[uo + 2] = u
      this.uvs[uo + 3] = 1
      _color.set(colors[(Math.floor(point.d / 2.4) + shift) % colors.length])
      const alpha = i < n ? Math.pow(1 - t, 1.3) * 0.95 : 0
      for (let s = 0; s < 2; s += 1) {
        const c = (i * 2 + s) * 4
        this.colors[c] = _color.r
        this.colors[c + 1] = _color.g
        this.colors[c + 2] = _color.b
        this.colors[c + 3] = alpha
      }
    }
    const geometry = this.mesh.geometry
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.uv.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
