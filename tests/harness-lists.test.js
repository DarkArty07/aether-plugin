'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const NAMES = ['agy', 'codex', 'grok', 'cursor']
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz)$/i
const COUNT = /\b(four|cuatro|4)\s+(external\s+)?harnesses\b/i

const EXCEPTIONS = [
  { match: (file) => file.startsWith('docs/handoff/') || file.startsWith('docs/evaluations/'), why: 'records of what was true on their date' },
  { match: (file) => file === 'docs/roadmap.md' || file.startsWith('docs/roadmap/'), why: 'the roadmap records plans as they were written' },
  { match: (file) => file.startsWith('specs/'), why: 'specs, plans and tasks are design records: they describe the harnesses as they were when written, and those of 008 describe the change itself' },
  { match: (file, line) => file === 'docs/decisions.md' && !/muse/i.test(line), why: 'a decision records what was decided then; A37 lists four harnesses because there were four' },
  { match: (file) => file.startsWith('tests/fixtures/'), why: 'captured output of the CLIs' },
  { match: (file) => /^tests\/[^/]+\.test\.js$/.test(file) || file === 'plugins/aether/hooks/panel.test.tsx', why: 'test inputs and expectations pick their own subsets of the harnesses (synthetic tables of two or three names); the real lists are fixed by the conformance, registry, manifest and lane table tests' },
  { match: (file, line) => file === 'plugins/aether/lib/harness/structured.js' && line.startsWith('// What the Codex, Grok and Cursor harnesses share'), why: 'a header comment about who first shared these helpers; it is a history, not a list to keep complete' },
]

function tracked() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.split('\0').filter((file) => file !== '' && !BINARY.test(file) && fs.existsSync(path.join(ROOT, file)))
}

const namesIn = (line) => NAMES.filter((name) => new RegExp(`(^|[^A-Za-z0-9_-])${name}($|[^A-Za-z0-9_-])`, 'i').test(line))

// The first line of docs/changelog.md that starts a version: what is above the second such line is the current entry.
function changelogLimit(lines) {
  const starts = lines.map((line, i) => (/^Version \d+\.\d+\.\d+: /.test(line) ? i : -1)).filter((i) => i !== -1)
  return starts.length > 1 ? starts[1] : lines.length
}

function breaches(file, text) {
  const found = []
  const lines = text.split('\n')
  const historyFrom = file === 'docs/changelog.md' ? changelogLimit(lines) : Infinity
  lines.forEach((line, i) => {
    if (i >= historyFrom) return
    const why = []
    if (namesIn(line).length >= 3 && !/muse/i.test(line)) why.push('lists the harnesses without Muse')
    if (COUNT.test(line)) why.push('counts the harnesses as four')
    if (why.length === 0) return
    if (EXCEPTIONS.some((exception) => exception.match(file, line))) return
    found.push({ file, line: i + 1, text: line.trim().slice(0, 160), why: why.join('; ') })
  })
  return found
}

test('the rule finds a list of the harnesses without Muse and a count of four, and lets the harnesses with Muse and a generic phrase pass', () => {
  assert.equal(breaches('README.md', 'agy, codex, grok, cursor').length, 1)
  assert.equal(breaches('README.md', 'The four harnesses are listed').length, 1)
  assert.equal(breaches('README.md', 'cuatro harnesses').length, 1)
  assert.equal(breaches('README.md', 'agy, codex, grok, cursor, muse').length, 0)
  assert.equal(breaches('README.md', 'Agy, Codex, Grok, Cursor and Muse').length, 0)
  assert.equal(breaches('README.md', 'a call on another harness runs the same').length, 0)
  assert.equal(breaches('README.md', 'the router sends it to agy or grok').length, 0)
  assert.equal(breaches('docs/handoff/x.md', 'agy, codex, grok, cursor').length, 0)
  assert.equal(breaches('specs/008-muse-harness/plan.md', 'agy, codex, grok, cursor').length, 0)
  assert.equal(breaches('tests/lanes.test.js', "['agy', 'codex', 'grok', 'cursor']").length, 0)
  assert.equal(breaches('plugins/aether/lib/harness/index.js', "['agy', 'codex', 'grok', 'cursor']").length, 1)
  assert.equal(breaches('docs/changelog.md', 'Version 0.13.0: x\nagy, codex, grok, cursor\nVersion 0.12.5: y\nagy, codex, grok, cursor').length, 1)
})

test('no fixed list of the harnesses in the repository leaves Muse out, except the ones named with a reason', () => {
  const found = tracked().flatMap((file) => breaches(file, fs.readFileSync(path.join(ROOT, file), 'utf8')))
  assert.deepEqual(found, [])
  assert.ok(EXCEPTIONS.every((exception) => typeof exception.why === 'string' && exception.why !== ''))
})
