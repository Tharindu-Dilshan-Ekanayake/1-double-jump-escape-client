import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Geometry helpers for the static world.
 *
 * Everything static is merged per material (and per stage, so off-screen stages
 * still frustum-cull), which keeps a 3,000-stud course at a few dozen draw calls.
 */

/**
 * A box whose UVs are in world units / `tile`, so a repeating stud texture lines
 * up seamlessly across neighbouring boxes of any size.
 */
export function worldBox(min, max, tile = 4) {
  const w = max[0] - min[0]
  const h = max[1] - min[1]
  const d = max[2] - min[2]
  const geo = new BoxGeometry(w, h, d)
  geo.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    let u
    let v
    if (Math.abs(nor.getY(i)) > 0.5) {
      u = x
      v = z
    } else if (Math.abs(nor.getX(i)) > 0.5) {
      u = z
      v = y
    } else {
      u = x
      v = y
    }
    uv.setXY(i, u / tile, v / tile)
  }
  return geo
}

/** worldBox without its top face (a river's body: its surface is a separate plane). */
export function worldBoxSides(min, max, tile = 4) {
  const geo = worldBox(min, max, tile)
  // BoxGeometry's face groups are +x, -x, +y, -y, +z, -z.
  const top = geo.groups[2]
  const index = Array.from(geo.index.array)
  index.splice(top.start, top.count)
  geo.setIndex(index)
  geo.clearGroups()
  return geo
}

/** A horizontal plane (facing +Y) with world-space UVs. */
export function worldPlane(x0, x1, z0, z1, y, tile = 8) {
  const geo = worldBox([x0, y - 0.01, z0], [x1, y, z1], tile)
  return geo
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()
const _c = new Color()

function normalize(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (!g.attributes.uv) {
    g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  }
  return g
}

/**
 * Merges every mesh under `root` into one mesh per material (in root's space),
 * except those `keep` returns true for (animated parts). Turns a model built
 * from a dozen boxes into a couple of draw calls.
 */
export function mergeByMaterial(root, { keep = () => false, castShadow = false } = {}) {
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map()
  const merged = []
  root.traverse((node) => {
    if (!node.isMesh || node === root || keep(node)) return
    const geometry = normalize(node.geometry.clone()).applyMatrix4(new Matrix4().multiplyMatrices(inverse, node.matrixWorld))
    if (!buckets.has(node.material)) buckets.set(node.material, [])
    buckets.get(node.material).push(geometry)
    merged.push(node)
  })
  for (const node of merged) node.parent?.remove(node)
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false)
    for (const g of geometries) g.dispose()
    if (!geometry) continue
    const mesh = new Mesh(geometry, material)
    mesh.castShadow = castShadow
    mesh.receiveShadow = castShadow
    root.add(mesh)
  }
  return root
}

const _bake = new Color()

/**
 * Merges every opaque mesh under `root` (skipping subtrees `keep` returns true
 * for, e.g. animated parts) into at most two meshes: a lit one and an unlit
 * "glow" one, with each part's colour baked into vertex colours. Glowing
 * (emissive) parts go to the unlit mesh. A model built from twenty little
 * coloured boxes becomes two draw calls.
 *
 * `materials` = { lit, glow }: shared vertex-coloured materials to use.
 */
export function mergeColored(root, materials, { keep = () => false, castShadow = false } = {}) {
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const buckets = { lit: [], glow: [] }
  const merged = []
  const walk = (node) => {
    for (const child of node.children) {
      if (keep(child)) continue
      const m = child.material
      if (child.isMesh && m && !m.transparent && (m.isMeshStandardMaterial || m.isMeshBasicMaterial)) {
        const glowing = m.isMeshBasicMaterial || (m.emissiveIntensity > 0 && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05)
        const geometry = normalize(child.geometry.clone()).applyMatrix4(new Matrix4().multiplyMatrices(inverse, child.matrixWorld))
        if (!geometry.attributes.color) {
          _bake.copy(m.color)
          const count = geometry.attributes.position.count
          const colors = new Float32Array(count * 3)
          for (let i = 0; i < count; i += 1) {
            colors[i * 3] = _bake.r
            colors[i * 3 + 1] = _bake.g
            colors[i * 3 + 2] = _bake.b
          }
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
        }
        buckets[glowing ? 'glow' : 'lit'].push(geometry)
        merged.push(child)
      }
      walk(child)
    }
  }
  walk(root)
  for (const node of merged) node.parent?.remove(node)
  for (const [kind, geometries] of Object.entries(buckets)) {
    if (!geometries.length) continue
    const geometry = mergeGeometries(geometries, false)
    for (const g of geometries) g.dispose()
    if (!geometry) continue
    const mesh = new Mesh(geometry, materials[kind])
    mesh.castShadow = castShadow && kind === 'lit'
    root.add(mesh)
  }
  return root
}

/**
 * Collects geometry per key and merges it into one mesh per key.
 * Textured boxes are keyed by material name; flat-coloured props carry a vertex
 * colour and share one material per zone.
 */
export class GeoBatch {
  constructor() {
    /** key -> { geometries, material } */
    this.buckets = new Map()
  }

  add(key, geometry, material) {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { geometries: [], material }
      this.buckets.set(key, bucket)
    }
    bucket.geometries.push(normalize(geometry))
  }

  /** Adds a geometry tinted with a flat colour (merged under `key`). */
  addColored(key, geometry, color, material) {
    const g = normalize(geometry)
    // Color.set() already converts sRGB hex into the linear working space.
    _c.set(color)
    const count = g.attributes.position.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = _c.r
      colors[i * 3 + 1] = _c.g
      colors[i * 3 + 2] = _c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.add(key, g, material)
  }

  /** Merges every bucket into a Mesh. */
  build({ castShadow = true, receiveShadow = true } = {}) {
    const meshes = []
    for (const [key, bucket] of this.buckets) {
      if (!bucket.geometries.length) continue
      const merged = mergeGeometries(bucket.geometries, false)
      for (const g of bucket.geometries) g.dispose()
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new Mesh(merged, bucket.material)
      mesh.name = key
      mesh.castShadow = castShadow && !bucket.material.userData?.noShadow
      mesh.receiveShadow = receiveShadow
      meshes.push(mesh)
    }
    this.buckets.clear()
    return meshes
  }
}

/**
 * Convenience wrapper for placing flat-coloured primitives into a GeoBatch.
 * Positions are world space; `rot` is an Euler in radians; `scale` per axis.
 */
export class Props {
  constructor(batch, zone, solidMaterial, glowMaterial) {
    this.batch = batch
    this.zone = zone
    this.solid = solidMaterial
    this.glowMat = glowMaterial
  }

  place(geometry, color, pos, { rot, scale, glow = false } = {}) {
    _p.set(pos[0], pos[1], pos[2])
    _e.set(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0)
    _q.setFromEuler(_e)
    if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2])
    else _s.setScalar(scale ?? 1)
    _m.compose(_p, _q, _s)
    geometry.applyMatrix4(_m)
    const material = glow ? this.glowMat : this.solid
    this.batch.addColored(`${glow ? 'glow' : 'props'}#${this.zone}`, geometry, color, material)
  }

  box(color, pos, size, opts) {
    this.place(new BoxGeometry(size[0], size[1], size[2]), color, pos, opts)
  }

  cylinder(color, pos, radiusTop, radiusBottom, height, opts = {}) {
    this.place(new CylinderGeometry(radiusTop, radiusBottom, height, opts.segments ?? 10), color, pos, opts)
  }

  cone(color, pos, radius, height, opts = {}) {
    this.place(new ConeGeometry(radius, height, opts.segments ?? 10), color, pos, opts)
  }

  sphere(color, pos, radius, opts = {}) {
    this.place(new SphereGeometry(radius, opts.segments ?? 12, opts.rings ?? 8), color, pos, opts)
  }

  torus(color, pos, radius, tube, opts = {}) {
    this.place(
      new TorusGeometry(radius, tube, opts.radialSegments ?? 8, opts.tubularSegments ?? 24, opts.arc ?? Math.PI * 2),
      color,
      pos,
      opts,
    )
  }

  rock(color, pos, radius, opts) {
    this.place(new DodecahedronGeometry(radius, 0), color, pos, opts)
  }

  crystal(color, pos, radius, opts) {
    this.place(new OctahedronGeometry(radius, 0), color, pos, opts)
  }
}
