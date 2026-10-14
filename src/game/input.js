/**
 * Player input from keyboard and the on-screen touch controls.
 *
 * A plain mutable object read by the controller every frame. `jumpPressed` is an
 * edge flag the controller clears after handling, so a tap is never missed even
 * if it is shorter than a frame.
 */
export const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  jumpHeld: false,
  jumpPressed: false,
  /** Touch joystick, each axis in [-1, 1] (y is forward-positive). */
  joyX: 0,
  joyY: 0,
}

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

export function isTyping() {
  const el = document.activeElement
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
}

export function pressJump() {
  input.jumpPressed = true
  input.jumpHeld = true
}

export function releaseJump() {
  input.jumpHeld = false
}

export function resetInput() {
  input.up = input.down = input.left = input.right = false
  input.jumpHeld = false
  input.joyX = 0
  input.joyY = 0
}

/** Forward/strafe in [-1, 1], combining keys and joystick. */
export function moveAxes() {
  const forward = (input.up ? 1 : 0) - (input.down ? 1 : 0) + input.joyY
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.joyX
  const len = Math.hypot(forward, strafe)
  return len > 1 ? { forward: forward / len, strafe: strafe / len } : { forward, strafe }
}

let installed = false
export function installKeyboard() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return
    const action = KEYS[e.code]
    if (action) {
      input[action] = true
      e.preventDefault()
    } else if (e.code === 'Space') {
      if (!e.repeat) input.jumpPressed = true
      input.jumpHeld = true
      e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => {
    const action = KEYS[e.code]
    if (action) input[action] = false
    else if (e.code === 'Space') input.jumpHeld = false
  })
  // Alt-tabbing away mid-ride otherwise leaves a key stuck down.
  window.addEventListener('blur', resetInput)
}
