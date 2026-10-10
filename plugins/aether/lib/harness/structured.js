'use strict'

// What the Codex, Grok and Cursor harnesses share: running a command, reading its version, finding the JSON
// object in an answer, and judging a run in one fixed order: quota, exit, answer, JSON object, required fields.

const { spawnSync } = require('node:child_process')

// The words of a quota or rate-limit error. A line of an answer or of command output can match too.
const QUOTA_LINE = /rate.?limit|quota|usage limit|too many requests|\b429\b/i
// Reasons quote a stderr or quota line; a longer line would bloat the lane log.
const LINE_LIMIT = 300

// Runs argv without a shell. A spawn that fails or times out throws; otherwise the exit status and output come back.
function defaultExec(argv, { timeoutMs, cwd } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: timeoutMs, cwd, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// The object text holds, or null when it is not a JSON object.
function parseObject(text) {
  try {
    const value = JSON.parse(text)
    return isPlainObject(value) ? value : null
  } catch {
    return null
  }
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

// The verdict on one run, from its raw output. extract(stdout) gives the answer text and the usage, which
// are kept whatever the verdict. The rules run in this order and the first one that fails gives the reason.
function parseRun(raw, extract, required = []) {
  const stdout = typeof raw?.stdout === 'string' ? raw.stdout : ''
  const stderr = typeof raw?.stderr === 'string' ? raw.stderr : ''
  const exitCode = raw?.exitCode
  const { answer, usage } = extract(stdout)
  const failed = (reason) => ({ clean: false, reason, structured: null, usage, conversation: null })
  // A quota line is checked first: a run that hit its limit may also exit non-zero.
  const quota = quotaLine(stderr) ?? quotaLine(stdout)
  if (quota !== null) return failed(`quota: ${quota.slice(0, LINE_LIMIT)}`)
  if (exitCode !== 0) {
    const line = firstLine(stderr)
    return failed(`exit ${exitCode}${line === null ? '' : `: ${line.slice(0, LINE_LIMIT)}`}`)
  }
  if (answer.trim() === '') return failed('no result')
  const structured = extractJsonObject(answer)
  if (structured === null) return failed('no structured output')
  const missing = missingField(structured, required)
  if (missing !== null) return failed(`missing ${missing}`)
  return { clean: true, reason: null, structured, usage, conversation: null }
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
  parseObject,
  parseRun,
  quotaLine,
  readVersion,
  unknownQuota,
  usageOf,
}
