import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three'
import { mulberry32, paintSoftDot, paintSparkle } from './textures.js'

// Particles. Two kinds:
//  - createParticles: a pooled CPU system (one Points draw call) for things
//    that are emitted: tyre dust, nitro flames, exhaust smoke, bursts, confetti.
//  - createSparkleField: a GPU-only looping field (rising twinkles over a pad,
//    a trophy, a ramp); it costs nothing on the CPU after it is built.
// Both use a sprite texture tinted per particle and size-attenuated points.

let pixelScale = 400 // half the drawing-buffer height: point size in px per metre at 1 m
export function setParticleScale(drawingBufferHeight) {
  pixelScale = drawingBufferHeight / 2
}
const scaleUniforms = new Set()

const dotTex = new CanvasTexture(paintSoftDot(64))
const sparkTex = new CanvasTexture(paintSparkle(64))

const vertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const fragment = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }`

export function createParticles(scene, { max = 400, additive = false, sparkle = false } = {}) {
  const pos = new Float32Array(max * 3)
  const tint = new Float32Array(max * 3)
  const size = new Float32Array(max)
  const alpha = new Float32Array(max)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('tint', new BufferAttribute(tint, 3))
  geo.setAttribute('size', new BufferAttribute(size, 1))
  geo.setAttribute('alpha', new BufferAttribute(alpha, 1))
  const uniforms = { map: { value: sparkle ? sparkTex : dotTex }, scale: { value: pixelScale } }
  scaleUniforms.add(uniforms)
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  // Per-particle state.
  const vel = new Float32Array(max * 3)
  const life = new Float32Array(max) // s left, 0 = dead
  const span = new Float32Array(max)
  const s0 = new Float32Array(max)
  const s1 = new Float32Array(max)
  const a0 = new Float32Array(max)
  const grav = new Float32Array(max)
  const drag = new Float32Array(max)
  let next = 0
  let budget = 1 // graphics preset particle scale
  let carry = 0

  const c = new Color()
  function emit(x, y, z, vx, vy, vz, { life: l = 1, size: sa = 1, sizeEnd = sa, color = '#ffffff', alpha: al = 1, gravity = 0, drag: dr = 0 } = {}) {
    // Low presets drop a share of the emissions.
    carry += budget
    if (carry < 1) return
    carry -= 1
    const i = next
    next = (next + 1) % max
    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    vel[i * 3] = vx
    vel[i * 3 + 1] = vy
    vel[i * 3 + 2] = vz
    life[i] = span[i] = l
    s0[i] = sa
    s1[i] = sizeEnd
    a0[i] = al
    grav[i] = gravity
    drag[i] = dr
    c.set(color)
    tint[i * 3] = c.r
    tint[i * 3 + 1] = c.g
    tint[i * 3 + 2] = c.b
  }

  return {
    emit,
    setBudget(k) {
      budget = k
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0
          continue
        }
        life[i] -= dt
        const k = Math.max(0, life[i] / span[i]) // 1 -> 0
        const d = Math.exp(-drag[i] * dt)
        vel[i * 3] *= d
        vel[i * 3 + 1] = vel[i * 3 + 1] * d + grav[i] * dt
        vel[i * 3 + 2] *= d
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        size[i] = s1[i] + (s0[i] - s1[i]) * k
        alpha[i] = a0[i] * Math.min(1, k * 3) // fades over the last third
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.size.needsUpdate = true
      geo.attributes.alpha.needsUpdate = true
      geo.attributes.tint.needsUpdate = true
      uniforms.scale.value = pixelScale
    },
  }
}

// --- GPU sparkle fields --------------------------------------------------------------
const fieldVertex = /* glsl */ `
  attribute vec4 seed; // x,z offset, phase, speed
  uniform float time;
  uniform float height;
  uniform float size;
  uniform float scale;
  varying float vAlpha;
  void main() {
    float t = fract(seed.z + time * seed.w / height);
    vec3 p = position;
    p.y += t * height;
    p.x += sin(time * 1.3 + seed.z * 20.0) * 0.25;
    p.z += cos(time * 1.1 + seed.z * 17.0) * 0.25;
    vAlpha = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.65, 1.0, t)) * (0.6 + 0.4 * sin(time * 6.0 + seed.z * 40.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = size * (0.6 + seed.w * 0.25) * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const fieldFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 color;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(color * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }`

const fields = []
// Rising twinkles in a box (w x d) or a disc (radius) centred on (x, y, z).
export function createSparkleField(parent, { x = 0, y = 0, z = 0, radius = 3, w = 0, d = 0, height = 4, count = 40, color = '#ffffff', size = 0.5, speed = 1, seed = 1, sparkle = true, intensity = 1.6 }) {
  const rand = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const sd = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    if (w > 0) {
      pos[i * 3] = (rand() - 0.5) * w
      pos[i * 3 + 2] = (rand() - 0.5) * d
    } else {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * radius
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    pos[i * 3 + 1] = 0
    sd[i * 4 + 2] = rand()
    sd[i * 4 + 3] = speed * (0.6 + rand() * 0.8)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('seed', new BufferAttribute(sd, 4))
  const uniforms = {
    map: { value: sparkle ? sparkTex : dotTex },
    time: { value: 0 },
    height: { value: height },
    size: { value: size },
    scale: { value: pixelScale },
    color: { value: new Color(color).multiplyScalar(intensity) },
  }
  scaleUniforms.add(uniforms)
  const mat = new ShaderMaterial({ uniforms, vertexShader: fieldVertex, fragmentShader: fieldFragment, transparent: true, depthWrite: false, blending: AdditiveBlending })
  const pts = new Points(geo, mat)
  pts.position.set(x, y, z)
  pts.frustumCulled = false
  parent.add(pts)
  fields.push(uniforms)
  return pts
}

export function updateFields(elapsed) {
  for (const u of fields) u.time.value = elapsed
  for (const u of scaleUniforms) u.scale.value = pixelScale
}
