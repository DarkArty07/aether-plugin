'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, makeRepo, tempDir } = require('./helpers.js')

function start(cwd, data, sessionId, source = 'startup') {
  const input = { hook_event_name: 'SessionStart', session_id: sessionId, source, agent_type: 'aether:lead' }
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', 'AETHER_SUPERDELEGATION']) delete env[key]
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd, encoding: 'utf8', input: JSON.stringify(input), env })
  return { status: r.status, context: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null, stderr: r.stderr }
}

// A run state as `aether-autonomy start` writes it (session null writes none, as the previous version did).
function writeRun(mainRoot, id, session) {
  const dir = path.join(mainRoot, '.aether', 'autonomy', id)
  fs.mkdirSync(dir, { recursive: true })
  const run = {
    id,
    ...(session === null ? {} : { session }),
    quote: 'trabaja por horas en esto',
    quoteTime: '2026-10-09T19:50:00.000Z',
    started: '2026-10-09T20:00:00.000Z',
    ceilings: { hours: 8, usd: 50, source: { hours: 'default', usd: 'default' } },
    spend: [],
    ended: null,
    outcome: null,
  }
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run))
  return path.join(dir, 'diary.md')
}

const ID1 = 'auto-20261009-200000-ab12'
const ID2 = 'auto-20261009-210000-cd34'
const own = (id, diary) => `Autonomous run ${id} is open: load the aether:autonomous-runs skill, then read ${diary} and run \`aether-autonomy status\` before anything else.`
const others = (list) => `Autonomous runs of other sessions are open (information only, not yours): ${list.map(([id, s]) => `${id} (session ${s})`).join(', ')}. If one of them is yours from a restarted session, continue it before anything else: ${list.map(([id]) => `aether-autonomy continue ${id}`).join(' or ')}.`

test('R10: the own run is named, and the runs of other sessions follow apart as information with their continue command', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID1, 's1')
  writeRun(repo.dir, ID2, 's2')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), 's1')
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.endsWith(`${own(ID1, diary)} ${others([[ID2, 's2']])}`), r.context.slice(-600))
})

test('R10 and US13: a restarted session with a new id is told it has no run, which run is open and how to continue it', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID1, 'old-session')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), 'new-session')
  assert.ok(r.context.endsWith(`This session has no autonomous run open. ${others([[ID1, 'old-session']])}`), r.context.slice(-600))
  assert.ok(!r.context.includes(`Autonomous run ${ID1} is open`))
  assert.ok(r.context.includes(`aether-autonomy continue ${ID1}`))
})

test('R10, R12: with one session the note is the one of today, also for a run of the previous format with no session', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID1, 's1')
  assert.ok(start(repo.dir, tempDir(t, 'aether-data-'), 's1').context.endsWith(own(ID1, diary)))
  const old = makeRepo(t)
  const oldDiary = writeRun(old.dir, ID1, null)
  const r = start(old.dir, tempDir(t, 'aether-data-'), 's9')
  assert.ok(r.context.endsWith(own(ID1, oldDiary)), r.context.slice(-400))
  assert.ok(!r.context.includes('information only'))
})

test('R10: a session with several runs of others lists them all', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID1, 's2')
  writeRun(repo.dir, ID2, 's3')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), 's1')
  assert.ok(r.context.endsWith(`This session has no autonomous run open. ${others([[ID1, 's2'], [ID2, 's3']])}`), r.context.slice(-700))
})
