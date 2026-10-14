import { useEffect, useRef, useState } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { avatarPayload, joinGame, leaveGame, playerUid } from '../net/connection'
import { gameState, useGameStore } from '../store/gameStore'

/**
 * Gets the player into a lobby with no screen of our own: the Bloxity host
 * page already shows a loading screen, so this only tells it what's happening
 * (`loadingStep`) and lifts it (`loadingEnd`) once the player is in the lobby.
 *
 * A signed-in Bloxity player joins with their account, anyone else as a guest.
 * Dropped connections rejoin by themselves, quietly — nothing from the server
 * is ever shown as text.
 */

/** How long to wait for the Bloxity SDK before playing as a guest. */
const ACCOUNT_TIMEOUT_MS = 8000
const RETRY_MS = 3000

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

/** Who to join as; dev builds can force a throwaway test profile with ?autoplay&name=&uid=. */
function joinIdentity(bloxity) {
  const params = new URLSearchParams(window.location.search)
  if (import.meta.env.DEV && params.has('autoplay')) {
    return {
      name: params.get('name') || 'Tester',
      uid: params.get('uid') ? `test:${params.get('uid')}` : playerUid(null),
    }
  }
  const { identity, user } = bloxity
  return { name: identity?.displayName || identity?.username || 'Guest', uid: playerUid(user) }
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
      const who = joinIdentity(bloxityRef.current)
      joinedUid.current = who.uid
      joinGame({ ...who, avatar: avatarPayload(bloxityRef.current) })
    }, delay)
    return () => clearTimeout(timer)
  }, [readyToJoin, waiting, joinFailed, phase])

  // Signing in (or out) of Bloxity mid-game switches to that profile.
  const accountUid = accountReady ? joinIdentity(bloxity).uid : null
  useEffect(() => {
    if (phase !== 'playing' || !accountUid || !joinedUid.current) return
    if (accountUid !== joinedUid.current) leaveGame()
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
