import { Group, IcosahedronGeometry, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three'
import { OBSTACLE, STAGES } from '../config.js'
import { neon, sign } from '../propkit.js'
import { mulberry32 } from '../textures.js'
import { G, block, box, mesh, rod, solid } from './kit.js'
import {
  F, M, TRUCK_H, TRUCK_R, beaconMat, createBolts, explode, floorPlane, fx, gear, lethalAt, loopOf, makeBeam, nearby, range, sfx, smooth, target,
} from './hazardKit.js'

// Things that come after you: ramming trucks crossing the lane, a magnet crane
// that grabs and flings, a boulder that rolls after you, the chasing wrecker,
// and the two bosses (a turret tower and a stomping robot).

const NM = OBSTACLE.nearMiss
const wheel = (parent, x, y, z, r = 0.75, w = 0.55) => {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  const t = mesh(g, G.cyl, M.rubber(), 0, 0, 0, r, w, r)
  t.rotation.z = Math.PI / 2
  const h = mesh(g, G.cyl8, M.chrome(), 0, 0, 0, r * 0.5, w + 0.04, r * 0.5)
  h.rotation.z = Math.PI / 2
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const lug = box(g, M.iron(), 0, Math.sin(a) * r * 0.32, Math.cos(a) * r * 0.32, w + 0.08, 0.1, 0.1, false)
    lug.rotation.x = -a
  }
  return g
}

// --- A heavy truck model (rammers, the chaser): faces +Z; returns its wheels and lights.
function heavyTruck(parent, { cab = '#d8202a', box: cargo = '#f2f4f8', wrecker = false } = {}) {
  const g = new Group()
  parent.add(g)
  const cabM = new MeshStandardMaterial({ color: cab, roughness: 0.35, metalness: 0.3 })
  // Chassis rails and bumper.
  box(g, M.black(), 0, 0.9, 0, 2.4, 0.5, 8.4)
  box(g, M.hazard(), 0, 1.1, 4.35, 2.9, 0.7, 0.4)
  for (let i = 0; i < 5; i++) mesh(g, G.cone, M.chrome(), -1.1 + i * 0.55, 1.1, 4.75, 0.14, 0.5, 0.14).rotation.x = Math.PI / 2
  // Cab.
  box(g, cabM, 0, 2.3, 2.7, 2.7, 2.4, 2.6)
  box(g, M.glass(), 0, 2.85, 4.0, 2.4, 1.0, 0.05, false)
  box(g, M.chrome(), 0, 1.6, 4.02, 2.0, 0.8, 0.06, false) // grille
  for (let i = 0; i < 5; i++) box(g, M.black(), 0, 1.3 + i * 0.15, 4.06, 1.9, 0.05, 0.02, false)
  const lights = []
  for (const e of [-1, 1]) {
    const hl = neon('#fff6c8', 3)
    mesh(g, G.cyl8, hl, e * 1.05, 1.7, 4.03, 0.22, 0.06, 0.22, false).rotation.x = Math.PI / 2
    box(g, M.black(), e * 1.38, 2.7, 2.2, 0.12, 0.5, 0.35, false) // mirror
    rod(g, M.chrome(), [e * 1.0, 3.5, 1.6], [e * 1.0, 5.0, 1.6], 0.12) // exhaust stacks
  }
  // Light bar on the roof.
  box(g, M.black(), 0, 3.6, 2.5, 2.2, 0.18, 0.5)
  const red = beaconMat('#ff2a2a')
  const blue = beaconMat('#2a7aff')
  box(g, red, -0.55, 3.8, 2.5, 0.9, 0.25, 0.4, false)
  box(g, blue, 0.55, 3.8, 2.5, 0.9, 0.25, 0.4, false)
  lights.push(red, blue)
  if (wrecker) {
    // Angry eyes on the windscreen, a crane boom and a swinging hook.
    for (const e of [-1, 1]) {
      const eye = box(g, neon('#ffd21a', 5), e * 0.6, 3.0, 4.04, 0.7, 0.16, 0.04, false)
      eye.rotation.z = e * 0.3
    }
    box(g, M.dark(), 0, 1.7, -1.6, 2.6, 1.2, 4.6)
    box(g, M.hazard(), 0, 2.35, -1.6, 2.65, 0.2, 4.65)
    const boom = rod(g, M.hazard(), [0, 2.4, -0.5], [0, 5.6, -4.6], 0.32, G.cyl)
    boom.castShadow = true
    rod(g, M.iron(), [0, 5.6, -4.6], [0, 3.4, -5.0], 0.05)
    const hook = mesh(g, new TorusGeometry(0.35, 0.09, 6, 14, Math.PI * 1.4), M.chrome(), 0, 3.2, -5.0)
    hook.rotation.y = Math.PI / 2
    g.userData.hook = hook
  } else {
    // Cargo box with stripes.
    box(g, new MeshStandardMaterial({ color: cargo, roughness: 0.6 }), 0, 2.7, -1.5, 2.8, 3.0, 5.2)
    box(g, M.red(), 0, 2.0, -1.5, 2.85, 0.35, 5.25)
  }
  const wheels = []
  for (const wz of [2.9, -1.4, -3.0]) for (const e of [-1, 1]) wheels.push(wheel(g, e * 1.35, 0.8, wz, 0.8, 0.6))
  return { g, wheels, lights }
}

// --- Ramming trucks ---------------------------------------------------------------------------
// Two crossing lanes with garage portals at both edges: a light flashes and a
// horn blares, then a truck roars across. A hit throws you off the island.
function rammers(ctx, live, s, b, z) {
  const P = OBSTACLE.rammers
  const speed = range(P.speed, s.k)
  const C = range(P.cycle, s.k)
  const knock = range(P.knock, s.k)
  const X = STAGES.half + 6
  const run = (2 * X) / speed
  P.lanes.forEach((dz, li) => {
    const lz = z + dz
    const dir = li % 2 ? -1 : 1 // +1 drives toward +X
    // Lane paint across the island.
    floorPlane(live, M.hazardFloor(), 0, s.y + 0.03, lz, STAGES.half * 2 - 2, 0.5)
    floorPlane(live, M.hazardFloor(), 0, s.y + 0.03, lz + (dir > 0 ? -3.4 : 3.4), STAGES.half * 2 - 2, 0.5)
    // Garage portals at both ends (past the island edge, floating like the islands).
    const signals = []
    for (const e of [-1, 1]) {
      const px = e * (STAGES.half + 2.5)
      block(ctx.statics, M.dark(), px, b - 2, lz - 4.4, 1.2, 8, 1.2)
      block(ctx.statics, M.dark(), px, b - 2, lz + 4.4, 1.2, 8, 1.2)
      box(ctx.statics, M.hazard(), px, b + 6.4, lz, 1.4, 1.2, 10)
      box(ctx.statics, M.black(), px + e * 1.8, b + 2.6, lz, 0.3, 7.4, 8.4, false)
      block(ctx.statics, M.iron(), px, b - 2, lz, 4, 2, 10) // apron under the portal
      const lm = beaconMat(e === -dir ? '#ff2a1a' : '#ffb01a')
      mesh(live, G.sphere, lm, px, b + 7.4, lz + 3.8, 0.4, 0.4, 0.4, false)
      signals.push(lm)
    }
    const t = heavyTruck(live, { cab: li ? '#1f6fd0' : '#d8202a' })
    t.g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
    t.g.visible = false
    const offset = (li * C) / 2 + s.k * 0.6
    const o = { z: lz, near: 0, phase: 'idle', tx: -dir * X, reach: 6, loop: loopOf('engine', 0, b + 1.5, lz) }
    o.update = (dt, tt) => {
      const c = (tt + offset) % C
      const goAt = C - run
      const phase = c >= goAt ? 'drive' : c >= goAt - P.warn ? 'warn' : 'idle'
      if (phase !== o.phase) {
        if (phase === 'warn') sfx('horn', -dir * X, b + 2, lz, 1.2)
        if (phase === 'drive') sfx('rev', -dir * X, b + 2, lz, 1.2)
      }
      o.phase = phase
      for (const lm of signals) lm.emissiveIntensity = phase === 'warn' ? (Math.sin(tt * 30) > 0 ? 3.5 : 0.2) : phase === 'drive' ? 2 : 0.2
      t.g.visible = phase === 'drive'
      if (phase === 'drive') {
        o.tx = -dir * X + dir * speed * (c - goAt)
        t.g.position.set(o.tx, b, lz)
        for (const w of t.wheels) w.rotation.x += (speed / 0.8) * dt
        t.lights[0].emissiveIntensity = Math.sin(tt * 20) > 0 ? 3 : 0.2
        t.lights[1].emissiveIntensity = Math.sin(tt * 20) > 0 ? 0.2 : 3
        if (Math.random() < dt * 20) fx('exhaust', o.tx - dir * 3, b + 4.8, lz)
        if (Math.abs(o.tx) < STAGES.half && Math.random() < dt * 30) fx('tyreDust', o.tx - dir * 3, b + 0.3, lz)
      } else o.tx = -dir * X
      o.loop.x = o.tx
      o.loop.level = phase === 'drive' ? 1 : 0
      o.loop.pitch = 0.9 + speed / 40
    }
    o.test = (pp) => {
      if (o.phase !== 'drive' || pp.y - b > 4) return null
      const dx = Math.abs(pp.x - o.tx) - 4.4
      const dzz = Math.abs(pp.z - lz) - 1.5
      if (dx < TRUCK_R * 0.8 && dzz < TRUCK_R * 0.8) return { hit: true, rammer: true, vx: dir * knock, vy: 8, vz: Math.sign(pp.z - lz || 1) * 4, x: pp.x, y: b + 1.5, z: lz, power: 1.5, color: li ? '#1f6fd0' : '#d8202a' }
      return dx < TRUCK_R + NM && dzz < TRUCK_R + NM ? { near: true, x: o.tx } : null
    }
    ctx.obstacles.push(o)
  })
  gear(ctx, 0, b + 1.4, z, s.k, 'mega')
  for (const e of [-1, 1]) gear(ctx, e * 12, b + 1.4, z, s.k, true)
}

// --- Magnet crane -------------------------------------------------------------------------------
// A gantry rolling along the lane with a trolley and an electromagnet that
// follows the truck. Stay under it and it charges (the ring on the floor
// fills), then it grabs the truck, lifts it and flings it off the side.
function crane(ctx, live, s, b, z) {
  const P = OBSTACLE.crane
  const speed = range(P.speed, s.k)
  const charge = range(P.charge, s.k)
  const H = 15
  const W = STAGES.half - 0.8
  // Rails along both edges.
  for (const e of [-1, 1]) {
    block(ctx.statics, M.iron(), e * W, b, z, 0.8, 0.5, P.zone + 10)
    block(ctx.statics, M.hazard(), e * W, b + 0.5, z, 0.85, 0.1, P.zone + 10)
  }
  const bridge = new Group()
  bridge.position.set(0, b, z)
  live.add(bridge)
  for (const e of [-1, 1]) {
    // A-frame legs on wheels.
    rod(bridge, M.hazard(), [e * W, 0.8, -2.2], [e * W, H, 0], 0.4, G.cyl)
    rod(bridge, M.hazard(), [e * W, 0.8, 2.2], [e * W, H, 0], 0.4, G.cyl)
    rod(bridge, M.iron(), [e * W, 4, -1.7], [e * W, 4, 1.7], 0.15)
    box(bridge, M.dark(), e * W, 0.8, 0, 1.2, 0.8, 5)
    for (const wz of [-1.8, 1.8]) mesh(bridge, G.cyl8, M.black(), e * W, 0.5, wz, 0.45, 1.3, 0.45).rotation.z = Math.PI / 2
  }
  box(bridge, M.hazard(), 0, H + 0.6, 0, W * 2 + 1.5, 1.4, 1.6)
  box(bridge, M.iron(), 0, H - 0.2, 0, W * 2, 0.25, 1.0)
  const cabMat = new MeshStandardMaterial({ color: '#ffd21a', roughness: 0.4 })
  box(bridge, cabMat, -W + 3, H - 1.4, 1.5, 2.4, 2, 2)
  box(bridge, M.glass(), -W + 3, H - 1.2, 2.52, 2, 1.2, 0.05, false)
  const warn = beaconMat('#ff2a1a')
  mesh(bridge, G.sphere, warn, 0, H + 1.5, 0, 0.4, 0.4, 0.4, false)
  const trolley = new Group()
  trolley.position.set(0, H - 0.4, 0)
  bridge.add(trolley)
  box(trolley, M.dark(), 0, 0, 0, 2.4, 1.0, 2.0)
  for (const e of [-0.6, 0.6]) mesh(trolley, G.cyl8, M.chrome(), e, -0.5, 0, 0.3, 1.8, 0.3).rotation.x = Math.PI / 2 // cable drums
  const cables = [-0.6, 0.6].map((e) => mesh(trolley, G.cyl8, M.iron(), e, 0, 0, 0.05, 1, 0.05))
  const magnet = new Group()
  trolley.add(magnet)
  mesh(magnet, G.cyl, M.dark(), 0, 0, 0, 2.2, 0.8, 2.2)
  const coil = mesh(magnet, new TorusGeometry(1.7, 0.28, 8, 24), M.copper(), 0, 0.05, 0)
  coil.rotation.x = Math.PI / 2
  const padMat = new MeshStandardMaterial({ color: '#2a3a5a', emissive: '#4ab8ff', emissiveIntensity: 0.2, roughness: 0.3 })
  mesh(magnet, G.cyl, padMat, 0, -0.45, 0, 2.0, 0.1, 2.0, false)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    box(magnet, M.hazard(), Math.cos(a) * 2.15, 0.1, Math.sin(a) * 2.15, 0.25, 0.6, 0.25, false)
  }
  const ringMat = new MeshBasicMaterial({ color: '#4ab8ff', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 })
  const ring = mesh(live, new TorusGeometry(3.2, 0.18, 6, 40), ringMat, 0, b + 0.08, z, 1, 1, 1, false)
  ring.rotation.x = Math.PI / 2
  const fillMat = new MeshBasicMaterial({ color: '#4ab8ff', transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 })
  const fill = mesh(live, G.cyl, fillMat, 0, b + 0.06, z, 3.2, 0.02, 3.2, false)
  const o = { z, near: 0, mx: 0, mz: z, charge: 0, drop: 0, cool: 0, grab: false, reach: P.zone, loop: loopOf('magnet', 0, b + 8, z) }
  let magY = 7
  o.update = (dt, t) => {
    const active = nearby(b, z, P.zone / 2 + 10)
    const tx = active ? Math.max(-W + 3, Math.min(W - 3, target.p.x)) : 0
    const tz = active ? Math.max(z - P.zone / 2, Math.min(z + P.zone / 2, target.p.z)) : z
    const step = speed * dt
    o.mz += Math.max(-step, Math.min(step, tz - o.mz))
    o.mx += Math.max(-step * 1.3, Math.min(step * 1.3, tx - o.mx))
    bridge.position.z = o.mz
    trolley.position.x = o.mx
    o.cool = Math.max(0, o.cool - dt)
    o.grab = false
    const d = Math.hypot(target.p.x - o.mx, target.p.z - o.mz)
    const under = active && d < 3.2 && target.p.y - b < 3 && o.cool === 0
    o.charge = under ? o.charge + dt / charge : Math.max(0, o.charge - dt * 1.5)
    if (o.charge >= 1) {
      o.charge = 0
      o.cool = 3
      o.grab = true
      o.drop = 1
      sfx('magnet', o.mx, b + 3, o.mz, 1.4)
      fx('magnetZap', o.mx, b + 1.5, o.mz)
    }
    // The magnet dips to grab, then rises.
    o.drop = Math.max(0, o.drop - dt * 1.4)
    const wantY = 7 - o.charge * 3.5 - o.drop * 2.5
    magY += (wantY - magY) * Math.min(1, dt * 6)
    magnet.position.y = magY - (H - 0.4) // relative to the trolley
    for (const c of cables) {
      const len = H - 0.4 - magY
      c.scale.y = len
      c.position.y = -len / 2
    }
    padMat.emissiveIntensity = 0.2 + o.charge * 3 + (o.drop > 0.5 ? 2 : 0)
    ring.position.set(o.mx, b + 0.08, o.mz)
    fill.position.set(o.mx, b + 0.06, o.mz)
    fill.scale.set(3.2 * o.charge + 0.01, 0.02, 3.2 * o.charge + 0.01)
    ringMat.opacity = active ? 0.35 + 0.4 * o.charge + (o.charge > 0 ? 0.2 * Math.sin(t * 30) : 0) : 0.1
    warn.emissiveIntensity = o.charge > 0.05 ? (Math.sin(t * (10 + o.charge * 30)) > 0 ? 3 : 0.2) : 0.4
    if (o.charge > 0.3 && Math.random() < dt * 25 * o.charge) fx('magnetZap', o.mx + (Math.random() - 0.5) * 3, b + magY - 0.5, o.mz + (Math.random() - 0.5) * 3)
    o.loop.x = o.mx
    o.loop.z = o.mz
    o.loop.level = active ? 0.3 + o.charge * 0.8 : 0
    o.loop.pitch = 0.7 + o.charge * 1.2
  }
  o.test = (pp) => {
    if (o.grab && Math.hypot(pp.x - o.mx, pp.z - o.mz) < 4.2) {
      const out = Math.sign(pp.x) || 1
      return { grab: true, vx: out * P.fling, vy: P.lift, vz: 0, x: pp.x, y: pp.y + 2, z: pp.z }
    }
    return o.charge > 0.6 && Math.hypot(pp.x - o.mx, pp.z - o.mz) > 3.2 && Math.hypot(pp.x - o.mx, pp.z - o.mz) < 3.2 + NM * 2 ? { near: true, x: o.mx } : null
  }
  ctx.obstacles.push(o)
  for (let i = 0; i < 5; i++) gear(ctx, (i - 2) * 8, b + 1.4, z + (i % 2 ? 5 : -5), s.k, i === 2)
}

// --- The boulder ------------------------------------------------------------------------------------
// A rock waiting on a wooden cradle at the start of the stretch. Drive past the
// trigger and it drops in behind you and rolls after you, steering toward you,
// until it smashes on the barrier at the end. If it catches you, you're flat.
function rockGeo(seed, r) {
  const g = new IcosahedronGeometry(r, 2)
  const p = g.attributes.position
  const rand = mulberry32(seed)
  const offs = new Map()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    if (!offs.has(key)) offs.set(key, 0.82 + rand() * 0.3)
    const k = offs.get(key)
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}
function boulder(ctx, live, s, b, z, foot = 64) {
  const P = OBSTACLE.boulder
  const vmax = range(P.speed, s.k)
  const z0 = z + foot / 2 - 2
  const z1 = z - foot / 2 + 4
  const lethal = lethalAt(s.k)
  // The cradle: a wooden ramp down from a high shelf.
  const sx = s.k % 2 ? 14 : -14
  block(ctx.statics, M.wood(), sx, b, z0 + 4, 9, 7, 6)
  box(ctx.statics, M.hazard(), sx, b + 7.1, z0 + 4, 9.1, 0.3, 6.1)
  for (const e of [-1, 1]) rod(ctx.statics, M.log(), [sx + e * 4, b + 7, z0 + 1], [sx + e * 4, b + 9, z0 + 1], 0.3)
  solid(sx, 0, z0 + 4, 9, 7, 6)
  // The barrier at the end: crates and a jersey wall it smashes into.
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue
    block(live, M.wood(), i * 7.4, b, z1 - 3, 2.6, 2.2, 2.6)
    box(live, M.hazard(), i * 7.4, b + 1.1, z1 - 1.68, 2.62, 0.4, 0.05, false)
  }
  const rock = new Group()
  live.add(rock)
  const rm = mesh(rock, rockGeo(s.k * 17, P.r), M.rock(), 0, 0, 0)
  rm.castShadow = true
  // Moss and cracks for detail.
  mesh(rock, rockGeo(s.k * 17 + 1, P.r * 0.55), new MeshStandardMaterial({ color: '#4a6a32', roughness: 1 }), P.r * 0.55, P.r * 0.55, 0.1, 1, 0.5, 1)
  const trig = floorPlane(live, M.hazardFloor(), 0, b + 0.04, z0 - 8, (F - 1) * 2, 1)
  trig.visible = true
  const o = { z, near: 0, state: 'wait', x: sx, y: b + 7 + P.r, rz: z0 + 4, v: 0, t: 0, reach: foot / 2, loop: loopOf('rumble', sx, b + 2, z0) }
  o.update = (dt) => {
    o.t += dt
    const pp = target.p
    if (o.state === 'wait') {
      o.x = sx
      o.y = b + 7 + P.r
      o.rz = z0 + 4
      rock.rotation.y += dt * 0.2
      if (pp.z < z0 - 8 && pp.z > z1 && Math.abs(pp.y - b) < 3) {
        o.state = 'drop'
        o.t = 0
        o.v = 0
        sfx('crumble', sx, b + 7, z0 + 4, 1.2)
        fx('callout', pp.x, pp.y, pp.z, { text: 'BOULDER!', color: '#c9a66b' })
      }
    } else if (o.state === 'drop') {
      // Roll off the shelf onto the lane.
      const u = Math.min(1, o.t / 0.7)
      o.x = sx * (1 - u * 0.6)
      o.rz = z0 + 4 - u * 4
      o.y = b + P.r + (7 * (1 - u * u))
      if (u >= 1) {
        o.state = 'roll'
        o.t = 0
        o.v = 6
        sfx('slam', o.x, b, o.rz, 1.3)
        fx('quake', o.x, b, o.rz, { k: 0.6, r: 40 })
        fx('boulderDust', o.x, b, o.rz, { n: 30 })
      }
    } else if (o.state === 'roll') {
      o.v = Math.min(vmax, o.v + P.accel * dt)
      o.rz -= o.v * dt
      o.x += Math.max(-P.steer * dt * 4, Math.min(P.steer * dt * 4, (Math.max(-F + P.r, Math.min(F - P.r, pp.x)) - o.x) * dt * P.steer))
      o.y = b + P.r
      rock.rotation.x -= (o.v / P.r) * dt
      if (Math.random() < dt * 30) fx('boulderDust', o.x, b + 0.2, o.rz + P.r * 0.6, { n: 2 })
      if (o.rz < z1) {
        o.state = 'smash'
        o.t = 0
        explode(o.x, b + P.r, o.rz, 1.2)
        fx('rockBurst', o.x, b + P.r, o.rz, { r: P.r })
        sfx('crumble', o.x, b + 1, o.rz, 1.5)
      }
    } else if (o.state === 'smash') {
      if (o.t > 5 && (pp.z > z0 || pp.z < z1 - 20 || Math.abs(pp.y - b) > 4)) {
        o.state = 'wait'
        o.t = 0
      }
    }
    rock.visible = o.state !== 'smash'
    rock.position.set(o.x, o.y, o.rz)
    o.loop.x = o.x
    o.loop.z = o.rz
    o.loop.level = o.state === 'roll' ? 0.6 + (o.v / vmax) * 0.6 : 0
    o.loop.pitch = 0.6 + (o.v / vmax) * 0.6
    if (o.state === 'roll' && Math.abs(pp.z - o.rz) < 30) fx('quake', o.x, b, o.rz, { k: 0.08 * (o.v / vmax), r: 30 })
  }
  o.test = (pp) => {
    if (o.state !== 'roll' && o.state !== 'drop') return null
    const d = Math.hypot(pp.x - o.x, pp.y + TRUCK_H / 2 - o.y, pp.z - o.rz)
    if (d < P.r + TRUCK_R * 0.8) {
      if (lethal) return { kill: 'crush', why: 'FLATTENED!', x: pp.x, y: b + 0.5, z: pp.z }
      return { hit: true, vx: Math.sign(pp.x - o.x || 1) * 8, vy: 10, vz: -o.v - 6, x: o.x, y: o.y, z: o.rz, power: 1.5, color: '#7a6e62' }
    }
    return d < P.r + TRUCK_R + NM ? { near: true, x: o.x } : null
  }
  ctx.obstacles.push(o)
  for (let i = 0; i < 6; i++) gear(ctx, (i % 3 - 1) * 10, b + 1.4, z0 - 14 - i * 7, s.k, i === 5 ? 'mega' : false)
}

// --- The chaser (a stage modifier: STAGE_MODS) ----------------------------------------------------
// A wrecker drops in behind you once you land and hunts you down the lane,
// lights flashing and siren wailing, smashing straight through the hazards.
// It stops at the ramp foot. If it catches you, you're wrecked.
export function buildChaser(ctx, live, s, need) {
  const P = OBSTACLE.chaser
  const vmax = need * range(P.speed, s.k)
  const b = s.y
  const t = heavyTruck(live, { cab: '#1b1c22', wrecker: true })
  t.g.visible = false
  const hook = t.g.userData.hook
  const o = { z: s.zs, near: 0, state: 'off', x: 0, cz: s.zs, v: 0, t: 0, yaw: Math.PI, off: 0, reach: 1e5, loop: loopOf('siren', 0, b + 3, s.zs), loop2: null }
  o.update = (dt, tt) => {
    const pp = target.p
    const onIsland = pp.z < s.zs + 1 && pp.z > s.zt && Math.abs(pp.y - b) < 3 && !target.frozen
    o.off = onIsland ? 0 : o.off + dt
    o.t += dt
    if (o.state === 'off') {
      if (onIsland && target.grounded) {
        o.state = 'wait'
        o.t = 0
      }
    } else if (o.off > 0.6) {
      o.state = 'off'
    } else if (o.state === 'wait' && o.t > P.delay) {
      o.state = 'drop'
      o.t = 0
      o.x = Math.max(-F + 3, Math.min(F - 3, pp.x))
      o.cz = Math.min(s.zs - 3, pp.z + 34)
      o.yaw = Math.PI
      o.v = 0
      sfx('horn', o.x, b + 2, o.cz, 1.5)
      fx('callout', pp.x, pp.y, pp.z, { text: 'WRECKER INCOMING!', color: '#ff4a3a' })
    } else if (o.state === 'drop') {
      if (o.t > 0.45) {
        o.state = 'chase'
        o.t = 0
        sfx('slam', o.x, b, o.cz, 1.2)
        fx('boulderDust', o.x, b, o.cz, { n: 26 })
        fx('quake', o.x, b, o.cz, { k: 0.4, r: 40 })
      }
    } else if (o.state === 'chase') {
      // Steer at where the truck is heading; the throttle never lets up.
      const ax = pp.x + target.v.x * 0.4 - o.x
      const az = pp.z + target.v.z * 0.4 - o.cz
      const want = Math.atan2(ax, az)
      let d = want - o.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      o.yaw += Math.max(-1.8 * dt, Math.min(1.8 * dt, d))
      o.v = Math.min(vmax, o.v + P.accel * dt)
      o.x = Math.max(-F + 2, Math.min(F - 2, o.x + Math.sin(o.yaw) * o.v * dt))
      o.cz += Math.cos(o.yaw) * o.v * dt
      if (o.cz < s.zr + 6) {
        // The ramp foot: it skids to a stop and honks.
        o.state = 'stop'
        o.t = 0
        sfx('horn', o.x, b + 2, o.cz, 1.2)
        sfx('squeal', o.x, b + 1, o.cz, 1)
      }
      if (Math.random() < dt * 14) fx('exhaust', o.x + Math.sin(o.yaw) * -1.6 + 1, b + 5, o.cz - Math.cos(o.yaw) * 1.6)
      if (Math.random() < dt * 30) fx('tyreDust', o.x - Math.sin(o.yaw) * 3, b + 0.3, o.cz - Math.cos(o.yaw) * 3)
    } else if (o.state === 'stop') {
      o.v = Math.max(0, o.v - 40 * dt)
      o.cz += Math.cos(o.yaw) * o.v * dt
      o.x += Math.sin(o.yaw) * o.v * dt
    }
    const show = o.state === 'drop' || o.state === 'chase' || o.state === 'stop'
    t.g.visible = show
    if (show) {
      const dropY = o.state === 'drop' ? 14 * (1 - Math.min(1, o.t / 0.45)) ** 2 : 0
      t.g.position.set(o.x, b + dropY, o.cz)
      t.g.rotation.y = o.yaw
      for (const w of t.wheels) w.rotation.x += (o.v / 0.8) * dt
      t.lights[0].emissiveIntensity = Math.sin(tt * 18) > 0 ? 4 : 0.2
      t.lights[1].emissiveIntensity = Math.sin(tt * 18) > 0 ? 0.2 : 4
      if (hook) hook.rotation.x = Math.sin(tt * 5) * 0.4
    }
    o.z = show ? o.cz : s.zs
    o.loop.x = o.x
    o.loop.z = o.cz
    o.loop.level = o.state === 'chase' ? 1 : o.state === 'stop' ? 0.5 : 0
    o.loop.pitch = 1 + 0.25 * Math.sin(tt * 4.5)
  }
  o.test = (pp) => {
    if (o.state !== 'chase') return null
    // Distance from the truck to the wrecker's body (a box 3 x 9 m).
    const c = Math.cos(o.yaw)
    const sn = Math.sin(o.yaw)
    const dx = pp.x - o.x
    const dz = pp.z - o.cz
    const along = dx * sn + dz * c
    const across = dx * c - dz * sn
    const ox = Math.abs(across) - 1.5
    const oz = Math.abs(along) - 4.4
    if (ox < TRUCK_R * 0.6 && oz < TRUCK_R * 0.6 && Math.abs(pp.y - b) < 3.5) return { kill: 'caught', why: 'CAUGHT!', x: pp.x, y: b + 1, z: pp.z }
    return ox < TRUCK_R + 3 && oz < TRUCK_R + 3 ? { near: true, x: o.x } : null
  }
  ctx.obstacles.push(o)
  const l = sign([
    { text: 'WRECKER ZONE', size: 64, font: 'lucky', fill: ['#ff8a8a', '#ff2a3a'], outline: '#2a0000' },
    { text: "Don't stop. Don't look back.", size: 32, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 },
  ], 3)
  l.position.set(-14, b + 6, s.zs - 14)
  live.add(l)
}

// --- Boss: the turret tower (stage 10) ----------------------------------------------------------------
// A fortress in the middle of the lane: drive round it. Its head turns to
// follow you and fires bursts of plasma; a low laser sweeps round its base.
function bossTower(ctx, live, s, b, z) {
  const P = OBSTACLE.bossTower
  const C = range(P.cycle, s.k)
  // Base and shaft (solid).
  block(ctx.statics, M.dark(), 0, b, z, 11, 3, 11)
  block(ctx.statics, M.hazard(), 0, b + 3, z, 11.2, 0.6, 11.2)
  mesh(ctx.statics, G.cyl8, M.iron(), 0, b + 8.6, z, 3.6, 11, 3.6)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    rod(ctx.statics, M.red(), [Math.cos(a) * 5.2, b + 3.6, z + Math.sin(a) * 5.2], [Math.cos(a) * 3.4, b + 13, z + Math.sin(a) * 3.4], 0.35)
  }
  solid(0, 0, z, 11, 3.6, 11)
  solid(0, 3.6, z, 7.4, 10, 7.4)
  // Emitter ring for the base laser.
  const ring = mesh(live, new TorusGeometry(5.9, 0.3, 8, 40), neon('#ff2a2a', 3), 0, b + 0.9, z)
  ring.rotation.x = Math.PI / 2
  // Head.
  const head = new Group()
  head.position.set(0, b + 15, z)
  live.add(head)
  mesh(head, G.cyl8, M.red(), 0, 0, 0, 5, 2.6, 5)
  mesh(head, G.cyl8, M.black(), 0, 1.6, 0, 4.2, 0.8, 4.2)
  mesh(head, G.cyl8, M.hazard(), 0, -1.4, 0, 5.1, 0.3, 5.1)
  const eye = box(head, neon('#ff2a2a', 6), 0, 0.3, 4.6, 4, 0.5, 0.4, false)
  const barrels = []
  for (const e of [-1.4, 1.4]) {
    const br = mesh(head, G.cyl, M.iron(), e, -0.2, 5.6, 0.45, 3.5, 0.45)
    br.rotation.x = Math.PI / 2
    mesh(head, G.cyl8, M.black(), e, -0.2, 7.4, 0.6, 0.6, 0.6).rotation.x = Math.PI / 2
    barrels.push(e)
  }
  const dish = new Group()
  dish.position.set(0, 2.6, -1.5)
  head.add(dish)
  rod(dish, M.chrome(), [0, -0.6, 0], [0, 0.4, 0], 0.1)
  mesh(dish, G.sphere, M.white(), 0, 0.6, 0, 1.2, 0.3, 1.2).rotation.x = 1
  const lamps = [0, 1, 2, 3].map((i) => {
    const m = beaconMat('#ff2a1a')
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    mesh(head, G.sphere, m, Math.cos(a) * 4.6, 1.4, Math.sin(a) * 4.6, 0.35, 0.35, 0.35, false)
    return m
  })
  const sight = makeBeam(live, '#ff2030', 0.03, 0.1)
  sight.show(false)
  const bolts = createBolts(live, '#ff5a2a', 6, 0.6)
  const sweep = makeBeam(live, '#ff2a2a', 0.07, 0.35)
  const o = { z, near: 0, yaw: 0, phase: 'idle', shots: 0, shotT: 0, reach: 40, sa: 0, loop: loopOf('servo', 0, b + 15, z) }
  const mz = { x: 0, y: 0, z: 0 }
  o.update = (dt, t) => {
    const active = nearby(b, z, 70)
    // Head follows the truck.
    const tp = target.p
    const want = active ? Math.atan2(tp.x, tp.z - z) : 0
    let d = want - o.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    o.yaw += Math.max(-1.7 * dt, Math.min(1.7 * dt, d))
    head.rotation.y = o.yaw
    dish.rotation.y += dt * 4
    o.loop.level = active ? Math.min(1, Math.abs(d) + 0.2) : 0
    const c = (t + s.k) % C
    const aimFrom = C - 0.9
    const phase = !active ? 'idle' : c >= aimFrom ? 'aim' : 'track'
    mz.x = Math.sin(o.yaw) * 7.6
    mz.y = b + 14.8
    mz.z = z + Math.cos(o.yaw) * 7.6
    const ax = tp.x + target.v.x * 0.45
    const ay = tp.y + 1.2
    const az = tp.z + target.v.z * 0.45
    if (phase === 'aim') {
      const u = (c - aimFrom) / 0.9
      sight.set(mz.x, mz.y, mz.z, ax, ay, az)
      sight.show(Math.random() < 0.7, 0.4 + u * 0.6)
      for (const m of lamps) m.emissiveIntensity = Math.sin(t * 36) > 0 ? 3.5 : 0.2
      if (o.phase !== 'aim') sfx('siren1', 0, b + 15, z, 1.2)
      if (Math.random() < dt * 20) fx('charge', mz.x, mz.y, mz.z, { color: '#ff5a2a' })
    } else {
      sight.show(false)
      for (const m of lamps) m.emissiveIntensity = active ? 1 : 0.2
    }
    if (o.phase === 'aim' && phase !== 'aim' && active) {
      o.shots = P.burst
      o.shotT = 0
    }
    if (o.shots > 0) {
      o.shotT -= dt
      if (o.shotT <= 0) {
        o.shots--
        o.shotT = P.gap
        const dx = ax - mz.x
        const dy = ay - mz.y
        const dz = az - mz.z
        const len = Math.hypot(dx, dy, dz) || 1
        bolts.fire(mz.x, mz.y, mz.z, (dx / len) * P.speed, (dy / len) * P.speed, (dz / len) * P.speed, 3)
        sfx('plasma', mz.x, mz.y, mz.z, 1.5)
        fx('muzzle', mz.x, mz.y, mz.z, { dx: dx / len, dy: dy / len, dz: dz / len, color: '#ff5a2a' })
      }
    }
    o.phase = phase
    eye.scale.x = 1 + (phase === 'aim' ? Math.random() * 0.3 : 0)
    bolts.update(dt, b)
    // The base laser: a beam from the ring out to sweepR, turning.
    o.sa += dt * P.sweep
    const sx = Math.sin(o.sa)
    const sz = Math.cos(o.sa)
    sweep.set(sx * 6, b + 0.9, z + sz * 6, sx * P.sweepR, b + 0.9, z + sz * P.sweepR)
    sweep.show(active, 1, 0.4)
    if (active && Math.random() < dt * 12) fx('laserSpark', sx * P.sweepR, b + 0.9, z + sz * P.sweepR)
  }
  o.test = (pp) => {
    const r = bolts.test(pp)
    if (r && !r.near) return r
    // The sweeping beam at bumper height: hop it.
    const dx = pp.x
    const dz = pp.z - z
    const dist = Math.hypot(dx, dz)
    if (dist > 6 && dist < P.sweepR + TRUCK_R && pp.y - b < 0.9) {
      const ang = Math.atan2(dx, dz)
      let da = ang - o.sa
      da = Math.atan2(Math.sin(da), Math.cos(da))
      const off = Math.abs(da) * dist
      if (off < TRUCK_R * 0.8) return { hit: true, laser: true, vx: Math.cos(o.sa) * 12, vy: 6, vz: -Math.sin(o.sa) * 12, x: pp.x, y: b + 0.9, z: pp.z, power: 1, color: '#ff2a2a' }
      if (off < TRUCK_R + NM) return { near: true, x: pp.x }
    }
    return r
  }
  ctx.obstacles.push(o)
  for (const e of [-1, 1]) for (let i = 0; i < 4; i++) gear(ctx, e * 14, b + 1.4, z + 12 - i * 8, s.k, i === 3 ? 'mega' : false)
}

// --- Boss: the giant robot (stage 20) -------------------------------------------------------------------
// It straddles the lane. One foot at a time it lifts, hovers over where you
// are going (a red reticle and a shadow on the floor), then stomps: under it =
// wrecked, near it = blown away. Its eye laser sweeps a burning spot across
// the floor too.
function bossRobot(ctx, live, s, b, z) {
  const P = OBSTACLE.bossRobot
  const C = range(P.cycle, s.k)
  const hipY = b + 18
  const hips = [-7, 7]
  const robot = new Group()
  live.add(robot)
  const armour = new MeshStandardMaterial({ color: '#5a6274', roughness: 0.4, metalness: 0.6 })
  // Torso: pelvis, chest, reactor, shoulders, arms, head.
  box(robot, armour, 0, hipY, z, 16, 2.4, 6)
  box(robot, M.dark(), 0, hipY + 4.5, z, 12, 7, 7)
  box(robot, M.hazard(), 0, hipY + 1.6, z, 12.2, 0.6, 7.2)
  const coreMat = neon('#ff6a1a', 5)
  const core = mesh(robot, G.sphere, coreMat, 0, hipY + 4.8, z + 3.6, 1.6, 1.6, 0.6, false)
  mesh(robot, new TorusGeometry(1.9, 0.3, 8, 24), M.chrome(), 0, hipY + 4.8, z + 3.55)
  for (const e of [-1, 1]) {
    mesh(robot, G.sphere, armour, e * 7.6, hipY + 7.4, z, 2.4, 2, 2.6)
    box(robot, M.hazard(), e * 7.6, hipY + 9, z, 3.6, 0.5, 4)
    rod(robot, armour, [e * 8.4, hipY + 6.4, z], [e * 9.6, hipY - 1, z + 1.5], 1.0, G.cyl)
    const gun = mesh(robot, G.cyl, M.iron(), e * 9.8, hipY - 2.6, z + 2.4, 1.1, 4, 1.1)
    gun.rotation.x = 0.6
    mesh(robot, G.cyl8, neon('#ff2a2a', 3), e * 9.8, hipY - 3.9, z + 3.6, 0.6, 0.3, 0.6, false).rotation.x = 0.6
    for (let i = 0; i < 3; i++) rod(robot, M.black(), [e * 5.8, hipY + 8, z - 2.5 + i * 0.3], [e * 5.8, hipY + 10.5 + i, z - 3 + i * 0.3], 0.18) // exhaust pipes
  }
  const headG = new Group()
  headG.position.set(0, hipY + 9.5, z)
  robot.add(headG)
  box(headG, armour, 0, 0, 0, 4.4, 3, 4)
  box(headG, M.black(), 0, 0.2, 2.02, 3.6, 1.0, 0.05, false)
  const eyeMat = neon('#ff2a2a', 6)
  const eye = box(headG, eyeMat, 0, 0.2, 2.06, 3.2, 0.42, 0.05, false)
  rod(headG, M.chrome(), [1.6, 1.5, -1], [2.2, 4, -1.4], 0.08)
  const antMat = beaconMat('#ff2a1a')
  mesh(headG, G.sphere, antMat, 2.2, 4.1, -1.4, 0.25, 0.25, 0.25, false)
  // Legs: thigh and shin rods from each hip to a foot, with knee and ankle joints.
  const legs = hips.map((hx, i) => {
    const thigh = mesh(robot, G.cyl, armour, 0, 0, 0, 1.1, 1, 1.1)
    const shin = mesh(robot, G.cyl, M.dark(), 0, 0, 0, 0.9, 1, 0.9)
    const knee = mesh(robot, G.sphere, M.hazard(), 0, 0, 0, 1.4, 1.4, 1.4)
    const piston = mesh(robot, G.cyl8, M.chrome(), 0, 0, 0, 0.3, 1, 0.3)
    const foot = new Group()
    robot.add(foot)
    box(foot, armour, 0, 0.9, 0, 6.4, 1.8, 8)
    box(foot, M.hazard(), 0, 0.15, 0, 6.6, 0.3, 8.2)
    for (const e of [-1, 0, 1]) mesh(foot, G.cone, M.iron(), e * 2.2, 0.9, 4.4, 0.6, 1.2, 0.6).rotation.x = Math.PI / 2 // toes
    const sm = M.reticle().clone()
    sm.opacity = 0
    const ret = floorPlane(live, sm, 0, b + 0.07, 0, 9, 9)
    const home = { x: hx * 1.6, z: z + (i ? -6 : 6) }
    return { thigh, shin, knee, piston, foot, ret, sm, hx, x: home.x, z: home.z, y: 0, home, phase: 'down', tx: home.x, tz: home.z, slam: false }
  })
  const UP = new Vector3(0, 1, 0)
  const dir = new Vector3()
  const place = (m, a, c, r) => {
    dir.set(c[0] - a[0], c[1] - a[1], c[2] - a[2])
    const len = dir.length() || 0.01
    m.position.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2)
    m.scale.set(r, len, r)
    m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len))
  }
  const lethal = lethalAt(s.k)
  const eyeBeam = makeBeam(live, '#ff2a2a', 0.08, 0.4)
  const o = { z, near: 0, reach: 40, ex: 0, ez: z + 10, loop: loopOf('robot', 0, hipY, z) }
  let eyeA = 0
  o.update = (dt, t) => {
    const active = nearby(b, z, 70)
    const c = (t + s.k) % C
    const cur = Math.floor((t + s.k) / C) % 2 // the leg doing the stomp this cycle
    const lift = C - P.aim - P.slam - P.down
    robot.position.y = Math.sin(t * 1.3) * 0.25
    core.scale.setScalar(1 + Math.sin(t * 6) * 0.08)
    legs.forEach((L, i) => {
      L.slam = false
      const mine = i === cur && active
      let phase = 'down'
      let y = 0
      if (mine) {
        if (c < lift) {
          phase = 'lift'
          y = smooth(c / lift) * 9
        } else if (c < lift + P.aim) {
          phase = 'aim'
          y = 9 + Math.sin(t * 9) * 0.3
          // Track where the truck is going.
          L.tx = Math.max(-F + 3.5, Math.min(F - 3.5, target.p.x + target.v.x * P.lead))
          L.tz = Math.max(z - 18, Math.min(z + 18, target.p.z + target.v.z * P.lead))
        } else if (c < lift + P.aim + P.slam) {
          phase = 'slam'
          y = 9 * (1 - ((c - lift - P.aim) / P.slam) ** 2)
        } else {
          phase = 'down'
          y = 0
        }
      }
      if (phase === 'slam' && L.phase === 'aim') sfx('whoosh', L.tx, b + 6, L.tz, 1.5)
      if (phase === 'down' && L.phase === 'slam') {
        L.slam = true
        sfx('stomp', L.tx, b, L.tz, 2)
        explode(L.tx, b + 0.5, L.tz, 0.9)
        fx('quake', L.tx, b, L.tz, { k: 1.1, r: 60 })
        fx('crack', L.tx, b, L.tz, { size: 9 })
        fx('boulderDust', L.tx, b, L.tz, { n: 40 })
      }
      if (phase === 'lift' && L.phase !== 'lift') sfx('servo1', L.x, b + 6, L.z, 1.2)
      L.phase = phase
      // Move over the target while lifted.
      const goX = mine ? L.tx : L.x
      const goZ = mine ? L.tz : L.z
      const k = phase === 'aim' ? Math.min(1, dt * 7) : phase === 'lift' ? Math.min(1, dt * 3) : 0
      L.x += (goX - L.x) * k
      L.z += (goZ - L.z) * k
      L.y = y
      L.foot.position.set(L.x, b + y, L.z)
      // Reticle on the floor while it hovers.
      const show = mine && (phase === 'aim' || phase === 'slam')
      L.ret.visible = show
      if (show) {
        L.ret.position.set(L.x, b + 0.07, L.z)
        L.ret.rotation.z += dt * 4
        L.sm.opacity = 0.5 + 0.4 * Math.sin(t * 25)
      }
      // Legs: hip -> knee -> ankle (the knee pushed forward and out).
      const hip = [L.hx, hipY - 0.8 + robot.position.y, z]
      const ank = [L.x, b + y + 1.8, L.z]
      const mx = (hip[0] + ank[0]) / 2
      const my = (hip[1] + ank[1]) / 2
      const mzz = (hip[2] + ank[2]) / 2
      const reach = Math.hypot(ank[0] - hip[0], ank[1] - hip[1], ank[2] - hip[2])
      const bend = Math.sqrt(Math.max(0, 15 * 15 - (reach / 2) ** 2))
      const kn = [mx + Math.sign(L.hx) * bend * 0.35, my + bend * 0.2, mzz + bend * 0.85]
      place(L.thigh, hip, kn, 1.1)
      place(L.shin, kn, ank, 0.9)
      place(L.piston, [hip[0], hip[1] - 1, hip[2] + 1], [ank[0], ank[1] + 2, ank[2] + 0.8], 0.3)
      L.knee.position.set(kn[0], kn[1], kn[2])
    })
    // Eye laser: a burning spot wandering the floor in a figure eight.
    eyeA += dt * P.eyeSpeed
    o.ex = Math.sin(eyeA) * (F - 4)
    o.ez = z + Math.sin(eyeA * 2) * 14
    headG.lookAt(o.ex, b, o.ez)
    eyeBeam.set(0, hipY + 9.7, z + 2, o.ex, b + 0.1, o.ez)
    eyeBeam.show(active, 1, 0.5)
    eyeMat.color.setScalar(1)
    antMat.emissiveIntensity = Math.sin(t * 8) > 0 ? 3 : 0.3
    if (active && Math.random() < dt * 30) fx('laserSpark', o.ex, b + 0.1, o.ez)
    if (active && Math.random() < dt * 10) fx('scorch', o.ex, b, o.ez)
    o.loop.level = active ? 0.7 : 0
  }
  o.test = (pp) => {
    for (const L of legs) {
      const ox = Math.abs(pp.x - L.x) - 3.2
      const oz = Math.abs(pp.z - L.z) - 4
      if (L.slam) {
        if (ox < TRUCK_R * 0.7 && oz < TRUCK_R * 0.7) return lethal ? { kill: 'crush', why: 'STOMPED!', x: pp.x, y: b + 0.5, z: pp.z } : { squash: true, lethal, stun: 1.2, x: pp.x, y: b + 0.5, z: pp.z }
        const d = Math.hypot(pp.x - L.x, pp.z - L.z)
        if (d < P.shock && pp.y - b < 3) {
          const f = 1 - d / P.shock
          return { hit: true, shock: true, vx: ((pp.x - L.x) / d) * P.shockKnock * (0.5 + f), vy: 6 + 6 * f, vz: ((pp.z - L.z) / d) * P.shockKnock * (0.5 + f), x: L.x, y: b + 0.5, z: L.z, power: 1 + f, color: '#5a6274' }
        }
      }
      if (L.phase === 'down' && ox < TRUCK_R && oz < TRUCK_R && pp.y - b < 2) return ox > oz ? { wall: true, vx: Math.sign(pp.x - L.x) * 9, vz: 0 } : { wall: true, vx: 0, vz: Math.sign(pp.z - L.z) * 9 }
      if (L.phase === 'slam' && ox < TRUCK_R + NM && oz < TRUCK_R + NM) return { near: true, x: L.x }
    }
    const de = Math.hypot(pp.x - o.ex, pp.z - o.ez)
    if (de < TRUCK_R * 0.9 && pp.y - b < 2) return { hit: true, laser: true, vx: (pp.x - o.ex) * 4, vy: 6, vz: (pp.z - o.ez) * 4 + 6, x: o.ex, y: b + 0.5, z: o.ez, power: 1, color: '#ff2a2a' }
    return de < TRUCK_R + NM ? { near: true, x: o.ex } : null
  }
  ctx.obstacles.push(o)
  for (let i = 0; i < 5; i++) gear(ctx, -16 + i * 8, b + 1.4, z + (i % 2 ? 8 : -8), s.k, i === 2 ? 'mega' : true)
}

export const ENEMY_BUILD = { rammers, crane, boulder, bossTower, bossRobot }
export const ENEMY_FOOT = { rammers: 18, crane: OBSTACLE.crane.zone + 8, boulder: 64, bossTower: 44, bossRobot: 46 }
export const ENEMY_INTRO = {
  rammers: ['RAMMING TRUCKS', 'Horn = truck coming!'],
  crane: ['MAGNET CRANE', "Don't stay under it!"],
  boulder: ['BOULDER RUN', 'Floor it!'],
  bossTower: ['BOSS: TURRET TOWER', 'Keep moving round it!'],
  bossRobot: ['BOSS: MEGA ROBOT', 'Red circle = STOMP!'],
}
