'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')

test('aether-mode launches the Lead on Sonnet at xhigh, with the advisor off', () => {
  const FISH = `env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv`
  assert.ok(read('scripts', 'aether-mode.fish').includes(FISH))
})

test('the README shows the same launch for bash and zsh', () => {
  const LINE = `aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }`
  assert.ok(read('README.md').includes(LINE))
})

test('the manifest is version 0.5.0 and names the Lead, the Designer, the lanes and the autonomy', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.5.0')
  assert.match(manifest.description, /the Lead on Sonnet/)
  assert.match(manifest.description, /the Designer on Opus/)
  assert.match(manifest.description, /Lanes run its calls on other coding plans/)
  assert.match(manifest.description, /decides as the owner's delegate/)
})

test('the documents record the decisions and the verified facts', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17']) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  }
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lead and Designer findings \(2026-10-08\)$/m)
  for (const fact of ['agent_id', 'agent_type', 'cacheTtl', 'autoCompactWindow', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL']) {
    assert.ok(research.includes(fact), fact)
  }
  const v01 = read('docs', 'superpowers', 'specs', '2026-10-07-aether-plugin-design.md')
  const status = v01.split('\n').find((line) => line.startsWith('- **Status:**'))
  assert.match(status, /2026-10-08-lead-and-designer-design\.md/)
})

test('the documents record the lanes: decisions, facts, and the skills that use them', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A20', 'A21', 'A22']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-08, lanes\)\.\*\*/)
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lanes findings \(2026-10-08\)$/m)
  for (const fact of ['remaining_fraction', '--dangerously-skip-permissions', 'AGENTS.md', 'structured_output']) assert.ok(research.includes(fact), fact)
  const lead = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  for (const text of ['aether-lane design start --session', 'aether-lane design reply', 'aether-lane design end', '**Exit 3**', 'SendMessage']) {
    assert.ok(lead.includes(text), text)
  }
  const swarm = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const text of ['--no-lanes', 'laneFailure', '`aether-lane`', 'Blocked by a lane']) assert.ok(swarm.includes(text), text)
  assert.match(read('README.md'), /^### Lanes$/m)
  assert.match(read('README.md'), /^Version 0\.5: /m)
})

test('the documents record the autonomy: decisions, the README, and no per-stage gates', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A23', 'A24', 'A25']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-09, autonomy\)\.\*\*/)
  const readme = read('README.md')
  assert.match(readme, /^### Autonomy$/m)
  assert.ok(readme.includes('| `aether-autonomy` |'))
  assert.ok(readme.includes('docs/superpowers/specs/2026-10-09-lead-autonomy-design.md'))
  assert.doesNotMatch(readme, /approves the spec and the plan/)
  assert.doesNotMatch(readme, /the relay of both sides/)
})
