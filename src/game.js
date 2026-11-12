import { submitScore } from './bloxity.js'
import { BALLOONS, CARS, DAILY, ECONOMY, MEDALS, NITRO, REBIRTH, TELEPORT, TUNING, VIP, WINGS } from './config.js'

// Player progress and the economy: wins, gears, gems, the Speed stat with its
// level/XP bar, owned and equipped trucks, nitro, AFK and driving gains.
// Saved to localStorage (the guest / offline copy) and, for signed-in players, to the game
// server (net.js sends snapshot() after every save and loads it back through hydrate()).
const KEY = 'escape-the-ramps:save:v1'

export const state = {
  ...ECONOMY.start,
  owned: ['tiger'],
  car: 'tiger',
  magnet: false,
  chestDay: '',
  speedMulti: 1,
  winsMulti: 1,
  tuning: 0,
  friendBoost: 0,
  bestStage: 0,
  rebirths: 0,
  parts: {}, // tuning part id -> owned count (equipped ones included)
  equipped: {}, // tuning part id -> equipped count
  tuneSlots: TUNING.slots,
  tuneShop: { period: -1, sold: {} }, // stock bought this restock period, by rarity id
  daily: { next: 0, last: '' }, // next streak day to claim (0..6), local date of the last claim
  winsBoostUntil: 0, // Date.now() ms: 2x wins until then
  nitroBank: 0, // s added to the next nitro
  runs: {}, // stage k -> { best: s (0 = none), medal: 0..3, falls, clears }
  playtime: 0, // s with the tab visible (the Playtime leaderboard)
  vip: false, // VIP pass: the magenta 2x WINS pads pay out
  balloonsUntil: 0, // Date.now() ms: Balloons (low gravity) until then
  wingsUntil: 0, // Date.now() ms: Wings (glide) until then
}
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
  if (saved && typeof saved === 'object') Object.assign(state, saved)
} catch {
  // A blocked or corrupt store just starts fresh.
}
state.speedMulti = REBIRTH.multi(state.rebirths)
let dirty = false
let saveTimer = 0
const saveListeners = new Set()
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Ignore: progress just is not kept.
  }
  dirty = false
  for (const fn of saveListeners) fn()
  postScores()
}

// Bloxity leaderboards (bloxity.js LEADERBOARDS): the current totals, sent at most every 30 s and
// only when something changed (the portal keeps the best/latest per board).
let scoresAt = 0
let scoresSent = ''
function postScores() {
  const now = Date.now()
  if (now - scoresAt < 30000) return
  const s = { wins: Math.floor(state.wins), speed: Math.floor(state.speed), stage: state.bestStage, rebirths: state.rebirths }
  const key = JSON.stringify(s)
  if (key === scoresSent) return
  scoresAt = now
  scoresSent = key
  for (const [id, v] of Object.entries(s)) if (v > 0) submitScore(id, v)
}
// fn() after every local save (net.js pushes the snapshot to the server then).
export const onSave = (fn) => saveListeners.add(fn)

// What the server stores (backend sanitize.ts sanitizeProgress): the state minus what is derived
// (speedMulti, winsMulti, tuning, friendBoost) or session-only.
export const SAVED_KEYS = ['wins', 'gears', 'gems', 'speed', 'level', 'xp', 'rebirths', 'bestStage', 'owned', 'car', 'magnet', 'chestDay', 'parts', 'equipped', 'tuneSlots', 'tuneShop', 'daily', 'winsBoostUntil', 'nitroBank', 'runs', 'playtime', 'vip', 'balloonsUntil', 'wingsUntil']
export function snapshot() {
  const out = {}
  for (const k of SAVED_KEYS) out[k] = state[k]
  out.playtime = Math.floor(state.playtime)
  return JSON.parse(JSON.stringify(out))
}
// A save loaded from the server over the local state (only the keys it carries).
export function hydrate(doc) {
  for (const k of SAVED_KEYS) if (doc[k] !== undefined) state[k] = doc[k]
  if (!state.owned.includes(state.car)) state.car = state.owned[0] ?? 'tiger'
  state.speedMulti = REBIRTH.multi(state.rebirths)
  state.tuning = Object.entries(state.equipped).reduce((a, [id, n]) => a + (TUNING.parts[id] ? partPct(id) * n : 0), 0)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Ignore.
  }
  emit('hydrate')
}

const listeners = new Map()
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(fn)
}
function emit(event, data) {
  for (const fn of listeners.get(event) ?? []) fn(data)
}
export const toast = (text, tone = 'info') => emit('toast', { text, tone })

export const levelNeed = (level) => ECONOMY.levelBase + ECONOMY.levelStep * level

export function addSpeed(amount, source = 'drive') {
  state.speed += amount
  state.xp += amount
  while (state.xp >= levelNeed(state.level)) {
    state.xp -= levelNeed(state.level)
    state.level++
    emit('levelup', state.level)
  }
  emit('speed', { amount, source })
  dirty = true
}

// Rewarded ad: 2x Wins for `min` minutes (hud.js "Free 2x" button, after a completed ad).
export function grantWinsBoost(min) {
  state.winsBoostUntil = Math.max(Date.now(), state.winsBoostUntil) + min * 60000
  dirty = true
  toast(`2x Wins for ${min} minutes!`, 'good')
}
export const winsBoostLeft = () => Math.max(0, state.winsBoostUntil - Date.now()) / 1000
export const winsMultiNow = () => state.winsMulti * (winsBoostLeft() > 0 ? 2 : 1)
export function addWins(n) {
  const amount = Math.round(n * winsMultiNow())
  state.wins += amount
  dirty = true
  emit('wins', amount)
  return amount
}
export function addGears(n) {
  state.gears += n
  dirty = true
  emit('gears', n)
}
export function reachStage(k) {
  if (k <= state.bestStage) return false
  state.bestStage = k
  dirty = true
  return true
}
export function skipStage(k, cost) {
  if (state.gems < cost) {
    toast(`Skipping Stage ${k} costs ${cost} gems`, 'bad')
    return false
  }
  state.gems -= cost
  dirty = true
  toast(`Skipped Stage ${k}!`, 'good')
  return true
}

// --- Stage runs (runs.js): best times, medals, falls ------------------------------
export const stageRun = (k) => (state.runs[k] ??= { best: 0, medal: 0, falls: 0, clears: 0 })
export function addFall(k) {
  stageRun(k).falls++
  dirty = true
}
// A cleared stage in `time` s earning medal `tier` (0 = none, 1..3). Medals pay once,
// the first time each tier is reached. Returns what changed for the HUD.
export function finishRun(k, time, tier) {
  const r = stageRun(k)
  const pb = !r.best || time < r.best
  if (pb) r.best = Math.round(time * 100) / 100
  r.clears++
  let gears = 0
  let gems = 0
  const old = r.medal
  for (let t = old + 1; t <= tier; t++) {
    gears += MEDALS.tiers[t - 1].gears * k
    gems += MEDALS.tiers[t - 1].gems ?? 0
  }
  if (tier > old) r.medal = tier
  if (gears) addGears(gears)
  if (gems) state.gems += gems
  dirty = true
  return { pb, first: r.clears === 1, medal: tier, newMedal: tier > old, gears, gems }
}

// --- Nitro ----------------------------------------------------------------------
export const nitro = { active: 0, cooldown: 0 }
export function triggerNitro() {
  if (nitro.active > 0 || nitro.cooldown > 0) return false
  nitro.active = NITRO.duration + state.nitroBank
  if (state.nitroBank) {
    state.nitroBank = 0
    dirty = true
  }
  emit('nitro', true)
  return true
}

// --- Purchases -------------------------------------------------------------------
const fmt = (n) => (n >= 1000 ? `${n / 1000}K` : String(n))
export function useCar(id) {
  const car = CARS[id]
  if (!car) return false
  if (state.owned.includes(id)) {
    if (state.car === id) return toast(`${car.name} is already equipped`)
    state.car = id
    dirty = true
    emit('car', id)
    toast(`Equipped ${car.name}! (+${car.bonus} Speed)`, 'good')
    return true
  }
  if (car.daily) return toast(`${car.name} is the Day 7 Daily Reward`, 'bad')
  if (state.wins < car.wins) {
    return toast(`${car.name} needs ${fmt(car.wins)} wins`, 'bad')
  }
  state.owned.push(id)
  state.car = id
  dirty = true
  emit('owned', id)
  emit('car', id)
  toast(`Unlocked ${car.name}! (+${car.bonus} Speed)`, 'good')
  return true
}
export function buyPack(i) {
  const p = ECONOMY.speedPacks[i]
  if (state.gems < p.gems) return toast(`You need ${p.gems} gems for ${p.label}`, 'bad')
  state.gems -= p.gems
  addSpeed(p.amount, 'pack')
  toast(`+${p.label}!`, 'good')
}
export function buyMagnet() {
  if (state.magnet) return toast('Gear Magnet already owned')
  if (state.gems < 49) return toast('You need 49 gems for the Gear Magnet', 'bad')
  state.gems -= 49
  state.magnet = true
  dirty = true
  toast('Gear Magnet unlocked!', 'good')
}
// --- Hub power-ups: VIP pass (wins), Balloons (wins, timed), Wings (wins, timed) -----
// Wins prices are spent (the Wins total drops), unlike trucks which only need them held.
function spendWins(n, what) {
  if (state.wins < n) return toast(`${what} costs ${fmt(n)} wins`, 'bad'), false
  state.wins -= n
  dirty = true
  emit('wins', -n)
  return true
}
const mins = (until) => Math.max(0, until - Date.now()) / 1000
export const balloonsLeft = () => mins(state.balloonsUntil)
export const wingsLeft = () => mins(state.wingsUntil)
export function buyVip() {
  if (state.vip) return toast('You already have the VIP pass'), false
  if (!spendWins(VIP.wins, 'The VIP pass')) return false
  state.vip = true
  emit('powerups')
  toast('VIP pass unlocked! The pink pads pay 2x wins', 'good')
  return true
}
export function buyBalloons() {
  if (!spendWins(BALLOONS.wins, 'Balloons')) return false
  state.balloonsUntil = Math.max(Date.now(), state.balloonsUntil) + BALLOONS.minutes * 60000
  dirty = true
  emit('powerups')
  toast(`Balloons for ${BALLOONS.minutes} minutes! Jumps float`, 'good')
  return true
}
export function buyWings() {
  if (!spendWins(WINGS.wins, 'Wings')) return false
  state.wingsUntil = Math.max(Date.now(), state.wingsUntil) + WINGS.minutes * 60000
  emit('powerups')
  toast(`Wings for ${WINGS.minutes} minutes! Hold HOP in the air to glide`, 'good')
  return true
}

export function claimChest() {
  const today = new Date().toISOString().slice(0, 10)
  if (state.chestDay === today) return toast('Group reward already claimed today')
  state.chestDay = today
  state.gears += 25
  dirty = true
  emit('gears', 25)
  toast('Group Rewards: +25 Gears!', 'good')
}

// --- Tuning ----------------------------------------------------------------------
export const tuneRarity = (id) => TUNING.rarities.find((r) => r.id === id)
export const partPct = (id) => tuneRarity(TUNING.parts[id].rarity).pct
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0)
export const equippedCount = () => total(state.equipped)
function retune() {
  state.tuning = Object.entries(state.equipped).reduce((a, [id, n]) => a + partPct(id) * n, 0)
  dirty = true
  emit('tuning')
}
const seeded = (a) => () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
// The shop's stock: one part per rarity, picked from the wall-clock period so it is
// the same for everyone and changes every TUNING.restockEvery seconds.
export const shopPeriod = () => Math.floor(Date.now() / 1000 / TUNING.restockEvery)
export const shopRestockIn = () => TUNING.restockEvery - ((Date.now() / 1000) % TUNING.restockEvery)
export function shopStock() {
  const period = shopPeriod()
  if (state.tuneShop.period !== period) {
    const had = state.tuneShop.period >= 0
    state.tuneShop = { period, sold: {} }
    dirty = true
    if (had) emit('restock')
  }
  const rnd = seeded(period * 7919)
  return TUNING.rarities.map((r) => {
    const pool = Object.keys(TUNING.parts).filter((id) => TUNING.parts[id].rarity === r.id)
    const part = pool[Math.floor(rnd() * pool.length)]
    return { ...r, part, left: Math.max(0, r.stock - (state.tuneShop.sold[r.id] ?? 0)) }
  })
}
function givePart(id) {
  state.parts[id] = (state.parts[id] ?? 0) + 1
  if (equippedCount() < state.tuneSlots) state.equipped[id] = (state.equipped[id] ?? 0) + 1 // a free slot: equip it
  retune()
}
export function buyPart(rarityId, withGems = false) {
  const item = shopStock().find((s) => s.id === rarityId)
  if (!item) return false
  const name = TUNING.parts[item.part].name
  if (withGems) {
    if (state.gems < item.gems) return toast(`You need ${item.gems} gems for ${name}`, 'bad'), false
    state.gems -= item.gems
  } else {
    if (item.left <= 0) return toast(`${name} is sold out! New items soon`, 'bad'), false
    if (state.gears < item.gears) return toast(`You need ${item.gears} gears for ${name}`, 'bad'), false
    state.gears -= item.gears
    state.tuneShop.sold[rarityId] = (state.tuneShop.sold[rarityId] ?? 0) + 1
  }
  givePart(item.part)
  toast(`Bought ${name}! (+${item.pct}% Speed)`, 'good')
  return true
}
// Gifting (net.js relays it to a player on the same server): the sender pays the
// rarity's gem price; the shop's gears stock is untouched. send(part) returns false
// when there is no connection, and nothing is charged then.
export function giftPart(rarityId, send) {
  const item = shopStock().find((s) => s.id === rarityId)
  if (!item) return false
  const name = TUNING.parts[item.part].name
  if (state.gems < item.gems) return toast(`Gifting ${name} costs ${item.gems} gems`, 'bad'), false
  if (!send(item.part)) return toast('Could not reach the server. Try again', 'bad'), false
  state.gems -= item.gems
  dirty = true
  return item
}
// A gift that could not be delivered (the player left): give the gems back.
export function refundGift(partId) {
  const r = TUNING.parts[partId] && tuneRarity(TUNING.parts[partId].rarity)
  if (!r) return
  state.gems += r.gems
  dirty = true
  toast(`Gift not delivered: +${r.gems} gems refunded`)
}
export function receiveGift(partId, from) {
  const p = TUNING.parts[partId]
  if (!p) return
  givePart(partId)
  toast(`${from || 'A player'} sent you ${p.name}! (+${partPct(partId)}% Speed)`, 'good')
}
export function restockShop() {
  if (state.gems < TUNING.restockGems) return toast(`Restocking costs ${TUNING.restockGems} gems`, 'bad'), false
  state.gems -= TUNING.restockGems
  state.tuneShop.sold = {}
  dirty = true
  toast('TUNING SHOP RESTOCKED!', 'good')
  emit('tuning')
  return true
}
export function equipPart(id) {
  const free = (state.parts[id] ?? 0) - (state.equipped[id] ?? 0)
  if (free <= 0) return false
  if (equippedCount() >= state.tuneSlots) return toast(`All ${state.tuneSlots} slots are full`, 'bad'), false
  state.equipped[id] = (state.equipped[id] ?? 0) + 1
  retune()
  return true
}
export function unequipPart(id) {
  if (!state.equipped[id]) return false
  if (--state.equipped[id] === 0) delete state.equipped[id]
  retune()
  return true
}
export function equipBest() {
  state.equipped = {}
  const all = []
  for (const [id, n] of Object.entries(state.parts)) for (let i = 0; i < n; i++) all.push(id)
  all.sort((a, b) => partPct(b) - partPct(a))
  for (const id of all.slice(0, state.tuneSlots)) state.equipped[id] = (state.equipped[id] ?? 0) + 1
  retune()
}
export function unequipAll() {
  state.equipped = {}
  retune()
}
export function buySlot() {
  if (state.tuneSlots >= TUNING.maxSlots) return toast(`Max ${TUNING.maxSlots} slots`), false
  if (state.gems < TUNING.slotGems) return toast(`An extra slot costs ${TUNING.slotGems} gems`, 'bad'), false
  state.gems -= TUNING.slotGems
  state.tuneSlots++
  dirty = true
  emit('tuning')
  toast(`+1 Tuning slot! (${state.tuneSlots})`, 'good')
  return true
}

// --- Rebirth ------------------------------------------------------------------------
function applyRebirth() {
  state.rebirths++
  state.speedMulti = REBIRTH.multi(state.rebirths)
  dirty = true
  emit('rebirth', state.rebirths)
  toast(`Rebirth ${state.rebirths}! ${state.speedMulti}x Speed`, 'good')
}
export function rebirth() {
  const need = REBIRTH.levelReq(state.rebirths)
  if (state.level < need) return toast(`Reach Level ${need} to Rebirth`, 'bad'), false
  state.level = ECONOMY.start.level
  state.xp = 0
  state.speed = ECONOMY.start.speed
  applyRebirth()
  return true
}
export function skipRebirth() {
  const cost = REBIRTH.skipGems(state.rebirths)
  if (state.gems < cost) return toast(`Skip Rebirth costs ${cost} gems`, 'bad'), false
  state.gems -= cost
  applyRebirth()
  return true
}

// --- Teleport ------------------------------------------------------------------------
// Stage k (1-based) is free once reached or once you hold its wins requirement.
export const stageOpen = (k) => k <= 1 || state.bestStage >= k || state.wins >= TELEPORT.wins[k - 1]
export function payStageTeleport(k) {
  const cost = TELEPORT.wins[k - 1] || 0
  if (state.wins < cost) return toast(`Teleporting to Stage ${k} costs ${cost} wins`, 'bad'), false
  state.wins -= cost
  dirty = true
  emit('wins', -cost)
  return true
}

// --- Daily rewards ------------------------------------------------------------------
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
const yesterday = () => dayKey(new Date(Date.now() - 864e5))
// The streak day (0..6) up next; a missed day starts over at Day 1.
export function dailyDay() {
  const { next, last } = state.daily
  if (last && last !== dayKey() && last !== yesterday()) return 0
  return next % DAILY.length
}
export const dailyReady = () => state.daily.last !== dayKey()
export function dailyNextIn() {
  const d = new Date()
  d.setHours(24, 0, 0, 0)
  return Math.max(0, (d - Date.now()) / 1000)
}
export function claimDaily() {
  if (!dailyReady()) return toast('Come back tomorrow for the next reward!'), false
  const day = dailyDay()
  const r = DAILY[day]
  if (r.gears) addGears(r.gears)
  if (r.wins) {
    state.wins += r.wins
    emit('wins', r.wins)
  }
  if (r.nitro) state.nitroBank += r.nitro
  if (r.boost) state.winsBoostUntil = Math.max(Date.now(), state.winsBoostUntil) + r.boost * 60000
  if (r.car && !state.owned.includes(r.car)) {
    state.owned.push(r.car)
    emit('owned', r.car)
  }
  state.daily = { next: (day + 1) % DAILY.length, last: dayKey() }
  dirty = true
  emit('daily', day)
  toast(`Day ${day + 1} reward: ${r.label.replace(/<br>/g, ' ')}!`, 'good')
  return true
}

// --- Per frame -------------------------------------------------------------------
let driveTimer = 0
let afkTimer = 0
let lastPlayMark = 0
// moving: |speed| in m/s; afk: the AFK ramp multiplier the truck is on (0 = none).
export function update(dt, { moving, afk }) {
  if (nitro.active > 0) {
    nitro.active = Math.max(0, nitro.active - dt)
    if (nitro.active === 0) {
      nitro.cooldown = NITRO.cooldown
      emit('nitro', false)
    }
  } else if (nitro.cooldown > 0) nitro.cooldown = Math.max(0, nitro.cooldown - dt)

  const bonus = CARS[state.car]?.bonus ?? 1
  const per = Math.max(1, Math.round(bonus * state.speedMulti * (1 + state.tuning / 100) * (1 + state.friendBoost / 100)))
  if (afk > 0) {
    afkTimer += dt
    if (afkTimer >= ECONOMY.afkTick) {
      afkTimer = 0
      addSpeed(Math.max(1, Math.round(afk * state.speedMulti * (1 + state.tuning / 100))), 'afk')
    }
  } else afkTimer = 0
  if (moving > ECONOMY.driveMinSpeed && afk === 0) {
    driveTimer += dt * (nitro.active > 0 ? 2 : 1)
    if (driveTimer >= ECONOMY.driveTick) {
      driveTimer = 0
      addSpeed(per, 'drive')
    }
  }
  if (!document.hidden) {
    state.playtime += dt
    if (Math.floor(state.playtime) % 60 === 0 && Math.floor(state.playtime) !== lastPlayMark) {
      lastPlayMark = Math.floor(state.playtime)
      dirty = true // playtime alone is saved once a minute
    }
  }
  saveTimer += dt
  if (dirty && saveTimer > 3) {
    saveTimer = 0
    save()
  }
}
window.addEventListener('beforeunload', () => dirty && save())
