'use strict'

// Task 3 (spec 036, #255 R7): the brief the system builds for an editing
// delegate on another harness never asks for `checkout --detach` (only the
// Claude prompt and its rescue carry `startSection`), and when the Lead's own
// prompt asks for it, `begin` says so in a `note` without changing anything.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }

const NOTE = 'note: the prompt you wrote asks the delegate to run "checkout --detach"; the system does not ask for it and the brief is left as you wrote it. A commit on a detached HEAD is followed by the branch (spec 036 R4), but ask for the branch instead.'

function world(t, { settings = NATIVE, pick = null, cwd = null, quota = [] } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const asked = []
  let n = 0
  const deps = { dataDir, cwd: cwd ?? dataDir, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async (reference) => (asked.push(reference), { pick, quota }) }
  return { dataDir, deps, asked }
}
const call = (prompt, extra = {}) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt, ...extra } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`
const briefPathOf = (dataDir, id, attempt = 1) => path.join(dataDir, 'delegates', 'briefs', `${log.fileKey('s1', id)}-${attempt}.md`)

test('the brief of an editing external pair asks for no checkout --detach and names no worktree start (R7, R8)', async (t) => {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { settings: EXTERNAL, pick: GROK, cwd: repo.dir })
  const plan = await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)
  assert.ok(plan.external, 'the attempt runs on the external pair')
  const brief = fs.readFileSync(briefPathOf(dataDir, 'e1'), 'utf8')
  assert.equal(brief.includes('checkout --detach'), false, 'the system does not ask the other harness for checkout --detach')
  assert.equal(brief.includes('Where your worktree starts'), false, 'startSection stays on the Claude prompt and its rescue')
  assert.equal('note' in plan, false, 'a clean prompt carries no note')
})

test('the Claude prompt of an editing task keeps Where your worktree starts and the base commit (R7, R8)', async (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  const { deps } = world(t, { cwd: repo.dir })
  const plan = await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)
  assert.equal(plan.external, null, 'no pair: the delegate runs on Claude')
  assert.ok(plan.args.prompt.includes('Where your worktree starts'))
  assert.ok(plan.args.prompt.includes(base), 'the prompt names the recorded base')
  assert.equal('note' in plan, false, 'a clean prompt carries no note')
})

test('a Lead prompt that asks for checkout --detach gets a note and the brief is left as written (R7)', async (t) => {
  const repo = makeRepo(t)
  const sha = repo.git('rev-parse', 'HEAD')
  const leadLine = `Before anything else, run git checkout --detach ${sha} and work from there.`
  const { deps, dataDir } = world(t, { settings: EXTERNAL, pick: GROK, cwd: repo.dir })
  const plan = await task.begin(call(BRIEF('e3', `AETHER-OWNS: src/**\n${leadLine}\n`)), deps)
  assert.ok(plan.external, 'the attempt runs on the external pair')
  assert.equal(plan.note, NOTE)
  const brief = fs.readFileSync(briefPathOf(dataDir, 'e3'), 'utf8')
  assert.ok(brief.includes(leadLine), 'the brief keeps the Lead line unchanged')
})

test('a Claude delegate with that prompt gets no note (R7)', async (t) => {
  const repo = makeRepo(t)
  const sha = repo.git('rev-parse', 'HEAD')
  const { deps } = world(t, { cwd: repo.dir })
  const plan = await task.begin(call(BRIEF('e4', `AETHER-OWNS: src/**\nRun git checkout --detach ${sha} first.\n`)), deps)
  assert.equal(plan.external, null, 'no pair: the delegate runs on Claude')
  assert.equal('note' in plan, false)
  assert.ok(plan.args.prompt.includes('checkout --detach'), 'the Claude prompt still carries its own start section')
})

test('no skill or agent doc asks for checkout --detach (R7)', () => {
  const roots = ['plugins/aether/skills', 'plugins/aether/agents'].map((rel) => path.join(__dirname, '..', rel))
  const hits = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.md') && fs.readFileSync(full, 'utf8').includes('checkout --detach')) hits.push(full)
    }
  }
  for (const root of roots) walk(root)
  assert.deepEqual(hits, [])
})
