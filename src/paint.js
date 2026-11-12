// Canvas painters for the hub (Escape the Ramps). Everything is procedural:
// the studded grass, truck skins, tyre treads, striped awnings/balloons,
// chain-link mesh, barricade boards, leaderboards, stone, and the outlined
// billboard signs (gradient fills, gem icons, several fonts).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { mulberry32 } from './textures.js'

function cv(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function tex(c, { repeatX = 1, repeatY = 1, srgb = true, wrap = true, aniso = 8 } = {}) {
  const t = new CanvasTexture(c)
  if (wrap) t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.anisotropy = aniso
  if (srgb) t.colorSpace = SRGBColorSpace
  return t
}

const cache = new Map()
export function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

// --- Ground ---------------------------------------------------------------------
// Bright baseplate grass: 2x2 mowing checker (very subtle), fine noise and the
// little dark "studs" flecks the reference grass shows. One tile = 16 m.
export function paintStudGrass(size = 1024) {
  const rand = mulberry32(2207)
  const c = cv(size)
  const ctx = c.getContext('2d')
  const half = size / 2
  ctx.fillStyle = '#57c22c'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#5fca33'
  ctx.fillRect(0, 0, half, half)
  ctx.fillRect(half, half, half, half)
  // Mottling.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 3
    ctx.fillStyle = rand() < 0.5 ? 'rgba(30,110,20,0.10)' : 'rgba(170,240,110,0.08)'
    ctx.fillRect(x, y, r, r)
  }
  // Stud flecks: small chevrons on a loose grid.
  const cell = size / 48
  for (let gy = 0; gy < 48; gy++) {
    for (let gx = 0; gx < 48; gx++) {
      if (rand() < 0.35) continue
      const x = (gx + 0.2 + rand() * 0.6) * cell
      const y = (gy + 0.2 + rand() * 0.6) * cell
      const s = cell * (0.16 + rand() * 0.1)
      ctx.strokeStyle = 'rgba(28,96,18,0.32)'
      ctx.lineWidth = Math.max(1, cell * 0.06)
      ctx.beginPath()
      ctx.moveTo(x - s, y - s * 0.6)
      ctx.lineTo(x, y)
      ctx.lineTo(x - s, y + s * 0.6)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(200,255,150,0.18)'
      ctx.beginPath()
      ctx.moveTo(x - s + 1.5, y - s * 0.6 - 1.5)
      ctx.lineTo(x + 1.5, y - 1.5)
      ctx.stroke()
    }
  }
  return c
}

// Flat plastic with a faint stud speckle (dirt pad, concrete...).
export function paintPlastic(base, speck = 'rgba(0,0,0,0.08)', size = 256, seed = 31) {
  const rand = mulberry32(seed)
  const c = cv(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < size * 3; i++) {
    ctx.fillStyle = rand() < 0.5 ? speck : 'rgba(255,255,255,0.06)'
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2)
  }
  return c
}

// Bands of colour, along v (horizontal stripes) or along u (vertical stripes).
export function paintBands(colors, bands = 8, { vertical = false, size = 256, edge = null } = {}) {
  const c = cv(size)
  const ctx = c.getContext('2d')
  const step = size / bands
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = colors[i % colors.length]
    if (vertical) ctx.fillRect(i * step, 0, step + 1, size)
    else ctx.fillRect(0, i * step, size, step + 1)
    if (edge) {
      ctx.fillStyle = edge
      if (vertical) ctx.fillRect(i * step, 0, Math.max(1, step * 0.06), size)
      else ctx.fillRect(0, i * step, size, Math.max(1, step * 0.06))
    }
  }
  return c
}

// Diagonal hazard stripes (barricade boards, caution poles).
export function paintDiagonal(a = '#ff7a1a', b = '#ffffff', w = 256, h = 64, stripe = 32) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = b
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = a
  for (let x = -h; x < w + h; x += stripe * 2) {
    ctx.beginPath()
    ctx.moveTo(x, h)
    ctx.lineTo(x + stripe, h)
    ctx.lineTo(x + stripe + h, 0)
    ctx.lineTo(x + h, 0)
    ctx.closePath()
    ctx.fill()
  }
  return c
}

// Chain-link mesh: diamond wires on transparent (alphaTest).
export function paintChainLink(size = 128) {
  const c = cv(size)
  const ctx = c.getContext('2d')
  ctx.strokeStyle = 'rgba(200,206,214,1)'
  ctx.lineWidth = 3
  const n = 4
  const s = size / n
  for (let i = -n; i <= n * 2; i++) {
    ctx.beginPath()
    ctx.moveTo(i * s, 0)
    ctx.lineTo(i * s + size, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(i * s, size)
    ctx.lineTo(i * s + size, 0)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(120,128,140,0.9)'
  ctx.lineWidth = 1
  for (let i = -n; i <= n * 2; i++) {
    ctx.beginPath()
    ctx.moveTo(i * s + 1, 0)
    ctx.lineTo(i * s + size + 1, size)
    ctx.stroke()
  }
  return c
}

// Tyre tread: chevron lugs around the circumference (u), across the width (v).
export function paintTread(w = 256, h = 128) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#16171d'
  ctx.fillRect(0, 0, w, h)
  const lugs = 8
  const step = w / lugs
  for (let i = 0; i < lugs; i++) {
    const x = i * step
    ctx.fillStyle = '#2a2c35'
    ctx.beginPath()
    ctx.moveTo(x, h * 0.18)
    ctx.lineTo(x + step * 0.45, h * 0.5)
    ctx.lineTo(x, h * 0.82)
    ctx.lineTo(x + step * 0.3, h * 0.82)
    ctx.lineTo(x + step * 0.75, h * 0.5)
    ctx.lineTo(x + step * 0.3, h * 0.18)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(x + step * 0.05, h * 0.2, step * 0.08, h * 0.6)
  }
  // Sidewall shoulders, darker.
  ctx.fillStyle = '#101116'
  ctx.fillRect(0, 0, w, h * 0.12)
  ctx.fillRect(0, h * 0.88, w, h * 0.12)
  return c
}

// Truck body skins: base colour + pattern ('tiger', 'spots', 'flames', 'stripes',
// 'patches', 'plain'). Small canvas, mapped per face of a rounded box.
export function paintTruckSkin(base, accent, pattern, seed = 7) {
  const size = 256
  const rand = mulberry32(seed)
  const c = cv(size)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, base)
  g.addColorStop(1, base)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // Soft highlight top, darker bottom (reads as plastic shading in flat light).
  const s = ctx.createLinearGradient(0, 0, 0, size)
  s.addColorStop(0, 'rgba(255,255,255,0.14)')
  s.addColorStop(0.5, 'rgba(255,255,255,0)')
  s.addColorStop(1, 'rgba(0,0,0,0.16)')
  ctx.fillStyle = s
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = accent
  ctx.fillStyle = accent
  ctx.lineCap = 'round'
  if (pattern === 'tiger') {
    for (let i = 0; i < 16; i++) {
      const x = rand() * size
      const y = rand() * size
      const len = 30 + rand() * 50
      const a = (rand() - 0.5) * 1.2 + Math.PI / 2
      ctx.lineWidth = 3 + rand() * 4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.bezierCurveTo(x + Math.cos(a) * len * 0.3 + 12, y + Math.sin(a) * len * 0.3, x + Math.cos(a) * len * 0.7 - 12, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len, y + Math.sin(a) * len)
      ctx.stroke()
    }
  } else if (pattern === 'spots') {
    for (let i = 0; i < 22; i++) {
      ctx.beginPath()
      ctx.ellipse(rand() * size, rand() * size, 6 + rand() * 14, 5 + rand() * 10, rand() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (pattern === 'flames') {
    for (let i = 0; i < 7; i++) {
      const x = (i / 7) * size + rand() * 12
      ctx.beginPath()
      ctx.moveTo(x - 14, size)
      ctx.quadraticCurveTo(x - 20, size * 0.55, x + 6, size * (0.25 + rand() * 0.2))
      ctx.quadraticCurveTo(x + 2, size * 0.6, x + 18, size)
      ctx.closePath()
      ctx.fill()
    }
  } else if (pattern === 'stripes') {
    ctx.fillRect(size * 0.36, 0, size * 0.1, size)
    ctx.fillRect(size * 0.54, 0, size * 0.1, size)
  } else if (pattern === 'patches') {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      const x = rand() * size
      const y = rand() * size
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2
        const r = 14 + rand() * 20
        if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
    }
  } else if (pattern === 'zigzag') {
    ctx.lineWidth = 9
    ctx.beginPath()
    for (let x = 0; x <= size; x += 32) ctx.lineTo(x, size * 0.5 + ((x / 32) % 2 ? -18 : 18))
    ctx.stroke()
  }
  return c
}

// Stone blocks (the World 2 portal): grey voxel bricks with edges.
export function paintStone(size = 256) {
  const rand = mulberry32(99)
  const c = cv(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#8f97a6'
  ctx.fillRect(0, 0, size, size)
  const n = 8
  const s = size / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 120 + Math.floor(rand() * 50)
      ctx.fillStyle = `rgb(${v},${v + 6},${v + 18})`
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, 3)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(x * s + 1, y * s + s - 4, s - 2, 3)
    }
  }
  return c
}

// Portal surface: cyan with light swirl blobs (scrolled at runtime).
export function paintPortal(size = 256) {
  const rand = mulberry32(17)
  const c = cv(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#16e6ff'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 40; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 10 + rand() * 30
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(210,255,255,0.55)')
    g.addColorStop(1, 'rgba(210,255,255,0)')
    ctx.fillStyle = g
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) ctx.fillRect(x - r + ox, y - r + oy, r * 2, r * 2)
  }
  return c
}

// Wood planks running along u.
export function paintWood(base = '#6b4326', size = 256, planks = 6, seed = 5) {
  const rand = mulberry32(seed)
  const c = cv(size)
  const ctx = c.getContext('2d')
  const h = size / planks
  for (let i = 0; i < planks; i++) {
    const v = rand() * 0.16 - 0.08
    ctx.fillStyle = base
    ctx.fillRect(0, i * h, size, h)
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`
    ctx.fillRect(0, i * h, size, h)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, i * h, size, 2)
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(rand() * size, i * h + rand() * h, 20 + rand() * 60, 1)
    }
  }
  return c
}

// Leaderboard panel: navy board, header, up to 10 ranked rows ({ name, value } with value already
// formatted) and a footer line. Repaints into `canvas` when given (the hub's live boards).
export function paintLeaderboard(title, accent, rows = [], { footer = '', canvas = null } = {}) {
  const w = 512
  const h = 384
  const c = canvas ?? cv(w, h)
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#1b2440'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#33406a'
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, w - 10, h - 10)
  ctx.fillStyle = accent
  ctx.font = '700 38px Fredoka, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, w / 2, 50)
  ctx.font = '600 21px Fredoka, sans-serif'
  for (let i = 0; i < 10; i++) {
    const y = 84 + i * 27
    const row = rows[i]
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'
    ctx.fillRect(20, y - 19, w - 40, 25)
    ctx.textAlign = 'left'
    ctx.fillStyle = row ? (['#ffd23a', '#d9e2ef', '#e0904a'][i] ?? '#9fb0d6') : '#4a5680'
    const name = row ? row.name : '---'
    ctx.fillText(`${i + 1}. ${name.length > 18 ? `${name.slice(0, 17)}…` : name}`, 32, y)
    if (row) {
      ctx.textAlign = 'right'
      ctx.fillStyle = '#7dff6a'
      ctx.fillText(row.value, w - 32, y)
    }
  }
  if (footer) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 20px Fredoka, sans-serif'
    ctx.fillText(footer, w / 2, 368)
  }
  return c
}

// Small flat sign text (a plate on a barricade, a pedestal name).
export function paintPlate(text, { bg = '#22305a', fg = '#ffffff', w = 256, h = 64, font = '700 34px Fredoka, sans-serif', border = null } = {}) {
  const c = cv(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  if (border) {
    ctx.strokeStyle = border
    ctx.lineWidth = 6
    ctx.strokeRect(3, 3, w - 6, h - 6)
  }
  ctx.fillStyle = fg
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = text.split('\n')
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.4))))
  return c
}

// Square pad with a white up-arrow.
export function paintArrowPad(bg = '#566079') {
  const s = 128
  const c = cv(s)
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, s, s)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, s - 8, s - 8)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(64, 18)
  ctx.lineTo(104, 62)
  ctx.lineTo(78, 62)
  ctx.lineTo(78, 108)
  ctx.lineTo(50, 108)
  ctx.lineTo(50, 62)
  ctx.lineTo(24, 62)
  ctx.closePath()
  ctx.fill()
  return c
}

// --- Billboard signs --------------------------------------------------------------
// lines: [{ text, size = 96, fill = '#fff' | [top, bottom], outline = '#141022',
//   ow (outline width), font = 'lucky' | 'fredoka' | 'pixel', gem = false, italic }]
const FONTS = {
  lucky: '"Luckiest Guy", "Fredoka", "Arial Black", sans-serif',
  fredoka: 'Fredoka, "Arial Black", sans-serif',
  pixel: '"Press Start 2P", "Courier New", monospace',
}
function gemPath(ctx, x, y, r) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}
export function drawGem(ctx, x, y, r) {
  gemPath(ctx, x, y, r)
  ctx.fillStyle = '#18a018'
  ctx.fill()
  ctx.lineWidth = r * 0.28
  ctx.strokeStyle = '#0b3a0b'
  ctx.stroke()
  gemPath(ctx, x, y, r * 0.55)
  ctx.fillStyle = '#5cff3c'
  ctx.fill()
}
export function paintSign(lines, { pad = 18 } = {}) {
  const c = cv(4, 4)
  const draw = () => {
    const ctx = c.getContext('2d')
    const specs = lines.map((l) => {
      const size = l.size ?? 96
      const fam = FONTS[l.font ?? 'lucky']
      const weight = l.font === 'pixel' ? '400' : '700'
      const font = `${l.italic ? 'italic ' : ''}${weight} ${size}px ${fam}`
      ctx.font = font
      const tw = ctx.measureText(l.text).width
      const gw = l.gem ? size * 0.95 : 0
      const ow = l.ow ?? Math.max(4, size * 0.18)
      return { ...l, size, font, tw, gw, ow, w: tw + gw + ow * 2, h: size * (l.font === 'pixel' ? 1.35 : 1.12) + ow }
    })
    c.width = Math.ceil(Math.max(...specs.map((s) => s.w)) + pad * 2)
    c.height = Math.ceil(specs.reduce((a, s) => a + s.h, 0) + pad * 2)
    let y = pad
    for (const s of specs) {
      ctx.font = s.font
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.lineJoin = 'round'
      const x0 = (c.width - s.tw - s.gw) / 2
      const cy = y + s.h / 2
      if (s.gem) drawGem(ctx, x0 + s.size * 0.38, cy, s.size * 0.36)
      const tx = x0 + s.gw
      ctx.lineWidth = s.ow
      ctx.strokeStyle = s.outline ?? '#141022'
      ctx.strokeText(s.text, tx, cy)
      if (Array.isArray(s.fill)) {
        const g = ctx.createLinearGradient(0, cy - s.size / 2, 0, cy + s.size / 2)
        s.fill.forEach((col, i) => g.addColorStop(i / (s.fill.length - 1), col))
        ctx.fillStyle = g
      } else ctx.fillStyle = s.fill ?? '#ffffff'
      ctx.fillText(s.text, tx, cy)
      y += s.h
    }
  }
  draw()
  return { canvas: c, draw }
}

// Outlined down-arrow (the big white one beside "STAGE 1").
export function paintDownArrow() {
  const c = cv(160, 256)
  const ctx = c.getContext('2d')
  ctx.beginPath()
  ctx.moveTo(56, 12)
  ctx.lineTo(104, 12)
  ctx.lineTo(104, 150)
  ctx.lineTo(146, 150)
  ctx.lineTo(80, 240)
  ctx.lineTo(14, 150)
  ctx.lineTo(56, 150)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = '#1a1a22'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.fillRect(84, 16, 18, 134)
  return c
}

// Stop sign face.
export function paintStop() {
  const c = cv(128)
  const ctx = c.getContext('2d')
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    ctx.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60)
  }
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    ctx.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54)
  }
  ctx.closePath()
  ctx.fillStyle = '#d8222a'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '700 30px Fredoka, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('STOP', 64, 66)
  return c
}

export { cv as makeCanvas }
