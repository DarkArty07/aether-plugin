'use strict'

// Hidden acceptance suite for the trial. Every case follows from docs/spec.md, and none repeats a
// test the plan gives. Run it against a finished project: TASKS_ROOT=<project> node --test docs/evaluations/trial-1/fixture/acceptance-suite.js

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = process.env.TASKS_ROOT
if (!ROOT) throw new Error('set TASKS_ROOT to the project under test')
const mod = (name) => require(path.join(ROOT, 'src', `${name}.js`))

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-acceptance-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const task = (id, priority, due, tags = [], done = false) => ({ id, title: `T${id}`, tags, priority, due, done })
const ids = (tasks) => tasks.map((t) => t.id)
const INVALID_TASK = /^Error: invalid task:/
const INVALID_ARGS = /^Error: invalid arguments:/

// parseTask

test('tags may hold digits, dashes and underscores', () => {
  assert.deepEqual(mod('task').parseTask('Ship @V2-beta_rc').tags, ['v2-beta_rc'])
})

test('due dates must exist in the calendar, leap days included', () => {
  const { parseTask } = mod('task')
  assert.equal(parseTask('X due:2028-02-29').due, '2028-02-29')
  assert.throws(() => parseTask('X due:2026-02-29'), INVALID_TASK)
  assert.throws(() => parseTask('X due:2026-04-31'), INVALID_TASK)
  assert.throws(() => parseTask('X due:2026-1-5'), INVALID_TASK)
})

test('explicit priorities 2 and 3 are read', () => {
  const { parseTask } = mod('task')
  assert.equal(parseTask('X !2').priority, 2)
  assert.equal(parseTask('X !3').priority, 3)
})

test('bare markers are invalid', () => {
  const { parseTask } = mod('task')
  for (const line of ['X due:', 'X @', 'X !']) assert.throws(() => parseTask(line), INVALID_TASK, line)
})

test('title words keep their order around the markers', () => {
  assert.equal(mod('task').parseTask('a @x b !3 c due:2026-01-05 d').title, 'a b c d')
})

test('any whitespace separates words', () => {
  assert.deepEqual(mod('task').parseTask('Buy\tmilk\n@home'), { title: 'Buy milk', tags: ['home'], priority: 2, due: null })
})

// store

test('load refuses a file that is not JSON', (t) => {
  const file = path.join(tempDir(t), 'tasks.json')
  fs.writeFileSync(file, 'not json')
  assert.throws(() => mod('store').load(file), /^Error: invalid store:/)
})

test('save replaces the file and leaves only it and its neighbours behind', (t) => {
  const { save, load } = mod('store')
  const dir = tempDir(t)
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'x')
  const file = path.join(dir, 'tasks.json')
  save(file, [task(1, 2, null)])
  save(file, [task(2, 1, null)])
  assert.deepEqual(load(file), [task(2, 1, null)])
  assert.deepEqual(fs.readdirSync(dir).sort(), ['keep.txt', 'tasks.json'])
})

test('nextId follows the highest id, wherever it is', () => {
  assert.equal(mod('store').nextId([{ id: 3 }, { id: 10 }, { id: 7 }]), 11)
})

// queries

test('dueBefore is strictly before', () => {
  const list = [task(1, 2, '2026-10-12'), task(2, 2, '2026-10-11')]
  assert.deepEqual(ids(mod('query').filterTasks(list, { dueBefore: '2026-10-12' })), [2])
})

test('the tag filter ignores case on both sides', () => {
  const list = [task(1, 2, null, ['work']), task(2, 2, null, ['home'])]
  assert.deepEqual(ids(mod('query').filterTasks(list, { tag: 'WoRk' })), [1])
})

test('filters combine', () => {
  const list = [task(1, 2, null, ['work']), task(2, 2, null, ['work'], true), task(3, 2, null, ['home'])]
  assert.deepEqual(ids(mod('query').filterTasks(list, { tag: 'work', done: false })), [1])
})

test('priority order breaks ties by due date, then by id', () => {
  const list = [task(5, 1, '2026-01-01'), task(2, 1, '2026-01-01'), task(9, 1, '2025-12-31')]
  assert.deepEqual(ids(mod('query').sortTasks(list, 'priority')), [9, 2, 5])
})

test('due order breaks ties by priority, then by id', () => {
  const list = [task(4, 3, '2026-01-01'), task(6, 1, '2026-01-01'), task(1, 1, '2026-01-01')]
  assert.deepEqual(ids(mod('query').sortTasks(list, 'due')), [1, 6, 4])
})

test('queries return new arrays', () => {
  const { filterTasks, sortTasks } = mod('query')
  const list = [task(1, 2, null)]
  assert.notEqual(filterTasks(list, {}), list)
  assert.notEqual(sortTasks(list, 'id'), list)
})

// arguments

test('flags may come before the words', () => {
  const parsed = mod('args').parseArgs(['add', '--file', 'f.json', 'Buy', 'milk'])
  assert.deepEqual(parsed.args, ['Buy', 'milk'])
  assert.equal(parsed.file, 'f.json')
})

test('a due-before date must exist, and every flag needs its value', () => {
  const { parseArgs } = mod('args')
  for (const argv of [['list', '--due-before', '2026-02-30'], ['list', '--due-before'], ['list', '--sort'], ['list', '--file']]) {
    assert.throws(() => parseArgs(argv), INVALID_ARGS, argv.join(' '))
  }
})

test('every sort order and the help command are accepted', () => {
  const { parseArgs } = mod('args')
  assert.equal(parseArgs(['list', '--sort', 'id']).sort, 'id')
  assert.equal(parseArgs(['list', '--sort', 'priority']).sort, 'priority')
  assert.equal(parseArgs(['help']).command, 'help')
})

test('the filter holds only the fields given', () => {
  assert.deepEqual(mod('args').parseArgs(['list', '--done']).filter, { done: true })
})

// formatting

test('formatTask shows a low priority and keeps the tags in order', () => {
  assert.equal(mod('format').formatTask({ id: 9, title: 'Fix', tags: ['b', 'a'], priority: 3, due: '2026-01-02', done: false }), '#9 [ ] Fix !3 due:2026-01-02 @b @a')
})

test('a one-task table has no newline', () => {
  assert.equal(mod('format').formatTable([task(1, 2, null)]), '#1 [ ] T1')
})

// commands

function runIn(t) {
  const file = path.join(tempDir(t), 'tasks.json')
  const { parseArgs } = mod('args')
  const { runCommand } = mod('commands')
  return { file, run: (...argv) => runCommand(parseArgs([...argv, '--file', file])) }
}

test('ids are not reused while a higher id exists', (t) => {
  const { run } = runIn(t)
  run('add', 'A')
  run('add', 'B')
  run('remove', '1')
  assert.deepEqual(run('add', 'C'), { output: 'Added #3', exitCode: 0 })
})

test('a failed add leaves the store alone', (t) => {
  const { run, file } = runIn(t)
  assert.equal(run('add', 'Pay', '!9').exitCode, 2)
  assert.equal(fs.existsSync(file), false)
})

test('list filters by tag and sorts by due date', (t) => {
  const { run } = runIn(t)
  run('add', 'A', '@work', 'due:2026-03-01')
  run('add', 'B', '@home', 'due:2026-01-01')
  run('add', 'C', '@work', 'due:2026-02-01', '!3')
  run('add', 'D', '@work')
  assert.deepEqual(run('list', '--tag', 'work', '--sort', 'due'), {
    output: '#3 [ ] C !3 due:2026-02-01 @work\n#1 [ ] A due:2026-03-01 @work\n#4 [ ] D @work',
    exitCode: 0,
  })
})

test('ids that are not positive integers are invalid arguments', (t) => {
  const { run } = runIn(t)
  run('add', 'A')
  for (const id of ['0', '-1', '1.5', 'one']) {
    const r = run('done', id)
    assert.equal(r.exitCode, 2, id)
    assert.match(r.output, /^invalid arguments:/, id)
  }
})

test('remove keeps the other tasks', (t) => {
  const { run } = runIn(t)
  run('add', 'A')
  run('add', 'B')
  run('add', 'C')
  run('remove', '2')
  assert.equal(run('list', '--sort', 'id').output, '#1 [ ] A\n#3 [ ] C')
})

test('the store holds every field of a task', (t) => {
  const { run, file } = runIn(t)
  run('add', 'Buy', 'milk', '@home', '!1', 'due:2026-10-10')
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), [
    { id: 1, title: 'Buy milk', tags: ['home'], priority: 1, due: '2026-10-10', done: false },
  ])
})

test('done on a done task still succeeds', (t) => {
  const { run } = runIn(t)
  run('add', 'A')
  run('done', '1')
  assert.deepEqual(run('done', '1'), { output: 'Done #1', exitCode: 0 })
})

test('list on a missing store says there are no tasks', (t) => {
  const { run } = runIn(t)
  assert.deepEqual(run('list'), { output: 'No tasks.', exitCode: 0 })
})

// CLI

function cli(t, ...argv) {
  const file = path.join(tempDir(t), 'tasks.json')
  return spawnSync(process.execPath, [path.join(ROOT, 'bin', 'tasks.js'), ...argv, '--file', file], { encoding: 'utf8' })
}

test('the CLI with no words prints the help and exits 0', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'tasks.js')], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /add/)
})

test('an invalid task line exits 2 on stderr', (t) => {
  const r = cli(t, 'add', 'Pay', '!9')
  assert.equal(r.status, 2)
  assert.equal(r.stdout, '')
  assert.match(r.stderr, /^invalid task:/)
})

test('an unknown command exits 2 on stderr', (t) => {
  const r = cli(t, 'launch')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /^invalid arguments:/)
})

test('the CLI marks a task done and lists it', (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'tasks.json')
  const run = (...argv) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'tasks.js'), ...argv, '--file', file], { encoding: 'utf8' })
  run('add', 'Read', '@books')
  assert.equal(run('done', '1').stdout, 'Done #1\n')
  assert.equal(run('list', '--done').stdout, '#1 [x] Read @books\n')
})
