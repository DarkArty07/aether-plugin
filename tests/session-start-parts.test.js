'use strict'

// The Lead's bootstrap in parts (issue #139): Claude Code delivers a hook's output whole only up to 10,000 characters,
// so hooks/hooks.json runs aether-session-start once for the notes and once per part, and each part's whole output
// stays within 9,800 characters.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, SESSION_COMMANDS, PART_COMMANDS, LEAD_START, makeRepo, tempDir, runSessionStart, partHeading, leadParts } = require('./helpers.js')
const { PART_LIMIT, bootstrapParts, splitParts } = require('../plugins/aether/lib/session-start.js')

const ENV_LINES = 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n'

// The hook's environment, without what a surrounding session may have set.
function hookEnv(data, extra = {}) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of Object.keys(env)) if (/^(CLAUDE_PLUGIN_OPTION_|AETHER_SUPERDELEGATION)/.test(key)) delete env[key]
  for (const key of ['CLAUDE_ENV_FILE', 'LC_ALL', 'LC_MESSAGES', 'LANG']) delete env[key]
  return { ...env, ...extra }
}

// The bootstrap as the skill holds it: no front matter, ${CLAUDE_PLUGIN_ROOT} replaced by root. Written here again on
// purpose, so that the parts are checked against the source and not against the code that splits it.
function source(root) {
  const raw = fs.readFileSync(path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim().split('${CLAUDE_PLUGIN_ROOT}').join(root)
}

// The offsets where a line starting with "## " begins.
const headingStarts = (text) => [...text.matchAll(/^## /gm)].map((m) => m.index).filter((at) => at > 0)

test('(a) each part, as the whole output of its command, is at most 9,800 characters, and the parts give back the bootstrap in order', (t) => {
  assert.equal(PART_LIMIT, 9800)
  const parts = leadParts(makeRepo(t).dir, hookEnv(tempDir(t, 'aether-data-')))
  assert.ok(parts.contexts.length >= 2, 'the bootstrap goes in more than one part')
  for (const [i, out] of parts.outputs.entries()) assert.ok(out.length <= 9800, `part ${i + 1} prints ${out.length} characters`)
  // The heading counts against the limit: each output is the JSON of its heading and its slice, nothing else.
  const n = parts.contexts.length
  for (const [i, part] of bootstrapParts(PLUGIN).entries()) {
    assert.equal(part.heading, partHeading(i + 1, n, PLUGIN))
    assert.equal(part.output.length, JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: part.heading + part.slice } }).length + 1)
    assert.equal(part.output, parts.outputs[i])
  }
  // Not a byte lost, repeated or moved.
  assert.equal(parts.bootstrap, source(PLUGIN))
  // Each cut falls just before a "## " line, and the blank line before that heading ends the part before it.
  const slices = bootstrapParts(PLUGIN).map((part) => part.slice)
  for (const [i, slice] of slices.entries()) {
    if (i > 0) assert.ok(slice.startsWith('## '), `part ${i + 1} starts with a section heading: ${slice.slice(0, 40)}`)
    if (i < slices.length - 1) assert.ok(slice.endsWith('\n\n'), `part ${i + 1} ends with the blank line before the next heading`)
  }
})

test('(b) a session that is not the Lead gets nothing from any of the six commands', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const inputs = [{ ...LEAD_START, agent_type: undefined }, { ...LEAD_START, agent_type: 'Explore' }, { ...LEAD_START, agent_type: 'general-purpose' }, 'not json', '']
  assert.equal(SESSION_COMMANDS.length, 6)
  for (const args of SESSION_COMMANDS) {
    for (const input of inputs) {
      const r = runSessionStart(repo.dir, hookEnv(data, { CLAUDE_ENV_FILE: envFile }), input, args)
      assert.equal(r.status, 0, r.stderr)
      assert.equal(r.stdout, '', `${args.join(' ')} ${JSON.stringify(input)}`)
      assert.equal(r.stderr, '', `${args.join(' ')} ${JSON.stringify(input)}`)
    }
  }
  assert.deepEqual(fs.readdirSync(data), [])
  assert.equal(fs.existsSync(envFile), false)
})

test('(c) a part command neither marks the session nor writes the environment file; the notes command does both, once', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const env = hookEnv(data, { CLAUDE_ENV_FILE: envFile })
  for (const source of ['startup', 'clear', 'compact', 'resume']) {
    for (const args of PART_COMMANDS) assert.equal(runSessionStart(repo.dir, env, { ...LEAD_START, source }, args).status, 0)
  }
  assert.deepEqual(fs.readdirSync(data), [])
  assert.equal(fs.existsSync(envFile), false)
  // The six commands of one start, the way hooks/hooks.json runs them.
  for (const args of SESSION_COMMANDS) assert.equal(runSessionStart(repo.dir, env, LEAD_START, args).status, 0)
  assert.equal(fs.readFileSync(envFile, 'utf8'), ENV_LINES)
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.json'), 'utf8')).session, 's1')
})

test('(d) the bootstrap needs five parts or fewer, also from a long plugin path, and hooks.json runs enough of them', (t) => {
  const parts = bootstrapParts(PLUGIN)
  assert.ok(parts.length <= 5, `the bootstrap needs ${parts.length} parts`)
  assert.equal(leadParts(makeRepo(t).dir, hookEnv(tempDir(t, 'aether-data-'))).contexts.length, parts.length)
  // An installed plugin lives deeper than a checkout, and every heading names its folder: a folder of 200 or of 400
  // characters still fits in five parts of at most 9,800 characters that give the bootstrap back.
  for (const size of [200, 400]) {
    const deep = '/' + 'd'.repeat(size - 1)
    const far = splitParts(source(deep), deep)
    assert.ok(far.length <= 5, `from a ${size}-character folder the bootstrap needs ${far.length} parts`)
    for (const part of far) assert.ok(part.output.length <= 9800, `from a ${size}-character folder a part prints ${part.output.length} characters`)
    assert.equal(far.map((part) => part.slice).join(''), source(deep))
    for (const [i, part] of far.entries()) assert.equal(part.heading, partHeading(i + 1, far.length, deep))
  }
  assert.ok(PART_COMMANDS.length >= parts.length)
})

test('(e) hooks.json runs the notes command and parts 1 to 5 in one SessionStart entry, with one matcher', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks.SessionStart
  assert.equal(entries.length, 1)
  assert.equal(entries[0].matcher, 'startup|resume|clear|compact')
  const bin = 'node "${CLAUDE_PLUGIN_ROOT}/bin/aether-session-start"'
  assert.deepEqual(
    entries[0].hooks.map((hook) => [hook.type, hook.command]),
    [bin, `${bin} --part 1`, `${bin} --part 2`, `${bin} --part 3`, `${bin} --part 4`, `${bin} --part 5`].map((command) => ['command', command]),
  )
})

test('(f) a whole section that fits in a part is never split, and only a section too long for any part is cut at its blank lines', () => {
  const section = (title, ...paragraphs) => `## ${title}\n\n${paragraphs.map((size) => 'x'.repeat(size) + '\n\n').join('')}`
  const text = ('# Top\n\n' + section('A', 2000) + section('B', 2000) + section('C', 4000) + section('D', 3000, 3000, 3000) + section('E', 300)).trim()
  const limit = 5000
  const parts = splitParts(text, '/p', limit)
  assert.equal(parts.map((part) => part.slice).join(''), text)
  for (const part of parts) assert.ok(part.output.length <= limit, part.output.length)
  // A and B fit together; C does not fit with them, so it opens a part of its own; D is longer than any part, so it is
  // cut, at its blank lines only; E goes with the end of D.
  assert.equal(parts[0].slice, '# Top\n\n' + section('A', 2000) + section('B', 2000))
  assert.equal(parts[1].slice, section('C', 4000))
  assert.deepEqual(parts.slice(2).map((part) => part.slice), [`## D\n\n${'x'.repeat(3000)}\n\n`, `${'x'.repeat(3000)}\n\n`, `${'x'.repeat(3000)}\n\n## E\n\n${'x'.repeat(300)}`])
  // On the real bootstrap: every section whose part of its own fits lies whole in one part, no cut inside it.
  const text2 = source(PLUGIN)
  const starts = [0, ...headingStarts(text2), text2.length]
  const cuts = []
  let at = 0
  for (const part of bootstrapParts(PLUGIN)) cuts.push((at += part.slice.length))
  for (let i = 0; i < starts.length - 1; i += 1) {
    const [from, to] = [starts[i], starts[i + 1]]
    assert.equal(splitParts(text2.slice(from, to), PLUGIN).length, 1, `the section at ${from} fits in a part of its own`)
    assert.ok(!cuts.some((cut) => cut > from && cut < to), `the section at ${from} is not split`)
  }
})

test('(g) the notes command with no notes prints the context "Aether mode is active." and nothing else', (t) => {
  const repo = makeRepo(t)
  const env = hookEnv(tempDir(t, 'aether-data-'), { CLAUDE_ENV_FILE: path.join(tempDir(t), 'env.sh') })
  for (const source of ['clear', 'compact']) {
    const r = runSessionStart(repo.dir, env, { ...LEAD_START, source })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Aether mode is active.' } })
  }
  const r = runSessionStart(repo.dir, env, LEAD_START)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.additionalContext, 'Aether mode is active.')
  assert.match(out.systemMessage, /Lead ready/)
})

test('(h) every part opens with the same one-line heading, which says to read the whole rules file when a part is missing', (t) => {
  const parts = leadParts(makeRepo(t).dir, hookEnv(tempDir(t, 'aether-data-')))
  const n = parts.contexts.length
  const file = path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md')
  assert.ok(fs.existsSync(file))
  for (const [i, context] of parts.contexts.entries()) {
    const heading = partHeading(i + 1, n, PLUGIN)
    assert.ok(context.startsWith(heading), `part ${i + 1}: ${context.slice(0, 120)}`)
    assert.equal(heading, `Aether mode, part ${i + 1} of ${n}. If a part from 1 to ${n} did not reach you, read the whole file ${file} before you act.\n\n`)
    assert.equal(heading.trimEnd().includes('\n'), false, 'the heading is one line')
  }
  // The heading names the folder the hook was given, not the one the code lives in.
  const other = path.join(tempDir(t), 'plugin')
  fs.cpSync(PLUGIN, other, { recursive: true, filter: (from) => !/node_modules|\.git$/.test(from) })
  const moved = leadParts(makeRepo(t).dir, { ...hookEnv(tempDir(t, 'aether-data-')), CLAUDE_PLUGIN_ROOT: other })
  assert.ok(moved.contexts[0].includes(path.join(other, 'skills', 'using-aether', 'SKILL.md')))
  assert.ok(!moved.contexts[0].startsWith(partHeading(1, moved.contexts.length, PLUGIN)))
})

test('a part command with a part that does not exist, or a bad argument, prints nothing', (t) => {
  const repo = makeRepo(t)
  const env = hookEnv(tempDir(t, 'aether-data-'))
  for (const args of [['--part', '9'], ['--part', '0'], ['--part', 'x'], ['--part'], ['--other', '1']]) {
    const r = runSessionStart(repo.dir, env, LEAD_START, args)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', args.join(' '))
  }
})
