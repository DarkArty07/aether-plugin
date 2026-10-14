'use strict'

// The Grok harness: the headless command line, a run judged from the one JSON object grok prints, and the quota
// read from the log grok writes when it fetches its credits config (grok-quota.js).

const { commandInstalled } = require('../lanes.js')
const { defaultExec, extractJsonObject, parseRun, readVersion, stringsIn, unknownQuota, usageOf } = require('./structured.js')
const { defaultLogFile, readGrokQuota } = require('./grok-quota.js')

// Grok's answer is the first of these fields that holds a string.
const ANSWER_FIELDS = ['result', 'response', 'text', 'output']

// Grok prints one JSON object: its answer is the first string among ANSWER_FIELDS, and its usage is the usage
// object. Every other field is outside the answer, where a quota line may sit; without an object, all of the output
// is outside it. Checked against grok 1.0.41 (Grok Build) on 2026-10-13: a run prints `text`, `usage` with
// input_tokens, output_tokens, reasoning_tokens, cache_read_input_tokens and total_tokens, and `total_cost_usd`.
// `text` joins the words of every turn without a separator, so the JSON of the answer is the last object in it.
function readGrok(stdout) {
  const data = extractJsonObject(stdout)
  if (data === null) return { answer: '', usage: usageOf({}), outside: stdout }
  const field = ANSWER_FIELDS.find((name) => typeof data[name] === 'string')
  const usage = data.usage ?? {}
  return {
    answer: field === undefined ? '' : data[field],
    usage: usageOf({
      input: usage.input_tokens,
      output: usage.output_tokens,
      thinking: usage.reasoning_tokens,
      cacheRead: usage.cache_read_input_tokens,
      total: usage.total_tokens,
    }),
    outside: Object.entries(data)
      .filter(([key]) => key !== field)
      .flatMap(([, value]) => stringsIn(value))
      .join('\n'),
  }
}

// logFile and now, the clock, are for tests.
function createGrok({ command = 'grok', groups = {}, exec = defaultExec, env = process.env, logFile = defaultLogFile(env), now = Date.now } = {}) {
  return {
    name: 'grok',

    // The CLI takes no JSON schema on its command line, so the lane runner states the schema in the prompt.
    schemaInPrompt: true,

    installed() {
      return commandInstalled(command, env)
    },

    // The newest reading of grok's log, for each group of the table, since the plan has one quota. It stays valid,
    // with its age in source.ageMinutes, until its period ends; no reading, or one of an ended period, is unknown.
    // It only reads the log: a refresh asks grok over ACP for seconds, and opens its UI only if that gives nothing, which
    // must not happen while a call holds a slot.
    quota() {
      const reading = readGrokQuota({ logFile, now: now() })
      if (reading === null) return unknownQuota(groups)
      return { groups: Object.fromEntries(Object.keys(groups).map((key) => [key, { ...reading }])) }
    },

    // The model is the bare lane model id.
    modelArg: ({ model }) => model,

    // One headless turn that approves the actions it takes, at the lane level's reasoning effort (grok takes low,
    // medium, high and xhigh, and the table's levels are the first three). The schema file and the timeout are not
    // passed: the schema is in the prompt, and the lane runner ends the run at its own timeout.
    argv({ model, level, prompt }) {
      const effort = level === undefined ? [] : ['--reasoning-effort', level]
      return [command, '-p', prompt, '--always-approve', '--model', model, ...effort, '--output-format', 'json']
    },

    parse(raw, { required = [] } = {}) {
      return parseRun(raw, readGrok, required)
    },

    // Each call reports its own usage, not a running total, so the current usage is the turn's.
    usageDelta(previous, current) {
      return current
    },

    version() {
      return readVersion(exec, command)
    },
  }
}

module.exports = { createGrok }
