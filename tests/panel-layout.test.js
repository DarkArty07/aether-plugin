'use strict'

// The layout of the /harnesses panel (hooks/panel-layout.mjs): what the pane says, the tone of each part, and how it
// gives up rows and columns, drawn from the real output of the bins (tests/fixtures/panel/). The model side is
// tests/panel-view.test.js, and the pane itself is hooks/panel.test.tsx.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
const FIXTURES = path.join(__dirname, 'fixtures', 'panel')

let view
let layout
test.before(async () => {
  view = await import(path.join(HOOKS, 'panel-view.mjs'))
  layout = await import(path.join(HOOKS, 'panel-layout.mjs'))
})

const NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')
const printed = (name) => ({ exitCode: 0, stdout: fixture(name), stderr: '' })
const ch = (...codes) => String.fromCharCode(...codes)

const delegations = () => JSON.parse(fixture('delegates.json')).delegations
const NOW = Math.max(...delegations().map((d) => d.time)) + 3 * 60000

// The five harnesses as the bins printed them, each read and ready. `patch` changes a parsed harness.
function quota(patch = {}) {
  const states = {}
  for (const name of NAMES) {
    const result = view.parseHarness(printed(`quota-${name}.json`), name)
    if (patch[name]) patch[name](result.value.harness)
    states[name] = { status: 'ready', result }
  }
  return states
}
const delegatesOf = (list = null) => ({ status: 'ready', result: list === null ? view.parseDelegates(printed('delegates.json')) : { ok: true, value: list } })
const settings = (options = {}) => view.settingsOf({ superdelegation: true, harnesses: 'agy,grok', ...options })
const draw = (columns, extra = {}) => layout.panelLines({ settings: settings(), quota: quota(), delegates: delegatesOf(), columns, now: NOW, ...extra })
const textOf = (lines) => lines.map((one) => (one.action ? '[action row]' : layout.lineText(one)))
const find = (lines, pattern) => lines.find((one) => pattern.test(layout.lineText(one)))
const partsOf = (one) => one.parts.map((p) => [p.text, p.tone])
const toneOf = (lines, text) => {
  for (const one of lines) for (const p of one.parts) if (p.text === text) return p.tone
  return undefined
}
const barCells = (lines) => {
  const found = textOf(lines).find((text) => /^ {4}weekly/.test(text) && /[█░]/.test(text))
  return (found.match(/[█░]/g) || []).length
}
const wide = (text) => view.cells(text)

test('the pane opens with the title, the options on one line, and then the action row, above the quota', () => {
  const lines = textOf(draw(120))
  assert.equal(lines[0], 'Aether · other harnesses')
  assert.equal(lines[1], 'superdelegation ON · router command · decider haiku · harnesses agy, grok')
  assert.equal(lines[2], '[action row]')
  assert.ok(lines.indexOf('[action row]') < lines.findIndex((text) => /^agy /.test(text)), 'the buttons come before the first harness')
  assert.equal(draw(120).filter((one) => one.action).length, 1)
  assert.ok(!lines.some((text) => /nothing leaves Claude/.test(text)))
})

test('the action row is right under the options also when superdelegation is off, and the notice follows it', () => {
  const lines = textOf(draw(120, { settings: settings({ superdelegation: false }) }))
  assert.match(lines[1], /^superdelegation OFF/)
  assert.equal(lines[2], '[action row]')
  assert.match(lines[3], /^Superdelegation is OFF: nothing leaves Claude/)
})

test('the key hint is the last line, and only while the pane has the keyboard', () => {
  assert.equal(textOf(draw(120, { isFocused: true })).at(-1), 'r renews · x closes · Esc leaves')
  assert.ok(!textOf(draw(120)).some((text) => /Esc leaves/.test(text)))
  assert.ok(!textOf(draw(120, { isFocused: false })).some((text) => /Esc leaves/.test(text)))
})

test('with superdelegation off the pane says plainly that nothing leaves Claude, and still shows the quota', () => {
  const lines = textOf(draw(80, { settings: settings({ superdelegation: false }) }))
  assert.match(lines[1], /^superdelegation OFF · router record/)
  assert.ok(lines.some((text) => /Superdelegation is OFF: nothing leaves Claude/.test(text)))
  assert.ok(lines.some((text) => /Gemini Models/.test(text)))
  assert.equal(toneOf(draw(80, { settings: settings({ superdelegation: false }) }), 'superdelegation OFF'), 'warn')
  assert.equal(toneOf(draw(80), 'superdelegation ON'), 'ok')
})

test('the options shown are the ones the session uses', () => {
  const lines = textOf(draw(120, { settings: view.settingsOf({ superdelegation: true, router: 'Command', decider: 'JEV', harnesses: 'gork' }) }))
  assert.equal(lines[1], 'superdelegation ON · router command · decider haiku · harnesses agy')
})

test('the options go on to more lines instead of being cut, at each width', () => {
  const lines = textOf(draw(60))
  assert.equal(lines[1], 'superdelegation ON · router command · decider haiku')
  assert.equal(lines[2], 'harnesses agy, grok')
  const narrow = textOf(draw(40))
  assert.deepEqual(narrow.slice(1, 3), ['superdelegation ON · router command', 'decider haiku · harnesses agy, grok'])
})

test('the enabled harnesses come first, in the order of the option, and the rest follow', () => {
  const lines = textOf(draw(100, { settings: settings({ harnesses: 'grok,agy' }) }))
  const at = (pattern) => lines.findIndex((text) => pattern.test(text))
  assert.ok(at(/^grok 1\.0\.60$/) < at(/^agy 1\.4\.0$/))
  assert.ok(at(/^agy 1\.4\.0$/) < at(/^Not enabled, no quota reading/))
})

test('a harness that is not enabled is marked, and one with nothing to read joins the others on one line', () => {
  const lines = textOf(draw(100, { settings: settings({ harnesses: 'agy' }) }))
  assert.ok(lines.includes('grok 1.0.60  not enabled'))
  assert.ok(lines.includes('agy 1.4.0'))
  assert.ok(lines.includes('Not enabled, no quota reading: codex, cursor'), 'codex and cursor take one line, not four')
  assert.ok(!lines.some((text) => /^codex|^cursor/.test(text)))
  assert.ok(!lines.some((text) => /no reading/.test(text) && /Codex|Cursor/.test(text)))
  // The same two, enabled, are sections of their own: an enabled group always has its line.
  const enabled = textOf(draw(100, { settings: settings({ harnesses: 'agy,codex,cursor' }) }))
  assert.ok(enabled.includes('codex 0.162.1'))
  assert.ok(enabled.some((text) => /^ {2}Codex plan {2}no reading$/.test(text)))
  assert.ok(enabled.some((text) => /^ {2}Cursor plan {2}no reading$/.test(text)))
  assert.ok(!enabled.some((text) => /^Not enabled, no quota reading: codex/.test(text)))
})

test('muse is drawn like agy: its name and version, its group, and its 5h and weekly windows in the same format', () => {
  const lines = textOf(draw(100, { settings: settings({ harnesses: 'agy,muse' }) }))
  assert.ok(lines.includes('muse 1.4.11'))
  assert.ok(lines.includes('  Muse subscription  usable'))
  assert.ok(lines.includes('    5h      ████████░░░░░░░░░░░░░░░░░░░░░░  28%  resets in 3 h'), lines.join('\n'))
  assert.ok(lines.includes('    weekly  ██████████████████░░░░░░░░░░░░  60%  resets in 120 h'), lines.join('\n'))
  assert.ok(lines.indexOf('muse 1.4.11') > lines.indexOf('agy 1.4.0'), 'enabled harnesses follow the order of the option')
  assert.ok(!lines.some((text) => /^muse.*not enabled/.test(text)))
})

test('muse that is not enabled is marked, that is enabled and not installed says so, and one with nothing to read joins the list', () => {
  assert.ok(textOf(draw(100, { settings: settings({ harnesses: 'agy' }) })).includes('muse 1.4.11  not enabled'))
  const unread = (name) => ({ ok: true, value: { reserve: 0.05, harness: { name, installed: false, version: '', error: null, groups: [] } } })
  const states = { agy: quota().agy, muse: { status: 'ready', result: unread('muse') }, codex: { status: 'ready', result: unread('codex') } }
  const enabled = textOf(layout.panelLines({ settings: settings({ harnesses: 'agy,muse' }), quota: states, delegates: delegatesOf([]), columns: 80, now: NOW }))
  assert.ok(enabled.includes('muse  enabled, not installed'))
  assert.ok(enabled.includes('Not installed: codex'))
  const off = textOf(layout.panelLines({ settings: settings({ harnesses: 'agy' }), quota: states, delegates: delegatesOf([]), columns: 80, now: NOW }))
  assert.ok(off.includes('Not installed: codex, muse'))
})

test('an enabled harness that is not installed says so, and one that is not enabled is named in a list', () => {
  const missing = { ok: true, value: { reserve: 0.05, harness: { name: 'agy', installed: false, version: '', error: null, groups: [] } } }
  const other = (name) => ({ ok: true, value: { reserve: 0.05, harness: { name, installed: false, version: '', error: null, groups: [] } } })
  const lines = textOf(
    layout.panelLines({
      settings: settings({ harnesses: 'agy,grok' }),
      quota: { agy: { status: 'ready', result: missing }, grok: { status: 'ready', result: other('grok') }, codex: { status: 'ready', result: other('codex') }, cursor: { status: 'ready', result: other('cursor') } },
      delegates: delegatesOf([]),
      columns: 80,
      now: NOW,
    }),
  )
  assert.ok(lines.includes('agy  enabled, not installed'))
  assert.ok(lines.includes('grok  enabled, not installed'))
  assert.ok(lines.includes('Not installed: codex, cursor'))
  assert.equal(toneOf(layout.panelLines({ settings: settings(), quota: { agy: { status: 'ready', result: missing } }, columns: 80, now: NOW }), '  enabled, not installed'), 'warn')
})

test('a group is dry until its mark, under the reserve, without a reading, or usable, in that order of precedence', () => {
  const lines = draw(100)
  assert.ok(textOf(lines).some((text) => /^ {2}Gemini Models {2,}dry until Oct \d+ \d\d:\d\d UTC$/.test(text)))
  assert.equal(toneOf(lines, find(lines, /Gemini Models/).parts.at(-1).text), 'warn')
  assert.ok(textOf(lines).some((text) => /^ {2}Claude and GPT models {2}usable$/.test(text)))
  assert.equal(toneOf(lines, 'usable'), 'ok')
  const statusOf = (group) => {
    const rows = layout.panelLines({
      settings: settings(),
      quota: quota({ agy: (h) => { h.groups = [{ ...h.groups[1], ...group }] } }),
      delegates: delegatesOf([]),
      columns: 100,
      now: NOW,
    })
    return partsOf(find(rows, /Claude and GPT models/)).slice(-1)[0]
  }
  assert.deepEqual(statusOf({ usable: true, unknown: false, mark: null }), ['usable', 'ok'])
  assert.deepEqual(statusOf({ usable: true, unknown: true, mark: null }), ['no reading', 'dim'])
  assert.deepEqual(statusOf({ usable: false, unknown: false, mark: null }), ['under the reserve', 'bad'])
  // The libs give a group with one dry window and one unreadable unknown:true and usable:false (lib/lane-order.js).
  assert.deepEqual(statusOf({ usable: false, unknown: true, mark: null }), ['under the reserve', 'bad'], 'not "no reading" above a red bar')
  assert.deepEqual(statusOf({ usable: false, unknown: true, mark: { until: 1792274919300 } })[1], 'warn', 'a mark wins over all')
  assert.match(statusOf({ usable: false, unknown: true, mark: { until: 1792274919300 } })[0], /^dry until Oct 17 22:08 UTC$/)
  assert.deepEqual(statusOf({ usable: false, unknown: false, mark: { until: null } }), ['dry', 'warn'])
})

test('a window is a bar, the percent left and when it resets, and the bar and the percent take the tone of what is left', () => {
  const bars = (remaining) =>
    layout.panelLines({
      settings: settings(),
      quota: quota({ agy: (h) => { h.groups[1].windows[0].remaining = remaining } }),
      delegates: delegatesOf([]),
      columns: 100,
      now: NOW,
    })
  const claudeWeekly = (lines) => lines.filter((one) => /^ {4}weekly/.test(layout.lineText(one)))[1]
  for (const [remaining, tone, text] of [[0.01, 'bad', ' 1%'], [0.05, 'bad', ' 5%'], [0.2, 'warn', '20%'], [0.3, 'warn', '30%'], [0.31, 'ok', '31%'], [0.8, 'ok', '80%'], [1, 'ok', '100%']]) {
    const parts = claudeWeekly(bars(remaining)).parts
    assert.equal(parts[3].tone, tone, `the bar at ${remaining}`)
    assert.equal(parts[5].tone, tone, `the percent at ${remaining}`)
    assert.equal(parts[5].text.trim(), text.trim())
    assert.match(parts[3].text, /^█*░*$/)
  }
  const row = textOf(draw(100)).find((text) => /^ {4}weekly {2}█{30} 100% {2}resets in 168 h$/.test(text))
  assert.ok(row)
  assert.deepEqual(claudeWeekly(bars(0.5)).parts.map((p) => p.tone).filter((t) => t !== 'plain'), ['dim', 'ok', 'ok', 'dim'])
})

test('a reading says how old it is, in dim, and a stale one says so, in warn', () => {
  const stale = (h) => { h.groups[0].source = { ageMinutes: 517, stale: true } }
  const lines = draw(100, { quota: quota({ grok: stale }) })
  assert.ok(textOf(lines).includes('    read just now'))
  assert.ok(textOf(lines).includes('    read 9 h ago · stale'))
  assert.equal(toneOf(lines, 'read just now'), 'dim')
  assert.equal(toneOf(lines, ' · stale'), 'warn')
})

test('a window with no balance or no reset time is drawn, not thrown on', () => {
  const lines = textOf(
    draw(60, {
      quota: quota({ agy: (h) => { h.groups[0].windows = [{ name: 'weekly', remaining: null, hoursLeft: null }, { name: 'daily', remaining: 0.5, hoursLeft: -2 }] } }),
    }),
  )
  assert.ok(lines.some((text) => /^ {4}weekly {2}░+ {4}— {2}reset unknown$/.test(text)))
  assert.ok(lines.some((text) => /^ {4}daily {3}█+░+ {2}50% {2}reset 2 h ago$/.test(text)))
})

test('delegates are listed newest first with their age, what they ran on and their description', () => {
  const lines = textOf(draw(100))
  const at = lines.indexOf('Recent delegates')
  assert.ok(at > 0)
  const rows = lines.slice(at + 1)
  assert.equal(rows.length, 5)
  assert.match(rows[0], /^ {2}\d+ min ago|^ {2}just now|^ {2}\d+ s/)
  assert.ok(rows.every((row) => /agy\/gemini-3\.8-flash\/low|claude\/claude-haiku-5-5\/high/.test(row)))
  assert.ok(rows.some((row) => /list files under src/.test(row)))
})

test('a delegate that fell back is marked, in warn, with the reason', () => {
  const list = view.parseDelegates({ exitCode: 0, stdout: JSON.stringify({ delegations: [{ time: NOW - 60000, description: 'Fast one', ranOn: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' } }, { time: NOW - 9 * 60000, description: 'Slow one', fallback: 'external quota', ranOn: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' } }] }) }).value
  const lines = draw(100, { delegates: delegatesOf(list) })
  const rows = textOf(lines)
  const at = rows.indexOf('Recent delegates')
  assert.match(rows[at + 1], /^ {2}1 min ago .*Fast one$/)
  assert.match(rows[at + 2], /^! 9 min ago .*Slow one \(external quota\)$/)
  assert.equal(toneOf(lines, '! '), 'warn')
  assert.equal(toneOf(lines, ' (external quota)'), 'warn')
})

test('with no delegates, or none read, or a report that failed, the pane says which', () => {
  assert.equal(textOf(draw(80, { delegates: delegatesOf([]) })).at(-1), 'No delegates recorded yet')
  assert.equal(textOf(draw(80, { delegates: { status: 'loading', result: null } })).at(-1), 'Reading…')
  assert.equal(textOf(draw(80, { delegates: null })).at(-1), 'Not read yet')
  const failed = textOf(draw(80, { delegates: { status: 'ready', result: view.parseDelegates({ failed: 'aether-report did not answer in 15 s' }) } }))
  assert.equal(failed.at(-1), 'Delegates unavailable: aether-report did not answer in 15 s')
})

test('at most five delegates are listed', () => {
  const list = view.parseDelegates({ exitCode: 0, stdout: JSON.stringify({ delegations: [1, 2, 3, 4, 5, 6, 7, 8].map((m) => ({ time: NOW - m * 60000, description: `d${m}` })) }) }, 8).value
  const rows = textOf(draw(80, { delegates: delegatesOf(list) }))
  assert.equal(rows.length - rows.indexOf('Recent delegates') - 1, 5)
})

test('each section has its own state: reading, renewing with the old numbers on show, failed, or ready', () => {
  const states = quota()
  states.agy = { status: 'loading', result: null }
  states.codex = { status: 'idle', result: null }
  states.grok = { status: 'renewing', result: states.grok.result }
  states.cursor = { status: 'ready', result: view.parseHarness({ exitCode: 1, stdout: '{"error":"no lane table"}\n' }, 'cursor') }
  const lines = draw(100, { settings: settings({ harnesses: 'agy,grok,cursor' }), quota: states })
  const rows = textOf(lines)
  assert.ok(rows.includes('agy  Reading quota…'))
  assert.equal(toneOf(lines, 'Reading quota…'), 'warn')
  assert.ok(rows.includes('grok 1.0.60  Renewing…'), 'the renewing harness says so, on its own line')
  assert.ok(rows.some((text) => /^ {2}Grok plan {2}usable$/.test(text)), 'and keeps its numbers')
  assert.equal(rows.filter((text) => /Renewing…/.test(text)).length, 1, 'no other section says it')
  assert.ok(rows.includes('cursor'))
  assert.ok(rows.includes('  Quota unavailable: no lane table'), 'a harness that failed fails alone')
  assert.equal(toneOf(lines, 'Quota unavailable: no lane table'), 'bad')
  assert.ok(rows.some((text) => /Not read yet|Not enabled, no quota reading: codex/.test(text)))
})

test('a section that has a result and is not ready is being renewed, whatever it was called', () => {
  const states = quota()
  states.grok = { status: 'loading', result: states.grok.result }
  const rows = textOf(draw(100, { quota: states }))
  assert.ok(rows.includes('grok 1.0.60  Renewing…'))
  assert.ok(!textOf(draw(100)).some((text) => /Renewing…/.test(text)), 'a ready section says nothing')
})

test('an error wraps onto up to three lines, and the last is cut', () => {
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
  const failed = view.parseHarness({ exitCode: 1, stdout: `${JSON.stringify({ error: words })}\n` }, 'agy')
  const states = { ...quota(), agy: { status: 'ready', result: failed } }
  const rows = textOf(draw(40, { quota: states, delegates: { status: 'ready', result: view.parseDelegates({ exitCode: 1, stdout: `${JSON.stringify({ error: words })}\n` }) } }))
  const errors = rows.filter((text) => /^ {2}(Quota unavailable|word)/.test(text))
  assert.equal(errors.length, 3)
  assert.match(errors[0], /^ {2}Quota unavailable: word0 word1/)
  assert.match(errors[2], /…$/)
  const delegates = rows.slice(rows.indexOf('Recent delegates') + 1)
  assert.equal(delegates.length, 3)
  assert.match(delegates[0], /^Delegates unavailable: word0/)
  assert.match(delegates[2], /…$/)
  for (const text of rows) assert.ok(wide(text) <= 40)
  const short = textOf(draw(100, { quota: { ...quota(), agy: { status: 'ready', result: view.parseHarness({ exitCode: 1, stdout: '{"error":"boom"}\n' }, 'agy') } } }))
  assert.equal(short.filter((text) => /boom/.test(text)).length, 1, 'a short error is one line')
})

test('the bars shrink with the width, and every line fits it, from 120 columns down to 40', () => {
  const long = delegatesOf(view.parseDelegates({ exitCode: 0, stdout: JSON.stringify({ delegations: [{ time: NOW - 1, description: 'A description that is much too long for a narrow pane to show whole', fallback: 'decider: timeout', ranOn: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' } }] }) }).value)
  for (const columns of [120, 80, 76, 60, 50, 40]) {
    for (const text of textOf(draw(columns, { delegates: long, isFocused: true }))) assert.ok(wide(text) <= columns, `${columns} columns: "${text}"`)
  }
  const cells = Object.fromEntries([120, 80, 60, 50, 40].map((columns) => [columns, barCells(draw(columns))]))
  assert.equal(cells[120], cells[80], 'a wide pane stops at the longest bar')
  assert.ok(cells[80] > cells[60] && cells[60] > cells[50] && cells[50] > cells[40], JSON.stringify(cells))
  assert.ok(cells[60] >= 20, 'at 60 columns a bar is still long enough to read')
  assert.ok(cells[40] >= 6)
})

test('a delegate is written short when the pane is narrow: claude- goes from the model, the description keeps its room', () => {
  const list = view.parseDelegates({ exitCode: 0, stdout: JSON.stringify({ delegations: [{ time: NOW - 60000, description: 'Port the parser to the new grammar', ranOn: { harness: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' } }] }) }).value
  assert.match(textOf(draw(100, { delegates: delegatesOf(list) })).at(-1), /claude\/claude-sonnet-5-5\/medium {2}Port the parser to the new grammar$/)
  const narrow = textOf(draw(60, { delegates: delegatesOf(list) })).at(-1)
  assert.match(narrow, /claude\/sonnet-5-5\/medium {2}Port the parser to t…$/)
  assert.ok(wide(narrow) <= 60)
})

test('wide characters are counted in cells: no line is wider than the columns', () => {
  const emoji = String.fromCodePoint(0x1f916)
  const descriptions = ['日本語のとても長い説明文がここに入りますので切り詰められます', '한국어로 된 아주 긴 설명이 여기에 들어갑니다', `${emoji}${emoji}${emoji} robots ${emoji}${emoji}${emoji} everywhere in the world ${emoji}`, `e${ch(0x301)}`.repeat(60), 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'.repeat(2)]
  const list = view.parseDelegates({ exitCode: 0, stdout: JSON.stringify({ delegations: descriptions.map((d, i) => ({ time: NOW - (i + 1) * 60000, description: d, fallback: i === 1 ? '失敗した理由がとても長い' : null, ranOn: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' } })) }) }).value
  const states = quota({ agy: (h) => { h.groups[0].label = '日本語のラベル Gemini'; h.version = '日本語' }, grok: (h) => { h.error = '日本語のエラー'.repeat(8) } })
  for (const columns of [40, 60, 76, 120]) {
    for (const rows of [undefined, 10, 13, 19, 30]) {
      for (const text of textOf(draw(columns, { quota: states, delegates: delegatesOf(list), rows, isFocused: true }))) {
        assert.ok(wide(text) <= columns, `${columns} columns, ${rows} rows: "${text}" is ${wide(text)} cells`)
      }
    }
  }
})

test('every part is scrubbed once more at the end, whatever the parse let through', () => {
  const dirty = `bad${ch(0x1b)}[31m${ch(0x7)}${ch(0x202e)}${ch(0x200b)}`
  const lines = layout.panelLines({
    settings: settings(),
    quota: quota({ agy: (h) => { h.version = dirty; h.groups[0].label = dirty; h.groups[0].windows[0].name = dirty; h.error = dirty }, grok: (h) => { h.groups[0].label = dirty } }),
    delegates: delegatesOf([{ time: NOW - 1, description: dirty, ranOn: dirty, ranOnShort: dirty, fallback: dirty }]),
    columns: 100,
    isFocused: true,
    now: NOW,
  })
  const joined = lines.flatMap((one) => one.parts.map((p) => p.text)).join('')
  assert.doesNotMatch(joined, /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/)
  assert.match(joined, /bad\[31m/)
})

// The rooms the pane was seen in: an inline pane under 110 columns showed about 13 rows, a docked one in a 22-row terminal about 19.
const COLUMNS = [40, 60, 76, 120]
const ROWS = [10, 13, 19, 30, 46]
const CASES = [
  ['the default options', { superdelegation: false, harnesses: 'agy' }],
  ['superdelegation on, agy and grok', { superdelegation: true, harnesses: 'agy,grok' }],
  ['superdelegation off, agy and grok', { superdelegation: false, harnesses: 'agy,grok' }],
  ['all four enabled, superdelegation on', { superdelegation: true, harnesses: 'agy,codex,grok,cursor' }],
  ['all four enabled, superdelegation off', { superdelegation: false, harnesses: 'agy,codex,grok,cursor' }],
  ['agy and muse, superdelegation off', { superdelegation: false, harnesses: 'agy,muse' }],
]

test('whatever the room, the title, the options, the action row and a line for each enabled group are shown', () => {
  for (const [name, options] of CASES) {
    for (const columns of COLUMNS) {
      for (const rows of ROWS) {
        const here = settings(options)
        const lines = layout.panelLines({ settings: here, quota: quota(), delegates: delegatesOf(), columns, rows, isFocused: true, now: NOW })
        const shown = textOf(lines.slice(0, rows))
        const where = `${name}, ${columns}x${rows}`
        assert.equal(shown[0], 'Aether · other harnesses', where)
        assert.ok(shown.some((text) => /^superdelegation (ON|OFF)/.test(text)), `${where}: the options`)
        assert.ok(shown.includes('[action row]'), `${where}: the action row`)
        const lastOption = Math.max(...shown.map((t, i) => (/^(superdelegation|router|decider|harnesses) /.test(t) ? i : 0)))
        assert.equal(shown.indexOf('[action row]'), lastOption + 1, `${where}: the action row is right under the options`)
        for (const harness of here.harnesses) {
          const groups = quota()[harness].result.value.harness.groups
          for (const group of groups) assert.ok(shown.some((text) => text.includes(group.label)), `${where}: a line for ${group.label}`)
        }
        for (const text of textOf(lines)) assert.ok(wide(text) <= columns, `${where}: "${text}"`)
      }
    }
  }
})

test('the full layout is used whenever it fits the rows, and nothing changes with rows left over', () => {
  for (const [name, options] of CASES) {
    for (const columns of COLUMNS) {
      const full = layout.panelLines({ settings: settings(options), quota: quota(), delegates: delegatesOf(), columns, isFocused: true, now: NOW })
      for (const rows of ROWS) {
        const lines = layout.panelLines({ settings: settings(options), quota: quota(), delegates: delegatesOf(), columns, rows, isFocused: true, now: NOW })
        if (full.length <= rows) assert.deepEqual(lines, full, `${name}, ${columns}x${rows}`)
        else assert.ok(lines.length <= rows || /more rows/.test(textOf(lines).join('\n')) || lines.length < full.length, `${name}, ${columns}x${rows}: it gave something up`)
      }
      assert.deepEqual(layout.panelLines({ settings: settings(options), quota: quota(), delegates: delegatesOf(), columns, rows: full.length, isFocused: true, now: NOW }), full)
      assert.notDeepEqual(layout.panelLines({ settings: settings(options), quota: quota(), delegates: delegatesOf(), columns, rows: full.length - 1, isFocused: true, now: NOW }), full)
    }
  }
})

test('what the pane gives up, it gives up in order: the age line, then the window pairs, then the delegates, then the quota block', () => {
  const features = (rows) => {
    const lines = layout.panelLines({ settings: settings({ superdelegation: false, harnesses: 'agy,grok' }), quota: quota(), delegates: delegatesOf(), columns: 76, rows, isFocused: true, now: NOW })
    const text = textOf(lines)
    const at = text.indexOf('Recent delegates')
    const rowsAfter = at < 0 ? [] : text.slice(at + 1).filter((t) => /(ago|just now) {2}/.test(t))
    return {
      age: text.some((t) => /^ {4}read just now$/.test(t)),
      blanks: text.includes(' ') || lines.some((one) => one.parts.length === 0 && !one.action),
      pairs: text.some((t) => /^ {4}weekly .* · \d+ h {3}5h /.test(t)),
      delegates: rowsAfter.length,
      cut: text.some((t) => /^… \d+ more rows \(↓ scrolls\)$/.test(t)),
      oneLine: text.some((t) => /^codex|^Not enabled, no quota reading: codex, cursor$/.test(t)),
    }
  }
  const firstBelow = (test) => {
    for (let rows = 60; rows >= 6; rows--) if (!test(features(rows))) return rows
    return 0
  }
  const full = features(60)
  assert.deepEqual([full.age, full.blanks, full.pairs, full.delegates, full.cut], [true, true, false, 5, false])
  const noAge = firstBelow((f) => f.age)
  const pairs = firstBelow((f) => !f.pairs)
  const three = firstBelow((f) => f.delegates === 5)
  const one = firstBelow((f) => f.delegates >= 3)
  const cut = firstBelow((f) => !f.cut)
  assert.ok(noAge > 0 && pairs > 0 && three > 0 && one > 0 && cut > 0, JSON.stringify({ noAge, pairs, three, one, cut }))
  assert.ok(noAge >= pairs, `the age line goes before the pairs: ${noAge} ${pairs}`)
  assert.ok(pairs >= three, `then the pairs: ${pairs} ${three}`)
  assert.ok(three >= one, `then the delegates, to three and to one: ${three} ${one}`)
  assert.ok(one >= cut, `and the quota block last: ${one} ${cut}`)
  assert.equal(features(noAge).age, false)
  assert.equal(features(noAge).delegates, 5)
})

test('in the brief layout a stale reading keeps its age on the header of its group', () => {
  const stale = (h) => { h.groups[0].source = { ageMinutes: 517, stale: true } }
  const full = textOf(draw(100, { quota: quota({ grok: stale }) }))
  const fullRows = full.length
  assert.ok(full.includes('    read 9 h ago · stale'))
  const brief = layout.panelLines({ settings: settings(), quota: quota({ grok: stale }), delegates: delegatesOf(), columns: 100, rows: fullRows - 1, now: NOW })
  const text = textOf(brief)
  assert.ok(!text.includes('    read 9 h ago · stale'))
  assert.ok(!text.some((t) => /^ {4}read just now$/.test(t)), 'a fresh reading loses its age line')
  assert.ok(text.some((t) => /^ {2}Grok plan {2}usable · read 9 h ago \(stale\)$/.test(t)))
  assert.equal(toneOf(brief, ' · read 9 h ago (stale)'), 'warn')
})

// The layout at the most rows that still make it give up the full windows: the one with the window pairs.
function atPairs(columns, options = {}) {
  for (let rows = 40; rows >= 6; rows--) {
    const text = textOf(layout.panelLines({ settings: settings({ harnesses: 'agy', ...options }), quota: quota(), delegates: delegatesOf(), columns, rows, now: NOW }))
    if (!text.some((t) => /resets in/.test(t))) return text
  }
  return []
}

test('each window pair is one line when the width allows, and one to a line when it does not', () => {
  const two = (columns) => atPairs(columns).filter((t) => /^ {4}weekly/.test(t))
  assert.equal(two(76).length, 2, 'two groups, a pair line each')
  assert.match(two(76)[1], /^ {4}weekly █+░+ {2}33% · 146 h {3}5h █{14} 100% · 5 h$/)
  assert.match(two(60)[0], /^ {4}weekly █{9} 100% · 168 h {3}5h █{9} 100% · 5 h$/)
  const narrow = atPairs(40, { superdelegation: false })
  assert.ok(narrow.includes('    weekly ████████████████ 100% · 168 h'), narrow.join('\n'))
  assert.ok(narrow.includes('    5h ████████████████ 100% · 5 h'), 'the bars of a group are as long as each other')
})

test('a harness that is not enabled and has a reading is one line in the compact layout', () => {
  const lines = textOf(layout.panelLines({ settings: settings({ harnesses: 'agy' }), quota: quota(), delegates: delegatesOf(), columns: 76, rows: 17, now: NOW }))
  assert.ok(lines.some((t) => /^grok 1\.0\.60 · not enabled · usable · weekly 95% · 6\.9 h$/.test(t)), lines.join('\n'))
})

test('when even that does not fit, one line for each enabled group comes first, and the rest follows a line that counts it', () => {
  const lines = layout.panelLines({ settings: settings({ superdelegation: false, harnesses: 'agy' }), quota: quota(), delegates: delegatesOf(), columns: 60, rows: 11, isFocused: true, now: NOW })
  const text = textOf(lines)
  assert.equal(text[0], 'Aether · other harnesses')
  assert.ok(text.slice(0, 11).includes('[action row]'))
  assert.match(text[5], /^agy {2}Gemini Models {2}dry until /)
  assert.match(text[6], /^agy {2}Claude and GPT models {2}usable · weekly 33% · 5h 100%$/)
  const marker = text.findIndex((t) => /^… \d+ more rows \(↓ scrolls\)$/.test(t))
  assert.equal(marker, 10, 'it is the last row shown')
  assert.equal(Number(/\d+/.exec(text[marker])[0]), text.length - marker - 1, 'and counts the rows after it')
  assert.ok(text.slice(marker + 1).includes('r renews · x closes · Esc leaves'), 'the rows below are there to scroll to')
  const tones = lines.slice(5, 7).map((one) => one.parts.map((p) => p.tone))
  assert.deepEqual(tones[1].filter((t) => t !== 'plain'), ['title', 'ok', 'ok', 'ok'])
})

test('the corner where nothing fits keeps what matters and drops the notice, and the marker, first', () => {
  const all = settings({ superdelegation: false, harnesses: 'agy,codex,grok,cursor' })
  const lines = textOf(layout.panelLines({ settings: all, quota: quota(), delegates: delegatesOf(), columns: 40, rows: 10, isFocused: true, now: NOW }).slice(0, 10))
  assert.equal(lines[0], 'Aether · other harnesses')
  assert.ok(lines.includes('[action row]'))
  for (const label of ['Gemini Models', 'Claude and GPT models', 'Codex plan', 'Grok plan', 'Cursor plan']) assert.ok(lines.some((t) => t.includes(label)), label)
  assert.ok(!lines.some((t) => /nothing leaves Claude/.test(t)), 'the notice is what goes; superdelegation OFF is still in the options')
})
