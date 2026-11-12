'use strict'

// Issue #240, the lib part: an editing delegate runs on the Claude model of its ladder rung (config/ladder.json), and an
// attempt that does not end ok says why. The step tests use the REAL delegate command with superdelegation off: the
// command checks its flags first and returns `off` at its gate, so no model is called and no table is read.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const dr = require('../plugins/aether/lib/delegate-run.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const { delegatesReport } = require('../plugins/aether/lib/delegate-report.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')

const OK_TESTS = { command: 'npm test', exitCode: 0, passed: true, timedOut: false, outputTail: '' }

// An external file as `begin` writes it (see tests/delegate-run.test.js), over a repository whose worktree holds the work.
function world(t, extra = {}) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const base = repo.git('rev-parse', 'HEAD')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'new.js'), 'hello\n')
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, 'Write src/new.js.')
  const file = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const external = { id: 't1', session: 's1', cwd: repo.dir, attempt: 1, step: 'haiku-high', effort: 'high', launchKind: 'first', edits: true, owns: ['src/**'], tests: 'npm test', brief, findings: null, carry: null, pin: null, base, harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' }, task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000, ...extra }
  fs.writeFileSync(file, JSON.stringify(external))
  const done = { status: 'done', id: 'run1', run: 'run1', branch: 'aether/run1/task-1', worktree: repo.dir, head: 'abc', base, pair: { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high' }, summary: 'wrote it', tests: OK_TESTS, review: { status: 'done', pair: null, verdict: 'ready', findings: [], summary: 'fine' }, merge: 'aether-wt merge run1 task-1' }
  return { repo, dataDir, base, done }
}

// The lane gate reads two variables; a test that calls the real command starts without them, as the detached run does.
function clearLaneEnv(t) {
  const names = ['AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES']
  const saved = names.map((name) => [name, process.env[name]])
  for (const name of names) delete process.env[name]
  t.after(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

// Captures what the run writes to stderr: `start` sends that to the run's log.
function captureStderr(t) {
  const lines = []
  const write = process.stderr.write
  process.stderr.write = (chunk) => {
    lines.push(String(chunk))
    return true
  }
  t.after(() => {
    process.stderr.write = write
  })
  return lines
}

test('every step of config/ladder.json reaches the lane command: the real command, with superdelegation off, says off and not failed (issue 240)', async (t) => {
  clearLaneEnv(t)
  const steps = loadLadder().rungs.map((rung) => rung.step)
  assert.ok(steps.length > 0)
  for (const step of steps) {
    const { repo, dataDir } = world(t, { step })
    const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir })
    assert.equal(result.status, 'off', `step ${step}: ${JSON.stringify(result)}`)
    assert.equal(result.ok, false)
    assert.equal(typeof result.reason, 'string', `step ${step}: the off attempt says why`)
  }
})

test('a step that is a native model name, as an external file written before 0.37.0 names it, is passed as it is (issue 240)', async (t) => {
  clearLaneEnv(t)
  const { repo, dataDir } = world(t, { step: 'haiku' })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir })
  assert.equal(result.status, 'off', JSON.stringify(result))
})

test('a step that is not a rung of the ladder ends the attempt as failed, with the step in the reason, and calls no command (issue 240)', async (t) => {
  const { repo, dataDir } = world(t, { step: 'gpt-9-ultra' })
  let calls = 0
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => (calls += 1, { status: 'done' }) })
  assert.equal(calls, 0)
  assert.equal(result.status, 'failed')
  assert.equal(result.ok, false)
  assert.match(result.reason, /gpt-9-ultra/)
})

test('a delegate command that throws records its message as reason in the log result, the results file and what wait returns, and writes it to stderr (issue 240)', async (t) => {
  const { repo, dataDir } = world(t)
  const stderr = captureStderr(t)
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => { throw new Error('the lane table is missing') } })
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'the lane table is missing')
  const entry = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.equal(entry.reason, 'the lane table is missing')
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), 'utf8'))
  assert.equal(file.reason, 'the lane table is missing')
  assert.deepEqual(stderr.filter((line) => line.startsWith('aether-delegate run ')), ['aether-delegate run t1: the lane table is missing\n'])
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0 }), { done: true, ok: false, status: 'failed', text: null, reason: 'the lane table is missing' })
})

test('a reason is one line of at most 300 characters, and an attempt without one records null (issue 240)', async (t) => {
  const { repo, dataDir, done } = world(t)
  const long = `first line\n${'x'.repeat(400)}`
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => { throw new Error(long) } })
  assert.equal(result.reason.includes('\n'), false)
  assert.ok(result.reason.length <= 300, String(result.reason.length))
  assert.ok(result.reason.startsWith('first line x'))
  const ok = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => done })
  assert.equal(ok.status, 'done')
  assert.equal(ok.reason, null)
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0 }), { done: true, ok: true, status: 'done', text: ok.text, reason: null })
})

test('a read-only delegate whose AETHER-TREE is gone says so in its reason (issue 240)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, step: 'haiku-high', tree: path.join(tempDir(t), 'gone') })
  const stderr = captureStderr(t)
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: async () => { throw new Error('the chain must not run') } })
  assert.equal(result.status, 'failed')
  assert.match(result.reason, /^tree not found: .*gone$/)
  assert.ok(stderr.some((line) => line.startsWith('aether-delegate run t1: tree not found: ')))
})

test('a failed read-only chain gives its last attempt\'s detail as the reason (issue 240)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false })
  const runChain = async () => ({ ok: false, status: 'failed', text: null, detail: 'grok: the call stopped at its start', attempts: [{ harness: 'grok', model: 'grok-4.7', effort: 'high', status: 'failed', detail: 'grok: the call stopped at its start' }], changed: [] })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain })
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'grok: the call stopped at its start')
  const entry = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.equal(entry.reason, 'grok: the call stopped at its start')
})

test('the report row of a failed external attempt shows its reason in fallback; without one it says only the status (issue 240)', async (t) => {
  const { repo, dataDir } = world(t)
  log.appendEntry(dataDir, { kind: 'launch', task: 't1', session: 's1', time: 1, step: 'haiku-high', attempt: 1, launchKind: 'first', description: 'd', effort: 'high', edits: true })
  await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => { throw new Error('no harness answered') } })
  const row = delegatesReport({ dataDir }).delegations.find((d) => d.id === 't1')
  assert.equal(row.fallback, 'external failed: no harness answered')

  const bare = world(t)
  log.appendEntry(bare.dataDir, { kind: 'launch', task: 't1', session: 's1', time: 1, step: 'haiku-high', attempt: 1, launchKind: 'first', description: 'd', effort: 'high', edits: true })
  await dr.runTask({ id: 't1', cwd: bare.repo.dir, dataDir: bare.dataDir }, { delegateCommand: async () => ({ status: 'failed' }) })
  const bareRow = delegatesReport({ dataDir: bare.dataDir }).delegations.find((d) => d.id === 't1')
  assert.equal(bareRow.fallback, 'external failed')
})
