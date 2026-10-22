// The text of the /spend panel (spend-panel.jsx): the dollars, the bin's JSON and the lines. Pure. No $, no I/O
// and no clock, so the mod's tests import this file with node. Everything from outside is cleaned, and every line
// is cut to the columns it was given: Claude Code refuses a pane that holds one control character, and a line
// wider than the room would wrap.

import { cells, clean, clip, readJson, scrub } from './panel-view.mjs'

const MISSING = '\u2014'
const TITLE = 'Aether \u00b7 session spend'
const DEFAULT_COLUMNS = 76
const NO_FIGURE = 'aether-report printed no spend figure'

const part = (text, tone = 'plain') => ({ text, tone })
const line = (...parts) => ({ parts })
const blank = () => line()
const actions = () => ({ parts: [], action: true })

// `1.005e+2` to the plain decimal `100.5`. Number#toString is already the shortest round trip; this only unfolds
// the exponent form so the digits can be cut by hand.
function expandPlain(text) {
  const match = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text)
  if (!match) return text
  const head = match[1]
  const digits = head + (match[2] || '')
  const exp = Number(match[3])
  if (!Number.isFinite(exp)) return text
  const point = head.length + exp
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length)
  return `${digits.slice(0, point)}.${digits.slice(point)}`
}

// One more on a string of digits, so a cent that carries does not go through a Number.
function addOne(digits) {
  const out = []
  let carry = 1
  for (let i = digits.length - 1; i >= 0; i--) {
    const sum = digits.charCodeAt(i) - 48 + carry
    out.push(String(sum % 10))
    carry = sum > 9 ? 1 : 0
  }
  if (carry) out.push('1')
  return out.reverse().join('')
}

// Two decimals, half away from zero, on the shortest round-trip decimal. Not Math.round(value * 100): the doubles
// of the literals 1.005 and 2.675 sit slightly below the half, and rounding those exact values prints 1.00 and 2.67.
export function usdText(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MISSING
  const negative = value < 0
  const plain = expandPlain(Math.abs(value).toString())
  const dot = plain.indexOf('.')
  const integer = (dot === -1 ? plain : plain.slice(0, dot)).replace(/\D/g, '') || '0'
  const fraction = (dot === -1 ? '' : plain.slice(dot + 1)).replace(/\D/g, '')
  const keep = (fraction + '00').slice(0, 2)
  const dropped = fraction.length > 2 ? fraction[2] : '0'
  let cents = (integer.replace(/^0+(?=\d)/, '') || '0') + keep
  cents = cents.replace(/^0+(?=\d)/, '')
  if (dropped >= '5') cents = addOne(cents)
  if (cents.length < 3) cents = cents.padStart(3, '0')
  const whole = cents.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  return `${negative && cents !== '000' ? '-' : ''}${whole}.${cents.slice(-2)}`
}

// What `aether-report --spend` printed: the parsed object when `recorded` is a boolean, else why there is no figure.
// `out` is what $.process.run resolved with, or { failed } when the run was refused, could not start or was stopped.
export function parseSpend(out) {
  const read = readJson(out, 'aether-report')
  if (!read.ok) return read
  if (typeof read.value.recorded !== 'boolean') return { ok: false, error: NO_FIGURE }
  return read
}

function countText(n, one, many) {
  const text = typeof n === 'number' && Number.isFinite(n) ? String(n) : MISSING
  return `${text} ${n === 1 ? one : many}`
}

// Most dollars first. A tie goes by the cleaned name, so two equal rows do not swap between draws.
function ranked(record, countKey) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return []
  return Object.entries(record)
    .filter(([, row]) => row !== null && typeof row === 'object' && !Array.isArray(row))
    .map(([name, row]) => ({
      name: clean(name),
      usd: typeof row.usd === 'number' ? row.usd : Number.NaN,
      count: row[countKey],
    }))
    .sort((a, b) => {
      const au = Number.isFinite(a.usd) ? a.usd : Number.NEGATIVE_INFINITY
      const bu = Number.isFinite(b.usd) ? b.usd : Number.NEGATIVE_INFINITY
      if (au !== bu) return bu - au
      if (a.name < b.name) return -1
      if (a.name > b.name) return 1
      return 0
    })
}

function entryLine(name, usd, count, one, many) {
  return line(part(`  ${name}  US$ ${usdText(usd)}  ${countText(count, one, many)}`))
}

// A blank line, the heading, then one row each. The blank belongs to the section, so a section that is skipped
// leaves no empty row behind it.
function section(header, rows) {
  return [blank(), line(part(header)), ...rows]
}

function idText(session) {
  if (typeof session !== 'string') return MISSING
  return clean(session) || MISSING
}

function moneyLine(value) {
  const total = part(`Total US$ ${usdText(value.usd)}`)
  if (value.complete === false) return line(total, part(' incomplete', 'warn'))
  return line(total)
}

function figureLines(value) {
  const harness = value.harness !== null && typeof value.harness === 'object' ? value.harness : {}
  const lines = [
    line(part(TITLE, 'title')),
    line(part(`Session ${idText(value.session)} \u00b7 list prices \u00b7 ${clean(value.basis)}`, 'dim')),
    actions(),
    moneyLine(value),
    line(part(`Lead US$ ${usdText(value.leadUsd)} \u00b7 Agents US$ ${usdText(value.agentsUsd)} \u00b7 Other harnesses US$ ${usdText(harness.usd)}`)),
    ...section('By model', ranked(value.byModel, 'requests').map((row) => entryLine(row.name, row.usd, row.count, 'request', 'requests'))),
    ...section('By model and effort', ranked(value.byEffort, 'requests').map((row) => entryLine(row.name, row.usd, row.count, 'request', 'requests'))),
    ...section('By role', ranked(value.byRole, 'requests').map((row) => entryLine(row.name, row.usd, row.count, 'request', 'requests'))),
  ]
  const calls = typeof harness.calls === 'number' ? harness.calls : 0
  if (calls > 0) {
    lines.push(...section(
      `Other harnesses: ${countText(calls, 'call', 'calls')} \u00b7 US$ ${usdText(harness.usd)}`,
      ranked(harness.byModel, 'calls').map((row) => entryLine(row.name, row.usd, row.count, 'call', 'calls')),
    ))
  }
  const unpriced = Array.isArray(value.unpriced) ? value.unpriced.map(clean).filter((name) => name !== '') : []
  if (unpriced.length > 0) lines.push(...section(`No price: ${unpriced.join(', ')}`, []))
  if (value.firstRequest !== null && value.firstRequest !== undefined) {
    const first = clean(value.firstRequest) || MISSING
    const last = value.lastRequest === null || value.lastRequest === undefined ? MISSING : (clean(value.lastRequest) || MISSING)
    lines.push(blank(), line(part(`First request ${first} \u00b7 last request ${last}`)))
  }
  const resumptions = typeof value.resumptions === 'number' && Number.isFinite(value.resumptions) ? String(value.resumptions) : MISSING
  lines.push(line(part(`Resumptions ${resumptions} (approximate)`)))
  return lines
}

// Every line cut to the columns, and every part scrubbed once more: the last thing before the pane.
function fit(rows, columns) {
  const to = typeof columns === 'number' && Number.isFinite(columns) ? Math.max(0, Math.floor(columns)) : DEFAULT_COLUMNS
  return rows.map((one) => {
    if (one.action) return one
    let left = to
    const parts = []
    for (const p of one.parts) {
      if (left <= 0) break
      const text = scrub(p.text)
      const size = cells(text)
      parts.push({ text: size <= left ? text : clip(text, left), tone: p.tone })
      left -= size
    }
    return { parts }
  })
}

// The lines of the pane, top to bottom. `result` is null while the bin has not returned, { ok: false, error } when
// it failed, and { ok: true, value } for a figure. The action row is kept near the top.
export function spendLines({ result, columns = DEFAULT_COLUMNS, rows } = {}) {
  let unclipped
  if (result === null || result === undefined) {
    unclipped = [
      line(part(TITLE, 'title')),
      line(part('Reading\u2026')),
      actions(),
    ]
  } else if (!result.ok) {
    unclipped = [
      line(part(TITLE, 'title')),
      line(part(`  Spend unavailable: ${clean(result.error)}`, 'bad')),
      actions(),
    ]
  } else {
    const value = result.value !== null && typeof result.value === 'object' ? result.value : {}
    if (value.recorded !== true) {
      unclipped = [
        line(part(TITLE, 'title')),
        line(part(`Session ${idText(value.session)}`)),
        line(part('No spend recorded yet')),
        actions(),
      ]
    } else {
      unclipped = figureLines(value)
    }
  }
  const limit = typeof rows === 'number' && Number.isFinite(rows) && rows >= 1 ? Math.floor(rows) : Infinity
  if (unclipped.length <= limit || limit < 2) return fit(unclipped, columns)
  const room = limit - 1
  const scrolled = [
    ...unclipped.slice(0, room),
    line(part(`… ${unclipped.length - room} more rows (↓ scrolls)`, 'dim')),
    ...unclipped.slice(room),
  ]
  return fit(scrolled, columns)
}
