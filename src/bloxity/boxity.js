import { getSDK, safeCall, toUnsubscribe } from './sdk'

/**
 * Every Boxity SDK call the game makes besides login and avatars (those are
 * BloxityProvider's), in one place.
 *
 * The SDK behaves the same embedded (iframe on bloxity.io) and standalone (our
 * own domain); the few differences are handled here:
 *  - chat and the portal's settings menu only exist embedded;
 *  - players reach the game server through the Boxity matchmaker, except on
 *    localhost or with VITE_SERVER_URL (local testing).
 */

export const API_URL = import.meta.env.VITE_BLOXITY_API_URL || 'https://api.bloxity.io'
/** The game's Boxity hosting id: players join through the matchmaker for it. */
export const HOSTING_ID = import.meta.env.VITE_GAME_ID || ''
/** Optional matchmaker version, e.g. "preview" to reach the dev backend from your own domain. */
const MATCHMAKER_VERSION = import.meta.env.VITE_MATCHMAKER_VERSION || undefined
const PLAY_HTTP = 'https://play.bloxity.io'
const PLAY_WS = 'wss://play.bloxity.io/v1/ws/'

const isLocalPage = ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
/** True when joins go through the Boxity matchmaker. */
export const usesMatchmaker = !import.meta.env.VITE_SERVER_URL && Boolean(HOSTING_ID) && !isLocalPage
/** The page was opened by CrazyGames (bloxity.io/?cg=true passes it on). */
export const onCrazyGames = new URLSearchParams(window.location.search).get('cg') === 'true'

const sdk = () => getSDK()
const call = (pick, ...args) => {
  const s = sdk()
  return s ? safeCall(pick(s), ...args) : undefined
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const isEmbedded = () => Boolean(call((s) => s.portal?.isEmbeddedInLegion?.bind(s.portal)))
/** The signed-in player's Boxity token (sent on join so the server can check it), or undefined. */
export const getToken = () => call((s) => s.auth?.getToken?.bind(s.auth)) || undefined
/** Boxity account ids may arrive as "legion_<id>"; the game uses the bare id. */
export const bareUserId = (id) => String(id || '').replace(/^legion_/, '')

/* ------------------------------------------------------------------------ */
/* Where to connect                                                          */
/* ------------------------------------------------------------------------ */

/** Our own server: VITE_SERVER_URL, else ws://<this host>:2567 (`npm run dev` in the server repo). */
const directServer = () =>
  import.meta.env.VITE_SERVER_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`

/**
 * The endpoint for the next Colyseus Client. Through the Boxity matchmaker it
 * is resolved fresh for every connect (each endpoint is pinned to one server)
 * and retried with a backoff: a cold start can take ~45 s.
 * @returns {Promise<{ endpoint: string, relayRoomId: string | null }>}
 */
export async function resolveServer({ giveUpMs = 60_000 } = {}) {
  if (!usesMatchmaker) return { endpoint: directServer(), relayRoomId: null }
  const started = Date.now()
  let delay = 1000
  for (;;) {
    try {
      const net = sdk()?.net
      if (!net?.resolveEndpoint) throw new Error('Boxity SDK not loaded')
      const r = await net.resolveEndpoint(HOSTING_ID, MATCHMAKER_VERSION ? { version: MATCHMAKER_VERSION } : {})
      return { endpoint: r.endpoint, relayRoomId: r.roomId || null }
    } catch (err) {
      if (Date.now() - started + delay > giveUpMs) throw err
      await sleep(delay)
      delay = Math.min(delay * 2, 8000)
    }
  }
}

/**
 * The id other players use to reach a room (invites, ?roomId=). A room on
 * Boxity hosting also needs its relay: "<relayRoomId>~<colyseusRoomId>".
 */
export const publicRoomId = (roomId, relayRoomId) => (usesMatchmaker && relayRoomId ? `${relayRoomId}~${roomId}` : roomId)

/** The relay room id in a matchmaker endpoint (null for any other server). */
export const relayOf = (endpoint) => (typeof endpoint === 'string' && endpoint.startsWith(PLAY_WS) ? endpoint.slice(PLAY_WS.length) || null : null)

/** Asks Boxity's room directory which relay reaches a hosted room. */
async function findHostedRoom(roomId) {
  try {
    const res = await fetch(`${PLAY_HTTP}/v1/dir/${encodeURIComponent(HOSTING_ID)}/list`, { signal: AbortSignal.timeout(8000) })
    const body = await res.json()
    const rooms = Array.isArray(body?.rooms) ? body.rooms : []
    const room = rooms.find((r) => r && [r.roomId, r.id, r.colyseusRoomId].includes(roomId))
    if (!room) return null
    if (typeof room.joinUrl === 'string' && /^(wss?|https?):\/\//.test(room.joinUrl)) return { endpoint: room.joinUrl.replace(/^http/, 'ws'), roomId }
    const relay = room.relayRoomId || room.relayId
    return relay ? { endpoint: PLAY_WS + relay, roomId } : null
  } catch {
    return null
  }
}

/**
 * Where a room is, from its public id: { endpoint, roomId } for joinById, or
 * null when it can't be found (then: normal matchmaking).
 */
export async function locateRoom(publicId) {
  if (!publicId) return null
  const [relay, roomId] = publicId.includes('~') ? publicId.split('~') : [null, publicId]
  if (relay) return { endpoint: PLAY_WS + relay, roomId }
  if (usesMatchmaker) return findHostedRoom(roomId)
  return { endpoint: directServer(), roomId }
}

let launchRoomTaken = false
/** ?roomId= from the page URL (Boxity's Open Rooms "Join", friend invites). Only the first join uses it. */
export function takeLaunchRoomId() {
  if (launchRoomTaken) return null
  launchRoomTaken = true
  const id = new URLSearchParams(window.location.search).get('roomId')
  return id && /^[A-Za-z0-9_~-]{3,120}$/.test(id) ? id : null
}

/* ------------------------------------------------------------------------ */
/* Room, presence, lifecycle                                                 */
/* ------------------------------------------------------------------------ */

let reportedRoom = null
/** The room friends can join us in ('' when there is none). */
export function reportRoom(id) {
  if (id === reportedRoom) return
  reportedRoom = id
  call((s) => s.game?.updateRoom?.bind(s.game), id || '')
}

let playing = false
/** Gameplay started / ended (Boxity's analytics and overlays). */
export function setPlaying(on) {
  if (on === playing) return
  playing = on
  call((s) => (on ? s.game?.gameplayStart : s.game?.gameplayEnd)?.bind(s.game))
}

/** Friend-join notices: everyone already here once, then each newcomer. */
let knownPlayers = null
export function resetPresence() {
  knownPlayers = null
}
/** @param {string[]} usernames the Boxity usernames of everyone else in the room */
export function trackPresence(usernames) {
  if (!knownPlayers) {
    knownPlayers = new Set(usernames)
    for (const name of usernames) call((s) => s.game?.playerInRoom?.bind(s.game), name)
    return
  }
  for (const name of usernames) {
    if (knownPlayers.has(name)) continue
    knownPlayers.add(name)
    call((s) => s.game?.playerJoined?.bind(s.game), name)
  }
}

/* ------------------------------------------------------------------------ */
/* Portal settings (embedded only)                                           */
/* ------------------------------------------------------------------------ */

const QUALITY = { Low: 'low', Medium: 'medium', High: 'high', Ultra: 'high' }
const percent = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : null
}
/** Each portal setting this game supports, as a patch of our own settings. */
const SETTINGS = {
  master_volume: (v) => (percent(v) === null ? null : { masterVolume: percent(v) }),
  music_volume: (v) => (percent(v) === null ? null : { musicVolume: percent(v) }),
  // "High" is the menu's default: the game may still step down on a slow machine; any other pick is the player's.
  graphics_quality: (v) => (QUALITY[v] ? { quality: QUALITY[v], autoQuality: v === 'High' } : null),
  show_fps: (v) => ({ showFps: v === 'true' }),
  camera_sensitivity: (v) => (Number.isFinite(Number(v)) && v !== '' ? { cameraSensitivity: Math.min(5, Math.max(0.1, Number(v))) } : null),
  enable_chat: (v) => ({ showChat: v !== 'false' }),
}

/**
 * Registers the settings this game supports (that is what puts them in the
 * portal's menu) and applies every push. Standalone there is no portal menu,
 * so our own Settings panel stays in charge.
 * @param {(patch: object) => void} apply
 */
export function listenToPortalSettings(apply) {
  const settings = sdk()?.settings
  if (!settings?.listen || !isEmbedded()) return () => {}
  const offs = Object.entries(SETTINGS).map(([key, toPatch]) =>
    toUnsubscribe(
      settings.listen(key, (value) => {
        const patch = toPatch(String(value ?? ''))
        if (patch) apply(patch)
      }),
    ),
  )
  return () => offs.forEach((off) => off())
}

/* ------------------------------------------------------------------------ */
/* Chat, player events, emotes                                               */
/* ------------------------------------------------------------------------ */

/**
 * Boxity's chat (the portal draws the chat box; we show each message over the
 * sender). cb({ userId, username, text, seconds, isLocalPlayer }).
 */
export function onChatMessage(cb) {
  const chat = sdk()?.chat
  if (!chat?.onMessage) return () => {}
  return toUnsubscribe(
    chat.onMessage((m) => {
      try {
        cb({
          userId: bareUserId(m.userId),
          username: String(m.username || ''),
          text: chat.bubbleText(m),
          seconds: chat.bubbleSeconds || 4,
          isLocalPlayer: Boolean(m.isLocalPlayer),
        })
      } catch (err) {
        console.warn('[boxity] chat bubble failed', err)
      }
    }),
  )
}

/** The SDK's three.js bubble (camera-facing sprite that replaces, fades and cleans up). */
export function attachChatBubble(THREE, target, text, options) {
  const chat = sdk()?.chat
  if (!chat?.attachBubble || !target) return null
  try {
    return chat.attachBubble(THREE, target, text, options)
  } catch (err) {
    console.warn('[boxity] chat bubble failed', err)
    return null
  }
}

/** 'respawn_request', 'play_emote' (data: the emote id), 'pointer_lock_changed', 'chat_message_sent'. */
export function onPlayerEvent(cb) {
  const player = sdk()?.player
  if (!player?.onEvent) return () => {}
  return toUnsubscribe(
    player.onEvent((event, data) => {
      try {
        cb(event, data)
      } catch (err) {
        console.warn('[boxity] player event failed', err)
      }
    }),
  )
}

/** Tells the portal this game can do a platform feature (it only shows the feature's UI then). */
export const registerFeature = (name) => call((s) => s.game?.registerFeature?.bind(s.game), name)

let emotes = null
let emotesLoading = null
/** The emote catalogue (id -> clip), fetched once. Unknown ids simply have no clip. */
export function loadEmotes() {
  if (emotes) return Promise.resolve(emotes)
  emotesLoading ??= fetch(`${API_URL}/v1/avatar/emotes`)
    .then((res) => res.json())
    .then((body) => {
      const list = Array.isArray(body) ? body : body?.emotes || []
      const byId = new Map()
      for (const e of list) if (e?.id && e.clip?.tracks) byId.set(e.id, e.clip)
      emotes = byId
      return byId
    })
    .catch((err) => {
      console.warn('[boxity] emote catalogue unavailable', err)
      emotesLoading = null
      return new Map()
    })
  return emotesLoading
}
export const emoteClip = (id) => emotes?.get(id) || null
