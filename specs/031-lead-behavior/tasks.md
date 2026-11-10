# Tasks: Hacer cumplir por código e higiene de prompts los comportamientos del Lead (031-lead-behavior)

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Intent:** [intent.md](intent.md)

## Global Constraints

- **Node.js 22 y CommonJS sin dependencias nuevas:** todos los módulos bajo `plugins/aether/lib/` y `plugins/aether/bin/` usan CommonJS (`'use strict'`) y módulos nativos de Node.js.
- **Invariantes de `tests/guards.test.js`:** cada archivo en `plugins/aether/lib/` conserva su cabecera de 2 líneas con `// Family: <nombre>.`, sin funciones duplicadas ni exportaciones muertas.
- **Huella durmiente de 0 bytes fuera de una sesión del Lead (R12, C7):** todo hook registrado en `plugins/aether/hooks/hooks.json` sale con código 0, sin salida en `stdout`/`stderr` y sin crear ni tocar archivos cuando la sesión no pertenece al Lead de Aether o cuando corre dentro de un subagente (`input.agent_id` presente).
- **Prohibiciones del alcance (R13, `intent.md` §4):** no tocar la versión `0.35.0`, no escribir ni modificar el changelog de `0.36.0`, no hacer merge ni `git push`, no instalar el plugin y no cerrar issues en GitHub. No tocar el atributo `alt` en `site/index.html:223` ni `p.direct.a` en `site/app.js:71,238`, ni el registro histórico en `docs/decisions.md:236`.

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
Detectar en `plugins/aether/lib/delegate-report.js` las tareas delegadas cuyo último lanzamiento tiene resultado llegado (`result`, `answer` u `outcome`) y aún no tiene `verdict`, exponer funciones reutilizables `unverdictedTasks` y `unverdictedDelegates`, e incluir una única lista `unverdicted` en el nivel superior de la salida de `aether-report --delegates` sin importar si `Stop` ya avisó de ellas.

**Interfaces:**
En `plugins/aether/lib/delegate-report.js`:
- `isUnverdictedTask(entries)`: para las entradas de una tarea (que tiene al menos un `isLaunch`), toma `latest = last(entries.filter(isLaunch))` y su índice `launchIdx = entries.lastIndexOf(latest)`: devuelve `true` si después de `launchIdx` (con `entry.time >= latest.time`) existe al menos una entrada con `entry.kind === 'result'`, `entry.kind === 'answer'` o `entry.kind === 'outcome'` y no existe ninguna entrada con `entry.kind === 'verdict'` posterior a `launchIdx`.
- `unverdictedTasks(entries)`: agrupa `entries` por `taskKey(entry.session, id)` (donde `id = entry.kind === 'outcome' ? entry.id : entry.task`), filtra las tareas con `list.some(isLaunch)` y `isUnverdictedTask(list)`, y devuelve un arreglo de `{ task: id, session: latest.session ?? null, attempt: launches.length, step: latest.step ?? null }`.
- `unverdictedDelegates({ dataDir = run.dataDir(), session = null, since = 0 } = {})`: lee `readAllEntries(dataDir, { session, since })` y devuelve `unverdictedTasks(entries)`.
- `rowOfTask(id, entries)`: añade `unverdicted: isUnverdictedTask(entries)` al objeto de fila devuelto (`{ id, time, session, description, applied, ranOn, fallback, step, attempts, unverdicted, ...(authorized) }`).
- `delegatesReport({ dataDir = run.dataDir(), session = null, since = 0 } = {})`: calcula `const unverdicted = unverdictedTasks(entries)` y lo incluye una sola vez en el nivel superior (`{ delegations, unverdicted, ladder }`, sin duplicarlo dentro de `ladder`).
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
  assert.equal(Object.hasOwn(report.ladder, 'unverdicted'), false)
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
- `aether-report --delegates` devuelve una única lista `unverdicted` en el nivel superior con las tareas cuyo último intento tiene resultado llegado (`result`, `answer` u `outcome`) y no tiene `verdict`.
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
1. En `plugins/aether/lib/autonomy.js`, distinguir en sesiones del Lead (`isAetherSession(dataDir, session)`) las sesiones sin terminal (`entrypoint: "sdk-cli"`) de las sesiones interactivas al correr `start`: fuera de una sesión del Lead o en sesiones sin terminal conservar el comportamiento actual; en sesiones interactivas del Lead (o cuando la transcripción no existe, no puede leerse o no tiene `entrypoint: "sdk-cli"`) exigir que conste en la transcripción de esa sesión una aprobación válida de `ExitPlanMode` que no haya sido consumida por una corrida anterior de esa misma sesión, fallando cerrado cuando no conste.
2. Añadir y exportar `launchRefusal(mainRoot, { session, dataDir, now } = {})` en `plugins/aether/lib/autonomy.js` para que en una sesión del Lead `aether-delegate begin`, `aether-plan compile` y `seat-start` rechacen lanzar trabajo nuevo cuando hay una corrida abierta con `stop` en `'time'`, `'cost'` o `'quota'`, mientras que fuera de una sesión del Lead devuelva `null`.

**Interfaces:**
En `plugins/aether/lib/autonomy.js`:
- `readSessionRecords(configDir, sessionId)`: localiza el archivo `<sessionId>.jsonl` mediante `findSessionTranscript(configDir, sessionId)` (de `voice.js`); si no existe o no puede leerse devuelve `{ found: false, records: [] }`; si se lee, parsea cada línea JSON válida y devuelve `{ found: true, records }`.
- `isHeadlessTranscript(records)`: devuelve `true` únicamente cuando `records.length > 0`, al menos un registro tiene `r.entrypoint === 'sdk-cli'` y ningún registro con `typeof r.entrypoint === 'string'` tiene un valor distinto de `'sdk-cli'`.
- `countApprovedPlanModes(records)`: recorre los mensajes de `records` en orden; registra los `id` de bloques `tool_use` con `name === 'ExitPlanMode'` en mensajes `assistant`; y cuenta cuántos bloques `tool_result` en mensajes `user` posteriores referencian uno de esos `tool_use_id` (sin reutilizar el mismo `tool_use_id`), tienen `is_error !== true` y contienen texto (cadena en `content` o bloque `{ type: 'text', text }`) que empieza por `'User has approved your plan.'` (o contiene `\nUser has approved your plan.`).
- `countSessionRuns(root, sessionId)`: cuenta cuántos archivos `run.json` bajo `.aether/autonomy/` tienen `run.session === sessionId`.
- En `start(mainRoot, { quote, session, hours, usd } = {}, { configDir = defaultConfigDir(), dataDir = runDataDir(), now = Date.now() } = {})`:
  - Después de verificar la cita literal del dueño (`verifyOwnerQuote`) y que no haya otra corrida abierta (`openRun`), comprueba `isAetherSession(resolveDataDir(dataDir), session)` (de `./session.js`).
  - Solo cuando `isAetherSession(resolveDataDir(dataDir), session)` es `true`: lee `readSessionRecords(configDir, session)`. Si `!isHeadlessTranscript(records)`, calcula `approvals = countApprovedPlanModes(records)` y `priorRuns = countSessionRuns(root, session)`. Si `approvals <= priorRuns`, devuelve:
    `{ ok: false, reason: 'interactive session requires an approved plan in plan mode (ExitPlanMode) before starting an autonomous run; present the plan in plan mode and wait for the owner to approve it before running aether-autonomy start' }`.
  - Cuando `isAetherSession` es `false` (fuera de una sesión del Lead), no exige `ExitPlanMode` y conserva el comportamiento actual.
  - No añade campos nuevos al archivo de corrida (conserva exactamente `{ id, session, quote, quoteTime, started, ceilings, spend, brakeOff, quotaPauses, quotaCrossings, ended, outcome }`).
- `launchRefusal(mainRoot, { session = null, dataDir = runDataDir(), now = Date.now() } = {})`:
  - Primero comprueba `if (!isAetherSession(resolveDataDir(dataDir), session)) return null`.
  - Llama a `status(mainRoot, { now })`. Si `!st.open || !st.stop`, devuelve `null`.
  - Si `st.stop === 'time'`, devuelve `{ stop: 'time', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} reached its time ceiling (\${st.hours.elapsed}h / \${st.hours.ceiling}h); close it with: aether-autonomy end --outcome ceiling\` }`.
  - Si `st.stop === 'cost'`, devuelve `{ stop: 'cost', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} reached its spend ceiling ($\${st.usd.spent} / $\${st.usd.ceiling}); close it with: aether-autonomy end --outcome ceiling\` }`.
  - Si `st.stop === 'quota'`, devuelve `{ stop: 'quota', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} is paused by the quota brake (\${st.quota.percentUsed}% used; resumeAt \${st.quota.resumeAt || 'pending'}); wait until \${st.quota.resumeAt || 'the quota window resets'} or close the run with: aether-autonomy end --outcome incomplete\` }`.
- Exportar `launchRefusal` en `module.exports` de `plugins/aether/lib/autonomy.js`.

**Tests (write first):**
Añadir en `tests/autonomy.test.js` (usando los ayudantes `setup(t, sessions)`, `human(text, time, extra)`, `useDataDir(t)`, `SESSION` y `QUOTE` definidos en ese archivo, junto con `markSession` de `../plugins/aether/lib/session.js`):

```js
function planUse(toolUseId = 'toolu_plan_1', timestamp = '2026-04-06T10:00:02.000Z') {
  return JSON.stringify({
    type: 'assistant',
    entrypoint: 'cli',
    timestamp,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: 'ExitPlanMode', input: {} }],
    },
  })
}

function planResult(toolUseId = 'toolu_plan_1', approved = true, timestamp = '2026-04-06T10:00:03.000Z') {
  return JSON.stringify({
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
  })
}

test('start in a Lead session rejects interactive cli transcript without ExitPlanMode approval, succeeds once approved, refuses reuse, and leaves non-Lead sessions unchanged', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir, mainRoot, transcript } = setup(t, {
    [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' })],
  })

  // Outside a Lead session (not marked): works as today without ExitPlanMode (C7)
  const plainStart = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(plainStart.ok, true)
  autonomy.end(mainRoot, { outcome: 'done', now: Date.parse('2026-04-06T10:01:00.000Z') })
  fs.rmSync(path.join(mainRoot, '.aether', 'autonomy'), { recursive: true, force: true })

  // Mark as Lead session
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })

  const withoutPlan = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(withoutPlan.ok, false)
  assert.match(withoutPlan.reason, /plan mode/i)

  fs.writeFileSync(
    transcript(SESSION),
    [
      human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' }),
      planUse('toolu_p1'),
      planResult('toolu_p1', false),
    ].join('\n') + '\n'
  )
  const rejectedPlan = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(rejectedPlan.ok, false)

  fs.writeFileSync(
    transcript(SESSION),
    [
      human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' }),
      planUse('toolu_p1'),
      planResult('toolu_p1', true),
    ].join('\n') + '\n'
  )
  const approvedPlan = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(approvedPlan.ok, true)
  autonomy.end(mainRoot, { outcome: 'done', now: Date.parse('2026-04-06T10:10:00.000Z') })

  const reusedApproval = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:11:00.000Z') }
  )
  assert.equal(reusedApproval.ok, false)
  assert.match(reusedApproval.reason, /plan mode/i)
})

test('launchRefusal reports time, cost and quota stops in a Lead session and returns null outside a Lead session', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir, mainRoot } = setup(t, {
    [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z')],
  })
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })

  const t0 = Date.parse('2026-04-06T10:00:05.000Z')
  const started = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)
  assert.equal(autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 1000 }), null)

  // Time ceiling
  const byTime = autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 3601 * 1000 })
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.id, started.run.id)
  assert.match(byTime.message, /aether-autonomy end --outcome ceiling/)

  // Non-Lead session is not refused even when ceiling is reached
  assert.equal(autonomy.launchRefusal(mainRoot, { session: 'plain-session', dataDir, now: t0 + 3601 * 1000 }), null)

  // Quota pause
  const resetsAt = t0 + 4 * 3600 * 1000
  autonomy.recordCrossing(mainRoot, { kind: 'five_hour', percentUsed: 80, resetsAt, now: t0 + 2000 })
  const byQuota = autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 3000 })
  assert.equal(byQuota.stop, 'quota')
  assert.equal(byQuota.id, started.run.id)
  assert.match(byQuota.message, /aether-autonomy end --outcome incomplete/)

  // Spend ceiling (after quota window resets)
  autonomy.spend(mainRoot, { unit: 'u1', usd: 5, now: resetsAt + 1000 })
  const byCost = autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: resetsAt + 2000 })
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.id, started.run.id)
  assert.match(byCost.message, /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- `aether-autonomy start` permite abrir corridas en sesiones con `entrypoint: "sdk-cli"` o fuera de una sesión del Lead sin exigir plan mode.
- En sesiones del Lead con `entrypoint: "cli"`, ausente u otro valor, `aether-autonomy start` falla cerrado si no consta una aprobación válida de `ExitPlanMode` no consumida por una corrida previa de la misma sesión, y abre la corrida cuando sí consta.
- `launchRefusal` devuelve `null` fuera de una sesión del Lead o cuando no hay corrida abierta con `stop`, y devuelve `{ stop, id, hours, usd, quota, message }` en una sesión del Lead cuando `stop` es `'time'`, `'cost'` o `'quota'`.
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
   - Incluye las rutas al archivo `models.json` (bajo `${CLAUDE_PLUGIN_ROOT}/config/models`) y al archivo `prices.json` (bajo `${CLAUDE_PLUGIN_ROOT}/config`), la regla de leer ambos archivos antes de hablar de modelos o precios y no adivinar desde los pesos, y la tabla completa de modelos de la escalera (`Haiku 5.5`, `Sonnet 5.5`, `Opus 5.5`, `Fable 5.1`) con sus precios y citas del fabricante.
2. `plugins/aether/skills/designing/SKILL.md`:
   - Frontmatter YAML con `name: designing` y `description: "How the Lead prepares an intent card, runs /aether:design, and handles approved, clarify, dispute, and failed design outcomes, exams, and short designs. Load before writing intent.md, before running /aether:design, or when /aether:design returns."`.
   - Contiene el procedimiento completo de diseño: preguntas de aclaración, escritura de `specs/NNN-<topic>/intent.md`, invocación de `/aether:design`, resultados (`approved`, `clarify`, `dispute`, `failed`) incluyendo que en `approved` con `exam.status` `failed` si `.aether/exam/` tiene las pruebas se escribe `exam.json` y se corre `aether-exam store specs/NNN-<topic>`, diseño corto, cambios posteriores, registros (`aether-report --seats`) y examen (`aether-exam run`).
3. `plugins/aether/skills/skills/SKILL.md`:
   - Reemplazar `aether-autonomy trust <author> --quote "<their words>"` por `aether-autonomy trust --author <author> --quote "<their words>"`.

**Tests (write first):**
Añadir en `tests/new-skills.test.js` (usando los ayudantes `read(...parts)` y `frontMatter(text)` definidos en ese archivo):

```js
test('models and designing skills exist with valid frontmatter and expected content', () => {
  const models = read('skills', 'models', 'SKILL.md')
  const designing = read('skills', 'designing', 'SKILL.md')

  assert.equal(frontMatter(models).name, 'models')
  assert.ok(frontMatter(models).description.length > 20)
  assert.ok(models.includes(['config', 'models', 'models.json'].join('/')))
  assert.ok(models.includes(['config', 'prices.json'].join('/')))
  assert.match(models, /Haiku 5\.5/)
  assert.match(models, /Opus 5\.5/)

  assert.equal(frontMatter(designing).name, 'designing')
  assert.ok(frontMatter(designing).description.length > 20)
  assert.match(designing, /specs\/NNN-<topic>\/intent\.md/)
  assert.match(designing, /\/aether:design/)
  assert.match(designing, /aether-exam store specs\/NNN-<topic>/)
})

test('skills skill uses --author flag in aether-autonomy trust command', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  assert.match(text, /aether-autonomy trust --author <author> --quote "<their words>"/)
})
```

**Acceptance:**
- `plugins/aether/skills/models/SKILL.md` y `plugins/aether/skills/designing/SKILL.md` existen con frontmatter válido (`name` y `description`).
- `plugins/aether/skills/designing/SKILL.md` documenta `aether-exam store specs/NNN-<topic>`.
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
Reemplazar la regla vaga de «about five tool calls» / «unas cinco llamadas a herramientas» por la frase canónica de la regla contable (3 ediciones propias o 10 lecturas por turno, sin contar las pruebas tras una fusión) en `site/index.html:221`, `site/app.js:70,237`, `docs/tutorials/first-request.md:34` y `docs/es/guias/primera-peticion.md:34`, dejando intactos el atributo `alt` de `site/index.html:223` y las claves `p.direct.a` de `site/app.js:71,238`.

**Interfaces:**
- Frase canónica en español (`COUNTABLE_ES`, idéntica en todos los lugares en español):
  `"a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan"`
- Frase canónica en inglés (`COUNTABLE_EN`, idéntica en todos los lugares en inglés):
  `"at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count"`
- En `site/index.html` (línea 221, `data-i18n="p.direct.w"`) y `site/app.js` (`DICT.es['p.direct.w']`, línea 70):
  `"Una pregunta sobre el código o un retoque pequeño de un archivo: el Lead lo hace él mismo y responde; a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan."`
- En `site/app.js` (`DICT.en['p.direct.w']`, línea 237):
  `"A question about the code or a small one-file tweak: the Lead does it itself and answers; at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count."`
- En `site/index.html:223` y `site/app.js:71,238`: `alt` y `p.direct.a` permanecen intactos.
- En `docs/tutorials/first-request.md` (línea 34): reemplazar `"within about five tool calls"` para que la oración incluya literalmente `COUNTABLE_EN`:
  `"Because the change is small, in one file, the Lead takes the **direct** path and makes it itself (**at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count**). Then it runs the tests and answers you with what changed."`
- En `docs/es/guias/primera-peticion.md` (línea 34): reemplazar `"en unas cinco llamadas a herramientas"` para que la oración incluya literalmente `COUNTABLE_ES`:
  `"Como el cambio es pequeño, de un archivo, el Lead toma el camino **directo** y lo hace él mismo (**a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan**). Después corre las pruebas y te responde con lo que cambió."`

**Tests (write first):**
Añadir en `tests/site.test.js` (usando `read(SITE, ...)` definido en ese archivo):

```js
test('p.direct.w states the canonical countable rule in Spanish and English while p.direct.a alt stays unchanged', () => {
  const html = read(SITE, 'index.html')
  const appSrc = read(SITE, 'app.js')
  const esRule = 'a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan'
  const enRule = 'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  assert.ok(!html.includes('unas cinco llamadas a herramientas'))
  assert.ok(html.includes(esRule))
  assert.ok(appSrc.includes(esRule))
  assert.ok(appSrc.includes(enRule))
  assert.ok(html.includes('alt="Clawd hace cinco llamadas a herramientas en su propia sesión, de READ a RUN, y la bandera del resultado sube"'))
})
```

**Acceptance:**
- `site/index.html`, `site/app.js`, `docs/tutorials/first-request.md` y `docs/es/guias/primera-peticion.md` contienen la frase canónica exacta de su idioma (`COUNTABLE_ES` / `COUNTABLE_EN`) y ya no contienen `"about five tool calls"` ni `"unas cinco llamadas a herramientas"` en el texto visible del camino directo.
- `site/index.html:223` y `p.direct.a` en `site/app.js:71,238` permanecen intactos.
- `node --test tests/site.test.js` pasa.

---

### Task 5: Avisar una vez por resultado sin veredicto al cerrar el turno del Lead (`Stop`) e ignorar subagentes

**Aether:**
- Area: continuity
- Owns: `plugins/aether/bin/aether-continuity`, `plugins/aether/lib/continuity-hook.js`, `tests/continuity-hook.test.js`, `tests/session-start-continuity.test.js`, `tests/using-aether-030.test.js`
- Depends on: Task 1 — usa unverdictedDelegates de delegate-report.js para consultar los resultados sin veredicto de la sesión
- Serves: R1, R12

**Goal:**
En `plugins/aether/bin/aether-continuity` y `plugins/aether/lib/continuity-hook.js`, ignorar en el manejador modificado `stop` cualquier invocación desde un subagente (`Boolean(input && input.agent_id)`) y, cuando el verbo es `stop` en la sesión del Lead, emitir un aviso no bloqueante (`additionalContext`) una sola vez por cada intento de tarea delegada de esa sesión que tenga resultado llegado y carezca de `verdict`.

**Interfaces:**
En `plugins/aether/bin/aether-continuity`:
- En `main(verb)`, dentro de `if (NOTE_VERBS.has(verb))`: capturar `const out = hook.handle(verb, input, ctx)` y, cuando `verb === 'stop' && out && typeof out.additionalContext === 'string'`, imprimir `print({ hookEventName: 'Stop', additionalContext: out.additionalContext })`.
En `plugins/aether/lib/continuity-hook.js`:
- `unverdictedStopMessage(items, es)`: formatea el aviso no bloqueante:
  - En inglés (`es === false`):
    `"Aether continuity: delegated task result(s) arrived without a verdict in this session: <lista de task (attempt N)>. Judge each result and run: aether-delegate verdict --task <id> --verdict approve|fix|infeasible before closing the work."`
  - En español (`es === true`):
    `"Continuidad de Aether: hay resultado(s) de tareas delegadas sin veredicto en esta sesión: <lista de task (attempt N)>. Juzga cada resultado y ejecuta: aether-delegate verdict --task <id> --verdict approve|fix|infeasible antes de dar el trabajo por cerrado."`
- En `handle(verb, input, ctx)`:
  - Cuando `verb === 'stop' && input && input.agent_id`, retornar `null` de inmediato sin escribir la nota ni consultar delegados (guarda limitada al manejador modificado `stop`).
  - Actualizar la nota de continuidad como hasta ahora sin añadir campos extra cuando no hay resultados sin veredicto.
  - Cuando `verb === 'stop'`, consultar `unverdictedDelegates({ dataDir: ctx.dataDir, session })` (donde `ctx.dataDir = dataDir(ctx.env)` si no viene en `ctx`).
  - Filtrar los elementos cuya clave `${item.task}@${item.attempt}` no esté en `prior.notifiedUnverdicted` (arreglo opcional en la nota de continuidad).
  - Si hay elementos nuevos sin veredicto, guardar en la nota `notifiedUnverdicted: [...prevNotified, ...newKeys]` y devolver `{ additionalContext: unverdictedStopMessage(fresh, store.isSpanish(ctx.env)) }`.
  - Si no hay elementos nuevos sin veredicto, devolver `null`.
- Exportar `unverdictedStopMessage` junto con `handle`, `lastUserMessage`, `lastSkill`, `processTag`.

**Tests (write first):**
Añadir en `tests/continuity-hook.test.js` (usando los ayudantes `world(t)` y `run(w, verb, input, extra)` definidos en ese archivo):

```js
test('stop warns once per unverdicted delegate result in the Lead session and stays silent on repeat or subagent', (t) => {
  const w = world(t)
  const log = require('../plugins/aether/lib/delegate-log.js')
  log.appendEntry(w.data, {
    time: 10,
    session: 's1',
    task: 'fix-bug',
    attempt: 1,
    step: 'sonnet',
    launchKind: 'first',
    description: 'fix bug',
    effort: 'medium',
    edits: true,
    kind: 'launch',
  })
  log.appendEntry(w.data, {
    time: 20,
    session: 's1',
    task: 'fix-bug',
    attempt: 1,
    ok: true,
    status: 'done',
    kind: 'result',
  })

  const subRes = run(w, 'stop', { agent_id: 'sub-1' })
  assert.equal(subRes.status, 0)
  assert.equal(subRes.stdout, '')
  assert.equal(store.readNote(w.dir, 's1'), null)

  const first = run(w, 'stop', {})
  assert.equal(first.status, 0)
  const out1 = JSON.parse(first.stdout)
  assert.equal(out1.hookSpecificOutput.hookEventName, 'Stop')
  assert.match(out1.hookSpecificOutput.additionalContext, /fix-bug/)
  assert.match(out1.hookSpecificOutput.additionalContext, /aether-delegate verdict/)

  const second = run(w, 'stop', {})
  assert.equal(second.status, 0)
  assert.equal(second.stdout, '')

  log.appendEntry(w.data, {
    time: 30,
    session: 's1',
    task: 'fix-bug',
    attempt: 1,
    step: 'sonnet',
    verdict: 'fix',
    next: { step: 'sonnet', kind: 'fix', cause: 'fix' },
    kind: 'verdict',
  })
  log.appendEntry(w.data, {
    time: 40,
    session: 's1',
    task: 'fix-bug',
    attempt: 2,
    step: 'sonnet',
    launchKind: 'fix',
    description: 'fix bug',
    effort: 'high',
    edits: true,
    kind: 'launch',
  })
  log.appendEntry(w.data, {
    time: 50,
    session: 's1',
    task: 'fix-bug',
    attempt: 2,
    ok: true,
    status: 'done',
    kind: 'result',
  })
  const third = run(w, 'stop', {}, { LANG: 'es_ES.UTF-8' })
  assert.equal(third.status, 0)
  const out3 = JSON.parse(third.stdout)
  assert.match(out3.hookSpecificOutput.additionalContext, /Continuidad de Aether/)
  assert.match(out3.hookSpecificOutput.additionalContext, /fix-bug \(attempt 2\)/)
})
```

**Acceptance:**
- Cuando una tarea delegada de la sesión del Lead tiene resultado llegado y no tiene `verdict`, `aether-continuity stop` devuelve `additionalContext` nombrando la tarea y `aether-delegate verdict` en el primer `Stop`, y no repite el aviso en un segundo `Stop` del mismo intento.
- Si un nuevo intento (`attempt: 2`) llega sin veredicto, `Stop` vuelve a avisar una vez.
- Si `input.agent_id` está presente en `stop` o la sesión no es del Lead, `aether-continuity stop` sale con 0 y sin salida ni escrituras.
- `node --test tests/continuity-hook.test.js tests/session-start-continuity.test.js` pasa.

---

### Task 6: Rechazar lanzamientos por tope o pausa en `aether-delegate begin` y `aether-plan compile`

**Aether:**
- Review: xhigh — impide que el delegado o el enjambre lancen agentes cuando el tope de tiempo, el tope de gasto o el freno de cuota de una corrida autónoma están activos
- Area: autonomy-gates
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/plan-compile.js`, `tests/delegate-*.test.js`, `tests/ladder-one-source.test.js`, `tests/baseline.test.js`
- Depends on: Task 2 — usa autonomy.launchRefusal para comprobar si hay una corrida abierta con stop en time, cost o quota
- Serves: R3, R12

**Goal:**
Hacer que en una sesión del Lead `aether-delegate begin` (`plugins/aether/lib/delegate-task.js`) y `aether-plan compile` (`plugins/aether/lib/plan-compile.js`) comprueben `autonomy.launchRefusal` y rechacen lanzar trabajo nuevo cuando hay una corrida abierta con `stop` en `'time'`, `'cost'` o `'quota'`, nombrando el `id` de la corrida, el tope o pausa y el comando `aether-autonomy end`, mientras que fuera de una sesión del Lead se comporten exactamente como hoy (C7).

**Interfaces:**
1. En `plugins/aether/lib/delegate-task.js`:
   - `autonomyRefusedPlan(r, ctx, refusal)`: construye `prompt = \`Aether delegate task \${ctx.id} was not launched: \${refusal.message}. Do not do any work. Tell the Lead why the launch was refused.\`` y llama a `refusedLaunchPlan(r, ctx, prompt, prompt)` añadiendo `stop: refusal.stop` y `run: refusal.id` al plan devuelto.
   - En `begin(input, deps = {})`: tras construir `ctx` (antes de comprobar `next.status` o cargar skills), llamar a `autonomy.launchRefusal(r.cwd, { session, dataDir: r.dataDir, now: r.now() })`. Si devuelve un objeto `refusal`, retornar `autonomyRefusedPlan(r, ctx, refusal)`.
2. En `plugins/aether/lib/plan-compile.js`:
   - En `compile(planArg, rest, { cwd, stdout, env = process.env } = {})`: tras resolver `repo.mainRoot`, llamar a `autonomy.launchRefusal(repo.mainRoot, { session: env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || null, dataDir: run.dataDir(env) })`.
   - Si devuelve `refusal`, llamar a `fail([refusal.message], [], stdout)` (sale con código 1 e imprime `{ ok: false, errors: [refusal.message], warnings: [] }`).

**Tests (write first):**
1. Añadir en `tests/delegate-task.test.js` (usando `task.begin`, `makeRepo`, `tempDir`, `BRIEF`, `autonomy` y `markSession`):

```js
test('begin refuses to launch a delegate in a Lead session when an open autonomous run hit time, cost, or quota stop, and leaves non-Lead sessions unchanged', async (t) => {
  const autonomy = require('../plugins/aether/lib/autonomy.js')
  const { markSession } = require('../plugins/aether/lib/session.js')
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-del-autonomy-')
  const configDir = tempDir(t, 'aether-cfg-autonomy-')
  const projDir = path.join(configDir, 'projects', 'proj-del')
  fs.mkdirSync(projDir, { recursive: true })
  fs.writeFileSync(
    path.join(projDir, 'sess-1.jsonl'),
    JSON.stringify({
      type: 'user',
      isSidechain: false,
      origin: { kind: 'human' },
      entrypoint: 'sdk-cli',
      timestamp: '2026-04-12T10:00:00.000Z',
      message: { role: 'user', content: 'run unattended for 1 hour' },
    }) + '\n'
  )
  markSession(dataDir, 'sess-1', 1000, { repo: repo.dir, claude: null })

  const t0 = Date.parse('2026-04-12T10:00:00.000Z')
  const started = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)

  const ask = (session, nowMs) =>
    task.begin(
      { session, event: { description: 'build feature', prompt: BRIEF } },
      { dataDir, cwd: repo.dir, settings: { enabled: false }, now: () => nowMs }
    )

  // Time stop in Lead session
  const byTime = await ask('sess-1', t0 + 3605 * 1000)
  assert.equal(byTime.kind, 'refused')
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.run, started.run.id)
  assert.match(byTime.notes.join('\n'), /aether-autonomy end --outcome ceiling/)

  // Non-Lead session proceeds normally even when ceiling is reached (C7)
  const nonLead = await ask('plain-session', t0 + 3605 * 1000)
  assert.notEqual(nonLead.kind, 'refused')

  // Quota stop in Lead session (within time ceiling)
  const resetsAt = t0 + 4 * 3600 * 1000
  autonomy.recordCrossing(repo.dir, { kind: 'five_hour', percentUsed: 80, resetsAt, now: t0 + 1000 })
  const byQuota = await ask('sess-1', t0 + 2000)
  assert.equal(byQuota.kind, 'refused')
  assert.equal(byQuota.stop, 'quota')
  assert.equal(byQuota.run, started.run.id)
  assert.match(byQuota.notes.join('\n'), /aether-autonomy end --outcome incomplete/)

  // Cost stop in Lead session (in a fresh run with 10h ceiling)
  autonomy.end(repo.dir, { outcome: 'incomplete', now: t0 + 3000 })
  const startedCost = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 10, usd: 5 },
    { configDir, dataDir, now: t0 + 4000 }
  )
  autonomy.spend(repo.dir, { unit: 'u1', usd: 5, now: t0 + 5000 })
  const byCost = await ask('sess-1', t0 + 6000)
  assert.equal(byCost.kind, 'refused')
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.run, startedCost.run.id)
  assert.match(byCost.notes.join('\n'), /aether-autonomy end --outcome ceiling/)
})
```

2. Añadir en `tests/baseline.test.js` (usando `makeRepo`, `tempDir`, `writePlan`, `runBin`, `PLAN_BIN` definidos e importados de `./helpers.js`):

```js
test('aether-plan compile refuses in a Lead session when an open autonomous run hit time, cost, or quota stop, and leaves non-Lead sessions unchanged', (t) => {
  const repo = makeRepo(t)
  const autonomy = require('../plugins/aether/lib/autonomy.js')
  const { markSession } = require('../plugins/aether/lib/session.js')
  const dataDir = tempDir(t, 'aether-plan-data-')
  const configDir = tempDir(t, 'aether-plan-cfg-')
  const projDir = path.join(configDir, 'projects', 'proj-plan')
  fs.mkdirSync(projDir, { recursive: true })
  const t0 = Date.now() - 2 * 3600 * 1000
  fs.writeFileSync(
    path.join(projDir, 'sess-p.jsonl'),
    JSON.stringify({
      type: 'user',
      isSidechain: false,
      origin: { kind: 'human' },
      entrypoint: 'sdk-cli',
      timestamp: new Date(t0).toISOString(),
      message: { role: 'user', content: 'work unattended for 1 hour' },
    }) + '\n'
  )
  markSession(dataDir, 'sess-p', 1000, { repo: repo.dir, claude: null })

  const started = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)

  repo.git('checkout', '-b', 'feat/test-compile')
  const tasksFile = writePlan(repo.dir)

  // Time stop in Lead session
  const resTime = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resTime.status, 0)
  assert.match(resTime.out.errors[0], new RegExp(started.run.id))
  assert.match(resTime.out.errors[0], /aether-autonomy end --outcome ceiling/)

  // Non-Lead session compiles normally (C7)
  const resPlain = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'plain-session',
  })
  assert.equal(resPlain.status, 0)

  // Cost and quota stops in Lead session
  autonomy.end(repo.dir, { outcome: 'ceiling', now: Date.now() - 1000 })
  const started2 = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 10, usd: 5 },
    { configDir, dataDir, now: Date.now() }
  )
  autonomy.recordCrossing(repo.dir, { kind: 'five_hour', percentUsed: 80, resetsAt: Date.now() + 3600 * 1000, now: Date.now() })
  const resQuota = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resQuota.status, 0)
  assert.match(resQuota.out.errors[0], /aether-autonomy end --outcome incomplete/)

  autonomy.end(repo.dir, { outcome: 'incomplete', now: Date.now() })
  const started3 = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 10, usd: 5 },
    { configDir, dataDir, now: Date.now() }
  )
  autonomy.spend(repo.dir, { unit: 'u1', usd: 5, now: Date.now() })
  const resCost = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resCost.status, 0)
  assert.match(resCost.out.errors[0], new RegExp(started3.run.id))
  assert.match(resCost.out.errors[0], /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- En una sesión del Lead con una corrida autónoma abierta cuyo `stop` es `'time'`, `'cost'` o `'quota'`, `aether-delegate begin` devuelve un plan `refused` con el `id` de la corrida, el motivo y `aether-autonomy end`, y `aether-plan compile` falla con código distinto de 0 y el mismo mensaje claro.
- Fuera de una sesión del Lead, o sin corrida abierta o con `stop: null`, ambos comandos funcionan como antes.
- `node --test tests/delegate-task.test.js tests/baseline.test.js` pasa.

---

### Task 7: Rechazar `/aether:design` por tope o pausa e incluir `skill: 'aether:designing'` en su salida

**Aether:**
- Review: xhigh — impide que `/aether:design` lance asientos externos o nativos cuando una corrida autónoma superó su tope o está en pausa por cuota
- Area: design-workflow
- Owns: `plugins/aether/lib/seat-calls.js`, `plugins/aether/workflows/design.workflow.js`, `tests/seat-calls.test.js`, `tests/layout-work.test.js`, `tests/workflow-design.test.js`
- Depends on: Task 2 — usa autonomy.launchRefusal en start de seat-calls.js para bloquear asientos cuando stop está en time, cost o quota
- Serves: R3, R9, R12

**Goal:**
1. En `plugins/aether/lib/seat-calls.js` (`start`), comprobar `autonomy.launchRefusal(top, { session: checked.session, dataDir: run.dataDir(env), now })` antes de iniciar un asiento; si hay rechazo, devolver `{ started: false, refused: true, stop: refusal.stop, run: refusal.id, reason: refusal.message }`.
2. En `plugins/aether/workflows/design.workflow.js`, cuando `seat-start` devuelve `refused: true` en `awaitSeat` / `seatRound`, abortar de inmediato antes de la rama `startFailed` y antes de `nativeAnswer`, devolviendo `{ status: 'failed', step, reason, stop, run, skill: 'aether:designing' }`. Además, incluir `skill: 'aether:designing'` en toda salida de `/aether:design` (R9).

**Interfaces:**
1. En `plugins/aether/lib/seat-calls.js`:
   - En `start(cwd, flags, { env = process.env, now = Date.now() } = {})`: después de resolver `top` y validar `checked`, y antes de escoger par o crear el worktree del asiento, llamar a `autonomy.launchRefusal(top, { session: checked.session, dataDir: run.dataDir(env), now })`.
   - Si devuelve `refusal`, retornar `{ started: false, refused: true, stop: refusal.stop, run: refusal.id, reason: refusal.message }`.
2. En `plugins/aether/workflows/design.workflow.js`:
   - En `awaitSeat({ seat, doc, base, flags, exclude, text, phase })`: tras `const started = parseObject(await ops(...))`, antes de `if (started.error || started.started !== true || typeof started.id !== 'string')`, si `started && started.refused === true` retornar `{ id: null, refused: true, stop: started.stop, run: started.run, note: started.reason || 'autonomous run ceiling reached' }`.
   - En `seatRound({ seat, doc, step, text, schema, nativeSchema = schema, phase, author = null, writes = null })`: tras `const waited = await awaitSeat(...)`, si `waited.refused === true` asignar `record.note = waited.note`, hacer `rounds.push(record)` y retornar de inmediato `{ failed: waited.note, refused: true, stop: waited.stop, run: waited.run }` (sin reintentar ni llamar a `nativeAnswer`).
   - En `failure(step, reason, extra = {})` y en la propagación de rondas fallidas (`spec`, `review`, `plan`, `fixed`): conservar `stop` y `run` cuando vengan en la ronda fallida.
   - En el `return` final del workflow (`return { status, mode, feature, skill: 'aether:designing', verdicts, rounds, times: timesOf(rounds), ...(writerQuestions.length > 0 ? { writerQuestions } : {}), ...fields }`) y en los retornos tempranos de validación: incluir siempre `skill: 'aether:designing'`.

**Tests (write first):**
1. Añadir en `tests/seat-calls.test.js` (usando `seatRepo`, `modEnv`, `writeMessage`, `seatCalls.start`, `autonomy` y `markSession`):

```js
test('seatCalls.start refuses in a Lead session when an open autonomous run hit time, cost, or quota stop, and leaves non-Lead sessions unchanged', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const autonomy = require('../plugins/aether/lib/autonomy.js')
  const { markSession } = require('../plugins/aether/lib/session.js')
  const configDir = tempDir(t, 'aether-seat-cfg-')
  const projDir = path.join(configDir, 'projects', 'proj-seat')
  fs.mkdirSync(projDir, { recursive: true })
  const t0 = Date.parse('2026-04-12T10:00:00.000Z')
  fs.writeFileSync(
    path.join(projDir, 's1.jsonl'),
    JSON.stringify({
      type: 'user',
      isSidechain: false,
      origin: { kind: 'human' },
      entrypoint: 'sdk-cli',
      timestamp: '2026-04-12T10:00:00.000Z',
      message: { role: 'user', content: 'run unattended for 1 hour' },
    }) + '\n'
  )
  markSession(env.AETHER_DATA_DIR, 's1', 1000, { repo: repo.dir, claude: null })

  const started = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 's1', hours: 1, usd: 5 },
    { configDir, dataDir: env.AETHER_DATA_DIR, now: t0 }
  )
  assert.equal(started.ok, true)

  const msg = writeMessage(t, 'write spec')
  const ask = (session, nowMs) =>
    seatCalls.start(
      repo.dir,
      { seat: 'writer', session, feature: 'specs/010-sample', doc: 'spec', superdelegation: 'off', harnesses: 'agy', digest: msg },
      { env, now: nowMs }
    )

  // Time stop in Lead session
  const byTime = ask('s1', t0 + 3605 * 1000)
  assert.equal(byTime.started, false)
  assert.equal(byTime.refused, true)
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.run, started.run.id)
  assert.match(byTime.reason, /aether-autonomy end --outcome ceiling/)

  // Non-Lead session is not refused by launchRefusal (C7)
  const nonLead = ask('plain-session', t0 + 3605 * 1000)
  assert.notEqual(nonLead.refused, true)

  // Quota stop in Lead session
  autonomy.recordCrossing(repo.dir, { kind: 'five_hour', percentUsed: 80, resetsAt: t0 + 4 * 3600 * 1000, now: t0 + 1000 })
  const byQuota = ask('s1', t0 + 2000)
  assert.equal(byQuota.refused, true)
  assert.equal(byQuota.stop, 'quota')
  assert.match(byQuota.reason, /aether-autonomy end --outcome incomplete/)

  // Cost stop in Lead session
  autonomy.end(repo.dir, { outcome: 'incomplete', now: t0 + 3000 })
  const startedCost = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 's1', hours: 10, usd: 5 },
    { configDir, dataDir: env.AETHER_DATA_DIR, now: t0 + 4000 }
  )
  autonomy.spend(repo.dir, { unit: 'u1', usd: 5, now: t0 + 5000 })
  const byCost = ask('s1', t0 + 6000)
  assert.equal(byCost.refused, true)
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.run, startedCost.run.id)
  assert.match(byCost.reason, /aether-autonomy end --outcome ceiling/)
})
```

2. Añadir en `tests/workflow-design.test.js` (usando `go(ARGS, overrides)` y `ARGS` definidos en ese archivo):

```js
test('design workflow aborts immediately without native fallback when seat-start is refused by time, cost, or quota stop and includes skill aether:designing', async () => {
  for (const [stop, reason] of [
    ['time', 'autonomous run run-1 reached its time ceiling (1.1h / 1h); close it with: aether-autonomy end --outcome ceiling'],
    ['cost', 'autonomous run run-1 reached its spend ceiling ($5 / $5); close it with: aether-autonomy end --outcome ceiling'],
    ['quota', 'autonomous run run-1 is paused by the quota brake (80% used; resumeAt pending); close the run with: aether-autonomy end --outcome incomplete'],
  ]) {
    let writerCalled = false
    const run = await go(ARGS, {
      'aether-lane seat-start': () => ({
        started: false,
        refused: true,
        stop,
        run: 'run-1',
        reason,
      }),
      writer: () => {
        writerCalled = true
        return {}
      },
    })
    assert.equal(writerCalled, false)
    assert.equal(run.result.status, 'failed')
    assert.equal(run.result.stop, stop)
    assert.equal(run.result.run, 'run-1')
    assert.equal(run.result.skill, 'aether:designing')
    assert.equal(run.result.reason, reason)
  }
})
```

**Acceptance:**
- En una sesión del Lead, cuando `seatCalls.start` detecta `launchRefusal`, devuelve `refused: true` con `stop`, `run` y `reason`, y `design.workflow.js` termina de inmediato sin invocar al agente nativo de Claude.
- Toda respuesta de `design.workflow.js` incluye `skill: 'aether:designing'`.
- `node --test tests/seat-calls.test.js tests/workflow-design.test.js` pasa.

---

### Task 8: Avisar una vez por turno en `PostToolUse` al llegar a 3 ediciones propias o 10 lecturas

**Aether:**
- Area: continuity
- Owns: `plugins/aether/lib/continuity-posttool.js`, `tests/continuity-posttool.test.js`, `tests/continuity-posttool-skills.test.js`, `tests/tree-check.test.js`
- Depends on: none
- Serves: R7, R12

**Goal:**
Añadir en `plugins/aether/lib/continuity-posttool.js` el conteo por turno de ediciones propias de código/pruebas (`DIRECT_EDIT_LIMIT = 3`) y de lecturas/búsquedas (`DIRECT_READ_LIMIT = 10`) en la sesión del Lead, emitiendo un aviso no bloqueante (`additionalContext`) una sola vez por turno al alcanzar cualquiera de los dos límites, respetando la firma existente `posttool(input, ctx)` que devuelve `null` o `{ additionalContext }`.

**Interfaces:**
En `plugins/aether/lib/continuity-posttool.js`:
- Constantes exportadas: `DIRECT_EDIT_LIMIT = 3`, `DIRECT_READ_LIMIT = 10`.
- `posttool(input, ctx = {})` conserva su firma y valor de retorno actuales (`null` cuando ningún manejador dispara, o `{ additionalContext: parts.join('\n') }` cuando al menos un manejador de `HANDLERS` devuelve una cadena).
- El nuevo manejador `directTurnBudget(input, ctx)` en `HANDLERS`:
  - Retorna `null` de inmediato si `Boolean(input && input.agent_id)` (subagente) o si `!input || typeof input.session_id !== 'string' || !ctx.dataDir || !isAetherSession(ctx.dataDir, input.session_id)`.
  - Guarda el estado por sesión en `<ctx.dataDir>/continuity/<session_id>.json`: `{ promptId: string | null, sinceStopAt: number | null, edits: number, reads: number, notified: boolean }`.
  - Reinicia a `{ promptId, sinceStopAt, edits: 0, reads: 0, notified: false }` cuando cambia `input.prompt_id` (si viene definido) o cuando la nota de continuidad en `<continuityDir>/continuity/<session_id>.json` tiene un `updatedAt` posterior al `sinceStopAt` guardado tras un `Stop`.
  - `isExemptWriteTarget(targetPath, cwd, memoryDir)`: devuelve `true` si la ruta normalizada relativa a `cwd` (o absoluta) cae bajo `.aether/`, `.specify/`, `specs/`, `docs/`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `/dev/null` o dentro de `memoryDir`.
  - `isDirectCodeEdit(input, cwd, memoryDir)`: devuelve `true` cuando:
    - `tool_name` es `'Write'`, `'Edit'`, `'MultiEdit'` o `'NotebookEdit'` y `tool_input.file_path || tool_input.notebook_path` existe y no es exento según `isExemptWriteTarget`; o
    - `tool_name === 'Bash'` y `writeTargets(command)` (de `guard.js`) devuelve al menos una ruta que no es exenta según `isExemptWriteTarget`.
  - `isTestOrAetherCommand(command)`: devuelve `true` cuando el comando `Bash` es una corrida de pruebas (`npm test`, `npm run test`, `npm run check`, `npm run validate`, `node --test`, `pytest`, `jest`, `vitest`, `cargo test`, `go test`) o invoca un binario `aether-*`.
  - `isDirectReadOrSearch(input)`: devuelve `true` cuando:
    - `tool_name` es `'Read'`, `'Grep'` o `'Glob'`; o
    - `tool_name === 'Bash'`, `writeTargets(command)` está vacío, `!isTestOrAetherCommand(command)` y el comando invoca un comando de lectura o búsqueda (`READ_COMMANDS` de `guard.js`, `sed`, `awk`, `find`, `rg`, `grep`, `cat`, `head`, `tail`, `wc`, `ls`, `git grep`, `git show`, `git diff`, `git log`, `git status`).
  - Cuando `edits >= DIRECT_EDIT_LIMIT` o `reads >= DIRECT_READ_LIMIT` y `state.notified === false`:
    - Marca `state.notified = true`, guarda el estado y devuelve la cadena de aviso (en inglés o en español según `store.isSpanish(ctx.env)`) indicando que se alcanzó el límite del camino directo en este turno (`3` ediciones propias o `10` lecturas/búsquedas) y que el trabajo debe pasar a una tarea delegada (`Agent`).

**Tests (write first):**
Añadir en `tests/continuity-posttool.test.js` (usando `world(t)`, `posttool.posttool` y `markSession` de `../plugins/aether/lib/session.js`):

```js
test('posttool warns once on the 3rd direct code edit in a turn and ignores exempt paths and subagents', (t) => {
  const w = world(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  markSession(w.data, 's-edit', 1000, { repo: w.repo.dir, claude: null })
  const ctx = { env: w.env, home: w.configDir, dataDir: w.data }

  for (const exempt of [
    path.join(w.repo.dir, 'specs', '031-demo', 'intent.md'),
    path.join(w.repo.dir, '.aether', 'journal.md'),
    path.join(w.repo.dir, 'docs', 'guide.md'),
    path.join(w.repo.dir, 'CLAUDE.md'),
  ]) {
    const r = posttool.posttool(
      { session_id: 's-edit', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: exempt } },
      ctx
    )
    assert.equal(r, null)
  }

  const sub = posttool.posttool(
    { session_id: 's-edit', agent_id: 'sub-1', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'src', 'a.js') } },
    ctx
  )
  assert.equal(sub, null)

  const e1 = posttool.posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'src', 'a.js') } },
    ctx
  )
  assert.equal(e1, null)

  const e2 = posttool.posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: path.join(w.repo.dir, 'tests', 'a.test.js') } },
    ctx
  )
  assert.equal(e2, null)

  const e3 = posttool.posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command: 'echo "x" > src/b.js' } },
    ctx
  )
  assert.ok(e3 && typeof e3.additionalContext === 'string')
  assert.match(e3.additionalContext, /3/)
  assert.match(e3.additionalContext, /delegate|Agent/i)

  const e4 = posttool.posttool(
    { session_id: 's-edit', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'src', 'c.js') } },
    ctx
  )
  assert.equal(e4, null)

  const nextTurn = posttool.posttool(
    { session_id: 's-edit', prompt_id: 'p2', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'src', 'a.js') } },
    ctx
  )
  assert.equal(nextTurn, null)
})

test('posttool warns once on the 10th read or search in a turn and ignores test runs', (t) => {
  const w = world(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  markSession(w.data, 's-read', 1000, { repo: w.repo.dir, claude: null })
  const ctx = { env: w.env, home: w.configDir, dataDir: w.data }

  for (let i = 0; i < 5; i++) {
    const testRun = posttool.posttool(
      { session_id: 's-read', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command: 'npm test' } },
      ctx
    )
    assert.equal(testRun, null)
  }

  for (let i = 1; i <= 9; i++) {
    const r = posttool.posttool(
      {
        session_id: 's-read',
        prompt_id: 'p1',
        cwd: w.repo.dir,
        tool_name: i % 2 === 0 ? 'Read' : 'Bash',
        tool_input: i % 2 === 0 ? { file_path: path.join(w.repo.dir, 'src', 'a.js') } : { command: 'rg foo src/' },
      },
      ctx
    )
    assert.equal(r, null)
  }

  const tenth = posttool.posttool(
    { session_id: 's-read', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Grep', tool_input: { pattern: 'foo' } },
    { ...ctx, env: { ...w.env, LANG: 'es_ES.UTF-8' } }
  )
  assert.ok(tenth && typeof tenth.additionalContext === 'string')
  assert.match(tenth.additionalContext, /10/)
})
```

**Acceptance:**
- `posttool.posttool(input, ctx)` devuelve `{ additionalContext }` en la 3.ª edición propia de código o pruebas o en la 10.ª lectura/búsqueda del mismo turno en una sesión del Lead, y `null` en el resto de llamadas del turno.
- Las escrituras en `intent.md`, `.aether/`, `.specify/`, `specs/`, `docs/`, `CLAUDE.md`, `README.md`, `AGENTS.md` y memoria, las corridas de pruebas, las sesiones fuera del Lead y las herramientas de subagentes (`input.agent_id` presente) no suman al contador.
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
   - En `**Start:**`: explicar que en una sesión interactiva del Lead debes presentar el plan en plan mode (`ExitPlanMode`) y esperar la aprobación del dueño antes de correr `aether-autonomy start`, porque `aether-autonomy start` verifica la transcripción de la sesión y rechaza abrir la corrida si no consta una aprobación de `ExitPlanMode` no consumida; en una sesión sin terminal (`claude -p`, `entrypoint: "sdk-cli"`), `aether-autonomy start` verifica la cita literal del dueño como hasta ahora.
   - En `**Ceilings:**` / `## 3. Loop until a ceiling`: quitar la exigencia de correr `aether-autonomy status` antes de cada tarea delegada, cada ola o cada asiento. Explicar que `aether-delegate begin`, `aether-plan compile` y `/aether:design` comprueban por sí mismos si hay una corrida abierta con `stop` en `time`, `cost` o `quota` y rechazan lanzar trabajo nuevo indicando la corrida y el comando para cerrarla (`aether-autonomy end --outcome ceiling` en topes de tiempo o gasto; esperar hasta `resumeAt` o cerrar con `aether-autonomy end --outcome incomplete` en pausa por cuota; o `aether-autonomy end --outcome ceiling|incomplete|done` si una corrida vieja de otra sesión quedó abierta). `aether-autonomy status` queda como herramienta de consulta cuando el Lead o el dueño quieran inspeccionar el tiempo, gasto o cuota.
2. En `plugins/aether/skills/swarm/SKILL.md`:
   - Quitar la exigencia de correr `aether-autonomy status` antes de cada ola y explicar qué hacer cuando `aether-plan compile` rechaza por tope o pausa (`stop` en `time`, `cost` o `quota`).
   - Mantener la regla `"Never run the swarm on main."` añadiendo que `aether-plan compile` tiene la bandera `--allow-main` para cuando el dueño pida explícitamente compilar en `main`, sin invitar a usarla por cuenta propia.
   - En las fusiones: nombrar `aether-wt settle <run-dir> <wave-num> <task-id> <branch> --test-cmd "<cmd>"` cuando una fusión se corta a los 600 segundos (`merge timed out after 600s`) para inspeccionar o terminar el merge antes de decidir.
   - En la escalera del supervisor:
     - Explicar que `"the supervisor failed 3 times in a row"` ocurre cuando el supervisor termina tres veces sin devolver respuesta, mientras que un veredicto inválido (`verdict` que no es `approve`, `retry` ni `impossible`, o `retry` sin `findings`) cuenta como un intento `retry` de la tarea.
     - Explicar que el 2.º y 3.er intento del supervisor corren siempre en Claude y que un supervisor o revisor final de Claude que permanezca callado 900 segundos se abandona.
     - Explicar que un hallazgo del supervisor que no nombra ningún archivo recibe el primer archivo listado en el `Owns` de la tarea.

**Tests (write first):**
Añadir en `tests/autonomous-runs-skill.test.js` (usando `SKILL` y `read(...parts)` definidos en ese archivo):

```js
test('autonomous-runs and swarm skills describe automatic ceiling refusal and #214 rules', () => {
  const swarmText = read('skills', 'swarm', 'SKILL.md')

  assert.match(SKILL, /ExitPlanMode/)
  assert.match(SKILL, /aether-delegate begin/)
  assert.match(SKILL, /aether-plan compile/)
  assert.match(SKILL, /aether-autonomy end --outcome ceiling/)
  assert.doesNotMatch(SKILL, /Before each feature and each swarm wave, check the run/)

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
- Owns: `plugins/aether/lib/session-start.js`, `plugins/aether/hooks/hooks.json`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/helpers.js`, `tests/session-start.test.js`, `tests/session-start-parts.test.js`, `tests/dormant-030.test.js`, `tests/continuity-hook.test.js`
- Depends on: Task 3 — requiere que las skills models y designing existan antes de resumirlas en using-aether
- Depends on: Task 5 — comparte las entradas del archivo de hooks y tests/continuity-hook.test.js
- Depends on: Task 8 — actualiza el matcher de PostToolUse en el archivo de hooks para el conteo por turno
- Depends on: Task 9 — alinea las referencias de autonomía y enjambre
- Serves: R6, R8, R9, R10

**Goal:**
1. En `plugins/aether/lib/session-start.js`, reemplazar `partHeading(k, n, root)` por el marco de dos líneas independiente del orden de llegada (R8), manteniendo todos los cortes en fronteras `## ` y cada salida JSON dentro de `PART_LIMIT` (9.800 caracteres).
2. En `plugins/aether/skills/using-aether/SKILL.md`, resumir `## Models` y `## Designing` remitiendo a `aether:models` y `aether:designing` (conservando las reglas permanentes), reemplazar la regla vaga de cinco llamadas por la frase canónica en inglés de la regla contable (R6) y aplicar las correcciones de #204 (R10), dejando el texto total inyectado en $\le 25.000$ caracteres y 3 partes.
3. En `plugins/aether/hooks/hooks.json`, dejar en `SessionStart` la entrada de notas y `--part 1`, `--part 2` y `--part 3` (quitando `--part 4` y `--part 5`), y actualizar el `matcher` de `PostToolUse` a `"Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash"`, actualizando en esta misma tarea `tests/helpers.js`, `tests/session-start.test.js`, `tests/session-start-parts.test.js`, `tests/dormant-030.test.js` y `tests/continuity-hook.test.js`.

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
   - En el párrafo introductorio, `## The three paths` y `## The delegate ladder`: reemplazar `"about five tool calls"` y `"many reads of your own"` usando la frase canónica en inglés (`COUNTABLE_EN`):
     `"at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count"`
     (aclarando que quedan fuera de ese conteo las escrituras en el diario, `specs/NNN-<topic>/intent.md`, documentos en `specs/` o `docs/`, memoria y las corridas de pruebas).
   - En `## Models`: conservar las prohibiciones de no adivinar nombres de modelos ni precios desde los pesos, las rutas a `models.json` y `prices.json` bajo `${CLAUDE_PLUGIN_ROOT}/config`, la lista de harnesses (`agy, codex, grok, cursor, muse`) y la regla de cuota (`first the quota whose weekly window renews first, then the cheapest pair per task`), e indicar cargar la skill `aether:models` antes de responder sobre capacidades, esfuerzos o citas del fabricante.
   - En `## Designing`: conservar qué es diseñar, la prohibición de no escribir `spec.md`, `plan.md`, `tasks.md` ni `art-direction.md` sin `/aether:design` (salvo diseño corto pedido por el dueño), las referencias a `aether:writer`, `aether:judge`, `aether:specify`, `aether:examiner`, `At most two revisions per document`, `.aether/pending.jsonl`, `specs/NNN-<topic>/intent.md`, `/aether:design`, `aether-report --seats`, `aether-exam run` y `aether-exam store specs/NNN-<topic>`, e indicar cargar la skill `aether:designing` antes de redactar `intent.md`, lanzar `/aether:design` o procesar su respuesta.
   - En `## The delegate ladder` (puntos de #204, R10):
     - Explicar que cada llamada a `Agent` cuyo `subagent_type` no sea `aether:*` (incluidos `Plan`, `claude-code-guide` o llamadas sin `subagent_type`) es una tarea delegada, entra en la escalera y espera veredicto.
     - Prohibir pasar `fork` en una tarea delegada porque la herramienta `Agent` ignora `model` en un fork y correría en el modelo del Lead con toda su conversación.
     - Explicar que `fix` corre en el mismo modelo al esfuerzo de corrección del escalón definido en `ladder.json` bajo `${CLAUDE_PLUGIN_ROOT}/config` (no «one effort up»).
     - Incluir `--ignore <glob>` en `aether-delegate verdict` para archivos sucios ajenos a la tarea.
     - Explicar que relanzar un `task` id ya aprobado o agotado lanza un agente mínimo en Haiku que informa que la tarea ya terminó y que debe abrirse un nuevo `task` id.
     - Explicar que en `AETHER-SKILLS:`, pasar más de 3 skills, un nombre desconocido o una skill que supere el límite de líneas rechaza el lanzamiento entero.
4. En `tests/session-start.test.js`, `tests/session-start-parts.test.js`, `tests/dormant-030.test.js` y `tests/continuity-hook.test.js`:
   - Actualizar el conteo de partes de `--part` a `3` (`4` comandos en `SessionStart`, `11` comandos totales en el archivo de hooks), el encabezado de dos líneas en cada parte y el matcher `'Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash'` de `PostToolUse`.

**Tests (write first):**
Añadir en `tests/session-start-parts.test.js` (usando `PLUGIN`, `PART_LIMIT` y `bootstrapParts` definidos en ese archivo):

```js
test('bootstrap splits into at most 3 order-independent parts within 25,000 total injected chars', () => {
  const parts = bootstrapParts(PLUGIN)
  assert.ok(parts.length >= 1 && parts.length <= 3, `expected 1..3 parts, got ${parts.length}`)
  let totalChars = 0
  for (let i = 0; i < parts.length; i++) {
    const ctx = parts[i]
    totalChars += ctx.length
    assert.ok(
      ctx.startsWith(
        "You are the Lead of Aether mode: the owner's right hand.\n" +
          `Aether mode bootstrap, part ${i + 1} of ${parts.length}: read all ${parts.length} parts before you act, whatever order they arrive in; if a part from 1 to ${parts.length} did not reach you, read the whole file `
      )
    )
    const out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } })
    assert.ok(out.length <= PART_LIMIT, `part ${i + 1} JSON is ${out.length} > ${PART_LIMIT}`)
  }
  assert.ok(totalChars <= 25000, `expected total injected chars <= 25000, got ${totalChars}`)
})
```

**Acceptance:**
- `bootstrapParts(PLUGIN)` cabe en las 3 partes de `hooks/hooks.json`; cada parte empieza con las dos líneas de R8, corta en frontera `## `, su JSON completo mide $\le 9.800$ caracteres (incluso con ruta de 400 caracteres) y la suma de los textos inyectados mide $\le 25.000$ caracteres.
- `plugins/aether/hooks/hooks.json` tiene 3 entradas `--part` (`1`, `2`, `3`) y ninguna entrada `--part` devuelve `{}` vacío.
- `plugins/aether/skills/using-aether/SKILL.md` contiene la frase canónica en inglés de la regla contable (R6), remite a `aether:models` y `aether:designing` (R9) y refleja las correcciones de #204 (R10).
- `node --test tests/session-start.test.js tests/session-start-parts.test.js tests/dormant-030.test.js tests/continuity-hook.test.js` pasa.

---

### Task 11: Actualizar documentación, `CLAUDE.md`, `docs/decisions.md` y huella durmiente en `docs/reference/components.md`

**Aether:**
- Area: docs
- Owns: `CLAUDE.md`, `docs/methodology.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `docs/decisions.md`, `docs/index.md`, `tests/docs-facts.test.js`
- Depends on: Task 6 — documenta el rechazo automático en aether-delegate begin y aether-plan compile
- Depends on: Task 7 — documenta el rechazo automático y la clave skill en /aether:design
- Depends on: Task 10 — actualiza las pruebas y guías con las 3 partes de SessionStart y el matcher de PostToolUse
- Serves: R6, R8, R9, R10, R11, R12, R13

**Goal:**
Actualizar `CLAUDE.md`, `docs/methodology.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `docs/decisions.md` y `docs/index.md` (y `tests/docs-facts.test.js`) para reflejar los cuatro comportamientos nuevos, la frase canónica de la regla contable verificada en todos los lugares, las decisiones `A117`–`A120`, las 3 partes de `SessionStart`, las dos skills nuevas (`aether:designing`, `aether:models`) y la huella durmiente medida (incluyendo el proceso corto de `PostToolUse` por lectura en sesión normal), sin tocar el changelog de la versión `0.36.0`.

**Interfaces:**
1. `docs/methodology.md`: reemplazar `"about five tool calls"` por la frase canónica en inglés (`COUNTABLE_EN`):
   `"at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count"` (R6).
2. `docs/decisions.md` y `docs/index.md`:
   - Conservar intacta la línea histórica `docs/decisions.md:236` (`about five tool calls`).
   - Añadir al final de `docs/decisions.md` las decisiones `A117` (aviso único en `Stop` e informe de delegados con resultado sin veredicto), `A118` (rechazo en código en `aether-delegate begin`, `aether-plan compile` y `/aether:design` ante tope de tiempo, gasto o pausa por cuota), `A119` (exigencia de aprobación `ExitPlanMode` en la transcripción antes de `aether-autonomy start` en sesiones interactivas) y `A120` (límite contable de 3 ediciones propias o 10 lecturas por turno con aviso único en `PostToolUse`, partes de arranque independientes del orden y extracción de `aether:designing` y `aether:models`).
   - En `docs/index.md`: actualizar el rango `A1–A116` a `A1–A120` y añadir las dos skills nuevas `aether:designing` y `aether:models` en la tabla de skills si se listan allí.
   - En `tests/docs-facts.test.js`: actualizar `LAST_DECISION = 120`.
3. `CLAUDE.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`:
   - Actualizar el número de entradas de `SessionStart` a 4 (`aether-session-start` + `--part 1` a `--part 3`, total 11 comandos de hook).
   - Documentar `aether:designing` y `aether:models` en la lista de skills.
   - Documentar `unverdicted` en `aether-report --delegates`, el aviso en `Stop`, el aviso en `PostToolUse` a las 3 ediciones o 10 lecturas, el rechazo automático por topes/pausa y la exigencia de plan mode en `aether-autonomy start` interactivo.
   - Medir y actualizar en `docs/reference/components.md` (`## What Aether adds to a normal session`, conservando la frase histórica `Version 0.35.0 adds seven hook entries...`) la huella durmiente fuera de una sesión del Lead: `SessionStart` corre 4 procesos cortos en vez de 6, y `PostToolUse` (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Read`, `Grep`, `Glob`, `Bash`) corre 1 proceso corto `aether-continuity posttool` (~33 ms en Node 22 sobre Linux/WSL2) por llamada, con `0 B` en `stdout` y `0` archivos escritos cuando `!isAetherSession`.
4. En `tests/docs-facts.test.js`:
   - Verificar que `docs/reference/components.md` documente la medición en sesión normal de `PostToolUse` para `Read`, `Grep` y `Glob`, y verificar que la frase canónica en inglés (`COUNTABLE_EN`) y la frase canónica en español (`COUNTABLE_ES`) estén presentes literalmente en los seis lugares de R6.

**Tests (write first):**
Añadir en `tests/docs-facts.test.js` (usando `read(rel)` definido en ese archivo):

```js
test('decisions A117 to A120 are recorded, historical line 236 stays intact, and the canonical countable rule is identical across all six places (R6)', () => {
  const decisions = read('docs/decisions.md')
  assert.match(decisions, /\| A117 \|/)
  assert.match(decisions, /\| A118 \|/)
  assert.match(decisions, /\| A119 \|/)
  assert.match(decisions, /\| A120 \|/)
  assert.match(decisions, /about five tool calls/)

  const enRule =
    'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  const esRule =
    'a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan'

  for (const parts of [
    ['plugins', 'aether', 'skills', 'using-aether', 'SKILL.md'],
    ['docs', 'methodology.md'],
    ['docs', 'tutorials', 'first-request.md'],
    ['site', 'app.js'],
  ]) {
    const file = parts.join('/')
    const text = read(file)
    assert.ok(text.includes(enRule), `${file} has the canonical English countable rule`)
    assert.doesNotMatch(text, /about five tool calls|many reads of your own/, `${file} has no old vague rule`)
  }
  for (const parts of [
    ['docs', 'es', 'guias', 'primera-peticion.md'],
    ['site', 'index.html'],
    ['site', 'app.js'],
  ]) {
    const file = parts.join('/')
    const text = read(file)
    assert.ok(text.includes(esRule), `${file} has the canonical Spanish countable rule`)
    assert.doesNotMatch(text, /unas cinco llamadas a herramientas/, `${file} has no old vague rule`)
  }
})
```

**Acceptance:**
- `npm test` y `npm run check` pasan al 100 % sin errores ni advertencias.
- `docs/decisions.md` conserva `"about five tool calls"` en su registro histórico de A32 y añade `A117`–`A120`.
- `tests/docs-facts.test.js` comprueba que la frase canónica en inglés y en español de la regla contable aparece idéntica en los seis lugares de R6.
- `docs/reference/components.md` refleja la medición de `PostToolUse` por lectura en una sesión normal y `tests/dormant-030.test.js` comprueba que los 11 comandos del archivo de hooks tienen huella de 0 bytes fuera de una sesión del Lead.
