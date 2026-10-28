'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(PLUGIN, '..', '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const page = read('docs/guide/models-by-role.md')
const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim())
const front = (text, key) => (new RegExp(`^${key}: (.*)$`, 'm').exec(text) || [])[1]

test('the page has its front matter and the index links it', () => {
  assert.match(page, /^---\ntitle: .+\ndescription: .+\norder: \d+\n---\n/)
  assert.match(read('docs/index.md'), /\]\(guide\/models-by-role\.md\)/)
})

test('every relative link of the page resolves', () => {
  for (const m of page.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'guide', m[1])), m[1])
  }
})

test('the ladder table is config/ladder.json', () => {
  const ladder = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'ladder.json'), 'utf8'))
  for (const rung of ladder.rungs) {
    const name = rung.step[0].toUpperCase() + rung.step.slice(1)
    const row = page.split('\n').find((line) => line.startsWith(`| ${name} |`))
    assert.ok(row, `${name} has a row`)
    const [, corrections, first, retry] = cells(row)
    assert.equal(Number(corrections), rung.corrections, name)
    assert.equal(first.replace(/`/g, ''), rung.effort.first, name)
    assert.equal(retry.replace(/`/g, ''), rung.effort.retry, name)
  }
})

test('the page says the swarm starts on the first rung of the ladder', () => {
  assert.ok(page.includes('The swarm starts every unit on the first rung of `config/ladder.json`'))
})

test('the After column names the model and effort of each agent file', () => {
  const roles = { Writer: 'writer', Judge: 'judge', Examiner: 'examiner', Supervisor: 'supervisor', 'Final review': 'reviewer', Ops: 'ops' }
  for (const [label, file] of Object.entries(roles)) {
    const agent = read(`plugins/aether/agents/${file}.md`)
    const pair = `\`${front(agent, 'model')} ${front(agent, 'effort')}\``
    const row = page.split('\n').find((line) => line.startsWith(`| ${label} |`))
    assert.ok(row, `${label} has a row`)
    assert.ok(cells(row)[2].includes(pair), `${label}: After holds ${pair}`)
  }
})

test('the page says where Opus stays, what to measure and when to undo', () => {
  for (const heading of ['## Each role, before and after', '## The ladder', '## Where the spend went', '## Why', '## Where Opus stays', '## How to tell if it worked', '## What did not change']) {
    assert.ok(page.includes(heading), heading)
  }
  for (const word of ['quality.attempts', 'climbed', 'escalated', 'config/ladder.json', 'reviewerReference']) {
    assert.ok(page.includes(word), word)
  }
})
