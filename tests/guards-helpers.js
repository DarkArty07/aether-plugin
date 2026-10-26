'use strict'

// Helpers for guard tests: module headers, families, citations, duplicates and dead code.

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..')

const EXEMPT_GROUPS = []

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function moduleFiles({ root = ROOT } = {}) {
  const libFiles = []
  const binFiles = []
  const hooksFiles = []

  // 1. plugins/aether/lib/**/*.js
  const libDir = path.join(root, 'plugins', 'aether', 'lib')
  if (fs.existsSync(libDir)) {
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          libFiles.push(path.relative(root, fullPath).replace(/\\/g, '/'))
        }
      }
    }
    walk(libDir)
  }
  libFiles.sort()

  // 2. plugins/aether/bin/* regular files
  const binDir = path.join(root, 'plugins', 'aether', 'bin')
  if (fs.existsSync(binDir)) {
    const entries = fs.readdirSync(binDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(binDir, entry.name)
      if (entry.isFile()) {
        binFiles.push(path.relative(root, fullPath).replace(/\\/g, '/'))
      }
    }
  }
  binFiles.sort()

  // 3. plugins/aether/hooks/*.js and *.mjs without *.test.*
  const hooksDir = path.join(root, 'plugins', 'aether', 'hooks')
  if (fs.existsSync(hooksDir)) {
    const entries = fs.readdirSync(hooksDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(hooksDir, entry.name)
      if (entry.isFile()) {
        const name = entry.name
        if ((name.endsWith('.js') || name.endsWith('.mjs')) && !name.includes('.test.')) {
          hooksFiles.push(path.relative(root, fullPath).replace(/\\/g, '/'))
        }
      }
    }
  }
  hooksFiles.sort()

  return [...libFiles, ...binFiles, ...hooksFiles]
}

function firstCommentBlock(text) {
  let rest = text
  // Skip optional shebang
  if (rest.startsWith('#!')) {
    const nl = rest.indexOf('\n')
    rest = nl === -1 ? '' : rest.slice(nl + 1)
  }

  // Skip whitespace
  rest = rest.replace(/^[ \t\r\n]+/, '')

  // Skip 'use strict' or "use strict"
  const strictMatch = rest.match(/^(?:'use strict'|"use strict");?/)
  if (strictMatch) {
    rest = rest.slice(strictMatch[0].length)
  }

  // Skip whitespace
  rest = rest.replace(/^[ \t\r\n]+/, '')

  if (rest.startsWith('/*')) {
    const end = rest.indexOf('*/')
    if (end !== -1) {
      return rest.slice(0, end + 2)
    }
  } else if (rest.startsWith('//')) {
    const lines = []
    const allLines = rest.split(/\r?\n/)
    for (const line of allLines) {
      if (/^\s*\/\//.test(line)) {
        lines.push(line)
      } else {
        break
      }
    }
    return lines.join('\n')
  }

  return ''
}

function declaredFamilies(markdown) {
  const families = new Map()
  const loose = new Set()

  const sectionMatch = markdown.match(/^##\s+Library families\b([\s\S]*?)(?=^##\s|\Z)/m)
  const section = sectionMatch ? sectionMatch[1] : markdown

  const lines = section.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const parts = trimmed.split('|').slice(1, -1).map((p) => p.trim())
      if (parts.length >= 4) {
        const family = parts[0]
        if (family === 'Family' || family.startsWith('---') || family.startsWith(':---')) {
          continue
        }
        const orchRaw = parts[3]
        let orchestrator = null
        if (orchRaw !== 'none') {
          const m = orchRaw.match(/`([^`]+)`/)
          orchestrator = m ? m[1] : orchRaw
        }
        families.set(family, { orchestrator })
      }
    } else if (/^\s*Loose modules\b/i.test(trimmed)) {
      const matches = trimmed.matchAll(/`([^`]+)`/g)
      for (const m of matches) {
        loose.add(m[1])
      }
    }
  }

  return { families, loose }
}

function expectedFamily(rel, declared) {
  const normalized = rel.replace(/\\/g, '/')
  if (!normalized.includes('plugins/aether/lib/') && !normalized.startsWith('lib/')) {
    return null
  }

  const base = path.basename(normalized)

  if (declared && declared.loose && declared.loose.has(base)) {
    return 'none'
  }

  if (normalized.includes('/harness/') || normalized.startsWith('lib/harness/')) {
    return 'harness'
  }

  if (base.includes('-')) {
    return base.split('-')[0]
  }

  if (declared && declared.families) {
    for (const [familyName, info] of declared.families) {
      if (info && info.orchestrator === base) {
        return familyName
      }
    }
  }

  return { problem: `Module ${base} is not declared in library families or loose modules` }
}

function headerProblems(rel, { root = ROOT, declared } = {}) {
  const problems = []
  const fullPath = path.resolve(root, rel)
  if (!fs.existsSync(fullPath)) {
    return [`File does not exist: ${rel}`]
  }

  const text = fs.readFileSync(fullPath, 'utf8')
  const block = firstCommentBlock(text)
  if (!block) {
    return [`No header comment block found in ${rel}`]
  }

  const cleanText = block.replace(/^\s*\/\//gm, '').replace(/^\s*\/\*|\*\/\s*$/g, '')
  const words = cleanText.trim().split(/\s+/).filter(Boolean)
  if (words.length < 6) {
    problems.push(`Header comment block has fewer than 6 words (${words.length})`)
  }

  const normalized = rel.replace(/\\/g, '/')
  const isLib = normalized.includes('plugins/aether/lib/') || normalized.startsWith('lib/')
  if (isLib) {
    if (!declared) {
      const compPath = path.join(root, 'docs', 'reference', 'components.md')
      if (fs.existsSync(compPath)) {
        declared = declaredFamilies(fs.readFileSync(compPath, 'utf8'))
      }
    }

    const expected = expectedFamily(rel, declared)
    if (expected && typeof expected === 'object' && expected.problem) {
      problems.push(expected.problem)
    } else if (typeof expected === 'string') {
      const familyMatch = block.match(/^\s*\/\/\s*Family:\s*([a-zA-Z0-9_-]+)\.?\s*$/m)
      if (!familyMatch) {
        problems.push(`Missing "// Family: ${expected}." in header comment`)
      } else {
        const found = familyMatch[1]
        if (found !== expected) {
          problems.push(`Header Family mismatch: expected "${expected}", found "${found}"`)
        }
      }
    }
  }

  return problems
}

function extractComments(text) {
  const comments = []
  const tokenRegex = /(`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)/g
  let m
  while ((m = tokenRegex.exec(text)) !== null) {
    if (m[2]) {
      comments.push(m[2])
    }
  }
  return comments.join('\n')
}

function citationsOf(text) {
  const commentText = extractComments(text)
  const decisions = [...new Set(commentText.match(/\b[AD]\d{1,3}\b/g) || [])]
  const specMatches = commentText.matchAll(/\bspec(?:s)?\s*\/?\s*(\d{3})\b/gi)
  const specs = [...new Set([...specMatches].map((m) => m[1]))]
  return { decisions, specs }
}

function citationProblems(rel, { root = ROOT } = {}) {
  const problems = []
  const fullPath = path.resolve(root, rel)
  if (!fs.existsSync(fullPath)) {
    return [`File does not exist: ${rel}`]
  }

  const text = fs.readFileSync(fullPath, 'utf8')
  const { decisions, specs } = citationsOf(text)

  const decPath = path.join(root, 'docs', 'decisions.md')
  const decText = fs.existsSync(decPath) ? fs.readFileSync(decPath, 'utf8') : ''

  for (const dec of decisions) {
    if (dec.startsWith('A')) {
      const re = new RegExp(`\\|\\s*${dec}\\s*\\|`)
      if (!re.test(decText)) {
        problems.push(`Decision ${dec} cited in ${rel} not found as "| ${dec} |" in docs/decisions.md`)
      }
    } else if (dec.startsWith('D')) {
      const re = new RegExp(`^##\\s*${dec}\\.`, 'm')
      if (!re.test(decText)) {
        problems.push(`Decision ${dec} cited in ${rel} not found as "## ${dec}." in docs/decisions.md`)
      }
    }
  }

  const specsDir = path.join(root, 'specs')
  let specFolders = []
  if (fs.existsSync(specsDir)) {
    try {
      specFolders = fs.readdirSync(specsDir).filter((name) => {
        try {
          return fs.statSync(path.join(specsDir, name)).isDirectory()
        } catch {
          return false
        }
      })
    } catch {
      specFolders = []
    }
  }

  for (const s of specs) {
    const exists = specFolders.some((f) => f.startsWith(`${s}-`))
    if (!exists) {
      problems.push(`Spec ${s} cited in ${rel} not found as specs/${s}-*`)
    }
  }

  return problems
}

function definitionsOf(text) {
  const defs = []
  const lines = text.split(/\r?\n/)
  let lineOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const funcMatch = line.match(/^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/)
    const arrowMatch = line.match(/^const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/)

    if (funcMatch) {
      const name = funcMatch[1]
      const bracePos = text.indexOf('{', lineOffset)
      if (bracePos !== -1) {
        let depth = 0
        let endPos = -1
        for (let j = bracePos; j < text.length; j++) {
          if (text[j] === '{') depth++
          else if (text[j] === '}') {
            depth--
            if (depth === 0) {
              endPos = j + 1
              break
            }
          }
        }
        if (endPos !== -1) {
          const rawBody = text.slice(bracePos, endPos)
          const body = rawBody
            .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')
            .replace(/\s+/g, '')
          if (body.length >= 8) {
            defs.push({ name, body })
          }
        }
      }
    } else if (arrowMatch) {
      const name = arrowMatch[1]
      const afterArrow = line.slice(arrowMatch[0].length).trim()
      if (afterArrow.startsWith('{')) {
        const bracePos = text.indexOf('{', lineOffset + arrowMatch[0].length)
        if (bracePos !== -1) {
          let depth = 0
          let endPos = -1
          for (let j = bracePos; j < text.length; j++) {
            if (text[j] === '{') depth++
            else if (text[j] === '}') {
              depth--
              if (depth === 0) {
                endPos = j + 1
                break
              }
            }
          }
          if (endPos !== -1) {
            const rawBody = text.slice(bracePos, endPos)
            const body = rawBody
              .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')
              .replace(/\s+/g, '')
            if (body.length >= 8) {
              defs.push({ name, body })
            }
          }
        }
      } else {
        // Expression body until end of line
        const rawBody = afterArrow.replace(/;?\s*$/, '')
        const body = rawBody
          .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')
          .replace(/\s+/g, '')
        if (body.length >= 8) {
          defs.push({ name, body })
        }
      }
    }

    lineOffset += line.length + 1
  }

  return defs
}

function duplicateGroups(files, { root = ROOT, among } = {}) {
  const targetFiles = new Set(
    files.map((f) => path.relative(root, path.resolve(root, f)).replace(/\\/g, '/'))
  )

  if (!among) {
    among = []
    const libDir = path.join(root, 'plugins', 'aether', 'lib')
    if (fs.existsSync(libDir)) {
      function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.isFile() && e.name.endsWith('.js')) {
            among.push(path.relative(root, p).replace(/\\/g, '/'))
          }
        }
      }
      walk(libDir)
    }
  }

  const bodyToDefs = new Map()
  for (const rel of among) {
    const fullPath = path.resolve(root, rel)
    if (!fs.existsSync(fullPath)) continue
    const text = fs.readFileSync(fullPath, 'utf8')
    const defs = definitionsOf(text)
    for (const def of defs) {
      if (!bodyToDefs.has(def.body)) {
        bodyToDefs.set(def.body, [])
      }
      bodyToDefs.get(def.body).push({ name: def.name, file: rel })
    }
  }

  const groups = []
  for (const [, defs] of bodyToDefs) {
    if (defs.length > 1) {
      const involvesTarget = defs.some((d) => targetFiles.has(d.file))
      if (involvesTarget) {
        const names = defs.map((d) => d.name)
        const fileList = [...new Set(defs.map((d) => d.file))]
        const isExempt = EXEMPT_GROUPS.some((ex) => {
          if (!ex.names) return false
          const s1 = [...ex.names].sort().join(',')
          const s2 = [...names].sort().join(',')
          return s1 === s2
        })
        if (!isExempt) {
          groups.push({ names, files: fileList })
        }
      }
    }
  }

  return groups
}

function stripStrings(code) {
  return code.replace(
    /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)/g,
    (match, dq, sq, bq) => {
      if (dq || sq) return '""'
      if (bq) {
        return bq.replace(/((?:^|})[\s\S]*?(?:\${|$))/g, (m) => m.replace(/[^${}]/g, ' '))
      }
      return '""'
    }
  )
}

function deadNames(rel, { root = ROOT } = {}) {
  const fullPath = path.resolve(root, rel)
  if (!fs.existsSync(fullPath)) return []

  const text = fs.readFileSync(fullPath, 'utf8')
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')
  const codeWithoutStrings = stripStrings(code)

  // Find exported names
  const exported = new Set()
  const expBraceMatch = code.match(/module\.exports\s*=\s*\{([^}]*)\}/)
  if (expBraceMatch) {
    for (const token of expBraceMatch[1].split(',')) {
      const trimmed = token.trim()
      if (!trimmed) continue
      if (trimmed.includes(':')) {
        const val = trimmed.split(':')[1].trim()
        if (val) exported.add(val)
      } else {
        exported.add(trimmed)
      }
    }
  }
  for (const m of code.matchAll(/(?:module\.)?exports\.([a-zA-Z0-9_$]+)\s*=/g)) {
    exported.add(m[1])
  }
  const expDirect = code.match(/module\.exports\s*=\s*([a-zA-Z0-9_$]+)/)
  if (expDirect) {
    exported.add(expDirect[1])
  }

  const candidates = new Set()

  // 1. require imports
  const reqRegex = /(?:const|let|var)\s+([\s\S]*?)\s*=\s*require\s*\(/g
  let reqMatch
  while ((reqMatch = reqRegex.exec(code)) !== null) {
    const raw = reqMatch[1].trim()
    if (raw.startsWith('{') && raw.endsWith('}')) {
      const inner = raw.slice(1, -1)
      for (const token of inner.split(',')) {
        let t = token.trim()
        if (!t) continue
        t = t.split('=')[0].trim()
        if (t.includes(':')) {
          t = t.split(':')[1].trim()
        }
        if (/^[a-zA-Z0-9_$]+$/.test(t)) {
          candidates.add(t)
        }
      }
    } else if (/^[a-zA-Z0-9_$]+$/.test(raw)) {
      candidates.add(raw)
    }
  }

  // 2. Top-level declarations (column 0)
  const lines = code.split(/\r?\n/)
  for (const line of lines) {
    if (!line || /^\s/.test(line)) continue

    const fnMatch = line.match(/^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/)
    if (fnMatch) {
      candidates.add(fnMatch[1])
      continue
    }

    const clsMatch = line.match(/^class\s+([a-zA-Z0-9_$]+)/)
    if (clsMatch) {
      candidates.add(clsMatch[1])
      continue
    }

    const declMatch = line.match(/^(?:const|let|var)\s+([^=;\n]+)/)
    if (declMatch) {
      if (line.includes('require(')) continue
      const raw = declMatch[1].trim()
      if (raw.startsWith('{') && raw.endsWith('}')) {
        for (const token of raw.slice(1, -1).split(',')) {
          let t = token.trim()
          if (!t) continue
          t = t.split('=')[0].trim()
          if (t.includes(':')) t = t.split(':')[1].trim()
          if (/^[a-zA-Z0-9_$]+$/.test(t)) candidates.add(t)
        }
      } else if (raw.startsWith('[') && raw.endsWith(']')) {
        for (const token of raw.slice(1, -1).split(',')) {
          const t = token.trim().split('=')[0].trim()
          if (/^[a-zA-Z0-9_$]+$/.test(t)) candidates.add(t)
        }
      } else {
        const parts = raw.split(',')
        for (const p of parts) {
          const id = p.trim().split('=')[0].trim()
          if (/^[a-zA-Z0-9_$]+$/.test(id)) candidates.add(id)
        }
      }
    }
  }

  const dead = []
  for (const id of candidates) {
    if (exported.has(id)) continue
    const re = new RegExp(`(?<![a-zA-Z0-9_$])${escapeRegex(id)}(?![a-zA-Z0-9_$])`, 'g')
    const count = (codeWithoutStrings.match(re) || []).length
    if (count <= 1) {
      dead.push(id)
    }
  }

  return dead
}

function requireGraph({ root = ROOT } = {}) {
  const libDir = path.join(root, 'plugins', 'aether', 'lib')
  const files = []
  if (fs.existsSync(libDir)) {
    function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.isFile() && e.name.endsWith('.js')) {
          files.push(path.relative(root, p).replace(/\\/g, '/'))
        }
      }
    }
    walk(libDir)
  }

  const graph = new Map()
  for (const rel of files) {
    graph.set(rel, [])
    const fullPath = path.resolve(root, rel)
    const text = fs.readFileSync(fullPath, 'utf8')
    const matches = text.matchAll(/require\s*\(\s*['"](\.\.?[^'"]+)['"]\s*\)/g)
    const dir = path.dirname(fullPath)
    for (const m of matches) {
      let target = path.resolve(dir, m[1])
      if (!target.endsWith('.js') && fs.existsSync(target + '.js')) {
        target = target + '.js'
      } else if (fs.existsSync(path.join(target, 'index.js'))) {
        target = path.join(target, 'index.js')
      }
      const targetRel = path.relative(root, target).replace(/\\/g, '/')
      if (files.includes(targetRel) || targetRel.startsWith('plugins/aether/lib/')) {
        if (!graph.get(rel).includes(targetRel)) {
          graph.get(rel).push(targetRel)
        }
      }
    }
  }
  return graph
}

function findCycles(graph) {
  const cycles = []
  const seenCycleKeys = new Set()

  function dfs(node, visited, pathStack) {
    visited.add(node)
    pathStack.push(node)

    const neighbors = graph.get(node) || []
    for (const neighbor of neighbors) {
      const idx = pathStack.indexOf(neighbor)
      if (idx !== -1) {
        const cycle = pathStack.slice(idx)
        const sortedKey = [...cycle].sort().join('|')
        if (!seenCycleKeys.has(sortedKey)) {
          seenCycleKeys.add(sortedKey)
          cycles.push(cycle)
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, visited, pathStack)
      }
    }

    pathStack.pop()
    visited.delete(node)
  }

  for (const node of graph.keys()) {
    dfs(node, new Set(), [])
  }

  return cycles
}

function adapterProblems(rel, { root = ROOT } = {}) {
  const normalized = rel.replace(/\\/g, '/')
  if (!normalized.includes('plugins/aether/lib/harness/') && !normalized.startsWith('lib/harness/')) {
    return []
  }

  const fullPath = path.resolve(root, rel)
  if (!fs.existsSync(fullPath)) {
    return [`File does not exist: ${rel}`]
  }

  const problems = []
  const text = fs.readFileSync(fullPath, 'utf8')
  const matches = text.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)

  const allowedParents = new Set([
    '../common.js',
    '../common',
    '../lane-process.js',
    '../lane-process',
    '../lane-schemas.js',
    '../lane-schemas',
    '../run.js',
    '../run',
  ])

  for (const m of matches) {
    const req = m[1]
    if (req.startsWith('node:')) continue

    if (req.startsWith('./')) {
      const rest = req.slice(2)
      if (!rest.includes('/')) {
        // Sibling module
        continue
      }
    }

    if (allowedParents.has(req)) {
      continue
    }

    problems.push(`Adapter ${rel} requires disallowed module "${req}"`)
  }

  return problems
}

function checkGroup(name, files, { root = ROOT } = {}) {
  test(`${name}: each module says what it is and its family`, () => {
    const problems = []
    let declared = null
    const compPath = path.join(root, 'docs', 'reference', 'components.md')
    if (fs.existsSync(compPath)) {
      declared = declaredFamilies(fs.readFileSync(compPath, 'utf8'))
    }
    for (const file of files) {
      const p = headerProblems(file, { root, declared })
      for (const item of p) {
        problems.push(`${file}: ${item}`)
      }
    }
    assert.deepEqual(problems, [])
  })

  test(`${name}: every decision and spec cited exists`, () => {
    const problems = []
    for (const file of files) {
      const p = citationProblems(file, { root })
      for (const item of p) {
        problems.push(`${file}: ${item}`)
      }
    }
    assert.deepEqual(problems, [])
  })

  test(`${name}: no helper is defined twice`, () => {
    const duplicates = duplicateGroups(files, { root })
    const problems = []
    for (const g of duplicates) {
      problems.push(`Duplicate helper in ${g.files.join(', ')}: ${g.names.join(', ')}`)
    }
    for (const file of files) {
      const ap = adapterProblems(file, { root })
      for (const item of ap) {
        problems.push(`${file}: ${item}`)
      }
    }
    assert.deepEqual(problems, [])
  })

  test(`${name}: nothing is defined or required and left unused`, () => {
    const problems = []
    for (const file of files) {
      const dead = deadNames(file, { root })
      if (dead.length > 0) {
        problems.push(`${file}: unused names: ${dead.sort().join(', ')}`)
      }
    }
    assert.deepEqual(problems, [])
  })
}

module.exports = {
  ROOT,
  EXEMPT_GROUPS,
  moduleFiles,
  firstCommentBlock,
  declaredFamilies,
  expectedFamily,
  headerProblems,
  citationsOf,
  citationProblems,
  definitionsOf,
  duplicateGroups,
  deadNames,
  requireGraph,
  findCycles,
  adapterProblems,
  checkGroup,
}
