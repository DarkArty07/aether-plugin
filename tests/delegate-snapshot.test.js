'use strict'

// The copy a read-only delegate on another harness reads (spec 033, D1, D2, D3, D6, D7): the checkout's uncommitted work
// is in it as a snapshot commit, without what git ignores, without Aether's folders and without new or edited .env files.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir } = require('./helpers.js')
const { laneEnv } = require('./lane-fixtures.js')
const delegate = require('../plugins/aether/lib/delegate-calls.js')
const { runChain } = require('../plugins/aether/lib/delegate-chain.js')
const { readEntries } = require('../plugins/aether/lib/delegate-log.js')
const runLib = require('../plugins/aether/lib/run.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const delegateRun = require('../plugins/aether/lib/delegate-run.js')

const PID = process.pid
const ID = `snap-1-${PID}`
const ID2 = `snap-2-${PID}`
const rung = { model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }

function setup(t) {
  const env = laneEnv(t)
  const keep = {}
  for (const key of ['AETHER_LANES_CONFIG', 'AETHER_FAKE_AGY_LOG', 'AETHER_FAKE_AGY_STATE', 'AETHER_FAKE_AGY_QUOTA_FILE']) {
    keep[key] = process.env[key]
    process.env[key] = env[key]
  }
  t.after(() => {
    for (const [key, value] of Object.entries(keep)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const config = JSON.parse(fs.readFileSync(env.AETHER_LANES_CONFIG, 'utf8'))
  const repo = makeRepo(t)
  const calls = () => (fs.existsSync(env.AETHER_FAKE_AGY_LOG) ? fs.readFileSync(env.AETHER_FAKE_AGY_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [])
  return { env, config, repo, dataDir: env.AETHER_DATA_DIR, calls }
}

const run = (s, prompt, over = {}) => delegate.runDelegate({
  cwd: s.repo.dir, id: ID, harness: 'agy', rung, task: { description: 'read the copy', prompt }, config: s.config, dataDir: s.dataDir, ...over,
})

// The checkout's history: the files that the Lead then changes without committing.
function commitFixtures(s) {
  const dir = s.repo.dir
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.log\n')
  fs.writeFileSync(path.join(dir, 'gone.txt'), 'to be deleted\n')
  fs.writeFileSync(path.join(dir, '.env'), 'OLD-ENV\n')
  s.repo.git('add', '.gitignore', 'gone.txt', '.env')
  s.repo.git('commit', '-q', '-m', 'fixtures')
}

// The Lead's uncommitted work: a changed tracked file, a staged file, a new file, a deleted file, an ignored file, a new
// .env.local, and an edited tracked .env.
function leadWork(s) {
  const dir = s.repo.dir
  fs.writeFileSync(path.join(dir, 'README.md'), 'README edited by the Lead\n')
  fs.writeFileSync(path.join(dir, 'staged.txt'), 'staged by the Lead\n')
  s.repo.git('add', 'staged.txt')
  fs.writeFileSync(path.join(dir, 'new.txt'), 'new by the Lead\n')
  fs.rmSync(path.join(dir, 'gone.txt'))
  fs.writeFileSync(path.join(dir, 'ignored.log'), 'ignored\n')
  fs.writeFileSync(path.join(dir, '.env.local'), 'NEW-ENV\n')
  fs.writeFileSync(path.join(dir, '.env'), 'EDIT-ENV\n')
}

// Aether's folders of the checkout as a run leaves them: a secret under .aether/, and a folder of the same name deeper
// down, which the copy holds (run.EXCLUDES are rooted at the tree).
function aetherFolders(s) {
  fs.mkdirSync(path.join(s.repo.dir, '.aether', 'exam'), { recursive: true })
  fs.writeFileSync(path.join(s.repo.dir, '.aether', 'exam', 'secret.txt'), 'AETHER-SECRET\n')
  fs.mkdirSync(path.join(s.repo.dir, 'deep', '.aether-tmp'), { recursive: true })
  fs.writeFileSync(path.join(s.repo.dir, 'deep', '.aether-tmp', 'file'), 'DEEP-TMP\n')
}

// The lines of the checkout's info/exclude, trimmed (the file the three ignore lines of run.ensureExcluded go in).
function excludeLines(s) {
  return fs.readFileSync(path.join(s.repo.dir, s.repo.git('rev-parse', '--git-path', 'info/exclude')), 'utf8').split('\n').map((line) => line.trim())
}

// Runs the delegate with a fake that copies what it reads to a folder of its own (`FAKE-AGY: export`).
async function exportCopy(t, s, { id = ID, prompt = 'Audit.' } = {}) {
  const dir = path.join(tempDir(t, 'aether-export-'), 'copy')
  const out = await run(s, `${prompt}\nFAKE-AGY: export ${dir}\nFAKE-AGY: answer {"answer": "read"}`, { id })
  return { out, dir }
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8')
const subjects = (dir) => read(dir, 'git-log.txt').split('\n')
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

test('the copy holds the checkout\'s uncommitted work and nothing git ignores, Aether keeps, or a .env file that is new or edited (D1, D2, D6)', async (t) => {
  const s = setup(t)
  commitFixtures(s)
  leadWork(s)
  aetherFolders(s)

  const { out, dir } = await exportCopy(t, s)
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.tree, s.repo.dir)
  assert.equal(out.uncommitted, true)
  assert.equal(out.envHeldBack, 2, 'the new .env.local and the edited .env are held back')
  for (const entry of runLib.EXCLUDES) assert.ok(excludeLines(s).includes(entry), `run.ensureExcluded left ${entry}: the three folders are ignored, as the normal case has them`)
  assert.equal(read(dir, 'deep/.aether-tmp/file'), 'DEEP-TMP\n', 'a folder of the same name deeper down is in the copy')

  assert.equal(read(dir, 'README.md'), 'README edited by the Lead\n', 'a changed tracked file is as it is on disk')
  assert.equal(read(dir, 'staged.txt'), 'staged by the Lead\n', 'a staged file is in the copy')
  assert.equal(read(dir, 'new.txt'), 'new by the Lead\n', 'a new file that git does not ignore is in the copy')
  assert.equal(fs.existsSync(path.join(dir, 'gone.txt')), false, 'a deleted file is not in the copy')
  assert.equal(fs.existsSync(path.join(dir, 'ignored.log')), false, 'an ignored file is not in the copy')
  assert.equal(fs.existsSync(path.join(dir, '.env.local')), false, 'a new .env file is not in the copy')
  assert.equal(read(dir, '.env'), 'OLD-ENV\n', 'an edited tracked .env is the committed content')
  assert.equal(fs.existsSync(path.join(dir, '.aether')), false, 'Aether\'s folders are not in the copy')

  assert.equal(subjects(dir)[0], 'aether delegate snapshot', 'the copy\'s history has the snapshot on top')
  assert.equal(subjects(dir)[1], 'fixtures', 'and keeps the repository\'s history below it')
  const objects = read(dir, 'git-objects.txt')
  assert.equal(objects.includes('NEW-ENV'), false, 'no object holds the content of a new .env file')
  assert.equal(objects.includes('EDIT-ENV'), false, 'no object holds the content of an edited .env file')
  assert.equal(objects.includes('AETHER-SECRET'), false, 'no object holds a file of Aether\'s folders')
  assert.equal(objects.includes(' .aether\0'), false, 'no tree of the copy or of the repository has an entry .aether')
  assert.equal(fs.existsSync(path.join(s.repo.dir, '.aether', 'work', 'delegates', ID, 'index')), false, 'the temporary index is gone')

  const [call] = s.calls().filter((c) => c.argv.includes('--model'))
  assert.match(JSON.stringify(call.argv), /uncommitted changes of its tree are in one commit/, 'the note tells the delegate what the copy holds (D6)')
})

test('without the ignore lines of Aether\'s folders, the snapshot still leaves them out: no path of them is in the copy or its objects (D1, step 2)', async (t) => {
  const s = setup(t)
  commitFixtures(s)
  leadWork(s)
  aetherFolders(s)
  // run.ensureExcluded cannot write the lines: it is stubbed to throw, which runDelegate takes as it takes a failed write.
  const ensure = runLib.ensureExcluded
  runLib.ensureExcluded = () => {
    throw new Error('info/exclude cannot be written')
  }
  t.after(() => {
    runLib.ensureExcluded = ensure
  })
  for (const entry of runLib.EXCLUDES) assert.equal(excludeLines(s).includes(entry), false, `${entry} is not in info/exclude before the launch`)
  assert.ok(s.repo.git('status', '--porcelain', '--untracked-files=all').includes('.aether/exam/secret.txt'), 'git sees the folder: only the exclude pathspecs keep it out')

  const { out, dir } = await exportCopy(t, s)
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.uncommitted, true)
  assert.equal(fs.existsSync(path.join(dir, '.aether')), false, 'the copy has no .aether folder')
  assert.equal(read(dir, 'deep/.aether-tmp/file'), 'DEEP-TMP\n', 'a folder of the same name deeper down is in the copy')
  assert.equal(read(dir, 'new.txt'), 'new by the Lead\n')
  const objects = read(dir, 'git-objects.txt')
  assert.equal(objects.includes('AETHER-SECRET'), false, 'no object holds a file of Aether\'s folders')
  assert.equal(objects.includes(' .aether\0'), false, 'no tree of the copy or of the repository has an entry .aether')
  assert.equal(read(dir, 'git-show.txt').includes('.aether/'), false, 'the commit of the copy lists no path of .aether/')
})

test('the identity is fixed for the snapshot: a machine without user.name or user.email still launches (D1)', async (t) => {
  const s = setup(t)
  commitFixtures(s)
  leadWork(s)
  s.repo.git('config', '--unset', 'user.name')
  s.repo.git('config', '--unset', 'user.email')
  s.repo.git('config', 'user.useConfigOnly', 'true')
  const emptyGlobal = path.join(tempDir(t, 'aether-noconfig-'), 'gitconfig')
  fs.writeFileSync(emptyGlobal, '')
  const keep = process.env.GIT_CONFIG_GLOBAL
  process.env.GIT_CONFIG_GLOBAL = emptyGlobal
  t.after(() => {
    if (keep === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = keep
  })
  const { out, dir } = await exportCopy(t, s)
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.uncommitted, true)
  assert.equal(subjects(dir)[0], 'aether delegate snapshot')
})

test('taking the copy changes nothing of the Lead\'s checkout: working tree, index, stash, branches, HEAD and worktrees (C3)', async (t) => {
  const s = setup(t)
  commitFixtures(s)
  leadWork(s)
  s.repo.git('add', '.env')
  fs.writeFileSync(path.join(s.repo.dir, '.env'), 'EDIT-ENV-UNSTAGED\n')
  const indexFile = path.join(s.repo.dir, '.git', 'index')
  const leadState = () => ({
    status: s.repo.git('--no-optional-locks', 'status', '--porcelain'),
    index: sha256(indexFile),
    stash: s.repo.git('stash', 'list'),
    refs: s.repo.git('for-each-ref', '--format=%(refname) %(objectname)'),
    head: s.repo.git('rev-parse', 'HEAD'),
    worktrees: s.repo.git('worktree', 'list', '--porcelain'),
  })
  const before = leadState()
  const { out, dir } = await exportCopy(t, s)
  assert.equal(out.status, 'ok', out.detail)
  assert.deepEqual(leadState(), before)
  assert.equal(read(dir, '.env'), 'OLD-ENV\n', 'the Lead\'s staged .env edit does not reach the copy: the copy holds the committed .env')
})

test('a clean checkout is copied at its HEAD, and a checkout whose only changes are .env files makes no commit (D1)', async (t) => {
  const clean = setup(t)
  commitFixtures(clean)
  const cleanBefore = clean.repo.git('count-objects', '-v')
  const first = await exportCopy(t, clean)
  assert.equal(first.out.status, 'ok', first.out.detail)
  assert.equal(first.out.uncommitted, false)
  assert.equal(first.out.envHeldBack, 0)
  assert.equal(subjects(first.dir)[0], 'fixtures', 'the copy is at HEAD')
  assert.equal(clean.repo.git('count-objects', '-v'), cleanBefore, 'no object is written')

  const envOnly = setup(t)
  commitFixtures(envOnly)
  fs.writeFileSync(path.join(envOnly.repo.dir, '.env'), 'EDIT-ENV\n')
  const envBefore = envOnly.repo.git('count-objects', '-v')
  const second = await exportCopy(t, envOnly, { id: ID2 })
  assert.equal(second.out.status, 'ok', second.out.detail)
  assert.equal(second.out.uncommitted, false, 'an edited .env is not a commit of the copy')
  assert.equal(second.out.envHeldBack, 1)
  assert.equal(subjects(second.dir)[0], 'fixtures')
  assert.equal(read(second.dir, '.env'), 'OLD-ENV\n')
  assert.equal(envOnly.repo.git('count-objects', '-v'), envBefore, 'no object of the edited .env is written')
})

test('a delegate that edits its copy is a violation measured from the snapshot, so the Lead\'s uncommitted work is not its change (C6)', async (t) => {
  const s = setup(t)
  fs.writeFileSync(path.join(s.repo.dir, 'README.md'), 'edited by the Lead\n')
  const out = await run(s, 'Audit.\nFAKE-AGY: write notes.txt hello\nFAKE-AGY: answer {"answer": "done"}')
  assert.equal(out.status, 'violation', out.detail)
  assert.deepEqual(out.changed, ['notes.txt'], 'only the delegate\'s file is named')
  assert.equal(out.uncommitted, true)
  assert.equal(fs.existsSync(path.join(s.repo.dir, 'notes.txt')), false)
  assert.equal(s.repo.git('status', '--porcelain'), 'M README.md', 'the Lead\'s checkout is as it was (trimmed)')
  assert.equal(s.repo.git('worktree', 'list').split('\n').length, 1)
})

test('the outcome entry of the chain records the tree copied, whether it carried uncommitted work, and the .env paths held back (D7)', async (t) => {
  const s = setup(t)
  commitFixtures(s)
  leadWork(s)
  const id = `chain-${PID}`
  const external = { harness: 'agy', rung, task: { description: 'read the copy', prompt: 'Audit.\nFAKE-AGY: answer {"answer": "x"}' } }
  const result = await runChain({ cwd: s.repo.dir, id, session: null, external, config: s.config, dataDir: s.dataDir })
  assert.equal(result.status, 'ok', result.detail)
  const [entry] = readEntries(s.dataDir, { task: id }).filter((e) => e.kind === 'outcome')
  assert.equal(entry.tree, s.repo.dir)
  assert.equal(entry.uncommitted, true)
  assert.equal(entry.envHeldBack, 2)
})

// Test 4 of the design, the part the other half could not check (spec 033, D4): AETHER-TREE names another worktree of the
// repository, with uncommitted work of its own. The brief goes through begin, the external file and runTask, as
// tests/delegate-outside.test.js drives it; the chain is the real one, so runDelegate runs with the fake agy CLI.
test('AETHER-TREE names another worktree with uncommitted work of its own: the copy is of that worktree, with that work (D4, test 4)', async (t) => {
  const s = setup(t)
  commitFixtures(s)
  leadWork(s)
  const side = path.join(tempDir(t, 'aether-side-'), 'side')
  s.repo.git('worktree', 'add', '-q', '-b', 'side', side)
  fs.writeFileSync(path.join(side, 'README.md'), 'README of the side, edited\n')
  fs.writeFileSync(path.join(side, 'side-only.txt'), 'uncommitted in the side\n')
  const dir = path.join(tempDir(t, 'aether-export-'), 'copy')
  const id = `side-${PID}`
  const pick = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }
  const deps = {
    dataDir: s.dataDir,
    cwd: s.repo.dir,
    home: tempDir(t, 'aether-home-'),
    now: () => 1000,
    settings: { lanes: true, harnesses: ['agy'], deadlines: { quotaMs: 1 } },
    newId: () => id,
    pickPair: async () => ({ pick, quota: [] }),
  }
  const body = `AETHER-TREE: ${side}\nRead the side.\nFAKE-AGY: export ${dir}\nFAKE-AGY: answer {"answer": "read"}`
  const plan = await task.begin({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt: `AETHER-TASK: ${id}\n${body}` } }, deps)
  assert.equal(plan.kind, 'first')
  assert.notEqual(plan.external, null, 'the task goes out on agy')

  const result = await delegateRun.runTask({ id, session: 's1', cwd: s.repo.dir, dataDir: s.dataDir, now: () => 2000 })
  assert.equal(result.status, 'ok', result.detail)
  const [entry] = readEntries(s.dataDir, { task: id }).filter((e) => e.kind === 'outcome')
  assert.equal(entry.tree, fs.realpathSync(side), 'the copy is of the tree the brief names')
  assert.equal(entry.uncommitted, true)
  assert.equal(read(dir, 'README.md'), 'README of the side, edited\n', 'the side\'s uncommitted change is in the copy')
  assert.equal(read(dir, 'side-only.txt'), 'uncommitted in the side\n', 'a new file of the side is in the copy')
  assert.equal(fs.existsSync(path.join(dir, 'new.txt')), false, 'the Lead\'s own new file is not in the copy')
  assert.equal(subjects(dir)[0], 'aether delegate snapshot')
})
