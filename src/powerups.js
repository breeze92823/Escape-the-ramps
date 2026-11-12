import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry, Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)
const dir = new Vector3()

// What the timed power-ups look like on the player's truck (main.js adds the group to
// the player group, so it survives truck swaps): three balloons on strings tied to the
// bed (Balloons) and a pair of feathered wings on the roof (Wings), spread and flapping
// while gliding, folded on the ground. Truck local frame: +Z nose, feet at y = 0.
const mat = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.35, ...extra })

function makeBalloons() {
  const g = new Group()
  const ball = new SphereGeometry(0.55, 16, 12)
  const string = new CylinderGeometry(0.015, 0.015, 1, 4)
  const strMat = mat('#2a2a2a', { roughness: 0.8 })
  const items = []
  ;[['#e8263a', -0.55, 0], ['#ffd21a', 0.55, 0.15], ['#1f7dff', 0, -0.45]].forEach(([c, x, z], i) => {
    const s = new Mesh(string, strMat)
    const b = new Mesh(ball, mat(c, { roughness: 0.25 }))
    b.scale.set(1, 1.18, 1)
    b.castShadow = true
    g.add(s, b)
    items.push({ s, b, x, z, h: 3.6 + i * 0.35, ph: i * 2.1 })
  })
  const anchor = { x: 0, y: 1.9, z: -1.3 } // the truck bed
  g.userData.update = (t) => {
    for (const it of items) {
      const bx = it.x + Math.sin(t * 1.3 + it.ph) * 0.18
      const bz = anchor.z + it.z + Math.cos(t * 1.1 + it.ph) * 0.15
      const by = anchor.y + it.h + Math.sin(t * 2 + it.ph) * 0.12
      it.b.position.set(bx, by, bz)
      // String from the bed to the balloon's knot.
      const dx = bx - anchor.x
      const dy = by - 0.6 - anchor.y
      const dz = bz - anchor.z
      const len = Math.hypot(dx, dy, dz)
      it.s.position.set(anchor.x + dx / 2, anchor.y + dy / 2, anchor.z + dz / 2)
      it.s.scale.y = len
      it.s.quaternion.setFromUnitVectors(UP, dir.set(dx / len, dy / len, dz / len))
    }
  }
  return g
}

function makeWings() {
  const shape = new Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.6, 0.9, 2.2, 1.5, 3.6, 1.3)
  shape.lineTo(2.6, 0.6)
  shape.lineTo(3.1, 0.25)
  shape.lineTo(2.0, -0.05)
  shape.lineTo(2.3, -0.4)
  shape.quadraticCurveTo(1.0, -0.6, 0, 0)
  const geo = new ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.04, bevelSegments: 1 })
  geo.rotateX(-Math.PI / 2) // lie flat: the shape's +Y becomes -Z (feathers sweep back)
  const g = new Group()
  g.position.set(0, 2.25, -0.2)
  const feather = mat('#8fe0ff', { emissive: '#3aa8ff', emissiveIntensity: 0.3 })
  const rimMat = mat('#ffffff', { roughness: 0.4 })
  const halves = []
  for (const sx of [-1, 1]) {
    const pivot = new Group()
    pivot.scale.x = sx
    const m = new Mesh(geo, feather)
    m.castShadow = true
    m.scale.setScalar(0.7)
    m.position.z = 0.5
    const rim = new Mesh(geo, rimMat)
    rim.scale.set(0.75, 0.6, 0.78)
    rim.position.set(-0.03, -0.03, 0.5)
    pivot.add(m, rim)
    g.add(pivot)
    halves.push(pivot)
  }
  let open = 0
  g.userData.update = (t, dt, gliding) => {
    open += ((gliding ? 1 : 0) - open) * Math.min(1, dt * 8)
    const flap = gliding ? Math.sin(t * 9) * 0.25 : Math.sin(t * 2) * 0.05
    // Folded: swept up along the roof; open: spread flat with a flap.
    const fold = 1.2 * (1 - open)
    halves[0].rotation.set(0, -0.5 * (1 - open), fold + flap)
    halves[1].rotation.set(0, 0.5 * (1 - open), -(fold + flap))
  }
  return g
}

export function createPowerupVisuals(parent) {
  const balloons = makeBalloons()
  const wings = makeWings()
  balloons.visible = wings.visible = false
  parent.add(balloons, wings)
  let t = 0
  return {
    // on: { balloons, wings, gliding } for this frame.
    update(dt, on) {
      t += dt
      balloons.visible = on.balloons
      wings.visible = on.wings
      if (on.balloons) balloons.userData.update(t)
      if (on.wings) wings.userData.update(t, dt, on.gliding)
    },
  }
}
