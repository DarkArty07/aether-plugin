'use strict'

// Closed list of retired patterns (spec 017, C1, C6, C7, R4, R17, R19, R20).
// Patterns are constructed by joining fragments so no test file contains a retired pattern whole.

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz|tar)$/i

const GROUPS = {
  options: [
    new RegExp(['\\bCLAUDE_PLUGIN_OPTION_', 'LAN', 'ES\\b'].join('')),
    new RegExp(['\\bAETHER_', 'LAN', 'ES\\b(?!_CONFIG)'].join('')),
    new RegExp(['\\blan', 'es-as-on\\b'].join('')),
    new RegExp(['\\blan', 'es-ignored\\b'].join('')),
    new RegExp(['source:\\s*[\'"]', 'lan', 'es[\'"]'].join('')),
    new RegExp(['\\bgiven\\.', 'lan', 'es\\b'].join('')),
    new RegExp(['\\bCLAUDE_PLUGIN_OPTION_', 'SEA', 'TS\\b'].join('')),
    new RegExp(['\\bAETHER_', 'SEA', 'TS\\b'].join('')),
    new RegExp(['\\bsea', 'ts-ignored\\b'].join('')),
    new RegExp(['\\b(?:', 'sea', 'ts|AETHER_', 'SEA', 'TS|CLAUDE_PLUGIN_OPTION_', 'SEA', 'TS|--sea', 'ts)["\']?\\s*(?:[:=]|\\s)\\s*["\']?(?:robust|balanced|native)\\b'].join('')),
    new RegExp(['\\bAETHER_', 'SUPERDELEGATION_', 'LEGACY\\b'].join('')),
    new RegExp(['\\bLEGACY_', 'NOTES\\b'].join('')),
    new RegExp(['\\blegacy', 'Notes\\b'].join('')),
  ],
  journal: [
    new RegExp(['\\.', 'rout', 'er', '\\.json\\b'].join('')),
    new RegExp(['rout', 'er\\/', 'decisions\\.jsonl'].join('')),
    new RegExp(['[\'"]rout', 'er[\'"],\\s*[\'"]decisions\\.jsonl[\'"]'].join('')),
    new RegExp(['\\bjournal', 'File\\b'].join('')),
    new RegExp(['\\bread', 'Journal\\b'].join('')),
    new RegExp(['\\brout', 'er', '-log\\b'].join('')),
  ],
  leftovers: [
    new RegExp(['\\bwait', 'ForDelegate\\b'].join('')),
    new RegExp(['\\bline', 'Text\\b'].join('')),
    new RegExp(['\\bLANE_', 'NOTES\\b'].join('')),
  ],
  formats: [
    new RegExp(['LEGACY_', 'EXCLUDES'].join('')),
    new RegExp(['LEGACY_', 'HARNESS'].join('')),
    new RegExp(['haiku', '='].join('')),
    new RegExp(['jev', '='].join('')),
  ],
}

function resolvePatterns(groups) {
  if (!groups) {
    return Object.values(GROUPS).flat()
  }
  if (Array.isArray(groups)) {
    return groups.flatMap((item) => (typeof item === 'string' ? (GROUPS[item] || []) : [item]))
  }
  if (typeof groups === 'string') {
    return GROUPS[groups] || []
  }
  if (typeof groups === 'object') {
    return Object.values(groups).flat()
  }
  return []
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

function isR21Retired(file) {
  if (/^docs\/(superpowers|evaluations|roadmap|evidence)\//.test(file)) return true
  if (file.startsWith('docs/handoff/') && file !== 'docs/handoff/2026-10-28-swarm-one-ladder.md') return true
  return false
}

function shouldSearch(file, docs) {
  if (BINARY.test(file)) return false
  if (file.startsWith('specs/')) return false
  if (file === 'docs/changelog.md') return false
  if (isR21Retired(file)) return false

  if (file.startsWith('plugins/aether/') || file.startsWith('tests/') || file.startsWith('scripts/')) {
    return true
  }
  if (docs) {
    if (file === 'README.md' || file === 'CLAUDE.md' || file.startsWith('site/') || file.startsWith('docs/')) {
      return true
    }
  }
  return false
}

function hits(groups, { docs = false } = {}) {
  const patterns = resolvePatterns(groups)
  if (patterns.length === 0) return []
  const files = trackedFiles().filter((file) => shouldSearch(file, docs) && fs.existsSync(path.join(ROOT, file)))
  const results = []
  for (const file of files) {
    const fullPath = path.join(ROOT, file)
    let content
    try {
      content = fs.readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          results.push({ file, line: i + 1, text: line })
          break
        }
      }
    }
  }
  return results
}

module.exports = { GROUPS, hits }
