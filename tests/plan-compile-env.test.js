'use strict'

// Spec 036 task 9 (#256 1, #232 6, #232 7, #209): compile reads its session and config only from its env
// argument, fails a broken swarm config before any write, and records the baseline duration once.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, writePlan, tempDir, NO_LANES_CONFIG } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { compile } = require('../plugins/aether/lib/plan-compile.js')

const SWARM = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'swarm.json')

function skill(root, name) {
  const dir = path.join(root, '.agents', 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${name}`, 'description: Use for the work.', '---', 'rule 1'].join('\n') + '\n')
}

const withSkills = (n, names) => task(n).replace(/- Depends on: none\n/, `- Depends on: none\n- Skills: ${names}\n`)

function runCompile(repo, markdown, env) {
  let out = ''
  compile(writePlan(repo.dir, markdown), ['--no-lanes'], {
    cwd: repo.dir,
    stdout: { write(chunk) { out += chunk } },
    env,
  })
  return JSON.parse(out.trim().split('\n').pop())
}

test('compile with a broken config/swarm.json throws and leaves no briefs and no recordUse file', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'swarm-data-')
  skill(repo.dir, 'erebus-ui')
  // In-process only: other test files compile at the same time and read the real file.
  const original = fs.readFileSync
  fs.readFileSync = function (file, ...args) {
    if (file === SWARM) return '{'
    return original.call(this, file, ...args)
  }
  t.after(() => { fs.readFileSync = original })
  const env = {
    HOME: tempDir(t, 'swarm-home-'),
    AETHER_DATA_DIR: data,
    CLAUDE_CODE_SESSION_ID: 'sess-swarm',
    AETHER_LANES_CONFIG: NO_LANES_CONFIG,
  }
  assert.throws(() => runCompile(repo, plan([withSkills(1, 'erebus-ui')]), env), /swarm config/)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs')), false)
  assert.equal(fs.existsSync(path.join(data, 'skills', 'uses.jsonl')), false)
})

test('compile uses the session and the stop from its env argument, not from process.env', (t) => {
  const repo = makeRepo(t)
  const home = tempDir(t, 'env-home-')
  const dataA = tempDir(t, 'data-a-')
  const dataB = tempDir(t, 'data-b-')
  skill(repo.dir, 'erebus-ui')
  const previous = {
    session: process.env.CLAUDE_CODE_SESSION_ID,
    data: process.env.AETHER_DATA_DIR,
  }
  process.env.CLAUDE_CODE_SESSION_ID = 'B'
  process.env.AETHER_DATA_DIR = dataB
  t.after(() => {
    if (previous.session === undefined) delete process.env.CLAUDE_CODE_SESSION_ID
    else process.env.CLAUDE_CODE_SESSION_ID = previous.session
    if (previous.data === undefined) delete process.env.AETHER_DATA_DIR
    else process.env.AETHER_DATA_DIR = previous.data
  })
  const envA = { HOME: home, AETHER_DATA_DIR: dataA, CLAUDE_CODE_SESSION_ID: 'A', AETHER_LANES_CONFIG: NO_LANES_CONFIG }
  runCompile(repo, plan([withSkills(1, 'erebus-ui')]), envA)
  const uses = fs.readFileSync(path.join(dataA, 'skills', 'uses.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(uses.length, 1)
  assert.equal(uses[0].session, 'A')
  assert.equal(fs.existsSync(path.join(dataB, 'skills', 'uses.jsonl')), false)

  const autonomy = require('../plugins/aether/lib/autonomy.js')
  const { markSession } = require('../plugins/aether/lib/session.js')
  const configDir = tempDir(t, 'env-cfg-')
  const projDir = path.join(configDir, 'projects', 'proj-env')
  fs.mkdirSync(projDir, { recursive: true })
  const t0 = Date.now() - 2 * 3600 * 1000
  fs.writeFileSync(
    path.join(projDir, 'A.jsonl'),
    JSON.stringify({
      type: 'user',
      isSidechain: false,
      origin: { kind: 'human' },
      entrypoint: 'sdk-cli',
      timestamp: new Date(t0).toISOString(),
      message: { role: 'user', content: 'work unattended for 1 hour' },
    }) + '\n',
  )
  markSession(dataA, 'A', 1000, { repo: repo.dir, claude: null })
  const started = autonomy.start(repo.dir, { quote: 'work unattended for 1 hour', session: 'A', hours: 1, usd: 5 }, { configDir, dataDir: dataA, now: t0 })
  assert.equal(started.ok, true)
  const child = spawnSync(process.execPath, ['-e', `
    const { compile } = require(${JSON.stringify(require.resolve('../plugins/aether/lib/plan-compile.js'))})
    compile(process.argv[1], ['--no-lanes'], {
      cwd: process.argv[2],
      stdout: process.stdout,
      env: JSON.parse(process.argv[3]),
    })
  `, writePlan(repo.dir, plan([task(1)])), repo.dir, JSON.stringify(envA)], { encoding: 'utf8' })
  assert.notEqual(child.status, 0)
  assert.match(child.stdout, /aether-autonomy end --outcome ceiling/)
  assert.match(child.stdout, new RegExp(started.run.id))
})

test('a compile writes one baseline line to the run timings', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'time-data-')
  const args = runCompile(repo, plan([task(1)]), {
    HOME: tempDir(t, 'time-home-'),
    AETHER_DATA_DIR: data,
    AETHER_LANES_CONFIG: NO_LANES_CONFIG,
  })
  const lines = fs.readFileSync(path.join(args.runDir, 'timings.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].class, 'baseline')
  assert.equal(typeof lines[0].ms, 'number')
  assert.ok(Number.isFinite(lines[0].ms) && lines[0].ms >= 0)
})

test('baseline.test.js keeps no compile-refusal test; aether-plan.test.js has the moved one', () => {
  const baseline = fs.readFileSync(path.join(__dirname, 'baseline.test.js'), 'utf8')
  const titles = [...baseline.matchAll(/(?:test|describe)\(\s*(['"`])([\s\S]*?)\1/g)].map((match) => match[2])
  assert.equal(titles.some((title) => title.includes('compile refus')), false)
  const planTests = fs.readFileSync(path.join(__dirname, 'aether-plan.test.js'), 'utf8')
  assert.match(planTests, /test\('aether-plan compile refuses in a Lead session/)
})
