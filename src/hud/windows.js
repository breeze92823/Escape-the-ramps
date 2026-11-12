import './windows.css'
import { AFK_RAMPS, CAR_RARITY, CAR_RARITY_ORDER, CARS, DAILY, REBIRTH, STAGES, TELEPORT, TUNING } from '../config.js'
import * as game from '../game.js'
import * as audio from '../audio.js'
import { adScreen } from '../bloxity.js'
import { net, roomPlayers, sendGift } from '../net.js'
import * as I from './icons.js'
import { truckThumbs } from './thumbs.js'

// The menu windows, rebuilt from the reference screenshots: Tuning (Inventory /
// Tuning Shop tabs), Rebirths, Teleport (every stage), Cars and Daily Rewards.
// One window at a time. Each window re-renders its body from game state on open
// and on the game events it cares about; timers tick from update(). Buttons
// carry data-act and are handled by one delegated click listener per window.
// Sizes use --wu (1px of the 1920x991 reference, shrunk so a window always fits).

const { state } = game
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.innerHTML = html
  return e
}
const k = (n) => {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`
  return String(Math.floor(n))
}
const clock = (s, hours = false) => {
  s = Math.max(0, Math.floor(s))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hours ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}
const lock = `<svg viewBox="0 0 100 100"><path d="M30 46V32a20 20 0 0 1 40 0v14" fill="none" stroke="#14101c" stroke-width="16"/><path d="M30 46V32a20 20 0 0 1 40 0v14" fill="none" stroke="#c9ced8" stroke-width="8"/><rect x="18" y="44" width="64" height="48" rx="10" fill="#ffc21a" stroke="#14101c" stroke-width="6"/><circle cx="50" cy="64" r="7" fill="#14101c"/><path d="M50 66v12" stroke="#14101c" stroke-width="6"/></svg>`
const sparkle = `<svg viewBox="0 0 100 100"><path d="M50 0 58 42 100 50 58 58 50 100 42 58 0 50 42 42z" fill="#ffffff"/></svg>`

export function createWindows({ root, teleportStage }) {
  // Shared gradient for the metal parts (kept out of display:none subtrees).
  const defs = el('div', 'win-defs', `<svg width="0" height="0">${I.partDefs}</svg>`)
  const layer = el('div', 'win-layer')
  root.append(defs, layer)

  const wins = {}
  let current = null

  function shell(name, { title, icon, cls = '' }) {
    const w = el('div', `win win-${name} ${cls}`)
    const head = el('div', 'win-head', `<div class="win-icon">${icon}</div><span class="o win-title">${title}</span>`)
    const extra = el('div', 'win-extra')
    const x = el('button', 'win-x', I.close)
    x.dataset.act = 'close'
    head.append(extra, x)
    const body = el('div', 'win-body')
    w.append(head, body)
    layer.append(w)
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]')
      if (!b || !w.contains(b)) return
      b.classList.remove('pop')
      void b.offsetWidth
      b.classList.add('pop')
      audio.click()
      if (b.dataset.act === 'close') return close()
      wins[name].act(b.dataset.act, b.dataset, b)
    })
    // Keep wheel / drags inside the window from steering the camera.
    w.addEventListener('pointerdown', (e) => e.stopPropagation())
    return { w, head, extra, body }
  }

  // --- Tuning ------------------------------------------------------------------------
  {
    const s = shell('tuning', { title: 'TUNING', icon: I.tuning })
    s.extra.innerHTML = `<div class="gear-pill">${I.gear()}<span class="gp-num">0 GEARS</span></div>`
    let tab = 'inventory'
    const tabs = el('div', 'tn-tabs', `<button class="tn-tab" data-act="tab" data-tab="inventory">INVENTORY</button><button class="tn-tab" data-act="tab" data-tab="shop">TUNING SHOP</button>`)
    const inv = el('div', 'tn-inv')
    const shop = el('div', 'tn-shop')
    s.body.append(tabs, inv, shop)
    const tile = (id, n, act) => {
      const r = TUNING.parts[id].rarity
      return `<button class="tn-tile r-${r}" data-act="${act}" data-id="${id}" title="${TUNING.parts[id].name}"><div class="tn-tile-ic">${I.parts[id]}</div><span class="o tn-tile-pct">+${game.partPct(id)}%</span>${n > 1 ? `<span class="o tn-tile-n">x${n}</span>` : ''}</button>`
    }
    const renderInv = () => {
      const eq = Object.entries(state.equipped)
      const free = Object.entries(state.parts).map(([id, n]) => [id, n - (state.equipped[id] ?? 0)]).filter(([, n]) => n > 0)
      const owned = Object.values(state.parts).reduce((a, b) => a + b, 0)
      const order = (a, b) => game.partPct(b[0]) - game.partPct(a[0])
      inv.innerHTML = `
        <div class="tn-panel tn-eq">
          <div class="tn-ph"><span class="o">EQUIPPED (${game.equippedCount()}/${state.tuneSlots})</span><button class="tn-plus" data-act="slot">${I.plus}</button></div>
          <div class="tn-well">${eq.length ? `<div class="tn-grid">${eq.sort(order).map(([id, n]) => tile(id, n, 'unequip')).join('')}</div>` : ''}</div>
          <div class="o tn-total">+${state.tuning}% SPEED</div>
          <div class="tn-btns"><button class="tn-btn green" data-act="best">${I.crate}<span class="o">EQUIP BEST</span></button><button class="tn-btn red" data-act="none">${I.crate}<span class="o">UNEQUIP ALL</span></button></div>
        </div>
        <div class="tn-panel tn-own">
          <div class="tn-ph"><button class="tn-shopbtn" data-act="tab" data-tab="shop">${I.shop}<span class="o">SHOP</span></button><span class="o">OWNED (${owned})</span></div>
          <div class="tn-well">${free.length ? `<div class="tn-grid">${free.sort(order).map(([id, n]) => tile(id, n, 'equip')).join('')}</div>` : `<div class="o tn-empty">${owned ? 'ALL PARTS EQUIPPED' : 'NO TUNING PARTS OWNED YET'}</div>`}</div>
        </div>`
    }
    const renderShop = () => {
      shop.innerHTML = `
        <div class="tn-timer"><div class="tn-clock">${I.timer}</div><span class="o tn-new">NEW ITEMS IN ${clock(game.shopRestockIn())}</span></div>
        <div class="tn-cards">${game.shopStock().map((it) => `
          <div class="tn-card r-${it.id}${it.left ? '' : ' sold'}">
            <div class="o tn-rar">${it.label}</div>
            <div class="o tn-name">${TUNING.parts[it.part].name}</div>
            <div class="o tn-stock">${it.left}/${it.stock}</div>
            <div class="tn-art"><i class="sp a">${sparkle}</i><i class="sp b">${sparkle}</i><i class="sp c">${sparkle}</i>${I.parts[it.part]}</div>
            <div class="o tn-pct">+${it.pct}% SPEED</div>
            <button class="tn-buy gears" data-act="buy" data-r="${it.id}">${I.gear('#b8bec8')}<span class="o">${it.left ? k(it.gears) : 'SOLD OUT'}</span></button>
            <div class="tn-row"><button class="tn-gift" data-act="gift" data-r="${it.id}" title="Gift to a player">${I.gift}</button></div>
          </div>`).join('')}</div>${giftFor ? renderGift() : ''}`
      period = state.tuneShop.period
    }
    // Gift picker: the players on this server (net.js roster); picking one pays the
    // card's gem price and sends them the part.
    let giftFor = null // rarity id being gifted
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
    const renderGift = () => {
      const item = game.shopStock().find((s) => s.id === giftFor)
      const name = item ? TUNING.parts[item.part].name : ''
      const others = roomPlayers()
      const list = !net.connected
        ? `<div class="o tn-empty">Not connected to a server. Gifts need other players online</div>`
        : others.length
          ? others.map((p) => `<button class="tn-gp-row" data-act="giftto" data-id="${esc(p.id)}"><span class="o">${esc(p.name)}</span>${I.gift}</button>`).join('')
          : `<div class="o tn-empty">No other players on this server yet</div>`
      return `<div class="tn-giftpick"><div class="tn-gp-box">
        <div class="o tn-gp-h">GIFT ${esc(name).toUpperCase()}</div>
        <div class="tn-gp-cost">${I.gem}<span class="o">${item?.gems ?? 0} gems</span></div>
        <div class="tn-gp-list">${list}</div>
        <button class="tn-btn red" data-act="giftcancel"><span class="o">CANCEL</span></button>
      </div></div>`
    }
    let period = -1
    const render = () => {
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === tab)
      inv.style.display = tab === 'inventory' ? '' : 'none'
      shop.style.display = tab === 'shop' ? '' : 'none'
      if (tab === 'inventory') renderInv()
      else renderShop()
    }
    wins.tuning = {
      ...s,
      render,
      tick() {
        s.extra.querySelector('.gp-num').textContent = `${k(state.gears)} GEARS`
        if (tab !== 'shop') return
        if (game.shopPeriod() !== period) renderShop()
        shop.querySelector('.tn-new').textContent = `NEW ITEMS IN ${clock(game.shopRestockIn())}`
      },
      act(a, d) {
        if (a === 'tab') tab = d.tab
        else if (a === 'equip') game.equipPart(d.id)
        else if (a === 'unequip') game.unequipPart(d.id)
        else if (a === 'best') game.equipBest()
        else if (a === 'none') game.unequipAll()
        else if (a === 'slot') game.buySlot()
        else if (a === 'buy') game.buyPart(d.r, false)
        else if (a === 'gift') giftFor = d.r
        else if (a === 'giftcancel') giftFor = null
        else if (a === 'giftto') {
          const to = roomPlayers().find((p) => p.id === d.id)
          const sent = to && game.giftPart(giftFor, (part) => sendGift(to.id, part))
          if (sent) {
            game.toast(`Sent ${TUNING.parts[sent.part].name} to ${to.name}!`, 'good')
            giftFor = null
          } else if (!to) game.toast('That player left the server', 'bad')
        }
        render()
      },
    }
    wins.tuning.setTab = (t) => (tab = t)
  }

  // --- Rebirths ------------------------------------------------------------------------
  {
    const s = shell('rebirth', { title: 'Rebirths', icon: I.rebirth })
    const render = () => {
      const r = state.rebirths
      const need = REBIRTH.levelReq(r)
      const unlock = AFK_RAMPS.find((a) => a.rebirths === r + 1)
      s.body.innerHTML = `
        <div class="rb-cols">
          <div class="rb-col"><div class="o rb-h">Rebirth ${r}</div><div class="rb-box"><div class="rb-ic">${I.wheel}</div><span class="o">${REBIRTH.multi(r)}x Speed</span></div><div class="rb-box"><div class="rb-ic">${I.bars}</div><span class="o">Level ${need}</span></div></div>
          <div class="rb-arrows"><div class="rb-arrow">${I.arrow}</div><div class="rb-arrow">${I.arrow}</div></div>
          <div class="rb-col"><div class="o rb-h">Rebirth ${r + 1}</div><div class="rb-box"><div class="rb-ic">${I.wheel}</div><span class="o">${REBIRTH.multi(r + 1)}x Speed</span></div><div class="rb-box"><div class="rb-ic">${I.bars}</div><span class="o">Level ${REBIRTH.levelReq(r + 1)}</span></div></div>
        </div>
        <div class="o rb-note">Your Level resets after Rebirth!${unlock ? ` <span class="rb-unlock">Unlocks the ${unlock.label} AFK Ramp!</span>` : ''}</div>
        <div class="rb-bar"><div class="rb-fill" style="width:${Math.min(100, (state.level / need) * 100).toFixed(1)}%"></div><span class="o">Level ${state.level} / ${need}</span></div>
        <div class="rb-btns">
          <button class="rb-go${state.level >= need ? ' ready' : ''}" data-act="rebirth"><div class="rb-wm">${I.rebirth}</div><span class="o">Rebirth</span></button>        </div>`
    }
    wins.rebirth = {
      ...s,
      render,
      act(a) {
        if (a === 'rebirth') game.rebirth()
        render()
      },
    }
  }

  // --- Teleport ------------------------------------------------------------------------
  {
    const s = shell('teleport', { title: 'Teleport', icon: I.teleport })
    const list = el('div', 'tp-list')
    s.body.append(list)
    const render = () => {
      let html = ''
      for (let st = 1; st <= STAGES.count; st++) {
        const cost = TELEPORT.wins[st - 1]
        html += `<div class="tp-row open" data-act="go" data-k="${st}">
          <div class="tp-swirl">${I.teleport}</div><span class="o tp-name">Stage ${st}</span>
          <button class="tp-wins${state.wins >= cost ? '' : ' short'}" data-act="go" data-k="${st}"><span class="o">${cost ? I.trophy + k(cost) : 'GO'}</span></button>        </div>`
      }
      list.innerHTML = html
    }
    wins.teleport = {
      ...s,
      render,
      act(a, d) {
        const st = +d.k
        if (a !== 'go' || !game.payStageTeleport(st)) return
        close()
        teleportStage(st)
      },
    }
  }

  // --- Cars ---------------------------------------------------------------------------
  {
    const s = shell('cars', { title: 'Cars', icon: I.cars })
    const preview = el('div', 'cr-prev')
    const grid = el('div', 'cr-grid')
    s.body.append(preview, grid)
    const ids = Object.keys(CARS).sort((a, b) => CAR_RARITY_ORDER.indexOf(CARS[a].rarity) - CAR_RARITY_ORDER.indexOf(CARS[b].rarity) || CARS[a].bonus - CARS[b].bonus)
    let sel = null
    const img = (id) => {
      const src = truckThumbs()[id]
      return src ? `<img src="${src}" alt="" draggable="false">` : ''
    }
    const render = () => {
      sel ??= state.car
      const owned = (id) => state.owned.includes(id)
      grid.innerHTML = ids
        .map((id) => {
          const c = CARS[id]
          const [a, b] = CAR_RARITY[c.rarity].card
          return `<button class="cr-card${owned(id) ? '' : ' locked'}${id === sel ? ' sel' : ''}" style="--ca:${a};--cb:${b}" data-act="pick" data-id="${id}">${img(id)}<span class="o cr-name${c.name.length > 9 ? ' long' : ''}">${c.name}</span>${state.car === id ? `<div class="cr-check">${I.check}</div>` : ''}${owned(id) ? '' : `<div class="cr-lock">${lock}</div>`}</button>`
        })
        .join('')
      const c = CARS[sel]
      const rar = CAR_RARITY[c.rarity]
      let btn
      if (state.car === sel) btn = `<button class="cr-btn grey" data-act="none"><span class="o">Equipped</span></button>`
      else if (owned(sel)) btn = `<button class="cr-btn green" data-act="use"><span class="o">Equip</span></button>`
      else if (c.daily) btn = `<button class="cr-btn grey" data-act="daily"><span class="o">Daily Reward</span></button>`
      else btn = `<button class="cr-btn ${state.wins >= c.wins ? 'yellow' : 'grey'}" data-act="use">${I.trophy}<span class="o">${k(c.wins)} Wins</span></button>`
      preview.innerHTML = `<div class="o cr-title">${c.name}</div><div class="o cr-rar" style="color:${rar.color}">${rar.label}</div><div class="cr-big">${img(sel)}</div><div class="o cr-bonus">+${k(c.bonus)} Speed</div>${btn}`
    }
    wins.cars = {
      ...s,
      render,
      onOpen() {
        sel = state.car
      },
      act(a, d) {
        if (a === 'pick') sel = d.id
        else if (a === 'use') game.useCar(sel)
        else if (a === 'daily') return open('daily')
        render()
      },
    }
  }

  // --- Daily rewards -------------------------------------------------------------------
  {
    const s = shell('daily', { title: 'Daily Rewards', icon: I.daily })
    s.extra.innerHTML = `<span class="o dl-next">Next 00:00:00</span>`
    const iconOf = { gear: I.gear('#c4a6c8'), trophy: I.trophy, nitro: I.nitro }
    const render = () => {
      const cur = game.dailyDay()
      const ready = game.dailyReady()
      const thumbs = truckThumbs()
      s.body.innerHTML = `<div class="dl-grid">${DAILY.map((r, i) => {
        const now = ready && i === cur
        // Claimed today with the streak wrapped (Day 7 done): the whole week shows ticked.
        const claimed = !ready && cur === 0 ? true : i < cur
        const big = i === DAILY.length - 1
        return `<button class="dl-card d${i + 1}${claimed ? ' done' : ''}${now ? ' now' : ''}${big ? ' big' : ''}" data-act="claim" data-i="${i}">
          <span class="o dl-day">Day ${i + 1}</span>${claimed ? `<div class="dl-check">${I.check}</div>` : ''}
          ${big ? `<span class="o lucky dl-sp">+${CARS[r.car].bonus} Speed</span><div class="dl-car">${thumbs[r.car] ? `<img src="${thumbs[r.car]}" alt="" draggable="false">` : ''}</div>` : ''}
          <div class="dl-icons">${r.icons.map((n) => `<div class="dl-ic">${iconOf[n]}</div>`).join('')}</div>
          <span class="o dl-lbl${r.small ? ' small' : ''}">${r.label}</span>
          ${now ? '<span class="o dl-claim">CLAIM!</span>' : ''}
        </button>`
      }).join('')}</div>`
    }
    wins.daily = {
      ...s,
      render,
      tick() {
        s.extra.querySelector('.dl-next').textContent = game.dailyReady() ? 'Ready to claim!' : `Next ${clock(game.dailyNextIn(), true)}`
      },
      act(a, d) {
        if (a !== 'claim') return
        if (+d.i !== game.dailyDay() || !game.dailyReady()) {
          game.toast(game.dailyReady() ? `Claim Day ${game.dailyDay() + 1} first!` : 'Come back tomorrow for the next reward!')
          return
        }
        game.claimDaily()
        render()
      },
    }
  }

  // --- Open / close ---------------------------------------------------------------------
  function open(name) {
    if (current) wins[current].w.classList.remove('show')
    current = name
    const win = wins[name]
    win.onOpen?.()
    win.render()
    win.tick?.()
    win.w.classList.add('show')
    adScreen('panel')
    if (document.pointerLockElement) document.exitPointerLock?.()
  }
  function close() {
    if (!current) return
    wins[current].w.classList.remove('show')
    current = null
    adScreen('gameplay')
  }
  const refresh = (...names) => () => {
    if (current && names.includes(current)) wins[current].render()
  }
  game.on('tuning', refresh('tuning'))
  game.on('restock', () => {
    game.toast('TUNING SHOP RESTOCKED!', 'good')
    refresh('tuning')()
  })
  game.on('levelup', refresh('rebirth'))
  game.on('rebirth', refresh('rebirth'))
  game.on('car', refresh('cars'))
  game.on('hydrate', refresh('tuning', 'rebirth', 'teleport', 'cars'))
  game.on('owned', refresh('cars'))
  game.on('wins', refresh('teleport', 'cars'))

  let tickT = 0
  return {
    open,
    close,
    toggle(name, tab) {
      if (current === name && !tab) return close()
      if (tab) wins[name].setTab?.(tab)
      open(name)
    },
    get current() {
      return current
    },
    update(dt) {
      // Keep the shop's restock clock running even while closed (it fires the toast).
      tickT += dt
      if (tickT < 0.25) return
      tickT = 0
      game.shopStock()
      if (current) wins[current].tick?.()
    },
  }
}
