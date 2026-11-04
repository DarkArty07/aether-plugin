'use strict'

// The orchestrator of the audit family: it takes --out out of argv, checks it stays outside the audited project,
// dispatches the six subcommands to their module, and prints one JSON line.
// Family: audit.

const path = require('node:path')
const { git } = require('./git.js')
const { writeAtomic, messageOf } = require('./common.js')

// Each subcommand loads its module when asked, with a literal require inside its function,
// so the verbs of later tasks fail only when they run, never when this file loads.
function runAnalyze(args, ctx) {
  return require('./audit-analyze.js').command(args, ctx)
}

function runCandidates(args, ctx) {
  return require('./audit-verify.js').command(args, { ...ctx, subcommand: 'candidates' })
}

function runVerdicts(args, ctx) {
  return require('./audit-verify.js').command(args, { ...ctx, subcommand: 'verdicts' })
}

function runClean(args, ctx) {
  return require('./audit-clean.js').command(args, ctx)
}

function runTriage(args, ctx) {
  return require('./audit-triage.js').command(args, ctx)
}

function runReport(args, ctx) {
  return require('./audit-report.js').command(args, ctx)
}

const VERBS = ['analyze', 'candidates', 'verdicts', 'clean', 'triage', 'report']

const RUNNERS = {
  analyze: runAnalyze,
  candidates: runCandidates,
  verdicts: runVerdicts,
  clean: runClean,
  triage: runTriage,
  report: runReport,
}

function print(stdout, value) {
  stdout.write(`${JSON.stringify(value)}\n`)
}

function usage() {
  return `unknown subcommand: use one of ${VERBS.join(', ')}`
}

function worktreeRoot(cwd) {
  try {
    const r = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
    return r.status === 0 && r.stdout !== '' ? r.stdout : null
  } catch {
    return null
  }
}

function takeOut(argv) {
  const rest = [...argv]
  const at = rest.indexOf('--out')
  if (at === -1) return { rest, out: null }
  const file = rest[at + 1]
  if (file === undefined || file.startsWith('--')) {
    throw Object.assign(new Error('flag needs a value: --out'), { exitCode: 2 })
  }
  rest.splice(at, 2)
  return { rest, out: file }
}

// -> Promise<number>: the exit code. Writes one JSON line to stdout.
// 1. Takes `--out <file>` out of argv. When given, the file must be outside the audited project: the root of the git worktree of cwd
//    (git rev-parse --show-toplevel, through lib/git.js; no root, no check); inside it, the exit code is 2 and the error says
//    "--out must be outside the audited project". This check comes before the subcommand runs.
// 2. Loads the module of the subcommand when it is asked for, with a literal require inside a function per subcommand:
//    analyze -> audit-analyze.js, candidates and verdicts -> audit-verify.js, clean -> audit-clean.js, triage -> audit-triage.js, report -> audit-report.js.
//    Each exports command(args, ctx) -> Promise<{ code?: number, result: object, summary?: object }> and gets ctx = { cwd, env, subcommand, now: () => new Date() }.
// 3. Prints the result; with --out writes the result there (writeAtomic) and prints { ok: true, out, summary } instead.
// An error with exitCode 2 (usageError) gives exit 2; any other error gives { ok: false, error } and exit 1; an unknown or missing subcommand gives exit 2 and an error that names the six subcommands.
async function main(argv, { cwd = process.cwd(), env = process.env, stdout = process.stdout } = {}) {
  let rest
  let out
  try {
    ({ rest, out } = takeOut(argv))
  } catch (err) {
    print(stdout, { ok: false, error: messageOf(err) })
    return 2
  }
  if (out !== null) {
    const root = worktreeRoot(cwd)
    if (root !== null) {
      const resolved = path.resolve(cwd, out)
      if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
        print(stdout, { ok: false, error: '--out must be outside the audited project' })
        return 2
      }
    }
  }
  const [verb, ...args] = rest
  const run = RUNNERS[verb]
  if (!run) {
    print(stdout, { ok: false, error: usage() })
    return 2
  }
  const ctx = { cwd, env, subcommand: verb, now: () => new Date() }
  try {
    const { code = 0, result, summary } = await run(args, ctx)
    if (out !== null) {
      writeAtomic(out, JSON.stringify(result, null, 2))
      print(stdout, { ok: true, out, summary })
    } else {
      print(stdout, result)
    }
    return code
  } catch (err) {
    print(stdout, { ok: false, error: messageOf(err) })
    return err && err.exitCode === 2 ? 2 : 1
  }
}

module.exports = {
  main,
}
