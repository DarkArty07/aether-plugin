// The layout of the /harnesses panel (panel.jsx): what the pane says, and how it fits the room it has. Pure, like
// panel-view.mjs, whose parsed documents it draws.
//
// A line is { parts: [{ text, tone }] }, with the tones title, ok, warn, bad, dim and plain; panel.jsx turns a tone
// into a style. One line is the action row, { parts: [], action: true }, where panel.jsx draws the two buttons. No
// line is wider than the columns it was given, in cells, and none wraps: a width is shared out by the layout and what
// still does not fit is cut with an ellipsis.
//
// The room is `columns` by `rows`. The full layout is used whenever it fits. Otherwise the layout gives up, level by
// level, the least it can: the age line of a reading (kept, in the group's header, for a stale one) and the blank
// lines; then each window pair on one line and each harness that is not enabled on one line; then the delegates, five
// to three to one; and last the quota block itself, which keeps one line per enabled group and puts the rest after a
// `… N more rows (↓ scrolls)` line, below the rows the pane shows, where its scroll reaches them.

import { HARNESS_NAMES, ageText, bar, cells, clip, dateText, hoursShort, isNumber, padLeft, padRight, percentText, resetText, scrub } from './panel-view.mjs'

const TITLE = 'Aether · other harnesses'
const HINT = 'r renews · x closes · Esc leaves'
const NOTE = 'Superdelegation is OFF: nothing leaves Claude. The quota below is only for reference.'
const NOTE_SHORT = 'Superdelegation is OFF: nothing leaves Claude.'
const DEFAULT_COLUMNS = 76
const MIN_COLUMNS = 20
const BAR_MIN = 6
const BAR_MAX = 30
// The bars of two windows on one line, and the least that is worth drawing.
const PAIR_BAR_MAX = 14
const PAIR_BAR_MIN = 4
const LABEL_MAX = 24
// The room the description of a delegate keeps before its harness, model and effort are written short.
const DESCRIPTION_MIN = 20
// The fraction left at which a bar turns from green to yellow.
const LOW = 0.3
const MINUTE_MS = 60000

// What each level gives up, cumulatively. `note` is the text of the superdelegation-off notice; `errorLines` how many lines an
// error may take.
const LEVELS = [
  { brief: false, pairs: false, delegates: 5, blanks: true, errorLines: 3, note: NOTE },
  { brief: true, pairs: false, delegates: 5, blanks: false, errorLines: 3, note: NOTE },
  { brief: true, pairs: true, delegates: 5, blanks: false, errorLines: 2, note: NOTE_SHORT },
  { brief: true, pairs: true, delegates: 3, blanks: false, errorLines: 1, note: NOTE_SHORT },
  { brief: true, pairs: true, delegates: 1, blanks: false, errorLines: 1, note: NOTE_SHORT },
]

const part = (text, tone = 'plain') => ({ text, tone })
const line = (...parts) => ({ parts })
const blank = () => line()
const actions = () => ({ parts: [], action: true })
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

export const lineText = (one) => one.parts.map((p) => p.text).join('')

// Greedy word wrap into at most `max` lines of `to` cells; a word longer than the line is cut, and what is left after
// the last line goes into it, cut.
function wrapWords(text, to, max = Infinity) {
  const rows = []
  let current = ''
  for (const word of String(text).split(' ')) {
    if (word === '') continue
    const cut = clip(word, to)
    if (current === '') current = cut
    else if (cells(current) + 1 + cells(cut) <= to) current += ` ${cut}`
    else {
      rows.push(current)
      current = cut
    }
  }
  if (current !== '') rows.push(current)
  if (rows.length <= max) return rows
  return [...rows.slice(0, max - 1), clip(rows.slice(max - 1).join(' '), to)]
}

// The segments packed into as few lines of at most `to` cells as keep each segment whole, joined by a dim ' · '.
function packSegments(segments, to) {
  const rows = []
  let current = []
  let used = 0
  for (const segment of segments) {
    const size = cells(segment.text)
    if (current.length > 0 && used + 3 + size > to) {
      rows.push(current)
      current = []
      used = 0
    }
    used += (current.length > 0 ? 3 : 0) + size
    current.push(segment)
  }
  if (current.length > 0) rows.push(current)
  return rows.map((row) => line(...row.flatMap((segment, i) => (i === 0 ? [segment] : [part(' · ', 'dim'), segment]))))
}

function optionsLines(settings, to) {
  return packSegments(
    [
      part(settings.lanes ? 'superdelegation ON' : 'superdelegation OFF', settings.lanes ? 'ok' : 'warn'),
      part(`harnesses ${settings.harnesses.join(', ')}`),
    ],
    to,
  )
}

// The title, the options, the action row right under them, and then the superdelegation-off notice if it is off. `note` is the
// notice's text, or null to leave it out.
function head(ctx, note) {
  const rows = [line(part(TITLE, 'title')), ...optionsLines(ctx.settings, ctx.to), actions()]
  if (!ctx.settings.lanes && note !== null) rows.push(...wrapWords(note, ctx.to).map((row) => line(part(row, 'warn'))))
  return rows
}

function toneOf(remaining, reserve) {
  if (!isNumber(remaining)) return 'dim'
  if (remaining <= reserve) return 'bad'
  if (remaining <= LOW) return 'warn'
  return 'ok'
}

// What a group is: dry until a time (its mark), under the reserve, without a reading, or usable. A group with one
// dry window and one unreadable is both unknown and not usable, and it is the dry one that matters.
function statusOf(group) {
  if (group.mark !== null) {
    const until = dateText(group.mark.until)
    return part(until === null ? 'dry' : `dry until ${until}`, 'warn')
  }
  if (group.usable === false) return part('under the reserve', 'bad')
  if (group.unknown) return part('no reading', 'dim')
  return part('usable', 'ok')
}

const hasReading = (group) => group.mark !== null || !group.unknown

// A window as a row of the full layout: its name, a bar, the percent left and when it resets.
function windowRows(windows, reserve, to) {
  const nameW = clamp(Math.max(...windows.map((w) => cells(w.name))), 6, 10)
  const resets = windows.map((w) => resetText(w.hoursLeft))
  const resetW = Math.max(...resets.map(cells))
  // 4 of indent, the name, 2, the bar, 1, the percent (4), 2, the reset.
  const barW = clamp(to - (4 + nameW + 2 + 1 + 4 + 2 + resetW), BAR_MIN, BAR_MAX)
  return windows.map((w, i) => {
    const tone = toneOf(w.remaining, reserve)
    return line(
      part('    '),
      part(padRight(clip(w.name, nameW), nameW), 'dim'),
      part('  '),
      part(bar(w.remaining, barW), tone),
      part(' '),
      part(padLeft(percentText(w.remaining), 4), tone),
      part('  '),
      part(resets[i], 'dim'),
    )
  })
}

// A window as a cell of a pair: `weekly ███░░ 33% · 147 h`.
function windowCell(w, size, reserve) {
  const tone = toneOf(w.remaining, reserve)
  return [part(w.name, 'dim'), part(' '), part(bar(w.remaining, size), tone), part(' '), part(padLeft(percentText(w.remaining), 4), tone), part(` · ${hoursShort(w.hoursLeft)}`, 'dim')]
}

const cellFixed = (w) => cells(w.name) + 1 + 1 + 4 + 3 + cells(hoursShort(w.hoursLeft))

// The windows of a group two to a line, when the width allows a bar worth drawing, else one to a line.
function pairRows(windows, reserve, to) {
  const chunks = []
  for (let i = 0; i < windows.length; i += 2) chunks.push(windows.slice(i, i + 2))
  const pairBar = Math.min(...chunks.filter((c) => c.length === 2).map((c) => Math.floor((to - 4 - 3 - cellFixed(c[0]) - cellFixed(c[1])) / 2)))
  if (windows.length > 1 && pairBar >= PAIR_BAR_MIN) {
    const size = Math.min(PAIR_BAR_MAX, pairBar)
    return chunks.map((c) => line(part('    '), ...c.flatMap((w, i) => (i === 0 ? windowCell(w, size, reserve) : [part('   '), ...windowCell(w, size, reserve)]))))
  }
  const size = clamp(Math.min(...windows.map((w) => to - 4 - cellFixed(w))), BAR_MIN, BAR_MAX)
  return windows.map((w) => line(part('    '), ...windowCell(w, size, reserve)))
}

function groupRows(group, labelW, reserve, ctx, level) {
  const stale = group.source !== null && group.source.stale
  const header = [part('  '), part(padRight(clip(group.label, labelW), labelW)), part('  '), statusOf(group)]
  if (level.brief && stale) header.push(part(` · read ${ageText(group.source.ageMinutes)} (stale)`, 'warn'))
  const rows = [line(...header)]
  if (group.windows.length > 0) rows.push(...(level.pairs ? pairRows(group.windows, reserve, ctx.to) : windowRows(group.windows, reserve, ctx.to)))
  if (!level.brief && group.source !== null) {
    rows.push(line(part('    '), part(`read ${ageText(group.source.ageMinutes)}`, 'dim'), ...(stale ? [part(' · stale', 'warn')] : [])))
  }
  return rows
}

const renewing = (section) => (section.status === 'renewing' ? [part('  Renewing…', 'warn')] : [])

function sectionOf(name, enabled, state) {
  const result = state && state.result ? state.result : null
  // A result on show while the section is not ready is a result being renewed.
  const given = state && state.status ? state.status : 'idle'
  const status = result !== null && given !== 'ready' ? 'renewing' : given
  const base = { name, enabled, status }
  if (result === null) return { ...base, kind: 'pending' }
  if (!result.ok) return { ...base, kind: 'failed', error: result.error }
  const harness = result.value.harness
  if (!harness.installed) return harness.error === null ? { ...base, kind: 'missing' } : { ...base, kind: 'failed', error: harness.error }
  return { ...base, kind: 'ready', harness, reserve: result.value.reserve }
}

// A harness that is not enabled and has nothing to read is one name in a list, not a section.
const isPlain = (section) => section.kind === 'ready' && !section.enabled && section.harness.error === null && section.harness.groups.every((g) => !hasReading(g))

function pendingRow(section) {
  const text = section.status === 'idle' ? 'Not read yet' : section.status === 'renewing' ? 'Renewing…' : 'Reading quota…'
  return line(part(section.name, 'title'), part('  '), part(text, section.status === 'idle' ? 'dim' : 'warn'))
}

function failedRows(section, level, to) {
  const rows = [line(part(section.name, 'title'), ...renewing(section))]
  for (const row of wrapWords(`Quota unavailable: ${section.error}`, to - 2, level.errorLines)) rows.push(line(part('  '), part(row, 'bad')))
  return rows
}

const missingRow = (section) => line(part(section.name, 'title'), part('  enabled, not installed', 'warn'))

// A harness that is not enabled, with a reading, on one line: `grok 1.0.60 · not enabled · usable · weekly 95% · 7.4 h`.
function oneLineRow(section) {
  const { harness } = section
  const group = harness.groups[0]
  const parts = [part(harness.name, 'title')]
  if (harness.version !== '') parts.push(part(` ${harness.version}`, 'dim'))
  parts.push(part(' · not enabled', 'warn'), part(' · ', 'dim'), statusOf(group))
  const first = group.windows[0]
  if (first) parts.push(part(` · ${first.name} ${percentText(first.remaining)}`, toneOf(first.remaining, section.reserve)), part(` · ${hoursShort(first.hoursLeft)}`, 'dim'))
  return line(...parts, ...renewing(section))
}

function readyRows(section, ctx, level) {
  const { harness, reserve } = section
  if (level.pairs && !section.enabled && harness.error === null && harness.groups.length === 1) return [oneLineRow(section)]
  const header = [part(harness.name, 'title')]
  if (harness.version !== '') header.push(part(` ${harness.version}`, 'dim'))
  if (!section.enabled) header.push(part('  not enabled', 'warn'))
  const rows = [line(...header, ...renewing(section))]
  if (harness.error !== null) for (const row of wrapWords(`reading failed: ${harness.error}`, ctx.to - 2, level.errorLines)) rows.push(line(part('  '), part(row, 'bad')))
  if (harness.groups.length === 0 && harness.error === null) rows.push(line(part('  no quota groups', 'dim')))
  const labelW = clamp(Math.max(1, ...harness.groups.map((g) => cells(g.label))), 1, LABEL_MAX)
  for (const group of harness.groups) rows.push(...groupRows(group, labelW, reserve, ctx, level))
  return rows
}

function sectionRows(section, ctx, level) {
  if (section.kind === 'pending') return [pendingRow(section)]
  if (section.kind === 'failed') return failedRows(section, level, ctx.to)
  if (section.kind === 'missing') return [missingRow(section)]
  return readyRows(section, ctx, level)
}

// The quota block: each section in order, then the harnesses that are not enabled and have nothing to read, and the
// ones that are not installed, each as one line naming them. `keep` picks the sections it draws.
function quotaBlock(ctx, level, keep = () => true) {
  const rows = []
  const plain = []
  const missing = []
  const gap = () => {
    if (level.blanks && rows.length > 0) rows.push(blank())
  }
  for (const section of ctx.sections) {
    if (!keep(section)) continue
    if (section.kind === 'missing' && !section.enabled) missing.push(section.name)
    else if (isPlain(section)) plain.push(section.name)
    else {
      gap()
      rows.push(...sectionRows(section, ctx, level))
    }
  }
  if (plain.length > 0) {
    gap()
    rows.push(line(part(`Not enabled, no quota reading: ${plain.join(', ')}`, 'dim')))
  }
  if (missing.length > 0) {
    gap()
    rows.push(line(part(`Not installed: ${missing.join(', ')}`, 'dim')))
  }
  return rows
}

// One delegation per row: how long ago, what it ran on, its description, and a mark and the reason if it fell back.
function delegateRows(delegations, now, to) {
  const ages = delegations.map((d) => (isNumber(now) ? ageText(Math.max(0, now - d.time) / MINUTE_MS) : ''))
  const ageW = Math.max(...ages.map(cells))
  const ranAvail = Math.max(10, to - (2 + ageW + 2 + 2 + DESCRIPTION_MIN))
  const ranOf = (d) => (cells(d.ranOn) <= ranAvail ? d.ranOn : clip(d.ranOnShort, ranAvail))
  const ranW = Math.max(...delegations.map((d) => cells(ranOf(d))))
  const descW = Math.max(1, to - (2 + ageW + 2 + ranW + 2))
  return delegations.map((d, i) => {
    const fallback = d.fallback === null ? '' : ` (${clip(d.fallback, 24)})`
    const description = clip(d.description === '' ? '(no description)' : d.description, Math.max(8, descW - cells(fallback)))
    const parts = [
      d.fallback === null ? part('  ') : part('! ', 'warn'),
      part(padRight(ages[i], ageW), 'dim'),
      part('  '),
      part(padRight(ranOf(d), ranW)),
      part('  '),
      part(description),
    ]
    if (fallback !== '') parts.push(part(fallback, 'warn'))
    return line(...parts)
  })
}

function delegatesBlock(ctx, level) {
  const { status, result } = ctx.delegates
  const rows = [line(part('Recent delegates', 'title'))]
  if (result === null) rows.push(line(part(status === 'idle' ? 'Not read yet' : 'Reading…', 'dim')))
  else if (!result.ok) for (const row of wrapWords(`Delegates unavailable: ${result.error}`, ctx.to, level.errorLines)) rows.push(line(part(row, 'bad')))
  else if (result.value.length === 0) rows.push(line(part('No delegates recorded yet', 'dim')))
  else rows.push(...delegateRows(result.value.slice(0, level.delegates), ctx.now, ctx.to))
  return rows
}

function build(ctx, level) {
  const rows = [...head(ctx, level.note)]
  if (level.blanks) rows.push(blank())
  rows.push(...quotaBlock(ctx, level))
  if (level.blanks) rows.push(blank())
  rows.push(...delegatesBlock(ctx, level))
  if (ctx.focused) rows.push(line(part(HINT, 'dim')))
  return rows
}

// One line for a section of an enabled harness, or one per group of it: the least that still says what it is.
function essentialRows(section, ctx) {
  const tail = renewing(section)
  if (section.kind === 'pending') return [pendingRow(section)]
  if (section.kind === 'failed') return [line(part(section.name, 'title'), part('  '), part(wrapWords(`Quota unavailable: ${section.error}`, ctx.to, 1)[0] ?? '', 'bad'), ...tail)]
  if (section.kind === 'missing') return [missingRow(section)]
  const { harness, reserve } = section
  if (harness.error !== null) return [line(part(harness.name, 'title'), part('  '), part(`reading failed: ${harness.error}`, 'bad'), ...tail)]
  if (harness.groups.length === 0) return [line(part(harness.name, 'title'), part('  no quota groups', 'dim'), ...tail)]
  return harness.groups.map((group) => {
    const parts = [part(harness.name, 'title'), part('  '), part(clip(group.label, LABEL_MAX)), part('  '), statusOf(group)]
    for (const w of group.windows) parts.push(part(` · ${w.name} ${percentText(w.remaining)}`, toneOf(w.remaining, reserve)))
    if (group.source !== null && group.source.stale) parts.push(part(' (stale)', 'warn'))
    return line(...parts, ...tail)
  })
}

// When even the least level does not fit: the head and one line per enabled group come first, and then the rest of the
// least level. What does not fit the rows is below the line `… N more rows (↓ scrolls)`, which is the last row shown,
// where the scroll of the pane reaches it. If the head and the groups leave no row for that line, the notice of
// superdelegation off goes first, and then the line itself.
function lastResort(ctx, limit) {
  const last = LEVELS[LEVELS.length - 1]
  const essential = ctx.sections.filter((s) => s.enabled).flatMap((s) => essentialRows(s, ctx))
  const rest = [...quotaBlock(ctx, last, (s) => !s.enabled), ...delegatesBlock(ctx, last)]
  if (ctx.focused) rest.push(line(part(HINT, 'dim')))
  let top = []
  for (const note of [NOTE_SHORT, null]) {
    top = [...head(ctx, note), ...essential]
    if (top.length + 1 <= limit) break
  }
  if (top.length + rest.length <= limit) return [...top, ...rest]
  const room = limit - 1 - top.length
  if (room < 0) return [...top, ...rest]
  return [...top, ...rest.slice(0, room), line(part(`… ${rest.length - room} more rows (↓ scrolls)`, 'dim')), ...rest.slice(room)]
}

// Every line cut to the columns, and every part scrubbed once more: the last thing before the pane.
function finish(rows, to) {
  return rows.map((one) => {
    if (one.action) return one
    let left = to
    const parts = []
    for (const p of one.parts) {
      if (left <= 0) break
      const text = scrub(p.text)
      const size = cells(text)
      parts.push({ ...p, text: size <= left ? text : clip(text, left) })
      left -= size
    }
    return { parts }
  })
}

// The lines of the pane, top to bottom, none wider than `columns` cells.
//   settings   settingsOf(options)
//   quota      { <harness>: { status, result } }: result is what parseHarness gave, or null until the read returns;
//              status is 'loading', 'renewing' (a result on show while a read runs), 'ready' or 'idle'. A harness with
//              no entry has not been read.
//   delegates  { status, result } the same, with the result of parseDelegates
//   columns, rows   the room: the body columns, and the body rows the pane shows (no limit when it is not given)
//   isFocused  whether the pane has the keyboard, which shows the key hint
//   now        the clock, in ms
export function panelLines({ settings, quota = {}, delegates = null, columns, rows, isFocused = false, now }) {
  const to = isNumber(columns) ? Math.max(MIN_COLUMNS, Math.floor(columns)) : DEFAULT_COLUMNS
  const names = [...settings.harnesses, ...HARNESS_NAMES.filter((name) => !settings.harnesses.includes(name))]
  const ctx = {
    settings,
    to,
    now,
    focused: isFocused === true,
    sections: names.map((name) => sectionOf(name, settings.harnesses.includes(name), quota ? quota[name] : undefined)),
    delegates: delegates ?? { status: 'idle', result: null },
  }
  const limit = isNumber(rows) && rows >= 1 ? Math.floor(rows) : Infinity
  for (const level of LEVELS) {
    const lines = build(ctx, level)
    if (lines.length <= limit) return finish(lines, to)
  }
  return finish(lastResort(ctx, limit), to)
}
