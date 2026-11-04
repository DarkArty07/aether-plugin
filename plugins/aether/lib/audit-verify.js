'use strict'

// The gate of audit candidates and the settling of verifier verdicts: a finding only ever becomes verified through a valid verdict here.
// Family: audit.

const fs = require('node:fs')
const { TOPICS, TYPES, VERDICTS, parseArgs } = require('./audit-common.js')
const { isText, messageOf } = require('./common.js')

const COMMIT = /^[0-9a-fA-F]{7,40}$/
const MISSING_FIELDS = ['id', 'title', 'claim', 'trigger', 'impact']

function validLocation(location) {
  if (!location || typeof location !== 'object') return false
  if (typeof location.file !== 'string' || location.file.trim() === '') return false
  if (Number.isInteger(location.line) && location.line >= 1) return true
  return typeof location.commit === 'string' && COMMIT.test(location.commit)
}

// gate(candidates: Candidate[]) -> { accepted: Candidate[], discarded: Discard[], counts: { candidates: n } }
// Each candidate is checked in this order and goes to discarded with the first reason that fails.
function gate(candidates) {
  const accepted = []
  const discarded = []
  const seen = new Set()
  for (const candidate of candidates) {
    let reason = null
    if (!validLocation(candidate.location)) reason = 'no-location'
    else if (!isText(candidate.evidence)) reason = 'no-evidence'
    else if (!TOPICS.includes(candidate.topic)) reason = 'unknown-topic'
    else if (!TYPES.includes(candidate.type)) reason = 'unknown-type'
    else {
      for (const field of MISSING_FIELDS) {
        if (!isText(candidate[field])) {
          reason = `missing-field:${field}`
          break
        }
      }
      if (reason === null && seen.has(candidate.id)) reason = 'duplicate-id'
    }
    seen.add(candidate.id)
    if (reason === null) accepted.push(candidate)
    else discarded.push({ id: candidate.id, topic: candidate.topic, title: candidate.title, reason })
  }
  return { accepted, discarded, counts: { candidates: candidates.length } }
}

function verdictReason(candidate, verdict) {
  if (!verdict) return 'no verdict from the verifier'
  if (!VERDICTS.includes(verdict.verdict)) return 'the verdict is not one of the five'
  if (verdict.verdict === 'unverified' || verdict.exhausted === true) {
    return isText(verdict.reason) ? verdict.reason : 'the verifier could not decide'
  }
  if (verdict.verdict === 'refuted') {
    return isText(verdict.evidence) ? null : 'the verdict has no evidence'
  }
  if (!isText(verdict.evidence)) return 'the verdict has no evidence'
  if (!isText(verdict.rootCause) || !isText(verdict.trigger) || !isText(verdict.impact)) {
    return 'the verifier did not restate the claim (cause, trigger and impact)'
  }
  if (verdict.verdict === 'proven' && verdict.ranOn !== 'claude') return 'a verifier on another harness does not reproduce'
  if (verdict.verdict === 'proven' && !isText(verdict.reproduction)) return 'a proven verdict needs its reproduction'
  if (verdict.verdict === 'proposal' && candidate.type !== 'opportunity') return 'a proposal is only for opportunities'
  return null
}

// settle({ accepted, discarded, counts }, verdicts: Verdict[]) -> { findings: Finding[], discarded: Discard[], counts: { candidates, verified } }
// A verified finding is never produced by anything else: every failed verification settles as unverified, never verified.
function settle(gated, verdicts) {
  const byId = new Map((verdicts || []).map((verdict) => [verdict && verdict.id, verdict]))
  const findings = []
  const refuted = []
  for (const candidate of gated.accepted) {
    const verdict = byId.get(candidate.id)
    const reason = verdictReason(candidate, verdict)
    if (reason === null && verdict.verdict === 'refuted') {
      refuted.push({ id: candidate.id, topic: candidate.topic, title: candidate.title, reason: 'refuted' })
      continue
    }
    if (reason === null) {
      findings.push({
        ...candidate,
        verification: verdict.verdict,
        status: 'verified',
        rootCause: verdict.rootCause,
        trigger: verdict.trigger,
        impact: verdict.impact,
        verifierEvidence: verdict.evidence,
        reproduction: verdict.reproduction,
        ranOn: verdict.ranOn,
      })
    } else {
      findings.push({
        ...candidate,
        verification: 'unverified',
        status: 'unverified',
        rootCause: verdict && verdict.rootCause,
        trigger: candidate.trigger,
        impact: candidate.impact,
        verifierEvidence: verdict && verdict.evidence,
        reproduction: verdict && verdict.reproduction,
        ranOn: verdict && verdict.ranOn,
        reason,
      })
    }
  }
  return {
    findings,
    discarded: [...gated.discarded, ...refuted],
    counts: { candidates: gated.counts.candidates, verified: findings.filter((finding) => finding.status === 'verified').length },
  }
}

// command(args, ctx): ctx.subcommand is 'candidates' (args: <candidates.json>) or 'verdicts' (args: <candidates-output.json> <verdicts.json>).
async function command(args, ctx) {
  if (ctx.subcommand === 'candidates') {
    const parsed = parseArgs(args, { values: [], booleans: [], positionals: [1, 1] })
    const file = parsed.positionals[0]
    let candidates
    try {
      candidates = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      throw new Error(`${file}: ${messageOf(err)}`)
    }
    if (!Array.isArray(candidates)) throw new Error(`${file}: not a list of candidates`)
    const result = gate(candidates)
    return { code: 0, result, summary: { accepted: result.accepted.length, discarded: result.discarded.length } }
  }
  if (ctx.subcommand === 'verdicts') {
    const parsed = parseArgs(args, { values: [], booleans: [], positionals: [2, 2] })
    const [gatedFile, verdictsFile] = parsed.positionals
    let gated
    let verdicts
    try {
      gated = JSON.parse(fs.readFileSync(gatedFile, 'utf8'))
      verdicts = JSON.parse(fs.readFileSync(verdictsFile, 'utf8'))
    } catch (err) {
      throw new Error(`${gatedFile} or ${verdictsFile}: ${messageOf(err)}`)
    }
    const counted = gated && gated.counts && Number.isInteger(gated.counts.candidates)
    if (!gated || !Array.isArray(gated.accepted) || !Array.isArray(gated.discarded) || !counted || !Array.isArray(verdicts)) {
      throw new Error(`${gatedFile} or ${verdictsFile}: not a candidates output and a verdicts list`)
    }
    const result = settle(gated, verdicts)
    const unverified = result.findings.filter((finding) => finding.status === 'unverified').length
    return {
      code: 0,
      result,
      summary: { findings: result.findings.length, verified: result.counts.verified, unverified, discarded: result.discarded.length },
    }
  }
  throw new Error(`audit-verify handles candidates and verdicts, not ${ctx.subcommand}`)
}

module.exports = {
  gate,
  settle,
  command,
}
