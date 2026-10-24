'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))

test('observeMode is dev only for the exact value dev and only inside the repository tree (R4, R9)', (t) => {
  const tree = tempDir(t)
  fs.mkdirSync(path.join(tree, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(tree, '.claude-plugin', 'marketplace.json'), '{}')
  fs.mkdirSync(path.join(tree, 'plugins', 'aether'), { recursive: true })
  const treeRoot = path.join(tree, 'plugins', 'aether')
  const cache = tempDir(t)
  const cacheRoot = path.join(cache, 'plugins', 'cache', 'aether-plugin', 'aether', '0.19.2')
  fs.mkdirSync(cacheRoot, { recursive: true })
  assert.equal(observe.observeMode({}, treeRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'standard' }, treeRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'Dev ' }, treeRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'dev' }, treeRoot), 'dev')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'dev' }, cacheRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'dev' }), 'dev', 'the tests run inside the repository tree')
})

test('cleanEvent keeps only the closed keys and identifier-shaped values (R4, R10)', () => {
  const event = observe.cleanEvent({
    time: 5, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash', interrupted: true,
    error: 'ZEBRA phrase', tool_input: { command: 'ZEBRA' }, reason: 'two words ZEBRA',
  })
  assert.deepEqual(event, { time: 5, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash', interrupted: true, reason: 'unclassified' })
  assert.equal(JSON.stringify(event).includes('ZEBRA'), false)
  assert.equal(observe.cleanEvent({ kind: 'SessionEnd' }), null)
  assert.equal(observe.cleanEvent({ time: 1, session: '../x', kind: 'SessionEnd' }), null)
  assert.equal(observe.cleanEvent('text'), null)
  assert.equal(observe.cleanEvent(null), null)
})

test('cleanEvent rejects a non-finite time, a non-boolean interrupted and a non-text value', () => {
  assert.equal(observe.cleanEvent({ time: Infinity, session: 's-1', kind: 'SessionEnd' }), null)
  assert.equal(observe.cleanEvent({ time: '5', session: 's-1', kind: 'SessionEnd' }), null)
  assert.equal(observe.cleanEvent(['x']), null)
  assert.deepEqual(
    observe.cleanEvent({ time: 1, session: 's-1', kind: 'SessionEnd', interrupted: 'yes', tool: { a: 'ZEBRA' }, class: 'x'.repeat(65) }),
    { time: 1, session: 's-1', kind: 'SessionEnd', tool: 'unclassified', class: 'unclassified' },
  )
})

test('appendEvent writes one cleaned line and readEvents reads it back, oldest first (R3)', (t) => {
  const dir = tempDir(t)
  assert.equal(observe.appendEvent(dir, { time: 2, session: 's-1', kind: 'PreCompact', trigger: 'auto', prompt: 'ZEBRA' }), true)
  assert.equal(observe.appendEvent(dir, { time: 1, session: 's-1', kind: 'SessionEnd', reason: 'clear' }), true)
  assert.equal(observe.appendEvent(dir, { session: 'bad id' }), false)
  const text = fs.readFileSync(path.join(dir, 'observe', 'events.jsonl'), 'utf8')
  assert.equal(text.includes('ZEBRA'), false)
  assert.deepEqual(observe.readEvents(dir).map((e) => e.kind), ['SessionEnd', 'PreCompact'])
  assert.deepEqual(observe.readEvents(dir, { since: 2 }).map((e) => e.kind), ['PreCompact'])
  assert.deepEqual(observe.readEvents(tempDir(t)), [])
})

test('appendEvent returns false instead of throwing when it cannot write, and readEvents skips a broken line', (t) => {
  const dir = tempDir(t)
  fs.writeFileSync(path.join(dir, 'observe'), 'a file where the folder should be')
  assert.equal(observe.appendEvent(dir, { time: 1, session: 's-1', kind: 'SessionEnd' }), false)
  const other = tempDir(t)
  fs.mkdirSync(path.join(other, 'observe'))
  fs.writeFileSync(path.join(other, 'observe', 'events.jsonl'), '{"time":1,"session":"s-1","kind":"A"}\nnot json\n[1]\n{"time":2,"session":"s-1","kind":"B"}\n')
  assert.deepEqual(observe.readEvents(other).map((e) => e.kind), ['A', 'B'])
})

test('readFaults flattens the per-session fault files and skips a broken one', (t) => {
  const dir = tempDir(t)
  const faults = path.join(dir, 'observe', 'faults')
  fs.mkdirSync(faults, { recursive: true })
  fs.writeFileSync(path.join(faults, 's-1.json'), JSON.stringify({ session: 's-1', count: 2, faults: [
    { time: 3, source: 'register.flush', class: 'write-failed' },
    { time: 1, source: 'register.flush', class: 'write-failed' },
  ] }))
  fs.writeFileSync(path.join(faults, 'broken.json'), '{')
  assert.deepEqual(observe.readFaults(dir), [
    { session: 's-1', time: 1, source: 'register.flush', class: 'write-failed' },
    { session: 's-1', time: 3, source: 'register.flush', class: 'write-failed' },
  ])
})

test('status counts files and bytes by class, and forget deletes only observe/ and only with yes (R14)', (t) => {
  const dir = tempDir(t)
  observe.appendEvent(dir, { time: 1, session: 's-1', kind: 'SessionEnd', reason: 'clear' })
  fs.mkdirSync(path.join(dir, 'observe', 'dev', 's-1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'observe', 'dev', 's-1', '1-x.json'), '{"a":1}')
  fs.mkdirSync(path.join(dir, 'usage'))
  fs.writeFileSync(path.join(dir, 'usage', 'keep.json'), '{}')
  const status = observe.status(dir)
  assert.deepEqual(Object.keys(status.classes).sort(), ['baseline', 'dev', 'events', 'faults', 'issues', 'read', 'summary'])
  assert.equal(status.classes.events.files, 1)
  assert.ok(status.classes.events.bytes > 0)
  assert.deepEqual(status.classes.dev, { files: 1, bytes: 7 })
  assert.deepEqual(status.classes.faults, { files: 0, bytes: 0 })
  assert.equal(status.bytes, status.classes.events.bytes + 7)
  assert.deepEqual(observe.forget(dir, { yes: false }), { deleted: false, files: 2 })
  assert.ok(fs.existsSync(path.join(dir, 'observe')))
  assert.deepEqual(observe.forget(dir), { deleted: false, files: 2 })
  assert.deepEqual(observe.forget(dir, { yes: 'yes' }), { deleted: false, files: 2 })
  assert.ok(fs.existsSync(path.join(dir, 'observe')))
  assert.deepEqual(observe.forget(dir, { yes: true }), { deleted: true, files: 2 })
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false)
  assert.ok(fs.existsSync(path.join(dir, 'usage', 'keep.json')))
  assert.deepEqual(observe.forget(dir, { yes: true }), { deleted: true, files: 0 })
  assert.equal(observe.status(dir).bytes, 0)
})

test('the thresholds are data in config/observe.json (A7)', () => {
  const cfg = observe.loadObserveConfig()
  const thresholds = Object.keys(cfg).filter((key) => !['correctionPatterns', 'corrections'].includes(key))
  assert.deepEqual(thresholds.sort(), ['approval', 'blockedByMistake', 'cost', 'designRounds', 'pairFailureRate', 'pairFailures', 'pairSpeed'])
  assert.deepEqual(cfg.pairFailures, { consecutive: 3 })
  assert.deepEqual(cfg.approval, { minAttempts: 5, lowRate: 0.2 })
  assert.deepEqual(cfg.pairSpeed, { minCalls: 5, ratio: 0.5 })
  assert.deepEqual(cfg.pairFailureRate, { minCalls: 5, maxRate: 0.4 })
  assert.deepEqual(cfg.designRounds, { maxRounds: 6 })
  assert.deepEqual(cfg.cost, { minCalls: 3, ratio: 2 })
  assert.deepEqual(cfg.blockedByMistake, { repeatBlocks: 2 })
})

test('observe.js uses no network or process module (R12)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe.js'), 'utf8')
  assert.doesNotMatch(source, /node:(http|https|http2|net|tls|dgram|dns|child_process)|child_process|\bfetch\s*\(/)
})
