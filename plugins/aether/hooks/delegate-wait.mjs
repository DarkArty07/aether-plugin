// The mod's wait loop for a delegate that runs outside Claude Code (R12, R20).
// One $.process.run lasts at most 10 minutes in the engine, and a delegate can take longer. So the workflow
// asks `aether-delegate wait` for at most WAIT_SECONDS at a time, with a timeout under the engine's limit, and
// repeats until the delegate ends. No model is called here, and nothing is imported from lib/: the mod talks
// to the bins through $.process.run.

// What one `wait` call blocks at most, in seconds.
export const WAIT_SECONDS = 540
// The timeoutMs of each $.process.run: under the 600000 ms of the engine, over the wait itself.
export const WAIT_TIMEOUT_MS = 570000
// The most a delegate is waited for in total, in milliseconds.
export const MAX_WAIT_MS = 3600000
// The longest an agent's step may go without an event: measured on 2026-10-22, a step of a mod-answered agent that
// emitted nothing for 600 s was killed with "Agent stalled: no progress for 600s". A text event the step yields counts as
// progress (measured: the agent lived 18 minutes). The waits above are shorter, so a beat after each one is enough.
export const STALL_MS = 600000

// The text of a heartbeat: what the step yields after a wait that did not end. The engine adds it to the agent's answer.
export function heartbeatText(waitedMs) {
  return `[Aether: the delegate is still working, ${Math.round(waitedMs / 60000)} min so far]\n`
}

// The last line of a wait's output that is a JSON object with a boolean `done`, or null.
function lastAnswer(stdout) {
  const lines = String(stdout ?? '').split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const value = JSON.parse(line)
      if (value && typeof value === 'object' && typeof value.done === 'boolean') return value
    } catch {
      // a line that is not JSON is noise
    }
    return null
  }
  return null
}

// One `aether-delegate wait`: its answer, or null when the call fails (throws, exits non-zero or prints no answer).
async function waitOnce($, root, id) {
  try {
    const run = await $.process.run(
      ['node', `${root}/bin/aether-delegate`, 'wait', '--id', id, '--seconds', String(WAIT_SECONDS)],
      { timeoutMs: WAIT_TIMEOUT_MS },
    )
    if (run && run.exitCode !== undefined && run.exitCode !== 0) return null
    return lastAnswer(run?.stdout)
  } catch {
    return null
  }
}

// Repeats the wait until the delegate ends, one wait at a time. After each wait that did not end, and after a wait that
// failed and is about to be retried, it yields { beat: true, waitedMs }, so the caller can yield a heartbeat event (see
// STALL_MS): a hung wait and its retry could otherwise go past the stall limit with no event. The second failure in a row
// ends the wait with no beat. It returns { ok, status, text } when the delegate ends, and never throws.
// `session` is part of the caller's context and is not sent: the bin takes its session and data directory
// from the environment of the session it runs in.
export async function* waitSteps($, { root, id, session }) {
  void session
  try {
    const started = await $.clock.now()
    let failures = 0
    for (;;) {
      if ((await $.clock.now()) - started >= MAX_WAIT_MS) return { ok: false, status: 'timeout', text: null }
      const answer = await waitOnce($, root, id)
      if (answer === null) {
        failures += 1
        if (failures >= 2) return { ok: false, status: 'wait-failed', text: null }
        yield { beat: true, waitedMs: (await $.clock.now()) - started }
        continue
      }
      failures = 0
      if (answer.done) {
        return { ok: answer.ok === true, status: String(answer.status ?? ''), text: answer.text ?? null }
      }
      yield { beat: true, waitedMs: (await $.clock.now()) - started }
    }
  } catch {
    return { ok: false, status: 'wait-failed', text: null }
  }
}
