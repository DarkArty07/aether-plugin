'use strict'

// Launch-refusal and autonomy minors of #232 (13, 14, 16).
// Each test below fails before its fix and passes after it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const git = require('../plugins/aether/lib/git.js')

const SESSION = 'sess-refusal-1'
const QUOTE = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text } })

// A real repository, a data dir with SESSION marked as a Lead session, and a
// Claude config directory holding only SESSION's transcript.
function setup(t) {
  const repo = makeRepo(t)
  const dataDir = useDataDir(t)
  require('../plugins/aether/lib/session.js').markSession(dataDir, SESSION, 1000, { repo: repo.dir, claude: null })
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), human(QUOTE, '2026-10-09T19:50:00.000Z') + '\n')
  return { repo, dataDir, configDir }
}

test('an open run whose run.json is unreadable is a refusal, not a throw (#232 13)', (t) => {
  const { repo, dataDir, configDir } = setup(t)
  const started = autonomy.start(repo.dir, { quote: QUOTE, session: SESSION }, { configDir, dataDir, now: Date.parse('2026-10-09T20:00:00.000Z') })
  assert.equal(started.ok, true)
  // run.json becomes unreadable: a directory in its place.
  fs.rmSync(started.runFile, { recursive: true, force: true })
  fs.mkdirSync(started.runFile, { recursive: true })
  let refusal
  assert.doesNotThrow(() => {
    refusal = autonomy.launchRefusal(repo.dir, { session: SESSION, dataDir, now: Date.parse('2026-10-09T20:00:01.000Z') })
  })
  assert.ok(refusal, 'an unreadable run state refuses the launch')
  assert.match(refusal.message, /the open run's state could not be read/)
})

test('the not-a-repository probe lives in git.js as isRepository (#232 14)', (t) => {
  assert.equal(typeof git.isRepository, 'function')
  assert.equal(git.isRepository(makeRepo(t).dir), true)
  assert.equal(git.isRepository(tempDir(t, 'aether-nogit-')), false)
  const source = fs.readFileSync(require.resolve('../plugins/aether/lib/autonomy.js'), 'utf8')
  assert.ok(!source.includes('not a git repository'), 'autonomy.js keeps no inline probe')
  assert.ok(!source.includes('LC_ALL'), 'autonomy.js keeps no inline locale probe')
})

test('aether-autonomy start reads the transcript from CLAUDE_CONFIG_DIR (#232 16)', (t) => {
  const repo = makeRepo(t)
  // The owner's words live only in this temp config dir, not in the ambient one.
  const configDir = tempDir(t, 'aether-claude-start-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), human(QUOTE, '2026-10-09T19:50:00.000Z') + '\n')
  const dataDir = tempDir(t, 'aether-data-start-')
  // An explicit env, not the ambient process.env: start must honor its
  // CLAUDE_CONFIG_DIR the way trust does, instead of the ambient one.
  const env = {
    PATH: process.env.PATH,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_SESSION_ID: SESSION,
    AETHER_DATA_DIR: dataDir,
  }
  const { main } = require('../plugins/aether/lib/autonomy-command.js')
  const res = main(['start', '--quote', QUOTE], { cwd: repo.dir, env })
  assert.equal(res.code, 0, JSON.stringify(res.out))
  assert.ok(res.out.started.id, 'the run starts from the transcript in CLAUDE_CONFIG_DIR')
})
