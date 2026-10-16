import { useEffect, useRef } from 'react'

import { speedFeel } from '../game/speedFeel'
import { gameState } from '../store/gameStore'

/**
 * Speed lines: white streaks pouring out towards the screen edges (mostly the
 * sides) from where the rider is heading, more and longer the faster you go,
 * with a burst on every forward jump. Drawn on a 2D canvas over the game; the
 * blur down the sides is SpeedBlur in the 3D scene.
 *
 * Every streak is one small pre-drawn sprite, stretched and turned, so a frame
 * full of lines costs a few cheap image draws (no gradients per frame).
 */

const LINE_COUNT = 120
/** Fewer lines on Low graphics. */
const LOW_LINE_COUNT = 60

function spawnLine(line, fresh) {
  // Mostly out to the left and right, some up and down.
  const side = Math.random() < 0.5 ? 0 : Math.PI
  line.angle = Math.random() < 0.82 ? side + (Math.random() - 0.5) * 1.25 : Math.random() * Math.PI * 2
  line.r = fresh ? 0.4 + Math.random() * 0.8 : 0.36 + Math.random() * 0.16
  line.len = 0.14 + Math.random() * 0.3
  line.speed = 0.7 + Math.random() * 1.1
  line.width = 2 + Math.random() * 4.5
}

/** A tapered white streak along +x: a point at the start, widening and brightening to the end. */
function makeStreak() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 16
  const g = canvas.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(235,248,255,1)')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(0, 8)
  g.lineTo(256, 0)
  g.lineTo(256, 16)
  g.closePath()
  g.fill()
  return canvas
}

export function SpeedFx() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas.getContext('2d')
    const streak = makeStreak()
    const lines = Array.from({ length: LINE_COUNT }, () => {
      const line = {}
      spawnLine(line, true)
      return line
    })
    let raf = 0
    let last = performance.now()
    let drawn = false

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const amount = Math.min(1, speedFeel.fx)
      if (amount < 0.03) {
        if (drawn) {
          g.clearRect(0, 0, canvas.width, canvas.height)
          drawn = false
        }
        return
      }
      drawn = true
      const w = canvas.width
      const h = canvas.height
      const cx = w * speedFeel.focusX
      const cy = h * (1 - speedFeel.focusY)
      const rx = w * 0.62
      const ry = h * 0.62
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, w, h)
      const count = gameState().settings.quality === 'low' ? LOW_LINE_COUNT : LINE_COUNT
      const visible = Math.round(count * (0.25 + 0.75 * amount))
      for (let i = 0; i < visible; i += 1) {
        const line = lines[i]
        line.r += line.speed * dt * (0.9 + amount * 3)
        if (line.r > 1.35) spawnLine(line, false)
        // Fade in from the middle so the rider stays clear.
        const alpha = Math.min(0.9, 0.15 + amount * 0.85) * Math.min(1, (line.r - 0.36) / 0.18)
        if (alpha <= 0.01) continue
        const cos = Math.cos(line.angle)
        const sin = Math.sin(line.angle)
        const r1 = line.r + line.len * (0.5 + amount * 1.2)
        const x0 = cx + cos * rx * line.r
        const y0 = cy + sin * ry * line.r
        const dx = cos * rx * (r1 - line.r)
        const dy = sin * ry * (r1 - line.r)
        const length = Math.hypot(dx, dy)
        if (length < 1) continue
        const half = (line.width * (0.6 + amount)) / 2
        // Turn the sprite's +x along the streak and stretch it to length.
        g.setTransform(dx / length, dy / length, -dy / length, dx / length, x0, y0)
        g.globalAlpha = alpha
        g.drawImage(streak, 0, -half, length, half * 2)
      }
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-10 h-full w-full" />
}

export default SpeedFx
