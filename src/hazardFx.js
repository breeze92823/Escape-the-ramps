import { createParticles } from './effects.js'

// Particle recipes for the stage hazards' fx() events (hub/hazardKit.js):
// explosions, plasma bolts, laser sparks, missile trails, flame jets, tesla
// sparks, smoke banks, lava embers, crumbling stone, wind streaks...
// Built on main.js's pooled systems (dust, additive flames, sparkle sparks)
// plus two of its own: thick smoke and big soft fireballs.
// `callout` and `quake` events are game feel, handled by main.js.
const rnd = (a, b) => a + Math.random() * (b - a)

export function createHazardFx(scene, { dust, flames, sparks, debris }) {
  const smoke = createParticles(scene, { max: 320 })
  const fire = createParticles(scene, { max: 220, additive: true })
  const systems = [smoke, fire]

  function spray(sys, x, y, z, n, speed, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const u = Math.random()
      const up = rnd(o.upMin ?? 0.2, o.upMax ?? 1)
      sys.emit(x, y, z, Math.cos(a) * speed * u, speed * up, Math.sin(a) * speed * u, {
        life: (o.life ?? 1) * rnd(0.6, 1.2), size: o.size ?? 1, sizeEnd: o.sizeEnd ?? (o.size ?? 1) * 0.3,
        color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color, alpha: o.alpha ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 1,
      })
    }
  }

  const R = {
    // A plasma bolt's trail (every frame while it flies).
    plasma(e) {
      const c = e.o?.color ?? '#ff3a6a'
      fire.emit(e.x, e.y, e.z, rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5), { life: 0.22, size: 1.1, sizeEnd: 0.1, color: c, drag: 3 })
      if (Math.random() < 0.5) sparks.emit(e.x, e.y, e.z, rnd(-2, 2), rnd(-1, 2), rnd(-2, 2), { life: 0.3, size: 0.35, sizeEnd: 0.05, color: '#ffffff', drag: 2 })
    },
    plasmaPop(e) {
      const c = e.o?.color ?? '#ff3a6a'
      spray(sparks, e.x, e.y, e.z, 16, 9, { life: 0.45, size: 0.5, color: [c, '#ffffff'], gravity: -14, drag: 1.4 })
      fire.emit(e.x, e.y, e.z, 0, 0.5, 0, { life: 0.25, size: 3, sizeEnd: 0.3, color: c })
    },
    // Muzzle flash along the firing direction.
    muzzle(e) {
      const { dx = 0, dy = 0, dz = 1, color = '#ff3a6a' } = e.o ?? {}
      for (let i = 0; i < 14; i++) {
        const s = rnd(4, 14)
        fire.emit(e.x, e.y, e.z, dx * s + rnd(-2, 2), dy * s + rnd(-2, 2), dz * s + rnd(-2, 2), { life: rnd(0.08, 0.18), size: 1.3, sizeEnd: 0.2, color: i % 2 ? color : '#ffffff', drag: 5 })
      }
      for (let i = 0; i < 6; i++) smoke.emit(e.x, e.y, e.z, dx * 3 + rnd(-1, 1), dy * 3 + rnd(0, 1), dz * 3 + rnd(-1, 1), { life: 0.9, size: 0.8, sizeEnd: 2.2, color: '#8a8f99', alpha: 0.5, drag: 2, gravity: 1 })
    },
    // Energy gathering at a muzzle while a turret charges.
    charge(e) {
      const a = Math.random() * Math.PI * 2
      const b = Math.random() * Math.PI - Math.PI / 2
      const r = 1.6
      const ox = Math.cos(a) * Math.cos(b) * r
      const oy = Math.sin(b) * r
      const oz = Math.sin(a) * Math.cos(b) * r
      sparks.emit(e.x + ox, e.y + oy, e.z + oz, -ox * 4, -oy * 4, -oz * 4, { life: 0.25, size: 0.4, sizeEnd: 0.1, color: e.o?.color ?? '#ff3a6a', drag: 0 })
    },
    laserSpark(e) {
      spray(sparks, e.x, e.y, e.z, 3, 5, { life: 0.35, size: 0.3, color: ['#ff6a4a', '#ffffff'], gravity: -16, drag: 1 })
    },
    // The big one: fireball, flash, sparks, dirt and a smoke column.
    explosion(e) {
      const k = e.o?.size ?? 1
      fire.emit(e.x, e.y + 0.5, e.z, 0, 2, 0, { life: 0.2, size: 9 * k, sizeEnd: 3 * k, color: '#fff2c0' })
      for (let i = 0; i < 18 * k; i++) {
        const a = Math.random() * Math.PI * 2
        const s = rnd(2, 7) * k
        fire.emit(e.x + rnd(-0.8, 0.8), e.y + rnd(0, 1), e.z + rnd(-0.8, 0.8), Math.cos(a) * s, rnd(2, 8) * k, Math.sin(a) * s, {
          life: rnd(0.35, 0.7), size: rnd(2.2, 3.8) * k, sizeEnd: 0.6, color: i % 3 === 0 ? '#ffe27a' : i % 3 === 1 ? '#ff9a2a' : '#ff4a1a', drag: 2.4, gravity: 2,
        })
      }
      spray(sparks, e.x, e.y + 0.5, e.z, Math.round(30 * k), 16 * k, { life: 0.9, size: 0.5, color: ['#ffd27a', '#ffffff', '#ff7a2a'], gravity: -20, drag: 0.8, upMin: 0.3, upMax: 1.2 })
      spray(dust, e.x, e.y, e.z, Math.round(16 * k), 9 * k, { life: 1.1, size: 0.5, sizeEnd: 0.4, color: ['#5a4a3a', '#3a3028'], alpha: 0.9, gravity: -18, drag: 0.6, upMin: 0.6, upMax: 1.4 })
      for (let i = 0; i < 22 * k; i++) {
        const a = Math.random() * Math.PI * 2
        smoke.emit(e.x + Math.cos(a) * rnd(0, 1.5), e.y + rnd(0.5, 2), e.z + Math.sin(a) * rnd(0, 1.5), Math.cos(a) * rnd(1, 4), rnd(2, 6), Math.sin(a) * rnd(1, 4), {
          life: rnd(1.6, 2.6), size: rnd(1.8, 2.8) * k, sizeEnd: rnd(4.5, 7) * k, color: i % 3 ? '#4a4a52' : '#2a2a30', alpha: 0.7, drag: 1.3, gravity: 1.6,
        })
      }
      // A ring of dust blown out across the floor.
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2
        dust.emit(e.x + Math.cos(a), e.y, e.z + Math.sin(a), Math.cos(a) * 12 * k, 0.8, Math.sin(a) * 12 * k, { life: 0.8, size: 1.2, sizeEnd: 3.4, color: '#d9cdb4', alpha: 0.6, drag: 3 })
      }
      debris.crack(e.x, e.y - 0.5, e.z, 4 * k)
    },
    crack(e) {
      debris.crack(e.x, e.y, e.z, e.o?.size ?? 5)
    },
    missileTrail(e) {
      fire.emit(e.x, e.y, e.z, rnd(-0.6, 0.6), rnd(-0.6, 0.6), rnd(-0.6, 0.6), { life: 0.18, size: 1.2, sizeEnd: 0.2, color: Math.random() < 0.5 ? '#ffb02a' : '#ffe27a', drag: 3 })
      smoke.emit(e.x, e.y, e.z, rnd(-0.4, 0.4), rnd(0, 0.6), rnd(-0.4, 0.4), { life: rnd(1.2, 1.8), size: 0.7, sizeEnd: 2.6, color: '#d8dce4', alpha: 0.55, drag: 0.8, gravity: 0.6 })
    },
    launch(e) {
      for (let i = 0; i < 18; i++) smoke.emit(e.x + rnd(-1, 1), e.y, e.z + rnd(-1, 1), rnd(-3, 3), rnd(-1, 3), rnd(-3, 3), { life: rnd(1, 1.6), size: 1.2, sizeEnd: 3.6, color: '#c8ccd4', alpha: 0.6, drag: 1.6, gravity: 1 })
      spray(fire, e.x, e.y, e.z, 10, 5, { life: 0.25, size: 1.4, color: ['#ffb02a', '#ffe27a'], drag: 3 })
    },
    // Fire along a flamethrower's jet (every frame while it burns).
    flameJet(e) {
      const { dir = 1, reach = 16 } = e.o ?? {}
      for (let i = 0; i < 4; i++) {
        const s = rnd(reach * 1.2, reach * 2)
        fire.emit(e.x, e.y + rnd(-0.2, 0.2), e.z + rnd(-0.2, 0.2), dir * s, rnd(-0.5, 2), rnd(-1.5, 1.5), {
          life: rnd(0.3, 0.55), size: rnd(1, 1.6), sizeEnd: rnd(2.6, 3.6), color: i === 0 ? '#ffe27a' : Math.random() < 0.5 ? '#ff7a1a' : '#ff4a1a', drag: 2.4, gravity: 3,
        })
      }
      if (Math.random() < 0.35) smoke.emit(e.x + dir * reach * 0.8, e.y + 1.2, e.z, dir * 3, rnd(2, 4), rnd(-1, 1), { life: 1.4, size: 1.6, sizeEnd: 4, color: '#2a2a30', alpha: 0.45, drag: 1, gravity: 1.5 })
    },
    sputter(e) {
      const dir = e.o?.dir ?? 1
      fire.emit(e.x, e.y, e.z, dir * rnd(2, 5), rnd(0, 1.5), rnd(-1, 1), { life: 0.18, size: 0.7, sizeEnd: 0.2, color: '#ff9a2a', drag: 3 })
      smoke.emit(e.x, e.y, e.z, dir * 1.5, 1, 0, { life: 0.6, size: 0.4, sizeEnd: 1.2, color: '#3a3a40', alpha: 0.5, drag: 1 })
    },
    teslaSpark(e) {
      spray(sparks, e.x, e.y, e.z, 6, 7, { life: 0.3, size: 0.45, color: ['#bfe8ff', '#ffffff', '#5ab8ff'], gravity: -10, drag: 1.2 })
    },
    spikePop(e) {
      const w = e.o?.w ?? 20
      for (let i = 0; i < 14; i++) sparks.emit(e.x + rnd(-w / 2, w / 2), e.y, e.z + rnd(-0.6, 0.6), rnd(-1, 1), rnd(3, 6), rnd(-1, 1), { life: 0.3, size: 0.3, sizeEnd: 0.05, color: '#ffffff', gravity: -18, drag: 1 })
      for (let i = 0; i < 8; i++) dust.emit(e.x + rnd(-w / 2, w / 2), e.y, e.z, 0, rnd(1, 2), rnd(-1, 1), { life: 0.5, size: 0.6, sizeEnd: 1.4, color: '#d9cdb4', alpha: 0.5, drag: 2 })
    },
    exhaust(e) {
      smoke.emit(e.x, e.y, e.z, rnd(-0.5, 0.5), rnd(2, 3.5), rnd(-0.5, 0.5), { life: 1.1, size: 0.6, sizeEnd: 2.2, color: '#2a2a30', alpha: 0.55, drag: 1, gravity: 1 })
    },
    tyreDust(e) {
      dust.emit(e.x + rnd(-1, 1), e.y, e.z + rnd(-1, 1), rnd(-1.5, 1.5), rnd(1, 2.5), rnd(-1.5, 1.5), { life: 0.8, size: 0.9, sizeEnd: 2.8, color: Math.random() < 0.5 ? '#eef3e6' : '#d9cdb4', alpha: 0.5, drag: 2 })
    },
    magnetZap(e) {
      spray(sparks, e.x, e.y, e.z, 8, 6, { life: 0.35, size: 0.4, color: ['#8ad8ff', '#ffffff'], gravity: -6, drag: 1.5 })
    },
    boulderDust(e) {
      const n = e.o?.n ?? 4
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        dust.emit(e.x + Math.cos(a) * 1.5, e.y + 0.3, e.z + Math.sin(a) * 1.5, Math.cos(a) * rnd(2, 7), rnd(1, 3), Math.sin(a) * rnd(2, 7), { life: rnd(0.9, 1.5), size: 1.4, sizeEnd: 4, color: Math.random() < 0.5 ? '#c9b89a' : '#a8977a', alpha: 0.6, drag: 2, gravity: 0.5 })
      }
    },
    rockBurst(e) {
      const r = e.o?.r ?? 2
      spray(dust, e.x, e.y, e.z, e.o?.n ?? 24, 10, { life: 1.2, size: 0.45, sizeEnd: 0.35, color: ['#7a6e62', '#5a5048', '#9a8e80'], alpha: 1, gravity: -22, drag: 0.4, upMin: 0.4, upMax: 1.3 })
      for (let i = 0; i < (e.o?.n ?? 24) / 2; i++) smoke.emit(e.x + rnd(-r, r), e.y, e.z + rnd(-r, r), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), { life: 1.6, size: 1.6, sizeEnd: 4.2, color: '#b8ab98', alpha: 0.5, drag: 1.5, gravity: 0.4 })
    },
    crumbleDust(e) {
      dust.emit(e.x, e.y, e.z, rnd(-0.5, 0.5), rnd(0.2, 1), rnd(-0.5, 0.5), { life: 0.7, size: 0.5, sizeEnd: 1.4, color: '#b8b2a6', alpha: 0.6, drag: 2, gravity: -2 })
    },
    // Thick fog-machine smoke rolling across the lane.
    smoke(e) {
      const dir = e.o?.dir ?? 0
      smoke.emit(e.x, e.y, e.z, dir * rnd(4, 9) + rnd(-1, 1), rnd(0.2, 1.2), rnd(-1.5, 1.5), { life: rnd(3.5, 5.5), size: rnd(3, 4.5), sizeEnd: rnd(8, 11), color: Math.random() < 0.5 ? '#c9ccd4' : '#aeb2bc', alpha: 0.5, drag: 0.5, gravity: 0.15 })
    },
    hologram(e) {
      const w = e.o?.w ?? 10
      for (let i = 0; i < 30; i++) sparks.emit(e.x + rnd(-w / 2, w / 2), e.y + rnd(-1.5, 2.5), e.z, rnd(-1, 1), rnd(-1, 1), rnd(-3, 3), { life: 0.6, size: 0.4, sizeEnd: 0.05, color: i % 2 ? '#8ff4ff' : '#ffffff', drag: 2 })
    },
    scorch(e) {
      smoke.emit(e.x, e.y + 0.2, e.z, rnd(-0.3, 0.3), rnd(1, 2.2), rnd(-0.3, 0.3), { life: 1.2, size: 0.6, sizeEnd: 2, color: '#2a2a30', alpha: 0.5, drag: 1, gravity: 1 })
    },
    windStreak(e) {
      const dir = e.o?.dir ?? 1
      dust.emit(e.x, e.y, e.z, dir * rnd(24, 34), rnd(-0.5, 0.5), rnd(-0.5, 0.5), { life: 1.6, size: 0.22, sizeEnd: 0.5, color: '#ffffff', alpha: 0.55, drag: 0.1 })
    },
    ember(e) {
      fire.emit(e.x, e.y, e.z, rnd(-1, 1), rnd(3, 7), rnd(-1, 1), { life: rnd(0.6, 1.2), size: rnd(0.3, 0.6), sizeEnd: 0.05, color: Math.random() < 0.5 ? '#ffb02a' : '#ff5a1a', drag: 0.6, gravity: -2 })
      if (Math.random() < 0.2) smoke.emit(e.x, e.y + 0.5, e.z, 0, rnd(2, 4), 0, { life: 1.6, size: 1.2, sizeEnd: 4, color: '#3a2a26', alpha: 0.4, drag: 1, gravity: 1 })
    },
    lavaBubble(e) {
      spray(fire, e.x, e.y, e.z, 6, 4, { life: 0.5, size: 0.5, color: ['#ffd27a', '#ff7a1a'], gravity: -14, drag: 0.6, upMin: 0.8, upMax: 1.4 })
    },
    rebuild(e) {
      const { len = 40, w = 40 } = e.o ?? {}
      for (let i = 0; i < 40; i++) sparks.emit(e.x + rnd(-w / 2, w / 2), e.y + rnd(-2, 2), e.z + rnd(-len / 2, len / 2), 0, rnd(1, 4), 0, { life: 0.9, size: 0.5, sizeEnd: 0.05, color: i % 2 ? '#7fffd8' : '#ffffff', drag: 1 })
    },
  }

  return {
    systems,
    run(e) {
      R[e.type]?.(e)
    },
    update(dt) {
      smoke.update(dt)
      fire.update(dt)
    },
    // The truck's own state: on fire, a flat tyre, sparks crawling after a zap.
    truck(dt, p, { burning, flat, zapped }) {
      if (burning > 0) {
        for (let i = 0; i < 2; i++) fire.emit(p.x + rnd(-1, 1), p.y + rnd(1, 2.2), p.z + rnd(-1.2, 1.2), rnd(-0.5, 0.5), rnd(2, 4), rnd(-0.5, 0.5), { life: rnd(0.25, 0.45), size: rnd(0.9, 1.4), sizeEnd: 0.2, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd27a', drag: 1.5 })
        if (Math.random() < dt * 20) smoke.emit(p.x, p.y + 2.2, p.z, rnd(-0.5, 0.5), rnd(2, 3.5), rnd(-0.5, 0.5), { life: 1.2, size: 0.9, sizeEnd: 2.8, color: '#2a2a30', alpha: 0.55, drag: 1, gravity: 1 })
      }
      if (flat > 0 && Math.random() < dt * 14) dust.emit(p.x + rnd(-1.2, 1.2), p.y + 0.3, p.z + rnd(-1.2, 1.2), rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1), { life: 0.5, size: 0.4, sizeEnd: 1, color: '#e8e8ee', alpha: 0.6, drag: 2 })
      if (zapped > 0 && Math.random() < dt * 40) sparks.emit(p.x + rnd(-1.3, 1.3), p.y + rnd(0.5, 2.4), p.z + rnd(-1.3, 1.3), rnd(-2, 2), rnd(-1, 3), rnd(-2, 2), { life: 0.2, size: 0.4, sizeEnd: 0.05, color: Math.random() < 0.5 ? '#8ad8ff' : '#ffffff', drag: 2 })
    },
  }
}
