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

test('the manifest has no dependencies, and declares the superdelegation, harnesses, ops, router, decider, fallback and deadlines options, and the lanes and seats legacy keys', () => {
  const manifest = json(PLUGIN, '.claude-plugin', 'plugin.json')
  assert.equal(manifest.name, 'aether')
  assert.equal('dependencies' in manifest, false)
  const { lanes, seats, superdelegation, ...rest } = manifest.userConfig
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
    router: {
      type: 'string',
      title: 'Delegate router',
      description:
        "Who chooses the model and effort of the Lead's delegate tasks: record (the Lead chooses, and Aether records what the decider would have chosen, in the background), advise (the Lead also gets the decider's choice as a notice) or command (the decider chooses, unless the Lead overrides it with a reason). It applies only to the Lead's delegate tasks, never to the swarm, the design seats or the aether agents. Default: record.",
      default: 'record',
      options: ['record', 'advise', 'command'],
    },
    decider: {
      type: 'string',
      title: 'Router decider',
      description:
        'What decides for the router: haiku (Claude Haiku at low effort, with no outside service) or jev (typesafe/jev-1.14 on OpenRouter: it sends each delegate brief to a third party, and needs OPENROUTER_API_KEY in the environment or in the .env of the plugin data directory). Default: haiku.',
      default: 'haiku',
      options: ['haiku', 'jev'],
    },
    fallback: {
      type: 'string',
      title: 'Router fallback rung',
      description:
        'The model and effort a delegate task runs on when the router cannot decide and the Lead asked for none, written as alias:effort. The aliases are haiku, sonnet and opus; the efforts are low, medium, high, xhigh and max. Default: sonnet:high.',
      default: 'sonnet:high',
    },
    deadlines: {
      type: 'string',
      title: 'Router time limits',
      description:
        'How long the router waits, in seconds, for each decider and for the quota decision, written as haiku=8,jev=3,quota=3; a value above 10 counts as 10. In record mode nothing waits, because the decider runs in the background. Default: haiku=8,jev=3,quota=3.',
      default: 'haiku=8,jev=3,quota=3',
    },
  })
  assert.deepEqual(superdelegation, {
    type: 'boolean',
    title: 'Superdelegation',
    description:
      "Send everything that is not the Lead to other harnesses (agy, grok, ...) while their quota lasts; native Claude is the fallback. Off by default: the external CLIs run without permission prompts and spend other plans' quota. Linux only. Replaces the lanes and seats options.",
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
  assert.deepEqual(Object.keys(userConfig).sort(), ['deadlines', 'decider', 'fallback', 'harnesses', 'lanes', 'ops', 'router', 'seats', 'superdelegation'])
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
