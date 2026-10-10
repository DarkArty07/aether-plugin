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
          "Aether mode: the Lead on Sonnet as the owner's right hand, a Judge on Opus, and a parallel swarm that implements approved plans. Start it with claude --agent aether:lead --effort xhigh.",
      },
    ],
  })
})

test('the manifest has no dependencies, and declares the lanes option, off by default', () => {
  const manifest = json(PLUGIN, '.claude-plugin', 'plugin.json')
  assert.equal(manifest.name, 'aether')
  assert.equal('dependencies' in manifest, false)
  assert.deepEqual(manifest.userConfig, {
    lanes: {
      type: 'boolean',
      title: 'Lanes',
      description:
        "Run Aether's calls on agy while its quota lasts. Off by default: agy runs with --dangerously-skip-permissions and spends another plan's quota. Linux only.",
      default: false,
    },
  })
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
