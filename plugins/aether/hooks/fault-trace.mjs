// The trace recorder of the mod's silent failures (spec 014, R1). The mod swallows a failure on purpose, so that the meter and the
// delegate ladder never change a request; this file leaves a record of the failures that change what was measured or run.
// A record is the place of the failure (a fixed source) and its class (a fixed word) with the hour: never the error's
// message, which can carry paths or text (R10). Both come from the lists below; anything else is stored as a fixed word.
// Where the mod caught an error, the record also keeps its kind: the name of the error's class when it is one of the
// built-in classes below, else `other`. Only the word is kept, never the message.
//
// <data dir>/observe/faults/<session>.json is { session, count, faults: [{ time, source, class, kind? }] } with the first 100
// faults; `count` goes on counting. The record is the mod's own file: nothing else writes it.
//
// Nothing here may change a request, so recordFault never rejects and its callers never wait for it. It imports nothing
// and uses only $.clock.now and $.fs.write.

// The places that leave a trace: the real failures of the audit of D3 (plan 014).
export const FAULT_SOURCES = [
  'register.marker-check',
  'register.flush',
  'register.lane-payload',
  'register.delegate-context',
  'register.meter-step',
  'register.brake-settings-start',
  'register.brake-settings-recheck',
  'register.brake-step',
  'register.on-session-start',
  'register.on-agent-offer',
  'register.on-tool-call',
  'register.on-agent-spawn',
  'register.ops-run',
  'delegate.step',
  'delegate.answer',
  'delegate.begin',
  'delegate.bind',
]

export const FAULT_CLASSES = ['write-failed', 'read-failed', 'settings-unreadable', 'handler-threw', 'spawn-failed']

// The kinds of a caught error: the built-in classes of JavaScript's errors, and `other` for any class of its own or any
// value that is not an error.
export const FAULT_KINDS = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'other']

const MAX_FAULTS = 100

// The kind of the value a catch caught, from FAULT_KINDS. It reads the class's name only, and never a message; a value
// whose class cannot be read is `other`.
export function errorKind(thrown) {
  try {
    const name = thrown?.constructor?.name
    return FAULT_KINDS.includes(name) ? name : 'other'
  } catch {
    return 'other'
  }
}

// Leaves the record of one fault. Counts and keeps it in state.faultLog at once, so that faults that arrive together are
// all counted, and writes the record after the write before it, so that the last file is the newest. `kind` is given
// only where an error was caught (errorKind); a fault with nothing thrown has none.
export async function recordFault($, state, source, cls, kind) {
  try {
    const log = (state.faultLog ??= { count: 0, faults: [] })
    let time = null
    try {
      time = await $.clock.now()
    } catch {
      time = null
    }
    log.count += 1
    if (log.faults.length < MAX_FAULTS) {
      const fault = {
        time,
        source: FAULT_SOURCES.includes(source) ? source : 'unknown',
        class: FAULT_CLASSES.includes(cls) ? cls : 'unclassified',
      }
      if (kind !== undefined) fault.kind = FAULT_KINDS.includes(kind) ? kind : 'other'
      log.faults.push(fault)
    }
    const turn = (state.faultWrites ?? Promise.resolve()).then(async () => {
      const dataDir = await state.dataDir
      if (typeof dataDir !== 'string' || dataDir === '') return
      await $.fs.write(`${dataDir}/observe/faults/${state.id}.json`, JSON.stringify({ session: state.id, count: log.count, faults: log.faults }))
    })
    // A failed write is not a failure of the next one.
    state.faultWrites = turn.catch(() => undefined)
    await turn
  } catch {
    // The trace is a courtesy: a failure to leave it changes nothing.
  }
}
