import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, MeshStandardMaterial, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import {
  ACCESSORY_SLOTS,
  assetUrls,
  BASE_BODY_URL,
  isRealId,
  PART_SLOTS,
  skinTextureUrl,
} from '../bloxity/avatarAssets'
import { loadItemTexture, loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { useBloxity } from '../bloxity/BloxityContext'
import { DEFAULT_PROPORTIONS } from '../bloxity/store'
import {
  animateRig,
  applyEmote,
  applyPart,
  applyProportions,
  applySkin,
  attachAccessory,
  attachBoot,
  attachRestAccessory,
  collectRig,
  dropFollowers,
  updateFollowers,
} from './avatarRig'
import { bootVisible, createBoot, updateBoot } from './character/boots'

/**
 * Keeps the avatar breathing when it is rendered outside the game (a menu preview,
 * say) with no controller feeding it motion.
 */
const _idleMotion = { time: 0, speed: 0, grounded: true }
function fallbackMotion(delta) {
  _idleMotion.time += delta
  return _idleMotion
}

/**
 * A Bloxity avatar, assembled at runtime. With no `equipped` prop it shows the
 * local player's own avatar; other players pass in the equipped set the server
 * synced for them.
 *
 * `player.glb` is the base humanoid rig: six skinned meshes (head, torso, two arms,
 * two legs) sharing one skeleton. Assembly means, per equipped slot:
 *   - body parts  -> swap the matching mesh's geometry
 *   - hat / back  -> attach an OBJ to the Neck1 / Spine2 bone
 *   - hair, mask, neck, chest, waist -> an OBJ on its bone, placed by rest pose
 *   - hand, shoes -> a mirrored pair that follows the hand / foot bones
 *   - skin        -> one texture (face, shirt and pants drawn on) as the map on
 *                    every skinned mesh
 * and the game's boots (`boot`) follow the foot bones on top of all that.
 *
 * Any slot that is unequipped or 404s leaves the base body's own part in place.
 * The whole thing re-assembles when `onAvatarChanged` / `onProportionsChanged`
 * fire, so changing cosmetics in the Bloxity portal updates the character live.
 *
 * `targetHeight` is the world-space height to fit the avatar into: Bloxity
 * authors the rig ~6.4 units tall with the feet at y=0, so the model is
 * measured and rescaled rather than trusted at native size.
 */
export const PlayerAvatar = forwardRef(function PlayerAvatar(
  {
    onReady,
    targetHeight = 5,
    motionRef,
    equipped: equippedProp,
    proportions: proportionsProp,
    boot = 'starter',
    reportLoading = false,
    ...props
  },
  ref,
) {
  const bloxity = useBloxity()
  const equipped = equippedProp === undefined ? bloxity.avatar : equippedProp
  const proportions =
    proportionsProp === undefined
      ? bloxity.proportions
      : { ...DEFAULT_PROPORTIONS, ...(proportionsProp || {}) }
  const { game } = bloxity
  const { scene: baseScene } = useGLTF(BASE_BODY_URL)
  const [assembled, setAssembled] = useState(false)
  // The fit group: hand items, shoes and boots live here, beside the character.
  const fitRef = useRef(null)
  const bootsRef = useRef([])

  // The GLTF cache hands back one shared scene. Clone via SkeletonUtils so this
  // instance gets an independent, still-working skeleton.
  const character = useMemo(() => cloneSkeleton(baseScene), [baseScene])

  // Rig lookup tables (bones, part meshes, pristine geometries) built once per clone.
  const rig = useMemo(() => {
    const collected = collectRig(character)

    // The base body ships with an empty texture; give every skinned mesh its own
    // material instance so a skin swap here can't leak into another avatar.
    for (const mesh of collected.skinnedMeshes) {
      mesh.material = new MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 1,
      })
    }

    if (!collected.skeleton) {
      console.warn('[bloxity] player.glb has no skeleton - avatar will not deform')
    }
    return collected
  }, [character])

  // Measured once, from the bind pose, before proportions touch the root scale.
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(character)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    // The rig's feet sit at its bbox minimum; drop the group so they land on y=0.
    return { scale, footOffset: -box.min.y * scale }
  }, [character, targetHeight])

  // --- Assemble equipped cosmetics --------------------------------------------
  useEffect(() => {
    let cancelled = false
    // Accessories are re-attached on every rebuild; track them so the previous
    // ones can be removed rather than stacking up.
    const attached = []

    if (reportLoading) game.loadingStep('Loading your avatar…')

    const jobs = []

    // Skin always loads - "0" is the fallback, since the base body has no baked map.
    // With a face / shirt / pants worn it's the API's composite texture.
    jobs.push(loadTexture(skinTextureUrl(equipped)).then((texture) => ({ kind: 'skin', texture })))

    // Body parts: fetch only real ids; a missing slot resets to the base geometry.
    for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
      const id = equipped?.[cfg.idKey]
      if (!isRealId(id)) {
        jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
        continue
      }
      jobs.push(loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({ kind: 'part', slot, scene })))
    }

    // Accessories.
    for (const [kind, idKey, meshUrl, texUrl] of [
      ['hat', 'hatId', assetUrls.hatMesh, assetUrls.hatTexture],
      ['back', 'backId', assetUrls.backMesh, assetUrls.backTexture],
    ]) {
      const id = equipped?.[idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(meshUrl(id)), loadItemTexture(texUrl(id))]).then(
          ([object, texture]) => ({ kind: 'accessory', accessory: kind, object, texture }),
        ),
      )
    }

    // Hair, mask, neck, chest, waist, hand items and shoes.
    for (const slot of Object.values(ACCESSORY_SLOTS)) {
      const id = equipped?.[slot.idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(assetUrls.itemMesh(slot.dir, id)), loadItemTexture(assetUrls.itemTexture(slot.dir, id))]).then(
          ([object, texture]) => ({ kind: 'restAccessory', slot, object, texture }),
        ),
      )
    }

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return

        for (const result of results) {
          // One bad slot must not take the rest of the character down.
          try {
            if (result.kind === 'skin') {
              applySkin(rig, result.texture)
            } else if (result.kind === 'part') {
              applyPart(rig, result.slot, result.scene)
            } else if (result.kind === 'accessory' && result.object) {
              if (result.texture) {
                result.object.traverse((child) => {
                  if (child.isMesh) child.material = new MeshStandardMaterial({ map: result.texture })
                })
              }
              const added = attachAccessory(rig, result.accessory, result.object)
              if (added) attached.push(added)
            } else if (result.kind === 'restAccessory' && result.object) {
              const material = new MeshStandardMaterial({ map: result.texture ?? null })
              result.object.traverse((child) => {
                if (child.isMesh) child.material = material
              })
              attached.push(...attachRestAccessory(rig, result.slot, result.object, fitRef.current))
            }
          } catch (err) {
            console.warn(`[bloxity] failed to apply ${result.kind}`, err)
          }
        }

        setAssembled(true)
      })
      .catch((err) => {
        console.warn('[bloxity] avatar assembly failed; showing base body', err)
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      dropFollowers(rig, attached)
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => child.geometry?.dispose())
      }
    }
  }, [rig, equipped, game, reportLoading])

  // --- The game's boots, on both feet ------------------------------------------
  useEffect(() => {
    const container = fitRef.current
    if (!bootVisible(boot) || !container) return undefined
    const pair = []
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      const made = createBoot(boot, sign)
      if (attachBoot(rig, made.group, side, container)) pair.push(made)
    }
    bootsRef.current = pair
    return () => {
      dropFollowers(rig, pair.map((b) => b.group))
      for (const b of pair) b.group.parent?.remove(b.group)
      bootsRef.current = []
    }
  }, [rig, boot])

  // --- Proportions + pose, every frame -------------------------------------------
  // Proportions reset every bone to its rest pose; the animation then rotates on
  // top of that clean base, and followers (shoes, boots) are moved last.
  // The avatar's own height setting can make it taller than the game's
  // 5-stud body (it already fills that); keep it within a few percent so no one
  // looks stretched up.
  const proportionsRef = useRef(proportions)
  proportionsRef.current = proportions ? { ...proportions, height: Math.min(1.04, Math.max(0.94, proportions.height ?? 1)) } : proportions

  useFrame((_state, delta) => {
    try {
      const motion = motionRef?.current ?? fallbackMotion(delta)
      applyProportions(rig, proportionsRef.current)
      animateRig(rig, motion)
      if (motion.emote) applyEmote(rig, motion.emote.clip, motion.emoteTime, motion.emoteWeight)
      updateFollowers(rig, fitRef.current)
      for (const b of bootsRef.current) updateBoot(b, motion)
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  // Signal readiness only once the model is actually standing there.
  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group ref={ref} {...props}>
      {/* Fit scale lives on this wrapper, not on `character` - applyProportions
          overwrites the character's own scale every frame. */}
      <group ref={fitRef} scale={fit.scale} position={[0, fit.footOffset, 0]}>
        <primitive object={character} />
      </group>
    </group>
  )
})

useGLTF.preload(BASE_BODY_URL)

export default PlayerAvatar
