import { CARS, ECONOMY, NITRO } from './config.js'

// Player progress and the economy: wins, gears, gems, the Speed stat with its
// level/XP bar, owned and equipped trucks, nitro, AFK and driving gains.
// Saved to localStorage for now (the backend save comes with the net layer).
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
}
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
  if (saved && typeof saved === 'object') Object.assign(state, saved)
} catch {
  // A blocked or corrupt store just starts fresh.
}
let dirty = false
let saveTimer = 0
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Ignore: progress just is not kept.
  }
  dirty = false
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

export function addWins(n) {
  const amount = Math.round(n * state.winsMulti)
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

// --- Nitro ----------------------------------------------------------------------
export const nitro = { active: 0, cooldown: 0 }
export function triggerNitro() {
  if (nitro.active > 0 || nitro.cooldown > 0) return false
  nitro.active = NITRO.duration
  emit('nitro', true)
  return true
}

// --- Purchases -------------------------------------------------------------------
const fmt = (n) => (n >= 1000 ? `${n / 1000}K` : String(n))
export function useCar(id) {
  const car = CARS[id]
  if (!car) return
  if (state.owned.includes(id)) {
    if (state.car === id) return toast(`${car.name} is already equipped`)
    state.car = id
    dirty = true
    emit('car', id)
    return toast(`Equipped ${car.name}! (+${car.bonus} Speed)`, 'good')
  }
  if (car.gems) {
    if (state.gems < car.gems) return toast(`You need ${car.gems} gems for ${car.name}`, 'bad')
    state.gems -= car.gems
  } else if (state.wins < car.wins) {
    return toast(`${car.name} needs ${fmt(car.wins)} wins`, 'bad')
  }
  state.owned.push(id)
  state.car = id
  dirty = true
  emit('owned', id)
  emit('car', id)
  toast(`Unlocked ${car.name}! (+${car.bonus} Speed)`, 'good')
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
export function claimChest() {
  const today = new Date().toISOString().slice(0, 10)
  if (state.chestDay === today) return toast('Group reward already claimed today')
  state.chestDay = today
  state.gears += 25
  dirty = true
  emit('gears', 25)
  toast('Group Rewards: +25 Gears!', 'good')
}

// --- Per frame -------------------------------------------------------------------
let driveTimer = 0
let afkTimer = 0
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
  saveTimer += dt
  if (dirty && saveTimer > 3) {
    saveTimer = 0
    save()
  }
}
window.addEventListener('beforeunload', () => dirty && save())
