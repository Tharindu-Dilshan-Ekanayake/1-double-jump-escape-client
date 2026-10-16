import { Client } from '@colyseus/sdk'

import { Vector3 } from 'three'

import { sound } from '../audio/sound'
import { locateRoom, publicRoomId, relayOf, reportRoom, resetPresence, resolveServer, setPlaying, trackPresence } from '../bloxity/boxity'
import { burst } from '../game/burst'
import { characterRoots } from '../game/characterRoots'
import { ringBurst } from '../game/fx/rings'
import { localPlayer } from '../game/playerState'
import { ROOM_NAME, TITLES, describeReward, gainBreakdown } from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import { reportGains } from '../store/progression'
import { confetti, spawnGainPopup, spawnLuckyPopup, spawnRewardPopup, spawnStarsPopup } from '../ui/fx'
import { resultMessage } from '../ui/messages'
import { rainWins } from '../ui/winsRain'

/**
 * Colyseus connection.
 *
 * `joinOrCreate` puts the player in any lobby with a free seat; Colyseus locks a
 * room at 8 players, so the 9th player automatically gets a brand new lobby.
 *
 * Where the game server is (see bloxity/boxity.js): through the Boxity
 * matchmaker on Boxity hosting (a fresh endpoint and Client for every join),
 * VITE_SERVER_URL or ws://<this host>:2567 for local testing. A particular
 * room (a friend's invite, Boxity's Open Rooms, signing in mid-game) is joined
 * by id when it is still there.
 *
 * Signed-in players send their Boxity token; the server checks it with Boxity
 * and never takes an account id from the client.
 *
 * Nothing the server says is shown as text: messages carry numbers and codes,
 * and the client turns them into its own popups (see ui/messages.js).
 */

/** The server turned the Boxity token down (see EscapeRoom.onAuth). */
const AUTH_FAILED = 401

/** Fields mirrored into `useGameStore().me` for the HUD. */
const ME_FIELDS = [
  'name',
  'level',
  'xp',
  'rebirths',
  'wins',
  'totalJump',
  'lifetimeLevels',
  'boot',
  'bootsOwned',
  'perkGain',
  'perkWins',
  'perkSpeed',
  'perkLuck',
  'perkSlots',
  'pets',
  'petsEquipped',
  'padsOwned',
  'trail',
  'trailsOwned',
  'pass2xJump',
  'pass2xWins',
  'boostUntil',
  'bestStage',
  'stars',
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
/** Where the current room is: { endpoint, relayRoomId, roomId }. */
let joined = null
let lastMeSignature = ''
/** Player count the friend notices last looked at. */
let presenceCount = -1
/** Joins in a row the server refused the Boxity token for. */
let authFailures = 0
export const authFailureCount = () => authFailures

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

/**
 * Joins a lobby. `token` (signed in) is the Boxity token and `guest` this
 * browser's guest id, whose save a first-time account takes over. `roomId` is
 * a public room id to try first (see publicRoomId).
 */
export async function joinGame(identity) {
  const store = gameState()
  if (store.phase === 'connecting') return null
  store.setPhase('connecting')
  return connect(identity)
}

async function connect({ name, uid, avatar, token, guest, roomId = null }) {
  const store = gameState()
  const options = { name, uid, avatar, ...(token ? { token, guest } : {}) }
  try {
    room = null
    const target = roomId ? await locateRoom(roomId) : null
    if (target) {
      try {
        client = new Client(target.endpoint)
        room = await client.joinById(target.roomId, options)
        joined = { endpoint: target.endpoint, relayRoomId: relayOf(target.endpoint), roomId: room.roomId }
      } catch (err) {
        if (err?.code === AUTH_FAILED) throw err
        console.warn('[net] that room is gone or full; finding another', err?.message ?? err)
        room = null
      }
    }
    if (!room) {
      // A new Client for every resolve: each matchmaker endpoint is pinned to one server.
      const { endpoint, relayRoomId } = await resolveServer()
      client = new Client(endpoint)
      room = await client.joinOrCreate(ROOM_NAME, options)
      joined = { endpoint, relayRoomId, roomId: room.roomId }
    }
  } catch (err) {
    authFailures = err?.code === AUTH_FAILED ? authFailures + 1 : 0
    console.error('[net] join failed', err)
    store.setPhase('menu', { joinFailed: true })
    return null
  }

  authFailures = 0
  wireRoom(room)
  room.send('hello')
  lastMeSignature = ''
  presenceCount = -1
  resetPresence()
  syncFromState()
  localPlayer.goHome()
  store.setPhase('playing', { joinFailed: false, everPlayed: true })
  setPlaying(true)
  return room
}

/** The public id of the room we're in (null when not in one). */
export const currentRoomId = () => (room && joined ? publicRoomId(joined.roomId, joined.relayRoomId) : null)

export async function leaveGame() {
  const current = room
  room = null
  joined = null
  reportRoom('')
  setPlaying(false)
  useGameStore.setState({ me: null, panel: null })
  await current?.leave().catch(() => {})
  gameState().setPhase('menu')
}

/**
 * Signing in (or out) mid-game: back into the same room under the new
 * identity, so friends stay together; anywhere else only if it's gone.
 */
export async function rejoinAs(identity) {
  if (gameState().phase === 'connecting') return null
  const back = currentRoomId()
  const current = room
  room = null
  joined = null
  reportRoom('')
  setPlaying(false)
  // Stays 'connecting' throughout, so nothing else starts a join meanwhile.
  gameState().setPhase('connecting')
  useGameStore.setState({ me: null, panel: null })
  await current?.leave().catch(() => {})
  return connect({ ...identity, roomId: back })
}

function wireRoom(r) {
  const store = useGameStore

  r.onMessage('welcome', ({ isNew }) => {
    // Friends can now join us here (Boxity invites and Join buttons).
    if (room === r && joined) reportRoom(publicRoomId(joined.roomId, joined.relayRoomId))
    if (isNew) gameState().queuePanel('welcome')
  })

  r.onMessage('daily', ({ streak, reward }) => {
    setTimeout(() => {
      gameState().queuePanel('daily', { streak, reward })
      sound.win()
    }, 1200)
  })

  r.onMessage('leaderboards', (boards) => store.setState({ leaderboards: boards }))

  // XP the server paid for steps and jumps (every half second): a star and the
  // number (already times your boots and the rest), lucky ones, the pad chip.
  r.onMessage('gain', (m) => {
    reportGains(m)
    if (m.lucky) {
      spawnLuckyPopup(m.n)
      sound.lucky()
      store.setState({ luckyAt: Date.now() })
    } else {
      spawnGainPopup(m.n, gainBreakdown(gameState().me ?? {}).boost > 1)
    }
    sound.gain()
  })

  r.onMessage('levelup', (m) => {
    store.setState({ levelUp: { ...m, at: Date.now() } })
    sound.levelUp()
    confetti(40)
    // A new title (from lifetime levels): its own pop-up and a cheer.
    if (m.title !== null && m.title !== undefined) {
      setTimeout(() => {
        store.setState({ titleUp: { index: m.title, title: TITLES[m.title], at: Date.now() } })
        sound.cheer()
        confetti(90)
      }, 900)
    }
  })

  // Other players levelling up, rebirthing, finishing stages, getting titles:
  // the feed line, and a burst over them when they're in view.
  r.onMessage('feed', (m) => {
    store.setState({ feedEvent: { ...m, at: Date.now() } })
    celebrate(m)
  })

  // Earned while away (30% of your best jump pad, up to 8 hours).
  r.onMessage('offline', (m) => {
    setTimeout(() => gameState().queuePanel('offline', m), 600)
  })

  r.onMessage('afkBoost', ({ minutes }) => {
    gameState().toast(`⚡ AFK bonus! 2x XP for ${minutes} min`, 'success', 3600)
    sound.win()
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

  r.onMessage('result', (m) => handleResult(m))

  r.onStateChange(() => syncFromState())

  r.onLeave((code) => {
    if (room !== r) return
    room = null
    joined = null
    reportRoom('')
    setPlaying(false)
    const takenOver = code === TAKEN_OVER_CODE
    useGameStore.setState({ me: null, panel: null, panelQueue: [] })
    // Rejoins by itself (see AutoJoin) unless another window took this profile.
    gameState().setPhase('disconnected', { canRetry: !takenOver })
  })
}

const _celebrate = new Vector3()
const CELEBRATE_COLORS = { rebirth: '#ff5fa8', title: '#b98bff', level: '#ffd23a' }

/** Another player's big moment: a ring and a shower of sparks over them, if they're near. */
function celebrate(m) {
  const root = m.sid ? characterRoots.get(m.sid) : null
  if (!root || root.position.distanceTo(localPlayer.position) > 140) return
  const color = CELEBRATE_COLORS[m.kind] ?? '#7fd4ff'
  ringBurst(root.position, { color, radius: 6, life: 0.6 })
  burst(_celebrate.set(root.position.x, root.position.y + 3, root.position.z), {
    colors: [color, '#ffffff', '#ffd23a'],
    count: 26,
    speed: 8,
    up: 7,
    life: 0.9,
    gravity: 8,
    size: 0.9,
  })
}

/** Turns a server result code into the client's own feedback. */
function handleResult(m) {
  const state = gameState()

  if (m.action === 'world') {
    if (m.ok) {
      localPlayer.teleportTo({ x: m.x, y: m.y, z: m.z, yaw: m.yaw, home: true })
      state.closePanel()
      sound.whoosh()
    } else sound.error()
    return
  }
  if (m.action === 'checkpoint' && m.ok) {
    localPlayer.teleportTo({ x: m.x, y: m.y, z: m.z, yaw: m.yaw })
    state.closePanel()
    sound.whoosh()
    return
  }
  if (m.action === 'respawn') {
    // Back at the last checkpoint (or home, if the server didn't agree).
    if (m.ok) localPlayer.teleportTo({ x: m.x, y: m.y, z: m.z, yaw: m.yaw, revive: true })
    else localPlayer.goHome()
    useGameStore.setState({ death: null })
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

  if (m.code === 'hatched') {
    gameState().openPanel('hatch', { egg: m.id, pet: m.pet, at: Date.now() })
    sound.hatch()
    return
  }
  if (m.reward) {
    spawnRewardPopup(describeReward(m.reward), m.reward.xp && !m.reward.wins ? 'jump' : 'reward')
    if (m.reward.wins) setTimeout(() => rainWins(m.reward.wins), 300)
  }
  const message = resultMessage(m)
  if (message) state.toast(message.text, message.kind)
  if (m.code === 'rebirth') {
    sound.rebirth()
    confetti(120)
    state.closePanel()
  } else if (m.code === 'claimed') {
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
  // Boxity's friend notices: who was here when we came, then each newcomer.
  if (count !== presenceCount) {
    presenceCount = count
    const names = []
    room.state.players.forEach((p, sid) => {
      if (sid !== room.sessionId && p.username) names.push(p.username)
    })
    trackPresence(names)
  }
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
