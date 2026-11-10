'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync, fork } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const EN = "Claude's memory keeps only what lasts: preferences and lessons. The state of a version, a branch or a task goes to the continuity note, which Aether writes by itself; do not record it in the memory."
const ES = 'La memoria de Claude guarda solo lo que dura: preferencias y lecciones. El estado de una versión, una rama o una tarea va a la nota de continuidad, que Aether escribe sola; no lo registres en la memoria.'

function world(t) {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-config-')
  const data = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  const memory = store.memoryDir({ cwd: repo.dir, env, home: configDir })
  return { repo, configDir, data, env, memory }
}
const call = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: file } })

test('a write in the memory, outside continuity/, reminds the Lead that the state goes to the continuity note (R9, H1 scenario 8)', (t) => {
  const w = world(t)
  const ctx = { env: w.env, home: w.configDir }
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'version-state.md'), tool), ctx), { additionalContext: EN }, tool)
  }
  assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'MEMORY.md')), ctx), { additionalContext: EN })
  assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'x.md')), { ...ctx, env: { ...w.env, LANG: 'es_ES.UTF-8' } }), { additionalContext: ES })
})

test('no reminder for the continuity folder, for the repository, for other tools or for an unreadable input (R9)', (t) => {
  const w = world(t)
  const ctx = { env: w.env, home: w.configDir }
  assert.equal(posttool.posttool(call(w, path.join(w.memory, 'continuity', 's1.json')), ctx), null)
  assert.equal(posttool.posttool(call(w, path.join(w.repo.dir, 'a.md')), ctx), null)
  assert.equal(posttool.posttool({ ...call(w, path.join(w.memory, 'x.md')), tool_name: 'Bash', tool_input: { command: 'ls' } }, ctx), null)
  assert.equal(posttool.posttool(null, ctx), null)
  assert.equal(posttool.posttool({}, ctx), null)
})

test('a handler that throws does not stop the others, and the texts join with a blank line', () => {
  const saved = [...posttool.HANDLERS]
  posttool.HANDLERS.splice(0, posttool.HANDLERS.length, () => { throw new Error('boom') }, () => 'one', () => null, () => 'two')
  try {
    assert.deepEqual(posttool.posttool({}, {}), { additionalContext: 'one\n\ntwo' })
  } finally {
    posttool.HANDLERS.splice(0, posttool.HANDLERS.length, ...saved)
  }
})

test('through the bin: the reminder is the additionalContext of PostToolUse, and no hook of the feature touches MEMORY.md (C3)', (t) => {
  const w = world(t)
  markSession(w.data, 's1', 1000, { repo: w.repo.dir, claude: null })
  fs.mkdirSync(w.memory, { recursive: true })
  const index = path.join(w.memory, 'MEMORY.md')
  fs.writeFileSync(index, '- [One](one.md) — a lesson\n')
  const before = fs.statSync(index)
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const run = (verb, input) => spawnSync(process.execPath, [bin, verb], { input: JSON.stringify({ session_id: 's1', cwd: w.repo.dir, ...input }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.configDir, LANG: 'en_US.UTF-8' } })
  const out = run('posttool', { hook_event_name: 'PostToolUse', ...call(w, path.join(w.memory, 'state.md')) })
  assert.equal(out.status, 0)
  assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: EN } })
  for (const [verb, input] of [['stop', { last_assistant_message: 'hi' }], ['precompact', {}], ['postcompact', { compact_summary: 's' }], ['stopfailure', { error: 'x' }], ['sessionend', { reason: 'other' }]]) {
    assert.equal(run(verb, input).status, 0, verb)
  }
  assert.equal(fs.readFileSync(index, 'utf8'), '- [One](one.md) — a lesson\n')
  assert.equal(fs.statSync(index).mtimeMs, before.mtimeMs)
  assert.deepEqual(fs.readdirSync(w.memory).sort(), ['MEMORY.md', 'continuity'])
})

// A Lead session in a throwaway repository with a source file and a spec, and the PostToolUse call for it.
function leadWorld(t, session) {
  const w = world(t)
  markSession(w.data, session, 1000, { repo: w.repo.dir, claude: null })
  fs.mkdirSync(path.join(w.repo.dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(w.repo.dir, 'specs', '031-demo'), { recursive: true })
  fs.writeFileSync(path.join(w.repo.dir, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(w.repo.dir, 'specs', '031-demo', 'plan.md'), 'plan\n')
  const ctx = { env: w.env, home: w.configDir, dataDir: w.data }
  const call = (tool_name, tool_input, extra = {}) =>
    posttool.posttool({ session_id: session, prompt_id: 'p1', cwd: w.repo.dir, tool_name, tool_input, ...extra }, ctx)
  const file = (...parts) => path.join(w.repo.dir, ...parts)
  return { w, ctx, call, file }
}

test('.specify and AGENTS.md reads and writes leave both direct counters unchanged (R7)', (t) => {
  const { w, call, file } = leadWorld(t, 's-exempt')
  fs.mkdirSync(file('.specify'), { recursive: true })
  fs.writeFileSync(file('.specify', 'feature.json'), '{}\n')
  fs.writeFileSync(file('AGENTS.md'), 'instructions\n')
  const stateDir = path.join(w.data, 'continuity')
  for (let pass = 0; pass < 10; pass++) {
    for (const target of [file('.specify', 'feature.json'), file('AGENTS.md')]) {
      for (const tool of ['Read', 'Write', 'Edit']) {
        assert.equal(call(tool, { file_path: target }), null, `${tool} ${target}`)
      }
    }
    assert.equal(call('Grep', { pattern: 'feature', path: file('.specify') }), null)
    assert.equal(call('Bash', { command: 'cat .specify/feature.json AGENTS.md' }), null)
    assert.equal(call('Bash', { command: 'echo x > .specify/feature.json; echo x > AGENTS.md' }), null)
  }
  assert.equal(fs.existsSync(stateDir), false)
  assert.equal(call('Edit', { file_path: file('src', 'a.js') }), null)
  assert.equal(call('Edit', { file_path: file('src', 'a.js') }), null)
  assert.ok(call('Edit', { file_path: file('src', 'a.js') }))
})

test('a turn log read failure returns null without breaking posttool', (t) => {
  const { w, call, file } = leadWorld(t, 's-read-error')
  const edit = () => call('Edit', { file_path: file('src', 'a.js') })
  assert.equal(edit(), null)
  assert.equal(edit(), null)
  const dir = path.join(w.data, 'continuity')
  const log = path.join(dir, fs.readdirSync(dir).find((name) => name.endsWith('.log')))
  const read = fs.readFileSync
  const mock = t.mock.method(fs, 'readFileSync', function (target, ...args) {
    if (target === log) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return read.call(this, target, ...args)
  })
  assert.equal(edit(), null)
  mock.mock.restore()
  assert.equal(fs.readFileSync(log, 'utf8'), 'edit\nedit\nedit\n')
  assert.ok(edit())
  assert.equal(edit(), null)
})

test('a turn log write failure suppresses the notice and a later call can retry', (t) => {
  const { w, call, file } = leadWorld(t, 's-write-error')
  const edit = () => call('Edit', { file_path: file('src', 'a.js') })
  assert.equal(edit(), null)
  assert.equal(edit(), null)
  const dir = path.join(w.data, 'continuity')
  const log = path.join(dir, fs.readdirSync(dir).find((name) => name.endsWith('.log')))
  const mock = t.mock.method(fs, 'appendFileSync', () => { throw new Error('denied') })
  assert.equal(edit(), null)
  mock.mock.restore()
  assert.equal(fs.readFileSync(log, 'utf8'), 'edit\nedit\n')
  assert.deepEqual(fs.readdirSync(dir), [path.basename(log)])
  assert.ok(edit())
  assert.equal(edit(), null)
})

test('a notice marker write failure returns null and a later call can retry', (t) => {
  const { call, file } = leadWorld(t, 's-marker-error')
  const edit = () => call('Edit', { file_path: file('src', 'a.js') })
  assert.equal(edit(), null)
  assert.equal(edit(), null)
  const open = fs.openSync
  const mock = t.mock.method(fs, 'openSync', function (target, ...args) {
    if (typeof target === 'string' && target.endsWith('.notice')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return open.call(this, target, ...args)
  })
  assert.equal(edit(), null)
  mock.mock.restore()
  assert.ok(edit())
  assert.equal(edit(), null)
})

test('posttool warns once on the 3rd own edit to code or tests in a turn; exempt paths, subagents and other sessions add nothing (R7)', (t) => {
  const { w, ctx, call, file } = leadWorld(t, 's-edit')

  // A session that is not the Lead's neither counts nor writes anything.
  const plain = posttool.posttool(
    { session_id: 'a-plain-session', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: file('src', 'a.js') } },
    ctx
  )
  assert.equal(plain, null)
  assert.equal(fs.existsSync(path.join(w.data, 'continuity')), false)

  for (const exempt of [
    file('specs', '031-demo', 'intent.md'),
    file('.aether', 'autonomy', 'x', 'diary.md'),
    file('docs', 'guide.md'),
    file('README.md'),
    path.join(w.configDir, 'plans', 'p.md'),
  ]) {
    assert.equal(call('Write', { file_path: exempt }), null, exempt)
  }
  assert.equal(call('Bash', { command: 'echo x > /dev/null' }), null)
  assert.equal(call('Edit', { file_path: file('src', 'a.js') }, { agent_id: 'sub-1' }), null)

  assert.equal(call('Edit', { file_path: file('src', 'a.js') }), null) // 1
  assert.equal(call('Write', { file_path: file('tests', 'a.test.js') }), null) // 2
  const third = call('Bash', { command: 'echo "x" > src/b.js' }) // 3
  assert.ok(third && typeof third.additionalContext === 'string')
  assert.match(third.additionalContext, /3/)
  assert.match(third.additionalContext, /delegate|Agent/i)
  assert.match(third.additionalContext, /unless the owner asked you to do it yourself/) // the rule and its exception
  assert.equal(call('Edit', { file_path: file('src', 'c.js') }), null) // the notice comes once per turn
})

test('the count restarts when prompt_id changes: the 3rd edit of the next turn warns again (R7)', (t) => {
  const { call, file } = leadWorld(t, 's-turns')
  const edit = (n, extra = {}) => call('Edit', { file_path: file('src', `e${n}.js`) }, extra)
  assert.equal(edit(1), null)
  assert.equal(edit(2), null)
  assert.ok(edit(3))
  // The next turn is a new count: its first two edits are silent and its third warns again.
  assert.equal(edit(4, { prompt_id: 'p2' }), null) // 1
  assert.equal(edit(5, { prompt_id: 'p2' }), null) // 2
  const again = edit(6, { prompt_id: 'p2' }) // 3
  assert.ok(again && typeof again.additionalContext === 'string')
  assert.match(again.additionalContext, /3/)
  assert.equal(edit(7, { prompt_id: 'p2' }), null) // once per turn
})

test('with no prompt_id, a continuity note of the session newer than the stored mark restarts the count, whoever wrote it, and an equal one does not (R7)', (t) => {
  const { w, call, file } = leadWorld(t, 's-note')
  const dir = store.continuityDir({ cwd: w.repo.dir, env: w.env, home: w.configDir })
  const writeNote = (updatedAt, extra = {}) => store.writeNote(dir, { session: 's-note', updatedAt, ...extra })
  const edit = (n) => call('Edit', { file_path: file('src', `n${n}.js`) }, { prompt_id: undefined })

  writeNote(1000)
  assert.equal(edit(1), null)
  assert.equal(edit(2), null)
  assert.ok(edit(3))
  // The same note again: nothing restarts, so three more edits stay silent.
  writeNote(1000)
  assert.equal(edit(4), null)
  assert.equal(edit(5), null)
  assert.equal(edit(6), null)
  // A newer note, here the one a failed stop writes: the count restarts and the third edit warns again.
  writeNote(2000, { cut: { at: 2000, reason: 'x' } })
  assert.equal(edit(7), null)
  assert.equal(edit(8), null)
  const again = edit(9)
  assert.ok(again && typeof again.additionalContext === 'string')
})

test('posttool counts reads of code and searches, not reads of notes, specs or docs, nor checks and test runs, and warns once on the 10th (R7)', (t) => {
  const { w, ctx, call, file } = leadWorld(t, 's-read')
  // None of these counts; each runs three times, so one that did count would warn before the tenth counted read.
  const notCounted = [
    ['Read', { file_path: file('specs', '031-demo', 'plan.md') }],
    ['Read', { file_path: file('CLAUDE.md') }],
    ['Read', { file_path: path.join(w.configDir, 'plans', 'p.md') }],
    ['Grep', { pattern: 'foo', path: file('docs') }],
    ['Bash', { command: "sed -n '1,5p' specs/031-demo/plan.md" }],
    ['Bash', { command: 'git status' }],
    ['Bash', { command: 'stat src/a.js' }],
    ['Bash', { command: 'diff src/a.js src/a.js' }],
    ['Bash', { command: 'cmp src/a.js src/a.js' }],
    ['Bash', { command: 'git log' }],
    ['Bash', { command: 'ls -la' }],
    ['Bash', { command: 'wc -l src/a.js' }],
    ['Bash', { command: 'aether-autonomy status | grep stop' }],
    ['Bash', { command: 'npm test' }],
    ['Bash', { command: 'node --test tests/a.test.js' }],
  ]
  for (let pass = 0; pass < 3; pass++) {
    for (const [tool, input] of notCounted) assert.equal(call(tool, input), null, `${tool} ${JSON.stringify(input)}`)
  }
  const counted = [
    ['Read', { file_path: file('src', 'a.js') }],
    ['Bash', { command: 'cat src/a.js' }],
    ['Bash', { command: 'rg foo' }],
    ['Grep', { pattern: 'foo' }],
    ['Glob', { pattern: '**/*.js' }],
    ['Grep', { pattern: 'foo', path: file('src') }],
    ['Bash', { command: 'grep -rn foo src/' }],
    ['Bash', { command: 'git grep foo' }],
    ['Read', { file_path: file('src', 'a.js') }],
  ]
  for (const [tool, input] of counted) assert.equal(call(tool, input), null, `${tool} ${JSON.stringify(input)}`)
  const tenth = posttool.posttool(
    { session_id: 's-read', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Read', tool_input: { file_path: file('src', 'a.js') } },
    { ...ctx, env: { ...w.env, LANG: 'es_ES.UTF-8' } }
  )
  assert.ok(tenth && typeof tenth.additionalContext === 'string')
  assert.match(tenth.additionalContext, /10/)
  assert.match(tenth.additionalContext, /tarea delegada/)
  assert.match(tenth.additionalContext, /salvo que el dueño/)
  assert.equal(call('Read', { file_path: file('src', 'a.js') }), null) // once per turn
})

test('from a linked worktree the diary of the run in the main checkout and the session temporary folder add nothing, while edits in the worktree do (R7)', (t) => {
  const { w, call } = leadWorld(t, 's-linked')
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  w.repo.git('worktree', 'add', '-q', '-b', 'linked/x', linked)
  const scratch = path.join(tempDir(t, 'aether-session-tmp-'), 'scratchpad')
  const here = (tool, input) => call(tool, input, { cwd: linked, scratchpad_dir: scratch })
  for (let i = 0; i < 5; i++) {
    // The diary is at <main checkout>/.aether/autonomy/<id>/diary.md, which a relative path from the worktree does not reach.
    assert.equal(here('Write', { file_path: path.join(w.repo.dir, '.aether', 'autonomy', 'x', 'diary.md') }), null)
    assert.equal(here('Read', { file_path: path.join(w.repo.dir, '.aether', 'autonomy', 'x', 'diary.md') }), null)
    assert.equal(here('Read', { file_path: path.join(w.repo.dir, '.specify', 'feature.json') }), null)
    assert.equal(here('Read', { file_path: path.join(w.repo.dir, 'AGENTS.md') }), null)
    assert.equal(here('Read', { file_path: path.join(path.dirname(scratch), 'notes', `n${i}.js`) }), null)
    // The folder above scratchpad_dir is the session's temporary folder, whatever the extension of the file.
    assert.equal(here('Write', { file_path: path.join(path.dirname(scratch), 'notes', `n${i}.js`) }), null)
  }
  assert.equal(here('Edit', { file_path: path.join(linked, 'src', 'a.js') }), null)
  assert.equal(here('Edit', { file_path: path.join(linked, 'src', 'b.js') }), null)
  const third = here('Edit', { file_path: path.join(linked, 'src', 'c.js') })
  assert.ok(third && typeof third.additionalContext === 'string')
})

test('each Bash write form counts one own edit, one call counts at most one, and 2>&1 and /dev/null count none (R7)', (t) => {
  const forms = [
    'echo x > src/b.js',
    'echo x >> src/b.js',
    'printf x | tee src/b.js',
    "sed -i 's/a/b/' src/a.js",
    'cp src/a.js src/b.js',
    'mv src/a.js src/b.js',
  ]
  for (const [i, command] of forms.entries()) {
    const { call, file } = leadWorld(t, `s-form-${i}`)
    assert.equal(call('Edit', { file_path: file('src', 'x1.js') }), null, command)
    assert.equal(call('Edit', { file_path: file('src', 'x2.js') }), null, command)
    const out = call('Bash', { command })
    assert.ok(out && typeof out.additionalContext === 'string', command)
  }

  // Two writes in one call are one edit: with two more edits the third warns, not the second.
  const once = leadWorld(t, 's-once')
  assert.equal(once.call('Bash', { command: 'echo a > src/x.js; echo b > src/y.js' }), null)
  assert.equal(once.call('Edit', { file_path: once.file('src', 'z1.js') }), null)
  assert.ok(once.call('Edit', { file_path: once.file('src', 'z2.js') }))

  // Redirecting a stream to another or to /dev/null writes no file: only the third real edit warns.
  const quiet = leadWorld(t, 's-quiet')
  assert.equal(quiet.call('Edit', { file_path: quiet.file('src', 'q1.js') }), null)
  assert.equal(quiet.call('Edit', { file_path: quiet.file('src', 'q2.js') }), null)
  assert.equal(quiet.call('Bash', { command: 'cat src/a.js 2>&1' }), null)
  assert.equal(quiet.call('Bash', { command: 'npm test > /dev/null 2>&1' }), null)
  assert.ok(quiet.call('Edit', { file_path: quiet.file('src', 'q3.js') }))
})

test('Bash reads are decided per command, follow cd, and a pipeline that only filters counts nothing (R7)', (t) => {
  const { w, call } = leadWorld(t, 's-cd')
  // None of these counts; each runs three times, so one that did count would warn before the tenth counted read.
  const notCounted = [
    `cd ${w.repo.dir} && sed -n '1,5p' specs/031-demo/plan.md`,
    'aether-autonomy status | grep stop',
  ]
  for (let pass = 0; pass < 3; pass++) {
    for (const command of notCounted) assert.equal(call('Bash', { command }), null, command)
  }
  // Each of these counts exactly one: a reader after cd, a relative path after cd, a search that redirects only stderr,
  // and the file reader of a pipeline.
  const counted = [
    `cd ${w.repo.dir} && sed -n '1,5p' src/a.js`,
    'cd src && cat a.js',
    'rg foo src 2>/dev/null',
    'cat src/a.js | head -5',
  ]
  for (let i = 0; i < 9; i++) assert.equal(call('Bash', { command: counted[i % counted.length] }), null, `${i}: ${counted[i % counted.length]}`)
  const tenth = call('Bash', { command: counted[1] })
  assert.ok(tenth && typeof tenth.additionalContext === 'string')
  assert.match(tenth.additionalContext, /10/)
})

test('uncounted and subagent calls create no counter files', (t) => {
  const { w, call, file } = leadWorld(t, 's-empty')
  assert.equal(call('Edit', { file_path: file('src', 'a.js') }, { agent_id: 'sub' }), null)
  assert.equal(call('Bash', { command: 'git status' }), null)
  assert.equal(call('Read', { file_path: file('docs', 'x.md') }), null)
  assert.equal(fs.existsSync(path.join(w.data, 'continuity')), false)
})

test('a new turn removes the earlier turn files', (t) => {
  const { w, call, file } = leadWorld(t, 's-clean')
  for (let i = 0; i < 3; i++) call('Edit', { file_path: file('src', 'a.js') })
  const dir = path.join(w.data, 'continuity')
  const before = fs.readdirSync(dir)
  assert.equal(before.length, 2)
  call('Read', { file_path: file('src', 'a.js') }, { prompt_id: 'p2' })
  const after = fs.readdirSync(dir)
  assert.equal(after.length, 1)
  assert.ok(before.every((name) => !after.includes(name)))
})

test('turn keys keep distinct prompt IDs safe as file names', (t) => {
  const { w, call, file } = leadWorld(t, 's-safe-key')
  const edit = (prompt_id) => call('Edit', { file_path: file('src', 'a.js') }, { prompt_id })
  for (const prompt of ['../prompt/one\n', '.._prompt_one_']) {
    assert.equal(edit(prompt), null)
    assert.equal(edit(prompt), null)
    assert.ok(edit(prompt))
    const names = fs.readdirSync(path.join(w.data, 'continuity'))
    assert.equal(names.filter((name) => name.endsWith('.log')).length, 1)
    assert.equal(names.filter((name) => name.endsWith('.notice')).length, 1)
    assert.ok(names.every((name) => /^[a-zA-Z0-9_.-]+$/.test(name)))
  }
})

test('housekeeping tolerates turn files that another hook already removed', (t) => {
  const { w, call, file } = leadWorld(t, 's-clean-race')
  for (let i = 0; i < 3; i++) call('Edit', { file_path: file('src', 'a.js') })
  const dir = path.join(w.data, 'continuity')
  const previous = fs.readdirSync(dir)
  const unlink = fs.unlinkSync
  const mock = t.mock.method(fs, 'unlinkSync', function (target) {
    if (previous.some((name) => target === path.join(dir, name))) unlink.call(this, target)
    return unlink.call(this, target)
  })
  assert.equal(call('Edit', { file_path: file('src', 'a.js') }, { prompt_id: 'p2' }), null)
  mock.mock.restore()
  assert.ok(previous.every((name) => !fs.existsSync(path.join(dir, name))))
  const names = fs.readdirSync(dir)
  assert.equal(names.length, 1)
  assert.equal(fs.readFileSync(path.join(dir, names[0]), 'utf8'), 'edit\n')
})

test('a new turn prunes only old counter files and preserves another active session', (t) => {
  const { w, call, file, ctx } = leadWorld(t, 's-prune')
  const other = (session) => {
    markSession(w.data, session, 1000, { repo: w.repo.dir, claude: null })
    for (let i = 0; i < 3; i++) posttool.posttool({ session_id: session, prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: file('src', 'a.js') } }, ctx)
  }
  other('s-old')
  const dir = path.join(w.data, 'continuity')
  const old = fs.readdirSync(dir)
  const when = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  for (const name of old) fs.utimesSync(path.join(dir, name), when, when)
  other('s-active')
  assert.ok(old.every((name) => !fs.existsSync(path.join(dir, name))))
  const active = fs.readdirSync(dir)
  const unrelated = path.join(dir, 'unrelated.log')
  fs.writeFileSync(unrelated, 'keep\n')
  fs.utimesSync(unrelated, when, when)
  assert.equal(call('Read', { file_path: file('src', 'a.js') }), null)
  assert.ok(active.every((name) => fs.existsSync(path.join(dir, name))))
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep\n')
})

for (const legacy of ['malformed', 'unreadable']) {
  test(`${legacy === 'unreadable' ? 'an' : 'a'} ${legacy} legacy counter is ignored`, (t) => {
    const { w, call, file } = leadWorld(t, 's-legacy')
    const dir = path.join(w.data, 'continuity')
    fs.mkdirSync(dir, { recursive: true })
    const oldState = path.join(dir, 's-legacy.json')
    if (legacy === 'malformed') fs.writeFileSync(oldState, '{broken')
    else fs.mkdirSync(oldState) // Reading a directory as JSON fails even when the tests run as root.
    assert.equal(call('Edit', { file_path: file('src', 'a.js') }), null)
    assert.equal(call('Edit', { file_path: file('src', 'a.js') }), null)
    assert.ok(call('Edit', { file_path: file('src', 'a.js') }))
  })
}

test('the direct notice appears through the real posttool bin', (t) => {
  const { w, call, file } = leadWorld(t, 's-bin')
  const input = { session_id: 's-bin', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: file('src', 'a.js') } }
  assert.equal(call('Edit', input.tool_input), null)
  assert.equal(call('Edit', input.tool_input), null)
  const result = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-continuity'), 'posttool'], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.configDir, LANG: 'en_US.UTF-8' },
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout).hookSpecificOutput
  assert.equal(output.hookEventName, 'PostToolUse')
  assert.match(output.additionalContext, /direct-path limit/)
})

for (const [tool, count] of [['Read', 12], ['Edit', 6]]) {
  test(`parallel ${tool} calls preserve every count and reserve one notice`, { timeout: 30000 }, async (t) => {
    const { w, file } = leadWorld(t, `s-parallel-${tool}`)
    const modulePath = path.join(PLUGIN, 'lib', 'continuity-posttool.js')
    const input = { session_id: `s-parallel-${tool}`, prompt_id: 'p1', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: file('src', 'a.js') } }
    const ctx = { env: w.env, home: w.configDir, dataDir: w.data }
    const script = `const posttool = require(${JSON.stringify(modulePath)}); process.on('message', () => { process.send(posttool.posttool(${JSON.stringify(input)}, ${JSON.stringify(ctx)})); process.disconnect() }); process.send('ready')`
    const children = Array.from({ length: count }, () => fork('-e', [script], { silent: true, execArgv: [] }))
    t.after(() => children.forEach((child) => { if (child.exitCode === null) child.kill() }))
    const ready = children.map((child) => new Promise((resolve, reject) => {
      child.once('message', (message) => {
        if (message === 'ready') resolve()
        else reject(new Error('child did not signal readiness'))
      })
      child.once('error', reject)
      child.once('exit', () => reject(new Error('child exited before readiness')))
    }))
    const finished = children.map((child) => new Promise((resolve, reject) => {
      let output
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.on('message', (message) => { if (message !== 'ready') output = message })
      child.once('error', reject)
      child.once('close', (code) => {
        if (code !== 0 || output === undefined || stderr) reject(new Error(`child exited ${code}: ${stderr}`))
        else resolve(output)
      })
    }))
    const [, outputs] = await Promise.all([
      Promise.all(ready).then(() => children.forEach((child) => child.send('go'))),
      Promise.all(finished),
    ])
    assert.equal(outputs.filter(Boolean).length, 1)
    const dir = path.join(w.data, 'continuity')
    const logs = fs.readdirSync(dir).filter((name) => name.endsWith('.log'))
    assert.equal(logs.length, 1)
    assert.deepEqual(fs.readFileSync(path.join(dir, logs[0]), 'utf8').split('\n'), [...Array(count).fill(tool === 'Edit' ? 'edit' : 'read'), ''])
    assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.notice')).length, 1)
  })
}
