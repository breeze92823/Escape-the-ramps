import { MeshStandardMaterial } from 'three'
import { CARS, SHOWROOM_ROWS } from '../config.js'
import { neon, sign } from '../propkit.js'
import { buildTruck } from '../truck.js'
import { cached, paintPlastic, tex } from '../paint.js'
import { HUB } from './layout.js'
import { block, box, glowMat, mat, place, solid, solidHull } from './kit.js'
import { priceLines } from './center.js'

// The car showroom east of spawn: a grey two-tier stand (lower front tier,
// higher back tier with a dark inset panel), a ramp up its north end, and
// twelve animal trucks on glowing pads (green = owned, red = wins, yellow =
// gems), each with its "+N Speed / X WINS REQUIRED" sign and a Buy prompt.

const fmt = (n) => (n >= 1000 ? `${n / 1000}K` : String(n))

export function buildShowroom(ctx) {
  const { statics, live } = ctx
  const S = HUB.showroom
  const concrete = cached('mat:concrete', () => new MeshStandardMaterial({ map: tex(paintPlastic('#c3c9d2', 'rgba(0,0,0,0.06)', 128, 8), { repeatX: 8, repeatY: 8 }), roughness: 0.85 }))
  const side = mat('#a7aebb', { roughness: 0.85 })
  const zc = (S.z0 + S.z1) / 2
  const len = S.z1 - S.z0
  // Lower tier.
  block(statics, side, (S.x0 + S.split) / 2, 0, zc, S.split - S.x0, S.lowerTop - 0.05, len)
  block(statics, concrete, (S.x0 + S.split) / 2, S.lowerTop - 0.05, zc, S.split - S.x0, 0.05, len, false)
  block(statics, mat('#dfe3ea'), S.x0 + 0.15, S.lowerTop - 0.05, zc, 0.3, 0.12, len) // front lip
  solid((S.x0 + S.split) / 2, 0, zc, S.split - S.x0, S.lowerTop, len)
  // Upper tier, with its dark inset panel facing the lower tier.
  block(statics, side, (S.split + S.x1) / 2, 0, zc, S.x1 - S.split, S.upperTop - 0.05, len)
  block(statics, concrete, (S.split + S.x1) / 2, S.upperTop - 0.05, zc, S.x1 - S.split, 0.05, len, false)
  block(statics, mat('#77808f'), S.split - 0.02, S.lowerTop + 0.35, zc, 0.06, S.upperTop - S.lowerTop - 0.7, len - 2)
  block(statics, mat('#dfe3ea'), S.split + 0.15, S.upperTop - 0.05, zc, 0.3, 0.12, len)
  solid((S.split + S.x1) / 2, 0, zc, S.x1 - S.split, S.upperTop, len)
  // Ramp up the north end onto the lower tier.
  const rz = S.z0 - 9
  const hull = []
  for (const x of [S.x0, S.split]) hull.push([x, 0, rz], [x, 0, S.z0], [x, S.lowerTop, S.z0])
  solidHull(hull)
  const rampLen = Math.hypot(9, S.lowerTop)
  const ramp = box(statics, concrete, (S.x0 + S.split) / 2, S.lowerTop / 2, S.z0 - 4.5, S.split - S.x0, 0.12, rampLen)
  ramp.rotation.x = -Math.atan2(S.lowerTop, 9)
  // Wedge sides under the ramp.
  box(statics, side, S.x0 + 0.1, S.lowerTop / 4, S.z0 - 3, 0.2, S.lowerTop / 2, 6)
  box(statics, side, S.split - 0.1, S.lowerTop / 4, S.z0 - 3, 0.2, S.lowerTop / 2, 6)

  // Pads + trucks.
  ctx.carPads = {}
  SHOWROOM_ROWS.forEach((row, ri) => {
    const x = ri === 0 ? (S.x0 + S.split) / 2 + 0.3 : (S.split + S.x1) / 2 - 0.6
    const y = ri === 0 ? S.lowerTop : S.upperTop
    row.forEach((id, i) => {
      const car = CARS[id]
      const z = S.z0 + 5.5 + i * ((len - 11) / (row.length - 1))
      block(statics, mat('#1b1f2e'), x, y, z, 7.4, 0.1, 7.4, false)
      const pad = neon(car.gems ? '#ffe21a' : '#ff2236', 1.25)

      const padMesh = block(live, pad, x, y + 0.1, z, 6.6, 0.05, 6.6, false)
      ctx.carPads[id] = padMesh
      const g = place(statics, x, y + 0.12, z, -Math.PI / 2) // facing west, toward spawn (baked: static)
      const t = buildTruck(car.paint)
      g.add(t.root)
      const sub = car.gems ? null : `${fmt(car.wins)} WINS REQUIRED`
      const s = sign(priceLines(`+${car.bonus} Speed`, car.gems, sub), 2.1)
      s.position.set(x, y + 5.3, z)
      live.add(s)
      ctx.prompts.push({ x, z, y, r: ri === 0 ? 6.5 : 9.5, title: car.name, action: 'Buy', kind: 'car', car: id })
    })
  })
}
