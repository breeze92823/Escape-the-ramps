import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { CAMERA, CARS, graphicsPreset, RENDER, STAGES, TRUCK, speedFactor } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, inputState, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn, setRamps } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { initPhysics, segmentClear, stepPhysics, bodyCount } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildHub, HUB } from './hub/index.js'
import { animateTruck, buildTruck } from './truck.js'
import { createParticles, setParticleScale } from './effects.js'
import { createHud } from './hud/hud.js'
import * as game from './game.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> sky + sea,
// the hub (props, colliders, signs, particles), the player's truck -> HUD ->
// loop (physics, truck visuals + effects, hub animation, camera, prompts,
// economy, HUD, bloom render). The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let particleBudget = 1

function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    postfx?.setSize(window.innerWidth, window.innerHeight)
    particleBudget = next.particles
    for (const p of systems) p.setBudget(particleBudget)
    resize()
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement)

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)
const systems = []

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  setParticleScale((window.innerHeight * renderer.getPixelRatio()) / Math.tan((camera.fov * Math.PI) / 360))
}
window.addEventListener('resize', resize)
resize()

// --- Physics + world ----------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()
lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // sea + clouds
bloxity.loadingStep('Building the hub')
const hub = buildHub(scene)
createPlayerBody()
setRamps(hub.afk.map((z) => ({ x0: HUB.rampFootX, R: HUB.rampRadius, z0: z.z0, z1: z.z1 })))
syncYawToPlayer()
for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- The player's truck --------------------------------------------------------
const playerGroup = new Group()
scene.add(playerGroup)
let truck = null
function setTruck(id) {
  if (truck) playerGroup.remove(truck.root)
  truck = buildTruck(CARS[id]?.paint ?? CARS.tiger.paint)
  playerGroup.add(truck.root)
}
setTruck(game.state.car)
game.on('car', setTruck)

// Showroom pads: green once owned.
function paintPads() {
  for (const [id, mesh] of Object.entries(hub.carPads)) {
    if (!game.state.owned.includes(id)) continue
    mesh.material.userData.base?.set('#22ff4a')
    mesh.material.color.set('#22ff4a').multiplyScalar(1.2)
  }
}
paintPads()
game.on('owned', paintPads)

// --- Effects -------------------------------------------------------------------
const dust = createParticles(scene, { max: 360 })
const flames = createParticles(scene, { max: 260, additive: true })
const sparks = createParticles(scene, { max: 320, additive: true, sparkle: true })
systems.push(dust, flames, sparks)
for (const p of systems) p.setBudget(particleBudget)
const tmp = new Vector3()
function worldPoint(p) {
  return truck.root.localToWorld(tmp.set(p.x, p.y, p.z))
}
function burst(x, y, z, count, colors, speed = 8, life = 1.1, size = 0.9) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const u = Math.random() * 0.9 + 0.1
    sparks.emit(x, y, z, Math.cos(a) * speed * u, speed * (0.4 + Math.random() * 0.8), Math.sin(a) * speed * u, {
      life: life * (0.6 + Math.random() * 0.6), size, sizeEnd: size * 0.3, color: colors[i % colors.length], gravity: -12, drag: 1.4,
    })
  }
}
game.on('levelup', () => {
  const p = player.renderPosition
  burst(p.x, p.y + 2.5, p.z, 70, ['#ffe14a', '#5cd2ff', '#ff5fc8', '#7dff4a', '#ffffff'], 11, 1.4, 1.1)
})
game.on('nitro', (on) => {
  if (!on) return
  const p = player.renderPosition
  burst(p.x, p.y + 1, p.z, 30, ['#7fe6ff', '#ffffff'], 7, 0.6, 0.8)
})

// --- HUD + prompts --------------------------------------------------------------
const TELEPORTS = {
  spawn: [0, 0.1, 2, Math.PI],
  afk: [HUB.rampFootX + 16, 0.1, 5, -Math.PI / 2],
  cars: [40, 0.1, 20, Math.PI / 2],
}
const stageStart = (s) => [0, s.y + 0.1, s.zs - 8, Math.PI]
function teleport(where) {
  const best = hub.stages[Math.max(0, game.state.bestStage - 1)]
  const t = where === 'best' ? stageStart(best) : where === 'stage' ? stageStart(hub.stages[0]) : Array.isArray(where) ? where : TELEPORTS[where]
  if (!t) return
  resetPlayer({ x: t[0], y: t[1], z: t[2] }, t[3])
  syncYawToPlayer()
  const p = player.position
  burst(p.x, p.y + 1.5, p.z, 40, ['#d08cff', '#ffffff', '#8f5cff'], 7, 0.9, 1)
}
let activePrompt = null
function usePrompt() {
  const p = activePrompt
  if (!p) return
  if (p.kind === 'car') game.useCar(p.car)
  else if (p.kind === 'magnet') game.buyMagnet()
  else if (p.kind === 'chest') game.claimChest()
  else if (p.kind === 'skip') {
    if (game.skipStage(p.stage, STAGES.skipCost(p.stage))) teleport(stageStart(hub.stages[p.stage]))
  }
  else if (p.text) game.toast(p.text)
}
const hud = createHud({ teleport, exit: () => teleport('spawn'), usePrompt })
onKey('KeyE', usePrompt)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ day: () => lighting.toggleDayNight(), respawn, nitro: () => game.triggerNitro() })

// --- Stages: checkpoints, falls, win pads, gears, rings ---
let onStage = null // the stage the truck last drove on (its start is the checkpoint)
let padCooldown = 0
let ringCooldown = 0
let restockT = 0
function stageAt(z) {
  for (const s of hub.stages) if (z <= s.zs + 0.5 && z > s.zt - s.gap - 0.5) return s
  return null
}
const lastPos = { x: 0, y: 0, z: 0 }
function updateStages(dt) {
  const pp = player.position
  // Teleports and respawns (a jump of 30 m+ in one frame) forget the stage checkpoint.
  if (Math.hypot(pp.x - lastPos.x, pp.y - lastPos.y, pp.z - lastPos.z) > 30) onStage = null
  lastPos.x = pp.x
  lastPos.y = pp.y
  lastPos.z = pp.z
  padCooldown = Math.max(0, padCooldown - dt)
  ringCooldown = Math.max(0, ringCooldown - dt)
  if (player.grounded) {
    const s = stageAt(pp.z)
    if (s && pp.y > s.y - 2) {
      if (s !== onStage) {
        onStage = s
        if (game.reachStage(s.k)) {
          game.toast(s.finish ? 'You escaped all the ramps!' : `Stage ${s.k} reached!`, 'good')
          burst(pp.x, pp.y + 2, pp.z, 50, ['#ffe14a', '#7dff4a', '#5cd2ff', '#ffffff'], 10, 1.2, 1)
        }
        if (!s.finish && s.rec && game.state.level < s.rec) game.toast(`Recommended level for Stage ${s.k}: ${s.rec}`)
      }
    } else if (!s && pp.z > hub.stages[0].zs) onStage = null
  }
  // Fell into a gap or off a plateau: back to that stage's start.
  if (onStage && pp.y < onStage.y - STAGES.fallBelow) {
    const s = onStage
    teleport(stageStart(s))
    game.toast(`Back to the start of Stage ${s.k}`, 'bad')
  }
  // Win pads: yellow pays and returns you to spawn; magenta needs the VIP pass.
  if (player.grounded && padCooldown === 0) {
    for (const w of hub.winPads) {
      if (pp.x > w.x0 && pp.x < w.x1 && pp.z > w.z0 && pp.z < w.z1 && Math.abs(pp.y - w.y) < 2.5) {
        padCooldown = 1.5
        if (w.vip) {
          game.toast('This 2x wins pad needs the VIP pass (Shop)', 'bad')
          break
        }
        game.addWins(w.wins)
        burst(pp.x, pp.y + 1.5, pp.z, 60, ['#ffe14a', '#ffb01a', '#ffffff'], 10, 1.2, 1.1)
        setTimeout(() => teleport('spawn'), 350)
        break
      }
    }
  }
  // Gears.
  const R2 = (game.state.magnet ? STAGES.magnetRadius : STAGES.gearRadius) ** 2
  for (const sp of hub.gears.spots) {
    if (sp.away > 0) continue
    const dx = sp.x - pp.x
    const dz = sp.z - pp.z
    if (dx * dx + dz * dz < R2 && Math.abs(sp.y - pp.y - 1.4) < 3) {
      sp.away = STAGES.gearRespawn
      game.addGears(sp.value)
      burst(sp.x, sp.y, sp.z, sp.gold ? 26 : 10, sp.gold ? ['#ffd21a', '#ffffff'] : ['#9fb4ff', '#ffffff'], 5, 0.6, 0.6)
    }
  }
  // Flying through a stage ring: a speed bonus.
  if (ringCooldown === 0) {
    for (const r of hub.rings) {
      if (Math.abs(pp.z - r.z) < 2.5 && Math.hypot(pp.x - r.x, pp.y + 1.5 - r.y) < r.r) {
        ringCooldown = 2
        game.addSpeed(r.stage * 10, 'ring')
        burst(r.x, r.y, r.z, 60, ['#ffd21a', '#fff27a', '#ffffff'], 12, 1, 1)
        break
      }
    }
  }
  restockT += dt
  if (restockT > 300) {
    restockT = 0
    game.toast('TUNING SHOP RESTOCKED!', 'good')
  }
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readyFrames = 0
let sprintWas = false
let onBoost = false
let dustCarry = 0

function groundHeight(x, y, z) {
  const f = segmentClear(x, y + 3, z, x, y - 4, z)
  return f < 1 ? y + 3 - f * 7 : null
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1)
  const elapsed = clock.elapsedTime

  // Nitro: Shift (rising edge) or the HUD bottle / touch button.
  if (inputState.sprint && !sprintWas) game.triggerNitro()
  sprintWas = inputState.sprint
  player.nitro = game.nitro.active > 0
  player.topMul = speedFactor(game.state.speed)

  stepPhysics(dt)
  interpolatePlayer()

  // --- Truck pose ---
  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  let gp = 0
  let gr = 0
  if (player.ramp) {
    gp = -player.rampPitch
  } else if (player.grounded) {
    const fx = Math.sin(player.facing) * 1.3
    const fz = Math.cos(player.facing) * 1.3
    const hf = groundHeight(p.x + fx, p.y, p.z + fz)
    const hb = groundHeight(p.x - fx, p.y, p.z - fz)
    const hl = groundHeight(p.x + fz, p.y, p.z - fx)
    const hr = groundHeight(p.x - fz, p.y, p.z + fx)
    if (hf !== null && hb !== null) gp = -Math.atan2(hf - hb, 2.6)
    if (hl !== null && hr !== null) gr = Math.atan2(hl - hr, 2.6)
  } else {
    gp = -Math.atan2(player.velocity.y, Math.max(6, Math.abs(player.speed))) * 0.6
  }
  animateTruck(truck, dt, { speed: player.speed, steer: player.steer, grounded: player.grounded, groundPitch: gp, groundRoll: gr, landed: player.landed, snap: !!player.ramp })
  playerGroup.updateMatrixWorld(true)

  // --- Effects ---
  const speed = Math.abs(player.speed)
  if (player.grounded && speed > 5) {
    dustCarry += dt * Math.min(40, speed * 1.4)
    while (dustCarry >= 1) {
      dustCarry -= 1
      const w = worldPoint(truck.rearWheels[Math.random() < 0.5 ? 0 : 1])
      dust.emit(w.x + (Math.random() - 0.5) * 0.6, w.y + 0.2, w.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2, {
        life: 0.7 + Math.random() * 0.5, size: 0.9, sizeEnd: 2.6 + speed * 0.05, color: Math.random() < 0.5 ? '#eef3e6' : '#d9cdb4', alpha: 0.55, drag: 2.2, gravity: 0.6,
      })
    }
  }
  if (player.landed > 2) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      dust.emit(p.x + Math.cos(a) * 1.6, p.y + 0.3, p.z + Math.sin(a) * 1.6, Math.cos(a) * 7, 1.5, Math.sin(a) * 7, { life: 0.8, size: 1.3, sizeEnd: 3.2, color: '#eef3e6', alpha: 0.6, drag: 3 })
    }
  }
  const back = { x: -Math.sin(player.facing), z: -Math.cos(player.facing) }
  for (const e of truck.exhaust) {
    const w = worldPoint(e)
    if (player.nitro) {
      for (let k = 0; k < 3; k++) {
        const s = 6 + Math.random() * 6
        flames.emit(w.x, w.y, w.z, back.x * s + (Math.random() - 0.5), (Math.random() - 0.2) * 1.5, back.z * s + (Math.random() - 0.5), {
          life: 0.18 + Math.random() * 0.12, size: 0.9, sizeEnd: 0.15, color: k === 0 ? '#bff4ff' : Math.random() < 0.5 ? '#3aa8ff' : '#ff9a2a', drag: 4,
        })
      }
    } else if (Math.random() < dt * (speed > 1 ? 10 : 4)) {
      dust.emit(w.x, w.y, w.z, back.x * 1.5, 1.2, back.z * 1.5, { life: 1.0, size: 0.35, sizeEnd: 1.2, color: '#b9bec7', alpha: 0.35, drag: 1.5 })
    }
  }
  dust.update(dt)
  flames.update(dt)
  sparks.update(dt)

  // --- Zones: boost strip, AFK ramps, prompts ---
  const pp = player.position
  const inBoost = hub.boosts.some((b) => pp.x > b.x0 && pp.x < b.x1 && pp.z > b.z0 && pp.z < b.z1)
  if (inBoost && player.speed > 2) {
    if (!onBoost) burst(pp.x, pp.y + 0.5, pp.z, 26, ['#7fd4ff', '#ffffff', '#2a8cff'], 9, 0.7, 0.9)
    player.boost = TRUCK.boostTime
  }
  onBoost = inBoost
  let afk = 0
  for (const z of hub.afk) if (pp.x > z.x0 && pp.x < z.x1 && pp.z > z.z0 && pp.z < z.z1) afk = z.mult
  let best = null
  let bestD = Infinity
  for (const pr of hub.prompts) {
    const d = Math.hypot(pp.x - pr.x, pp.z - pr.z)
    if (d < pr.r && d < bestD && Math.abs(pp.y - (pr.y ?? 0)) < 4) {
      best = pr
      bestD = d
    }
  }
  activePrompt = best
  hud.setPrompt(best)

  updateStages(dt)
  game.update(dt, { moving: speed, afk })
  hub.update(dt, elapsed)
  updateCamera(camera, dt)
  world.update(dt, elapsed, p)
  lighting.update(dt, playerGroup.position)
  hud.update(dt, camera, p)
  postfx.render()

  if (shownLoading && ++readyFrames > 3) {
    shownLoading = false
    bloxity.notifyFirstFrame()
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const tp = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, teleport: tp, game, hub, goto: teleport, input: inputState }
}
