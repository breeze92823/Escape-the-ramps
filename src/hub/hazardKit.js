import { AdditiveBlending, CanvasTexture, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three'
import { OBSTACLE, STAGES } from '../config.js'
import { RAPIER, addFixed, world } from '../physics.js'
import { cached, makeCanvas, paintDiagonal, tex } from '../paint.js'
import { mulberry32 } from '../textures.js'
import { neon } from '../propkit.js'
import { G, mat } from './kit.js'

// Shared pieces for every stage hazard module (obstacles.js, weapons.js,
// enemies.js, floors.js, gaps.js): truck size, difficulty ramps, the sound
// and visual-effect event queues main.js drains each frame, removable
// colliders, materials, floor decals and gear spots.

export const TRUCK_R = 1.3
export const TRUCK_H = 2.4
export const HIT_COOLDOWN = 0.6 // s before the same hazard can hit again (one hit per swing)
export const F = STAGES.fence
export const lerp = (a, b, t) => a + (b - a) * t
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (v) => v * v * (3 - 2 * v)
export const range = (pair, k) => (Array.isArray(pair) ? lerp(pair[0], pair[1], OBSTACLE.ramp(k)) : pair)
export const lethalAt = (k) => k >= OBSTACLE.crushDeathFrom

// The player (main.js hands it to update() each frame): hazards that aim, chase
// or track read it. Feet position, velocity, facing, grounded.
export const target = { p: { x: 0, y: -1000, z: 0 }, v: { x: 0, y: 0, z: 0 }, facing: 0, grounded: false, speed: 0 }

// --- Sounds -------------------------------------------------------------------------------
export const soundQ = []
export const sfx = (type, x, y, z, k = 1) => soundQ.push({ type, x, y, z, k })
export const loopOf = (kind, x, y, z) => ({ kind, x, y, z, level: 0, pitch: 1 })

// --- Visual effects (hazardFx.js in main.js plays them with the particle systems) -----------
export const fxQ = []
export const fx = (type, x, y, z, o = null) => {
  if (fxQ.length < 400) fxQ.push({ type, x, y, z, o })
}

// --- Removable colliders (bridge planks, trapdoors, tiles, walls) ---------------------------
export const boxCollider = (x, y, z, hx, hy, hz) => addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z })
export function dropCollider(c) {
  if (c && world) world.removeCollider(c, true)
}

// --- Textures ------------------------------------------------------------------------
export function paintChevrons(fg, bg) {
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
// Red targeting reticle (missiles, the robot's stomp): ring, ticks, cross.
function paintReticle() {
  const c = makeCanvas(256)
  const x = c.getContext('2d')
  x.strokeStyle = '#ff2a2a'
  x.lineWidth = 10
  x.beginPath()
  x.arc(128, 128, 112, 0, Math.PI * 2)
  x.stroke()
  x.lineWidth = 6
  x.beginPath()
  x.arc(128, 128, 70, 0, Math.PI * 2)
  x.stroke()
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    x.beginPath()
    x.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30)
    x.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126)
    x.stroke()
  }
  x.fillStyle = 'rgba(255,40,40,0.25)'
  x.beginPath()
  x.arc(128, 128, 112, 0, Math.PI * 2)
  x.fill()
  return c
}
// Stone tile with cracks (crumbling floors, fake floors).
function paintTile(cracked) {
  const c = makeCanvas(128)
  const x = c.getContext('2d')
  x.fillStyle = '#8f939c'
  x.fillRect(0, 0, 128, 128)
  const r = mulberry32(cracked ? 41 : 17)
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? '40,40,48' : '200,204,214'},${0.08 + r() * 0.12})`
    x.fillRect(r() * 128, r() * 128, 2 + r() * 8, 2 + r() * 8)
  }
  x.strokeStyle = '#4a4e58'
  x.lineWidth = 6
  x.strokeRect(3, 3, 122, 122)
  if (cracked) {
    x.strokeStyle = 'rgba(30,26,22,0.8)'
    x.lineWidth = 2.5
    for (let i = 0; i < 4; i++) {
      let px = 64
      let py = 64
      let a = (i / 4) * Math.PI * 2 + r()
      x.beginPath()
      x.moveTo(px, py)
      for (let j = 0; j < 5; j++) {
        a += (r() - 0.5) * 1.2
        px += Math.cos(a) * 12
        py += Math.sin(a) * 12
        x.lineTo(px, py)
      }
      x.stroke()
    }
  }
  return c
}
// Faint scanlines for holograms (fake walls).
function paintScan() {
  const c = makeCanvas(64, 64)
  const x = c.getContext('2d')
  x.fillStyle = 'rgba(0,0,0,0)'
  x.clearRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 4) {
    x.fillStyle = `rgba(255,255,255,${y % 16 === 0 ? 0.5 : 0.18})`
    x.fillRect(0, y, 64, 1.5)
  }
  return c
}
// Molten lava: dark crust over glowing cracks.
function paintLava() {
  const c = makeCanvas(256)
  const x = c.getContext('2d')
  x.fillStyle = '#ff6a10'
  x.fillRect(0, 0, 256, 256)
  const r = mulberry32(99)
  for (let i = 0; i < 70; i++) {
    x.fillStyle = r() < 0.6 ? 'rgba(60,10,0,0.75)' : 'rgba(255,220,80,0.6)'
    x.beginPath()
    x.ellipse(r() * 256, r() * 256, 8 + r() * 30, 5 + r() * 18, r() * 3, 0, Math.PI * 2)
    x.fill()
  }
  return c
}

export const decal = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }
export const M = {
  red: () => mat('#e8344e', { roughness: 0.45 }),
  white: () => mat('#f2f4f8', { roughness: 0.5 }),
  steel: () => mat('#7d8696', { roughness: 0.4, metalness: 0.6 }),
  iron: () => mat('#3a3f4a', { roughness: 0.35, metalness: 0.75 }),
  dark: () => mat('#2f3546', { roughness: 0.7 }),
  black: () => mat('#16181e', { roughness: 0.5, metalness: 0.4 }),
  wood: () => mat('#8a5a32', { roughness: 0.8 }),
  log: () => mat('#6b4224', { roughness: 0.9 }),
  rope: () => mat('#c9a66b', { roughness: 0.9 }),
  rubber: () => mat('#1c1d22', { roughness: 0.9 }),
  chrome: () => mat('#d5dbe3', { roughness: 0.25, metalness: 0.85 }),
  copper: () => mat('#c87533', { roughness: 0.35, metalness: 0.8 }),
  glass: () => cached('obs:glass', () => new MeshStandardMaterial({ color: '#8fd8ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 })),
  rock: () => mat('#7a6e62', { roughness: 0.95 }),
  hazard: () => cached('obs:hazard', () => new MeshStandardMaterial({ map: tex(paintDiagonal('#ffd21a', '#1c1c22', 256, 64, 24), { repeatX: 2 }), roughness: 0.6 })),
  hazardFloor: () => cached('obs:hazardfloor', () => new MeshStandardMaterial({ map: tex(paintDiagonal('#ffd21a', '#1c1c22', 256, 64, 24), { repeatX: 3 }), roughness: 0.7, transparent: true, opacity: 0.85, ...decal })),
  curb: () => cached('obs:curb', () => new MeshStandardMaterial({ map: tex(paintDiagonal('#e8203a', '#ffffff', 256, 64, 32), { repeatX: 12 }), roughness: 0.6 })),
  ice: () => cached('obs:ice', () => new MeshStandardMaterial({ color: '#bfeaff', roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.88, ...decal })),
  mud: () => cached('obs:mud', () => new MeshStandardMaterial({ map: tex(paintMud(), { repeatX: 4, repeatY: 3 }), roughness: 1, ...decal })),
  planks: () => cached('obs:planks', () => new MeshStandardMaterial({ map: tex(paintPlanks(), { wrap: false }), roughness: 0.85 })),
  water: () => cached('obs:water', () => new MeshStandardMaterial({ color: '#8fe6ff', roughness: 0.1, transparent: true, opacity: 0.55, emissive: '#2a9ad8', emissiveIntensity: 0.3, depthWrite: false })),
  tile: () => cached('obs:tile', () => new MeshStandardMaterial({ map: tex(paintTile(false), { wrap: false }), roughness: 0.85 })),
  tileCracked: () => cached('obs:tilecracked', () => new MeshStandardMaterial({ map: tex(paintTile(true), { wrap: false }), roughness: 0.85 })),
  lava: () => cached('obs:lava', () => {
    const t = tex(paintLava(), { repeatX: 6, repeatY: 6 })
    return new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ff5a10', emissiveIntensity: 1.6, roughness: 0.7 })
  }),
  reticle: () => cached('obs:reticle', () => new MeshBasicMaterial({ map: tex(paintReticle(), { wrap: false }), transparent: true, depthWrite: false, toneMapped: false, ...decal })),
  scan: () => cached('obs:scan', () => tex(paintScan(), { repeatX: 1, repeatY: 6 })),
}
export const shadowTex = () => cached('obs:shadowtex', () => {
  const t = new CanvasTexture(paintShadow())
  t.colorSpace = SRGBColorSpace
  return t
})
// Scrolling chevron textures (one per look), animated in update().
export const scrolling = []
export function chevronMat(key, fg, bg, repeatX, repeatY, glowing) {
  return cached(`obs:chev:${key}`, () => {
    const t = tex(paintChevrons(fg, bg), { repeatX, repeatY })
    const m = glowing ? new MeshBasicMaterial({ map: t, toneMapped: false, ...decal }) : new MeshStandardMaterial({ map: t, roughness: 0.6, ...decal })
    scrolling.push({ t, speed: glowing ? 2.4 : 1.1 })
    return m
  })
}
// A flat patch on the floor, sx by sz m (world x / z); `dir` turns the texture's
// up (+V) from north (-Z): -PI/2 points it east (+X), PI/2 west.
export const planeGeo = new PlaneGeometry(1, 1)
export function floorPlane(parent, material, x, y, z, sx, sz, dir = 0) {
  const m = new Mesh(planeGeo, material)
  m.rotation.set(-Math.PI / 2, 0, dir)
  const across = Math.abs(Math.sin(dir)) > 0.5
  m.scale.set(across ? sz : sx, across ? sx : sz, 1)
  m.position.set(x, y, z)
  m.receiveShadow = true
  parent.add(m)
  return m
}

// Gear pickups in a hazard's danger zone: blue (k), gold (5k) or a MEGA gear (20k).
export const gear = (ctx, x, y, z, k, gold = false) =>
  ctx.gearSpots.push({ x, y, z, value: gold === 'mega' ? k * 20 : gold ? k * 5 : k, gold: !!gold, mega: gold === 'mega' })

// A blinking warning beacon (amber/red dome on a short post); returns its material
// so the hazard can drive the flash (emissiveIntensity).
export function beaconMat(color = '#ff3a1a') {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.3, transparent: true, opacity: 0.92 })
}

// --- Helpers for the newer hazards ------------------------------------------------------------
// The player is on this hazard's island (within `reach` m along the lane, at its height).
export const nearby = (b, z, reach) => Math.abs(target.p.z - z) < reach && Math.abs(target.p.y - b) < 6 && !target.frozen

// An energy beam between two points: a hot core and a soft additive glow
// around it. set(a, b) places it; show(on, k) fades it (k = 0..1 brightness).
const UPV = new Vector3(0, 1, 0)
const tmpV = new Vector3()
const beamGeo = new CylinderGeometry(1, 1, 1, 8, 1, true)
export function makeBeam(parent, color = '#ff2a2a', core = 0.09, halo = 0.34) {
  const g = new Group()
  parent.add(g)
  const coreMat = neon(color, 6, { transparent: true, opacity: 1, depthWrite: false })
  coreMat.color.lerp(new Color('#ffffff'), 0.18)
  const haloMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  const c = new Mesh(beamGeo, coreMat)
  const h = new Mesh(beamGeo, haloMat)
  c.scale.set(core, 1, core)
  h.scale.set(halo, 1, halo)
  g.add(c, h)
  return {
    group: g,
    set(ax, ay, az, bx, by, bz) {
      tmpV.set(bx - ax, by - ay, bz - az)
      const len = tmpV.length() || 0.001
      g.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
      g.quaternion.setFromUnitVectors(UPV, tmpV.divideScalar(len))
      c.scale.y = h.scale.y = len
    },
    show(on, k = 1, wobble = 0) {
      g.visible = on
      if (!on) return
      coreMat.opacity = Math.min(1, k)
      haloMat.opacity = 0.5 * k
      const w = 1 + (Math.random() - 0.5) * wobble
      c.scale.x = c.scale.z = core * w
      h.scale.x = h.scale.z = halo * (0.8 + 0.4 * Math.random() * (wobble > 0 ? 1 : 0.2)) * k
    },
  }
}

// Plasma bolts (turrets, the boss tower): glowing balls flying straight, a
// direct hit blows the truck up. fire(); update(dt) -> hits/pops; test(pp).
export function createBolts(parent, color = '#ff3a6a', n = 4, r = 0.45) {
  const list = []
  for (let i = 0; i < n; i++) {
    const g = new Group()
    g.visible = false
    parent.add(g)
    const core = new Mesh(G.sphere, neon('#ffffff', 5))
    core.scale.setScalar(r * 0.55)
    const glowM = new Mesh(G.sphere, new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
    glowM.scale.setScalar(r)
    const halo = new Mesh(G.sphere, new MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
    halo.scale.setScalar(r * 2.2)
    g.add(core, glowM, halo)
    list.push({ g, halo, live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 0 })
  }
  return {
    list,
    fire(x, y, z, vx, vy, vz, life) {
      const b = list.find((q) => !q.live) ?? list[0]
      Object.assign(b, { live: true, x, y, z, vx, vy, vz, t: 0, life })
      b.g.visible = true
      b.g.position.set(x, y, z)
    },
    // floorY: bolts that reach it burst there.
    update(dt, floorY) {
      for (const b of list) {
        if (!b.live) continue
        b.t += dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.z += b.vz * dt
        b.g.position.set(b.x, b.y, b.z)
        b.halo.scale.setScalar(r * (2 + Math.sin(b.t * 40) * 0.4))
        fx('plasma', b.x, b.y, b.z, { color })
        if (b.t > b.life || b.y < floorY + 0.3) {
          b.live = false
          b.g.visible = false
          fx('plasmaPop', b.x, Math.max(b.y, floorY + 0.3), b.z, { color })
          sfx('zapHit', b.x, b.y, b.z, 0.8)
        }
      }
    },
    test(pp) {
      for (const b of list) {
        if (!b.live) continue
        const d = Math.hypot(pp.x - b.x, pp.y + TRUCK_H / 2 - b.y, pp.z - b.z)
        if (d < TRUCK_R + r * 0.8) {
          b.live = false
          b.g.visible = false
          return { kill: 'shot', why: 'SHOT DOWN!', x: b.x, y: b.y, z: b.z }
        }
        if (d < TRUCK_R + 2.6) return { near: true, x: b.x }
      }
      return null
    },
  }
}

// A big explosion at (x, y, z): the fireball, smoke and debris (hazardFx.js),
// the boom, a scorch crack and a camera shake for whoever is close.
export function explode(x, y, z, size = 1) {
  fx('explosion', x, y, z, { size })
  fx('quake', x, y, z, { k: 0.7 * size, r: 40 })
  sfx('explode', x, y, z, Math.min(2, 0.8 + size * 0.4))
}
