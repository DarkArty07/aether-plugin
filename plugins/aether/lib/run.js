'use strict'

// Ids, locations and records for Aether runs.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const TASK_ID = /^task-\d+$/
const EXCLUDES = ['.aether/', '.aether-tmp/']

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

function dataDir() {
  return process.env.AETHER_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'aether-plugin')
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function appendRecord(record) {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(path.join(dataDir(), 'runs.jsonl'), JSON.stringify(record) + '\n')
}

// Keeps Aether's directories out of git without touching the project's .gitignore.
function ensureExcluded(gitCommonDir) {
  const file = path.join(gitCommonDir, 'info', 'exclude')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const present = new Set(current.split('\n').map((line) => line.trim()))
  const missing = EXCLUDES.filter((pattern) => !present.has(pattern))
  if (missing.length === 0) return
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  fs.appendFileSync(file, separator + missing.join('\n') + '\n')
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
