'use strict'

// Spec 026 (R3, R10, R21 to R25, R27): the bin, the shared vocabulary, the runner, the store and the report of the audit.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const common = lib('audit-common.js')
const exec = lib('audit-exec.js')
const store = lib('audit-store.js')
const report = lib('audit-report.js')

const SECTIONS = ['header', 'waits', 'assumptions', 'list', 'unverified', 'sinceLast', 'discarded', 'notCovered', 'radar', 'cost', 'question']

test('the vocabularies are closed, and the twelve topics are the catalog of R9', () => {
  assert.deepEqual(common.TOPICS, ['bugs', 'security', 'dependencies', 'tests', 'reliability', 'performance', 'accessibility', 'architecture', 'docs', 'releases', 'hygiene', 'opportunities'])
  assert.deepEqual(common.TYPES, ['bug', 'risk', 'debt', 'docs', 'opportunity', 'other'])
  assert.deepEqual(common.VERDICTS, ['proven', 'read-confirmed', 'proposal', 'refuted', 'unverified'])
  assert.deepEqual(common.PRIORITIES, ['P0', 'P1', 'P2', 'P3'])
  assert.deepEqual(common.SEVERITIES, ['critical', 'high', 'medium', 'low'])
  assert.deepEqual(common.SIZES, ['S', 'M', 'L'])
  assert.deepEqual(common.WAIT_COSTS, ['high', 'medium', 'low'])
  assert.deepEqual(common.CHECK_STATES, ['result', 'not-applicable', 'could-not'])
})

test('parseArgs reads flags with values, boolean flags and positionals, and refuses the rest with exit code 2', () => {
  const spec = { values: ['out', 'lang'], booleans: ['save'], positionals: [1, 2] }
  assert.deepEqual(common.parseArgs(['a.json', '--lang', 'es', '--save'], spec), { values: { lang: 'es' }, booleans: { save: true }, positionals: ['a.json'] })
  for (const bad of [[], ['a', 'b', 'c'], ['a', '--nope'], ['a', '--lang'], ['a', '--lang', '--save'], ['a', '--lang', 'es', '--lang', 'en']]) {
    assert.throws(() => common.parseArgs(bad, spec), (err) => err.exitCode === 2, JSON.stringify(bad))
  }
  assert.equal(common.usageError('x').exitCode, 2)
})

test('runCommand gives output and status, closes stdin, kills the whole process group on the cap, and reports a missing program', async (t) => {
  const dir = tempDir(t)
  const base = { cwd: dir, env: process.env, timeoutMs: 5000 }
  const done = await exec.runCommand('sh', ['-c', 'echo out; echo err 1>&2; exit 3'], base)
  assert.equal(done.status, 3)
  assert.equal(done.stdout.trim(), 'out')
  assert.equal(done.stderr.trim(), 'err')
  assert.equal(done.timedOut, false)
  const closed = await exec.runCommand('sh', ['-c', 'cat; echo done'], base)
  assert.equal(closed.stdout.trim(), 'done')
  const slow = await exec.runCommand('sh', ['-c', 'sleep 30 & echo $! > pidfile; wait'], { ...base, timeoutMs: 400 })
  assert.equal(slow.timedOut, true)
  assert.equal(slow.status, null)
  const pid = Number(fs.readFileSync(path.join(dir, 'pidfile'), 'utf8'))
  let alive = true
  for (let i = 0; i < 40 && alive; i++) {
    try { process.kill(pid, 0); await new Promise((resolve) => setTimeout(resolve, 50)) } catch { alive = false }
  }
  assert.equal(alive, false, 'the grandchild died with the group')
  const missing = await exec.runCommand('definitely-not-a-command-xyz', [], base)
  assert.equal(missing.status, null)
  assert.equal(missing.error.code, 'ENOENT')
})

test('projectEnv drops what looks like a secret and sets CI', () => {
  const env = exec.projectEnv({ PATH: '/usr/bin', HOME: '/home/x', EDITOR: 'vi', NPM_TOKEN: 'a', MY_SECRET: 'b', DB_PASSWORD: 'c', AWS_ACCESS_KEY_ID: 'd', STRIPE_API_KEY: 'e', GOOGLE_APPLICATION_CREDENTIALS: 'f', SSH_PRIVATE: 'g' })
  assert.deepEqual(Object.keys(env).sort(), ['CI', 'EDITOR', 'GIT_TERMINAL_PROMPT', 'HOME', 'NO_COLOR', 'PATH'])
  assert.equal(env.CI, 'true')
})

test('the bin with no arguments or with an unknown subcommand exits 2 and names the six subcommands', (t) => {
  const repo = makeRepo(t)
  for (const args of [[], ['frobnicate']]) {
    const r = runBin(BIN, args, repo.dir)
    assert.equal(r.status, 2)
    assert.equal(r.json.ok, false)
    for (const name of ['analyze', 'candidates', 'verdicts', 'clean', 'triage', 'report']) assert.ok(r.json.error.includes(name), name)
  }
})

test('--out inside the audited project is refused with exit 2 and writes nothing', (t) => {
  const repo = makeRepo(t)
  const inside = path.join(repo.dir, 'out.json')
  const r = runBin(BIN, ['report', '--out', inside], repo.dir)
  assert.equal(r.status, 2)
  assert.match(r.json.error, /outside the audited project/)
  assert.equal(fs.existsSync(inside), false)
})

test('the identity of a project is its normalized remote, or the real path of its root; a linked worktree has the same key', (t) => {
  for (const form of ['https://github.com/Owner/Repo.git', 'git@github.com:Owner/Repo.git', 'ssh://git@github.com/Owner/Repo.git/', 'https://user:s3cr3t-token@github.com/Owner/Repo/']) {
    assert.equal(store.normalizeRemote(form), 'github.com/owner/repo', form)
  }
  const repo = makeRepo(t)
  const bare = store.identityOf(repo.dir)
  assert.equal(bare.remote, null)
  assert.equal(bare.identity, fs.realpathSync(repo.dir))
  repo.git('remote', 'add', 'origin', 'https://user:s3cr3t-token@github.com/Owner/Repo.git')
  const remote = store.identityOf(repo.dir)
  assert.equal(remote.identity, 'github.com/owner/repo')
  assert.equal(remote.name, 'repo')
  assert.equal(remote.root, fs.realpathSync(repo.dir))
  assert.equal(remote.key, store.projectKey('github.com/owner/repo'))
  assert.ok(!JSON.stringify(remote).includes('s3cr3t-token'))
  const other = makeRepo(t)
  const linked = path.join(tempDir(t), 'linked')
  other.git('worktree', 'add', '-q', '-b', 'linked-branch', linked)
  assert.equal(store.identityOf(linked).key, store.identityOf(other.dir).key)
})

test('the key is a slug and 12 hex digits of the identity', () => {
  const key = store.projectKey('github.com/owner/repo')
  assert.match(key, /^repo-[0-9a-f]{12}$/)
  assert.equal(store.projectKey('github.com/owner/repo'), key)
  assert.notEqual(store.projectKey('github.com/other/repo'), key)
  assert.match(store.projectKey('/home/a/My Project'), /^My-Project-[0-9a-f]{12}$/)
})

test('an audit is saved under the project key and the date, the next one the same day gets a suffix, and the latest is found', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const key = 'repo-0123456789ab'
  const first = store.nextReportDir(dataDir, key, '2026-10-12')
  assert.equal(first, path.join(dataDir, 'audits', key, '2026-10-12'))
  assert.equal(fs.existsSync(first), false, 'nextReportDir does not create the folder')
  store.writeReport(first, { list: [{ causeKey: 'x' }] }, '# md a')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first, 'report.json'), 'utf8')).list, [{ causeKey: 'x' }])
  assert.equal(fs.readFileSync(path.join(first, 'report.md'), 'utf8'), '# md a')
  const second = store.nextReportDir(dataDir, key, '2026-10-12')
  assert.equal(second, `${first}-2`)
  store.writeReport(second, { list: [] }, '# md b')
  const third = store.nextReportDir(dataDir, key, '2026-11-04')
  store.writeReport(third, { list: [{ causeKey: 'y' }] }, '# md c')
  const previous = store.previousReport(dataDir, key)
  assert.equal(previous.dir, third)
  assert.equal(previous.date, '2026-11-04')
  assert.deepEqual(previous.report.list, [{ causeKey: 'y' }])
  assert.equal(store.previousReport(dataDir, 'other-000000000000'), null)
  assert.equal(store.previousReport(tempDir(t), key), null)
})

test('the estimate is the range per topic of the saved audits of any project, and says there is no history when there is none (R10)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  assert.deepEqual(store.estimate(dataDir), { samples: 0 })
  const save = (key, date, meta) => store.writeReport(store.nextReportDir(dataDir, key, date), { meta }, '')
  save('a-000000000001', '2026-10-01', { durationSeconds: 600, costUsd: 2.5, topics: ['bugs', 'tests', 'docs', 'security', 'hygiene'] })
  save('b-000000000002', '2026-10-02', { durationSeconds: 1800, costUsd: 5.4, topics: ['bugs', 'tests', 'docs', 'security', 'hygiene', 'releases', 'reliability', 'architecture', 'dependencies'] })
  save('c-000000000003', '2026-10-03', { durationSeconds: 300, costUsd: null, topics: ['bugs'] })
  save('d-000000000004', '2026-10-04', { topics: [] })
  assert.deepEqual(store.estimate(dataDir), { samples: 3, perTopic: { minutes: [2, 5], usd: [0.5, 0.6] } })
})

const location = (file, line) => ({ file, line })

function fixture() {
  const item = (over) => ({
    number: 1, id: 'F1', topic: 'bugs', type: 'bug', verification: 'proven', title: 'A payment slower than 30 s is charged twice', claim: 'the retry sends no idempotency key',
    locations: [location('src/payments/charge.js', 88)], causeKey: 'charge-no-idempotency', mark: 'new', priority: 'P0', severity: 'critical',
    reason: 'charges real customers on every provider outage', size: 'S', how: 'one agent', regression: false, waitCost: 'high', ...over,
  })
  return {
    meta: {
      date: '2026-11-04', topics: ['bugs', 'security', 'tests'], leftOut: [{ topic: 'accessibility', reason: 'it has no interface' }], durationSeconds: 1560, costUsd: 2.84,
      waits: ['Choose which ones you take, by number.'], assumptions: ['I treated the 2 red tests as outdated tests.'],
      reviewers: { notLooked: [{ topic: 'bugs', items: ['src/legacy/'] }], exhausted: ['tests'] },
      radar: 'Fast 26 min · Delegation 31 of 40 calls · Affordable', cost: { readable: true, text: 'Session 8a00: US$ 2.84 at list price.' },
    },
    analysis: {
      project: { name: 'tienda-api', key: 'tienda-api-0123456789ab', identity: 'github.com/o/tienda-api', remote: 'https://github.com/o/tienda-api.git', root: '/x' },
      checks: {
        tests: { state: 'could-not', notRun: true, reason: '`npm test` reaches `db:seed` through `pretest`: it seeds data' },
        lint: { state: 'not-applicable', reason: 'no linter declared' },
        dependencies: { state: 'result' }, secrets: { state: 'result', truncated: false }, todos: { state: 'result' }, branches: { state: 'result' },
        issues: { state: 'could-not', reason: 'gh is not installed' }, prs: { state: 'not-applicable', reason: 'the remote is not GitHub' }, hotspots: { state: 'result' },
      },
      changes: { changed: false, attributed: [], unattributable: [{ between: ['tests', 'lint'], items: [{ kind: 'status', files: ['notes.txt'] }] }] },
    },
    triage: {
      counts: { candidates: 47, verified: 19 },
      list: [
        item({}),
        item({ number: 2, id: 'F2', topic: 'security', type: 'risk', verification: 'read-confirmed', title: 'A live key is in the history', locations: [{ file: 'config/dev.env', commit: '4f2a91c' }], causeKey: 'key', mark: 'still', reason: 'anyone with the repo can read it', how: 'you and one agent' }),
        item({ number: 3, id: 'F3', topic: 'tests', title: 'CI has been red for 9 days', priority: 'P1', size: 'M', causeKey: 'ci' }),
        item({ number: 4, id: 'F4', topic: 'docs', type: 'docs', title: 'README names a script that is gone', priority: 'P2', size: 'S', mark: null, causeKey: 'readme' }),
        item({ number: 5, id: 'F5', topic: 'opportunities', type: 'opportunity', verification: 'proposal', title: 'Export orders to CSV', priority: 'P3', size: 'L', causeKey: 'csv' }),
      ],
      unverified: [{ id: 'F6', topic: 'bugs', title: 'Possible stock race', claim: 'two buyers of the last item', locations: [location('src/orders/stock.js', 30)], reason: 'the verifier could not reproduce or rule it out' }],
      sinceLast: { previous: { date: '2026-10-12' }, resolved: [{ causeKey: 'old', title: 'An old bug', topic: 'bugs' }], notReaudited: [] },
      discarded: [{ id: 'D1', reason: 'refuted' }, { id: 'D2', reason: 'refuted' }, { id: 'D3', reason: 'covered-by-issue', issue: 41 }, { id: 'D4', reason: 'merged', into: 'F1' }, { id: 'D5', reason: 'no-location' }],
      issueComparison: { state: 'could-not', reason: 'gh is not installed', removed: [] },
    },
  }
}

const between = (md, from, to) => md.slice(md.indexOf(from), to ? md.indexOf(to) : undefined)

test('the Spanish report has the eleven sections of R21 in order, with the shape of the prototype (C5)', () => {
  const out = report.render(fixture(), 'es')
  assert.deepEqual(out.data.sections, SECTIONS)
  const md = out.markdown
  assert.match(md.split('\n')[0], /tienda-api.*2026-11-04.*3 temas.*47 hallazgos.*19 sobrevivieron/)
  const order = ['**Espera tu sí**', '**Supuestos**', '**P0 · Urge ya**', '**P1 · Pronto**', '**P2 · Programable**', '**P3 · Cuando puedas / ideas**', '**Sin verificar', '**Desde la última auditoría', '**Descartados', '**No cubrí', '**RADAR', '**¿Cuáles tomas?**']
  let at = -1
  for (const label of order) {
    const i = md.indexOf(label)
    assert.ok(i > at, `${label} is missing or out of order`)
    at = i
  }
  assert.ok(md.includes('1. **[Bug · comprobado]** A payment slower than 30 s is charged twice'))
  assert.ok(md.includes('`src/payments/charge.js:88` · Bug — the retry sends no idempotency key'))
  assert.ok(md.includes('*Por qué P0:* charges real customers on every provider outage · Pequeño · one agent · nuevo'))
  assert.ok(md.includes('2. **[Seguridad · confirmado leyendo]** A live key is in the history'))
  assert.ok(md.includes('`config/dev.env` (commit `4f2a91c`)'))
  assert.ok(md.includes('· sigue'))
  assert.ok(md.includes('*Por qué P3:*'))
  assert.ok(md.includes('5. **[Oportunidad · propuesta]**'))
  assert.deepEqual([...md.matchAll(/^(\d+)\. \*\*\[/gm)].map((m) => Number(m[1])), [1, 2, 3, 4, 5])
  assert.ok(md.endsWith('**¿Cuáles tomas?** Por ejemplo: «1, 2 y 3».') || md.trimEnd().endsWith('**¿Cuáles tomas?** Por ejemplo: «1, 2 y 3».'))
})

test('what is unverified has no level and no number, and the since-last, discarded and not-covered sections say what R21 and R22 ask', () => {
  const md = report.render(fixture(), 'es').markdown
  const unverified = between(md, '**Sin verificar', '**Desde la última auditoría')
  assert.ok(unverified.includes('Possible stock race') && unverified.includes('`src/orders/stock.js:30`'))
  assert.doesNotMatch(unverified, /\bP[0-3]\b/)
  assert.doesNotMatch(unverified, /^\d+\./m)
  assert.ok(md.includes('**Desde la última auditoría (2026-10-12):** 3 nuevos, 1 siguen, 1 resueltos.'))
  const discarded = between(md, '**Descartados', '**No cubrí')
  assert.ok(discarded.includes('**Descartados:** 5 (refutados: 2, cubiertos por un issue: 1, repetidos: 1, sin ubicación: 1).'))
  assert.ok(discarded.includes('No pude comparar con los issues abiertos (gh is not installed).'))
  assert.ok(!discarded.includes('reporte guardado'))
  const notCovered = between(md, '**No cubrí', '**RADAR')
  for (const line of ['Tests: no se corrió: `npm test` reaches `db:seed`', 'Linter: no aplica: no linter declared', 'Issues: no se pudo: gh is not installed', 'Pull requests: no aplica: the remote is not GitHub', 'Accesibilidad: tema fuera: it has no interface', 'Bug: no miré src/legacy/', 'Revisor agotado: Tests']) {
    assert.ok(notCovered.includes(line), line)
  }
  assert.ok(!notCovered.includes('Dependencias') && !notCovered.includes('Secretos'), 'a check that gave a result is not listed as not covered')
  const assumptions = between(md, '**Supuestos**', '**P0')
  assert.ok(assumptions.includes('I treated the 2 red tests as outdated tests.'))
  assert.ok(assumptions.includes('Cambio no atribuible durante la auditoría (entre tests y lint): notes.txt'))
})

test('the radar and the cost come from meta; an unreadable cost is said and no figure is invented (R23)', () => {
  const md = report.render(fixture(), 'es').markdown
  const tail = between(md, '**RADAR')
  assert.ok(tail.includes('Fast 26 min') && tail.includes('Session 8a00: US$ 2.84 at list price.'))
  const unreadable = fixture()
  unreadable.meta.radar = 'Rápido 26 min'
  unreadable.meta.cost = { readable: false }
  unreadable.meta.costUsd = null
  const out = report.render(unreadable, 'es')
  const after = between(out.markdown, '**RADAR')
  assert.ok(after.includes('No pude leer el costo de la sesión; no pongo una cifra.'))
  assert.doesNotMatch(after, /US\$/)
  assert.equal(out.data.meta.costUsd, null)
})

test('the first audit says there is no earlier one, a band with no points is left out, and an empty list says so', () => {
  const first = fixture()
  first.triage.sinceLast = { previous: null, resolved: [], notReaudited: [] }
  assert.ok(report.render(first, 'es').markdown.includes('**Desde la última auditoría:** no hay una auditoría anterior.'))
  const empty = fixture()
  empty.triage.list = []
  const out = report.render(empty, 'es')
  assert.deepEqual(out.data.sections, SECTIONS)
  assert.doesNotMatch(out.markdown, /\*\*P[0-3] ·/)
  assert.ok(out.markdown.includes('**¿Cuáles tomas?** No hay hallazgos verificados para tomar.'))
  const oneBand = fixture()
  oneBand.triage.list = oneBand.triage.list.filter((entry) => entry.priority === 'P1')
  const md = report.render(oneBand, 'es').markdown
  assert.ok(md.includes('**P1 · Pronto**') && !md.includes('**P0 ·') && !md.includes('**P2 ·'))
  assert.ok(md.includes('**¿Cuáles tomas?** Por ejemplo: «3».') || md.includes('«1».'))
})

test('the line since the last audit counts the items not re-audited because their topics were left out, in Spanish and in English', () => {
  const later = fixture()
  later.triage.sinceLast = { previous: { date: '2026-10-12' }, resolved: [], notReaudited: [{ causeKey: 'doc', title: 'Doc drift', topic: 'docs' }, { causeKey: 'rel', title: 'Two versions', topic: 'releases' }] }
  assert.ok(report.render(later, 'es').markdown.includes('3 nuevos, 1 siguen, 0 resueltos. 2 sin revisar esta vez, porque sus temas quedaron fuera.'))
  assert.ok(report.render(later, 'en').markdown.includes('3 new, 1 still open, 0 resolved. 2 not re-audited, because their topics were left out.'))
  assert.doesNotMatch(report.render(fixture(), 'es').markdown, /sin revisar esta vez/)
})

test('the path of the saved report is said only when there is one', () => {
  const withPath = report.render(fixture(), 'es', { savedTo: '/data/audits/k/2026-11-04' }).markdown
  assert.ok(withPath.includes('La lista completa está en el reporte guardado: /data/audits/k/2026-11-04'))
})

test('the English report has the same sections with English labels, and any other language gets English (R3)', () => {
  const md = report.render(fixture(), 'en').markdown
  assert.match(md.split('\n')[0], /tienda-api.*2026-11-04.*3 topics.*47 findings.*19 survived verification/)
  const order = ['**Awaiting your yes**', '**Assumptions**', '**P0 · Now**', '**P1 · Soon**', '**P2 · Schedulable**', '**P3 · When you can / ideas**', '**Unverified (not ranked)**', '**Since the last audit', '**Discarded', '**Not covered', '**RADAR', '**Which do you take?**']
  let at = -1
  for (const label of order) {
    const i = md.indexOf(label)
    assert.ok(i > at, `${label} is missing or out of order`)
    at = i
  }
  assert.ok(md.includes('1. **[Bug · proven]**'))
  assert.ok(md.includes('*Why P0:* charges real customers on every provider outage · Small · one agent · new'))
  assert.equal(report.render(fixture(), 'fr').markdown, md)
  assert.equal(report.render(fixture(), 'es-MX').markdown, report.render(fixture(), 'es').markdown)
})

function writeInputs(dir, fx) {
  const files = {}
  for (const [name, value] of [['meta', fx.meta], ['analysis', fx.analysis], ['triage', fx.triage]]) {
    files[name] = path.join(dir, `${name}.json`)
    fs.writeFileSync(files[name], JSON.stringify(value))
  }
  return files
}

test('report --save writes report.json and report.md under the data directory, says the path, and leaves the project untouched (R24, C6)', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const files = writeInputs(work, fixture())
  const args = ['report', '--meta', files.meta, '--analysis', files.analysis, '--triage', files.triage, '--lang', 'es']
  const env = { AETHER_DATA_DIR: dataDir }
  const unsaved = runBin(BIN, args, repo.dir, env)
  assert.equal(unsaved.status, 0, unsaved.stdout + unsaved.stderr)
  assert.equal(unsaved.json.saved, undefined)
  assert.equal(fs.existsSync(path.join(dataDir, 'audits')), false)
  const r = runBin(BIN, [...args, '--save'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const dir = path.join(dataDir, 'audits', 'tienda-api-0123456789ab', '2026-11-04')
  assert.equal(r.json.saved, dir)
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'))
  assert.equal(saved.list.length, 5)
  assert.equal(saved.list[0].causeKey, 'charge-no-idempotency')
  assert.equal(saved.meta.durationSeconds, 1560)
  assert.deepEqual(saved.meta.topics, ['bugs', 'security', 'tests'])
  assert.deepEqual(saved.sections, SECTIONS)
  const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8')
  assert.equal(md, r.json.markdown)
  assert.ok(md.includes(`La lista completa está en el reporte guardado: ${dir}`))
  assert.equal(repo.git('status', '--porcelain'), '')
  const again = runBin(BIN, [...args, '--save'], repo.dir, env)
  assert.equal(again.json.saved, `${dir}-2`)
  assert.equal(store.previousReport(dataDir, 'tienda-api-0123456789ab').dir, `${dir}-2`)
  assert.equal(store.estimate(dataDir).samples, 2)
})

test('--out writes the whole result outside the project and prints a summary; a missing flag is exit 2 and a missing file is exit 1', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const files = writeInputs(work, fixture())
  const out = path.join(work, 'report-out.json')
  const r = runBin(BIN, ['report', '--meta', files.meta, '--analysis', files.analysis, '--triage', files.triage, '--lang', 'en', '--out', out], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.out, out)
  assert.equal(r.json.summary.sections, 11)
  const written = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(written.sections, SECTIONS)
  assert.ok(written.markdown.includes('**Awaiting your yes**'))
  assert.equal(runBin(BIN, ['report', '--meta', files.meta], repo.dir).status, 2)
  const missing = runBin(BIN, ['report', '--meta', path.join(work, 'nope.json'), '--analysis', files.analysis, '--triage', files.triage], repo.dir)
  assert.equal(missing.status, 1)
  assert.match(missing.json.error, /nope\.json/)
})

test('a failed subcommand with --out prints its own failure, never a success line, and writes no file', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const files = writeInputs(work, fixture())
  const out = path.join(work, 'never.json')
  const r = runBin(BIN, ['report', '--meta', path.join(work, 'nope.json'), '--analysis', files.analysis, '--triage', files.triage, '--out', out], repo.dir)
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /nope\.json/)
  assert.equal(fs.existsSync(out), false)
})

test('«No cubrí» lists the checks with no result first and the partial ones after, each in the order of the checks', () => {
  const f = fixture()
  f.analysis.checks.tests = { state: 'result', truncated: true }
  f.analysis.checks.lint = { state: 'could-not', reason: 'eslint crashed' }
  const section = between(report.render(f, 'es').markdown, '**No cubrí', '**RADAR')
  const lint = section.indexOf('Linter: no se pudo: eslint crashed')
  const tests = section.indexOf('Tests: se leyó solo una parte')
  assert.ok(lint > -1 && tests > -1, section)
  assert.ok(lint < tests, section)
})
