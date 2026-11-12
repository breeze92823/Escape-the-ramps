import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RAPIER, addFixed } from '../physics.js'
import { neon, solidBox } from '../propkit.js'
import { cached, paintBands, paintDiagonal, tex } from '../paint.js'

// Building blocks for the hub: memoised materials, placed primitives,
// colliders, and the small props that repeat everywhere (guardrails, cones,
// stanchions with ropes, crowd barriers, jersey barriers, floor arrows,
// balloons, floating wheel icons, gold trophies).

export const G = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 16),
  cyl8: new CylinderGeometry(1, 1, 1, 8),
  sphere: new SphereGeometry(1, 16, 12),
  cone: new ConeGeometry(1, 1, 16),
}

export function mat(color, extra = {}) {
  return cached(`hub:${color}:${JSON.stringify(extra)}`, () => new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra }))
}
export function glowMat(color, k = 2.6) {
  return cached(`neon:${color}:${k}`, () => neon(color, k))
}
export const gold = () => mat('#ffc21f', { roughness: 0.28, metalness: 0.85 })
export const chrome = () => mat('#d5dbe3', { roughness: 0.3, metalness: 0.8 })

export function mesh(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = true) {
  const m = new Mesh(geo, material)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = shadow
  m.receiveShadow = true
  parent.add(m)
  return m
}
// Box by its centre and size.
export const box = (parent, material, x, y, z, w, h, d, shadow = true) => mesh(parent, G.box, material, x, y, z, w, h, d, shadow)
// Box sitting on y0 (bottom face at y0).
export const block = (parent, material, x, y0, z, w, h, d, shadow = true) => box(parent, material, x, y0 + h / 2, z, w, h, d, shadow)

const UP = new Vector3(0, 1, 0)
export function rod(parent, material, a, b, r, geo = G.cyl8) {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = d.length()
  const m = mesh(parent, geo, material, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r, len, r)
  m.quaternion.setFromUnitVectors(UP, d.normalize())
  return m
}

// --- Colliders (world space) --------------------------------------------------------
// Props built inside a raised group (a stage plateau) set baseY so their
// colliders land at the right height.
let baseY = 0
export const setBaseY = (y) => {
  baseY = y
}
export function solid(x, y0, z, w, h, d, yaw = 0) {
  solidBox(w / 2, h / 2, d / 2, x, baseY + y0 + h / 2, z, yaw)
}
export function solidHull(points) {
  addFixed(RAPIER.ColliderDesc.convexHull(new Float32Array(points.flat())), { x: 0, y: 0, z: 0 })
}
export function solidMesh(geometry, matrixWorld) {
  const g = geometry.index ? geometry : geometry
  const p = g.attributes.position
  const v = new Float32Array(p.count * 3)
  const t = new Vector3()
  for (let i = 0; i < p.count; i++) {
    t.fromBufferAttribute(p, i).applyMatrix4(matrixWorld)
    v[i * 3] = t.x
    v[i * 3 + 1] = t.y
    v[i * 3 + 2] = t.z
  }
  let idx
  if (g.index) idx = new Uint32Array(g.index.array)
  else {
    idx = new Uint32Array(p.count)
    for (let i = 0; i < p.count; i++) idx[i] = i
  }
  addFixed(RAPIER.ColliderDesc.trimesh(v, idx), { x: 0, y: 0, z: 0 })
}

// A group placed in the world (its children use local coords). World-space
// colliders for rotated groups go through `toWorld`.
export function place(parent, x, y, z, yaw = 0) {
  const g = new Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw
  parent.add(g)
  return g
}
export function toWorld(g, lx, lz) {
  const c = Math.cos(g.rotation.y)
  const s = Math.sin(g.rotation.y)
  return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c]
}
// Solid box given in a placed group's local frame.
export function solidLocal(g, lx, y0, lz, w, h, d) {
  const [x, z] = toWorld(g, lx, lz)
  solid(x, y0, z, w, h, d, g.rotation.y)
}

// --- Flat white floor arrow (shaft + head), pointing along `dir` (yaw, 0 = +Z).
const arrowMat = () => mat('#e7ebf4', { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
export function floorArrow(parent, x, z, yaw, length = 18, width = 3, headLen = 6, headW = 9) {
  const s = new Shape()
  const hw = width / 2
  const L = length - headLen
  s.moveTo(-hw, 0)
  s.lineTo(hw, 0)
  s.lineTo(hw, L)
  s.lineTo(headW / 2, L)
  s.lineTo(0, length)
  s.lineTo(-headW / 2, L)
  s.lineTo(-hw, L)
  s.closePath()
  const g = new ShapeGeometry(s)
  g.rotateX(Math.PI / 2) // shape +y -> world +z
  const m = new Mesh(g, arrowMat())
  m.position.set(x, 0.03, z)
  m.rotation.y = yaw
  m.receiveShadow = true
  parent.add(m)
  return m
}

// --- Traffic cone.
export function cone(parent, x, z, s = 1) {
  const g = place(parent, x, 0, z)
  block(g, mat('#ff6a1a'), 0, 0, 0, 0.9 * s, 0.1 * s, 0.9 * s)
  mesh(g, G.cone, mat('#ff6a1a', { roughness: 0.5 }), 0, 0.55 * s, 0, 0.32 * s, 0.95 * s, 0.32 * s)
  mesh(g, G.cyl, mat('#ffffff'), 0, 0.55 * s, 0, 0.215 * s, 0.16 * s, 0.215 * s, false)
  return g
}

// --- Highway guardrail (posts + W-beam), visual; collider along it.
export function guardrail(parent, x1, z1, x2, z2, { collide = true, h = 1.3 } = {}) {
  const len = Math.hypot(x2 - x1, z2 - z1)
  const yaw = Math.atan2(x2 - x1, z2 - z1)
  const g = place(parent, (x1 + x2) / 2, 0, (z1 + z2) / 2, yaw)
  const post = mat('#8d949f', { metalness: 0.5, roughness: 0.45 })
  const beam = mat('#c2c8d0', { metalness: 0.65, roughness: 0.35 })
  const n = Math.max(1, Math.round(len / 3.5))
  for (let i = 0; i <= n; i++) block(g, post, 0, 0, -len / 2 + (i / n) * len, 0.2, h, 0.2)
  box(g, beam, 0.16, h * 0.72, 0, 0.08, 0.36, len)
  box(g, beam, 0.16, h * 0.36, 0, 0.06, 0.12, len)
  if (collide) solid((x1 + x2) / 2, 0, (z1 + z2) / 2, 0.6, 2.4, len, yaw)
  return g
}

// --- Black stanchion posts with red rope between consecutive points [[x,z]...].
export function stanchions(parent, pts, rope = '#d81e2a') {
  const post = mat('#16171c', { roughness: 0.4, metalness: 0.3 })
  for (const [x, z] of pts) {
    mesh(parent, G.cyl, post, x, 0.04, z, 0.32, 0.08, 0.32)
    mesh(parent, G.cyl8, post, x, 0.6, z, 0.05, 1.2, 0.05)
    mesh(parent, G.sphere, chrome(), x, 1.22, z, 0.08, 0.08, 0.08, false)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    rod(parent, mat(rope), [ax, 1.12, az], [mx, 0.85, mz], 0.035)
    rod(parent, mat(rope), [mx, 0.85, mz], [bx, 1.12, bz], 0.035)
  }
}

// --- Crowd-control barrier (tube frame + vertical bars), along local X.
export function crowdBarrier(parent, x, z, yaw, color = '#ffd21a', len = 2.4) {
  const g = place(parent, x, 0, z, yaw)
  const m = mat(color, { metalness: 0.4, roughness: 0.4 })
  rod(g, m, [-len / 2, 0, 0], [-len / 2, 1.1, 0], 0.04)
  rod(g, m, [len / 2, 0, 0], [len / 2, 1.1, 0], 0.04)
  rod(g, m, [-len / 2, 1.1, 0], [len / 2, 1.1, 0], 0.04)
  rod(g, m, [-len / 2, 0.2, 0], [len / 2, 0.2, 0], 0.03)
  for (let i = 1; i < 10; i++) {
    const bx = -len / 2 + (i / 10) * len
    rod(g, m, [bx, 0.2, 0], [bx, 1.1, 0], 0.015)
  }
  for (const sx of [-len / 2 + 0.1, len / 2 - 0.1]) {
    rod(g, m, [sx, 0.02, -0.4], [sx, 0.02, 0.4], 0.03)
  }
  return g
}

// --- Jersey barrier (concrete-ish plastic), long axis along local X.
const jerseyGeo = (() => {
  const s = new Shape()
  s.moveTo(-0.45, 0)
  s.lineTo(0.45, 0)
  s.lineTo(0.38, 0.25)
  s.lineTo(0.16, 0.45)
  s.lineTo(0.14, 1.0)
  s.lineTo(-0.14, 1.0)
  s.lineTo(-0.16, 0.45)
  s.lineTo(-0.38, 0.25)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 2, bevelEnabled: false })
  g.translate(0, 0, -1)
  g.rotateY(Math.PI / 2)
  return g
})()
export function jersey(parent, x, z, yaw, color, scale = 1.1) {
  return mesh(parent, jerseyGeo, mat(color, { roughness: 0.45 }), x, 0, z, scale, scale, scale)
}
// A row of alternating red/white jersey barriers from a to b, with a collider.
export function jerseyRow(parent, x1, z1, x2, z2, collide = true) {
  const len = Math.hypot(x2 - x1, z2 - z1)
  const n = Math.floor(len / 2.25)
  const yaw = Math.atan2(-(z2 - z1), x2 - x1)
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    jersey(parent, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, yaw, i % 2 ? '#f4f5f7' : '#e3262e').rotation.y = yaw
  }
  if (collide) solid((x1 + x2) / 2, 0, (z1 + z2) / 2, len, 1.6, 1.0, yaw)
}

// --- Road-closed barricade (two striped boards on A-frame legs).
export function barricade(parent, x, z, yaw, plate) {
  const g = place(parent, x, 0, z, yaw)
  const stripes = cached('tex:barricade', () => tex(paintDiagonal('#ff7a1a', '#ffffff', 256, 48, 24)))
  const board = cached('mat:barricade', () => new MeshStandardMaterial({ map: stripes, roughness: 0.6 }))
  const leg = mat('#f4f5f7')
  for (const sx of [-1.1, 1.1]) {
    rod(g, leg, [sx, 0, -0.45], [sx, 1.35, 0], 0.05)
    rod(g, leg, [sx, 0, 0.45], [sx, 1.35, 0], 0.05)
  }
  box(g, board, 0, 1.15, 0.05, 2.6, 0.3, 0.06)
  box(g, board, 0, 0.7, 0.18, 2.6, 0.26, 0.06)
  if (plate) {
    const pm = new Mesh(G.box, plate)
    pm.position.set(0, 0.95, 0.12)
    pm.scale.set(0.9, 0.42, 0.04)
    g.add(pm)
  }
  return g
}

// --- Hot air balloon: lathed striped envelope, basket, ropes, burner glow.
const envelopeGeo = (() => {
  const pts = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const y = t * 10
    const r = t < 0.15 ? 0.9 + t * 8 : 4.6 * Math.sin(Math.min(1, (t - 0.02) / 0.98) * Math.PI * 0.92 + 0.15) * (t > 0.85 ? Math.sqrt((1 - t) / 0.15) : 1)
    pts.push(new Vector2(Math.max(0.05, r), y))
  }
  return new LatheGeometry(pts, 24)
})()
export function balloon(parent, x, y, z, a = '#e8283a', b = '#ffffff') {
  const g = place(parent, x, y, z)
  const env = cached(`mat:balloon:${a}${b}`, () => new MeshStandardMaterial({ map: tex(paintBands([a, b], 12, { vertical: true }), { wrap: true }), roughness: 0.55 }))
  mesh(g, envelopeGeo, env, 0, 1.8, 0, 1, 1, 1, false)
  block(g, mat('#7a4a26'), 0, -0.2, 0, 1.4, 1.0, 1.4, false)
  box(g, mat('#5a3418'), 0, 0.85, 0, 1.5, 0.12, 1.5, false)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(g, mat('#3a2a1a'), [sx * 0.65, 0.8, sz * 0.65], [sx * 0.9, 2.2, sz * 0.9], 0.03)
  mesh(g, G.sphere, glowMat('#ffb040', 2.2), 0, 1.4, 0, 0.25, 0.25, 0.25, false)
  return g
}

// --- Floating wheel icon (tyre + rim + cloud puff), like the HUD speed icon.
export function wheelIcon(parent, x, y, z, s = 1) {
  const g = place(parent, x, y, z)
  const tyre = mesh(g, new TorusGeometry(0.8 * s, 0.32 * s, 12, 28), mat('#2a2c33', { roughness: 0.7 }), 0, 0, 0)
  tyre.castShadow = false
  mesh(g, G.cyl, mat('#9aa3b0', { metalness: 0.6, roughness: 0.35 }), 0, 0, 0, 0.62 * s, 0.25 * s, 0.62 * s, false).rotation.x = Math.PI / 2
  for (let i = 0; i < 5; i++) {
    const sp = mesh(g, G.box, mat('#5d6573'), 0, 0, 0.14 * s, 0.1 * s, 1.0 * s, 0.06 * s, false)
    sp.rotation.z = (i / 5) * Math.PI
  }
  mesh(g, G.cyl, mat('#e8edf3'), 0, 0, 0.16 * s, 0.18 * s, 0.1 * s, 0.18 * s, false).rotation.x = Math.PI / 2
  for (const [px, py, r] of [[-0.9, -0.7, 0.42], [-0.45, -0.85, 0.36], [-1.3, -0.82, 0.3], [0.0, -0.95, 0.26]]) mesh(g, G.sphere, mat('#ffffff', { roughness: 0.9 }), px * s, py * s, 0.3 * s, r * s, r * 0.8 * s, r * s, false)
  return g
}

// --- Gold trophy (lathe cup, handles, stem, base).
const cupGeo = (() => {
  const pts = [new Vector2(0.01, 0), new Vector2(0.55, 0), new Vector2(0.55, 0.18), new Vector2(0.22, 0.3), new Vector2(0.14, 0.5), new Vector2(0.14, 1.0), new Vector2(0.3, 1.15)]
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.5
    pts.push(new Vector2(0.3 + Math.sin(a) * 0.62, 1.15 + (1 - Math.cos(a)) * 0.2 + i * 0.07))
  }
  pts.push(new Vector2(0.88, 2.1), new Vector2(0.8, 2.1), new Vector2(0.05, 1.5))
  return new LatheGeometry(pts, 32)
})()
export function trophy(parent, x, y, z, s = 1) {
  const g = place(parent, x, y, z)
  mesh(g, cupGeo, gold(), 0, 0, 0, s, s, s)
  for (const sx of [-1, 1]) {
    const h = mesh(g, new TorusGeometry(0.38 * s, 0.08 * s, 8, 16, Math.PI * 1.2), gold(), sx * 0.88 * s, 1.55 * s, 0)
    h.rotation.z = sx > 0 ? -Math.PI * 0.6 : Math.PI * 0.4
  }
  return g
}

// --- Striped quad helper (UV'd plane of any size).
export function bandMat(colors, bands, vertical = false, repeat = 1) {
  return cached(`band:${colors.join()}:${bands}:${vertical}:${repeat}`, () => {
    const t = tex(paintBands(colors, bands, { vertical }), { repeatX: vertical ? repeat : 1, repeatY: vertical ? 1 : repeat })
    return new MeshStandardMaterial({ map: t, roughness: 0.5, side: DoubleSide })
  })
}

// Builds an indexed strip geometry from rows of points (each row = [left, right]).
export function stripGeometry(rows) {
  const pos = []
  const uv = []
  const idx = []
  rows.forEach(([l, r], i) => {
    pos.push(...l, ...r)
    const v = i / (rows.length - 1)
    uv.push(0, v, 1, v)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
