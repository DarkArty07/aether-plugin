'use strict'

// The agy harness: reads its quota, builds its print-mode argv, and judges a run clean only on every sign.

const { spawnSync } = require('node:child_process')
const { commandInstalled } = require('../lanes.js')

// Runs argv without a shell. A spawn that fails or times out throws; otherwise the exit status and output come back.
function defaultExec(argv, { timeoutMs, cwd }) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: timeoutMs, cwd, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// The JSON object in text, or null when text is not one.
function jsonObject(text) {
  try {
    const value = JSON.parse(text)
    return isPlainObject(value) ? value : null
  } catch {
    return null
  }
}

function usageOf(data) {
  const usage = isPlainObject(data?.usage) ? data.usage : {}
  const count = (key) => (Number.isFinite(usage[key]) ? usage[key] : 0)
  return {
    input: count('input_tokens'),
    output: count('output_tokens'),
    thinking: count('thinking_tokens'),
    cacheRead: count('cache_read_tokens'),
    total: count('total_tokens'),
  }
}

function conversationOf(data) {
  return typeof data?.conversation_id === 'string' && data.conversation_id !== '' ? data.conversation_id : null
}

// A stderr line agy prints as a notice, not as an error: it started background tasks and waits for them.
const NOTICE = /^root agent idle; waiting up to \S+ for \d+ background task\(s\)$/

// The first rule a run fails, in order, or null when it is clean.
function failureReason({ stderr, exitCode }, data, { conversation, required }) {
  const detail = data?.error ? `: ${data.error}` : ''
  if (exitCode !== 0) return `exit ${exitCode}${detail}`
  if (!data) return 'unreadable output'
  if (data.status !== 'SUCCESS') return `status ${data.status}${detail}`
  const stderrLine = (stderr || '').split('\n').map((line) => line.trim()).find((line) => line !== '' && !NOTICE.test(line))
  if (stderrLine !== undefined) return `stderr: ${stderrLine.slice(0, 300)}`
  if (typeof data.response !== 'string' || data.response.trim() === '') return 'empty response'
  const structured = data.structured_output
  if (!isPlainObject(structured) || required.some((key) => !Object.hasOwn(structured, key))) return 'no structured output'
  const got = conversationOf(data)
  if (conversation && got !== conversation) return `conversation ${got} instead of ${conversation}`
  return null
}

function createAgy({ command = 'agy', groups = {}, exec = defaultExec, env = process.env } = {}) {
  // The table's keys that read each /usage group, by its name. Several keys may read one group: agy's /usage lists
  // «Gemini Models» alone, while Argon and Flash have a quota each, so both keys get its windows and a refusal tells
  // them apart (marks, order and choice are per key).
  const keysOfGroup = new Map()
  for (const [key, name] of Object.entries(groups)) keysOfGroup.set(name, [...(keysOfGroup.get(name) ?? []), key])
  // agy's name for a lane model at a level: the model id and the level joined by a dash.
  const modelArg = ({ model, level }) => `${model}-${level}`

  return {
    name: 'agy',
    quotaCost: 'process',

    installed() {
      return commandInstalled(command, env)
    },

    modelArg,

    // The windows of each configured key, keyed by its key in the table; the keys that read one /usage group get the
    // same windows, each its own copy.
    quota() {
      const result = exec([command, '-p', '/usage', '--output-format', 'json'], { timeoutMs: 60000 })
      if (result.status !== 0) {
        throw new Error(`agy /usage failed: exit ${result.status}: ${(result.stderr || '').trim().slice(0, 300)}`)
      }
      const list = jsonObject(result.stdout)?.command?.data?.groups
      if (!Array.isArray(list)) throw new Error('agy /usage failed: unreadable output')
      const reported = {}
      for (const group of list) {
        const keys = keysOfGroup.get(group.name)
        if (keys === undefined) continue
        const windows = {}
        for (const bucket of group.buckets) {
          windows[bucket.window] = { remaining: bucket.remaining_fraction, resetsAt: bucket.reset_time }
        }
        if (Object.keys(windows).length > 0) {
          for (const key of keys) reported[key] = { windows: Object.fromEntries(Object.entries(windows).map(([name, w]) => [name, { ...w }])) }
        }
      }
      // A table group that /usage does not list, or lists with no buckets, has no reading: unknown, never absent and
      // never without windows. An absent group, or one with no windows, would be judged as a quota failure by the runner
      // (a call that fails there would leave a mark), and an absent one would keep the saved reading from holding for
      // its life, since that needs every group of the table.
      for (const key of Object.keys(groups)) {
        if (!Object.hasOwn(reported, key)) reported[key] = { unknown: true, windows: {} }
      }
      return { groups: reported }
    },

    // One print-mode turn, resuming conversation when it is given. The model is the lane model id at its level.
    argv({ model, level, schemaFile, timeoutSeconds, prompt, conversation = null }) {
      const args = [
        command,
        '-p',
        prompt,
        '--model',
        modelArg({ model, level }),
        '--output-format',
        'json',
        '--json-schema',
        schemaFile,
        '--dangerously-skip-permissions',
        '--print-timeout',
        `${timeoutSeconds}s`,
      ]
      if (conversation) args.push('--conversation', conversation)
      return args
    },

    // Judges one run's output. reason is the first failed rule, or null when the run is clean.
    parse({ stdout, stderr, exitCode }, { conversation = null, required = [] } = {}) {
      const data = jsonObject(stdout)
      const reason = failureReason({ stderr, exitCode }, data, { conversation, required })
      return {
        clean: reason === null,
        reason,
        structured: isPlainObject(data?.structured_output) ? data.structured_output : null,
        usage: usageOf(data),
        conversation: conversationOf(data),
        response: typeof data?.response === 'string' ? data.response : '',
        error: data?.error ? String(data.error) : '',
      }
    },

    // One turn's usage out of a cumulative total, never below zero.
    usageDelta(previous, current) {
      if (!previous) return current
      return Object.fromEntries(Object.keys(current).map((field) => [field, Math.max(0, current[field] - previous[field])]))
    },

    // agy's version, or null when it cannot be read.
    version() {
      let result
      try {
        result = exec([command, '--version'], { timeoutMs: 10000 })
      } catch {
        return null
      }
      if (result.status !== 0) return null
      const match = /\d+\.\d+\.\d+/.exec(result.stdout || '')
      return match ? match[0] : null
    },
  }
}

module.exports = { createAgy }
