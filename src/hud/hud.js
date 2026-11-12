import './hud.css'
import { Vector3 } from 'three'
import { CARS, ECONOMY, NITRO } from '../config.js'
import { buyPack, levelNeed, nitro, on, state, toast, triggerNitro } from '../game.js'
import * as I from './icons.js'

// The game HUD, laid out like the reference: currencies and the four menu
// buttons on the left, Shop/Daily/Exit top right, the 2x offers and nitro
// down the right side, the speed/level panel and speed packs at the bottom,
// Friend Boost bottom right. Plus the world prompt ("E Buy"), floating "+N"
// speed popups, toasts, level-up flash and the nitro speed-lines overlay.
// Everything is sized from one unit (--u = 1 px of a 1920x991 screen).

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.innerHTML = html
  return e
}
const icon = (svg, cls = '') => el('div', `ic ${cls}`, svg)
const fmt = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`
  return String(Math.floor(n))
}
const tapped = (node, fn) =>
  node.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    node.classList.remove('pop')
    void node.offsetWidth
    node.classList.add('pop')
    fn(e)
  })

export function createHud({ teleport, exit, usePrompt }) {
  const root = el('div', 'hud')
  document.body.appendChild(root)

  // --- Left: currencies + menu buttons ---
  const left = el('div', 'hud-left')
  const band = el('div', 'hud-band')
  const wins = el('div', 'stat', `${I.trophy}<span class="o num">0</span>`)
  const gears = el('div', 'stat', `${I.gear()}<span class="o num">0</span>`)
  band.append(wins, gears)
  const grid = el('div', 'menu-grid')
  const menu = [
    ['Rebirth', I.rebirth, () => toast('Rebirth unlocks at 1K Wins!')],
    ['Teleport', I.teleport, () => tpMenu.classList.toggle('open')],
    ['Tuning', I.tuning, () => toast('Tuning coming soon!')],
    ['Cars', I.cars, () => toast('Visit the Car Showroom east of spawn!')],
  ]
  for (const [name, svg, fn] of menu) {
    const b = el('button', 'menu-btn', `${svg}<span class="o lbl">${name}</span>`)
    tapped(b, fn)
    grid.append(b)
  }
  left.append(band, grid)
  const tpMenu = el('div', 'tp-menu')
  for (const [name, where] of [['Spawn', 'spawn'], ['AFK Ramps', 'afk'], ['Car Showroom', 'cars'], ['Stage 1', 'stage'], ['Best Stage', 'best']]) {
    const b = el('button', 'tp-item o', name)
    tapped(b, () => {
      tpMenu.classList.remove('open')
      teleport(where)
    })
    tpMenu.append(b)
  }
  left.append(tpMenu)

  // --- Top right ---
  const tr = el('div', 'hud-topright')
  for (const [name, svg, fn] of [
    ['Shop', I.shop, () => toast('Shop coming soon!')],
    ['Daily', I.daily, () => toast('Come back tomorrow for your daily reward!')],
    ['Exit', I.exit, exit],
  ]) {
    const b = el('button', 'top-btn', `${svg}<span class="o lbl">${name}</span>`)
    tapped(b, fn)
    tr.append(b)
  }

  // --- Right column: offers + nitro ---
  const right = el('div', 'hud-right')
  const offerWins = el('button', 'offer', `<span class="o title">2x Wins</span><div class="rays"></div>${I.trophy}`)
  const offer2 = el('button', 'offer', `<span class="o title">2x Gear</span><div class="rays"></div><div class="swap">${I.gear()}</div>`)
  const only = el('div', 'only', `<span class="o lucky">ONLY</span>${I.gem}<span class="o lucky">3</span>`)
  tapped(offerWins, () => toast('2x Wins — available in the Shop'))
  tapped(offer2, () => toast(`${offer2.querySelector('.title').textContent} — available in the Shop`))
  const nitroBtn = el('button', 'nitro', `${I.nitro}<span class="key">&#8679; SHIFT</span><span class="o time">5.0s</span>`)
  tapped(nitroBtn, () => triggerNitro())
  right.append(offerWins, offer2, only, nitroBtn)
  let swapT = 0
  let swapState = 0

  // --- Bottom: speed info, level bar, packs ---
  const bottom = el('div', 'hud-bottom')
  const info = el('div', 'info')
  const tuningTxt = el('span', 'o tune', '+0% Speed (Tuning)')
  const multiTxt = el('span', 'o multi', 'Speed Multi: 1.00X')
  const leftInfo = el('div', 'info-l')
  leftInfo.append(tuningTxt, multiTxt)
  const speedTxt = el('div', 'speed', `${I.wheel}<span class="o">0 Speed</span>`)
  const winsMulti = el('span', 'o wmulti', 'Wins Multi: 1.00X')
  info.append(leftInfo, speedTxt, winsMulti)
  const bar = el('div', 'level-bar')
  const fill = el('div', 'fill')
  const lvl = el('span', 'o lvl', 'Level 1')
  const xp = el('span', 'o xp', '0 / 0')
  bar.append(fill, lvl, xp)
  const packs = el('div', 'packs')
  ECONOMY.speedPacks.forEach((p, i) => {
    const b = el('button', `pack ${p.cls}`, `<div class="bgwheel">${I.wheel}</div><span class="o">${p.label}</span><span class="price">${I.gem}<span class="o">${p.gems}</span></span>`)
    tapped(b, () => buyPack(i))
    packs.append(b)
  })
  const plusBtn = el('button', 'plus', I.plus)
  tapped(plusBtn, () => toast('More speed packs coming soon!'))
  packs.append(plusBtn)
  bottom.append(info, bar, packs)

  // --- Friend boost ---
  const friend = el('div', 'hud-friend', `${I.friends}<span class="o fb">Friend Boost: +0%</span>`)
  const fplus = el('button', 'fplus', I.plus)
  tapped(fplus, () => toast('Invite friends to boost your speed!'))
  friend.append(fplus)

  // --- Overlays ---
  const popLayer = el('div', 'pop-layer')
  const toasts = el('div', 'toasts')
  const prompt = el('button', 'prompt', `<span class="k">E</span><span class="t"><small></small><b></b></span>`)
  tapped(prompt, () => usePrompt())
  const lines = el('div', 'speedlines')
  const flash = el('div', 'levelup o')
  root.append(lines, left, tr, right, bottom, friend, popLayer, toasts, prompt, flash)

  // --- Events ---
  const v = new Vector3()
  let anchor = null // {x,y,z} world point the "+N" popups spring from
  let camera = null
  on('speed', ({ amount, source }) => {
    if (source === 'pack') return
    const p = el('div', 'popup', `${I.wheel}<span class="o">+${fmt(amount)}</span>`)
    let x = window.innerWidth * (0.55 + Math.random() * 0.25)
    let y = window.innerHeight * (0.35 + Math.random() * 0.3)
    if (anchor && camera) {
      v.set(anchor.x, anchor.y + 3, anchor.z).project(camera)
      if (v.z < 1) {
        x = (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() * 2 - 0.4) * window.innerWidth * 0.12
        y = (-v.y * 0.5 + 0.5) * window.innerHeight - Math.random() * window.innerHeight * 0.15
      }
    }
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    popLayer.append(p)
    setTimeout(() => p.remove(), 1200)
  })
  const bump = (statEl, text) => {
    const b = el('span', 'o bump', text)
    statEl.append(b)
    setTimeout(() => b.remove(), 1100)
  }
  on('gears', (n) => bump(gears, `+${fmt(n)}`))
  on('wins', (n) => {
    bump(wins, `+${fmt(n)}`)
    flash.textContent = `+${fmt(n)} WINS!`
    flash.classList.remove('show')
    void flash.offsetWidth
    flash.classList.add('show')
  })
  on('toast', ({ text, tone }) => {
    const t = el('div', `toast o ${tone}`, text)
    toasts.append(t)
    while (toasts.children.length > 3) toasts.firstChild.remove()
    setTimeout(() => t.classList.add('out'), 2400)
    setTimeout(() => t.remove(), 2900)
  })
  on('levelup', (level) => {
    flash.textContent = `LEVEL ${level}!`
    flash.classList.remove('show')
    void flash.offsetWidth
    flash.classList.add('show')
    bar.classList.remove('pulse')
    void bar.offsetWidth
    bar.classList.add('pulse')
  })

  // --- Per frame (only touches the DOM when a value changed) ---
  const last = {}
  const set = (key, node, value, prop = 'textContent') => {
    if (last[key] === value) return
    last[key] = value
    node[prop] = value
  }
  let promptTarget = null
  return {
    root,
    setPrompt(p) {
      promptTarget = p
      if (!p) {
        prompt.classList.remove('show')
        return
      }
      prompt.classList.add('show')
      set('pt', prompt.querySelector('small'), p.title)
      set('pa', prompt.querySelector('b'), p.action)
    },
    update(dt, cam, focus) {
      camera = cam
      anchor = focus
      set('wins', wins.querySelector('.num'), fmt(state.wins))
      set('gears', gears.querySelector('.num'), fmt(state.gears))
      set('speed', speedTxt.querySelector('span'), `${fmt(state.speed)} Speed`)
      set('lvl', lvl, `Level ${state.level}`)
      const need = levelNeed(state.level)
      set('xp', xp, `${state.xp} / ${need}`)
      set('fill', fill.style, `${Math.min(100, (state.xp / need) * 100).toFixed(1)}%`, 'width')
      set('multi', multiTxt, `Speed Multi: ${state.speedMulti.toFixed(2)}X`)
      set('tune', tuningTxt, `+${state.tuning}% Speed (Tuning)`)
      set('wm', winsMulti, `Wins Multi: ${state.winsMulti.toFixed(2)}X`)
      set('fb', friend.querySelector('.fb'), `Friend Boost: +${state.friendBoost}%`)
      const tm = nitro.active > 0 ? nitro.active : nitro.cooldown > 0 ? nitro.cooldown : NITRO.duration
      set('nt', nitroBtn.querySelector('.time'), `${tm.toFixed(1)}s`)
      nitroBtn.classList.toggle('active', nitro.active > 0)
      nitroBtn.classList.toggle('cooling', nitro.cooldown > 0)
      lines.classList.toggle('on', nitro.active > 0)
      // 2x Gear <-> 2x Speed alternate like the reference.
      swapT += dt
      if (swapT > 4) {
        swapT = 0
        swapState ^= 1
        offer2.querySelector('.title').textContent = swapState ? '2x Speed' : '2x Gear'
        offer2.querySelector('.swap').innerHTML = swapState ? I.wheel : I.gear()
        offer2.classList.remove('flip')
        void offer2.offsetWidth
        offer2.classList.add('flip')
      }
      if (promptTarget && cam) {
        v.set(promptTarget.x, (promptTarget.y ?? 0) + 3.2, promptTarget.z).project(cam)
        const vis = v.z < 1
        prompt.style.visibility = vis ? 'visible' : 'hidden'
        if (vis) prompt.style.transform = `translate(${((v.x * 0.5 + 0.5) * window.innerWidth).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * window.innerHeight).toFixed(0)}px) translate(-50%, -50%)`
      }
    },
  }
}

export const carName = (id) => CARS[id]?.name ?? id
