'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runBin, makeRepo, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote the file.', head: '', tests: 'ok', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const QUOTA_TEXT = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'

const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })

function roleFake(t, { quotaFirst = false } = {}) {
  const dir = tempDir(t, 'aether-role-fake-')
  const file = path.join(dir, 'role-fake.js')
  const marker = path.join(dir, 'first-done')
  const lines = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const pi = argv.indexOf('-p')",
    "if (pi !== -1 && argv[pi + 1] !== '/usage') {",
    '  const extra = []',
    `  if (${JSON.stringify(quotaFirst)} && !fs.existsSync(${JSON.stringify(marker)})) {`,
    `    fs.writeFileSync(${JSON.stringify(marker)}, '1')`,
    "    extra.push('FAKE-AGY: exit-code 3')",
    `    extra.push(${JSON.stringify(`FAKE-AGY: exit-error ${QUOTA_TEXT}`)})`,
    `  } else if (argv[pi + 1].startsWith(${JSON.stringify(fx.roleBody('reviewer').slice(0, 120))})) {`,
    `    extra.push('FAKE-AGY: answer ' + ${JSON.stringify(READY)})`,
    '  }',
    "  if (extra.length > 0) argv[pi + 1] = argv[pi + 1] + '\\n' + extra.join('\\n')",
    '}',
    `const r = spawnSync(${JSON.stringify(fx.FAKE_AGY)}, argv, { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
  ]
  fs.writeFileSync(file, lines.join('\n') + '\n')
  fs.chmodSync(file, 0o755)
  return file
}

function writeBrief(repo, text) {
  const file = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(file, text)
  return file
}

test('the implementer prompt instructs the pair to report BLOCKED if tests require changing paths outside Owns (issue #250)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const briefText = [
    'Write src/new.js saying hello and commit it.',
    'FAKE-AGY: write src/new.js hello',
    'FAKE-AGY: commit add new',
    `FAKE-AGY: answer ${DONE}`,
  ].join('\n')
  const brief = writeBrief(repo, briefText)
  const r = runBin(fx.LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/new.js', '--tests', 'node -e "process.exit(0)"', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json?.status, 'done')
  const prompt = fs.readFileSync(path.join(repo.dir, '.aether', 'runs', json.id, 'lanes', 'task-1-1-implement', 'prompt.md'), 'utf8')
  assert.match(prompt, /## Paths you own/)
  assert.match(prompt, /You may change only these paths:\n- src\/new\.js/)
  const instruction = 'If the tests cannot pass without changing a path outside that list, stop at once and report status `BLOCKED`, naming the path and the test in `question`, instead of working on.'
  assert.ok(prompt.includes(instruction), `implementer prompt should include BLOCKED instruction, got: ${prompt}`)
  assert.ok(
    prompt.indexOf('- src/new.js') !== -1 && prompt.indexOf('- src/new.js') < prompt.indexOf(instruction),
    `the BLOCKED instruction should come after the owned-paths list, got: ${prompt}`,
  )
})

test('an implementer that answers BLOCKED ends the delegate command in one call with status blocked, question, and tried (#294)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const question = 'Need to edit src/outside.js to export helper().'
  const blocked = JSON.stringify({ status: 'BLOCKED', summary: 'partial work', head: '', tests: '', concerns: '', question })
  const brief = writeBrief(repo, [
    'Write src/new.js.',
    'FAKE-AGY: write src/new.js partial',
    `FAKE-AGY: answer ${blocked}`,
  ].join('\n'))
  const r = runBin(fx.LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/new.js', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json?.status, 'blocked')
  assert.equal(json?.cause, 'blocked')
  assert.equal(json?.question, question)
  assert.equal(json?.tried?.length, 1)
  assert.equal(json.tried[0].cause, 'blocked')
  assert.ok(typeof json.tried[0].patch === 'string' && fs.existsSync(json.tried[0].patch), `expected salvaged patch, got ${json.tried[0].patch}`)
  const choices = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'choice' && e.role === 'implementer')
  assert.equal(choices.length, 1, 'should not try a second pair after BLOCKED')
})

test('an implementer that answers NEEDS_CONTEXT ends in one call with status blocked and its question (#294)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const question = 'Which config key should be used?'
  const needsContext = JSON.stringify({ status: 'NEEDS_CONTEXT', summary: 'unclear', head: '', tests: '', concerns: '', question })
  const brief = writeBrief(repo, [
    'Write src/new.js.',
    `FAKE-AGY: answer ${needsContext}`,
  ].join('\n'))
  const r = runBin(fx.LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/new.js', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json?.status, 'blocked')
  assert.equal(json?.cause, 'needs-context')
  assert.equal(json?.question, question)
  assert.equal(json?.tried?.length, 1)
  assert.equal(json.tried[0].cause, 'needs-context')
})

test('a pair that fails for quota still tries the next pair (#294)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { quotaFirst: true }) })
  const question = 'Need src/other.js in Owns.'
  const blocked = JSON.stringify({ status: 'BLOCKED', summary: '', head: '', tests: '', concerns: '', question })
  const brief = writeBrief(repo, [
    'Write src/new.js.',
    `FAKE-AGY: answer ${blocked}`,
  ].join('\n'))
  const r = runBin(fx.LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/new.js', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json?.status, 'blocked')
  assert.equal(json?.question, question)
  assert.equal(json?.tried?.length, 2, 'first pair failed for quota, second pair answered BLOCKED')
  assert.equal(json.tried[1].cause, 'blocked')
})
