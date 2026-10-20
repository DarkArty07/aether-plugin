'use strict'

// Spec 002, R17: the lane table is checked against the models index (rules 1 to 3 of the index). Every model of the
// table that takes a swarm role is a current model its harness offers, with a profile and efforts the table can ask
// for; every model that only the design seats name is in use or in notOffered, with a profile.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const INDEX_FILE = path.join(PLUGIN, 'config', 'models', 'models.json')
const SWARM_ROLES = ['implementer', 'supervisor', 'reviewer']
const takesSwarmRole = (entry) => entry.roles.some((role) => SWARM_ROLES.includes(role))

// The problems of a lane table against an index, one line each; none when they agree. The efforts the table asks
// of a model are those of its rows in the pairs table (`pairs`: { harness, model, effort } rows).
function problems(config, index, pairs) {
  const effortsAsked = (harness, model) => new Set(pairs.filter((pair) => pair.harness === harness && pair.model === model).map((pair) => pair.effort))
  const list = (key) => (Array.isArray(index[key]) ? index[key] : [])
  const inUse = (harness, model) => list('models').find((e) => e.harness === harness && e.model === model)
  const noFigures = (harness, model) => list('withoutFigures').find((e) => e.harness === harness && e.model === model)
  const notOffered = (harness, model) => list('notOffered').find((e) => e.harness === harness && e.model === model)
  const superseded = (harness, model) => list('superseded').some((e) => e.harness === harness && e.id === model)
  const hasProfile = (e) => typeof e?.profile?.purpose === 'string' && e.profile.purpose !== ''
  const out = []
  for (const [harness, settings] of Object.entries(config.harnesses)) {
    for (const [id, entry] of Object.entries(settings.models)) {
      if (!takesSwarmRole(entry)) continue
      const where = `${harness}/${id}`
      const found = inUse(harness, id)
      if (!found) {
        // The owner may decide that a model with no figure at an effort its harness takes enters the table anyway: the entry
        // then carries his words in `ownerDecision`, the index lists it among the models with no figures, and everything
        // else is still asked of it: a profile and the efforts the table asks for.
        const open = noFigures(harness, id)
        if (open && typeof entry.ownerDecision === 'string' && entry.ownerDecision.trim() !== '') {
          if (!hasProfile(open)) out.push(`${where}: has no profile`)
          for (const level of effortsAsked(harness, id)) {
            if (!(open.efforts ?? []).includes(level)) out.push(`${where}: the table asks for the effort ${level}, which ${harness} does not take for it (${(open.efforts ?? []).join(', ')})`)
          }
          continue
        }
        out.push(`${where}: is not a current model that ${harness} offers (it is not in models)`)
        continue
      }
      if (superseded(harness, id)) out.push(`${where}: is superseded by a newer generation`)
      if (!hasProfile(found)) out.push(`${where}: has no profile`)
      const efforts = Array.isArray(found.efforts) ? found.efforts : []
      for (const level of effortsAsked(harness, id)) {
        if (!efforts.includes(level)) out.push(`${where}: the table asks for the effort ${level}, which ${harness} does not take for it (${efforts.join(', ')})`)
      }
    }
  }
  for (const [choice, seats] of Object.entries(config.designSeats ?? {})) {
    for (const [seat, models] of Object.entries(seats)) {
      for (const item of Array.isArray(models) ? models : []) {
        const [harness, model] = item.split('/')
        if (takesSwarmRole(config.harnesses[harness].models[model])) continue
        const found = inUse(harness, model) ?? notOffered(harness, model)
        if (!found) out.push(`designSeats.${choice}.${seat}: ${item} is neither in use nor in notOffered`)
        else if (!hasProfile(found)) out.push(`designSeats.${choice}.${seat}: ${item} has no profile`)
      }
    }
  }
  return out
}

const PROFILE = { purpose: 'What the maker says it is for.' }
const lane = (roles) => ({ roles })
const TABLE = {
  harnesses: {
    agy: {
      models: {
        flash: { roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' } },
        argon: { roles: ['judge', 'writer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' } },
      },
    },
    grok: { models: { 'grok-9': { roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' } } } },
  },
  designSeats: { balanced: { judge: ['agy/argon'], writer: [] }, robust: { writer: ['agy/argon'] } },
}
// The rows of the pairs table the synthetic table asks for: what its levels said before.
const pairRows = (harness, model, efforts) => efforts.map((effort) => ({ harness, model, effort }))
const PAIRS = [
  ...pairRows('agy', 'flash', ['low', 'medium', 'high']),
  ...pairRows('grok', 'grok-9', ['low', 'medium', 'high', 'xhigh']),
]
const INDEX = {
  models: [
    { harness: 'agy', model: 'flash', efforts: ['low', 'medium', 'high'], lane: lane(['implementer']), profile: PROFILE },
    { harness: 'grok', model: 'grok-9', efforts: ['low', 'medium', 'high', 'xhigh'], lane: lane(['implementer']), profile: PROFILE },
  ],
  notOffered: [{ harness: 'agy', model: 'argon', roles: ['judge', 'writer'], profile: PROFILE }],
  superseded: [{ harness: 'grok', id: 'grok-8', supersededBy: 'grok-9' }],
}
const copy = (value) => JSON.parse(JSON.stringify(value))

test('a table and an index that agree have no problems', () => {
  assert.deepEqual(problems(TABLE, INDEX, PAIRS), [])
})

test('a swarm model with no figure at an effort its harness takes enters only with the owner\'s decision written in its entry, and keeps every other rule', () => {
  const table = copy(TABLE)
  table.harnesses.agy.models.wide = { roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }, ownerDecision: '«entra» (the owner)' }
  const index = copy(INDEX)
  index.withoutFigures = [{ harness: 'agy', model: 'wide', efforts: ['low', 'medium', 'high'], lane: lane(['implementer']), profile: PROFILE }]
  const pairs = [...PAIRS, ...pairRows('agy', 'wide', ['high'])]
  assert.deepEqual(problems(table, index, pairs), [])
  // Without his words in the entry it is a problem, as before.
  const undecided = copy(table)
  delete undecided.harnesses.agy.models.wide.ownerDecision
  assert.deepEqual(problems(undecided, index, pairs), ['agy/wide: is not a current model that agy offers (it is not in models)'])
  const blank = copy(table)
  blank.harnesses.agy.models.wide.ownerDecision = '  '
  assert.deepEqual(problems(blank, index, pairs), ['agy/wide: is not a current model that agy offers (it is not in models)'])
  // His words do not excuse a missing profile or an effort the harness does not take.
  const flawed = copy(index)
  flawed.withoutFigures[0].profile = { purpose: '' }
  flawed.withoutFigures[0].efforts = ['low', 'medium']
  assert.deepEqual(problems(table, flawed, pairs), [
    'agy/wide: has no profile',
    'agy/wide: the table asks for the effort high, which agy does not take for it (low, medium)',
  ])
})

test('a design-seat model may be in use or not offered, and a swarm model must be in use', () => {
  const inUse = copy(INDEX)
  inUse.models.push({ harness: 'agy', model: 'argon', efforts: ['high'], profile: PROFILE })
  inUse.notOffered = []
  assert.deepEqual(problems(TABLE, inUse, PAIRS), [])
  const gone = copy(INDEX)
  gone.models = gone.models.filter((e) => e.model !== 'flash')
  assert.deepEqual(problems(TABLE, gone, PAIRS), ['agy/flash: is not a current model that agy offers (it is not in models)'])
  const seat = copy(INDEX)
  seat.notOffered = []
  assert.deepEqual(problems(TABLE, seat, PAIRS), ['designSeats.balanced.judge: agy/argon is neither in use nor in notOffered', 'designSeats.robust.writer: agy/argon is neither in use nor in notOffered'])
})

test('a model without a profile, a superseded model and an effort the harness does not take are each a problem', () => {
  const bare = copy(INDEX)
  delete bare.models[0].profile
  bare.notOffered[0].profile = { purpose: '' }
  assert.deepEqual(problems(TABLE, bare, PAIRS), [
    'agy/flash: has no profile',
    'designSeats.balanced.judge: agy/argon has no profile',
    'designSeats.robust.writer: agy/argon has no profile',
  ])
  const old = copy(INDEX)
  old.superseded.push({ harness: 'agy', id: 'flash', supersededBy: 'flash-2' })
  assert.deepEqual(problems(TABLE, old, PAIRS), ['agy/flash: is superseded by a newer generation'])
  const narrow = copy(INDEX)
  narrow.models[1].efforts = ['low', 'medium', 'high']
  assert.deepEqual(problems(TABLE, narrow, PAIRS), ['grok/grok-9: the table asks for the effort xhigh, which grok does not take for it (low, medium, high)'])
})

test("the shipped lane table agrees with the models index in the plugin's config folder", () => {
  assert.equal(fs.existsSync(INDEX_FILE), true, `${INDEX_FILE} is missing: spec 003 moves the models index there`)
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
  assert.ok(Array.isArray(index.models) && index.models.length > 0, 'the index has no models')
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  assert.deepEqual(problems(config, index, loadPairs().pairs), [])
  // The table is not empty of what the check covers.
  const swarm = Object.entries(config.harnesses).flatMap(([harness, h]) => Object.entries(h.models).filter(([, e]) => takesSwarmRole(e)).map(([id]) => `${harness}/${id}`))
  assert.ok(swarm.includes('grok/grok-4.7') && swarm.includes('agy/gemini-3.8-flash'), swarm.join(', '))
})
