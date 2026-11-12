import { Group } from 'three'
import { CARS } from './config.js'
import { eachRemote } from './net.js'
import { label } from './propkit.js'
import { animateTruck, buildTruck } from './truck.js'

// Other players' trucks, drawn from the room roster (backend presence.ts). Purely visual: no
// collisions. Each remote truck eases toward the latest pose (sent ~10x/s) and keeps rolling on
// the last speed, so it moves smoothly between updates. Only the nearest MAX are drawn (mobile).
const MAX = 12
const SHOW_NAME = 90 // m: name tags fade out beyond this
const SNAP = 40 // m: a jump bigger than this (teleport, respawn) is not eased

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

export function createRemotePlayers(scene) {
  const group = new Group()
  scene.add(group)
  const trucks = new Map() // sessionId -> { root, truck, car, name, tag, x, y, z, yaw, speed, steer }

  function make(id, p) {
    const car = CARS[p.car] ? p.car : 'tiger'
    const truck = buildTruck(CARS[car].paint)
    const root = new Group()
    root.add(truck.root)
    const tag = label(p.username || 'Player', 1.1, { fill: '#ffffff', outline: '#14141c' })
    tag.position.y = 5.2
    root.add(tag)
    root.position.set(p.x, p.y, p.z)
    root.rotation.y = p.yaw
    group.add(root)
    return { root, truck, car, name: p.username || 'Player', tag, x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: 0, steer: 0, seen: true }
  }
  function drop(id, t) {
    group.remove(t.root)
    t.root.traverse((o) => {
      if (o.isSprite) {
        o.material.map?.dispose()
        o.material.dispose()
      }
    })
    trucks.delete(id)
  }

  return {
    // from: the local player's position (for the distance cap).
    update(dt, from) {
      for (const t of trucks.values()) t.seen = false
      const near = []
      eachRemote((id, p) => {
        const d2 = (p.x - from.x) ** 2 + (p.z - from.z) ** 2
        near.push({ id, p, d2 })
      })
      near.sort((a, b) => a.d2 - b.d2)
      for (const { id, p, d2 } of near.slice(0, MAX)) {
        let t = trucks.get(id)
        const car = CARS[p.car] ? p.car : 'tiger'
        if (t && t.car !== car) {
          drop(id, t) // a different truck equipped: rebuild
          t = null
        }
        if (!t) trucks.set(id, (t = make(id, p)))
        t.seen = true
        if (p.username && p.username !== t.name) {
          t.name = p.username
          t.root.remove(t.tag)
          t.tag.material.map?.dispose()
          t.tag.material.dispose()
          t.tag = label(t.name, 1.1, { fill: '#ffffff', outline: '#14141c' })
          t.tag.position.y = 5.2
          t.root.add(t.tag)
        }
        // Ease toward the pose, dead-reckoning along the heading in between.
        if (Math.hypot(p.x - t.x, p.z - t.z) > SNAP || Math.abs(p.y - t.y) > SNAP) {
          t.x = p.x
          t.y = p.y
          t.z = p.z
        } else {
          const k = 1 - Math.exp(-10 * dt)
          t.x += (p.x + Math.sin(p.yaw) * p.speed * 0.05 - t.x) * k
          t.y += (p.y - t.y) * k
          t.z += (p.z + Math.cos(p.yaw) * p.speed * 0.05 - t.z) * k
        }
        t.yaw += wrap(p.yaw - t.yaw) * (1 - Math.exp(-12 * dt))
        const pitch = p.air ? -0.12 : 0
        t.root.position.set(t.x, t.y, t.z)
        t.root.rotation.y = t.yaw
        animateTruck(t.truck, dt, { speed: p.speed, steer: p.steer, grounded: !p.air, groundPitch: pitch })
        t.tag.visible = d2 < SHOW_NAME * SHOW_NAME
      }
      for (const [id, t] of trucks) if (!t.seen) drop(id, t)
    },
    get count() {
      return trucks.size
    },
  }
}
