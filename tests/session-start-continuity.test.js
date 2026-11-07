'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const { PART_LIMIT, main } = require('../plugins/aether/lib/session-start.js')
const { readMark } = require('../plugins/aether/lib/session.js')
const { handle } = require('../plugins/aether/lib/continuity-hook.js')

function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  delete env.LC_ALL
  delete env.LC_MESSAGES
  delete env.CLAUDE_ENV_FILE
  fs.writeFileSync(path.join(repo.dir, 'ahead.txt'), 'ahead')
  repo.git('add', 'ahead.txt')
  repo.git('commit', '-q', '-m', 'ahead of main')
  const dir = store.continuityDir({ cwd: repo.dir, env, home: configDir })
  const start = (source, session = 'now-session', agent = 'aether:lead') => {
    const input = { hook_event_name: 'SessionStart', session_id: session, source, ...(agent ? { agent_type: agent } : {}) }
    const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, input: JSON.stringify(input), encoding: 'utf8', env })
    return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null }
  }
  const prior = (note = {}) => store.writeNote(dir, { session: 'prev-session', branch: 'feature/x', commit: repo.git('rev-parse', 'HEAD'), updatedAt: Date.now() - 3600000, lastMessage: 'I was refactoring the store', process: { pid: 2147483000, start: 1 }, closed: null, cut: null, ...note })
  return { repo, data, configDir, dir, start, prior }
}
const hasProc = fs.existsSync('/proc/self/stat')

test('startup shows the previous session in 3 to 5 lines, in the context and in the message to the person, and opens its own note (C2, H1 scenario 1)', { skip: !hasProc }, (t) => {
  const w = world(t)
  w.prior()
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.match(out.systemMessage, /^Aether /)
  assert.ok(out.systemMessage.includes('claude --resume prev-session') && out.systemMessage.includes('I was refactoring the store'))
  assert.ok(out.hookSpecificOutput.additionalContext.includes('claude --resume prev-session'))
  const lines = out.systemMessage.split('\n').slice(1)
  assert.ok(lines.length >= 3 && lines.length <= 5, lines.join('\n'))
  const mine = store.readNote(w.dir, 'now-session')
  assert.deepEqual([mine.source, mine.fork, mine.branch], ['startup', false, 'feature/x'])
})

test('the message of startup is the welcome line followed by the notice, never the welcome alone (R5)', (t) => {
  const w = world(t)
  const lines = w.start('startup').out.systemMessage.split('\n')
  assert.match(lines[0], /^Aether .*\/aether:help/)
  assert.ok(lines.length >= 2)
})

test('a first session in a project shows one line and fails nothing (H1 scenario 6)', (t) => {
  const w = world(t)
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.ok(out.systemMessage.split('\n').includes('No earlier session in this project.'))
})

test('a fork prints only the notice and opens its own note without touching the other; resume prints nothing and only refreshes its own note (A11, H1 scenario 5)', (t) => {
  const f = world(t)
  f.prior({ closed: { at: 1, reason: 'other' } })
  const before = fs.readFileSync(path.join(f.dir, 'prev-session.json'), 'utf8')
  const fork = f.start('fork', 's-fork')
  assert.equal(fork.status, 0)
  assert.equal(fork.out.hookSpecificOutput.additionalContext, fork.out.systemMessage)
  assert.ok(!fork.out.systemMessage.includes('Aether mode is active'))
  assert.ok(fork.out.systemMessage.includes('ended normally'))
  assert.equal(store.readNote(f.dir, 's-fork').fork, true)
  assert.equal(fs.readFileSync(path.join(f.dir, 'prev-session.json'), 'utf8'), before)
  const r = world(t)
  r.prior({ closed: { at: 1, reason: 'other' } })
  store.writeNote(r.dir, { session: 'now-session', branch: 'feature/x', commit: 'c', updatedAt: Date.now() - 1000, source: 'startup', process: { pid: 2147483000, start: 1 }, closed: { at: 5, reason: 'prompt_input_exit' }, cut: null })
  const resume = r.start('resume')
  assert.deepEqual([resume.status, resume.stdout], [0, ''])
  const note = store.readNote(r.dir, 'now-session')
  assert.deepEqual([note.source, note.closed, note.cut], ['resume', null, null])
})

test('a compact repeats no notice and opens no note (A11, H1 scenario 3)', (t) => {
  const w = world(t)
  w.prior()
  const { status, out } = w.start('compact')
  assert.equal(status, 0)
  assert.ok(!out.hookSpecificOutput.additionalContext.includes('Last session'))
  assert.equal(store.readNote(w.dir, 'now-session'), null)
})

test('startup prunes the notes of more than 30 days and keeps the newest (C3, H1 scenario 7)', (t) => {
  const w = world(t)
  const day = 86400000
  store.writeNote(w.dir, { session: 'ancient', commit: 'a'.repeat(40), updatedAt: Date.now() - 31 * day })
  w.prior()
  assert.equal(w.start('startup').status, 0)
  assert.deepEqual(store.readNotes(w.dir).map((n) => n.session).sort(), ['now-session', 'prev-session'])
})

test('the whole output stays within the limit even with a huge last message, and the first line stays (R7)', (t) => {
  const w = world(t)
  w.prior({ lastMessage: 'z'.repeat(2000) })
  const { stdout, out } = w.start('startup')
  assert.ok(stdout.length <= PART_LIMIT, `${stdout.length} characters`)
  assert.ok(out.systemMessage.includes('Last session'))
})

test('an unreadable or foreign note is skipped and the start goes on (R7)', (t) => {
  const w = world(t)
  fs.mkdirSync(w.dir, { recursive: true })
  fs.writeFileSync(path.join(w.dir, 'bad.json'), '{')
  fs.writeFileSync(path.join(w.dir, 'foreign.json'), JSON.stringify({ version: 9, session: 'foreign', updatedAt: Date.now() }))
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.ok(out.systemMessage.includes('No earlier session in this project.'))
})

test('a session that is not the Lead prints nothing and writes nothing (R40)', (t) => {
  const w = world(t)
  w.prior()
  for (const source of ['startup', 'resume', 'fork']) {
    const r = w.start(source, 'plain', null)
    assert.deepEqual([r.status, r.stdout], [0, ''])
  }
  assert.deepEqual(fs.readdirSync(w.dir), ['prev-session.json'])
  assert.deepEqual(fs.existsSync(path.join(w.data, 'sessions')) ? fs.readdirSync(path.join(w.data, 'sessions')) : [], [])
})

for (const source of ['resume', 'compact']) {
  test(`${source} keeps the recorded note folder so SessionEnd can close the session (R3)`, (t) => {
    const cwd = tempDir(t)
    const data = tempDir(t, 'aether-data-')
    const configDir = tempDir(t, 'aether-config-')
    const procRoot = tempDir(t, 'aether-proc-')
    const env = { ...process.env, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir }
    delete env.CLAUDE_ENV_FILE
    const input = { session_id: 'recorded-session', agent_type: 'aether:lead', cwd }
    let output = ''
    const options = { env, cwd, procRoot, from: 100, stdout: { write(text) { output += text } } }
    main({ ...options, input: { ...input, source: 'startup' } })
    const dir = store.continuityDir({ cwd, env })
    assert.equal(readMark(data, input.session_id).noteDir, dir)
    store.updateNote(dir, input.session_id, { lastMessage: 'Work saved before restarting', compactSummary: 'Keep this summary' })

    output = ''
    main({ ...options, input: { ...input, source } })
    if (source === 'resume') assert.equal(output, '')
    assert.equal(readMark(data, input.session_id).noteDir, dir)
    const note = store.readNote(dir, input.session_id)
    assert.equal(note.lastMessage, 'Work saved before restarting')
    assert.equal(note.compactSummary, 'Keep this summary')

    handle('sessionend', { ...input, reason: 'prompt_input_exit' }, { env, procRoot, from: 100 })
    assert.equal(store.readNote(dir, input.session_id).closed.reason, 'prompt_input_exit')
  })
}

test('resume reconnects an existing note when its session marker is missing (R3, R5)', (t) => {
  const cwd = tempDir(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const procRoot = tempDir(t, 'aether-proc-')
  const env = { AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir }
  const input = { session_id: 'resumed-session', agent_type: 'aether:lead', cwd, source: 'resume' }
  const dir = store.continuityDir({ cwd, env })
  store.writeNote(dir, {
    session: input.session_id, source: 'startup', lastMessage: 'Saved work', compactSummary: 'Saved summary',
    process: { pid: 200, start: 22 }, closed: { at: 1, reason: 'other' }, cut: { at: 2, reason: 'network' },
  })
  fs.mkdirSync(path.join(procRoot, '100'))
  fs.writeFileSync(path.join(procRoot, '100', 'stat'), ['100', '(claude)', 'S', 1, ...Array(17).fill('0'), 555, 0].join(' '))

  let output = ''
  main({ input, env, cwd, procRoot, from: 100, stdout: { write(text) { output += text } } })
  assert.equal(output, '')
  const note = store.readNote(dir, input.session_id)
  assert.deepEqual([note.source, note.process, note.closed, note.cut], ['resume', { pid: 100, start: 555 }, null, null])
  assert.deepEqual([note.lastMessage, note.compactSummary], ['Saved work', 'Saved summary'])
  assert.equal(readMark(data, input.session_id).noteDir, dir)
  handle('sessionend', { ...input, reason: 'prompt_input_exit' }, { env, procRoot, from: 100 })
  assert.equal(store.readNote(dir, input.session_id).closed.reason, 'prompt_input_exit')
})
