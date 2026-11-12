import { ACESFilmicToneMapping, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { CARS } from '../config.js'
import { buildTruck } from '../truck.js'

// Pictures of every truck for the Cars window: built once on first use with a
// small throwaway renderer (its own GL context, released right after), each
// truck drawn in a 3/4 front view on a transparent background -> data URL.
let cache = null

export function truckThumbs() {
  if (cache) return cache
  cache = {}
  let renderer
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  } catch {
    return cache // no WebGL: the window shows the cards without pictures
  }
  const W = 360
  const H = 280
  renderer.setPixelRatio(1)
  renderer.setSize(W, H, false)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  scene.add(new HemisphereLight('#ffffff', '#6a7080', 2.2))
  const sun = new DirectionalLight('#ffffff', 2.6)
  sun.position.set(4, 8, 6)
  scene.add(sun)
  const camera = new PerspectiveCamera(30, W / H, 0.1, 100)
  camera.position.set(-5.9, 3.7, 6.9)
  camera.lookAt(0, 1.45, 0)
  for (const [id, car] of Object.entries(CARS)) {
    const t = buildTruck(car.paint)
    t.root.rotation.y = 0.15
    scene.add(t.root)
    renderer.render(scene, camera)
    cache[id] = renderer.domElement.toDataURL('image/png')
    scene.remove(t.root)
  }
  renderer.dispose()
  renderer.forceContextLoss()
  return cache
}
