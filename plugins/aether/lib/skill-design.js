'use strict'

// Search, review and byte-for-byte install of skills for full `/aether:design`
// runs (spec 045, R22-R25): topics activate only from intent.md words, covered
// topics are never searched, trusted authors are downloaded once and pass a
// deterministic code stage, and anything else is queued in the owner's list
// (pending.jsonl under .aether/).
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const { checkSkillFile } = require('./skill-brief.js')
const { loadSkillsConfig, readInstalls, recordInstall } = require('./skill-registry.js')
const { authorOf, readTrusted } = require('./skill-rules.js')
const { installedBlobs, topicCovered } = require('./skill-topics.js')
const { appendPending, readPending } = require('./pending.js')
const installLib = require('./skill-install.js')

const SKILLS_USAGE = 'usage: aether-plan skills find <feature> | aether-plan skills install <feature> <id> | aether-plan skills discard <id>'
const MAX_PER_DESIGN = 3
const SKILL_ID = installLib.ID_PATTERN

function worktreeOf(cwd) {
  try {
    return repoPaths(cwd || '.').worktree
  } catch {
    return path.resolve(cwd || '.')
  }
}

// A whole word or its plural, accents folded: never part of a longer word.
function wordHit(text, word) {
  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const wanted = normalize(word).trim()
  if (!wanted) return false
  const parts = wanted.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = `${parts.join('\\s+')}(?:e?s)?`
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'u').test(normalize(text))
}

function topicKeys(topic) {
  const keys = [topic && topic.id, ...((topic && Array.isArray(topic.skillKeywords)) ? topic.skillKeywords : [])]
  return keys.filter((key) => typeof key === 'string' && key.trim())
}

function topicQuery(topic) {
  const query = typeof topic.query === 'string' ? topic.query.trim() : ''
  if (query) return query
  const label = typeof topic.label === 'string' ? topic.label.trim() : ''
  if (label) return label
  return String(topic.id || '').split(/[-_]+/).filter(Boolean).join(' ')
}

function readIntent(projectRoot, feature) {
  const file = path.join(projectRoot, feature, 'intent.md')
  try {
    return { text: fs.readFileSync(file, 'utf8'), file }
  } catch {
    return { text: null, file }
  }
}

function skillDirNames(root) {
  const names = []
  for (const folder of [path.join(root, '.agents', 'skills'), path.join(root, '.claude', 'skills')]) {
    let entries = null
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) names.push(entry.name)
    }
  }
  return names
}

function projectRoots(cwd) {
  try {
    const paths = repoPaths(cwd)
    return [...new Set([paths.worktree, paths.mainRoot])]
  } catch {
    return [path.resolve(cwd)]
  }
}

function installedNames({ cwd, home, dataDir }) {
  const names = new Set()
  for (const root of projectRoots(cwd)) {
    for (const name of skillDirNames(root)) names.add(name)
  }
  if (home) {
    for (const name of skillDirNames(home)) names.add(name)
  }
  if (dataDir) {
    for (const entry of readInstalls(dataDir)) {
      if (entry && typeof entry.name === 'string' && entry.name) names.add(entry.name)
    }
  }
  return names
}

function installedPairs({ dataDir }) {
  const pairs = new Set()
  if (dataDir) {
    for (const entry of readInstalls(dataDir)) {
      if (entry && typeof entry.source === 'string' && entry.source && typeof entry.name === 'string' && entry.name) {
        pairs.add(`${entry.source}@${entry.name}`)
      }
    }
  }
  return pairs
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

// Each `owner/repo@skill` token of the output: { source, name, description }.
// An output with no such token is an invalid response.
function parseFindOutput(stdout) {
  const found = []
  for (const line of stripAnsi(stdout).split('\n')) {
    const tokens = line.trim().split(/\s+/).filter(Boolean)
    for (let i = 0; i < tokens.length; i++) {
      const match = tokens[i].match(/^([^@\s]+)@([^@\s]+)$/)
      if (!match || !match[1].includes('/')) continue
      found.push({ source: match[1], name: match[2], description: tokens.slice(i + 1).join(' ') })
      break
    }
  }
  return found
}

function matchesKeys(name, description, keys) {
  const blob = `${name}\n${description}`
  return keys.some((key) => wordHit(blob, key))
}

function featureKey(feature) {
  return String(feature).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'feature'
}

function stateFile(dataDir, feature) {
  return path.join(installLib.reviewRoot(dataDir), `${featureKey(feature)}.json`)
}

function readState(dataDir, feature) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile(dataDir, feature), 'utf8'))
    if (!state || typeof state !== 'object' || !Array.isArray(state.produced) || !Array.isArray(state.installed)) return null
    return { produced: state.produced.filter((id) => typeof id === 'string'), installed: state.installed.filter((id) => typeof id === 'string') }
  } catch {
    return null
  }
}

function writeState(dataDir, feature, state) {
  fs.mkdirSync(installLib.reviewRoot(dataDir), { recursive: true })
  fs.writeFileSync(stateFile(dataDir, feature), JSON.stringify({ feature, produced: state.produced, installed: state.installed }, null, 2) + '\n')
}

// The deterministic code stage (R23 a, b, c): no model runs before it.
// Reads every file of the folder; a failing skill is rejected, never installed.
function codeReview(dir, { topic, installedNames = [] } = {}) {
  const problems = []
  const folderName = path.basename(dir)
  const entries = installLib.listEntries(dir)
  const hasSkillMd = entries.some((entry) => entry.rel === 'SKILL.md' && entry.kind === 'file')
  if (!hasSkillMd) problems.push('SKILL.md does not exist')
  problems.push(...checkSkillFile(dir))
  let skillText = ''
  try {
    skillText = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
  } catch {}
  const isDir = (target, root) => target === root || target.startsWith(root + path.sep)
  for (const entry of entries) {
    if (entry.rel.split('/').some((segment) => segment.includes('..'))) {
      problems.push(`the path leaves the skill folder: ${entry.rel}`)
      continue
    }
    if (entry.kind === 'link') {
      let real = null
      try {
        real = fs.realpathSync(path.join(dir, entry.rel))
      } catch {
        real = null
      }
      let root = null
      try {
        root = fs.realpathSync(dir)
      } catch {
        root = path.resolve(dir)
      }
      if (!real || !isDir(real, root)) problems.push(`a symlink leaves the skill folder: ${entry.rel}`)
      continue
    }
    if (entry.kind !== 'file') continue
    let bytes = null
    try {
      bytes = fs.readFileSync(path.join(dir, entry.rel))
    } catch {
      problems.push(`the file cannot be read: ${entry.rel}`)
      continue
    }
    if (bytes.includes(0)) {
      problems.push(`the file is binary: ${entry.rel}`)
      continue
    }
    let text = ''
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      problems.push(`the file is not UTF-8: ${entry.rel}`)
      continue
    }
    problems.push(...contentProblems(text, entry.rel))
  }
  const front = parseSkillFront(skillText)
  if (!matchesKeys(front.name, front.description, topicKeys(topic))) {
    problems.push(`SKILL.md does not match the topic "${topic && topic.id}"`)
  }
  const claimed = front.name || folderName
  if (claimed && installedNames.includes(claimed)) problems.push(`it duplicates the installed skill "${claimed}"`)
  return { ok: problems.length === 0, problems }
}

// The name and description of a SKILL.md front matter, read the same way the
// validator sees them: the first `name:` and `description:` lines of the block.
function parseSkillFront(skillText) {
  const fields = { name: '', description: '' }
  try {
    const block = String(skillText || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!block) return fields
    const lines = block[1].split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const field = lines[i].match(/^(name|description):\s*(.*)$/)
      if (!field) continue
      if (fields[field[1]]) continue
      let value = field[2].replace(/\s+#.*$/, '')
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) {
        value += `\n${lines[++i].trim()}`
      }
      fields[field[1]] = value.trim()
    }
  } catch {}
  return fields
}

function contentProblems(text, rel) {
  const problems = []
  const lower = text.toLowerCase()
  const at = (needle) => problems.push(`${needle} in ${rel}: the skill reads or writes credentials or secrets`)
  for (const needle of ['~/.ssh', '~/.aws', 'id_rsa', 'id_ed25519', 'credentials']) {
    if (lower.includes(needle)) at(needle)
  }
  if (/\.env(?![a-z0-9_])/i.test(text)) at('.env')
  if (/\.pem(?![a-z0-9_])/i.test(text)) at('a key file')
  for (const needle of ['.claude/settings.json', '.claude/hooks', 'trusted.json', 'grants.json', 'run.json']) {
    if (lower.includes(needle)) problems.push(`${needle} in ${rel}: the skill touches a protected path`)
  }
  if (/(^|\s)-g(\s|$)/.test(text) || lower.includes('--global') || lower.includes('~/.agents/skills') || lower.includes('~/.claude/skills')) {
    problems.push(`a global install in ${rel}: the skill is installed per project, never global`)
  }
  if (/curl[\s\S]{0,300}\|\s*(sh|bash|sudo\b)/i.test(text) || /wget[\s\S]{0,300}\|\s*(sh|bash|sudo\b)/i.test(text)) {
    problems.push(`remote download piped to a shell in ${rel}: the skill downloads and executes remote code`)
  }
  if (/\beval\s*\(/.test(text)) problems.push(`eval in ${rel}: the skill evaluates remote input`)
  if (/curl[^\n]*(-\-\s*data|-d\s|--data\b|-F\s|--upload-file\b)/i.test(text) || /\bgit\b[^\n]*\|\s*curl/i.test(text)) {
    problems.push(`an upload in ${rel}: the skill exfiltrates repository data`)
  }
  if (text.includes('--no-verify') || text.includes('bypassPermissions')) {
    problems.push(`an evasion flag in ${rel}: the skill instructs to evade protections`)
  }
  for (const line of text.split('\n')) {
    if (/aether-(guard|autonomy)/.test(line) && /skip|omit|disabl|bypass|evad|without|no-verify/i.test(line)) {
      problems.push(`an evasion instruction in ${rel}: the skill skips aether-guard or aether-autonomy`)
      break
    }
  }
  if (/\brm\s+-rf\b/.test(text) || /\bgit\s+push\b/.test(text)) {
    problems.push(`an irreversible action in ${rel}: the skill runs push or delete without a grant`)
  }
  return problems
}

function findForDesign({ cwd, feature, home, dataDir, env, runner, config, now } = {}) {
  void now
  const projectRoot = worktreeOf(cwd || '.')
  const empty = (errors) => ({ ok: false, topics: [], candidates: [], rejected: [], pending: [], errors })
  let cfg = config || null
  if (!cfg) {
    try {
      cfg = loadSkillsConfig()
    } catch (err) {
      return empty([`the skills config cannot be read: ${String((err && err.message) || err)}`])
    }
  }
  const topics = Array.isArray(cfg.topics) ? cfg.topics : []
  const { text: intent, file: intentFile } = readIntent(projectRoot, feature)
  if (intent === null) return empty([`intent.md not found: ${intentFile}`])
  const active = topics.filter((topic) => topic && typeof topic.id === 'string' && Array.isArray(topic.words) && topic.words.some((word) => typeof word === 'string' && wordHit(intent, word)))
  const blobs = installedBlobs({ cwd: projectRoot, home, dataDir })
  const coveredIds = new Set(topics.filter((topic) => topic && typeof topic.id === 'string' && topicCovered(blobs, topic)).map((topic) => topic.id))
  const wanted = active.filter((topic) => !coveredIds.has(topic.id))
  const names = installedNames({ cwd: projectRoot, home, dataDir })
  const runNames = new Set(names)
  const runPairs = installedPairs({ dataDir })
  const acceptedKeys = new Set()
  for (const topic of topics) {
    if (!coveredIds.has(topic.id)) continue
  for (const key of topicKeys(topic)) acceptedKeys.add(String(key).toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
  }
  const result = { ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [] }
  const { cmd, prefix } = installLib.skillsBin(env)
  const run = runner || installLib.runSkillBin
  for (const topic of wanted) {
    if (result.candidates.length >= MAX_PER_DESIGN) break
    result.topics.push(topic.id)
    const query = topicQuery(topic)
    let response = null
    try {
      response = run(cmd, [...prefix, 'find', query], { cwd: projectRoot, timeoutMs: installLib.FIND_TIMEOUT_MS, env })
    } catch (err) {
      result.errors.push(`topic ${topic.id}: search failed: ${String((err && err.message) || err)}`)
      continue
    }
    if (!response || response.timedOut) {
      result.errors.push(`topic ${topic.id}: search timed out`)
      continue
    }
    if (response.error || response.status !== 0) {
      const detail = String(response.stderr || response.error || `exit ${response.status}`).trim().split('\n')[0]
      result.errors.push(`topic ${topic.id}: search failed: ${detail}`)
      continue
    }
    const parsed = parseFindOutput(response.stdout)
    if (!parsed.length) {
      result.errors.push(`topic ${topic.id}: invalid response: no skill token`)
      continue
    }
    const keys = topicKeys(topic)
    let accepted = 0
    for (const item of parsed) {
      if (accepted >= 1 || result.candidates.length >= MAX_PER_DESIGN) break
      if (!item.name || !item.source) continue
      if (!matchesKeys(item.name, item.description, keys)) continue
      if (runNames.has(item.name) || runPairs.has(`${item.source}@${item.name}`)) continue
      if (matchesKeys(item.name, item.description, [...acceptedKeys])) continue
      const author = authorOf(item.source)
      const trusted = new Set(readTrusted(dataDir))
      if (!author || !trusted.has(author)) {
        const command = `npx skills@1.9.0 add ${item.source} --skill ${item.name}`
        const entry = { source: item.source, author, topic: topic.id, command, reason: 'author not in trusted.json' }
        result.pending.push(entry)
        const already = readPending(projectRoot).some((line) => line && line.class === 'skill-install' && line.source === item.source)
        if (!already) appendPending(projectRoot, { class: 'skill-install', source: item.source, author, command, reason: 'author not in trusted.json' })
        continue
      }
      const downloaded = installLib.fetchForReview({ source: item.source, name: item.name, env, runner, dataDir })
      if (!downloaded.ok) {
        result.errors.push(`topic ${topic.id}: download failed: ${downloaded.errors.join('; ')}`)
        continue
      }
      const skillDir = path.join(downloaded.dir, '.agents', 'skills', item.name)
      const review = codeReview(skillDir, { topic, installedNames: [...names] })
      if (!review.ok) {
        installLib.removeDir(downloaded.dir)
        result.rejected.push({ name: item.name, source: item.source, topic: topic.id, reasons: review.problems })
        continue
      }
      fs.writeFileSync(path.join(downloaded.dir, 'review.json'), JSON.stringify({ feature, topic: topic.id, name: item.name, source: item.source, author, hash: downloaded.hash }, null, 2) + '\n')
      result.candidates.push({ id: downloaded.id, topic: topic.id, name: item.name, source: item.source, author, hash: downloaded.hash, dir: downloaded.dir, code: { ok: true } })
      runNames.add(item.name)
      runPairs.add(`${item.source}@${item.name}`)
      for (const key of keys) acceptedKeys.add(fold(key))
      accepted += 1
    }
  }
  result.ok = result.errors.length === 0
  const previous = dataDir ? readState(dataDir, feature) : null
  if (dataDir) writeState(dataDir, feature, { produced: result.candidates.map((c) => c.id), installed: previous ? previous.installed : [] })
  return result
}

function installForDesign({ cwd, feature, id, home, dataDir, env, now } = {}) {
  const projectRoot = worktreeOf(cwd || '.')
  if (!dataDir) return { ok: false, errors: ['no data directory: set AETHER_DATA_DIR'] }
  if (typeof id !== 'string' || !SKILL_ID.test(id)) return { ok: false, errors: [`unknown skill id "${id}"`] }
  const state = readState(dataDir, feature)
  if (!state || !state.produced.includes(id)) {
    return { ok: false, errors: [`unknown skill id "${id}" for feature "${feature}": find did not produce it`] }
  }
  if (state.installed.length >= MAX_PER_DESIGN) {
    return { ok: false, errors: [`at most ${MAX_PER_DESIGN} skills per design: "${id}" is not installed`] }
  }
  const dir = installLib.reviewDir(dataDir, id)
  let review = null
  try {
    review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'))
  } catch {
    review = null
  }
  if (!review || review.feature !== feature || typeof review.name !== 'string' || typeof review.hash !== 'string') {
    return { ok: false, errors: [`unknown skill id "${id}" for feature "${feature}": no review for it`] }
  }
  const from = path.join(dir, '.agents', 'skills', review.name)
  let stat = null
  try {
    stat = fs.statSync(from)
  } catch {
    stat = null
  }
  if (!stat || !stat.isDirectory()) return { ok: false, errors: [`the review of "${id}" has no skill folder`] }
  const copied = installLib.copyReviewed({ from, name: review.name, hash: review.hash, projectRoot, home })
  if (!copied.ok) return copied
  const target = path.join(projectRoot, '.agents', 'skills', review.name)
  recordInstall(dataDir, { time: typeof now === 'number' ? now : Date.now(), session: null, source: review.source, scope: 'project', repo: projectRoot, name: review.name, path: target, hash: copied.hash })
  const lockFile = path.join(projectRoot, 'skills-lock.json')
  try {
    if (fs.existsSync(lockFile)) {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      lock.skills = (lock.skills && typeof lock.skills === 'object') ? lock.skills : {}
      lock.skills[review.name] = { ...(lock.skills[review.name] || {}), source: review.source, computedHash: copied.hash }
      if (typeof lock.version !== 'number') lock.version = 1
      fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n')
    }
  } catch {}
  installLib.removeDir(dir)
  state.installed.push(id)
  writeState(dataDir, feature, state)
  return { ok: true, name: review.name, hash: copied.hash, path: target, committed: false }
}

function discardForDesign({ id, dataDir } = {}) {
  if (!dataDir) return { ok: false, errors: ['no data directory: set AETHER_DATA_DIR'] }
  if (typeof id !== 'string' || !SKILL_ID.test(id)) return { ok: false, errors: [`unknown skill id "${id}"`] }
  const dir = installLib.reviewDir(dataDir, id)
  let exists = false
  try {
    exists = fs.statSync(dir).isDirectory()
  } catch {
    exists = false
  }
  if (!exists) return { ok: false, errors: [`unknown skill id "${id}"`] }
  installLib.removeDir(dir)
  try {
    for (const file of fs.readdirSync(installLib.reviewRoot(dataDir))) {
      if (!file.endsWith('.json')) continue
      const full = path.join(installLib.reviewRoot(dataDir), file)
      try {
        const state = JSON.parse(fs.readFileSync(full, 'utf8'))
        if (!state || !Array.isArray(state.produced)) continue
        state.produced = state.produced.filter((entry) => entry !== id)
        if (Array.isArray(state.installed)) state.installed = state.installed.filter((entry) => entry !== id)
        fs.writeFileSync(full, JSON.stringify(state, null, 2) + '\n')
      } catch {}
    }
  } catch {}
  return { ok: true, id }
}

function validFeature(feature) {
  return typeof feature === 'string' && /^specs\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(feature)
}

function main(argv, { cwd = process.cwd(), stdout = process.stdout, env = process.env } = {}) {
  const args = Array.isArray(argv) ? argv : []
  const rest = args[0] === 'skills' ? args.slice(1) : args
  const fail = () => {
    stdout.write(JSON.stringify({ ok: false, errors: [SKILLS_USAGE], warnings: [] }) + '\n')
    return 1
  }
  const home = (env && env.HOME) || process.env.HOME || os.homedir()
  const dataDir = (env && env.AETHER_DATA_DIR) || process.env.AETHER_DATA_DIR || null
  const [sub, first, second] = rest
  let result = null
  if (sub === 'find' && rest.length === 2 && validFeature(first)) {
    result = findForDesign({ cwd, feature: first, home, dataDir, env })
  } else if (sub === 'install' && rest.length === 3 && validFeature(first) && SKILL_ID.test(second || '')) {
    result = installForDesign({ cwd, feature: first, id: second, home, dataDir, env })
  } else if (sub === 'discard' && rest.length === 2 && SKILL_ID.test(first || '')) {
    result = discardForDesign({ id: first, dataDir })
  } else {
    return fail()
  }
  stdout.write(JSON.stringify(result) + '\n')
  return 0
}

module.exports = {
  SKILLS_USAGE,
  MAX_PER_DESIGN,
  wordHit,
  topicKeys,
  topicQuery,
  parseFindOutput,
  codeReview,
  findForDesign,
  installForDesign,
  discardForDesign,
  main,
  installedHash: installLib.installedHash,
}
