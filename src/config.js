// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'escape-the-ramps' // slug registered on bloxity.io
export const GAME_TITLE = 'Escape the Ramps'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- Game server (Colyseus, ../Escape-the-ramps-backend) --------------------------
// On Bloxity hosting the SDK resolves the endpoint itself; VITE_SERVER_URL_DEV / _MAIN override it
// (see .env.example). `npm run dev` falls back to a local server on ws://localhost:2567.
const SERVER_URL_DEV = import.meta.env.VITE_SERVER_URL_DEV || (import.meta.env.DEV ? 'ws://localhost:2567' : '')
const SERVER_URL_MAIN = import.meta.env.VITE_SERVER_URL_MAIN || ''
export const SERVER_URL = import.meta.env.MODE === 'production' ? SERVER_URL_MAIN : SERVER_URL_DEV
export const NET = { retry: 10 } // s between connection attempts while the server is unreachable

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

// Audio mix (audio.js): bus volumes 0..1.
export const AUDIO = { master: 0.8, sfx: 0.75, music: 0.32, engine: 0.22, hazards: 1.0, hearRange: 80 } // hazards: positional hazard sound level; hearRange: m past which they are not played

// Economy (game.js): what the HUD shows and how fast it grows.
export const ECONOMY = {
  start: { wins: 0, gears: 0, gems: 0, speed: 1, level: 1, xp: 0 },
  speedRef: 131, // Speed stat that counts as the 1.0x top-speed baseline (kept from the old start so tuning is unchanged)
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
  tiger: { rarity: 'common', name: 'Tiger', bonus: 1, wins: 0, paint: { base: '#ff8a1f', accent: '#5a2a8a', pattern: 'tiger', features: ['eyes'] } },
  lion: { rarity: 'common', name: 'Lion', bonus: 5, wins: 10, paint: { base: '#e0a33a', accent: '#8a4a1c', pattern: 'patches', features: ['mane', 'ears'] } },
  panda: { rarity: 'common', name: 'Panda', bonus: 25, wins: 100, paint: { base: '#f2f4f6', accent: '#2a2c33', pattern: 'patches', rim: '#2a2c33', features: ['ears', 'eyes'] } },
  eagle: { rarity: 'rare', name: 'Eagle', bonus: 40, wins: 500, paint: { base: '#ffcf2a', accent: '#d8401c', pattern: 'flames', features: ['beak', 'wings'] } },
  pig: { rarity: 'exclusive', name: 'Piggy', bonus: 50, wins: 1000, paint: { base: '#ff9ccc', accent: '#ff6fb0', pattern: 'spots', rim: '#ff5aa5', rimLight: '#ffd1e8', features: ['ears', 'snout', 'eyes'] } },
  shark: { rarity: 'rare', name: 'Shark', bonus: 100, wins: 2500, paint: { base: '#2f8cff', accent: '#e8f2ff', pattern: 'stripes', features: ['fin', 'teeth'] } },
  chicken: { rarity: 'rare', name: 'Chicken', bonus: 250, wins: 10000, paint: { base: '#f4f6fa', accent: '#e8202a', pattern: 'plain', rim: '#e8202a', features: ['comb', 'eyes'] } },
  cheetah: { rarity: 'epic', name: 'Cheetah', bonus: 500, wins: 35000, paint: { base: '#f0a52a', accent: '#3a2410', pattern: 'spots', features: ['ears', 'eyes'] } },
  croc: { rarity: 'epic', name: 'Croc', bonus: 1000, wins: 100000, paint: { base: '#2fb84a', accent: '#1b6b2a', pattern: 'patches', features: ['spikes', 'teeth', 'eyes'] } },
  wolf: { rarity: 'legendary', name: 'Wolf', bonus: 2000, wins: 250000, paint: { base: '#e6ebf2', accent: '#8a95a8', pattern: 'zigzag', features: ['ears', 'spikes'] } },
  rhino: { rarity: 'mythic', name: 'Rhino', bonus: 4000, wins: 500000, paint: { base: '#4a5263', accent: '#2a3040', pattern: 'patches', features: ['rhinoHorn', 'ears'] } },
  hornet: { rarity: 'secret', name: 'Hornet', bonus: 7000, wins: 750000, paint: { base: '#1e1f26', accent: '#ffd21a', pattern: 'stripes', rim: '#ffd21a', features: ['horns', 'eyes'], horn: '#ffd21a' } },
  frog: { rarity: 'exclusive', name: 'Frog', bonus: 750, wins: 60000, paint: { base: '#3cd23a', accent: '#1f8a2a', pattern: 'spots', features: ['frogEyes'] } },
  rabbit: { rarity: 'exclusive', name: 'White Rabbit', bonus: 700, daily: true, paint: { base: '#f6f7fb', accent: '#ff9ccc', pattern: 'spots', rim: '#ff9ccc', features: ['ears', 'eyes'] } },
  bull: { rarity: 'exclusive', name: 'Bull', bonus: 5000, wins: 600000, paint: { base: '#1b1c22', accent: '#ff8a1a', pattern: 'flames', rim: '#d8202a', rimLight: '#ff5050', features: ['horns'] } },
}
// Car rarities: the Cars window's card colour and label (CARS[id].rarity).
export const CAR_RARITY = {
  common: { label: 'Common', color: '#7dff4a', card: ['#3fd65a', '#1fae3e'] },
  rare: { label: 'Rare', color: '#5cd2ff', card: ['#3aa2f0', '#1f6fd0'] },
  epic: { label: 'Epic', color: '#d08cff', card: ['#b14ae8', '#8a2ccf'] },
  legendary: { label: 'Legendary', color: '#ff7aff', card: ['#e83ad8', '#b81fb0'] },
  mythic: { label: 'Mythic', color: '#ffb02a', card: ['#ff9a1a', '#e8700a'] },
  secret: { label: 'Secret', color: '#ff5a5a', card: ['#ee3a3a', '#c41f2a'] },
  exclusive: { label: 'Exclusive', color: '#ffe14a', card: ['#ffd21a', '#ff9a12'] },
}
export const CAR_RARITY_ORDER = ['exclusive', 'common', 'rare', 'epic', 'legendary', 'mythic', 'secret']

export const SHOWROOM_ROWS = [
  ['tiger', 'lion', 'panda', 'eagle', 'pig', 'shark'], // front (lower) tier, north -> south
  ['chicken', 'cheetah', 'croc', 'wolf', 'rhino', 'hornet'], // back (upper) tier
]

// AFK quarter-pipes along the west edge, north -> south. `rebirths` = Rebirths
// needed to ride it (a locked ramp has a gate at its foot). A ramp pays
// mult x Speed Multi (= rebirths + 1) per afkTick, so each unlock is a real jump
// for a player who just reached it: R1 3x = 6/s (vs 2/s on 1x), R2 5x = 15/s,
// R4 15x = 75/s (vs 25/s on 5x), R6 30x = 210/s (vs 105/s on 15x).
export const AFK_RAMPS = [
  { mult: 1, rebirths: 0, label: '1x Speed', colors: ['#1f7dff', '#6cc4ff'], fill: ['#ffffff', '#cfd6e2'], z: -30 },
  { mult: 3, rebirths: 1, label: '3x Speed', colors: ['#ffc81a', '#ff9a12'], fill: ['#ffe14a', '#ff9a12'], z: -16 },
  { mult: 5, rebirths: 2, label: '5x SPEED', colors: ['#d92cff', '#9a2cf0'], fill: ['#ff7aff', '#b52cf0'], z: -2 },
  { mult: 15, rebirths: 4, label: '15x SPEED', colors: ['#1fb84a', '#0d5f26'], fill: ['#7dff6a', '#18a83a'], z: 12 },
  { mult: 30, rebirths: 6, label: '30x SPEED', colors: ['#ff2a3a', '#1a1a22'], fill: ['#ff5a4a', '#d8101c'], z: 26 },
]
// Auto ride (player.js rampStep): rolling onto an AFK ramp rides it by itself,
// up to `height` x the ramp radius, back down onto the pad and up again. Any
// control press (key, joystick, HOP, NITRO) hands the truck back to the player;
// leaving the ramp and rolling on again re-arms it.
export const AFK_AUTO = {
  height: 0.72, // peak height as a share of the ramp radius (~74 degrees up the face)
  push: 1.5, // engine push x TRUCK.accel while climbing
  runout: 6, // m the truck may roll back onto the pad before it drives up again
}

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
  gapFrom: 4, easyMargin: 0.75, edgeReach: 1.9, // m added to every gap: takeoff past the lip + the nose landing reach about 2 m past the formula (measured)
  needStat: (k) => levelSpeed(STAGES.recommended[k]), // Speed stat that clears stage k's gap
  needSpeed: (k) => TRUCK.topSpeed * speedFactor(STAGES.needStat(k)), // m/s that stat gives
  gapMargin: 0.95, // the gap is this share of the ideal jump at needSpeed (about 80% of the target Speed still clears)
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
export const speedFactor = (stat) => Math.max(1, Math.max(1, stat) / ECONOMY.speedRef) ** 0.12
// Total Speed gained by the time a player reaches `level` (sum of the XP bar sizes).
export const levelSpeed = (level) => ECONOMY.levelBase * (level - 1) + (ECONOMY.levelStep * level * (level - 1)) / 2

// --- Windows (hud/windows.js) ------------------------------------------------------
// Tuning: parts bought with gears (limited stock that restocks on the wall clock,
// the same for everyone) or gems (no stock limit). Equipped parts add their % to
// every Speed gain (game.state.tuning).
export const TUNING = {
  restockEvery: 300, // s
  restockGems: 9, // the RESTOCK button
  slots: 10, // equip slots to start with
  maxSlots: 20,
  slotGems: 15, // the green + buys one more slot
  rarities: [
    { id: 'common', label: 'COMMON', pct: 5, gears: 100, gems: 9, stock: 3 },
    { id: 'uncommon', label: 'UNCOMMON', pct: 10, gears: 350, gems: 19, stock: 2 },
    { id: 'rare', label: 'RARE', pct: 15, gears: 1500, gems: 39, stock: 1 },
    { id: 'epic', label: 'EPIC', pct: 25, gears: 5000, gems: 79, stock: 1 },
  ],
  parts: {
    oil: { name: 'Oil', rarity: 'common' },
    plug: { name: 'Spark Plug', rarity: 'common' },
    exhaust: { name: 'Exhaust', rarity: 'uncommon' },
    tires: { name: 'Tires', rarity: 'uncommon' },
    clutch: { name: 'Clutch', rarity: 'rare' },
    turbo: { name: 'Turbo', rarity: 'rare' },
    transmission: { name: 'Transmission', rarity: 'epic' },
    engine: { name: 'V8 Engine', rarity: 'epic' },
  },
}
// Rebirth r -> r + 1 needs Level levelReq(r), resets Level, XP and the Speed stat,
// and multiplies every Speed gain by multi(r + 1). Skip keeps everything for gems.
export const REBIRTH = {
  levelReq: (r) => 15 + r * 10,
  multi: (r) => r + 1,
  skipGems: (r) => 14 + r * 10,
}
// Teleport window: stage k (1-based) is free once reached or once you have
// wins[k - 1] wins; gems(k) teleports there right away.
export const TELEPORT = {
  wins: [0, 2, 10, 40, 70, 150, 300, 600, 1000, 1800, 3000, 5000, 8000, 12000, 18000, 26000, 38000, 55000, 80000, 120000],
  gems: (k) => (k <= 1 ? 0 : k === 2 ? 3 : 5 * (k - 2)),
}
// Daily rewards: one claim per local day, 7-day streak (a missed day starts over).
// Rewards: gears, wins, nitro (s added to the next nitro), boost (2x wins for min), car.
export const DAILY = [
  { gears: 300, label: '300 Gears', icons: ['gear'] },
  { boost: 5, gears: 1000, label: '2x Wins 5 min<br>+1K Gears', icons: ['trophy', 'gear'], small: true },
  { nitro: 10, label: '+10s Nitro', icons: ['nitro'] },
  { gears: 5000, label: '5K Gears', icons: ['gear'] },
  { wins: 5000, nitro: 20, label: '5K Wins<br>+20s Nitro', icons: ['trophy', 'nitro'], small: true },
  { boost: 10, label: '2x Wins<br>10 min', icons: ['trophy'], small: true },
  { car: 'rabbit', gears: 10000, wins: 10000, label: 'White Rabbit<br>10K Gears +<br>10K Wins', icons: ['gear', 'trophy'] },
]

// --- Hub power-ups (game.js buyVip / buyBalloons / buyWings) ------------------------
// Prices in wins are SPENT (unlike trucks, which only need you to hold the wins).
export const VIP = { wins: 25000 } // permanent: the magenta 2x WINS pads pay out
// Balloons (a huge wins price, SPENT): gravity x gravityMul while airborne for `minutes` (buying again stacks time).
export const BALLOONS = { wins: 100000, minutes: 5, gravityMul: 0.6 }
// Wings: for `minutes`, hold HOP/Space in the air to glide: gravity x gravityMul and the
// fall speed capped at glideFall m/s.
export const WINGS = { wins: 2500, minutes: 5, gravityMul: 0.35, glideFall: 4 }
// Gifting a tuning part to a player on the same server costs the rarity's gem price.
export const GIFT = { cooldown: 2 } // s between gifts (the server enforces it too)

// --- Stage obstacles (hub/obstacles.js) ---------------------------------------------
// Each stage's lane gets hazards and surfaces, paced teach -> test -> twist -> rest:
// a new mechanic first shows up alone and slow (with a NEW! sign), then harder,
// then mixed with an older one, then a breather; stages 10 and 20 are "boss"
// stages that mix everything so far. Entries are [type, count]; the slots are
// spread evenly over the lane in order, skipping the win-pad area and the
// last `clearBeforeRamp` m before the ramp, so every calibrated jump keeps a clean
// run-up. Three steps of aggression:
//  - stages 1-5: guardrails all the way, hazards only cost time;
//  - from `edgesFrom`: the rail is open (red/white curbs) beside the hammers,
//    sweepers, pistons, wrecking balls, mallets and conveyors, so a hit can
//    throw the truck into the sea (back to the stage's last checkpoint);
//  - from `crushDeathFrom`: crushers and mallets wreck the truck outright.
export const STAGE_OBSTACLES = [
  /* 1  rest   */ [['booster', 2]],
  /* 2  teach  */ [['pendulum', 1], ['mines', 1]],
  /* 3  test   */ [['pendulum', 1], ['booster', 1], ['spikes', 1], ['pendulum', 1]],
  /* 4  teach  */ [['booster', 1], ['laser', 1], ['sweeper', 1]],
  /* 5  twist  */ [['pendulum', 1], ['laser', 1], ['risky', 1], ['sweeper', 1]],
  /* 6  edges  */ [['turret', 1], ['ice', 1], ['pendulum', 1], ['bumpers', 1]],
  /* 7  teach  */ [['crumble', 1], ['sweeper', 1], ['cannon', 1], ['turntable', 1], ['turret', 1]],
  /* 8  teach  */ [['crusher', 1], ['flames', 1], ['blades', 1], ['mines', 1]],
  /* 9  teach  */ [['wreck', 1], ['tesla', 1], ['smoke+mines', 1], ['geyser', 1]],
  /* 10 boss   */ [['pendulum', 1], ['ice', 1], ['bossTower', 1], ['cannon', 1], ['bumpers', 1]],
  /* 11 teach  */ [['bounce', 1], ['mallet', 1], ['seesaw', 1], ['narrow', 1]],
  /* 12 teach  */ [['logs', 1], ['missiles', 1], ['wind', 1], ['fakewall', 1], ['piston', 1]],
  /* 13 dark   */ [['conveyor', 1], ['laser', 1], ['mallet', 1], ['bridge', 1], ['rammers', 1]],
  /* 14 teach  */ [['conveyor', 1], ['crane', 1], ['grinder', 1], ['tesla', 1], ['trapdoor', 1]],
  /* 15 teach  */ [['mud', 1], ['wave', 1], ['boulder', 1], ['mines+ice', 1]],
  /* 16 chase  */ [['booster', 2], ['spikes', 1], ['turret', 1], ['pile', 1]],
  /* 17 test   */ [['pendulum', 1], ['turntable', 1], ['pistons4', 1], ['fakefloor', 1], ['flames', 1]],
  /* 18 lava   */ [['ice', 1], ['sweeper', 1], ['laser+conveyor', 1], ['tesla', 1], ['missiles', 1]],
  /* 19 chase  */ [['conveyor', 1], ['pistons4', 1], ['mines+conveyor', 1], ['crumble', 1], ['rammers', 1], ['turret', 1]],
  /* 20 boss   */ [['booster', 1], ['wind', 1], ['bossRobot', 1], ['mallet', 1], ['trapdoor', 1], ['missiles', 1], ['smoke+blades', 1], ['grinder', 1]],
]
// Hazards over the gap AFTER stage k's ramp (gaps.js), and whole-stage
// modifiers on stage k: `landing` (shifting panels where you land), `breakRamp`
// (the ramp crumbles if you dawdle on it), `chaser` (a wrecker truck hunts
// you), `flood` (lava pours down the lane behind you), `dark` (lights out).
export const GAP_HAZARDS = {
  5: ['gapWind'], 8: ['gapDrones'], 11: ['gapLaser'], 14: ['gapBlades'], 15: ['gapWind'],
  17: ['gapDrones', 'gapWind'], 18: ['gapLaser'], 19: ['gapBlades'], 20: ['gapLaser', 'gapDrones'],
}
export const STAGE_MODS = {
  12: ['breakRamp'], 13: ['dark'], 16: ['chaser', 'landing'], 17: ['breakRamp'], 18: ['flood'], 19: ['chaser', 'landing'],
}
// Danger streak (main.js): every near miss raises the gear multiplier by `step`
// (up to `max` steps); a hit resets it.
export const DANGER = { step: 0.5, max: 5 }
// [a, b] pairs below go from a (stage 1) to b (stage 20) with OBSTACLE.ramp(k).
export const OBSTACLE = {
  laneStart: 26, // m after the stage start before the first slot
  padClear: [12, 12], // m kept clear before the yellow pad / after the VIP pad
  clearBeforeRamp: 40, // m before the ramp foot with no slots (the run-up)
  boosterMinToRamp: 110, // boosters only this far from the ramp (they would beat the gap gate)
  ramp: (k) => Math.min(1, (k - 1) / 18), // 0..1 difficulty within the world, scales speeds below
  edgesFrom: 6, // open rail gaps beside knock-off hazards from this stage
  edgeTypes: ['pendulum', 'sweeper', 'piston', 'pistons4', 'wreck', 'mallet', 'conveyor', 'bumpers', 'cannon', 'wind', 'geyser', 'logs', 'mines', 'rammers', 'crane', 'turntable', 'seesaw'],
  edgePad: 6, // m of open edge beyond the slot's footprint, each end
  crushDeathFrom: 1, // crushers / mallets / pile drivers / the grinder wreck the truck from here (every stage: crushed = dead)
  pendulum: { pivot: 13, arm: 11, amp: 0.95, period: [3.4, 1.5], headR: 1.25, headLen: 3.4, knock: [22, 32], lift: [7, 13], xs: [-14, 0, 14], desyncFrom: 10, desync: 0.16, doubleFrom: 15 },
  sweeper: { arm: 11.5, h: 1.0, speed: [0.9, 2.2], knock: [15, 25], xs: [-12.5, 12.5], surgeFrom: 8, surgeEvery: 5, surgeTime: 1.1, surgeWarn: 0.8, reverseFrom: 14, reverseEvery: 4.5, highFrom: 16, highBar: 3.0 }, // h: low bar top (hop it); highBar: the high bar's height (don't hop)
  crusher: { w: 15, d: 7, h: 4, lift: 9, xs: [-16, 0, 16], cycle: [4.2, 2.6], warn: [0.6, 0.32], fall: 0.16, down: 0.8, rise: 1.0, fakeFrom: 11, doubleFrom: 15 },
  wave: { count: 5, spacing: 7.5, d: 6, delay: 0.3, cycle: [4.8, 3.8], warn: 0.4 }, // full-width crushers slamming in sequence (wave ~25 m/s)
  pile: { xs: [-18, -6, 6, 18], r: 2.2, cycle: [2.0, 1.4], warn: 0.25 },
  piston: { reach: [21, 27], d: 5, h: 2.4, cycle: [3.6, 2.1], warn: [0.55, 0.38], punch: [0.16, 0.08], hold: 0.6, back: 0.8, knock: [19, 29] },
  mallet: { len: 15, headR: 2.2, headLen: 6, cycle: [4.0, 2.7], warn: 0.75, slam: 0.3, down: 0.55, rise: 1.2, shock: 8, shockKnock: 17 },
  wreck: { pivot: 25, chain: 22, ballR: 2.7, amp: 0.6, period: [4.2, 2.9], knock: 22, side: 15, lift: 10, xs: [-10, 10] },
  logs: { speed: [11, 17], r: 1.1, len: 15, xs: [-15, 0, 15], pause: 0.8, knock: 8 },
  cannon: { cycle: [3.4, 2.3], speed: [24, 34], knock: [20, 27], warn: 0.7, ballR: 0.9 },
  bumpers: { knock: [20, 28], layout: [[-14, 7], [-4, 2], [7, 6], [15, -3], [-8, -6]] },
  grinder: { wallX: 7.6, rollerX: 6.0, r: 1.6, spin: 9 }, // channel between the roller surfaces = 2 * (rollerX - r)
  blades: { rows: [-6, 0, 6], cols: [-15, -5, 5, 15], r: 1.6, speed: [2.2, 3.4] },
  wind: { cycle: [5.0, 3.6], accel: [38, 55], blast: 1.6, spinUp: 1.0, down: 0.8, len: 12 }, // accel: m/s^2 sideways push during the blast
  geyser: { xs: [-15, -5, 5, 15], r: 1.7, cycle: [3.6, 2.6], lift: [13, 17], warn: 0.8, burst: 0.7, height: 9 },
  bridge: { half: 7, plank: 2, wobble: 0.35, back: 5 },
  trapdoor: { cycle: [4.2, 3.0], warn: 0.7, openTime: 1.0, close: 0.4 },
  narrow: { half: 10, bumpers: [[-4, 8], [4, -6]] },
  ice: { len: 30, grip: 1.4 }, // grip: 1/s the slide lines up with the heading (normal ground is instant)
  mud: { len: 26, w: 30, top: 0.55 }, // top: top-speed factor; only part of the width, so it can be dodged
  conveyor: { len: 16, push: 9 }, // m/s sideways
  bounce: { w: 9, len: 7, launch: 15 },
  booster: { w: 8, len: 9 },
  // --- Weapons (weapons.js) ---
  laser: { cycle: [3.4, 2.4], on: [1.5, 1.25], warn: 0.6, spacing: 6, low: 0.9, high: 3.25, knock: [12, 18], altFrom: 5, sweepFrom: 12, sweepSpeed: [0.6, 0.95], gridFrom: 16, gridStep: [1.6, 1.15] }, // low beam: hop it; high beam: don't hop
  turret: { cycle: [3.4, 2.1], aim: [1.3, 0.75], speed: [26, 40], range: 80, lead: [0.25, 0.75], turn: 2.6 },
  mines: { count: [5, 12], len: 24, r: 0.85, blast: 4.8, knock: [13, 19], lift: [9, 13], fuse: 0.22, respawn: 7, hiddenFrom: 13, reveal: 10, chainFrom: 9, chain: 7.5, chainDelay: 0.22 },
  missiles: { cycle: [3.6, 2.4], lock: 0.9, flight: [1.7, 1.25], blast: 5.5, kill: 2.1, knock: [15, 21], lift: 12, lead: [0.8, 1.1], zone: 46, twinFrom: 18 },
  flames: { cycle: [3.2, 2.2], warn: 0.75, burn: [1.1, 1.5], reach: 17, slow: 0.55, burnTime: 2.4, crossFrom: 17 },
  tesla: { cycle: [3.2, 2.1], on: [1.0, 1.3], warn: 0.6, noSteer: 1.1, keep: 0.5, knock: 8, xs: [-24.5, -12, 0, 12, 24.5], h: 1.7 },
  spikes: { cycle: [2.9, 2.0], warn: 0.45, flat: 3.2, pull: 0.55, top: 0.72, rows: [-4, 4] },
  // --- Enemies (enemies.js) ---
  rammers: { speed: [18, 27], cycle: [5.2, 3.6], warn: 1.3, knock: [22, 30], lanes: [-5, 5] },
  crane: { zone: 26, speed: [5, 8.5], charge: [1.5, 1.0], lift: 15, fling: 21 },
  boulder: { speed: [15, 21], r: 3.0, accel: 9, steer: 1.2 },
  bossTower: { cycle: [2.8, 2.2], burst: 3, gap: 0.2, speed: 34, sweep: 0.9, sweepR: 19 },
  bossRobot: { cycle: [3.2, 2.4], aim: 1.15, slam: 0.2, down: 0.7, shock: 9, shockKnock: 18, lead: 0.55, eyeSpeed: 0.8 },
  // --- Floors and terrain (floors.js) ---
  crumble: { wobble: 0.45, back: 6 },
  seesaw: { stiff: 1.6, damp: 1.1, push: 0.018, max: 0.17, slide: 0.85 },
  turntable: { r: 12, spin: [0.55, 1.05], knock: [12, 17] },
  smoke: { len: 30 },
  fakefloor: { fakes: 3 },
  // --- Gaps and stage modifiers (gaps.js) ---
  gapLaser: { cycle: [3.4, 2.8], on: [1.3, 1.4], warn: 0.7 },
  gapBlades: { R: 15, spin: [1.0, 1.35], knock: 10 },
  gapDrones: { count: 3, speed: [7, 10.5], knock: 9 },
  gapWind: { accel: [9, 15], cycle: 5.5, warn: 1.0 },
  landing: { depth: 14, panels: 7, window: 3, step: [1.7, 1.3], warn: 0.55 },
  breakRamp: { hold: 1.7, down: 4.5 },
  chaser: { delay: 2.2, speed: [0.74, 0.8], accel: 16, catch: 3.3 }, // speed: share of the stage's target speed
  flood: { delay: 1.2, speed: [0.44, 0.48] }, // lava front speed: share of the stage's target speed
  nearMiss: 1.6, // m beyond a hit that counts as a near miss
  nearCooldown: 3, // s per obstacle
}
// Falling off an island: the truck drops (a camera cut down to the sea when the
// island is high), splashes, sinks, and goes back to the start of the stage.
export const FALL = { splashMaxDrop: 30, cutAfter: 0.3, cutHeight: 12, sink: 0.45, maxTime: 3.5, slowmo: 0.3 }
// Wrecked (lethal crush): hit-stop, flattened for `pancake` s, then flying wheels
// and panels, then the stage start after `respawn` s.
export const WRECK = { hitStop: 0.09, pancake: 0.2, respawn: 0.75, debrisLife: 2.6 }
// A stage cleared without dying (first try): bonus gears x stage; also no hits = FLAWLESS.
export const BONUS = { noDeaths: 15, flawless: 25 }
// Moving / shrinking stage rings (the gold hoop over each ramp end).
export const RING = { moveFrom: 8, amp: 6.5, speed: 0.7, shrinkTo: 0.62 }

// Stage runs (runs.js): timer from landing on a stage to landing on the next,
// medals against a par time, falls counted per stage, a ghost of the best run.
export const MEDALS = {
  tiers: [
    { id: 'bronze', label: 'Bronze', color: '#e0904a', par: 1.7, gears: 10 },
    { id: 'silver', label: 'Silver', color: '#d8e0ea', par: 1.3, gears: 25 },
    { id: 'gold', label: 'Gold', color: '#ffd21a', par: 1.0, gears: 60, gems: 1 },
  ],
  parSpeed: 0.92, // share of the stage's target speed a gold run averages
  perObstacle: 0.7, // s added to par per hazard slot
  ghostHz: 10, // ghost samples per second
}
// Game feel (main.js / camera.js).
export const JUICE = {
  ringSlowmo: { scale: 0.3, hold: 0.45, ease: 6 }, // time scale while flying through a ring
  landShake: 0.05, // shake per unit of landing impact (player.landed, up to 8)
  hitShake: 0.6,
  slamShake: 0.35, // a crusher slamming nearby
  shakeDecay: 7,
  airMin: 1.1, // s airborne before an AIR bonus counts
  airGears: 2, // gears per s of air, x stage
  nearGears: 1, // gears per near miss, x stage
}

// Friend invites (net.js / game.js): joining through a friend's invite pays the joiner `join`; each
// friend who joins your room pays you `host`; every other player in the room adds `perFriend` %
// Speed gains (Friend Boost, capped at `maxBoost`).
export const INVITE = {
  join: { boostMin: 60, gems: 150, nitro: 120, label: '2x Wins for 60 min + 150 gems + 2 min nitro' },
  host: { boostMin: 15, gems: 40 },
  perFriend: 10,
  maxBoost: 100,
}
