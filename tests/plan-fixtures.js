'use strict'

// Builders for plan markdown used across the tests. Every task ends with a
// fenced block containing heading-like lines, which the parser must ignore.

function task(n, options = {}) {
  const {
    title = `Task ${n} title`,
    tier = null,
    review = null,
    area = 'core',
    owns = `\`src/t${n}/**\``,
    depends = 'none',
    merges = null,
    serves = null,
  } = options
  const dependsLines = (Array.isArray(depends) ? depends : [depends]).map((d) => `- Depends on: ${d}`)
  return [
    `### Task ${n}: ${title}`,
    '',
    '**Aether:**',
    ...(tier === null ? [] : [`- Tier: ${tier}`]),
    ...(review === null ? [] : [`- Review: ${review}`]),
    `- Area: ${area}`,
    `- Owns: ${owns}`,
    ...(merges === null ? [] : [`- Merges with: ${merges}`]),
    ...dependsLines,
    ...(serves === null ? [] : [`- Serves: ${serves}`]),
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

// A Spec Kit tasks.md as Aether's Writer produces it: an optional Spec line, the
// Aether sections, a checklist index with one line per task, then the task sections.
function specKitTasks(tasks, { spec = '**Spec:** [spec.md](spec.md)' } = {}) {
  const checklist = tasks.map((text) => {
    const [, n, title] = text.match(/^### Task (\d+): (.+)$/m)
    return `- [ ] T${n.padStart(3, '0')} [P] [US1] ${title} → Task ${n}`
  })
  return [
    '# Demo Tasks',
    '',
    ...(spec ? [spec, ''] : []),
    '## Global Constraints',
    '',
    '- Node 22.',
    '',
    '## Aether Execution',
    '',
    '- Test command: `true`',
    '',
    '## Checklist',
    '',
    ...checklist,
    '',
    ...tasks,
  ].join('\n')
}

module.exports = { task, plan, specKitTasks }
