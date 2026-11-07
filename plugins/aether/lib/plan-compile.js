'use strict'

// Checks and compiles Aether plans and briefs for an execution run.
// Called by bin/aether-plan to validate plans and build run graphs.
// Family: plan.

// aether-plan check <plan.md>
// aether-plan compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main] [--no-lanes] [--no-baseline]

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { parsePlan, buildGraph, renderBrief, specObjective, requirementsOf, traceability } = require('./plan.js')
const { applyGroups } = require('./plan-groups.js')
const { earlierMergedUnits } = require('./plan-scope.js')
const { planWarnings } = require('./plan-warnings.js')
const { isGlob, matchesAny } = require('./globs.js')
const { repoPaths, currentBranch, head } = require('./git.js')
const { resolveSkill, loadSkills, recordUse } = require('./skill-brief.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const superdelegation = require('./superdelegation.js')
const { loadPairs } = require('./pairs.js')
const { runShell } = require('./common.js')
const baseline = require('./baseline.js')
const wt = require('./worktrees.js')

const USAGE =
  'usage: aether-plan check <plan.md> | aether-plan compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main] [--no-lanes] [--no-baseline]'

function fail(errors, warnings = [], stdout = process.stdout) {
  stdout.write(JSON.stringify({ ok: false, errors, warnings }) + '\n')
  process.exit(1)
}

// The value after a flag, or null when the flag is absent. A flag with no value,
// or with another flag where its value belongs, fails with the given message.
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
  return { planPath, parsed: applyGroups(parsePlan(fs.readFileSync(planPath, 'utf8'))) }
}

function isFile(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false })
  return Boolean(stat && stat.isFile())
}

// A file is named the way a Spec line names it: relative to the integration worktree, where the run
// reads it, or by its full path when it is outside that worktree.
function nameInWorktree(file, worktree) {
  const rel = path.relative(worktree, file)
  return rel.split(path.sep)[0] === '..' ? file : rel
}

// The spec a plan names. A Spec line's path is read from the worktree; when nothing is there but the
// file sits beside the plan, as the Aether preset's [spec.md](spec.md) does, that file is the spec.
// Without a Spec line, a spec.md beside the plan stands in (Spec Kit's layout).
function planSpec(parsedSpec, planPath, worktree) {
  if (parsedSpec) {
    if (path.isAbsolute(parsedSpec) || isFile(path.join(worktree, parsedSpec))) return parsedSpec
    const beside = path.join(path.dirname(planPath), parsedSpec)
    return isFile(beside) ? nameInWorktree(beside, worktree) : parsedSpec
  }
  const sibling = path.join(path.dirname(planPath), 'spec.md')
  return isFile(sibling) ? nameInWorktree(sibling, worktree) : null
}

// The top of the working tree a check runs in; the working directory itself outside a git repository.
function worktreeOf(cwd) {
  try {
    return repoPaths(cwd).worktree
  } catch {
    return cwd
  }
}

// The requirement ids of the spec the plan names, read from the same file compile reads. Empty when
// there is no spec or it cannot be read: a check without a spec traces nothing.
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

// A doc, a changelog or a config file: the non-code files a task changes. A test that reads one must be
// in reach, or the merge refuses the unit that edits it and the ladder climbs a plan error (issue 179).
const DOC_SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.worktrees', '.claude'])
const DOC_MAX_SCANNED_FILES = 2000
const DOC_MAX_TEST_BYTES = 512 * 1024
const DOC_TEST_PATH = /(^|\/)tests\/|\.(test|spec)\.[^/]+$/
const DOC_PATH = /\.(md|mdx|txt|rst|adoc)$/i
const DOC_CONFIG_PATH = /\.(json|ya?ml|toml)$/i

function docIsTest(file) {
  return DOC_TEST_PATH.test(file)
}

function docIsDoc(file) {
  return !docIsTest(file) && (DOC_PATH.test(file) || DOC_CONFIG_PATH.test(file))
}

// The repo-relative paths of the files under root, in sorted order, up to the scan's limit.
function docFilesOf(root) {
  const files = []
  const visit = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= DOC_MAX_SCANNED_FILES) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!DOC_SKIP_DIRECTORIES.has(entry.name)) visit(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }
  visit(root)
  return files.map((file) => path.relative(root, file).split(path.sep).join('/'))
}

// The test files of the checkout under root, each with its path relative to root.
function docTestFilesOf(root) {
  return docFilesOf(root)
    .filter(docIsTest)
    .filter((rel) => {
      try {
        return fs.statSync(path.join(root, rel)).size < DOC_MAX_TEST_BYTES
      } catch {
        return false
      }
    })
}

// (No separate escape or dependency helpers here: the guard forbids duplicating the ones in
// plan-warnings.js, so both are inlined where they are used.)

// A path the brief names in backticks: the same shape the graph reads for its size warnings.
const DOC_NAMED_FILE = /(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9]+/g

function docNormalize(file) {
  return String(file).replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '')
}

// The doc files a task changes: a literal Owns entry, a glob Owns entry read against the checkout,
// or a path its brief names. A folder Owns entry holds every doc under it.
function docsOf(task, repoDocs) {
  const named = new Set()
  for (const pattern of task.owns) {
    if (isGlob(pattern)) {
      for (const doc of repoDocs) if (matchesAny(doc, [pattern])) named.add(doc)
    } else {
      const file = docNormalize(pattern)
      if (file === '') continue
      if (docIsDoc(file)) named.add(file)
      // A folder entry (docs/ normalizes to docs) names no doc file itself: it holds every doc under
      // it, matched the folder-aware way matchesAny matches a literal (globs.js). A literal doc file
      // matches only itself here, so reading both branches is harmless.
      for (const doc of repoDocs) if (matchesAny(doc, [pattern])) named.add(doc)
    }
  }
  for (const match of String(task.text || '').matchAll(DOC_NAMED_FILE)) {
    const file = docNormalize(match[0])
    if (docIsDoc(file)) named.add(file)
  }
  return named
}

// Whether the test's text reads the doc: the doc's repo-relative path in quotes, with the `./` and
// `../` prefixes a read from the test's folder needs. A bare mention without quotes is not a read.
function readsDoc(text, doc) {
  const quoted = String(doc).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`['"\`](?:\\.{1,2}/)*${quoted}['"\`]`)
  return pattern.test(text)
}

// One warning lists at most this many files; the rest are counted.
const DOC_LISTED = 5
const docListed = (items) =>
  (items.length > DOC_LISTED ? [...items.slice(0, DOC_LISTED), `and ${items.length - DOC_LISTED} more`] : items).join(', ')

// Each changed doc must come with the tests that read it: a test that reads a doc the task changes,
// and that the task and the tasks it depends on do not own, is warned about, one warning for each task.
// A heuristic: it reads names in quotes only, so a test that only mentions the doc stays quiet.
function docWarnings(parsed, root) {
  const repoDocs = docFilesOf(root).filter(docIsDoc)
  const tests = docTestFilesOf(root)
  const texts = new Map()
  const byNumber = new Map(parsed.tasks.map((task) => [task.number, task]))
  const warnings = []
  for (const task of parsed.tasks) {
    const docs = docsOf(task, repoDocs)
    if (docs.size === 0) continue
    // The tasks this one depends on, transitively, collected inline so no helper is duplicated.
    const seen = new Set()
    const stack = (task.dependsOn || []).map((d) => d.number)
    while (stack.length > 0) {
      const dep = stack.pop()
      if (seen.has(dep)) continue
      seen.add(dep)
      const found = byNumber.get(dep)
      if (found && Array.isArray(found.dependsOn)) for (const next of found.dependsOn) stack.push(next.number)
    }
    const covering = [task, ...[...seen].map((n) => byNumber.get(n)).filter(Boolean)]
    const sources = new Set()
    const left = new Map()
    for (const test of tests) {
      if (covering.some((owner) => matchesAny(test, owner.owns))) continue
      if (!texts.has(test)) {
        try {
          texts.set(test, fs.readFileSync(path.join(root, test), 'utf8'))
        } catch {
          continue
        }
      }
      for (const doc of docs) {
        if (!readsDoc(texts.get(test), doc)) continue
        sources.add(doc)
        const owner = parsed.tasks.find((other) => matchesAny(test, other.owns))
        left.set(test, owner ? `task ${owner.number} owns it` : 'no task owns it')
      }
    }
    if (left.size === 0) continue
    const items = [...left].map(([test, why]) => `${test} (${why})`)
    warnings.push(`Task ${task.number} changes ${docListed([...sources])} but not the tests that read them, which it and the tasks it depends on do not own: ${docListed(items)}`)
  }
  return warnings
}

function check(planArg, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const { planPath, parsed } = load(planArg, stdout)
  const graph = buildGraph(parsed)
  const trace = traceability(parsed, specRequirements(parsed.spec, planPath, cwd))
  const errors = [...parsed.errors, ...graph.errors, ...trace.errors]
  for (const t of (parsed.allTasks || parsed.tasks)) {
    if (t.skills && t.skills.length > 0) {
      if (t.skills.length > 3) {
        errors.push(`Task ${t.number}: Skills lists ${t.skills.length} skills (at most 3).`)
      }
      for (const name of t.skills) {
        if (!resolveSkill(name, { cwd, home: process.env.HOME || os.homedir() })) {
          errors.push(`Task ${t.number}: skill "${name}" does not exist.`)
        }
      }
    }
  }
  for (const t of parsed.tasks) {
    if (t.members && t.skills && t.skills.length > 3) {
      const msg = `Task ${t.number}: Skills lists ${t.skills.length} skills (at most 3).`
      if (!errors.includes(msg)) errors.push(msg)
    }
  }
  const root = worktreeOf(path.dirname(planPath))
  const warnings = [...parsed.warnings, ...graph.warnings, ...trace.warnings, ...planWarnings(parsed, root), ...docWarnings(parsed, root)]
  if (errors.length) fail(errors, warnings, stdout)
  // A plan with "Merges with" lines also says which tasks each unit holds.
  const groups = parsed.groups.map((g) => ({ unit: `task-${g.unit}`, tasks: g.members }))
  stdout.write(
    JSON.stringify({ ok: true, tasks: Object.keys(graph.tasks).length, waves: graph.waves, ...(groups.length ? { groups } : {}), warnings }) + '\n',
  )
}

const BASELINE_TIMEOUT_MS = 10 * 60 * 1000

// Runs the test command once, in the integration worktree, before the run's first merge. The failing
// tests it names are the baseline: a merge is blocked only by a failure that is not among them.
function recordBaseline(cwd, testCommand, { timeoutMs = BASELINE_TIMEOUT_MS } = {}) {
  const started = Date.now()
  const r = runShell(testCommand, { cwd, timeoutMs })
  return {
    recordedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: r.status,
    // A newline before the output stops a reporter that ends on an incomplete line from running together with the error count.
    signatures: baseline.failureSignatures(`${r.stdout || ''}\n${r.stderr || ''}`),
    timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT'),
  }
}

// Summary of a recorded baseline for stderr.
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
    // Read before the graph is written: a relaunch's graph keeps the first launch's base
    // and drops the units already merged so the run continues from where it stopped.
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
  if (errors.length) fail(errors, [...parsed.warnings, ...graph.warnings], stdout)

  const loadedSkills = new Map()
  const skillErrors = []
  for (const t of parsed.tasks) {
    const id = `task-${t.number}`
    if (!graph.tasks[id]) continue
    if (t.skills && t.skills.length > 0) {
      const res = loadSkills(t.skills, { cwd: repo.worktree, home: process.env.HOME || os.homedir() })
      if (!res.ok) {
        skillErrors.push(res.error)
      } else {
        loadedSkills.set(id, res.skills)
      }
    }
  }
  if (skillErrors.length > 0) fail(skillErrors, [...parsed.warnings, ...graph.warnings], stdout)

  // A unit named again after its ladder was spent (the task was fixed and reviewed) starts a new ladder.
  if (runValue !== null) {
    for (const id of require('./wt-ladder.js').resetSpent(dir, Object.keys(graph.tasks || {}))) {
      process.stderr.write(`aether-plan: ${id} had a spent ladder; it starts a new one (the old state is kept as ${id}.spent-N.json)\n`)
    }
  }

  const enabled = superdelegation.enabled()
  if (!rest.includes('--no-lanes') && !enabled.on) {
    process.stderr.write(
      enabled.reason === 'platform'
        ? 'aether-plan: superdelegation is off: superdelegation needs Linux\n'
        : "aether-plan: superdelegation is off: the aether plugin's superdelegation option is not on\n",
    )
  }

  // A lane table or a pairs table that fails to load throws here, before anything is written.
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
  // The spec's intent and criteria go into every brief (trial 2). A spec that cannot be read adds nothing.
  let objective = null
  if (spec) {
    try {
      objective = specObjective(fs.readFileSync(path.isAbsolute(spec) ? spec : path.join(repo.worktree, spec), 'utf8'))
    } catch {
      objective = null
    }
  }
  const tasks = {}
  const dataDir = run.dataDir()
  for (const t of parsed.tasks) {
    const id = `task-${t.number}`
    if (!graph.tasks[id]) continue
    const unitSkills = loadedSkills.get(id) || []
    const brief = path.join(dir, 'briefs', `${id}.md`)
    fs.mkdirSync(path.dirname(brief), { recursive: true })
    fs.writeFileSync(
      brief,
      renderBrief(t, {
        planPath,
        spec,
        globalConstraints: parsed.globalConstraints,
        objective,
        skills: unitSkills,
      }),
    )
    if (unitSkills.length > 0) {
      recordUse(dataDir, {
        session: process.env.CLAUDE_CODE_SESSION_ID || null,
        kind: 'run',
        run: runId,
        task: id,
        skills: unitSkills.map((s) => s.name),
      })
    }
    tasks[id] = { ...graph.tasks[id], brief }
  }

  // What the earlier launches merged, for the final review of this one (issue 122): a workflow cannot read the disk.
  // The previous launch's result.json is still in place here; it is renamed to result-<k>.json below.
  const earlierUnits = earlierMergedUnits(dir, tasks)
  // Units branch from the current head, but the run's first launch is where its changes begin.
  const base = head(cwd)
  const args = {
    runId,
    // This bin's own directory, so the run's commands run this same version in a
    // --plugin-dir session, whose PATH holds the installed release's bins (issue 008).
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
    maxAgents: parsed.execution.maxAgents,
    waves: graph.waves,
    tasks,
    ...(alreadyMerged ? { alreadyMerged } : {}),
    ...(earlierUnits.length > 0 ? { earlierUnits } : {}),
    lanes: laneArgs,
  }

  // Recorded once per run, before its first merge. A relaunch keeps the baseline it already has.
  const baselineFile = path.join(dir, 'baseline.json')
  if (!rest.includes('--no-baseline') && !fs.existsSync(baselineFile)) {
    const recorded = recordBaseline(repo.worktree, parsed.execution.testCommand)
    run.writeJson(baselineFile, recorded)
    process.stderr.write(`aether-plan: test baseline: ${baselineMessage(recorded)}\n`)
    // A merge runs the same command under the mod's ten-minute limit (issue 002, proposal 5).
    if (recorded.durationMs > 540000) {
      process.stderr.write(
        `aether-plan: warning: the test command took ${Math.round(recorded.durationMs / 1000)}s for the baseline; a merge runs it under a 600s limit, so merges may be stopped at the limit with their test run unfinished\n`,
      )
    }
  }
  run.writeJson(graphFile, args)
  // graph.json keeps only this launch's units; units.json keeps every launch's, for the next compile (issue #111).
  run.extendUnits(dir, graph.tasks)

  // A relaunch of a run keeps its first compile time, so the report covers every launch, and keeps
  // the previous launch's result as result-<k>.json.
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
  const compileRoot = worktreeOf(path.dirname(planPath))
  const warnings = [...parsed.warnings, ...graph.warnings, ...planWarnings(parsed, compileRoot), ...docWarnings(parsed, compileRoot)]
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
  recordBaseline,
}
