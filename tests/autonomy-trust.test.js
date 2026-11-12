'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-trust-1'
// entrypoint is the record's entrypoint: adding an author takes words typed in a session with a terminal, cli (spec 034).
const human = (text, time, entrypoint) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, ...(entrypoint ? { entrypoint } : {}), timestamp: time, message: { role: 'user', content: text } })
const TRUST = 'confio en anthropics y en vercel-labs como autores de skills'
const NEGATED = 'no confio en anthropics todavia'

function world(t, lines = [human(TRUST, '2026-11-07T10:00:00.000Z', 'cli'), human(NEGATED, '2026-11-07T11:00:00.000Z', 'cli')]) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), lines.join('\n') + '\n')
  const data = tempDir(t, 'aether-data-')
  const file = path.join(data, 'skills', 'trusted.json')
  const run = (args) => {
    const r = spawnSync(process.execPath, [BIN, 'trust', ...args], { cwd: tempDir(t), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_SESSION_ID: '' } })
    return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) }
  }
  return { configDir, data, file, run }
}

test('trust writes an author after verifying the owner words, in lowercase and without repeats, outside any repository (R47)', (t) => {
  const w = world(t)
  const first = w.run(['--author', 'Anthropics', '--quote', 'confio en anthropics', '--session', SESSION])
  assert.deepEqual([first.status, first.json], [0, { trusted: { authors: ['anthropics'] } }])
  const second = w.run(['--author', 'vercel-labs', '--quote', 'vercel-labs como autores de skills', '--session', SESSION])
  assert.deepEqual(second.json.trusted.authors, ['anthropics', 'vercel-labs'])
  assert.deepEqual(w.run(['--author', 'anthropics', '--quote', 'confio en anthropics', '--session', SESSION]).json.trusted.authors, ['anthropics', 'vercel-labs'])
  const saved = JSON.parse(fs.readFileSync(w.file, 'utf8'))
  assert.deepEqual(saved.authors, ['anthropics', 'vercel-labs'])
  assert.equal(saved.log[0].action, 'add')
  assert.equal(saved.log[0].session, SESSION)
  assert.equal(saved.log[0].quote, 'confio en anthropics')
})

test('words that are not the owner, too short, or in a negated clause are refused and nothing is written (R47)', (t) => {
  const w = world(t)
  for (const quote of ['esto nunca lo dijo el dueño', 'corto', 'confio en anthropics y en nadie mas que el dueño no dijo']) {
    const r = w.run(['--author', 'anthropics', '--quote', quote, '--session', SESSION])
    assert.equal(r.status, 2, quote)
    assert.equal(r.json.verified, false)
  }
  const negated = w.run(['--author', 'anthropics', '--quote', 'confio en anthropics todavia', '--session', SESSION])
  assert.equal(negated.status, 2)
  assert.equal(fs.existsSync(w.file), false)
})

test('an invalid author or a wrong use is an error and writes nothing; --remove takes a name out and accepts a negated quote (R47)', (t) => {
  const w = world(t)
  for (const author of ['../x', 'a b', '', '-bad', 'x'.repeat(40)]) {
    const r = w.run(['--author', author, '--quote', 'confio en anthropics', '--session', SESSION])
    assert.equal(r.status, 1, author)
    assert.ok(r.json.error)
  }
  assert.equal(w.run(['--quote', 'confio en anthropics', '--session', SESSION]).status, 1)
  assert.equal(fs.existsSync(w.file), false)
  w.run(['--author', 'anthropics', '--quote', 'confio en anthropics', '--session', SESSION])
  const removed = w.run(['--author', 'anthropics', '--quote', 'no confio en anthropics todavia', '--session', SESSION, '--remove'])
  assert.deepEqual([removed.status, removed.json], [0, { trusted: { authors: [] } }])
  assert.equal(JSON.parse(fs.readFileSync(w.file, 'utf8')).log.at(-1).action, 'remove')
  assert.equal(w.run(['--author', 'ghost', '--quote', 'no confio en anthropics todavia', '--session', SESSION, '--remove']).status, 0)
})

test('trustAuthor is the function behind the verb and returns the reason when it refuses (R47)', (t) => {
  const w = world(t)
  const refused = autonomy.trustAuthor(w.data, { author: 'anthropics', quote: 'nadie dijo esto jamas', session: SESSION }, { configDir: w.configDir })
  assert.equal(refused.ok, false)
  assert.ok(refused.reason.length > 0)
  const bad = autonomy.trustAuthor(w.data, { author: 'a b', quote: 'confio en anthropics', session: SESSION }, { configDir: w.configDir })
  assert.deepEqual(bad, { ok: false, reason: 'invalid author: a b' })
})
