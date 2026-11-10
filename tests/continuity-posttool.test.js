'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
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
