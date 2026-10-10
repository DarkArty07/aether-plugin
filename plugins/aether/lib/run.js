'use strict'

// Ids, locations and records for Aether runs.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const TASK_ID = /^task-\d+$/
// Anchored to the worktree's root, so a project folder of the same name deeper down stays visible.
const EXCLUDES = ['/.aether/', '/.aether-tmp/']
// The unanchored lines earlier versions wrote, and what replaces each.
const LEGACY_EXCLUDES = { '.aether/': '/.aether/', '.aether-tmp/': '/.aether-tmp/' }

function isRunId(id) {
  return RUN_ID.test(String(id))
}

function assertRunId(id) {
  if (!isRunId(id)) throw new Error(`invalid run id: ${id}`)
}

function assertTaskId(id) {
  if (!TASK_ID.test(String(id))) throw new Error(`invalid task id: ${id}`)
}

function newRunId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${date}-${time}-${crypto.randomBytes(2).toString('hex')}`
}

function aetherDir(mainRoot) {
  return path.join(mainRoot, '.aether')
}

function runDir(mainRoot, runId) {
  return path.join(aetherDir(mainRoot), 'runs', runId)
}

function worktreesDir(mainRoot, runId) {
  return path.join(aetherDir(mainRoot), 'worktrees', runId)
}

function unitWorktree(mainRoot, runId, taskId) {
  return path.join(worktreesDir(mainRoot, runId), taskId)
}

function unitBranch(runId, taskId) {
  return `aether/${runId}/${taskId}`
}

function toId(s) {
  return String(s).replace(/[^A-Za-z0-9_-]/g, '-')
}

function safeRealpath(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

function dataDir(env = process.env, root = path.join(__dirname, '..')) {
  if (env && env.AETHER_DATA_DIR) return env.AETHER_DATA_DIR

  const configDir = (env && env.CLAUDE_CONFIG_DIR) || path.join(os.homedir(), '.claude')
  const pluginsRoot = (env && env.CLAUDE_CODE_PLUGIN_CACHE_DIR) || path.join(configDir, 'plugins')

  const realPluginsRoot = safeRealpath(pluginsRoot)
  const realPluginRoot = safeRealpath(root)
  const cacheDir = path.join(realPluginsRoot, 'cache')
  const rel = path.relative(cacheDir, realPluginRoot)

  let id = toId('aether@inline')
  if (!rel.startsWith('..') && !path.isAbsolute(rel) && rel !== '') {
    const parts = rel.split(path.sep)
    if (parts.length === 3 && parts.every((p) => p && p !== '.' && p !== '..')) {
      const [marketplace, plugin] = parts
      id = toId(`${plugin}@${marketplace}`)
    }
  }

  return path.join(pluginsRoot, 'data', id)
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function appendRecord(record, dir = dataDir()) {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, 'runs.jsonl'), JSON.stringify(record) + '\n')
}

// Keeps Aether's directories out of git without touching the project's .gitignore.
function ensureExcluded(gitCommonDir) {
  const file = path.join(gitCommonDir, 'info', 'exclude')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const lines = current === '' ? [] : current.replace(/\n$/, '').split('\n')
  const updated = lines.map((line) => LEGACY_EXCLUDES[line.trim()] || line)
  const present = new Set(updated.map((line) => line.trim()))
  const missing = EXCLUDES.filter((pattern) => !present.has(pattern))
  if (missing.length === 0 && updated.every((line, i) => line === lines[i])) return
  fs.writeFileSync(file, [...updated, ...missing].join('\n') + '\n')
}

module.exports = {
  isRunId,
  assertRunId,
  assertTaskId,
  newRunId,
  aetherDir,
  runDir,
  worktreesDir,
  unitWorktree,
  unitBranch,
  dataDir,
  writeJson,
  readJson,
  appendRecord,
  ensureExcluded,
}
