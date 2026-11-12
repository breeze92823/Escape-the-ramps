import { ACESFilmicToneMapping, Clock, Group, Object3D, PCFSoftShadowMap, PerspectiveCamera, Scene, SpotLight, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { BALLOONS, BONUS, CAMERA, CARS, DANGER, FALL, graphicsPreset, JUICE, RENDER, STAGES, TRUCK, VIP, WATER, WINGS, WRECK, speedFactor } from './config.js'
import { createHazardFx } from './hazardFx.js'
import { createPowerupVisuals } from './powerups.js'
import * as bloxity from './bloxity.js'
import { install as installInput, inputState, onKey, releaseLock } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, knock, launch, player, resetPlayer, respawn, setLaunchRamps, setRamps, warpTo } from './player.js'
import { addKick, addShake, setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { createRuns } from './runs.js'
import { initPhysics, segmentClear, stepPhysics, bodyCount } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildHub, HUB } from './hub/index.js'
import { animateTruck, buildTruck } from './truck.js'
import { createParticles, setParticleScale } from './effects.js'
import { createDebris } from './debris.js'
import { createHud } from './hud/hud.js'
import * as game from './game.js'
import { initNet, sendPose } from './net.js'
import { createRemotePlayers } from './remotePlayers.js'
import * as audio from './audio.js'
import { PHYSICS } from './config.js'

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
// Launch lips: the hub's boost ramp (parabola, slope 2h/len at the lip) and every stage ramp.
setLaunchRamps([
  { x0: -HUB.launch.half, x1: HUB.launch.half, z0: HUB.launch.lip - 2.5, z1: HUB.launch.lip + 1, tan: (2 * HUB.launch.height) / (HUB.launch.foot - HUB.launch.lip) },
  ...hub.stages.filter((s) => !s.finish).map((s) => ({ x0: -STAGES.rampHalf, x1: STAGES.rampHalf, z0: s.zt - 2.5, z1: s.zt + 1, tan: (s.top - s.y) / STAGES.rampLen })),
])
// AFK ramps: locked until the player has `need` Rebirths (the gate bounces the truck).
const rampUnlocked = (z) => game.state.rebirths >= z.need
let blockedToastT = 0
setRamps(
  hub.afk.map((z) => ({ x0: HUB.rampFootX, R: HUB.rampRadius, z0: z.z0, z1: z.z1, mult: z.mult, label: z.label, need: z.need })),
  {
    canRide: rampUnlocked,
    onBlocked: (r) => {
      if (performance.now() < blockedToastT) return
      blockedToastT = performance.now() + 2500
      game.toast(`${r.label} AFK Ramp needs Rebirth ${r.need} (you have ${game.state.rebirths})`, 'bad')
    },
  },
)
function showRampGates() {
  for (const z of hub.afk) if (z.gate) z.gate.visible = !rampUnlocked(z)
}
showRampGates()
game.on('hydrate', showRampGates)
game.on('rebirth', () => {
  showRampGates()
  const opened = hub.afk.find((z) => z.need === game.state.rebirths)
  if (opened) setTimeout(() => game.toast(`${opened.label} AFK Ramp unlocked!`, 'good'), 900)
})
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
const remotes = createRemotePlayers(scene)
// Balloons / wings on the truck (kept on the player group, so they survive truck swaps).
const powerups = createPowerupVisuals(playerGroup)
const glideCfg = { gravityMul: WINGS.gravityMul, fall: WINGS.glideFall }
game.on('car', setTruck)
game.on('hydrate', () => setTruck(game.state.car))

// Stage runs: timer, medals, tries, and a see-through ghost of the best run.
function makeGhost() {
  const g = buildTruck(CARS[game.state.car]?.paint ?? CARS.tiger.paint)
  g.root.traverse((o) => {
    if (!o.isMesh) return
    o.material = o.material.clone()
    o.material.transparent = true
    o.material.opacity = 0.32
    o.material.depthWrite = false
    o.castShadow = false
  })
  const root = new Group()
  root.add(g.root)
  root.visible = false
  scene.add(root)
  return {
    root,
    set(x, y, z, facing) {
      root.position.set(x, y, z)
      root.rotation.y = facing
    },
  }
}
const runs = createRuns({ makeGhost })

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
game.on('hydrate', paintPads)

// --- Effects -------------------------------------------------------------------
const dust = createParticles(scene, { max: 360 })
const flames = createParticles(scene, { max: 260, additive: true })
const sparks = createParticles(scene, { max: 320, additive: true, sparkle: true })
systems.push(dust, flames, sparks)
const debris = createDebris(scene)
const hfx = createHazardFx(scene, { dust, flames, sparks, debris })
systems.push(...hfx.systems)
for (const p of systems) p.setBudget(particleBudget)
// Headlights for the lights-out stages (always in the scene so shaders never recompile; 0 by day).
const headlight = new SpotLight('#fff1d0', 0, 70, 0.55, 0.5, 1.2)
headlight.position.set(0, 2.2, 1.6)
const headTarget = new Object3D()
headTarget.position.set(0, 0, 24)
playerGroup.add(headlight, headTarget)
headlight.target = headTarget
const tmp = new Vector3()
const lisDir = new Vector3() // camera forward, for the 3D sound listener
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
game.on('levelup', (level) => audio.levelUp(level))
game.on('rebirth', () => audio.fanfare(true))
game.on('owned', () => audio.fanfare())
game.on('daily', () => audio.fanfare())
game.on('car', () => audio.rev())
game.on('toast', ({ tone }) => (tone === 'bad' ? audio.deny() : tone === 'good' ? audio.chime() : null))
game.on('nitro', (on) => {
  audio.nitro(on)
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
const stageStart = (s) => [0, s.y + 0.1, s.zs - 8 - (s.landing ?? 0), Math.PI]
function teleport(where) {
  const best = hub.stages[Math.max(0, game.state.bestStage - 1)]
  const t = where === 'best' ? stageStart(best) : where === 'stage' ? stageStart(hub.stages[0]) : Array.isArray(where) ? where : TELEPORTS[where]
  if (!t) return
  resetPlayer({ x: t[0], y: t[1], z: t[2] }, t[3])
  syncYawToPlayer()
  danger = 0
  audio.teleport()
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
  else if (p.kind === 'tuning') hud.windows.open('tuning')
  else if (p.kind === 'vip') game.buyVip()
  else if (p.kind === 'balloons') game.buyBalloons()
  else if (p.kind === 'wings') game.buyWings()
  else if (p.kind === 'skip') {
    if (game.skipStage(p.stage, STAGES.skipCost(p.stage))) teleport(stageStart(hub.stages[p.stage]))
  }
  else if (p.text) game.toast(p.text)
}
// Teleport window: stage k (1-based) -> its start.
function teleportStage(k) {
  const s = hub.stages[k - 1]
  if (!s) return
  teleport(stageStart(s))
  game.toast(`Teleported to Stage ${k}!`, 'good')
}
initNet()
const hud = createHud({ teleport, teleportStage, exit: () => teleport('spawn'), usePrompt })
onKey('KeyE', usePrompt)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
// G: respawn. On the death screen it presses the Respawn button (once its countdown ends).
onKey('KeyG', () => {
  if (deathUi?.classList.contains('show')) deathUi.querySelector('button').click()
  else if (!fall && !wrecked) respawn()
})
onKey('KeyM', () => audio.cycleMode())
installTouch({ day: () => lighting.toggleDayNight(), respawn, nitro: () => game.triggerNitro() })

// --- Stages: falls, win pads, gears, rings, hazards ---
let onStage = null // the stage the truck last drove on (dying sends you back to its start)
const fmtK = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n))
const timeText = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
const MEDAL_NAMES = ['', 'BRONZE', 'SILVER', 'GOLD']
const MEDAL_COLORS = ['#ffffff', '#e0904a', '#e8eef6', '#ffd21a']
function cleared(r, hits) {
  const tries = r.tries > 1 ? ` after ${r.tries} tries` : ''
  // Cleared without dying (first try since reaching the stage): bonus gears; no hits at all = FLAWLESS.
  if (r.tries === 1) {
    const flawless = hits === 0
    const n = (BONUS.noDeaths + (flawless ? BONUS.flawless : 0)) * r.k
    game.addGears(n)
    setTimeout(() => hud.callout(`${flawless ? 'FLAWLESS!' : 'NO DEATHS!'} +${n}`, '#7dff4a', true), 700)
  }
  if (r.newMedal || (r.pb && !r.first)) audio.fanfare(r.medal === 3)
  if (r.newMedal) {
    hud.flair(`${MEDAL_NAMES[r.medal]} MEDAL!<small>Stage ${r.k} in ${timeText(r.time)}${tries} · +${r.gears} gears${r.gems ? ` +${r.gems} gem` : ''}</small>`, MEDAL_COLORS[r.medal])
  } else if (r.pb && !r.first) {
    hud.flair(`NEW BEST!<small>Stage ${r.k} in ${timeText(r.time)}${tries}</small>`, '#7dff4a')
  } else {
    game.toast(`Stage ${r.k} cleared in ${timeText(r.time)}${tries}`, 'good')
  }
}
// Falls into the sea and wrecks.
let keepRun = false // the next teleport keeps the stage + run (the fall's camera cut)
let runHits = 0 // hazard hits during the current stage run (FLAWLESS = 0)
let fall = null // { s, t, cut, splash } while falling off an island
let wrecked = null // { s, t } while the truck lies in pieces
let hitStop = 0 // s the game freezes on a big impact
let roll = 0 // tumble roll of the truck after a hit (radians)
let rollV = 0
// Back after a fall or a wreck: no checkpoints at all, every death sends the
// truck back to the very beginning (the hub spawn) and the run starts over.
function respawnOn(s, why) {
  if (!s.finish) runs.fall(s.k)
  audio.fail()
  teleport('spawn')
  game.toast(`${why} Back to the start!`, 'bad')
}
// Death screen (Bloxity requires it wherever the player can die): while the player is down Boxity
// shows its ads and counts down; the game's own Respawn button waits for it. Without the SDK the
// respawn is immediate.
let deathUi = null
function askRespawn(go) {
  const death = bloxity.showDeathScreen()
  if (!death) return go()
  releaseLock() // show the cursor so the Respawn button can be clicked
  player.velocity.x = player.velocity.y = player.velocity.z = 0
  player.speed = player.boost = 0
  player.frozen = true
  if (!deathUi) {
    deathUi = document.createElement('div')
    deathUi.className = 'death-ui'
    deathUi.innerHTML = '<div class="death-t">YOU CRASHED!</div><button class="death-btn" disabled></button>'
    document.body.appendChild(deathUi)
  }
  const btn = deathUi.querySelector('button')
  const paint = (n) => {
    btn.disabled = n > 0
    btn.textContent = n > 0 ? `Respawn in ${n}` : 'Respawn (G)'
  }
  paint(4)
  deathUi.classList.add('show')
  try {
    death.onCountdown?.(paint)
  } catch {
    // The button simply stays on its last label; respawn() still gates it.
  }
  btn.onclick = () => {
    if (!death.respawn()) return
    deathUi.classList.remove('show')
    go()
  }
}
// Hitting the sea: spray, ripples, a blue flash; then the truck sinks.
function splash(x, z) {
  const y = WATER.level
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random()
    sparks.emit(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * (3 + r * 6), 9 + Math.random() * 12, Math.sin(a) * (3 + r * 6), {
      life: 0.9 + Math.random() * 0.5, size: 0.9, sizeEnd: 0.3, color: i % 3 ? '#ffffff' : '#bff4ff', gravity: -20, drag: 0.6,
    })
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    dust.emit(x + Math.cos(a) * 1.5, y + 0.3, z + Math.sin(a) * 1.5, Math.cos(a) * 9, 3 + Math.random() * 3, Math.sin(a) * 9, { life: 1.1, size: 1.6, sizeEnd: 4.2, color: '#f2fbff', alpha: 0.75, drag: 2.4, gravity: -4 })
  }
  debris.ripple(x, y, z, 12, 1.8)
  debris.ripple(x, y, z, 6, 1.1)
  audio.splash()
  slowmo = FALL.slowmo // a beat of slow motion on the splash
  addShake(0.45)
  hud.hurt('rgba(60,170,255,0.7)')
  hud.callout('SPLASH!', '#7fd4ff', true)
}
// A lethal crush: freeze, the truck is flattened for a moment, then flies
// apart (explodeTruck) with smoke; then back to the hub.
function wreckTruck(r) {
  if (wrecked) return
  hitStop = WRECK.hitStop
  wrecked = { s: onStage, t: 0, burst: false }
  player.frozen = true
  squash = WRECK.pancake + 0.3 // fully flat until it bursts
  audio.crunch()
  addShake(0.8)
  hud.hurt()
  hud.callout(r.why ?? (r.grind ? 'GROUND UP!' : 'CRUSHED!'), '#ff4a3a', true)
}
function explodeTruck() {
  wrecked.burst = true
  squash = 0
  const pp = player.position
  playerGroup.visible = false
  const paint = CARS[game.state.car]?.paint ?? CARS.tiger.paint
  const colors = [paint.base, paint.accent, paint.rim ?? '#2a2a2a', '#9aa1ae', '#3a3f4a']
  debris.wreck(pp.x, pp.y, pp.z, colors, { floor: onStage ? onStage.y : pp.y, half: STAGES.half, life: WRECK.debrisLife })
  burst(pp.x, pp.y + 1, pp.z, 60, ['#ffffff', '#ffd21a', '#ff9a2a', '#ff5a2a'], 14, 0.7, 0.8)
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2
    dust.emit(pp.x, pp.y + 0.8, pp.z, Math.cos(a) * (2 + Math.random() * 6), 2 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 6), {
      life: 1.4 + Math.random() * 0.8, size: 1.4, sizeEnd: 4.5, color: i % 2 ? '#3a3a40' : '#5a5a62', alpha: 0.75, drag: 1.6, gravity: 1.5,
    })
  }
  addShake(1.1)
  audio.hit()
  hud.callout('WRECKED!', '#ff4a3a', true)
}

// Hazards that kill outright (shot, blasted, caught, melted, stomped): the truck
// blows up (or melts) at once, then it is back to the start like any wreck.
function killTruck(r) {
  if (wrecked) return
  if (r.kill === 'crush') return wreckTruck(r)
  const pp = player.position
  hitStop = WRECK.hitStop * 1.6
  wrecked = { s: onStage, t: WRECK.pancake, burst: false } // bursts on the next frame
  player.frozen = true
  squash = r.kill === 'melt' ? WRECK.pancake + 0.3 : 0
  if (r.kill === 'melt') {
    audio.playerHit('melt')
    for (let i = 0; i < 40; i++) hfx.run({ type: 'ember', x: pp.x + (Math.random() - 0.5) * 3, y: pp.y + 0.5, z: pp.z + (Math.random() - 0.5) * 3 })
    hfx.run({ type: 'explosion', x: pp.x, y: pp.y + 0.4, z: pp.z, o: { size: 0.7 } })
  } else {
    audio.playerHit('blast')
    hfx.run({ type: 'explosion', x: pp.x, y: pp.y + 1.2, z: pp.z, o: { size: 1.4 } })
  }
  addShake(1.1)
  hud.hurt(r.kill === 'melt' ? 'rgba(255,120,20,0.8)' : undefined)
  hud.callout(r.why ?? 'WRECKED!', '#ff4a3a', true)
}

// Danger streak: each near miss in a row raises the gear multiplier; a hit resets it.
let danger = 0
const dangerMul = () => 1 + danger * DANGER.step
function loseStreak() {
  if (danger >= 2) setTimeout(() => hud.callout('STREAK LOST', '#ffb01a'), 350)
  danger = 0
}

// Juice state.
let slowmo = 0 // s of ring slow-motion left
let timeScale = 1
let gameT = 0 // scaled clock for the hazards
let squash = 0 // s the truck stays flattened
let airT = 0 // s airborne this flight
let airFree = false // this flight came from a bounce pad / knock (no AIR bonus)
let surface = null // the stage surface under the truck
let padCooldown = 0
let ringCooldown = 0
function stageAt(z) {
  for (const s of hub.stages) if (z <= s.zs + 0.5 && z > s.zt - s.gap - 0.5) return s
  return null
}
const lastPos = { x: 0, y: 0, z: 0 }
function updateStages(dt) {
  const pp = player.position
  // Teleports and respawns (a jump of 30 m+ in one frame) forget the current stage.
  if (Math.hypot(pp.x - lastPos.x, pp.y - lastPos.y, pp.z - lastPos.z) > 30) {
    if (!keepRun) {
      onStage = null
      runs.cancel()
    }
  }
  keepRun = false
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
        const done = runs.arrive(s)
        if (done) cleared(done, runHits)
        runHits = 0
        if (s.intro && game.state.bestStage < s.k) setTimeout(() => game.toast(s.intro, 'good'), 900)
        if (game.reachStage(s.k)) {
          audio.fanfare(!!s.finish)
          game.toast(s.finish ? 'You escaped all the ramps!' : `Stage ${s.k} reached!`, 'good')
          burst(pp.x, pp.y + 2, pp.z, 50, ['#ffe14a', '#7dff4a', '#5cd2ff', '#ffffff'], 10, 1.2, 1)
        }
        if (!s.finish && s.rec && game.state.level < s.rec) game.toast(`Recommended level for Stage ${s.k}: ${s.rec}`)
      }
    } else if (!s && pp.z > hub.stages[0].zs) onStage = null
  }
  // Fell into a gap or off the island: drop (a cut down to the sea when the island
  // is high), splash, sink, then back to the hub.
  if (!fall && !wrecked && onStage && !player.grounded && !player.ramp && (pp.y < onStage.y - 2.5 || pp.y < WATER.level + 0.3)) {
    fall = { s: onStage, t: 0, cut: false, splash: -1 }
    hud.callout('WIPEOUT!', '#ff6a5a', true)
  }
  if (fall) updateFall(dt)
  // Win pads: yellow pays and returns you to spawn; magenta needs the VIP pass.
  if (player.grounded && padCooldown === 0) {
    for (const w of hub.winPads) {
      if (pp.x > w.x0 && pp.x < w.x1 && pp.z > w.z0 && pp.z < w.z1 && Math.abs(pp.y - w.y) < 2.5) {
        padCooldown = 1.5
        if (w.vip && !game.state.vip) {
          game.toast(`This 2x wins pad needs the VIP pass (${fmtK(VIP.wins)} wins): press E to buy`, 'bad')
          break
        }
        game.addWins(w.wins)
        audio.win()
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
      const got = Math.round(sp.value * (onStage ? dangerMul() : 1))
      game.addGears(got)
      audio.gear(sp.gold)
      burst(sp.x, sp.y, sp.z, sp.mega ? 60 : sp.gold ? 26 : 10, sp.gold ? ['#ffd21a', '#ffffff'] : ['#9fb4ff', '#ffffff'], sp.mega ? 10 : 5, 0.6, sp.mega ? 1 : 0.6)
      if (sp.mega) hud.callout(`MEGA GEAR +${got}`, '#ffd21a', true)
    }
  }
  // Flying through a stage ring: a speed bonus.
  if (ringCooldown === 0) {
    for (const r of hub.rings) {
      if (Math.abs(pp.z - r.z) < 2.5 && Math.hypot(pp.x - r.x, pp.y + 1.5 - r.y) < r.r) {
        ringCooldown = 2
        game.addSpeed(r.stage * 10, 'ring')
        audio.ring()
        burst(r.x, r.y, r.z, 60, ['#ffd21a', '#fff27a', '#ffffff'], 12, 1, 1)
        slowmo = JUICE.ringSlowmo.hold
        hud.callout('RING!', '#ffd21a', true)
        break
      }
    }
  }
}

function updateFall(dt) {
  if (fall.waiting) return
  const pp = player.position
  const s = fall.s
  const f = fall
  const done = (why) => {
    f.waiting = true
    askRespawn(() => {
      fall = null
      respawnOn(s, why)
    })
  }
  fall.t += dt
  if (fall.splash < 0) {
    if (pp.y <= WATER.level + 0.2) {
      splash(pp.x, pp.z)
      fall.splash = 0
      player.frozen = true
    } else if (!fall.cut && fall.t > FALL.cutAfter && pp.y - WATER.level > FALL.cutHeight + 2 && s.y - WATER.level > FALL.splashMaxDrop) {
      // Too high to watch the whole drop: cut to just above the sea, still falling.
      fall.cut = true
      keepRun = true
      warpTo(pp.x, WATER.level + FALL.cutHeight, pp.z)
    } else if (fall.t > FALL.maxTime) {
      done('Wipeout!')
    }
    return
  }
  fall.splash += dt
  if (fall.splash > FALL.sink) done('Splash!')
}

// Hazards (hub/obstacles.js): hits shove the truck, crushers flatten it,
// low blocks act as walls, close calls pay a few gears.
const OUCH = ['OUCH!', 'BONK!', 'WHAM!']
function updateHazards(dt) {
  const pp = player.position
  const k = onStage?.k ?? 1
  if (wrecked || fall || player.frozen) return
  for (const r of hub.obstacles.test(pp, dt)) {
    if (r.push) {
      // Wind cannon / crosswind / a tilted seesaw: a steady sideways shove (even in the air).
      player.knock.x += r.ax * dt
      if (!r.quiet && Math.random() < dt * 30) dust.emit(pp.x - Math.sign(r.ax) * 6, pp.y + 0.5 + Math.random() * 3, pp.z + (Math.random() - 0.5) * 8, r.ax * 0.6, 0, 0, { life: 0.5, size: 0.25, sizeEnd: 0.9, color: '#ffffff', alpha: 0.5, drag: 0.5 })
      continue
    }
    if (r.kill) {
      runHits++
      loseStreak()
      killTruck(r)
      break
    }
    if (r.zap) {
      // Tesla arc: no steering for a moment, sparks crawling over the truck.
      knock(r.vx, r.vy, r.vz, { keep: r.keep ?? 0.5 })
      player.noSteer = r.noSteer
      runHits++
      loseStreak()
      airFree = true
      audio.playerHit('zap')
      addShake(0.5)
      hud.hurt('rgba(120,200,255,0.7)')
      hfx.run({ type: 'teslaSpark', x: pp.x, y: pp.y + 1.5, z: pp.z })
      hfx.run({ type: 'magnetZap', x: pp.x, y: pp.y + 1, z: pp.z })
      hud.callout('ZAPPED! No steering!', '#8ad8ff', true)
      continue
    }
    if (r.burn) {
      // Flamethrower: on fire and slowed for a while.
      if (player.burn <= 0) {
        runHits++
        loseStreak()
        audio.playerHit('burn')
        hud.hurt('rgba(255,120,20,0.7)')
        hud.callout('ON FIRE!', '#ff7a1a', true)
      }
      player.burn = r.burn
      player.burnTop = r.slow
      continue
    }
    if (r.flat) {
      // Spike strip: a flat tyre pulls the truck to one side.
      if (player.flat <= 0) {
        runHits++
        loseStreak()
        audio.playerHit('flat')
        debris.chips(pp.x, pp.y + 0.6, pp.z, ['#1c1d22', '#3a3a40', '#d5dbe3'], 0, 0, 10)
        hfx.run({ type: 'spikePop', x: pp.x, y: pp.y + 0.3, z: pp.z, o: { w: 3 } })
        hud.callout('FLAT TYRE!', '#ffb01a', true)
        player.pull = r.pull
      }
      player.flat = r.flat
      player.flatTop = r.top
      continue
    }
    if (r.grab) {
      // Magnet crane: lifted and flung off the side.
      knock(r.vx, r.vy, r.vz, { keep: 0, stun: 0.5 })
      runHits++
      loseStreak()
      airFree = true
      audio.playerHit('grab')
      addShake(0.6)
      hfx.run({ type: 'magnetZap', x: pp.x, y: pp.y + 2, z: pp.z })
      hud.callout('GRABBED!', '#4ab8ff', true)
      continue
    }
    if (r.hit) {
      const power = r.power ?? 1
      knock(r.vx, r.vy, r.vz, { keep: r.keep ?? 0.2 })
      runHits++
      loseStreak()
      addKick(r.vx, r.vz, Math.min(1.5, power))
      const paint = CARS[game.state.car]?.paint ?? CARS.tiger.paint
      if (!r.geyser) debris.chips(pp.x, pp.y + 1.2, pp.z, [r.color ?? '#ffffff', paint.base, paint.accent], r.vx, r.vz, r.blade ? 12 : 8)
      if (r.geyser) audio.splash()
      else audio.hit()
      airFree = true
      if (power > 1.1) hitStop = 0.05
      addShake(JUICE.hitShake * power)
      // Sparks fan out the way the truck is thrown; it tumbles in the air.
      const n = Math.hypot(r.vx, r.vz) || 1
      for (let i = 0; i < 34; i++) {
        const s = 6 + Math.random() * 12
        sparks.emit(pp.x, pp.y + 1.2, pp.z, (r.vx / n) * s + (Math.random() - 0.5) * 6, 2 + Math.random() * 7, (r.vz / n) * s + (Math.random() - 0.5) * 6, {
          life: 0.35 + Math.random() * 0.35, size: 0.55, sizeEnd: 0.1, color: i % 3 ? '#ffd27a' : '#ffffff', gravity: -18, drag: 1.2,
        })
      }
      burst(r.x, r.y, r.z, 18, ['#ffffff', '#ffd21a', '#ff5a4a'], 8, 0.5, 0.8)
      const side = r.vx * Math.cos(player.facing) - r.vz * Math.sin(player.facing) // along the truck's right
      rollV = -Math.sign(side || 1) * (5 + 5 * power)
      if (r.laser) hfx.run({ type: 'laserSpark', x: pp.x, y: pp.y + 1.2, z: pp.z })
      const text = r.laser ? 'ZAPPED!' : r.mine ? 'KABOOM!' : r.drone ? 'BZZT!' : r.rammer ? 'RAMMED!' : r.shock ? 'BOOM!' : r.bumper ? 'BUMPED!' : r.geyser ? 'GEYSER!' : r.blade ? 'SLICED!' : OUCH[Math.floor(Math.random() * OUCH.length)]
      hud.callout(text, r.geyser ? '#7fd4ff' : r.laser ? '#ff5a5a' : '#ff6a5a', true)
    } else if (r.squash) {
      if (player.stun > 0) continue
      runHits++
      loseStreak()
      if (r.lethal) {
        wreckTruck(r)
        break
      }
      knock(0, 0, 0, { keep: 0, stun: r.stun })
      squash = r.stun
      audio.hit()
      addShake(JUICE.hitShake)
      burst(r.x, r.y, r.z, 40, ['#ffffff', '#ffd21a'], 9, 0.6, 0.9)
      hud.callout('SQUASHED!', '#ff6a5a', true)
    } else if (r.wall) {
      if (player.stun > 0) continue
      knock(r.vx, 0, r.vz, { keep: 0.2 })
    } else if (r.near && Math.abs(player.speed) > 8) {
      danger = Math.min(DANGER.max, danger + 1)
      const n = Math.round(JUICE.nearGears * k * dangerMul())
      game.addGears(n)
      audio.nearMiss(Math.sign(r.x - pp.x) * 0.6 || 0)
      hud.callout(`CLOSE! +${n}`, '#7fe6ff')
    }
  }
  for (const at of hub.obstacles.slams()) {
    const d = Math.hypot(at.x - pp.x, at.z - pp.z)
    if (d > 60 || Math.abs(at.y - pp.y) > 10) continue
    if (d < 40) addShake(JUICE.slamShake * (1 - d / 40))
    debris.crack(at.x, at.y, at.z, Math.max(at.w, at.d))
    // Dust blown out from under the slam.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      dust.emit(at.x + Math.cos(a) * at.w * 0.45, at.y + 0.3, at.z + Math.sin(a) * at.d * 0.45, Math.cos(a) * 8, 1 + Math.random() * 2, Math.sin(a) * 8, {
        life: 0.8, size: 1.2, sizeEnd: 3.4, color: '#e8e2d2', alpha: 0.65, drag: 3,
      })
    }
  }
}

// Stage surfaces under the truck: ice (slide), mud (slow), conveyor (push),
// bounce pads (launch) and boost pads. Runs before the physics step.
function applySurface() {
  const pp = player.position
  const s = player.grounded && !player.ramp ? hub.obstacles.surfaceAt(pp.x, pp.y, pp.z) : null
  player.grip = s?.type === 'ice' ? s.grip : Infinity
  player.surfTop = s?.type === 'mud' ? s.top : 1
  player.belt.x = s?.type === 'conveyor' ? s.belt : 0
  // Turntable: the floor carries the truck round its centre and turns it.
  if (s?.type === 'spin') {
    player.belt.x = s.w * (pp.z - s.cz)
    player.belt.z = -s.w * (pp.x - s.cx)
    player.spinW = s.w
  } else {
    player.belt.z = 0
    player.spinW = 0
  }
  if (s?.type === 'bounce') {
    launch(s.launch)
    audio.bounce()
    airFree = true
    burst(pp.x, pp.y + 0.5, pp.z, 24, ['#8ff4ff', '#ffffff', '#2ad8ff'], 8, 0.7, 0.8)
    hud.callout('BOING!', '#8ff4ff')
  }
  if (s?.type === 'booster' && player.speed > 2) {
    if (surface?.type !== 'booster') {
      burst(pp.x, pp.y + 0.5, pp.z, 26, ['#ffb01a', '#ffffff', '#ffe14a'], 9, 0.7, 0.9)
      audio.boost()
      hud.callout('BOOST!', '#ffb01a')
    }
    player.boost = TRUCK.boostTime
  }
  surface = s
}

// Air time: a long flight (a stage gap jump) pays gears on landing.
let wasGrounded = true
function updateAir(dt) {
  // Take-off sounds: a hop (Space) or a launch off a ramp lip at speed.
  if (wasGrounded && !player.grounded && !player.ramp && player.velocity.y > 2) {
    if (Math.abs(player.velocity.y - PHYSICS.jumpSpeed) < 0.6) audio.jump()
    else if (Math.abs(player.speed) > 14) audio.launch(Math.min(1.5, player.velocity.y / 10))
  }
  wasGrounded = player.grounded
  if (player.ramp) {
    airT = 0
    return
  }
  if (!player.grounded) {
    airT += dt
    return
  }
  if (player.landed > 2) audio.land(player.landed)
  if (airT > JUICE.airMin && !airFree) {
    const n = Math.round(airT * JUICE.airGears * (onStage?.k ?? 1))
    game.addGears(n)
    audio.bigAir(airT)
    hud.callout(`AIR ${airT.toFixed(1)}s +${n}`, '#ffe14a', airT > 2)
  }
  if (player.landed > 2) addShake(player.landed * JUICE.landShake)
  airT = 0
  airFree = false
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readyFrames = 0
let sprintWas = false
let onBoost = false
let autoWas = false // last frame's AFK auto ride state
let dustCarry = 0

function groundHeight(x, y, z) {
  const f = segmentClear(x, y + 3, z, x, y - 4, z)
  return f < 1 ? y + 3 - f * 7 : null
}

let fixedDt = 0 // dev step(): run frames with a fixed dt (no rAF needed)
let stepNoRender = false // dev step(): skip drawing (fast, works in a hidden tab)
// Ad breaks (Bloxity): the simulation pauses and the sound stops until the break ends.
let adPaused = false
bloxity.onAdBreak((on) => {
  adPaused = on
  audio.setAdMute(on)
})
bloxity.adScreen('gameplay')
function frame() {
  if (adPaused) {
    clock.getDelta() // drop the time spent paused
    return
  }
  const rawDt = fixedDt || Math.min(clock.getDelta(), 0.1)
  // Ring slow-motion: the whole game runs slower for a moment.
  slowmo = Math.max(0, slowmo - rawDt)
  const want = slowmo > 0 ? JUICE.ringSlowmo.scale : 1
  timeScale += (want - timeScale) * (1 - Math.exp(-JUICE.ringSlowmo.ease * rawDt))
  hitStop = Math.max(0, hitStop - rawDt)
  const dt = rawDt * timeScale * (hitStop > 0 ? 0.02 : 1)
  gameT += dt
  if (wrecked && !wrecked.waiting) wrecked.t += dt
  if (wrecked && !wrecked.waiting && !wrecked.burst && wrecked.t >= WRECK.pancake) explodeTruck()
  else if (wrecked && !wrecked.waiting && wrecked.burst && wrecked.t > WRECK.pancake + WRECK.respawn) {
    const w = wrecked
    w.waiting = true
    askRespawn(() => {
      wrecked = null
      playerGroup.visible = true
      if (w.s) respawnOn(w.s, 'Wrecked!')
      else respawn()
    })
  }
  const elapsed = gameT

  // Nitro: Shift (rising edge) or the HUD bottle / touch button.
  if (inputState.sprint && !sprintWas) game.triggerNitro()
  sprintWas = inputState.sprint
  player.nitro = game.nitro.active > 0
  player.topMul = speedFactor(game.state.speed)
  // Timed power-ups (game.js): Balloons float, Wings glide.
  const balloonsOn = game.balloonsLeft() > 0
  const wingsOn = game.wingsLeft() > 0
  player.gravityMul = balloonsOn ? BALLOONS.gravityMul : 1
  player.glide = wingsOn ? glideCfg : null

  applySurface()
  const yBefore = player.position.y
  stepPhysics(dt)
  interpolatePlayer()
  updateAir(dt)
  // Off the hub into the sea (no stage fall running): just the splash.
  if (!fall && !onStage && yBefore > WATER.level && player.position.y <= WATER.level && !player.grounded) splash(player.position.x, player.position.z)

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
  // Tumbling after a hit; levels out once it lands.
  if (player.grounded || player.frozen) {
    rollV = 0
    roll = Math.atan2(Math.sin(roll), Math.cos(roll))
    roll *= Math.exp(-14 * dt)
  } else roll += rollV * dt
  // A flat tyre leans the truck toward the flat side; a zap makes it shudder.
  const lean = player.flat > 0 ? player.pull * -0.14 : 0
  const shudder = player.noSteer > 0 ? (Math.random() - 0.5) * 0.06 : 0
  playerGroup.rotation.z = roll + lean + shudder
  // Sinking after a splash.
  if (fall && fall.splash >= 0) {
    playerGroup.position.y -= fall.splash * 2.6
    playerGroup.rotation.x = -fall.splash * 0.6
    for (let i = 0; i < 2; i++) {
      dust.emit(p.x + (Math.random() - 0.5) * 2.5, WATER.level + 0.1, p.z + (Math.random() - 0.5) * 2.5, (Math.random() - 0.5), 1.5 + Math.random() * 2, (Math.random() - 0.5), {
        life: 0.5 + Math.random() * 0.4, size: 0.35, sizeEnd: 0.7, color: '#e8fbff', alpha: 0.85, drag: 1, gravity: 2,
      })
    }
  } else playerGroup.rotation.x = 0
  // Flattened by a crusher: squashed wide and low, popping back as the stun ends.
  squash = Math.max(0, squash - dt)
  const sq = squash > 0 ? Math.min(1, squash * 4) : 0
  playerGroup.scale.set(1 + sq * 0.35, 1 - sq * 0.7, 1 + sq * 0.2)
  powerups.update(dt, { balloons: balloonsOn, wings: wingsOn, gliding: player.gliding })
  playerGroup.updateMatrixWorld(true)

  // --- Effects ---
  const speed = Math.abs(player.speed)
  if (player.grounded && speed > 5) {
    dustCarry += dt * Math.min(40, speed * 1.4)
    while (dustCarry >= 1) {
      dustCarry -= 1
      const w = worldPoint(truck.rearWheels[Math.random() < 0.5 ? 0 : 1])
      const mud = surface?.type === 'mud'
      const ice = surface?.type === 'ice'
      dust.emit(w.x + (Math.random() - 0.5) * 0.6, w.y + 0.2, w.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, (mud ? 3 : 1.2) + Math.random() * 1.5, (Math.random() - 0.5) * 2, {
        life: 0.7 + Math.random() * 0.5, size: mud ? 0.6 : 0.9, sizeEnd: mud ? 1.2 : 2.6 + speed * 0.05,
        color: mud ? (Math.random() < 0.5 ? '#5b3a1f' : '#7a5230') : ice ? '#e8fbff' : Math.random() < 0.5 ? '#eef3e6' : '#d9cdb4',
        alpha: mud ? 0.9 : 0.55, drag: 2.2, gravity: mud ? -9 : 0.6,
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
  debris.update(dt)

  // --- Zones: boost strip, AFK ramps, prompts ---
  const pp = player.position
  const inBoost = hub.boosts.some((b) => pp.x > b.x0 && pp.x < b.x1 && pp.z > b.z0 && pp.z < b.z1)
  if (inBoost && player.speed > 2) {
    if (!onBoost) {
      burst(pp.x, pp.y + 0.5, pp.z, 26, ['#7fd4ff', '#ffffff', '#2a8cff'], 9, 0.7, 0.9)
      audio.boost()
    }
    player.boost = TRUCK.boostTime
  }
  onBoost = inBoost
  let afk = player.ramp ? player.ramp.r.mult : 0
  if (!afk) for (const z of hub.afk) if (rampUnlocked(z) && pp.x > z.x0 && pp.x < z.x1 && pp.z > z.z0 && pp.z < z.z1) afk = z.mult
  // Auto ride banner; a control press mid-ride hands the truck back.
  const autoNow = !!player.ramp && player.autoRide
  if (autoWas && !autoNow && player.ramp) game.toast('Auto ride off — you are driving', 'info')
  autoWas = autoNow
  hud.setAuto(autoNow ? player.ramp.r.label : null)
  let best = null
  let bestD = Infinity
  for (const pr of hub.prompts) {
    const d = Math.hypot(pp.x - pr.x, pp.z - pr.z)
    if (d < pr.r && d < bestD && Math.abs(pp.y - (pr.y ?? 0)) < 4 && !(pr.kind === 'vip' && game.state.vip)) {
      best = pr
      bestD = d
    }
  }
  activePrompt = best
  hud.setPrompt(best)

  updateStages(dt)
  updateHazards(dt)
  runs.update(dt, player.position, player.facing)
  hud.setRun(runs.info())
  game.update(dt, { moving: fall || wrecked ? 0 : speed, afk: fall || wrecked ? 0 : afk })
  audio.update(rawDt, {
    speed: player.speed, top: TRUCK.topSpeed * player.topMul, throttle: inputState.move.z, grounded: player.grounded || !!player.ramp,
    steer: player.steer, nitro: player.nitro, onStage: !!onStage, stage: game.state.bestStage, slowmo: timeScale,
  })
  hub.update(dt, elapsed, pp.z, player)
  hud.setDanger(onStage ? dangerMul() : 1)
  // Hazard visual events (explosions, plasma, flames...), callouts and quakes.
  for (const e of hub.obstacles.effects()) {
    if (e.type === 'callout') hud.callout(e.o.text, e.o.color, true)
    else if (e.type === 'quake') {
      const d = Math.hypot(e.x - pp.x, e.z - pp.z)
      if (d < e.o.r && Math.abs(e.y - pp.y) < 15) addShake(e.o.k * (1 - d / e.o.r))
    } else hfx.run(e)
  }
  hfx.update(dt)
  hfx.truck(dt, p, { burning: player.burn, flat: player.flat, zapped: player.noSteer })
  // Lights out / smoke banks over the player's spot; headlights come on in the dark.
  const amb = hub.obstacles.ambience(pp)
  lighting.setAmbience(amb.dark, amb.fog)
  headlight.intensity = lighting.darkness() * 260
  // Other players: send this truck's pose, draw theirs (hidden while wrecked or sinking).
  if (!playerGroup.visible || player.frozen) sendPose({ ...p, yaw: player.facing, speed: 0, steer: 0, car: game.state.car, air: false })
  else sendPose({ x: p.x, y: p.y, z: p.z, yaw: player.facing, speed: player.speed, steer: player.steer, car: game.state.car, air: !player.grounded && !player.ramp })
  remotes.update(rawDt, p)
  for (const o of hub.obstacles.fx(pp.z)) {
    if (o.fired) {
      // Cannon smoke from the muzzle.
      const m = o.muzzle
      for (let i = 0; i < 22; i++) dust.emit(m.x, m.y, m.z, m.dir * (4 + Math.random() * 8), Math.random() * 2, (Math.random() - 0.5) * 4, { life: 0.9 + Math.random() * 0.6, size: 1.2, sizeEnd: 3.6, color: i % 3 ? '#9aa1ae' : '#5a5f6a', alpha: 0.7, drag: 2, gravity: 1 })
      for (let i = 0; i < 10; i++) flames.emit(m.x, m.y, m.z, m.dir * (6 + Math.random() * 6), (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, { life: 0.15, size: 1.2, sizeEnd: 0.2, color: i % 2 ? '#ffb01a' : '#ff5a1a', drag: 4 })
    }
    if (o.started) {
      // Geyser spray.
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2
        sparks.emit(o.x + Math.cos(a) * 0.6, o.y + 0.3, o.z + Math.sin(a) * 0.6, Math.cos(a) * 2, 12 + Math.random() * 8, Math.sin(a) * 2, { life: 1, size: 0.8, sizeEnd: 0.3, color: i % 2 ? '#ffffff' : '#bff4ff', gravity: -20, drag: 0.4 })
      }
    }
    if (o.bubbling && Math.random() < dt * 25) dust.emit(o.x + (Math.random() - 0.5) * 2.4, o.y + 0.1, o.z + (Math.random() - 0.5) * 2.4, 0, 1.5 + Math.random(), 0, { life: 0.5, size: 0.3, sizeEnd: 0.6, color: '#e8fbff', alpha: 0.8, gravity: 1 })
  }
  for (const e of hub.obstacles.sounds()) audio.hazard(e.type, e.x, e.y, e.z, e.k)
  audio.hazardLoops(hub.obstacles.loops(pp.z))
  updateCamera(camera, dt)
  camera.getWorldDirection(lisDir)
  audio.setListener(camera.position.x, camera.position.y, camera.position.z, lisDir.x, lisDir.y, lisDir.z)
  world.update(dt, elapsed, p)
  lighting.update(dt, playerGroup.position)
  hud.update(dt, camera, p)
  if (!stepNoRender) postfx.render()

  if (shownLoading && ++readyFrames > 3) {
    shownLoading = false
    bloxity.notifyFirstFrame()
  }
}
renderer.setAnimationLoop(frame)

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const tp = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, teleport: tp, game, hub, goto: teleport, input: inputState, runs, stage: teleportStage, knock,
    // Advance the game `seconds` in fixed frames (works while the tab is hidden), calling each(dt) after every frame.
    step(seconds, each, d = 1 / 60) {
      fixedDt = d
      stepNoRender = true
      try {
        for (let t = 0; t < seconds; t += d) if (frame(), each && each(d) === false) break
      } finally {
        fixedDt = 0
        stepNoRender = false
        clock.getDelta()
      }
    },
  }
}
