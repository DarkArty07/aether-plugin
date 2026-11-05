'use strict'

// The whole automated analysis: the project's own tools under snapshots plus the read-only checks.
// Family: audit.

const { git } = require('./git.js')
const { parseArgs, usageError } = require('./audit-common.js')
const { redact } = require('./audit-scan.js')
const { runCommand } = require('./audit-exec.js')
const { dataDir } = require('./run.js')
const store = require('./audit-store.js')
const snap = require('./audit-snapshot.js')
const scan = require('./audit-scan.js')
const github = require('./audit-github.js')
const tools = require('./audit-tools.js')

const STEP_LABELS = { tests: 'tests', lint: 'linter', dependencies: 'dependency audit' }

function topOfWorktree(cwd) {
  let out = null
  try {
    out = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
  } catch {
    return null
  }
  if (out === null || out.status !== 0 || out.stdout === '') return null
  return out.stdout
}

function resolveNow(now) {
  if (typeof now === 'function') return now()
  if (now instanceof Date) return now
  if (now !== undefined && now !== null) return new Date(now)
  return new Date()
}

function changedFiles(items) {
  const files = []
  for (const item of items) {
    for (const file of item.files || []) {
      if (!files.includes(file)) files.push(file)
    }
  }
  return files
}

function findingOfStep(step, items, check, index) {
  const files = changedFiles(items)
  const first = files[0] || '.git'
  const label = STEP_LABELS[step] || step
  const kinds = items.map((item) => `${item.kind}: ${(item.files || []).join(', ')}`).join('; ')
  return {
    id: `AUDIT-${index + 1}`,
    topic: 'hygiene',
    title: `Running the ${label} changed the project`,
    claim: `running the ${label} changed ${files.join(', ') || 'the project'}`,
    location: { file: first, line: 1 },
    type: 'risk',
    trigger: redact(`the audit ran ${(check !== null && check.command) || step}`),
    evidence: kinds,
    impact: 'the audit changed the project instead of only reading it',
    rootCause: `running the ${label} changes the ${[...new Set(items.map((item) => item.kind))].join(", ")} of the project`,
    verification: 'proven',
    status: 'verified',
    causeKey: `audit-changed-project-${step}`,
    source: 'analysis',
  }
}

// analyze(root, opts, ctx) -> the whole automated analysis of the project at root.
async function analyze(root, opts = {}, ctx = {}) {
  const timeoutMs = opts.timeoutSeconds === undefined || opts.timeoutSeconds === null ? 300000 : opts.timeoutSeconds * 1000
  const toolCtx = {
    exec: ctx.exec || runCommand,
    env: ctx.env || {},
    timeoutMs,
    noTests: opts.noTests === true,
    testsCommand: opts.testsCommand === undefined ? null : opts.testsCommand,
  }
  const steps = [
    { name: 'tests', run: () => tools.runTests(root, toolCtx) },
    { name: 'lint', run: () => tools.runLint(root, toolCtx) },
    { name: 'dependencies', run: () => tools.runAudit(root, toolCtx) },
  ]
  const { results, changes } = await snap.withSnapshots(root, steps)
  const [tests, lint, dependencies] = results
  const nowValue = resolveNow(ctx.now)
  const secrets = await scan.secrets(root)
  const todos = scan.todos(root)
  const branches = scan.branches(root, { now: nowValue })
  const ghCtx = { exec: toolCtx.exec, env: toolCtx.env, now: nowValue }
  const issues = await github.issues(root, ghCtx)
  const prs = await github.prs(root, ghCtx)
  const hotspots = scan.hotspots(root)
  const identity = store.identityOf(root)
  const project = {
    name: identity.name,
    key: identity.key,
    identity: identity.identity,
    remote: identity.remote,
    root: identity.root,
    defaultBranch: branches.state === 'result' ? branches.default : null,
  }
  const checkByStep = { tests, lint, dependencies }
  const selfFindings = changes.attributed.map((entry, index) => findingOfStep(entry.step, entry.items, checkByStep[entry.step] || null, index))
  const directory = ctx.dataDir || dataDir(toolCtx.env)
  return {
    ok: true,
    version: 1,
    generatedAt: nowValue.toISOString(),
    project,
    checks: { tests, lint, dependencies, secrets, todos, branches, issues, prs, hotspots },
    changes,
    selfFindings,
    estimate: store.estimate(directory),
  }
}

// command(args, ctx) -> runs the analysis in the worktree top of ctx.cwd.
async function command(args, ctx) {
  const parsed = parseArgs(args, { values: ['tests-command', 'timeout-seconds'], booleans: ['no-tests'], positionals: [0, 0] })
  let timeoutSeconds = null
  if (parsed.values['timeout-seconds'] !== undefined) {
    const n = Number(parsed.values['timeout-seconds'])
    if (!Number.isInteger(n) || n < 1 || n > 1800) throw usageError('timeout-seconds must be an integer from 1 to 1800')
    timeoutSeconds = n
  }
  const root = topOfWorktree(ctx.cwd)
  if (root === null) throw new Error(`not a git repository: ${ctx.cwd}`)
  const result = await analyze(root, {
    noTests: parsed.booleans['no-tests'] === true,
    testsCommand: parsed.values['tests-command'] === undefined ? null : parsed.values['tests-command'],
    timeoutSeconds,
  }, {
    exec: runCommand,
    env: ctx.env,
    now: ctx.now,
    dataDir: dataDir(ctx.env),
  })
  const states = Object.fromEntries(Object.entries(result.checks).map(([name, check]) => [name, check.state]))
  return { code: 0, result, summary: { states, changed: result.changes.changed, selfFindings: result.selfFindings.length } }
}

module.exports = {
  analyze,
  command,
}
