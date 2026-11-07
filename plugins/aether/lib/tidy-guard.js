'use strict'

// Guard against deletions and renames ordered during tidy under spec 030 R38.
// Family: tidy.

const os = require('node:os')
const path = require('node:path')
const { OLD_CLI_NAMES, OLD_CLI_PATTERNS } = require('./tidy-detect.js')

const WRAPPERS = new Set(['sudo', 'env', 'nohup', 'time', 'command', 'nice', 'timeout', 'exec'])
const VALUED_WRAPPER_FLAGS = new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-n', '-a', '-s', '--signal', '-k', '--kill-after'])
const SHELL_COMMANDS = new Set(['bash', 'sh', 'zsh', 'dash'])
const TIDY_COMMANDS = new Set(['rm', 'mv', 'rmdir', 'unlink'])
const GIT_VALUED_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env'])
const SKILLS_DIR_RE = /(?:^|\/)(\.claude|\.agents)\/skills(?:\/|$)/
const ENV_VAR_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/

function isTidyTarget(rawTarget, opts) {
  if (typeof rawTarget !== 'string' || !rawTarget) return false
  const cwd = opts?.cwd
  const home = opts?.home || os.homedir()
  const norm = rawTarget.replace(/\\/g, '/')
  const stripped = norm.replace(/\/+$/, '')
  const base = path.posix.basename(stripped)

  // 1. Any CLAUDE.md or AGENTS.md
  if (base === 'CLAUDE.md' || base === 'AGENTS.md') {
    return true
  }

  // 2. Old CLI leftovers directly inside .aether/
  const parts = stripped.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[parts.length - 2] === '.aether') {
    const name = parts[parts.length - 1]
    if (OLD_CLI_NAMES.includes(name) || OLD_CLI_PATTERNS.some((pat) => pat.test(name))) {
      return true
    }
  }
  if (cwd) {
    const resolved = path.resolve(cwd, rawTarget).replace(/\\/g, '/').replace(/\/+$/, '')
    const resParts = resolved.split('/').filter(Boolean)
    if (resParts.length >= 2 && resParts[resParts.length - 2] === '.aether') {
      const name = resParts[resParts.length - 1]
      if (OLD_CLI_NAMES.includes(name) || OLD_CLI_PATTERNS.some((pat) => pat.test(name))) {
        return true
      }
    }
  }

  // 3. Skills folders or contents within .claude/skills/, .agents/skills/, ~/.claude/skills/, ~/.agents/skills/
  let expanded = norm
  if (home) {
    const normHome = home.replace(/\\/g, '/').replace(/\/+$/, '')
    if (expanded === '~') expanded = normHome
    else if (expanded.startsWith('~/')) expanded = normHome + expanded.slice(1)
    expanded = expanded.replace(/\$\{HOME\}/g, normHome).replace(/\$HOME/g, normHome)
  }
  if (SKILLS_DIR_RE.test(norm) || SKILLS_DIR_RE.test(expanded)) {
    return true
  }
  if (cwd) {
    const resolved = path.resolve(cwd, rawTarget).replace(/\\/g, '/')
    if (SKILLS_DIR_RE.test(resolved)) {
      return true
    }
  }

  return false
}

function splitLineIntoWords(cmd) {
  const commands = []
  let currentWords = []
  let word = ''
  let quote = null
  let active = false

  const pushWord = () => {
    if (active) {
      currentWords.push(word)
      word = ''
      active = false
    }
  }

  const pushCommand = () => {
    pushWord()
    if (currentWords.length > 0) {
      commands.push(currentWords)
      currentWords = []
    }
  }

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    const next = cmd[i + 1]

    if (ch === '\\' && quote !== "'") {
      active = true
      if (next !== undefined) {
        word += cmd[++i]
      }
      continue
    }

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        word += ch
        active = true
      }
      continue
    }

    if (ch === "'" || ch === '"') {
      quote = ch
      active = true
      continue
    }

    if (ch === ';' || ch === '&' || ch === '|' || ch === '\n' || ch === '(' || ch === ')') {
      pushCommand()
      if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
        i++
      }
      continue
    }

    if (/\s/.test(ch)) {
      pushWord()
      continue
    }

    word += ch
    active = true
  }

  pushCommand()
  return commands
}

function stripCommandWrappers(words) {
  let idx = 0
  while (idx < words.length) {
    const raw = words[idx]
    if (ENV_VAR_ASSIGN.test(raw)) {
      idx++
      continue
    }
    const name = raw.includes('/') ? path.posix.basename(raw) : raw
    if (!WRAPPERS.has(name)) break

    idx++
    while (idx < words.length && words[idx].startsWith('-')) {
      const flag = words[idx]
      if (VALUED_WRAPPER_FLAGS.has(flag)) {
        idx += 2
      } else {
        idx += 1
      }
    }
    if (name === 'timeout' && idx < words.length && !words[idx].startsWith('-')) {
      idx++
    }
  }
  return words.slice(idx)
}

function tidyTargets(command, opts = {}) {
  if (typeof command !== 'string' || !command.trim()) return []
  const found = []

  for (const m of command.matchAll(/\$\(([^)]+)\)|`([^`]+)`/g)) {
    const sub = m[1] || m[2]
    if (sub) {
      found.push(...tidyTargets(sub, opts))
    }
  }

  const commands = splitLineIntoWords(command)
  for (const rawWords of commands) {
    const words = stripCommandWrappers(rawWords)
    if (words.length === 0) continue

    const cmdName = words[0].includes('/') ? path.posix.basename(words[0]) : words[0]

    if (SHELL_COMMANDS.has(cmdName)) {
      for (let i = 1; i < words.length; i++) {
        if (/^-[^-]*c/.test(words[i]) && i + 1 < words.length) {
          found.push(...tidyTargets(words[i + 1], opts))
          break
        }
      }
      continue
    }

    if (cmdName === 'eval') {
      const script = words.slice(1).join(' ')
      if (script) {
        found.push(...tidyTargets(script, opts))
      }
      continue
    }

    if (cmdName === 'git') {
      let g = 1
      while (g < words.length && words[g].startsWith('-')) {
        if (GIT_VALUED_FLAGS.has(words[g])) {
          g += 2
        } else {
          g += 1
        }
      }
      if (g < words.length) {
        const sub = words[g]
        if (sub === 'rm' || sub === 'mv') {
          for (let a = g + 1; a < words.length; a++) {
            const arg = words[a]
            if (arg.startsWith('-')) continue
            if (isTidyTarget(arg, opts)) {
              found.push(arg)
            }
          }
        }
      }
      continue
    }

    if (TIDY_COMMANDS.has(cmdName)) {
      let pastDoubleDash = false
      for (let j = 1; j < words.length; j++) {
        const arg = words[j]
        if (!pastDoubleDash && arg === '--') {
          pastDoubleDash = true
          continue
        }
        if (!pastDoubleDash && arg.startsWith('-')) {
          if (cmdName === 'mv' && (arg === '-t' || arg === '--target-directory')) {
            if (j + 1 < words.length) {
              j++
              if (isTidyTarget(words[j], opts)) {
                found.push(words[j])
              }
            }
          }
          continue
        }
        if (isTidyTarget(arg, opts)) {
          found.push(arg)
        }
      }
    }
  }

  return found
}

function emptiesTidyFile(input) {
  if (!input || input.tool_name !== 'Write' || !input.tool_input) return false
  const filePath = input.tool_input.file_path
  if (typeof filePath !== 'string') return false
  const base = path.posix.basename(filePath.replace(/\\/g, '/'))
  if (base !== 'CLAUDE.md' && base !== 'AGENTS.md') return false
  const content = input.tool_input.content
  if (typeof content !== 'string') return false
  return content.trim() === ''
}

module.exports = {
  tidyTargets,
  emptiesTidyFile,
}
