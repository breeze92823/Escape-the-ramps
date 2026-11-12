// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'bowling-roll' // slug registered on bloxity.io
export const GAME_TITLE = 'Escape the Ramps'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The ground (world.js): one convex slab of land in a sea. The shoreline sweeps from
// the front edge (-Z) back toward +Z on both wings.
export const BEACH = {
  front: -46, // z of the shoreline at the front edge
  back: 90, // z of the back edge
  halfWidth: 75, // x extent of the wings
  wingZ: 24, // z of the shoreline at the far left/right ends
  gateEdge: 21.5, // half-width of the straight shoreline at the front edge
  depth: 4, // slab thickness above the sea floor
  tile: 18, // m per sand texture tile
  fenceHeight: 3, // invisible wall around the sand so nobody walks into the sea
}
export const WATER = { level: -0.6, size: 1400, color: '#12a9e6', shallow: '#7ff0ff' }
export const SPAWN = { x: 0, y: 0.05, z: 2 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character'] // the player is a truck: chase cam only
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 26, // m/s truck cruise (camera speed framing reference)
  sprintSpeed: 44, // m/s with nitro (camera speed framing reference)
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 7, // m/s (truck hop)
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.5, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.5, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -14, // fell off the edge this far: respawn
}
export const PLAYER_DIMS = { radius: 1.55, height: 3.3 } // capsule the truck's controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 220, far: 760 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1d7cf2',
    horizon: '#cfe9ff',
    sunColor: '#fff6e4',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.3,
    sunElevation: 58, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#eaf4ff',
    hemiGround: '#9cc67a',
    hemiIntensity: 1.0,
    envIntensity: 0.55,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1600,
  startPitch: 0.3, // radians above the horizon (chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 17, // resting boom length, m
  minDistance: 7, // closest the wheel zooms in
  maxDistance: 60,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 0.62, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
  followDelay: 1.2, // s after the last look input before the cam swings behind the truck
  followRate: 2.2, // 1/s it swings back
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =====================================================================================
// Escape the Ramps
// =====================================================================================

// Truck driving (player.js) and its model (truck.js).
export const TRUCK = {
  topSpeed: 24, // m/s forward at the base Speed stat (x speedFactor)
  reverseSpeed: 11,
  accel: 22, // m/s^2 toward the throttle target
  brake: 48,
  coast: 9,
  turnRate: 2.1, // rad/s at full lock
  fullTurnSpeed: 7, // m/s at which steering reaches full rate
  nitroMul: 1.07, // a well-timed nitro jumps like ~1.75x your Speed stat (rescues 50%+ of a stage's target)
  boostMul: 1.45, // the blue speed strip
  boostTime: 1.6, // s
  model: { wheelR: 0.7, wheelW: 0.62, track: 1.28, base: 1.28 },
}
export const NITRO = { duration: 5, cooldown: 6 } // s

// Economy (game.js): what the HUD shows and how fast it grows.
export const ECONOMY = {
  start: { wins: 0, gears: 17, gems: 0, speed: 131, level: 6, xp: 17 },
  levelBase: 13, // xp to level up = levelBase + levelStep * level (level 6 -> 37, 7 -> 41)
  levelStep: 4,
  driveTick: 0.45, // s between "+N" speed gains while driving
  driveMinSpeed: 3, // m/s
  afkTick: 1, // s between gains on an AFK ramp (ramp multiplier x Speed Multi; trucks do not multiply it)
  speedPacks: [
    { label: '10K Speed', amount: 10000, gems: 9, cls: 'p1' },
    { label: '60K Speed', amount: 60000, gems: 34, cls: 'p2' },
    { label: '150K Speed', amount: 150000, gems: 59, cls: 'p3' },
  ],
}

// Every truck: the starter, the two-row showroom (wins), the gem displays.
// bonus = speed gained per tick while driving it.
export const CARS = {
  tiger: { name: 'Tiger', bonus: 1, wins: 0, paint: { base: '#ff8a1f', accent: '#5a2a8a', pattern: 'tiger', features: ['eyes'] } },
  lion: { name: 'Lion', bonus: 5, wins: 10, paint: { base: '#e0a33a', accent: '#8a4a1c', pattern: 'patches', features: ['mane', 'ears'] } },
  panda: { name: 'Panda', bonus: 25, wins: 100, paint: { base: '#f2f4f6', accent: '#2a2c33', pattern: 'patches', rim: '#2a2c33', features: ['ears', 'eyes'] } },
  eagle: { name: 'Eagle', bonus: 40, wins: 500, paint: { base: '#ffcf2a', accent: '#d8401c', pattern: 'flames', features: ['beak', 'wings'] } },
  pig: { name: 'Piggy', bonus: 50, gems: 29, paint: { base: '#ff9ccc', accent: '#ff6fb0', pattern: 'spots', rim: '#ff5aa5', rimLight: '#ffd1e8', features: ['ears', 'snout', 'eyes'] } },
  shark: { name: 'Shark', bonus: 100, wins: 2500, paint: { base: '#2f8cff', accent: '#e8f2ff', pattern: 'stripes', features: ['fin', 'teeth'] } },
  chicken: { name: 'Chicken', bonus: 250, wins: 10000, paint: { base: '#f4f6fa', accent: '#e8202a', pattern: 'plain', rim: '#e8202a', features: ['comb', 'eyes'] } },
  cheetah: { name: 'Cheetah', bonus: 500, wins: 35000, paint: { base: '#f0a52a', accent: '#3a2410', pattern: 'spots', features: ['ears', 'eyes'] } },
  croc: { name: 'Croc', bonus: 1000, wins: 100000, paint: { base: '#2fb84a', accent: '#1b6b2a', pattern: 'patches', features: ['spikes', 'teeth', 'eyes'] } },
  wolf: { name: 'Wolf', bonus: 2000, wins: 250000, paint: { base: '#e6ebf2', accent: '#8a95a8', pattern: 'zigzag', features: ['ears', 'spikes'] } },
  rhino: { name: 'Rhino', bonus: 4000, wins: 500000, paint: { base: '#4a5263', accent: '#2a3040', pattern: 'patches', features: ['rhinoHorn', 'ears'] } },
  hornet: { name: 'Hornet', bonus: 7000, wins: 750000, paint: { base: '#1e1f26', accent: '#ffd21a', pattern: 'stripes', rim: '#ffd21a', features: ['horns', 'eyes'], horn: '#ffd21a' } },
  frog: { name: 'Frog', bonus: 750, gems: 299, paint: { base: '#3cd23a', accent: '#1f8a2a', pattern: 'spots', features: ['frogEyes'] } },
  bull: { name: 'Bull', bonus: 5000, gems: 499, paint: { base: '#1b1c22', accent: '#ff8a1a', pattern: 'flames', rim: '#d8202a', rimLight: '#ff5050', features: ['horns'] } },
}
export const SHOWROOM_ROWS = [
  ['tiger', 'lion', 'panda', 'eagle', 'pig', 'shark'], // front (lower) tier, north -> south
  ['chicken', 'cheetah', 'croc', 'wolf', 'rhino', 'hornet'], // back (upper) tier
]

// AFK quarter-pipes along the west edge, north -> south.
export const AFK_RAMPS = [
  { mult: 1, label: '1x Speed', colors: ['#1f7dff', '#6cc4ff'], fill: ['#ffffff', '#cfd6e2'], z: -30 },
  { mult: 3, label: '3x Speed', colors: ['#ffc81a', '#ff9a12'], fill: ['#ffe14a', '#ff9a12'], z: -16 },
  { mult: 5, label: '5x SPEED', colors: ['#d92cff', '#9a2cf0'], fill: ['#ff7aff', '#b52cf0'], z: -2 },
  { mult: 15, label: '15x SPEED', colors: ['#1fb84a', '#0d5f26'], fill: ['#7dff6a', '#18a83a'], z: 12 },
  { mult: 30, label: '30x SPEED', colors: ['#ff2a3a', '#1a1a22'], fill: ['#ff5a4a', '#d8101c'], z: 26 },
]

// The stage lane north of the hub (stages.js): 20 stages, each a flat grass
// plateau (an island) ending in a striped ramp that jumps a gap to the next
// one; the hub's blue boost ramp jumps to Stage 1 (HUB.launch). Harder as you
// climb: longer lanes, taller/steeper ramps, wider gaps. Before `gapFrom` the
// gap is a warm-up (`easyMargin` of a top-speed jump); from `gapFrom` on only
// a truck with `needStat(k)` Speed clears it. That target is the Speed a
// player has earned by the time they reach the RECOMMENDED LEVEL printed on
// the stage's sign (XP = Speed gained), so the sign is the real requirement.
// Progress gates: stats come mostly from driving with better trucks, trucks
// cost wins, and wins come from the stages' pads.
export const STAGES = {
  count: 20,
  half: 28, // plateau half-width
  fence: 26,
  rampHalf: 20,
  flat: (k) => 210 + k * 6, // m of lane before the ramp
  rampLen: 40,
  rise: (k) => 6 + k * 0.45, // m the ramp climbs to the next plateau
  gapFrom: 4, easyMargin: 0.75,
  needStat: (k) => levelSpeed(STAGES.recommended[k]), // Speed stat that clears stage k's gap
  needSpeed: (k) => TRUCK.topSpeed * speedFactor(STAGES.needStat(k)), // m/s that stat gives
  gapMargin: 0.95, // the gap is this share of the ideal jump at needSpeed (~80% of the target Speed still clears)
  thickness: 9, // plateau slab depth (floating islands)
  wins: [1, 5, 20, 50, 100, 200, 350, 600, 1000, 1600, 2500, 4000, 6000, 9000, 13000, 18000, 25000, 35000, 50000, 75000],
  finishWins: 250000,
  recommended: [0, 4, 7, 14, 22, 32, 45, 60, 80, 100, 125, 155, 190, 230, 275, 325, 380, 440, 510, 590, 680],
  colors: [
    ['#e8203a', '#ff7a9a'], ['#ffc81a', '#fff07a'], ['#a52cf0', '#e08aff'], ['#1fb84a', '#7dff6a'], ['#1f7dff', '#7fd4ff'],
    ['#ff7a1a', '#ffc27a'], ['#ff3fa8', '#ffa8d8'], ['#14c8c8', '#8ff4f0'], ['#e8203a', '#ffe14a'], ['#5a3cff', '#a89aff'],
  ],
  gearRespawn: 25, // s before a collected gear comes back
  gearRadius: 3.2,
  magnetRadius: 9,
  skipCost: (k) => 5 + k * 5, // gems
  fallBelow: 16, // m under the stage you were on: back to its start
}
// Top speed grows with the Speed stat as a gentle power curve (x2 stat = +8.7% speed,
// so +18% jump range), so speed packs, trucks and AFK all matter, evenly at every stage.
export const speedFactor = (stat) => Math.max(1, Math.max(1, stat) / ECONOMY.start.speed) ** 0.12
// Total Speed gained by the time a player reaches `level` (sum of the XP bar sizes).
export const levelSpeed = (level) => ECONOMY.levelBase * (level - 1) + (ECONOMY.levelStep * level * (level - 1)) / 2
