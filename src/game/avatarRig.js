import { Matrix4, NearestFilter, Quaternion, Vector3 } from 'three'

import { BACK_BONE, HAT_BONE, NECK_OFFSET_BONE, PART_SLOTS } from '../bloxity/avatarAssets'

/**
 * Rig manipulation for the base `player.glb` character.
 *
 * The rig's real structure (confirmed by reading player.glb directly):
 *   character
 *     - default_arm_L / default_arm_R / default_head
 *     - default_leg_L / default_leg_R / default_torso   (6 SkinnedMeshes, 1 skeleton)
 *     - Rig1
 *         - Spine1 > Spine2 > { ArmL_Offset > ArmL1 > ArmL2,
 *                               ArmR_Offset > ArmR1 > ArmR2,
 *                               Neck_Offset > Neck1 }
 *         - LegL_Offset > LegL1 > LegL2, LegR_Offset > LegR1 > LegR2
 *
 * Two consequences drive everything below:
 *  1. Body parts are NOT attached to bones. Each is a separate SkinnedMesh sharing one
 *     skeleton, so equipping a part means swapping that mesh's geometry (remapping
 *     skin indices into the base skeleton's bone order first).
 *  2. Accessories DO attach to bones: hats to `Neck1`, back items to `Spine2`,
 *     the game's boots to the foot ends of the legs.
 *
 * player.glb ships no animation clips, so the character is posed, not animated.
 */

/**
 * Walks the loaded rig and collects everything later operations need.
 *
 * @param {import('three').Object3D} root
 */
export function collectRig(root) {
  const rig = {
    root,
    skeleton: null,
    /** slot -> SkinnedMesh */
    partMeshes: {},
    /** slot -> the pristine geometry to restore on unequip */
    originalGeometries: {},
    /** bone name -> { bone, origPos, origQuat, origScale } */
    bones: {},
    /** bone name -> inverse of the bone's rest matrix in model space (accessory placement). */
    restInverses: {},
    /** bone name -> the bone's rest position in model space. */
    restPositions: {},
    /** Accessories moved onto their bone every frame (hand items, shoes, boots). */
    followers: [],
    hatBone: null,
    backBone: null,
    neckOffsetBindY: 0,
    skinnedMeshes: [],
    /** Rest Y of the character root, so the run-cycle bob can return to it. */
    rootRestY: root.position.y,
  }

  const meshBySlot = new Map(
    Object.entries(PART_SLOTS).map(([slot, cfg]) => [cfg.mesh.toLowerCase(), slot]),
  )

  root.traverse((node) => {
    if (node.isSkinnedMesh) {
      node.castShadow = true
      node.receiveShadow = true
      rig.skinnedMeshes.push(node)
      if (!rig.skeleton) rig.skeleton = node.skeleton

      const slot = meshBySlot.get((node.name || '').toLowerCase())
      if (slot) {
        rig.partMeshes[slot] = node
        rig.originalGeometries[slot] = node.geometry.clone()
      }
    } else if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })

  const skeleton = rig.skeleton
  if (skeleton) {
    for (const bone of skeleton.bones) {
      // Proportions are re-applied every frame from these rest values.
      bone.matrixAutoUpdate = true
      rig.bones[bone.name] = {
        bone,
        origPos: bone.position.clone(),
        origQuat: bone.quaternion.clone(),
        origScale: bone.scale.clone(),
      }
    }

    // Bone local axes are NOT world-aligned in this rig: a limb bone's local X
    // points along world -Z and its local Z along world -X, so rotating a leg about
    // its local X swings it sideways instead of forward/back. The offsets differ per
    // bone, so rather than hardcode an axis, record for each bone the local-space
    // axis matching each character-space axis and animate about those.
    root.updateMatrixWorld(true)
    const rootQuat = new Quaternion()
    root.getWorldQuaternion(rootQuat)
    const rootQuatInv = rootQuat.invert()
    const boneWorld = new Quaternion()

    for (const bone of skeleton.bones) {
      const entry = rig.bones[bone.name]
      if (!entry) continue
      bone.getWorldQuaternion(boneWorld)
      // Bone orientation relative to the character, then inverted: this maps a
      // character-space axis into the bone's own local frame.
      const relInv = rootQuatInv.clone().multiply(boneWorld).invert()
      /** Local axis to rotate about for forward/back swing. */
      entry.axisX = new Vector3(1, 0, 0).applyQuaternion(relInv).normalize()
      /** Local axis to rotate about for lateral sway. */
      entry.axisZ = new Vector3(0, 0, 1).applyQuaternion(relInv).normalize()
    }

    // Captured before any animation or proportions touch the bones. Accessory
    // meshes are authored in model space, so these place them on their bones.
    // (Not skeleton.boneInverses: the leaf bones' inverse binds are 90 degrees off.)
    const modelInv = root.matrixWorld.clone().invert()
    for (const bone of skeleton.bones) {
      const rest = modelInv.clone().multiply(bone.matrixWorld)
      rig.restPositions[bone.name] = new Vector3().setFromMatrixPosition(rest)
      rig.restInverses[bone.name] = rest.invert()
    }

    rig.hatBone = skeleton.bones.find((b) => b.name === HAT_BONE) || null
    rig.backBone = skeleton.bones.find((b) => b.name === BACK_BONE) || null

    const neckIndex = skeleton.bones.findIndex((b) => b.name === NECK_OFFSET_BONE)
    if (neckIndex >= 0) {
      // elements[13] is the Y translation of the inverted bind matrix.
      rig.neckOffsetBindY = skeleton.boneInverses[neckIndex].clone().invert().elements[13]
    }
  }

  return rig
}

/** Bloxity textures are authored unflipped and pixel-art filtered. */
export function configureAvatarTexture(texture) {
  if (!texture) return texture
  texture.flipY = false
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Applies the skin texture to every skinned mesh of the base body.
 * The base body ships with an empty texture, so this always runs - with skin "0"
 * standing in when nothing is equipped.
 */
export function applySkin(rig, texture) {
  if (!texture) return
  for (const mesh of rig.skinnedMeshes) {
    if (!mesh.material) continue
    mesh.material.map = texture
    mesh.material.needsUpdate = true
  }
}

/**
 * Swaps a body part's geometry onto its base skinned mesh.
 *
 * A part GLB carries its own skeleton whose bone *order* may differ from the base
 * rig's. Its `skinIndex` attribute therefore has to be remapped by bone name, or the
 * limb deforms against the wrong bones.
 *
 * @param {object} rig from `collectRig`
 * @param {string} slot key of PART_SLOTS
 * @param {import('three').Object3D|null} partScene loaded GLB scene, or null to reset
 */
export function applyPart(rig, slot, partScene) {
  const targetMesh = rig.partMeshes[slot]
  if (!targetMesh) return

  // Unequipped / failed download: restore the part baked into player.glb.
  if (!partScene) {
    const original = rig.originalGeometries[slot]
    if (original && targetMesh.geometry !== original) targetMesh.geometry = original
    return
  }

  let skinnedSource = null
  let plainSource = null
  partScene.traverse((node) => {
    if (node.isSkinnedMesh && !skinnedSource) skinnedSource = node
    else if (node.isMesh && !plainSource) plainSource = node
  })

  if (!skinnedSource) {
    // Some parts ship as plain meshes; use them as-is.
    if (plainSource) targetMesh.geometry = plainSource.geometry
    return
  }

  const baseSkeleton = rig.skeleton
  if (!baseSkeleton || !skinnedSource.skeleton) {
    targetMesh.geometry = skinnedSource.geometry
    return
  }

  const geometry = skinnedSource.geometry.clone()

  const baseIndexByName = new Map()
  baseSkeleton.bones.forEach((bone, i) => baseIndexByName.set(bone.name, i))

  const remap = new Map()
  skinnedSource.skeleton.bones.forEach((bone, i) => {
    const baseIndex = baseIndexByName.get(bone.name)
    if (baseIndex !== undefined) remap.set(i, baseIndex)
  })

  const skinIndex = geometry.getAttribute('skinIndex')
  if (skinIndex) {
    const array = skinIndex.array
    for (let i = 0; i < array.length; i += 1) {
      const mapped = remap.get(array[i])
      if (mapped !== undefined) array[i] = mapped
    }
    skinIndex.needsUpdate = true
  }

  targetMesh.geometry = geometry
}

/**
 * Attaches a hat or back accessory to its bone.
 * Offsets are the SDK's own: hats sit at y=0.8 on `Neck1`, back items at the origin
 * of `Spine2`.
 */
export function attachAccessory(rig, kind, object) {
  const bone = kind === 'hat' ? rig.hatBone : rig.backBone
  if (!object || !bone) return null

  object.scale.setScalar(1)
  object.position.set(0, kind === 'hat' ? 0.8 : 0, 0)
  object.traverse((child) => {
    if (child.isMesh) child.castShadow = true
  })

  bone.add(object)
  return object
}

/**
 * Attaches a rest-pose accessory (hair, mask, neck, chest, waist, hand, shoes; see
 * ACCESSORY_SLOTS). `container` is the character's parent, where hand items and
 * shoes live so they follow the bone's position and rotation but not its scale.
 * Returns the objects added, for removal on the next rebuild.
 */
export function attachRestAccessory(rig, slot, object, container) {
  const added = []
  const place = (obj, boneName, mirror) => {
    const bone = rig.skeleton?.bones.find((b) => b.name === boneName)
    if (!bone || !rig.restInverses[boneName]) return
    const local = new Matrix4().makeTranslation(slot.origin[0], slot.origin[1], slot.origin[2])
    if (mirror) local.premultiply(new Matrix4().makeScale(-1, 1, 1))
    local.premultiply(rig.restInverses[boneName])
    obj.traverse((child) => {
      if (child.isMesh) child.castShadow = true
    })
    if (slot.inheritScale) {
      local.decompose(obj.position, obj.quaternion, obj.scale)
      bone.add(obj)
    } else {
      if (!container) return
      container.add(obj)
      rig.followers.push({ obj, bone, local })
    }
    added.push(obj)
  }
  place(object, slot.bone, false)
  if (slot.mirrorBone) place(object.clone(), slot.mirrorBone, true)
  return added
}

/**
 * Puts a boot (built around its own origin: sole at y=0, toe towards +Z) on
 * one foot. It's centred on, and widened to wrap, that leg's actual mesh (so
 * custom Bloxity legs fit too), then follows the foot bone every frame inside
 * `container`. `side` is 'L' or 'R'. Returns the object, or null if the rig
 * has no foot.
 */
export function attachBoot(rig, object, side, container) {
  const name = `Leg${side}2_leaf`
  const bone = rig.skeleton?.bones.find((b) => b.name === name)
  const restInverse = rig.restInverses[name]
  const rest = rig.restPositions[name]
  if (!bone || !restInverse || !rest || !container) return null
  let x = rest.x
  let z = rest.z
  let floor = 0
  let sx = 1
  let sz = 1
  const leg = rig.partMeshes[side === 'L' ? 'leg_L' : 'leg_R']
  if (leg?.geometry) {
    leg.geometry.computeBoundingBox()
    const box = leg.geometry.boundingBox
    x = (box.min.x + box.max.x) / 2
    z = (box.min.z + box.max.z) / 2
    floor = box.min.y
    // The boot's shaft is 1.62 x 1.82: grow it if the leg is chunkier.
    sx = Math.max(1, (box.max.x - box.min.x + 0.2) / 1.62)
    sz = Math.max(1, (box.max.z - box.min.z + 0.2) / 1.82)
  }
  const local = new Matrix4().compose(new Vector3(x, floor, z), new Quaternion(), new Vector3(sx, 1, sz)).premultiply(restInverse)
  container.add(object)
  rig.followers.push({ obj: object, bone, local })
  return object
}

/** Forgets followers whose objects were removed. */
export function dropFollowers(rig, objects) {
  const gone = new Set(objects)
  rig.followers = rig.followers.filter((f) => !gone.has(f.obj))
}

const _fm = new Matrix4()
const _fInv = new Matrix4()
const _fp = new Vector3()
const _fq = new Quaternion()
const _fs = new Vector3()
const ONE = new Vector3(1, 1, 1)

/**
 * Moves hand items, shoes and boots onto their bones (position and rotation,
 * scale 1), in the container's space. Call every frame after posing the rig.
 */
export function updateFollowers(rig, container) {
  if (!container || !rig.followers.length) return
  container.updateWorldMatrix(true, false)
  _fInv.copy(container.matrixWorld).invert()
  for (const { obj, bone, local } of rig.followers) {
    bone.updateWorldMatrix(true, false)
    _fm.multiplyMatrices(_fInv, bone.matrixWorld).decompose(_fp, _fq, _fs)
    _fm.compose(_fp, _fq, ONE).multiply(local).decompose(obj.position, obj.quaternion, obj.scale)
  }
}

/**
 * Applies Bloxity body proportions.
 *
 * Must run every frame: each bone is reset to its rest transform before the
 * multipliers are re-applied, which is what makes the result idempotent and lets
 * proportion changes take effect live.
 */
export function applyProportions(rig, proportions) {
  const skeleton = rig.skeleton
  if (!skeleton || !proportions) return

  const height = proportions.height ?? 1
  const armLength = proportions.armLength ?? 1
  const headScale = proportions.headScale ?? 1
  const neckHeight = proportions.neckHeight ?? 1
  const shoulderWidth = proportions.shoulderWidth ?? 1
  const torsoScaleX = proportions.torsoScaleX ?? 1
  const legOffsetX = proportions.legOffsetX ?? 1

  // Overall height is a scale on the character root, not on a bone.
  rig.root.scale.set(1, height, 1)

  for (const bone of skeleton.bones) {
    const rest = rig.bones[bone.name]
    if (!rest) continue

    const { origScale, origPos, origQuat } = rest
    bone.position.copy(origPos)
    bone.quaternion.copy(origQuat)
    bone.scale.copy(origScale)

    const name = bone.name

    if (name.startsWith('Arm')) {
      bone.scale.y = origScale.y * armLength
      // Not in the SDK preview: widen the shoulders by pushing the arm roots out.
      if (name === 'ArmL_Offset' || name === 'ArmR_Offset') {
        bone.position.x = origPos.x * shoulderWidth
      }
    } else if (name === NECK_OFFSET_BONE) {
      // Keeps the head sitting on the neck as height/headScale change, then applies
      // neckHeight against the bind-pose offset.
      bone.position.y += (height - headScale) * origPos.y
      bone.position.y += rig.neckOffsetBindY * (neckHeight - 1) * 0.8
    } else if (name === HAT_BONE) {
      // Divided by height so the head stays uniform inside the stretched root.
      bone.scale.set(
        origScale.x * headScale,
        origScale.y * (headScale / height),
        origScale.z * headScale,
      )
    } else if (name === BACK_BONE) {
      // Not in the SDK preview: torso width.
      bone.scale.x = origScale.x * torsoScaleX
    } else if (name === 'LegL_Offset' || name === 'LegR_Offset') {
      // Not in the SDK preview: leg splay, mirrored about the rig centre.
      bone.position.x = origPos.x * legOffsetX
    }
  }
}

/* ---------------------------------------------------------------------------
 * Procedural animation
 *
 * player.glb ships zero animation clips, so the run / jump / idle cycle is
 * driven directly on the bones. Rotations are *multiplied onto* whatever
 * applyProportions() just wrote, so this must run immediately after it in the
 * same frame.
 * ------------------------------------------------------------------------- */

const _animQ = new Quaternion()

/**
 * Rotates a bone about one of its precomputed character-space axes.
 * `which` is 'axisX' (forward/back swing) or 'axisZ' (lateral sway).
 */
function rotateBone(rig, name, which, angle) {
  if (!angle) return
  const entry = rig.bones[name]
  const axis = entry?.[which]
  if (!axis) return
  entry.bone.quaternion.multiply(_animQ.setFromAxisAngle(axis, angle))
}

/** Swing a limb forward/back - the plane a run cycle actually moves in. */
const swing = (rig, name, angle) => rotateBone(rig, name, 'axisX', angle)
/** Sway a limb out to the side. */
const sway = (rig, name, angle) => rotateBone(rig, name, 'axisZ', angle)

/**
 * Poses the rig for the current motion state.
 *
 * The character faces +Z. A positive swing turns a limb that hangs down
 * towards the back (so a negative one lifts it forward); a positive sway
 * moves it towards the character's left (+X).
 *
 * @param {object} rig from `collectRig`
 * @param {{ time: number, speed: number, grounded: boolean, rising?: number,
 *           bounce?: boolean }} motion
 *   `speed` is horizontal speed in studs/sec; `rising` is the vertical speed
 *   (arms go up while rising, out while falling).
 */
export function animateRig(rig, motion) {
  if (!rig?.skeleton || !motion) return

  const { time = 0, speed = 0, grounded = true, rising = 0, bounce = false } = motion
  rig.root.position.y = rig.rootRestY

  // --- Airborne: tuck while rising, spread out while falling; a star on trampolines.
  if (!grounded) {
    if (bounce) {
      const flap = Math.sin(time * 9) * 0.25
      sway(rig, 'ArmL1', 1.9 + flap)
      sway(rig, 'ArmR1', -1.9 - flap)
      sway(rig, 'LegL1', 0.35)
      sway(rig, 'LegR1', -0.35)
      return
    }
    const up = Math.max(0, Math.min(1, rising / 40))
    const down = 1 - up
    swing(rig, 'LegL1', -0.7 * up - 0.25 * down)
    swing(rig, 'LegL2', 0.9 * up + 0.3 * down)
    swing(rig, 'LegR1', 0.35 * up + 0.2 * down)
    swing(rig, 'LegR2', 0.25 * up + 0.4 * down)
    swing(rig, 'ArmL1', -2.4 * up - 0.4 * down)
    swing(rig, 'ArmR1', -2.4 * up - 0.4 * down)
    sway(rig, 'ArmL1', 0.9 * down)
    sway(rig, 'ArmR1', -0.9 * down)
    swing(rig, 'Spine1', 0.1 * up)
    return
  }

  // --- Standing still: a slow breathing sway.
  if (speed < 0.6) {
    const idle = Math.sin(time * 1.6)
    sway(rig, 'ArmL1', -0.07 - idle * 0.03)
    sway(rig, 'ArmR1', 0.07 + idle * 0.03)
    swing(rig, 'Spine1', idle * 0.02)
    rig.root.position.y = rig.rootRestY + idle * 0.03
    return
  }

  // --- Run cycle. The step rate rises with speed (but not so far it looks like
  // a blur); the stride and arm swing open right up.
  const ratio = Math.min(speed / 18, 1)
  const phase = time * (5.5 + Math.min(speed, 70) * 0.13)
  const cycle = Math.sin(phase)
  const legAmp = 0.95 * ratio
  const armAmp = 0.85 * ratio

  // Legs swing in opposition; the heel kicks up on the backswing.
  swing(rig, 'LegL1', cycle * legAmp)
  swing(rig, 'LegR1', -cycle * legAmp)
  swing(rig, 'LegL2', (0.15 + Math.max(0, cycle) * 1.2) * ratio)
  swing(rig, 'LegR2', (0.15 + Math.max(0, -cycle) * 1.2) * ratio)

  // Arms counter-swing against the legs, elbows bent.
  swing(rig, 'ArmL1', -cycle * armAmp)
  swing(rig, 'ArmR1', cycle * armAmp)
  swing(rig, 'ArmL2', -0.5 * ratio - Math.max(0, cycle) * 0.4 * ratio)
  swing(rig, 'ArmR2', -0.5 * ratio - Math.max(0, -cycle) * 0.4 * ratio)

  // Lean into the run, and bob once per step.
  swing(rig, 'Spine1', 0.16 * ratio + Math.min(speed / 150, 0.18))
  rig.root.position.y = rig.rootRestY + Math.abs(Math.cos(phase)) * 0.22 * ratio
}
