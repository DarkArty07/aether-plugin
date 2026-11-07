'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

test('the components page names the new skills, the new bin and the measured dormant footprint of 0.35.0 (R42, R43)', () => {
  const components = read('docs/reference/components.md')
  for (const token of ['`aether:skills`', '`aether:art-direction`', '`aether:tidy`', '`aether-continuity`', '`skill-install`']) assert.ok(components.includes(token), token)
  assert.match(components, /Version 0\.35\.0 adds seven hook entries that run `aether-continuity`[^\n]*median of \d+(\.\d+)? ms/)
  assert.match(components, /tests\/dormant-030\.test\.js/)
})

test('the guides say where things live now and what changed (R43)', () => {
  assert.ok(read('docs/guide/maintenance.md').includes('`.aether/README.md`') && read('docs/guide/maintenance.md').includes('`memory/continuity/`'))
  const troubleshooting = read('docs/guide/troubleshooting.md')
  assert.ok(troubleshooting.includes('`skill-install`') && troubleshooting.includes('where it is for now') && troubleshooting.includes('`claude --resume <id>`'))
  assert.ok(read('docs/guide/observe.md').includes('continuity note'))
  assert.ok(read('docs/guide/delegates.md').includes('`AETHER-SKILLS:`'))
  const autonomy = read('docs/guide/autonomy.md')
  assert.ok(autonomy.includes('`skill-install`') && autonomy.includes('`aether-autonomy trust`'))
  assert.ok(read('docs/guide/design-seats.md').includes('.aether/exam/'))
  for (const rel of ['docs/what-aether-adds.md', 'docs/es/que-agrega-aether.md']) assert.ok(read(rel).includes('/aether:tidy') && !/onboard/i.test(read(rel)), rel)
})

test('no page gives the old folders as the place to use (R15, R43)', () => {
  for (const rel of ['docs/guide/design-seats.md', 'docs/methodology.md', 'docs/guide/maintenance.md', 'docs/what-aether-adds.md', 'docs/es/que-agrega-aether.md']) {
    const text = read(rel).split('\n').filter((line) => /\.aether-(tmp|exam)\//.test(line) && !/(old|older|before|antes|viej)/i.test(line))
    assert.deepEqual(text, [], rel)
  }
})
