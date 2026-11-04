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
}

function strings(lang) {
  return String(lang || '').toLowerCase().startsWith('es') ? ES : EN
}

function isSpanish(lang) {
  return String(lang || '').toLowerCase().startsWith('es')
}

function headerLine(spanish, name, date, topics, candidates, verified) {
  if (spanish) return `**Auditoría de ${name} · ${date} · ${topics} temas · ${candidates} hallazgos, ${verified} sobrevivieron la verificación**`
  return `**Audit of ${name} · ${date} · ${topics} topics · ${candidates} findings, ${verified} survived verification**`
}

function renderLocation(location) {
  if (location.commit) return `\`${location.file}\` (commit \`${location.commit}\`)`
  return `\`${location.file}:${location.line}\``
}

function renderLocations(locations) {
  return (locations || []).map(renderLocation).join(', ')
}

function bandHeading(priority, T) {
  return `**${priority} · ${T.levels[priority]}**`
}

function whyLabel(spanish, priority) {
  return spanish ? `*Por qué ${priority}:*` : `*Why ${priority}:*`
}

function renderListItem(T, spanish, item) {
  const topic = T.topics[item.topic] || item.topic
  const verification = T.verifications[item.verification] || item.verification
  const type = T.types[item.type] || item.type
  const size = T.sizes[item.size] || item.size
  const mark = item.mark === 'new' || item.mark === 'still' ? ` · ${T.marks[item.mark]}` : ''
  return [
    `${item.number}. **[${topic} · ${verification}]** ${item.title}`,
    `   ${renderLocations(item.locations)} · ${type} — ${item.claim}`,
    `   ${whyLabel(spanish, item.priority)} ${item.reason} · ${size} · ${item.how}${mark}`,
  ].join('\n')
}

function renderUnverifiedItem(T, item) {
  const topic = T.topics[item.topic] || item.topic
  return `- **[${topic}]** ${item.title} (${renderLocations(item.locations)}): ${item.reason}`
}

function sinceLastSection(T, spanish, sinceLast) {
  if (!sinceLast || !sinceLast.previous) return T.sinceLastNone
  const counts = sinceLast.counts || {}
  const resolved = Array.isArray(sinceLast.resolved) ? sinceLast.resolved.length : 0
  const notReaudited = Array.isArray(sinceLast.notReaudited) ? sinceLast.notReaudited : []
  const date = sinceLast.previous.date
  let line
  if (spanish) line = `**Desde la última auditoría (${date}):** ${counts.new} nuevos, ${counts.still} siguen, ${resolved} resueltos.`
  else line = `**Since the last audit (${date}):** ${counts.new} new, ${counts.still} still open, ${resolved} resolved.`
  if (notReaudited.length > 0) line += spanish ? ` ${notReaudited.length} sin revisar esta vez, porque sus temas quedaron fuera.` : ` ${notReaudited.length} not re-audited, because their topics were left out.`
  return line
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

function countReasons(discarded) {
  const byReason = {}
  for (const entry of discarded) byReason[entry.reason] = (byReason[entry.reason] || 0) + 1
  return byReason
}

function discardedSection(T, spanish, discarded, issueComparison, savedTo) {
  const parts = discardParts(T, discarded)
  let line
  if (spanish) line = `**Descartados:** ${discarded.length}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`
  else line = `**Discarded:** ${discarded.length}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`
  if (issueComparison && issueComparison.state !== 'done') {
    line += spanish ? ` No pude comparar con los issues abiertos (${issueComparison.reason}).` : ` I could not compare with the open issues (${issueComparison.reason}).`
  }
  if (savedTo) line += spanish ? ` La lista completa está en el reporte guardado: ${savedTo}` : ` The full list is in the saved report: ${savedTo}`
  return line
}

function notCoveredLines(T, spanish, meta, analysis) {
  const lines = []
  const checks = (analysis && analysis.checks) || {}
  for (const key of CHECK_ORDER) {
    const check = checks[key]
    if (!check) continue
    const label = T.checks[key]
    if (check.state === 'result') {
      if (check.truncated) lines.push(spanish ? `${label}: se leyó solo una parte` : `${label}: only part was read`)
      continue
    }
    if (check.notRun) lines.push(spanish ? `${label}: no se corrió: ${check.reason}` : `${label}: not run: ${check.reason}`)
    else if (check.state === 'not-applicable') lines.push(spanish ? `${label}: no aplica: ${check.reason}` : `${label}: not applicable: ${check.reason}`)
    else lines.push(spanish ? `${label}: no se pudo: ${check.reason}` : `${label}: could not: ${check.reason}`)
  }
  for (const entry of (meta && meta.leftOut) || []) {
    lines.push(spanish ? `${T.topics[entry.topic] || entry.topic}: tema fuera: ${entry.reason}` : `${T.topics[entry.topic] || entry.topic}: left out: ${entry.reason}`)
  }
  const reviewers = (meta && meta.reviewers) || {}
  for (const entry of reviewers.notLooked || []) {
    lines.push(spanish ? `${T.topics[entry.topic] || entry.topic}: no miré ${(entry.items || []).join(', ')}` : `${T.topics[entry.topic] || entry.topic}: I did not look at ${(entry.items || []).join(', ')}`)
  }
  for (const topic of reviewers.exhausted || []) {
    lines.push(spanish ? `Revisor agotado: ${T.topics[topic] || topic}` : `Reviewer ran out: ${T.topics[topic] || topic}`)
  }
  return lines
}

function exampleNumbers(spanish, numbers) {
  const shown = numbers.slice(0, 3)
  if (shown.length <= 2) return shown.join(spanish ? ' y ' : ' and ')
  const head = shown.slice(0, -1).join(', ')
  return spanish ? `${head} y ${shown[shown.length - 1]}` : `${head} and ${shown[shown.length - 1]}`
}

function questionSection(T, spanish, list) {
  if (list.length === 0) return T.questionEmpty
  const example = exampleNumbers(spanish, list.map((item) => item.number))
  return spanish ? `**¿Cuáles tomas?** Por ejemplo: «${example}».` : `**Which do you take?** For example: «${example}».`
}

// input = { meta, analysis, triage } as in Global Constraints and below; lang is 'es' or anything else (anything else is English).
// -> { data, markdown }; data is the report.json object; data.sections is the ids in order:
//    ['header', 'waits', 'assumptions', 'list', 'unverified', 'sinceLast', 'discarded', 'notCovered', 'radar', 'cost', 'question']
// options.savedTo (optional) is the folder where the report is saved.
function render(input, lang, options = {}) {
  const T = strings(lang)
  const spanish = isSpanish(lang)
  const { meta, analysis, triage } = input
  const list = triage.list || []
  const unverified = triage.unverified || []
  const discarded = triage.discarded || []
  const news = list.filter((item) => item.mark === 'new').length
  const stills = list.filter((item) => item.mark === 'still').length
  const withCounts = { ...triage.sinceLast, counts: { new: news, still: stills } }

  const sections = []
  sections.push(headerLine(spanish, analysis.project.name, meta.date, (meta.topics || []).length, triage.counts.candidates, triage.counts.verified))

  const waits = (meta.waits || []).map((wait) => `- ${wait}`)
  sections.push([T.waits, ...(waits.length > 0 ? waits : [T.none])].join('\n'))

  const assumptions = (meta.assumptions || []).map((assumption) => `- ${assumption}`)
  for (const change of ((analysis.changes && analysis.changes.unattributable) || [])) {
    const files = (change.items || []).flatMap((item) => item.files || [])
    if (spanish) assumptions.push(`- Cambio no atribuible durante la auditoría (entre ${change.between[0]} y ${change.between[1]}): ${files.join(', ')}`)
    else assumptions.push(`- Unattributable change during the audit (between ${change.between[0]} and ${change.between[1]}): ${files.join(', ')}`)
  }
  sections.push([T.assumptions, ...(assumptions.length > 0 ? assumptions : [T.none])].join('\n'))

  for (const priority of PRIORITY_ORDER) {
    const band = list.filter((item) => item.priority === priority)
    if (band.length === 0) continue
    sections.push([bandHeading(priority, T), ...band.map((item) => renderListItem(T, spanish, item))].join('\n'))
  }

  const unverifiedLines = unverified.map((item) => renderUnverifiedItem(T, item))
  sections.push([T.unverified, ...(unverifiedLines.length > 0 ? unverifiedLines : [T.none])].join('\n'))

  sections.push(sinceLastSection(T, spanish, withCounts))

  sections.push(discardedSection(T, spanish, discarded, triage.issueComparison, options.savedTo))

  const covered = notCoveredLines(T, spanish, meta, analysis)
  sections.push([T.notCovered, ...(covered.length > 0 ? covered.map((line) => `- ${line}`) : [T.none])].join('\n'))

  sections.push(`**RADAR:** ${meta.radar}`)

  const cost = meta.cost || {}
  sections.push(cost.readable && cost.text ? cost.text : T.unreadableCost)

  sections.push(questionSection(T, spanish, list))

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
