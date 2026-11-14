'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, runBin, useDataDir, tempDir, makeRepo } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun } = require('./report-fixtures.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const REPORT_BIN = path.join(PLUGIN, 'bin', 'aether-report')

test('aether-report --run prints the report, and --no-tests skips the tests', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  let r = runBin(REPORT_BIN, ['--run', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.usage.session, 'run-session')
  assert.equal(r.json.quality.tests.passed, true)
  assert.equal(r.json.radar.robust.testsPassed, true)
  r = runBin(REPORT_BIN, ['--run', args.runId, '--no-tests', '--session', 'other-session'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.quality.tests, null)
  assert.equal(r.json.radar.robust.testsPassed, null)
  assert.equal(r.json.usage.session, 'other-session')
})

test('aether-report finalize records the run and deletes its directory', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const r = runBin(REPORT_BIN, ['finalize', '--run', args.runId, '--no-tests'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.record.status, 'finalized')
  assert.equal(fs.existsSync(args.runDir), false)
  const lines = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n')
  assert.equal(JSON.parse(lines[lines.length - 1]).runId, args.runId)
})

test('aether-report price prices a claude -p output at OpenRouter prices', (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'out.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      total_cost_usd: 0.5,
      modelUsage: { 'claude-sonnet-5-5': { inputTokens: 1e6, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 1e6, costUSD: 0.5 } },
    }),
  )
  let r = runBin(REPORT_BIN, ['price', file, '--main-model', 'claude-sonnet-5-5'], dir)
  assert.equal(r.status, 0, r.stdout)
  assert.ok(Math.abs(r.json.totalUsd - 6) < 1e-9, String(r.json.totalUsd))
  r = runBin(REPORT_BIN, ['price', file], dir)
  assert.ok(Math.abs(r.json.totalUsd - 4.5) < 1e-9, String(r.json.totalUsd))
})

test('aether-report reports errors as JSON and exits 1', (t) => {
  useDataDir(t)
  const { repo } = finishedRun(t)
  let r = runBin(REPORT_BIN, ['--run', '20991231-000000-abcd'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /run 20991231-000000-abcd not found/)
  r = runBin(REPORT_BIN, ['--run'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /--run needs a value/)
  r = runBin(REPORT_BIN, [], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /^usage: aether-report/)
})

test('aether-report --run prints the per-call choices and the delegated work', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const reference = { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }
  appendLog(dataDir, null, { kind: 'choice', time: T0 + 4 * MIN, session: null, run: args.runId, design: null, call: 'task-1-1-implement', role: 'implementer', requested: 46.8, reference, picked: null, reason: 'native', candidates: [] })
  appendLog(dataDir, null, { kind: 'took', time: T0 + 6 * MIN, session: null, run: args.runId, call: 'task-1-1-implement', by: 'native', cause: 'no-candidate' })
  const r = runBin(REPORT_BIN, ['--run', args.runId, '--no-tests'], repo.dir, { AETHER_SUPERDELEGATION: 'off' })
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json.lanes.run.choices.map((c) => [c.call, c.reference, c.by, c.ms]), [['task-1-1-implement', reference, 'native', 2 * MIN]])
  assert.deepEqual(r.json.radar.delegation.work, { calls: 1, external: 0, native: 1, externalShare: 0 })
  assert.deepEqual(r.json.radar.delegation.quotaByHarness, {})
  assert.equal(r.json.superdelegation.on, false)
})

test('aether-report --delegates without a log prints the ladder steps with zero counts and no delegations', (t) => {
  useDataDir(t)
  const r = runBin(REPORT_BIN, ['--delegates'], tempDir(t))
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json.delegations, [])
  assert.ok(r.json.ladder.steps.length > 0 && r.json.ladder.steps.every((s) => s.tasks === 0 && s.attempts === 0))
  assert.equal('totals' in r.json, false)
})

test('aether-report --skills reports per project and period and reproduces the #269 figures without reading conversations (R17, R18, R21, C8)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-report-skills-')
  const preDir = path.join(repo.dir, '.agents', 'skills', 'artificial-analysis')
  fs.mkdirSync(preDir, { recursive: true })
  fs.writeFileSync(path.join(preDir, 'SKILL.md'), '---\nname: artificial-analysis\ndescription: AA\n---\nbody\n')
  repo.git('add', '.agents/skills/artificial-analysis/SKILL.md')
  repo.git('commit', '-m', 'existing')
  const commitSec = Number.parseInt(repo.git('log', '-n', '1', '--format=%ct'), 10)
  const t0 = (commitSec + 10) * 1000

  for (let i = 0; i < 4; i++) {
    reg.recordCreated(data, { time: t0 + i, session: 's1', repo: repo.dir, name: 'artificial-analysis', path: preDir, type: 'project' })
  }
  reg.recordCreated(data, { time: t0 + 10, session: 's2', repo: `${repo.dir}/.aether/work/delegates/d1/wt`, name: 'diseno-de-juego', path: `${repo.dir}/.aether/work/delegates/d1/wt/.agents/skills/diseno-de-juego`, type: 'project' })
  reg.recordCreated(data, { time: t0 + 11, session: 's2', repo: repo.dir, name: 'diseno-de-juego', path: `${repo.dir}/.agents/skills/diseno-de-juego`, type: 'project' })
  reg.recordCreated(data, { time: t0 + 20, session: 's3', repo: '/gone/a', name: 'criterio-del-dueno', path: '/gone/a/.claude/skills/criterio-del-dueno', type: 'project' })
  reg.recordCreated(data, { time: t0 + 30, session: 's4', repo: '/gone/b', name: 'direccion-de-arte', path: '/gone/b/.claude/skills/direccion-de-arte', type: 'project' })

  const r = runBin(REPORT_BIN, ['--skills'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(r.status, 0, r.stderr)
  const out = r.json
  assert.equal(out.mode, 'skills')
  assert.equal(out.totals.createdRaw, 8)
  assert.equal(out.totals.created, 3)
  assert.deepEqual(out.created.map((s) => s.name), ['diseno-de-juego', 'criterio-del-dueno', 'direccion-de-arte'])
  assert.equal(out.totals.downloaded, 0)
  assert.equal(out.totals.agentUses, 0)

  const later = runBin(REPORT_BIN, ['--skills', '--since', String(t0 + 25)], repo.dir, { AETHER_DATA_DIR: data })
  assert.deepEqual(later.json.created.map((s) => s.name), ['direccion-de-arte'])
})

// Two install directories under plugins/data, plus a conversation and a stray jsonl the report must not read.
function skillsFilterFixture(t) {
  const root = tempDir(t, 'aether-report-skills-filter-')
  const mine = path.join(root, 'plugins', 'data', 'aether-inline')
  const sibling = path.join(root, 'plugins', 'data', 'aether-aether-plugin')
  const repoA = '/gone/repo-a'
  const repoB = '/gone/repo-b'
  const tEarly = Date.parse('2026-11-01T00:00:00.000Z')
  const tMid = Date.parse('2026-11-08T12:00:00.000Z')
  const tLate = Date.parse('2026-11-13T00:00:00.000Z')
  const skill = (repo, name) => `${repo}/.agents/skills/${name}`
  reg.recordCreated(mine, { time: tEarly, session: 's-early', repo: repoA, name: 'alpha', path: skill(repoA, 'alpha'), type: 'project' })
  reg.recordCreated(mine, { time: tMid, session: 's-mid', repo: repoA, name: 'beta', path: skill(repoA, 'beta'), type: 'project' })
  reg.recordCreated(mine, { time: tLate, session: 's-late', repo: repoB, name: 'gamma', path: `${repoB}/.claude/skills/gamma`, type: 'project' })
  // Same skill again, later and in another session: dedupe keeps the first line, so --session s-late must not revive it.
  reg.recordCreated(mine, { time: tLate, session: 's-late', repo: repoA, name: 'alpha', path: skill(repoA, 'alpha'), type: 'project' })
  reg.recordInstall(mine, { time: tMid, session: 's-mid', source: 'owner', scope: 'project', repo: repoA, name: 'downloaded-one', path: skill(repoA, 'downloaded-one'), hash: 'abc' })
  reg.recordUse(mine, { time: tMid, session: 's-mid', kind: 'lead', skills: ['beta'], repo: repoA })
  reg.recordUse(mine, { time: tLate, session: 's-late', kind: 'delegate', task: 't1', skills: ['gamma'], repo: repoB })
  reg.recordNotice(mine, { time: tMid, session: 's-mid', repo: repoA, kind: 'idle-skills', name: 'beta' })
  reg.recordCreated(sibling, { time: tMid, session: 's-other', repo: '/gone/other', name: 'from-sibling', path: skill('/gone/other', 'from-sibling'), type: 'project' })
  reg.recordUse(sibling, { time: tMid, session: 's-other', kind: 'lead', skills: ['from-sibling'], repo: '/gone/other' })
  const convo = path.join(mine, 'projects', 's-mid.jsonl')
  fs.mkdirSync(path.dirname(convo), { recursive: true })
  fs.writeFileSync(convo, JSON.stringify({ time: tMid, session: 's-mid', repo: repoA, name: 'from-conversation', path: skill(repoA, 'from-conversation'), type: 'project' }) + '\n')
  fs.writeFileSync(path.join(mine, 'skills', 'extra.jsonl'), JSON.stringify({ time: tMid, session: 's-mid', repo: repoA, name: 'stray-file', path: skill(repoA, 'stray-file'), type: 'project' }) + '\n')
  const run = (args) => {
    const r = runBin(REPORT_BIN, ['--skills', ...args], root, { AETHER_DATA_DIR: mine, CLAUDE_CODE_SESSION_ID: '' })
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
    return r.json
  }
  return { root, mine, sibling, repoA, repoB, tEarly, tMid, tLate, run }
}

function treeText(dir) {
  const files = []
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name)
      if (fs.statSync(full).isDirectory()) walk(full)
      else files.push(`${path.relative(dir, full)}\n${fs.readFileSync(full, 'utf8')}`)
    }
  }
  walk(dir)
  files.sort()
  return files.join('\n---\n')
}

test('aether-report --skills --repo limits the report to one canonical project (R17)', (t) => {
  const fx = skillsFilterFixture(t)
  const repoOnly = fx.run(['--repo', fx.repoA])
  assert.equal(repoOnly.mode, 'skills')
  assert.deepEqual(repoOnly.created.map((s) => s.name), ['alpha', 'beta'])
  assert.equal(repoOnly.totals.createdRaw, 3)
  assert.equal(repoOnly.totals.leadLoads, 1)
  assert.equal(repoOnly.totals.delegateUses, 0)
  assert.equal(repoOnly.totals.notices, 1)
  assert.equal(repoOnly.totals.downloaded, 1)
  assert.deepEqual(Object.keys(repoOnly.projects), [fx.repoA])
  assert.equal(repoOnly.projects[fx.repoA].downloaded[0].name, 'downloaded-one')
  const viaWorktree = fx.run(['--repo', `${fx.repoA}/.aether/work/delegates/d1/wt`])
  assert.deepEqual(viaWorktree.created.map((s) => s.name), ['alpha', 'beta'])
  const other = fx.run(['--repo', fx.repoB])
  assert.deepEqual(other.created.map((s) => s.name), ['gamma'])
  assert.equal(other.totals.agentUses, 1)
  assert.equal(other.totals.leadLoads, 0)
})

test('aether-report --skills --until and ISO --since/--until bound the period (R17)', (t) => {
  const fx = skillsFilterFixture(t)
  const early = fx.run(['--until', String(fx.tEarly)])
  assert.deepEqual(early.created.map((s) => s.name), ['alpha'])
  assert.equal(early.period.until, fx.tEarly)
  assert.equal(early.period.since, null)
  const throughMid = fx.run(['--until', '2026-11-08T12:00:00Z'])
  assert.deepEqual(throughMid.created.map((s) => s.name), ['alpha', 'beta'])
  assert.equal(throughMid.period.until, fx.tMid)
  assert.equal(throughMid.totals.agentUses, 0)
  assert.equal(throughMid.totals.leadLoads, 1)
  const mid = fx.run(['--since', '2026-11-08T12:00:00Z', '--until', '2026-11-08T12:00:00.000Z'])
  assert.deepEqual(mid.created.map((s) => s.name), ['beta'])
  assert.deepEqual(mid.period, { since: fx.tMid, until: fx.tMid })
  assert.equal(mid.totals.downloaded, 1)
  assert.equal(mid.totals.notices, 1)
  assert.equal(mid.totals.agentUses, 0)
  const bad = runBin(REPORT_BIN, ['--skills', '--since', 'not-a-time'], fx.root, { AETHER_DATA_DIR: fx.mine, CLAUDE_CODE_SESSION_ID: '' })
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /usage: aether-report --skills/)
})

test('aether-report --skills --session keeps that session after dedupe (R17)', (t) => {
  const fx = skillsFilterFixture(t)
  const late = fx.run(['--session', 's-late'])
  assert.deepEqual(late.created.map((s) => s.name), ['gamma'])
  assert.equal(late.totals.createdRaw, 2)
  assert.equal(late.totals.created, 1)
  assert.equal(late.totals.leadLoads, 0)
  assert.equal(late.totals.delegateUses, 1)
  assert.equal(late.totals.swarmUses, 0)
  assert.equal(late.totals.agentUses, 1)
  assert.deepEqual(late.agentUsesBySkill, { gamma: 1 })
  assert.equal(late.totals.notices, 0)
  const mid = fx.run(['--session', 's-mid'])
  assert.deepEqual(mid.created.map((s) => s.name), ['beta'])
  assert.equal(mid.totals.leadLoads, 1)
  assert.deepEqual(mid.leadLoadsBySkill, { beta: 1 })
  assert.equal(mid.totals.noticesByKind['idle-skills'], 1)
})

test('aether-report --skills reads only the resolved data dir and does not write (R17, R18)', (t) => {
  const fx = skillsFilterFixture(t)
  const before = treeText(path.join(fx.root, 'plugins', 'data'))
  const all = fx.run([])
  assert.equal(all.mode, 'skills')
  assert.deepEqual(all.period, { since: null, until: null })
  assert.equal(all.totals.createdRaw, 4)
  assert.deepEqual(all.created.map((s) => s.name), ['alpha', 'beta', 'gamma'])
  assert.equal(JSON.stringify(all).includes('from-sibling'), false)
  assert.equal(JSON.stringify(all).includes('from-conversation'), false)
  assert.equal(JSON.stringify(all).includes('stray-file'), false)
  assert.equal(treeText(path.join(fx.root, 'plugins', 'data')), before)
  assert.match(fs.readFileSync(path.join(fx.sibling, 'skills', 'created.jsonl'), 'utf8'), /from-sibling/)
})
