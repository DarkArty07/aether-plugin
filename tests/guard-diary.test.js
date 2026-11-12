'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { decideBash } = require('../plugins/aether/lib/guard.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const GUARD_BIN = path.join(PLUGIN, 'bin', 'aether-guard')

function guardBash(t, command, { cwd, who = { agent_type: 'aether:lead' } } = {}) {
  const data = tempDir(t, 'aether-data-')
  markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data }
  const stdin = JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command }, ...who })
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}

test('a run diary and brief can be written through Bash (#239)', (t) => {
  const repo = makeRepo(t)
  const id = 'auto-1'
  const diary = path.join(repo.dir, `.aether/autonomy/${id}/diary.md`)
  const brief = path.join(repo.dir, `.aether/autonomy/${id}/brief.md`)
  const run = path.join(repo.dir, `.aether/autonomy/${id}/run.json`)
  const grants = path.join(repo.dir, '.aether/autonomy/grants.json')

  // Allowed commands for the Lead:
  for (const command of [
    `cp /tmp/x ${diary}`,
    `cat > ${brief}`,
    `echo note >> .aether/autonomy/${id}/diary.md`,
    `cat <<'EOF' > ${brief}\n# brief\nEOF`,
    `echo "entry" > ${diary}`,
    `cp /tmp/x .aether/autonomy/${id}/diary.md`,
  ]) {
    const r = guardBash(t, command, { cwd: repo.dir })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', `allowed command should output nothing: ${command}`)

    const direct = decideBash({ session_id: 's1', hook_event_name: 'PreToolUse', cwd: repo.dir, tool_name: 'Bash', tool_input: { command }, agent_type: 'aether:lead' })
    assert.equal(direct, null, `decideBash should return null: ${command}`)
  }

  // Refused commands:
  for (const command of [
    `cp x ${run}`,
    `cp /tmp/x .aether/autonomy/${id}/run.json`,
    `cat > ${run}`,
    `cat > ${grants}`,
    'echo "{}" > .aether/autonomy/grants.json',
    `cp x ${grants}`,
    `cp ${diary} ${run}`,
    `cp ${run} ${diary}`,
    `cp /tmp/x ${diary} && cp /tmp/y ${run}`,
    `cp /tmp/x ${diary} && cp /tmp/y ${grants}`,
    `echo "x" > ${diary} && cat ${grants} > /tmp/out`,
  ]) {
    const r = guardBash(t, command, { cwd: repo.dir })
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny', command)
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /written only by aether-autonomy/, command)

    const direct = decideBash({ session_id: 's1', hook_event_name: 'PreToolUse', cwd: repo.dir, tool_name: 'Bash', tool_input: { command }, agent_type: 'aether:lead' })
    assert.ok(direct, `decideBash should deny: ${command}`)
    assert.match(direct.reason, /written only by aether-autonomy/, command)
  }
})

test('a run diary and brief stay refused through Bash for the Examiner (#239)', (t) => {
  const repo = makeRepo(t)
  const id = 'auto-1'
  const diary = path.join(repo.dir, `.aether/autonomy/${id}/diary.md`)
  const brief = path.join(repo.dir, `.aether/autonomy/${id}/brief.md`)

  // The Examiner stays refused, as Write refuses it outside .aether/exam/:
  for (const command of [
    `cp /tmp/x ${diary}`,
    `cat > ${brief}`,
    `echo note >> .aether/autonomy/${id}/diary.md`,
    `echo "entry" > ${brief}`,
  ]) {
    const r = guardBash(t, command, { cwd: repo.dir, who: { agent_type: 'aether:examiner' } })
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny', command)

    const direct = decideBash({ session_id: 's1', hook_event_name: 'PreToolUse', cwd: repo.dir, tool_name: 'Bash', tool_input: { command }, agent_type: 'aether:examiner' })
    assert.ok(direct, `decideBash should deny: ${command}`)
  }

  // The Lead and another non-Examiner agent pass, as Write allows them:
  for (const who of [{ agent_type: 'aether:lead' }, { agent_type: 'aether:writer' }]) {
    for (const command of [
      `echo note >> .aether/autonomy/${id}/diary.md`,
      `cat > ${brief}`,
    ]) {
      const r = guardBash(t, command, { cwd: repo.dir, who })
      assert.equal(r.status, 0, r.stderr)
      assert.equal(r.stdout, '', `allowed command should output nothing: ${JSON.stringify(who)} ${command}`)

      const direct = decideBash({ session_id: 's1', hook_event_name: 'PreToolUse', cwd: repo.dir, tool_name: 'Bash', tool_input: { command }, ...who })
      assert.equal(direct, null, `decideBash should return null: ${JSON.stringify(who)} ${command}`)
    }
  }
})
