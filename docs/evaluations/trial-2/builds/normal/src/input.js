const COMMANDS = new Map([
  ['ArrowUp', 'up'], ['w', 'up'], ['W', 'up'],
  ['ArrowDown', 'down'], ['s', 'down'], ['S', 'down'],
  ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
  ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
  [' ', 'pause'], ['p', 'pause'], ['P', 'pause'], ['Escape', 'pause'],
  ['Enter', 'restart'], ['r', 'restart'], ['R', 'restart'],
])

export function keyToCommand(key) {
  return COMMANDS.get(key) ?? null
}

export function swipeToDirection(dx, dy, minDistance = 30) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minDistance) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

// Listens on target for game keys and touch swipes; returns detach().
export function attachInput(target, onCommand) {
  const passive = { passive: true }
  let start = null

  const onKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const command = keyToCommand(event.key)
    if (command === null) return
    event.preventDefault()
    if (event.repeat) return // a held key must not restart the game or flip the pause; turn() ignores its own direction anyway
    onCommand(command)
  }

  const onTouchStart = (event) => {
    const touch = event.touches?.[0]
    start = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const onTouchEnd = (event) => {
    const touch = event.changedTouches?.[0]
    if (!start || !touch) return
    const direction = swipeToDirection(touch.clientX - start.x, touch.clientY - start.y)
    start = null
    if (direction) onCommand(direction)
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('touchstart', onTouchStart, passive)
  target.addEventListener('touchend', onTouchEnd, passive)

  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('touchstart', onTouchStart)
    target.removeEventListener('touchend', onTouchEnd)
  }
}
