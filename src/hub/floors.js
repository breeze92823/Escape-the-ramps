import { CanvasTexture, Group, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TorusGeometry } from 'three'
import { OBSTACLE, PHYSICS, STAGES } from '../config.js'
import { neon, sign } from '../propkit.js'
import { RAPIER, world } from '../physics.js'
import { makeCanvas } from '../paint.js'
import { mulberry32 } from '../textures.js'
import { G, block, box, mesh, rod, solid } from './kit.js'
import { F, M, TRUCK_R, beaconMat, boxCollider, dropCollider, floorPlane, fx, gear, loopOf, range, sfx, target } from './hazardKit.js'
import { mineField } from './weapons.js'

// Floors and terrain: crumbling tiles, a tilting seesaw, a spinning turntable,
// smoke banks that close the fog in, a wall with one fake section, a floor
// with fake tiles, and the risky route (a split lane: safe, or dangerous with
// far more gears).

const NM = OBSTACLE.nearMiss
const W = STAGES.half

// --- Crumbling tiles ----------------------------------------------------------------------
// The lane over a hole is paved with stone tiles: each one cracks when the
// truck touches it and drops a moment later, then rises back. Keep moving.
function crumble(ctx, live, s, b, z) {
  const P = OBSTACLE.crumble
  const L = HOLES.crumble
  const cols = 7
  const rows = 4
  const tw = (W * 2) / cols
  const td = L / rows
  const tiles = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -W + (c + 0.5) * tw
      const tz = z + L / 2 - (r + 0.5) * td
      const m = box(live, M.tile(), x, b - 0.3, tz, tw - 0.12, 0.6, td - 0.12)
      // Stone underside so a falling tile reads as a slab.
      box(m, M.rock(), 0, -0.9, 0, 0.85, 1.2, 0.85, false)
      tiles.push({ m, x, z: tz, state: 'ok', t: 0, vy: 0, spin: 0, col: boxCollider(x, b - 0.3, tz, tw / 2 - 0.06, 0.3, td / 2 - 0.06) })
    }
  }
  // Supports at the edges of the hole.
  for (const e of [-1, 1]) block(ctx.statics, M.hazard(), 0, b - 0.05, z + e * (L / 2 + 0.15), W * 2, 0.1, 0.3, false)
  const o = { z, near: 0, reach: L / 2 }
  o.update = (dt) => {
    for (const p of tiles) {
      p.t += dt
      if (p.state === 'crack') {
        p.m.position.set(p.x + (Math.random() - 0.5) * 0.1, b - 0.3 + (Math.random() - 0.5) * 0.06, p.z)
        if (Math.random() < dt * 20) fx('crumbleDust', p.x + (Math.random() - 0.5) * tw, b, p.z + (Math.random() - 0.5) * td)
        if (p.t > P.wobble) {
          p.state = 'fall'
          p.t = 0
          p.vy = 0
          p.spin = (Math.random() - 0.5) * 2.5
          dropCollider(p.col)
          p.col = null
          sfx('crumble', p.x, b, p.z, 0.7)
          fx('rockBurst', p.x, b - 0.2, p.z, { r: 1.5, n: 6 })
        }
      } else if (p.state === 'fall') {
        p.vy -= 22 * dt
        p.m.position.y += p.vy * dt
        p.m.rotation.x += p.spin * dt
        p.m.rotation.z += p.spin * 0.6 * dt
        if (p.t > 2) p.m.visible = false
        if (p.t > P.back) {
          p.state = 'rise'
          p.t = 0
          p.m.visible = true
          p.m.rotation.set(0, 0, 0)
          p.m.material = M.tile()
        }
      } else if (p.state === 'rise') {
        const u = Math.min(1, p.t / 0.6)
        p.m.position.set(p.x, b - 0.3 - (1 - u) * 6, p.z)
        if (u >= 1) {
          p.state = 'ok'
          p.col = boxCollider(p.x, b - 0.3, p.z, tw / 2 - 0.06, 0.3, td / 2 - 0.06)
        }
      }
    }
  }
  o.test = (pp) => {
    if (Math.abs(pp.y - b) > 0.8 || Math.abs(pp.z - z) > L / 2 + 1.2) return null
    for (const p of tiles) {
      if (p.state === 'ok' && Math.abs(pp.x - p.x) < tw / 2 + 1.0 && Math.abs(pp.z - p.z) < td / 2 + 1.0) {
        p.state = 'crack'
        p.t = 0
        p.m.material = M.tileCracked()
        sfx('crack', p.x, b, p.z, 0.8)
      }
    }
    return null
  }
  ctx.obstacles.push(o)
  for (let i = 0; i < 5; i++) gear(ctx, -16 + i * 8, b + 1.4, z + (i % 2 ? 4 : -4), s.k, i === 2)
}

// --- Seesaw -------------------------------------------------------------------------------
// A wide plank on a pivot over a hole: the truck's weight tips it, and on the
// slope it slides toward the low side (and the open edge). A kinematic body,
// so the truck rides it.
function seesaw(ctx, live, s, b, z) {
  const P = OBSTACLE.seesaw
  const L = HOLES.seesaw
  const half = W - 0.5
  const T = 0.8
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, b - T / 2, z))
  world.createCollider(RAPIER.ColliderDesc.cuboid(half, T / 2, L / 2 - 0.2).setFriction(0.8), body)
  const plank = new Group()
  plank.position.set(0, b - T / 2, z)
  live.add(plank)
  box(plank, M.planks(), 0, 0, 0, half * 2, T, L - 0.4)
  for (const e of [-1, 1]) {
    box(plank, M.hazard(), e * (half - 0.3), T / 2 + 0.02, 0, 0.6, 0.04, L - 0.4, false)
    for (let i = 0; i < 4; i++) box(plank, M.iron(), e * (half - 3 - i * 6), -T / 2 - 0.2, 0, 0.4, 0.4, L - 1)
  }
  const lights = []
  for (let i = 0; i < 6; i++) {
    const lm = beaconMat('#ffb01a')
    mesh(plank, G.sphere, lm, -half + 2 + i * ((half * 2 - 4) / 5), T / 2 + 0.08, L / 2 - 0.6, 0.18, 0.12, 0.18, false)
    lights.push(lm)
  }
  // The fulcrum below.
  for (const e of [-1, 1]) {
    const tri = rod(ctx.statics, M.red(), [0, b - 12, z + e * (L / 2 - 2)], [0, b - T - 0.2, z + e * (L / 2 - 2)], 1.4, G.cyl8)
    tri.castShadow = true
  }
  const axle = mesh(live, G.cyl, M.chrome(), 0, b - T - 0.1, z, 0.6, L - 1, 0.6)
  axle.rotation.x = Math.PI / 2
  let th = 0
  let w = 0
  const q = { x: 0, y: 0, z: 0, w: 1 }
  const o = { z, near: 0, reach: L / 2, loop: loopOf('creakLoop', 0, b, z) }
  let lastCreak = 0
  o.update = (dt, t) => {
    const pp = target.p
    const on = Math.abs(pp.z - z) < L / 2 && Math.abs(pp.x) < half && Math.abs(pp.y - (b + Math.tan(th) * pp.x)) < 1.5
    // Torque from the truck's weight; springs back to level when empty.
    const torque = (on ? -pp.x * P.push * 22 : 0) - th * P.stiff - w * P.damp
    w += torque * dt
    th = Math.max(-P.max, Math.min(P.max, th + w * dt))
    if (Math.abs(th) >= P.max) w *= 0.3
    plank.rotation.z = th
    axle.rotation.y = 0
    q.z = Math.sin(th / 2)
    q.w = Math.cos(th / 2)
    body.setNextKinematicRotation(q)
    if (Math.abs(w) > 0.12 && t - lastCreak > 0.5) {
      lastCreak = t
      sfx('creak', Math.sign(th) * 10, b, z, 0.9)
    }
    o.on = on
    for (let i = 0; i < lights.length; i++) lights[i].emissiveIntensity = Math.abs(th) > P.max * 0.5 ? (Math.sin(t * 20 + i) > 0 ? 3 : 0.2) : 0.6
    o.loop.level = Math.min(1, Math.abs(w) * 3)
  }
  o.test = (pp) => {
    if (!o.on) return null
    // Slide down the slope (gravity along the plank).
    return { push: true, ax: PHYSICS.gravity * Math.sin(th) * P.slide, x: pp.x, y: pp.y + 1, z: pp.z, quiet: true } // +th lifts the +X side
  }
  ctx.obstacles.push(o)
  for (let i = 0; i < 5; i++) gear(ctx, -20 + i * 10, b + 1.6, z, s.k, i === 0 || i === 4)
}

// --- Turntable -------------------------------------------------------------------------------
// A spinning disc in the floor: it carries the truck round (and turns it), and
// low barrier arms sweep across it. Hop the arms.
function turntable(ctx, live, s, b, z) {
  const P = OBSTACLE.turntable
  const w = range(P.spin, s.k) * (s.k % 2 ? 1 : -1)
  const knock = range(P.knock, s.k)
  const R = P.r
  const disc = new Group()
  disc.position.set(0, b, z)
  live.add(disc)
  const deck = new MeshStandardMaterial({ map: deckTex(), roughness: 0.55, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 })
  const d = mesh(disc, G.cyl, deck, 0, 0.03, 0, R, 0.06, R, false)
  d.receiveShadow = true
  const rim = mesh(live, new TorusGeometry(R + 0.2, 0.22, 8, 64), neon('#2ad8ff', 2.5), 0, b + 0.1, z, 1, 1, 1, false)
  rim.rotation.x = Math.PI / 2
  // Hub (solid) with a motor and warning lamps.
  mesh(live, G.cyl, M.iron(), 0, b + 0.75, z, 2.2, 1.5, 2.2)
  mesh(live, G.cyl, M.hazard(), 0, b + 1.55, z, 2.25, 0.2, 2.25)
  const lamp = beaconMat('#ffb01a')
  mesh(live, G.sphere, lamp, 0, b + 1.9, z, 0.45, 0.45, 0.45, false)
  solid(0, 0, z, 3, 1.5, 3)
  // Three low arms.
  const arms = 3
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2
    const arm = box(disc, M.hazard(), Math.sin(a) * (R / 2 + 1.2), 0.45, Math.cos(a) * (R / 2 + 1.2), 0.6, 0.9, R - 3)
    arm.rotation.y = a
    const tip = mesh(disc, G.sphere, M.red(), Math.sin(a) * (R - 0.4), 0.5, Math.cos(a) * (R - 0.4), 0.5, 0.5, 0.5)
    tip.castShadow = true
  }
  ctx.surfaces.push({ type: 'spin', round: R, cx: 0, cz: z, x0: -R, x1: R, z0: z - R, z1: z + R, y: b, w })
  const o = { z, near: 0, ang: 0, reach: R, loop: loopOf('motor', 0, b + 1, z) }
  o.loop.level = 0.8
  o.update = (dt, t) => {
    o.ang += w * dt
    disc.rotation.y = o.ang
    lamp.emissiveIntensity = Math.sin(t * 6) > 0 ? 2.5 : 0.3
    o.loop.pitch = 0.6 + Math.abs(w) * 0.4
  }
  o.test = (pp) => {
    const dx = pp.x
    const dz = pp.z - z
    const r = Math.hypot(dx, dz)
    if (r > R + TRUCK_R || r < 2.5 || pp.y - b > 0.95) return null
    const ang = Math.atan2(dx, dz)
    for (let i = 0; i < arms; i++) {
      let da = ang - (o.ang + (i / arms) * Math.PI * 2)
      da = Math.atan2(Math.sin(da), Math.cos(da))
      const off = Math.abs(da) * r
      if (off < 0.3 + TRUCK_R * 0.8) {
        // Shoved along the arm's direction of travel.
        const sg = Math.sign(w)
        return { hit: true, vx: Math.cos(ang) * sg * knock, vy: 6, vz: -Math.sin(ang) * sg * knock, x: pp.x, y: b + 0.5, z: pp.z, power: 0.9, color: '#ffd21a' }
      }
      if (off < TRUCK_R + NM) return { near: true, x: pp.x }
    }
    return null
  }
  ctx.obstacles.push(o)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    gear(ctx, Math.sin(a) * 8, b + 1.4, z + Math.cos(a) * 8, s.k, i === 0)
  }
}
function deckTex() {
  const c = makeCanvas(256)
  const x = c.getContext('2d')
  x.fillStyle = '#3a4157'
  x.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 12; i++) {
    x.fillStyle = i % 2 ? '#2f3546' : '#ffd21a'
    x.beginPath()
    x.moveTo(128, 128)
    x.arc(128, 128, 128, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2)
    x.closePath()
    x.fill()
  }
  x.fillStyle = '#2f3546'
  x.beginPath()
  x.arc(128, 128, 96, 0, Math.PI * 2)
  x.fill()
  x.strokeStyle = 'rgba(255,255,255,0.15)'
  for (let r = 20; r < 96; r += 14) {
    x.beginPath()
    x.arc(128, 128, r, 0, Math.PI * 2)
    x.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// --- Smoke bank ---------------------------------------------------------------------------------
// Fog machines on both edges pour smoke over the lane and the fog closes in
// while you are inside it (main.js reads ctx.ambience). Paired with something
// nasty hidden in it ('smoke+mines').
function smoke(ctx, live, s, b, z) {
  const P = OBSTACLE.smoke
  const machines = []
  for (const e of [-1, 1]) {
    for (const dz of [-P.len / 3, P.len / 3]) {
      const x = e * (F - 0.4)
      block(ctx.statics, M.dark(), x, b, z + dz, 1.8, 1.6, 2.4)
      box(ctx.statics, M.hazard(), x, b + 1.62, z + dz, 1.82, 0.12, 2.42)
      const n = mesh(ctx.statics, G.cyl8, M.iron(), x - e * 1.1, b + 1.1, z + dz, 0.3, 0.6, 0.3)
      n.rotation.z = Math.PI / 2
      const lm = beaconMat('#ff2a1a')
      mesh(live, G.sphere, lm, x, b + 1.9, z + dz + 0.8, 0.15, 0.15, 0.15, false)
      machines.push({ x: x - e * 1.4, y: b + 1.1, z: z + dz, dir: -e, lm })
    }
  }
  ;(ctx.ambience ??= []).push({ z0: z - P.len / 2 - 4, z1: z + P.len / 2 + 4, y: b, fog: 1, fade: 8 })
  const o = { z, near: 0, reach: P.len, loop: loopOf('fan', 0, b + 1, z), test: () => null }
  o.loop.level = 0.3
  o.update = (dt, t) => {
    for (const m of machines) {
      m.lm.emissiveIntensity = Math.sin(t * 5 + m.z) > 0 ? 2 : 0.2
      if (Math.random() < dt * 9) fx('smoke', m.x, m.y, m.z, { dir: m.dir, len: P.len })
    }
    // Drifting smoke over the whole stretch.
    if (Math.random() < dt * 10) fx('smoke', (Math.random() - 0.5) * F * 2, b + 0.5, z + (Math.random() - 0.5) * P.len, { dir: 0, len: P.len })
  }
  ctx.obstacles.push(o)
}

// --- Fake wall -------------------------------------------------------------------------------------
// A brick wall across the lane in four sections; one is a hologram you can
// drive straight through. It flickers now and then: watch for it.
function brickTex() {
  const c = makeCanvas(256, 128)
  const x = c.getContext('2d')
  x.fillStyle = '#5a3a32'
  x.fillRect(0, 0, 256, 128)
  const r = mulberry32(9)
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      const bx = col * 32 + (row % 2 ? 16 : 0)
      x.fillStyle = `hsl(${8 + r() * 12}, ${40 + r() * 15}%, ${30 + r() * 12}%)`
      x.fillRect(bx + 1.5, row * 16 + 1.5, 29, 13)
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1.5, 1.5)
  return t
}
let brick = null
function fakewall(ctx, live, s, b, z) {
  brick ??= new MeshStandardMaterial({ map: brickTex(), roughness: 0.9 })
  const secs = 4
  const WW = F - 0.6
  const sw = (WW * 2) / secs
  const H = 5
  const fake = (s.k * 7 + 1) % secs
  const fakeMat = brick.clone()
  fakeMat.transparent = true
  fakeMat.emissive.set('#40c8ff')
  fakeMat.emissiveIntensity = 0
  for (let i = 0; i < secs; i++) {
    const x = -WW + (i + 0.5) * sw
    const real = i !== fake
    const m = box(real ? ctx.statics : live, real ? brick : fakeMat, x, b + H / 2, z, sw - 0.2, H, 1.2)
    if (real) solid(x, 0, z, sw - 0.2, H, 1.2)
    else m.castShadow = false
    box(ctx.statics, M.hazard(), x, b + H + 0.2, z, sw - 0.1, 0.4, 1.4)
  }
  for (let i = 1; i < secs; i++) {
    block(ctx.statics, M.dark(), -WW + i * sw, b, z, 0.6, H + 0.8, 1.6)
    solid(-WW + i * sw, 0, z, 0.6, H + 0.8, 1.6)
  }
  const l = sign([
    { text: 'ONE WALL IS FAKE', size: 56, font: 'lucky', fill: ['#8ff4ff', '#2ad8ff'], outline: '#0b1a2a' },
    { text: 'Watch for the flicker!', size: 30, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 },
  ], 2.6)
  l.position.set(0, b + H + 3, z + 0.8)
  live.add(l)
  const fx0 = -WW + (fake + 0.5) * sw
  const o = { z, near: 0, cd: 0 }
  o.update = (dt, t) => {
    o.cd = Math.max(0, o.cd - dt)
    const c = t % 3.2
    const glitch = c < 0.25 || (c > 0.4 && c < 0.5)
    fakeMat.opacity = glitch ? 0.55 + Math.random() * 0.3 : 0.98
    fakeMat.emissiveIntensity = glitch ? 0.8 : 0
  }
  o.test = (pp) => {
    if (o.cd === 0 && Math.abs(pp.z - z) < 1.2 && Math.abs(pp.x - fx0) < sw / 2 && pp.y - b < H) {
      o.cd = 1.5
      sfx('glitch', fx0, b + 2, z, 1)
      fx('hologram', pp.x, b + 1.5, z, { w: sw })
      fx('callout', pp.x, pp.y, pp.z, { text: 'PHASED THROUGH!', color: '#8ff4ff' })
    }
    return null
  }
  ctx.obstacles.push(o)
  gear(ctx, fx0, b + 1.6, z - 3, s.k, 'mega')
}

// --- Fake floor -------------------------------------------------------------------------------------
// Tiles over a hole; some are fake (no floor under them). They shimmer every
// few seconds. A column of real tiles always runs straight across.
function fakefloor(ctx, live, s, b, z) {
  const P = OBSTACLE.fakefloor
  const L = HOLES.fakefloor
  const cols = 5
  const rows = 2
  const tw = (W * 2) / cols
  const td = L / rows
  const rand = mulberry32(s.k * 53 + Math.round(z))
  const safeCol = Math.floor(rand() * cols)
  const cells = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (c !== safeCol) cells.push([r, c])
  const fakes = new Set()
  while (fakes.size < P.fakes && cells.length) fakes.add(cells.splice(Math.floor(rand() * cells.length), 1)[0].join(','))
  const shimmer = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -W + (c + 0.5) * tw
      const tz = z + L / 2 - (r + 0.5) * td
      const isFake = fakes.has(`${r},${c}`)
      const m = new MeshStandardMaterial({ map: M.tile().map, roughness: 0.85, emissive: '#7fe6ff', emissiveIntensity: 0, transparent: isFake })
      box(live, m, x, b - 0.3, tz, tw - 0.12, 0.6, td - 0.12)
      if (!isFake) boxCollider(x, b - 0.3, tz, tw / 2 - 0.06, 0.3, td / 2 - 0.06)
      else shimmer.push(m)
    }
  }
  for (const e of [-1, 1]) block(ctx.statics, M.hazard(), 0, b - 0.05, z + e * (L / 2 + 0.15), W * 2, 0.1, 0.3, false)
  const o = { z, near: 0, test: () => null }
  o.update = (dt, t) => {
    const c = t % 2.6
    const on = c < 0.35
    for (const m of shimmer) {
      m.emissiveIntensity = on ? 0.6 * Math.sin((c / 0.35) * Math.PI) : 0
      m.opacity = on ? 0.75 : 1
    }
  }
  ctx.obstacles.push(o)
  gear(ctx, -W + (safeCol + 0.5) * tw, b + 1.4, z, s.k, true)
}

// --- The risky route -------------------------------------------------------------------------------------
// The lane splits round a wall: one side is clear; the other is full of mines
// and spikes and pays far more gears (and a MEGA gear at the end).
function risky(ctx, live, s, b, z, foot = 40) {
  const len = foot - 4
  const side = s.k % 2 ? 1 : -1
  block(ctx.statics, M.dark(), 0, b, z, 1.2, 2.6, len)
  block(ctx.statics, M.hazard(), 0, b + 2.6, z, 1.3, 0.3, len + 0.1)
  solid(0, 0, z, 1.2, 2.9, len)
  for (const e of [-1, 1]) mesh(live, G.sphere, beaconMat(e === side ? '#ff2a1a' : '#2aff6a'), e * 0.8, b + 3.1, z + len / 2, 0.3, 0.3, 0.3, false)
  const l1 = sign([{ text: 'RISKY', size: 64, font: 'lucky', fill: ['#ff8a8a', '#ff2a3a'], outline: '#2a0000' }, { text: '3x GEARS', size: 34, font: 'fredoka', fill: '#ffe14a', outline: '#14141c', ow: 8 }], 2.4)
  l1.position.set(side * 13, b + 4.6, z + len / 2 + 2)
  live.add(l1)
  const l2 = sign([{ text: 'SAFE', size: 64, font: 'lucky', fill: ['#8affa8', '#2ad84a'], outline: '#002a0a' }], 1.6)
  l2.position.set(-side * 13, b + 4.2, z + len / 2 + 2)
  live.add(l2)
  const x0 = side > 0 ? 2.5 : -F + 2.5
  const x1 = side > 0 ? F - 2.5 : -2.5
  mineField(ctx, live, s, b, z, len - 6, x0, x1, Math.min(9, 4 + Math.floor(s.k / 3)), 5)
  for (let i = 0; i < 8; i++) gear(ctx, side * (6 + (i % 3) * 6), b + 1.4, z + len / 2 - 3 - i * ((len - 6) / 7), s.k, i % 3 === 0)
  gear(ctx, side * 12, b + 1.8, z - len / 2 + 2, s.k, 'mega')
  const o = { z, near: 0, test: () => null, update() {} }
  ctx.obstacles.push(o)
}

export const HOLES = { crumble: 20, seesaw: 22, fakefloor: 16 }
export const FLOOR_BUILD = { crumble, seesaw, turntable, smoke, fakewall, fakefloor, risky }
export const FLOOR_FOOT = { crumble: 20, seesaw: 22, turntable: OBSTACLE.turntable.r * 2 + 2, smoke: OBSTACLE.smoke.len, fakewall: 6, fakefloor: 16, risky: 40 }
export const FLOOR_INTRO = {
  crumble: ['CRUMBLING FLOOR', "Don't stop on the tiles!"],
  seesaw: ['SEESAW', 'Your weight tips it. Stay central!'],
  turntable: ['TURNTABLE', 'It spins you. HOP the arms!'],
  smoke: ['SMOKE BANK', 'Something is hiding in there...'],
  fakewall: ['FAKE WALL', 'Find the hologram'],
  fakefloor: ['FAKE FLOOR', 'Shimmering tiles are fake!'],
  risky: ['RISKY ROUTE', 'More danger, more gears'],
}
