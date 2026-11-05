'use strict'

// Issue 122: the final review of a relaunch covers the run's units across launches. The
// workflow cannot read the disk, so `aether-plan compile --run` reads the run directory with
// lib/plan-scope.js and hands the workflow the earlier launches' merged units in its arguments.
// These tests pin what it reports: their review fields, areas, owns and deferred minor findings.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')

const scope = require('../plugins/aether/lib/plan-scope.js')

const defs = (units) => Object.fromEntries(units.map((u) => [u.id, u]))
const def = (id, over = {}) => ({
  id,
  title: `Task ${id.slice(5)} title`,
  review: 'high',
  area: 'core',
  owns: [`src/${id}/**`],
  ...over,
})
const resultUnit = (id, over = {}) => ({
  id,
  title: `Task ${id.slice(5)} title`,
  area: 'core',
  status: 'merged',
  tiers: ['haiku high'],
  attempts: 1,
  rounds: [{ findings: [] }],
  reason: null,
  ...over,
})
const minor = (title) => ({ severity: 'minor', title, file: 'src/task-1/a.js', evidence: '' })

function runDir(t, { units = {}, results = {} } = {}) {
  const dir = tempDir(t, 'aether-scope-')
  if (units) fs.writeFileSync(path.join(dir, 'units.json'), JSON.stringify(units, null, 2))
  for (const [name, value] of Object.entries(results)) {
    fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value))
  }
  return dir
}

test('a first launch carries no earlier unit', (t) => {
  const dir = runDir(t, { units: defs([def('task-1', { review: 'xhigh' }), def('task-2')]) })
  assert.deepEqual(scope.earlierMergedUnits(dir, {}), [])
})

test('a missing run directory carries no earlier unit', (t) => {
  assert.deepEqual(scope.earlierMergedUnits(path.join('/nonexistent', 'run'), {}), [])
})

test('an earlier launch merged unit is carried with its review field, area, owns and deferred minors', (t) => {
  const dir = runDir(t, {
    units: defs([def('task-1', { review: 'xhigh', area: 'earlier' }), def('task-2', { area: 'current' })]),
    results: {
      'result.json': {
        runId: 'x',
        units: [resultUnit('task-1', { rounds: [{ findings: [minor('Deferred nit'), { severity: 'important', title: 'Big', file: 'f', evidence: '' }] }] }), resultUnit('task-2', { status: 'blocked', rounds: [] })],
      },
    },
  })
  assert.deepEqual(scope.earlierMergedUnits(dir, { 'task-2': true }), [
    {
      id: 'task-1',
      title: 'Task 1 title',
      area: 'earlier',
      review: 'xhigh',
      owns: ['src/task-1/**'],
      status: 'merged',
      tiers: ['haiku high'],
      reason: null,
      minors: [{ severity: 'minor', title: 'Deferred nit', file: 'src/task-1/a.js' }],
    },
  ])
})

test('a result without units and a half-written result carry nothing, and do not hide the other launches', (t) => {
  const dir = runDir(t, {
    units: defs([def('task-1', { review: 'xhigh', area: 'earlier' }), def('task-2')]),
    results: {
      'result-1.json': { runId: 'x' },
      'result-2.json': '{"launch":1,',
      'result.json': { runId: 'x', units: [resultUnit('task-1')] },
    },
  })
  assert.deepEqual(
    scope.earlierMergedUnits(dir, { 'task-2': true }).map((u) => u.id),
    ['task-1'],
  )
})

test('a unit this launch runs again is left out: its own rounds govern it', (t) => {
  const dir = runDir(t, {
    units: defs([def('task-1'), def('task-2')]),
    results: { 'result.json': { units: [resultUnit('task-1'), resultUnit('task-2')] } },
  })
  assert.deepEqual(scope.earlierMergedUnits(dir, { 'task-1': true, 'task-2': true }), [])
})

test('a merge is never undone by a later launch: ever merged counts, even when blocked again', (t) => {
  const dir = runDir(t, {
    units: defs([def('task-1', { review: 'max', area: 'earlier' }), def('task-2')]),
    results: {
      'result-1.json': { units: [resultUnit('task-1', { rounds: [{ findings: [minor('First nit')] }] })] },
      'result.json': { units: [resultUnit('task-1', { status: 'blocked', rounds: [], reason: 'needs a decision' })] },
    },
  })
  const carried = scope.earlierMergedUnits(dir, { 'task-2': true })
  assert.deepEqual(
    carried.map((u) => u.id),
    ['task-1'],
  )
  assert.equal(carried[0].review, 'max')
  assert.deepEqual(carried[0].minors, [{ severity: 'minor', title: 'First nit', file: 'src/task-1/a.js' }])
})

test('a unit no launch merged is not carried', (t) => {
  const dir = runDir(t, {
    units: defs([def('task-1'), def('task-2')]),
    results: { 'result.json': { units: [resultUnit('task-1', { status: 'blocked', rounds: [], reason: 'no' })] } },
  })
  assert.deepEqual(scope.earlierMergedUnits(dir, { 'task-2': true }), [])
})

test('carried units sort by task number', (t) => {
  const dir = runDir(t, {
    units: defs([def('task-10'), def('task-2'), def('task-9')]),
    results: { 'result.json': { units: [resultUnit('task-10'), resultUnit('task-2'), resultUnit('task-9')] } },
  })
  assert.deepEqual(
    scope.earlierMergedUnits(dir, {}).map((u) => u.id),
    ['task-2', 'task-9', 'task-10'],
  )
})
