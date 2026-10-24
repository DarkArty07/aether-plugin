'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const dev = require(path.join(PLUGIN, 'lib', 'observe-dev.js'))
const { handleHook } = require(path.join(PLUGIN, 'lib', 'observe-hook.js'))
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))
const { readSummary, pruneObserve } = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')
const CFG = observe.loadObserveConfig()
const DAY = 24 * 60 * 60 * 1000
const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((e) => path.join(dir, e)).filter((f) => fs.statSync(f).isFile()) : [])
const U = (text, timestamp) => ({ type: 'user', timestamp, message: { role: 'user', content: text } })
const A = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const TR = (text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: text }] } })
const withCorrections = (over) => ({ ...CFG, corrections: { ...CFG.corrections, ...over } })
function lead(dir, id = 's-1') { write(path.join(dir, 'sessions', `${id}.json`), '{}') }

test('the correction lists and the limits are data in config/observe.json (A14, R18)', () => {
  assert.deepEqual(Object.keys(CFG.correctionPatterns).sort(), ['en', 'es'])
  assert.deepEqual(CFG.correctionPatterns.es, ['eso no', 'no era', 'te dije', 'ya te dije', 'otra vez', 'no quiero', 'está mal', 'incorrecto', 'no es lo que'])
  assert.deepEqual(CFG.correctionPatterns.en, ["that's not", 'i said', 'wrong', 'again', 'not what i'])
  assert.deepEqual(CFG.corrections, { maxPerSession: 20, maxScanBytes: 20000000 })
  assert.equal(CFG.pairFailures.consecutive, 3, 'the thresholds of Task 1 are still there')
})

test('scanCorrections keeps only the owner messages with a correction phrase, with the Lead text before each, redacted (R18)', (t) => {
  const file = path.join(tempDir(t), 't.jsonl')
  fs.writeFileSync(file, lines([
    A('I created the file with the old name'),
    U('Eso NO es lo que pedí', '2026-10-23T10:00:00.000Z'),
    TR("wrong again, that's not it"),
    A(`I renamed it. The key is ${KEY} and the rest follows`),
    U('compare against the baseline; the wrongdoing is unrelated'),
    { ...U('te dije que no', '2026-10-23T10:01:00.000Z'), isMeta: true },
    { ...U('eso no', '2026-10-23T10:02:00.000Z'), isSidechain: true },
    { ...A('text of a sidechain'), isSidechain: true },
    U(`That's not what I asked. token ${KEY} ${'x'.repeat(600)}`, '2026-10-23T10:03:00.000Z'),
    A('Done again'),
    U('ESTÁ MAL'),
  ]))
  const result = dev.scanCorrections(file, CFG)
  assert.equal(result.count, 3)
  assert.equal(result.items.length, 3)
  assert.deepEqual(result.items[0], { time: '2026-10-23T10:00:00.000Z', owner: 'Eso NO es lo que pedí', before: 'I created the file with the old name' })
  assert.ok(result.items[1].owner.startsWith("That's not what I asked."))
  assert.ok(result.items[1].before.includes('I renamed it.'), 'the sidechain text is not the Lead text before it')
  assert.deepEqual(result.items[2], { time: '', owner: 'ESTÁ MAL', before: 'Done again' })
  assert.ok(result.items.every((item) => item.owner.length <= 400 && item.before.length <= 400))
  assert.equal(JSON.stringify(result).includes(KEY), false)
})

test('the phrases match whole words, in any case and with a typographic apostrophe (A14)', (t) => {
  const hits = ['Eso no', 'NO ERA así', 'ya te dije', 'Otra vez', 'no quiero', 'Está mal', 'Incorrecto', 'no es lo que quería', 'That’s not it', 'I said so', 'WRONG', 'again?', 'not what I wanted']
  const misses = ['nonsense', 'the wrongdoing', 'compare against it', 'tedije', 'incorrectos', 'beyond the mark', 'esto no', 'unwrong']
  const dir = tempDir(t)
  write(path.join(dir, 'hits.jsonl'), lines(hits.map((text) => U(text))))
  write(path.join(dir, 'misses.jsonl'), lines(misses.map((text) => U(text))))
  assert.deepEqual(dev.scanCorrections(path.join(dir, 'hits.jsonl'), CFG).items.map((item) => item.owner), hits)
  assert.deepEqual(dev.scanCorrections(path.join(dir, 'misses.jsonl'), CFG), { count: 0, items: [] })
})

test('both sides are cut to 400 characters, and the Lead side is the last 400 (R18)', (t) => {
  const file = path.join(tempDir(t), 't.jsonl')
  fs.writeFileSync(file, lines([A('a'.repeat(1000) + 'END'), U('wrong ' + 'y'.repeat(1000))]))
  const [item] = dev.scanCorrections(file, CFG).items
  assert.equal(item.owner.length, 400)
  assert.ok(item.owner.startsWith('wrong yyy'))
  assert.equal(item.before.length, 400)
  assert.ok(item.before.endsWith('END'))
})

test('the scan stops at the cap and at the byte limit, and never throws (R18)', (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'c.jsonl')
  fs.writeFileSync(file, lines(Array.from({ length: 30 }, (_, i) => U(`wrong ${i}`))))
  assert.deepEqual(dev.scanCorrections(file, withCorrections({ maxPerSession: 3 })).items.map((item) => item.owner), ['wrong 0', 'wrong 1', 'wrong 2'])
  assert.equal(dev.scanCorrections(file, CFG).count, 20, 'the configured cap is 20')
  fs.writeFileSync(file, lines([U('wrong first')]) + lines([A('p'.repeat(600))]) + lines([U('wrong late')]))
  assert.equal(dev.scanCorrections(file, CFG).count, 2)
  assert.deepEqual(dev.scanCorrections(file, withCorrections({ maxScanBytes: 300 })).items.map((item) => item.owner), ['wrong first'])
  assert.deepEqual(dev.scanCorrections(path.join(dir, 'missing.jsonl'), CFG), { count: 0, items: [] })
  assert.deepEqual(dev.scanCorrections(null, CFG), { count: 0, items: [] })
})

test('captureCorrections writes one private file per session and rewrites it, idempotent (R18)', (t) => {
  const dir = tempDir(t)
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, lines([A('built it'), U('eso no', '2026-10-23T10:00:00.000Z'), U('otra vez, ya te dije', '2026-10-23T10:05:00.000Z')]))
  const call = (now) => dev.captureCorrections({ dataDir: dir, session: 's-1', input: { transcript_path: transcript }, now })
  const written = call(1700)
  assert.equal(written, path.join(dir, 'observe', 'dev', 's-1', 'corrections.json'))
  assert.equal(fs.statSync(written).mode & 0o777, 0o600)
  const saved = JSON.parse(fs.readFileSync(written, 'utf8'))
  assert.deepEqual([saved.session, saved.time, saved.count], ['s-1', 1700, 2])
  assert.deepEqual(saved.items.map((item) => [item.time, item.owner, item.before]), [
    ['2026-10-23T10:00:00.000Z', 'eso no', 'built it'],
    ['2026-10-23T10:05:00.000Z', 'otra vez, ya te dije', 'built it'],
  ])
  const first = fs.readFileSync(written, 'utf8')
  assert.equal(call(1700), written)
  assert.equal(fs.readFileSync(written, 'utf8'), first, 'the same conversation gives the same file')
  assert.deepEqual(fs.readdirSync(path.dirname(written)), ['corrections.json'], 'no temporary file is left')
  fs.appendFileSync(transcript, lines([U('wrong')]))
  call(1800)
  assert.equal(JSON.parse(fs.readFileSync(written, 'utf8')).count, 3)
  assert.equal(observe.status(dir).classes.dev.files, 1, 'status counts it in the dev class')
  observe.forget(dir, { yes: true })
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false, 'forget --yes removes it with the rest')
})

test('captureCorrections writes nothing without a match, a readable conversation or a valid session (R18)', (t) => {
  const dir = tempDir(t)
  const quiet = path.join(dir, 'quiet.jsonl')
  const loud = path.join(dir, 'loud.jsonl')
  fs.writeFileSync(quiet, lines([U('hello'), A('hi')]))
  fs.writeFileSync(loud, lines([U('wrong')]))
  const run = (session, input) => dev.captureCorrections({ dataDir: dir, session, input, now: 1 })
  assert.equal(run('s-2', { transcript_path: quiet }), null)
  assert.equal(run('s-2', { transcript_path: path.join(dir, 'missing.jsonl') }), null)
  assert.equal(run('s-2', {}), null)
  assert.equal(run('s-2', null), null)
  assert.equal(run('../x', { transcript_path: loud }), null)
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false)
})

test('corrections.json does not count among the 50 fragments of a session (R18)', (t) => {
  const dir = tempDir(t)
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, lines([U('start'), U('wrong'), TR('ENOENT: no such file')]))
  assert.ok(dev.captureCorrections({ dataDir: dir, session: 's-1', input: { transcript_path: transcript }, now: 1 }))
  for (let i = 0; i < 50; i++) assert.ok(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'PreCompact', input: { transcript_path: transcript }, now: i }), `fragment ${i}`)
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'PreCompact', input: { transcript_path: transcript }, now: 99 }), null)
  assert.equal(fs.readdirSync(path.join(dir, 'observe', 'dev', 's-1')).length, 51)
})

test('corrections.json is pruned at 30 days with its session folder, and a recent one stays (R18)', (t) => {
  const dir = tempDir(t)
  const now = Date.now()
  const old = new Date(now - 40 * DAY)
  for (const id of ['s-old', 's-new']) write(path.join(dir, 'observe', 'dev', id, 'corrections.json'), JSON.stringify({ session: id, time: 1, count: 1, items: [{ time: '', owner: 'wrong', before: '' }] }))
  const oldFolder = path.join(dir, 'observe', 'dev', 's-old')
  fs.utimesSync(path.join(oldFolder, 'corrections.json'), old, old)
  fs.utimesSync(oldFolder, old, old)
  pruneObserve(dir, { days: 30, now })
  assert.equal(fs.existsSync(oldFolder), false)
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'dev', 's-new', 'corrections.json')))
})

test('the reading reports one friction item per session with the count and the times, never the text (R18, E15)', (t) => {
  const dir = tempDir(t)
  for (const [id, n] of [['s-1', 2], ['s-2', 1]]) {
    write(path.join(dir, 'observe', 'dev', id, 'corrections.json'), JSON.stringify({
      session: id, time: 100, count: n,
      items: Array.from({ length: n }, (_, i) => ({ time: `2026-10-2${i + 1}T10:00:00.000Z`, owner: 'ZEBRA eso no', before: 'ZEBRA before' })),
    }))
  }
  write(path.join(dir, 'observe', 'dev', 's-3', '5-PreCompact.json'), '{"fragment":[]}')
  const { items } = readObservations({ dataDir: dir, repoRoot: null, now: 5000, pairs: [], cfg: CFG })
  const found = items.filter((item) => item.type === 'owner-correction')
  assert.deepEqual(found.map((item) => item.id).sort(), ['owner-correction:s-1', 'owner-correction:s-2'], 'a session with only a fragment has none')
  const one = found.find((item) => item.id === 'owner-correction:s-1')
  assert.equal(one.kind, 'friction')
  assert.deepEqual(one.numbers, { count: 2 })
  assert.deepEqual(one.sessions, ['s-1'])
  assert.equal(one.firstTime, Date.parse('2026-10-21T10:00:00.000Z'))
  assert.equal(one.lastTime, Date.parse('2026-10-22T10:00:00.000Z'))
  assert.ok(one.evidence.some((line) => line.includes('2026-10-21T10:00:00.000Z') && line.includes('2026-10-22T10:00:00.000Z')))
  assert.ok(one.evidence.some((line) => line.includes('observe/dev/s-1/corrections.json')))
  assert.ok(one.evidence.some((line) => line.includes('heuristic of words')))
  assert.equal(JSON.stringify(items).includes('ZEBRA'), false)
  assert.equal(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8').includes('ZEBRA'), false)
  assert.equal(readObservations({ dataDir: tempDir(t), repoRoot: null, now: 1, pairs: [], cfg: CFG }).items.some((item) => item.type === 'owner-correction'), false)
})

test('in the development installation SessionEnd keeps the corrections and the same reading reports them (E15, C14)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, lines([A('done'), U(`ZEBRA eso no, otra vez ${KEY}`, '2026-10-23T10:00:00.000Z'), U('wrong again', '2026-10-23T10:09:00.000Z')]))
  const input = { session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', transcript_path: transcript, cwd: tempDir(t) }
  assert.deepEqual(handleHook(input, { dataDir: dir, now: 5000, env: { AETHER_OBSERVE: 'dev' } }), { recorded: true, fragment: null })
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'dev', 's-1', 'corrections.json'), 'utf8'))
  assert.equal(saved.count, 2)
  assert.ok(saved.items[0].owner.includes('ZEBRA'), 'the development installation keeps the text')
  assert.equal(JSON.stringify(saved).includes(KEY), false)
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  const item = read.items.find((i) => i.type === 'owner-correction')
  assert.ok(item, 'the reading of the same SessionEnd already has it')
  assert.equal(item.numbers.count, 2)
  assert.equal(JSON.stringify(read).includes('ZEBRA'), false)
  assert.equal(JSON.stringify(readSummary(dir)).includes('ZEBRA'), false)
  for (const file of files(path.join(dir, 'observe', 'issues'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
  handleHook(input, { dataDir: dir, now: 5001, env: { AETHER_OBSERVE: 'dev' } })
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'dev', 's-1', 'corrections.json'), 'utf8')).count, 2, 'a second SessionEnd rewrites, it does not add')
})

const STANDARD_SCRIPT = [
  "const fs = require('node:fs')",
  'const [hook, voice, input, dataDir, transcript] = process.argv.slice(1)',
  'const touched = []',
  "for (const name of ['readFileSync', 'openSync', 'statSync', 'existsSync', 'createReadStream', 'readFile', 'open']) {",
  '  const original = fs[name]',
  '  fs[name] = (...args) => { if (String(args[0]) === transcript) touched.push(name); return original.apply(fs, args) }',
  '}',
  'const voiceModule = require(voice)',
  'let ownerCalls = 0',
  'const originalOwnerMessages = voiceModule.ownerMessages',
  'voiceModule.ownerMessages = (...args) => { ownerCalls++; return originalOwnerMessages(...args) }',
  "const { handleHook } = require(hook)",
  'handleHook(JSON.parse(input), { dataDir, env: {}, now: 9 })',
  "const devLoaded = Object.keys(require.cache).some((key) => key.endsWith('observe-dev.js'))",
  'process.stdout.write(JSON.stringify({ touched, ownerCalls, devLoaded }))',
].join('\n')

test('the standard installation never opens the conversation, never reads the owner messages and keeps no ZEBRA (C7, C14, E15)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, lines([A('done'), U('ZEBRA eso no, te dije otra vez', '2026-10-23T10:00:00.000Z')]))
  const input = JSON.stringify({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', transcript_path: transcript, cwd: tempDir(t) })
  const r = spawnSync(process.execPath, ['-e', STANDARD_SCRIPT, path.join(PLUGIN, 'lib', 'observe-hook.js'), path.join(PLUGIN, 'lib', 'voice.js'), input, dir, transcript], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), { touched: [], ownerCalls: 0, devLoaded: false })
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'events.jsonl')), 'the hook did run')
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
  for (const file of files(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
})

test('a copy in the plugin cache keeps corrections with the variable on or the option on (C6, C14)', (t) => {
  const transcriptOf = (dir) => {
    const file = path.join(dir, 't.jsonl')
    fs.writeFileSync(file, lines([A('done'), U('ZEBRA eso no, te dije otra vez', '2026-10-23T10:00:00.000Z')]))
    return file
  }
  const endSession = (target, env = {}) => {
    const dir = tempDir(t)
    lead(dir)
    const base = { ...process.env, AETHER_DATA_DIR: dir, HOME: tempDir(t) }
    delete base.AETHER_OBSERVE
    delete base.CLAUDE_PLUGIN_OPTION_OBSERVEDEV
    const input = JSON.stringify({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', transcript_path: transcriptOf(dir), cwd: tempDir(t) })
    const r = spawnSync('node', [target, 'hook'], { input, encoding: 'utf8', env: { ...base, ...env } })
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
    return dir
  }
  const cache = path.join(tempDir(t), 'plugins', 'cache', 'aether-plugin', 'aether', '0.19.2')
  fs.cpSync(PLUGIN, cache, { recursive: true })
  const cacheBin = path.join(cache, 'bin', 'aether-observe')

  const standardDir = endSession(cacheBin, {})
  assert.equal(fs.existsSync(path.join(standardDir, 'observe', 'dev')), false)
  for (const file of files(path.join(standardDir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)

  const devVarDir = endSession(cacheBin, { AETHER_OBSERVE: 'dev' })
  assert.ok(fs.existsSync(path.join(devVarDir, 'observe', 'dev', 's-1', 'corrections.json')), 'cache copy with variable on keeps corrections')

  const devOptDir = endSession(cacheBin, { CLAUDE_PLUGIN_OPTION_OBSERVEDEV: 'true' })
  assert.ok(fs.existsSync(path.join(devOptDir, 'observe', 'dev', 's-1', 'corrections.json')), 'cache copy with option on keeps corrections')
})

test('the guide says what the development installation keeps about the corrections (R18, R16)', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', 'observe.md'), 'utf8')
  for (const word of ['corrections.json', 'correctionPatterns', 'aether-observe forget --yes', 'heuristic of words']) assert.ok(page.includes(word), word)
})
