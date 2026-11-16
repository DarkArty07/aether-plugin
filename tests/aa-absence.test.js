'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')

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

function scanFiles(files, root = ROOT) {
  const found = []
  for (const file of files) {
    if (HISTORY.some((pattern) => pattern.test(file))) continue
    const full = path.join(root, file)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue
    const text = fs.readFileSync(full, 'utf8')
    if (text.includes(API_ADDRESS) || text.includes(KEY_NAME)) found.push(file)
    // The header is only the API's when the file also names Artificial Analysis: the research page of Claude Code names it for the
    // owner's local gateway, not for Artificial Analysis, and does not count.
    else if (text.includes(KEY_HEADER) && NAMES_AA.test(text)) found.push(file)
  }
  return found
}

test('no tracked file outside the history names the API address of Artificial Analysis or the name of its key, and none sends its header', () => {
  assert.deepEqual(scanFiles(tracked), [])
})

test('the search covers the tree: it finds the three texts in a file that holds them', (t) => {
  const dir = tempDir(t, 'aether-aa-absence-')
  fs.writeFileSync(path.join(dir, 'api.js'), `const u = "https://${API_ADDRESS}/v2"\n`)
  fs.writeFileSync(path.join(dir, 'key.js'), `process.env.${KEY_NAME}\n`)
  fs.writeFileSync(path.join(dir, 'hdr-aa.js'), `// Artificial Analysis\nheaders["${KEY_HEADER}"] = k\n`)
  fs.writeFileSync(path.join(dir, 'hdr-other.js'), `headers["${KEY_HEADER}"] = k\n`)
  assert.deepEqual(scanFiles(['api.js', 'key.js', 'hdr-aa.js', 'hdr-other.js'], dir), ['api.js', 'key.js', 'hdr-aa.js'])
  assert.ok(tracked.includes('plugins/aether/config/models/aa-pages.json') && tracked.includes('scripts/aa-pages.js'))
  assert.equal(HISTORY.some((p) => p.test('scripts/aa-pages.js') || p.test('plugins/aether/lib/lanes.js') || p.test('docs/reference/artificial-analysis.md')), false)
})
