'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')

test('the documents record the lanes: decisions, facts, and the skills that use them', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A20', 'A21', 'A22']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-08, lanes\)\.\*\*/)
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lanes findings \(2026-10-08\)$/m)
  for (const fact of ['remaining_fraction', '--dangerously-skip-permissions', 'AGENTS.md', 'structured_output']) assert.ok(research.includes(fact), fact)
  const lead = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  for (const text of ['`aether:judge`', '`aether:writer`', 'At most two revisions per document', '.aether/pending.jsonl', 'SendMessage']) {
    assert.ok(lead.includes(text), text)
  }
  const swarm = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const text of ['--no-lanes', 'laneFailure', '`aether-lane`', 'Blocked by a lane']) assert.ok(swarm.includes(text), text)
  assert.match(read('README.md'), /^### Lanes$/m)
  assert.match(read('README.md'), /^Version 0\.8: /m)
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

const README = () => read('README.md')

// A README section: from its heading to the next heading of level 2 or 3.
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`)
  assert.ok(start >= 0, `the README has ${heading}`)
  const rest = text.slice(start + heading.length + 2)
  const end = rest.search(/\n##+ /)
  return end < 0 ? rest : rest.slice(0, end)
}

test('the README installs Aether with Claude Code, and starts it with one native command', () => {
  const readme = README()
  const lines = [
    'claude plugin install aether --marketplace DarkArty07/aether-plugin',
    '/plugin install aether --marketplace DarkArty07/aether-plugin',
    '--config lanes=true',
    'claude --agent aether:lead --effort xhigh',
    '{ "agent": "aether:lead", "effortLevel": "xhigh" }',
    'claude --agent claude',
    'Plain `claude` stays normal mode: the plugin is dormant there.',
    'claude plugin update aether@aether-plugin',
    'claude plugin uninstall aether@aether-plugin',
    '--keep-data',
    'claude plugin configure aether@aether-plugin',
    '~/.claude/plugins/data/aether-aether-plugin/',
    '/advisor off',
    'Dynamic workflows',
    'Not verified on a Mac',
    'Never remove the marketplace to change versions',
    'claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh',
    'claude plugin tag plugins/aether',
    'docs/superpowers/specs/2026-10-09-installable-plugin-design.md',
  ]
  for (const line of lines) assert.ok(readme.includes(line), line)
})

test('the guide has its parts in order', () => {
  const readme = README()
  const headings = [
    '## Use Aether mode', '### Requirements', '### Install', '### Start', '### Options', '### What you set yourself',
    '### Platforms', '### Update, pin, roll back and uninstall', '### Data', '### Upgrading from 0.6', '## Development', '### Release',
  ]
  let at = -1
  for (const h of headings) {
    const i = readme.indexOf(`\n${h}\n`)
    assert.ok(i > at, `${h} comes after the part before it`)
    at = i
  }
})

test('only "Upgrading from 0.6" names the old launcher, installer and data directory', () => {
  const readme = README()
  const upgrading = section(readme, '### Upgrading from 0.6')
  const rest = readme.replace(upgrading, '')
  for (const old of ['aether-mode', 'aether-install', '.local/share/aether-plugin']) assert.ok(!rest.includes(old), old)
  for (const text of ['"source": "git"', '"url": "file://', '"ref": "aether--v0.7.0"', 'claude plugin install aether@aether-plugin --config lanes=true', '/advisor off']) {
    assert.ok(upgrading.includes(text), text)
  }
})

test('the installer and the fish launcher are gone', () => {
  for (const file of ['scripts/aether-install.js', 'scripts/aether-mode.fish', 'tests/aether-install.test.js']) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), false, file)
  }
})

test('the manifest is version 0.8.0, and the README says so', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.8.0')
  assert.match(manifest.description, /built for RADAR/)
  assert.match(manifest.description, /the owner's right hand/)
  assert.match(manifest.description, /a Judge on Opus reviews them/)
  assert.match(manifest.description, /Lanes run its calls on other coding plans/)
  assert.match(README(), /^Version 0\.8: /m)
})

test('the documents record RADAR: the roadmap, decisions A31-A38, and a README without superpowers as a requirement', () => {
  const decisions = read('docs', 'decisions.md')
  for (let n = 31; n <= 38; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
  assert.match(decisions, /\*\*Update \(2026-10-10, RADAR\)\.\*\*/)
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'roadmap', '2026-10-10-radar.md')))
  const readme = README()
  for (const text of ['**Rápido**', '**Autónomo**', '**Delegación**', '**Asequible**', '**Robusto**', '`aether:writer`', '`aether:judge`', 'specs/NNN-<topic>/', 'AETHER_IRREVERSIBLE=enforce', '`harnesses`']) {
    assert.ok(readme.includes(text), text)
  }
  assert.ok(!section(readme, '### Requirements').includes('superpowers'))
  assert.ok(!readme.includes('aether:designer'))
})

test('no file of the plugin names a machine path, the old launcher or a shell', () => {
  const files = fs.readdirSync(PLUGIN, { recursive: true }).filter((f) => fs.statSync(path.join(PLUGIN, f)).isFile())
  for (const f of files) {
    const text = fs.readFileSync(path.join(PLUGIN, f), 'utf8')
    for (const word of ['.local/share', 'aether-mode', 'fish']) assert.ok(!text.includes(word), `${f} names ${word}`)
  }
})

test('the documents record the decisions and the verified facts', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A26', 'A27', 'A28', 'A29']) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  }
  assert.ok(decisions.includes('Since 0.7.0 (A27), the plugin is installed from the `aether-plugin` marketplace'))
  assert.ok(decisions.includes('Since 0.7.0, the Lead is the agent `aether:lead`'))
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lead and Designer findings \(2026-10-08\)$/m)
  assert.match(research, /^## Installable plugin findings \(2026-10-09\)$/m)
  for (const fact of ['agent_id', 'agent_type', 'cacheTtl', 'autoCompactWindow', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL', 'CLAUDE_ENV_FILE', 'allowCrossMarketplaceDependenciesOn', 'extraKnownMarketplaces', 'agent.offer', 'port 0']) {
    assert.ok(research.includes(fact), fact)
  }
  const v01 = read('docs', 'superpowers', 'specs', '2026-10-07-aether-plugin-design.md')
  const status = v01.split('\n').find((line) => line.startsWith('- **Status:**'))
  assert.match(status, /2026-10-08-lead-and-designer-design\.md/)
})
