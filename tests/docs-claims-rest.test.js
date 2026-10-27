'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')
const FILES = ['docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/contributing.md', 'docs/roadmap.md', 'docs/claude-code-research.md', 'docs/aether-retrospective.md', 'docs/models/README.md', 'site/app.js', 'site/index.html']

test('none of these documents names a retired option, journal or legacy variable', () => {
  assert.deepEqual(hits(['options', 'journal'], { docs: true }).filter((hit) => FILES.includes(hit.file)), [])
})

test("the getting-started page counts the manifest's options", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
  const count = Object.keys(manifest.userConfig).length
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/getting-started.md'), 'utf8'), new RegExp(`${words[count]} options`))
})

test('the docs index still links every page that remains', () => {
  const index = fs.readFileSync(path.join(ROOT, 'docs/index.md'), 'utf8')
  for (const file of ['getting-started.md', 'purpose.md', 'methodology.md', 'contributing.md', 'changelog.md', 'roadmap.md', 'decisions.md']) assert.ok(index.includes(`(${file})`) || index.includes(`](${file}`), file)
})
