# Los delegados que editan salen primero a otros harness: tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual. Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice. El plan, `plan.md`, dice por qué cada pieza existe: léelo antes de empezar.
- **Idioma.** El código, los comentarios, los mensajes y los documentos del repositorio van en inglés; este archivo y el plan, en español. Un texto que un test fija (mensaje, línea de uso, frase) va exactamente como lo escribe el test.
- **Estilo.** Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma ni dependencias de npm. Los bins son finos y la lógica vive en `plugins/aether/lib/`. Las funciones de `lib/` son puras o reciben sus dependencias (reloj, directorio de datos, si un pid vive) por parámetro.
- **Primero los tests.** Cada tarea escribe sus tests (rojo), implementa y deja `npm test` verde completo antes de reportar. Cada fusión corre `npm test` entero: una tarea no puede dejar rota una prueba que no es suya. Los tests existentes que una tarea cambia son los de su `Owns`; ninguna otra aserción existente cambia.
- **Sin llamadas pagadas ni de red.** Los tests usan `tests/lane-fixtures.js`, `tests/fixtures/fake-agy.js`, `fake-grok.js`, `fake-muse.js` y los decididores simulados de `tests/router-route.test.js`. Nadie corre un CLI de harness real con un prompt real. La corrida real (R17) la hace el Lead después de fusionar todo, con el permiso `paid-call`; ninguna tarea la hace.
- **Nadie escribe bajo `specs/` ni `.specify/`** (aether-guard lo rechaza a los implementadores). Tampoco se sube la versión, se toca el changelog, se empuja, se abre un pull request ni se fusiona.
- **La frase de alcance, idéntica donde un archivo la lleve:** `Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.`
- **Formas compartidas entre tareas** (las fija el test de la tarea que las produce; las demás las importan):
  - **El comando** (lo escribe la Task 3; lo nombran las Tasks 5 y 6): `aether-lane delegate --brief <file> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> --owns <glob>[,<glob>...] [--tests <command>] [--session <id>]`. El rol del que edita es siempre `implementer`. Imprime un JSON (`DelegateResult`) y sale con código 0 en sus tres estados; un error de uso sale como `{ error }` con código 1, como todo el bin.
  - **El id de la tarea** es el id de la corrida que el comando crea (`run.newRunId()`). Es el `<id>` de la línea `AETHER-TASK: <id>`, el `id` y el `run` del resultado y de la entrada `delegate` del registro de lanes, y su rama es `aether/<id>/task-1`.
  - **El resultado** (`DelegateResult`, plan D5):
    - `done`: `{ status: 'done', id, run, branch: 'aether/<id>/task-1', worktree, head, pair: { id, harness, model, effort }, reason, summary, implementer: { status, tests, concerns, question }, tests: { command, exitCode, passed, timedOut, outputTail } | null, review, tried: [{ pair, cause, patch }], merge: 'aether-wt merge <id> task-1' }`. `tests` es `null` cuando el encargo no trae `--tests`. `review` es `{ status: 'done', pair, verdict, findings, summary }`, o `{ status: 'none', cause: 'no-pair' | 'dry' | 'cupo' }`, o `{ status: 'no-verdict', tried: [{ pair, cause }] }`.
    - `no-candidate`: `{ status: 'no-candidate', id, run, cause: 'no-pair' | 'dry' | 'cupo' | 'failed', reason, tried: [{ pair, cause, patch }] }` (`pair` es `null` en una entrada de `tried` que solo dice que un harness estaba lleno; entonces la entrada lleva `harness` en su lugar).
    - `off`: `{ status: 'off', reason: 'option' | 'platform' }`, sin corrida, sin registro y sin llamada.
  - **Las llamadas de la corrida** se nombran `task-1-<intento>-implement` (desde 1) y `task-1-review-<intento>`, y el parche de un intento fallido del que escribe es `runs/<id>/patches/task-1-attempt-<intento>.patch`.
  - **La entrada del registro de lanes** de un «sin candidato» (la escribe la Task 3, la lee la Task 4): `{ kind: 'delegate', time, session, run, id, status: 'no-candidate', cause, tried }`, con `lanes.appendLog(dataDir, session, entry)` (`session` es el `--session` del comando o `null`). El comando registra además cada elección con la entrada `choice` de hoy (`run`, `call`, `role`, `requested`, `reference`, `picked`, `native`, `reason`, `candidates`).
  - **El par de referencia del revisor** (R1, lo escribe la Task 3): `reviewerReference(model)`: `opus` → `{ model: 'opus', effort: 'xhigh' }`; `haiku` → `{ model: 'sonnet', effort: 'high' }`; cualquier otro → `{ model: 'opus', effort: 'high' }`.
  - **Los campos del diario del router** (los escribe la Task 2, los lee la Task 4): toda entrada `decision` lleva `aetherTask: string | null` (el id de la línea `AETHER-TASK: <id>` del brief entero) y `taskClass: 'edits' | 'read-only' | null` (`null` es «sin clase»: `ROUTER-OVERRIDE:`, fallo del decider, error interno). `route.aetherTaskOf(prompt)` devuelve el id o `null`, como `overrideOf`.
  - **La medida** (la escribe la Task 4): `delegatesReport` gana `editsOnClaudeWithoutNoCandidate: [{ id, time, session, description, aetherTask, ranOn }]` y `outsideMeasure: string`; `router-report.js` exporta además `editsWithoutNoCandidate(delegations, noCandidateIds)`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [E5] El `reviewer` con tarea revisa la copia de la unidad in plugins/aether/lib/lane-calls.js → Task 1
- [ ] T002 [P] [E4] La línea `AETHER-TASK: <id>` y la clase en el diario del router in plugins/aether/lib/route.js → Task 2
- [ ] T003 [E1] El comando `aether-lane delegate` in plugins/aether/lib/lane-delegate.js → Task 3
- [ ] T004 [E1] El verbo `delegate` del bin in plugins/aether/bin/aether-lane → Task 3
- [ ] T005 [E4] La medida en `aether-report --delegates` in plugins/aether/lib/router-report.js → Task 4
- [ ] T006 [P] [E1] La regla del Lead in plugins/aether/skills/using-aether/SKILL.md → Task 5
- [ ] T007 [P] [E1] Las páginas de usuario in docs/guide/lanes.md → Task 6
- [ ] T008 [E1] Las pruebas de escenario E1 a E8 por el camino real in tests/lane-delegate-scenarios.test.js → Task 7

### Task 1: El reviewer de una lane sobre la unidad

**Aether:**
- Tier: sonnet high — toca el arranque, la foto previa y el juicio de una llamada que el enjambre también usa, y el caso de hoy sin tarea tiene que quedar byte a byte
- Review: xhigh — un lector que escriba en la unidad real o una foto previa mal tomada pasan sin que las pruebas del enjambre lo vean
- Area: lanes
- Owns: `plugins/aether/lib/lane-calls.js`, `tests/lane-reviewer-unit.test.js`
- Depends on: none
- Serves: R10

**Interfaces:**

En `plugins/aether/lib/lane-calls.js`, `start(cwd, runId, call, { role, task, model, effort, digest })` gana un caso y ningún otro cambio de forma:

- Con `role: 'reviewer'` y `task: '<taskId>'`, la llamada es de solo lectura sobre **la unidad**: `call.json` guarda `task: '<taskId>'` (hoy guarda `null`), el espacio de trabajo es `work.prepareReader(cwd, runId, call, { taskId })` —la copia desechable de la rama de la unidad con `brief.md` y `package.diff`—, el límite es `harness.timeouts.reviewer` como hoy, y la nota de la lane es esta variante de la del `reviewer` (el texto exacto, con el nombre del harness donde va):

  `## You run in an external harness\n\nYou are an Aether reviewer, run by the <harness> CLI rather than Claude Code. The current directory is a disposable copy of the unit's branch, not of the integration branch; the unit's brief (brief.md) and the review package (package.diff) are in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. <WORKDIR_RULE> Every other rule of your role holds. Answer with the structured output your harness asks for.`

  El runner la elige cuando el rol es `reviewer` y el `task` de su `call.json` no es `null`; cómo viaja hasta `buildPrompt` es cosa de esta tarea, sin cambiar la forma de `laneNote(role, harness)` para los demás llamantes ni el contenido de `LANE_NOTES`.
- En el runner, la foto previa de un `reviewer` con tarea incluye la unidad (`work.snapshot(cwd, runId, { taskId: info.task })`), y `judge` le aplica `work.checkUnitUnchanged` igual que al supervisor: si la unidad real cambió, el resultado es `{ status: 'blocked', detail: 'the unit worktree changed during a read-only lane call', result: null }`.
- Con `role: 'reviewer'` y sin `task`, todo queda como hoy, byte a byte: la copia de la rama de integración con `packages/final.diff`, sin foto de unidad, y la nota «Aether final reviewer» de hoy sin tocar una letra.
- Un `reviewer` con una tarea que no está en el grafo falla al preparar el espacio, como un supervisor: `start` devuelve `{ unavailable: 'workspace' }`.
- El bin ya pasa `--task`: `aether-lane start <run> <call> --role reviewer --task task-1 --model <lane model> --effort <effort> --digest <digest>` tiene que funcionar sin tocar el bin.

**Tests (write first):**

`tests/lane-reviewer-unit.test.js`. Sigue el patrón de las pruebas del supervisor de `tests/aether-lane.test.js`: `fx.laneRun(t)` compila una corrida de una tarea, se corre un implementador simulado que escribe y comitea en la unidad, y sobre esa unidad se lanza el revisor.

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./lane-fixtures.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote a.js.', head: '', tests: '1/1 pass', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const flags = (digest, { role, model, effort, task = 'task-1' }) => ['--role', role, ...(task ? ['--task', task] : []), '--model', model, '--effort', effort, '--digest', digest]

// A compiled run whose unit branch holds one committed file, as a finished implementer leaves it.
function preparedUnit(t) {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const call = 'task-1-1-implement'
  const digest = fx.writePrompt(args, call, `Do task-1.\nFAKE-AGY: write src/t1/a.js one\nFAKE-AGY: commit add a\nFAKE-AGY: answer ${DONE}`)
  assert.equal(fx.lane(args, 'start', [call, ...flags(digest, { role: 'implementer', model: 'claude-sonnet-5-5', effort: 'high' })], env).json.started, true)
  assert.equal(fx.waitDone(args, call, env).status, 'ok')
  const unit = path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1')
  return { args, env, unit }
}

test('a reviewer call with a task reviews a disposable copy of the unit branch, with its brief and package, then the copy is removed', (t) => {
  const { args, env, unit } = preparedUnit(t)
  const call = 'task-1-review-1'
  const digest = fx.writePrompt(args, call, `Review the diff of task-1.\nFAKE-AGY: answer ${READY}`)
  const start = fx.lane(args, 'start', [call, ...flags(digest, { role: 'reviewer', model: 'claude-opus-5-5', effort: 'high' })], env)
  assert.deepEqual(start.json, { started: true, model: 'claude-opus-5-5-high', group: 'claude' })
  const done = fx.waitDone(args, call, env)
  assert.deepEqual([done.status, done.result.verdict], ['ok', 'ready'])
  const copy = path.join(args.repoRoot, '.aether', 'lanes', args.runId, call)
  const turn = fx.agyTurns(env).find((turn) => turn.cwd === copy)
  assert.ok(turn, 'the reviewer ran in the unit copy')
  assert.deepEqual([turn.head, turn.files], [fx.git(unit, 'rev-parse', 'HEAD'), ['brief.md', 'package.diff']])
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '1200s', "the reviewer's own timeout")
  assert.ok(turn.argv[1].startsWith(fx.roleBody('reviewer')))
  assert.ok(turn.argv[1].includes("a disposable copy of the unit's branch, not of the integration branch; the unit's brief (brief.md) and the review package (package.diff) are in its .aether-tmp/ folder"), 'the unit note')
  assert.ok(!turn.argv[1].includes('Aether final reviewer'), 'the unit reviewer is not told it is the final reviewer')
  assert.equal(fs.existsSync(copy), false)
  assert.equal(fx.git(args.repoRoot, 'worktree', 'list').includes(copy), false)
})

test('a reviewer call with a task that writes to the real unit worktree is blocked', (t) => {
  const { args, env, unit } = preparedUnit(t)
  const call = 'task-1-review-1'
  const digest = fx.writePrompt(args, call, `FAKE-AGY: write-abs ${path.join(unit, 'src', 't1', 'z.js')} x\nFAKE-AGY: answer ${READY}`)
  fx.lane(args, 'start', [call, ...flags(digest, { role: 'reviewer', model: 'claude-opus-5-5', effort: 'high' })], env)
  const done = fx.waitDone(args, call, env)
  assert.deepEqual([done.status, done.detail, done.result], ['blocked', 'the unit worktree changed during a read-only lane call', null])
})

test('a reviewer call with a task that is not in the run is unavailable, and without a task it still reviews the integration branch', (t) => {
  const { args, env } = preparedUnit(t)
  const missing = fx.writePrompt(args, 'task-9-review-1', `FAKE-AGY: answer ${READY}`)
  const start = fx.lane(args, 'start', ['task-9-review-1', ...flags(missing, { role: 'reviewer', model: 'claude-opus-5-5', effort: 'high', task: 'task-9' })], env)
  assert.deepEqual(start.json, { unavailable: 'workspace' })
  // The final reviewer of today keeps its own test in tests/aether-lane.test.js, which this task does not change.
})
```

**Acceptance:**

- Los tres tests pasan, y `tests/aether-lane.test.js` entero sigue verde sin tocarlo: el `reviewer` sin tarea y el supervisor se comportan como hoy, y la nota del revisor final queda byte a byte.
- `npm test` verde completo.

### Task 2: El router guarda la línea AETHER-TASK y la clase

**Aether:**
- Tier: haiku high — un buscador de línea y dos campos en la entrada, que los tests fijan caso por caso
- Review: xhigh — un id leído del extracto en vez del brief entero, o una clase puesta donde no hubo clasificación, tuercen la medida sin que se vea
- Area: router
- Owns: `plugins/aether/lib/route.js`, `tests/router-aether-task.test.js`
- Depends on: none
- Serves: R19

**Interfaces:**

En `plugins/aether/lib/route.js`:

```js
aetherTaskOf(prompt) // -> string | null; exportada junto a overrideOf
```

- `aetherTaskOf` parte el prompt en líneas (`\r?\n`), como `overrideOf`, y devuelve el texto tras el prefijo fijo `'AETHER-TASK: '`, recortado, solo cuando cumple la forma de id del módulo (`ID_RE`, `/^[A-Za-z0-9_-]+$/`); en cualquier otro caso, `null`. Una línea que lleve el prefijo pero un id inválido no devuelve nada ni corta la búsqueda: puede haber otra línea buena detrás. Busca en el prompt entero, nunca en el extracto de 400 caracteres de la entrada.
- Toda entrada `decision` que `baseEntry` crea lleva `aetherTask: aetherTaskOf(task.prompt)` y `taskClass: null`. En `conclude`, cuando el decider respondió (el camino con `verdict`), la entrada guarda `taskClass: verdict.readOnly ? 'read-only' : 'edits'`. En el camino de fallo del decider, en `overridePlan` y en `recordInternalError`, `taskClass` queda `null` y `aetherTask` se captura igual (un `ROUTER-OVERRIDE:` con línea `AETHER-TASK:` guarda el id y sigue sin clase, como dice R19).
- Nada más cambia: ningún plan, nota, decisión ni modo se toca; una llamada a un agente `aether:*` sigue devolviendo `skipPlan('aether-agent')` sin entrada, y sin ajustes del router no hay entrada.

**Tests (write first):**

`tests/router-aether-task.test.js`. Sigue el arnés de `tests/router-route.test.js`: copia de allí su `setup`, su `go` y su `journal` (ajustes, lecturas fijas, decididor por `begin`/`finish`; ese archivo no exporta nada); el diario se lee con `router-log.readJournal`. Las respuestas del decider reutilizan su forma: `edits_files` con `noul 0.95` clasifica como que edita y con `noul 0.03` como de solo lectura, igual que en ese archivo.

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { aetherTaskOf } = require('../plugins/aether/lib/route.js')

test('aetherTaskOf reads the id from its own line, anywhere in the brief, and nothing else', () => {
  assert.equal(aetherTaskOf('Do the work.\nAETHER-TASK: 20261021-021202-4a26\nMind the tests.'), '20261021-021202-4a26')
  assert.equal(aetherTaskOf('AETHER-TASK: 20261021-021202-4a26'), '20261021-021202-4a26')
  assert.equal(aetherTaskOf('the line AETHER-TASK: 20261021-021202-4a26 quoted mid-sentence'), null)
  assert.equal(aetherTaskOf('AETHER-TASK: not an id!\nAETHER-TASK: 20261021-021202-4a26'), '20261021-021202-4a26')
  assert.equal(aetherTaskOf('AETHER-TASK:'), null)
  assert.equal(aetherTaskOf('no marker at all'), null)
  assert.equal(aetherTaskOf(null), null)
  assert.equal(aetherTaskOf(undefined), null)
  const beyond = `${'x'.repeat(500)}\nAETHER-TASK: 20261021-021202-4a26`
  assert.equal(aetherTaskOf(beyond), '20261021-021202-4a26', 'found past the 400 characters of the excerpt')
})
```

Y, con el arnés copiado, estos cuatro casos contra el diario real (`readJournal(deps.dataDir)`), cada uno con su llamada por `begin` y su cierre como el mod lo hace (`finish` con la respuesta, o el camino que corresponda):

1. **Edita, con id más allá de los 400 caracteres.** El prompt es un relleno de 500 caracteres, un salto, `AETHER-TASK: 20261021-021202-4a26` y el encargo; la respuesta del decider trae `edits_files: { noul: 0.95, confidence: 0.95 }`. La única entrada `decision` cumple `entry.taskClass === 'edits'`, `entry.aetherTask === '20261021-021202-4a26'` y `entry.task.excerpt` no contiene el id.
2. **Solo lee, sin id.** `edits_files: { noul: 0.03, confidence: 0.95 }`, sin línea `AETHER-TASK:`: `taskClass === 'read-only'` y `aetherTask === null`.
3. **Override con id.** El brief lleva `ROUTER-OVERRIDE: the Lead keeps this choice`, `AETHER-TASK: 20261021-021202-4a26` y modelo y effort pedidos: `taskClass === null`, `aetherTask === '20261021-021202-4a26'` y `override` como hoy (el decider no se llama).
4. **Fallo del decider y agentes fuera.** Con un cierre `{ failure: '<code>' }`, la entrada cumple `taskClass === null`. Y una llamada con `subagent_type: 'aether:implementer'` devuelve `skip: true` con `why: 'aether-agent'` y el diario sigue vacío.

**Acceptance:**

- Los tests pasan y `tests/router-route.test.js`, `tests/router-log.test.js` y `tests/router-report.test.js` siguen verdes sin tocarlos: las entradas de hoy solo ganan campos.
- `npm test` verde completo.

### Task 3: El comando aether-lane delegate

**Aether:**
- Tier: opus high — el núcleo de la obra: worktrees y ramas que se deshacen, un cupo entre procesos, la regla de elección dentro de un bucle de reintentos y la revisión, con pérdida de trabajo en juego si un caso sale mal
- Review: xhigh — un intento fallido que no guarde su parche, un hueco de cupo que no se suelte o un par repetido no los ve ninguna prueba ajena
- Area: lanes
- Owns: `plugins/aether/lib/lane-delegate.js`, `plugins/aether/bin/aether-lane`, `tests/lane-delegate.test.js`
- Depends on: Task 1 — la revisión del diff es la lane `reviewer` con tarea que esa tarea añade
- Serves: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R13, R20

**Interfaces:**

`plugins/aether/lib/lane-delegate.js` (nuevo):

```js
const ALLOWED_HARNESSES = ['agy', 'grok', 'muse']
const DELEGATE_USAGE = 'delegate --brief <file> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> --owns <glob>[,<glob>...] [--tests <command>] [--session <id>]'

reviewerReference(model) // opus -> { model: 'opus', effort: 'xhigh' }; haiku -> { model: 'sonnet', effort: 'high' }; else { model: 'opus', effort: 'high' }
acquireSlot(dataDir, harness, maxParallel, { pid = process.pid, isAlive, liveExternal = 0, runId = null } = {}) // -> { slot: <dir> } | null; the slot dir holds `pid` and, when runId is given, `run`
releaseSlot(dataDir, harness, slot) // removes the slot dir; never throws
liveLaneCalls(mainRoot, harness, { dataDir = null, excludeRun = null, isAlive } = {}) // -> number of lane calls of harness still in flight in that repo that no standing slot already counts
delegateCommand(cwd, flags, deps = {}) // -> Promise<DelegateResult> (Global Constraints)
// flags: { brief, model, effort, owns, tests, session }, all strings or undefined, exactly as the bin parsed them
// deps, every one optional in production and replaced in tests: { env, now, newRunId, wait, isAlive };
//   wait defaults to calls.wait of lib/lane-calls.js and is always the only wait the command uses
```

El bin suma el verbo sin tocar los demás: en el comentario y en el `USAGE` entra `aether-lane delegate --brief <file> ...`, y `delegate` se despacha antes del camino general (no lleva `<run>` ni `<call>`): lee sus flags con el `flags()` del bin y llama a `delegate.delegateCommand(cwd, parsed)`, imprimiendo su JSON como todo el bin.

El comportamiento, en este orden:

1. **Uso.** Sin `--brief`, `--model`, `--effort` u `--owns` (o con un modelo o effort fuera de las listas de `pairs`), lanza `Error('usage: aether-lane ' + DELEGATE_USAGE)` —el bin lo imprime como `{ error }` con código 1—. `--owns` se parte por comas; cada entrada pasa la misma regla que un `Owns` de plan (relativa, sin `..`, sin espacios ni llaves): esa comprobación (`isOwnsEntry`) es hoy interna del parser de planes y no se exporta, así que vive aquí como una función propia con su test, sin tocar el parser. `--session`, si viene, pasa `/^[A-Za-z0-9_-]+$/` o es un error de uso.
2. **Apagado (R20).** `superdelegation.enabled(env)` dice que no → devuelve `{ status: 'off', reason }` sin leer el brief ni las tablas, sin crear corrida y sin escribir en ningún registro.
3. **La corrida de una unidad (plan D2).** Lee el archivo del brief (si no se puede leer, error con su ruta), carga la tabla de lanes (`lanes.loadConfig(lanes.configPath())`; sin tabla, error, como `pick`) y la de pares, calcula los harness habilitados (`lanes.enabledHarnesses()` restringidos a `ALLOWED_HARNESSES`, en ese orden) y los `lanes` del grafo con `superdelegation.runArgs`. Crea `id = newRunId()`, `run.ensureExcluded`, escribe el brief de `task-1` en el `briefs/` de la corrida con el texto del brief y `graph.json` con la forma de D2: integración = la rama y el worktree actuales de `cwd` (`git.currentBranch`/`repoPaths`; un HEAD desprendido es un error que lo dice), `testCommand` = `--tests` o `'true'`, sin `baseline.json`, y `state.json` como lo escribe `compile` (`status: 'compiled'`, `plan: null`, `compiledAt`, `launches: 1`).
4. **El bucle de elección (plan D3)**, una sola función para el que escribe y para el revisor, parametrizada por rol, referencia, excluidos iniciales y nombre de llamada. En cada vuelta: `latestReadings` y `harnessViews` de `lane-pick`, `choose` con `{ pairs, reference, harnesses, exclude, nativeDiffers: role !== 'implementer' }`, y la entrada `choice` en el registro (la misma forma que `pickCommand`). Sin par, la vuelta acaba con la causa de D3.4 (`dry` cuando alguna cuota que llega está seca —la misma prueba que `choose` ya hace para su razón—, si no `no-pair`; `cupo` cuando candidatos había y lo único que los cerró en esta tarea fueron cupos llenos; `failed` cuando al menos un par se intentó y falló). Con par, antes de reservar cuenta las llamadas de lane vivas de ese harness ajenas a esta corrida y que ningún hueco en pie ya cuenta (`liveLaneCalls(mainRoot, harness, { dataDir, excludeRun: id, isAlive })`, con `mainRoot` de `repoPaths(cwd)`) y reserva con esa cuenta como `liveExternal` y con `runId: id`, para que el hueco propio nombre a esta corrida: un `acquireSlot` que devuelve `null` porque los huecos en pie ya llegan a `maxParallel - liveExternal` anota `{ pair: null, harness, cause: 'cupo' }` una sola vez por harness, excluye todos los pares de ese harness y sigue: eso no es un intento.
5. **El intento.** Con hueco reservado (y liberado en un `finally` pase lo que pase): escribe `prompt.md` y `spawn.json` (`{ session, workflowRunId: null, agentIndex: null }`) en `runs/<id>/lanes/<call>/`, con `lanes.digest(prompt)`; llama a `calls.start(cwd, id, call, { role, task: 'task-1', model: picked.model, effort: picked.effort, digest })`; un `unavailable` es un intento fallido con esa causa (`unavailable: <qué>`); si arrancó, espera con el `wait` de las deps (`calls.wait` si no se inyectó ninguno): `wait(cwd, id, call, { maxSeconds: harness.timeouts[role] + 180 })`, y luego `calls.result`. El prompt del implementador es el brief, seguido de una sección que nombra las rutas que posee y, si la tarea lo trae, su comando de pruebas; el del revisor dice, en este orden: la instrucción de revisar el paquete `package.diff` contra el `brief.md`, ambos en la carpeta `.aether-tmp` de su copia, lo que el implementador reportó y el resultado de las pruebas que el comando corrió. Ningún camino de este módulo importa `delegate-limits`.
6. **El intento fallido del que escribe (R8).** Falla un `unavailable`, un resultado que no es `ok` y un implementador `NEEDS_CONTEXT` o `BLOCKED` (causa `needs-context` y `blocked`). Al fallar: `wt.removeUnit(cwd, id, 'task-1', { keepPatch: true })`, el parche que devuelva se renombra con el número del intento (la forma de las Global Constraints) (si no devuelve ninguno, `patch: null`), se anota `{ pair: picked.id, cause, patch }` y se sigue con ese par excluido. La causa de un resultado es su `status` (`quota`, `failed`, `violation`, `blocked`), y el detalle va en `reason` del resultado cuando no queda candidato.
7. **Sin candidato (R9).** Devuelve el `no-candidate` de las Global Constraints y, antes, anota la entrada `delegate` en el registro de lanes con el mismo id, causa y `tried`. No pide nada a nadie.
8. **Termina (R5, R10, R11).** Con un implementador `ok` (`DONE` o `DONE_WITH_CONCERNS`): la lane ya comiteó en la rama. Si hay `--tests`, lo corre el comando dentro del worktree de la unidad (shell, codificación utf8, tope de 15 minutos, `outputTail` de los últimos 4000 caracteres juntando salida y error, `timedOut` como en `merge`). Después, la revisión: el bucle con rol `reviewer`, referencia `reviewerReference(model del encargo)` y excluidos `[par que escribió]`; el primer `ok` da `{ status: 'done', pair, verdict, findings, summary }` del resultado estructurado; si la primera elección ya no da par, `{ status: 'none', cause }` sin lanzar nada; si probó revisores y ninguno dio `ok`, `{ status: 'no-verdict', tried }`. Un fallo de revisor nunca toca la rama ni repite al que escribió. Devuelve el `done` de las Global Constraints. El comando **no fusiona** nunca.

`acquireSlot` crea con `fs.mkdirSync` el primer hueco libre `slot-<i>` (`i` de 0 a `maxParallel - 1`) bajo `<dataDir>/lanes/cupo/<harness>/` y escribe dentro `pid` con su pid y, cuando le pasan `runId`, `run` con ese id de corrida, solo si los huecos ocupados no llegan a `maxParallel - liveExternal`; un hueco ocupado cuyo pid no vive se borra y se reintenta en el momento; sin capacidad, `null`. `isAlive(pid)` por defecto pregunta con `process.kill(pid, 0)`. `liveLaneCalls` recorre `<mainRoot>/.aether/runs/*/lanes/*/call.json` (sin esa carpeta, 0) y cuenta 1 por carpeta de llamada cuyo `call.json` tiene `harness` igual al pedido (un `call.json` sin campo `harness` cuenta como `agy`, como `callHarness` en `lane-calls.js`), cuya corrida no es `excludeRun`, sin un `result.json` con `done: true` y con un archivo `pid` cuyo pid vive (`isAlive`); un `call.json` ilegible no cuenta ni rompe la cuenta. Antes de contar, cuando le pasan `dataDir`, junta los ids de corrida que tienen un hueco en pie de ese harness —cada `slot-*/` bajo `<dataDir>/lanes/cupo/<harness>/` cuyo `pid` vive y cuyo archivo `run` se puede leer, recortado— y salta las llamadas de esas corridas (la carpeta `runs/<id>/`), porque su hueco ya las cuenta: así la llamada de otro delegado no se cuenta dos veces. Un hueco sin `run` legible o con el pid muerto no excluye a ninguna corrida, y contar no borra huecos: reclamarlos es de `acquireSlot`.

**Tests (write first):**

`tests/lane-delegate.test.js`, con `fx.laneEnv(t)` (la tabla real contra el fake agy) y repositorios de `makeRepo(t)`. El encargo de cada test es un brief en un archivo del repositorio de juguete, con las directivas del fake agy dentro. Los tests corren el bin por `runBin(LANE_BIN, ['delegate', ...], repo.dir, env)` salvo donde se dice que importan el módulo.

El brief solo puede llevar las directivas del implementador (el prompt del revisor lo escribe el comando), así que el archivo de tests define su propio envoltorio del CLI, `roleFake(t, { failModels = [], quotaModels = [], reviewAnswer = READY })`: escribe en un temporal un script ejecutable que reenvía al fake agy de las fixtures (`fx.FAKE_AGY`) con los mismos argumentos, añadiendo directivas al final del argumento `-p` según el caso —si el `--model` está en `failModels`, `FAKE-AGY: exit-error model not found: <model>`; si está en `quotaModels`, la negativa de cuota que las pruebas de lanes ya usan (`FAKE-AGY: exit-code 3` y su texto); si el prompt empieza por el cuerpo del `reviewer` (`fx.roleBody('reviewer')`) y `reviewAnswer` no es `null`, `FAKE-AGY: answer <reviewAnswer>`— y devuelve su ruta para ponerla como `command` de agy en `fx.laneEnv(t, { command })`. `/usage` y `--version` se reenvían sin tocar. Con eso, «el primer par» de un test es el modelo que su entrada `choice` registrada nombre, y hacer fallar a un par concreto es nombrarlo ahí.

1. **Sale a un par externo y vuelve como rama (E1).** Brief con `FAKE-AGY: write src/new.js hello`, `FAKE-AGY: commit add new` y `FAKE-AGY: answer {DONE}`; `--owns src/**`, `--tests "node -e \"process.exit(0)\""`, modelo `haiku` y effort `high` (una tarea pequeña también sale). Afirma: código 0; `json.status === 'done'`; `json.pair.harness === 'agy'`; `json.branch === 'aether/' + json.id + '/task-1'`; el trabajo está en esa rama (`git show <branch>:src/new.js`); el checkout del dueño está intacto (`git status --porcelain` vacío tras el comando, contando solo con lo que el test mismo dejó, y su HEAD no cambió); `json.tests.passed === true`; `json.review.status === 'done'` con un par distinto del que escribió y un `verdict` del esquema; y `aether-wt merge <id> task-1` fusiona (`json.merged === true`).
2. **El entorno y el directorio del CLI (E8).** El brief lleva `FAKE-AGY: env <una ruta absoluta del repo de juguete>`; el entorno del test trae `AETHER_TEST_SECRET_TOKEN: 'x'` y `ANTHROPIC_API_KEY: 'x'`. Afirma que el JSON que el fake escribió no trae ninguna clave que no pase `fx.allowedEnvName`, y que el `cwd` del turno en `fx.agyTurns(env)` es el worktree de la unidad, no el repo.
3. **El límite del CLI y el de la espera son los de las lanes, no los de 570 s (R7, E2).** Este test importa el módulo y llama a `delegateCommand` en el repo de juguete con un `wait` inyectado que guarda el `maxSeconds` de cada llamada y delega en el real (`calls.wait` de `lib/lane-calls.js`):

   ```js
   const seen = []
   const wait = async (cwd, runId, call, opts) => { seen.push({ call, maxSeconds: opts.maxSeconds }); return calls.wait(cwd, runId, call, opts) }
   // the same charge as test 1, as the flags object delegateCommand takes (brief is the toy brief's path)
   const result = await delegateCommand(repo.dir, { brief, model: 'haiku', effort: 'high', owns: 'src/**', tests: 'node -e "process.exit(0)"', session: 's' }, { env, wait })
   assert.equal(result.status, 'done')
   assert.equal(seen.find((entry) => entry.call.endsWith('-implement')).maxSeconds, 2700 + 180)
   assert.equal(seen.find((entry) => entry.call.includes('-review-')).maxSeconds, 1200 + 180)
   ```

   Con eso un `wait` capado en 570 s no puede pasar el test, porque la aserción mira el `maxSeconds` que el comando pasa y no solo lo que `calls.start` escribe. Además, con la tabla de `laneEnv` tal cual (2700 s de implementador), afirma sobre el `call.json` de la llamada que `timeoutSeconds === 2700`, que el turno del fake recibió `--print-timeout 2700s` y que el fuente del módulo no importa el límite del motor: `assert.ok(!fs.readFileSync(LANE_DELEGATE_JS, 'utf8').includes('delegate-limits'))`. Y con una tabla mutada (`mutate` pone `timeouts.implementer` a 3 y `timeouts.reviewer` a 3) y un brief con `FAKE-AGY: sleep 2`, el comando termina `done`: con el reloj escalado, el trabajo pasa de largo el tope de los delegados (360 de 2700) y no se corta.
4. **Cada causa de fallo pasa al siguiente par, con su parche, y nunca repite (E3, R8).** Cada test corre primero el comando en seco sobre su entorno para leer de la entrada `choice` qué par elegiría, y luego lo corre de verdad con `roleFake` haciendo fallar ese modelo. El brief escribe `src/attempt.js` con un texto propio antes de fallar o responder, para que el parche tenga qué guardar:
   - *modelo:* `failModels: [<el primer modelo>]`. Afirma `status: 'done'`, un `tried` con ese par y causa `failed`, su parche numerado con el intento 1 y con el texto que el intento escribió, y ningún turno posterior al mismo modelo.
   - *cuota:* `quotaModels: [<el primer modelo>]`; la causa de `tried[0]` es `quota` y el resto igual.
   - *tiempo:* `timeouts.implementer` mutado a 1 en toda la tabla y `FAKE-AGY: sleep 5` en el brief: cada intento muere por tiempo, así que el resultado es `no-candidate` con causa `failed`, cada `tried` lleva su parche numerado, ningún par se repite en `tried`, y no queda rama de la unidad.
   En las tres: el worktree del intento fallido no queda (la rama final, si la hay, no contiene el archivo del intento fallido).
5. **Sin candidato, con su id en el registro (E4, R9).** Dos casos: la cuota del fake en seco en todos los grupos (causa `dry`) y una referencia que ningún par alcanza (`--model opus --effort max`, causa `no-pair`). Afirma código 0, `status: 'no-candidate'`, `id` con forma de id de corrida, una entrada `delegate` en `lanes.readLog` con ese mismo `id`, `status: 'no-candidate'` y la causa, ningún turno del fake, y el checkout intacto.
6. **El cupo (E7, R13).** Unitario sobre el módulo: con un `dataDir` de juguete y `isAlive: () => true`, `acquireSlot` da dos huecos con `maxParallel 2` y el tercero es `null`; tras `releaseSlot`, vuelve a dar; con `isAlive: () => false`, un hueco ocupado se reclama. Las vivas cuentan contra la misma capacidad: con `maxParallel 2` y `liveExternal: 1`, solo un hueco prospera y el segundo es `null`; con `liveExternal: 2`, ninguno. Y `liveLaneCalls` contra carpetas de juguete fabricadas a mano bajo `.aether/runs/<otra>/lanes/<call>/` (cada una con su `call.json` y su archivo `pid` con el pid del proceso del test): cuenta la viva de ese harness, y no cuenta la que tiene `result.json` con `done: true`, la de otro harness, la de la corrida `excludeRun`, ni la de un pid muerto (el mismo montaje con `isAlive: () => false` da 0). Y el caso de dos delegados a la vez en el mismo harness, para que la llamada de uno no se cuente por su hueco y otra vez como viva: con `maxParallel: 2`, un `dataDir` y un `mainRoot` de juguete y `isAlive: () => true`, se reserva primero un hueco de ese harness con `acquireSlot(dataDir, harness, 2, { isAlive, runId: '20261021-000000-aaaa' })` y se fabrica una llamada viva de esa corrida en ese harness (su `call.json` bajo `.aether/runs/20261021-000000-aaaa/lanes/<call>/`, sin `result.json`, con un archivo `pid` vivo); entonces `liveLaneCalls(mainRoot, harness, { dataDir, excludeRun: '20261021-000000-bbbb', isAlive })` da `0` —la de la primera corrida ya cuenta por su hueco— y con esa cuenta como `liveExternal` el `acquireSlot` de la segunda corrida (`runId: '20261021-000000-bbbb'`) prospera ocupando el segundo hueco, mientras un tercero da `null`; y tras soltar el hueco de la primera con `releaseSlot`, la misma llamada vuelve a contar `1` para quien llegue detrás. De integración: muta la tabla con `maxParallel: 1` en agy, ocupa su único hueco a mano con `acquireSlot` en el proceso del test (`isAlive` por defecto: el pid del test vive) y corre el comando con agy y otro harness habilitados contra sus fakes: la tarea sale al otro harness y no a Claude ni a `no-candidate`. La misma integración dejando el hueco libre y ocupando agy solo con una llamada de lane viva fabricada de otra corrida (su `call.json` con `harness: 'agy'`, sin `result.json`, con el pid del test): la tarea sale igualmente al otro harness, porque el delegado cuenta contra las llamadas reales del harness y no solo entre delegados. Y con todos los harness habilitados ocupados igual, el resultado es `no-candidate` con causa `cupo` y su entrada en el registro.
7. **La revisión (E5, R10, R11).** (a) Con un par revisor que responde `READY`, `review.status === 'done'`, su par no es el que escribió y la entrada `choice` del revisor pide los puntos de `reviewerReference` (para el encargo `haiku`, la referencia es `claude/sonnet@high`; unitario además: `reviewerReference('opus')`, `('haiku')` y `('sonnet')` dan exactamente los tres casos). (b) El primer revisor falla (su modelo, leído de la entrada `choice` del revisor en una corrida previa en seco, va en `failModels`) y el siguiente responde: `done`, la rama del que escribió intacta y el par fallido no se repite. (c) Solo hay un par que llega y es el que escribió: `review` es `{ status: 'none', ... }` y no hay ningún turno de revisión. (d) Cada revisor falla (`reviewAnswer: null` y `failModels` con todos los modelos que la elección del revisor puede dar en ese entorno): `{ status: 'no-verdict', tried }` con cada par y su causa, y `status` general `done` con su rama. (e) Sin `--tests` y con revisor: `tests === null` y `done`. (f) Sin `--tests` y sin revisor que dé veredicto: `tests === null` y `review.status` es `none` o `no-verdict`.
8. **Apagado (E6, R20).** Con `AETHER_SUPERDELEGATION: 'off'` en el entorno: código 0, `{ status: 'off', reason: 'option' }`, ningún turno del fake, ninguna corrida nueva bajo `.aether/runs/` y ninguna entrada nueva en el registro de lanes. Y un uso malo (`delegate` sin `--brief`) sale con código 1 y `{ error }` que contiene `usage: aether-lane delegate`.

**Acceptance:**

- Los tests pasan, y las pruebas de lanes, de la elección y de los worktrees siguen verdes sin tocarlas: el comando compone, no cambia lo que compone.
- Ningún test corre un CLI real y el checkout de juguete queda intacto en todos.
- `npm test` verde completo.

### Task 4: La medida en aether-report --delegates

**Aether:**
- Tier: haiku high — una unión de dos registros con sus casos fijados por los tests, sin tocar cómo se escriben
- Review: xhigh — una lista que incluya a quien tenía su «sin candidato» o que esconda a quien no, miente en el informe del dueño
- Area: router
- Owns: `plugins/aether/lib/router-report.js`, `tests/router-report.test.js`
- Depends on: Task 2 — la medida lee los campos `aetherTask` y `taskClass` que esa tarea escribe
- Serves: R18, R19

**Interfaces:**

En `plugins/aether/lib/router-report.js`:

```js
editsWithoutNoCandidate(delegations, noCandidateIds)
// delegations: las filas que delegatesReport ya construye, cada una con su `ranOn` final, su `applied` y sus
//   `attempts` de hoy y, desde esta tarea, también `taskClass` y `aetherTask` tomados de su entrada del diario
//   (crudos: una entrada vieja sin los campos da `taskClass: null` y `aetherTask: null`)
// noCandidateIds: un Set de ids con un «sin candidato» en el registro de lanes
// -> [{ id, time, session, description, aetherTask, ranOn }]
```

- Una delegación entra en la lista si y solo si `taskClass === 'edits'`, corrió en Claude y su `aetherTask` no está en `noCandidateIds` (un `aetherTask: null` nunca está). Corrió en Claude cuando `ranOn` existe y es de Claude (`ranOn.harness === 'claude'`), o cuando `ranOn` es `null` y la fila no fue externa: en `record` y `advise`, sin modelo y effort pedidos, el diario guarda `ranOn: null` por no poder nombrar el par heredado, y la llamada fue nativa en Claude (plan D7). Fue externa, y no es ese caso, cuando `applied === 'external'` o cuando `attempts` trae algún intento. La fila que la función devuelve conserva su `ranOn` tal cual, también el `null`. Las de solo lectura, las sin clase y las que corrieron fuera quedan fuera, lleven el id que lleven.
- `delegatesReport` lee además el registro de lanes que ya existe (`lanes.readLog(dataDir, { since })`), junta los `id` de sus entradas `delegate` con `status: 'no-candidate'`, y suma a su resultado:
  - `editsOnClaudeWithoutNoCandidate`: lo que `editsWithoutNoCandidate(delegations, ids)` devuelve;
  - `outsideMeasure`, este texto exacto: `Calls the router never records are outside this measure: aether:* agents leave no journal entry, calls whose brief carries ROUTER-OVERRIDE: are recorded without a class, and a session without router settings records nothing. A delegate that edits by one of those routes is not listed, and that is a limit of the measure, not a no-candidate.`
- Cada fila de `delegations` gana `taskClass` y `aetherTask`. Nada más del informe cambia: totales, costos y formas de hoy quedan.

**Tests (write first):**

En `tests/router-report.test.js`, con el patrón que el archivo ya usa para armar el diario y el uso en un `dataDir` de juguete. La prueba de R16 que produce las entradas por el camino real vive en la Task 7; aquí las entradas se escriben con los mismos escritores (`router-log.appendEntry`, `lanes.appendLog`) para fijar la unión:

```js
test('editsWithoutNoCandidate lists only the editing delegations that ran on Claude with no no-candidate for their id', () => {
  const claude = { harness: 'claude', model: 'claude-sonnet-5-5', effort: 'high' }
  const row = (over) => ({ id: 'd1', time: 1, session: 's', description: 'task', aetherTask: null, taskClass: 'edits', ranOn: claude, applied: 'kept', attempts: [], ...over })
  const listed = editsWithoutNoCandidate([
    row({ id: 'no-id' }),
    row({ id: 'excused', aetherTask: 'run-1' }),
    row({ id: 'fake-id', aetherTask: 'run-9' }),
    row({ id: 'reader', taskClass: 'read-only' }),
    row({ id: 'unclassed', taskClass: null }),
    row({ id: 'old-entry', taskClass: undefined }),
    row({ id: 'external', ranOn: { harness: 'agy', model: 'gemini-4-argon', effort: 'high' } }),
    // record/advise with no model and effort asked: ranOn is null, and the call still ran native on Claude.
    row({ id: 'no-run', ranOn: null }),
    row({ id: 'no-run-external', ranOn: null, applied: 'external' }),
    row({ id: 'no-run-attempted', ranOn: null, attempts: [{ harness: 'agy', model: 'gemini-4-argon', effort: 'high', status: 'failed', detail: '' }] }),
  ], new Set(['run-1']))
  assert.deepEqual(listed.map((entry) => entry.id), ['no-id', 'fake-id', 'no-run'])
  assert.deepEqual(Object.keys(listed[0]).sort(), ['aetherTask', 'description', 'id', 'ranOn', 'session', 'time'])
  assert.equal(listed.find((entry) => entry.id === 'no-run').ranOn, null)
})
```

Y de integración, sobre `delegatesReport({ dataDir, session: 's', prices })` con cuatro entradas `decision` en el diario (una que edita en Claude con `aetherTask: 'run-1'`, una que edita en Claude sin id, una que edita con `ranOn: null` y sin id —el caso `record`/`advise` sin par pedido— y una de solo lectura, cada una con el resto de campos que el informe ya pide) y una entrada `delegate` de `no-candidate` con `id: 'run-1'` en el registro de lanes: afirma que `editsOnClaudeWithoutNoCandidate` trae solo la segunda y la tercera, que `outsideMeasure` es el texto exacto de arriba y que las filas traen `taskClass` y `aetherTask`.

**Acceptance:**

- Los tests pasan y el resto de `tests/router-report.test.js`, más `tests/report.test.js`, sigue verde: el informe solo suma campos.
- `npm test` verde completo.

### Task 5: La regla del Lead

**Aether:**
- Tier: haiku high — tres textos dados al pie de la letra en tres sitios nombrados, con un tope de bytes que medir
- Area: lead-rules
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `tests/bootstrap-names.test.js`
- Depends on: none
- Serves: R6, R12, R14

**Interfaces:**

Tres ediciones exactas en `plugins/aether/skills/using-aether/SKILL.md`. Ninguna otra línea cambia, y el archivo queda por debajo de 29 470 bytes.

1. En «The three paths», la viñeta `**Verify before you relay:**` se reemplaza por esta, y a continuación se añade la segunda:

```
- **Verify before you relay:** read a delegate's diff and run its tests before you report what it claims. An external editing delegate (next point) is the exception: its result already carries the tests it ran in its worktree and a read-only reviewer's verdict, and you decide with those; you read its diff yourself only when its result says there was no reviewer with a verdict.
- **Editing delegates leave Claude first:** with superdelegation on, delegate-task work that edits files, of any size, goes first to another harness through `${CLAUDE_PLUGIN_ROOT}/bin/aether-lane delegate --brief <brief file> --model <model> --effort <effort> --owns <globs> [--tests <command>] --session "$CLAUDE_CODE_SESSION_ID"`, launched with Bash in the background: the model and effort are the ones "Models" gives the task (or the router's rung, in `command`). Do not wait for it inside your turn: keep working and act on the background notice. Its result names the branch, the pair that took it and why, the tests it ran in its worktree and the review. You merge it yourself with `aether-wt merge <run> task-1`, checking first which branch you are on and recording the `merge-main` grant when it is `main` or `master`, and after the merge you run the task's test command once on your branch when it has one. A native Agent call takes an editing task only when the command answered `no-candidate` (or off-platform), never for speed, size or convenience; then its brief carries the line `AETHER-TASK: <id>` with the id the command returned. If the command itself exits with `{ error }`, that is a usage or infrastructure failure, not a `no-candidate`: fix its cause when it is yours to fix and launch it again; if you cannot fix it now, run the task native, keep the work going, and say so. With superdelegation off, delegate tasks run as they do today. You yourself stay on Claude either way.
```

2. En «Models», justo después de la tabla de un delegado y la línea de los precios de Haiku, se añade este párrafo:

```
With superdelegation on, the model and effort of this table are also the reference pair of an editing delegate: `aether-lane delegate` asks for their points and the pair that reaches them on another harness runs the task (see "The three paths"). The table still names the native fallback when no pair can take it.
```

3. En «The execution method», el primer párrafo gana esta frase al final:

```
Plan tasks you build as delegate tasks follow "The three paths": with superdelegation on, the ones that edit leave Claude first through that command, on the model and effort of their Tier.
```

**Tests (write first):**

En `tests/bootstrap-names.test.js`, un test nuevo al lado de los que ya leen el bootstrap, con la lectura del archivo como allí se hace:

```js
test('the bootstrap sends editing delegates to other harnesses first, and keeps Claude as the fallback with its task line', () => {
  const text = USING_SOURCE
  for (const needed of [
    '**Editing delegates leave Claude first:**',
    'aether-lane delegate --brief <brief file> --model <model> --effort <effort> --owns <globs> [--tests <command>] --session "$CLAUDE_CODE_SESSION_ID"',
    'launched with Bash in the background',
    'Do not wait for it inside your turn',
    'You merge it yourself with `aether-wt merge <run> task-1`',
    'recording the `merge-main` grant when it is `main` or `master`',
    'after the merge you run the task\'s test command once on your branch when it has one',
    'only when the command answered `no-candidate`',
    'never for speed, size or convenience',
    'its brief carries the line `AETHER-TASK: <id>`',
    'If the command itself exits with `{ error }`, that is a usage or infrastructure failure, not a `no-candidate`',
    'fix its cause when it is yours to fix and launch it again',
    'run the task native, keep the work going, and say so',
    'you read its diff yourself only when its result says there was no reviewer with a verdict',
    'With superdelegation off, delegate tasks run as they do today',
    'You yourself stay on Claude either way',
    'are also the reference pair of an editing delegate',
    'with superdelegation on, the ones that edit leave Claude first through that command',
  ]) assert.ok(text.includes(needed), needed)
  const file = path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md')
  assert.ok(fs.statSync(file).size < 29470, `${fs.statSync(file).size} bytes`)
})
```

**Acceptance:**

- El test pasa, y `tests/bootstrap-design.test.js` y `tests/launcher.test.js` siguen verdes sin tocarlos.
- Con la superdelegación apagada ninguna frase nueva ordena nada distinto de hoy: las tres ediciones dicen «with superdelegation on».
- `npm test` verde completo.

### Task 6: Las páginas de usuario

**Aether:**
- Tier: haiku high — textos cortos y dados, con las pruebas de documentos como red
- Area: docs
- Owns: `docs/guide/lanes.md`, `docs/guide/options.md`, `docs/guide/router.md`, `docs/reference/components.md`, `tests/delegate-docs.test.js`
- Depends on: none
- Serves: R15

**Interfaces:**

Cuatro ediciones, en inglés como el resto de las páginas, sin crear ninguna página ni tocar front matter:

1. `docs/guide/lanes.md` gana una subsección bajo la de la regla, con este sentido y estas formas (el test de abajo fija las frases): el delegado que edita sale por `aether-lane delegate --brief <file> --model <model> --effort <effort> --owns <globs> [--tests <command>]`, corre en un worktree de unidad y nunca en el checkout del dueño, cuenta contra el cupo de su harness y un cupo lleno prueba el siguiente candidato, un par que falla guarda su parche y pasa al siguiente, sin candidato lo dice con un id, trae resumen, rama, pruebas y la revisión del diff de un par distinto, y la fusión es del Lead con `aether-wt merge`.
2. `docs/guide/options.md`: su frase de hoy «a task that edits files stays on Claude» se reemplaza por «a task that edits files goes first through `aether-lane delegate`, to the pair the one rule picks, and runs on Claude only when that command finds no candidate». Ninguna opción cambia: la tabla sigue siendo la de `plugin.json`.
3. `docs/guide/router.md` gana dos frases donde habla de su diario: guarda la clase de la tarea y el id de la línea `AETHER-TASK: <id>`, y `aether-report --delegates` lista los delegados que editan y corrieron en Claude sin un «sin candidato» para su id, con las dos vías fuera de la medida (los agentes `aether:*` y las llamadas con `ROUTER-OVERRIDE:`).
4. `docs/reference/components.md`: la fila de `aether-lane` nombra `delegate` entre sus verbos, con qué hace en una frase.

**Tests (write first):**

`tests/delegate-docs.test.js` (nuevo; junto a él tienen que pasar `tests/docs-facts.test.js`, `tests/lanes-docs.test.js`, `tests/router-docs.test.js` y `tests/muse-docs.test.js`, sin tocarlos):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the user pages say editing delegates leave Claude first, and none still says they stay', () => {
  const lanes = read('docs', 'guide', 'lanes.md')
  for (const needed of [
    'aether-lane delegate --brief <file> --model <model> --effort <effort> --owns <globs> [--tests <command>]',
    'unit worktree',
    'counts against',
    'aether-wt merge',
    'no-candidate',
  ]) assert.ok(lanes.includes(needed), needed)

  const options = read('docs', 'guide', 'options.md')
  assert.ok(!options.includes('a task that edits files stays on Claude'))
  assert.ok(options.includes('a task that edits files goes first through `aether-lane delegate`, to the pair the one rule picks, and runs on Claude only when that command finds no candidate'))

  const router = read('docs', 'guide', 'router.md')
  for (const needed of ['AETHER-TASK: <id>', 'aether-report --delegates', 'aether:*', 'ROUTER-OVERRIDE:']) {
    assert.ok(router.includes(needed), needed)
  }

  const components = read('docs', 'reference', 'components.md')
  assert.ok(/`aether-lane`[^\n]*delegate/.test(components))
})
```

**Acceptance:**

- El test pasa y `tests/docs-facts.test.js` entero pasa (enlaces, front matter, la lista de páginas y los `` `aether-<name>` `` que nombran un bin real).
- `npm test` verde completo.

### Task 7: Los escenarios E1 a E8 por el camino real

**Aether:**
- Tier: sonnet high — monta comando, router e informe juntos sobre los CLI simulados, con varios entornos que preparar bien
- Review: xhigh — es la prueba que sostiene C6 y C7: si monta el diario a mano en vez de producirlo, no prueba nada
- Area: scenarios
- Owns: `tests/lane-delegate-scenarios.test.js`
- Depends on: Task 3 — los escenarios corren el comando real
- Depends on: Task 4 — el escenario de la medida corre el informe real sobre lo que el comando y el router produjeron
- Serves: R16, R18

**Interfaces:**

Un solo archivo de tests. Copia de `tests/lane-delegate.test.js` el envoltorio `roleFake` y de `tests/router-route.test.js` su `setup` del router (ajustes, lecturas y cierre por `finish`), adaptados a un solo `dataDir` por test: el del entorno del comando (`fx.laneEnv`) es el mismo que los `deps` del router y el mismo que lee `aether-report --delegates` por `AETHER_DATA_DIR`. Ningún test escribe el diario ni el registro a mano: cada entrada nace de correr `aether-lane delegate`, `route.begin`/`route.finish` o el bin `aether-report`.

**Tests (write first):**

Un test por escenario, con el nombre del escenario:

1. **E1.** Como el test 1 de la Task 3, de punta a punta, y además tras la fusión corre el comando de pruebas del encargo en el repo y afirma que pasa.
2. **E2.** Con `timeouts` escalados (implementador 3) y `FAKE-AGY: sleep 2`, el comando corre entero en su proceso y termina `done`; el test afirma además que ningún proceso hijo del intento sigue vivo al volver (`fx.agyTurns` completo y el `call.json` con `timeoutSeconds: 3`, no un tope menor).
3. **E3.** El primer par se queda sin cuota a mitad (el caso cuota de la Task 3): parche del intento en la carpeta de la corrida, worktree del intento ido, el siguiente par termina y no es el que falló. Y la variante sin más candidatos: `no-candidate` con su id.
4. **E4.** Referencia inalcanzable (`opus max`): `no-candidate` con causa `no-pair` y su id en el registro; ningún turno externo; nada pregunta al dueño (el bin termina solo, sin entrada interactiva).
5. **E5.** Brief de documentación sin `--tests`: con revisor, `done` con `tests: null` y veredicto; sin par revisor, `review.status: 'none'` y `tests: null`; y con `--tests` y ningún revisor con veredicto, el resultado trae las pruebas corridas y `no-verdict`.
6. **E6.** `AETHER_SUPERDELEGATION: 'off'`: el comando devuelve `off`, cero turnos, cero entradas nuevas en el registro de lanes y ninguna corrida creada; el router, llamado en el mismo entorno con una tarea que edita, sigue decidiendo Claude como hoy.
7. **E7.** El cupo de agy ocupado (Task 3, test 6) con otro harness con lugar: sale al otro; con todos ocupados: `no-candidate` con causa `cupo`.
8. **E8.** El entorno volcado por el fake no trae secretos y todos los turnos corrieron con `cwd` dentro de `.aether/worktrees/` o de `.aether/lanes/`, nunca el repo.
9. **La medida por el camino real (R16, R18, R19, C6).** En un solo `dataDir`: (a) corre el comando con la cuota seca y guarda el `id` de su `no-candidate`; (b) pasa por `route.begin`/`finish`, en la sesión `s1`, una llamada nativa que edita cuyo brief lleva ese id en una línea `AETHER-TASK: <id>` tras más de 400 caracteres de relleno; (c) otra nativa que edita sin esa línea y sin modelo ni effort pedidos, en el modo `record` del arnés, de modo que la entrada real de su diario guarda `ranOn: null` y es esa la que la medida tiene que contar como Claude; (d) una de solo lectura; (e) una llamada con `subagent_type: 'aether:implementer'` (el router la salta: no deja entrada); (f) una nativa que edita cuyo brief lleva `ROUTER-OVERRIDE: <motivo>` y la línea `AETHER-TASK:`. Corre el bin `aether-report --delegates --session s1` con ese `AETHER_DATA_DIR` y afirma: `editsOnClaudeWithoutNoCandidate` trae exactamente la de (c) —ni la de (b), ni la lectora, ni la `aether:*`, ni la del override— y `outsideMeasure` es el texto exacto de la Task 4.

**Acceptance:**

- Los nueve tests pasan, sin un solo CLI real ni gasto de cuota.
- `npm test` verde completo.



