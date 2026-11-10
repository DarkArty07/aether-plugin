'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const hook = require('../plugins/aether/lib/continuity-hook.js')
const { markSession, readMark, touchSession } = require('../plugins/aether/lib/session.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-continuity')
const VERBS = ['stop', 'precompact', 'postcompact', 'stopfailure', 'sessionend', 'posttool', 'permission']

function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  markSession(data, 's1', 1000, { repo: repo.dir, claude: null })
  const env = { CLAUDE_CONFIG_DIR: configDir }
  const dir = store.continuityDir({ cwd: repo.dir, env, home: configDir })
  return { repo, data, configDir, env, dir }
}
function run(w, verb, input, extra = {}) {
  return spawnSync(process.execPath, [BIN, verb], {
    input: JSON.stringify({ session_id: 's1', cwd: w.repo.dir, ...input }),
    encoding: 'utf8',
    env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.configDir, ...extra },
  })
}
const filesUnder = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }) : [])

test('stop writes the note: the last message, the branch, the commit, the time and the session (C1, H1 scenario 4)', (t) => {
  const w = world(t)
  const r = run(w, 'stop', { hook_event_name: 'Stop', last_assistant_message: 'I finished the first half.' })
  assert.deepEqual([r.status, r.stdout], [0, ''])
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.lastMessage, 'I finished the first half.')
  assert.equal(note.branch, 'feature/x')
  assert.equal(note.commit, w.repo.git('rev-parse', 'HEAD'))
  assert.equal(note.session, 's1')
  assert.ok(note.updatedAt > 0)
  assert.equal(readMark(w.data, 's1').noteDir, w.dir, 'the first write records the folder of the note in the mark (R3)')
  const again = run(w, 'stop', { last_assistant_message: 'Second turn.' })
  assert.equal(again.status, 0)
  assert.equal(store.readNote(w.dir, 's1').lastMessage, 'Second turn.')
  assert.ok(readMark(w.data, 's1').lastActivity > 1000, 'each hook refreshes the last activity of the mark')
})

test('stop writes the note and refreshes activity when the delegate query throws', (t) => {
  const w = world(t)
  hook.openNote({ session_id: 's1', cwd: w.repo.dir }, {
    env: { ...w.env, AETHER_DATA_DIR: w.data }, home: w.configDir, now: 2000,
  })
  store.updateNote(w.dir, 's1', { branch: 'old-branch', commit: 'old-commit', notifiedUnverdicted: ['old@1'] })
  // The log reader catches filesystem errors; inject a query failure in an isolated process.
  const script = `
    const report = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'delegate-report.js'))})
    report.unverdictedDelegates = () => { throw new Error('query failed') }
    const hook = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'continuity-hook.js'))})
    const result = hook.handle('stop', { session_id: 's1', cwd: ${JSON.stringify(w.repo.dir)}, last_assistant_message: 'Saved despite failure' },
      { env: ${JSON.stringify({ ...w.env, AETHER_DATA_DIR: w.data })}, home: ${JSON.stringify(w.configDir)}, now: 5000 })
    require('node:assert/strict').equal(result, null)
  `
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.lastMessage, 'Saved despite failure')
  assert.equal(note.branch, 'feature/x')
  assert.equal(note.commit, w.repo.git('rev-parse', 'HEAD'))
  assert.equal(note.updatedAt, 5000)
  assert.deepEqual(note.notifiedUnverdicted, ['old@1'])
  assert.equal(readMark(w.data, 's1').lastActivity, 5000)
})

test('requiring the hook, precompact and subagent stop do not load the delegate report', (t) => {
  const w = world(t)
  const script = `
    const assert = require('node:assert/strict')
    const report = require.resolve(${JSON.stringify(path.join(PLUGIN, 'lib', 'delegate-report.js'))})
    const hook = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'continuity-hook.js'))})
    assert.equal(Boolean(require.cache[report]), false, 'requiring the hook loads the delegate report')
    hook.handle('precompact', { session_id: 's1', cwd: ${JSON.stringify(w.repo.dir)} },
      { env: ${JSON.stringify({ ...w.env, AETHER_DATA_DIR: w.data })}, home: ${JSON.stringify(w.configDir)}, now: 5000 })
    assert.equal(Boolean(require.cache[report]), false, 'precompact loads the delegate report')
    hook.handle('stop', { session_id: 's1', cwd: ${JSON.stringify(w.repo.dir)}, agent_id: 'sub-1' },
      { env: ${JSON.stringify({ ...w.env, AETHER_DATA_DIR: w.data })}, home: ${JSON.stringify(w.configDir)}, now: 6000 })
    assert.equal(Boolean(require.cache[report]), false, 'a subagent stop loads the delegate report')
    const log = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'delegate-log.js'))})
    log.appendEntry(${JSON.stringify(w.data)}, { time: 10, session: 's1', task: 't1', attempt: 1, step: 'sonnet', launchKind: 'first', description: 't1', effort: 'medium', edits: true, kind: 'launch' })
    log.appendEntry(${JSON.stringify(w.data)}, { time: 20, session: 's1', task: 't1', attempt: 1, ok: true, status: 'done', kind: 'result' })
    const out = hook.handle('stop', { session_id: 's1', cwd: ${JSON.stringify(w.repo.dir)} },
      { env: ${JSON.stringify({ ...w.env, AETHER_DATA_DIR: w.data })}, home: ${JSON.stringify(w.configDir)}, now: 7000 })
    assert.ok(out && typeof out.additionalContext === 'string' && out.additionalContext.includes('t1'), 'stop in Lead session gives the notice')
    assert.equal(Boolean(require.cache[report]), true, 'stop in Lead session loads the delegate report')
  `
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(store.readNote(w.dir, 's1').updatedAt, 7000)
})

test('precompact prints nothing; postcompact keeps the summary; stopfailure keeps the reason of the cut (C1, H1 scenario 3)', (t) => {
  const w = world(t)
  const pre = run(w, 'precompact', { trigger: 'auto' })
  assert.deepEqual([pre.status, pre.stdout], [0, ''])
  const post = run(w, 'postcompact', { trigger: 'auto', compact_summary: 'We built the store.' })
  assert.deepEqual([post.status, post.stdout], [0, ''])
  assert.equal(store.readNote(w.dir, 's1').compactSummary, 'We built the store.')
  const failure = run(w, 'stopfailure', { error: 'rate_limit', last_assistant_message: 'Cut here.' })
  assert.equal(failure.status, 0)
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.cut.reason, 'rate_limit')
  assert.equal(note.lastMessage, 'Cut here.')
})

test('sessionend only marks the close and its reason, runs no git and reads no conversation (R3)', (t) => {
  const w = world(t)
  run(w, 'stop', { last_assistant_message: 'Before the end.' })
  const before = store.readNote(w.dir, 's1')
  const r = run(w, 'sessionend', { reason: 'prompt_input_exit', transcript_path: path.join(w.configDir, 'no-such-transcript.jsonl') }, { PATH: '' })
  assert.deepEqual([r.status, r.stdout], [0, ''])
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.closed.reason, 'prompt_input_exit')
  assert.ok(note.closed.at > 0)
  assert.equal(note.lastMessage, before.lastMessage)
  assert.equal(note.commit, before.commit)
})

test('sessionend runs no git even when git is on the PATH (R3)', (t) => {
  const w = world(t)
  run(w, 'stop', { last_assistant_message: 'Before the end.' })
  const shim = tempDir(t, 'aether-shim-')
  const log = path.join(shim, 'git.log')
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\necho ran >> '${log}'\nexit 1\n`, { mode: 0o755 })
  const r = run(w, 'sessionend', { reason: 'other' }, { PATH: shim })
  assert.deepEqual([r.status, r.stdout], [0, ''])
  assert.equal(fs.existsSync(log), false, 'sessionend ran git')
  assert.equal(store.readNote(w.dir, 's1').closed.reason, 'other')
})

test('sessionend writes nothing when the mark records no folder for the note (R3)', (t) => {
  const w = world(t)
  const r = run(w, 'sessionend', { reason: 'other' }, { PATH: '' })
  assert.deepEqual([r.status, r.stdout], [0, ''])
  assert.equal(store.readNote(w.dir, 's1'), null)
  assert.deepEqual(filesUnder(w.dir), [])
})

test('the SessionEnd part finishes in under 200 ms on a realistic note (R3)', (t) => {
  const w = world(t)
  const opts = { env: { ...w.env, AETHER_DATA_DIR: w.data }, home: w.configDir, now: Date.now() }
  hook.handle('stop', { session_id: 's1', cwd: w.repo.dir, last_assistant_message: 'm'.repeat(2000) }, opts)
  hook.handle('postcompact', { session_id: 's1', cwd: w.repo.dir, compact_summary: 's'.repeat(8000) }, opts)
  const started = process.hrtime.bigint()
  hook.handle('sessionend', { session_id: 's1', cwd: w.repo.dir, reason: 'other' }, opts)
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(ms < 200, `sessionend took ${ms} ms`)
  assert.ok(store.readNote(w.dir, 's1').closed)
})

test('openNote writes a complete note with the process of claude, says whether it is a fork and records its folder (R1, R3)', (t) => {
  const w = world(t)
  const proc = tempDir(t, 'aether-proc-')
  fs.mkdirSync(path.join(proc, '300'), { recursive: true })
  fs.writeFileSync(path.join(proc, '300', 'comm'), 'claude\n')
  fs.writeFileSync(path.join(proc, '300', 'stat'), ['300', '(claude)', 'S', '1', ...Array(17).fill('0'), '4242', '0'].join(' '))
  markSession(w.data, 's2', 1000, { repo: w.repo.dir, claude: null })
  const note = hook.openNote({ session_id: 's2', cwd: w.repo.dir, source: 'fork' }, { env: { ...w.env, AETHER_DATA_DIR: w.data }, home: w.configDir, now: 5000, procRoot: proc, from: 300, fork: true })
  assert.deepEqual([note.session, note.source, note.fork, note.startedAt, note.process, note.closed, note.cut], ['s2', 'fork', true, 5000, { pid: 300, start: 4242 }, null, null])
  assert.equal(note.repo, w.repo.dir)
  assert.deepEqual(store.readNote(w.dir, 's2'), note)
  assert.equal(readMark(w.data, 's2').noteDir, w.dir)
})

test('a session that is not the Lead writes nothing and prints nothing, for every verb (R40)', (t) => {
  const w = world(t)
  const before = filesUnder(w.data).sort()
  for (const verb of VERBS) {
    const r = run(w, verb, { session_id: 'someone-else', last_assistant_message: 'hello', reason: 'other', error: 'x', compact_summary: 'y' })
    assert.deepEqual([verb, r.status, r.stdout], [verb, 0, ''])
  }
  assert.deepEqual(filesUnder(w.configDir), [])
  assert.deepEqual(filesUnder(w.data).sort(), before)
})

test('a bad input or an unknown verb exits 0 and prints nothing', (t) => {
  const w = world(t)
  const bad = spawnSync(process.execPath, [BIN, 'stop'], { input: 'not json', encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data } })
  assert.deepEqual([bad.status, bad.stdout], [0, ''])
  const unknown = run(w, 'nonsense', {})
  assert.deepEqual([unknown.status, unknown.stdout], [0, ''])
  for (const verb of ['posttool', 'permission']) {
    const r = run(w, verb, { tool_name: 'Write', tool_input: { file_path: path.join(w.repo.dir, 'a.txt') } })
    assert.deepEqual([verb, r.status, r.stdout], [verb, 0, ''])
  }
})

test('the observation store keeps no text of the conversation: what continuity saves goes to the note only (R4)', (t) => {
  const w = world(t)
  run(w, 'stop', { last_assistant_message: 'SECRET-TEXT-4711' })
  run(w, 'postcompact', { compact_summary: 'SECRET-TEXT-4711' })
  assert.ok(JSON.stringify(store.readNote(w.dir, 's1')).includes('SECRET-TEXT-4711'))
  for (const entry of filesUnder(w.data)) {
    const file = path.join(w.data, entry)
    if (fs.statSync(file).isFile()) assert.ok(!fs.readFileSync(file, 'utf8').includes('SECRET-TEXT-4711'), `${entry} holds conversation text`)
  }
})

const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks
const entriesOf = (event) => (hooks[event] || []).flatMap((group) => group.hooks.map((h) => ({ ...h, matcher: group.matcher })))
const mine = (event) => entriesOf(event).filter((h) => h.command.includes('aether-continuity'))

test('hooks.json registers one aether-continuity entry per verb, apart from the entries of aether-observe (R2, R3)', () => {
  const verbs = { Stop: 'stop', PreCompact: 'precompact', PostCompact: 'postcompact', StopFailure: 'stopfailure', SessionEnd: 'sessionend', PostToolUse: 'posttool', PermissionRequest: 'permission' }
  for (const [event, verb] of Object.entries(verbs)) {
    assert.equal(mine(event).length, 1, event)
    assert.ok(mine(event)[0].command.endsWith(`/bin/aether-continuity" ${verb}`), event)
  }
  for (const event of ['PreCompact', 'StopFailure', 'SessionEnd']) assert.ok(entriesOf(event).some((h) => h.command.includes('aether-observe')), `${event} keeps the observation entry`)
  assert.equal(mine('SessionEnd')[0].timeout, undefined)
  assert.equal(mine('PostToolUse')[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash')
  assert.equal(mine('PermissionRequest')[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit')
  assert.equal(hooks.SessionStart[0].matcher, 'startup|resume|clear|compact|fork')
  assert.equal(hooks.WorktreeCreate, undefined, 'Aether registers no WorktreeCreate hook: the copies of Claude Code stay in .claude/worktrees/ (R16)')
})

test('the bin has the fifteen commands the pages count and is executable', () => {
  assert.equal(fs.readdirSync(path.join(PLUGIN, 'bin')).length, 15)
  assert.ok(fs.statSync(BIN).mode & 0o111)
})

test('stop warns once per unverdicted delegate result in the Lead session and stays silent on repeat or subagent', (t) => {
  const w = world(t)
  const log = require('../plugins/aether/lib/delegate-log.js')
  log.appendEntry(w.data, { time: 10, session: 's1', task: 'fix-bug', attempt: 1, step: 'sonnet', launchKind: 'first', description: 'fix bug', effort: 'medium', edits: true, kind: 'launch' })
  log.appendEntry(w.data, { time: 20, session: 's1', task: 'fix-bug', attempt: 1, ok: true, status: 'done', kind: 'result' })

  touchSession(w.data, 's1', 2000)
  const activityBefore = readMark(w.data, 's1').lastActivity
  assert.equal(activityBefore, 2000)
  const subRes = run(w, 'stop', { agent_id: 'sub-1' })
  assert.equal(subRes.status, 0)
  assert.equal(subRes.stdout, '')
  assert.equal(store.readNote(w.dir, 's1'), null)
  assert.equal(readMark(w.data, 's1').lastActivity, activityBefore)

  const first = run(w, 'stop', {})
  assert.equal(first.status, 0)
  const out1 = JSON.parse(first.stdout)
  assert.equal(out1.hookSpecificOutput.hookEventName, 'Stop')
  assert.match(out1.hookSpecificOutput.additionalContext, /fix-bug/)
  assert.match(out1.hookSpecificOutput.additionalContext, /aether-delegate verdict/)

  const second = run(w, 'stop', {})
  assert.equal(second.status, 0)
  assert.equal(second.stdout, '')

  log.appendEntry(w.data, { time: 30, session: 's1', task: 'fix-bug', attempt: 1, step: 'sonnet', verdict: 'fix', next: { step: 'sonnet', kind: 'fix', cause: 'fix' }, kind: 'verdict' })
  log.appendEntry(w.data, { time: 40, session: 's1', task: 'fix-bug', attempt: 2, step: 'sonnet', launchKind: 'fix', description: 'fix bug', effort: 'high', edits: true, kind: 'launch' })
  log.appendEntry(w.data, { time: 50, session: 's1', task: 'fix-bug', attempt: 2, ok: true, status: 'done', kind: 'result' })
  const third = run(w, 'stop', {}, { LANG: 'es_ES.UTF-8', LC_ALL: '', LC_MESSAGES: '' })
  assert.equal(third.status, 0)
  const out3 = JSON.parse(third.stdout)
  assert.match(out3.hookSpecificOutput.additionalContext, /Continuidad de Aether/)
  assert.match(out3.hookSpecificOutput.additionalContext, /fix-bug \(attempt 2\)/)
})

test('the real hooks.json sends Read, Grep and Glob to the posttool counter: its matcher selects them and its command prints the notice on the tenth read (spec 031, R7)', (t) => {
  const w = world(t)
  const group = hooks.PostToolUse.find((g) => g.hooks.some((h) => h.command.endsWith('/bin/aether-continuity" posttool')))
  assert.ok(group, 'hooks.json has a PostToolUse entry for aether-continuity posttool')
  const selects = (tool) => new RegExp(`^(?:${group.matcher})$`).test(tool)
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Read', 'Grep', 'Glob', 'Bash']) assert.ok(selects(tool), `${tool} reaches the counter`)
  for (const tool of ['WebFetch', 'Agent', 'ScheduleWakeup']) assert.ok(!selects(tool), `${tool} does not`)
  const file = path.join(w.repo.dir, 'src', 'a.js')
  const outputs = []
  for (const tool of ['Read', 'Grep', 'Glob', 'Read', 'Grep', 'Glob', 'Read', 'Grep', 'Glob', 'Read']) {
    assert.ok(selects(tool))
    const r = run(w, 'posttool', { hook_event_name: 'PostToolUse', prompt_id: 'p1', tool_name: tool, tool_input: tool === 'Read' ? { file_path: file } : { pattern: 'x' } }, { LC_ALL: '', LC_MESSAGES: '', LANG: 'en_US.UTF-8' })
    assert.equal(r.status, 0)
    outputs.push(r.stdout)
  }
  assert.deepEqual(outputs.slice(0, 9), Array(9).fill(''), 'nine reads and searches print nothing')
  assert.match(JSON.parse(outputs[9]).hookSpecificOutput.additionalContext, /direct-path limit/)
})
