'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { digest } = require('../plugins/aether/lib/lanes.js')
const run = require('../plugins/aether/lib/run.js')

const wt = (repo, ...args) => runBin(WT_BIN, args, repo.dir)

function waiting(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = wt(repo, 'ensure', args.runId, 'task-1').json
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'work')
  const file = path.join(args.runDir, 'ladder', 'task-1-stuck.json')
  const text = JSON.stringify({ reason: 'the ladder is spent (exhausted)' })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  const begun = wt(repo, 'stuck', args.runId, 'task-1', '--payload', file, '--digest', digest(text))
  return { repo, args, unit, begun, tip: repo.git('-C', unit.path, 'rev-parse', 'HEAD') }
}

test('stuck opens the wait, and watch ends at once with the run, the unit and the reason', (t) => {
  const s = waiting(t)
  assert.equal(s.begun.status, 0, s.begun.stdout + s.begun.stderr)
  assert.deepEqual([s.begun.json.stuck, s.begun.json.state, s.begun.json.head], [true, 'waiting', s.tip])
  const out = wt(s.repo, 'watch', s.args.runId, '--interval', '0.05', '--silence', '600')
  assert.equal(out.status, 0, out.stdout + out.stderr)
  assert.deepEqual([out.json.watch, out.json.run, out.json.task, out.json.reason], ['stuck', s.args.runId, 'task-1', 'the ladder is spent (exhausted)'])
})

test('a delivery goes through deliver, shows in the next tick, and the end closes the wait', (t) => {
  const s = waiting(t)
  const delivered = wt(s.repo, 'deliver', s.args.runId, 'task-1', '--commit', s.tip, '--reason', 'moved the test into Owns')
  assert.equal(delivered.status, 0, delivered.stdout + delivered.stderr)
  assert.deepEqual(delivered.json, { delivered: true, task: 'task-1', commit: s.tip, reason: 'moved the test into Owns' })
  const tick = wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '1')
  assert.deepEqual(tick.json, { paused: 1, state: 'delivered', stop: false, commit: s.tip, reason: 'moved the test into Owns' })
  assert.deepEqual(wt(s.repo, 'stuck-end', s.args.runId, 'task-1', '--outcome', 'merged').json, { ended: true, task: 'task-1', outcome: 'merged' })
})

test('decline attends the unit: the tick says so and a watch relaunched after it does not end with that unit', (t) => {
  const s = waiting(t)
  const declined = wt(s.repo, 'decline', s.args.runId, 'task-1', '--reason', 'the plan puts the test outside Owns')
  assert.deepEqual(declined.json, { declined: true, task: 'task-1', reason: 'the plan puts the test outside Owns' })
  // Re-read the tick on the run directory as the decline left it. Aging that
  // directory and asking the watch for silence would also pass while the unit
  // was still waiting, so it does not count as proof.
  const tick = wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '1')
  assert.deepEqual(tick.json, { paused: 1, state: 'declined', stop: false, reason: 'the plan puts the test outside Owns' })
  const again = wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '1')
  assert.equal(again.json.state, 'declined')
  const saved = JSON.parse(fs.readFileSync(run.stuckFile(s.repo.dir, s.args.runId, 'task-1'), 'utf8'))
  assert.equal(saved.state, 'declined')
})

test('stuck-tick stops through the default path when the autonomous time ceiling has passed', (t) => {
  const s = waiting(t)
  const id = 'auto-20200101-000000-abcd'
  const dir = path.join(s.repo.dir, '.aether', 'autonomy', id)
  fs.mkdirSync(dir, { recursive: true })
  const started = new Date(Date.now() - 3 * 3600 * 1000).toISOString()
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({
    id,
    session: 'sess-test',
    quote: 'trabaja por horas en esto',
    started,
    ceilings: { hours: 1, usd: 50, source: { hours: 'owner', usd: 'owner' } },
    spend: [],
    ended: null,
    outcome: null,
  }))
  fs.writeFileSync(path.join(dir, 'diary.md'), '# diary\n')
  const tick = wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '1')
  assert.equal(tick.status, 0, tick.stdout + tick.stderr)
  assert.equal(tick.json.stop, true)
  assert.equal(tick.json.state, 'waiting')
})

function timingsOf(runDir) {
  const file = path.join(runDir, 'timings.jsonl')
  if (!fs.existsSync(file)) return []
  // compile records the baseline's duration first (spec 036 R18); the waits are what these tests count.
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line)).filter((line) => line.class !== 'baseline')
}

function pinAt(repo, runId, taskId) {
  const file = run.stuckFile(repo.dir, runId, taskId)
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  saved.at = '2020-01-01T00:00:00.000Z'
  fs.writeFileSync(file, JSON.stringify(saved) + '\n')
  return saved.at
}

function assertWait(lines, from, end) {
  assert.equal(lines.length, 1)
  assert.equal(lines[0].class, 'wait-stuck')
  assert.equal(lines[0].ms, Date.parse(end) - Date.parse(from))
}

test('a stuck wait records one wait-stuck timing when it is delivered, declined or ended', (t) => {
  const delivered = waiting(t)
  const fromDelivered = pinAt(delivered.repo, delivered.args.runId, 'task-1')
  assert.equal(wt(delivered.repo, 'deliver', delivered.args.runId, 'task-1', '--commit', delivered.tip, '--reason', 'moved the test into Owns').status, 0)
  const deliveredRecord = JSON.parse(fs.readFileSync(run.stuckFile(delivered.repo.dir, delivered.args.runId, 'task-1'), 'utf8'))
  assertWait(timingsOf(delivered.args.runDir), fromDelivered, deliveredRecord.delivered.at)

  const declined = waiting(t)
  const fromDeclined = pinAt(declined.repo, declined.args.runId, 'task-1')
  assert.equal(wt(declined.repo, 'decline', declined.args.runId, 'task-1', '--reason', 'the plan puts the test outside Owns').status, 0)
  const declinedRecord = JSON.parse(fs.readFileSync(run.stuckFile(declined.repo.dir, declined.args.runId, 'task-1'), 'utf8'))
  assertWait(timingsOf(declined.args.runDir), fromDeclined, declinedRecord.declined.at)

  const ended = waiting(t)
  const fromEnded = pinAt(ended.repo, ended.args.runId, 'task-1')
  assert.equal(wt(ended.repo, 'stuck-end', ended.args.runId, 'task-1', '--outcome', 'expired').status, 0)
  const endedRecord = JSON.parse(fs.readFileSync(run.stuckFile(ended.repo.dir, ended.args.runId, 'task-1'), 'utf8'))
  assertWait(timingsOf(ended.args.runDir), fromEnded, endedRecord.ended.at)

  const kept = waiting(t)
  pinAt(kept.repo, kept.args.runId, 'task-1')
  assert.equal(wt(kept.repo, 'deliver', kept.args.runId, 'task-1', '--commit', kept.tip, '--reason', 'moved the test into Owns').status, 0)
  assert.equal(wt(kept.repo, 'stuck-end', kept.args.runId, 'task-1', '--outcome', 'expired').json.state, 'delivered')
  assert.equal(timingsOf(kept.args.runDir).length, 1)
})

test('the commands refuse what the libs refuse, with an error line and exit 1', (t) => {
  const s = waiting(t)
  const noUnit = wt(s.repo, 'deliver', s.args.runId, 'task-1', '--commit', s.tip)
  assert.equal(noUnit.status, 1)
  assert.match(noUnit.json.error, /deliver needs --reason/)
  assert.match(wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '0').json.error, /--seconds must be a whole number from 1 to 120/)
  assert.match(wt(s.repo, 'stuck-end', s.args.runId, 'task-1', '--outcome', 'whenever').json.error, /unknown outcome/)
  assert.match(wt(s.repo, 'watch', s.args.runId, '--silence', '0').json.error, /--silence must be a whole number/)
  assert.match(wt(s.repo, 'decline', s.args.runId, 'task-2', '--reason', 'x').json.error, /task-2 is not in run|is not waiting/)
})

test('sweep --run leaves the end mark that the watch reads, and sweep --run --finish leaves none', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  assert.equal(wt(repo, 'sweep', '--run', args.runId).status, 0)
  assert.equal(fs.existsSync(path.join(args.runDir, 'launch-end.json')), true)
  const ended = wt(repo, 'watch', args.runId, '--interval', '0.05', '--silence', '600')
  assert.deepEqual([ended.json.watch, ended.json.message], ['ended', 'nada se trabó'])
  const other = compile(repo, plan([task(1)]))
  assert.equal(wt(repo, 'sweep', '--run', other.runId, '--finish').json.finished, true)
  assert.equal(fs.existsSync(other.runDir), false)
})

test('the usage line names the six new verbs', (t) => {
  const r = wt(makeRepo(t))
  assert.equal(r.status, 1)
  for (const verb of ['stuck ', 'stuck-tick', 'stuck-end', 'deliver', 'decline', 'watch']) assert.ok(r.json.error.includes(verb), verb)
})
