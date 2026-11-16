'use strict'

// Daily check of the models each active harness offers, with a single-line notice on SessionStart.
// Family: model.

const childProcess = require('node:child_process')
const path = require('node:path')
const { readJsonOrNull, writeAtomic } = require('./common.js')
const { compare, listModels: defaultListModels } = require('./model-listing.js')

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'model-watch.json')
const DEFAULT_TABLE_PATH = path.join(__dirname, '..', 'config', 'models', 'harness-models.json')
const BIN = path.join(__dirname, '..', 'bin', 'aether-observe')
const MAX_NOTICE_CHARS = 400

function watchDir(dataDir) {
  return path.join(dataDir, 'model-watch')
}

function resultFile(dataDir) {
  return path.join(watchDir(dataDir), 'result.json')
}

function stampFile(dataDir) {
  return path.join(watchDir(dataDir), 'stamp.json')
}

function readConfig(env) {
  const file = (env && env.AETHER_MODEL_WATCH_CONFIG) || DEFAULT_CONFIG_PATH
  return readJsonOrNull(file) || { perHarnessSeconds: 10, totalSeconds: 30, captureVia: {} }
}

function readTable() {
  return readJsonOrNull(DEFAULT_TABLE_PATH) || { harnesses: {} }
}

function sameCalendarDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

function readStampAt(dataDir) {
  const data = readJsonOrNull(stampFile(dataDir))
  return data && Number.isFinite(data.at) ? data.at : null
}

function isStampedToday(dataDir, now) {
  const at = readStampAt(dataDir)
  return at !== null && sameCalendarDay(at, now)
}

function readResult(dataDir) {
  if (!dataDir) return null
  const data = readJsonOrNull(resultFile(dataDir))
  return data && typeof data === 'object' && data.harnesses && typeof data.harnesses === 'object' ? data : null
}

function watchableHarnesses(harnesses, config) {
  const captureVia = (config && config.captureVia) || {}
  const allowed = new Set(Object.keys(captureVia))
  const list = Array.isArray(harnesses) ? harnesses : []
  const seen = new Set()
  const out = []
  for (const name of list) {
    if (typeof name === 'string' && allowed.has(name) && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

function sameDifferences(diff, prev) {
  if (!prev || !prev.noticed) return false
  if (diff.new.length === 0 && diff.retired.length === 0) return false
  const prevNew = new Set(Array.isArray(prev.new) ? prev.new : [])
  const prevRetired = new Set(Array.isArray(prev.retired) ? prev.retired : [])
  return diff.new.every((id) => prevNew.has(id)) && diff.retired.every((id) => prevRetired.has(id))
}

async function runWatch({
  dataDir,
  mainRoot,
  harnesses,
  now = Date.now(),
  force = false,
  listModels = defaultListModels,
  table = readTable(),
  config,
  env = process.env,
} = {}) {
  const cfg = config || readConfig(env)
  if (!force && isStampedToday(dataDir, now)) {
    return readResult(dataDir) || { at: readStampAt(dataDir) || now, harnesses: {} }
  }

  const prevResult = readResult(dataDir)
  const targets = watchableHarnesses(harnesses, cfg)
  const perHarnessMs = (typeof cfg.perHarnessSeconds === 'number' ? cfg.perHarnessSeconds : 10) * 1000
  const totalMs = (typeof cfg.totalSeconds === 'number' ? cfg.totalSeconds : 30) * 1000
  const startMs = Date.now()
  const harnessesOut = {}

  for (const name of targets) {
    const elapsed = Date.now() - startMs
    if (elapsed >= totalMs) {
      harnessesOut[name] = {
        status: 'skipped',
        skipped: 'total-timeout',
        readAt: now,
        new: [],
        retired: [],
        noticed: false,
      }
      continue
    }

    const timeoutMs = Math.min(perHarnessMs, Math.max(1, totalMs - elapsed))
    let res
    try {
      res = await listModels(name, { env, timeoutMs, mainRoot })
    } catch (err) {
      res = { status: 'failed', reason: err && err.message ? err.message : String(err) }
    }

    if (res && res.status === 'ok') {
      const diff = compare(name, res.ids, table)
      const prev = prevResult && prevResult.harnesses ? prevResult.harnesses[name] : null
      harnessesOut[name] = {
        status: 'ok',
        readAt: now,
        new: diff.new,
        retired: diff.retired,
        noticed: sameDifferences(diff, prev),
      }
    } else {
      const status = (res && res.status) || 'failed'
      const entry = { status, readAt: now, new: [], retired: [], noticed: false }
      if (res && res.reason) entry.reason = res.reason
      harnessesOut[name] = entry
    }
  }

  const result = { at: now, harnesses: harnessesOut }
  try {
    writeAtomic(resultFile(dataDir), `${JSON.stringify(result, null, 2)}\n`)
    writeAtomic(stampFile(dataDir), `${JSON.stringify({ at: now })}\n`)
  } catch {
    // Best-effort persistence; never throw from watch.
  }
  return result
}

function launch({
  dataDir,
  mainRoot,
  env = process.env,
  isLead = false,
  harnesses = [],
  spawn = childProcess.spawn,
  config,
  now = Date.now(),
} = {}) {
  try {
    if (!isLead) return false
    const cfg = config || readConfig(env)
    const targets = watchableHarnesses(harnesses, cfg)
    if (targets.length === 0) return false
    if (dataDir && isStampedToday(dataDir, now)) return false

    const childEnv = { ...env, AETHER_LANE_HARNESSES: targets.join(',') }
    if (typeof dataDir === 'string' && dataDir) childEnv.AETHER_DATA_DIR = dataDir
    const opts = { detached: true, stdio: 'ignore', env: childEnv }
    if (typeof mainRoot === 'string' && mainRoot) opts.cwd = mainRoot

    const child = spawn(process.execPath, [BIN, 'models-read'], opts)
    if (child && typeof child.on === 'function') child.on('error', () => {})
    if (child && typeof child.unref === 'function') child.unref()
    return true
  } catch {
    return false
  }
}

function truncateNotice(body) {
  const parts = body.split(', ')
  for (let keep = parts.length - 1; keep >= 1; keep -= 1) {
    const dropped = parts.length - keep
    const candidate = `${parts.slice(0, keep).join(', ')} and ${dropped} more`
    if (candidate.length <= MAX_NOTICE_CHARS) return candidate
  }
  const suffix = ' and 1 more'
  return `${body.slice(0, MAX_NOTICE_CHARS - suffix.length)}${suffix}`
}

function noticeLine(result) {
  if (!result || typeof result !== 'object' || !result.harnesses || typeof result.harnesses !== 'object') {
    return null
  }
  const chunks = []
  for (const [name, entry] of Object.entries(result.harnesses)) {
    if (!entry || entry.noticed) continue
    const added = Array.isArray(entry.new) ? entry.new : []
    const retired = Array.isArray(entry.retired) ? entry.retired : []
    if (added.length === 0 && retired.length === 0) continue
    if (added.length > 0 && retired.length > 0) {
      chunks.push(`new models in ${name}: ${added.join(', ')}; retired: ${retired.join(', ')}`)
    } else if (added.length > 0) {
      chunks.push(`new models in ${name}: ${added.join(', ')}`)
    } else {
      chunks.push(`retired models in ${name}: ${retired.join(', ')}`)
    }
  }
  if (chunks.length === 0) return null
  const body = `Aether: ${chunks.join('; ')}`
  const full = `${body}.`
  if (full.length <= MAX_NOTICE_CHARS) return full
  return truncateNotice(body)
}

function markNoticed(dataDir) {
  const result = readResult(dataDir)
  if (!result) return false
  for (const entry of Object.values(result.harnesses)) {
    if (entry && typeof entry === 'object') entry.noticed = true
  }
  try {
    writeAtomic(resultFile(dataDir), `${JSON.stringify(result, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

module.exports = { runWatch, launch, readResult, noticeLine, markNoticed }
