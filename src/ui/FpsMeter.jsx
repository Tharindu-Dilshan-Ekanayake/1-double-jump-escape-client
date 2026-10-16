import { useEffect, useRef } from 'react'

import { useGameStore } from '../store/gameStore'

/** Frames per second, top-left, when the Boxity menu's "Show FPS" is on. */
export default function FpsMeter() {
  const show = useGameStore((s) => s.settings.showFps)
  const ref = useRef(null)
  useEffect(() => {
    if (!show) return undefined
    let frames = 0
    let since = performance.now()
    let raf = 0
    const tick = (now) => {
      frames += 1
      if (now - since >= 500) {
        if (ref.current) ref.current.textContent = `${Math.round((frames * 1000) / (now - since))} FPS`
        frames = 0
        since = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [show])
  if (!show) return null
  return <div ref={ref} className="fps-meter pointer-events-none fixed left-2 top-2 z-50" aria-hidden="true" />
}
