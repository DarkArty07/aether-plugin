import { randomInt } from './rng.js'

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
const MIN_BOARD = 4
const MAX_BOARD = 64
const START_TICK_MS = 150
const MIN_TICK_MS = 60
const TICK_STEP_MS = 15
const FOODS_PER_LEVEL = 5
const MAX_QUEUE = 2

const keyOf = (cell) => `${cell.x},${cell.y}`

function checkBoard(width, height) {
  const valid = (n) => Number.isInteger(n) && n >= MIN_BOARD && n <= MAX_BOARD
  if (!valid(width) || !valid(height)) {
    throw new Error(`invalid board: ${width}x${height}, each side must be an integer from ${MIN_BOARD} to ${MAX_BOARD}`)
  }
}

// Picks a random free cell (row by row, so the result depends only on the rng state).
function placeFood(width, height, snake, rng) {
  const occupied = new Set(snake.map(keyOf))
  const free = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!occupied.has(keyOf({ x, y }))) free.push({ x, y })
    }
  }
  if (free.length === 0) return { food: null, rng }
  const pick = randomInt(rng, free.length)
  return { food: free[pick.value], rng: pick.state }
}

function freshGame({ width, height, seed, rng }) {
  const head = { x: Math.floor(width / 2), y: Math.floor(height / 2) }
  const snake = [head, { x: head.x - 1, y: head.y }, { x: head.x - 2, y: head.y }]
  const placed = placeFood(width, height, snake, rng)
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

export function createGame({ width = 20, height = 20, seed = 1 } = {}) {
  checkBoard(width, height)
  return freshGame({ width, height, seed, rng: seed >>> 0 })
}

export function start(game) {
  return game.status === 'ready' ? { ...game, status: 'running' } : game
}

export function turn(game, direction) {
  if (game.status !== 'ready' && game.status !== 'running') return game
  if (!DIRECTIONS[direction] || game.queue.length >= MAX_QUEUE) return game
  const last = game.queue.length > 0 ? game.queue[game.queue.length - 1] : game.direction
  if (direction === last || OPPOSITE[last] === direction) return game
  return { ...game, queue: [...game.queue, direction] }
}

export function tick(game) {
  if (game.status !== 'running') return game

  const direction = game.queue.length > 0 ? game.queue[0] : game.direction
  const queue = game.queue.slice(1)
  const step = DIRECTIONS[direction]
  const head = { x: game.snake[0].x + step.x, y: game.snake[0].y + step.y }

  const leftBoard = head.x < 0 || head.x >= game.width || head.y < 0 || head.y >= game.height
  if (leftBoard) return { ...game, direction, queue, status: 'over' }

  const eating = game.food !== null && keyOf(head) === keyOf(game.food)
  // The tail moves away on a normal step, so its cell is free; on a meal it stays.
  const body = eating ? game.snake : game.snake.slice(0, -1)
  if (body.some((cell) => keyOf(cell) === keyOf(head))) {
    return { ...game, direction, queue, status: 'over' }
  }

  const snake = [head, ...body]
  const next = { ...game, direction, queue, snake, ticks: game.ticks + 1 }
  if (!eating) return next

  const foodsEaten = game.foodsEaten + 1
  const levelUp = foodsEaten % FOODS_PER_LEVEL === 0
  const placed = placeFood(game.width, game.height, snake, game.rng)
  return {
    ...next,
    score: game.score + 10 * game.level,
    foodsEaten,
    level: levelUp ? game.level + 1 : game.level,
    tickMs: levelUp ? Math.max(MIN_TICK_MS, game.tickMs - TICK_STEP_MS) : game.tickMs,
    food: placed.food,
    rng: placed.rng,
    status: placed.food === null ? 'won' : 'running',
  }
}

export function togglePause(game) {
  if (game.status === 'running') return { ...game, status: 'paused' }
  if (game.status === 'paused') return { ...game, status: 'running' }
  return game
}

export function restart(game) {
  return freshGame({ width: game.width, height: game.height, seed: game.rng, rng: game.rng })
}
