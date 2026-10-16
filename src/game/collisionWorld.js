import { getLayout } from '../shared/layout.js'
import { CollisionWorld } from './physics'

let world = null

/** The one collision world for the layout (player physics and camera). */
export function getCollisionWorld() {
  if (!world) world = new CollisionWorld(getLayout().boxes)
  return world
}
