'use strict'

// Reads the models each harness offers without calling any model, and compares them against
// config/models/harness-models.json.
// Family: model.

const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readJsonOrNull } = require('./common.js')
const { commandInstalled } = require('./lane-process.js')

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'model-watch.json')
const DEFAULT_LANES_PATH = path.join(__dirname, '..', 'config', 'lanes.json')
const EFFORT_SUFFIX = /-(minimal|low|medium|high|xhigh|max|ultra)$/

function idsFromList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim())
    } else if (item && typeof item === 'object') {
      const id = item.id || item.slug || item.name
      if (typeof id === 'string' && id.trim()) out.push(id.trim())
    }
  }
  return out
}

function idsFromSection(section) {
  if (!section || typeof section !== 'object') return []
  if (Array.isArray(section)) return idsFromList(section)
  return Object.keys(section)
}

function unique(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

// Pure comparison between a harness's listed model ids and its entry in harness-models.json.
function compare(harnessName, listedIds, table) {
  const entry = table && table.harnesses && Object.hasOwn(table.harnesses, harnessName)
    ? table.harnesses[harnessName]
    : null
  if (!entry || typeof entry !== 'object') {
    return { new: unique(listedIds || []), retired: [] }
  }

  const modelIds = unique(idsFromList(entry.models))
  const modelSet = new Set(modelIds)
  const knownSet = new Set([
    ...modelIds,
    ...idsFromSection(entry.superseded),
    ...idsFromSection(entry.outOfScope),
    ...idsFromSection(entry.calledNotListed),
  ])

  const listed = unique(listedIds || [])
  const listedSet = new Set(listed)
  const listedBaseSet = new Set(listed.map((id) => id.replace(EFFORT_SUFFIX, '')))

  const added = []
  for (const id of listed) {
    if (knownSet.has(id)) continue
    const base = id.replace(EFFORT_SUFFIX, '')
    if (base !== id && modelSet.has(base)) continue
    added.push(id)
  }

  const retired = []
  for (const id of modelIds) {
    if (!listedSet.has(id) && !listedBaseSet.has(id)) retired.push(id)
  }

  return { new: added, retired }
}

function parseOutputIds(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return unique(idsFromList(parsed))
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.models)) {
        return unique(idsFromList(parsed.models))
      }
    } catch {
      // fall through to line-based parsing
    }
  }
  const out = []
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s+/, '')
    if (!line) continue
    const token = line.split(/\s+/)[0]
    if (token) out.push(token)
  }
  return unique(out)
}

function readCacheFile(fileTemplate, home) {
  const resolved = fileTemplate.startsWith('~/')
    ? path.join(home, fileTemplate.slice(2))
    : fileTemplate
  try {
    const raw = fs.readFileSync(resolved, 'utf8')
    const data = JSON.parse(raw)
    if (Array.isArray(data)) return { status: 'ok', ids: unique(idsFromList(data)) }
    if (data && typeof data === 'object' && Array.isArray(data.models)) {
      return { status: 'ok', ids: unique(idsFromList(data.models)) }
    }
    return { status: 'failed', reason: `unexpected format in ${resolved}` }
  } catch (err) {
    return { status: 'failed', reason: err && err.message ? err.message : String(err) }
  }
}

function runCommandList(command, args, { env, timeoutMs, spawn }) {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let child

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      try {
        if (child && typeof child.kill === 'function') child.kill('SIGTERM')
        if (child && child.stdout && typeof child.stdout.destroy === 'function') child.stdout.destroy()
        if (child && child.stderr && typeof child.stderr.destroy === 'function') child.stderr.destroy()
        if (child && typeof child.unref === 'function') child.unref()
      } catch {}
      finish({ status: 'timeout', reason: `timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    try {
      child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      finish({ status: 'failed', reason: err && err.message ? err.message : String(err) })
      return
    }

    if (child.stdout) child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    if (child.stderr) child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (err) => {
      finish({ status: 'failed', reason: err && err.message ? err.message : String(err) })
    })
    child.on('close', (code) => {
      if (code === 0) {
        finish({ status: 'ok', ids: parseOutputIds(stdout) })
      } else {
        finish({ status: 'failed', reason: stderr.trim() || `exit code ${code}` })
      }
    })
  })
}

async function listModels(harnessName, options = {}) {
  const env = options.env || process.env
  const spawn = options.spawn || childProcess.spawn
  const configPath = options.configPath || DEFAULT_CONFIG_PATH
  const lanesConfigPath = options.lanesConfigPath || DEFAULT_LANES_PATH
  const home = options.home || env.HOME || os.homedir()

  const config = readJsonOrNull(configPath) || {}
  const captureVia = config.captureVia
  if (!captureVia || !Object.hasOwn(captureVia, harnessName) || captureVia[harnessName] === null) {
    const reason = harnessName === 'muse'
      ? 'no capture means without a model call'
      : `no capture configured for ${harnessName}`
    return { status: 'no-capture', reason }
  }

  const lanes = readJsonOrNull(lanesConfigPath) || {}
  const command = (lanes.harnesses && lanes.harnesses[harnessName] && lanes.harnesses[harnessName].command) || harnessName
  if (!commandInstalled(command, env)) {
    return { status: 'not-installed', reason: `${command} not found on PATH` }
  }

  const entry = captureVia[harnessName]
  if (typeof entry.file === 'string') {
    return readCacheFile(entry.file, home)
  }

  if (Array.isArray(entry.args)) {
    const defaultTimeout = (typeof config.perHarnessSeconds === 'number' ? config.perHarnessSeconds : 10) * 1000
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : defaultTimeout
    return runCommandList(command, entry.args, { env, timeoutMs, spawn })
  }

  return { status: 'no-capture', reason: `invalid capture config for ${harnessName}` }
}

module.exports = { compare, listModels }
