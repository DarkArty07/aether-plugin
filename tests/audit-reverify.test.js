'use strict'

// Spec 026, issue 149 (option 2): the re-verification of the earlier audit's open items that no reviewer
// reported again, with a fixed cost ceiling. The set is built after the entry gate of the verification phase
// from the earlier saved audit; extra verifiers check it; the report tells the three apart and says the cut.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const reverify = lib('audit-reverify.js')
const clean = lib('audit-clean.js')
const report = lib('audit-report.js')
const store = lib('audit-store.js')

const KEY = 'repo-0123456789ab'
const CEILING = { maxVerifiers: 8, itemsPerVerifier: 4 }

// An item of the earlier saved report, as triage leaves it in report.json's list.
const old = (causeKey, over = {}) => ({
  id: `old-${causeKey}`, causeKey, title: `Title ${causeKey}`, topic: 'bugs', type: 'bug', priority: 'P1',
  claim: `Claim ${causeKey}`, locations: [{ file: `src/${causeKey}.js`, line: 7 }],
  verification: 'read-confirmed', ...over,
})
// A candidate of this audit, as the gate leaves it in gated.json's accepted.
const cand = (id, over = {}) => ({
  id, topic: 'bugs', title: `Title ${id}`, claim: `Claim ${id}`, location: { file: `src/${id}.js`, line: 10 },
  type: 'bug', trigger: 'the provider times out', evidence: `src/${id}.js:10 posts without a key`,
  impact: 'customers are charged twice', ...over,
})
const analysisWith = (issues, key = KEY) => ({ generatedAt: '2026-11-04T12:00:00.000Z', project: { key }, checks: { issues } })
const OPEN = { state: 'result', open: [{ number: 41, title: 'Timeouts' }] }
const settled = (findings, discarded = []) => ({ findings, discarded, counts: { candidates: findings.length + discarded.length, verified: findings.filter((f) => f.status === 'verified').length } })
const fnd = (id, over = {}) => ({ ...cand(id), status: 'verified', verification: 'read-confirmed', rootCause: `rc ${id}`, causeKey: `cause-${id}`, ...over })

test('the ceiling lives in config, not in code: 8 verifiers of 4 items each', () => {
  assert.deepEqual(reverify.loadCeiling(), CEILING)
  const parsed = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'audit.json'), 'utf8'))
  assert.deepEqual(parsed, { reverifyMaxVerifiers: 8, reverifyItemsPerVerifier: 4 })
})

test('loadCeiling refuses a missing or invalid ceiling file with an error that names the file', (t) => {
  const dir = tempDir(t)
  const missing = path.join(dir, 'no-such.json')
  assert.throws(() => reverify.loadCeiling(missing), (err) => err.message.includes(missing))
  const bad = path.join(dir, 'bad.json')
  for (const content of ['{}', '{"reverifyMaxVerifiers": 0, "reverifyItemsPerVerifier": 4}', '{"reverifyMaxVerifiers": 8, "reverifyItemsPerVerifier": "4"}']) {
    fs.writeFileSync(bad, content)
    assert.throws(() => reverify.loadCeiling(bad), (err) => err.message.includes(bad), content)
  }
})

test('the set holds only earlier open items of the audited topics with priority P0 to P2', () => {
  const previous = [
    old('keep-p0', { priority: 'P0' }),
    old('keep-p1', { priority: 'P1' }),
    old('keep-p2', { priority: 'P2' }),
    old('drop-p3', { priority: 'P3' }),
    old('drop-no-priority', { priority: undefined }),
    old('drop-topic', { topic: 'docs' }),
    old('drop-own-step', { causeKey: 'audit-changed-project-tests' }),
    old('drop-no-key', { causeKey: undefined }),
  ]
  const out = reverify.reverifySet(previous, [], { topics: ['bugs'], ceiling: CEILING })
  assert.deepEqual(out.items.map((item) => item.causeKey), ['keep-p0', 'keep-p1', 'keep-p2'])
  assert.deepEqual(out.counts, { eligible: 3, selected: 3, cut: 0, groups: 1 })
  assert.deepEqual(out.ceiling, CEILING)
})

test('an earlier item a candidate matches by cause key is not in the set', () => {
  const previous = [old('matched'), old('open')]
  const current = [cand('bugs-1', { causeKey: 'matched' }), cand('bugs-2')]
  const out = reverify.reverifySet(previous, current, { topics: ['bugs'], ceiling: CEILING })
  assert.deepEqual(out.items.map((item) => item.causeKey), ['open'])
})

test('the set is ordered by priority, then by age: oldest first, ties keep the earlier order', () => {
  const previous = [
    old('p1-second', { priority: 'P1' }),
    old('p2-first', { priority: 'P2' }),
    old('p0-first', { priority: 'P0' }),
    old('p1-first', { priority: 'P1' }),
    old('p0-second', { priority: 'P0' }),
  ]
  const out = reverify.reverifySet(previous, [], { topics: ['bugs'], ceiling: CEILING })
  assert.deepEqual(out.items.map((item) => item.causeKey), ['p0-first', 'p0-second', 'p1-second', 'p1-first', 'p2-first'])
})

test('the ceiling cuts the set: at most maxVerifiers groups of itemsPerVerifier, the rest is the cut', () => {
  const previous = Array.from({ length: 40 }, (_, i) => old(`k${i}`, { priority: i % 2 === 0 ? 'P0' : 'P1' }))
  const out = reverify.reverifySet(previous, [], { topics: ['bugs'], ceiling: CEILING })
  assert.equal(out.items.length, 32)
  assert.deepEqual(out.counts, { eligible: 40, selected: 32, cut: 8, groups: 8 })
  assert.equal(out.groups.length, 8)
  for (const group of out.groups) assert.ok(group.length <= 4)
  assert.deepEqual(out.groups.flat(), out.items)
  const small = reverify.reverifySet(previous.slice(0, 5), [], { topics: ['bugs'], ceiling: { maxVerifiers: 8, itemsPerVerifier: 4 } })
  assert.deepEqual(small.counts, { eligible: 5, selected: 5, cut: 0, groups: 2 })
  assert.deepEqual(small.groups.map((group) => group.length), [4, 1])
})

test('a group carries the claim and the location, never the earlier reasoning', () => {
  const previous = [old('k1', { priority: 'P0' })]
  const out = reverify.reverifySet(previous, [], { topics: ['bugs'], ceiling: CEILING })
  assert.equal(out.groups.length, 1)
  const [entry] = out.groups[0]
  assert.deepEqual(Object.keys(entry).sort(), ['causeKey', 'claim', 'id', 'locations', 'priority', 'title', 'topic', 'type'])
  assert.equal(entry.claim, 'Claim k1')
  assert.deepEqual(entry.locations, [{ file: 'src/k1.js', line: 7 }])
  for (const key of ['rootCause', 'trigger', 'impact', 'evidence', 'reproduction', 'reason', 'verifierEvidence']) {
    assert.ok(!(key in entry), key)
  }
})

test('a verdict of sigue or resuelto on evidence settles; a failed verification stays not found again', () => {
  const set = {
    previous: { date: '2026-10-12' }, ceiling: CEILING, cut: 0,
    items: [
      { id: 'R1', causeKey: 'k1', title: 'T1', topic: 'bugs' },
      { id: 'R2', causeKey: 'k2', title: 'T2', topic: 'bugs' },
      { id: 'R3', causeKey: 'k3', title: 'T3', topic: 'bugs' },
      { id: 'R4', causeKey: 'k4', title: 'T4', topic: 'bugs' },
      { id: 'R5', causeKey: 'k5', title: 'T5', topic: 'bugs' },
      { id: 'R6', causeKey: 'k6', title: 'T6', topic: 'bugs' },
    ],
  }
  const out = reverify.settleReverify(set, [
    { id: 'R1', verdict: 'sigue', evidence: 'src/k1.js:7 still posts without a key' },
    { id: 'R2', verdict: 'resuelto', evidence: 'charge.js:88 now sends the key' },
    { id: 'R3', verdict: 'unverified', reason: 'the file moved and I ran out of calls' },
    { id: 'R4', verdict: 'sigue' },
    { id: 'R5', verdict: 'maybe', evidence: 'something' },
    // R6: no verdict at all
    { id: 'ZZ', verdict: 'sigue', evidence: 'not part of the set' },
  ])
  const by = Object.fromEntries(out.items.map((item) => [item.id, item]))
  assert.equal(by.R1.reverify, 'sigue')
  assert.equal(by.R1.evidence, 'src/k1.js:7 still posts without a key')
  assert.equal(by.R2.reverify, 'resuelto')
  assert.equal(by.R2.evidence, 'charge.js:88 now sends the key')
  for (const [id, reason] of [['R3', /ran out/], ['R4', /evidence/], ['R5', /one of the three/], ['R6', /no verdict/]]) {
    assert.equal(by[id].reverify, 'not-found-again', id)
    assert.match(by[id].reason, reason, id)
  }
  assert.deepEqual(out.counts, { items: 6, sigue: 1, resuelto: 1, notFoundAgain: 4 })
  assert.equal(out.cut, 0)
  assert.deepEqual(out.ceiling, CEILING)
  assert.deepEqual(out.previous, { date: '2026-10-12' })
})

function writePrevious(t, dataDir, key, date, list) {
  store.writeReport(store.nextReportDir(dataDir, key, date), { project: { head: 'abc' }, list }, '# earlier')
}

test('the reverify command builds the set from the earlier audit through the bin', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { AETHER_DATA_DIR: dataDir }
  writePrevious(t, dataDir, KEY, '2026-10-12', [
    old('still-open', { priority: 'P0' }),
    old('reported-again', { priority: 'P1' }),
    old('too-calm', { priority: 'P3' }),
    old('other-topic', { priority: 'P1', topic: 'docs' }),
  ])
  const gated = { accepted: [cand('bugs-1', { causeKey: 'reported-again' })], discarded: [], counts: { candidates: 1 } }
  const gatedFile = path.join(work, 'gated.json')
  fs.writeFileSync(gatedFile, JSON.stringify(gated))
  const analysisFile = path.join(work, 'analysis.json')
  fs.writeFileSync(analysisFile, JSON.stringify(analysisWith(OPEN)))
  const out = path.join(work, 'reverify.json')
  const r = runBin(BIN, ['reverify', gatedFile, '--analysis', analysisFile, '--topics', 'bugs', '--out', out], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.summary, { selected: 1, groups: 1, cut: 0 })
  const result = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(result.items.map((item) => item.causeKey), ['still-open'])
  assert.equal(result.groups.length, 1)
  assert.deepEqual(result.previous, { date: '2026-10-12' })
  assert.deepEqual(result.ceiling, CEILING)
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('the reverify command with no earlier audit selects nothing and still succeeds', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const gatedFile = path.join(work, 'gated.json')
  fs.writeFileSync(gatedFile, JSON.stringify({ accepted: [cand('bugs-1')], discarded: [], counts: { candidates: 1 } }))
  const analysisFile = path.join(work, 'analysis.json')
  fs.writeFileSync(analysisFile, JSON.stringify(analysisWith(OPEN)))
  const r = runBin(BIN, ['reverify', gatedFile, '--analysis', analysisFile, '--topics', 'bugs'], repo.dir, { AETHER_DATA_DIR: dataDir })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.items, [])
  assert.deepEqual(r.json.counts, { eligible: 0, selected: 0, cut: 0, groups: 0 })
  assert.equal(r.json.previous, null)
})

test('the reverify command refuses an unknown topic, a missing analysis and a bad current file', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { AETHER_DATA_DIR: dataDir }
  const gatedFile = path.join(work, 'gated.json')
  fs.writeFileSync(gatedFile, JSON.stringify({ accepted: [], discarded: [], counts: { candidates: 0 } }))
  const analysisFile = path.join(work, 'analysis.json')
  fs.writeFileSync(analysisFile, JSON.stringify(analysisWith(OPEN)))
  assert.equal(runBin(BIN, ['reverify', gatedFile, '--analysis', analysisFile, '--topics', 'nope'], repo.dir, env).status, 2)
  assert.equal(runBin(BIN, ['reverify', gatedFile, '--topics', 'bugs'], repo.dir, env).status, 2)
  assert.equal(runBin(BIN, ['reverify', gatedFile, '--analysis', path.join(work, 'nope.json'), '--topics', 'bugs'], repo.dir, env).status, 1)
  assert.equal(runBin(BIN, ['reverify', path.join(work, 'nope.json'), '--analysis', analysisFile, '--topics', 'bugs'], repo.dir, env).status, 1)
})

test('reverify-verdicts settles through the bin and the counts say sigue, resuelto and not found again', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const setFile = path.join(work, 'reverify.json')
  // The set file keeps the reverify command's real shape: the cut travels nested as counts.cut, with no top-level cut.
  fs.writeFileSync(setFile, JSON.stringify({
    previous: { date: '2026-10-12' }, ceiling: CEILING,
    items: [
      { id: 'R1', causeKey: 'k1', title: 'T1', topic: 'bugs', claim: 'C1', locations: [{ file: 'a.js', line: 1 }], type: 'bug', priority: 'P0' },
      { id: 'R2', causeKey: 'k2', title: 'T2', topic: 'bugs', claim: 'C2', locations: [{ file: 'b.js', line: 2 }], type: 'bug', priority: 'P1' },
    ],
    groups: [], counts: { eligible: 4, selected: 2, cut: 2, groups: 1 },
  }))
  const verdictsFile = path.join(work, 'verdicts.json')
  fs.writeFileSync(verdictsFile, JSON.stringify([
    { id: 'R1', verdict: 'sigue', evidence: 'a.js:1 still posts without a key' },
    { id: 'R2', verdict: 'resuelto', evidence: 'b.js:88 now sends the key' },
  ]))
  const out = path.join(work, 'reverified.json')
  const r = runBin(BIN, ['reverify-verdicts', setFile, verdictsFile, '--out', out], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.summary, { items: 2, sigue: 1, resuelto: 1, notFoundAgain: 0 })
  const result = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(result.items.map((item) => [item.causeKey, item.reverify]), [['k1', 'sigue'], ['k2', 'resuelto']])
  assert.equal(result.cut, 2)
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('clean --reverified moves sigue and resuelto out of not found again and says the cut', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  writePrevious(t, dataDir, KEY, '2026-10-12', [
    old('k-sigue', { priority: 'P0' }),
    old('k-resuelto', { priority: 'P1' }),
    old('k-failed', { priority: 'P1' }),
    old('k-uncut', { priority: 'P2' }),
  ])
  const input = settled([fnd('F1')])
  const reverified = {
    previous: { date: '2026-10-12' }, ceiling: CEILING, cut: 1,
    items: [
      { id: 'R1', causeKey: 'k-sigue', title: 'T1', topic: 'bugs', reverify: 'sigue', evidence: 'still there' },
      { id: 'R2', causeKey: 'k-resuelto', title: 'T2', topic: 'bugs', reverify: 'resuelto', evidence: 'now sends the key' },
      { id: 'R3', causeKey: 'k-failed', title: 'T3', topic: 'bugs', reverify: 'not-found-again', reason: 'the verifier ran out' },
    ],
    counts: { items: 3, sigue: 1, resuelto: 1, notFoundAgain: 1 },
  }
  const out = clean.clean(input, analysisWith(OPEN), { topics: ['bugs'], dataDir, reverified })
  assert.deepEqual(out.sinceLast.reverified, [{ causeKey: 'k-sigue', title: 'Title k-sigue', topic: 'bugs' }])
  assert.deepEqual(out.sinceLast.refuted, [{ causeKey: 'k-resuelto', title: 'Title k-resuelto', topic: 'bugs' }])
  assert.deepEqual(out.sinceLast.notFoundAgain.map((item) => item.causeKey), ['k-failed', 'k-uncut'])
  assert.equal(out.sinceLast.reverifyCut, 1)
  assert.deepEqual(out.sinceLast.reverifyCeiling, CEILING)
})

test('a reverify outcome for an item the reviewers did report again stays out of the reverify lists', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  writePrevious(t, dataDir, KEY, '2026-10-12', [old('k-back', { priority: 'P0' })])
  const input = settled([fnd('F1', { causeKey: 'k-back' })])
  const reverified = {
    previous: { date: '2026-10-12' }, ceiling: CEILING, cut: 0,
    items: [{ id: 'R1', causeKey: 'k-back', title: 'T', topic: 'bugs', reverify: 'sigue', evidence: 'still there' }],
    counts: { items: 1, sigue: 1, resuelto: 0, notFoundAgain: 0 },
  }
  const out = clean.clean(input, analysisWith(OPEN), { topics: ['bugs'], dataDir, reverified })
  assert.deepEqual(out.findings.map((f) => [f.id, f.mark]), [['F1', 'still']])
  assert.deepEqual(out.sinceLast.reverified, [])
  assert.deepEqual(out.sinceLast.notFoundAgain, [])
})

test('the report tells sigue, resuelto con evidencia and the cut apart, in Spanish and in English', () => {
  const base = {
    meta: {
      date: '2026-11-04', topics: ['bugs'], leftOut: [], durationSeconds: 900, costUsd: 1.2,
      waits: [], assumptions: [], reviewers: {}, radar: 'R', cost: { readable: true, text: 'US$ 1.2' },
    },
    analysis: {
      project: { name: 'tienda', key: KEY },
      checks: { tests: { state: 'result' }, lint: { state: 'result' }, dependencies: { state: 'result' }, secrets: { state: 'result' }, todos: { state: 'result' }, branches: { state: 'result' }, issues: { state: 'result', open: [] }, prs: { state: 'result' }, hotspots: { state: 'result' } },
      changes: { changed: false, attributed: [], unattributable: [] },
    },
    triage: {
      counts: { candidates: 9, verified: 1 },
      list: [],
      unverified: [],
      discarded: [],
      issueComparison: { state: 'done', removed: [] },
      sinceLast: {
        previous: { date: '2026-10-12' }, resolved: [], notReaudited: [],
        notFoundAgain: [{ causeKey: 'k1', title: 'Bug A', topic: 'bugs' }, { causeKey: 'k2', title: 'Bug B', topic: 'bugs' }],
        reverified: [{ causeKey: 'k3', title: 'Bug C', topic: 'bugs' }],
        refuted: [{ causeKey: 'k4', title: 'Bug D', topic: 'bugs' }],
        reverifyCut: 2, reverifyCeiling: CEILING,
      },
    },
  }
  const es = report.render(base, 'es').markdown
  assert.ok(es.includes('- Reverificados (siguen): Bug C'), es)
  assert.ok(es.includes('- Resueltos con evidencia: Bug D'), es)
  assert.ok(es.includes('2 sin reverificar por el tope (8 verificadores de hasta 4).'), es)
  const en = report.render(base, 'en').markdown
  assert.ok(en.includes('- Re-verified (still open): Bug C'), en)
  assert.ok(en.includes('- Resolved on evidence: Bug D'), en)
  assert.ok(en.includes('2 not re-verified because of the ceiling (8 verifiers of up to 4).'), en)
})

test('the report says nothing about reverify when no reverify ran', () => {
  const minimal = {
    meta: {
      date: '2026-11-04', topics: ['bugs'], leftOut: [], durationSeconds: 900, costUsd: 1.2,
      waits: [], assumptions: [], reviewers: {}, radar: 'R', cost: { readable: true, text: 'US$ 1.2' },
    },
    analysis: {
      project: { name: 'tienda', key: KEY },
      checks: {},
      changes: { changed: false, attributed: [], unattributable: [] },
    },
    triage: {
      counts: { candidates: 1, verified: 0 }, list: [], unverified: [], discarded: [],
      issueComparison: { state: 'done', removed: [] },
      sinceLast: { previous: { date: '2026-10-12' }, resolved: [], notReaudited: [], notFoundAgain: [] },
    },
  }
  for (const lang of ['es', 'en']) {
    const md = report.render(minimal, lang).markdown
    assert.doesNotMatch(md, /Re-verified|Reverificados/, lang)
    assert.doesNotMatch(md, /Resolved on evidence|Resueltos con evidencia/, lang)
    assert.doesNotMatch(md, /because of the ceiling|por el tope/, lang)
  }
})

test('the ceiling cut survives the whole chain: reverify, reverify-verdicts, clean, triage and report state it', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { AETHER_DATA_DIR: dataDir }
  // 35 eligible items against a ceiling of 32: the reverify command cuts 3.
  writePrevious(t, dataDir, KEY, '2026-10-12', Array.from({ length: 35 }, (_, i) => old(`cut-k${i}`, { priority: 'P1' })))
  const gatedFile = path.join(work, 'gated.json')
  fs.writeFileSync(gatedFile, JSON.stringify({ accepted: [], discarded: [], counts: { candidates: 0 } }))
  const analysisFile = path.join(work, 'analysis.json')
  fs.writeFileSync(analysisFile, JSON.stringify(analysisWith(OPEN)))
  const reverifyFile = path.join(work, 'reverify.json')
  const r1 = runBin(BIN, ['reverify', gatedFile, '--analysis', analysisFile, '--topics', 'bugs', '--out', reverifyFile], repo.dir, env)
  assert.equal(r1.status, 0, r1.stdout + r1.stderr)
  assert.deepEqual(r1.json.summary, { selected: 32, groups: 8, cut: 3 })
  const set = JSON.parse(fs.readFileSync(reverifyFile, 'utf8'))
  assert.ok(!('cut' in set), 'the reverify output carries the cut nested as counts.cut')
  assert.equal(set.counts.cut, 3)
  const verdictsFile = path.join(work, 'verdicts.json')
  fs.writeFileSync(verdictsFile, JSON.stringify([
    { id: set.items[0].id, verdict: 'sigue', evidence: 'still posts without a key' },
    { id: set.items[1].id, verdict: 'resuelto', evidence: 'now sends the key' },
  ]))
  const reverifiedFile = path.join(work, 'reverified.json')
  const r2 = runBin(BIN, ['reverify-verdicts', reverifyFile, verdictsFile, '--out', reverifiedFile], repo.dir, env)
  assert.equal(r2.status, 0, r2.stdout + r2.stderr)
  assert.equal(JSON.parse(fs.readFileSync(reverifiedFile, 'utf8')).cut, 3)
  const settledFile = path.join(work, 'settled.json')
  fs.writeFileSync(settledFile, JSON.stringify({ findings: [], discarded: [], counts: { candidates: 0, verified: 0 } }))
  const cleanedFile = path.join(work, 'cleaned.json')
  const r3 = runBin(BIN, ['clean', settledFile, '--analysis', analysisFile, '--topics', 'bugs', '--reverified', reverifiedFile, '--out', cleanedFile], repo.dir, env)
  assert.equal(r3.status, 0, r3.stdout + r3.stderr)
  assert.equal(JSON.parse(fs.readFileSync(cleanedFile, 'utf8')).sinceLast.reverifyCut, 3)
  const judgmentsFile = path.join(work, 'judgments.json')
  fs.writeFileSync(judgmentsFile, JSON.stringify({}))
  const triageFile = path.join(work, 'triage.json')
  const r4 = runBin(BIN, ['triage', cleanedFile, judgmentsFile, '--out', triageFile], repo.dir, env)
  assert.equal(r4.status, 0, r4.stdout + r4.stderr)
  const metaFile = path.join(work, 'meta.json')
  fs.writeFileSync(metaFile, JSON.stringify({
    date: '2026-11-04', topics: ['bugs'], leftOut: [], durationSeconds: 900, costUsd: 1.2,
    waits: [], assumptions: [], reviewers: {}, radar: 'R', cost: { readable: true, text: 'US$ 1.2' },
  }))
  const reportAnalysisFile = path.join(work, 'report-analysis.json')
  fs.writeFileSync(reportAnalysisFile, JSON.stringify({
    project: { name: 'tienda', key: KEY },
    checks: {
      tests: { state: 'result' }, lint: { state: 'result' }, dependencies: { state: 'result' },
      secrets: { state: 'result' }, todos: { state: 'result' }, branches: { state: 'result' },
      issues: { state: 'result', open: [] }, prs: { state: 'result' }, hotspots: { state: 'result' },
    },
    changes: { changed: false, attributed: [], unattributable: [] },
  }))
  const r5 = runBin(BIN, ['report', '--meta', metaFile, '--analysis', reportAnalysisFile, '--triage', triageFile, '--lang', 'es'], repo.dir, env)
  assert.equal(r5.status, 0, r5.stdout + r5.stderr)
  assert.ok(r5.json.markdown.includes('3 sin reverificar por el tope (8 verificadores de hasta 4).'), r5.json.markdown)
  const r6 = runBin(BIN, ['report', '--meta', metaFile, '--analysis', reportAnalysisFile, '--triage', triageFile, '--lang', 'en'], repo.dir, env)
  assert.equal(r6.status, 0, r6.stdout + r6.stderr)
  assert.ok(r6.json.markdown.includes('3 not re-verified because of the ceiling (8 verifiers of up to 4).'), r6.json.markdown)
  assert.equal(repo.git('status', '--porcelain'), '')
})
