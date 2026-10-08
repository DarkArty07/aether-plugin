const KEY_COMMANDS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  ' ': 'pause',
  p: 'pause',
  P: 'pause',
  Escape: 'pause',
  Enter: 'restart',
  r: 'restart',
  R: 'restart',
}

// Maps a keyboard key to a game command, or null for keys the game does not use.
export function keyToCommand(key) {
  const command = KEY_COMMANDS[key] ?? KEY_COMMANDS[String(key).toLowerCase()]
  return command ?? null
}

// Maps a swipe (dx, dy in pixels, y grows downwards) to the dominant direction.
export function swipeToDirection(dx, dy, minDistance = 30) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minDistance) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

// A touch that moves less than this, in pixels, is a tap.
const TAP_DISTANCE = 10

// Listens for game keys, swipes and taps on target, and returns detach(). It calls
// onCommand(command, source), where source is 'key' or 'touch'; a tap gives 'pause'.
export function attachInput(target, onCommand) {
  let start = null

  const onKeyDown = (event) => {
    // Shortcuts such as Ctrl+R belong to the browser.
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const command = keyToCommand(event.key)
    if (command === null) return
    event.preventDefault()
    // A held key repeats; that must not flap the pause or restart over and over.
    if (event.repeat && (command === 'pause' || command === 'restart')) return
    onCommand(command, 'key')
  }

  const onTouchStart = (event) => {
    const touch = event.touches?.[0]
    start = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const onTouchEnd = (event) => {
    const touch = event.changedTouches?.[0]
    if (!start || !touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    start = null
    const direction = swipeToDirection(dx, dy)
    if (direction) onCommand(direction, 'touch')
    else if (Math.hypot(dx, dy) < TAP_DISTANCE) onCommand('pause', 'touch')
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('touchstart', onTouchStart)
  target.addEventListener('touchend', onTouchEnd)

  return function detach() {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('touchstart', onTouchStart)
    target.removeEventListener('touchend', onTouchEnd)
  }
}
