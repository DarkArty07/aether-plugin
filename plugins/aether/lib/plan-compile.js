'use strict'

// Checks and compiles Aether plans and briefs for an execution run.
// Called by bin/aether-plan to validate plans and build run graphs.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { parsePlan, buildGraph, renderBrief, specObjective, requirementsOf, traceability } = require('./plan.js')
const { repoPaths, currentBranch, head } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const superdelegation = require('./superdelegation.js')
const { loadPairs } = require('./pairs.js')
const baseline = require('./baseline.js')
const wt = require('./worktrees.js')

const USAGE =
  'usage: aether-plan check <plan.md> | aether-plan compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main] [--no-lanes] [--no-baseline]'

function fail(errors, warnings = [], stdout = process.stdout) {
  stdout.write(JSON.stringify({ ok: false, errors, warnings }) + '\n')
  process.exit(1)
}

function flagValue(args, name, message, stdout) {
  const i = args.indexOf(name)
  if (i === -1) return null
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) fail([message], [], stdout)
  return value
}

function load(planArg, stdout) {
  if (!planArg) fail([USAGE], [], stdout)
  const planPath = path.resolve(planArg)
  if (!fs.existsSync(planPath)) fail([`plan not found: ${planPath}`], [], stdout)
  return { planPath, parsed: parsePlan(fs.readFileSync(planPath, 'utf8')) }
}

function isFile(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false })
  return Boolean(stat && stat.isFile())
}

function nameInWorktree(file, worktree) {
  const rel = path.relative(worktree, file)
  return rel.split(path.sep)[0] === '..' ? file : rel
}

function planSpec(parsedSpec, planPath, worktree) {
  if (parsedSpec) {
    if (path.isAbsolute(parsedSpec) || isFile(path.join(worktree, parsedSpec))) return parsedSpec
    const beside = path.join(path.dirname(planPath), parsedSpec)
    return isFile(beside) ? nameInWorktree(beside, worktree) : parsedSpec
  }
  const sibling = path.join(path.dirname(planPath), 'spec.md')
  return isFile(sibling) ? nameInWorktree(sibling, worktree) : null
}

function worktreeOf(cwd) {
  try {
    return repoPaths(cwd).worktree
  } catch {
    return cwd
  }
}

function specRequirements(parsedSpec, planPath, cwd) {
  const worktree = worktreeOf(cwd)
  const spec = planSpec(parsedSpec, planPath, worktree)
  if (!spec) return []
  try {
    return requirementsOf(fs.readFileSync(path.isAbsolute(spec) ? spec : path.join(worktree, spec), 'utf8'))
  } catch {
    return []
  }
}

function check(planArg, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const { planPath, parsed } = load(planArg, stdout)
  const graph = buildGraph(parsed)
  const trace = traceability(parsed, specRequirements(parsed.spec, planPath, cwd))
  const errors = [...parsed.errors, ...graph.errors, ...trace.errors]
  const warnings = [...graph.warnings, ...trace.warnings]
  if (errors.length) fail(errors, warnings, stdout)
  stdout.write(JSON.stringify({ ok: true, tasks: Object.keys(graph.tasks).length, waves: graph.waves, warnings }) + '\n')
}

const BASELINE_TIMEOUT_MS = 10 * 60 * 1000

function recordBaseline(cwd, testCommand) {
  const started = Date.now()
  const r = spawnSync(testCommand, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: BASELINE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    recordedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: r.status,
    signatures: baseline.failureSignatures(`${r.stdout || ''}\n${r.stderr || ''}`),
    timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT'),
  }
}

function baselineMessage({ exitCode, signatures }) {
  if (exitCode === 0) return 'the test command passed'
  if (signatures.length > 0) {
    return `${signatures.length} failing tests already fail before the run; only new failures block a merge`
  }
  return 'the test command failed and names no test, so any failure blocks a merge'
}

function compile(planArg, rest, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const { planPath, parsed } = load(planArg, stdout)
  const onlyValue = flagValue(rest, '--only', '--only needs a comma-separated list of tasks, such as task-2,task-3.', stdout)
  let only = onlyValue === null ? null : onlyValue.split(',').map((s) => s.trim()).filter(Boolean)
  const runValue = flagValue(rest, '--run', '--run needs a run id.', stdout)

  const repo = repoPaths(cwd)
  const branch = currentBranch(cwd)
  if (!branch) fail(['the integration worktree has a detached HEAD; check out the integration branch first'], [], stdout)
  if (['main', 'master'].includes(branch) && !rest.includes('--allow-main')) {
    fail([`refusing to compile on ${branch}: run aether-plan from the integration worktree, or pass --allow-main`], [], stdout)
  }

  const runId = runValue === null ? run.newRunId() : runValue
  run.assertRunId(runId)
  const dir = run.runDir(repo.mainRoot, runId)
  const graphFile = path.join(dir, 'graph.json')
  const priorIntegration = fs.existsSync(graphFile) ? run.readJson(graphFile).integration : null

  let alreadyMerged = null
  if (runValue !== null && fs.existsSync(graphFile) && only === null) {
    const merged = new Set(wt.mergedUnits(cwd, runId))
    const planTaskIds = parsed.tasks.map((t) => `task-${t.number}`)
    const intersect = planTaskIds.filter((id) => merged.has(id))
    if (intersect.length > 0) {
      alreadyMerged = intersect
      for (const id of alreadyMerged) {
        process.stderr.write(`aether-plan: ${id} is already merged in run ${runId}; it is not relaunched\n`)
      }
      only = planTaskIds.filter((id) => !merged.has(id))
    }
  }

  const graph = alreadyMerged && only.length === 0 ? { waves: [], tasks: {}, errors: [], warnings: [] } : buildGraph(parsed, { only })
  const errors = [...parsed.errors, ...graph.errors]
  if (errors.length) fail(errors, graph.warnings, stdout)

  const enabled = superdelegation.enabled()
  if (!rest.includes('--no-lanes') && !enabled.on) {
    process.stderr.write(
      enabled.reason === 'platform'
        ? 'aether-plan: superdelegation is off: superdelegation needs Linux\n'
        : "aether-plan: superdelegation is off: the aether plugin's superdelegation option is not on\n",
    )
  }

  let laneArgs = null
  if (!rest.includes('--no-lanes') && enabled.on) {
    const config = lanes.loadConfig(lanes.configPath())
    const { pairs } = loadPairs()
    const options = { installed: (name, harness) => lanes.commandInstalled(harness.command), enabled: lanes.enabledHarnesses() }
    laneArgs = superdelegation.runArgs(config, pairs, options)
    for (const { name, reason } of superdelegation.idleHarnesses(config, pairs, options)) {
      process.stderr.write(`aether-plan: superdelegation: ${name} is enabled but ${reason}\n`)
    }
  }

  run.ensureExcluded(repo.gitCommonDir)

  const spec = planSpec(parsed.spec, planPath, repo.worktree)
  let objective = null
  if (spec) {
    try {
      objective = specObjective(fs.readFileSync(path.isAbsolute(spec) ? spec : path.join(repo.worktree, spec), 'utf8'))
    } catch {
      objective = null
    }
  }
  const tasks = {}
  for (const t of parsed.tasks) {
    const id = `task-${t.number}`
    if (!graph.tasks[id]) continue
    const brief = path.join(dir, 'briefs', `${id}.md`)
    fs.mkdirSync(path.dirname(brief), { recursive: true })
    fs.writeFileSync(brief, renderBrief(t, { planPath, spec, globalConstraints: parsed.globalConstraints, objective }))
    tasks[id] = { ...graph.tasks[id], brief }
  }

  const base = head(cwd)
  const args = {
    runId,
    binDir: path.join(__dirname, '..', 'bin'),
    repoRoot: repo.mainRoot,
    runDir: dir,
    plan: planPath,
    spec,
    integration: {
      branch,
      worktree: repo.worktree,
      base,
      firstBase: priorIntegration?.firstBase || priorIntegration?.base || base,
    },
    testCommand: parsed.execution.testCommand,
    ladder: parsed.execution.ladder,
    maxAgents: parsed.execution.maxAgents,
    waves: graph.waves,
    tasks,
    ...(alreadyMerged ? { alreadyMerged } : {}),
    lanes: laneArgs,
  }

  const baselineFile = path.join(dir, 'baseline.json')
  if (!rest.includes('--no-baseline') && !fs.existsSync(baselineFile)) {
    const recorded = recordBaseline(repo.worktree, parsed.execution.testCommand)
    run.writeJson(baselineFile, recorded)
    process.stderr.write(`aether-plan: test baseline: ${baselineMessage(recorded)}\n`)
    if (recorded.durationMs > 540000) {
      process.stderr.write(
        `aether-plan: warning: the test command took ${Math.round(recorded.durationMs / 1000)}s for the baseline; a merge runs it under a 600s limit, so merges may be stopped at the limit with their test run unfinished\n`,
      )
    }
  }
  run.writeJson(graphFile, args)

  const statePath = path.join(dir, 'state.json')
  const previous = fs.existsSync(statePath) ? run.readJson(statePath) : null
  const resultPath = path.join(dir, 'result.json')
  if (fs.existsSync(resultPath)) {
    let k = 1
    while (fs.existsSync(path.join(dir, `result-${k}.json`))) k++
    fs.renameSync(resultPath, path.join(dir, `result-${k}.json`))
  }
  run.writeJson(statePath, {
    runId,
    status: 'compiled',
    plan: planPath,
    compiledAt: previous && previous.compiledAt ? previous.compiledAt : new Date().toISOString(),
    launches: previous ? (previous.launches || 1) + 1 : 1,
  })
  const warnings = [...graph.warnings]
  if (repo.worktree === repo.mainRoot) {
    warnings.push(
      'the integration worktree is the main checkout, so the unit worktrees under .aether/worktrees/ sit inside it, and a test command that searches the whole tree also runs their unfinished tests at merge time. Prefer a separate integration worktree (git worktree add <path> -b <branch>).',
    )
  }
  for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`)
  stdout.write(JSON.stringify(args) + '\n')
}

function main(argv, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const [command, planArg, ...rest] = argv
  try {
    if (command === 'check') check(planArg, { cwd, stdout })
    else if (command === 'compile') compile(planArg, rest, { cwd, stdout })
    else fail([USAGE], [], stdout)
  } catch (err) {
    fail([err.message], [], stdout)
  }
}

module.exports = {
  main,
  check,
  compile,
  load,
  baselineMessage,
}
