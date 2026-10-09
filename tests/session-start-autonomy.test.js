'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, makeRepo, tempDir } = require('./helpers.js')

function start(cwd, data) {
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data },
  })
  return { status: r.status, context: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null, stderr: r.stderr }
}

// A run state as `aether-autonomy start` writes it; returns the run's diary path.
function writeRun(mainRoot, id, ended) {
  const dir = path.join(mainRoot, '.aether', 'autonomy', id)
  fs.mkdirSync(dir, { recursive: true })
  const run = {
    id,
    session: 's1',
    quote: 'trabaja por horas en esto',
    quoteTime: '2026-10-09T19:50:00.000Z',
    started: '2026-10-09T20:00:00.000Z',
    ceilings: { hours: 8, usd: 50, source: { hours: 'default', usd: 'default' } },
    spend: [],
    ended,
    outcome: ended ? 'done' : null,
  }
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run))
  return path.join(dir, 'diary.md')
}

const ID = 'auto-20261009-200000-ab12'
const note = (diary) => `Autonomous run ${ID} is open: read ${diary} and run \`aether-autonomy status\` before anything else.`

test('session start points a new Lead to the open autonomous run', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID, null)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.endsWith(note(diary)), r.context.slice(-300))
})

test('the note names the main checkout, also from a linked worktree', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID, null)
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'feature/y', linked)
  const r = start(linked, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.endsWith(note(diary)), r.context.slice(-300))
})

test('no note when the run has ended, or outside a git repository', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID, '2026-10-09T22:00:00.000Z')
  const ended = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(ended.status, 0, ended.stderr)
  assert.doesNotMatch(ended.context, /Autonomous run \S+ is open/)
  const outside = start(tempDir(t), tempDir(t, 'aether-data-'))
  assert.equal(outside.status, 0, outside.stderr)
  assert.doesNotMatch(outside.context, /Autonomous run \S+ is open/)
})

test('a run state that cannot be read never blocks the session', (t) => {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'autonomy', 'auto-x'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'autonomy', 'auto-x', 'run.json'), 'nope')
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.context, /^Aether mode is active\./)
  assert.doesNotMatch(r.context, /Autonomous run \S+ is open/)
})
