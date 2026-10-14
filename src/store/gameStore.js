import { create } from 'zustand'

/**
 * Everything the HUD renders, in one zustand store.
 *
 * Written by the network layer (`net/connection.js`) and the local player
 * controller; read by React components. Per-frame data (positions, velocities)
 * deliberately does NOT live here — see `game/playerState.js` — so the HUD only
 * re-renders when something it shows actually changes.
 */

const SETTINGS_KEY = 'double-jump-escape:settings:v1'

function loadSettings() {
  const defaults = { music: true, sfx: true, musicVolume: 0.6, sfxVolume: 0.8, quality: 'high', customJump: null }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return defaults
  }
}

let toastId = 0

export const useGameStore = create((set, get) => ({
  /** @type {'menu'|'connecting'|'playing'|'disconnected'} */
  phase: 'menu',
  /** A join attempt failed (retried quietly; never shown as text). */
  joinFailed: false,
  /** False after another window took over this profile (don't auto-rejoin). */
  canRetry: true,
  /** True once the first join succeeded (the host's loading screen is gone). */
  everPlayed: false,
  /** True once the 3D world has drawn its first frame. */
  worldReady: false,
  /** My server-side stats (see PlayerState on the server). Null until joined. */
  me: null,
  playerCount: 0,
  /** Global top-10 lists keyed by stat. */
  leaderboards: { totalJump: [], wins: [], rebirths: [] },
  /** Abyssal Hydra Boots left across every server. */
  hydraLeft: 0,

  /** Open window: { id, props } or null. */
  panel: null,
  toasts: [],
  levelUp: null,
  /** The last goal finished ({ text, reward, at }), for the banner's celebration. */
  goalDone: null,
  /** What "Press E" would do right now: { kind, id } or null. */
  prompt: null,
  /** Jumps left in this air-time and the most you get. */
  jumps: { left: 1, max: 1 },
  /** 0 in the lobby, else the stage you're on. */
  stage: 0,
  /** Set while dead on the course: { stage, safe: {x,y,z}|null, at }. */
  death: null,
  settings: loadSettings(),

  setPhase: (phase, extra = {}) => set({ phase, ...extra }),

  /** Automatic popups (welcome, daily reward) waiting for the open window to close. */
  panelQueue: [],

  openPanel: (id, props = {}) => set({ panel: { id, props } }),
  /** Opens now if nothing is open, else right after the open window closes. */
  queuePanel: (id, props = {}) => {
    if (!get().panel) set({ panel: { id, props } })
    else set((s) => ({ panelQueue: [...s.panelQueue, { id, props }] }))
  },
  closePanel: (id) => {
    const { panel, panelQueue } = get()
    if (!panel || (id && panel.id !== id)) return
    set({ panel: panelQueue[0] ?? null, panelQueue: panelQueue.slice(1) })
  },

  toast: (text, kind = 'info', ms = 2600) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },

  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Private mode: settings just won't persist.
    }
    set({ settings })
  },
}))

export const gameState = () => useGameStore.getState()
