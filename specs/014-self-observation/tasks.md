# Tareas: el plugin se observa a sí mismo

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, sin dependencias nuevas. Los bins son delgados y la lógica vive en `plugins/aether/lib/`; el mod (`hooks/*.mjs`) es ESM y no importa `lib/`. Las rutas de abajo son relativas a `plugins/aether/` salvo las que empiezan por `tests/`, `docs/`, `specs/`, `README.md` o `CLAUDE.md`.
- **Pruebas.** Cada prueba corre en directorios desechables (`tempDir`, `makeRepo` de `tests/helpers.js`) y fija `AETHER_DATA_DIR` a uno; ninguna toca el directorio de datos real del dueño, ni usa la red, ni un modelo, ni `gh`. Cada tarea deja `npm test` en verde completo (el comando de cada fusión es el entero); si un cambio suyo rompe una prueba existente, la tarea la actualiza.
- **Contenido de conversación (R10).** La observación de la instalación estándar no lee ni guarda el texto que el usuario escribe, el que el modelo contesta ni el contenido de archivos. De los archivos que ya existen lee solo campos (identificadores, clases, fechas, conteos) y compara comandos por huella. Nunca copia un `command`, una `quote`, un `prompt`, un `text`, un `answer` ni un mensaje de error. Solo `lib/observe-dev.js` puede nombrar `transcript`.
- **Sin salida de la máquina (R12).** Ningún archivo nuevo de observación usa `node:http`, `node:https`, `node:net` ni nada de red, ni arranca procesos por su cuenta (`node:child_process`, `spawn`, `exec`), y ninguno ejecuta `gh`. La única excepción es indirecta y local: el manejador de `SessionEnd` y el verbo `read` llaman `repoPaths` de `lib/git.js`, que ya corre `git rev-parse` en el repositorio local, para hallar el checkout principal; no lo reimplementan.
- **Valores de configuración (R6).** No se cambia ningún valor de `config/ladder.json`, `config/pairs.json`, `config/prices.json`, `config/lanes.json`, ni los modelos de `agents/*.md`. `config/observe.json` es nuevo.
- **Un `catch` nuevo, ninguno.** En `hooks/register.js`, `hooks/delegate.mjs` y `hooks/quota-brake.mjs` no se añade ningún `catch` ni se escribe la palabra «catch» en un comentario (una prueba cuenta las líneas).
- **Los bins imprimen una línea JSON** y salen con 1 y `{ "error": "…" }` ante un mal uso; `aether-observe hook` no imprime nada nunca. Los comentarios y la documentación van en el idioma del código y del documento que se edita.
- **Nada bajo `specs/` ni `.specify/`** (aether-guard lo rechaza a todo escritor que no sea el Lead o el Writer).

### Contrato compartido de los archivos (todas las tareas lo cumplen)

Todo cuelga de `<data dir>/observe/`:

| Ruta | Contenido |
|---|---|
| `events.jsonl` | una línea por evento: `{ time, session, kind, tool?, class?, reason?, trigger?, interrupted? }` |
| `faults/<sesión>.json` | `{ session, count, faults: [{ time, source, class }] }`, hasta 100 entradas |
| `summary.json` | `{ version: 1, sessions: { <id>: entrada } }` (la entrada, en la Tarea 5) |
| `dev/<sesión>/<hora>-<evento>.json` | un fragmento de conversación (solo en `dev`) |
| `issues/<id>.md` | el issue redactado de un hallazgo `failure`, con `id` cambiando todo carácter fuera de `[A-Za-z0-9._-]` por `-` |
| `baseline.json`, `read.json` | el resultado de la línea base y el de la última lectura (la que el manejador de `SessionEnd` corre solo, o la del dueño) |

Un **hallazgo** es `{ id, kind: 'failure'|'calibration'|'friction', type, title, evidence: string[], numbers: object, firstTime, lastTime, sessions: string[], proposal?: string, issue?: { title, body } }`.

Los **umbrales** de `config/observe.json` (Tarea 1): `pairFailures.consecutive` 3; `approval.minAttempts` 5, `approval.lowRate` 0.2; `pairSpeed.minCalls` 5, `pairSpeed.ratio` 0.5; `pairFailureRate.minCalls` 5, `pairFailureRate.maxRate` 0.4; `designRounds.maxRounds` 6; `cost.minCalls` 3, `cost.ratio` 2; `blockedByMistake.repeatBlocks` 2.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [US11] El almacén de `observe/`: eventos de lista cerrada, fallos, estado, borrado y umbrales, en `lib/observe.js` y `config/observe.json` → Task 1
- [ ] T002 [P] [US2] Los cuatro detectores (subida sin razón, pair que falla, regla rota, bloqueo por error) en `lib/observe-detect.js` → Task 2
- [ ] T003 [P] [US6] La calibración que solo propone, en `lib/observe-calibrate.js` → Task 3
- [ ] T004 [P] [US1] El rastro de los 17 fallos reales del mod, en `hooks/fault-trace.mjs`, `hooks/register.js` y `hooks/delegate.mjs` → Task 4
- [ ] T005 [US7] El resumen durable y su lugar antes de la poda, en `lib/observe-digest.js` y `bin/aether-session-start` → Task 5
- [ ] T006 [P] [US9] El borrado de claves y el fragmento de la instalación de desarrollo, en `lib/observe-redact.js` y `lib/observe-dev.js` → Task 6
- [ ] T007 [P] [US13] La línea base sobre registros ajenos, en `lib/observe-baseline.js` → Task 7
- [ ] T008 [US7] La lectura ordenada con el issue redactado, en `lib/observe-read.js` → Task 8
- [ ] T009 [P] [US10] El manejador de los cinco hooks y la lectura automática de `SessionEnd`, en `lib/observe-hook.js` → Task 9
- [ ] T010 [US11] El bin `aether-observe`, los hooks y los conteos que su cambio rompe, en `bin/aether-observe` y `hooks/hooks.json` → Task 10
- [ ] T011 [P] [US7] La documentación de la observación, en `docs/guide/observe.md` → Task 11
- [ ] T012 [P] [US8] Las pruebas de las garantías de punta a punta, en `tests/observe-guarantees.test.js` → Task 12

### Task 1: El almacén de observe/

**Aether:**
- Tier: sonnet high — pocas piezas, pero `forget` borra datos y la lista cerrada de campos es la garantía de C7
- Review: xhigh — sistema de archivos, borrado y filtrado de contenido
- Area: store
- Owns: `plugins/aether/lib/observe.js`, `plugins/aether/config/observe.json`, `tests/observe.test.js`
- Depends on: none
- Serves: R4, R9, R10, R14

**Interfaces:**

`lib/observe.js` (CommonJS) exporta:

- `observeDir(dataDir): string` es `<dataDir>/observe`; también `eventsFile(dataDir)`, `faultsDir(dataDir)`, `summaryFile(dataDir)`, `devDir(dataDir)`, `issuesDir(dataDir)`.
- `observeMode(env = process.env, root = PLUGIN_ROOT): 'standard' | 'dev'`. `PLUGIN_ROOT` es la carpeta del plugin que corre (`path.resolve(__dirname, '..')`). Es `'dev'` solo si `env.AETHER_OBSERVE === 'dev'` (valor exacto) **y** `root` es un árbol del repositorio: existe `<root>/../../.claude-plugin/marketplace.json` y `path.basename(path.dirname(root)) === 'plugins'`. Así la instalación del mercado, que vive en la caché de Claude Code, es estándar aunque la variable esté puesta, y la del árbol (D1 del plan) es la única que puede ser `dev`.
- `cleanEvent(raw): object | null`. Lista cerrada de claves: `time` (número finito), `session` (`/^[A-Za-z0-9-]+$/`), `kind`, `tool`, `class`, `reason`, `trigger` (textos) e `interrupted` (solo booleano). `time` y `session` y `kind` son obligatorios, si no devuelve `null`. Un texto solo vale si encaja en `/^[A-Za-z0-9_.:-]{1,64}$/`; si no, vale `'unclassified'`. Toda otra clave se descarta. Un valor que no es objeto da `null`.
- `appendEvent(dataDir, raw): boolean`. Limpia con `cleanEvent`, crea la carpeta y añade una línea JSON a `events.jsonl`. `false` si `cleanEvent` da `null` o si no se puede escribir; nunca lanza.
- `readEvents(dataDir, { since = 0 } = {}): object[]`. Las líneas con `time >= since`, ordenadas por `time`; una línea ilegible se salta; `[]` sin archivo.
- `readFaults(dataDir): { session, time, source, class }[]`. Aplana `faults/*.json` ordenado por sesión y hora; un archivo ilegible se salta.
- `loadObserveConfig(file = CONFIG_FILE): object`. Lee `config/observe.json`.
- `status(dataDir): { classes, bytes }`. `classes` tiene exactamente las claves `events`, `faults`, `summary`, `dev`, `issues`, `baseline`, `read`, cada una `{ files, bytes }` (suma recursiva de los archivos de esa clase bajo `observe/`; `baseline` es `baseline.json`, `read` es `read.json`); `bytes` es la suma.
- `forget(dataDir, { yes }): { deleted: boolean, files: number }`. `files` es el número de archivos bajo `observe/` antes de borrar. Con `yes === true` borra `observe/` entera y nada más y da `deleted: true`; si no, no borra nada y da `deleted: false`.

`config/observe.json` tiene exactamente las siete claves de los umbrales del contrato.

**Tests (write first):**

`tests/observe.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))

test('observeMode is dev only for the exact value dev and only inside the repository tree (R4, R9)', (t) => {
  const tree = tempDir(t)
  fs.mkdirSync(path.join(tree, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(tree, '.claude-plugin', 'marketplace.json'), '{}')
  fs.mkdirSync(path.join(tree, 'plugins', 'aether'), { recursive: true })
  const treeRoot = path.join(tree, 'plugins', 'aether')
  const cache = tempDir(t)
  const cacheRoot = path.join(cache, 'plugins', 'cache', 'aether-plugin', 'aether', '0.19.2')
  fs.mkdirSync(cacheRoot, { recursive: true })
  assert.equal(observe.observeMode({}, treeRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'standard' }, treeRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'Dev ' }, treeRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'dev' }, treeRoot), 'dev')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'dev' }, cacheRoot), 'standard')
  assert.equal(observe.observeMode({ AETHER_OBSERVE: 'dev' }), 'dev', 'the tests run inside the repository tree')
})

test('cleanEvent keeps only the closed keys and identifier-shaped values (R4, R10)', () => {
  const event = observe.cleanEvent({
    time: 5, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash', interrupted: true,
    error: 'ZEBRA phrase', tool_input: { command: 'ZEBRA' }, reason: 'two words ZEBRA',
  })
  assert.deepEqual(event, { time: 5, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash', interrupted: true, reason: 'unclassified' })
  assert.equal(JSON.stringify(event).includes('ZEBRA'), false)
  assert.equal(observe.cleanEvent({ kind: 'SessionEnd' }), null)
  assert.equal(observe.cleanEvent({ time: 1, session: '../x', kind: 'SessionEnd' }), null)
  assert.equal(observe.cleanEvent('text'), null)
  assert.equal(observe.cleanEvent(null), null)
})

test('appendEvent writes one cleaned line and readEvents reads it back, oldest first (R3)', (t) => {
  const dir = tempDir(t)
  assert.equal(observe.appendEvent(dir, { time: 2, session: 's-1', kind: 'PreCompact', trigger: 'auto', prompt: 'ZEBRA' }), true)
  assert.equal(observe.appendEvent(dir, { time: 1, session: 's-1', kind: 'SessionEnd', reason: 'clear' }), true)
  assert.equal(observe.appendEvent(dir, { session: 'bad id' }), false)
  const text = fs.readFileSync(path.join(dir, 'observe', 'events.jsonl'), 'utf8')
  assert.equal(text.includes('ZEBRA'), false)
  assert.deepEqual(observe.readEvents(dir).map((e) => e.kind), ['SessionEnd', 'PreCompact'])
  assert.deepEqual(observe.readEvents(dir, { since: 2 }).map((e) => e.kind), ['PreCompact'])
  assert.deepEqual(observe.readEvents(tempDir(t)), [])
})

test('readFaults flattens the per-session fault files and skips a broken one', (t) => {
  const dir = tempDir(t)
  const faults = path.join(dir, 'observe', 'faults')
  fs.mkdirSync(faults, { recursive: true })
  fs.writeFileSync(path.join(faults, 's-1.json'), JSON.stringify({ session: 's-1', count: 2, faults: [
    { time: 3, source: 'register.flush', class: 'write-failed' },
    { time: 1, source: 'register.flush', class: 'write-failed' },
  ] }))
  fs.writeFileSync(path.join(faults, 'broken.json'), '{')
  assert.deepEqual(observe.readFaults(dir), [
    { session: 's-1', time: 1, source: 'register.flush', class: 'write-failed' },
    { session: 's-1', time: 3, source: 'register.flush', class: 'write-failed' },
  ])
})

test('status counts files and bytes by class, and forget deletes only observe/ and only with yes (R14)', (t) => {
  const dir = tempDir(t)
  observe.appendEvent(dir, { time: 1, session: 's-1', kind: 'SessionEnd', reason: 'clear' })
  fs.mkdirSync(path.join(dir, 'observe', 'dev', 's-1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'observe', 'dev', 's-1', '1-x.json'), '{"a":1}')
  fs.mkdirSync(path.join(dir, 'usage'))
  fs.writeFileSync(path.join(dir, 'usage', 'keep.json'), '{}')
  const status = observe.status(dir)
  assert.deepEqual(Object.keys(status.classes).sort(), ['baseline', 'dev', 'events', 'faults', 'issues', 'read', 'summary'])
  assert.equal(status.classes.events.files, 1)
  assert.ok(status.classes.events.bytes > 0)
  assert.deepEqual(status.classes.dev, { files: 1, bytes: 7 })
  assert.deepEqual(status.classes.faults, { files: 0, bytes: 0 })
  assert.equal(status.bytes, status.classes.events.bytes + 7)
  assert.deepEqual(observe.forget(dir, { yes: false }), { deleted: false, files: 2 })
  assert.ok(fs.existsSync(path.join(dir, 'observe')))
  assert.deepEqual(observe.forget(dir, { yes: true }), { deleted: true, files: 2 })
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false)
  assert.ok(fs.existsSync(path.join(dir, 'usage', 'keep.json')))
  assert.deepEqual(observe.forget(dir, { yes: true }), { deleted: true, files: 0 })
  assert.equal(observe.status(dir).bytes, 0)
})

test('the thresholds are data in config/observe.json (A7)', () => {
  const cfg = observe.loadObserveConfig()
  assert.deepEqual(Object.keys(cfg).sort(), ['approval', 'blockedByMistake', 'cost', 'designRounds', 'pairFailureRate', 'pairFailures', 'pairSpeed'])
  assert.deepEqual(cfg.pairFailures, { consecutive: 3 })
  assert.deepEqual(cfg.approval, { minAttempts: 5, lowRate: 0.2 })
  assert.deepEqual(cfg.pairSpeed, { minCalls: 5, ratio: 0.5 })
  assert.deepEqual(cfg.pairFailureRate, { minCalls: 5, maxRate: 0.4 })
  assert.deepEqual(cfg.designRounds, { maxRounds: 6 })
  assert.deepEqual(cfg.cost, { minCalls: 3, ratio: 2 })
  assert.deepEqual(cfg.blockedByMistake, { repeatBlocks: 2 })
})

test('observe.js uses no network or process module (R12)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe.js'), 'utf8')
  assert.doesNotMatch(source, /node:(http|https|http2|net|tls|dgram|dns|child_process)|child_process|\bfetch\s*\(/)
})
```

**Acceptance:**

- Las pruebas de arriba pasan y `npm test` entero queda en verde.
- `cleanEvent` no deja pasar ninguna clave ni valor fuera de la lista cerrada; `forget` sin `yes: true` no borra nada.

### Task 2: Los cuatro detectores

**Aether:**
- Tier: haiku high — cuatro funciones puras que las pruebas fijan al detalle
- Review: xhigh — la evidencia no debe copiar comandos ni citas
- Area: detect
- Owns: `plugins/aether/lib/observe-detect.js`, `tests/observe-detect.test.js`
- Depends on: none
- Serves: R2

**Interfaces:**

`lib/observe-detect.js` exporta funciones puras (sin leer archivos, sin reloj) que devuelven listas de hallazgos de `kind: 'failure'`:

- `detectRiseWithoutReason(entries): Finding[]`. `entries` es el registro de delegados como `[{ line, kind, time, session, task, step, attempt, launchKind, verdict, next }]` (`line` es el número de línea en `log.jsonl`). Para cada `launch` con `launchKind === 'rise'`, mira el `verdict` más reciente de la misma tarea anterior a él en el arreglo; es legítimo solo si su `next.kind === 'rise'` y `next.cause` es `exhausted`, `repeated` o `infeasible`. Si no, hallazgo con `id: 'rise-without-reason:<tarea>:<intento>'`, `type: 'rise-without-reason'`, `lastTime` el `time` del lanzamiento, `sessions: [session]`, `evidence` con frases que nombran la tarea, el intento, el escalón y `log line <n>` del lanzamiento y del veredicto (o «after no verdict»). Los lanzamientos `refused` no cuentan.
- `detectPairFailures(entries, cfg): Finding[]`. `entries` son los `outcome` (`{ id, time, session, status, harness, model }`). Por `harness/model`, en orden de `time`, la racha más larga de estados distintos de `ok` donde las tareas (`id`) son distintas (varios intentos de una misma tarea cuentan una vez). Si alcanza `cfg.pairFailures.consecutive`, hallazgo con `id: 'pair-failing:<harness>/<model>'`, `numbers: { failures, tasks }`.
- `detectRuleBroken({ events, delegateEntries }): Finding[]`. Por cada evento `{ kind: 'PostToolUse', tool: 'ScheduleWakeup', session, time }`, mira si en esa sesión hay una tarea abierta en ese `time`: tiene un `launch` con `time` anterior y su último `verdict` anterior a `time` no es `approved` ni `exhausted`. Un hallazgo por sesión: `id: 'rule-broken:no-wakeup-for-delegate:<sesión>'`, `numbers: { count }`, `evidence` con las horas.
- `fingerprintOf(command): string`. `sha256` en hex de las palabras del comando unidas con un espacio, los primeros 12 caracteres.
- `detectBlockedByMistake({ pending, grants }, cfg): Finding[]`. `pending` es `[{ time, session, class, fingerprint }]` y `grants` es `[{ class, added }]` (`added` en ISO). Una entrada se señala si hay una concesión de su clase con `added` posterior a su `time`, o si la misma `fingerprint` aparece `cfg.blockedByMistake.repeatBlocks` veces o más. `id: 'blocked-by-mistake:<clase>:<huella>'`; la evidencia nombra la clase, la huella y las fechas ISO, nunca el comando ni la cita.

**Tests (write first):**

`tests/observe-detect.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const d = require(path.join(PLUGIN, 'lib', 'observe-detect.js'))
const CFG = { pairFailures: { consecutive: 3 }, blockedByMistake: { repeatBlocks: 2 } }

const launch = (line, task, step, launchKind, time, attempt, session = 's-1') => ({ line, kind: 'launch', time, session, task, step, attempt, launchKind })
const verdict = (line, task, step, label, next, time, session = 's-1') => ({ line, kind: 'verdict', time, session, task, step, verdict: label, next })

test('a rise after a verdict with a rise cause is fine; after a fix or after nothing it is flagged (E2)', () => {
  const entries = [
    launch(1, 't1', 'haiku', 'first', 10, 1), verdict(2, 't1', 'haiku', 'fix', { kind: 'rise', cause: 'repeated', step: 'sonnet' }, 20), launch(3, 't1', 'sonnet', 'rise', 30, 2),
    launch(4, 't2', 'haiku', 'first', 40, 1), verdict(5, 't2', 'haiku', 'fix', { kind: 'fix', cause: 'fix', step: 'haiku' }, 50), launch(6, 't2', 'sonnet', 'rise', 60, 2),
    launch(7, 't3', 'haiku', 'first', 70, 1), launch(8, 't3', 'sonnet', 'rise', 80, 2),
    { line: 9, kind: 'launch', time: 90, session: 's-1', task: 't4', step: null, attempt: 1, launchKind: 'refused' },
  ]
  const found = d.detectRiseWithoutReason(entries)
  assert.deepEqual(found.map((f) => f.id), ['rise-without-reason:t2:2', 'rise-without-reason:t3:2'])
  assert.equal(found[0].kind, 'failure')
  assert.equal(found[0].type, 'rise-without-reason')
  assert.deepEqual(found[0].sessions, ['s-1'])
  assert.equal(found[0].lastTime, 60)
  const text = found[0].evidence.join('\n')
  assert.ok(text.includes('t2') && text.includes('log line 5') && text.includes('log line 6'))
  assert.ok(found[1].evidence.join('\n').includes('no verdict'))
})

const outcome = (task, time, status, model = 'gemini-3.8-flash-medium', harness = 'agy') => ({ kind: 'outcome', id: task, time, session: 's-1', status, harness, model })

test('three failures in a row on different tasks flag the pair; an ok in between or one task repeated does not (E3)', () => {
  const entries = [
    outcome('a', 1, 'failed'), outcome('b', 2, 'timeout'), outcome('c', 3, 'failed'), outcome('d', 4, 'ok'), outcome('e', 5, 'failed'), outcome('f', 6, 'failed'),
    outcome('x', 1, 'ok', 'grok-4.7', 'grok'),
    outcome('y', 1, 'failed', 'muse-spark-1.3', 'muse'), outcome('y', 2, 'failed', 'muse-spark-1.3', 'muse'), outcome('y', 3, 'failed', 'muse-spark-1.3', 'muse'),
  ]
  const found = d.detectPairFailures(entries, CFG)
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'pair-failing:agy/gemini-3.8-flash-medium')
  assert.equal(found[0].numbers.failures, 3)
  assert.deepEqual(found[0].numbers.tasks, ['a', 'b', 'c'])
  assert.deepEqual(found[0].sessions, ['s-1'])
})

test('a ScheduleWakeup while a delegate task of its session is open breaks the rule (E4)', () => {
  const delegateEntries = [launch(1, 't1', 'haiku', 'first', 100, 1), verdict(2, 't1', 'haiku', 'approved', { kind: 'done' }, 300), launch(3, 't2', 'haiku', 'first', 400, 1)]
  const events = [
    { time: 200, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 350, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 500, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 450, session: 's-2', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 450, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash' },
  ]
  const found = d.detectRuleBroken({ events, delegateEntries })
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'rule-broken:no-wakeup-for-delegate:s-1')
  assert.equal(found[0].kind, 'failure')
  assert.equal(found[0].numbers.count, 2)
  assert.deepEqual(found[0].sessions, ['s-1'])
})

test('a grant of the same class after a block, or the same fingerprint twice, is a possible mistaken block (E5)', () => {
  const fp = d.fingerprintOf('git   push origin main')
  assert.equal(fp, d.fingerprintOf('git push origin main'))
  assert.match(fp, /^[0-9a-f]{12}$/)
  const pending = [
    { time: 1000, session: 's-1', class: 'push', fingerprint: fp },
    { time: 2000, session: 's-1', class: 'delete', fingerprint: d.fingerprintOf('rm -rf build') },
    { time: 3000, session: 's-2', class: 'deploy', fingerprint: 'aaaaaaaaaaaa' },
    { time: 4000, session: 's-2', class: 'deploy', fingerprint: 'aaaaaaaaaaaa' },
  ]
  const grants = [
    { class: 'push', added: new Date(1500).toISOString(), quote: 'SECRET QUOTE' },
    { class: 'delete', added: new Date(1500).toISOString() },
  ]
  const found = d.detectBlockedByMistake({ pending, grants }, CFG)
  assert.deepEqual(found.map((f) => f.id).sort(), [`blocked-by-mistake:deploy:aaaaaaaaaaaa`, `blocked-by-mistake:push:${fp}`])
  const text = JSON.stringify(found)
  assert.ok(text.includes(fp) && text.includes(new Date(1500).toISOString()))
  assert.equal(text.includes('SECRET QUOTE'), false)
  assert.equal(text.includes('rm -rf'), false)
})

test('every detector returns [] for empty input', () => {
  assert.deepEqual(d.detectRiseWithoutReason([]), [])
  assert.deepEqual(d.detectPairFailures([], CFG), [])
  assert.deepEqual(d.detectRuleBroken({ events: [], delegateEntries: [] }), [])
  assert.deepEqual(d.detectBlockedByMistake({ pending: [], grants: [] }, CFG), [])
})
```

**Acceptance:**

- Las pruebas pasan; ningún detector lee un archivo, usa el reloj ni llama a un modelo.
- Ningún hallazgo contiene el texto de un comando ni de una cita.

### Task 3: La calibración que solo propone

**Aether:**
- Tier: haiku high — funciones puras con cifras que las pruebas fijan
- Review: high — aritmética de umbrales y que no se escriba nada
- Area: detect
- Owns: `plugins/aether/lib/observe-calibrate.js`, `tests/observe-calibrate.test.js`
- Depends on: none
- Serves: R5, R6

**Interfaces:**

`lib/observe-calibrate.js` exporta funciones puras:

- `approvalByStep(delegateEntries): { [step]: { launches, approved, fixes, rises } }`. Solo los escalones que aparecen. `launches` cuenta los `launch` con `launchKind` distinto de `refused` en ese `step`; `approved` cuenta los `verdict` con `verdict === 'approved'` en ese `step`; `fixes` y `rises` cuentan los lanzamientos con `launchKind` `fix` y `rise`.
- `calibrationSignals({ delegateEntries = [], lanes = {}, seats = {}, pairs = [] }, cfg): Finding[]` con `kind: 'calibration'`, cada uno con `numbers` y una `proposal` en texto que dice qué ajuste se propone y que no se aplica. `lanes` es el mapa `{ '<harness>/<group>@<effort>': { calls, ok, outputTokens, durationMs, usd, pricedCalls } }`; `seats` es `{ '<diseño>/<rol>': rondas }`; `pairs` es `config/pairs.json` `pairs`. Cinco señales:
  - `approval-low` (`id: 'approval-low:<step>'`): `launches >= cfg.approval.minAttempts` y `approved / launches < cfg.approval.lowRate`; `numbers: { step, launches, approved, rate }`.
  - `pair-slow` (`id: 'pair-slow:<clave>'`): `calls >= cfg.pairSpeed.minCalls`, la ficha (el par de `pairs` con `harness`, `group` y `effort` que dicen la clave) con `outputTokensPerSecond` no nulo, y `outputTokens / (durationMs / 1000) < ficha * cfg.pairSpeed.ratio`; `numbers: { observed, ficha, calls }`.
  - `pair-failing-rate` (`id: 'pair-failing-rate:<clave>'`): `calls >= cfg.pairFailureRate.minCalls` y `(calls - ok) / calls > cfg.pairFailureRate.maxRate`; `numbers: { calls, ok, rate }`.
  - `design-rounds` (`id: 'design-rounds:<diseño>/<rol>'`): rondas `> cfg.designRounds.maxRounds`; `numbers: { rounds, design, seat }`.
  - `cost-mismatch` (`id: 'cost-mismatch:<clave>'`): `pricedCalls >= cfg.cost.minCalls`, la ficha con `costPerTaskUsd` no nulo, y `actual = usd / pricedCalls` fuera de `[ficha / cfg.cost.ratio, ficha * cfg.cost.ratio]`; `numbers: { actual, ficha, calls }`.
  Las que no se pueden calcular (ficha nula, pocas llamadas) no producen nada. Con entrada vacía devuelve `[]`.

**Tests (write first):**

`tests/observe-calibrate.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const c = require(path.join(PLUGIN, 'lib', 'observe-calibrate.js'))
const CFG = {
  approval: { minAttempts: 5, lowRate: 0.2 }, pairSpeed: { minCalls: 5, ratio: 0.5 }, pairFailureRate: { minCalls: 5, maxRate: 0.4 },
  designRounds: { maxRounds: 6 }, cost: { minCalls: 3, ratio: 2 },
}
const L = (task, step, launchKind = 'first', attempt = 1) => ({ kind: 'launch', task, step, attempt, launchKind, time: attempt, session: 's-1' })
const V = (task, step, verdict) => ({ kind: 'verdict', task, step, verdict, time: 1, session: 's-1' })

test('approvalByStep counts launches, approvals, fixes and rises per step', () => {
  const entries = [
    L('a', 'haiku'), V('a', 'haiku', 'approved'),
    L('b', 'haiku'), V('b', 'haiku', 'fix'), L('b', 'haiku', 'fix', 2), V('b', 'haiku', 'fix'), L('b', 'sonnet', 'rise', 3), V('b', 'sonnet', 'approved'),
    { kind: 'launch', task: 'c', step: null, launchKind: 'refused' },
  ]
  assert.deepEqual(c.approvalByStep(entries), {
    haiku: { launches: 3, approved: 1, fixes: 1, rises: 0 },
    sonnet: { launches: 1, approved: 1, fixes: 0, rises: 1 },
  })
})

test('a step that almost never approves is flagged with its numbers and a proposal (E6)', () => {
  const six = Array.from({ length: 6 }, (_, i) => L(`t${i}`, 'haiku', 'first', 1))
  const found = c.calibrationSignals({ delegateEntries: six }, CFG)
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'approval-low:haiku')
  assert.equal(found[0].kind, 'calibration')
  assert.deepEqual(found[0].numbers, { step: 'haiku', launches: 6, approved: 0, rate: 0 })
  assert.match(found[0].proposal, /haiku/)
  assert.deepEqual(c.calibrationSignals({ delegateEntries: six.slice(0, 4) }, CFG), [])
})

const PAIR = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', group: 'flash', effort: 'medium', outputTokensPerSecond: 100, costPerTaskUsd: 0.1, intelligence: 33 }
const KEY = 'agy/flash@medium'

test('a pair far below its sheet speed, or failing too often, is flagged', () => {
  const lanes = { [KEY]: { calls: 5, ok: 2, outputTokens: 5000, durationMs: 500000, usd: 0, pricedCalls: 0 } }
  const found = c.calibrationSignals({ lanes, pairs: [PAIR] }, CFG)
  assert.deepEqual(found.map((f) => f.id).sort(), [`pair-failing-rate:${KEY}`, `pair-slow:${KEY}`])
  const slow = found.find((f) => f.type === 'pair-slow')
  assert.deepEqual(slow.numbers, { observed: 10, ficha: 100, calls: 5 })
  assert.deepEqual(found.find((f) => f.type === 'pair-failing-rate').numbers, { calls: 5, ok: 2, rate: 0.6 })
  const fine = { [KEY]: { calls: 5, ok: 5, outputTokens: 5000, durationMs: 50000, usd: 0, pricedCalls: 0 } }
  assert.deepEqual(c.calibrationSignals({ lanes: fine, pairs: [PAIR] }, CFG), [])
  assert.deepEqual(c.calibrationSignals({ lanes, pairs: [{ ...PAIR, outputTokensPerSecond: null }] }, CFG).map((f) => f.type), ['pair-failing-rate'])
})

test('a design role with more rounds than the limit in one design is flagged (E6)', () => {
  assert.deepEqual(c.calibrationSignals({ seats: { 'd1/judge': 6 } }, CFG), [])
  const found = c.calibrationSignals({ seats: { 'd1/judge': 7 } }, CFG)
  assert.equal(found[0].id, 'design-rounds:d1/judge')
  assert.deepEqual(found[0].numbers, { rounds: 7, design: 'd1', seat: 'judge' })
})

test('an estimated cost far from the real one is flagged; a null sheet cost is not', () => {
  const lanes = { [KEY]: { calls: 3, ok: 3, outputTokens: 300, durationMs: 3000, usd: 3.3, pricedCalls: 3 } }
  const found = c.calibrationSignals({ lanes, pairs: [PAIR] }, CFG)
  assert.equal(found.length, 1)
  assert.equal(found[0].id, `cost-mismatch:${KEY}`)
  assert.ok(Math.abs(found[0].numbers.actual - 1.1) < 1e-9)
  assert.equal(found[0].numbers.ficha, 0.1)
  assert.equal(found[0].numbers.calls, 3)
  assert.deepEqual(c.calibrationSignals({ lanes, pairs: [{ ...PAIR, costPerTaskUsd: null }] }, CFG), [])
})

test('producing the signals changes no configuration value (R6)', () => {
  const root = path.join(PLUGIN)
  const files = [...fs.readdirSync(path.join(root, 'config')).filter((n) => n.endsWith('.json')).map((n) => path.join(root, 'config', n)),
    ...fs.readdirSync(path.join(root, 'agents')).map((n) => path.join(root, 'agents', n))]
  const hash = () => files.map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join()
  const before = hash()
  c.calibrationSignals({ delegateEntries: [L('a', 'haiku')], lanes: { [KEY]: { calls: 5, ok: 0, outputTokens: 1, durationMs: 1000000, usd: 9, pricedCalls: 5 } }, seats: { 'd/j': 9 }, pairs: [PAIR] }, CFG)
  assert.equal(hash(), before)
  assert.deepEqual(c.calibrationSignals({}, CFG), [])
})
```

**Acceptance:**

- Las pruebas pasan. Ninguna función escribe un archivo ni cambia su entrada.
- Cada señal trae sus números y una propuesta que dice que no se aplica.

### Task 4: El rastro de los fallos reales del mod

**Aether:**
- Tier: sonnet high — toca tres archivos del mod en 17 sitios, y la regla es no cambiar ni retrasar la petición
- Review: xhigh — concurrencia con las escrituras del medidor y que no se guarde texto de error
- Area: mod
- Owns: `plugins/aether/hooks/fault-trace.mjs`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/delegate.mjs`, `plugins/aether/hooks/fault.test.ts`, `tests/fault-trace.test.js`, `tests/fault-sites.test.js`
- Depends on: none
- Serves: R1

**Interfaces:**

`hooks/fault-trace.mjs` (ESM, sin importar `lib/`):

- `FAULT_SOURCES`: las 17 fuentes, exactamente `register.marker-check`, `register.flush`, `register.lane-payload`, `register.delegate-context`, `register.meter-step`, `register.brake-settings-start`, `register.brake-settings-recheck`, `register.brake-step`, `register.on-session-start`, `register.on-agent-offer`, `register.on-tool-call`, `register.on-agent-spawn`, `register.ops-run`, `delegate.step`, `delegate.answer`, `delegate.begin`, `delegate.bind`.
- `FAULT_CLASSES`: `write-failed`, `read-failed`, `settings-unreadable`, `handler-threw`, `spawn-failed`.
- `recordFault($, state, source, cls): Promise<void>`. Nunca rechaza ni lanza. `state` es el estado de la sesión del mod (`{ id, dataDir }`, donde `dataDir` es un texto, una promesa de texto o `null`). Una fuente fuera de `FAULT_SOURCES` se guarda como `'unknown'` y una clase fuera de `FAULT_CLASSES` como `'unclassified'`. Mantiene en `state.faultLog` (`{ count, faults }`) y escribe con `$.fs.write` la ruta `${dataDir}/observe/faults/${state.id}.json` con `{ session, count, faults: [{ time, source, class }] }`, `time` de `await $.clock.now()`. Guarda a lo sumo las 100 primeras entradas y `count` sigue contando. Sin `dataDir`, o si la escritura falla, no escribe nada más y no lanza. Nunca guarda el mensaje del error.

En `hooks/register.js` cada uno de los 13 sitios reales de la auditoría del plan (D3) llama `void recordFault($, state, '<fuente>', '<clase>')` en su `catch`, sin esperarla, y conserva su valor de respaldo y su comportamiento de hoy; los cuatro `.catch(($, e, next) => next(e))` pasan a un manejador que registra `handler-threw` con la fuente del evento y sigue con `next(e)`. En `hooks/delegate.mjs` los cuatro sitios reales llaman `ctx.fault?.('<fuente>', '<clase>')`; `delegateContext` de `register.js` añade `fault: (source, cls) => { void recordFault($, state, source, cls) }` al contexto. Los 14 `catch` esperados y el de `quota-brake.mjs` no cambian. La tabla de la auditoría está en el plan, sección D3.

**Tests (write first):**

`tests/fault-trace.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')

const load = () => import(pathToFileURL(path.join(PLUGIN, 'hooks', 'fault-trace.mjs')).href)

function fake({ failWrite = false } = {}) {
  const writes = []
  const $ = {
    fs: { write: async (file, text) => { if (failWrite) throw new Error('disk full ZEBRA'); writes.push([file, JSON.parse(text)]) } },
    clock: { now: async () => 123 },
  }
  return { $, writes }
}

test('recordFault writes the source and the class of the fault and nothing else (R1)', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  const state = { id: 's-1', dataDir: Promise.resolve('/d') }
  await recordFault($, state, 'register.flush', 'write-failed')
  assert.deepEqual(writes, [['/d/observe/faults/s-1.json', { session: 's-1', count: 1, faults: [{ time: 123, source: 'register.flush', class: 'write-failed' }] }]])
  await recordFault($, state, 'delegate.begin', 'handler-threw')
  assert.equal(writes[1][1].count, 2)
  assert.deepEqual(writes[1][1].faults.map((f) => f.source), ['register.flush', 'delegate.begin'])
})

test('a source or class outside the lists is stored as a fixed word, never as text (R1)', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  await recordFault($, { id: 's-1', dataDir: '/d' }, 'free text ZEBRA', 'oops ZEBRA')
  assert.deepEqual(writes[0][1].faults[0], { time: 123, source: 'unknown', class: 'unclassified' })
  assert.equal(JSON.stringify(writes).includes('ZEBRA'), false)
})

test('recordFault never throws: a failing disk, a missing data directory and a rejected one', async () => {
  const { recordFault } = await load()
  const bad = fake({ failWrite: true })
  await recordFault(bad.$, { id: 's-1', dataDir: '/d' }, 'register.flush', 'write-failed')
  const none = fake()
  await recordFault(none.$, { id: 's-1', dataDir: null }, 'register.flush', 'write-failed')
  await recordFault(none.$, { id: 's-1', dataDir: Promise.reject(new Error('x')) }, 'register.flush', 'write-failed')
  assert.deepEqual(none.writes, [])
})

test('it keeps the first 100 faults and goes on counting', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  const state = { id: 's-1', dataDir: '/d' }
  for (let i = 0; i < 105; i++) await recordFault($, state, 'register.flush', 'write-failed')
  const last = writes[writes.length - 1][1]
  assert.equal(last.faults.length, 100)
  assert.equal(last.count, 105)
})
```

`tests/fault-sites.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (name) => fs.readFileSync(path.join(PLUGIN, 'hooks', name), 'utf8')
const SOURCES = {
  'register.js': ['register.marker-check', 'register.flush', 'register.lane-payload', 'register.delegate-context', 'register.meter-step', 'register.brake-settings-start',
    'register.brake-settings-recheck', 'register.brake-step', 'register.on-session-start', 'register.on-agent-offer', 'register.on-tool-call', 'register.on-agent-spawn', 'register.ops-run'],
  'delegate.mjs': ['delegate.step', 'delegate.answer', 'delegate.begin', 'delegate.bind'],
}
const CATCH_LINES = { 'register.js': 25, 'delegate.mjs': 5, 'quota-brake.mjs': 1 }

test('every real catch of the audit names its source (R1)', () => {
  for (const [file, sources] of Object.entries(SOURCES)) {
    const text = read(file)
    for (const source of sources) assert.ok(text.includes(`'${source}'`), `${file} records ${source}`)
  }
})

test('the sources of fault-trace.mjs are exactly the 17 audited ones', async () => {
  const { pathToFileURL } = require('node:url')
  const { FAULT_SOURCES } = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'fault-trace.mjs')).href)
  assert.deepEqual([...FAULT_SOURCES].sort(), Object.values(SOURCES).flat().sort())
})

test('the number of catch lines is the audited one: a new catch needs a new audit (R1)', () => {
  for (const [file, count] of Object.entries(CATCH_LINES)) {
    assert.equal(read(file).split('\n').filter((line) => /\bcatch\b/.test(line)).length, count, file)
  }
})
```

`hooks/fault.test.ts` (corre con `claude plugin test plugins/aether`; imita las ayudas de `usage.test.ts`):

```ts
import { expect, mock, test } from 'claude-code/testing'

// R1: a failure the meter used to swallow leaves a record, and the request is not changed by it.

type Write = { path: string; text: string }

function stubs(on, { failAll = false } = {}) {
  const writes: Write[] = []
  mock.clock(on, { now: 2000 })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.309', base: '2.1.309', builtAt: '2026-10-20T00:00:00Z' } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.write', ($, e) => {
    if (failAll || e.path.includes('/usage/')) return { deny: 'disk full' }
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: e.path.endsWith('/sessions/s1.json') }))
  on('agent.offer', () => ({ isOffered: true }))
  on('classic.SessionStart', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model } }
  })
  return writes
}

async function oneTurn($) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  let s = await stream.next()
  while (s.done !== true) s = await stream.next()
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 5, isAborted: false, usage: null })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return s.value
}

test('a failed usage write leaves a fault record and the request still answers (R1)', async ($, on) => {
  const writes = stubs(on)
  const result = await oneTurn($)
  expect(result.answer).toBe('ok')
  const fault = writes.find((w) => w.path === '/home/u/aether-data/observe/faults/s1.json')
  expect(fault).toBeTruthy()
  expect(JSON.parse(fault.text)).toEqual({ session: 's1', count: 1, faults: [{ time: 2000, source: 'register.flush', class: 'write-failed' }] })
  expect(writes.some((w) => w.text.includes('disk full'))).toBe(false)
})

test('when the fault record cannot be written either, nothing changes for the request (R1)', async ($, on) => {
  const writes = stubs(on, { failAll: true })
  const result = await oneTurn($)
  expect(result.answer).toBe('ok')
  expect(writes).toEqual([])
})
```

**Acceptance:**

- `npm test` y `npm run test:mod` pasan.
- Los 17 sitios reales llaman a `recordFault` o a `ctx.fault`; los 14 esperados no; no se añade ningún `catch` ni se escribe esa palabra en un comentario.
- Ninguna llamada a `recordFault` se espera con `await` dentro de una petición.

### Task 5: El resumen durable y su lugar antes de la poda

**Aether:**
- Tier: sonnet high — orden de operaciones con la poda y escritura atómica
- Review: xhigh — pérdida de datos si la digestión llega tarde
- Area: store
- Owns: `plugins/aether/lib/observe-digest.js`, `plugins/aether/bin/aether-session-start`, `tests/observe-digest.test.js`
- Depends on: Task 1 — usa las rutas, los eventos, los fallos y `loadObserveConfig` de `lib/observe.js`
- Serves: R8, R3

**Interfaces:**

`lib/observe-digest.js` exporta:

- `readSummary(dataDir): { version: 1, sessions: {…} }`. `{ version: 1, sessions: {} }` sin archivo o con uno ilegible.
- `digestSession(dataDir, session, { prices = loadPrices() } = {}): object`. Recalcula la entrada de la sesión desde lo que hay en disco (eventos de `observe/events.jsonl`, `observe/faults/<sesión>.json`, `lanes/<sesión>.jsonl` por `lib/lanes.js` `readLog`) y la guarda en `observe/summary.json`; si no hay ninguna fuente, deja intacta la entrada que ya existía (nunca la borra). Escritura atómica (archivo temporal del mismo directorio y `rename`). Devuelve la entrada. La entrada es solo conteos:
  `{ first, last, events: { <kind>: n }, toolFailures: { <herramienta>: n }, faults: { <fuente>: n }, lanes: { '<harness>/<group>@<effort>': { calls, ok, outputTokens, durationMs, usd, pricedCalls } }, seats: { '<diseño o run>/<rol>': rondas } }`. `first` y `last` son el menor y el mayor `time` de las fuentes. `toolFailures` cuenta los eventos `PostToolUseFailure` por `tool`. `lanes` agrupa las entradas `kind: 'call'` con `harness`, `group` y `effort`; `ok` las de `status === 'ok'`; `outputTokens` es la suma de `usage.output`; `usd` y `pricedCalls` salen de `prices.priceEntry` (un modelo sin precio no suma ni cuenta). `seats` cuenta las entradas con `seat` de texto de `kind` `call` o `seat`, por `(design ?? run ?? 'none')/seat`. No copia ningún otro campo.
- `digestAll(dataDir, options): string[]`. Digiere cada sesión que aparece en los eventos, en los fallos o en `lanes/`; devuelve sus identificadores.
- `pruneObserve(dataDir, { days = 30, now = Date.now() } = {}): { events, faults, dev }`. Primero `digestAll`; luego quita de `events.jsonl` las líneas con `time` de más de `days` días (reescritura atómica), borra los archivos de `faults/` y las carpetas de `dev/` cuya fecha de modificación pasó el corte, y cuenta lo quitado. El resumen no se poda.

`bin/aether-session-start`, en `pruneOldFiles` (hoy llama `prune`, `pruneLog` y `pruneSessions`), llama `digestAll` y `pruneObserve` **antes** de `prune` y de `pruneLog`, dentro del mismo `try`.

**Tests (write first):**

`tests/observe-digest.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN, SESSION_BIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const digest = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))
const lanes = require(path.join(PLUGIN, 'lib', 'lanes.js'))
const DAY = 24 * 60 * 60 * 1000

const call = (time, status) => JSON.stringify({ kind: 'call', time, session: 's', harness: 'agy', group: 'flash', effort: 'medium', model: 'gemini-3.8-flash-medium', status, durationMs: 10000, usage: { input: 5, output: 1000, thinking: 0, cacheRead: 0, total: 1005 }, prompt: 'ZEBRA' })
const seat = (time) => JSON.stringify({ kind: 'seat', time, session: 's', seat: 'judge', design: 'd1', status: 'native', reason: 'ZEBRA' })

function seed(dir, id, time) {
  observe.appendEvent(dir, { time, session: id, kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dir, { time: time + 1, session: id, kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dir, { time: time + 2, session: id, kind: 'PreCompact', trigger: 'auto' })
  fs.mkdirSync(path.join(dir, 'observe', 'faults'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'observe', 'faults', `${id}.json`), JSON.stringify({ session: id, count: 1, faults: [{ time, source: 'register.flush', class: 'write-failed' }] }))
  fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lanes', `${id}.jsonl`), [call(time, 'ok'), call(time + 1, 'failed'), seat(time + 2), seat(time + 3)].join('\n') + '\n')
}

function age(dir, id, when) {
  for (const file of [path.join(dir, 'observe', 'faults', `${id}.json`), path.join(dir, 'lanes', `${id}.jsonl`)]) fs.utimesSync(file, new Date(when), new Date(when))
}

test('digestSession writes one entry of counts only (R8)', (t) => {
  const dir = tempDir(t)
  seed(dir, 's-1', 5000)
  const entry = digest.digestSession(dir, 's-1')
  const summary = digest.readSummary(dir)
  assert.deepEqual(summary.sessions['s-1'], entry)
  assert.deepEqual(entry.events, { PostToolUseFailure: 2, PreCompact: 1 })
  assert.deepEqual(entry.toolFailures, { Bash: 2 })
  assert.deepEqual(entry.faults, { 'register.flush': 1 })
  assert.deepEqual(entry.seats, { 'd1/judge': 2 })
  const lane = entry.lanes['agy/flash@medium']
  assert.deepEqual({ calls: lane.calls, ok: lane.ok, outputTokens: lane.outputTokens, durationMs: lane.durationMs, pricedCalls: lane.pricedCalls }, { calls: 2, ok: 1, outputTokens: 2000, durationMs: 20000, pricedCalls: 2 })
  assert.equal(typeof lane.usd, 'number')
  assert.equal(entry.first, 5000)
  assert.equal(entry.last, 5003)
  assert.equal(JSON.stringify(summary).includes('ZEBRA'), false)
  assert.deepEqual(digest.digestSession(dir, 's-1'), entry)
  assert.deepEqual(digest.readSummary(dir).sessions, summary.sessions)
})

test('the prune removes old events, faults and lane logs, and the summary keeps their counts (C5)', (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 23)
  const old = now - 40 * DAY
  seed(dir, 's-old', old)
  seed(dir, 's-new', now - DAY)
  age(dir, 's-old', old)
  digest.digestAll(dir)
  assert.deepEqual(digest.pruneObserve(dir, { days: 30, now }), { events: 3, faults: 1, dev: 0 })
  lanes.pruneLog(dir, { days: 30, now })
  assert.equal(fs.existsSync(path.join(dir, 'lanes', 's-old.jsonl')), false)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'faults', 's-old.json')), false)
  assert.deepEqual([...new Set(observe.readEvents(dir).map((e) => e.session))], ['s-new'])
  const summary = digest.readSummary(dir)
  assert.equal(summary.sessions['s-old'].events.PostToolUseFailure, 2)
  assert.equal(summary.sessions['s-old'].lanes['agy/flash@medium'].calls, 2)
  assert.equal(summary.sessions['s-new'].events.PreCompact, 1)
  digest.digestSession(dir, 's-old')
  assert.equal(digest.readSummary(dir).sessions['s-old'].events.PostToolUseFailure, 2)
})

test('aether-session-start digests the sessions before the prune deletes their sources (R8)', (t) => {
  const dir = tempDir(t)
  const old = Date.now() - 40 * DAY
  seed(dir, 's-old', old)
  age(dir, 's-old', old)
  const r = spawnSync('node', [SESSION_BIN], {
    input: JSON.stringify({ agent_type: 'aether:lead', session_id: 's-run', source: 'startup', cwd: dir }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, AETHER_DATA_DIR: dir },
  })
  assert.equal(r.status, 0)
  assert.equal(fs.existsSync(path.join(dir, 'lanes', 's-old.jsonl')), false)
  assert.equal(digest.readSummary(dir).sessions['s-old'].lanes['agy/flash@medium'].calls, 2)
})
```

**Acceptance:**

- Las pruebas pasan, y las de `session-start` que ya existen siguen en verde.
- La digestión nunca borra una entrada del resumen; el resumen no trae ningún texto de conversación.

### Task 6: La instalación de desarrollo: claves borradas y el fragmento

**Aether:**
- Tier: opus high — borrado de secretos: un patrón que se escapa filtra una clave a disco
- Review: xhigh — seguridad: formas de clave que las pruebas no listan
- Area: dev
- Owns: `plugins/aether/lib/observe-redact.js`, `plugins/aether/lib/observe-dev.js`, `tests/observe-dev.test.js`
- Depends on: Task 1 — usa `observeDir`/`devDir` de `lib/observe.js` para la ruta de los fragmentos
- Serves: R11

**Interfaces:**

`lib/observe-redact.js` exporta `redact(text: string): string`. Cambia por `[redacted]`: claves `sk-…` de 20 o más caracteres, `ghp_`, `gho_`, `ghu_`, `ghs_`, `github_pat_`, `xox[abprs]-`, `AKIA`/`ASIA` más 16 caracteres, JWT (`eyJ…`.`…`.`…`), `Authorization: Bearer …` (el valor), pares `nombre=valor` o `nombre: valor` cuyo nombre contenga `key`, `token`, `secret`, `password` o `passwd` sin importar mayúsculas (el valor), bloques `-----BEGIN … PRIVATE KEY-----` … `-----END … PRIVATE KEY-----`, y toda tira de 32 o más caracteres de `[A-Za-z0-9+/=_-]` que tenga al menos un dígito. El resto del texto queda igual.

`lib/observe-dev.js` (la única que nombra `transcript`) exporta:

- `fragmentFrom(transcriptText, { records = 6, maxChars = 400 } = {}): { role, kind, text }[]`. Lee el transcript JSONL (una línea JSON por registro; se saltan las ilegibles), toma los últimos `records` registros con contenido de tipo `user` o `assistant` y de cada bloque saca: `kind: 'text'` con su texto, `'tool_use'` con `<nombre> <JSON de la entrada>` o `'tool_result'` con su contenido (texto), cada uno recortado a `maxChars` caracteres y pasado por `redact`.
- `captureFragment({ dataDir, session, event, input, now }): string | null`. Lee `input.transcript_path` si es texto y se puede leer; si no, `null`. Escribe `<dataDir>/observe/dev/<session>/<now>-<event>.json` (carpeta `0o700`, archivo `0o600`) con `{ session, event, time: now, fragment }` y devuelve la ruta. A lo sumo 50 archivos por sesión; el 51.º devuelve `null`. Nunca lanza.

**Tests (write first):**

`tests/observe-dev.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const { redact } = require(path.join(PLUGIN, 'lib', 'observe-redact.js'))
const dev = require(path.join(PLUGIN, 'lib', 'observe-dev.js'))

const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)
const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
const AWS = 'AKIAIOSFODNN7EXAMPLE'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const HEX = 'ab12'.repeat(10)

test('redact removes keys, tokens and secret-named values and keeps the rest (R11)', () => {
  const text = [
    `ANTHROPIC_API_KEY=${KEY}`, `token ${GH}`, `aws ${AWS}`, `jwt ${JWT}`, 'Authorization: Bearer abc123def456ghi789',
    'password: hunter2hunter2', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----',
    `hex ${HEX}`, 'the build failed with ENOENT on line 12',
  ].join('\n')
  const out = redact(text)
  for (const secret of [KEY, GH, AWS, JWT, 'abc123def456ghi789', 'hunter2hunter2', 'MIIEvQIBADANBgkq', HEX]) assert.equal(out.includes(secret), false, secret)
  assert.ok(out.includes('the build failed with ENOENT on line 12'))
  assert.ok(out.includes('[redacted]'))
  assert.equal(redact('plain text'), 'plain text')
})

const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
const U = (text) => ({ type: 'user', message: { role: 'user', content: text } })
const A = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const TU = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } })
const TR = (text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: text }] } })

test('fragmentFrom takes the last records, cut and redacted, never the whole conversation (R11)', () => {
  const records = []
  for (let i = 0; i < 20; i++) records.push(U(`early message ${i}`))
  records.push(A('I will run the build'), TU('Bash', { command: `curl -H "Authorization: Bearer ${KEY}" x` }), TR(`ENOENT: no such file ${'x'.repeat(2000)}`), U('please look at it'))
  const fragment = dev.fragmentFrom(lines(records) + 'not json\n', { records: 6, maxChars: 400 })
  assert.deepEqual(fragment.map((r) => r.role), ['user', 'user', 'assistant', 'assistant', 'user', 'user'])
  assert.deepEqual(fragment.map((r) => r.kind), ['text', 'text', 'text', 'tool_use', 'tool_result', 'text'])
  assert.ok(fragment.every((r) => r.text.length <= 400))
  const json = JSON.stringify(fragment)
  assert.ok(json.includes('ENOENT'))
  assert.equal(json.includes(KEY), false)
  assert.equal(json.includes('early message 0'), false)
})

test('captureFragment writes a private file under observe/dev, caps them and never throws (R11)', (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 't.jsonl')
  fs.writeFileSync(file, lines([U('start'), TR(`ENOENT near ${GH}`)]))
  const written = dev.captureFragment({ dataDir: dir, session: 's-1', event: 'PostToolUseFailure', input: { transcript_path: file }, now: 1700 })
  assert.equal(written, path.join(dir, 'observe', 'dev', 's-1', '1700-PostToolUseFailure.json'))
  assert.equal(fs.statSync(written).mode & 0o777, 0o600)
  const saved = fs.readFileSync(written, 'utf8')
  assert.ok(saved.includes('ENOENT'))
  assert.equal(saved.includes(GH), false)
  assert.equal(JSON.parse(saved).event, 'PostToolUseFailure')
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'StopFailure', input: { transcript_path: path.join(dir, 'missing.jsonl') }, now: 1 }), null)
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'StopFailure', input: {}, now: 1 }), null)
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'StopFailure', input: null, now: 1 }), null)
  for (let i = 0; i < 50; i++) assert.ok(dev.captureFragment({ dataDir: dir, session: 's-2', event: 'PreCompact', input: { transcript_path: file }, now: i }))
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-2', event: 'PreCompact', input: { transcript_path: file }, now: 99 }), null)
  assert.equal(fs.readdirSync(path.join(dir, 'observe', 'dev', 's-2')).length, 50)
})
```

**Acceptance:**

- Las pruebas pasan. `lib/observe-dev.js` es el único archivo de observación que contiene la palabra `transcript`.
- Ningún archivo guardado trae una clave o un token de los patrones listados; un fragmento nunca pasa de 6 registros ni de 400 caracteres cada uno.

### Task 7: La línea base

**Aether:**
- Tier: sonnet high — lectura de varias fuentes y aritmética de precios con definiciones que la spec fija
- Review: xhigh — debe leer el directorio ajeno sin cambiarlo
- Area: detect
- Owns: `plugins/aether/lib/observe-baseline.js`, `tests/observe-baseline.test.js`
- Depends on: Task 3 — reutiliza `approvalByStep` para los números de aprobación
- Serves: R15, R6

**Interfaces:**

`lib/observe-baseline.js` exporta `baseline({ from, to = from, prices = loadPrices(), repoRoot = null }): object`. Lee en solo lectura las seis fuentes de R15: de `from`, `delegates/log.jsonl` (por `lib/delegate-log.js` `readEntries`), `lanes/*.jsonl` (por `lib/lanes.js` `readLog`), `runs.jsonl`, `usage/` y `exams/`, y, si `repoRoot` no es `null`, `<repoRoot>/.aether/pending.jsonl`; escribe `observe/baseline.json` solo en `to` (nunca dentro de `from` si `from !== to`). De cada archivo toma solo campos y conteos. Devuelve y guarda:

- `approvalsByStep`: el resultado de `approvalByStep`.
- `noCandidate: { count, calls }`: `count` es el número de entradas de `lanes/` con `status === 'no-candidate'` o `cause === 'no-candidate'`; `calls`, las de `kind === 'call'`.
- `haikuCost: { costUsd, savesUsd, unpriced, answer }`. Para cada tarea, su escalón de aprobación es el `step` de su `verdict` `approved`. `costUsd` es la suma del precio (`prices.priceEntry` con `{ model, input, output: output + thinking, cacheRead, cacheWrite: 0, agent: true }` de los `usage` de los `outcome`) de los `outcome` de las tareas aprobadas por encima de Haiku, cuyo intento pertenece a un escalón por debajo del que las aprobó (el `step` del `launch` del mismo `task` y `attempt`). `savesUsd` es, para las tareas aprobadas en `haiku`, la suma sobre sus `outcome` de `(precio de los mismos tokens con las tarifas de la familia 'sonnet' de prices.json) − (precio real)`. Un `outcome` cuyo modelo no tiene precio suma uno a `unpriced` y no suma dinero. `answer` es `'saves-more'` si `savesUsd > costUsd`, `'costs-more'` si es menor, `'equal'` si son iguales y distintos de cero, y `'no-data'` si ambos son cero.
- `runs: { finalized, abandoned, usd: { count, min, median, max } }`: las líneas de `runs.jsonl` cuyo `status` es `finalized` o `abandoned` (una línea ilegible o de otro estado no cuenta). `usd` resume `report.cost.run.usd` de las `finalized` donde es un número: `count` cuántas, y `min`, `median` (el promedio de los dos centrales si `count` es par) y `max`, todos `null` si `count` es cero.
- `usage: { sessions, parts }`: las carpetas de `usage/` y los archivos `*.json` dentro de ellas. No se abre ninguno.
- `exams: { features }`: las carpetas `exams/<repositorio>/<feature>`. No se abre ninguna.
- `pending: { entries, byClass }`: las líneas de `pending.jsonl` y cuántas hay de cada `class`. De cada línea se toma solo `class`; el `command` no se copia. Con `repoRoot` en `null` o sin archivo, `{ entries: 0, byClass: {} }`.

**Tests (write first):**

`tests/observe-baseline.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const { baseline } = require(path.join(PLUGIN, 'lib', 'observe-baseline.js'))
const { loadPrices, ratesFor } = require(path.join(PLUGIN, 'lib', 'prices.js'))

const prices = loadPrices()
const FLASH = ratesFor(prices, 'gemini-3.8-flash').rates
const SONNET = ratesFor(prices, 'sonnet').rates
const usage = { input: 1000, output: 0, thinking: 0, cacheRead: 0 }

const launch = (task, step, launchKind, attempt, time) => ({ kind: 'launch', time, session: 's-1', task, step, attempt, launchKind })
const out = (task, attempt, model, time) => ({ kind: 'outcome', id: task, time, session: 's-1', status: 'ok', harness: 'agy', model, attempt, usage })
const verdict = (task, step, label, time, next = { kind: 'done' }) => ({ kind: 'verdict', time, session: 's-1', task, step, verdict: label, next })

function build(dir) {
  const log = [
    launch('a', 'haiku', 'first', 1, 1), out('a', 1, 'gemini-3.8-flash', 2), verdict('a', 'haiku', 'approved', 3),
    launch('b', 'haiku', 'first', 1, 4), out('b', 1, 'gemini-3.8-flash', 5), verdict('b', 'haiku', 'fix', 6, { kind: 'rise', cause: 'repeated', step: 'sonnet' }),
    launch('b', 'sonnet', 'rise', 2, 7), out('b', 2, 'gemini-4-argon', 8), verdict('b', 'sonnet', 'approved', 9),
    launch('c', 'haiku', 'first', 1, 10), out('c', 1, 'mystery-model', 11), verdict('c', 'haiku', 'approved', 12),
  ]
  fs.mkdirSync(path.join(dir, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'delegates', 'log.jsonl'), log.map((e) => JSON.stringify(e)).join('\n') + '\n')
  fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lanes', 's-1.jsonl'), [
    { kind: 'delegate', time: 1, session: 's-1', status: 'no-candidate' },
    { kind: 'took', time: 2, session: 's-1', cause: 'no-candidate' },
    { kind: 'call', time: 3, session: 's-1', status: 'ok' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), [
    { runId: 'r1', status: 'finalized', report: { cost: { run: { usd: 10 } } } },
    { runId: 'r2', status: 'finalized', report: { cost: { run: { usd: 30 } } } },
    { runId: 'r3', status: 'abandoned' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  fs.mkdirSync(path.join(dir, 'usage', 's-1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'usage', 's-1', '0.json'), '{}')
  fs.writeFileSync(path.join(dir, 'usage', 's-1', '1.json'), '{}')
  fs.mkdirSync(path.join(dir, 'exams', 'repo-key', '014-x'), { recursive: true })
}

function buildPending(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, '.aether'), { recursive: true })
  fs.writeFileSync(path.join(repoRoot, '.aether', 'pending.jsonl'), [
    { time: 1, session: 's-1', class: 'push', command: 'git push origin ZEBRA', cwd: '/x', mode: 'enforce' },
    { time: 2, session: 's-1', class: 'delete', command: 'rm -rf ZEBRA', cwd: '/x', mode: 'enforce' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
}

function snapshot(dir) {
  const out = {}
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, entry)
    if (fs.statSync(file).isFile()) out[entry] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }
  return out
}

test('the baseline answers the three questions in numbers and reads another directory without changing it (R15, C13)', (t) => {
  const from = tempDir(t)
  const to = tempDir(t)
  const repoRoot = tempDir(t)
  build(from)
  buildPending(repoRoot)
  const before = snapshot(from)
  const beforeRepo = snapshot(repoRoot)
  const result = baseline({ from, to, prices, repoRoot })
  assert.deepEqual(snapshot(from), before)
  assert.deepEqual(snapshot(repoRoot), beforeRepo)
  assert.equal(JSON.stringify(result).includes('ZEBRA'), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(to, 'observe', 'baseline.json'), 'utf8')), result)
  assert.deepEqual(result.approvalsByStep.haiku, { launches: 3, approved: 2, fixes: 0, rises: 0 })
  assert.deepEqual(result.approvalsByStep.sonnet, { launches: 1, approved: 1, fixes: 0, rises: 1 })
  assert.deepEqual(result.noCandidate, { count: 2, calls: 1 })
  assert.deepEqual(result.runs, { finalized: 2, abandoned: 1, usd: { count: 2, min: 10, median: 20, max: 30 } })
  assert.deepEqual(result.usage, { sessions: 1, parts: 2 })
  assert.deepEqual(result.exams, { features: 1 })
  assert.deepEqual(result.pending, { entries: 2, byClass: { push: 1, delete: 1 } })
  const cost = (1000 * FLASH.input) / prices.per
  const saves = (1000 * SONNET.input - 1000 * FLASH.input) / prices.per
  assert.ok(Math.abs(result.haikuCost.costUsd - cost) < 1e-12, 'the attempt of b below its approving step')
  assert.ok(Math.abs(result.haikuCost.savesUsd - saves) < 1e-12, 'the task a approved on haiku')
  assert.equal(result.haikuCost.unpriced, 1)
  assert.equal(result.haikuCost.answer, cost > saves ? 'costs-more' : cost < saves ? 'saves-more' : 'equal')
})

test('with no records the baseline reports zeros and writes nothing into the directory it reads', (t) => {
  const from = tempDir(t)
  const to = tempDir(t)
  const result = baseline({ from, to, prices })
  assert.deepEqual(result.approvalsByStep, {})
  assert.deepEqual(result.noCandidate, { count: 0, calls: 0 })
  assert.deepEqual(result.runs, { finalized: 0, abandoned: 0, usd: { count: 0, min: null, median: null, max: null } })
  assert.deepEqual(result.usage, { sessions: 0, parts: 0 })
  assert.deepEqual(result.exams, { features: 0 })
  assert.deepEqual(result.pending, { entries: 0, byClass: {} })
  assert.equal(result.haikuCost.answer, 'no-data')
  assert.deepEqual(fs.readdirSync(from), [])
})

test('the baseline changes no configuration value (R6)', (t) => {
  const files = ['ladder.json', 'pairs.json', 'prices.json', 'lanes.json'].map((n) => path.join(PLUGIN, 'config', n))
  const hash = () => files.map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join()
  const before = hash()
  const from = tempDir(t)
  build(from)
  baseline({ from, to: tempDir(t), prices })
  assert.equal(hash(), before)
})
```

**Acceptance:**

- Las pruebas pasan. El directorio `from` queda idéntico byte a byte; el resultado se escribe solo en `to`.
- Los intentos sin precio se cuentan en `unpriced` y no se inventan.
- Las seis fuentes de R15 se leen y ninguna se copia: de `pending.jsonl` sale solo la clase.

### Task 8: La lectura ordenada con el issue redactado

**Aether:**
- Tier: sonnet high — junta seis fuentes y las ordena; el comportamiento que las pruebas no fijan es qué campos se leen
- Review: xhigh — no debe copiar comandos, citas ni respuestas; no debe usar la red
- Area: detect
- Owns: `plugins/aether/lib/observe-read.js`, `tests/observe-read.test.js`
- Depends on: Task 1 — eventos, fallos, umbrales y rutas
- Depends on: Task 2 — los cuatro detectores y la huella
- Depends on: Task 3 — las señales de calibración y la aprobación por escalón
- Depends on: Task 5 — digiere antes de leer y usa el resumen de las sesiones ya podadas
- Serves: R7, R12, R8

**Interfaces:**

`lib/observe-read.js` exporta `readObservations({ dataDir, repoRoot = null, now = Date.now(), pairs = loadPairs().pairs, cfg = loadObserveConfig(), prices }): { generatedAt, items }`:

1. Llama `digestAll(dataDir)` y lee el resumen.
2. Lee, solo como campos: `delegates/log.jsonl` (cada línea con su número `line`; solo `kind`, `time`, `session`, `task`, `id`, `step`, `attempt`, `launchKind`, `status`, `harness`, `model`, `verdict`, `next`), `observe/events.jsonl`, `readFaults`, y, si `repoRoot` no es `null`, `<repoRoot>/.aether/pending.jsonl` (de cada entrada: `time`, `session`, `class` y `fingerprint = fingerprintOf(command)`; el `command` no sale de esa función) y `<repoRoot>/.aether/autonomy/grants.json` (de cada concesión: `class` y `added`).
3. Corre los cuatro detectores de la Tarea 2 y `calibrationSignals` (con `lanes` y `seats` sumados desde las entradas del resumen, `pairs` y la ficha) y añade hallazgos de `kind: 'failure'`, `type: 'fault'` (uno por fuente, `id: 'fault:<fuente>'`, `numbers: { count }`, evidencia con la fuente y la clase) y de `kind: 'friction'` (`id: 'tool-failures:<herramienta>'` con `numbers: { count }` y `id: 'compactions'` con `numbers: { count }`, del resumen, cuando el conteo es mayor que cero).
4. A cada hallazgo `failure` le pone `issue: { title, body }`, con el cuerpo en Markdown: `## Evidence` con la evidencia, `## Numbers` con las cifras y `## Sessions`. Escribe `observe/issues/<id>.md` (el nombre según el contrato) con el título y el cuerpo, y `observe/read.json` con `{ generatedAt, items }`: la última lectura, la que el manejador de `SessionEnd` (Tarea 9) corre solo o la que el dueño pide con `aether-observe read`, y donde el dueño encuentra al volver lo que la lectura automática dejó.
5. Ordena: `failure`, `calibration`, `friction`; dentro de cada clase, más líneas de `evidence` primero, luego `lastTime` mayor, luego `id` ascendente.

No abre una conexión, no ejecuta `gh`, no lee nada fuera de `dataDir` y `repoRoot`, y con datos vacíos devuelve `items: []` sin lanzar.

**Tests (write first):**

`tests/observe-read.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jsonl = (list) => list.map((e) => JSON.stringify(e)).join('\n') + '\n'
const PAIRS = [{ id: 'agy/gemini-3.8-flash@medium', harness: 'agy', group: 'flash', effort: 'medium', outputTokensPerSecond: null, costPerTaskUsd: null, intelligence: 33 }]
const RANK = { failure: 0, calibration: 1, friction: 2 }

function fixture(t) {
  const dataDir = tempDir(t)
  const repoRoot = tempDir(t)
  write(path.join(dataDir, 'delegates', 'log.jsonl'), jsonl([
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'verdict', time: 20, session: 's-1', task: 't2', step: 'haiku', verdict: 'fix', next: { kind: 'fix', cause: 'fix' }, reason: 'ZEBRA reason' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
    { kind: 'launch', time: 400, session: 's-1', task: 't9', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'answer', time: 41, session: 's-1', task: 't9', attempt: 1, text: 'ZEBRA answer' },
  ]))
  observe.appendEvent(dataDir, { time: 500, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' })
  for (let i = 0; i < 3; i++) observe.appendEvent(dataDir, { time: 600 + i, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dataDir, { time: 700, session: 's-1', kind: 'PreCompact', trigger: 'auto' })
  write(path.join(dataDir, 'observe', 'faults', 's-1.json'), JSON.stringify({ session: 's-1', count: 2, faults: [
    { time: 800, source: 'register.flush', class: 'write-failed' }, { time: 801, source: 'register.flush', class: 'write-failed' }] }))
  write(path.join(repoRoot, '.aether', 'pending.jsonl'), jsonl([{ time: 1000, session: 's-1', class: 'push', command: 'git push origin ZEBRA', cwd: '/x', mode: 'enforce' }]))
  write(path.join(repoRoot, '.aether', 'autonomy', 'grants.json'), JSON.stringify({ grants: [{ class: 'push', scope: 'repo', quote: 'ZEBRA QUOTE', session: 's-1', time: 1, added: new Date(1500).toISOString() }], revoked: [] }))
  // A session whose lane log was pruned: only the durable summary remembers it.
  write(path.join(dataDir, 'observe', 'summary.json'), JSON.stringify({ version: 1, sessions: { 's-old': {
    first: 1, last: 2, events: {}, toolFailures: {}, faults: {}, seats: {},
    lanes: { 'agy/flash@medium': { calls: 8, ok: 2, outputTokens: 100, durationMs: 1000, usd: 0, pricedCalls: 0 } } } } }))
  return { dataDir, repoRoot }
}

test('the reading orders failures, calibrations and friction, each with evidence and a drafted issue (E7, C4)', (t) => {
  const { dataDir, repoRoot } = fixture(t)
  const { items } = readObservations({ dataDir, repoRoot, now: 5000, pairs: PAIRS, cfg: observe.loadObserveConfig() })
  const types = items.map((i) => i.type)
  for (const type of ['rise-without-reason', 'rule-broken', 'blocked-by-mistake', 'fault', 'pair-failing-rate', 'tool-failures', 'compactions']) assert.ok(types.includes(type), type)
  const compare = (a, b) => RANK[a.kind] - RANK[b.kind] || b.evidence.length - a.evidence.length || b.lastTime - a.lastTime || (a.id < b.id ? -1 : 1)
  assert.deepEqual(items.map((i) => i.id), [...items].sort(compare).map((i) => i.id))
  for (const item of items) assert.ok(item.evidence.length > 0, item.id)
  for (const item of items.filter((i) => i.kind === 'failure')) {
    assert.ok(item.issue.title.length > 0 && item.issue.body.includes('## Evidence'), item.id)
    const file = path.join(dataDir, 'observe', 'issues', `${item.id.replace(/[^A-Za-z0-9._-]/g, '-')}.md`)
    assert.ok(fs.readFileSync(file, 'utf8').includes(item.evidence[0]), file)
  }
  assert.equal(items.find((i) => i.type === 'fault').numbers.count, 2)
  assert.equal(items.find((i) => i.type === 'tool-failures').numbers.count, 3)
  assert.ok(Array.isArray(items.find((i) => i.type === 'pair-failing-rate').sessions))
})

test('no file the reading writes carries a command, a quote or an answer (R10, E12)', (t) => {
  const { dataDir, repoRoot } = fixture(t)
  const result = readObservations({ dataDir, repoRoot, now: 5000, pairs: PAIRS, cfg: observe.loadObserveConfig() })
  assert.equal(JSON.stringify(result).includes('ZEBRA'), false)
  for (const entry of fs.readdirSync(path.join(dataDir, 'observe'), { recursive: true })) {
    const file = path.join(dataDir, 'observe', entry)
    if (fs.statSync(file).isFile()) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, entry)
  }
  assert.ok(fs.existsSync(path.join(dataDir, 'observe', 'read.json')))
})

test('with nothing recorded the reading is an empty list and does not throw', (t) => {
  const { items } = readObservations({ dataDir: tempDir(t), repoRoot: null, now: 1, pairs: [], cfg: observe.loadObserveConfig() })
  assert.deepEqual(items, [])
})

test('the reading source has no network or process module (R12)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe-read.js'), 'utf8')
  assert.doesNotMatch(source, /node:(http|https|http2|net|tls|dgram|dns|child_process)|child_process|\bfetch\s*\(|\bgh\s+(issue|api)/)
})
```

**Acceptance:**

- Las pruebas pasan.
- La lectura usa el resumen para las sesiones cuyo registro ya se podó; el orden es el de la regla de arriba y es el mismo en cada corrida.
- El texto del issue sale en `observe/issues/` y nada más: no hay red ni `gh`.

### Task 9: El manejador de los cinco hooks

**Aether:**
- Tier: sonnet high — recibe contenido en su entrada y debe guardar solo la lista cerrada
- Review: xhigh — fuga de contenido y huella dormida
- Area: hooks
- Owns: `plugins/aether/lib/observe-hook.js`, `tests/observe-hook.test.js`
- Depends on: Task 1 — `cleanEvent`, `appendEvent`, `observeMode`
- Depends on: Task 5 — en `SessionEnd` digiere la sesión para que su entrada quede en el resumen
- Depends on: Task 6 — en la instalación de desarrollo guarda el fragmento de un fallo
- Depends on: Task 8 — en `SessionEnd` corre la lectura, y con ella los detectores, la calibración y los issues redactados
- Serves: R2, R3, R4, R7, R10, R13

**Interfaces:**

`lib/observe-hook.js` exporta:

- `EVENTS`: `{ PostToolUse: ['tool_name'], PostToolUseFailure: ['tool_name', 'is_interrupt'], StopFailure: ['error'], PreCompact: ['trigger'], SessionEnd: ['reason'] }`.
- `handleHook(input, { dataDir = run.dataDir(), env = process.env, now = Date.now() } = {}): { recorded: boolean, fragment: string | null }`. Nunca lanza. Si `input` no es un objeto, su `session_id` no es válido, su `hook_event_name` no está en `EVENTS`, la sesión no es de un Lead (`isAetherSession(dataDir, session_id)` de `lib/session.js`), o es `PostToolUse` de una herramienta distinta de `ScheduleWakeup`, devuelve `{ recorded: false, fragment: null }` **sin escribir nada ni crear ninguna carpeta**. Si no, toma de la entrada solo los campos de `EVENTS[evento]` y guarda con `appendEvent` el evento `{ time: now, session, kind: evento, tool: tool_name, interrupted: is_interrupt (solo si es booleano), class: error, trigger, reason }`. En `SessionEnd` llama además `digestSession(dataDir, session)` y después `readObservations({ dataDir, repoRoot, now })` de `lib/observe-read.js` (la lectura automática: los hallazgos, las señales de calibración, `observe/read.json` y los issues redactados quedan en disco sin que nadie corra un comando), con `repoRoot` igual al `mainRoot` de `repoPaths(input.cwd)` de `lib/git.js` si `input.cwd` es un texto y es un repositorio (un worktree o una subcarpeta dan el checkout principal, donde vive `.aether/`), y `null` si no o si `repoPaths` falla; `cwd` no se guarda. Con `observeMode(env) === 'dev'` y el evento `PostToolUseFailure`, `StopFailure` o `PostToolUse`, llama `captureFragment` de `lib/observe-dev.js`, cargado con `require` dentro de esa rama (nunca arriba del archivo). En la instalación estándar no se carga `observe-dev.js` y no se abre ningún archivo de la entrada.

**Tests (write first):**

`tests/observe-hook.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

const { handleHook } = require(path.join(PLUGIN, 'lib', 'observe-hook.js'))
const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const { readSummary } = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))

const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
function lead(dir, id = 's-1') {
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sessions', `${id}.json`), '{}')
}
function walk(dir) {
  return fs.readdirSync(dir, { recursive: true }).map((e) => path.join(dir, e)).filter((f) => fs.statSync(f).isFile())
}

test('a session that is not the Lead writes nothing, not even a folder (E10, R13)', (t) => {
  const dir = tempDir(t)
  const input = { session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'ZEBRA' }
  assert.deepEqual(handleHook(input, { dataDir: dir, now: 5 }), { recorded: false, fragment: null })
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('a failed tool of a Lead session leaves the tool and nothing of its content (R3, R4, R10)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const input = { session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', is_interrupt: false, error: 'ZEBRA error text', tool_input: { command: 'ZEBRA' }, transcript_path: '/nonexistent/ZEBRA.jsonl' }
  assert.equal(handleHook(input, { dataDir: dir, now: 7 }).recorded, true)
  assert.deepEqual(observe.readEvents(dir), [{ time: 7, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash', interrupted: false }])
  for (const file of walk(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
})

test('only ScheduleWakeup is recorded from PostToolUse', (t) => {
  const dir = tempDir(t)
  lead(dir)
  assert.equal(handleHook({ session_id: 's-1', hook_event_name: 'PostToolUse', tool_name: 'Read' }, { dataDir: dir, now: 1 }).recorded, false)
  assert.equal(handleHook({ session_id: 's-1', hook_event_name: 'PostToolUse', tool_name: 'ScheduleWakeup', tool_input: { prompt: 'ZEBRA' } }, { dataDir: dir, now: 2 }).recorded, true)
  assert.deepEqual(observe.readEvents(dir), [{ time: 2, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' }])
})

test('StopFailure, PreCompact and SessionEnd keep their one field, and SessionEnd leaves the session entry in the summary (C2)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  handleHook({ session_id: 's-1', hook_event_name: 'StopFailure', error: 'rate_limit' }, { dataDir: dir, now: 1 })
  handleHook({ session_id: 's-1', hook_event_name: 'StopFailure', error: 'free text with spaces ZEBRA' }, { dataDir: dir, now: 2 })
  handleHook({ session_id: 's-1', hook_event_name: 'PreCompact', trigger: 'auto' }, { dataDir: dir, now: 3 })
  handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear' }, { dataDir: dir, now: 4 })
  assert.deepEqual(observe.readEvents(dir).map((e) => [e.kind, e.class || e.trigger || e.reason]), [
    ['StopFailure', 'rate_limit'], ['StopFailure', 'unclassified'], ['PreCompact', 'auto'], ['SessionEnd', 'clear']])
  const entry = readSummary(dir).sessions['s-1']
  assert.equal(entry.events.SessionEnd, 1)
  assert.equal(entry.events.StopFailure, 2)
})

test('the development installation also keeps a redacted fragment; the standard one never opens the transcript (E9, R11)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, [
    { type: 'user', message: { role: 'user', content: 'please build' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: `ENOENT: no such file, token ${GH}` }] } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const input = { session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', transcript_path: transcript }
  assert.equal(handleHook(input, { dataDir: dir, now: 10, env: {} }).fragment, null)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
  const dev = handleHook(input, { dataDir: dir, now: 11, env: { AETHER_OBSERVE: 'dev' } })
  assert.equal(dev.fragment, path.join(dir, 'observe', 'dev', 's-1', '11-PostToolUseFailure.json'))
  const saved = fs.readFileSync(dev.fragment, 'utf8')
  assert.ok(saved.includes('ENOENT'))
  assert.equal(saved.includes(GH), false)
})

function seedRise(dir) {
  fs.mkdirSync(path.join(dir, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'delegates', 'log.jsonl'), [
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'verdict', time: 20, session: 's-1', task: 't2', step: 'haiku', verdict: 'fix', next: { kind: 'fix', cause: 'fix' }, reason: 'ZEBRA reason' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
}

test('SessionEnd runs the detectors by itself: findings and drafted issues exist with no command run (C1, R13)', (t) => {
  const dir = tempDir(t)
  const repo = tempDir(t)
  lead(dir)
  seedRise(dir)
  handleHook({ session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash' }, { dataDir: dir, now: 40 })
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'read.json')), false, 'nothing is read before the session ends')
  assert.equal(handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', cwd: repo }, { dataDir: dir, now: 50 }).recorded, true)
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  assert.ok(read.items.some((i) => i.type === 'rise-without-reason' && i.issue.body.length > 0))
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'issues', 'rise-without-reason-t2-2.md')))
  for (const file of walk(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
  assert.equal(fs.existsSync(path.join(repo, '.aether')), false, 'the repository is only read')
})

// A push the guard blocked at time 1000 and a grant of the same class added after it: the blocked-by-mistake finding
// of D4. The files live in the main checkout, where `.aether/` is.
function seedBlocked(repo) {
  fs.mkdirSync(path.join(repo, '.aether', 'autonomy'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.aether', 'pending.jsonl'), JSON.stringify({ time: 1000, session: 's-1', class: 'push', command: 'git push origin ZEBRA', cwd: '/x', mode: 'enforce' }) + '\n')
  fs.writeFileSync(path.join(repo, '.aether', 'autonomy', 'grants.json'), JSON.stringify({ grants: [{ class: 'push', scope: 'repo', quote: 'ZEBRA QUOTE', session: 's-1', time: 1, added: new Date(1500).toISOString() }], revoked: [] }))
}

function endSessionFrom(t, cwdOf) {
  const dir = tempDir(t)
  const { dir: repo, git } = makeRepo(t)
  lead(dir)
  seedBlocked(repo)
  handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', cwd: cwdOf(repo, git) }, { dataDir: dir, now: 5000 })
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  assert.ok(read.items.some((i) => i.type === 'blocked-by-mistake'), 'the blocked command of the main checkout is found')
  for (const file of walk(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, file)
}

test('SessionEnd reads the main checkout from a subfolder of the repository (E5, C4)', (t) => {
  endSessionFrom(t, (repo) => {
    const sub = path.join(repo, 'sub')
    fs.mkdirSync(sub)
    return sub
  })
})

test('SessionEnd reads the main checkout from a worktree of the repository (E5, C4)', (t) => {
  endSessionFrom(t, (repo, git) => {
    const worktree = path.join(tempDir(t), 'wt')
    git('worktree', 'add', '-q', worktree, '-b', 'obs-worktree')
    return worktree
  })
})

test('SessionEnd of a session that is not the Lead reads nothing and writes nothing (C10)', (t) => {
  const dir = tempDir(t)
  seedRise(dir)
  assert.deepEqual(handleHook({ session_id: 's-1', hook_event_name: 'SessionEnd', reason: 'clear', cwd: tempDir(t) }, { dataDir: dir, now: 50 }), { recorded: false, fragment: null })
  assert.deepEqual(fs.readdirSync(dir), ['delegates'])
})

test('garbage input is ignored without throwing', (t) => {
  const dir = tempDir(t)
  for (const input of [null, undefined, 'x', 3, {}, { session_id: '../x', hook_event_name: 'SessionEnd' }, { session_id: 's-1', hook_event_name: 'Unknown' }]) {
    assert.deepEqual(handleHook(input, { dataDir: dir, now: 1 }), { recorded: false, fragment: null })
  }
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('observe-dev.js is required only inside the development branch (A4)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe-hook.js'), 'utf8')
  assert.match(source, /require\([^)]*observe-dev/)
  assert.doesNotMatch(source, /^(const|let|var)\s[^\n]*require\([^)]*observe-dev/m)
  assert.doesNotMatch(source, /transcript/)
})
```

**Acceptance:**

- Las pruebas pasan.
- `lib/observe-hook.js` no contiene la palabra `transcript`: pasa la entrada entera a `captureFragment`, que es quien la lee.
- Un evento de una sesión que no es del Lead no crea ni un directorio, y su `SessionEnd` no lee nada.
- Un `SessionEnd` de una sesión del Lead deja `observe/read.json` y los issues redactados sin ninguna orden del dueño.

### Task 10: El bin, los hooks y los conteos que su cambio rompe

**Aether:**
- Tier: sonnet high — integra el bin y los hooks y actualiza las pruebas y la página que cuentan los bins
- Review: xhigh — el hook no debe imprimir nunca; `forget` borra datos
- Area: cli
- Owns: `plugins/aether/bin/aether-observe`, `plugins/aether/hooks/hooks.json`, `tests/observe-bin.test.js`, `tests/components-docs.test.js`, `tests/docs-facts.test.js`, `docs/reference/components.md`
- Depends on: Task 7 — el verbo `baseline`
- Depends on: Task 8 — el verbo `read`
- Depends on: Task 9 — el verbo `hook`
- Serves: R3, R7, R13, R14, R15, R16

**Interfaces:**

- `bin/aether-observe` (CommonJS, ejecutable, delgado: solo analiza los argumentos y llama a `lib/`). Verbos: `hook` (lee la entrada JSON de stdin; llama `handleHook`; no imprime nada y sale 0 ante cualquier entrada, incluida una ilegible), `read` (llama `readObservations` con `dataDir()` de `lib/run.js`, `repoRoot` el `mainRoot` de `lib/git.js` `repoPaths(process.cwd())` o `null` fuera de un repositorio, y imprime una línea JSON `{ generatedAt, items }`), `baseline [--from <dir>]` (llama `baseline({ from: --from o dataDir(), to: dataDir(), repoRoot })`, con el mismo `repoRoot` que `read`, e imprime su resultado), `status` (imprime `status(dataDir())`) y `forget [--yes]` (imprime `forget(dataDir(), { yes })`). Un verbo desconocido o un argumento de más sale 1 con `{ "error": "usage: aether-observe hook | read | baseline [--from <dir>] | status | forget [--yes]" }`. Cada verbo menos `hook` imprime una sola línea JSON.
- `hooks/hooks.json` añade cinco entradas, cada una con `{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/aether-observe\" hook" }`: `PostToolUse` con `matcher: "ScheduleWakeup"`, y `PostToolUseFailure`, `StopFailure`, `PreCompact` y `SessionEnd` sin matcher (se usa `matcher: ""` solo si Claude Code lo exige). La entrada de `SessionEnd` lleva además `"timeout": 30` (segundos): Claude Code 2.1.309 da a un hook de `SessionEnd` 1500 ms por omisión (medido en el binario) y el `timeout` del propio hook sube ese presupuesto; la lectura automática corre ahí. Se conservan `SessionStart`, `PreToolUse` y `modules` como están. Se actualiza `description` para nombrarlos.
- `plugin.json` no cambia: la instalación de desarrollo no es una opción (D1 del plan), así que `userConfig` no gana ninguna clave y las seis opciones de los documentos quedan como están.
- Lo que este cambio rompe y la tarea actualiza, y nada más: `tests/components-docs.test.js` (once bins pasan a doce: la frase «the twelve commands of `bin/`» y el conteo), `tests/docs-facts.test.js` (la comprobación de `eleven commands of `bin/``) y `docs/reference/components.md` (esa frase y una fila `aether-observe`). El resto de la prosa (README, guía, índice, `CLAUDE.md` y la frase de la huella dormida) es de la Tarea 11.

**Tests (write first):**

`tests/observe-bin.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')

function bin(args, dir, { input = '', cwd = dir, env = {} } = {}) {
  const r = spawnSync('node', [BIN, ...args], { input, cwd, encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, ...env } })
  let json = null
  try { json = JSON.parse(r.stdout) } catch { json = null }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json }
}
function lead(dir, id = 's-1') {
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sessions', `${id}.json`), '{}')
}
const hookInput = (over = {}) => JSON.stringify({ session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'ZEBRA', ...over })
function snapshot(dir) {
  const out = {}
  for (const e of fs.readdirSync(dir, { recursive: true })) {
    const f = path.join(dir, e)
    if (fs.statSync(f).isFile()) out[e] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  }
  return out
}

test('hook prints nothing, in a Lead session and out of it, and leaves a plain session untouched (E10, R13)', (t) => {
  const plain = tempDir(t)
  const r1 = bin(['hook'], plain, { input: hookInput() })
  assert.deepEqual([r1.status, r1.stdout, r1.stderr], [0, '', ''])
  assert.deepEqual(fs.readdirSync(plain), [])
  const dir = tempDir(t)
  lead(dir)
  const r2 = bin(['hook'], dir, { input: hookInput() })
  assert.deepEqual([r2.status, r2.stdout, r2.stderr], [0, '', ''])
  assert.equal(fs.readFileSync(path.join(dir, 'observe', 'events.jsonl'), 'utf8').trim().split('\n').length, 1)
  const r3 = bin(['hook'], dir, { input: 'not json' })
  assert.deepEqual([r3.status, r3.stdout], [0, ''])
})

test('read prints one JSON line with the ordered items and drafts the issue (R7)', (t) => {
  const dir = tempDir(t)
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(dir, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'delegates', 'log.jsonl'), [
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  const r = bin(['read'], dir, { cwd: repo.dir })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(r.json.items[0].type, 'rise-without-reason')
  assert.ok(r.json.items[0].issue.body.length > 0)
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'issues', 'rise-without-reason-t2-2.md')))
})

test('baseline reads --from without changing it and writes only to the data directory (R15)', (t) => {
  const dir = tempDir(t)
  const from = tempDir(t)
  fs.mkdirSync(path.join(from, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(from, 'delegates', 'log.jsonl'), JSON.stringify({ kind: 'launch', time: 1, session: 's-1', task: 'a', step: 'haiku', attempt: 1, launchKind: 'first' }) + '\n')
  const before = snapshot(from)
  const r = bin(['baseline', '--from', from], dir)
  assert.equal(r.status, 0)
  assert.equal(r.json.approvalsByStep.haiku.launches, 1)
  assert.deepEqual(snapshot(from), before)
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'baseline.json')))
})

test('status shows what was gathered, forget without --yes deletes nothing, with --yes deletes it (E11, R14)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  bin(['hook'], dir, { input: hookInput() })
  const status = bin(['status'], dir)
  assert.ok(status.json.classes.events.bytes > 0)
  assert.equal(bin(['forget'], dir).json.deleted, false)
  assert.ok(fs.existsSync(path.join(dir, 'observe')))
  assert.equal(bin(['forget', '--yes'], dir).json.deleted, true)
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false)
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 's-1.json')))
})

test('the verbs that read run from any shell, with no plugin variable; a bad verb is a usage error', (t) => {
  const dir = tempDir(t)
  const env = { CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '' }
  assert.equal(bin(['status'], dir, { env }).status, 0)
  assert.equal(bin(['read'], dir, { env }).status, 0)
  const bad = bin(['nope'], dir)
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /^usage: aether-observe/)
  assert.equal(bin(['status', 'extra'], dir).status, 1)
})

test('hooks.json runs the five new hooks and the manifest gains no option (R3, R9)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.userConfig.observe, undefined)
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks
  for (const event of ['PostToolUse', 'PostToolUseFailure', 'StopFailure', 'PreCompact', 'SessionEnd']) {
    const commands = (hooks[event] || []).flatMap((group) => group.hooks.map((h) => h.command))
    assert.ok(commands.includes('node "${CLAUDE_PLUGIN_ROOT}/bin/aether-observe" hook'), event)
  }
  assert.equal(hooks.PostToolUse[0].matcher, 'ScheduleWakeup')
  const sessionEnd = hooks.SessionEnd.flatMap((group) => group.hooks).find((h) => h.command.includes('aether-observe'))
  assert.ok(sessionEnd.timeout >= 10, 'the SessionEnd hook asks for more than the 1500 ms Claude Code gives by default')
  assert.ok(hooks.SessionStart && hooks.PreToolUse)
})

test('the components page counts twelve bins and describes aether-observe (R16)', () => {
  const components = fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'components.md'), 'utf8')
  assert.ok(components.includes('the twelve commands of `bin/`'))
  assert.ok(components.split('\n').some((line) => line.startsWith('| `aether-observe` |')))
  assert.equal(fs.readdirSync(path.join(PLUGIN, 'bin')).length, 12)
})
```

**Acceptance:**

- Las pruebas pasan y `npm test` entero queda en verde con el conteo nuevo (doce bins; las opciones siguen siendo seis).
- `npm run validate` (`claude plugin validate … --strict`) pasa sobre la plugin y sobre el mercado.
- `aether-observe hook` no escribe nada en stdout ni en stderr en ningún caso.

### Task 11: La documentación de la observación

**Aether:**
- Tier: sonnet high — prosa que las pruebas de documentos exigen exacta, sobre un diseño que cruza varios archivos
- Review: high — que cada afirmación coincida con el árbol
- Area: docs
- Owns: `docs/guide/observe.md`, `docs/index.md`, `docs/reference/components.md`, `README.md`, `CLAUDE.md`, `tests/observe-docs.test.js`
- Depends on: Task 10 — el nombre del bin, sus verbos y los hooks ya existen, y `docs/reference/components.md` ya trae el conteo y la fila del bin; la Tarea 10 también posee `docs/reference/components.md`, y esta dependencia las ordena: aquí solo se añade la frase de la huella dormida
- Serves: R16, R13

**Interfaces:**

- `docs/guide/observe.md`, con el front matter `title`, `description` y un `order` entero (como las demás páginas de `docs/guide/`), explica: los dos métodos de instalación, con su orden exacta cada uno (el estándar, `claude plugin install aether@aether-plugin`, y el de desarrollo, desde el árbol: `AETHER_OBSERVE=dev scripts/aether-lead --plugin-dir <árbol>/plugins/aether`), que la variable `AETHER_OBSERVE` no cambia nada en la instalación del mercado, y qué reúne cada una (`standard` y `dev`); que la de desarrollo es un clon lanzado con `--plugin-dir` y escribe en el directorio de datos `aether-inline`, no en el del plugin instalado, salvo que se fije `AETHER_DATA_DIR`; que la detección corre sola al terminar una sesión del Lead y que `aether-observe read` solo la repite; los cinco hooks; los verbos `hook`, `read`, `baseline`, `status` y `forget --yes`; que nada sale de la máquina y que un issue solo se abre con el sí del dueño; el resumen durable y la poda de 30 días; y las tres exenciones de R10 con su razón (`aether-voice` y `aether-autonomy start --quote`; los prompts de `delegates/briefs/` y `external/*.json`; `.aether/pending.jsonl`).
- `docs/index.md` enlaza la página; el README (máximo 160 líneas, con las partes en su orden) y `CLAUDE.md` la nombran y nombran `aether-observe`.
- `docs/reference/components.md`: una frase nueva en la sección «What Aether adds to a normal session» que dice que los hooks de observación, en una sesión que no es del Lead, no escriben ni imprimen nada, que corren un proceso `node` solo en los cinco eventos, y que esto se lee del plugin y lo prueba `tests/observe-guarantees.test.js` (no se mide en una sesión real).

**Tests (write first):**

`tests/observe-docs.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the observe guide has its front matter and says what each installation gathers (R16, C6)', () => {
  const page = read('docs', 'guide', 'observe.md')
  const front = /^---\n([\s\S]*?)\n---/.exec(page)
  assert.ok(front, 'front matter')
  assert.match(front[1], /^title: .+/m)
  assert.match(front[1], /^description: .+/m)
  assert.match(front[1], /^order: \d+$/m)
  for (const word of ['standard', 'dev', 'AETHER_OBSERVE']) assert.ok(page.includes(`\`${word}\``), word)
  for (const order of ['claude plugin install aether@aether-plugin', 'scripts/aether-lead --plugin-dir']) assert.ok(page.includes(order), order)
  for (const verb of ['aether-observe hook', 'aether-observe read', 'aether-observe baseline', 'aether-observe status', 'aether-observe forget --yes']) assert.ok(page.includes(verb), verb)
  for (const event of ['PostToolUse', 'PostToolUseFailure', 'StopFailure', 'PreCompact', 'SessionEnd']) assert.ok(page.includes(event), event)
})

test('the guide names the three exemptions of R10 with their reason and the rule of the owner\'s yes', () => {
  const page = read('docs', 'guide', 'observe.md')
  for (const exempt of ['aether-voice', 'start --quote', 'delegates/briefs', '.aether/pending.jsonl']) assert.ok(page.includes(exempt), exempt)
  assert.match(page, /30 days/)
  assert.match(page, /never leaves your machine|nothing leaves your machine/i)
  assert.match(page, /only with your (yes|word|go-ahead)/i)
})

test('the index, the README and CLAUDE.md point to the guide and the bin', () => {
  assert.ok(read('docs', 'index.md').includes('guide/observe.md'))
  assert.ok(read('README.md').includes('docs/guide/observe.md'))
  assert.ok(read('README.md').split('\n').length <= 160)
  assert.ok(read('CLAUDE.md').includes('aether-observe'))
})

test('the components page says the observation hooks do nothing in a plain session (R13)', () => {
  const components = read('docs', 'reference', 'components.md')
  assert.match(components, /observation hooks[^\n]*write and print nothing in a session that is not the Lead's/)
  assert.ok(components.includes('tests/observe-guarantees.test.js'))
})
```

**Acceptance:**

- Las pruebas pasan y `tests/docs-facts.test.js` sigue en verde (la página tiene front matter, `docs/index.md` la enlaza, ningún enlace ni ancla se rompe, y cada `` `aether-<nombre>` `` es un archivo de `bin/`).
- `npm run check` pasa.

### Task 12: Las garantías de punta a punta

**Aether:**
- Tier: sonnet high — pruebas que cruzan el bin, los hooks y las lecturas, y que cierran lo que escape a las tareas anteriores
- Review: xhigh — es la prueba de C7, C9, C10 y C13
- Area: proof
- Owns: `tests/observe-guarantees.test.js`, `plugins/aether/lib/observe*.js`, `plugins/aether/bin/aether-observe`, `plugins/aether/hooks/fault-trace.mjs`
- Depends on: Task 10 — recorre el bin entero
- Depends on: Task 4 — el barrido estático incluye `hooks/fault-trace.mjs`
- Serves: R2, R4, R9, R10, R12, R13, R17

**Interfaces:**

Esta tarea no añade producto: escribe las pruebas de abajo. Si una falla, arregla la causa en los archivos que posee (`lib/observe*.js`, `bin/aether-observe`, `hooks/fault-trace.mjs`) sin quitar ni debilitar ninguna prueba.

**Tests (write first):**

`tests/observe-guarantees.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')
const MARK = 'ZEBRA-QUOKKA-7731'
const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)
const EVENTS = ['PostToolUse', 'PostToolUseFailure', 'StopFailure', 'PreCompact', 'SessionEnd']

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jsonl = (list) => list.map((e) => JSON.stringify(e)).join('\n') + '\n'
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((e) => path.join(dir, e)).filter((f) => fs.statSync(f).isFile()) : [])

function bin(args, { dir, home, cwd = dir, input = '', env = {} }) {
  return spawnSync('node', [BIN, ...args], { input, cwd, encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, HOME: home, ...env } })
}
function lead(dir, id = 's-1') { write(path.join(dir, 'sessions', `${id}.json`), '{}') }
function input(event, transcript, over = {}) {
  return JSON.stringify({
    session_id: 's-1', hook_event_name: event, tool_name: event === 'PostToolUse' ? 'ScheduleWakeup' : 'Bash', is_interrupt: false,
    error: `${MARK} error text`, trigger: 'auto', reason: 'clear', prompt: MARK, tool_input: { command: MARK, prompt: MARK },
    transcript_path: transcript, cwd: '/x', ...over,
  })
}
function transcriptFile(dir) {
  const file = path.join(dir, 'transcript.jsonl')
  write(file, jsonl([
    { type: 'user', message: { role: 'user', content: `${MARK} user text` } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `${MARK} model text` }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: `ENOENT: no such file ${MARK} token ${GH} key ${KEY}` }] } },
  ]))
  return file
}
function seedSources(dir, repo) {
  write(path.join(dir, 'delegates', 'log.jsonl'), jsonl([
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
    { kind: 'answer', time: 31, session: 's-1', task: 't2', attempt: 2, text: `${MARK} answer` },
  ]))
  write(path.join(dir, 'lanes', 's-1.jsonl'), jsonl([{ kind: 'call', time: 5, session: 's-1', harness: 'agy', group: 'flash', effort: 'medium', model: 'gemini-3.8-flash-medium', status: 'ok', durationMs: 1000, usage: { output: 10 }, prompt: MARK }]))
  write(path.join(repo.dir, '.aether', 'pending.jsonl'), jsonl([{ time: 1000, session: 's-1', class: 'push', command: `git push ${MARK}`, cwd: '/x', mode: 'enforce' }]))
  write(path.join(repo.dir, '.aether', 'autonomy', 'grants.json'), JSON.stringify({ grants: [{ class: 'push', scope: 'repo', quote: `${MARK} quote`, session: 's-1', time: 1, added: new Date(1500).toISOString() }], revoked: [] }))
}

test('in the standard installation the marked phrase reaches no file the observation writes (C7, E8)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const repo = makeRepo(t)
  lead(dir)
  seedSources(dir, repo)
  const transcript = transcriptFile(dir)
  for (const event of EVENTS) assert.equal(bin(['hook'], { dir, home, input: input(event, transcript) }).status, 0)
  const read = bin(['read'], { dir, home, cwd: repo.dir })
  const baseline = bin(['baseline'], { dir, home })
  const status = bin(['status'], { dir, home })
  for (const r of [read, baseline, status]) {
    assert.equal(r.status, 0)
    assert.equal(r.stdout.includes(MARK), false)
    assert.equal(r.stderr.includes(MARK), false)
  }
  assert.ok(JSON.parse(read.stdout).items.some((i) => i.type === 'blocked-by-mistake'), 'the pending and grants sources were read')
  const written = files(path.join(dir, 'observe'))
  assert.ok(written.length > 3)
  for (const file of written) assert.equal(fs.readFileSync(file, 'utf8').includes(MARK), false, file)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'dev')), false)
})

test('the development installation keeps the context of a failure and not its key or token (C8, E9)', (t) => {
  const dir = tempDir(t); const home = tempDir(t)
  lead(dir)
  const r = bin(['hook'], { dir, home, input: input('PostToolUseFailure', transcriptFile(dir)), env: { AETHER_OBSERVE: 'dev' } })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  const saved = files(path.join(dir, 'observe', 'dev'))
  assert.equal(saved.length, 1)
  const text = fs.readFileSync(saved[0], 'utf8')
  assert.ok(text.includes('ENOENT'))
  assert.equal(text.includes(GH), false)
  assert.equal(text.includes(KEY), false)
})

test('the installation from the marketplace stays standard even with the variable on; the one from the tree is development (C6, C7, R9)', (t) => {
  const dir = tempDir(t); const home = tempDir(t)
  lead(dir)
  const transcript = transcriptFile(dir)
  const cache = path.join(tempDir(t), 'plugins', 'cache', 'aether-plugin', 'aether', '0.19.2')
  fs.cpSync(PLUGIN, cache, { recursive: true })
  const run = (target) => spawnSync('node', [target, 'hook'], { input: input('PostToolUseFailure', transcript), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, HOME: home, AETHER_OBSERVE: 'dev' } })
  const installed = run(path.join(cache, 'bin', 'aether-observe'))
  assert.deepEqual([installed.status, installed.stdout, installed.stderr], [0, '', ''])
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'events.jsonl')), 'it still gathers the standard events')
  assert.deepEqual(files(path.join(dir, 'observe', 'dev')), [], 'and keeps no fragment')
  const tree = run(BIN)
  assert.equal(tree.status, 0)
  assert.equal(files(path.join(dir, 'observe', 'dev')).length, 1)
})

test('the whole detection runs by itself when a Lead session ends, with no command run (C1, E7)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const repo = makeRepo(t)
  lead(dir)
  seedSources(dir, repo)
  const r = bin(['hook'], { dir, home, input: input('SessionEnd', transcriptFile(dir), { cwd: repo.dir }) })
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  const read = JSON.parse(fs.readFileSync(path.join(dir, 'observe', 'read.json'), 'utf8'))
  const types = read.items.map((i) => i.type)
  assert.ok(types.includes('rise-without-reason'))
  assert.ok(types.includes('blocked-by-mistake'))
  assert.ok(files(path.join(dir, 'observe', 'issues')).length >= 2)
  for (const file of files(path.join(dir, 'observe'))) assert.equal(fs.readFileSync(file, 'utf8').includes(MARK), false, file)
})

test('a session that is not the Lead: each hook writes and prints nothing, anywhere (E10, C10)', (t) => {
  const dir = tempDir(t); const home = tempDir(t)
  const transcript = transcriptFile(tempDir(t))
  for (const event of EVENTS) {
    for (const env of [{}, { AETHER_OBSERVE: 'dev' }]) {
      const r = bin(['hook'], { dir, home, input: input(event, transcript), env })
      assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''], event)
    }
  }
  assert.deepEqual(fs.readdirSync(dir), [])
  assert.deepEqual(fs.readdirSync(home), [])
})

const OBSERVATION_FILES = () => [
  ...fs.readdirSync(path.join(PLUGIN, 'lib')).filter((n) => /^observe.*\.js$/.test(n)).map((n) => path.join(PLUGIN, 'lib', n)),
  path.join(PLUGIN, 'bin', 'aether-observe'),
  path.join(PLUGIN, 'hooks', 'fault-trace.mjs'),
]

test('no observation file uses the network, a process or gh (C9, R12)', () => {
  const forbidden = /node:(http|https|http2|net|tls|dgram|dns|child_process)|\bchild_process\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|\bgh\s+(issue|api|pr)\b|\b(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/
  for (const file of OBSERVATION_FILES()) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, file)
})

test('only lib/observe-dev.js names the transcript (C7, A4)', () => {
  const files = OBSERVATION_FILES()
  assert.ok(files.some((f) => f.endsWith('observe-dev.js')))
  for (const file of files) {
    const named = /transcript/i.test(fs.readFileSync(file, 'utf8'))
    assert.equal(named, file.endsWith('observe-dev.js'), file)
  }
})

test('a finding becomes a local draft and no issue is opened; nothing is written outside the data directory (E12, C13)', (t) => {
  const dir = tempDir(t); const home = tempDir(t); const repo = makeRepo(t); const bindir = tempDir(t)
  const sentinel = path.join(bindir, 'gh-was-called')
  write(path.join(bindir, 'gh'), `#!/bin/sh\ntouch "${sentinel}"\n`)
  fs.chmodSync(path.join(bindir, 'gh'), 0o755)
  seedSources(dir, repo)
  const r = bin(['read'], { dir, home, cwd: repo.dir, env: { PATH: `${bindir}:${process.env.PATH}` } })
  assert.equal(r.status, 0)
  assert.ok(files(path.join(dir, 'observe', 'issues')).length >= 1)
  assert.equal(fs.existsSync(sentinel), false)
  assert.deepEqual(fs.readdirSync(home), [])
})
```

**Acceptance:**

- Las pruebas pasan, sin que ninguna se haya quitado ni debilitado: las dos instalaciones se comportan distinto (la copiada a la caché sigue siendo estándar con la variable puesta) y la detección corre sola al terminar una sesión del Lead.
- `npm run check` pasa (pruebas, mod y validación `--strict`).
- Al terminar, el checkout principal y el plugin instalado (0.19.2) no cambiaron y la rama `feat/self-observation` no está fundida.
