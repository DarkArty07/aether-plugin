'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fixedLists } = require('./harness-literals.js')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const SKILL = read('.claude/skills/new-harness/SKILL.md')

function listedBlock() {
  const match = SKILL.match(/<!-- lists:start -->\n([\s\S]*?)\n<!-- lists:end -->/)
  assert.ok(match, 'the skill has its lists block')
  return match[1].split('\n').filter((line) => line.trim() !== '').map((line) => {
    const [file, name] = line.split(' — ')[0].trim().split(/\s+/)
    return { file, name }
  })
}

test('the description loads the skill when a new harness is asked for, and the steps come in the order of the method (R23)', () => {
  const description = SKILL.match(/^description: (.*)$/m)[1]
  assert.ok(/new harness/i.test(description) && /added to Aether/i.test(description))
  const order = ['List everything the CLI gives', 'Read Artificial Analysis once', 'Decide what stays out', 'Map the tiers', 'Get a cost per task', 'free, live reading', 'personal setup', 'The Lead makes the real calls', 'Touch every list', 'Release']
  const positions = order.map((phrase) => SKILL.indexOf(phrase))
  assert.ok(positions.every((position) => position > -1), `a step is missing: ${order.filter((_, i) => positions[i] === -1)}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the steps are in order')
})

test('the skill names the mistakes of Muse it avoids', () => {
  assert.ok(SKILL.includes('issue #108'))
  for (const mistake of ['2 of the 4 models', 'No pair existed below', 'balance came from a call made hours earlier', 'no cost per task', 'one by one']) assert.ok(SKILL.includes(mistake) || SKILL.toLowerCase().includes(mistake.toLowerCase()), mistake)
})

test('every list the skill tells to touch exists in the tree, and every fixed list of the code is named in the skill (R23)', () => {
  const named = listedBlock()
  for (const { file, name } of named) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} does not exist`)
    assert.ok(new RegExp(`(const|let|var)\\s+${name}\\s*=`).test(read(file)), `${file} has no ${name}`)
  }
  const found = fixedLists(ROOT).map(({ file, name }) => `${file} ${name}`)
  const have = named.map(({ file, name }) => `${file} ${name}`)
  assert.deepEqual(found.filter((entry) => !have.includes(entry)), [], 'a fixed list of the code the skill does not name')
  assert.deepEqual(have.filter((entry) => !found.includes(entry)), [], 'a list of the skill the code does not have')
})

test('the five lists of the delegates and the router are among the ones the skill names, ALLOWED_HARNESSES included (R23)', () => {
  const have = listedBlock().map(({ name }) => name)
  for (const name of ['HARNESSES', 'DELEGATE_HARNESSES', 'EXTERNAL', 'RENEWABLE', 'ALLOWED_HARNESSES']) assert.ok(have.includes(name), name)
})

test('the skill new-harness holds the rule of the top tier and the trap of the scales in their own sections (R24)', () => {
  const text = read('.claude/skills/new-harness/SKILL.md')
  assert.ok(text.includes('The top tier waits for its next generation') && text.includes('The scales move'), 'the two sections')
  for (const phrase of ['Fable 5.1', 'GPT-6 Astra', 'GPT-6.1 Astra', '2026-10-26', '2026-10-29', 'a new row']) assert.ok(text.includes(phrase), phrase)
  assert.ok(/waits for|next generation/i.test(text))
})
