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
  'usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | spend <usd> --source <label> | status | end --outcome done|ceiling|incomplete'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

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
  return { repo, cli }
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
    [['check', '--session', 's1'], USAGE],
    [['grant', '--class', 'push'], USAGE],
    [['grant', '--quote', MERGE], USAGE],
    [['grant', '--class', 'push', '--quote'], '--quote needs a value'],
    [['grant', '--class', 'merge-main', '--quote', MERGE, '--scope'], '--scope needs a value'],
    [['grant', '--class', 'merge-main', '--quote', MERGE, '--scope', 'wrong'], 'unknown scope: wrong'],
    [['revoke', '--class', 'merge-main'], USAGE],
    [['revoke', '--quote', REVOKE], USAGE],
    [['revoke', '--class', 'merge-main', '--quote'], '--quote needs a value'],
    [['start', '--hours', '8'], USAGE],
    [['start', '--quote', HOURS, '--hours', 'abc'], 'invalid ceiling: abc'],
    [['start', '--quote', HOURS, '--usd', 'xyz'], 'invalid ceiling: xyz'],
    [['start', '--quote', HOURS, '--usd'], '--usd needs a value'],
    [['spend', '3', '--source', 'r'], 'no open run'],
    [['spend', '--source', 'r'], USAGE],
    [['spend', 'abc', '--source', 'r'], 'invalid spend: abc'],
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
