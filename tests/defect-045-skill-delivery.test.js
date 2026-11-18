'use strict'
// R18, R19, R21: automatic project-skill delivery to delegates and plan units (spec 045, task 10).
// A matching project skill reaches the delegate by itself and is recorded; a manual
// AETHER-SKILLS name keeps priority and stays strict; a skill installed without a commit
// in a linked worktree reaches a compile in another worktree.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { tempDir, makeRepo, writePlan, NO_LANES_CONFIG } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const delegate = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const reg = require('../plugins/aether/lib/skill-registry.js')
const { compile } = require('../plugins/aether/lib/plan-compile.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }
const PXL_DESC = 'Use when working with pxl: writing or editing a .px.js animation or a GIF.'

function writeSkill(root, name, description, body = 3) {
  const dir = path.join(root, '.agents', 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n',
  )
  return dir
}

function world(t, { settings = NATIVE, pick = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const cwd = tempDir(t, 'aether-cwd-')
  const home = tempDir(t, 'aether-home-')
  let n = 0
  const deps = { dataDir, cwd, home, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async () => ({ pick, quota: [] }) }
  return { dataDir, cwd, deps }
}

const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const entries = (dataDir, id) => log.readEntries(dataDir, { task: id })
const uses = (dataDir) => {
  const file = path.join(dataDir, 'skills', 'uses.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function runCompile(repoDir, markdown, { dataDir, home, session = 'sess-1' }) {
  let out = ''
  compile(writePlan(repoDir, markdown), ['--no-lanes'], {
    cwd: repoDir,
    stdout: { write(chunk) { out += chunk } },
    env: { HOME: home, AETHER_DATA_DIR: dataDir, CLAUDE_CODE_SESSION_ID: session, AETHER_LANES_CONFIG: NO_LANES_CONFIG },
  })
  return JSON.parse(out.trim().split('\n').pop())
}

test('R18: begin hands a matching project skill to the delegate by itself and records it', async (t) => {
  const w = world(t)
  writeSkill(w.cwd, 'pxl', PXL_DESC)
  const launched = await delegate.begin(call('AETHER-TASK: p1\nAETHER-OWNS: assets/brand/gifs/walk.px.js\nAdjust the walk cycle.'), w.deps)
  assert.ok(launched.args.prompt.includes('## Skills for this task') && launched.args.prompt.includes('### pxl'))
  assert.deepEqual(entries(w.dataDir, 'p1').find((e) => e.kind === 'launch').skills, ['pxl'])
  assert.deepEqual(uses(w.dataDir).map((u) => [u.kind, u.task, u.skills]), [['delegate', 'p1', ['pxl']]])
  assert.deepEqual(reg.readNotices(w.dataDir), [], 'no delegate-skill notice for a skill that was delivered')
})

test('R18: an unrelated task gets no skill and its call is unchanged', async (t) => {
  const w = world(t)
  writeSkill(w.cwd, 'pxl', PXL_DESC)
  const launched = await delegate.begin(call('Update the parser of JSON in src/json.js.'), w.deps)
  assert.equal(launched.args.prompt, undefined)
  assert.equal(entries(w.dataDir, 'gen-0').find((e) => e.kind === 'launch').skills, undefined)
  assert.deepEqual(uses(w.dataDir), [])
})

test('R18: more than 3 matches attach 3, in the deterministic order of the matcher', async (t) => {
  const w = world(t)
  for (const name of ['skill-a', 'skill-b', 'skill-c', 'skill-d']) writeSkill(w.cwd, name, 'Handle the economy and combat load')
  const launched = await delegate.begin(call('AETHER-TASK: p3\nReview the economy and combat report.'), w.deps)
  assert.deepEqual(entries(w.dataDir, 'p3').find((e) => e.kind === 'launch').skills, ['skill-a', 'skill-b', 'skill-c'])
  assert.ok(launched.args.prompt.includes('### skill-a') && launched.args.prompt.includes('### skill-c'))
  assert.equal(launched.args.prompt.includes('### skill-d'), false)
})

test('R18: the content reaches an external harness prompt too', async (t) => {
  const w = world(t, { settings: EXTERNAL, pick: GROK })
  writeSkill(w.cwd, 'pxl', PXL_DESC)
  const launched = await delegate.begin(call('AETHER-TASK: p4\nAETHER-OWNS: assets/brand/gifs/walk.px.js\nAdjust the walk cycle.'), w.deps)
  assert.ok(launched.external)
  const briefs = path.join(w.dataDir, 'delegates', 'briefs')
  const text = fs.readFileSync(path.join(briefs, fs.readdirSync(briefs)[0]), 'utf8')
  assert.ok(text.includes('## Skills for this task') && text.includes('### pxl'))
})

test('R21: an automatic skill with a corrupt SKILL.md or more than 500 lines is skipped and the launch goes on', async (t) => {
  const w = world(t)
  writeSkill(w.cwd, 'pxl', PXL_DESC)
  const corruptDir = path.join(w.cwd, '.agents', 'skills', 'walk-cycle')
  fs.mkdirSync(corruptDir, { recursive: true })
  fs.writeFileSync(path.join(corruptDir, 'SKILL.md'), '---\nname: walk-cycle\n---\nbody line\n')
  writeSkill(w.cwd, 'big-px', 'Files like .px.js are covered here.', 600)
  const launched = await delegate.begin(call('AETHER-TASK: p5\nAETHER-OWNS: assets/brand/gifs/walk.px.js\nAdjust the walk cycle.'), w.deps)
  assert.equal(launched.kind, 'first')
  assert.deepEqual(entries(w.dataDir, 'p5').find((e) => e.kind === 'launch').skills, ['pxl'])
  assert.ok(launched.args.prompt.includes('### pxl'))
  assert.equal(launched.args.prompt.includes('### walk-cycle'), false)
  assert.equal(launched.args.prompt.includes('### big-px'), false)
  assert.deepEqual(uses(w.dataDir).map((u) => [u.kind, u.task, u.skills]), [['delegate', 'p5', ['pxl']]])
})

test('R21: the 1,500-line total drops the skill that would exceed it, never aborts', async (t) => {
  const w = world(t)
  for (const name of ['big-a', 'big-b', 'big-c']) writeSkill(w.cwd, name, 'Handle the economy and combat load', 495)
  const launched = await delegate.begin(call('AETHER-TASK: p6\nReview the economy and combat report.'), w.deps)
  assert.equal(launched.kind, 'first')
  assert.deepEqual(entries(w.dataDir, 'p6').find((e) => e.kind === 'launch').skills, ['big-a', 'big-b'])
  assert.ok(launched.args.prompt.includes('### big-a') && launched.args.prompt.includes('### big-b'))
  assert.equal(launched.args.prompt.includes('### big-c'), false)
})

test('R21: a manual AETHER-SKILLS name keeps priority and automatic matches fill the free places', async (t) => {
  const w = world(t)
  writeSkill(w.cwd, 'erebus-ui', 'Use for the work.')
  writeSkill(w.cwd, 'pxl', PXL_DESC)
  const launched = await delegate.begin(call('AETHER-TASK: p7\nAETHER-SKILLS: erebus-ui\nAETHER-OWNS: assets/brand/gifs/walk.px.js\nAdjust the walk cycle.'), w.deps)
  assert.deepEqual(entries(w.dataDir, 'p7').find((e) => e.kind === 'launch').skills, ['erebus-ui', 'pxl'])
  assert.ok(launched.args.prompt.indexOf('### erebus-ui') < launched.args.prompt.indexOf('### pxl'))
})

test('R21: a manual skill that does not exist or is invalid is still rejected as today', async (t) => {
  const w = world(t)
  writeSkill(w.cwd, 'erebus-ui', 'Use for the work.')
  const badDir = path.join(w.cwd, '.agents', 'skills', 'bad-one')
  fs.mkdirSync(badDir, { recursive: true })
  fs.writeFileSync(path.join(badDir, 'SKILL.md'), '---\nname: other-name\n---\nbody\n')
  for (const name of ['a', 'b', 'c', 'd']) writeSkill(w.cwd, name, 'Use for the work.')
  const cases = [
    ['g1', 'ghost', 'skill "ghost" does not exist'],
    ['g2', 'bad-one', 'is invalid'],
    ['g3', 'a, b, c, d', 'too many skills: 4 (at most 3)'],
  ]
  for (const [id, skills, text] of cases) {
    const refused = await delegate.begin(call(`AETHER-TASK: ${id}\nAETHER-SKILLS: ${skills}\nDo the work.`), w.deps)
    assert.equal(refused.kind, 'refused', id)
    assert.ok(refused.args.prompt.startsWith(`Aether delegate task ${id} was not launched: `) && refused.args.prompt.includes(text) && refused.args.prompt.endsWith('Fix the AETHER-SKILLS line and call again.'), refused.args.prompt)
  }
  assert.deepEqual(uses(w.dataDir), [])
})

test("R19: compile hands the skills to a unit with no Skills: line and records the use", async (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const home = tempDir(t, 'aether-home-')
  writeSkill(repo.dir, 'pxl', PXL_DESC)
  const args = runCompile(repo.dir, plan([task(1, { owns: 'assets/brand/gifs/walk.px.js' }), task(2)]), { dataDir: data, home })
  const brief = fs.readFileSync(args.tasks['task-1'].brief, 'utf8')
  assert.ok(brief.includes('## Skills for this task') && brief.includes('### pxl'), brief.slice(0, 400))
  const plain = fs.readFileSync(args.tasks['task-2'].brief, 'utf8')
  assert.equal(plain.includes('## Skills for this task'), false)
  const lines = uses(data).filter((u) => u.kind === 'run')
  assert.equal(lines.length, 1)
  assert.deepEqual([lines[0].task, lines[0].skills], ['task-1', ['pxl']])
})

test('R19: a skill installed without a commit in linked worktree A reaches a compile in integration worktree B, by match and by a Skills: line', async (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const home = tempDir(t, 'aether-home-')
  const base = tempDir(t, 'aether-wts-')
  const dirA = path.join(base, 'A')
  const dirB = path.join(base, 'B')
  repo.git('worktree', 'add', '-b', 'wt-a', dirA)
  repo.git('worktree', 'add', '-b', 'wt-b', dirB)
  const installed = writeSkill(dirA, 'gdscript-helper', 'Use for .gd files of the game: GDScript helpers')
  reg.recordInstall(data, {
    time: 1, session: 's1', source: 'vercel-labs/agent-skills', scope: 'project',
    repo: repo.dir, name: 'gdscript-helper', path: installed, hash: reg.computedHash(installed),
  })
  const withSkills = (n, names) => task(n, { owns: 'src/other.js' }).replace(/- Depends on: none\n/, `- Depends on: none\n- Skills: ${names}\n`)
  const args = runCompile(dirB, plan([task(1, { owns: 'game/player.gd' }), withSkills(2, 'gdscript-helper')]), { dataDir: data, home })
  for (const id of ['task-1', 'task-2']) {
    const brief = fs.readFileSync(args.tasks[id].brief, 'utf8')
    assert.ok(brief.includes('### gdscript-helper'), `${id} brief carries the skill`)
  }
})

test('R19: an install record whose folder is gone is ignored', async (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const home = tempDir(t, 'aether-home-')
  const elsewhere = tempDir(t, 'aether-elsewhere-')
  const gone = path.join(elsewhere, '.agents', 'skills', 'gone-skill')
  reg.recordInstall(data, {
    time: 1, session: 's1', source: 'vercel-labs/agent-skills', scope: 'project',
    repo: repo.dir, name: 'gone-skill', path: gone, hash: 'abc',
  })
  const sb = require('../plugins/aether/lib/skill-brief.js')
  assert.equal(sb.projectSkillRoots(repo.dir, { dataDir: data }).includes(path.resolve(elsewhere)), false)
  const args = runCompile(repo.dir, plan([task(1)]), { dataDir: data, home })
  const brief = fs.readFileSync(args.tasks['task-1'].brief, 'utf8')
  assert.equal(brief.includes('## Skills for this task'), false)
  assert.deepEqual(uses(data), [])
})
