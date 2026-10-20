'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const NOT_CODE = /(^|-)(image|voice|transcribe|sam)(-|$)/

const idOf = (listed) => (typeof listed === 'string' ? listed : listed.id)
const versionOf = (id) => (/-(\d+(?:\.\d+)*)$/.exec(id)?.[1] ?? '0').split('.').map(Number)
const lineOf = (id) => id.replace(/-\d+(?:\.\d+)*$/, '')
const newer = (a, b) => {
  const x = versionOf(a)
  const y = versionOf(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

// One message for each way a Muse model of the lane table breaks the three rules, the contributor ban and the measurement.
function checkMuseModels({ lanes, listings, profiles }) {
  const problems = []
  const models = lanes.harnesses?.muse?.models ?? {}
  const listed = (listings.harnesses?.muse?.models ?? []).map(idOf)
  for (const [id, entry] of Object.entries(models)) {
    if (/contributor/.test(id)) problems.push(`${id}: a contributor model never enters the table`)
    if (NOT_CODE.test(id)) problems.push(`${id}: not a coding model`)
    if (!listed.includes(id)) problems.push(`${id}: the Muse CLI does not list it (harness-models.json)`)
    const line = listed.filter((other) => !/contributor/.test(other) && lineOf(other) === lineOf(id))
    if (line.some((other) => newer(other, id))) problems.push(`${id}: not the newest generation of its line`)
    const key = id.replace(/\./g, '-')
    if (!profiles.profiles?.[key] && !profiles.profiles?.[id]) problems.push(`${id}: no profile in profiles.json`)
    if (!entry.aa || typeof entry.aa.slug !== 'string' || !Number.isFinite(entry.aa.intelligence)) {
      problems.push(`${id}: no Artificial Analysis measurement behind its entry`)
    }
  }
  return problems
}

test('the committed lane table passes the three rules for every Muse model it lists (none while there is no measurement)', () => {
  const lanes = read('lanes.json')
  const listings = read('models', 'harness-models.json')
  assert.deepEqual(checkMuseModels({ lanes, listings, profiles: read('models', 'profiles.json') }), [])
})

test('the rules fail for a model the CLI does not list, an older generation, a model with no profile or no measurement, and a contributor model', () => {
  const entry = (extra = {}) => ({ group: 'muse', roles: ['implementer'], aa: { slug: 's', intelligence: 40 }, ...extra })
  const listings = { harnesses: { muse: { models: [{ id: 'muse-spark-1.3' }, 'muse-spark-1.2', 'muse-spark-1.3-contributor', 'muse-wonder-1.0'] } } }
  const profiles = { profiles: { 'muse-spark-1-3': {}, 'muse-spark-1-2': {} } }
  const check = (models) => checkMuseModels({ lanes: { harnesses: { muse: { models } } }, listings, profiles })
  assert.deepEqual(check({ 'muse-spark-1.3': entry() }), [])
  assert.deepEqual(check({ 'muse-spark-1.2': entry() }), ['muse-spark-1.2: not the newest generation of its line'])
  assert.deepEqual(check({ 'muse-spark-9.9': entry() }), ['muse-spark-9.9: the Muse CLI does not list it (harness-models.json)', 'muse-spark-9.9: no profile in profiles.json'])
  assert.deepEqual(check({ 'muse-wonder-1.0': entry() }), ['muse-wonder-1.0: no profile in profiles.json'])
  assert.deepEqual(check({ 'muse-spark-1.3': entry({ aa: undefined }) }), ['muse-spark-1.3: no Artificial Analysis measurement behind its entry'])
  assert.ok(check({ 'muse-spark-1.3-contributor': entry() }).some((message) => /contributor model never enters/.test(message)))
  assert.ok(check({ 'muse-image-1': entry() }).some((message) => /not a coding model/.test(message)))
})

test('a line is the id without its version number, and the larger number wins', () => {
  assert.equal(lineOf('muse-spark-1.3'), 'muse-spark')
  assert.equal(lineOf('muse-wonder-full-1.0'), 'muse-wonder-full')
  assert.equal(newer('muse-spark-1.10', 'muse-spark-1.9'), true)
  assert.equal(newer('muse-spark-1.2', 'muse-spark-1.3'), false)
})
