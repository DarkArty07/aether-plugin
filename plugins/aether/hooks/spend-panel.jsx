// The /spend panel: a command of the mod that opens a pane with the list-price spend of this Aether session, and
// prints nothing to the transcript and calls no model. The figure comes from `aether-report --spend --session <id>`,
// run with $.process.run. The pane opens at once and is drawn again, with $.ui.invalidate, when the bin returns.
//
// Only an Aether session has the command or the pane (the check is register.js's aetherSession, made lazily by the
// command and by the drawing, never at session start: the first answer is kept for the session, and the panel must
// not be the first to ask). The command is declared by the Lead's own SessionStart, every time it comes. In any
// other session nothing is declared, and a /spend typed there, or a pane of this id, goes on to the hooks beneath.
//
// What the pane says is spend-view.mjs.

import { aetherSession } from './register.js'
import { parseSpend, spendLines } from './spend-view.mjs'

const COMMAND = 'spend'
const PANE = 'spend'
const LEAD = 'aether:lead'
const ROWS = 30
const TIMEOUT_MS = 120000

// The style of each tone spend-view.mjs gives a part: theme keys, so the pane follows the person's theme.
const TONES = {
  title: { bold: true },
  ok: { color: 'success' },
  warn: { color: 'warning' },
  bad: { color: 'error' },
  dim: { dimColor: true },
}

// What the pane shows, apart from the read that fills it.
//   gen     counts the opens; a read applies its result only while its generation is the current one, so a late
//           answer never overwrites a newer /spend
//   result  null while the bin has not returned (the pane says Reading…), else what parseSpend gave
const shown = { gen: 0, result: null }

// The report bin, or why it could not run: { failed }. A bin that exits non-zero is still a result.
async function runReport($, sessionId) {
  try {
    return await $.process.run(
      ['node', `${$.plugin.root}/bin/aether-report`, '--spend', '--session', sessionId],
      { timeoutMs: TIMEOUT_MS },
    )
  } catch (err) {
    const message = String(err && err.message)
    return {
      failed: /still running after/.test(message)
        ? `aether-report did not answer in ${TIMEOUT_MS / 1000} s`
        : `aether-report could not run: ${message}`,
    }
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

// One read. It never rejects, and it keeps its result only while no newer /spend has started.
function readSpend($, sessionId) {
  const gen = ++shown.gen
  shown.result = null
  redraw($)
  runReport($, sessionId).then((out) => {
    if (gen !== shown.gen) return
    try {
      shown.result = parseSpend(out)
    } catch (err) {
      shown.result = { ok: false, error: `aether-report could not run: ${String(err && err.message)}` }
    }
    redraw($)
  }).catch((err) => {
    if (gen !== shown.gen) return
    shown.result = { ok: false, error: `aether-report could not run: ${String(err && err.message)}` }
    redraw($)
  })
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

export function registerSpend(on) {
  // The Lead's SessionStart declares the command, every time: the declaration belongs to the session, and a /clear
  // is a new session with no session.start of its own. Registering a name again replaces it.
  on('classic.SessionStart', { agent_type: LEAD }, async ($, e, next) => {
    const result = await next(e)
    try {
      await $.command.register({ name: COMMAND, description: 'Show the list-price spend of this Aether session', immediate: true })
    } catch {
      // No command; the rest of the mod goes on.
    }
    return result
  }).catch(($, e, next) => next(e))

  // Typing /spend opens the pane at once and fills it in when the bin returns. It prints nothing. It only opens a
  // pane and starts a read, so it may run while the Lead is in a turn.
  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const state = await aetherSession($)
    if (!state) return next(e)
    const opened = await $.ui.open({ id: PANE, title: 'Spend', focus: true, closeOnEscape: true, rows: ROWS })
    if (opened && opened.isPlaced === false) {
      try {
        $.ui.toast(`spend: ${String(opened.reason)}`)
      } catch {
        // The pane was not placed. The figure is still read, and nothing is printed.
      }
    }
    readSpend($, state.id)
    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!(await aetherSession($))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const lines = spendLines({
      result: shown.result,
      columns: e.props && e.props.bodyColumns,
      rows: e.props && e.props.scroll && e.props.scroll.bodyRows,
    })
    return (
      <Box flexDirection="column">
        {lines.map((one, i) =>
          one.action ? (
            <Box key="actions">
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
