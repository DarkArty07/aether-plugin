// The snake rules. Pure: every function takes a game and returns a new one.
import { randomInt } from './rng.js'

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
})

const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' })
const MIN_SIZE = 4
const MAX_SIZE = 64
const MAX_QUEUE = 2
const FOODS_PER_LEVEL = 5
const START_TICK_MS = 150
const MIN_TICK_MS = 60
const TICK_STEP_MS = 15

const same = (a, b) => a.x === b.x && a.y === b.y

export function createGame({ width = 20, height = 20, seed = 1 } = {}) {
  for (const [name, size] of [['width', width], ['height', height]]) {
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      throw new Error(`invalid board: ${name} must be an integer from ${MIN_SIZE} to ${MAX_SIZE}, got ${size}`)
    }
  }
  const head = { x: Math.floor(width / 2), y: Math.floor(height / 2) }
  const snake = [head, { x: head.x - 1, y: head.y }, { x: head.x - 2, y: head.y }]
  const placed = placeFood({ width, height, snake, rng: seed >>> 0 })
  return {
    width,
    height,
    snake,
    direction: 'right',
    queue: [],
    food: placed.food,
    score: 0,
    foodsEaten: 0,
    level: 1,
    tickMs: START_TICK_MS,
    status: 'ready',
    rng: placed.rng,
    seed,
    ticks: 0,
  }
}

export function start(game) {
  return game.status === 'ready' ? { ...game, status: 'running' } : game
}

export function turn(game, direction) {
  if (game.status !== 'ready' && game.status !== 'running') return game
  const last = game.queue.length ? game.queue[game.queue.length - 1] : game.direction
  if (direction === last || direction === OPPOSITE[last]) return game
  if (game.queue.length >= MAX_QUEUE) return game
  return { ...game, queue: [...game.queue, direction] }
}

export function tick(game) {
  if (game.status !== 'running') return game
  const [queued, ...rest] = game.queue
  const direction = queued ?? game.direction
  const delta = DIRECTIONS[direction]
  const head = game.snake[0]
  const next = { x: head.x + delta.x, y: head.y + delta.y }

  const outside = next.x < 0 || next.y < 0 || next.x >= game.width || next.y >= game.height
  const eats = game.food !== null && same(next, game.food)
  // Without growth the tail leaves its cell this tick, so that cell is free.
  const body = eats ? game.snake : game.snake.slice(0, -1)
  if (outside || body.some((cell) => same(cell, next))) {
    return { ...game, direction, queue: rest, status: 'over' }
  }

  const snake = eats ? [next, ...game.snake] : [next, ...game.snake.slice(0, -1)]
  const base = { ...game, snake, direction, queue: rest, ticks: game.ticks + 1 }
  if (!eats) return base
  return eatFood(base)
}

function eatFood(game) {
  const foodsEaten = game.foodsEaten + 1
  const levelUp = foodsEaten % FOODS_PER_LEVEL === 0
  const level = levelUp ? game.level + 1 : game.level
  const tickMs = levelUp ? Math.max(MIN_TICK_MS, game.tickMs - TICK_STEP_MS) : game.tickMs
  const score = game.score + 10 * game.level
  const placed = placeFood(game)
  const status = placed.food === null ? 'won' : game.status
  return { ...game, foodsEaten, level, tickMs, score, food: placed.food, rng: placed.rng, status }
}

export function togglePause(game) {
  if (game.status === 'running') return { ...game, status: 'paused' }
  if (game.status === 'paused') return { ...game, status: 'running' }
  return game
}

export function restart(game) {
  return createGame({ width: game.width, height: game.height, seed: game.rng })
}

// Picks a random cell that the snake does not cover, or null when none is free.
function placeFood({ width, height, snake, rng }) {
  const free = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!snake.some((cell) => cell.x === x && cell.y === y)) free.push({ x, y })
    }
  }
  if (free.length === 0) return { food: null, rng }
  const picked = randomInt(rng, free.length)
  return { food: free[picked.value], rng: picked.state }
}
