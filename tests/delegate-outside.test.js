'use strict'

// Spec 033 (issues 185 and 198), the decisions of `begin` and the hand-off of `runReadOnly`: AETHER-TREE: names the tree a
// read-only copy is of (D4), and a brief naming what the copy cannot hold is kept on Claude (D5). The copy itself is built
// by runDelegate, which another half of the spec builds; here runChain is replaced by a fake that records what it is given.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const delegateRun = require('../plugins/aether/lib/delegate-run.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }

// A Lead's checkout with the ignore rule of the `.worktrees/` folder, committed on its feature branch.
function leadRepo(t) {
  const repo = makeRepo(t)
  fs.writeFileSync(path.join(repo.dir, '.gitignore'), '.worktrees/\n')
  repo.git('add', '.gitignore')
  repo.git('commit', '-q', '-m', 'ignore the worktrees folder')
  return repo
}

// The deps of `begin`: the pair step is replaced by a counter, so a test can see whether a quota was asked for.
function world(t, cwd) {
  const dataDir = tempDir(t, 'aether-data-')
  const home = tempDir(t, 'aether-home-')
  const asked = []
  let n = 0
  const deps = {
    dataDir, cwd, home, now: () => 1000 + (n += 1), settings: EXTERNAL, newId: () => `gen-${n}`,
    pickPair: async (reference) => (asked.push(reference), { pick: GROK, quota: [] }),
  }
  return { dataDir, home, deps, asked }
}

const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const briefOf = (id, body) => `AETHER-TASK: ${id}\n${body}`
const launchOf = (dataDir, id) => log.readEntries(dataDir, { task: id }).find((entry) => entry.kind === 'launch')
const externalOf = (dataDir, id) => JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', `${log.fileKey('s1', id)}.json`), 'utf8'))

function writeIn(dir, file, content) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
}

// The fake runChain of runTask: it records the arguments and answers as a finished read-only chain.
function fakeChain(calls) {
  return async (args) => {
    calls.push(args)
    return { ok: true, status: 'ok', text: 'the answer', attempts: [GROK], changed: [] }
  }
}

// ---- AETHER-TREE (D4) ----

test('parseBrief reads AETHER-TREE, and its first line wins; the owned paths of an editing task are still read (D4)', () => {
  assert.equal(task.parseBrief('AETHER-TASK: t1\nAETHER-TREE: /x/side\nAETHER-TREE: /x/other\nbody').tree, '/x/side')
  assert.equal(task.parseBrief('AETHER-TASK: t1\nbody').tree, null)
})

test('AETHER-TREE names a worktree of the repository: the external file holds it as tree, and cwd stays the Lead\'s checkout (D4, test 7)', async (t) => {
  const repo = leadRepo(t)
  const side = path.join(repo.dir, '.worktrees', 'side')
  repo.git('worktree', 'add', '-q', '-b', 'side', side)
  const sideReal = fs.realpathSync(side)
  const { deps, dataDir, asked } = world(t, repo.dir)
  const plan = await task.begin(call(briefOf('t-tree', `AETHER-TREE: ${side}\nRead the inventory.`)), deps)
  assert.deepEqual([plan.kind, plan.step, asked.length], ['first', 'haiku-high', 1])
  const external = externalOf(dataDir, 't-tree')
  assert.equal(external.tree, sideReal)
  assert.equal(external.cwd, fs.realpathSync(repo.dir))
  const launch = launchOf(dataDir, 't-tree')
  assert.equal(launch.tree, sideReal)
  assert.equal('outside' in launch, false)
  assert.equal('envHeldBack' in launch, false, 'the facts of the snapshot go on the outcome entry, not the launch line (D7)')
})

test('a brief whose AETHER-TREE is not a worktree of the repository is refused, and the refusal names the worktrees (D4)', async (t) => {
  const repo = leadRepo(t)
  const elsewhere = tempDir(t, 'aether-elsewhere-')
  const { deps, dataDir, asked } = world(t, repo.dir)
  const plan = await task.begin(call(briefOf('t-bad', `AETHER-TREE: ${elsewhere}\nRead it.`)), deps)
  assert.equal(plan.kind, 'refused')
  assert.equal(plan.external, null)
  assert.equal(asked.length, 0, 'no pair is picked for a refused launch')
  assert.match(plan.args.prompt, /is not a worktree of this repository/)
  assert.ok(plan.args.prompt.includes(fs.realpathSync(repo.dir)), 'the refusal names the worktrees of the repository')
  assert.match(plan.args.prompt, /Fix the AETHER-TREE line/)
  assert.equal(fs.existsSync(path.join(dataDir, 'delegates', 'external', `${log.fileKey('s1', 't-bad')}.json`)), false)
  assert.equal(launchOf(dataDir, 't-bad').launchKind, 'refused')
})

test('the copy of a tree named by AETHER-TREE is the tree: runReadOnly hands that directory to the chain, not the Lead\'s checkout (D4, test 4)', async (t) => {
  const repo = leadRepo(t)
  const side = path.join(repo.dir, '.worktrees', 'side')
  repo.git('worktree', 'add', '-q', '-b', 'side', side)
  const sideReal = fs.realpathSync(side)
  const { deps, dataDir } = world(t, repo.dir)
  await task.begin(call(briefOf('t-run', `AETHER-TREE: ${side}\nRead it.`)), deps)
  const calls = []
  const result = await delegateRun.runTask({ id: 't-run', session: 's1', cwd: repo.dir, dataDir, now: () => 2000 }, { runChain: fakeChain(calls) })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].cwd, sideReal)
  assert.notEqual(calls[0].cwd, fs.realpathSync(repo.dir))
  assert.equal(calls[0].external.tree, sideReal)
})

test('a tree removed between begin and the run ends the attempt as failed; the Lead\'s checkout is not copied in its place (D4, test 4)', async (t) => {
  const repo = leadRepo(t)
  const side = path.join(repo.dir, '.worktrees', 'side')
  repo.git('worktree', 'add', '-q', '-b', 'side', side)
  const { deps, dataDir } = world(t, repo.dir)
  await task.begin(call(briefOf('t-gone', `AETHER-TREE: ${side}\nRead it.`)), deps)
  repo.git('worktree', 'remove', '--force', side)
  const calls = []
  const result = await delegateRun.runTask({ id: 't-gone', session: 's1', cwd: repo.dir, dataDir, now: () => 2000 }, { runChain: fakeChain(calls) })
  assert.deepEqual([result.ok, result.status], [false, 'failed'])
  assert.equal(calls.length, 0, 'the chain is never started, so no copy of the Lead\'s checkout is made')
})

test('AETHER-OWNS makes AETHER-TREE ignored: an editing task is not refused for a path that is no worktree (D4)', async (t) => {
  const repo = leadRepo(t)
  const { deps, dataDir, asked } = world(t, repo.dir)
  const plan = await task.begin(call(briefOf('t-owns', `AETHER-OWNS: src/**\nAETHER-TREE: ${path.join(tempDir(t, 'aether-nope-'), 'x')}\nEdit it.`)), deps)
  assert.equal(plan.kind, 'first')
  assert.equal(asked.length, 1)
  assert.equal(launchOf(dataDir, 't-owns').tree, undefined)
})

// ---- what the copy cannot hold (D5, test 5) ----

// Starts a read-only task whose Lead's brief is `body`, and says what begin decided.
async function decide(t, body, { cwd } = {}) {
  const repo = cwd ?? leadRepo(t)
  const { deps, dataDir, asked } = world(t, repo.dir)
  const plan = await task.begin(call(briefOf('t-scan', body)), deps)
  return { plan, asked, launch: launchOf(dataDir, 't-scan'), dataDir }
}

function assertOutside(decision, expected) {
  assert.equal(decision.launch.outside, expected)
  assert.equal(decision.plan.external, null, 'nothing is launched on another harness')
  assert.equal(decision.asked.length, 0, 'no pair is picked and no quota is read')
  assert.deepEqual([decision.plan.kind, decision.plan.args.model, decision.plan.args.effort], ['first', 'haiku', 'high'])
  assert.ok(decision.plan.notes.join(' ').includes(expected), 'the Lead is told which path was named')
}

test('a brief naming an existing path outside the tree is outside: it runs on Claude at its step, with no pair and no quota (D5)', async (t) => {
  const repo = leadRepo(t)
  const outsideFile = path.join(tempDir(t, 'aether-outside-'), 'notes.md')
  fs.writeFileSync(outsideFile, 'notes\n')
  assertOutside(await decide(t, `Read ${outsideFile} and say what it holds.`, { cwd: repo }), outsideFile)
})

test('a ~/ path that exists in the home of the session is outside; one that does not exist launches the task (D5)', async (t) => {
  const repo = leadRepo(t)
  const { deps, dataDir, home, asked } = world(t, repo.dir)
  fs.writeFileSync(path.join(home, 'notes.md'), 'n\n')
  const plan = await task.begin(call(briefOf('t-home', 'Read ~/notes.md and ~/missing.md.')), deps)
  assert.equal(launchOf(dataDir, 't-home').outside, path.join(home, 'notes.md'))
  assert.equal(plan.external, null)
  assert.equal(asked.length, 0)
  assertNotOutside(await decide(t, 'Read ~/missing.md.', { cwd: repo }))
})

test('an ignored path inside the tree, relative or absolute, is outside (the case of .worktrees/ in issue 185) (D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, '.worktrees/x/file.js', 'x\n')
  const absolute = path.join(repo.dir, '.worktrees', 'x', 'file.js')
  assertOutside(await decide(t, 'Read .worktrees/x/file.js.', { cwd: repo }), absolute)
  const second = leadRepo(t)
  writeIn(second.dir, '.worktrees/x/file.js', 'x\n')
  assertOutside(await decide(t, `Read ${path.join(second.dir, '.worktrees', 'x', 'file.js')} now.`, { cwd: second }), path.join(second.dir, '.worktrees', 'x', 'file.js'))
})

test('a .env path is outside whether it is committed or not, and so is a new .env.local (D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, '.env', 'OLD=1\n')
  repo.git('add', '.env')
  repo.git('commit', '-q', '-m', 'a committed env file')
  writeIn(repo.dir, '.env.local', 'NEW=1\n')
  assertOutside(await decide(t, 'Check the keys in ./.env.', { cwd: repo }), path.join(repo.dir, '.env'))
  const other = leadRepo(t)
  writeIn(other.dir, '.env.local', 'NEW=1\n')
  assertOutside(await decide(t, 'Check the keys in ./.env.local.', { cwd: other }), path.join(other.dir, '.env.local'))
})

test('a path written with a line suffix, backticks, quotes, parentheses or a final full stop is found in the same way (D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, '.worktrees/x/a.js', 'a\n')
  const abs = path.join(repo.dir, '.worktrees', 'x', 'a.js')
  for (const wrapped of [`${abs}:120`, `\`${abs}\``, `"${abs}"`, `(${abs})`, `${abs}.`, `\`${abs}:12:4\`.`, `${abs}#12`]) {
    assertOutside(await decide(t, `Compare ${wrapped} with the spec.`, { cwd: repo }), abs)
  }
})

test('a path inside a nested repository under the tree is outside, even though git does not ignore it (D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, 'nested/file.txt', 'n\n')
  fs.mkdirSync(path.join(repo.dir, 'nested'), { recursive: true })
  const { spawnSync } = require('node:child_process')
  spawnSync('git', ['init', '-q'], { cwd: path.join(repo.dir, 'nested') })
  assertOutside(await decide(t, 'Read nested/file.txt.', { cwd: repo }), path.join(repo.dir, 'nested', 'file.txt'))
})

test('a path under one of Aether\'s folders at the root is outside, whether or not git ignores it (the one rule more of the Lead, D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, '.aether/exam/secret.txt', 's\n')
  writeIn(repo.dir, '.aether-tmp/a.txt', 'a\n')
  writeIn(repo.dir, '.aether-exam/b.txt', 'b\n')
  const excludes = fs.readFileSync(path.join(repo.dir, '.git', 'info', 'exclude'), 'utf8')
  assert.equal(/\.aether/.test(excludes), false, 'info/exclude lacks the lines of Aether\'s folders in this test')
  for (const file of ['.aether/exam/secret.txt', '.aether-tmp/a.txt', '.aether-exam/b.txt']) {
    assertOutside(await decide(t, `Read ${file} and report.`, { cwd: repo }), path.join(repo.dir, file))
  }
  const deeper = leadRepo(t)
  writeIn(deeper.dir, 'deep/.aether-tmp/keep.txt', 'k\n')
  assert.equal((await decide(t, 'Read deep/.aether-tmp/keep.txt.', { cwd: deeper })).launch.outside, undefined, 'a folder of the same name deeper down stays visible')
})

test('the words that are not paths launch the task: a URL, a command, /dev/null, the env shebang and the three command words (D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, 'src/a.js', 'a\n')
  repo.git('add', 'src/a.js')
  repo.git('commit', '-q', '-m', 'a source file')
  const body = [
    'See https://example.com/docs/page and run /aether:run when done.',
    'Send the output to /dev/null and read src/a.js.',
    'Start with #!/usr/bin/env node, then /usr/bin/env, /bin/sh and /bin/bash.',
  ].join('\n')
  const { plan, launch } = await decide(t, body, { cwd: repo })
  assert.equal(launch.outside, undefined)
  assert.equal(plan.kind, 'first')
  assert.equal(plan.step, 'haiku-high')
})

test('a path that appears only in the findings of an earlier attempt does not make the rise outside (D5, scope of the scan)', async (t) => {
  const repo = leadRepo(t)
  const outsideFile = path.join(tempDir(t, 'aether-outside-'), 'findings.md')
  fs.writeFileSync(outsideFile, 'f\n')
  const { deps, dataDir } = world(t, repo.dir)
  await task.begin(call(briefOf('t-rise', 'Read src.')), deps)
  await task.verdict({ task: 't-rise', verdict: 'fix', findings: [`src/a.js:3: the case is missing, see ${outsideFile}`] }, deps)
  const rise = await task.begin(call(briefOf('t-rise', 'Read src.')), deps)
  assert.equal(rise.kind, 'rise')
  const launches = log.readEntries(dataDir, { task: 't-rise' }).filter((entry) => entry.kind === 'launch')
  assert.equal(launches.at(-1).outside, undefined)
})

test('a symbolic link to the tree does not make a path inside it outside: the candidate goes through realpath (D5)', async (t) => {
  const repo = leadRepo(t)
  writeIn(repo.dir, 'src/a.js', 'a\n')
  repo.git('add', 'src/a.js')
  repo.git('commit', '-q', '-m', 'a source file')
  const link = path.join(tempDir(t, 'aether-link-'), 'checkout')
  fs.symlinkSync(repo.dir, link)
  assertNotOutside(await decide(t, `Read ${path.join(link, 'src', 'a.js')} and report.`, { cwd: repo }))
})

function assertNotOutside(decision) {
  assert.equal(decision.launch.outside, undefined)
  assert.equal(decision.plan.kind, 'first')
  assert.equal(decision.asked.length, 1, 'the pair is picked as for any task the copy holds')
}

test('an editing task (AETHER-OWNS) is not scanned: its outside path does not keep it from a pair (D5, scope)', async (t) => {
  const repo = leadRepo(t)
  const outsideFile = path.join(tempDir(t, 'aether-outside-'), 'x.md')
  fs.writeFileSync(outsideFile, 'x\n')
  const { deps, dataDir, asked } = world(t, repo.dir)
  const plan = await task.begin(call(briefOf('t-edit', `AETHER-OWNS: src/**\nRead ${outsideFile} and edit src.`)), deps)
  assert.equal(plan.kind, 'first')
  assert.equal(asked.length, 1)
  assert.equal(launchOf(dataDir, 't-edit').outside, undefined)
})
