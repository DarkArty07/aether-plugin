'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { refresh, keyFrom, main } = require('../scripts/refresh-lanes.js')

const CONFIG = {
  reserve: 0.05,
  harnesses: {
    agy: {
      models: {
        'gemini-3.8-flash': { aa: { slug: 'gemini-3-8-flash', intelligence: 40.9, terminalBench: 0.2, checked: '2026-10-08' } },
        'claude-opus-5-5': { aa: { slug: 'claude-opus-5-5-high', intelligence: 53.6, terminalBench: 0.57, checked: '2026-10-08' } },
        'no-aa': { group: 'x' },
      },
    },
  },
}
const AA = [
  { slug: 'gemini-3-8-flash', evaluations: { artificial_analysis_intelligence_index: 41.04, terminalbench_v4_0: 0.2121 } },
  { slug: 'claude-opus-5-5-high', evaluations: { artificial_analysis_intelligence_index: 53.6, terminalbench_v4_0: 0.565656 } },
]
const NOW = () => Date.parse('2026-11-01T10:00:00Z')

test("refresh writes the latest figures into each model's aa block and lists what changed", () => {
  const { config, changes } = refresh(structuredClone(CONFIG), AA, { checked: '2026-11-01' })
  assert.deepEqual(config.harnesses.agy.models['gemini-3.8-flash'].aa, { slug: 'gemini-3-8-flash', intelligence: 41, terminalBench: 0.21, checked: '2026-11-01' })
  assert.deepEqual(config.harnesses.agy.models['claude-opus-5-5'].aa, { slug: 'claude-opus-5-5-high', intelligence: 53.6, terminalBench: 0.57, checked: '2026-11-01' })
  assert.deepEqual(config.harnesses.agy.models['no-aa'], { group: 'x' })
  assert.deepEqual(changes, ['gemini-3.8-flash: intelligence 40.9 → 41', 'gemini-3.8-flash: terminalBench 0.2 → 0.21'])
})

test('a slug Artificial Analysis no longer lists is reported and left alone', () => {
  const { config, changes } = refresh(structuredClone(CONFIG), AA.slice(1), { checked: '2026-11-01' })
  assert.deepEqual(config.harnesses.agy.models['gemini-3.8-flash'].aa, CONFIG.harnesses.agy.models['gemini-3.8-flash'].aa)
  assert.deepEqual(changes, ['gemini-3.8-flash: slug gemini-3-8-flash not found'])
})

test('keyFrom takes the environment first, then the .env file, and never invents one', () => {
  assert.equal(keyFrom({ ARTIFICIAL_ANALYSIS_API_KEY: 'from-env' }, 'ARTIFICIAL_ANALYSIS_API_KEY=from-file\n'), 'from-env')
  assert.equal(keyFrom({}, '# comment\nOTHER=1\nARTIFICIAL_ANALYSIS_API_KEY="from-file"\n'), 'from-file')
  assert.equal(keyFrom({}, "ARTIFICIAL_ANALYSIS_API_KEY='single'\n"), 'single')
  assert.equal(keyFrom({}, ''), null)
  assert.equal(keyFrom({}, null), null)
})

test('main fetches with the key, prints the changes without the key, and writes only with --write', async (t) => {
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, JSON.stringify(CONFIG))
  const seen = []
  const fetch = async (url, init) => {
    seen.push([url, init.headers['x-api-key']])
    return { ok: true, status: 200, json: async () => ({ data: AA }) }
  }
  const env = { ARTIFICIAL_ANALYSIS_API_KEY: 'secret-key' }
  const dry = await main(['--config', file], { env, fetch, now: NOW })
  assert.equal(dry.exitCode, 0)
  assert.deepEqual(seen, [['https://artificialanalysis.ai/api/v2/data/llms/models', 'secret-key']])
  assert.equal(dry.stdout.includes('secret-key'), false)
  assert.equal(dry.stdout, 'gemini-3.8-flash: intelligence 40.9 → 41\ngemini-3.8-flash: terminalBench 0.2 → 0.21\n')
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), CONFIG)

  const wrote = await main(['--config', file, '--write'], { env, fetch, now: NOW })
  assert.ok(wrote.stdout.endsWith(`written to ${file}\n`))
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).harnesses.agy.models['gemini-3.8-flash'].aa.checked, '2026-11-01')

  const again = await main(['--config', file], { env, fetch: async () => ({ ok: true, status: 200, json: async () => AA }), now: NOW })
  assert.equal(again.stdout, 'No figure changed.\n')

  const none = await main(['--config', file], { env: {}, fetch, now: NOW, envFile: null })
  assert.deepEqual(none, { exitCode: 1, stdout: "ARTIFICIAL_ANALYSIS_API_KEY is not set, and the main checkout's .env does not have it.\n" })

  const refused = await main(['--config', file], { env, fetch: async () => ({ ok: false, status: 401 }), now: NOW })
  assert.deepEqual(refused, { exitCode: 1, stdout: 'Artificial Analysis answered 401.\n' })
})
