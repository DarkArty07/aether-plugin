'use strict'

// Test baselines: the failing tests a test command already reports before a run, so that a merge is
// blocked only by a failure that is new since then. Pure: the callers run the command and read files.

// One pattern per output format. Each captures a test's name, or the path of a file or suite.
const PATTERNS = [
  /^\s*not ok \d+ - (.+)$/, // TAP and node:test, also for a file or a suite
  /^\s*[✕×✗] (.+)$/, // Jest and Vitest, in verbose output
  /^FAILED (.+?)(?: - .*)?$/, // pytest's short summary
  /^\s*--- FAIL: (\S+)/, // Go, subtests included
]

// Strips what changes between runs without the test changing: node:test's timing, a duration in
// parentheses or brackets, and spacing.
function normalize(name) {
  return name
    .trim()
    .replace(/\s+# time=.*$/, '')
    .replace(/\s*[(\[]\d+(?:\.\d+)?\s*m?s[)\]]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// The sorted, unique names of the failing tests that the output names.
function failureSignatures(output) {
  const names = new Set()
  for (const line of String(output ?? '').split(/\r?\n/)) {
    for (const pattern of PATTERNS) {
      const match = pattern.exec(line)
      if (!match) continue
      const name = normalize(match[1])
      if (name !== '') names.add(name)
      break
    }
  }
  return [...names].sort()
}

// Judges a test run against the baseline. A passing command passes. A failing one passes only when
// every failure it names is in the baseline; otherwise it says why it cannot pass.
function judge(baseline, { exitCode, output }) {
  if (exitCode === 0) return { pass: true }
  if (!baseline) return { pass: false, reason: 'no baseline' }
  const signatures = failureSignatures(output)
  // Without a name there is no way to tell an old failure from a new one.
  if (signatures.length === 0) return { pass: false, reason: 'unparsed' }
  const known = new Set(Array.isArray(baseline.signatures) ? baseline.signatures : [])
  const fresh = signatures.filter((signature) => !known.has(signature))
  if (fresh.length === 0) return { pass: true, known: signatures }
  return { pass: false, reason: 'new failures', new: fresh }
}

module.exports = { failureSignatures, judge }
