'use strict'

const fs = require('node:fs')
const path = require('node:path')

const NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']

// An assignment of an array literal, or of a Set built from one. The body stops at the first `]`.
const ASSIGN = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:new\s+Set\s*\(\s*)?\[([\s\S]*?)\]/g
const QUOTED = /'([^'\\]*)'|"([^"\\]*)"/g

function quoted(body) {
  const items = []
  const re = new RegExp(QUOTED.source, 'g')
  let match
  while ((match = re.exec(body)) !== null) items.push(match[1] ?? match[2])
  return items
}

// A fixed list names two or more of NAMES among its quoted strings. Other strings stay in `items`.
function listsIn(text, file) {
  const found = []
  const re = new RegExp(ASSIGN.source, 'g')
  let match
  while ((match = re.exec(text)) !== null) {
    const items = quoted(match[2])
    const named = items.filter((item) => NAMES.includes(item))
    if (new Set(named).size >= 2) found.push({ file, name: match[1], items })
  }
  return found
}

function filesUnder(dir, { recursive, ext }) {
  if (!fs.existsSync(dir)) return []
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (recursive) found.push(...filesUnder(full, { recursive, ext }))
    } else if (entry.isFile() && entry.name.endsWith(ext)) found.push(full)
  }
  return found
}

function fixedLists(root) {
  const files = [
    ...filesUnder(path.join(root, 'plugins/aether/lib'), { recursive: true, ext: '.js' }),
    ...filesUnder(path.join(root, 'plugins/aether/hooks'), { recursive: false, ext: '.mjs' }),
    ...filesUnder(path.join(root, 'scripts'), { recursive: false, ext: '.js' })
  ]
  const lists = files.flatMap((full) => listsIn(fs.readFileSync(full, 'utf8'), path.relative(root, full)))
  lists.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return lists
}

module.exports = { NAMES, fixedLists, listsIn }
