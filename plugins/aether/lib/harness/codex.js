'use strict'

// The Codex harness: the headless exec command line, and a run judged from the JSON events codex prints.

const { commandInstalled } = require('../lanes.js')
const { defaultExec, parseObject, parseRun, readVersion, unknownQuota, usageOf } = require('./structured.js')

// Codex prints one JSON event per line. Lines that are not JSON are skipped.
function codexEvents(stdout) {
  const events = []
  for (const line of stdout.split('\n')) {
    const event = parseObject(line.trim())
    if (event !== null) events.push(event)
  }
  return events
}

// The answer is the text of the last item.completed event whose item is an agent_message, and the usage is
// that of the last turn.completed event that has one. The field names are Spec Kit 1.1.3's, not yet checked
// against the installed codex: correct them here if the real events differ.
function readCodex(stdout) {
  let answer = ''
  let usage = {}
  for (const event of codexEvents(stdout)) {
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
      answer = event.item.text
    }
    if (event.type === 'turn.completed' && typeof event.usage === 'object' && event.usage !== null) usage = event.usage
  }
  return {
    answer,
    usage: usageOf({ input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cached_input_tokens }),
  }
}

function createCodex({ command = 'codex', groups = {}, exec = defaultExec, env = process.env } = {}) {
  return {
    name: 'codex',

    // The CLI takes no JSON schema on its command line, so the lane runner states the schema in the prompt.
    schemaInPrompt: true,

    installed() {
      return commandInstalled(command, env)
    },

    quota() {
      return unknownQuota(groups)
    },

    // One headless exec turn. The schema file and the timeout are not passed: the schema is in the prompt,
    // and the lane runner ends the run at its own timeout.
    argv({ model, prompt }) {
      return [command, 'exec', prompt, '--model', model, '--json', '--sandbox', 'workspace-write']
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
