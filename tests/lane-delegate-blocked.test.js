'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runBin, makeRepo, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote the file.', head: '', tests: 'ok', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })

const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })

function roleFake(t) {
  const file = path.join(tempDir(t, 'aether-role-fake-'), 'role-fake.js')
  const lines = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const pi = argv.indexOf('-p')",
    "if (pi !== -1 && argv[pi + 1] !== '/usage') {",
    '  const extra = []',
    `  if (argv[pi + 1].startsWith(${JSON.stringify(fx.roleBody('reviewer').slice(0, 120))})) {`,
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
