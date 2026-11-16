'use strict'

// Dispatches and executes autonomy CLI commands for authorizations and run state.
// Called by bin/aether-autonomy to handle grant, revoke, check, and status verbs.
// Family: none.

// Supported subcommands (source reference only, not user-facing help; CLI errors print USAGE):
// It does not stop workflows, delegates or lane calls (those stay with the Lead: TaskStop, aether-lane stop).
// aether-autonomy grant  --class <class> --quote <text> [--session <id>] [--scope repo|session]
// aether-autonomy revoke --class <class> --quote <text> [--session <id>] [--all]
// aether-autonomy check  <class> [--session <id>]
// aether-autonomy list
// aether-autonomy start  --quote <text> [--session <id>] [--hours N] [--usd N]
// aether-autonomy extend --hours N --usd N|unlimited --quote <text> [--session <id>]
// aether-autonomy spend  <usd> --source <label> [--session <id>]
// aether-autonomy status [<id>] [--session <id>]
// aether-autonomy end    [<id>] --outcome done|ceiling|incomplete [--session <id>]
// aether-autonomy continue <id> [--session <id>]
// aether-autonomy brake-settings [--session <id>]
// aether-autonomy brake-off --quote <text> [--session <id>]
// aether-autonomy brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>]
// aether-autonomy quota-saved --from <saved.json>
// aether-autonomy quota-brake [--session <id>] [--run <swarmRunId>]…
// aether-autonomy quarantine grants|run <id>
// aether-autonomy trust --author <autor> --quote <texto> [--session <id>] [--remove]

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { repoPaths } = require('./git.js')
const { ensureExcluded, dataDir, isRunId, assertRunId, runDir, launchEndFile } = require('./run.js')
const autonomy = require('./autonomy.js')

const WT_BIN = path.join(__dirname, '..', 'bin', 'aether-wt')

const USAGE =
  'usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] [--all] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | extend --hours N --usd N|unlimited --quote <text> [--session <id>] | spend <usd> --source <label> [--session <id>] | status [<id>] [--session <id>] | end [<id>] --outcome done|ceiling|incomplete [--session <id>] | continue <id> [--session <id>] | brake-settings [--session <id>] | brake-off --quote <text> [--session <id>] | brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>] | quota-saved --from <saved.json> | quota-brake [--session <id>] [--run <swarmRunId>]… (does not stop workflows, delegates or lane calls; stop them first) | quarantine grants|run <id> | trust --author <autor> --quote <texto> [--session <id>] [--remove]'

const AUTO_RUN_ID_RE = /^auto-[0-9]{8}-[0-9]{6}-[0-9a-f]+$/

// Optional positional run id: first argument when it does not start with --.
function optionalRunId(rest) {
  if (rest[0] === undefined || rest[0].startsWith('--')) return null
  if (!AUTO_RUN_ID_RE.test(rest[0])) throw new Error(USAGE)
  return rest[0]
}

// Rejects any positional argument after index 0 (after assertFlags has paired flags).
function assertNoLatePositionals(rest) {
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      i++
      continue
    }
    if (i > 0) throw new Error(USAGE)
  }
}

// Formats a selection refusal (exit 1) or quote verification failure (exit 2).
function quoteFailure(res) {
  if (res.reason === 'no open run' || res.code === 'ambiguous' || res.code === 'foreign') {
    const out = { error: res.reason }
    if (res.runs) out.runs = res.runs
    return { code: 1, out }
  }
  return { code: 2, out: { verified: false, reason: res.reason } }
}

// The value after a flag, or null when the flag is absent.
function value(args, flag) {
  const i = args.indexOf(flag)
  if (i === -1) return null
  const next = args[i + 1]
  if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`)
  return next
}

// Every flag that appears in args must be followed by a value.
function assertFlags(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const next = args[i + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${args[i]} needs a value`)
      }
      i++
    }
  }
}

// Number(raw), except that an empty or blank value is not a number.
function parseNumber(raw, name) {
  const n = raw.trim() === '' ? NaN : Number(raw)
  if (!Number.isFinite(n)) throw new Error(`invalid ${name}: ${raw}`)
  return n
}

// --session, or else CLAUDE_CODE_SESSION_ID; an empty value counts as none.
function getSession(args, required = false, env = process.env) {
  const flag = value(args, '--session')
  const envId = env?.CLAUDE_CODE_SESSION_ID
  const id = flag !== null ? flag : envId
  if (!id) {
    if (required) throw new Error('no session id; pass --session <id> or set CLAUDE_CODE_SESSION_ID')
    return null
  }
  return id
}

function main(argv, { cwd = process.cwd(), env = process.env } = {}) {
  const sub = argv[0]
  // --all and --remove are boolean flags; they take no value, so they leave `rest`
  // before assertFlags checks that every flag is followed by a value.
  const all = sub === 'revoke' && argv.includes('--all')
  const remove = sub === 'trust' && argv.includes('--remove')
  const rest = argv.slice(1).filter((a) => !((sub === 'revoke' && a === '--all') || (sub === 'trust' && a === '--remove')))

  if (!sub || !['grant', 'revoke', 'check', 'list', 'start', 'extend', 'spend', 'status', 'end', 'continue', 'brake-settings', 'brake-off', 'brake-crossing', 'quota-saved', 'quota-brake', 'quarantine', 'trust'].includes(sub)) {
    throw new Error(USAGE)
  }

  if (sub === 'quarantine' && !((rest[0] === 'grants' && rest.length === 1) || (rest[0] === 'run' && rest.length === 2 && !rest[1].startsWith('--')))) throw new Error(USAGE)

  assertFlags(rest)

  if (sub === 'trust') {
    const author = value(rest, '--author')
    const quote = value(rest, '--quote')
    if (author === null || !quote) throw new Error(USAGE)
    const session = getSession(rest, false, env)
    const targetDataDir = env.AETHER_DATA_DIR || dataDir(env)
    const res = autonomy.trustAuthor(targetDataDir, { author, quote, session, remove }, { configDir: env.CLAUDE_CONFIG_DIR })
    if (!res.ok) {
      if (res.reason.startsWith('invalid author')) return { code: 1, out: { error: res.reason } }
      return { code: 2, out: { verified: false, reason: res.reason } }
    }
    return { code: 0, out: { trusted: { authors: res.authors } } }
  }

  const { mainRoot, gitCommonDir } = repoPaths(cwd)

  if (sub === 'quarantine') {
    ensureExcluded(gitCommonDir)
    const res = autonomy.quarantine(mainRoot, { target: rest[0], id: rest[1] })
    if (!res.ok) return { code: 2, out: { quarantined: false, reason: res.reason } }
    return { code: 0, out: { quarantined: { from: path.relative(mainRoot, res.from), to: path.relative(mainRoot, res.to) } } }
  }

  if (sub === 'grant') {
    const cls = value(rest, '--class')
    const quote = value(rest, '--quote')
    if (!cls || !quote) throw new Error(USAGE)
    const session = getSession(rest, true, env)
    const scope = value(rest, '--scope') ?? 'repo'
    ensureExcluded(gitCommonDir)
    const res = autonomy.grant(mainRoot, { class: cls, quote, session, scope })
    if (!res.ok) return { code: 2, out: { verified: false, reason: res.reason } }
    return { code: 0, out: { granted: res.grant } }
  }

  if (sub === 'revoke') {
    const cls = value(rest, '--class')
    const quote = value(rest, '--quote')
    if (!cls || !quote) throw new Error(USAGE)
    const session = getSession(rest, true, env)
    ensureExcluded(gitCommonDir)
    const res = autonomy.revoke(mainRoot, { class: cls, quote, session, all })
    if (!res.ok) return { code: 2, out: { verified: false, reason: res.reason } }
    return { code: 0, out: { revoked: res.revocation } }
  }

  if (sub === 'check') {
    const cls = rest[0]
    if (cls === undefined || cls.startsWith('--')) throw new Error(USAGE)
    const session = getSession(rest, false, env)
    const res = autonomy.check(mainRoot, cls, { session })
    if (!res) return { code: 2, out: { covered: false, class: cls } }
    return { code: 0, out: { covered: true, class: cls, grant: res } }
  }

  if (sub === 'list') {
    return { code: 0, out: autonomy.list(mainRoot) }
  }

  if (sub === 'start') {
    const quote = value(rest, '--quote')
    if (!quote) throw new Error(USAGE)
    const rawHours = value(rest, '--hours')
    const rawUsd = value(rest, '--usd')
    const hours = rawHours !== null ? parseNumber(rawHours, 'ceiling') : null
    const usd = rawUsd !== null ? parseNumber(rawUsd, 'ceiling') : null
    const session = getSession(rest, true, env)
    ensureExcluded(gitCommonDir)
    const res = autonomy.start(mainRoot, { quote, session, hours, usd }, { dataDir: env.AETHER_DATA_DIR || dataDir(env), configDir: env.CLAUDE_CONFIG_DIR })
    if (!res.ok) return { code: 2, out: { verified: false, reason: res.reason } }
    const c = res.run.ceilings
    const usdLabel = c.usd === null ? 'unlimited' : c.usd
    return {
      code: 0,
      out: {
        started: {
          id: res.run.id,
          runFile: res.runFile,
          diary: res.diary,
          ceilings: c,
          summary: `hours ${c.hours} (${c.source.hours}), usd ${usdLabel} (${c.source.usd})`,
          notices: res.notices,
        },
      },
    }
  }

  if (sub === 'extend') {
    const quote = value(rest, '--quote')
    const rawHours = value(rest, '--hours')
    const rawUsd = value(rest, '--usd')
    if (!quote || (rawHours === null && rawUsd === null)) throw new Error(USAGE)
    const hours = rawHours !== null ? parseNumber(rawHours, 'ceiling') : undefined
    const usd = rawUsd !== null ? (rawUsd === 'unlimited' ? null : parseNumber(rawUsd, 'ceiling')) : undefined
    const session = getSession(rest, true, env)
    ensureExcluded(gitCommonDir)
    const res = autonomy.extend(mainRoot, { hours, usd, quote, session })
    if (!res.ok) return quoteFailure(res)
    return {
      code: 0,
      out: {
        extended: {
          id: res.run.id,
          ceilings: res.run.ceilings,
          changes: res.run.ceilingChanges,
        },
      },
    }
  }

  if (sub === 'spend') {
    const rawAmount = rest[0]
    if (rawAmount === undefined || rawAmount.startsWith('--')) throw new Error(USAGE)
    const amount = parseNumber(rawAmount, 'spend')
    const source = value(rest, '--source')
    if (!source) throw new Error(USAGE)
    const session = getSession(rest, false, env)
    return { code: 0, out: autonomy.spend(mainRoot, amount, source, { session, dataDir: env.AETHER_DATA_DIR || dataDir(env) }) }
  }

  if (sub === 'status') {
    assertNoLatePositionals(rest)
    const id = optionalRunId(rest)
    const session = getSession(rest, false, env)
    return { code: 0, out: autonomy.status(mainRoot, { session, id, dataDir: env.AETHER_DATA_DIR || dataDir(env) }) }
  }

  if (sub === 'end') {
    assertNoLatePositionals(rest)
    const id = optionalRunId(rest)
    const outcome = value(rest, '--outcome')
    if (!outcome) throw new Error(USAGE)
    const session = getSession(rest, false, env)
    return { code: 0, out: { ended: autonomy.end(mainRoot, outcome, { session, id }) } }
  }

  if (sub === 'continue') {
    assertNoLatePositionals(rest)
    const id = rest[0]
    if (id === undefined || id.startsWith('--') || !AUTO_RUN_ID_RE.test(id)) throw new Error(USAGE)
    const session = getSession(rest, false, env)
    ensureExcluded(gitCommonDir)
    const res = autonomy.continueRun(mainRoot, id, { session })
    if (!res.ok) return { code: 1, out: { error: res.reason } }
    const continued = {
      id: res.run.id,
      session: res.run.session,
      from: res.from,
      previousSessions: res.run.previousSessions || [],
    }
    if (res.unchanged) continued.unchanged = true
    return { code: 0, out: { continued } }
  }

  if (sub === 'brake-settings') {
    const session = getSession(rest, false, env)
    return { code: 0, out: autonomy.brakeSettings(mainRoot, { session, dataDir: env.AETHER_DATA_DIR || dataDir(env) }) }
  }

  if (sub === 'brake-off') {
    const quote = value(rest, '--quote')
    if (!quote) throw new Error(USAGE)
    const session = getSession(rest, true, env)
    ensureExcluded(gitCommonDir)
    const res = autonomy.brakeOff(mainRoot, { quote, session })
    if (!res.ok) return quoteFailure(res)
    return { code: 0, out: { brakeOff: res.brakeOff } }
  }

  if (sub === 'brake-crossing') {
    const kind = value(rest, '--kind')
    const rawPercent = value(rest, '--percent')
    const resetsAt = value(rest, '--resets-at')
    const rawThreshold = value(rest, '--threshold')
    const rawNotify = value(rest, '--notify')
    if (kind === null || rawPercent === null || resetsAt === null || rawThreshold === null || rawNotify === null) throw new Error(USAGE)
    const percentUsed = parseNumber(rawPercent, 'percent')
    const threshold = parseNumber(rawThreshold, 'threshold')
    let notify
    if (rawNotify === 'sent') notify = { sent: true, reason: null }
    else if (rawNotify === 'failed') notify = { sent: false, reason: value(rest, '--notify-reason') ?? 'no-channel' }
    else throw new Error(USAGE)
    ensureExcluded(gitCommonDir)
    const session = getSession(rest, false, env)
    return { code: 0, out: autonomy.recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify }, { dataDir: env.AETHER_DATA_DIR || dataDir(env), session }) }
  }

  if (sub === 'quota-saved') {
    const from = value(rest, '--from')
    if (!from) throw new Error(USAGE)
    const saved = JSON.parse(fs.readFileSync(from, 'utf8'))
    ensureExcluded(gitCommonDir)
    return { code: 0, out: autonomy.recordSaved(mainRoot, saved) }
  }

  if (sub === 'quota-brake') {
    const session = getSession(rest, false, env)
    const now = Date.now()
    const open = autonomy.openRuns(mainRoot)
    const paused = open.filter(({ run }) => autonomy.activePause(run, now) !== null)
    if (!paused.length) return { code: 0, out: { saved: [], recorded: false, pushed: [] } }
    const earliest = paused.reduce((min, { run }) => (Date.parse(run.started) < Date.parse(min) ? run.started : min), paused[0].run.started)
    const named = flagValues(rest, '--run')
    const ids = named.length ? namedRuns(named) : inFlightRuns(mainRoot, earliest)
    ensureExcluded(gitCommonDir)
    const data = env.AETHER_DATA_DIR || dataDir(env)
    const settings = autonomy.brakeSettings(mainRoot, { session, dataDir: data })
    const abandoned = autonomy.abandonedRuns(mainRoot, data)
    const pushOn = settings.push === true
    const mayPush = pushOn && Boolean(autonomy.check(mainRoot, 'push', { session }))
    const saved = []
    const pushed = []
    const skipped = []
    const failures = []
    let recorded = false
    for (const id of ids) {
      const targets = autonomy.attributeSavedRuns(mainRoot, open, id, now)
      if (!targets.some(({ run }) => autonomy.activePause(run, now) !== null)) continue
      if (abandoned.has(id)) {
        skipped.push(id)
        continue
      }
      let body
      try {
        const child = spawnSync(process.execPath, [WT_BIN, 'save', id], { cwd, encoding: 'utf8', env })
        if (child.status !== 0 || child.error) {
          const detail = `${child.stdout || ''}${child.stderr || ''}${child.error ? child.error.message : ''}`.trim()
          failures.push({ run: id, error: detail || `aether-wt save ${id} failed` })
          continue
        }
        const file = path.join(runDir(mainRoot, id), 'saved.json')
        body = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (autonomy.recordSaved(mainRoot, body).recorded) recorded = true
        saved.push(id)
      } catch (err) {
        failures.push({ run: id, error: err.message })
        continue
      }
      if (!mayPush) continue
      for (const unit of body.units || []) {
        if (!unit || unit.merged || typeof unit.branch !== 'string' || unit.branch === '' || !unit.head) continue
        const push = spawnSync('git', ['push', 'origin', unit.branch], {
          cwd: mainRoot,
          encoding: 'utf8',
          env: { ...env, GIT_TERMINAL_PROMPT: '0' },
        })
        if (push.status !== 0 || push.error) {
          const detail = `${push.stderr || ''}${push.stdout || ''}${push.error ? push.error.message : ''}`.trim()
          failures.push({ run: id, branch: unit.branch, error: detail || `git push origin ${unit.branch} failed` })
          continue
        }
        pushed.push(unit.branch)
      }
    }
    const out = { saved, recorded, pushed }
    if (skipped.length) out.skipped = skipped
    if (pushOn && !mayPush) out.notPushed = 'push needs a grant'
    if (failures.length) out.failures = failures
    return { code: failures.length ? 1 : 0, out }
  }
}

// Every value of a repeatable flag. assertFlags has already required each one.
function namedRuns(ids) {
  for (const id of ids) assertRunId(id)
  return ids
}

function flagValues(args, flag) {
  const found = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) found.push(args[i + 1])
  }
  return found
}

// Swarm runs still in flight for this autonomous run: a graph.json, no launch end,
// and a graph written at or after the open run started. Nothing is read from the diary.
function inFlightRuns(mainRoot, started) {
  const root = path.join(mainRoot, '.aether', 'runs')
  if (!fs.existsSync(root)) return []
  const since = Date.parse(started)
  const ids = []
  for (const name of fs.readdirSync(root)) {
    if (!isRunId(name)) continue
    const graph = path.join(root, name, 'graph.json')
    if (!fs.existsSync(graph)) continue
    if (fs.existsSync(launchEndFile(mainRoot, name))) continue
    if (!(fs.statSync(graph).mtimeMs >= since)) continue
    ids.push(name)
  }
  ids.sort()
  return ids
}

module.exports = {
  main,
}
