import { MEDALS, STAGE_OBSTACLES, STAGES } from './config.js'
import * as game from './game.js'

// Stage runs: a timer from landing on stage k to landing on stage k + 1, graded
// against a par time (bronze / silver / gold), tries counted since the last
// clear, and a translucent ghost truck replaying your best run of that stage.
// Ghost samples (x, y, z, facing at MEDALS.ghostHz) live in their own
// localStorage key so the main save stays small.
const GHOST_KEY = 'escape-the-ramps:ghosts:v1'
let ghosts = {}
try {
  ghosts = JSON.parse(localStorage.getItem(GHOST_KEY) || '{}') || {}
} catch {
  ghosts = {}
}
function saveGhosts() {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(ghosts))
  } catch {
    // Storage full or blocked: ghosts just are not kept.
  }
}

const slots = (k) => (STAGE_OBSTACLES[k - 1] ?? []).reduce((a, [, n]) => a + n, 0)
// Par = the lane at the stage's target speed, plus a little per hazard.
export function parTime(s) {
  return (s.zs - s.zt + s.gap) / (STAGES.needSpeed(s.k) * MEDALS.parSpeed) + slots(s.k) * MEDALS.perObstacle
}
export const medalTimes = (s) => MEDALS.tiers.map((t) => parTime(s) * t.par)
// 0 = none, 1 bronze, 2 silver, 3 gold.
export function medalFor(s, time) {
  const times = medalTimes(s)
  let tier = 0
  times.forEach((t, i) => {
    if (time <= t) tier = i + 1
  })
  return tier
}

// makeGhost() -> { root (Object3D), set(x, y, z, facing) } is built on first use.
export function createRuns({ makeGhost }) {
  let run = null // { s, t, samples, carry }
  let tries = {} // stage k -> falls since its last clear (this session)
  let ghost = null
  let replay = null // samples being replayed

  function start(s) {
    if (s.finish) {
      run = null
      replay = null
      return
    }
    run = { s, t: 0, samples: [] }
    replay = ghosts[s.k] ?? null
  }
  function cancel() {
    run = null
    replay = null
    if (ghost) ghost.root.visible = false
  }
  // Called when the truck lands on stage s.
  function arrive(s) {
    let result = null
    if (run && run.s.k === s.k - 1) {
      const done = run.s
      const time = run.t
      const tier = medalFor(done, time)
      result = { k: done.k, time, tries: (tries[done.k] ?? 0) + 1, ...game.finishRun(done.k, time, tier) }
      tries[done.k] = 0
      if (result.pb) {
        ghosts[done.k] = run.samples
        saveGhosts()
      }
    }
    start(s)
    return result
  }
  function fall(k) {
    tries[k] = (tries[k] ?? 0) + 1
    game.addFall(k)
  }

  const hz = MEDALS.ghostHz
  function update(dt, p, facing) {
    if (!run) return
    // Sample i is the pose at time i / hz (the replay indexes them that way).
    if (run.samples.length / 4 <= run.t * hz) {
      run.samples.push(Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.z * 10), Math.round(facing * 100))
    }
    run.t += dt
    // Ghost replay.
    if (replay) {
      if (!ghost) ghost = makeGhost()
      const n = replay.length / 4
      const f = run.t * hz
      const i = Math.floor(f)
      if (i >= n - 1) {
        ghost.root.visible = false
        return
      }
      const u = f - i
      const a = i * 4
      const b = a + 4
      const lerp = (j) => (replay[a + j] + (replay[b + j] - replay[a + j]) * u) / 10
      let fa = replay[a + 3] / 100
      let fb = replay[b + 3] / 100
      fb = fa + Math.atan2(Math.sin(fb - fa), Math.cos(fb - fa))
      ghost.root.visible = true
      ghost.set(lerp(0), lerp(1), lerp(2), fa + (fb - fa) * u)
    } else if (ghost) ghost.root.visible = false
  }

  // For the HUD's stage chip (null = hidden).
  function info() {
    if (!run) return null
    const s = run.s
    const rec = game.stageRun(s.k)
    const times = medalTimes(s)
    const nextTier = Math.min(3, rec.medal + 1)
    return {
      k: s.k,
      count: STAGES.count,
      time: run.t,
      best: rec.best,
      medal: rec.medal,
      target: rec.medal >= 3 ? null : { tier: nextTier, time: times[nextTier - 1] },
      tries: (tries[s.k] ?? 0) + 1,
      ghost: !!replay,
    }
  }
  return { arrive, cancel, fall, update, info, get active() { return run } }
}
