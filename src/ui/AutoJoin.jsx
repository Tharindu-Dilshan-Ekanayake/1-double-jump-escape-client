import { useEffect, useRef, useState } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { getToken, takeLaunchRoomId } from '../bloxity/boxity'
import { authFailureCount, avatarPayload, joinGame, playerUid, rejoinAs } from '../net/connection'
import { gameState, useGameStore } from '../store/gameStore'

/**
 * Gets the player into a lobby with no screen of our own: the Bloxity host
 * page already shows a loading screen, so this only tells it what's happening
 * (`loadingStep`) and lifts it (`loadingEnd`) once the player is in the lobby.
 *
 * A signed-in Bloxity player joins with their account (the server checks
 * their token with Boxity), anyone else as a guest. The first join goes to
 * the room in ?roomId= when there is one (a friend's invite, Boxity's Open
 * Rooms); signing in mid-game rejoins the same room. Dropped connections
 * rejoin by themselves, quietly — nothing from the server is ever shown as
 * text.
 */

/** How long to wait for the Bloxity SDK before playing as a guest. */
const ACCOUNT_TIMEOUT_MS = 8000
const RETRY_MS = 3000
/** Refused tokens in a row before playing as a guest instead (Boxity unreachable from the server). */
const AUTH_TRIES = 2

function useFontsLoaded() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    let alive = true
    const finish = () => alive && setDone(true)
    document.fonts.ready.then(finish, finish)
    const timer = setTimeout(finish, 3000)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  return done
}

/** Browsers only allow sound after a click or key press; start it on the first one. */
function useUnlockSoundOnFirstInput() {
  useEffect(() => {
    const unlock = () => {
      sound.unlock()
      const { settings } = gameState()
      sound.setSfxVolume(settings.sfxVolume)
      sound.setMusicVolume(settings.musicVolume)
      sound.setMasterVolume(settings.masterVolume ?? 1)
      sound.setSfx(settings.sfx)
      sound.setMusic(settings.music)
      remove()
    }
    const events = ['pointerdown', 'keydown', 'touchstart']
    const remove = () => events.forEach((e) => window.removeEventListener(e, unlock, true))
    events.forEach((e) => window.addEventListener(e, unlock, true))
    return remove
  }, [])
}

/**
 * Who to join as. Signed in: the Boxity token (the server takes the account
 * from it) and this browser's guest id. Dev builds can force a throwaway test
 * profile with ?autoplay&name=&uid=.
 */
function joinIdentity(bloxity, { asGuest = false } = {}) {
  const params = new URLSearchParams(window.location.search)
  if (import.meta.env.DEV && params.has('autoplay')) {
    return {
      name: params.get('name') || 'Tester',
      uid: params.get('uid') ? `test:${params.get('uid')}` : playerUid(null),
    }
  }
  const { identity, user } = bloxity
  const name = identity?.displayName || identity?.username || 'Guest'
  const token = user && !asGuest ? getToken() : undefined
  if (!token) return { name, uid: playerUid(null) }
  return { name, uid: playerUid(user), token, guest: playerUid(null) }
}

export function AutoJoin() {
  const phase = useGameStore((s) => s.phase)
  const joinFailed = useGameStore((s) => s.joinFailed)
  const canRetry = useGameStore((s) => s.canRetry)
  const worldReady = useGameStore((s) => s.worldReady)
  const everPlayed = useGameStore((s) => s.everPlayed)
  const bloxity = useBloxity()
  const fontsLoaded = useFontsLoaded()
  useUnlockSoundOnFirstInput()

  const [accountTimedOut, setAccountTimedOut] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setAccountTimedOut(true), ACCOUNT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])
  const accountReady = bloxity.status === 'ready' || bloxity.status === 'error' || accountTimedOut

  // Join as soon as everything else is ready, and again after a dropped
  // connection (but not when another window took over this profile).
  const bloxityRef = useRef(bloxity)
  const joinedUid = useRef(null)
  useEffect(() => {
    bloxityRef.current = bloxity
  })
  const readyToJoin = fontsLoaded && accountReady && worldReady
  const waiting = phase === 'menu' || (phase === 'disconnected' && canRetry)
  useEffect(() => {
    if (!readyToJoin || !waiting) return undefined
    const delay = phase === 'disconnected' ? 600 : joinFailed ? RETRY_MS : 0
    const timer = setTimeout(() => {
      // Boxity keeps refusing the token (from the server's side): play as a guest for now.
      const asGuest = authFailureCount() >= AUTH_TRIES
      const who = joinIdentity(bloxityRef.current, { asGuest })
      joinedUid.current = joinIdentity(bloxityRef.current).uid
      joinGame({ ...who, avatar: avatarPayload(bloxityRef.current), roomId: takeLaunchRoomId() })
    }, delay)
    return () => clearTimeout(timer)
  }, [readyToJoin, waiting, joinFailed, phase])

  // Signing in (or out) of Bloxity mid-game switches to that profile, in the same room.
  const accountUid = accountReady ? joinIdentity(bloxity).uid : null
  useEffect(() => {
    if (phase !== 'playing' || !accountUid || !joinedUid.current) return
    if (accountUid === joinedUid.current) return
    joinedUid.current = accountUid
    const current = bloxityRef.current
    rejoinAs({ ...joinIdentity(current), avatar: avatarPayload(current) })
  }, [phase, accountUid])

  // Keep the host page's loading screen informed, and lift it once we're in.
  let step = null
  if (!fontsLoaded || !worldReady) step = 'Building the world…'
  else if (!accountReady) step = 'Signing in…'
  else if (phase !== 'playing') step = 'Finding a lobby…'
  const { game } = bloxity
  useEffect(() => {
    if (step) game.loadingStep(step)
  }, [step, game])
  const loadingEnded = useRef(false)
  useEffect(() => {
    if (phase !== 'playing' || loadingEnded.current) return
    loadingEnded.current = true
    game.loadingEnd()
  }, [phase, game])

  // A dropped connection shows only a small spinner while it rejoins.
  if (phase === 'playing' || !everPlayed) return null
  return <div className="reconnect-spinner pointer-events-none fixed right-4 top-[86px] z-40" aria-hidden="true" />
}

export default AutoJoin
