'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { main } = require('../scripts/refresh-lanes.js')
const { snapshotOf } = require('./aa-page-fixtures.js')
const row = (id, slug, extra = {}) => { const [harness, rest] = id.split('/'); const [model, effort] = rest.split('@'); return { id, slug, harness, model, family: model, effort, group: harness === 'claude' ? null : harness, intelligence: 20, costPerTaskUsd: 0.1, ...extra } }
const haikuHigh = row('claude/haiku@high', 'claude-haiku-5-5-high', { intelligence: 29.6, checked: '2026-11-10' })
const argonHigh = row('agy/gemini-4-argon@high', 'gemini-4-argon', { intelligence: 50, costPerTaskUsd: 7 })
const spaced = r => `{ ${Object.entries(r).map(([k,v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
function setup(t, rows = [haikuHigh, argonHigh]) {
  const dir = tempDir(t, 'aether-refresh-')
  const files = Object.fromEntries(['pairs', 'ladder', 'snapshot'].map(n => [n, path.join(dir, `${n}.json`)]))
  fs.writeFileSync(files.pairs, `{\n  "pairs": [\n${rows.map(r => `    ${spaced(r)}`).join(',\n')}\n  ]\n}\n`)
  fs.copyFileSync(path.join(__dirname, '../plugins/aether/config/ladder.json'), files.ladder)
  return files
}
const writeSnapshot = (files, shot) => fs.writeFileSync(files.snapshot, JSON.stringify(shot))
const run = (files, extra = []) => main(['--pairs', files.pairs, '--ladder', files.ladder, '--snapshot', files.snapshot, ...extra])
const rowsOf = files => JSON.parse(fs.readFileSync(files.pairs, 'utf8')).pairs

test('the script asks nothing of the network and holds no key', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/refresh-lanes.js'), 'utf8')
  const key = ['ARTIFICIAL_ANALYSIS', 'API', 'KEY'].join('_')
  const header = ['x', 'api', 'key'].join('-')
  assert.equal(/\bfetch\b/.test(source), false)
  for (const gone of [key, 'keyFrom', 'keyFile', 'envFileFor', header, 'aa-api']) assert.equal(source.includes(gone), false, gone)
  assert.deepEqual(Object.keys(require('../scripts/refresh-lanes.js')), ['main'])
})
test('figure dates come from the snapshot rather than today', t => {
  const f = setup(t, [haikuHigh])
  writeSnapshot(f, snapshotOf({ [haikuHigh.slug]: { figures: { intelligence: { value: 29.9, on: '2026-11-13' }, costPerTaskUsd: 0.159 } } }))
  const out = main(['--pairs', f.pairs, '--ladder', f.ladder, '--snapshot', f.snapshot, '--write'], { now: () => Date.UTC(2030, 0, 1) })
  assert.equal(out.exitCode, 0, out.stdout)
  const r = rowsOf(f)[0]; assert.deepEqual([r.intelligence, r.checked, r.costPerTaskUsd], [29.9, '2026-11-13', 0.159])
})
test('patches every page row in place only with --write, including external rows and owner null cost', t => {
  const f = setup(t, [haikuHigh, { ...argonHigh, costPerTaskUsd: null, ownerDecision: 'owner keeps null' }]); const before = fs.readFileSync(f.pairs, 'utf8')
  writeSnapshot(f, snapshotOf({ [haikuHigh.slug]: { figures: { intelligence: 29.9, costPerTaskUsd: 0.159 } }, [argonHigh.slug]: { figures: { intelligence: 50.4, costPerTaskUsd: 4.973 } } }))
  assert.match(run(f).stdout, /intelligence 29.6 → 29.9/); assert.equal(fs.readFileSync(f.pairs, 'utf8'), before)
  assert.equal(run(f, ['--write']).exitCode, 0)
  const [a,b] = rowsOf(f); assert.deepEqual([a.intelligence,a.checked], [29.9,'2026-11-13']); assert.equal(b.intelligence, 50.4); assert.equal(b.costPerTaskUsd, null)
  assert.equal(a.costPerTaskUsd, 0.159, 'an existing numeric cost updates from the snapshot')
  const expected = before
    .replace('"intelligence": 29.6', '"intelligence": 29.9')
    .replace('"costPerTaskUsd": 0.1', '"costPerTaskUsd": 0.159')
    .replace('"checked": "2026-11-10"', '"checked": "2026-11-13"')
    .replace('"intelligence": 50, "costPerTaskUsd": null, "ownerDecision": "owner keeps null" }', '"intelligence": 50.4, "costPerTaskUsd": null, "ownerDecision": "owner keeps null", "checked": "2026-11-13" }')
  assert.equal(fs.readFileSync(f.pairs, 'utf8'), expected, 'patches only the intended values in each row without duplicate fields')
  const text = fs.readFileSync(f.pairs, 'utf8'); const again = run(f, ['--write']); assert.match(again.stdout, /^No figure changed\./); assert.doesNotMatch(again.stdout, /written to/); assert.equal(fs.readFileSync(f.pairs, 'utf8'), text)
})
test('a 0.3 Claude scale shift preserves the recalculated rung order and stored ladder', t => {
  const rows = [
    haikuHigh,
    row('claude/haiku@xhigh', 'haiku-xhigh', { intelligence: 34.3, costPerTaskUsd: 0.248 }),
    row('claude/sonnet@high', 'sonnet-high', { intelligence: 41.1, costPerTaskUsd: 1.636 }),
    row('claude/opus@high', 'opus-high', { intelligence: 51.7, costPerTaskUsd: 3.465 }),
    row('claude/opus@xhigh', 'opus-xhigh', { intelligence: 57, costPerTaskUsd: 6.047 }),
  ]
  const f = setup(t, rows)
  const stored = fs.readFileSync(f.ladder, 'utf8')
  const shot = shift => snapshotOf(Object.fromEntries(rows.map(r => [r.slug, { figures: {
    intelligence: Math.round((r.intelligence + shift) * 10) / 10,
    costPerTaskUsd: r.costPerTaskUsd,
  } }])))
  const expected = 'Recalculated ladder: haiku high > haiku xhigh > sonnet high > opus high > opus xhigh'
  writeSnapshot(f, shot(0))
  const before = run(f)
  assert.equal(before.exitCode, 0, before.stdout)
  assert.ok(before.stdout.includes(expected))
  assert.match(before.stdout, /Stored ladder: unchanged/)
  writeSnapshot(f, shot(0.3))
  const after = run(f, ['--write'])
  assert.equal(after.exitCode, 0, after.stdout)
  assert.ok(after.stdout.includes(expected))
  assert.match(after.stdout, /Stored ladder: unchanged/)
  assert.deepEqual(rowsOf(f).map(r => r.intelligence), [29.9, 34.6, 41.4, 52, 57.3])
  assert.equal(fs.readFileSync(f.ladder, 'utf8'), stored)
})
test('missing page reports command, leaves row intact and patches other rows', t => {
  const f = setup(t); writeSnapshot(f, snapshotOf({ [haikuHigh.slug]: { figures: { intelligence: 29.9 } } }))
  const out = run(f, ['--write']); assert.equal(out.exitCode, 1); assert.match(out.stdout, /agy\/gemini-4-argon@high: the snapshot has no page for gemini-4-argon: run node scripts\/aa-pages\.js read gemini-4-argon/); assert.deepEqual(rowsOf(f)[1], argonHigh); assert.equal(rowsOf(f)[0].intelligence, 29.9)
})
test('warns only when latest read dates differ', t => {
  const f = setup(t); const shot = (date) => snapshotOf({ [haikuHigh.slug]: { figures: { intelligence: 29.9 } }, [argonHigh.slug]: { readOn: date, figures: { intelligence: 50.4 } } })
  writeSnapshot(f, shot('2026-11-12')); assert.match(run(f).stdout, /Read dates differ: agy was read on 2026-11-12, claude on 2026-11-13\./)
  writeSnapshot(f, shot('2026-11-13')); assert.doesNotMatch(run(f).stdout, /Read dates differ/)
})
test('an estimate follows its reference, and the refresh adds no code field to a row', t => {
  const spark = row('muse/spark@high', 'spark', { intelligence: 28.7, estimateOf: haikuHigh.id, estimateDistance: -0.9 })
  const f = setup(t, [haikuHigh, spark]); const ladder = fs.readFileSync(f.ladder, 'utf8')
  const { choose } = require('../plugins/aether/lib/superdelegation.js')
  const harnesses = { muse: { installed: true, groups: { muse: { usable: true, quota: { windows: { weekly: { remaining: 0.5, resetsAt: new Date(Date.now() + 3600000).toISOString() } } } } } } }
  const pick = pairs => choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses }).picked?.id
  assert.equal(pick(rowsOf(f)), spark.id)
  writeSnapshot(f, snapshotOf({ [haikuHigh.slug]: { figures: { intelligence: 29.9 } } }))
  const out = run(f, ['--write']); assert.equal(out.exitCode, 0, out.stdout)
  const [a, b] = rowsOf(f); assert.deepEqual([a.intelligence, a.checked], [29.9, '2026-11-13']); assert.equal(a.code, undefined); assert.equal(b.intelligence, 29)
  assert.equal(pick(rowsOf(f)), spark.id); assert.equal(fs.readFileSync(f.ladder, 'utf8'), ladder)
})
test('a page with no intelligence keeps the intelligence and checked of the row', t => {
  const f = setup(t, [haikuHigh]); writeSnapshot(f, snapshotOf({ [haikuHigh.slug]: { figures: {} } })); run(f, ['--write'])
  const r = rowsOf(f)[0]; assert.deepEqual([r.intelligence, r.checked], [29.6, '2026-11-10'])
})
test('the last field of a row keeps its space, and ladder changes are shown but never written', t => {
  const f = setup(t, [haikuHigh]); const before = fs.readFileSync(f.ladder, 'utf8'); writeSnapshot(f, snapshotOf({ [haikuHigh.slug]: { figures: { intelligence: 29.9 } } }))
  const out = run(f, ['--write']); assert.match(out.stdout, /Recalculated ladder: haiku high/); assert.match(out.stdout, /Stored ladder: changed\n  extra rung 2: haiku xhigh\n  extra rung 3: sonnet high\n  extra rung 4: opus high\n  extra rung 5: opus xhigh\n/); assert.match(out.stdout, /The stored ladder was not written:/); assert.equal(fs.readFileSync(f.ladder, 'utf8'), before); assert.match(fs.readFileSync(f.pairs, 'utf8'), /"checked": "2026-11-13" \}/)
})
test('the code figures are not read: a row keeps the code fields it carries, and the report names none', t => {
  const carried = { ...haikuHigh, code: 21.72, codeChecked: '2026-11-10' }
  const f = setup(t, [carried])
  writeSnapshot(f, snapshotOf({ [carried.slug]: { figures: { intelligence: 29.9, code: 25 } } }))
  const out = run(f, ['--write'])
  assert.equal(out.exitCode, 0, out.stdout)
  const r = rowsOf(f)[0]
  assert.deepEqual([r.intelligence, r.code, r.codeChecked], [29.9, 21.72, '2026-11-10'])
  assert.doesNotMatch(out.stdout, /code/)
})
test('a null cost without an owner decision is filled from the snapshot when the snapshot has it', t => {
  const f = setup(t, [{ ...argonHigh, costPerTaskUsd: null }])
  writeSnapshot(f, snapshotOf({ [argonHigh.slug]: { figures: { intelligence: 50.4, costPerTaskUsd: 4.973 } } }))
  const out = run(f, ['--write'])
  assert.equal(out.exitCode, 0, out.stdout)
  assert.match(out.stdout, /costPerTaskUsd none → 4\.973/)
  const r = rowsOf(f)[0]
  assert.equal(r.costPerTaskUsd, 4.973)
})
test('bad arguments and usage print usage and exit 2', t => {
  const f = setup(t, [haikuHigh])
  for (const bad of [['--nope'], ['--pairs'], ['--ladder'], ['--snapshot'], ['positional']]) {
    const out = main(bad)
    assert.equal(out.exitCode, 2, bad.join(' '))
    assert.match(out.stdout, /^usage: node scripts\/refresh-lanes\.js /, bad.join(' '))
  }
  assert.equal(fs.readFileSync(f.pairs, 'utf8').includes('haiku'), true)
})
