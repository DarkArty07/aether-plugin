'use strict'

// The detached `aether-delegate run` that `start` spawns from the mod has none of the Lead's Bash environment: no
// AETHER_SUPERDELEGATION and no AETHER_LANE_HARNESSES (issue 82). An editing delegate must still reach its pair. These
// tests run the real bin over the fake agy with exactly that environment, so a gate that reads a variable only the Lead
// has fails here and not in the first live session.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, makeRepo } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const session = require('../plugins/aether/lib/session.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-delegate')
const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote src/new.js.', head: '', tests: 'ok', concerns: '', question: '' })

// A repository, a data directory and an external file as `begin` writes them for an editing delegate, and the
// environment of the detached run: the lane table, the data directory and the fake agy, but not the Lead's variables.
function world(t, settings) {
  const repo = makeRepo(t)
  const base = fx.laneEnv(t)
  const dataDir = base.AETHER_DATA_DIR
  const env = { ...base, PATH: process.env.PATH }
  delete env.AETHER_SUPERDELEGATION
  delete env.AETHER_LANE_HARNESSES
  if (settings) {
    const file = session.delegateFile(dataDir, 's1')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(settings))
  }
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, ['Write src/new.js saying hello and commit it.', 'FAKE-AGY: write src/new.js hello', 'FAKE-AGY: commit add new', `FAKE-AGY: answer ${DONE}`].join('\n') + '\n')
  const external = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(external), { recursive: true })
  fs.writeFileSync(external, JSON.stringify({
    id: 't1', session: 's1', cwd: repo.dir, attempt: 1, step: 'haiku', effort: 'high', launchKind: 'first', edits: true, owns: ['src/**'],
    tests: 'node -e "process.exit(0)"', brief, findings: null, carry: null, pin: null, base: repo.git('rev-parse', 'HEAD'), harness: 'agy',
    rung: { model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }, task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000,
  }))
  return { repo, env, dataDir }
}

function runDetached({ repo, env, dataDir }) {
  const r = spawnSync(process.execPath, [BIN, 'run', '--id', 't1'], { cwd: repo.dir, env: { ...env, AETHER_DATA_DIR: dataDir }, encoding: 'utf8' })
  const file = path.join(dataDir, 'delegates', 'results', 't1.json')
  assert.ok(fs.existsSync(file), `no result written: ${r.stdout}${r.stderr}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

test('an editing delegate reaches its pair from a detached run that has none of the Lead variables (issue 82)', (t) => {
  const w = world(t, { lanes: true, harnesses: ['agy'], deadlines: { quotaMs: 3000 } })
  const result = runDetached(w)
  assert.equal(result.status, 'done', JSON.stringify(result))
  assert.equal(result.ok, true)
  assert.match(result.text, /pair agy\//)
})

test('a session with superdelegation off, or with no settings file, stays off in the detached run', (t) => {
  const off = runDetached(world(t, { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } }))
  assert.equal(off.status, 'off')
  assert.equal(off.ok, false)
  const none = runDetached(world(t, null))
  assert.equal(none.status, 'off')
})
