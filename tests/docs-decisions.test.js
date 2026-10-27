'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const TEXT = fs.readFileSync(path.join(__dirname, '..', 'docs', 'decisions.md'), 'utf8')
const entryOf = (id) => {
  const lines = TEXT.split('\n')
  const own = id.startsWith('D')
    ? lines.findIndex((line) => line.startsWith(`## ${id}.`))
    : lines.findIndex((line) => line.startsWith(`| ${id} |`))
  assert.ok(own >= 0, id)
  if (id.startsWith('A')) return lines[own]
  const end = lines.findIndex((line, i) => i > own && line.startsWith('## '))
  return lines.slice(own, end === -1 ? undefined : end).join('\n')
}
const exists = (ref) => (ref.startsWith('D') ? new RegExp(`^## ${ref}\\.`, 'm').test(TEXT) : new RegExp(`^\\| ${ref} \\|`, 'm').test(TEXT))

for (const id of ['D3', 'D4', 'D9', 'D10', 'A28', 'A40', 'A55', 'A61', 'A62']) {
  test(`${id} says it was superseded or updated, and by what that exists`, () => {
    const entry = entryOf(id)
    const m = entry.match(/\*\*(Superseded|Updated)\*\*[^\n]*?\b([AD]\d{1,3}|spec \d{3})\b/)
    assert.ok(m, `${id} has no Superseded/Updated line that cites its replacement`)
    if (/^[AD]/.test(m[2])) assert.ok(exists(m[2]), `${id} cites ${m[2]}, which does not exist`)
    else assert.ok(fs.existsSync(path.join(__dirname, '..', 'specs')) && fs.readdirSync(path.join(__dirname, '..', 'specs')).some((d) => d.startsWith(m[2].slice(5) + '-')), m[2])
  })
}

test('docs/decisions.md names no retired option, journal or legacy variable', () => {
  const found = hits(['options', 'journal'], { docs: true }).filter((hit) => hit.file === 'docs/decisions.md')
  assert.deepEqual(found, [])
})
