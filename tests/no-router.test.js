'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SCAN = ['plugins/aether', 'docs/guide', 'docs/reference', 'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/contributing.md', 'README.md', 'CLAUDE.md', 'scripts', 'tests']
// The files that may keep a name or a word, each with its reason (spec 013, C7).
const ALLOWED = {
  'plugins/aether/lib/spend.js': 'reads the old journal (R18)',
  'plugins/aether/lib/router-marks.js': 'the marks of exhausted pairs (R11)',
  'plugins/aether/lib/router-slow.js': 'the marks of slow pairs (R11)',
  'plugins/aether/lib/router-quota.js': 'the readings the pair choice uses (R11)',
  'plugins/aether/lib/router-pick.js': 'the pair step (R11)',
  'plugins/aether/lib/router-renewal.js': 'the renewal of readings (R11)',
  'tests/no-router.test.js': 'this test',
  'tests/docs-facts.test.js': 'keeps aether-route as an exception: the changelog names it as history (Task 13)',
  'tests/router-removed.test.js': 'proves that the decider and its command are gone (Task 13)',
  'tests/components-docs.test.js': 'proves that docs name no aether-route or retired identifiers (Task 20)',
  'tests/delegate-settings.test.js': 'proves that removed options are ignored (Task 16)',
  'tests/delegate-skill.test.js': 'proves that the bootstrap has no retired router rules (Task 12)',
  'tests/trim-router.test.js': 'proves that guard no longer knows aether-route (Task 16)',
}
const IDENTIFIERS = [
  /\baether-route\b/,
  /ROUTER-OVERRIDE/,
  /CLAUDE_PLUGIN_OPTION_(ROUTER|DECIDER|FALLBACK)/,
  /--config (router|decider|fallback)=/,
  /`(router|decider)`/,
  /\b(record|advise)\b.*\b(router|decider)\b|\b(router|decider)\b.*\b(record|advise)\b/,
]

function files(entry) {
  const full = path.join(ROOT, entry)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [entry]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((child) => {
    if (['node_modules', '.git', 'types'].includes(child.name)) return []
    return files(path.posix.join(entry, child.name))
  })
}

test('the identifiers of the decider appear nowhere but where C7 allows (C7, R9, R10)', () => {
  const found = []
  for (const file of SCAN.flatMap(files)) {
    if (Object.hasOwn(ALLOWED, file) || !/\.(js|mjs|jsx|ts|tsx|json|md|sh)$|\/aether-[a-z-]+$/.test(file)) continue
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    lines.forEach((line, n) => {
      if (/openrouter/i.test(line) && !IDENTIFIERS.slice(0, 5).some((id) => id.test(line))) return
      for (const id of IDENTIFIERS) if (id.test(line)) found.push(`${file}:${n + 1}: ${line.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(found, [])
})

test('the manifest declares none of the three options and the options table lists none (C7, E12)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
  for (const key of ['router', 'decider', 'fallback']) assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
  const table = fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8')
  for (const key of ['router', 'decider', 'fallback']) assert.equal(new RegExp(`^\\| \`${key}\` \\|`, 'm').test(table), false, key)
})

test('a user value saved in the three removed options changes nothing in the session settings (E12)', () => {
  const session = require('../plugins/aether/lib/session.js')
  const base = session.delegateSettingsFrom({})
  const saved = session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_ROUTER: 'advise', CLAUDE_PLUGIN_OPTION_DECIDER: 'jev', CLAUDE_PLUGIN_OPTION_FALLBACK: 'opus:max' })
  assert.deepEqual(saved, base)
})
