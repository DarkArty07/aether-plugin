'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const { makeRepo, tempDir, commitIn } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const { WORKDIR_RULE } = require('../plugins/aether/lib/lane-calls.js')

const REPLY = (stage) => JSON.stringify({ decision: 'Two approaches: A and B. I recommend A.', stage, decide: 'lead — the owner asked for the simplest', files: 'none' })

// A designer worktree (a repository on a feature branch), the lane environment, and a Claude config
// directory whose installed superpowers has the two skills.
function designSetup(t, options = {}) {
  const repo = makeRepo(t)
  const env = fx.laneEnv(t, options)
  const config = tempDir(t, 'aether-claude-')
  const install = path.join(config, 'plugins', 'cache', 'superpowers', '6.4.1')
  for (const skill of ['brainstorming', 'writing-plans']) {
    fs.mkdirSync(path.join(install, 'skills', skill), { recursive: true })
    fs.writeFileSync(path.join(install, 'skills', skill, 'SKILL.md'), `# ${skill}\n`)
  }
  fs.writeFileSync(
    path.join(config, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'superpowers@claude-plugins-official': [{ installPath: install, version: '6.4.1' }] } }),
  )
  env.CLAUDE_CONFIG_DIR = config
  return { repo, env, install }
}

function design(repo, env, args, input = '') {
  const r = spawnSync(process.execPath, [fx.LANE_BIN, 'design', ...args], { cwd: repo.dir, encoding: 'utf8', input, env: { ...process.env, ...env } })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}
const lastJson = (stdout) => JSON.parse(stdout.trim().split('\n').pop())
const idOf = (stdout) => /design (\d{8}-\d{6}-[0-9a-f]{4});/.exec(stdout)[1]
const onlyDesignId = (repo) => {
  const ids = fs.readdirSync(path.join(repo.dir, '.aether', 'design'))
  assert.equal(ids.length, 1)
  return ids[0]
}
const backupRefs = (repo) => fx.git(repo.dir, 'for-each-ref', '--format=%(refname)', 'refs/aether/')

test('design start runs a round on agy, keeps its commit of the spec, and prints the reply with its Lane line', (t) => {
  const { repo, env, install } = designSetup(t)
  const handoff = [
    'You are the Designer for widgets.',
    'FAKE-AGY: write docs/superpowers/specs/2026-10-08-widgets-design.md spec',
    'FAKE-AGY: commit docs: widgets spec',
    'FAKE-AGY: usage 1000 200 0 500',
    `FAKE-AGY: answer ${REPLY('approaches')}`,
  ].join('\n')
  const r = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], handoff)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const id = idOf(r.stdout)
  assert.equal(
    r.stdout,
    [
      '## Decision',
      'Two approaches: A and B. I recommend A.',
      '',
      '## For the Lead',
      '- Stage: approaches',
      '- Decide: lead — the owner asked for the simplest',
      '- Files: none',
      `- Lane: agy claude-opus-5-5-high, design ${id}; this round 1700 tokens, $0.01 at list price; Claude and GPT models used 0.0 % of the 5 h window and 0.0 % of the weekly one`,
      '',
    ].join('\n'),
  )
  const [turn] = fx.agyTurns(env)
  assert.deepEqual([turn.cwd, turn.marker], [repo.dir, `design/${id}`])
  assert.equal(fx.argAfter(turn.argv, '--model'), 'claude-opus-5-5-high')
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '1800s')
  assert.equal(fx.argAfter(turn.argv, '--conversation'), null)
  const sent = turn.argv[1]
  assert.ok(sent.startsWith(fx.roleBody('designer')))
  assert.ok(sent.includes(`superpowers:brainstorming is ${path.join(install, 'skills', 'brainstorming', 'SKILL.md')}`))
  assert.ok(sent.includes(`superpowers:writing-plans is ${path.join(install, 'skills', 'writing-plans', 'SKILL.md')}`))
  assert.ok(sent.includes('A change to any other file undoes your whole round.'))
  assert.ok(sent.includes('- Your reply goes in the structured output your harness asks for: decision is the text of "Decision"; stage, decide and files are the bullets of "For the Lead".'))
  assert.ok(sent.includes(WORKDIR_RULE))
  assert.ok(sent.endsWith(handoff))
  assert.equal(fx.git(repo.dir, 'log', '-1', '--format=%s'), 'docs: widgets spec')
  assert.equal(fx.git(repo.dir, 'status', '--porcelain'), '')
  const entry = lanes.readLog(env.AETHER_DATA_DIR).find((e) => e.kind === 'call')
  assert.deepEqual([entry.session, entry.run, entry.design, entry.call, entry.role, entry.task, entry.model, entry.status], [
    'lead-1',
    null,
    id,
    'round-1',
    'designer',
    null,
    'claude-opus-5-5-high',
    'ok',
  ])
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'design', id, 'state.json'), 'utf8'))
  assert.deepEqual([state.session, state.cwd, state.status, state.conversation], ['lead-1', repo.dir, 'open', entry.conversation])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'design', id, 'pid')), false)
})

test('design reply resumes the conversation with the answer alone, and its Lane line counts only this round', (t) => {
  const { repo, env } = designSetup(t)
  const first = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], `FAKE-AGY: usage 1000 200 0 500\nFAKE-AGY: answer ${REPLY('approaches')}`)
  const id = idOf(first.stdout)
  const answer = `Option A, please.\nFAKE-AGY: usage 2000 100 0 0\nFAKE-AGY: answer ${REPLY('design')}`
  const second = design(repo, env, ['reply', id], answer)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.match(second.stdout, /\n- Stage: design\n/)
  assert.ok(second.stdout.includes(`- Lane: agy claude-opus-5-5-high, design ${id}; this round 2100 tokens, $0.01 at list price;`))
  const turns = fx.agyTurns(env)
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'design', id, 'state.json'), 'utf8'))
  assert.equal(fx.argAfter(turns[1].argv, '--conversation'), state.conversation)
  assert.equal(turns[1].argv[1], answer)
  assert.deepEqual(design(repo, env, ['reply', '20200101-000000-dead'], 'x').stdout.trim(), JSON.stringify({ error: 'no open design 20200101-000000-dead' }))
})

test('a round that changes anything outside specs and plans is undone whole, and ignored files survive', (t) => {
  const { repo, env } = designSetup(t)
  commitIn(repo, repo.dir, '.gitignore', 'cache/\n', 'ignore cache')
  fs.mkdirSync(path.join(repo.dir, 'cache'))
  fs.writeFileSync(path.join(repo.dir, 'cache', 'keep.txt'), 'keep\n')
  const start = fx.git(repo.dir, 'rev-parse', 'HEAD')
  const r = design(
    repo,
    env,
    ['start', '--session', 'lead-1', '--cwd', repo.dir],
    [
      'FAKE-AGY: write docs/superpowers/specs/x-design.md spec',
      'FAKE-AGY: write src/x.js code',
      'FAKE-AGY: commit mixed',
      'FAKE-AGY: write notes.txt loose',
      `FAKE-AGY: answer ${REPLY('spec')}`,
    ].join('\n'),
  )
  assert.equal(r.status, 4, r.stdout + r.stderr)
  const id = onlyDesignId(repo)
  const backup = `refs/aether/design/${id}/round-1`
  assert.deepEqual(lastJson(r.stdout), { failed: 'violation', files: ['notes.txt', 'src/x.js'], undone: true, backup, design: id })
  assert.equal(fx.git(repo.dir, 'rev-parse', 'HEAD'), start)
  assert.equal(fx.git(repo.dir, 'status', '--porcelain'), '')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'cache', 'keep.txt'), 'utf8'), 'keep\n')
  assert.equal(fx.git(repo.dir, 'show', `${backup}:src/x.js`), 'code')
  assert.equal(fx.git(repo.dir, 'show', `${backup}:notes.txt`), 'loose')
  assert.notEqual(spawnSync('git', ['cat-file', '-e', `${backup}:cache/keep.txt`], { cwd: repo.dir }).status, 0)
})

test('an undone round first keeps everything the undo removes, commits included, in its backup ref', (t) => {
  const { repo, env } = designSetup(t)
  commitIn(repo, repo.dir, 'docs/superpowers/specs/a.md', 'first\n', 'spec a')
  const start = fx.git(repo.dir, 'rev-parse', 'HEAD')
  const r = design(
    repo,
    env,
    ['start', '--session', 'lead-1', '--cwd', repo.dir],
    [
      'FAKE-AGY: write docs/superpowers/specs/s.md committed',
      'FAKE-AGY: commit spec s',
      'FAKE-AGY: write docs/superpowers/specs/a.md edited',
      'FAKE-AGY: write docs/superpowers/plans/b.md created',
      'FAKE-AGY: timeout',
    ].join('\n'),
  )
  assert.equal(r.status, 4, r.stdout + r.stderr)
  const id = onlyDesignId(repo)
  const backup = `refs/aether/design/${id}/round-1`
  const out = lastJson(r.stdout)
  assert.deepEqual([out.failed, out.undone, out.backup, out.design], ['failed', true, backup, id])
  assert.equal(fx.git(repo.dir, 'rev-parse', 'HEAD'), start)
  assert.equal(fx.git(repo.dir, 'status', '--porcelain', '--untracked-files=all'), '')
  assert.equal(fs.existsSync(path.join(repo.dir, 'docs', 'superpowers', 'plans', 'b.md')), false)
  assert.equal(fx.git(repo.dir, 'show', `${backup}:docs/superpowers/specs/a.md`), 'edited')
  assert.equal(fx.git(repo.dir, 'show', `${backup}:docs/superpowers/plans/b.md`), 'created')
  assert.equal(fx.git(repo.dir, 'show', `${backup}:docs/superpowers/specs/s.md`), 'committed')
  assert.equal(fx.git(repo.dir, 'log', '-1', '--format=%s', `${backup}^1`), 'spec s')
  assert.equal(fx.git(repo.dir, 'rev-parse', `${backup}^1^`), start)
  assert.equal(backupRefs(repo), backup)
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'design', id, 'state.json'), 'utf8'))
  assert.equal(state.rounds[0].backup, backup)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'design', id, 'backup.index')), false)
})

test('an undone round that left nothing beyond its start makes no backup ref', (t) => {
  const { repo, env } = designSetup(t)
  const r = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], 'FAKE-AGY: timeout')
  assert.equal(r.status, 4, r.stdout + r.stderr)
  const out = lastJson(r.stdout)
  assert.deepEqual([out.failed, out.undone, Object.hasOwn(out, 'backup'), out.design], ['failed', true, false, onlyDesignId(repo)])
  assert.equal(backupRefs(repo), '')
})

test('a round that breaks after its design opened names the design, and one whose backup fails is left as it was', (t) => {
  const { repo, env } = designSetup(t)
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })
  repo.git('config', '--unset', 'user.name')
  repo.git('config', '--unset', 'user.email')
  repo.git('config', 'user.useConfigOnly', 'true')
  const start = fx.git(repo.dir, 'rev-parse', 'HEAD')
  const r = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], 'FAKE-AGY: write notes.txt loose\nFAKE-AGY: timeout')
  assert.equal(r.status, 1, r.stdout + r.stderr)
  const id = onlyDesignId(repo)
  const out = lastJson(r.stdout)
  assert.equal(out.design, id)
  assert.match(out.error, /commit-tree/)
  assert.equal(fx.git(repo.dir, 'rev-parse', 'HEAD'), start)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'notes.txt'), 'utf8'), 'loose\n')
  assert.deepEqual(lastJson(design(repo, env, ['end', id]).stdout), { ended: id })
})

// Starts a first round in the background whose agy edits README.md and then sleeps, and resolves
// once agy is running and the edit is there.
async function sleepingRound(repo, env) {
  const prompt = ['FAKE-AGY: write README.md edited', 'FAKE-AGY: sleep 30', `FAKE-AGY: answer ${REPLY('approaches')}`].join('\n')
  const bin = spawn(process.execPath, [fx.LANE_BIN, 'design', 'start', '--session', 'lead-1', '--cwd', repo.dir], {
    cwd: repo.dir,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  let stdout = ''
  bin.stdout.on('data', (chunk) => (stdout += chunk))
  const exited = new Promise((resolve) => bin.once('close', (code) => resolve({ code, stdout })))
  bin.stdin.end(prompt)
  const pause = () => new Promise((resolve) => setTimeout(resolve, 50))
  const deadline = Date.now() + 15000
  while (fs.readFileSync(path.join(repo.dir, 'README.md'), 'utf8') !== 'edited\n' && Date.now() < deadline) await pause()
  const id = onlyDesignId(repo)
  while (!fs.existsSync(path.join(repo.dir, '.aether', 'design', id, 'pid')) && Date.now() < deadline) await pause()
  return { bin, exited, id }
}

test('a design bin told to stop during a round stops agy and undoes the round, keeping it in the backup ref', async (t) => {
  const { repo, env } = designSetup(t)
  const start = fx.git(repo.dir, 'rev-parse', 'HEAD')
  const { bin, exited, id } = await sleepingRound(repo, env)
  bin.kill('SIGTERM')
  assert.equal((await exited).code, 143)
  assert.equal(fx.git(repo.dir, 'rev-parse', 'HEAD'), start)
  assert.equal(fx.git(repo.dir, 'status', '--porcelain', '--untracked-files=all'), '')
  assert.equal(fx.git(repo.dir, 'show', `refs/aether/design/${id}/round-1:README.md`), 'edited')
})

test('a design ended during its round is undone into its backup ref, and its directory stays gone', async (t) => {
  const { repo, env } = designSetup(t)
  const { exited, id } = await sleepingRound(repo, env)
  assert.deepEqual(lastJson(design(repo, env, ['end', id]).stdout), { ended: id })
  const { code, stdout } = await exited
  assert.equal(code, 4, stdout)
  assert.equal(lastJson(stdout).backup, `refs/aether/design/${id}/round-1`)
  assert.equal(fx.git(repo.dir, 'show', `refs/aether/design/${id}/round-1:README.md`), 'edited')
  assert.equal(fx.git(repo.dir, 'status', '--porcelain', '--untracked-files=all'), '')
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'design', id)), false)
})

test("a round's agy gets an allowlisted environment, without the Lead's Claude settings or any token", (t) => {
  const { repo, env } = designSetup(t)
  const envFile = path.join(tempDir(t), 'agy-env.json')
  const r = design(repo, { ...env, ORCA_AGENT_LAUNCH_TOKEN: 'secret' }, ['start', '--session', 'lead-1', '--cwd', repo.dir], `FAKE-AGY: env ${envFile}\nFAKE-AGY: answer ${REPLY('approaches')}`)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const seen = JSON.parse(fs.readFileSync(envFile, 'utf8'))
  assert.deepEqual(Object.keys(seen).filter((name) => !fx.allowedEnvName(name)), [])
  assert.deepEqual([seen.HOME, seen.AETHER_LANE_CALL], [env.HOME, `design/${onlyDesignId(repo)}`])
})

test('a non-clean round whose /usage cannot be read afterwards is failed, not quota', (t) => {
  const { repo, env } = designSetup(t)
  const r = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], `FAKE-AGY: write-abs ${env.AETHER_FAKE_AGY_QUOTA_FILE} unreadable\nFAKE-AGY: exit-error`)
  assert.equal(r.status, 4, r.stdout + r.stderr)
  assert.deepEqual([lastJson(r.stdout).failed, lastJson(r.stdout).undone], ['failed', true])
  const entry = lanes.readLog(env.AETHER_DATA_DIR).find((e) => e.kind === 'call')
  assert.deepEqual([entry.status, entry.quotaAfter], ['failed', null])
})

test("once a round's agy exits, the commands it left running in sessions of their own are ended", (t) => {
  const { repo, env } = designSetup(t)
  const pidFile = path.join(tempDir(t), 'detached.pid')
  const r = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], `FAKE-AGY: detach ${pidFile} 120\nFAKE-AGY: answer ${REPLY('approaches')}`)
  const detached = Number(fs.readFileSync(pidFile, 'utf8'))
  t.after(() => fx.killQuietly(detached))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(fx.alive(detached), false)
})

test('design start changes nothing when the role is off, the quota is low, superpowers is missing or the worktree is dirty', (t) => {
  const off = designSetup(t, { mutate: (c) => (c.harnesses.agy.models['claude-opus-5-5'].roles = ['implementer', 'reviewer']) })
  const low = designSetup(t, { quota: { 'Gemini Models': [0.9, 0.9], 'Claude and GPT models': [0.9, 0.02] } })
  const bare = designSetup(t)
  fs.rmSync(path.join(bare.env.CLAUDE_CONFIG_DIR, 'plugins', 'installed_plugins.json'))
  const dirty = designSetup(t)
  fs.writeFileSync(path.join(dirty.repo.dir, 'loose.txt'), 'x\n')
  const cases = [
    [off, 'role'],
    [low, 'quota'],
    [bare, 'superpowers'],
    [dirty, 'dirty'],
  ]
  for (const [setup, reason] of cases) {
    const r = design(setup.repo, setup.env, ['start', '--session', 'lead-1', '--cwd', setup.repo.dir], `FAKE-AGY: answer ${REPLY('approaches')}`)
    assert.deepEqual([r.status, lastJson(r.stdout)], [3, { unavailable: reason }], reason)
    assert.equal(fx.agyTurns(setup.env).length, 0, reason)
    assert.equal(fs.existsSync(path.join(setup.repo.dir, '.aether', 'design')), false, reason)
  }
})

test('design reply changes nothing when the Claude group is at or below the reserve', (t) => {
  const { repo, env } = designSetup(t)
  const id = idOf(design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], `FAKE-AGY: answer ${REPLY('approaches')}`).stdout)
  const head = fx.git(repo.dir, 'rev-parse', 'HEAD')
  fs.writeFileSync(env.AETHER_FAKE_AGY_QUOTA_FILE, JSON.stringify({ 'Gemini Models': [0.9, 0.9], 'Claude and GPT models': [0.9, 0.05] }))
  const r = design(repo, env, ['reply', id], `A.\nFAKE-AGY: write docs/superpowers/specs/z.md z\nFAKE-AGY: answer ${REPLY('design')}`)
  assert.deepEqual([r.status, lastJson(r.stdout)], [3, { unavailable: 'quota' }])
  assert.equal(fx.agyTurns(env).length, 1)
  assert.equal(fx.git(repo.dir, 'rev-parse', 'HEAD'), head)
  assert.equal(fx.git(repo.dir, 'status', '--porcelain', '--untracked-files=all'), '')
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'design', id, 'state.json'), 'utf8'))
  assert.deepEqual([state.status, state.rounds.length], ['open', 1])
})

test('a resume that comes back in a new conversation is undone, and list and end manage the open designs', (t) => {
  const { repo, env } = designSetup(t)
  const id = idOf(design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], `FAKE-AGY: answer ${REPLY('approaches')}`).stdout)
  const before = fx.git(repo.dir, 'rev-parse', 'HEAD')
  const r = design(
    repo,
    env,
    ['reply', id],
    ['A.', 'FAKE-AGY: write docs/superpowers/specs/y.md y', 'FAKE-AGY: commit y', 'FAKE-AGY: new-conversation', `FAKE-AGY: answer ${REPLY('design')}`].join('\n'),
  )
  assert.equal(r.status, 4, r.stdout + r.stderr)
  const out = lastJson(r.stdout)
  assert.deepEqual([out.failed, out.undone, out.design], ['failed', true, id])
  assert.match(out.detail, /conversation/)
  assert.equal(fx.git(repo.dir, 'rev-parse', 'HEAD'), before)
  const listed = lastJson(design(repo, env, ['list']).stdout)
  assert.deepEqual(listed.designs.map((d) => [d.id, d.session, d.cwd, d.status, d.rounds]), [[id, 'lead-1', repo.dir, 'open', 2]])
  assert.deepEqual(lastJson(design(repo, env, ['end', id]).stdout), { ended: id })
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'design', id)), false)
  assert.deepEqual(lastJson(design(repo, env, ['list']).stdout), { designs: [] })
})
