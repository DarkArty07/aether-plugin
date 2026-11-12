'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
// Kept by name (R19 b): the whole of aether-report, the hook entry points, and the verb hook of aether-observe.
const BY_NAME = new Set(['aether-report', 'aether-guard', 'aether-session-start', 'aether-observe hook'])
// Internal verbs: launched in a process of their own by a verb that stays (the caller is that verb).
const INTERNAL = { 'aether-lane _runner': 'aether-lane start', 'aether-lane _seat': 'aether-lane seat-start', 'aether-delegate run': 'aether-delegate start', 'aether-delegate renew': 'aether-delegate begin', 'aether-observe file-issues': 'aether-observe hook' }

function files(dir, keep) {
  return execFileSync('git', ['ls-files', dir], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && keep(f))
}
const CALLERS = [
  ...files('plugins/aether/workflows', (f) => f.endsWith('.js')),
  ...files('plugins/aether/hooks', (f) => /\.(js|mjs|json)$/.test(f) && !/\.test\./.test(f)),
  ...files('plugins/aether/skills', () => true),
  ...files('plugins/aether/agents', () => true),
  ...files('scripts', () => true),
]
function callerTextOf(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}
const callerText = CALLERS.map(callerTextOf).join('\n')

// One file of the closed list. A verb counts only when that file names it next to its bin, or quoted inside a literal array of verbs in a file that also names the bin.
function concreteCaller(bin, verb) {
  const near = new RegExp(`${bin}[^\\n]{0,80}\\b${verb}\\b`)
  const inArray = new RegExp(`\\[[^\\]]*['"\`]${verb}['"\`][^\\]]*\\]`)
  const namesBin = new RegExp(`\\b${bin}\\b`)
  return CALLERS.find((file) => {
    const text = callerTextOf(file)
    return near.test(text) || (namesBin.test(text) && inArray.test(text))
  })
}

function headerOf(bin, body = fs.readFileSync(path.join(PLUGIN, 'bin', bin), 'utf8')) {
  return body.split('\n').slice(0, 60).join('\n')
}

// `body` is the text of the bin; a test passes a sample text of its own, so that it does not depend on the verbs this task removes from the real file.
function verbsOf(bin, body = fs.readFileSync(path.join(PLUGIN, 'bin', bin), 'utf8')) {
  const token = '[_a-z][a-z-]*'
  const verbs = new Set()
  const dispatch = new Set()
  for (const hit of body.matchAll(new RegExp(`(?:\\bverb\\b|argv\\[0\\])\\s*===\\s*['"\`](${token})['"\`]`, 'g'))) dispatch.add(hit[1])
  // Keys of `const COMMANDS = { … }` only: a word after `{` or `,`, not a word inside a usage string (`|harness:model`).
  for (const table of body.matchAll(/const COMMANDS = \{([^}]*)\}/g)) {
    for (const key of table[1].matchAll(new RegExp(`(?:^|[{,])\\s*(${token})\\s*:`, 'g'))) dispatch.add(key[1])
  }
  for (const line of headerOf(bin, body).split('\n')) {
    const m = line.match(new RegExp(`^//\\s+${bin}\\s+(.*)$`))
    if (!m) continue
    const parts = m[1].split('|')
    const first = parts[0].trim().match(new RegExp(`^(${token})\\b`))
    if (first) verbs.add(first[1])
    for (const part of parts.slice(1)) {
      const verb = part.trim().match(new RegExp(`^(${token})\\b`))
      if (verb && dispatch.has(verb[1])) verbs.add(verb[1])
    }
  }
  for (const verb of dispatch) verbs.add(verb)
  return [...verbs]
}

test('every bin has a caller of the closed list, or is kept by name', () => {
  for (const bin of fs.readdirSync(path.join(PLUGIN, 'bin'))) {
    assert.ok(BY_NAME.has(bin) || new RegExp(`\\b${bin}\\b`).test(callerText), `${bin} has no caller`)
  }
})

test('every verb of every bin has a concrete caller of the closed list, is kept by name, or is internal to a verb that stays', () => {
  for (const bin of fs.readdirSync(path.join(PLUGIN, 'bin'))) {
    if (BY_NAME.has(bin)) continue
    for (const verb of verbsOf(bin)) {
      const name = `${bin} ${verb}`
      if (BY_NAME.has(name)) continue
      if (INTERNAL[name]) {
        const launchVerb = INTERNAL[name].split(' ')[1]
        assert.match(headerOf(bin), new RegExp(`^//\\s+${bin}\\s+${launchVerb}\\b`, 'm'), `${name}: ${launchVerb} is not in the same usage header`)
        assert.ok(concreteCaller(bin, launchVerb), `${name}: ${INTERNAL[name]} has no concrete caller`)
        continue
      }
      assert.ok(concreteCaller(bin, verb), `${name} has no concrete caller`)
    }
  }
})

test('a verb nobody writes next to its bin or in a verb array has no concrete caller', () => {
  assert.equal(concreteCaller('aether-lane', 'no-such-verb'), undefined)
})

test('aether-delegate verdict --from-scratch stays (the Lead uses it by its rules)', () => {
  assert.match(fs.readFileSync(path.join(PLUGIN, 'bin', 'aether-delegate'), 'utf8'), /--from-scratch/)
})

test('scripts/aether-lead stays', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'aether-lead')))
})

test('a pipe-separated usage line yields every verb, crossed with the dispatch branches', () => {
  // A sample text, not the real bin: this task itself removes read, baseline, status and forget from plugins/aether/bin/aether-observe.
  const sample = [
    '// aether-observe hook | read | baseline [--from <dir>] | status | forget [--yes]',
    "if (verb === 'hook') {}",
    "if (verb === 'read') {}",
    "if (verb === 'baseline') {}",
    "if (verb === 'status') {}",
    "if (verb === 'forget') {}",
  ].join('\n')
  assert.deepEqual([...verbsOf('aether-observe', sample)].sort(), ['baseline', 'forget', 'hook', 'read', 'status'])
})
