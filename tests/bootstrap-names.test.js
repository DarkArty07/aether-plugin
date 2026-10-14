'use strict'

// Everything the Lead's bootstrap and the swarm skill name must exist: commands, subcommands, agents,
// skills, files, prices and quotes. The sources are the context the session-start hook injects (run as
// the Lead) and the swarm skill with ${CLAUDE_PLUGIN_ROOT} resolved the way Claude Code resolves it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, SESSION_BIN, tempDir, makeRepo } = require('./helpers.js')

const PLACEHOLDER = '${CLAUDE_PLUGIN_ROOT}'
const AETHER = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')
const json = (...parts) => JSON.parse(read(...parts))

// Words that start with aether- and are not commands: the repository's name and the marketplace's.
const NOT_COMMANDS = new Set(['aether-plugin', 'aether-aether-plugin'])
// A run's own files are named relative to its folder, never by a path of the plugin.
const RUN_FILES = /^(run|result|result-[\w-]+|grants|baseline)\.json$/

// The text of the SKILL.md sources, as committed.
const USING_SOURCE = read('skills', 'using-aether', 'SKILL.md')
const SWARM_SOURCE = read('skills', 'swarm', 'SKILL.md')

// The context the hook injects for the Lead, as the session-start tests run it.
function injectedContext(t) {
  const repo = makeRepo(t)
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: tempDir(t, 'aether-data-') }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'CLAUDE_PLUGIN_OPTION_HARNESSES', 'CLAUDE_PLUGIN_OPTION_OPS', 'AETHER_LANES']) delete env[key]
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify(AETHER), env })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext
}

// The swarm skill the way Claude Code loads it: the plugin folder in place of ${CLAUDE_PLUGIN_ROOT}.
const resolvedSwarm = () => SWARM_SOURCE.split(PLACEHOLDER).join(PLUGIN)

// The sources whose names are checked, with the plugin folder shortened, so that the folder's own
// words (a checkout named aether-plugin) are not read as commands.
function sources(t) {
  return [
    ['the injected context', injectedContext(t)],
    ['the swarm skill', resolvedSwarm()],
  ].map(([name, text]) => [name, text.split(PLUGIN).join('<PLUGIN>')])
}

// The code in a text: code spans and indented code blocks.
function codeSnippets(text) {
  const snippets = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
  for (const line of text.split('\n')) if (/^ {4,}\S/.test(line)) snippets.push(line.trim())
  return snippets
}

const usageCache = new Map()
// What a bin prints when it runs with no arguments (stdout and stderr). Only the bins whose
// subcommands a text shows are run, from an empty folder.
function usage(t, command) {
  if (!usageCache.has(command)) {
    const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', command)], {
      cwd: tempDir(t),
      encoding: 'utf8',
      input: '',
      env: { ...process.env, AETHER_DATA_DIR: tempDir(t, 'aether-data-') },
    })
    usageCache.set(command, `${r.stdout}${r.stderr}`)
  }
  return usageCache.get(command)
}

// The section of a text: from its heading to the next heading of level 2.
function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}\n`)
  assert.ok(start >= 0, `the bootstrap has the section ${heading}`)
  const rest = text.slice(start + 1)
  const end = rest.indexOf('\n## ', 1)
  return end < 0 ? rest : rest.slice(0, end)
}

// The rows of the Models table: model name, the two prices, and the maker's quote without its quote marks.
function rubric(context) {
  const rows = new Map()
  for (const line of section(context, 'Models').split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    const name = /^(Haiku|Sonnet|Opus|Fable) \d/.exec(cells[1] || '')
    if (!name) continue
    const price = /^([\d.]+) \/ ([\d.]+)$/.exec(cells[2])
    assert.ok(price, `the price cell of ${name[1]} is "input / output": ${cells[2]}`)
    const quote = /^["“](.+?)["”]$/.exec(cells[4])
    assert.ok(quote, `the "Its maker says" cell of ${name[1]} is a quote: ${cells[4]}`)
    rows.set(name[1], { input: Number(price[1]), output: Number(price[2]), quote: quote[1] })
  }
  return rows
}

const modelsIndex = () => json('config', 'models', 'models.json')

test('every aether-<x> command the bootstrap and the swarm skill name is an executable of bin/', (t) => {
  for (const [name, text] of sources(t)) {
    const commands = new Set([...text.matchAll(/(?<![\w-])aether-[a-z][a-z-]*/g)].map((m) => m[0].replace(/-+$/, '')))
    assert.ok(commands.size >= 4, `${name} names commands`)
    for (const command of commands) {
      if (NOT_COMMANDS.has(command)) continue
      const file = path.join(PLUGIN, 'bin', command)
      assert.ok(fs.existsSync(file), `${name}: ${command} is a file of bin/`)
      assert.ok(fs.statSync(file).mode & 0o111, `${name}: ${command} is executable`)
    }
  }
})

test('every subcommand shown in code appears in the usage its command prints with no arguments', (t) => {
  for (const [name, text] of sources(t)) {
    const pairs = new Set()
    for (const snippet of codeSnippets(text)) {
      for (const m of snippet.matchAll(/(?<![\w-])(aether-[a-z][a-z-]*) (--[a-z][a-z-]*|[a-z][a-z-]*)(?![\w-])/g)) {
        if (!NOT_COMMANDS.has(m[1])) pairs.add(`${m[1]} ${m[2]}`)
      }
    }
    assert.ok(pairs.size >= 3, `${name} shows subcommands`)
    for (const pair of pairs) {
      const [command, sub] = pair.split(' ')
      const escaped = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      assert.match(usage(t, command), new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`), `${name}: "${pair}" is in the usage of ${command}`)
    }
  }
})

test('every aether:<name> is an agent, a skill or the run workflow', (t) => {
  for (const [name, text] of sources(t)) {
    const names = new Set([...text.matchAll(/(?<![\w-])aether:([a-z][a-z-]*)/g)].map((m) => m[1]))
    assert.ok(names.size >= 2, `${name} names agents or skills`)
    for (const n of names) {
      const found =
        fs.existsSync(path.join(PLUGIN, 'agents', `${n}.md`)) ||
        fs.existsSync(path.join(PLUGIN, 'skills', n, 'SKILL.md')) ||
        (n === 'run' && fs.existsSync(path.join(PLUGIN, 'workflows', 'run.workflow.js')))
      assert.ok(found, `${name}: aether:${n} is an agent, a skill or the workflow run`)
    }
  }
})

test('the injected context has no ${CLAUDE_PLUGIN_ROOT}, and every path of the plugin it names exists', (t) => {
  const context = injectedContext(t)
  assert.ok(!context.includes(PLACEHOLDER), 'the hook resolved ${CLAUDE_PLUGIN_ROOT}')
  const escaped = PLUGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const named = []
  for (const [name, text] of [['the injected context', context], ['the swarm skill', resolvedSwarm()]]) {
    for (const m of text.matchAll(new RegExp(`${escaped}(/[\\w./@-]*)?`, 'g'))) {
      const file = m[0].replace(/[.-]+$/, '')
      if (RUN_FILES.test(path.basename(file))) continue
      named.push([name, file])
    }
  }
  const files = new Set(named.map(([, file]) => file))
  for (const needed of ['config/models/models.json', 'config/prices.json', 'config/lanes.json']) {
    assert.ok(files.has(path.join(PLUGIN, needed)), `the plugin's ${needed} is named`)
  }
  for (const [name, file] of named) assert.ok(fs.existsSync(file), `${name} names ${file}, which does not exist`)
})

test('the models index named by the bootstrap parses, with a non-empty list of models', () => {
  const index = modelsIndex()
  assert.ok(Array.isArray(index.models) && index.models.length > 0, 'models is a non-empty list')
})

test('the rubric prices of Haiku, Sonnet and Opus are the ones of config/prices.json', (t) => {
  const rows = rubric(injectedContext(t))
  const prices = json('config', 'prices.json').models
  for (const [row, key] of [['Haiku', 'haiku'], ['Sonnet', 'sonnet'], ['Opus', 'opus']]) {
    assert.ok(rows.has(row), `the rubric has a row for ${row}`)
    assert.deepEqual({ input: rows.get(row).input, output: rows.get(row).output }, { input: prices[key].input, output: prices[key].output }, row)
  }
})

test('the rubric price of Fable 5.1 is the one of its excluded entry in the models index', (t) => {
  const row = rubric(injectedContext(t)).get('Fable')
  assert.ok(row, 'the rubric has a row for Fable')
  const entry = (modelsIndex().excluded || []).find((e) => e.model === 'claude-fable-5-1')
  assert.ok(entry, 'the index excludes claude-fable-5-1')
  const price = entry.price || (entry.profile && entry.profile.price) || (entry.scores || []).map((s) => ({ input: s.priceInput, output: s.priceOutput })).find((p) => p.input !== undefined)
  assert.ok(price, 'the excluded entry has a price')
  assert.deepEqual({ input: row.input, output: row.output }, { input: price.input, output: price.output })
})

test("each rubric quote is contained, ignoring case, in the purpose of its model's profile in the models index", (t) => {
  const rows = rubric(injectedContext(t))
  assert.deepEqual([...rows.keys()].sort(), ['Fable', 'Haiku', 'Opus', 'Sonnet'])
  const index = modelsIndex()
  const entries = {
    Haiku: index.models.find((e) => e.harness === 'claude' && (e.alias === 'haiku' || e.model === 'claude-haiku-5-5')),
    Sonnet: index.models.find((e) => e.harness === 'claude' && (e.alias === 'sonnet' || e.model === 'claude-sonnet-5-5')),
    Opus: index.models.find((e) => e.harness === 'claude' && (e.alias === 'opus' || e.model === 'claude-opus-5-5')),
    Fable: (index.excluded || []).find((e) => e.model === 'claude-fable-5-1'),
  }
  for (const [name, row] of rows) {
    assert.ok(entries[name], `the index has the entry of ${name}`)
    const purpose = entries[name].profile.purpose
    assert.ok(purpose.toLowerCase().includes(row.quote.toLowerCase()), `the purpose of ${name} contains its quote "${row.quote}": ${purpose}`)
  }
})

test('the first 1,800 characters of the injected context carry the order to read it whole, the three paths and the model rule', (t) => {
  const opening = injectedContext(t).slice(0, 1800)
  for (const text of ['Read this whole bootstrap before you act', 'Direct', 'Delegate task', 'Swarm', 'model']) {
    assert.ok(opening.includes(text), `the opening has "${text}"`)
  }
})

test('the bootstrap has The three paths and Models after the route, and the paths name the plan sizes', (t) => {
  const context = injectedContext(t)
  const order = ['## The route by size and risk', '## The three paths', '## Models', '## Writing and judging'].map((h) => context.indexOf(`\n${h}\n`))
  assert.ok(order.every((at) => at >= 0), 'the four sections are there')
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  const paths = section(context, 'The three paths')
  assert.match(paths, /an approved plan of three or more tasks/)
  assert.match(paths, /one or two tasks/)
  assert.match(section(context, 'Models'), /pass `model` and `effort`/)
})

test('the sources of the bootstrap and the swarm skill name no path of this repository', () => {
  for (const [name, text] of [['using-aether', USING_SOURCE], ['swarm', SWARM_SOURCE]]) {
    assert.ok(!text.includes('plugins/aether/'), `${name}/SKILL.md names plugins/aether/: a Lead in another project has no such path`)
  }
})

test("the model the bootstrap says the Lead starts on is the model of the Lead agent", (t) => {
  const started = /You start on (\w+)/.exec(injectedContext(t))
  assert.ok(started, 'the bootstrap says what the Lead starts on')
  const lead = /^model: (\S+)$/m.exec(read('agents', 'lead.md'))
  assert.ok(lead, 'agents/lead.md has a model')
  assert.equal(started[1].toLowerCase(), lead[1].toLowerCase())
})
