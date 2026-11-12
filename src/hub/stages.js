import {
  CanvasTexture,
  DoubleSide,
  ExtrudeGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'
import { BALLOONS, PHYSICS, RING, STAGES, TRUCK, VIP } from '../config.js'
import { sign } from '../propkit.js'
import { createSparkleField } from '../effects.js'
import { mulberry32 } from '../textures.js'
import { cached, paintBands, paintDownArrow, paintPlate, paintPlastic, tex } from '../paint.js'
import { HUB } from './layout.js'
import { buildObstacles, edgeCurb, planObstacles } from './obstacles.js'
import { slab } from './ground.js'
import { G, block, box, cone, floorArrow, glowMat, gold, guardrail, mat, mesh, place, rod, setBaseY, solid, solidHull, stripGeometry } from './kit.js'

// The stage lane: STAGES.count grass plateaus climbing north from the hub's
// blue boost ramp, each an island: every zone is reached by jumping its ramp. Every stage follows the reference pattern: guardrails, white
// arrows, gear pickups (chains ending in a gold gear), a yellow "+N WINS /
// RETURN" pad and a magenta "+2N WINS" VIP pad under a bobbing arrow, a
// BALLOONS pedestal, a SKIP STAGE board, then a striped ramp (a new colour
// each stage) with a gold ring and the next stage's "STAGE k / RECOMMENDED
// LEVEL" sign. It gets harder as you climb: longer lanes, taller and steeper
// ramps, and wider gaps: warm-up gaps first, then from STAGES.gapFrom a gap
// sized so only a truck with needStat(k) Speed clears it. Past the last stage is the ESCAPED! finish.

const g = Math.abs(PHYSICS.gravity)
const fmt = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n))

// Pure layout, shared with main.js (falls, current stage).
export function stageLayout() {
  const out = []
  let zs = HUB.field.north - HUB.launch.gap
  let y = 0
  for (let k = 1; k <= STAGES.count; k++) {
    const zr = zs - STAGES.flat(k)
    const zt = zr - STAGES.rampLen
    const rise = STAGES.rise(k)
    // Every ramp ends in a gap. Before gapFrom it is a warm-up any truck at
    // top speed clears; from gapFrom only needStat(k) Speed clears it.
    // Landing needs the feet over the edge (player.js airClimb), plus a little.
    const range = (v) => (2 * v * v * (rise / STAGES.rampLen)) / g
    const gap = STAGES.edgeReach + (k >= STAGES.gapFrom ? STAGES.gapMargin * range(STAGES.needSpeed(k)) : STAGES.easyMargin * range(TRUCK.topSpeed))
    out.push({ k, zs, zr, zt, y, top: y + rise, gap, wins: STAGES.wins[k - 1], rec: STAGES.recommended[k - 1] })
    zs = zt - gap
    y += rise
  }
  out.push({ k: STAGES.count + 1, zs, zr: zs - 110, zt: zs - 110, y, top: y, gap: 0, finish: true, wins: STAGES.finishWins, rec: STAGES.recommended[STAGES.count] })
  return out
}

// Gear geometry: 10 teeth, a hub hole, standing upright (faces +-Z).
const gearGeo = (() => {
  const s = new Shape()
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = i % 4 === 1 || i % 4 === 2 ? 1.0 : 0.78
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  s.closePath()
  const hole = new Shape()
  hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true)
  s.holes.push(hole)
  const geo = new ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 })
  geo.translate(0, 0, -0.15)
  return geo
})()

function balloonsStand(ctx, parent, x, z, wy) {
  const slate = mat('#3a4157', { roughness: 0.7 })
  block(parent, slate, x, 0, z, 3.2, 0.5, 3.2)
  block(parent, mat('#454d66'), x, 0.5, z, 2.2, 0.5, 2.2)
  const cols = ['#e8263a', '#ffd21a', '#1f7dff']
  cols.forEach((c, i) => {
    const a = (i / 3) * Math.PI * 2
    const bx = x + Math.cos(a) * 0.9
    const bz = z + Math.sin(a) * 0.9
    rod(parent, mat('#2a2a2a'), [x, 1.0, z], [bx, 3.6, bz], 0.02)
    mesh(parent, G.sphere, mat(c, { roughness: 0.3 }), bx, 4.3, bz, 0.85, 1.0, 0.85)
  })
  solid(x, 0, z, 3.2, 1.0, 3.2)
  const l = sign([
    { text: 'BALLOONS', size: 70, font: 'lucky', fill: ['#7fd4ff', '#2a6cff'], outline: '#0b1a4a' },
    { text: '5 MINUTES', size: 30, font: 'pixel', fill: '#ffffff', outline: '#14141c', ow: 7 },
    { text: `${fmt(BALLOONS.wins)} WINS`, size: 34, font: 'fredoka', fill: ['#fff27a', '#ffa21a'], outline: '#3a2410', ow: 8 },
  ], 2.3)
  l.position.set(x, wy + 7.4, z)
  ctx.live.add(l)
  ctx.prompts.push({ x, z, y: wy, r: 5.5, title: `Balloons (${BALLOONS.minutes} min)`, action: `Buy (${fmt(BALLOONS.wins)} wins)`, kind: 'balloons' })
}

function skipBoard(ctx, parent, x, z, wy, k) {
  const wood = mat('#8a5a32', { roughness: 0.8 })
  for (const sx of [-1.4, 1.4]) block(parent, wood, x + sx, 0, z, 0.3, 2.6, 0.3)
  const face = cached('mat:skip', () => new MeshStandardMaterial({ map: tex(paintPlate('>>  SKIP STAGE', { bg: '#2f7cff', fg: '#ffffff', w: 512, h: 128, font: '700 64px Fredoka, sans-serif', border: '#ffffff' }), { wrap: false }) }))
  const b = box(parent, face, x, 2.4, z, 3.8, 1.0, 0.15)
  b.rotation.y = -0.35
  ctx.prompts.push({ x, z, y: wy, r: 6, title: `Skip Stage ${k}`, action: `Buy (${STAGES.skipCost(k)} gems)`, kind: 'skip', stage: k })
}

function winPad(ctx, parent, x, z, wy, w, l, wins, vip, k) {
  const color = vip ? '#ff2ad8' : '#ffe81a'
  block(parent, mat('#cfd6e2'), x, 0, z, w + 0.6, 0.1, l + 0.6, false)
  block(parent, glowMat(color, 1.35), x, 0.1, z, w, 0.06, l, false)
  const lab = sign([
    { text: `+${fmt(wins)} WINS`, size: 56, font: 'pixel', fill: vip ? ['#ff8af0', '#d81ad8'] : ['#fff27a', '#ffa21a'], outline: '#1a0a2a', ow: 10 },
    { text: vip ? 'VIP PASS' : 'RETURN', size: 22, font: 'pixel', fill: '#ffffff', outline: '#14141c', ow: 6 },
  ], 1.6)
  lab.position.set(x + (vip ? -0.5 : 0.5), wy + 3.2, z)
  ctx.live.add(lab)
  createSparkleField(ctx.live, { x, y: wy + 0.15, z, w, d: l, height: 3, count: 14, color: vip ? '#ff9af0' : '#fff3a0', size: 0.4, seed: k * 13 + (vip ? 1 : 0) })
  ctx.winPads.push({ x0: x - w / 2, x1: x + w / 2, z0: z - l / 2, z1: z + l / 2, y: wy, wins, vip, stage: k })
  // Buy the pass right there (main.js hides this prompt once it is owned).
  if (vip) ctx.prompts.push({ x, z, y: wy, r: Math.max(w, l) / 2 + 2, title: 'VIP Pass (forever)', action: `Buy (${fmt(VIP.wins)} wins)`, kind: 'vip' })
}

function stageRamp(ctx, s, colors) {
  const { statics } = ctx
  const H = STAGES.rampHalf
  const rows = []
  for (let i = 0; i <= 1; i++) {
    const z = s.zr + (s.zt - s.zr) * i
    const y = s.y + (s.top - s.y) * i + 0.02
    rows.push([[-H, y, z], [H, y, z]])
  }
  const bands = Math.round(STAGES.rampLen / 3)
  const surf = cached(`mat:stageramp:${colors}`, () => new MeshStandardMaterial({ map: tex(paintBands(colors, 2), { repeatY: bands / 2 }), roughness: 0.5, side: DoubleSide }))
  const m = new Mesh(stripGeometry(rows), surf)
  m.receiveShadow = true
  statics.add(m)
  // Concrete sides and the end face (a jump lip when there is a gap).
  const side = cached('mat:rampside', () => new MeshStandardMaterial({ map: tex(paintPlastic('#9aa1ae', 'rgba(0,0,0,0.08)', 128, 4), { repeatX: 4, repeatY: 1 }), roughness: 0.85, side: DoubleSide }))
  const sh = new Shape()
  sh.moveTo(-s.zr, s.y)
  sh.lineTo(-s.zt, s.top)
  sh.lineTo(-s.zt, s.y)
  sh.closePath()
  const sg = new ShapeGeometry(sh)
  sg.rotateY(Math.PI / 2) // shape x (-z) -> world z, extrude n/a
  for (const x of [-H, H]) {
    const sm = new Mesh(sg, side)
    sm.position.x = x
    statics.add(sm)
  }
  box(statics, side, 0, (s.y + s.top) / 2, s.zt + 0.2, H * 2, s.top - s.y, 0.4)
  solidHull([[-H, s.y, s.zr], [H, s.y, s.zr], [-H, s.top, s.zt], [H, s.top, s.zt], [-H, s.y, s.zt], [H, s.y, s.zt]])
}

export function buildStages(ctx) {
  const { statics, live } = ctx
  ctx.winPads = []
  ctx.gearSpots = []
  ctx.rings = []
  const layout = stageLayout()
  const F = STAGES.fence
  const rand = mulberry32(2026)
  const arrowTex = new CanvasTexture(paintDownArrow())
  arrowTex.colorSpace = SRGBColorSpace
  const arrowMat = new SpriteMaterial({ map: arrowTex, transparent: true, depthWrite: false })

  for (const s of layout) {
    // Hazards first (pure plan): the island has holes (bridge, trapdoors) and
    // narrow strips, and the side rails stay open beside the knock-off hazards.
    const flat = s.zs - s.zr
    const pz = s.zs - flat * 0.55
    const plan = s.finish ? { placed: [], gaps: [], holes: [], narrows: [] } : planObstacles(s, pz)
    // The island top, in pieces: full width, narrow strips, nothing over holes.
    setBaseY(0)
    const cuts = [...plan.holes.map(([a, b]) => [a, b, 0]), ...plan.narrows].sort((a, b) => b[0] - a[0])
    let top = s.zs
    for (const [a, b2, half] of cuts) {
      if (a < top) slab(statics, -STAGES.half, STAGES.half, a, top, s.y, STAGES.thickness)
      if (half > 0) slab(statics, -half, half, b2, a, s.y, STAGES.thickness)
      top = b2
    }
    slab(statics, -STAGES.half, STAGES.half, s.zt, top, s.y, STAGES.thickness)
    const grp = place(statics, 0, s.y, 0)
    setBaseY(s.y)
    // Curbs only where there is island under them.
    const solidParts = (zHi, zLo) => {
      const parts = [[zHi, zLo]]
      for (const [a, b2] of cuts) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const [h, l] = parts[i]
          if (b2 >= h || a <= l) continue
          parts.splice(i, 1, ...[[h, Math.max(l, a)], [Math.min(h, b2), l]].filter(([x, y]) => x - y > 1))
        }
      }
      return parts
    }
    let zHi = s.zs - 1
    for (const [g0, g1] of plan.gaps) {
      if (g0 < zHi - 1) for (const sx of [-1, 1]) guardrail(grp, sx * F, zHi, sx * F, g0)
      for (const [c0, c1] of solidParts(g0, g1)) for (const sx of [-1, 1]) edgeCurb(ctx.live, s.y, sx, c0, c1)
      zHi = g1
    }
    for (const sx of [-1, 1]) guardrail(grp, sx * F, zHi, sx * F, s.zt + 1)
    s.gaps = plan.gaps
    // Rails across the far end beside the ramp: the ramp is the only way on.
    if (!s.finish) for (const sx of [-1, 1]) guardrail(grp, sx * (STAGES.rampHalf + 0.6), s.zt + 1, sx * F, s.zt + 1)
    for (const sx of [-1, 1]) cone(grp, sx * (F - 1.5), s.zs - 3)

    if (s.finish) {
      buildFinish(ctx, grp, s)
      setBaseY(0)
      continue
    }

    // Arrows up the lane.
    const onCut = (z) => cuts.some(([a, b2]) => z < a + 10 && z > b2 - 10)
    for (let d = 14, i = 0; d < flat - 30; d += 42, i++) if (!onCut(s.zs - d)) floorArrow(grp, [0, -9, 9][i % 3], s.zs - d, Math.PI, 12, 2.8, 5, 8)

    // Win pads under a bobbing arrow (about halfway up, right side).
    winPad(ctx, grp, 18, pz, s.y, 7, 12, s.wins, false, s.k)
    winPad(ctx, grp, 18, pz - 15, s.y, 7, 12, s.wins * 2, true, s.k)
    const arrow = new Sprite(arrowMat)
    arrow.scale.set(2.8, 4.4, 1)
    live.add(arrow)
    const ay = s.y + 9
    ctx.anim.push((dt, t) => arrow.position.set(19, ay + Math.sin(t * 2.4 + s.k) * 0.7, pz - 7))

    // Gears: a chain angling toward the pads ending in a gold gear, pairs up
    // the middle, and a row across before the ramp. More of them higher up.
    const chainZ = pz + 14
    for (let i = 0; i < 8; i++) ctx.gearSpots.push({ x: -2 + i * 2.1, y: s.y + 1.4, z: chainZ - i * 1.8, value: s.k, gold: false })
    ctx.gearSpots.push({ x: -2 + 8 * 2.1, y: s.y + 1.6, z: chainZ - 8 * 1.8, value: s.k * 5, gold: true })
    for (let d = 30; d < flat * 0.4; d += 26) {
      const x = (rand() - 0.5) * 24
      ctx.gearSpots.push({ x, y: s.y + 1.4, z: s.zs - d, value: s.k, gold: false }, { x: x + 2, y: s.y + 1.4, z: s.zs - d - 2.5, value: s.k, gold: false })
    }
    const across = Math.min(9, 5 + Math.floor(s.k / 4))
    for (let i = 0; i < across; i++) ctx.gearSpots.push({ x: -12 + (i * 24) / (across - 1), y: s.y + 1.4, z: s.zr + 14, value: s.k, gold: i === across - 1 })

    // Hazards and surfaces down the lane (obstacles.js).
    buildObstacles(ctx, s, grp, plan)

    // Balloons + skip board by the ramp foot.
    balloonsStand(ctx, grp, -23, s.zr + 9, s.y)
    skipBoard(ctx, grp, 23.5, s.zr + 7, s.y, s.k)

    // The ramp, its ring and the next stage's sign.
    stageRamp(ctx, s, STAGES.colors[(s.k - 1) % STAGES.colors.length])
    // The ring shrinks as you climb, and from RING.moveFrom it slides side to side.
    const ringY = s.top + 7.5
    const rs = 1 - (1 - RING.shrinkTo) * ((s.k - 1) / (STAGES.count - 1))
    const ring = mesh(live, new TorusGeometry(6.5, 0.55, 14, 48), gold(), 0, ringY, s.zt - 1, rs, rs, rs)
    const ringHit = { x: 0, y: ringY, z: s.zt - 1, r: 6 * rs, stage: s.k }
    const moves = s.k >= RING.moveFrom
    ctx.anim.push((dt, t) => {
      ring.rotation.z = Math.sin(t * 0.6 + s.k) * 0.08
      if (moves) ring.position.x = ringHit.x = Math.sin(t * RING.speed + s.k) * RING.amp
    })
    rod(statics, mat('#e8344e'), [14, s.top, s.zt - 10], [4, ringY + 9, s.zt - 2], 0.55, G.cyl)
    mesh(statics, G.sphere, mat('#e8344e'), 4, ringY + 9, s.zt - 2, 0.9, 0.9, 0.9)
    ctx.rings.push(ringHit)
    const next = s.k + 1
    const isLast = next > STAGES.count
    const ns = sign([
      { text: isLast ? 'FINISH' : `STAGE ${next}`, size: 120, font: 'lucky', italic: true, fill: ['#ffffff', '#e4e8f0'], outline: '#1a1a24', ow: 18 },
      { text: `RECOMMENDED LEVEL: ${STAGES.recommended[s.k]}`, size: 48, font: 'lucky', italic: true, fill: ['#7dff4a', '#2ad83a'], outline: '#0b2a0b', ow: 10 },
    ], 6.5)
    ns.position.set(0, s.top + 21, s.zt - 4)
    live.add(ns)
    if (s.gap > 0) {
      const warn = sign([
        { text: `JUMP! ${Math.round(s.gap)}m`, size: 64, font: 'lucky', fill: ['#ffe14a', '#ff7a1a'], outline: '#2a1000' },
        { text: `Needs ${fmt(Math.ceil(STAGES.needStat(s.k) / 100) * 100)} Speed`, size: 36, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 },
      ].slice(0, s.k >= STAGES.gapFrom ? 2 : 1), 2.4)
      warn.position.set(-H_(), s.y + 4.2, s.zr + 3)
      live.add(warn)
    }
    setBaseY(0)
  }

  // The first stage's sign hangs over the lane entrance.
  const st1 = sign([{ text: 'STAGE 1', size: 120, font: 'lucky', italic: true, fill: ['#ffffff', '#e4e8f0'], outline: '#1a1a24', ow: 18 }], 5.5)
  st1.position.set(0, 14, layout[0].zs - 16)
  live.add(st1)
  const a1 = new Sprite(arrowMat)
  a1.scale.set(3.4, 5.4, 1)
  live.add(a1)
  ctx.anim.push((dt, t) => a1.position.set(12, 13 + Math.sin(t * 2.4) * 0.8, layout[0].zs - 16))

  buildGears(ctx)
  return layout
}
const H_ = () => STAGES.rampHalf - 4

function buildFinish(ctx, grp, s) {
  const { live } = ctx
  guardrail(grp, -STAGES.fence, s.zt + 1, STAGES.fence, s.zt + 1)
  const pz = s.zs - 60
  block(grp, mat('#2a2f40'), 0, 0, pz, 16, 1.2, 16)
  block(grp, glowMat('#ffd21a', 1.6), 0, 1.2, pz, 14, 0.08, 14, false)
  solid(0, 0, pz, 16, 1.2, 16)
  const cupG = place(live, 0, s.y + 1.3, pz - 4)
  const cup = mesh(cupG, G.cyl, gold(), 0, 3, 0, 2.6, 0.6, 2.6)
  mesh(cupG, G.cyl, gold(), 0, 1.4, 0, 0.6, 2.6, 0.6)
  mesh(cupG, G.sphere, gold(), 0, 5, 0, 3.6, 2.6, 3.6)
  cup.castShadow = true
  ctx.anim.push((dt) => (cupG.rotation.y += dt * 0.5))
  createSparkleField(live, { x: 0, y: s.y + 1.3, z: pz, radius: 8, height: 12, count: 60, color: '#ffe27a', size: 0.7, seed: 999 })
  const t = sign([
    { text: 'YOU ESCAPED!', size: 130, font: 'lucky', italic: true, fill: ['#fff27a', '#ffb01a'], outline: '#3a2200', ow: 20 },
    { text: 'Drive onto the gold pad to claim', size: 40, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 },
  ], 8)
  t.position.set(0, s.y + 22, pz - 10)
  live.add(t)
  ctx.winPads.push({ x0: -7, x1: 7, z0: pz - 7, z1: pz + 7, y: s.y + 1.2, wins: s.wins, vip: false, stage: s.k, finish: true })
}

// All gears are two instanced meshes (blue + gold); collected ones hide until they respawn.
function buildGears(ctx) {
  const spots = ctx.gearSpots
  const blue = new InstancedMesh(gearGeo, new MeshStandardMaterial({ color: '#6f80b8', roughness: 0.35, metalness: 0.55 }), spots.length)
  const goldM = new InstancedMesh(gearGeo, new MeshStandardMaterial({ color: '#ffbf1f', roughness: 0.25, metalness: 0.85, emissive: '#5a3a00', emissiveIntensity: 0.4 }), spots.length)
  blue.castShadow = goldM.castShadow = true
  ctx.live.add(blue, goldM)
  const o = new Object3D()
  const hidden = new Matrix4().makeScale(0, 0, 0)
  let bi = 0
  let gi = 0
  for (const sp of spots) {
    sp.mesh = sp.gold ? goldM : blue
    sp.index = sp.gold ? gi++ : bi++
    sp.away = 0
  }
  blue.count = bi
  goldM.count = gi
  ctx.gears = {
    spots,
    update(dt, t) {
      for (const sp of spots) {
        if (sp.away > 0) {
          sp.away -= dt
          sp.mesh.setMatrixAt(sp.index, hidden)
          continue
        }
        o.position.set(sp.x, sp.y + Math.sin(t * 2 + sp.z) * 0.15, sp.z)
        o.rotation.set(0, t * 1.8 + sp.x * 0.3, 0)
        const sc = sp.gold ? 1.25 : 1
        o.scale.set(sc, sc, sc)
        o.updateMatrix()
        sp.mesh.setMatrixAt(sp.index, o.matrix)
      }
      blue.instanceMatrix.needsUpdate = true
      goldM.instanceMatrix.needsUpdate = true
    },
  }
}
