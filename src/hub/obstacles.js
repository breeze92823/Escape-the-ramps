import { CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry } from 'three'
import { OBSTACLE, STAGE_OBSTACLES, STAGES } from '../config.js'
import { neon, sign } from '../propkit.js'
import { createSparkleField } from '../effects.js'
import { RAPIER, addFixed, world } from '../physics.js'
import { cached, makeCanvas, paintDiagonal, tex } from '../paint.js'
import { mulberry32 } from '../textures.js'
import { G, block, box, glowMat, mat, mesh, rod, solid } from './kit.js'

// Stage hazards and surfaces (STAGE_OBSTACLES in config). Moving parts are
// plain meshes animated from the clock; hits are tested analytically against
// the truck (a 1.3 m circle, 2.4 m tall) and returned to main.js as results:
//   hit (shove + tumble), squash (flatten; `lethal` = wreck), wall (push out),
//   near (close call), push (wind, per frame), none for floors.
// Every hazard also makes its own sound where it is: one-shot events
// (`sounds()`: whooshes, slams, booms, dings...) and machine loops (`loops()`:
// motors, fans, belts, grinders, saws, rolling logs) that audio.js plays in 3D.
// Floors: the collapsing bridge and the trapdoors sit in holes cut out of the
// island (planObstacles' `holes`), with colliders removed / restored as they
// give way; `narrow` slots shrink the island to a strip with sea both sides.
// From OBSTACLE.edgesFrom the rail is open beside knock-off hazards (`gaps`);
// from crushDeathFrom crushes wreck the truck. Gears sit in the danger zones.

const TRUCK_R = 1.3
const TRUCK_H = 2.4
const F = STAGES.fence
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v) => v * v * (3 - 2 * v)
const range = (pair, k) => (Array.isArray(pair) ? lerp(pair[0], pair[1], OBSTACLE.ramp(k)) : pair)
const lethalAt = (k) => k >= OBSTACLE.crushDeathFrom

// Footprint (m along the lane) of one slot of each type.
const FOOT = {
  pendulum: 9,
  sweeper: 27,
  crusher: 10,
  piston: 8,
  pistons4: 18,
  mallet: 12,
  wreck: 30,
  wave: 36,
  pile: 10,
  logs: 60,
  cannon: 18,
  bumpers: 24,
  grinder: 14,
  blades: 20,
  wind: 16,
  geyser: 12,
  bridge: 18,
  trapdoor: 16,
  narrow: 44,
  ice: OBSTACLE.ice.len,
  mud: OBSTACLE.mud.len,
  conveyor: OBSTACLE.conveyor.len + 2,
  bounce: OBSTACLE.bounce.len + 3,
  booster: OBSTACLE.booster.len + 2,
}
const HOLES = { bridge: 18, trapdoor: 16 } // slots that cut a hole this long in the island
// The NEW! sign shown on the stage where a mechanic first appears.
const INTRO = {
  pendulum: ['SWINGING HAMMERS', 'Time your run!'],
  sweeper: ['SPINNING SWEEPERS', 'HOP over the bar (Space)'],
  crusher: ['CRUSHERS', 'They shake before they slam'],
  piston: ['PISTONS', 'They glow red before they punch'],
  pistons4: ['PISTON GAUNTLET', 'Four in a row!'],
  mallet: ['SMASH MALLETS', 'Get hit = truck wrecked!'],
  wreck: ['WRECKING BALLS', 'Dodge sideways!'],
  wave: ['CRUSHER WAVE', 'Floor it before it catches you!'],
  pile: ['PILE DRIVERS', 'Fast and deadly'],
  logs: ['ROLLING LOGS', 'Weave between them!'],
  cannon: ['CANNONS', 'Listen for the fuse!'],
  bumpers: ['BUMPERS', 'They fire you away!'],
  grinder: ['THE GRINDER', 'Stay in the middle!'],
  blades: ['SAW BLADES', 'Watch the pattern'],
  wind: ['WIND CANNON', 'Steer into the wind!'],
  geyser: ['GEYSERS', 'Bubbles = about to blow'],
  bridge: ['COLLAPSING BRIDGE', "Don't stop!"],
  trapdoor: ['TRAPDOORS', 'Red light = opening'],
  narrow: ['NARROW PATH', 'Sea on both sides!'],
  ice: ['ICE', 'Steer early, you will slide'],
  mud: ['MUD', 'Slow! Go around it'],
  conveyor: ['CONVEYORS', 'Steer against the push'],
  bounce: ['BOUNCE PADS', 'Grab the gears up high!'],
  booster: ['BOOST PADS', 'Free speed!'],
}

// --- Sounds -------------------------------------------------------------------------------
const soundQ = []
const sfx = (type, x, y, z, k = 1) => soundQ.push({ type, x, y, z, k })
const loopOf = (kind, x, y, z) => ({ kind, x, y, z, level: 0, pitch: 1 })

// --- Removable colliders (bridge planks, trapdoors) ------------------------------------
const boxCollider = (x, y, z, hx, hy, hz) => addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z })
function dropCollider(c) {
  if (c && world) world.removeCollider(c, true)
}

// --- Textures ------------------------------------------------------------------------
function paintChevrons(fg, bg) {
  const c = makeCanvas(128)
  const x = c.getContext('2d')
  x.fillStyle = bg
  x.fillRect(0, 0, 128, 128)
  x.fillStyle = fg
  for (const y0 of [14, 70]) {
    x.beginPath() // a chevron pointing to the top (texture +V)
    x.moveTo(64, y0)
    x.lineTo(118, y0 + 54)
    x.lineTo(96, y0 + 54)
    x.lineTo(64, y0 + 22)
    x.lineTo(32, y0 + 54)
    x.lineTo(10, y0 + 54)
    x.closePath()
    x.fill()
  }
  return c
}
function paintMud() {
  const c = makeCanvas(256)
  const x = c.getContext('2d')
  x.fillStyle = '#5b3a1f'
  x.fillRect(0, 0, 256, 256)
  const r = mulberry32(77)
  for (let i = 0; i < 90; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(40,22,10,0.45)' : 'rgba(120,80,45,0.35)'
    x.beginPath()
    x.ellipse(r() * 256, r() * 256, 6 + r() * 22, 4 + r() * 14, r() * 3, 0, Math.PI * 2)
    x.fill()
  }
  return c
}
// A soft dark disc: the telegraph shadow under a mallet's slam spot.
function paintShadow() {
  const c = makeCanvas(128)
  const x = c.getContext('2d')
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(10,0,0,0.95)')
  g.addColorStop(0.7, 'rgba(60,0,0,0.6)')
  g.addColorStop(1, 'rgba(60,0,0,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 128, 128)
  return c
}
function paintPlanks() {
  const c = makeCanvas(256, 64)
  const x = c.getContext('2d')
  x.fillStyle = '#9a6a3a'
  x.fillRect(0, 0, 256, 64)
  const r = mulberry32(5)
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(60,35,15,${0.15 + r() * 0.25})`
    x.beginPath()
    const y = r() * 64
    x.moveTo(0, y)
    x.bezierCurveTo(80, y + (r() - 0.5) * 8, 170, y + (r() - 0.5) * 8, 256, y + (r() - 0.5) * 6)
    x.stroke()
  }
  x.fillStyle = '#3a3f4a'
  for (const px of [10, 246]) for (const py of [16, 48]) x.fillRect(px - 3, py - 3, 6, 6)
  return c
}
const decal = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }
const M = {
  red: () => mat('#e8344e', { roughness: 0.45 }),
  white: () => mat('#f2f4f8', { roughness: 0.5 }),
  steel: () => mat('#7d8696', { roughness: 0.4, metalness: 0.6 }),
  iron: () => mat('#3a3f4a', { roughness: 0.35, metalness: 0.75 }),
  dark: () => mat('#2f3546', { roughness: 0.7 }),
  wood: () => mat('#8a5a32', { roughness: 0.8 }),
  log: () => mat('#6b4224', { roughness: 0.9 }),
  rope: () => mat('#c9a66b', { roughness: 0.9 }),
  hazard: () => cached('obs:hazard', () => new MeshStandardMaterial({ map: tex(paintDiagonal('#ffd21a', '#1c1c22', 256, 64, 24), { repeatX: 2 }), roughness: 0.6 })),
  hazardFloor: () => cached('obs:hazardfloor', () => new MeshStandardMaterial({ map: tex(paintDiagonal('#ffd21a', '#1c1c22', 256, 64, 24), { repeatX: 3 }), roughness: 0.7, transparent: true, opacity: 0.85, ...decal })),
  curb: () => cached('obs:curb', () => new MeshStandardMaterial({ map: tex(paintDiagonal('#e8203a', '#ffffff', 256, 64, 32), { repeatX: 12 }), roughness: 0.6 })),
  ice: () => cached('obs:ice', () => new MeshStandardMaterial({ color: '#bfeaff', roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.88, ...decal })),
  mud: () => cached('obs:mud', () => new MeshStandardMaterial({ map: tex(paintMud(), { repeatX: 4, repeatY: 3 }), roughness: 1, ...decal })),
  planks: () => cached('obs:planks', () => new MeshStandardMaterial({ map: tex(paintPlanks(), { wrap: false }), roughness: 0.85 })),
  water: () => cached('obs:water', () => new MeshStandardMaterial({ color: '#8fe6ff', roughness: 0.1, transparent: true, opacity: 0.55, emissive: '#2a9ad8', emissiveIntensity: 0.3, depthWrite: false })),
}
const shadowTex = () => cached('obs:shadowtex', () => {
  const t = new CanvasTexture(paintShadow())
  t.colorSpace = SRGBColorSpace
  return t
})
// Scrolling chevron textures (one per look), animated in update().
const scrolling = []
function chevronMat(key, fg, bg, repeatX, repeatY, glowing) {
  return cached(`obs:chev:${key}`, () => {
    const t = tex(paintChevrons(fg, bg), { repeatX, repeatY })
    const m = glowing ? new MeshBasicMaterial({ map: t, toneMapped: false, ...decal }) : new MeshStandardMaterial({ map: t, roughness: 0.6, ...decal })
    scrolling.push({ t, speed: glowing ? 2.4 : 1.1 })
    return m
  })
}
// A flat patch on the floor, sx by sz m (world x / z); `dir` turns the texture's
// up (+V) from north (-Z): -PI/2 points it east (+X), PI/2 west.
const planeGeo = new PlaneGeometry(1, 1)
function floorPlane(parent, material, x, y, z, sx, sz, dir = 0) {
  const m = new Mesh(planeGeo, material)
  m.rotation.set(-Math.PI / 2, 0, dir)
  const across = Math.abs(Math.sin(dir)) > 0.5
  m.scale.set(across ? sz : sx, across ? sx : sz, 1)
  m.position.set(x, y, z)
  m.receiveShadow = true
  parent.add(m)
  return m
}

// --- Layout -------------------------------------------------------------------------------
// Pure: where stage s's slots go (`placed`: { type, z }), which stretches of
// its side rails are left open (`gaps`), where the island has holes
// (`holes`: [zHigh, zLow]) and where it narrows (`narrows`: [zHigh, zLow, half]).
// `pz` = the yellow win pad's z.
export function planObstacles(s, pz) {
  const list = STAGE_OBSTACLES[s.k - 1] ?? []
  const items = []
  for (const [type, n] of list) for (let i = 0; i < n; i++) items.push(type)
  const aStart = s.zs - OBSTACLE.laneStart
  const aEnd = pz + OBSTACLE.padClear[0]
  const bStart = pz - 15 - OBSTACLE.padClear[1]
  const bEnd = s.zr + OBSTACLE.clearBeforeRamp
  // Slots go on one virtual axis (segment A, then B) with even gaps; a slot that
  // would straddle the pads moves on to B. If that overflows, the gaps shrink.
  const lenA = aStart - aEnd
  const total = lenA + (bStart - bEnd)
  const foot = items.reduce((a, t) => a + FOOT[t], 0)
  let gap = Math.max(2, (total - foot) / (items.length + 1))
  let spans = []
  for (let tries = 0; tries < 8; tries++) {
    spans = []
    let v = 0
    for (const type of items) {
      v += gap
      if (v < lenA && v + FOOT[type] > lenA) v = lenA + Math.min(gap, 4)
      spans.push([type, v])
      v += FOOT[type]
    }
    if (v <= total || gap <= 2) break
    gap = Math.max(2, gap - (v - total) / items.length)
  }
  const placed = []
  const gaps = []
  const holes = []
  const narrows = []
  for (let [type, v] of spans) {
    const start = v < lenA ? aStart - v : bStart - (v - lenA)
    if (start - FOOT[type] < bEnd - 4) continue // no room left: drop it
    const zc = start - FOOT[type] / 2
    if (type === 'booster' && zc - s.zr < OBSTACLE.boosterMinToRamp) type = 'bounce'
    placed.push({ type, z: zc })
    if (HOLES[type]) holes.push([zc + HOLES[type] / 2, zc - HOLES[type] / 2])
    if (type === 'narrow') narrows.push([zc + FOOT.narrow / 2, zc - FOOT.narrow / 2, OBSTACLE.narrow.half])
    if ((s.k >= OBSTACLE.edgesFrom && OBSTACLE.edgeTypes.includes(type)) || HOLES[type] || type === 'narrow') {
      const half = FOOT[type] / 2 + OBSTACLE.edgePad
      const g = [zc + half, zc - half]
      const last = gaps[gaps.length - 1]
      if (last && last[1] <= g[0] + 8) last[1] = Math.min(last[1], g[1]) // merge neighbours (no rail stubs)
      else gaps.push(g)
    }
  }
  return { placed, gaps, holes, narrows }
}

// Red/white curb along an open edge (decoration: the truck goes straight over).
// `halfX` = the island's half-width there.
export function edgeCurb(parent, b, side, zHi, zLo, halfX = STAGES.half) {
  const len = zHi - zLo
  box(parent, M.curb(), side * (halfX - 0.35), b + 0.12, (zHi + zLo) / 2, 0.7, 0.24, len, false)
  // A warning post at each end.
  for (const z of [zHi, zLo]) {
    mesh(parent, G.cyl8, M.red(), side * (halfX - 0.6), b + 1.1, z, 0.18, 2.2, 0.18)
    mesh(parent, G.sphere, glowMat('#ff3a2a', 2.2), side * (halfX - 0.6), b + 2.35, z, 0.32, 0.32, 0.32, false)
  }
}

// --- Per stage --------------------------------------------------------------------------
export function buildObstacles(ctx, s, grp, plan) {
  if (!ctx.obstacles) {
    ctx.obstacles = []
    ctx.surfaces = []
    ctx.obstacleGroups = []
    ctx.seenTypes = new Set()
  }
  const { placed } = plan
  if (!placed.length) return

  const live = new Group()
  ctx.live.add(live)
  ctx.obstacleGroups.push({ group: live, zMin: s.zt - 20, zMax: s.zs + 20, k: s.k })

  // NEW! sign for a mechanic seen here for the first time, BOSS stages, and the
  // stage where the edges open.
  const fresh = placed.map((p) => p.type).filter((t, i, a) => a.indexOf(t) === i && !ctx.seenTypes.has(t))
  for (const t of fresh) ctx.seenTypes.add(t)
  let intro = null
  if (s.k % 10 === 0) intro = ['BOSS STAGE!', 'Everything at once', true]
  else if (s.k === OBSTACLE.edgesFrom) intro = ['OPEN EDGES!', 'Hits can knock you into the sea!', true]
  else if (fresh.length) intro = [`NEW: ${INTRO[fresh[0]][0]}`, INTRO[fresh[0]][1], false]
  if (intro) {
    const [title, tip, red] = intro
    const l = sign([
      { text: title, size: 64, font: 'lucky', fill: red ? ['#ff8a8a', '#ff2a3a'] : ['#7fffd8', '#1fd8a0'], outline: '#0b1a2a' },
      { text: tip, size: 34, font: 'fredoka', fill: '#ffffff', outline: '#14141c', ow: 8 },
    ], 3)
    l.position.set(0, s.y + 5.8, s.zs - 34) // over the lane, high enough to drive under
    live.add(l)
    s.intro = `${title} ${tip}`
  }

  for (const p of placed) BUILD[p.type](ctx, live, s, s.y, p.z)
}

// --- Shared pieces ----------------------------------------------------------------------
const gear = (ctx, x, y, z, k, gold = false) => ctx.gearSpots.push({ x, y, z, value: gold ? k * 5 : k, gold })

// A slamming block (crushers, the crusher wave, pile drivers). Square (w x d)
// or round (w = diameter). opts: C cycle, offset, warn, fall, down, rise,
// fakes, doubles, lift, h, lethal, power, round.
function slammer(ctx, live, s, b, x, z, w, d, o) {
  const g = new Group()
  live.add(g)
  if (o.round) {
    mesh(g, G.cyl, M.iron(), 0, o.h / 2, 0, w / 2, o.h, w / 2)
    mesh(g, G.cyl, M.hazard(), 0, o.h * 0.75, 0, w / 2 + 0.05, o.h * 0.3, w / 2 + 0.05)
    rod(g, M.steel(), [0, o.h, 0], [0, o.h + 30, 0], 0.4)
    floorPlane(live, M.hazardFloor(), x, b + 0.03, z, w, d)
  } else {
    box(g, M.hazard(), 0, o.h / 2, 0, w, o.h, d)
    box(g, M.dark(), 0, o.h + 0.2, 0, w - 0.6, 0.4, d - 0.6)
    const teeth = Math.max(2, Math.round(w / 3))
    for (let i = 0; i < teeth; i++) mesh(g, G.cone, M.iron(), -w / 2 + (i + 0.5) * (w / teeth), -0.35, 0, 0.45, 0.7, 0.45).rotation.x = Math.PI
    for (const sx of [-1, 1]) rod(g, M.steel(), [sx * w * 0.3, o.h + 0.4, 0], [sx * w * 0.3, o.h + 30, 0], 0.18)
    floorPlane(live, M.hazardFloor(), x, b + 0.03, z, w, d)
  }
  const { C, warn } = o
  const upHold = Math.max(0.1, C - o.rise - warn - o.fall - o.down)
  const ob = { z, u: 1, phase: 'up', near: 0, slam: false, prevU: 1 }
  ob.update = (dt, t) => {
    const tt = t + o.offset
    const n = Math.floor(tt / C)
    let c = tt - n * C
    const fake = o.fakes && n % 3 === 2 // shakes, then stays up
    let u = 1
    let shake = 0
    let phase = 'up'
    if (c < o.rise) {
      u = fake ? 1 : c / o.rise
      phase = fake ? 'up' : 'rise'
    } else if ((c -= o.rise) < upHold) {
      phase = 'up'
    } else if ((c -= upHold) < warn) {
      phase = 'warn'
      shake = 0.16 * (c / warn)
    } else if (fake) {
      phase = 'up'
    } else if ((c -= warn) < o.fall) {
      phase = 'fall'
      u = 1 - (c / o.fall) ** 2
    } else {
      c -= o.fall
      phase = 'down'
      u = 0
      if (o.doubles && c > 0.1 && c < 0.5) {
        // A short bounce and a second slam.
        const v = (c - 0.1) / 0.4
        u = 0.3 * Math.sin(Math.PI * v)
        if (u < 0.03) u = 0 // lands cleanly (the slam event needs an exact 0)
        phase = v > 0.5 ? 'fall' : 'down'
      }
    }
    if (phase === 'warn' && ob.phase !== 'warn') sfx(o.round ? 'hiss' : 'rattle', x, b + 3, z, 0.9)
    if (phase === 'rise' && ob.phase !== 'rise') sfx('hiss', x, b + 2, z, 0.5)
    ob.slam = ob.prevU > 0.02 && u === 0
    if (ob.slam) sfx('slam', x, b + 0.5, z, o.power)
    ob.prevU = u
    ob.phase = phase
    ob.u = u
    g.position.set(x + (Math.random() - 0.5) * shake, b + o.lift * u, z + (Math.random() - 0.5) * shake)
  }
  ob.slamAt = { x, y: b, z, w, d }
  ob.test = (pp) => {
    const bottom = o.lift * ob.u
    const ox = Math.abs(pp.x - x) - w / 2
    const oz = Math.abs(pp.z - z) - d / 2
    const inside = o.round ? Math.hypot(pp.x - x, pp.z - z) < w / 2 + TRUCK_R * 0.8 : ox < TRUCK_R && oz < TRUCK_R
    if (!inside || bottom > TRUCK_H || pp.y - b > bottom + o.h) {
      return ox < TRUCK_R + OBSTACLE.nearMiss && oz < TRUCK_R + OBSTACLE.nearMiss && ob.phase === 'fall' ? { near: true, x } : null
    }
    if (ob.phase === 'fall' || ob.slam) return { squash: true, lethal: o.lethal, stun: 1, x: pp.x, y: b + 0.5, z: pp.z }
    // Low block: a wall. Push out through the nearest face.
    if (ox > oz) return { wall: true, vx: Math.sign(pp.x - x) * 9, vz: 0 }
    return { wall: true, vx: 0, vz: Math.sign(pp.z - z) * 9 }
  }
  ctx.obstacles.push(ob)
  return ob
}

// One wall piston (single gates and the four-in-a-row gauntlet).
function piston(ctx, live, s, b, z, side, offset, d) {
  const P = OBSTACLE.piston
  const C = range(P.cycle, s.k)
  const warn = range(P.warn, s.k)
  const punch = range(P.punch, s.k)
  const reach = range(P.reach, s.k)
  const knock = range(P.knock, s.k)
  const W = F - 2.6 // the housing's inner face
  const idle = Math.max(0.15, C - warn - punch - P.hold - P.back)
  block(ctx.statics, M.dark(), side * (W + 1.6), b, z, 3.2, P.h + 1, d + 1.2)
  solid(side * (W + 1.6), 0, z, 3.2, P.h + 1, d + 1.2)
  const ram = box(live, M.steel(), side * W, b + P.h / 2, z, 1, P.h * 0.55, d * 0.55)
  const plateMat = new MeshStandardMaterial({ color: '#e8344e', roughness: 0.4, emissive: '#ff1a1a', emissiveIntensity: 0 })
  const plate = box(live, plateMat, side * W, b + P.h / 2, z, 0.7, P.h, d)
  floorPlane(live, M.hazardFloor(), side * (W - reach / 2), b + 0.03, z, reach, 0.7)
  const o = { z, ext: 0, phase: 'idle', near: 0 }
  o.update = (dt, t) => {
    let c = (t + offset + s.k * 0.21) % C
    let e = 0
    let glow = 0
    let phase = 'idle'
    if (c < idle) {
      phase = 'idle'
    } else if ((c -= idle) < warn) {
      phase = 'warn'
      glow = 0.5 + 0.5 * Math.sin(c * 40)
    } else if ((c -= warn) < punch) {
      phase = 'punch'
      e = c / punch
      glow = 1
    } else if ((c -= punch) < P.hold) {
      phase = 'hold'
      e = 1
    } else {
      phase = 'back'
      e = 1 - (c - P.hold) / P.back
    }
    if (phase !== o.phase) {
      if (phase === 'warn') sfx('charge', side * W, b + 1.5, z, 0.8)
      else if (phase === 'punch') sfx('clang', side * (W - reach * 0.5), b + 1.2, z, 1)
      else if (phase === 'back') sfx('hiss', side * W, b + 1.5, z, 0.5)
    }
    o.phase = phase
    o.ext = Math.max(0, e) * reach
    plateMat.emissiveIntensity = glow * 1.8
    const tip = side * (W - o.ext)
    plate.position.x = tip
    ram.scale.x = Math.max(0.05, o.ext)
    ram.position.x = side * (W - o.ext / 2)
  }
  o.test = (pp) => {
    const tip = W - o.ext // |x| of the plate face
    const ax = side * pp.x // distance toward this wall
    const oz = Math.abs(pp.z - z) - d / 2
    if (oz > TRUCK_R || pp.y - b > P.h || ax < tip - 0.35 - TRUCK_R) {
      return o.phase === 'punch' && oz < TRUCK_R + OBSTACLE.nearMiss && ax > tip - TRUCK_R - OBSTACLE.nearMiss - 2 ? { near: true, x: side * tip } : null
    }
    if (o.phase === 'punch') return { hit: true, vx: -side * knock, vy: 6, vz: 0, x: side * tip, y: b + P.h / 2, z, power: 1.2, color: '#e8344e' }
    if (o.ext < 0.5) return null
    return { wall: true, vx: -side * 8, vz: 0 }
  }
  ctx.obstacles.push(o)
  gear(ctx, side * (W - reach * 0.6), b + 1.4, z, s.k)
}

// One pinball bumper at (x, z): fires the truck straight away from its centre.
function bumper(ctx, live, s, b, x, z, r = 1.9) {
  const P = OBSTACLE.bumpers
  const knock = range(P.knock, s.k)
  mesh(live, G.cyl, M.dark(), x, b + 0.3, z, r + 0.35, 0.6, r + 0.35)
  const bodyMat = new MeshStandardMaterial({ color: '#ff3fa8', roughness: 0.35, emissive: '#ff3fa8', emissiveIntensity: 0.2 })
  mesh(live, G.cyl, bodyMat, x, b + 1.0, z, r, 1.0, r)
  const capMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#ffe14a', emissiveIntensity: 0.3 })
  mesh(live, G.cyl, capMat, x, b + 1.6, z, r * 0.75, 0.25, r * 0.75)
  const ring = mesh(live, new TorusGeometry(r + 0.05, 0.14, 8, 28), M.white(), x, b + 1.5, z)
  ring.rotation.x = Math.PI / 2
  let flash = 0
  const o = { z, near: 0 }
  o.update = (dt) => {
    flash = Math.max(0, flash - dt * 3)
    bodyMat.emissiveIntensity = 0.2 + flash * 2.5
    capMat.emissiveIntensity = 0.3 + flash * 2
    ring.scale.setScalar(1 + flash * 0.25)
  }
  o.test = (pp) => {
    const dx = pp.x - x
    const dz = pp.z - z
    const d = Math.hypot(dx, dz)
    if (d > r + TRUCK_R || pp.y - b > 1.8 || o.near > OBSTACLE.nearCooldown - 0.6) return null
    flash = 1
    sfx('ding', x, b + 1.2, z, 1)
    const ux = dx / (d || 1)
    const uz = dz / (d || 1)
    return { hit: true, bumper: true, vx: ux * knock, vy: 5, vz: uz * knock, x: x + ux * r, y: b + 1.2, z: z + uz * r, power: 1, color: '#ff3fa8' }
  }
  ctx.obstacles.push(o)
}

// --- Builders: each pushes { z, update(dt, t), test(pp), loop? } or a surface ----------
const BUILD = {
  pendulum(ctx, live, s, b, z) {
    const P = OBSTACLE.pendulum
    const W = F - 1.4
    // Frame: two posts and a beam (static, solid posts).
    for (const sx of [-1, 1]) {
      block(ctx.statics, M.white(), sx * W, b, z, 1.2, P.pivot + 0.8, 1.2)
      solid(sx * W, 0, z, 1.2, P.pivot + 0.8, 1.2)
    }
    box(ctx.statics, M.red(), 0, b + P.pivot + 0.4, z, W * 2 + 1.2, 1, 5.6)
    const T0 = range(P.period, s.k)
    const knock = range(P.knock, s.k)
    const lift = range(P.lift, s.k)
    // Later stages: two hammers per post line, swinging opposite ways.
    const pairs = s.k >= P.doubleFrom ? [[-2.1, 0], [2.1, Math.PI]] : [[0, 0]]
    P.xs.forEach((x, i) => {
      // From desyncFrom each hammer keeps its own rhythm, so the safe gap wanders.
      const T = s.k >= P.desyncFrom ? T0 * (1 + P.desync * (i - 1)) : T0
      for (const [dz, flip] of pairs) {
        const hz = z + dz
        const pivot = new Group()
        pivot.position.set(x, b + P.pivot, hz)
        live.add(pivot)
        rod(pivot, M.red(), [0, 0, 0], [0, -P.arm + P.headR * 0.6, 0], 0.22, G.cyl8)
        const head = mesh(pivot, G.cyl, M.red(), 0, -P.arm, 0, P.headR, P.headLen, P.headR)
        head.rotation.x = Math.PI / 2
        for (const e of [-1, 1]) {
          const cap = mesh(pivot, G.cyl, M.white(), 0, -P.arm, e * (P.headLen / 2 + 0.12), P.headR * 1.04, 0.25, P.headR * 1.04)
          cap.rotation.x = Math.PI / 2
        }
        const phase = (i * Math.PI * 2) / 3 + s.k + flip
        const o = { z: hz, theta: 0, omega: 0, near: 0 }
        o.update = (dt, t) => {
          const a = (Math.PI * 2 * t) / T + phase
          const th = P.amp * Math.sin(a)
          const om = Math.cos(a)
          if (Math.sign(th) !== Math.sign(o.theta)) sfx('whoosh', x, b + 2, hz, 0.8)
          else if (Math.sign(om) !== Math.sign(o.omega) && Math.random() < 0.5) sfx('creak', x, b + P.pivot, hz, 0.7)
          o.theta = th
          o.omega = om
          pivot.rotation.z = th
        }
        o.test = (pp) => {
          const hx = x + P.arm * Math.sin(o.theta)
          const hy = b + P.pivot - P.arm * Math.cos(o.theta)
          const ddz = Math.abs(pp.z - hz) - P.headLen / 2
          if (ddz > TRUCK_R + OBSTACLE.nearMiss) return null
          const d = Math.hypot(hx - pp.x, hy - (pp.y + TRUCK_H / 2)) - P.headR
          if (d < TRUCK_R && ddz < TRUCK_R * 0.6) {
            const dir = Math.abs(o.omega) > 0.15 ? Math.sign(o.omega) : Math.sign(pp.x - hx) || 1
            // Harder the faster the head is moving (bottom of the swing hits hardest).
            const k = 0.6 + 0.4 * Math.abs(o.omega)
            return { hit: true, vx: dir * knock * k, vy: lift, vz: 3, x: hx, y: hy, z: hz, power: k, color: '#e8344e' }
          }
          return d < TRUCK_R + OBSTACLE.nearMiss ? { near: true, x: hx } : null
        }
        ctx.obstacles.push(o)
      }
      gear(ctx, x, b + 1.4, z, s.k, i === 1)
    })
  },

  sweeper(ctx, live, s, b, z) {
    const P = OBSTACLE.sweeper
    const w = range(P.speed, s.k)
    const knock = range(P.knock, s.k)
    const surges = s.k >= P.surgeFrom
    const reverses = s.k >= P.reverseFrom
    const high = s.k >= P.highFrom
    const E = P.surgeEvery
    const D = P.surgeTime
    const R = P.reverseEvery
    P.xs.forEach((cx, i) => {
      block(ctx.statics, M.dark(), cx, b, z, 1.6, high ? 3.6 : 2.2, 1.6)
      solid(cx, 0, z, 1.6, 2.2, 1.6)
      const hubG = new Group()
      hubG.position.set(cx, b, z)
      live.add(hubG)
      box(hubG, M.hazard(), 0, P.h - 0.25, 0, P.arm * 2, 0.5, 0.7)
      const capMat = new MeshStandardMaterial({ color: '#e8344e', roughness: 0.45, emissive: '#ff1a1a', emissiveIntensity: 0 })
      mesh(hubG, G.cyl, capMat, 0, P.h + 0.1, 0, 1.1, 0.7, 1.1)
      for (const e of [-1, 1]) mesh(hubG, G.sphere, capMat, e * P.arm, P.h - 0.25, 0, 0.55, 0.55, 0.55)
      // The high bar (from highFrom): at hop height, crossed with the low one.
      if (high) {
        mesh(hubG, G.cyl8, M.steel(), 0, (P.highBar + 0.4) / 2, 0, 0.3, P.highBar + 0.4, 0.3)
        const hb = box(hubG, M.hazard(), 0, P.highBar, 0, 0.7, 0.5, P.arm * 2)
        hb.castShadow = true
      }
      const dir = i % 2 ? -1 : 1
      const offset = i * 1.7 + s.k * 0.3
      const o = { z, ang: 0, near: 0, surging: false, loop: loopOf('motor', cx, b + 1, z), rate: w }
      let prevAng = 0
      o.update = (dt, t) => {
        const tt = t + offset
        let extra = 0
        let glow = 0
        o.surging = false
        // Reversals: the bar runs one way for R s, shudders, then the other way.
        let spin = w * tt
        let shudder = 0
        if (reverses) {
          const n = Math.floor(tt / R)
          const c = tt - n * R
          spin = w * (n % 2 ? R - c : c)
          if (c > R - 0.45) shudder = 0.05 * Math.sin(c * 70)
          if (c > R - 0.45 && c - dt <= R - 0.45) sfx('creak', cx, b + 1, z, 1)
        }
        if (surges) {
          // Every E s the bar whips round one extra turn in D s; its hub glows first.
          const n = Math.floor(tt / E)
          const c = tt - n * E
          const u = clamp01((c - (E - D)) / D)
          extra = Math.PI * 2 * (n + smooth(u))
          o.surging = u > 0 && u < 1
          if (c > E - D - P.surgeWarn && c < E - D) glow = 0.5 + 0.5 * Math.sin(c * 30)
          if (c > E - D - P.surgeWarn && c - dt <= E - D - P.surgeWarn) sfx('charge', cx, b + 1, z, 1)
          if (o.surging) glow = 1
        }
        capMat.emissiveIntensity = glow * 1.8
        o.ang = dir * (spin + extra) + i + shudder
        hubG.rotation.y = o.ang
        o.rate = dt > 0 ? Math.abs(o.ang - prevAng) / dt : w
        prevAng = o.ang
        o.loop.level = 0.7 + Math.min(0.6, o.rate / 8)
        o.loop.pitch = 0.7 + Math.min(1.8, o.rate / w) * 0.45
      }
      o.test = (pp) => {
        const dx = pp.x - cx
        const dz = pp.z - z
        if (dx * dx + dz * dz > (P.arm + TRUCK_R + OBSTACLE.nearMiss) ** 2) return null
        const tryBar = (ang, isHigh) => {
          const c = Math.cos(ang)
          const sn = Math.sin(ang)
          const along = isHigh ? dx * sn + dz * c : dx * c - dz * sn
          const perp = Math.abs(isHigh ? dx * c - dz * sn : dx * sn + dz * c) - 0.35
          if (Math.abs(along) > P.arm + 0.5) return null
          // Low bar: hits a truck on the ground (hop it). High bar: only a hopping truck.
          const h = pp.y - b
          const touching = isHigh ? h > 0.25 && h + TRUCK_H > P.highBar - 0.25 : h < P.h - 0.15
          if (perp < TRUCK_R * 0.8 && touching) {
            const sgn = -Math.sign(along * dir) || 1
            const k = knock * (o.surging ? 1.45 : 1) * (0.55 + 0.45 * Math.min(1, Math.abs(along) / P.arm))
            const tx = isHigh ? sgn * c : sgn * sn
            const tz = isHigh ? -sgn * sn : sgn * c
            return { hit: true, vx: tx * k, vy: o.surging ? 9 : 6, vz: tz * k, x: pp.x, y: b + (isHigh ? P.highBar : P.h), z: pp.z, power: o.surging ? 1.3 : 0.9, color: '#ffd21a' }
          }
          return perp < TRUCK_R + OBSTACLE.nearMiss && !isHigh ? { near: true, x: pp.x } : null
        }
        const r = tryBar(o.ang, false)
        if (r?.hit || !high) return r
        return tryBar(o.ang, true) ?? r
      }
      ctx.obstacles.push(o)
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * Math.PI * 2 + 0.4
        gear(ctx, cx + Math.cos(a) * 6, b + 1.4, z + Math.sin(a) * 6, s.k, j === 0)
      }
    })
  },

  crusher(ctx, live, s, b, z) {
    const P = OBSTACLE.crusher
    const C = range(P.cycle, s.k)
    P.xs.forEach((x, i) => {
      slammer(ctx, live, s, b, x, z, P.w, P.d, {
        C, offset: (i * C) / P.xs.length + s.k * 0.37, warn: range(P.warn, s.k), fall: P.fall, down: P.down, rise: P.rise,
        fakes: s.k >= P.fakeFrom, doubles: s.k >= P.doubleFrom, lift: P.lift, h: P.h, lethal: lethalAt(s.k), power: 1,
      })
      gear(ctx, x, b + 1.4, z, s.k, i === 1)
    })
  },

  // A row of full-width crushers that slam one after another down the lane:
  // a wave chasing the truck toward the ramp.
  wave(ctx, live, s, b, z) {
    const P = OBSTACLE.wave
    const C = range(P.cycle, s.k)
    const w = (F - 1) * 2
    for (let i = 0; i < P.count; i++) {
      const bz = z + ((P.count - 1) / 2 - i) * P.spacing // first block nearest the stage start
      slammer(ctx, live, s, b, 0, bz, w, P.d, {
        C, offset: -i * P.delay + s.k * 0.53, warn: P.warn, fall: 0.14, down: 0.5, rise: 0.9,
        lift: 8, h: 3, lethal: lethalAt(s.k), power: 0.7,
      })
    }
    gear(ctx, 0, b + 1.4, z, s.k, true)
  },

  // Pile drivers: round rams on a gantry, slamming fast and often.
  pile(ctx, live, s, b, z) {
    const P = OBSTACLE.pile
    const C = range(P.cycle, s.k)
    const W = F - 1.4
    for (const sx of [-1, 1]) {
      block(ctx.statics, M.dark(), sx * W, b, z, 1.4, 12.5, 1.4)
      solid(sx * W, 0, z, 1.4, 12.5, 1.4)
    }
    box(ctx.statics, M.hazard(), 0, b + 12.5, z, W * 2 + 1.4, 1.2, 2)
    P.xs.forEach((x, i) => {
      slammer(ctx, live, s, b, x, z, P.r * 2, P.r * 2, {
        C, offset: i * C * 0.37 + s.k * 0.2, warn: P.warn, fall: 0.09, down: 0.25, rise: 0.6,
        lift: 6.5, h: 3, lethal: lethalAt(s.k), power: 0.8, round: true,
      })
      gear(ctx, x + (i % 2 ? 4 : -4), b + 1.4, z, s.k, i === 2)
    })
  },

  piston(ctx, live, s, b, z) {
    const C = range(OBSTACLE.piston.cycle, s.k)
    for (const side of [-1, 1]) piston(ctx, live, s, b, z, side, side > 0 ? C / 2 : 0, OBSTACLE.piston.d)
  },
  // Four pistons in a row, left / right / left / right, firing in sequence.
  pistons4(ctx, live, s, b, z) {
    const C = range(OBSTACLE.piston.cycle, s.k)
    for (let i = 0; i < 4; i++) piston(ctx, live, s, b, z + (1.5 - i) * 4.5, i % 2 ? 1 : -1, (i * C) / 4, 4)
  },

  // A giant mallet hinged at each lane edge: upright, it shakes and its slam
  // spot darkens, then it whips over and flattens the lane (a crush), sending
  // a shockwave out from the impact. The two take turns.
  mallet(ctx, live, s, b, z) {
    const P = OBSTACLE.mallet
    const C = range(P.cycle, s.k)
    const Wh = F - 1 // hinge |x|
    const lethal = lethalAt(s.k)
    const up = Math.max(0.2, C - P.warn - P.slam - P.down - P.rise)
    for (const side of [-1, 1]) {
      const zz = z + side * 2.6
      const hy = b + P.headR
      block(ctx.statics, M.dark(), side * (Wh + 0.6), b, zz, 2.4, P.headR + 0.6, 3.2)
      solid(side * (Wh + 0.6), 0, zz, 2.4, P.headR + 0.6, 3.2)
      const pivot = new Group()
      pivot.position.set(side * Wh, hy, zz)
      live.add(pivot)
      rod(pivot, M.wood(), [0, 0, 0], [0, P.len - P.headR * 0.8, 0], 0.32, G.cyl8)
      const headMat = new MeshStandardMaterial({ color: '#b8202e', roughness: 0.45, emissive: '#ff1a1a', emissiveIntensity: 0 })
      const head = mesh(pivot, G.cyl, headMat, 0, P.len, 0, P.headR, P.headLen, P.headR)
      head.rotation.x = Math.PI / 2
      for (const e of [-1, 1]) {
        const band = mesh(pivot, G.cyl, M.iron(), 0, P.len, e * (P.headLen / 2 - 0.25), P.headR * 1.06, 0.5, P.headR * 1.06)
        band.rotation.x = Math.PI / 2
      }
      const sx = side * (Wh - P.len) // where the head lands
      const shadowMat = new MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: 0, depthWrite: false, ...decal })
      floorPlane(live, shadowMat, sx, b + 0.05, zz, P.headR * 3.2, P.headLen * 1.3)
      const offset = side > 0 ? C / 2 : 0
      const o = { z: zz, a: 0, phase: 'up', near: 0, slam: false, slamAt: { x: sx, y: b, z: zz, w: P.headR * 2, d: P.headLen } }
      o.update = (dt, t) => {
        let c = (t + offset + s.k * 0.4) % C
        let a = 0
        let shake = 0
        let glow = 0
        let phase = 'up'
        if (c < up) {
          phase = 'up'
        } else if ((c -= up) < P.warn) {
          phase = 'warn'
          shake = 0.06 * (c / P.warn)
          glow = (c / P.warn) * (0.6 + 0.4 * Math.sin(c * 35))
        } else if ((c -= P.warn) < P.slam) {
          phase = 'slam'
          a = (Math.PI / 2) * (c / P.slam) ** 2
          glow = 1
        } else if ((c -= P.slam) < P.down) {
          phase = 'down'
          a = Math.PI / 2
        } else {
          phase = 'rise'
          a = (Math.PI / 2) * (1 - smooth(clamp01((c - P.down) / P.rise)))
        }
        if (phase === 'warn' && o.phase !== 'warn') sfx('creak', side * Wh, hy + P.len * 0.6, zz, 1.2)
        if (phase === 'slam' && o.phase !== 'slam') sfx('whoosh', sx, b + 6, zz, 1.2)
        o.slam = o.phase === 'slam' && phase === 'down'
        if (o.slam) sfx('smash', sx, b + 0.5, zz, 1.2)
        o.phase = phase
        o.a = a
        pivot.rotation.z = side * a + (Math.random() - 0.5) * shake
        headMat.emissiveIntensity = glow * 1.6
        shadowMat.opacity = phase === 'warn' ? 0.25 + 0.6 * glow : phase === 'slam' ? 0.9 : phase === 'down' ? 0.5 : 0.15
      }
      o.test = (pp) => {
        const hx = side * Wh - side * P.len * Math.sin(o.a)
        const hyy = hy + P.len * Math.cos(o.a)
        const dz = Math.abs(pp.z - zz) - P.headLen / 2
        // The shockwave on impact: everything near is blasted outward.
        if (o.slam) {
          const d = Math.hypot(pp.x - sx, pp.z - zz)
          if (d < P.shock && pp.y - b < 3 && d > P.headR + TRUCK_R) {
            const ux = (pp.x - sx) / (d || 1)
            const uz = (pp.z - zz) / (d || 1)
            const f = 1 - d / P.shock
            return { hit: true, shock: true, vx: ux * P.shockKnock * (0.5 + f), vy: 5 + 5 * f, vz: uz * P.shockKnock * (0.5 + f), x: sx, y: b + 0.5, z: zz, power: 0.8 + f, color: '#8a5a32' }
          }
        }
        if (dz > TRUCK_R) return null
        const d = Math.hypot(hx - pp.x, hyy - (pp.y + TRUCK_H / 2)) - P.headR
        if (d < TRUCK_R * 0.9) {
          if (o.phase === 'slam' || o.slam) return { squash: true, lethal, stun: 1.2, x: pp.x, y: b + 0.5, z: pp.z }
          if (o.phase === 'down') return { wall: true, vx: Math.sign(pp.x - hx) * 9, vz: 0 }
        }
        return o.phase === 'slam' && d < TRUCK_R + OBSTACLE.nearMiss ? { near: true, x: hx } : null
      }
      ctx.obstacles.push(o)
      gear(ctx, sx, b + 1.4, zz, s.k, true)
    }
  },

  // Wrecking balls on chains from a tall gantry, swinging along the lane
  // (toward / away from the truck): dodge sideways. A hit throws the truck
  // backward and toward the open edge.
  wreck(ctx, live, s, b, z) {
    const P = OBSTACLE.wreck
    const T = range(P.period, s.k)
    const W = F - 1.4
    for (const sx of [-1, 1]) {
      block(ctx.statics, M.dark(), sx * W, b, z, 1.4, P.pivot + 1, 1.4)
      solid(sx * W, 0, z, 1.4, P.pivot + 1, 1.4)
    }
    box(ctx.statics, M.hazard(), 0, b + P.pivot + 0.5, z, W * 2 + 1.4, 1.2, 1.6)
    P.xs.forEach((x, i) => {
      const pivot = new Group()
      pivot.position.set(x, b + P.pivot, z)
      live.add(pivot)
      rod(pivot, M.iron(), [0, 0, 0], [0, -P.chain + P.ballR, 0], 0.16, G.cyl8)
      mesh(pivot, G.sphere, M.iron(), 0, -P.chain, 0, P.ballR, P.ballR, P.ballR)
      mesh(pivot, G.cyl, M.red(), 0, -P.chain, 0, P.ballR * 1.02, 0.6, P.ballR * 1.02)
      const phase = i * Math.PI + s.k
      const o = { z, theta: 0, omega: 0, near: 0, reach: P.chain * Math.sin(P.amp) + P.ballR }
      o.update = (dt, t) => {
        const a = (Math.PI * 2 * t) / T + phase
        const th = P.amp * Math.sin(a)
        if (Math.sign(th) !== Math.sign(o.theta)) sfx('heavyWhoosh', x, b + 3, z, 1)
        o.theta = th
        o.omega = Math.cos(a)
        pivot.rotation.x = th
      }
      o.test = (pp) => {
        const bz = z - P.chain * Math.sin(o.theta)
        const by = b + P.pivot - P.chain * Math.cos(o.theta)
        const d = Math.hypot(x - pp.x, by - (pp.y + TRUCK_H / 2), bz - pp.z) - P.ballR
        if (d < TRUCK_R) {
          const vz = -Math.sign(o.omega) || 1 // the ball's direction along the lane
          const away = Math.sign(pp.x - x) || (i ? 1 : -1)
          const k = 0.5 + 0.5 * Math.abs(o.omega)
          return { hit: true, vx: away * P.side * k, vy: P.lift * k, vz: vz * P.knock * k, x, y: by, z: bz, power: 0.8 + k, color: '#3a3f4a' }
        }
        return d < TRUCK_R + OBSTACLE.nearMiss ? { near: true, x } : null
      }
      ctx.obstacles.push(o)
      gear(ctx, x, b + 1.4, z, s.k, i === 0)
    })
  },

  // Spiked logs that drop in at the far end and roll down the lane at you.
  logs(ctx, live, s, b, z) {
    const P = OBSTACLE.logs
    const speed = range(P.speed, s.k)
    const z0 = z - FOOT.logs / 2 + 2 // drop-in point (far end)
    const z1 = z + FOOT.logs / 2 - 2 // where they sink away
    const run = (z1 - z0) / speed
    const T = run + P.pause
    P.xs.forEach((x, i) => {
      const g = new Group()
      live.add(g)
      const logM = mesh(g, G.cyl, M.log(), 0, 0, 0, P.r, P.len, P.r)
      logM.rotation.z = Math.PI / 2
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2 + j
        const sx = -P.len / 2 + 1 + ((j * 7) % 10) * ((P.len - 2) / 9)
        const sp = mesh(g, G.cone, M.iron(), sx, Math.sin(a) * P.r, Math.cos(a) * P.r, 0.22, 0.6, 0.22)
        sp.rotation.x = Math.PI / 2 - a
      }
      for (const e of [-1, 1]) mesh(g, G.cyl, mat('#c9955a', { roughness: 0.8 }), e * (P.len / 2 + 0.02), 0, 0, P.r * 0.95, 0.05, P.r * 0.95).rotation.z = Math.PI / 2
      const offset = (i * T) / P.xs.length + s.k * 0.7
      const o = { z, lz: z0, lx: x, live: false, near: 0, reach: FOOT.logs / 2, loop: loopOf('rumble', x, b + 1, z) }
      o.update = (dt, t) => {
        const c = (t + offset) % T
        const was = o.live
        o.live = c < run
        if (o.live && !was) sfx('thud', x, b + 1, z0, 1)
        const u = c / run
        o.lz = z0 + (z1 - z0) * Math.min(1, u)
        // Drops in from above, sinks out at the end.
        const y = c < 0.25 ? P.r + (0.25 - c) * 14 : c > run ? P.r - (c - run) * 6 : P.r
        g.position.set(x, b + y, o.lz)
        g.visible = c < run + 0.5
        g.rotation.x = (o.lz - z0) / P.r
        o.loop.x = x
        o.loop.z = o.lz
        o.loop.level = o.live ? 1 : 0
      }
      o.test = (pp) => {
        if (!o.live) return null
        const dz = Math.abs(pp.z - o.lz) - P.r
        const dx = Math.abs(pp.x - x) - P.len / 2
        if (dz > TRUCK_R || dx > TRUCK_R * 0.6 || pp.y - b > P.r * 2) return dz < TRUCK_R + OBSTACLE.nearMiss && dx < TRUCK_R + OBSTACLE.nearMiss ? { near: true, x } : null
        return { hit: true, vx: Math.sign(pp.x - x) * 7, vy: 7, vz: speed + P.knock, x: pp.x, y: b + P.r, z: o.lz, power: 1.1, color: '#6b4224' }
      }
      ctx.obstacles.push(o)
    })
    for (let i = 0; i < 4; i++) gear(ctx, (i % 2 ? 1 : -1) * 7.5, b + 1.4, z - 18 + i * 12, s.k, i === 3)
  },

  // Side cannons firing iron balls across the lane: listen for the fuse.
  cannon(ctx, live, s, b, z) {
    const P = OBSTACLE.cannon
    const C = range(P.cycle, s.k)
    const speed = range(P.speed, s.k)
    const knock = range(P.knock, s.k)
    ;[-6, 0, 6].forEach((dz, i) => {
      const side = i % 2 ? 1 : -1
      const cz = z + dz
      const cx = side * (F - 0.5)
      block(ctx.statics, M.wood(), cx, b, cz, 2.4, 1.0, 2.6)
      solid(cx, 0, cz, 2.4, 1.6, 2.6)
      const barrelMat = new MeshStandardMaterial({ color: '#2a2e36', roughness: 0.35, metalness: 0.7, emissive: '#ff4a1a', emissiveIntensity: 0 })
      const barrel = mesh(live, G.cyl, barrelMat, cx - side * 0.6, b + 1.6, cz, 0.75, 3.2, 0.75)
      barrel.rotation.z = Math.PI / 2
      for (const e of [-1, 1]) mesh(live, G.cyl, M.wood(), cx + 0.2 * side, b + 0.8, cz + e * 1.1, 0.8, 0.25, 0.8).rotation.x = Math.PI / 2
      const ball = mesh(live, G.sphere, M.iron(), cx, b + 1.4, cz, P.ballR, P.ballR, P.ballR)
      ball.visible = false
      const offset = (i * C) / 3 + s.k * 0.45
      const flightT = (2 * F + 6) / speed
      const o = { z: cz, near: 0, phase: 'idle', bx: cx, flying: false }
      o.update = (dt, t) => {
        const c = (t + offset) % C
        const fireAt = C - flightT - 0.05
        let phase = 'idle'
        if (c > fireAt - P.warn && c < fireAt) phase = 'warn'
        else if (c >= fireAt) phase = 'fly'
        if (phase === 'warn' && o.phase !== 'warn') sfx('fuse', cx, b + 1.6, cz, 1)
        if (phase === 'fly' && o.phase !== 'fly') {
          sfx('boom', cx, b + 1.6, cz, 1)
          sfx('whistle', 0, b + 1.6, cz, 0.8)
          o.fired = true // main: muzzle smoke
        } else o.fired = false
        o.phase = phase
        barrelMat.emissiveIntensity = phase === 'warn' ? 0.6 + 0.6 * Math.sin(c * 30) : 0
        barrel.position.x = cx - side * 0.6 + (phase === 'fly' && c - fireAt < 0.15 ? side * 0.6 : 0) // recoil
        o.flying = phase === 'fly'
        o.bx = cx - side * speed * (c - fireAt)
        ball.visible = o.flying
        ball.position.set(o.bx, b + 1.4, cz)
      }
      o.muzzle = { x: cx - side * 2.2, y: b + 1.6, z: cz, dir: -side }
      o.test = (pp) => {
        if (!o.flying) return null
        const d = Math.hypot(pp.x - o.bx, pp.y + TRUCK_H / 2 - (b + 1.4), pp.z - cz) - P.ballR
        if (d < TRUCK_R) return { hit: true, vx: -side * knock, vy: 8, vz: 0, x: o.bx, y: b + 1.4, z: cz, power: 1.3, color: '#2a2e36' }
        return d < TRUCK_R + OBSTACLE.nearMiss ? { near: true, x: o.bx } : null
      }
      ctx.obstacles.push(o)
    })
    gear(ctx, 0, b + 1.4, z - 3, s.k, true)
    gear(ctx, 0, b + 1.4, z + 3, s.k)
  },

  // A cluster of pinball bumpers that fire the truck away.
  bumpers(ctx, live, s, b, z) {
    for (const [x, dz] of OBSTACLE.bumpers.layout) bumper(ctx, live, s, b, x, z + dz)
    gear(ctx, 3, b + 1.4, z, s.k, true)
  },

  // The grinder: the lane pinches to a channel between two spiked rollers
  // turning inward. Touch one and you're pulled in.
  grinder(ctx, live, s, b, z) {
    const P = OBSTACLE.grinder
    const L = FOOT.grinder - 2
    const wallW = F - P.wallX
    for (const side of [-1, 1]) {
      const wx = side * (P.wallX + wallW / 2)
      block(ctx.statics, M.hazard(), wx, b, z, wallW, 2.6, L)
      solid(wx, 0, z, wallW, 2.6, L)
    }
    const rollers = []
    for (const side of [-1, 1]) {
      const g = new Group()
      g.position.set(side * P.rollerX, b + P.r + 0.1, z)
      live.add(g)
      const cyl = mesh(g, G.cyl, M.iron(), 0, 0, 0, P.r, L, P.r)
      cyl.rotation.x = Math.PI / 2
      for (let j = 0; j < 18; j++) {
        const a = (j / 6) * Math.PI * 2
        const sp = mesh(g, G.cone, M.steel(), Math.cos(a) * P.r, Math.sin(a) * P.r, -L / 2 + 1 + (j % 6) * ((L - 2) / 5), 0.25, 0.7, 0.25)
        sp.rotation.z = a - Math.PI / 2
      }
      rollers.push({ g, side })
    }
    const lethal = lethalAt(s.k)
    const o = { z, near: 0, loop: loopOf('grind', 0, b + 1.2, z) }
    o.loop.level = 1
    o.update = (dt) => {
      for (const r of rollers) r.g.rotation.z += -r.side * P.spin * dt
    }
    o.test = (pp) => {
      if (Math.abs(pp.z - z) > L / 2 + 0.5 || pp.y - b > P.r * 2 + 0.5) return null
      const gapEdge = P.rollerX - P.r // |x| of the roller surfaces
      if (Math.abs(pp.x) + TRUCK_R * 0.85 > gapEdge && Math.abs(pp.x) < P.wallX) return { squash: true, lethal, stun: 1, x: pp.x, y: b + 1, z: pp.z, grind: true }
      return Math.abs(pp.x) + TRUCK_R + 0.6 > gapEdge ? { near: true, x: Math.sign(pp.x) * gapEdge } : null
    }
    ctx.obstacles.push(o)
    for (let i = 0; i < 3; i++) gear(ctx, 0, b + 1.4, z - 4 + i * 4, s.k, i === 1)
  },

  // Saw blades that pop up out of floor slots in a moving pattern.
  blades(ctx, live, s, b, z) {
    const P = OBSTACLE.blades
    const w = range(P.speed, s.k)
    const bladeGeo = G.cyl
    for (const [row, dz] of P.rows.entries()) {
      for (const [col, x] of P.cols.entries()) {
        const bz = z + dz
        box(live, M.dark(), x, b + 0.02, bz, 0.5, 0.04, P.r * 2 + 0.4, false)
        const g = new Group()
        g.position.set(x, b - P.r, bz)
        live.add(g)
        const disc = mesh(g, bladeGeo, M.steel(), 0, 0, 0, P.r, 0.12, P.r)
        disc.rotation.z = Math.PI / 2
        for (let j = 0; j < 8; j++) {
          const a = (j / 8) * Math.PI * 2
          const tooth = mesh(g, G.cone, M.white(), 0, Math.sin(a) * P.r, Math.cos(a) * P.r, 0.12, 0.35, 0.12)
          tooth.rotation.x = Math.PI / 2 - a
        }
        const o = { z: bz, u: 0, near: 0 }
        o.update = (dt, t) => {
          const up = Math.sin(t * w - row * 1.3 - col * 0.9) > 0.35
          const target = up ? 1 : 0
          const was = o.u
          o.u += (target - o.u) * Math.min(1, dt * 10)
          if (was < 0.3 && o.u >= 0.3 && Math.random() < 0.6) sfx('shing', x, b + 1, bz, 0.9)
          g.position.y = b - P.r + o.u * (P.r * 2 - 0.6)
          g.rotation.x += dt * 22
        }
        o.test = (pp) => {
          if (o.u < 0.5 || pp.y - b > o.u * (P.r * 2 - 0.6) - 0.2) return null
          if (Math.abs(pp.x - x) > 0.3 + TRUCK_R || Math.abs(pp.z - bz) > P.r + TRUCK_R * 0.7) return null
          return { hit: true, blade: true, vx: Math.sign(pp.x - x || 1) * 6, vy: 6, vz: 12, x, y: b + 1, z: bz, power: 0.9, color: '#d5dbe3' }
        }
        ctx.obstacles.push(o)
      }
    }
    // One saw loop for the field, louder the more blades are up.
    const field = ctx.obstacles.slice(-P.rows.length * P.cols.length)
    const o = { z, near: 0, loop: loopOf('saw', 0, b + 0.8, z), test: () => null }
    o.update = () => {
      o.loop.level = field.reduce((a, f) => a + f.u, 0) / field.length + 0.15
    }
    ctx.obstacles.push(o)
    gear(ctx, 0, b + 1.4, z, s.k, true)
  },

  // A wind cannon at one edge: it spins up, then blasts the lane toward the open side.
  wind(ctx, live, s, b, z) {
    const P = OBSTACLE.wind
    const C = range(P.cycle, s.k)
    const accel = range(P.accel, s.k)
    const side = s.k % 2 ? -1 : 1 // the fan's side; it blows toward -side
    const fx = side * (F - 0.2)
    block(ctx.statics, M.dark(), fx + side * 0.8, b, z, 2.4, 1.2, 9)
    solid(fx + side * 0.8, 0, z, 2.4, 1.2, 9)
    const ring = mesh(live, new TorusGeometry(4, 0.45, 10, 32), M.hazard(), fx, b + 5.2, z)
    ring.rotation.y = Math.PI / 2
    const rotor = new Group()
    rotor.position.set(fx, b + 5.2, z)
    live.add(rotor)
    for (let j = 0; j < 4; j++) {
      const blade = box(rotor, M.steel(), 0, 0, 0, 0.2, 3.6, 1.2)
      blade.position.set(0, Math.cos((j / 4) * Math.PI * 2) * 1.9, Math.sin((j / 4) * Math.PI * 2) * 1.9)
      blade.rotation.x = (j / 4) * Math.PI * 2
    }
    mesh(rotor, G.sphere, M.red(), 0, 0, 0, 0.8, 0.8, 0.8)
    const o = { z, near: 0, phase: 'idle', blowing: false, dir: -side, loop: loopOf('fan', fx, b + 5, z) }
    let spin = 0
    o.update = (dt, t) => {
      const c = (t + s.k * 0.9) % C
      const blowAt = C - P.blast - P.down
      let phase = 'idle'
      let rate = 2
      if (c > blowAt - P.spinUp && c < blowAt) {
        phase = 'spinup'
        rate = 2 + 22 * ((c - (blowAt - P.spinUp)) / P.spinUp)
      } else if (c >= blowAt && c < blowAt + P.blast) {
        phase = 'blast'
        rate = 26
      } else if (c >= blowAt + P.blast) {
        phase = 'down'
        rate = 26 * (1 - (c - blowAt - P.blast) / P.down)
      }
      if (phase === 'blast' && o.phase !== 'blast') sfx('gust', 0, b + 2, z, 1.2)
      o.phase = phase
      o.blowing = phase === 'blast'
      spin += rate * dt
      rotor.rotation.x = spin
      o.loop.level = 0.25 + Math.min(1, rate / 26) * 0.9
      o.loop.pitch = 0.6 + rate / 30
    }
    o.test = (pp) => {
      if (!o.blowing || Math.abs(pp.z - z) > P.len / 2 || pp.y - b > 8) return null
      return { push: true, ax: o.dir * accel, x: pp.x, y: pp.y + 1, z: pp.z }
    }
    ctx.obstacles.push(o)
    floorPlane(live, chevronMat(`wind${-side}`, 'rgba(255,255,255,0.55)', 'rgba(0,0,0,0)', 4, 1, true), 0, b + 0.04, z, (F - 1) * 2, P.len, side > 0 ? Math.PI / 2 : -Math.PI / 2).material.transparent = true
    gear(ctx, -side * 16, b + 1.4, z, s.k, true)
  },

  // Water geysers in floor grates: bubbles, then a jet that throws the truck up.
  geyser(ctx, live, s, b, z) {
    const P = OBSTACLE.geyser
    const C = range(P.cycle, s.k)
    const lift = range(P.lift, s.k)
    const order = [0, 2, 1, 3]
    P.xs.forEach((x, i) => {
      const grateMat = new MeshStandardMaterial({ color: '#3a4157', roughness: 0.5, metalness: 0.5, emissive: '#2ad8ff', emissiveIntensity: 0 })
      mesh(live, G.cyl, grateMat, x, b + 0.04, z, P.r, 0.08, P.r, false)
      const col = mesh(live, G.cyl, M.water(), x, b, z, P.r * 0.8, 1, P.r * 0.8, false)
      col.visible = false
      const offset = (order[i] * C) / 4 + s.k * 0.3
      const o = { z, near: 0, phase: 'idle', x, y: b }
      o.update = (dt, t) => {
        const c = (t + offset) % C
        const burstAt = C - P.burst
        let phase = 'idle'
        if (c > burstAt - P.warn && c < burstAt) phase = 'warn'
        else if (c >= burstAt) phase = 'burst'
        if (phase === 'warn' && o.phase !== 'warn') sfx('bubble', x, b + 0.5, z, 1)
        if (phase === 'burst' && o.phase !== 'burst') sfx('geyser', x, b + 3, z, 1)
        o.started = phase === 'burst' && o.phase !== 'burst' // main: spray
        o.bubbling = phase === 'warn'
        o.phase = phase
        grateMat.emissiveIntensity = phase === 'warn' ? 0.5 + 0.5 * Math.sin(c * 25) : phase === 'burst' ? 1.2 : 0
        col.visible = phase === 'burst'
        if (col.visible) {
          const h = P.height * Math.min(1, (c - burstAt) / 0.15) * (1 - Math.max(0, (c - burstAt - P.burst + 0.2) / 0.2))
          col.scale.y = Math.max(0.1, h)
          col.position.y = b + col.scale.y / 2
        }
      }
      o.test = (pp) => {
        if (o.phase !== 'burst' || pp.y - b > 3) return null
        if (Math.hypot(pp.x - x, pp.z - z) > P.r + TRUCK_R * 0.7) return null
        const side = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6)
        return { hit: true, geyser: true, vx: side, vy: lift, vz: 0, x, y: b + 1, z, power: 0.7, color: '#8fe6ff' }
      }
      ctx.obstacles.push(o)
    })
    gear(ctx, 0, b + 5, z, s.k, true)
  },

  // A rope bridge over a hole in the island: each plank cracks, wobbles and
  // drops a moment after the truck touches it, then comes back later.
  bridge(ctx, live, s, b, z) {
    const P = OBSTACLE.bridge
    const L = HOLES.bridge
    const n = Math.round(L / P.plank)
    const planks = []
    for (let i = 0; i < n; i++) {
      const pz = z + L / 2 - (i + 0.5) * (L / n)
      const m = box(live, M.planks(), 0, b - 0.18, pz, P.half * 2, 0.36, L / n - 0.12)
      planks.push({ m, z: pz, state: 'ok', t: 0, vy: 0, col: boxCollider(0, b - 0.18, pz, P.half, 0.18, (L / n - 0.12) / 2), spin: 0 })
    }
    // Rope rails and posts.
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= 4; i++) mesh(live, G.cyl8, M.wood(), sx * (P.half + 0.2), b + 0.6, z + L / 2 - (i * L) / 4, 0.14, 1.6, 0.14)
      rod(live, M.rope(), [sx * (P.half + 0.2), b + 1.25, z + L / 2], [sx * (P.half + 0.2), b + 1.25, z - L / 2], 0.06)
    }
    const o = { z, near: 0, reach: L / 2 }
    o.update = (dt) => {
      for (const p of planks) {
        if (p.state === 'crack') {
          p.t += dt
          p.m.position.y = b - 0.18 + (Math.random() - 0.5) * 0.08
          p.m.rotation.z = (Math.random() - 0.5) * 0.06
          if (p.t > P.wobble) {
            p.state = 'fall'
            p.t = 0
            p.vy = 0
            p.spin = (Math.random() - 0.5) * 3
            dropCollider(p.col)
            p.col = null
            sfx('fall', 0, b - 1, p.z, 0.8)
          }
        } else if (p.state === 'fall') {
          p.t += dt
          p.vy -= 22 * dt
          p.m.position.y += p.vy * dt
          p.m.rotation.x += p.spin * dt
          if (p.t > 1.5) p.m.visible = false
          if (p.t > P.back) {
            p.state = 'ok'
            p.m.visible = true
            p.m.position.y = b - 0.18
            p.m.rotation.set(0, 0, 0)
            p.col = boxCollider(0, b - 0.18, p.z, P.half, 0.18, (L / n - 0.12) / 2)
          }
        }
      }
    }
    o.test = (pp) => {
      if (Math.abs(pp.x) > P.half + 1 || Math.abs(pp.y - b) > 0.8) return null
      for (const p of planks) {
        if (p.state === 'ok' && Math.abs(pp.z - p.z) < L / n / 2 + 1.2) {
          p.state = 'crack'
          p.t = 0
          sfx('crack', 0, b, p.z, 1)
        }
      }
      return null
    }
    ctx.obstacles.push(o)
    for (let i = 0; i < 3; i++) gear(ctx, 0, b + 1.4, z - 6 + i * 6, s.k, i === 1)
  },

  // Trapdoors over a hole: panels flip open in a pattern (red light first).
  trapdoor(ctx, live, s, b, z) {
    const P = OBSTACLE.trapdoor
    const C = range(P.cycle, s.k)
    const L = HOLES.trapdoor
    const W = STAGES.half
    const cols = 4
    const dw = (W * 2) / cols
    const dd = L / 2
    let idx = 0
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -W + dw * (c + 0.5)
        const hingeZ = z + (r === 0 ? L / 2 : -L / 2) // hinged at the hole's outer edges
        const dzDir = r === 0 ? -1 : 1
        const pivot = new Group()
        pivot.position.set(x, b, hingeZ)
        live.add(pivot)
        const panelMat = new MeshStandardMaterial({ color: '#5a6274', roughness: 0.45, metalness: 0.5, emissive: '#ff2a1a', emissiveIntensity: 0 })
        box(pivot, panelMat, 0, -0.2, dzDir * (dd / 2), dw - 0.15, 0.4, dd - 0.15)
        box(pivot, M.hazardFloor(), 0, 0.01, dzDir * (dd / 2), dw - 1.2, 0.02, 0.6, false)
        const cz = hingeZ + dzDir * (dd / 2)
        const mk = () => boxCollider(x, b - 0.2, cz, dw / 2 - 0.08, 0.2, dd / 2 - 0.08)
        const d = { col: mk(), phase: 'closed', open: 0 }
        // Pattern: doors open in a checker that walks across, so a path always exists.
        const offset = ((idx * 3) % 8) * (C / 8) + r * (C / 2) + s.k * 0.17
        idx++
        const o = { z: cz, near: 0, reach: 4 }
        o.update = (dt, t) => {
          const cc = (t + offset) % C
          const openAt = C - P.openTime - P.close
          let phase = 'closed'
          if (cc > openAt - P.warn && cc < openAt) phase = 'warn'
          else if (cc >= openAt && cc < openAt + P.openTime) phase = 'open'
          else if (cc >= openAt + P.openTime) phase = 'closing'
          if (phase !== d.phase) {
            if (phase === 'warn') sfx('alarm', x, b + 0.5, cz, 0.8)
            if (phase === 'open') {
              dropCollider(d.col)
              d.col = null
              sfx('clang', x, b, cz, 0.8)
            }
            if (phase === 'closed' && !d.col) d.col = mk()
          }
          d.phase = phase
          const target = phase === 'open' ? 1 : 0
          d.open += (target - d.open) * Math.min(1, dt * (phase === 'open' ? 14 : 5))
          pivot.rotation.x = dzDir * d.open * (Math.PI / 2)
          panelMat.emissiveIntensity = phase === 'warn' ? 0.5 + 0.5 * Math.sin(cc * 28) : 0
        }
        o.test = () => null
        ctx.obstacles.push(o)
      }
    }
    for (let i = 0; i < 4; i++) gear(ctx, -21 + i * 14, b + 1.4, z, s.k, i === 2)
  },

  // The island narrows to a strip with sea on both sides, with bumpers in it.
  narrow(ctx, live, s, b, z) {
    const P = OBSTACLE.narrow
    for (const [x, dz] of P.bumpers) bumper(ctx, live, s, b, x, z + dz, 1.5)
    for (const side of [-1, 1]) edgeCurb(live, b, side, z + FOOT.narrow / 2, z - FOOT.narrow / 2, P.half)
    for (let i = 0; i < 5; i++) gear(ctx, (i % 2 ? 1 : -1) * 4, b + 1.4, z - 16 + i * 8, s.k, i === 4)
  },

  ice(ctx, live, s, b, z) {
    const P = OBSTACLE.ice
    const w = (F - 0.6) * 2
    floorPlane(live, M.ice(), 0, b + 0.03, z, w, P.len)
    createSparkleField(live, { x: 0, y: b + 0.1, z, w, d: P.len, height: 1.2, count: 24, color: '#e8fbff', size: 0.35, seed: s.k * 7 })
    ctx.surfaces.push({ type: 'ice', x0: -w / 2, x1: w / 2, z0: z - P.len / 2, z1: z + P.len / 2, y: b, grip: P.grip })
    for (let i = 0; i < 5; i++) gear(ctx, -16 + i * 8, b + 1.4, z + (i % 2 ? 6 : -6), s.k)
  },

  mud(ctx, live, s, b, z) {
    const P = OBSTACLE.mud
    const side = s.k % 2 ? -1 : 1
    const x = side * (F - 0.6 - P.w / 2)
    floorPlane(live, M.mud(), x, b + 0.03, z, P.w, P.len)
    ctx.surfaces.push({ type: 'mud', x0: x - P.w / 2, x1: x + P.w / 2, z0: z - P.len / 2, z1: z + P.len / 2, y: b, top: P.top })
    for (let i = 0; i < 4; i++) gear(ctx, x + (i - 1.5) * 5, b + 1.4, z, s.k, i === 2)
  },

  conveyor(ctx, live, s, b, z) {
    const P = OBSTACLE.conveyor
    const dir = s.k % 2 ? 1 : -1 // +1 pushes east
    const w = (F - 0.6) * 2
    floorPlane(live, chevronMat(`belt${dir}`, '#ffd21a', '#2a2f3c', 3, 9, false), 0, b + 0.03, z, w, P.len, dir > 0 ? -Math.PI / 2 : Math.PI / 2)
    for (const e of [-1, 1]) {
      const roller = mesh(live, G.cyl, M.steel(), 0, b + 0.25, z + e * (P.len / 2 + 0.3), 0.3, w, 0.3)
      roller.rotation.z = Math.PI / 2
    }
    // With open edges the belt runs right off the island: the whole plateau width.
    const W = s.k >= OBSTACLE.edgesFrom ? STAGES.half + 2 : w / 2
    ctx.surfaces.push({ type: 'conveyor', x0: -W, x1: W, z0: z - P.len / 2, z1: z + P.len / 2, y: b, belt: dir * P.push })
    const o = { z, near: 0, loop: loopOf('belt', 0, b + 0.5, z), update() {}, test: () => null }
    o.loop.level = 1
    ctx.obstacles.push(o)
    gear(ctx, -dir * 18, b + 1.4, z, s.k, true)
  },

  bounce(ctx, live, s, b, z) {
    const P = OBSTACLE.bounce
    const x = ((s.k * 7 + Math.round(z)) % 3 - 1) * 12
    block(live, M.dark(), x, b, z, P.w + 0.8, 0.12, P.len + 0.8, false)
    block(live, glowMat('#2ad8ff', 1.5), x, b + 0.12, z, P.w, 0.05, P.len, false)
    const ring = mesh(live, new TorusGeometry(2.4, 0.18, 8, 32), neon('#8ff4ff', 1.8, { transparent: true, depthWrite: false }), x, b + 0.5, z, 1, 1, 1, false)
    ring.rotation.x = Math.PI / 2
    const o = { z, near: 0, update: (dt, t) => {
      const u = (t * 0.9) % 1
      ring.position.y = b + 0.4 + u * 4
      ring.scale.setScalar(1 - u * 0.5)
      ring.material.opacity = 1 - u
    }, test: () => null }
    ctx.obstacles.push(o)
    ctx.surfaces.push({ type: 'bounce', x0: x - P.w / 2, x1: x + P.w / 2, z0: z - P.len / 2, z1: z + P.len / 2, y: b, launch: P.launch })
    // A hoop of gears up where the bounce peaks.
    for (let i = 0; i < 5; i++) gear(ctx, x, b + 4.6, z - 4 - i * 2.4, s.k, i === 4)
  },

  booster(ctx, live, s, b, z) {
    const P = OBSTACLE.booster
    const x = ((s.k + Math.round(z / 7)) % 3 - 1) * 13
    block(live, M.dark(), x, b, z, P.w + 0.8, 0.05, P.len + 0.8, false)
    floorPlane(live, chevronMat('boost', '#ff9a1a', '#ffe14a', 1, 2, true), x, b + 0.08, z, P.w, P.len)
    ctx.surfaces.push({ type: 'booster', x0: x - P.w / 2, x1: x + P.w / 2, z0: z - P.len / 2, z1: z + P.len / 2, y: b })
  },
}

// --- The system main.js drives -----------------------------------------------------
export function createObstacles(ctx) {
  const obstacles = ctx.obstacles ?? []
  const surfaces = ctx.surfaces ?? []
  const groups = ctx.obstacleGroups ?? []
  const loopList = []
  const out = []
  return {
    obstacles,
    surfaces,
    // Animates only the stages near the player and hides far ones.
    update(dt, t, pz) {
      for (const g of groups) g.group.visible = pz < g.zMax + 380 && pz > g.zMin - 120
      for (const o of obstacles) if (Math.abs(o.z - pz) < 400) o.update(dt, t)
      for (const sc of scrolling) sc.t.offset.y = (sc.t.offset.y - dt * sc.speed) % 1
    },
    surfaceAt(x, y, z) {
      for (const s of surfaces) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && Math.abs(y - s.y) < 1) return s
      return null
    },
    // Hits / walls / pushes / near misses for the truck's feet position pp.
    test(pp, dt) {
      out.length = 0
      for (const o of obstacles) {
        o.near = Math.max(0, o.near - dt)
        if (Math.abs(o.z - pp.z) > 16 + (o.reach ?? 0)) continue
        const r = o.test(pp)
        if (!r) continue
        if (r.near) {
          if (o.near > 0) continue
          o.near = OBSTACLE.nearCooldown
        } else if (r.hit) {
          if (o.near > OBSTACLE.nearCooldown - 0.6) continue // one hit per obstacle per swing
          o.near = OBSTACLE.nearCooldown
        }
        out.push(r)
      }
      return out
    },
    // Slammers / mallets that hit the floor this frame (shake, dust, cracks).
    slams() {
      return obstacles.filter((o) => o.slam).map((o) => o.slamAt)
    },
    // Cannons that fired / geysers that burst / geysers bubbling, this frame (visual fx).
    fx(pz) {
      return obstacles.filter((o) => Math.abs(o.z - pz) < 120 && (o.fired || o.started || o.bubbling))
    },
    // Positional sound events since the last call (audio.hazard).
    sounds() {
      const list = soundQ.slice()
      soundQ.length = 0
      return list
    },
    // Running machine loops near pz (audio.hazardLoops).
    loops(pz) {
      loopList.length = 0
      for (const o of obstacles) if (o.loop && Math.abs(o.z - pz) < 120) loopList.push(o.loop)
      return loopList
    },
  }
}
