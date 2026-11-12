import { WEAPON_BUILD, WEAPON_FOOT, WEAPON_INTRO } from './weapons.js'
import { ENEMY_BUILD, ENEMY_FOOT, ENEMY_INTRO } from './enemies.js'
import { FLOOR_BUILD, FLOOR_FOOT, FLOOR_INTRO, HOLES } from './floors.js'

// The newer slot hazards (weapons, enemies, floors), merged into obstacles.js's
// tables: builder, footprint along the lane, island holes and the NEW! sign text.
export const NEW_BUILD = { ...WEAPON_BUILD, ...ENEMY_BUILD, ...FLOOR_BUILD }
export const NEW_FOOT = { ...WEAPON_FOOT, ...ENEMY_FOOT, ...FLOOR_FOOT }
export const NEW_HOLES = { ...HOLES }
export const NEW_INTRO = { ...WEAPON_INTRO, ...ENEMY_INTRO, ...FLOOR_INTRO }
