import { AdditiveBlending, ConeGeometry, Group, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, TorusGeometry } from 'three'
import { OBSTACLE, STAGES } from '../config.js'
import { neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'
import { G, block, box, mesh, rod, solid } from './kit.js'
import {
  F, M, TRUCK_H, TRUCK_R, beaconMat, clamp01, createBolts, explode, floorPlane, fx, gear, loopOf, makeBeam, nearby, range, sfx, smooth, target,
} from './hazardKit.js'

// Weapons: laser fences, tracking turrets, mines, missile launchers,
// flamethrowers, tesla coils and spike strips. Each one warns before it fires
// (a beacon, a charge glow, a beep or a hiss), makes its own 3D sounds and
// asks main.js for its particles through fx(). Results:
//   hit (shove), kill (shot / blast: the truck blows up), zap (no steering),
//   burn (slowed, on fire), flat (a flat tyre pulls the truck sideways), near.

const NM = OBSTACLE.nearMiss
const coneGeo = new ConeGeometry(1, 1, 10)
const glowAdd = (color, opacity = 0.5) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false })

// A warning beacon on a post: a striped post, a cage and a dome that flashes.
function beacon(parent, x, y, z, color = '#ff3a1a', h = 1.2) {
  mesh(parent, G.cyl8, M.dark(), x, y + h / 2, z, 0.12, h, 0.12)
  const m = beaconMat(color)
  mesh(parent, G.sphere, m, x, y + h + 0.22, z, 0.26, 0.3, 0.26, false)
  mesh(parent, G.cyl8, M.iron(), x, y + h + 0.02, z, 0.3, 0.08, 0.3, false)
  return m
}

// --- Laser fence --------------------------------------------------------------------------
// Rows of beams across the lane, switching on and off. Low beams (hop them),
// high beams (stay on the ground) from altFrom; a beam sweeping sideways along
// the lane from sweepFrom; a full-height curtain with one open section that
// walks across from gridFrom.
function laserPost(parent, x, b, z, side, h = 4.2) {
  block(parent, M.dark(), x, b, z, 0.9, h, 0.9)
  block(parent, M.hazard(), x, b + 0.4, z, 0.95, 0.5, 0.95)
  box(parent, M.iron(), x, b + h + 0.15, z, 1.2, 0.3, 1.2)
  // Conduit on the ground and a power box.
  block(parent, M.steel(), x + side * 0.9, b, z, 0.9, 1.1, 1.4)
  box(parent, M.black(), x + side * 0.9, b + 0.7, z + 0.71, 0.5, 0.3, 0.04, false)
  rod(parent, M.rubber(), [x + side * 0.5, b + 0.15, z], [x + side * 0.5, b + 0.15, z + 3], 0.08)
  solid(x, 0, z, 0.9, h, 0.9)
}
function emitterHead(parent, x, y, z, side, color) {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  box(g, M.iron(), 0, 0, 0, 0.7, 0.6, 0.7)
  const lens = mesh(g, G.cyl, neon(color, 4), -side * 0.38, 0, 0, 0.2, 0.12, 0.2, false)
  lens.rotation.z = Math.PI / 2
  const ring = mesh(g, new TorusGeometry(0.26, 0.06, 6, 16), M.chrome(), -side * 0.4, 0, 0, 1, 1, 1, false)
  ring.rotation.y = Math.PI / 2
  for (const dy of [-0.38, 0.38]) box(g, M.steel(), 0, dy, 0, 0.5, 0.08, 0.5, false)
  return g
}

function laser(ctx, live, s, b, z) {
  const P = OBSTACLE.laser
  const C = range(P.cycle, s.k)
  const on = range(P.on, s.k)
  const knock = range(P.knock, s.k)
  const W = F - 0.6
  const kinds = s.k >= P.gridFrom ? ['low', 'grid', 'high'] : s.k >= P.altFrom ? ['low', 'high', 'low'] : ['low', 'low']
  const n = kinds.length
  kinds.forEach((kind, i) => {
    const rz = z + ((n - 1) / 2 - i) * P.spacing
    for (const side of [-1, 1]) laserPost(ctx.statics, side * W, b, rz, side, kind === 'grid' ? 4.6 : 4.2)
    const beacons = [-1, 1].map((side) => beacon(live, side * (W + 0.95), b + 1.1, rz - 0.5, '#ff2a2a', 0.6))
    const offset = (i * C) / n + s.k * 0.31
    if (kind === 'grid') return gridRow(ctx, live, s, b, rz, W, knock, beacons)
    const y = b + (kind === 'low' ? P.low : P.high)
    for (const side of [-1, 1]) emitterHead(live, side * W, y, rz, side, '#ff2a2a')
    const beam = makeBeam(live, '#ff2a2a', 0.09, kind === 'low' ? 0.34 : 0.4)
    beam.set(-W + 0.4, y, rz, W - 0.4, y, rz)
    beam.show(false)
    const o = { z: rz, near: 0, phase: 'off', loop: loopOf('laser', 0, y, rz) }
    o.update = (dt, t) => {
      const c = (t + offset) % C
      const onAt = C - on
      const phase = c >= onAt ? 'on' : c >= onAt - P.warn ? 'warn' : 'off'
      if (phase !== o.phase) {
        if (phase === 'warn') sfx('laserArm', 0, y, rz, 0.9)
        if (phase === 'on') sfx('laserOn', 0, y, rz, 1)
        if (phase === 'off' && o.phase === 'on') sfx('laserOff', 0, y, rz, 0.7)
      }
      o.phase = phase
      if (phase === 'on') beam.show(true, 1, 0.5)
      else if (phase === 'warn') beam.show(Math.random() < 0.45, 0.25)
      else beam.show(false)
      const flash = phase === 'warn' ? (Math.sin(c * 38) > 0 ? 3 : 0.2) : phase === 'on' ? 2.2 : 0.15
      for (const m of beacons) m.emissiveIntensity = flash
      o.loop.level = phase === 'on' ? 1 : 0
      if (phase === 'on' && Math.random() < dt * 8) fx('laserSpark', (Math.random() < 0.5 ? -1 : 1) * (W - 0.5), y, rz)
    }
    o.test = (pp) => {
      if (o.phase !== 'on' || Math.abs(pp.z - rz) > TRUCK_R * 0.7 + 0.4) return null
      const bottom = pp.y
      const top = pp.y + TRUCK_H
      if (bottom < y + 0.05 && top > y) return { hit: true, laser: true, vx: (Math.random() - 0.5) * 6, vy: 5, vz: knock * 0.6, x: pp.x, y, z: rz, power: 0.9, color: '#ff2a2a' }
      return (bottom >= y ? bottom - y : y - top) < 1.2 ? { near: true, x: pp.x } : null
    }
    ctx.obstacles.push(o)
    gear(ctx, (i % 2 ? 1 : -1) * 8, kind === 'low' ? b + 2.4 : b + 1.4, rz, s.k, i === 1)
  })
  // The sweeping beam: two floor carriages on rails across the lane, the beam
  // between them along the lane, gliding side to side at bumper height.
  if (s.k >= P.sweepFrom) {
    const sz = z - (n / 2 + 0.6) * P.spacing
    const len = 8
    for (const e of [-1, 1]) {
      box(live, M.iron(), 0, b + 0.12, sz + e * (len / 2 + 0.6), W * 2, 0.24, 0.5, false)
      box(live, M.hazard(), 0, b + 0.26, sz + e * (len / 2 + 0.6), W * 2, 0.04, 0.5, false)
    }
    const carts = [-1, 1].map((e) => {
      const g = new Group()
      live.add(g)
      box(g, M.dark(), 0, b + 0.55, sz + e * (len / 2 + 0.6), 1.1, 0.7, 0.9)
      emitterHead(g, 0, b + 0.85, sz + e * (len / 2 + 0.2), 1, '#ff2a2a').rotation.y = e > 0 ? Math.PI / 2 : -Math.PI / 2
      for (const wx of [-0.4, 0.4]) mesh(g, G.cyl8, M.rubber(), wx, b + 0.2, sz + e * (len / 2 + 0.6), 0.2, 0.9, 0.2).rotation.x = Math.PI / 2
      return g
    })
    const beam = makeBeam(live, '#ff2a2a', 0.06, 0.28)
    const w = range(P.sweepSpeed, s.k)
    const o = { z: sz, near: 0, x: 0, loop: loopOf('laser', 0, b + 0.85, sz), reach: len / 2 }
    o.loop.level = 1
    o.update = (dt, t) => {
      o.x = (W - 3) * Math.sin(t * w + s.k)
      for (const c of carts) c.position.x = o.x
      beam.set(o.x, b + 0.85, sz + len / 2, o.x, b + 0.85, sz - len / 2)
      beam.show(true, 1, 0.4)
      o.loop.x = o.x
    }
    o.test = (pp) => {
      if (Math.abs(pp.z - sz) > len / 2 + TRUCK_R * 0.5) return null
      const dx = Math.abs(pp.x - o.x)
      if (dx < TRUCK_R * 0.8 && pp.y - b < 0.85) return { hit: true, laser: true, vx: Math.sign(pp.x - o.x || 1) * knock * 0.7, vy: 5, vz: 3, x: o.x, y: b + 0.85, z: pp.z, power: 0.9, color: '#ff2a2a' }
      return dx < TRUCK_R + NM && pp.y - b < 0.85 ? { near: true, x: o.x } : null
    }
    ctx.obstacles.push(o)
    gear(ctx, 0, b + 2.6, sz, s.k, 'mega')
  }
}

// A curtain of beams in four sections; one section is open and it walks
// across the lane (the section about to close flickers first).
function gridRow(ctx, live, s, b, rz, W, knock, beacons) {
  const P = OBSTACLE.laser
  const step = range(P.gridStep, s.k)
  const secs = 4
  const sw = (W * 2) / secs
  const ys = [0.5, 1.3, 2.1, 2.9, 3.7]
  const beams = []
  for (let i = 0; i < secs; i++) {
    const x0 = -W + i * sw
    if (i > 0) {
      block(ctx.statics, M.dark(), x0, b, rz, 0.5, 4.4, 0.5)
      solid(x0, 0, rz, 0.5, 4.4, 0.5)
    }
    beams.push(ys.map((y) => {
      const bm = makeBeam(live, '#ff2a2a', 0.05, 0.22)
      bm.set(x0 + 0.3, b + y, rz, x0 + sw - 0.3, b + y, rz)
      return bm
    }))
  }
  for (const side of [-1, 1]) for (const y of ys) emitterHead(live, side * W, b + y, rz, side, '#ff2a2a').scale.setScalar(0.6)
  const order = [0, 1, 2, 3, 2, 1]
  const o = { z: rz, near: 0, open: 0, loop: loopOf('laser', 0, b + 2, rz) }
  o.loop.level = 1
  let last = -1
  o.update = (dt, t) => {
    const n = Math.floor((t + s.k) / step)
    const c = (t + s.k) / step - n
    o.open = order[n % order.length]
    const next = order[(n + 1) % order.length]
    const warn = c > 1 - P.warn / step
    if (n !== last) {
      sfx('laserOn', -W + (o.open + 0.5) * sw, b + 2, rz, 0.6)
      last = n
    }
    beams.forEach((row, i) => {
      const open = i === o.open
      const flick = warn && (i === next || i === o.open)
      for (const bm of row) {
        if (open && !flick) bm.show(false)
        else if (flick) bm.show(Math.random() < (open ? 0.35 : 0.6), open ? 0.3 : 0.7)
        else bm.show(true, 1, 0.35)
      }
    })
    for (const m of beacons) m.emissiveIntensity = warn ? (Math.sin(t * 40) > 0 ? 3 : 0.2) : 1.2
  }
  o.test = (pp) => {
    const dz = Math.abs(pp.z - rz)
    if (dz > TRUCK_R * 0.7 + 0.4 || pp.y - b > 4.2) return null
    const i = Math.max(0, Math.min(secs - 1, Math.floor((pp.x + W) / sw)))
    const inOpen = i === o.open && Math.abs(pp.x - (-W + (i + 0.5) * sw)) < sw / 2 - TRUCK_R * 0.6
    if (inOpen) return { near: true, x: pp.x }
    return { hit: true, laser: true, vx: (Math.random() - 0.5) * 6, vy: 4, vz: knock * 0.7, x: pp.x, y: pp.y + 1.2, z: rz, power: 1, color: '#ff2a2a' }
  }
  ctx.obstacles.push(o)
  gear(ctx, 0, b + 1.4, rz - 3, s.k, true)
}

// --- Tracking turret -----------------------------------------------------------------------
// On a pedestal past the rail: it swings to follow the truck, paints it with a
// red aim line while it charges (beeping faster), then fires a plasma bolt at
// where the truck is going to be. A direct hit blows the truck up.
function turretUnit(ctx, live, s, b, x, z, offset) {
  const P = OBSTACLE.turret
  const C = range(P.cycle, s.k)
  const aimT = range(P.aim, s.k)
  const speed = range(P.speed, s.k)
  const lead = range(P.lead, s.k)
  const side = Math.sign(x)
  // Pedestal (static, solid).
  block(ctx.statics, M.dark(), x, b, z, 3, 0.6, 3)
  mesh(ctx.statics, G.cyl8, M.iron(), x, b + 1.3, z, 1.2, 1.4, 1.2)
  mesh(ctx.statics, G.cyl8, M.hazard(), x, b + 0.85, z, 1.25, 0.35, 1.25)
  solid(x, 0, z, 3, 2.2, 3)
  // Yaw head.
  const yawG = new Group()
  yawG.position.set(x, b + 2.1, z)
  live.add(yawG)
  mesh(yawG, G.cyl, M.steel(), 0, 0, 0, 1.15, 0.3, 1.15)
  box(yawG, M.red(), 0, 0.75, 0, 1.9, 1.2, 1.7)
  box(yawG, M.dark(), 0, 1.42, 0, 1.6, 0.15, 1.4)
  for (const e of [-1, 1]) {
    box(yawG, M.iron(), e * 1.0, 0.75, 0, 0.12, 1.0, 1.5) // side armour
    for (let i = 0; i < 4; i++) box(yawG, M.black(), e * 1.07, 0.45 + i * 0.2, -0.2, 0.02, 0.08, 0.9, false) // vents
  }
  rod(yawG, M.chrome(), [-0.6, 1.5, 0.5], [-0.6, 2.6, 0.5], 0.04)
  const tipMat = beaconMat('#ff2a2a')
  mesh(yawG, G.sphere, tipMat, -0.6, 2.65, 0.5, 0.1, 0.1, 0.1, false)
  const eyeMat = neon('#ff2a2a', 4)
  box(yawG, eyeMat, 0, 1.0, 0.86, 0.9, 0.18, 0.04, false)
  // Pitch: the twin barrels.
  const pitchG = new Group()
  pitchG.position.set(0, 0.75, 0.5)
  yawG.add(pitchG)
  for (const e of [-0.42, 0.42]) {
    const br = mesh(pitchG, G.cyl, M.iron(), e, 0, 1.3, 0.2, 2.6, 0.2)
    br.rotation.x = Math.PI / 2
    const brake = mesh(pitchG, G.cyl8, M.black(), e, 0, 2.55, 0.3, 0.45, 0.3)
    brake.rotation.x = Math.PI / 2
  }
  const muzzleMat = glowAdd('#ff3a6a', 0)
  const muzzle = mesh(pitchG, G.sphere, muzzleMat, 0, 0, 2.9, 0.5, 0.5, 0.5, false)
  const sight = makeBeam(live, '#ff2030', 0.025, 0.09)
  sight.show(false)
  const bolts = createBolts(live, '#ff3a6a', 3, 0.5)
  const o = { z, near: 0, phase: 'idle', yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, pitch: 0, beepT: 0, reach: 40, loop: loopOf('servo', x, b + 2.5, z) }
  const muzzleAt = { x: 0, y: 0, z: 0 }
  let aimX = 0
  let aimY = 0
  let aimZ = 0
  o.update = (dt, t) => {
    const active = nearby(b, z, P.range)
    const c = (t + offset) % C
    const fireAt = C
    const phase = !active ? 'idle' : c > fireAt - aimT ? 'aim' : 'track'
    // Where to shoot: where the truck will be.
    const tp = target.p
    aimX = tp.x + target.v.x * lead
    aimY = tp.y + 1.2
    aimZ = tp.z + target.v.z * lead
    const want = active ? Math.atan2(aimX - x, aimZ - z) : side > 0 ? -Math.PI / 2 : Math.PI / 2
    let d = want - o.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    const turn = P.turn * dt * (phase === 'aim' ? 1.6 : 1)
    o.yaw += Math.max(-turn, Math.min(turn, d))
    yawG.rotation.y = o.yaw
    const flat = Math.hypot(aimX - x, aimZ - z)
    o.pitch += (Math.atan2(aimY - (b + 2.85), flat) * -1 - o.pitch) * Math.min(1, dt * 6)
    pitchG.rotation.x = active ? o.pitch : 0
    o.loop.level = active ? Math.min(1, Math.abs(d) * 2 + 0.15) : 0
    o.loop.pitch = 0.8 + Math.min(1, Math.abs(d)) * 0.8
    // The muzzle in world space.
    const cy = Math.cos(o.yaw)
    const sy = Math.sin(o.yaw)
    const cp = Math.cos(o.pitch)
    muzzleAt.x = x + sy * (0.5 + 2.9 * cp)
    muzzleAt.y = b + 2.85 - Math.sin(o.pitch) * 2.9
    muzzleAt.z = z + cy * (0.5 + 2.9 * cp)
    if (phase === 'aim') {
      const u = clamp01((c - (fireAt - aimT)) / aimT)
      sight.set(muzzleAt.x, muzzleAt.y, muzzleAt.z, aimX, aimY, aimZ)
      sight.show(Math.random() < 0.6 + u * 0.4, 0.4 + u * 0.6)
      muzzleMat.opacity = u * 0.9
      muzzle.scale.setScalar(0.3 + u * 0.6)
      // Beeps speed up as it locks on.
      o.beepT -= dt
      if (o.beepT <= 0) {
        sfx('beep', x, b + 2.5, z, 0.6 + u * 0.6)
        o.beepT = 0.32 - u * 0.24
      }
      tipMat.emissiveIntensity = Math.sin(t * 30) > 0 ? 3 : 0.3
      if (Math.random() < dt * 20 * u) fx('charge', muzzleAt.x, muzzleAt.y, muzzleAt.z, { color: '#ff3a6a' })
    } else {
      sight.show(false)
      muzzleMat.opacity = 0
      tipMat.emissiveIntensity = active ? 0.8 : 0.15
      o.beepT = 0
    }
    if (o.phase === 'aim' && phase !== 'aim' && active) {
      // Fire.
      const dx = aimX - muzzleAt.x
      const dy = aimY - muzzleAt.y
      const dz = aimZ - muzzleAt.z
      const len = Math.hypot(dx, dy, dz) || 1
      bolts.fire(muzzleAt.x, muzzleAt.y, muzzleAt.z, (dx / len) * speed, (dy / len) * speed, (dz / len) * speed, (P.range * 1.2) / speed)
      sfx('plasma', muzzleAt.x, muzzleAt.y, muzzleAt.z, 1.2)
      fx('muzzle', muzzleAt.x, muzzleAt.y, muzzleAt.z, { dx: dx / len, dy: dy / len, dz: dz / len, color: '#ff3a6a' })
      pitchG.position.z = 0.2 // recoil
    }
    pitchG.position.z += (0.5 - pitchG.position.z) * Math.min(1, dt * 8)
    o.phase = phase
    bolts.update(dt, b)
  }
  o.test = (pp) => bolts.test(pp)
  ctx.obstacles.push(o)
}
function turret(ctx, live, s, b, z) {
  const C = range(OBSTACLE.turret.cycle, s.k)
  const x = STAGES.half - 1.6
  turretUnit(ctx, live, s, b, -x, z + 5, 0)
  turretUnit(ctx, live, s, b, x, z - 5, C / 2)
  for (let i = 0; i < 3; i++) gear(ctx, -6 + i * 6, b + 1.4, z, s.k, i === 1)
}

// --- Mines -----------------------------------------------------------------------------------
// Blinking discs in the floor. Touch one: it beeps, then blows (a shove and a
// lift away from it). From chainFrom a blast sets off its neighbours; from
// hiddenFrom they stay buried until the truck is within `reveal` m.
export function mineField(ctx, live, s, b, z, len, x0, x1, count, seed = 0) {
  const P = OBSTACLE.mines
  const rand = mulberry32(s.k * 131 + Math.round(z) * 7 + seed)
  const knock = range(P.knock, s.k)
  const lift = range(P.lift, s.k)
  const hidden = s.k >= P.hiddenFrom
  const chain = s.k >= P.chainFrom
  const spots = []
  for (let tries = 0; spots.length < count && tries < 400; tries++) {
    const mx = x0 + rand() * (x1 - x0)
    const mz = z + (rand() - 0.5) * len
    if (spots.every((p) => Math.hypot(p[0] - mx, p[1] - mz) > 5.2)) spots.push([mx, mz])
  }
  const mines = []
  const shellMat = mat3('#4a5636')
  for (const [mx, mz] of spots) {
    const g = new Group()
    g.position.set(mx, b, mz)
    live.add(g)
    mesh(g, G.cyl, shellMat, 0, 0.11, 0, P.r, 0.22, P.r)
    mesh(g, G.cyl, M.hazard(), 0, 0.23, 0, P.r * 0.92, 0.04, P.r * 0.92, false)
    mesh(g, G.cyl, M.iron(), 0, 0.28, 0, P.r * 0.55, 0.1, P.r * 0.55, false)
    const dome = beaconMat('#ff2a1a')
    mesh(g, G.sphere, dome, 0, 0.33, 0, 0.2, 0.16, 0.2, false)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      rod(g, M.steel(), [Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35], [Math.cos(a) * 0.48, 0.62, Math.sin(a) * 0.48], 0.035)
      mesh(g, G.sphere, M.steel(), Math.cos(a) * 0.48, 0.64, Math.sin(a) * 0.48, 0.06, 0.06, 0.06, false)
    }
    // A scorched patch shows where the mine was after it blows.
    const scorch = floorPlane(live, new MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), mx, b + 0.03, mz, 3.2, 3.2)
    const mine = { g, dome, scorch, x: mx, z: mz, state: 'armed', t: 0, shown: hidden ? 0 : 1, boom: false }
    mines.push(mine)
    const o = { z: mz, near: 0, slam: false, slamAt: { x: mx, y: b, z: mz, w: 3, d: 3 } }
    o.update = (dt, t) => {
      mine.t += dt
      o.slam = false
      mine.boom = false
      if (mine.state === 'armed') {
        const d = Math.hypot(target.p.x - mx, target.p.z - mz)
        if (hidden) {
          const want = d < P.reveal && Math.abs(target.p.y - b) < 4 ? 1 : 0
          if (want && mine.shown < 0.05) sfx('mineArm', mx, b + 0.3, mz, 0.8)
          mine.shown += (want - mine.shown) * Math.min(1, dt * 6)
        }
        const near = d < 9 ? 1 - d / 9 : 0
        const rate = 2 + near * 10
        dome.emissiveIntensity = Math.sin(t * rate * Math.PI + mx) > 0.6 ? 3 : 0.25
      } else if (mine.state === 'fuse') {
        dome.emissiveIntensity = Math.sin(mine.t * 90) > 0 ? 4 : 1
        g.position.y = b - 0.08
        if (mine.t >= mine.fuse) {
          mine.state = 'gone'
          mine.t = 0
          mine.boom = true
          o.slam = true
          g.visible = false
          scorch.material.opacity = 0.75
          explode(mx, b + 0.6, mz, 1)
          if (chain) {
            for (const m2 of mines) {
              if (m2.state === 'armed' && Math.hypot(m2.x - mx, m2.z - mz) < P.chain) {
                m2.state = 'fuse'
                m2.t = 0
                m2.fuse = P.chainDelay
                sfx('beep', m2.x, b + 0.4, m2.z, 1.2)
              }
            }
          }
        }
      } else if (mine.state === 'gone') {
        scorch.material.opacity = 0.75 * Math.max(0, 1 - mine.t / P.respawn)
        if (mine.t > P.respawn && Math.hypot(target.p.x - mx, target.p.z - mz) > 6) {
          mine.state = 'armed'
          mine.t = 0
          g.visible = true
          g.position.y = b
          if (!hidden) sfx('mineArm', mx, b + 0.3, mz, 0.7)
        }
      }
      const sc = hidden ? smooth(clamp01(mine.shown)) : 1
      g.scale.set(1, Math.max(0.01, sc), 1)
      g.position.y = mine.state === 'fuse' ? b - 0.08 : b - (1 - sc) * 0.3
    }
    o.test = (pp) => {
      const d = Math.hypot(pp.x - mx, pp.z - mz)
      if (mine.state === 'armed' && d < P.r + TRUCK_R * 0.9 && pp.y - b < 1) {
        mine.state = 'fuse'
        mine.t = 0
        mine.fuse = P.fuse
        sfx('beep', mx, b + 0.4, mz, 1.4)
        sfx('click', mx, b + 0.4, mz, 1)
        return null
      }
      if (mine.boom && d < P.blast && pp.y - b < 4) {
        const f = 1 - d / P.blast
        const ux = (pp.x - mx) / (d || 1)
        const uz = (pp.z - mz) / (d || 1)
        return { hit: true, mine: true, vx: ux * knock * (0.5 + f), vy: lift * (0.6 + 0.4 * f), vz: uz * knock * (0.5 + f), x: mx, y: b + 0.5, z: mz, power: 1 + f * 0.6, color: '#4a5636' }
      }
      return mine.state === 'fuse' && d < P.blast + NM ? { near: true, x: mx } : null
    }
    ctx.obstacles.push(o)
  }
  return spots
}
const mat3 = (c) => new MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.5 })
function mines(ctx, live, s, b, z) {
  const P = OBSTACLE.mines
  const spots = mineField(ctx, live, s, b, z, P.len, -F + 3, F - 3, Math.round(range(P.count, s.k)))
  // Gears between the mines, a gold one in the thick of it.
  for (let i = 0; i < 4; i++) gear(ctx, -15 + i * 10, b + 1.4, z + (i % 2 ? 4 : -4), s.k, i === 2)
  if (spots.length) gear(ctx, spots[0][0], b + 2.4, spots[0][1], s.k, true)
}

// --- Missile launcher -------------------------------------------------------------------------
// A pod on a lattice tower beside the lane: it locks onto where the truck is
// heading (a red reticle on the floor), fires, and the missile arcs over and
// lands there. Change speed (gas or brake) to get out of the circle.
function launcherTower(ctx, live, b, x, z) {
  const side = Math.sign(x)
  const H = 9
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(ctx.statics, M.red(), [x + dx * 1.4, b, z + dz * 1.4], [x + dx * 0.9, b + H, z + dz * 0.9], 0.14)
  for (let y = 1.5; y < H; y += 2.5) {
    rod(ctx.statics, M.white(), [x - 1.3, b + y, z - 1.3], [x + 1.3, b + y + 1.2, z + 1.3], 0.07)
    rod(ctx.statics, M.white(), [x + 1.3, b + y, z - 1.3], [x - 1.3, b + y + 1.2, z + 1.3], 0.07)
  }
  block(ctx.statics, M.dark(), x, b, z, 3.6, 0.5, 3.6)
  solid(x, 0, z, 3.4, H, 3.4)
  // The pod: a box of six tubes facing up and toward the lane.
  const pod = new Group()
  pod.position.set(x, b + H + 1.3, z)
  pod.rotation.z = side * 0.5
  live.add(pod)
  box(pod, M.steel(), 0, 0, 0, 2.6, 2.2, 3.4)
  box(pod, M.hazard(), 0, -1.05, 0, 2.65, 0.25, 3.45)
  const tubes = []
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const tx = (r - 0.5) * 1.1
      const tz = (c - 1) * 1.05
      mesh(pod, G.cyl8, M.black(), tx, 1.12, tz, 0.4, 0.06, 0.4, false)
      const nose = mesh(pod, G.cone, M.red(), tx, 1.2, tz, 0.26, 0.4, 0.26, false)
      tubes.push({ nose, x: tx, z: tz })
    }
  }
  // A radar dish spinning on top and a light.
  const dish = new Group()
  dish.position.set(x - side * 0.4, b + H + 3.4, z)
  live.add(dish)
  rod(dish, M.iron(), [0, -0.9, 0], [0, 0, 0], 0.08)
  const d = mesh(dish, G.sphere, M.white(), 0, 0.2, 0, 0.9, 0.3, 0.9)
  d.rotation.x = 1.2
  const lightMat = beaconMat('#ff2a1a')
  mesh(dish, G.sphere, lightMat, 0, 0.9, 0, 0.18, 0.18, 0.18, false)
  return { pod, tubes, dish, lightMat, x, y: b + H + 1.3, z }
}
function missileMesh(live) {
  const g = new Group()
  g.visible = false
  live.add(g)
  const body = mesh(g, G.cyl, M.white(), 0, 0, 0, 0.24, 2.2, 0.24)
  body.rotation.x = Math.PI / 2
  const nose = mesh(g, G.cone, M.red(), 0, 0, 1.4, 0.24, 0.6, 0.24)
  nose.rotation.x = Math.PI / 2
  mesh(g, G.cyl, M.red(), 0, 0, 0.4, 0.25, 0.18, 0.25).rotation.x = Math.PI / 2
  for (let i = 0; i < 4; i++) {
    const fin = box(g, M.dark(), 0, 0, -0.85, 0.05, 0.9, 0.5)
    fin.rotation.z = (i * Math.PI) / 2
  }
  const flame = mesh(g, coneGeo, glowAdd('#ffb02a', 0.9), 0, 0, -1.6, 0.22, 0.9, 0.22, false)
  flame.rotation.x = -Math.PI / 2
  return { g, flame }
}
function missiles(ctx, live, s, b, z) {
  const P = OBSTACLE.missiles
  const C = range(P.cycle, s.k)
  const flight = range(P.flight, s.k)
  const knock = range(P.knock, s.k)
  const lead = range(P.lead, s.k)
  const sides = s.k >= P.twinFrom ? [-1, 1] : [s.k % 2 ? 1 : -1]
  sides.forEach((side, li) => {
    const L = launcherTower(ctx, live, b, side * (STAGES.half - 1.9), z + (li ? -8 : 8))
    const shots = [0, 1, 2].map(() => {
      const m = missileMesh(live)
      const rm = M.reticle().clone()
      rm.opacity = 0
      const ret = floorPlane(live, rm, 0, b + 0.06, 0, 6, 6)
      ret.visible = false
      return { ...m, ret, rm, live: false, t: 0, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0, boom: false, phase: 'off' }
    })
    let tube = 0
    const offset = li * (C / 2) + s.k * 0.4
    const o = { z, near: 0, reach: P.zone, phase: 'idle' }
    let lockX = 0
    let lockZ = 0
    o.update = (dt, t) => {
      const active = nearby(b, z, P.zone / 2 + 14)
      const c = (t + offset) % C
      const lockAt = C - P.lock
      const phase = !active ? 'idle' : c >= lockAt ? 'lock' : 'wait'
      L.dish.rotation.y += dt * (phase === 'lock' ? 9 : 1.5)
      L.lightMat.emissiveIntensity = phase === 'lock' ? (Math.sin(t * 36) > 0 ? 3.5 : 0.2) : active ? 0.8 : 0.1
      if (phase === 'lock' && o.phase !== 'lock') sfx('lockOn', L.x, L.y, L.z, 1)
      if (phase === 'lock') {
        // Predict where the truck will be when the missile lands.
        lockX = Math.max(-F + 2, Math.min(F - 2, target.p.x + target.v.x * (flight * lead)))
        lockZ = Math.max(z - P.zone / 2, Math.min(z + P.zone / 2, target.p.z + target.v.z * (flight * lead)))
      }
      if (o.phase === 'lock' && phase !== 'lock' && active) {
        // Launch from the next tube.
        const sh = shots.find((q) => !q.live) ?? shots[0]
        const tb = L.tubes[tube++ % L.tubes.length]
        Object.assign(sh, { live: true, t: 0, sx: L.x + tb.x * 0.7, sy: L.y + 1.4, sz: L.z + tb.z, tx: lockX, tz: lockZ })
        sh.g.visible = true
        sh.ret.visible = true
        sh.ret.position.set(lockX, b + 0.06, lockZ)
        sfx('missile', sh.sx, sh.sy, sh.sz, 1.2)
        fx('launch', sh.sx, sh.sy, sh.sz)
      }
      o.phase = phase
      for (const sh of shots) {
        sh.boom = false
        if (!sh.live) continue
        sh.t += dt
        const u = Math.min(1, sh.t / flight)
        // A high arc: up out of the pod, over, and down onto the reticle.
        const peak = 22
        const px = sh.sx + (sh.tx - sh.sx) * u
        const pz = sh.sz + (sh.tz - sh.sz) * u
        const py = sh.sy + (b - sh.sy) * u + peak * 4 * u * (1 - u)
        const u2 = Math.min(1, u + 0.02)
        const nx = sh.sx + (sh.tx - sh.sx) * u2
        const nz = sh.sz + (sh.tz - sh.sz) * u2
        const ny = sh.sy + (b - sh.sy) * u2 + peak * 4 * u2 * (1 - u2)
        sh.g.position.set(px, py, pz)
        sh.g.lookAt(nx, ny, nz)
        sh.flame.scale.set(0.22 * (0.8 + Math.random() * 0.4), 0.9 * (0.7 + Math.random() * 0.6), 0.22)
        fx('missileTrail', px, py, pz)
        sh.rm.opacity = 0.35 + 0.55 * u * (0.6 + 0.4 * Math.sin(sh.t * 30))
        sh.ret.rotation.z += dt * 3
        const sc = 6 * (1.4 - u * 0.5)
        sh.ret.scale.set(sc, sc, 1)
        if (u > 0.55 && sh.phase !== 'incoming') {
          sh.phase = 'incoming'
          sfx('incoming', sh.tx, b + 6, sh.tz, 1)
        }
        if (u >= 1) {
          sh.live = false
          sh.phase = 'off'
          sh.g.visible = false
          sh.ret.visible = false
          sh.boom = true
          explode(sh.tx, b + 0.6, sh.tz, 1.4)
          fx('crack', sh.tx, b, sh.tz, { size: 6 })
        }
      }
    }
    o.test = (pp) => {
      for (const sh of shots) {
        if (!sh.boom) continue
        const d = Math.hypot(pp.x - sh.tx, pp.z - sh.tz)
        if (pp.y - b > 5) continue
        if (d < P.kill) return { kill: 'blast', why: 'DIRECT HIT!', x: sh.tx, y: b + 1, z: sh.tz }
        if (d < P.blast) {
          const f = 1 - d / P.blast
          return { hit: true, mine: true, vx: ((pp.x - sh.tx) / d) * knock * (0.5 + f), vy: P.lift * (0.5 + f * 0.5), vz: ((pp.z - sh.tz) / d) * knock * (0.5 + f), x: sh.tx, y: b + 1, z: sh.tz, power: 1.2 + f, color: '#ffffff' }
        }
        if (d < P.blast + NM * 2) return { near: true, x: sh.tx }
      }
      return null
    }
    ctx.obstacles.push(o)
  })
  for (let i = 0; i < 5; i++) gear(ctx, (i % 2 ? 1 : -1) * 10, b + 1.4, z - 16 + i * 8, s.k, i === 4)
}

// --- Flamethrowers -------------------------------------------------------------------------------
// Nozzles on fuel housings at the lane edges blast fire across the lane in turn.
// A pilot light grows and sputters before each blast. Driving through sets the
// truck on fire: slower for a while.
function flames(ctx, live, s, b, z) {
  const P = OBSTACLE.flames
  const C = range(P.cycle, s.k)
  const burnT = range(P.burn, s.k)
  const cross = s.k >= P.crossFrom
  const W = F - 0.4
  const nozzles = [[-6, -1], [0, 1], [6, -1]]
  if (cross) nozzles.push([-6, 1], [0, -1], [6, 1])
  for (const side of [-1, 1]) {
    // Fuel housing with tanks and pipes along the edge.
    block(ctx.statics, M.dark(), side * (W + 0.9), b, z, 1.8, 2.6, 16)
    solid(side * (W + 0.9), 0, z, 1.8, 2.6, 16)
    for (const dz of [-4, 4]) {
      const tank = mesh(ctx.statics, G.cyl, M.red(), side * (W + 1.0), b + 3.6, z + dz, 0.9, 3.2, 0.9)
      tank.rotation.x = Math.PI / 2
      mesh(ctx.statics, G.cyl, M.hazard(), side * (W + 1.0), b + 3.6, z + dz, 0.92, 0.5, 0.92).rotation.x = Math.PI / 2
      mesh(ctx.statics, G.sphere, M.chrome(), side * (W + 0.1), b + 3.8, z + dz, 0.25, 0.25, 0.08) // gauge
    }
    rod(ctx.statics, M.copper(), [side * (W + 0.5), b + 2.7, z - 7.5], [side * (W + 0.5), b + 2.7, z + 7.5], 0.14)
  }
  nozzles.forEach(([dz, side], i) => {
    const nz = z + dz
    const nx = side * W
    const y = b + 1.3
    rod(live, M.copper(), [side * (W + 0.5), b + 2.7, nz], [side * (W + 0.5), y, nz], 0.14)
    const noz = mesh(live, G.cyl8, M.iron(), nx, y, nz, 0.35, 1.2, 0.35)
    noz.rotation.z = Math.PI / 2
    mesh(live, G.cyl8, M.black(), nx - side * 0.62, y, nz, 0.45, 0.2, 0.45).rotation.z = Math.PI / 2
    const pilotMat = glowAdd('#4aa8ff', 0.8)
    const pilot = mesh(live, G.sphere, pilotMat, nx - side * 0.8, y, nz, 0.15, 0.22, 0.15, false)
    // The jet: an outer orange cone and a hot yellow core.
    const jet = new Group()
    jet.position.set(nx - side * 0.7, y, nz)
    jet.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2 // local -Y points across the lane
    live.add(jet)
    mesh(jet, coneGeo, glowAdd('#ff6a1a', 0.55), 0, -P.reach / 2, 0, 1.6, P.reach, 1.6, false)
    mesh(jet, coneGeo, glowAdd('#ffe27a', 0.7), 0, -P.reach * 0.3, 0, 0.7, P.reach * 0.6, 0.7, false)
    jet.visible = false
    const offset = ((i % 3) * C) / 3 + (i >= 3 ? C / 2 : 0) + s.k * 0.27
    const o = { z: nz, near: 0, phase: 'off', loop: loopOf('flame', 0, y, nz), reach: 4 }
    o.update = (dt, t) => {
      const c = (t + offset) % C
      const onAt = C - burnT
      const phase = c >= onAt ? 'burn' : c >= onAt - P.warn ? 'warn' : 'off'
      if (phase !== o.phase) {
        if (phase === 'warn') sfx('hiss', nx, y, nz, 0.8)
        if (phase === 'burn') sfx('ignite', nx - side * 4, y, nz, 1.2)
      }
      o.phase = phase
      jet.visible = phase === 'burn'
      if (phase === 'burn') {
        const u = Math.min(1, (c - onAt) / 0.12)
        const fl = 0.85 + Math.random() * 0.3
        jet.scale.set(fl, u * (0.9 + Math.random() * 0.15), fl)
        fx('flameJet', nx - side * 0.8, y, nz, { dir: -side, reach: P.reach })
      }
      pilot.scale.setScalar(phase === 'warn' ? 0.25 + Math.random() * 0.25 : 0.15)
      pilotMat.color.set(phase === 'warn' ? '#ff9a2a' : '#4aa8ff')
      if (phase === 'warn' && Math.random() < dt * 14) fx('sputter', nx - side * 0.9, y, nz, { dir: -side })
      o.loop.level = phase === 'burn' ? 1 : 0
      o.loop.x = nx - side * P.reach * 0.4
    }
    o.test = (pp) => {
      const along = (pp.x - nx) * -side
      if (Math.abs(pp.z - nz) > 2.2 + TRUCK_R * 0.5 || pp.y - b > 3.4 || along < -TRUCK_R || along > P.reach + TRUCK_R * 0.5) return null
      if (o.phase === 'burn') return { burn: P.burnTime, slow: P.slow, x: pp.x, y: y, z: nz }
      return o.phase === 'warn' ? { near: true, x: nx } : null
    }
    ctx.obstacles.push(o)
  })
  for (let i = 0; i < 3; i++) gear(ctx, -8 + i * 8, b + 1.4, z + (i - 1) * 6, s.k, i === 1)
}

// --- Tesla coils ----------------------------------------------------------------------------------
// Coils across the lane with arcs jumping between neighbours, flickering on and
// off. A zap kills the steering for a moment. The coils themselves are solid.
const ARC_SEG = 9
function coil(ctx, live, b, x, z) {
  block(ctx.statics, M.dark(), x, b, z, 2.4, 0.5, 2.4)
  block(ctx.statics, M.hazard(), x, b + 0.5, z, 2.0, 0.2, 2.0)
  for (let i = 0; i < 5; i++) mesh(ctx.statics, G.cyl, i % 2 ? M.white() : mat3('#7a3a1a'), x, b + 0.9 + i * 0.32, z, 0.55 - i * 0.03, 0.3, 0.55 - i * 0.03)
  for (let i = 0; i < 7; i++) {
    const t = mesh(ctx.statics, new TorusGeometry(0.5, 0.08, 6, 18), M.copper(), x, b + 2.6 + i * 0.3, z)
    t.rotation.x = Math.PI / 2
  }
  mesh(ctx.statics, G.cyl8, M.iron(), x, b + 3.2, z, 0.3, 2.2, 0.3)
  const top = mesh(ctx.statics, new TorusGeometry(0.85, 0.32, 10, 24), M.chrome(), x, b + 4.8, z)
  top.rotation.x = Math.PI / 2
  solid(x, 0, z, 1.4, 5, 1.4)
  const orbMat = new MeshStandardMaterial({ color: '#9fdcff', emissive: '#5ab8ff', emissiveIntensity: 0.4, roughness: 0.2 })
  mesh(live, G.sphere, orbMat, x, b + 5.2, z, 0.45, 0.45, 0.45, false)
  return orbMat
}
function arc(live) {
  const segs = []
  for (let i = 0; i < ARC_SEG; i++) segs.push(makeBeam(live, '#8ad8ff', 0.06, 0.32))
  const pts = new Array(ARC_SEG + 1).fill(0).map(() => [0, 0, 0])
  return {
    draw(ax, bx, y, z, on, k) {
      for (let i = 0; i <= ARC_SEG; i++) {
        const u = i / ARC_SEG
        const j = i === 0 || i === ARC_SEG ? 0 : 1
        pts[i][0] = ax + (bx - ax) * u
        pts[i][1] = y + j * (Math.random() - 0.5) * 1.8 * Math.sin(u * Math.PI)
        pts[i][2] = z + j * (Math.random() - 0.5) * 0.7
      }
      for (let i = 0; i < ARC_SEG; i++) {
        const a = pts[i]
        const c = pts[i + 1]
        segs[i].set(a[0], a[1], a[2], c[0], c[1], c[2])
        segs[i].show(on, k, 0.8)
      }
    },
    hide() {
      for (const s of segs) s.show(false)
    },
  }
}
function tesla(ctx, live, s, b, z) {
  const P = OBSTACLE.tesla
  const C = range(P.cycle, s.k)
  const on = range(P.on, s.k)
  const orbs = P.xs.map((x) => coil(ctx, live, b, x, z))
  for (let i = 0; i < P.xs.length - 1; i++) {
    const ax = P.xs[i] + 0.9
    const bx = P.xs[i + 1] - 0.9
    const A = arc(live)
    const y = b + P.h
    // Electrodes the arc jumps between.
    for (const ex of [ax, bx]) mesh(live, G.sphere, M.chrome(), ex, y, z, 0.3, 0.3, 0.3)
    const offset = (i * C) / 2 + s.k * 0.23
    const o = { z, near: 0, phase: 'off', loop: loopOf('tesla', (ax + bx) / 2, y, z), redraw: 0 }
    o.update = (dt, t) => {
      const c = (t + offset) % C
      const onAt = C - on
      const phase = c >= onAt ? 'on' : c >= onAt - P.warn ? 'warn' : 'off'
      if (phase !== o.phase) {
        if (phase === 'warn') sfx('teslaCharge', (ax + bx) / 2, y, z, 1)
        if (phase === 'on') sfx('zap', (ax + bx) / 2, y, z, 1.2)
      }
      o.phase = phase
      o.redraw -= dt
      if (phase === 'on') {
        if (o.redraw <= 0) {
          A.draw(ax, bx, y, z, true, 0.8 + Math.random() * 0.2)
          o.redraw = 0.045
          if (Math.random() < 0.5) fx('teslaSpark', ax + Math.random() * (bx - ax), b + 0.1, z)
        }
      } else if (phase === 'warn' && Math.random() < 0.25) {
        // Little crackles reaching out from the electrodes.
        A.draw(ax, ax + 1.5 + Math.random() * 2, y, z, true, 0.6)
        if (Math.random() < 0.4) fx('teslaSpark', ax, y, z)
      } else A.hide()
      const glow = phase === 'on' ? 3 + Math.random() * 2 : phase === 'warn' ? 0.6 + (c - (onAt - P.warn)) / P.warn * 2 : 0.4
      orbs[i].emissiveIntensity = Math.max(orbs[i].emissiveIntensity * 0.9, glow)
      orbs[i + 1].emissiveIntensity = Math.max(orbs[i + 1].emissiveIntensity * 0.9, glow)
      o.loop.level = phase === 'on' ? 1 : phase === 'warn' ? 0.35 : 0
    }
    o.test = (pp) => {
      if (pp.x < ax - TRUCK_R * 0.5 || pp.x > bx + TRUCK_R * 0.5 || pp.y - b > P.h + 1.2) return null
      const dz = Math.abs(pp.z - z)
      if (o.phase === 'on' && dz < TRUCK_R + 0.3) return { zap: true, noSteer: P.noSteer, keep: P.keep, vx: (Math.random() - 0.5) * 4, vy: 3, vz: P.knock, x: pp.x, y, z }
      return o.phase !== 'off' && dz < TRUCK_R + NM ? { near: true, x: pp.x } : null
    }
    ctx.obstacles.push(o)
  }
  for (let i = 0; i < P.xs.length - 1; i++) gear(ctx, (P.xs[i] + P.xs[i + 1]) / 2, b + P.h, z, s.k, i === 1)
}

// --- Spike strips -------------------------------------------------------------------------------
// Steel strips across the lane in two halves; spikes spring up from one half
// while the other is down (amber lights blink first). Run over them: a flat tyre.
const dummy = new Object3D()
function spikes(ctx, live, s, b, z) {
  const P = OBSTACLE.spikes
  const C = range(P.cycle, s.k)
  const W = F - 0.6
  P.rows.forEach((dz, ri) => {
    const rz = z + dz
    for (const half of [-1, 1]) {
      const x0 = half < 0 ? -W : 0
      const x1 = half < 0 ? 0 : W
      const w = x1 - x0
      const cx = (x0 + x1) / 2
      box(live, M.iron(), cx, b + 0.03, rz, w - 0.2, 0.06, 1.6, false)
      box(live, M.hazard(), cx, b + 0.065, rz - 0.75, w - 0.2, 0.02, 0.1, false)
      box(live, M.hazard(), cx, b + 0.065, rz + 0.75, w - 0.2, 0.02, 0.1, false)
      const lights = []
      for (let i = 0; i < 4; i++) {
        const lm = beaconMat('#ffb01a')
        mesh(live, G.sphere, lm, x0 + (i + 0.5) * (w / 4), b + 0.1, rz + 0.95, 0.14, 0.1, 0.14, false)
        lights.push(lm)
      }
      const n = Math.floor(w / 1.05) * 2
      const im = new InstancedMesh(coneGeo, M.chrome(), n)
      im.castShadow = true
      im.frustumCulled = false // instances spread far past the cone's own bounds
      const g = new Group()
      g.add(im)
      live.add(g)
      for (let i = 0; i < n; i++) {
        const col = Math.floor(i / 2)
        dummy.position.set(x0 + 0.5 + col * 1.05 + (i % 2) * 0.5, b + 0.28, rz + (i % 2 ? 0.35 : -0.35))
        dummy.scale.set(0.16, 0.56, 0.16)
        dummy.updateMatrix()
        im.setMatrixAt(i, dummy.matrix)
      }
      const offset = (half > 0 ? C / 2 : 0) + ri * C * 0.25 + s.k * 0.19
      const upT = C * 0.42
      const o = { z: rz, near: 0, u: 0, phase: 'down' }
      o.update = (dt, t) => {
        const c = (t + offset) % C
        const upAt = C - upT
        const phase = c >= upAt ? 'up' : c >= upAt - P.warn ? 'warn' : 'down'
        if (phase !== o.phase) {
          if (phase === 'up') {
            sfx('spikes', cx, b + 0.4, rz, 1)
            fx('spikePop', cx, b + 0.2, rz, { w })
          }
          if (phase === 'down' && o.phase === 'up') sfx('hiss', cx, b + 0.3, rz, 0.4)
        }
        o.phase = phase
        const target2 = phase === 'up' ? 1 : 0
        o.u += (target2 - o.u) * Math.min(1, dt * (phase === 'up' ? 30 : 8))
        g.position.y = -0.62 + o.u * 0.62
        for (const lm of lights) lm.emissiveIntensity = phase === 'warn' ? (Math.sin(t * 34) > 0 ? 3 : 0.2) : phase === 'up' ? 1.6 : 0.1
      }
      o.test = (pp) => {
        if (pp.x < x0 - TRUCK_R * 0.5 || pp.x > x1 + TRUCK_R * 0.5 || Math.abs(pp.z - rz) > 0.8 + TRUCK_R * 0.7 || pp.y - b > 0.6) return null
        if (o.u > 0.6) return { flat: P.flat, pull: (Math.random() < 0.5 ? -1 : 1) * P.pull, top: P.top, x: pp.x, y: b + 0.3, z: rz }
        return o.phase === 'warn' ? { near: true, x: pp.x } : null
      }
      ctx.obstacles.push(o)
    }
  })
  for (let i = 0; i < 4; i++) gear(ctx, -18 + i * 12, b + 1.4, z, s.k, i === 1)
}

export const WEAPON_BUILD = { laser, turret, mines, missiles, flames, tesla, spikes }
export const WEAPON_FOOT = { laser: 20, turret: 18, mines: OBSTACLE.mines.len + 2, missiles: 34, flames: 18, tesla: 8, spikes: 14 }
export const WEAPON_INTRO = {
  laser: ['LASER FENCE', 'Low beam: HOP. High beam: stay down!'],
  turret: ['TURRETS', 'Red line = locked on. Keep moving!'],
  mines: ['MINES', 'Blinking = armed. Drive fast past them!'],
  missiles: ['MISSILES', 'Red circle = incoming. Change speed!'],
  flames: ['FLAMETHROWERS', 'Fire slows you down'],
  tesla: ['TESLA COILS', 'Zapped = no steering!'],
  spikes: ['SPIKE STRIPS', 'Flat tyre pulls you sideways'],
}
