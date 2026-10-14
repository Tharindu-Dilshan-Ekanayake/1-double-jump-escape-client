/**
 * Wins rain: when Wins come in (a stage pad, the daily reward…) a shower of
 * trophies drops over the screen, bounces, then flies into the Wins counter.
 *
 * One fixed 2D canvas over the game, created on first use. Like fx.js it lives
 * outside React; it only animates while trophies are in the air.
 */

const TROPHY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M14 10h36v8c0 12-7 20-18 20S14 30 14 18z" fill="#ffc21a" stroke="#15151d" stroke-width="4" stroke-linejoin="round"/>
  <path d="M14 14H6c0 10 5 15 12 15M50 14h8c0 10-5 15-12 15" fill="none" stroke="#15151d" stroke-width="4"/>
  <path d="M14 14H6c0 10 5 15 12 15M50 14h8c0 10-5 15-12 15" fill="none" stroke="#ffc21a" stroke-width="2"/>
  <rect x="27" y="37" width="10" height="10" fill="#e8a010" stroke="#15151d" stroke-width="4"/>
  <rect x="18" y="46" width="28" height="9" rx="2" fill="#ffc21a" stroke="#15151d" stroke-width="4"/>
  <path d="M22 15c0 8 3 13 8 15" fill="none" stroke="#fff6c8" stroke-width="3" stroke-linecap="round"/>
</svg>`

const GRAVITY = 1700
const MAX_TROPHIES = 70

let canvas = null
let g = null
let image = null
let raf = 0
let last = 0
const trophies = []
const sparkles = []

function setup() {
  if (canvas) return
  canvas = document.createElement('canvas')
  canvas.className = 'wins-rain'
  document.body.appendChild(canvas)
  g = canvas.getContext('2d')
  image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TROPHY_SVG)}`
  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)
}

/** Where trophies fly to: the Wins counter's trophy, or the bottom-left corner. */
function counterTarget() {
  const icon = document.querySelector('.wins-counter .wins-icon')
  const rect = icon?.getBoundingClientRect()
  if (!rect || !rect.width) return { x: 70, y: canvas.height - 70 }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function bumpCounter() {
  const pill = document.querySelector('.wins-counter')
  if (!pill) return
  pill.classList.remove('pill-hit')
  // Restart the CSS animation.
  void pill.offsetWidth
  pill.classList.add('pill-hit')
}

/** Starts a trophy shower; bigger rewards rain more trophies. */
export function rainWins(amount = 1) {
  setup()
  const count = Math.min(MAX_TROPHIES, Math.round(16 + Math.log10(Math.max(1, amount)) * 16))
  const w = canvas.width
  const h = canvas.height
  const scale = Math.max(0.6, Math.min(1.3, h / 900))
  for (let i = 0; i < count && trophies.length < MAX_TROPHIES * 2; i += 1) {
    trophies.push({
      x: w * (0.08 + Math.random() * 0.84),
      y: -40 - Math.random() * h * 0.7,
      vx: (Math.random() - 0.5) * 160,
      vy: 150 + Math.random() * 250,
      rot: (Math.random() - 0.5) * 1.2,
      spin: (Math.random() - 0.5) * 7,
      size: (38 + Math.random() * 30) * scale,
      floor: h * (0.78 + Math.random() * 0.16),
      bounces: 0,
      age: 0,
      // When it stops falling and heads for the counter.
      collectAt: 1.15 + Math.random() * 0.9,
      fly: null,
    })
  }
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
}

function sparkle(x, y, n = 5) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2
    const s = 80 + Math.random() * 220
    sparkles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.45 + Math.random() * 0.3, age: 0 })
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  g.clearRect(0, 0, canvas.width, canvas.height)
  const target = counterTarget()

  for (let i = trophies.length - 1; i >= 0; i -= 1) {
    const t = trophies[i]
    t.age += dt
    if (!t.fly && t.age >= t.collectAt) {
      t.fly = { x0: t.x, y0: t.y, k: 0, dur: 0.45 + Math.random() * 0.25, arc: -120 - Math.random() * 160 }
    }
    let alpha = 1
    let size = t.size
    if (t.fly) {
      // Curve into the counter, shrinking on the way.
      const f = t.fly
      f.k = Math.min(1, f.k + dt / f.dur)
      const e = f.k * f.k * (3 - 2 * f.k)
      t.x = f.x0 + (target.x - f.x0) * e
      t.y = f.y0 + (target.y - f.y0) * e + Math.sin(Math.PI * e) * f.arc
      t.rot += t.spin * dt * 2
      size = t.size * (1 - 0.55 * e)
      if (f.k >= 1) {
        sparkle(target.x, target.y, 3)
        bumpCounter()
        trophies.splice(i, 1)
        continue
      }
    } else {
      t.vy += GRAVITY * dt
      t.x += t.vx * dt
      t.y += t.vy * dt
      t.rot += t.spin * dt
      if (t.y > t.floor && t.vy > 0) {
        t.y = t.floor
        t.vy *= -(0.42 - t.bounces * 0.12)
        t.vx *= 0.7
        t.spin *= 0.6
        t.bounces += 1
        if (t.bounces === 1) sparkle(t.x, t.y + size * 0.3, 4)
      }
      alpha = Math.min(1, (t.y + 40) / 80)
    }
    if (alpha <= 0) continue
    g.save()
    g.globalAlpha = Math.max(0, alpha)
    g.translate(t.x, t.y)
    g.rotate(t.rot)
    if (image.complete) g.drawImage(image, -size / 2, -size / 2, size, size)
    g.restore()
  }

  for (let i = sparkles.length - 1; i >= 0; i -= 1) {
    const s = sparkles[i]
    s.age += dt
    if (s.age >= s.life) {
      sparkles.splice(i, 1)
      continue
    }
    s.vy += 500 * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    const k = 1 - s.age / s.life
    g.fillStyle = `rgba(255, 236, 120, ${k.toFixed(3)})`
    g.beginPath()
    g.arc(s.x, s.y, 2 + 4 * k, 0, Math.PI * 2)
    g.fill()
  }

  if (trophies.length || sparkles.length) raf = requestAnimationFrame(frame)
  else {
    raf = 0
    g.clearRect(0, 0, canvas.width, canvas.height)
  }
}
