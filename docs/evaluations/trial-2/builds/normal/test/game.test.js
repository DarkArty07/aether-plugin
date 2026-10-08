import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, start, turn, tick, togglePause, restart } from '../src/game.js'

const key = (cell) => `${cell.x},${cell.y}`
const onSnake = (game, cell) => game.snake.some((c) => key(c) === key(cell))

test('a new game is ready, with a three-cell snake in the middle moving right, and food off the snake', () => {
  const g = createGame({ width: 20, height: 20, seed: 1 })
  assert.equal(g.status, 'ready')
  assert.deepEqual(g.snake, [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }])
  assert.equal(g.direction, 'right')
  assert.deepEqual([g.score, g.foodsEaten, g.level, g.tickMs, g.ticks], [0, 0, 1, 150, 0])
  assert.ok(g.food.x >= 0 && g.food.x < 20 && g.food.y >= 0 && g.food.y < 20)
  assert.equal(onSnake(g, g.food), false)
})

test('tick does nothing until the game starts, then moves the snake one cell', () => {
  const g = createGame({ seed: 1 })
  assert.deepEqual(tick(g), g)
  const moved = tick(start(g))
  assert.deepEqual(moved.snake, [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }])
  assert.equal(moved.ticks, 1)
})

test('the functions return new games and leave their input unchanged', () => {
  const g = start(createGame({ seed: 1 }))
  const copy = structuredClone(g)
  tick(g)
  turn(g, 'up')
  togglePause(g)
  restart(g)
  assert.deepEqual(g, copy)
})

test('a turn takes effect on the next tick, and reversing is ignored', () => {
  let g = start(createGame({ seed: 1 }))
  g = tick(turn(g, 'left'))
  assert.deepEqual(g.snake[0], { x: 11, y: 10 })
  g = tick(turn(g, 'up'))
  assert.deepEqual(g.snake[0], { x: 11, y: 9 })
  assert.equal(g.direction, 'up')
})

test('two quick turns are kept for the next two ticks', () => {
  let g = start(createGame({ seed: 1 }))
  g = turn(turn(g, 'up'), 'left')
  g = tick(g)
  assert.deepEqual(g.snake[0], { x: 10, y: 9 })
  g = tick(g)
  assert.deepEqual(g.snake[0], { x: 9, y: 9 })
})

test('eating grows the snake, scores 10 times the level, and puts new food on a free cell', () => {
  let g = start(createGame({ seed: 3 }))
  g = tick({ ...g, food: { x: 11, y: 10 } })
  assert.equal(g.snake.length, 4)
  assert.deepEqual(g.snake[0], { x: 11, y: 10 })
  assert.deepEqual([g.score, g.foodsEaten], [10, 1])
  assert.equal(onSnake(g, g.food), false)
})

test('every fifth food raises the level and speeds the game up, down to 60 ms', () => {
  let g = start(createGame({ seed: 5 }))
  for (let i = 0; i < 5; i++) {
    const head = g.snake[0]
    g = tick({ ...g, food: { x: head.x + 1, y: head.y } })
  }
  assert.deepEqual([g.level, g.tickMs, g.score], [2, 135, 50])
  const head = g.snake[0]
  g = tick({ ...g, tickMs: 65, foodsEaten: 9, food: { x: head.x + 1, y: head.y } })
  assert.deepEqual([g.level, g.tickMs], [3, 60])
})

test('hitting a wall ends the game, and the snake stays put', () => {
  let g = start(createGame({ width: 20, height: 20, seed: 1 }))
  for (let i = 0; i < 9; i++) g = tick(g)
  assert.equal(g.status, 'running')
  assert.equal(g.snake[0].x, 19)
  g = tick(g)
  assert.equal(g.status, 'over')
  assert.deepEqual(g.snake[0], { x: 19, y: 10 })
})

test('running into the body ends the game, but the cell the tail leaves is free', () => {
  const base = start(createGame({ seed: 1 }))
  const body = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }]
  let g = { ...base, snake: body, direction: 'left', queue: [], food: { x: 0, y: 0 } }
  assert.equal(tick(turn(g, 'down')).status, 'over')
  const square = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }]
  g = { ...base, snake: square, direction: 'left', queue: [], food: { x: 0, y: 0 } }
  const next = tick(turn(g, 'down'))
  assert.equal(next.status, 'running')
  assert.deepEqual(next.snake[0], { x: 5, y: 6 })
})

test('pause stops the ticks until the game resumes', () => {
  let g = togglePause(start(createGame({ seed: 1 })))
  assert.equal(g.status, 'paused')
  assert.deepEqual(tick(g), g)
  g = togglePause(g)
  assert.equal(g.status, 'running')
})

test('eating the last free cell wins the game', () => {
  const base = start(createGame({ width: 4, height: 4, seed: 1 }))
  const cells = [[1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [3, 0], [2, 0], [1, 0], [0, 0]]
  const snake = cells.map(([x, y]) => ({ x, y }))
  const g = tick({ ...base, snake, direction: 'left', queue: [], food: { x: 0, y: 3 } })
  assert.equal(g.status, 'won')
  assert.equal(g.snake.length, 16)
  assert.equal(g.food, null)
})

test('restart makes a new ready game on the same board', () => {
  const g = tick(start(createGame({ width: 12, height: 10, seed: 9 })))
  const r = restart(g)
  assert.equal(r.status, 'ready')
  assert.deepEqual([r.width, r.height, r.score, r.ticks, r.snake.length, r.level, r.tickMs], [12, 10, 0, 0, 3, 1, 150])
})

test('restart seeds the new game from the current random state', () => {
  const g = tick(start(createGame({ width: 12, height: 10, seed: 9 })))
  assert.equal(restart(g).seed, g.rng)
})

test('createGame without an argument uses the defaults of the spec', () => {
  const g = createGame()
  assert.deepEqual([g.width, g.height, g.seed, g.status], [20, 20, 1, 'ready'])
  assert.deepEqual(g.snake[0], { x: 10, y: 10 })
  assert.deepEqual(g, createGame({}))
})
