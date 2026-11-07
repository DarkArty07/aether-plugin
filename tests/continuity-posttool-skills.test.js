'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')
const reg = require('../plugins/aether/lib/skill-registry.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  return { repo, home, data, ctx: { env: { LANG: 'en_US.UTF-8' }, home, now: 5000, dataDir: data } }
}

test('the dispatcher runs the three skill handlers: a lock that disagrees, a skill with problems and a finding that came back (R26, R31, R32)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: Use for pdf.\n---\nBody\n')
  put(path.join(w.repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills', computedHash: 'f'.repeat(64) } } }))
  const install = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command: 'npx skills add anthropics/skills@pdf' } }, w.ctx)
  assert.ok(install.additionalContext.includes('differs from skills-lock.json'))
  assert.equal(reg.readInstalls(w.data).length, 1)

  const long = path.join(w.repo.dir, '.agents', 'skills', 'long-one')
  put(path.join(long, 'SKILL.md'), ['---', 'name: long-one', 'description: d', '---', ...Array.from({ length: 600 }, (_, i) => `rule ${i}`)].join('\n'))
  const review = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: path.join(long, 'SKILL.md') } }, w.ctx)
  assert.ok(review.additionalContext.startsWith('Skill "long-one": SKILL.md has 6'))

  for (const [task, line] of [['t1', 3], ['t2', 7]]) {
    log.appendEntry(w.data, { kind: 'verdict', time: 1, session: 's1', task, attempt: 1, step: 'haiku', verdict: 'fix', input: { kind: 'fix', findings: [{ file: 'src/a.js', line, what: 'the empty case is missing' }], reason: null, fromScratch: false } })
  }
  const repeat = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command: 'aether-delegate verdict --task t2 --verdict fix --finding "src/a.js:7: the empty case is missing"' } }, w.ctx)
  assert.ok(repeat.additionalContext.includes('already came up in task t1'))
})

test('a write in the memory, a CLAUDE.md and a skill each get their own notice, and an ordinary edit gets none (R9, R12, R32)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), 'claude only\n')
  const claude = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'CLAUDE.md') } }, w.ctx)
  assert.ok(claude.additionalContext.includes('CLAUDE.md does not import AGENTS.md'))
  assert.equal(posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'src', 'a.js') } }, w.ctx), null)
})

test('through the bin the notices of the skills reach the Lead as additionalContext, and a plain session gets nothing (R40)', (t) => {
  const w = world(t)
  markSession(w.data, 's1', 1000, { repo: w.repo.dir, claude: null })
  const long = path.join(w.repo.dir, '.agents', 'skills', 'long-one')
  put(path.join(long, 'SKILL.md'), ['---', 'name: long-one', 'description: d', '---', ...Array.from({ length: 600 }, (_, i) => `rule ${i}`)].join('\n'))
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const ask = (session) => spawnSync(process.execPath, [bin, 'posttool'], { input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: path.join(long, 'SKILL.md') } }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.home, HOME: w.home } })
  const lead = JSON.parse(ask('s1').stdout)
  assert.equal(lead.hookSpecificOutput.hookEventName, 'PostToolUse')
  assert.ok(lead.hookSpecificOutput.additionalContext.includes('long-one'))
  const plain = ask('plain')
  assert.deepEqual([plain.status, plain.stdout], [0, ''])
  assert.equal(fs.existsSync(path.join(w.data, 'skills', 'created.jsonl')), true)
  assert.equal(fs.readdirSync(path.join(w.data, 'skills')).length, 1, 'the plain session wrote nothing')
})
