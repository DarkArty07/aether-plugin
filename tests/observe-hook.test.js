'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

const { handleHook } = require(path.join(PLUGIN, 'lib', 'observe-hook.js'))
const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const { readSummary } = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))

const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
function lead(dir, id = 's-1') {
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sessions', `${id}.json`), '{}')
}
function walk(dir) {
  return fs.readdirSync(dir, { recursive: true }).map((e) => path.join(dir, e)).filter((f) => fs.statSync(f).isFile())
}

test('a session that is not the Lead writes nothing, not even a folder (E10, R13)', (t) => {
  const dir = tempDir(t)
  const input = { session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'ZEBRA' }
  assert.deepEqual(handleHook(input, { dataDir: dir, now: 5 }), { recorded: false, fragment: null })
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('a failed tool of a Lead session leaves the tool and nothing of its content (R3, R4, R10)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const input = { session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', is_interrupt: false, error: 'ZEBRA error text', tool_input: { command: 'ZEBRA' }, transcript_path: '/nonexistent/ZEBRA.jsonl' }
  assert.equal(handleHook(input, { dataDir: dir, now: 7 }).recorded, true)
  assert.deepEqual(observe.readEvents(dir), [{ time: 7, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash', interrupted: false }])
  for (const file of walk(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
})

test('a failed tool of a subagent, which carries the Lead session id and an agent_id, is not the Lead\'s', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const input = { session_id: 's-1', agent_id: 'a1b2', agent_type: 'general-purpose', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', is_interrupt: false }
  assert.deepEqual(handleHook(input, { dataDir: dir, now: 3 }), { recorded: false, fragment: null })
  assert.deepEqual(observe.readEvents(dir), [])
  assert.equal(handleHook({ ...input, agent_id: undefined }, { dataDir: dir, now: 4 }).recorded, true)
})

test('only ScheduleWakeup is recorded from PostToolUse', (t) => {
  const dir = tempDir(t)
  lead(dir)
  assert.equal(handleHook({ session_id: 's-1', hook_event_name: 'PostToolUse', tool_name: 'Read' }, { dataDir: dir, now: 1 }).recorded, false)
  assert.equal(handleHook({ session_id: 's-1', hook_event_name: 'PostToolUse', tool_name: 'ScheduleWakeup', tool_input: { prompt: 'ZEBRA' } }, { dataDir: dir, now: 2 }).recorded, true)
  assert.deepEqual(observe.readEvents(dir), [{ time: 2, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' }])
})

test('StopFailure, PreCompact and SessionEnd keep their one field, and SessionEnd leaves the session entry in the summary (C2)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  handleHook({ session_id: 's-1', hook_event_name: 'StopFailure', error: 'rate_limit' }, { dataDir: dir, now: 1 })
  handleHook({ session_id: 's-1', hook_event_name: 'StopFailure', error: 'free text with spaces ZEBRA' }, { dataDir: dir, now: 2 })
  handleHook({ session_id: 's-1', hook_event_name: 'PreCompact', trigger: 'auto' }, { dataDir: dir, now: 3 })
  handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear' }, { dataDir: dir, now: 4 })
  assert.deepEqual(observe.readEvents(dir).map((e) => [e.kind, e.class || e.trigger || e.reason]), [
    ['StopFailure', 'rate_limit'], ['StopFailure', 'unclassified'], ['PreCompact', 'auto'], ['SessionEnd', 'clear']])
  const entry = readSummary(dir).sessions['s-1']
  assert.equal(entry.events.SessionEnd, 1)
  assert.equal(entry.events.StopFailure, 2)
})

test('the development installation also keeps a redacted fragment; the standard one never opens the transcript (E9, R11)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, [
    { type: 'user', message: { role: 'user', content: 'please build' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: `ENOENT: no such file, token ${GH}` }] } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const input = { session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', transcript_path: transcript }
  assert.equal(handleHook(input, { dataDir: dir, now: 10, env: {} }).fragment, null)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
  const dev = handleHook(input, { dataDir: dir, now: 11, env: { AETHER_OBSERVE: 'dev' } })
  assert.equal(dev.fragment, path.join(dir, 'observe', 'dev', 's-1', '11-PostToolUseFailure.json'))
  const saved = fs.readFileSync(dev.fragment, 'utf8')
  assert.ok(saved.includes('ENOENT'))
  assert.equal(saved.includes(GH), false)
})

function seedRise(dir) {
  fs.mkdirSync(path.join(dir, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'delegates', 'log.jsonl'), [
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'verdict', time: 20, session: 's-1', task: 't2', step: 'haiku', verdict: 'fix', next: { kind: 'fix', cause: 'fix' }, reason: 'ZEBRA reason' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
}

test('SessionEnd runs the detectors by itself: findings and drafted issues exist with no command run (C1, R13)', (t) => {
  const dir = tempDir(t)
  const repo = tempDir(t)
  lead(dir)
  seedRise(dir)
  handleHook({ session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash' }, { dataDir: dir, now: 40 })
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'read.json')), false, 'nothing is read before the session ends')
  assert.equal(handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', cwd: repo }, { dataDir: dir, now: 50 }).recorded, true)
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  assert.ok(read.items.some((i) => i.type === 'rise-without-reason' && i.issue.body.length > 0))
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'issues', 'rise-without-reason-t2-2.md')))
  for (const file of walk(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
  assert.equal(fs.existsSync(path.join(repo, '.aether')), false, 'the repository is only read')
})

// A push the guard blocked at time 1000 and a grant of the same class added after it: the blocked-by-mistake finding
// of D4. The files live in the main checkout, where `.aether/` is.
function seedBlocked(repo) {
  fs.mkdirSync(path.join(repo, '.aether', 'autonomy'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.aether', 'pending.jsonl'), JSON.stringify({ time: 1000, session: 's-1', class: 'push', command: 'git push origin ZEBRA', cwd: '/x', mode: 'enforce' }) + '\n')
  fs.writeFileSync(path.join(repo, '.aether', 'autonomy', 'grants.json'), JSON.stringify({ grants: [{ class: 'push', scope: 'repo', quote: 'ZEBRA QUOTE', session: 's-1', time: 1, added: new Date(1500).toISOString() }], revoked: [] }))
}

function endSessionFrom(t, cwdOf) {
  const dir = tempDir(t)
  const { dir: repo, git } = makeRepo(t)
  lead(dir)
  seedBlocked(repo)
  handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', cwd: cwdOf(repo, git) }, { dataDir: dir, now: 5000 })
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  assert.ok(read.items.some((i) => i.type === 'blocked-by-mistake'), 'the blocked command of the main checkout is found')
  for (const file of walk(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
}

test('SessionEnd reads the main checkout from a subfolder of the repository (E5, C4)', (t) => {
  endSessionFrom(t, (repo) => {
    const sub = path.join(repo, 'sub')
    fs.mkdirSync(sub)
    return sub
  })
})

test('SessionEnd reads the main checkout from a worktree of the repository (E5, C4)', (t) => {
  endSessionFrom(t, (repo, git) => {
    const worktree = path.join(tempDir(t), 'wt')
    git('worktree', 'add', '-q', worktree, '-b', 'obs-worktree')
    return worktree
  })
})

test('SessionEnd of a session that is not the Lead reads nothing and writes nothing (C10)', (t) => {
  const dir = tempDir(t)
  seedRise(dir)
  assert.deepEqual(handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', cwd: tempDir(t) }, { dataDir: dir, now: 50 }), { recorded: false, fragment: null })
  assert.deepEqual(fs.readdirSync(dir), ['delegates'])
})

test('garbage input is ignored without throwing', (t) => {
  const dir = tempDir(t)
  for (const input of [null, undefined, 'x', 3, {}, { session_id: '../x', hook_event_name: 'SessionEnd' }, { session_id: 's-1', hook_event_name: 'Unknown' }]) {
    assert.deepEqual(handleHook(input, { dataDir: dir, now: 1 }), { recorded: false, fragment: null })
  }
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('observe-dev.js is required only inside the development branch (A4)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe-hook.js'), 'utf8')
  assert.match(source, /require\([^)]*observe-dev/)
  assert.doesNotMatch(source, /^(const|let|var)\s[^\n]*require\([^)]*observe-dev/m)
  assert.doesNotMatch(source, /transcript/)
})
