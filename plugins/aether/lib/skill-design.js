'use strict'

// Search, review and byte-for-byte install of skills for full `/aether:design`
// runs (spec 045, R22-R25, spec 046): the scout names up to 3 search topics
// from the intent card, covered topics are never searched, trusted authors
// are downloaded once and pass a deterministic code stage, and anything else
// is queued in the owner's list (pending.jsonl under .aether/).
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const runLib = require('./run.js')
const { checkSkillFile } = require('./skill-brief.js')
const { readInstalls, recordInstall } = require('./skill-registry.js')
const { authorOf, readTrusted } = require('./skill-rules.js')
const { installedBlobs, topicCovered } = require('./skill-topics.js')
const { appendPending, readPending } = require('./pending.js')
const installLib = require('./skill-install.js')

const SKILLS_USAGE = 'usage: aether-plan skills find <feature> [--topic <t>]... | aether-plan skills install <feature> <id> | aether-plan skills discard <id>'
const MAX_PER_DESIGN = 3
// One topic first asks each trusted author, then the general search: at most
// 5 authors per topic, in alphabetical order. The rest are not searched and
// land in the result's skipped list, never in its errors.
// One download attempt per topic and 3 per design, accepted or not: after
// its attempt a topic ends, whatever the attempt's outcome.
const OWNER_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/
const MAX_OWNERS_PER_TOPIC = 5
const MAX_DOWNLOADS_PER_TOPIC = 1
const MAX_DOWNLOADS_PER_DESIGN = 3
const SKILL_ID = installLib.ID_PATTERN
// One search topic: a lowercase hyphenated id of 1 to 3 words, so a scout
// answer never becomes a command or a huge query. Checked in three places:
// the flow, the mod and main.
const TOPIC_PATTERN = /^[a-z0-9]{1,24}(-[a-z0-9]{1,24}){0,2}$/

function worktreeOf(cwd) {
  try {
    return repoPaths(cwd || '.').worktree
  } catch {
    return path.resolve(cwd || '.')
  }
}

// The owner's list lives in the main checkout, even when the Lead designs
// from a linked worktree; intent.md is still read from the worktree.
function pendingRootOf(cwd) {
  try {
    return repoPaths(cwd || '.').mainRoot
  } catch {
    return worktreeOf(cwd || '.')
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

// The state of each design lives apart from the review folder, which holds only temporary downloads (R23).
function stateRoot(dataDir) {
  return path.join(dataDir, 'skills', 'design-state')
}

function stateFile(dataDir, feature) {
  return path.join(stateRoot(dataDir), `${featureKey(feature)}.json`)
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
  fs.mkdirSync(stateRoot(dataDir), { recursive: true })
  fs.writeFileSync(stateFile(dataDir, feature), JSON.stringify({ feature, produced: state.produced, installed: state.installed }, null, 2) + '\n')
}

// The deterministic code stage (R23 a, b, c): no model runs before it.
// Reads every file of the folder; a failing skill is rejected, never installed.
function codeReview(dir, { topic, installedNames = [], acceptedKeys = [] } = {}) {
  const problems = []
  const folderName = path.basename(dir)
  const entries = installLib.listEntries(dir)
  // A skill that carries instruction files Claude Code could load, or more
  // files than the reviewer reads one by one, is rejected: the copy waits
  // inside the project, where such files must never sit, even unreviewed.
  const forbidden = new Set(['claude.md', 'agents.md', '.claude'])
  for (const entry of entries) {
    const hit = entry.rel.split('/').find((segment) => forbidden.has(segment.toLowerCase()))
    if (hit) problems.push(`${hit} in ${entry.rel}: the skill carries a file Claude Code could load as instructions`)
  }
  const fileCount = entries.filter((entry) => entry.kind === 'file').length
  if (fileCount > installLib.MAX_SKILL_FILES) {
    problems.push(`the skill holds ${fileCount} files: the reviewer reads every file with Read, and more than ${installLib.MAX_SKILL_FILES} files is not reviewed`)
  }
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
  if (acceptedKeys.length > 0 && matchesKeys(front.name, front.description, acceptedKeys)) {
    problems.push(`SKILL.md duplicates an already accepted topic: "${front.name || folderName}" matches a covered topic of this run`)
  }
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
  if (/(?<![\w)\]])\.env(?![a-z0-9_])/i.test(text)) at('.env')
  if (/\.pem(?![a-z0-9_])/i.test(text)) at('a key file')
  for (const needle of ['.claude/settings.json', '.claude/hooks', 'trusted.json', 'grants.json', 'run.json']) {
    if (lower.includes(needle)) problems.push(`${needle} in ${rel}: the skill touches a protected path`)
  }
  if (/(^|\s)-g(\s|$)/.test(text) || lower.includes('--global') || lower.includes('~/.agents/skills') || lower.includes('~/.claude/skills')) {
    problems.push(`a global install in ${rel}: the skill is installed per project, never global`)
  }
  if (/\bcurl\b[\s\S]{0,300}\|\s*(sh|bash|zsh|node|perl|ruby|python3?|sudo)\b/i.test(text) || /\bwget\b[\s\S]{0,300}\|\s*(sh|bash|zsh|node|perl|ruby|python3?|sudo)\b/i.test(text)) {
    problems.push(`remote download piped to a shell in ${rel}: the skill downloads and executes remote code`)
  }
  if (/\b(sh|bash|zsh)\b\s+-c\s+[\s\S]{0,300}\b(curl|wget)\b/i.test(text) || /\b(sh|bash|zsh)\b\s*<\s*\([\s\S]{0,300}\b(curl|wget)\b/i.test(text) || /\beval\b[\s("'`$]{0,20}\b(curl|wget)\b/i.test(text)) {
    problems.push(`remote download executed by a shell in ${rel}: the skill downloads and executes remote code (piped or passed to a shell)`)
  }
  if (/(?<![\w.])eval\s*\(/.test(text)) problems.push(`eval in ${rel}: the skill evaluates remote input`)
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

// One topic of the scout as the search sees it: the id drives coverage, and
// the label with spaces drives the registry query and the relevance.
function scoutTopic(id) {
  const label = String(id).split(/[-_]+/).filter(Boolean).join(' ')
  return { id: String(id), label, skillKeywords: [label] }
}

function findForDesign({ cwd, feature, home, dataDir, env, runner, topics, now, timeoutMs } = {}) {
  void now
  const projectRoot = worktreeOf(cwd || '.')
  const pendingRoot = pendingRootOf(cwd || '.')
  const findTimeoutMs = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : installLib.FIND_TIMEOUT_MS
  const empty = (errors) => ({ ok: false, topics: [], candidates: [], rejected: [], pending: [], errors, skipped: [] })
  const emptyOk = () => ({ ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [], skipped: [] })
  // The scout's topics, valid and distinct, at most 3: without one the search
  // answers ok:true with empty lists and never calls the registry.
  const seen = new Set()
  const searched = []
  for (const id of Array.isArray(topics) ? topics : []) {
    if (typeof id !== 'string' || !TOPIC_PATTERN.test(id) || seen.has(id)) continue
    seen.add(id)
    searched.push(scoutTopic(id))
    if (searched.length >= MAX_PER_DESIGN) break
  }
  if (searched.length === 0) return emptyOk()
  const blobs = installedBlobs({ cwd: projectRoot, home, dataDir })
  const coveredIds = new Set(searched.filter((topic) => topicCovered(blobs, topic)).map((topic) => topic.id))
  const wanted = searched.filter((topic) => !coveredIds.has(topic.id))
  const names = installedNames({ cwd: projectRoot, home, dataDir })
  const runNames = new Set(names)
  const runPairs = installedPairs({ dataDir })
  const acceptedKeys = new Set()
  for (const topic of searched) {
    if (!coveredIds.has(topic.id)) continue
    for (const key of topicKeys(topic)) acceptedKeys.add(String(key).toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
  }
  const result = { ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [], skipped: [] }
  const { cmd, prefix } = installLib.skillsBin(env)
  const run = runner || installLib.runSkillBin
  // trusted.json is read once per call, not once per candidate: its authors
  // drive every owner search below. Only a valid author is ever searched, in
  // alphabetical order; any other entry is skipped, never an error.
  const trusted = readTrusted(dataDir)
  const trustedSet = new Set(trusted)
  const validOwners = []
  for (const author of [...new Set(trusted)].sort()) {
    if (!OWNER_PATTERN.test(author)) {
      result.skipped.push(`trusted author ${author}: invalid pattern, not searched`)
      continue
    }
    validOwners.push(author)
  }
  let downloads = 0
  for (const topic of wanted) {
    if (result.candidates.length >= MAX_PER_DESIGN) break
    result.topics.push(topic.id)
    const query = topicQuery(topic)
    for (const extra of validOwners.slice(MAX_OWNERS_PER_TOPIC)) {
      result.skipped.push(`trusted author ${extra} not searched: limit ${MAX_OWNERS_PER_TOPIC}`)
    }
    // One search per trusted author first, then the general one. A search
    // with no `owner/repo@skill` token counts as no results; the topic
    // records an invalid response only when none of its searches brought one.
    // A failed or timed-out search records its error and ends the topic.
    const searches = [...validOwners.slice(0, MAX_OWNERS_PER_TOPIC).map((owner) => ({ owner })), { owner: null }]
    const keys = topicKeys(topic)
    let hadToken = false
    let searchFailed = false
    let attempted = 0
    let accepted = 0
    // The single suggestion of another author of this topic, buffered while
    // its searches run and queued only when the topic made no download attempt.
    let suggestion = null
    const seenPairs = new Set()
    let done = false
    for (const search of searches) {
      if (done || accepted >= 1 || attempted >= MAX_DOWNLOADS_PER_TOPIC) break
      const args = search.owner === null ? ['find', query] : ['find', query, '--owner', search.owner]
      let response = null
      try {
        response = run(cmd, [...prefix, ...args], { cwd: projectRoot, timeoutMs: findTimeoutMs, env })
      } catch (err) {
        result.errors.push(`topic ${topic.id}: search failed: ${String((err && err.message) || err)}`)
        searchFailed = true
        break
      }
      if (!response || response.timedOut) {
        result.errors.push(`topic ${topic.id}: search timed out`)
        searchFailed = true
        break
      }
      if (response.error || response.status !== 0) {
        const detail = String(response.stderr || response.error || `exit ${response.status}`).trim().split('\n')[0]
        result.errors.push(`topic ${topic.id}: search failed: ${detail}`)
        searchFailed = true
        break
      }
      const parsed = parseFindOutput(response.stdout)
      if (parsed.length === 0) continue
      hadToken = true
      for (const item of parsed) {
        if (accepted >= 1 || result.candidates.length >= MAX_PER_DESIGN || attempted >= MAX_DOWNLOADS_PER_TOPIC) {
          done = true
          break
        }
        if (!item.name || !item.source) continue
        if (!SKILL_ID.test(item.name)) continue
        if (!matchesKeys(item.name, item.description, keys)) continue
        if (runNames.has(item.name) || runPairs.has(`${item.source}@${item.name}`)) continue
        if (matchesKeys(item.name, item.description, [...acceptedKeys])) continue
        // A pair already buffered or errored in this topic is skipped. A pair an
        // earlier search only looked at is not: an owner search counts just
        // its own author, so the general search may still take it.
        const pairKey = `${item.source}@${item.name}`
        if (seenPairs.has(pairKey)) continue
        const author = authorOf(item.source)
        if (search.owner !== null && author !== search.owner) continue
        if (!author || !trustedSet.has(author)) {
          // Only the general search buffers the owner's list, and only one
          // suggestion per topic: an owner search counts only the skills of
          // its own author, and a result past a download attempt never
          // counts. The buffered entry is queued after the searches of the
          // topic end, and only when the topic made no download attempt, so
          // a later trusted result that downloads queues nothing. A pair an
          // owner search skipped is not marked seen, so the general search
          // may still buffer it; only a buffered pair or an errored source is.
          if (search.owner !== null || attempted > 0 || accepted > 0) continue
          if (suggestion === null && !seenPairs.has(pairKey)) {
            if (!/^[A-Za-z0-9._~:/-]+$/.test(item.source)) {
              result.errors.push(`topic ${topic.id}: invalid source "${item.source}": not queued`)
              seenPairs.add(pairKey)
              continue
            }
            const command = `npx skills@1.9.0 add ${item.source} --skill ${item.name}`
            suggestion = { source: item.source, author, topic: topic.id, command, reason: 'author not in trusted.json' }
            seenPairs.add(pairKey)
          }
          continue
        }
        // One download attempt per topic and 3 per design, accepted or not.
        // After its attempt the topic ends: no more results, no more
        // searches, no pending suggestion.
        if (downloads >= MAX_DOWNLOADS_PER_DESIGN) {
          done = true
          break
        }
        attempted += 1
        downloads += 1
        const downloaded = installLib.fetchForReview({ source: item.source, name: item.name, env, runner, root: projectRoot })
        if (!downloaded.ok) {
          result.errors.push(`topic ${topic.id}: download failed: ${downloaded.errors.join('; ')}`)
          done = true
          break
        }
        const skillDir = path.join(downloaded.dir, '.agents', 'skills', item.name)
        let review = null
        try {
          review = codeReview(skillDir, { topic, installedNames: [...names], acceptedKeys: [...acceptedKeys] })
        } catch (err) {
          review = { ok: false, problems: [`the code stage failed: ${String((err && err.message) || err)}`] }
        }
        if (!review.ok) {
          installLib.removeDir(downloaded.dir)
          installLib.removeReviewRootIfEmpty(projectRoot)
          result.rejected.push({ name: item.name, source: item.source, topic: topic.id, reasons: review.problems })
          done = true
          break
        }
        fs.writeFileSync(path.join(downloaded.dir, 'review.json'), JSON.stringify({ feature, topic: topic.id, name: item.name, source: item.source, author, hash: downloaded.hash }, null, 2) + '\n')
        const files = installLib.listEntries(skillDir).filter((entry) => entry.kind === 'file').map((entry) => entry.rel).sort()
        result.candidates.push({ id: downloaded.id, topic: topic.id, name: item.name, source: item.source, author, hash: downloaded.hash, dir: downloaded.dir, files, code: { ok: true } })
        runNames.add(item.name)
        runPairs.add(`${item.source}@${item.name}`)
        for (const key of keys) acceptedKeys.add(String(key).toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
        accepted += 1
        done = true
      }
    }
    // A suggestion of another author is queued only in a topic that made no
    // download attempt: the single buffered entry is emitted here, once the
    // searches of the topic have ended.
    if (suggestion !== null && attempted === 0) {
      result.pending.push(suggestion)
      const already = readPending(pendingRoot).some((line) => line && line.class === 'skill-install' && line.source === suggestion.source && line.command === suggestion.command)
      if (!already) appendPending(pendingRoot, { class: 'skill-install', source: suggestion.source, author: suggestion.author, command: suggestion.command, reason: 'author not in trusted.json' })
    }
    if (!hadToken && !searchFailed) {
      result.errors.push(`topic ${topic.id}: invalid response: no skill token`)
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
  const dir = installLib.reviewDir(worktreeOf(cwd || '.'), id)
  let review = null
  try {
    review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'))
  } catch {
    review = null
  }
  if (!review || review.feature !== feature || typeof review.name !== 'string' || typeof review.hash !== 'string') {
    return { ok: false, errors: [`unknown skill id "${id}" for feature "${feature}": no review for it`] }
  }
  if (!SKILL_ID.test(review.name)) {
    return { ok: false, errors: [`the review of "${id}" names an invalid skill "${review.name}": not installed`] }
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
  const warnings = []
  const lockFile = path.join(projectRoot, 'skills-lock.json')
  if (fs.existsSync(lockFile)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      lock.skills = (lock.skills && typeof lock.skills === 'object') ? lock.skills : {}
      lock.skills[review.name] = { ...(lock.skills[review.name] || {}), source: review.source, computedHash: copied.hash }
      if (typeof lock.version !== 'number') lock.version = 1
      fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n')
    } catch (err) {
      warnings.push(`skills-lock.json was not updated: ${String((err && err.message) || err)}`)
    }
  }
  installLib.removeDir(dir)
  installLib.removeReviewRootIfEmpty(worktreeOf(cwd || '.'))
  state.installed.push(id)
  writeState(dataDir, feature, state)
  return { ok: true, name: review.name, hash: copied.hash, path: target, committed: false, warnings }
}

function discardForDesign({ id, cwd, dataDir } = {}) {
  if (!dataDir) return { ok: false, errors: ['no data directory: set AETHER_DATA_DIR'] }
  if (typeof id !== 'string' || !SKILL_ID.test(id)) return { ok: false, errors: [`unknown skill id "${id}"`] }
  const root = worktreeOf(cwd || '.')
  const dir = installLib.reviewDir(root, id)
  let exists = false
  try {
    exists = fs.statSync(dir).isDirectory()
  } catch {
    exists = false
  }
  if (!exists) return { ok: false, errors: [`unknown skill id "${id}"`] }
  installLib.removeDir(dir)
  installLib.removeReviewRootIfEmpty(root)
  try {
    for (const file of fs.readdirSync(stateRoot(dataDir))) {
      if (!file.endsWith('.json')) continue
      const full = path.join(stateRoot(dataDir), file)
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
  const dataDir = runLib.dataDir(env || process.env)
  const [sub, first, second] = rest
  // `skills find <feature>` with 0 to 3 `--topic <t>`: each value a valid
  // and distinct topic id, or the form is a usage error.
  if (sub === 'find' && validFeature(first)) {
    const tail = rest.slice(2)
    if (tail.length % 2 !== 0) return fail()
    const topics = []
    for (let i = 0; i < tail.length; i += 2) {
      if (tail[i] !== '--topic') return fail()
      const topic = tail[i + 1]
      if (typeof topic !== 'string' || !TOPIC_PATTERN.test(topic)) return fail()
      topics.push(topic)
    }
    if (topics.length > 3 || new Set(topics).size !== topics.length) return fail()
    const result = findForDesign({ cwd, feature: first, home, dataDir, env, topics })
    stdout.write(JSON.stringify(result) + '\n')
    return 0
  }
  const shape =
    (sub === 'install' && rest.length === 3 && validFeature(first) && SKILL_ID.test(second || '')) ||
    (sub === 'discard' && rest.length === 2 && SKILL_ID.test(first || ''))
  if (!shape) return fail()
  let result = null
  if (sub === 'install') {
    result = installForDesign({ cwd, feature: first, id: second, home, dataDir, env })
  } else {
    result = discardForDesign({ id: first, cwd, dataDir })
  }
  stdout.write(JSON.stringify(result) + '\n')
  return 0
}

module.exports = {
  SKILLS_USAGE,
  MAX_PER_DESIGN,
  OWNER_PATTERN,
  MAX_OWNERS_PER_TOPIC,
  MAX_DOWNLOADS_PER_TOPIC,
  MAX_DOWNLOADS_PER_DESIGN,
  TOPIC_PATTERN,
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
