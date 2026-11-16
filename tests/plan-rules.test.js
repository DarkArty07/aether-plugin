'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, runBin, writePlan, PLAN_BIN } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const ROOT = path.join(__dirname, '..')

function setupRepo(t, files, rules) {
  const repo = makeRepo(t)
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true })
    fs.writeFileSync(path.join(repo.dir, file), text)
  }
  if (rules !== undefined) {
    fs.mkdirSync(path.join(repo.dir, '.specify'), { recursive: true })
    fs.writeFileSync(
      path.join(repo.dir, '.specify', 'plan-rules.json'),
      typeof rules === 'string' ? rules : JSON.stringify(rules, null, 2),
    )
  }
  return repo
}

const LIB_RULE = {
  adds: 'lib/*.js',
  owns: ['docs/components.md'],
  why: 'Every module in lib/ must be registered in docs/components.md.',
}

const DECISIONS_RULE = {
  changes: 'docs/decisions.md',
  owns: ['docs/index.md', 'tests/docs-facts.test.js'],
  why: 'If it adds a decision, docs/index.md and tests/docs-facts.test.js pin the range.',
}

test('a task that adds a file matching an adds rule without owning the registry warns with why (#263)', (t) => {
  const repo = setupRepo(t, {}, [LIB_RULE])
  const planFile = writePlan(repo.dir, plan([task(1, { owns: '`lib/x.js`' })]))
  const r = runBin(PLAN_BIN, ['check', planFile], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.ok, true)
  const hit = r.json.warnings.find((w) => w.includes(LIB_RULE.why))
  assert.ok(hit, `expected warning with rule why, got: ${JSON.stringify(r.json.warnings)}`)
  assert.match(hit, /Task 1/)
  assert.match(hit, /docs\/components\.md/)
})

test('owning the registry file in the task or a dependency suppresses the rule warning (#263)', (t) => {
  const repo = setupRepo(t, {}, [LIB_RULE])
  const direct = writePlan(repo.dir, plan([task(1, { owns: '`lib/x.js`, `docs/components.md`' })]))
  const r1 = runBin(PLAN_BIN, ['check', direct], repo.dir)
  assert.equal(r1.status, 0, r1.stdout)
  assert.equal(r1.json.warnings.some((w) => w.includes(LIB_RULE.why)), false)

  const dep = writePlan(
    repo.dir,
    plan([
      task(1, { owns: '`docs/components.md`' }),
      task(2, { owns: '`lib/x.js`', depends: 'Task 1 — registers the module' }),
    ]),
  )
  const r2 = runBin(PLAN_BIN, ['check', dep], repo.dir)
  assert.equal(r2.status, 0, r2.stdout)
  assert.equal(r2.json.warnings.some((w) => w.includes(LIB_RULE.why)), false)
})

test('without .specify/plan-rules.json there is no rule warning (#263)', (t) => {
  const repo = setupRepo(t, {})
  const planFile = writePlan(repo.dir, plan([task(1, { owns: '`lib/x.js`' })]))
  const r = runBin(PLAN_BIN, ['check', planFile], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json.warnings, [])
})

test('a broken .specify/plan-rules.json is an error naming the file in check and compile (#263)', (t) => {
  for (const bad of ['{not json', '{"adds": "lib/*.js"}', '[{"adds": "lib/*.js"}]', '[{"adds": "a", "changes": "b", "owns": ["c"], "why": "d"}]']) {
    const repo = setupRepo(t, {}, bad)
    const planFile = writePlan(repo.dir, plan([task(1, { owns: '`lib/x.js`' })]))
    const r = runBin(PLAN_BIN, ['check', planFile], repo.dir)
    assert.equal(r.status, 1, `expected exit 1 for ${bad}`)
    assert.equal(r.json.ok, false)
    assert.ok(r.json.errors.some((e) => e.includes('plan-rules.json')), `expected error naming plan-rules.json, got: ${JSON.stringify(r.json.errors)}`)

    const c = runBin(PLAN_BIN, ['compile', planFile, '--allow-main', '--no-baseline'], repo.dir)
    assert.equal(c.status, 1, `expected compile exit 1 for ${bad}`)
    assert.equal(c.json.ok, false)
    assert.ok(c.json.errors.some((e) => e.includes('plan-rules.json')))
  }
})

test('a task that owns a glob and creates a new file under it gets no adds warning (#263)', (t) => {
  const repo = setupRepo(t, {}, [LIB_RULE])
  const planFile = writePlan(repo.dir, plan([task(1, { owns: '`lib/*.js`' })]))
  const r = runBin(PLAN_BIN, ['check', planFile], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.warnings.some((w) => w.includes(LIB_RULE.why)), false)
})

test('a changes rule warns when an existing file in Owns (literal or glob) matches and required files are missing (#263)', (t) => {
  const repo = setupRepo(t, { 'docs/decisions.md': '# Decisions\n' }, [DECISIONS_RULE])
  const literal = writePlan(repo.dir, plan([task(1, { owns: '`docs/decisions.md`' })]))
  const r1 = runBin(PLAN_BIN, ['check', literal], repo.dir)
  assert.equal(r1.status, 0, r1.stdout)
  assert.ok(r1.json.warnings.some((w) => w.includes(DECISIONS_RULE.why)))

  const viaGlob = writePlan(repo.dir, plan([task(1, { owns: '`docs/*.md`' })]))
  const r2 = runBin(PLAN_BIN, ['check', viaGlob], repo.dir)
  assert.equal(r2.status, 0, r2.stdout)
  assert.ok(r2.json.warnings.some((w) => w.includes(DECISIONS_RULE.why)))

  const covered = writePlan(
    repo.dir,
    plan([
      task(1, { owns: '`docs/decisions.md`, `docs/index.md`' }),
      task(2, { owns: '`tests/docs-facts.test.js`', depends: 'Task 1 — adds decision' }),
    ]),
  )
  // Task 1 does not own tests/docs-facts.test.js (task 2 depends on task 1, not the other way around)
  const r3 = runBin(PLAN_BIN, ['check', covered], repo.dir)
  assert.equal(r3.status, 0, r3.stdout)
  assert.ok(r3.json.warnings.some((w) => w.includes(DECISIONS_RULE.why)))

  const coveredBoth = writePlan(repo.dir, plan([task(1, { owns: '`docs/decisions.md`, `docs/index.md`, `tests/docs-facts.test.js`' })]))
  const r4 = runBin(PLAN_BIN, ['check', coveredBoth], repo.dir)
  assert.equal(r4.status, 0, r4.stdout)
  assert.equal(r4.json.warnings.some((w) => w.includes(DECISIONS_RULE.why)), false)
})

test('compile also emits rule warnings on stderr (#263)', (t) => {
  const repo = setupRepo(t, {}, [LIB_RULE])
  const planFile = writePlan(repo.dir, plan([task(1, { owns: '`lib/x.js`' })]))
  const r = runBin(PLAN_BIN, ['compile', planFile, '--allow-main', '--no-baseline'], repo.dir)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.stderr.includes(LIB_RULE.why), `expected rule why on stderr, got: ${r.stderr}`)
})

test('this repository has .specify/plan-rules.json with the three project rules (#263)', () => {
  const rulesPath = path.join(ROOT, '.specify', 'plan-rules.json')
  assert.ok(fs.existsSync(rulesPath), '.specify/plan-rules.json must exist')
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
  assert.ok(Array.isArray(rules) && rules.length >= 3)
  assert.ok(rules.some((r) => r.adds && r.adds.includes('plugins/aether/lib') && r.owns.includes('docs/reference/components.md')))
  assert.ok(rules.some((r) => r.adds && r.adds.includes('plugins/aether/bin') && r.owns.includes('docs/reference/components.md')))
  const dec = rules.find((r) => r.changes === 'docs/decisions.md')
  assert.ok(dec, 'must have a changes rule for docs/decisions.md')
  assert.deepEqual(dec.owns.sort(), ['docs/index.md', 'tests/docs-032.test.js', 'tests/docs-facts.test.js'])
  assert.match(dec.why, /if it adds a decision/i)
})
