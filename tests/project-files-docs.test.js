'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { LAYOUT } = require('../plugins/aether/lib/tree-map.js')

const ROOT = path.join(__dirname, '..')
const EN = 'docs/guide/project-files-and-skills.md'
const ES = 'docs/es/guias/archivos-skills-y-continuidad.md'
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('both guides exist with their front matter and are linked from their index and listed by the docs test (R43)', () => {
  for (const rel of [EN, ES]) {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(read(rel))[1]
    assert.match(front, /^title: .+$/m, rel)
    assert.match(front, /^description: .+$/m, rel)
    assert.match(front, /^order: \d+$/m, rel)
  }
  assert.ok(read('docs/index.md').includes('guide/project-files-and-skills.md'))
  assert.ok(read('docs/es/index.md').includes('guias/archivos-skills-y-continuidad.md'))
  const facts = read('tests/docs-facts.test.js')
  assert.ok(facts.includes(`'${EN}'`) && facts.includes(`'${ES}'`))
})

test('the guide states the rule of the files, and a test holds it (R11, C5)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    for (const token of ['`AGENTS.md`', '`CLAUDE.md`', '@AGENTS.md', '`.claude/rules/`', '200']) assert.ok(text.includes(token), `${rel} has ${token}`)
  }
  const en = read(EN).toLowerCase()
  assert.ok(en.includes('the map') && en.includes('only claude'))
})

test('the map of .aether/ in the guide names every entry of the map of the code (R14, C6)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    for (const entry of LAYOUT) assert.ok(text.includes(`\`${entry.path}\``), `${rel} names ${entry.path}`)
  }
})

test('the guide gives the four kinds of skill, where they are downloaded, the trust list, continuity and tidy (R22, R43)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    for (const token of ['`~/.agents/skills/`', '`.agents/skills/`', '`.claude/skills/`', '`skills-lock.json`', '`npx skills add`', '`aether-autonomy trust`', '`skill-install`', '`Skills:`', '`AETHER-SKILLS:`', '`memory/continuity/`', '`claude --resume <id>`', '`/aether:tidy`', '`.aether/README.md`']) {
      assert.ok(text.includes(token), `${rel} has ${token}`)
    }
  }
  assert.ok(read(ES).includes('empieza vacía'))
  assert.ok(read(EN).includes('starts empty'))
})
