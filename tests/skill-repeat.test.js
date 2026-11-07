'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const repeat = require('../plugins/aether/lib/skill-repeat.js')

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
