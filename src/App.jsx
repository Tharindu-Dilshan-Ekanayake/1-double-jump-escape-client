import { lazy, Suspense, useEffect } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import GameScene from './game/GameScene'
import { avatarPayload, send } from './net/connection'
import { useGameStore } from './store/gameStore'
import AutoJoin from './ui/AutoJoin'
import FpsMeter from './ui/FpsMeter'
import Hud from './ui/Hud'
import Panels from './ui/panels/Panels'
import SpeedFx from './ui/SpeedFx'
import TouchControls from './ui/TouchControls'

/** Dev tools (F2): only in `npm run dev`, never in the published game. */
const DevPanel = import.meta.env.DEV ? lazy(() => import('./dev/DevPanel')) : null

/** HUD size relative to the window, kept small so the game stays in view. */
const HUD_SCALE = 0.78

/** Shrinks the UI on small windows; the layout is designed at 1600x900. */
function useUiScale() {
  useEffect(() => {
    const update = () => {
      const scale = Math.max(0.45, Math.min(1.15, window.innerWidth / 1600, window.innerHeight / 900))
      document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3))
      document.documentElement.style.setProperty('--hud-scale', (scale * HUD_SCALE).toFixed(3))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
}

/** Keeps other players' view of our avatar current if it changes mid-game. */
function useAvatarSync() {
  const bloxity = useBloxity()
  const phase = useGameStore((s) => s.phase)
  const payload = avatarPayload(bloxity)
  useEffect(() => {
    if (phase === 'playing') send('avatar', { avatar: payload })
  }, [phase, payload])
}

function App() {
  useUiScale()
  useAvatarSync()
  return (
    <div className="relative h-screen w-screen select-none overflow-hidden bg-slate-900">
      <GameScene />
      <SpeedFx />
      <Hud />
      <Panels />
      <TouchControls />
      <AutoJoin />
      <FpsMeter />
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  )
}

export default App
