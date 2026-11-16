'use strict'

// Support for the per-session run tests (spec 041): a project where several Lead sessions can each open a run.

const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const A = 'sess-aaaa-1111'
const B = 'sess-bbbb-2222'
const C = 'sess-cccc-3333'
const QUOTE = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const OFF_QUOTE = 'apaga el freno de cuota, sigue trabajando aunque se agote'
const MIN = 60 * 1000
const HOUR = 60 * MIN
const T0 = Date.parse('2026-11-16T10:00:00.000Z')

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text } })

// A project, a data directory where every session is marked as a Lead session, and a Claude config directory with one
// headless transcript per session holding the owner's two quotes. open(id) starts a run for that session.
function setupRuns(t, { ids = [A, B, C], repo = makeRepo(t), dataDir = useDataDir(t) } = {}) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  for (const id of ids) {
    markSession(dataDir, id, 1000, { repo: repo.dir, claude: null })
    const lines = [human(QUOTE, '2026-11-16T09:50:00.000Z'), human(OFF_QUOTE, '2026-11-16T09:51:00.000Z')]
    fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.join('\n') + '\n')
  }
  let tick = 0
  const open = (id, extra = {}, now = T0 + 1000 * tick++) =>
    autonomy.start(repo.dir, { quote: QUOTE, session: id, ...extra }, { configDir, dataDir, now })
  const file = (runId) => autonomy.runPaths(repo.dir, runId).runFile
  const read = (runId) => JSON.parse(fs.readFileSync(file(runId), 'utf8'))
  const raw = (runId) => fs.readFileSync(file(runId), 'utf8')
  const patch = (runId, change) => {
    const run = read(runId)
    change(run)
    fs.writeFileSync(file(runId), JSON.stringify(run, null, 2) + '\n')
    return run
  }
  return { repo, dataDir, configDir, open, read, raw, patch }
}

module.exports = { A, B, C, QUOTE, OFF_QUOTE, MIN, HOUR, T0, human, setupRuns }
