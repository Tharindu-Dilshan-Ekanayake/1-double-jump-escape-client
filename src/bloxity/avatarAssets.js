/**
 * URL construction and slot metadata for Bloxity avatar assets.
 *
 * The shapes here are not guesses: they mirror the assembly logic inside
 * legion-sdk.min.js (the same code that renders the avatar preview in the Bloxity
 * portal), so an avatar built with this file matches what the player sees there.
 *
 * `avatar.getEquipped()` returns:
 *   { hatId, backId, skinId, headId, armLId, armRId, legLId, legRId, torsoId,
 *     hairId, maskId, neckId, chestId, waistId, handId, shoesId,
 *     faceId, pantsId, shirtId }
 */

export const AVATAR_CDN = 'https://static.bloxity.io/avatars'
/** Bloxity API (builds skin textures with a face, shirt and pants drawn on). */
export const AVATAR_API = import.meta.env.VITE_BLOXITY_API_URL || 'https://api.bloxity.io'

/** The base humanoid body + skeleton. All other assets modify this. */
export const BASE_BODY_URL = `${AVATAR_CDN}/player.glb`

/** Bone that hats attach to, from player.glb's skeleton. */
export const HAT_BONE = 'Neck1'
/** Bone that back items attach to. */
export const BACK_BONE = 'Spine2'
/** Bone whose bind-pose Y drives the neckHeight proportion. */
export const NECK_OFFSET_BONE = 'Neck_Offset'

/** Skin id used when nothing is equipped — the base body has no baked-in texture. */
export const DEFAULT_SKIN_ID = '0'

/**
 * Body-part slots.
 *
 * Each maps an equipped id onto a named skinned mesh already present in player.glb.
 * A part is applied by swapping that mesh's *geometry*, not by attaching a new
 * object — that is what keeps it bound to the shared skeleton.
 */
export const PART_SLOTS = {
  head: { idKey: 'headId', mesh: 'default_head', dir: 'head', suffix: '' },
  arm_L: { idKey: 'armLId', mesh: 'default_arm_L', dir: 'arms', suffix: '_L' },
  arm_R: { idKey: 'armRId', mesh: 'default_arm_R', dir: 'arms', suffix: '_R' },
  leg_L: { idKey: 'legLId', mesh: 'default_leg_L', dir: 'legs', suffix: '_L' },
  leg_R: { idKey: 'legRId', mesh: 'default_leg_R', dir: 'legs', suffix: '_R' },
  torso: { idKey: 'torsoId', mesh: 'default_torso', dir: 'torso', suffix: '' },
}

/**
 * Accessories placed by their rest pose (the SDK's own table). Each mesh is
 * authored in the character's model space, so it is attached with the bone's
 * inverse rest matrix times a translation to `origin`:
 *  - inheritScale: parented to the bone (follows it, scale included);
 *  - otherwise: kept beside the character and moved onto the bone every frame,
 *    position and rotation only, with a mirrored copy on `mirrorBone` (a pair of
 *    hand items or shoes).
 */
export const ACCESSORY_SLOTS = {
  hair: { idKey: 'hairId', dir: 'hats', bone: 'Neck1', origin: [0, 5.6, 0], inheritScale: true },
  mask: { idKey: 'maskId', dir: 'hats', bone: 'Neck1', origin: [0, 5.6, 0], inheritScale: true },
  neck: { idKey: 'neckId', dir: 'neck', bone: 'Spine2', origin: [0, 4.8, 0], inheritScale: true },
  chest: { idKey: 'chestId', dir: 'chest', bone: 'Spine2', origin: [0, 3.6, 0], inheritScale: true },
  waist: { idKey: 'waistId', dir: 'waist', bone: 'Spine1', origin: [0, 2.4, 0], inheritScale: true },
  hand: { idKey: 'handId', dir: 'hand', bone: 'ArmL2_leaf', mirrorBone: 'ArmR2_leaf', origin: [0, 0, 0], inheritScale: false },
  shoes: { idKey: 'shoesId', dir: 'shoes', bone: 'LegL2_leaf', mirrorBone: 'LegR2_leaf', origin: [0, 0, 0], inheritScale: false },
}

/** Clothing drawn onto the skin texture, in the order the texture URL lists them. */
const SKIN_LAYERS = [
  ['pantsId', 'pn'],
  ['shirtId', 'sh'],
  ['faceId', 'fc'],
]

/** Values that all mean "nothing equipped". Superset of the SDK's own check. */
const EMPTY_IDS = new Set(['-1', '', 'undefined', 'null'])

/**
 * @param {unknown} id
 * @returns {boolean} true when the id names a real asset worth fetching
 */
export function isRealId(id) {
  if (id === null || id === undefined) return false
  return !EMPTY_IDS.has(String(id).trim())
}

export const assetUrls = {
  part: (slot, id) => {
    const { dir, suffix } = PART_SLOTS[slot]
    return `${AVATAR_CDN}/parts/${dir}/${id}${suffix}.glb`
  },
  skinTexture: (id) => `${AVATAR_CDN}/skins/${id}.png`,
  itemMesh: (dir, id) => `${AVATAR_CDN}/items/${dir}/${id}.obj`,
  itemTexture: (dir, id) => `${AVATAR_CDN}/textures/${dir}/${id}.png`,
  hatMesh: (id) => `${AVATAR_CDN}/items/hats/${id}.obj`,
  hatTexture: (id) => `${AVATAR_CDN}/textures/hats/${id}.png`,
  backMesh: (id) => `${AVATAR_CDN}/items/back/${id}.obj`,
  backTexture: (id) => `${AVATAR_CDN}/textures/back/${id}.png`,
}

/** Skin ids fall back to "0" rather than being skipped. */
export const skinIdOrDefault = (id) => (isRealId(id) ? String(id) : DEFAULT_SKIN_ID)

/**
 * The body texture for an equipped set: the plain skin, or (when a face, shirt
 * or pants is worn) the API's composite with those drawn on. Same rule as the
 * SDK's `avatar.getSkinTextureUrl()`, so other riders get it too.
 */
export function skinTextureUrl(equipped) {
  const worn = SKIN_LAYERS.filter(([key]) => isRealId(equipped?.[key]) && String(equipped[key]) !== '0')
  const skin = skinIdOrDefault(equipped?.skinId)
  if (!worn.length) return assetUrls.skinTexture(skin)
  const name = `s${skin}${worn.map(([key, tag]) => `_${tag}${equipped[key]}`).join('')}`
  return `${AVATAR_API}/v1/avatar/skin-texture/${name}.png`
}
