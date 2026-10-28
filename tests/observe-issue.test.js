'use strict'

// The automatic issues of the development installation (spec 020). Every case runs a fake gh placed first on PATH, which
// records its calls and its stdin: no test reaches GitHub.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))
const { autoIssueOn } = require(path.join(PLUGIN, 'lib', 'observe.js'))
const { repoOf, draftOf, markerOf } = require(path.join(PLUGIN, 'lib', 'observe-issue.js'))

const SESSION = 'abcdef0123456789'
const MARK = 'ZEBRA-QUOKKA-7731'
const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)
const REPO = 'DarkArty07/aether-plugin'
const RISE_ID = `rise-without-reason:t2:2`

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jsonl = (list) => list.map((e) => JSON.stringify(e)).join('\n') + '\n'
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).map((e) => path.join(dir, e)) : [])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check, ms = 10000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return true
    await sleep(100)
  }
  return check()
}

// A fake gh: `issue list` answers the list the test wrote (or []), `issue create` stores its stdin as body-N.md and answers
// with a URL on the last line, `label create` succeeds. Every call is one line of calls.log.
const GH_SCRIPT = `#!/bin/sh
DIR="$FAKE_GH_DIR"
echo "CALL $*" >> "$DIR/calls.log"
case "$1 $2" in
  "issue list")
    if [ -f "$DIR/list.json" ]; then cat "$DIR/list.json"; else echo '[]'; fi
    exit 0 ;;
  "issue create")
    n=0
    [ -f "$DIR/count" ] && n=$(cat "$DIR/count")
    n=$((n + 1))
    echo $n > "$DIR/count"
    cat > "$DIR/body-$n.md"
    echo "Creating issue in ${REPO}"
    echo "https://github.com/${REPO}/issues/$((100 + n))"
    exit 0 ;;
  "label create") exit 0 ;;
  *) exit 2 ;;
esac
`

function fakeGh(t, { list } = {}) {
  const state = tempDir(t, 'aether-gh-state-')
  const bindir = tempDir(t, 'aether-gh-bin-')
  write(path.join(bindir, 'gh'), GH_SCRIPT)
  fs.chmodSync(path.join(bindir, 'gh'), 0o755)
  if (list !== undefined) write(path.join(state, 'list.json'), JSON.stringify(list))
  const calls = () => (fs.existsSync(path.join(state, 'calls.log')) ? fs.readFileSync(path.join(state, 'calls.log'), 'utf8').trim().split('\n') : [])
  return {
    env: { PATH: `${bindir}${path.delimiter}${process.env.PATH}`, FAKE_GH_DIR: state },
    state,
    calls,
    creates: () => calls().filter((line) => line.startsWith('CALL issue create')),
    bodies: () => files(state).filter((f) => /body-\d+\.md$/.test(f)).sort().map((f) => fs.readFileSync(f, 'utf8')),
  }
}

// The development installation with the option on, the way a shell gets it: the gate and the fake gh, nothing else.
const devOn = (gh) => ({ ...gh.env, AETHER_OBSERVE: 'dev', AETHER_AUTOISSUE: 'on' })

function bin(args, { dir, home = dir, cwd = dir, input = '', env = {} }) {
  const r = spawnSync(process.execPath, [BIN, ...args], { input, cwd, encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, HOME: home, ...env } })
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    json = null
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json }
}

function lead(dir, id = SESSION) { write(path.join(dir, 'sessions', `${id}.json`), '{}') }

// One rise without a verdict per task: each is a failure the reading drafts (rise-without-reason:<task>:2).
function rises(dir, tasks, session = SESSION) {
  write(path.join(dir, 'delegates', 'log.jsonl'), jsonl(tasks.map((task, i) => ({ kind: 'launch', time: 10 + i, session, task, step: 'sonnet', attempt: 2, launchKind: 'rise' }))))
}

function conversation(dir) {
  const file = path.join(dir, 'transcript.jsonl')
  write(file, jsonl([
    { type: 'user', message: { role: 'user', content: `eso no, ${MARK} ${KEY} ${GH}` } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `${MARK} model text` }] } },
  ]))
  return file
}

const sessionEnd = (transcript, over = {}) => JSON.stringify({ session_id: SESSION, hook_event_name: 'SessionEnd', reason: 'other', transcript_path: transcript, cwd: '/x', ...over })

// The reading of a dataDir, in process, as the SessionEnd hook runs it.
function read(dir, repoRoot = null) {
  return readObservations({ dataDir: dir, repoRoot, now: Date.UTC(2026, 9, 28) })
}

const ledgerOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'issues-filed.json'), 'utf8'))
const draftsOf = (dir) => files(path.join(dir, 'observe', 'issues')).filter((f) => /rise-without-reason/.test(path.basename(f)))

test('autoIssueOn: development mode and the variable or the option, with off always winning (D1, D2)', () => {
  const dev = { AETHER_OBSERVE: 'dev' }
  const cases = [
    [{}, false],
    [{ CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }, false],
    [{ AETHER_AUTOISSUE: 'on' }, false],
    [{ AETHER_OBSERVE: 'standard', AETHER_AUTOISSUE: 'on' }, false],
    [{ AETHER_OBSERVE: 'standard', CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }, false],
    [{ ...dev, CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'false' }, false],
    [{ ...dev, CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }, true],
    [{ ...dev, AETHER_AUTOISSUE: 'on' }, true],
    [{ ...dev, AETHER_AUTOISSUE: 'off', CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }, false],
    [{ ...dev, AETHER_AUTOISSUE: 'On ', CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }, true],
    [{ ...dev, AETHER_AUTOISSUE: 'On ' }, false],
    [{ AETHER_OBSERVE: 'dev', AETHER_AUTOISSUE: 'off' }, false],
  ]
  for (const [env, expected] of cases) assert.equal(autoIssueOn(env), expected, JSON.stringify(env))
  assert.equal(autoIssueOn({ CLAUDE_PLUGIN_OPTION_OBSERVEDEV: 'true', CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }), true, 'the observedev option counts as development mode')
})

test('the standard installation with the option on never calls gh, never loads the worker and never creates the ledger (C9, spec 020 D2)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, ['t2'])
  const env = { ...gh.env, CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true', AETHER_AUTOISSUE: 'on' }
  const r = bin(['hook'], { dir, home, input: sessionEnd(conversation(dir)), env })
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  assert.equal(files(path.join(dir, 'observe', 'issues')).length >= 1, true, 'the local draft is written')
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'issues-filed.json')), false)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'issues-filed.lock')), false)
  assert.deepEqual(gh.calls(), [])
  const probe = spawnSync(process.execPath, ['-e', [
    `const h = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'observe-hook.js'))})`,
    `h.handleHook(${JSON.stringify({ session_id: SESSION, hook_event_name: 'SessionEnd', reason: 'other' })}, { dataDir: ${JSON.stringify(dir)}, env: { CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true', AETHER_AUTOISSUE: 'on' }, now: 5 })`,
    `console.log(Object.keys(require.cache).some((k) => k.endsWith('observe-issue.js')))`,
  ].join('\n')], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, HOME: home } })
  assert.equal(probe.stdout.trim(), 'false', 'observe-issue.js is not loaded in the standard installation')
})

test('a session that is not the Lead launches nothing, even in development mode with the option on (E10)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const gh = fakeGh(t)
  rises(dir, ['t2'])
  const r = bin(['hook'], { dir, home, input: sessionEnd(conversation(tempDir(t))), env: devOn(gh) })
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  assert.deepEqual(fs.readdirSync(dir).sort(), ['delegates'])
  assert.deepEqual(gh.calls(), [])
})

test('the footer is added after redact(): a clean draft with its footer and marker is sent, not held (spec 020 D4)', () => {
  const finding = { id: `rise-without-reason:${'a1'.repeat(20)}`, sessions: [SESSION], issue: { title: 'Clean title', body: `## Evidence\n\n- one line\n\n## Sessions\n\n- ${SESSION}\n` } }
  const draft = draftOf(finding, { home: '/nonexistent-home', version: '9.9.9', now: Date.UTC(2026, 9, 28) })
  assert.equal(draft.held, false)
  assert.ok(draft.body.includes(markerOf(finding.id)), 'the marker is there')
  assert.ok(draft.body.includes('plugin 9.9.9 · 2026-10-28T00:00:00.000Z'), 'the footer is there')
  assert.ok(draft.body.includes(`- ${SESSION.slice(0, 8)}\n`), 'the session is cut to eight characters')
  assert.equal(draft.body.includes(SESSION), false)
  const secret = draftOf({ ...finding, issue: { title: 'T', body: `## Evidence\n\n- ${KEY}\n` } }, { home: '/nonexistent-home' })
  assert.equal(secret.held, true, 'a key in the evidence holds the draft')
})

test('a session inside the id of a finding is cut in the marker too, and the marker is the same on every run (spec 020 D4)', () => {
  const finding = { id: `rule-broken:no-wakeup-for-delegate:${SESSION}`, sessions: [SESSION], issue: { title: 'T', body: `## Evidence\n\n- one line\n\n## Sessions\n\n- ${SESSION}\n` } }
  const draft = draftOf(finding, { home: '/nonexistent-home' })
  assert.equal(draft.body.includes(SESSION), false, 'the full session is nowhere in the body, the marker included')
  assert.ok(draft.body.includes(`<!-- aether-observe:rule-broken:no-wakeup-for-delegate:${SESSION.slice(0, 8)} -->`))
  assert.equal(draftOf(finding, { home: '/nonexistent-home' }).marker, draft.marker)
})

test('the home paths of the body become ~, with the user name dropped, and redact() keeps the rest (spec 020 D4)', (t) => {
  const home = tempDir(t)
  const body = `## Evidence\n\n- ${home}/proj/a.js and /home/someone/b.js and /root/c and /Users/bob/d\n`
  const draft = draftOf({ id: 'fault:x', sessions: [], issue: { title: 'T', body } }, { home })
  assert.equal(draft.held, false)
  assert.ok(draft.body.includes('~/proj/a.js'))
  assert.ok(draft.body.includes('~/b.js'))
  assert.ok(draft.body.includes('~/c'))
  assert.ok(draft.body.includes('~/d'))
  for (const word of [home, 'someone', 'bob']) assert.equal(draft.body.includes(word), false, word)
})

test('a body that redact() changes is held: the draft stays local and nothing is sent (D4)', (t) => {
  const dir = tempDir(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, [KEY])
  read(dir)
  const r = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.equal(r.status, 0)
  assert.equal(r.json.held, 1)
  assert.equal(r.json.created, 0)
  assert.deepEqual(gh.creates(), [])
  assert.equal(draftsOf(dir).length, 1, 'the local draft is kept')
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'issues-filed.json')), false)
})

test('development mode with the option on: one gh issue create on the plugin repo, with the label, and a cleaned body (D3-D5)', async (t) => {
  const dir = tempDir(t); const home = tempDir(t); const other = makeRepo(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, ['t2'])
  // The option, not the variable, turns it on here: this is the way a installed plugin gets it.
  const env = { ...gh.env, AETHER_OBSERVE: 'dev', CLAUDE_PLUGIN_OPTION_AUTOISSUE: 'true' }
  const r = bin(['hook'], { dir, home, cwd: other.dir, input: sessionEnd(conversation(dir), { cwd: other.dir }), env })
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  const ledger = path.join(dir, 'observe', 'issues-filed.json')
  const lock = path.join(dir, 'observe', 'issues-filed.lock')
  assert.equal(await until(() => fs.existsSync(ledger) && !fs.existsSync(lock)), true, 'the worker finished')

  const creates = gh.creates()
  assert.equal(creates.length, 1)
  assert.ok(creates[0].includes(`--repo ${REPO}`), 'the plugin repo, not the cwd repo')
  assert.ok(creates[0].includes('--label aether-observe'))
  const [body] = gh.bodies()
  assert.ok(body.includes('Task t2 attempt 2 rose to step sonnet'), 'the evidence is in the body')
  assert.ok(body.includes(`- ${SESSION.slice(0, 8)}`), 'the session is cut to eight characters')
  for (const secret of [MARK, KEY, GH, SESSION, home]) assert.equal(body.includes(secret), false, 'no conversation, key, token, full session or home path')
  assert.ok(body.includes(markerOf(RISE_ID)))
  assert.ok(body.includes('Opened by aether-observe (autoissue, development mode)'))
  assert.deepEqual(ledgerOf(dir)[RISE_ID].via, 'created')
  assert.equal(ledgerOf(dir)[RISE_ID].number, 101)
  assert.equal(ledgerOf(dir)[RISE_ID].url, `https://github.com/${REPO}/issues/101`)
})

test('the names of the delegate tasks never leave: each becomes task-<8 hex> in the title, the body and the marker, and the draft stays local with the name (D9)', async (t) => {
  const dir = tempDir(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, ['revision-marketing-redaccion', 'arch-layers', 't2'])
  read(dir)
  const local = files(path.join(dir, 'observe', 'issues')).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  assert.ok(local.includes('revision-marketing-redaccion'), 'the local draft keeps the name')
  const r = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.deepEqual([r.status, r.json.created], [0, 3])
  const sent = [...gh.creates(), ...gh.bodies()].join('\n')
  for (const name of ['revision-marketing-redaccion', 'arch-layers']) assert.equal(sent.includes(name), false, `${name} is not sent`)
  const alias = (name) => `task-${require('node:crypto').createHash('sha256').update(name).digest('hex').slice(0, 8)}`
  assert.ok(sent.includes(`Task ${alias('revision-marketing-redaccion')} attempt 2 rose to step sonnet`), 'the evidence names the alias')
  assert.ok(sent.includes(`<!-- aether-observe:rise-without-reason:${alias('arch-layers')}:2 -->`), 'the marker names the alias')
  assert.ok(sent.includes('Task t2 attempt 2'), 'a name shorter than three characters is left as it is')
  // The ledger is local and keeps the real id, so the next run knows it and calls nothing.
  assert.ok(Object.keys(ledgerOf(dir)).includes('rise-without-reason:revision-marketing-redaccion:2'))
  const before = gh.calls().length
  assert.deepEqual([bin(['file-issues'], { dir, env: devOn(gh) }).json.skipped], [3])
  assert.equal(gh.calls().length, before)
})

test('a name of a task is aliased only as a whole word, and the alias is the same on every call (D9)', () => {
  const finding = { id: 'fault:x', sessions: [], issue: { title: 'T', body: '## Evidence\n\n- Task arch ran; arch-layers and archive and "arch" and arch_x\n' } }
  const now = Date.UTC(2026, 9, 28)
  const a = draftOf(finding, { home: '/nonexistent-home', tasks: ['arch'], now })
  const b = draftOf(finding, { home: '/nonexistent-home', tasks: ['arch'], now })
  assert.equal(a.body, b.body)
  assert.match(a.body, /Task task-[0-9a-f]{8} ran; arch-layers and archive and "task-[0-9a-f]{8}" and arch_x/)
})

test('a task name with a quote is aliased in its raw and in its JSON spelling, to the same alias (D9)', () => {
  const name = 'say "hi" now'
  const body = `## Evidence\n\n- Task ${name} ran\n- tasks: ${JSON.stringify([name])}\n`
  const draft = draftOf({ id: 'fault:x', sessions: [], issue: { title: 'T', body } }, { home: '/nonexistent-home', tasks: [name], now: Date.UTC(2026, 9, 28) })
  const aliases = draft.body.match(/task-[0-9a-f]{8}/g)
  assert.equal(aliases.length, 2)
  assert.equal(aliases[0], aliases[1])
  assert.equal(draft.body.includes('say "hi"'), false, 'the raw spelling is gone')
  assert.equal(draft.body.includes('say \\"hi\\"'), false, 'the JSON spelling is gone')
})

test('an issue of the marker already in gh issue list is found, not created again (D6)', (t) => {
  const dir = tempDir(t)
  const gh = fakeGh(t, { list: [{ number: 7, state: 'OPEN', url: `https://github.com/${REPO}/issues/7`, body: `old text\n${markerOf(RISE_ID)}\n` }] })
  lead(dir)
  rises(dir, ['t2'])
  read(dir)
  const r = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.deepEqual([r.status, r.json.created, r.json.found], [0, 0, 1])
  assert.deepEqual(gh.creates(), [])
  assert.deepEqual(ledgerOf(dir)[RISE_ID], { number: 7, url: `https://github.com/${REPO}/issues/7`, time: ledgerOf(dir)[RISE_ID].time, via: 'found' })
})

test('an id already in the ledger makes no gh call at all (D6)', (t) => {
  const dir = tempDir(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, ['t2'])
  read(dir)
  write(path.join(dir, 'observe', 'issues-filed.json'), JSON.stringify({ [RISE_ID]: { number: 3, url: 'u', time: 1, via: 'created' } }))
  const r = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.deepEqual([r.status, r.json.created, r.json.skipped], [0, 0, 1])
  assert.equal(fs.existsSync(gh.state + '/calls.log'), false, 'gh was not called')
  assert.deepEqual(gh.calls(), [])
})

test('maxPerSession caps the creations of a run, and maxOpen stops them all (D6)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  rises(dir, ['t1', 't2', 't3', 't4', 't5'])
  read(dir)
  const many = fakeGh(t)
  const first = bin(['file-issues'], { dir, env: devOn(many) })
  assert.deepEqual([first.status, first.json.created, first.json.skipped], [0, 3, 2])
  assert.equal(many.creates().length, 3)

  const dir2 = tempDir(t)
  lead(dir2)
  rises(dir2, ['t1', 't2', 't3'])
  read(dir2)
  const open = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, state: 'OPEN', url: `https://github.com/${REPO}/issues/${i + 1}`, body: 'other' }))
  const full = fakeGh(t, { list: open })
  const r = bin(['file-issues'], { dir: dir2, env: devOn(full) })
  assert.deepEqual([r.status, r.json.created, r.json.skipped], [0, 0, 3])
  assert.deepEqual(full.creates(), [])
})

test('gh missing from PATH exits 0, leaves the ledger and the draft, and the next run tries again (D7)', (t) => {
  const dir = tempDir(t); const empty = tempDir(t)
  lead(dir)
  rises(dir, ['t2'])
  read(dir)
  const without = bin(['file-issues'], { dir, env: { PATH: empty, AETHER_OBSERVE: 'dev', AETHER_AUTOISSUE: 'on' } })
  assert.equal(without.status, 0)
  assert.equal(without.json.error, 'gh-unavailable')
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'issues-filed.json')), false)
  assert.equal(draftsOf(dir).length, 1)

  const gh = fakeGh(t)
  const again = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.deepEqual([again.status, again.json.created], [0, 1])
})

test('an invalid repository in the manifest: repoOf is null, and the worker exits 1 without calling gh (D5)', (t) => {
  const manifests = {
    gitlab: { repository: 'https://gitlab.com/DarkArty07/aether-plugin' },
    deep: { repository: 'https://github.com/a/b/c' },
    ssh: { repository: 'git@github.com:DarkArty07/aether-plugin.git' },
    space: { repository: 'https://github.com/Dark Arty/aether' },
    missing: {},
  }
  for (const [name, manifest] of Object.entries(manifests)) {
    const file = path.join(tempDir(t), `${name}.json`)
    write(file, JSON.stringify(manifest))
    assert.equal(repoOf(file), null, name)
  }
  const good = path.join(tempDir(t), 'good.json')
  write(good, JSON.stringify({ repository: 'https://github.com/DarkArty07/aether-plugin.git' }))
  assert.equal(repoOf(good), REPO)
  assert.equal(repoOf(path.join(PLUGIN, '.claude-plugin', 'plugin.json')), REPO, 'the plugin manifest names the plugin repo')

  // The worker of a copy of the plugin whose manifest names no github repository.
  const copy = path.join(tempDir(t), 'aether')
  fs.cpSync(PLUGIN, copy, { recursive: true })
  const manifest = JSON.parse(fs.readFileSync(path.join(copy, '.claude-plugin', 'plugin.json'), 'utf8'))
  manifest.repository = 'https://gitlab.com/DarkArty07/aether-plugin'
  write(path.join(copy, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest))
  const dir = tempDir(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, ['t2'])
  read(dir)
  const r = spawnSync(process.execPath, [path.join(copy, 'bin', 'aether-observe'), 'file-issues'], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, ...devOn(gh) } })
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout.trim()).error, 'repository-invalid')
  assert.deepEqual(gh.calls(), [])
})

test('the lock: a fresh one makes the run do nothing, an old one (over five minutes) is taken over (D6)', (t) => {
  const dir = tempDir(t); const gh = fakeGh(t)
  lead(dir)
  rises(dir, ['t2'])
  read(dir)
  const lock = path.join(dir, 'observe', 'issues-filed.lock')
  write(lock, '')
  const fresh = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.deepEqual([fresh.status, fresh.json.busy, fresh.json.created], [0, true, 0])
  assert.deepEqual(gh.calls(), [])
  assert.equal(fs.existsSync(lock), true, 'the other run keeps its lock')

  const old = new Date(Date.now() - 10 * 60 * 1000)
  fs.utimesSync(lock, old, old)
  const stale = bin(['file-issues'], { dir, env: devOn(gh) })
  assert.deepEqual([stale.status, stale.json.created], [0, 1])
  assert.equal(fs.existsSync(lock), false, 'the run removes its lock')
})

test('the hook prints nothing and exits 0, also when the launch of the worker fails (E10, D7)', (t) => {
  const dir = tempDir(t); const home = tempDir(t)
  const copy = path.join(tempDir(t), 'aether')
  fs.cpSync(PLUGIN, copy, { recursive: true })
  // The worker cannot be loaded, so the launch in the hook throws: the hook must swallow it.
  write(path.join(copy, 'lib', 'observe-issue.js'), "throw new Error('the worker does not load')\n")
  lead(dir)
  rises(dir, ['t2'])
  const r = spawnSync(process.execPath, [path.join(copy, 'bin', 'aether-observe'), 'hook'], {
    input: sessionEnd(conversation(dir)), encoding: 'utf8',
    env: { ...process.env, AETHER_DATA_DIR: dir, HOME: home, AETHER_OBSERVE: 'dev', AETHER_AUTOISSUE: 'on' },
  })
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'read.json')), true, 'the reading still ran')
})

test('file-issues with the gate closed says so and exits 1; the standard installation keeps no observe folder', (t) => {
  const dir = tempDir(t)
  const r = bin(['file-issues'], { dir })
  assert.equal(r.status, 1)
  assert.equal(r.json.error, 'autoissue-off')
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false)
})
