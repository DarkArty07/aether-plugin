'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const ALLOWED = new Set(['docs/changelog.md', 'docs/decisions.md'])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue
      walk(full, out)
    } else if (/\.(md|js|mjs|json|ts|tsx|jsx|yml|yaml|html)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

test('/aether:onboard no longer exists and nothing names it as current (C4, H1 scenario 9)', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'plugins', 'aether', 'skills', 'onboard')), false)
  const files = [...walk(path.join(ROOT, 'plugins', 'aether')), ...walk(path.join(ROOT, 'docs')), path.join(ROOT, 'README.md')]
  const found = files.map((f) => path.relative(ROOT, f)).filter((rel) => !ALLOWED.has(rel) && /onboard/i.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')))
  assert.deepEqual(found, [])
})

test('the help does not list it and still lists the skills a person invokes (C4)', () => {
  const help = fs.readFileSync(path.join(ROOT, 'plugins', 'aether', 'skills', 'help', 'SKILL.md'), 'utf8')
  assert.ok(!/onboard/i.test(help))
  assert.ok(help.includes('/aether:audit') && help.includes('/aether:doctor'))
})
