'use strict'

// A commit on a detached HEAD is not lost (#255): after an implementer on another harness leaves its
// work on a commit over a detached HEAD, the result, the review and the merge see that work, or the
// attempt is rejected with a reason that names the cause. Both paths are covered: the delegate path
// (aether-lane delegate, through lane-delegate and delegate-run) and the swarm path (aether-lane
// start/wait/result, through lane-calls, with aether-wt merge).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, runBin, commitIn } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const work = require('../plugins/aether/lib/lane-work.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const run = require('../plugins/aether/lib/run.js')
const dr = require('../plugins/aether/lib/delegate-run.js')
const dt = require('../plugins/aether/lib/delegate-task.js')

const LANE_BIN = fx.LANE_BIN
const IMPLEMENT = 'task-1-1-implement'
const IMPL_DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote the file.', head: '', tests: 'ok', concerns: '', question: '' })
const REVIEW_READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const PAIR = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high' }
const OK_TESTS = { command: 'true', exitCode: 0, passed: true, timedOut: false, outputTail: '' }

// A stand-in for the agy CLI that plays a simulated implementer: on an implementer prompt (one that
// carries `## Paths you own`) it checks out a detached HEAD first (or stays attached in `attached`
// mode), writes the committed and uncommitted files, commits the former, records its HEAD in the
// witness file, and then lets the fake agy answer. Any other prompt is answered as a reviewer.
function detachCommand(t, { mode, files, sibling = null, witness }) {
  const file = path.join(tempDir(t, 'aether-detach-fake-'), 'detach-fake.js')
  const lines = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const { spawnSync } = require('node:child_process')",
    `const FAKE_AGY = ${JSON.stringify(fx.FAKE_AGY)}`,
    `const MODE = ${JSON.stringify(mode)}`,
    `const FILES = ${JSON.stringify(files)}`,
    `const SIBLING = ${JSON.stringify(sibling)}`,
    `const WITNESS = ${JSON.stringify(witness)}`,
    `const REVIEW_ANSWER = ${JSON.stringify(REVIEW_READY)}`,
    'const argv = process.argv.slice(2)',
    'const pi = argv.indexOf("-p")',
    'const prompt = pi === -1 ? "" : argv[pi + 1]',
    'const git = (...args) => spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })',
    'if (pi !== -1 && argv[pi + 1] !== "/usage" && prompt.includes("## Paths you own")) {',
    '  if (MODE === "sibling") git("checkout", "-q", "--detach", SIBLING)',
    '  else if (MODE !== "attached") git("checkout", "-q", "--detach")',
    '  for (const [rel, text] of FILES.committed) {',
    '    const target = path.join(process.cwd(), rel)',
    '    fs.mkdirSync(path.dirname(target), { recursive: true })',
    '    fs.writeFileSync(target, text)',
    '  }',
    '  if (FILES.committed.length > 0) { git("add", "-A"); git("commit", "-q", "-m", "detached work") }',
    '  for (const [rel, text] of FILES.uncommitted) {',
    '    const target = path.join(process.cwd(), rel)',
    '    fs.mkdirSync(path.dirname(target), { recursive: true })',
    '    fs.writeFileSync(target, text)',
    '  }',
    '  fs.appendFileSync(WITNESS, `${JSON.stringify({ head: git("rev-parse", "HEAD").stdout.trim() })}\\n`)',
    '} else if (pi !== -1 && argv[pi + 1] !== "/usage") {',
    '  argv[pi + 1] = `${prompt}\\nFAKE-AGY: answer ${REVIEW_ANSWER}`',
    '}',
    'const r = spawnSync(process.execPath, [FAKE_AGY, ...argv], { stdio: "inherit" })',
    'process.exit(r.status === null ? 1 : r.status)',
  ]
  fs.writeFileSync(file, `${lines.join('\n')}\n`)
  fs.chmodSync(file, 0o755)
  return file
}

function witnessHead(witness) {
  const lines = fs.readFileSync(witness, 'utf8').split('\n').filter(Boolean)
  assert.ok(lines.length > 0, 'the simulated implementer ran')
  return JSON.parse(lines[lines.length - 1]).head
}

// One implementer call on the swarm path, through the real bin and runner: the wrapper command plays
// the implementer, then the bin's wait reads the judged result.
function swarmAttempt(t, { mode, files, sibling = null }) {
  const { repo, args } = fx.laneRun(t)
  const witness = path.join(tempDir(t, 'aether-witness-'), 'witness.jsonl')
  const env = fx.laneEnv(t, { command: detachCommand(t, { mode, files, sibling, witness }) })
  const message = [
    'You are implementing task-1: Task 1 title.',
    '## Paths you own',
    '',
    'You may change only these paths:',
    '- src/t1/**',
    '',
    `FAKE-AGY: answer ${IMPL_DONE}`,
  ].join('\n')
  const digest = fx.writePrompt(args, IMPLEMENT, message)
  const branch = run.unitBranch(args.runId, 'task-1')
  const before = args.integration.branch ? repo.git('rev-parse', args.integration.branch) : null
  const start = fx.lane(args, 'start', [IMPLEMENT, '--role', 'implementer', '--task', 'task-1', '--model', 'gemini-3.8-flash', '--effort', 'xhigh', '--digest', digest], env)
  assert.deepEqual(start.json, { started: true, model: 'gemini-3.8-flash-xhigh', group: 'flash' }, start.stdout + start.stderr)
  const done = fx.waitDone(args, IMPLEMENT, env)
  return { repo, args, env, done, witness, branch, before }
}

function branchOf(repo, branch) {
  return repo.git('rev-parse', branch)
}

function attachedBranch(repo, dir) {
  return repo.git('-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD')
}

// One editing delegate on the delegate path, through the real `aether-lane delegate` command: the
// wrapper command plays the implementer on its unit worktree, then the command judges, tests and
// reviews the unit branch.
function delegateAttempt(t, { mode, files, sibling = null, owns = 'src/t1/**', prepare = null }) {
  const repo = makeRepo(t)
  if (prepare) prepare(repo)
  const witness = path.join(tempDir(t, 'aether-witness-'), 'witness.jsonl')
  const env = { ...fx.laneEnv(t, { command: detachCommand(t, { mode, files, sibling, witness }) }), AETHER_LANE_HARNESSES: 'agy' }
  const brief = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(brief, ['Write src/t1/new.js saying hello and commit it.', `FAKE-AGY: answer ${IMPL_DONE}`, ''].join('\n'))
  repo.git('add', 'brief.md')
  repo.git('commit', '-q', '-m', 'brief')
  const integrationBefore = repo.git('rev-parse', 'HEAD')
  const r = runBin(LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', owns, '--tests', 'true', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  return { repo, env, json: r.json, witness, integrationBefore }
}

function packageOf(repo, runId, taskId = 'task-1') {
  return path.join(repo.dir, '.aether', 'runs', runId, 'packages', `${taskId}.diff`)
}

// removeUnit deletes the unit branch after it saves the patch, so a later `git rev-parse <branch>`
// cannot show where the branch pointed. This hook records each committed ref update while the ref exists.
function recordRefUpdates(repo, file) {
  const hooks = path.join(repo.dir, '.git', 'hooks')
  fs.mkdirSync(hooks, { recursive: true })
  const hook = path.join(hooks, 'reference-transaction')
  fs.writeFileSync(
    hook,
    [
      `#!${process.execPath}`,
      "'use strict'",
      "const fs = require('node:fs')",
      "if (process.argv[2] !== 'committed') process.exit(0)",
      `fs.appendFileSync(${JSON.stringify(file)}, fs.readFileSync(0, 'utf8'))`,
      '',
    ].join('\n'),
  )
  fs.chmodSync(hook, 0o755)
  repo.git('config', 'core.hooksPath', hooks)
}

// New oids of `ref` that are neither the branch's starting commit nor its deletion.
function movedRefs(log, ref, start) {
  const zero = '0'.repeat(40)
  const shas = []
  for (const line of log.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3 || parts[2] !== ref) continue
    if (parts[1] === start || parts[1] === zero) continue
    shas.push(parts[1])
  }
  return shas
}

test('a detached commit ahead of the unit branch moves the branch, and the result, review and merge see it (swarm path)', (t) => {
  const { repo, args, done, witness, branch } = swarmAttempt(t, { mode: 'ahead', files: { committed: [['src/t1/new.js', 'hello\n']], uncommitted: [] } })
  assert.equal(done.status, 'ok', JSON.stringify(done))
  const detached = witnessHead(witness)
  assert.equal(branchOf(repo, branch), detached, 'the branch moved to the detached commit')
  assert.equal(done.result.head, detached, 'the result names the commit the branch is at')
  const unit = path.join(repo.dir, '.aether', 'worktrees', args.runId, 'task-1')
  assert.equal(attachedBranch(repo, unit), branch, 'the worktree is back on the branch')
  const pack = packageOf(repo, args.runId)
  assert.ok(fs.readFileSync(pack, 'utf8').includes('src/t1/new.js'), 'the reviewer package lists the file')
  assert.equal(wt.merge(repo.dir, args.runId, 'task-1').merged, true)
  assert.equal(repo.git('show', `${args.integration.branch}:src/t1/new.js`), 'hello')
})

test('a detached commit ahead of the unit branch moves the branch, and the result, review and merge see it (delegate path)', (t) => {
  const { repo, json, witness } = delegateAttempt(t, { mode: 'ahead', files: { committed: [['src/t1/new.js', 'hello\n']], uncommitted: [] } })
  assert.equal(json.status, 'done', JSON.stringify(json))
  const detached = witnessHead(witness)
  assert.equal(json.branch, `aether/${json.id}/task-1`)
  assert.equal(json.head, detached, 'the result names the commit the branch is at')
  assert.equal(branchOf(repo, json.branch), detached, 'the branch moved to the detached commit')
  assert.equal(attachedBranch(repo, json.worktree), json.branch, 'the worktree is back on the branch')
  assert.equal(json.review.status, 'done', JSON.stringify(json.review))
  const pack = packageOf(repo, json.id)
  assert.ok(fs.readFileSync(pack, 'utf8').includes('src/t1/new.js'), 'the reviewer package lists the file')
  assert.equal(wt.merge(repo.dir, json.id, 'task-1').merged, true)
  assert.equal(repo.git('show', `${json.branch}:src/t1/new.js`), 'hello')
})

// A commit on the base's other line: forked from the integration tip's parent, committed, and back
// on the integration branch. The unit branch (made from the integration tip) is not its ancestor.
function siblingCommit(repo, integration) {
  repo.git('checkout', '-q', '-b', 'side', 'HEAD~1')
  commitIn(repo, repo.dir, 'side.txt', 'side\n', 'side work')
  const sha = repo.git('rev-parse', 'HEAD')
  repo.git('checkout', '-q', integration)
  return sha
}

test('a detached commit off the other line rejects the attempt with a reason naming the cause (swarm path)', (t) => {
  const { repo, args } = fx.laneRun(t)
  commitIn(repo, repo.dir, 'setup.txt', 'setup\n', 'setup')
  const sibling = siblingCommit(repo, args.integration.branch)
  const before = repo.git('rev-parse', args.integration.branch)
  const witness = path.join(tempDir(t, 'aether-witness-'), 'witness.jsonl')
  const env = fx.laneEnv(t, { command: detachCommand(t, { mode: 'sibling', sibling, witness, files: { committed: [['src/t1/new.js', 'hello\n']], uncommitted: [] } }) })
  const message = ['You are implementing task-1: Task 1 title.', '## Paths you own', '', `FAKE-AGY: answer ${IMPL_DONE}`].join('\n')
  const digest = fx.writePrompt(args, IMPLEMENT, message)
  const started = fx.lane(args, 'start', [IMPLEMENT, '--role', 'implementer', '--task', 'task-1', '--model', 'gemini-3.8-flash', '--effort', 'xhigh', '--digest', digest], env)
  assert.deepEqual(started.json, { started: true, model: 'gemini-3.8-flash-xhigh', group: 'flash' }, started.stdout + started.stderr)
  const done = fx.waitDone(args, IMPLEMENT, env)
  const branch = run.unitBranch(args.runId, 'task-1')
  assert.equal(done.status, 'failed', JSON.stringify(done))
  const branchTip = branchOf(repo, branch)
  assert.equal(branchTip, before, 'the unit branch did not move')
  const detached = witnessHead(witness)
  for (const fragment of ['detached', detached.slice(0, 7), branchTip.slice(0, 7), branch]) {
    assert.ok(done.detail.includes(fragment), `the reason names ${fragment}: ${done.detail}`)
  }
  assert.equal(fs.existsSync(packageOf(repo, args.runId)), false, 'the reviewer package is not built')
  assert.equal(repo.git('rev-parse', args.integration.branch), before, 'the merge is not run')
})

test('a detached commit off the other line rejects the attempt with a reason naming the cause (delegate path)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'setup.txt', 'setup\n', 'setup')
  const sibling = siblingCommit(repo, 'feature/x')
  const witness = path.join(tempDir(t, 'aether-witness-'), 'witness.jsonl')
  const env = { ...fx.laneEnv(t, { command: detachCommand(t, { mode: 'sibling', sibling, witness, files: { committed: [['src/t1/new.js', 'hello\n']], uncommitted: [] } }) }), AETHER_LANE_HARNESSES: 'agy' }
  const brief = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(brief, ['Write src/t1/new.js saying hello and commit it.', `FAKE-AGY: answer ${IMPL_DONE}`, ''].join('\n'))
  repo.git('add', 'brief.md')
  repo.git('commit', '-q', '-m', 'brief')
  const integrationBefore = repo.git('rev-parse', 'HEAD')
  const r = runBin(LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/t1/**', '--tests', 'true', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json.status, 'no-candidate', JSON.stringify(json))
  assert.ok(json.tried.length > 0, 'every pair met the same detached work')
  for (const entry of json.tried) assert.equal(entry.cause, 'failed', JSON.stringify(entry))
  const branch = `aether/${json.id}/task-1`
  const detached = witnessHead(witness)
  // The unit branch is created from the integration tip and is not moved. removeUnit then deletes
  // it, so the branch's short sha is that tip, named in the reason, rather than a rev-parse after the fact.
  for (const fragment of ['detached', detached.slice(0, 7), integrationBefore.slice(0, 7), branch]) {
    assert.ok(json.reason.includes(fragment), `the reason names ${fragment}: ${json.reason}`)
  }
  assert.equal(fs.existsSync(packageOf(repo, json.id)), false, 'the reviewer package is not built')
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs', json.id, 'lanes', 'task-1-review-1')), false, 'nothing reaches the reviewer')
  assert.equal(repo.git('rev-parse', 'HEAD'), integrationBefore, 'the merge is not run')
})

test('a detached commit plus an uncommitted file ends with both committed on the branch (swarm path)', (t) => {
  const files = { committed: [['src/t1/a.js', 'one\n']], uncommitted: [['src/t1/b.js', 'two\n']] }
  const { repo, args, done, witness, branch } = swarmAttempt(t, { mode: 'ahead', files })
  assert.equal(done.status, 'ok', JSON.stringify(done))
  const detached = witnessHead(witness)
  assert.notEqual(branchOf(repo, branch), detached, 'the finish step committed on the branch')
  assert.equal(repo.git('rev-parse', `${branch}~1`), detached, 'the branch starts from the detached commit')
  assert.equal(repo.git('log', '-1', '--format=%s', branch), work.COMMIT_MESSAGE, 'the uncommitted file was committed by the finish step')
  assert.equal(repo.git('show', `${branch}:src/t1/a.js`), 'one')
  assert.equal(repo.git('show', `${branch}:src/t1/b.js`), 'two')
  const unit = path.join(repo.dir, '.aether', 'worktrees', args.runId, 'task-1')
  assert.equal(repo.git('-C', unit, 'status', '--porcelain'), '')
  assert.equal(attachedBranch(repo, unit), branch)
  assert.ok(fs.readFileSync(packageOf(repo, args.runId), 'utf8').includes('src/t1/b.js'), 'the package holds the finished file')
  assert.equal(wt.merge(repo.dir, args.runId, 'task-1').merged, true)
  assert.equal(repo.git('show', `${args.integration.branch}:src/t1/b.js`), 'two')
})

test('a detached commit plus an uncommitted file ends with both committed on the branch (delegate path)', (t) => {
  const files = { committed: [['src/t1/a.js', 'one\n']], uncommitted: [['src/t1/b.js', 'two\n']] }
  const { repo, json, witness } = delegateAttempt(t, { mode: 'ahead', files })
  assert.equal(json.status, 'done', JSON.stringify(json))
  const detached = witnessHead(witness)
  assert.notEqual(json.head, detached)
  assert.equal(repo.git('rev-parse', `${json.branch}~1`), detached, 'the branch starts from the detached commit')
  assert.equal(repo.git('show', `${json.branch}:src/t1/b.js`), 'two')
  assert.ok(fs.readFileSync(packageOf(repo, json.id), 'utf8').includes('src/t1/b.js'), 'the package holds the finished file')
  assert.equal(wt.merge(repo.dir, json.id, 'task-1').merged, true)
})

test('a detached commit touching a path outside Owns ends as a violation, with the branch moved first (swarm path)', (t) => {
  const { repo, args, done, witness, branch, before } = swarmAttempt(t, { mode: 'ahead', files: { committed: [['other/outside.js', 'x\n']], uncommitted: [] } })
  assert.equal(done.status, 'violation', JSON.stringify(done))
  assert.deepEqual(done.files, ['other/outside.js'])
  assert.notEqual(branchOf(repo, branch), before, 'the branch moved before the Owns check')
  assert.equal(branchOf(repo, branch), witnessHead(witness), 'the branch moved to the detached commit')
  assert.equal(fs.existsSync(packageOf(repo, args.runId)), false, 'the reviewer package is not built')
})

test('a detached commit touching a path outside Owns ends as a violation, with the branch moved first (delegate path)', (t) => {
  const moves = path.join(tempDir(t, 'aether-moves-'), 'refs.log')
  const { repo, json, integrationBefore, witness } = delegateAttempt(t, {
    mode: 'ahead',
    files: { committed: [['other/outside.js', 'x\n']], uncommitted: [] },
    prepare: (target) => recordRefUpdates(target, moves),
  })
  assert.equal(json.status, 'no-candidate', JSON.stringify(json))
  assert.ok(json.tried.length > 0)
  for (const entry of json.tried) assert.equal(entry.cause, 'violation', JSON.stringify(entry))
  const saved = fs.readFileSync(json.tried[0].patch, 'utf8')
  assert.ok(saved.includes('other/outside.js'), 'the salvaged patch holds the work the moved branch saw')
  // removeUnit deletes the unit branch after salvage, so `git rev-parse <branch>` cannot be asserted
  // afterwards. The patch is a worktree diff and would list the file even if the branch had stayed put.
  // The hook saw the ref while it existed: reattachDetached points it at the detached commit before checkOwns.
  const detachedHeads = fs.readFileSync(witness, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).head)
  const ref = `refs/heads/aether/${json.id}/task-1`
  const log = fs.readFileSync(moves, 'utf8')
  assert.deepEqual(movedRefs(log, ref, integrationBefore), detachedHeads, `the branch moved to each detached commit before the Owns check:\n${log}`)
  assert.equal(fs.existsSync(packageOf(repo, json.id)), false, 'the reviewer package is not built')
  assert.equal(repo.git('rev-parse', 'HEAD'), integrationBefore, 'the merge is not run')
})

test('an attached HEAD moves nothing, and the result line names the branch and its commit', async (t) => {
  const { repo, args } = fx.laneRun(t)
  const unit = work.prepareImplementer(repo.dir, args.runId, 'task-1').workdir
  const branch = run.unitBranch(args.runId, 'task-1')
  assert.deepEqual(work.reattachDetached(unit, branch), { moved: false })

  const attached = swarmAttempt(t, { mode: 'attached', files: { committed: [['src/t1/new.js', 'hello\n']], uncommitted: [] } })
  assert.equal(attached.done.status, 'ok', JSON.stringify(attached.done))
  assert.equal(attached.done.result.head, branchOf(attached.repo, attached.branch), 'the swarm result names the commit the branch is at')

  const head = attached.repo.git('rev-parse', 'HEAD')
  const dataDir = tempDir(t, 'aether-data-')
  const brief = path.join(dataDir, 'brief.md')
  fs.writeFileSync(brief, 'Write src/new.js.\n')
  fs.mkdirSync(path.join(attached.repo.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(attached.repo.dir, 'src', 'new.js'), 'hello\n')
  const file = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({
    id: 't1', session: 's1', cwd: attached.repo.dir, attempt: 1, step: 'haiku', effort: 'high', launchKind: 'first',
    edits: true, owns: ['src/**'], tests: 'true', brief, findings: null, carry: null, pin: null,
    base: head, harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' },
    task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000,
  }))
  const done = { status: 'done', id: 'run1', run: 'run1', branch: 'aether/run1/task-1', worktree: attached.repo.dir, head, base: head, pair: PAIR, summary: 'wrote it', tests: OK_TESTS, review: null, merge: 'aether-wt merge run1 task-1' }
  const result = await dr.runTask({ id: 't1', cwd: attached.repo.dir, dataDir }, { delegateCommand: async () => done })
  assert.equal(result.ok, true)
  assert.ok(result.text.includes(`Branch: aether/run1/task-1 at ${head}`), result.text)
})

test('the brief of an editing delegate on another harness never asks for checkout --detach', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const cwd = tempDir(t, 'aether-cwd-')
  const home = tempDir(t, 'aether-home-')
  let n = 0
  const deps = {
    dataDir, cwd, home,
    now: () => 1000 + (n += 1),
    settings: { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } },
    newId: () => `gen-${n}`,
    pickPair: async () => ({ pick: { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }, quota: [] }),
  }
  const prompt = 'AETHER-TASK: t-detach\nAETHER-OWNS: src/**\nWrite src/new.js saying hello and commit it.'
  const plan = await dt.begin({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } }, deps)
  assert.ok(plan.external, 'the task runs on another harness')
  const briefs = path.join(dataDir, 'delegates', 'briefs')
  const names = fs.readdirSync(briefs)
  assert.equal(names.length, 1, 'the system assembled one brief file')
  const briefText = fs.readFileSync(path.join(briefs, names[0]), 'utf8')
  assert.ok(!briefText.includes('checkout --detach'), 'the assembled brief never asks for checkout --detach')
  const externals = path.join(dataDir, 'delegates', 'external')
  const ext = JSON.parse(fs.readFileSync(path.join(externals, fs.readdirSync(externals)[0]), 'utf8'))
  assert.ok(!ext.task.prompt.includes('checkout --detach'), 'the external task prompt never asks for checkout --detach')
  // The Lead rules shipped as skills must not ask for it either.
  const skills = path.join(__dirname, '..', 'plugins', 'aether', 'skills')
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name === 'SKILL.md' && fs.readFileSync(full, 'utf8').includes('checkout --detach')) found.push(path.relative(skills, full))
    }
  }
  walk(skills)
  assert.deepEqual(found, [], 'no skill asks for checkout --detach')
})

