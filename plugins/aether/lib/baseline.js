'use strict'

// Test baselines: the failing tests a test command already reports before a run, so that a merge is
// blocked only by a failure that is new since then. Pure: the callers run the command and read files.

// One pattern per output format. Each captures a test's name, or the path of a file, suite or package.
// The last three come after the others, so they can only name a line that none of the others names.
const PATTERNS = [
  /^\s*not ok \d+ - (.+)$/, // TAP and node:test, also for a file or a suite
  /^\s*[✕×✗] (.+)$/, // Jest and Vitest, in verbose output
  /^FAILED (.+?)(?: - .*)?$/, // pytest's short summary
  /^\s*--- FAIL: (\S+)/, // Go, subtests included
  /^\s*FAIL\s+(\S+)/, // Jest and Vitest, for a file that failed, and Go, for a package (a bare Go FAIL names nothing)
  /^ERROR (.+?)(?: - .*)?$/, // pytest's short summary, for a module that fails to import
  /^(?:FAIL|ERROR): (\S+ \([^)]*\))/, // Python unittest, by test and class
]

// A TAP failure with no name, such as "not ok 5": nothing tells it apart from a failure that is known.
const UNNAMED_TAP = /^\s*not ok \d+\s*(#.*)?$/

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

// Colour codes that a runner prints when it is told to colour its output, such as with FORCE_COLOR.
const ANSI_COLOR = /\x1b\[[0-9;]*m/g

// The lines of the output, without colour codes.
function plainLines(output) {
  return String(output ?? '').split(/\r?\n/).map((line) => line.replace(ANSI_COLOR, ''))
}

// The sorted, unique names of the failing tests that the output names.
function failureSignatures(output) {
  const names = new Set()
  for (const line of plainLines(output)) {
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
  // A failure with no name could be any of them, so the known ones cannot excuse the run.
  if (plainLines(output).some((line) => UNNAMED_TAP.test(line))) return { pass: false, reason: 'unparsed' }
  const signatures = failureSignatures(output)
  // Without a name there is no way to tell an old failure from a new one.
  if (signatures.length === 0) return { pass: false, reason: 'unparsed' }
  const known = new Set(Array.isArray(baseline.signatures) ? baseline.signatures : [])
  const fresh = signatures.filter((signature) => !known.has(signature))
  if (fresh.length === 0) return { pass: true, known: signatures }
  return { pass: false, reason: 'new failures', new: fresh }
}

module.exports = { failureSignatures, judge }
