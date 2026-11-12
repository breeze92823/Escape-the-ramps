import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace } from 'three'

// Wreck debris, hit chips, slam cracks and water ripples. A wrecked truck throws its four wheels and a
// handful of body panels / bolts: small pooled meshes on simple CPU physics
// (gravity, tumbling, bouncing on the island top, falling into the void past
// its edge), shrinking away at the end of their life. Ripples are flat rings
// that spread and fade on the sea after a splash. No allocations per frame.
const G = -22
const wheelGeo = new CylinderGeometry(0.7, 0.7, 0.6, 14)
wheelGeo.rotateZ(Math.PI / 2)
const panelGeo = new BoxGeometry(1, 1, 1)
const ringGeo = new RingGeometry(0.82, 1, 40)
ringGeo.rotateX(-Math.PI / 2)
const crackGeo = new PlaneGeometry(1, 1)
crackGeo.rotateX(-Math.PI / 2)
// Cracked-floor decal: dark jagged lines spreading from the centre.
function paintCracks() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  x.strokeStyle = 'rgba(20,16,12,0.85)'
  x.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    let px = 128
    let py = 128
    let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4
    x.lineWidth = 5
    x.beginPath()
    x.moveTo(px, py)
    for (let j = 0; j < 6; j++) {
      a += (Math.random() - 0.5) * 0.9
      px += Math.cos(a) * (12 + Math.random() * 12)
      py += Math.sin(a) * (12 + Math.random() * 12)
      x.lineTo(px, py)
      x.lineWidth = Math.max(1, 5 - j)
    }
    x.stroke()
  }
  x.fillStyle = 'rgba(20,16,12,0.5)'
  x.beginPath()
  x.arc(128, 128, 16, 0, Math.PI * 2)
  x.fill()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

export function createDebris(scene, { panels = 18, ripples = 8 } = {}) {
  const pieces = []
  const rubber = new MeshStandardMaterial({ color: '#1c1d22', roughness: 0.85 })
  const hub = new MeshStandardMaterial({ color: '#c9ced8', roughness: 0.3, metalness: 0.7 })
  const add = (geo, material) => {
    const m = new Mesh(geo, material)
    m.visible = false
    m.castShadow = true
    scene.add(m)
    const p = { mesh: m, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, life: 0, max: 1, floor: 0, half: 0, size: 1 }
    pieces.push(p)
    return p
  }
  const wheels = []
  for (let i = 0; i < 4; i++) {
    const p = add(wheelGeo, rubber)
    const cap = new Mesh(new CylinderGeometry(0.34, 0.34, 0.64, 10).rotateZ(Math.PI / 2), hub)
    p.mesh.add(cap)
    wheels.push(p)
  }
  const bits = []
  for (let i = 0; i < panels; i++) bits.push(add(panelGeo, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.2 })))

  // Chips: small flecks knocked off on a hit (the hazard's colour + the truck's paint).
  const chips = []
  for (let i = 0; i < 16; i++) chips.push(add(panelGeo, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })))
  let chipNext = 0
  // Crack decals left where a block slammed down.
  const crackTex = paintCracks()
  const cracks = []
  for (let i = 0; i < 6; i++) {
    const m = new Mesh(crackGeo, new MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))
    m.visible = false
    scene.add(m)
    cracks.push({ mesh: m, t: 0 })
  }
  let crackNext = 0

  const rings = []
  for (let i = 0; i < ripples; i++) {
    const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }))
    m.visible = false
    scene.add(m)
    rings.push({ mesh: m, t: 0, max: 1, r0: 1, r1: 8 })
  }
  let ringNext = 0

  function launch(p, x, y, z, vx, vy, vz, life, floor, half, size) {
    p.mesh.position.set(x, y, z)
    p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.wx = (Math.random() - 0.5) * 18
    p.wy = (Math.random() - 0.5) * 18
    p.wz = (Math.random() - 0.5) * 18
    p.life = p.max = life
    p.floor = floor
    p.half = half
    p.size = size
    p.mesh.visible = true
  }

  return {
    // Blow a truck apart at (x, y, z): its wheels and panels in its colours.
    // `floor` = the island top, `half` = its half-width (no floor beyond).
    wreck(x, y, z, colors, { floor = y, half = 1e9, life = 2.6, power = 1 } = {}) {
      wheels.forEach((p, i) => {
        const sx = i % 2 ? 1 : -1
        const sz = i < 2 ? 1 : -1
        const s = (6 + Math.random() * 5) * power
        p.mesh.scale.setScalar(1)
        launch(p, x + sx * 1.3, y + 0.8, z + sz * 1.3, sx * s, (7 + Math.random() * 6) * power, sz * s * 0.7, life, floor, half, 1)
      })
      bits.forEach((p, i) => {
        const a = Math.random() * Math.PI * 2
        const s = (4 + Math.random() * 9) * power
        const size = i % 3 === 0 ? 0.25 : 0.5 + Math.random() * 0.7
        p.mesh.material.color.set(colors[i % colors.length])
        p.mesh.scale.set(size * (1 + Math.random()), size * 0.25, size)
        launch(p, x + (Math.random() - 0.5) * 2, y + 1 + Math.random(), z + (Math.random() - 0.5) * 2, Math.cos(a) * s, (6 + Math.random() * 10) * power, Math.sin(a) * s, life * (0.7 + Math.random() * 0.5), floor, half, size)
      })
    },
    // A few flecks thrown the way the truck was hit (dx, dz).
    chips(x, y, z, colors, dx = 0, dz = 0, n = 8) {
      const len = Math.hypot(dx, dz) || 1
      for (let i = 0; i < n; i++) {
        const p = chips[chipNext]
        chipNext = (chipNext + 1) % chips.length
        const size = 0.12 + Math.random() * 0.22
        p.mesh.material.color.set(colors[i % colors.length])
        p.mesh.scale.set(size * 1.6, size * 0.4, size)
        const s = 5 + Math.random() * 8
        launch(p, x, y, z, (dx / len) * s + (Math.random() - 0.5) * 6, 3 + Math.random() * 6, (dz / len) * s + (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, y - 1.2, 1e9, size)
      }
    },
    // Cracks on the floor where a block slammed (size m across).
    crack(x, y, z, size) {
      const c = cracks[crackNext]
      crackNext = (crackNext + 1) % cracks.length
      c.mesh.position.set(x, y + 0.04, z)
      c.mesh.scale.set(size * 1.2, 1, size * 1.2)
      c.mesh.rotation.y = Math.random() * Math.PI * 2
      c.t = 0
      c.mesh.visible = true
      c.mesh.material.opacity = 0.9
    },
    // A ring spreading out on the water.
    ripple(x, y, z, r1 = 9, max = 1.4) {
      const r = rings[ringNext]
      ringNext = (ringNext + 1) % rings.length
      r.mesh.position.set(x, y + 0.05, z)
      r.t = 0
      r.max = max
      r.r1 = r1
      r.mesh.visible = true
    },
    update(dt) {
      for (const p of pieces) {
        if (!p.mesh.visible) continue
        p.life -= dt
        const m = p.mesh
        if (p.life <= 0 || m.position.y < p.floor - 40) {
          m.visible = false
          continue
        }
        p.vy += G * dt
        m.position.x += p.vx * dt
        m.position.y += p.vy * dt
        m.position.z += p.vz * dt
        m.rotation.x += p.wx * dt
        m.rotation.y += p.wy * dt
        m.rotation.z += p.wz * dt
        // Bounce on the island top (not past its edge).
        if (Math.abs(m.position.x) < p.half && m.position.y < p.floor + 0.3 && p.vy < 0 && m.position.y > p.floor - 1) {
          m.position.y = p.floor + 0.3
          p.vy = -p.vy * 0.38
          p.vx *= 0.7
          p.vz *= 0.7
          p.wx *= 0.6
          p.wy *= 0.6
          p.wz *= 0.6
        }
        // Shrink away at the end.
        const k = Math.min(1, p.life / 0.4)
        if (k < 1) m.scale.multiplyScalar(0.92)
      }
      for (const c of cracks) {
        if (!c.mesh.visible) continue
        c.t += dt
        c.mesh.material.opacity = 0.9 * Math.max(0, 1 - Math.max(0, c.t - 2) / 1.5)
        if (c.t > 3.5) c.mesh.visible = false
      }
      for (const r of rings) {
        if (!r.mesh.visible) continue
        r.t += dt
        const u = r.t / r.max
        if (u >= 1) {
          r.mesh.visible = false
          continue
        }
        const rad = 1 + (r.r1 - 1) * (1 - (1 - u) ** 2)
        r.mesh.scale.set(rad, 1, rad)
        r.mesh.material.opacity = 0.8 * (1 - u)
      }
    },
  }
}
