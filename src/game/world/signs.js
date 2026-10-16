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

/** "JUMP AT THE EDGE!" floating over the long jump into one of the first stages. */
export function gapSign(jumps, first = false) {
  return textSprite(
    [
      { text: first ? 'JUMP AT THE EDGE!' : 'HOLD JUMP TO FLY ACROSS!', size: 72, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#cfe9ff'], strokeWidth: 10 },
      { text: first ? 'Run, and jump right before the edge' : `Needs ${jumps} jumps: jump, then jump again in the air`, size: 44, fill: ['#fff47a', '#ffb81f'] },
    ],
    { height: 4.2 },
  )
}

/**
 * What a stage needs, under its "Stage N" title over the corridor into it:
 * "🦘 5 JUMPS · 🥾 ROCKET BOOTS" in the same white-and-navy letters. Faces +Z.
 */
export function stageNeedsSign({ jumps, bootName, rebirths }) {
  const parts = [`🦘 ${jumps} JUMP${jumps > 1 ? 'S' : ''}`]
  if (bootName) parts.push(`🥾 ${bootName.toUpperCase()}`)
  if (rebirths) parts.push(`🔄 ${rebirths} REBIRTH${rebirths > 1 ? 'S' : ''}`)
  return textPlane([{ text: parts.join('  ·  '), size: 70, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#e4e9ff'], stroke: '#1e2a8c', strokeWidth: 12 }], { height: 2.6, padding: 10 })
}

/**
 * "Stage 5" over a doorway: chunky white letters with a thick navy outline and
 * a little depth below them, like the original's signs. Faces +Z.
 */
export function stageTitleSign(text, height = 9.5) {
  const size = 200
  const pad = 50
  const depth = 16
  measureCtx.font = `400 ${size}px ${FONT_TITLE}`
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(2048, Math.ceil(measureCtx.measureText(text).width + pad * 2 + 44))
  canvas.height = Math.ceil(size * 1.28 + depth + pad)
  const g = canvas.getContext('2d')
  const cx = canvas.width / 2
  const cy = pad / 2 + size * 0.64
  for (let d = depth; d > 0; d -= 2) {
    drawOutlined(g, text, cx, cy + d, { size, font: FONT_TITLE, weight: 400, fill: '#151a5e', stroke: '#151a5e', strokeWidth: 22 })
  }
  drawOutlined(g, text, cx, cy, { size, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#e4e9ff'], stroke: '#1e2a8c', strokeWidth: 20 })
  return canvasPlane(canvas, height)
}

/** The board next to a world's door: what's there and what it takes. Faces +Z. */
export function worldInfoBoard(world, stages, firstBootName) {
  const best = stages[world.lastStage - 1]
  const lines = [
    { text: world.name.toUpperCase(), size: 110, font: FONT_TITLE, weight: 400, fill: ['#ffffff', '#e2c9ff'], strokeWidth: 12 },
    { text: `Stages ${world.firstStage}-${world.lastStage}`, size: 50, fill: '#ffffff' },
    { text: `🔄 ${world.rebirths} Rebirth${world.rebirths > 1 ? 's' : ''} needed`, size: 50, fill: '#ffd6ff' },
  ]
  if (firstBootName) lines.push({ text: `🥾 ${firstBootName} for Stage ${world.firstStage}`, size: 44, fill: '#ffffff' })
  lines.push({ text: `Up to 🏆 ${formatNumber(best.wins)} Wins a stage!`, size: 44, fill: ['#fff47a', '#ffb81f'] })
  return textPlane(lines, { height: 12, background: '#5b2bd9', border: '#ffd23a', padding: 26, radius: 20, gap: 8 })
}

/** Text across a stage door: the boots (and rebirths) it needs. */
export function doorSign({ bootName, rebirths }) {
  const lines = []
  if (bootName) lines.push({ text: `🔒 ${bootName} needed`, size: 64, font: FONT_TITLE, weight: 400, fill: ['#fff47a', '#ffb81f'], stroke: '#3a2400', strokeWidth: 10 })
  if (rebirths) lines.push({ text: `🔄 ${rebirths} Rebirth${rebirths > 1 ? 's' : ''} needed`, size: 52, fill: '#ffd6ff' })
  lines.push({ text: 'Buy them in the lobby with Wins', size: 36, fill: '#ffffff' })
  return textPlane(lines, { height: 1.6 + lines.length * 1.3, padding: 12 })
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
