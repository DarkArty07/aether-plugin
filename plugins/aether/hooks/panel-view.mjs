// The model side of the /harnesses panel (panel.jsx): the plugin's options, the output of the two bins and the text
// helpers, all pure. No $, no I/O and no clock, so the mod's tests import this file with node. The layout, what the pane
// says and how it fits the room, is panel-layout.mjs.
//
// Everything that comes from outside (a CLI's version or error, a group's label, a delegate's description) is cleaned
// when it is parsed: Claude Code refuses a whole pane that holds one control character, and a bidi override reorders a
// row, so no external string reaches a part as it came.

export const HARNESS_NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']
// The delegations the panel keeps, and how far back it asks for them.
export const RECENT = 5
export const DELEGATES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
// How long each read may run: agy's own reading takes up to 60 s, grok's is ACP for 10 s and then its UI for 20 s.
export const READ_TIMEOUT_MS = { agy: 75000, grok: 45000, codex: 20000, cursor: 20000, muse: 20000 }
export const DELEGATES_TIMEOUT_MS = 15000

const FILLED = '█'
const EMPTY = '░'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DEFAULT_RESERVE = 0.05

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
export const isText = (value) => typeof value === 'string' && value !== ''
export const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

// Cells, not characters: a terminal draws CJK and emoji in two cells and a combining mark in none.
const WIDE = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
]
const ZERO = [
  [0x0300, 0x036f],
  [0x200b, 0x200f],
  [0xfe00, 0xfe0f],
]
const inRanges = (ranges, code) => ranges.some(([low, high]) => code >= low && code <= high)

// The cells of one character. The block glyphs and `· … —` are one cell each.
export function cellOf(char) {
  const code = char.codePointAt(0)
  if (inRanges(ZERO, code)) return 0
  return inRanges(WIDE, code) ? 2 : 1
}

export function cells(text) {
  let total = 0
  for (const char of String(text)) total += cellOf(char)
  return total
}

// `text` cut to `to` cells, ending in an ellipsis when something was cut.
export function clip(text, to) {
  if (!(to >= 1)) return ''
  const chars = Array.from(String(text))
  if (cells(text) <= to) return chars.join('')
  let kept = ''
  let used = 0
  for (const char of chars) {
    const wide = cellOf(char)
    if (used + wide > to - 1) break
    kept += char
    used += wide
  }
  return `${kept}…`
}

export const padRight = (text, to) => text + ' '.repeat(Math.max(0, to - cells(text)))
export const padLeft = (text, to) => ' '.repeat(Math.max(0, to - cells(text))) + text

// Controls (C0, DEL, C1), zero-width and bidi characters, and the line and paragraph separators, which Claude Code
// refuses in a text child or draws as given.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g

// `text` without what a pane cannot hold: a lone surrogate is U+FFFD, a tab or a line break is a space, and the
// unsafe characters go. Spaces are kept as they are, so that padding survives.
export function scrub(value) {
  const whole = String(value ?? '').replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g, (found) => (found.length === 2 ? found : '\ufffd'))
  return whole.replace(/[\t\n\v\f\r\u2028\u2029]/g, ' ').replace(UNSAFE, '')
}

// One clean line of an outside string: scrubbed, its white space collapsed and trimmed. Not a string is ''.
export const clean = (value) => (typeof value === 'string' ? scrub(value).replace(/\s+/g, ' ').trim() : '')

// The options as the session uses them. The session does not read the options as they are: lib/session.js
// delegateSettingsFrom keeps the switch and the harnesses, lib/lanes.js enabledHarnesses keeps the known harness
// names, trimmed and in lower case (else agy), and superdelegation's resolveOption (lib/superdelegation.js) turns the
// switch on when superdelegation is set to true. The mod cannot require the libs, so the list and the rule are copied
// here; tests/panel-conformance.test.js compares the two on a table. `lanes` in the settings is the resolved switch,
// shown as superdelegation. Any other saved option is ignored.
export function settingsOf(options) {
  const given = isObject(options) ? options : {}
  const harnesses = []
  const listed = Array.isArray(given.harnesses) ? given.harnesses.join(',') : given.harnesses
  for (const part of String(listed ?? '').split(',')) {
    const name = part.trim().toLowerCase()
    if (HARNESS_NAMES.includes(name) && !harnesses.includes(name)) harnesses.push(name)
  }
  const on = String(given.superdelegation) === 'true'
  return {
    lanes: on,
    harnesses: harnesses.length > 0 ? harnesses : ['agy'],
  }
}

// A bar of `cells` cells, `fraction` of it filled. A bar is never full unless the fraction is, and never empty
// unless the fraction is.
export function bar(fraction, size) {
  const room = Math.max(0, Math.floor(size))
  if (!isNumber(fraction) || room === 0) return EMPTY.repeat(room)
  const share = Math.min(1, Math.max(0, fraction))
  let filled = Math.round(share * room)
  if (share > 0 && filled === 0) filled = 1
  if (share < 1 && filled === room && room > 1) filled = room - 1
  return FILLED.repeat(filled) + EMPTY.repeat(room - filled)
}

export const percentText = (fraction) => (isNumber(fraction) ? `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` : '—')

// The hours with one decimal at most, none from 100 on.
function hoursShown(hours) {
  if (hours >= 100) return String(Math.round(hours))
  return hours < 0.1 ? '<0.1' : String(Number(hours.toFixed(1)))
}

// `resets in 7.7 h` for hoursLeft, or `reset 3 h ago` for a reset that has passed.
export function resetText(hoursLeft) {
  if (!isNumber(hoursLeft)) return 'reset unknown'
  const shown = hoursShown(Math.abs(hoursLeft))
  return hoursLeft < 0 ? `reset ${shown} h ago` : `resets in ${shown} h`
}

// The same short: `7.7 h`, `3 h ago`, `?`.
export function hoursShort(hoursLeft) {
  if (!isNumber(hoursLeft)) return '?'
  const shown = hoursShown(Math.abs(hoursLeft))
  return hoursLeft < 0 ? `${shown} h ago` : `${shown} h`
}

// How long ago, from a number of minutes.
export function ageText(minutes) {
  if (!isNumber(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${Math.floor(minutes)} min ago`
  const hours = minutes / 60
  if (hours < 48) return `${Math.round(hours)} h ago`
  return `${Math.round(hours / 24)} d ago`
}

// `Oct 17 22:08 UTC`, or null for a time that is no time.
export function dateText(ms) {
  if (!isNumber(ms)) return null
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const two = (n) => String(n).padStart(2, '0')
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`
}

// The number in what a CLI prints for `--version` ('grok 1.0.60 (01a8e1c591c0) [stable]' is '1.0.60').
export function versionOf(raw) {
  const text = clean(raw)
  if (text === '') return ''
  const found = /\d+(?:\.\d+)+(?:-[0-9A-Za-z.]+)?/.exec(text)
  return found ? found[0] : clip(text, 16)
}

// The last line of a stream, one clean line.
function lastLine(stream) {
  const lines = typeof stream === 'string' ? stream.split('\n').map(clean).filter((l) => l !== '') : []
  return lines.length > 0 ? lines[lines.length - 1] : ''
}

function tryParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// The JSON object a bin printed, or why there is none: { ok: true, value } or { ok: false, error }. `out` is what
// $.process.run resolved with, or { failed: <why> } for a run that was refused, could not start or was stopped.
// The bins end a failure with a line { error } and a non-zero exit. $.process.run keeps only the first 4 MiB of a
// stream, and a document cut there is no document.
export function readJson(out, name) {
  const fail = (error) => ({ ok: false, error: clean(error) })
  if (!isObject(out)) return fail(`${name} gave no result`)
  if (isText(out.failed)) return fail(out.failed)
  if (out.isStdoutTruncated === true) return fail(`${name} printed over 4 MiB, too long to read`)
  const lines = typeof out.stdout === 'string' ? out.stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '') : []
  const value = lines.length > 0 ? tryParse(lines[lines.length - 1]) : undefined
  if (isObject(value) && isText(value.error)) return fail(value.error)
  if (out.exitCode !== 0) {
    const stderr = lastLine(out.stderr)
    return fail(`${name} exited ${out.exitCode}${stderr === '' ? '' : `: ${stderr}`}`)
  }
  if (lines.length === 0) return fail(`${name} printed nothing`)
  if (!isObject(value)) return fail(`${name} printed no JSON`)
  return { ok: true, value }
}

function windowOf(name, raw) {
  return {
    name: clean(name),
    remaining: isNumber(raw.remaining) ? raw.remaining : null,
    hoursLeft: isNumber(raw.hoursLeft) ? raw.hoursLeft : null,
  }
}

function groupOf(key, raw) {
  const windows = isObject(raw.windows) ? Object.entries(raw.windows).filter(([, w]) => isObject(w)).map(([name, w]) => windowOf(name, w)) : []
  let mark = null
  if (isObject(raw.mark)) {
    const until = isNumber(raw.mark.until) ? raw.mark.until : Date.parse(raw.mark.resetsAt)
    mark = { until: isNumber(until) ? until : null }
  }
  const source = isObject(raw.source) && isNumber(raw.source.ageMinutes) ? { ageMinutes: raw.source.ageMinutes, stale: raw.source.stale === true } : null
  return {
    key: clean(key),
    label: clean(raw.label) || clean(key),
    unknown: raw.unknown === true,
    usable: raw.usable !== false,
    mark,
    windows,
    source,
  }
}

function harnessOf(name, raw) {
  const groups = isObject(raw.groups) ? Object.entries(raw.groups).filter(([, g]) => isObject(g)).map(([key, g]) => groupOf(key, g)) : []
  return { name, installed: raw.installed === true, version: versionOf(raw.version), error: isText(raw.error) ? clean(raw.error) || null : null, groups }
}

// What `aether-lane quota --json <name>` printed, for that harness: { ok, value: { reserve, harness } } with the
// harness reduced to clean fields, or { ok: false, error }. The bin lists a harness it was asked for even when its
// CLI is missing (installed false, no groups), which is how a harness that is enabled and not installed is found.
export function parseHarness(out, name) {
  const read = readJson(out, 'aether-lane quota')
  if (!read.ok) return read
  const raw = isObject(read.value.harnesses) ? read.value.harnesses[name] : undefined
  if (!isObject(raw)) return { ok: false, error: `aether-lane quota gave no ${name} entry` }
  return { ok: true, value: { reserve: isNumber(read.value.reserve) ? read.value.reserve : DEFAULT_RESERVE, harness: harnessOf(name, raw) } }
}

// What a delegation ran on, as harness/model/effort, and the same with the model's `claude-` left out for a narrow
// pane; with no ranOn, how it was applied. A model that ends in -<effort> (gemini-3.8-flash-low on low) says
// it twice, so the suffix goes.
function ranOnText(ranOn, applied) {
  const how = clean(applied) || '—'
  if (!isObject(ranOn)) return { full: how, short: how }
  const effort = clean(ranOn.effort)
  let model = clean(ranOn.model)
  if (effort !== '' && model.endsWith(`-${effort}`)) model = model.slice(0, -(effort.length + 1))
  const spell = (name) => [clean(ranOn.harness), name, effort].filter(isText).join('/')
  const full = spell(model)
  if (full === '') return { full: how, short: how }
  return { full, short: spell(model.replace(/^claude-/, '')) }
}

// aether-report --delegates: { ok, value } with the last `limit` delegations, newest first, each reduced to what the
// panel draws, or { ok: false, error }.
export function parseDelegates(out, limit = RECENT) {
  const read = readJson(out, 'aether-report')
  if (!read.ok) return read
  if (!Array.isArray(read.value.delegations)) return { ok: false, error: 'aether-report printed no delegations' }
  const rows = read.value.delegations
    .filter((d) => isObject(d) && isNumber(d.time))
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map((d) => {
      const ran = ranOnText(d.ranOn, d.applied)
      return { time: d.time, description: clean(d.description), ranOn: ran.full, ranOnShort: ran.short, fallback: clean(d.fallback) || null }
    })
  return { ok: true, value: rows }
}
