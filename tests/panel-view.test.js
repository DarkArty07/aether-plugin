'use strict'

// The model side of the /harnesses panel (hooks/panel-view.mjs): the options, the cells a text takes, the cleaning of
// outside text, and the two documents it reads, with the real output of the bins (tests/fixtures/panel/). What the
// pane says is tests/panel-layout.test.js, and the pane itself is hooks/panel.test.tsx.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MODULE = path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'panel-view.mjs')
const FIXTURES = path.join(__dirname, 'fixtures', 'panel')

let view
test.before(async () => {
  view = await import(MODULE)
})

const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')
const printed = (name) => ({ exitCode: 0, stdout: fixture(name), stderr: '' })
const out = (value) => ({ exitCode: 0, stdout: `${JSON.stringify(value)}\n`, stderr: '' })
// Characters the source of this file does not hold literally.
const ch = (...codes) => String.fromCharCode(...codes)

test('a bar fills the share it is given, and is full or empty only when the share is', () => {
  assert.equal(view.bar(0.5, 10), '█████░░░░░')
  assert.equal(view.bar(1, 4), '████')
  assert.equal(view.bar(0, 4), '░░░░')
  assert.equal(view.bar(0.99, 20), `${'█'.repeat(19)}░`)
  assert.equal(view.bar(0.01, 20), `█${'░'.repeat(19)}`)
  assert.equal(view.bar(null, 5), '░░░░░')
  assert.equal(view.bar(7, 3), '███')
  assert.equal(view.bar(-1, 3), '░░░')
  assert.equal(view.bar(0.5, 0), '')
})

test('the width of a text is in cells: CJK and emoji take two, combining marks and zero-width characters none', () => {
  assert.equal(view.cells('abc'), 3)
  assert.equal(view.cells('█░ · … — ↓'), 10, 'the block glyphs and the dot, the ellipsis and the dash are one cell each')
  assert.equal(view.cells('日本語'), 6)
  assert.equal(view.cells('한국어'), 6)
  assert.equal(view.cells('ＡＢ'), 4, 'full-width forms')
  assert.equal(view.cells(String.fromCodePoint(0x1f600)), 2)
  assert.equal(view.cells(String.fromCodePoint(0x1f916)), 2)
  assert.equal(view.cells(String.fromCodePoint(0x20bb7)), 2)
  assert.equal(view.cells(`e${ch(0x301)}`), 1, 'a combining accent adds nothing')
  assert.equal(view.cells(`a${ch(0x200b)}b${ch(0xfe0f)}`), 2)
  assert.equal(view.cells(''), 0)
})

test('clip cuts to the width in cells with an ellipsis, never through a wide character, and leaves what fits', () => {
  assert.equal(view.clip('abcdef', 6), 'abcdef')
  assert.equal(view.clip('abcdefg', 6), 'abcde…')
  assert.equal(view.clip('abc', 1), '…')
  assert.equal(view.clip('abc', 0), '')
  assert.equal(view.clip('█████', 3), '██…')
  assert.equal(view.clip('日本語', 6), '日本語')
  assert.equal(view.clip('日本語テキスト', 6), '日本…')
  assert.equal(view.clip('日本語テキスト', 5), '日本…')
  assert.equal(view.clip('日本語', 2), '…')
  for (const to of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(view.cells(view.clip('日本語テキスト and more', to)) <= to, `to ${to}`)
  assert.equal(view.padRight('日本', 6), '日本  ')
  assert.equal(view.padLeft('日本', 6), '  日本')
})

test('clean makes one safe line of an outside text: controls, bidi and zero-width characters go, white space collapses', () => {
  const esc = ch(0x1b)
  assert.equal(view.clean(`paint ${esc}[31mRED${esc}[0m`), 'paint [31mRED[0m')
  for (const code of [0x00, 0x07, 0x08, 0x7f, 0x80, 0x9b, 0x9f]) assert.equal(view.clean(`a${ch(code)}b`), 'ab', `U+${code.toString(16)}`)
  for (const code of [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff]) {
    assert.equal(view.clean(`a${ch(code)}b`), 'ab', `U+${code.toString(16)}`)
  }
  assert.equal(view.clean('  a \t b\r\nc\u000bd\u000ce  '), 'a b c d e')
  assert.equal(view.clean(`a${ch(0x2028)}b${ch(0x2029)}c`), 'a b c')
  assert.equal(view.clean(`x${ch(0xd800)}y`), `x${ch(0xfffd)}y`, 'a lone high surrogate')
  assert.equal(view.clean(`x${ch(0xdc00)}y`), `x${ch(0xfffd)}y`, 'a lone low surrogate')
  assert.equal(view.clean(`x${String.fromCodePoint(0x1f600)}y`), `x${String.fromCodePoint(0x1f600)}y`, 'a pair is kept')
  assert.equal(view.clean(undefined), '')
  assert.equal(view.clean(42), '')
  assert.equal(view.clean(null), '')
  // scrub keeps the padding that clean would trim.
  assert.equal(view.scrub(`  a${ch(0x1b)}  `), '  a  ')
})

test('the options are the ones the session uses: a value the libs would not take shows as the one they would', () => {
  assert.deepEqual(view.settingsOf({}), { lanes: false, router: 'record', decider: 'haiku', seats: 'balanced', harnesses: ['agy'] })
  assert.deepEqual(view.settingsOf(undefined).harnesses, ['agy'])
  assert.deepEqual(view.settingsOf({ lanes: true, router: 'command', decider: 'jev', seats: 'robust', harnesses: 'agy,grok' }), { lanes: true, router: 'command', decider: 'jev', seats: 'robust', harnesses: ['agy', 'grok'] })
  // Wrong case or padded: the router and the decider are taken as they are, so they fall back; the seats and the harnesses are trimmed and lower-cased.
  assert.deepEqual(view.settingsOf({ router: 'Command', decider: 'JEV', seats: 'Robust', harnesses: 'gork' }), { lanes: false, router: 'record', decider: 'haiku', seats: 'robust', harnesses: ['agy'] })
  assert.equal(view.settingsOf({ router: ' command' }).router, 'record')
  assert.equal(view.settingsOf({ seats: ' NATIVE ' }).seats, 'native')
  assert.equal(view.settingsOf({ seats: 'fast' }).seats, 'balanced')
  assert.deepEqual(view.settingsOf({ harnesses: ' Grok,AGY,grok, cursor ,gork' }).harnesses, ['grok', 'agy', 'cursor'], 'known names only, once each, in order')
  assert.deepEqual(view.settingsOf({ harnesses: ['codex', 'x'] }).harnesses, ['codex'])
  assert.deepEqual(view.settingsOf({ harnesses: '' }).harnesses, ['agy'], 'agy alone when none is given')
  assert.deepEqual(view.settingsOf({ harnesses: 'x,y' }).harnesses, ['agy'], 'agy alone when none is valid')
  assert.equal(view.settingsOf({ lanes: true }).lanes, true)
  assert.equal(view.settingsOf({ lanes: 'true' }).lanes, true)
  for (const lanes of [false, 'false', 'TRUE', 'on', 1, 'yes', undefined, null]) assert.equal(view.settingsOf({ lanes }).lanes, false, String(lanes))
  assert.equal(view.settingsOf({ router: 7, decider: ['jev'], seats: {} }).router, 'record')
})

test('times are written as hours, ages and UTC dates', () => {
  assert.equal(view.resetText(168), 'resets in 168 h')
  assert.equal(view.resetText(147.2), 'resets in 147 h')
  assert.equal(view.resetText(7.7), 'resets in 7.7 h')
  assert.equal(view.resetText(5), 'resets in 5 h')
  assert.equal(view.resetText(0.02), 'resets in <0.1 h')
  assert.equal(view.resetText(-3), 'reset 3 h ago')
  assert.equal(view.resetText(null), 'reset unknown')
  assert.equal(view.hoursShort(147.2), '147 h')
  assert.equal(view.hoursShort(6.9), '6.9 h')
  assert.equal(view.hoursShort(-3), '3 h ago')
  assert.equal(view.hoursShort(undefined), '?')
  assert.equal(view.ageText(0), 'just now')
  assert.equal(view.ageText(7), '7 min ago')
  assert.equal(view.ageText(517), '9 h ago')
  assert.equal(view.ageText(60 * 72), '3 d ago')
  assert.equal(view.ageText(undefined), '')
  assert.equal(view.dateText(1792274919300), 'Oct 17 22:08 UTC')
  assert.equal(view.dateText(Number.NaN), null)
  assert.equal(view.versionOf('grok 1.0.60 (01a8e1c591c0) [stable]'), '1.0.60')
  assert.equal(view.versionOf('codex-cli 0.162.1'), '0.162.1')
  assert.equal(view.versionOf('2026.09.28-64d2043'), '2026.09.28-64d2043')
  assert.equal(view.versionOf('unversioned'), 'unversioned')
  assert.equal(view.versionOf(null), '')
  assert.equal(view.versionOf(`1.2.3${ch(0x1b)}[31m`), '1.2.3')
})

test('a bin that fails, is stopped, is cut or prints no JSON is one clean error line, never a throw', () => {
  const failures = [
    [undefined, /gave no result/],
    [{ failed: 'aether-lane did not answer in 75 s' }, /did not answer in 75 s/],
    [{ exitCode: 1, stdout: '{"error":"no lane table"}\n', stderr: '' }, /^no lane table$/],
    [{ exitCode: 2, stdout: '', stderr: 'boom\nSyntaxError: bad token\n' }, /exited 2: SyntaxError: bad token/],
    [{ exitCode: 0, stdout: '', stderr: '' }, /printed nothing/],
    [{ exitCode: 0, stdout: 'not json\n', stderr: '' }, /printed no JSON/],
    [{ exitCode: 0, stdout: '[1,2]\n', stderr: '' }, /printed no JSON/],
    [{ exitCode: 0, stdout: '{"time":1', stderr: '' }, /printed no JSON/],
    [{ exitCode: 0, stdout: `{"delegations":[${'{"time":1},'.repeat(100)}`, stderr: '', isStdoutTruncated: true }, /printed over 4 MiB, too long to read/],
  ]
  for (const [result, pattern] of failures) {
    for (const parse of [(r) => view.parseHarness(r, 'agy'), view.parseDelegates]) {
      const parsed = parse(result)
      assert.equal(parsed.ok, false, JSON.stringify(result))
      assert.match(parsed.error, pattern)
      assert.doesNotMatch(parsed.error, /[\n\r\t]/)
    }
  }
  const noisy = view.parseHarness({ exitCode: 1, stdout: '', stderr: `\n${ch(0x1b)}[31mfatal${ch(0x7)}: no\n\n` }, 'agy')
  assert.equal(noisy.error, 'aether-lane quota exited 1: [31mfatal: no')
  assert.equal(view.parseHarness(out({ time: 'x' }), 'agy').ok, false, 'a document with no harnesses is no quota')
  assert.equal(view.parseHarness(out({ harnesses: { grok: {} } }), 'agy').error, 'aether-lane quota gave no agy entry')
  assert.equal(view.parseDelegates(out({ totals: {} })).ok, false, 'a document with no delegations is no report')
})

test('the real output of the bins reads: agy, codex, grok and cursor, each as the bin printed it for that name', () => {
  const agy = view.parseHarness(printed('quota-agy.json'), 'agy')
  assert.equal(agy.ok, true)
  assert.equal(agy.value.reserve, 0.05)
  const harness = agy.value.harness
  assert.deepEqual([harness.installed, harness.version, harness.error], [true, '1.4.0', null])
  assert.deepEqual(harness.groups.map((g) => [g.key, g.label]), [['gemini', 'Gemini Models'], ['claude', 'Claude and GPT models']])
  const [gemini, claude] = harness.groups
  assert.deepEqual(gemini.windows.map((w) => [w.name, w.remaining]), [['weekly', 1], ['5h', 1]])
  assert.equal(typeof gemini.mark.until, 'number', 'the mark has its end in ms')
  assert.equal(claude.mark, null)
  assert.equal(claude.usable, true)
  assert.ok(Math.abs(claude.windows[0].remaining - 0.329) < 0.001)
  assert.deepEqual(gemini.source, { ageMinutes: 0, stale: false })

  const codex = view.parseHarness(printed('quota-codex.json'), 'codex').value.harness
  assert.deepEqual([codex.version, codex.groups[0].unknown, codex.groups[0].windows, codex.groups[0].source], ['0.162.1', true, [], null])
  const grok = view.parseHarness(printed('quota-grok.json'), 'grok').value.harness
  assert.deepEqual([grok.version, grok.groups[0].label, grok.groups[0].windows.length], ['1.0.60', 'Grok plan', 1])
  assert.equal(grok.groups[0].source.stale, false)
  const refreshed = view.parseHarness(printed('quota-grok-refresh.json'), 'grok').value.harness
  assert.equal(refreshed.groups[0].source.ageMinutes, 0)
  const cursor = view.parseHarness(printed('quota-cursor.json'), 'cursor').value.harness
  assert.equal(cursor.version, '2026.09.28-64d2043')
})

test('asked for by name, a harness whose CLI is missing is listed as not installed, which is how an enabled one is found', () => {
  const missing = JSON.parse(fixture('quota-missing.json'))
  assert.deepEqual(Object.keys(missing.harnesses), ['agy', 'grok', 'codex', 'cursor'], 'the real output lists the four it was asked for')
  for (const name of ['agy', 'grok', 'codex', 'cursor']) {
    const parsed = view.parseHarness(out({ ...missing, harnesses: { [name]: missing.harnesses[name] } }), name)
    assert.equal(parsed.ok, true, name)
    assert.deepEqual([parsed.value.harness.installed, parsed.value.harness.groups, parsed.value.harness.version], [false, [], ''], name)
  }
})

test('a harness the lane table does not know comes back with an error and no groups, and is not installed', () => {
  const parsed = view.parseHarness(out({ reserve: 0.05, harnesses: { agy: { error: 'the lane table has no agy harness', groups: {} } } }), 'agy')
  assert.equal(parsed.ok, true)
  assert.deepEqual([parsed.value.harness.installed, parsed.value.harness.error], [false, 'the lane table has no agy harness'])
})

test('everything outside that reaches a part is cleaned when it is parsed', () => {
  const dirty = (text) => `${ch(0x1b)}[31m${text}${ch(0x7)}${ch(0x202e)}`
  const report = {
    reserve: 0.05,
    harnesses: {
      agy: {
        installed: true,
        version: dirty('agy 1.4.0'),
        error: dirty('boom'),
        groups: {
          [dirty('gemini')]: {
            label: dirty('Gemini'),
            unknown: false,
            usable: true,
            mark: { until: 1792274919300 },
            windows: { [dirty('weekly')]: { remaining: 0.5, hoursLeft: 3 } },
            source: { ageMinutes: 1, stale: false },
          },
        },
      },
    },
  }
  const harness = view.parseHarness(out(report), 'agy').value.harness
  const bad = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/
  const strings = [harness.version, harness.error, harness.groups[0].key, harness.groups[0].label, harness.groups[0].windows[0].name]
  for (const text of strings) assert.doesNotMatch(text, bad)
  assert.deepEqual(strings, ['1.4.0', '[31mboom', '[31mgemini', '[31mGemini', '[31mweekly'])
  const delegates = view.parseDelegates(
    out({ delegations: [{ time: 1, description: dirty('paint'), applied: dirty('rewritten'), fallback: dirty('decider: timeout'), ranOn: { harness: dirty('claude'), model: dirty('claude-haiku-5-5'), effort: dirty('high') } }] }),
  ).value[0]
  for (const text of [delegates.description, delegates.ranOn, delegates.ranOnShort, delegates.fallback]) assert.doesNotMatch(text, bad)
  assert.equal(delegates.description, '[31mpaint')
})

test('the delegates are the last five, newest first, however the report orders them', () => {
  const real = view.parseDelegates(printed('delegates.json'))
  assert.equal(real.ok, true)
  assert.equal(real.value.length, 5)
  const times = real.value.map((row) => row.time)
  assert.deepEqual(times, [...times].sort((a, b) => b - a))
  const all = JSON.parse(fixture('delegates.json')).delegations.map((d) => d.time).sort((a, b) => b - a).slice(0, 5)
  assert.deepEqual(times, all)
  assert.deepEqual(view.parseDelegates(printed('delegates-empty.json')).value, [])
  const list = [60, 5, 400, 30, 120, 1, 700].map((m) => ({ time: m * 1000, description: `d${m}` }))
  assert.deepEqual(view.parseDelegates(out({ delegations: list })).value.map((row) => row.description), ['d700', 'd400', 'd120', 'd60', 'd30'])
})

test('a delegate says what it ran on once: the effort a model name ends in is dropped, and claude- only for a narrow pane', () => {
  const [row] = view.parseDelegates(printed('delegates.json')).value.filter((r) => /gemini/.test(r.ranOn))
  assert.equal(row.ranOn, 'agy/gemini-3.8-flash/low', 'gemini-3.8-flash-low on low is gemini-3.8-flash')
  const one = (ranOn, applied) => view.parseDelegates(out({ delegations: [{ time: 1, description: 'd', ranOn, applied }] })).value[0]
  assert.equal(one({ harness: 'agy', model: 'gemini-3.8-flash-low', effort: 'high' }).ranOn, 'agy/gemini-3.8-flash-low/high', 'a suffix that is not the effort stays')
  assert.equal(one({ harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' }).ranOn, 'claude/claude-haiku-5-5/high')
  assert.equal(one({ harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' }).ranOnShort, 'claude/haiku-5-5/high')
  assert.equal(one({ harness: 'grok', model: 'grok-4.7', effort: 'low' }).ranOnShort, 'grok/grok-4.7/low')
  assert.equal(one({ harness: 'agy', model: 'low', effort: 'low' }).ranOn, 'agy/low/low', 'a model that is only the effort is not emptied')
  assert.equal(one(null, 'inherited').ranOn, 'inherited')
  assert.equal(one(null, undefined).ranOn, '—')
})
