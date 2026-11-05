'use strict'

// Chooses and runs the project's own commands: the tests, the declared linter and the dependency audit.
// Family: audit.

const fs = require('node:fs')
const path = require('node:path')
const { readJsonOrNull, readTextOrEmpty } = require('./common.js')
const { projectEnv } = require('./audit-exec.js')
const { assess, parseMakefile } = require('./audit-risk.js')
const { redact } = require('./audit-scan.js')

const PLACEHOLDER_TEST = 'no test specified'
const DEFAULT_TIMEOUT_MS = 300000
const OUTPUT_LINES = 40

function readScripts(root, file) {
  const manifest = readJsonOrNull(path.join(root, file))
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return {}
  if (manifest.scripts === null || typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts)) return {}
  return manifest.scripts
}

function hasManifest(root, file) {
  return readJsonOrNull(path.join(root, file)) !== null
}

function nodePm(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(root, 'bun.lock')) || fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function nodeTestCommand(pm) {
  return pm === 'bun' ? 'bun run test' : `${pm} test`
}

function nodeRunCommand(pm, name) {
  return `${pm} run ${name}`
}

function makefileTargets(root) {
  const text = readTextOrEmpty(path.join(root, 'Makefile')) || readTextOrEmpty(path.join(root, 'makefile'))
  if (text === '') return null
  return parseMakefile(text)
}

function rootFiles(root) {
  try {
    return fs.readdirSync(root)
  } catch {
    return []
  }
}

// discoverTests(root, { testsCommand }) -> the command that runs the tests of the project.
function discoverTests(root, { testsCommand } = {}) {
  if (testsCommand !== undefined && testsCommand !== null && testsCommand !== '') {
    return { found: true, command: testsCommand, source: 'given by the Lead' }
  }
  const scripts = readScripts(root, 'package.json')
  if (typeof scripts.test === 'string' && scripts.test !== '' && !scripts.test.includes(PLACEHOLDER_TEST)) {
    return { found: true, command: nodeTestCommand(nodePm(root)), source: 'package.json scripts.test' }
  }
  const composer = readScripts(root, 'composer.json')
  if (composer.test !== undefined && composer.test !== null && composer.test !== '') {
    return { found: true, command: 'composer test', source: 'composer.json scripts.test' }
  }
  const targets = makefileTargets(root)
  if (targets !== null && targets.has('test')) {
    return { found: true, command: 'make test', source: 'Makefile test target' }
  }
  if (readTextOrEmpty(path.join(root, 'tox.ini')).match(/^\s*\[testenv/m) !== null) {
    return { found: true, command: 'tox', source: 'tox.ini testenv' }
  }
  if (fs.existsSync(path.join(root, 'pytest.ini'))
    || readTextOrEmpty(path.join(root, 'pyproject.toml')).includes('[tool.pytest')
    || readTextOrEmpty(path.join(root, 'setup.cfg')).includes('[tool:pytest]')) {
    return { found: true, command: 'python -m pytest', source: 'pytest configuration' }
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    return { found: true, command: 'cargo test', source: 'Cargo.toml' }
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    return { found: true, command: 'go test ./...', source: 'go.mod' }
  }
  if (rootFiles(root).some((file) => file.endsWith('.sln') || file.endsWith('.csproj'))) {
    return { found: true, command: 'dotnet test', source: 'solution or project file' }
  }
  return { found: false, reason: 'no manifest or build file declares tests' }
}

// discoverLint(root) -> the command that lints the project.
function discoverLint(root) {
  const scripts = readScripts(root, 'package.json')
  if (typeof scripts.lint === 'string' && scripts.lint !== '') {
    return { found: true, command: nodeRunCommand(nodePm(root), 'lint'), source: 'package.json scripts.lint' }
  }
  const composer = readScripts(root, 'composer.json')
  if (typeof composer.lint === 'string' && composer.lint !== '') {
    return { found: true, command: 'composer lint', source: 'composer.json scripts.lint' }
  }
  const targets = makefileTargets(root)
  if (targets !== null && targets.has('lint')) {
    return { found: true, command: 'make lint', source: 'Makefile lint target' }
  }
  if (fs.existsSync(path.join(root, 'ruff.toml'))
    || fs.existsSync(path.join(root, '.ruff.toml'))
    || readTextOrEmpty(path.join(root, 'pyproject.toml')).includes('[tool.ruff')) {
    return { found: true, command: 'ruff check .', source: 'ruff configuration' }
  }
  if (fs.existsSync(path.join(root, '.flake8'))) {
    return { found: true, command: 'flake8', source: '.flake8' }
  }
  return { found: false, reason: 'no linter declared' }
}

// discoverAudit(root) -> the command that audits the dependencies of the project.
function discoverAudit(root) {
  if (fs.existsSync(path.join(root, 'package-lock.json'))) {
    return { found: true, command: 'npm audit --json', tool: 'npm audit', ecosystem: 'npm' }
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return { found: true, command: 'pnpm audit --json', tool: 'pnpm audit', ecosystem: 'pnpm' }
  }
  if (hasManifest(root, 'package.json')) {
    return { found: false, reason: 'package.json has no lockfile' }
  }
  if (rootFiles(root).some((file) => /^requirements.*\.txt$/.test(file)) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
    return { found: true, command: 'pip-audit -f json', tool: 'pip-audit', ecosystem: 'pip' }
  }
  if (fs.existsSync(path.join(root, 'composer.lock'))) {
    return { found: true, command: 'composer audit --format=json', tool: 'composer audit', ecosystem: 'composer' }
  }
  if (fs.existsSync(path.join(root, 'Cargo.lock'))) {
    return { found: true, command: 'cargo audit --json', tool: 'cargo audit', ecosystem: 'cargo' }
  }
  return { found: false, reason: 'no supported dependency manifest' }
}

// The bin folders of the project's own virtual environments, when they exist.
function venvBinDirs(root) {
  const dirs = []
  for (const name of ['.venv', 'venv']) {
    const dir = path.join(root, name, 'bin')
    let stat = null
    try {
      stat = fs.statSync(dir)
    } catch {
      stat = null
    }
    if (stat !== null && stat.isDirectory()) dirs.push(dir)
  }
  return dirs
}

// projectEnv plus the project's own virtual environment first on the PATH, so tools
// that live in .venv or venv are found without installing anything.
function toolEnv(root, env) {
  const out = projectEnv(env)
  const dirs = venvBinDirs(root)
  if (dirs.length > 0) {
    out.PATH = dirs.join(path.delimiter) + (out.PATH ? path.delimiter + out.PATH : '')
  }
  return out
}

function tailLines(text, count) {
  const lines = String(text).split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-count).join('\n')
}

function capSeconds(timeoutMs) {
  return timeoutMs / 1000
}

function refusedCheck(command, source, assessment) {
  return { state: 'could-not', notRun: true, command, source, reason: redact(assessment.reasons.map((reason) => reason.text).join('; ')) }
}

// runTests(root, ctx) -> the Check of the project's own test command.
async function runTests(root, ctx) {
  const timeoutMs = ctx.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : ctx.timeoutMs
  if (ctx.noTests === true) {
    return { state: 'not-applicable', reason: 'the person skipped the tests with --no-tests' }
  }
  const found = discoverTests(root, { testsCommand: ctx.testsCommand })
  if (!found.found) return { state: 'not-applicable', reason: found.reason }
  const manifest = readJsonOrNull(path.join(root, 'package.json'))
  const deps = manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest : null
  const declared = deps !== null && (((deps.dependencies !== null && typeof deps.dependencies === 'object' && !Array.isArray(deps.dependencies) && Object.keys(deps.dependencies).length > 0))
    || ((deps.devDependencies !== null && typeof deps.devDependencies === 'object' && !Array.isArray(deps.devDependencies) && Object.keys(deps.devDependencies).length > 0)))
  if (declared && !fs.existsSync(path.join(root, 'node_modules'))) {
    return { state: 'could-not', command: found.command, source: found.source, reason: 'dependencies are not installed (node_modules is missing); the audit never installs' }
  }
  const assessment = assess(root, found.command)
  if (!assessment.runnable) return refusedCheck(found.command, found.source, assessment)
  const started = Date.now()
  const reply = await ctx.exec('sh', ['-c', found.command], { cwd: root, env: toolEnv(root, ctx.env), timeoutMs })
  const durationMs = Date.now() - started
  if (reply.timedOut === true) {
    return { state: 'could-not', command: found.command, source: found.source, timedOut: true, reason: `the tests ran past the cap of ${capSeconds(timeoutMs)} s` }
  }
  if (reply.error !== undefined && reply.error !== null && reply.error.code === 'ENOENT') {
    return { state: 'could-not', command: found.command, source: found.source, reason: 'the tool is not installed' }
  }
  if (reply.status === 127) {
    return { state: 'could-not', command: found.command, source: found.source, reason: 'the tool is not installed' }
  }
  const output = redact(tailLines(`${reply.stdout || ''}${reply.stderr || ''}`, OUTPUT_LINES))
  return { state: 'result', command: found.command, source: found.source, exitCode: reply.status, passed: reply.status === 0, durationMs, output }
}

// runLint(root, ctx) -> the Check of the project's own linter.
async function runLint(root, ctx) {
  const timeoutMs = ctx.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : ctx.timeoutMs
  const found = discoverLint(root)
  if (!found.found) return { state: 'not-applicable', reason: found.reason }
  const assessment = assess(root, found.command)
  if (!assessment.runnable) return refusedCheck(found.command, found.source, assessment)
  const started = Date.now()
  const reply = await ctx.exec('sh', ['-c', found.command], { cwd: root, env: toolEnv(root, ctx.env), timeoutMs })
  const durationMs = Date.now() - started
  if (reply.timedOut === true) {
    return { state: 'could-not', command: found.command, source: found.source, timedOut: true, reason: `the linter ran past the cap of ${capSeconds(timeoutMs)} s` }
  }
  if (reply.error !== undefined && reply.error !== null && reply.error.code === 'ENOENT') {
    return { state: 'could-not', command: found.command, source: found.source, reason: 'the tool is not installed' }
  }
  if (reply.status === 127) {
    return { state: 'could-not', command: found.command, source: found.source, reason: 'the tool is not installed' }
  }
  const output = redact(tailLines(`${reply.stdout || ''}${reply.stderr || ''}`, OUTPUT_LINES))
  return { state: 'result', command: found.command, source: found.source, exitCode: reply.status, passed: reply.status === 0, durationMs, output }
}

const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 }

function emptyCounts() {
  return { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0, total: 0 }
}

function normalizeSeverity(value) {
  if (value === 'critical') return 'critical'
  if (value === 'high') return 'high'
  if (value === 'moderate' || value === 'medium') return 'moderate'
  if (value === 'low' || value === 'info') return 'low'
  return 'unknown'
}

function sortTop(top) {
  top.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return top.slice(0, 10)
}

function parseNpmAudit(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.vulnerabilities === null || typeof data.vulnerabilities !== 'object' || Array.isArray(data.vulnerabilities)) return null
  const counts = emptyCounts()
  const top = []
  for (const [name, entry] of Object.entries(data.vulnerabilities)) {
    const severity = normalizeSeverity(entry !== null && typeof entry === 'object' ? entry.severity : undefined)
    counts[severity] += 1
    counts.total += 1
    top.push({ name, severity })
  }
  return { counts, top: sortTop(top) }
}

function parsePipAudit(data) {
  if (data === null || typeof data !== 'object' || !Array.isArray(data.dependencies)) return null
  const counts = emptyCounts()
  const top = []
  for (const dep of data.dependencies) {
    if (dep === null || typeof dep !== 'object' || !Array.isArray(dep.vulns) || dep.vulns.length === 0) continue
    counts.unknown += 1
    counts.total += 1
    top.push({ name: String(dep.name), severity: 'unknown' })
  }
  return { counts, top: sortTop(top) }
}

function parseComposerAudit(data) {
  if (data === null || typeof data !== 'object' || data.advisories === null || typeof data.advisories !== 'object' || Array.isArray(data.advisories)) return null
  const counts = emptyCounts()
  const top = []
  for (const [name, advisories] of Object.entries(data.advisories)) {
    if (!Array.isArray(advisories)) continue
    for (const advisory of advisories) {
      const severity = normalizeSeverity(advisory !== null && typeof advisory === 'object' ? advisory.severity : undefined)
      counts[severity] += 1
      counts.total += 1
      top.push({ name, severity })
    }
  }
  return { counts, top: sortTop(top) }
}

function parseCargoAudit(data) {
  if (data === null || typeof data !== 'object' || data.vulnerabilities === null || typeof data.vulnerabilities !== 'object' || Array.isArray(data.vulnerabilities)) return null
  if (!Array.isArray(data.vulnerabilities.list)) return null
  const counts = emptyCounts()
  const top = []
  for (const entry of data.vulnerabilities.list) {
    const name = entry !== null && typeof entry === 'object' && entry.package !== null && typeof entry.package === 'object' ? entry.package.name : undefined
    if (typeof name !== 'string' || name === '') continue
    counts.unknown += 1
    counts.total += 1
    top.push({ name, severity: 'unknown' })
  }
  return { counts, top: sortTop(top) }
}

function parseAuditOutput(ecosystem, stdout) {
  let data = null
  try {
    data = JSON.parse(stdout)
  } catch {
    return null
  }
  if (ecosystem === 'npm' || ecosystem === 'pnpm') return parseNpmAudit(data)
  if (ecosystem === 'pip') return parsePipAudit(data)
  if (ecosystem === 'composer') return parseComposerAudit(data)
  if (ecosystem === 'cargo') return parseCargoAudit(data)
  return null
}

function mentionsNetwork(text) {
  return /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network)/.test(text)
}

// runAudit(root, ctx) -> the Check of the ecosystem's dependency audit.
async function runAudit(root, ctx) {
  const timeoutMs = ctx.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : ctx.timeoutMs
  const found = discoverAudit(root)
  if (!found.found) return { state: 'not-applicable', reason: found.reason }
  const reply = await ctx.exec('sh', ['-c', found.command], { cwd: root, env: toolEnv(root, ctx.env), timeoutMs })
  if (reply.error !== undefined && reply.error !== null && reply.error.code === 'ENOENT') {
    return { state: 'could-not', tool: found.tool, reason: 'the tool is not installed' }
  }
  if (reply.timedOut === true) {
    return { state: 'could-not', tool: found.tool, timedOut: true, reason: `the audit ran past the cap of ${capSeconds(timeoutMs)} s` }
  }
  if (reply.status === 127) {
    return { state: 'could-not', tool: found.tool, reason: 'the tool is not installed' }
  }
  const parsed = parseAuditOutput(found.ecosystem, reply.stdout || '')
  if (parsed !== null) {
    return { state: 'result', tool: found.tool, counts: parsed.counts, top: parsed.top }
  }
  if (mentionsNetwork(`${reply.stdout || ''}\n${reply.stderr || ''}`)) {
    return { state: 'could-not', tool: found.tool, reason: 'no network' }
  }
  return { state: 'could-not', tool: found.tool, reason: 'output not understood' }
}

module.exports = {
  discoverTests,
  discoverLint,
  discoverAudit,
  runTests,
  runLint,
  runAudit,
}
