'use strict'

// Builders for plan markdown used across the tests. Every task ends with a
// fenced block containing heading-like lines, which the parser must ignore.

function task(n, options = {}) {
  const {
    title = `Task ${n} title`,
    tier = 'haiku — complete code',
    area = 'core',
    owns = `\`src/t${n}/**\``,
    depends = 'none',
  } = options
  const dependsLines = (Array.isArray(depends) ? depends : [depends]).map((d) => `- Depends on: ${d}`)
  return [
    `### Task ${n}: ${title}`,
    '',
    '**Aether:**',
    `- Tier: ${tier}`,
    `- Area: ${area}`,
    `- Owns: ${owns}`,
    ...dependsLines,
    '',
    '- [ ] **Step 1: Do the work**',
    '',
    '```bash',
    '## not a heading',
    '### Task 99: not a task either',
    '```',
    '',
  ].join('\n')
}

function plan(tasks, { execution = ['- Test command: `true`'] } = {}) {
  return [
    '# Demo Implementation Plan',
    '',
    '**Spec:** `docs/spec.md`',
    '',
    '## Global Constraints',
    '',
    '- Node 22.',
    '',
    '## Aether Execution',
    '',
    ...execution,
    '',
    '---',
    '',
    ...tasks,
  ].join('\n')
}

module.exports = { task, plan }
