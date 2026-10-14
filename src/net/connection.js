import { Client } from '@colyseus/sdk'

import { sound } from '../audio/sound'
import { getSDK, safeCall } from '../bloxity/sdk'
import { localPlayer } from '../game/playerState'
import { ROOM_NAME, describeReward, goalAt } from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import { confetti, spawnGainPopup, spawnRewardPopup, spawnStarsPopup } from '../ui/fx'
import { resultMessage } from '../ui/messages'
import { rainWins } from '../ui/winsRain'

/**
 * Colyseus connection.
 *
 * `joinOrCreate` puts the player in any lobby with a free seat; Colyseus locks a
 * room at 8 players, so the 9th player automatically gets a brand new lobby.
 *
 * Where the game server is:
 *  - VITE_SERVER_URL, when set (local testing against a particular server);
 *  - otherwise, when VITE_GAME_ID is set and the page isn't on localhost, the
 *    Bloxity Legion matchmaker: it picks (or starts) a server with room and
 *    returns a relay endpoint pinned to it. Every join resolves again and uses
 *    a fresh Client, as the hosting docs require;
 *  - otherwise ws://<this host>:2567 (`npm run dev` in the server repo).
 *
 * Nothing the server says is shown as text: messages carry numbers and codes,
 * and the client turns them into its own popups (see ui/messages.js).
 */

const GAME_ID = import.meta.env.VITE_GAME_ID || ''
/** Optional matchmaker version, e.g. "preview" to reach the dev backend from your own domain. */
const MATCHMAKER_VERSION = import.meta.env.VITE_MATCHMAKER_VERSION || undefined
const LOCAL_SERVER = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`
const isLocalPage = ['localhost', '127.0.0.1', ''].includes(window.location.hostname)

/** The endpoint to join through: a fixed URL, or a fresh one from the matchmaker. */
async function resolveServer() {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL
  const sdk = getSDK()
  if (GAME_ID && !isLocalPage && sdk?.net?.resolveEndpoint) {
    const { endpoint } = await sdk.net.resolveEndpoint(GAME_ID, MATCHMAKER_VERSION ? { version: MATCHMAKER_VERSION } : {})
    return endpoint
  }
  return LOCAL_SERVER
}

/** Fields mirrored into `useGameStore().me` for the HUD. */
const ME_FIELDS = [
  'name',
  'level',
  'xp',
  'totalJump',
  'wins',
  'rebirths',
  'boot',
  'bootsOwned',
  'tramps',
  'trail',
  'trailsOwned',
  'pass2xJump',
  'pass2xWins',
  'boostUntil',
  'bestStage',
  'stars',
  'goal',
  'goalTarget',
  'counters',
  'dailyAt',
  'dailyStreak',
  'chestAt',
  'sessionAt',
  'gifts',
]

/** Close codes from the server (see EscapeRoom). */
const TAKEN_OVER_CODE = 4001

let client = null
let room = null
let lastMeSignature = ''

export const getRoom = () => room
export const mySessionId = () => room?.sessionId ?? null

export function send(type, payload) {
  room?.send(type, payload)
}

/** What other players need to render our avatar (from the Bloxity session). */
export function avatarPayload(bloxity) {
  return JSON.stringify({
    equipped: bloxity.avatar || null,
    proportions: bloxity.proportions || null,
    pfp: bloxity.identity?.pfp || null,
  })
}

/** A stable id per browser for guests; Bloxity accounts use their own id. */
export function playerUid(user) {
  if (user?._id) return `bx:${user._id}`
  const KEY = 'double-jump-escape:uid'
  try {
    let uid = localStorage.getItem(KEY)
    if (!uid) {
      uid = `guest:${crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`
      localStorage.setItem(KEY, uid)
    }
    return uid
  } catch {
    return `guest:${Math.random().toString(36).slice(2)}`
  }
}

export async function joinGame({ name, uid, avatar }) {
  const store = gameState()
  if (store.phase === 'connecting') return null
  store.setPhase('connecting')
  try {
    // A new Client for every resolve: each matchmaker endpoint is pinned to one server.
    client = new Client(await resolveServer())
    room = await client.joinOrCreate(ROOM_NAME, { name, uid, avatar })
  } catch (err) {
    console.error('[net] join failed', err)
    store.setPhase('menu', { joinFailed: true })
    return null
  }

  wireRoom(room)
  room.send('hello')
  lastMeSignature = ''
  syncFromState()
  localPlayer.goHome()
  store.setPhase('playing', { joinFailed: false, everPlayed: true })
  return room
}

export async function leaveGame() {
  const current = room
  room = null
  useGameStore.setState({ me: null, panel: null })
  await current?.leave().catch(() => {})
  gameState().setPhase('menu')
}

function wireRoom(r) {
  const store = useGameStore

  r.onMessage('welcome', ({ isNew }) => {
    const sdk = getSDK()
    safeCall(sdk?.game?.updateRoom?.bind(sdk.game), r.roomId, '')
    if (isNew) gameState().queuePanel('welcome')
  })

  r.onMessage('daily', ({ streak, reward }) => {
    setTimeout(() => {
      gameState().queuePanel('daily', { streak, reward })
      sound.win()
    }, 1200)
  })

  r.onMessage('leaderboards', (boards) => store.setState({ leaderboards: boards }))

  r.onMessage('gain', ({ n, t }) => {
    spawnGainPopup(n, t > 1, t)
    sound.gain()
  })

  r.onMessage('levelup', (m) => {
    store.setState({ levelUp: { ...m, at: Date.now() } })
    sound.levelUp()
    confetti(40)
  })

  r.onMessage('reward', ({ wins, stage, stars = 0, before = 0, seconds, par }) => {
    spawnRewardPopup(`+${wins}`, 'wins')
    // Pads send you home right away: let the trophies rain once you're back in the lobby.
    setTimeout(() => rainWins(wins), 700)
    sound.win()
    sound.coin()
    // New stars for this stage: show all three, the new ones popping in.
    if (stars > before) setTimeout(() => spawnStarsPopup(stage, stars, before, seconds, par), 450)
  })

  r.onMessage('goal', ({ index, reward }) => {
    const me = gameState().me
    const goal = me ? goalAt(index, me, {}, me.goalTarget) : null
    store.setState({ goalDone: { text: goal?.text ?? '', reward, at: Date.now() } })
    spawnRewardPopup(describeReward(reward), 'reward')
    if (reward.wins) setTimeout(() => rainWins(reward.wins), 300)
    sound.goal()
    confetti(70)
  })

  r.onMessage('result', (m) => handleResult(m))

  r.onStateChange(() => syncFromState())

  r.onLeave((code) => {
    if (room !== r) return
    room = null
    const takenOver = code === TAKEN_OVER_CODE
    useGameStore.setState({ me: null, panel: null, panelQueue: [] })
    // Rejoins by itself (see AutoJoin) unless another window took this profile.
    gameState().setPhase('disconnected', { canRetry: !takenOver })
  })
}

/** Turns a server result code into the client's own feedback. */
function handleResult(m) {
  const state = gameState()

  if (m.action === 'checkpoint' && m.ok) {
    localPlayer.teleportTo({ x: m.x, y: m.y, z: m.z, yaw: m.yaw })
    state.closePanel()
    sound.whoosh()
    return
  }
  if (m.action === 'revive') {
    if (m.ok) {
      localPlayer.teleportTo({ x: m.x, y: m.y + 0.2, z: m.z, yaw: Math.PI, revive: true })
      useGameStore.setState({ death: null })
      sound.revive()
    } else if (m.code === 'poor') {
      state.toast(resultMessage(m).text, 'error')
      sound.error()
    } else {
      useGameStore.setState({ death: null })
      localPlayer.goHome()
    }
    return
  }
  if (m.action === 'pad' && !m.ok) {
    if (m.code === 'needPass') {
      state.openPanel('shop', { highlight: m.product })
      sound.error()
    } else if (m.code === 'locked') {
      state.toast(resultMessage(m).text, 'error')
    }
    // 'invalid' / 'tooFar': no reward this time, nothing to say.
    return
  }

  if (!m.ok) {
    const message = resultMessage(m)
    if (message) state.toast(message.text, message.kind)
    sound.error()
    return
  }

  if (m.reward) {
    spawnRewardPopup(describeReward(m.reward), m.reward.jump && !m.reward.wins ? 'jump' : 'reward')
    if (m.reward.wins) setTimeout(() => rainWins(m.reward.wins), 300)
  }
  const message = resultMessage(m)
  if (message) state.toast(message.text, message.kind)
  if (m.code === 'rebirth') {
    sound.rebirth()
    confetti(120)
    state.closePanel()
  } else if (m.code === 'claimed' || m.code === 'redeemed') {
    sound.win()
  } else {
    sound.buy()
  }
}

function syncFromState() {
  if (!room) return
  const player = room.state.players?.get(room.sessionId)
  if (!player) return
  const snapshot = {}
  for (const field of ME_FIELDS) snapshot[field] = player[field]
  const signature = JSON.stringify(snapshot)
  const count = room.state.players.size
  const state = gameState()
  if (signature !== lastMeSignature) {
    lastMeSignature = signature
    useGameStore.setState({ me: snapshot })
  }
  if (state.playerCount !== count) useGameStore.setState({ playerCount: count })
  if (state.hydraLeft !== room.state.hydraLeft) useGameStore.setState({ hydraLeft: room.state.hydraLeft })
}

/** Cached parse of each player's avatar JSON (it rarely changes). */
const avatarCache = new Map()
export function parseAvatar(json) {
  if (!json) return {}
  let value = avatarCache.get(json)
  if (!value) {
    try {
      value = JSON.parse(json) || {}
    } catch {
      value = {}
    }
    avatarCache.set(json, value)
  }
  return value
}
