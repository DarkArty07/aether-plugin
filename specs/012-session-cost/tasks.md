# El gasto de una sesión completa: tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual. `plan.md` dice por qué existe cada pieza (D1 a D11): léelo antes de empezar. Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice.
- **Idioma.** El código, los comentarios, los mensajes y los documentos del repositorio van en inglés (el panel y sus textos, también); este archivo y el plan, en español. Un texto que un test fija va exactamente como lo escribe el test. Las excepciones, en español literal: la línea del informe de cierre de Task 4 y los textos de las skills de corrida.
- **Estilo.** Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma ni dependencias de npm; el mod (`plugins/aether/hooks/`) es ESM, como está. Los bins son finos y la lógica vive en `plugins/aether/lib/`. Las funciones de `lib/` reciben `dataDir`, `prices` y `now` por parámetro, con `run.dataDir()` y `loadPrices()` como valores por defecto.
- **Primero los tests.** Cada tarea escribe sus tests (rojo), implementa y deja la suite verde antes de reportar. Cada fusión corre `npm test` entero: una tarea no deja rota una prueba que no es suya. Ninguna aserción existente cambia salvo donde una tarea lo dice; `--run`, `--seats`, `--delegates`, `finalize` y `price` siguen informando lo que informan hoy (R11). La tarea del mod corre además `npm run test:mod`.
- **Sin cuota real.** Ningún test lee el directorio de datos del dueño ni gasta cuota ni hace una llamada de pago: directorios desechables (`useDataDir` de `tests/helpers.js`), y una tabla de precios de la prueba (`tests/spend-fixtures.js`) donde la cifra se compara con una suma que la prueba calcula desde los tokens. La pasada con las sesiones `010621c2` y `252123d1` (R12) la hace el Lead después de fusionar todo; ninguna tarea la hace. La suma independiente, el tiempo de la sesión más grande y dónde se anota están en «Lead, después de fusionar».
- **Guardas que no cambian.** Nadie escribe bajo `specs/` ni `.specify/`. Nadie sube la versión, toca el changelog, empuja, publica ni fusiona a `main`. Ningún archivo nuevo importa una dependencia ni añade un bin o una opción de `plugin.json`.
- **La huella dormida (R10).** En una sesión que no es del Lead no se registra `/spend`, el medidor no escribe y el plugin no añade estado: el panel pregunta a `aetherSession($)` al usarse, nunca al empezar la sesión.
- **Formas compartidas entre tareas** (las produce la tarea indicada; las demás las leen tal cual):
  - **El `Tally`** (Task 1; Task 2 lo guarda): `{ usd, leadUsd, agentsUsd, byModel: { <model>: { usd, requests } }, byEffort: { '<model> <effort>': { usd, requests } }, byRole: { <rol>: { usd, requests } }, harness: { calls, usd, byModel: { <model>: { usd, calls } } }, unpriced: string[] (ordenada), first: ms | null, last: ms | null, resumptions: number, complete: boolean }`. `usd` ya incluye `harness.usd`; `byModel` y `byEffort` repartes todos los eventos con precio (los del medidor y los de otros harness); `byRole` solo los del medidor.
  - **El resumen** (Task 2 lo escribe, Task 1 lo lee): `<dataDir>/spend/<id>.json` con `{ version: 1, session, writtenAt: ms | null, through: { usage: ms | null, lanes: ms | null }, tally: Tally }`. Lo que sigue en disco de una fuente con hora `<= through.<fuente>` ya está dentro del resumen y no se cuenta otra vez.
  - **El JSON de la orden** (Task 1; Task 3 lo lee): el de R1, con estas claves en este orden: `session, recorded, complete, basis, currency, usd, leadUsd, agentsUsd, byModel, byEffort, byRole, harness, unpriced, firstRequest, lastRequest, resumptions, resumptionsApproximate`.
  - **Los dólares en pantalla y en el informe** (Tasks 3 y 4): dos decimales, mitad alejándose de cero, sobre el decimal más corto que `toString` escribe (D8); el JSON no se redondea. `1.005` se muestra `1.01` y `2.675` se muestra `2.68`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [E1] Los fixtures de las pruebas de gasto: tabla de precios propia, suma independiente y escritores de partes, lanes, diario y resumen in tests/spend-fixtures.js → Task 1
- [ ] T002 [P] [E1] El `Tally`, los lectores de las tres fuentes y del resumen, la sesión por defecto y `spendReport` in plugins/aether/lib/spend.js → Task 1
- [ ] T003 [P] [E1] La opción `--spend` y su validación estricta in plugins/aether/bin/aether-report → Task 1
- [ ] T004 [E3] `archiveSpend`: el resumen de la poda, con marca de agua y escritura atómica in plugins/aether/lib/spend-archive.js → Task 2
- [ ] T005 [E4] `pruneUsage` y `pruneLog` archivan antes de borrar in plugins/aether/lib/report.js → Task 2
- [ ] T006 [P] [E6] El texto y las líneas del panel, puros in plugins/aether/hooks/spend-view.mjs → Task 3
- [ ] T007 [P] [E6] El comando `/spend`, el panel y su registro in plugins/aether/hooks/spend-panel.jsx → Task 3
- [ ] T008 [P] [E9] La regla de cierre y la línea del informe in plugins/aether/skills/using-aether/SKILL.md → Task 4
- [ ] T009 [P] [E9] La línea del informe y el paso de cierre del enjambre in plugins/aether/skills/swarm/SKILL.md → Task 4
- [ ] T010 [P] [E1] La orden, `/spend`, el precio de lista y la poda en las páginas de la guía in docs/guide/autonomy.md → Task 5
- [ ] T011 [E7] La pasada de control de R12 la anota el Lead después de fusionar, no el enjambre in .aether/autonomy/<run id>/diary.md → Lead, después de fusionar

### Task 1: La cifra de una sesión y la opción `--spend`

**Aether:**
- Tier: sonnet xhigh — muchas reglas de lectura y de suma que las pruebas fijan, en varios archivos
- Review: xhigh — entrada de archivos a medio escribir, ids que cruzan sesiones, dinero y datos que se pierden si se leen mal
- Area: report
- Owns: `plugins/aether/lib/spend.js`, `plugins/aether/bin/aether-report`, `tests/spend-fixtures.js`, `tests/spend.test.js`, `tests/spend-bin.test.js`
- Depends on: none
- Serves: R1, R2, R3, R4, R5, R6, R7, R9, R11

**Interfaces:**

`plugins/aether/lib/spend.js` (nuevo) exporta:

```js
SESSION_ID          // /^[A-Za-z0-9_-]+$/
GAP_MS              // 3600000: un hueco ESTRICTAMENTE mayor es una reanudación
isSessionId(id)     // -> boolean: string, cumple SESSION_ID y no es 'unknown'
spendDir(dataDir)   // -> <dataDir>/spend
summaryFile(dataDir, id) // -> <dataDir>/spend/<id>.json
// Un evento ya puesto a precio. usd es null para un modelo sin precio, nunca 0.
// SpendEvent = { source: 'meter' | 'call' | 'outcome', time: number | null, model: string,
//                effort: string | null, usd: number | null, lead?: boolean, role?: string }
emptyTally()                 // -> Tally con todo en cero, first/last null, unpriced [], complete true
tallyOf(events)              // -> Tally de una lista de SpendEvent
mergeTallies(a, b)           // -> Tally: suma dólares y conteos; une unpriced (ordenada, sin repetidos);
                             //    first = menor, last = mayor (ignorando null); resumptions = a + b SIN hueco del corte;
                             //    complete = a.complete && b.complete
// Lectores. `after` es una marca de agua: se ignora todo evento con hora numérica <= after
// (null = ninguna). Un evento sin hora numérica se cuenta siempre. `exists` es si hay archivo propio;
// `complete` es falso si algo que existe no se pudo leer; `writtenAt` la mtime más nueva de lo leído (o null);
// `vanished` es verdadero si un archivo listado desapareció (ENOENT) mientras se leía: lo borró otra poda, no
// cuenta como ilegible.
readUsageEvents(dataDir, id, { after = null, prices })  // -> { exists, events, complete, writtenAt, vanished }
readLaneEvents(dataDir, id, { after = null, prices })   // -> idem, solo lanes/<id>.jsonl, solo kind 'call'
readOutcomeEvents(dataDir, id, { prices })               // -> { events, complete }, del diario, solo kind 'outcome' de esa sesión
readSummary(dataDir, id)     // -> { exists, readable, summary: Summary | null }
latestSession(dataDir)       // -> string | null
spendReport({ dataDir = run.dataDir(), session = null, prices = loadPrices() })  // -> el JSON de R1
```

Reglas que las pruebas fijan:

- Un evento del medidor: `model` es `entry.model || 'unknown'`; `effort` es `entry.effort || null`; `usd` es `priceEntry(entry, prices)` (null sin precio); `lead` es verdadero sin `entry.agent`; `role` es `main` sin agente y, con él, el `type` que `agents[entry.agent]` guarda en las partes (`agent` si no hay tipo). Las partes de `usage/<id>/` se leen una a una (`/^\d+\.json$/`, orden numérico); `agents` se une de todas.
- Un evento de otro harness (`call` del registro de lanes, `outcome` del diario) tiene `usd = priceEntry({ model, ...laneTokens(entry.usage ?? {}), agent: 'lane' }, prices)`, `model` por defecto `'unknown'` y `effort` el de la entrada. El registro de lanes es solo `lanes/<id>.jsonl`. Una entrada sin `session` (campo ausente o `null`) toma la id de su archivo, como ya hace `readLog` en `lanes.js` (`entry.session ??` el nombre del archivo, sin `.jsonl`). Solo una entrada cuyo `session` es explícitamente distinto de esa id no cuenta. `lanes/unknown.jsonl` y cualquier archivo cuyo nombre no cumple la regla no se abren nunca. Una línea ilegible del registro de lanes se omite. Un `outcome` cuenta solo si su `session` es el id; cada `outcome` cuenta una vez aunque compartan `id`.
- Un evento con precio entra en `usd`, `byModel`, `byEffort` (clave `<model> <effort>`, esfuerzo ausente `unknown`) y, si es del medidor, en `leadUsd` o `agentsUsd` y en `byRole`; uno de otro harness entra en `harness.calls`, `harness.usd` y `harness.byModel`. `harness.calls` cuenta también las entradas sin precio; `requests` y `harness.byModel[...].calls` cuentan solo las que tienen precio. Un modelo sin precio va a `unpriced` una sola vez y no a ningún cubo. Un evento de un modelo con precio y cero tokens es un cero medido y entra en los cubos.
- `first`, `last` y `resumptions` salen de las horas numéricas de todos los eventos, con precio o sin él, ordenadas; una reanudación es un hueco `> GAP_MS` entre dos consecutivas.
- Lectura del diario (R9): se lee línea a línea con su posición. Una línea en blanco no es ilegible. Una línea ilegible hace `complete` falso en la sesión S solo si cae en el tramo de S: el de las líneas legibles de S (cualquier `kind`); si de la línea rota se puede sacar una hora (`"time":<dígitos>`), cuenta cuando esa hora está entre la menor y la mayor hora del tramo; si no, cuando su posición está entre la primera y la última posición del tramo. Sin líneas legibles de S no hay tramo.
- `spendReport`: con `session` distinto de null y `!isSessionId(session)` lanza `Error('bad session id: <x>')` sin leer nada. Con `session: null` usa `latestSession(dataDir)`; si no hay ninguna, devuelve el JSON de «todavía no hay registro» con `session: null`. `recorded` es verdadero si existe cualquier parte, archivo de lanes, resumen o `outcome` de la id. Sin registro: `recorded: false`, `complete: true`, `usd`, `leadUsd`, `agentsUsd` y `resumptions` en `null`, el resto en su forma vacía (`harness: { calls: 0, usd: 0, byModel: {} }`, `firstRequest` y `lastRequest` en `null`). Con registro, el resumen (si existe y se lee) se une con `mergeTallies` a lo que sigue en disco leído con `after = summary.through.<fuente>`; un resumen que existe y no se lee deja `complete` falso. `basis` es `${prices.basis}, ${prices.snapshot}`; `currency` es `'USD'`; `firstRequest` y `lastRequest` son ISO o `null`; `resumptionsApproximate` es `true`.
- `latestSession`: candidatas son las ids de `usage/<id>/` (directorio; hora = la más nueva entre el directorio y sus partes), `lanes/<id>.jsonl` (mtime) y `spend/<id>.json` (la hora `writtenAt` que guarda, y la mtime del archivo si no se lee). Solo cuentan los nombres que cumplen `isSessionId`. Gana la hora mayor; el empate, la id mayor comparada como texto. El diario no decide.

`plugins/aether/bin/aether-report`:

- Línea de uso nueva en el encabezado y en `USAGE`: `aether-report --spend [--session <id>]`.
- `--spend` se revisa **antes** de `price`, `--delegates` y `--seats`. Solo se aceptan `--spend` y, a lo más una vez, `--session <valor>`. Cualquier otra cosa (un `--session` sin valor o con valor que empieza por `--`, una id que no cumple `isSessionId`, `--run`, `--seats`, `--delegates`, `--since`, `finalize`, `price`, `--no-tests`, un argumento suelto) termina con `{ "error": "usage: aether-report --spend [--session <id>]" }`, salida distinta de cero y ni un byte de ninguna cifra. Una id bien formada sin registros sale con código 0 y el JSON de «sin registro» con `session` igual a la id.

**Tests (write first):**

`tests/spend-fixtures.js`:

```js
'use strict'

// Fixtures of the spend tests: a price table of the tests' own, an independent sum, and writers of the files the
// command reads. Nothing here reads the owner's data directory.

const fs = require('node:fs')
const path = require('node:path')
const { writeJson } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')

const MIN = 60 * 1000
const T0 = Date.parse('2026-09-01T10:00:00.000Z')
const RATES = {
  'm-a': { input: 1, output: 2, cacheRead: 0.5, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  'm-b': { input: 10, output: 20, cacheRead: 5, cacheWrite5m: 12.5, cacheWrite1h: 20 },
}
const PRICES = {
  basis: 'test list prices',
  snapshot: 'S1',
  currency: 'USD',
  per: 1e6,
  cacheWriteTtl: { main: '1h', agents: '5m' },
  models: Object.fromEntries(Object.entries(RATES).map(([id, rates]) => [id, { ids: [id], ...rates }])),
}

const iso = (ms) => new Date(ms).toISOString()

// The independent sum: tokens times the table, per million. Null for a model the table lacks.
function usdOf(entry) {
  const rates = RATES[entry.model]
  if (!rates) return null
  const write = entry.agent ? rates.cacheWrite5m : rates.cacheWrite1h
  return ((entry.input || 0) * rates.input + (entry.output || 0) * rates.output + (entry.cacheRead || 0) * rates.cacheRead + (entry.cacheWrite || 0) * write) / 1e6
}

// One meter request `minutes` after T0: a million tokens of one kind.
function meter(minutes, model, agent, kind, effort = null) {
  return { t: T0 + minutes * MIN, ms: 1000, agent, model, effort, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 }
}

// Writes a session's meter parts: parts = [{ agents, entries }].
function writeParts(dataDir, session, parts) {
  parts.forEach((part, i) => writeJson(path.join(dataDir, 'usage', session, `${i}.json`), { session, part: i, claudeCode: '2.1.296', agents: {}, ...part }))
}

// A call of the lane log with a million tokens of one kind. Returns its list price.
function laneCall(dataDir, session, minutes, model, kind = 'input', extra = {}) {
  appendLog(dataDir, session, { kind: 'call', time: T0 + minutes * MIN, harness: 'grok', group: 'grok', role: 'implementer', model, effort: 'high', status: 'ok', usage: { [kind]: 1e6 }, ...extra })
  return usdOf({ model, agent: 'lane', [kind]: 1e6 })
}

function journalLine(dataDir, line) {
  const file = path.join(dataDir, 'router', 'decisions.jsonl')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${typeof line === 'string' ? line : JSON.stringify(line)}\n`)
}

// An outcome entry of the router's journal. Returns its list price.
function outcome(dataDir, session, minutes, model, kind = 'input', extra = {}) {
  journalLine(dataDir, { kind: 'outcome', id: `d-${minutes}`, time: T0 + minutes * MIN, session, status: 'ok', harness: 'agy', model, effort: 'low', durationMs: 1, usage: { [kind]: 1e6 }, attempt: 1, ...extra })
  return usdOf({ model, agent: 'lane', [kind]: 1e6 })
}

// What a prune archived: 25 dollars, 5 of them from two meter requests and 20 from one call of another harness.
const archivedTally = () => ({
  usd: 25,
  leadUsd: 3,
  agentsUsd: 2,
  byModel: { 'm-a': { usd: 5, requests: 2 }, 'm-b': { usd: 20, requests: 1 } },
  byEffort: { 'm-a high': { usd: 5, requests: 2 }, 'm-b high': { usd: 20, requests: 1 } },
  byRole: { main: { usd: 3, requests: 1 }, 'aether:judge': { usd: 2, requests: 1 } },
  harness: { calls: 1, usd: 20, byModel: { 'm-b': { usd: 20, calls: 1 } } },
  unpriced: ['x-old'],
  first: T0 - 60 * MIN,
  last: T0 + 10 * MIN,
  resumptions: 2,
  complete: true,
})
const summaryOf = (session, over = {}) => ({ version: 1, session, writtenAt: T0, through: { usage: null, lanes: null }, tally: archivedTally(), ...over })
const writeSummary = (dataDir, session, summary) => writeJson(path.join(dataDir, 'spend', `${session}.json`), summary)

function ageFile(file, hours) {
  const when = new Date(Date.now() - hours * 3600 * 1000)
  fs.utimesSync(file, when, when)
}

module.exports = { MIN, T0, RATES, PRICES, iso, usdOf, meter, writeParts, laneCall, journalLine, outcome, archivedTally, summaryOf, writeSummary, ageFile }
```

`tests/spend.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { useDataDir, age } = require('./helpers.js')
const { MIN, T0, PRICES, iso, usdOf, meter, writeParts, laneCall, journalLine, outcome, summaryOf, writeSummary, ageFile } = require('./spend-fixtures.js')
const { spendReport, latestSession, isSessionId } = require('../plugins/aether/lib/spend.js')

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const sum = (list) => list.reduce((total, value) => total + value, 0)
const bucketSum = (buckets) => sum(Object.values(buckets).map((bucket) => bucket.usd))
const report = (dataDir, session) => spendReport({ dataDir, session, prices: PRICES })

test('an id is [A-Za-z0-9_-]+ and is not unknown; a bad one throws and reads nothing', (t) => {
  for (const ok of ['010621c2', 'a_b-C', 'x']) assert.equal(isSessionId(ok), true, ok)
  for (const bad of ['unknown', '', 'a b', '../x', 'a/b', 'a.b', null, undefined, 7]) assert.equal(isSessionId(bad), false, String(bad))
  const dataDir = useDataDir(t)
  for (const bad of ['unknown', '', 'a b', '../x', 'a/b']) assert.throws(() => report(dataDir, bad), /bad session id/)
})

test('E1: the total, the Lead, the agents and every split come out of the same requests', (t) => {
  const dataDir = useDataDir(t)
  const agents = { i1: { type: 'aether:implementer' }, j1: { type: 'aether:judge' }, w1: { type: 'aether:writer' }, x1: { type: null } }
  const part0 = [meter(0, 'm-a', null, 'input', 'xhigh'), meter(1, 'm-b', null, 'output', 'xhigh'), meter(2, 'm-a', 'i1', 'cacheWrite', 'high'), meter(3, 'm-b', 'j1', 'input', 'xhigh')]
  const part1 = [meter(4, 'm-a', 'w1', 'output'), meter(5, 'm-a', null, 'cacheWrite', 'xhigh'), meter(6, 'm-b', 'x1', 'cacheRead', 'high')]
  writeParts(dataDir, 's1', [{ agents, entries: part0 }, { agents, entries: part1 }])
  const all = [...part0, ...part1]
  const lead = sum(all.filter((e) => !e.agent).map(usdOf))
  const helpers = sum(all.filter((e) => e.agent).map(usdOf))
  const r = report(dataDir, 's1')
  assert.deepEqual(Object.keys(r), ['session', 'recorded', 'complete', 'basis', 'currency', 'usd', 'leadUsd', 'agentsUsd', 'byModel', 'byEffort', 'byRole', 'harness', 'unpriced', 'firstRequest', 'lastRequest', 'resumptions', 'resumptionsApproximate'])
  assert.deepEqual([r.session, r.recorded, r.complete, r.currency, r.basis], ['s1', true, true, 'USD', 'test list prices, S1'])
  close(r.leadUsd, lead)
  close(r.agentsUsd, helpers)
  close(r.usd, lead + helpers)
  assert.deepEqual(Object.keys(r.byRole).sort(), ['aether:implementer', 'aether:judge', 'aether:writer', 'agent', 'main'])
  close(r.byRole.main.usd, lead)
  assert.equal(r.byRole.main.requests, 3)
  close(r.byRole['aether:writer'].usd, usdOf(part1[0]))
  close(r.byRole.agent.usd, usdOf(part1[2]))
  close(bucketSum(r.byRole), lead + helpers)
  for (const model of ['m-a', 'm-b']) {
    const mine = all.filter((e) => e.model === model)
    close(r.byModel[model].usd, sum(mine.map(usdOf)))
    assert.equal(r.byModel[model].requests, mine.length)
  }
  assert.deepEqual(Object.keys(r.byEffort).sort(), ['m-a high', 'm-a unknown', 'm-a xhigh', 'm-b high', 'm-b xhigh'])
  close(r.byEffort['m-a unknown'].usd, usdOf(part1[0]))
  close(bucketSum(r.byModel), r.usd)
  close(bucketSum(r.byEffort), r.usd)
  assert.deepEqual(r.harness, { calls: 0, usd: 0, byModel: {} })
  assert.deepEqual(r.unpriced, [])
  assert.deepEqual([r.firstRequest, r.lastRequest, r.resumptions, r.resumptionsApproximate], [iso(T0), iso(T0 + 6 * MIN), 0, true])
})

test('E2: calls and outcomes of other harnesses are counted once, apart, and inside the total', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const call = laneCall(dataDir, 's1', 1, 'm-b', 'output')
  const out1 = outcome(dataDir, 's1', 2, 'm-a', 'input', { id: 'd-2', attempt: 1 })
  const out2 = outcome(dataDir, 's1', 2, 'm-a', 'output', { id: 'd-2', attempt: 2 })
  laneCall(dataDir, 's1', 3, 'x-free')
  outcome(dataDir, 's1', 4, 'x-free2')
  outcome(dataDir, 's2', 5, 'm-b')
  laneCall(dataDir, 's2', 6, 'm-b')
  laneCall(dataDir, null, 7, 'm-b')
  const r = report(dataDir, 's1')
  assert.equal(r.harness.calls, 5)
  close(r.harness.usd, call + out1 + out2)
  close(r.harness.byModel['m-b'].usd, call)
  assert.equal(r.harness.byModel['m-a'].calls, 2)
  assert.equal(r.harness.byModel['x-free'], undefined)
  assert.deepEqual(r.unpriced, ['x-free', 'x-free2'])
  close(r.leadUsd, 1)
  close(r.usd, 1 + call + out1 + out2)
  assert.deepEqual(Object.keys(r.byRole), ['main'])
  assert.equal(r.byModel['m-a'].requests, 3)
  close(bucketSum(r.byModel), r.usd)
  close(bucketSum(r.byEffort), r.usd)
  assert.ok(r.byEffort['m-b high'] && r.byEffort['m-a low'] && r.byEffort['m-a unknown'])
  assert.deepEqual([r.firstRequest, r.lastRequest], [iso(T0), iso(T0 + 4 * MIN)])
})

test('without a session the report is of the one written last among those with files of their own', (t) => {
  const dataDir = useDataDir(t)
  assert.equal(latestSession(dataDir), null)
  writeParts(dataDir, 'old', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  age(path.join(dataDir, 'usage', 'old'), 48)
  laneCall(dataDir, 'mid', 1, 'm-a')
  ageFile(path.join(dataDir, 'lanes', 'mid.jsonl'), 24)
  laneCall(dataDir, null, 2, 'm-b')
  fs.writeFileSync(path.join(dataDir, 'lanes', 'bad name.jsonl'), '')
  writeParts(dataDir, 'not an id', [{ entries: [meter(0, 'm-b', null, 'input')] }])
  writeSummary(dataDir, 'bad name', summaryOf('bad name', { writtenAt: Date.now() }))
  outcome(dataDir, 'journal-only', 3, 'm-b')
  assert.equal(latestSession(dataDir), 'mid')
  assert.equal(report(dataDir, null).session, 'mid')
  const when = new Date(Date.now() - 3600 * 1000)
  for (const id of ['a1', 'b1']) {
    laneCall(dataDir, id, 3, 'm-a')
    fs.utimesSync(path.join(dataDir, 'lanes', `${id}.jsonl`), when, when)
  }
  assert.equal(latestSession(dataDir), 'b1')
  writeSummary(dataDir, 's-sum', summaryOf('s-sum', { writtenAt: Date.now() - 1000 }))
  assert.equal(latestSession(dataDir), 's-sum')
  assert.equal(report(dataDir, 'journal-only').recorded, true)
})

test('when only unknown.jsonl was written there is no session, and the report says nothing was recorded', (t) => {
  const dataDir = useDataDir(t)
  laneCall(dataDir, null, 1, 'm-a')
  assert.equal(latestSession(dataDir), null)
  const r = report(dataDir, null)
  assert.deepEqual([r.session, r.recorded, r.complete, r.usd, r.leadUsd, r.agentsUsd, r.resumptions], [null, false, true, null, null, null, null])
})

test('a well-formed id with no records is "not recorded yet", never zero dollars', (t) => {
  const dataDir = useDataDir(t)
  const r = report(dataDir, 'nothing')
  assert.deepEqual(r, {
    session: 'nothing', recorded: false, complete: true, basis: 'test list prices, S1', currency: 'USD', usd: null, leadUsd: null, agentsUsd: null,
    byModel: {}, byEffort: {}, byRole: {}, harness: { calls: 0, usd: 0, byModel: {} }, unpriced: [], firstRequest: null, lastRequest: null, resumptions: null, resumptionsApproximate: true,
  })
})

test('E3: the same id adds up across gaps of more than an hour; another id takes none of its dollars', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [
    { entries: [meter(0, 'm-a', null, 'input'), meter(30, 'm-a', null, 'input')] },
    { entries: [meter(91, 'm-a', null, 'input'), meter(151, 'm-a', null, 'input')] },
  ])
  const call = laneCall(dataDir, 's1', 200, 'm-b', 'output')
  const out = outcome(dataDir, 's1', 400, 'm-a')
  writeParts(dataDir, 's2', [{ entries: [meter(5, 'm-b', null, 'input')] }])
  const r = report(dataDir, 's1')
  close(r.usd, 4 + call + out)
  assert.equal(r.resumptions, 2)
  assert.deepEqual([r.firstRequest, r.lastRequest, r.resumptionsApproximate], [iso(T0), iso(T0 + 400 * MIN), true])
  close(report(dataDir, 's2').usd, 10)
})

test('a model with no price is listed and never costs a made-up zero; a priced model with zero tokens is a measured zero', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'x-free', null, 'input'), { ...meter(1, 'm-a', null, 'input'), input: 0 }] }])
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.usd, r.unpriced], [true, 0, ['x-free']])
  assert.deepEqual(r.byModel, { 'm-a': { usd: 0, requests: 1 } })
  assert.deepEqual(Object.keys(r.byRole), ['main'])
  assert.deepEqual([r.firstRequest, r.lastRequest], [iso(T0), iso(T0 + MIN)])
  writeParts(dataDir, 's2', [{ entries: [meter(0, 'x-free', null, 'input')] }])
  const none = report(dataDir, 's2')
  assert.deepEqual([none.recorded, none.usd, none.leadUsd, none.byModel, none.byRole, none.unpriced], [true, 0, 0, {}, {}, ['x-free']])
})

test('a part or a summary that cannot be read makes the figure incomplete and keeps what was read', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }, { entries: [meter(1, 'm-b', null, 'output')] }])
  fs.writeFileSync(path.join(dataDir, 'usage', 's1', '1.json'), '{"session":"s1","entr')
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.complete], [true, false])
  close(r.usd, 1)
  writeParts(dataDir, 's2', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  fs.mkdirSync(path.join(dataDir, 'spend'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'spend', 's2.json'), 'not json')
  const b = report(dataDir, 's2')
  assert.deepEqual([b.recorded, b.complete], [true, false])
  close(b.usd, 1)
  fs.writeFileSync(path.join(dataDir, 'spend', 's3.json'), 'not json')
  assert.deepEqual([report(dataDir, 's3').recorded, report(dataDir, 's3').complete, report(dataDir, 's3').usd], [true, false, 0])
})

test('R9: an unreadable journal line makes incomplete only the sessions whose span holds it', (t) => {
  const dataDir = useDataDir(t)
  const one = outcome(dataDir, 's1', 0, 'm-a')
  journalLine(dataDir, `{"kind":"outcome","time":${T0 + 5 * MIN},"sess`)
  outcome(dataDir, 's1', 10, 'm-a')
  outcome(dataDir, 's2', 100, 'm-a')
  journalLine(dataDir, 'this is not json')
  outcome(dataDir, 's2', 110, 'm-a')
  outcome(dataDir, 's3', 200, 'm-a')
  journalLine(dataDir, '')
  const s1 = report(dataDir, 's1')
  assert.equal(s1.complete, false)
  close(s1.usd, 2 * one)
  assert.equal(report(dataDir, 's2').complete, false)
  const s3 = report(dataDir, 's3')
  assert.deepEqual([s3.recorded, s3.complete], [true, true])
  close(s3.usd, one)
  const s4 = report(dataDir, 's4')
  assert.deepEqual([s4.recorded, s4.complete], [false, true])
})

test('the figure is the summary plus what is still on disk, each event once', (t) => {
  const dataDir = useDataDir(t)
  writeSummary(dataDir, 's1', summaryOf('s1', { through: { usage: T0 + 10 * MIN, lanes: T0 + 10 * MIN } }))
  writeParts(dataDir, 's1', [{ entries: [meter(10, 'm-a', null, 'input'), meter(20, 'm-b', null, 'output')] }])
  laneCall(dataDir, 's1', 10, 'm-b', 'output')
  laneCall(dataDir, 's1', 30, 'm-a', 'input')
  const r = report(dataDir, 's1')
  assert.equal(r.recorded, true)
  close(r.usd, 25 + 20 + 1)
  close(r.leadUsd, 3 + 20)
  close(r.agentsUsd, 2)
  close(r.harness.usd, 21)
  assert.equal(r.harness.calls, 2)
  assert.deepEqual([r.byModel['m-a'].requests, r.byModel['m-b'].requests], [3, 2])
  close(r.byModel['m-a'].usd, 6)
  close(r.byModel['m-b'].usd, 40)
  assert.equal(r.byRole.main.requests, 2)
  assert.deepEqual(r.unpriced, ['x-old'])
  assert.equal(r.resumptions, 2)
  assert.deepEqual([r.firstRequest, r.lastRequest], [iso(T0 - 60 * MIN), iso(T0 + 30 * MIN)])
  close(bucketSum(r.byModel), r.usd)
  close(bucketSum(r.byEffort), r.usd)
})

test('a summary alone is a figure, and an incomplete summary says so', (t) => {
  const dataDir = useDataDir(t)
  writeSummary(dataDir, 's1', summaryOf('s1'))
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.complete, r.usd, r.resumptions], [true, true, 25, 2])
  const bad = summaryOf('s2')
  bad.tally.complete = false
  writeSummary(dataDir, 's2', bad)
  assert.equal(report(dataDir, 's2').complete, false)
})

test('C5: each id counts only its own files and entries', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  writeParts(dataDir, 's2', [{ entries: [meter(0, 'm-b', null, 'input')] }])
  laneCall(dataDir, 's1', 1, 'm-a', 'input', { session: 's2' })
  laneCall(dataDir, null, 2, 'm-b')
  outcome(dataDir, 's2', 3, 'm-b')
  fs.writeFileSync(path.join(dataDir, 'lanes', 'bad name.jsonl'), `${JSON.stringify({ kind: 'call', time: T0, model: 'm-b', usage: { input: 1e6 } })}\n`)
  const r1 = report(dataDir, 's1')
  close(r1.usd, 1)
  assert.equal(r1.harness.calls, 0)
  const r2 = report(dataDir, 's2')
  close(r2.usd, 20)
  assert.equal(r2.harness.calls, 1)
})

test('C5: reading one id while another keeps writing gives the same figure every time', async (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 'quiet', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const script = `
    const fs = require('node:fs'); const path = require('node:path')
    const dir = process.argv[1]
    fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true }); fs.mkdirSync(path.join(dir, 'router'), { recursive: true })
    for (let i = 0; i < 400; i++) {
      fs.appendFileSync(path.join(dir, 'lanes', 'busy.jsonl'), JSON.stringify({ kind: 'call', time: i, model: 'm-a', usage: { input: 1 } }) + '\\n')
      fs.appendFileSync(path.join(dir, 'router', 'decisions.jsonl'), JSON.stringify({ kind: 'outcome', id: 'x' + i, time: i, session: 'busy', model: 'm-a', usage: { input: 1 } }) + '\\n')
      fs.mkdirSync(path.join(dir, 'usage', 'busy'), { recursive: true }); fs.writeFileSync(path.join(dir, 'usage', 'busy', '0.json'), JSON.stringify({ session: 'busy', entries: [] }))
    }`
  const writer = spawn(process.execPath, ['-e', script, dataDir], { stdio: 'ignore' })
  const done = once(writer, 'exit')
  const first = report(dataDir, 'quiet')
  for (let i = 0; i < 300 && writer.exitCode === null; i++) {
    assert.deepEqual(report(dataDir, 'quiet'), first)
    await new Promise((resolve) => setImmediate(resolve))
  }
  await done
  assert.deepEqual(report(dataDir, 'quiet'), first)
  assert.equal(report(dataDir, 'busy').harness.calls, 800)
})

test('E8: a session of 3,005 requests in 4 parts adds up to the independent sum', (t) => {
  const dataDir = useDataDir(t)
  const kinds = ['input', 'output', 'cacheRead', 'cacheWrite']
  const agents = { g0: { type: 'aether:judge' }, g1: { type: 'aether:implementer' }, g2: { type: 'aether:writer' }, g3: { type: 'aether:reviewer' }, g4: { type: 'aether:supervisor' } }
  const entries = Array.from({ length: 3005 }, (_, i) => meter(i % 50, i % 3 === 0 ? 'm-a' : 'm-b', i % 7 === 0 ? `g${i % 5}` : null, kinds[i % 4], i % 2 ? 'high' : 'xhigh'))
  writeParts(dataDir, 's1', [0, 1, 2, 3].map((p) => ({ agents, entries: entries.slice(p * 1000, (p + 1) * 1000) })))
  assert.equal(fs.readdirSync(path.join(dataDir, 'usage', 's1')).length, 4)
  const r = report(dataDir, 's1')
  close(r.usd, sum(entries.map(usdOf)))
  close(r.leadUsd, sum(entries.filter((e) => !e.agent).map(usdOf)))
  close(r.agentsUsd, sum(entries.filter((e) => e.agent).map(usdOf)))
  assert.equal(sum(Object.values(r.byModel).map((b) => b.requests)), 3005)
  close(bucketSum(r.byRole), r.usd)
  assert.equal(r.complete, true)
})
```

`tests/spend-bin.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, useDataDir, age } = require('./helpers.js')
const { loadPrices } = require('../plugins/aether/lib/prices.js')
const { writeJson } = require('../plugins/aether/lib/run.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-report')
const OPUS = 'claude-opus-5-5'
const PRICES = loadPrices()
const FORM = 'aether-report --spend [--session <id>]'

function run(dataDir, args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dataDir } })
  const last = r.stdout.trim().split('\n').pop()
  return { status: r.status, stdout: r.stdout, json: last ? JSON.parse(last) : null }
}

// A session of `count` requests of a million input tokens each, at the real price table.
function session(dataDir, id, count = 1) {
  const entries = Array.from({ length: count }, (_, i) => ({ t: Date.parse('2026-09-01T10:00:00Z') + i * 1000, ms: 1, agent: null, model: OPUS, effort: 'low', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }))
  writeJson(path.join(dataDir, 'usage', id, '0.json'), { session: id, part: 0, claudeCode: '2.1.296', agents: {}, entries })
}

test('--spend --session prints one JSON with the session list price', (t) => {
  const dataDir = useDataDir(t)
  session(dataDir, 's1', 2)
  const r = run(dataDir, ['--spend', '--session', 's1'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(r.json.session, 's1')
  assert.ok(Math.abs(r.json.usd - 2 * PRICES.models.opus.input) < 1e-9)
  assert.equal(r.json.basis, `${PRICES.basis}, ${PRICES.snapshot}`)
})

test('without --session the session is the one written last', (t) => {
  const dataDir = useDataDir(t)
  session(dataDir, 'older')
  age(path.join(dataDir, 'usage', 'older'), 48)
  session(dataDir, 'newer')
  assert.equal(run(dataDir, ['--spend']).json.session, 'newer')
})

test('a well-formed id with no records exits 0 with recorded false, and no session at all gives session null', (t) => {
  const dataDir = useDataDir(t)
  const a = run(dataDir, ['--spend', '--session', 'nothing'])
  assert.equal(a.status, 0)
  assert.deepEqual([a.json.session, a.json.recorded, a.json.usd], ['nothing', false, null])
  const b = run(dataDir, ['--spend'])
  assert.equal(b.status, 0)
  assert.deepEqual([b.json.session, b.json.recorded], [null, false])
})

test('every other use is a misuse: usage line, non-zero exit, and no figure of any session', (t) => {
  const dataDir = useDataDir(t)
  session(dataDir, 'other')
  const misuses = [
    ['--spend', '--session'], ['--spend', '--session', '--run'], ['--spend', '--session', 'bad id'], ['--spend', '--session', 'unknown'], ['--spend', '--session', 'a/b'],
    ['--spend', '--session', 'a', '--session', 'b'], ['--spend', '--run', 'x'], ['--spend', '--seats'], ['--spend', '--delegates'], ['--spend', '--since', '1'],
    ['finalize', '--spend'], ['price', '--spend'], ['--spend', 'extra'], ['--spend', '--no-tests'],
  ]
  for (const args of misuses) {
    const r = run(dataDir, args)
    assert.notEqual(r.status, 0, args.join(' '))
    assert.ok(r.json.error.includes(`usage: ${FORM}`), args.join(' '))
    assert.ok(!r.stdout.includes('"usd"'), args.join(' '))
  }
})

test('the bin names the new form in its usage text', () => {
  assert.ok(fs.readFileSync(BIN, 'utf8').includes(FORM))
})
```

**Acceptance:**

- `node --test tests/spend.test.js tests/spend-bin.test.js` pasa, y `npm test` entero también (las pruebas de `--run`, `--seats`, `--delegates`, `price` y `finalize` no cambian).
- `aether-report --spend --session <id>` imprime un solo JSON con las claves de R1 en ese orden, dólares sin redondear, y la lógica vive en `lib/spend.js` (el bin solo valida y llama).
- Ninguna lectura abre `lanes/unknown.jsonl` ni un archivo cuyo nombre no es una id, y `readUsage`/`readLog` de `report.js`/`lanes.js` no se usan.

### Task 2: La poda conserva el gasto

**Aether:**
- Tier: opus — borra datos del dueño y debe archivarlos antes, con podas que pueden correr a la vez
- Review: xhigh — pérdida de datos, doble conteo y escritura concurrente que las pruebas no agotan
- Area: report
- Owns: `plugins/aether/lib/spend-archive.js`, `plugins/aether/lib/report.js`, `plugins/aether/lib/lanes.js`, `tests/spend-prune.test.js`
- Depends on: Task 1 — usa `tallyOf`, `mergeTallies`, los lectores, `summaryFile` y los fixtures de las pruebas
- Serves: R8, R6, R9, R11

**Interfaces:**

`plugins/aether/lib/spend-archive.js` (nuevo) exporta:

```js
// Suma al resumen de la id lo que la poda va a borrar de una fuente ('usage' = partes del medidor,
// 'lanes' = lanes/<id>.jsonl, solo kind 'call'). Una entrada de lanes sin session (ausente o null) toma la id
// del archivo; solo un session explícito y distinto de esa id no cuenta, la misma regla que readLaneEvents.
// No archiva outcomes del diario. Lee la fuente con
// after = summary.through.<source>, arma un Tally con tallyOf, lo une al del resumen con mergeTallies y escribe:
//   writtenAt = max(el que había, la mtime más nueva de lo leído)
//   through.<source> = max(el que había, la mayor hora numérica de lo archivado)  (el que había si no hay ninguna)
//   tally.complete = false si lo leído no estaba completo, o si el resumen que había no se pudo leer
// Si la lectura vio desaparecer un archivo (`vanished`: otra poda lo está borrando), no escribe y devuelve
// { archived: false, events: 0 }. Justo antes de renombrar vuelve a leer el resumen: si su through.<source>
// ya es >= al que iba a escribir, no escribe (otra poda de la misma fuente llegó igual de lejos).
// Esa comprobación no mira la otra fuente. Si el renombre de la otra cae entre esta relectura y este
// renombre, este archivo pisa ese tramo: la ventana queda aceptada en Risks del plan, y no se añade un candado.
// Escribe a un temporal del mismo directorio (spend/<id>.json.<pid>.<aleatorio>.tmp) y lo renombra a
// spend/<id>.json; si algo falla borra el temporal y lanza. Una id que no cumple isSessionId, o una fuente
// sin archivos, no escribe nada.
archiveSpend(dataDir, session, source, { prices = loadPrices() } = {})  // -> { archived: boolean, events: number }
```

Cambios en lo que ya existe:

- `pruneUsage(dataDir, { days = 30, now = Date.now(), prices } = {})` en `report.js` y `pruneLog(dataDir, { days = 30, now = Date.now(), prices } = {})` en `lanes.js`: antes de borrar a una sesión (o archivo) cuya id cumple `isSessionId`, llaman a `archiveSpend(dataDir, id, 'usage' | 'lanes', { prices })`. Si lanza, esa sesión **no se borra** y no entra en `pruned` (la siguiente poda lo reintenta). Un nombre que no es una id y `unknown` se borran como hoy y no dejan resumen. Ninguna lanza porque otro proceso ya borró un archivo (`ENOENT`). Devuelven `{ pruned }` como hoy. `lanes.js` pide `./spend-archive.js` dentro de la función, no al cargar (dependencia circular). `pruneSessions` no cambia y ninguna poda borra `spend/`.
- `bin/aether-session-start` no cambia.

**Tests (write first):**

`tests/spend-prune.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')
const { PLUGIN, SESSION_BIN, useDataDir, age, tempDir } = require('./helpers.js')
const { MIN, T0, PRICES, iso, meter, writeParts, laneCall, outcome, ageFile } = require('./spend-fixtures.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const { archiveSpend } = require('../plugins/aether/lib/spend-archive.js')
const { pruneUsage } = require('../plugins/aether/lib/report.js')
const { pruneLog, logFile } = require('../plugins/aether/lib/lanes.js')
const { pruneSessions } = require('../plugins/aether/lib/session.js')

const DAY = 24 * 3600 * 1000
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const spend = (dataDir, session) => spendReport({ dataDir, session, prices: PRICES })
const summaryPath = (dataDir, id) => path.join(dataDir, 'spend', `${id}.json`)
const readSummary = (dataDir, id) => JSON.parse(fs.readFileSync(summaryPath(dataDir, id), 'utf8'))
const prune = (dataDir, extra = {}) => [pruneUsage(dataDir, { days: 30, prices: PRICES, ...extra }), pruneLog(dataDir, { days: 30, prices: PRICES, ...extra })]

// A session with meter parts (two parts, a judge among them), a lane call and an outcome in the journal.
function world(dataDir, id = 'old') {
  const agents = { j1: { type: 'aether:judge' } }
  writeParts(dataDir, id, [
    { agents, entries: [meter(0, 'm-a', null, 'input', 'high'), meter(1, 'm-b', 'j1', 'output', 'xhigh')] },
    { agents, entries: [meter(2, 'm-a', null, 'cacheWrite')] },
  ])
  laneCall(dataDir, id, 3, 'm-b', 'output')
  outcome(dataDir, id, 4, 'm-a')
}
function ageAll(dataDir, id, days) {
  age(path.join(dataDir, 'usage', id), days * 24)
  ageFile(logFile(dataDir, id), days * 24)
}

test('E4: a pruned session keeps its figure; a later prune adds the new stretch and does not replace the summary', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  ageAll(dataDir, 'old', 31)
  const before = spend(dataDir, 'old')
  assert.equal(before.harness.calls, 2)
  assert.deepEqual(prune(dataDir), [{ pruned: ['old'] }, { pruned: ['old'] }])
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old')), false)
  assert.equal(fs.existsSync(logFile(dataDir, 'old')), false)
  const summary = readSummary(dataDir, 'old')
  assert.equal(summary.session, 'old')
  assert.equal(summary.tally.harness.calls, 1)
  assert.ok(fs.readFileSync(path.join(dataDir, 'router', 'decisions.jsonl'), 'utf8').includes('"kind":"outcome"'))
  assert.deepEqual(spend(dataDir, 'old'), before)
  writeParts(dataDir, 'old', [{ entries: [meter(1000, 'm-a', null, 'output')] }])
  const resumed = spend(dataDir, 'old')
  close(resumed.usd, before.usd + 2)
  // R7: with a summary, resumptions are the summary's count plus the gaps between events still on disk.
  // The outcome at T0+4 min stays in the journal and the new meter request is at T0+1000 min, so that gap counts as 1.
  assert.equal(resumed.resumptions, 1)
  assert.equal(resumed.lastRequest, iso(T0 + 1000 * MIN))
  age(path.join(dataDir, 'usage', 'old'), 31 * 24)
  prune(dataDir)
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old')), false)
  close(readSummary(dataDir, 'old').tally.usd, before.usd - 1 + 2)
  const again = spend(dataDir, 'old')
  // D-b: the second prune folds the new request into the summary and leaves the outcome alone on disk.
  // There is no join across the cut, so the count goes back to 0. Every other field stays equal.
  assert.equal(again.resumptions, 0)
  const rest = ({ resumptions, ...fields }) => fields
  assert.deepEqual(rest(again), rest(resumed))
})

test('which prune runs first does not change the summary', (t) => {
  const a = useDataDir(t)
  world(a)
  ageAll(a, 'old', 31)
  pruneUsage(a, { days: 30, prices: PRICES })
  pruneLog(a, { days: 30, prices: PRICES })
  const first = readSummary(a, 'old')
  const b = useDataDir(t)
  world(b)
  ageAll(b, 'old', 31)
  pruneLog(b, { days: 30, prices: PRICES })
  pruneUsage(b, { days: 30, prices: PRICES })
  const second = readSummary(b, 'old')
  assert.deepEqual(second.tally, first.tally)
  assert.deepEqual(second.through, first.through)
})

test('archiving twice, or with the raw files still there, counts every event once', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  const before = spend(dataDir, 'old')
  assert.deepEqual(archiveSpend(dataDir, 'old', 'usage', { prices: PRICES }).archived, true)
  const once = readSummary(dataDir, 'old')
  archiveSpend(dataDir, 'old', 'usage', { prices: PRICES })
  assert.deepEqual(readSummary(dataDir, 'old').tally, once.tally)
  assert.deepEqual(spend(dataDir, 'old'), before)
  archiveSpend(dataDir, 'old', 'lanes', { prices: PRICES })
  assert.deepEqual(spend(dataDir, 'old'), before)
})

test('a session whose summary cannot be written is not deleted', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  ageAll(dataDir, 'old', 31)
  fs.writeFileSync(path.join(dataDir, 'spend'), 'a file where the directory should be')
  assert.deepEqual(prune(dataDir), [{ pruned: [] }, { pruned: [] }])
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old', '0.json')), true)
  assert.equal(fs.existsSync(logFile(dataDir, 'old')), true)
})

test('what is not a session id is deleted as before and leaves no summary', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 'not an id', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  laneCall(dataDir, null, 1, 'm-a')
  fs.writeFileSync(path.join(dataDir, 'lanes', 'bad name.jsonl'), '{}\n')
  age(path.join(dataDir, 'usage', 'not an id'), 31 * 24)
  ageFile(path.join(dataDir, 'lanes', 'unknown.jsonl'), 31 * 24)
  ageFile(path.join(dataDir, 'lanes', 'bad name.jsonl'), 31 * 24)
  assert.deepEqual(prune(dataDir), [{ pruned: ['not an id'] }, { pruned: ['bad name', 'unknown'] }])
  assert.equal(fs.existsSync(path.join(dataDir, 'spend')) ? fs.readdirSync(path.join(dataDir, 'spend')).length : 0, 0)
})

test('an unreadable part is archived as incomplete, and the figure stays incomplete', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  fs.writeFileSync(path.join(dataDir, 'usage', 'old', '1.json'), '{"session":"old","ent')
  ageAll(dataDir, 'old', 31)
  const before = spend(dataDir, 'old')
  assert.equal(before.complete, false)
  prune(dataDir)
  assert.equal(readSummary(dataDir, 'old').tally.complete, false)
  assert.deepEqual(spend(dataDir, 'old'), before)
})

test('pruning one session does not touch another, and no prune deletes a summary', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir, 'old')
  world(dataDir, 'fresh')
  ageAll(dataDir, 'old', 31)
  prune(dataDir)
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'fresh', '0.json')), true)
  assert.equal(fs.existsSync(logFile(dataDir, 'fresh')), true)
  assert.equal(fs.existsSync(summaryPath(dataDir, 'fresh')), false)
  const far = Date.now() + 400 * DAY
  pruneUsage(dataDir, { days: 30, now: far, prices: PRICES })
  pruneLog(dataDir, { days: 30, now: far, prices: PRICES })
  pruneSessions(dataDir, { days: 30, now: far })
  assert.equal(fs.existsSync(summaryPath(dataDir, 'old')), true)
  assert.equal(fs.existsSync(summaryPath(dataDir, 'fresh')), true)
})

test('C5: four prunes at once leave one readable summary, no temporaries and the same figure', async (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  ageAll(dataDir, 'old', 31)
  const before = spend(dataDir, 'old')
  const lib = path.join(PLUGIN, 'lib')
  const script = `
    const { pruneUsage } = require(${JSON.stringify(path.join(lib, 'report.js'))})
    const { pruneLog } = require(${JSON.stringify(path.join(lib, 'lanes.js'))})
    const prices = JSON.parse(process.argv[2])
    pruneUsage(process.argv[1], { days: 30, prices })
    pruneLog(process.argv[1], { days: 30, prices })`
  const children = [0, 1, 2, 3].map(() => spawn(process.execPath, ['-e', script, dataDir, JSON.stringify(PRICES)], { stdio: ['ignore', 'ignore', 'pipe'] }))
  const errors = children.map((child) => {
    let text = ''
    child.stderr.on('data', (chunk) => (text += chunk))
    return () => text
  })
  const codes = await Promise.all(children.map(async (child) => (await once(child, 'exit'))[0]))
  assert.deepEqual(codes, [0, 0, 0, 0], errors.map((e) => e()).join(''))
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'spend')), ['old.json'])
  assert.ok(readSummary(dataDir, 'old'))
  assert.deepEqual(spend(dataDir, 'old'), before)
})

test('session start archives a session before it prunes it', (t) => {
  const dataDir = useDataDir(t)
  const entries = [{ t: T0, ms: 1, agent: null, model: 'claude-opus-5-5', effort: 'low', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }]
  fs.mkdirSync(path.join(dataDir, 'usage', 'old'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'usage', 'old', '0.json'), JSON.stringify({ session: 'old', part: 0, claudeCode: '2.1.296', agents: {}, entries }))
  age(path.join(dataDir, 'usage', 'old'), 31 * 24)
  const before = spendReport({ dataDir })
  assert.equal(before.session, 'old')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: dataDir }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'CLAUDE_PLUGIN_OPTION_HARNESSES', 'CLAUDE_PLUGIN_OPTION_OPS', 'CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', 'CLAUDE_PLUGIN_OPTION_SEATS']) delete env[key]
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: tempDir(t), encoding: 'utf8', env, input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'now', source: 'startup', agent_type: 'aether:lead' }) })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old')), false)
  assert.deepEqual(spendReport({ dataDir, session: 'old' }), { ...before, session: 'old' })
})
```

**Acceptance:**

- `node --test tests/spend-prune.test.js` pasa, y `npm test` entero (los tests de `pruneUsage` y `pruneLog` que ya existen siguen pasando con sus devoluciones `{ pruned }`).
- Tras una poda, la cifra de la sesión es la misma, y cada evento cuenta una vez aunque el crudo siga en disco o se haya archivado dos veces.
- Si el resumen no se puede escribir, el crudo se queda; ninguna poda borra `spend/`; el diario no se toca.

### Task 3: El panel `/spend`

**Aether:**
- Tier: sonnet high — interfaz del mod con un patrón idéntico ya probado (`/harnesses`) y pruebas que fijan cada línea
- Review: xhigh — estados de la interfaz (cargando, fallo, sin registro, incompleto), texto que viene de fuera y la huella dormida en una sesión normal
- Area: mod
- Owns: `plugins/aether/hooks/spend-view.mjs`, `plugins/aether/hooks/spend-panel.jsx`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/spend-panel.test.tsx`, `tests/spend-view.test.js`
- Depends on: none
- Serves: R10, R11

**Interfaces:**

`plugins/aether/hooks/spend-view.mjs` (nuevo, puro: sin `$`, sin I/O, importable con node) exporta:

```js
usdText(value)                  // -> '12.35'. Two decimals, half away from zero, on the shortest round-trip decimal
                                // (Number#toString), not on the exact binary value and not Math.round(value * 100).
                                // Take the sign, expand an exponent form to a plain decimal, split the absolute text
                                // into integer and fraction, keep the first two decimal digits and, when the first
                                // dropped digit is 5 or more, add one hundredth away from zero, with carry.
                                // 1.005 -> '1.01' and 2.675 -> '2.68': those doubles sit slightly below the half,
                                // and rounding the exact value yields '1.00' and '2.67'.
                                // '—' when value is not a finite number.
parseSpend(out)                 // out es lo que $.process.run da (o { failed }); -> { ok: true, value } | { ok: false, error }
                                // usa readJson(out, 'aether-report') de panel-view.mjs; value.recorded no booleano -> { ok: false, error: 'aether-report printed no spend figure' }
spendLines({ result, columns = 76 })  // -> [{ parts: [{ text, tone }] }] ; la última línea es { parts: [], action: true } (los botones)
```

Líneas de `spendLines` (tonos `title`, `ok`, `warn`, `bad`, `dim`, `plain`; ninguna línea pasa de `columns` celdas; todo texto de fuera se limpia con `clean` y se corta con `clip`, ambos de `panel-view.mjs`):

- `result === null`: `Aether · session spend` (title) y `Reading…`.
- `result.ok === false`: el título y `  Spend unavailable: <error>` (bad).
- `recorded === false`: el título, `Session <id>` (id `—` si es null) y `No spend recorded yet`. Nunca un total ni `US$ 0.00`.
- Con registro, en este orden: el título; `Session <id> · list prices · <basis>` (dim); `Total US$ <usd>` y, si `complete === false`, otra parte ` incomplete` (warn); `Lead US$ <leadUsd> · Agents US$ <agentsUsd> · Other harnesses US$ <harness.usd>`; una línea en blanco y `By model` con una fila `  <model>  US$ <usd>  <n> request(s)` por modelo, de más a menos dólares y, si empatan, por nombre; en blanco y `By model and effort` (filas iguales); en blanco y `By role` (filas iguales); si `harness.calls > 0`, en blanco y `Other harnesses: <n> call(s) · US$ <usd>` con una fila `  <model>  US$ <usd>  <n> call(s)` por modelo; si `unpriced` no está vacío, en blanco y `No price: a, b`; si `firstRequest` no es null, en blanco y `First request <ISO> · last request <ISO>`; `Resumptions <n> (approximate)`; y la línea de acción. «1 request» / «2 requests», «1 call» / «2 calls».

`plugins/aether/hooks/spend-panel.jsx` (nuevo) exporta `registerSpend(on)`; `register.js` lo importa y lo llama junto a `registerPanel(on, options)` (y añade su línea al comentario de cabecera):

- `classic.SessionStart` con `agent_type: 'aether:lead'`: tras `next(e)`, `$.command.register({ name: 'spend', description: 'Show the list-price spend of this Aether session', immediate: true })`, cada vez; si falla, el resto del mod sigue. Ninguna otra sesión lo declara.
- `command.run` con `command: 'spend'`: `const state = await aetherSession($)`; si es null, `return next(e)` (no abre, no corre nada). Si no, abre `{ id: 'spend', title: 'Spend', focus: true, closeOnEscape: true, rows: 30 }` (un `toast` si `isPlaced === false`), devuelve `{}` y, sin esperar, corre `node <root>/bin/aether-report --spend --session <state.id>` con `$.process.run` y `timeoutMs: 120000`; al volver guarda `parseSpend(...)` y redibuja con `$.ui.invalidate('ui.render')`. Un `deny`/fallo del proceso es `{ ok: false, error }` con el motivo (`aether-report did not answer in 120 s` o `aether-report could not run: <mensaje>`). No llama a un modelo ni escribe en la transcripción, antes ni después de que el bin vuelva. Un `/spend` nuevo mientras otro lee descarta la respuesta tardía del anterior.
- `ui.render` con `component: 'Pane', requestId: 'spend'`: si `aetherSession($)` es null, `next(e)`; si no, dibuja `spendLines` (con `e.props.bodyColumns`) y, en la línea de acción, un `Button` con `label="Close"` y `hotkey="x"` que cierra el panel (`$.ui.close({ id: 'spend' })`).

**Tests (write first):**

`tests/spend-view.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let view
let panel
test.before(async () => {
  view = await import(pathToFileURL(path.join(HOOKS, 'spend-view.mjs')).href)
  panel = await import(pathToFileURL(path.join(HOOKS, 'panel-view.mjs')).href)
})

const REPORT = {
  session: 's1', recorded: true, complete: true, basis: 'test table, S1', currency: 'USD', usd: 30.5, leadUsd: 20, agentsUsd: 8.25,
  byModel: { 'claude-haiku-5-5': { usd: 5, requests: 12 }, 'claude-opus-5-5': { usd: 25.5, requests: 7 } },
  byEffort: { 'claude-opus-5-5 xhigh': { usd: 25.5, requests: 7 }, 'claude-haiku-5-5 unknown': { usd: 5, requests: 12 } },
  byRole: { 'aether:implementer': { usd: 8.25, requests: 14 }, main: { usd: 20, requests: 5 } },
  harness: { calls: 3, usd: 2.25, byModel: { 'claude-haiku-5-5': { usd: 2.25, calls: 2 } } },
  unpriced: ['x-free'], firstRequest: '2026-09-01T10:00:00.000Z', lastRequest: '2026-09-03T10:00:00.000Z', resumptions: 4, resumptionsApproximate: true,
}
const ok = (value) => ({ ok: true, value })
const rows = (lines) => lines.map((line) => line.parts.map((part) => part.text).join(''))
const printed = (value, extra = {}) => ({ exitCode: 0, stdout: `${JSON.stringify(value)}\n`, ...extra })

test('dollars have two decimals, rounded half away from zero', () => {
  const cases = [[0, '0.00'], [0.005, '0.01'], [1.005, '1.01'], [2.675, '2.68'], [-0.005, '-0.01'], [36.25, '36.25'], [1e6, '1000000.00'], [0.004, '0.00']]
  for (const [value, text] of cases) assert.equal(view.usdText(value), text, String(value))
  for (const bad of [NaN, Infinity, null, undefined, '3']) assert.equal(view.usdText(bad), '—')
})

test('parseSpend takes the bin output, and every failure is a reason', () => {
  assert.deepEqual(view.parseSpend(printed(REPORT)), ok(REPORT))
  assert.deepEqual(view.parseSpend({ exitCode: 1, stdout: '{"error":"usage: aether-report --spend [--session <id>]"}\n' }), { ok: false, error: 'usage: aether-report --spend [--session <id>]' })
  assert.deepEqual(view.parseSpend({ failed: 'aether-report did not answer in 120 s' }), { ok: false, error: 'aether-report did not answer in 120 s' })
  assert.equal(view.parseSpend(printed({ usd: 1 })).ok, false)
  assert.equal(view.parseSpend({ exitCode: 0, stdout: 'plain text\n' }).ok, false)
})

test('the panel says what the figure holds, in this order', () => {
  const lines = view.spendLines({ result: ok(REPORT), columns: 76 })
  assert.deepEqual(rows(lines), [
    'Aether · session spend',
    'Session s1 · list prices · test table, S1',
    'Total US$ 30.50',
    'Lead US$ 20.00 · Agents US$ 8.25 · Other harnesses US$ 2.25',
    '',
    'By model',
    '  claude-opus-5-5  US$ 25.50  7 requests',
    '  claude-haiku-5-5  US$ 5.00  12 requests',
    '',
    'By model and effort',
    '  claude-opus-5-5 xhigh  US$ 25.50  7 requests',
    '  claude-haiku-5-5 unknown  US$ 5.00  12 requests',
    '',
    'By role',
    '  main  US$ 20.00  5 requests',
    '  aether:implementer  US$ 8.25  14 requests',
    '',
    'Other harnesses: 3 calls · US$ 2.25',
    '  claude-haiku-5-5  US$ 2.25  2 calls',
    '',
    'No price: x-free',
    '',
    'First request 2026-09-01T10:00:00.000Z · last request 2026-09-03T10:00:00.000Z',
    'Resumptions 4 (approximate)',
    '',
  ])
  assert.equal(lines[lines.length - 1].action, true)
})

test('an incomplete figure says incomplete next to the total; a complete one does not', () => {
  const incomplete = rows(view.spendLines({ result: ok({ ...REPORT, complete: false }), columns: 76 }))
  assert.equal(incomplete[2], 'Total US$ 30.50 incomplete')
  assert.ok(!rows(view.spendLines({ result: ok(REPORT), columns: 76 })).some((row) => row.includes('incomplete')))
})

test('nothing recorded is a sentence, never a total of zero or another session', () => {
  const none = { ...REPORT, session: 's9', recorded: false, usd: null, leadUsd: null, agentsUsd: null, byModel: {}, byEffort: {}, byRole: {}, harness: { calls: 0, usd: 0, byModel: {} }, unpriced: [], firstRequest: null, lastRequest: null, resumptions: null }
  const text = rows(view.spendLines({ result: ok(none), columns: 76 }))
  assert.deepEqual(text.slice(0, 3), ['Aether · session spend', 'Session s9', 'No spend recorded yet'])
  assert.ok(!text.join('\n').includes('US$'))
})

test('loading and failure are one line each', () => {
  assert.deepEqual(rows(view.spendLines({ result: null, columns: 76 })).slice(0, 2), ['Aether · session spend', 'Reading…'])
  const failed = rows(view.spendLines({ result: { ok: false, error: 'boom' }, columns: 76 }))
  assert.deepEqual(failed.slice(0, 2), ['Aether · session spend', '  Spend unavailable: boom'])
})

test('text from outside is cleaned, and no row is wider than the room', () => {
  const dirty = { ...REPORT, byModel: { 'bad\u001b[31m‮model': { usd: 1, requests: 1 } }, unpriced: ['x\u0000y'] }
  for (const columns of [20, 30, 40, 76, 120]) {
    const text = rows(view.spendLines({ result: ok(dirty), columns }))
    assert.ok(!/[\u0000-\u001f\u007f-\u009f‪-‮]/.test(text.join('\n')), 'control characters')
    for (const row of text) assert.ok(panel.cells(row) <= columns, `${columns}: ${row}`)
  }
})
```

`plugins/aether/hooks/spend-panel.test.tsx`:

```tsx
import { expect, mock, test } from 'claude-code/testing'

// Tests for the /spend panel (spend-panel.jsx, with spend-view.mjs). Run them with `claude plugin test plugins/aether`.
// The pure parts are also tested with node, in tests/spend-view.test.js.

const PANE_ID = 'spend'
const NOW = 1792169230000
const DESCRIPTION = 'Show the list-price spend of this Aether session'
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const REPORT = {"session":"s1","recorded":true,"complete":true,"basis":"test table, S1","currency":"USD","usd":30.5,"leadUsd":20,"agentsUsd":8.25,"byModel":{"claude-opus-5-5":{"usd":25.5,"requests":7},"claude-haiku-5-5":{"usd":5,"requests":12}},"byEffort":{"claude-opus-5-5 xhigh":{"usd":25.5,"requests":7},"claude-haiku-5-5 unknown":{"usd":5,"requests":12}},"byRole":{"main":{"usd":20,"requests":5},"aether:implementer":{"usd":8.25,"requests":14}},"harness":{"calls":3,"usd":2.25,"byModel":{"claude-haiku-5-5":{"usd":2.25,"calls":2}}},"unpriced":["x-free"],"firstRequest":"2026-09-01T10:00:00.000Z","lastRequest":"2026-09-03T10:00:00.000Z","resumptions":4,"resumptionsApproximate":true}
const NOT_RECORDED = { ...REPORT, session: 's1', recorded: false, usd: null, leadUsd: null, agentsUsd: null, byModel: {}, byEffort: {}, byRole: {}, harness: { calls: 0, usd: 0, byModel: {} }, unpriced: [], firstRequest: null, lastRequest: null, resumptions: null }

type Answer = { exitCode: number; stdout: string; stderr?: string } | { deny: string }
type Run = { argv: string[]; init: Record<string, any> }
const printed = (value: unknown): Answer => ({ exitCode: 0, stdout: `${JSON.stringify(value)}\n` })

// Answers what the mod asks Claude Code for, and keeps what it did. `calls` counts the model and the prompt: a
// /spend must leave both at zero.
function stubs(on, { marked = (() => true) as () => boolean, answer = (run: Run): Answer | Promise<Answer> => printed(REPORT) } = {}) {
  const runs: Run[] = []
  const registered: Array<Record<string, any>> = []
  const opened: Array<Record<string, unknown>> = []
  const closed: Array<Record<string, unknown>> = []
  const calls = { model: 0, prompt: 0 }
  mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  on('session.id', () => ({ value: 's1' }))
  on('fs.exists', ($, e) => ({ value: marked() && e.path.endsWith('/sessions/s1.json') }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('command.register', ($, e) => {
    registered.push(e as Record<string, any>)
    return { value: { command: (e as { name: string }).name } }
  })
  on('command.run', () => ({ text: 'the engine ran its own command' }))
  on('model.complete', () => {
    calls.model++
    return { value: { isAnswered: false, reason: 'none' } }
  })
  on('prompt.submit', ($, e) => {
    calls.prompt++
    return { text: (e as { text: string }).text }
  })
  on('ui.open', ($, e) => {
    opened.push(e as Record<string, unknown>)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    closed.push(e as Record<string, unknown>)
    return { value: undefined }
  })
  on('process.run', async ($, e) => {
    const run: Run = { argv: [...e.argv], init: { ...(e.init || {}) } }
    runs.push(run)
    const done = await answer(run)
    if ('deny' in done) return { deny: done.deny }
    return { value: { stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...done } }
  })
  return { runs, registered, opened, closed, calls }
}

function gate() {
  let open: () => void = () => {}
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}
async function settled() {
  for (let i = 0; i < 400; i++) await Promise.resolve()
}

type Props = { title: string; isFocused: boolean; bodyColumns: number; placement: 'inline'; scroll: { offset: number; bodyRows: number }; view: object }
const pane = (bodyColumns = 76, bodyRows = 60): Props => ({ title: 'Spend', isFocused: true, bodyColumns, placement: 'inline', scroll: { offset: 0, bodyRows }, view: {} })
const mount = ($, surface, props = pane()) => $.ui.mount({ plugin: 'aether', surface, component: 'Pane', props, requestId: PANE_ID })
const textOf = (node): string => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''))
async function paneRows(ui): Promise<string[]> {
  const tree = await ui.drawn()
  return (tree.children || []).map((child) => (typeof child !== 'string' && child.type === 'Box' ? '[buttons]' : textOf(child)))
}
const startSession = ($) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

test('the Lead\'s SessionStart declares /spend every time, as one that may run mid-turn', async ($, on) => {
  const { registered } = stubs(on)
  for (const source of ['startup', 'clear', 'compact']) await $.classic.SessionStart({ source, agent_type: 'aether:lead' })
  const spend = registered.filter((spec) => spec.name === 'spend')
  expect(spend.length).toBe(3)
  expect(spend.every((spec) => spec.immediate === true && spec.description === DESCRIPTION)).toBe(true)
})

test('no other SessionStart declares it', async ($, on) => {
  const { registered } = stubs(on)
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  await $.classic.SessionStart({ source: 'startup', agent_type: 'general-purpose' })
  await $.classic.SessionStart({ source: 'resume', agent_type: 'aether:implementer' })
  expect(registered.filter((spec) => spec.name === 'spend')).toEqual([])
})

test('/spend opens the pane and runs aether-report for this session, with no model and no prompt', async ($, on) => {
  const { runs, opened, calls } = stubs(on)
  const result = await $.command.run({ command: 'spend' })
  expect(result.text).toBeUndefined()
  expect(opened.length).toBe(1)
  expect(opened[0]?.id).toBe(PANE_ID)
  expect(opened[0]?.focus).toBe(true)
  expect(opened[0]?.closeOnEscape).toBe(true)
  await settled()
  expect(runs.map((run) => [run.argv[0], run.argv[1].split('/').slice(-2).join('/'), ...run.argv.slice(2)])).toEqual([['node', 'bin/aether-report', '--spend', '--session', 's1']])
  expect(calls).toEqual({ model: 0, prompt: 0 })
})

test('the pane says Reading… until the bin returns, and no model is called meanwhile', async ($, on) => {
  const held = gate()
  const { calls } = stubs(on, { answer: async () => { await held.wait; return printed(REPORT) } })
  await $.command.run({ command: 'spend' })
  const ui = await mount($, 'terminal')
  expect((await paneRows(ui))).toContain('Reading…')
  expect(calls).toEqual({ model: 0, prompt: 0 })
  held.open()
  await settled()
  const rows = await paneRows(ui)
  expect(rows).not.toContain('Reading…')
  expect(rows).toContain('Total US$ 30.50')
  expect(calls).toEqual({ model: 0, prompt: 0 })
  await ui.unmount()
})

test('every surface draws the figure of this session', async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'spend' })
  await settled()
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const rows = await paneRows(ui)
    expect(rows[0]).toBe('Aether · session spend')
    expect(rows).toContain('Session s1 · list prices · test table, S1')
    expect(rows).toContain('Total US$ 30.50')
    expect(rows).toContain('Lead US$ 20.00 · Agents US$ 8.25 · Other harnesses US$ 2.25')
    expect(rows).toContain('  aether:implementer  US$ 8.25  14 requests')
    expect(rows).toContain('No price: x-free')
    expect(rows).toContain('Resumptions 4 (approximate)')
    expect(rows).toContain('[buttons]')
    await ui.unmount()
  }
})

test('an incomplete figure says incomplete next to the total', async ($, on) => {
  stubs(on, { answer: () => printed({ ...REPORT, complete: false }) })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  expect(await paneRows(ui)).toContain('Total US$ 30.50 incomplete')
  await ui.unmount()
})

test('nothing recorded says so, with no total of zero', async ($, on) => {
  stubs(on, { answer: () => printed(NOT_RECORDED) })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  const rows = await paneRows(ui)
  expect(rows).toContain('No spend recorded yet')
  expect(rows.join('\n')).not.toMatch(/US\$/)
  await ui.unmount()
})

const FAILURES: Array<[string, Answer, RegExp]> = [
  ['exits 1 with an error line', { exitCode: 1, stdout: '{"error":"bad session id"}\n' }, /^ {2}Spend unavailable: bad session id$/],
  ['is refused after its timeout', { deny: '$.process.run(node) aborted: still running after 120000ms' }, /^ {2}Spend unavailable: aether-report did not answer in 120 s$/],
  ['prints text that is not JSON', { exitCode: 0, stdout: 'spend\n' }, /^ {2}Spend unavailable: aether-report printed no JSON$/],
]
for (const [what, answered, pattern] of FAILURES) {
  test(`a bin that ${what} is one line in the pane, with no model`, async ($, on) => {
    const { calls } = stubs(on, { answer: () => answered })
    await $.command.run({ command: 'spend' })
    await settled()
    const ui = await mount($, 'terminal')
    const rows = await paneRows(ui)
    expect(rows.some((row) => pattern.test(row))).toBe(true)
    expect(calls).toEqual({ model: 0, prompt: 0 })
    await ui.unmount()
  })
}

test('Close closes the pane', async ($, on) => {
  const { closed } = stubs(on)
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'close' })
  expect(closed.map((close) => close.id)).toEqual([PANE_ID])
})

test('text from the report that holds a control character does not take the pane away', async ($, on) => {
  stubs(on, { answer: () => printed({ ...REPORT, byModel: { 'bad\u001b[31mmodel': { usd: 1, requests: 1 } } }) })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  const rows = await paneRows(ui)
  expect(rows.join('\n')).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
  expect(rows.some((row) => row.includes('badmodel') || row.includes('bad[31mmodel'))).toBe(true)
  await ui.unmount()
})

test('a plain session has no /spend: nothing is declared, opened, run or drawn', async ($, on) => {
  const { runs, registered, opened } = stubs(on, { marked: () => false })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the engine drew its own</Text>
  })
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  expect(registered.filter((spec) => spec.name === 'spend')).toEqual([])
  const result = await $.command.run({ command: 'spend' })
  expect(result.text).toBe('the engine ran its own command')
  expect(opened).toEqual([])
  expect(runs).toEqual([])
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'the engine drew its own' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /session spend/ })).toBeUndefined()
  await ui.unmount()
  expect(runs).toEqual([])
})
```

**Acceptance:**

- `node --test tests/spend-view.test.js` y `npm run test:mod` pasan, y `npm test` entero (las pruebas de `/harnesses` no cambian).
- En una sesión que no es del Lead, `/spend` no se declara, no abre nada, no corre ningún bin y no dibuja; el panel pregunta a `aetherSession($)` al usarse, nunca al empezar la sesión.
- Ninguna ruta del panel llama a un modelo ni escribe en la transcripción, tampoco mientras el bin no ha vuelto; si el bin falla, el panel muestra el motivo.

### Task 4: La cifra en el informe de cierre

**Aether:**
- Tier: haiku high — texto fijado palabra por palabra por las pruebas, en tres archivos de skills
- Review: high — el texto tiene que ir en el sitio que el Lead lee antes de borrar y de subir
- Area: skills
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `tests/spend-skills.test.js`
- Depends on: none
- Serves: R13, R11

**Interfaces:**

Texto exacto que debe quedar (no se parafrasea):

- En `using-aether/SKILL.md`, en una sección corta del cierre, antes de las reglas de acciones irreversibles (`## The owner's list`) y sin que la skill pase de largo con la regla de la corrida autónoma: `Before deleting worktrees and temporary files, and before any push, the closing report carries this session's list-price spend from aether-report --spend. This holds for every Aether session, including one that is not an autonomous run and not a swarm.`
- En `autonomous-runs/SKILL.md`, dentro de `## Tiempo y costo` del formato del informe, **debajo** de la línea del tope, que no cambia (`- US$ <gasto> de US$ <tope>. La cifra cubre el swarm, las lanes y los asientos externos; no cubre los turnos del Lead, ni los de los asientos nativos, ni los de las tareas delegadas.`):
  - `- Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>) y no es la cifra del tope.`
  - y, en el texto que sigue al formato, las instrucciones: la línea sale de `aether-report --spend --session <id de esta sesión>`; los tres números y el de harness salen del JSON en dólares con dos decimales; cuando `recorded` es falso la línea es `Sesión <id>: todavía no hay gasto registrado.`; cuando `complete` es falso la línea termina con `El total está incompleto.`; la línea va en todo informe de cierre (cumplida, parcial, el tope o no terminada).
- En `swarm/SKILL.md`, en el paso `## 6. Finish`, antes del punto que corre `aether-report finalize` y de cualquier subida: primero la cifra de la sesión en ese informe (la misma línea `Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>) y no es la cifra del tope.` con `aether-report --spend --session <id de esta sesión>`), y después `aether-report finalize` y cualquier subida.

**Tests (write first):**

`tests/spend-skills.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (name) => fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8')
const USING = read('using-aether')
const RUNS = read('autonomous-runs')
const SWARM = read('swarm')

const RULE = "Before deleting worktrees and temporary files, and before any push, the closing report carries this session's list-price spend from aether-report --spend. This holds for every Aether session, including one that is not an autonomous run and not a swarm."
const LINE = 'Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>) y no es la cifra del tope.'
const NONE = 'Sesión <id>: todavía no hay gasto registrado.'
const INCOMPLETE = 'El total está incompleto.'
const CAP = '- US$ <gasto> de US$ <tope>. La cifra cubre el swarm, las lanes y los asientos externos; no cubre los turnos del Lead, ni los de los asientos nativos, ni los de las tareas delegadas.'

test('using-aether, which every Lead session reads, holds the closing rule word for word, before the irreversible actions', () => {
  assert.ok(USING.includes(RULE))
  assert.ok(USING.indexOf(RULE) < USING.indexOf("## The owner's list"))
})

test('the autonomous-runs report keeps the ceiling line and adds the session line under it', () => {
  assert.ok(RUNS.includes(CAP), 'the ceiling line is as before')
  assert.ok(RUNS.includes(`- ${LINE}`))
  assert.ok(RUNS.indexOf(CAP) < RUNS.indexOf(LINE))
  for (const text of [NONE, INCOMPLETE, 'aether-report --spend --session']) assert.ok(RUNS.includes(text), text)
  const section = RUNS.slice(RUNS.indexOf('## Tiempo y costo'))
  assert.ok(section.includes(LINE))
})

test('the swarm skill gives the figure first, in that report, and then finalize and any push', () => {
  const finish = SWARM.slice(SWARM.indexOf('## 6. Finish'))
  assert.ok(finish.includes(LINE))
  assert.ok(finish.includes('aether-report --spend --session'))
  assert.ok(finish.indexOf('aether-report --spend') < finish.indexOf('aether-report finalize'))
})
```

**Acceptance:**

- `node --test tests/spend-skills.test.js` pasa, y `npm test` entero (las pruebas de las skills y del arranque no cambian de significado).
- La frase de R13 está palabra por palabra en `using-aether`; la línea del informe, sus dos variantes y la regla de orden están en las skills de corrida y de enjambre; la línea del tope no cambia.

### Task 5: La guía explica la orden y el panel

**Aether:**
- Tier: sonnet high — prosa que las pruebas de documentos del repositorio sostienen contra el árbol
- Review: high — enlaces, anclas y nombres de comandos que `tests/docs-facts.test.js` revisa
- Area: docs
- Owns: `docs/guide/autonomy.md`, `docs/guide/lanes.md`, `docs/guide/troubleshooting.md`, `docs/guide/maintenance.md`, `docs/reference/components.md`, `tests/spend-docs.test.js`
- Depends on: none
- Serves: R14

**Interfaces:**

Lo que cada página debe decir (en inglés; ninguna página nueva, ningún bin nuevo, ninguna entrada de changelog ni cambio de versión):

- `docs/guide/autonomy.md`, en el punto **Cost**: que la cifra del tope sigue cubriendo el swarm y las lanes y no suma los turnos del Lead, y que `aether-report --spend` da aparte el gasto de la sesión completa a precio de lista (lo del Lead, lo de los agentes, repartido por modelo, esfuerzo y rol, más las llamadas a otros harness), que no es la cifra del tope, y que el informe de cierre la lleva.
- `docs/guide/lanes.md`, después de la sección `### The /harnesses panel`: una sección `### The /spend panel` que explica `/spend` (en una sesión de Aether solamente, sin llamar a un modelo ni escribir en la transcripción) y `aether-report --spend [--session <id>]`; que los dólares son de precio de lista y no un porcentaje de la cuota; que la misma id suma al reanudar (`/resume`, `/compact`, cerrar y volver) y que otra id (`--fork-session`, `/clear`) no se enlaza; que un modelo sin precio se lista y no suma; que la reanudación es aproximada; que la cifra puede decir `incomplete`; y que sin registro dice `No spend recorded yet`.
- `docs/guide/troubleshooting.md`, en `## The /harnesses panel is not offered`: que `/spend` tampoco existe fuera de una sesión de Aether, por la misma razón.
- `docs/guide/maintenance.md`: que la poda de 30 días conserva el total de una sesión en `spend/<id>.json` del directorio de datos, que lo archivado se suma a lo nuevo si la sesión se reanuda, y que el diario del router no se poda.
- `docs/reference/components.md`: en la fila del medidor y del mod, que también declara `/spend` (solo en una sesión de Aether), y en la del SessionStart, que la poda de 30 días guarda antes un resumen del gasto.

**Tests (write first):**

`tests/spend-docs.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
const section = (text, heading) => {
  const start = text.indexOf(heading)
  assert.ok(start >= 0, `missing ${heading}`)
  const rest = text.slice(start + heading.length)
  const next = rest.search(/\n#{1,3} /)
  return next === -1 ? rest : rest.slice(0, next)
}

test('the autonomy page keeps the ceiling figure apart from the session spend', () => {
  const cost = section(read('docs', 'guide', 'autonomy.md'), '- **Cost.**')
  assert.match(cost, /`aether-report --spend`/)
  assert.match(cost, /list.price/i)
  assert.match(cost, /not the (figure of the )?ceiling|another figure|apart from the ceiling/i)
})

test('the lanes page documents /spend next to /harnesses', () => {
  const lanes = read('docs', 'guide', 'lanes.md')
  assert.ok(lanes.indexOf('### The /harnesses panel') < lanes.indexOf('### The /spend panel'))
  const spend = section(lanes, '### The /spend panel')
  for (const pattern of [/`\/spend`/, /`aether-report --spend/, /list.price/i, /not a percentage/i, /same id/i, /--fork-session/, /\/clear/, /no price|without a price|unpriced/i, /approximate/, /incomplete/, /No spend recorded yet/]) assert.match(spend, pattern)
})

test('troubleshooting says /spend is not offered outside an Aether session either', () => {
  const entry = section(read('docs', 'guide', 'troubleshooting.md'), '## The /harnesses panel is not offered')
  assert.match(entry, /`\/spend`/)
})

test('maintenance says the 30-day prune keeps the total', () => {
  const text = read('docs', 'guide', 'maintenance.md')
  assert.match(text, /spend\/<session>\.json|spend\/<id>\.json/)
  assert.match(text, /summary/i)
})

test('components names /spend and the summary the prune keeps', () => {
  const text = read('docs', 'reference', 'components.md')
  assert.match(text, /`\/spend`/)
  assert.match(text, /spend summary|summary of the spend|keeps a summary/i)
})
```

**Acceptance:**

- `node --test tests/spend-docs.test.js tests/docs-facts.test.js` pasa, y `npm test` entero. Ningún enlace, ancla ni nombre de comando de las páginas editadas se rompe (`aether-report` es un archivo de `bin/`; `/spend` y `aether-report --spend` dentro de código en línea).
- La página de autonomía deja de decir sin matices que el costo no incluye al Lead sin remitir a la cifra de la sesión; el encabezado `### The /spend panel` existe y su ancla (`the-spend-panel`) resuelve.

## Lead, después de fusionar

R12 no tiene tarea del enjambre. `aether-plan check` avisa `R12 has no task that serves it` por eso: ninguna tarea puede leer el directorio de datos del dueño, y la suite tampoco (D11). Esta sección es el seguimiento de R12.

Después de fusionar las tareas, el Lead corre estas dos órdenes, con `AETHER_DATA_DIR=~/.claude/plugins/data/aether-aether-plugin` (no `~/.claude/plugins/data/aether-inline/`):

- `aether-report --spend --session 010621c2`
- `aether-report --spend --session 252123d1`

Hace la suma independiente de esos mismos archivos a precio de lista y comprueba que cada total coincide con el de la orden. No gasta cuota ni hace una llamada de pago.

También cronometra la orden sobre la sesión real más grande, la de 3.005 peticiones en 4 partes que midió el apartado 4 de la tarjeta, y anota el tiempo junto a esa id. No es un plazo y la suite no lo compara.

La nota queda en el diario de la corrida, `.aether/autonomy/<id de la corrida>/diary.md`, como evidencia de C7, y en el informe de cierre. Fuera de una corrida no hay diario: la nota queda en el informe de cierre. Lleva las dos cifras, las dos sumas independientes, que coinciden, y el tiempo con su id.

La nota de que no se pudo hacer solo cabe si las dos sesiones ya no están en `aether-aether-plugin`, y la nota dice eso. Entonces no hay tiempo que anotar, y la evidencia de la cifra son las pruebas desechables de R11. Si la sesión de 3.005 peticiones ya no está, la nota lo dice y no anota un tiempo.
