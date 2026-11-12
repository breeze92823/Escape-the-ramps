import './hud.css'
import { Vector3 } from 'three'
import { CARS, COARSE_POINTER, MEDALS, NITRO, REBIRTH } from '../config.js'
import { dailyReady, levelNeed, nitro, on, state, toast, triggerNitro, winsMultiNow } from '../game.js'
import * as I from './icons.js'
import { createWindows } from './windows.js'
import * as audio from '../audio.js'
import { inviteLink, openLeaderboard, rewardedAdsAvailable, watchRewardedAd } from '../bloxity.js'
import { roomInfo } from '../net.js'
import { INVITE } from '../config.js'
import { balloonsLeft, grantWinsBoost, wingsLeft } from '../game.js'

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
    audio.click()
    fn(e)
  })

export function createHud({ teleport, teleportStage, exit, usePrompt }) {
  const root = el('div', 'hud')
  document.body.appendChild(root)
  let windows = null // created last so the windows sit above the rest of the HUD

  // --- Left: currencies + menu buttons ---
  const left = el('div', 'hud-left')
  const band = el('div', 'hud-band')
  const wins = el('div', 'stat', `${I.trophy}<span class="o num">0</span>`)
  const gears = el('div', 'stat', `${I.gear()}<span class="o num">0</span>`)
  band.append(wins, gears)
  const grid = el('div', 'menu-grid')
  const menu = [
    ['Rebirth', I.rebirth, 'rebirth'],
    ['Teleport', I.teleport, 'teleport'],
    ['Tuning', I.tuning, 'tuning'],
    ['Cars', I.cars, 'cars'],
  ]
  const badges = {}
  for (const [name, svg, win] of menu) {
    const b = el('button', 'menu-btn', `${svg}<span class="o lbl">${name}</span><span class="badge o">!</span>`)
    badges[win] = b.querySelector('.badge')
    tapped(b, () => windows.toggle(win))
    grid.append(b)
  }
  left.append(band, grid)

  let adT = 0
  // --- Top right ---
  const tr = el('div', 'hud-topright')
  // Sound: On -> Music off -> Muted (also the M key).
  const SOUND_LABEL = { on: 'Sound', sfx: 'No Music', off: 'Muted' }
  const soundBtn = el('button', 'top-btn sound-btn')
  const paintSound = (m) => (soundBtn.innerHTML = `${I.sound(m)}<span class="o lbl">${SOUND_LABEL[m]}</span>`)
  paintSound(audio.getMode())
  audio.onMode((m) => {
    paintSound(m)
    toast(m === 'on' ? 'Sound + music on' : m === 'sfx' ? 'Music off (sound effects on)' : 'All sound muted')
  })
  tapped(soundBtn, () => audio.cycleMode())
  tr.append(soundBtn)
  // Rewarded ad (Bloxity): a free 5 min 2x Wins, only offered while an ad is available.
  const adBtn = el('button', 'top-btn', `${I.trophy}<span class="o lbl">Free 2x</span>`)
  adBtn.hidden = true
  let adBusy = false
  tapped(adBtn, async () => {
    if (adBusy) return
    adBusy = true
    if (await watchRewardedAd('double-wins')) grantWinsBoost(5)
    adBusy = false
  })
  tr.append(adBtn)
  for (const [name, svg, fn] of [
    ['Daily', I.daily, () => windows.toggle('daily')],
    ['Exit', I.exit, exit],
  ]) {
    const b = el('button', 'top-btn', `${svg}<span class="o lbl">${name}</span>${name === 'Daily' ? '<span class="badge o">!</span>' : ''}`)
    if (name === 'Daily') badges.daily = b.querySelector('.badge')
    tapped(b, fn)
    tr.append(b)
  }

  // --- Right column: offers + nitro ---
  const right = el('div', 'hud-right')
  // Timed power-ups (Balloons, Wings): one chip each with the time left.
  const powers = el('div', 'powerups')
  const chipOf = (svg, cls) => el('div', `pw-chip ${cls}`, `${svg}<span class="o pw-t"></span>`)
  const balloonChip = chipOf(I.balloon, 'balloons')
  const wingsChip = chipOf(I.wing, 'wings')
  powers.append(balloonChip, wingsChip)
  right.append(powers)
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const nitroBtn = el('button', 'nitro', `${I.nitro}<span class="key">&#8679; SHIFT</span><span class="o time">5.0s</span>`)
  tapped(nitroBtn, () => triggerNitro())
  right.append(nitroBtn)

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
  bottom.append(info, bar)

  // --- Friend boost ---
  const friend = el('div', 'hud-friend', `${I.friends}<span class="o fb">Friend Boost: +0%</span>`)
  const fplus = el('button', 'fplus', I.plus)
  friend.append(fplus)

  // --- Room show: who is in this room, the invite link, and the Boxity leaderboards ---
  const roomPanel = el('div', 'room-panel')
  roomPanel.hidden = true
  const renderRoom = () => {
    const info = roomInfo()
    const rows = info
      ? info.players.map((p) => `<li class="${p.me ? 'me' : ''}"><span class="o"></span></li>`).join('')
      : ''
    roomPanel.innerHTML = `<div class="rp-head o">Room${info ? ` · ${info.players.length} player${info.players.length === 1 ? '' : 's'}` : ''}</div>
      <ul class="rp-list">${rows || '<li class="o">Offline: playing solo</li>'}</ul>
      <div class="rp-note o">Friends who join you: you get +${INVITE.host.boostMin} min 2x Wins and ${INVITE.host.gems} gems. They get ${INVITE.join.label}. Each player in the room: +${INVITE.perFriend}% Speed.</div>
      <div class="rp-btns"><button class="rp-copy">Copy invite link</button><button class="rp-lb">Leaderboards</button></div>`
    if (info) roomPanel.querySelectorAll('.rp-list li .o').forEach((n, i) => (n.textContent = info.players[i].name + (info.players[i].me ? ' (you)' : '')))
    roomPanel.querySelector('.rp-copy').onclick = () => {
      const link = info && inviteLink(info.code2)
      if (!link) return toast('Use the Invite button in the Boxity toolbar to invite friends!')
      navigator.clipboard?.writeText(link).then(() => toast('Invite link copied!', 'good'), () => toast(link))
    }
    roomPanel.querySelector('.rp-lb').onclick = () => {
      if (!openLeaderboard('wins')) toast('Leaderboards open from the Boxity toolbar')
    }
  }
  tapped(fplus, () => {
    roomPanel.hidden = !roomPanel.hidden
    if (!roomPanel.hidden) renderRoom()
  })
  friend.append(roomPanel)

  // --- Overlays ---
  const popLayer = el('div', 'pop-layer')
  const toasts = el('div', 'toasts')
  const prompt = el('button', 'prompt', `<span class="k">E</span><span class="t"><small></small><b></b></span>`)
  tapped(prompt, () => usePrompt())
  const lines = el('div', 'speedlines')
  const flash = el('div', 'levelup o')
  const flair = el('div', 'flair o lucky')
  const hurt = el('div', 'hurt') // red (crush) / blue (splash) screen-edge flash
  // Stage run chip (top centre): stage, timer, personal best, next medal, try count.
  const chip = el('div', 'run-chip', `<span class="o rc-stage"></span><span class="o rc-time"></span><span class="rc-pb"><i class="medal"></i><span class="o"></span></span><span class="rc-target"><i class="medal"></i><span class="o"></span></span><span class="o rc-tries"></span>`)
  // AFK auto ride banner (top centre, under the run chip's spot).
  const auto = el('div', 'auto-ride', `<span class="ar-dot"></span><span class="o ar-t"></span><span class="o ar-h"></span>`)
  root.append(lines, left, tr, right, bottom, friend, chip, auto, popLayer, toasts, prompt, flash, flair, hurt)
  windows = createWindows({ root, teleportStage })
  root.append(toasts) // toasts stay readable over an open window

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
  // Short text popping off the truck (CLOSE!, AIR 1.4s, OUCH!).
  const callout = (text, color = '#ffffff', big = false) => {
    const p = el('div', `popup callout${big ? ' big' : ''}`, `<span class="o">${text}</span>`)
    p.style.color = color
    let x = window.innerWidth * 0.5
    let y = window.innerHeight * 0.42
    if (anchor && camera) {
      v.set(anchor.x, anchor.y + 3.4, anchor.z).project(camera)
      if (v.z < 1) {
        x = (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * window.innerWidth * 0.06
        y = (-v.y * 0.5 + 0.5) * window.innerHeight
      }
    }
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    popLayer.append(p)
    setTimeout(() => p.remove(), 1200)
  }
  const showFlair = (html, color = '#ffe14a') => {
    flair.innerHTML = html
    flair.style.color = color
    flair.classList.remove('show')
    void flair.offsetWidth
    flair.classList.add('show')
  }
  const bump = (statEl, text) => {
    const b = el('span', 'o bump', text)
    statEl.append(b)
    setTimeout(() => b.remove(), 1100)
  }
  on('gears', (n) => bump(gears, `+${fmt(n)}`))
  on('wins', (n) => {
    if (n <= 0) return
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
  const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
  const medalCls = (tier) => `medal m${tier}`
  return {
    root,
    windows,
    callout,
    flair: showFlair,
    hurt(color = 'rgba(255,30,30,0.75)') {
      hurt.style.setProperty('--hurt', color)
      hurt.classList.remove('show')
      void hurt.offsetWidth
      hurt.classList.add('show')
    },
    // info: runs.info() or null.
    setRun(info) {
      chip.classList.toggle('show', !!info)
      if (!info) return
      set('rcs', chip.querySelector('.rc-stage'), `STAGE ${info.k}/${info.count}`)
      set('rct', chip.querySelector('.rc-time'), clock(info.time))
      const pb = chip.querySelector('.rc-pb')
      pb.style.display = info.best ? '' : 'none'
      set('rcpm', pb.querySelector('i'), medalCls(info.medal), 'className')
      set('rcp', pb.querySelector('span'), info.best ? `PB ${clock(info.best)}${info.ghost ? ' 👻' : ''}` : '')
      const tg = chip.querySelector('.rc-target')
      tg.style.display = info.target ? '' : 'none'
      if (info.target) {
        const late = info.time > info.target.time
        set('rcgm', tg.querySelector('i'), medalCls(info.target.tier), 'className')
        set('rcg', tg.querySelector('span'), `${MEDALS.tiers[info.target.tier - 1].label} ${clock(info.target.time)}`)
        tg.classList.toggle('late', late)
      }
      set('rctr', chip.querySelector('.rc-tries'), `Try ${info.tries}`)
    },
    // label: the AFK ramp being auto ridden ('3x Speed'), or null to hide the banner.
    setAuto(label) {
      auto.classList.toggle('show', !!label)
      if (!label) return
      set('art', auto.querySelector('.ar-t'), `AUTO RIDE · ${label}`)
      set('arh', auto.querySelector('.ar-h'), COARSE_POINTER ? 'Touch the controls to drive' : 'Press any key to drive')
    },
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
      set('wm', winsMulti, `Wins Multi: ${winsMultiNow().toFixed(2)}X`)
      badges.rebirth.classList.toggle('on', state.level >= REBIRTH.levelReq(state.rebirths))
      badges.daily.classList.toggle('on', dailyReady())
      windows.update(dt)
      adT -= dt
      if (adT <= 0) {
        adT = 3
        adBtn.hidden = !rewardedAdsAvailable()
      }
      set('fb', friend.querySelector('.fb'), `Friend Boost: +${state.friendBoost}%`)
      for (const [chip, left, key] of [[balloonChip, balloonsLeft(), 'pwb'], [wingsChip, wingsLeft(), 'pww']]) {
        chip.hidden = left <= 0
        if (left > 0) set(key, chip.lastChild, mmss(left))
      }
      const tm = nitro.active > 0 ? nitro.active : nitro.cooldown > 0 ? nitro.cooldown : NITRO.duration
      set('nt', nitroBtn.querySelector('.time'), `${tm.toFixed(1)}s`)
      nitroBtn.classList.toggle('active', nitro.active > 0)
      nitroBtn.classList.toggle('cooling', nitro.cooldown > 0)
      lines.classList.toggle('on', nitro.active > 0)
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
