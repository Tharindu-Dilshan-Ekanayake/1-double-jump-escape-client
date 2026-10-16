import { emoteClip, loadEmotes } from '../bloxity/boxity'
import { send } from '../net/connection'
import { localPlayer } from './playerState'

/**
 * Boxity emotes on characters. The Boxity overlay draws the emote picker; the
 * game plays the clip it names (see applyEmote in avatarRig) on our character
 * and, through the room state, on everyone else's screen.
 *
 * A character's `motion.emote` is { id, clip, at }: what it plays and since
 * when. Walking, jumping or falling ends it.
 */

/** Seconds an emote takes to blend in or out. */
const EMOTE_BLEND = 0.12
/** Moving faster than this (studs/s) ends an emote. */
const STOP_SPEED = 1.5

const nowSeconds = () => performance.now() / 1000

/** An emote to play from now. Its clip may arrive a moment later, with the catalogue. */
export function emoteFor(id) {
  if (!id) return null
  const emote = { id, clip: emoteClip(id), at: nowSeconds() }
  if (!emote.clip) {
    loadEmotes().then(() => {
      emote.clip = emoteClip(id)
      emote.at = nowSeconds()
    })
  }
  return emote
}

/** An emote picked in the Boxity menu: on our character, and for everyone in the room. */
export async function playLocalEmote(id) {
  await loadEmotes()
  const clip = emoteClip(id)
  const motion = localPlayer.motion
  // Unknown ids are ignored; so are emotes in mid-air or while falling.
  if (!clip || motion.dead || motion.air) return
  motion.emote = { id, clip, at: nowSeconds() }
  send('emote', { id })
}

/** Our emote ends (we moved): everyone else stops it too. */
export function stopLocalEmote() {
  if (!localPlayer.motion.emote) return
  localPlayer.motion.emote = null
  send('emote', { id: '' })
}

/**
 * Advances a character's emote for this frame: ends it when the player moves
 * (or a one-shot clip is over) and eases the blend in and out. Writes
 * pose.emote, pose.emoteTime and pose.emoteWeight for the avatar.
 */
export function stepEmote(motion, pose, now, dt) {
  const e = motion.emote
  if (e && (motion.dead || motion.air || motion.speed > STOP_SPEED || (e.clip && !e.clip.loop && now - e.at > (Number(e.clip.len) || 0)))) {
    motion.emote = null
  }
  const live = motion.emote?.clip ? motion.emote : null
  if (live) pose.emote = live
  pose.emoteWeight = Math.min(1, Math.max(0, (pose.emoteWeight ?? 0) + (live ? dt : -dt) / EMOTE_BLEND))
  if (!live && pose.emoteWeight === 0) pose.emote = null
  pose.emoteTime = pose.emote ? now - pose.emote.at : 0
}
