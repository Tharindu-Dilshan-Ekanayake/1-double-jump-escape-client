import { useEffect, useRef } from 'react'

import { speedFeel } from '../game/speedFeel'

/**
 * Speed lines: white streaks pouring out towards the screen edges (mostly the
 * sides) from where the rider is heading, more and longer the faster you go,
 * with a burst on every jump. Drawn on a 2D canvas over the game; the blur
 * down the sides is SpeedBlur in the 3D scene.
 */

const LINE_COUNT = 120

function spawnLine(line, fresh) {
  // Mostly out to the left and right, some up and down.
  const side = Math.random() < 0.5 ? 0 : Math.PI
  line.angle = Math.random() < 0.82 ? side + (Math.random() - 0.5) * 1.25 : Math.random() * Math.PI * 2
  line.r = fresh ? 0.4 + Math.random() * 0.8 : 0.36 + Math.random() * 0.16
  line.len = 0.14 + Math.random() * 0.3
  line.speed = 0.7 + Math.random() * 1.1
  line.width = 2 + Math.random() * 4.5
}

export function SpeedFx() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas.getContext('2d')
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
      const amount = Math.min(1, speedFeel.amount * (1 + 0.6 * speedFeel.kick))
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
      g.clearRect(0, 0, w, h)
      const visible = Math.round(LINE_COUNT * (0.25 + 0.75 * amount))
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
        const x1 = cx + cos * rx * r1
        const y1 = cy + sin * ry * r1
        // A tapered streak: a point at the inner end, widening outwards.
        const half = (line.width * (0.6 + amount)) / 2
        const nx = -sin * half
        const ny = cos * half
        const grad = g.createLinearGradient(x0, y0, x1, y1)
        grad.addColorStop(0, 'rgba(255,255,255,0)')
        grad.addColorStop(0.5, `rgba(255,255,255,${(alpha * 0.8).toFixed(3)})`)
        grad.addColorStop(1, `rgba(235,248,255,${alpha.toFixed(3)})`)
        g.fillStyle = grad
        g.beginPath()
        g.moveTo(x0, y0)
        g.lineTo(x1 + nx, y1 + ny)
        g.lineTo(x1 - nx, y1 - ny)
        g.closePath()
        g.fill()
      }
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
