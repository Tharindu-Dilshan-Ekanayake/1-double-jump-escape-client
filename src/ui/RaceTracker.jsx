import { useEffect, useRef, useState } from 'react'

import { localPlayer } from '../game/playerState'
import { getRoom, parseAvatar } from '../net/connection'
import { MAX_STARS, STAGES, TITLES, WORLDS, starsOf } from '../shared/gameData.js'
import { courseProgress, getLayout } from '../shared/layout.js'
import { useGameStore } from '../store/gameStore'

/**
 * The live race tracker under the goals banner, styled like the original:
 * numbered, colour-coded stage circles on a line, three stars under each,
 * and every player in the lobby as a small avatar head riding the line by
 * their real distance along the course (yours is the big gold one).
 *
 * Ten stages show at a time (1-10, then 11-20 once you're past Stage 10).
 * React only renders the structure; a requestAnimationFrame loop moves the
 * heads, streaks and fill straight on the DOM, so the race stays smooth
 * without re-rendering every frame.
 */

const COUNT = STAGES.length
const PAGE = 10
const DOT_COLORS = ['#ff6b6b', '#ffd23a', '#5fe08a', '#5fb8ff', '#d27bff', '#ff9a1f', '#3ff0e0', '#ff7ac8']
/** Node colours, like the original's (rainbow for the special ones). */
const NODE_COLORS = {
  brick: '#6f74e8',
  red: '#f25c5c',
  lava: '#e8433a',
  shark: '#1f6fa8',
  spike: '#2f3a8c',
  ice: '#2f9cf6',
  candy: 'rainbow',
  jungle: '#2f9e3a',
  neon: '#b13fe0',
  volcano: '#d8302c',
  cloud: '#5fb8ff',
  toxic: '#8fd12f',
  haunted: '#7a4dff',
  crystal: '#b07bff',
  factory: '#7d8597',
  sakura: '#ff7ac8',
  magma: '#ff5a1f',
  space: '#1d2a6b',
  galaxy: '#9b5cff',
  golden: 'rainbow',
}
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

const nodeBackground = (color) =>
  color === 'rainbow' ? 'conic-gradient(#ff3b3b, #ffd23a, #3bd16b, #3ba8ff, #a03bff, #ff3b3b)' : color

/** Everyone in the room, local player included. Polled, not per frame. */
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
  const lobby = WORLDS.find((w) => Math.abs(progress - (w.firstStage - 1)) < 0.001)
  if (lobby) return lobby.id === 1 ? 'In the lobby' : `${lobby.icon} ${lobby.name} lobby`
  const index = Math.min(COUNT, Math.max(1, Math.ceil(progress - 1e-6)))
  const def = STAGES[index - 1]
  return `${def.icon} Stage ${index} · ${def.name}`
}

export function RaceTracker() {
  const racers = useRacers()
  const stage = useGameStore((s) => s.stage)
  const me = useGameStore((s) => s.me)
  const [tip, setTip] = useState(null)
  const [feed, setFeed] = useState([])

  // One page per world: World 1 is stages 1-10, World 2 stages 11-20.
  const world = useGameStore((s) => s.world)
  const page = Math.max(0, Math.min(Math.ceil(STAGES.length / PAGE) - 1, stage ? Math.ceil(stage / PAGE) - 1 : world - 1))
  const pageRef = useRef(page)
  useEffect(() => {
    pageRef.current = page
  }, [page])

  const lineRef = useRef(null)
  const fillRef = useRef(null)
  const rankRef = useRef(null)
  /** sid -> { el, streak, shown, vel, runBest, ahead, bounceAt } */
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

  // What the server tells the lobby: rebirths, new titles, jump unlocks and MAX
  // levels. (Stages come from the course itself, below.)
  const feedEvent = useGameStore((s) => s.feedEvent)
  useEffect(() => {
    if (!feedEvent) return
    const { kind, name, value } = feedEvent
    const who = `name:${name}`
    if (kind === 'rebirth') pushFeed.current(who, '🔄', `${name} rebirthed! (x${2 ** value} XP)`, 'good')
    else if (kind === 'title') pushFeed.current(who, '🏅', `${name} is now a ${TITLES[value]?.name ?? 'Legend'}!`, 'good')
    else if (kind === 'level' && feedEvent.max) pushFeed.current(who, '⭐', `${name} hit MAX level ${value}!`)
    else if (kind === 'level') pushFeed.current(who, '🦘', `${name} unlocked ${feedEvent.jumps} jumps!`)
  }, [feedEvent])

  useEffect(() => {
    const layout = getLayout()
    let raf = 0
    let last = performance.now()
    let lastRank = ''
    // The line's width, kept by a ResizeObserver: reading clientWidth every frame
    // (right after writing styles) forced a layout each frame.
    let width = 0
    let observed = null
    const resize = new ResizeObserver(() => {
      width = observed?.clientWidth ?? width
    })
    /** Sets a style only when it changes (each write can cost a style recalc). */
    const setStyle = (el, key, value) => {
      if (el.style[key] !== value) el.style[key] = value
    }

    const frame = (nowMs) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (nowMs - last) / 1000)
      last = nowMs
      const room = getRoom()
      const line = lineRef.current
      if (!room || !line) return
      if (line !== observed) {
        if (observed) resize.unobserve(observed)
        observed = line
        resize.observe(line)
        width = line.clientWidth
      }
      const ease = 1 - Math.exp(-dt * 7)
      const offset = pageRef.current * PAGE

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
        const before = d.shown
        d.shown = Math.abs(s.target - d.shown) > 3 ? s.target : d.shown + (s.target - d.shown) * ease
        const speed = Math.abs(d.shown - before) / Math.max(dt, 1e-3)
        d.vel += (speed - d.vel) * Math.min(1, dt * 8)

        // A stage cleared this run: bounce, and tell the lobby about it.
        const reached = Math.floor(s.target + 1e-6)
        if (s.target <= 0.001) d.runBest = 0
        else if (reached > d.runBest) {
          d.bounceAt = nowMs
          if (!s.isMe && reached >= 2) pushFeed.current(s.sid, STAGES[reached - 1].icon, `${s.name} reached Stage ${reached}!`)
          d.runBest = reached
        }

        // Passing: compared with the local player while both are on the course.
        if (!s.isMe && mine > 0.5 && s.target > 0.5) {
          const ahead = s.target > mine + PASS_MARGIN ? 1 : s.target < mine - PASS_MARGIN ? -1 : d.ahead
          if (d.ahead === -1 && ahead === 1) pushFeed.current(s.sid, '💨', `${s.name} passed you!`, 'warn')
          else if (d.ahead === 1 && ahead === -1) pushFeed.current(s.sid, '⚡', `You passed ${s.name}!`, 'good')
          d.ahead = ahead
        } else if (!s.isMe) d.ahead = s.target > mine ? 1 : -1

        // Slot 0 is the page's start (the lobby on page 1), slot 10 its last stage.
        const slot = d.shown - offset
        const clamped = Math.max(0, Math.min(PAGE, slot))
        const x = (clamped / PAGE) * width
        const bounce = nowMs - d.bounceAt < 600 ? Math.sin(((nowMs - d.bounceAt) / 600) * Math.PI) * -10 : 0
        setStyle(d.el, 'transform', `translate(${x.toFixed(1)}px, ${bounce.toFixed(1)}px)`)
        const off = slot < -0.01 || slot > PAGE + 0.01
        if (d.el.classList.contains('is-off') !== off) d.el.classList.toggle('is-off', off)
        const streak = Math.min(60, d.vel * width * 0.006)
        setStyle(d.streak, 'width', `${streak.toFixed(1)}px`)
        setStyle(d.streak, 'opacity', streak > 3 ? Math.min(0.9, streak / 26).toFixed(2) : '0')
        if (s.isMe && fillRef.current) setStyle(fillRef.current, 'width', `${((clamped / PAGE) * 100).toFixed(2)}%`)
      }

      // "#3 of 6" (only worth saying with company).
      const meRow = standings.find((s) => s.isMe)
      let rank = ''
      if (meRow && standings.length > 1) {
        const place = 1 + standings.filter((s) => !s.isMe && s.target > meRow.target + 1e-3).length
        rank = `#${place} of ${standings.length}`
      }
      if (rank !== lastRank && rankRef.current) {
        lastRank = rank
        rankRef.current.textContent = rank
        rankRef.current.style.display = rank ? '' : 'none'
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
    }
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

  const stars = starsOf(me)
  const offset = page * PAGE
  return (
    <div className="race-tracker pointer-events-none">
      <div className="race-rail">
        <div ref={lineRef} className="race-line">
          <div ref={fillRef} className="race-fill" />
          <span className="race-node race-start" style={{ left: '0%' }}>
            {WORLDS[page]?.icon ?? <span className="race-num">{offset}</span>}
          </span>
          {STAGES.slice(offset, offset + PAGE).map((def, i) => {
            const index = offset + i + 1
            const locked = (me?.rebirths ?? 0) < def.rebirths
            return (
              <span
                key={def.name}
                className={`race-node ${index === stage ? 'is-current' : ''} ${index <= (me?.bestStage ?? 0) ? 'is-beaten' : ''}`}
                style={{ left: `${((i + 1) / PAGE) * 100}%`, background: nodeBackground(NODE_COLORS[def.theme] || '#3ba8ff') }}
                title={`Stage ${index} · ${def.name}`}
              >
                <span className="race-num">{index}</span>
                {locked && <span className="race-lock">🔒</span>}
                <span className="race-stars">
                  {Array.from({ length: MAX_STARS }, (_, k) => (
                    <span key={k} className={k < stars[index - 1] ? 'is-on' : ''}>
                      ★
                    </span>
                  ))}
                </span>
              </span>
            )
          })}
          {racers.map((r) => (
            <button
              key={r.sid}
              ref={bind(r.sid)}
              type="button"
              className={`race-dot ${r.isMe ? 'is-me' : ''}`}
              style={{ '--dot': colorFor(r.name), zIndex: r.isMe ? 6 : 3 }}
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
        <span ref={rankRef} className="race-rank game-text" style={{ display: 'none' }} />
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
