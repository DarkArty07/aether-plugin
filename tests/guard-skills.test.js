'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir, PLUGIN } = require('./helpers.js')
const { decide, decideBash, irreversibleClasses } = require('../plugins/aether/lib/guard.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const ROOT = path.join(__dirname, '..')
const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const human = (text, time) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = useDataDir(t)
  const configDir = tempDir(t, 'aether-claude-')
  const previous = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR }
  process.env.HOME = home
  process.env.CLAUDE_CONFIG_DIR = configDir
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  put(path.join(repo.dir, '.agents', 'skills', 'mine', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills' } } }))
  fs.mkdirSync(path.join(repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'pdf'), path.join(repo.dir, '.claude', 'skills', 'pdf'))
  put(path.join(home, '.agents', 'skills', 'owner-one', 'SKILL.md'))
  const enforce = { ...process.env, AETHER_IRREVERSIBLE: 'enforce' }
  const file = (target, who = { agent_type: 'aether:lead' }, tool = 'Write') => ({ hook_event_name: 'PreToolUse', cwd: repo.dir, session_id: 's1', tool_name: tool, tool_input: { file_path: target }, ...who })
  const bash = (command, env = enforce) => decideBash({ hook_event_name: 'PreToolUse', cwd: repo.dir, session_id: 's1', tool_name: 'Bash', tool_input: { command } }, env)
  const trust = (...authors) => put(path.join(data, 'skills', 'trusted.json'), JSON.stringify({ authors }))
  const allow = (quote) => {
    put(path.join(configDir, 'projects', '-p', 's1.jsonl'), human(quote, '2026-11-07T10:00:00.000Z') + '\n')
    return autonomy.grant(repo.dir, { class: 'skill-install', quote, session: 's1', scope: 'session' }, { configDir })
  }
  return { repo, home, data, configDir, enforce, file, bash, trust, allow }
}

test('an Aether skill and a downloaded skill are not edited, also through the link of .claude/skills/, and the message says how to copy it (C8, H3 scenario 18)', (t) => {
  const w = world(t)
  for (const who of [{ agent_type: 'aether:lead' }, { agent_type: 'aether:implementer', agent_id: 'i1' }, {}]) {
    for (const target of [path.join(w.repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'), path.join(w.repo.dir, '.claude', 'skills', 'pdf', 'SKILL.md')]) {
      const d = decide(w.file(target, who), w.enforce)
      assert.ok(d && d.reason.startsWith('This skill was downloaded from the internet, and downloaded skills are not edited') && d.reason.includes('.agents/skills/'), target)
    }
  }
  const plugin = decide(w.file(path.join(PLUGIN, 'skills', 'plan', 'SKILL.md')), w.enforce)
  assert.ok(plugin.reason.startsWith("This is a skill of Aether, and Aether's skills are not edited"))
})

test('a project skill is edited without asking, and an Aether skill inside the repository of the session too, to develop Aether (C11, D11)', (t) => {
  const w = world(t)
  assert.equal(decide(w.file(path.join(w.repo.dir, '.agents', 'skills', 'mine', 'SKILL.md')), w.enforce), null)
  assert.equal(decide(w.file(path.join(w.repo.dir, '.agents', 'skills', 'brand-new', 'SKILL.md')), w.enforce), null)
  assert.equal(readPending(w.repo.dir).length, 0)
  const inRepo = { ...w.file(path.join(PLUGIN, 'skills', 'plan', 'SKILL.md')), cwd: ROOT }
  assert.equal(decide(inRepo, w.enforce), null)
})

test('a permanent skill waits for the owner: held under enforce and recorded, and allowed with the grant of the session (R30, H3 scenario 24)', (t) => {
  const w = world(t)
  const target = path.join(w.home, '.agents', 'skills', 'owner-one', 'SKILL.md')
  const held = decide(w.file(target), w.enforce)
  assert.ok(held && held.reason.includes('skill-install'))
  assert.deepEqual(readPending(w.repo.dir).map((e) => e.class), ['skill-install'])
  assert.equal(decide(w.file(path.join(w.home, '.claude', 'skills', 'new', 'SKILL.md')), w.enforce).reason.includes('skill-install'), true)
  assert.equal(decide(w.file(target), { ...w.enforce, AETHER_IRREVERSIBLE: 'log' }), null, 'logged only without enforce')
  assert.equal(w.allow('apruebo instalar esta skill permanente para todos mis proyectos').ok, true)
  assert.equal(decide(w.file(target), w.enforce), null)
})

test('npx skills add with each launcher and source: trusted authors pass for the project; everything else is held (C9, R25, H3 scenarios 19 to 21)', (t) => {
  const w = world(t)
  const cwd = w.repo.dir
  const classes = (command) => irreversibleClasses(command, cwd, w.enforce)
  assert.deepEqual(classes('npx skills add anthropics/skills@pdf'), ['skill-install'], 'the list starts empty')
  w.trust('anthropics')
  for (const launcher of ['npx', 'bunx', 'pnpm dlx', '']) assert.deepEqual(classes(`${launcher} skills add anthropics/skills@pdf`.trim()), [], launcher)
  assert.deepEqual(classes('npx skills add someone/skills'), ['skill-install'])
  assert.deepEqual(classes('npx skills add -g anthropics/skills@pdf'), ['skill-install'])
  assert.deepEqual(classes('npx skills add ./local/skills'), ['skill-install'])
  assert.deepEqual(classes('npx skills add https://example.com/skills.git'), ['skill-install'])
  assert.deepEqual(classes('npx skills find pdf'), [])
  assert.equal(w.bash('npx skills add anthropics/skills@pdf'), null)
  assert.equal(readPending(cwd).length, 0)
  const held = w.bash('npx skills add someone/skills')
  assert.ok(held && held.reason.includes('skill-install'))
  assert.deepEqual(readPending(cwd).map((e) => e.class), ['skill-install'])
})

test('with the permission of the session an untrusted source passes, recorded as the owner said (R25)', (t) => {
  const w = world(t)
  assert.ok(w.bash('npx skills add someone/skills'))
  assert.equal(w.allow('apruebo instalar skills de someone para esta sesion').ok, true)
  assert.equal(w.bash('npx skills add someone/skills'), null)
  assert.equal(w.bash('npx skills add -g anthropics/skills@pdf'), null)
})

test('a command that writes into the personal skill folders is held; one that only reads is not (R30)', (t) => {
  const w = world(t)
  for (const command of ['cp -r /tmp/s ~/.agents/skills/new', `mv a ${path.join(w.home, '.claude', 'skills', 'x')}`, 'echo x > $HOME/.agents/skills/a/SKILL.md', 'ln -s a ${HOME}/.claude/skills/b', 'rm -rf ~/.agents/skills/old']) {
    assert.deepEqual(irreversibleClasses(command, w.repo.dir, w.enforce).includes('skill-install'), true, command)
  }
  for (const command of ['ls ~/.agents/skills', 'cat ~/.claude/skills/x/SKILL.md', 'cp a .agents/skills/b']) assert.equal(irreversibleClasses(command, w.repo.dir, w.enforce).includes('skill-install'), false, command)
})

test('trusted.json is written only by aether-autonomy trust: edits are refused, the command is not (R47)', (t) => {
  const w = world(t)
  const list = path.join(w.data, 'skills', 'trusted.json')
  for (const who of [{ agent_type: 'aether:lead' }, { agent_type: 'aether:implementer', agent_id: 'i1' }, {}]) {
    const d = decide(w.file(list, who), w.enforce)
    assert.ok(d && d.reason.includes('aether-autonomy trust'), JSON.stringify(who))
  }
  for (const command of [`echo '{"authors":["x"]}' > ${list}`, `sed -i s/a/b/ ${list}`, `cp /tmp/t ${list}`]) assert.ok(w.bash(command)?.reason.includes('aether-autonomy trust'), command)
  assert.equal(w.bash('aether-autonomy trust --author anthropics --quote "confio en anthropics" --session s1'), null)
  assert.equal(w.bash(`cat ${list}`), null)
})
