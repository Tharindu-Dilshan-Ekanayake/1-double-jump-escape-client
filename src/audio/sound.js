/**
 * Tiny WebAudio synth: every sound effect and the background loop are generated,
 * so the game ships no audio files.
 *
 * The AudioContext is created lazily on the first call, which always happens
 * inside a user gesture (the first click or key press), as browsers require.
 */

let ctx = null
let sfxBus = null
let musicBus = null
let sfxOn = true
let musicOn = false
let lastGainSound = 0
let lastStep = 0
/** Background music sits well below the sound effects. */
const MUSIC_VOLUME = 0.12

function ensure() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = sfxOn ? 1 : 0
    sfxBus.connect(master)
    musicBus = ctx.createGain()
    musicBus.gain.value = musicOn ? MUSIC_VOLUME : 0
    musicBus.connect(master)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone({ freq, to, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, attack = 0.005, bus }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(bus || sfxBus)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

let noiseBuffer = null
function noise({ dur = 0.2, vol = 0.2, freq = 1200, to, q = 1, delay = 0, type = 'bandpass', bus }) {
  const c = ensure()
  if (!c) return
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  }
  const t = c.currentTime + delay
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(freq, t)
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur)
  const gain = c.createGain()
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(gain).connect(bus || sfxBus)
  src.start(t)
  src.stop(t + dur + 0.05)
}

const arpeggio = (notes, step, opts) =>
  notes.forEach((freq, i) => tone({ freq, delay: i * step, ...opts }))

/* ---------------------------------------------------------------------------
 * Background loop: C - G - Am - F, bass + arpeggio + hats, scheduled ahead.
 * ------------------------------------------------------------------------- */

const BPM = 126
const STEP = 60 / BPM / 4
const CHORDS = [
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
]
let musicTimer = null
let nextStepTime = 0
let stepIndex = 0

function scheduleMusic() {
  const c = ensure()
  if (!c) return
  while (nextStepTime < c.currentTime + 0.25) {
    const bar = Math.floor(stepIndex / 16) % CHORDS.length
    const beat = stepIndex % 16
    const chord = CHORDS[bar]
    const delay = Math.max(0, nextStepTime - c.currentTime)
    if (beat % 4 === 0) tone({ freq: chord[0] / 2, type: 'square', dur: STEP * 2.5, vol: 0.05, delay, bus: musicBus })
    if (beat % 2 === 0) {
      const note = chord[(beat / 2) % 3] * (beat >= 8 ? 2 : 1)
      tone({ freq: note, type: 'triangle', dur: STEP * 1.6, vol: 0.045, delay, bus: musicBus })
    }
    if (beat % 4 === 2) noise({ dur: 0.04, vol: 0.05, freq: 8000, type: 'highpass', delay, bus: musicBus })
    nextStepTime += STEP
    stepIndex += 1
  }
}

export const sound = {
  unlock() {
    ensure()
  },

  setSfx(on) {
    sfxOn = on
    if (sfxBus) sfxBus.gain.value = on ? 1 : 0
  },

  setMusic(on) {
    musicOn = on
    const c = on ? ensure() : ctx
    if (!c) return
    musicBus.gain.value = on ? MUSIC_VOLUME : 0
    if (on && !musicTimer) {
      nextStepTime = c.currentTime + 0.1
      musicTimer = setInterval(scheduleMusic, 60)
    } else if (!on && musicTimer) {
      clearInterval(musicTimer)
      musicTimer = null
    }
  },

  gain() {
    const now = performance.now()
    if (now - lastGainSound < 120) return
    lastGainSound = now
    tone({ freq: 1250, to: 1650, dur: 0.07, vol: 0.035 })
  },
  jump() {
    // A springy "boing" with a bright sparkle on top.
    tone({ freq: 300, to: 760, type: 'sine', dur: 0.2, vol: 0.14 })
    tone({ freq: 600, to: 1520, type: 'triangle', dur: 0.16, vol: 0.05 })
    tone({ freq: 1760, to: 2350, type: 'sine', dur: 0.1, vol: 0.03, delay: 0.07 })
    noise({ dur: 0.12, vol: 0.04, freq: 1000, to: 3000 })
  },
  airJump() {
    // Each air jump rises a little higher, like a cheerful chirp.
    const base = 520 + Math.random() * 120
    tone({ freq: base, to: base * 2.1, type: 'sine', dur: 0.15, vol: 0.12 })
    tone({ freq: base * 2, to: base * 3, type: 'triangle', dur: 0.1, vol: 0.04, delay: 0.04 })
    noise({ dur: 0.16, vol: 0.05, freq: 1800, to: 5000 })
  },
  /** A soft footstep; call once per stride. */
  step(speed = 16) {
    const now = performance.now()
    if (now - lastStep < 90) return
    lastStep = now
    const v = Math.min(0.07, 0.025 + speed * 0.0005)
    noise({ dur: 0.05, vol: v, freq: 500 + Math.random() * 200, type: 'lowpass' })
  },
  /** Trampoline: a deep springy boing. */
  bounce() {
    tone({ freq: 140, to: 420, type: 'sine', dur: 0.28, vol: 0.12 })
    tone({ freq: 280, to: 840, type: 'triangle', dur: 0.2, vol: 0.04 })
  },
  goal() {
    arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, { type: 'triangle', dur: 0.22, vol: 0.1 })
    arpeggio([1046.5, 1318.5, 1567.98], 0, { type: 'sine', dur: 0.8, vol: 0.05, delay: 0.38 })
  },
  rebirth() {
    tone({ freq: 220, to: 880, type: 'sawtooth', dur: 0.6, vol: 0.05 })
    arpeggio([392, 523.25, 659.25, 783.99, 1046.5, 1318.5], 0.09, { type: 'triangle', dur: 0.3, vol: 0.1, delay: 0.3 })
    noise({ dur: 0.9, vol: 0.06, freq: 300, to: 6000, q: 0.6 })
  },
  revive() {
    arpeggio([392, 587.33, 783.99], 0.08, { type: 'triangle', dur: 0.25, vol: 0.1 })
    noise({ dur: 0.4, vol: 0.06, freq: 3000, to: 600, q: 0.8 })
  },
  land() {
    noise({ dur: 0.1, vol: 0.12, freq: 300, type: 'lowpass' })
  },
  levelUp() {
    arpeggio([523.25, 659.25, 783.99, 1046.5], 0.08, { type: 'triangle', dur: 0.25, vol: 0.12 })
    tone({ freq: 1567.98, type: 'sine', dur: 0.6, vol: 0.08, delay: 0.32 })
  },
  win() {
    arpeggio([659.25, 783.99, 987.77, 1318.5], 0.07, { type: 'square', dur: 0.18, vol: 0.06 })
    arpeggio([1046.5, 1318.5, 1567.98], 0, { type: 'triangle', dur: 0.7, vol: 0.06, delay: 0.3 })
  },
  death() {
    tone({ freq: 480, to: 70, type: 'sawtooth', dur: 0.5, vol: 0.09 })
    noise({ dur: 0.35, vol: 0.12, freq: 600, to: 150 })
  },
  buy() {
    tone({ freq: 1046.5, type: 'square', dur: 0.08, vol: 0.05 })
    tone({ freq: 1567.98, type: 'square', dur: 0.25, vol: 0.05, delay: 0.08 })
  },
  error() {
    tone({ freq: 220, type: 'square', dur: 0.12, vol: 0.05 })
    tone({ freq: 175, type: 'square', dur: 0.18, vol: 0.05, delay: 0.12 })
  },
  click() {
    tone({ freq: 900, type: 'sine', dur: 0.04, vol: 0.05 })
  },
  whoosh() {
    noise({ dur: 0.45, vol: 0.12, freq: 400, to: 3500, q: 0.7 })
  },
}
