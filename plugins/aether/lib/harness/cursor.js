'use strict'

// The Cursor harness: the headless command line, and a run judged from the one JSON object cursor-agent prints.

const { commandInstalled } = require('../lanes.js')
const { defaultExec, extractJsonObject, parseRun, readVersion, stringsIn, unknownQuota, usageOf } = require('./structured.js')

// Cursor prints one JSON object: its answer is the result field, and its usage is the usage object. Every other
// field is outside the answer, where a quota line may sit; without an object, all of the output is outside it. The
// names are Spec Kit 1.1.3's, not yet checked against the installed cursor-agent: correct them here if the real
// output differs.
function readCursor(stdout) {
  const data = extractJsonObject(stdout)
  if (data === null) return { answer: '', usage: usageOf({}), outside: stdout }
  const usage = data.usage ?? {}
  return {
    answer: typeof data.result === 'string' ? data.result : '',
    usage: usageOf({ input: usage.input_tokens, output: usage.output_tokens, total: usage.total_tokens }),
    outside: Object.entries(data)
      .filter(([key]) => key !== 'result')
      .flatMap(([, value]) => stringsIn(value))
      .join('\n'),
  }
}

function createCursor({ command = 'cursor-agent', groups = {}, exec = defaultExec, env = process.env } = {}) {
  return {
    name: 'cursor',

    // The CLI takes no JSON schema on its command line, so the lane runner states the schema in the prompt.
    schemaInPrompt: true,

    installed() {
      return commandInstalled(command, env)
    },

    quota() {
      return unknownQuota(groups)
    },

    // One headless turn, trusted and with its MCP servers approved, since no one answers its prompts. The
    // schema file and the timeout are not passed: the schema is in the prompt, and the lane runner ends the
    // run at its own timeout.
    argv({ model, prompt }) {
      return [command, '-p', '--trust', '--approve-mcps', '--force', prompt, '--model', model, '--output-format', 'json']
    },

    parse(raw, { required = [] } = {}) {
      return parseRun(raw, readCursor, required)
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

module.exports = { createCursor }
