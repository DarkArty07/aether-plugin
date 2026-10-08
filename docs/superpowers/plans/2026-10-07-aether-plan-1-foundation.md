# Aether Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation of the aether plugin:
- the plugin skeleton, with its SessionStart bootstrap;
- `aether-plan`, which checks and compiles plans that carry Aether fields;
- `aether-wt`, which creates, packages, merges and cleans up unit worktrees.

**Architecture:** A Claude Code plugin in `plugins/aether/`. Two CLIs in `bin/` share small CommonJS modules in `lib/`:
- `globs`: ownership patterns;
- `plan`: the plan parser and its graph of waves;
- `git` and `run`: paths, ids and records;
- `worktrees`: the unit lifecycle.

A SessionStart hook injects the `using-aether` bootstrap and sweeps stale runs. Every CLI prints exactly one JSON object, so that a workflow agent (Plan 2) can relay it unchanged.

**Tech Stack:** Node.js 22 (CommonJS, no dependencies), `node:test`, git 2.53, fish 4.2.

**Spec:** `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`. This plan covers implementation steps 1–3 of §13, the plan rules in §6, the merge rules in §7 (step 4) and the cleanup rules in §9.

## Global Constraints

- Node.js 22 with no third-party dependencies. Modules are CommonJS. Tests use `node:test` and run with `node --test "tests/*.test.js"`.
- The plugin lives in `plugins/aether/`. Plugin id `aether`, version `0.1.0`.
- Aether only touches paths under `<repo>/.aether/` and branches under `aether/`. It never deletes the integration branch or its worktree.
- Git exclusions go to `.git/info/exclude`. Never edit a project's `.gitignore`.
- Layout:
  - unit worktree: `<repo>/.aether/worktrees/<run>/<task>`;
  - unit branch: `aether/<run>/<task>`;
  - run directory: `<repo>/.aether/runs/<run>/`;
  - unit temporary directory: `<unit worktree>/.aether-tmp/`.
- Ids:
  - run ids match `YYYYMMDD-HHMMSS-xxxx`, where `xxxx` is four hex characters;
  - task ids match `task-N`.
- The data directory is `~/.local/share/aether-plugin/`, overridden by `AETHER_DATA_DIR`. Tests always override it. Never use `~/.local/share/aether/`: it belongs to the installed Aether Agents.
- Every CLI prints exactly one JSON object on stdout. On failure, `aether-plan` prints `{"ok": false, "errors": [...], "warnings": [...]}`, `aether-wt` prints `{"error": "..."}`, and both exit 1.
- Code, comments and docs are in English (decision D13).
- Tests remove every temporary directory they create.

## Review Focus

1. **Dash and case variants.** Aether fields written with other dash characters or capitals, such as `Sonnet - reason` or `task 1 -- reason`, must parse like the canonical form. Test: Task 2, "parsePlan accepts dash and case variants".
2. **Paths with spaces.** Several of the owner's projects have spaces in their paths, so compile, ensure and merge must work there. Test: Task 5, "merge works when the repository path contains spaces".
3. **Units that committed nothing.** A unit that reports DONE but committed nothing must not count as merged. Test: Task 5, "merge refuses a unit that committed nothing".
4. **Worktrees deleted by hand.** `ensure` must recreate a unit worktree whose directory was deleted by hand, or replace a leftover directory, with no manual git repair. Tests: Task 4, "ensure recreates a worktree whose directory was deleted by hand" and "ensure replaces a leftover directory that is not a worktree".
5. **Wrong branch.** Compiling on a detached HEAD, or on `main`, must refuse with a clear message instead of creating a run. Test: Task 3, "compile refuses main unless --allow-main, and refuses a detached HEAD".

## File Structure

| File | Responsibility |
|---|---|
| `plugins/aether/lib/globs.js` | Normalize ownership patterns, test whether two of them overlap, and match files against them |
| `plugins/aether/lib/plan.js` | Parse a superpowers plan with Aether fields, build the graph of waves, render task briefs |
| `plugins/aether/lib/git.js` | Run git and locate the repository: worktree, common git dir, main root |
| `plugins/aether/lib/run.js` | Run and task ids, run paths, data directory, JSON files, run records, git exclusions |
| `plugins/aether/lib/worktrees.js` | Unit lifecycle: ensure, diff package, merge, remove, sweep a run, sweep stale runs |
| `plugins/aether/bin/aether-plan` | CLI: `check` and `compile` |
| `plugins/aether/bin/aether-wt` | CLI: `ensure`, `diff`, `merge`, `remove`, `sweep` |
| `plugins/aether/bin/aether-session-start` | SessionStart hook: bootstrap context and stale sweep |
| `plugins/aether/.claude-plugin/plugin.json` | Manifest |
| `plugins/aether/hooks/hooks.json` | Registers the SessionStart hook |
| `plugins/aether/skills/using-aether/SKILL.md` | Designer bootstrap for Aether mode |
| `scripts/aether-mode.fish` | The `aether-mode` shell function |
| `tests/plan-fixtures.js`, `tests/helpers.js` | Plan builders, throwaway repositories, CLI runners |
| `tests/*.test.js` | One test file per task |

Out of scope for this plan: agents, the `/aether:run` workflow and the `swarm` skill (Plan 2); the usage meter, `aether-report` and the trial (Plan 3).

---

### Task 1: Ownership patterns

**Files:**
- Create: `plugins/aether/lib/globs.js`
- Test: `tests/globs.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizePattern(pattern: string): string`
  - `isGlob(pattern: string): boolean`
  - `staticPrefix(pattern: string): string`
  - `patternsOverlap(a: string, b: string): boolean`
  - `globToRegExp(pattern: string): RegExp`
  - `matchesAny(filePath: string, patterns: string[]): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/globs.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePattern, staticPrefix, patternsOverlap, matchesAny } = require('../plugins/aether/lib/globs.js')

test('normalizePattern strips backticks, ./ and trailing slashes', () => {
  assert.equal(normalizePattern('`src/api/**`'), 'src/api/**')
  assert.equal(normalizePattern('./docs/'), 'docs')
  assert.equal(normalizePattern(' web\\login\\form.tsx '), 'web/login/form.tsx')
})

test('staticPrefix stops at the first wildcard segment', () => {
  assert.equal(staticPrefix('src/api/**'), 'src/api')
  assert.equal(staticPrefix('web/*.css'), 'web')
  assert.equal(staticPrefix('**'), '')
  assert.equal(staticPrefix('docs/api.md'), 'docs/api.md')
})

test('patternsOverlap is true when two patterns can match one path', () => {
  assert.equal(patternsOverlap('src/**', 'src/a.ts'), true)
  assert.equal(patternsOverlap('src/**', 'src/api/**'), true)
  assert.equal(patternsOverlap('src', 'src/a.ts'), true)
  assert.equal(patternsOverlap('**', 'web/login/form.tsx'), true)
  assert.equal(patternsOverlap('web/*.css', 'web/a.ts'), true)
  assert.equal(patternsOverlap('src/a.ts', 'src/a.ts'), true)
})

test('patternsOverlap is false for disjoint files and directories', () => {
  assert.equal(patternsOverlap('src/a.ts', 'src/b.ts'), false)
  assert.equal(patternsOverlap('src/a/**', 'src/b/**'), false)
  assert.equal(patternsOverlap('src/api/**', 'src/apix/**'), false)
})

test('matchesAny matches files against wildcard and plain patterns', () => {
  assert.equal(matchesAny('src/api/x.ts', ['src/api/**']), true)
  assert.equal(matchesAny('src/apix/y.ts', ['src/api/**']), false)
  assert.equal(matchesAny('a/c.ts', ['a/**/c.ts']), true)
  assert.equal(matchesAny('a/b/d/c.ts', ['a/**/c.ts']), true)
  assert.equal(matchesAny('a/b/c.js', ['a/**/*.ts']), false)
  assert.equal(matchesAny('docs/guide/x.md', ['docs']), true)
  assert.equal(matchesAny('README.md', ['README.md']), true)
  assert.equal(matchesAny('README.md.bak', ['README.md']), false)
  assert.equal(matchesAny('f1.txt', ['f?.txt']), true)
  assert.equal(matchesAny('dir/f1.txt', ['f?.txt']), false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/globs.test.js`
Expected: FAIL, with `Cannot find module '../plugins/aether/lib/globs.js'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/aether/lib/globs.js`:

```js
'use strict'

// Path patterns for task ownership. Supported syntax: `*` (within one
// segment), `**` (any depth) and `?` (one character). A pattern without
// wildcards names a file or a directory.

const WILDCARD = /[*?]/

function normalizePattern(pattern) {
  let p = String(pattern).trim()
  if (p.length >= 2 && p.startsWith('`') && p.endsWith('`')) p = p.slice(1, -1).trim()
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '')
}

function isGlob(pattern) {
  return WILDCARD.test(normalizePattern(pattern))
}

// The literal part of a pattern, before its first wildcard segment.
function staticPrefix(pattern) {
  const kept = []
  for (const segment of normalizePattern(pattern).split('/')) {
    if (WILDCARD.test(segment)) break
    kept.push(segment)
  }
  return kept.join('/')
}

function anchor(pattern) {
  const p = normalizePattern(pattern)
  return isGlob(p) ? staticPrefix(p) : p
}

function within(p, dir) {
  return dir === '' || p === dir || p.startsWith(dir + '/')
}

// Conservative: true whenever the two patterns could match a common path.
function patternsOverlap(a, b) {
  const x = anchor(a)
  const y = anchor(b)
  return within(x, y) || within(y, x)
}

function globToRegExp(pattern) {
  const p = normalizePattern(pattern)
  let out = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        out += '(?:.*/)?'
        i += 2
      } else {
        out += '.*'
        i += 1
      }
    } else if (c === '*') {
      out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp('^' + out + '$')
}

function matchesAny(filePath, patterns) {
  const f = normalizePattern(filePath)
  return patterns.some((pattern) => {
    const p = normalizePattern(pattern)
    return isGlob(p) ? globToRegExp(p).test(f) : within(f, p)
  })
}

module.exports = { normalizePattern, isGlob, staticPrefix, patternsOverlap, globToRegExp, matchesAny }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/globs.test.js`
Expected: PASS, with `# pass 5` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/globs.js tests/globs.test.js
git commit -m "feat(aether): compare and match ownership patterns" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Plan parser and graph of waves

**Files:**
- Create: `plugins/aether/lib/plan.js`
- Create: `tests/plan-fixtures.js`
- Test: `tests/plan.test.js`

**Interfaces:**
- Consumes: `normalizePattern` and `patternsOverlap` from `lib/globs.js` (Task 1).
- Produces:
  - `parsePlan(markdown: string)`, returning `{ tasks, execution, globalConstraints, spec, errors }`:
    - each task is `{ number, title, text, tier, tierReason, area, owns: string[], dependsOn: {number, reason}[] }`;
    - `execution` is `{ testCommand, ladder: {haiku, sonnet, opus}, maxAgents }`;
    - `errors` is `string[]`.
  - `buildGraph(parsed, { only?: string[] })`, returning `{ waves: string[][], tasks: Record<'task-N', { number, title, tier, tierReason, area, owns, dependsOn: string[] }>, errors: string[], warnings: string[] }`.
  - `renderBrief(task, { planPath, spec, globalConstraints }): string`.
  - Test builders in `tests/plan-fixtures.js`:
    - `task(n, { title, tier, area, owns, depends })` returns the markdown for one task;
    - `plan(tasks, { execution })` returns a whole plan.

- [ ] **Step 1: Write the fixtures and the failing test**

Create `tests/plan-fixtures.js`:

````js
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
````

Create `tests/plan.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parsePlan, buildGraph, renderBrief } = require('../plugins/aether/lib/plan.js')
const { task, plan } = require('./plan-fixtures.js')

test('parsePlan reads tasks, Aether fields, execution, constraints and spec', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, {
      tier: 'sonnet — interactive UI',
      area: 'web',
      owns: '`web/login/**`, `web/tests/login.test.js`',
      depends: 'Task 1 — calls the API client',
    }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.tasks.length, 2)
  const t2 = parsed.tasks[1]
  assert.equal(t2.number, 2)
  assert.equal(t2.tier, 'sonnet')
  assert.equal(t2.tierReason, 'interactive UI')
  assert.equal(t2.area, 'web')
  assert.deepEqual(t2.owns, ['web/login/**', 'web/tests/login.test.js'])
  assert.deepEqual(t2.dependsOn, [{ number: 1, reason: 'calls the API client' }])
  assert.match(t2.text, /^### Task 2: Task 2 title/)
  assert.equal(parsed.execution.testCommand, 'true')
  assert.deepEqual(parsed.execution.ladder, { haiku: 2, sonnet: 2, opus: 1 })
  assert.equal(parsed.execution.maxAgents, 200)
  assert.equal(parsed.globalConstraints, '- Node 22.')
  assert.equal(parsed.spec, 'docs/spec.md')
})

test('parsePlan ignores headings inside fenced code', () => {
  const parsed = parsePlan(plan([task(1)]))
  assert.equal(parsed.tasks.length, 1)
  assert.match(parsed.tasks[0].text, /### Task 99: not a task either/)
})

test('parsePlan accepts dash and case variants', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, { tier: 'Sonnet - UI work', depends: 'task 1 -- needs the client' }),
    task(3, { tier: 'OPUS – migration' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.tasks[1].tier, 'sonnet')
  assert.deepEqual(parsed.tasks[1].dependsOn, [{ number: 1, reason: 'needs the client' }])
  assert.equal(parsed.tasks[2].tier, 'opus')
})

test('parsePlan reports missing and malformed Aether fields', () => {
  const md = plan([
    ['### Task 1: No block', '', 'Just text.'].join('\n'),
    ['### Task 2: Bad tier', '', '**Aether:**', '- Tier: gpt — no', '- Area: core', '- Owns: `a/**`', '- Depends on: none'].join('\n'),
    ['### Task 3: Bare fields', '', '**Aether:**', '- Tier: haiku', '- Area: Core Area', '- Owns: `b/**`', '- Depends on: Task 1'].join('\n'),
    ['### Task 4: Missing fields', '', '**Aether:**', '- Tier: haiku — fine'].join('\n'),
  ], { execution: ['- Ladder: haiku 2, sonnet 2'] })
  const { errors } = parsePlan(md)
  assert.ok(errors.includes('Task 1: missing the **Aether:** block.'))
  assert.ok(errors.includes('Task 2: Tier must be haiku, sonnet or opus followed by " — reason".'))
  assert.ok(errors.includes('Task 3: Tier must be haiku, sonnet or opus followed by " — reason".'))
  assert.ok(errors.includes('Task 3: Area must be lowercase letters, digits and dashes.'))
  assert.ok(errors.includes('Task 3: "Depends on: Task 1" needs the form "Task N — reason".'))
  assert.ok(errors.includes('Task 4: missing Area.'))
  assert.ok(errors.includes('Task 4: missing Owns.'))
  assert.ok(errors.includes('Task 4: missing "Depends on" (use "Depends on: none" for an independent task).'))
  assert.ok(errors.includes('Aether Execution: the ladder has no "opus" entry.'))
  assert.ok(errors.includes('Aether Execution: "Test command" is missing.'))
})

test('parsePlan requires the Aether Execution section, tasks, and unique task numbers', () => {
  const empty = parsePlan('# Empty plan\n')
  assert.ok(empty.errors.includes('The plan has no "## Aether Execution" section.'))
  assert.ok(empty.errors.includes('The plan has no "### Task N: ..." headings.'))
  assert.ok(parsePlan(plan([task(1), task(1)])).errors.includes('Task 1 appears more than once.'))
})

test('buildGraph layers tasks into waves', () => {
  const graph = buildGraph(parsePlan(plan([task(1), task(2, { depends: 'Task 1 — needs it' }), task(3)])))
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.waves, [['task-1', 'task-3'], ['task-2']])
  assert.deepEqual(graph.tasks['task-2'].dependsOn, ['task-1'])
  assert.equal(graph.tasks['task-2'].tier, 'haiku')
})

test('buildGraph refuses overlapping owners in one wave', () => {
  const parsed = parsePlan(plan([task(1, { owns: '`src/**`' }), task(2, { owns: '`src/api/x.ts`' }), task(3, { owns: '`docs/t3.md`' })]))
  assert.deepEqual(buildGraph(parsed).errors, ['Task 1 and Task 2 run in the same wave but both own "src/**" and "src/api/x.ts".'])
})

test('buildGraph allows the same files in different waves', () => {
  const parsed = parsePlan(plan([
    task(1, { owns: '`src/**`' }),
    task(2, { owns: '`src/api/x.ts`', depends: 'Task 1 — builds on it' }),
    task(3, { owns: '`docs/t3.md`' }),
  ]))
  assert.deepEqual(buildGraph(parsed).errors, [])
})

test('buildGraph refuses a chain', () => {
  const parsed = parsePlan(plan([task(1), task(2, { depends: 'Task 1 — next' }), task(3, { depends: 'Task 2 — next' })]))
  const { errors } = buildGraph(parsed)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^The plan is a chain/)
})

test('buildGraph warns about low parallelism', () => {
  const parsed = parsePlan(plan([task(1), task(2, { depends: 'Task 1 — a' }), task(3, { depends: 'Task 2 — b' }), task(4)]))
  const graph = buildGraph(parsed)
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.warnings, ['Low parallelism: 4 tasks in 3 waves (average 1.33 per wave).'])
})

test('buildGraph reports cycles and unknown dependencies', () => {
  const parsed = parsePlan(plan([task(1, { depends: 'Task 2 — a' }), task(2, { depends: 'Task 1 — b' }), task(3, { depends: 'Task 9 — c' })]))
  const { errors } = buildGraph(parsed)
  assert.ok(errors.includes('Task 3 depends on Task 9, which is not in the plan.'))
  assert.ok(errors.includes('Dependency cycle among: Task 1, Task 2.'))
})

test('buildGraph with only keeps the named tasks and drops dependencies outside them', () => {
  const parsed = parsePlan(plan([task(1), task(2, { depends: 'Task 1 — a' }), task(3, { depends: 'Task 1 — b' })]))
  const graph = buildGraph(parsed, { only: ['task-2', 'task-3'] })
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.waves, [['task-2', 'task-3']])
  assert.deepEqual(buildGraph(parsed, { only: ['task-7'] }).errors, ['--only names task-7, which is not in the plan.'])
})

test('renderBrief carries the task text, its fields and the global constraints', () => {
  const parsed = parsePlan(plan([task(1)]))
  const brief = renderBrief(parsed.tasks[0], { planPath: '/p/plan.md', spec: parsed.spec, globalConstraints: parsed.globalConstraints })
  assert.match(brief, /^# Brief: Task 1: Task 1 title/)
  assert.match(brief, /- Owns: src\/t1\/\*\*/)
  assert.match(brief, /## Global Constraints\n\n- Node 22\./)
  assert.match(brief, /### Task 1: Task 1 title/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/plan.test.js`
Expected: FAIL, with `Cannot find module '../plugins/aether/lib/plan.js'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/aether/lib/plan.js`:

```js
'use strict'

// Parses a superpowers implementation plan that carries Aether fields, and
// turns it into a dependency graph of waves.

const { normalizePattern, patternsOverlap } = require('./globs.js')

const TIERS = ['haiku', 'sonnet', 'opus']
const DASH = String.raw`\s+(?:—|–|--|-)\s+`
const TASK_HEADING = /^###\s+Task\s+(\d+)\s*:\s*(.+?)\s*$/i
const LEVEL2 = /^##\s+\S/
const DEFAULT_LADDER = { haiku: 2, sonnet: 2, opus: 1 }
const DEFAULT_MAX_AGENTS = 200

function stripTicks(text) {
  return String(text).trim().replace(/^`(.*)`$/, '$1').trim()
}

// true for every line inside a fenced code block, fences included
function codeMask(lines) {
  const mask = []
  let fence = null
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      mask.push(true)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
    } else if (m) {
      fence = m[1]
      mask.push(true)
    } else {
      mask.push(false)
    }
  }
  return mask
}

function parseSpec(lines) {
  const line = lines.find((l) => /^\*\*Spec:\*\*/.test(l))
  if (!line) return null
  let value = line.replace(/^\*\*Spec:\*\*\s*/, '').trim()
  const link = value.match(/^\[([^\]]*)\]\(([^)]*)\)/)
  if (link) value = link[2] || link[1]
  return stripTicks(value) || null
}

function parseExecution(body, errors) {
  const execution = { testCommand: null, ladder: { ...DEFAULT_LADDER }, maxAgents: DEFAULT_MAX_AGENTS }
  if (body === null) {
    errors.push('The plan has no "## Aether Execution" section.')
    return execution
  }
  for (const line of body) {
    let m
    if ((m = line.match(/^\s*-\s*Test command:\s*(.+?)\s*$/i))) {
      execution.testCommand = stripTicks(m[1])
    } else if ((m = line.match(/^\s*-\s*Ladder:\s*(.+?)\s*$/i))) {
      const ladder = {}
      for (const part of m[1].split(',')) {
        const pm = part.trim().match(/^(haiku|sonnet|opus)\s+(\d+)$/i)
        if (pm) ladder[pm[1].toLowerCase()] = Number(pm[2])
        else errors.push(`Aether Execution: cannot read ladder entry "${part.trim()}"; use "haiku 2, sonnet 2, opus 1".`)
      }
      for (const tier of TIERS) {
        if (!(tier in ladder)) errors.push(`Aether Execution: the ladder has no "${tier}" entry.`)
      }
      execution.ladder = { ...DEFAULT_LADDER, ...ladder }
    } else if ((m = line.match(/^\s*-\s*Max agents:\s*(\d+)\s*$/i))) {
      execution.maxAgents = Number(m[1])
    }
  }
  if (!execution.testCommand) errors.push('Aether Execution: "Test command" is missing.')
  return execution
}

function parseAetherFields(task, body, errors) {
  const label = `Task ${task.number}`
  const start = body.findIndex((line) => line.trim() === '**Aether:**')
  if (start === -1) {
    errors.push(`${label}: missing the **Aether:** block.`)
    return
  }
  let sawField = false
  let sawDepends = false
  let tierError = false
  let areaError = false
  for (const line of body.slice(start + 1)) {
    if (line.trim() === '') {
      if (sawField) break
      continue
    }
    if (!/^\s*-\s/.test(line)) break
    sawField = true
    let m
    if (/^\s*-\s*Tier:/i.test(line)) {
      m = line.match(new RegExp(String.raw`^\s*-\s*Tier:\s*(\w+)` + DASH + String.raw`(.+?)\s*$`, 'i'))
      if (m && TIERS.includes(m[1].toLowerCase())) {
        task.tier = m[1].toLowerCase()
        task.tierReason = m[2]
      } else {
        tierError = true
        errors.push(`${label}: Tier must be haiku, sonnet or opus followed by " — reason".`)
      }
    } else if ((m = line.match(/^\s*-\s*Area:\s*(.*?)\s*$/i))) {
      if (/^[a-z0-9][a-z0-9-]*$/.test(m[1])) {
        task.area = m[1]
      } else {
        areaError = true
        errors.push(`${label}: Area must be lowercase letters, digits and dashes.`)
      }
    } else if ((m = line.match(/^\s*-\s*Owns:\s*(.*?)\s*$/i))) {
      task.owns = m[1].split(',').map(normalizePattern).filter(Boolean)
    } else if ((m = line.match(/^\s*-\s*Depends on:\s*(.*?)\s*$/i))) {
      sawDepends = true
      if (/^none$/i.test(m[1])) continue
      const dm = m[1].match(new RegExp(String.raw`^Task\s+(\d+)` + DASH + '(.+)$', 'i'))
      if (dm) task.dependsOn.push({ number: Number(dm[1]), reason: dm[2] })
      else errors.push(`${label}: "Depends on: ${m[1]}" needs the form "Task N — reason".`)
    }
  }
  if (!task.tier && !tierError) errors.push(`${label}: missing Tier.`)
  if (!task.area && !areaError) errors.push(`${label}: missing Area.`)
  if (task.owns.length === 0) errors.push(`${label}: missing Owns.`)
  if (!sawDepends) errors.push(`${label}: missing "Depends on" (use "Depends on: none" for an independent task).`)
}

function parsePlan(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n')
  const code = codeMask(lines)
  const isTaskHeading = (i) => !code[i] && TASK_HEADING.test(lines[i])
  const isLevel2 = (i) => !code[i] && LEVEL2.test(lines[i])
  const endOfBlock = (from) => {
    for (let i = from; i < lines.length; i++) if (isTaskHeading(i) || isLevel2(i)) return i
    return lines.length
  }
  const section = (regex) => {
    const start = lines.findIndex((line, i) => !code[i] && regex.test(line))
    return start === -1 ? null : lines.slice(start + 1, endOfBlock(start + 1))
  }
  const errors = []
  const constraints = section(/^##\s+Global Constraints\s*$/i)
  const globalConstraints = constraints ? constraints.join('\n').trim() || null : null
  const execution = parseExecution(section(/^##\s+Aether Execution\s*$/i), errors)
  const tasks = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!isTaskHeading(i)) continue
    const m = lines[i].match(TASK_HEADING)
    const number = Number(m[1])
    if (seen.has(number)) errors.push(`Task ${number} appears more than once.`)
    seen.add(number)
    const body = lines.slice(i + 1, endOfBlock(i + 1))
    const task = {
      number,
      title: m[2],
      text: [lines[i], ...body].join('\n').trim(),
      tier: null,
      tierReason: null,
      area: null,
      owns: [],
      dependsOn: [],
    }
    parseAetherFields(task, body, errors)
    tasks.push(task)
  }
  if (tasks.length === 0) errors.push('The plan has no "### Task N: ..." headings.')
  return { tasks, execution, globalConstraints, spec: parseSpec(lines), errors }
}

function buildGraph(parsed, { only = null } = {}) {
  const errors = []
  const warnings = []
  const known = new Set(parsed.tasks.map((t) => t.number))
  let selected = parsed.tasks
  if (only) {
    const wanted = new Set(only)
    for (const id of wanted) {
      if (!known.has(Number(String(id).replace(/^task-/, '')))) errors.push(`--only names ${id}, which is not in the plan.`)
    }
    selected = parsed.tasks.filter((t) => wanted.has(`task-${t.number}`))
  }
  const ids = new Set(selected.map((t) => `task-${t.number}`))
  const nodes = {}
  for (const t of selected) {
    const deps = []
    for (const d of t.dependsOn) {
      if (!known.has(d.number)) errors.push(`Task ${t.number} depends on Task ${d.number}, which is not in the plan.`)
      else if (ids.has(`task-${d.number}`)) deps.push(`task-${d.number}`)
    }
    nodes[`task-${t.number}`] = {
      number: t.number,
      title: t.title,
      tier: t.tier,
      tierReason: t.tierReason,
      area: t.area,
      owns: t.owns,
      dependsOn: deps,
    }
  }

  // Layer the dependency graph into waves (Kahn's algorithm).
  const waves = []
  const placed = new Set()
  let remaining = Object.keys(nodes).sort((a, b) => nodes[a].number - nodes[b].number)
  while (remaining.length) {
    const wave = remaining.filter((id) => nodes[id].dependsOn.every((d) => placed.has(d)))
    if (wave.length === 0) {
      errors.push(`Dependency cycle among: ${remaining.map((id) => `Task ${nodes[id].number}`).join(', ')}.`)
      break
    }
    wave.forEach((id) => placed.add(id))
    waves.push(wave)
    remaining = remaining.filter((id) => !placed.has(id))
  }

  for (const wave of waves) {
    for (let i = 0; i < wave.length; i++) {
      for (let j = i + 1; j < wave.length; j++) {
        const a = nodes[wave[i]]
        const b = nodes[wave[j]]
        for (const pa of a.owns) {
          for (const pb of b.owns) {
            if (patternsOverlap(pa, pb)) {
              errors.push(`Task ${a.number} and Task ${b.number} run in the same wave but both own "${pa}" and "${pb}".`)
            }
          }
        }
      }
    }
  }

  const count = Object.keys(nodes).length
  if (count >= 3 && waves.length === count) {
    errors.push('The plan is a chain: every wave holds one task. Decompose it again so independent tasks can run in parallel (decision D6).')
  } else if (count >= 2 && count / waves.length < 1.5) {
    warnings.push(`Low parallelism: ${count} tasks in ${waves.length} waves (average ${(count / waves.length).toFixed(2)} per wave).`)
  }
  return { waves, tasks: nodes, errors, warnings }
}

function renderBrief(task, { planPath, spec, globalConstraints }) {
  const parts = [
    `# Brief: Task ${task.number}: ${task.title}`,
    '',
    `- Plan: ${planPath}`,
    `- Spec: ${spec || 'not named in the plan'}`,
    `- Tier: ${task.tier} — ${task.tierReason}`,
    `- Area: ${task.area}`,
    `- Owns: ${task.owns.join(', ')}`,
    '',
    'Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.',
    '',
  ]
  if (globalConstraints) parts.push('## Global Constraints', '', globalConstraints, '')
  parts.push('## Task', '', task.text, '')
  return parts.join('\n')
}

module.exports = { TIERS, parsePlan, buildGraph, renderBrief }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/plan.test.js`
Expected: PASS, with `# pass 13` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/plan.js tests/plan-fixtures.js tests/plan.test.js
git commit -m "feat(aether): parse Aether plan fields into waves" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Run layout and the `aether-plan` CLI

**Files:**
- Create: `plugins/aether/lib/git.js`
- Create: `plugins/aether/lib/run.js`
- Create: `plugins/aether/bin/aether-plan`
- Create: `tests/helpers.js`
- Test: `tests/run.test.js`, `tests/aether-plan.test.js`

**Interfaces:**
- Consumes: `parsePlan`, `buildGraph` and `renderBrief` from `lib/plan.js` (Task 2).
- Produces:
  - `lib/git.js`:
    - `git(args: string[], cwd: string, { allowFail?: boolean })` returns `{ status, stdout, stderr }`, with trimmed output. It throws on a non-zero exit unless `allowFail` is set.
    - `repoPaths(cwd)` returns `{ worktree, gitCommonDir, mainRoot }`.
    - `currentBranch(cwd): string`, which is empty on a detached HEAD.
    - `head(cwd): string`.
  - `lib/run.js`:
    - ids: `isRunId`, `assertRunId`, `assertTaskId`, `newRunId(now?: Date)`;
    - paths: `aetherDir(mainRoot)`, `runDir(mainRoot, runId)`, `worktreesDir(mainRoot, runId)`, `unitWorktree(mainRoot, runId, taskId)`, `unitBranch(runId, taskId)`, `dataDir()`;
    - files: `writeJson(file, value)`, `readJson(file)`, `appendRecord(record)`, `ensureExcluded(gitCommonDir)`.
  - `bin/aether-plan`:
    - `check <plan.md>` prints `{ok, tasks, waves, warnings}`;
    - `compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main]` writes `runDir/graph.json`, `runDir/state.json` and `runDir/briefs/<task>.md`. It prints the run arguments: `{runId, repoRoot, runDir, plan, spec, integration: {branch, worktree}, testCommand, ladder, maxAgents, waves, tasks: {<id>: {number, title, tier, tierReason, area, owns, dependsOn, brief}}}`.
  - `tests/helpers.js`:
    - constants: `PLUGIN`, `PLAN_BIN`, `WT_BIN`, `SESSION_BIN`;
    - fixtures: `tempDir(t, prefix)`, `makeRepo(t, { prefix })`, which returns `{dir, git}` with branch `feature/x` checked out, `writePlan(dir, markdown)`, `commitIn(repo, dir, file, content, message)`;
    - runners: `runBin(bin, args, cwd, env)`, `compile(repo, markdown, extra)`;
    - data and aging: `useDataDir(t)`, `age(dir, hours)`.

- [ ] **Step 1: Write the helpers and the failing tests**

Create `tests/helpers.js`:

```js
'use strict'

// Shared test fixtures: throwaway git repositories and CLI runners.
// Every temporary directory is removed when its test ends.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const PLAN_BIN = path.join(PLUGIN, 'bin', 'aether-plan')
const WT_BIN = path.join(PLUGIN, 'bin', 'aether-wt')
const SESSION_BIN = path.join(PLUGIN, 'bin', 'aether-session-start')

function tempDir(t, prefix = 'aether-test-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function run(command, args, cwd, env = {}) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  if (r.error) throw r.error
  return r
}

function makeRepo(t, { prefix = 'aether-test-' } = {}) {
  const dir = tempDir(t, prefix)
  const git = (...args) => {
    const r = run('git', args, dir)
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`)
    return r.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Aether Test')
  git('config', 'user.email', 'aether-test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n')
  git('add', 'README.md')
  git('commit', '-q', '-m', 'base')
  git('switch', '-q', '-c', 'feature/x')
  return { dir, git }
}

function writePlan(dir, markdown) {
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, markdown)
  return file
}

function runBin(bin, args, cwd, env = {}) {
  const r = run(process.execPath, [bin, ...args], cwd, env)
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

function compile(repo, markdown, extra = []) {
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, markdown), ...extra], repo.dir)
  if (r.status !== 0) throw new Error(`compile failed: ${r.stdout}${r.stderr}`)
  return r.json
}

function commitIn(repo, dir, file, content, message) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
  repo.git('-C', dir, 'add', file)
  repo.git('-C', dir, 'commit', '-q', '-m', message)
}

function useDataDir(t) {
  const dir = tempDir(t, 'aether-data-')
  const previous = process.env.AETHER_DATA_DIR
  process.env.AETHER_DATA_DIR = dir
  t.after(() => {
    if (previous === undefined) delete process.env.AETHER_DATA_DIR
    else process.env.AETHER_DATA_DIR = previous
  })
  return dir
}

function age(dir, hours) {
  const when = new Date(Date.now() - hours * 3600 * 1000)
  for (const entry of fs.readdirSync(dir, { recursive: true })) fs.utimesSync(path.join(dir, entry), when, when)
  fs.utimesSync(dir, when, when)
}

module.exports = {
  PLUGIN,
  PLAN_BIN,
  WT_BIN,
  SESSION_BIN,
  tempDir,
  makeRepo,
  writePlan,
  runBin,
  compile,
  commitIn,
  useDataDir,
  age,
}
```

Create `tests/run.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { newRunId, isRunId, assertRunId, assertTaskId, ensureExcluded } = require('../plugins/aether/lib/run.js')
const { tempDir } = require('./helpers.js')

test('newRunId has a date, a time and four hex characters', () => {
  const id = newRunId(new Date(2026, 9, 7, 21, 5, 9))
  assert.match(id, /^20261007-210509-[0-9a-f]{4}$/)
  assert.equal(isRunId(id), true)
})

test('ids that could escape .aether are refused', () => {
  assert.throws(() => assertRunId('../x'), /invalid run id/)
  assert.throws(() => assertTaskId('task-1/../../x'), /invalid task id/)
  assert.doesNotThrow(() => assertTaskId('task-12'))
})

test('ensureExcluded adds the patterns once', (t) => {
  const dir = tempDir(t)
  ensureExcluded(dir)
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), '.aether/\n.aether-tmp/\n')
})

test('ensureExcluded keeps the existing content', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'info'))
  fs.writeFileSync(path.join(dir, 'info', 'exclude'), 'node_modules')
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), 'node_modules\n.aether/\n.aether-tmp/\n')
})
```

Create `tests/aether-plan.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

test('check prints the waves of a valid plan', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json, { ok: true, tasks: 3, waves: [['task-1', 'task-3'], ['task-2']], warnings: [] })
})

test('check exits 1 and lists every error', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1)], { execution: [] }))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.deepEqual(r.json.errors, ['Aether Execution: "Test command" is missing.'])
})

test('compile writes the graph, briefs and state for the integration branch', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const args = r.json
  assert.match(args.runId, /^\d{8}-\d{6}-[0-9a-f]{4}$/)
  assert.equal(args.repoRoot, repo.dir)
  assert.equal(args.runDir, path.join(repo.dir, '.aether', 'runs', args.runId))
  assert.deepEqual(args.integration, { branch: 'feature/x', worktree: repo.dir })
  assert.deepEqual(args.waves, [['task-1', 'task-3'], ['task-2']])
  assert.equal(args.testCommand, 'true')
  assert.deepEqual(args.ladder, { haiku: 2, sonnet: 2, opus: 1 })
  assert.equal(args.maxAgents, 200)
  assert.equal(args.tasks['task-2'].brief, path.join(args.runDir, 'briefs', 'task-2.md'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(args.runDir, 'graph.json'), 'utf8')), args)
  assert.equal(JSON.parse(fs.readFileSync(path.join(args.runDir, 'state.json'), 'utf8')).status, 'compiled')
  assert.match(fs.readFileSync(args.tasks['task-2'].brief, 'utf8'), /### Task 2: Task 2 title/)
  assert.equal(repo.git('status', '--porcelain'), '?? plan.md')
})

test('compile refuses main unless --allow-main, and refuses a detached HEAD', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  repo.git('switch', '-q', 'main')
  let r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /refusing to compile on main/)
  r = runBin(PLAN_BIN, ['compile', file, '--allow-main'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  repo.git('switch', '-q', '--detach', 'HEAD')
  r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /detached HEAD/)
})

test('compile --run reuses a run id and --only narrows the tasks', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir).json
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.runId, '--only', 'task-2'], repo.dir)
  assert.equal(again.status, 0, again.stdout)
  assert.equal(again.json.runId, first.runId)
  assert.deepEqual(again.json.waves, [['task-2']])
  assert.deepEqual(Object.keys(again.json.tasks), ['task-2'])
})

test('compile refuses an invalid run id', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const r = runBin(PLAN_BIN, ['compile', file, '--run', '../evil'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /invalid run id/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/run.test.js tests/aether-plan.test.js`
Expected: FAIL. `run.test.js` fails with `Cannot find module '../plugins/aether/lib/run.js'`. `aether-plan.test.js` fails because `plugins/aether/bin/aether-plan` does not exist; `runBin` returns a null `json`.

- [ ] **Step 3: Write `lib/git.js`**

Create `plugins/aether/lib/git.js`:

```js
'use strict'

// Thin wrapper around the git CLI.

const path = require('node:path')
const { spawnSync } = require('node:child_process')

function git(args, cwd, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  const result = { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() }
  if (r.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  }
  return result
}

// worktree: top of the current worktree; mainRoot: the main checkout, which holds .aether/
function repoPaths(cwd) {
  const worktree = git(['rev-parse', '--show-toplevel'], cwd).stdout
  const gitCommonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).stdout
  return { worktree, gitCommonDir, mainRoot: path.dirname(gitCommonDir) }
}

function currentBranch(cwd) {
  return git(['branch', '--show-current'], cwd).stdout
}

function head(cwd) {
  return git(['rev-parse', 'HEAD'], cwd).stdout
}

module.exports = { git, repoPaths, currentBranch, head }
```

- [ ] **Step 4: Write `lib/run.js`**

Create `plugins/aether/lib/run.js`:

```js
'use strict'

// Ids, locations and records for Aether runs.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const TASK_ID = /^task-\d+$/
const EXCLUDES = ['.aether/', '.aether-tmp/']

function isRunId(id) {
  return RUN_ID.test(String(id))
}

function assertRunId(id) {
  if (!isRunId(id)) throw new Error(`invalid run id: ${id}`)
}

function assertTaskId(id) {
  if (!TASK_ID.test(String(id))) throw new Error(`invalid task id: ${id}`)
}

function newRunId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${date}-${time}-${crypto.randomBytes(2).toString('hex')}`
}

function aetherDir(mainRoot) {
  return path.join(mainRoot, '.aether')
}

function runDir(mainRoot, runId) {
  return path.join(aetherDir(mainRoot), 'runs', runId)
}

function worktreesDir(mainRoot, runId) {
  return path.join(aetherDir(mainRoot), 'worktrees', runId)
}

function unitWorktree(mainRoot, runId, taskId) {
  return path.join(worktreesDir(mainRoot, runId), taskId)
}

function unitBranch(runId, taskId) {
  return `aether/${runId}/${taskId}`
}

function dataDir() {
  return process.env.AETHER_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'aether-plugin')
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function appendRecord(record) {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(path.join(dataDir(), 'runs.jsonl'), JSON.stringify(record) + '\n')
}

// Keeps Aether's directories out of git without touching the project's .gitignore.
function ensureExcluded(gitCommonDir) {
  const file = path.join(gitCommonDir, 'info', 'exclude')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const present = new Set(current.split('\n').map((line) => line.trim()))
  const missing = EXCLUDES.filter((pattern) => !present.has(pattern))
  if (missing.length === 0) return
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  fs.appendFileSync(file, separator + missing.join('\n') + '\n')
}

module.exports = {
  isRunId,
  assertRunId,
  assertTaskId,
  newRunId,
  aetherDir,
  runDir,
  worktreesDir,
  unitWorktree,
  unitBranch,
  dataDir,
  writeJson,
  readJson,
  appendRecord,
  ensureExcluded,
}
```

- [ ] **Step 5: Write the `aether-plan` CLI**

Create `plugins/aether/bin/aether-plan`:

```js
#!/usr/bin/env node
'use strict'

// aether-plan check <plan.md>
// aether-plan compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main]

const fs = require('node:fs')
const path = require('node:path')
const lib = path.join(__dirname, '..', 'lib')
const { parsePlan, buildGraph, renderBrief } = require(path.join(lib, 'plan.js'))
const { repoPaths, currentBranch } = require(path.join(lib, 'git.js'))
const run = require(path.join(lib, 'run.js'))

const USAGE = 'usage: aether-plan check <plan.md> | aether-plan compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main]'

function fail(errors, warnings = []) {
  process.stdout.write(JSON.stringify({ ok: false, errors, warnings }) + '\n')
  process.exit(1)
}

function option(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}

function load(planArg) {
  if (!planArg) fail([USAGE])
  const planPath = path.resolve(planArg)
  if (!fs.existsSync(planPath)) fail([`plan not found: ${planPath}`])
  return { planPath, parsed: parsePlan(fs.readFileSync(planPath, 'utf8')) }
}

function check(planArg) {
  const { parsed } = load(planArg)
  const graph = buildGraph(parsed)
  const errors = [...parsed.errors, ...graph.errors]
  if (errors.length) fail(errors, graph.warnings)
  process.stdout.write(JSON.stringify({ ok: true, tasks: Object.keys(graph.tasks).length, waves: graph.waves, warnings: graph.warnings }) + '\n')
}

function compile(planArg, rest) {
  const { planPath, parsed } = load(planArg)
  const onlyArg = option(rest, '--only')
  const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null
  const graph = buildGraph(parsed, { only })
  const errors = [...parsed.errors, ...graph.errors]
  if (errors.length) fail(errors, graph.warnings)

  const repo = repoPaths(process.cwd())
  const branch = currentBranch(process.cwd())
  if (!branch) fail(['the integration worktree has a detached HEAD; check out the integration branch first'])
  if (['main', 'master'].includes(branch) && !rest.includes('--allow-main')) {
    fail([`refusing to compile on ${branch}: run aether-plan from the integration worktree, or pass --allow-main`])
  }

  const runId = option(rest, '--run') || run.newRunId()
  run.assertRunId(runId)
  const dir = run.runDir(repo.mainRoot, runId)
  run.ensureExcluded(repo.gitCommonDir)

  const tasks = {}
  for (const t of parsed.tasks) {
    const id = `task-${t.number}`
    if (!graph.tasks[id]) continue
    const brief = path.join(dir, 'briefs', `${id}.md`)
    fs.mkdirSync(path.dirname(brief), { recursive: true })
    fs.writeFileSync(brief, renderBrief(t, { planPath, spec: parsed.spec, globalConstraints: parsed.globalConstraints }))
    tasks[id] = { ...graph.tasks[id], brief }
  }

  const args = {
    runId,
    repoRoot: repo.mainRoot,
    runDir: dir,
    plan: planPath,
    spec: parsed.spec,
    integration: { branch, worktree: repo.worktree },
    testCommand: parsed.execution.testCommand,
    ladder: parsed.execution.ladder,
    maxAgents: parsed.execution.maxAgents,
    waves: graph.waves,
    tasks,
  }
  run.writeJson(path.join(dir, 'graph.json'), args)
  run.writeJson(path.join(dir, 'state.json'), { runId, status: 'compiled', plan: planPath, compiledAt: new Date().toISOString() })
  for (const warning of graph.warnings) process.stderr.write(`warning: ${warning}\n`)
  process.stdout.write(JSON.stringify(args) + '\n')
}

const [command, planArg, ...rest] = process.argv.slice(2)
try {
  if (command === 'check') check(planArg)
  else if (command === 'compile') compile(planArg, rest)
  else fail([USAGE])
} catch (err) {
  fail([err.message])
}
```

Make it executable:

```bash
chmod +x plugins/aether/bin/aether-plan
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/run.test.js tests/aether-plan.test.js`
Expected: PASS, with `# pass 10` and `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add plugins/aether/lib/git.js plugins/aether/lib/run.js plugins/aether/bin/aether-plan tests/helpers.js tests/run.test.js tests/aether-plan.test.js
git commit -m "feat(aether): check and compile plans into runs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Unit worktrees: ensure and diff package

**Files:**
- Create: `plugins/aether/lib/worktrees.js`
- Test: `tests/worktrees-ensure.test.js`

**Interfaces:**
- Consumes:
  - `git`, `repoPaths` and `head` from `lib/git.js` (Task 3);
  - the run helpers in `lib/run.js` (Task 3);
  - `compile` and `makeRepo` from `tests/helpers.js` (Task 3).
- Produces:
  - `ensure(cwd, runId, taskId)` returns `{ path, branch, created }`.
  - `diffPackage(cwd, runId, taskId)` returns `{ path, base }`.
  - Internal helpers that Tasks 5 and 6 reuse: `loadGraph(mainRoot, runId)`, `assertInside(target, root)`, `branchExists(mainRoot, branch)`, `unitBase(mainRoot, graph, branch)`.

- [ ] **Step 1: Write the failing test**

Create `tests/worktrees-ensure.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, diffPackage } = require('../plugins/aether/lib/worktrees.js')

test('ensure creates the unit worktree and branch from the integration branch', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const r = ensure(repo.dir, args.runId, 'task-1')
  assert.equal(r.created, true)
  assert.equal(r.branch, `aether/${args.runId}/task-1`)
  assert.equal(r.path, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1'))
  assert.equal(repo.git('-C', r.path, 'branch', '--show-current'), r.branch)
  assert.equal(repo.git('rev-parse', r.branch), repo.git('rev-parse', 'feature/x'))
  assert.ok(fs.existsSync(path.join(r.path, '.aether-tmp')))
  assert.match(fs.readFileSync(path.join(repo.dir, '.git', 'info', 'exclude'), 'utf8'), /^\.aether-tmp\/$/m)
  assert.equal(repo.git('-C', r.path, 'status', '--porcelain'), '')
  assert.deepEqual(ensure(repo.dir, args.runId, 'task-1'), { ...r, created: false })
})

test('ensure recreates a worktree whose directory was deleted by hand', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const first = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, first.path, 'src/t1/kept.txt', 'x\n', 'unit work')
  fs.rmSync(first.path, { recursive: true, force: true })
  const again = ensure(repo.dir, args.runId, 'task-1')
  assert.equal(again.created, true)
  assert.equal(fs.readFileSync(path.join(again.path, 'src', 't1', 'kept.txt'), 'utf8'), 'x\n')
})

test('ensure replaces a leftover directory that is not a worktree', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const leftover = path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-2')
  fs.mkdirSync(leftover, { recursive: true })
  fs.writeFileSync(path.join(leftover, 'junk.txt'), 'x')
  const r = ensure(repo.dir, args.runId, 'task-2')
  assert.equal(r.created, true)
  assert.equal(fs.existsSync(path.join(leftover, 'junk.txt')), false)
  assert.equal(repo.git('-C', leftover, 'branch', '--show-current'), r.branch)
})

test('ensure refuses tasks outside the run and invalid ids', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  assert.throws(() => ensure(repo.dir, args.runId, 'task-9'), /task-9 is not in run/)
  assert.throws(() => ensure(repo.dir, args.runId, '../x'), /invalid task id/)
  assert.throws(() => ensure(repo.dir, '20990101-000000-ffff', 'task-1'), /has no graph.json/)
})

test('diffPackage writes the unit diff against its base', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'module.exports = 1\n', 'add a')
  const pkg = diffPackage(repo.dir, args.runId, 'task-1')
  assert.equal(pkg.path, path.join(args.runDir, 'packages', 'task-1.diff'))
  assert.equal(pkg.base, repo.git('rev-parse', 'feature/x'))
  const text = fs.readFileSync(pkg.path, 'utf8')
  assert.match(text, /## Commits\n[0-9a-f]+ add a/)
  assert.match(text, /\+module\.exports = 1/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/worktrees-ensure.test.js`
Expected: FAIL, with `Cannot find module '../plugins/aether/lib/worktrees.js'`.

- [ ] **Step 3: Write the implementation**

Create `plugins/aether/lib/worktrees.js`:

```js
'use strict'

// Unit worktrees: create, package for review, merge, remove and sweep.
// Only paths under <repo>/.aether/ and branches under aether/ are touched.

const fs = require('node:fs')
const path = require('node:path')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')

function loadGraph(mainRoot, runId) {
  run.assertRunId(runId)
  const file = path.join(run.runDir(mainRoot, runId), 'graph.json')
  if (!fs.existsSync(file)) throw new Error(`run ${runId} has no graph.json; compile the plan first`)
  return run.readJson(file)
}

function assertInside(target, root) {
  const rel = path.relative(root, target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to touch ${target}: it is outside ${root}`)
  }
}

function branchExists(mainRoot, branch) {
  return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], mainRoot, { allowFail: true }).status === 0
}

function unitBase(mainRoot, graph, branch) {
  return git(['merge-base', graph.integration.branch, branch], mainRoot).stdout
}

function ensure(cwd, runId, taskId) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot, gitCommonDir } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  run.ensureExcluded(gitCommonDir)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  if (fs.existsSync(worktree)) {
    const top = git(['rev-parse', '--show-toplevel'], worktree, { allowFail: true })
    if (top.status === 0 && top.stdout === worktree) return { path: worktree, branch, created: false }
    // A leftover directory that is not this unit's worktree.
    assertInside(worktree, run.aetherDir(mainRoot))
    fs.rmSync(worktree, { recursive: true, force: true })
  }
  git(['worktree', 'prune'], mainRoot)
  fs.mkdirSync(path.dirname(worktree), { recursive: true })
  if (branchExists(mainRoot, branch)) git(['worktree', 'add', worktree, branch], mainRoot)
  else git(['worktree', 'add', '-b', branch, worktree, graph.integration.branch], mainRoot)
  fs.mkdirSync(path.join(worktree, '.aether-tmp'), { recursive: true })
  return { path: worktree, branch, created: true }
}

function diffPackage(cwd, runId, taskId) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const branch = run.unitBranch(runId, taskId)
  const base = unitBase(mainRoot, graph, branch)
  const range = `${base}..${branch}`
  const text = [
    `# Review package: ${taskId} (${branch})`,
    `Base: ${base}`,
    `Head: ${git(['rev-parse', branch], mainRoot).stdout}`,
    '',
    '## Commits',
    git(['log', '--oneline', range], mainRoot).stdout,
    '',
    '## Stat',
    git(['diff', '--stat', range], mainRoot).stdout,
    '',
    '## Diff',
    git(['diff', '-U10', range], mainRoot).stdout,
    '',
  ].join('\n')
  const file = path.join(run.runDir(mainRoot, runId), 'packages', `${taskId}.diff`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return { path: file, base }
}

module.exports = { ensure, diffPackage }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/worktrees-ensure.test.js`
Expected: PASS, with `# pass 5` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/worktrees.js tests/worktrees-ensure.test.js
git commit -m "feat(aether): create unit worktrees and review packages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Serialized merge with ownership and test checks

**Files:**
- Modify: `plugins/aether/lib/worktrees.js`
- Test: `tests/worktrees-merge.test.js`

**Interfaces:**
- Consumes:
  - `loadGraph`, `unitBase` and `branchExists` in `lib/worktrees.js` (Task 4);
  - `matchesAny` from `lib/globs.js` (Task 1);
  - `head` from `lib/git.js` (Task 3).
- Produces: `merge(cwd, runId, taskId, { timeoutMs?: number })`, which returns one of:
  - `{ merged: true, commit }`
  - `{ merged: false, reason: 'dirty-integration', detail }`
  - `{ merged: false, reason: 'empty', detail }`
  - `{ merged: false, reason: 'ownership', files }`
  - `{ merged: false, reason: 'conflict', files, detail }`
  - `{ merged: false, reason: 'tests', exitCode, timedOut, reverted, output }`

- [ ] **Step 1: Write the failing test**

Create `tests/worktrees-merge.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, merge } = require('../plugins/aether/lib/worktrees.js')

function setup(t, options) {
  const repo = makeRepo(t, options)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  return { repo, args, unit }
}

test('merge brings an owned, tested unit into the integration branch', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(r, { merged: true, commit: repo.git('rev-parse', 'HEAD') })
  assert.equal(repo.git('log', '-1', '--format=%s'), `Merge ${unit.branch}`)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
})

test("merge refuses files outside the unit's Owns", (t) => {
  const { repo, args, unit } = setup(t)
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'README.md', 'changed\n', 'touch readme')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: false, reason: 'ownership', files: ['README.md'] })
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
})

test('merge refuses a unit that committed nothing', (t) => {
  const { repo, args, unit } = setup(t)
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), {
    merged: false,
    reason: 'empty',
    detail: `${unit.branch} has no changes to merge`,
  })
})

test('merge aborts on a conflict and leaves the integration branch clean', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, repo.dir, 'src/t1/a.js', 'integration\n', 'integration side')
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'unit\n', 'unit side')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'conflict')
  assert.deepEqual(r.files, ['src/t1/a.js'])
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(repo.git('status', '--porcelain', '--untracked-files=no'), '')
})

test('merge undoes itself when the tests fail', (t) => {
  const { repo, args, unit } = setup(t)
  const graphFile = path.join(args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  graph.testCommand = 'echo boom; exit 3'
  fs.writeFileSync(graphFile, JSON.stringify(graph))
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'tests')
  assert.equal(r.exitCode, 3)
  assert.equal(r.reverted, true)
  assert.equal(r.timedOut, false)
  assert.match(r.output, /boom/)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't1', 'a.js')), false)
})

test('merge refuses a dirty integration worktree', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  fs.writeFileSync(path.join(repo.dir, 'README.md'), 'uncommitted\n')
  assert.equal(merge(repo.dir, args.runId, 'task-1').reason, 'dirty-integration')
})

test('merge works when the repository path contains spaces', (t) => {
  const { repo, args, unit } = setup(t, { prefix: 'aether test repo ' })
  assert.match(repo.dir, / /)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/worktrees-merge.test.js`
Expected: FAIL, with `TypeError: merge is not a function`.

- [ ] **Step 3: Write the implementation**

In `plugins/aether/lib/worktrees.js`, replace the two `require` lines

```js
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
```

with:

```js
const { spawnSync } = require('node:child_process')
const { git, repoPaths, head } = require('./git.js')
const { matchesAny } = require('./globs.js')
const run = require('./run.js')
```

Insert these functions just above the `module.exports` line:

```js
function changedFiles(mainRoot, base, branch) {
  const out = git(['diff', '--name-only', `${base}..${branch}`], mainRoot).stdout
  return out === '' ? [] : out.split('\n')
}

// Merges one unit into the integration branch. Callers serialize merges.
function merge(cwd, runId, taskId, { timeoutMs = 15 * 60 * 1000 } = {}) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const task = graph.tasks[taskId]
  if (!task) throw new Error(`${taskId} is not in run ${runId}`)
  const integration = graph.integration.worktree
  const branch = run.unitBranch(runId, taskId)
  if (git(['status', '--porcelain', '--untracked-files=no'], integration).stdout !== '') {
    return { merged: false, reason: 'dirty-integration', detail: 'the integration worktree has uncommitted changes' }
  }
  const base = unitBase(mainRoot, graph, branch)
  const files = changedFiles(mainRoot, base, branch)
  if (files.length === 0) return { merged: false, reason: 'empty', detail: `${branch} has no changes to merge` }
  const outside = files.filter((f) => !matchesAny(f, task.owns))
  if (outside.length) return { merged: false, reason: 'ownership', files: outside }

  const before = head(integration)
  const attempt = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch}`, branch], integration, { allowFail: true })
  if (attempt.status !== 0) {
    const unmerged = git(['diff', '--name-only', '--diff-filter=U'], integration, { allowFail: true }).stdout
    git(['merge', '--abort'], integration, { allowFail: true })
    return { merged: false, reason: 'conflict', files: unmerged ? unmerged.split('\n') : [], detail: attempt.stderr || attempt.stdout }
  }

  const tests = spawnSync(graph.testCommand, {
    cwd: integration,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (tests.status !== 0) {
    // Undo only the merge commit this call created.
    const reverted = git(['rev-parse', 'HEAD^1'], integration).stdout === before
    if (reverted) git(['reset', '--hard', before], integration)
    return {
      merged: false,
      reason: 'tests',
      exitCode: tests.status,
      timedOut: Boolean(tests.error && tests.error.code === 'ETIMEDOUT'),
      reverted,
      output: `${tests.stdout || ''}${tests.stderr || ''}`.slice(-4000),
    }
  }
  return { merged: true, commit: head(integration) }
}
```

Replace the `module.exports` line with:

```js
module.exports = { ensure, diffPackage, merge }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/worktrees-merge.test.js tests/worktrees-ensure.test.js`
Expected: PASS, with `# pass 12` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/worktrees.js tests/worktrees-merge.test.js
git commit -m "feat(aether): merge units with ownership and test checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cleanup: remove, sweep a run, sweep stale runs

**Files:**
- Modify: `plugins/aether/lib/worktrees.js`
- Test: `tests/worktrees-cleanup.test.js`

**Interfaces:**
- Consumes:
  - `loadGraph`, `assertInside`, `branchExists` and `unitBase` in `lib/worktrees.js` (Task 4);
  - `run.appendRecord`, `run.isRunId` and `run.aetherDir` (Task 3);
  - `useDataDir` and `age` from `tests/helpers.js` (Task 3).
- Produces:
  - `removeUnit(cwd, runId, taskId, { keepPatch?: boolean })` returns `{ removed: true, patch: string | null }`.
  - `sweepRun(cwd, runId)` returns `{ removedWorktrees: string[], removedBranches: string[], remaining: { worktrees: string[], branches: string[] } }`.
  - `sweepStale(cwd, { hours?: number, now?: number })` returns `{ swept: string[] }`. It appends a `status: "abandoned"` record for each swept run.

- [ ] **Step 1: Write the failing test**

Create `tests/worktrees-cleanup.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn, useDataDir, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, removeUnit, sweepRun, sweepStale } = require('../plugins/aether/lib/worktrees.js')

test('removeUnit deletes the worktree and branch, and can keep a patch', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = removeUnit(repo.dir, args.runId, 'task-1', { keepPatch: true })
  assert.deepEqual(r, { removed: true, patch: path.join(args.runDir, 'patches', 'task-1.patch') })
  assert.match(fs.readFileSync(r.patch, 'utf8'), /\+one/)
  assert.equal(fs.existsSync(unit.path), false)
  assert.equal(repo.git('branch', '--list', unit.branch), '')
  assert.doesNotMatch(repo.git('worktree', 'list', '--porcelain'), /task-1/)
})

test('removeUnit refuses ids that could escape .aether', (t) => {
  const repo = makeRepo(t)
  assert.throws(() => removeUnit(repo.dir, '../../x', 'task-1'), /invalid run id/)
  assert.throws(() => removeUnit(repo.dir, '20261007-000000-abcd', '../task-1'), /invalid task id/)
})

test('sweepRun removes every worktree and branch of a run, and nothing else', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  ensure(repo.dir, args.runId, 'task-1')
  ensure(repo.dir, args.runId, 'task-2')
  const r = sweepRun(repo.dir, args.runId)
  assert.equal(r.removedWorktrees.length, 2)
  assert.deepEqual(r.removedBranches.sort(), [`aether/${args.runId}/task-1`, `aether/${args.runId}/task-2`])
  assert.deepEqual(r.remaining, { worktrees: [], branches: [] })
  assert.equal(repo.git('branch', '--show-current'), 'feature/x')
  assert.ok(fs.existsSync(args.runDir))
})

test('sweepStale removes runs untouched for longer than the limit and records them', (t) => {
  const data = useDataDir(t)
  const repo = makeRepo(t)
  const old = compile(repo, plan([task(1), task(2)]))
  ensure(repo.dir, old.runId, 'task-1')
  const fresh = compile(repo, plan([task(1), task(2)]))
  age(old.runDir, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [old.runId] })
  assert.equal(fs.existsSync(old.runDir), false)
  assert.equal(repo.git('branch', '--list', `aether/${old.runId}/*`), '')
  assert.ok(fs.existsSync(fresh.runDir))
  const records = fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(records.length, 1)
  assert.equal(records[0].runId, old.runId)
  assert.equal(records[0].status, 'abandoned')
})

test('sweepStale cleans leftovers whose run directory is already gone', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  fs.rmSync(args.runDir, { recursive: true, force: true })
  fs.rmSync(unit.path, { recursive: true, force: true })
  assert.deepEqual(sweepStale(repo.dir), { swept: [args.runId] })
  assert.equal(repo.git('branch', '--list', unit.branch), '')
  assert.doesNotMatch(repo.git('worktree', 'list', '--porcelain'), /task-1/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/worktrees-cleanup.test.js`
Expected: FAIL, with `TypeError: removeUnit is not a function`.

- [ ] **Step 3: Write the implementation**

In `plugins/aether/lib/worktrees.js`, insert these functions just above the `module.exports` line:

```js
function removeWorktreeDir(mainRoot, worktree) {
  assertInside(worktree, run.aetherDir(mainRoot))
  if (!fs.existsSync(worktree)) return false
  const r = git(['worktree', 'remove', '--force', worktree], mainRoot, { allowFail: true })
  if (r.status !== 0) fs.rmSync(worktree, { recursive: true, force: true })
  return true
}

function listAetherBranches(mainRoot, runId = null) {
  const ref = runId ? `refs/heads/aether/${runId}` : 'refs/heads/aether'
  const out = git(['for-each-ref', '--format=%(refname:short)', ref], mainRoot).stdout
  return out === '' ? [] : out.split('\n').filter((b) => b.startsWith('aether/'))
}

function removeUnit(cwd, runId, taskId, { keepPatch = false } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  const hasBranch = branchExists(mainRoot, branch)
  let patch = null
  if (keepPatch && hasBranch) {
    const base = unitBase(mainRoot, loadGraph(mainRoot, runId), branch)
    patch = path.join(run.runDir(mainRoot, runId), 'patches', `${taskId}.patch`)
    fs.mkdirSync(path.dirname(patch), { recursive: true })
    fs.writeFileSync(patch, git(['diff', '--binary', `${base}..${branch}`], mainRoot).stdout + '\n')
  }
  removeWorktreeDir(mainRoot, worktree)
  git(['worktree', 'prune'], mainRoot)
  if (hasBranch) git(['branch', '-D', branch], mainRoot)
  return { removed: true, patch }
}

function sweepRun(cwd, runId) {
  run.assertRunId(runId)
  const { mainRoot } = repoPaths(cwd)
  const dir = run.worktreesDir(mainRoot, runId)
  const removedWorktrees = []
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const worktree = path.join(dir, name)
      if (removeWorktreeDir(mainRoot, worktree)) removedWorktrees.push(worktree)
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
  git(['worktree', 'prune'], mainRoot)
  const removedBranches = []
  for (const branch of listAetherBranches(mainRoot, runId)) {
    git(['branch', '-D', branch], mainRoot)
    removedBranches.push(branch)
  }
  return {
    removedWorktrees,
    removedBranches,
    remaining: {
      worktrees: fs.existsSync(dir) ? fs.readdirSync(dir) : [],
      branches: listAetherBranches(mainRoot, runId),
    },
  }
}

function latestMtime(dir) {
  let latest = fs.statSync(dir).mtimeMs
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const stat = fs.lstatSync(path.join(dir, entry))
    if (stat.mtimeMs > latest) latest = stat.mtimeMs
  }
  return latest
}

// Removes runs that were never finalized and have been untouched for `hours`,
// plus leftovers whose run directory is already gone.
function sweepStale(cwd, { hours = 24, now = Date.now() } = {}) {
  const { mainRoot } = repoPaths(cwd)
  const ids = new Set()
  for (const sub of ['runs', 'worktrees']) {
    const dir = path.join(run.aetherDir(mainRoot), sub)
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) if (run.isRunId(name)) ids.add(name)
    }
  }
  for (const branch of listAetherBranches(mainRoot)) {
    const id = branch.split('/')[1]
    if (run.isRunId(id)) ids.add(id)
  }
  const swept = []
  for (const id of [...ids].sort()) {
    const dir = run.runDir(mainRoot, id)
    const stale = !fs.existsSync(dir) || now - latestMtime(dir) > hours * 3600 * 1000
    if (!stale) continue
    const result = sweepRun(cwd, id)
    run.appendRecord({
      runId: id,
      status: 'abandoned',
      sweptAt: new Date(now).toISOString(),
      repo: mainRoot,
      removedWorktrees: result.removedWorktrees.length,
      removedBranches: result.removedBranches.length,
    })
    fs.rmSync(dir, { recursive: true, force: true })
    swept.push(id)
  }
  return { swept }
}
```

Replace the `module.exports` line with:

```js
module.exports = { ensure, diffPackage, merge, removeUnit, sweepRun, sweepStale }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/worktrees-cleanup.test.js tests/worktrees-merge.test.js tests/worktrees-ensure.test.js`
Expected: PASS, with `# pass 17` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/worktrees.js tests/worktrees-cleanup.test.js
git commit -m "feat(aether): remove units and sweep finished or stale runs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The `aether-wt` CLI

**Files:**
- Create: `plugins/aether/bin/aether-wt`
- Test: `tests/aether-wt.test.js`

**Interfaces:**
- Consumes: `ensure`, `diffPackage`, `merge`, `removeUnit`, `sweepRun` and `sweepStale` from `lib/worktrees.js` (Tasks 4–6).
- Produces the CLI, which prints the library result as one JSON line, or `{"error": "..."}` with exit 1:
  - `aether-wt ensure <run> <task>`
  - `aether-wt diff <run> <task>`
  - `aether-wt merge <run> <task>`
  - `aether-wt remove <run> <task> [--keep-patch]`
  - `aether-wt sweep --run <id>`
  - `aether-wt sweep --stale [--hours N]`

- [ ] **Step 1: Write the failing test**

Create `tests/aether-wt.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin, tempDir, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

test('aether-wt drives a unit from ensure to sweep, one JSON object per call', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  let r = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.created, true)
  commitIn(repo, r.json.path, 'src/t1/a.js', 'one\n', 'add a')
  r = runBin(WT_BIN, ['diff', args.runId, 'task-1'], repo.dir)
  assert.ok(fs.existsSync(r.json.path))
  r = runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir)
  assert.equal(r.json.merged, true)
  r = runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  assert.deepEqual(r.json, { removed: true, patch: null })
  r = runBin(WT_BIN, ['sweep', '--run', args.runId], repo.dir)
  assert.deepEqual(r.json.remaining, { worktrees: [], branches: [] })
})

test('aether-wt works from inside a unit worktree', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const first = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  const second = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], first.path)
  assert.equal(second.status, 0, second.stdout)
  assert.equal(second.json.path, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-2'))
})

test('aether-wt reports errors as JSON and exits 1', (t) => {
  const repo = makeRepo(t)
  let r = runBin(WT_BIN, ['ensure', 'bad-id', 'task-1'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /invalid run id/)
  r = runBin(WT_BIN, ['launch'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /^usage: aether-wt/)
})

test('aether-wt sweep --stale accepts an hour limit', (t) => {
  const data = tempDir(t, 'aether-data-')
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  age(args.runDir, 3)
  const r = runBin(WT_BIN, ['sweep', '--stale', '--hours', '2'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json, { swept: [args.runId] })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/aether-wt.test.js`
Expected: FAIL. `plugins/aether/bin/aether-wt` does not exist, so `runBin` returns `status: 1` and a null `json`.

- [ ] **Step 3: Write the implementation**

Create `plugins/aether/bin/aether-wt`:

```js
#!/usr/bin/env node
'use strict'

// aether-wt ensure <run> <task>
// aether-wt diff <run> <task>
// aether-wt merge <run> <task>
// aether-wt remove <run> <task> [--keep-patch]
// aether-wt sweep --run <id> | --stale [--hours N]

const path = require('node:path')
const wt = require(path.join(__dirname, '..', 'lib', 'worktrees.js'))

const USAGE = 'usage: aether-wt ensure|diff|merge|remove <run> <task> [--keep-patch] | aether-wt sweep --run <id> | --stale [--hours N]'

function sweep(rest) {
  if (rest[0] === '--run') return wt.sweepRun(process.cwd(), rest[1])
  if (rest[0] === '--stale') {
    const hours = rest[1] === '--hours' ? Number(rest[2]) : 24
    if (!Number.isFinite(hours) || hours <= 0) throw new Error('--hours needs a positive number')
    return wt.sweepStale(process.cwd(), { hours })
  }
  throw new Error(USAGE)
}

const [command, ...rest] = process.argv.slice(2)
try {
  let result
  if (command === 'ensure') result = wt.ensure(process.cwd(), rest[0], rest[1])
  else if (command === 'diff') result = wt.diffPackage(process.cwd(), rest[0], rest[1])
  else if (command === 'merge') result = wt.merge(process.cwd(), rest[0], rest[1])
  else if (command === 'remove') result = wt.removeUnit(process.cwd(), rest[0], rest[1], { keepPatch: rest.includes('--keep-patch') })
  else if (command === 'sweep') result = sweep(rest)
  else throw new Error(USAGE)
  process.stdout.write(JSON.stringify(result) + '\n')
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message }) + '\n')
  process.exit(1)
}
```

Make it executable:

```bash
chmod +x plugins/aether/bin/aether-wt
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/aether-wt.test.js`
Expected: PASS, with `# pass 4` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/bin/aether-wt tests/aether-wt.test.js
git commit -m "feat(aether): add the aether-wt CLI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Plugin skeleton and the SessionStart bootstrap

**Files:**
- Create: `plugins/aether/.claude-plugin/plugin.json`
- Create: `plugins/aether/hooks/hooks.json`
- Create: `plugins/aether/skills/using-aether/SKILL.md`
- Create: `plugins/aether/bin/aether-session-start`
- Test: `tests/session-start.test.js`

**Interfaces:**
- Consumes: `sweepStale` from `lib/worktrees.js` (Task 6); `SESSION_BIN`, `PLUGIN`, `makeRepo`, `compile`, `tempDir` and `age` from `tests/helpers.js`.
- Produces:
  - the plugin `aether` at version 0.1.0, loadable with `claude --plugin-dir plugins/aether`;
  - a SessionStart hook that prints `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "Aether mode is active.\n\n<using-aether body>[\n\nAether swept N stale run(s): <ids>.]"}}`.

- [ ] **Step 1: Write the failing test**

Create `tests/session-start.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, makeRepo, compile, tempDir, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure } = require('../plugins/aether/lib/worktrees.js')

function start(cwd, data) {
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data },
  })
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}

test('session start injects the Aether bootstrap', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.out.hookSpecificOutput.hookEventName, 'SessionStart')
  const context = r.out.hookSpecificOutput.additionalContext
  assert.match(context, /^Aether mode is active\./)
  assert.match(context, /# Aether mode/)
  assert.match(context, /aether-plan check/)
  assert.doesNotMatch(context, /disable-model-invocation/)
})

test('session start sweeps stale runs and says so', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  age(args.runDir, 48)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.out.hookSpecificOutput.additionalContext.endsWith(`Aether swept 1 stale run(s): ${args.runId}.`))
  assert.equal(fs.existsSync(unit.path), false)
})

test('session start works outside a git repository', (t) => {
  const r = start(tempDir(t), tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.out.hookSpecificOutput.additionalContext, /swept|could not sweep/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/session-start.test.js`
Expected: FAIL with `Cannot find module` for `plugins/aether/bin/aether-session-start`, reported in `r.stderr`. The assertion on `r.status` fails.

- [ ] **Step 3: Write the manifest, the hook registration and the bootstrap skill**

Create `plugins/aether/.claude-plugin/plugin.json`:

```json
{
  "name": "aether",
  "version": "0.1.0",
  "description": "Aether mode for Claude Code: a Designer on Opus, with plans checked and prepared for a parallel swarm of Haiku, Sonnet and Opus implementers.",
  "author": {
    "name": "DarkArty07"
  }
}
```

Create `plugins/aether/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/aether-session-start\""
          }
        ]
      }
    ]
  }
}
```

Create `plugins/aether/skills/using-aether/SKILL.md`:

````markdown
---
name: using-aether
description: Aether mode bootstrap for the Designer, injected at session start when the aether plugin is loaded. Covers route judgment, the Aether fields every plan needs, and how to check a plan.
disable-model-invocation: true
---

# Aether mode

You are the **Designer**: the main session, with final authority among the agents. The owner sits above you and approves specs, plans and anything irreversible, such as a merge to `main` or a push.

## superpowers stays the method

superpowers' skills and approval gates apply unchanged: brainstorming, specs, `writing-plans`, test-driven development, verification and reviews. Aether mode adds three things.

### 1. Choose the route by quality, cost and speed

You may implement, review and fix work yourself. Delegating is a decision, not a rule.
- Do it yourself when the work is bounded, serial, or depends on context only you hold.
- Hand it to the swarm when the work splits into independent pieces whose parallel, cheaper implementers save more than planning, review and integration cost.

Costs are judged at API list prices, in USD per million input/output tokens: Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0.10/0.50. Haiku's price rises five times when a prompt exceeds 100K tokens.

### 2. Add Aether fields to every plan

When you write a plan with superpowers `writing-plans`, put this block right after each task heading:

    **Aether:**
    - Tier: haiku — the task carries complete code
    - Area: backend
    - Owns: `src/api/**`, `tests/api.test.js`
    - Depends on: none

**Tier** is `haiku`, `sonnet` or `opus`, followed by " — " and the reason:
- `haiku` (default): exact tests and interfaces pin the task down, and it touches few files.
- `sonnet`: frontend and UI work, integration across several files, or behavior that the tests cannot pin down exactly.
- `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.

**Area** is a lowercase slug. Each area has its own supervisor.

**Owns** lists the files or globs (`*`, `**`, `?`) the task may change. Tasks in the same wave must not own overlapping paths.

**Depends on** is `none`, or one line per dependency in the form `Task N — reason`. Independence is the default, and every dependency needs a reason.

For a task meant for the swarm, give the contract instead of the implementation: the Interfaces block with exact names, signatures and types, the failing tests in full, and the acceptance. The implementer writes the code. Code that is already written and verified, you apply yourself.

Add this section after Global Constraints:

    ## Aether Execution
    - Test command: `npm test`
    - Ladder: haiku 2, sonnet 2, opus 1
    - Max agents: 200

### 3. Check the plan before the owner reviews it

Run `aether-plan check <plan.md>`. It prints JSON with the waves, or with every error, and it refuses plans shaped as a chain. Fix the errors before you ask the owner to review the plan.

The swarm executor (`/aether:run`) arrives in a later version. Until then, offer superpowers' own execution options at the plan handoff.
````

- [ ] **Step 4: Write the SessionStart hook**

Create `plugins/aether/bin/aether-session-start`:

```js
#!/usr/bin/env node
'use strict'

// SessionStart hook: injects the using-aether bootstrap and sweeps stale runs
// in the session's repository.

const fs = require('node:fs')
const path = require('node:path')

const root = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..')

function bootstrap() {
  const raw = fs.readFileSync(path.join(root, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
}

function sweepNote() {
  try {
    const { sweepStale } = require(path.join(root, 'lib', 'worktrees.js'))
    const { swept } = sweepStale(process.cwd())
    return swept.length ? `Aether swept ${swept.length} stale run(s): ${swept.join(', ')}.` : ''
  } catch (err) {
    if (/not a git repository/i.test(err.message)) return ''
    return `Aether could not sweep stale runs: ${err.message}`
  }
}

const context = ['Aether mode is active.', bootstrap(), sweepNote()].filter(Boolean).join('\n\n')
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }) + '\n')
```

Make it executable:

```bash
chmod +x plugins/aether/bin/aether-session-start
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/session-start.test.js`
Expected: PASS, with `# pass 3` and `# fail 0`.

- [ ] **Step 6: Validate the plugin**

Run: `claude plugin validate plugins/aether`
Expected: a final line starting with `✔ Validation passed`.

- [ ] **Step 7: Commit**

```bash
git add plugins/aether/.claude-plugin/plugin.json plugins/aether/hooks/hooks.json plugins/aether/skills/using-aether/SKILL.md plugins/aether/bin/aether-session-start tests/session-start.test.js
git commit -m "feat(aether): add the plugin skeleton and SessionStart bootstrap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The `aether-mode` shell function and the README

**Files:**
- Create: `scripts/aether-mode.fish`
- Modify: `README.md` (the title block at lines 1–8, and the `## Status` section)

**Interfaces:**
- Consumes: the plugin directory `plugins/aether` (Task 8).
- Produces: the `aether-mode` fish function, which runs `claude --plugin-dir <repo>/plugins/aether --settings '{"enableWorkflows": true}'` and passes its arguments through. It is not named `aether`, because `~/.local/bin/aether` is the CLI of the installed Aether Agents.

- [ ] **Step 1: Write the function**

Create `scripts/aether-mode.fish`:

```fish
# Aether mode: Claude Code with the aether plugin and dynamic workflows.
# Install: ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish
function aether-mode --description 'Claude Code in Aether mode'
    set -l repo (path dirname (path dirname (realpath (functions --details aether-mode))))
    claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' $argv
end
```

- [ ] **Step 2: Verify that the function finds the repository**

Run: `fish -c 'source scripts/aether-mode.fish; echo (path dirname (path dirname (realpath (functions --details aether-mode))))'`
Expected: the absolute path of this repository, for example `/home/darkarty/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin`.

- [ ] **Step 3: Update the README**

In `README.md`, replace

```markdown
# Multi-Agent Software Development for Claude Code (Prototype)

> Working name. The final name and identity will come later.

A spec-driven multi-agent system for software development, built as a Claude Code
plugin. You state your intent once. A design agent clarifies it and writes the spec.
```

with

```markdown
# Aether Plugin

A spec-driven multi-agent system for software development, built as a plugin for
Claude Code. You state your intent once. A design agent clarifies it and writes the spec.
```

and replace

```markdown
## Status

Prototype. Nothing is implemented yet. This README records the decisions taken on
2026-10-05.
```

with

```markdown
## Status

Version 0.1 is in progress. The current design is
[docs/superpowers/specs/2026-10-07-aether-plugin-design.md](docs/superpowers/specs/2026-10-07-aether-plugin-design.md).
The rest of this README still records the decisions of 2026-10-05. Plan 1 (foundation)
adds plan checking, unit worktrees and their cleanup.

## Use Aether mode

Aether mode is chosen per session. `aether-mode` loads the plugin and turns on dynamic
workflows; `claude` stays in normal mode, with superpowers alone.

In fish:

    ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish

In bash or zsh:

    aether-mode() { claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' "$@"; }

Run the tests with `node --test "tests/*.test.js"`. They need Node.js 22 and no dependencies.
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test "tests/*.test.js"`
Expected: PASS, with `# pass 52` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/aether-mode.fish README.md
git commit -m "docs(aether): add the aether-mode shell function and usage notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Link the function into the owner's fish configuration**

This writes outside the repository, so ask the owner before you run it. First run `fish -c 'type -a aether-mode'`; it must report that nothing is named `aether-mode`.

```bash
mkdir -p ~/.config/fish/functions
ln -s "$(realpath scripts/aether-mode.fish)" ~/.config/fish/functions/aether-mode.fish
```

Then run: `fish -c 'functions --details aether-mode'`
Expected: `/home/darkarty/.config/fish/functions/aether-mode.fish`.

---

## After this plan

- **Plan 2, Swarm:** agents (`implementer`, `reviewer`, `supervisor`, `ops`) with the `NOTICE` for the prompts adapted from superpowers, the `/aether:run` workflow with harness scenarios, the `swarm` skill, and the `using-aether` update that offers the swarm at the plan handoff.
- **Plan 3, Measurement and trial:** the usage meter mod, `config/prices.json`, `aether-report`, and the comparison trial against normal mode. The version is then tagged `aether--v0.1.0`.
