'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-cli-1'
const MERGE = 'apruebo merge a main en todas las futuras ocasiones'
const HOURS = 'trabaja por horas y no cuentes conmigo hasta acabar'
const REVOKE = 'ya no fusiones a main sin preguntarme'
const USAGE =
  'usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] [--all] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | extend --hours N --usd N|unlimited --quote <text> [--session <id>] | spend <usd> --source <label> | status | end --outcome done|ceiling|incomplete | brake-settings [--session <id>] | brake-off --quote <text> [--session <id>] | brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>] | quota-saved --from <saved.json> | quota-brake [--session <id>] [--run <swarmRunId>]… | quarantine grants|run <id> | trust --author <autor> --quote <texto> [--session <id>] [--remove]'

const human = (text, time, extra = {}) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text }, ...extra })

// A repository on a feature branch, and a Claude config directory holding the owner's transcript.
function setup(t) {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  const lines = [human(MERGE, '2026-10-09T19:32:31.611Z'), human(HOURS, '2026-10-09T19:50:00.000Z'), human(REVOKE, '2026-10-09T21:00:00.000Z')]
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), lines.join('\n') + '\n')
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION }
  const cli = (args, cwd = repo.dir, extra = {}) => runBin(BIN, args, cwd, { ...env, ...extra })
  return { repo, cli, config }
}

test('the bin is executable, and a bare or unknown command prints the usage', (t) => {
  assert.ok(fs.statSync(BIN).mode & 0o111)
  const { cli } = setup(t)
  for (const args of [[], ['nope']]) {
    const r = cli(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.deepEqual(r.json, { error: USAGE })
  }
})

test("grant records the owner's words, and check covers the class from any worktree of the repository", (t) => {
  const { repo, cli } = setup(t)
  const g = cli(['grant', '--class', 'merge-main', '--quote', MERGE])
  assert.equal(g.status, 0, g.stdout + g.stderr)
  assert.deepEqual(Object.keys(g.json), ['granted'])
  assert.deepEqual([g.json.granted.class, g.json.granted.scope, g.json.granted.session, g.json.granted.time], ['merge-main', 'repo', SESSION, '2026-10-09T19:32:31.611Z'])
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'feature/y', linked)
  const c = cli(['check', 'merge-main'], linked)
  assert.equal(c.status, 0, c.stdout + c.stderr)
  assert.deepEqual([c.json.covered, c.json.class, c.json.grant.status], [true, 'merge-main', 'verified'])
  const other = cli(['check', 'push'])
  assert.equal(other.status, 2)
  assert.deepEqual(other.json, { covered: false, class: 'push' })
  const l = cli(['list'])
  assert.equal(l.status, 0)
  assert.deepEqual(l.json.grants.map((x) => [x.class, x.status]), [['merge-main', 'verified']])
  assert.deepEqual(l.json.revoked, [])
})

test('grant with words the owner did not write exits 2 and writes nothing', (t) => {
  const { repo, cli } = setup(t)
  const r = cli(['grant', '--class', 'push', '--quote', 'haz push cuando quieras siempre'])
  assert.equal(r.status, 2)
  assert.deepEqual(r.json, { verified: false, reason: `the quote is not in the owner's messages of session ${SESSION}` })
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'autonomy', 'grants.json')), false)
})

test('a session-scoped grant covers only its session, and revoke takes it away', (t) => {
  const { cli } = setup(t)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE, '--scope', 'session']).status, 0)
  assert.equal(cli(['check', 'merge-main']).status, 0)
  assert.equal(cli(['check', 'merge-main', '--session', 'sess-other']).status, 2)
  const r = cli(['revoke', '--class', 'merge-main', '--quote', REVOKE])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.revoked.removed, 1)
  assert.equal(cli(['check', 'merge-main']).status, 2)
})

test('revoke keeps the repository grant, and --all takes it too (issue 017)', (t) => {
  const { cli } = setup(t)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE]).status, 0)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE, '--scope', 'session']).status, 0)
  const narrow = cli(['revoke', '--class', 'merge-main', '--quote', REVOKE])
  assert.equal(narrow.status, 0, narrow.stdout + narrow.stderr)
  assert.equal(narrow.json.revoked.removed, 1)
  assert.equal(narrow.json.revoked.all, false)
  assert.equal(cli(['check', 'merge-main']).status, 0)
  const all = cli(['revoke', '--class', 'merge-main', '--quote', REVOKE, '--all'])
  assert.equal(all.status, 0, all.stdout + all.stderr)
  assert.equal(all.json.revoked.removed, 1)
  assert.equal(all.json.revoked.all, true)
  assert.equal(cli(['check', 'merge-main']).status, 2)
})

test("a run starts from the owner's permission, records spend, and ends", (t) => {
  const { cli } = setup(t)
  const s = cli(['start', '--quote', HOURS, '--usd', '20'])
  assert.equal(s.status, 0, s.stdout + s.stderr)
  const { id, runFile, diary, ceilings } = s.json.started
  assert.match(id, /^auto-\d{8}-\d{6}-[0-9a-f]{4}$/)
  assert.ok(fs.existsSync(runFile))
  assert.ok(fs.existsSync(diary))
  assert.deepEqual(ceilings, { hours: 8, usd: 20, source: { hours: 'default', usd: 'owner' } })
  const st = cli(['status'])
  assert.equal(st.status, 0)
  assert.deepEqual([st.json.open, st.json.id, st.json.stop, st.json.usd.ceiling], [true, id, null, 20])
  const sp = cli(['spend', '12.5', '--source', '20261009-201500-ab12'])
  assert.equal(sp.status, 0, sp.stdout + sp.stderr)
  assert.equal(sp.json.usd.spent, 12.5)
  const again = cli(['start', '--quote', HOURS])
  assert.equal(again.status, 1)
  assert.deepEqual(again.json, { error: `run ${id} is already open` })
  const e = cli(['end', '--outcome', 'done'])
  assert.equal(e.status, 0, e.stdout + e.stderr)
  assert.deepEqual([e.json.ended.id, e.json.ended.outcome], [id, 'done'])
  assert.deepEqual(cli(['status']).json, { open: false })
})

test('extend widens the ceilings of the open run without closing it (issue 253)', (t) => {
  const { cli } = setup(t)
  assert.equal(cli(['start', '--quote', HOURS]).status, 0)
  const id = cli(['status']).json.id
  const wider = cli(['extend', '--quote', HOURS, '--hours', '16'])
  assert.equal(wider.status, 0, wider.stdout + wider.stderr)
  assert.equal(wider.json.extended.id, id)
  assert.deepEqual(wider.json.extended.ceilings, { hours: 16, usd: 50, source: { hours: 'owner', usd: 'default' } })
  assert.equal(wider.json.extended.changes.length, 1)
  assert.deepEqual([wider.json.extended.changes[0].from, wider.json.extended.changes[0].to], [{ hours: 8, usd: 50 }, { hours: 16, usd: 50 }])
  assert.equal(cli(['status']).json.hours.ceiling, 16)
  const dollars = cli(['extend', '--quote', HOURS, '--usd', '200'])
  assert.equal(dollars.status, 0, dollars.stdout + dollars.stderr)
  assert.deepEqual(dollars.json.extended.ceilings.usd, 200)
  const free = cli(['extend', '--quote', HOURS, '--usd', 'unlimited'])
  assert.equal(free.status, 0, free.stdout + free.stderr)
  assert.deepEqual(free.json.extended.ceilings, { hours: 16, usd: null, source: { hours: 'owner', usd: 'owner' } })
  assert.equal(free.json.extended.changes.length, 3)
  const st = cli(['status'])
  assert.deepEqual([st.json.usd.ceiling, st.json.stop], [null, null])
  assert.equal(cli(['end', '--outcome', 'done']).status, 0)
  assert.deepEqual(cli(['status']).json, { open: false })
})

test('extend refuses a bad quote, no open run, and a bad value (issue 253)', (t) => {
  const { cli } = setup(t)
  const none = cli(['extend', '--quote', HOURS, '--hours', '16'])
  assert.equal(none.status, 1)
  assert.deepEqual(none.json, { error: 'no open run' })
  assert.equal(cli(['start', '--quote', HOURS]).status, 0)
  const bad = cli(['extend', '--quote', 'trabaja toda la noche sin parar', '--hours', '16'])
  assert.equal(bad.status, 2)
  assert.deepEqual(bad.json, { verified: false, reason: `the quote is not in the owner's messages of session ${SESSION}` })
  assert.equal(cli(['status']).json.hours.ceiling, 8)
})

test('bin refuses an interactive Lead session without an approved plan', (t) => {
  const { repo, cli, config } = setup(t)
  const data = tempDir(t, 'aether-data-')
  require('../plugins/aether/lib/session.js').markSession(data, SESSION, 1000, { repo: repo.dir, claude: null })
  fs.writeFileSync(path.join(config, 'projects', '-repo', `${SESSION}.jsonl`), human(HOURS, '2026-10-09T19:50:00.000Z', { entrypoint: 'cli' }))
  const result = cli(['start', '--quote', HOURS], repo.dir, { AETHER_DATA_DIR: data })
  assert.notEqual(result.status, 0)
  assert.match(result.json.reason, /plan mode/i)
})

test('bin opens a run for a headless Lead session without an approved plan', (t) => {
  const { repo, cli } = setup(t)
  const data = tempDir(t, 'aether-data-')
  require('../plugins/aether/lib/session.js').markSession(data, SESSION, 1000, { repo: repo.dir, claude: null })
  const result = cli(['start', '--quote', HOURS], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.ok(result.json.started.id)
})

test('start with words the owner did not write exits 2 and opens no run', (t) => {
  const { cli } = setup(t)
  const r = cli(['start', '--quote', 'trabaja toda la noche sin parar'])
  assert.equal(r.status, 2)
  assert.equal(r.json.verified, false)
  assert.deepEqual(cli(['status']).json, { open: false })
})

test('revoke with words the owner did not write exits 2 and changes nothing', (t) => {
  const { cli } = setup(t)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE]).status, 0)
  const r = cli(['revoke', '--class', 'merge-main', '--quote', 'palabras inventadas por mi'])
  assert.equal(r.status, 2)
  assert.equal(r.json.verified, false)
  assert.equal(cli(['check', 'merge-main']).status, 0)
})

test('bad input exits 1 with an error', (t) => {
  const { cli } = setup(t)
  const cases = [
    [['check', 'merge'], 'unknown class: merge'],
    [['check'], USAGE],
    [['check', ''], 'unknown class: '],
    [['check', '--session', 's1'], USAGE],
    [['grant', '--class', 'push'], USAGE],
    [['grant', '--quote', MERGE], USAGE],
    [['grant', '--class', 'push', '--quote'], '--quote needs a value'],
    [['grant', '--class', 'merge-main', '--quote', MERGE, '--scope'], '--scope needs a value'],
    [['grant', '--class', 'merge-main', '--quote', MERGE, '--scope', 'wrong'], 'unknown scope: wrong'],
    [['grant', '--class', 'merge-main', '--quote', MERGE, '--scope', ''], 'unknown scope: '],
    [['revoke', '--class', 'merge-main'], USAGE],
    [['revoke', '--quote', REVOKE], USAGE],
    [['revoke', '--class', 'merge-main', '--quote'], '--quote needs a value'],
    [['start', '--hours', '8'], USAGE],
    [['extend'], USAGE],
    [['extend', '--quote', HOURS], USAGE],
    [['extend', '--hours', '8'], USAGE],
    [['extend', '--quote', HOURS, '--hours', 'abc'], 'invalid ceiling: abc'],
    [['extend', '--quote', HOURS, '--hours', '-3'], 'invalid ceiling: -3'],
    [['extend', '--quote', HOURS, '--usd', 'limitado'], 'invalid ceiling: limitado'],
    [['start', '--quote', HOURS, '--hours', 'abc'], 'invalid ceiling: abc'],
    [['start', '--quote', HOURS, '--hours', ''], 'invalid ceiling: '],
    [['start', '--quote', HOURS, '--usd', 'xyz'], 'invalid ceiling: xyz'],
    [['start', '--quote', HOURS, '--usd'], '--usd needs a value'],
    [['spend', '3', '--source', 'r'], 'no open run'],
    [['spend', '--source', 'r'], USAGE],
    [['spend', 'abc', '--source', 'r'], 'invalid spend: abc'],
    [['spend', '', '--source', 'r'], 'invalid spend: '],
    [['spend', '10'], USAGE],
    [['spend', '10', '--source'], '--source needs a value'],
    [['end', '--outcome', 'finished'], 'unknown outcome: finished'],
    [['end'], USAGE],
    [['end', '--outcome'], '--outcome needs a value'],
  ]
  for (const [args, error] of cases) {
    const r = cli(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.deepEqual(r.json, { error }, args.join(' '))
  }
  const none = cli(['grant', '--class', 'push', '--quote', MERGE], undefined, { CLAUDE_CODE_SESSION_ID: '' })
  assert.equal(none.status, 1)
  assert.deepEqual(none.json, { error: 'no session id; pass --session <id> or set CLAUDE_CODE_SESSION_ID' })
  const outside = cli(['list'], tempDir(t))
  assert.equal(outside.status, 1)
  assert.match(outside.json.error, /not a git repository/i)
})

test('the registry stays out of git status', (t) => {
  const { repo, cli } = setup(t)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE]).status, 0)
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('quarantine through the bin: a corrupt grants.json is set aside, a readable one is refused with exit 2 (R26)', (t) => {
  const { repo, cli } = setup(t)
  const file = path.join(repo.dir, '.aether', 'autonomy', 'grants.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ grants: [], revoked: [] }))
  const refused = cli(['quarantine', 'grants'])
  assert.equal(refused.status, 2)
  assert.equal(refused.json.quarantined, false)
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify({ grants: [], revoked: [] }))
  fs.writeFileSync(file, '{ not json')
  const moved = cli(['quarantine', 'grants'])
  assert.equal(moved.status, 0, moved.stderr)
  assert.match(moved.json.quarantined.to, /broken-runs\/grants\.json-/)
  assert.equal(moved.json.quarantined.from, path.join('.aether', 'autonomy', 'grants.json'))
  assert.equal(path.isAbsolute(moved.json.quarantined.to), false)
  assert.equal(fs.readFileSync(path.join(repo.dir, moved.json.quarantined.to), 'utf8'), '{ not json')
  assert.equal(fs.existsSync(file), false)
  assert.equal(cli(['quarantine']).status, 1)
  assert.equal(cli(['quarantine', 'run']).status, 1)
})

test('quarantine run through the bin preserves a readable folder and moves a corrupt folder with relative paths (R26)', (t) => {
  const { repo, cli } = setup(t)
  const id = 'auto-20261009-200000-ab12'
  const relative = path.join('.aether', 'autonomy', id)
  const dir = path.join(repo.dir, relative)
  const run = JSON.stringify({ id, spend: [] })
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'run.json'), run)
  fs.writeFileSync(path.join(dir, 'diary.md'), 'the diary')
  const refused = cli(['quarantine', 'run', id])
  assert.equal(refused.status, 2, refused.stdout + refused.stderr)
  assert.equal(refused.json.quarantined, false)
  assert.match(refused.json.reason, /aether-autonomy end/)
  assert.equal(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'), run)
  assert.equal(fs.readFileSync(path.join(dir, 'diary.md'), 'utf8'), 'the diary')

  fs.writeFileSync(path.join(dir, 'run.json'), '{ broken')
  const moved = cli(['quarantine', 'run', id])
  assert.equal(moved.status, 0, moved.stdout + moved.stderr)
  assert.equal(moved.json.quarantined.from, relative)
  assert.equal(path.isAbsolute(moved.json.quarantined.to), false)
  assert.match(moved.json.quarantined.to, /^\.aether\/broken-runs\/auto-20261009-200000-ab12-\d{8}-\d{6}-[0-9a-f]{4}$/)
  assert.equal(fs.existsSync(dir), false)
  const destination = path.join(repo.dir, moved.json.quarantined.to)
  assert.equal(fs.readFileSync(path.join(destination, 'run.json'), 'utf8'), '{ broken')
  assert.equal(fs.readFileSync(path.join(destination, 'diary.md'), 'utf8'), 'the diary')
})

test('quarantine rejects extra arguments for both targets with the usage error (R26)', (t) => {
  const { cli } = setup(t)
  for (const args of [
    ['quarantine', 'grants', 'extra'],
    ['quarantine', 'run', 'auto-20261009-200000-ab12', 'extra'],
  ]) {
    const result = cli(args)
    assert.equal(result.status, 1, args.join(' '))
    assert.deepEqual(result.json, { error: USAGE }, args.join(' '))
  }
})
