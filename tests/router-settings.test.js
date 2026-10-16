'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, SESSION_BIN, makeRepo, tempDir } = require('./helpers.js')
const session = require('../plugins/aether/lib/session.js')

const STANDARD = { mode: 'record', decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 }, lanes: false, harnesses: ['agy'] }

test('routerSettingsFrom reads the four options and the lanes ones, and falls back on what it does not know', () => {
  assert.deepEqual(session.routerSettingsFrom({}), STANDARD)
  assert.deepEqual(
    session.routerSettingsFrom({ CLAUDE_PLUGIN_OPTION_ROUTER: 'command', CLAUDE_PLUGIN_OPTION_DECIDER: 'jev', CLAUDE_PLUGIN_OPTION_FALLBACK: 'opus:high', CLAUDE_PLUGIN_OPTION_DEADLINES: 'haiku=5,quota=2', CLAUDE_PLUGIN_OPTION_LANES: 'true', CLAUDE_PLUGIN_OPTION_HARNESSES: 'agy,grok' }),
    { mode: 'command', decider: 'jev', fallback: { alias: 'opus', effort: 'high' }, deadlines: { haikuMs: 5000, jevMs: 3000, quotaMs: 2000 }, lanes: true, harnesses: ['agy', 'grok'] },
  )
  const odd = session.routerSettingsFrom({ CLAUDE_PLUGIN_OPTION_ROUTER: 'banana', CLAUDE_PLUGIN_OPTION_DECIDER: 'gpt', CLAUDE_PLUGIN_OPTION_LANES: 'yes' })
  assert.equal(odd.mode, 'record')
  assert.equal(odd.decider, 'haiku')
  assert.equal(odd.lanes, false)
  assert.deepEqual(session.ROUTER_MODES, ['record', 'advise', 'command'])
  assert.deepEqual(session.ROUTER_DECIDERS, ['haiku', 'jev'])
})

test('the fallback rung is alias:effort, and a value that does not say so is the standard one (A-4)', () => {
  assert.deepEqual(session.parseFallback('sonnet:high'), { alias: 'sonnet', effort: 'high' })
  assert.deepEqual(session.parseFallback(' Haiku:LOW '), { alias: 'haiku', effort: 'low' })
  assert.deepEqual(session.parseFallback('opus:max'), { alias: 'opus', effort: 'max' })
  for (const bad of ['gpt:high', 'sonnet', 'sonnet:ultra', ':high', '', undefined, 'sonnet:high:low']) {
    assert.deepEqual(session.parseFallback(bad), session.DEFAULT_FALLBACK, String(bad))
  }
  assert.deepEqual(session.DEFAULT_FALLBACK, { alias: 'sonnet', effort: 'high' })
})

test('the time limits are seconds per decider and for the quota decision, with defaults for what is wrong (A-6)', () => {
  assert.deepEqual(session.parseDeadlines('haiku=8,jev=3,quota=3'), { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 })
  assert.deepEqual(session.parseDeadlines('jev=1.5'), { haikuMs: 8000, jevMs: 1500, quotaMs: 3000 })
  assert.deepEqual(session.parseDeadlines('haiku=0,jev=abc,quota=99,x=1'), { haikuMs: 8000, jevMs: 3000, quotaMs: 10000 })
  assert.deepEqual(session.parseDeadlines(' haiku = 5 , quota=2 '), { haikuMs: 5000, jevMs: 3000, quotaMs: 2000 })
  for (const bad of ['', undefined, 'nonsense', '=,=']) assert.deepEqual(session.parseDeadlines(bad), session.DEFAULT_DEADLINES, String(bad))
  assert.deepEqual(session.DEFAULT_DEADLINES, { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 })
  assert.equal(session.MAX_DEADLINE_MS, 10000)
})

test('markSession writes the router file beside the marker, and a resume without it removes the stale one', (t) => {
  const dir = tempDir(t)
  const settings = { ...STANDARD, mode: 'advise' }
  session.markSession(dir, 's1', 1000, { router: settings })
  assert.equal(session.routerFile(dir, 's1'), path.join(dir, 'sessions', 's1.router.json'))
  assert.deepEqual(session.readRouterSettings(dir, 's1'), settings)
  assert.ok(session.isAetherSession(dir, 's1'))
  session.markSession(dir, 's1', 2000, {})
  assert.equal(session.readRouterSettings(dir, 's1'), null)
  assert.throws(() => session.routerFile(dir, '../x'), /invalid session id/)
})

test('readRouterSettings is null for a damaged or incomplete file', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'sessions'))
  fs.writeFileSync(session.routerFile(dir, 's2'), 'not json')
  assert.equal(session.readRouterSettings(dir, 's2'), null)
  const write = (change) => fs.writeFileSync(session.routerFile(dir, 's2'), JSON.stringify({ ...STANDARD, ...change }))
  write({ mode: 'banana' })
  assert.equal(session.readRouterSettings(dir, 's2'), null)
  write({ fallback: { alias: 'gpt', effort: 'high' } })
  assert.equal(session.readRouterSettings(dir, 's2'), null)
  write({ deadlines: { haikuMs: 0, jevMs: 3000, quotaMs: 3000 } })
  assert.equal(session.readRouterSettings(dir, 's2'), null)
  write({ deadlines: undefined })
  assert.equal(session.readRouterSettings(dir, 's2'), null)
  write({})
  assert.deepEqual(session.readRouterSettings(dir, 's2'), STANDARD)
})

test('pruneSessions removes the router file with its marker', (t) => {
  const dir = tempDir(t)
  session.markSession(dir, 'old', 1, { router: STANDARD })
  const past = new Date(Date.now() - 40 * 24 * 3600 * 1000)
  fs.utimesSync(session.markerFile(dir, 'old'), past, past)
  assert.deepEqual(session.pruneSessions(dir, { days: 30 }), ['old'])
  assert.equal(fs.existsSync(session.routerFile(dir, 'old')), false)
})

function start(t, env) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd: repo.dir,
    encoding: 'utf8',
    input: JSON.stringify({ session_id: 's1', agent_type: 'aether:lead', source: 'startup' }),
    env: { ...process.env, AETHER_DATA_DIR: data, CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_ENV_FILE: '', ...env },
  })
  assert.equal(r.status, 0, r.stderr)
  return { data, context: JSON.parse(r.stdout).hookSpecificOutput.additionalContext }
}

test('session start writes the router file and adds the note of the mode, and none for record', (t) => {
  const standard = start(t, {})
  assert.deepEqual(session.readRouterSettings(standard.data, 's1'), STANDARD)
  assert.ok(!standard.context.includes('Aether router'))
  const advise = start(t, { CLAUDE_PLUGIN_OPTION_ROUTER: 'advise' })
  assert.equal(session.readRouterSettings(advise.data, 's1').mode, 'advise')
  assert.ok(advise.context.includes('Aether router (advise): after you launch a delegate task, Aether tells you the model and effort its decider would choose. The delegate still runs as you launched it.'))
  const command = start(t, { CLAUDE_PLUGIN_OPTION_ROUTER: 'command', CLAUDE_PLUGIN_OPTION_DECIDER: 'jev', CLAUDE_PLUGIN_OPTION_FALLBACK: 'haiku:xhigh', CLAUDE_PLUGIN_OPTION_DEADLINES: 'jev=2' })
  assert.deepEqual(session.readRouterSettings(command.data, 's1'), { ...STANDARD, mode: 'command', decider: 'jev', fallback: { alias: 'haiku', effort: 'xhigh' }, deadlines: { haikuMs: 8000, jevMs: 2000, quotaMs: 3000 } })
  assert.ok(command.context.includes('ROUTER-OVERRIDE: <reason>'))
  assert.ok(command.context.includes('Aether router (command): launch a delegate task with a description and a self-contained brief, and leave model and effort out'))
})
