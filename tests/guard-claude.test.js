'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const { decide, decideBash } = require('../plugins/aether/lib/guard.js')

function world(t) {
  const repo = makeRepo(t)
  const claude = path.join(repo.dir, '.claude')
  for (const dir of ['skills', 'rules', 'hooks']) fs.mkdirSync(path.join(claude, dir), { recursive: true })
  fs.symlinkSync('..', path.join(claude, 'skills', 'up'))
  return { repo, claude }
}
const WHO = [
  {},
  { agent_type: 'aether:lead' },
  { agent_type: 'aether:writer', agent_id: 'w1' },
  { agent_type: 'aether:implementer', agent_id: 'i1' },
  { agent_type: 'general-purpose', agent_id: 'g1' },
]
const file = (w, target, who = {}, tool = 'Write') => ({ hook_event_name: 'PreToolUse', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: target }, ...who })
const bash = (w, command) => decideBash({ hook_event_name: 'PreToolUse', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command }, session_id: 's1' }, {})
const REASON = /^In Aether mode no agent writes Claude Code's settings or hooks/

test('no agent writes the settings or the hooks of Claude Code with the file tools (C7, R21)', (t) => {
  const w = world(t)
  const targets = [
    path.join(w.claude, 'settings.json'),
    path.join(w.claude, 'settings.local.json'),
    path.join(w.claude, 'hooks', 'pre.sh'),
    `${w.claude}/skills/../settings.json`,
    path.join(w.claude, 'skills', 'up', 'settings.json'),
    '.claude/settings.json',
  ]
  for (const target of targets) {
    for (const who of WHO) for (const tool of ['Write', 'Edit', 'MultiEdit']) {
      const decision = decide(file(w, target, who, tool))
      assert.ok(decision && REASON.test(decision.reason), `${tool} ${target} ${JSON.stringify(who)}`)
    }
  }
  const notebook = decide({ cwd: w.repo.dir, tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(w.claude, 'hooks', 'n.ipynb') } })
  assert.ok(notebook && REASON.test(notebook.reason))
})

test('skills/, rules/ and their neighbours pass the guard, which only closes the settings and the hooks (R21)', (t) => {
  const w = world(t)
  for (const target of [path.join(w.claude, 'skills', 'x', 'SKILL.md'), path.join(w.claude, 'rules', 'y.md'), path.join(w.claude, 'agents', 'a.md'), path.join(w.claude, 'settings.json.bak'), path.join(w.repo.dir, 'src', 'a.js')]) {
    for (const who of WHO) assert.equal(decide(file(w, target, who)), null, `${target} ${JSON.stringify(who)}`)
  }
})

test('Bash commands that name the settings or the hooks and write are refused; reading and the skills folders are not (R21, A14)', (t) => {
  const w = world(t)
  for (const command of [
    "echo '{}' > .claude/settings.json",
    'echo x >> ./.claude/settings.local.json',
    "sed -i 's/a/b/' .claude/settings.json",
    'rm -f .claude/hooks/pre.sh',
    'cp /tmp/h .claude/hooks/h.sh',
    'tee .claude/settings.json < /tmp/x',
    'mv a $PWD/.claude/settings.json',
    `cat /tmp/a > ${path.join(w.claude, 'settings.json')}`,
    'cat .claude/settings.json > .claude/settings.local.json',
    "python3 -c \"open('.claude/settings.json','w').write('{}')\"",
  ]) {
    const decision = bash(w, command)
    assert.ok(decision && REASON.test(decision.reason), command)
  }
  for (const command of ['cat .claude/settings.json', 'ls .claude/hooks', 'grep -r x .claude/hooks', 'git status', 'ls .claude/skills', 'echo hi > .claude/skills/x/SKILL.md', 'cp a .claude/rules/b.md']) {
    assert.equal(bash(w, command), null, command)
  }
})

test('the Examiner writes under .aether/exam/ and under the old .aether-exam/, and nowhere else (R15)', (t) => {
  const w = world(t)
  const examiner = { agent_type: 'aether:examiner', agent_id: 'e1' }
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether', 'exam', 'c1.test.js'), examiner)), null)
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether', 'exam', 'exam.json'), examiner)), null)
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether-exam', 'c1.test.js'), examiner)), null)
  const refused = decide(file(w, path.join(w.repo.dir, 'src', 'a.js'), examiner))
  assert.ok(refused.reason.includes('.aether/exam/'))
  assert.ok(decide(file(w, path.join(w.repo.dir, '.aether', 'tmp', 'x'), examiner)))
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether', 'exam', 'c1.test.js'), { agent_type: 'aether:implementer', agent_id: 'i1' })), null, 'only the Examiner is limited to the exam folder')
})

test('a repository that git cannot read still refuses the settings and the hooks, and passes other writes (R21)', (t) => {
  const dir = tempDir(t, 'aether-broken-repo-')
  fs.mkdirSync(path.join(dir, '.git'))
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  const broken = { repo: { dir } }
  const agents = [
    { agent_type: 'aether:lead' },
    { agent_type: 'aether:writer', agent_id: 'w1' },
    { agent_type: 'aether:implementer', agent_id: 'i1' },
  ]
  for (const target of [path.join(dir, '.claude', 'settings.json'), path.join(dir, '.claude', 'hooks', 'x.sh')]) {
    for (const who of agents) {
      const decision = decide(file(broken, target, who))
      assert.ok(decision && REASON.test(decision.reason), `${target} ${JSON.stringify(who)}`)
    }
  }
  for (const who of agents) assert.equal(decide(file(broken, path.join(dir, 'src', 'a.js'), who)), null, JSON.stringify(who))
})
