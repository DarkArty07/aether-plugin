'use strict'

// The cleanup of settled audit findings: the audit's own findings come in, same-cause findings merge, open issues cover, and the previous audit marks new and still.
// Family: audit.

const fs = require('node:fs')
const { TOPICS, parseArgs, usageError } = require('./audit-common.js')
const { messageOf } = require('./common.js')
const { previousReport } = require('./audit-store.js')
const { dataDir } = require('./run.js')
const { git } = require('./git.js')

const VERIFICATION_RANK = { proven: 3, 'read-confirmed': 2, proposal: 1 }

function effectiveKey(finding) {
  return finding && (finding.causeKey || finding.id)
}

function sameLocation(first, second) {
  return first.file === second.file && first.line === second.line && first.commit === second.commit
}

function groupLocations(members) {
  const locations = []
  for (const member of members) {
    if (member.location && !locations.some((known) => sameLocation(known, member.location))) locations.push(member.location)
  }
  return locations
}

function strongest(members) {
  let best = 'unverified'
  let rank = 0
  for (const member of members) {
    const at = VERIFICATION_RANK[member.verification] || 0
    if (at > rank) {
      rank = at
      best = member.verification
    }
  }
  return best
}

// Merges the findings with the same causeKey and the same status; a verified and an unverified finding never merge.
function mergeGroups(findings) {
  const order = []
  const groups = new Map()
  for (const finding of findings) {
    const key = `${finding.status} ${effectiveKey(finding)}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key).push(finding)
  }
  const merged = []
  const discarded = []
  for (const key of order) {
    const members = groups.get(key)
    const survivor = members[0]
    merged.push({ ...survivor, locations: groupLocations(members), mergedFrom: members.map((member) => member.id), verification: strongest(members) })
    for (const member of members.slice(1)) {
      discarded.push({ id: member.id, title: member.title, topic: member.topic, reason: 'merged', into: survivor.id })
    }
  }
  return { merged, discarded }
}

function issueNumbers(check) {
  return new Set((check.open || []).map((issue) => issue.number))
}

// clean(settled, analysis, { topics, dataDir }) -> { findings, unverified, discarded, counts, issueComparison, sinceLast }
function clean(settled, analysis, options) {
  const topics = options.topics || []
  const self = (analysis && analysis.selfFindings) || []
  const input = [...(settled.findings || []), ...self]
  const counts = { candidates: settled.counts.candidates + self.length, verified: settled.counts.verified + self.length }
  const { merged, discarded: mergedAway } = mergeGroups(input)
  const issues = (analysis && analysis.checks && analysis.checks.issues) || {}
  const open = issues.state === 'result' ? issueNumbers(issues) : null
  const findings = []
  const unverified = []
  const covered = []
  const removed = []
  const removedKeys = new Set()
  for (const finding of merged) {
    if (open !== null && finding.coveredBy !== undefined && finding.coveredBy !== null && open.has(finding.coveredBy)) {
      covered.push({ id: finding.id, title: finding.title, topic: finding.topic, reason: 'covered-by-issue', issue: finding.coveredBy })
      removed.push({ id: finding.id, issue: finding.coveredBy })
      removedKeys.add(effectiveKey(finding))
    } else {
      if (open !== null && finding.coveredBy !== undefined && finding.coveredBy !== null) {
        finding.note = `issue #${finding.coveredBy} is not open`
      }
      if (finding.status === 'verified') findings.push(finding)
      else unverified.push(finding)
    }
  }
  const issueComparison = open !== null
    ? { state: 'done', removed }
    : { state: 'could-not', reason: issues.reason, removed: [] }
  const sinceLast = comparePrevious(analysis, findings, removedKeys, topics, options.dataDir)
  if (options.reverified) applyReverify(sinceLast, findings, options.reverified)
  return {
    findings,
    unverified,
    discarded: [...(settled.discarded || []), ...mergedAway, ...covered],
    counts,
    issueComparison,
    sinceLast,
  }
}

function pickPrevious(item) {
  return { causeKey: item.causeKey, title: item.title, topic: item.topic }
}

function ownStep(causeKey) {
  const match = /^audit-changed-project-(.+)$/.exec(causeKey || '')
  return match ? match[1] : null
}

function missingLocations(item) {
  if (Array.isArray(item.locations)) return item.locations
  if (item.location && typeof item.location === 'object') return [item.location]
  return []
}

// The tip of a ref, or null when the name is not a ref (a file path, or a branch that is gone).
function refTip(name, root) {
  try {
    const ref = git(['rev-parse', '--verify', '--quiet', `${name}^{commit}`], root, { allowFail: true })
    return ref !== null && ref.status === 0 && ref.stdout !== '' ? ref.stdout : null
  } catch {
    return null
  }
}

// Whether a path existed in a commit's tree.
function pathIn(commit, file, root) {
  try {
    return git(['cat-file', '-e', `${commit}:${file}`], root, { allowFail: true }).status === 0
  } catch {
    return false
  }
}

function filesDifferSince(files, earlierHead, currentHead, root) {
  const unique = [...new Set(files.filter((file) => typeof file === 'string' && file !== ''))]
  if (unique.length === 0) return false
  let out = null
  try {
    out = git(['diff', '--quiet', earlierHead, currentHead, '--', ...unique], root, { allowFail: true })
  } catch {
    return false
  }
  if (out === null) return false
  return out.status === 1
}

function evidenceChangedSince(item, earlierHead, currentHead, root) {
  if (typeof earlierHead !== 'string' || earlierHead === '') return false
  if (typeof currentHead !== 'string' || currentHead === '') return false
  if (typeof root !== 'string' || root === '') return false
  const locations = missingLocations(item)
  const files = []
  for (const location of locations) {
    if (!location || typeof location.file !== 'string') continue
    if (typeof location.commit === 'string' && location.commit !== '') {
      // A branch located by its tip counts as changed only when it is gone: a branch that got a new commit may still hold
      // the work the finding was about. A file located by a commit (a secret in the history) is a path of that commit's
      // tree, and is compared as a file below.
      if (refTip(location.file, root) !== null) continue
      if (!pathIn(location.commit, location.file, root)) return true
    }
    files.push(location.file)
  }
  return filesDifferSince(files, earlierHead, currentHead, root)
}

function comparePrevious(analysis, findings, removed, topics, storeDir) {
  const key = analysis && analysis.project && analysis.project.key
  const previous = key === undefined ? null : previousReport(storeDir, key)
  if (!previous) {
    for (const finding of findings) finding.mark = null
    return { previous: null, resolved: [], notReaudited: [], notFoundAgain: [] }
  }
  const list = (previous.report && previous.report.list) || []
  const known = new Set(list.map((item) => item.causeKey))
  const current = new Set(findings.map((finding) => effectiveKey(finding)))
  for (const finding of findings) finding.mark = known.has(effectiveKey(finding)) ? 'still' : 'new'
  const checks = (analysis && analysis.checks) || {}
  const earlierHead = previous.report && previous.report.project && previous.report.project.head
  const currentHead = analysis && analysis.project && analysis.project.head
  const root = analysis && analysis.project && analysis.project.root
  const resolved = []
  const notReaudited = []
  const notFoundAgain = []
  const settleMissing = (item) => {
    if (evidenceChangedSince(item, earlierHead, currentHead, root)) resolved.push(pickPrevious(item))
    else notFoundAgain.push(pickPrevious(item))
  }
  for (const item of list) {
    const step = ownStep(item.causeKey)
    if (step !== null) {
      const ran = checks[step] && checks[step].state === 'result'
      // The analysis's own findings are re-checked by the same step, which is not a sample: when it ran and did not
      // find the change again, the item is resolved.
      if (!ran) notReaudited.push(pickPrevious(item))
      else if (!current.has(item.causeKey) && !removed.has(item.causeKey)) resolved.push(pickPrevious(item))
    } else if (!topics.includes(item.topic)) {
      notReaudited.push(pickPrevious(item))
    } else if (!current.has(item.causeKey) && !removed.has(item.causeKey)) {
      settleMissing(item)
    }
  }
  return { previous: { date: previous.date }, resolved, notReaudited, notFoundAgain }
}

// A reverify outcome for an item the reviewers did report again is already in the list: it stays out of the
// reverify lists, which hold only items no candidate matched.
function applyReverify(sinceLast, findings, reverified) {
  const outcome = new Map()
  for (const item of reverified.items || []) {
    if (item && typeof item.causeKey === 'string') outcome.set(item.causeKey, item.reverify)
  }
  const current = new Set(findings.map((finding) => effectiveKey(finding)))
  sinceLast.reverified = []
  sinceLast.refuted = []
  // A sigue or resuelto outcome moves the item out of not found again and out of the resolved list alike: an
  // earlier item whose location files changed went through reverify too, and its verdict decides. A sigue item
  // is reported as still open, a resuelto one as resolved on evidence. A failed verification never resolves:
  // a not-found-again outcome moves the item out of the resolved list back into not found again.
  const moveOut = (list, fromResolved = false) => {
    const kept = []
    for (const item of list || []) {
      const state = outcome.get(item.causeKey)
      if ((state === 'sigue' || state === 'resuelto') && !current.has(item.causeKey)) {
        (state === 'sigue' ? sinceLast.reverified : sinceLast.refuted).push(item)
      } else if (fromResolved && state === 'not-found-again' && !current.has(item.causeKey)) {
        sinceLast.notFoundAgain.push(item)
      } else {
        kept.push(item)
      }
    }
    return kept
  }
  sinceLast.notFoundAgain = moveOut(sinceLast.notFoundAgain)
  sinceLast.resolved = moveOut(sinceLast.resolved, true)
  // The cut travels nested as counts.cut; a top-level cut only survives from older files. Nested first here,
  // as in cutOf, so both readers agree.
  const nested = reverified && reverified.counts && reverified.counts.cut
  const top = reverified && reverified.cut
  sinceLast.reverifyCut = Number.isInteger(nested) && nested >= 0 ? nested : Number.isInteger(top) && top >= 0 ? top : 0
  sinceLast.reverifyCeiling = reverified.ceiling || null
}

// command(args, ctx): <settled.json> --analysis <file> --topics <a,b,c> [--reverified <file>]; the data directory is run.dataDir(ctx.env).
async function command(args, ctx) {
  const parsed = parseArgs(args, { values: ['analysis', 'topics', 'reverified'], booleans: [], positionals: [1, 1] })
  if (!parsed.values.analysis) throw usageError('needs --analysis <file>')
  if (!parsed.values.topics) throw usageError('needs --topics <a,b,c>')
  const topics = parsed.values.topics.split(',').filter((name) => name !== '')
  for (const topic of topics) {
    if (!TOPICS.includes(topic)) throw usageError(`unknown topic: ${topic}`)
  }
  const settledFile = parsed.positionals[0]
  const analysisFile = parsed.values.analysis
  let settled
  let analysis
  try {
    settled = JSON.parse(fs.readFileSync(settledFile, 'utf8'))
    analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'))
  } catch (err) {
    throw new Error(`${settledFile} or ${analysisFile}: ${messageOf(err)}`)
  }
  let reverified = null
  if (parsed.values.reverified) {
    try {
      reverified = JSON.parse(fs.readFileSync(parsed.values.reverified, 'utf8'))
    } catch (err) {
      throw new Error(`${parsed.values.reverified}: ${messageOf(err)}`)
    }
    if (!reverified || !Array.isArray(reverified.items)) throw new Error(`${parsed.values.reverified}: not a reverify-verdicts output`)
  }
  const counted = settled && settled.counts && Number.isInteger(settled.counts.candidates) && Number.isInteger(settled.counts.verified)
  if (!settled || !Array.isArray(settled.findings) || !Array.isArray(settled.discarded) || !counted || !analysis || typeof analysis !== 'object') {
    throw new Error(`${settledFile} or ${analysisFile}: not a settled output and an analysis`)
  }
  const result = clean(settled, analysis, { topics, dataDir: dataDir(ctx.env), reverified })
  return {
    code: 0,
    result,
    summary: { findings: result.findings.length, unverified: result.unverified.length, discarded: result.discarded.length },
  }
}

module.exports = {
  clean,
  command,
  effectiveKey,
  missingLocations,
}
