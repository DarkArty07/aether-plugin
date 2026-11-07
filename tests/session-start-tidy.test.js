'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { PART_LIMIT } = require('../plugins/aether/lib/session-start.js')

const put = (file, text = 'x\n') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const home = tempDir(t, 'aether-home-')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, HOME: home, LANG: 'en_US.UTF-8' }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'CLAUDE_ENV_FILE']) delete env[key]
  const start = (source, agent = 'aether:lead', dir = repo.dir) => {
    const input = { hook_event_name: 'SessionStart', session_id: 's1', source, ...(agent ? { agent_type: agent } : {}) }
    const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: dir, input: JSON.stringify(input), encoding: 'utf8', env })
    return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null }
  }
  return { repo, data, home, configDir, start }
}

test('a project with leftovers of the old CLI and a CLAUDE.md that does not import AGENTS.md gets a short notice that names aether:tidy (C13, H4 scenario 27)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), 'claude only\n')
  put(path.join(w.repo.dir, '.aether', 'aether.db'))
  put(path.join(w.repo.dir, '.aether', 'project.toml'))
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  const context = out.hookSpecificOutput.additionalContext
  assert.ok(context.includes('Tidy: CLAUDE.md does not import AGENTS.md.'))
  assert.ok(context.includes('Tidy: leftovers of the old aether CLI in .aether/: 2.'))
  assert.ok(context.includes('Run aether:tidy to order this'))
  assert.ok(!out.systemMessage.includes('Tidy:'), 'the person sees the continuity notice, not this one')
  assert.equal(w.start('clear').out.hookSpecificOutput.additionalContext.includes('Run aether:tidy'), true)
  assert.equal(w.start('compact').out.hookSpecificOutput.additionalContext.includes('Run aether:tidy'), false)
})

test('a tidy project gets no notice (R36)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), '@AGENTS.md\n')
  assert.ok(!w.start('startup').out.hookSpecificOutput.additionalContext.includes('Tidy:'))
})

test('a skill the Lead created more than 30 days ago that no task received is named, with the proposal to remove it, and is not removed (R33, A9, H3 scenario 25)', (t) => {
  const w = world(t)
  const dir = path.join(w.repo.dir, '.agents', 'skills', 'old-method')
  put(path.join(dir, 'SKILL.md'), '---\nname: old-method\ndescription: d\n---\nrules\n')
  put(path.join(w.data, 'skills', 'created.jsonl'), JSON.stringify({ time: Date.now() - 40 * 86400000, session: 'x', repo: w.repo.dir, name: 'old-method', path: dir, type: 'project' }) + '\n')
  const context = w.start('startup').out.hookSpecificOutput.additionalContext
  assert.ok(context.includes("Skills nobody used in 30 days: old-method. Consider removing them, with the owner's yes (aether:skills)."))
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md')), true)
})

test('a Lead started in a linked worktree reads the disorder of that worktree, not of the main checkout (R36)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), 'claude only\n')
  const linked = path.join(tempDir(t, 'aether-linked-'), 'copy')
  w.repo.git('worktree', 'add', '-q', '-b', 'feature/tidy', linked)
  put(path.join(linked, 'AGENTS.md'), 'map\n')
  put(path.join(linked, 'CLAUDE.md'), '@AGENTS.md\n')
  const { status, stdout, out } = w.start('startup', 'aether:lead', linked)
  assert.equal(status, 0)
  assert.ok(out.hookSpecificOutput.additionalContext.includes('Aether mode is active.'))
  assert.ok(!stdout.includes('Tidy:'), 'the main checkout is untidy, the working copy is not')
})

test('a Lead started in an untidy linked worktree gets its notice even when the main checkout is tidy (R36)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), '@AGENTS.md\n')
  const linked = path.join(tempDir(t, 'aether-linked-'), 'copy')
  w.repo.git('worktree', 'add', '-q', '-b', 'feature/untidy', linked)
  put(path.join(linked, 'AGENTS.md'), 'map\n')
  put(path.join(linked, 'CLAUDE.md'), 'claude only\n')
  const context = w.start('startup', 'aether:lead', linked).out.hookSpecificOutput.additionalContext
  assert.ok(context.includes('Tidy: CLAUDE.md does not import AGENTS.md.'))
})

test('the notices stay within the limit and never push out the continuity notice (R36, R7)', (t) => {
  const w = world(t)
  for (let i = 0; i < 40; i++) put(path.join(w.repo.dir, '.aether', `old-${i}.lock`))
  const { stdout, out } = w.start('startup')
  assert.ok(stdout.length <= PART_LIMIT, `${stdout.length} characters`)
  assert.ok(out.systemMessage.includes('No earlier session in this project.'))
})

test('oversized optional notices are trimmed before the continuity notice (R36, R7)', (t) => {
  const w = world(t)
  const store = require('../plugins/aether/lib/continuity-store.js')
  const dir = store.continuityDir({ cwd: w.repo.dir, env: { CLAUDE_CONFIG_DIR: w.configDir }, home: w.home })
  store.writeNote(dir, {
    session: 'previous-session', branch: 'main', commit: w.repo.git('rev-parse', 'HEAD'),
    updatedAt: Date.now() - 3600000, lastMessage: 'Continue the migration',
    process: { pid: 99999999, start: 1 }, cut: { at: Date.now() - 1000, reason: 'rate_limit' }, closed: null,
  })
  const runFile = path.join(w.repo.dir, '.aether', 'autonomy', 'auto-test', 'run.json')
  const reset = 'Nov 07 2998 12:00:00 GMT'
  const run = {
    id: 'auto-test', session: 'old', started: new Date().toISOString(), ended: null,
    ceilings: { hours: 8, usd: 50 }, spend: [],
    quotaPauses: [{ resetsAt: reset, resumeAt: '2999-01-01T00:00:00Z' }],
  }
  put(runFile, JSON.stringify(run))
  put(path.join(w.repo.dir, '.aether', 'aether.db'))
  const skillPath = path.join(w.repo.dir, '.agents', 'skills', 'idle')
  put(path.join(skillPath, 'SKILL.md'))
  put(path.join(w.data, 'skills', 'created.jsonl'), JSON.stringify({ time: Date.now() - 40 * 86400000, repo: w.repo.dir, name: 'idle', path: skillPath }) + '\n')

  const baseline = w.start('startup')
  assert.equal(baseline.status, 0)
  assert.ok(baseline.out.hookSpecificOutput.additionalContext.includes(`resets ${reset} and the run resumes`), 'the fixture produces the run note')
  assert.ok(baseline.out.hookSpecificOutput.additionalContext.includes('Continue the migration'), 'the fixture produces the continuity notice')
  const sections = baseline.out.hookSpecificOutput.additionalContext.split('\n\n')
  const tidy = sections.find((line) => line.startsWith('Tidy:'))
  const idle = sections.find((line) => line.startsWith('Skills nobody used in 30 days:'))
  assert.ok(tidy, 'the fixture produces a tidy notice')
  assert.ok(idle, 'the fixture produces an idle-skill notice')

  // Each notice occurs once in the JSON context, preceded by two escaped newlines. Pad the valid reset
  // date so the core payload fits by one character, but neither notice can fit alongside it.
  const jsonLength = (text) => JSON.stringify(`\n\n${text}`).length - 2
  const coreLength = baseline.stdout.length - jsonLength(tidy) - jsonLength(idle)
  const padding = PART_LIMIT - coreLength - 1
  assert.ok(padding > 0)
  run.quotaPauses[0].resetsAt = reset.replace(' 12:', `${' '.repeat(padding)} 12:`)
  assert.ok(Number.isFinite(Date.parse(run.quotaPauses[0].resetsAt)))
  const untrimmedLength = baseline.stdout.length + padding
  assert.ok(untrimmedLength > PART_LIMIT, `${untrimmedLength} characters before trimming`)
  assert.ok(untrimmedLength - jsonLength(idle) > PART_LIMIT, 'tidy alone also exceeds the limit')
  put(runFile, JSON.stringify(run))

  const { status, stdout, out } = w.start('startup')
  assert.equal(status, 0)
  const context = out.hookSpecificOutput.additionalContext
  for (const line of [
    'Last session (previous, branch main) stopped at: Continue the migration',
    'Since then: nothing changed in git. The branch moved from main to feature/x.',
    'The session was cut off (rate_limit): claude --resume previous-session',
  ]) {
    assert.ok(context.includes(line), `context keeps: ${line}; got ${JSON.stringify(context.slice(0, 500))}`)
    assert.ok(out.systemMessage.includes(line), `system message keeps: ${line}`)
  }
  assert.ok(context.includes(run.quotaPauses[0].resetsAt), 'the long run note is present')
  assert.ok(!context.includes('Tidy:'))
  assert.ok(!context.includes('Skills nobody used in 30 days:'))
  assert.ok(stdout.length <= PART_LIMIT, `${stdout.length} characters exceeds ${PART_LIMIT}`)
})

test('a session that is not the Lead prints nothing (R40)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, '.aether', 'aether.db'))
  const r = w.start('startup', null)
  assert.deepEqual([r.status, r.stdout], [0, ''])
})
