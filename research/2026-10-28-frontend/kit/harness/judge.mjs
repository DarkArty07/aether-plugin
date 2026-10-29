// Blind grading of the builds' screenshots by a fresh Opus session per build.
//   node judge.mjs <eval dir> <out dir> <round> <label>...
// Each label's pictures (<eval dir>/<label>/<label>-*.png) are copied as build-<letter>-*.png into a fresh
// folder, so the judge never sees which arm made them. The key is written to <out dir>/key-<round>.json.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'

const [evalDir, outDir, round, ...labels] = process.argv.slice(2)
fs.mkdirSync(outDir, { recursive: true })
const PICS = ['01-ready', '02-play', '03-eat', '06-over', '07-phone-ready', '11-move-0', '11-move-2', '10-fx-1', '10-fx-3']
const RUBRIC = `
Rubric, 1 to 10 per criterion:
| Criterion | 3-4 | 5-6 | 7-8 | 9-10 |
|---|---|---|---|---|
| Graphics quality | works; flat colors, default lighting | coherent palette, good light and shadows, readable | polished materials, post-processing used well, a cohesive HUD | striking, feels professional |
| Creativity | generic theme | recognizable theme, some touches | distinctive theme, several thoughtful effects, extras (sound, camera) | surprising ideas, well executed |
| Playability | playable with bugs | correct but plain | correct, smooth, clear feedback | excellent feel |
| 3D quality | basic boxes, default camera | solid 3D scene, shadows, smooth motion | rich 3D: modeled shapes, depth cues, effects in space | outstanding |
`
const letters = 'ABCDEFGHJK'.split('')
const order = labels.map((l) => [crypto.randomInt(1e9), l]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
const key = {}
for (const [i, label] of order.entries()) {
  const letter = letters[i]
  key[letter] = label
  const dir = fs.mkdtempSync(path.join(outDir, `r${round}-${letter}-`))
  const files = []
  for (const p of PICS) {
    const src = path.join(evalDir, label, `${label}-${p}.png`)
    if (!fs.existsSync(src)) continue
    const dst = path.join(dir, `build-${letter}-${p}.png`)
    fs.copyFileSync(src, dst)
    files.push(path.basename(dst))
  }
  const checks = JSON.parse(fs.readFileSync(path.join(evalDir, label, `${label}.json`), 'utf8'))
  const facts = {
    browserChecks: `${checks.passed}/${checks.total}`,
    failedChecks: Object.entries(checks.checks).filter(([, ok]) => !ok).map(([k]) => k),
    pageErrors: checks.pageErrors.length + checks.consoleErrors.length,
    foodsEatenByAutopilotIn40s: checks.metrics.foodsEaten,
  }
  const prompt = `You are grading one build of a browser game, "Snake 3D", blind. Its spec asks for the classic snake on a grid, rendered as a real 3D scene with three.js, that "should look and feel like a small, finished indie game, not a tech demo", judged on four criteria: graphics quality, creativity, playability and 3D quality. The owner adds: «El snake se tiene que ver bien visualmente, y estable para jugar» (it must look good and be stable to play).

The pictures in this folder are screenshots of build ${letter}, taken by an automated player in headless Chromium with software rendering:
- 01-ready: the title screen; 02-play: playing; 03-eat: 120 ms after eating; 06-over: game over; 07-phone-ready: a phone in portrait;
- 11-move-0 and 11-move-2: two frames 160 ms apart while moving;
- 10-fx-1 and 10-fx-3: 100 ms and 450 ms after eating, to show the eating effect.
Files: ${files.join(', ')}.

Facts from the automated player: ${JSON.stringify(facts)}. The 13 browser checks are: loads, title screen, Enter starts, eats and grows, levels up, Space pauses, Space resumes, a wall ends the game, high score, Enter starts a new game at once, high score survives, loads on a phone, no scrollbars on a phone.
${RUBRIC}
Read every picture with the Read tool. Grade only what the pictures and the facts show, never what the build might have. Be strict and calibrated: 5-6 is a competent, plain build; 7-8 is polished; 9-10 is rare.

Answer with only this JSON, no prose around it:
{"build": "${letter}", "graphics": <1-10>, "creativity": <1-10>, "playability": <1-10>, "threeD": <1-10>, "total": <sum>, "looksFinishedNotDemo": <true|false>, "strengths": ["..."], "weaknesses": ["..."], "oneLine": "<one sentence verdict>"}`
  const res = spawnSync('claude', ['-p', prompt, '--model', 'opus', '--effort', 'high', '--permission-mode', 'bypassPermissions', '--strict-mcp-config', '--output-format', 'json', '--settings', '{"enabledPlugins":{"superpowers@claude-plugins-official":false,"ecc@ecc":false,"aether@aether-plugin":false}}'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false' }, input: '', maxBuffer: 64 << 20, timeout: 900000 })
  let out = { build: letter, error: res.stderr && res.stderr.slice(0, 500) }
  try {
    const j = JSON.parse(res.stdout)
    const m = j.result.match(/\{[\s\S]*\}/)
    out = { ...JSON.parse(m[0]), costUsd: j.total_cost_usd }
  } catch (e) {
    out.parseError = String(e).slice(0, 200)
    out.raw = (res.stdout || '').slice(0, 2000)
  }
  fs.writeFileSync(path.join(outDir, `grade-${round}-${letter}.json`), JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ round, letter, total: out.total, cost: out.costUsd }))
}
fs.writeFileSync(path.join(outDir, `key-${round}.json`), JSON.stringify(key, null, 1))
