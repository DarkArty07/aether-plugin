'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { tempDir, makeRepo, runBin, PLUGIN } = require('./helpers.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const repeat = require('../plugins/aether/lib/skill-repeat.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const verdict = (data, session, task, findings, kind = 'fix') =>
  log.appendEntry(data, { kind: 'verdict', time: Date.now(), session, task, attempt: 1, step: 'haiku', verdict: kind, input: { kind, findings: findings.map(([file, line, what]) => ({ file, line, what })), reason: null, fromScratch: false } })
const bash = (command, session = 's1') => ({ session_id: session, cwd: '/repo', tool_name: 'Bash', tool_input: { command } })

test('a finding of the last verdict that another task of the session already had is reported with the tasks (R31, A10, H3 scenario 24)', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 's1', 't1', [['src/a.js', 3, 'the empty case is missing'], ['src/b.js', 9, 'unrelated']])
  verdict(data, 's1', 't3', [['SRC/a.js', 40, 'The empty case is missing']])
  verdict(data, 's1', 't2', [['src/a.js', 7, 'the empty case is missing'], ['src/c.js', 1, 'new one']])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't2' }), [{ finding: 'src/a.js: the empty case is missing', tasks: ['t1', 't3'] }])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't1' }), [{ finding: 'src/a.js: the empty case is missing', tasks: ['t3', 't2'] }])
})

test('another session, an approve and a task with no verdict give nothing (R31)', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 'other', 't1', [['src/a.js', 3, 'the empty case is missing']])
  verdict(data, 's1', 't2', [['src/a.js', 7, 'the empty case is missing']])
  verdict(data, 's1', 't3', [], 'approve')
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't2' }), [])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't3' }), [])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 'nobody' }), [])
  assert.deepEqual(repeat.repeatedFindings(tempDir(t), { session: 's1', task: 't2' }), [])
})

test('after aether-delegate verdict the handler says the finding already came up, and says nothing for other commands (R31)', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 's1', 't1', [['src/a.js', 3, 'the empty case is missing']])
  verdict(data, 's1', 't2', [['src/a.js', 7, 'the empty case is missing']])
  const ctx = { env: {}, home: '/h', now: 1, dataDir: data }
  const text = repeat.posttool(bash('aether-delegate verdict --task t2 --verdict fix --finding "src/a.js:7: the empty case is missing"'), ctx)
  assert.equal(text, 'The finding "src/a.js: the empty case is missing" already came up in task t1. Consider a skill for it: load aether:skills.')
  verdict(data, 's1', 't3', [['src/a.js', 1, 'the empty case is missing']])
  assert.match(repeat.posttool(bash('node /p/bin/aether-delegate verdict --task t3 --verdict fix'), ctx), /already came up in tasks t1, t2\./)
  for (const command of ['ls', 'aether-delegate begin --session s1 --input x', 'aether-delegate verdict --verdict fix']) assert.equal(repeat.posttool(bash(command), ctx), null, command)
  assert.equal(repeat.posttool({ ...bash('aether-delegate verdict --task t2'), tool_name: 'Write' }, ctx), null)
  assert.equal(repeat.posttool(null, ctx), null)
})

test('multiple repeated findings return multiple lines in posttool', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 's1', 't1', [['src/a.js', 1, 'missing check'], ['src/b.js', 2, 'syntax error']])
  verdict(data, 's1', 't2', [['src/a.js', 5, 'missing check'], ['src/b.js', 8, 'syntax error']])
  const ctx = { env: {}, home: '/h', now: 1, dataDir: data }
  const text = repeat.posttool(bash('aether-delegate verdict --task t2 --verdict fix'), ctx)
  assert.equal(
    text,
    'The finding "src/a.js: missing check" already came up in task t1. Consider a skill for it: load aether:skills.\n' +
    'The finding "src/b.js: syntax error" already came up in task t1. Consider a skill for it: load aether:skills.'
  )
})

// A real begin makes each launch; one verdict goes through the library and one through the real bin, so the findings
// are stored as { file, line, what } exactly as in production.
test('repeatedFindings matches similar words of finding.what across sessions of one project, through the real verdict path, and respects the config threshold (R1, R2, R22, C1)', async (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-repeat-sim-')
  const deps = { dataDir: data, cwd: repo.dir, home: tempDir(t, 'aether-home-'), settings: { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }, pickPair: async () => ({ pick: null, quota: [] }) }
  const launch = (session) => task.begin({ session, event: { subagent_type: 'general-purpose', description: 'd', prompt: 'AETHER-TASK: t1\nDo the work.' } }, deps)
  assert.equal((await launch('s1')).kind, 'first')
  const v1 = await task.verdict({ task: 't1', verdict: 'fix', session: 's1', findings: ['src/foo.js:10:falta validar el borde cuando la lista viene vacía'] }, deps)
  assert.equal(v1.ok, true, JSON.stringify(v1))
  assert.equal((await launch('s2')).kind, 'first')
  const BIN = path.join(PLUGIN, 'bin', 'aether-delegate')
  const v2 = runBin(BIN, ['verdict', '--task', 't1', '--verdict', 'fix', '--session', 's2', '--finding', 'src/foo.js:18:no valida la lista vacía en el borde'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(v2.json.ok, true, v2.stdout + v2.stderr)

  const verdicts = log.readEntries(data, { task: 't1' }).filter((e) => e.kind === 'verdict')
  assert.deepEqual(verdicts.map((e) => [e.session, e.repo]), [['s1', repo.dir], ['s2', repo.dir]])
  assert.deepEqual(Object.keys(verdicts[1].input.findings[0]).sort(), ['file', 'line', 'what'])

  const across = repeat.repeatedFindings(data, { session: 's2', task: 't1' })
  assert.deepEqual(across, [{ finding: 'src/foo.js: no valida la lista vacía en el borde', tasks: ['t1'] }])
  const notice = repeat.posttool(
    { tool_name: 'Bash', session_id: 's2', cwd: repo.dir, tool_input: { command: 'aether-delegate verdict --task t1 --verdict fix --finding "src/foo.js:18:no valida la lista vacía en el borde"' } },
    { env: {}, home: '/h', now: 1, dataDir: data },
  )
  assert.equal(notice, 'The finding "src/foo.js: no valida la lista vacía en el borde" already came up in task t1. Consider a skill for it: load aether:skills.')
  assert.deepEqual(reg.readNotices(data).map((n) => [n.kind, n.name, n.session, n.repo]), [['repeated-finding', 'src/foo.js', 's2', repo.dir]])

  log.appendEntry(data, { kind: 'verdict', time: 1, session: 's9', task: 'legacy', attempt: 1, step: 'haiku', verdict: 'fix', input: { kind: 'fix', findings: [{ file: 'src/foo.js', line: 1, what: 'no valida la lista vacía en el borde' }], reason: null, fromScratch: false } })
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's2', task: 't1' }).map((r) => r.tasks), [['t1']], 'a legacy entry with no repo is not compared across sessions')

  const strict = repeat.repeatedFindings(data, { session: 's2', task: 't1', config: { minWordLength: 3, similarityThreshold: 0.99, stopwords: [] } })
  assert.deepEqual(strict, [])
})
