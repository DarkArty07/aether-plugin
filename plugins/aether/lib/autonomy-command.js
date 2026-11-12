'use strict'

// Dispatches and executes autonomy CLI commands for authorizations and run state.
// Called by bin/aether-autonomy to handle grant, revoke, check, and status verbs.
// Family: none.

// aether-autonomy grant  --class <class> --quote <text> [--session <id>] [--scope repo|session]
// aether-autonomy revoke --class <class> --quote <text> [--session <id>] [--all]
// aether-autonomy check  <class> [--session <id>]
// aether-autonomy list
// aether-autonomy start  --quote <text> [--session <id>] [--hours N] [--usd N]
// aether-autonomy extend --hours N --usd N|unlimited --quote <text> [--session <id>]
// aether-autonomy spend  <usd> --source <label>
// aether-autonomy status
// aether-autonomy end    --outcome done|ceiling|incomplete
// aether-autonomy brake-settings [--session <id>]
// aether-autonomy brake-off --quote <text> [--session <id>]
// aether-autonomy brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>]
// aether-autonomy quota-saved --from <saved.json>
// aether-autonomy quarantine grants|run <id>
// aether-autonomy trust --author <autor> --quote <texto> [--session <id>] [--remove]

const fs = require('node:fs')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const { ensureExcluded, dataDir } = require('./run.js')
const autonomy = require('./autonomy.js')

const USAGE =
  'usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] [--all] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | extend --hours N --usd N|unlimited --quote <text> [--session <id>] | spend <usd> --source <label> | status | end --outcome done|ceiling|incomplete | brake-settings [--session <id>] | brake-off --quote <text> [--session <id>] | brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>] | quota-saved --from <saved.json> | quarantine grants|run <id> | trust --author <autor> --quote <texto> [--session <id>] [--remove]'

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

  if (!sub || !['grant', 'revoke', 'check', 'list', 'start', 'extend', 'spend', 'status', 'end', 'brake-settings', 'brake-off', 'brake-crossing', 'quota-saved', 'quarantine', 'trust'].includes(sub)) {
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
    return {
      code: 0,
      out: {
        started: {
          id: res.run.id,
          runFile: res.runFile,
          diary: res.diary,
          ceilings: res.run.ceilings,
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
    if (!res.ok) {
      if (res.reason === 'no open run') return { code: 1, out: { error: res.reason } }
      return { code: 2, out: { verified: false, reason: res.reason } }
    }
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
    return { code: 0, out: autonomy.spend(mainRoot, amount, source) }
  }

  if (sub === 'status') {
    return { code: 0, out: autonomy.status(mainRoot) }
  }

  if (sub === 'end') {
    const outcome = value(rest, '--outcome')
    if (!outcome) throw new Error(USAGE)
    return { code: 0, out: { ended: autonomy.end(mainRoot, outcome) } }
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
    if (!res.ok && res.reason === 'no open run') return { code: 1, out: { error: 'no open run' } }
    if (!res.ok) return { code: 2, out: { verified: false, reason: res.reason } }
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
    return { code: 0, out: autonomy.recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify }, { dataDir: env.AETHER_DATA_DIR || dataDir(env) }) }
  }

  if (sub === 'quota-saved') {
    const from = value(rest, '--from')
    if (!from) throw new Error(USAGE)
    const saved = JSON.parse(fs.readFileSync(from, 'utf8'))
    ensureExcluded(gitCommonDir)
    return { code: 0, out: autonomy.recordSaved(mainRoot, saved) }
  }
}

module.exports = {
  main,
}
