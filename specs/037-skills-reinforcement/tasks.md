# Tasks: reforzar el comportamiento de skills (Spec 037)

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS (`'use strict'`), zero external dependencies (`node:fs`, `node:path`, `node:os`, `node:child_process`, `node:crypto`, `node:test`, `node:assert/strict`).
- Never store conversation text or skill arguments in `<dataDir>/skills/uses.jsonl` or `<dataDir>/skills/notices.jsonl` (spec 014 R10): store only identifiers, timestamps, session IDs, canonical repository paths, and notice classes.
- Outside a Lead session (`!isAetherSession`), every hook must exit 0 with 0 B stdout and 0 files written (R18). `aether-report --skills` must work in any shell and only read from `<dataDir>/skills/*.jsonl`.
- Do not modify `plugins/aether/skills/using-aether/SKILL.md`: the three SessionStart bootstrap parts must remain within 9,800 characters and not grow above the 0.42.0 baseline (R19).
- All notices are advisory and run without a model; none of the new checks blocks a tool call or a delegate launch.
- A delegate verdict stores each finding as `{ file, line, what }` (`plugins/aether/lib/ladder.js:90`): every comparison of findings reads `what`, never a field named `detail`.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US3] Create `plugins/aether/config/skills.json` and add `notices.jsonl` helpers, `canonicalRepo`, `shouldRecordCreated`, `readCreatedDeduplicated` and `skillsReport` in `plugins/aether/lib/skill-registry.js` → Task 1
- [ ] T002 [P] [US4] Add `listProjectSkills`, `formatProjectSkills` and `matchDelegateSkills` in `plugins/aether/lib/skill-brief.js` → Task 2
- [ ] T003 [P] [US4] Document and check the `Skills:` task field in `plugins/aether/agents/writer.md`, `plugins/aether/agents/judge.md`, `plugins/aether/skills/tasks/SKILL.md` and `plugins/aether/speckit/commands/speckit.tasks.md` → Task 3
- [ ] T004 [P] [US6] Update `plugins/aether/skills/skills/SKILL.md` for practical topics, Context7, and writing project skills → Task 4
- [ ] T005 [P] [US8] Wire `aether-report --skills` in `plugins/aether/bin/aether-report` and `plugins/aether/lib/report.js` with unit and read-only verification tests → Task 5
- [ ] T006 [P] [US4] Pass project skills to the Writer and the Judge during plan design in `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js` and `plugins/aether/workflows/design.workflow.js` → Task 6
- [ ] T007 [P] [US1] Record `repo` on delegate verdicts, suggest matching project skills in `plan.notes` on `aether-delegate begin`, and compare findings by word similarity across tasks and sessions in `plugins/aether/lib/delegate-task.js` and `plugins/aether/lib/skill-repeat.js` → Task 7
- [ ] T008 [P] [US2] Add `Skill` to `PostToolUse` in `plugins/aether/hooks/hooks.json` and implement Lead `Skill` usage logging, creation deduplication, location and `aether:skills` notices, and `intent.md` practical-topic detection in `plugins/aether/lib/skill-review.js` and `plugins/aether/lib/continuity-posttool.js` → Task 8
- [ ] T009 [P] [US2] Update `plugins/aether/lib/skill-idle.js` and `plugins/aether/lib/session-start.js` to count Lead `Skill` loads in the 30-day window, use `readCreatedDeduplicated`, and emit first-startup practical-topic notices → Task 9
- [ ] T010 [P] [US8] Document the reinforced notices, `Skills:` in plans, `config/skills.json` and `aether-report --skills` in `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md` and `docs/reference/components.md` → Task 10

### Task 1: Configuración `config/skills.json`, deduplicación de `created.jsonl`, registro de avisos y `skillsReport` en `lib/skill-registry.js`

**Aether:**
- Area: skills-registry
- Owns: `plugins/aether/config/skills.json`, `plugins/aether/lib/skill-registry.js`, `tests/skill-registry.test.js`
- Depends on: none
- Serves: R2, R5, R6, R7, R12, R16, R17, R21

**Interfaces:**

1. `plugins/aether/config/skills.json`:
   - `repeat`: `{ "minWordLength": 3, "similarityThreshold": 0.35, "stopwords": string[] }`
   - `topics`: array of `{ "id": string, "label": string, "files": string[], "dependencies": string[], "words": string[], "skillKeywords": string[] }`, starting with `machine-learning`, `google-colab`, `godot`, `containers`, `browser-automation`, and `shaders`.
2. `plugins/aether/lib/skill-registry.js` exports (keeping `skillsDir`, `createdFile`, `installsFile`, `usesFile`, `recordCreated`, `readCreated`, `recordInstall`, `readInstalls`, `recordUse`, `readUses`):
   - `CONFIG_FILE`: `path.join(__dirname, '..', 'config', 'skills.json')`
   - `loadSkillsConfig(customPath = process.env.AETHER_SKILLS_CONFIG || CONFIG_FILE) -> { repeat: { minWordLength: number, similarityThreshold: number, stopwords: string[] }, topics: Array<object> }`
   - `noticesFile(dataDir) -> string` (`path.join(skillsDir(dataDir), 'notices.jsonl')`)
   - `recordNotice(dataDir, { time?, session?, repo?, kind, name }) -> { time: number, session: string|null, repo: string|null, kind: string, name: string } | null`: appends one JSONL line to `notices.jsonl` with only those five metadata fields (never conversation text).
   - `readNotices(dataDir) -> Array<{ time: number, session: string|null, repo: string|null, kind: string, name: string }>`
   - `canonicalRepo(entry) -> string | null`: resolves the main repository root from `entry.repo` or `entry.path` by stripping any worktree suffix (`/.aether/(?:work|worktrees|lanes|exams|seats|delegates)(?:/.*)?$` or `/.(?:worktrees|claude/worktrees)(?:/.*)?$`) and any skill suffix (`/.(?:agents|claude)/skills(?:/.*)?$`), then returning `repoPaths(candidate).mainRoot` when `candidate` is an existing git checkout, or the stripped path when it no longer exists on disk.
   - `skillRelPath(entryOrPath) -> string | null`: extracts `.agents/skills/<name>` or `.claude/skills/<name>` from a path or entry.
   - `alreadyInGitBefore(repo, relPath, beforeMs = null) -> boolean`: read-only query via `git(['log', '--reverse', '--format=%ct', '--', relPath], repo, { allowFail: true })`. When `beforeMs === null`, returns `true` if `repo` exists on disk and `git log` returns at least one commit timestamp for `relPath` (or `.agents/skills/<name>` / `.claude/skills/<name>`). When `typeof beforeMs === 'number'`, returns `true` only when `repo` and `path.join(repo, relPath)` exist on disk and the earliest commit timestamp satisfies `(firstCommitSec + 1) * 1000 <= beforeMs`. Returns `false` when `repo` or `relPath` does not exist on disk or `git` fails.
   - `shouldRecordCreated(dataDir, { repo, name, dir, type = 'project' }) -> boolean`: returns `false` when `readCreated(dataDir)` already contains an entry with the same `(canonicalRepo(e), e.name)` (or `type === 'owner'` with the same `name`), or when `type === 'project'` and `alreadyInGitBefore(repo, skillRelPath(dir) || ".agents/skills/" + name, null)` (or `.claude/skills/<name>`) is `true`.
   - `readCreatedDeduplicated(dataDir) -> Array<object>`: groups `readCreated(dataDir)` by `(canonicalRepo(entry), entry.name)` (or `('owner', entry.name)` for `type === 'owner'`), keeping the first entry of each pair with `repo: canonicalRepo(entry)` and, for a project entry whose `path` sat in a worktree, `path` rewritten to `path.join(repo, skillRelPath(entry))` (so a consumer that checks that `path` exists, such as `idleSkills`, still finds the skill once the worktree is gone), and filters out any project entry where `alreadyInGitBefore(repo, skillRelPath(entry), entry.time)` is `true`.
   - `skillsReport(dataDir, { repo = null, since = null, until = null, session = null } = {}) -> object`: reads `created.jsonl`, `installs.jsonl`, `uses.jsonl` and `notices.jsonl` from `dataDir` (never reading conversation transcripts), applies optional `repo`, `since`, `until`, and `session` filters, deduplicates created skills via `readCreatedDeduplicated` and downloaded skills by `(canonicalRepo(entry), entry.name)`, and returns `{ mode: 'skills', period: { since, until }, totals: { created, createdRaw, downloaded, leadLoads, agentUses, delegateUses, swarmUses, notices, noticesByKind }, created, downloaded, leadLoadsBySkill, agentUsesBySkill, projects }`.

**Tests (write first):**

```js
test('readCreatedDeduplicated groups worktree entries by main repo and discards skills already committed in git before entry.time (R5, R6, R7, C3, C8)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-skills-reg-')
  const preDir = path.join(repo.dir, '.agents', 'skills', 'artificial-analysis')
  fs.mkdirSync(preDir, { recursive: true })
  fs.writeFileSync(path.join(preDir, 'SKILL.md'), '---\nname: artificial-analysis\ndescription: AA\n---\nbody\n')
  repo.git('add', '.agents/skills/artificial-analysis/SKILL.md')
  repo.git('commit', '-m', 'pre-existing skill')
  const commitSec = Number.parseInt(repo.git('log', '-n', '1', '--format=%ct'), 10)
  const afterCommitMs = (commitSec + 10) * 1000

  for (const wt of ['wt-1', 'wt-2', 'wt-3']) {
    reg.recordCreated(data, {
      time: afterCommitMs + 100,
      session: 's1',
      repo: path.join(repo.dir, '.aether', 'work', 'delegates', wt, 'wt'),
      name: 'artificial-analysis',
      path: path.join(repo.dir, '.aether', 'work', 'delegates', wt, 'wt', '.agents', 'skills', 'artificial-analysis'),
      type: 'project',
    })
  }
  reg.recordCreated(data, { time: afterCommitMs + 200, session: 's1', repo: repo.dir, name: 'artificial-analysis', path: preDir, type: 'project' })
  for (const p of [
    path.join(repo.dir, '.aether', 'work', 'delegates', 'd1', 'wt', '.agents', 'skills', 'diseno-de-juego'),
    path.join(repo.dir, '.agents', 'skills', 'diseno-de-juego'),
  ]) {
    reg.recordCreated(data, { time: afterCommitMs + 300, session: 's2', repo: path.dirname(path.dirname(path.dirname(p))), name: 'diseno-de-juego', path: p, type: 'project' })
  }
  reg.recordCreated(data, { time: afterCommitMs + 400, session: 's3', repo: '/gone/project-a', name: 'criterio-del-dueno', path: '/gone/project-a/.claude/skills/criterio-del-dueno', type: 'project' })
  reg.recordCreated(data, { time: afterCommitMs + 500, session: 's4', repo: '/gone/project-b', name: 'direccion-de-arte', path: '/gone/project-b/.claude/skills/direccion-de-arte', type: 'project' })

  assert.equal(reg.readCreated(data).length, 8)
  const deduped = reg.readCreatedDeduplicated(data)
  assert.deepEqual(deduped.map((e) => e.name), ['diseno-de-juego', 'criterio-del-dueno', 'direccion-de-arte'])
  const game = deduped[0]
  assert.equal(game.path.endsWith(path.join('.agents', 'skills', 'diseno-de-juego')), true)
  assert.equal(game.path.includes('.aether'), false, 'the worktree path is rewritten to the main repo')
  assert.equal(reg.shouldRecordCreated(data, { repo: repo.dir, name: 'artificial-analysis', dir: preDir }), false)
  assert.equal(reg.shouldRecordCreated(data, { repo: repo.dir, name: 'diseno-de-juego', dir: path.join(repo.dir, '.agents', 'skills', 'diseno-de-juego') }), false)
  assert.equal(reg.shouldRecordCreated(data, { repo: repo.dir, name: 'brand-new', dir: path.join(repo.dir, '.agents', 'skills', 'brand-new') }), true)

  const rep = reg.skillsReport(data)
  assert.equal(rep.totals.createdRaw, 8)
  assert.equal(rep.totals.created, 3)
  assert.equal(rep.totals.downloaded, 0)
  assert.equal(rep.totals.agentUses, 0)
})
```

**Acceptance:**
- `plugins/aether/config/skills.json` exists with `repeat` and `topics` (`machine-learning`, `google-colab`, and practical topics) as editable JSON data (R2, R12).
- `shouldRecordCreated` refuses duplicate `(repo, name)` entries across worktrees and skills already committed in `git` (R5, R6).
- `readCreatedDeduplicated` collapses worktree duplicates to `(repo, name)` with the path in the main repository and filters out skills that already had a commit in `repo` before `entry.time`, while preserving entries whose repo or path no longer exists on disk (R7).
- `recordNotice`, `readNotices` and `skillsReport` work without reading conversation transcripts (R16, R17).

### Task 2: Listado de skills del proyecto y coincidencia con encargos de delegados en `lib/skill-brief.js`

**Aether:**
- Area: skills-brief
- Owns: `plugins/aether/lib/skill-brief.js`, `tests/skill-brief.test.js`
- Depends on: none
- Serves: R8, R15, R21

**Interfaces:**

`plugins/aether/lib/skill-brief.js` additional exports (preserving `MAX_SKILLS`, `parseFrontmatter`, `resolveSkill`, `loadSkills`, `formatSkillsSection`):
- `listProjectSkills(cwd) -> Array<{ name: string, description: string }>`: scans `.agents/skills/*/SKILL.md` and `.claude/skills/*/SKILL.md` under `cwd`, parses `name` and `description` from frontmatter (falling back to directory name for `name`), deduplicates by `name` preferring `.agents/skills/`, sorted alphabetically by `name`.
- `formatProjectSkills(skills) -> string`: returns `''` when `!Array.isArray(skills) || skills.length === 0`; otherwise returns these lines joined by `\n`, with no trailing newline, one `- \`<name>\`: <description>` line per skill:
  ```markdown
  ## Project skills

  Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):
  - `<name>`: <description>
  ```
  The workflow in Task 6 emits this same text; both tests pin the same literal block.
- `matchDelegateSkills(cwd, { prompt = '', description = '', owns = [] } = {}) -> string[]`: compares `listProjectSkills(cwd)` without a model against `prompt`, `description` and `owns`, returning the names of matching project skills (matching when the skill's `name` appears in the text/owns, or when all kebab-case parts of `name` of length `>= 4` appear, or when at least 2 significant words of length `>= 4` from `name` and `description` appear in the normalized words of `prompt`, `description` and `owns`).

**Tests (write first):**

```js
test('listProjectSkills, formatProjectSkills and matchDelegateSkills discover and match project skills without a model (R8, R15, C4, C7)', (t) => {
  const dir = tempDir(t, 'aether-proj-skills-')
  const a = path.join(dir, '.agents', 'skills', 'diseno-de-juego')
  const b = path.join(dir, '.claude', 'skills', 'direccion-de-arte')
  fs.mkdirSync(a, { recursive: true })
  fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(a, 'SKILL.md'), '---\nname: diseno-de-juego\ndescription: Balance de economia, niveles y combate del juego\n---\nbody\n')
  fs.writeFileSync(path.join(b, 'SKILL.md'), '---\nname: direccion-de-arte\ndescription: Paleta, tipografia y composicion visual\n---\nbody\n')

  const skills = sb.listProjectSkills(dir)
  assert.deepEqual(skills.map((s) => s.name), ['direccion-de-arte', 'diseno-de-juego'])
  assert.equal(
    sb.formatProjectSkills(skills),
    [
      '## Project skills',
      '',
      'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
      '- `direccion-de-arte`: Paleta, tipografia y composicion visual',
      '- `diseno-de-juego`: Balance de economia, niveles y combate del juego',
    ].join('\n'),
  )
  assert.equal(sb.formatProjectSkills([]), '')
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Ajusta el balance de economia y combate del juego', description: 'balance', owns: ['src/game.js'] }),
    ['diseno-de-juego'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Actualiza el parser de JSON', description: 'parser', owns: ['src/json.js'] }),
    [],
  )
})
```

**Acceptance:**
- `listProjectSkills` discovers project skills from `.agents/skills/` and `.claude/skills/` without duplicates (R8).
- `formatProjectSkills` formats the `## Project skills` section for the Writer and the Judge, with the exact text above (R8).
- `matchDelegateSkills` matches project skills against a delegate brief's words and `owns` paths without a model (R15).

### Task 3: Reglas del campo `Skills:` en `agents/writer.md`, `agents/judge.md`, `skills/tasks/SKILL.md` y `speckit/commands/speckit.tasks.md`

**Aether:**
- Area: design-agents
- Owns: `plugins/aether/agents/writer.md`, `plugins/aether/agents/judge.md`, `plugins/aether/skills/tasks/SKILL.md`, `plugins/aether/speckit/commands/speckit.tasks.md`, `tests/agents-design.test.js`, `tests/agent-outputs.test.js`
- Depends on: none
- Serves: R9, R21

**Interfaces:**

1. `plugins/aether/agents/writer.md`:
   - In `## Aether plan rules`, adds `- **Skills** is optional: up to 3 project or installed skills that help the task, separated by commas, such as \`- Skills: direccion-de-arte, patron-api\`. Put \`Skills:\` on the tasks where one of the project skills applies (at most 3 per task); omit it when none applies.`
2. `plugins/aether/skills/tasks/SKILL.md` and `plugins/aether/speckit/commands/speckit.tasks.md`:
   - In step 3 (`The fields are:`), adds `- **Skills:** optional. Up to 3 skills that help the task, separated by commas, such as \`- Skills: direccion-de-arte, patron-api\`. When the project has skills that fit a task, list them here (at most 3 per task); \`aether-plan check\` fails on more than 3 or on a skill that does not exist.` (`aether-plan check` already does both: `plugins/aether/lib/plan-compile.js` reports `Skills lists N skills (at most 3)` and `skill "<name>" does not exist`.)
3. `plugins/aether/agents/judge.md`:
   - In step 4 (`**On a plan and its tasks:**`), adds `- when the project has skills, check that the tasks where a project skill applies carry it in \`- Skills:\` (at most 3 skills per task) and that no task lists an unrelated skill.`

**Tests (write first):**

```js
test('the Writer, the tasks skill and the Judge document and check the Skills field on tasks (R9, C4)', () => {
  has('writer', ['- **Skills** is optional', '`- Skills:', 'at most 3'])
  has('judge', ['`- Skills:`', 'at most 3 skills per task'])
  const tasksSkill = fs.readFileSync(path.join(PLUGIN, 'skills', 'tasks', 'SKILL.md'), 'utf8')
  const speckitTasks = fs.readFileSync(path.join(PLUGIN, 'speckit', 'commands', 'speckit.tasks.md'), 'utf8')
  assert.ok(tasksSkill.includes('**Skills:**') && tasksSkill.includes('- Skills:'))
  assert.ok(speckitTasks.includes('**Skills:**') && speckitTasks.includes('- Skills:'))
})
```

**Acceptance:**
- `agents/writer.md`, `skills/tasks/SKILL.md`, `speckit/commands/speckit.tasks.md` and `agents/judge.md` document and check `- Skills:` (up to 3 skills per task) (R9).
- `tests/agents-design.test.js` and `tests/agent-outputs.test.js` pass.

### Task 4: Guía de procesos prácticos y Context7 en `skills/skills/SKILL.md`

**Aether:**
- Area: skills-guide
- Owns: `plugins/aether/skills/skills/SKILL.md`, `tests/new-skills.test.js`
- Depends on: none
- Serves: R14, R21

**Interfaces:**

`plugins/aether/skills/skills/SKILL.md`:
- Under `## Finding and installing a skill` / `## Creating a skill`, explains:
  - When to search for a skill: when the visible-signals notice fires (on the first Aether startup in a new project or when writing `specs/NNN-<topic>/intent.md`) or whenever the Lead enters a new practical topic where step-by-step operational procedures matter (such as Machine Learning or Google Colab).
  - Skills vs library API docs: skills are for practical processes and repeatable procedures, whereas the API documentation of a library is looked up with Context7.
  - Fallback when no good skill exists: if searching returns no suitable skill (or none passes review), the Lead writes the project skill in `.agents/skills/<name>/SKILL.md` (with its symlink in `.claude/skills/<name>`) with what it learned.

**Tests (write first):**

```js
test('aether:skills explains when to search on practical topics, Context7 for library APIs, and writing the project skill when none fits (R14, C6)', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  assert.ok(text.includes('Context7'), 'aether:skills names Context7 for library API documentation')
  assert.match(text, /practical process|practical topic/i)
  assert.match(text, /write the project skill|writes the project skill/i)
})
```

**Acceptance:**
- `plugins/aether/skills/skills/SKILL.md` explains when to search for a skill, distinguishes practical processes from library API docs (Context7), and instructs the Lead to write the project skill when no good skill is found (R14).
- `tests/new-skills.test.js` passes.

### Task 5: Modo `aether-report --skills` en `bin/aether-report` y `lib/report.js`

**Aether:**
- Area: skills-report
- Owns: `plugins/aether/bin/aether-report`, `plugins/aether/lib/report.js`, `tests/aether-report.test.js`
- Depends on: Task 1 — calls skillsReport from lib/skill-registry.js
- Serves: R17, R18, R21

**Interfaces:**

1. `plugins/aether/lib/report.js`:
   - Re-exports `skillsReport(dataDir, options)` from `./skill-registry.js`, reading the resolved `dataDir` directly (`<dataDir>/skills/*.jsonl`); it does not aggregate other install directories.
2. `plugins/aether/bin/aether-report`:
   - Usage header adds `//   aether-report --skills [--repo <path>] [--since <ms|iso>] [--until <ms|iso>] [--session <id>]`.
   - Parses `--skills`, optional `--repo`, `--since`, `--until` and `--session`, and prints `JSON.stringify(skillsReport(dataDir, { repo, since, until, session })) + '\n'`.
3. `tests/aether-report.test.js`: add `makeRepo` to the existing import of `./helpers.js` (the file already imports `PLUGIN`, `runBin`, `tempDir`) and `const reg = require('../plugins/aether/lib/skill-registry.js')`.

**Tests (write first):**

```js
test('aether-report --skills reports per project and period and reproduces the #269 figures without reading conversations (R17, R18, R21, C8)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-report-skills-')
  const preDir = path.join(repo.dir, '.agents', 'skills', 'artificial-analysis')
  fs.mkdirSync(preDir, { recursive: true })
  fs.writeFileSync(path.join(preDir, 'SKILL.md'), '---\nname: artificial-analysis\ndescription: AA\n---\nbody\n')
  repo.git('add', '.agents/skills/artificial-analysis/SKILL.md')
  repo.git('commit', '-m', 'existing')
  const commitSec = Number.parseInt(repo.git('log', '-n', '1', '--format=%ct'), 10)
  const t0 = (commitSec + 10) * 1000

  for (let i = 0; i < 4; i++) {
    reg.recordCreated(data, { time: t0 + i, session: 's1', repo: repo.dir, name: 'artificial-analysis', path: preDir, type: 'project' })
  }
  reg.recordCreated(data, { time: t0 + 10, session: 's2', repo: `${repo.dir}/.aether/work/delegates/d1/wt`, name: 'diseno-de-juego', path: `${repo.dir}/.aether/work/delegates/d1/wt/.agents/skills/diseno-de-juego`, type: 'project' })
  reg.recordCreated(data, { time: t0 + 11, session: 's2', repo: repo.dir, name: 'diseno-de-juego', path: `${repo.dir}/.agents/skills/diseno-de-juego`, type: 'project' })
  reg.recordCreated(data, { time: t0 + 20, session: 's3', repo: '/gone/a', name: 'criterio-del-dueno', path: '/gone/a/.claude/skills/criterio-del-dueno', type: 'project' })
  reg.recordCreated(data, { time: t0 + 30, session: 's4', repo: '/gone/b', name: 'direccion-de-arte', path: '/gone/b/.claude/skills/direccion-de-arte', type: 'project' })

  const r = runBin(REPORT_BIN, ['--skills'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(r.status, 0, r.stderr)
  const out = r.json
  assert.equal(out.mode, 'skills')
  assert.equal(out.totals.createdRaw, 8)
  assert.equal(out.totals.created, 3)
  assert.deepEqual(out.created.map((s) => s.name), ['diseno-de-juego', 'criterio-del-dueno', 'direccion-de-arte'])
  assert.equal(out.totals.downloaded, 0)
  assert.equal(out.totals.agentUses, 0)

  const later = runBin(REPORT_BIN, ['--skills', '--since', String(t0 + 25)], repo.dir, { AETHER_DATA_DIR: data })
  assert.deepEqual(later.json.created.map((s) => s.name), ['direccion-de-arte'])
})
```

**Acceptance:**
- `aether-report --skills` works from any shell, reads only `<dataDir>/skills/*.jsonl` (never conversations), supports `--repo`, `--since`, `--until` and `--session`, and reproduces the #269 figures both on the test fixture and in a read-only check on `${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/data/aether-aether-plugin` when present on the machine (R17, R18, R21).

### Task 6: Entrega de las skills del proyecto al Writer y al Judge en `lib/seats.js`, `lib/seat-calls.js` y `workflows/design.workflow.js`

**Aether:**
- Area: design-seats
- Owns: `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js`, `plugins/aether/workflows/design.workflow.js`, `tests/seats.test.js`, `tests/seat-calls.test.js`, `tests/workflow-design.test.js`
- Depends on: Task 2 — uses listProjectSkills and formatProjectSkills from lib/skill-brief.js
- Serves: R8, R21

**Interfaces:**

1. `plugins/aether/lib/seats.js`:
   - `seatPrompt({ seat, harness, adapter, message, workdir, feature, doc = 'plan' })`: when `workdir` has project skills (`listProjectSkills(workdir)`) and `(seat === 'writer' && doc !== 'spec') || (seat === 'judge' && doc !== 'spec' && !/^Review the spec\b/.test(String(message || '')))`, includes `formatProjectSkills(skills)` in the prompt if `message` does not already contain `## Project skills`.
   - `seatCommand`: includes `projectSkills: listProjectSkills(top)` on `value` when returning `unavailable` (exit 3) or `failed` (exit 4). With no external pair (lanes off, or `superdelegation` off) the round ends in exit 3, so this is how a native-only design gets the list.
2. `plugins/aether/lib/seat-calls.js`:
   - `start(cwd, flags)` includes `projectSkills: listProjectSkills(top)` in `{ started: true, id, at, projectSkills }`.
3. `plugins/aether/workflows/design.workflow.js` (it does not import `lib/`):
   - `formatProjectSkills(skills)`: its own copy, which emits the exact same text as `skill-brief.formatProjectSkills(skills)` (the block fixed in Task 2: `## Project skills`, a blank line, the sentence `Available project skills in this repository (use \`- Skills: <name>\` in tasks where one applies, at most 3 per task):`, then one `- \`<name>\`: <description>` line per skill, joined by `\n`, no trailing newline).
   - `awaitSeat` keeps `projectSkills` from `started.projectSkills` or from `waited.reply.value.projectSkills` and hands it to `seatRound`; `seat-start` runs on every round of the flow, so a design with no external pair still receives the list from the exit-3 reply. When `doc === 'plan'` and `(seat === 'writer' || seat === 'judge')`, and the round goes to the native agent, `seatRound` appends `\n\n` + `formatProjectSkills(projectSkills)` to `nativeText` before `nativeAnswer` when the list is non-empty. Rounds of `doc === 'spec'` and of the Examiner never get it.

**Tests (write first):**

```js
const PROJECT_SKILLS = [{ name: 'direccion-de-arte', description: 'Paleta y tipografia' }]
const PROJECT_BLOCK = [
  '## Project skills',
  '',
  'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
  '- `direccion-de-arte`: Paleta y tipografia',
].join('\n')

function assertPlanRoundsGetSkills(run) {
  const prompt = (label) => run.calls.find((c) => c.label === label).prompt
  assert.equal(prompt('spec: writer write').includes('## Project skills'), false)
  assert.equal(prompt('spec: judge review 1').includes('## Project skills'), false)
  assert.ok(prompt('plan: writer write').includes(PROJECT_BLOCK))
  assert.ok(prompt('plan: judge review 1').includes(PROJECT_BLOCK))
}

test('design.workflow.js passes the project skills of the exit-3 reply (no external pair) to the native plan Writer and plan Judge, and not to the spec rounds (R8, C4)', async () => {
  const run = await go(ARGS, {
    ops: (call, fallback) => {
      if (call.command.verb === 'seat-wait') {
        const seat = call.command.rest[0].split('-')[0]
        return { done: true, exitCode: 3, value: { ...nativeSeat(seat), projectSkills: PROJECT_SKILLS } }
      }
      return fallback(call)
    },
  })
  assertPlanRoundsGetSkills(run)
})

test('design.workflow.js also takes the project skills from the seat-start reply (R8, C4)', async () => {
  const run = await go(ARGS, {
    ops: (call, fallback) => (call.command.verb === 'seat-start' ? { ...fallback(call), projectSkills: PROJECT_SKILLS } : fallback(call)),
  })
  assertPlanRoundsGetSkills(run)
})
```

**Acceptance:**
- External seats (`seatPrompt`) and native agents (`design.workflow.js`) receive the available project skills (`name` and `description`) during `plan` writing, `plan` revision, and `plan` review, in the exact block above (R8).
- A design with no external pair (every round handed back in exit 3) still gives them to the native plan Writer and Judge (R8, C4).
- Existing tests in `tests/seats.test.js`, `tests/seat-calls.test.js` and `tests/workflow-design.test.js` pass.

### Task 7: Similitud de palabras entre hallazgos de tareas y sesiones del mismo proyecto y sugerencia de skill en `lib/delegate-task.js` y `lib/skill-repeat.js`

**Aether:**
- Area: delegates-skills
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/skill-repeat.js`, `tests/skill-repeat.test.js`, `tests/delegate-skills.test.js`
- Depends on: Task 1 — uses loadSkillsConfig and recordNotice from lib/skill-registry.js
- Depends on: Task 2 — uses matchDelegateSkills from lib/skill-brief.js
- Serves: R1, R2, R15, R16, R21, R22

**Interfaces:**

1. `plugins/aether/lib/delegate-task.js`:
   - In `verdict`: resolves `let repo = null; try { repo = repoPaths(r.cwd).mainRoot } catch {}` and writes `repo` on the `kind: 'verdict'` entry in `delegates/log.jsonl` (R22). `r.cwd` is `deps.cwd`, or `process.cwd()` for the bin.
   - In `begin` (`begin({ session, event: { description, prompt } }, deps)`): resolves `let repo = null; try { repo = repoPaths(r.cwd).mainRoot } catch {}`; passes `repo` to `recordUse` when `loadedSkills.length > 0`; when `brief.skills.length === 0`, calls `matchDelegateSkills(r.cwd, { prompt, description, owns: brief.owns })`, appends `Aether delegate task ${id}: project skill(s) ${matched.join(', ')} match this brief; add AETHER-SKILLS: ${matched.slice(0, 3).join(', ')} if it helps.` to `notes` (`plan.notes`) without modifying `args.prompt` or `externalPrompt`, and records each suggested skill with `recordNotice(r.dataDir, { time, session, repo, kind: 'delegate-skill', name })` (R15, R16).
2. `plugins/aether/lib/skill-repeat.js`:
   - `wordSimilarity(whatA, whatB, config = null) -> number` and `findingsMatch(whatA, whatB, config = null) -> boolean`: read `repeat` (`minWordLength`, `similarityThreshold`, `stopwords`) from `loadSkillsConfig()` (or the `config` override, R2), take the words of `finding.what` (the text of a finding `{ file, line, what }` as `aether-delegate verdict --finding` stores it, `ladder.js:90`; lowercase, stripped diacritics, length `>= minWordLength`, not in `stopwords`), treat words as equal when identical or when both have length `>= 5` and share a 5-character prefix, and compare Jaccard similarity against `similarityThreshold`.
   - `repeatedFindings(dataDir, { session = null, task = null, repo = null, config = null } = {}) -> Array<{ finding: string, tasks: string[] }>`: keeps the return shape and the finding text `"${file}: ${what}"` of the target task's finding that `tests/skill-repeat.test.js:17` asserts (those tests and the notice text asserted at `:38-55` do not change). It compares `finding.what` of the target task `(session, task)` against the `verdict === 'fix'` entries of other tasks `(entry.session, entry.task)` on the same file, in the same project: `entry.repo === targetRepo` across sessions when both have `repo` (`targetRepo` is the `repo` option or the target entry's `repo`), or `entry.session === session && entry.task !== task` when `repo` is absent on a legacy entry (R1, R22).
   - `posttool(input, ctx)`: resolves `repo` from `input.cwd`, runs `repeatedFindings`, records each repeated file with `recordNotice(dataDir, { session: input.session_id, repo, kind: 'repeated-finding', name: r.finding.split(':')[0] })` (R16), and returns the existing notice format (`The finding "${r.finding}" already came up in ${taskNoun} ${r.tasks.join(', ')}. Consider a skill for it: load aether:skills.`).
3. Test files: `tests/skill-repeat.test.js` adds `makeRepo` and `runBin` to its imports from `./helpers.js`, `PLUGIN`, `path`, `delegate-task.js` as `task`, `skill-registry.js` as `reg`; `tests/delegate-skills.test.js` adds `reg`. The first test uses the file's existing `log` and builds its own `deps`.

**Tests (write first):**

```js
// tests/skill-repeat.test.js (imports added: path, PLUGIN, makeRepo, runBin from ./helpers.js, task, reg)
// A real begin makes each launch; one verdict goes through the library and one through the real bin, so the findings
// are stored as { file, line, what } exactly as in production.
test('repeatedFindings matches similar words of finding.what across sessions of one project, through the real verdict path, and respects the config threshold (R1, R2, R22, C1)', async (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-repeat-sim-')
  const deps = { dataDir: data, cwd: repo.dir, home: tempDir(t, 'aether-home-'), settings: { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }, pickPair: async () => ({ pick: null, quota: [] }) }
  const launch = (session) => task.begin({ session, event: { subagent_type: 'general-purpose', description: 'd', prompt: 'AETHER-TASK: t1\nDo the work.' } }, deps)
  assert.equal((await launch('s1')).kind, 'first')
  const v1 = await task.verdict({ task: 't1', verdict: 'fix', session: 's1', findings: ['src/foo.js:10:falta validar el borde cuando la lista viene vacía'] }, deps)
  assert.equal(v1.ok, true, JSON.stringify(v1))
  assert.equal((await launch('s2')).kind, 'first')
  const BIN = path.join(PLUGIN, 'bin', 'aether-delegate')
  const v2 = runBin(BIN, ['verdict', '--task', 't1', '--verdict', 'fix', '--session', 's2', '--finding', 'src/foo.js:18:no valida la lista vacía en el borde'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(v2.json.ok, true, v2.stdout + v2.stderr)

  const verdicts = log.readEntries(data, { task: 't1' }).filter((e) => e.kind === 'verdict')
  assert.deepEqual(verdicts.map((e) => [e.session, e.repo]), [['s1', repo.dir], ['s2', repo.dir]])
  assert.deepEqual(Object.keys(verdicts[1].input.findings[0]).sort(), ['file', 'line', 'what'])

  const across = repeat.repeatedFindings(data, { session: 's2', task: 't1' })
  assert.deepEqual(across, [{ finding: 'src/foo.js: no valida la lista vacía en el borde', tasks: ['t1'] }])
  const notice = repeat.posttool(
    { tool_name: 'Bash', session_id: 's2', cwd: repo.dir, tool_input: { command: 'aether-delegate verdict --task t1 --verdict fix --finding "src/foo.js:18:no valida la lista vacía en el borde"' } },
    { env: {}, home: '/h', now: 1, dataDir: data },
  )
  assert.equal(notice, 'The finding "src/foo.js: no valida la lista vacía en el borde" already came up in task t1. Consider a skill for it: load aether:skills.')
  assert.deepEqual(reg.readNotices(data).map((n) => [n.kind, n.name, n.session, n.repo]), [['repeated-finding', 'src/foo.js', 's2', repo.dir]])

  log.appendEntry(data, { kind: 'verdict', time: 1, session: 's9', task: 'legacy', attempt: 1, step: 'haiku', verdict: 'fix', input: { kind: 'fix', findings: [{ file: 'src/foo.js', line: 1, what: 'no valida la lista vacía en el borde' }], reason: null, fromScratch: false } })
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's2', task: 't1' }).map((r) => r.tasks), [['t1']], 'a legacy entry with no repo is not compared across sessions')

  const strict = repeat.repeatedFindings(data, { session: 's2', task: 't1', config: { minWordLength: 3, similarityThreshold: 0.99, stopwords: [] } })
  assert.deepEqual(strict, [])
})
```

```js
// tests/delegate-skills.test.js
test('aether-delegate begin without AETHER-SKILLS suggests a matching project skill in notes without changing the brief (R15, R16, C7)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'diseno-de-juego')
  const plan = await task.begin(call('AETHER-TASK: d-sug\nAjusta el diseno y balance del juego en src/game.js.'), w.deps)
  assert.equal(plan.kind, 'first')
  assert.ok(plan.notes.some((n) => n.includes('project skill(s) diseno-de-juego') && n.includes('AETHER-SKILLS: diseno-de-juego')), plan.notes.join('\n'))
  assert.equal(plan.args.prompt, undefined, 'the call is not changed')
  assert.equal(entries(w.dataDir, 'd-sug').find((e) => e.kind === 'launch').skills, undefined)
  assert.deepEqual(reg.readNotices(w.dataDir).map((n) => [n.kind, n.name]), [['delegate-skill', 'diseno-de-juego']])

  const other = await task.begin(call('AETHER-TASK: d-none\nActualiza el parser de JSON en src/json.js.'), w.deps)
  assert.equal(other.notes.some((n) => n.includes('diseno-de-juego')), false)
})
```

**Acceptance:**
- `aether-delegate verdict` saves `repo` on every verdict entry (R22).
- `skill-repeat.js` compares `what` and matches findings on the same file with similar words across tasks in the same or different sessions of the same project, respects the threshold in `config/skills.json`, ignores legacy entries without `repo` across sessions, and logs `repeated-finding` in `notices.jsonl` (R1, R2, R16, R22).
- The existing assertions of `tests/skill-repeat.test.js` (return shape `{ finding, tasks }` and the exact notice text) pass unchanged.
- `aether-delegate begin` without `AETHER-SKILLS:` adds a non-blocking skill suggestion to `plan.notes` and logs `delegate-skill` in `notices.jsonl` when a project skill matches, without changing `args.prompt` (R15, R16).

### Task 8: Registro de cargas de `Skill` del Lead, deduplicación al crear skills, avisos de ubicación y falta de `aether:skills`, y detector de temas en `intent.md`

**Aether:**
- Area: posttool-skills
- Owns: `plugins/aether/hooks/hooks.json`, `plugins/aether/lib/skill-review.js`, `plugins/aether/lib/continuity-posttool.js`, `tests/skill-review.test.js`, `tests/continuity-posttool-skills.test.js`, `tests/continuity-hook.test.js`
- Depends on: Task 1 — uses loadSkillsConfig, shouldRecordCreated and recordNotice from lib/skill-registry.js
- Serves: R3, R5, R6, R10, R11, R12, R13, R16, R18, R21

**Interfaces:**

1. `plugins/aether/hooks/hooks.json`:
   - `PostToolUse` entry for `aether-continuity posttool` uses matcher `"Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash|Skill"`.
   - Source check without a model (A3): the types of Claude Code 2.1.325 list `Skill` as a built-in tool (input `{ skill, args? }`) and give `PostToolUseHookInput` a free `tool_name: string`, so `PostToolUse` is the source; the live firing is not observed (plan Risks). The handler must not depend on `tool_response` or `hook_event_name`, so that the fallback of A3 (a `PreToolUse` entry with matcher `Skill` to the same `aether-continuity posttool`, or the mod's `on('tool.call', { tool: 'Skill' })`) would be a `hooks.json` change only. The test below pins that independence through the real bin.
   - `tests/continuity-hook.test.js`: line 221 changes to assert the matcher `'Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash|Skill'`, and the tool list at line 273 gains `'Skill'` (`WebFetch`, `Agent` and `ScheduleWakeup` still do not reach it).
2. `plugins/aether/lib/skill-review.js`:
   - `recordLeadSkillLoad(input, ctx) -> null`: when `input.tool_name === 'Skill'` and `!input.agent_id`, extracts the skill name from `input.tool_input?.skill || input.tool_input?.name || input.tool_input?.skill_name` (first token, so `args` and no conversation text is ever stored) and calls `recordUse(dataDir, { session: input.session_id, repo: mainRoot, kind: 'lead', skills: [skillName] })` (R3). It reads only `tool_name`, `tool_input.skill`, `tool_input.name`, `tool_input.skill_name`, `session_id`, `cwd` and `agent_id`.
   - `detectUncoveredTopics({ cwd, home, dataDir, session = null, intentPath = null, config = null }) -> Array<{ id: string, label: string }>`: checks visible signals (`files`, `dependencies`, and `words` in `intentPath`) from `loadSkillsConfig().topics` against installed skills in `.agents/skills/`, `.claude/skills/`, `~/.agents/skills/`, `~/.claude/skills/` and `skills/installs.jsonl` (`name` and `description` of `SKILL.md`), filtering out topics already notified for `(session, mainRoot, topic.id)` in `notices.jsonl` (R12, R13, A2, A5).
   - `startupTopicNotice({ cwd, home, dataDir, session, config = null }) -> string | null`: runs `detectUncoveredTopics`, records `kind: 'topic-search'` in `notices.jsonl` for each uncovered topic, and returns the non-blocking notice line (or `null` when none).
   - In `posttool(input, ctx)`:
     - handles `input.tool_name === 'Skill'` via `recordLeadSkillLoad`;
     - when `Write`, `Edit` or `MultiEdit` targets `specs/NNN-<topic>/intent.md`, runs `detectUncoveredTopics` with `intentPath`, records `kind: 'topic-search'` in `notices.jsonl`, and returns the non-blocking notice telling the Lead to load `aether:skills` and search for a skill before the plan (R13, R16);
     - when `Write`, `Edit` or `MultiEdit` targets a skill (`classifySkillPath`), uses `shouldRecordCreated(dataDir, { repo: mainRoot, name: info.name, dir: info.dir, type: info.type })` before calling `recordCreated` with `repo: mainRoot` (R5, R6);
     - for a project skill (`info.type === 'project'`), if the target path is under `.claude/skills/<name>` (or outside `.agents/skills/<name>`) as a real directory rather than a symlink to `.agents/skills/<name>`, emits a non-blocking location notice and records `kind: 'skill-location'` in `notices.jsonl` (R10, R16);
     - for a project skill (`info.type === 'project'`), if `readUses(dataDir)` has no `kind === 'lead'` entry in `input.session_id` for `aether:skills` or `skills`, emits a non-blocking notice to load `aether:skills` and records `kind: 'skill-unloaded'` in `notices.jsonl` (R11, R16).

**Tests (write first):**

```js
// tests/continuity-posttool-skills.test.js uses its own world(t) -> { repo, home, data, ctx }, and already imports
// fs, path, spawnSync, PLUGIN, tempDir, makeRepo, posttool, reg, log and markSession.
test('the real hooks.json PostToolUse entry selects Skill and bin/aether-continuity posttool records Lead loads without conversation text, with or without tool_response, while a plain session writes nothing (R3, R5, R6, R10, R11, R18, C2, C3, C5, C9)', (t) => {
  const w = world(t)
  const hooksJson = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const group = hooksJson.hooks.PostToolUse.find((g) => g.hooks.some((h) => h.command.endsWith('/bin/aether-continuity" posttool')))
  assert.ok(group, 'hooks.json has a PostToolUse entry for aether-continuity posttool')
  assert.equal(new RegExp(`^(?:${group.matcher})$`).test('Skill'), true)

  markSession(w.data, 's-lead', 1000, { repo: w.repo.dir, claude: null })
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const env = { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.home, HOME: w.home }
  const skillCall = (session, extra = {}) =>
    spawnSync(process.execPath, [bin, 'posttool'], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, cwd: w.repo.dir, tool_name: 'Skill', tool_input: { skill: 'criterio-del-dueno', args: 'SECRET-CONVERSATION-TEXT' }, ...extra }),
      encoding: 'utf8',
      env,
    })

  const plain = skillCall('plain', { tool_response: { success: true, commandName: 'criterio-del-dueno' } })
  assert.deepEqual([plain.status, plain.stdout], [0, ''])
  assert.equal(reg.readUses(w.data).length, 0)

  const lead = skillCall('s-lead', { tool_response: { success: true, commandName: 'criterio-del-dueno' } })
  assert.equal(lead.status, 0)
  const noResponse = skillCall('s-lead', { hook_event_name: 'PreToolUse' })
  assert.equal(noResponse.status, 0)
  const uses = reg.readUses(w.data)
  assert.equal(uses.length, 2, 'the same entry records the load whichever event and payload it comes from')
  assert.ok(uses.every((u) => u.kind === 'lead' && u.session === 's-lead'))
  assert.deepEqual(uses[0].skills, ['criterio-del-dueno'])
  assert.ok(!JSON.stringify(uses).includes('SECRET-CONVERSATION-TEXT'))

  assert.equal(posttool.posttool({ session_id: 's-lead', agent_id: 'a1', cwd: w.repo.dir, tool_name: 'Skill', tool_input: { skill: 'x' } }, w.ctx), null)
  assert.equal(reg.readUses(w.data).length, 2, 'a subagent load is not a Lead load')

  const badFile = path.join(w.repo.dir, '.claude', 'skills', 'mal-ubicada', 'SKILL.md')
  fs.mkdirSync(path.dirname(badFile), { recursive: true })
  fs.writeFileSync(badFile, '---\nname: mal-ubicada\ndescription: Prueba\n---\nbody\n')
  const out = posttool.posttool({ session_id: 's-lead', cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: badFile } }, w.ctx)
  assert.ok(out && out.additionalContext.includes('.agents/skills/'))
  assert.ok(out.additionalContext.includes('aether:skills'))
  assert.deepEqual(reg.readNotices(w.data).map((n) => n.kind).sort(), ['skill-location', 'skill-unloaded'])
})

test('writing specs/NNN-topic/intent.md with practical topic signals emits a search notice once per session (R12, R13, R16, C6)', (t) => {
  const w = world(t)
  const intent = path.join(w.repo.dir, 'specs', '001-ml', 'intent.md')
  fs.mkdirSync(path.dirname(intent), { recursive: true })
  fs.writeFileSync(intent, '# Intent\nEntrenar un modelo con PyTorch en Google Colab.\n')
  const first = posttool.posttool({ session_id: 's-ml', cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: intent } }, w.ctx)
  assert.ok(first && first.additionalContext.includes('aether:skills'))
  const second = posttool.posttool({ session_id: 's-ml', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: intent } }, w.ctx)
  assert.equal(second, null)
})
```

**Acceptance:**
- `hooks/hooks.json` includes `Skill` in the `PostToolUse` matcher for `aether-continuity posttool`, and outside a Lead session exits 0 with 0 B stdout and 0 files written (R3, R18); `tests/continuity-hook.test.js` asserts the new matcher.
- Lead `Skill` calls are logged in `skills/uses.jsonl` (`kind: 'lead'`) without conversation text, whichever hook event or payload carries them (R3).
- Project skill creation in `skill-review.js` uses `shouldRecordCreated` with `repo: mainRoot` (R5, R6) and emits non-blocking notices when placed outside `.agents/skills/` (R10) or when `aether:skills` was not loaded in the session (R11).
- Writing or editing `specs/NNN-<topic>/intent.md` emits a non-blocking search notice once per `(session, repo, topic)` when visible signals of an uncovered topic in `config/skills.json` are detected (R12, R13, R16).

### Task 9: Ventana de 30 días de skills sin uso con cargas del Lead y aviso de temas prácticos en el primer arranque (`lib/skill-idle.js`, `lib/session-start.js`)

**Aether:**
- Area: startup-skills
- Owns: `plugins/aether/lib/skill-idle.js`, `plugins/aether/lib/session-start.js`, `tests/skill-idle.test.js`, `tests/session-start-tidy.test.js`, `tests/session-start-parts.test.js`
- Depends on: Task 1 — uses readCreatedDeduplicated and recordNotice from lib/skill-registry.js
- Depends on: Task 8 — uses startupTopicNotice from lib/skill-review.js
- Serves: R4, R7, R13, R16, R18, R19, R21

**Interfaces:**

1. `plugins/aether/lib/skill-idle.js`:
   - `idleSkills(dataDir, { repo, days = 30, now = Date.now() } = {}) -> Array<{ name: string, path: string|null, since: number }>` (the return shape does not change): takes the project candidates from `readCreatedDeduplicated(dataDir)` (R7) instead of the raw `created.jsonl` (downloaded skills still come from `readInstalls`), and marks as used any skill present in `readUses(dataDir)` within `days * 86400000` ms across all `kind` values (`lead`, `delegate`, `run`), normalizing `aether:<name>` to `<name>` (R4).
2. `plugins/aether/lib/session-start.js`:
   - When `idleLine` is non-empty, records each idle skill (`idle.map((s) => s.name)`) via `recordNotice(data, { time: now, session, repo: mainRoot, kind: 'idle-skills', name })` (R16).
   - When `source === 'startup'` and `firstSession === true` and `<mainRoot>/.aether/runs` and `<mainRoot>/.aether/autonomy` do not exist on disk (first Aether startup in a new project, A1), calls `startupTopicNotice({ cwd: top, home, dataDir: data, session })`, stores any non-null notice in a new `topicLines` list, adds `topicLines.join('\n')` to the list in `contextOf` (`session-start.js:519`, next to `tidyLines` and `idleLines`), and trims `topicLines` first in the `PART_LIMIT` loop (`session-start.js:537`), before `idleLines` and `tidyLines` (R13, R16, R19).

**Tests (write first):**

```js
// tests/skill-idle.test.js (adds: const { makeRepo } = require('./helpers.js'), const reg = require('../plugins/aether/lib/skill-registry.js'))
test('idleSkills excludes skills loaded by the Lead in the last 30 days, with or without the aether: prefix, and reads readCreatedDeduplicated (R4, R7, C2)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-idle-lead-')
  const now = Date.now()
  const skillDir = path.join(repo.dir, '.agents', 'skills', 'criterio-del-dueno')
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: criterio-del-dueno\ndescription: d\n---\nbody\n')
  const wt = path.join(repo.dir, '.aether', 'work', 'delegates', 'd1', 'wt')
  reg.recordCreated(data, { time: now - 45 * 86400000, session: 's0', repo: wt, name: 'criterio-del-dueno', path: path.join(wt, '.agents', 'skills', 'criterio-del-dueno'), type: 'project' })
  assert.deepEqual(idle.idleSkills(data, { repo: repo.dir, now }).map((s) => s.name), ['criterio-del-dueno'], 'the worktree is gone, the skill in the main repo is found')

  reg.recordUse(data, { time: now - 5 * 86400000, session: 's1', repo: repo.dir, kind: 'lead', skills: ['aether:criterio-del-dueno'] })
  assert.deepEqual(idle.idleSkills(data, { repo: repo.dir, now }), [])
})
```

```js
// tests/session-start-tidy.test.js
test('first Aether startup in a new project with practical topic signals emits the topic search notice in additionalContext (R13, R16, C6)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'notebook.ipynb'), '{}\n')
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.ok(out.hookSpecificOutput.additionalContext.includes('aether:skills'))
  assert.ok(out.hookSpecificOutput.additionalContext.length <= PART_LIMIT)
})
```

The startup test also asserts the topic label that `config/skills.json` gives the `.ipynb` signal (for example `Machine Learning`) in `additionalContext`, and that `<dataDir>/skills/notices.jsonl` holds one `topic-search` entry for this session and repository.

**Acceptance:**
- `idleSkills` uses `readCreatedDeduplicated` and never names or proposes removing a skill loaded by the Lead or passed to an agent in the last 30 days (R4, R7); the existing tests of `tests/skill-idle.test.js` and the idle test of `tests/session-start-tidy.test.js` pass unchanged.
- `session-start.js` records `idle-skills` in `notices.jsonl` when `idleLine` fires, and emits `startupTopicNotice` on the first Aether startup in a new project with uncovered practical-topic signals (R13, R16).
- All 3 SessionStart bootstrap parts remain within 9,800 characters and do not grow above the 0.42.0 baseline (`tests/session-start-parts.test.js` passes, R19).

### Task 10: Documentación en guías y referencia de componentes

**Aether:**
- Area: docs-skills
- Owns: `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md`, `docs/reference/components.md`, `tests/project-files-docs.test.js`, `tests/docs-030.test.js`, `tests/docs-facts.test.js`
- Depends on: Task 3 — documents Skills: in plans
- Depends on: Task 5 — documents aether-report --skills and config/skills.json
- Depends on: Task 7 — documents repeated-finding word similarity and delegate-skill suggestion notices
- Depends on: Task 8 — documents Skill PostToolUse, skill-location, skill-unloaded and intent topic-search notices
- Depends on: Task 9 — documents 30-day idle-skills with Lead loads and startup topic-search notices
- Serves: R18, R20, R21

**Interfaces:**

1. `docs/guide/project-files-and-skills.md` and `docs/es/guias/archivos-skills-y-continuidad.md`:
   - Under `### Assigning skills to tasks` / `### Asignar skills a una tarea` (and a subsection on skill reinforcement and performance):
     - Explain that `/aether:design` passes the project's skills (`name` and `description` from `.agents/skills/` and `.claude/skills/`) to the Writer and the Judge so tasks in `tasks.md` carry `Skills:` (up to 3 per task).
     - Document the non-blocking notices: practical-topic search on visible signals (`config/skills.json`), `.agents/skills/` location and loading `aether:skills` when creating or editing a project skill, repeated delegate findings on the same file by word similarity across tasks and sessions, 30-day idle skills counting Lead `Skill` loads, and suggested project skills on `aether-delegate begin` without `AETHER-SKILLS:`.
     - Document `aether-report --skills` for inspecting created, downloaded, Lead-loaded, and agent-used skills and emitted notices by project and period.
2. `docs/reference/components.md`:
   - In `## The pieces` (`aether-report` row): add `--skills` to the modes of `aether-report`.
   - In `## Library families` (`Configuration data` paragraph): add `config/skills.json`.
   - In `## What Aether adds to a normal session` (last paragraph): update the `PostToolUse` list to `Write, Edit, MultiEdit, NotebookEdit, Read, Grep, Glob, Bash and Skill`.

**Tests (write first):**

```js
test('the guides and components reference document aether-report --skills, config/skills.json and the reinforced skill notices (R18, R20, C8, C9)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    assert.ok(text.includes('`aether-report --skills`'), `${rel} names aether-report --skills`)
    assert.ok(text.includes('`config/skills.json`'), `${rel} names config/skills.json`)
  }
  const comp = read('docs/reference/components.md')
  assert.ok(comp.includes('`--skills`'))
  assert.ok(comp.includes('`config/skills.json`'))
})
```

**Acceptance:**
- `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md` and `docs/reference/components.md` document the reinforced notices, `Skills:` in plans, `config/skills.json`, `aether-report --skills` and the `PostToolUse` dormant footprint (R18, R20).
- `tests/project-files-docs.test.js`, `tests/docs-030.test.js` and `tests/docs-facts.test.js` pass (R20, R21).
