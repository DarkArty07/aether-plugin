'use strict'

// The audit's report: the eleven sections in Spanish and English, their labels by table, and their saving.
// Family: audit.

const fs = require('node:fs')
const { parseArgs, usageError } = require('./audit-common.js')
const { nextReportDir, writeReport } = require('./audit-store.js')
const { dataDir } = require('./run.js')

const SECTIONS = ['header', 'waits', 'assumptions', 'list', 'unverified', 'sinceLast', 'discarded', 'notCovered', 'radar', 'cost', 'question']

const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3']

const CHECK_ORDER = ['tests', 'lint', 'dependencies', 'secrets', 'todos', 'branches', 'issues', 'prs', 'hotspots']

const DISCARD_ORDER = ['refuted', 'covered-by-issue', 'merged', 'no-location', 'no-evidence']

// Every fixed word of the report lives in one of these two tables, never in a function body.
const ES = {
  topics: { bugs: 'Bug', security: 'Seguridad', dependencies: 'Dependencias', tests: 'Tests', reliability: 'Fiabilidad', performance: 'Rendimiento', accessibility: 'Accesibilidad', architecture: 'Arquitectura', docs: 'Docs', releases: 'Versiones', hygiene: 'Higiene', opportunities: 'Oportunidad' },
  verifications: { proven: 'comprobado', 'read-confirmed': 'confirmado leyendo', proposal: 'propuesta' },
  types: { bug: 'Bug', risk: 'Riesgo', debt: 'Deuda', docs: 'Docs', opportunity: 'Oportunidad', other: 'Otro' },
  sizes: { S: 'Pequeño', M: 'Mediano', L: 'Grande' },
  marks: { new: 'nuevo', still: 'sigue' },
  levels: { P0: 'Urge ya', P1: 'Pronto', P2: 'Programable', P3: 'Cuando puedas / ideas' },
  discardLabels: { refuted: 'refutados', 'covered-by-issue': 'cubiertos por un issue', merged: 'repetidos', 'no-location': 'sin ubicación', 'no-evidence': 'sin evidencia' },
  checks: { tests: 'Tests', lint: 'Linter', dependencies: 'Dependencias', secrets: 'Secretos', todos: 'TODO y FIXME', branches: 'Ramas', issues: 'Issues', prs: 'Pull requests', hotspots: 'Hotspots' },
  waits: '**Espera tu sí**',
  assumptions: '**Supuestos**',
  none: '- (nada)',
  unverified: '**Sin verificar (no los ordené)**',
  notCovered: '**No cubrí:**',
  unreadableCost: 'No pude leer el costo de la sesión; no pongo una cifra.',
  questionEmpty: '**¿Cuáles tomas?** No hay hallazgos verificados para tomar.',
  sinceLastNone: '**Desde la última auditoría:** no hay una auditoría anterior.',
  header: (name, date, count, candidates, verified) => `**Auditoría de ${name} · ${date} · ${count} temas · ${candidates} hallazgos, ${verified} sobrevivieron la verificación**`,
  band: (priority, level) => `**${priority} · ${level}**`,
  why: (priority) => `*Por qué ${priority}:*`,
  unattributable: (first, second, files) => `- Cambio no atribuible durante la auditoría (entre ${first} y ${second}): ${files}`,
  sinceLast: (date, news, stills, resolved) => `**Desde la última auditoría (${date}):** ${news} nuevos, ${stills} siguen, ${resolved} resueltos.`,
  sinceLastExtra: (left) => ` ${left} sin revisar esta vez, porque sus temas quedaron fuera.`,
  discarded: (total, parts) => `**Descartados:** ${total}${parts ? ` (${parts})` : ''}.`,
  noCompare: (reason) => ` No pude comparar con los issues abiertos (${reason}).`,
  savedList: (dir) => ` La lista completa está en el reporte guardado: ${dir}`,
  notRun: (check, reason) => `${check}: no se corrió: ${reason}`,
  notApplicable: (check, reason) => `${check}: no aplica: ${reason}`,
  couldNot: (check, reason) => `${check}: no se pudo: ${reason}`,
  truncated: (check) => `${check}: se leyó solo una parte`,
  leftOut: (topic, reason) => `${topic}: tema fuera: ${reason}`,
  notLooked: (topic, items) => `${topic}: no miré ${items}`,
  exhausted: (topic) => `Revisor agotado: ${topic}`,
  radar: (text) => `**RADAR:** ${text}`,
  question: (example) => `**¿Cuáles tomas?** Por ejemplo: «${example}».`,
  exampleJoin: (head, last) => `${head} y ${last}`,
}

const EN = {
  topics: { bugs: 'Bug', security: 'Security', dependencies: 'Dependencies', tests: 'Tests', reliability: 'Reliability', performance: 'Performance', accessibility: 'Accessibility', architecture: 'Architecture', docs: 'Docs', releases: 'Releases', hygiene: 'Hygiene', opportunities: 'Opportunity' },
  verifications: { proven: 'proven', 'read-confirmed': 'confirmed by reading', proposal: 'proposal' },
  types: { bug: 'Bug', risk: 'Risk', debt: 'Debt', docs: 'Docs', opportunity: 'Opportunity', other: 'Other' },
  sizes: { S: 'Small', M: 'Medium', L: 'Large' },
  marks: { new: 'new', still: 'still' },
  levels: { P0: 'Now', P1: 'Soon', P2: 'Schedulable', P3: 'When you can / ideas' },
  discardLabels: { refuted: 'refuted', 'covered-by-issue': 'covered by an issue', merged: 'merged', 'no-location': 'no location', 'no-evidence': 'no evidence' },
  checks: { tests: 'Tests', lint: 'Linter', dependencies: 'Dependencies', secrets: 'Secrets', todos: 'TODO and FIXME', branches: 'Branches', issues: 'Issues', prs: 'Pull requests', hotspots: 'Hotspots' },
  waits: '**Awaiting your yes**',
  assumptions: '**Assumptions**',
  none: '- (none)',
  unverified: '**Unverified (not ranked)**',
  notCovered: '**Not covered:**',
  unreadableCost: 'I could not read the session cost; I give no figure.',
  questionEmpty: '**Which do you take?** There are no verified findings to take.',
  sinceLastNone: '**Since the last audit:** there is no earlier audit.',
  header: (name, date, count, candidates, verified) => `**Audit of ${name} · ${date} · ${count} topics · ${candidates} findings, ${verified} survived verification**`,
  band: (priority, level) => `**${priority} · ${level}**`,
  why: (priority) => `*Why ${priority}:*`,
  unattributable: (first, second, files) => `- Unattributable change during the audit (between ${first} and ${second}): ${files}`,
  sinceLast: (date, news, stills, resolved) => `**Since the last audit (${date}):** ${news} new, ${stills} still open, ${resolved} resolved.`,
  sinceLastExtra: (left) => ` ${left} not re-audited, because their topics were left out.`,
  discarded: (total, parts) => `**Discarded:** ${total}${parts ? ` (${parts})` : ''}.`,
  noCompare: (reason) => ` I could not compare with the open issues (${reason}).`,
  savedList: (dir) => ` The full list is in the saved report: ${dir}`,
  notRun: (check, reason) => `${check}: not run: ${reason}`,
  notApplicable: (check, reason) => `${check}: not applicable: ${reason}`,
  couldNot: (check, reason) => `${check}: could not: ${reason}`,
  truncated: (check) => `${check}: only part was read`,
  leftOut: (topic, reason) => `${topic}: left out: ${reason}`,
  notLooked: (topic, items) => `${topic}: I did not look at ${items}`,
  exhausted: (topic) => `Reviewer ran out: ${topic}`,
  radar: (text) => `**RADAR:** ${text}`,
  question: (example) => `**Which do you take?** For example: «${example}».`,
  exampleJoin: (head, last) => `${head} and ${last}`,
}

function strings(lang) {
  return String(lang || '').toLowerCase().startsWith('es') ? ES : EN
}

function renderLocation(location) {
  if (location.commit) return `\`${location.file}\` (commit \`${location.commit}\`)`
  return `\`${location.file}:${location.line}\``
}

function renderLocations(locations) {
  return (locations || []).map(renderLocation).join(', ')
}

function renderListItem(T, item) {
  const mark = item.mark === 'new' || item.mark === 'still' ? ` · ${T.marks[item.mark]}` : ''
  return [
    `${item.number}. **[${T.topics[item.topic] || item.topic} · ${T.verifications[item.verification] || item.verification}]** ${item.title}`,
    `   ${renderLocations(item.locations)} · ${T.types[item.type] || item.type} — ${item.claim}`,
    `   ${T.why(item.priority)} ${item.reason} · ${T.sizes[item.size] || item.size} · ${item.how}${mark}`,
  ].join('\n')
}

function renderUnverifiedItem(T, item) {
  return `- **[${T.topics[item.topic] || item.topic}]** ${item.title} (${renderLocations(item.locations)}): ${item.reason}`
}

function sinceLastSection(T, sinceLast) {
  if (!sinceLast || !sinceLast.previous) return T.sinceLastNone
  const counts = sinceLast.counts || {}
  const resolved = Array.isArray(sinceLast.resolved) ? sinceLast.resolved.length : 0
  const notReaudited = Array.isArray(sinceLast.notReaudited) ? sinceLast.notReaudited : []
  let line = T.sinceLast(sinceLast.previous.date, counts.new, counts.still, resolved)
  if (notReaudited.length > 0) line += T.sinceLastExtra(notReaudited.length)
  return line
}

function countReasons(discarded) {
  const byReason = {}
  for (const entry of discarded) byReason[entry.reason] = (byReason[entry.reason] || 0) + 1
  return byReason
}

function discardParts(T, discarded) {
  const counts = countReasons(discarded)
  const parts = []
  const left = { ...counts }
  for (const reason of DISCARD_ORDER) {
    if (left[reason]) {
      parts.push(`${T.discardLabels[reason]}: ${left[reason]}`)
      delete left[reason]
    }
  }
  for (const entry of discarded) {
    if (Object.hasOwn(left, entry.reason)) {
      parts.push(`${T.discardLabels[entry.reason] || entry.reason}: ${left[entry.reason]}`)
      delete left[entry.reason]
    }
  }
  return parts
}

function discardedSection(T, discarded, issueComparison, savedTo) {
  const parts = discardParts(T, discarded)
  let line = T.discarded(discarded.length, parts.join(', '))
  if (issueComparison && issueComparison.state !== 'done') line += T.noCompare(issueComparison.reason)
  if (savedTo) line += T.savedList(savedTo)
  return line
}

function notCoveredLines(T, meta, analysis) {
  const lines = []
  const checks = (analysis && analysis.checks) || {}
  for (const key of CHECK_ORDER) {
    const check = checks[key]
    if (!check) continue
    if (check.state === 'result') {
      if (check.truncated) lines.push(T.truncated(T.checks[key]))
      continue
    }
    if (check.notRun) lines.push(T.notRun(T.checks[key], check.reason))
    else if (check.state === 'not-applicable') lines.push(T.notApplicable(T.checks[key], check.reason))
    else lines.push(T.couldNot(T.checks[key], check.reason))
  }
  for (const entry of (meta && meta.leftOut) || []) {
    lines.push(T.leftOut(T.topics[entry.topic] || entry.topic, entry.reason))
  }
  const reviewers = (meta && meta.reviewers) || {}
  for (const entry of reviewers.notLooked || []) {
    lines.push(T.notLooked(T.topics[entry.topic] || entry.topic, (entry.items || []).join(', ')))
  }
  for (const topic of reviewers.exhausted || []) {
    lines.push(T.exhausted(T.topics[topic] || topic))
  }
  return lines
}

function exampleNumbers(T, numbers) {
  const shown = numbers.slice(0, 3)
  if (shown.length <= 1) return shown.join('')
  if (shown.length === 2) return T.exampleJoin(shown[0], shown[1])
  return T.exampleJoin(shown.slice(0, -1).join(', '), shown[shown.length - 1])
}

function questionSection(T, list) {
  if (list.length === 0) return T.questionEmpty
  return T.question(exampleNumbers(T, list.map((item) => item.number)))
}

// input = { meta, analysis, triage } as in Global Constraints and below; lang is 'es' or anything else (anything else is English).
// -> { data, markdown }; data is the report.json object; data.sections is the ids in order:
//    ['header', 'waits', 'assumptions', 'list', 'unverified', 'sinceLast', 'discarded', 'notCovered', 'radar', 'cost', 'question']
// options.savedTo (optional) is the folder where the report is saved.
function render(input, lang, options = {}) {
  const T = strings(lang)
  const { meta, analysis, triage } = input
  const list = triage.list || []
  const unverified = triage.unverified || []
  const discarded = triage.discarded || []
  const withCounts = { ...triage.sinceLast, counts: { new: list.filter((item) => item.mark === 'new').length, still: list.filter((item) => item.mark === 'still').length } }

  const sections = []
  sections.push(T.header(analysis.project.name, meta.date, (meta.topics || []).length, triage.counts.candidates, triage.counts.verified))

  const waits = (meta.waits || []).map((wait) => `- ${wait}`)
  sections.push([T.waits, ...(waits.length > 0 ? waits : [T.none])].join('\n'))

  const assumptions = (meta.assumptions || []).map((assumption) => `- ${assumption}`)
  for (const change of ((analysis.changes && analysis.changes.unattributable) || [])) {
    const files = (change.items || []).flatMap((item) => item.files || [])
    assumptions.push(T.unattributable(change.between[0], change.between[1], files.join(', ')))
  }
  sections.push([T.assumptions, ...(assumptions.length > 0 ? assumptions : [T.none])].join('\n'))

  for (const priority of PRIORITY_ORDER) {
    const band = list.filter((item) => item.priority === priority)
    if (band.length === 0) continue
    sections.push([T.band(priority, T.levels[priority]), ...band.map((item) => renderListItem(T, item))].join('\n'))
  }

  const unverifiedLines = unverified.map((item) => renderUnverifiedItem(T, item))
  sections.push([T.unverified, ...(unverifiedLines.length > 0 ? unverifiedLines : [T.none])].join('\n'))

  sections.push(sinceLastSection(T, withCounts))

  sections.push(discardedSection(T, discarded, triage.issueComparison, options.savedTo))

  const covered = notCoveredLines(T, meta, analysis)
  sections.push([T.notCovered, ...(covered.length > 0 ? covered.map((line) => `- ${line}`) : [T.none])].join('\n'))

  sections.push(T.radar(meta.radar))

  const cost = meta.cost || {}
  sections.push(cost.readable && cost.text ? cost.text : T.unreadableCost)

  sections.push(questionSection(T, list))

  const data = {
    project: analysis.project,
    date: meta.date,
    meta: { durationSeconds: meta.durationSeconds, costUsd: meta.costUsd, topics: meta.topics, leftOut: meta.leftOut },
    counts: triage.counts,
    list,
    unverified,
    sinceLast: triage.sinceLast,
    discarded: { total: discarded.length, byReason: countReasons(discarded), items: discarded },
    issueComparison: triage.issueComparison,
    notCovered: covered,
    waits: meta.waits,
    assumptions: meta.assumptions,
    radar: meta.radar,
    cost: meta.cost,
    sections: [...SECTIONS],
  }
  return { data, markdown: sections.join('\n\n') }
}

// ctx = { cwd, env, subcommand: 'report' }; args = --meta <file> --analysis <file> --triage <file> [--lang <l>] [--save]
// -> { code: 0, result: { ok: true, lang, sections, markdown, saved? }, summary: { sections: 11, saved? } }
// With --save: dir = nextReportDir(dataDir of lib/run.js for ctx.env, analysis.project.key, meta.date), render with savedTo = dir, writeReport. saved is dir.
async function command(args, ctx) {
  const parsed = parseArgs(args, { values: ['meta', 'analysis', 'triage', 'lang'], booleans: ['save'], positionals: [0, 0] })
  for (const flag of ['meta', 'analysis', 'triage']) {
    if (!parsed.values[flag]) throw usageError(`needs --${flag} <file>`)
  }
  const lang = parsed.values.lang || 'en'
  let meta
  let analysis
  let triage
  try {
    meta = JSON.parse(fs.readFileSync(parsed.values.meta, 'utf8'))
    analysis = JSON.parse(fs.readFileSync(parsed.values.analysis, 'utf8'))
    triage = JSON.parse(fs.readFileSync(parsed.values.triage, 'utf8'))
  } catch (err) {
    return { code: 1, result: { ok: false, error: String((err && err.message) || err) } }
  }
  let saved
  let out = render({ meta, analysis, triage }, lang)
  if (parsed.booleans.save) {
    const dir = nextReportDir(dataDir(ctx.env), analysis.project.key, meta.date)
    out = render({ meta, analysis, triage }, lang, { savedTo: dir })
    writeReport(dir, out.data, out.markdown)
    saved = dir
  }
  const result = { ok: true, lang, sections: out.data.sections, markdown: out.markdown }
  if (saved !== undefined) result.saved = saved
  const summary = { sections: out.data.sections.length }
  if (saved !== undefined) summary.saved = saved
  return { code: 0, result, summary }
}

module.exports = {
  render,
  command,
}
