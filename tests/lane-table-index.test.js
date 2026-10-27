'use strict'

// Spec 002, R17, as spec 009 (superdelegation) leaves it: the pairs table is checked against the models index (rules
// 1 to 3 of the index). Every model that an external pair of config/pairs.json names is a current model its harness
// offers, with a profile and the pair's effort among the efforts its harness takes. Roles no longer decide who is
// checked: the pairs do.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const INDEX_FILE = path.join(PLUGIN, 'config', 'models', 'models.json')

// The problems of a pairs table against an index, one line each; none when they agree. `pairs` are rows with
// { harness, model, effort } and, for a model with no figure at an effort its harness takes, the owner's `ownerDecision`.
function problems(index, pairs) {
  const list = (key) => (Array.isArray(index[key]) ? index[key] : [])
  const inUse = (harness, model) => list('models').find((e) => e.harness === harness && e.model === model)
  const noFigures = (harness, model) => list('withoutFigures').find((e) => e.harness === harness && e.model === model)
  const superseded = (harness, model) => list('superseded').some((e) => e.harness === harness && e.id === model)
  const hasProfile = (e) => typeof e?.profile?.purpose === 'string' && e.profile.purpose !== ''
  const external = pairs.filter((pair) => pair.harness !== 'claude')
  const models = [...new Set(external.map((pair) => `${pair.harness}/${pair.model}`))]
  const out = []
  for (const where of models) {
    const [harness, ...rest] = where.split('/')
    const id = rest.join('/')
    const rows = external.filter((pair) => pair.harness === harness && pair.model === id)
    const checkEfforts = (taken) => {
      for (const level of new Set(rows.map((pair) => pair.effort))) {
        if (!taken.includes(level)) out.push(`${where}: the table asks for the effort ${level}, which ${harness} does not take for it (${taken.join(', ')})`)
      }
    }
    const found = inUse(harness, id)
    if (!found) {
      // The owner may decide that a model with no figure at an effort its harness takes enters the table anyway: its pair
      // then carries his words in `ownerDecision`, the index lists it among the models with no figures, and everything
      // else is still asked of it: a profile and the efforts the table asks for.
      const open = noFigures(harness, id)
      if (open && rows.some((pair) => typeof pair.ownerDecision === 'string' && pair.ownerDecision.trim() !== '')) {
        if (!hasProfile(open)) out.push(`${where}: has no profile`)
        checkEfforts(open.efforts ?? [])
        continue
      }
      out.push(`${where}: is not a current model that ${harness} offers (it is not in models)`)
      continue
    }
    if (superseded(harness, id)) out.push(`${where}: is superseded by a newer generation`)
    if (!hasProfile(found)) out.push(`${where}: has no profile`)
    checkEfforts(Array.isArray(found.efforts) ? found.efforts : [])
  }
  return out
}

const PROFILE = { purpose: 'What the maker says it is for.' }
const lane = (roles) => ({ roles })
// The rows of the pairs table of the synthetic case: one per effort asked of a model.
const pairRows = (harness, model, efforts, extra = {}) => efforts.map((effort) => ({ harness, model, effort, ...extra }))
const PAIRS = [
  ...pairRows('claude', 'sonnet', ['low', 'high']),
  ...pairRows('agy', 'flash', ['low', 'medium', 'high']),
  ...pairRows('agy', 'argon', ['high']),
  ...pairRows('grok', 'grok-9', ['low', 'medium', 'high', 'xhigh']),
]
const INDEX = {
  models: [
    { harness: 'agy', model: 'flash', efforts: ['low', 'medium', 'high'], lane: lane(['implementer']), profile: PROFILE },
    { harness: 'agy', model: 'argon', efforts: ['low', 'medium', 'high'], lane: lane(['judge', 'writer']), profile: PROFILE },
    { harness: 'grok', model: 'grok-9', efforts: ['low', 'medium', 'high', 'xhigh'], lane: lane(['implementer']), profile: PROFILE },
  ],
  superseded: [{ harness: 'grok', id: 'grok-8', supersededBy: 'grok-9' }],
}
const copy = (value) => JSON.parse(JSON.stringify(value))

test('a pairs table and an index that agree have no problems, and the native pairs are not asked of the index', () => {
  assert.deepEqual(problems(INDEX, PAIRS), [])
})

test('a model with no figure at an effort its harness takes enters only with the owner\'s decision written in its pair, and keeps every other rule', () => {
  const index = copy(INDEX)
  index.withoutFigures = [{ harness: 'agy', model: 'wide', efforts: ['low', 'medium', 'high'], lane: lane(['implementer']), profile: PROFILE }]
  const decided = [...PAIRS, ...pairRows('agy', 'wide', ['high'], { ownerDecision: '«entra» (the owner)' })]
  assert.deepEqual(problems(index, decided), [])
  // Without his words in the pair it is a problem, as before.
  const undecided = [...PAIRS, ...pairRows('agy', 'wide', ['high'])]
  assert.deepEqual(problems(index, undecided), ['agy/wide: is not a current model that agy offers (it is not in models)'])
  const blank = [...PAIRS, ...pairRows('agy', 'wide', ['high'], { ownerDecision: '  ' })]
  assert.deepEqual(problems(index, blank), ['agy/wide: is not a current model that agy offers (it is not in models)'])
  // His words do not excuse a missing profile or an effort the harness does not take.
  const flawed = copy(index)
  flawed.withoutFigures[0].profile = { purpose: '' }
  flawed.withoutFigures[0].efforts = ['low', 'medium']
  assert.deepEqual(problems(flawed, decided), [
    'agy/wide: has no profile',
    'agy/wide: the table asks for the effort high, which agy does not take for it (low, medium)',
  ])
})

test('every external pair needs its model in use in the index: a model that is gone, or that only a role names, is a problem', () => {
  const gone = copy(INDEX)
  gone.models = gone.models.filter((e) => e.model !== 'flash')
  assert.deepEqual(problems(gone, PAIRS), ['agy/flash: is not a current model that agy offers (it is not in models)'])
  // A model of the lane table that no pair names is not checked; one that a pair names is, whatever its roles.
  const noArgon = copy(INDEX)
  noArgon.models = noArgon.models.filter((e) => e.model !== 'argon')
  assert.deepEqual(problems(noArgon, PAIRS), ['agy/argon: is not a current model that agy offers (it is not in models)'])
  assert.deepEqual(problems(noArgon, PAIRS.filter((pair) => pair.model !== 'argon')), [])
})

test('a model without a profile, a superseded model and an effort the harness does not take are each a problem', () => {
  const bare = copy(INDEX)
  delete bare.models[0].profile
  bare.models[1].profile = { purpose: '' }
  assert.deepEqual(problems(bare, PAIRS), ['agy/flash: has no profile', 'agy/argon: has no profile'])
  const old = copy(INDEX)
  old.superseded.push({ harness: 'agy', id: 'flash', supersededBy: 'flash-2' })
  assert.deepEqual(problems(old, PAIRS), ['agy/flash: is superseded by a newer generation'])
  const narrow = copy(INDEX)
  narrow.models[2].efforts = ['low', 'medium', 'high']
  assert.deepEqual(problems(narrow, PAIRS), ['grok/grok-9: the table asks for the effort xhigh, which grok does not take for it (low, medium, high)'])
})

test("the shipped pairs table agrees with the models index in the plugin's config folder", () => {
  assert.equal(fs.existsSync(INDEX_FILE), true, `${INDEX_FILE} is missing: spec 003 moves the models index there`)
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
  assert.ok(Array.isArray(index.models) && index.models.length > 0, 'the index has no models')
  const pairs = loadPairs().pairs
  assert.deepEqual(problems(index, pairs), [])
  // The table is not empty of what the check covers: Gemini 4 Argon, which only its judge and writer roles used to name,
  // and Muse, which enters by the owner's decision, are among the models checked.
  const checked = new Set(pairs.filter((pair) => pair.harness !== 'claude').map((pair) => `${pair.harness}/${pair.model}`))
  for (const model of ['grok/grok-4.7', 'agy/gemini-3.8-flash', 'agy/gemini-4-argon', 'muse/muse-wonder-full-1.0', 'muse/muse-spark-1.3']) assert.ok(checked.has(model), [...checked].join(', '))
})
