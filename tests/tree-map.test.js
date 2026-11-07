'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const map = require('../plugins/aether/lib/tree-map.js')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')

function sources(dir = PLUGIN, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'types'].includes(entry.name)) continue
      sources(full, out)
    } else if (/\.(js|mjs|md)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

test('every entry of the map says what it is, who writes it, how long it lasts and that git never has it (R14)', () => {
  assert.ok(map.LAYOUT.length >= 16)
  for (const entry of map.LAYOUT) {
    for (const key of ['path', 'what', 'writer', 'lasts']) assert.ok(typeof entry[key] === 'string' && entry[key].length > 3, `${entry.path} ${key}`)
    assert.equal(entry.git, 'never', entry.path)
  }
  assert.deepEqual(map.LAYOUT.filter((e) => e.legacy).map((e) => e.path).sort(), ['delegates/', 'exams/', 'lanes/', 'seats/'])
  assert.deepEqual([...map.LAYOUT_NAMES].sort(), ['README.md', 'autonomy', 'broken-runs', 'delegates', 'exam', 'exams', 'lanes', 'pending.jsonl', 'runs', 'seats', 'tmp', 'work', 'worktrees'])
})

test('every path that the code of Aether writes under .aether/ is in the map (C6)', () => {
  const names = new Map()
  for (const file of sources()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\.aether\/([A-Za-z][A-Za-z0-9_.-]*)/g)) names.set(m[1], file)
    for (const m of text.matchAll(/(?:aetherDir\([^)]*\)|['"]\.aether['"])\s*,\s*['"]([A-Za-z][A-Za-z0-9_.-]*)['"]/g)) names.set(m[1], file)
  }
  const unknown = [...names].filter(([name]) => !map.LAYOUT_NAMES.has(name)).map(([name, file]) => `${name} (${path.relative(PLUGIN, file)})`)
  assert.deepEqual(unknown, [])
})

test('the README lists every entry of the map and says it is never in git (R14, H2 scenario 12)', () => {
  const text = map.readmeText()
  for (const entry of map.LAYOUT) assert.ok(text.includes(`\`${entry.path}\``), entry.path)
  assert.match(text, /never/i)
  assert.match(text, /\.claude/)
})

test('ensureReadme creates .aether/ and the file once, and leaves a current file alone (R14)', (t) => {
  const root = tempDir(t)
  assert.equal(map.ensureReadme(root), true)
  const file = path.join(root, '.aether', 'README.md')
  assert.equal(fs.readFileSync(file, 'utf8'), map.readmeText())
  const stat = fs.statSync(file)
  assert.equal(map.ensureReadme(root), false)
  assert.equal(fs.statSync(file).mtimeMs, stat.mtimeMs)
  fs.writeFileSync(file, 'old text')
  assert.equal(map.ensureReadme(root), true)
  assert.equal(fs.readFileSync(file, 'utf8'), map.readmeText())
  assert.equal(map.ensureReadme(path.join(root, 'missing', 'deep')), true)
})
