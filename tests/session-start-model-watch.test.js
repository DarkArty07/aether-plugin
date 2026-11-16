'use strict'

// Spec 043 R3: at the start of a Lead session, the notes command adds the line of new and retired models of the last
// daily reading (lib/model-watch.js), once per difference, within the output limit and trimmed first. The part
// commands never touch it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runSessionStart } = require('./helpers.js')
const { main, PART_LIMIT } = require('../plugins/aether/lib/session-start.js')
const { noticeLine } = require('../plugins/aether/lib/model-watch.js')

const AETHER = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

// A data dir whose last reading found the given ids in one harness, not yet noticed.
function dataWithResult(t, harnesses) {
  const dir = tempDir(t, 'aether-data-')
  const watch = path.join(dir, 'model-watch')
  fs.mkdirSync(watch, { recursive: true })
  const at = Date.now()
  const entries = {}
  for (const [name, diff] of Object.entries(harnesses)) {
    entries[name] = { status: 'ok', readAt: at, new: diff.new || [], retired: diff.retired || [], noticed: false, ...diff.extra }
  }
  fs.writeFileSync(path.join(watch, 'result.json'), `${JSON.stringify({ at, harnesses: entries }, null, 2)}\n`)
  return dir
}

function resultOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'model-watch', 'result.json'), 'utf8'))
}

// Runs the notes command in-process and returns its parsed output.
function startIn(dir, { root = PLUGIN, source = 'startup' } = {}) {
  let output = ''
  const envFile = path.join(dir, 'env.sh')
  main({ input: { ...AETHER, source }, env: { CLAUDE_PLUGIN_ROOT: root, AETHER_DATA_DIR: dir, CLAUDE_ENV_FILE: envFile }, cwd: dir, stdout: { write(s) { output += s } } })
  return { output, out: JSON.parse(output) }
}

test('a new model in the last reading is a line of the startup context, once', (t) => {
  const dir = dataWithResult(t, { grok: { new: ['grok-new-1'], retired: [] } })
  const first = startIn(dir)
  assert.match(first.out.hookSpecificOutput.additionalContext, /new models in grok:.*grok-new-1/)
  assert.equal(resultOf(dir).harnesses.grok.noticed, true, 'the first start marks the difference as noticed')
  const second = startIn(dir)
  assert.doesNotMatch(second.out.hookSpecificOutput.additionalContext, /new models in grok:/, 'a second start does not repeat it')
})

test('a retired model is named too, and a run without a reading adds nothing and never fails', (t) => {
  const dir = dataWithResult(t, { grok: { new: [], retired: ['grok-old-1'] } })
  const r = startIn(dir)
  assert.match(r.out.hookSpecificOutput.additionalContext, /retired models in grok:.*grok-old-1/)
  assert.equal(resultOf(dir).harnesses.grok.noticed, true)

  for (const dir2 of [tempDir(t, 'aether-data-')]) {
    const empty = startIn(dir2)
    assert.equal(empty.out.hookSpecificOutput.additionalContext, 'Aether mode is active.')
  }
  const broken = tempDir(t, 'aether-data-')
  const watch = path.join(broken, 'model-watch')
  fs.mkdirSync(watch, { recursive: true })
  fs.writeFileSync(path.join(watch, 'result.json'), 'not json{{{')
  const r2 = startIn(broken)
  assert.equal(r2.out.hookSpecificOutput.additionalContext, 'Aether mode is active.', 'broken JSON adds no line and does not fail')
})

test('a new difference after the first notice is a line again', (t) => {
  const dir = dataWithResult(t, { grok: { new: ['grok-new-1'], retired: [] } })
  startIn(dir)
  assert.equal(resultOf(dir).harnesses.grok.noticed, true)
  // The daily worker writes a new difference with noticed:false (lib/model-watch.js): the start shows it again.
  const result = resultOf(dir)
  result.harnesses.grok.new = ['grok-new-2']
  result.harnesses.grok.noticed = false
  fs.writeFileSync(path.join(dir, 'model-watch', 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  const r = startIn(dir)
  assert.match(r.out.hookSpecificOutput.additionalContext, /new models in grok:.*grok-new-2/)
  assert.doesNotMatch(r.out.hookSpecificOutput.additionalContext, /grok-new-1/)
})

test('near the output limit the trim drops the notice line before the base context, and the next start with room shows it', (t) => {
  const dir = dataWithResult(t, { grok: { new: ['grok-new-1'], retired: [] } })
  const line = noticeLine(resultOf(dir))
  assert.ok(line && line.length > 8)
  const roomy = startIn(dir, { root: PLUGIN })
  assert.match(roomy.out.hookSpecificOutput.additionalContext, /new models in grok:/)
  // A long plugin version inflates the greeting 1:1, pushing the payload just over the limit: the only line the
  // trim can drop is the notice line.
  const root = tempDir(t, 'aether-plugin-')
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true })
  // The roomy start above marked the difference as noticed, so this payload has no line: the measure is clean.
  const plain = startIn(dir, { root })
  assert.doesNotMatch(plain.out.hookSpecificOutput.additionalContext, /new models in grok:/)
  const padding = PART_LIMIT - plain.output.length - 10
  assert.ok(padding > 0, `the plain payload leaves room: ${plain.output.length}`)
  // Re-pend the difference, as the daily worker would after a new reading, and inflate the greeting.
  const pending = resultOf(dir)
  pending.harnesses.grok.noticed = false
  fs.writeFileSync(path.join(dir, 'model-watch', 'result.json'), `${JSON.stringify(pending, null, 2)}\n`)
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: 'v'.repeat(padding) }))

  const tight = startIn(dir, { root })
  assert.ok(tight.output.length <= PART_LIMIT, `the trimmed payload fits: ${tight.output.length}`)
  assert.doesNotMatch(tight.out.hookSpecificOutput.additionalContext, /new models in grok:/, 'the trim drops the notice line first')
  assert.match(tight.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./, 'the base context stays')
  assert.equal(resultOf(dir).harnesses.grok.noticed, false, 'a trimmed line stays pending')

  const later = startIn(dir)
  assert.match(later.out.hookSpecificOutput.additionalContext, /new models in grok:.*grok-new-1/, 'with room the next start shows it')
  assert.equal(resultOf(dir).harnesses.grok.noticed, true)
})

test('a part command with a pending difference neither shows the line nor marks it', (t) => {
  const repo = makeRepo(t)
  const dir = dataWithResult(t, { grok: { new: ['grok-new-1'], retired: [] } })
  const before = fs.readFileSync(path.join(dir, 'model-watch', 'result.json'), 'utf8')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: dir }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANG', 'CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_HARNESSES', 'AETHER_SUPERDELEGATION']) delete env[key]
  for (const args of [['--part', '1'], ['--part', '2'], ['--part', '3']]) {
    const r = runSessionStart(repo.dir, env, AETHER, args)
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.stdout, /new models in grok:/, `--part ${args[1]} shows no notice line`)
  }
  assert.equal(fs.readFileSync(path.join(dir, 'model-watch', 'result.json'), 'utf8'), before, 'no part marks the difference')
})

