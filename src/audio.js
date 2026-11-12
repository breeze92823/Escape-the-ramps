import { AUDIO } from './config.js'

// All game audio, synthesized with Web Audio (no sound files to load):
// - a truck engine whose revs climb through gears with speed, plus wind,
//   tyre squeal and nitro hiss loops;
// - one-shot effects (hop, landing, gear pickups that climb in pitch as a
//   combo, rings, boost, nitro, level up, stage fanfare, wins, fail...);
// - an upbeat 4-chord music loop built from a step sequencer. It adds layers
//   (drums, chords, lead, arps) as the action heats up, opens its filter at
//   speed and moves up a key every few stages, so later stages sound fresher.
// Browsers only start audio after a user gesture, so everything waits for the
// first tap / key / click. Mute mode (On / SFX only / Off) is saved locally.

const KEY = 'escape-the-ramps:audio:v1'
export const MODES = ['on', 'sfx', 'off'] // all sound / effects only / silent
let mode = 'on'
try {
  const m = localStorage.getItem(KEY)
  if (MODES.includes(m)) mode = m
} catch {
  // storage blocked: default on
}

let ctx = null
let master, sfxBus, musicBus, musicFilter, engineBus, comp, limiter, duckGain, spatialBus
let noiseBuf = null
let unlocked = false
const listeners = new Set()

const mtof = (m) => 440 * 2 ** ((m - 69) / 12)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function build() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  ctx = new AC({ latencyHint: 'interactive' })
  comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.2
  // A brick-wall limiter after the glue compressor: many sounds at once never clip.
  limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.12
  master = ctx.createGain()
  master.gain.value = AUDIO.master
  master.connect(comp).connect(limiter).connect(ctx.destination)
  sfxBus = ctx.createGain()
  sfxBus.connect(master)
  spatialBus = ctx.createGain()
  spatialBus.gain.value = AUDIO.hazards ?? 1
  spatialBus.connect(sfxBus)
  engineBus = ctx.createGain()
  engineBus.connect(master)
  musicFilter = ctx.createBiquadFilter()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.value = 4000
  musicFilter.Q.value = 0.7
  musicBus = ctx.createGain()
  duckGain = ctx.createGain() // stings duck the music here (musicBus keeps the mode level)
  musicFilter.connect(musicBus).connect(duckGain).connect(master)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  applyMode()
  buildLoops()
  return true
}

function applyMode() {
  if (!ctx) return
  const t = ctx.currentTime
  sfxBus.gain.setTargetAtTime(mode === 'off' ? 0 : AUDIO.sfx, t, 0.05)
  engineBus.gain.setTargetAtTime(mode === 'off' ? 0 : AUDIO.engine, t, 0.05)
  musicBus.gain.setTargetAtTime(mode === 'on' ? AUDIO.music : 0, t, 0.15)
}

export const getMode = () => mode
export function setMode(m) {
  if (!MODES.includes(m)) return
  mode = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    // not saved
  }
  applyMode()
  for (const fn of listeners) fn(mode)
}
// Dev inspection: context state and where the music is.
export const debugState = () => ({ ctx: ctx?.state, unlocked, mode, layer: music.layer, intensity: +music.intensity.toFixed(2), step: music.step, rpm: eng && +eng.rpm.toFixed(2), gear: eng?.gear, transpose: music.transpose })
export const cycleMode = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])
export const onMode = (fn) => listeners.add(fn)

// Browsers keep audio locked until a gesture: unlock (and start the music) on the first one.
function unlock() {
  if (!ctx && !build()) return
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  if (!unlocked) {
    unlocked = true
    // iOS: a silent buffer started inside the gesture fully wakes the context.
    const s = ctx.createBufferSource()
    s.buffer = ctx.createBuffer(1, 1, 22050)
    s.connect(ctx.destination)
    s.start()
    startMusic()
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true })
let adMute = false // a Bloxity ad break is running: silent until it ends
const syncRun = () => {
  if (!ctx || !unlocked) return
  if (document.hidden || adMute) ctx.suspend().catch(() => {})
  else ctx.resume().catch(() => {})
}
document.addEventListener('visibilitychange', syncRun)
// Ad breaks (bloxity.js onAdBreak): mute everything, restore afterwards.
export function setAdMute(on) {
  adMute = on
  syncRun()
}
const live = () => ctx && unlocked && ctx.state === 'running' && mode !== 'off'

// --- Voices ---------------------------------------------------------------------------
// Overlap control: effect voices are counted (MAX_VOICES at once; extra ones are
// dropped instead of piling up into a harsh, clipping wall of sound), and each
// effect has a minimum gap between repeats (gate) so a burst of the same event
// in one frame (a magnet sweeping up 6 gears) plays once instead of six times.
const MAX_VOICES = 44
let voices = 0
const isMusic = (o) => o.dest === musicFilter
function claim(o) {
  if (isMusic(o)) return true
  if (voices >= MAX_VOICES) return false
  voices++
  return true
}
const release = () => {
  voices = Math.max(0, voices - 1)
}
const lastPlayed = new Map()
function gate(name, gap) {
  const t = ctx.currentTime
  if (t - (lastPlayed.get(name) ?? -1) < gap) return false
  lastPlayed.set(name, t)
  return true
}
// A pitched note: oscillator -> optional filter -> envelope -> optional pan -> bus.
function tone(t, freq, dur, o = {}) {
  if (!claim(o)) return
  const osc = ctx.createOscillator()
  if (!isMusic(o)) osc.onended = release
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + (o.slideTime ?? dur))
  if (o.detune) osc.detune.value = o.detune
  if (o.vibrato) {
    const lfo = ctx.createOscillator()
    const lg = ctx.createGain()
    lfo.frequency.value = o.vibrato
    lg.gain.value = o.vibratoDepth ?? 30
    lfo.connect(lg).connect(osc.detune)
    lfo.start(t)
    lfo.stop(t + dur + 0.1)
  }
  let node = osc
  if (o.cutoff) {
    const f = ctx.createBiquadFilter()
    f.type = o.filter ?? 'lowpass'
    f.frequency.setValueAtTime(o.cutoff, t)
    if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(o.cutoffTo, t + dur)
    f.Q.value = o.q ?? 1
    node = node.connect(f)
  }
  const g = ctx.createGain()
  const peak = o.gain ?? 0.3
  const a = o.attack ?? 0.005
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  if (o.hold) g.gain.setValueAtTime(peak, t + a + o.hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  node = node.connect(g)
  if (o.pan) {
    const p = ctx.createStereoPanner()
    p.pan.value = o.pan
    node = node.connect(p)
  }
  node.connect(o.dest ?? sfxBus)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

// A filtered noise burst (hits, whooshes, hats, claps).
function noise(t, dur, o = {}) {
  if (!claim(o)) return
  const src = ctx.createBufferSource()
  if (!isMusic(o)) src.onended = release
  src.buffer = noiseBuf
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = o.filter ?? 'bandpass'
  f.frequency.setValueAtTime(o.freq ?? 1000, t)
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + (o.sweep ?? dur))
  f.Q.value = o.q ?? 1
  const g = ctx.createGain()
  const peak = o.gain ?? 0.3
  const a = o.attack ?? 0.003
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let node = src.connect(f).connect(g)
  if (o.pan) {
    const p = ctx.createStereoPanner()
    p.pan.value = o.pan
    node = node.connect(p)
  }
  node.connect(o.dest ?? sfxBus)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}

// Big stings duck the music for a moment and silence the small UI chimes they come with.
let quietUntil = 0
let duckUntil = 0
function duck(len = 1.2, depth = 0.35) {
  if (!ctx || mode !== 'on') return
  const t = ctx.currentTime
  const g = duckGain.gain
  // Overlapping stings extend the duck instead of restarting it (no level jumps).
  const until = Math.max(duckUntil, t + len)
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t)
  else {
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
  }
  g.setTargetAtTime(depth, t, 0.025)
  g.setTargetAtTime(1, until, 0.3)
  duckUntil = until
}
function sting(len) {
  quietUntil = ctx.currentTime + 0.6
  duck(len)
}

// --- One-shot effects ---------------------------------------------------------------
export function click() {
  if (!live() || !gate('click', 0.03)) return
  const t = ctx.currentTime
  tone(t, 1300, 0.06, { type: 'triangle', gain: 0.12, slide: 900 })
}
export function jump() {
  if (!live() || !gate('jump', 0.08)) return
  const t = ctx.currentTime
  tone(t, 200, 0.22, { type: 'square', gain: 0.1, slide: 620, slideTime: 0.16, cutoff: 1800 })
  noise(t, 0.18, { freq: 600, freqTo: 2400, gain: 0.08, q: 0.8 })
}
// A take-off off a ramp at speed: a rising whoosh.
export function launch(k = 1) {
  if (!live() || !gate('launch', 0.25)) return
  const t = ctx.currentTime
  noise(t, 0.6, { freq: 400, freqTo: 2800, gain: 0.12 * k, q: 1.2, attack: 0.08 })
}
// impact: 0..8 (player.landed).
export function land(impact) {
  if (!live() || !gate('land', 0.12)) return
  const t = ctx.currentTime
  const k = clamp(impact / 6, 0.3, 1.2)
  tone(t, 140, 0.32, { type: 'sine', gain: 0.5 * k, slide: 38, slideTime: 0.25 })
  noise(t, 0.25, { filter: 'lowpass', freq: 900, freqTo: 200, gain: 0.3 * k })
  // suspension creak
  tone(t + 0.05, 330, 0.18, { type: 'sawtooth', gain: 0.03 * k, slide: 250, cutoff: 1200, vibrato: 18, vibratoDepth: 60 })
}
// Landing after a long jump: a bright "nice!" sparkle on top of the thud.
export function bigAir(seconds) {
  if (!live() || !gate('bigAir', 0.4)) return
  const t = ctx.currentTime
  const notes = seconds > 2 ? [72, 76, 79, 84, 88] : [76, 79, 84]
  notes.forEach((m, i) => tone(t + i * 0.06, mtof(m), 0.35, { type: 'triangle', gain: 0.13 }))
  noise(t, 0.5, { filter: 'highpass', freq: 6000, gain: 0.05 })
}

// Gears: each pickup soon after the last climbs one step up the scale.
const COMBO = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
let combo = 0
let lastGear = 0
export function gear(gold = false) {
  if (!live() || !gate('gear', 0.035)) return
  const t = ctx.currentTime
  combo = t - lastGear < 0.9 ? Math.min(COMBO.length - 1, combo + 1) : 0
  lastGear = t
  const base = 84 + COMBO[combo]
  tone(t, mtof(base), 0.12, { type: 'square', gain: 0.07, cutoff: 5000 })
  tone(t + 0.05, mtof(base + 7), 0.28, { type: 'triangle', gain: 0.14 })
  if (gold) [12, 16, 19, 24].forEach((s, i) => tone(t + 0.1 + i * 0.05, mtof(base + s), 0.3, { type: 'triangle', gain: 0.1 }))
}
export function ring() {
  if (!live() || !gate('ring', 0.3)) return
  const t = ctx.currentTime
  noise(t, 0.7, { freq: 500, freqTo: 4000, gain: 0.16, q: 1.5, attack: 0.02 })
  ;[67, 71, 74, 79, 83, 86].forEach((m, i) => tone(t + i * 0.045, mtof(m), 0.4, { type: 'triangle', gain: 0.12 }))
  sting(0.8)
}
export function boost() {
  if (!live() || !gate('boost', 0.2)) return
  const t = ctx.currentTime
  noise(t, 0.5, { freq: 800, freqTo: 5000, gain: 0.15, q: 2 })
  tone(t, 300, 0.35, { type: 'sawtooth', gain: 0.07, slide: 1200, cutoff: 2500 })
}
export function nitro(on) {
  if (!live()) return
  const t = ctx.currentTime
  if (on) {
    // ignition pop, then a rushing whoosh
    tone(t, 90, 0.25, { type: 'square', gain: 0.18, slide: 45, cutoff: 600 })
    noise(t, 0.9, { filter: 'lowpass', freq: 300, freqTo: 6000, sweep: 0.5, gain: 0.25, attack: 0.03 })
  } else {
    noise(t, 0.6, { filter: 'highpass', freq: 4000, freqTo: 800, gain: 0.08 })
  }
}
export function levelUp(level = 0) {
  if (!live() || !gate('levelUp', 0.4)) return
  const t = ctx.currentTime
  const root = 72 + (level % 5)
  ;[0, 4, 7, 12].forEach((s, i) => {
    tone(t + i * 0.08, mtof(root + s), 0.3, { type: 'square', gain: 0.07, cutoff: 3500 })
    tone(t + i * 0.08, mtof(root + s + 12), 0.3, { type: 'triangle', gain: 0.07 })
  })
  tone(t + 0.34, mtof(root + 12), 0.7, { type: 'triangle', gain: 0.14, vibrato: 6, vibratoDepth: 15 })
  tone(t + 0.34, mtof(root + 16), 0.7, { type: 'triangle', gain: 0.1 })
  noise(t + 0.34, 0.8, { filter: 'highpass', freq: 7000, gain: 0.05 })
  sting(1)
}
// A bigger fanfare: new stage, rebirth, unlocks, the finish.
export function fanfare(big = false) {
  if (!live() || !gate('fanfare', 0.5)) return
  const t = ctx.currentTime
  const seq = [
    [60, 64, 67],
    [62, 65, 69],
    [64, 67, 72],
  ]
  seq.forEach((ch, i) => ch.forEach((m) => tone(t + i * 0.13, mtof(m + 12), 0.2, { type: 'sawtooth', gain: 0.05, cutoff: 3000 })))
  const end = t + 0.39
  ;[60, 64, 67, 72, 76].forEach((m) => tone(end, mtof(m + 12), big ? 1.6 : 1, { type: 'sawtooth', gain: 0.045, cutoff: 2600, cutoffTo: 900, vibrato: 5, vibratoDepth: 10 }))
  tone(end, mtof(48), big ? 1.6 : 1, { type: 'triangle', gain: 0.25 })
  noise(end, big ? 2 : 1.2, { filter: 'highpass', freq: 5000, gain: 0.12 }) // crash
  tone(end, 140, 0.3, { gain: 0.45, slide: 40 }) // kick
  if (big) [84, 88, 91, 96].forEach((m, i) => tone(end + 0.15 + i * 0.07, mtof(m), 0.5, { type: 'triangle', gain: 0.08 }))
  sting(big ? 2.2 : 1.5)
}
// The wins pad: a cash-register "ka-ching" and a coin cascade.
export function win() {
  if (!live() || !gate('win', 0.4)) return
  const t = ctx.currentTime
  noise(t, 0.08, { freq: 3000, gain: 0.2, q: 3 })
  tone(t + 0.06, mtof(88), 0.12, { type: 'square', gain: 0.08, cutoff: 6000 })
  tone(t + 0.12, mtof(95), 0.6, { type: 'square', gain: 0.08, cutoff: 6000 })
  for (let i = 0; i < 8; i++) tone(t + 0.2 + i * 0.05, mtof(91 + ((i * 5) % 12)), 0.15, { type: 'triangle', gain: 0.06, pan: (i % 2 ? 0.4 : -0.4) })
  sting(1.2)
}
// Fell off: a cartoon "wah-wah-waaah".
export function fail() {
  if (!live() || !gate('fail', 0.6)) return
  const t = ctx.currentTime
  ;[67, 66, 65].forEach((m, i) => tone(t + i * 0.22, mtof(m - 12), 0.22, { type: 'sawtooth', gain: 0.07, cutoff: 900, slide: mtof(m - 12.6) }))
  tone(t + 0.66, mtof(52), 0.7, { type: 'sawtooth', gain: 0.08, cutoff: 900, cutoffTo: 300, vibrato: 7, vibratoDepth: 50 })
  sting(1.3)
}
export function deny() {
  if (!live() || !gate('deny', 0.25) || ctx.currentTime < quietUntil) return
  const t = ctx.currentTime
  tone(t, 160, 0.12, { type: 'square', gain: 0.07, cutoff: 900 })
  tone(t + 0.13, 120, 0.18, { type: 'square', gain: 0.07, cutoff: 900 })
}
export function chime() {
  if (!live() || !gate('chime', 0.15) || ctx.currentTime < quietUntil) return
  const t = ctx.currentTime
  tone(t, mtof(84), 0.25, { type: 'triangle', gain: 0.1 })
  tone(t + 0.07, mtof(91), 0.35, { type: 'triangle', gain: 0.1 })
}
export function teleport() {
  if (!live() || !gate('teleport', 0.3)) return
  const t = ctx.currentTime
  tone(t, 220, 0.5, { type: 'sine', gain: 0.18, slide: 1760, vibrato: 30, vibratoDepth: 80 })
  noise(t, 0.5, { freq: 1500, freqTo: 6000, gain: 0.08, q: 4 })
}
// Equipping a truck: a quick double rev.
export function rev() {
  if (!live() || !gate('rev', 0.3)) return
  const t = ctx.currentTime
  for (const [d, f0, f1] of [[0, 55, 140], [0.28, 60, 180]]) {
    tone(t + d, f0, 0.3, { type: 'sawtooth', gain: 0.14, slide: f1, slideTime: 0.15, cutoff: 900, cutoffTo: 400 })
  }
}
// Stage hazards (hub/obstacles.js), for when those hits get wired up.
export function hit() {
  if (!live() || !gate('hit', 0.1)) return
  const t = ctx.currentTime
  noise(t, 0.3, { filter: 'lowpass', freq: 2500, freqTo: 300, gain: 0.35 })
  tone(t, 110, 0.25, { type: 'square', gain: 0.15, slide: 50, cutoff: 800 })
}
export function nearMiss(side = 0) {
  if (!live() || !gate('nearMiss', 0.25)) return
  const t = ctx.currentTime
  noise(t, 0.35, { freq: 2000, freqTo: 600, gain: 0.14, q: 2, pan: side })
  tone(t + 0.05, mtof(88), 0.2, { type: 'triangle', gain: 0.07 })
}
export function bounce() {
  if (!live() || !gate('bounce', 0.15)) return
  const t = ctx.currentTime
  tone(t, 120, 0.45, { type: 'sine', gain: 0.35, slide: 700, slideTime: 0.3, vibrato: 14, vibratoDepth: 60 })
}

// --- Engine, wind, squeal, nitro hiss (continuous loops) -------------------------------
let eng = null
function loopNoise(type, freq, q) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.value = 0
  src.connect(f).connect(g).connect(engineBus)
  src.start()
  return { f, g }
}
function buildLoops() {
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  o1.type = 'sawtooth'
  o2.type = 'square'
  // Chug: amplitude-modulate the engine at its firing rate.
  const chug = ctx.createOscillator()
  chug.type = 'triangle'
  const chugDepth = ctx.createGain()
  chugDepth.gain.value = 0.35
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.Q.value = 3
  const am = ctx.createGain()
  am.gain.value = 0.65
  const g = ctx.createGain()
  g.gain.value = 0
  const sub = ctx.createGain()
  sub.gain.value = 0.6
  o1.connect(f)
  o2.connect(sub).connect(f)
  chug.connect(chugDepth).connect(am.gain)
  f.connect(am).connect(g).connect(engineBus)
  o1.start()
  o2.start()
  chug.start()
  eng = {
    o1, o2, chug, f, g,
    wind: loopNoise('bandpass', 700, 0.6),
    squeal: loopNoise('bandpass', 2400, 9),
    hiss: loopNoise('highpass', 3500, 0.7),
    rpm: 0.2,
    gear: 0,
  }
}

// --- Music ---------------------------------------------------------------------------
// I-V-vi-IV in C, 124 BPM, 16th-note steps. Two 4-bar lead phrases alternate.
const BPM = 124
const STEP = 60 / BPM / 4
const CHORDS = [
  { root: 36, notes: [60, 64, 67] }, // C
  { root: 43, notes: [59, 62, 67] }, // G
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [57, 60, 65] }, // F
]
const _ = null
const LEAD = [
  [
    [76, _, 79, _, 84, 83, 79, _],
    [79, _, 74, _, 71, 74, 79, _],
    [81, _, 76, _, 72, 76, 81, 83],
    [84, _, 81, _, 77, 79, 81, 79],
  ],
  [
    [72, 76, 79, 76, 72, _, 84, _],
    [83, _, 79, _, 74, _, 79, 83],
    [84, 83, 81, _, 76, _, 72, _],
    [77, 79, 81, 84, 86, _, 84, _],
  ],
]
const music = {
  timer: 0,
  next: 0,
  step: 0, // 16th count since start
  layer: 1, // 0 bass only .. 4 everything + arps
  intensity: 0.4,
  target: 0.4,
  transpose: 0,
  wantTranspose: 0,
  nitro: false,
}
function startMusic() {
  if (music.timer) return
  music.next = ctx.currentTime + 0.1
  music.timer = setInterval(schedule, 25)
}
function schedule() {
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  if (music.next < now - 0.2) music.next = now + 0.05 // woke from a suspend: no catch-up burst
  while (music.next < now + 0.12) {
    if (mode === 'on') playStep(music.step, music.next)
    music.next += STEP
    music.step++
  }
}
function drumKick(t, k = 1) {
  tone(t, 150, 0.3, { gain: 0.55 * k, slide: 42, slideTime: 0.12, dest: musicFilter })
}
function playStep(n, t) {
  const s = n % 16
  const bar = Math.floor(n / 16)
  // Layers and the key only change on bar lines so the music stays in time.
  if (s === 0) {
    const i = music.intensity
    music.layer = i < 0.25 ? 1 : i < 0.5 ? 2 : i < 0.78 ? 3 : 4
    if (bar % 4 === 0) music.transpose = music.wantTranspose
  }
  const L = music.layer
  const tr = music.transpose
  const chord = CHORDS[bar % 4]
  const dest = musicFilter
  // Drums
  if (s % 4 === 0) drumKick(t, L >= 2 ? 1 : 0.7)
  if (L >= 2 && (s === 4 || s === 12)) {
    noise(t, 0.16, { freq: 1600, q: 0.8, gain: 0.22, dest })
    tone(t, 220, 0.08, { type: 'triangle', gain: 0.1, slide: 160, dest })
  }
  if (s % 4 === 2 || (L >= 4 && s % 2 === 1)) noise(t, 0.04, { filter: 'highpass', freq: 8000, gain: s % 4 === 2 ? 0.08 : 0.04, dest })
  if (L >= 3 && s === 0 && bar % 8 === 0) noise(t, 1.4, { filter: 'highpass', freq: 5000, gain: 0.08, dest })
  if (L >= 3 && s === 14 && bar % 4 === 3) noise(t, 0.2, { freq: 1600, gain: 0.15, dest }) // fill
  // Bass: octave-bouncing 8ths
  if (s % 2 === 0) {
    const m = chord.root + tr + (s % 4 === 2 ? 12 : 0)
    tone(t, mtof(m), STEP * 1.8, { type: 'sawtooth', gain: 0.16, cutoff: 500 + L * 120, q: 4, dest })
    tone(t, mtof(m - 12), STEP * 1.8, { type: 'sine', gain: 0.16, dest })
  }
  // Chords: a soft pad on the bar at low intensity, off-beat stabs above
  if (L <= 1 && s === 0) for (const m of chord.notes) tone(t, mtof(m + tr), STEP * 15, { type: 'triangle', gain: 0.045, attack: 0.3, dest })
  if (L >= 2 && s % 4 === 2) for (const m of chord.notes) tone(t, mtof(m + tr), STEP * 1.5, { type: 'sawtooth', gain: 0.03, cutoff: 1800, q: 2, dest, detune: (m % 3) * 6 - 6 })
  // Lead
  if (L >= 3 && s % 2 === 0) {
    const phrase = LEAD[Math.floor(bar / 4) % 2][bar % 4]
    const m = phrase[s / 2]
    if (m) {
      tone(t, mtof(m + tr), STEP * 1.9, { type: 'square', gain: 0.05, cutoff: 3200, dest, vibrato: 5, vibratoDepth: 8 })
      tone(t + STEP * 1.5, mtof(m + tr), STEP * 1.5, { type: 'triangle', gain: 0.025, dest, pan: 0.35 }) // echo
    }
  }
  // Nitro / top intensity: sparkling 16th arpeggio
  if (L >= 4 || music.nitro) {
    const notes = chord.notes
    const m = notes[s % 3] + 24 + (s >= 8 ? 12 : 0)
    tone(t, mtof(m + tr), STEP * 0.9, { type: 'triangle', gain: 0.03, dest, pan: s % 2 ? 0.3 : -0.3 })
  }
}

// --- Per frame ---------------------------------------------------------------------------
// s: { speed (signed m/s), top (current top speed), throttle -1..1, grounded, steer -1..1,
//      nitro, onStage, stage (1-based, 0 in the hub), airTime }
export function update(dt, s) {
  if (!ctx || !eng || ctx.state !== 'running') return
  const t = ctx.currentTime
  const spd = Math.abs(s.speed)
  const frac = clamp(spd / Math.max(1, s.top), 0, 1.4)
  // Gears: 4 bands across the top speed; the revs drop on each up-shift.
  const gears = 4
  let rpm
  if (!s.grounded && s.throttle > 0.1) rpm = 0.95 // free-revving in the air
  else if (spd < 1) rpm = 0.12 + Math.max(0, s.throttle) * 0.25
  else {
    const g = Math.min(gears - 1, Math.floor(frac * gears))
    if (g > eng.gear && s.throttle > 0.1) shiftPop()
    eng.gear = g
    rpm = 0.3 + (frac * gears - g) * 0.65 + (g === gears - 1 ? (frac - 1) * 0.6 : 0)
  }
  rpm = clamp(rpm, 0.1, 1.15)
  eng.rpm += (rpm - eng.rpm) * Math.min(1, dt * (rpm > eng.rpm ? 7 : 4))
  const r = eng.rpm
  const hz = 34 + r * 92 + (s.nitro ? 14 : 0)
  eng.o1.frequency.setTargetAtTime(hz, t, 0.03)
  eng.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.03)
  eng.chug.frequency.setTargetAtTime(hz * 0.25, t, 0.03)
  eng.f.frequency.setTargetAtTime(220 + r * 1300 + Math.max(0, s.throttle) * 500 + (s.nitro ? 900 : 0), t, 0.04)
  const load = 0.45 + Math.max(0, s.throttle) * 0.45 + (s.nitro ? 0.2 : 0)
  eng.g.gain.setTargetAtTime(0.32 * load * (s.grounded ? 1 : 0.8), t, 0.05)
  // Wind rises with speed and in the air; squeal on hard turns at speed; hiss under nitro.
  const w = clamp(spd / 45, 0, 1)
  eng.wind.g.gain.setTargetAtTime(w * w * 0.5 + (s.grounded ? 0 : 0.12), t, 0.1)
  eng.wind.f.frequency.setTargetAtTime(500 + w * 1500, t, 0.1)
  const sq = s.grounded && spd > 14 && Math.abs(s.steer) > 0.65 ? (Math.abs(s.steer) - 0.65) * 0.35 : 0
  eng.squeal.g.gain.setTargetAtTime(sq, t, 0.08)
  eng.hiss.g.gain.setTargetAtTime(s.nitro ? 0.09 : 0, t, 0.1)

  // Music follows the action: calmer in the hub, full band on the stages and at speed.
  music.target = clamp((s.onStage ? 0.55 : 0.3) + frac * 0.3 + (s.nitro ? 0.3 : 0), 0, 1)
  const k = music.target > music.intensity ? 0.6 : 0.15 // build up fast, calm down slowly
  music.intensity += (music.target - music.intensity) * Math.min(1, dt * k)
  music.nitro = s.nitro
  // Muffled while airborne or in ring slow-motion, wide open at full intensity.
  const slow = (s.slowmo ?? 1) < 0.9
  musicFilter.frequency.setTargetAtTime(slow ? 700 : s.grounded ? 2400 + music.intensity * 6000 : 1400, t, s.grounded && !slow ? 0.15 : 0.3)
  // Up a key every 5 stages: 0 / +2 / +3 / +5.
  music.wantTranspose = [0, 2, 3, 5][clamp(Math.floor((Math.max(1, s.stage) - 1) / 5), 0, 3)]
}

function shiftPop() {
  if (!live()) return
  const t = ctx.currentTime
  noise(t, 0.09, { filter: 'lowpass', freq: 700, gain: 0.12, dest: engineBus })
}

// --- Hazard sounds in 3D -------------------------------------------------------------------
// Every stage hazard makes its own sound where it is: one-shot events (a hammer
// whooshing past, a crusher slamming, a cannon firing, a bumper ding...) and
// loops for the machines that run all the time (sweeper motors, fans, belts,
// the grinder, saw blades, rolling logs). Each plays through a PannerNode at
// the hazard, heard from the camera (setListener each frame), so it gets
// louder as you drive up to it and moves left / right with it. To keep the
// mix clean: nothing past AUDIO.hearRange is played, at most MAX_EVENTS
// positional one-shots overlap (extras are dropped), each hazard repeats a
// sound no faster than its own gap, and only LOOP_VOICES loops play at once
// (the nearest machines take them).
const listenerAt = { x: 0, y: 0, z: 0 }
export function setListener(x, y, z, fx, fy, fz) {
  listenerAt.x = x
  listenerAt.y = y
  listenerAt.z = z
  if (!ctx) return
  const l = ctx.listener
  if (l.positionX) {
    l.positionX.value = x
    l.positionY.value = y
    l.positionZ.value = z
    l.forwardX.value = fx
    l.forwardY.value = fy
    l.forwardZ.value = fz
    l.upX.value = 0
    l.upY.value = 1
    l.upZ.value = 0
  } else {
    l.setPosition(x, y, z)
    l.setOrientation(fx, fy, fz, 0, 1, 0)
  }
}
const distTo = (x, y, z) => Math.hypot(x - listenerAt.x, y - listenerAt.y, z - listenerAt.z)
function makePanner(x, y, z, ref = 7) {
  const p = ctx.createPanner()
  p.panningModel = 'equalpower' // cheap on phones; HRTF is overkill for this
  p.distanceModel = 'inverse'
  p.refDistance = ref
  p.maxDistance = 400
  p.rolloffFactor = 1.4
  if (p.positionX) {
    p.positionX.value = x
    p.positionY.value = y
    p.positionZ.value = z
  } else p.setPosition(x, y, z)
  p.connect(spatialBus)
  return p
}

const MAX_EVENTS = 10
let events = 0
// Recipes: (t, dest, k = power 0..2).
const HAZARD = {
  // A hammer head sweeping past the bottom of its swing.
  whoosh: (t, d, k) => {
    noise(t, 0.5, { freq: 260, freqTo: 1500, sweep: 0.3, q: 1.4, gain: 0.32 * k, attack: 0.14, dest: d })
    noise(t + 0.18, 0.3, { filter: 'lowpass', freq: 500, gain: 0.12 * k, attack: 0.05, dest: d })
  },
  // A wrecking ball: deep, slow air push.
  heavyWhoosh: (t, d, k) => {
    noise(t, 0.9, { freq: 110, freqTo: 520, sweep: 0.5, q: 1.1, gain: 0.5 * k, attack: 0.3, dest: d })
    tone(t + 0.2, 52, 0.6, { gain: 0.18 * k, slide: 42, dest: d })
  },
  // Rope / hinge creak at the top of a swing, a mallet straining.
  creak: (t, d, k) => tone(t, 150 + Math.random() * 40, 0.45, { type: 'sawtooth', gain: 0.05 * k, cutoff: 900, vibrato: 9, vibratoDepth: 140, attack: 0.06, dest: d }),
  // Crusher about to drop: the block trembling on its chains.
  rattle: (t, d, k) => {
    for (let i = 0; i < 5; i++) noise(t + i * 0.09, 0.07, { filter: 'highpass', freq: 2600 + Math.random() * 1500, gain: 0.1 * k, dest: d })
    tone(t, 46, 0.55, { type: 'square', gain: 0.07 * k, cutoff: 260, vibrato: 22, vibratoDepth: 300, dest: d })
  },
  // A heavy block hitting the floor: sub thump, crunch, metal ring.
  slam: (t, d, k) => {
    tone(t, 92, 0.65, { gain: 0.9 * k, slide: 28, slideTime: 0.45, dest: d })
    noise(t, 0.55, { filter: 'lowpass', freq: 1100, freqTo: 90, gain: 0.6 * k, dest: d })
    noise(t, 0.08, { freq: 3200, q: 1.5, gain: 0.18 * k, dest: d })
    tone(t, 170, 0.4, { type: 'square', gain: 0.07 * k, cutoff: 700, q: 6, dest: d })
  },
  // The giant mallet: a slam plus splintering wood and a long rumble.
  smash: (t, d, k) => {
    HAZARD.slam(t, d, k * 1.2)
    noise(t, 0.14, { freq: 1900, q: 2.2, gain: 0.35 * k, dest: d })
    noise(t + 0.04, 0.1, { freq: 2600, q: 3, gain: 0.2 * k, dest: d })
    noise(t + 0.1, 1.1, { filter: 'lowpass', freq: 380, gain: 0.3 * k, attack: 0.05, dest: d })
  },
  // Metal plate punch (pistons, trapdoors slamming open).
  clang: (t, d, k) => {
    tone(t, 118, 0.22, { gain: 0.45 * k, slide: 52, dest: d })
    noise(t, 0.06, { freq: 2500, q: 1.2, gain: 0.26 * k, dest: d })
    tone(t, 233, 0.35, { type: 'square', gain: 0.08 * k, cutoff: 1800, dest: d })
    tone(t, 671, 0.6, { type: 'triangle', gain: 0.07 * k, dest: d })
    tone(t, 1013, 0.45, { type: 'triangle', gain: 0.04 * k, dest: d })
  },
  // A piston charging (rising whine before the punch).
  charge: (t, d, k) => tone(t, 170, 0.5, { type: 'sawtooth', gain: 0.06 * k, slide: 760, slideTime: 0.48, cutoff: 1600, attack: 0.08, dest: d }),
  // Pneumatic / steam release.
  hiss: (t, d, k) => noise(t, 0.55, { filter: 'highpass', freq: 3200, freqTo: 1400, gain: 0.12 * k, attack: 0.02, dest: d }),
  // Cannon fuse fizzing before the shot.
  fuse: (t, d, k) => {
    for (let i = 0; i < 7; i++) noise(t + i * 0.09, 0.07, { filter: 'highpass', freq: 5500 + Math.random() * 2000, gain: 0.07 * k, dest: d })
  },
  // Cannon shot: a big low boom with a smoky tail.
  boom: (t, d, k) => {
    tone(t, 72, 1.1, { gain: 1.0 * k, slide: 24, slideTime: 0.8, dest: d })
    noise(t, 1.0, { filter: 'lowpass', freq: 1600, freqTo: 70, gain: 0.7 * k, dest: d })
    noise(t, 0.25, { freq: 420, q: 0.8, gain: 0.3 * k, dest: d })
  },
  // A cannonball flying by.
  whistle: (t, d, k) => tone(t, 1500, 0.75, { gain: 0.05 * k, slide: 650, attack: 0.1, dest: d }),
  // Pinball bumper: thwack + bell.
  ding: (t, d, k) => {
    noise(t, 0.05, { freq: 900, q: 1, gain: 0.3 * k, dest: d })
    tone(t, 1046, 0.55, { type: 'triangle', gain: 0.16 * k, dest: d })
    tone(t + 0.02, 1318, 0.5, { type: 'triangle', gain: 0.12 * k, dest: d })
    tone(t + 0.02, 2093, 0.3, { gain: 0.04 * k, dest: d })
  },
  // A saw blade popping up out of its slot.
  shing: (t, d, k) => {
    noise(t, 0.28, { freq: 3800, freqTo: 7500, q: 4, gain: 0.12 * k, dest: d })
    tone(t, 1150, 0.22, { type: 'sawtooth', gain: 0.025 * k, cutoff: 4000, dest: d })
  },
  // Wind cannon blast.
  gust: (t, d, k) => noise(t, 1.2, { freq: 240, freqTo: 950, sweep: 0.6, q: 0.7, gain: 0.45 * k, attack: 0.15, dest: d }),
  // Geyser about to blow: bubbling.
  bubble: (t, d, k) => {
    for (let i = 0; i < 5; i++) {
      const f = 180 + Math.random() * 320
      tone(t + i * 0.11 + Math.random() * 0.04, f, 0.09, { gain: 0.08 * k, slide: f * 1.7, dest: d })
    }
  },
  // Geyser burst: roaring water column.
  geyser: (t, d, k) => {
    noise(t, 1.1, { filter: 'highpass', freq: 700, gain: 0.32 * k, attack: 0.04, dest: d })
    noise(t, 1.2, { filter: 'lowpass', freq: 2600, freqTo: 600, gain: 0.3 * k, attack: 0.03, dest: d })
  },
  // A bridge plank cracking, then falling away.
  crack: (t, d, k) => {
    noise(t, 0.06, { freq: 2300, q: 3, gain: 0.4 * k, dest: d })
    noise(t + 0.07, 0.08, { freq: 1500, q: 3, gain: 0.25 * k, dest: d })
    tone(t, 125, 0.3, { type: 'sawtooth', gain: 0.05 * k, cutoff: 800, vibrato: 11, vibratoDepth: 160, dest: d })
  },
  fall: (t, d, k) => noise(t, 0.6, { filter: 'lowpass', freq: 900, freqTo: 180, gain: 0.16 * k, dest: d }),
  // Trapdoor alarm beeps.
  alarm: (t, d, k) => {
    tone(t, 880, 0.1, { type: 'square', gain: 0.05 * k, cutoff: 3000, dest: d })
    tone(t + 0.14, 660, 0.1, { type: 'square', gain: 0.05 * k, cutoff: 3000, dest: d })
  },
  // A log dropped onto the lane.
  thud: (t, d, k) => {
    tone(t, 64, 0.4, { gain: 0.4 * k, slide: 40, dest: d })
    noise(t, 0.35, { filter: 'lowpass', freq: 420, gain: 0.3 * k, dest: d })
  },
  // --- Weapons ---
  // Laser fence arming: a rising chirp; powering on: a hard electric zing; off: a drop.
  laserArm: (t, d, k) => {
    tone(t, 900, 0.5, { type: 'square', gain: 0.04 * k, slide: 2400, cutoff: 4000, dest: d })
    tone(t + 0.25, 1200, 0.25, { type: 'square', gain: 0.03 * k, slide: 2600, cutoff: 4000, dest: d })
  },
  laserOn: (t, d, k) => {
    tone(t, 2400, 0.35, { type: 'sawtooth', gain: 0.07 * k, slide: 180, slideTime: 0.3, cutoff: 5000, dest: d })
    noise(t, 0.12, { filter: 'highpass', freq: 4000, gain: 0.1 * k, dest: d })
    tone(t, 110, 0.4, { type: 'square', gain: 0.06 * k, cutoff: 600, dest: d })
  },
  laserOff: (t, d, k) => tone(t, 600, 0.25, { type: 'sawtooth', gain: 0.04 * k, slide: 90, cutoff: 2000, dest: d }),
  // Lock-on beep (turrets, mines).
  beep: (t, d, k) => tone(t, 1760, 0.07, { type: 'square', gain: 0.05 * k, cutoff: 5000, dest: d }),
  click: (t, d, k) => noise(t, 0.04, { freq: 3000, q: 4, gain: 0.25 * k, dest: d }),
  // A buried mine popping up / re-arming: clunk and a two-note beep.
  mineArm: (t, d, k) => {
    noise(t, 0.08, { filter: 'lowpass', freq: 900, gain: 0.2 * k, dest: d })
    tone(t + 0.08, 1320, 0.07, { type: 'square', gain: 0.04 * k, cutoff: 4000, dest: d })
    tone(t + 0.18, 1760, 0.07, { type: 'square', gain: 0.04 * k, cutoff: 4000, dest: d })
  },
  // Plasma shot: a laser pew with a punchy body.
  plasma: (t, d, k) => {
    tone(t, 1600, 0.3, { type: 'sawtooth', gain: 0.12 * k, slide: 140, slideTime: 0.25, cutoff: 3500, dest: d })
    tone(t, 220, 0.25, { type: 'square', gain: 0.12 * k, slide: 60, cutoff: 900, dest: d })
    noise(t, 0.1, { filter: 'highpass', freq: 2500, gain: 0.12 * k, dest: d })
  },
  // A bolt bursting / a drone shorting out.
  zapHit: (t, d, k) => {
    noise(t, 0.18, { freq: 3200, q: 1.5, gain: 0.18 * k, dest: d })
    tone(t, 900, 0.15, { type: 'square', gain: 0.05 * k, slide: 200, cutoff: 3000, dest: d })
  },
  // Explosions (mines, missiles, the boulder, stomps): boom, crack, debris patter.
  explode: (t, d, k) => {
    tone(t, 70, 1.3, { gain: 1.0 * k, slide: 22, slideTime: 0.9, dest: d })
    noise(t, 1.4, { filter: 'lowpass', freq: 2200, freqTo: 60, gain: 0.8 * k, dest: d })
    noise(t, 0.06, { freq: 2000, q: 0.7, gain: 0.45 * k, dest: d })
    for (let i = 0; i < 6; i++) noise(t + 0.25 + Math.random() * 0.7, 0.05, { freq: 1400 + Math.random() * 2500, q: 3, gain: 0.08 * k, dest: d })
  },
  // Missile launcher locking on: a fast rising beep pattern.
  lockOn: (t, d, k) => {
    for (let i = 0; i < 5; i++) tone(t + i * 0.14, 1100 + i * 180, 0.08, { type: 'square', gain: 0.05 * k, cutoff: 5000, dest: d })
  },
  // Launch: whoosh + rocket roar.
  missile: (t, d, k) => {
    noise(t, 1.0, { freq: 600, freqTo: 2400, sweep: 0.5, q: 0.7, gain: 0.4 * k, attack: 0.04, dest: d })
    noise(t, 0.8, { filter: 'lowpass', freq: 500, gain: 0.35 * k, dest: d })
    tone(t, 90, 0.6, { type: 'sawtooth', gain: 0.08 * k, slide: 60, cutoff: 400, dest: d })
  },
  // Incoming: a falling whistle.
  incoming: (t, d, k) => tone(t, 2400, 0.8, { gain: 0.09 * k, slide: 500, attack: 0.05, vibrato: 7, vibratoDepth: 25, dest: d }),
  // Flamethrower ignition: whoomp and a roar burst.
  ignite: (t, d, k) => {
    noise(t, 0.4, { filter: 'lowpass', freq: 900, freqTo: 300, gain: 0.6 * k, attack: 0.02, dest: d })
    noise(t, 0.7, { freq: 1500, q: 0.5, gain: 0.25 * k, attack: 0.05, dest: d })
    tone(t, 80, 0.4, { gain: 0.35 * k, slide: 45, dest: d })
  },
  // Tesla coil charging up (rising hum) and the discharge crack.
  teslaCharge: (t, d, k) => {
    tone(t, 60, 0.6, { type: 'sawtooth', gain: 0.07 * k, slide: 240, cutoff: 1500, attack: 0.1, dest: d })
    for (let i = 0; i < 6; i++) noise(t + i * 0.09, 0.03, { filter: 'highpass', freq: 5000, gain: 0.1 * k, dest: d })
  },
  zap: (t, d, k) => {
    noise(t, 0.25, { freq: 4200, q: 0.6, gain: 0.4 * k, dest: d })
    tone(t, 120, 0.3, { type: 'square', gain: 0.15 * k, cutoff: 2500, vibrato: 60, vibratoDepth: 600, dest: d })
  },
  // Spike strip springing up: metal snap and a ringing shing.
  spikes: (t, d, k) => {
    noise(t, 0.05, { freq: 2600, q: 2, gain: 0.35 * k, dest: d })
    noise(t, 0.3, { freq: 6000, q: 5, gain: 0.08 * k, dest: d })
    tone(t, 1900, 0.3, { type: 'triangle', gain: 0.04 * k, dest: d })
  },
  // --- Enemies ---
  // Truck horn: two detuned square waves.
  horn: (t, d, k) => {
    tone(t, 311, 0.8, { type: 'square', gain: 0.09 * k, cutoff: 1800, hold: 0.5, dest: d })
    tone(t, 370, 0.8, { type: 'square', gain: 0.08 * k, cutoff: 1800, hold: 0.5, dest: d })
  },
  rev: (t, d, k) => {
    tone(t, 55, 0.8, { type: 'sawtooth', gain: 0.18 * k, slide: 140, slideTime: 0.6, cutoff: 600, dest: d })
    noise(t, 0.6, { filter: 'lowpass', freq: 400, gain: 0.2 * k, dest: d })
  },
  squeal: (t, d, k) => noise(t, 0.7, { freq: 2600, q: 8, gain: 0.25 * k, attack: 0.03, dest: d }),
  // Electromagnet grabbing: a heavy clunk and a surge.
  magnet: (t, d, k) => {
    tone(t, 60, 0.5, { type: 'square', gain: 0.25 * k, cutoff: 400, dest: d })
    noise(t, 0.08, { freq: 1500, q: 1.2, gain: 0.35 * k, dest: d })
    tone(t, 120, 0.6, { type: 'sawtooth', gain: 0.08 * k, slide: 480, cutoff: 1800, dest: d })
  },
  // Stone breaking up.
  crumble: (t, d, k) => {
    for (let i = 0; i < 8; i++) noise(t + i * 0.06 + Math.random() * 0.05, 0.12, { filter: 'lowpass', freq: 700 + Math.random() * 1200, gain: 0.22 * k, dest: d })
    noise(t, 0.9, { filter: 'lowpass', freq: 300, gain: 0.3 * k, attack: 0.05, dest: d })
  },
  // A giant foot landing.
  stomp: (t, d, k) => {
    tone(t, 48, 1.4, { gain: 1.0 * k, slide: 20, slideTime: 1.0, dest: d })
    noise(t, 0.9, { filter: 'lowpass', freq: 800, freqTo: 60, gain: 0.8 * k, dest: d })
    tone(t, 140, 0.5, { type: 'square', gain: 0.08 * k, cutoff: 500, q: 6, dest: d })
  },
  // Big servo whine (robot legs lifting).
  servo1: (t, d, k) => tone(t, 180, 0.8, { type: 'sawtooth', gain: 0.07 * k, slide: 420, slideTime: 0.6, cutoff: 1400, vibrato: 30, vibratoDepth: 20, dest: d }),
  // One rise-and-fall of a siren.
  siren1: (t, d, k) => tone(t, 600, 0.9, { type: 'sawtooth', gain: 0.06 * k, slide: 1200, slideTime: 0.45, cutoff: 2500, dest: d }),
  // Driving through a hologram.
  glitch: (t, d, k) => {
    for (let i = 0; i < 6; i++) tone(t + i * 0.05, 300 + Math.random() * 2000, 0.05, { type: 'square', gain: 0.05 * k, cutoff: 5000, dest: d })
  },
}
// One positional one-shot (obstacles.js events).
// Small, frequent sounds (a row of hammers whooshing) get the shared slots
// only while there is room and at most every MINOR_GAP s per kind; the big
// ones (slams, booms, smashes) always have a few slots kept back for them.
const MINOR = new Set(['whoosh', 'creak', 'hiss', 'shing', 'charge', 'bubble', 'alarm', 'fuse', 'whistle', 'fall', 'beep', 'click', 'laserArm', 'laserOff', 'mineArm', 'zapHit', 'glitch', 'crack', 'servo1'])
const MINOR_GAP = 0.09
const typeLast = new Map()
export function hazard(type, x, y, z, power = 1) {
  if (!live() || !HAZARD[type]) return
  const d = distTo(x, y, z)
  const minor = MINOR.has(type)
  if (d > (AUDIO.hearRange ?? 80) * (minor ? 0.65 : 1)) return
  const t = ctx.currentTime
  if (minor) {
    if (events >= MAX_EVENTS || t - (typeLast.get(type) ?? -1) < MINOR_GAP) return
    typeLast.set(type, t)
  } else if (events >= MAX_EVENTS + 6) return
  events++
  const p = makePanner(x, y, z)
  HAZARD[type](t, p, Math.min(2, power))
  setTimeout(() => {
    events--
    p.disconnect()
  }, 1300)
}

// Machine loops: LOOP_VOICES voices (noise band + a motor tone, both panned),
// handed each frame to the nearest running machines and retuned to their kind.
const LOOP_VOICES = 6
const LOOPS = {
  motor: { nf: 520, q: 1.3, ng: 0.16, osc: 'sawtooth', hz: 62, cut: 420, og: 0.09 }, // sweeper
  fan: { nf: 330, q: 0.6, ng: 0.34, osc: 'sawtooth', hz: 38, cut: 260, og: 0.05 }, // wind cannon
  belt: { nf: 950, q: 2, ng: 0.07, osc: 'square', hz: 47, cut: 300, og: 0.07 }, // conveyor
  grind: { nf: 1300, q: 3, ng: 0.28, osc: 'sawtooth', hz: 86, cut: 1300, og: 0.14 }, // grinder rollers
  saw: { nf: 5200, q: 5, ng: 0.12, osc: 'sawtooth', hz: 1150, cut: 3200, og: 0.04 }, // saw blades
  rumble: { nf: 200, q: 0.6, ng: 0.42, osc: 'sawtooth', hz: 33, cut: 150, og: 0.1 }, // rolling logs, the boulder
  laser: { nf: 3800, q: 6, ng: 0.03, osc: 'sawtooth', hz: 120, cut: 900, og: 0.05 }, // laser beams humming
  servo: { nf: 1800, q: 3, ng: 0.05, osc: 'sawtooth', hz: 140, cut: 900, og: 0.04 }, // turret slewing
  flame: { nf: 700, q: 0.5, ng: 0.5, osc: 'sawtooth', hz: 48, cut: 220, og: 0.08 }, // flamethrower roar
  tesla: { nf: 4500, q: 1.2, ng: 0.12, osc: 'square', hz: 120, cut: 1600, og: 0.07 }, // tesla buzz
  engine: { nf: 400, q: 1, ng: 0.2, osc: 'sawtooth', hz: 52, cut: 380, og: 0.14 }, // trucks
  magnet: { nf: 240, q: 4, ng: 0.06, osc: 'square', hz: 60, cut: 300, og: 0.1 }, // electromagnet hum
  siren: { nf: 1400, q: 8, ng: 0.02, osc: 'sawtooth', hz: 740, cut: 2400, og: 0.06 }, // the chaser (pitch swings)
  robot: { nf: 160, q: 1.5, ng: 0.25, osc: 'sawtooth', hz: 38, cut: 200, og: 0.12 }, // the boss robot
  drone: { nf: 2400, q: 3, ng: 0.06, osc: 'sawtooth', hz: 210, cut: 1800, og: 0.05 }, // quadcopters
  lava: { nf: 180, q: 0.7, ng: 0.45, osc: 'sine', hz: 40, cut: 120, og: 0.12 }, // lava flood
  creakLoop: { nf: 500, q: 6, ng: 0.06, osc: 'sawtooth', hz: 90, cut: 600, og: 0.04 }, // seesaw timbers
}
const loopVoices = []
function buildLoopVoices() {
  for (let i = 0; i < LOOP_VOICES; i++) {
    const p = makePanner(0, -1000, 0, 6)
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    const ng = ctx.createGain()
    ng.gain.value = 0
    src.connect(f).connect(ng).connect(p)
    src.start(0, Math.random() * 1.5)
    const osc = ctx.createOscillator()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    const og = ctx.createGain()
    og.gain.value = 0
    osc.connect(lp).connect(og).connect(p)
    osc.start()
    loopVoices.push({ p, f, ng, osc, lp, og, kind: null })
  }
}
// list: [{ kind, x, y, z, level 0..1, pitch ~1 }], any order.
const picked = []
export function hazardLoops(list) {
  if (!ctx || !unlocked || ctx.state !== 'running') return
  if (!loopVoices.length) buildLoopVoices()
  const range = (AUDIO.hearRange ?? 80) * 0.7
  picked.length = 0
  for (const e of list) {
    if (!LOOPS[e.kind] || e.level <= 0.01) continue
    e.d = distTo(e.x, e.y, e.z)
    if (e.d < range) picked.push(e)
  }
  picked.sort((a, b) => a.d - b.d)
  const t = ctx.currentTime
  loopVoices.forEach((v, i) => {
    const e = picked[i]
    if (!e) {
      v.ng.gain.setTargetAtTime(0, t, 0.12)
      v.og.gain.setTargetAtTime(0, t, 0.12)
      return
    }
    const L = LOOPS[e.kind]
    const pitch = e.pitch ?? 1
    if (v.p.positionX) {
      v.p.positionX.setTargetAtTime(e.x, t, 0.03)
      v.p.positionY.setTargetAtTime(e.y, t, 0.03)
      v.p.positionZ.setTargetAtTime(e.z, t, 0.03)
    } else v.p.setPosition(e.x, e.y, e.z)
    if (v.kind !== e.kind) {
      v.kind = e.kind
      v.osc.type = L.osc
      v.f.Q.value = L.q
    }
    v.f.frequency.setTargetAtTime(L.nf * pitch, t, 0.06)
    v.osc.frequency.setTargetAtTime(L.hz * pitch, t, 0.06)
    v.lp.frequency.setTargetAtTime(L.cut * pitch, t, 0.06)
    v.ng.gain.setTargetAtTime(L.ng * e.level, t, 0.08)
    v.og.gain.setTargetAtTime(L.og * e.level, t, 0.08)
  })
}

// The truck's own run-ins with the newer hazards.
export function playerHit(kind) {
  if (!live() || !gate('ph:' + kind, 0.25)) return
  const t = ctx.currentTime
  if (kind === 'zap') {
    noise(t, 0.4, { freq: 3800, q: 0.7, gain: 0.35 })
    tone(t, 90, 0.5, { type: 'square', gain: 0.12, cutoff: 2000, vibrato: 45, vibratoDepth: 900 })
  } else if (kind === 'burn') {
    noise(t, 0.6, { filter: 'lowpass', freq: 1200, freqTo: 400, gain: 0.4, attack: 0.02 })
    noise(t + 0.1, 0.8, { filter: 'highpass', freq: 3000, gain: 0.12 })
  } else if (kind === 'flat') {
    noise(t, 0.08, { filter: 'lowpass', freq: 1800, gain: 0.6 })
    noise(t + 0.06, 0.9, { filter: 'highpass', freq: 2500, freqTo: 1200, gain: 0.18, attack: 0.02 })
  } else if (kind === 'grab') {
    tone(t, 70, 0.6, { type: 'square', gain: 0.25, cutoff: 500 })
    tone(t + 0.1, 200, 0.8, { type: 'sawtooth', gain: 0.08, slide: 900, cutoff: 2500 })
  } else if (kind === 'blast') {
    tone(t, 60, 1.4, { gain: 0.9, slide: 22, slideTime: 1 })
    noise(t, 1.2, { filter: 'lowpass', freq: 2500, freqTo: 80, gain: 0.7 })
    sting(1.4)
  } else if (kind === 'melt') {
    noise(t, 1.2, { filter: 'highpass', freq: 1500, freqTo: 600, gain: 0.35, attack: 0.03 })
    tone(t, 140, 1.0, { type: 'sawtooth', gain: 0.1, slide: 40, cutoff: 900 })
    sting(1.2)
  }
}

// The truck itself: torn apart, and hitting the sea.
export function crunch() {
  if (!live() || !gate('crunch', 0.4)) return
  const t = ctx.currentTime
  tone(t, 85, 0.6, { gain: 0.8, slide: 30 })
  noise(t, 0.35, { freq: 1600, q: 0.9, gain: 0.45 })
  noise(t + 0.03, 0.25, { freq: 3400, q: 2.5, gain: 0.25 })
  tone(t, 210, 0.5, { type: 'square', gain: 0.08, cutoff: 1100, q: 5, slide: 160 })
  // bolts and glass tinkling down
  for (let i = 0; i < 6; i++) tone(t + 0.12 + Math.random() * 0.5, 2200 + Math.random() * 2600, 0.12, { type: 'triangle', gain: 0.04, pan: Math.random() - 0.5 })
  sting(1.2)
}
export function splash() {
  if (!live() || !gate('splash', 0.4)) return
  const t = ctx.currentTime
  noise(t, 0.5, { filter: 'lowpass', freq: 3500, freqTo: 500, gain: 0.5, attack: 0.01 })
  noise(t, 0.9, { freq: 900, freqTo: 300, q: 0.7, gain: 0.25, attack: 0.04 })
  tone(t, 120, 0.4, { gain: 0.4, slide: 50 })
  // glugging bubbles
  for (let i = 0; i < 6; i++) {
    const f = 260 + Math.random() * 380
    tone(t + 0.25 + i * 0.09 + Math.random() * 0.04, f, 0.08, { gain: 0.07, slide: f * 1.8 })
  }
}
