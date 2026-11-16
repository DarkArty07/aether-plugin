'use strict'
// Issue 300 items: AGENTS.md PATH notice and removal of the old Direct-row post-merge test exemption phrase.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.aether') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

test('AGENTS.md warns that aether-* names on PATH in a development tree are the installed release bins (R25)', () => {
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')
  assert.ok(agents.includes('names on `PATH`'), 'AGENTS.md names `names on `PATH``')
  assert.ok(agents.includes('development tree'), 'AGENTS.md mentions development tree')
  assert.ok(agents.includes('installed release'), 'AGENTS.md mentions installed release')
})

test('no live file outside specs/ and node_modules retains the Direct-row post-merge exemption phrase (R26)', () => {
  const targets = [
    ...walkFiles(path.join(ROOT, 'plugins', 'aether')),
    ...walkFiles(path.join(ROOT, 'docs')),
    ...walkFiles(path.join(ROOT, 'site')),
    path.join(ROOT, 'AGENTS.md'),
    path.join(ROOT, 'README.md'),
  ]
  const hits = []
  for (const file of targets) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    if (/after a merge[^\n.]*do not count|do not count[^\n.]*after a merge/i.test(text)) {
      hits.push(path.relative(ROOT, file))
    }
    if (/tras una fusi[oó]n[^\n.]*no cuentan|no cuentan[^\n.]*tras una fusi[oó]n/i.test(text)) {
      hits.push(path.relative(ROOT, file))
    }
  }
  assert.deepEqual(hits, [], `unexpected occurrences in: ${hits.join(', ')}`)
})
