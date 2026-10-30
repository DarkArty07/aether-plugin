'use strict'

// What the Codex, Grok and Cursor harnesses share: running a command, reading its version, finding the JSON
// object in an answer, and judging a run: a clean answer is clean whatever else the output says, and a failed
// run is classed by its quota lines, its exit, its answer, its JSON object and its required fields, in that order.
// Sibling harness adapters call these helpers.
// Family: harness.

const { spawnSync } = require('node:child_process')
const { isObject: isPlainObject, parseJson } = require('../common.js')

// The words of a quota or rate-limit error. A line of an answer or of command output can match too.
const QUOTA_LINE = /rate.?limit|quota|usage limit|too many requests|\b429\b/i
// Reasons quote a quota line in at most QUOTE_LIMIT characters, and a stderr line in at most LINE_LIMIT, so a
// long line cannot bloat the lane log.
const QUOTE_LIMIT = 200
const LINE_LIMIT = 300

// Runs argv without a shell. A spawn that fails or times out throws; otherwise the exit status and output come back.
function defaultExec(argv, { timeoutMs, cwd } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: timeoutMs, cwd, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}


// The object text holds, or null when it is not a JSON object.
function parseObject(text) {
  const value = parseJson(text)
  return isPlainObject(value) ? value : null
}

// Every string in a JSON value, at any depth, in order.
function stringsIn(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (isPlainObject(value)) return Object.values(value).flatMap(stringsIn)
  return []
}

// The index of the brace that closes the one at start, or -1. Braces inside JSON strings do not count.
function closingBrace(text, start) {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (char === '\\') i++
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// A "{" followed by a quote opens a JSON object: an unclosed one of those is an answer cut off.
const OPENS_JSON = /\s*"/y

// The last top-level JSON object in text, or null. Prose and code fences around it do not matter. A balanced
// run of braces that is not valid JSON is skipped whole, so an object inside it does not count. A "{" that
// never closes is taken for prose, so an object after it still does, unless it opens JSON: then the answer
// was cut off, and an object inside it must not pass for the whole answer.
function extractJsonObject(text) {
  if (typeof text !== 'string') return null
  let found = null
  let from = text.indexOf('{')
  while (from !== -1) {
    const end = closingBrace(text, from)
    if (end === -1) {
      OPENS_JSON.lastIndex = from + 1
      if (OPENS_JSON.test(text)) break
      from = text.indexOf('{', from + 1)
      continue
    }
    const value = parseObject(text.slice(from, end + 1))
    if (value !== null) found = value
    from = text.indexOf('{', end + 1)
  }
  return found
}

// The first required field that object lacks, or null. Something that is not an object lacks them all.
function missingField(object, required = []) {
  const missing = required.find((field) => !isPlainObject(object) || !Object.hasOwn(object, field))
  return missing === undefined ? null : missing
}

// The first line of text, trimmed, that is not empty, or null.
function firstLine(text) {
  const line = text.split('\n').map((item) => item.trim()).find((item) => item !== '')
  return line === undefined ? null : line
}

// The first line of text, trimmed, that reads as a quota or rate-limit error, or null.
function quotaLine(text) {
  if (typeof text !== 'string') return null
  const line = text.split('\n').map((item) => item.trim()).find((item) => QUOTA_LINE.test(item))
  return line === undefined ? null : line
}

// Usage in agy's shape. What the CLI does not report is 0; total is input plus output when the CLI gives none.
function usageOf({ input, output, thinking, cacheRead, total } = {}) {
  const count = (value) => (Number.isFinite(value) ? value : 0)
  const inputTokens = count(input)
  const outputTokens = count(output)
  return {
    input: inputTokens,
    output: outputTokens,
    thinking: count(thinking),
    cacheRead: count(cacheRead),
    total: Number.isFinite(total) ? total : inputTokens + outputTokens,
  }
}

const quotaReason = (line) => `quota: ${line.slice(0, QUOTE_LIMIT)}`

// The verdict on one run, from its raw output. extract(stdout) gives the answer text, the usage and the stdout
// outside the answer, where a quota line may sit; the usage is kept whatever the verdict. A run that exits 0 with
// a JSON object in its answer and every required field is clean, and no quota line is looked for in it. Any other
// run fails by the first rule that holds: a quota line in stderr; for a run that did not exit 0, a quota line
// outside the answer; its exit; no result; no structured output; a missing field. quotaByText false skips those
// two quota rules; every other rule, and its order, stays.
function parseRun(raw, extract, required = [], { quotaByText = true } = {}) {
  const stdout = typeof raw?.stdout === 'string' ? raw.stdout : ''
  const stderr = typeof raw?.stderr === 'string' ? raw.stderr : ''
  const exitCode = raw?.exitCode
  const { answer, usage, outside } = extract(stdout)
  const structured = answer.trim() === '' ? null : extractJsonObject(answer)
  const missing = structured === null ? null : missingField(structured, required)
  if (exitCode === 0 && structured !== null && missing === null) {
    return { clean: true, reason: null, structured, usage, conversation: null }
  }
  const failed = (reason) => ({ clean: false, reason, structured: null, usage, conversation: null })
  if (quotaByText) {
    const stderrQuota = quotaLine(stderr)
    if (stderrQuota !== null) return failed(quotaReason(stderrQuota))
  }
  if (exitCode !== 0) {
    if (quotaByText) {
      const outsideQuota = quotaLine(outside)
      if (outsideQuota !== null) return failed(quotaReason(outsideQuota))
    }
    // An exit that is not a number, such as none at all or a signal, is not known to be 0.
    const code = Number.isInteger(exitCode) ? exitCode : 'unknown'
    const line = firstLine(stderr)
    return failed(`exit ${code}${line === null ? '' : `: ${line.slice(0, LINE_LIMIT)}`}`)
  }
  if (answer.trim() === '') return failed('no result')
  if (structured === null) return failed('no structured output')
  return failed(`missing ${missing}`)
}

// The first line of `<command> --version`, or null when the command fails or prints nothing.
function readVersion(exec, command) {
  let result
  try {
    result = exec([command, '--version'], { timeoutMs: 10000 })
  } catch {
    return null
  }
  if (result.status !== 0) return null
  return firstLine(result.stdout || '')
}

// These CLIs report no quota Aether can read, so every configured group is unknown and has no windows.
function unknownQuota(groups) {
  return { groups: Object.fromEntries(Object.keys(groups).map((key) => [key, { unknown: true, windows: {} }])) }
}

module.exports = {
  defaultExec,
  extractJsonObject,
  missingField,
  parseJson,
  parseObject,
  parseRun,
  quotaLine,
  readVersion,
  stringsIn,
  unknownQuota,
  usageOf,
}
