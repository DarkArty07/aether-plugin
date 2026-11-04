'use strict'

// Reads the whole chain a project command would run, without running anything, and refuses what is risky.
// Family: audit.

const fs = require('node:fs')
const path = require('node:path')
const { readJsonOrNull, readTextOrEmpty } = require('./common.js')

const MAX_LEVELS = 5
const MAX_SCRIPTS = 40
const MAX_FILE_BYTES = 64 * 1024
const MAX_FILE_LINES = 400

// The table of data, one row per class, applied to the NAME of each script and to the TEXT of each segment and file.
const RISKS = [
  { id: 'deploys', name: /(^|[:_-])(deploy|release|publish|rollout)\b/, text: /npm publish|yarn publish|pnpm publish|docker push|kubectl (apply|delete|rollout)|helm (install|upgrade)|terraform (apply|destroy)|pulumi up|serverless deploy|sls deploy|vercel\b|netlify deploy|firebase deploy|gh release|git push|twine upload|cargo publish|gem push|fly deploy|heroku\b/ },
  { id: 'migrates', name: /migrat|db:push/, text: /\bmigrate\b|prisma (migrate|db push)|knex migrate|sequelize db:migrate|alembic upgrade|manage\.py migrate|flyway|liquibase|typeorm migration:run/ },
  { id: 'seeds', name: /\bseed|fixtures:load/, text: /\bseed(s|ing)?\b|db:seed|fixtures:load/ },
  { id: 'live-e2e', name: /\be2e\b|end-to-end|:live\b|smoke/, text: /cypress (run|open)|playwright test|selenium|puppeteer|detox|appium/ },
  { id: 'credentials', name: null, text: /\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|PRIVATE_KEY)[A-Za-z0-9_]*\}?|--token\b|--password\b|\b(aws|gcloud)\s|az login|aws-vault|vault (read|login)|op (run|read)|doppler run/ },
  { id: 'fixes', name: null, text: /--fix\b|--write\b|audit fix|git (fetch|pull|push|commit|add|checkout|reset|clean|stash|merge|rebase|worktree|branch)\b/ },
  { id: 'installs', name: null, text: /\b(npm|pnpm|yarn|bun) (i|install|ci|add)\b|pip install|poetry install|bundle install|composer install|go get|cargo install/ },
]

const EXPLAIN = {
  deploys: 'it deploys, releases or publishes',
  migrates: 'it migrates the database',
  seeds: 'it seeds data',
  'live-e2e': 'it runs live end-to-end tests',
  credentials: 'it reads or passes credentials',
  fixes: 'it fixes files or touches git',
  installs: 'it installs dependencies',
  'too-deep': 'the chain of scripts passes 5 levels',
  'too-wide': 'the chain of scripts passes 40 scripts',
  computed: 'the script name is computed',
  unresolved: 'the manifest does not define the script',
}

const NPM_LIKE = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const RUN_ALL = new Set(['run-s', 'run-p', 'npm-run-all'])
const NPM_BUILTINS = new Set(['test', 't', 'start', 'stop', 'restart'])
const FILE_RUNNERS = new Set(['sh', 'bash', 'node', 'python', 'python3'])

// The global flags the reader knows before an npm-like verb: a value flag consumes the next token.
// Any other flag is refused as unresolved, so an unknown shape fails closed instead of being guessed.
const NPM_VALUE_FLAGS = new Set([
  '--prefix', '--loglevel', '--workspace', '-w', '--package', '--otp', '--registry',
  '--cache', '--userconfig', '--globalconfig', '--scope', '--filter', '--cwd', '--dir',
  '-C', '--tag', '--audit-level',
])
const NPM_BOOL_FLAGS = new Set([
  '--silent', '--quiet', '-q', '--verbose', '-d', '--yes', '-y', '--no-audit', '--no-fund',
  '--if-present', '--workspaces', '--ws', '--include-workspace-root', '--global', '-g',
  '--version', '-v', '--help', '-h', '--ignore-scripts', '--offline', '--prefer-offline',
  '--dry-run', '--force', '--no-save', '--save-exact', '--recursive', '-r',
  '--non-interactive', '--ignore-engines', '--frozen-lockfile', '--no-progress',
])

function reasonText(via, id) {
  if (via.length >= 3) return `\`${via[0]}\` reaches \`${via[via.length - 1]}\` through \`${via[via.length - 2]}\`: ${EXPLAIN[id]}`
  if (via.length === 2) return `\`${via[0]}\` runs \`${via[1]}\`: ${EXPLAIN[id]}`
  return `\`${via[0]}\`: ${EXPLAIN[id]}`
}

function splitSegments(line) {
  return String(line).split(/&&|\|\||;|\||\r?\n/).map((part) => part.trim()).filter((part) => part !== '')
}

function tokensOf(segment) {
  return segment.split(/\s+/).map((token) => token.replace(/^['"]+|['"]+$/g, '')).filter((token) => token !== '')
}

// Drops the VAR=value assignments and the env/cross-env wrappers that precede the real command.
function normalizeTokens(tokens) {
  let list = [...tokens]
  for (;;) {
    while (list.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(list[0])) list.shift()
    if (list.length === 0) return list
    if (list[0] === 'env' || list[0] === 'cross-env') {
      list.shift()
      while (list.length > 0 && list[0].startsWith('-') && list[0] !== '-') {
        const flag = list.shift()
        if (flag === '-u' || flag === '--unset') {
          if (list.length > 0) list.shift()
        }
      }
      continue
    }
    return list
  }
}

// Strips the make recipe prefixes @, - and + (alone or combined) from the start of a recipe line.
function stripRecipePrefix(line) {
  let rest = String(line).trimStart()
  while (rest.startsWith('@') || rest.startsWith('-') || rest.startsWith('+')) {
    rest = rest.slice(1).trimStart()
  }
  return rest
}

// The verb of an npm-like call: the first token after the known global flags, with the value of each value flag consumed.
// A flag the reader does not know gives { unknown }, so the caller refuses the shape instead of guessing it.
function pickPmSub(rest) {
  let at = 0
  while (at < rest.length) {
    const token = rest[at]
    if (token === '-' || !token.startsWith('-')) break
    let name = token
    let inline = false
    if (name.startsWith('--')) {
      const eq = name.indexOf('=')
      if (eq !== -1) {
        inline = true
        name = name.slice(0, eq)
      }
    }
    if (inline) {
      if (!NPM_VALUE_FLAGS.has(name) && !NPM_BOOL_FLAGS.has(name)) return { unknown: token }
      at += 1
      continue
    }
    if (NPM_VALUE_FLAGS.has(name)) {
      if (at + 1 >= rest.length) return { unknown: token }
      at += 2
      continue
    }
    if (NPM_BOOL_FLAGS.has(name)) {
      at += 1
      continue
    }
    return { unknown: token }
  }
  return { sub: rest[at], at }
}

// The first make target in rest, skipping flags and the values of -C, -f and -I.
function pickMakeTarget(rest) {
  const withValue = new Set(['-C', '-f', '-I', '--directory', '--file', '--makefile', '--include-dir'])
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (token.startsWith('-') && token !== '-') {
      if (withValue.has(token)) i += 1
      continue
    }
    if (token.includes('=')) continue
    return token
  }
  return undefined
}

function isComputed(name) {
  return /[$`]/.test(name)
}

function globMatch(name, pattern) {
  const regex = `^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`
  return new RegExp(regex).test(name)
}

// The Makefile targets with their prerequisites and recipe lines; targets that start with a dot are left out.
function parseMakefile(text) {
  const targets = new Map()
  let current = []
  for (const rawLine of String(text).split('\n')) {
    if (/^\t/.test(rawLine)) {
      const recipe = stripRecipePrefix(rawLine.replace(/^\t+/, ''))
      if (recipe !== '') {
        for (const name of current) targets.get(name).recipes.push(recipe)
      }
      continue
    }
    current = []
    const stripped = rawLine.replace(/#.*$/, '')
    const eq = stripped.indexOf('=')
    if (eq !== -1) {
      const colon = stripped.indexOf(':')
      if (colon === -1 || eq < colon) continue
    }
    const match = /^([^:\s][^:]*?)\s*::?\s*(.*)$/.exec(stripped)
    if (!match) continue
    const names = match[1].split(/\s+/).filter((name) => name !== '' && !name.startsWith('.'))
    if (names.length === 0) continue
    let depsPart = match[2]
    let inline = null
    const semi = depsPart.indexOf(';')
    if (semi !== -1) {
      inline = depsPart.slice(semi + 1).trim()
      depsPart = depsPart.slice(0, semi)
    }
    const prereqs = depsPart.split('|')[0].split(/\s+/).filter((name) => name !== '' && !name.includes('='))
    for (const name of names) {
      if (!targets.has(name)) targets.set(name, { prereqs: [], recipes: [] })
      targets.get(name).prereqs.push(...prereqs)
    }
    if (inline !== null && inline !== '') {
      const recipe = stripRecipePrefix(inline)
      if (recipe !== '') {
        for (const name of names) targets.get(name).recipes.push(recipe)
      }
    }
    current = names
  }
  return targets
}

function toxChunks(text) {
  const chunks = []
  let open = false
  let key = null
  for (const rawLine of String(text).split('\n')) {
    if (/^\s*\[[^\]]*\]\s*$/.test(rawLine)) {
      open = /^\s*\[testenv/.test(rawLine)
      key = null
      continue
    }
    if (!open) continue
    const found = /^\s*(commands|commands_pre|commands_post)\s*[=:]\s*(.*)$/.exec(rawLine)
    if (found) {
      key = found[1]
      chunks.push(found[2].trim())
      continue
    }
    if (key !== null && /^\s+\S/.test(rawLine) && chunks.length > 0) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n${rawLine.trim()}`
    } else {
      key = null
    }
  }
  return chunks.filter((chunk) => chunk !== '')
}

// assess(root, commandLine) -> { runnable, reasons } with the whole chain the command would run.
function assess(root, commandLine) {
  const command = String(commandLine)
  const pkg = readJsonOrNull(path.join(root, 'package.json'))
  const composer = readJsonOrNull(path.join(root, 'composer.json'))
  const makeText = readTextOrEmpty(path.join(root, 'Makefile')) || readTextOrEmpty(path.join(root, 'makefile'))
  const toxText = readTextOrEmpty(path.join(root, 'tox.ini'))
  const reasons = []
  const seenReasons = new Set()
  const visited = new Set()
  const state = { scripts: 0, wide: false }

  function addReason(id, via) {
    const key = `${id}\0${via.join('\0')}`
    if (seenReasons.has(key)) return
    seenReasons.add(key)
    reasons.push({ id, via: [...via], text: reasonText(via, id) })
  }

  function checkName(name, via) {
    for (const row of RISKS) {
      if (row.name !== null && row.name.test(name)) addReason(row.id, via)
    }
  }

  function checkTextContent(text, via) {
    for (const row of RISKS) {
      if (row.text.test(text)) addReason(row.id, via)
    }
  }

  function claimSlot(via) {
    state.scripts += 1
    if (state.scripts > MAX_SCRIPTS) {
      if (!state.wide) {
        state.wide = true
        addReason('too-wide', via)
      }
      return false
    }
    return true
  }

  function pkgScripts() {
    return pkg !== null && typeof pkg === 'object' && pkg.scripts !== null && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts) ? pkg.scripts : {}
  }

  function resolveNpm(name, level, via) {
    if (state.wide) return
    if (isComputed(name)) {
      addReason('computed', [...via, name])
      return
    }
    const nodeVia = [...via, name]
    if (level > MAX_LEVELS) {
      addReason('too-deep', nodeVia)
      return
    }
    const key = `npm:${name}`
    if (visited.has(key)) return
    visited.add(key)
    checkName(name, nodeVia)
    const scripts = pkgScripts()
    if (!Object.hasOwn(scripts, name)) {
      addReason('unresolved', nodeVia)
      return
    }
    if (!claimSlot(nodeVia)) return
    const body = scripts[name]
    if (typeof body !== 'string') {
      addReason('unresolved', nodeVia)
      return
    }
    if (body === '') return
    followSegments(body, level + 1, nodeVia)
  }

  function resolvePmCommand(name, level, via) {
    const scripts = pkgScripts()
    for (const candidate of [`pre${name}`, name, `post${name}`]) {
      if (candidate === name || Object.hasOwn(scripts, candidate)) resolveNpm(candidate, level, via)
    }
  }

  function resolveMake(target, level, via, lenient) {
    if (state.wide) return
    if (isComputed(target)) {
      addReason('computed', [...via, target])
      return
    }
    const nodeVia = [...via, target]
    if (level > MAX_LEVELS) {
      addReason('too-deep', nodeVia)
      return
    }
    const key = `make:${target}`
    if (visited.has(key)) return
    visited.add(key)
    checkName(target, nodeVia)
    if (makeText === '') {
      addReason('unresolved', nodeVia)
      return
    }
    const table = parseMakefile(makeText)
    if (!table.has(target)) {
      if (!lenient) addReason('unresolved', nodeVia)
      return
    }
    if (!claimSlot(nodeVia)) return
    const rule = table.get(target)
    for (const prereq of rule.prereqs) {
      if (isComputed(prereq)) {
        addReason('computed', [...nodeVia, prereq])
      } else if (table.has(prereq)) {
        resolveMake(prereq, level + 1, nodeVia, true)
      } else {
        checkName(prereq, [...nodeVia, prereq])
      }
    }
    for (const recipe of rule.recipes) followSegments(recipe, level + 1, nodeVia)
  }

  function resolveComposer(name, level, via) {
    if (state.wide) return
    if (isComputed(name)) {
      addReason('computed', [...via, name])
      return
    }
    const nodeVia = [...via, name]
    if (level > MAX_LEVELS) {
      addReason('too-deep', nodeVia)
      return
    }
    const key = `composer:${name}`
    if (visited.has(key)) return
    visited.add(key)
    checkName(name, nodeVia)
    const scripts = composer !== null && typeof composer === 'object' && composer.scripts !== null && typeof composer.scripts === 'object' && !Array.isArray(composer.scripts) ? composer.scripts : null
    if (scripts === null || !Object.hasOwn(scripts, name)) {
      addReason('unresolved', nodeVia)
      return
    }
    if (!claimSlot(nodeVia)) return
    const body = scripts[name]
    const commands = Array.isArray(body) ? body : [body]
    for (const entry of commands) {
      if (typeof entry !== 'string' || entry === '') continue
      const atRef = /^@(\S+)/.exec(entry.trim())
      if (atRef !== null) {
        if (Object.hasOwn(scripts, atRef[1])) {
          resolveComposer(atRef[1], level + 1, nodeVia)
        } else {
          addReason('unresolved', [...nodeVia, atRef[1]])
        }
      } else {
        followSegments(entry, level + 1, nodeVia)
      }
    }
  }

  function followRunAll(names, level, via) {
    const scripts = pkgScripts()
    for (const token of names) {
      if (token === '' || token.startsWith('-')) continue
      if (isComputed(token)) {
        addReason('computed', [...via, token])
      } else if (token.includes('*')) {
        const matched = Object.keys(scripts).filter((name) => globMatch(name, token))
        if (matched.length === 0) addReason('unresolved', [...via, token])
        for (const name of matched) resolveNpm(name, level, via)
      } else {
        resolveNpm(token, level, via)
      }
    }
  }

  function followFileCandidate(token, level, via) {
    const file = path.resolve(root, token)
    const relative = path.relative(root, file)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return
    let stat = null
    try {
      stat = fs.statSync(file)
    } catch {
      return
    }
    if (!stat.isFile()) return
    const key = `file:${file}`
    if (visited.has(key)) return
    visited.add(key)
    let text = ''
    try {
      text = fs.readFileSync(file).slice(0, MAX_FILE_BYTES).toString('utf8').split('\n').slice(0, MAX_FILE_LINES).join('\n')
    } catch {
      return
    }
    const fileVia = [...via, token]
    checkName(path.basename(token), fileVia)
    checkTextContent(text, fileVia)
  }

  function followFileRefs(tokens, level, via) {
    const seen = new Set()
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (FILE_RUNNERS.has(token) && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        if (!seen.has(tokens[i + 1])) {
          seen.add(tokens[i + 1])
          followFileCandidate(tokens[i + 1], level, via)
        }
        i += 1
      } else if (/^\.\//.test(token) || /^[\w@.~-][\w@.~/-]*\/\S+$/.test(token)) {
        if (!seen.has(token)) {
          seen.add(token)
          followFileCandidate(token, level, via)
        }
      }
    }
  }

  function followSegment(segment, level, via) {
    const normalized = normalizeTokens(tokensOf(segment))
    if (normalized.length === 0) return
    const [head, ...rest] = normalized
    if (NPM_LIKE.has(head)) {
      const picked = pickPmSub(rest)
      if (picked.unknown !== undefined) {
        addReason('unresolved', [...via, picked.unknown])
      } else {
        const sub = picked.sub
        if (sub === 'run' || sub === 'run-script') {
          let nameAt = picked.at + 1
          while (rest[nameAt] !== undefined && rest[nameAt].startsWith('-')) nameAt += 1
          const name = rest[nameAt]
          if (name !== undefined && !name.startsWith('-')) resolvePmCommand(name, level, via)
        } else if (sub !== undefined && NPM_BUILTINS.has(sub === 't' ? 'test' : sub)) {
          resolvePmCommand(sub === 't' ? 'test' : sub, level, via)
        } else if (head !== 'npm' && sub !== undefined && !sub.startsWith('-')) {
          resolvePmCommand(sub, level, via)
        }
      }
    } else if (RUN_ALL.has(head)) {
      followRunAll(rest, level, via)
    } else if (head === 'make' || head === '$(MAKE)' || head === '${MAKE}') {
      const target = pickMakeTarget(rest)
      if (target !== undefined) resolveMake(target, level, via, false)
    } else if (head === 'composer') {
      if (rest[0] === 'run-script') {
        if (rest[1] !== undefined && !rest[1].startsWith('-')) resolveComposer(rest[1], level, via)
      } else if (rest[0] !== undefined && !rest[0].startsWith('-')) {
        resolveComposer(rest[0], level, via)
      }
    } else if (head === 'tox') {
      if (toxText !== '') {
        const key = 'tox:tox.ini'
        if (!visited.has(key)) {
          visited.add(key)
          const nodeVia = [...via, 'tox.ini']
          if (!claimSlot(nodeVia)) return
          for (const chunk of toxChunks(toxText)) followSegments(chunk, level + 1, nodeVia)
        }
      }
    }
    checkTextContent(segment, via)
    followFileRefs(normalized, level, via)
  }

  function followSegments(text, level, via) {
    for (const segment of splitSegments(text)) followSegment(segment, level, via)
  }

  followSegments(command, 1, [command])
  return { runnable: reasons.length === 0, reasons }
}

module.exports = {
  RISKS,
  assess,
  parseMakefile,
}
