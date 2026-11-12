import { inputState } from './input.js'
import { syncYawToPlayer } from './camera.js'
import { RAPIER, alpha, onTick, segmentClear, world } from './physics.js'
import { AFK_AUTO, PHYSICS, PLAYER_DIMS, SPAWN, SPAWN_FACING, TRUCK } from './config.js'

// The local player singleton, mutated in place. A kinematic Rapier capsule
// driven by Rapier's KinematicCharacterController: it slides along walls,
// autosteps small ledges, climbs slopes up to PHYSICS.maxSlope, snaps down
// steps and shoves dynamic bodies (crates, balls) with PHYSICS.pushMass.
// Gravity, jumping (with coyote time and a jump buffer) and acceleration are
// ours; collision resolution is Rapier's. Stepped once per physics tick.
export const player = {
  position: { x: 0, y: 0, z: 0 }, // capsule base (feet), at the latest tick
  renderPosition: { x: 0, y: 0, z: 0 }, // feet, interpolated for this frame
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  facing: SPAWN_FACING, // yaw the truck faces, radians (0 = +Z)
  speed: 0, // signed forward speed, m/s
  steer: 0, // -1..1 eased steering input
  nitro: false, // set by game.js while nitro burns
  boost: 0, // s left on the boost strip's push
  topMul: 1, // top-speed factor from the Speed stat (main.js)
  landed: 0, // landing impact this tick (suspension kick)
  ramp: null, // { r, s, v, dir, ctl } while riding an AFK quarter-pipe
  rampPitch: 0, // radians the truck is tilted up on the quarter-pipe
  autoRide: false, // the AFK ramp rides itself until a control is pressed
  dims: { ...PLAYER_DIMS },
  // Stage surfaces and hazards (main.js sets these each frame from hub/obstacles.js).
  grip: Infinity, // 1/s the sliding velocity lines up with the heading (ice is low)
  surfTop: 1, // top-speed factor of the surface (mud)
  belt: { x: 0, z: 0 }, // conveyor push, m/s
  knock: { x: 0, z: 0 }, // hazard shove, m/s, decays
  stun: 0, // s of no control left (squashed)
  frozen: false, // held in place (sinking in the sea, wrecked): no physics until the next reset
  // Power-ups (main.js sets these each frame from game.js).
  gravityMul: 1, // airborne gravity factor (Balloons)
  glide: null, // { gravityMul, fall } while Wings are active: holding HOP in the air glides
  gliding: false, // this tick: falling with the wings spread
}

// A hazard hit: shove the truck (m/s), kill most of its speed, optionally stun it.
export function knock(vx, vy, vz, { keep = 0.3, stun = 0 } = {}) {
  player.knock.x = vx
  player.knock.z = vz
  if (vy > 0) {
    // Already flying (thrown by one hazard into another): only a little more lift,
    // so chained hits can't stack into a launch over the 2.4 m guardrails.
    player.velocity.y = Math.max(player.velocity.y, player.grounded ? vy : vy * 0.4)
    player.grounded = false
    launched = true
  }
  player.speed *= keep
  player.stun = Math.max(player.stun, stun)
}
// Moves the truck without touching its velocity (the fall's camera cut to the sea).
export function warpTo(x, y, z) {
  player.position.x = prev.x = player.renderPosition.x = x
  player.position.y = prev.y = player.renderPosition.y = y
  player.position.z = prev.z = player.renderPosition.z = z
  body?.setTranslation({ x, y: y + HALF, z }, true)
  body?.setNextKinematicTranslation({ x, y: y + HALF, z })
}
// A bounce pad: straight up.
export function launch(vy) {
  player.velocity.y = vy
  player.grounded = false
  launched = true
}

const HALF = PLAYER_DIMS.height / 2 // capsule centre above the feet
const prev = { x: 0, y: 0, z: 0 }
let body = null
let collider = null
let controller = null
let sinceGrounded = 0
let jumpQueued = 0 // s left on a buffered jump
let slope = 0 // sine of the ground slope along the heading
let airborneCtl = false // controller currently in its airborne setup (no autostep/snap)
let launched = false // a knock/bounce asked for a take-off this tick
const drive = { x: 0, z: 0 } // the engine's share of the velocity (slides on ice)
function setAirborneController(air) {
  if (air === airborneCtl) return
  airborneCtl = air
  if (air) {
    controller.disableAutostep()
    controller.disableSnapToGround()
  } else {
    controller.enableAutostep(PHYSICS.stepHeight, 0.15, false)
    controller.enableSnapToGround(PHYSICS.snapToGround)
  }
}

export function createPlayerBody() {
  const r = PLAYER_DIMS.radius
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y + HALF, SPAWN.z))
  collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - r, r).setFriction(0), body)

  controller = world.createCharacterController(0.02)
  controller.setUp({ x: 0, y: 1, z: 0 })
  controller.enableAutostep(PHYSICS.stepHeight, 0.15, false)
  controller.enableSnapToGround(PHYSICS.snapToGround)
  controller.setMaxSlopeClimbAngle((PHYSICS.maxSlope * Math.PI) / 180)
  controller.setMinSlopeSlideAngle(((PHYSICS.maxSlope + 5) * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  airborneCtl = false
  controller.setCharacterMass(PHYSICS.pushMass)

  resetPlayer()
  onTick(step)
}

export function resetPlayer(spawn = SPAWN, facing = SPAWN_FACING) {
  player.position.x = prev.x = player.renderPosition.x = spawn.x
  player.position.y = prev.y = player.renderPosition.y = spawn.y
  player.position.z = prev.z = player.renderPosition.z = spawn.z
  player.velocity.x = player.velocity.y = player.velocity.z = 0
  player.speed = player.steer = player.boost = player.stun = 0
  player.frozen = false
  player.knock.x = player.knock.z = player.belt.x = player.belt.z = 0
  drive.x = drive.z = 0
  launched = false
  player.ramp = null
  player.rampPitch = 0
  player.autoRide = false
  player.grounded = true
  player.facing = facing
  body?.setTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z }, true)
  body?.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z })
}

export function respawn() {
  resetPlayer()
  syncYawToPlayer()
}

function approach(v, target, maxDelta) {
  return Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta
}

// Truck driving: W/S throttle along the heading, A/D steer (rate grows with
// speed, reversed when backing up). Nitro and the boost strip raise the top
// speed. On the ground the vertical velocity follows the surface, so leaving
// a ramp keeps its climb rate and the truck launches.
// Quarter-pipes ({ x0 foot x, R radius, z0, z1, need }), rising toward -X.
// canRide(r) says whether a ramp is unlocked; a locked one has a gate at its
// foot (GATE m east of it) that bounces the truck back and calls onBlocked(r).
let ramps = []
let canRide = () => true
let onBlocked = () => {}
const GATE = 0.4
// Launch-ramp lips (hub boost ramp + stage ramps): {x0, x1, z0, z1, tan}, a
// zone just past each lip and the slope there (main.js).
let launchRamps = []
let launchedAir = false
export function setLaunchRamps(list) {
  launchRamps = list
}

export function setRamps(list, gate = {}) {
  ramps = list
  if (gate.canRide) canRide = gate.canRide
  if (gate.onBlocked) onBlocked = gate.onBlocked
}

// Height of the ride point at arc length s (s < 0 = flat pad east of the foot).
function rampHeight(r, s) {
  const L = (r.R * Math.PI) / 2
  return s <= 0 ? 0 : s <= L ? r.R * (1 - Math.cos(s / r.R)) : r.R + (s - L)
}

// Auto ride: climb with the engine until the truck has just enough energy to
// coast up to AFK_AUTO.height, coast, roll back down, brake on the pad, repeat.
function autoPush(R) {
  const g = -PHYSICS.gravity
  if (R.v < 0 && R.s < 0.3) return TRUCK.brake
  const energy = (R.v * R.v) / 2 + g * rampHeight(R.r, R.s)
  return R.v >= 0 && energy < g * AFK_AUTO.height * R.r.R ? TRUCK.accel * AFK_AUTO.push : 0
}

// On a quarter-pipe the truck moves in 1-D along the curve (arc length s,
// speed v up the ramp): gravity pulls it back by g sin(theta), the engine
// pushes by accel cos(theta), so holding W settles it near 45 degrees and
// letting go rolls it back down. Past the top of the arc the face is
// vertical, so a fast truck flies straight up and drops back onto it.
// While auto riding, s may go below 0 (the truck rolls back onto the pad).
function rampStep(dt) {
  const R = player.ramp
  const r = R.r
  const L = (r.R * Math.PI) / 2
  if (player.autoRide && inputState.controls !== R.ctl) player.autoRide = false
  const th = Math.max(0, Math.min(R.s / r.R, Math.PI / 2))
  const push = player.autoRide ? autoPush(R) : Math.max(0, inputState.move.z) * TRUCK.accel * (player.nitro ? 1.8 : 1)
  R.v += (PHYSICS.gravity * Math.sin(th) + push * Math.cos(th)) * dt
  R.v *= 1 - 0.1 * dt
  R.s += R.v * dt
  if (player.autoRide && R.s < -AFK_AUTO.runout) {
    R.s = -AFK_AUTO.runout
    R.v = Math.max(0, R.v)
  }
  const z = Math.max(r.z0 + 1.8, Math.min(r.z1 - 1.8, player.position.z))
  if (R.s <= 0 && !player.autoRide) {
    player.ramp = null
    player.rampPitch = 0
    player.speed = R.v * R.dir
    const next = { x: r.x0 + Math.max(0.05, -R.s), y: 0.05 + HALF, z }
    body.setNextKinematicTranslation(next)
    body.setTranslation(next, true)
    player.position.x = next.x
    player.position.y = 0.05
    player.velocity.y = 0
    return
  }
  const t = Math.max(0, Math.min(R.s / r.R, Math.PI / 2))
  const x = R.s <= 0 ? r.x0 - R.s : R.s <= L ? r.x0 - r.R * Math.sin(t) : r.x0 - r.R
  const y = rampHeight(r, R.s)
  player.rampPitch = t * R.dir
  player.speed = R.v * R.dir
  player.velocity.x = -Math.cos(t) * R.v
  player.velocity.y = Math.sin(t) * R.v
  player.velocity.z = 0
  player.grounded = R.s <= L + 0.05
  player.position.x = x
  player.position.y = y
  player.position.z = z
  body.setNextKinematicTranslation({ x, y: y + HALF, z })
}

function step(dt) {
  prev.x = player.position.x
  prev.y = player.position.y
  prev.z = player.position.z
  player.landed = 0

  if (player.frozen) return
  if (player.ramp) return rampStep(dt)
  // Rolling onto a quarter-pipe's foot while heading west (or backing in) switches to the arc.
  if (player.grounded && player.velocity.x < -1) {
    for (const r of ramps) {
      const p = player.position
      if (p.z > r.z0 + 1 && p.z < r.z1 - 1 && p.x < r.x0 && p.x > r.x0 - 3 && canRide(r)) {
        const dir = player.speed >= 0 ? 1 : -1
        player.facing = dir > 0 ? -Math.PI / 2 : Math.PI / 2
        player.ramp = { r, s: Math.max(0.01, r.x0 - p.x), v: -player.velocity.x, dir, ctl: inputState.controls }
        player.autoRide = true
        return rampStep(dt)
      }
    }
  }

  player.stun = Math.max(0, player.stun - dt)
  const stunned = player.stun > 0
  const throttle = stunned ? 0 : inputState.move.z
  const steerIn = stunned ? 0 : inputState.move.x
  player.boost = Math.max(0, player.boost - dt)
  const top = TRUCK.topSpeed * player.topMul * (player.nitro ? TRUCK.nitroMul : 1) * (player.boost > 0 ? TRUCK.boostMul : 1) * player.surfTop
  let target = throttle > 0 ? throttle * top : throttle < 0 ? throttle * TRUCK.reverseSpeed : 0
  if ((player.nitro || player.boost > 0) && throttle >= 0 && !stunned) target = Math.max(target, top * 0.85)
  if (player.grounded) {
    const braking = target !== 0 && Math.sign(target) !== Math.sign(player.speed) && Math.abs(player.speed) > 0.5
    const rate = target === 0 ? TRUCK.coast : braking ? TRUCK.brake : TRUCK.accel * (player.nitro ? 1.8 : 1)
    player.speed = approach(player.speed, target, rate * dt)
  } else {
    player.speed *= 1 - 0.05 * dt
  }
  player.steer = approach(player.steer, steerIn, 5 * dt)
  const turnK = Math.min(1, Math.abs(player.speed) / TRUCK.fullTurnSpeed) / (1 + Math.abs(player.speed) / 45)
  const dir = player.speed >= 0 ? 1 : -1
  player.facing -= player.steer * TRUCK.turnRate * turnK * dir * dt * (player.grounded ? 1 : 0.5)
  // On ice the engine's velocity only slowly lines up with the heading (the truck slides).
  const hx = Math.sin(player.facing) * player.speed
  const hz = Math.cos(player.facing) * player.speed
  if (player.grounded && Number.isFinite(player.grip)) {
    const k = 1 - Math.exp(-player.grip * dt)
    drive.x += (hx - drive.x) * k
    drive.z += (hz - drive.z) * k
  } else {
    drive.x = hx
    drive.z = hz
  }
  // Hazard shoves fade (slower in the air); conveyors only push on the ground.
  const fade = Math.exp(-(player.grounded ? 3 : 0.6) * dt)
  player.knock.x *= fade
  player.knock.z *= fade
  const bx = player.grounded ? player.belt.x : 0
  const bz = player.grounded ? player.belt.z : 0
  player.velocity.x = drive.x + player.knock.x + bx
  player.velocity.z = drive.z + player.knock.z + bz

  // Hop: buffered a little before landing, and allowed a little after leaving a ledge.
  if (inputState.jump) {
    jumpQueued = PHYSICS.jumpBuffer
    inputState.jump = false
  }
  sinceGrounded = player.grounded ? 0 : sinceGrounded + dt
  let jumped = launched
  launched = false
  if (!jumped && !stunned && jumpQueued > 0 && sinceGrounded <= PHYSICS.coyoteTime) {
    player.velocity.y = PHYSICS.jumpSpeed
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
  }
  jumpQueued = Math.max(0, jumpQueued - dt)

  const fallSpeed = player.velocity.y
  // Airborne power-ups: Balloons lower gravity; Wings glide (HOP held, falling) lower it
  // more and cap the fall speed. Launch speeds are untouched, so flights just get longer.
  const air = !player.grounded && !jumped
  player.gliding = air && !!player.glide && inputState.jumpHeld && player.velocity.y < 0
  const gMul = !air ? 1 : player.gliding ? Math.min(player.gravityMul, player.glide.gravityMul) : player.gravityMul
  player.velocity.y += PHYSICS.gravity * gMul * dt
  if (player.gliding) player.velocity.y = Math.max(player.velocity.y, -player.glide.fall)

  const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt }
  // No autostep/snap in the air: a jump that falls short must hit the far
  // plateau's cliff and drop, not get stepped up (then launched) over its edge.
  // Same while a hazard is shoving the truck: thrown into a post or rail, it
  // must bounce off, not autostep up onto the rail and over it.
  const shoved = Math.hypot(player.knock.x, player.knock.z) > 6
  setAirborneController(!player.grounded || jumped || shoved)
  controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
  let moved = controller.computedMovement()
  const wasGrounded = player.grounded
  // A jump that comes up short reaches the far plateau below its edge: the
  // capsule's round bottom would rest on (or slide up over) the corner and
  // count as a landing. An airborne truck only lands with ground under its
  // front; caught on a bare corner it backs off and drops.
  let caughtEdge = false
  if (!wasGrounded && !jumped && desired.y <= 0 && (moved.y > 0.005 || controller.computedGrounded())) {
    const t0 = body.translation()
    // Probe under the front of the truck: it may land nose-first, but only
    // if it got there about level with the edge (feet at most 0.25 m below).
    const h0 = Math.hypot(desired.x, desired.z) || 1
    const fx = t0.x + moved.x + (desired.x / h0) * PLAYER_DIMS.radius * 0.6
    const fz = t0.z + moved.z + (desired.z / h0) * PLAYER_DIMS.radius * 0.6
    const feet = t0.y + moved.y - HALF
    if (segmentClear(fx, feet + 0.25, fz, fx, feet - 0.45, fz) === 1) {
      const h = Math.hypot(desired.x, desired.z) || 1
      controller.computeColliderMovement(collider, { x: (-desired.x / h) * 0.06, y: Math.min(desired.y, -0.02), z: (-desired.z / h) * 0.06 }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      moved = controller.computedMovement()
      player.speed *= 0.3
      caughtEdge = true
    }
  }
  player.grounded = !jumped && !caughtEdge && controller.computedGrounded()
  player.landed = !wasGrounded && player.grounded ? Math.min(8, Math.max(0, -fallSpeed) * 0.5) : 0

  if (player.grounded && !jumped) {
    let vy = Math.max(-2, Math.min(30, moved.y / dt))
    // Touching down from the air never adds upward speed: a truck thrown into a
    // post or rail corner gets slid up it by the controller, which would
    // otherwise turn into a launch up and over the rail.
    if (!wasGrounded || shoved) vy = Math.min(vy, Math.max(0, fallSpeed))
    player.velocity.y = vy
  }
  else if (player.velocity.y > 0 && moved.y < desired.y * 0.5) player.velocity.y = 0

  // Leaving a launch ramp's lip: take off at exactly the ramp's angle. The
  // per-step moved.y above is noisy at speed (a step can straddle the lip),
  // and stage gaps are sized from this launch (stages.js).
  // (Once per airborne phase: grounded flickers on a ramp at speed.)
  if (player.grounded || jumped) launchedAir = false
  else if (!launchedAir && player.speed > 0) {
    const t1 = body.translation()
    const px = t1.x + moved.x
    const pz = t1.z + moved.z
    for (const r of launchRamps) {
      if (px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1) {
        player.velocity.y = Math.max(player.velocity.y, player.speed * r.tan)
        launchedAir = true
        break
      }
    }
  }

  // Slopes: gravity along the heading slows a climb and rolls the truck back
  // down (the AFK quarter-pipes), using the slope of the last real movement.
  const along = moved.x * Math.sin(player.facing) + moved.z * Math.cos(player.facing)
  if (player.grounded && Math.abs(along) > 1e-4) slope = moved.y / Math.hypot(along, moved.y) * Math.sign(along)
  if (!player.grounded) slope = 0
  if (Math.abs(slope) > 0.06) player.speed += PHYSICS.gravity * slope * dt

  // Driving into a wall bleeds speed (the controller already slides along it).
  const want = Math.hypot(desired.x, desired.z)
  if (want > 0.01 && Math.hypot(moved.x, moved.z) < want * 0.45) player.speed *= Math.pow(0.02, dt)

  const t = body.translation()
  const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z }
  // A locked AFK ramp's gate: the truck bounces off its foot.
  for (const r of ramps) {
    const gx = r.x0 + GATE
    if (next.x < gx && t.x >= gx - 0.05 && next.z > r.z0 - 0.5 && next.z < r.z1 + 0.5 && next.y - HALF < 2.5 && !canRide(r)) {
      next.x = gx
      player.speed *= -0.3
      onBlocked(r)
    }
  }
  body.setNextKinematicTranslation(next)
  player.position.x = next.x
  player.position.y = next.y - HALF
  player.position.z = next.z

  if (player.position.y < PHYSICS.killY) respawn()
}

// Called once per frame after the physics ticks: interpolated feet position.
export function interpolate() {
  const p = player.position
  const r = player.renderPosition
  r.x = prev.x + (p.x - prev.x) * alpha
  r.y = prev.y + (p.y - prev.y) * alpha
  r.z = prev.z + (p.z - prev.z) * alpha
}
