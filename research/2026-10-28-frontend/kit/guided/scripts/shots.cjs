// Takes pictures of the game the way a player sees it, so you can look at your work.
//   npm run shots                 -> .aether-tmp/shots/*.png and a summary on stdout
//   npm run check:visual          -> the same, and exit 1 when the page errors, the frame is black or blown out,
//                                    or the game never starts. Before src/main.js exists it skips (exit 0).
// Options: --out <dir> (default .aether-tmp/shots), --root <dir> (default: the current directory).
// The page's clock is controlled, so game time advances exactly as in real time however slowly
// software rendering draws each frame.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

function loadPlaywright() {
  try {
    return require('playwright-core')
  } catch {
    return require(path.join(os.homedir(), '.cache/aether-exp-frontend/harness/node_modules/playwright-core'))
  }
}

const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const check = args.includes('--check')
const root = path.resolve(opt('--root', process.cwd()))
const out = path.resolve(root, opt('--out', '.aether-tmp/shots'))
const CHROME = process.env.CHROME || path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')

const hasGame = fs.existsSync(path.join(root, 'src/main.js')) && fs.existsSync(path.join(root, 'index.html'))
const previewParts = ['src/render/theme.js', 'src/render/world.js', 'src/render/snake-view.js', 'src/hud.js'].filter((p) => fs.existsSync(path.join(root, p)))
const preview = !hasGame && previewParts.length > 0 && fs.existsSync(path.join(root, 'scripts/preview.html'))
if (!hasGame && (check || !preview)) {
  console.log(JSON.stringify({ skipped: 'no index.html or src/main.js yet: the game cannot be played' }))
  process.exit(0)
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(root, url === '/' ? 'index.html' : url)
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
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

// Brightness of a PNG, measured in the page itself (no image library needed).
async function stats(page, buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 160
    c.height = 90
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, 160, 90)
    const d = g.getImageData(0, 0, 160, 90).data
    let sum = 0
    let sq = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      sum += l
      sq += l * l
    }
    const mean = sum / n
    return { mean: Math.round(mean), spread: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean))) }
  }, buffer.toString('base64'))
}

;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const server = await serve()
  const port = server.address().port
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const result = { shots: {}, errors: [], problems: [], renderInfo: null }
  const shots = []
  if (preview) {
    // Before src/main.js exists: scripts/preview.html draws the parts that do (theme, world, snake view, HUD).
    result.mode = `preview of ${previewParts.join(', ')}`
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
      const page = await context.newPage()
      page.on('pageerror', (e) => result.errors.push(`page error: ${e.message.slice(0, 300)}`))
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && result.errors.push(`console error: ${m.text().slice(0, 300)}`))
      await page.clock.install({ time: 0 })
      await page.goto(`http://127.0.0.1:${port}/scripts/preview.html`)
      const ok = await page.waitForFunction(() => window.preview && window.preview.ready, null, { timeout: 30000, polling: 100 }).then(() => true, () => false)
      if (!ok) result.problems.push('preview: the page did not start (see errors)')
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
      const take = async (name) => {
        const file = path.join(out, `preview-${name}.png`)
        const buf = await page.screenshot({ path: file, timeout: 300000 })
        result.shots[`preview-${name}`] = { file, ...(await stats(page, buf)) }
      }
      // The preview eats at 1000 ms and ends the game at 2500 ms of its own time.
      for (const [step, name] of [[900, '1-scene'], [250, '2-eat'], [350, '3-after-eat'], [1700, '4-over']]) {
        await page.clock.fastForward(step)
        await take(name)
      }
      if (await page.evaluate(() => typeof window.previewHud === 'function')) {
        await page.evaluate(() => window.previewHud('ready'))
        await page.clock.fastForward(100)
        await take('5-hud-ready')
        await page.evaluate(() => window.previewHud('over', true))
        await page.clock.fastForward(100)
        await take('6-hud-over')
      }
      await context.close()
    } catch (err) {
      result.problems.push(`shots error: ${err.message.split('\n')[0]}`)
    }
    await browser.close()
    server.close()
    console.log(JSON.stringify({ out, ...result }, null, 1))
    console.log(`\nThe game cannot be played yet, so these pictures show the parts that exist. Look at every picture with the Read tool (${out}/*.png) and compare it with your brief and specs/001-snake-3d/look.md.`)
    return
  }
  try {
    for (const [label, viewport, extra] of [['desktop', { width: 1280, height: 720 }, {}], ['phone', { width: 390, height: 844 }, { isMobile: true, hasTouch: true }]]) {
      const context = await browser.newContext({ viewport, ...extra })
      const page = await context.newPage()
      page.on('pageerror', (e) => result.errors.push(`page error: ${e.message.slice(0, 300)}`))
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && result.errors.push(`console error: ${m.text().slice(0, 300)}`))
      page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && result.errors.push(`HTTP ${r.status()} ${r.url()}`))
      await page.clock.install({ time: 0 })
      await page.goto(`http://127.0.0.1:${port}/?seed=7`)
      const loaded = await page.waitForFunction(() => window.snake && window.snake.getState, null, { timeout: 30000, polling: 100 }).then(() => true, () => false)
      if (!loaded) {
        result.problems.push(`${label}: window.snake.getState never appeared (the game did not boot)`)
        await page.screenshot({ path: path.join(out, `${label}-boot.png`) })
        shots.push([`${label}-boot`, page])
        await context.close()
        continue
      }
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
      const state = () => page.evaluate(() => window.snake.getState())
      // fastForward draws one frame per jump instead of every 16 ms: four times faster in software rendering.
      const run = (ms) => page.clock.fastForward(Math.max(1, Math.round(ms)))
      const take = async (name) => {
        const file = path.join(out, `${label}-${name}.png`)
        const buf = await page.screenshot({ path: file, timeout: 300000 })
        const s = await stats(page, buf)
        result.shots[`${label}-${name}`] = { file, ...s }
        if (s.mean < 6 && s.spread < 4) result.problems.push(`${label}-${name}: the frame is black (mean ${s.mean})`)
        if (s.mean > 235) result.problems.push(`${label}-${name}: the frame is blown out to white (mean ${s.mean})`)
      }
      await run(1200)
      await take('1-title')
      await page.keyboard.press('Enter')
      await run(200)
      if ((await state()).status !== 'running') result.problems.push(`${label}: Enter did not start the game (status ${(await state()).status})`)
      const body = []
      let lastTicks = -1
      let lastScore = (await state()).score
      let playShot = false
      let eatShot = false
      for (let t = 0; t < (label === 'desktop' ? 5000 : 1800); ) {
        const s = await state()
        if (s.status !== 'running') break
        if (s.ticks !== lastTicks) {
          body.unshift({ ...s.head })
          body.length = s.length
          lastTicks = s.ticks
          const dir = chooseDirection(s, body)
          if (dir !== s.direction) await page.keyboard.press(KEY[dir])
          if (!playShot && s.ticks >= 10) {
            playShot = true
            await take('2-play')
          }
        }
        if (s.score > lastScore && !eatShot && label === 'desktop') {
          eatShot = true
          await run(120)
          await take('3-eat')
        }
        lastScore = s.score
        await run(s.tickMs / 2)
        t += s.tickMs / 2
      }
      if (label === 'desktop') {
        result.renderInfo = await page.evaluate(() => (window.snake.getRenderInfo ? window.snake.getRenderInfo() : null))
        let s = await state()
        if (s.status === 'running') {
          const dist = { up: s.head.y, down: s.height - 1 - s.head.y, left: s.head.x, right: s.width - 1 - s.head.x }
          const dir = Object.keys(dist).filter((d) => d !== OPPOSITE[s.direction]).sort((p, q) => dist[p] - dist[q])[0]
          if (dir !== s.direction) await page.keyboard.press(KEY[dir])
          for (let i = 0; i < 80 && (await state()).status === 'running'; i++) await run(100)
        }
        s = await state()
        if (s.status === 'over' || s.status === 'won') {
          await run(900)
          await take('4-over')
        } else {
          result.problems.push(`desktop: the snake hit no wall (status ${s.status})`)
        }
      }
      await context.close()
    }
  } catch (err) {
    result.problems.push(`shots error: ${err.message.split('\n')[0]}`)
  } finally {
    await browser.close()
    server.close()
  }
  const t = result.shots['desktop-1-title']
  const p = result.shots['desktop-2-play']
  if (t && p && t.mean === p.mean && t.spread === p.spread) result.problems.push('the title and play frames look the same: is anything moving?')
  console.log(JSON.stringify({ out, ...result }, null, 1))
  console.log(`\nLook at every picture with the Read tool (${out}/*.png) and compare it with your brief and specs/001-snake-3d/look.md.`)
  if (check && (result.errors.length || result.problems.length)) process.exit(1)
})()
