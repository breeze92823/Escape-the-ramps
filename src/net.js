// Colyseus link to Escape-the-ramps-backend (room "world"): loads and saves a signed-in player's
// progress (game.js snapshot() / hydrate()) and receives the hub's leaderboards. Never throws and
// never blocks play: with no server (or an unreachable one) the game runs solo on its localStorage
// save. Guests (guest- ids) are never stored on the server.
//
// Server -> client: `progress` (the saved doc), `noProgress` (new account / guest / no database:
// keep the local state and push it as the first save), `serverError` (the save could not be read:
// saving stays off), `leaderboard` { boards: { wins|speed|playtime: [{ name, value }] },
// ranks: { stat: n | null } }, `gift` { part, from } / `giftFailed` { part }. Client -> server:
// `saveProgress` (whole snapshot), `identify`, `giftPart` { to: sessionId, part }.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, GAME_SLUG, NET, SERVER_URL } from './config.js'
import { authState, displayName, getPfp, launchRoomId, locateRoom, playerInRoom, playerJoined, sdk, subscribeAuth, updateRoom } from './bloxity.js'
import * as game from './game.js'

export const net = {
  room: null,
  connected: false,
  hydrated: false, // a progress/noProgress answer arrived: saving is allowed
  leaderboard: null, // the last `leaderboard` message (null until one arrives)
}

const listeners = {}
function emit(type, msg) {
  for (const fn of listeners[type] ?? []) {
    try {
      fn(msg)
    } catch (err) {
      console.warn('[net] listener threw', type, err)
    }
  }
}
// fn(msg) on 'leaderboard' (the new lists, or null) or 'connection' (true / false).
export function onNet(type, fn) {
  ;(listeners[type] ??= new Set()).add(fn)
  return () => listeners[type].delete(fn)
}

// Stores and announces a `leaderboard` message (also handy from the console to preview the boards).
export function setLeaderboard(msg) {
  net.leaderboard = msg ?? null
  emit('leaderboard', net.leaderboard)
}

// --- Identity ----------------------------------------------------------------
// Signed-in players use their Bloxity id; everyone else a per-browser guest id (never saved).
// Dev mode (no SDK) gives each browser a signed-in dev id so saving can be tried locally.
function stored(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = stored('escape-the-ramps:guest', () => `guest-${rand()}`)
const DEV = DEV_MODE ? stored('escape-the-ramps:dev', () => `dev-${rand()}`) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: displayName() }
  return { userId: String(id), username: displayName() }
}

// --- Saving ------------------------------------------------------------------
let lastSaved = ''
let sentId = ''
let loadedId = ''
const isGuest = () => sentId.startsWith('guest-')

export function saveNow() {
  if (!net.connected || !net.hydrated || isGuest()) return
  const snap = JSON.stringify(game.snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}

export function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

// --- Gifts -------------------------------------------------------------------
// The other players in this room: [{ id: sessionId, name }].
export function roomPlayers() {
  const out = []
  const room = net.room
  room?.state?.players?.forEach?.((p, id) => {
    if (id !== room.sessionId) out.push({ id, name: p.username || 'Player' })
  })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
// Sends tuning part `part` to session `to` (the server relays it). False when offline.
export function sendGift(to, part) {
  if (!net.connected || !net.room) return false
  send('giftPart', { to, part })
  return true
}

// --- Connection --------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    // A reconnect under the same identity: this tab is newer than the save, push it.
    if (loadedId === sentId || !doc) return saveNow()
    loadedId = sentId
    game.hydrate(doc)
    lastSaved = JSON.stringify(game.snapshot()) // what the server holds: don't echo it back
  })
  room.onMessage('noProgress', () => {
    net.hydrated = true
    loadedId = sentId
    lastSaved = ''
    saveNow()
  })
  room.onMessage('serverError', () => {
    net.hydrated = false // the save exists but could not be read: never overwrite it
    console.warn('[net] server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('leaderboard', setLeaderboard)
  // Gifted tuning parts (backend WorldRoom giftPart): received, or bounced back for a refund.
  room.onMessage('gift', (m) => game.receiveGift(m?.part, m?.from))
  room.onMessage('giftFailed', (m) => game.refundGift(m?.part))
  // Friends' invites land in this room; friends joining show a Boxity toast.
  updateRoom(sentRelay ? `${sentRelay}~${room.roomId}` : room.roomId)
  const seen = new Set()
  const hear = (p, id, late) => {
    if (id === room.sessionId || seen.has(id)) return
    seen.add(id)
    if (p.username) (late ? playerJoined : playerInRoom)(p.username)
  }
  const watch = () => {
    room.state?.players?.forEach((p, id) => hear(p, id, false))
    room.state?.players?.onAdd?.((p, id) => hear(p, id, true))
  }
  room.onStateChange.once?.(watch)
  room.onLeave(() => {
    updateRoom('')
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    emit('connection', false)
    setTimeout(connect, 3000)
  })
  emit('connection', true)
}

const canResolve = () => typeof sdk()?.net?.resolveEndpoint === 'function'
let sentRelay = '' // the matchmaker relay pinning this pod (invites need "<relay>~<room>")
async function serverUrl() {
  if (SERVER_URL) return SERVER_URL
  const { endpoint, roomId } = await sdk().net.resolveEndpoint(GAME_SLUG)
  sentRelay = roomId || ''
  return endpoint
}

let launched = false
async function joinWorld(opts) {
  const client = new Client(await serverUrl())
  return client.joinOrCreate('world', opts)
}

let connecting = false
async function connect() {
  if (!(SERVER_URL || canResolve()) || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const opts = { ...id, pfp: getPfp() }
    // Opened from a friend's invite / the game page's Join button: go to that room if it is still open.
    const launch = launchRoomId()
    const target = launch && !launched ? await locateRoom(launch).catch(() => null) : null
    launched = true
    if (target) {
      try {
        sentRelay = target.relayRoomId || ''
        attach(await new Client(target.endpoint).joinById(target.roomId, opts))
        return
      } catch (err) {
        console.info('[net] the invited room is gone; joining a normal one', err?.message ?? err)
      }
    }
    attach((await joinWorld(opts)))
  } catch (err) {
    console.info('[net] could not reach the server; playing solo', err?.message ?? err)
    setTimeout(connect, NET.retry * 1000)
  } finally {
    connecting = false
  }
}

export function initNet() {
  if (!SERVER_URL && !canResolve()) return console.info('[net] no server configured; playing solo')
  game.onSave(saveNow)
  // The first ready call connects; later ones are sign-in / sign-out.
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username })
    saveNow() // under the old id, before switching
    net.hydrated = false
    sentId = id.userId
    send('identify', { ...id, pfp: getPfp() })
  })
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
}
