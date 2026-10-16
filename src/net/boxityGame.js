import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'

import { sound } from '../audio/sound'
import { attachChatBubble, listenToPortalSettings, loadEmotes, onChatMessage, onPlayerEvent, registerFeature } from '../bloxity/boxity'
import { BUBBLE_HEIGHT, LOCAL, characterRoots } from '../game/characterRoots'
import { playLocalEmote } from '../game/emotes'
import { localPlayer } from '../game/playerState'
import { gameState } from '../store/gameStore'
import { getRoom } from './connection'

/** The few three.js classes the SDK's chat bubble needs (rather than all of three). */
const BUBBLE_THREE = { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial }
/** Bubble height in studs (characters are 5 studs tall). */
const BUBBLE_SCALE = 1.5

/** A settings push from the Boxity menu: into our own settings, and the sound. */
function applyPortalSettings(patch) {
  const store = gameState()
  for (const [key, value] of Object.entries(patch)) {
    if (store.settings[key] !== value) store.setSetting(key, value)
  }
  if ('masterVolume' in patch) sound.setMasterVolume(patch.masterVolume)
  if ('musicVolume' in patch) sound.setMusicVolume(patch.musicVolume)
}

/** Whose character a chat message goes over: LOCAL, another player's session id, or null. */
function senderOf({ userId, username, isLocalPlayer }) {
  if (isLocalPlayer) return LOCAL
  const room = getRoom()
  let found = null
  room?.state.players?.forEach((p, sid) => {
    if (found || sid === room.sessionId) return
    // Accounts by id (verified by the server); guests by their Boxity guest name.
    if ((userId && p.boxityId === userId) || (username && (p.username === username || (!p.username && p.name === username)))) found = sid
  })
  return found
}

/**
 * Connects Boxity's platform features to the game. Called once, right after
 * Legion.SDK.init() (before loadingEnd), so no portal push is missed.
 * @returns {() => void} unsubscribes everything
 */
export function installBoxityFeatures() {
  // The emote button in the Boxity overlay only appears for games that ask for it.
  registerFeature('emotes')
  loadEmotes()

  const offs = [
    // Volume, graphics, camera and chat follow the Boxity menu (embedded only).
    listenToPortalSettings(applyPortalSettings),

    onPlayerEvent((event, data) => {
      if (gameState().phase !== 'playing') return
      if (event === 'respawn_request') localPlayer.resetRequested = true
      else if (event === 'play_emote' && typeof data === 'string') playLocalEmote(data)
    }),

    // Boxity draws the chat; the game shows each message over its sender.
    onChatMessage((m) => {
      if (gameState().settings.showChat === false) return
      const key = senderOf(m)
      const root = key ? characterRoots.get(key) : null
      if (!root) return
      attachChatBubble(BUBBLE_THREE, root, m.text, {
        seconds: m.seconds,
        height: key === LOCAL ? BUBBLE_HEIGHT.local : BUBBLE_HEIGHT.remote,
        scale: BUBBLE_SCALE,
      })
    }),
  ]
  return () => offs.forEach((off) => off())
}
