import { AFK_RAMPS } from '../config.js'

// Where everything in the hub sits (metres; +X east, +Z south, -Z = north
// toward Stage 1). Spawn is the dirt pad at the origin.
export const HUB = {
  field: { west: -62, east: 76, north: -48, south: 150 },
  lane: { half: 28, fence: 26 }, // the stage lane heading north (stages.js)
  rampFootX: -53, // x where each AFK quarter-pipe leaves the ground (rising westward)
  rampWidth: 11,
  rampRadius: 15,
  rampSpans: AFK_RAMPS.map((r) => [r.z - 5.5, r.z + 5.5]),
  spawnPad: { x: 0, z: 0, size: 20 },
  // Blue boost ramp: foot at z=foot, lip (height m) on the north edge, then a
  // `gap` of open air before Stage 1's plateau.
  launch: { half: 15, foot: -18, lip: -48, height: 5, gap: 16 },
  chest: { x: 36, z: -40 },
  tuning: { x: 27, z: -21 },
  frog: { x: 33, z: -7 },
  magnet: { x: 43, z: -14 },
  curb: { x0: 19, x1: 75, z: -31 },
  trophy: { x: -40, z: -41 },
  showroom: { x0: 50, x1: 75, z0: -14, z1: 54, lowerTop: 1.0, upperTop: 3.4, split: 61 },
  portal: { x: 64, z: 72 },
  fence: { z: 96 },
  stop: { x: 8, z: 146 },
  wings: { x: -45, z: 19 },
  bull: { x: -43, z: 44 },
  boards: { x: -57, zs: [60, 75, 90] },
}
