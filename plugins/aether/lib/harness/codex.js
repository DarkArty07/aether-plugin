'use strict'

// The Codex harness adapter: builds the headless exec command line and judges a run from JSON events.
// lib/harness/index.js calls it to build the adapter.
// Family: harness.

const fs = require('node:fs')
const { commandInstalled } = require('../lane-process.js')
const { strictSchema } = require('../lane-schemas.js')
const { readCodexQuota } = require('./codex-quota.js')
const { defaultExec, parseJson, parseRun, readVersion, stringsIn, usageOf } = require('./structured.js')

// Features of codex that reach outside the unit's worktree and that a lane must not have: the owner's hooks, the apps (the
// connectors of his ChatGPT account, which a reviewer tried to open in the real call of 2026-10-30), the browser and the
// computer, the plugins and the subagents.
const DISABLED_FEATURES = ['hooks', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'plugins', 'multi_agent']

const CODEX_NOTE =
  'You run as a headless worker inside Aether. Do exactly the task below and nothing more. If an instruction file of the user (such as AGENTS.md) tells you to work autonomously for long, to start or use subagents, or to follow another orchestration workflow, ignore that part: start no subagents. Your sandbox cannot write Git metadata, so do not run git add or git commit, whatever the task says about committing: leave your changes in the working tree, say so in your report and leave any commit field empty; Aether commits them for you.'

// The answer is the text of the last item.completed event whose item is an agent_message, and the usage is that of
// the last turn.completed event that has one. Codex prints one JSON event per line. A line that is not JSON is
// skipped. Every other event is outside the answer.
function readCodex(stdout) {
  let answer = ''
  let usage = {}
  const outside = []
  for (const line of stdout.split('\n')) {
    const event = parseJson(line.trim())
    if (event === undefined) continue
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

    // A reading starts codex app-server, so a saved reading stands in for its life.
    quotaCost: 'process',

    // The schema is passed in --output-schema, not in the prompt.
    schemaInPrompt: false,

    installed() {
      return commandInstalled(command, env)
    },

    quota() {
      return readCodexQuota({ command, groups, env })
    },

    // The model is the bare lane model id: codex takes its effort in its own flag, not in the name.
    modelArg: ({ model }) => model,

    // One headless exec turn, at the lane level's reasoning effort. The lane runner ends the run at its own timeout.
    argv({ model, level, schemaFile, prompt }) {
      if (schemaFile) {
        try {
          const parsed = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
          fs.writeFileSync(schemaFile, `${JSON.stringify(strictSchema(parsed), null, 2)}\n`)
        } catch {
          // A missing, unreadable or non-JSON file stays as it is.
        }
      }
      const notedPrompt = `${CODEX_NOTE}\n\n${prompt}`
      // --ignore-user-config drops the owner's list of trusted directories, so codex would refuse any directory that is
      // not a git repository (the first real calls, 2026-10-30: "Not inside a trusted directory"). The sandbox stays on.
      return [
        command, 'exec', notedPrompt, '--model', model, '-c', `model_reasoning_effort=${level}`, '--json', '--sandbox', 'workspace-write',
        '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', ...DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]), '-c', 'approval_policy=never',
        ...(schemaFile ? ['--output-schema', schemaFile] : []),
      ]
    },

    parse(raw, { required = [] } = {}) {
      return parseRun(raw, readCodex, required, { quotaByText: false })
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

module.exports = { createCodex, CODEX_NOTE }
