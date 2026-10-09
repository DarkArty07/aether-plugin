'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const { checkSession } = require('../scripts/check-effort.js')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-effort.js')
const USAGE = 'usage: node scripts/check-effort.js <session-dir> [--report <report.json>]'

// Writes one workflow agent the way Claude Code keeps it: a meta file, and a transcript whose
// assistant lines carry the effort each request went out with. Other lines are not requests.
function writeAgent(sessionDir, id, { type, label, efforts }) {
  const dir = path.join(sessionDir, 'subagents', 'workflows', 'wf_1')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType: type, description: label, model: 'haiku' }))
  const lines = [{ type: 'user', agentId: id, effort: 'max', message: { role: 'user', content: 'go' } }]
  for (const effort of efforts) lines.push({ type: 'assistant', agentId: id, effort, perTurnEffort: effort, message: { model: 'claude-haiku-5-5' } })
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
}

// A session in which every aether agent ran at the effort its call asked for.
function session(t) {
  const dir = tempDir(t, 'aether-session-')
  writeAgent(dir, 'a1', { type: 'aether:implementer', label: 'task-1: implement on haiku medium (attempt 1)', efforts: ['medium', 'medium'] })
  writeAgent(dir, 'a2', { type: 'aether:supervisor', label: 'task-1: supervise attempt 1 on sonnet xhigh', efforts: ['xhigh'] })
  writeAgent(dir, 'a3', { type: 'aether:ops', label: 'task-1: merge', efforts: ['low'] })
  writeAgent(dir, 'a4', { type: 'aether:reviewer', label: 'final review', efforts: ['high'] })
  writeAgent(dir, 'a5', { type: 'general-purpose', label: 'not an aether agent', efforts: ['max'] })
  return dir
}

test('checkSession passes when every aether agent ran at the effort its call asked for', (t) => {
  assert.deepEqual(checkSession(session(t)), {
    ok: true,
    agents: [
      { agent: 'a4', type: 'aether:reviewer', label: 'final review', expected: 'high', seen: ['high'] },
      { agent: 'a1', type: 'aether:implementer', label: 'task-1: implement on haiku medium (attempt 1)', expected: 'medium', seen: ['medium'] },
      { agent: 'a3', type: 'aether:ops', label: 'task-1: merge', expected: 'low', seen: ['low'] },
      { agent: 'a2', type: 'aether:supervisor', label: 'task-1: supervise attempt 1 on sonnet xhigh', expected: 'xhigh', seen: ['xhigh'] },
    ],
    problems: [],
  })
})

test('checkSession reports another effort, a label that names none, a transcript with none, and an empty session', (t) => {
  const dir = session(t)
  writeAgent(dir, 'a6', { type: 'aether:implementer', label: 'task-2: implement on sonnet high (attempt 1)', efforts: ['high', 'xhigh'] })
  writeAgent(dir, 'a7', { type: 'aether:supervisor', label: 'task-2: supervise attempt 1', efforts: ['high'] })
  writeAgent(dir, 'a8', { type: 'aether:implementer', label: 'task-3: implement on haiku xhigh (attempt 1)', efforts: [] })
  const result = checkSession(dir)
  assert.equal(result.ok, false)
  assert.deepEqual(result.problems, [
    'task-2: implement on sonnet high (attempt 1): expected high, saw high, xhigh',
    'task-2: supervise attempt 1: the label names no effort',
    'task-3: implement on haiku xhigh (attempt 1): expected xhigh, saw no effort',
  ])
  assert.deepEqual(
    result.agents.find((a) => a.agent === 'a7'),
    { agent: 'a7', type: 'aether:supervisor', label: 'task-2: supervise attempt 1', expected: null, seen: ['high'] },
  )
  const empty = tempDir(t, 'aether-session-')
  assert.deepEqual(checkSession(empty), { ok: false, agents: [], problems: [`no aether workflow agents under ${empty}`] })
})

test('checkSession with a report checks that the report shows the same effort for each agent', (t) => {
  const report = {
    cost: {
      run: {
        agents: [
          { agent: null, effort: 'xhigh' },
          { agent: 'a1', effort: 'medium' },
          { agent: 'a2', effort: 'high' },
          { agent: 'a3', effort: 'low' },
        ],
      },
    },
  }
  const result = checkSession(session(t), { report })
  assert.equal(result.ok, false)
  assert.deepEqual(result.problems, ['final review: not in the report', 'task-1: supervise attempt 1 on sonnet xhigh: the report shows high'])
  assert.equal(checkSession(session(t), { report: { cost: null } }).problems.length, 4)
})

test('the command prints one line of JSON, and exits 0 when all match, 1 on a problem and 2 on a usage error', (t) => {
  const dir = session(t)
  let r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(JSON.parse(r.stdout).ok, true)
  const reportFile = path.join(tempDir(t, 'aether-report-'), 'report.json')
  fs.writeFileSync(reportFile, JSON.stringify({ cost: { run: { agents: [] } } }))
  r = spawnSync(process.execPath, [SCRIPT, dir, '--report', reportFile], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).problems.length, 4)
  for (const args of [[], [path.join(dir, 'missing')], [dir, '--report']]) {
    r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2, args.join(' '))
    assert.deepEqual(JSON.parse(r.stdout), { ok: false, agents: [], problems: [USAGE] })
  }
})
