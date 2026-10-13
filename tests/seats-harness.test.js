'use strict'

// The Judge seat's measurement harness (docs/evaluations/seats/harness): reading an answer, scoring it
// against a fixture's key, and a whole run with a scripted Judge in place of a model.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')

const HARNESS = path.join(__dirname, '..', 'docs', 'evaluations', 'seats', 'harness')
const { parseJudgeText, score, main } = require(path.join(HARNESS, 'judge-defects.js'))
const key = (name) => JSON.parse(fs.readFileSync(path.join(HARNESS, 'fixtures', name, 'key.json'), 'utf8'))

test("parseJudgeText reads the Judge's indented block", () => {
  const text = [
    '    ## Verdict',
    '    revise',
    '    ## Findings',
    '    1. [major] C2 is not testable — `C2: Sign-up feels fast.` — give a number',
    '    2. [minor] Wording — `R1` — say "answers"',
    '    ## Open questions',
    '    - none',
  ].join('\n')
  assert.deepEqual(parseJudgeText(text), {
    verdict: 'revise',
    findings: [
      { severity: 'major', title: 'C2 is not testable', evidence: '`C2: Sign-up feels fast.`', fix: 'give a number' },
      { severity: 'minor', title: 'Wording', evidence: '`R1`', fix: 'say "answers"' },
    ],
    openQuestions: [],
  })
})

test('score matches findings to the seeded defects by keywords, and lists the blocking or major ones that match none', () => {
  const answer = {
    verdict: 'revise',
    findings: [
      { severity: 'major', title: 'C2 is not testable', evidence: '`Sign-up feels fast`', fix: 'a latency bound' },
      { severity: 'blocking', title: 'The welcome email is missing', evidence: 'the intent', fix: 'add a requirement' },
      { severity: 'major', title: 'No rate limit on /signup', evidence: '`R1`', fix: 'add one' },
      { severity: 'minor', title: 'Typo', evidence: '`R3`', fix: 'fix it' },
    ],
    openQuestions: [],
  }
  assert.deepEqual(score(answer, key('spec-defects')), {
    verdict: 'revise',
    verdictRight: true,
    found: ['untestable-criterion', 'missing-intent'],
    missed: ['unlisted-irreversible'],
    unmatched: ['No rate limit on /signup'],
  })
  assert.equal(score({ ...answer, verdict: 'approve' }, key('spec-defects')).verdictRight, false)
  assert.equal(score({ verdict: 'approve', findings: [], openQuestions: [] }, key('clean')).verdictRight, true)
  const task2 = { severity: 'major', title: 'Task 2 has a hidden dependency', evidence: 'it uses hashPassword', fix: 'Depends on: Task 1' }
  assert.deepEqual(score({ verdict: 'revise', findings: [task2], openQuestions: [] }, key('tasks-defects')).found, ['missing-dependency'])
  const elsewhere = { ...task2, title: 'A hidden dependency' }
  assert.deepEqual(score({ verdict: 'revise', findings: [elsewhere], openQuestions: [] }, key('tasks-defects')).found, [], 'all of its words are needed')
})

const SCRIPTED = `
const fixture = process.argv[3]
const answers = {
  'spec-defects': '## Verdict\\nrevise\\n## Findings\\n1. [major] C2 is not testable — \`feels fast\` — a bound\\n2. [blocking] No welcome email — intent — add it\\n3. [major] No rate limit — \`R1\` — add one\\n## Open questions\\n- none',
  'tasks-defects': JSON.stringify({ verdict: 'reject', findings: [
    { severity: 'blocking', title: 'Task 3 is too large', evidence: '\`src/**\`', fix: 'split it' },
    { severity: 'major', title: 'Vacuous test', evidence: '\`assert.ok(true)\`', fix: 'test the hash' },
  ], openQuestions: [] }),
  clean: '## Verdict\\napprove\\n## Findings\\n## Open questions\\n- none',
}
process.stdin.resume()
process.stdin.on('end', () => process.stdout.write(answers[fixture]))
`

test('a run with a scripted Judge scores every fixture and writes its results and summary', (t) => {
  const dir = tempDir(t)
  const script = path.join(dir, 'judge.js')
  fs.writeFileSync(script, SCRIPTED)
  const out = path.join(dir, 'out')
  const result = main(['--occupant', 'external', '--judge-cmd', script, '--out', out, '--repeat', '2'])
  assert.deepEqual(result.summary, { rounds: 6, ran: 6, verdictsRight: 6, defects: 12, found: 8, unmatched: 2, usd: null })
  const saved = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'))
  assert.deepEqual(
    saved.results.filter((r) => r.repeat === 1).map((r) => [r.fixture, r.score.found.length, r.score.missed]),
    [
      ['clean', 0, []],
      ['spec-defects', 2, ['unlisted-irreversible']],
      ['tasks-defects', 2, ['missing-dependency']],
    ],
  )
  const summary = fs.readFileSync(path.join(out, 'summary.md'), 'utf8')
  assert.ok(summary.startsWith('# Judge on seeded defects: external\n\nDefects found: 8 of 12. Verdicts right: 6 of 6.'), summary)
  assert.ok(summary.includes('| spec-defects | 1 | revise ✓ | 2/3 | unlisted-irreversible | 1 |'))
  assert.throws(() => main(['--occupant', 'both']), /--occupant must be native or external/)
})
