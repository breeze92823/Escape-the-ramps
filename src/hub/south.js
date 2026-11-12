import { DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, ShapeGeometry } from 'three'
import { sign } from '../propkit.js'
import { createSparkleField } from '../effects.js'
import { mulberry32 } from '../textures.js'
import { cached, paintChainLink, paintPlate, paintPortal, paintStone, paintStop, paintWood, tex } from '../paint.js'
import { HUB } from './layout.js'
import { G, barricade, block, box, cone, floorArrow, jersey, mat, mesh, place, solid, solidLocal } from './kit.js'

// The south end: a chain-link fence across the whole field closes the road
// (red/white jersey barriers, ROAD CLOSED barricades, cones in front), the
// closed stretch beyond with its arrows and a stop sign, and the World 2
// portal ("COMING SOON") by the showroom: a rough stone arch around a
// swirling cyan face on a plank deck.

function chainFence(statics, x0, x1, z, h = 4.2) {
  const len = x1 - x0
  const post = mat('#9aa2ae', { metalness: 0.6, roughness: 0.4 })
  const n = Math.round(len / 5)
  for (let i = 0; i <= n; i++) mesh(statics, G.cyl8, post, x0 + (i / n) * len, h / 2, z, 0.09, h, 0.09)
  mesh(statics, G.cyl8, post, (x0 + x1) / 2, h, z, 0.06, len, 0.06).rotation.z = Math.PI / 2
  mesh(statics, G.cyl8, post, (x0 + x1) / 2, 0.15, z, 0.05, len, 0.05).rotation.z = Math.PI / 2
  const meshMat = cached('mat:chain', () => new MeshStandardMaterial({ map: tex(paintChainLink(), { repeatX: len / 1.6, repeatY: h / 1.6 }), alphaTest: 0.5, transparent: false, side: DoubleSide, roughness: 0.5, metalness: 0.5 }))
  const plane = new Mesh(new PlaneGeometry(len, h), meshMat)
  plane.position.set((x0 + x1) / 2, h / 2, z)
  plane.castShadow = true
  statics.add(plane)
  solid((x0 + x1) / 2, 0, z, len, 6, 0.6)
}

function portal(ctx) {
  const { statics, live } = ctx
  const P = HUB.portal
  const yaw = Math.atan2(-P.x, -P.z) * 0.35 - Math.PI / 2 * 0.65 // faces back toward the hub (west-ish)
  const g = place(statics, P.x, 0, P.z, yaw)
  const deck = cached('mat:deck', () => new MeshStandardMaterial({ map: tex(paintWood('#b07a44', 256, 6, 3), { repeatX: 2, repeatY: 1 }), roughness: 0.85 }))
  block(g, deck, 0, 0, 1.5, 12, 0.3, 7)
  // Stone arch: voxel blocks around an ellipse, ragged outer edge.
  const stone = cached('mat:stone', () => new MeshStandardMaterial({ map: tex(paintStone(), { repeatX: 0.5, repeatY: 0.5 }), roughness: 0.85 }))
  const rand = mulberry32(42)
  const ax = 3.0
  const ay = 3.6
  const cy = 4.0
  const step = 0.8
  for (let x = -6; x <= 6; x += step) {
    for (let y = 0.3; y <= 9; y += step) {
      const nx = x / ax
      const ny = (y - cy) / ay
      const d = nx * nx + ny * ny
      const outer = 1.9 + rand() * 0.55
      if (d < 1 || d > outer) continue
      const depth = 1.4 + rand() * 0.9
      block(g, stone, x, y - step / 2, 0, step, step, depth)
    }
  }
  // Portal face.
  const faceTex = tex(paintPortal(), { repeatX: 1, repeatY: 1 })
  const face = new MeshStandardMaterial({ map: faceTex, emissive: '#1fe8ff', emissiveMap: faceTex, emissiveIntensity: 1.3, roughness: 0.2 })
  const s = new Shape()
  s.absellipse(0, 0, ax * 1.02, ay * 1.02, 0, Math.PI * 2)
  const fm = new Mesh(new ShapeGeometry(s, 40), face)
  // ShapeGeometry UVs are in shape units: rescale to 0..1-ish.
  const uv = fm.geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6 + 0.5, uv.getY(i) / 7 + 0.5)
  const fg = place(live, P.x, 0, P.z, yaw)
  fm.position.set(0, cy, 0)
  fg.add(fm)
  const back = fm.clone()
  back.rotation.y = Math.PI
  fg.add(back)
  ctx.anim.push((dt, t) => {
    faceTex.offset.set(Math.sin(t * 0.4) * 0.2, t * 0.12)
    faceTex.rotation = t * 0.15
    faceTex.center.set(0.5, 0.5)
  })
  createSparkleField(live, { x: P.x, y: 0.5, z: P.z, radius: 3.4, height: 8, count: 30, color: '#7ff4ff', size: 0.5, seed: 61 })
  solidLocal(g, 0, 0, 0, 11, 9, 2.2)
  const l = sign([
    { text: 'COMING SOON', size: 48, font: 'pixel', fill: ['#7ff8ff', '#16c8ff'], outline: '#0b2a6a', ow: 10 },
    { text: 'World 2', size: 26, font: 'pixel', fill: '#e8ecf4', outline: '#2a2f3a', ow: 7 },
  ], 2.2)
  l.position.set(P.x, 11.2, P.z)
  live.add(l)
  ctx.prompts.push({ x: P.x, z: P.z, r: 8, title: 'World 2', action: 'Coming soon', kind: 'info', text: 'World 2 is coming soon!' })
}

export function buildSouth(ctx) {
  const { statics } = ctx
  const { west: W, east: E } = HUB.field
  const Z = HUB.fence.z
  chainFence(statics, W + 0.5, E - 0.5, Z)

  // In front of the fence: jersey barriers, barricades with ROAD CLOSED plates, cones.
  ;[6, 8.2, 10.4, 12.6].forEach((x, i) => jersey(statics, x, Z - 1.6, 0, i % 2 ? '#f4f5f7' : '#e3262e'))
  const plate = cached('mat:roadclosed', () => new MeshStandardMaterial({ map: tex(paintPlate('ROAD\nCLOSED', { bg: '#f4f5f7', fg: '#1a2a5a', w: 128, h: 64, font: '700 24px Fredoka, sans-serif', border: '#1a2a5a' }), { wrap: false }) }))
  for (const x of [-4, -10, -16, -22, -30, -38, 20, 28, 36]) barricade(statics, x, Z - 1.8, 0, plate)
  const rand = mulberry32(5)
  for (let i = 0; i < 12; i++) cone(statics, -44 + rand() * 90, Z - 3.5 - rand() * 3, 0.9 + rand() * 0.3)

  // Beyond: the closed stretch (arrows back north) and a stop sign at its end.
  floorArrow(statics, 0, 128, Math.PI, 12, 3, 5, 8)
  floorArrow(statics, -30, 134, Math.PI, 10, 2.6, 4.5, 7)
  floorArrow(statics, 34, 126, Math.PI, 10, 2.6, 4.5, 7)
  floorArrow(statics, 0, 112, Math.PI, 10, 2.6, 4.5, 7)
  const S = HUB.stop
  mesh(statics, G.cyl8, mat('#9aa2ae', { metalness: 0.5 }), S.x, 1.6, S.z, 0.08, 3.2, 0.08)
  const stopMat = cached('mat:stop', () => new MeshStandardMaterial({ map: tex(paintStop(), { wrap: false }), transparent: true, alphaTest: 0.5 }))
  const sp = new Mesh(new PlaneGeometry(1.5, 1.5), stopMat)
  sp.position.set(S.x, 3.3, S.z - 0.1)
  sp.rotation.y = Math.PI
  statics.add(sp)

  portal(ctx)
}
