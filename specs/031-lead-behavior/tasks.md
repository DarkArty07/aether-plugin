# Tasks: Hacer cumplir por código e higiene de prompts los comportamientos del Lead (031-lead-behavior)

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Intent:** [intent.md](intent.md)

## Global Constraints

- **Node.js 22 y CommonJS sin dependencias nuevas:** todos los módulos bajo `plugins/aether/lib/` y `plugins/aether/bin/` usan CommonJS (`'use strict'`) y módulos nativos de Node.js.
- **Invariantes de `tests/guards.test.js`:** cada archivo en `plugins/aether/lib/` conserva su cabecera de 2 líneas con `// Family: <nombre>.`, sin funciones duplicadas ni exportaciones muertas.
- **Verificadores estructurales:** `tests/guards-seat.test.js`, `tests/guards-core-1.test.js`, `tests/guards-delegate-2.test.js` y `tests/guards-bins.test.js` son verificadores estructurales que ninguna tarea edita; una tarea cuyo cambio hace fallar uno de ellos corrige su propio código.
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
- [ ] Task 10: Reducir `using-aether` a las reglas permanentes, remitir a `aether:models` y `aether:designing` y aplicar la regla contable y #204
- [ ] Task 11: Hacer independientes del orden las partes de `aether-session-start` y reducir `hooks.json` a 3 partes
- [ ] Task 12: Registrar las decisiones A117 a A120 en `docs/decisions.md` y el rango de `docs/index.md`
- [ ] Task 13: Actualizar `CLAUDE.md`, las guías, `docs/reference/components.md` y la huella durmiente
- [ ] Task 14: Registrar el fin de todo intento que corre en Claude y contarlo como resultado llegado

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
- Owns: `plugins/aether/lib/autonomy.js`, `tests/autonomy.test.js`, `tests/autonomy-trust.test.js`, `tests/aether-autonomy.test.js`, `tests/quota-brake.test.js`, `tests/quota-brake-scenarios.test.js`, `tests/guard.test.js`, `tests/guard-merge-main.test.js`, `tests/guard-skills.test.js`, `tests/guard-tidy.test.js`, `tests/copies-classes.test.js`, `tests/docs-claims.test.js`
- Depends on: none
- Serves: R3, R5, R12

**Goal:**
1. En `plugins/aether/lib/autonomy.js`, distinguir en sesiones del Lead (`isAetherSession(dataDir, session)`) las sesiones sin terminal (`entrypoint: "sdk-cli"`) de las sesiones interactivas al correr `start`: fuera de una sesión del Lead o en sesiones sin terminal conservar el comportamiento actual; en sesiones interactivas del Lead (o cuando la transcripción no existe, no puede leerse o no tiene `entrypoint: "sdk-cli"`) exigir que conste en la transcripción de esa sesión una aprobación válida de `ExitPlanMode` que no haya sido consumida por una corrida anterior de esa misma sesión, fallando cerrado cuando no conste.
2. Añadir y exportar `launchRefusal(cwd, { session, dataDir, now } = {})` en `plugins/aether/lib/autonomy.js` (con `cwd` cualquier ruta dentro del repositorio, de la que resuelve por sí misma la raíz principal) para que en una sesión del Lead `aether-delegate begin`, `aether-plan compile` y `seat-start` rechacen lanzar trabajo nuevo cuando hay una corrida abierta con `stop` en `'time'`, `'cost'` o `'quota'`, mientras que fuera de una sesión del Lead devuelva `null`.

**Interfaces:**
En `plugins/aether/lib/autonomy.js`:
- `readSessionRecords(configDir, sessionId)`: localiza y lee las líneas de `<sessionId>.jsonl` mediante `transcriptLines(sessionId, configDir)` (`findTranscript(sessionId, { configDir })` de `voice.js`); si no existe o no puede leerse devuelve `{ found: false, records: [] }`; si se lee, parsea cada línea JSON válida y devuelve `{ found: true, records }`.
- `isHeadlessTranscript(records)`: devuelve `true` únicamente cuando `records.length > 0`, al menos un registro tiene `r.entrypoint === 'sdk-cli'` y ningún registro con `typeof r.entrypoint === 'string'` tiene un valor distinto de `'sdk-cli'`.
- `countApprovedPlanModes(records)`: recorre los mensajes de `records` en orden; registra los `id` de bloques `tool_use` con `name === 'ExitPlanMode'` en mensajes `assistant`; y cuenta cuántos bloques `tool_result` en mensajes `user` posteriores referencian uno de esos `tool_use_id` (sin reutilizar el mismo `tool_use_id`), tienen `is_error !== true` y contienen texto (cadena en `content` o bloque `{ type: 'text', text }`) que empieza por `'User has approved your plan.'` (o contiene `\nUser has approved your plan.`).
- `countSessionRuns(root, sessionId)`: cuenta cuántos archivos `run.json` bajo `.aether/autonomy/` tienen `run.session === sessionId`.
- En `start(mainRoot, { quote, session, hours = null, usd = null } = {}, { configDir, dataDir = runDataDir(), now = Date.now() } = {})`:
  - Después de verificar la cita literal del dueño (`verifyQuote`) y que no haya otra corrida abierta (`openRun`), comprueba `isAetherSession(resolveDataDir(dataDir), session)` (de `./session.js`).
  - Solo cuando `isAetherSession(resolveDataDir(dataDir), session)` es `true`: lee `readSessionRecords(configDir, session)`. Si `!isHeadlessTranscript(records)`, calcula `approvals = countApprovedPlanModes(records)` y `priorRuns = countSessionRuns(mainRoot, session)`. Si `approvals <= priorRuns`, devuelve:
    `{ ok: false, reason: 'interactive session requires an approved plan in plan mode (ExitPlanMode) before starting an autonomous run; present the plan in plan mode and wait for the owner to approve it before running aether-autonomy start' }`.
  - Cuando `isAetherSession` es `false` (fuera de una sesión del Lead), no exige `ExitPlanMode` y conserva el comportamiento actual.
  - No añade campos nuevos al archivo de corrida (conserva exactamente `{ id, session, quote, quoteTime, started, ceilings, spend, brakeOff, quotaPauses, quotaCrossings, ended, outcome }`).
- `launchRefusal(cwd, { session = null, dataDir = runDataDir(), now = Date.now() } = {})`:
  - `cwd` es cualquier ruta dentro del repositorio: la raíz principal, un worktree enlazado o un subdirectorio. Cada llamador pasa la ruta que ya tiene (`r.cwd` en `begin`, `cwd` en `compile`, `top` en `seat-start`) y `launchRefusal` resuelve por sí misma la raíz principal, que es donde viven las corridas (`.aether/autonomy/`).
  - Primero comprueba `if (!isAetherSession(resolveDataDir(dataDir), session)) return null`.
  - Resuelve `const mainRoot = repoPaths(cwd).mainRoot` (importar `repoPaths` de `./git.js`); si `repoPaths` lanza porque `cwd` no está dentro de un repositorio git, devuelve `null`.
  - Llama a `status(mainRoot, { now })`. Si `!st.open || !st.stop`, devuelve `null`.
  - Si `st.stop === 'time'`, devuelve `{ stop: 'time', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} reached its time ceiling (\${st.hours.elapsed}h / \${st.hours.ceiling}h); close it with: aether-autonomy end --outcome ceiling\` }`.
  - Si `st.stop === 'cost'`, devuelve `{ stop: 'cost', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} reached its spend ceiling ($\${st.usd.spent} / $\${st.usd.ceiling}); close it with: aether-autonomy end --outcome ceiling\` }`.
  - Si `st.stop === 'quota'`, devuelve `{ stop: 'quota', id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message: \`autonomous run \${st.id} is paused by the quota brake (\${st.quota.percentUsed}% used; resumeAt \${st.quota.resumeAt || 'pending'}); wait until \${st.quota.resumeAt || 'the quota window resets'} or close the run with: aether-autonomy end --outcome incomplete\` }`.
- Exportar `launchRefusal` en `module.exports` de `plugins/aether/lib/autonomy.js`.
- En `tests/autonomy.test.js`:
  - Importar `useDataDir` en la línea 8: `const { tempDir, makeRepo, useDataDir, PLUGIN } = require('./helpers.js')`.
  - Definir `const QUOTE = HOURS` junto a `HOURS`.
  - Extender `human` en las líneas 21–22 (y en `tests/aether-autonomy.test.js`, `tests/quota-brake.test.js` y `tests/quota-brake-scenarios.test.js`) con un tercer parámetro opcional `extra = {}` y `entrypoint: 'sdk-cli'` por defecto:
    ```js
    const human = (text, time, extra = {}) =>
      JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text }, ...extra })
    ```

**Tests (write first):**
En `tests/autonomy.test.js` (tras actualizar la importación de `useDataDir`, `const QUOTE = HOURS` y la firma `human(text, time, extra = {})`):

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

test('start in a Lead session rejects interactive cli, missing-entrypoint, unknown-entrypoint and mixed transcripts without ExitPlanMode approval, succeeds once approved, resumes an open run without a new start, refuses reuse, and leaves non-Lead sessions unchanged', (t) => {
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
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:01:00.000Z') })
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

  // Missing entrypoint (no entrypoint field in JSON) fails closed without ExitPlanMode
  fs.writeFileSync(
    transcript(SESSION),
    [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: undefined })].join('\n') + '\n'
  )
  const missingEntrypoint = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(missingEntrypoint.ok, false)
  assert.match(missingEntrypoint.reason, /plan mode/i)

  // Unknown entrypoint ('desktop') fails closed without ExitPlanMode
  fs.writeFileSync(
    transcript(SESSION),
    [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'desktop' })].join('\n') + '\n'
  )
  const desktopEntrypoint = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(desktopEntrypoint.ok, false)
  assert.match(desktopEntrypoint.reason, /plan mode/i)

  // Mixed 'sdk-cli' and 'cli' records fail closed without ExitPlanMode
  fs.writeFileSync(
    transcript(SESSION),
    [
      human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'sdk-cli' }),
      human('continua', '2026-04-06T10:00:02.000Z', { entrypoint: 'cli' }),
    ].join('\n') + '\n'
  )
  const mixedEntrypoint = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(mixedEntrypoint.ok, false)
  assert.match(mixedEntrypoint.reason, /plan mode/i)

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

  // Resuming an open run reads status on the open run with no new start or new plan approval
  const resumed = autonomy.status(mainRoot, { now: Date.parse('2026-04-06T10:05:00.000Z') })
  assert.equal(resumed.open, true)
  assert.equal(resumed.id, approvedPlan.run.id)
  assert.equal(resumed.stop, null)

  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:10:00.000Z') })

  const reusedApproval = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:11:00.000Z') }
  )
  assert.equal(reusedApproval.ok, false)
  assert.match(reusedApproval.reason, /plan mode/i)
})

test('launchRefusal reports time, cost and quota stops in a Lead session, finds the run from a linked worktree, and returns null outside a Lead session or outside git', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir } = setup(t, {
    [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z')],
  })
  // The runs live in the main checkout of a real repository, and a linked worktree is another path into it.
  const repo = makeRepo(t)
  const mainRoot = repo.dir
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'linked/x', linked)
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

  // From a linked worktree the run of the main checkout is found all the same
  const fromLinked = autonomy.launchRefusal(linked, { session: SESSION, dataDir, now: t0 + 3601 * 1000 })
  assert.equal(fromLinked.stop, 'time')
  assert.equal(fromLinked.id, started.run.id)

  // Non-Lead session is not refused even when ceiling is reached
  assert.equal(autonomy.launchRefusal(mainRoot, { session: 'plain-session', dataDir, now: t0 + 3601 * 1000 }), null)

  // Outside a git repository there is no run to refuse
  assert.equal(autonomy.launchRefusal(tempDir(t, 'aether-nogit-'), { session: SESSION, dataDir, now: t0 + 3601 * 1000 }), null)

  // Quota pause
  const resetsAt = new Date(t0 + 4 * 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    mainRoot,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: t0 + 2000, dataDir }
  )
  const byQuota = autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 3000 })
  assert.equal(byQuota.stop, 'quota')
  assert.equal(byQuota.id, started.run.id)
  assert.match(byQuota.message, /aether-autonomy end --outcome incomplete/)

  // Spend ceiling (in a fresh run with a 10-hour ceiling)
  autonomy.end(mainRoot, 'incomplete', { now: t0 + 4000 })
  const startedCost = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 10, usd: 5 },
    { configDir, dataDir, now: t0 + 5000 }
  )
  assert.equal(startedCost.ok, true)
  autonomy.spend(mainRoot, 5, 'u1', { now: t0 + 6000 })
  const byCost = autonomy.launchRefusal(linked, { session: SESSION, dataDir, now: t0 + 7000 })
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.id, startedCost.run.id)
  assert.match(byCost.message, /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- `aether-autonomy start` permite abrir corridas en sesiones con `entrypoint: "sdk-cli"` o fuera de una sesión del Lead sin exigir plan mode.
- En sesiones del Lead con `entrypoint: "cli"`, ausente u otro valor, `aether-autonomy start` falla cerrado si no consta una aprobación válida de `ExitPlanMode` no consumida por una corrida previa de la misma sesión, y abre la corrida cuando sí consta.
- `launchRefusal` devuelve `null` fuera de una sesión del Lead, fuera de un repositorio git o cuando no hay corrida abierta con `stop`, y devuelve `{ stop, id, hours, usd, quota, message }` en una sesión del Lead cuando `stop` es `'time'`, `'cost'` o `'quota'`; encuentra la corrida abierta en la raíz principal también cuando se le da la ruta de un worktree enlazado.
- `node --test tests/autonomy.test.js tests/aether-autonomy.test.js tests/quota-brake.test.js tests/quota-brake-scenarios.test.js` pasa.

---

### Task 3: Extraer las skills `aether:models` y `aether:designing` y alinear `aether:skills`

**Aether:**
- Area: skills
- Owns: `plugins/aether/skills/models/SKILL.md`, `plugins/aether/skills/designing/SKILL.md`, `plugins/aether/skills/skills/SKILL.md`, `docs/reference/components.md`, `tests/new-skills.test.js`, `tests/help.test.js`, `tests/audit-docs.test.js`, `tests/codex-docs.test.js`, `tests/codex-release.test.js`, `tests/components-docs.test.js`, `tests/docs-030.test.js`, `tests/guards.test.js`, `tests/guards-helpers.test.js`, `tests/lanes-docs.test.js`, `tests/launcher.test.js`, `tests/spend-docs.test.js`, `tests/workflow-split.test.js`
- Depends on: Task 2 — comparte la página de componentes con docs-claims.test.js, que la Tarea 2 posee
- Depends on: Task 4 — comparte la página de componentes con docs-facts.test.js, que la Tarea 4 posee y cuya R15 lee las carpetas de skills
- Serves: R9, R10

**Goal:**
La salida de `/aether:design` ya lleva `skill: 'aether:designing'` (la Tarea 7, ya construida, lo añadió a `design.workflow.js`): esta tarea solo crea esa skill y no toca el workflow.

Crear `plugins/aether/skills/models/SKILL.md` (`name: models`) y `plugins/aether/skills/designing/SKILL.md` (`name: designing`) con el detalle de la tabla de modelos y del procedimiento de diseño extraídos de la skill de arranque (incluyendo el punto 6 de #204 sobre `aether-exam store specs/NNN-<topic>`), y actualizar en `plugins/aether/skills/skills/SKILL.md` la sintaxis real de `aether-autonomy trust` (punto 5 de #204).

**Interfaces:**
1. `plugins/aether/skills/models/SKILL.md`:
   - Frontmatter YAML con `name: models` y `description: "Reference for Aether's model index, pricing table, and current Claude, GPT, and Gemini model capabilities and vendor citations. Load when answering questions about models, pricing, effort levels, or vendor benchmarks."`.
   - Traslada literalmente la sección `## Models` de `plugins/aether/skills/using-aether/SKILL.md` (líneas 133–155), conservando el encabezado `## Models` y la tabla exacta con las columnas `| Model | Price | Speed | Its maker says |` y sus cuatro filas (`Haiku 5.5, \`haiku\``, `Sonnet 5.5, \`sonnet\``, `Opus 5.5, \`opus\``, `Fable 5.1`) para que `rubric(models)` en `tests/bootstrap-names.test.js` parsee `section(models, 'Models')` sin cambios. Incluye así las rutas a `models.json` (bajo `${CLAUDE_PLUGIN_ROOT}/config/models`) y a `prices.json` (bajo `${CLAUDE_PLUGIN_ROOT}/config`), las tres reglas del índice, la tabla completa de precios y citas del fabricante, y las viñetas de `Fixed models`, `Quota` y `Other CLIs`.
2. `plugins/aether/skills/designing/SKILL.md`:
   - Frontmatter YAML con `name: designing` y `description: "How the Lead prepares an intent card, runs /aether:design, and handles approved, clarify, dispute, and failed design outcomes, exams, and short designs. Load before writing intent.md, before running /aether:design, or when /aether:design returns."`.
   - Traslada palabra por palabra el contenido de `## Designing` de `plugins/aether/skills/using-aether/SKILL.md` (líneas 157–191: `**Ask only what matters.**`, `**Write the intent card.**`, `**Launch \`/aether:design\`**`, los cuatro resultados `- \`approved\`:`, `- \`clarify\`:`, `- \`dispute\`:` y `- \`failed\`:`, `**The Writer's questions.**`, `**A short design**`, `**Later changes.**`, `**Records.**` y `**The exam.**`), con un único cambio de texto (punto 6 de #204): en `- \`approved\`:`, donde dice ``run `aether-exam store`;`` pasa a ``run `aether-exam store specs/NNN-<topic>`;``.
3. `plugins/aether/skills/skills/SKILL.md`:
   - En la sección «Trust and the `skill-install` Class» (línea 44, el bloque `bash`), reemplazar `aether-autonomy trust <author>` por `aether-autonomy trust --author <author> --quote "<their words>"`.
4. Dos carpetas de skills nuevas hacen fallar a las pruebas que listan `plugins/aether/skills/`, así que esta tarea también edita:
   - `docs/reference/components.md`: dos filas nuevas en la tabla de piezas, junto a la de `skills`, que dicen `| \`models\` skill | \`aether:models\`: ... |` y `| \`designing\` skill | \`aether:designing\`: ... |` (la R15 de `tests/docs-facts.test.js` exige que la página nombre cada carpeta como `` `models` `` o `` `aether:models` ``). Las Tareas 12 y 13, que también poseen la página, dependen de esta.
   - `tests/help.test.js`: añadir a `EXCLUDED` `models: 'the Lead loads it itself; nobody invokes it by name'` y `designing: 'the Lead loads it itself; nobody invokes it by name'` (la prueba «the help names every skill the person invokes» pide que cada skill figure en la ayuda o en `EXCLUDED` con una razón).

**Lectores revisados:** `tests/docs-facts.test.js` lista la carpeta `skills/` en R11 y R15 y no se edita aquí (la posee la Tarea 4, de la que esta depende; la fila nueva de `components.md` basta para que R15 quede verde). Las pruebas de `Owns` que no son de skills (`audit-docs`, `codex-docs`, `codex-release`, `components-docs`, `docs-030`, `guards`, `guards-helpers`, `lanes-docs`, `launcher`, `spend-docs`, `workflow-split`) nombran la página de componentes entre comillas: se corren y no fijan nada de la tabla de skills, así que no se espera edición; si una fila nueva rompe una, se corrige aquí. Las Tareas 12 y 13 las co-poseen más adelante en la cadena; `tests/new-skills.test.js` es el único que lee `skills/skills/SKILL.md`; ninguna prueba fija la forma `trust <author>`.

**Tests (write first):**
Añadir en `tests/new-skills.test.js` (usando los ayudantes `read(...parts)` y `frontMatter(text)` definidos en ese archivo):

```js
test('the components page names the models and designing skills', () => {
  const components = fs.readFileSync(path.join(PLUGIN, '..', '..', 'docs', 'reference', 'components.md'), 'utf8')
  for (const name of ['models', 'designing']) assert.ok(components.includes(`\`aether:${name}\``), `components.md names aether:${name}`)
})

test('models and designing skills exist with valid frontmatter and expected content', () => {
  const models = read('skills', 'models', 'SKILL.md')
  const designing = read('skills', 'designing', 'SKILL.md')

  assert.equal(frontMatter(models).name, 'models')
  assert.ok(frontMatter(models).description.length > 20)
  assert.ok(models.includes('\n## Models\n'))
  assert.ok(models.includes('| Model | Price | Speed | Its maker says |'))
  assert.ok(models.includes(['config', 'models', 'models.json'].join('/')))
  assert.ok(models.includes(['config', 'prices.json'].join('/')))
  assert.match(models, /Haiku 5\.5/)
  assert.match(models, /Opus 5\.5/)

  assert.equal(frontMatter(designing).name, 'designing')
  assert.ok(frontMatter(designing).description.length > 20)
  assert.match(designing, /specs\/NNN-<topic>\/intent\.md/)
  assert.match(designing, /\/aether:design/)
  assert.match(designing, /aether-exam store specs\/NNN-<topic>/)
  assert.doesNotMatch(designing, /`aether-exam store`/)
})

test('skills skill uses --author flag in aether-autonomy trust command', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  assert.match(text, /aether-autonomy trust --author <author> --quote "<their words>"/)
  assert.doesNotMatch(text, /aether-autonomy trust <author>/)
})
```

**Acceptance:**
- `docs/reference/components.md` nombra las dos skills nuevas como `aether:models` y `aether:designing`, y `tests/help.test.js` las lista en `EXCLUDED` con su razón.
- `plugins/aether/skills/models/SKILL.md` y `plugins/aether/skills/designing/SKILL.md` existen con frontmatter válido (`name` y `description`).
- `plugins/aether/skills/designing/SKILL.md` documenta `aether-exam store specs/NNN-<topic>`.
- `plugins/aether/skills/skills/SKILL.md` documenta `aether-autonomy trust --author <author> --quote "<their words>"`.
- `node --test tests/new-skills.test.js tests/help.test.js` pasa.

---

### Task 4: Reemplazar «about five tool calls» por la regla contable en el sitio y en los tutoriales

**Aether:**
- Area: site-docs
- Owns: `site/index.html`, `site/app.js`, `docs/tutorials/first-request.md`, `docs/es/guias/primera-peticion.md`, `tests/site.test.js`, `tests/docs-facts.test.js`
- Depends on: none
- Serves: R6

**Goal:**
Reemplazar la regla vaga de «about five tool calls» / «unas cinco llamadas a herramientas» por la frase canónica de la regla contable (3 ediciones propias o 10 lecturas por turno, sin contar las pruebas tras una fusión) en `site/index.html:221`, `site/app.js:70,237`, `docs/tutorials/first-request.md:34` y `docs/es/guias/primera-peticion.md:34`, conservando el resto de cada oración tal como está hoy, dejando intactos el atributo `alt` de `site/index.html:223` y las claves `p.direct.a` de `site/app.js:71,238`.

**Interfaces:**
- Frase canónica en español (`COUNTABLE_ES`, idéntica en todos los lugares en español):
  `"a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan"`
- Frase canónica en inglés (`COUNTABLE_EN`, idéntica en todos los lugares en inglés):
  `"at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count"`
- En `site/index.html` (línea 221, `data-i18n="p.direct.w"`) y `site/app.js` (`DICT.es['p.direct.w']`, línea 70), que hoy dicen `Un cambio muy acotado: unas cinco llamadas a herramientas y ningún ciclo de editar-probar-corregir. El Lead lo hace él mismo, en su propia sesión y con su propio modelo.`, el texto pasa (idéntico en los dos archivos, porque `tests/site.test.js` los compara) a:
  `"Un cambio muy acotado, sin ciclo de editar-probar-corregir: a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan. El Lead lo hace él mismo, en su propia sesión y con su propio modelo."`
- En `site/app.js` (`DICT.en['p.direct.w']`, línea 237), que hoy dice `A very bounded change: about five tool calls and no edit-test-fix loop. The Lead does it itself, in its own session and on its own model.`:
  `"A very bounded change with no edit-test-fix loop: at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count. The Lead does it itself, in its own session and on its own model."`
- En `site/index.html:223` y `site/app.js:71,238`: `alt` y `p.direct.a` permanecen intactos (y la etiqueta `p.direct.c`, `EN LÍNEA · ~5 LLAMADAS` / `INLINE · ~5 CALLS`, no se toca: la spec no la pide).
- En `docs/tutorials/first-request.md` (línea 34), que hoy dice `- **Direct:** a very bounded change, a few files and about five tool calls, with no edit-test-fix loop. The Lead does it itself, in the conversation. You see it read, edit and run the test.`:
  `"- **Direct:** a very bounded change in a few files, with no edit-test-fix loop: at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count. The Lead does it itself, in the conversation. You see it read, edit and run the test."`
- En `docs/es/guias/primera-peticion.md` (línea 34), que hoy dice `- **Directo:** un cambio muy acotado, pocos archivos y unas cinco llamadas a herramientas, sin un ciclo de editar, probar y corregir. El Lead lo hace él mismo, en la conversación. Lo ves leer, editar y correr el test.`:
  `"- **Directo:** un cambio muy acotado, en pocos archivos y sin un ciclo de editar, probar y corregir: a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan. El Lead lo hace él mismo, en la conversación. Lo ves leer, editar y correr el test."`

**Lectores revisados:** ninguna prueba fija «about five tool calls», «unas cinco llamadas», `p.direct` ni la frase del tutorial; `tests/docs-claims-rest.test.js` y `tests/codex-docs.test.js` recorren `site/index.html` en busca de patrones retirados y no fijan la regla; `tests/docs-facts.test.js` y `tests/site.test.js` están en `Owns`.

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

Y añadir en `tests/docs-facts.test.js` (usando `read(rel)` definido en ese archivo):

```js
test('the two tutorials state the canonical countable rule of the direct path instead of "about five tool calls" (R6)', () => {
  const enRule = 'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  const esRule = 'a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan'
  const en = read('docs/tutorials/first-request.md')
  const es = read('docs/es/guias/primera-peticion.md')
  assert.ok(en.includes(enRule))
  assert.ok(es.includes(esRule))
  assert.doesNotMatch(en, /about five tool calls/)
  assert.doesNotMatch(es, /unas cinco llamadas a herramientas/)
})
```

**Acceptance:**
- `site/index.html`, `site/app.js`, `docs/tutorials/first-request.md` y `docs/es/guias/primera-peticion.md` contienen la frase canónica exacta de su idioma (`COUNTABLE_ES` / `COUNTABLE_EN`) y ya no contienen `"about five tool calls"` ni `"unas cinco llamadas a herramientas"` en el texto visible del camino directo.
- `site/index.html:223` y `p.direct.a` en `site/app.js:71,238` permanecen intactos.
- `node --test tests/site.test.js tests/docs-facts.test.js` pasa.

---

### Task 5: Avisar una vez por resultado sin veredicto al cerrar el turno del Lead (`Stop`) e ignorar subagentes

**Aether:**
- Area: continuity
- Owns: `plugins/aether/bin/aether-continuity`, `plugins/aether/lib/continuity-hook.js`, `tests/continuity-hook.test.js`, `tests/session-start-continuity.test.js`
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
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/plan-compile.js`, `tests/delegate-task.test.js`, `tests/delegate-authorize.test.js`, `tests/delegate-skills.test.js`, `tests/ladder-one-source.test.js`, `tests/baseline.test.js`
- Depends on: Task 2 — usa autonomy.launchRefusal para comprobar si hay una corrida abierta con stop en time, cost o quota
- Serves: R3, R12

**Goal:**
Hacer que en una sesión del Lead `aether-delegate begin` (`plugins/aether/lib/delegate-task.js`) y `aether-plan compile` (`plugins/aether/lib/plan-compile.js`) comprueben `autonomy.launchRefusal` y rechacen lanzar trabajo nuevo cuando hay una corrida abierta con `stop` en `'time'`, `'cost'` o `'quota'`, nombrando el `id` de la corrida, el tope o pausa y el comando `aether-autonomy end`, mientras que fuera de una sesión del Lead se comporten exactamente como hoy (C7).

**Interfaces:**
1. En `plugins/aether/lib/delegate-task.js`:
   - `autonomyRefusedPlan(r, ctx, refusal)`: construye `prompt = \`Aether delegate task \${ctx.id} was not launched: \${refusal.message}. Do not do any work. Tell the Lead why the launch was refused.\`` y llama a `refusedLaunchPlan(r, ctx, prompt, prompt)` añadiendo `stop: refusal.stop` y `run: refusal.id` al plan devuelto.
   - En `begin(input, deps = {})`: tras construir `ctx` (antes de comprobar `next.status` o cargar skills), llamar a `autonomy.launchRefusal(r.cwd, { session, dataDir: r.dataDir, now: r.now() })`; `r.cwd` es la ruta de la llamada, sea la raíz principal o un worktree enlazado, y `launchRefusal` resuelve la raíz principal. Si devuelve un objeto `refusal`, retornar `autonomyRefusedPlan(r, ctx, refusal)`.
2. En `plugins/aether/lib/plan-compile.js`:
   - En `compile(planArg, rest, { cwd = process.cwd(), stdout = process.stdout, env = process.env } = {})`: tras resolver `repo`, llamar a `autonomy.launchRefusal(cwd, { session: env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || null, dataDir: run.dataDir(env) })`.
   - Si devuelve `refusal`, llamar a `fail([refusal.message], [], stdout)` (sale con código 1 e imprime `{ ok: false, errors: [refusal.message], warnings: [] }`).

**Tests (write first):**
1. Añadir en `tests/delegate-task.test.js` (usando `task.begin`, `makeRepo`, `tempDir`, `BRIEF('t1')`, `autonomy` y `markSession`):

```js
test('begin refuses to launch a delegate in a Lead session when an open autonomous run hit time, cost, or quota stop, also from a linked worktree, and leaves non-Lead sessions unchanged', async (t) => {
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
  // The run is opened in the main checkout; a Lead that works in a linked worktree must be refused as well.
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'linked/x', linked)

  const t0 = Date.parse('2026-04-12T10:00:00.000Z')
  const started = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)

  // The deps are shaped like world(): the native settings, a pickPair and a newId, with the repository as cwd.
  const ask = (session, id, nowMs, cwd = repo.dir) =>
    task.begin(
      { session, event: { subagent_type: 'general-purpose', description: 'build feature', prompt: BRIEF(id) } },
      { dataDir, cwd, settings: NATIVE, now: () => nowMs, newId: () => `gen-${id}`, pickPair: async () => ({ pick: null, quota: [] }) }
    )

  // Time stop in Lead session
  const byTime = await ask('sess-1', 't-time', t0 + 3605 * 1000)
  assert.equal(byTime.kind, 'refused')
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.run, started.run.id)
  assert.match(byTime.notes.join('\n'), /aether-autonomy end --outcome ceiling/)

  // The same refusal from a linked worktree
  const fromLinked = await ask('sess-1', 't-linked', t0 + 3605 * 1000, linked)
  assert.equal(fromLinked.kind, 'refused')
  assert.equal(fromLinked.stop, 'time')
  assert.equal(fromLinked.run, started.run.id)

  // Non-Lead session proceeds normally even when ceiling is reached (C7)
  const nonLead = await ask('plain-session', 't-plain', t0 + 3605 * 1000)
  assert.equal(nonLead.kind, 'first')

  // Quota stop in Lead session (within time ceiling)
  const resetsAt = new Date(t0 + 4 * 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    repo.dir,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: t0 + 1000, dataDir }
  )
  const byQuota = await ask('sess-1', 't-quota', t0 + 2000)
  assert.equal(byQuota.kind, 'refused')
  assert.equal(byQuota.stop, 'quota')
  assert.equal(byQuota.run, started.run.id)
  assert.match(byQuota.notes.join('\n'), /aether-autonomy end --outcome incomplete/)

  // Cost stop in Lead session (in a fresh run with 10h ceiling)
  autonomy.end(repo.dir, 'incomplete', { now: t0 + 3000 })
  const startedCost = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 10, usd: 5 },
    { configDir, dataDir, now: t0 + 4000 }
  )
  assert.equal(startedCost.ok, true)
  autonomy.spend(repo.dir, 5, 'u1', { now: t0 + 5000 })
  const byCost = await ask('sess-1', 't-cost', t0 + 6000)
  assert.equal(byCost.kind, 'refused')
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.run, startedCost.run.id)
  assert.match(byCost.notes.join('\n'), /aether-autonomy end --outcome ceiling/)
})
```

2. Añadir en `tests/baseline.test.js` (importando `makeRepo`, `writePlan`, `runBin`, `PLAN_BIN` de `./helpers.js` y `plan`, `task` de `./plan-fixtures.js`):

```js
test('aether-plan compile refuses in a Lead session when an open autonomous run hit time, cost, or quota stop, and leaves non-Lead sessions unchanged', (t) => {
  const { makeRepo, writePlan, runBin, PLAN_BIN } = require('./helpers.js')
  const { plan, task } = require('./plan-fixtures.js')
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

  const tasksFile = writePlan(repo.dir, plan([task(1), task(2)]))

  // Time stop in Lead session
  const resTime = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resTime.status, 0)
  assert.match(resTime.json.errors[0], new RegExp(started.run.id))
  assert.match(resTime.json.errors[0], /aether-autonomy end --outcome ceiling/)

  // Non-Lead session compiles normally (C7)
  const resPlain = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'plain-session',
  })
  assert.equal(resPlain.status, 0)

  // Quota and cost stops in Lead session
  autonomy.end(repo.dir, 'ceiling', { now: Date.now() - 1000 })
  const started2 = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 10, usd: 5 },
    { configDir, dataDir, now: Date.now() }
  )
  assert.equal(started2.ok, true)
  const resetsAt = new Date(Date.now() + 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    repo.dir,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: Date.now(), dataDir }
  )
  const resQuota = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resQuota.status, 0)
  assert.match(resQuota.json.errors[0], /aether-autonomy end --outcome incomplete/)

  autonomy.end(repo.dir, 'incomplete', { now: Date.now() })
  const started3 = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 10, usd: 5 },
    { configDir, dataDir, now: Date.now() }
  )
  assert.equal(started3.ok, true)
  autonomy.spend(repo.dir, 5, 'u1', { now: Date.now() })
  const resCost = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resCost.status, 0)
  assert.match(resCost.json.errors[0], new RegExp(started3.run.id))
  assert.match(resCost.json.errors[0], /aether-autonomy end --outcome ceiling/)
})
```

**Acceptance:**
- En una sesión del Lead con una corrida autónoma abierta cuyo `stop` es `'time'`, `'cost'` o `'quota'`, `aether-delegate begin` devuelve un plan `refused` con el `id` de la corrida, el motivo y `aether-autonomy end` (también cuando corre desde un worktree enlazado y la corrida está en la raíz principal), y `aether-plan compile` falla con código distinto de 0 y el mismo mensaje claro.
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
   - En `start(cwd, flags, { env = process.env, now = Date.now() } = {})`: después de resolver `top` y validar `checked`, y antes de escoger par o crear el worktree del asiento, llamar a `autonomy.launchRefusal(top, { session: checked.session, dataDir: run.dataDir(env), now })`; `top` es el worktree de la llamada (`repoPaths(cwd).worktree`) y `launchRefusal` resuelve la raíz principal donde viven las corridas.
   - Si devuelve `refusal`, retornar `{ started: false, refused: true, stop: refusal.stop, run: refusal.id, reason: refusal.message }`.
2. En `plugins/aether/workflows/design.workflow.js`:
   - En `awaitSeat({ seat, doc, base, flags, exclude, text, phase })`: tras `const started = parseObject(await ops(...))`, antes de `if (started.error || started.started !== true || typeof started.id !== 'string')`, si `started && started.refused === true` retornar `{ id: null, refused: true, stop: started.stop, run: started.run, note: started.reason || 'autonomous run ceiling reached' }`.
   - En `seatRound({ seat, doc, step, text, schema, nativeSchema = schema, phase, author = null, writes = null })`: tras `const waited = await awaitSeat(...)`, si `waited.refused === true` asignar `record.note = waited.note` y retornar de inmediato `{ failed: waited.note, refused: true, stop: waited.stop, run: waited.run }` (sin volver a hacer `rounds.push(record)`, que ya corrió al abrir la ronda en `design.workflow.js:614`, y sin reintentar ni llamar a `nativeAnswer`).
   - En `failure(step, reason, extra = {})` y en la propagación de rondas fallidas (`spec`, `review`, `plan`, `fixed`): conservar `stop` y `run` cuando vengan en la ronda fallida.
   - En el `return` final del workflow (`return { status, mode, feature, skill: 'aether:designing', verdicts, rounds, times: timesOf(rounds), ...(writerQuestions.length > 0 ? { writerQuestions } : {}), ...fields }`) y en los retornos tempranos de validación: incluir siempre `skill: 'aether:designing'`.

**Tests (write first):**
1. Añadir en `tests/seat-calls.test.js` (usando `seatRepo`, `modEnv`, `writeMessage`, `tempDir`, `seatCalls.start`, `autonomy` y `markSession`):

```js
test('seatCalls.start refuses in a Lead session when an open autonomous run hit time, cost, or quota stop, and leaves non-Lead sessions unchanged', (t) => {
  const { tempDir } = require('./helpers.js')
  const seatCalls = require('../plugins/aether/lib/seat-calls.js')
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

  const ask = (session, nowMs) => {
    const digest = writeMessage(repo, 'write spec', session)
    return seatCalls.start(
      repo.dir,
      { seat: 'writer', session, feature: FEATURE, doc: 'spec', superdelegation: 'off', harnesses: 'agy', digest },
      { env, now: nowMs }
    )
  }

  // Time stop in Lead session
  const byTime = ask('s1', t0 + 3605 * 1000)
  assert.equal(byTime.started, false)
  assert.equal(byTime.refused, true)
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.run, started.run.id)
  assert.match(byTime.reason, /aether-autonomy end --outcome ceiling/)

  // Non-Lead session is not refused by launchRefusal (C7); its round starts a real runner, which the test stops
  const nonLead = ask('plain-session', t0 + 3605 * 1000)
  try {
    assert.equal(nonLead.started, true)
    assert.notEqual(nonLead.refused, true)
  } finally {
    if (typeof nonLead.id === 'string') seatCalls.stop(repo.dir, nonLead.id)
  }

  // Quota stop in Lead session
  const resetsAt = new Date(t0 + 4 * 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    repo.dir,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: t0 + 1000, dataDir: env.AETHER_DATA_DIR }
  )
  const byQuota = ask('s1', t0 + 2000)
  assert.equal(byQuota.refused, true)
  assert.equal(byQuota.stop, 'quota')
  assert.match(byQuota.reason, /aether-autonomy end --outcome incomplete/)

  // Cost stop in Lead session
  autonomy.end(repo.dir, 'incomplete', { now: t0 + 3000 })
  const startedCost = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 's1', hours: 10, usd: 5 },
    { configDir, dataDir: env.AETHER_DATA_DIR, now: t0 + 4000 }
  )
  assert.equal(startedCost.ok, true)
  autonomy.spend(repo.dir, 5, 'u1', { now: t0 + 5000 })
  const byCost = ask('s1', t0 + 6000)
  assert.equal(byCost.refused, true)
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.run, startedCost.run.id)
  assert.match(byCost.reason, /aether-autonomy end --outcome ceiling/)
})
```

2. Añadir en `tests/workflow-design.test.js` (usando `go(ARGS, overrides)` y `ARGS` definidos en ese archivo, inyectando el rechazo a través del rol `ops` en el verbo `seat-start`):

```js
test('design workflow aborts immediately without native fallback when seat-start is refused by time, cost, or quota stop and includes skill aether:designing', async () => {
  for (const [stop, reason] of [
    ['time', 'autonomous run run-1 reached its time ceiling (1.1h / 1h); close it with: aether-autonomy end --outcome ceiling'],
    ['cost', 'autonomous run run-1 reached its spend ceiling ($5 / $5); close it with: aether-autonomy end --outcome ceiling'],
    ['quota', 'autonomous run run-1 is paused by the quota brake (80% used; resumeAt pending); close the run with: aether-autonomy end --outcome incomplete'],
  ]) {
    let writerCalled = false
    const run = await go(ARGS, {
      ops: (call, fallback) =>
        call.command.verb === 'seat-start'
          ? {
              started: false,
              refused: true,
              stop,
              run: 'run-1',
              reason,
            }
          : fallback(call),
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
- Owns: `plugins/aether/lib/continuity-posttool.js`, `plugins/aether/lib/guard.js`, `tests/continuity-posttool.test.js`, `tests/continuity-posttool-skills.test.js`, `tests/tree-check.test.js`, `tests/guard-claude.test.js`, `tests/guard-heredoc.test.js`, `tests/guard-intent.test.js`
- Depends on: Task 2 — comparte las pruebas de guard.js que la Tarea 2 ya posee (guard.test.js, guard-merge-main, guard-skills, guard-tidy y copies-classes)
- Serves: R7, R12

**Goal:**
Añadir en `plugins/aether/lib/continuity-posttool.js` el conteo por turno de ediciones propias de código/pruebas (`DIRECT_EDIT_LIMIT = 3`) y de lecturas/búsquedas en el código (`DIRECT_READ_LIMIT = 10`) en la sesión del Lead, emitiendo un aviso no bloqueante (`additionalContext`) una sola vez por turno al alcanzar cualquiera de los dos límites, respetando la firma existente `posttool(input, ctx)` que devuelve `null` o `{ additionalContext }`. El conteo no cuenta lo que R7 no cuenta (el diario de la corrida, la tarjeta de intención, `specs/`, `docs/`, la memoria, las comprobaciones como `git status` o `ls`, las corridas de pruebas) y ve igual a un Lead que trabaja en un worktree enlazado.

**Interfaces:**
En `plugins/aether/lib/guard.js`: añadir `commandSegments`, `dropWrappers`, `nameOf` y `redirectTargets` al `module.exports` existente, sin cambiar ninguna función. `tests/guards.test.js` rechaza las funciones duplicadas en `plugins/aether/lib/`, así que el conteo las importa de `guard.js` y no las escribe otra vez. Las pruebas que fijan `guard.js` (las tres de `Owns` y las que posee la Tarea 2) no se editan: exportar no cambia ninguna función, y solo se corren para comprobarlo.

`continuity-posttool.js` pasa a importar `guard.js`, una arista nueva de `lib/`. Se comprobó con `requireGraph` y `findCycles` de `guards-helpers.js` que no cierra ningún ciclo, que es lo que piden `layers.test.js` y la R14 de `guards.test.js`; ninguna regla de `guards*.test.js` limita qué familia puede pedir otra. La importación está permitida y el diseño no cambia.

En `plugins/aether/lib/continuity-posttool.js`:
- Constantes exportadas: `DIRECT_EDIT_LIMIT = 3`, `DIRECT_READ_LIMIT = 10`.
- `posttool(input, ctx = {})` conserva su firma y valor de retorno actuales (`null` cuando ningún manejador dispara, o `{ additionalContext: texts.join('\n\n') }` cuando al menos un manejador de `HANDLERS` devuelve una cadena).
- El nuevo manejador `directTurnBudget(input, ctx)` en `HANDLERS`:
  - Retorna `null` de inmediato si `Boolean(input && input.agent_id)` (subagente) o si `!input || typeof input.session_id !== 'string' || !ctx.dataDir || !isAetherSession(ctx.dataDir, input.session_id)`.
  - Guarda el estado por sesión en `<ctx.dataDir>/continuity/<session_id>.json`: `{ promptId: string | null, sinceNoteAt: number | null, edits: number, reads: number, notified: boolean }`.
  - **Reinicio.** Lee la nota de continuidad de la sesión con `readNote(continuityDir({ cwd: input.cwd, env: ctx.env, home: ctx.home }), input.session_id)` (de `continuity-store.js`) y toma su `updatedAt` como `noteAt` (`null` si no hay nota). Reinicia a `{ promptId, sinceNoteAt: noteAt, edits: 0, reads: 0, notified: false }` cuando `typeof input.prompt_id === 'string'` y difiere de `state.promptId`, o cuando `noteAt` es un número mayor que `state.sinceNoteAt` (o `state.sinceNoteAt` es `null`), la haya escrito quien la haya escrito: `stop`, `precompact`, `postcompact`, `stopfailure` y `sessionend` escriben todos `updatedAt`, y cualquiera de ellos reinicia. El `stop` de la Tarea 5 no registra ningún campo nuevo. Cuando no hay estado guardado, lo crea con `promptId: input.prompt_id ?? null` y `sinceNoteAt: noteAt`, sin que eso cuente como un reinicio.
  - `isExemptPath(filePath, cwd, input, ctx)`: un solo predicado para ediciones y para lecturas. Resuelve `abs = path.resolve(cwd, filePath)` y devuelve `true` cuando: alguno de los segmentos de la ruta es `.aether`, `.specify`, `specs` o `docs`; o su nombre base es `README.md`, `CLAUDE.md` o `AGENTS.md`; o `abs === '/dev/null'`; o `abs` cae bajo el directorio de configuración de Claude (`ctx.env.CLAUDE_CONFIG_DIR || path.join(ctx.home || os.homedir(), '.claude')`, la misma resolución que usa `memoryDir` de `continuity-store.js`) o bajo `memoryDir({ cwd, env: ctx.env, home: ctx.home })`; o `abs` cae bajo `path.dirname(input.scratchpad_dir)` cuando `input.scratchpad_dir` es una cadena no vacía. «Cae bajo» usa el mismo idioma de `memoryReminder` (`path.relative` que no empieza por `..` ni es absoluto). No exime el directorio temporal del sistema operativo entero, porque los repositorios de las pruebas viven en él. Los segmentos se leen de `path.relative(cwd, abs)` cuando `abs` cae dentro de `cwd` y de `abs` en otro caso (supuesto A5 de `plan.md`); el último segmento cuenta porque `Grep` y `Glob` nombran directorios.
  - `bashWriteTargets(command, cwd)`: devuelve las rutas absolutas que escribe un comando `Bash`. Recorre `commandSegments(command)` en orden con un directorio base que empieza en `cwd`: un segmento `cd <dir>` (la primera palabra que no es opción tras `cd`) mueve la base a `path.resolve(base, dir)` para los segmentos siguientes, y cada ruta se resuelve desde la base de su propio segmento. Las rutas son: los destinos de `redirectTargets(segment)` (se descartan los vacíos y los que empiezan por `&`, como el de `2>&1`), los archivos de `tee` (las palabras que no son opciones tras `tee`), los archivos de `sed -i` / `sed -i.bak` / `sed --in-place` (las palabras que no son opciones tras el script, que es la primera) y el destino de `cp` y de `mv` (la última palabra que no es opción). El nombre del comando sale de `nameOf(dropWrappers(segment)[0])`.
  - `isDirectEdit(input, ctx)`: `true` cuando `tool_name` es `Write`, `Edit`, `MultiEdit` (`tool_input.file_path`) o `NotebookEdit` (`tool_input.notebook_path`) y esa ruta existe como cadena y no es exenta; o cuando `tool_name === 'Bash'` y alguna ruta de `bashWriteTargets(command, input.cwd || '.')` no es exenta.
  - `isDirectRead(input, ctx)`: `true` cuando `tool_name === 'Read'` y `tool_input.file_path` es una cadena que no es exenta; o `tool_name` es `Grep` o `Glob` y `tool_input.path` no viene dado como cadena no vacía exenta; o `tool_name === 'Bash'`, la llamada no es una edición directa (`isDirectEdit(input, ctx)` es `false`: un destino `/dev/null` es exento y no la vuelve edición, de modo que `rg foo src 2>/dev/null` sigue siendo una lectura) y al menos uno de sus comandos cuenta. Se decide por comando, no por el primero de la línea: se recorre `commandSegments(command)` en orden con el mismo directorio base que `bashWriteTargets` (empieza en `cwd`; un segmento `cd <dir>` lo mueve para los siguientes, y `cd /repo && sed -n '1,5p' src/a.js` lee desde `/repo`). `commandSegments` ya parte cada tubería en segmentos, uno por comando (`cat src/a.js | head -5` son dos segmentos). De cada segmento: el nombre sale de `nameOf(dropWrappers(segment)[0])`, y sus rutas son las palabras que le siguen (en `git`, tras el subcomando) que no empiezan por `-`, resueltas desde la base del segmento, que existen en disco. **Lectores de archivos** (`cat`, `head`, `tail`, `less`, `more`, `jq`, `sed`, `awk`, `grep`, `egrep`, `fgrep`): cuentan solo cuando tienen al menos una ruta existente no exenta; sin ninguna ruta filtran la salida de otro comando y no cuentan. **Buscadores de árbol** (`rg`, `find`, `fd`, y `git` con subcomando `grep`, `show` o `diff`; el subcomando es la primera palabra tras `git` que no empieza por `-` y no es el valor de `-C` ni de `-c`): cuentan cuando no tienen ninguna ruta existente (una búsqueda en todo el árbol, como `rg foo`) o cuando tienen al menos una ruta existente no exenta. Por eso `cat src/a.js | head -5` suma una lectura (la de `cat`; `head -5` no tiene ruta) y `aether-autonomy status | grep stop` no suma ninguna (`aether-autonomy` no es un lector y `grep stop` no nombra ninguna ruta). `wc`, `ls`, `stat`, `diff`, `cmp`, `git log` y `git status` no están en las listas, y una corrida de pruebas (`npm test`, `node --test`, `pytest`, …) o un binario `aether-*` tampoco, así que nunca cuentan.
  - Cada llamada suma como mucho 1 a `edits` (si `isDirectEdit`) y como mucho 1 a `reads` (si `isDirectRead`), aunque un `Bash` nombre varias rutas.
  - Cuando `edits >= DIRECT_EDIT_LIMIT` o `reads >= DIRECT_READ_LIMIT` y `state.notified === false`: marca `state.notified = true`, guarda el estado y devuelve la cadena de aviso, que no bloquea ni se repite en el resto del turno, y que dice la regla y su excepción. En inglés: `"Aether: the direct-path limit for this turn was reached (3 own edits to code or tests, or 10 reads or searches in the code). By the three paths, the rest of this work goes to a delegate task (Agent, with an AETHER-TASK brief), unless the owner asked you to do it yourself."` En español (`isSpanish(ctx.env)`): `"Aether: se alcanzó el límite del camino directo en este turno (3 ediciones propias de código o pruebas, o 10 lecturas o búsquedas en el código). Según los tres caminos, el resto de este trabajo pasa a una tarea delegada (Agent, con un encargo AETHER-TASK), salvo que el dueño te haya pedido hacerlo a ti."`
  - El estado se guarda con `writeFileAtomic` y se lee con `readJsonOrNull` de `common.js`; un error al leer o escribir el estado no rompe la llamada (el manejador devuelve `null`).

**Lectores revisados:** las pruebas que leen `continuity-posttool.js` (`continuity-posttool-skills`, `tree-check`) y las que fijan `guard.js` (`guard`, `guard-claude`, `guard-heredoc`, `guard-intent`, `guard-merge-main`, `guard-skills`, `guard-tidy`, `copies-classes`) están en `Owns` de esta tarea o de la Tarea 2; el matcher de `hooks.json` lo cambia la Tarea 11, que posee `continuity-hook`.

**Tests (write first):**
Añadir en `tests/continuity-posttool.test.js` (usando `world(t)`, `posttool.posttool`, `store` y `markSession` ya importados en ese archivo):

```js
// A Lead session in a throwaway repository with a source file and a spec, and the PostToolUse call for it.
function leadWorld(t, session) {
  const w = world(t)
  markSession(w.data, session, 1000, { repo: w.repo.dir, claude: null })
  fs.mkdirSync(path.join(w.repo.dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(w.repo.dir, 'specs', '031-demo'), { recursive: true })
  fs.writeFileSync(path.join(w.repo.dir, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(w.repo.dir, 'specs', '031-demo', 'plan.md'), 'plan\n')
  const ctx = { env: w.env, home: w.configDir, dataDir: w.data }
  const call = (tool_name, tool_input, extra = {}) =>
    posttool.posttool({ session_id: session, prompt_id: 'p1', cwd: w.repo.dir, tool_name, tool_input, ...extra }, ctx)
  const file = (...parts) => path.join(w.repo.dir, ...parts)
  return { w, ctx, call, file }
}

test('posttool warns once on the 3rd own edit to code or tests in a turn; exempt paths, subagents and other sessions add nothing (R7)', (t) => {
  const { w, ctx, call, file } = leadWorld(t, 's-edit')

  // A session that is not the Lead's neither counts nor writes anything.
  const plain = posttool.posttool(
    { session_id: 'a-plain-session', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: file('src', 'a.js') } },
    ctx
  )
  assert.equal(plain, null)
  assert.equal(fs.existsSync(path.join(w.data, 'continuity')), false)

  for (const exempt of [
    file('specs', '031-demo', 'intent.md'),
    file('.aether', 'autonomy', 'x', 'diary.md'),
    file('docs', 'guide.md'),
    file('README.md'),
    path.join(w.configDir, 'plans', 'p.md'),
  ]) {
    assert.equal(call('Write', { file_path: exempt }), null, exempt)
  }
  assert.equal(call('Bash', { command: 'echo x > /dev/null' }), null)
  assert.equal(call('Edit', { file_path: file('src', 'a.js') }, { agent_id: 'sub-1' }), null)

  assert.equal(call('Edit', { file_path: file('src', 'a.js') }), null) // 1
  assert.equal(call('Write', { file_path: file('tests', 'a.test.js') }), null) // 2
  const third = call('Bash', { command: 'echo "x" > src/b.js' }) // 3
  assert.ok(third && typeof third.additionalContext === 'string')
  assert.match(third.additionalContext, /3/)
  assert.match(third.additionalContext, /delegate|Agent/i)
  assert.match(third.additionalContext, /unless the owner asked you to do it yourself/) // the rule and its exception
  assert.equal(call('Edit', { file_path: file('src', 'c.js') }), null) // the notice comes once per turn
})

test('the count restarts when prompt_id changes: the 3rd edit of the next turn warns again (R7)', (t) => {
  const { call, file } = leadWorld(t, 's-turns')
  const edit = (n, extra = {}) => call('Edit', { file_path: file('src', `e${n}.js`) }, extra)
  assert.equal(edit(1), null)
  assert.equal(edit(2), null)
  assert.ok(edit(3))
  // The next turn is a new count: its first two edits are silent and its third warns again.
  assert.equal(edit(4, { prompt_id: 'p2' }), null) // 1
  assert.equal(edit(5, { prompt_id: 'p2' }), null) // 2
  const again = edit(6, { prompt_id: 'p2' }) // 3
  assert.ok(again && typeof again.additionalContext === 'string')
  assert.match(again.additionalContext, /3/)
  assert.equal(edit(7, { prompt_id: 'p2' }), null) // once per turn
})

test('with no prompt_id, a continuity note of the session newer than the stored mark restarts the count, whoever wrote it, and an equal one does not (R7)', (t) => {
  const { w, call, file } = leadWorld(t, 's-note')
  const dir = store.continuityDir({ cwd: w.repo.dir, env: w.env, home: w.configDir })
  const writeNote = (updatedAt, extra = {}) => store.writeNote(dir, { session: 's-note', updatedAt, ...extra })
  const edit = (n) => call('Edit', { file_path: file('src', `n${n}.js`) }, { prompt_id: undefined })

  writeNote(1000)
  assert.equal(edit(1), null)
  assert.equal(edit(2), null)
  assert.ok(edit(3))
  // The same note again: nothing restarts, so three more edits stay silent.
  writeNote(1000)
  assert.equal(edit(4), null)
  assert.equal(edit(5), null)
  assert.equal(edit(6), null)
  // A newer note, here the one a failed stop writes: the count restarts and the third edit warns again.
  writeNote(2000, { cut: { at: 2000, reason: 'x' } })
  assert.equal(edit(7), null)
  assert.equal(edit(8), null)
  const again = edit(9)
  assert.ok(again && typeof again.additionalContext === 'string')
})

test('posttool counts reads of code and searches, not reads of notes, specs or docs, nor checks and test runs, and warns once on the 10th (R7)', (t) => {
  const { w, ctx, call, file } = leadWorld(t, 's-read')
  // None of these counts; each runs three times, so one that did count would warn before the tenth counted read.
  const notCounted = [
    ['Read', { file_path: file('specs', '031-demo', 'plan.md') }],
    ['Read', { file_path: file('CLAUDE.md') }],
    ['Read', { file_path: path.join(w.configDir, 'plans', 'p.md') }],
    ['Grep', { pattern: 'foo', path: file('docs') }],
    ['Bash', { command: "sed -n '1,5p' specs/031-demo/plan.md" }],
    ['Bash', { command: 'git status' }],
    ['Bash', { command: 'ls -la' }],
    ['Bash', { command: 'wc -l src/a.js' }],
    ['Bash', { command: 'aether-autonomy status | grep stop' }],
    ['Bash', { command: 'npm test' }],
    ['Bash', { command: 'node --test tests/a.test.js' }],
  ]
  for (let pass = 0; pass < 3; pass++) {
    for (const [tool, input] of notCounted) assert.equal(call(tool, input), null, `${tool} ${JSON.stringify(input)}`)
  }
  const counted = [
    ['Read', { file_path: file('src', 'a.js') }],
    ['Bash', { command: 'cat src/a.js' }],
    ['Bash', { command: 'rg foo' }],
    ['Grep', { pattern: 'foo' }],
    ['Glob', { pattern: '**/*.js' }],
    ['Grep', { pattern: 'foo', path: file('src') }],
    ['Bash', { command: 'grep -rn foo src/' }],
    ['Bash', { command: 'git grep foo' }],
    ['Read', { file_path: file('src', 'a.js') }],
  ]
  for (const [tool, input] of counted) assert.equal(call(tool, input), null, `${tool} ${JSON.stringify(input)}`)
  const tenth = posttool.posttool(
    { session_id: 's-read', prompt_id: 'p1', cwd: w.repo.dir, tool_name: 'Read', tool_input: { file_path: file('src', 'a.js') } },
    { ...ctx, env: { ...w.env, LANG: 'es_ES.UTF-8' } }
  )
  assert.ok(tenth && typeof tenth.additionalContext === 'string')
  assert.match(tenth.additionalContext, /10/)
  assert.match(tenth.additionalContext, /tarea delegada/)
  assert.match(tenth.additionalContext, /salvo que el dueño/)
  assert.equal(call('Read', { file_path: file('src', 'a.js') }), null) // once per turn
})

test('from a linked worktree the diary of the run in the main checkout and the session temporary folder add nothing, while edits in the worktree do (R7)', (t) => {
  const { w, call } = leadWorld(t, 's-linked')
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  w.repo.git('worktree', 'add', '-q', '-b', 'linked/x', linked)
  const scratch = path.join(tempDir(t, 'aether-session-tmp-'), 'scratchpad')
  const here = (tool, input) => call(tool, input, { cwd: linked, scratchpad_dir: scratch })
  for (let i = 0; i < 5; i++) {
    // The diary is at <main checkout>/.aether/autonomy/<id>/diary.md, which a relative path from the worktree does not reach.
    assert.equal(here('Write', { file_path: path.join(w.repo.dir, '.aether', 'autonomy', 'x', 'diary.md') }), null)
    // The folder above scratchpad_dir is the session's temporary folder, whatever the extension of the file.
    assert.equal(here('Write', { file_path: path.join(path.dirname(scratch), 'notes', `n${i}.js`) }), null)
  }
  assert.equal(here('Edit', { file_path: path.join(linked, 'src', 'a.js') }), null)
  assert.equal(here('Edit', { file_path: path.join(linked, 'src', 'b.js') }), null)
  const third = here('Edit', { file_path: path.join(linked, 'src', 'c.js') })
  assert.ok(third && typeof third.additionalContext === 'string')
})

test('each Bash write form counts one own edit, one call counts at most one, and 2>&1 and /dev/null count none (R7)', (t) => {
  const forms = [
    'echo x > src/b.js',
    'echo x >> src/b.js',
    'printf x | tee src/b.js',
    "sed -i 's/a/b/' src/a.js",
    'cp src/a.js src/b.js',
    'mv src/a.js src/b.js',
  ]
  for (const [i, command] of forms.entries()) {
    const { call, file } = leadWorld(t, `s-form-${i}`)
    assert.equal(call('Edit', { file_path: file('src', 'x1.js') }), null, command)
    assert.equal(call('Edit', { file_path: file('src', 'x2.js') }), null, command)
    const out = call('Bash', { command })
    assert.ok(out && typeof out.additionalContext === 'string', command)
  }

  // Two writes in one call are one edit: with two more edits the third warns, not the second.
  const once = leadWorld(t, 's-once')
  assert.equal(once.call('Bash', { command: 'echo a > src/x.js; echo b > src/y.js' }), null)
  assert.equal(once.call('Edit', { file_path: once.file('src', 'z1.js') }), null)
  assert.ok(once.call('Edit', { file_path: once.file('src', 'z2.js') }))

  // Redirecting a stream to another or to /dev/null writes no file: only the third real edit warns.
  const quiet = leadWorld(t, 's-quiet')
  assert.equal(quiet.call('Edit', { file_path: quiet.file('src', 'q1.js') }), null)
  assert.equal(quiet.call('Edit', { file_path: quiet.file('src', 'q2.js') }), null)
  assert.equal(quiet.call('Bash', { command: 'cat src/a.js 2>&1' }), null)
  assert.equal(quiet.call('Bash', { command: 'npm test > /dev/null 2>&1' }), null)
  assert.ok(quiet.call('Edit', { file_path: quiet.file('src', 'q3.js') }))
})

test('Bash reads are decided per command, follow cd, and a pipeline that only filters counts nothing (R7)', (t) => {
  const { w, call } = leadWorld(t, 's-cd')
  // None of these counts; each runs three times, so one that did count would warn before the tenth counted read.
  const notCounted = [
    `cd ${w.repo.dir} && sed -n '1,5p' specs/031-demo/plan.md`,
    'aether-autonomy status | grep stop',
  ]
  for (let pass = 0; pass < 3; pass++) {
    for (const command of notCounted) assert.equal(call('Bash', { command }), null, command)
  }
  // Each of these counts exactly one: a reader after cd, a relative path after cd, a search that redirects only stderr,
  // and the file reader of a pipeline.
  const counted = [
    `cd ${w.repo.dir} && sed -n '1,5p' src/a.js`,
    'cd src && cat a.js',
    'rg foo src 2>/dev/null',
    'cat src/a.js | head -5',
  ]
  for (let i = 0; i < 9; i++) assert.equal(call('Bash', { command: counted[i % counted.length] }), null, `${i}: ${counted[i % counted.length]}`)
  const tenth = call('Bash', { command: counted[1] })
  assert.ok(tenth && typeof tenth.additionalContext === 'string')
  assert.match(tenth.additionalContext, /10/)
})
```

**Acceptance:**
- `posttool.posttool(input, ctx)` devuelve `{ additionalContext }` en la 3.ª edición propia de código o pruebas o en la 10.ª lectura o búsqueda en el código del mismo turno en una sesión del Lead, y `null` en el resto de llamadas del turno.
- No suman al contador las escrituras ni las lecturas de rutas exentas (`.aether/`, `.specify/`, `specs/`, `docs/`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `/dev/null`, el directorio de configuración de Claude con la memoria, la carpeta temporal de la sesión), vistas desde la raíz principal o desde un worktree enlazado; ni `wc`, `ls`, `stat`, `diff`, `cmp`, `git log`, `git status`, las corridas de pruebas, los binarios `aether-*` y los filtros de su salida; ni las sesiones fuera del Lead ni las herramientas de subagentes (`input.agent_id` presente).
- Un `Bash` se evalúa por comando y sigue `cd`: `cd /repo && sed -n '1,5p' src/a.js`, `cd src && cat a.js`, `rg foo src 2>/dev/null` y `cat src/a.js | head -5` suman una lectura cada uno; `cd /repo && sed -n '1,5p' specs/031-demo/plan.md` y `aether-autonomy status | grep stop` no suman ninguna.
- El contador se reinicia cuando cambia `prompt_id` o cuando la nota de continuidad de la sesión tiene un `updatedAt` más reciente, la haya escrito quien la haya escrito; una nota igual no reinicia.
- `node --test tests/continuity-posttool*.test.js tests/tree-check.test.js tests/guard*.test.js tests/copies-classes.test.js` pasa (los `tests/guard*.test.js` incluyen los verificadores estructurales `guards*`, que no se editan).

---

### Task 9: Alinear las skills `aether:autonomous-runs` y `aether:swarm` con el rechazo automático y con #214

**Aether:**
- Area: skills
- Owns: `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `tests/autonomous-runs-skill.test.js`, `tests/quota-brake-docs.test.js`, `tests/roles.test.js`, `tests/docs-facts.test.js`, `tests/workflow-review-once.test.js`
- Depends on: Task 2 — referencia la compuerta de plan mode en aether-autonomy start y el rechazo por topes
- Depends on: Task 3 — posee codex-docs.test.js y workflow-split.test.js, que leen la skill del enjambre
- Depends on: Task 4 — comparte tests/docs-facts.test.js, que la Tarea 4 edita primero y que fija el bloque `**Start:**` de la skill autonomous-runs
- Serves: R4, R11

**Goal:**
Actualizar `plugins/aether/skills/autonomous-runs/SKILL.md` y `plugins/aether/skills/swarm/SKILL.md` para quitar la instrucción de correr `aether-autonomy status` antes de cada lanzamiento, explicar cómo actuar cuando `aether-delegate begin`, `aether-plan compile` o `/aether:design` rechazan un lanzamiento por tope o pausa, reflejar la compuerta de plan mode en sesiones interactivas y corregir los puntos de #214 en `plugins/aether/skills/swarm/SKILL.md`.

**Interfaces:**
1. En `plugins/aether/skills/autonomous-runs/SKILL.md`:
   - En `**Start:**`: explicar que en una sesión interactiva del Lead debes presentar el plan en plan mode (`ExitPlanMode`) y esperar la aprobación del dueño antes de correr `aether-autonomy start`, porque `aether-autonomy start` verifica la transcripción de la sesión y rechaza abrir la corrida si en ella no consta una aprobación de `ExitPlanMode` posterior a cualquier corrida ya abierta en esa sesión (la aprobación de una corrida anterior no sirve para abrir otra: hay que presentar el plan de nuevo y esperar otra aprobación); en una sesión sin terminal (`claude -p`, `entrypoint: "sdk-cli"`), `aether-autonomy start` verifica la cita literal del dueño como hasta ahora.
   - En el párrafo `**Ceilings.**` (línea 35, donde hoy dice «Run `aether-autonomy status` before each `/aether:design` launch or relaunch, each delegate task, and each swarm launch or relaunch»): quitar la exigencia de correr `aether-autonomy status` antes de cada tarea delegada, cada ola o cada asiento y reemplazar el párrafo por:
     `**Ceilings.** \`aether-delegate begin\`, \`aether-plan compile\` and \`/aether:design\` check the open run themselves and refuse to start new work when its \`stop\` is \`time\`, \`cost\` or \`quota\` (do not run \`aether-autonomy status\` before each launch; use it only to inspect the run). When a launch is refused or \`status\` reports \`stop\` as \`time\` or \`cost\`, start nothing new. Let what is running finish (a swarm run or a delegate task), or save it as patches, and never leave a merge half done. Then run \`aether-autonomy end --outcome ceiling\` and give the brief. When a launch is refused for \`quota\`, follow **The quota brake** below: stop what is running, save the in-flight units, record \`quota-saved\`, wait for the reset, and leave the run open (use \`aether-autonomy end --outcome ceiling|incomplete|done\` only for a \`time\`/\`cost\` stop or to close an old run another session left open).`
2. En `plugins/aether/skills/swarm/SKILL.md`:
   - Quitar la exigencia de correr `aether-autonomy status` antes de cada ola (en `## 3. Launch`, línea 46, y en el párrafo de relanzamiento de la línea 137 que dice «after the `aether-autonomy status` check of §3 in a run») y explicar qué hacer cuando `aether-plan compile` rechaza un lanzamiento por tope o pausa (`stop` en `time`, `cost` o `quota`), conservando la frase `as the \`aether:autonomous-runs\` skill says` que fija `tests/autonomous-runs-skill.test.js`: ante un rechazo por `time` o `cost`, terminar o guardar en parches lo que corre y cerrar con `aether-autonomy end --outcome ceiling`; ante un rechazo por `quota`, seguir el párrafo del freno de cuota de `aether:autonomous-runs` (detener lo que corre, guardar las unidades en vuelo con `aether-wt save <runId>`, registrar `aether-autonomy quota-saved`, esperar el reinicio y dejar la corrida abierta sin cerrarla; ofrecer `aether-autonomy end` solo para topes `time`/`cost` o para cerrar una corrida vieja que otra sesión dejó abierta).
   - Mantener la regla `"Never run the swarm on main."` añadiendo que `aether-plan compile` tiene la bandera `--allow-main` para cuando el dueño pida explícitamente compilar en `main`, sin invitar a usarla por cuenta propia.
   - En las fusiones: nombrar `aether-wt settle <run-dir> <wave-num> <task-id> <branch> --test-cmd "<cmd>"` cuando una fusión se corta a los 600 segundos (`merge timed out after 600s`) para inspeccionar o terminar el merge antes de decidir.
   - En la escalera del supervisor:
     - En `plugins/aether/skills/swarm/SKILL.md:111`, reemplazar `"the supervisor ended three times without a valid verdict"` para explicar que `"the supervisor failed 3 times in a row"` ocurre cuando el supervisor termina tres veces sin devolver respuesta (`"the supervisor ended three times without an answer"`), y que un veredicto inválido no es un fallo: cuenta como un `retry` (`"an invalid verdict counts as a retry"`).
     - Explicar que el 2.º y 3.er intento del supervisor corren siempre en Claude (`"the 2nd and 3rd attempt of the supervisor always run on Claude"`) y que un supervisor o revisor final de Claude que permanezca callado 900 segundos se abandona.
     - Explicar que un hallazgo del supervisor que no nombra ningún archivo recibe el primer archivo listado en el `Owns` de la tarea (`"first file in the task's \`Owns\`"`).
3. Cadenas que otras pruebas fijan y esta tarea conserva literalmente: en `**Start:**`, `plan mode` antes de `aether-autonomy start` y «their answer to the plan dialog is not such a message» (`tests/docs-facts.test.js`, prueba A108, que esta tarea posee para corregirla en el mismo ciclo; no se espera edición); en la skill del enjambre, `the ladder is spent (exhausted)` (`workflow-split`), `Blocked by a lane` (`launcher`) y `Defer the minor ones` (`roles`); en `**Ceilings.**`, `Let what is running finish` una sola vez (`quota-brake-docs`).
4. En `tests/roles.test.js`, la prueba «in an autonomous run the swarm checks the ceilings, records its cost, and leaves unauthorized steps to the brief» fija hoy la cadena `'aether-autonomy status'` en la skill del enjambre: reemplazarla por `'aether-autonomy end --outcome ceiling'`, que el enjambre sigue nombrando al explicar el rechazo. Las demás agujas de esa prueba no cambian.
5. En `tests/quota-brake-docs.test.js` (línea 16):
   - Reemplazar `assert.ok(skill.includes('**Ceilings.** Run \`aether-autonomy status\` before each \`/aether:design\` launch or relaunch, each delegate task, and each swarm launch or relaunch. When its \`stop\` is \`time\` or \`cost\`, start nothing new. Let what is running finish'))` por `assert.ok(skill.includes('**Ceilings.** \`aether-delegate begin\`, \`aether-plan compile\` and \`/aether:design\` check the open run themselves and refuse to start new work when its \`stop\` is \`time\`, \`cost\` or \`quota\`'))`.

**Lectores revisados:** `help`, `lanes-docs`, `spend-skills`, `muse-skills`, `speckit`, `launcher`, `router-pick`, `router-marks`, `swarm-ladder-docs`, `delegate-skill`, `session-start-autonomy`, `bootstrap-names`, `bootstrap-design` y `using-aether-030` leen una de las dos skills, y se buscaron en ellas los fragmentos de lo que esta tarea cambia (`aether-autonomy status`, el bloque `**Start:**`, `**Ceilings.**`, `Never run the swarm`, el párrafo de relanzamiento, las viñetas del supervisor): solo `roles`, `quota-brake-docs`, `autonomous-runs-skill` y `docs-facts` los fijan, y están en `Owns`; los demás fijan texto que no se toca (`Prepare`, `Read the result`, el bloque `Delegación` del informe).

**Tests (write first):**
Añadir en `tests/autonomous-runs-skill.test.js` (usando `SKILL` y `read(...parts)` definidos en ese archivo):

```js
test('autonomous-runs and swarm skills describe automatic ceiling refusal and #214 rules', () => {
  const swarmText = read('skills', 'swarm', 'SKILL.md')

  assert.match(SKILL, /ExitPlanMode/)
  assert.match(SKILL, /aether-delegate begin/)
  assert.match(SKILL, /aether-plan compile/)
  assert.match(SKILL, /aether-autonomy end --outcome ceiling/)
  assert.doesNotMatch(SKILL, /Run `aether-autonomy status` before each/)

  assert.match(swarmText, /Never run the swarm on `main`/)
  assert.match(swarmText, /--allow-main/)
  assert.match(swarmText, /aether-autonomy end --outcome ceiling/)
  assert.doesNotMatch(swarmText, /run `aether-autonomy status` first|after the `aether-autonomy status` check of §3 in a run/)
  assert.match(swarmText, /aether-wt settle/)
  assert.doesNotMatch(swarmText, /without a valid verdict/)
  assert.match(swarmText, /without an answer/)
  assert.match(swarmText, /an invalid verdict counts as a retry|an invalid verdict counts as a `retry`/)
  assert.match(swarmText, /the 2nd and 3rd attempt of the supervisor always run on Claude/)
  assert.match(swarmText, /900/)
  assert.match(swarmText, /first file in the task's `Owns`|first path in the task's `Owns`/i)
})
```

En `tests/quota-brake-docs.test.js` (línea 16), primero: reemplazar la aguja de `**Ceilings.**` por `'**Ceilings.** `aether-delegate begin`, `aether-plan compile` and `/aether:design` check the open run themselves and refuse to start new work when its `stop` is `time`, `cost` or `quota`'`. Y en `tests/roles.test.js`, primero: en la lista de agujas de la prueba «in an autonomous run the swarm checks the ceilings, records its cost, and leaves unauthorized steps to the brief», cambiar `'aether-autonomy status',` por `'aether-autonomy end --outcome ceiling',`.

**Acceptance:**
- `plugins/aether/skills/autonomous-runs/SKILL.md` y `plugins/aether/skills/swarm/SKILL.md` ya no piden correr `aether-autonomy status` antes de cada lanzamiento y explican cómo responder al rechazo automático de `aether-delegate begin`, `aether-plan compile` y `/aether:design`.
- `plugins/aether/skills/swarm/SKILL.md` cubre los 6 puntos de #214 (R4 y R11).
- `node --test tests/autonomous-runs-skill.test.js tests/quota-brake-docs.test.js tests/roles.test.js tests/docs-facts.test.js tests/workflow-review-once.test.js` pasa.

---

### Task 10: Reducir `using-aether` a las reglas permanentes, remitir a `aether:models` y `aether:designing` y aplicar la regla contable y #204

**Aether:**
- Area: bootstrap
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/models/SKILL.md`, `plugins/aether/skills/designing/SKILL.md`, `tests/using-aether-030.test.js`, `tests/bootstrap-design.test.js`, `tests/bootstrap-names.test.js`
- Depends on: Task 3 — requiere que las skills models y designing existan antes de resumirlas en using-aether
- Depends on: Task 9 — alinea las referencias de autonomía y enjambre
- Serves: R6, R9, R10

**Goal:**
En `plugins/aether/skills/using-aether/SKILL.md`, resumir `## Models` y `## Designing` remitiendo a `aether:models` y `aether:designing` (conservando las reglas permanentes), reemplazar la regla vaga de cinco llamadas por la frase canónica en inglés de la regla contable (R6) y aplicar las correcciones de #204 (R10), dejando el texto total inyectado en $\le 25.000$ caracteres, que cabe en 3 partes.

**Interfaces:**
1. En `plugins/aether/skills/using-aether/SKILL.md`:
   - En el párrafo introductorio (línea 16, «about five tool calls») y en `## The three paths` (línea 99, «about five tool calls», y línea 109, «many reads of your own»): reemplazar `"about five tool calls"` y `"many reads of your own"` usando la frase canónica en inglés (`COUNTABLE_EN`):
     `"at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count"`
     (aclarando que quedan fuera de ese conteo las escrituras en el diario, `specs/NNN-<topic>/intent.md`, documentos en `specs/` o `docs/`, memoria y las corridas de pruebas).
   - En `## Models`: conservar las prohibiciones de no adivinar nombres de modelos ni precios desde los pesos, las rutas a `models.json` y a `prices.json` bajo `config` de la carpeta del plugin, la lista de harnesses (`agy, codex, grok, cursor, muse`) y la regla de cuota (`first the quota whose weekly window renews first, then the cheapest pair per task`), e indicar cargar la skill `aether:models` antes de responder sobre capacidades, esfuerzos o citas del fabricante.
   - En `## Designing`: conservar qué es diseñar, la prohibición de no escribir `spec.md`, `plan.md`, `tasks.md` ni `art-direction.md` sin `/aether:design` (salvo diseño corto pedido por el dueño), las referencias a `aether:writer`, `aether:judge`, `aether:specify`, `aether:examiner`, `At most two revisions per document`, `.aether/pending.jsonl`, `specs/NNN-<topic>/intent.md`, `/aether:design`, `aether-report --seats`, `aether-exam run` y `aether-exam store specs/NNN-<topic>`, e indicar cargar la skill `aether:designing` antes de redactar `intent.md`, lanzar `/aether:design` o procesar su respuesta.
   - En `## The delegate ladder` y `## Skills` (puntos de #204, R10):
     - Explicar que cada llamada a `Agent` cuyo `subagent_type` no sea `aether:*` (incluidos `Plan`, `claude-code-guide` o llamadas sin `subagent_type`) es una tarea delegada, entra en la escalera y espera veredicto (`"every \`Agent\` call whose \`subagent_type\` is not \`aether:*\` (including \`Plan\`, \`claude-code-guide\`, or a call with no \`subagent_type\`) is a delegate task, climbs the ladder, and waits for a verdict"`).
     - En la línea 114, reemplazar `"A delegate task is never a fork: a fork always runs on your model."` por `"Do not pass \`fork\` on a delegate task: \`Agent\` ignores \`model\` on a fork and would run on your model with your whole conversation."`.
     - En la línea 124, reemplazar `"one effort up but never above its step's correction effort"` para explicar que `fix` corre en el mismo modelo al esfuerzo de corrección del escalón definido en `ladder.json` (`"at the step's correction effort"`, seguido de la ruta a `ladder.json` bajo `config`, conservando además la ruta completa de `ladder.json` en `## The three paths` y en `## The delegate ladder` que `delegate-skill` fija; no «one effort up»).
     - Incluir `--ignore <glob>` en `aether-delegate verdict` para archivos sucios ajenos a la tarea.
     - Explicar que relanzar un `task` id ya aprobado o agotado lanza un agente en Haiku que dice que no hay nada que hacer (`"relaunching an approved or exhausted task id launches a Haiku agent that says there is nothing to do"`).
     - En `## Skills` (línea 59) o en `## The delegate ladder`: explicar que en `AETHER-SKILLS:`, pasar más de 3 skills, un nombre desconocido o una skill que supere el límite de líneas rechaza el lanzamiento entero (`"passing more than 3 skills, an unknown skill name, or a skill over the line limit in \`AETHER-SKILLS:\` rejects the whole launch"`).
2. En las pruebas propietarias de esta tarea:
   - `tests/bootstrap-design.test.js`: comprobar en `plugins/aether/skills/using-aether/SKILL.md` (`## Designing`) las reglas permanentes que se quedan en el arranque (`'/aether:design'`, `'You decide no round, and you start no seat'`, `'Only you write the card: aether-guard refuses every other writer'`, `'Never override the Judge silently'`, `'aether:designing'`) y comprobar en `plugins/aether/skills/designing/SKILL.md` el procedimiento detallado trasladado allí (`'at most five questions, one at a time'`, `'hard to reverse, surprising, or a real trade-off'`, `'specs/NNN-<topic>/intent.md'`, `"the owner's words, quoted as they said them"`, `'what is out'`, `'the answers to the clarifying questions'`, `'At most two revisions per document'`, `'"session": "<CLAUDE_CODE_SESSION_ID>"'`, `'"mode": "short"'`, `'- \`approved\`:'`, `'- \`clarify\`:'`, `'- \`dispute\`:'`, `'- \`failed\`:'`, `'take the reversible side of each as an assumption, put the question in "Espera tu sí"'`, `'change the plan or tasks and launch in short mode (see "Later changes"); when \`mechanical\` is true, fix the findings yourself.'`, `'**Later changes.**'`, `'a fix after a stop at the plan stage'`, `'A changed plan gets a new exam'`, `'an approved spec is never rewritten'`).
   - `tests/bootstrap-names.test.js`: mantener la comprobación del orden de las 5 secciones `['## The route by size and risk', '## The three paths', '## The delegate ladder', '## Models', '## Designing']`, actualizar `rubric(...)` para leer la tabla de precios y citas del fabricante desde `plugins/aether/skills/models/SKILL.md`, e incluir `skills/models/SKILL.md` y `skills/designing/SKILL.md` en `sources(t)`.
   - `tests/using-aether-030.test.js`: verificar que las reglas de #204 están en `using-aether/SKILL.md` y que `bootstrapParts` cabe en los `PART_COMMANDS` de `hooks.json` (5 mientras la Tarea 11 no los reduzca a 3).

3. Cadenas que otras pruebas fijan y esta tarea conserva literalmente: en `## Models`, `first the quota whose weekly window renews first, then the cheapest pair per task` y `agy, codex, grok, cursor, muse` (`lanes-docs`); en `## Designing`, `/aether:design`, `aether-exam run`, `aether-report --seats`, `aether:examiner`, `aether:judge`, `aether:writer`, `At most two revisions per document` y `.aether/pending.jsonl` (`launcher`); en la escalera, `AETHER-TASK:`, `AETHER-OWNS:`, `AETHER-TESTS:`, `aether-delegate verdict`, la ruta completa de `ladder.json`, `--from-scratch` e `isolation: "worktree"` (`delegate-skill`); y la frase de `swarm-ladder-docs` (la frase «The swarm starts every unit on the first rung of … and raises it by the same policy as the delegates.», entera).

**Lectores revisados:** `codex-docs`, `autonomous-runs-skill`, `docs-facts`, `delegate-skill`, `copies-classes`, `help`, `roles`, `muse-skills`, `session-start-parts`, `spend-skills`, `lanes-docs`, `launcher`, `swarm-ladder-docs` y `tests/helpers.js` leen `using-aether/SKILL.md`. Se buscó en cada uno qué cadenas fija que viva solo en `## Models`, `## Designing` o en las frases que esta tarea cambia («about five tool calls», «many reads of your own», «one effort up»): ninguno fija esas frases, y las cadenas que fijan de las dos secciones son las de arriba, que se conservan, así que ninguno necesita edición. `bootstrap-design`, `bootstrap-names` y `using-aether-030` sí fijan el contenido movido y están en `Owns`.

**Tests (write first):**
Añadir en `tests/using-aether-030.test.js` (usando `text`, `PLUGIN` y `bootstrapParts` ya definidos en ese archivo):

```js
test('the bootstrap keeps the canonical rule of the direct path and the corrections of #204, points to aether:models and aether:designing, and weighs at most 25,000 characters (R6, R9, R10)', () => {
  const rule = 'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  assert.ok(text.includes(rule))
  assert.doesNotMatch(text, /about five tool calls|many reads of your own|one effort up|a fork always runs on your model|`aether-exam store`/)
  for (const token of [
    'aether:models',
    'aether:designing',
    ["at the step's correction effort in `config", 'ladder.json`'].join('/'),
    'ignores `model` on a fork and would run on your model with your whole conversation',
    'every `Agent` call whose `subagent_type` is not `aether:*`',
    'claude-code-guide',
    '--ignore <glob>',
    'aether-autonomy trust --author <author> --quote "<their words>"',
    'aether-exam store specs/NNN-<topic>',
    'relaunching an approved or exhausted task id launches a Haiku agent',
    'passing more than 3 skills, an unknown skill name, or a skill over the line limit in `AETHER-SKILLS:` rejects the whole launch',
  ]) {
    assert.ok(text.includes(token), `the bootstrap names ${token}`)
  }
  // Each part is { heading, slice, context, output }: the context is what the Lead is given.
  const total = bootstrapParts(PLUGIN).reduce((sum, part) => sum + part.context.length, 0)
  assert.ok(total <= 25000, `the injected bootstrap weighs ${total} characters`)
})
```

**Acceptance:**
- `plugins/aether/skills/using-aether/SKILL.md` contiene la frase canónica en inglés de la regla contable (R6), remite a `aether:models` y `aether:designing` conservando las reglas permanentes de `## Models` y `## Designing` (R9) y refleja las correcciones de #204 (R10).
- El texto inyectado por `bootstrapParts(PLUGIN)` mide $\le 25.000$ caracteres, con los `hooks.json` actuales (5 comandos `--part`) todavía en pie.
- `node --test tests/using-aether-030.test.js tests/bootstrap-design.test.js tests/bootstrap-names.test.js` pasa.

---

### Task 11: Hacer independientes del orden las partes de `aether-session-start` y reducir `hooks.json` a 3 partes

**Aether:**
- Area: bootstrap
- Owns: `plugins/aether/lib/session-start.js`, `plugins/aether/hooks/hooks.json`, `tests/helpers.js`, `tests/session-start.test.js`, `tests/session-start-parts.test.js`, `tests/session-start-tidy.test.js`, `tests/session-start-tree.test.js`, `tests/dormant-030.test.js`, `tests/continuity-hook.test.js`, `tests/guards-helpers.test.js`
- Depends on: Task 10 — el texto de using-aether ya cabe en 3 partes; sin ese recorte, bajar a 3 comandos dejaría texto sin entregar
- Depends on: Task 5 — comparte tests/continuity-hook.test.js
- Depends on: Task 8 — el nuevo matcher de PostToolUse solo tiene sentido cuando el manejador del camino directo cuenta esas herramientas
- Serves: R7, R8

**Goal:**
1. En `plugins/aether/lib/session-start.js`, reemplazar `partHeading(k, n, root)` por el marco de dos líneas independiente del orden de llegada (R8), manteniendo todos los cortes en fronteras `## ` y cada salida JSON dentro de `PART_LIMIT` (9.800 caracteres).
2. En `plugins/aether/hooks/hooks.json`, dejar en `SessionStart` la entrada de notas y `--part 1`, `--part 2` y `--part 3` (quitando `--part 4` y `--part 5`), y actualizar el `matcher` de `PostToolUse` a `"Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash"`, actualizando en esta misma tarea `tests/helpers.js`, `tests/session-start.test.js`, `tests/session-start-parts.test.js`, `tests/dormant-030.test.js` y `tests/continuity-hook.test.js`.

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
   - `description`: decir que el arranque va en tres comandos de partes (no cinco) y que el `PostToolUse` de `aether-continuity` cubre las escrituras, las lecturas y `Bash`.
3. En las pruebas propietarias de esta tarea:
   - `tests/session-start.test.js` (línea 174) y `tests/session-start-parts.test.js` (línea 61): `assert.equal(SESSION_COMMANDS.length, 6)` pasa a `4`; en `session-start-parts.test.js` el comentario «The six commands of one start» (línea 84) pasa a «four», la prueba `(d)` y la `(e)` cambian como se dice abajo, y el encabezado de dos líneas de cada parte sale de `partHeading` de `tests/helpers.js`, que esta tarea reescribe igual que el de `session-start.js` (la prueba `(a)` y `leadParts` lo comparan con él).
   - `tests/dormant-030.test.js` (línea 22): `assert.ok(commands.length >= 13, ...)` pasa a `>= 11` (4 comandos de `aether-session-start` más 7 de `aether-continuity`, los que filtra esa prueba).
   - `tests/continuity-hook.test.js` (línea 221, en la prueba «hooks.json registers one aether-continuity entry per verb…»): `assert.equal(mine('PostToolUse')[0].matcher, 'Write|Edit|MultiEdit|Bash')` pasa a `'Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash'`. Esta es la única prueba que fija el texto antiguo del `matcher`; esta tarea la posee por eso. Además esta tarea añade la prueba de abajo, que recorre el `hooks.json` real y comprueba que `Read`, `Grep` y `Glob` llegan de verdad al contador en producción.
   - `tests/session-start-tidy.test.js` y `tests/session-start-tree.test.js`: ejercitan `session-start.js` (`main` y `PART_LIMIT`) y se mantienen en verde sin cambios de lógica.

4. `tests/guards-helpers.test.js` lee `hooks.json` en un árbol de ejemplo (una cadena, no el archivo real) y no fija nada de lo que esta tarea cambia; está en `Owns` solo para que un rojo de esa prueba se corrija dentro de la tarea, sin editar los verificadores `guards-seat`, `guards-core-1`, `guards-delegate-2` y `guards-bins`.

**Lectores revisados:** los demás lectores de `hooks.json` (`guard`: las entradas de `aether-guard`; `observe-bin`: `PostToolUse[0]` es `ScheduleWakeup` y las cinco entradas de `aether-observe`; `new-skills`: el archivo no nombra `art-direction`) fijan entradas que esta tarea no toca. Los lectores de `session-start.js` (`autonomous-runs-skill`, `commands`, `fault-trace`, `fault-sites`, `guards-bins`, `observe-digest`, `observe-issue`, `observe-notice`, `retired-options`, `session-start-continuity`, `session-start-autonomy`, `spend-prune`, `using-aether-030`) usan solo el comando de notas, `PART_LIMIT` o el número de comandos; solo `session-start`, `session-start-parts` y `helpers.js` fijan el encabezado de las partes (`partHeading`), y están en `Owns`; `bootstrap-names` usa `leadParts` de `helpers.js`.

**Tests (write first):**
Añadir en `tests/continuity-hook.test.js` (usa `hooks`, `entriesOf`, `world`, `run`, `path` y `fs`, que el archivo ya define; `run(w, verb, input, extra)` corre `bin/aether-continuity <verb>` en la sesión `s1` del Lead):

```js
test('the real hooks.json sends Read, Grep and Glob to the posttool counter: its matcher selects them and its command prints the notice on the tenth read (spec 031, R7)', (t) => {
  const w = world(t)
  const group = hooks.PostToolUse.find((g) => g.hooks.some((h) => h.command.endsWith('/bin/aether-continuity" posttool')))
  assert.ok(group, 'hooks.json has a PostToolUse entry for aether-continuity posttool')
  const selects = (tool) => new RegExp(`^(?:${group.matcher})$`).test(tool)
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Read', 'Grep', 'Glob', 'Bash']) assert.ok(selects(tool), `${tool} reaches the counter`)
  for (const tool of ['WebFetch', 'Agent', 'ScheduleWakeup']) assert.ok(!selects(tool), `${tool} does not`)
  // Only a call that the matcher selects is delivered to the command, as Claude Code does.
  const file = path.join(w.repo.dir, 'src', 'a.js')
  const outputs = []
  for (const tool of ['Read', 'Grep', 'Glob', 'Read', 'Grep', 'Glob', 'Read', 'Grep', 'Glob', 'Read']) {
    assert.ok(selects(tool))
    const r = run(w, 'posttool', { hook_event_name: 'PostToolUse', prompt_id: 'p1', tool_name: tool, tool_input: tool === 'Read' ? { file_path: file } : { pattern: 'x' } }, { LC_ALL: '', LC_MESSAGES: '', LANG: 'en_US.UTF-8' })
    assert.equal(r.status, 0)
    outputs.push(r.stdout)
  }
  assert.deepEqual(outputs.slice(0, 9), Array(9).fill(''), 'nine reads and searches print nothing')
  assert.match(JSON.parse(outputs[9]).hookSpecificOutput.additionalContext, /direct-path limit/)
})
```

Añadir en `tests/session-start-parts.test.js` (usando `PLUGIN`, `PART_LIMIT` y `bootstrapParts` definidos en ese archivo; cada parte es `{ heading, slice, context, output }`, donde `context` es lo que recibe el Lead y `output` la salida completa del comando):

```js
test('bootstrap splits into at most 3 order-independent parts within 25,000 total injected chars', () => {
  const parts = bootstrapParts(PLUGIN)
  assert.ok(parts.length >= 1 && parts.length <= 3, `expected 1..3 parts, got ${parts.length}`)
  let totalChars = 0
  for (const [i, part] of parts.entries()) {
    totalChars += part.context.length
    assert.ok(
      part.context.startsWith(
        "You are the Lead of Aether mode: the owner's right hand.\n" +
          `Aether mode bootstrap, part ${i + 1} of ${parts.length}: read all ${parts.length} parts before you act, whatever order they arrive in; if a part from 1 to ${parts.length} did not reach you, read the whole file `
      )
    )
    assert.ok(part.output.length <= PART_LIMIT, `part ${i + 1} JSON is ${part.output.length} > ${PART_LIMIT}`)
  }
  assert.ok(totalChars <= 25000, `expected total injected chars <= 25000, got ${totalChars}`)
})
```

y reemplazar la prueba `(e)` del mismo archivo, que hoy espera cinco partes, por:

```js
test('(e) hooks.json runs the notes command and parts 1 to 3 in one SessionStart entry, with one matcher', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks.SessionStart
  assert.equal(entries.length, 1)
  assert.equal(entries[0].matcher, 'startup|resume|clear|compact|fork')
  const bin = 'node "${CLAUDE_PLUGIN_ROOT}/bin/aether-session-start"'
  assert.deepEqual(
    entries[0].hooks.map((hook) => [hook.type, hook.command]),
    [bin, `${bin} --part 1`, `${bin} --part 2`, `${bin} --part 3`].map((command) => ['command', command]),
  )
})
```

La prueba `(d)` del mismo archivo pasa de «cinco partes o menos» a «tres partes o menos», también desde una carpeta de 200 y de 400 caracteres.

**Acceptance:**
- `bootstrapParts(PLUGIN)` cabe en las 3 partes de `hooks/hooks.json`; cada parte empieza con las dos líneas de R8, corta en frontera `## `, su salida completa mide $\le 9.800$ caracteres (también desde una ruta de 400 caracteres) y la suma de los textos inyectados mide $\le 25.000$ caracteres.
- `plugins/aether/hooks/hooks.json` tiene 3 entradas `--part` (`1`, `2`, `3`) y ninguna entrada `--part` devuelve `{}` vacío; el `matcher` de `PostToolUse` de `aether-continuity posttool` es `Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash`.
- Todos los comandos del archivo de hooks siguen saliendo con código 0, sin salida y sin escribir fuera de una sesión del Lead (`tests/dormant-030.test.js`).
- `tests/continuity-hook.test.js` fija el `matcher` nuevo de `PostToolUse` y prueba, a través del `hooks.json` real, que `Read`, `Grep` y `Glob` llegan al contador.
- `node --test tests/session-start.test.js tests/session-start-parts.test.js tests/session-start-tidy.test.js tests/session-start-tree.test.js tests/using-aether-030.test.js tests/dormant-030.test.js tests/continuity-hook.test.js` pasa.

---

### Task 12: Registrar las decisiones A117 a A120 en `docs/decisions.md` y el rango de `docs/index.md`

**Aether:**
- Area: docs
- Owns: `docs/decisions.md`, `docs/index.md`, `tests/docs-facts.test.js`, `tests/docs-decisions.test.js`, `tests/audit-docs.test.js`, `tests/codex-release.test.js`, `tests/docs-claims-rest.test.js`, `tests/harness-lists.test.js`, `tests/lanes-docs.test.js`, `tests/launcher.test.js`, `tests/models-by-role-docs.test.js`, `tests/no-router.test.js`, `tests/onboard-retired.test.js`, `tests/project-files-docs.test.js`, `tests/spend-docs.test.js`
- Depends on: Task 3 — comparte con ella las pruebas que leen la página de componentes y las que recorren las decisiones
- Depends on: Task 4 — comparte tests/docs-facts.test.js
- Depends on: Task 6 — A118 registra el rechazo en aether-delegate begin y aether-plan compile
- Depends on: Task 7 — A118 registra el rechazo en /aether:design
- Depends on: Task 11 — A120 registra las 3 partes del arranque y el aviso por lectura
- Serves: R12, R13

**Goal:**
Registrar en `docs/decisions.md` las decisiones `A117` a `A120` de los cuatro comportamientos nuevos y de la higiene del arranque, con las citas del dueño, y subir el rango que nombra `docs/index.md` a `A1–A120`, sin tocar el changelog de la versión `0.36.0`. Las páginas de las guías, `CLAUDE.md` y la página de componentes las actualiza la Tarea 13.

**Interfaces:**
1. `docs/decisions.md`:
   - Conservar intacta la línea histórica `docs/decisions.md:236` (`about five tool calls`).
   - Añadir al final las decisiones `A117` (aviso único en `Stop` e informe de delegados con resultado sin veredicto, citando `«catalgoar y ñistar comportamientos esperados por si alguno no se cumple por ingeneiria de prompts»`), `A118` (rechazo en código en `aether-delegate begin`, `aether-plan compile` y `/aether:design` ante tope de tiempo, gasto o pausa por cuota, citando `«vas a corregir como se comprota el lead autnoamente»`), `A119` (exigencia de una aprobación `ExitPlanMode` en la transcripción, posterior en el tiempo a cualquier corrida ya abierta en esa sesión, antes de `aether-autonomy start` en sesiones interactivas, citando `«vas a corregir como se comprota el lead autnoamente»`) y `A120` (límite contable de 3 ediciones propias o 10 lecturas por turno con aviso único en `PostToolUse`, partes de arranque independientes del orden y extracción de `aether:designing` y `aether:models`, citando `«le quiero dar higieien al comportamiento del lead a los prompts etc»` y `«buscar sobreingenieria en los procesos de delegacion que se poueden optimziar para buscar un mejor radar»`). Cada una es una fila `| A<n> | **...** ... |` como las anteriores, sin patrones retirados ni listas cerradas de arneses.
2. `docs/index.md`: el rango `A1–A116` pasa a `A1–A120` (la prueba «R12: the range of decisions the pages name runs to the last decision» exige que coincida con la última decisión).
3. `tests/docs-facts.test.js`: en la línea 601, renombrar el título de la prueba de `'R15: the decisions A50 to A116 are recorded in docs/decisions.md with the owner\'s words where the card had them'` a `'R15: the decisions A50 to A120 are recorded in docs/decisions.md with the owner\'s words where the card had them'` y pasar `LAST_DECISION = 116` a `LAST_DECISION = 120`.

**Lectores revisados:** las pruebas de `Owns` son las que nombran entre comillas `docs/decisions.md` o `docs/index.md` (`docs-decisions`, `docs-facts`, `codex-release`, `harness-lists`, `lanes-docs`, `onboard-retired`, `audit-docs`, `docs-claims-rest`, `launcher`, `models-by-role-docs`, `no-router`, `project-files-docs`, `spend-docs`); las filas nuevas solo se añaden al final y fijan nada de lo existente, y las pruebas que recorren las decisiones en busca de patrones retirados (`docs-decisions`, `harness-lists`, `lanes-docs`, `onboard-retired`) leen también las filas nuevas, por eso están aquí. `guards-helpers` la posee la Tarea 3. Ninguna prueba fija `A1–A116` fuera de `docs-facts`.

**Tests (write first):**
En `tests/docs-facts.test.js`, primero: en la línea 601, renombrar el título a `'R15: the decisions A50 to A120 are recorded in docs/decisions.md with the owner\'s words where the card had them'` y poner `LAST_DECISION = 120` (la prueba R15 queda roja hasta que existan las filas). Y añadir (usando `read(rel)` definido en ese archivo):

```js
test('decisions A117 to A120 are recorded with the owner quotes, the index names the range, and the historical line stays intact (R12)', () => {
  const decisions = read('docs/decisions.md')
  const rowOf = (id) => decisions.split('\n').find((line) => line.startsWith(`| ${id} |`)) || ''
  for (const [id, quote] of [
    ['A117', 'catalgoar y ñistar comportamientos esperados por si alguno no se cumple por ingeneiria de prompts'],
    ['A118', 'vas a corregir como se comprota el lead autnoamente'],
    ['A119', 'vas a corregir como se comprota el lead autnoamente'],
    ['A120', 'le quiero dar higieien al comportamiento del lead a los prompts etc'],
  ]) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
    assert.ok(rowOf(id).includes(quote), `${id} quotes the owner: ${quote}`)
  }
  assert.match(decisions, /about five tool calls/)
  assert.match(read('docs/index.md'), /A1–A120/)
})
```

**Acceptance:**
- `docs/decisions.md` conserva `"about five tool calls"` en su registro histórico y añade `A117` a `A120` con las citas del dueño; `docs/index.md` dice `A1–A120`.
- `node --test tests/docs-facts.test.js tests/docs-decisions.test.js tests/audit-docs.test.js tests/codex-release.test.js tests/docs-claims-rest.test.js tests/harness-lists.test.js tests/lanes-docs.test.js tests/launcher.test.js tests/models-by-role-docs.test.js tests/no-router.test.js tests/onboard-retired.test.js tests/project-files-docs.test.js tests/spend-docs.test.js` pasa.

---

### Task 13: Actualizar `CLAUDE.md`, las guías, `docs/reference/components.md` y la huella durmiente

**Aether:**
- Area: docs
- Owns: `CLAUDE.md`, `docs/methodology.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `docs/guide/troubleshooting.md`, `tests/docs-facts.test.js`, `tests/docs-030.test.js`, `tests/components-docs.test.js`, `tests/docs-claims-rest.test.js`, `tests/effort-policy-docs.test.js`, `tests/guards.test.js`, `tests/harness-lists.test.js`, `tests/aether-lane.test.js`, `tests/lane-agents-md.test.js`, `tests/lanes-docs.test.js`, `tests/launcher.test.js`, `tests/muse-docs.test.js`, `tests/muse-docs-overview.test.js`, `tests/no-router.test.js`, `tests/observe-docs.test.js`, `tests/project-files-docs.test.js`, `tests/spend-docs.test.js`, `tests/swarm-ladder-docs.test.js`, `tests/tidy-detect.test.js`, `tests/tidy-report.test.js`, `tests/audit-docs.test.js`, `tests/codex-release.test.js`, `tests/workflow.test.js`, `tests/retired-patterns.js`
- Depends on: Task 3 — añadió las dos filas de skills a la página de componentes y posee con ella las pruebas que la leen
- Depends on: Task 9 — alinea el texto de ceilings con el de troubleshooting.md y comparte las pruebas que leen troubleshooting.md
- Depends on: Task 10 — la prueba de los seis lugares lee la frase canónica de using-aether
- Depends on: Task 11 — documenta las 3 partes de SessionStart y el matcher de PostToolUse
- Depends on: Task 12 — comparte con ella las pruebas de documentación
- Depends on: Task 14 — documenta la línea `ended` que esa tarea introdujo en el registro de delegados (ya fusionada; la dependencia solo registra el orden)
- Serves: R6, R8, R9, R10, R11, R12, R13

**Goal:**
Actualizar `CLAUDE.md`, `docs/methodology.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md` y `docs/guide/troubleshooting.md` para reflejar los cuatro comportamientos nuevos, la frase canónica de la regla contable en todos los lugares, las 3 partes de `SessionStart`, las dos skills nuevas (`aether:designing`, `aether:models`) y la huella durmiente medida (incluyendo el proceso corto de `PostToolUse` por lectura en sesión normal), sin tocar el changelog de la versión `0.36.0`. Son siete páginas; el resto de las rutas son las pruebas que las leen, que esta tarea posee para poder corregir dentro de ella un rojo de su propia puerta.

**Interfaces:**
1. `docs/methodology.md`: reemplazar `"about five tool calls"` por la frase canónica en inglés (`COUNTABLE_EN`):
   `"at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count"` (R6).
2. `CLAUDE.md`, `docs/reference/components.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `docs/guide/troubleshooting.md`:
   - Actualizar el número de entradas de `SessionStart` a 4 (`aether-session-start` + `--part 1` a `--part 3`, los 11 comandos de `aether-session-start` y `aether-continuity`) y quitar `--part 5` de la frase de `CLAUDE.md`.
   - Documentar `aether:designing` y `aether:models` en la lista de skills de `CLAUDE.md` (la página de componentes ya las tiene, por la Tarea 3).
   - Documentar `unverdicted` en `aether-report --delegates`, el aviso en `Stop`, el aviso en `PostToolUse` a las 3 ediciones o 10 lecturas, el rechazo automático por topes/pausa y la exigencia de plan mode en `aether-autonomy start` interactivo (una aprobación de `ExitPlanMode` posterior en el tiempo a cualquier corrida ya abierta en la sesión).
   - En `docs/guide/troubleshooting.md` (línea 43, viñeta «An autonomous run at its ceiling»): reemplazar `"The Lead runs \`aether-autonomy status\` before every launch, and launches nothing while its \`stop\` is not null: the run's hours (\`time\`) or dollars (\`cost\`) are spent (see [Autonomy](autonomy.md#autonomy))."` por `"\`aether-delegate begin\`, \`aether-plan compile\` and \`/aether:design\` check the open run themselves and refuse to start new work while its \`stop\` is \`time\`, \`cost\` or \`quota\`: the run's hours (\`time\`) or dollars (\`cost\`) are spent, or the quota brake has paused it (see [Autonomy](autonomy.md#autonomy))."`.
   - Documentar en `CLAUDE.md` y en `docs/guide/delegates.md` que el registro de delegados tiene ahora una línea `ended` (sin texto) para el fin de un intento que edita en Claude, junto a `answer`, que sigue siendo la del intento de solo lectura. Y corregir, en `docs/guide/delegates.md` y en `docs/reference/components.md`, lo que dice que `answer` es solo del intento de solo lectura, porque el verbo `aether-delegate answer` registra ahora el fin de cualquier intento que corre en Claude (una línea `answer` con la respuesta para uno de solo lectura, una línea `ended` sin texto para uno que edita):
     - `docs/guide/delegates.md` (línea 88, el verbo `answer`): «records the final answer of a read-only delegate that ran on Claude, so that the verdict can check it» pasa a «records the end of an attempt that ran on Claude: an `answer` line with the final answer of a read-only delegate, so that the verdict can check it, or an `ended` line, with no text, for one that edits».
     - `docs/guide/delegates.md` (línea 95, «On Claude»): «and the mod records its final answer with `aether-delegate answer`» pasa a «and when an attempt on Claude ends, read-only or editing, the mod records it with `aether-delegate answer`».
     - `docs/guide/delegates.md` (líneas 133 a 137, las clases de línea del registro): la viñeta `answer` conserva su texto («the final answer of a read-only delegate that ran on Claude, written by the mod through `aether-delegate answer`») y se añade debajo la viñeta `ended`: «the end of an attempt that edits and ran on Claude, with no text, written by the mod through `aether-delegate answer`».
     - `docs/guide/delegates.md` (línea 143): «prints two things as JSON» pasa a «prints three things as JSON», con una viñeta nueva `unverdicted` entre `delegations` y `ladder`: la lista de las tareas cuyo último intento trajo un resultado (un `answer` o un `ended` de ese intento, un `result` con `ok: true` o un `outcome` con `status: ok`) y no tiene veredicto después, cada una con `task`, `session`, `attempt` y `step`; el aviso de `Stop` sale de esa misma lista, una vez por intento.
     - `docs/reference/components.md` (línea 23, la fila `aether-delegate`): «`answer` records the final answer of a read-only delegate that ran on Claude» pasa a «`answer` records the end of an attempt that ran on Claude: the final answer of a read-only delegate, or an `ended` mark, with no text, for one that edits».
   - Medir y actualizar en la página de componentes (`## What Aether adds to a normal session`, conservando la frase histórica `Version 0.35.0 adds seven hook entries...`, que `tests/docs-030.test.js` fija) la huella durmiente fuera de una sesión del Lead: `SessionStart` corre 4 procesos cortos en vez de 6, y `PostToolUse` (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Read`, `Grep`, `Glob`, `Bash`) corre 1 proceso corto de `aether-continuity` (~33 ms en Node 22 sobre Linux/WSL2) por llamada, con `0 B` en `stdout` y `0` archivos escritos cuando `!isAetherSession`, en una sola oración que nombre `PostToolUse`, `Read`, `Grep` y `Glob` en ese orden.
   - `docs/guide/delegates.md` (línea 14, «The system holds the step», punto 2 de #204, R10): «A delegate task is never a fork, because a fork always runs on the Lead's model.» pasa a «Do not use `fork` for a delegate task: the `Agent` tool ignores `model` on a fork, so it would run on the Lead's model with its whole conversation. No code refuses it; it is a rule for the Lead.». Ninguna prueba fija la frase antigua en esa guía (`tests/launcher.test.js` fija «never a fork» solo en la fila A48 de `docs/decisions.md`, que no se toca), así que no se añade ninguna prueba a `Owns`.
   - `docs/guide/delegates.md` (líneas 32, 77, 97 y 118, punto 3 de #204, R10): reemplazar las cuatro apariciones de `"one effort up"` (`"on the same model, one effort up"`, `"runs a fix on the same model, one effort up"`, `"runs on the same model, one effort up"`) por `"at the step's correction effort"` seguido de la ruta a `ladder.json` bajo `config` entre acentos graves, manteniendo en la línea 32 la aclaración del tope de esfuerzo cuando el escalón ya está en su esfuerzo de corrección.
3. Las pruebas de `Owns` son las que nombran entre comillas alguna de las siete páginas; las que pasan por un ayudante `read(...)` se buscaron por los fragmentos de lo que esta tarea cambia («six `node` processes», «five part commands», `--part 5`, «about five tool calls», `seven hook entries`, `A116`): solo fijan `docs-030` (`seven hook entries`, que se conserva) y `docs-facts`. `tests/docs-facts.test.js` es también de las Tareas 4 y 12.

**Lectores revisados:** `aether-lane`, `lane-agents-md`, `tidy-detect` y `tidy-report` nombran `CLAUDE.md` como archivo de ejemplo de sus fixtures y no leen el de este repositorio: están en `Owns` solo porque el aviso de `aether-plan check` no distingue ese uso; `continuity-posttool-skills`, `docs-claims`, `guard-tidy`, `session-start-tidy` y `tree-check` hacen lo mismo y las poseen las Tareas 2, 8 y 11, de las que esta depende. `quota-brake-docs` (Tarea 9) fija el bloque de ceilings de `autonomy.md` que esta tarea no quita.

**Tests (write first):**
Añadir en `tests/docs-facts.test.js` (usando `read(rel)` definido en ese archivo):

```js
test('the canonical countable rule is identical across the six places of R6, CLAUDE.md says three parts, and the components page measures PostToolUse on reads (R6, R8, R12)', () => {
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

  const delegates = read('docs/guide/delegates.md')
  assert.match(delegates, /`ended`/)
  assert.doesNotMatch(delegates, /is never a fork/)
  assert.match(delegates, /Do not use `fork` for a delegate task/)
  assert.doesNotMatch(delegates, /one effort up/)
  assert.ok(delegates.includes(["at the step's correction effort in `config", 'ladder.json`'].join('/')))
  assert.match(delegates, /prints three things as JSON/)
  assert.doesNotMatch(delegates, /prints two things|records the final answer of a read-only delegate that ran on Claude/)
  assert.doesNotMatch(read('docs/reference/components.md'), /records the final answer of a read-only delegate that ran on Claude/)

  const troubleshooting = read('docs/guide/troubleshooting.md')
  assert.doesNotMatch(troubleshooting, /The Lead runs `aether-autonomy status` before every launch/)
  assert.match(troubleshooting, /`aether-delegate begin`, `aether-plan compile` and `\/aether:design` check the open run themselves/)

  const claude = read('CLAUDE.md')
  assert.match(claude, /`--part 1` to `--part 3`/)
  assert.doesNotMatch(claude, /--part 5/)
  assert.match(read('docs/reference/components.md'), /PostToolUse[^.\n]*Read[^.\n]*Grep[^.\n]*Glob/)
})
```

**Acceptance:**
- `node --test tests/docs-facts.test.js tests/docs-030.test.js tests/components-docs.test.js tests/docs-claims-rest.test.js tests/effort-policy-docs.test.js tests/guards.test.js tests/harness-lists.test.js tests/aether-lane.test.js tests/lane-agents-md.test.js tests/lanes-docs.test.js tests/launcher.test.js tests/muse-docs.test.js tests/muse-docs-overview.test.js tests/no-router.test.js tests/observe-docs.test.js tests/project-files-docs.test.js tests/spend-docs.test.js tests/swarm-ladder-docs.test.js tests/tidy-detect.test.js tests/tidy-report.test.js tests/audit-docs.test.js tests/codex-release.test.js tests/workflow.test.js` pasa.
- `tests/docs-facts.test.js` comprueba que la frase canónica en inglés y en español de la regla contable aparece idéntica en los seis lugares de R6.
- La página de componentes refleja la medición de `PostToolUse` por lectura en una sesión normal, y `tests/dormant-030.test.js` comprueba que los 11 comandos de `aether-session-start` y `aether-continuity` tienen huella de 0 bytes fuera de una sesión del Lead.
- `npm test` pasa entero.

---

### Task 14: Registrar el fin de todo intento que corre en Claude y contarlo como resultado llegado

**Aether:**
- Area: delegates
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/delegate-run.js`, `plugins/aether/lib/delegate-report.js`, `plugins/aether/hooks/delegate.mjs`, `plugins/aether/bin/aether-delegate`, `tests/delegate-task.test.js`, `tests/delegate-run.test.js`, `tests/delegate-report.test.js`, `tests/delegate-mod.test.js`, `plugins/aether/hooks/delegate.test.ts`
- Depends on: Task 6 — comparte `plugins/aether/lib/delegate-task.js` y `tests/delegate-task.test.js`
- Depends on: Task 1 — comparte `plugins/aether/lib/delegate-report.js` y `tests/delegate-report.test.js`, y cambia la función `isUnverdictedTask` que esa tarea escribió
- Serves: R1, R2

**Goal:**
Hacer que el fin de todo intento que corre en Claude deje una línea en el registro de delegados, también cuando el intento edita, para que `isUnverdictedTask` lo cuente como resultado llegado y el listado `unverdicted` de `aether-report --delegates` y el aviso de `Stop` (Tarea 5) vean a los delegados que editan en Claude, que con `superdelegation` apagada (el valor por defecto) son toda tarea de código en Haiku. Hasta ahora ese camino no escribía ni `result`, ni `answer`, ni `outcome`: `begin` devolvía `answerOf` solo para un intento de solo lectura en Claude, el mod no enrutaba una llamada con `external === null` y `answerOf === null`, y el intento terminaba sin dejar ninguna línea. No añade ningún comando, opción ni entrada de hook, y no cambia cómo funcionan la corrección ni el veredicto de un intento que edita.

**Interfaces:**
1. En `plugins/aether/lib/delegate-task.js`, `begin`: el plan devuelto lleva `answerOf: { task: id, attempt }` en todo intento cuyo `external` es `null`, de solo lectura o que edita, y `answerOf: null` cuando `external` no es `null` (la variable `onClaudeReadOnly` desaparece: sus dos usos eran esa condición y `dirty`, que sigue dependiendo de `!edits`). Un plan rechazado (`refusedLaunchPlan`) y un plan con `error` siguen con `answerOf: null`. `TASK_KINDS` no cambia a propósito: `taskEntries` descarta `ended`, y ni la escalera (`nextLaunch`, `stateOf`), ni `sectionsOf` ni `verdict` deben verla.
2. En `plugins/aether/lib/delegate-run.js`, `recordAnswer({ task, attempt, text, session, dataDir, now = Date.now })` conserva firma y retorno (`{ recorded: boolean }`, nunca lanza). Busca el último lanzamiento (`isLaunch` de `delegate-log.js`) de esa tarea, ese intento y esa sesión (con `session` nulo, de cualquier sesión) en `log.readEntries(dataDir, { task, session: session ?? null })`: si existe y su `edits === true`, escribe `{ kind: 'ended', time: now(), session: session ?? null, task, attempt }`, sin `text`; en cualquier otro caso (lanzamiento de solo lectura, otro intento, otra sesión o ningún lanzamiento) escribe el `answer` de siempre, `{ kind: 'answer', time, session, task, attempt, text }`. Se actualiza el comentario de la función (hoy dice «of a read-only delegate»). No se exporta nada nuevo.
3. En `plugins/aether/hooks/delegate.mjs`, método `step` de `createDelegates`: el rescate de un intento externo pasa siempre `answerOf: { task: routed.id, attempt: routed.attempt }` (hoy pasa `null` cuando `routed.external.edits === true`); un intento sin `external` sigue usando `routed.answerOf`. Se actualizan el comentario de cabecera (líneas 9 y 15 a 18) y el de `step` («An editing one has none…»). El mod sigue sin importar `lib/`, y `remember` no cambia: ahora recibe `answerOf` en todo plan con `external === null`. `aether-delegate answer` recibe también el texto de un intento que edita, y es `recordAnswer` quien no lo guarda.
4. En `plugins/aether/lib/delegate-report.js`, `isUnverdictedTask(entries)` cuenta como resultado llegado, después del último lanzamiento y con `entry.time >= latest.time`: una entrada `ended`, una `answer`, un `outcome` con `status === 'ok'` o un `result` con `ok === true` (la regla de `ok` ya está en el árbol cuando se construye esta tarea; esta solo añade `ended`), y sigue exigiendo que no haya ningún `verdict` después de ese lanzamiento. `rowOfTask`, `stepCounts` y `delegatesReport` no cambian: la fila de un intento que edita en Claude sigue diciendo `applied: 'rewritten'` y `ranOn` de Claude.
5. En `plugins/aether/bin/aether-delegate`, solo el comentario de cabecera (líneas 11 y 18 a 19): `answer` registra el fin de un intento en Claude, el `answer` de uno de solo lectura o la marca de fin de uno que edita.

**Lectores revisados:** `TASK_KINDS` y `taskEntries` (`delegate-task.js`) descartan una clase desconocida, así que `nextLaunch`, `stateOf`, `sectionsOf` y `verdict` no ven `ended`; `previousWork` (`delegate-log`, también desde `delegate-run.js`) solo mira `answer` con texto y `result`, y `relaunchOf`, `placementOf` y `sessionOf` solo `launch`, `verdict` y `authorize`; `delegate-report.js` (`rowOfTask`, `stepCounts`, `relaunches`) lee `launch`, `outcome`, `result` y `verdict`, y `groupTasks` agrupa `ended` por su `task` sin cambiar ninguna cuenta; `continuity-notice` (`workLine`, «Delegates without a result») solo mira `result`, así que `ended` no cambia lo que lista, como no lo cambia `answer`; `delegate-prune` usa solo `session` y `time` de cada línea, y `spend` y `spend-archive` solo `outcome` (una línea `ended` cuenta, como cualquier línea de su sesión, para el tramo en que `spend` ubica una línea rota); `observe-read` conserva de cada línea los campos de su lista (`kind`, `time`, `session`, `task`, `attempt`), `observe-detect`, `observe-calibrate` y `observe-baseline` filtran por `launch`, `verdict` u `outcome` (`detectRiseWithoutReason` retrocede hasta el `verdict` de la misma tarea y salta lo demás), y `observe-issue` solo recoge nombres de tarea; `skill-repeat`, `delegate-authorize` y `delegate-chain` leen `verdict`, `authorize` y `outcome`. Ninguno necesita cambio. Pruebas que fijan la forma antigua: `tests/delegate-task.test.js` línea 240 (`answerOf` es `null` para una tarea que edita: se corrige aquí) y la prueba del rescate de `tests/delegate-mod.test.js` («records no answer»: se reemplaza); se conservan `delegate-task` línea 268 (un plan con par externo sigue sin `answerOf`), `delegate-run` líneas 195 a 203 (sin lanzamiento en el registro, `recordAnswer` escribe `answer`), `delegate-mod` líneas 227 y 247 y `delegate.test.ts` línea 143 (planes armados a mano con `answerOf`). `observe-read` y `observe-guarantees` solo traen líneas `answer` como fixtures. `continuity-hook` (Tarea 5) usa líneas `result` con `ok: true`, que siguen contando.

**Tests (write first):**
1. En `tests/delegate-task.test.js`, reemplazar la línea 240 (`assert.equal((await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)).answerOf, null, 'a task that edits has no answer to record')`) por:

```js
  assert.deepEqual((await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)).answerOf, { task: 'e1', attempt: 1 }, 'a task that edits on Claude names its attempt too, so the mod records when it ends')
```

y añadir al final del archivo (usa `world`, `call`, `BRIEF`, `entries`, `FINDING`, `EXTERNAL`, `GROK`, `makeRepo`, `log`, `fs` y `path` que el archivo ya define):

```js
test('an attempt that edits and runs on Claude names its end like a read-only one; one on an external pair does not (spec 031, C1)', async (t) => {
  const more = 'AETHER-OWNS: src/**\n'
  const native = world(t)
  const onClaude = await task.begin(call(BRIEF('e1', more)), native.deps)
  assert.equal(onClaude.external, null)
  assert.deepEqual(onClaude.answerOf, { task: 'e1', attempt: 1 })
  const repo = makeRepo(t)
  const external = world(t, { settings: EXTERNAL, pick: GROK, cwd: repo.dir })
  const delegated = await task.begin(call(BRIEF('e2', more)), external.deps)
  assert.equal(delegated.external.edits, true)
  assert.equal(delegated.answerOf, null, 'the external pair writes its own result')
})

test('the correction of an attempt that edits on Claude is the same with or without its ended line (spec 031, C1)', async (t) => {
  const more = 'AETHER-OWNS: src/**\n'
  const cycle = async (withEnded) => {
    const { deps, dataDir } = world(t)
    await task.begin(call(BRIEF('e1', more)), deps)
    if (withEnded) log.appendEntry(dataDir, { kind: 'ended', task: 'e1', attempt: 1, session: 's1', time: 5000 })
    const judged = await task.verdict({ task: 'e1', verdict: 'fix', findings: [FINDING] }, deps)
    const again = await task.begin(call(BRIEF('e1', more)), deps)
    return { judged, again }
  }
  const plain = await cycle(false)
  const ended = await cycle(true)
  assert.equal(ended.judged.ok, true)
  assert.deepEqual([ended.judged.next, ended.judged.corrections], [plain.judged.next, plain.judged.corrections])
  assert.deepEqual([ended.again.step, ended.again.kind, ended.again.args], [plain.again.step, plain.again.kind, plain.again.args])
  assert.deepEqual([ended.again.kind, ended.again.args.effort], ['fix', 'xhigh'])
  assert.ok(ended.again.args.prompt.includes(FINDING))
  assert.deepEqual(ended.again.answerOf, { task: 'e1', attempt: 2 })
})

test('an approve of an attempt that edits on Claude checks its worktree with its ended line in the log (spec 031, C1)', async (t) => {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n')), deps)
  log.appendEntry(dataDir, { kind: 'ended', task: 'e1', attempt: 1, session: 's1', time: 5000 })
  const none = await task.verdict({ task: 'e1', verdict: 'approve' }, deps)
  assert.equal(none.ok, false)
  assert.match(none.error, /worktree/, 'the ended line is not an answer to check: the edits are')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(repo.dir, 'docs', 'x.md'), 'x\n')
  const outside = await task.verdict({ task: 'e1', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(outside.ok, false)
  assert.match(outside.error, /docs\/x\.md/)
  fs.rmSync(path.join(repo.dir, 'docs'), { recursive: true })
  const approved = await task.verdict({ task: 'e1', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(approved.ok, true, approved.error)
})
```

2. En `tests/delegate-run.test.js`, añadir después de la prueba `answer records what a delegate on Claude ended with…` (usa `dr`, `log`, `tempDir`, `spawnSync`, `BIN` y `assert` que el archivo ya define):

```js
test('answer writes an ended line, with no text, for an attempt that edits, and an answer line for a read-only one (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launch = (task, attempt, edits) => ({ kind: 'launch', time: 1, session: 's1', task, step: 'haiku', attempt, launchKind: 'first', description: 'd', effort: 'high', edits })
  log.appendEntry(dataDir, launch('e1', 1, true))
  log.appendEntry(dataDir, launch('r1', 1, false))
  assert.deepEqual(dr.recordAnswer({ task: 'e1', attempt: 1, text: 'done, in the worktree', session: 's1', dataDir, now: () => 7 }), { recorded: true })
  assert.deepEqual(dr.recordAnswer({ task: 'r1', attempt: 1, text: 'found it', session: 's1', dataDir, now: () => 8 }), { recorded: true })
  assert.deepEqual(log.readEntries(dataDir, { task: 'e1' }).at(-1), { kind: 'ended', time: 7, session: 's1', task: 'e1', attempt: 1 })
  assert.deepEqual(log.readEntries(dataDir, { task: 'r1' }).at(-1), { kind: 'answer', time: 8, session: 's1', task: 'r1', attempt: 1, text: 'found it' })
})

test('the kind of line follows the latest launch of that attempt in that session; with no launch it is an answer (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launch = (time, session, attempt, launchKind, edits) => ({ kind: 'launch', time, session, task: 't1', step: 'haiku', attempt, launchKind, description: 'd', effort: 'high', edits })
  log.appendEntry(dataDir, launch(1, 's1', 1, 'first', true))
  log.appendEntry(dataDir, launch(2, 's1', 2, 'fix', false))
  log.appendEntry(dataDir, launch(3, 's2', 1, 'first', false))
  for (const [session, attempt, time] of [['s1', 1, 10], ['s1', 2, 11], ['s2', 1, 12], ['s1', 9, 13]]) {
    dr.recordAnswer({ task: 't1', attempt, text: 'x', session, dataDir, now: () => time })
  }
  const written = log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind !== 'launch').map((e) => [e.session, e.attempt, e.kind])
  assert.deepEqual(written, [['s1', 1, 'ended'], ['s1', 2, 'answer'], ['s2', 1, 'answer'], ['s1', 9, 'answer']])
})

test('the bin: answer on an attempt that edits writes an ended line and says it recorded (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  log.appendEntry(dataDir, { kind: 'launch', time: 1, session: 's1', task: 'e1', step: 'haiku', attempt: 1, launchKind: 'first', description: 'd', effort: 'high', edits: true })
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', 's1', '--task', 'e1', '--attempt', '1', '--text', 'done'], { encoding: 'utf8', env })
  assert.deepEqual(JSON.parse(out.stdout.trim()), { recorded: true })
  const last = log.readEntries(dataDir, { task: 'e1' }).at(-1)
  assert.deepEqual([last.kind, last.attempt, Object.hasOwn(last, 'text')], ['ended', 1, false])
})
```

3. En `tests/delegate-report.test.js`, añadir al final (usa `at`, `launch`, `verdict`, `log`, `tempDir`, `delegatesReport` y `unverdictedDelegates` que el archivo ya define o importa):

```js
const editing = (task, attempt, launchKind) => ({ ...launch(task, 'haiku', attempt, launchKind), edits: true })

test('an attempt that edits on Claude is unverdicted once its ended line is in the log, and not before it or after its verdict (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-del-ended-')
  log.appendEntry(dataDir, editing('e-running', 1, 'first'))
  log.appendEntry(dataDir, editing('e-ended', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'ended', task: 'e-ended', attempt: 1 }))
  log.appendEntry(dataDir, editing('e-judged', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'ended', task: 'e-judged', attempt: 1 }))
  log.appendEntry(dataDir, verdict('e-judged', 'haiku', 1, 'approved', { step: null, kind: 'done', cause: null }))

  const report = delegatesReport({ dataDir, session: 's1' })
  assert.deepEqual(report.unverdicted, [{ task: 'e-ended', session: 's1', attempt: 1, step: 'haiku' }])
  const byId = new Map(report.delegations.map((d) => [d.id, d]))
  assert.deepEqual(['e-running', 'e-ended', 'e-judged'].map((id) => byId.get(id).unverdicted), [false, true, false])
  assert.deepEqual([byId.get('e-ended').applied, byId.get('e-ended').ranOn], ['rewritten', { harness: 'claude', model: 'haiku', effort: 'high' }])
})

test('a fix verdict and a new launch hide the earlier ended line until the new attempt ends too (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-del-ended-fix-')
  log.appendEntry(dataDir, editing('t1', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'ended', task: 't1', attempt: 1 }))
  log.appendEntry(dataDir, verdict('t1', 'haiku', 1, 'fix', { step: 'haiku', kind: 'fix', cause: 'fix' }))
  log.appendEntry(dataDir, editing('t1', 2, 'fix'))
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [])
  log.appendEntry(dataDir, at({ kind: 'ended', task: 't1', attempt: 2 }))
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [{ task: 't1', session: 's1', attempt: 2, step: 'haiku' }])
})
```

4. En `tests/delegate-mod.test.js`: añadir arriba `const log = require('../plugins/aether/lib/delegate-log.js')` y `const { unverdictedDelegates } = require('../plugins/aether/lib/delegate-report.js')` junto a los demás `require`; reemplazar la prueba `the rescue of an editing external delegate records no answer: its checks come from its worktree, not from a text` por las dos siguientes (usa `make`, `recorder`, `collect`, `answersOf`, `EV`, `CTX`, `PLAN`, `EXTERNAL`, `PLUGIN`, `NO_LANES_CONFIG`, `makeRepo`, `tempDir`, `spawnSync`, `fs` y `path` del archivo):

```js
test('the rescue of an editing external delegate records the end of its attempt once, at its last step (spec 031, C1)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'off', text: null }], answer: [{ recorded: true }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const model = async function* () { return { answer: 'done, in the worktree', stopReason: 'end_turn' } }
  const { result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(result.answer, 'done, in the worktree')
  const recorded = answersOf(calls)
  assert.equal(recorded.length, 1)
  assert.deepEqual(recorded[0].argv.slice(recorded[0].argv.indexOf('--task')), ['--task', 't1', '--attempt', '1', '--text', 'done, in the worktree'])
})

test('an editing external delegate that delivers records no end: its result line is the arrival (spec 031, C1)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  const model = async function* () { asked += 1; return { answer: 'from the model', stopReason: 'end_turn' } }
  const { result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(result.answer, 'branch aether/r/task-1')
  assert.equal(asked, 0)
  assert.equal(answersOf(calls).length, 0)
})
```

y añadir al final del archivo la prueba con el `aether-delegate` real:

```js
test('an editing delegate on Claude leaves an ended line when its agent ends, and the real verdict still checks its worktree (spec 031, C1)', async (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-e2e-ended-')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'sessions', 's-end.delegate.json'), JSON.stringify({ lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }))
  const env = { ...process.env, AETHER_DATA_DIR: dataDir, AETHER_LANES_CONFIG: NO_LANES_CONFIG }
  const ctx = { session: 's-end', dataDir, root: PLUGIN }
  const $ = {
    clock: { now: async () => Date.now() },
    fs: { write: async (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8') } },
    process: {
      run: async (argv, init = {}) => {
        const r = spawnSync(argv[0], argv.slice(1), { cwd: (init && init.cwd) || repo.dir, env, encoding: 'utf8', timeout: (init && init.timeoutMs) || 30000 })
        return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
      },
    },
  }
  const brief = 'AETHER-TASK: t-end\nAETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\nImplement src/a.js.'
  const delegates = createDelegates()
  const seen = []
  await delegates.toolCall($, { subagent_type: 'general-purpose', description: 'end', prompt: brief }, async (event) => (seen.push(event), {}), ctx)
  delegates.bind($, seen[0], 'agent-end', ctx)
  assert.equal(delegates.has('agent-end'), true, 'the mod routes an attempt that edits on Claude')
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's-end' }), [], 'while the agent runs, nothing has arrived')

  const model = async function* () { return { answer: 'done, in the worktree', stopReason: 'end_turn' } }
  await collect(delegates.step($, { index: 0, agentId: 'agent-end', turnId: 't' }, model, ctx))
  const written = log.readEntries(dataDir, { task: 't-end' }).filter((e) => e.kind !== 'launch')
  assert.deepEqual(written.map((e) => [e.kind, e.attempt, e.session, Object.hasOwn(e, 'text')]), [['ended', 1, 's-end', false]])
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's-end' }), [{ task: 't-end', session: 's-end', attempt: 1, step: 'haiku' }])

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'module.exports = 1\n')
  const judged = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-delegate'), 'verdict', '--session', 's-end', '--task', 't-end', '--verdict', 'approve', '--worktree', repo.dir], { cwd: repo.dir, env, encoding: 'utf8' })
  const approved = JSON.parse(judged.stdout.trim().split('\n').pop())
  assert.equal(approved.ok, true, JSON.stringify(approved))
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's-end' }), [])
})
```

5. En `plugins/aether/hooks/delegate.test.ts`, añadir después de `a read-only delegate on Claude goes through the model, and its last answer is recorded with answer` (usa `stubs`, `call`, `spawn`, `step`, `PLAN` y `EXTERNAL` del archivo):

```ts
test('the rescue of an editing external delegate records the end of its attempt with answer', async ($, on) => {
  const { runs, toolCalls, counts } = stubs(on, {
    verbs: {
      begin: [{ ...PLAN, external: EXTERNAL }],
      start: [{ started: true, id: 't1', pid: 1 }],
      wait: [{ done: true, ok: false, status: 'off', text: null }],
      answer: [{ recorded: true }],
    },
  })
  await call($, 'AETHER-TASK: t1\nAETHER-OWNS: src/**\nDo it.')
  const spawned = await spawn($, toolCalls[0].prompt)
  const rescued = await step($, { index: 0, agentId: spawned.agentId })
  expect(rescued.result.answer).toBe('from the model')
  expect(counts.modelSteps).toBe(1)
  const answered = runs.filter((r) => r.argv[2] === 'answer')
  expect(answered.length).toBe(1)
  expect(answered[0].argv.slice(answered[0].argv.indexOf('--task'))).toEqual(['--task', 't1', '--attempt', '1', '--text', 'from the model'])
  expect(answered[0].init.timeoutMs).toBeLessThanOrEqual(15000)
})
```

**Acceptance:**
- Un intento de una tarea que edita y corre en Claude deja, al terminar su agente, una línea `ended` (`{ kind, time, session, task, attempt }`, sin texto) en `<dataDir>/delegates/log.jsonl`, y entonces sale en `unverdicted` de `aether-report --delegates` y en el aviso de `Stop` hasta que recibe su veredicto; un intento de solo lectura sigue escribiendo su `answer` como hasta ahora.
- Un intento que edita en otro arnés y que Claude rescata deja también su `ended`; uno que el otro arnés entrega no deja ninguna línea nueva, y su `result` es la llegada.
- La corrección de un intento que edita (`fix`, su relanzamiento, su esfuerzo y su encargo) y su veredicto con `--worktree` se comportan igual con la línea `ended` en el registro que sin ella.
- Ningún lector del registro cambia lo que informa: `node --test tests/delegate-task.test.js tests/delegate-run.test.js tests/delegate-report.test.js tests/delegate-mod.test.js tests/continuity-hook.test.js tests/delegate-log.test.js` pasa.
- `npm run test:mod` pasa (la prueba de `plugins/aether/hooks/delegate.test.ts` corre con esa orden y no con `npm test`), y `npm test` pasa entero, con los verificadores estructurales (`guards`, `guards-delegate-1`, `guards-delegate-2`, `guards-bins`) que ninguna tarea edita.
