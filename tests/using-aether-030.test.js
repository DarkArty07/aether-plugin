'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const { bootstrapParts, PART_LIMIT } = require('../plugins/aether/lib/session-start.js')

const text = fs.readFileSync(path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md'), 'utf8')

test('the rules tell the Lead how to handle skills, continuity and the order of a project (R30, R34, C11)', () => {
  for (const token of ['aether:skills', 'aether:tidy', 'aether:art-direction', 'skill-install', '.agents/skills/', '~/.agents/skills/', 'AETHER-SKILLS:', 'Skills:', 'claude --resume', 'AGENTS.md', '@AGENTS.md', 'art-direction.md', '.aether/README.md', '.aether/tmp/', '.aether/exam/']) {
    assert.ok(text.includes(token), `the rules name ${token}`)
  }
  assert.ok(!text.includes('.aether-tmp') && !text.includes('.aether-exam'), 'the old folders are not named as the places to use')
  assert.ok(!/onboard/i.test(text))
})

test('the Lead checks its tools first and waits for the owner when one is missing (issue 187)', () => {
  const tools = text.split(/\n(?=## )/).find((section) => section.startsWith('## Tools'))
  assert.ok(tools, 'the bootstrap has a ## Tools section')
  for (const token of ['`Workflow`', '`Agent`', 'first reply', 'before any plan', "wait for the owner's answer", '/config', 'new session']) {
    assert.ok(tools.includes(token), `the Tools section names ${token}`)
  }
  assert.ok(!text.includes('When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session.'), 'the old footnote sentence is gone')
  const swarm = fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')
  assert.ok(!swarm.includes('offer to build it meanwhile task by task'), 'the swarm skill no longer plans around a missing Workflow tool')
  assert.ok(/Tools/.test(swarm) && /using-aether/.test(swarm), 'the swarm skill points at the Tools rule')
})

test('the bootstrap goes in as many parts as hooks.json has commands for, each whole output within the limit, also from a long install path (R44)', () => {
  const root = path.join('/', 'x'.repeat(400), 'plugins', 'aether')
  const read = fs.readFileSync
  fs.readFileSync = (target, ...rest) => {
    if (typeof target === 'string' && target.endsWith(path.join('skills', 'using-aether', 'SKILL.md'))) {
      return read.call(fs, path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md'), ...rest)
    }
    return read.call(fs, target, ...rest)
  }
  let parts
  try {
    parts = bootstrapParts(root)
  } finally {
    fs.readFileSync = read
  }
  const { PART_COMMANDS } = require('./helpers.js')
  assert.ok(parts.length >= 1 && parts.length <= PART_COMMANDS.length, `${parts.length} parts for ${PART_COMMANDS.length} commands`)
  for (const part of parts) assert.ok(part.output.length <= PART_LIMIT, `part of ${part.output.length} characters`)
})

test('the bootstrap keeps the canonical rule and corrections of #204 (R6, R9, R10)', () => {
  const rule = 'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  assert.ok(text.includes(rule))
  assert.doesNotMatch(text, /about five tool calls|many reads of your own|one effort up|a fork always runs on your model|`aether-exam store`/)
  for (const token of ['aether:models', 'aether:designing', ["at the step's correction effort in `config", 'ladder.json`'].join('/'), 'ignores `model` on a fork and would run on your model with your whole conversation', 'every `Agent` call whose `subagent_type` is not `aether:*`', 'claude-code-guide', '--ignore <glob>', 'aether-autonomy trust --author <author> --quote "<their words>"', 'aether-exam store specs/NNN-<topic>', 'relaunching an approved or exhausted task id launches a Haiku agent', 'passing more than 3 skills, an unknown skill name, or a skill over the line limit in `AETHER-SKILLS:` rejects the whole launch']) assert.ok(text.includes(token), token)
  const total = bootstrapParts(PLUGIN).reduce((sum, part) => sum + part.context.length, 0)
  assert.ok(total <= 25000, `the injected bootstrap weighs ${total} characters`)
})
