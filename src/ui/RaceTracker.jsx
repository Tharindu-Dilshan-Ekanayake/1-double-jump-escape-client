import { useEffect, useRef, useState } from 'react'

import { localPlayer } from '../game/playerState'
import { getRoom, parseAvatar } from '../net/connection'
import { STAGES } from '../shared/gameData.js'
import { courseProgress, getLayout } from '../shared/layout.js'
import { useGameStore } from '../store/gameStore'

/**
 * The live race tracker under the goals banner: the whole course as one bar
 * (20 stage ticks, a lava fill up to where you are), with every player in the
 * lobby as a little head gliding along it by their real distance.
 *
 * React only renders the structure (who's in the lobby, which tick is current).
 * A requestAnimationFrame loop moves the dots, streaks and fill straight on the
 * DOM, so the race stays smooth without re-rendering 60 times a second.
 */

const COUNT = STAGES.length
const DOT_COLORS = ['#ff6b6b', '#ffd23a', '#5fe08a', '#5fb8ff', '#d27bff', '#ff9a1f', '#3ff0e0', '#ff7ac8']
/** A stage counts as "reached" once you're on its plateau. */
const FEED_MS = 3400
/** At most one feed message this often, and one per player this often. */
const FEED_GAP_MS = 3500
const FEED_PLAYER_GAP_MS = 10_000
/** How far (in stages) someone has to get ahead before "passed you" counts. */
const PASS_MARGIN = 0.15

function colorFor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return DOT_COLORS[h % DOT_COLORS.length]
}

/** Everyone in the room, local player included: [{ sid, isMe }]. Polled, not per frame. */
function useRacers() {
  const [racers, setRacers] = useState([])
  useEffect(() => {
    const read = () => {
      const room = getRoom()
      const next = []
      room?.state.players?.forEach((p, sid) => {
        next.push({ sid, isMe: sid === room.sessionId, name: p.name, pfp: parseAvatar(p.avatar).pfp || null })
      })
      setRacers((prev) => {
        const same = prev.length === next.length && prev.every((r, i) => r.sid === next[i].sid && r.pfp === next[i].pfp && r.name === next[i].name)
        return same ? prev : next
      })
    }
    read()
    const timer = setInterval(read, 400)
    return () => clearInterval(timer)
  }, [])
  return racers
}

function stageLabel(progress) {
  if (progress <= 0.001) return 'In the lobby'
  const index = Math.min(COUNT, Math.max(1, Math.ceil(progress - 1e-6)))
  const def = STAGES[index - 1]
  return `${def.icon} Stage ${index} · ${def.name}`
}

export function RaceTracker() {
  const racers = useRacers()
  const stage = useGameStore((s) => s.stage)
  const best = useGameStore((s) => s.me?.bestStage ?? 0)
  const [tip, setTip] = useState(null)
  const [feed, setFeed] = useState([])

  const barRef = useRef(null)
  const fillRef = useRef(null)
  const rankRef = useRef(null)
  /** sid -> { el, streak, tip, shown, vel, runBest, ahead, bounceAt } */
  const dots = useRef(new Map())
  const feedState = useRef({ lastAt: 0, perPlayer: new Map(), id: 0 })

  // Feed messages ("Nimal reached Stage 7!"), rate-limited.
  const pushFeed = useRef((sid, icon, text, kind = 'info') => {
    const now = performance.now()
    const state = feedState.current
    if (now - state.lastAt < FEED_GAP_MS) return
    if (sid && now - (state.perPlayer.get(sid) ?? -1e9) < FEED_PLAYER_GAP_MS) return
    state.lastAt = now
    if (sid) state.perPlayer.set(sid, now)
    const id = ++state.id
    setFeed((list) => [...list.slice(-1), { id, icon, text, kind }])
    setTimeout(() => setFeed((list) => list.filter((f) => f.id !== id)), FEED_MS)
  })

  useEffect(() => {
    const layout = getLayout()
    let raf = 0
    let last = performance.now()
    let lastRank = ''

    const frame = (nowMs) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (nowMs - last) / 1000)
      last = nowMs
      const room = getRoom()
      const bar = barRef.current
      if (!room || !bar) return
      const width = bar.clientWidth
      const ease = 1 - Math.exp(-dt * 7)

      let mine = 0
      const standings = []
      room.state.players.forEach((p, sid) => {
        const isMe = sid === room.sessionId
        const z = isMe ? localPlayer.position.z : p.z
        const target = courseProgress(layout, z)
        if (isMe) mine = target
        standings.push({ sid, isMe, target, name: p.name })
      })

      for (const s of standings) {
        const d = dots.current.get(s.sid)
        if (!d?.el) continue
        // Glide: ease towards the target, snapping on teleports (big jumps).
        const jump = Math.abs(s.target - d.shown)
        const before = d.shown
        d.shown = jump > 3 ? s.target : d.shown + (s.target - d.shown) * ease
        const speed = Math.abs(d.shown - before) / Math.max(dt, 1e-3)
        d.vel += (speed - d.vel) * Math.min(1, dt * 8)

        // A stage cleared this run: bounce, and tell the lobby about it.
        const reached = Math.floor(s.target + 1e-6)
        if (s.target <= 0.001) d.runBest = 0
        else if (reached > d.runBest) {
          if (d.runBest > 0 || reached >= 1) d.bounceAt = nowMs
          if (!s.isMe && reached >= 2) pushFeed.current(s.sid, STAGES[reached - 1].icon, `${s.name} reached Stage ${reached}!`)
          d.runBest = reached
        }

        // Passing: compare with the local player while both are on the course.
        if (!s.isMe && mine > 0.5 && s.target > 0.5) {
          const ahead = s.target > mine + PASS_MARGIN ? 1 : s.target < mine - PASS_MARGIN ? -1 : d.ahead
          if (d.ahead === -1 && ahead === 1) pushFeed.current(s.sid, '💨', `${s.name} passed you!`, 'warn')
          else if (d.ahead === 1 && ahead === -1) pushFeed.current(s.sid, '⚡', `You passed ${s.name}!`, 'good')
          d.ahead = ahead
        } else if (!s.isMe) d.ahead = s.target > mine ? 1 : -1

        const x = (Math.min(COUNT, d.shown) / COUNT) * width
        const bounce = nowMs - d.bounceAt < 600 ? Math.sin(((nowMs - d.bounceAt) / 600) * Math.PI) * -9 : 0
        d.el.style.transform = `translate(${x.toFixed(1)}px, ${bounce.toFixed(1)}px)`
        const streak = Math.min(70, d.vel * width * 0.004)
        d.streak.style.width = `${streak.toFixed(1)}px`
        d.streak.style.opacity = streak > 3 ? Math.min(0.9, streak / 30).toFixed(2) : '0'
        if (s.isMe && fillRef.current) fillRef.current.style.width = `${((Math.min(COUNT, d.shown) / COUNT) * 100).toFixed(2)}%`
      }

      // "You are #3 of 6" (only worth saying with company).
      const me = standings.find((s) => s.isMe)
      let rank = ''
      if (me && standings.length > 1) {
        const place = 1 + standings.filter((s) => !s.isMe && s.target > me.target + 1e-3).length
        rank = `You are #${place} of ${standings.length}`
      }
      if (rank !== lastRank && rankRef.current) {
        lastRank = rank
        rankRef.current.textContent = rank
        rankRef.current.style.display = rank ? '' : 'none'
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Forget dots of players who left.
  useEffect(() => {
    const keep = new Set(racers.map((r) => r.sid))
    for (const sid of dots.current.keys()) if (!keep.has(sid)) dots.current.delete(sid)
  }, [racers])

  const bind = (sid) => (el) => {
    if (!el) return
    const entry = dots.current.get(sid) ?? { shown: 0, vel: 0, runBest: 0, ahead: 0, bounceAt: -1e9 }
    entry.el = el
    entry.streak = el.querySelector('.race-streak')
    dots.current.set(sid, entry)
  }

  const current = stage || 0
  return (
    <div className="race-tracker pointer-events-none">
      <div className="race-head">
        <span className="race-stage game-text">{stageLabel(current)}</span>
        <span ref={rankRef} className="race-rank game-text" style={{ display: 'none' }} />
      </div>
      <div className="race-rail">
        <span className="race-home" title="Lobby">🏠</span>
        <div ref={barRef} className="race-bar">
          <div ref={fillRef} className="race-fill" />
          {STAGES.map((def, i) => (
            <span
              key={def.name}
              className={`race-tick ${i + 1 <= best ? 'is-beaten' : ''} ${i + 1 === current ? 'is-current' : ''}`}
              style={{ left: `${((i + 1) / COUNT) * 100}%` }}
            >
              {i + 1 === current && <span className="race-tick-icon">{def.icon}</span>}
            </span>
          ))}
          {racers.map((r) => (
            <button
              key={r.sid}
              ref={bind(r.sid)}
              type="button"
              className={`race-dot ${r.isMe ? 'is-me' : ''}`}
              style={{ '--dot': colorFor(r.name), zIndex: r.isMe ? 5 : 2 }}
              onPointerEnter={() => setTip(r.sid)}
              onPointerLeave={() => setTip((t) => (t === r.sid ? null : t))}
              onPointerDown={(e) => {
                e.stopPropagation()
                setTip((t) => (t === r.sid ? null : r.sid))
              }}
              aria-label={r.name}
            >
              <span className="race-streak" />
              <span className="race-head-img">{r.pfp ? <img src={r.pfp} alt="" draggable={false} /> : (r.name || '?').charAt(0).toUpperCase()}</span>
              {tip === r.sid && <RaceTip sid={r.sid} isMe={r.isMe} name={r.name} />}
            </button>
          ))}
        </div>
        <span className="race-goal" title="The Escape">🏆</span>
      </div>
      <div className="race-feed">
        {feed.map((f) => (
          <div key={f.id} className={`race-feed-item race-${f.kind} game-text`}>
            <span>{f.icon}</span> {f.text}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Name + where they are, shown on hover / tap. */
function RaceTip({ sid, isMe, name }) {
  const room = getRoom()
  const p = room?.state.players?.get(sid)
  const z = isMe ? localPlayer.position.z : p?.z ?? 0
  return (
    <span className="race-tip game-text">
      {isMe ? 'You' : name}
      <span className="race-tip-sub">{stageLabel(courseProgress(getLayout(), z))}</span>
    </span>
  )
}

export default RaceTracker
