import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { cached, paintStudGrass, tex } from '../paint.js'
import { HUB } from './layout.js'
import { guardrail, solid } from './kit.js'

// The ground: the hub's thick grass slab (the stage lane's slabs are built by
// stages.js with the same slab()) with dirt sides, invisible walls on every open edge
// and grey guardrails along the hub's border. The AFK quarter-pipes overhang
// the west edge, so that edge has gaps where the ramps are.
export function slab(parent, x0, x1, z0, z1, top = 0, depth = 5) {
  const w = x1 - x0
  const d = z1 - z0
  const grassCanvas = cached('canvas:grass', () => paintStudGrass())
  const topMat = new MeshStandardMaterial({ map: tex(grassCanvas, { repeatX: w / 16, repeatY: d / 16 }), roughness: 0.92 })
  const side = cached('mat:dirt', () => new MeshStandardMaterial({ color: '#8a5a34', roughness: 1 }))
  const m = new Mesh(new BoxGeometry(w, depth, d), [side, side, topMat, side, side, side])
  m.position.set((x0 + x1) / 2, top - depth / 2, (z0 + z1) / 2)
  m.receiveShadow = true
  parent.add(m)
  solid((x0 + x1) / 2, top - depth, (z0 + z1) / 2, w, depth, d)
}

const wall = (x0, z0, x1, z1) => {
  const len = Math.hypot(x1 - x0, z1 - z0)
  solid((x0 + x1) / 2, 0, (z0 + z1) / 2, x0 === x1 ? 1 : len, 6, x0 === x1 ? len : 1)
}

export function buildGround(statics) {
  const { west: W, east: E, north: N, south: S } = HUB.field
  slab(statics, W, E, N, S)

  // Invisible edges.
  wall(E, N, E, S)
  wall(W, S, E, S)
  // North edge: open only across the launch ramp's lip (the jump to Stage 1).
  const R = HUB.launch.half
  wall(W, N, -R, N)
  wall(R, N, E, N)
  // West edge: closed between and beyond the ramps.
  let z = N
  for (const [a, b] of HUB.rampSpans) {
    if (a > z) wall(W, z, W, a)
    z = b
  }
  wall(W, z, W, S)

  // Guardrails (visual + collider), just inside the edges.
  const i = 0.8
  guardrail(statics, E - i, N + 1, E - i, S - 1)
  guardrail(statics, W + 1, S - i, E - 1, S - i)
  guardrail(statics, W + 1, N + i, -R - 0.5, N + i)
  guardrail(statics, R + 0.5, N + i, E - 1, N + i)
  guardrail(statics, W + i, HUB.rampSpans[HUB.rampSpans.length - 1][1] + 2, W + i, S - 1)
  guardrail(statics, W + i, N + 1, W + i, HUB.rampSpans[0][0] - 1)
}
