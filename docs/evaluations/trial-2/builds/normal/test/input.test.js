import test from 'node:test'
import assert from 'node:assert/strict'
import { keyToCommand, swipeToDirection, attachInput } from '../src/input.js'

test('keyToCommand maps the arrows, WASD, pause and restart keys', () => {
  const cases = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', S: 'down', a: 'left', D: 'right', ' ': 'pause', p: 'pause', Enter: 'restart', r: 'restart', x: null, Shift: null }
  for (const [key, command] of Object.entries(cases)) assert.equal(keyToCommand(key), command, key)
})

test('swipeToDirection follows the dominant axis and ignores short swipes', () => {
  assert.equal(swipeToDirection(50, 10), 'right')
  assert.equal(swipeToDirection(-50, 20), 'left')
  assert.equal(swipeToDirection(5, -60), 'up')
  assert.equal(swipeToDirection(0, 45), 'down')
  assert.equal(swipeToDirection(10, 12), null)
  assert.equal(swipeToDirection(20, 0, 15), 'right')
})

// Stands in for window: records the listeners and fires plain event objects at them.
function fakeTarget() {
  const listeners = {}
  return {
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn)
    },
    fire: (type, event) => (listeners[type] || []).forEach((fn) => fn(event)),
  }
}

test('attachInput sends the commands of game keys, prevents their default, and detaches', () => {
  const target = fakeTarget()
  const commands = []
  let prevented = 0
  const press = (key) => target.fire('keydown', { key, preventDefault: () => prevented++ })
  const detach = attachInput(target, (command) => commands.push(command))
  press('ArrowUp')
  press('q')
  press(' ')
  assert.deepEqual(commands, ['up', 'pause'])
  assert.equal(prevented, 2)
  detach()
  press('ArrowDown')
  assert.deepEqual(commands, ['up', 'pause'])
})

test('attachInput turns a swipe into a direction', () => {
  const target = fakeTarget()
  const commands = []
  attachInput(target, (command) => commands.push(command))
  target.fire('touchstart', { touches: [{ clientX: 100, clientY: 100 }] })
  target.fire('touchend', { changedTouches: [{ clientX: 100, clientY: 20 }] })
  assert.deepEqual(commands, ['up'])
})

test('attachInput leaves browser shortcuts with Ctrl, Meta or Alt alone', () => {
  const target = fakeTarget()
  const commands = []
  let prevented = 0
  attachInput(target, (command) => commands.push(command))
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    target.fire('keydown', { key: 'r', [modifier]: true, preventDefault: () => prevented++ })
  }
  assert.deepEqual(commands, [])
  assert.equal(prevented, 0)
})

test('attachInput ignores the auto-repeat of a held game key but still prevents its default', () => {
  const target = fakeTarget()
  const commands = []
  let prevented = 0
  attachInput(target, (command) => commands.push(command))
  const press = (key, repeat) => target.fire('keydown', { key, repeat, preventDefault: () => prevented++ })
  press('ArrowRight', false)
  press('ArrowRight', true)
  press(' ', false)
  press(' ', true)
  press(' ', true)
  assert.deepEqual(commands, ['right', 'pause'])
  assert.equal(prevented, 5)
  press('q', true)
  assert.deepEqual(commands, ['right', 'pause'])
  assert.equal(prevented, 5)
})
