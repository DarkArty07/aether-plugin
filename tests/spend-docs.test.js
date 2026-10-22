'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
const section = (text, heading) => {
  const start = text.indexOf(heading)
  assert.ok(start >= 0, `missing ${heading}`)
  const rest = text.slice(start + heading.length)
  const next = rest.search(/\n#{1,3} /)
  return next === -1 ? rest : rest.slice(0, next)
}

test('the autonomy page keeps the ceiling figure apart from the session spend', () => {
  const cost = section(read('docs', 'guide', 'autonomy.md'), '- **Cost.**')
  assert.match(cost, /`aether-report --spend`/)
  assert.match(cost, /list.price/i)
  assert.match(cost, /not the (figure of the )?ceiling|another figure|apart from the ceiling/i)
})

test('the lanes page documents /spend next to /harnesses', () => {
  const lanes = read('docs', 'guide', 'lanes.md')
  assert.ok(lanes.indexOf('### The /harnesses panel') < lanes.indexOf('### The /spend panel'))
  const spend = section(lanes, '### The /spend panel')
  for (const pattern of [/`\/spend`/, /`aether-report --spend/, /list.price/i, /not a percentage/i, /same id/i, /--fork-session/, /\/clear/, /no price|without a price|unpriced/i, /approximate/, /incomplete/, /No spend recorded yet/]) assert.match(spend, pattern)
})

test('troubleshooting says /spend is not offered outside an Aether session either', () => {
  const entry = section(read('docs', 'guide', 'troubleshooting.md'), '## The /harnesses panel is not offered')
  assert.match(entry, /`\/spend`/)
})

test('maintenance says the 30-day prune keeps the total', () => {
  const text = read('docs', 'guide', 'maintenance.md')
  assert.match(text, /spend\/<session>\.json|spend\/<id>\.json/)
  assert.match(text, /summary/i)
})

test('components names /spend and the summary the prune keeps', () => {
  const text = read('docs', 'reference', 'components.md')
  assert.match(text, /`\/spend`/)
  assert.match(text, /spend summary|summary of the spend|keeps a summary/i)
})
