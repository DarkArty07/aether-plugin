'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'))

test('the repository is a marketplace that lists the aether plugin', () => {
  assert.deepEqual(json(ROOT, '.claude-plugin', 'marketplace.json'), {
    name: 'aether-plugin',
    owner: { name: 'DarkArty07' },
    description: 'Aether Plugin: an opt-in Aether mode for Claude Code, built for RADAR: a Lead, a Writer, a Judge and a supervised swarm.',
    plugins: [
      {
        name: 'aether',
        source: './plugins/aether',
        description:
          "Aether mode: the Lead as the owner's right hand, starting on Sonnet and working along three paths (itself, delegate tasks on models it chooses, or the swarm), a Judge on Opus, and a parallel swarm that implements approved plans. Start it with claude --agent aether:lead --effort xhigh.",
      },
    ],
  })
})

test('the manifest has no dependencies, and declares the superdelegation, harnesses, ops, deadlines, quotabrake and brakepush options, and the lanes and seats legacy keys', () => {
  const manifest = json(PLUGIN, '.claude-plugin', 'plugin.json')
  assert.equal(manifest.name, 'aether')
  assert.equal('dependencies' in manifest, false)
  const { lanes, seats, superdelegation, quotabrake, brakepush, ...rest } = manifest.userConfig
  assert.deepEqual([quotabrake.type, quotabrake.default, brakepush.type, brakepush.default], ['string', '95', 'boolean', false])
  assert.deepEqual(rest, {
    harnesses: {
      type: 'string',
      title: 'Lane harnesses',
      description:
        "The external harnesses superdelegation may use, comma-separated: agy, codex, grok, cursor, muse. The quota decides the order of the candidates, then the cost per task. Default: agy. Each one runs its CLI without permission prompts in Aether's transactional worktree, with your git, GitHub, package-registry and cloud credentials kept out of its environment. Turn one on only once you accept that risk.",
      default: 'agy',
    },
    ops: {
      type: 'boolean',
      title: 'Ops in the mod',
      description:
        "Run the swarm's own aether-wt and aether-lane commands in the mod, without a model. On by default. Turn it off when your project's test command needs your shell's environment, which the mod's does not have: the Haiku ops agent then runs them with the Bash tool, as before 0.8.",
      default: true,
    },
    deadlines: {
      type: 'string',
      title: 'Delegate time limits',
      description:
        'How long a delegate task waits, in seconds, for the quota decision, written as quota=3; a value above 10 counts as 10. Default: quota=3.',
      default: 'quota=3',
    },
  })
  assert.deepEqual(superdelegation, {
    type: 'boolean',
    title: 'Superdelegation',
    description:
      "Send everything that is not the Lead to other harnesses (agy, grok, muse, ...) while their quota lasts; native Claude is the fallback. It covers the swarm, the design seats and the Lead's delegate tasks: the ones that only read go to the harness the one rule picks, and the ones that edit files go first to another harness on a worktree of their own, which the Lead merges. Off by default: the external CLIs run without permission prompts and spend other plans' quota. Linux only. Replaces the lanes and seats options.",
  })
  assert.deepEqual(lanes, {
    type: 'boolean',
    title: 'Lanes (legacy)',
    description: 'Replaced by superdelegation. Read only when superdelegation is not set: on counts as superdelegation on.',
    default: false,
  })
  assert.deepEqual(seats, {
    type: 'string',
    title: 'Design seats (legacy)',
    description: 'Ignored. The design seats follow superdelegation now; native, balanced and robust no longer exist.',
  })
})

test('superdelegation is a boolean with no default, and lanes and seats stay only as legacy keys', () => {
  const { userConfig } = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(userConfig.superdelegation.type, 'boolean')
  assert.equal(userConfig.superdelegation.title, 'Superdelegation')
  assert.equal('default' in userConfig.superdelegation, false)
  assert.match(userConfig.superdelegation.description, /^Send everything that is not the Lead to other harnesses/)
  assert.match(userConfig.superdelegation.description, /Off by default/)
  assert.equal(userConfig.lanes.title, 'Lanes (legacy)')
  assert.equal(userConfig.lanes.default, false)
  assert.equal(userConfig.seats.title, 'Design seats (legacy)')
  assert.equal(userConfig.seats.type, 'string')
  assert.equal('options' in userConfig.seats, false)
  assert.equal('default' in userConfig.seats, false)
  assert.deepEqual(Object.keys(userConfig).sort(), ['brakepush', 'deadlines', 'harnesses', 'lanes', 'ops', 'quotabrake', 'seats', 'superdelegation'])
})

test('the manifest no longer declares router, decider or fallback, and deadlines is the quota deadline alone (C7)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  for (const key of ['router', 'decider', 'fallback']) assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
  assert.equal(manifest.userConfig.deadlines.default, 'quota=3')
})

test("the Lead agent runs on Sonnet, with no body, so Claude Code's own system prompt stays", () => {
  assert.equal(
    fs.readFileSync(path.join(PLUGIN, 'agents', 'lead.md'), 'utf8'),
    '---\nname: lead\ndescription: "Aether Lead: the main session of Aether mode, started with claude --agent aether:lead --effort xhigh. It is not a subagent."\nmodel: sonnet\n---\n',
  )
})

test('validate checks the plugin and the marketplace', () => {
  assert.equal(json(ROOT, 'package.json').scripts.validate, 'claude plugin validate plugins/aether --strict && claude plugin validate . --strict')
})
