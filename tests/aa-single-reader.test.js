'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SKILL = path.join(ROOT, '.claude', 'skills', 'artificial-analysis')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
const KEY_HEADER = ['x', 'api', 'key'].join('-')

function sources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.worktrees', 'worktrees', 'tests'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sources(full, out)
    else if (/\.(js|mjs|ts|tsx)$/.test(entry.name) && !/\.test\.(js|ts|tsx)$/.test(entry.name)) out.push(path.relative(ROOT, full).split(path.sep).join('/'))
  }
  return out
}

test('scripts/aa-pages.js is the only file that asks a page of the network', () => {
  const asking = [...sources(path.join(ROOT, 'scripts')), ...sources(path.join(ROOT, 'plugins')), ...sources(path.join(ROOT, '.claude'))]
    .filter((file) => /\bfetch\s*\(|globalThis\.fetch|https?\.get\(/.test(read(file)))
  assert.deepEqual(asking, ['scripts/aa-pages.js'])
})

test('the skill folder keeps its two documents and the two files of what was read on 2026-10-26, and no reader', () => {
  assert.deepEqual(fs.readdirSync(SKILL).sort(), ['SKILL.md', 'aa-extract-2026-10-26.json', 'aa-pages-extract-2026-10-26.txt', 'agent-prompt.md'])
})

test('the skill and its brief send the reader to scripts/aa-pages.js and name no API, key or retired reader', () => {
  for (const file of ['SKILL.md', 'agent-prompt.md']) {
    const text = read('.claude', 'skills', 'artificial-analysis', file)
    assert.match(text, /scripts\/aa-pages\.js read/, file)
    for (const gone of [/aa-api/, /aa-extract\.js/, /aa-pages\.js api/, new RegExp(KEY_HEADER, 'i'), /ARTIFICIAL_ANALYSIS/, /\/api\/v2/]) assert.doesNotMatch(text, gone, `${file} ${gone}`)
  }
  assert.match(read('.claude', 'skills', 'artificial-analysis', 'SKILL.md'), /only source|única fuente/i)
  assert.match(read('.claude', 'skills', 'new-harness', 'SKILL.md'), /scripts\/aa-pages\.js read/)
  assert.doesNotMatch(read('.claude', 'skills', 'new-harness', 'SKILL.md'), /aa-api\.js|The API does not give it/)
})
