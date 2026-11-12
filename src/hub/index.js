import { Group } from 'three'
import { bake } from '../bake.js'
import { buildGround } from './ground.js'
import { buildCenter } from './center.js'
import { buildShowroom } from './showroom.js'
import { buildWest } from './west.js'
import { buildSouth } from './south.js'
import { buildStages } from './stages.js'
import { createObstacles } from './obstacles.js'
import { updateFields } from '../effects.js'

export { HUB } from './layout.js'

// Builds the whole hub. Static props are merged into one mesh per material
// (bake.js) to keep draw calls low; animated pieces, signs and sparkle fields
// stay live. Returns the gameplay hooks the main loop needs:
//   prompts - interactables ({ x, z, r, title, action, kind, ... }) for the E prompt
//   afk     - AFK ramp zones ({ x0, x1, z0, z1, mult, label, need = Rebirths to ride, gate = lock Group or null })
//   boosts  - boost strip zones
//   carPads - showroom pad meshes by car id (recoloured when owned)
export function buildHub(scene) {
  const statics = new Group()
  const live = new Group()
  scene.add(live)
  const ctx = { statics, live, anim: [], prompts: [], afk: [], boosts: [], carPads: {} }

  buildGround(statics)
  buildCenter(ctx)
  buildShowroom(ctx)
  buildWest(ctx)
  buildSouth(ctx)
  const stages = buildStages(ctx)
  const obstacles = createObstacles(ctx)

  const baked = bake(statics, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)

  return {
    prompts: ctx.prompts,
    afk: ctx.afk,
    boosts: ctx.boosts,
    carPads: ctx.carPads,
    stages,
    winPads: ctx.winPads,
    gears: ctx.gears,
    rings: ctx.rings,
    obstacles,
    update(dt, elapsed, pz = 0) {
      obstacles.update(dt, elapsed, pz)
      for (const fn of ctx.anim) fn(dt, elapsed)
      ctx.gears.update(dt, elapsed)
      updateFields(elapsed)
    },
  }
}
