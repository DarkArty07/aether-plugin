import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
const [dir, out] = process.argv.slice(2)
const server = spawn(process.execPath, ['serve.mjs', dir, '8191'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 700))
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('page: ' + e.message))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()))
await page.goto('http://localhost:8191/')
await page.waitForFunction(() => window.demo && window.demo.frames() > 20, null, { timeout: 60000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
console.log(JSON.stringify({ frames: await page.evaluate(() => window.demo.frames()), info: await page.evaluate(() => window.demo.info()), bursts: await page.evaluate(() => window.demo.bursts()), errors }))
await browser.close(); server.kill()
