'use strict'

// Spec 026 (R4 to R7, R10, R27): the reading of a command before it runs, the project's own tools, and the analysis as a whole.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin, commitIn } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const risk = lib('audit-risk.js')
const tools = lib('audit-tools.js')
const analyze = lib('audit-analyze.js')
const store = lib('audit-store.js')

const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE'
const pkg = (scripts, extra = {}) => JSON.stringify({ name: 'x', scripts, ...extra })
function projectDir(t, files) {
  const dir = tempDir(t)
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}
const fake = (reply) => {
  const calls = []
  const exec = async (file, args, opts) => { calls.push({ file, args, opts }); return typeof reply === 'function' ? reply(file, args, opts) : reply }
  exec.calls = calls
  return exec
}
const OK = { status: 0, stdout: 'all good\n', stderr: '', timedOut: false }
const never = async () => { throw new Error('no external command should run') }

const CASES = [
  ['a harmless script', { 'package.json': pkg({ test: 'node --test', lint: 'eslint .', build: 'tsc' }) }, 'npm test', null],
  ['pretest reaches a seed script', { 'package.json': pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node scripts/seed.js' }) }, 'npm test', 'seeds'],
  ['a migration in the body', { 'package.json': pkg({ test: 'prisma migrate deploy && node --test' }) }, 'npm test', 'migrates'],
  ['posttest publishes', { 'package.json': pkg({ test: 'node --test', posttest: 'npm publish' }) }, 'npm test', 'deploys'],
  ['a deploy by name', { 'package.json': pkg({ test: 'npm run deploy:staging && node --test', 'deploy:staging': 'echo staged' }) }, 'npm test', 'deploys'],
  ['end to end by glob', { 'package.json': pkg({ test: 'run-s test:*', 'test:unit': 'node --test', 'test:e2e': 'playwright test' }) }, 'npm test', 'live-e2e'],
  ['credentials by variable', { 'package.json': pkg({ test: 'node --test --token=$NPM_TOKEN' }) }, 'npm test', 'credentials'],
  ['credentials by tool', { 'package.json': pkg({ test: 'aws s3 ls && node --test' }) }, 'npm test', 'credentials'],
  ['a fixing lint', { 'package.json': pkg({ lint: 'eslint --fix .' }) }, 'npm run lint', 'fixes'],
  ['git fetch in a script', { 'package.json': pkg({ test: 'git fetch && node --test' }) }, 'npm test', 'fixes'],
  ['an install in a script', { 'package.json': pkg({ test: 'npm ci && node --test' }) }, 'npm test', 'installs'],
  ['a computed script name', { 'package.json': pkg({ test: 'npm run $TARGET' }) }, 'npm test', 'computed'],
  ['a script the manifest does not define', { 'package.json': pkg({ test: 'npm run nope' }) }, 'npm test', 'unresolved'],
  ['a script file that deploys', { 'package.json': pkg({ test: 'bash ci/test.sh' }), 'ci/test.sh': '#!/bin/sh\nkubectl apply -f k8s.yaml\n' }, 'npm test', 'deploys'],
  ['a makefile prerequisite that seeds', { Makefile: 'test: seed\n\tnode --test\n\nseed:\n\tnode seed.js\n' }, 'make test', 'seeds'],
  ['a composer script that migrates', { 'composer.json': JSON.stringify({ scripts: { test: ['@migrate', 'phpunit'], migrate: 'php artisan migrate' } }) }, 'composer test', 'migrates'],
  ['a tox command that migrates', { 'tox.ini': '[testenv]\ncommands_pre = python manage.py migrate\ncommands = pytest\n' }, 'tox', 'migrates'],
  ['a raw command that deploys', {}, 'make deploy', 'deploys'],
  ['a VAR assignment before the script call', { 'package.json': pkg({ test: 'FOO=1 npm run build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['env before the script call', { 'package.json': pkg({ test: 'env FOO=1 npm run build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['cross-env before the script call', { 'package.json': pkg({ test: 'cross-env FOO=1 npm run build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['flags between run and the script name', { 'package.json': pkg({ test: 'npm run --silent build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['a pnpm shorthand script call', { 'package.json': pkg({ test: 'pnpm build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['a yarn shorthand script call', { 'package.json': pkg({ test: 'yarn build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['a bun shorthand script call', { 'package.json': pkg({ test: 'bun build', build: 'git push origin main' }) }, 'npm test', 'deploys'],
  ['a makefile target line with an inline recipe', { Makefile: 'test: ; git push origin main\n' }, 'make test', 'deploys'],
  ['a makefile recipe with an at prefix', { Makefile: 'test:\n\t@git push origin main\n' }, 'make test', 'deploys'],
  ['a makefile recipe with a dash prefix', { Makefile: 'test:\n\t-git push origin main\n' }, 'make test', 'deploys'],
  ['a makefile recipe with a plus prefix', { Makefile: 'test:\n\t+git push origin main\n' }, 'make test', 'deploys'],
  ['a makefile recipe that calls make with a prefix', { Makefile: 'test:\n\t@$(MAKE) deploy\n\ndeploy:\n\tgit push origin main\n' }, 'make test', 'deploys'],
  ['a composer reference the manifest does not define', { 'composer.json': JSON.stringify({ scripts: { test: ['@missing', 'phpunit'] } }) }, 'composer test', 'unresolved'],
  ['make with a directory flag', { Makefile: 'test:\n\tgit push origin main\n' }, 'make -C subdir test', 'deploys'],
  ['make with a file flag', { Makefile: 'test:\n\tgit push origin main\n' }, 'make -f other.mk test', 'deploys'],
  ['make with an include flag', { Makefile: 'test:\n\tgit push origin main\n' }, 'make -I inc test', 'deploys'],
  ['a risky prelint under npm run lint', { 'package.json': pkg({ lint: 'eslint .', prelint: 'npm publish' }) }, 'npm run lint', 'deploys'],
  ['a risky postlint under npm run lint', { 'package.json': pkg({ lint: 'eslint .', postlint: 'git push origin main' }) }, 'npm run lint', 'deploys'],
  ['a global prefix flag with a value before run', { 'package.json': pkg({ build: 'git push origin main' }) }, 'npm --prefix app run build', 'deploys'],
  ['a global loglevel flag with a value before the verb', { 'package.json': pkg({ pretest: 'git push origin main', test: 'node --test' }) }, 'npm --loglevel silent test', 'deploys'],
  ['an unknown global flag fails closed', { 'package.json': pkg({ test: 'node --test' }) }, 'npm --frobnicate test', 'unresolved'],
  ['a target line with an assignment after its colon', { Makefile: 'FOO = bar\ntest: NODE_ENV=test\n\tgit push origin main\nall: test\n' }, 'make all', 'deploys'],
]

for (const [label, files, command, expected] of CASES) {
  test(`assess reads the whole chain: ${label}`, (t) => {
    const out = risk.assess(projectDir(t, files), command)
    assert.equal(out.runnable, expected === null, JSON.stringify(out.reasons))
    if (expected !== null) {
      assert.ok(out.reasons.some((r) => r.id === expected), `${expected} is not among ${out.reasons.map((r) => r.id)}`)
      assert.ok(out.reasons.every((r) => Array.isArray(r.via) && typeof r.text === 'string' && r.text.length > 0))
    }
  })
}

test('npm run follows the pre and post hooks of the script', (t) => {
  const pre = risk.assess(projectDir(t, { 'package.json': pkg({ lint: 'eslint .', prelint: 'npm publish' }) }), 'npm run lint')
  assert.equal(pre.runnable, false)
  const preDeploy = pre.reasons.find((r) => r.id === 'deploys')
  assert.deepEqual(preDeploy.via, ['npm run lint', 'prelint'])
  const post = risk.assess(projectDir(t, { 'package.json': pkg({ lint: 'eslint .', postlint: 'git push origin main' }) }), 'npm run lint')
  assert.equal(post.runnable, false)
  assert.ok(post.reasons.some((r) => r.id === 'deploys' && r.via.includes('postlint')))
})

test('assess names the path through pretest to the script that seeds', (t) => {
  const out = risk.assess(projectDir(t, { 'package.json': pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node scripts/seed.js' }) }), 'npm test')
  const seeds = out.reasons.find((r) => r.id === 'seeds')
  assert.deepEqual(seeds.via, ['npm test', 'pretest', 'db:seed'])
  assert.match(seeds.text, /db:seed/)
})

test('assess reads five levels and 40 scripts, cuts cycles, and does not run what is deeper or wider (D3)', (t) => {
  const chain = (levels) => {
    const scripts = { test: 'npm run s0' }
    for (let i = 0; i < levels; i++) scripts[`s${i}`] = i === levels - 1 ? 'node --test' : `npm run s${i + 1}`
    return { 'package.json': pkg(scripts) }
  }
  assert.equal(risk.assess(projectDir(t, chain(4)), 'npm test').runnable, true, 'test plus four more is five levels')
  const deep = risk.assess(projectDir(t, chain(5)), 'npm test')
  assert.equal(deep.runnable, false)
  assert.ok(deep.reasons.some((r) => r.id === 'too-deep'))
  const names = Array.from({ length: 45 }, (_, i) => `a${i}`)
  const wide = { test: `run-s ${names.join(' ')}`, ...Object.fromEntries(names.map((n) => [n, 'node --test'])) }
  const out = risk.assess(projectDir(t, { 'package.json': pkg(wide) }), 'npm test')
  assert.ok(out.reasons.some((r) => r.id === 'too-wide'))
  assert.equal(risk.assess(projectDir(t, { 'package.json': pkg({ a: 'npm run b', b: 'npm run a', test: 'npm run a' }) }), 'npm test').runnable, true)
})

test('discoverTests picks the declared command in a fixed order, the Lead\'s command first, and says why when there is none (R4)', (t) => {
  const find = (files, options = {}) => tools.discoverTests(projectDir(t, files), options)
  assert.deepEqual(find({ 'package.json': pkg({ test: 'node --test' }) }), { found: true, command: 'npm test', source: 'package.json scripts.test' })
  assert.equal(find({ 'package.json': pkg({ test: 'vitest' }), 'pnpm-lock.yaml': '' }).command, 'pnpm test')
  assert.equal(find({ 'package.json': pkg({ test: 'vitest' }), 'yarn.lock': '' }).command, 'yarn test')
  assert.equal(find({ 'package.json': pkg({ test: 'echo "Error: no test specified" && exit 1' }) }).found, false)
  assert.equal(find({ 'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-q"\n' }).command, 'python -m pytest')
  assert.equal(find({ 'tox.ini': '[testenv]\ncommands = pytest\n' }).command, 'tox')
  assert.equal(find({ Makefile: 'test:\n\tnode --test\n' }).command, 'make test')
  assert.equal(find({ 'Cargo.toml': '[package]\nname = "x"\n' }).command, 'cargo test')
  assert.equal(find({ 'go.mod': 'module x\n' }).command, 'go test ./...')
  assert.equal(find({ 'composer.json': JSON.stringify({ scripts: { test: 'phpunit' } }) }).command, 'composer test')
  assert.equal(find({ 'app.csproj': '<Project />' }).command, 'dotnet test')
  assert.deepEqual(find({}), { found: false, reason: 'no manifest or build file declares tests' })
  assert.deepEqual(find({ 'package.json': pkg({ test: 'node --test' }) }, { testsCommand: 'make check' }), { found: true, command: 'make check', source: 'given by the Lead' })
})

test('discoverLint and discoverAudit read what the project declares and nothing more', (t) => {
  const lint = (files) => tools.discoverLint(projectDir(t, files))
  assert.equal(lint({ 'package.json': pkg({ lint: 'eslint .' }) }).command, 'npm run lint')
  assert.equal(lint({ 'ruff.toml': 'line-length = 100\n' }).command, 'ruff check .')
  assert.equal(lint({ '.flake8': '[flake8]\n' }).command, 'flake8')
  assert.deepEqual(lint({}), { found: false, reason: 'no linter declared' })
  const audit = (files) => tools.discoverAudit(projectDir(t, files))
  assert.equal(audit({ 'package.json': pkg({}), 'package-lock.json': '{}' }).command, 'npm audit --json')
  assert.equal(audit({ 'package.json': pkg({}), 'pnpm-lock.yaml': '' }).command, 'pnpm audit --json')
  assert.equal(audit({ 'package.json': pkg({}) }).reason, 'package.json has no lockfile')
  assert.equal(audit({ 'requirements.txt': 'flask\n' }).command, 'pip-audit -f json')
  assert.equal(audit({ 'composer.lock': '{}' }).command, 'composer audit --format=json')
  assert.equal(audit({ 'Cargo.lock': '' }).command, 'cargo audit --json')
  assert.equal(audit({}).found, false)
})

test('runTests runs the declared command through sh with an environment without secrets and a cap, and reports pass or fail (R4)', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ test: 'node --test' }), 'package-lock.json': '{}' })
  const exec = fake(OK)
  const env = { PATH: '/usr/bin', HOME: '/home/x', NPM_TOKEN: 'secret-token-value' }
  const check = await tools.runTests(dir, { exec, env, timeoutMs: 1000 })
  assert.deepEqual([check.state, check.command, check.passed, check.exitCode, typeof check.durationMs], ['result', 'npm test', true, 0, 'number'])
  assert.equal(exec.calls.length, 1)
  const call = exec.calls[0]
  assert.deepEqual([call.file, call.args, call.opts.cwd, call.opts.timeoutMs], ['sh', ['-c', 'npm test'], dir, 1000])
  assert.equal(call.opts.env.CI, 'true')
  assert.equal(call.opts.env.NPM_TOKEN, undefined)
  assert.equal(call.opts.env.PATH, '/usr/bin')
  const failing = await tools.runTests(dir, { exec: fake({ ...OK, status: 1, stdout: 'not ok 1' }), env, timeoutMs: 1000 })
  assert.deepEqual([failing.state, failing.passed, failing.exitCode], ['result', false, 1])
})

test('runTests does not run a command whose chain seeds, migrates or publishes, and says it was not run (R4, R5)', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node scripts/seed.js' }) })
  const check = await tools.runTests(dir, { exec: never, env: {}, timeoutMs: 1000 })
  assert.deepEqual([check.state, check.notRun, check.command], ['could-not', true, 'npm test'])
  assert.match(check.reason, /db:seed/)
  assert.match(check.reason, /pretest/)
})

test('runTests: --no-tests, no tests declared, missing dependencies, a cap that ran out and a missing tool each end in their own state', async (t) => {
  const declared = projectDir(t, { 'package.json': pkg({ test: 'node --test' }) })
  const skipped = await tools.runTests(declared, { exec: never, env: {}, noTests: true })
  assert.equal(skipped.state, 'not-applicable')
  assert.match(skipped.reason, /--no-tests/)
  const empty = await tools.runTests(projectDir(t, {}), { exec: never, env: {} })
  assert.deepEqual([empty.state, empty.reason], ['not-applicable', 'no manifest or build file declares tests'])
  const needs = projectDir(t, { 'package.json': pkg({ test: 'node --test' }, { devDependencies: { mocha: '1.0.0' } }) })
  const missingDeps = await tools.runTests(needs, { exec: never, env: {} })
  assert.equal(missingDeps.state, 'could-not')
  assert.match(missingDeps.reason, /node_modules/)
  fs.mkdirSync(path.join(needs, 'node_modules'))
  const timedOut = await tools.runTests(needs, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: true }), env: {}, timeoutMs: 300000 })
  assert.deepEqual([timedOut.state, timedOut.timedOut], ['could-not', true])
  assert.match(timedOut.reason, /300/)
  const noTool = await tools.runTests(needs, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: 'ENOENT', message: 'spawn sh ENOENT' } }), env: {} })
  assert.equal(noTool.state, 'could-not')
  assert.match(noTool.reason, /not installed/)
})

test('a shell command-not-found (status 127) is the tool not installed, not a failed result', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ test: 'node --test' }) })
  const missing = await tools.runTests(dir, { exec: fake({ status: 127, stdout: '', stderr: 'sh: 1: vitest: not found\n', timedOut: false }), env: {} })
  assert.deepEqual([missing.state, missing.reason], ['could-not', 'the tool is not installed'])
  const lintMissing = await tools.runLint(projectDir(t, { 'package.json': pkg({ lint: 'eslint .' }) }), { exec: fake({ status: 127, stdout: '', stderr: 'sh: 1: eslint: not found\n', timedOut: false }), env: {} })
  assert.deepEqual([lintMissing.state, lintMissing.reason], ['could-not', 'the tool is not installed'])
  const auditMissing = await tools.runAudit(projectDir(t, { 'package.json': pkg({}), 'package-lock.json': '{}' }), { exec: fake({ status: 127, stdout: '', stderr: 'sh: 1: npm: not found\n', timedOut: false }), env: {} })
  assert.deepEqual([auditMissing.state, auditMissing.reason], ['could-not', 'the tool is not installed'])
})

test('runTests redacts a secret that the test output prints (R7)', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ test: 'node --test' }) })
  const check = await tools.runTests(dir, { exec: fake({ ...OK, stdout: `loaded key ${AWS}\n` }), env: {} })
  assert.equal(check.state, 'result')
  assert.ok(check.output.includes('[redacted aws-access-key-id]'))
  assert.ok(!check.output.includes(AWS))
})

test('runLint runs the linter, and does not run one that fixes', async (t) => {
  const ok = await tools.runLint(projectDir(t, { 'package.json': pkg({ lint: 'eslint .' }) }), { exec: fake(OK), env: {} })
  assert.deepEqual([ok.state, ok.command, ok.passed], ['result', 'npm run lint', true])
  const fixing = await tools.runLint(projectDir(t, { 'package.json': pkg({ lint: 'eslint --fix .' }) }), { exec: never, env: {} })
  assert.deepEqual([fixing.state, fixing.notRun], ['could-not', true])
  assert.match(fixing.reason, /fix/)
  assert.equal((await tools.runLint(projectDir(t, {}), { exec: never, env: {} })).state, 'not-applicable')
})

test('the runners put the project .venv/bin or venv/bin first on the PATH', async (t) => {
  const pip = JSON.stringify({ dependencies: [{ name: 'flask', version: '1.0', vulns: [{ id: 'PYSEC-1' }] }] })
  const reply = (file, args) => (args.join(' ').includes('pip-audit') ? { status: 1, stdout: pip, stderr: '', timedOut: false } : OK)
  const dir = projectDir(t, { 'pyproject.toml': '[tool.pytest.ini_options]\n', 'ruff.toml': '', 'requirements.txt': 'flask\n' })
  fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true })
  const exec = fake(reply)
  const env = { PATH: '/usr/bin' }
  assert.equal((await tools.runTests(dir, { exec, env })).state, 'result')
  assert.equal((await tools.runLint(dir, { exec, env })).state, 'result')
  assert.equal((await tools.runAudit(dir, { exec, env })).state, 'result')
  assert.equal(exec.calls.length, 3)
  for (const call of exec.calls) {
    assert.ok(call.opts.env.PATH.startsWith(`${path.join(dir, '.venv', 'bin')}${path.delimiter}`), call.opts.env.PATH)
  }
  const plain = projectDir(t, { 'pyproject.toml': '[tool.pytest.ini_options]\n' })
  const execPlain = fake(OK)
  await tools.runTests(plain, { exec: execPlain, env })
  assert.equal(execPlain.calls[0].opts.env.PATH, '/usr/bin')
  const legacy = projectDir(t, { 'pyproject.toml': '[tool.pytest.ini_options]\n' })
  fs.mkdirSync(path.join(legacy, 'venv', 'bin'), { recursive: true })
  const execLegacy = fake(OK)
  await tools.runTests(legacy, { exec: execLegacy, env })
  assert.ok(execLegacy.calls[0].opts.env.PATH.startsWith(`${path.join(legacy, 'venv', 'bin')}${path.delimiter}`))
})

test('runAudit counts what the ecosystem tool prints, whatever its exit code, and never runs a fix (R4, R6)', async (t) => {
  const npm = JSON.stringify({ vulnerabilities: { jsonwebtoken: { name: 'jsonwebtoken', severity: 'high' }, lodash: { name: 'lodash', severity: 'low' } }, metadata: { vulnerabilities: { total: 2 } } })
  const exec = fake({ status: 1, stdout: npm, stderr: '', timedOut: false })
  const dir = projectDir(t, { 'package.json': pkg({}), 'package-lock.json': '{}' })
  const a = await tools.runAudit(dir, { exec, env: {} })
  assert.deepEqual([a.state, a.tool, a.counts], ['result', 'npm audit', { critical: 0, high: 1, moderate: 0, low: 1, unknown: 0, total: 2 }])
  assert.deepEqual(a.top.map((x) => [x.name, x.severity]), [['jsonwebtoken', 'high'], ['lodash', 'low']])
  assert.ok(exec.calls[0].args.join(' ').includes('npm audit --json'))
  assert.ok(!exec.calls[0].args.join(' ').includes('fix'))
  const pip = JSON.stringify({ dependencies: [{ name: 'flask', version: '0.5', vulns: [{ id: 'PYSEC-1' }] }, { name: 'ok', version: '1', vulns: [] }] })
  const b = await tools.runAudit(projectDir(t, { 'requirements.txt': 'flask\n' }), { exec: fake({ status: 1, stdout: pip, stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([b.counts.total, b.counts.unknown, b.top[0].name], [1, 1, 'flask'])
  const composer = JSON.stringify({ advisories: { 'vendor/pkg': [{ advisoryId: 'PKSA-1', title: 'RCE', severity: 'high' }] } })
  const c = await tools.runAudit(projectDir(t, { 'composer.lock': '{}' }), { exec: fake({ status: 1, stdout: composer, stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([c.counts.total, c.counts.high], [1, 1])
  const cargo = JSON.stringify({ vulnerabilities: { found: true, count: 1, list: [{ advisory: { id: 'RUSTSEC-2020-1' }, package: { name: 'time' } }] } })
  const d = await tools.runAudit(projectDir(t, { 'Cargo.lock': '' }), { exec: fake({ status: 1, stdout: cargo, stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([d.counts.total, d.top[0].name], [1, 'time'])
})

test('runAudit: no network, a missing tool, output it does not understand and no lockfile each end in their own state', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({}), 'package-lock.json': '{}' })
  const net = await tools.runAudit(dir, { exec: fake({ status: 1, stdout: '', stderr: 'npm ERR! code ENOTFOUND\nnpm ERR! network request failed', timedOut: false }), env: {} })
  assert.deepEqual([net.state, net.reason], ['could-not', 'no network'])
  const missing = await tools.runAudit(dir, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: 'ENOENT', message: 'x' } }), env: {} })
  assert.deepEqual([missing.state, missing.reason], ['could-not', 'the tool is not installed'])
  const odd = await tools.runAudit(dir, { exec: fake({ status: 0, stdout: 'hello', stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([odd.state, odd.reason], ['could-not', 'output not understood'])
  const none = await tools.runAudit(projectDir(t, { 'package.json': pkg({}) }), { exec: never, env: {} })
  assert.equal(none.state, 'not-applicable')
})

function ctxFor(t, exec, extra = {}) {
  return { exec, env: { PATH: '/usr/bin' }, now: () => new Date('2026-11-04T12:00:00Z'), dataDir: tempDir(t, 'aether-data-'), ...extra }
}

test('analyze of a repository with nothing in it: every project tool is not applicable, nothing external runs, it does not fail (scenario 3, R5)', async (t) => {
  const repo = makeRepo(t)
  const ctx = ctxFor(t, never)
  store.writeReport(store.nextReportDir(ctx.dataDir, 'other-000000000000', '2026-10-01'), { meta: { durationSeconds: 600, costUsd: 2.5, topics: ['bugs', 'tests', 'docs', 'security', 'hygiene'] } }, '')
  const a = await analyze.analyze(repo.dir, {}, ctx)
  assert.equal(a.ok, true)
  assert.equal(a.generatedAt, '2026-11-04T12:00:00.000Z')
  const states = Object.fromEntries(Object.entries(a.checks).map(([name, check]) => [name, check.state]))
  assert.deepEqual(states, { tests: 'not-applicable', lint: 'not-applicable', dependencies: 'not-applicable', secrets: 'result', todos: 'result', branches: 'result', issues: 'not-applicable', prs: 'not-applicable', hotspots: 'result' })
  for (const check of Object.values(a.checks)) assert.ok(check.state === 'result' || (typeof check.reason === 'string' && check.reason.length > 0))
  assert.equal(a.project.remote, null)
  assert.equal(a.project.key, store.projectKey(a.project.identity))
  assert.equal(a.changes.changed, false)
  assert.deepEqual(a.selfFindings, [])
  assert.deepEqual(a.estimate, { samples: 1, perTopic: { minutes: [2, 2], usd: [0.5, 0.5] } })
})

test('analyze: a test command that writes a tracked file is a finding of the audit, an ignored file is not, and the step is named (R6)', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, '.gitignore', 'coverage/\n', 'ignore coverage')
  commitIn(repo, repo.dir, 'package.json', pkg({ test: 'node --test' }), 'manifest')
  const exec = async (file, args, opts) => {
    if (args[1] === 'npm test') {
      fs.appendFileSync(path.join(opts.cwd, 'README.md'), 'changed by the tests\n')
      fs.mkdirSync(path.join(opts.cwd, 'coverage'), { recursive: true })
      fs.writeFileSync(path.join(opts.cwd, 'coverage', 'lcov.info'), 'x')
    }
    return OK
  }
  const a = await analyze.analyze(repo.dir, {}, ctxFor(t, exec))
  assert.equal(a.checks.tests.state, 'result')
  assert.equal(a.changes.changed, true)
  assert.deepEqual(a.changes.attributed.map((x) => x.step), ['tests'])
  assert.deepEqual(a.changes.attributed[0].items[0].files, ['README.md'])
  assert.equal(a.selfFindings.length, 1)
  const f = a.selfFindings[0]
  assert.deepEqual([f.verification, f.status, f.topic, f.location.file, f.location.line], ['proven', 'verified', 'hygiene', 'README.md', 1])
  assert.match(f.title, /tests/)
})

test('analyze: a test command that would seed data is not run, and the analysis says so', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'package.json', pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node seed.js' }), 'manifest')
  const a = await analyze.analyze(repo.dir, {}, ctxFor(t, never))
  assert.deepEqual([a.checks.tests.state, a.checks.tests.notRun], ['could-not', true])
})

test('analyze: --tests-command gives the Lead a way to name a test command when no manifest declares one, and it is read like any other', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'Makefile', 'check:\n\tnode --test\n\ndeploy:\n\tgit push origin main\n', 'makefile')
  const exec = fake(OK)
  const a = await analyze.analyze(repo.dir, { testsCommand: 'make check' }, ctxFor(t, async (...args) => exec(...args)))
  assert.equal(a.checks.tests.state, 'result')
  assert.equal(a.checks.tests.command, 'make check')
  assert.equal(a.checks.tests.source, 'given by the Lead')
  assert.ok(exec.calls.some((c) => c.args.join(' ').includes('make check')), 'the command the Lead gave was run')
  const risky = await analyze.analyze(repo.dir, { testsCommand: 'make deploy' }, ctxFor(t, never))
  assert.deepEqual([risky.checks.tests.state, risky.checks.tests.notRun], ['could-not', true])
})

test('the analyze command through the bin, with a fake npm: it runs, writes outside the project, and leaves the project untouched (R4, R6, C6)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'package.json', pkg({ test: 'node --test' }), 'manifest')
  commitIn(repo, repo.dir, 'package-lock.json', '{}', 'lock')
  const fakeBin = tempDir(t, 'aether-fakebin-')
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const mark = path.join(work, 'mark')
  fs.writeFileSync(path.join(fakeBin, 'npm'), [
    '#!/bin/sh',
    'case "$1" in',
    '  test) echo "fake tests ran"; echo called >> "$AUDIT_MARK"; exit 0;;',
    '  audit) echo \'{"vulnerabilities":{},"metadata":{"vulnerabilities":{"total":0}}}\'; exit 0;;',
    'esac',
    'exit 9',
    '',
  ].join('\n'), { mode: 0o755 })
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AETHER_DATA_DIR: dataDir, AUDIT_MARK: mark }
  const out = path.join(work, 'analysis.json')
  const r = runBin(BIN, ['analyze', '--out', out], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.out, out)
  const analysis = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual([analysis.checks.tests.state, analysis.checks.tests.passed, analysis.checks.tests.command], ['result', true, 'npm test'])
  assert.deepEqual([analysis.checks.dependencies.state, analysis.checks.dependencies.counts.total], ['result', 0])
  assert.equal(fs.readFileSync(mark, 'utf8').trim(), 'called')
  assert.equal(repo.git('status', '--porcelain'), '')
  const skipped = runBin(BIN, ['analyze', '--no-tests', '--out', path.join(work, 'skipped.json')], repo.dir, env)
  assert.equal(skipped.status, 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'skipped.json'), 'utf8')).checks.tests.state, 'not-applicable')
  assert.equal(fs.readFileSync(mark, 'utf8').trim().split('\n').length, 1, 'the tests did not run again')
})

test('the analyze command refuses a folder that is not a git repository and a bad cap', (t) => {
  const outside = runBin(BIN, ['analyze'], tempDir(t))
  assert.equal(outside.status, 1)
  assert.match(outside.json.error, /git repository/)
  const repo = makeRepo(t)
  assert.equal(runBin(BIN, ['analyze', '--timeout-seconds', '0'], repo.dir).status, 2)
  assert.equal(runBin(BIN, ['analyze', '--timeout-seconds', 'soon'], repo.dir).status, 2)
})
