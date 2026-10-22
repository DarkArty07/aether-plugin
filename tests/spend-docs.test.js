'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
const section = (text, heading) => {
  const start = text.indexOf(heading)
  assert.ok(start >= 0, `missing ${heading}`)
  const rest = text.slice(start + heading.length)
  const next = rest.search(/\n#{1,3} /)
  return next === -1 ? rest : rest.slice(0, next)
}

test('the autonomy page keeps the ceiling figure apart from the session spend', () => {
  const cost = section(read('docs', 'guide', 'autonomy.md'), '- **Cost.**')
  assert.match(cost, /`aether-report --spend`/)
  assert.match(cost, /list.price/i)
  assert.match(cost, /not the (figure of the )?ceiling|another figure|apart from the ceiling/i)
})

test('the lanes page documents /spend next to /harnesses', () => {
  const lanes = read('docs', 'guide', 'lanes.md')
  assert.ok(lanes.indexOf('### The /harnesses panel') < lanes.indexOf('### The /spend panel'))
  const spend = section(lanes, '### The /spend panel')
  for (const pattern of [/`\/spend`/, /`aether-report --spend/, /list.price/i, /not a percentage/i, /same id/i, /--fork-session/, /\/clear/, /no price|without a price|unpriced/i, /approximate/, /incomplete/, /No spend recorded yet/]) assert.match(spend, pattern)
})

test('troubleshooting says /spend is not offered outside an Aether session either', () => {
  const entry = section(read('docs', 'guide', 'troubleshooting.md'), '## The /harnesses panel is not offered')
  assert.match(entry, /`\/spend`/)
})

test('maintenance says the 30-day prune keeps the total', () => {
  const text = read('docs', 'guide', 'maintenance.md')
  assert.match(text, /spend\/<session>\.json|spend\/<id>\.json/)
  assert.match(text, /summary/i)
})

test('components names /spend and the summary the prune keeps', () => {
  const text = read('docs', 'reference', 'components.md')
  assert.match(text, /`\/spend`/)
  assert.match(text, /spend summary|summary of the spend|keeps a summary/i)
})

const ROOT = path.join(__dirname, '..')
const README = 'README.md'
const PAGES = [
  'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/guide/router.md', 'docs/reference/components.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md',
]
const FILES = [README, ...PAGES]

const BUILTINS = new Set([
  'model', 'effort', 'config', 'usage', 'context', 'resume', 'recap', 'clear',
  'add-dir', 'plugin', 'proc', 'theme', 'init', 'compact', 'reload-plugins',
  'goal', 'deep-research', 'plugin-types', 'advisor',
])

const slashCommandsIn = (text) => {
  const matches = []
  for (const m of text.matchAll(/`\/([a-z][a-z0-9-]*)(?: [^`]*)?`/g)) {
    const name = m[1]
    if (!name.startsWith('aether:') && !BUILTINS.has(name)) matches.push(name)
  }
  return matches
}

const declaredCommands = () => {
  const hooksDir = path.join(ROOT, 'plugins', 'aether', 'hooks')
  const registerSrc = fs.readFileSync(path.join(hooksDir, 'register.js'), 'utf8')
  const importedFiles = [...registerSrc.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)].map((m) => m[1])
  const files = ['register.js', ...importedFiles]
  const commands = new Set()
  for (const file of files) {
    const full = path.join(hooksDir, file)
    if (!fs.existsSync(full)) continue
    const src = fs.readFileSync(full, 'utf8')
    const match = src.match(/const\s+COMMAND\s*=\s*['"]([a-z0-9-]+)['"]/)
    if (match) commands.add(match[1])
    for (const m of src.matchAll(/command\.register\(\{\s*name:\s*['"]([a-z0-9-]+)['"]/g)) {
      commands.add(m[1])
    }
  }
  return commands
}

test('every slash command the docs name is declared in plugins/aether/hooks/register.js', () => {
  const declared = declaredCommands()
  assert.ok(declared.has('spend'), 'spend is declared')
  assert.ok(declared.has('harnesses'), 'harnesses is declared')
  let foundAny = false
  for (const rel of FILES) {
    const commands = slashCommandsIn(read(rel))
    for (const name of commands) {
      foundAny = true
      assert.ok(declared.has(name), `${rel} names \`/${name}\`, which is not declared in plugins/aether/hooks/register.js`)
    }
  }
  assert.ok(foundAny, 'found slash commands in docs')
})
