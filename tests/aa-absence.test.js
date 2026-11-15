'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
// The three texts, built from pieces so that this file does not hold them as one string.
const API_ADDRESS = ['artificialanalysis.ai', 'api'].join('/')
const KEY_NAME = ['ARTIFICIAL_ANALYSIS', 'API', 'KEY'].join('_')
const KEY_HEADER = ['x', 'api', 'key'].join('-')
const NAMES_AA = /artificial[ -]?analysis/i
// History keeps its text: the specs of every feature (038 included: its design names the texts it removes), the changelog, the
// numbered decisions, the handoffs and the saved page of 2026-10-26. This file holds the three texts as data.
const HISTORY = [/^specs\//, /^docs\/changelog\.md$/, /^docs\/decisions\.md$/, /^docs\/handoff\//, /^docs\/models\/artificial-analysis-2026-10-26\.md$/, /^tests\/aa-absence\.test\.js$/]

const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)

test('no tracked file outside the history names the API address of Artificial Analysis or the name of its key, and none sends its header', () => {
  const found = []
  for (const file of tracked) {
    if (HISTORY.some((pattern) => pattern.test(file))) continue
    const full = path.join(ROOT, file)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue
    const text = fs.readFileSync(full, 'utf8')
    if (text.includes(API_ADDRESS) || text.includes(KEY_NAME)) found.push(file)
    // The header is only the API's when the file also names Artificial Analysis: the research page of Claude Code names it for the
    // owner's local gateway, not for Artificial Analysis, and does not count.
    else if (text.includes(KEY_HEADER) && NAMES_AA.test(text)) found.push(file)
  }
  assert.deepEqual(found, [])
})

test('the search covers the tree: it finds the three texts in a file that holds them', () => {
  const sample = `a ${API_ADDRESS}/v2 b ${KEY_NAME} c ${KEY_HEADER} Artificial Analysis`
  assert.ok(sample.includes(API_ADDRESS) && sample.includes(KEY_NAME) && sample.includes(KEY_HEADER) && NAMES_AA.test(sample))
  assert.ok(tracked.includes('plugins/aether/config/models/aa-pages.json') && tracked.includes('scripts/aa-pages.js'))
})
