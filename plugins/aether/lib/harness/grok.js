'use strict'

// The Grok harness: the headless command line, and a run judged from the one JSON object grok prints.

const { commandInstalled } = require('../lanes.js')
const { defaultExec, extractJsonObject, parseRun, readVersion, unknownQuota, usageOf } = require('./structured.js')

// Grok's answer is the first of these fields that holds a string.
const ANSWER_FIELDS = ['result', 'response', 'text', 'output']

// Grok prints one JSON object: its answer is the first string among ANSWER_FIELDS, and its usage is the usage
// object. The names are Spec Kit 1.1.3's, not yet checked against the installed grok: correct them here if the
// real output differs.
function readGrok(stdout) {
  const data = extractJsonObject(stdout) ?? {}
  const field = ANSWER_FIELDS.find((name) => typeof data[name] === 'string')
  const usage = data.usage ?? {}
  return {
    answer: field === undefined ? '' : data[field],
    usage: usageOf({ input: usage.input_tokens, output: usage.output_tokens, total: usage.total_tokens }),
  }
}

function createGrok({ command = 'grok', groups = {}, exec = defaultExec, env = process.env } = {}) {
  return {
    name: 'grok',

    // The CLI takes no JSON schema on its command line, so the lane runner states the schema in the prompt.
    schemaInPrompt: true,

    installed() {
      return commandInstalled(command, env)
    },

    quota() {
      return unknownQuota(groups)
    },

    // One headless turn that approves the actions it takes. The schema file and the timeout are not passed:
    // the schema is in the prompt, and the lane runner ends the run at its own timeout.
    argv({ model, prompt }) {
      return [command, '-p', prompt, '--always-approve', '--model', model, '--output-format', 'json']
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
