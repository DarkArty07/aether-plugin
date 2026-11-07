'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir } = require('./helpers.js')
const { decide, decideBash, irreversibleClasses } = require('../plugins/aether/lib/guard.js')
const { tidyTargets, emptiesTidyFile } = require('../plugins/aether/lib/tidy-guard.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const human = (text, time) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  useDataDir(t)
  const configDir = tempDir(t, 'aether-claude-')
  const previous = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR }
  process.env.HOME = home
  process.env.CLAUDE_CONFIG_DIR = configDir
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  const enforce = { ...process.env, AETHER_IRREVERSIBLE: 'enforce' }
  const bash = (command) => decideBash({ cwd: repo.dir, session_id: 's1', tool_name: 'Bash', tool_input: { command } }, enforce)
  const write = (file, content) => decide({ cwd: repo.dir, session_id: 's1', tool_name: 'Write', tool_input: { file_path: file, content } }, enforce)
  const allow = (quote) => {
    const dir = path.join(configDir, 'projects', '-p')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 's1.jsonl'), human(quote, '2026-11-07T10:00:00.000Z') + '\n')
    return autonomy.grant(repo.dir, { class: 'delete', quote, session: 's1', scope: 'session' }, { configDir })
  }
  return { repo, home, enforce, bash, write, allow, opts: { cwd: repo.dir, home } }
}

test('rm, mv, git rm, git mv, rmdir and unlink on the files aether:tidy orders are named; other paths and other commands are not (C13, R38)', (t) => {
  const w = world(t)
  const named = (command) => tidyTargets(command, w.opts)
  for (const command of [
    'rm .aether/aether.db', 'rm -rf .aether/objective-contracts', 'rm .aether/project.toml .aether/CONTEXT.md', 'rm .aether/run.draft.md',
    'git rm CLAUDE.md', 'git mv AGENTS.md docs/AGENTS.md', 'mv CLAUDE.md CLAUDE.old', 'rm sub/AGENTS.md',
    'rm -r .agents/skills/x', 'rmdir .claude/skills/x', 'unlink .claude/skills/x', 'rm -r ~/.agents/skills/x', `mv ${path.join(w.home, '.claude', 'skills', 'x')} /tmp/x`, 'rm -rf $HOME/.claude/skills/old', 'sudo rm CLAUDE.md', 'bash -c "rm AGENTS.md"',
    'sudo -n rm CLAUDE.md', 'time -p rm CLAUDE.md', 'command -p rm CLAUDE.md', 'env -i rm CLAUDE.md', 'nohup rm CLAUDE.md', 'timeout -s KILL 5 rm CLAUDE.md',
    '/bin/rm CLAUDE.md', 'eval "rm CLAUDE.md"', 'rm -- CLAUDE.md', 'mv -t dir CLAUDE.md', '$(rm CLAUDE.md)', 'git -C .claude/skills rm x',
  ]) assert.ok(named(command).length > 0, command)
  for (const command of ['rm -r notes', 'rm -f notes', 'rm src/a.js', 'rm -rf .aether/runs', 'cp CLAUDE.md x', 'ls CLAUDE.md', 'cat AGENTS.md', 'git status', 'git rm src/a.js', 'echo CLAUDE.md', 'sudo -n ls CLAUDE.md', 'env -i cat AGENTS.md']) assert.deepEqual(named(command), [], command)
})

test('the guard classes them as delete: held without the owner permission, recorded and allowed with it, and the rule of today does not change (C13, R38, H4 scenario 29)', (t) => {
  const w = world(t)
  assert.deepEqual(irreversibleClasses('rm .aether/aether.db', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('git mv AGENTS.md docs/AGENTS.md', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('rm -r notes', w.repo.dir, w.enforce), [])
  assert.deepEqual(irreversibleClasses('rm -f notes', w.repo.dir, w.enforce), [])
  assert.deepEqual(irreversibleClasses('rm -rf ~', w.repo.dir, w.enforce), ['delete'], 'a risky target is still delete')
  const held = w.bash('mv CLAUDE.md CLAUDE.old')
  assert.ok(held && held.reason.includes('delete'))
  assert.deepEqual(readPending(w.repo.dir).map((e) => e.class), ['delete'])
  assert.equal(w.allow('apruebo borrar y mover estos archivos de orden que me muestres en la lista').ok, true)
  assert.equal(w.bash('mv CLAUDE.md CLAUDE.old'), null)
})

test('without the permission nothing is moved or deleted by the guard: only a report is possible (C13, R38)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'CLAUDE.md'), 'rules\n')
  for (const command of ['rm CLAUDE.md', 'git rm CLAUDE.md', 'mv CLAUDE.md x', 'unlink CLAUDE.md']) assert.ok(w.bash(command), command)
  assert.equal(readPending(w.repo.dir).length, 4)
  assert.equal(w.bash('aether-doctor tidy'), null)
  assert.equal(w.bash('cat CLAUDE.md'), null)
})

test('a Write that leaves CLAUDE.md or AGENTS.md empty is a delete; one with content is not (C13, R38)', (t) => {
  const w = world(t)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/CLAUDE.md', content: '  \n' } }), true)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/AGENTS.md', content: '' } }), true)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/AGENTS.md', content: '@x' } }), false)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/README.md', content: '' } }), false)
  assert.equal(emptiesTidyFile({ tool_name: 'Edit', tool_input: { file_path: '/p/CLAUDE.md', content: '' } }), false)
  const held = w.write(path.join(w.repo.dir, 'CLAUDE.md'), '')
  assert.ok(held && held.reason.includes('delete'))
  assert.equal(w.write(path.join(w.repo.dir, 'CLAUDE.md'), '@AGENTS.md\n'), null)
  assert.equal(w.write(path.join(w.repo.dir, 'notes.md'), ''), null)
})

test('a wrapper with options, a shell script and a substitution do not hide a tidy delete from the classes (C13, R38)', (t) => {
  const w = world(t)
  assert.deepEqual(irreversibleClasses('sudo -n rm CLAUDE.md', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('env -i bash -c "rm AGENTS.md"', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('echo $(rm CLAUDE.md)', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('sudo -n ls CLAUDE.md', w.repo.dir, w.enforce), [])
})

test('the delete class keeps its place among the classes of a line, in order of appearance (C13, R38)', (t) => {
  const w = world(t)
  assert.deepEqual(irreversibleClasses('git push origin main; rm AGENTS.md', w.repo.dir, w.enforce), ['push', 'delete'])
  assert.deepEqual(irreversibleClasses('rm CLAUDE.md; git push origin main', w.repo.dir, w.enforce), ['delete', 'push'])
  assert.deepEqual(irreversibleClasses('rm -rf ~; rm CLAUDE.md', w.repo.dir, w.enforce), ['delete'])
})

test('tidy targets follow cd, git -C and heredoc scripts as the guard reads them (C13, R38)', (t) => {
  const w = world(t)
  assert.ok(tidyTargets('cd .aether && rm aether.db', w.opts).length > 0)
  assert.ok(tidyTargets('cd ~/.claude/skills && rm -r x', w.opts).length > 0)
  assert.deepEqual(tidyTargets('cd notes && rm -r x', w.opts), [])
  assert.ok(tidyTargets("bash <<'EOF'\nrm CLAUDE.md\nEOF", w.opts).length > 0)
  assert.deepEqual(tidyTargets("cat <<'EOF'\nrm CLAUDE.md\nEOF", w.opts), [])
})

test('an empty CLAUDE.md or AGENTS.md write that the delete class lets through still meets the later checks (C13, R38)', (t) => {
  const w = world(t)
  const file = path.join(w.repo.dir, 'CLAUDE.md')
  const examiner = { cwd: w.repo.dir, session_id: 's1', tool_name: 'Write', agent_type: 'aether:examiner', tool_input: { file_path: file, content: '' } }
  const logMode = { ...process.env, AETHER_IRREVERSIBLE: 'log' }
  const confined = decide(examiner, logMode)
  assert.ok(confined && confined.reason.includes('Examiner'), 'the Examiner confinement still refuses it')
  assert.ok(w.write(file, '').reason.includes('delete'))
  assert.equal(decide({ cwd: w.repo.dir, session_id: 's1', tool_name: 'Write', tool_input: { file_path: file, content: '' } }, logMode), null)
  assert.equal(readPending(w.repo.dir).length, 3)
})
