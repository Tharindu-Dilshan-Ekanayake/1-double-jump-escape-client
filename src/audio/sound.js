import { halloweenActive } from '../shared/gameData.js'

/**
 * The game's audio, all synthesised with WebAudio: no files to download.
 *
 * Signal flow: every voice -> its bus (sfx / music / ambience) -> master ->
 * compressor -> speakers, with an optional send into a shared reverb (its
 * impulse response is generated once). Voices have attack/decay envelopes,
 * filters and a little random pitch, so repeated sounds never sound identical.
 *
 * Music and ambience follow the event: during Halloween a spooky-but-fun loop
 * in D minor plus wind, distant thunder, crows and owls; otherwise a bright
 * loop and a soft breeze.
 *
 * The AudioContext is created on the first unlock (a tap, click or key press),
 * as browsers require, and is suspended while the tab is hidden.
 */

let ctx = null
let master = null
let sfxBus = null
let musicBus = null
let ambBus = null
let reverbIn = null
let noiseBuffer = null
let sfxVolume = 0.8
let musicVolume = 0.6
/** The Boxity portal's master volume (0..1) over everything. */
let masterVolume = 1
let sfxOn = true
let musicOn = true
const last = new Map()

/** Music and ambience sit well below the effects. */
const MUSIC_LEVEL = 0.2
const AMBIENCE_LEVEL = 0.55
const MASTER_LEVEL = 0.9

/* ---------------------------------------------------------------------------
 * Setup
 * ------------------------------------------------------------------------- */

function impulse(c, seconds = 2.2, decay = 2.6) {
  const length = Math.floor(c.sampleRate * seconds)
  const buffer = c.createBuffer(2, length, c.sampleRate)
  const preDelay = c.sampleRate * 0.012
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i += 1) data[i] = i < preDelay ? 0 : (Math.random() * 2 - 1) * (1 - i / length) ** decay
  }
  return buffer
}

function ensure() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 12
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.2
    comp.connect(ctx.destination)
    master = ctx.createGain()
    master.gain.value = MASTER_LEVEL * masterVolume
    master.connect(comp)
    sfxBus = ctx.createGain()
    musicBus = ctx.createGain()
    ambBus = ctx.createGain()
    for (const bus of [sfxBus, musicBus, ambBus]) bus.connect(master)
    const convolver = ctx.createConvolver()
    convolver.buffer = impulse(ctx)
    reverbIn = ctx.createGain()
    const reverbOut = ctx.createGain()
    reverbOut.gain.value = 0.32
    reverbIn.connect(convolver).connect(reverbOut).connect(master)
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
    applyVolumes(0)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend().catch(() => {})
      else ctx.resume().catch(() => {})
    })
  }
  if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {})
  return ctx
}

function applyVolumes(ramp = 0.12) {
  if (!ctx) return
  const t = ctx.currentTime
  const tc = Math.max(0.001, ramp)
  sfxBus.gain.setTargetAtTime(sfxOn ? sfxVolume : 0, t, tc)
  musicBus.gain.setTargetAtTime(musicOn ? musicVolume * MUSIC_LEVEL : 0, t, tc)
  ambBus.gain.setTargetAtTime(musicOn ? musicVolume * AMBIENCE_LEVEL : 0, t, tc)
  master.gain.setTargetAtTime(MASTER_LEVEL * masterVolume, t, tc)
}

/** Rate limit: true if `name` played less than `ms` ago (otherwise marks it played). */
function throttled(name, ms) {
  const now = performance.now()
  if (now - (last.get(name) ?? -1e9) < ms) return true
  last.set(name, now)
  return false
}

/** `f` with up to +-`amount` random detune, so repeats never sound identical. */
const vary = (f, amount = 0.04) => f * (1 + (Math.random() * 2 - 1) * amount)

/* ---------------------------------------------------------------------------
 * Voices
 * ------------------------------------------------------------------------- */

/** Wires an envelope's output: optional pan, then the bus (or `out`), plus a reverb send. */
function route(c, env, o) {
  let out = env
  if (o.pan) {
    const pan = c.createStereoPanner()
    pan.pan.value = o.pan
    env.connect(pan)
    out = pan
  }
  out.connect(o.out ?? o.bus ?? sfxBus)
  if (o.reverb) {
    const send = c.createGain()
    send.gain.value = o.reverb
    out.connect(send).connect(reverbIn)
  }
}

/**
 * One enveloped oscillator: { type, freq, to, glide, dur, vol, attack, delay,
 * bus | out, filter, filterFreq, filterTo, q, pan, reverb, vibrato: [hz, depth] }.
 */
function voice(o) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + (o.delay ?? 0)
  const dur = o.dur ?? 0.2
  const attack = o.attack ?? 0.005
  const osc = c.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.glide ?? dur))
  if (o.vibrato) {
    const lfo = c.createOscillator()
    const depth = c.createGain()
    lfo.frequency.value = o.vibrato[0]
    depth.gain.value = o.vibrato[1]
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.1)
  }
  let head = osc
  if (o.filter) {
    const f = c.createBiquadFilter()
    f.type = o.filter
    f.Q.value = o.q ?? 0.8
    f.frequency.setValueAtTime(o.filterFreq ?? 2000, t)
    if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, t + dur)
    head.connect(f)
    head = f
  }
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(o.vol ?? 0.2, t + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01))
  head.connect(env)
  route(c, env, o)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** Filtered noise: { dur, vol, freq, to, q, type, rate, attack, delay, bus | out, pan, reverb }. */
function noise(o) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + (o.delay ?? 0)
  const dur = o.dur ?? 0.2
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.playbackRate.value = o.rate ?? 1
  const filter = c.createBiquadFilter()
  filter.type = o.type ?? 'bandpass'
  filter.Q.value = o.q ?? 1
  filter.frequency.setValueAtTime(o.freq ?? 1200, t)
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + dur)
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(o.vol ?? 0.2, t + (o.attack ?? 0.003))
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(env)
  route(c, env, o)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}

const arpeggio = (notes, step, opts) => notes.forEach((freq, i) => voice({ ...opts, freq, delay: (opts.delay ?? 0) + i * step }))

/* ---------------------------------------------------------------------------
 * Footsteps per surface
 * ------------------------------------------------------------------------- */

const SURFACES = {
  grass: ['grass', 'grassChecker', 'lawn', 'hedge', 'forestTop', 'jungleTile', 'jungleGrass', 'sakuraGrass', 'hauntedGround', 'mossStone', 'dirt', 'pumpkinPatch'],
  wood: ['planks', 'woodWall', 'spookyPlanks'],
  metal: ['metal', 'metalDark', 'hazardStripe', 'spaceTile', 'neonFloor', 'neonWall', 'galaxyWall', 'trainFrame', 'trainConsole', 'toxicTile'],
  ice: ['ice', 'iceWall', 'crystalTile', 'crystalWall', 'poolTile'],
  crunch: ['sandTile', 'sand', 'sandstone', 'snow', 'leafLitter'],
  soft: ['candy', 'candyWall', 'chocolate', 'cloudWhite', 'cloudStone', 'sakuraTile', 'mintStud', 'lobbyFloor', 'lobbyPath', 'chevronPath', 'stageStep', 'spawn', 'plaza',
    'lilacChecker', 'navyChecker', 'charcoalChecker', 'salmonStud', 'safeBlue', 'killRed', 'w2Floor',
    'trainZone', 'shopZone', 'bootsZone', 'padZone', 'backZone', 'galleryFloor', 'lilacStud', 'rainbowTile', 'standPad', 'galleryPad', 'returnPad', 'doublePad', 'slimeFloor', 'candyCorn'],
  rock: ['darkRock', 'darkChecker', 'lavaChecker', 'magmaTile', 'moonRock', 'hauntedTile', 'hauntedStone', 'graveStone'],
}
const SURFACE_OF = {}
for (const [surface, keys] of Object.entries(SURFACES)) for (const key of keys) SURFACE_OF[key] = surface

/** The footstep family for a surface material key ('stone' by default). */
export const surfaceOf = (mat) => SURFACE_OF[mat] ?? 'stone'

function footstep(surface, speed) {
  const v = Math.min(1, 0.55 + speed / 90)
  const pan = (Math.random() - 0.5) * 0.15
  switch (surface) {
    case 'grass':
      noise({ dur: 0.09, vol: 0.05 * v, freq: vary(2400, 0.15), q: 0.6, type: 'highpass', pan })
      noise({ dur: 0.06, vol: 0.04 * v, freq: 300, type: 'lowpass', pan })
      break
    case 'wood':
      voice({ type: 'triangle', freq: vary(210, 0.08), to: 150, dur: 0.07, vol: 0.07 * v, pan })
      noise({ dur: 0.05, vol: 0.035 * v, freq: vary(900, 0.1), q: 3, pan })
      break
    case 'metal':
      voice({ type: 'triangle', freq: vary(880, 0.05), dur: 0.12, vol: 0.022 * v, pan, reverb: 0.15 })
      voice({ type: 'sine', freq: vary(1320, 0.05), dur: 0.09, vol: 0.016 * v, pan })
      noise({ dur: 0.04, vol: 0.04 * v, freq: 3200, q: 2, pan })
      break
    case 'ice':
      noise({ dur: 0.05, vol: 0.045 * v, freq: vary(5200, 0.1), q: 2, pan })
      voice({ type: 'sine', freq: vary(2600, 0.1), dur: 0.05, vol: 0.012 * v, pan })
      break
    case 'crunch':
      noise({ dur: 0.13, vol: 0.05 * v, freq: vary(1800, 0.2), q: 0.5, type: 'highpass', pan, attack: 0.02 })
      break
    case 'soft':
      voice({ type: 'sine', freq: vary(260, 0.1), to: 140, dur: 0.08, vol: 0.06 * v, pan })
      noise({ dur: 0.05, vol: 0.025 * v, freq: 700, type: 'lowpass', pan })
      break
    case 'rock':
      noise({ dur: 0.06, vol: 0.06 * v, freq: vary(650, 0.15), q: 1.5, pan })
      noise({ dur: 0.03, vol: 0.03 * v, freq: 3000, q: 1, pan, delay: 0.015 })
      break
    default:
      noise({ dur: 0.05, vol: 0.055 * v, freq: vary(1100, 0.15), q: 1.4, pan })
      voice({ type: 'sine', freq: vary(120, 0.1), to: 70, dur: 0.06, vol: 0.05 * v, pan })
  }
}

/* ---------------------------------------------------------------------------
 * Music: lookahead-scheduled 16th-note loops
 * ------------------------------------------------------------------------- */

/** Note name ('C#4', 'Bb1') -> Hz. */
function hz(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name)
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return 440 * 2 ** ((semis + (Number(m[3]) - 4) * 12) / 12)
}

const up = (f, semitones) => f * 2 ** (semitones / 12)

/** Spooky-but-fun: D harmonic minor, walking bass, harpsichord, theremin and bells. */
const SPOOKY = {
  bpm: 116,
  swing: 0.14,
  chords: [
    { root: 'D2', tones: ['D4', 'F4', 'A4', 'D5'] },
    { root: 'Bb1', tones: ['D4', 'F4', 'Bb4', 'D5'] },
    { root: 'G1', tones: ['D4', 'G4', 'Bb4', 'D5'] },
    { root: 'A1', tones: ['C#4', 'E4', 'A4', 'C#5'] },
  ],
  bass: [0, null, null, 0, null, null, 7, null, 12, null, 7, null, 5, null, 7, null],
  // 8 bars of theremin, in 16ths (null = rest, '-' = hold).
  lead: [
    ['A4', '-', null, 'F4', '-', null, 'D4', '-', null, null, 'E4', null, 'F4', '-', '-', null],
    ['D4', '-', null, 'Bb3', '-', null, 'C4', null, 'D4', '-', '-', '-', null, null, null, null],
    ['G4', '-', null, 'Bb4', '-', null, 'A4', null, 'G4', null, 'F4', '-', '-', '-', null, null],
    ['E4', '-', null, 'C#4', '-', null, 'A3', '-', '-', '-', null, null, null, null, null, null],
    ['D5', '-', null, 'A4', '-', null, 'F4', null, 'A4', null, 'D5', '-', 'C#5', '-', null, null],
    ['D5', '-', null, 'Bb4', '-', null, 'F4', '-', null, null, 'D4', null, 'F4', null, 'Bb4', null],
    ['G4', null, 'A4', null, 'Bb4', '-', null, 'D5', '-', null, 'C5', null, 'Bb4', '-', null, null],
    ['A4', '-', '-', null, 'G4', null, 'E4', '-', null, 'C#4', '-', '-', 'A3', '-', null, null],
  ],
}

/** The everyday loop: a bright C major bounce. */
const CHEERFUL = {
  bpm: 124,
  swing: 0.08,
  chords: [
    { root: 'C2', tones: ['C4', 'E4', 'G4', 'C5'] },
    { root: 'G1', tones: ['B3', 'D4', 'G4', 'B4'] },
    { root: 'A1', tones: ['C4', 'E4', 'A4', 'C5'] },
    { root: 'F1', tones: ['C4', 'F4', 'A4', 'C5'] },
  ],
  bass: [0, null, null, null, 12, null, 7, null, 0, null, null, 12, null, null, 7, null],
  lead: [
    ['E5', null, 'G5', null, 'E5', null, 'C5', null, 'D5', '-', null, null, 'E5', null, null, null],
    ['D5', null, 'B4', null, 'G4', '-', null, null, 'A4', null, 'B4', null, 'D5', '-', null, null],
    ['C5', null, 'E5', null, 'A5', '-', null, 'G5', null, 'E5', '-', null, 'C5', null, null, null],
    ['A4', null, 'C5', null, 'F5', '-', null, 'E5', null, 'D5', null, 'C5', '-', '-', null, null],
  ],
}

let song = null
let musicTimer = null
let nextStep = 0
let stepIndex = 0

function scheduleMusic() {
  const c = ensure()
  if (!c || !song) return
  const step = 60 / song.bpm / 4
  const spooky = song === SPOOKY
  const bus = musicBus
  // After a long pause (hidden tab) don't try to catch up on missed steps.
  if (nextStep < c.currentTime - 0.2) nextStep = c.currentTime + 0.05
  while (nextStep < c.currentTime + 0.3) {
    const bar = Math.floor(stepIndex / 16)
    const beat = stepIndex % 16
    const chord = song.chords[bar % song.chords.length]
    // Swing: every other 16th lands a little late.
    const delay = Math.max(0, nextStep - c.currentTime + (beat % 2 ? step * song.swing : 0))

    // Bass: plucked, bright enough to hear on phone speakers.
    const b = song.bass[beat]
    if (b !== null) voice({ type: 'sawtooth', freq: up(hz(chord.root), b), dur: step * 2.6, vol: 0.3, delay, bus, filter: 'lowpass', filterFreq: 900, filterTo: 220 })

    // Harpsichord-ish pluck arpeggio on 8ths.
    if (beat % 2 === 0) {
      const tone = chord.tones[(beat / 2) % chord.tones.length]
      voice({ type: 'square', freq: hz(tone), dur: step * 1.6, vol: 0.06, delay, bus, filter: 'lowpass', filterFreq: 3200, filterTo: 900, reverb: 0.15 })
    }

    // Lead: a wobbly theremin (spooky) or a bell-like pluck (cheerful).
    const phrase = song.lead[bar % song.lead.length]
    const note = phrase[beat]
    if (note && note !== '-') {
      let hold = 1
      while (phrase[beat + hold] === '-') hold += 1
      if (spooky) voice({ type: 'sine', freq: hz(note) * 0.985, to: hz(note), glide: 0.08, dur: step * hold + 0.12, vol: 0.13, attack: 0.04, delay, bus, vibrato: [5.5, 6], reverb: 0.4 })
      else voice({ type: 'triangle', freq: hz(note), dur: step * hold + 0.08, vol: 0.1, delay, bus, reverb: 0.2 })
    }

    // Bells on each bar's downbeat.
    if (beat === 0) {
      const top = hz(chord.tones[3]) * 2
      voice({ type: 'sine', freq: top, dur: 1.2, vol: 0.05, delay, bus, reverb: 0.6 })
      voice({ type: 'sine', freq: top * 2.76, dur: 0.5, vol: 0.012, delay, bus, reverb: 0.6 })
    }

    // Drums: soft kick, snappy snare, ticking hats.
    if (beat === 0 || beat === 8 || (spooky && beat === 10)) voice({ type: 'sine', freq: 130, to: 42, dur: 0.22, vol: 0.5, delay, bus })
    if (beat === 4 || beat === 12) {
      noise({ dur: 0.14, vol: 0.18, freq: 1900, q: 0.7, delay, bus, reverb: 0.15 })
      voice({ type: 'triangle', freq: 190, to: 140, dur: 0.08, vol: 0.14, delay, bus })
    }
    if (beat % 2 === 0) noise({ dur: 0.03, vol: beat % 4 === 2 ? 0.07 : 0.04, freq: 8500, type: 'highpass', delay, bus })

    // Every 8 bars of the spooky loop a ghost goes "ooOOoo".
    if (spooky && bar % 8 === 7 && beat === 0) voice({ type: 'sine', freq: 300, to: 470, glide: 0.9, dur: 1.8, vol: 0.05, attack: 0.4, delay, bus, vibrato: [4.5, 14], reverb: 0.8 })

    nextStep += step
    stepIndex += 1
  }
}

function startMusic() {
  const c = ensure()
  if (!c) return
  const wanted = halloweenActive() ? SPOOKY : CHEERFUL
  if (song === wanted && musicTimer) return
  song = wanted
  stepIndex = 0
  nextStep = c.currentTime + 0.15
  if (!musicTimer) musicTimer = setInterval(scheduleMusic, 40)
}

function stopMusic() {
  clearInterval(musicTimer)
  musicTimer = null
}

/* ---------------------------------------------------------------------------
 * Ambience: Halloween wind, crows and owls (or a soft breeze). Thunder is
 * triggered by the sky's lightning (sound.thunder).
 * ------------------------------------------------------------------------- */

let ambience = null

function startAmbience() {
  const c = ensure()
  if (!c || ambience) return
  const spooky = halloweenActive()
  // Wind: looping noise through a band-pass that slowly sweeps and swells.
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = spooky ? 420 : 700
  band.Q.value = spooky ? 1.6 : 0.8
  const level = c.createGain()
  level.gain.value = spooky ? 0.16 : 0.05
  const sweep = c.createOscillator()
  sweep.frequency.value = 0.07
  const sweepDepth = c.createGain()
  sweepDepth.gain.value = spooky ? 260 : 150
  sweep.connect(sweepDepth).connect(band.frequency)
  const swell = c.createOscillator()
  swell.frequency.value = 0.11
  const swellDepth = c.createGain()
  swellDepth.gain.value = spooky ? 0.09 : 0.025
  swell.connect(swellDepth).connect(level.gain)
  src.connect(band).connect(level).connect(ambBus)
  src.start()
  sweep.start()
  swell.start()
  const timers = []
  const every = (min, max, fn) => {
    const tick = () => {
      const id = setTimeout(() => {
        timers.splice(timers.indexOf(id), 1)
        if (!document.hidden) fn()
        tick()
      }, (min + Math.random() * (max - min)) * 1000)
      timers.push(id)
    }
    tick()
  }
  if (spooky) {
    every(10, 24, crow)
    every(26, 55, owl)
  }
  ambience = { nodes: [src, sweep, swell], timers }
}

function stopAmbience() {
  if (!ambience) return
  for (const node of ambience.nodes) node.stop()
  for (const timer of ambience.timers) clearTimeout(timer)
  ambience = null
}

function thunder(strength) {
  const vol = 0.2 + strength * 0.3
  noise({ dur: 0.25, vol: vol * 0.6, freq: 1800, type: 'highpass', bus: ambBus, reverb: 0.6 })
  noise({ dur: 3.2, vol, freq: 260, to: 50, type: 'lowpass', q: 0.5, attack: 0.08, bus: ambBus, reverb: 0.8, rate: 0.5 })
  noise({ dur: 2.2, vol: vol * 0.7, freq: 120, type: 'lowpass', attack: 0.3, delay: 0.4, bus: ambBus, rate: 0.35 })
}

function crow() {
  const pan = (Math.random() - 0.5) * 1.4
  const caws = 2 + Math.floor(Math.random() * 2)
  for (let i = 0; i < caws; i += 1) {
    const delay = i * (0.32 + Math.random() * 0.1)
    voice({ type: 'sawtooth', freq: vary(920, 0.06), to: 640, dur: 0.2, vol: 0.05, delay, bus: ambBus, filter: 'bandpass', filterFreq: 1300, q: 2.5, pan, reverb: 0.35 })
    noise({ dur: 0.16, vol: 0.03, freq: 1600, q: 2, delay, bus: ambBus, pan })
  }
}

function owl() {
  const pan = (Math.random() - 0.5) * 1.2
  for (const [delay, f] of [[0, 410], [0.45, 380], [0.75, 395]]) voice({ type: 'sine', freq: f, to: f * 0.9, dur: 0.38, vol: 0.06, attack: 0.06, delay, bus: ambBus, pan, reverb: 0.5 })
}

/* ---------------------------------------------------------------------------
 * Spatial: other players' jumps
 * ------------------------------------------------------------------------- */

function spatialOut(position) {
  const c = ensure()
  if (!c) return null
  const panner = c.createPanner()
  panner.panningModel = 'equalpower'
  panner.distanceModel = 'inverse'
  panner.refDistance = 8
  panner.rolloffFactor = 1.3
  panner.maxDistance = 140
  if (panner.positionX) {
    panner.positionX.value = position.x
    panner.positionY.value = position.y
    panner.positionZ.value = position.z
  } else panner.setPosition(position.x, position.y, position.z)
  panner.connect(sfxBus)
  return panner
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

export const sound = {
  /** Call from the first tap / click / key press (browsers need a gesture). */
  unlock() {
    const c = ensure()
    if (!c) return
    // iOS: playing anything, even silence, inside the gesture unlocks output.
    const silent = c.createBufferSource()
    silent.buffer = c.createBuffer(1, 1, 22050)
    silent.connect(c.destination)
    silent.start(0)
  },

  setSfx(on) {
    sfxOn = on
    applyVolumes()
  },
  setMusic(on) {
    musicOn = on
    if (!ctx) return
    applyVolumes()
    if (on) {
      startMusic()
      startAmbience()
    } else {
      stopMusic()
      stopAmbience()
    }
  },
  /** 0..1 */
  setSfxVolume(v) {
    sfxVolume = Math.max(0, Math.min(1, v))
    applyVolumes()
  },
  /** 0..1; the ambience follows the music volume. */
  setMusicVolume(v) {
    musicVolume = Math.max(0, Math.min(1, v))
    applyVolumes()
  },
  /** 0..1 over everything (the Boxity portal's master volume). */
  setMasterVolume(v) {
    masterVolume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1
    applyVolumes()
  },

  /** Keeps the 3D listener on the camera (for other players' sounds); call every frame. */
  setListener(camera) {
    if (!ctx || ctx.state !== 'running') return
    const l = ctx.listener
    const p = camera.position
    const e = camera.matrixWorld.elements
    // The camera looks down its -Z; +Y is up.
    if (l.positionX) {
      l.positionX.value = p.x
      l.positionY.value = p.y
      l.positionZ.value = p.z
      l.forwardX.value = -e[8]
      l.forwardY.value = -e[9]
      l.forwardZ.value = -e[10]
      l.upX.value = e[4]
      l.upY.value = e[5]
      l.upZ.value = e[6]
    } else {
      l.setPosition(p.x, p.y, p.z)
      l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6])
    }
  },

  /** A rumble of thunder (0..1 strength), after the sky's lightning flash. */
  thunder(strength = 0.5) {
    if (ctx && musicOn) thunder(strength)
  },

  gain() {
    if (throttled('gain', 140)) return
    voice({ type: 'sine', freq: vary(1250, 0.03), to: 1650, dur: 0.07, vol: 0.03 })
  },
  /** A coin-like ding (Wins, rewards). */
  coin() {
    if (throttled('coin', 60)) return
    voice({ type: 'square', freq: vary(988, 0.01), dur: 0.07, vol: 0.05, filter: 'lowpass', filterFreq: 5000 })
    voice({ type: 'square', freq: 1319, dur: 0.22, vol: 0.05, delay: 0.07, filter: 'lowpass', filterFreq: 5000, reverb: 0.15 })
  },
  /** One footstep on `surface` (see surfaceOf). */
  step(surface = 'stone', speed = 16) {
    if (throttled('step', 85)) return
    footstep(surface, speed)
  },
  jump() {
    voice({ type: 'sine', freq: vary(290), to: 760, dur: 0.2, vol: 0.13 })
    voice({ type: 'triangle', freq: vary(580), to: 1500, dur: 0.15, vol: 0.04 })
    noise({ dur: 0.14, vol: 0.05, freq: 900, to: 3200, q: 0.8 })
  },
  /** `n` is which jump of the chain this is (1 = the first air jump); each rises a step. */
  airJump(n = 1) {
    const base = vary(520, 0.02) * 2 ** (Math.min(n, 6) * 0.17)
    voice({ type: 'sine', freq: base, to: base * 2, dur: 0.16, vol: 0.11 })
    voice({ type: 'triangle', freq: base * 2, to: base * 3, dur: 0.12, vol: 0.035, delay: 0.03 })
    voice({ type: 'sine', freq: base * 4, dur: 0.18, vol: 0.02, delay: 0.06, reverb: 0.3 })
    noise({ dur: 0.18, vol: 0.05, freq: 1500, to: 5200, q: 0.7 })
  },
  land(impact = 0.5) {
    voice({ type: 'sine', freq: 110 + impact * 20, to: 48, dur: 0.12 + impact * 0.12, vol: 0.1 + impact * 0.14 })
    noise({ dur: 0.1 + impact * 0.15, vol: 0.06 + impact * 0.1, freq: 420 - impact * 180, type: 'lowpass' })
  },
  /** Trampoline: a springy "boing" that rises with the multiplier. */
  bounce(mult = 1) {
    const k = 1 + Math.log10(Math.max(1, mult)) * 0.3
    voice({ type: 'sine', freq: vary(150 * k, 0.03), to: 460 * k, dur: 0.3, vol: 0.13, vibrato: [18, 22 * k] })
    voice({ type: 'triangle', freq: 300 * k, to: 920 * k, dur: 0.2, vol: 0.04 })
    voice({ type: 'sine', freq: 900 * k, to: 400 * k, dur: 0.12, vol: 0.02, delay: 0.02 })
  },
  levelUp() {
    arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, { type: 'triangle', dur: 0.3, vol: 0.1, reverb: 0.35 })
    voice({ type: 'sine', freq: 1567.98, dur: 0.9, vol: 0.06, delay: 0.36, reverb: 0.5, vibrato: [6, 4] })
    noise({ dur: 0.8, vol: 0.04, freq: 6000, type: 'highpass', delay: 0.3, attack: 0.2 })
  },
  win() {
    arpeggio([659.25, 783.99, 987.77, 1318.5], 0.06, { type: 'square', dur: 0.16, vol: 0.045, filter: 'lowpass', filterFreq: 4000 })
    arpeggio([1046.5, 1318.5, 1567.98], 0, { type: 'triangle', dur: 0.7, vol: 0.05, delay: 0.26, reverb: 0.4 })
  },
  /** A stage's plateau, first time this run: a brassy fanfare with a cymbal. */
  stageClear() {
    const brass = { type: 'sawtooth', filter: 'lowpass', filterFreq: 2400, q: 1, reverb: 0.3 }
    voice({ ...brass, freq: 392, dur: 0.14, vol: 0.09 })
    voice({ ...brass, freq: 392, dur: 0.14, vol: 0.09, delay: 0.15 })
    for (const f of [523.25, 659.25, 783.99]) voice({ ...brass, freq: f, dur: 0.7, vol: 0.08, delay: 0.3 })
    voice({ type: 'sine', freq: 140, to: 50, dur: 0.3, vol: 0.4, delay: 0.3 })
    noise({ dur: 1.2, vol: 0.08, freq: 7000, type: 'highpass', delay: 0.3, reverb: 0.4 })
  },
  goal() {
    arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, { type: 'triangle', dur: 0.22, vol: 0.1, reverb: 0.3 })
    arpeggio([1046.5, 1318.5, 1567.98], 0, { type: 'sine', dur: 0.8, vol: 0.05, delay: 0.38, reverb: 0.5 })
  },
  rebirth() {
    voice({ type: 'sawtooth', freq: 220, to: 880, dur: 0.6, vol: 0.05, filter: 'lowpass', filterFreq: 1200, filterTo: 5000 })
    arpeggio([392, 523.25, 659.25, 783.99, 1046.5, 1318.5], 0.09, { type: 'triangle', dur: 0.32, vol: 0.09, delay: 0.3, reverb: 0.4 })
    noise({ dur: 0.9, vol: 0.06, freq: 300, to: 6000, q: 0.6, reverb: 0.4 })
  },
  /** A lucky step (×5): a sparkly golden chime. */
  lucky() {
    arpeggio([1318.5, 1567.98, 2093], 0.045, { type: 'triangle', dur: 0.22, vol: 0.07, reverb: 0.4 })
    voice({ type: 'sine', freq: 2637, dur: 0.5, vol: 0.035, delay: 0.14, reverb: 0.6, vibrato: [9, 12] })
    noise({ dur: 0.35, vol: 0.035, freq: 8000, type: 'highpass', delay: 0.05 })
  },
  /** A new title: a crowd-ish cheer and a fanfare. */
  cheer() {
    const brass = { type: 'sawtooth', filter: 'lowpass', filterFreq: 2600, q: 1, reverb: 0.35 }
    for (const [f, d] of [[523.25, 0], [659.25, 0.12], [783.99, 0.24]]) voice({ ...brass, freq: f, dur: 0.18, vol: 0.07, delay: d })
    for (const f of [1046.5, 1318.5, 1567.98]) voice({ ...brass, freq: f, dur: 0.9, vol: 0.06, delay: 0.38 })
    noise({ dur: 1.4, vol: 0.09, freq: 1800, q: 0.4, attack: 0.15, delay: 0.3, reverb: 0.5 })
  },
  /** An egg cracking open, then a pop. */
  hatch() {
    for (const d of [0, 0.18, 0.34]) noise({ dur: 0.06, vol: 0.09, freq: 2600, q: 2, delay: d })
    voice({ type: 'sine', freq: 300, to: 1200, dur: 0.18, vol: 0.12, delay: 0.5 })
    arpeggio([783.99, 1046.5, 1318.5, 1567.98], 0.06, { type: 'triangle', dur: 0.3, vol: 0.08, delay: 0.62, reverb: 0.4 })
  },
  revive() {
    arpeggio([392, 587.33, 783.99, 1174.66], 0.07, { type: 'sine', dur: 0.3, vol: 0.09, reverb: 0.5 })
    noise({ dur: 0.45, vol: 0.06, freq: 3000, to: 600, q: 0.8 })
  },
  death() {
    voice({ type: 'sawtooth', freq: 420, to: 90, dur: 0.6, vol: 0.08, filter: 'lowpass', filterFreq: 2200, filterTo: 300, vibrato: [9, 18] })
    noise({ dur: 0.35, vol: 0.12, freq: 700, to: 150 })
    voice({ type: 'sine', freq: 90, to: 40, dur: 0.3, vol: 0.2 })
  },
  buy() {
    voice({ type: 'square', freq: 1046.5, dur: 0.07, vol: 0.045, filter: 'lowpass', filterFreq: 4500 })
    voice({ type: 'square', freq: 1567.98, dur: 0.24, vol: 0.045, delay: 0.07, filter: 'lowpass', filterFreq: 4500, reverb: 0.2 })
    noise({ dur: 0.3, vol: 0.03, freq: 7000, type: 'highpass', delay: 0.07 })
  },
  error() {
    voice({ type: 'square', freq: 220, dur: 0.11, vol: 0.045, filter: 'lowpass', filterFreq: 1400 })
    voice({ type: 'square', freq: 175, dur: 0.17, vol: 0.045, delay: 0.11, filter: 'lowpass', filterFreq: 1400 })
  },
  click() {
    if (throttled('click', 30)) return
    voice({ type: 'sine', freq: vary(880, 0.05), to: 620, dur: 0.05, vol: 0.06 })
  },
  whoosh() {
    noise({ dur: 0.45, vol: 0.1, freq: 400, to: 3500, q: 0.7, reverb: 0.2 })
  },
  hydra() {
    voice({ type: 'sawtooth', freq: 70, to: 38, dur: 1.4, vol: 0.09, filter: 'lowpass', filterFreq: 600 })
    noise({ dur: 1.5, vol: 0.12, freq: 200, to: 2400, q: 0.5, reverb: 0.6 })
    arpeggio([196, 233.08, 293.66, 349.23, 466.16], 0.1, { type: 'triangle', dur: 0.5, vol: 0.07, delay: 0.3, reverb: 0.5 })
  },
  /** Candy pickup: a sugary two-note blip that climbs with a streak. */
  candy(streak = 0) {
    if (throttled('candy', 45)) return
    const f = vary(1047, 0.01) * 2 ** (Math.min(streak, 12) / 12)
    voice({ type: 'triangle', freq: f, dur: 0.08, vol: 0.06 })
    voice({ type: 'sine', freq: f * 1.5, dur: 0.2, vol: 0.05, delay: 0.06, reverb: 0.3 })
  },
  /** Trick or Treat chest: a creaky lid, then a spooky-sweet chime. */
  chest() {
    voice({ type: 'sawtooth', freq: 140, to: 220, dur: 0.5, vol: 0.04, filter: 'bandpass', filterFreq: 900, q: 6, vibrato: [22, 30] })
    arpeggio([587.33, 698.46, 880, 1174.66, 1396.91], 0.08, { type: 'triangle', dur: 0.4, vol: 0.08, delay: 0.45, reverb: 0.5 })
    noise({ dur: 1, vol: 0.05, freq: 6500, type: 'highpass', delay: 0.5, reverb: 0.4 })
  },
  /** A cheeky ghost "boo" (event ghosts, near misses on Halloween). */
  boo() {
    if (throttled('boo', 400)) return
    voice({ type: 'sine', freq: vary(380, 0.08), to: 240, dur: 0.7, vol: 0.06, attack: 0.12, vibrato: [6, 16], reverb: 0.6 })
  },
  /** Near miss: a quick "whew" whistle. */
  nearMiss() {
    if (throttled('near', 1200)) return
    voice({ type: 'sine', freq: 1400, to: 700, dur: 0.22, vol: 0.05, vibrato: [14, 40] })
  },
  /** Another player's jump, placed in 3D and kept quiet. */
  spatialJump(position, air = false) {
    if (throttled('spatial', 40)) return
    const out = spatialOut(position)
    if (!out) return
    const f = air ? vary(700, 0.05) : vary(320, 0.05)
    voice({ type: 'sine', freq: f, to: f * 2.2, dur: 0.15, vol: 0.07, out })
    noise({ dur: 0.1, vol: 0.025, freq: 2000, out })
  },
}
