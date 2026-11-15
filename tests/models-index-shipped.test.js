'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { main } = require('../scripts/build-models-index.js')

const ROOT = path.join(__dirname, '..')
const SHIPPED_MODELS = path.join(ROOT, 'plugins', 'aether', 'config', 'models', 'models.json')
const SHIPPED_README = path.join(ROOT, 'docs', 'models', 'README.md')

test('rebuilding the index from the shipped inputs twice writes the shipped models.json and README block, byte for byte, with no network', (t) => {
  const dir = tempDir(t, 'aether-shipped-index-')
  const out = path.join(dir, 'out')
  const docs = path.join(dir, 'docs')
  fs.mkdirSync(docs)
  fs.copyFileSync(SHIPPED_README, path.join(docs, 'README.md'))
  const texts = []
  for (let i = 0; i < 2; i++) {
    const result = main(['--write', '--out', out, '--docs', docs])
    assert.equal(result.exitCode, 0, result.stdout)
    texts.push([fs.readFileSync(path.join(out, 'models.json'), 'utf8'), fs.readFileSync(path.join(docs, 'README.md'), 'utf8')])
  }
  assert.deepEqual(texts[0], texts[1])
  assert.equal(texts[0][0], fs.readFileSync(SHIPPED_MODELS, 'utf8'))
  assert.equal(texts[0][1], fs.readFileSync(SHIPPED_README, 'utf8'))
})

test('the shipped index names the photo as its source, keeps no trace of the API, and lists what was declared superseded or out of scope', () => {
  const file = JSON.parse(fs.readFileSync(SHIPPED_MODELS, 'utf8'))
  assert.equal(file.source, 'plugins/aether/config/models/aa-pages.json, from the model pages https://artificialanalysis.ai/models/<slug>')
  assert.equal(Object.hasOwn(file, 'since'), false)
  assert.deepEqual(file.superseded.map((entry) => `${entry.harness}/${entry.id}`).sort(), ['agy/gemini-3.8-flash', 'grok/grok-4.5', 'grok/grok-4.6', 'muse/muse-spark-1.2'])
  assert.deepEqual(file.outOfScope.map((entry) => `${entry.harness}/${entry.model}`), ['agy/gpt-oss-120b'])
})

test('the model agy lists with no pair row and no photo is named in the summary and is not declared out of scope, and the build still exits 0', () => {
  const result = main([])
  assert.equal(result.exitCode, 0, result.stdout)
  assert.match(result.stdout, /Listed with no pair row and no photo \(\d+\): .*agy\/gemini-pro-orchestrator-g1-pro/)
  const file = JSON.parse(fs.readFileSync(SHIPPED_MODELS, 'utf8'))
  assert.ok(file.withoutFigures.some((entry) => entry.harness === 'agy' && entry.model === 'gemini-pro-orchestrator-g1-pro'))
})
