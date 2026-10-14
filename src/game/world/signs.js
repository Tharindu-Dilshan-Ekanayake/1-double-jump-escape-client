import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three'

import { formatNumber } from '../../shared/gameData.js'

/**
 * Canvas-drawn text for signs, floating labels and the leaderboards, styled like
 * the chunky outlined text of a Roblox simulator.
 */

export const FONT_BODY = '"Fredoka", "Arial Rounded MT Bold", "Segoe UI", sans-serif'
export const FONT_TITLE = '"Luckiest Guy", "Fredoka", "Segoe UI", sans-serif'

const measureCtx = document.createElement('canvas').getContext('2d')

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function fillStyleFor(g, fill, top, bottom) {
  if (!Array.isArray(fill)) return fill
  const grad = g.createLinearGradient(0, top, 0, bottom)
  fill.forEach((color, i) => grad.addColorStop(fill.length === 1 ? 0 : i / (fill.length - 1), color))
  return grad
}

/** Draws outlined text: dark stroke first, then the (optionally gradient) fill. */
export function drawOutlined(g, text, x, y, { size, font = FONT_BODY, weight = 700, fill = '#fff', stroke = '#1d1d26', strokeWidth, align = 'center' }) {
  g.font = `${weight} ${size}px ${font}`
  g.textAlign = align
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.miterLimit = 2
  const sw = strokeWidth ?? Math.max(4, size * 0.16)
  if (stroke && sw > 0) {
    g.strokeStyle = stroke
    g.lineWidth = sw * 2
    g.strokeText(text, x, y)
  }
  g.fillStyle = fillStyleFor(g, fill, y - size / 2, y + size / 2)
  g.fillText(text, x, y)
}

/**
 * Renders lines of text into a canvas sized to fit.
 * lines: [{ text, size, font?, weight?, fill?, stroke?, strokeWidth? }]
 */
export function drawTextBlock(lines, { padding = 18, background = null, border = null, radius = 26, gap = 4 } = {}) {
  let width = 0
  let height = padding * 2
  for (const line of lines) {
    measureCtx.font = `${line.weight ?? 700} ${line.size}px ${line.font ?? FONT_BODY}`
    const sw = line.strokeWidth ?? Math.max(4, line.size * 0.16)
    width = Math.max(width, measureCtx.measureText(line.text).width + sw * 2)
    height += line.size * 1.12 + gap
  }
  height -= gap
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(2048, Math.ceil(width + padding * 2))
  canvas.height = Math.min(1024, Math.ceil(height))
  const g = canvas.getContext('2d')
  if (background) {
    roundRectPath(g, 3, 3, canvas.width - 6, canvas.height - 6, radius)
    g.fillStyle = background
    g.fill()
    if (border) {
      g.lineWidth = 6
      g.strokeStyle = border
      g.stroke()
    }
  }
  let y = padding
  for (const line of lines) {
    const lineHeight = line.size * 1.12
    drawOutlined(g, line.text, canvas.width / 2, y + lineHeight / 2, line)
    y += lineHeight + gap
  }
  return canvas
}

export function canvasTexture(canvas) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Camera-facing label. `height` is in world studs. */
export function textSprite(lines, { height = 4, depthTest = true, ...opts } = {}) {
  const canvas = drawTextBlock(lines, opts)
  const material = new SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false, depthTest })
  const sprite = new Sprite(material)
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1)
  sprite.renderOrder = 2
  return sprite
}

/** Flat sign facing +Z (rotate it to face elsewhere). */
export function textPlane(lines, { height = 4, ...opts } = {}) {
  const canvas = drawTextBlock(lines, opts)
  return canvasPlane(canvas, height)
}

export function canvasPlane(canvas, height) {
  const width = (height * canvas.width) / canvas.height
  const material = new MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false })
  const mesh = new Mesh(new PlaneGeometry(width, height), material)
  mesh.renderOrder = 1
  return mesh
}

/* ---------------------------------------------------------------------------
 * Special signs
 * ------------------------------------------------------------------------- */

function drawJumpButton(g, cx, cy, r) {
  g.fillStyle = 'rgba(20,24,34,0.85)'
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = r * 0.12
  g.strokeStyle = '#ffffff'
  g.stroke()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(cx, cy - r * 0.55)
  g.lineTo(cx + r * 0.42, cy + r * 0.05)
  g.lineTo(cx + r * 0.16, cy + r * 0.05)
  g.lineTo(cx + r * 0.16, cy + r * 0.5)
  g.lineTo(cx - r * 0.16, cy + r * 0.5)
  g.lineTo(cx - r * 0.16, cy + r * 0.05)
  g.lineTo(cx - r * 0.42, cy + r * 0.05)
  g.closePath()
  g.fill()
}

function drawChevron(g, cx, cy, s) {
  g.fillStyle = '#ffffff'
  g.strokeStyle = 'rgba(30,40,60,0.6)'
  g.lineWidth = 6
  for (const dy of [0, s * 0.62]) {
    g.beginPath()
    g.moveTo(cx, cy + dy - s * 0.5)
    g.lineTo(cx + s * 0.55, cy + dy + s * 0.1)
    g.lineTo(cx + s * 0.32, cy + dy + s * 0.1)
    g.lineTo(cx, cy + dy - s * 0.2)
    g.lineTo(cx - s * 0.32, cy + dy + s * 0.1)
    g.lineTo(cx - s * 0.55, cy + dy + s * 0.1)
    g.closePath()
    g.fill()
    g.stroke()
  }
}

/** "SPAM JUMP TO CLIMB!" panel for a climbing wall's face. */
export function climbWallSign(level, width = 30, first = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 1400
  canvas.height = 420
  const g = canvas.getContext('2d')
  for (const x of [170, canvas.width - 170]) {
    drawChevron(g, x, 120, 120)
    drawJumpButton(g, x, 320, 70)
  }
  drawOutlined(g, 'SPAM JUMP', 700, 95, { size: 120, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#dfe9ff'], strokeWidth: 14 })
  drawOutlined(g, 'TO CLIMB!', 700, 225, { size: 100, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#dfe9ff'], strokeWidth: 13 })
  const label = first ? `Hold SPACE to keep jumping  •  Level ${level}+` : `Level ${level}+ to climb over!`
  drawOutlined(g, label, 700, 345, { size: 64, fill: ['#fff47a', '#ffb81f'], strokeWidth: 10 })
  return canvasPlane(canvas, (width * canvas.height) / canvas.width)
}

/** "HOLD JUMP TO FLY ACROSS!" floating over the edge of a long gap. */
export function gapSign(level, first = false) {
  return textSprite(
    [
      { text: first ? 'DOUBLE JUMP ACROSS!' : 'HOLD JUMP TO FLY ACROSS!', size: 72, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#cfe9ff'], strokeWidth: 10 },
      { text: first ? 'Jump at the edge, then jump again in the air' : `Level ${level}+ recommended`, size: 44, fill: ['#fff47a', '#ffb81f'] },
    ],
    { height: 5.6 },
  )
}

/** The orange "RECOMMENDED LEVEL: 5" board at the end of a plateau, like the original. */
export function recommendBoard({ stage, level, bootName, rebirths }) {
  const lines = [
    { text: `STAGE ${stage}`, size: 40, fill: '#fff3c4' },
    { text: 'RECOMMENDED', size: 54, fill: '#ffffff' },
    { text: `LEVEL: ${level}`, size: 64, fill: ['#ffffff', '#ffe2a8'] },
  ]
  if (bootName) lines.push({ text: `🥾 ${bootName}`, size: 40, fill: '#ffffff' })
  if (rebirths) lines.push({ text: `🔄 ${rebirths} REBIRTH${rebirths > 1 ? 'S' : ''}`, size: 44, fill: '#ffd6ff' })
  return textPlane(lines, { height: 3.2 + lines.length * 1.25, background: '#ff8a1f', border: '#ffd27a', padding: 22, radius: 22, gap: 6 })
}

/** Text across a rebirth door. */
export function doorSign(rebirths) {
  return textPlane(
    [
      { text: '🔒 REBIRTH DOOR', size: 70, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#ffd6ff'] },
      { text: `${rebirths} Rebirth${rebirths > 1 ? 's' : ''} needed`, size: 56, fill: ['#fff47a', '#ffb81f'] },
    ],
    { height: 9 },
  )
}

const RANK_COLORS = ['#ffd23f', '#d7dde6', '#e09a5a']

/** Redraws a leaderboard panel. `rows` = [{ name, value }]. */
export function drawLeaderboard(canvas, board, rows) {
  const g = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  g.clearRect(0, 0, W, H)
  g.fillStyle = board.color
  roundRectPath(g, 0, 0, W, H, 34)
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.22)'
  roundRectPath(g, 26, 112, W - 52, H - 138, 22)
  g.fill()

  drawOutlined(g, board.subtitle, W / 2, 60, { size: 62, strokeWidth: 9 })
  const cols = [70, 150, W - 60]
  drawOutlined(g, 'Rank', cols[0], 150, { size: 30, strokeWidth: 5, fill: '#f2f2f2' })
  drawOutlined(g, 'Username', cols[1], 150, { size: 30, strokeWidth: 5, align: 'left', fill: '#f2f2f2' })
  drawOutlined(g, 'Value', cols[2], 150, { size: 30, strokeWidth: 5, align: 'right', fill: '#f2f2f2' })

  for (let i = 0; i < 10; i += 1) {
    const y = 205 + i * 66
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'
    roundRectPath(g, 40, y - 28, W - 80, 56, 14)
    g.fill()
    const row = rows[i]
    drawOutlined(g, `#${i + 1}`, cols[0], y, { size: 36, strokeWidth: 6, fill: RANK_COLORS[i] || '#ffffff' })
    if (!row) continue
    let name = row.name
    g.font = `700 36px ${FONT_BODY}`
    while (g.measureText(name).width > W - 330 && name.length > 3) name = `${name.slice(0, -2)}…`
    drawOutlined(g, name, cols[1], y, { size: 36, strokeWidth: 6, align: 'left', fill: RANK_COLORS[i] || '#ffffff' })
    drawOutlined(g, formatNumber(row.value), cols[2], y, { size: 34, strokeWidth: 6, align: 'right', fill: '#fff8c4' })
  }
}
