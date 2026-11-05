'use strict'

// Spec 026 (R13 to R20, R27): the gate of candidates, the settling of verdicts, the cleanup and the triage, with simulated findings and verifiers.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin, commitIn } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const verify = lib('audit-verify.js')
const clean = lib('audit-clean.js')
const triage = lib('audit-triage.js')
const store = lib('audit-store.js')

const cand = (id, over = {}) => ({
  id, topic: 'bugs', title: `Title ${id}`, claim: `Claim ${id}`, location: { file: `src/${id}.js`, line: 10 }, type: 'bug',
  trigger: 'the provider times out', evidence: `src/${id}.js:10 posts without a key`, impact: 'customers are charged twice', ...over,
})
const verdict = (id, over = {}) => ({
  id, verdict: 'read-confirmed', rootCause: 'no idempotency key', trigger: 'a timeout of 30 s', impact: 'double charge', evidence: `src/${id}.js:10`, ranOn: 'claude', ...over,
})

test('the gate discards a candidate with no valid location, no evidence, a field out of its vocabulary or a repeated id, with the reason (R13)', () => {
  const out = verify.gate([
    cand('F1'),
    cand('F2', { location: { file: 'a.js' } }),
    cand('F3', { location: { file: 'a.js', line: 0 } }),
    cand('F4', { evidence: '   ' }),
    cand('F5', { topic: 'nope' }),
    cand('F6', { type: 'weird' }),
    cand('F7', { title: '' }),
    cand('F1'),
    cand('F8', { location: { file: 'a.js', commit: '4f2a91c' } }),
    cand('F9', { location: { file: 'a.js', commit: 'xyz' } }),
  ])
  assert.deepEqual(out.accepted.map((c) => c.id), ['F1', 'F8'])
  assert.deepEqual(out.discarded.map((d) => [d.id, d.reason]), [['F2', 'no-location'], ['F3', 'no-location'], ['F4', 'no-evidence'], ['F5', 'unknown-topic'], ['F6', 'unknown-type'], ['F7', 'missing-field:title'], ['F1', 'duplicate-id'], ['F9', 'no-location']])
  assert.equal(out.counts.candidates, 10)
})

test('a verdict that holds verifies; a failed verification is "unverified" with its reason and is never kept as verified (R14, R15, scenario 5)', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const accepted = ids.map((id) => (id === 'I' ? cand(id, { topic: 'opportunities', type: 'opportunity' }) : cand(id)))
  const verdicts = [
    verdict('A', { verdict: 'proven', reproduction: 'node /tmp/x/repro.js exits 1' }),
    verdict('B'),
    verdict('C', { verdict: 'refuted', evidence: 'charge.js:88 does send the key' }),
    verdict('D', { verdict: 'proven', reproduction: 'ran it', ranOn: 'codex' }),
    verdict('E', { verdict: 'proven' }),
    verdict('F', { verdict: 'maybe' }),
    verdict('G', { evidence: '' }),
    verdict('H', { verdict: 'proposal' }),
    verdict('I', { verdict: 'proposal' }),
    // J: no record at all
    verdict('K', { verdict: 'unverified', exhausted: true, reason: 'ran out of time' }),
    verdict('L', { rootCause: '' }),
    verdict('ZZ'),
  ]
  const out = verify.settle({ accepted, discarded: [{ id: 'X', reason: 'no-location' }], counts: { candidates: 13 } }, verdicts)
  const by = Object.fromEntries(out.findings.map((f) => [f.id, f]))
  assert.deepEqual(Object.keys(by).sort(), ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
  assert.deepEqual([by.A.status, by.A.verification], ['verified', 'proven'])
  assert.deepEqual([by.B.status, by.B.verification], ['verified', 'read-confirmed'])
  assert.deepEqual([by.I.status, by.I.verification], ['verified', 'proposal'])
  assert.equal(by.A.rootCause, 'no idempotency key')
  assert.equal(by.A.trigger, 'a timeout of 30 s', 'the restatement replaces the claim\'s trigger')
  for (const [id, reason] of [['D', /other harness/], ['E', /reproduction/], ['F', /one of the five/], ['G', /evidence/], ['H', /opportunities/], ['J', /no verdict/], ['K', /ran out of time/], ['L', /restate/]]) {
    assert.deepEqual([by[id].status, by[id].verification], ['unverified', 'unverified'], id)
    assert.match(by[id].reason, reason, id)
  }
  for (const f of out.findings) if (f.status === 'verified') assert.ok(['proven', 'read-confirmed', 'proposal'].includes(f.verification))
  assert.deepEqual(out.discarded.map((d) => [d.id, d.reason]), [['X', 'no-location'], ['C', 'refuted']])
  assert.deepEqual(out.counts, { candidates: 13, verified: 3 })
})

const fnd = (id, over = {}) => ({ ...cand(id), status: 'verified', verification: 'read-confirmed', rootCause: `rc ${id}`, causeKey: `cause-${id}`, ...over })
const analysisWith = (issues, key = 'repo-0123456789ab') => ({ generatedAt: '2026-11-04T12:00:00.000Z', project: { key }, checks: { issues } })
const OPEN = { state: 'result', open: [{ number: 41, title: 'Timeouts' }] }
const settled = (findings, discarded = []) => ({ findings, discarded, counts: { candidates: findings.length + discarded.length, verified: findings.filter((f) => f.status === 'verified').length } })

test('the cleanup merges findings of the same cause and status, with all their locations, and never merges across statuses (R16)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const input = settled([
    fnd('F1', { causeKey: 'no-timeout', verification: 'proven' }),
    fnd('F2', { causeKey: 'no-timeout', location: { file: 'src/other.js', line: 3 } }),
    fnd('F3', { causeKey: 'no-timeout', status: 'unverified', verification: 'unverified', reason: 'x' }),
    fnd('F4', {}),
    fnd('F5', { causeKey: undefined }),
  ])
  const out = clean.clean(input, analysisWith(OPEN), { topics: ['bugs'], dataDir })
  assert.deepEqual(out.findings.map((f) => f.id), ['F1', 'F4', 'F5'])
  const merged = out.findings[0]
  assert.deepEqual(merged.mergedFrom, ['F1', 'F2'])
  assert.deepEqual(merged.locations, [{ file: 'src/F1.js', line: 10 }, { file: 'src/other.js', line: 3 }])
  assert.equal(merged.verification, 'proven')
  assert.deepEqual(out.findings[1].mergedFrom, ['F4'])
  assert.deepEqual(out.findings[1].locations, [{ file: 'src/F4.js', line: 10 }])
  assert.deepEqual(out.unverified.map((f) => f.id), ['F3'])
  assert.deepEqual(out.discarded.filter((d) => d.reason === 'merged'), [{ id: 'F2', title: 'Title F2', topic: 'bugs', reason: 'merged', into: 'F1' }])
})

test('the cleanup removes what an open issue covers and says which, and says it could not compare when gh did not answer (R17)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const input = settled([fnd('F4', { coveredBy: 41 }), fnd('F5', { coveredBy: 99 }), fnd('F6')])
  const out = clean.clean(input, analysisWith(OPEN), { topics: ['bugs'], dataDir })
  assert.deepEqual(out.findings.map((f) => f.id), ['F5', 'F6'])
  assert.match(out.findings[0].note, /#99/)
  assert.deepEqual(out.issueComparison, { state: 'done', removed: [{ id: 'F4', issue: 41 }] })
  assert.deepEqual(out.discarded.filter((d) => d.reason === 'covered-by-issue').map((d) => [d.id, d.issue]), [['F4', 41]])
  const blind = clean.clean(input, analysisWith({ state: 'could-not', reason: 'gh is not installed' }), { topics: ['bugs'], dataDir })
  assert.deepEqual(blind.findings.map((f) => f.id), ['F4', 'F5', 'F6'])
  assert.deepEqual(blind.issueComparison, { state: 'could-not', reason: 'gh is not installed', removed: [] })
})

test('the cleanup takes in the analysis\'s own findings as verified findings, so a change the audit made reaches the list (R6)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const self = {
    id: 'AUDIT-1', topic: 'hygiene', title: 'Running the tests changed the project', claim: 'the test command wrote notes.txt', location: { file: 'notes.txt', line: 1 },
    type: 'risk', trigger: 'the audit ran npm test', evidence: 'status: notes.txt', impact: 'the audit changed the project', rootCause: 'the test command writes a tracked file',
    verification: 'proven', status: 'verified', causeKey: 'audit-changed-project-tests', source: 'analysis',
  }
  const out = clean.clean(settled([fnd('F1')]), { ...analysisWith(OPEN), selfFindings: [self] }, { topics: ['bugs'], dataDir })
  assert.deepEqual(out.findings.map((f) => f.id), ['F1', 'AUDIT-1'])
  assert.equal(out.findings[1].status, 'verified')
  assert.deepEqual(out.findings[1].locations, [{ file: 'notes.txt', line: 1 }])
  assert.deepEqual([out.counts.candidates, out.counts.verified], [2, 2])
  const none = clean.clean(settled([fnd('F1')]), analysisWith(OPEN), { topics: ['bugs'], dataDir })
  assert.deepEqual(none.findings.map((f) => f.id), ['F1'])
})

test('the cleanup compares with the previous audit of the same project: new, still, resolved, and topics not reviewed this time (R18, scenario 6)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const key = 'repo-0123456789ab'
  const first = clean.clean(settled([fnd('F1')]), analysisWith(OPEN, key), { topics: ['bugs'], dataDir })
  assert.deepEqual(first.sinceLast, { previous: null, resolved: [], notReaudited: [], notFoundAgain: [] })
  assert.equal(first.findings[0].mark, null)
  store.writeReport(store.nextReportDir(dataDir, key, '2026-10-12'), {
    list: [
      { causeKey: 'cause-F1', title: 'Double charge', topic: 'bugs' },
      { causeKey: 'old-fixed', title: 'Old fixed bug', topic: 'bugs' },
      { causeKey: 'cause-F4', title: 'Covered since', topic: 'bugs' },
      { causeKey: 'other-topic', title: 'Doc drift', topic: 'docs' },
    ],
  }, '')
  store.writeReport(store.nextReportDir(dataDir, 'other-000000000000', '2026-10-30'), { list: [{ causeKey: 'cause-F1', title: 'not this project', topic: 'bugs' }] }, '')
  const out = clean.clean(settled([fnd('F1'), fnd('F9'), fnd('F4', { coveredBy: 41 })]), analysisWith(OPEN, key), { topics: ['bugs', 'tests'], dataDir })
  assert.deepEqual(out.findings.map((f) => [f.id, f.mark]), [['F1', 'still'], ['F9', 'new']])
  assert.equal(out.sinceLast.previous.date, '2026-10-12')
  assert.deepEqual(out.sinceLast.resolved, [])
  assert.deepEqual(out.sinceLast.notFoundAgain, [{ causeKey: 'old-fixed', title: 'Old fixed bug', topic: 'bugs' }])
  assert.deepEqual(out.sinceLast.notReaudited, [{ causeKey: 'other-topic', title: 'Doc drift', topic: 'docs' }])
})

test('an earlier item of the audit\'s own counts as re-audited only when this analysis ran the same step (R18)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const key = 'repo-0123456789ab'
  store.writeReport(store.nextReportDir(dataDir, key, '2026-10-12'), {
    list: [
      { causeKey: 'audit-changed-project-tests', title: 'Running the tests changed the project', topic: 'hygiene' },
      { causeKey: 'audit-changed-project-lint', title: 'Running the linter changed the project', topic: 'hygiene' },
    ],
  }, '')
  const analysis = { ...analysisWith(OPEN, key), checks: { issues: OPEN, tests: { state: 'result' }, lint: { state: 'not-applicable', reason: 'no linter declared' } } }
  const out = clean.clean(settled([fnd('F1')]), analysis, { topics: ['bugs'], dataDir })
  assert.deepEqual(out.sinceLast.resolved.map((r) => r.causeKey), [])
  assert.deepEqual(out.sinceLast.notFoundAgain.map((r) => r.causeKey), ['audit-changed-project-tests'])
  assert.deepEqual(out.sinceLast.notReaudited.map((r) => r.causeKey), ['audit-changed-project-lint'])
})

test('a missing earlier item is resolved only when its files changed since the earlier head, else it is notFoundAgain', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'src/a.js', 'a v1\n', 'add a')
  commitIn(repo, repo.dir, 'src/b.js', 'b v1\n', 'add b')
  const firstHead = repo.git('rev-parse', 'HEAD')
  const key = 'repo-0123456789ab'
  const list = [
    { causeKey: 'cause-A', title: 'Bug A', topic: 'bugs', locations: [{ file: 'src/a.js', line: 1 }] },
    { causeKey: 'cause-B', title: 'Bug B', topic: 'bugs', locations: [{ file: 'src/b.js', line: 1 }] },
  ]
  const dataDir = tempDir(t, 'aether-data-')
  store.writeReport(store.nextReportDir(dataDir, key, '2026-10-12'), { project: { head: firstHead }, list }, '')
  commitIn(repo, repo.dir, 'src/a.js', 'a v2\n', 'change a')
  const secondHead = repo.git('rev-parse', 'HEAD')
  const analysis = { project: { key, head: secondHead, root: repo.dir }, checks: { issues: { state: 'result', open: [] } } }
  const out = clean.clean(settled([]), analysis, { topics: ['bugs'], dataDir })
  assert.deepEqual(out.sinceLast.resolved, [{ causeKey: 'cause-A', title: 'Bug A', topic: 'bugs' }])
  assert.deepEqual(out.sinceLast.notFoundAgain, [{ causeKey: 'cause-B', title: 'Bug B', topic: 'bugs' }])
  const noHeadDir = tempDir(t, 'aether-data-')
  store.writeReport(store.nextReportDir(noHeadDir, key, '2026-10-12'), { list }, '')
  const blind = clean.clean(settled([]), analysis, { topics: ['bugs'], dataDir: noHeadDir })
  assert.deepEqual(blind.sinceLast.resolved, [])
  assert.deepEqual(blind.sinceLast.notFoundAgain, [
    { causeKey: 'cause-A', title: 'Bug A', topic: 'bugs' },
    { causeKey: 'cause-B', title: 'Bug B', topic: 'bugs' },
  ])
})

const judgment = (over = {}) => ({ severity: 'high', priority: 'P1', reason: 'a reason', size: 'S', how: 'one agent', regression: false, waitCost: 'medium', ...over })
const cleaned = (findings, unverified = []) => ({
  findings: findings.map((f) => ({ ...f, locations: [f.location], mergedFrom: [f.id], mark: null })),
  unverified, discarded: [{ id: 'D1', reason: 'refuted' }], counts: { candidates: 9, verified: findings.length },
  issueComparison: { state: 'done', removed: [] }, sinceLast: { previous: null, resolved: [], notReaudited: [], notFoundAgain: [] },
})

test('the order inside a level is regression first, then the cost of waiting, then the cost of doing it, then arrival (R20, C5)', () => {
  const findings = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].map((id) => fnd(id))
  const judgments = {
    F1: judgment({ waitCost: 'low', size: 'S' }),
    F2: judgment({ waitCost: 'high', size: 'L' }),
    F3: judgment({ waitCost: 'high', size: 'S' }),
    F4: judgment({ waitCost: 'low', size: 'L', regression: true }),
    F5: judgment({ priority: 'P0', waitCost: 'low', size: 'L' }),
    F6: judgment({ priority: 'P2' }),
    F7: judgment({ priority: 'P3' }),
    F8: judgment({ waitCost: 'high', size: 'S' }),
  }
  const out = triage.triage(cleaned(findings), judgments)
  assert.equal(out.ok, true)
  assert.deepEqual(out.list.map((i) => [i.number, i.id, i.priority]), [[1, 'F5', 'P0'], [2, 'F4', 'P1'], [3, 'F3', 'P1'], [4, 'F8', 'P1'], [5, 'F2', 'P1'], [6, 'F1', 'P1'], [7, 'F6', 'P2'], [8, 'F7', 'P3']])
  assert.deepEqual(out.counts, { candidates: 9, verified: 8 })
  assert.deepEqual(out.discarded, [{ id: 'D1', reason: 'refuted' }])
  assert.deepEqual(triage.order([{ id: 'a', regression: false, waitCost: 'low', size: 'S' }, { id: 'b', regression: true, waitCost: 'low', size: 'L' }]).map((i) => i.id), ['b', 'a'])
})

test('severity and priority are separate; a proposal is P3 whatever is said; what is unverified gets no level and no number (R19, scenario 5)', () => {
  const findings = [fnd('F1'), fnd('F2', { verification: 'proposal', type: 'opportunity', topic: 'opportunities' })]
  const unverified = [{ ...fnd('F3', { status: 'unverified', verification: 'unverified', reason: 'could not reproduce' }), locations: [{ file: 'src/F3.js', line: 10 }] }]
  const out = triage.triage(cleaned(findings, unverified), { F1: judgment({ severity: 'low', priority: 'P0' }), F2: judgment({ priority: 'P0' }), F3: judgment({ priority: 'P0' }) })
  assert.deepEqual(out.list.map((i) => [i.id, i.severity, i.priority]), [['F1', 'low', 'P0'], ['F2', 'high', 'P3']])
  assert.deepEqual(out.unverified, [{ id: 'F3', topic: 'bugs', title: 'Title F3', claim: 'Claim F3', locations: [{ file: 'src/F3.js', line: 10 }], reason: 'could not reproduce' }])
  assert.ok(!out.list.some((i) => i.id === 'F3'))
})

test('a verified finding with no judgment, or with a judgment out of its vocabulary, stops the triage and names what is missing (R19)', () => {
  const findings = [fnd('F1'), fnd('F2'), fnd('F3')]
  const out = triage.triage(cleaned(findings), { F1: judgment(), F2: judgment({ priority: 'P9', size: 'XL', reason: ' ', regression: 'no' }) })
  assert.equal(out.ok, false)
  assert.deepEqual(out.incomplete, [{ id: 'F2', missing: ['priority', 'size', 'reason', 'regression'] }, { id: 'F3', missing: ['judgment'] }])
  assert.equal(out.list, undefined)
})

test('the four stages chain through files and the bin: candidates, verdicts, clean and triage (R13 to R20)', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { AETHER_DATA_DIR: dataDir }
  const write = (name, value) => { const file = path.join(work, name); fs.writeFileSync(file, JSON.stringify(value)); return file }
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
  const step = (args, out) => {
    const r = runBin(BIN, [...args, '--out', path.join(work, out)], repo.dir, env)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.json.ok, true)
    return read(path.join(work, out))
  }
  const gated = step(['candidates', write('cands.json', [cand('A'), cand('B'), cand('C', { location: { file: 'x' } })])], 'gated.json')
  assert.deepEqual(gated.accepted.map((c) => c.id), ['A', 'B'])
  const done = step(['verdicts', path.join(work, 'gated.json'), write('verdicts.json', [verdict('A', { verdict: 'proven', reproduction: 'r' }), verdict('B', { verdict: 'refuted', evidence: 'e' })])], 'settled.json')
  assert.deepEqual(done.findings.map((f) => f.id), ['A'])
  assert.deepEqual(done.discarded.map((d) => d.reason), ['no-location', 'refuted'])
  done.findings[0].causeKey = 'k'
  write('settled2.json', done)
  const analysis = write('analysis.json', analysisWith({ state: 'result', open: [] }))
  const cleanedOut = step(['clean', path.join(work, 'settled2.json'), '--analysis', analysis, '--topics', 'bugs'], 'cleaned.json')
  assert.deepEqual(cleanedOut.findings.map((f) => [f.id, f.mark]), [['A', null]])
  const final = step(['triage', path.join(work, 'cleaned.json'), write('judgments.json', { A: judgment({ priority: 'P0' }) })], 'triaged.json')
  assert.deepEqual(final.list.map((i) => [i.number, i.id, i.priority]), [[1, 'A', 'P0']])
  assert.equal(final.counts.candidates, 3)
  assert.equal(runBin(BIN, ['clean', path.join(work, 'settled2.json'), '--analysis', analysis], repo.dir, env).status, 2, '--topics is required')
  const incomplete = runBin(BIN, ['triage', path.join(work, 'cleaned.json'), write('none.json', {})], repo.dir, env)
  assert.equal(incomplete.status, 1)
  assert.deepEqual(incomplete.json.incomplete, [{ id: 'A', missing: ['judgment'] }])
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('a hand-edited intermediate file that lost its discarded list or its counts is refused with an error that names the file', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const gated = path.join(work, 'gated.json')
  const verdictsFile = path.join(work, 'verdicts.json')
  fs.writeFileSync(gated, JSON.stringify({ accepted: [] }))
  fs.writeFileSync(verdictsFile, '[]')
  const v = runBin(BIN, ['verdicts', gated, verdictsFile], repo.dir)
  assert.equal(v.status, 1)
  assert.match(v.json.error, /gated\.json/)
  const settledFile = path.join(work, 'settled.json')
  const analysisFile = path.join(work, 'analysis.json')
  fs.writeFileSync(settledFile, JSON.stringify({ findings: [] }))
  fs.writeFileSync(analysisFile, JSON.stringify({ project: { key: 'k-0123456789ab' }, checks: {} }))
  const c = runBin(BIN, ['clean', settledFile, '--analysis', analysisFile, '--topics', 'bugs'], repo.dir)
  assert.equal(c.status, 1)
  assert.match(c.json.error, /settled\.json/)
})
