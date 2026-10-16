'use strict'

// Runs ONE real, headless Claude Code session of the Aether Lead (real model, real login) in a throwaway git
// repository and a throwaway data directory, with the plugin of a tree (or the installed release), and prints what the
// router did. It spends the owner's plan (paid-call, approved: «apruebo los gastos de prueba»).
//
//   node real-session.js --tag s1 --plugin <dir|installed> --prompt-file <file> [--options '{"router":"command"}']
//        [--effort low] [--budget 2] [--timeout 900] [--prewarm grok,agy] [--world <dir>]
//        [--key real|none|bad] [--seed-lanes] [--launcher] [--env NAME=value ...] [--cwd-sub <dir>]
//
// --key: real links the installed plugin's .env into the data directory (never copied); none leaves no key; bad writes a
//   key that OpenRouter rejects. --seed-lanes copies the owner's lane marks and readings, so the router sees the real
//   dry marks. --launcher starts the session with scripts/aether-lead, as the owner does.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
function flag(name) {
  return process.argv.includes(`--${name}`)
}
function all(name) {
  const out = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}`) out.push(process.argv[i + 1])
  })
  return out
}

const tag = arg('tag', 'real')
const pluginArg = arg('plugin', 'installed')
const promptFile = arg('prompt-file')
const options = JSON.parse(arg('options', '{}'))
const effort = arg('effort', 'low')
const budget = arg('budget', '2')
const timeoutS = Number(arg('timeout', '900'))
const prewarm = (arg('prewarm', '') || '').split(',').filter(Boolean)
const keyMode = arg('key', 'real')
const REPO = path.resolve(__dirname, '..', '..', '..', '..')
const REAL_DATA = path.join(os.homedir(), '.claude', 'plugins', 'data', 'aether-aether-plugin')
const INSTALLED_ENV = path.join(REAL_DATA, '.env')

const root = arg('world') || fs.mkdtempSync(path.join(os.tmpdir(), `aether-real-${tag}-`))
const work = path.join(root, 'work')
const data = path.join(root, 'data')
const logs = path.join(root, 'logs')
for (const d of [work, data, logs]) fs.mkdirSync(d, { recursive: true })

function git(...a) {
  return spawnSync('git', a, { cwd: work, encoding: 'utf8' })
}

if (!fs.existsSync(path.join(work, '.git'))) {
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'real@example.com')
  git('config', 'user.name', 'real')
  fs.mkdirSync(path.join(work, 'src'), { recursive: true })
  fs.mkdirSync(path.join(work, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(work, 'README.md'), '# shop-utils\n\nSmall helpers for a shop: money formatting, slugs and an HTTP getter.\n')
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'shop-utils', version: '1.0.0', scripts: { test: 'node --test tests/' } }, null, 2) + '\n')
  fs.writeFileSync(path.join(work, 'src', 'api.js'), "// HTTP getter\nasync function get(url) {\n  const res = await fetch(url)\n  return res.json()\n}\nmodule.exports = { get }\n")
  fs.writeFileSync(
    path.join(work, 'src', 'util.js'),
    "function formatMoney(cents, currency = 'USD') {\n  return `${currency} ${(cents / 100).toFixed(2)}`\n}\nfunction slug(text) {\n  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')\n}\nfunction clamp(n, lo, hi) {\n  return Math.min(hi, Math.max(lo, n))\n}\nmodule.exports = { formatMoney, slug, clamp }\n",
  )
  fs.writeFileSync(
    path.join(work, 'tests', 'util.test.js'),
    "const test = require('node:test')\nconst assert = require('node:assert/strict')\nconst { formatMoney, slug, clamp } = require('../src/util.js')\ntest('money', () => assert.equal(formatMoney(1234), 'USD 12.34'))\ntest('slug', () => assert.equal(slug(' Hello World! '), 'hello-world'))\ntest('clamp', () => assert.equal(clamp(9, 0, 5), 5))\n",
  )
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
}

if (keyMode === 'real' && fs.existsSync(INSTALLED_ENV) && !fs.existsSync(path.join(data, '.env'))) fs.symlinkSync(INSTALLED_ENV, path.join(data, '.env'))
if (keyMode === 'bad') fs.writeFileSync(path.join(data, '.env'), `OPENROUTER_API_KEY=sk-or-v1-${'0'.repeat(64)}\n`, { mode: 0o600 })
if (flag('seed-lanes') && fs.existsSync(path.join(REAL_DATA, 'lanes'))) fs.cpSync(path.join(REAL_DATA, 'lanes'), path.join(data, 'lanes'), { recursive: true })

const pluginDir = pluginArg === 'installed' ? null : path.resolve(pluginArg)
const sessionId = crypto.randomUUID()
const baseEnv = {
  PATH: `${path.dirname(process.execPath)}:${os.homedir()}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
  HOME: os.homedir(),
  TERM: 'dumb',
  DISABLE_AUTOUPDATER: '1',
  AETHER_DATA_DIR: data,
}
if (process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS) baseEnv.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS
for (const [name, value] of Object.entries(options)) baseEnv[`CLAUDE_PLUGIN_OPTION_${name.toUpperCase()}`] = String(value)
for (const pair of all('env')) {
  const eq = pair.indexOf('=')
  baseEnv[pair.slice(0, eq)] = pair.slice(eq + 1)
}

function routeBin() {
  if (pluginDir) return path.join(pluginDir, 'bin', 'aether-route')
  const base = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'aether-plugin', 'aether')
  const newest = fs.readdirSync(base).filter((v) => /^\d+\.\d+\.\d+$/.test(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop()
  return path.join(base, newest, 'bin', 'aether-route')
}

;(async () => {
  for (const harness of prewarm) {
    const r = spawnSync(process.execPath, [routeBin(), 'renew', '--harness', harness], { env: baseEnv, encoding: 'utf8', timeout: 120000 })
    console.log(`prewarm ${harness}:`, (r.stdout || r.stderr || '').trim().slice(0, 300))
  }
  const prompt = fs.readFileSync(promptFile, 'utf8')
  const common = ['-p', prompt, '--session-id', sessionId, '--output-format', 'json', '--max-budget-usd', String(budget)]
  let cmd
  let args
  if (flag('launcher')) {
    cmd = path.join(REPO, 'scripts', 'aether-lead')
    args = [...common]
    if (pluginDir) args.push('--plugin-dir', pluginDir)
  } else {
    cmd = path.join(os.homedir(), '.local', 'bin', 'claude')
    args = [...common, '--agent', 'aether:lead', '--effort', effort, '--dangerously-skip-permissions', '--settings', '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}']
    if (pluginDir) args.push('--plugin-dir', pluginDir)
  }
  const started = Date.now()
  const r = await new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: work, env: baseEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c))
    child.stderr.on('data', (c) => (stderr += c))
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutS * 1000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1)
  fs.writeFileSync(path.join(logs, 'stdout.json'), r.stdout)
  fs.writeFileSync(path.join(logs, 'stderr.txt'), r.stderr)
  let parsed = null
  try {
    parsed = JSON.parse(r.stdout)
  } catch {}
  console.log(JSON.stringify({ tag, sessionId, root, exit: r.code, elapsedS, plugin: pluginDir || 'installed', launcher: flag('launcher'), key: keyMode, options, effort }, null, 1))
  if (parsed) {
    console.log('RESULT TEXT:', String(parsed.result).slice(0, 3000))
    console.log('COST/USAGE:', JSON.stringify({ total_cost_usd: parsed.total_cost_usd, num_turns: parsed.num_turns, duration_ms: parsed.duration_ms, is_error: parsed.is_error, subtype: parsed.subtype }))
  } else {
    console.log('STDOUT (not JSON):', r.stdout.slice(0, 1500))
  }
  if (r.stderr.trim()) console.log('STDERR:', r.stderr.slice(-1500))
  console.log('--- inspect-world:')
  const ins = spawnSync(process.execPath, [path.join(__dirname, 'inspect-world.js'), root], { encoding: 'utf8' })
  console.log(ins.stdout || ins.stderr)
})()
