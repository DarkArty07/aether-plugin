'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')

// Spec 004: the README is the way in, and what it used to hold lives in the pages of docs/. `docs()` is the README
// and those pages as one text, for an assertion that looks for a string anywhere; an assertion about a heading or a
// section reads the page that keeps it (`page()`).
const DOC_FILES = [
  'README.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/reference/components.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md', 'docs/index.md',
]
const page = (file) => read(...file.split('/'))
const docs = () => DOC_FILES.map(page).join('\n')

test('the documents record the lanes: decisions, facts, and the skills that use them', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A20', 'A21', 'A22']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-08, lanes\)\.\*\*/)
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lanes findings \(2026-10-08\)$/m)
  for (const fact of ['remaining_fraction', '--dangerously-skip-permissions', 'AGENTS.md', 'structured_output']) assert.ok(research.includes(fact), fact)
  const lead = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  for (const text of ['`aether:judge`', '`aether:writer`', 'At most two revisions per document', '.aether/pending.jsonl']) {
    assert.ok(lead.includes(text), text)
  }
  const swarm = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const text of ['--no-lanes', 'laneFailure', '`aether-lane`', 'Blocked by a lane']) assert.ok(swarm.includes(text), text)
  assert.match(page('docs/guide/lanes.md'), /^### Lanes$/m)
  assert.match(page('docs/changelog.md'), /^Version 0\.9: /m)
})

test('the documents record the autonomy: decisions, the README, and no per-stage gates', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A23', 'A24', 'A25']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-09, autonomy\)\.\*\*/)
  const readme = docs()
  assert.match(page('docs/guide/autonomy.md'), /^### Autonomy$/m)
  assert.ok(page('docs/reference/components.md').includes('| `aether-autonomy` |'))
  // docs/guide/autonomy.md links this as ../../docs/..., which keeps the full path.
  assert.ok(readme.includes('docs/superpowers/specs/2026-10-09-lead-autonomy-design.md'))
  assert.doesNotMatch(readme, /approves the spec and the plan/)
  assert.doesNotMatch(readme, /the relay of both sides/)
})

const README = docs

// A section of a page: from its heading to the next heading of level 2 or 3.
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`)
  assert.ok(start >= 0, `the page has ${heading}`)
  const rest = text.slice(start + heading.length + 2)
  const end = rest.search(/\n##+ /)
  return end < 0 ? rest : rest.slice(0, end)
}

test('the documents install Aether with Claude Code, and start it with one native command', () => {
  const readme = README()
  const lines = [
    'claude plugin install aether --marketplace DarkArty07/aether-plugin',
    '/plugin install aether --marketplace DarkArty07/aether-plugin',
    '--config lanes=true',
    'claude --agent aether:lead --effort max',
    '{ "agent": "aether:lead" }',
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
    'claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort max',
    'claude plugin tag plugins/aether',
    // docs/changelog.md links this as ../docs/..., which keeps the full path.
    'docs/superpowers/specs/2026-10-09-installable-plugin-design.md',
  ]
  for (const line of lines) assert.ok(readme.includes(line), line)
})

test('the guide has its parts in order, each page keeping its own in their order', () => {
  // The twelve headings of the guide, in their old order, with the page that keeps each now.
  const parts = [
    ['## Use Aether mode', 'docs/getting-started.md'], ['### Requirements', 'docs/getting-started.md'],
    ['### Install', 'docs/getting-started.md'], ['### Start', 'docs/getting-started.md'],
    ['### Options', 'docs/guide/options.md'], ['### What you set yourself', 'docs/guide/options.md'],
    ['### Platforms', 'docs/guide/maintenance.md'], ['### Update, pin, roll back and uninstall', 'docs/guide/maintenance.md'],
    ['### Data', 'docs/guide/maintenance.md'], ['### Upgrading from 0.6', 'docs/guide/maintenance.md'],
    ['## Development', 'docs/contributing.md'], ['### Release', 'docs/contributing.md'],
  ]
  const at = {}
  for (const [h, file] of parts) {
    const i = page(file).indexOf(`\n${h}\n`)
    assert.ok(i >= 0, `${file} has ${h}`)
    assert.ok(i > (at[file] ?? -1), `${h} comes after the part before it in ${file}`)
    at[file] = i
  }
})

test('only "Upgrading from 0.6" names the old launcher, installer and data directory', () => {
  const upgrading = section(page('docs/guide/maintenance.md'), '### Upgrading from 0.6')
  // Each file is read without its own "Upgrading from 0.6", so the check holds whichever page keeps it.
  const without = (text) => {
    const start = text.indexOf('\n### Upgrading from 0.6\n')
    if (start < 0) return text
    const after = text.slice(start + 1)
    const next = after.slice(1).search(/\n##+ /)
    return text.slice(0, start) + (next < 0 ? '' : after.slice(next + 1))
  }
  const rest = DOC_FILES.map((file) => without(page(file))).join('\n')
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

test('the manifest is version 0.12.7, and the documents say so', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.12.7')
  assert.match(manifest.description, /built for RADAR/)
  assert.match(manifest.description, /the owner's right hand/)
  assert.match(manifest.description, /a Judge on Opus reviews them/)
  assert.match(manifest.description, /Lanes run its calls on other coding plans/)
  assert.match(manifest.description, /the seats option lets stronger models of other harnesses take the Judge, the Writer and the Examiner/)
  assert.match(page('docs/changelog.md'), /^Version 0\.12\.4: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.12\.3: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.12\.2: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.12\.1: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.12\.0: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.11\.0: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.10\.0: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.9\.1: /m)
  assert.match(page('docs/changelog.md'), /^Version 0\.9: /m)
})

test('the decisions record the 0.9.1 fixes, A44-A47', () => {
  const decisions = read('docs', 'decisions.md')
  for (let n = 44; n <= 47; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
})

test('the documents record RADAR: the roadmap, decisions A31-A38, and documents without superpowers as a requirement', () => {
  const decisions = read('docs', 'decisions.md')
  for (let n = 31; n <= 38; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
  assert.match(decisions, /\*\*Update \(2026-10-10, RADAR\)\.\*\*/)
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'roadmap', '2026-10-10-radar.md')))
  const readme = README()
  for (const text of ['**Rápido**', '**Autónomo**', '**Delegación**', '**Asequible**', '**Robusto**', '`aether:writer`', '`aether:judge`', 'specs/NNN-<topic>/', 'AETHER_IRREVERSIBLE=enforce', '`harnesses`']) {
    assert.ok(readme.includes(text), text)
  }
  for (const [file, heading] of [['README.md', '## Requirements'], ['docs/getting-started.md', '### Requirements']]) {
    assert.ok(!section(page(file), heading).includes('superpowers'), `${file} ${heading}`)
  }
  assert.ok(!readme.includes('aether:designer'))
})

// Two files of the plugin name fish, each with its reason: the launcher says it works the same from bash, fish and zsh,
// and aether-first-setup gives the line that puts a directory on the PATH for each of those shells.
const NAMES_FISH = { 'launcher/aether-lead': 'it says it is the same in every shell', 'lib/first-setup.js': 'the hint for the PATH is given for fish too' }

test('no file of the plugin names a machine path, the old launcher or a shell', () => {
  const files = fs.readdirSync(PLUGIN, { recursive: true }).filter((f) => fs.statSync(path.join(PLUGIN, f)).isFile())
  for (const f of files) {
    const text = fs.readFileSync(path.join(PLUGIN, f), 'utf8')
    for (const word of ['.local/share', 'aether-mode', 'fish']) {
      if (word === 'fish' && f in NAMES_FISH) continue
      assert.ok(!text.includes(word), `${f} names ${word}`)
    }
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

test('the documents record the design seats: decisions A39-A43, the README, the skill and the evaluation', () => {
  const decisions = read('docs', 'decisions.md')
  for (let n = 39; n <= 43; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
  const readme = README()
  assert.match(page('docs/guide/design-seats.md'), /^### Design seats$/m)
  for (const text of ['`aether:examiner`', '`aether-lane seat`', '`aether-exam`', '`seats`, `balanced` by default', 'docs/evaluations/seats/README.md', 'specs/001-design-seats/spec.md', 'Fable']) {
    assert.ok(readme.includes(text), text)
  }
  const lead = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  for (const text of ['/aether:design', 'aether-exam run', 'aether-report --seats', 'seat/<id>', '`aether:examiner`']) {
    assert.ok(lead.includes(text), text)
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'evaluations', 'seats', 'harness', 'judge-defects.js')))
  assert.ok(fs.existsSync(path.join(ROOT, 'specs', '001-design-seats', 'plan.md')))
})

test('the documents record the super Lead: A48, the three paths in the documents, and no text that says the Lead runs on Sonnet as a fact', () => {
  const decisions = read('docs', 'decisions.md')
  const lines = decisions.split('\n')
  const rows = lines.filter((line) => line.startsWith('| A48 |'))
  assert.equal(rows.length, 1)
  // A later decision (A49...) may follow it: A48 only has to come after A47.
  const a47 = lines.findIndex((line) => line.startsWith('| A47 |'))
  assert.ok(a47 >= 0 && lines.indexOf(rows[0]) > a47, 'A48 comes after A47')
  for (const text of ['three paths', 'specs/003-super-lead/spec.md', '2026-10-14', 'never inherited', 'never a fork', 'Fable 5.1 excluded (A43)', 'first 2,000 characters']) {
    assert.ok(rows[0].includes(text), text)
  }
  for (const id of ['A11', 'A15', 'A16']) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|.*updated by A48`, 'mi'), id)
  }
  assert.match(decisions, /^\*\*Update \(2026-10-14, super Lead; D5 updated by A48\)\.\*\*/m)
  const readme = README()
  assert.match(page('docs/methodology.md'), /^\*\*The three paths\.\*\*/m)
  for (const text of ['**Direct:**', '**Delegate task:**', '**Swarm:**', 'the route and the path (direct, delegate task, swarm)', 'a delegate task on a model it names, or the swarm']) {
    assert.ok(readme.includes(text), text)
  }
  for (const text of ['main session, on Sonnet', 'main session, Sonnet', '`aether:lead`, on Sonnet', 'itself, one subagent, or the swarm']) {
    assert.ok(!readme.includes(text), `the README no longer says "${text}"`)
  }
  for (const file of [[ROOT, '.claude-plugin', 'marketplace.json'], [PLUGIN, '.claude-plugin', 'plugin.json']]) {
    const description = fs.readFileSync(path.join(...file), 'utf8')
    assert.match(description, /starts on Sonnet|starting on Sonnet/, file.join('/'))
    assert.ok(description.includes('three paths'), file.join('/'))
    assert.ok(!description.includes('Lead on Sonnet'), file.join('/'))
  }
  for (const skill of ['using-aether', 'swarm']) {
    assert.ok(!read('plugins', 'aether', 'skills', skill, 'SKILL.md').includes('the main session, on Sonnet'), skill)
  }
})
