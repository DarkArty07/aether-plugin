'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin, tempDir, NO_LANES_CONFIG, compile, commitIn } = require('./helpers.js')
const { task, plan, specKitTasks } = require('./plan-fixtures.js')
const { CONFIG_FILE, loadConfig } = require('../plugins/aether/lib/lanes.js')
const { runArgs } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

test('check prints the waves of a valid plan', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json, { ok: true, tasks: 3, waves: [['task-1', 'task-3'], ['task-2']], warnings: [] })
})

test('check exits 1 and lists every error', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1)], { execution: [] }))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.deepEqual(r.json.errors, ['Aether Execution: "Test command" is missing.'])
})

test('compile writes the graph, briefs and state for the integration branch', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const args = r.json
  assert.match(args.runId, /^\d{8}-\d{6}-[0-9a-f]{4}$/)
  assert.equal(args.repoRoot, repo.dir)
  // The run's commands run this same version's bins (issue 008).
  assert.equal(args.binDir, path.dirname(PLAN_BIN))
  assert.equal(args.runDir, path.join(repo.dir, '.aether', 'runs', args.runId))
  const head = repo.git('rev-parse', 'HEAD')
  assert.deepEqual(args.integration, { branch: 'feature/x', worktree: repo.dir, base: head, firstBase: head })
  assert.deepEqual(args.waves, [['task-1', 'task-3'], ['task-2']])
  assert.equal(args.testCommand, 'true')
  assert.deepEqual(args.ladder, { haiku: 2, sonnet: 2, opus: 1 })
  assert.equal(args.maxAgents, 200)
  assert.equal(args.tasks['task-2'].brief, path.join(args.runDir, 'briefs', 'task-2.md'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(args.runDir, 'graph.json'), 'utf8')), args)
  assert.equal(JSON.parse(fs.readFileSync(path.join(args.runDir, 'state.json'), 'utf8')).status, 'compiled')
  assert.match(fs.readFileSync(args.tasks['task-2'].brief, 'utf8'), /### Task 2: Task 2 title/)
  assert.equal(repo.git('status', '--porcelain'), '?? plan.md')
})

test('compile refuses main unless --allow-main, and refuses a detached HEAD', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  repo.git('switch', '-q', 'main')
  let r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /refusing to compile on main/)
  r = runBin(PLAN_BIN, ['compile', file, '--allow-main'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  repo.git('switch', '-q', '--detach', 'HEAD')
  r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /detached HEAD/)
})

test('compile --run reuses a run id and --only narrows the tasks', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir).json
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.runId, '--only', 'task-2'], repo.dir)
  assert.equal(again.status, 0, again.stdout)
  assert.equal(again.json.runId, first.runId)
  assert.deepEqual(again.json.waves, [['task-2']])
  assert.deepEqual(Object.keys(again.json.tasks), ['task-2'])
})

test('compile refuses an invalid run id', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const r = runBin(PLAN_BIN, ['compile', file, '--run', '../evil'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /invalid run id/)
})

test('compile refuses --only or --run without a value, and creates no run', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  let r = runBin(PLAN_BIN, ['compile', file, '--only'], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['--only needs a comma-separated list of tasks, such as task-2,task-3.'])
  r = runBin(PLAN_BIN, ['compile', file, '--only', '--allow-main'], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['--only needs a comma-separated list of tasks, such as task-2,task-3.'])
  r = runBin(PLAN_BIN, ['compile', file, '--only', ''], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['The selection names no tasks.'])
  r = runBin(PLAN_BIN, ['compile', file, '--run'], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['--run needs a run id.'])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether')), false)
})

test('compile warns when the integration worktree is the main checkout, and not from a linked worktree', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  repo.git('add', 'plan.md')
  repo.git('commit', '-q', '-m', 'plan')
  let r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stderr, /warning: the integration worktree is the main checkout/)
  assert.ok(r.stderr.includes('Prefer a separate integration worktree (git worktree add <path> -b <branch>).\n'), r.stderr)
  assert.doesNotMatch(r.stderr, /using-git-worktrees/)
  const linked = path.join(repo.dir, '.worktrees', 'feature-y')
  repo.git('worktree', 'add', '-q', '-b', 'feature/y', linked)
  r = runBin(PLAN_BIN, ['compile', path.join(linked, 'plan.md')], linked)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.integration.worktree, linked)
  assert.doesNotMatch(r.stderr, /main checkout/)
})

test('compile takes a spec.md beside a Spec Kit tasks.md as the spec, when the plan names none', (t) => {
  const repo = makeRepo(t)
  const dir = path.join(repo.dir, 'specs', '001-demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), '# Demo\n')
  const file = path.join(dir, 'tasks.md')
  fs.writeFileSync(file, specKitTasks([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)], { spec: null }))
  const checked = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(checked.status, 0, checked.stdout)
  assert.deepEqual(checked.json, { ok: true, tasks: 3, waves: [['task-1', 'task-3'], ['task-2']], warnings: [] })
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.spec, 'specs/001-demo/spec.md')
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Spec: specs\/001-demo\/spec\.md$/m)
})

test('compile reads a Spec line that links a file beside the plan as that file, named from the worktree', (t) => {
  // The Aether preset's tasks.md links its spec as [spec.md](spec.md), relative to the plan's folder.
  const repo = makeRepo(t)
  const file = path.join(repo.dir, 'specs', '004-linked', 'tasks.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(path.join(path.dirname(file), 'spec.md'), '# Demo\n')
  fs.writeFileSync(file, specKitTasks([task(1), task(2)], { spec: '**Spec:** [spec.md](spec.md)' }))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.spec, 'specs/004-linked/spec.md')
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Spec: specs\/004-linked\/spec\.md$/m)
})

test("compile puts the spec's intent and criteria in every brief, and no section when the spec has none or is missing", (t) => {
  const repo = makeRepo(t)
  const dir = path.join(repo.dir, 'specs', '002-quality')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'spec.md'),
    ['# Quality', '', '- Intent: a game that feels alive.', '  - «mas creativo, mas divertido»', '', '## Criteria', '', '- C1: It animates. Evidence: a person plays it.', ''].join('\n'),
  )
  const file = path.join(dir, 'tasks.md')
  fs.writeFileSync(file, specKitTasks([task(1), task(2)], { spec: null }))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  for (const id of ['task-1', 'task-2']) {
    const brief = fs.readFileSync(r.json.tasks[id].brief, 'utf8')
    assert.match(brief, /^## What the spec asks for$/m)
    assert.ok(brief.includes('- Intent: a game that feels alive.'), brief)
    assert.ok(brief.includes('«mas creativo, mas divertido»'), brief)
    assert.ok(brief.includes('- C1: It animates.'), brief)
    assert.ok(brief.indexOf('## What the spec asks for') < brief.indexOf('## Task'))
  }

  // A spec with neither, and a spec that is named but missing, add nothing.
  const bare = path.join(repo.dir, 'specs', '003-bare')
  fs.mkdirSync(bare, { recursive: true })
  fs.writeFileSync(path.join(bare, 'spec.md'), '# Bare\n\nOnly prose.\n')
  const bareTasks = path.join(bare, 'tasks.md')
  fs.writeFileSync(bareTasks, specKitTasks([task(1), task(2)], { spec: null }))
  const none = runBin(PLAN_BIN, ['compile', bareTasks], repo.dir)
  assert.equal(none.status, 0, none.stdout + none.stderr)
  assert.equal(fs.readFileSync(none.json.tasks['task-1'].brief, 'utf8').includes('What the spec asks for'), false)
  const named = path.join(repo.dir, 'plan-missing.md')
  fs.writeFileSync(named, specKitTasks([task(1), task(2)], { spec: '**Spec:** `docs/nowhere.md`' }))
  const missing = runBin(PLAN_BIN, ['compile', named], repo.dir)
  assert.equal(missing.status, 0, missing.stdout + missing.stderr)
  assert.equal(fs.readFileSync(missing.json.tasks['task-1'].brief, 'utf8').includes('What the spec asks for'), false)
})

test('compile keeps a Spec line over a spec.md beside the plan, and names no spec when there is neither', (t) => {
  const repo = makeRepo(t)
  const named = path.join(repo.dir, 'specs', '002-named', 'tasks.md')
  fs.mkdirSync(path.dirname(named), { recursive: true })
  fs.writeFileSync(path.join(path.dirname(named), 'spec.md'), '# Demo\n')
  fs.writeFileSync(named, specKitTasks([task(1), task(2)], { spec: '**Spec:** `docs/spec.md`' }))
  let r = runBin(PLAN_BIN, ['compile', named], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.spec, 'docs/spec.md')
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Spec: docs\/spec\.md$/m)

  const bare = path.join(repo.dir, 'specs', '003-bare', 'tasks.md')
  fs.mkdirSync(path.dirname(bare), { recursive: true })
  fs.writeFileSync(bare, specKitTasks([task(1), task(2)], { spec: null }))
  r = runBin(PLAN_BIN, ['compile', bare], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.spec, null)
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Spec: not named in the plan$/m)
})

test('compile --run on an existing run keeps its first compile time and archives the last result', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir).json
  const statePath = path.join(first.runDir, 'state.json')
  const firstState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.equal(firstState.launches, 1)
  for (const launch of [1, 2]) {
    fs.writeFileSync(path.join(first.runDir, 'result.json'), `{"launch":${launch}}`)
    const r = runBin(PLAN_BIN, ['compile', file, '--run', first.runId, '--only', 'task-2'], repo.dir)
    assert.equal(r.status, 0, r.stdout)
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.equal(state.compiledAt, firstState.compiledAt)
  assert.equal(state.launches, 3)
  assert.equal(fs.readFileSync(path.join(first.runDir, 'result-1.json'), 'utf8'), '{"launch":1}')
  assert.equal(fs.readFileSync(path.join(first.runDir, 'result-2.json'), 'utf8'), '{"launch":2}')
  assert.equal(fs.existsSync(path.join(first.runDir, 'result.json')), false)
})

test('compile gives every task its effort and review, and the brief its starting rung', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet high — wiring the tests pin down', review: 'xhigh — UI states' })]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(
    ['task-1', 'task-2'].map((id) => [r.json.tasks[id].tier, r.json.tasks[id].effort, r.json.tasks[id].review]),
    [
      ['haiku', 'xhigh', 'high'],
      ['sonnet', 'high', 'xhigh'],
    ],
  )
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Tier: haiku xhigh — complete code$/m)
})

test('check refuses Sonnet below high with its message, and no other', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet medium — x' })]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['Task 2: sonnet medium is not used for implementers; Sonnet and Opus run at high, xhigh or max.'])
})

// A lane table whose agy is `command`, in a temporary directory.
function laneTable(t, command) {
  const dir = tempDir(t)
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  config.harnesses.agy.command = command(dir)
  const file = path.join(dir, 'lanes.json')
  fs.writeFileSync(file, JSON.stringify(config))
  return file
}
function executable(dir) {
  const exe = path.join(dir, 'agy')
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n')
  fs.chmodSync(exe, 0o755)
  return exe
}

test('compile gives the run its lanes when superdelegation is on and the harness is there, and none with --no-lanes', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  const on = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(on.status, 0, on.stdout + on.stderr)
  assert.deepEqual(on.json.lanes, runArgs(loadConfig(file), loadPairs().pairs, { installed: () => true, enabled: ['agy'] }))
  assert.deepEqual(Object.keys(on.json.lanes), ['superdelegation', 'harnesses', 'waits'])
  assert.equal(Object.keys(on.json).pop(), 'lanes')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(on.json.runDir, 'graph.json'), 'utf8')).lanes, on.json.lanes)
  const off = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(off.status, 0, off.stdout + off.stderr)
  assert.equal(off.json.lanes, null)
})

test('compile gives no lanes when the harness is missing or there is no table', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const missing = laneTable(t, (dir) => path.join(dir, 'no-agy'))
  assert.equal(runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: missing }).json.lanes, null)
  assert.equal(runBin(PLAN_BIN, ['compile', md], repo.dir).json.lanes, null)
  assert.equal(fs.existsSync(NO_LANES_CONFIG), false)
  assert.equal(compile(repo, plan([task(1)])).lanes, null)
})

// The first executable called `name` on the host's PATH.
function onPath(name) {
  for (const dir of process.env.PATH.split(path.delimiter)) {
    const file = path.join(dir, name)
    try {
      fs.accessSync(file, fs.constants.X_OK)
      return file
    } catch {}
  }
  throw new Error(`${name} is not on the PATH`)
}

test('compile names each enabled harness that gives no call, and why, on stderr', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  const bin = tempDir(t)
  for (const name of ['codex', 'grok']) {
    fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 0\n')
    fs.chmodSync(path.join(bin, name), 0o755)
  }
  // The PATH is the stubs and git alone: a host that has cursor-agent installed must not change what is not found.
  fs.symlinkSync(onPath('git'), path.join(bin, 'git'))
  const env = { AETHER_LANES_CONFIG: file, AETHER_LANE_HARNESSES: 'codex,agy,cursor', PATH: bin }
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.lanes.harnesses, ['agy'])
  assert.ok(r.stderr.includes('aether-plan: superdelegation: codex is enabled but has no models in the lane table yet\n'), r.stderr)
  assert.ok(r.stderr.includes('aether-plan: superdelegation: cursor is enabled but is not installed: cursor-agent was not found\n'), r.stderr)
  // grok is installed but not enabled, and agy gives calls: neither is named.
  assert.ok(!/superdelegation: (grok|agy) /.test(r.stderr), r.stderr)
})

test('compile refuses a broken lane table before writing anything', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, '{')
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.ok(r.json.errors[0].startsWith(`lanes config ${file}: `), r.json.errors[0])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs')), false)
})

test('compile runs native, and says why on stderr, when superdelegation is off', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  for (const value of ['off', '']) {
    const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_SUPERDELEGATION: value })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.json.lanes, null)
    assert.ok(r.stderr.includes("aether-plan: superdelegation is off: the aether plugin's superdelegation option is not on\n"), r.stderr)
  }
  const quiet = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_SUPERDELEGATION: 'off' })
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr)
  assert.equal(quiet.json.lanes, null)
  assert.ok(!quiet.stderr.includes('superdelegation is off'), quiet.stderr)
})

test('with superdelegation off, a broken lane table is not even read', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, '{')
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_SUPERDELEGATION: 'off' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.lanes, null)
})

// A Test command line of a plan that prints each name as a failing TAP test, then exits 1.
function failingCommand(...names) {
  const script = [...names.map((name, i) => `console.log('not ok ${i + 1} - ${name}')`), 'process.exit(1)'].join('; ')
  return `- Test command: \`"${process.execPath}" -e "${script}"\``
}

test('compile records the test baseline of a passing test command', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const { recordedAt, durationMs, ...baseline } = JSON.parse(fs.readFileSync(path.join(r.json.runDir, 'baseline.json'), 'utf8'))
  assert.equal(typeof durationMs, 'number')
  assert.match(recordedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.deepEqual(baseline, { exitCode: 0, signatures: [], timedOut: false })
  assert.match(r.stderr, /^aether-plan: test baseline: the test command passed$/m)
})

test('compile records the failing tests of a failing test command, on stderr only', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)], { execution: [failingCommand('a', 'b')] }))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  const { recordedAt, durationMs, ...baseline } = JSON.parse(fs.readFileSync(path.join(r.json.runDir, 'baseline.json'), 'utf8'))
  assert.equal(typeof durationMs, 'number')
  assert.match(recordedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(baseline, { exitCode: 1, signatures: ['a', 'b'], timedOut: false })
  assert.match(
    r.stderr,
    /^aether-plan: test baseline: 2 failing tests already fail before the run; only new failures block a merge$/m,
  )
})

test('compile says that a failing test command which names no test blocks any failure', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)], { execution: ['- Test command: `echo boom; exit 3`'] }))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const baseline = JSON.parse(fs.readFileSync(path.join(r.json.runDir, 'baseline.json'), 'utf8'))
  assert.deepEqual([baseline.exitCode, baseline.signatures], [3, []])
  assert.match(
    r.stderr,
    /^aether-plan: test baseline: the test command failed and names no test, so any failure blocks a merge$/m,
  )
})

test('compile --no-baseline records no baseline', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)], { execution: [failingCommand('a')] }))
  const r = runBin(PLAN_BIN, ['compile', file, '--no-baseline'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(fs.existsSync(path.join(r.json.runDir, 'baseline.json')), false)
  assert.doesNotMatch(r.stderr, /test baseline/)
})

test('a relaunch keeps the first baseline, and its firstBase stays the first launch base', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)], { execution: [failingCommand('a')] }))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir).json
  const baselineFile = path.join(first.runDir, 'baseline.json')
  const firstBaseline = fs.readFileSync(baselineFile, 'utf8')
  commitIn(repo, repo.dir, 'src/t1/a.js', 'by hand\n', 'integrated by hand')
  const second = runBin(PLAN_BIN, ['compile', file, '--run', first.runId], repo.dir)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.equal(fs.readFileSync(baselineFile, 'utf8'), firstBaseline)
  assert.equal(second.json.integration.firstBase, first.integration.base)
  assert.equal(second.json.integration.base, repo.git('rev-parse', 'HEAD'))
  const third = runBin(PLAN_BIN, ['compile', file, '--run', first.runId], repo.dir)
  assert.equal(third.json.integration.firstBase, first.integration.base)
})
