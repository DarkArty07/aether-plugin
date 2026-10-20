// The /harnesses panel: a command of the mod that opens a pane with the delegation settings and the quota of each
// harness, and prints nothing to the transcript and calls no model. Its numbers come from the plugin's bins, run with
// $.process.run: `aether-lane quota --json <harness>`, one run for each harness so that a slow one holds back no other
// (agy's reading launches agy and takes about 5 s), and `aether-report --delegates`. The pane opens at once, and each
// section is drawn again, with $.ui.invalidate, as its read returns.
//
// Only an Aether session has the command or the pane (the check is register.js's aetherSession, made lazily by the
// command and by the drawing, never at session start: the first answer is kept for the session, and the panel must not
// be the first to ask). The command is declared by the Lead's own SessionStart, every time it comes. In any other
// session nothing is declared, and a /harnesses typed there, or a pane of this id, goes on to the hooks beneath.
//
// What the pane says and how it fits the room is panel-layout.mjs; the options and the parsing are panel-view.mjs.

import { aetherSession } from './register.js'
import { DELEGATES_TIMEOUT_MS, DELEGATES_WINDOW_MS, HARNESS_NAMES, READ_TIMEOUT_MS, parseDelegates, parseHarness, settingsOf } from './panel-view.mjs'
import { panelLines } from './panel-layout.mjs'

const COMMAND = 'harnesses'
const PANE = 'harnesses'
const LEAD = 'aether:lead'
// The body rows the pane asks for inline above the prompt: its content with the harnesses installed.
const ROWS = 30

// The style of each tone panel-layout.mjs gives a part: theme keys, so the pane follows the person's theme.
const TONES = {
  title: { bold: true },
  ok: { color: 'success' },
  warn: { color: 'warning' },
  bad: { color: 'error' },
  dim: { dimColor: true },
}

// What the pane shows, kept apart from the reads that fill it.
//   gen            counts the opens and the renewals; a read applies its result only while its generation is the
//                  current one, so a late answer never overwrites a newer one
//   quota          harness -> { status, result }: result is what parseHarness gave (null until the first read),
//                  status is 'loading' (no result yet), 'renewing' (a read runs; the old result stays on show), 'ready'
//   delegates      the same for the delegations
//   inflight       the reads running, of any generation
//   pendingRefresh a Renew pressed while reads ran: one refresh of every harness runs when they have all returned
//   autoDone       whether this open has had its turn to renew a stale reading
const panel = { gen: 0, quota: {}, delegates: { status: 'idle', result: null }, inflight: 0, pendingRefresh: false, autoDone: true }

// One of the plugin's bins, or why it could not run: { failed }. A bin that exits non-zero is still a result.
async function runBin($, bin, args, timeoutMs) {
  try {
    return await $.process.run(['node', `${$.plugin.root}/bin/${bin}`, ...args], { timeoutMs })
  } catch (err) {
    const message = String(err && err.message)
    return { failed: /still running after/.test(message) ? `${bin} did not answer in ${timeoutMs / 1000} s` : `${bin} could not run: ${message}` }
  }
}

// Draws the pane again. A pane that cannot be drawn again is a pane that is gone.
function redraw($) {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // Nothing to redraw.
  }
}

// What one section shows while a read runs: the result it has stays, and says Renewing…; one with none says Reading….
const reading = (state) => ({ result: state && state.result ? state.result : null, status: state && state.result ? 'renewing' : 'loading' })

// After a read returns: when none is left running, the Renew that was waiting runs, or else the stale reading is renewed.
function settle($) {
  if (panel.inflight > 0) return
  try {
    if (panel.pendingRefresh) {
      panel.pendingRefresh = false
      beginPass($, true)
    } else if (!panel.autoDone) {
      panel.autoDone = true
      for (const name of HARNESS_NAMES) {
        const state = panel.quota[name]
        const harness = state && state.result && state.result.ok ? state.result.value.harness : null
        if (harness !== null && harness.installed && harness.groups.some((group) => group.source !== null && group.source.stale)) {
          panel.quota[name] = reading(state)
          readHarness($, panel.gen, name, true)
        }
      }
      redraw($)
    }
  } catch {
    // The sections stay as the reads left them.
  }
}

// One harness's read. It never rejects, and it leaves its section settled: with its result when its generation is
// still the current one, else to whoever started the newer generation.
async function readHarness($, gen, name, refresh) {
  panel.inflight += 1
  let result
  try {
    const args = refresh ? ['quota', '--json', name, '--refresh'] : ['quota', '--json', name]
    result = parseHarness(await runBin($, 'aether-lane', args, READ_TIMEOUT_MS[name]), name)
  } catch (err) {
    result = { ok: false, error: `could not read ${name}: ${String(err && err.message)}` }
  }
  if (gen === panel.gen) {
    panel.quota[name] = { result, status: 'ready' }
    redraw($)
  }
  panel.inflight -= 1
  settle($)
}

async function readDelegates($, gen) {
  panel.inflight += 1
  let result
  try {
    // The router log is never pruned, so the report asks for a week: all of it can pass what $.process.run keeps.
    const since = (await $.clock.now()) - DELEGATES_WINDOW_MS
    result = parseDelegates(await runBin($, 'aether-report', ['--delegates', '--since', String(Math.max(0, Math.floor(since)))], DELEGATES_TIMEOUT_MS))
  } catch (err) {
    result = { ok: false, error: `could not read the delegates: ${String(err && err.message)}` }
  }
  if (gen === panel.gen) {
    panel.delegates = { result, status: 'ready' }
    redraw($)
  }
  panel.inflight -= 1
  settle($)
}

// A new generation: every harness and the delegates are read again, at once. What the sections show stays until its
// read returns. A pass that is a refresh has had its turn to renew a stale reading.
function beginPass($, refresh) {
  panel.gen += 1
  panel.autoDone = refresh
  for (const name of HARNESS_NAMES) panel.quota[name] = reading(panel.quota[name])
  panel.delegates = reading(panel.delegates)
  redraw($)
  for (const name of HARNESS_NAMES) readHarness($, panel.gen, name, refresh)
  readDelegates($, panel.gen)
}

// /harnesses: the pane is open, and everything is read.
function onOpen($) {
  try {
    beginPass($, false)
  } catch {
    // The pane stays as it was.
  }
}

// Renew readings. While reads run it is remembered, never dropped: one refresh runs when they have returned.
function renew($) {
  try {
    if (panel.inflight === 0) {
      beginPass($, true)
      return
    }
    panel.pendingRefresh = true
    for (const name of HARNESS_NAMES) if (panel.quota[name] && panel.quota[name].result) panel.quota[name] = reading(panel.quota[name])
    redraw($)
  } catch {
    // The press does nothing.
  }
}

// One line of the pane: a Text of the line's parts, each in the style of its tone.
function lineElement(Text, one, key) {
  if (one.parts.length === 0) return <Text key={key}> </Text>
  return (
    <Text key={key} wrap="truncate-end">
      {one.parts.map((part, i) => (
        <Text key={i} {...(TONES[part.tone] ?? {})}>
          {part.text}
        </Text>
      ))}
    </Text>
  )
}

export function registerPanel(on, options) {
  const settings = settingsOf(options)

  // The Lead's SessionStart declares the command, every time: the declaration belongs to the session, and a /clear
  // is a new session with no session.start of its own. Registering a name again replaces it.
  on('classic.SessionStart', { agent_type: LEAD }, async ($, e, next) => {
    const result = await next(e)
    try {
      await $.command.register({ name: COMMAND, description: 'Show the delegation settings and the quota of the other harnesses', immediate: true })
    } catch {
      // No command; the rest of the mod goes on.
    }
    return result
  }).catch(($, e, next) => next(e))

  // Typing /harnesses opens the pane at once and fills it in as the bins return. It prints nothing. It only opens a
  // pane and starts reads, so it may run while the Lead is in a turn.
  on('command.run', { command: COMMAND }, async ($, e, next) => {
    if (!(await aetherSession($))) return next(e)
    const opened = await $.ui.open({ id: PANE, title: 'Harnesses', focus: true, closeOnEscape: true, rows: ROWS })
    if (opened && opened.isPlaced === false) $.ui.toast(`harnesses: ${String(opened.reason)}`)
    else onOpen($)
    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!(await aetherSession($))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const lines = panelLines({
      settings,
      quota: panel.quota,
      delegates: panel.delegates,
      columns: e.props.bodyColumns,
      rows: e.props.scroll && e.props.scroll.bodyRows,
      isFocused: e.props.isFocused,
      now,
    })
    return (
      <Box flexDirection="column">
        {lines.map((one, i) =>
          one.action ? (
            <Box key="actions" gap={2}>
              <Button key="renew" label="Renew readings" hotkey="r" onPress={() => renew($)} />
              <Button key="close" label="Close" hotkey="x" onPress={() => $.ui.close({ id: PANE })} />
            </Box>
          ) : (
            lineElement(Text, one, `line-${i}`)
          ),
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
