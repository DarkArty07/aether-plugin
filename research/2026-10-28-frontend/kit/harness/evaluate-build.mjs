// Plays one Snake 3D build in headless Chromium and records what a player would see.
// usage: node evaluate-build.mjs <build dir> <out dir> <label> <port>
// The build must have node_modules (npm ci). Writes <out>/<label>-*.png and <out>/<label>.json.
//
// Software rendering (SwiftShader) draws a bloom-heavy scene at a few frames per second, so the page's
// clock is controlled: the harness advances game time in steps, and the game does exactly what it
// would do in that time, however slowly each frame is drawn.
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [buildDir, outDir, label, portArg] = process.argv.slice(2)
const port = Number(portArg)
const here = path.dirname(new URL(import.meta.url).pathname)
const CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
fs.mkdirSync(outDir, { recursive: true })

const server = spawn(process.execPath, [path.join(here, 'serve.mjs'), buildDir, String(port)], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 800))
const base = `http://localhost:${port}/?seed=7`
const result = { label, checks: {}, metrics: {}, consoleErrors: [], pageErrors: [], notes: [] }
const check = (name, ok, detail) => {
  result.checks[name] = Boolean(ok)
  if (detail !== undefined) result.notes.push(`${name}: ${detail}`)
}
const shot = (name) => path.join(outDir, `${label}-${name}.png`)

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

function watch(page) {
  page.on('pageerror', (e) => result.pageErrors.push(e.message.slice(0, 300)))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && result.consoleErrors.push(m.text().slice(0, 300)))
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && result.consoleErrors.push(`HTTP ${r.status()} ${r.url()}`))
}

// Opens the game with a fake clock, paused once the debug API is up.
async function open(viewport, extra = {}) {
  const context = await browser.newContext({ viewport, ...extra })
  const page = await context.newPage()
  watch(page)
  await page.clock.install({ time: 0 })
  await page.goto(base)
  const loaded = await page.waitForFunction(() => window.snake && window.snake.getState, null, { timeout: 30000, polling: 100 }).then(() => true, () => false)
  if (loaded) await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
  return { context, page, loaded }
}

const state = (page) => page.evaluate(() => window.snake.getState())
const run = (page, ms) => page.clock.runFor(Math.max(1, Math.round(ms)))

async function runUntil(page, predicate, maxMs, stepMs = 50) {
  for (let t = 0; t < maxMs; t += stepMs) {
    const s = await state(page)
    if (predicate(s)) return s
    await run(page, stepMs)
  }
  const s = await state(page)
  return predicate(s) ? s : null
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

// Shortest safe first step toward the food (breadth-first), or any safe step.
function chooseDirection(s, body) {
  const blocked = new Set(body.slice(0, -1).map((c) => `${c.x},${c.y}`))
  const inside = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height
  const options = Object.keys(DIRS).filter((d) => d !== OPPOSITE[s.direction])
  if (s.food) {
    const seen = new Map([[`${s.head.x},${s.head.y}`, null]])
    const queue = [[s.head.x, s.head.y]]
    while (queue.length) {
      const [x, y] = queue.shift()
      if (x === s.food.x && y === s.food.y) {
        let k = `${x},${y}`
        let first = null
        while (seen.get(k)) {
          first = seen.get(k)
          k = first.from
        }
        if (first && options.includes(first.dir)) return first.dir
        break
      }
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        const nx = x + dx
        const ny = y + dy
        const k = `${nx},${ny}`
        if (!inside(nx, ny) || blocked.has(k) || seen.has(k)) continue
        if (x === s.head.x && y === s.head.y && !options.includes(dir)) continue
        seen.set(k, { dir, from: `${x},${y}` })
        queue.push([nx, ny])
      }
    }
  }
  const safe = (d) => inside(s.head.x + DIRS[d][0], s.head.y + DIRS[d][1]) && !blocked.has(`${s.head.x + DIRS[d][0]},${s.head.y + DIRS[d][1]}`)
  return options.find((d) => d === s.direction && safe(d)) || options.find(safe) || s.direction
}

// Plays for gameMs of game time, deciding once per tick. Returns what happened.
async function autopilot(page, { gameMs, onEat, onTicks }) {
  const body = []
  let lastTicks = -1
  let lastScore = (await state(page)).score
  let foods = 0
  let maxLevel = 1
  let s = await state(page)
  for (let t = 0; t < gameMs && s.status === 'running'; ) {
    if (s.ticks !== lastTicks) {
      body.unshift({ ...s.head })
      body.length = s.length
      lastTicks = s.ticks
      const dir = chooseDirection(s, body)
      if (dir !== s.direction) await page.keyboard.press(KEY[dir])
      if (onTicks) await onTicks(s)
    }
    const step = s.tickMs / 2
    await run(page, step)
    t += step
    s = await state(page)
    maxLevel = Math.max(maxLevel, s.level)
    if (s.score > lastScore) {
      foods++
      lastScore = s.score
      if (onEat) await onEat(s, foods)
    }
  }
  return { foods, maxLevel, final: s }
}

try {
  // 1. Mechanics, in a small window so that software rendering keeps up.
  {
    const { context, page, loaded } = await open({ width: 480, height: 270 })
    check('loads with the debug API', loaded)
    if (loaded) {
      await run(page, 500)
      check('starts on the title screen', (await state(page)).status === 'ready')
      await page.keyboard.press('Enter')
      check('Enter starts the game', Boolean(await runUntil(page, (s) => s.status === 'running', 1000)))
      const play = await autopilot(page, { gameMs: 40000 })
      result.metrics.foodsEaten = play.foods
      result.metrics.maxLevel = play.maxLevel
      result.metrics.scoreAfterAutopilot = play.final.score
      check('the snake eats and grows', play.foods > 0 && play.final.length > 3, `${play.foods} foods, length ${play.final.length}`)
      check('levels up after 5 foods, faster', play.maxLevel >= 2 && play.final.tickMs < 150, `level ${play.maxLevel}, tickMs ${play.final.tickMs}`)
      let s = await state(page)
      if (s.status === 'running') {
        await page.keyboard.press('Space')
        await run(page, 400)
        const a = await state(page)
        await run(page, 600)
        const b = await state(page)
        check('Space pauses, and the snake stops', a.status === 'paused' && a.ticks === b.ticks, `${a.status}, ticks ${a.ticks} then ${b.ticks}`)
        await page.keyboard.press('Space')
        check('Space resumes', Boolean(await runUntil(page, (x) => x.status === 'running', 1000)))
      } else {
        check('Space pauses, and the snake stops', false, `the game was ${s.status} after the autopilot`)
      }
      s = await state(page)
      if (s.status === 'running') {
        const dist = { up: s.head.y, down: s.height - 1 - s.head.y, left: s.head.x, right: s.width - 1 - s.head.x }
        const dir = Object.keys(dist).filter((d) => d !== OPPOSITE[s.direction]).sort((p, q) => dist[p] - dist[q])[0]
        if (dir !== s.direction) await page.keyboard.press(KEY[dir])
      }
      const over = await runUntil(page, (x) => x.status === 'over' || x.status === 'won', 8000)
      check('hitting a wall ends the game', Boolean(over))
      if (over) {
        check('the high score keeps the best score', over.highScore >= over.score && (over.score === 0 || over.highScore > 0), `score ${over.score}, best ${over.highScore}`)
        await run(page, 900)
        await page.keyboard.press('Enter')
        const again = await runUntil(page, (x) => x.status === 'running' && x.score === 0, 1000)
        const after = await state(page)
        check('Enter starts a new game at once', Boolean(again), `status ${after.status}, score ${after.score}`)
        await run(page, 300)
        check('the high score survives a new game', (await state(page)).highScore >= over.score)
      }
    }
    await context.close()
  }

  // 2. What a desktop player sees, at full size: title, play, eating, pause, game over.
  {
    const { context, page, loaded } = await open({ width: 1280, height: 720 })
    if (loaded) {
      await run(page, 1200)
      await page.screenshot({ path: shot('01-ready'), timeout: 300000 })
      await page.keyboard.press('Enter')
      await runUntil(page, (s) => s.status === 'running', 1000)
      let playShot = false
      await autopilot(page, {
        gameMs: 6000,
        onTicks: async (s) => {
          if (!playShot && s.ticks >= 12) {
            playShot = true
            await page.screenshot({ path: shot('02-play'), timeout: 300000 })
          }
        },
        onEat: async (s, n) => {
          if (n === 1) {
            await run(page, 120)
            await page.screenshot({ path: shot('03-eat'), timeout: 300000 })
          }
        },
      })
      result.metrics.renderInfo = await page.evaluate(() => window.snake.getRenderInfo())
      let s = await state(page)
      if (s.status === 'running') {
        await page.keyboard.press('Space')
        await run(page, 400)
        await page.screenshot({ path: shot('05-paused'), timeout: 300000 })
        await page.keyboard.press('Space')
        await run(page, 100)
        s = await state(page)
        const dist = { up: s.head.y, down: s.height - 1 - s.head.y, left: s.head.x, right: s.width - 1 - s.head.x }
        const dir = Object.keys(dist).filter((d) => d !== OPPOSITE[s.direction]).sort((p, q) => dist[p] - dist[q])[0]
        if (dir !== s.direction) await page.keyboard.press(KEY[dir])
      }
      if (await runUntil(page, (x) => x.status === 'over' || x.status === 'won', 8000)) {
        await run(page, 900)
        await page.screenshot({ path: shot('06-over'), timeout: 300000 })
      }
      // Real-time frame rate in software rendering, as a measure of how heavy the scene is.
      await page.clock.resume()
      result.metrics.fps = await page.evaluate(() => new Promise((resolve) => {
        let n = 0
        const t0 = performance.now()
        const f = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : resolve(Math.round((n / ((performance.now() - t0) / 1000)) * 10) / 10))
        requestAnimationFrame(f)
      }))
    }
    await context.close()
  }

  // 2b. Motion (added 2026-10-28): frames 80 ms apart while playing, and the effects of the first food
  // at 0, 100, 250, 450 and 700 ms, so a grader can judge animation, not only still frames.
  {
    const { context, page, loaded } = await open({ width: 1280, height: 720 })
    if (loaded) {
      await run(page, 800)
      await page.keyboard.press('Enter')
      await runUntil(page, (s) => s.status === 'running', 1000)
      let moved = false
      let fx = false
      await autopilot(page, {
        gameMs: 8000,
        onTicks: async (s) => {
          if (!moved && s.ticks >= 6) {
            moved = true
            for (let i = 0; i < 4; i++) {
              await page.screenshot({ path: shot(`11-move-${i}`), timeout: 300000 })
              await run(page, 80)
            }
          }
        },
        onEat: async (s, n) => {
          if (n === 1 && !fx) {
            fx = true
            let at = 0
            for (const [i, t] of [0, 100, 250, 450, 700].entries()) {
              await run(page, Math.max(1, t - at))
              at = t
              await page.screenshot({ path: shot(`10-fx-${i}`), timeout: 300000 })
            }
          }
        },
      })
    }
    await context.close()
  }

  // 3. A phone, portrait.
  {
    const { context, page, loaded } = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true })
    check('loads on a phone screen', loaded)
    if (loaded) {
      await run(page, 1200)
      await page.screenshot({ path: shot('07-phone-ready'), timeout: 300000 })
      await page.keyboard.press('Enter')
      await runUntil(page, (s) => s.status === 'running', 1000)
      let phoneShot = false
      await autopilot(page, {
        gameMs: 3000,
        onTicks: async (s) => {
          if (!phoneShot && s.ticks >= 10) {
            phoneShot = true
            await page.screenshot({ path: shot('08-phone-play'), timeout: 300000 })
          }
        },
      })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.documentElement.scrollHeight > window.innerHeight)
      check('no scrollbars on a phone', !overflow)
    }
    await context.close()
  }
} catch (err) {
  result.notes.push(`harness error: ${err.message.split('\n')[0]}`)
} finally {
  await browser.close()
  server.kill()
}
result.passed = Object.values(result.checks).filter(Boolean).length
result.total = Object.keys(result.checks).length
fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(result, null, 1))
console.log(JSON.stringify({ label, passed: result.passed, total: result.total, metrics: result.metrics, errors: result.pageErrors.length + result.consoleErrors.length }))
