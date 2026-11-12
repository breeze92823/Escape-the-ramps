import { DoubleSide, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, ShapeGeometry } from 'three'
import { AFK_RAMPS } from '../config.js'
import { sign } from '../propkit.js'
import { createSparkleField } from '../effects.js'
import { buildDefaultCharacter } from '../avatar/character.js'
import { cached, paintArrowPad, paintBands, paintLeaderboard, paintPlastic, paintWood, tex } from '../paint.js'
import { HUB } from './layout.js'
import { carDisplay } from './center.js'
import { block, box, cone, crowdBarrier, glowMat, gold, mat, place, solid, solidMesh, stanchions, stripGeometry, trophy, wheelIcon } from './kit.js'

// The west edge: five AFK quarter-pipes that curl up over the sea (blue 1x,
// yellow 3x, purple 5x, green 15x, red 30x), each with an arrow pad, a rope
// lane, crowd barriers, cones, a floating wheel icon, its multiplier sign
// and drifting pink sparkles. Then the WINGS pedestal, the BULL +5000
// display, and the leaderboards with their gold statues.

const SEG = 26
const THETA = Math.PI / 2 // the face ends vertical (player.js rides it as an arc)

function quarterPipe(ctx, r) {
  const { statics, live } = ctx
  const x0 = HUB.rampFootX
  const R = HUB.rampRadius
  const w = HUB.rampWidth
  const z0 = r.z - w / 2
  const z1 = r.z + w / 2
  const curve = []
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * THETA
    curve.push([x0 - R * Math.sin(th), 0.02 + R * (1 - Math.cos(th))])
  }
  const xe = curve[SEG][0]
  const top = curve[SEG][1]

  // Riding surface: bands along the arc.
  const arc = R * THETA
  const surfMat = cached(`mat:ramp:${r.colors}`, () => new MeshStandardMaterial({ map: tex(paintBands(r.colors, 2), { repeatY: arc / 3.2 }), roughness: 0.5, side: DoubleSide }))
  const surface = stripGeometry(curve.map(([x, y]) => [[x, y, z1], [x, y, z0]]))
  const sm = new Mesh(surface, surfMat)
  sm.receiveShadow = true
  sm.castShadow = true
  statics.add(sm)
  solidMesh(surface, sm.matrixWorld)

  // Solid sides (down into the sea), back wall and top lip.
  const s = new Shape()
  curve.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.lineTo(xe, -7)
  s.lineTo(x0, -7)
  s.closePath()
  const sideGeo = new ShapeGeometry(s)
  const sideMat = cached(`mat:rampside:${r.colors}`, () => new MeshStandardMaterial({ map: tex(paintBands(r.colors, 2), { repeatY: 1 / 2.2 }), roughness: 0.55, side: DoubleSide }))
  for (const zz of [z0, z1]) {
    const m = new Mesh(sideGeo, sideMat)
    m.position.z = zz
    m.castShadow = true
    m.receiveShadow = true
    statics.add(m)
  }
  block(statics, mat(r.colors[1]), xe - 0.3, -7, r.z, 0.6, top + 7, w)
  block(statics, mat(r.colors[0]), xe - 0.1, top - 0.1, r.z, 1.4, 0.35, w + 0.3)
  // Invisible side walls so a truck on the ramp cannot slip off into the sea.
  for (const zz of [z0 - 0.3, z1 + 0.3]) solid((x0 + xe) / 2 - 1, 0, zz, x0 - xe + 2, top + 4, 0.6)

  // Arrow pad + rope lane + barriers + cones.
  const pad = cached('mat:arrowpad', () => new MeshStandardMaterial({ map: tex(paintArrowPad('#59627a'), { wrap: false }), roughness: 0.8 }))
  const p = block(statics, pad, x0 + 5, 0, r.z, 6, 0.1, 6, false)
  p.rotation.y = Math.PI / 2 // arrow points west, up the ramp
  block(statics, mat('#3d4457'), x0 + 5, 0, r.z, 7.4, 0.08, 7.4, false)
  for (const sz of [-1, 1]) {
    const zz = r.z + sz * 3.9
    stanchions(statics, [[x0 + 9.5, zz], [x0 + 5.5, zz], [x0 + 1.5, zz]])
    crowdBarrier(statics, x0 - 0.6, r.z + sz * (w / 2 + 0.9), 0, sz > 0 ? '#ffd21a' : '#e8262e', 3)
  }
  cone(statics, x0 + 2, r.z + w / 2 + 1.6)
  cone(statics, x0 + 3.2, r.z + w / 2 + 2.1, 0.9)

  // Floating wheel + multiplier sign + sparkles.
  const wi = wheelIcon(live, x0 - 6, top + 6.5, r.z, 1.5)
  ctx.anim.push((dt, t) => {
    wi.rotation.y = Math.sin(t * 0.8 + r.z) * 0.6 + Math.PI / 2
    wi.position.y = top + 6.5 + Math.sin(t * 1.6 + r.z) * 0.5
  })
  const big = r.mult >= 5
  const l = sign([{ text: r.label, size: 96, font: big ? 'lucky' : 'fredoka', fill: r.fill, outline: '#1a1024', ow: big ? 18 : 14 }], big ? 3.2 : 2.6)
  l.position.set(x0 - 6, top + 3.4, r.z)
  ctx.live.add(l)
  createSparkleField(live, { x: x0 - 5, y: 0.5, z: r.z, w: 12, d: w, height: top + 3, count: 36, color: '#ff8fd4', size: 0.7, speed: 1.3, seed: 100 + r.z, sparkle: false, intensity: 1.4 })
  createSparkleField(live, { x: x0 - 5, y: 1, z: r.z, w: 12, d: w, height: top + 2, count: 14, color: '#ffffff', size: 0.6, seed: 200 + r.z })

  ctx.afk.push({ x0: xe - 1, x1: x0 + 0.5, z0, z1, mult: r.mult, label: r.label })
}

function wingsPedestal(ctx) {
  const { statics, live } = ctx
  const P = HUB.wings
  const stone = cached('mat:pedstone', () => new MeshStandardMaterial({ map: tex(paintPlastic('#9aa1ae', 'rgba(0,0,0,0.1)', 128, 12), { repeatX: 2, repeatY: 2 }), roughness: 0.8 }))
  block(statics, mat('#262b3a'), P.x, 0, P.z, 8, 0.12, 8, false)
  block(statics, stone, P.x, 0.1, P.z, 3.8, 0.9, 3.8)
  block(statics, stone, P.x, 1.0, P.z, 3.0, 0.6, 3.0)
  block(statics, glowMat('#ffe21a', 1.5), P.x, 1.6, P.z, 2.8, 0.06, 2.8, false)
  solid(P.x, 0, P.z, 3.8, 1.7, 3.8)
  // Wings: feather outline, blue with a white rim.
  const wingShape = new Shape()
  wingShape.moveTo(0, 0)
  wingShape.bezierCurveTo(0.6, 0.9, 2.2, 1.5, 3.6, 1.3)
  wingShape.lineTo(2.6, 0.6)
  wingShape.lineTo(3.1, 0.25)
  wingShape.lineTo(2.0, -0.05)
  wingShape.lineTo(2.3, -0.4)
  wingShape.quadraticCurveTo(1.0, -0.6, 0, 0)
  const geo = new ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.05, bevelSegments: 1 })
  const wings = place(live, P.x, 3.0, P.z, Math.PI / 2)
  const halves = []
  for (const sx of [-1, 1]) {
    const pivot = new Group()
    pivot.scale.x = sx
    wings.add(pivot)
    const m = new Mesh(geo, mat('#8fe0ff', { roughness: 0.3, emissive: '#3aa8ff', emissiveIntensity: 0.25 }))
    m.position.set(0.15, 0, 0)
    pivot.add(m)
    const rim = new Mesh(geo, mat('#ffffff', { roughness: 0.4 }))
    rim.scale.set(1.08, 1.12, 0.6)
    rim.position.set(0.1, -0.04, -0.06)
    pivot.add(rim)
    halves.push(pivot)
  }
  ctx.anim.push((dt, t) => {
    wings.position.y = 3.0 + Math.sin(t * 1.8) * 0.3
    const flap = Math.sin(t * 3) * 0.35
    halves[0].rotation.y = flap
    halves[1].rotation.y = -flap
  })
  createSparkleField(live, { x: P.x, y: 1.6, z: P.z, radius: 2, height: 4, count: 20, color: '#bdf2ff', size: 0.45, seed: 77 })
  const l = sign([{ text: 'WINGS', size: 96, font: 'lucky', fill: ['#ffffff', '#dff4ff'], outline: '#1f4fd0' }], 1.8)
  l.position.set(P.x, 6.2, P.z)
  live.add(l)
  ctx.prompts.push({ x: P.x, z: P.z, r: 6, title: 'WINGS', action: 'View', kind: 'info', text: 'Wings let you glide off ramps — coming soon!' })
}

function leaderboards(ctx) {
  const { statics, live } = ctx
  const B = HUB.boards
  const wood = cached('mat:plankstrip', () => new MeshStandardMaterial({ map: tex(paintWood('#c98a3e', 256, 4, 12), { repeatX: 1, repeatY: 10 }), roughness: 0.8 }))
  const z0 = B.zs[0] - 10
  const z1 = B.zs[B.zs.length - 1] + 8
  block(statics, wood, B.x - 1, 0, (z0 + z1) / 2, 7, 0.12, z1 - z0, false)
  const titles = [['TOP WINS LEADERBOARD', '#ffd23a'], ['TOP SPEED LEADERBOARD', '#7fd4ff'], ['PLAYTIME LEADERBOARD', '#9dff7a']]
  B.zs.forEach((z, i) => {
    const g = place(statics, B.x, 0, z, Math.PI / 2)
    const frame = mat('#2a3350', { roughness: 0.6 })
    block(g, frame, -4.2, 0, 0, 0.5, 1.2, 0.5)
    block(g, frame, 4.2, 0, 0, 0.5, 1.2, 0.5)
    const board = new Group()
    board.position.set(0, 1.0, 0)
    board.rotation.x = -0.12
    g.add(board)
    block(board, frame, 0, 0, 0, 10.4, 6.8, 0.5)
    const face = cached(`mat:lb:${i}`, () => new MeshStandardMaterial({ map: tex(paintLeaderboard(titles[i][0], titles[i][1], i + 3), { wrap: false }), roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.06, emissiveMap: null }))
    box(board, face, 0, 3.4, 0.27, 9.8, 6.3, 0.02, false)
    solid(B.x, 0, z, 1.4, 8, 10.6)
  })
  // Gold statues of the top players between the boards.
  const statueZ = [B.zs[0] - 7.5, (B.zs[0] + B.zs[1]) / 2, (B.zs[1] + B.zs[2]) / 2]
  statueZ.forEach((z, i) => {
    block(statics, mat('#ffcf1f', { roughness: 0.4, metalness: 0.5 }), B.x, 0, z, 2.2, 0.5, 2.2)
    const fig = buildDefaultCharacter()
    fig.scale.multiplyScalar(0.9)
    fig.traverse((o) => {
      if (o.isMesh) {
        o.material = gold()
        o.castShadow = true
      }
    })
    const g = place(statics, B.x, 0.5, z, Math.PI / 2)
    g.add(fig)
    const t = trophy(live, B.x, 4.4, z, 0.35)
    ctx.anim.push((dt) => (t.rotation.y += dt))
    const n = sign([{ text: ['fizzy123816', 'RampKing', 'Turbo_77'][i], size: 40, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 7 }], 0.55)
    n.position.set(B.x, 3.9, z)
    live.add(n)
    solid(B.x, 0, z, 2.2, 3.2, 2.2)
  })
}

export function buildWest(ctx) {
  for (const r of AFK_RAMPS) quarterPipe(ctx, r)
  // Crowd barriers in the gaps between the ramps' feet.
  for (let i = 0; i < AFK_RAMPS.length - 1; i++) {
    const gz = (AFK_RAMPS[i].z + AFK_RAMPS[i + 1].z) / 2
    crowdBarrier(ctx.statics, HUB.rampFootX + 1, gz, Math.PI / 2, i % 2 ? '#e8262e' : '#ffd21a', 2.8)
  }
  const title = sign([{ text: 'AFK Ramps', size: 110, font: 'fredoka', fill: ['#ffffff', '#e8ecf4'], outline: '#1a1a24', ow: 18 }], 5.5)
  title.position.set(HUB.rampFootX - 8, 27, -2)
  ctx.live.add(title)
  wingsPedestal(ctx)
  carDisplay(ctx, 'bull', HUB.bull.x, HUB.bull.z, { yaw: Math.PI / 2, ropes: true, concrete: true })
  leaderboards(ctx)
}
