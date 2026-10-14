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

const INDEX_FILE = path.join(PLUGIN, 'config', 'models', 'models.json')
const SWARM_ROLES = ['implementer', 'supervisor', 'reviewer']
const takesSwarmRole = (entry) => entry.roles.some((role) => SWARM_ROLES.includes(role))

// The problems of a lane table against an index, one line each; none when they agree.
function problems(config, index) {
  const list = (key) => (Array.isArray(index[key]) ? index[key] : [])
  const inUse = (harness, model) => list('models').find((e) => e.harness === harness && e.model === model)
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
        out.push(`${where}: is not a current model that ${harness} offers (it is not in models)`)
        continue
      }
      if (superseded(harness, id)) out.push(`${where}: is superseded by a newer generation`)
      if (!hasProfile(found)) out.push(`${where}: has no profile`)
      const efforts = Array.isArray(found.efforts) ? found.efforts : []
      for (const level of new Set(Object.values(entry.levels))) {
        if (!efforts.includes(level)) out.push(`${where}: the table asks for the effort ${level}, which ${harness} does not take for it (${efforts.join(', ')})`)
      }
      if (found.lane && found.lane.replaces !== entry.replaces) out.push(`${where}: the index says it replaces ${found.lane.replaces} and the table ${entry.replaces}`)
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
const lane = (roles, replaces) => ({ roles, replaces })
const TABLE = {
  harnesses: {
    agy: {
      models: {
        flash: { roles: ['implementer'], replaces: 'haiku', levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' } },
        argon: { roles: ['judge', 'writer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' } },
      },
    },
    grok: { models: { 'grok-9': { roles: ['implementer'], replaces: 'haiku', levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' } } } },
  },
  designSeats: { balanced: { judge: ['agy/argon'], writer: [] }, robust: { writer: ['agy/argon'] } },
}
const INDEX = {
  models: [
    { harness: 'agy', model: 'flash', efforts: ['low', 'medium', 'high'], lane: lane(['implementer'], 'haiku'), profile: PROFILE },
    { harness: 'grok', model: 'grok-9', efforts: ['low', 'medium', 'high', 'xhigh'], lane: lane(['implementer'], 'haiku'), profile: PROFILE },
  ],
  notOffered: [{ harness: 'agy', model: 'argon', roles: ['judge', 'writer'], profile: PROFILE }],
  superseded: [{ harness: 'grok', id: 'grok-8', supersededBy: 'grok-9' }],
}
const copy = (value) => JSON.parse(JSON.stringify(value))

test('a table and an index that agree have no problems', () => {
  assert.deepEqual(problems(TABLE, INDEX), [])
})

test('a design-seat model may be in use or not offered, and a swarm model must be in use', () => {
  const inUse = copy(INDEX)
  inUse.models.push({ harness: 'agy', model: 'argon', efforts: ['high'], profile: PROFILE })
  inUse.notOffered = []
  assert.deepEqual(problems(TABLE, inUse), [])
  const gone = copy(INDEX)
  gone.models = gone.models.filter((e) => e.model !== 'flash')
  assert.deepEqual(problems(TABLE, gone), ['agy/flash: is not a current model that agy offers (it is not in models)'])
  const seat = copy(INDEX)
  seat.notOffered = []
  assert.deepEqual(problems(TABLE, seat), ['designSeats.balanced.judge: agy/argon is neither in use nor in notOffered', 'designSeats.robust.writer: agy/argon is neither in use nor in notOffered'])
})

test('a model without a profile, a superseded model and an effort the harness does not take are each a problem', () => {
  const bare = copy(INDEX)
  delete bare.models[0].profile
  bare.notOffered[0].profile = { purpose: '' }
  assert.deepEqual(problems(TABLE, bare), [
    'agy/flash: has no profile',
    'designSeats.balanced.judge: agy/argon has no profile',
    'designSeats.robust.writer: agy/argon has no profile',
  ])
  const old = copy(INDEX)
  old.superseded.push({ harness: 'agy', id: 'flash', supersededBy: 'flash-2' })
  assert.deepEqual(problems(TABLE, old), ['agy/flash: is superseded by a newer generation'])
  const narrow = copy(INDEX)
  narrow.models[1].efforts = ['low', 'medium', 'high']
  assert.deepEqual(problems(TABLE, narrow), ['grok/grok-9: the table asks for the effort xhigh, which grok does not take for it (low, medium, high)'])
  const moved = copy(INDEX)
  moved.models[0].lane = lane(['implementer'], 'sonnet')
  assert.deepEqual(problems(TABLE, moved), ['agy/flash: the index says it replaces sonnet and the table haiku'])
})

test("the shipped lane table agrees with the models index in the plugin's config folder", () => {
  assert.equal(fs.existsSync(INDEX_FILE), true, `${INDEX_FILE} is missing: spec 003 moves the models index there`)
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
  assert.ok(Array.isArray(index.models) && index.models.length > 0, 'the index has no models')
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  assert.deepEqual(problems(config, index), [])
  // The table is not empty of what the check covers.
  const swarm = Object.entries(config.harnesses).flatMap(([harness, h]) => Object.entries(h.models).filter(([, e]) => takesSwarmRole(e)).map(([id]) => `${harness}/${id}`))
  assert.ok(swarm.includes('grok/grok-4.7') && swarm.includes('agy/gemini-3.8-flash'), swarm.join(', '))
})
