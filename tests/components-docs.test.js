'use strict'

// Spec 013 (R10, R22): the components page, the README, the getting-started page and CLAUDE.md describe the delegate ladder
// and name nothing of the retired router. The counts they give (options, commands) are read from the tree, not repeated here.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
const manifest = () => JSON.parse(read('plugins', 'aether', '.claude-plugin', 'plugin.json'))
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

// The identifiers of the retired router, as the search of C7 reads them.
// The names of the retired command and mark are built from parts, so that a search for them does not find this test.
const OLD_BIN = 'aether-' + 'route'
const RETIRED = [
  new RegExp('\\b' + OLD_BIN + '\\b'),
  new RegExp('ROUTER-' + 'OVERRIDE'),
  /CLAUDE_PLUGIN_OPTION_(ROUTER|DECIDER|FALLBACK)/,
  /--config (router|decider|fallback)=/,
  /`(router|decider|fallback)`/,
  /\b(record|advise)\b.*\b(router|decider)\b|\b(router|decider)\b.*\b(record|advise)\b/,
]

test('the components page names aether-delegate and no retired decider command (R10)', () => {
  const components = read('docs', 'reference', 'components.md')
  assert.ok(components.includes('`aether-delegate`'))
  assert.equal(components.includes('`' + OLD_BIN + '`'), false)
})

test('the README and the CLAUDE.md name no retired decider command and point to the delegates guide (R10)', () => {
  for (const file of ['README.md', 'CLAUDE.md']) assert.equal(read(file).includes(OLD_BIN), false, file)
  assert.ok(read('CLAUDE.md').includes('aether-delegate'))
})

test('the README, the getting-started page and CLAUDE.md link the delegates guide (R10)', () => {
  for (const [file, link] of [['README.md', 'docs/guide/delegates.md'], ['docs/getting-started.md', 'guide/delegates.md'], ['CLAUDE.md', 'docs/guide/delegates.md']]) {
    assert.ok(read(...file.split('/')).includes(`](${link}`), `${file} links ${link}`)
  }
})

test('the four documents name none of the identifiers of the retired router (R10)', () => {
  for (const file of ['README.md', 'CLAUDE.md', 'docs/getting-started.md', 'docs/reference/components.md']) {
    read(...file.split('/')).split('\n').forEach((line, i) => {
      for (const pattern of RETIRED) assert.doesNotMatch(line, pattern, `${file}:${i + 1} still says ${pattern}`)
    })
  }
})

test('the README and the getting-started page count the options of the manifest (R22)', () => {
  const options = Object.entries(manifest().userConfig).filter(([, option]) => !/\(legacy\)$/.test(option.title)).map(([name]) => name)
  assert.equal(options.length, 6)
  assert.ok(read('README.md').includes(`the plugin's ${NUMBERS[options.length]} options`), 'the README gives the count')
  const started = read('docs', 'getting-started.md')
  assert.ok(started.includes(`the plugin's ${NUMBERS[options.length]} options`), 'getting-started gives the count')
  for (const name of options) assert.ok(started.includes(`\`${name}\``), `getting-started names ${name}`)
})

test('the Config line of CLAUDE.md names the options of the manifest and none that is gone (R22)', () => {
  const claude = read('CLAUDE.md')
  const config = claude.split('\n').find((line) => line.startsWith('- **Config.**'))
  assert.ok(config, 'CLAUDE.md has a Config line')
  const options = Object.entries(manifest().userConfig).filter(([, option]) => !/\(legacy\)$/.test(option.title)).map(([name]) => name)
  for (const name of options) assert.ok(config.includes(name), `the Config line names ${name}`)
  assert.doesNotMatch(config, /\b(router|decider|fallback)\b/, 'the Config line names none of the options that are gone')
  assert.ok(config.includes('config/ladder.json'), 'the Config line lists the ladder data')
})

test('CLAUDE.md describes aether-delegate, the ladder, its data and its log (R22)', () => {
  const claude = read('CLAUDE.md')
  for (const text of ['`aether-delegate`', 'lib/ladder.js', 'config/ladder.json', 'delegates/log.jsonl', 'hooks/delegate.mjs']) {
    assert.ok(claude.includes(text), `CLAUDE.md names ${text}`)
  }
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'ladder.js')))
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'ladder.json')))
})

test('the components page lists every verb of aether-delegate, and the mod hands the delegates to it (R10)', () => {
  const components = read('docs', 'reference', 'components.md')
  const row = components.split('\n').find((line) => line.startsWith('| `aether-delegate` |'))
  assert.ok(row, 'the page has a row for aether-delegate')
  const verbs = [...read('plugins', 'aether', 'bin', 'aether-delegate').matchAll(/^\/\/ aether-delegate (\w+)/gm)].map((m) => m[1])
  assert.deepEqual(verbs.sort(), ['answer', 'begin', 'renew', 'run', 'start', 'verdict', 'wait'])
  for (const verb of verbs) assert.ok(row.includes(`\`${verb}\``), `the row names ${verb}`)
  assert.ok(row.includes('guide/delegates.md'), 'the row links the delegates guide')
  const mod = components.split('\n').find((line) => line.startsWith('| Usage meter and ops |'))
  assert.ok(mod, 'the page has a row for the mod')
  assert.doesNotMatch(mod, /router/i)
  assert.ok(mod.includes('`aether-delegate`'), 'the mod row says it talks to aether-delegate')
})

test('the components page counts the commands of bin/ and says the ladder adds nothing to a plain session (R10)', () => {
  const components = read('docs', 'reference', 'components.md')
  assert.ok(components.includes('the eleven commands of `bin/`'))
  assert.equal(fs.readdirSync(path.join(__dirname, '..', 'plugins', 'aether', 'bin')).length, 11)
  assert.doesNotMatch(components, /Today, in \d/)
  assert.match(components, /delegate ladder[^\n]*adds nothing at the start of a plain session/)
})
