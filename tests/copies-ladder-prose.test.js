'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const numbers = (haiku, sonnet, opus) => [Number(haiku), Number(sonnet), Number(opus)]
const SOURCE = () => numbers(...read('plugins/aether/lib/plan.js').match(/const DEFAULT_LADDER = \{ haiku: (\d+), sonnet: (\d+), opus: (\d+) \}/).slice(1))
const phrase = (rel) => () => numbers(...read(rel).match(/- Ladder: haiku (\d+), sonnet (\d+), opus (\d+)/).slice(1))
const check = (source, copy) => assert.deepEqual(copy, source)

const COPIES = [
  { datum: 'the default ladder in the tasks skill', copy: phrase('plugins/aether/skills/tasks/SKILL.md'), why: 'the skill shows the Execution section the Writer produces' },
  { datum: 'the default ladder in the speckit tasks command', copy: phrase('plugins/aether/speckit/commands/speckit.tasks.md'), why: 'the preset shows the same Execution section' },
  { datum: 'the default ladder in the writer agent', copy: phrase('plugins/aether/agents/writer.md'), why: 'the agent is told the Execution section it writes' },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => check(SOURCE(), entry.copy()))
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(SOURCE(), [...entry.copy(), 9])))
  test(`${entry.datum}: it says why it is a copy`, () => assert.ok(entry.why.length > 10))
}
