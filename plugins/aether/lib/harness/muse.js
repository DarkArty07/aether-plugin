'use strict'

// The Muse harness: one headless `muse exec --json` turn, and a run judged from the JSONL records it prints. Muse
// has no quota command, so the adapter keeps the last allowance a call reported, and quota() reads that.
// Family: harness.

const fs = require('node:fs')
const path = require('node:path')
const { isObject: isPlainObject } = require('../common.js')
const { commandInstalled } = require('../lane-process.js')
const { strictSchema } = require('../lane-schemas.js')
const run = require('../run.js')
const { defaultExec, extractJsonObject, missingField, parseObject } = require('./structured.js')

const OBSERVED_FILE = 'muse-observed.json'
const QUOTA_SOURCE = 'muse exec --json'
const MINUTE_MS = 60000
// A message of a failure is quoted in at most MESSAGE_LIMIT characters, and a stderr line in at most LINE_LIMIT.
const MESSAGE_LIMIT = 300
const LINE_LIMIT = 300
const MODEL_STEPS = '200'

let writeCounter = 0

// Text from a failure, on one line and cut to limit characters, so it cannot bloat the lane log.
const brief = (text, limit) => text.replace(/\s+/g, ' ').trim().slice(0, limit)

const isoOf = (ms) => {
  try {
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

// A field under its camelCase or snake_case name; Muse's schema is camelCase in some places and snake_case in others.
const field = (object, camel, snake) => (isPlainObject(object) ? (object[camel] ?? object[snake]) : undefined)

// The records of `--json` output: one JSON object per line, and only those that carry a payload type. A line that is
// not a record is skipped.
function recordsOf(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => parseObject(line))
    .filter((record) => record !== null && typeof record.payload_type === 'string')
}

const lastOf = (items) => (items.length === 0 ? null : items[items.length - 1])

// The failure object of a terminal record: its reason or its error, as an object, as a JSON string or as a plain
// string. Shape: { kind, message, quota?: { limitKind, resetsAtMs } }.
// Assumed from the MSP schema, not yet seen in a real call (spec R27).
function failureObject(value) {
  if (isPlainObject(value)) return { object: value, text: null }
  if (typeof value !== 'string' || value.trim() === '') return { object: null, text: null }
  const parsed = parseObject(value)
  return parsed === null ? { object: null, text: value.trim() } : { object: parsed, text: null }
}

// The failures a terminal record holds: its reason, then its error.
function failuresOf(payload) {
  return [failureObject(payload.reason), failureObject(payload.error)]
}

// The quota data of a failure, or null. Only this data makes a quota failure, never the words of a message.
// Assumed from the MSP schema, not yet seen in a real call (spec R27).
function quotaDataOf(failures) {
  for (const { object } of failures) {
    if (isPlainObject(object?.quota)) return object.quota
  }
  return null
}

function quotaReason(quota) {
  const kind = field(quota, 'limitKind', 'limit_kind')
  const resetsAtMs = field(quota, 'resetsAtMs', 'resets_at_ms')
  const resetsAt = Number.isFinite(resetsAtMs) ? isoOf(resetsAtMs) : null
  const name = typeof kind === 'string' && brief(kind, MESSAGE_LIMIT) !== '' ? brief(kind, MESSAGE_LIMIT) : 'limit'
  return `quota: muse ${name}${resetsAt === null ? '' : `, resets ${resetsAt}`}`
}

// The reason of a turn that did not complete, from the class of its failure.
// Assumed from the MSP schema, not yet seen in a real call (spec R27).
function failedReason(failures, terminal) {
  for (const { object, text } of failures) {
    const kind = typeof object?.kind === 'string' ? brief(object.kind, MESSAGE_LIMIT) : ''
    const message = typeof object?.message === 'string' ? brief(object.message, MESSAGE_LIMIT) : ''
    if (kind !== '') return `muse ${kind}${message === '' ? '' : `: ${message}`}`
    if (text !== null) return `muse failed: ${brief(text, MESSAGE_LIMIT)}`
    if (message !== '') return `muse failed: ${message}`
  }
  return terminal === 'cancelled' ? 'muse cancelled' : `muse failed: ${terminal || 'unknown'}`
}

const count = (value) => (Number.isFinite(value) ? value : 0)

// The usage of a run, from its last `run.usage` record: the sums over its models, and the allowance as Muse reports it.
function usageOf(record) {
  const payload = record !== null && isPlainObject(record.payload) ? record.payload : {}
  const models = Array.isArray(payload.models) ? payload.models.filter(isPlainObject) : []
  const perModel = models.map((entry) => ({
    model: typeof entry.model === 'string' ? entry.model : null,
    calls: count(entry.calls),
    input: count(entry.input_tokens),
    output: count(entry.output_tokens),
    thinking: count(entry.reasoning_tokens),
    cacheRead: count(entry.cached_tokens),
  }))
  const sum = (key) => perModel.reduce((total, entry) => total + entry[key], 0)
  const input = sum('input')
  const output = sum('output')
  return {
    input,
    output,
    thinking: sum('thinking'),
    cacheRead: sum('cacheRead'),
    total: input + output,
    models: perModel,
    // Assumed from the MSP schema, not yet seen in a real call (spec R27).
    allowance: isPlainObject(payload.allowance) ? payload.allowance : null,
  }
}

// A window of an allowance as { usedPercent, resetsAtMs }, or null when it is not readable.
// Assumed from the MSP schema, not yet seen in a real call (spec R27).
function windowOf(value) {
  const usedPercent = field(value, 'usedPercent', 'used_percent')
  const resetsAtMs = field(value, 'resetsAtMs', 'resets_at_ms')
  return Number.isFinite(usedPercent) && Number.isFinite(resetsAtMs) ? { usedPercent, resetsAtMs } : null
}

// The 5 h and weekly windows of an allowance, or null when neither is readable.
// Assumed from the MSP schema, not yet seen in a real call (spec R27).
function windowsOf(allowance) {
  if (!isPlainObject(allowance)) return null
  const window = windowOf(allowance.window)
  const weekly = windowOf(allowance.weekly)
  return window === null && weekly === null ? null : { window, weekly }
}

// A stored window as quota() gives it, or null when its reset has passed: the window has refilled, and what was used
// in it is not known.
function readingOf(stored, now) {
  if (stored === null || stored.resetsAtMs <= now) return null
  const resetsAt = isoOf(stored.resetsAtMs)
  if (resetsAt === null) return null
  return { remaining: Math.min(1, Math.max(0, 1 - stored.usedPercent / 100)), resetsAt }
}

// A stored window is null or complete; anything else is a broken file.
const storedWindow = (value) => value === null || windowOf(value) !== null

// Muse rejects a structured-output schema unless every object schema says additionalProperties: false. The file is
// the caller's for this one call. A missing, unreadable or non-JSON file stays as it is, and argv still returns.
function writeStrictSchema(schemaFile) {
  if (!schemaFile) return
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
  } catch {
    // Missing, unreadable or not JSON: the file stays as it is.
    return
  }
  fs.writeFileSync(schemaFile, JSON.stringify(strictSchema(parsed), null, 2) + '\n')
}

function createMuse({ command = 'muse', groups = {}, exec = defaultExec, env = process.env, dataDir = null, now = Date.now } = {}) {
  const observedPath = () => path.join(dataDir ?? run.dataDir(), 'lanes', 'quota', OBSERVED_FILE)

  // Keeps the observation; an atomic write, and a failure to write is not an error of the call.
  function observe(window, weekly) {
    let tmp
    try {
      const file = observedPath()
      tmp = `${file}.${process.pid}.${Date.now()}.${++writeCounter}.tmp`
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify({ observedAt: now(), window, weekly }, null, 2) + '\n')
      fs.renameSync(tmp, file)
    } catch {
      // The observation is lost; the next call brings another.
    }
    try {
      // After a rename that worked the temporary file is gone; after a write or a rename that failed it must not stay.
      if (tmp !== undefined) fs.rmSync(tmp, { force: true })
    } catch {
      // A temporary file that cannot be removed is not an error of the call either.
    }
  }

  return {
    name: 'muse',

    installed() {
      return commandInstalled(command, env)
    },

    // The first x.y.z of `muse --version`, or null.
    version() {
      let result
      try {
        result = exec([command, '--version'], { timeoutMs: 10000 })
      } catch {
        return null
      }
      if (result?.status !== 0) return null
      const match = /\d+\.\d+\.\d+/.exec(result.stdout || '')
      return match === null ? null : match[0]
    },

    // What the last observed allowance leaves in each window, or unknown. No process runs and no window is invented.
    quota() {
      const unknown = { groups: Object.fromEntries(Object.keys(groups).map((key) => [key, { unknown: true, windows: {} }])) }
      try {
        const stored = JSON.parse(fs.readFileSync(observedPath(), 'utf8'))
        if (!isPlainObject(stored) || !Number.isFinite(stored.observedAt)) return unknown
        const { window = null, weekly = null } = stored
        if (!storedWindow(window) || !storedWindow(weekly)) return unknown
        const at = now()
        const windows = {}
        const fiveHours = readingOf(window, at)
        const week = readingOf(weekly, at)
        if (fiveHours !== null) windows['5h'] = fiveHours
        if (week !== null) windows.weekly = week
        const ts = isoOf(stored.observedAt)
        if (ts === null || Object.keys(windows).length === 0) return unknown
        const ageMinutes = Math.max(0, Math.floor((at - stored.observedAt) / MINUTE_MS))
        return {
          groups: Object.fromEntries(
            Object.keys(groups).map((key) => [key, { windows: { ...windows }, source: { command: QUOTA_SOURCE, ts, ageMinutes } }]),
          ),
        }
      } catch {
        return unknown
      }
    },

    // The model is the bare model id.
    modelArg: ({ model }) => model,

    // One headless turn: sandboxed, with the contributor mode off and no personal context from outside, and nothing
    // that waits for an answer from someone. The flags that turn the sandbox off, trust the workspace or take
    // credentials are never passed, and a contributor model is never called. The timeout is not passed: the lane
    // runner ends the run at its own timeout.
    argv({ model, level, schemaFile, prompt }) {
      if (typeof model !== 'string' || model.trim() === '') throw new Error('muse needs a model')
      if (/contributor/i.test(model)) throw new Error(`muse does not call a contributor model: ${model}`)
      writeStrictSchema(schemaFile)
      return [
        command, 'exec', '--json', '--provider', 'meta', '--model', model,
        ...(level ? ['--reasoning-effort', level] : []),
        ...(schemaFile ? ['--output-schema', schemaFile] : []),
        '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders',
        '--disable-request-user-input', '--max-model-steps', MODEL_STEPS,
        prompt,
      ]
    },

    // The last terminal record decides the turn. A completed turn that exited 0 with the object and every required
    // field is clean; any other fails by the first rule that holds: the quota data of the failure; a turn that did
    // not complete; an exit that is not 0; no terminal record; no text; no object; a missing field. The usage is
    // kept whatever the verdict, and the allowance it carries is observed.
    parse(raw, { required = [] } = {}) {
      const stdout = typeof raw?.stdout === 'string' ? raw.stdout : ''
      const stderr = typeof raw?.stderr === 'string' ? raw.stderr : ''
      const exitCode = raw?.exitCode
      const records = recordsOf(stdout)
      const terminal = lastOf(records.filter((record) => record.payload_type.startsWith('run.terminal.')))
      const usage = usageOf(lastOf(records.filter((record) => record.payload_type === 'run.usage')))
      const payload = terminal !== null && isPlainObject(terminal.payload) ? terminal.payload : {}
      const terminalName = terminal === null ? null : terminal.payload_type.slice('run.terminal.'.length)
      const completed = terminalName === 'completed'
      const failures = completed || terminal === null ? [] : failuresOf(payload)
      const quota = quotaDataOf(failures)
      const windows = windowsOf(usage.allowance)

      // The observation: an allowance that reads is kept, and a quota failure replaces what was kept before it.
      if (quota !== null) observe(windows?.window ?? null, windows?.weekly ?? null)
      else if (windows !== null) observe(windows.window, windows.weekly)

      const failed = (reason) => ({ clean: false, reason, structured: null, usage, conversation: null })
      if (quota !== null) return failed(quotaReason(quota))
      if (terminal !== null && !completed) return failed(failedReason(failures, terminalName))
      if (exitCode !== 0) {
        // An exit that is not a number, such as none at all or a signal, is not known to be 0.
        const code = Number.isInteger(exitCode) ? exitCode : 'unknown'
        // Muse writes its own notices to stderr on every run, each starting with `muse: ` (the workspace root, that
        // delegation is unavailable), before an error of its own (seen in real calls): the first line that is not one.
        const lines = stderr.split('\n').map((item) => item.trim()).filter((item) => item !== '')
        const line = lines.find((item) => !item.startsWith('muse: ')) ?? lines[0]
        return failed(`exit ${code}${line === undefined ? '' : `: ${brief(line, LINE_LIMIT)}`}`)
      }
      if (terminal === null) return failed('unreadable output')
      const text = typeof payload.text === 'string' ? payload.text : ''
      if (text.trim() === '') return failed('no result')
      const structured = extractJsonObject(text)
      if (structured === null) return failed('no structured output')
      const missing = missingField(structured, required)
      if (missing !== null) return failed(`missing ${missing}`)
      return { clean: true, reason: null, structured, usage, conversation: null }
    },

    // Each call reports its own usage, not a running total, so the current usage is the turn's.
    usageDelta(previous, current) {
      return current
    },
  }
}

module.exports = { createMuse }
