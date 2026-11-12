import { AdditiveBlending, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from 'three'
import { GAP_HAZARDS, OBSTACLE, PHYSICS, STAGE_MODS, STAGES, TRUCK } from '../config.js'
import { neon, sign } from '../propkit.js'
import { makeCanvas } from '../paint.js'
import { G, box, mesh, rod } from './kit.js'
import { M, TRUCK_H, TRUCK_R, beaconMat, boxCollider, dropCollider, fx, gear, loopOf, makeBeam, range, sfx, target } from './hazardKit.js'
import { buildChaser } from './enemies.js'

// Hazards over the jump gaps (laser gates, giant blades, drones, crosswind)
// and whole-stage modifiers: shifting landing panels, a ramp that breaks if
// you dawdle on it, a chasing wrecker, a lava flood and darkness.
// Everything here is placed from GAP_HAZARDS / STAGE_MODS (config).

const NM = OBSTACLE.nearMiss
const g = Math.abs(PHYSICS.gravity)
export const modsOf = (k) => STAGE_MODS[k] ?? []
const glowAdd = (color, opacity = 0.5) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false })

// The flight over stage s's gap at the speed the gap is built for: lip height,
// the apex, and the band of heights a truck crosses mid-gap (faster = higher).
function flight(s) {
  const v = s.k >= STAGES.gapFrom ? STAGES.needSpeed(s.k) : TRUCK.topSpeed
  const vy = v * ((s.top - s.y) / STAGES.rampLen)
  const apex = s.top + (vy * vy) / (2 * g)
  const zm = s.zt - s.gap / 2
  return { v, apex, zm, lo: s.top + 0.3, hi: s.top + (apex - s.top) * 2.1 + 3 }
}
const inGap = (s, pp) => pp.z < s.zt && pp.z > s.zt - s.gap && pp.y > s.top - 6

// A hovering pylon (laser gates): a tall body with thruster pods and a light column.
function pylon(parent, x, y0, h, z) {
  const grp = new Group()
  grp.position.set(x, y0, z)
  parent.add(grp)
  box(grp, M.dark(), 0, h / 2, 0, 1.4, h, 1.4)
  for (let y = 1; y < h; y += 2.2) box(grp, M.hazard(), 0, y, 0, 1.45, 0.35, 1.45)
  box(grp, M.iron(), 0, h + 0.3, 0, 2.2, 0.6, 2.2)
  box(grp, M.iron(), 0, -0.3, 0, 2.2, 0.6, 2.2)
  const flames = []
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    mesh(grp, G.cyl8, M.black(), dx, -0.8, dz, 0.35, 0.6, 0.35)
    flames.push(mesh(grp, G.cone, glowAdd('#5ab8ff', 0.8), dx, -1.6, dz, 0.3, 1.2, 0.3, false))
    flames[flames.length - 1].rotation.x = Math.PI
  }
  const lamps = ['#2aff6a', '#ffb01a', '#ff2a2a'].map((c, i) => {
    const m = beaconMat(c)
    mesh(grp, G.sphere, m, 0, h + 1.0 + i * 0.7, 0, 0.32, 0.32, 0.32, false)
    return m
  })
  return { grp, flames, lamps }
}

// --- Laser gate over the gap ----------------------------------------------------------------
function gapLaser(ctx, live, s) {
  const P = OBSTACLE.gapLaser
  const C = range(P.cycle, s.k)
  const on = range(P.on, s.k)
  const f = flight(s)
  const X = STAGES.rampHalf + 4
  const pyl = [-1, 1].map((e) => pylon(live, e * X, f.lo - 1.5, f.hi - f.lo + 3, f.zm))
  const n = 7
  const beams = []
  for (let i = 0; i < n; i++) {
    const y = f.lo + ((f.hi - f.lo) * (i + 0.5)) / n
    const bm = makeBeam(live, '#ff2a2a', 0.08, 0.4)
    bm.set(-X + 0.8, y, f.zm, X - 0.8, y, f.zm)
    beams.push({ bm, y })
  }
  const o = { z: f.zm, near: 0, phase: 'off', reach: s.gap / 2 + 4, loop: loopOf('laser', 0, (f.lo + f.hi) / 2, f.zm) }
  o.update = (dt, t) => {
    const c = (t + s.k) % C
    const onAt = C - on
    const phase = c >= onAt ? 'on' : c >= onAt - P.warn ? 'warn' : 'off'
    if (phase !== o.phase) {
      if (phase === 'warn') sfx('laserArm', 0, f.lo + 3, f.zm, 1.2)
      if (phase === 'on') sfx('laserOn', 0, f.lo + 3, f.zm, 1.4)
    }
    o.phase = phase
    const bob = Math.sin(t * 1.4) * 0.3
    for (const p of pyl) {
      p.grp.position.y = f.lo - 1.5 + bob
      for (const fl of p.flames) fl.scale.set(0.3, 1 + Math.random() * 0.5, 0.3)
      p.lamps[0].emissiveIntensity = phase === 'off' ? 3 : 0.15
      p.lamps[1].emissiveIntensity = phase === 'warn' ? (Math.sin(t * 30) > 0 ? 3.5 : 0.2) : 0.15
      p.lamps[2].emissiveIntensity = phase === 'on' ? 3.5 : 0.15
    }
    for (const b of beams) {
      b.bm.group.position.y = b.y + bob
      if (phase === 'on') b.bm.show(true, 1, 0.5)
      else if (phase === 'warn') b.bm.show(Math.random() < 0.4, 0.25)
      else b.bm.show(false)
    }
    o.loop.level = phase === 'on' ? 1 : 0
    if (phase === 'on' && Math.random() < dt * 10) fx('laserSpark', (Math.random() < 0.5 ? -1 : 1) * (X - 0.8), f.lo + Math.random() * (f.hi - f.lo), f.zm)
  }
  o.test = (pp) => {
    const dz = Math.abs(pp.z - f.zm)
    const y = pp.y + TRUCK_H / 2
    if (dz > 1.6 || Math.abs(pp.x) > X || y < f.lo - 1.5 || y > f.hi + 1.5) return null
    if (o.phase === 'on') return { hit: true, laser: true, keep: 0.45, vx: (Math.random() - 0.5) * 4, vy: 2, vz: 6, x: pp.x, y, z: f.zm, power: 1.1, color: '#ff2a2a' }
    return o.phase === 'warn' ? { near: true, x: pp.x } : null
  }
  ctx.obstacles.push(o)
}

// --- Giant blades over the gap -----------------------------------------------------------------
// A hovering rotor whose saw bars sweep down through the flight path.
function gapBlades(ctx, live, s) {
  const P = OBSTACLE.gapBlades
  const f = flight(s)
  const w = range(P.spin, s.k) * (s.k % 2 ? 1 : -1)
  const R = P.R
  const hubY = (f.lo + f.hi) / 2 + R * 0.55
  const bars = s.k >= 19 ? 2 : 1
  const pod = new Group()
  pod.position.set(0, hubY, f.zm)
  live.add(pod)
  mesh(pod, G.sphere, M.dark(), 0, 0, 0, 2.6, 2.2, 2.6)
  mesh(pod, G.cyl, M.hazard(), 0, 0, 0, 2.7, 0.6, 2.7)
  const eye = mesh(pod, G.sphere, neon('#ff2a2a', 5), 0, -0.6, 2.3, 0.5, 0.5, 0.3, false)
  eye.castShadow = false
  const thr = []
  for (const e of [-1, 1]) {
    mesh(pod, G.cyl8, M.iron(), e * 2.4, -1.2, 0, 0.6, 1.4, 0.6)
    thr.push(mesh(pod, G.cone, glowAdd('#5ab8ff', 0.8), e * 2.4, -2.5, 0, 0.5, 1.6, 0.5, false))
    thr[thr.length - 1].rotation.x = Math.PI
  }
  const rotor = new Group()
  rotor.position.set(0, 0, 2.8)
  pod.add(rotor)
  mesh(rotor, G.cyl, M.chrome(), 0, 0, -0.5, 1.0, 1.2, 1.0).rotation.x = Math.PI / 2
  for (let i = 0; i < bars; i++) {
    const bar = new Group()
    bar.rotation.z = (i * Math.PI) / 2
    rotor.add(bar)
    box(bar, M.steel(), 0, 0, 0, 1.2, R * 2, 0.3)
    box(bar, M.hazard(), 0, 0, 0.16, 1.22, R * 0.6, 0.02, false)
    for (let j = -7; j <= 7; j++) {
      if (Math.abs(j) < 1) continue
      for (const e of [-1, 1]) mesh(bar, G.cone, M.chrome(), e * 0.75, j * (R / 7.5), 0, 0.18, 0.5, 0.18, false).rotation.z = -e * Math.PI / 2
    }
    for (const e of [-1, 1]) mesh(bar, G.sphere, beaconMat('#ff2a1a'), 0, e * R, 0.2, 0.35, 0.35, 0.35, false)
  }
  const o = { z: f.zm, near: 0, ang: 0, reach: s.gap / 2 + 4, last: 0, loop: loopOf('saw', 0, hubY, f.zm) }
  o.loop.level = 1
  o.update = (dt, t) => {
    o.ang += w * dt
    rotor.rotation.z = o.ang
    pod.position.y = hubY + Math.sin(t * 1.2) * 0.4
    for (const th of thr) th.scale.set(0.5, 1.4 + Math.random() * 0.6, 0.5)
    // A whoosh each time a bar passes the bottom.
    const per = Math.PI / bars
    const k = Math.floor((o.ang + Math.PI / 2) / per)
    if (k !== o.last) {
      o.last = k
      sfx('heavyWhoosh', 0, hubY - R, f.zm, 1)
    }
  }
  o.test = (pp) => {
    if (Math.abs(pp.z - (f.zm + 2.8)) > 1.6) return null
    const cx = pp.x
    const cy = pp.y + TRUCK_H / 2 - pod.position.y
    const r = Math.hypot(cx, cy)
    if (r > R + TRUCK_R) return null
    let best = 1e9
    for (let i = 0; i < bars * 2; i++) {
      const a = o.ang + (i * Math.PI) / bars
      // Bar direction (local +Y rotated by a): (-sin a, cos a).
      const dx = -Math.sin(a)
      const dy = Math.cos(a)
      const along = cx * dx + cy * dy
      if (along < 0) continue
      best = Math.min(best, Math.abs(cx * dy - cy * dx))
    }
    if (best < 0.6 + TRUCK_R * 0.8) return { hit: true, blade: true, keep: 0.35, vx: Math.sign(w) * -Math.sign(cy) * P.knock, vy: -3, vz: 6, x: pp.x, y: pp.y + 1, z: pp.z, power: 1.3, color: '#d5dbe3' }
    return best < TRUCK_R + NM + 1 ? { near: true, x: pp.x } : null
  }
  ctx.obstacles.push(o)
  gear(ctx, 0, (f.lo + f.hi) / 2, f.zm - 4, s.k, 'mega')
}

// --- Drones crossing the gap ------------------------------------------------------------------------
function droneModel(parent) {
  const grp = new Group()
  parent.add(grp)
  box(grp, M.dark(), 0, 0, 0, 1.7, 0.55, 1.7)
  box(grp, M.hazard(), 0, 0.3, 0, 1.2, 0.08, 1.2)
  mesh(grp, G.sphere, M.glass(), 0, 0.35, 0.3, 0.45, 0.3, 0.45)
  const eye = mesh(grp, G.sphere, neon('#ff2a2a', 5), 0, -0.25, 0.75, 0.22, 0.22, 0.22, false)
  eye.castShadow = false
  const rotors = []
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    rod(grp, M.iron(), [0, 0, 0], [dx * 1.4, 0.15, dz * 1.4], 0.08)
    mesh(grp, G.cyl8, M.black(), dx * 1.4, 0.15, dz * 1.4, 0.18, 0.3, 0.18)
    const r = mesh(grp, G.cyl, glowAdd('#cfd6e2', 0.35), dx * 1.4, 0.35, dz * 1.4, 0.95, 0.03, 0.95, false)
    rotors.push(r)
    mesh(grp, G.sphere, beaconMat(dx > 0 ? '#2aff6a' : '#ff2a2a'), dx * 1.4, 0.05, dz * 1.4, 0.1, 0.1, 0.1, false)
  }
  return { grp, rotors }
}
function gapDrones(ctx, live, s) {
  const P = OBSTACLE.gapDrones
  const f = flight(s)
  const speed = range(P.speed, s.k)
  const A = STAGES.rampHalf + 2
  for (let i = 0; i < P.count; i++) {
    const d = droneModel(live)
    const dz = s.zt - s.gap * ((i + 1) / (P.count + 1))
    const y = f.lo + ((f.hi - f.lo) * (i % 2 ? 0.7 : 0.3)) + (i === 1 ? 1 : 0)
    const ph = i * 1.7 + s.k
    const o = { z: dz, near: 0, x: 0, y, vx: 0, reach: 4, loop: loopOf('drone', 0, y, dz) }
    o.loop.level = 1
    o.update = (dt, t) => {
      // Ping-pong across with a little hover wobble.
      const u = ((t * speed) / (2 * A) + ph) % 2
      const tri = u < 1 ? u : 2 - u
      const nx = -A + 2 * A * smoothTri(tri)
      o.vx = (nx - o.x) / Math.max(dt, 1e-3)
      o.x = nx
      o.y = y + Math.sin(t * 2.3 + i) * 0.6
      d.grp.position.set(o.x, o.y, dz)
      d.grp.rotation.z = -Math.max(-0.4, Math.min(0.4, o.vx * 0.03))
      d.grp.rotation.y = Math.sin(t + i) * 0.2
      for (const r of d.rotors) r.rotation.y += dt * 40
      o.loop.x = o.x
      o.loop.y = o.y
    }
    o.test = (pp) => {
      const dd = Math.hypot(pp.x - o.x, pp.y + TRUCK_H / 2 - o.y, pp.z - dz)
      if (dd < 1.4 + TRUCK_R) {
        sfx('zapHit', o.x, o.y, dz, 1.2)
        return { hit: true, drone: true, keep: 0.92, vx: Math.sign(o.vx || 1) * P.knock, vy: 3, vz: 0, x: o.x, y: o.y, z: dz, power: 1, color: '#2f3546' }
      }
      return dd < 1.4 + TRUCK_R + NM + 1 ? { near: true, x: o.x } : null
    }
    ctx.obstacles.push(o)
  }
}
const smoothTri = (v) => v * v * (3 - 2 * v)

// --- Crosswind over the gap ------------------------------------------------------------------------
// Windsocks at the lip show which way it blows; it flips every few seconds.
function gapWind(ctx, live, s) {
  const P = OBSTACLE.gapWind
  const accel = range(P.accel, s.k)
  const f = flight(s)
  const socks = []
  for (const [x, z, y] of [[-STAGES.rampHalf - 1.5, s.zt + 2, s.top], [STAGES.rampHalf + 1.5, s.zt + 2, s.top], [-STAGES.rampHalf - 1.5, s.zt - s.gap - 3, s.top], [STAGES.rampHalf + 1.5, s.zt - s.gap - 3, s.top]]) {
    rod(live, M.white(), [x, y - 4, z], [x, y + 5, z], 0.12)
    const sk = new Group()
    sk.position.set(x, y + 4.8, z)
    live.add(sk)
    for (let i = 0; i < 4; i++) {
      const c = mesh(sk, G.cyl, i % 2 ? M.white() : M.red(), 0, 0, 0.45 + i * 0.85, 0.6 - i * 0.1, 0.85, 0.6 - i * 0.1)
      c.rotation.x = Math.PI / 2
    }
    socks.push(sk)
  }
  const o = { z: f.zm, near: 0, dir: 1, reach: s.gap / 2 + 4, loop: loopOf('fan', 0, f.apex, f.zm) }
  let last = -1
  o.update = (dt, t) => {
    const n = Math.floor((t + s.k) / P.cycle)
    const c = (t + s.k) % P.cycle
    const dir = n % 2 ? 1 : -1
    o.dir = dir
    const warn = c > P.cycle - P.warn
    if (n !== last) {
      last = n
      sfx('gust', 0, f.apex, f.zm, 1)
    }
    for (const sk of socks) {
      const want = dir > 0 ? Math.PI / 2 : -Math.PI / 2
      sk.rotation.y += (want - sk.rotation.y) * Math.min(1, dt * 3) + Math.sin(t * 13 + sk.position.z) * (warn ? 0.12 : 0.04)
      sk.rotation.x = 0.15 + Math.sin(t * 7) * 0.05
    }
    o.loop.level = 0.6
    if (Math.random() < dt * 30) fx('windStreak', -dir * 26, f.lo + Math.random() * (f.hi - f.lo), s.zt - Math.random() * s.gap, { dir })
  }
  o.test = (pp) => (inGap(s, pp) && !target.grounded ? { push: true, ax: o.dir * accel, x: pp.x, y: pp.y + 1, z: pp.z } : null)
  ctx.obstacles.push(o)
}

// --- Shifting landing (stage modifier) ------------------------------------------------------------------
// The first `depth` m of the island are hinged panels; a window of them is lit
// green and solid and it slides from side to side; the rest hang open. Steer
// in the air to land on the green.
function landing(ctx, live, s) {
  const P = OBSTACLE.landing
  const L = P.depth
  const n = P.panels
  const half = STAGES.half
  const pw = (half * 2) / n
  const step = range(P.step, s.k)
  const hingeZ = s.zs - L
  const order = []
  for (let i = 0; i <= n - P.window; i++) order.push(i)
  for (let i = n - P.window - 1; i > 0; i--) order.push(i)
  const panels = []
  for (let i = 0; i < n; i++) {
    const x = -half + (i + 0.5) * pw
    const piv = new Group()
    piv.position.set(x, s.y, hingeZ)
    live.add(piv)
    box(piv, M.steel(), 0, -0.25, L / 2, pw - 0.15, 0.5, L - 0.1)
    const glow = new MeshStandardMaterial({ color: '#1a2a1a', emissive: '#2aff6a', emissiveIntensity: 1, roughness: 0.4 })
    box(piv, glow, 0, 0.02, L / 2, pw - 1.2, 0.04, L - 1.2, false)
    box(piv, M.hazard(), 0, 0.03, 0.3, pw - 0.2, 0.04, 0.4, false)
    const mk = () => boxCollider(x, s.y - 0.25, hingeZ + L / 2, pw / 2 - 0.08, 0.25, L / 2 - 0.05)
    panels.push({ piv, glow, mk, col: mk(), open: 0, state: 'solid' })
  }
  const l = sign([
    { text: 'LAND ON THE GREEN!', size: 64, font: 'lucky', fill: ['#8affa8', '#2ad84a'], outline: '#002a0a' },
    { text: 'The panels shift side to side', size: 30, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 },
  ], 3)
  l.position.set(0, s.y + 12, hingeZ - 6)
  live.add(l)
  const o = { z: s.zs - L / 2, near: 0, reach: L, test: () => null, loop: loopOf('motor', 0, s.y - 1, s.zs - L / 2) }
  o.loop.level = 0.4
  let lastN = -1
  o.update = (dt, t) => {
    const nn = Math.floor((t + s.k) / step)
    const c = ((t + s.k) / step - nn) * step
    const pos = order[nn % order.length]
    const next = order[(nn + 1) % order.length]
    if (nn !== lastN) {
      lastN = nn
      sfx('clang', -half + (pos + 1.5) * pw, s.y, s.zs - L / 2, 0.7)
    }
    panels.forEach((p, i) => {
      const solidNow = i >= pos && i < pos + P.window
      const solidNext = i >= next && i < next + P.window
      const warn = solidNow && !solidNext && c > step - P.warn
      const state = solidNow ? (warn ? 'warn' : 'solid') : 'open'
      if (state === 'open' && p.state !== 'open') {
        dropCollider(p.col)
        p.col = null
        sfx('hiss', p.piv.position.x, s.y, s.zs - L / 2, 0.5)
      }
      p.state = state
      const want = state === 'open' ? 1 : 0
      p.open += (want - p.open) * Math.min(1, dt * (want ? 9 : 6))
      if (state !== 'open' && !p.col && p.open < 0.04) p.col = p.mk()
      p.piv.rotation.x = p.open * Math.PI * 0.48
      p.glow.emissive.set(state === 'warn' ? '#ffb01a' : state === 'open' ? '#ff2a1a' : '#2aff6a')
      p.glow.emissiveIntensity = state === 'warn' ? (Math.sin(t * 30) > 0 ? 2.5 : 0.3) : state === 'open' ? 0.6 : 1.4
    })
  }
  ctx.obstacles.push(o)
}

// --- The breaking ramp (stage modifier) -------------------------------------------------------------------
// A cracked ramp: once the truck is on it the cracks spread; spend more than
// `hold` s on it (too slow!) and it collapses under you, rebuilding later.
function paintRampCracks() {
  const c = makeCanvas(256)
  const x = c.getContext('2d')
  x.clearRect(0, 0, 256, 256)
  x.strokeStyle = 'rgba(20,14,10,0.9)'
  x.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    let px = Math.random() * 256
    let py = Math.random() * 256
    let a = Math.random() * Math.PI * 2
    x.lineWidth = 4
    x.beginPath()
    x.moveTo(px, py)
    for (let j = 0; j < 7; j++) {
      a += (Math.random() - 0.5) * 1.2
      px += Math.cos(a) * 16
      py += Math.sin(a) * 16
      x.lineTo(px, py)
      x.lineWidth = Math.max(1, 4 - j * 0.5)
    }
    x.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
export function breakRamp(ctx, live, s, ramp) {
  const P = OBSTACLE.breakRamp
  const H = STAGES.rampHalf
  const rise = s.top - s.y
  const len = Math.hypot(STAGES.rampLen, rise)
  const crackMat = new MeshBasicMaterial({ map: paintRampCracks(), transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 })
  crackMat.map.repeat.set(3, 4)
  crackMat.map.wrapS = crackMat.map.wrapT = RepeatWrapping
  const crack = new Mesh(new PlaneGeometry(H * 2, len), crackMat)
  crack.position.set(0, (s.y + s.top) / 2 + 0.06, (s.zr + s.zt) / 2)
  crack.rotation.x = -Math.PI / 2 + Math.atan2(rise, STAGES.rampLen)
  ramp.group.add(crack)
  // Chunks that fall when it collapses.
  const chunks = []
  for (let i = 0; i < 18; i++) {
    const m = box(live, i % 3 ? M.rock() : M.hazard(), 0, 0, 0, 3 + Math.random() * 3, 0.8, 3 + Math.random() * 3)
    m.visible = false
    chunks.push({ m, vy: 0, vx: 0, vz: 0, w: 0 })
  }
  const l = sign([{ text: 'CRACKED RAMP!', size: 60, font: 'lucky', fill: ['#ffc27a', '#ff7a1a'], outline: '#2a1000' }, { text: "Full speed - don't hesitate!", size: 30, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 }], 2.6)
  l.position.set(H - 4, s.y + 7, s.zr + 10)
  live.add(l)
  const o = { z: (s.zr + s.zt) / 2, near: 0, state: 'ok', t: 0, hold: 0, reach: STAGES.rampLen, test: () => null }
  o.update = (dt) => {
    const pp = target.p
    o.t += dt
    if (o.state === 'ok') {
      const u = (s.zr - pp.z) / STAGES.rampLen
      const surf = s.y + rise * u
      const on = u > 0 && u < 1 && Math.abs(pp.x) < H && Math.abs(pp.y - surf) < 1.5
      o.hold = on ? o.hold + dt : Math.max(0, o.hold - dt * 2)
      crackMat.opacity = 0.25 + 0.75 * Math.min(1, o.hold / P.hold)
      if (on && Math.random() < dt * (6 + o.hold * 30)) fx('crumbleDust', (Math.random() - 0.5) * H * 2, surf, pp.z + (Math.random() - 0.5) * 8)
      if (on && Math.random() < dt * 3) sfx('crack', pp.x, surf, pp.z, 0.8)
      if (o.hold > P.hold) {
        o.state = 'down'
        o.t = 0
        dropCollider(ramp.collider)
        ramp.collider = null
        ramp.group.visible = false
        sfx('crumble', 0, (s.y + s.top) / 2, o.z, 2)
        sfx('slam', 0, s.y, o.z, 1.5)
        fx('quake', 0, s.y, o.z, { k: 0.9, r: 60 })
        fx('callout', pp.x, pp.y, pp.z, { text: 'THE RAMP BROKE!', color: '#ff7a1a' })
        for (const c of chunks) {
          const u2 = Math.random()
          c.m.position.set((Math.random() - 0.5) * H * 2, s.y + rise * u2, s.zr - STAGES.rampLen * u2)
          c.m.rotation.set(Math.random(), Math.random(), Math.random())
          c.m.visible = true
          c.vy = 2 + Math.random() * 6
          c.vx = (Math.random() - 0.5) * 8
          c.vz = (Math.random() - 0.5) * 6
          c.w = (Math.random() - 0.5) * 6
          fx('rockBurst', c.m.position.x, c.m.position.y, c.m.position.z, { r: 2, n: 3 })
        }
      }
    } else {
      for (const c of chunks) {
        if (!c.m.visible) continue
        c.vy -= g * dt
        c.m.position.x += c.vx * dt
        c.m.position.y += c.vy * dt
        c.m.position.z += c.vz * dt
        c.m.rotation.x += c.w * dt
        if (c.m.position.y < s.y + 0.4 && c.vy < 0) {
          c.m.position.y = s.y + 0.4
          c.vy *= -0.3
          c.vx *= 0.6
          c.vz *= 0.6
        }
        if (o.t > 3) c.m.visible = false
      }
      if (o.t > P.down) {
        o.state = 'ok'
        o.hold = 0
        ramp.collider = ramp.makeCollider()
        ramp.group.visible = true
        sfx('clang', 0, s.top, s.zt, 1.2)
        sfx('hiss', 0, s.top, s.zt, 1)
        fx('rebuild', 0, (s.y + s.top) / 2, o.z, { len: STAGES.rampLen, w: H * 2 })
      }
    }
  }
  ctx.obstacles.push(o)
}

// --- Lava flood (stage modifier) ---------------------------------------------------------------------------
// Pipes over the landing pour lava once you arrive; it floods down the lane
// behind you and stops at the ramp foot. Touch it: melted.
function flood(ctx, live, s) {
  const P = OBSTACLE.flood
  const v = STAGES.needSpeed(s.k) * range(P.speed, s.k)
  const b = s.y
  const half = STAGES.half
  const lava = new Mesh(new PlaneGeometry(1, 1), M.lava())
  lava.rotation.x = -Math.PI / 2
  lava.visible = false
  live.add(lava)
  const crest = mesh(live, G.cyl, M.lava(), 0, b, 0, 1.1, half * 2, 1.1, false)
  crest.rotation.z = Math.PI / 2
  crest.visible = false
  const glow = mesh(live, G.box, glowAdd('#ff7a1a', 0.35), 0, b + 1.5, 0, half * 2, 3, 1.5, false)
  glow.visible = false
  // Pour pipes.
  const pours = []
  for (const e of [-1, 1]) {
    const x = e * 18
    rod(ctx.statics, M.iron(), [x, b, s.zs + 1], [x, b + 9, s.zs + 1], 0.5, G.cyl)
    rod(ctx.statics, M.iron(), [x, b + 9, s.zs + 1], [x, b + 9, s.zs - 3], 0.7, G.cyl)
    mesh(ctx.statics, G.cyl, M.hazard(), x, b + 9, s.zs - 3, 0.9, 0.5, 0.9)
    const col = mesh(live, G.cyl, M.lava(), x, b + 4.5, s.zs - 3, 0.7, 9, 0.7, false)
    col.visible = false
    pours.push(col)
  }
  const l = sign([{ text: 'LAVA FLOOD!', size: 70, font: 'lucky', fill: ['#ffc27a', '#ff4a1a'], outline: '#2a0800' }, { text: 'It follows you. Keep moving!', size: 30, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 }], 3.2)
  l.position.set(0, b + 13, s.zs - 20)
  live.add(l)
  const o = { z: s.zs, near: 0, state: 'off', front: s.zs + 1, t: 0, off: 0, reach: 1e5, loop: loopOf('lava', 0, b + 0.5, s.zs) }
  o.update = (dt, t) => {
    const pp = target.p
    const onIsland = pp.z < s.zs + 1 && pp.z > s.zt && Math.abs(pp.y - b) < 3 && !target.frozen
    o.off = onIsland ? 0 : o.off + dt
    o.t += dt
    if (o.state === 'off' && onIsland && target.grounded) {
      o.state = 'wait'
      o.t = 0
      sfx('alarm', 0, b + 4, s.zs - 6, 1.5)
    }
    if (o.state !== 'off' && o.off > 0.6) {
      o.state = 'off'
      o.front = s.zs + 1
    }
    if (o.state === 'wait' && o.t > P.delay) {
      o.state = 'flow'
      o.t = 0
      sfx('geyser', 0, b + 4, s.zs - 3, 1.5)
      fx('callout', pp.x, pp.y, pp.z, { text: 'LAVA IS COMING!', color: '#ff7a1a' })
    }
    if (o.state === 'flow') o.front = Math.max(s.zr + 2, o.front - v * dt)
    const show = o.state === 'flow'
    lava.visible = crest.visible = glow.visible = show
    for (const c of pours) c.visible = o.state !== 'off'
    if (show) {
      const len = s.zs + 1 - o.front
      lava.position.set(0, b + 0.22, (s.zs + 1 + o.front) / 2)
      lava.scale.set(half * 2, Math.max(0.01, len), 1)
      lava.material.map.offset.y = (t * 0.05) % 1
      crest.position.set(0, b + 0.2 + Math.sin(t * 6) * 0.08, o.front)
      crest.rotation.x += dt * 2
      glow.position.set(0, b + 1.4, o.front)
      if (Math.random() < dt * 40) fx('ember', (Math.random() - 0.5) * half * 2, b + 0.6, o.front + Math.random() * 2)
      if (Math.random() < dt * 14) fx('lavaBubble', (Math.random() - 0.5) * half * 2, b + 0.3, o.front + Math.random() * Math.min(40, len))
    }
    o.z = show ? o.front : s.zs
    o.loop.z = o.front
    o.loop.x = Math.max(-half, Math.min(half, pp.x))
    o.loop.level = show ? 1 : o.state === 'wait' ? 0.5 : 0
  }
  o.test = (pp) => {
    // Only on this island (a truck just respawned at the hub is far below it).
    if (o.state !== 'flow' || Math.abs(pp.y - b) > 1.4 || pp.z > s.zs + 1 || pp.z < s.zt) return null
    if (pp.z > o.front - 0.6) return { kill: 'melt', why: 'MELTED!', x: pp.x, y: b + 0.5, z: pp.z }
    return pp.z > o.front - 6 ? { near: true, x: pp.x } : null
  }
  ctx.obstacles.push(o)
}

// --- Darkness (stage modifier) -----------------------------------------------------------------------------
// The lights go out over this island (main.js reads ctx.ambience and switches
// on the truck's headlights); a few flickering lamp posts line the lane.
function dark(ctx, live, s) {
  ;(ctx.ambience ??= []).push({ z0: s.zt - 4, z1: s.zs + 6, y: s.y, dark: 1, fade: 14 })
  const bulbs = []
  for (let z = s.zs - 20, i = 0; z > s.zr + 10; z -= 34, i++) {
    for (const e of [-1, 1]) {
      const x = e * (STAGES.fence + 1)
      rod(ctx.statics, M.dark(), [x, s.y, z], [x, s.y + 7, z], 0.14)
      rod(ctx.statics, M.dark(), [x, s.y + 7, z], [x - e * 2, s.y + 7.4, z], 0.1)
      const m = neon('#ffd27a', 4)
      mesh(live, G.sphere, m, x - e * 2, s.y + 7.1, z, 0.35, 0.25, 0.35, false)
      const pool = mesh(live, G.cyl, glowAdd('#ffd27a', 0.12), x - e * 2, s.y + 0.05, z, 4, 0.02, 4, false)
      bulbs.push({ m, pool, flick: (i + (e > 0 ? 1 : 0)) % 3 === 0 })
    }
  }
  const l = sign([{ text: 'LIGHTS OUT', size: 70, font: 'lucky', fill: ['#c9d8ff', '#6a8aff'], outline: '#0a0a2a' }, { text: 'Hazards glow in the dark', size: 30, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 }], 3)
  l.position.set(0, s.y + 11, s.zs - 10)
  live.add(l)
  const o = { z: s.zs - 50, near: 0, reach: 1e5, test: () => null }
  o.update = (dt, t) => {
    for (const bb of bulbs) {
      const on = !bb.flick || Math.sin(t * 13 + bb.pool.position.z) > -0.6 || Math.random() < 0.3
      bb.m.visible = on
      bb.pool.visible = on
    }
  }
  ctx.obstacles.push(o)
}

const GAP_BUILD = { gapLaser, gapBlades, gapDrones, gapWind }

// Everything extra for stage s: the hazards over its gap, and its modifiers.
// `ramp` = { group, collider, makeCollider } when the ramp can break.
export function buildStageExtras(ctx, s, ramp) {
  const mods = modsOf(s.k)
  const gaps = s.gap > 0 ? GAP_HAZARDS[s.k] ?? [] : []
  if (!mods.length && !gaps.length) return
  const live = new Group()
  ctx.live.add(live)
  ;(ctx.obstacleGroups ??= []).push({ group: live, zMin: s.zt - s.gap - 30, zMax: s.zs + 30, k: s.k })
  for (const t of gaps) GAP_BUILD[t](ctx, live, s)
  if (mods.includes('landing')) landing(ctx, live, s)
  if (mods.includes('breakRamp') && ramp) breakRamp(ctx, live, s, ramp)
  if (mods.includes('chaser')) buildChaser(ctx, live, s, STAGES.needSpeed(s.k))
  if (mods.includes('flood')) flood(ctx, live, s)
  if (mods.includes('dark')) dark(ctx, live, s)
}
export const LANDING_DEPTH = OBSTACLE.landing.depth
// Reused by stages.js to draw the GAP_HAZARDS intro sign text.
export const GAP_NAMES = { gapLaser: 'LASER GATE', gapBlades: 'SKY BLADES', gapDrones: 'DRONES', gapWind: 'CROSSWIND' }
