'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const checks = require('../plugins/aether/lib/delegate-checks.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')

function hasPython3() {
  try {
    const r = spawnSync('python3', ['--version'], { encoding: 'utf8' })
    return r.status === 0
  } catch {
    return false
  }
}

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }

function world(t, { cwd = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = {
    dataDir,
    cwd: cwd ?? dataDir,
    now: () => 1000 + (n += 1),
    settings: NATIVE,
    newId: () => `gen-${n}`,
    pickPair: async () => ({ pick: null, quota: [] }),
  }
  return { dataDir, deps }
}

const call = (prompt) => ({
  session: 's1',
  event: { subagent_type: 'general-purpose', description: 'd', prompt },
})
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`

test('__pycache__ and .pyc/.pyo in file list do not make outside non-empty and do not block an edit (#237)', () => {
  const result = checks.checkEdits({
    files: [
      'marcas.py',
      '__pycache__/x.cpython-314.pyc',
      'foo.pyc',
      'pkg/__pycache__/bar.cpython-314.pyc',
      'opt.pyo',
    ],
    owns: ['marcas.py'],
    tests: { passed: true },
  })

  assert.equal(result.ok, true)
  assert.equal(result.empty, false)
  assert.deepEqual(result.outside, [])
  assert.deepEqual(result.reasons, [])
})

test('a real file outside Owns is still reported even when bytecode is present (#237)', () => {
  const result = checks.checkEdits({
    files: [
      'marcas.py',
      'docs/note.md',
      '__pycache__/x.cpython-314.pyc',
      'foo.pyc',
    ],
    owns: ['marcas.py'],
    tests: { passed: true },
  })

  assert.equal(result.ok, false)
  assert.equal(result.empty, false)
  assert.deepEqual(result.outside, ['docs/note.md'])
  assert.match(result.reasons.join('; '), /files outside owns: docs\/note\.md/)
})

test('a task changing only bytecode fails as having changed no files (#237)', () => {
  const result = checks.checkEdits({
    files: ['__pycache__/x.cpython-314.pyc', 'foo.pyc'],
    owns: ['marcas.py'],
    tests: { passed: true },
  })

  assert.equal(result.ok, false)
  assert.equal(result.empty, true)
  assert.deepEqual(result.outside, [])
  assert.deepEqual(result.reasons, ['task changed no files'])
})

test('runTests passes PYTHONDONTWRITEBYTECODE=1 to the command (#237)', (t) => {
  const repo = makeRepo(t)
  const result = checks.runTests(repo.dir, 'node -e "process.stdout.write(process.env.PYTHONDONTWRITEBYTECODE || \'\')\"')
  assert.equal(result.passed, true)
  assert.equal(result.outputTail, '1')
})

test('end-to-end: Python project verdict passes with bytecode and unittest (#237)', async (t) => {
  if (!hasPython3()) {
    t.skip('python3 is not available')
    return
  }

  const repo = makeRepo(t)
  fs.writeFileSync(path.join(repo.dir, 'marcas.py'), 'def marca():\n    return "broken"\n')
  fs.writeFileSync(
    path.join(repo.dir, 'test_marcas.py'),
    [
      'import unittest',
      'import marcas',
      '',
      'class TestMarcas(unittest.TestCase):',
      '    def test_marca(self):',
      '        self.assertEqual(marcas.marca(), "ok")',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n')
  )
  repo.git('add', '.')
  repo.git('commit', '-q', '-m', 'initial python repo')
  const base = repo.git('rev-parse', 'HEAD')

  const wt = path.join(tempDir(t, 'aether-wt-'), 'wt')
  repo.git('worktree', 'add', '--detach', wt, base)

  const { deps, dataDir } = world(t, { cwd: repo.dir })
  const brief = [
    'AETHER-OWNS: marcas.py',
    'AETHER-TESTS: python3 -m unittest -v test_marcas',
    '',
  ].join('\n')

  await task.begin(call(BRIEF('py-task', brief)), deps)

  // Delegate fixes marcas.py in the worktree
  fs.writeFileSync(path.join(wt, 'marcas.py'), 'def marca():\n    return "ok"\n')

  // Simulate bytecode left before verdict (e.g. delegate ran tests or python left files)
  const pycacheDir = path.join(wt, '__pycache__')
  fs.mkdirSync(pycacheDir, { recursive: true })
  fs.writeFileSync(path.join(pycacheDir, 'test_marcas.cpython-314.pyc'), 'pre-existing bytecode\n')
  fs.writeFileSync(path.join(wt, 'extra.pyc'), 'untracked pyc\n')

  // Verdict approve
  const approved = await task.verdict({ task: 'py-task', verdict: 'approve', worktree: wt }, deps)
  assert.equal(approved.ok, true, `expected approve to succeed, got error: ${approved.error}`)
  const entries = log.readEntries(dataDir, { task: 'py-task' })
  assert.equal(entries.at(-1).verdict, 'approved')
})
