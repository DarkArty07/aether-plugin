#!/usr/bin/env node
'use strict'

// The Judge seat's measurement (spec 001-design-seats, R16): each fixture holds documents with seeded
// defects and an answer key. A Judge, native or external, reviews each fixture in a throwaway repository;
// its findings are matched to the key by keywords, mechanically, with no model grading them, so the score
// carries no grader's bias. A finding that matches no seeded defect is listed for a person to read: it
// may be a real problem the fixture did not plant, or a false alarm.
//
// usage: node judge-defects.js --occupant native|external [--fixtures <dir>] [--out <dir>] [--repeat <n>]
//                              [--judge-cmd <script>]
//
//   native     the Judge's own agent file as the system prompt of `claude -p` on Opus at high effort, with
//              Read, Grep and Glob: a paid call at API prices.
//   external   `aether-lane seat judge` with the session's seats choice, harnesses and lanes: on agy, a
//              call on the owner's plan. A round that gives the seat back to the native agent is recorded
//              as not run, and is not scored.
//   --judge-cmd  a script run as `node <script> <occupant> <fixture>` with the message on stdin, printing
//              the Judge's answer as JSON or in its text format. Tests use it in place of a model.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const PLUGIN = path.join(__dirname, '..', '..', '..', '..', 'plugins', 'aether')
const LANE_BIN = path.join(PLUGIN, 'bin', 'aether-lane')
const JUDGE_AGENT = path.join(PLUGIN, 'agents', 'judge.md')
const FIXTURES = path.join(__dirname, 'fixtures')

// ---- Reading an answer ----

// The Judge's text answer, as its agent file sets it out (indented or not), as { verdict, findings, openQuestions }.
function parseJudgeText(text) {
  const lines = String(text)
    .split('\n')
    .map((line) => line.replace(/^ {4}/, '').trimEnd())
  const out = { verdict: null, findings: [], openQuestions: [] }
  let section = null
  for (const line of lines) {
    const heading = line.match(/^## (Verdict|Findings|Open questions)\s*$/)
    if (heading) {
      section = heading[1]
      continue
    }
    if (line.trim() === '') continue
    if (section === 'Verdict' && out.verdict === null) {
      out.verdict = line.trim().toLowerCase()
    } else if (section === 'Findings') {
      const m = line.match(/^\s*\d+\.\s*\[(blocking|major|minor)\]\s*(.+)$/i)
      if (!m) continue
      const [title = '', evidence = '', fix = ''] = m[2].split(/\s+—\s+/)
      out.findings.push({ severity: m[1].toLowerCase(), title, evidence, fix })
    } else if (section === 'Open questions') {
      const q = line.replace(/^\s*-\s*/, '').trim()
      if (q !== '' && q.toLowerCase() !== 'none' && q.toLowerCase() !== '"none"') out.openQuestions.push(q)
    }
  }
  return out
}

// A JSON answer, or the text format when the output is not JSON.
function parseAnswer(stdout) {
  const text = String(stdout).trim()
  try {
    const value = JSON.parse(text)
    if (value && typeof value === 'object' && typeof value.verdict === 'string') return value
  } catch {
    // Not JSON: the Judge's text format.
  }
  return parseJudgeText(text)
}

// ---- Scoring ----

function findingText(f) {
  return `${f.title} ${f.evidence} ${f.fix}`.toLowerCase()
}

function matches(defect, f) {
  const text = findingText(f)
  const all = (defect.all || []).every((word) => text.includes(word.toLowerCase()))
  const any = (defect.any || []).length === 0 || defect.any.some((word) => text.includes(word.toLowerCase()))
  return all && any
}

// An answer against its fixture's key: whether the verdict is the expected one (any verdict but approve for a
// fixture with defects), which seeded defects a finding names, and the blocking or major findings that name none.
function score(answer, key) {
  const found = key.defects.filter((defect) => answer.findings.some((f) => matches(defect, f))).map((d) => d.id)
  const missed = key.defects.map((d) => d.id).filter((id) => !found.includes(id))
  const unmatched = answer.findings
    .filter((f) => ['blocking', 'major'].includes(f.severity) && !key.defects.some((defect) => matches(defect, f)))
    .map((f) => f.title)
  const verdictRight = key.expect === 'approve' ? answer.verdict === 'approve' : answer.verdict !== 'approve' && answer.verdict !== null
  return { verdict: answer.verdict, verdictRight, found, missed, unmatched }
}

// ---- Running a Judge ----

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

// A throwaway repository with the fixture's documents committed under specs/001-<fixture>/.
function fixtureRepo(fixtureDir, name, key) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `aether-judge-${name}-`)))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Aether Evaluation')
  git(dir, 'config', 'user.email', 'aether-evaluation@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  const feature = `specs/001-${name}`
  fs.mkdirSync(path.join(dir, feature), { recursive: true })
  for (const doc of key.documents) fs.copyFileSync(path.join(fixtureDir, doc), path.join(dir, feature, doc))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'fixture')
  return { dir, feature }
}

function message(key, feature) {
  return [
    `Review ${key.documents.map((doc) => `${feature}/${doc}`).join(' and ')}.`,
    `This review must check ${key.check}.`,
    '',
    "The owner's intent, as the owner confirmed it:",
    key.intent,
  ].join('\n')
}

function agentBody() {
  const text = fs.readFileSync(JUDGE_AGENT, 'utf8')
  return text.slice(text.indexOf('\n---\n', 4) + 5).trim()
}

function runNative(repo, prompt) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE') || k === 'CLAUDE_CONFIG_DIR'))
  const r = spawnSync(
    'claude',
    ['-p', '--model', 'opus', '--effort', 'high', '--output-format', 'json', '--setting-sources', 'project', '--strict-mcp-config', '--tools', 'Read,Grep,Glob', '--system-prompt', agentBody()],
    { cwd: repo.dir, input: prompt, encoding: 'utf8', env: { ...env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false' }, timeout: 1800 * 1000 },
  )
  if (r.status !== 0) return { ran: false, detail: `claude exited ${r.status}: ${(r.stderr || r.stdout).slice(0, 500)}` }
  const data = JSON.parse(r.stdout)
  return { ran: true, answer: parseJudgeText(data.result || ''), usd: data.total_cost_usd ?? null, occupant: 'native opus high' }
}

function runExternal(repo, prompt, session) {
  const r = spawnSync(process.execPath, [LANE_BIN, 'seat', 'judge', '--session', session, '--author', 'sonnet', '--feature', repo.feature], {
    cwd: repo.dir,
    input: prompt,
    encoding: 'utf8',
    env: { ...process.env, AETHER_LANES: process.env.AETHER_LANES || 'on' },
  })
  const value = JSON.parse(r.stdout.trim().split('\n').pop())
  if (r.status !== 0) return { ran: false, detail: value.unavailable || value.failed || value.error, value }
  return { ran: true, answer: value.result, usd: null, lane: value.lane, occupant: `${value.harness} ${value.model}` }
}

function runCommand(script, occupant, name, repo, prompt) {
  const r = spawnSync(process.execPath, [script, occupant, name], { cwd: repo.dir, input: prompt, encoding: 'utf8' })
  if (r.status !== 0) return { ran: false, detail: `${script} exited ${r.status}` }
  return { ran: true, answer: parseAnswer(r.stdout), usd: null, occupant: `${occupant} (command)` }
}

// ---- The run ----

function flags(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`usage: judge-defects.js --occupant native|external [--fixtures <dir>] [--out <dir>] [--repeat <n>] [--judge-cmd <script>]`)
    out[argv[i].slice(2)] = argv[i + 1]
  }
  return out
}

function summarize(results) {
  const ran = results.filter((r) => r.ran)
  const defects = ran.reduce((sum, r) => sum + r.score.found.length + r.score.missed.length, 0)
  const found = ran.reduce((sum, r) => sum + r.score.found.length, 0)
  return {
    rounds: results.length,
    ran: ran.length,
    verdictsRight: ran.filter((r) => r.score.verdictRight).length,
    defects,
    found,
    unmatched: ran.reduce((sum, r) => sum + r.score.unmatched.length, 0),
    usd: ran.some((r) => typeof r.usd === 'number') ? ran.reduce((sum, r) => sum + (r.usd || 0), 0) : null,
  }
}

function markdown(occupant, results, summary) {
  const rows = results.map((r) =>
    r.ran
      ? `| ${r.fixture} | ${r.repeat} | ${r.score.verdict} ${r.score.verdictRight ? '✓' : '✗'} | ${r.score.found.length}/${r.score.found.length + r.score.missed.length} | ${r.score.missed.join(', ') || '—'} | ${r.score.unmatched.length} |`
      : `| ${r.fixture} | ${r.repeat} | not run: ${r.detail} | | | |`,
  )
  return [
    `# Judge on seeded defects: ${occupant}`,
    '',
    `Defects found: ${summary.found} of ${summary.defects}. Verdicts right: ${summary.verdictsRight} of ${summary.ran}. Blocking or major findings that name no seeded defect: ${summary.unmatched}.`,
    '',
    '| Fixture | Round | Verdict | Found | Missed | Unmatched |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

function main(argv) {
  const opts = flags(argv)
  const occupant = opts.occupant
  if (!['native', 'external'].includes(occupant)) throw new Error('--occupant must be native or external')
  const fixtures = path.resolve(opts.fixtures || FIXTURES)
  const out = path.resolve(opts.out || path.join(process.cwd(), `judge-defects-${occupant}`))
  const repeat = Number(opts.repeat || 1)
  const session = `eval-${Date.now()}`
  const results = []
  for (const name of fs.readdirSync(fixtures).sort()) {
    const dir = path.join(fixtures, name)
    if (!fs.existsSync(path.join(dir, 'key.json'))) continue
    const key = JSON.parse(fs.readFileSync(path.join(dir, 'key.json'), 'utf8'))
    for (let n = 1; n <= repeat; n++) {
      const repo = fixtureRepo(dir, name, key)
      try {
        const prompt = message(key, repo.feature)
        const outcome = opts['judge-cmd']
          ? runCommand(path.resolve(opts['judge-cmd']), occupant, name, repo, prompt)
          : occupant === 'native'
            ? runNative(repo, prompt)
            : runExternal(repo, prompt, session)
        const entry = { fixture: name, repeat: n, ran: outcome.ran, occupant: outcome.occupant ?? null, usd: outcome.usd ?? null }
        if (outcome.ran) Object.assign(entry, { score: score(outcome.answer, key), answer: outcome.answer, lane: outcome.lane ?? null })
        else entry.detail = outcome.detail
        results.push(entry)
      } finally {
        fs.rmSync(repo.dir, { recursive: true, force: true })
      }
    }
  }
  const summary = summarize(results)
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'results.json'), `${JSON.stringify({ occupant, summary, results }, null, 1)}\n`)
  fs.writeFileSync(path.join(out, 'summary.md'), markdown(occupant, results, summary))
  return { occupant, out, summary }
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`)
  } catch (err) {
    process.stdout.write(`${JSON.stringify({ error: err.message })}\n`)
    process.exitCode = 1
  }
}

module.exports = { parseJudgeText, parseAnswer, score, main }
