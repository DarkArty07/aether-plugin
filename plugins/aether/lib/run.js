'use strict'

// Ids, locations and records for Aether runs.
// Family: none.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { readJson } = require('./common.js')

const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const TASK_ID = /^task-\d+$/
// Anchored to the worktree's root, so a project folder of the same name deeper down stays visible.
const EXCLUDES = ['/.aether/', '/.aether-tmp/', '/.aether-exam/']

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

function tmpDir(base) {
  return path.join(aetherDir(base), 'tmp')
}

function laneCopiesDir(mainRoot) {
  return path.join(aetherDir(mainRoot), 'worktrees', 'lanes')
}

function examCopiesDir(mainRoot) {
  return path.join(aetherDir(mainRoot), 'worktrees', 'exams')
}

function workDir(mainRoot, kind, id) {
  return path.join(aetherDir(mainRoot), 'work', kind, id)
}

function runDir(mainRoot, runId) {
  return path.join(aetherDir(mainRoot), 'runs', runId)
}

function stuckDir(mainRoot, runId) {
  return path.join(runDir(mainRoot, runId), 'stuck')
}

function stuckFile(mainRoot, runId, taskId) {
  return path.join(stuckDir(mainRoot, runId), `${taskId}.json`)
}

function heartbeatFile(mainRoot, runId) {
  return path.join(runDir(mainRoot, runId), 'heartbeat.json')
}

function launchEndFile(mainRoot, runId) {
  return path.join(runDir(mainRoot, runId), 'launch-end.json')
}

function stuckPayloadFile(mainRoot, runId, taskId) {
  return path.join(runDir(mainRoot, runId), 'ladder', `${taskId}-stuck.json`)
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

// The data directories of the installed release and of a development tree. A run relaunched from the other one keeps
// its records there (issues 107 and 114), so a reader sums the directories of every install.
const PLUGIN_DATA_IDS = ['aether-aether-plugin', 'aether-inline']

// The data directories a reader sums: the given one first, then the other installs' beside it when it sits under a
// plugins data root. Only the given one otherwise. A writer writes to the given one alone.
function installDirs(dataDir) {
  const root = path.dirname(dataDir)
  if (path.basename(root) !== 'data') return [dataDir]
  return [...new Set([dataDir, ...PLUGIN_DATA_IDS.map((id) => path.join(root, id))])]
}

function writeJson(file, value) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const temporary = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`)
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n')
    fs.renameSync(temporary, file)
  } catch (err) {
    try {
      fs.unlinkSync(temporary)
    } catch {
      // The temporary file may not exist; the target is left intact either way.
    }
    throw err
  }
}

// The units every launch of a run has selected, by task id. A relaunch rewrites graph.json with the
// units it selected alone, so units.json keeps the others: each compile only adds to it (issue #111).
function readUnits(dir) {
  const file = path.join(dir, 'units.json')
  return fs.existsSync(file) ? readJson(file) : {}
}

function extendUnits(dir, tasks) {
  writeJson(path.join(dir, 'units.json'), { ...readUnits(dir), ...tasks })
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
  const present = new Set(lines.map((line) => line.trim()))
  const missing = EXCLUDES.filter((pattern) => !present.has(pattern))
  if (missing.length === 0) return
  fs.writeFileSync(file, [...lines, ...missing].join('\n') + '\n')
}

module.exports = {
  EXCLUDES,
  isRunId,
  assertRunId,
  assertTaskId,
  newRunId,
  aetherDir,
  tmpDir,
  laneCopiesDir,
  examCopiesDir,
  workDir,
  runDir,
  stuckDir,
  stuckFile,
  heartbeatFile,
  launchEndFile,
  stuckPayloadFile,
  worktreesDir,
  unitWorktree,
  unitBranch,
  dataDir,
  installDirs,
  writeJson,
  readJson,
  readUnits,
  extendUnits,
  appendRecord,
  ensureExcluded,
  toId,
  safeRealpath,
}
