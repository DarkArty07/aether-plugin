'use strict'

// The time limits of an external delegate, in one place. The mod runs the delegate through the engine's
// $.process.run, which refuses a timeoutMs above ten minutes, so everything the delegate does has to fit in less than
// that: two quota readings (before the call and after it), the CLI at its longest, and the grace before its process
// group is killed. lib/route.js promises EXTERNAL_LIMIT_MS to the mod, lib/delegate-calls.js takes its CLI limit and
// its grace from here, lib/delegate-chain.js asks retryCliSeconds how long a later attempt may run, and
// tests/delegate-limits.test.js pins that worstCaseMs() stays under EXTERNAL_LIMIT_MS.

// The most a delegate's CLI may run.
const CLI_MAX_SECONDS = 360
// What a CLI that outlives its own timeout gets before its process group is killed.
const KILL_GRACE_SECONDS = 60
// The longest one quota reading can take: agy's `/usage` call is ended at 60 s (lib/harness/agy.js); grok's reading
// from its log launches nothing, and its refresh by ACP and UI (10 s and 20 s) is not run inside a delegate.
const READING_MAX_SECONDS = 60
// The time the mod gives the delegate, under the ten minutes of the engine.
const EXTERNAL_LIMIT_MS = 570000

// The least CLI time worth a later attempt of a delegate: under it the attempt would be cut before it could answer, and
// Claude takes the task instead.
const MIN_RETRY_CLI_SECONDS = 120

// The seconds the delegate's CLI may run: the harness's reviewer timeout when it is a positive finite number, never
// more than CLI_MAX_SECONDS, and CLI_MAX_SECONDS when the setting is missing or invalid.
function cliSeconds(settings) {
  const seconds = settings?.timeouts?.reviewer
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, CLI_MAX_SECONDS)
  return CLI_MAX_SECONDS
}

// The CLI limit a later attempt of a delegate may have when the earlier ones took elapsedMs: what is left of
// EXTERNAL_LIMIT_MS after the attempt's two readings and the kill grace, never more than CLI_MAX_SECONDS. Null when that
// is under MIN_RETRY_CLI_SECONDS.
function retryCliSeconds(elapsedMs) {
  const left = Math.floor((EXTERNAL_LIMIT_MS - elapsedMs) / 1000) - 2 * READING_MAX_SECONDS - KILL_GRACE_SECONDS
  return left >= MIN_RETRY_CLI_SECONDS ? Math.min(left, CLI_MAX_SECONDS) : null
}

// The longest a delegate can take: both readings, the CLI and the grace.
function worstCaseMs() {
  return (2 * READING_MAX_SECONDS + CLI_MAX_SECONDS + KILL_GRACE_SECONDS) * 1000
}

module.exports = { CLI_MAX_SECONDS, KILL_GRACE_SECONDS, READING_MAX_SECONDS, MIN_RETRY_CLI_SECONDS, EXTERNAL_LIMIT_MS, cliSeconds, retryCliSeconds, worstCaseMs }
