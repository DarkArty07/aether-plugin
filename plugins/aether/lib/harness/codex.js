'use strict'

// The Codex harness: the headless exec command line, and a run judged from the JSON events codex prints.

const { commandInstalled } = require('../lanes.js')
const { defaultExec, parseJson, parseRun, readVersion, stringsIn, unknownQuota, usageOf } = require('./structured.js')

// The answer is the text of the last item.completed event whose item is an agent_message, and the usage is that of
// the last turn.completed event that has one. Codex prints one JSON event per line. Every other event, and every
// line that is not JSON, is outside the answer: a quota line may sit there, in an error or turn.failed event. The
// field names are Spec Kit 1.1.3's, not yet checked against the installed codex: correct them here if the real
// events differ.
function readCodex(stdout) {
  let answer = ''
  let usage = {}
  const outside = []
  for (const line of stdout.split('\n')) {
    const event = parseJson(line.trim())
    if (event === undefined) {
      outside.push(line)
      continue
    }
    if (event?.type === 'item.completed' && event.item?.type === 'agent_message') {
      if (typeof event.item.text === 'string') answer = event.item.text
      continue
    }
    if (event?.type === 'turn.completed' && typeof event.usage === 'object' && event.usage !== null) usage = event.usage
    outside.push(...stringsIn(event))
  }
  return {
    answer,
    usage: usageOf({ input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cached_input_tokens }),
    outside: outside.join('\n'),
  }
}

function createCodex({ command = 'codex', groups = {}, exec = defaultExec, env = process.env } = {}) {
  return {
    name: 'codex',

    // Recent Codex versions take --output-schema, but this adapter keeps the schema in the prompt until a real
    // call checks the installed version, so the lane runner states the schema there.
    schemaInPrompt: true,

    installed() {
      return commandInstalled(command, env)
    },

    quota() {
      return unknownQuota(groups)
    },

    // The model is the bare lane model id: codex takes its effort in its own flag, not in the name.
    modelArg: ({ model }) => model,

    // One headless exec turn, at the lane level's reasoning effort. The schema file and the timeout are not passed:
    // the schema is in the prompt, and the lane runner ends the run at its own timeout.
    argv({ model, level, prompt }) {
      return [command, 'exec', prompt, '--model', model, '-c', `model_reasoning_effort=${level}`, '--json', '--sandbox', 'workspace-write']
    },

    parse(raw, { required = [] } = {}) {
      return parseRun(raw, readCodex, required)
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

module.exports = { createCodex }
