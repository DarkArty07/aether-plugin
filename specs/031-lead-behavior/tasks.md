# Tasks: Hacer cumplir por código e higiene de prompts los comportamientos del Lead (031-lead-behavior)

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Intent:** [intent.md](intent.md)

## Global Constraints

- **Node.js 22 y CommonJS sin dependencias nuevas:** todos los módulos bajo `plugins/aether/lib/` y `plugins/aether/bin/` usan CommonJS (`'use strict'`) y módulos nativos de Node.js.
- **Invariantes de `tests/guards.test.js`:** cada archivo en `plugins/aether/lib/` conserva su cabecera de 2 líneas con `// Family: <nombre>.`, sin funciones duplicadas ni exportaciones muertas.
- **Huella durmiente de 0 bytes fuera de una sesión del Lead (R12, C7):** todo hook registrado en `plugins/aether/hooks/hooks.json` sale con código 0, sin salida en `stdout`/`stderr` y sin crear ni tocar archivos cuando la sesión no pertenece al Lead de Aether o cuando corre dentro de un subagente (`input.agent_id` presente).
- **Prohibiciones del alcance (R13, `intent.md` §4):** no tocar la versión `0.35.0`, no escribir ni modificar el changelog de `0.36.0`, no hacer merge ni `git push`, no instalar el plugin y no cerrar issues en GitHub. No tocar el atributo `alt` en `site/index.html:223` ni `way_direct_alt` en `site/app.js:71,238`, ni el registro histórico en `docs/decisions.md:236`.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] Task 1: Listar en `aether-report --delegates` las tareas con resultado llegado y sin veredicto
- [ ] Task 2: Exigir plan aprobado en plan mode antes de `aether-autonomy start` interactivo y exponer `launchRefusal`
- [ ] Task 3: Extraer las skills `aether:models` y `aether:designing` y alinear `aether:skills`
- [ ] Task 4: Reemplazar «about five tool calls» por la regla contable en el sitio y en los tutoriales
- [ ] Task 5: Avisar una vez por resultado sin veredicto al cerrar el turno del Lead (`Stop`) e ignorar subagentes
- [ ] Task 6: Rechazar lanzamientos por tope o pausa en `aether-delegate begin` y `aether-plan compile`
- [ ] Task 7: Rechazar `/aether:design` por tope o pausa e incluir `skill: 'aether:designing'` en su salida
- [ ] Task 8: Avisar una vez por turno en `PostToolUse` al llegar a 3 ediciones propias o 10 lecturas
- [ ] Task 9: Alinear las skills `aether:autonomous-runs` y `aether:swarm` con el rechazo automático y con #214
- [ ] Task 10: Hacer independientes del orden las partes de `aether-session-start`, reducir `hooks.json` a 3 partes y actualizar `using-aether`
- [ ] Task 11: Actualizar documentación, `CLAUDE.md`, `docs/decisions.md` y huella durmiente en `docs/reference/components.md`

---

### Task 1: Listar en `aether-report --delegates` las tareas con resultado llegado y sin veredicto

**Aether:**
- Area: delegates
- Owns: `plugins/aether/lib/delegate-report.js`, `tests/delegate-report.test.js`, `tests/install-dirs.test.js`, `tests/retired-journal.test.js`
- Depends on: none
- Serves: R1, R2

**Goal:**
Detectar en `plugins/aether/lib/delegate-report.js` las tareas delegadas cuyo último lanzamiento tiene resultado llegado (`result`, `answer` u `outcome`) y aún no tiene `verdict`, exponer funciones reutilizables `unverdictedTasks` y `unverdictedDelegates`, e incluir la lista `unverdicted` en la salida de `aether-report --delegates` sin importar si `Stop` ya avisó de ellas.

**Interfaces:**
En `plugins/aether/lib/delegate-report.js`:
- `isUnverdictedTask(entries)`: para las entradas de una tarea (que tiene al menos un `isLaunch`), toma `latest = last(entries.filter(isLaunch))` y su índice `launchIdx = entries.lastIndexOf(latest)`: devuelve `true` si después de `launchIdx` (con `entry.time >= latest.time`) existe al menos una entrada con `entry.kind === 'result'`, `entry.kind === 'answer'` o `entry.kind === 'outcome'` y no existe ninguna entrada con `entry.kind === 'verdict'` posterior a `launchIdx`.
- `unverdictedTasks(entries)`: agrupa `entries` por `taskKey(entry.session, id)` (donde `id = entry.kind === 'outcome' ? entry.id : entry.task`), filtra las tareas con `list.some(isLaunch)` y `isUnverdictedTask(list)`, y devuelve un arreglo de `{ task: id, session: latest.session ?? null, attempt: launches.length, step: latest.step ?? null }`.
- `unverdictedDelegates({ dataDir = run.dataDir(), session = null, since = 0 } = {})`: lee `readAllEntries(dataDir, { session, since })` y devuelve `unverdictedTasks(entries)`.
- `rowOfTask(id, entries)`: añade `unverdicted: isUnverdictedTask(entries)` al objeto de fila devuelto (`{ id, time, session, description, applied, ranOn, fallback, step, attempts, unverdicted, ...(authorized) }`).
- `delegatesReport({ dataDir = run.dataDir(), session = null, since = 0 } = {})`: calcula `const unverdicted = unverdictedTasks(entries)` y lo incluye tanto en el nivel superior (`{ delegations, unverdicted, ladder }`) como en `ladder.unverdicted`.
- `module.exports = { delegatesReport, unverdictedTasks, unverdictedDelegates }`.

**Tests (write first):**
Añadir en `tests/delegate-report.test.js`:

```js
test('delegatesReport lists tasks whose latest launch has an outcome or result and no verdict', (t) => {
  const dataDir = tempDir(t, 'aether-del-unverdicted-')
  log.appendEntry(dataDir, launch('pending-res', 'sonnet', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'result', task: 'pending-res', attempt: 1, ok: true, status: 'done' }))
  log.appendEntry(dataDir, launch('in-flight', 'haiku', 1, 'first'))
  log.appendEntry(dataDir, launch('judged-task', 'sonnet', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'result', task: 'judged-task', attempt: 1, ok: true, status: 'done' }))
  log.appendEntry(dataDir, verdict('judged-task', 'sonnet', 1, 'approved', { step: null, kind: 'done', cause: null }))

  const report = delegatesReport({ dataDir, session: 's1' })
  assert.deepEqual(report.unverdicted, [
    { task: 'pending-res', session: 's1', attempt: 1, step: 'sonnet' },
  ])
  assert.deepEqual(report.ladder.unverdicted, report.unverdicted)
  const byId = new Map(report.delegations.map((d) => [d.id, d]))
  assert.equal(byId.get('pending-res').unverdicted, true)
  assert.equal(byId.get('in-flight').unverdicted, false)
  assert.equal(byId.get('judged-task').unverdicted, false)
})

test('delegatesReport flags fix attempt when verdict is followed by a new launch and answer without verdict', (t) => {
  const dataDir = tempDir(t, 'aether-del-retry-unverdicted-')
  log.appendEntry(dataDir, launch('t1', 'haiku', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'result', task: 't1', attempt: 1, ok: true, status: 'done' }))
  log.appendEntry(dataDir, verdict('t1', 'haiku', 1, 'fix', { step: 'haiku', kind: 'fix', cause: 'fix' }))
  log.appendEntry(dataDir, launch('t1', 'haiku', 2, 'fix'))
  log.appendEntry(dataDir, at({ kind: 'answer', task: 't1', attempt: 2, text: 'fixed answer' }))

  const report = delegatesReport({ dataDir, session: 's1' })
  assert.deepEqual(report.unverdicted, [
    { task: 't1', session: 's1', attempt: 2, step: 'haiku' },
  ])
})
```

**Acceptance:**
- `aether-report --delegates` devuelve `unverdicted` y `ladder.unverdicted` con las tareas cuyo último intento tiene resultado llegado (`result`, `answer` u `outcome`) y no tiene `verdict`.
- Las tareas aún en curso (sin resultado llegado) o cuyo último intento ya tiene `verdict` (`approve`, `fix` sin nuevo intento con resultado, o `infeasible`) tienen `unverdicted: false` y no aparecen en `report.unverdicted`.
- `node --test tests/delegate-report.test.js` pasa.

---

### Task 2: Exigir plan aprobado en plan mode antes de `aether-autonomy start` interactivo y exponer `launchRefusal`

**Aether:**
- Review: xhigh — gobierna la compuerta de autorización de corridas autónomas (`aether-autonomy start`) y el freno de seguridad de tiempo, gasto y cuota (`launchRefusal`)
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `tests/*autonomy*.test.js`, `tests/quota-brake*.test.js`, `tests/guard*.test.js`, `tests/copies-classes.test.js`, `tests/docs-claims.test.js`
- Depends on: none
- Serves: R3, R5, R12

**Goal:**
1. En `plugins/aether/lib/autonomy.js`, distinguir sesiones sin terminal (`entrypoint: "sdk-cli"`) de sesiones interactivas al correr `start`: en sesiones sin terminal conservar el comportamiento actual; en sesiones interactivas (o cuando la transcripción no existe, no puede leerse o no tiene `entrypoint: "sdk-cli"`) exigir que conste en la transcripción de esa sesión una aprobación válida de `ExitPlanMode` que no haya sido consumida por una corrida anterior de esa misma sesión, fallando cerrado cuando no conste.
2. Añadir y exportar `launchRefusal(mainRoot, { now } = {})` en `plugins/aether/lib/autonomy.js` para que `aether-delegate begin`, `aether-plan compile` y `seat-start` rechacen lanzar trabajo nuevo cuando hay una corrida abierta con `stop` en `'time'`, `'cost'` o `'quota'`.

**Interfaces:**
En `plugins/aether/lib/autonomy.js`:
- `readSessionRecords(configDir, sessionId)`: localiza el archivo `<sessionId>.jsonl` mediante `findSessionTranscript(configDir, sessionId)` (de `voice.js`); si no existe o no puede leerse devuelve `{ found: false, records: [] }`; si se lee, parsea cada línea JSON válida y devuelve `{ found: true, records }`.
- `isHeadlessTranscript(records)`: devuelve `true` únicamente cuando `records.length > 0`, al menos un registro tiene `r.entrypoint === 'sdk-cli'` y ningún registro con `typeof r.entrypoint === 'string'` tiene un valor distinto de `'sdk-cli'`.
- `countApprovedPlanModes(records)`: recorre los mensajes de `records` en orden; registra los `id` de bloques `tool_use` con `name === 'ExitPlanMode'` en mensajes `assistant`; y cuenta cuántos bloques `tool_result` en mensajes `user` posteriores referencian uno de esos `tool_use_id` (sin reutilizar el mismo `tool_use_id`), tienen `is_error !== true` y contienen texto (cadena en `content` o bloque `{ type: 'text', text }`) que empieza por `'User has approved your plan.'` (o contiene `\nUser has approved your plan.`).
- `countSessionRuns(root, sessionId)`: cuenta cuántos archivos `run.json` bajo `.aether/autonomy/` tienen `run.session === sessionId`.
- En `start(mainRoot, { quote, session, hours, usd } = {}, { configDir = defaultConfigDir(), now = Date.now() } = {})`:
  - Después de verificar la cita literal del dueño (`verifyOwnerQuote`) y que no haya otra corrida abierta (`openRun`), lee `readSessionRecords(configDir, session)`.
  - Si `!isHeadlessTranscript(records)`, calcula `approvals = countApprovedPlanModes(records)` y `priorRuns = countSessionRuns(root, session)`. Si `approvals <= priorRuns`, devuelve:
    `{ ok: false, reason: 'interactive session requires an approved plan in plan mode (ExitPlanMode) before starting an autonomous run; present the plan in plan mode and wait for the owner to approve it before running aether-autonomy start' }`.
  - No añade campos nuevos al archivo de corrida (conserva exactamente `{ id, session, quote, quoteTime, started, ceilings, spend, brakeOff, quotaPauses, quotaCrossings, ended, outcome }`).
- `launchRefusal(mainRoot, { now = Date.now() } = {})`:
  - Llama a `status(mainRoot, { now })`. Si `!st.open || !st.stop`, devuelve `null`.
  - Si `st.stop === 'time'`, devuelve `{ stop: 'time', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} reached its time ceiling (\${st.hours.elapsed}h / \${st.hours.ceiling}h); close it with: aether-autonomy end --outcome ceiling\` }`.
  - Si `st.stop === 'cost'`, devuelve `{ stop: 'cost', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} reached its spend ceiling ($\${st.usd.spent} / $\${st.usd.ceiling}); close it with: aether-autonomy end --outcome ceiling\` }`.
  - Si `st.stop === 'quota'`, devuelve `{ stop: 'quota', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} is paused by the quota brake (\${st.quota.percentUsed}% used; resumeAt \${st.quota.resumeAt || 'pending'}); wait until \${st.quota.resumeAt || 'the quota window resets'} or close the run with: aether-autonomy end --outcome incomplete\` }`.
- Exportar `launchRefusal` en `module.exports` de `plugins/aether/lib/autonomy.js`.

**Tests (write first):**
1. En `tests/autonomy.test.js`, `tests/aether-autonomy.test.js`, `tests/quota-brake.test.js` y `tests/quota-brake-scenarios.test.js`, actualizar el ayudante `human(text, timestamp)` para que incluya `entrypoint: 'sdk-cli'` (representando sesiones sin terminal `claude -p`).
2. Añadir en `tests/autonomy.test.js`:

```js
function planUse(toolUseId = 'toolu_plan_1', timestamp = '2026-04-12T10:00:01.000Z') {
  return {
    type: 'assistant',
    entrypoint: 'cli',
    timestamp,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: 'ExitPlanMode', input: {} }],
    },
  }
}

function planResult(toolUseId = 'toolu_plan_1', approved = true, timestamp = '2026-04-12T10:00:02.000Z') {
  return {
    type: 'user',
    entrypoint: 'cli',
    timestamp,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: !approved,
          content: approved
            ? 'User has approved your plan. You can now start coding.'
            : "The user doesn't want to proceed with this tool use.",
        },
      ],
    },
  }
}

test('start rejects interactive cli session without ExitPlanMode approval and succeeds once approved', (t) => {
  const repo = makeTempGitRepo(t)
  const { configDir } = makeConfigProject(t, 'proj-interactive')
  writeTranscript(configDir, 'proj-interactive', 'sess-cli', [
    { ...human('go ahead on your own for 2 hours'), entrypoint: 'cli' },
  ])

  const withoutPlan = autonomy.start(
    repo,
    { quote: 'go ahead on your own for 2 hours', session: 'sess-cli', hours: 2 },
    { configDir, now: Date.parse('2026-04-12T10:00:05.000Z') }
  )
  assert.equal(withoutPlan.ok, false)
  assert.match(withoutPlan.reason, /plan mode/i)

  writeTranscript(configDir, 'proj-interactive', 'sess-cli', [
    { ...human('go ahead on your own for 2 hours'), entrypoint: 'cli' },
    planUse('toolu_p1'),
    planResult('toolu_p1', false),
  ])
  const rejectedPlan = autonomy.start(
    repo,
    { quote: 'go ahead on your own for 2 hours', session: 'sess-cli', hours: 2 },
    { configDir, now: Date.parse('2026-04-12T10:00:05.000Z') }
  )
  assert.equal(rejectedPlan.ok, false)

  writeTranscript(configDir, 'proj-interactive', 'sess-cli', [
    { ...human('go ahead on your own for 2 hours'), entrypoint: 'cli' },
    planUse('toolu_p1'),
    planResult('toolu_p1', true),
  ])
  const approvedPlan = autonomy.start(
    repo,
    { quote: 'go ahead on your own for 2 hours', session: 'sess-cli', hours: 2 },
    { configDir, now: Date.parse('2026-04-12T10:00:05.000Z') }
  )
  assert.equal(approvedPlan.ok, true)
  autonomy.end(repo, { outcome: 'done' }, { now: Date.parse('2026-04-12T10:10:00.000Z') })

  const reusedApproval = autonomy.start(
    repo,
    { quote: 'go ahead on your own for 2 hours', session: 'sess-cli', hours: 2 },
    { configDir, now: Date.parse('2026-04-12T10:11:00.000Z') }
  )
  assert.equal(reusedApproval.ok, false)
  assert.match(reusedApproval.reason, /plan mode/i)
})

test('launchRefusal reports time, cost and quota stops with run id and end command', (t) => {
  const repo = makeTempGitRepo(t)
  const { configDir } = makeConfigProject(t, 'proj-refusal')
  writeTranscript(configDir, 'proj-refusal', 'sess-r', [
    human('run unattended for 1 hour'),
  ])
  const started = autonomy.start(
    repo,
    { quote: 'run unattended for 1 hour', session: 'sess-r', hours: 1, usd: 5 },
    { configDir, now: Date.parse('2026-04-12T10:00:00.000Z') }
  )
  assert.equal(started.ok, true)
  assert.equal(autonomy.launchRefusal(repo, { now: Date.parse('2026-04-12T10:30:00.000Z') }), null)

  const byTime = autonomy.launchRefusal(repo, { now: Date.parse('2026-04-12T11:01:00.000Z') })
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.id, started.run.id)
  assert.match(byTime.message, /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- `aether-autonomy start` permite abrir corridas en sesiones con `entrypoint: "sdk-cli"` sin exigir plan mode.
- En sesiones con `entrypoint: "cli"`, ausente u otro valor, `aether-autonomy start` falla cerrado si no consta una aprobación válida de `ExitPlanMode` no consumida por una corrida previa de la misma sesión, y abre la corrida cuando sí consta.
- `launchRefusal` devuelve `null` cuando no hay corrida abierta o `stop` es `null`, y devuelve `{ stop, id, hours, usd, quota, message }` cuando `stop` es `'time'`, `'cost'` o `'quota'`.
- `node --test tests/autonomy.test.js tests/aether-autonomy.test.js tests/quota-brake.test.js tests/quota-brake-scenarios.test.js` pasa.

---

### Task 3: Extraer las skills `aether:models` y `aether:designing` y alinear `aether:skills`

**Aether:**
- Area: skills
- Owns: `plugins/aether/skills/models/SKILL.md`, `plugins/aether/skills/designing/SKILL.md`, `plugins/aether/skills/skills/SKILL.md`, `tests/new-skills.test.js`
- Depends on: none
- Serves: R9, R10

**Goal:**
Crear `plugins/aether/skills/models/SKILL.md` (`name: models`) y `plugins/aether/skills/designing/SKILL.md` (`name: designing`) con el detalle de la tabla de modelos y del procedimiento de diseño extraídos de la skill de arranque (incluyendo el punto 6 de #204 sobre `aether-exam store specs/NNN-<topic>`), y actualizar en `plugins/aether/skills/skills/SKILL.md` la sintaxis real de `aether-autonomy trust` (punto 5 de #204).

**Interfaces:**
1. `plugins/aether/skills/models/SKILL.md`:
   - Frontmatter YAML con `name: models` y `description: "Reference for Aether's model index, pricing table, and current Claude, GPT, and Gemini model capabilities and vendor citations. Load when answering questions about models, pricing, effort levels, or vendor benchmarks."`.
   - Incluye las rutas al archivo `models.json` (bajo `${CLAUDE_PLUGIN_ROOT}/config/models`) y al archivo `prices.json` (bajo `${CLAUDE_PLUGIN_ROOT}/config`), la regla de leer ambos archivos antes de hablar de modelos o precios y no adivinar desde los pesos, y la tabla completa `### What the models are for` con los seis modelos (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `gpt-5.4`, `gpt-5.4-mini`, `gemini-3.1-pro-preview`) y `### How the vendors place them`.
2. `plugins/aether/skills/designing/SKILL.md`:
   - Frontmatter YAML con `name: designing` y `description: "How the Lead prepares an intent card, runs /aether:design, and handles approved, clarify, dispute, and failed design outcomes, exams, and short designs. Load before writing intent.md, before running /aether:design, or when /aether:design returns."`.
   - Contiene el procedimiento completo de diseño: preguntas de aclaración (una por vez con recomendación marcada `(Recommended)`), escritura de `specs/NNN-<topic>/intent.md` con las 5 secciones (`## 1. What the owner wants` a `## 5. Open to the team's judgment`), invocación de `/aether:design`, tabla de resultados (`approved`, `clarify`, `dispute`, `failed`) incluyendo que en `approved` si la carpeta tiene `exam.json` se corre `aether-exam store specs/NNN-<topic>` antes de construir, `### Changes after the design is approved`, `### Logs and recovery` (`aether-report --seats`) y `### Exam` (`aether-exam`).
3. `plugins/aether/skills/skills/SKILL.md`:
   - En la sección `## External skills`, reemplazar `aether-autonomy trust <author> --quote "<their words>"` por `aether-autonomy trust --author <author> --quote "<their words>"`.

**Tests (write first):**
Añadir en `tests/new-skills.test.js`:

```js
test('models and designing skills exist with valid frontmatter and expected content', () => {
  const modelsPath = path.join(SKILLS_DIR, 'models', 'SKILL.md')
  const designingPath = path.join(SKILLS_DIR, 'designing', 'SKILL.md')
  assert.ok(fs.existsSync(modelsPath), 'models skill must exist')
  assert.ok(fs.existsSync(designingPath), 'designing skill must exist')

  const models = fs.readFileSync(modelsPath, 'utf8')
  const designing = fs.readFileSync(designingPath, 'utf8')
  assert.match(models, /^---\nname: models\ndescription: /m)
  assert.ok(models.includes(['config', 'models', 'models.json'].join('/')))
  assert.ok(models.includes(['config', 'prices.json'].join('/')))
  assert.match(models, /claude-opus-4-7/)
  assert.match(models, /gemini-3\.1-pro-preview/)

  assert.match(designing, /^---\nname: designing\ndescription: /m)
  assert.match(designing, /specs\/NNN-<topic>\/intent\.md/)
  assert.match(designing, /\/aether:design/)
  assert.match(designing, /aether-exam store specs\/NNN-<topic>/)
})

test('skills skill uses --author flag in aether-autonomy trust command', () => {
  const text = fs.readFileSync(path.join(SKILLS_DIR, 'skills', 'SKILL.md'), 'utf8')
  assert.match(text, /aether-autonomy trust --author <author> --quote "<their words>"/)
})
```

**Acceptance:**
- `plugins/aether/skills/models/SKILL.md` y `plugins/aether/skills/designing/SKILL.md` existen con frontmatter válido (`name` y `description`).
- `plugins/aether/skills/designing/SKILL.md` documenta `aether-exam store specs/NNN-<topic>` al recibir `approved` cuando existe `exam.json`.
- `plugins/aether/skills/skills/SKILL.md` documenta `aether-autonomy trust --author <author> --quote "<their words>"`.
- `node --test tests/new-skills.test.js` pasa.

---

### Task 4: Reemplazar «about five tool calls» por la regla contable en el sitio y en los tutoriales

**Aether:**
- Area: site-docs
- Owns: `site/index.html`, `site/app.js`, `docs/tutorials/first-request.md`, `docs/es/guias/primera-peticion.md`, `tests/site.test.js`, `tests/docs-facts.test.js`
- Depends on: none
- Serves: R6

**Goal:**
Reemplazar la regla vaga de «about five tool calls» / «unas cinco llamadas a herramientas» por la regla contable de 3 ediciones propias o 10 lecturas por turno en `site/index.html:221`, `site/app.js:70,237`, `docs/tutorials/first-request.md` y `docs/es/guias/primera-peticion.md:34`, dejando intactos el atributo `alt` de `site/index.html:223` y las claves `way_direct_alt` de `site/app.js:71,238`.

**Interfaces:**
- En `site/index.html` (línea 221) y `site/app.js` (`DICT.es.way_direct_p`, línea 237):
  `"Una pregunta sobre el código, un retoque de un archivo en hasta dos ediciones propias o nueve lecturas en un turno: el Lead lo hace él mismo y responde."`
- En `site/app.js` (`DICT.en.way_direct_p`, línea 70):
  `"A question about the code, a one-file tweak within two code edits of its own or nine reads in a turn: the Lead does it itself and answers."`
- En `site/index.html:223` y `site/app.js:71,238`: `alt` y `way_direct_alt` permanecen intactos.
- En `docs/tutorials/first-request.md`: reemplazar `"within about five tool calls"` por `"within two code or test edits of its own and under ten reads or searches in a turn"` y `"within about five calls"` por `"within two edits of its own and under ten reads in a turn"`.
- En `docs/es/guias/primera-peticion.md` (línea 34): reemplazar `"en unas cinco llamadas a herramientas"` por `"en hasta dos ediciones propias de código o pruebas y menos de diez lecturas o búsquedas en un turno"`.

**Tests (write first):**
Añadir en `tests/site.test.js`:

```js
test('way_direct_p states the countable rule while way_direct_alt stays unchanged', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8')
  const appSrc = fs.readFileSync(APP_JS, 'utf8')
  assert.doesNotMatch(html, /unas cinco llamadas a herramientas/)
  assert.match(html, /dos ediciones propias o nueve lecturas en un turno/)
  assert.match(appSrc, /two code edits of its own or nine reads in a turn/)
  assert.match(html, /alt="Diagrama del camino directo: Dueño a Lead, alrededor de cinco llamadas a herramientas"/)
})
```

**Acceptance:**
- `site/index.html`, `site/app.js`, `docs/tutorials/first-request.md` y `docs/es/guias/primera-peticion.md` ya no contienen `"about five tool calls"`, `"about five calls"` ni `"unas cinco llamadas a herramientas"` en el texto visible del camino directo.
- `site/index.html:223` y `way_direct_alt` en `site/app.js:71,238` permanecen intactos.
- `node --test tests/site.test.js` pasa.

---

### Task 5: Avisar una vez por resultado sin veredicto al cerrar el turno del Lead (`Stop`) e ignorar subagentes

**Aether:**
- Area: continuity
- Owns: `plugins/aether/bin/aether-continuity`, `plugins/aether/lib/continuity-hook.js`, `tests/continuity-hook.test.js`, `tests/session-start-continuity.test.js`, `tests/using-aether-030.test.js`
- Depends on: Task 1 — usa unverdictedDelegates de delegate-report.js para consultar los resultados sin veredicto de la sesión
- Serves: R1, R12

**Goal:**
En `plugins/aether/bin/aether-continuity` y `plugins/aether/lib/continuity-hook.js`, ignorar por completo cualquier invocación desde un subagente (`input.agent_id` presente o `input.agent_type` distinto de `'aether:lead'`) y, cuando el verbo es `stop` en la sesión del Lead, emitir un aviso no bloqueante (`additionalContext`) una sola vez por cada intento de tarea delegada de esa sesión que tenga resultado llegado y carezca de `verdict`.

**Interfaces:**
En `plugins/aether/bin/aether-continuity`:
- Si `input.agent_id` está presente o (`input.agent_type` está definido y `input.agent_type !== 'aether:lead'`), salir con `process.exit(0)` antes de llamar a cualquier manejador.
En `plugins/aether/lib/continuity-hook.js`:
- `isSubagentInput(input)`: devuelve `true` cuando `Boolean(input && (input.agent_id || (input.agent_type && input.agent_type !== 'aether:lead')))`. Si es `true`, `dispatch` devuelve `{}` sin tocar disco.
- `unverdictedStopMessage(items, es)`: formatea el aviso no bloqueante:
  - En inglés (`es === false`):
    `"Aether continuity: delegated task result(s) arrived without a verdict in this session: <lista de task (attempt N)>. Judge each result and run: aether-delegate verdict --task <id> --verdict approve|fix|infeasible (with --summary and --findings when needed) before closing the work."`
  - En español (`es === true`):
    `"Continuidad de Aether: hay resultado(s) de tareas delegadas sin veredicto en esta sesión: <lista de task (attempt N)>. Juzga cada resultado y ejecuta: aether-delegate verdict --task <id> --verdict approve|fix|infeasible (con --summary y --findings cuando corresponda) antes de dar el trabajo por cerrado."`
- En `stop(input, opts = {})`:
  - Actualiza la nota de continuidad como hasta ahora (`open: false`, `lastEvent: 'Stop'`, etc.) sin añadir campos extra cuando no hay resultados sin veredicto.
  - Consulta `unverdictedDelegates({ dataDir, session: sid })`.
  - Filtra los elementos cuya clave `${item.task}@${item.attempt}` no esté en `existing.notifiedUnverdicted` (arreglo opcional en la nota de continuidad).
  - Si hay elementos nuevos sin veredicto, guarda en la nota `notifiedUnverdicted: [...prevNotified, ...newKeys]` y devuelve `{ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: unverdictedStopMessage(fresh, store.isSpanish(opts.env)) } }`.
  - Si no hay elementos nuevos sin veredicto, devuelve `{}`.
- Exportar `unverdictedStopMessage` junto con `openNote`, `stop`, `precompact`, `postcompact`, `stopfailure`, `sessionend`, `dispatch`.

**Tests (write first):**
Añadir en `tests/continuity-hook.test.js`:

```js
test('stop warns once per unverdicted delegate result in the Lead session and stays silent on repeat or subagent', (t) => {
  const w = makeWorkspace(t)
  store.markLeadSession(w.dataDir, 's-lead')
  const { appendEntry } = require(path.join(PLUGIN_ROOT, 'lib', 'delegate-log.js'))
  appendEntry(w.dataDir, {
    time: 10,
    session: 's-lead',
    task: 'fix-bug',
    attempt: 1,
    step: 'sonnet',
    launchKind: 'first',
    description: 'fix bug',
    effort: 'medium',
    edits: true,
    kind: 'launch',
  })
  appendEntry(w.dataDir, {
    time: 20,
    session: 's-lead',
    task: 'fix-bug',
    attempt: 1,
    ok: true,
    status: 'done',
    kind: 'result',
  })

  const subRes = runCli('stop', {
    session_id: 's-lead',
    agent_id: 'sub-1',
    cwd: w.dir,
  }, w.env)
  assert.equal(subRes.status, 0)
  assert.equal(subRes.stdout, '')

  const first = runCli('stop', { session_id: 's-lead', cwd: w.dir }, w.env)
  assert.equal(first.status, 0)
  const out1 = JSON.parse(first.stdout)
  assert.equal(out1.hookSpecificOutput.hookEventName, 'Stop')
  assert.match(out1.hookSpecificOutput.additionalContext, /fix-bug/)
  assert.match(out1.hookSpecificOutput.additionalContext, /aether-delegate verdict/)

  const second = runCli('stop', { session_id: 's-lead', cwd: w.dir }, w.env)
  assert.equal(second.status, 0)
  assert.equal(second.stdout, '')

  appendEntry(w.dataDir, {
    time: 30,
    session: 's-lead',
    task: 'fix-bug',
    attempt: 1,
    step: 'sonnet',
    verdict: 'fix',
    next: { step: 'sonnet', kind: 'fix', cause: 'fix' },
    kind: 'verdict',
  })
  appendEntry(w.dataDir, {
    time: 40,
    session: 's-lead',
    task: 'fix-bug',
    attempt: 2,
    step: 'sonnet',
    launchKind: 'fix',
    description: 'fix bug',
    effort: 'high',
    edits: true,
    kind: 'launch',
  })
  appendEntry(w.dataDir, {
    time: 50,
    session: 's-lead',
    task: 'fix-bug',
    attempt: 2,
    ok: true,
    status: 'done',
    kind: 'result',
  })
  const third = runCli('stop', { session_id: 's-lead', cwd: w.dir }, { ...w.env, AETHER_LANG: 'es' })
  assert.equal(third.status, 0)
  const out3 = JSON.parse(third.stdout)
  assert.match(out3.hookSpecificOutput.additionalContext, /Continuidad de Aether/)
  assert.match(out3.hookSpecificOutput.additionalContext, /fix-bug \(attempt 2\)/)
})
```

**Acceptance:**
- Cuando una tarea delegada de la sesión del Lead tiene resultado llegado y no tiene `verdict`, `aether-continuity stop` devuelve `additionalContext` nombrando la tarea y `aether-delegate verdict` en el primer `Stop`, y no repite el aviso en un segundo `Stop` del mismo intento.
- Si un nuevo intento (`attempt: 2`) llega sin veredicto, `Stop` vuelve a avisar una vez.
- Si `input.agent_id` está presente o la sesión no es del Lead, `aether-continuity` sale con 0 y sin salida ni escrituras.
- `node --test tests/continuity-hook.test.js tests/session-start-continuity.test.js` pasa.

---

### Task 6: Rechazar lanzamientos por tope o pausa en `aether-delegate begin` y `aether-plan compile`

**Aether:**
- Review: xhigh — impide que el delegado o el enjambre lancen agentes cuando el tope de tiempo, el tope de gasto o el freno de cuota de una corrida autónoma están activos
- Area: autonomy-gates
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/plan-compile.js`, `tests/delegate-*.test.js`, `tests/ladder-one-source.test.js`, `tests/baseline.test.js`
- Depends on: Task 2 — usa autonomy.launchRefusal para comprobar si hay una corrida abierta con stop en time, cost o quota
- Serves: R3

**Goal:**
Hacer que `aether-delegate begin` (`plugins/aether/lib/delegate-task.js`) y `aether-plan compile` (`plugins/aether/lib/plan-compile.js`) comprueben `autonomy.launchRefusal` y rechacen lanzar trabajo nuevo cuando hay una corrida abierta con `stop` en `'time'`, `'cost'` o `'quota'`, nombrando el `id` de la corrida, el tope o pausa y el comando `aether-autonomy end`.

**Interfaces:**
1. En `plugins/aether/lib/delegate-task.js`:
   - `autonomyRefusedPlan(r, ctx, refusal)`: construye `prompt = \`Aether delegate task \${ctx.id} was not launched: \${refusal.message}. Do not do any work. Tell the Lead why the launch was refused.\`` y llama a `refusedLaunchPlan(r, ctx, prompt, prompt)` añadiendo `stop: refusal.stop` y `run: refusal.id` al plan devuelto.
   - En `begin(input, deps = {})`: tras construir `ctx` (antes de comprobar `next.status` o cargar skills), llamar a `autonomy.launchRefusal(r.cwd, { now: r.now() })`. Si devuelve un objeto `refusal`, retornar `autonomyRefusedPlan(r, ctx, refusal)`.
2. En `plugins/aether/lib/plan-compile.js`:
   - En `compile(planArg, rest, { cwd, stdout } = {})`: tras resolver `repo.mainRoot`, llamar a `autonomy.launchRefusal(repo.mainRoot)`.
   - Si devuelve `refusal`, llamar a `fail([refusal.message], [], stdout)` (sale con código 1 e imprime `{ ok: false, errors: [refusal.message], warnings: [] }`).

**Tests (write first):**
1. Añadir en `tests/delegate-task.test.js`:

```js
test('begin refuses to launch a delegate when an open autonomous run hit time, cost, or quota stop', async (t) => {
  const { makeTempGitRepo } = require('./helpers.js')
  const autonomy = require(path.join(PLUGIN_ROOT, 'lib', 'autonomy.js'))
  const repo = makeTempGitRepo(t)
  const dataDir = tempDir(t, 'aether-del-autonomy-')
  const configDir = tempDir(t, 'aether-cfg-autonomy-')
  const projDir = path.join(configDir, 'projects', 'proj-del')
  fs.mkdirSync(projDir, { recursive: true })
  fs.writeFileSync(
    path.join(projDir, 'sess-1.jsonl'),
    JSON.stringify({
      type: 'user',
      entrypoint: 'sdk-cli',
      timestamp: '2026-04-12T10:00:00.000Z',
      message: { role: 'user', content: 'run unattended for 1 hour' },
    }) + '\n'
  )

  const started = autonomy.start(
    repo,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 1, usd: 5 },
    { configDir, now: Date.parse('2026-04-12T10:00:00.000Z') }
  )
  assert.equal(started.ok, true)

  const plan = await begin(
    {
      session: 'sess-1',
      event: {
        description: 'build feature',
        prompt: 'AETHER-TASK: build-feature\nImplement feature',
      },
    },
    {
      dataDir,
      configDir,
      cwd: repo,
      settings: { enabled: false },
      now: () => Date.parse('2026-04-12T11:05:00.000Z'),
    }
  )
  assert.equal(plan.kind, 'refused')
  assert.equal(plan.stop, 'time')
  assert.equal(plan.run, started.run.id)
  assert.match(plan.notes.join('\n'), /aether-autonomy end --outcome ceiling/)
})
```

2. Añadir en `tests/baseline.test.js`:

```js
test('aether-plan compile refuses when an open autonomous run has reached a ceiling', (t) => {
  const repo = makeTempGitRepo(t)
  const autonomy = require(path.join(PLUGIN_ROOT, 'lib', 'autonomy.js'))
  const configDir = makeTempDir(t, 'aether-plan-cfg-')
  const projDir = path.join(configDir, 'projects', 'proj-plan')
  fs.mkdirSync(projDir, { recursive: true })
  fs.writeFileSync(
    path.join(projDir, 'sess-p.jsonl'),
    JSON.stringify({
      type: 'user',
      entrypoint: 'sdk-cli',
      timestamp: '2026-04-12T10:00:00.000Z',
      message: { role: 'user', content: 'work unattended for 1 hour' },
    }) + '\n'
  )
  const started = autonomy.start(
    repo,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 1 },
    { configDir, now: Date.now() - 2 * 3600 * 1000 }
  )
  assert.equal(started.ok, true)

  execFileSync('git', ['checkout', '-b', 'feat/test-compile'], { cwd: repo, stdio: 'ignore' })
  const tasksFile = path.join(repo, 'tasks.md')
  fs.writeFileSync(
    tasksFile,
    [
      '# Tasks: Demo',
      '## Aether Execution',
      '- Test command: `npm test`',
      '- Max agents: 10',
      '### Task 1: Demo',
      '**Aether:**',
      '- Area: core',
      '- Owns: `src/a.js`, `tests/a.test.js`',
      '- Depends on: none',
      '- Serves: R1',
      '**Goal:** demo',
      '**Interfaces:** demo',
      '**Tests (write first):** demo',
      '**Acceptance:** demo',
    ].join('\n')
  )
  const res = spawnSync(
    process.execPath,
    [path.join(PLUGIN_ROOT, 'bin', 'aether-plan'), 'compile', tasksFile],
    { cwd: repo, encoding: 'utf8' }
  )
  assert.notEqual(res.status, 0)
  const body = JSON.parse(res.stdout)
  assert.equal(body.ok, false)
  assert.match(body.errors[0], new RegExp(started.run.id))
  assert.match(body.errors[0], /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- Con una corrida autónoma abierta cuyo `stop` es `'time'`, `'cost'` o `'quota'`, `aether-delegate begin` devuelve un plan `refused` con el `id` de la corrida, el motivo y `aether-autonomy end`, y `aether-plan compile` falla con código distinto de 0 y el mismo mensaje claro.
- Sin corrida abierta o con `stop: null`, ambos comandos funcionan como antes.
- `node --test tests/delegate-task.test.js tests/baseline.test.js` pasa.

---

### Task 7: Rechazar `/aether:design` por tope o pausa e incluir `skill: 'aether:designing'` en su salida

**Aether:**
- Review: xhigh — impide que `/aether:design` lance asientos externos o nativos cuando una corrida autónoma superó su tope o está en pausa por cuota
- Area: design-workflow
- Owns: `plugins/aether/lib/seat-calls.js`, `plugins/aether/workflows/design.workflow.js`, `tests/seat-calls.test.js`, `tests/layout-work.test.js`, `tests/workflow-design.test.js`
- Depends on: Task 2 — usa autonomy.launchRefusal en seatStart para bloquear asientos cuando stop está en time, cost o quota
- Serves: R3, R9

**Goal:**
1. En `plugins/aether/lib/seat-calls.js` (`seatStart`), comprobar `autonomy.launchRefusal(cwd)` antes de iniciar un asiento; si hay rechazo, devolver `{ started: false, refused: true, stop: refusal.stop, run: refusal.id, reason: refusal.message }`.
2. En `plugins/aether/workflows/design.workflow.js`, cuando `seat-start` devuelve `refused: true`, abortar de inmediato sin caer al agente nativo de Claude y devolver `{ status: 'failed', step, reason: started.reason, stop: started.stop, run: started.run, skill: 'aether:designing' }`. Además, incluir `skill: 'aether:designing'` en toda salida de `/aether:design` (R9).

**Interfaces:**
1. En `plugins/aether/lib/seat-calls.js`:
   - En `seatStart(opts)`: antes de resolver el motor o crear el worktree del asiento, llamar a `autonomy.launchRefusal(cwd, { now: opts.now })`.
   - Si devuelve `refusal`, retornar `{ started: false, refused: true, stop: refusal.stop, run: refusal.id, reason: refusal.message }`.
2. En `plugins/aether/workflows/design.workflow.js`:
   - En `withMeta(payload)`: incluir `skill: 'aether:designing'` en el objeto devuelto.
   - En la validación inicial de `folder`: incluir `skill: 'aether:designing'` en `{ status: 'failed', reason: ..., skill: 'aether:designing' }`.
   - En `runSeatRound`: si `started && started.refused`, devolver `{ ok: false, refused: true, stop: started.stop, run: started.run, error: started.reason || 'autonomous run ceiling reached' }`.
   - En `runStep` / flujo principal: cuando `round.refused` es `true`, devolver de inmediato `withMeta({ status: 'failed', step, reason: round.error, stop: round.stop, run: round.run })`.

**Tests (write first):**
1. Añadir en `tests/seat-calls.test.js`:

```js
test('seatStart refuses when an open autonomous run has reached a ceiling', (t) => {
  const { makeTempGitRepo } = require('./helpers.js')
  const autonomy = require(path.join(PLUGIN_ROOT, 'lib', 'autonomy.js'))
  const { seatStart } = require(path.join(PLUGIN_ROOT, 'lib', 'seat-calls.js'))
  const repo = makeTempGitRepo(t)
  const configDir = makeTempDir(t, 'aether-seat-cfg-')
  const projDir = path.join(configDir, 'projects', 'proj-seat')
  fs.mkdirSync(projDir, { recursive: true })
  fs.writeFileSync(
    path.join(projDir, 'sess-s.jsonl'),
    JSON.stringify({
      type: 'user',
      entrypoint: 'sdk-cli',
      timestamp: '2026-04-12T10:00:00.000Z',
      message: { role: 'user', content: 'run unattended for 1 hour' },
    }) + '\n'
  )
  const started = autonomy.start(
    repo,
    { quote: 'run unattended for 1 hour', session: 'sess-s', hours: 1 },
    { configDir, now: Date.parse('2026-04-12T10:00:00.000Z') }
  )
  assert.equal(started.ok, true)

  const res = seatStart({
    role: 'writer',
    step: 'spec',
    folder: 'specs/001-demo',
    cwd: repo,
    now: Date.parse('2026-04-12T11:05:00.000Z'),
  })
  assert.equal(res.started, false)
  assert.equal(res.refused, true)
  assert.equal(res.stop, 'time')
  assert.equal(res.run, started.run.id)
  assert.match(res.reason, /aether-autonomy end --outcome ceiling/)
})
```

2. Añadir en `tests/workflow-design.test.js`:

```js
test('design workflow aborts immediately without native fallback when seat-start is refused by ceiling and includes skill aether:designing', async () => {
  let writerCalled = false
  const ctx = makeCtx({
    onOps(cmd) {
      if (cmd.includes('seat-start')) {
        return {
          started: false,
          refused: true,
          stop: 'cost',
          run: 'run-cost-1',
          reason: 'autonomous run run-cost-1 reached its spend ceiling ($5 / $5); close it with: aether-autonomy end --outcome ceiling',
        }
      }
      return { ok: true }
    },
    onWriter() {
      writerCalled = true
      return {}
    },
  })
  const out = await workflow.run(ctx, { folder: 'specs/031-demo' })
  assert.equal(writerCalled, false)
  assert.equal(out.status, 'failed')
  assert.equal(out.stop, 'cost')
  assert.equal(out.run, 'run-cost-1')
  assert.equal(out.skill, 'aether:designing')
  assert.match(out.reason, /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- Cuando `seatStart` detecta `launchRefusal`, devuelve `refused: true` con `stop`, `run` y `reason`, y `design.workflow.js` termina de inmediato sin invocar al agente nativo de Claude.
- Toda respuesta de `design.workflow.js` incluye `skill: 'aether:designing'`.
- `node --test tests/seat-calls.test.js tests/workflow-design.test.js tests/layout-work.test.js` pasa.

---

### Task 8: Avisar una vez por turno en `PostToolUse` al llegar a 3 ediciones propias o 10 lecturas

**Aether:**
- Area: continuity
- Owns: `plugins/aether/lib/continuity-posttool.js`, `tests/continuity-posttool.test.js`, `tests/continuity-posttool-skills.test.js`, `tests/tree-check.test.js`
- Depends on: Task 1 — corre en la ola de continuidad junto con el aviso de delegados
- Serves: R7, R12

**Goal:**
Añadir en `plugins/aether/lib/continuity-posttool.js` el conteo por turno de ediciones propias de código/pruebas (`DIRECT_EDIT_LIMIT = 3`) y de lecturas/búsquedas (`DIRECT_READ_LIMIT = 10`) en la sesión del Lead, emitiendo un aviso no bloqueante (`additionalContext`) una sola vez por turno al alcanzar cualquiera de los dos límites.

**Interfaces:**
En `plugins/aether/lib/continuity-posttool.js`:
- Constantes exportadas: `DIRECT_EDIT_LIMIT = 3`, `DIRECT_READ_LIMIT = 10`.
- Estado por sesión en `<dataDir>/continuity/<session>.json`: `{ promptId: string | null, sinceStopAt: string | null, edits: number, reads: number, notified: boolean }`.
  - Se reinicia a `{ promptId, sinceStopAt, edits: 0, reads: 0, notified: false }` cuando cambia `input.prompt_id` (si viene definido) o cuando la nota de continuidad en `<memoryDir>/continuity/<session>.json` tiene `lastEvent === 'Stop'` con un `updatedAt` distinto del `sinceStopAt` guardado.
- Clasificación de llamadas a herramientas (solo cuando `!input.agent_id` y `(!input.agent_type || input.agent_type === 'aether:lead')`):
  - `isExemptWriteTarget(targetPath, cwd, memoryDir)`: devuelve `true` si la ruta normalizada relativa a `cwd` (o absoluta) cae bajo `.aether/`, `.specify/`, `specs/`, `docs/`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `/dev/null` o dentro de `memoryDir`.
  - `isDirectCodeEdit(input, opts)`: devuelve `true` cuando:
    - `tool_name` es `'Write'`, `'Edit'`, `'MultiEdit'` o `'NotebookEdit'` y `tool_input.file_path || tool_input.notebook_path` existe y no es exento según `isExemptWriteTarget`; o
    - `tool_name === 'Bash'` y `writeTargets(command)` (de `guard.js`) devuelve al menos una ruta que no es exenta según `isExemptWriteTarget`.
  - `isTestOrAetherCommand(command)`: devuelve `true` cuando el comando `Bash` es una corrida de pruebas (`npm test`, `npm run test`, `npm run check`, `npm run validate`, `node --test`, `pytest`, `jest`, `vitest`, `cargo test`, `go test`) o invoca un binario `aether-*`.
  - `isDirectReadOrSearch(input)`: devuelve `true` cuando:
    - `tool_name` es `'Read'`, `'Grep'` o `'Glob'`; o
    - `tool_name === 'Bash'`, `writeTargets(command)` está vacío, `!isTestOrAetherCommand(command)` y el comando invoca un comando de lectura o búsqueda (`READ_COMMANDS` de `guard.js`, `sed`, `awk`, `find`, `rg`, `grep`, `cat`, `head`, `tail`, `wc`, `ls`, `git grep`, `git show`, `git diff`, `git log`, `git status`).
- Cuando `edits === DIRECT_EDIT_LIMIT` o `reads === DIRECT_READ_LIMIT` y `state.notified === false`:
  - Marca `state.notified = true`, guarda el estado y devuelve el aviso en inglés o en español según `store.isSpanish(opts.env)` indicando que se alcanzó el límite del camino directo en este turno (`3` ediciones propias o `10` lecturas/búsquedas) y que el resto del cambio o investigación debe delegarse con `Agent`.

**Tests (write first):**
Añadir en `tests/continuity-posttool.test.js`:

```js
test('posttool warns once on the 3rd direct code edit in a turn and ignores exempt paths and subagents', (t) => {
  const w = makeWorkspace(t)
  store.markLeadSession(w.dataDir, 's-edit')

  for (const exempt of [
    path.join(w.dir, 'specs', '031-demo', 'intent.md'),
    path.join(w.dir, '.aether', 'journal.md'),
    path.join(w.dir, 'docs', 'guide.md'),
    path.join(w.dir, 'CLAUDE.md'),
  ]) {
    const r = posttool(
      { session_id: 's-edit', prompt_id: 'p1', cwd: w.dir, tool_name: 'Write', tool_input: { file_path: exempt } },
      w.opts
    )
    assert.deepEqual(r, {})
  }

  const sub = posttool(
    { session_id: 's-edit', agent_id: 'sub-1', prompt_id: 'p1', cwd: w.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.dir, 'src', 'a.js') } },
    w.opts
  )
  assert.deepEqual(sub, {})

  const e1 = posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.dir, 'src', 'a.js') } },
    w.opts
  )
  assert.deepEqual(e1, {})

  const e2 = posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.dir, tool_name: 'Write', tool_input: { file_path: path.join(w.dir, 'tests', 'a.test.js') } },
    w.opts
  )
  assert.deepEqual(e2, {})

  const e3 = posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.dir, tool_name: 'Bash', tool_input: { command: 'echo "x" > src/b.js' } },
    w.opts
  )
  assert.ok(e3.hookSpecificOutput)
  assert.match(e3.hookSpecificOutput.additionalContext, /3/)
  assert.match(e3.hookSpecificOutput.additionalContext, /delegate|Agent/i)

  const e4 = posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.dir, 'src', 'c.js') } },
    w.opts
  )
  assert.deepEqual(e4, {})

  const nextTurn = posttool(
    { session_id: 's-edit', prompt_id: 'p2', cwd: w.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.dir, 'src', 'a.js') } },
    w.opts
  )
  assert.deepEqual(nextTurn, {})
})

test('posttool warns once on the 10th read or search in a turn and ignores test runs', (t) => {
  const w = makeWorkspace(t)
  store.markLeadSession(w.dataDir, 's-read')

  for (let i = 0; i < 5; i++) {
    const testRun = posttool(
      { session_id: 's-read', prompt_id: 'p1', cwd: w.dir, tool_name: 'Bash', tool_input: { command: 'npm test' } },
      w.opts
    )
    assert.deepEqual(testRun, {})
  }

  for (let i = 1; i <= 9; i++) {
    const r = posttool(
      {
        session_id: 's-read',
        prompt_id: 'p1',
        cwd: w.dir,
        tool_name: i % 2 === 0 ? 'Read' : 'Bash',
        tool_input: i % 2 === 0 ? { file_path: path.join(w.dir, 'src', 'a.js') } : { command: 'rg foo src/' },
      },
      w.opts
    )
    assert.deepEqual(r, {})
  }

  const tenth = posttool(
    { session_id: 's-read', prompt_id: 'p1', cwd: w.dir, tool_name: 'Grep', tool_input: { pattern: 'foo' } },
    { ...w.opts, env: { ...w.opts.env, AETHER_LANG: 'es' } }
  )
  assert.ok(tenth.hookSpecificOutput)
  assert.match(tenth.hookSpecificOutput.additionalContext, /10/)
})
```

**Acceptance:**
- `posttool` avisa en la 3.ª edición propia de código o pruebas o en la 10.ª lectura/búsqueda del mismo turno (incluyendo `Bash` con redirecciones/`sed -i`/`tee` o lecturas `cat`/`rg`/`grep`/`find`) y no vuelve a avisar en el resto del turno.
- Las escrituras en `intent.md`, `.aether/`, `.specify/`, `specs/`, `docs/`, `CLAUDE.md`, `README.md`, `AGENTS.md` y memoria, las corridas de pruebas y las herramientas de subagentes no suman al contador.
- El contador se reinicia al cambiar `prompt_id` o tras un evento `Stop` de la sesión.
- `node --test tests/continuity-posttool.test.js tests/continuity-posttool-skills.test.js` pasa.

---

### Task 9: Alinear las skills `aether:autonomous-runs` y `aether:swarm` con el rechazo automático y con #214

**Aether:**
- Area: skills
- Owns: `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `tests/autonomous-runs-skill.test.js`, `tests/workflow-review-once.test.js`, `tests/workflow-split.test.js`, `tests/codex-docs.test.js`
- Depends on: Task 2 — referencia la compuerta de plan mode en aether-autonomy start y el rechazo por topes
- Depends on: Task 4 — comparte tests/docs-facts.test.js que lee la skill autonomous-runs
- Serves: R4, R11

**Goal:**
Actualizar `plugins/aether/skills/autonomous-runs/SKILL.md` y `plugins/aether/skills/swarm/SKILL.md` para quitar la instrucción de correr `aether-autonomy status` antes de cada lanzamiento, explicar cómo actuar cuando `aether-delegate begin`, `aether-plan compile` o `/aether:design` rechazan un lanzamiento por tope o pausa, reflejar la compuerta de plan mode en sesiones interactivas y corregir los puntos de #214 en `plugins/aether/skills/swarm/SKILL.md`.

**Interfaces:**
1. En `plugins/aether/skills/autonomous-runs/SKILL.md`:
   - En `## How you start a run`: explicar que en una sesión interactiva debes presentar el plan en plan mode (`ExitPlanMode`) y esperar la aprobación del dueño antes de correr `aether-autonomy start`, porque `aether-autonomy start` verifica la transcripción de la sesión y rechaza abrir la corrida si no consta una aprobación de `ExitPlanMode` no consumida; en una sesión sin terminal (`claude -p`, `entrypoint: "sdk-cli"`), `aether-autonomy start` verifica la cita literal del dueño como hasta ahora.
   - En `## Checking the run before new work` (renombrar o redactar): quitar la exigencia de correr `aether-autonomy status` antes de cada tarea delegada, cada ola o cada asiento. Explicar que `aether-delegate begin`, `aether-plan compile` y `/aether:design` comprueban por sí mismos si hay una corrida abierta con `stop` en `time`, `cost` o `quota` y rechazan lanzar trabajo nuevo indicando la corrida y el comando para cerrarla (`aether-autonomy end --outcome ceiling` en topes de tiempo o gasto; esperar hasta `resumeAt` o cerrar con `aether-autonomy end --outcome incomplete` en pausa por cuota; o `aether-autonomy end --outcome ceiling|incomplete|done` si una corrida vieja de otra sesión quedó abierta). `aether-autonomy status` queda como herramienta de consulta cuando el Lead o el dueño quieran inspeccionar el tiempo, gasto o cuota.
2. En `plugins/aether/skills/swarm/SKILL.md`:
   - Quitar la exigencia de correr `aether-autonomy status` antes de cada ola y explicar qué hacer cuando `aether-plan compile` rechaza por tope o pausa (`stop` en `time`, `cost` o `quota`).
   - Mantener la regla `"Never run the swarm on main."` añadiendo que `aether-plan compile` tiene la bandera `--allow-main` para cuando el dueño pida explícitamente compilar en `main`, sin invitar a usarla por cuenta propia.
   - En `## Running the workflow` / fusiones: nombrar `aether-wt settle <run-dir> <wave-num> <task-id> <branch> --test-cmd "<cmd>"` cuando una fusión se corta a los 600 segundos (`merge timed out after 600s`) para inspeccionar o terminar el merge antes de decidir.
   - En `## After the workflow returns` y `## Escalation ladder`:
     - Explicar que `"the supervisor failed 3 times in a row"` ocurre cuando el supervisor termina tres veces sin devolver respuesta, mientras que un veredicto inválido (`verdict` que no es `approve`, `retry` ni `impossible`, o `retry` sin `findings`) cuenta como un intento `retry` de la tarea.
     - Explicar que el 2.º y 3.er intento del supervisor corren siempre en Claude y que un supervisor o revisor final de Claude que permanezca callado 900 segundos se abandona.
     - Explicar que un hallazgo del supervisor que no nombra ningún archivo recibe el primer archivo listado en el `Owns` de la tarea.

**Tests (write first):**
Actualizar y añadir en `tests/autonomous-runs-skill.test.js`:

```js
test('autonomous-runs and swarm skills describe automatic ceiling refusal and #214 rules', () => {
  const autoText = fs.readFileSync(SKILL_PATH, 'utf8')
  const swarmText = fs.readFileSync(
    path.join(PLUGIN_ROOT, 'skills', 'swarm', 'SKILL.md'),
    'utf8'
  )

  assert.match(autoText, /ExitPlanMode/)
  assert.match(autoText, /aether-delegate begin/)
  assert.match(autoText, /aether-plan compile/)
  assert.match(autoText, /aether-autonomy end --outcome ceiling/)
  assert.doesNotMatch(autoText, /Before you launch a new delegated task, a new swarm wave, or a new design seat, check the run/)

  assert.match(swarmText, /Never run the swarm on `main`/)
  assert.match(swarmText, /--allow-main/)
  assert.match(swarmText, /aether-wt settle/)
  assert.match(swarmText, /900/)
  assert.match(swarmText, /first file in the task's `Owns`|first path in the task's `Owns`/i)
})
```

**Acceptance:**
- `plugins/aether/skills/autonomous-runs/SKILL.md` y `plugins/aether/skills/swarm/SKILL.md` ya no piden correr `aether-autonomy status` antes de cada lanzamiento y explican cómo responder al rechazo automático de `aether-delegate begin`, `aether-plan compile` y `/aether:design`.
- `plugins/aether/skills/swarm/SKILL.md` cubre los 6 puntos de #214 (R4 y R11).
- `node --test tests/autonomous-runs-skill.test.js tests/workflow-review-once.test.js tests/workflow-split.test.js` pasa.

---

### Task 10: Hacer independientes del orden las partes de `aether-session-start`, reducir `hooks.json` a 3 partes y actualizar `using-aether`

**Aether:**
- Area: bootstrap
- Owns: `plugins/aether/lib/session-start.js`, `plugins/aether/hooks/hooks.json`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/helpers.js`, `tests/*.test.js`
- Depends on: Task 3 — requiere que las skills models y designing existan antes de resumirlas en using-aether
- Depends on: Task 5 — comparte las entradas del archivo de hooks y las pruebas de arranque
- Depends on: Task 8 — actualiza el matcher de PostToolUse en el archivo de hooks para el conteo por turno
- Depends on: Task 9 — alinea las referencias de autonomía y enjambre y las pruebas de documentación
- Serves: R6, R8, R9, R10

**Goal:**
1. En `plugins/aether/lib/session-start.js`, reemplazar `partHeading(k, n, root)` por el marco de dos líneas independiente del orden de llegada (R8), manteniendo todos los cortes en fronteras `## ` y cada salida JSON dentro de `PART_LIMIT` (9.800 caracteres).
2. En `plugins/aether/skills/using-aether/SKILL.md`, resumir `## Models` y `## Designing` remitiendo a `aether:models` y `aether:designing` (conservando las reglas permanentes), reemplazar la regla vaga de cinco llamadas por la regla contable de 3 ediciones propias o 10 lecturas por turno (R6) y aplicar las correcciones de #204 (R10), dejando el texto total inyectado en $\le 25.000$ caracteres y 3 partes.
3. En `plugins/aether/hooks/hooks.json`, dejar en `SessionStart` la entrada de notas y `--part 1`, `--part 2` y `--part 3` (quitando `--part 4` y `--part 5`), y actualizar el `matcher` de `PostToolUse` a `"Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash"`, actualizando en esta misma tarea las pruebas que inspeccionan `hooks.json`, `session-start.js` y `using-aether/SKILL.md`.

**Interfaces:**
1. En `plugins/aether/lib/session-start.js` y `tests/helpers.js`:
   ```js
   function partHeading(k, n, root = PLUGIN_ROOT) {
     const file = path.join(root, 'skills', 'using-aether', 'SKILL.md')
     return (
       [
         "You are the Lead of Aether mode: the owner's right hand.",
         `Aether mode bootstrap, part ${k} of ${n}: read all ${n} parts before you act, whatever order they arrive in; if a part from 1 to ${n} did not reach you, read the whole file ${file} before you act.`,
       ].join('\n') + '\n\n'
     )
   }
   ```
2. En `plugins/aether/hooks/hooks.json`:
   - `SessionStart.hooks`: 4 comandos (`aether-session-start`, `--part 1`, `--part 2`, `--part 3`).
   - `PostToolUse`: `matcher: "Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash"`.
3. En `plugins/aether/skills/using-aether/SKILL.md`:
   - En `## How you work` y `## Delegating a task`: reemplazar `"about five tool calls"` y `"many reads of your own"` por la regla contable: en un turno, como máximo 2 ediciones propias de código o pruebas (en la 3.ª edición propia el trabajo pasa a un delegado) y menos de 10 llamadas de lectura o búsqueda (`Read`, `Grep`, `Glob` o `Bash` de lectura/búsqueda; en la 10.ª lectura el trabajo pasa a un delegado). Quedan fuera de ese conteo las escrituras en el diario, `specs/NNN-<topic>/intent.md`, documentos en `specs/` o `docs/`, memoria y las corridas de pruebas.
   - En `## Models`: conservar las prohibiciones de no adivinar nombres de modelos ni precios desde los pesos y las rutas a `models.json` y `prices.json` bajo `${CLAUDE_PLUGIN_ROOT}/config`, e indicar cargar la skill `aether:models` antes de responder sobre capacidades, esfuerzos o citas del fabricante.
   - En `## Designing`: conservar qué es diseñar, la prohibición de no escribir `spec.md`, `plan.md`, `tasks.md` ni `art-direction.md` sin `/aether:design` (salvo diseño corto pedido por el dueño), las referencias a `aether:writer`, `aether:judge` (`At most two revisions per document`), `.aether/pending.jsonl`, `specs/NNN-<topic>/intent.md`, `/aether:design`, `aether-report --seats`, `aether-exam run` (`aether:examiner`) y `aether-exam store specs/NNN-<topic>`, e indicar cargar la skill `aether:designing` antes de redactar `intent.md`, lanzar `/aether:design` o procesar su respuesta.
   - En `## Delegating a task` (puntos de #204, R10):
     - Explicar que cada llamada a `Agent` cuyo `subagent_type` no sea `aether:*` (incluidos `Plan`, `claude-code-guide` o llamadas sin `subagent_type`) es una tarea delegada, entra en la escalera y espera veredicto.
     - Prohibir pasar `fork` en una tarea delegada porque la herramienta `Agent` ignora `model` en un fork y correría en el modelo del Lead con toda su conversación.
     - Explicar que `fix` corre en el mismo modelo al esfuerzo de corrección del escalón definido en `ladder.json` bajo `${CLAUDE_PLUGIN_ROOT}/config` (no «one effort up»).
     - Incluir `--ignore <glob>` en `aether-delegate verdict` para archivos sucios ajenos a la tarea.
     - Explicar que relanzar un `task` id ya aprobado o agotado lanza un agente mínimo en Haiku que informa que la tarea ya terminó y que debe abrirse un nuevo `task` id.
     - Explicar que en `AETHER-SKILLS:`, pasar más de 3 skills, un nombre desconocido o una skill que supere el límite de líneas rechaza el lanzamiento entero.
4. En las suites de pruebas de arranque y hooks (`session-start*`, `bootstrap-*`, `using-aether-030`, `dormant-030` y `continuity-hook`):
   - Actualizar el conteo de partes de `--part` a `3` (`4` comandos en `SessionStart`, `11` comandos totales en el archivo de hooks), el encabezado de dos líneas en cada parte y el matcher `'Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash'` de `PostToolUse`.

**Tests (write first):**
Actualizar las pruebas de arranque y bootstrap para que verifiquen:

```js
test('bootstrap splits into exactly 3 order-independent parts within 25,000 total injected chars', () => {
  const parts = bootstrapParts(PLUGIN_ROOT)
  assert.equal(parts.length, 3)
  let totalChars = 0
  for (let i = 0; i < parts.length; i++) {
    const ctx = parts[i].hookSpecificOutput.additionalContext
    totalChars += ctx.length
    assert.ok(
      ctx.startsWith(
        "You are the Lead of Aether mode: the owner's right hand.\n" +
          `Aether mode bootstrap, part ${i + 1} of 3: read all 3 parts before you act, whatever order they arrive in; if a part from 1 to 3 did not reach you, read the whole file `
      )
    )
    assert.ok(JSON.stringify(parts[i]).length <= PART_LIMIT)
  }
  assert.ok(totalChars <= 25000, `expected total injected chars <= 25000, got ${totalChars}`)
})
```

**Acceptance:**
- `bootstrapParts(PLUGIN_ROOT)` devuelve exactamente 3 partes; cada parte empieza con las dos líneas de R8, corta en frontera `## `, su JSON completo mide $\le 9.800$ caracteres (incluso con ruta de 400 caracteres) y la suma de los textos inyectados mide $\le 25.000$ caracteres.
- `plugins/aether/hooks/hooks.json` tiene 3 entradas `--part` (`1`, `2`, `3`) y ninguna entrada `--part` devuelve `{}` vacío.
- `plugins/aether/skills/using-aether/SKILL.md` contiene la regla contable (R6), remite a `aether:models` y `aether:designing` (R9) y refleja las correcciones de #204 (R10).
- Las suites `session-start*` y `bootstrap-*` pasan.

---

### Task 11: Actualizar documentación, `CLAUDE.md`, `docs/decisions.md` y huella durmiente en `docs/reference/components.md`

**Aether:**
- Area: docs
- Owns: `CLAUDE.md`, `docs/*.md`, `docs/reference/components.md`, `docs/guide/*.md`, `tests/*.js`
- Depends on: Task 6 — documenta el rechazo automático en aether-delegate begin y aether-plan compile
- Depends on: Task 7 — documenta el rechazo automático y la clave skill en /aether:design
- Depends on: Task 10 — actualiza las pruebas y guías con las 3 partes de SessionStart y el matcher de PostToolUse
- Serves: R6, R8, R9, R10, R11, R12, R13

**Goal:**
Actualizar `CLAUDE.md`, `docs/methodology.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `docs/decisions.md` y `docs/index.md` (y las pruebas de documentación y huella durmiente) para reflejar los cuatro comportamientos nuevos, las decisiones `A117`–`A120`, las 3 partes de `SessionStart`, las dos skills nuevas (`aether:designing`, `aether:models`) y la huella durmiente medida, sin tocar el changelog de la versión `0.36.0`.

**Interfaces:**
1. `docs/methodology.md`: reemplazar `"about five tool calls"` por la regla contable de hasta 2 ediciones propias de código/pruebas y menos de 10 lecturas/búsquedas en un turno (R6).
2. `docs/decisions.md` y `docs/index.md`:
   - Conservar intacta la línea histórica `docs/decisions.md:236` (`about five tool calls`).
   - Añadir al final de `docs/decisions.md` las decisiones `A117` (aviso único en `Stop` e informe de delegados con resultado sin veredicto), `A118` (rechazo en código en `aether-delegate begin`, `aether-plan compile` y `/aether:design` ante tope de tiempo, gasto o pausa por cuota), `A119` (exigencia de aprobación `ExitPlanMode` en la transcripción antes de `aether-autonomy start` en sesiones interactivas) y `A120` (límite contable de 3 ediciones propias o 10 lecturas por turno con aviso único en `PostToolUse`, partes de arranque independientes del orden y extracción de `aether:designing` y `aether:models`).
   - En `docs/index.md`: actualizar el rango `A1–A116` a `A1–A120` y añadir las dos skills nuevas `aether:designing` y `aether:models` en la tabla de skills si se listan allí.
   - En `tests/docs-facts.test.js`: actualizar `LAST_DECISION = 120`.
3. `CLAUDE.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`:
   - Actualizar el número de entradas de `SessionStart` a 4 (`aether-session-start` + `--part 1` a `--part 3`, total 11 comandos de hook).
   - Documentar `aether:designing` y `aether:models` en la lista de skills.
   - Documentar `unverdicted` en `aether-report --delegates`, el aviso en `Stop`, el aviso en `PostToolUse` a las 3 ediciones o 10 lecturas, el rechazo automático por topes/pausa y la exigencia de plan mode en `aether-autonomy start` interactivo.
   - Actualizar en `docs/reference/components.md` la tabla de huella durmiente medida fuera de una sesión del Lead (0 bytes en disco, 0 bytes en `stdout`, 4 procesos cortos en `SessionStart`).
4. En `tests/using-aether-030.test.js`, `tests/dormant-030.test.js`, `tests/continuity-hook.test.js` y `tests/docs-030.test.js`:
   - Actualizar el matcher esperado de `PostToolUse` a `'Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash'`.
   - Actualizar el conteo de comandos en `SessionStart` a `4` (`--part 1` a `--part 3`) y el total de comandos a `11`, verificando que cada parte empiece con `"You are the Lead of Aether mode: the owner's right hand."`.

**Tests (write first):**
Añadir en `tests/docs-facts.test.js`:

```js
test('decisions A117 to A120 are recorded and historical line 236 stays intact', () => {
  const decisions = read('docs/decisions.md')
  assert.match(decisions, /\| A117 \|/)
  assert.match(decisions, /\| A118 \|/)
  assert.match(decisions, /\| A119 \|/)
  assert.match(decisions, /\| A120 \|/)
  assert.match(decisions, /about five tool calls/)
  const methodology = read('docs/methodology.md')
  assert.doesNotMatch(methodology, /about five tool calls/)
})
```

**Acceptance:**
- `npm test` y `npm run check` pasan al 100 % sin errores ni advertencias.
- `docs/decisions.md` conserva `"about five tool calls"` en su registro histórico de A32 y añade `A117`–`A120`.
- `tests/dormant-030.test.js` comprueba que los 11 comandos del archivo de hooks tienen huella de 0 bytes fuera de una sesión del Lead.
