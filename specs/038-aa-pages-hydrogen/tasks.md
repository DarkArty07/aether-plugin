# Tasks 038: fuera la API de Artificial Analysis, las páginas como única fuente, y Gemini 4 Hydrogen

Esta función tiene un diseño corto aprobado y no tiene `spec.md` ni `plan.md`: [design.md](design.md) hace de ambos y [intent.md](intent.md) trae las palabras del dueño. Los ocho criterios del diseño son los requisitos: `C1` a `C8`, en el orden en que el diseño los numera (C1 sin API, C2 un solo lector, C3 la foto, C4 el índice sin lista global, C5 Hydrogen colocado, C6 Flash reemplazado, C7 código en la regla, C8 nada se borra en silencio). El campo `Serves` de cada tarea nombra los que construye.

## Global Constraints

- Node.js 22, CommonJS, sin dependencias. Las pruebas usan `node:test` y los ayudantes de `tests/helpers.js` (`tempDir`, `makeRepo`). **Ninguna prueba usa la red** ni hace una llamada de pago: el lector y los scripts reciben `fetch` solo en las pruebas del lector (`scripts/aa-pages.js`); `scripts/refresh-lanes.js` y `scripts/build-models-index.js` no reciben ni usan `fetch`.
- Escribe cada prueba primero y mírala fallar por la razón que la tarea nombra; luego escribe el código. Una prueba que pasa antes del cambio no cuenta.
- Lo que una tarea no nombra queda como está. No toques `docs/changelog.md`, la versión, `plugin.json`, `plugins/aether/config/ladder.json`, ningún archivo de `specs/`, ni el `.env` del dueño. Nadie hace push, fusiona en `main`, publica ni borra fuera de su worktree. Los archivos que una tarea borra son los que su `Owns` nombra.
- Antes de terminar, busca en `tests/` (`grep -rn`) un fragmento de cada texto, dato o archivo que la tarea cambió o quitó, y cuenta `readdirSync`. Una prueba que fija lo viejo y no está en `Owns` se informa en el mensaje final de la tarea, no se edita.
- Comando de pruebas de toda la construcción: `npm test`. Cada tarea corre además sus archivos con `node --test <archivos>`. La última tarea corre `npm run check`.
- El código, las pruebas y los mensajes de los scripts van en inglés; la prosa de documentos y de habilidades conserva el idioma que el archivo ya tiene.
- **La foto, formato común** (la forma la fija la Tarea 1, el archivo lo escribe la Tarea 6 con la pasada real, y lo leen las Tareas 3, 4 y 7): `plugins/aether/config/models/aa-pages.json` es un objeto con una sola clave, `pages`. Cada dirección (el `slug` de la página, como `claude-haiku-5-5-high`) es un objeto `{ "readOn": "AAAA-MM-DD", "name": "<nombre que dio la página>", "figures": { "<cifra>": { "value": <número>, "on": "AAAA-MM-DD" } } }`. `readOn` es la última lectura que escribió algo en esa dirección; `on` es la lectura que dio ese valor, así que un valor conservado porque la página no lo trajo sigue con su fecha anterior. Una cifra que nunca se dio no aparece (nunca `null`). Las direcciones van ordenadas por unidades de código, una línea por dirección, con la clave `pages` y las llaves en líneas propias, y un salto de línea al final. Las cifras, en este orden fijo (`FIGURES` de `scripts/aa-pages.js`):

  | Cifra | Sale de la página | Redondeo |
  |---|---|---|
  | `intelligence` | `intelligenceIndex` | 1 decimal |
  | `costPerTaskUsd` | `intelligenceIndexCostPerTask.cost.total` | 3 |
  | `code` | puntaje de `terminalbench-4-0` por 100 | 2 |
  | `codeCostPerTaskUsd` | `costPerTask` de la eval `terminalbench-4-0` de la página (`costUsd` en la salida de `aa-extract`) | 3 |
  | `codeMinutesPerTask` | `timePerTask` de la eval `terminalbench-4-0` de la página (`seconds` en la salida de `aa-extract`), entre 60 | 1 |
  | `terminalBench` | puntaje de `terminalbench-4-0` (fracción) | 3 |
  | `briefcaseElo` | `briefcaseBreakdown.overall.elo` | 0 |
  | `briefcaseRubricPassRate` | `briefcaseBreakdown.rubricPassRate` | 3 |
  | `hallucinationRate` | `omniscienceHallucinationRate` | 3 |
  | `timePerTaskSeconds` | `intelligenceIndexTimePerTask` | 0 |
  | `priceInput` | `price1mInputTokens` | 4 |
  | `priceOutput` | `price1mOutputTokens` | 4 |
  | `cacheReadPrice` | `cacheHitPrice` | 4 |
  | `outputTokensPerSecond` | `medianOutputSpeed` | 1 |
  | `timeToFirstTokenS` | `medianTimeToFirstAnswerToken` | 2 |

- **Declaraciones en `harness-models.json`** (las lee la Tarea 3 y las llena la Tarea 7). Dentro de la entrada de un harness, dos mapas opcionales, con el id del modelo como el índice lo agrupa (para un harness con el esfuerzo en el id, el id sin el esfuerzo: `gemini-3.8-flash`): `"superseded": { "<id>": { "by": "<id del sucesor>", "on": "AAAA-MM-DD", "reason": "<motivo>", "figures": "<cifras con su fecha>" } }` y `"outOfScope": { "<id>": { "on": "AAAA-MM-DD", "reason": "<motivo>" } }`. Los `excluded` de texto que ya hay en los harness de bandera no cambian. Las claves de primer nivel de `harness-models.json` y de `profiles.json` siguen siendo `harnesses` y `profiles` (`tests/config-keys.test.js`).
- **Valores por omisión elegidos** (reversibles; la tarea que los usa los repite en su mensaje final): (a) `released` de una entrada de `models.json` sale del campo `released` del perfil en `profiles.json`, y se omite cuando el perfil no lo tiene, porque las páginas no traen la fecha de salida (la Tarea 7 copia el `released` de hoy a cada perfil antes de regenerar); (b) el `generatedAt` de `models.json` es la lectura más reciente (`readOn`) de la foto, no la fecha de hoy, para que dos corridas den los mismos archivos; (c) `timeToFirstTokenS` de la foto sale de `medianTimeToFirstAnswerToken`; las páginas leídas el 2026-11-13 traen nulas las velocidades y el primer token, así que el lector las nombra como campos que faltan; (d) `scripts/build-models-index.js` conserva sus constantes `HARNESSES`, `DEFAULT_HARNESSES` y `CAPTURE` tal cual (`tests/new-harness-skill.test.js` y `tests/copies-harness-config.test.js` las leen) y el `note` de `withoutFigures` conserva su texto `offered, with no Artificial Analysis entry, so no figures` (`tests/copies-muse.test.js`).
- Las pruebas que cargan las tablas reales (`lanes.CONFIG_FILE`, `loadPairs()` sin argumento, `lane-fixtures.js`, que lee la tabla real de carriles) están en el `Owns` de la Tarea 8, que se construye junto con la Tarea 7 (`Merges with`): la Tarea 7 cambia las tablas y esas pruebas todavía fijan las de hoy, así que no están verdes por separado. Antes de dar por cerrada su lista, la Tarea 8 corre `grep -il flash tests/*.test.js` y revisa cada prueba que cargue la tabla real y afirme un conteo, un id o un nombre. Cada archivo tiene un solo dueño: donde el `Owns` de la Tarea 8 usa un glob, ningún otro `Owns` toca un archivo que ese glob cubra.
- **Los tres textos de la prueba de ausencia** (la dirección de la API de Artificial Analysis, el nombre de su clave y el encabezado `x-api-key`; los fija la Tarea 9) no se escriben enteros en ningún archivo que esta construcción cree o reescriba fuera de `specs/`. Una prueba que los nombra los arma con `[…].join(…)`, como hace la prueba de ausencia; una que busca la palabra `fetch` usa `/\bfetch\b/`, porque `fetchedAt` es un campo de `pairs.json`.
- Fechas: una prueba nunca fija «hoy». Las cifras de la foto de 2026-11-13 entran a las pruebas del lector desde `specs/038-aa-pages-hydrogen/evidence/aa-extract-2026-11-13.json` (13 páginas ya leídas); las pruebas de las Tareas 6 y 7 leen la foto y las tablas que se envían.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] El lector único `scripts/aa-pages.js` y el formato de la foto, con sus pruebas → Task 1
- [ ] T002 [P] El piso de código para `implementer` en `plugins/aether/lib/superdelegation.js` y la validación de `code` en `plugins/aether/lib/pairs.js` → Task 2
- [ ] T003 `scripts/build-models-index.js` sin lista global, desde `harness-models.json`, `pairs.json`, `lanes.json`, `profiles.json` y la foto → Task 3
- [ ] T004 `scripts/refresh-lanes.js` sin red y sin clave, desde la foto → Task 4
- [ ] T005 Fuera `aa-api.js`, `aa-pages.js` y `aa-extract.js`; `SKILL.md` y `agent-prompt.md` del skill y el skill `new-harness` reescritos → Task 5
- [ ] T006 La pasada real por las páginas: la foto `plugins/aether/config/models/aa-pages.json` (el único paso con red) → Task 6
- [ ] T007 Las tablas desde la foto: `pairs.json` refrescado, Hydrogen entra, Flash sale y se declara reemplazado, `lanes.json`, `harness-models.json`, `profiles.json`, `prices.json`, `models.json` y `docs/models/README.md` → Task 7
- [ ] T008 Las pruebas que cargan las tablas reales, ajustadas a las tablas nuevas (se construye con la Tarea 7) → Task 8
- [ ] T009 La documentación, la decisión numerada, `AGENTS.md`, la prueba de ausencia y `tests/docs-032.test.js` → Task 9

### Task 1: El lector único de páginas y el formato de la foto (C2, C3, C8)

**Aether:**
- Area: aa-reader
- Owns: `scripts/aa-pages.js`, `tests/aa-pages.test.js`, `tests/aa-page-fixtures.js`, `tests/guards.test.js`
- Depends on: none
- Serves: C2, C3, C8

**Interfaces:**

`scripts/aa-pages.js` es CommonJS, no pide nada al cargarse (su `main` solo corre con `require.main === module`) y exporta:

```text
const PAGE_URL = 'https://artificialanalysis.ai/models/'
const PAUSE_MS = 1500            // pausa mínima entre dos peticiones
const TIMEOUT_MS = 30000         // por petición; se agota con AbortSignal.timeout
const SNAPSHOT_FILE              // path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json')
const FIGURES = ['intelligence', 'costPerTaskUsd', 'code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'terminalBench',
  'briefcaseElo', 'briefcaseRubricPassRate', 'hallucinationRate', 'timePerTaskSeconds', 'priceInput', 'priceOutput',
  'cacheReadPrice', 'outputTokensPerSecond', 'timeToFirstTokenS']   // el orden fijo de la tabla de Global Constraints

// El bloque de la página del propio modelo: el que empieza en el `"slug":"<slug>","name":"…","shortName":"…"` cuyo
// `"briefcaseBreakdown":{"overall":{"elo":` lo sigue más de cerca, hasta el siguiente inicio de modelo; nunca el primero de
// la página (una página trae los 27 modelos que compara). null cuando la página no tiene bloque para el slug.
// `figures` lleva solo las cifras que la página dio como número finito, ya redondeadas.
parsePage(html, slug)            // -> null | { name, figures: { [cifra]: number } }

// Pide cada página en orden, una petición por dirección, con `pause(pauseMs)` entre dos peticiones. Una página guardada
// en `cacheDir` (`<slug>.html`, solo las que dieron 200) se lee de ahí sin petición ni pausa. Una respuesta 403 o 429
// detiene la pasada: lanza `StopPass` (con `.status` y `.url`) y no se pide ninguna dirección posterior. Cualquier otra
// clase de fallo deja esa dirección sin leer:
//   { ok: false, cause: 'http 404' | 'http 503' | …  | 'network' | 'timeout' | 'no-block' | 'bad-slug', detail }
// y la pasada sigue. Una página leída: { ok: true, name, figures }.
// `report` (objeto opcional) cuenta `network` y `cached`.
async readPages(slugs, { fetch = globalThis.fetch, pause, pauseMs = PAUSE_MS, timeoutMs = TIMEOUT_MS, cacheDir = null, report = {} } = {})  // -> Map<slug, resultado>
class StopPass extends Error {}

// Pura: no muta `snapshot`. Para cada resultado ok escribe cada cifra dada con `{ value, on: today }`, conserva con su
// fecha anterior la que la página no trajo, pone `name` y `readOn: today`, salvo que el resultado no traiga ninguna cifra
// (entonces la dirección queda como estaba, `readOn` incluido). Los fallos no tocan la dirección.
mergeSnapshot(snapshot, results, today)  // -> { snapshot, summary: { written: [slug], missing: { [slug]: [cifra] }, failed: [{ slug, cause, detail }] } }
// `missing[slug]` lista las cifras de FIGURES que esa lectura no trajo (aunque la foto conserve un valor anterior).

serializeSnapshot(snapshot)      // -> el texto del archivo, en el formato común
loadSnapshot(file = SNAPSHOT_FILE)  // -> { pages: {} } cuando el archivo no existe (hasta que la Tarea 6 lo escribe); lanza si no es JSON o no tiene `pages`
slugsOf(pairsTable, { harness = null } = {})  // direcciones de las filas sin `estimateOf`, sin repetir, en el orden de la tabla;
                                              // con `harness`, las de ese harness y las de las filas `claude`

// main(argv, { fetch, pause, now, cacheDir }) -> Promise<{ exitCode, stdout }>
```

Orden: `node scripts/aa-pages.js read [slug …] [--harness <nombre>] [--snapshot <archivo>] [--pairs <archivo>] [--cache <carpeta>]`. Sin direcciones lee las de todas las filas de `pairs.json`; con `--harness` las de ese harness y las de Claude; con direcciones nombradas, solo esas. `--cache` por omisión es `path.join(os.tmpdir(), 'aether-aa-pages')`. Otro argumento: sale con 2 y escribe `usage: node scripts/aa-pages.js read [slug ...] [--harness <name>] [--snapshot <file>] [--pairs <file>] [--cache <dir>]`. Una dirección que no cumple `/^[a-z0-9.-]+$/` es `bad-slug`, sin petición. La petición lleva el `user-agent` `aether-plugin models reader (one request per model page, asked by its owner)` y ninguna clave.

Resumen de `main` (una línea por cosa, solo las que tienen contenido):

```text
Read <n> address(es): <w> written, <f> not read.
Written: <slug>, <slug>
Not read: <slug> (<cause>), <slug> (<cause>)
Missing fields: <slug>: <cifra>, <cifra>; <slug>: <cifra>
```

Un 403 o 429: `Artificial Analysis answered <status> for <url>: the pass stopped there, no later page was asked. Nothing was written.`, código 1, el archivo de la foto intacto (ni se crea). Otros fallos: las demás direcciones se escriben, el resumen nombra cada dirección sin leer con su causa y el código es 1. Sin fallos el código es 0. `main` no escribe el archivo cuando ninguna dirección se leyó.

`tests/aa-page-fixtures.js` (se queda con `block` y `page`) gana:

```js
// Una página con la forma de una real, hecha de una entrada de aa-extract.js ({ slug, name, shortName, scalars, objects, evals }):
// el inicio del modelo, sus escalares como "clave":valor, sus objetos como "clave":{…}, las evals como
// {"slug","score","outputTokensPerTask","costPerTask","timePerTask"} y el objeto briefcaseBreakdown después, comillas escapadas.
pageFromExtract(entry)
// Una foto en el formato común: pages = { '<slug>': { name?, readOn?, figures: { intelligence: 41.5, code: { value: 43.94, on: '2026-11-12' } } } }.
// `on` por omisión es '2026-11-13'. Una cifra dada como número toma la fecha `on`; una dada como { value, on } se copia.
// `readOn` de cada dirección es el que se da y, si no se da, `on`; `name` es el que se da y, si no se da, `Model <slug>` (el nombre
// que `block` pone a sus páginas). Devuelve { pages: { '<slug>': { readOn, name, figures } } }.
snapshotOf(pages, on = '2026-11-13')
```

El archivo `plugins/aether/config/models/aa-pages.json` **no se crea en esta tarea**: lo escribe la Tarea 6 con la pasada real, y mientras no exista `loadSnapshot` da la foto vacía. `tests/guards.test.js` (`R21`): el patrón `KEPT_EVIDENCE` gana la carpeta de esta función, `038-aa-pages-hydrogen\/evidence\/(README\.md|aa-extract-2026-11-13\.json)`, porque la evidencia que una spec nombra como fuente se queda rastreada (lo mismo que 032 y 036); hoy esa prueba está roja en esta rama.

**Tests (write first):**

`tests/aa-pages.test.js`, nuevo. Cada prueba falla hoy porque `scripts/aa-pages.js` no existe.

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { block, page, pageFromExtract, snapshotOf } = require('./aa-page-fixtures.js')
const reader = require('../scripts/aa-pages.js')

const EVIDENCE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'specs', '038-aa-pages-hydrogen', 'evidence', 'aa-extract-2026-11-13.json'), 'utf8'))
const OWN = { intelligence: 51.8421, cost: 3.4646622, code: 0.565656565656566, codeCost: 5.118905, seconds: 955.9325 }
const NEIGHBOUR = { intelligence: 10, cost: 9, code: 0.9, codeCost: 9, seconds: 9 }
const URL_OF = (slug) => `${reader.PAGE_URL}${slug}`
const ok = (html) => ({ ok: true, status: 200, text: async () => html })
const answer = (status) => ({ ok: false, status, text: async () => '' })
const NOW = () => new Date(2026, 10, 13, 12, 0, 0).getTime()

function setup(t, { pairs = null, snapshot = null } = {}) {
  const dir = tempDir(t, 'aether-aa-pages-')
  const files = { snapshot: path.join(dir, 'aa-pages.json'), pairs: path.join(dir, 'pairs.json'), cache: path.join(dir, 'cache') }
  if (snapshot) fs.writeFileSync(files.snapshot, reader.serializeSnapshot(snapshot))
  if (pairs) fs.writeFileSync(files.pairs, JSON.stringify({ fetchedAt: '2026-10-19', pairs }))
  return files
}
const run = (files, args, fetch, extra = {}) =>
  reader.main(['read', ...args, '--snapshot', files.snapshot, '--pairs', files.pairs, '--cache', files.cache], { fetch, pause: async () => {}, now: NOW, ...extra })
const read = (files) => JSON.parse(fs.readFileSync(files.snapshot, 'utf8'))
const row = (id, over = {}) => ({ id, slug: over.slug ?? id.replace(/[/@.]/g, '-'), harness: id.split('/')[0], ...over })

test('parsePage reads the block of the page\'s own model, never a neighbour\'s or the first of the page, rounded as the tables keep them', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN), block('claude-next-5-5', NEIGHBOUR))
  const found = reader.parsePage(html, 'claude-opus-5-5-high')
  assert.equal(found.name, 'Model claude-opus-5-5-high')
  assert.deepEqual(
    [found.figures.intelligence, found.figures.costPerTaskUsd, found.figures.code, found.figures.codeCostPerTaskUsd, found.figures.codeMinutesPerTask, found.figures.terminalBench, found.figures.briefcaseElo, found.figures.briefcaseRubricPassRate],
    [51.8, 3.465, 56.57, 5.119, 15.9, 0.566, 1100, 0.3])
  assert.equal(reader.parsePage(html, 'claude-missing-5-5'), null)
  // A figure the page does not carry is absent from `figures`, never null.
  assert.equal(Object.hasOwn(found.figures, 'priceInput'), false)
  assert.equal(Object.values(found.figures).every((value) => Number.isFinite(value)), true)
  // Without a Terminal-Bench eval the block has no code figure, and keeps the others.
  const noCode = reader.parsePage(page(block('claude-opus-5-5-high', OWN).replace('terminalbench-4-0', 'other-bench')), 'claude-opus-5-5-high')
  assert.deepEqual([Object.hasOwn(noCode.figures, 'code'), noCode.figures.intelligence], [false, 51.8])
})

test('parsePage reads every field of the 13 pages read on 2026-11-13, as the evidence table gives them', () => {
  const spot = {
    'gemini-4-hydrogen-medium': { intelligence: 41.2, costPerTaskUsd: 0.798, code: 29.29, terminalBench: 0.293, priceInput: 1.5, priceOutput: 7.5, cacheReadPrice: 0.075 },
    'gemini-4-hydrogen-high': { intelligence: 50.8, costPerTaskUsd: 1.873, code: 54.04, briefcaseElo: 1497, briefcaseRubricPassRate: 0.524 },
    'claude-haiku-5-5-high': { intelligence: 29.9, costPerTaskUsd: 0.159, code: 21.72 },
    'claude-opus-5-5-high': { intelligence: 51.8, costPerTaskUsd: 3.465, code: 56.57 },
  }
  for (const [slug, entry] of Object.entries(EVIDENCE)) {
    const found = reader.parsePage(pageFromExtract(entry), slug)
    assert.ok(found, slug)
    assert.equal(found.name, entry.name, slug)
    assert.equal(found.figures.intelligence, Math.round(entry.scalars.intelligenceIndex * 10) / 10, slug)
  }
  for (const [slug, expected] of Object.entries(spot)) {
    const figures = reader.parsePage(pageFromExtract(EVIDENCE[slug]), slug).figures
    for (const [key, value] of Object.entries(expected)) assert.equal(figures[key], value, `${slug} ${key}`)
  }
  // Argon medium has no Terminal-Bench eval on its page: no code figure, and the reader does not invent one.
  assert.equal(Object.hasOwn(reader.parsePage(pageFromExtract(EVIDENCE['gemini-4-argon-medium']), 'gemini-4-argon-medium').figures, 'code'), false)
})

test('a field the page does not bring keeps its previous value with its previous date, and the others of the same address take the new date', () => {
  const before = { pages: { a: { readOn: '2026-11-01', name: 'A', figures: { intelligence: { value: 40, on: '2026-11-01' }, code: { value: 30, on: '2026-11-01' } } } } }
  const copy = JSON.stringify(before)
  const results = new Map([['a', { ok: true, name: 'A (High)', figures: { intelligence: 41.2, priceInput: 1.5 } }]])
  const { snapshot, summary } = reader.mergeSnapshot(before, results, '2026-11-13')
  assert.deepEqual(snapshot.pages.a.figures.intelligence, { value: 41.2, on: '2026-11-13' })
  assert.deepEqual(snapshot.pages.a.figures.priceInput, { value: 1.5, on: '2026-11-13' })
  assert.deepEqual(snapshot.pages.a.figures.code, { value: 30, on: '2026-11-01' })
  assert.deepEqual([snapshot.pages.a.readOn, snapshot.pages.a.name], ['2026-11-13', 'A (High)'])
  assert.ok(summary.missing.a.includes('code') && !summary.missing.a.includes('intelligence'))
  assert.equal(JSON.stringify(before), copy, 'the snapshot given is not changed')
  // An address whose page gave no figure at all stays as it was, readOn included, and is named as missing everything.
  const empty = reader.mergeSnapshot(before, new Map([['a', { ok: true, name: 'A', figures: {} }]]), '2026-11-13')
  assert.deepEqual(empty.snapshot.pages.a, before.pages.a)
  assert.equal(empty.summary.missing.a.length, reader.FIGURES.length)
})

test('the file has one line per address, the addresses sorted, the figures in the fixed order, and is the same text every time', () => {
  const shot = { pages: {
    'b-model': { readOn: '2026-11-13', name: 'B', figures: { code: { value: 3, on: '2026-11-13' }, intelligence: { value: 4, on: '2026-11-13' } } },
    'a-model': { readOn: '2026-11-13', name: 'A', figures: { intelligence: { value: 1, on: '2026-11-13' } } },
  } }
  const text = reader.serializeSnapshot(shot)
  const lines = text.split('\n')
  assert.deepEqual([lines[0], lines[1], lines.at(-3), lines.at(-2), lines.at(-1)], ['{', '  "pages": {', '  }', '}', ''])
  assert.equal(lines.filter((line) => line.includes('"readOn"')).length, 2)
  assert.ok(lines.findIndex((line) => line.includes('"a-model"')) < lines.findIndex((line) => line.includes('"b-model"')))
  assert.ok(text.indexOf('"intelligence"', text.indexOf('"b-model"')) < text.indexOf('"code"', text.indexOf('"b-model"')))
  assert.equal(reader.serializeSnapshot(JSON.parse(text)), text)
})

test('a 403 or a 429 stops the pass: nothing is written, the address is named, and no later address is asked', async (t) => {
  for (const status of [403, 429]) {
    const files = setup(t)
    const asked = []
    const fetch = async (url) => {
      asked.push(url)
      return url === URL_OF('b') ? answer(status) : ok(page(block(url.split('/').pop(), OWN)))
    }
    const out = await run(files, ['a', 'b', 'c'], fetch)
    assert.equal(out.exitCode, 1)
    assert.deepEqual(asked, [URL_OF('a'), URL_OF('b')])
    assert.match(out.stdout, new RegExp(`answered ${status} for ${URL_OF('b').replace(/[.]/g, '\\.')}`))
    assert.match(out.stdout, /Nothing was written\./)
    assert.equal(fs.existsSync(files.snapshot), false)
  }
})

test('a 404, a 5xx, a network error, a timeout and a page with no block of the slug each leave that address unread and named with its cause, keep its values, write the others and end with a code other than zero', async (t) => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  const cases = [
    ['http 404', async () => answer(404)],
    ['http 503', async () => answer(503)],
    ['network', async () => { throw new TypeError('fetch failed') }],
    ['timeout', async () => { throw timeout }],
    ['no-block', async () => ok(page(block('some-other-model', OWN)))],
  ]
  for (const [cause, bad] of cases) {
    const previous = { pages: { bad: { readOn: '2026-11-01', name: 'Bad', figures: { intelligence: { value: 40, on: '2026-11-01' } } } } }
    const files = setup(t, { snapshot: previous })
    const fetch = async (url) => (url === URL_OF('bad') ? bad() : ok(page(block(url.split('/').pop(), OWN))))
    const out = await run(files, ['good-1', 'bad', 'good-2'], fetch)
    assert.equal(out.exitCode, 1, cause)
    assert.match(out.stdout, new RegExp(`Not read: bad \\(${cause}\\)`), cause)
    const written = read(files)
    assert.deepEqual(Object.keys(written.pages), ['bad', 'good-1', 'good-2'], cause)
    assert.deepEqual(written.pages.bad, previous.pages.bad, cause)
    assert.equal(written.pages['good-1'].figures.intelligence.value, 51.8, cause)
    assert.equal(written.pages['good-2'].readOn, '2026-11-13', cause)
  }
})

test('a run with no failure ends with code 0, names the fields the pages did not bring, and a second run writes the same bytes', async (t) => {
  const files = setup(t)
  const fetch = async (url) => ok(page(block(url.split('/').pop(), OWN)))
  const first = await run(files, ['a', 'b'], fetch)
  assert.equal(first.exitCode, 0, first.stdout)
  assert.match(first.stdout, /^Read 2 address\(es\): 2 written, 0 not read\./)
  assert.match(first.stdout, /Missing fields: a: .*priceInput/)
  const text = fs.readFileSync(files.snapshot, 'utf8')
  const second = await run(files, ['a', 'b'], fetch)
  assert.equal(second.exitCode, 0)
  assert.equal(fs.readFileSync(files.snapshot, 'utf8'), text)
})

test('one request per address with a pause of at least 1.5 s between two, a cached page costs no request and no pause, and no key is sent', async (t) => {
  const files = setup(t)
  const asked = []
  const pauses = []
  const fetch = async (url, options) => { asked.push([url, options]); return ok(page(block(url.split('/').pop(), OWN))) }
  await run(files, ['a', 'b', 'c'], fetch, { pause: async (ms) => pauses.push(ms) })
  assert.deepEqual(asked.map(([url]) => url), [URL_OF('a'), URL_OF('b'), URL_OF('c')])
  assert.deepEqual(pauses, [1500, 1500])
  for (const [, options] of asked) assert.equal(/key|authorization/i.test(JSON.stringify(options ?? {})), false)
  assert.match(asked[0][1].headers['user-agent'], /aether-plugin models reader/)
  const again = []
  await run(files, ['a', 'b', 'c'], async (url) => { again.push(url); return ok('') }, { pause: async (ms) => again.push(ms) })
  assert.deepEqual(again, [], 'the pages are in the cache folder: no request and no pause')
})

test('with no address it reads the rows of the pairs table that have a page, once each; with --harness, that harness and Claude; with names, only those', async (t) => {
  const pairs = [
    row('claude/haiku@high', { slug: 'claude-haiku-5-5-high' }),
    row('agy/claude-sonnet-5-5@high', { slug: 'claude-sonnet-5-5-high' }),
    row('agy/gemini-4-argon@high', { slug: 'gemini-4-argon' }),
    row('claude/sonnet@high', { slug: 'claude-sonnet-5-5-high' }),
    row('muse/muse-spark-1.3@low', { slug: 'muse-spark-1-3-low', estimateOf: 'claude/haiku@low' }),
    row('grok/grok-4.7@low', { slug: 'grok-4-7-low' }),
  ]
  const asked = []
  const fetch = async (url) => { asked.push(url.split('/').pop()); return ok(page(block(url.split('/').pop(), OWN))) }
  const files = setup(t, { pairs })
  await run(files, [], fetch)
  assert.deepEqual(asked, ['claude-haiku-5-5-high', 'claude-sonnet-5-5-high', 'gemini-4-argon', 'grok-4-7-low'])
  asked.length = 0
  await run(setup(t, { pairs }), ['--harness', 'agy'], fetch)
  assert.deepEqual(asked, ['claude-haiku-5-5-high', 'claude-sonnet-5-5-high', 'gemini-4-argon'])
  asked.length = 0
  await run(setup(t, { pairs }), ['gemini-4-hydrogen-low', 'gemini-4-hydrogen'], fetch)
  assert.deepEqual(asked, ['gemini-4-hydrogen-low', 'gemini-4-hydrogen'])
})

test('a bad argument prints the usage and exits 2, and a slug that is not a page address is not asked', async (t) => {
  const files = setup(t)
  const out = await reader.main(['read', '--nope'], { fetch: async () => { throw new Error('no request expected') } })
  assert.equal(out.exitCode, 2)
  assert.match(out.stdout, /^usage: node scripts\/aa-pages\.js read /)
  const asked = []
  const bad = await run(files, ['../etc/passwd'], async (url) => { asked.push(url); return ok('') })
  assert.deepEqual(asked, [])
  assert.match(bad.stdout, /Not read: \.\.\/etc\/passwd \(bad-slug\)/)
  assert.equal(bad.exitCode, 1)
})

test('snapshotOf dates a bare number with `on`, copies an { value, on } as given, and defaults readOn to `on` and name to `Model <slug>`', () => {
  const shot = snapshotOf({
    a: { figures: { intelligence: 41.5, code: { value: 43.94, on: '2026-11-12' } } },
    b: { readOn: '2026-11-10', name: 'B', figures: {} },
  })
  assert.deepEqual(shot.pages.a, { readOn: '2026-11-13', name: 'Model a', figures: { intelligence: { value: 41.5, on: '2026-11-13' }, code: { value: 43.94, on: '2026-11-12' } } })
  assert.deepEqual(shot.pages.b, { readOn: '2026-11-10', name: 'B', figures: {} })
  const other = snapshotOf({ a: { figures: { intelligence: 1 } } }, '2026-11-01').pages.a
  assert.deepEqual([other.readOn, other.figures.intelligence.on], ['2026-11-01', '2026-11-01'])
})
```

`tests/guards.test.js` queda verde con el cambio de arriba (corre `node --test tests/guards.test.js`).

**Acceptance:**

- `node --test tests/aa-pages.test.js tests/guards.test.js` en verde y luego `npm test` sin una falla nueva.
- `scripts/aa-pages.js` es el único archivo del árbol, junto con los tres lectores viejos que la Tarea 5 borra, que llama a `fetch` para una página de Artificial Analysis; los scripts `refresh-lanes.js` y `build-models-index.js` aún no cambian en esta tarea.
- El archivo de la foto no existe todavía (lo escribe la Tarea 6); `snapshotOf` tiene sus valores por omisión fijados por una prueba; ninguna prueba toca la red.

### Task 2: El código entra en la regla de elección (C7)

**Aether:**
- Area: selection
- Owns: `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/pairs.js`, `tests/superdelegation-code.test.js`
- Depends on: none
- Serves: C7

**Interfaces:**

En `plugins/aether/lib/superdelegation.js`:

- `choose` calcula, solo cuando `role === 'implementer'` y la fila de la referencia tiene `code` numérico, un piso de código `codeFloor = tenths(ref.code) - TOLERANCE_TENTHS` (décimas, como el de inteligencia); en cualquier otro caso `codeFloor = null`. Un supervisor, un revisor, un asiento de diseño y una llamada sin papel no cambian.
- El contexto de `firstBar` lleva `codeFloor` y `measureBar(pair, floor, codeFloor = null)` lo recibe: tras las dos salidas de hoy (`no-cost`, `below`), devuelve `'below-code'` cuando `codeFloor !== null`, `pair.code` es un número y `tenths(pair.code) < codeFloor`. Un par sin `code` numérico no se juzga por código.
- Las dos llamadas a `measureBar` lo pasan: la de `firstBar` y la de la razón de cuota seca (`dryOnly`), de modo que un par que solo queda fuera por su cuota seca y además no llega en código no hace decir «every quota with a pair that reaches … points is dry».
- La decisión dice el motivo. `candidates[].why` es `'below-code'` para el par que queda fuera por código, y `reason` gana, al final y solo cuando aplica, estas frases (las ya existentes no cambian de texto):
  - cuando algún par quedó fuera por código: `; below the code floor of <codeFloor/10> (the reference's code <ref.code> minus <TOLERANCE_POINTS>): <id>, <id>`;
  - cuando se elige un par sin `code` y el piso aplica: `; <picked.id> has no code figure, so it was judged by intelligence alone`.
- La dominancia y el orden (cuota que renueva antes, luego el más barato) no cambian.

En `plugins/aether/lib/pairs.js`, `validatePair`: en una fila externa, cuando `code` está presente debe ser un número de 0 a 100 (`code must be a number from 0 to 100`, el mismo texto que para Claude). La ausencia de `code` en una fila externa sigue válida.

**Tests (write first):**

`tests/superdelegation-code.test.js`, nuevo, con una tabla pequeña que no carga las tablas reales:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const claude = (model, effort, intelligence, code, cost = 1) => ({
  id: `claude/${model}@${effort}`, slug: `claude-${model}-${effort}`, harness: 'claude', model, family: `claude-${model}`, effort, group: null,
  intelligence, costPerTaskUsd: cost, outputTokensPerSecond: null, timeToFirstTokenS: null, code, codeCostPerTaskUsd: 1, codeMinutesPerTask: 1,
})
const ext = (effort, intelligence, cost, code) => ({
  id: `agy/m@${effort}`, slug: `m-${effort}`, harness: 'agy', model: 'm', family: 'm', effort, group: 'g',
  intelligence, costPerTaskUsd: cost, outputTokensPerSecond: null, timeToFirstTokenS: null,
  ...(code === undefined ? {} : { code, codeCostPerTaskUsd: 1, codeMinutesPerTask: 1 }),
})
const LANES = { harnesses: { agy: { models: { m: { roles: ['implementer', 'supervisor', 'reviewer', 'judge'] } } } } }
const view = (state) => ({ agy: { installed: true, groups: { g: state } } })
const OPEN = { usable: true, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
const DRY = { usable: false, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
// The reference: Sonnet high, 41.1 points and 43.94 in code, so the floors are 40.1 and 42.9.
const SONNET = claude('sonnet', 'high', 41.1, 43.94)
const ask = (rows, over = {}) => choose({ pairs: [SONNET, ...rows], reference: { model: 'sonnet', effort: 'high' }, harnesses: view(OPEN), lanes: LANES, role: 'implementer', ...over })
const why = (decision, id) => decision.candidates.find((c) => c.id === id).why

test('an implementer call leaves out a pair that reaches the points but not the code floor, and says why', () => {
  const decision = ask([ext('medium', 41.2, 0.5, 29.29), ext('high', 50.8, 1.8, 54.04)])
  assert.equal(decision.picked.id, 'agy/m@high')
  assert.equal(why(decision, 'agy/m@medium'), 'below-code')
  assert.match(decision.reason, /; below the code floor of 42\.9 \(the reference's code 43\.94 minus 1\): agy\/m@medium/)
})

test('the code floor is the code of the reference minus one point, in tenths: 42.9 passes and 42.8 does not', () => {
  assert.equal(why(ask([ext('medium', 45, 0.5, 42.9)]), 'agy/m@medium'), null)
  assert.equal(why(ask([ext('medium', 45, 0.5, 42.8)]), 'agy/m@medium'), 'below-code')
})

test('a pair with no code figure is judged by intelligence alone, and the reason says so', () => {
  const decision = ask([ext('medium', 45, 0.5)])
  assert.equal(decision.picked.id, 'agy/m@medium')
  assert.match(decision.reason, /; agy\/m@medium has no code figure, so it was judged by intelligence alone$/)
  // A pair with a code figure that passes carries no such phrase.
  assert.doesNotMatch(ask([ext('medium', 45, 0.5, 50)]).reason, /no code figure/)
})

test('when every pair is below the code floor the native pair takes the call, and the reason names the floor, not the quota', () => {
  const decision = ask([ext('medium', 45, 0.5, 20), ext('high', 50, 1.5, 30)])
  assert.equal(decision.picked, null)
  assert.match(decision.reason, /^native claude\/sonnet@high: no external pair is a candidate/)
  assert.match(decision.reason, /below the code floor of 42\.9/)
})

test('a pair that is below the code floor and in a dry quota does not make the reason say every quota that reaches the points is dry', () => {
  const onlyLow = ask([ext('medium', 45, 0.5, 20)], { harnesses: view(DRY) })
  assert.doesNotMatch(onlyLow.reason, /is dry/)
  const reaching = ask([ext('medium', 45, 0.5, 20), ext('high', 50, 1.5, 50)], { harnesses: view(DRY) })
  assert.match(reaching.reason, /every quota with a pair that reaches 40\.1 points is dry/)
})

test('a supervisor, a reviewer, a design seat (judge), a call with no role and a reference with no code are judged by intelligence alone', () => {
  const rows = [ext('medium', 41.2, 0.5, 29.29)]
  // The pair reaches the points and has 29.29 in code against a floor of 42.9: only an implementer call leaves it out.
  for (const role of ['supervisor', 'reviewer', 'judge', undefined]) {
    const decision = ask(rows, { role })
    assert.equal(decision.picked.id, 'agy/m@medium', String(role))
    assert.equal(why(decision, 'agy/m@medium'), null, String(role))
    assert.doesNotMatch(decision.reason, /code floor|code figure/, String(role))
  }
  const noCode = { ...SONNET }
  delete noCode.code
  assert.equal(choose({ pairs: [noCode, ...rows], reference: { model: 'sonnet', effort: 'high' }, harnesses: view(OPEN), lanes: LANES, role: 'implementer' }).picked.id, 'agy/m@medium')
})

test('loadPairs checks the code figure of an external row when it is there', (t) => {
  const dir = tempDir(t, 'aether-pairs-code-')
  const write = (row) => {
    const file = path.join(dir, 'pairs.json')
    fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-11-13', pairs: [SONNET, row] }))
    return file
  }
  assert.equal(loadPairs(write(ext('medium', 41.2, 0.5))).pairs.length, 2)
  assert.equal(loadPairs(write(ext('medium', 41.2, 0.5, 29.29))).pairs.length, 2)
  assert.throws(() => loadPairs(write(ext('medium', 41.2, 0.5, 120))), /agy\/m@medium\): code must be a number from 0 to 100/)
  assert.throws(() => loadPairs(write(ext('medium', 41.2, 0.5, -1))), /code must be a number from 0 to 100/)
})
```

(Una llamada sin papel no pasa por `allowsRole` y su piso de código es `null`: `choose` no lo calcula, como hoy lo hace con el supervisor.)

**Acceptance:**

- `node --test tests/superdelegation-code.test.js` en verde y, con la tabla real de hoy (sus filas externas no tienen `code`), todas las demás pruebas de `tests/` igual que antes: la regla no cambia ninguna elección mientras ninguna fila externa lleve `code`. Corre `npm test` y compara con la línea base.
- `measureBar` recibe `codeFloor`; las dos llamadas lo pasan; `lib/pairs.js` valida `code` de las filas externas.
- La decisión nunca omite el motivo: `below-code` en `candidates` y la frase en `reason`.

### Task 3: El índice de modelos sin lista global (C1, C3, C4)

**Aether:**
- Area: models-index
- Owns: `scripts/build-models-index.js`, `tests/models-index.test.js`, `tests/models-index-pages.test.js`, `tests/aa-free-endpoint.test.js`, `tests/fixtures/aa-language-free-2026-11-11.json`, `tests/codex-models.test.js`, `tests/copies-muse.test.js`, `tests/config-keys.test.js`
- Depends on: Task 1 — la foto, su formato y `loadSnapshot` de `scripts/aa-pages.js` son lo que el índice lee
- Serves: C1, C3, C4

**Interfaces:**

`scripts/build-models-index.js` deja de leer la API y de importar de `refresh-lanes.js` y del skill. Salen `MODELS_URL`, `MAX_PAGES`, la paginación, `readFreePages`, `savedPages`, `modelsOf`, `fillFromPages`, `pagesSummary`, `groupFamilies`, `familyKey`, `findFamily`, las banderas `--from`, `--since`, `--pages` y `--cache`, y el parámetro `fetch` de `main`. Ninguna función del script recibe `fetch`. Quedan `HARNESSES`, `DEFAULT_HARNESSES`, `LEVELS`, `ORDER`, `CAPTURE`, `README_START`, `README_END`, `serialize`, `splitId`, `harnessEntries` (misma firma y misma salida), `missingProfiles`, `missingListings`, `badListings`, `readProfiles`, `mergeReadme`, `renderGenerated`.

Orden: `node scripts/build-models-index.js [--harnesses claude,agy,grok] [--profiles <archivo>] [--write] [--lanes <lanes.json>] [--pairs <pairs.json>] [--harness <archivo>] [--snapshot <aa-pages.json>] [--out <carpeta>] [--docs <carpeta>]`. `--snapshot` por omisión es `plugins/aether/config/models/aa-pages.json`. Una bandera retirada (`--from`, `--since`, `--pages`, `--cache`) o desconocida: sale con 2 y escribe el uso:

```text
usage: node scripts/build-models-index.js [--harnesses claude,agy,grok] [--profiles <file>] [--write] [--lanes <lanes.json>] [--pairs <pairs.json>] [--harness <file>] [--snapshot <aa-pages.json>] [--out <dir>] [--docs <dir>]
```

`main(argv, { now } = {})` es síncrono y devuelve `{ exitCode, stdout }`.

```text
// El índice, puro: ninguna función lee un archivo ni la red.
buildIndex({ lanes, harnessModels, pairs, snapshot, harnesses = DEFAULT_HARNESSES, generatedAt = null })
```

Reglas del índice (cada una con una prueba abajo):

1. **Modelos en uso.** Un modelo es lo que `harness-models.json` lista (con `harnessEntries`) para los harnesses elegidos, menos lo que el mismo archivo declara `excluded` (texto, como hoy), `superseded` u `outOfScope` (mapas de Global Constraints). Un modelo que el carril nombra y el CLI no lista sigue yendo a `notOffered`, como hoy.
2. **Esfuerzos y cifras.** Para cada esfuerzo que el harness toma para ese modelo, la fila de `pairs.json` de (harness, modelo o su `alias`, esfuerzo) da la dirección (`slug`); la cifra sale de `snapshot.pages[slug].figures`. Una puntuación es `{ effort, intelligence, terminalBench?, priceInput, priceOutput, tokensPerSecond, ttftSeconds }` con `null` donde la foto no tiene la cifra (`terminalBench` se omite cuando falta, como hoy); `tokensPerSecond` sale de `outputTokensPerSecond` y `ttftSeconds` de `timeToFirstTokenS`. Un esfuerzo sin fila o sin dirección en la foto no tiene puntuación. Un modelo sin ninguna puntuación va a `withoutFigures` (con el `note` de hoy) y el resumen lo nombra.
3. **Ficha.** `family` es el id del modelo en minúsculas con los puntos cambiados por guiones (`gemini-4-hydrogen`); el perfil se busca con `profileOf(family)` como hoy; `name` y `maker` salen del perfil (`name` por omisión es el id); `released` sale del campo `released` del perfil y se omite si no lo hay.
4. **Reemplazados y fuera de alcance.** `models.json.superseded` es `[{ harness, id, supersededBy, on, reason, figures? }]` y `outOfScope` es `[{ harness, model, reason, on }]`, ordenados por harness (el orden de `HARNESSES`) y luego por id; salen de lo declarado, no de ninguna lista. Un reemplazado no entra en `models` pero conserva su perfil en el README. `badListings` valida lo declarado y devuelve, para cada fallo, una línea `<harness> declares <seccion> <id> in harness-models.json with no <campo>: …` (campos: `on` con forma `AAAA-MM-DD`, `reason` no vacío, y `by` en `superseded`); el código de salida es 1.
5. **Campos del archivo.** `models.json` ya no lleva `since`. `source` es `plugins/aether/config/models/aa-pages.json, from the model pages https://artificialanalysis.ai/models/<slug>`. `generatedAt` es la `readOn` más reciente de la foto (`null` si no hay ninguna). `rules` conserva sus tres claves y su orden; `newest` pasa a decir `Only the newest generation of each line is used (Sonnet 5.5, not Sonnet 5): an older one is declared superseded in harness-models.json, with its reason and date.` Los modelos salen ordenados por harness (orden de `HARNESSES`) y luego por id.
6. **Resumen** (líneas, solo las que tienen contenido; las pruebas fijan los fragmentos subrayados):
   - `<n> models in use (<v> scores) from <harnesses>.`
   - `Offered by harness: claude 3, agy 4, ….`
   - `Listed with no pair row and no photo (<n>): <harness>/<modelo>, ….` (es el aviso del diseño: «el modelo listado que no tiene fila ni foto»).
   - `Declared superseded (<n>): <harness>/<id> by <sucesor>, ….`
   - `Declared out of scope (<n>): ….`
   - `Named by the lane table and not offered (<n>): ….`
   - `Offered and excluded by the owner (<n>): ….`
   - `Without a profile (<n>): …` como hoy, con código 1.
7. **README.** La parte generada dice `Generated on <generatedAt> from <source>; the harnesses' listings are of …`. Esta tarea no toca `docs/models/README.md`: su parte escrita a mano (hasta `<!-- models-index:start -->`) la reescribe la Tarea 7, que también regenera la parte generada.

`tests/codex-models.test.js`: se quita la prueba «the script, run on the saved AA list, reproduces the committed Codex records» (usaba `--from`; `tests/models-index-shipped.test.js` de la Tarea 7 reconstruye el índice enviado byte a byte y la cubre) y se quita de su comentario la referencia al dato `tests/fixtures/codex/aa-api-2026-10-29.json`, que borra la Tarea 8. Las tablas fijas `POINTS` y `TERMINAL` y la aserción `29.6` de Haiku (cifras del 2026-10-29 que la Tarea 7 mueve al regenerar el índice) se reemplazan por una comparación con la tabla: la `intelligence` de cada puntuación de Codex es la de su fila `codex/<modelo>@<esfuerzo>` de `pairs.json` (con `loadPairs()`), `terminalBench` es un número entre 0 y 1 en cada puntuación, y la de Haiku `high` es la de la fila `claude/haiku@high`; así la prueba vale con el índice de hoy y con el regenerado. Si con el índice de hoy alguna cifra no coincide con su fila, la tarea compara solo lo que coincide, lo informa en su mensaje final, y la Tarea 7 vuelve a mirarlo. Si otra prueba fuera de `Owns` importa una función que esta tarea borra, se informa en el mensaje final.

`tests/copies-muse.test.js`: la lista de claves de `models.json` pierde `'since'` y la comparación de claves del archivo enviado lo tolera mientras el archivo de hoy aún lo lleva (`Object.keys(json(file)).filter((key) => key !== 'since').sort()` para `models.json`); la Tarea 7 regenera el archivo sin `since` y `tests/models-index-shipped.test.js` afirma que ya no está.

**Tests (write first):**

`tests/models-index.test.js` se reescribe sobre la forma nueva; se conserva todo lo que no depende de la lista (`serialize`, `splitId`, `harnessEntries`, `badListings` de flags, `mergeReadme`, `renderGenerated`, las columnas de la tabla, el README corto) y se cambian las pruebas que construían familias desde la lista. Los casos nuevos, completos:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { snapshotOf } = require('./aa-page-fixtures.js')
const builder = require('../scripts/build-models-index.js')

const NOW = () => new Date(2026, 10, 13, 12, 0, 0).getTime()
const PROFILE = (name, over = {}) => ({ name, maker: 'Acme', purpose: 'What the maker says it is for.', contextTokens: 1000000, maxOutputTokens: 65536, defaultEffort: null, price: { input: 1, output: 2 }, knowledgeCutoff: null, availability: 'Everywhere.', caveats: [], sources: ['https://example.test'], checked: '2026-11-13', ...over })
const pair = (harness, model, effort, slug, over = {}) => ({ id: `${harness}/${model}@${effort}`, slug, harness, model, family: model, effort, group: harness === 'claude' ? null : harness, intelligence: 40, costPerTaskUsd: 1, outputTokensPerSecond: null, timeToFirstTokenS: null, ...over })
const SNAPSHOT = snapshotOf({
  'acme-1-medium': { name: 'Acme 1 (Medium)', figures: { intelligence: 41.2, terminalBench: 0.293, priceInput: 1.5, priceOutput: 7.5, outputTokensPerSecond: 90 } },
  'acme-1-high': { name: 'Acme 1 (High)', figures: { intelligence: 50.8, terminalBench: 0.54, priceInput: 1.5, priceOutput: 7.5 } },
})

// The inputs of a build, as files in a folder, and the folders it writes to.
function work(t, { listings, pairs = [], snapshot = SNAPSHOT, profiles, lanes = { harnesses: {} } } = {}) {
  const dir = tempDir(t, 'aether-index-')
  const write = (name, value) => { fs.writeFileSync(path.join(dir, name), JSON.stringify(value)); return path.join(dir, name) }
  const files = {
    lanes: write('lanes.json', lanes),
    pairs: write('pairs.json', { fetchedAt: '2026-11-13', pairs }),
    harness: write('harness-models.json', listings),
    profiles: write('profiles.json', { profiles }),
    snapshot: write('aa-pages.json', snapshot),
  }
  fs.mkdirSync(path.join(dir, 'out'))
  fs.mkdirSync(path.join(dir, 'docs'))
  fs.writeFileSync(path.join(dir, 'docs', 'README.md'), '# Models\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n')
  const args = (extra = []) => ['--lanes', files.lanes, '--pairs', files.pairs, '--harness', files.harness, '--profiles', files.profiles, '--snapshot', files.snapshot, '--harnesses', 'agy', '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), ...extra]
  return { dir, files, args }
}
const AGY = (extra = {}) => ({ capturedAt: '2026-11-13', harnesses: { agy: { listedBy: 'agy models', effortVia: 'id', models: ['acme-1-medium', 'acme-1-high'], ...extra } } })
const ROWS = [pair('agy', 'acme-1', 'medium', 'acme-1-medium'), pair('agy', 'acme-1', 'high', 'acme-1-high')]
const built = (w) => JSON.parse(fs.readFileSync(path.join(w.dir, 'out', 'models.json'), 'utf8'))

test('the index has no flag for the API, a saved answer, a date or the pages: each one is a usage error', (t) => {
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
  for (const flag of [['--from', 'x.json'], ['--since', '2026-01-01'], ['--pages'], ['--cache', 'x']]) {
    const out = builder.main(w.args(flag), { now: NOW })
    assert.equal(out.exitCode, 2, flag.join(' '))
    assert.match(out.stdout, /^usage: node scripts\/build-models-index\.js \[--harnesses /)
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-models-index.js'), 'utf8')
  const KEY_HEADER = ['x', 'api', 'key'].join('-') // built from pieces: the absence test of Task 9 searches the tree for it
  assert.equal(/\bfetch\b/.test(source), false, 'fetch')
  for (const gone of ['MODELS_URL', KEY_HEADER, 'keyFrom', 'refresh-lanes', 'aa-api']) assert.equal(source.includes(gone), false, gone)
})

test('the models in use are the listed ones, with the efforts of their pair rows and the figures of the photo', (t) => {
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1', { released: '2026-11-12' }) } })
  const out = builder.main(w.args(['--write']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.equal(file.source, 'plugins/aether/config/models/aa-pages.json, from the model pages https://artificialanalysis.ai/models/<slug>')
  assert.equal(Object.hasOwn(file, 'since'), false)
  assert.equal(file.generatedAt, '2026-11-13')
  const [entry] = file.models
  assert.deepEqual([entry.harness, entry.model, entry.family, entry.name, entry.maker, entry.released], ['agy', 'acme-1', 'acme-1', 'Acme 1', 'Acme', '2026-11-12'])
  assert.deepEqual(entry.efforts, ['medium', 'high'])
  assert.deepEqual(entry.scores[0], { effort: 'medium', intelligence: 41.2, terminalBench: 0.293, priceInput: 1.5, priceOutput: 7.5, tokensPerSecond: 90, ttftSeconds: null })
  assert.deepEqual(entry.scores.map((s) => s.effort), ['medium', 'high'])
  assert.match(out.stdout, /^1 models in use \(2 scores\) from agy\./)
})

test('an effort the harness takes and no row asks for has no score, and a model with no score is listed with no figures and named in the summary', (t) => {
  const listings = AGY({ models: ['acme-1-medium', 'acme-1-low', 'orphan-high'] })
  const w = work(t, { listings, pairs: [ROWS[0]], profiles: { 'acme-1': PROFILE('Acme 1'), orphan: PROFILE('Orphan') } })
  const out = builder.main(w.args(['--write']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.deepEqual(file.models[0].scores.map((s) => s.effort), ['medium'])
  assert.deepEqual(file.withoutFigures.map((e) => [e.harness, e.model, e.note]), [['agy', 'orphan', 'offered, with no Artificial Analysis entry, so no figures; not a lane: the lane table does not list it']])
  assert.match(out.stdout, /Listed with no pair row and no photo \(1\): agy\/orphan\./)
})

test('a model declared superseded or out of scope is not in use, and models.json and the README say so with the reason and the date', (t) => {
  const listings = AGY({
    models: ['acme-1-medium', 'old-1-high', 'tiny-1-medium'],
    superseded: { 'old-1': { by: 'acme-1', on: '2026-11-13', reason: 'Replaced by Acme 1.', figures: 'Old 1 high 30.8 on 2026-11-13 against Acme 1 medium 41.2.' } },
    outOfScope: { 'tiny-1': { on: '2026-11-13', reason: 'Not a model Aether considers.' } },
  })
  const w = work(t, { listings, pairs: [ROWS[0], pair('agy', 'old-1', 'high', 'old-1-high')], profiles: { 'acme-1': PROFILE('Acme 1'), 'old-1': PROFILE('Old 1') } })
  const out = builder.main(w.args(['--write']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.deepEqual(file.models.map((e) => e.model), ['acme-1'])
  assert.deepEqual(file.superseded, [{ harness: 'agy', id: 'old-1', supersededBy: 'acme-1', on: '2026-11-13', reason: 'Replaced by Acme 1.', figures: 'Old 1 high 30.8 on 2026-11-13 against Acme 1 medium 41.2.' }])
  assert.deepEqual(file.outOfScope, [{ harness: 'agy', model: 'tiny-1', reason: 'Not a model Aether considers.', on: '2026-11-13' }])
  assert.match(out.stdout, /Declared superseded \(1\): agy\/old-1 by acme-1\./)
  const readme = fs.readFileSync(path.join(w.dir, 'docs', 'README.md'), 'utf8')
  assert.match(readme, /Superseded, not to be used: agy `old-1` by `acme-1`/)
  assert.match(readme, /Generated on 2026-11-13 from plugins\/aether\/config\/models\/aa-pages\.json, from the model pages/)
})

test('a declaration without its date, its reason or its successor is refused, naming the model, and nothing is written', (t) => {
  for (const [section, entry, field] of [
    ['superseded', { by: 'acme-1', reason: 'r' }, 'on'],
    ['superseded', { by: 'acme-1', on: '2026-11-13' }, 'reason'],
    ['superseded', { on: '2026-11-13', reason: 'r' }, 'by'],
    ['outOfScope', { on: '13/11/2026', reason: 'r' }, 'on'],
  ]) {
    const w = work(t, { listings: AGY({ [section]: { 'old-1': entry } }), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
    const out = builder.main(w.args(['--write']), { now: NOW })
    assert.equal(out.exitCode, 1, `${section} ${field}`)
    assert.match(out.stdout, new RegExp(`agy declares ${section} old-1 in harness-models\\.json with no ${field}`))
    assert.equal(fs.existsSync(path.join(w.dir, 'out', 'models.json')), false)
  }
})

test('a model in use with no profile is listed and the exit code is 1; and two builds from the same inputs write the same files', (t) => {
  const bare = work(t, { listings: AGY(), pairs: ROWS, profiles: {} })
  const out = builder.main(bare.args(), { now: NOW })
  assert.equal(out.exitCode, 1)
  assert.match(out.stdout, /Without a profile \(1\): acme-1\./)
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
  builder.main(w.args(['--write']), { now: NOW })
  const first = [fs.readFileSync(path.join(w.dir, 'out', 'models.json'), 'utf8'), fs.readFileSync(path.join(w.dir, 'docs', 'README.md'), 'utf8')]
  builder.main(w.args(['--write']), { now: () => NOW() + 3 * 24 * 3600 * 1000 })
  assert.deepEqual([fs.readFileSync(path.join(w.dir, 'out', 'models.json'), 'utf8'), fs.readFileSync(path.join(w.dir, 'docs', 'README.md'), 'utf8')], first)
})

test('the native harness maps an alias to its pair rows, and the page of the max effort is the model slug without a suffix', (t) => {
  const listings = { capturedAt: '2026-11-13', harnesses: { claude: { listedBy: 'claude --help', effortVia: 'flag', efforts: ['high', 'max'], models: [{ id: 'acme-5', alias: 'acme' }] } } }
  const snapshot = snapshotOf({ 'acme-5-high': { figures: { intelligence: 30 } }, 'acme-5': { figures: { intelligence: 36.2, terminalBench: 0.328 } } })
  const w = work(t, { listings, snapshot, pairs: [pair('claude', 'acme', 'high', 'acme-5-high'), pair('claude', 'acme', 'max', 'acme-5')], profiles: { 'acme-5': PROFILE('Acme 5') } })
  const out = builder.main(w.args(['--write', '--harnesses', 'claude']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  assert.deepEqual(built(w).models[0].scores.map((s) => [s.effort, s.intelligence]), [['high', 30], ['max', 36.2]])
})
```

`tests/models-index-pages.test.js` se reescribe para decir lo que sigue valiendo: el `terminalBench` de `models.json` sale de la foto (una fila cuya dirección está en la foto con `terminalBench` lo lleva; sin él, `models.json` no lo escribe), con las fotos de `snapshotOf`, sin `fetch` ni páginas guardadas. `tests/aa-free-endpoint.test.js` y su dato `tests/fixtures/aa-language-free-2026-11-11.json` se borran. `tests/models-index.test.js` pierde además la prueba que copia `aa-api.js` a un árbol de prueba (línea ~992) y la que compara el `models.json` enviado con una reconstrucción (la Tarea 7 la vuelve a escribir con los datos finales).

Las pruebas de los archivos enviados (`readCommitted`) siguen y deben valer con el archivo de hoy **y** con el que regenera la Tarea 7: afirman la forma (claves, un perfil por modelo, orden, README corto) y no una lista de modelos, una cifra ni la presencia de `since`, de `superseded` o de `outOfScope` deducidos; lo que fija un modelo o una cifra concreta lo fija `tests/models-index-shipped.test.js` de la Tarea 7. La afirmación `fs.readdirSync(CONFIG).sort()` de «the committed models.json and README are in the shape the script writes» (línea ~740) pasa a `fs.readdirSync(CONFIG).filter((name) => name !== 'aa-pages.json').sort()` igual a `['harness-models.json', 'models.json', 'profiles.json']`: el archivo de la foto lo crea la Tarea 6 y `tests/aa-snapshot-shipped.test.js` lo fija.

**Acceptance:**

- `node --test tests/models-index.test.js tests/models-index-pages.test.js tests/codex-models.test.js tests/copies-muse.test.js tests/copies-harness-config.test.js tests/new-harness-skill.test.js tests/config-keys.test.js` en verde, y `npm test` sin una falla nueva.
- `scripts/build-models-index.js` no nombra ya la API, la clave ni `x-api-key`; `models.json` y `docs/models/README.md` enviados todavía los llevan (los regenera la Tarea 7) y las pruebas de los archivos enviados valen con ambos estados.
- El script no importa `scripts/refresh-lanes.js` ni nada de `.claude/skills/artificial-analysis/`; solo lee `loadSnapshot` de `scripts/aa-pages.js`.
- Dos corridas seguidas con las mismas entradas dan los mismos archivos.

### Task 4: `refresh-lanes.js` sin red y sin clave, desde la foto (C1, C3)

**Aether:**
- Area: refresh
- Owns: `scripts/refresh-lanes.js`, `tests/refresh-lanes.test.js`
- Depends on: Task 1 — la foto y `loadSnapshot` son su única fuente
- Depends on: Task 3 — `scripts/build-models-index.js` deja de importar `keyFrom`, `keyFile`, `envFileFor` y `KEY` de este archivo; hasta entonces borrarlos lo rompería
- Serves: C1, C3

**Interfaces:**

`scripts/refresh-lanes.js`: desaparecen `keyFrom`, `keyFile`, `envFileFor`, `KEY`, `unquote`, el `require` de `os`, el `require` del skill (`aa-api.js`) y los parámetros `fetch` y `pause` de `main`. `module.exports = { main }`. `main(argv, { now = Date.now } = {})` es síncrono y devuelve `{ exitCode, stdout }`. Orden: `node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--snapshot <path>] [--write]` (`--snapshot` por omisión es la foto enviada, `loadSnapshot()`); el uso es `usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--snapshot <path>] [--write]`.

Reglas (las de hoy, salvo lo marcado):

- Las filas con página son las que no tienen `estimateOf`; cada una toma sus cifras de `snapshot.pages[row.slug].figures`. Las filas con `estimateOf` siguen a su referencia (`intelligence = ref + estimateDistance`, redondeado a una décima) como hoy.
- `intelligence` y `checked`: cuando la foto tiene `intelligence` de la dirección, la fila toma el valor y `checked` toma **la fecha `on` de esa cifra** (ya no la de hoy). `costPerTaskUsd` solo se actualiza cuando la fila ya tiene un número y la foto trae la cifra; un `null` de la fila se queda `null` (decisión del dueño, Muse).
- Código: `code`, `codeCostPerTaskUsd`, `codeMinutesPerTask` se escriben **en toda fila cuya dirección dé las tres cifras, también las externas**, y `codeChecked` toma la fecha `on` de la cifra `code`. Si la foto no tiene las tres, la fila conserva sus campos de código y el resumen dice `<id>: the page of <slug> has no code figure`.
- Una fila cuya dirección no está en la foto: `<id>: the snapshot has no page for <slug>: run node scripts/aa-pages.js read <slug>`, la fila queda intacta y el código de salida es 1; las demás filas se parchean.
- El resumen lista los cambios `<id>: <campo> <antes> → <después>` o `No figure changed.`, y avisa cuando las filas de un harness y las de Claude se leyeron en días distintos: por cada harness distinto de `claude` con páginas, si la `readOn` más reciente de sus direcciones no es la de las direcciones de las filas de Claude, la línea `Read dates differ: <harness> was read on <fecha>, claude on <fecha>.`
- La escalera se recalcula y se compara, nunca se escribe: las líneas `Recalculated ladder: …`, `Stored ladder: unchanged` o `Stored ladder: changed` y su detalle, y `The stored ladder was not written: to approve the recalculated one, edit <ruta> in a commit.` son las de hoy. `--write` parchea `pairs.json` con `patchPairsText` (una fila por línea, como hoy) y escribe `written to <ruta>` solo si el texto cambió.

**Tests (write first):**

`tests/refresh-lanes.test.js` se reescribe: cada prueba que armaba un `fetch` y páginas usa ahora un archivo de foto hecho con `snapshotOf` de `tests/aa-page-fixtures.js` y llama `main([...])` sin `await` ni `fetch`. Se conservan, con la foto en lugar de las páginas, las pruebas de hoy sobre: el parche en su sitio de cada fila con página, `--write` y no escribir sin él, el cambio de la escalera mostrado sin escribirla, una página sin figura de código (los campos de código quedan como estaban y la inteligencia sí se actualiza), la estimación de Muse que sigue a su referencia (una escala de Claude 0.3 más alta mueve la estimación y mantiene su escalón), el parche de un último campo numérico (espacio antes de `}`) y que `--write` sin cambios no escribe `written to`, y una página sin `intelligence` que deja el `checked` anterior. Pruebas nuevas, completas:

```js
const { main } = require('../scripts/refresh-lanes.js')
const { snapshotOf } = require('./aa-page-fixtures.js')

test('the script asks nothing of the network and holds no key: no fetch, no key reader, and main is the only export', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'refresh-lanes.js'), 'utf8')
  // Two of the texts are built from pieces: the absence test of Task 9 searches the tree for them whole.
  const KEY_NAME = ['ARTIFICIAL_ANALYSIS', 'API', 'KEY'].join('_')
  const KEY_HEADER = ['x', 'api', 'key'].join('-')
  assert.equal(/\bfetch\b/.test(source), false, 'fetch')
  for (const gone of [KEY_NAME, 'keyFrom', 'keyFile', 'envFileFor', KEY_HEADER, 'aa-api']) assert.equal(source.includes(gone), false, gone)
  assert.deepEqual(Object.keys(require('../scripts/refresh-lanes.js')), ['main'])
})

test('checked is the date of the intelligence figure and codeChecked the date of the code figure, each from the photo and not from today', (t) => {
  const files = setup(t, [haikuHigh]) // a Claude row, the one of the older tests, with figures of 2026-11-10
  const shot = snapshotOf({ 'claude-haiku-5-5-high': { figures: { intelligence: { value: 29.9, on: '2026-11-13' }, costPerTaskUsd: { value: 0.159, on: '2026-11-13' }, code: { value: 21.72, on: '2026-11-12' }, codeCostPerTaskUsd: { value: 0.331, on: '2026-11-12' }, codeMinutesPerTask: { value: 12.3, on: '2026-11-12' } } } })
  writeSnapshot(files, shot)
  const out = main(['--pairs', files.pairs, '--ladder', files.ladder, '--snapshot', files.snapshot, '--write'], { now: () => Date.UTC(2030, 0, 1) })
  assert.equal(out.exitCode, 0, out.stdout)
  const written = rowsOf(files)[0]
  assert.deepEqual([written.intelligence, written.checked, written.codeMinutesPerTask, written.codeChecked], [29.9, '2026-11-13', 12.3, '2026-11-12'])
})

test('an external row whose page gives the code figures gets them, with their date', (t) => {
  const files = setup(t, [argonHigh]) // agy/gemini-4-argon@high, no code fields yet
  writeSnapshot(files, snapshotOf({ 'gemini-4-argon': { figures: { intelligence: 50.4, costPerTaskUsd: 4.973, code: 57.07, codeCostPerTaskUsd: 6.78, codeMinutesPerTask: 42.7 } } }))
  const out = run(files, ['--write'])
  assert.equal(out.exitCode, 0, out.stdout)
  const written = rowsOf(files)[0]
  assert.deepEqual([written.code, written.codeCostPerTaskUsd, written.codeMinutesPerTask, written.codeChecked], [57.07, 6.78, 42.7, '2026-11-13'])
})

test('a row whose address is not in the photo is named with the command that reads it, keeps its figures and ends the run with 1, and the other rows are patched', (t) => {
  const files = setup(t, [haikuHigh, argonHigh])
  writeSnapshot(files, snapshotOf({ 'claude-haiku-5-5-high': { figures: { intelligence: 29.9 } } }))
  const before = rowsOf(files)[1]
  const out = run(files, ['--write'])
  assert.equal(out.exitCode, 1)
  assert.match(out.stdout, /agy\/gemini-4-argon@high: the snapshot has no page for gemini-4-argon: run node scripts\/aa-pages\.js read gemini-4-argon/)
  assert.deepEqual(rowsOf(files)[1], before)
  assert.equal(rowsOf(files)[0].intelligence, 29.9)
})

test('the summary warns when the rows of a harness were read on another day than the Claude rows', (t) => {
  const files = setup(t, [haikuHigh, argonHigh])
  writeSnapshot(files, snapshotOf({
    'claude-haiku-5-5-high': { readOn: '2026-11-13', figures: { intelligence: 29.9 } },
    'gemini-4-argon': { readOn: '2026-11-12', figures: { intelligence: 50.4 } },
  }))
  assert.match(run(files, []).stdout, /Read dates differ: agy was read on 2026-11-12, claude on 2026-11-13\./)
  writeSnapshot(files, snapshotOf({ 'claude-haiku-5-5-high': { figures: { intelligence: 29.9 } }, 'gemini-4-argon': { figures: { intelligence: 50.4 } } }))
  assert.doesNotMatch(run(files, []).stdout, /Read dates differ/)
})

test('two runs in a row with --write leave the same file, and the second says no figure changed', (t) => {
  const files = setup(t, [haikuHigh, argonHigh])
  writeSnapshot(files, snapshotOf({ 'claude-haiku-5-5-high': { figures: { intelligence: 29.9, costPerTaskUsd: 0.159, code: 21.72, codeCostPerTaskUsd: 0.331, codeMinutesPerTask: 12.3 } }, 'gemini-4-argon': { figures: { intelligence: 50.4, costPerTaskUsd: 4.973 } } }))
  run(files, ['--write'])
  const text = fs.readFileSync(files.pairs, 'utf8')
  const second = run(files, ['--write'])
  assert.match(second.stdout, /^No figure changed\./)
  assert.equal(fs.readFileSync(files.pairs, 'utf8'), text)
})
```

(`setup`, `run`, `writeSnapshot`, `rowsOf`, `haikuHigh` y `argonHigh` son los ayudantes del archivo: `setup(t, rows)` escribe `pairs.json` con una fila por línea y `ladder.json` con la ley real; `run(files, extra)` llama `main` con `--pairs`, `--ladder` y `--snapshot`; los define la tarea tomando como modelo los de hoy.)

**Acceptance:**

- `node --test tests/refresh-lanes.test.js tests/build-models-index.test.js tests/models-index.test.js tests/docs-032.test.js` en verde (el segundo nombre solo si existe) y `npm test` sin una falla nueva.
- `scripts/refresh-lanes.js` no contiene `fetch`, la clave ni sus funciones, y exporta solo `main`; dos corridas seguidas dan el mismo archivo; el archivo de pruebas no escribe entero ninguno de los tres textos de la Tarea 9.
- `tests/docs-032.test.js` aún fija el texto de los documentos (lo cambia la Tarea 9); esta tarea no lo toca.

### Task 5: Fuera los tres lectores del skill; el skill y `new-harness` reescritos (C1, C2)

**Aether:**
- Area: skills
- Owns: `.claude/skills/artificial-analysis/aa-api.js`, `.claude/skills/artificial-analysis/aa-pages.js`, `.claude/skills/artificial-analysis/aa-extract.js`, `.claude/skills/artificial-analysis/SKILL.md`, `.claude/skills/artificial-analysis/agent-prompt.md`, `.claude/skills/new-harness/SKILL.md`, `tests/aa-api.test.js`, `tests/aa-single-reader.test.js`, `tests/new-harness-skill.test.js`
- Depends on: Task 3 — `scripts/build-models-index.js` ya no importa `aa-api.js`
- Depends on: Task 4 — `scripts/refresh-lanes.js` ya no importa `aa-api.js`
- Serves: C1, C2

**Interfaces:**

- Se borran `aa-api.js`, `aa-pages.js` y `aa-extract.js` del skill `artificial-analysis`, y `tests/aa-api.test.js` (su lector ya no existe; las pruebas del lector están en `tests/aa-pages.test.js`). Los dos archivos de datos del 2026-10-26 (`aa-extract-2026-10-26.json`, `aa-pages-extract-2026-10-26.txt`) se quedan.
- `.claude/skills/artificial-analysis/SKILL.md` se reescribe (conserva su `name`, su `description` actual salvo que nombre la API, la sección «Traps», «Reading it for a role», «The top tier waits for its next generation» y la lista de las cifras leídas el 2026-10-26, que ahora dice que las leyó un lector que ya no existe): ya no hay tabla de «tres fuentes» con la API; dice que **las páginas de los modelos son la única fuente por decisión del dueño** («ya no quiero usar la API de AA no sirve… la solcuon es leer directamentente las paginas de AA y mantener la info»), que la lectura es a pedido, con caché y al menos 1,5 segundos entre páginas, y que `docs/reference/artificial-analysis.md` guarda lo que los términos de uso de AA dicen de las peticiones automáticas (la lectura la pidió el dueño). La sección «Run it» describe solo: `node scripts/aa-pages.js read [slug …] [--harness <name>]` (escribe la foto `plugins/aether/config/models/aa-pages.json`), `node scripts/refresh-lanes.js [--write]` (parchea `pairs.json` desde la foto, sin red) y `node scripts/build-models-index.js [--write]` (rearma `models.json` y el README desde la foto, sin red). No nombra la API, su clave, `aa-api`, `aa-extract.js`, `aa-pages.js` del skill ni `x-api-key`. La fila «Cache is most of the cost» y las demás trampas se quedan.
- `.claude/skills/artificial-analysis/agent-prompt.md` se reescribe: el encargo a otro agente para leer cifras es `node scripts/aa-pages.js read …` con la caché y la salida fuera de las carpetas rastreadas; ya no hay «la API primero» ni una clave.
- `.claude/skills/new-harness/SKILL.md`: el paso 2 («Read Artificial Analysis once, the same day, for every listed model at every effort») nombra `node scripts/aa-pages.js read <slug …>` en lugar de `aa-api.js`; el paso 5 («Get a cost per task for every pair») ya no dice que la API no da el costo: dice que la página lo da (`costPerTaskUsd` de la foto) y que el programa que la lee es el lector. Conserva el orden de los pasos y las frases que `tests/new-harness-skill.test.js` busca (`Read Artificial Analysis once`, `Get a cost per task`, etc.) y su bloque `lists`.

**Tests (write first):**

`tests/aa-single-reader.test.js`, nuevo (falla hoy porque tres archivos más llaman a `fetch`):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SKILL = path.join(ROOT, '.claude', 'skills', 'artificial-analysis')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
const KEY_HEADER = ['x', 'api', 'key'].join('-') // built from pieces: the absence test of Task 9 searches the tree for it whole

// Every source file that could ask a page of the network: the scripts, the plugin's code and the skills; no test file.
function sources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.worktrees', 'worktrees', 'tests'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sources(full, out)
    else if (/\.(js|mjs|ts|tsx)$/.test(entry.name) && !/\.test\.(js|ts|tsx)$/.test(entry.name)) out.push(path.relative(ROOT, full).split(path.sep).join('/'))
  }
  return out
}

test('scripts/aa-pages.js is the only file that asks a page of the network', () => {
  const asking = [...sources(path.join(ROOT, 'scripts')), ...sources(path.join(ROOT, 'plugins')), ...sources(path.join(ROOT, '.claude'))]
    .filter((file) => /\bfetch\s*\(|globalThis\.fetch|https?\.get\(/.test(read(file)))
  assert.deepEqual(asking, ['scripts/aa-pages.js'])
})

test('the skill folder keeps its two documents and the two files of what was read on 2026-10-26, and no reader', () => {
  assert.deepEqual(fs.readdirSync(SKILL).sort(), ['SKILL.md', 'aa-extract-2026-10-26.json', 'aa-pages-extract-2026-10-26.txt', 'agent-prompt.md'])
})

test('the skill and its brief send the reader to scripts/aa-pages.js and name no API, key or retired reader', () => {
  for (const file of ['SKILL.md', 'agent-prompt.md']) {
    const text = read('.claude', 'skills', 'artificial-analysis', file)
    assert.match(text, /scripts\/aa-pages\.js read/, file)
    for (const gone of [/aa-api/, /aa-extract\.js/, /aa-pages\.js api/, new RegExp(KEY_HEADER, 'i'), /ARTIFICIAL_ANALYSIS/, /\/api\/v2/]) assert.doesNotMatch(text, gone, `${file} ${gone}`)
  }
  assert.match(read('.claude', 'skills', 'artificial-analysis', 'SKILL.md'), /only source|única fuente/i)
  assert.match(read('.claude', 'skills', 'new-harness', 'SKILL.md'), /scripts\/aa-pages\.js read/)
  assert.doesNotMatch(read('.claude', 'skills', 'new-harness', 'SKILL.md'), /aa-api\.js|The API does not give it/)
})
```

**Acceptance:**

- `node --test tests/aa-single-reader.test.js tests/new-harness-skill.test.js` en verde y `npm test` sin una falla nueva; ningún archivo fuera de `scripts/aa-pages.js` llama a `fetch` para una página.
- El skill describe lo que existe: ninguna orden que lea una API; `tests/aa-single-reader.test.js` no escribe entero ninguno de los tres textos de la Tarea 9.

### Task 6: La pasada real por las páginas: la foto (C3, C8)

**Aether:**
- Area: aa-snapshot
- Owns: `plugins/aether/config/models/aa-pages.json`, `tests/aa-snapshot-shipped.test.js`
- Depends on: Task 1 — el lector es lo que escribe la foto
- Depends on: Task 3 — `tests/models-index.test.js` filtra `aa-pages.json` de `readdirSync(CONFIG)` para que `npm test` siga en verde cuando esta tarea escribe la foto
- Serves: C3, C8

**Interfaces:**

Esta tarea escribe un solo archivo, la foto, y es el único paso de la construcción que usa la red. No toca ninguna tabla: `pairs.json`, `models.json` y las demás las cambia la Tarea 7, desde esta foto.

**La pasada real por las páginas (el dueño la pidió: «leeremos la pagina directamente»).** Corre, desde la raíz del worktree, en este orden:

```text
node scripts/aa-pages.js read
node scripts/aa-pages.js read gemini-4-hydrogen-low gemini-4-hydrogen-medium gemini-4-hydrogen-high gemini-4-hydrogen
```

La primera lee la dirección de cada fila de `plugins/aether/config/pairs.json` que no es una estimación: incluye las tres de Flash (`gemini-3-8-flash-low`, `gemini-3-8-flash-medium`, `gemini-3-8-flash`), que se quedan en la foto aunque la Tarea 7 saque las filas, porque son las cifras de Flash del día en que Hydrogen lo reemplaza. La segunda lee las cuatro de Hydrogen, que aún no tienen fila. Son unas 55 peticiones con 1,5 s entre una y otra; la caché queda en la carpeta temporal del sistema y no se rastrea.

- **Si el entorno de esta unidad no tiene red, la tarea termina informando que está bloqueada por eso: no inventa cifras.** Las 13 páginas ya leídas de `specs/038-aa-pages-hydrogen/evidence/aa-extract-2026-11-13.json` sirven para las pruebas del lector, no para llenar la foto enviada.
- Si un 403 o un 429 detiene la pasada, la tarea termina bloqueada y lo dice. Si una dirección falla por otra clase (404, 5xx, red, tiempo, sin bloque), la tarea corre la orden una vez más para esa dirección y, si sigue fallando, termina bloqueada nombrándola; no reintenta en bucle.
- La foto enviada es el archivo que la orden escribe, tal cual: nadie la edita a mano.

**Tests (write first):**

`tests/aa-snapshot-shipped.test.js`, nuevo (falla hoy porque el archivo de la foto no existe):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8'))
const HYDROGEN = ['gemini-4-hydrogen-low', 'gemini-4-hydrogen-medium', 'gemini-4-hydrogen-high', 'gemini-4-hydrogen']
const FLASH = ['gemini-3-8-flash-low', 'gemini-3-8-flash-medium', 'gemini-3-8-flash']
const DAY = /^\d{4}-\d{2}-\d{2}$/

test('the photo has a page for every row that has one, for the four Hydrogen addresses and for the three of Flash, each with its read date and figures with theirs', () => {
  assert.deepEqual(Object.keys(SNAPSHOT), ['pages'])
  // Today's table, whichever rows it has when this test runs: the photo holds at least the pages of its rows.
  const slugs = new Set([...loadPairs().pairs.filter((pair) => !Object.hasOwn(pair, 'estimateOf')).map((pair) => pair.slug), ...HYDROGEN, ...FLASH])
  for (const slug of slugs) {
    const entry = SNAPSHOT.pages[slug]
    assert.ok(entry, `${slug} is in the photo`)
    assert.match(entry.readOn, DAY, slug)
    assert.equal(typeof entry.name, 'string', slug)
    assert.equal(typeof entry.figures.intelligence?.value, 'number', `${slug} has its intelligence`)
    for (const figure of Object.values(entry.figures)) assert.deepEqual([typeof figure.value, DAY.test(figure.on)], ['number', true], slug)
  }
})

test('the photo is the text the reader writes: one line per address, the addresses sorted, and nothing under another key', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8')
  assert.equal(require('../scripts/aa-pages.js').serializeSnapshot(SNAPSHOT), text)
  assert.deepEqual(Object.keys(SNAPSHOT.pages), Object.keys(SNAPSHOT.pages).sort())
})
```

**Acceptance:**

- La pasada real se hizo una vez con red y la foto enviada trae las 4 direcciones de Hydrogen, las 3 de Flash y todas las de las filas con página, cada una con `readOn` y cada cifra con su `on`; o la tarea terminó bloqueada diciéndolo, sin cifras inventadas.
- `node --test tests/aa-snapshot-shipped.test.js` en verde y `npm test` sin una falla nueva: ninguna tabla cambió, así que no hay otra prueba que mover.
- La orden de la pasada no escribió nada más que `plugins/aether/config/models/aa-pages.json`.

### Task 7: Las tablas desde la foto: Hydrogen entra, Flash sale y queda reemplazado (C3, C4, C5, C6)

**Aether:**
- Area: tables
- Owns: `plugins/aether/config/pairs.json`, `plugins/aether/config/lanes.json`, `plugins/aether/config/prices.json`, `plugins/aether/config/models/harness-models.json`, `plugins/aether/config/models/profiles.json`, `plugins/aether/config/models/models.json`, `docs/models/README.md`, `tests/aa-tables-shipped.test.js`, `tests/models-index-shipped.test.js`, `tests/hydrogen-placement.test.js`, `tests/docs-claims-rest.test.js`
- Depends on: Task 2 — el piso de código es lo que pone a Hydrogen en su sitio
- Depends on: Task 3 — el índice sin lista es lo que regenera `models.json` y el README
- Depends on: Task 4 — el refresco desde la foto es lo que parchea `pairs.json`
- Depends on: Task 6 — la foto llena es la única fuente de las cifras
- Merges with: Task 8
- Serves: C3, C4, C5, C6

**Interfaces:**

Esta tarea cambia las tablas desde la foto de la Tarea 6 y **no lee ninguna página**: ni las de Artificial Analysis (si la foto no trae una cifra de Hydrogen o de Flash que la tarea necesita, termina bloqueada nombrándola) ni la de Google. Las pruebas que cargan las tablas reales y todavía fijan las de hoy son de la Tarea 8, que se construye junto con esta. Los pasos, en este orden:

1. **Los perfiles ganan `released`.** Antes de regenerar nada, copia el `released` de cada modelo (en uso y excluido) del `models.json` enviado al campo `released` de su perfil en `profiles.json`, para que el índice nuevo lo conserve (valor por omisión (a) de Global Constraints).
2. **`harness-models.json`, agy.** Recapturada el 2026-11-13 con agy 1.5.8: `capturedAt: "2026-11-13"`, `listedBy: "agy models (agy 1.5.8)"` y estos ids, en este orden: `gemini-4-argon-medium`, `gemini-4-argon-high`, `gemini-4-argon-low`, `gemini-4-hydrogen-high`, `gemini-4-hydrogen-xhigh`, `gemini-4-hydrogen-medium`, `gemini-4-hydrogen-low`, `gemini-pro-orchestrator-g1-pro`, `gemini-3.8-flash-high`, `gemini-3.8-flash-medium`, `gemini-3.8-flash-low`, `claude-opus-5-5-low`, `claude-opus-5-5-medium`, `claude-opus-5-5-high`, `claude-sonnet-5-5-low`, `claude-sonnet-5-5-medium`, `claude-sonnet-5-5-high`, `gpt-oss-120b-medium` (la lista de `specs/038-aa-pages-hydrogen/evidence/README.md`). Declaraciones de agy: `superseded` de `gemini-3.8-flash` con `by: "gemini-4-hydrogen"`, `on: "2026-11-13"`, un `reason` que cita la intención del dueño («hydrogen esta pensnaod para reemplazar a 3.8 flash») y un `figures` con las cifras de la foto con sus fechas (inteligencia, costo por tarea y código de Flash `high` y de Hydrogen `medium` y `high`); y `outOfScope` de `gpt-oss-120b` con `on: "2026-11-13"` y el motivo `listed by agy, released 2025-08-05, before the index's 2026-01-01 cut; no Artificial Analysis page is read for it`. **`gemini-pro-orchestrator-g1-pro` no se declara fuera de alcance** (nadie lo pidió): queda como un modelo listado sin fila ni foto, y el resumen del índice lo nombra (paso 8).
3. **Declarar lo que la lista de la API deducía.** En `harness-models.json`, con `on: "2026-11-13"`: `grok` declara `superseded` a `grok-4.6` y `grok-4.5` por `grok-4.7`; `muse` declara `superseded` a `muse-spark-1.2` por `muse-spark-1.3`. La tarea redacta cada `reason` (basta decir qué generación lo reemplaza).
4. **`pairs.json`.** Salen las tres filas `agy/gemini-3.8-flash@low|medium|high`. Entran cuatro filas `agy/gemini-4-hydrogen@low|medium|high|xhigh`, con `model` y `family` `gemini-4-hydrogen`, `group` `hydrogen`, `slug` `gemini-4-hydrogen-low`, `gemini-4-hydrogen-medium`, `gemini-4-hydrogen-high` y `gemini-4-hydrogen` (el de `xhigh`), `outputTokensPerSecond` y `timeToFirstTokenS` en `null` (las páginas no los traen), y `intelligence`, `costPerTaskUsd`, `code`, `codeCostPerTaskUsd`, `codeMinutesPerTask`, `checked` y `codeChecked` copiados de la foto (la fila `low` entra aunque no alcanza ningún escalón: la regla la deja fuera por sí sola).
5. **Refrescar la tabla.** `node scripts/refresh-lanes.js --write` parchea `pairs.json` con todas las cifras de las filas con página (inteligencia, costo por tarea, código y sus fechas), también las de código de las filas externas. No cambia `fetchedAt`. Si la salida dice `Stored ladder: changed`, la tarea **no** toca `plugins/aether/config/ladder.json` (fuera de alcance): se detiene, deja `pairs.json` refrescado, y lo informa como pregunta para el dueño con las líneas que el refresco imprimió; `tests/ladder-stored.test.js` entonces no se toca para esconderlo. Después `node scripts/refresh-lanes.js` (sin `--write`) imprime `No figure changed.`
6. **`lanes.json`, agy.** El grupo `flash` se renombra `hydrogen` (misma etiqueta de cuota `"Gemini Models"`; los demás grupos quedan) y el modelo `gemini-3.8-flash` se reemplaza por `gemini-4-hydrogen`: `group: "hydrogen"`, `roles: ["implementer"]` y `aa: { slug: "gemini-4-hydrogen-high", intelligence, terminalBench, checked }` con las cifras de la foto (`terminalBench` es la fracción con dos decimales, como en las demás entradas).
7. **`prices.json`.** Entra `gemini-4-hydrogen`: `ids: ["gemini-4-hydrogen"]`, `input: 1.5`, `output: 7.5`, `cacheRead: 0.075`, `cacheWrite5m` y `cacheWrite1h` iguales al precio de entrada (1.5; la página no da el de escritura de caché, y la hipótesis es la misma de Codex y Grok: «cache writes at the input price»), `checked` con la fecha de la foto, y en `sources` la dirección `plugins/aether/config/models/aa-pages.json`. La entrada de `gemini-3.8-flash` **se queda** para valorar corridas viejas de `usage/` (Supuesto 7 del diseño). Los `sources` de `gpt-6.1-sol`, `gpt-6.1-terra` y `gpt-6-luna` (hoy `tests/fixtures/codex/aa-api-2026-10-29.json`, un dato que borra la Tarea 8) pasan a `plugins/aether/config/models/aa-pages.json`.
8. **`profiles.json`.** Entra `gemini-4-hydrogen` con **solo lo que la evidencia y la foto dan**, sin leer la página de Google (valor por omisión reversible; se informa como pregunta): `name` `Gemini 4 Hydrogen`, `maker` `Google`, `released` `2026-11-12`, `efforts` `["low","medium","high","xhigh"]`, `price` de 1.5 y 7.5 dólares por millón (`input`, `output`, con una `note` que cita la lista de agy y la foto), `defaultEffort`, `contextTokens`, `maxOutputTokens` y `knowledgeCutoff` en `null`, un `purpose` en una frase que diga lo que se sabe (lo ofrece agy 1.5.8 en esos cuatro esfuerzos y el dueño lo pensó como reemplazo de Flash) y que no se leyó la página del fabricante, un `availability` igual de honesto, un `caveat` que nombre los campos sin leer, `sources` con `specs/038-aa-pages-hydrogen/evidence/README.md` y `plugins/aether/config/models/aa-pages.json`, y `checked` `2026-11-13`. No inventa contexto ni límites. Sale `gemini-3-8-flash`. Entra también una ficha mínima de `gemini-pro-orchestrator-g1-pro`, con el id listado como clave (como `muse-wonder-full-1.0`, el otro modelo sin cifras) y como `name`, `maker` `Google`, los campos sin leer en `null`, y un `purpose` y un `caveat` que digan que agy 1.5.8 lo lista y que Aether no leyó ninguna página ni lo usa, para que el índice no salga con código 1 por un modelo sin perfil.
9. **El índice y su README.** `node scripts/build-models-index.js --write` regenera `models.json` y la parte generada de `docs/models/README.md`; Hydrogen aparece en uso en agy con sus cuatro esfuerzos y Flash en `superseded` con su fecha y sus cifras; el motivo y las cifras salen de lo declarado. La parte escrita a mano de `docs/models/README.md` (hasta `<!-- models-index:start -->`) pierde las dos órdenes de la API y `--from`; la sección «Refresh» muestra `node scripts/build-models-index.js --write   # from the photo of the model pages, no network: plugins/aether/config/models/aa-pages.json`, y el texto que explica el agrupamiento por slug de AA se reemplaza por una frase que dice que los modelos salen de `harness-models.json` y las cifras de la foto. El README sigue por debajo de 80 líneas y enlaza a los tres archivos de `config/models` donde `tests/models-index.test.js` los busca. `tests/docs-claims-rest.test.js` se corre con el README nuevo y se toca solo si se pone roja. `models.json` y el README salen sin la dirección de la API, sin el nombre de la clave y sin `x-api-key`.

**Tests (write first):**

`tests/hydrogen-placement.test.js`, nuevo (falla hoy porque Hydrogen no tiene filas):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const { pairs } = loadPairs()
const config = lanes.loadConfig(lanes.CONFIG_FILE)
const OPEN = { usable: true, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
const DRY = { usable: false, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
// The world the design fixes: only agy installed and on, the Hydrogen group open, every other harness off. The group of agy's Claude
// models is dry (agy reports 4.4 % free, not usable) unless the test opens it.
const world = ({ claude = DRY } = {}) => ({ agy: { installed: true, groups: { argon: OPEN, hydrogen: OPEN, claude } } })
const ask = (model, effort, harnesses = world()) => choose({ pairs, reference: { model, effort }, harnesses, role: 'implementer', lanes: config })
const pickedId = (decision) => (decision.picked ? decision.picked.id : null)
const why = (decision, id) => decision.candidates.find((c) => c.id === id).why

test('with only agy, its Claude group dry and Hydrogen open, an implementer call lands on Hydrogen as the design says', () => {
  assert.equal(pickedId(ask('haiku', 'high')), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('haiku', 'xhigh')), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('sonnet', 'high')), 'agy/gemini-4-hydrogen@high')
})

test('Sonnet high leaves Hydrogen medium out for its code, and says so', () => {
  const decision = ask('sonnet', 'high')
  assert.equal(why(decision, 'agy/gemini-4-hydrogen@medium'), 'below-code')
  assert.equal(why(decision, 'agy/gemini-4-hydrogen@low'), 'below')
})

test('for Opus high and Opus xhigh no Hydrogen pair is a candidate', () => {
  for (const effort of ['high', 'xhigh']) {
    const decision = ask('opus', effort)
    const hydrogen = decision.candidates.filter((c) => c.id.startsWith('agy/gemini-4-hydrogen@'))
    assert.equal(hydrogen.length, 4)
    assert.ok(hydrogen.every((c) => c.outcome === 'passed'), effort)
  }
  assert.equal(why(ask('opus', 'high'), 'agy/gemini-4-hydrogen@high'), 'below-code')
})

test('with the Claude group of agy open and the same window, an agy Claude pair wins where it is cheaper than Hydrogen, so the dry world is weighing', () => {
  const open = world({ claude: OPEN })
  assert.match(pickedId(ask('haiku', 'high', open)), /^agy\/claude-/)
  assert.match(pickedId(ask('sonnet', 'high', open)), /^agy\/claude-/)
})

test('Flash is gone from the pairs and the lane table, and its group is called hydrogen', () => {
  assert.equal(pairs.some((pair) => /gemini-3\.8-flash|gemini-3-8-flash/.test(`${pair.id} ${pair.slug} ${pair.model} ${pair.family}`)), false)
  const agy = config.harnesses.agy
  assert.deepEqual(Object.keys(agy.groups).sort(), ['argon', 'claude', 'hydrogen'])
  assert.equal(agy.groups.hydrogen, 'Gemini Models')
  assert.equal(Object.hasOwn(agy.models, 'gemini-3.8-flash'), false)
  assert.deepEqual([agy.models['gemini-4-hydrogen'].group, agy.models['gemini-4-hydrogen'].roles], ['hydrogen', ['implementer']])
  assert.deepEqual(pairs.filter((pair) => pair.model === 'gemini-4-hydrogen').map((pair) => [pair.effort, pair.group]), [['low', 'hydrogen'], ['medium', 'hydrogen'], ['high', 'hydrogen'], ['xhigh', 'hydrogen']])
})

test('harness-models.json and models.json give Flash as replaced by Hydrogen, with the date and the figures, and Hydrogen as in use at its four efforts', () => {
  const declared = read('models', 'harness-models.json').harnesses.agy.superseded['gemini-3.8-flash']
  assert.equal(declared.by, 'gemini-4-hydrogen')
  assert.match(declared.on, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(declared.reason.length > 20 && declared.figures.length > 20)
  const index = read('models', 'models.json')
  assert.ok(index.superseded.some((entry) => entry.harness === 'agy' && entry.id === 'gemini-3.8-flash' && entry.supersededBy === 'gemini-4-hydrogen' && entry.on === declared.on && entry.figures === declared.figures))
  const hydrogen = index.models.find((entry) => entry.harness === 'agy' && entry.model === 'gemini-4-hydrogen')
  assert.deepEqual(hydrogen.efforts, ['low', 'medium', 'high', 'xhigh'])
  assert.deepEqual(hydrogen.lane, { roles: ['implementer'] })
  assert.equal(index.models.some((entry) => entry.model === 'gemini-3.8-flash'), false)
  assert.equal(read('prices.json').models['gemini-3.8-flash'].input, 0.75, 'the price entry of Flash stays, to price old usage')
  assert.equal(Object.hasOwn(read('models', 'profiles.json').profiles, 'gemini-3-8-flash'), false)
})
```

(La cuarta prueba compara solo Haiku `high` y Sonnet `high`: con las cifras del 2026-11-13, para Haiku `xhigh` ningún par `agy/claude-*` es más barato que Hydrogen `medium`, así que ahí Hydrogen gana aunque el grupo `claude` esté abierto. El diseño dice «en las referencias donde hoy gana Hydrogen»; la tarea informa si la foto da otra cosa, y la pregunta queda para el Lead.)

`tests/aa-tables-shipped.test.js`, nuevo (falla hoy: `pairs.json` no tiene las cifras de código de las filas externas ni las de Hydrogen):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { main } = require('../scripts/refresh-lanes.js')

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8'))

test('the shipped table agrees with the photo: the refresh finds no figure to change, and the stored ladder is as the law gives it today', () => {
  const out = main([])
  assert.equal(out.exitCode, 0, out.stdout)
  assert.match(out.stdout, /No figure changed\./)
  assert.match(out.stdout, /Stored ladder: unchanged/)
})

test('every row with a page carries its code figures, the external rows too, dated by the photo', () => {
  for (const pair of loadPairs().pairs.filter((row) => !Object.hasOwn(row, 'estimateOf'))) {
    const figures = SNAPSHOT.pages[pair.slug].figures
    if (!figures.code) continue
    assert.deepEqual([pair.code, pair.codeCostPerTaskUsd, pair.codeMinutesPerTask, pair.codeChecked], [figures.code.value, figures.codeCostPerTaskUsd.value, figures.codeMinutesPerTask.value, figures.code.on], pair.id)
  }
})

test('the four Hydrogen rows take their intelligence, their cost per task and their dates from the pages of the photo', () => {
  const rows = loadPairs().pairs.filter((pair) => pair.model === 'gemini-4-hydrogen')
  assert.deepEqual(rows.map((pair) => pair.slug), ['gemini-4-hydrogen-low', 'gemini-4-hydrogen-medium', 'gemini-4-hydrogen-high', 'gemini-4-hydrogen'])
  for (const pair of rows) {
    const figures = SNAPSHOT.pages[pair.slug].figures
    assert.deepEqual([pair.intelligence, pair.costPerTaskUsd, pair.checked], [figures.intelligence.value, figures.costPerTaskUsd.value, figures.intelligence.on], pair.id)
  }
})
```

`tests/models-index-shipped.test.js`, nuevo (devuelve la comparación que la Tarea 3 quitó):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { main } = require('../scripts/build-models-index.js')

const ROOT = path.join(__dirname, '..')
const SHIPPED_MODELS = path.join(ROOT, 'plugins', 'aether', 'config', 'models', 'models.json')
const SHIPPED_README = path.join(ROOT, 'docs', 'models', 'README.md')

test('rebuilding the index from the shipped inputs twice writes the shipped models.json and README block, byte for byte, with no network', (t) => {
  const dir = tempDir(t, 'aether-shipped-index-')
  const out = path.join(dir, 'out')
  const docs = path.join(dir, 'docs')
  fs.mkdirSync(docs)
  fs.copyFileSync(SHIPPED_README, path.join(docs, 'README.md'))
  const texts = []
  for (let i = 0; i < 2; i++) {
    const result = main(['--write', '--out', out, '--docs', docs])
    assert.equal(result.exitCode, 0, result.stdout)
    texts.push([fs.readFileSync(path.join(out, 'models.json'), 'utf8'), fs.readFileSync(path.join(docs, 'README.md'), 'utf8')])
  }
  assert.deepEqual(texts[0], texts[1])
  assert.equal(texts[0][0], fs.readFileSync(SHIPPED_MODELS, 'utf8'))
  assert.equal(texts[0][1], fs.readFileSync(SHIPPED_README, 'utf8'))
})

test('the shipped index names the photo as its source, keeps no trace of the API, and lists what was declared superseded or out of scope', () => {
  const file = JSON.parse(fs.readFileSync(SHIPPED_MODELS, 'utf8'))
  assert.equal(file.source, 'plugins/aether/config/models/aa-pages.json, from the model pages https://artificialanalysis.ai/models/<slug>')
  assert.equal(Object.hasOwn(file, 'since'), false)
  assert.deepEqual(file.superseded.map((entry) => `${entry.harness}/${entry.id}`).sort(), ['agy/gemini-3.8-flash', 'grok/grok-4.5', 'grok/grok-4.6', 'muse/muse-spark-1.2'])
  assert.deepEqual(file.outOfScope.map((entry) => `${entry.harness}/${entry.model}`), ['agy/gpt-oss-120b'])
})

test('the model agy lists with no pair row and no photo is named in the summary and is not declared out of scope, and the build still exits 0', () => {
  const result = main([])
  assert.equal(result.exitCode, 0, result.stdout)
  assert.match(result.stdout, /Listed with no pair row and no photo \(\d+\): .*agy\/gemini-pro-orchestrator-g1-pro/)
  const file = JSON.parse(fs.readFileSync(SHIPPED_MODELS, 'utf8'))
  assert.ok(file.withoutFigures.some((entry) => entry.harness === 'agy' && entry.model === 'gemini-pro-orchestrator-g1-pro'))
})
```

**Acceptance:**

- `node --test tests/hydrogen-placement.test.js tests/aa-tables-shipped.test.js tests/models-index-shipped.test.js` en verde, y con la Tarea 8 hecha, `npm test` completo en verde o con solo los fallos de la línea base; las cinco colocaciones del criterio 5 se cumplen con la foto de la unidad.
- Ninguna fila de `gemini-3.8-flash` en `pairs.json` ni en `lanes.json`; `harness-models.json` y `models.json` lo dan por reemplazado por Hydrogen con fecha y cifras; `prices.json` conserva su precio.
- `node scripts/refresh-lanes.js` imprime `No figure changed.` y `Stored ladder: unchanged`; `node scripts/build-models-index.js` sale con 0 y dos corridas dan los mismos archivos; ni `models.json` ni `docs/models/README.md` nombran la API, la clave ni `x-api-key`.
- Si una cifra de la foto faltó, la tarea terminó bloqueada diciéndolo; no se leyó ninguna página, y el perfil de Hydrogen tiene solo lo que la evidencia y la foto dan.

### Task 8: Las pruebas que cargan las tablas reales, ajustadas a las tablas nuevas (C4, C5, C6)

**Aether:**
- Area: tables
- Owns: `tests/fixtures/aa-pairs-2026-10-29.json`, `tests/fixtures/codex/aa-api-2026-10-29.json`, `tests/lane-fixtures.js`, `tests/aether-lane.test.js`, `tests/aether-plan.test.js`, `tests/bootstrap-names.test.js`, `tests/codex-detect.test.js`, `tests/codex-docs.test.js`, `tests/codex-lane.test.js`, `tests/codex-lanes.test.js`, `tests/codex-lists.test.js`, `tests/codex-network.test.js`, `tests/codex-pairs.test.js`, `tests/codex-release.test.js`, `tests/codex-smoke.test.js`, `tests/copies-classes.test.js`, `tests/copies-deadlines.test.js`, `tests/copies-harness-config.test.js`, `tests/copies-harness.test.js`, `tests/copies-ladder.test.js`, `tests/delegate-*.test.js`, `tests/detached-head.test.js`, `tests/ladder-stored.test.js`, `tests/lane-*.test.js`, `tests/lanes.test.js`, `tests/merge-lock.test.js`, `tests/muse-*.test.js`, `tests/new-skills.test.js`, `tests/observe-baseline.test.js`, `tests/pairs*.test.js`, `tests/pick-data.test.js`, `tests/prices.test.js`, `tests/roles.test.js`, `tests/router-*.test.js`, `tests/seat*.test.js`, `tests/session-start.test.js`, `tests/superdelegation.test.js`, `tests/superdelegation-scenarios.test.js`, `tests/superdelegation-gone.test.js`, `tests/superdelegation-supervisor.test.js`, `tests/using-aether-030.test.js`, `tests/workflow-design.test.js`
- Depends on: Task 2 — el piso de código cambia las elecciones de las pruebas que cargan la tabla real, y esas se ajustan una sola vez
- Depends on: Task 6 — la foto es de donde salen las cifras que las pruebas afirman
- Depends on: Task 7 — las tablas nuevas son lo que estas pruebas deben afirmar
- Merges with: Task 7
- Serves: C4, C5, C6

**Interfaces:**

Esta tarea no cambia ninguna tabla ni ningún código: ajusta las pruebas de su `Owns` al estado que deja la Tarea 7, y solo a él; no lee ninguna página. Los dos archivos de la lista de glob que otra tarea ya tiene (`tests/codex-models.test.js` y `tests/copies-muse.test.js` son de la Tarea 3, `tests/superdelegation-code.test.js` de la Tarea 2) no están en su `Owns`: por eso `codex-*`, `copies-*` y `superdelegation*` van por nombre.

1. **Se borran** `tests/fixtures/aa-pairs-2026-10-29.json` (lo leía `tests/pairs.test.js`, que ahora compara con la foto) y `tests/fixtures/codex/aa-api-2026-10-29.json` (lo leían `tests/codex-models.test.js`, que ya no lo nombra desde la Tarea 3, y los `sources` de `prices.json`, que la Tarea 7 cambió). Antes de borrar cada uno, `grep -rn` de su nombre en `tests/` y en `plugins/`: lo que lo nombre y no esté en `Owns` se informa. `tests/prices.test.js` acepta el origen nuevo (el prefijo `plugins/aether/config/models/` se añade a los orígenes que acepta).
2. **Las cifras que el refresco movió.** `tests/pairs.test.js`: la prueba «the table holds the 22 pairs of the evidence…» compara cada fila con su página de la foto (`slug`, `intelligence`, `costPerTaskUsd`) en lugar del dato que se borra, y el conteo de filas pasa de 50 a 51 (tres de Flash fuera, cuatro de Hydrogen dentro). `tests/muse-spark.test.js`, `tests/codex-lanes.test.js`, `tests/lanes.test.js` y las que fijan una cifra de `pairs.json`, `lanes.json` o `models.json` que el refresco movió: si la cifra de `lanes.json` (`aa`) no la mueve el refresco, la prueba no cambia.
3. **Las elecciones con la tabla real.** `tests/superdelegation.test.js`, `tests/superdelegation-scenarios.test.js`, `tests/router-pick.test.js`, `tests/pick-data.test.js`, `tests/seats.test.js`, `tests/lane-pick.test.js`, `tests/lane-delegate*.test.js`, `tests/workflow-design.test.js` y las demás: ahora que las filas externas llevan `code` y la regla de la Tarea 2 lo exige, una elección de un papel `implementer` puede cambiar; cada afirmación se corrige con lo que la regla da y con el motivo, y la tarea escribe en su mensaje final qué elecciones cambiaron y por qué.
4. **Flash sale y el grupo `flash` se renombra `hydrogen`.** Se reescriben las pruebas que cargan la tabla real y nombran a Flash o a su grupo, las del diseño y las que la búsqueda de abajo encuentre: `tests/router-pick.test.js` (la línea 104 afirma `agy/gemini-3.8-flash@medium`; la 402 la lista), `tests/pick-data.test.js` (líneas 21 y 50), `tests/seats.test.js` (líneas 25 a 49, 91 y 106), `tests/lane-refusal.test.js` (el grupo `flash`, `runFlashCall`, la línea 45), `tests/lane-delegate.test.js` (líneas 717 a 720), `tests/superdelegation.test.js` (líneas 13 a 15 y 55), `tests/superdelegation-scenarios.test.js` (líneas 17 a 19), `tests/codex-pairs.test.js` (línea 52), `tests/pairs-claude.test.js` (`assert.equal(others.length, 35)` pasa a 36: tres filas de Flash fuera y cuatro de Hydrogen dentro), `tests/pairs.test.js`, `tests/lanes.test.js` (la línea 90 afirma el `aa` de Flash), `tests/lane-table-index.test.js` (la lista de modelos de la tabla enviada nombra `agy/gemini-4-hydrogen` en lugar de `agy/gemini-3.8-flash`), `tests/prices.test.js`, y las que usan `tests/lane-fixtures.js` y nombran a Flash: `tests/aether-lane.test.js` (la salida de `start` es `{ started: true, model: 'gemini-4-hydrogen-xhigh', group: 'hydrogen' }`), `tests/detached-head.test.js`, `tests/lane-start-marks.test.js`, `tests/lane-status.test.js`, `tests/lane-quota.test.js`, `tests/lane-pick.test.js`, `tests/merge-lock.test.js`, `tests/delegate-calls.test.js`, `tests/delegate-snapshot.test.js`. `tests/lane-fixtures.js` se toca si lee a Flash o al grupo `flash`. `tests/router-quota.test.js` y `tests/router-renewal.test.js` cargan la tabla real pero no nombran a Flash: se corren y se tocan solo si se ponen rojas. Las pruebas que nombran a Flash con tablas propias (`tests/harness-agy.test.js`, `tests/delegate-chain.test.js`, `tests/workflow-*.test.js`, `tests/observe-*.test.js`…) no se tocan.
5. **La búsqueda.** Antes de dar la lista por cerrada, la tarea corre `grep -il flash tests/*.test.js` y revisa cada prueba que cargue la tabla real de pares o de carriles (`CONFIG_FILE`, `PAIRS_FILE`, `loadPairs()` sin argumento, `pairs.json`, `lanes.json`, `lane-fixtures.js`) y afirme un conteo, un id o un nombre, nombre o no a Flash; cada una que se ponga roja y esté en `Owns` se corrige aquí, y cada una roja que no esté en `Owns` (por ejemplo `tests/exam.test.js` o `tests/harness-codex-quota.test.js`, que usan `lane-fixtures.js`) se informa con su nombre en el mensaje final.

**Tests (write first):**

Esta tarea no trae pruebas nuevas: sus pruebas son las aserciones corregidas de los archivos de su `Owns`. Para cada archivo, corre primero `node --test <archivo>` con las tablas de la Tarea 7 y mira que falle por la razón que el punto de arriba nombra (una fila de Flash que ya no está, un grupo `flash` que ya no existe, un conteo que cambió, una elección que la regla del código movió); luego corrige solo esa aserción. Aserciones que ya se conocen: en `tests/pairs-claude.test.js` (línea 52) `assert.equal(others.length, 36)`; en `tests/aether-lane.test.js` la salida de `start` con la tabla enviada es `{ started: true, model: 'gemini-4-hydrogen-xhigh', group: 'hydrogen' }`; en `tests/pairs.test.js` el conteo de filas de la tabla enviada es 51.

**Acceptance:**

- Cada archivo del `Owns` corre en verde con `node --test <archivo>`, y `npm test` completo queda en verde o con solo los fallos de la línea base; el mensaje final lista lo que cambió en cada prueba que carga la tabla real, qué elecciones cambiaron y por qué, y cada prueba roja fuera de `Owns`.
- Ningún archivo de `tests/` nombra ya `tests/fixtures/aa-pairs-2026-10-29.json` ni `tests/fixtures/codex/aa-api-2026-10-29.json`, y los dos archivos ya no existen.
- Ninguna aserción se debilita para esconder una elección que la regla cambió: cambia el valor esperado y el motivo.

### Task 9: La documentación, la decisión numerada y la prueba de ausencia (C1, C2, C7)

**Aether:**
- Area: docs
- Owns: `docs/reference/artificial-analysis.md`, `docs/contributing.md`, `docs/guide/lanes.md`, `docs/index.md`, `docs/decisions.md`, `AGENTS.md`, `tests/aa-absence.test.js`, `tests/docs-032.test.js`, `tests/docs-facts.test.js`, `tests/docs-decisions.test.js`, `tests/lanes-docs.test.js`
- Depends on: Task 5 — el skill ya no nombra la API y la prueba de ausencia lo comprueba
- Depends on: Task 7 — las tablas y el índice finales son lo que los documentos describen, y la ausencia se comprueba sobre el árbol entero
- Depends on: Task 8 — la última de las pruebas y de los datos que nombran la API (los dos archivos de `tests/fixtures/`) se va con ella, y la ausencia se comprueba sobre el árbol entero
- Serves: C1, C2, C7

**Interfaces:**

- `docs/reference/artificial-analysis.md`: la sección «The free API» (las dos direcciones, el encabezado `x-api-key`, el límite diario y el ejemplo de la respuesta) se quita; la página describe lo que Aether toma de las páginas de los modelos campo por campo (la tabla de cifras de Global Constraints), lo que el sitio muestra y las páginas no, lo que los términos de uso permiten (se conserva el hecho de que la sección 3.3 (b)(vi), leída el 2026-10-26, prohíbe las peticiones automáticas y que el dueño pidió esta lectura: «leeremos la pagina directamente»), y dónde vive cada cifra en el plugin: la foto `plugins/aether/config/models/aa-pages.json`, el lector `scripts/aa-pages.js`, `scripts/refresh-lanes.js` que parchea `pairs.json` desde la foto, y `scripts/build-models-index.js` que rearma `models.json` desde la foto, ambos sin red. Conserva las frases que `tests/docs-032.test.js` busca (`model pages`, `does not save it`). Su `description` de cabecera deja de decir «free API».
- `docs/contributing.md` (línea de Node.js 22) y `AGENTS.md` (la viñeta de `refresh-lanes.js`): dejan de decir «still fetches the index from the API with its key» y «is the only code that asks the API»; dicen que `scripts/aa-pages.js read` lee las páginas de Artificial Analysis a pedido del dueño y escribe la foto, que `refresh-lanes.js [--write]` escribe la inteligencia, el costo por tarea y las cifras de código de cada fila con página de `config/pairs.json` desde la foto, en una corrida, muestra la escalera recalculada y no la guarda, y que `build-models-index.js` rearma el índice desde la foto sin red. Conservan `every row with a page`, `model pages` y `does not save it`.
- `docs/guide/lanes.md`: la viñeta «Who takes a call» nombra para agy Gemini 4 Hydrogen en `low`, `medium`, `high` y `xhigh` (papel implementador) en lugar de Flash; la viñeta de las cuotas de agy dice que el grupo `Gemini Models` lo leen las claves `argon` y `hydrogen` (Hydrogen, Argon y, hasta que salió, Flash comparten la ventana), y conserva `every row with a page` y `never saves it`. Describe la regla nueva: para un papel `implementer`, un par externo con cifra de código es candidato solo si su código llega al de la referencia menos la tolerancia (1 punto), y la decisión dice el motivo (`below-code`).
- `docs/index.md`: la descripción de la página de Artificial Analysis deja de decir «free API» y el rango de decisiones pasa a `A1–A<N>` con el número nuevo; `tests/docs-032.test.js` (línea 23) y `tests/docs-facts.test.js` (línea 847) fijan ese rango y se actualizan.
- `docs/decisions.md`: una decisión numerada nueva, con el siguiente número libre (A126: la A125 es de la spec 037, ya en `main`; si `main` ya lo tomó, el siguiente: lo dice `docs/contributing.md`), con el título y el cuerpo en el estilo de las demás filas. Cita las palabras del dueño tal como las dio, de `specs/038-aa-pages-hydrogen/intent.md`: «ya no quiero usar la API de AA no sirve, hay que sacarla del repo y del codigo y de todo, la solcuon es leer directamentente las paginas de AA y mantener la info», «okay leeremos la pagina directamente entocnes», y, para el código en la regla, «como sabemos hydrogen que escalon usa? es el probelma de siempre […] como estamos decidiendo que modelo usa que escalon?» y «hydrogen esta pensnaod para reemplazar a 3.8 flash». Dice qué se decidió, una cláusula por cosa: la API sale del repo; el lector único y la foto con fecha por cifra; el índice sale de lo que lista cada harness y de la foto; Hydrogen entra en agy (`medium` en los escalones 1 y 2, `high` en el 3, ninguno en el 4 ni el 5) y Flash queda reemplazado; un par externo que va a implementar alcanza el escalón también en código; lo que queda fuera (etapas 2 y 3, el release, la clave del `.env` local del dueño, la escalera nueva, otros papeles de Hydrogen). Termina con `Decided 2026-11-13; spec 038.` como las filas vecinas. Esta decisión nombra los textos que la prueba de ausencia busca solo si los cita como historia: la prueba excluye `docs/decisions.md` (ver abajo), pero el cuerpo no debe copiar la dirección de la API ni el nombre de la clave.
- `tests/docs-032.test.js`: pierde las dos aserciones de las líneas 56 y 60 (`doesNotMatch(read('AGENTS.md'), /refreshes the lane table \(needs `ARTIFICIAL_ANALYSIS_API_KEY`\)/)` y la de `docs/contributing.md` que nombra la clave): quedan cubiertas por la prueba de ausencia; el resto de la prueba «the texts say the refresh reads every row with a page…» se queda. Su línea 23 pasa a `A1–A<N>`. Gana la prueba de la decisión numerada (abajo).

**Tests (write first):**

`tests/aa-absence.test.js`, nuevo (falla hoy: queda texto de la API en `docs/` y en las tablas):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
// The three texts, built from pieces so that this file does not hold them as one string.
const API_ADDRESS = ['artificialanalysis.ai', 'api'].join('/')
const KEY_NAME = ['ARTIFICIAL_ANALYSIS', 'API', 'KEY'].join('_')
const KEY_HEADER = ['x', 'api', 'key'].join('-')
const NAMES_AA = /artificial[ -]?analysis/i
// History keeps its text: the specs of every feature (038 included: its design names the texts it removes), the changelog, the
// numbered decisions, the handoffs and the saved page of 2026-10-26. This file holds the three texts as data.
const HISTORY = [/^specs\//, /^docs\/changelog\.md$/, /^docs\/decisions\.md$/, /^docs\/handoff\//, /^docs\/models\/artificial-analysis-2026-10-26\.md$/, /^tests\/aa-absence\.test\.js$/]

const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)

test('no tracked file outside the history names the API address of Artificial Analysis or the name of its key, and none sends its header', () => {
  const found = []
  for (const file of tracked) {
    if (HISTORY.some((pattern) => pattern.test(file))) continue
    const full = path.join(ROOT, file)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue
    const text = fs.readFileSync(full, 'utf8')
    if (text.includes(API_ADDRESS) || text.includes(KEY_NAME)) found.push(file)
    // The header is only the API's when the file also names Artificial Analysis: the research page of Claude Code names it for the
    // owner's local gateway, not for Artificial Analysis, and does not count.
    else if (text.includes(KEY_HEADER) && NAMES_AA.test(text)) found.push(file)
  }
  assert.deepEqual(found, [])
})

test('the search covers the tree: it finds the three texts in a file that holds them', () => {
  const sample = `a ${API_ADDRESS}/v2 b ${KEY_NAME} c ${KEY_HEADER} Artificial Analysis`
  assert.ok(sample.includes(API_ADDRESS) && sample.includes(KEY_NAME) && sample.includes(KEY_HEADER) && NAMES_AA.test(sample))
  assert.ok(tracked.includes('plugins/aether/config/models/aa-pages.json') && tracked.includes('scripts/aa-pages.js'))
})
```

En `tests/docs-032.test.js` se añade:

```js
test('the decision of spec 038 is recorded with the owner\'s words, and the index names its number (C1, C7)', () => {
  const decisions = read('docs/decisions.md')
  const row = decisions.split('\n').find((line) => /^\| A\d+ \|/.test(line) && line.includes('ya no quiero usar la API de AA no sirve'))
  assert.ok(row, 'a numbered decision quotes the owner on the API')
  for (const phrase of ['leeremos la pagina directamente', 'hydrogen esta pensnaod para reemplazar a 3.8 flash', 'Decided 2026-11-13; spec 038']) assert.ok(row.includes(phrase), phrase)
  assert.match(row, /Hydrogen/)
  assert.match(row, /code/i)
  const number = row.match(/^\| (A\d+) \|/)[1].slice(1)
  assert.match(read('docs/index.md'), new RegExp(`A1–A${number}\\b`))
})
```

`tests/docs-facts.test.js` (línea 847) y `tests/docs-032.test.js` (línea 23) cambian el rango fijo `A1–A125` por el nuevo. `tests/lanes-docs.test.js` solo se toca si una afirmación sobre `docs/guide/lanes.md` queda roja (por ejemplo la que cuenta los modelos de agy).

**Acceptance:**

- `node --test tests/aa-absence.test.js tests/docs-032.test.js tests/docs-facts.test.js tests/docs-decisions.test.js tests/lanes-docs.test.js` en verde, y `npm test` completo en verde.
- `npm run check` completo en verde (`npm test`, `npm run test:mod` y `npm run validate`); si `claude plugin test` o `claude plugin validate` no corren en la unidad, la tarea lo dice con la salida exacta y no lo da por pasado.
- Una búsqueda en el árbol de la dirección de la API, del nombre de la clave y del encabezado junto a Artificial Analysis no da nada fuera de la historia; el documento de investigación de Claude Code queda como está.
- Ningún documento nombra ya `aa-api.js`, `aa-extract.js`, `--from`, `--since`, `--pages` ni `--cache` de `build-models-index.js`; `docs/changelog.md`, la versión y el release no se tocan.
