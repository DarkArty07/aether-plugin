'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))
const { baseline } = require(path.join(PLUGIN, 'lib', 'observe-baseline.js'))
const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const MARK = 'ZEBRA-QUOKKA-7731'
const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)
const EVENTS = ['PostToolUse', 'PostToolUseFailure', 'StopFailure', 'PreCompact', 'SessionEnd']

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jsonl = (list) => list.map((e) => JSON.stringify(e)).join('\n') + '\n'
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((e) => path.join(dir, e)).filter((f) => fs.statSync(f).isFile()) : [])

function bin(args, { dir, home, cwd = dir, input = '', env = {} }) {
  return spawnSync('node', [BIN, ...args], { input, cwd, encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, HOME: home, ...env } })
}
function lead(dir, id = 's-1') { write(path.join(dir, 'sessions', `${id}.json`), '{}') }
function input(event, transcript, over = {}) {
  return JSON.stringify({
    session_id: 's-1', hook_event_name: event, tool_name: event === 'PostToolUse' ? 'ScheduleWakeup' : 'Bash', is_interrupt: false,
    error: `${MARK} error text`, trigger: 'auto', reason: 'clear', prompt: MARK, tool_input: { command: MARK, prompt: MARK },
    transcript_path: transcript, cwd: '/x', ...over,
  })
}
function transcriptFile(dir) {
  const file = path.join(dir, 'transcript.jsonl')
  write(file, jsonl([
    { type: 'user', message: { role: 'user', content: `${MARK} user text` } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `${MARK} model text` }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: `ENOENT: no such file ${MARK} token ${GH} key ${KEY}` }] } },
  ]))
  return file
}
function seedSources(dir, repo) {
  write(path.join(dir, 'delegates', 'log.jsonl'), jsonl([
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
    { kind: 'answer', time: 31, session: 's-1', task: 't2', attempt: 2, text: `${MARK} answer` },
  ]))
  write(path.join(dir, 'lanes', 's-1.jsonl'), jsonl([{ kind: 'call', time: 5, session: 's-1', harness: 'agy', group: 'flash', effort: 'medium', model: 'gemini-3.8-flash-medium', status: 'ok', durationMs: 1000, usage: { output: 10 }, prompt: MARK }]))
  write(path.join(repo.dir, '.aether', 'pending.jsonl'), jsonl([{ time: 1000, session: 's-1', class: 'push', command: `git push ${MARK}`, cwd: '/x', mode: 'enforce' }]))
  write(path.join(repo.dir, '.aether', 'autonomy', 'grants.json'), JSON.stringify({ grants: [{ class: 'push', scope: 'repo', quote: `${MARK} quote`, session: 's-1', time: 1, added: new Date(1500).toISOString() }], revoked: [] }))
}

test('in the standard installation the marked phrase reaches no file the observation writes (C7, E8)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const repo = makeRepo(t)
  lead(dir)
  seedSources(dir, repo)
  const transcript = transcriptFile(dir)
  for (const event of EVENTS) assert.equal(bin(['hook'], { dir, home, input: input(event, transcript) }).status, 0)
  const read = readObservations({ dataDir: dir, repoRoot: repo.dir })
  for (const out of [read, baseline({ from: dir, to: dir, repoRoot: repo.dir }), observe.status(dir)]) {
    assert.equal(JSON.stringify(out).includes(MARK), false)
  }
  assert.ok(read.items.some((i) => i.type === 'blocked-by-mistake'), 'the pending and grants sources were read')
  const written = files(path.join(dir, 'observe'))
  assert.ok(written.length > 3)
  for (const file of written) assert.equal(fs.readFileSync(file, 'utf8').includes(MARK), false, file)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
})

test('the development installation keeps the context of a failure and not its key or token (C8, E9)', (t) => {
  const dir = tempDir(t); const home = tempDir(t)
  lead(dir)
  const r = bin(['hook'], { dir, home, input: input('PostToolUseFailure', transcriptFile(dir)), env: { AETHER_OBSERVE: 'dev' } })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  const saved = files(path.join(dir, 'observe', 'dev'))
  assert.equal(saved.length, 1)
  const text = fs.readFileSync(saved[0], 'utf8')
  assert.ok(text.includes('ENOENT'))
  assert.equal(text.includes(GH), false)
  assert.equal(text.includes(KEY), false)
})

test('a copy in the plugin cache is standard by default, and dev with the variable or the option (C6, C7, R9)', (t) => {
  const transcript = transcriptFile(tempDir(t))
  const cache = path.join(tempDir(t), 'plugins', 'cache', 'aether-plugin', 'aether', '0.19.2')
  fs.cpSync(PLUGIN, cache, { recursive: true })
  const run = (env) => {
    const dir = tempDir(t); const home = tempDir(t)
    lead(dir)
    const base = { ...process.env, AETHER_DATA_DIR: dir, HOME: home }
    delete base.AETHER_OBSERVE
    delete base.CLAUDE_PLUGIN_OPTION_OBSERVEDEV
    const r = spawnSync('node', [path.join(cache, 'bin', 'aether-observe'), 'hook'], { input: input('PostToolUseFailure', transcript), encoding: 'utf8', env: { ...base, ...env } })
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
    return dir
  }
  const standardDir = run({})
  assert.ok(fs.existsSync(path.join(standardDir, 'observe', 'events.jsonl')), 'it gathers standard events')
  assert.deepEqual(files(path.join(standardDir, 'observe', 'dev')), [], 'and keeps no fragment')
  for (const file of files(path.join(standardDir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes(MARK), false, file)

  const devVarDir = run({ AETHER_OBSERVE: 'dev' })
  assert.equal(files(path.join(devVarDir, 'observe', 'dev')).length, 1, 'dev with variable keeps fragment')

  const devOptDir = run({ CLAUDE_PLUGIN_OPTION_OBSERVEDEV: 'true' })
  assert.equal(files(path.join(devOptDir, 'observe', 'dev')).length, 1, 'dev with option keeps fragment')
})

test('the whole detection runs by itself when a Lead session ends, with no command run (C1, E7)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const repo = makeRepo(t)
  lead(dir)
  seedSources(dir, repo)
  const r = bin(['hook'], { dir, home, input: input('SessionEnd', transcriptFile(dir), { cwd: repo.dir }) })
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  const types = read.items.map((i) => i.type)
  assert.ok(types.includes('rise-without-reason'))
  assert.ok(types.includes('blocked-by-mistake'))
  assert.ok(files(path.join(dir, 'observe', 'issues')).length >= 2)
  for (const file of files(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes(MARK), false, file)
})

test('a session that is not the Lead: each hook writes and prints nothing, anywhere (E10, C10)', (t) => {
  const dir = tempDir(t); const home = tempDir(t)
  const transcript = transcriptFile(tempDir(t))
  for (const event of EVENTS) {
    for (const env of [{}, { AETHER_OBSERVE: 'dev' }]) {
      const r = bin(['hook'], { dir, home, input: input(event, transcript), env })
      assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''], event)
    }
  }
  assert.deepEqual(fs.readdirSync(dir), [])
  assert.deepEqual(fs.readdirSync(home), [])
})

const OBSERVATION_FILES = () => [
  ...fs.readdirSync(path.join(PLUGIN, 'lib')).filter((n) => /^observe.*\.js$/.test(n)).map((n) => path.join(PLUGIN, 'lib', n)),
  path.join(PLUGIN, 'bin', 'aether-observe'),
  path.join(PLUGIN, 'hooks', 'fault-trace.mjs'),
]

test('no observation file uses the network, a process or gh (C9, R12)', () => {
  const forbidden = /node:(http|https|http2|net|tls|dgram|dns|child_process)|\bchild_process\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|\bgh\s+(issue|api|pr)\b|(?<![.\w])(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/
  for (const file of OBSERVATION_FILES()) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, file)
})

test('only lib/observe-dev.js names the transcript (C7, A4)', () => {
  const files = OBSERVATION_FILES()
  assert.ok(files.some((f) => f.endsWith('observe-dev.js')))
  for (const file of files) {
    const named = /transcript/i.test(fs.readFileSync(file, 'utf8'))
    assert.equal(named, file.endsWith('observe-dev.js'), file)
  }
})

test('a finding becomes a local draft and no issue is opened; nothing is written outside the data directory (E12, C13)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const repo = makeRepo(t); const bindir = tempDir(t)
  const sentinel = path.join(bindir, 'gh-was-called')
  write(path.join(bindir, 'gh'), `#!/bin/sh\ntouch "${sentinel}"\n`)
  fs.chmodSync(path.join(bindir, 'gh'), 0o755)
  lead(dir)
  seedSources(dir, repo)
  const r = bin(['hook'], { dir, home, input: input('SessionEnd', transcriptFile(dir), { cwd: repo.dir }), env: { PATH: `${bindir}:${process.env.PATH}` } })
  assert.equal(r.status, 0)
  assert.ok(files(path.join(dir, 'observe', 'issues')).length >= 1)
  assert.equal(fs.existsSync(sentinel), false)
  assert.deepEqual(fs.readdirSync(home), [])
})
