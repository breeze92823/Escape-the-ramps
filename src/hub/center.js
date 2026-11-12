import { DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, ShapeGeometry, ExtrudeGeometry, TorusGeometry, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, BoxGeometry, Group } from 'three'
import { CARS } from '../config.js'
import { sign } from '../propkit.js'
import { buildTruck } from '../truck.js'
import { bake } from '../bake.js'
import { createSparkleField } from '../effects.js'
import { mulberry32 } from '../textures.js'
import { cached, paintDownArrow, paintPlastic, paintPlate, paintWood, tex, paintBands } from '../paint.js'
import { buildDefaultCharacter } from '../avatar/character.js'
import { HUB } from './layout.js'
import {
  G, balloon, bandMat, block, box, chrome, cone, floorArrow, glowMat, gold, guardrail, jerseyRow, mat, mesh, place, rod, solid, solidHull, solidLocal, solidMesh, stanchions, stripGeometry, trophy,
} from './kit.js'

// Spawn and everything around it: the dirt spawn pad, the floor arrows that
// all point north to Stage 1, the blue boost ramp that jumps the gap into the
// lane (stages.js),
// the 2X WINS trophy, Group Rewards chest,
// Tuning Shop (with its shopkeeper), the FROG display, the Gear Magnet, the
// red/white barrier line and the hot-air balloons.

export const priceLines = (top, gems, sub) => [
  { text: top, size: 64, font: 'pixel', fill: '#ffffff', outline: '#14141c', ow: 12 },
  sub ? { text: sub, size: 30, font: 'pixel', fill: '#ffb21a', outline: '#3a1a00', ow: 8 } : { text: String(gems), size: 34, font: 'pixel', fill: '#4dff3a', outline: '#0b3a0b', ow: 9, gem: true },
]

// Dirt pad: a square of brown studded plastic with ragged edge tiles and a
// few grey-blue plates scattered on it.
function dirtPad(parent, x, z, size, seed = 4, grey = 10) {
  const rand = mulberry32(seed)
  const dirt = cached('mat:dirtpad', () => new MeshStandardMaterial({ map: tex(paintPlastic('#ad7550', 'rgba(60,30,10,0.12)', 128, 3), { repeatX: 1, repeatY: 1 }), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }))
  const plate = mat('#8f97ab', { roughness: 0.7 })
  block(parent, dirt, x, 0, z, size, 0.06, size, false)
  const h = size / 2
  for (let i = 0; i < size * 2.2; i++) {
    const side = Math.floor(rand() * 4)
    const t = (rand() - 0.5) * size * 1.05
    const off = h + (rand() - 0.3) * 1.6
    const s = 0.5 + rand() * 1.4
    const px = side === 0 ? -off : side === 1 ? off : t
    const pz = side === 2 ? -off : side === 3 ? off : t
    block(parent, dirt, x + px, 0, z + pz, s, 0.065, s * (0.6 + rand() * 0.8), false)
  }
  for (let i = 0; i < grey; i++) {
    const s = 0.5 + rand() * 0.9
    block(parent, plate, x + (rand() - 0.5) * (size + 2), 0.005, z + (rand() - 0.5) * (size + 2), s, 0.07, s * 0.6, false)
  }
}
export { dirtPad }

// Pedestal with a slowly turning truck and a price sign (FROG, BULL).
export function carDisplay(ctx, id, x, z, { yaw = 0, ropes = false, concrete = false } = {}) {
  const car = CARS[id]
  const g = place(ctx.statics, x, 0, z, yaw)
  if (concrete) block(g, mat('#9aa1ad', { roughness: 0.85 }), 0, 0, 0, 15, 0.08, 13, false)
  block(g, mat('#252a38'), 0, 0, 0, 8.6, 0.7, 8.6)
  block(g, mat('#2f3546'), 0, 0.7, 0, 8.0, 0.55, 8.0)
  block(g, glowMat('#ffe21a', 1.6), 0, 1.25, 0, 7.0, 0.08, 7.0, false)
  const plate = cached(`mat:plate:${id}`, () => new MeshStandardMaterial({ map: tex(paintPlate(car.name.toUpperCase(), { bg: '#252a38', fg: '#e8ecf5', font: '700 36px Fredoka, sans-serif' }), { wrap: false }) }))
  box(g, plate, 0, 0.45, 4.31, 2.4, 0.5, 0.02, false)
  solidLocal(g, 0, 0, 0, 8.6, 1.3, 8.6)
  if (ropes) {
    const c = 5.2
    stanchions(g, [[-c, -c], [c, -c], [c, c], [-c, c], [-c, -c]])
  }
  const spin = place(ctx.live, x, 1.3, z, yaw)
  const t = buildTruck(car.paint)
  t.root.scale.setScalar(1.15)
  spin.add(bake(t.root, true)) // merged: the whole truck just turns
  ctx.anim.push((dt) => (spin.rotation.y += dt * 0.45))
  const s = sign(priceLines(`+${car.bonus} Speed`, car.gems), 2.2)
  s.position.set(x, 7.6, z)
  ctx.live.add(s)
  createSparkleField(ctx.live, { x, y: 1.3, z, radius: 3.8, height: 5, count: 26, color: '#fff2a0', size: 0.45, seed: x * 7 + z })
  ctx.prompts.push({ x, z, r: 8, title: car.name, action: 'Buy', kind: 'car', car: id })
}

export function buildCenter(ctx) {
  const { statics, live, anim } = ctx

  // --- Spawn pad + floor arrows (all point north, toward Stage 1) ---
  dirtPad(statics, 0, 0, HUB.spawnPad.size, 4, 14)
  const N = Math.PI // yaw that points an arrow north (-Z)
  floorArrow(statics, 0, -10.5, N, 7, 3.2, 4, 8)
  floorArrow(statics, 0, 46, N, 30, 3.4, 6.5, 10)
  floorArrow(statics, 22, 30, N, 24, 3.2, 6, 9.5)
  floorArrow(statics, -24, 52, N, 22, 3.2, 6, 9.5)
  floorArrow(statics, 44, 84, N, 16, 3, 5.5, 9)
  floorArrow(statics, -36, 34, N, 14, 2.8, 5, 8)

  // --- Blue boost ramp: curls up to a lip at the hub's north edge and
  // launches the truck over the gap to Stage 1 (every zone is entered by a jump).
  buildLaunchRamp(ctx)

  // --- 2X WINS trophy ---
  const T = HUB.trophy
  dirtPad(statics, T.x, T.z, 7, 9, 3)
  block(statics, mat('#323848'), T.x, 0, T.z, 3.6, 0.6, 3.6)
  block(statics, mat('#3d4457'), T.x, 0.6, T.z, 2.8, 1.6, 2.8)
  solid(T.x, 0, T.z, 3.6, 2.2, 3.6)
  const cup = trophy(live, T.x, 2.2, T.z, 1.9)
  anim.push((dt) => (cup.rotation.y += dt * 0.6))
  const tl = sign([{ text: '2X WINS', size: 96, font: 'lucky', fill: ['#fff27a', '#ffb01a'], outline: '#3a2200' }], 2.2)
  tl.position.set(T.x, 8.6, T.z)
  live.add(tl)
  createSparkleField(live, { x: T.x, y: 0.5, z: T.z, radius: 3, height: 7, count: 24, color: '#ffe27a', size: 0.5, seed: 11 })
  ctx.prompts.push({ x: T.x, z: T.z, r: 6, title: '2X WINS', action: 'View', kind: 'info', text: '2x Wins is in the Shop!' })

  // --- Group Rewards chest ---
  const C = HUB.chest
  const chestG = place(statics, C.x, 0, C.z, -0.35)
  dirtPad(chestG, 0, 0, 9, 21, 4)
  block(chestG, glowMat('#ffd21a', 1.4), 0, 0.02, 0, 7.2, 0.08, 5.6, false)
  const red = mat('#e0262e', { roughness: 0.5 })
  const yel = mat('#ffcf1f', { roughness: 0.4, metalness: 0.2 })
  block(chestG, red, 0, 0.1, 0, 5, 2.2, 3.4)
  block(chestG, mat('#7a1418'), 0, 0.1, 0, 4.7, 2.15, 3.1)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(chestG, yel, sx * 2.45, 0.1, sz * 1.65, 0.3, 2.3, 0.3)
  block(chestG, yel, 0, 0.1, 1.72, 5.1, 0.3, 0.12)
  block(chestG, yel, 0, 2.0, 1.72, 5.1, 0.3, 0.12)
  const lid = place(live, ...(() => { const c = Math.cos(-0.35), s = Math.sin(-0.35); return [C.x + 0 * c + -1.7 * s, 2.3, C.z - 0 * s + -1.7 * c] })(), -0.35)
  lid.rotation.order = 'YXZ'
  block(lid, red, 0, 0, 1.7, 5.1, 1.1, 3.5)
  block(lid, yel, 0, 0.95, 1.7, 5.15, 0.25, 3.55)
  for (const sx of [-2.2, 0, 2.2]) block(lid, yel, sx, -0.02, 1.7, 0.3, 1.2, 3.6)
  block(lid, mat('#2a1a10'), 0, -0.3, 3.5, 1.0, 1.0, 0.2)
  block(lid, gold(), 0, -0.1, 3.58, 0.5, 0.6, 0.14)
  anim.push((dt, t) => (lid.rotation.x = -0.12 - Math.max(0, Math.sin(t * 1.6)) * 0.22))
  solidLocal(chestG, 0, 0, 0, 5.2, 3.4, 3.6)
  const cl = sign([
    { text: 'Group Rewards', size: 72, font: 'lucky', fill: ['#ffe14a', '#ff8a1a'], outline: '#4a1a00' },
    { text: 'Claim now!', size: 40, font: 'fredoka', fill: '#ffffff', outline: '#2a1a10', ow: 8 },
  ], 2.4)
  cl.position.set(C.x, 6.8, C.z)
  live.add(cl)
  createSparkleField(live, { x: C.x, y: 0.2, z: C.z, radius: 3.6, height: 5, count: 28, color: '#ffd84a', size: 0.5, seed: 21 })
  ctx.prompts.push({ x: C.x, z: C.z, r: 7, title: 'Group Rewards', action: 'Claim', kind: 'chest' })

  // --- Tuning Shop ---
  buildTuningShop(ctx)

  // --- FROG display + Gear Magnet ---
  dirtPad(statics, HUB.frog.x, HUB.frog.z, 11, 31, 3)
  carDisplay(ctx, 'frog', HUB.frog.x, HUB.frog.z, { yaw: -0.4 })
  buildMagnet(ctx)

  // --- Red/white barrier line north-east ---
  const K = HUB.curb
  jerseyRow(statics, K.x0, K.z, K.x1, K.z)
  cone(statics, K.x0 - 1.5, K.z + 1)
  cone(statics, 47, K.z + 1.6)

  // --- Balloons ---
  const balloons = [
    [24, 52, -78, '#e8283a'], [-34, 60, 38, '#2f7cff'], [64, 46, 18, '#1fa84a'], [-80, 56, -24, '#e8283a'],
    [44, 66, 104, '#2f7cff'], [-8, 62, -16, '#ff5fc8'], [96, 58, 62, '#ffc21a'], [-50, 70, 120, '#1fa84a'], [10, 74, 70, '#e8283a'],
  ]
  balloons.forEach(([x, y, z, c], i) => {
    const b = balloon(live, x, y, z, c, '#ffffff')
    b.scale.setScalar(1.25)
    anim.push((dt, t) => {
      b.position.y = y + Math.sin(t * 0.35 + i) * 2.2
      b.position.x = x + Math.sin(t * 0.07 + i * 2) * 6
      b.rotation.y += dt * 0.05
    })
  })
}

function buildTuningShop(ctx) {
  const { statics, live } = ctx
  const P = HUB.tuning
  const yaw = -0.85 // opens toward the spawn pad
  const g = place(statics, P.x, 0, P.z, yaw)
  const wood = cached('mat:wood', () => new MeshStandardMaterial({ map: tex(paintWood('#5b3a22'), { repeatX: 2, repeatY: 1 }), roughness: 0.8 }))
  const darkWood = cached('mat:wood2', () => new MeshStandardMaterial({ map: tex(paintWood('#3d2716', 256, 5, 9), { repeatX: 3, repeatY: 1 }), roughness: 0.85 }))
  dirtPad(g, 0, 1, 15, 41, 4)
  block(g, wood, 0, 0, -0.5, 13, 0.45, 8.5)
  block(g, darkWood, 0, 0.45, -4.4, 12.6, 4.4, 0.4) // back wall
  for (const sx of [-1, 1]) {
    block(g, darkWood, sx * 6.1, 0.45, -2.5, 0.4, 2.0, 4.2) // side half walls
    block(g, darkWood, sx * 6.1, 0.45, 3.2, 0.5, 5.3, 0.5) // front posts
    block(g, darkWood, sx * 6.1, 0.45, -4.2, 0.5, 6.4, 0.5) // back posts
  }
  // Counter.
  block(g, darkWood, 0, 0.45, 1.6, 10.5, 1.35, 1.1)
  block(g, mat('#8a8f99', { roughness: 0.5 }), 0, 1.8, 1.6, 10.8, 0.14, 1.4)
  // Shelves with parts on the back wall.
  for (const y of [2.2, 3.4]) {
    block(g, wood, 0, y, -4.0, 11, 0.12, 0.6)
    for (let i = -4; i <= 4; i += 2) {
      mesh(g, G.cyl, mat('#2a2c33'), i, y + 0.45, -3.95, 0.38, 0.22, 0.38).rotation.x = Math.PI / 2
      block(g, mat(['#e23a2e', '#2f7cff', '#ffcf1f'][(i + 4) % 3]), i + 0.9, y + 0.12, -3.95, 0.4, 0.5, 0.3)
    }
  }
  // Sloped striped awning + scalloped valance.
  const aw = new Mesh(new BoxGeometry(13.6, 0.16, 9.6), bandMat(['#ffe23a', '#ffffff'], 14, true))
  aw.position.set(0, 5.95, -0.3)
  aw.rotation.x = 0.14
  aw.castShadow = true
  g.add(aw)
  for (let i = 0; i < 14; i++) {
    const v = mesh(g, G.cyl, mat(i % 2 ? '#ffffff' : '#ffe23a'), -6.3 + i * 0.97, 5.05, 4.45, 0.48, 0.1, 0.48)
    v.rotation.x = Math.PI / 2
    v.scale.set(0.48, 0.1, 0.48)
  }
  const signTex = cached('mat:tuningsign', () => new MeshStandardMaterial({ map: tex(paintPlate('TUNING SHOP', { bg: '#1e1f28', fg: '#ffe23a', w: 512, h: 96, font: '700 60px Fredoka, sans-serif', border: '#ffe23a' }), { wrap: false }), emissive: '#ffffff', emissiveIntensity: 0.08 }))
  box(g, signTex, 0, 5.1, 4.55, 5.2, 0.95, 0.12, false)
  // Shopkeeper behind the counter.
  const npc = buildDefaultCharacter()
  npc.scale.multiplyScalar(0.8)
  const keeper = place(live, ...(() => { const c = Math.cos(yaw), s = Math.sin(yaw); return [P.x + 0 * c + -0.4 * s, 0.45, P.z - 0 * s + -0.4 * c] })(), yaw)
  keeper.add(npc)
  ctx.anim.push((dt, t) => (npc.rotation.y = Math.sin(t * 0.7) * 0.35))
  // Yellow caution posts with tape out front.
  const tape = mat('#ffd21a', { roughness: 0.5 })
  const pts = [[-7.5, 6], [-2.5, 7], [2.5, 7], [7.5, 6]]
  for (const [px, pz] of pts) {
    mesh(g, G.cyl8, tape, px, 0.6, pz, 0.1, 1.2, 0.1)
    mesh(g, G.cyl, mat('#1a1a1a'), px, 0.05, pz, 0.3, 0.1, 0.3)
  }
  for (let i = 0; i < pts.length - 1; i++) rod(g, tape, [pts[i][0], 1.05, pts[i][1]], [pts[i + 1][0], 1.05, pts[i + 1][1]], 0.05)
  solidLocal(g, 0, 0, -0.5, 13.2, 6.5, 8.8)
  ctx.prompts.push({ x: P.x, z: P.z, r: 11, title: 'Tuning Shop', action: 'Open', kind: 'info', text: 'Tuning coming soon!' })
}

function buildMagnet(ctx) {
  const { statics, live, anim } = ctx
  const M = HUB.magnet
  dirtPad(statics, M.x, M.z, 8, 51, 3)
  const slate = mat('#4a5165', { roughness: 0.7 })
  block(statics, mat('#3a4052'), M.x, 0, M.z, 4, 0.5, 4)
  block(statics, slate, M.x, 0.5, M.z, 3.2, 0.5, 3.2)
  block(statics, mat('#565e74'), M.x, 1.0, M.z, 2.4, 0.4, 2.4)
  solid(M.x, 0, M.z, 4, 1.4, 4)
  const mg = place(live, M.x, 3.2, M.z)
  const red = mat('#e8262e', { roughness: 0.35 })
  const arc = mesh(mg, new TorusGeometry(0.9, 0.42, 14, 28, Math.PI), red, 0, 0, 0)
  arc.rotation.z = Math.PI // opening up
  for (const sx of [-0.9, 0.9]) {
    mesh(mg, G.cyl, red, sx, 0.45, 0, 0.42, 0.9, 0.42)
    mesh(mg, G.cyl, mat('#f2f4f8', { metalness: 0.5, roughness: 0.3 }), sx, 1.1, 0, 0.43, 0.42, 0.43)
  }
  const rings = []
  for (let i = 0; i < 3; i++) {
    const r = new Mesh(new TorusGeometry(1.6, 0.05, 8, 40), glowMat('#ff6a6a', 1.6))
    r.material = r.material.clone()
    r.material.transparent = true
    r.rotation.x = Math.PI / 2
    r.position.set(M.x, 1.6, M.z)
    live.add(r)
    rings.push(r)
  }
  anim.push((dt, t) => {
    mg.rotation.y += dt * 0.9
    mg.position.y = 3.2 + Math.sin(t * 2) * 0.25
    rings.forEach((r, i) => {
      const k = (t * 0.5 + i / 3) % 1
      r.scale.setScalar(0.6 + k * 1.8)
      r.material.opacity = 1 - k
    })
  })
  const l = sign([
    { text: 'GEAR MAGNET', size: 80, font: 'lucky', fill: ['#ff6a5a', '#d8101c'], outline: '#2a0606' },
    { text: '49', size: 40, font: 'fredoka', fill: '#4dff3a', outline: '#0b3a0b', ow: 8, gem: true },
  ], 2.1)
  l.position.set(M.x, 7.2, M.z)
  live.add(l)
  ctx.prompts.push({ x: M.x, z: M.z, r: 6, title: 'Gear Magnet', action: 'Buy', kind: 'magnet' })
}

// The hub's launch ramp (HUB.launch): a parabolic blue/light-blue striped
// surface from the foot (flush with the grass) to the lip at the north edge,
// concrete sides, a trimesh riding surface over convex slices (so the sides
// are solid too). Driving onto it fires the boost, so any truck at top speed
// clears the gap; the gap itself is the tutorial jump.
function buildLaunchRamp(ctx) {
  const { statics } = ctx
  const L = HUB.launch
  const len = L.foot - L.lip
  const SEG = 16
  const prof = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    prof.push([L.foot - t * len, 0.03 + L.height * t * t]) // (z, y), foot -> lip
  }
  const surfMat = cached('mat:launchramp', () => new MeshStandardMaterial({ map: tex(paintBands(['#2a8cff', '#7fd4ff'], 2), { repeatY: len / 2.4 }), roughness: 0.5, side: DoubleSide }))
  const surface = stripGeometry(prof.map(([z, y]) => [[-L.half, y, z], [L.half, y, z]]))
  const sm = new Mesh(surface, surfMat)
  sm.receiveShadow = true
  statics.add(sm)
  sm.updateMatrixWorld()
  solidMesh(surface, sm.matrixWorld)
  // Concrete sides (shape (u, v) = (-z, y), rotated so u runs along -z) and the lip face.
  const side = cached('mat:launchside', () => new MeshStandardMaterial({ map: tex(paintPlastic('#9aa1ae', 'rgba(0,0,0,0.08)', 128, 4), { repeatX: 3, repeatY: 1 }), roughness: 0.85, side: DoubleSide }))
  const sh = new Shape()
  prof.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)))
  sh.lineTo(-L.lip, 0)
  sh.closePath()
  const sg = new ShapeGeometry(sh)
  sg.rotateY(Math.PI / 2)
  for (const x of [-L.half, L.half]) {
    const m = new Mesh(sg, side)
    m.position.x = x
    statics.add(m)
  }
  box(statics, mat('#1f6fd8'), 0, L.height / 2, L.lip + 0.15, L.half * 2, L.height, 0.3)
  // Solid body: one convex slice per segment, a little under the surface.
  for (let i = 0; i < SEG; i++) {
    const [za, ya] = prof[i]
    const [zb, yb] = prof[i + 1]
    if (yb < 0.15) continue
    solidHull([[-L.half, Math.max(0, ya - 0.08), za], [L.half, Math.max(0, ya - 0.08), za], [-L.half, yb - 0.08, zb], [L.half, yb - 0.08, zb], [-L.half, 0, za], [L.half, 0, za], [-L.half, 0, zb], [L.half, 0, zb]])
  }
  // Light-blue trims along the top of the sides.
  for (const x of [-L.half, L.half]) {
    for (let i = 0; i < SEG; i++) {
      const [za, ya] = prof[i]
      const [zb, yb] = prof[i + 1]
      rod(statics, mat('#7fd4ff', { roughness: 0.4 }), [x, ya + 0.05, za], [x, yb + 0.05, zb], 0.12, G.box)
    }
  }
  ctx.boosts.push({ x0: -L.half, x1: L.half, z0: L.lip, z1: L.foot })
}
