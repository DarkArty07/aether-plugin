'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (name) => fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8')
const USING = read('using-aether')
const RUNS = read('autonomous-runs')
const SWARM = read('swarm')

const RULE = "Before deleting worktrees and temporary files, and before any push, the closing report carries this session's list-price spend from aether-report --spend. This holds for every Aether session, including one that is not an autonomous run and not a swarm."
const LINE = 'Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>) y no es la cifra del tope.'
const NONE = 'Sesión <id>: todavía no hay gasto registrado.'
const INCOMPLETE = 'El total está incompleto.'
const CAP = '- US$ <gasto> de US$ <tope>. La cifra cubre el swarm, las lanes y los asientos externos; no cubre los turnos del Lead, ni los de los asientos nativos, ni los de las tareas delegadas.'

test('using-aether, which every Lead session reads, holds the closing rule word for word, before the irreversible actions', () => {
  assert.ok(USING.includes(RULE))
  assert.ok(USING.indexOf(RULE) < USING.indexOf("## The owner's list"))
  for (const text of [NONE, INCOMPLETE, 'El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>)']) assert.ok(USING.includes(text), text)
  assert.ok(USING.indexOf('Sin precio:') < USING.indexOf(INCOMPLETE), 'Sin precio comes before El total está incompleto.')
})

test('the autonomous-runs report keeps the ceiling line and adds the session line under it', () => {
  assert.ok(RUNS.includes(CAP), 'the ceiling line is as before')
  assert.ok(RUNS.includes(`- ${LINE}`))
  assert.ok(RUNS.indexOf(CAP) < RUNS.indexOf(LINE))
  for (const text of ['using-aether', 'y no es la cifra del tope', 'aether-report --spend --session']) assert.ok(RUNS.includes(text), text)
  const section = RUNS.slice(RUNS.indexOf('## Tiempo y costo'))
  assert.ok(section.includes(LINE))
})

test('the swarm skill gives the figure first, in that report, and then finalize and any push', () => {
  const finish = SWARM.slice(SWARM.indexOf('## 6. Finish'))
  assert.ok(finish.includes(LINE))
  assert.ok(finish.includes('using-aether'))
  assert.ok(finish.includes('aether-report --spend --session'))
  assert.ok(finish.indexOf('aether-report --spend') < finish.indexOf('aether-report finalize'))
})
