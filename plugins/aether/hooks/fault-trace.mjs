// The trace of the mod's silent failures (spec 014, R1). The mod swallows a failure on purpose, so that the meter and the
// delegate ladder never change a request; this file leaves a record of the failures that change what was measured or run.
// A record is the place of the failure (a fixed source) and its class (a fixed word) with the hour: never the error's
// message, which can carry paths or text (R10). Both come from the lists below; anything else is stored as a fixed word.
//
// <data dir>/observe/faults/<session>.json is { session, count, faults: [{ time, source, class }] } with the first 100
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

const MAX_FAULTS = 100

// Leaves the record of one fault. Counts and keeps it in state.faultLog at once, so that faults that arrive together are
// all counted, and writes the record after the write before it, so that the last file is the newest.
export async function recordFault($, state, source, cls) {
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
      log.faults.push({
        time,
        source: FAULT_SOURCES.includes(source) ? source : 'unknown',
        class: FAULT_CLASSES.includes(cls) ? cls : 'unclassified',
      })
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
