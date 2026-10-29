// Re-encodes PNG screenshots as JPEG through Chromium: node to-jpeg.mjs <out dir> <png>...
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const [out, ...files] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
for (const f of files) {
  const b64 = fs.readFileSync(f).toString('base64')
  await page.setContent(`<html><body style="margin:0"><img src="data:image/png;base64,${b64}" style="display:block;width:1280px;height:720px"></body></html>`)
  await page.waitForFunction(() => document.images[0].complete)
  const dst = path.join(out, path.basename(f).replace(/\.png$/, '.jpg'))
  await page.screenshot({ path: dst, type: 'jpeg', quality: 80 })
  console.log(dst, fs.statSync(dst).size)
}
await browser.close()
