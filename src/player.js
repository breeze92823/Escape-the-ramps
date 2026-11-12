import { inputState } from './input.js'
import { syncYawToPlayer } from './camera.js'
import { RAPIER, alpha, onTick, world } from './physics.js'
import { PHYSICS, PLAYER_DIMS, SPAWN, SPAWN_FACING, TRUCK } from './config.js'

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
  ramp: null, // { r, s, v, dir } while riding an AFK quarter-pipe
  rampPitch: 0, // radians the truck is tilted up on the quarter-pipe
  dims: { ...PLAYER_DIMS },
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
  player.speed = player.steer = player.boost = 0
  player.ramp = null
  player.rampPitch = 0
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
// Quarter-pipes ({ x0 foot x, R radius, z0, z1 }), rising toward -X.
let ramps = []
export function setRamps(list) {
  ramps = list
}

// On a quarter-pipe the truck moves in 1-D along the curve (arc length s,
// speed v up the ramp): gravity pulls it back by g sin(theta), the engine
// pushes by accel cos(theta), so holding W settles it near 45 degrees and
// letting go rolls it back down. Past the top of the arc the face is
// vertical, so a fast truck flies straight up and drops back onto it.
function rampStep(dt) {
  const R = player.ramp
  const r = R.r
  const L = (r.R * Math.PI) / 2
  const th = Math.min(R.s / r.R, Math.PI / 2)
  const push = Math.max(0, inputState.move.z) * TRUCK.accel * (player.nitro ? 1.8 : 1)
  R.v += (PHYSICS.gravity * Math.sin(th) + push * Math.cos(th)) * dt
  R.v *= 1 - 0.1 * dt
  R.s += R.v * dt
  const z = Math.max(r.z0 + 1.8, Math.min(r.z1 - 1.8, player.position.z))
  if (R.s <= 0) {
    player.ramp = null
    player.rampPitch = 0
    player.speed = R.v * R.dir
    const next = { x: r.x0 + 0.05, y: 0.05 + HALF, z }
    body.setNextKinematicTranslation(next)
    body.setTranslation(next, true)
    player.position.x = next.x
    player.position.y = 0.05
    player.velocity.y = 0
    return
  }
  const t = Math.min(R.s / r.R, Math.PI / 2)
  const x = R.s <= L ? r.x0 - r.R * Math.sin(t) : r.x0 - r.R
  const y = R.s <= L ? r.R * (1 - Math.cos(t)) : r.R + (R.s - L)
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

  if (player.ramp) return rampStep(dt)
  // Rolling onto a quarter-pipe's foot while heading west (or backing in) switches to the arc.
  if (player.grounded && player.velocity.x < -1) {
    for (const r of ramps) {
      const p = player.position
      if (p.z > r.z0 + 1 && p.z < r.z1 - 1 && p.x < r.x0 && p.x > r.x0 - 3) {
        const dir = player.speed >= 0 ? 1 : -1
        player.facing = dir > 0 ? -Math.PI / 2 : Math.PI / 2
        player.ramp = { r, s: Math.max(0.01, r.x0 - p.x), v: -player.velocity.x, dir }
        return rampStep(dt)
      }
    }
  }

  const throttle = inputState.move.z
  const steerIn = inputState.move.x
  player.boost = Math.max(0, player.boost - dt)
  const top = TRUCK.topSpeed * player.topMul * (player.nitro ? TRUCK.nitroMul : 1) * (player.boost > 0 ? TRUCK.boostMul : 1)
  let target = throttle > 0 ? throttle * top : throttle < 0 ? throttle * TRUCK.reverseSpeed : 0
  if ((player.nitro || player.boost > 0) && throttle >= 0) target = Math.max(target, top * 0.85)
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
  player.velocity.x = Math.sin(player.facing) * player.speed
  player.velocity.z = Math.cos(player.facing) * player.speed

  // Hop: buffered a little before landing, and allowed a little after leaving a ledge.
  if (inputState.jump) {
    jumpQueued = PHYSICS.jumpBuffer
    inputState.jump = false
  }
  sinceGrounded = player.grounded ? 0 : sinceGrounded + dt
  let jumped = false
  if (jumpQueued > 0 && sinceGrounded <= PHYSICS.coyoteTime) {
    player.velocity.y = PHYSICS.jumpSpeed
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
  }
  jumpQueued = Math.max(0, jumpQueued - dt)

  const fallSpeed = player.velocity.y
  player.velocity.y += PHYSICS.gravity * dt

  const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt }
  // No autostep/snap in the air: a jump that falls short must hit the far
  // plateau's cliff and drop, not get stepped up (then launched) over its edge.
  setAirborneController(!player.grounded || jumped)
  controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
  const moved = controller.computedMovement()
  const wasGrounded = player.grounded
  player.grounded = !jumped && controller.computedGrounded()
  player.landed = !wasGrounded && player.grounded ? Math.min(8, Math.max(0, -fallSpeed) * 0.5) : 0

  if (player.grounded && !jumped) player.velocity.y = Math.max(-2, Math.min(30, moved.y / dt))
  else if (player.velocity.y > 0 && moved.y < desired.y * 0.5) player.velocity.y = 0

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
