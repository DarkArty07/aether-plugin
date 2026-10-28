'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const g = require('./guards-helpers.js')
const { hits } = require('./retired-patterns.js')

const ROOT = g.ROOT
const FILES = g.moduleFiles({})
const LIB = FILES.filter((f) => f.startsWith('plugins/aether/lib/'))
const declared = g.declaredFamilies(fs.readFileSync(path.join(ROOT, 'docs/reference/components.md'), 'utf8'))
const tracked = (...dirs) => execFileSync('git', ['ls-files', '-z', ...dirs], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)

test('R7 and R8: every module of the closed list says what it is and, in lib/, its family', () => {
  assert.deepEqual(FILES.flatMap((f) => g.headerProblems(f, { declared })), [])
})

test('R7: every decision and spec cited in a comment exists', () => {
  assert.deepEqual(FILES.flatMap((f) => g.citationProblems(f, {})), [])
})

test('R14: lib/ has no cycle and no adapter asks for the module that runs it', () => {
  assert.deepEqual(g.findCycles(g.requireGraph({})), [])
  assert.deepEqual(LIB.filter((f) => f.includes('/harness/')).flatMap((f) => g.adapterProblems(f, {})), [])
})

test('R15: no helper is defined twice in lib/, and no exemption is left', () => {
  assert.deepEqual(g.EXEMPT_GROUPS, [])
  assert.deepEqual(g.duplicateGroups(LIB, {}), [])
})

test('R18: nothing defined or required is left unused', () => {
  const dead = FILES.flatMap((f) => g.deadNames(f, {}).map((name) => `${f}: ${name}`))
  assert.deepEqual(dead, [])
})

test('R16: every file of lib/ is in a declared family of the scheme or declared loose, and each orchestrator exists', () => {
  const names = LIB.map((f) => path.basename(f))
  for (const f of LIB) {
    const family = g.expectedFamily(f, declared)
    assert.ok(typeof family === 'string', `${f}: ${family && family.problem}`)
    assert.ok(family === 'none' || family === 'harness' || declared.families.has(family), `${f}: the family ${family} is not declared in components.md`)
  }
  for (const [family, { orchestrator }] of declared.families) {
    if (orchestrator && orchestrator !== 'none') assert.ok(names.includes(orchestrator), `${family}: ${orchestrator} is not in lib/`)
    if (family !== 'harness') for (const name of names) if (name.startsWith(`${family}-`)) assert.ok(!declared.loose.has(name), `${name} is both in the ${family} family and declared loose`)
  }
})

test('R17, R4 and C1: no retired name, journal, leftover or compatibility branch is in the searched tree, with the documents that remain', () => {
  assert.deepEqual(hits(['options', 'journal', 'leftovers', 'formats'], { docs: true }), [])
})

test('R18: every top-level key of every config JSON is read by a file of the plugin, the scripts or the tests', () => {
  const readers = tracked('plugins/aether/lib', 'plugins/aether/bin', 'plugins/aether/hooks', 'plugins/aether/workflows', 'scripts', 'tests')
    .filter((f) => !f.endsWith('.json') && !/\.(png|jpe?g|gif|webp|ico)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n')
  const unread = []
  for (const file of tracked('plugins/aether/config').filter((f) => f.endsWith('.json'))) {
    for (const key of Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')))) {
      if (!new RegExp(`\\b${key}\\b`).test(readers)) unread.push(`${file}: ${key}`)
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
  for (const key of Object.keys(manifest.userConfig)) {
    if (!readers.includes('CLAUDE_PLUGIN_OPTION_' + key.toUpperCase()) && !new RegExp(`\\b${key}\\b`).test(readers)) unread.push(`plugin.json userConfig: ${key}`)
  }
  assert.deepEqual(unread, [])
})

test('R23: no tracked file holds the owner\'s home folder or email', () => {
  const personal = [new RegExp('/home/' + 'dark' + 'arty'), new RegExp('christopher\\.hdez\\.10' + '@' + 'gmail')]
  const found = []
  for (const file of tracked()) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz)$/i.test(file) || !fs.existsSync(path.join(ROOT, file))) continue
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const pattern of personal) if (pattern.test(text)) found.push(file)
  }
  assert.deepEqual(found, [])
})

test('R21: the retired document folders are gone and the last handoff stays', () => {
  const docs = tracked('docs')
  assert.deepEqual(docs.filter((f) => /^docs\/(superpowers|evaluations|roadmap|evidence)\//.test(f)), [])
  assert.deepEqual(docs.filter((f) => f.startsWith('docs/handoff/')), ['docs/handoff/2026-10-28-swarm-one-ladder.md'])
  assert.deepEqual(tracked('specs').filter((f) => /\/evidence\//.test(f)), [])
})
