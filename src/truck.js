import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TRUCK } from './config.js'
import { cached, paintTread, paintTruckSkin, tex } from './paint.js'

// Procedural monster truck: rounded two-part body with a painted skin, cab
// windows, light bar, bumpers, a visible chassis (frame rails, axles, diff,
// coil-over shocks, links, driveshaft) and four big wheels (lathed rounded
// tyres with chevron tread, navy rims with spokes, white hub, lug nuts).
// Animal trucks add features (eyes, ears, horns, fin, comb, beak, wings).
// Local frame: +Z is the nose, +X the truck's left, feet at y = 0.

const { wheelR: R, wheelW: W, track: TX, base: BZ } = TRUCK.model

// --- Shared geometry ---------------------------------------------------------
const geo = {
  tyre: (() => {
    const pts = []
    const inner = R * 0.6
    const hw = W / 2
    const rr = 0.13 // corner radius
    pts.push(new Vector2(inner, -hw * 0.92))
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2)
      pts.push(new Vector2(R - rr + Math.cos(a) * rr, -hw + rr + Math.sin(a) * rr))
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2)
      pts.push(new Vector2(R - rr + Math.cos(a) * rr, hw - rr + Math.sin(a) * rr))
    }
    pts.push(new Vector2(inner, hw * 0.92))
    const g = new LatheGeometry(pts, 36)
    g.rotateZ(Math.PI / 2) // axis along X
    return g
  })(),
  rim: new CylinderGeometry(R * 0.6, R * 0.6, W * 0.7, 28).rotateZ(Math.PI / 2),
  rimLip: new TorusGeometry(R * 0.6, 0.05, 8, 28).rotateY(Math.PI / 2),
  hub: new CylinderGeometry(R * 0.2, R * 0.24, 0.12, 16).rotateZ(Math.PI / 2),
  spoke: new BoxGeometry(0.06, R * 0.42, 0.09),
  nut: new CylinderGeometry(0.035, 0.035, 0.05, 6).rotateZ(Math.PI / 2),
  lower: new RoundedBoxGeometry(2.15, 0.78, 3.55, 4, 0.3),
  cab: new RoundedBoxGeometry(1.86, 0.72, 1.75, 4, 0.32),
  unit: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 12),
  sphere: new SphereGeometry(1, 16, 12),
  cone: new ConeGeometry(1, 1, 12),
  light: new CylinderGeometry(0.15, 0.15, 0.06, 16).rotateX(Math.PI / 2),
}

const mats = {
  tyre: () =>
    cached('m:tyre', () => {
      const t = tex(paintTread(), { repeatX: 1, repeatY: 1 })
      return new MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0 })
    }),
  std: (color, extra = {}) => cached(`m:${color}:${JSON.stringify(extra)}`, () => new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra })),
  skin: (p) =>
    cached(`m:skin:${p.base}:${p.accent}:${p.pattern}`, () => {
      const t = tex(paintTruckSkin(p.base, p.accent, p.pattern, p.seed ?? 7), { wrap: false })
      return new MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.05 })
    }),
}
const chrome = () => mats.std('#d9dee6', { roughness: 0.25, metalness: 0.85 })
const dark = () => mats.std('#2b2f3a', { roughness: 0.6 })
const glass = () => mats.std('#8fdcff', { roughness: 0.15, metalness: 0.1, emissive: '#2a6c8a', emissiveIntensity: 0.25 })

const UP = new Vector3(0, 1, 0)
function part(parent, g, mat, x, y, z, sx = 1, sy = 1, sz = 1, shadow = true) {
  const m = new Mesh(g, mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = shadow
  m.receiveShadow = shadow
  parent.add(m)
  return m
}
// A cylinder (unit radius/height) spanning two points.
function rod(parent, mat, ax, ay, az, bx, by, bz, r) {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  const m = part(parent, geo.cyl, mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, r, len, r)
  m.quaternion.setFromUnitVectors(UP, new Vector3(dx / len, dy / len, dz / len))
  return m
}

function buildWheel(paint, side) {
  const pivot = new Group() // steers (y)
  const spin = new Group() // rolls (x)
  pivot.add(spin)
  part(spin, geo.tyre, mats.tyre(), 0, 0, 0)
  const rimMat = mats.std(paint.rim ?? '#22346e', { roughness: 0.35, metalness: 0.4 })
  const out = side * W * 0.18 // rim face sits toward the outside
  part(spin, geo.rim, rimMat, out * 0.4, 0, 0)
  part(spin, geo.rimLip, chrome(), side * W * 0.36, 0, 0, 1, 1, 1, false)
  for (let i = 0; i < 5; i++) {
    const s = part(spin, geo.spoke, mats.std(paint.rimLight ?? '#3d5bb0', { roughness: 0.35, metalness: 0.4 }), side * W * 0.37, 0, 0, 1, 1, 1, false)
    s.rotation.x = (i / 5) * Math.PI * 2
    s.position.y = Math.cos(s.rotation.x) * R * 0.3
    s.position.z = Math.sin(s.rotation.x) * R * 0.3
  }
  part(spin, geo.hub, mats.std('#eef2f7', { roughness: 0.3, metalness: 0.3 }), side * W * 0.4, 0, 0, 1, 1, 1, false)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(spin, geo.nut, chrome(), side * W * 0.45, Math.cos(a) * R * 0.13, Math.sin(a) * R * 0.13, 1, 1, 1, false)
  }
  return { pivot, spin }
}

// --- Animal features --------------------------------------------------------------
function eyes(parent, y, z, spread, size = 0.22, pupil = '#141414') {
  for (const s of [-1, 1]) {
    part(parent, geo.sphere, mats.std('#ffffff', { roughness: 0.3 }), s * spread, y, z, size, size, size)
    part(parent, geo.sphere, mats.std(pupil, { roughness: 0.2 }), s * spread, y + size * 0.1, z + size * 0.75, size * 0.5, size * 0.5, size * 0.4, false)
  }
}
function addFeatures(body, p) {
  const f = p.features ?? []
  const accent = mats.std(p.accent)
  const base = mats.std(p.base)
  const topY = 2.55
  if (f.includes('frogEyes')) {
    for (const s of [-1, 1]) {
      part(body, geo.sphere, base, s * 0.55, topY + 0.15, 0.55, 0.36, 0.32, 0.36)
      part(body, geo.sphere, mats.std('#ffffff', { roughness: 0.3 }), s * 0.55, topY + 0.28, 0.72, 0.24, 0.24, 0.2)
      part(body, geo.sphere, mats.std('#111111'), s * 0.55, topY + 0.3, 0.88, 0.12, 0.14, 0.06, false)
    }
  }
  if (f.includes('ears')) {
    for (const s of [-1, 1]) {
      const e = part(body, geo.cone, base, s * 0.6, topY + 0.25, 0.1, 0.24, 0.5, 0.14)
      e.rotation.z = -s * 0.25
      part(body, geo.cone, mats.std('#ffb3c6'), s * 0.6, topY + 0.22, 0.17, 0.13, 0.32, 0.05, false).rotation.z = -s * 0.25
    }
  }
  if (f.includes('horns')) {
    for (const s of [-1, 1]) {
      const h = part(body, geo.cone, mats.std(p.horn ?? '#f2ead8', { roughness: 0.4 }), s * 0.95, topY + 0.25, 0.4, 0.16, 0.8, 0.16)
      h.rotation.z = -s * 0.9
    }
  }
  if (f.includes('rhinoHorn')) {
    const h = part(body, geo.cone, mats.std('#e8e2d0'), 0, 1.95, 2.0, 0.16, 0.7, 0.16)
    h.rotation.x = 0.7
  }
  if (f.includes('fin')) {
    const fin = part(body, geo.cone, base, 0, topY + 0.45, -0.2, 0.12, 1.0, 0.6)
    fin.rotation.x = -0.35
  }
  if (f.includes('comb')) {
    for (let i = 0; i < 3; i++) part(body, geo.sphere, mats.std('#e8202a'), 0, topY + 0.18 + (i === 1 ? 0.1 : 0), 0.45 - i * 0.28, 0.12, 0.24, 0.16)
    part(body, geo.cone, mats.std('#ffb21a'), 0, 1.75, 2.0, 0.22, 0.5, 0.22).rotation.x = Math.PI / 2
  }
  if (f.includes('beak')) part(body, geo.cone, mats.std('#ffb21a'), 0, 1.8, 2.05, 0.26, 0.6, 0.2).rotation.x = Math.PI / 2
  if (f.includes('snout')) {
    part(body, geo.cyl, mats.std('#ff9fbf'), 0, 1.72, 1.92, 0.34, 0.2, 0.26).rotation.x = Math.PI / 2
    for (const s of [-1, 1]) part(body, geo.sphere, mats.std('#a8325a'), s * 0.11, 1.72, 2.03, 0.06, 0.07, 0.03, false)
  }
  if (f.includes('mane')) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI
      part(body, geo.sphere, accent, Math.cos(a) * 1.0, 2.2 + Math.sin(a) * 0.45, 1.05, 0.28, 0.28, 0.2)
    }
  }
  if (f.includes('spikes')) {
    for (let i = 0; i < 5; i++) part(body, geo.cone, mats.std(p.accent), 0, topY + 0.2, 0.6 - i * 0.35, 0.12, 0.42, 0.12)
  }
  if (f.includes('wings')) {
    for (const s of [-1, 1]) {
      const w = part(body, geo.unit, mats.std(p.accent), s * 1.35, 2.3, -0.2, 0.9, 0.08, 0.5)
      w.rotation.z = s * 0.35
    }
  }
  if (f.includes('eyes')) eyes(body, 2.28, 1.0, 0.45, 0.2, p.pupil)
  if (f.includes('teeth')) {
    for (let i = -3; i <= 3; i++) part(body, geo.cone, mats.std('#ffffff'), i * 0.18, 1.45, 1.92, 0.07, 0.18, 0.05, false).rotation.x = Math.PI
  }
}

// paint: { base, accent, pattern, rim, rimLight, features: [...] }
export function buildTruck(paint) {
  const root = new Group()
  const chassis = new Group() // tilts with the ground (pitch/roll)
  const body = new Group() // bounces on the suspension
  root.add(chassis)
  chassis.add(body)

  const frame = mats.std('#8f99a6', { roughness: 0.45, metalness: 0.6 })
  const axleY = R

  // --- Chassis (unsprung + frame) ---
  for (const s of [-1, 1]) part(chassis, geo.unit, frame, s * 0.55, 1.15, 0, 0.16, 0.18, 3.1)
  for (const z of [-BZ, BZ]) {
    rod(chassis, dark(), -TX + 0.2, axleY, z, TX - 0.2, axleY, z, 0.09)
    part(chassis, geo.sphere, dark(), 0, axleY, z, 0.26, 0.24, 0.24)
    for (const s of [-1, 1]) {
      // Coil-over shock: chrome body + red spring sleeve.
      rod(chassis, chrome(), s * (TX - 0.35), axleY + 0.05, z, s * 0.62, 1.35, z * 0.86, 0.06)
      const mx = (s * (TX - 0.35) + s * 0.62) / 2
      rod(chassis, mats.std(paint.spring ?? '#e23a2e', { roughness: 0.4 }), mx - s * 0.08, axleY + 0.25, z * 0.97, mx + s * 0.06, 1.15, z * 0.9, 0.11)
      rod(chassis, frame, s * 0.45, axleY, z, s * 0.5, 1.1, z * 0.45, 0.04) // link bar
    }
  }
  rod(chassis, chrome(), 0, axleY + 0.05, -BZ, 0, axleY + 0.12, BZ, 0.07) // driveshaft
  part(chassis, geo.unit, dark(), 0, 1.0, 0, 0.7, 0.35, 0.9) // transfer case / skid plate

  // --- Body ---
  const skin = mats.skin(paint)
  part(body, geo.lower, skin, 0, 1.78, 0)
  part(body, geo.cab, skin, 0, 2.38, -0.25)
  // Fenders over the wheels (body colour arcs).
  for (const s of [-1, 1]) for (const z of [-BZ, BZ]) part(body, geo.unit, skin, s * 1.12, 1.55, z, 0.3, 0.12, 1.1)
  // Windows.
  const gl = glass()
  const ws = part(body, geo.unit, gl, 0, 2.42, 0.64, 1.6, 0.48, 0.05, false)
  ws.rotation.x = -0.32
  part(body, geo.unit, gl, 0, 2.42, -1.13, 1.5, 0.42, 0.04, false)
  for (const s of [-1, 1]) {
    part(body, geo.unit, gl, s * 0.94, 2.42, -0.05, 0.04, 0.42, 0.62, false)
    part(body, geo.unit, gl, s * 0.94, 2.42, -0.78, 0.04, 0.38, 0.42, false)
  }
  // Light bar on the roof.
  part(body, geo.unit, dark(), 0, 2.78, 0.25, 1.3, 0.1, 0.16)
  for (let i = -2; i <= 2; i++) part(body, geo.light, mats.std('#fff6c8', { emissive: '#ffe680', emissiveIntensity: 1.2 }), i * 0.26, 2.78, 0.35, 0.6, 0.6, 1, false)
  // Headlights + tail lights.
  for (const s of [-1, 1]) {
    part(body, geo.light, mats.std('#fffbe6', { emissive: '#fff2b0', emissiveIntensity: 1.6 }), s * 0.72, 1.85, 1.78, 1, 1, 1, false)
    part(body, geo.light, mats.std('#ff3030', { emissive: '#ff1a1a', emissiveIntensity: 1.2 }), s * 0.78, 1.85, -1.78, 0.8, 0.8, 1, false)
  }
  // Bumpers.
  part(body, geo.unit, dark(), 0, 1.4, 1.86, 2.0, 0.2, 0.22)
  part(body, geo.unit, dark(), 0, 1.4, -1.86, 2.0, 0.2, 0.22)
  for (const s of [-1, 1]) {
    part(body, geo.unit, dark(), s * 0.6, 1.55, 1.9, 0.14, 0.4, 0.14)
    rod(body, chrome(), s * 0.55, 1.45, -1.7, s * 0.55, 1.62, -2.0, 0.07) // exhaust tips
  }
  addFeatures(body, paint)

  // --- Wheels ---
  const wheels = []
  for (const z of [BZ, -BZ]) {
    for (const s of [-1, 1]) {
      const w = buildWheel(paint, s)
      w.pivot.position.set(s * TX, axleY, z)
      w.front = z > 0
      chassis.add(w.pivot)
      wheels.push(w)
    }
  }

  return {
    root,
    chassis,
    body,
    wheels,
    // Local points (feet frame) that effects emit from.
    exhaust: [
      { x: -0.55, y: 1.6, z: -2.05 },
      { x: 0.55, y: 1.6, z: -2.05 },
    ],
    rearWheels: [
      { x: -TX, y: 0.1, z: -BZ - 0.3 },
      { x: TX, y: 0.1, z: -BZ - 0.3 },
    ],
    state: { roll: 0, spin: 0, bob: 0, bobV: 0, pitchV: 0, pitch: 0, lean: 0, lastSpeed: 0 },
  }
}

// Per frame: wheel spin, steering, suspension bob, accel pitch, turn lean.
export function animateTruck(t, dt, { speed, steer, grounded, groundPitch = 0, groundRoll = 0, landed = 0, snap = false }) {
  const s = t.state
  if (dt <= 0) return
  s.spin += (speed / R) * dt
  const accel = (speed - s.lastSpeed) / dt
  s.lastSpeed = speed
  for (const w of t.wheels) {
    w.spin.rotation.x = s.spin
    w.pivot.rotation.y = w.front ? steer * 0.45 : -steer * 0.12
  }
  // Spring-damper for the body: accel pitches the nose up, landings compress it.
  const k = 140
  const c = 14
  const targetPitch = Math.max(-0.12, Math.min(0.12, -accel * 0.006))
  s.pitchV += ((targetPitch - s.pitch) * k - s.pitchV * c) * dt
  s.pitch += s.pitchV * dt
  if (landed > 0) s.bobV -= landed
  s.bobV += (-s.bob * k - s.bobV * c) * dt
  s.bob += s.bobV * dt
  const targetLean = grounded ? -steer * Math.min(1, Math.abs(speed) / 20) * 0.1 : 0
  s.lean += (targetLean - s.lean) * (1 - Math.exp(-6 * dt))
  t.body.position.y = Math.max(-0.25, Math.min(0.25, s.bob))
  t.body.rotation.x = s.pitch
  t.body.rotation.z = s.lean
  t.chassis.rotation.x += (groundPitch - t.chassis.rotation.x) * (snap ? 1 : 1 - Math.exp(-10 * dt))
  t.chassis.rotation.z += (groundRoll - t.chassis.rotation.z) * (1 - Math.exp(-10 * dt))
}
