# tasks Implementation Plan

**Goal:** Build `tasks`, a task-list library and CLI, as `docs/spec.md` describes.

**Architecture:**
- Five independent modules: `task`, `store`, `query`, `args` and `format`.
- `commands` builds on them, and `bin/tasks.js` wires `args` and `commands` into a CLI.

**Spec:** `docs/spec.md`

## Global Constraints

- Node.js 22, CommonJS (`require`, `module.exports`), no dependencies.
- Tests live in `test/`, use `node:test` and `node:assert/strict`, and run with `npm test` (`node --test`).
- Each module exports exactly the names its Interfaces list.
- Error messages start with the prefixes the spec gives (`invalid task:`, `invalid store:`, `invalid sort:`, `invalid arguments:`).

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 120

---

### Task 1: Parse a task line

**Aether:**
- Tier: haiku — exact tests and one function pin it down
- Area: core
- Owns: `src/task.js`, `test/task.test.js`
- Depends on: none

**Interfaces:**
- `src/task.js` exports `{ parseTask }`.
- `parseTask(line: string): { title: string, tags: string[], priority: 1 | 2 | 3, due: string | null }`. Throws `Error('invalid task: ...')`.

**Failing tests:** write `test/task.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseTask } = require('../src/task.js')

test('parseTask reads the title, tags, priority and due date', () => {
  assert.deepEqual(parseTask('Buy milk @Home !1 due:2026-10-10 @errands'), {
    title: 'Buy milk',
    tags: ['home', 'errands'],
    priority: 1,
    due: '2026-10-10',
  })
})

test('parseTask defaults to priority 2 and no due date, and tidies the title', () => {
  assert.deepEqual(parseTask('  Call   the bank  '), { title: 'Call the bank', tags: [], priority: 2, due: null })
})

test('parseTask keeps each tag once, in order of first appearance', () => {
  assert.deepEqual(parseTask('Plan @work @Home @work trip').tags, ['work', 'home'])
})

test('parseTask refuses invalid lines', () => {
  const lines = ['', '   @home !1', 'Pay !4', 'Pay !1 !2', 'Pay due:2026-02-30', 'Pay due:tomorrow', 'Pay due:2026-01-01 due:2026-01-02', 'Pay @bad!tag']
  for (const line of lines) assert.throws(() => parseTask(line), /^Error: invalid task:/, line)
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Parsing a task line".

**Acceptance:** `npm test` passes.

### Task 2: Store tasks in a JSON file

**Aether:**
- Tier: haiku — exact tests and three small functions pin it down
- Area: core
- Owns: `src/store.js`, `test/store.test.js`
- Depends on: none

**Interfaces:**
- `src/store.js` exports `{ load, save, nextId }`.
- `load(file: string): Task[]`; `save(file: string, tasks: Task[]): void`; `nextId(tasks: Task[]): number`. Throws `Error('invalid store: ...')`.

**Failing tests:** write `test/store.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { load, save, nextId } = require('../src/store.js')

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const sample = [{ id: 1, title: 'A', tags: [], priority: 2, due: null, done: false }]

test('load returns an empty list for a missing file', (t) => {
  assert.deepEqual(load(path.join(tempDir(t), 'none.json')), [])
})

test('save writes indented JSON with a final newline, creating the directory, and load reads it back', (t) => {
  const file = path.join(tempDir(t), 'nested', 'tasks.json')
  save(file, sample)
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(sample, null, 2) + '\n')
  assert.deepEqual(load(file), sample)
})

test('save leaves no temporary file behind', (t) => {
  const dir = tempDir(t)
  save(path.join(dir, 'tasks.json'), sample)
  assert.deepEqual(fs.readdirSync(dir), ['tasks.json'])
})

test('load refuses a file that is not a JSON array', (t) => {
  const file = path.join(tempDir(t), 'tasks.json')
  fs.writeFileSync(file, '{"id": 1}')
  assert.throws(() => load(file), /^Error: invalid store:/)
})

test('nextId is one more than the highest id, or 1', () => {
  assert.equal(nextId([]), 1)
  assert.equal(nextId([{ id: 4 }, { id: 2 }]), 5)
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Store".

**Acceptance:** `npm test` passes.

### Task 3: Filter and sort tasks

**Aether:**
- Tier: haiku — exact tests and two pure functions pin it down
- Area: core
- Owns: `src/query.js`, `test/query.test.js`
- Depends on: none

**Interfaces:**
- `src/query.js` exports `{ filterTasks, sortTasks }`.
- `filterTasks(tasks: Task[], filter: { tag?: string, done?: boolean, dueBefore?: string }): Task[]`.
- `sortTasks(tasks: Task[], by: 'priority' | 'due' | 'id'): Task[]`. Throws `Error('invalid sort: ...')`.

**Failing tests:** write `test/query.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { filterTasks, sortTasks } = require('../src/query.js')

const task = (id, priority, due, tags = [], done = false) => ({ id, title: `T${id}`, tags, priority, due, done })
const list = [task(1, 2, null, ['home']), task(2, 1, '2026-10-12', ['work']), task(3, 3, '2026-10-10', ['home'], true), task(4, 1, null)]
const ids = (tasks) => tasks.map((t) => t.id)

test('filterTasks keeps the tasks that match every field given', () => {
  assert.deepEqual(ids(filterTasks(list, { tag: 'HOME' })), [1, 3])
  assert.deepEqual(ids(filterTasks(list, { done: false })), [1, 2, 4])
  assert.deepEqual(ids(filterTasks(list, { dueBefore: '2026-10-12' })), [3])
  assert.deepEqual(ids(filterTasks(list, { tag: 'home', done: true })), [3])
  assert.deepEqual(ids(filterTasks(list, {})), [1, 2, 3, 4])
})

test('sortTasks by priority: priority, then due date with undated last, then id', () => {
  assert.deepEqual(ids(sortTasks(list, 'priority')), [2, 4, 1, 3])
})

test('sortTasks by due date: undated last, then priority, then id', () => {
  assert.deepEqual(ids(sortTasks(list, 'due')), [3, 2, 4, 1])
})

test('sortTasks and filterTasks leave their input alone, and an unknown order throws', () => {
  const copy = JSON.parse(JSON.stringify(list))
  sortTasks(list, 'priority')
  filterTasks(list, { done: true })
  assert.deepEqual(list, copy)
  assert.deepEqual(ids(sortTasks([...list].reverse(), 'id')), [1, 2, 3, 4])
  assert.throws(() => sortTasks(list, 'size'), /^Error: invalid sort:/)
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Queries".

**Acceptance:** `npm test` passes.

### Task 4: Parse the command line

**Aether:**
- Tier: haiku — exact tests and one function pin it down
- Area: cli
- Owns: `src/args.js`, `test/args.test.js`
- Depends on: none

**Interfaces:**
- `src/args.js` exports `{ parseArgs }`.
- `parseArgs(argv: string[]): { command, args: string[], file: string, filter: { tag?, done?, dueBefore? }, sort: 'priority' | 'due' | 'id' }`. Throws `Error('invalid arguments: ...')`.

**Failing tests:** write `test/args.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseArgs } = require('../src/args.js')

test('parseArgs reads the command, its words, and the defaults', () => {
  assert.deepEqual(parseArgs(['add', 'Buy', 'milk', '@home']), {
    command: 'add',
    args: ['Buy', 'milk', '@home'],
    file: 'tasks.json',
    filter: {},
    sort: 'priority',
  })
})

test('parseArgs reads flags anywhere after the command', () => {
  assert.deepEqual(parseArgs(['list', '--tag', 'home', '--pending', '--sort', 'due', '--file', 'x.json', '--due-before', '2026-12-31']), {
    command: 'list',
    args: [],
    file: 'x.json',
    filter: { tag: 'home', done: false, dueBefore: '2026-12-31' },
    sort: 'due',
  })
  assert.deepEqual(parseArgs(['done', '3', '--file', 'y.json']).args, ['3'])
})

test('no words at all means help', () => {
  assert.equal(parseArgs([]).command, 'help')
})

test('parseArgs refuses unknown commands and flags, missing values and conflicts', () => {
  const cases = [['launch'], ['list', '--color'], ['list', '--tag'], ['list', '--done', '--pending'], ['list', '--sort', 'size'], ['list', '--due-before', '2026-13-01']]
  for (const argv of cases) assert.throws(() => parseArgs(argv), /^Error: invalid arguments:/, argv.join(' '))
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Arguments".

**Acceptance:** `npm test` passes.

### Task 5: Format tasks for the terminal

**Aether:**
- Tier: haiku — exact tests and two small functions pin it down
- Area: cli
- Owns: `src/format.js`, `test/format.test.js`
- Depends on: none

**Interfaces:**
- `src/format.js` exports `{ formatTask, formatTable }`.
- `formatTask(task: Task): string`; `formatTable(tasks: Task[]): string`.

**Failing tests:** write `test/format.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { formatTask, formatTable } = require('../src/format.js')

test('formatTask writes the id, state, title, priority, due date and tags', () => {
  const task = { id: 3, title: 'Buy milk', tags: ['home', 'errands'], priority: 1, due: '2026-10-10', done: false }
  assert.equal(formatTask(task), '#3 [ ] Buy milk !1 due:2026-10-10 @home @errands')
  assert.equal(formatTask({ id: 7, title: 'Read', tags: [], priority: 2, due: null, done: true }), '#7 [x] Read')
})

test('formatTable joins the lines without a final newline, and says when there are no tasks', () => {
  const a = { id: 1, title: 'A', tags: [], priority: 3, due: null, done: false }
  const b = { id: 2, title: 'B', tags: ['x'], priority: 2, due: null, done: true }
  assert.equal(formatTable([a, b]), '#1 [ ] A !3\n#2 [x] B @x')
  assert.equal(formatTable([]), 'No tasks.')
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Formatting".

**Acceptance:** `npm test` passes.

### Task 6: Run the commands

**Aether:**
- Tier: sonnet — integration across five modules, with behavior the tests do not pin down exactly
- Area: cli
- Owns: `src/commands.js`, `test/commands.test.js`
- Depends on: Task 1 — parses task lines with parseTask
- Depends on: Task 2 — loads and saves the store
- Depends on: Task 3 — filters and sorts for list
- Depends on: Task 4 — its tests build commands with parseArgs
- Depends on: Task 5 — formats the list

**Interfaces:**
- `src/commands.js` exports `{ runCommand, USAGE }`.
- `runCommand(parsed): { output: string, exitCode: number }`, where `parsed` is what `parseArgs` returns.
- `USAGE` is the help text.

**Failing tests:** write `test/commands.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { runCommand } = require('../src/commands.js')
const { parseArgs } = require('../src/args.js')

function tempFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'tasks.json')
}

const run = (file, ...argv) => runCommand(parseArgs([...argv, '--file', file]))

test('add, list, done and remove work on the store', (t) => {
  const file = tempFile(t)
  assert.deepEqual(run(file, 'add', 'Buy', 'milk', '@home', '!1'), { output: 'Added #1', exitCode: 0 })
  assert.deepEqual(run(file, 'add', 'Read', 'due:2026-10-10'), { output: 'Added #2', exitCode: 0 })
  assert.deepEqual(run(file, 'list'), { output: '#1 [ ] Buy milk !1 @home\n#2 [ ] Read due:2026-10-10', exitCode: 0 })
  assert.deepEqual(run(file, 'done', '2'), { output: 'Done #2', exitCode: 0 })
  assert.deepEqual(run(file, 'list', '--done'), { output: '#2 [x] Read due:2026-10-10', exitCode: 0 })
  assert.deepEqual(run(file, 'remove', '1'), { output: 'Removed #1', exitCode: 0 })
  assert.deepEqual(run(file, 'list', '--pending'), { output: 'No tasks.', exitCode: 0 })
})

test('an unknown id exits 1, and an invalid id or task line exits 2', (t) => {
  const file = tempFile(t)
  assert.deepEqual(run(file, 'done', '9'), { output: 'No task #9.', exitCode: 1 })
  const badId = run(file, 'remove', 'x')
  assert.equal(badId.exitCode, 2)
  assert.match(badId.output, /^invalid arguments:/)
  const badLine = run(file, 'add', 'Pay', '!7')
  assert.equal(badLine.exitCode, 2)
  assert.match(badLine.output, /^invalid task:/)
})

test('help names every command and flag', () => {
  const { output, exitCode } = runCommand(parseArgs([]))
  assert.equal(exitCode, 0)
  for (const word of ['add', 'list', 'done', 'remove', 'help', '--file', '--tag', '--done', '--pending', '--sort', '--due-before']) {
    assert.ok(output.includes(word), word)
  }
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Commands".

**Acceptance:** `npm test` passes.

### Task 7: The command-line entry point

**Aether:**
- Tier: haiku — exact tests and a thin wrapper pin it down
- Area: cli
- Owns: `bin/tasks.js`, `test/cli.test.js`
- Depends on: Task 4 — parses the arguments
- Depends on: Task 6 — runs the commands

**Interfaces:**
- `bin/tasks.js` is an executable script (`#!/usr/bin/env node`) that exports nothing.

**Failing tests:** write `test/cli.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CLI = path.join(__dirname, '..', 'bin', 'tasks.js')

function tempFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'tasks.json')
}

const cli = (file, ...argv) => spawnSync(process.execPath, [CLI, ...argv, '--file', file], { encoding: 'utf8' })

test('the CLI prints to stdout and exits 0 on success', (t) => {
  const file = tempFile(t)
  let r = cli(file, 'add', 'Buy', 'milk')
  assert.equal(r.status, 0)
  assert.equal(r.stdout, 'Added #1\n')
  assert.equal(r.stderr, '')
  r = cli(file, 'list')
  assert.equal(r.stdout, '#1 [ ] Buy milk\n')
})

test('the CLI prints failures to stderr with their exit code', (t) => {
  const file = tempFile(t)
  let r = cli(file, 'done', '4')
  assert.equal(r.status, 1)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, 'No task #4.\n')
  r = cli(file, 'list', '--sort', 'size')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /^invalid arguments:/)
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "CLI".

**Acceptance:** `npm test` passes.
