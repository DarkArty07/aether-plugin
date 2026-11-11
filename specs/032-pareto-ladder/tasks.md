# Tasks: La escalera de Pareto (parte 1, Claude) (032-pareto-ladder)

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Intent:** [intent.md](intent.md)

## Global Constraints

- **Node.js 22 y CommonJS, sin dependencias nuevas.** Cada archivo nuevo de `plugins/aether/lib/` lleva la cabecera de 2 líneas con `// Family: <nombre>.`, está declarado en `docs/reference/components.md` y no deja nombres sin uso (`tests/guards.test.js`). Los bins siguen delgados: la lógica vive en `lib/`.
- **Sin red, sin modelos y sin gasto en las pruebas.** Todo se prueba con directorios y repositorios temporales de `tests/helpers.js`, con páginas simuladas y con el modelo falso. Ninguna tarea hace una petición real a Artificial Analysis.
- **Las cifras de hoy** son las de `specs/032-pareto-ladder/evidence/aa-pages-claude-2026-11-10.json`. Los nombres de campo de la tabla para el código son `code` (puntos, de 0 a 100), `codeCostPerTaskUsd` y `codeMinutesPerTask`. Redondeo: inteligencia a 1 decimal, costos a 3, `code` a 2 (la fracción por 100) y minutos a 1.
- **La escalera guardada.** `plugins/aether/config/ladder.json` queda `{ law, supervisorFloor, repeatBlocked, rungs }` con `rungs` de `{ step, model, effort }` y `step = <modelo>-<esfuerzo>` (`haiku-high`, `haiku-xhigh`, `sonnet-high`, `opus-high`, `opus-xhigh`). Ningún archivo de `lib/`, `workflows/` ni `hooks/` repite un escalón ni una lista de nombres de modelo que decida un escalón.
- **Mensajes en inglés, tal como están escritos aquí**, porque las pruebas los comparan.
- **Los verificadores estructurales** `tests/guards-*.test.js`, `tests/dormant-030.test.js` y `tests/layers.test.js` no los edita ninguna tarea; si uno falla por un cambio, el cambio se corrige en el archivo propio.
- **Fuera de alcance de toda tarea** (spec, «Out of scope»): los otros harness y `config/lanes.json`, el orden entre harness, el revisor y las tareas de solo lectura de #193 y #196, el arranque del Lead, la versión (`0.36.0` no se toca), `git push`, la fusión a `main`, y escribir bajo `specs/` o `.specify/`.
- **Antes de dar una tarea por hecha**, `npm test` pasa entero (lo corre cada fusión).

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [US2] Aceptar en la prueba R21 los extractos de evidencia que el spec nombra, en `tests/guards.test.js` → Task 1
- [ ] T002 [P] [US1] [US8] [US9] Calcular la escalera con la ley de Pareto y comparar dos escaleras, en `plugins/aether/lib/pareto.js` → Task 2
- [ ] T003 [P] [US1] [US12] Escribir las cifras de código de Claude en la tabla y quitar la lista de modelos, en `plugins/aether/config/pairs.json` y `lib/pairs.js` → Task 3
- [ ] T004 [US12] Suelo estricto del supervisor con la superdelegación, en `plugins/aether/lib/superdelegation.js` → Task 3
- [ ] T005 [US1] [US2] [US3] [US5] [US6] Guardar la escalera, subir un escalón por intento, frenar la causa repetida y dar el supervisor del escalón, en `plugins/aether/lib/ladder.js`, `config/ladder.json` y `lib/wt-ladder.js` → Task 4
- [ ] T006 [US3] [US5] [US10] [US11] Delegados y autorizaciones sobre la escalera nueva, en `plugins/aether/lib/delegate-task.js` y `lib/delegate-authorize.js` → Task 5
- [ ] T007 [US4] [US6] Enjambre: supervisor por escalón, causas de subida e informe, en `plugins/aether/workflows/run.workflow.js` y `lib/report.js` → Task 6
- [ ] T008 [US7] Refresco de cifras desde las páginas de modelo y resumen de la escalera, en `scripts/refresh-lanes.js` y `.claude/skills/artificial-analysis/aa-api.js` → Task 7
- [ ] T009 Describir la ley, la escalera y el supervisor en las reglas del Lead y las guías que las pruebas atan a `config/ladder.json`, en `plugins/aether/skills/` y `docs/guide/delegates.md` → Task 8
- [ ] T010 Registrar la decisión A121, el changelog y el resto del texto que repite la escalera vieja, en `docs/` y `CLAUDE.md` → Task 9

---

### Task 1: Aceptar en la prueba R21 los extractos de evidencia que el spec nombra

**Aether:**
- Area: guards
- Owns: `tests/guards.test.js`
- Depends on: none
- Serves: R17

**Interfaces:**
Solo cambia la prueba `R21: the retired document folders are gone and the last handoff stays` de `tests/guards.test.js`. No hay código de producto.

**Tests (write first):**
La prueba falla hoy (es la línea base roja: `specs/032-pareto-ladder/evidence/` tiene dos archivos rastreados). Sustituye su última aserción, `assert.deepEqual(tracked('specs').filter((f) => /\/evidence\//.test(f)), [])`, por:

```js
  // The evidence a spec names as its source stays tracked (spec 032, R17); no other evidence folder under specs/ does.
  const KEPT_EVIDENCE = /^specs\/032-pareto-ladder\/evidence\/aa-pages-(claude|other-harnesses)-2026-11-10\.json$/
  const evidence = tracked('specs').filter((f) => /\/evidence\//.test(f))
  assert.deepEqual(evidence.filter((f) => !KEPT_EVIDENCE.test(f)), [])
  assert.ok(evidence.includes('specs/032-pareto-ladder/evidence/aa-pages-claude-2026-11-10.json'))
```

**Acceptance:**
- `node --test tests/guards.test.js` pasa, y `npm test` entero vuelve a estar en verde.
- La prueba sigue rechazando cualquier otra carpeta `evidence/` rastreada bajo `specs/` y las carpetas retiradas de `docs/`.
- Ningún otro archivo cambia.

---

### Task 2: Calcular la escalera con la ley de Pareto y comparar dos escaleras

**Aether:**
- Area: ladder-law
- Owns: `plugins/aether/lib/pareto.js`, `tests/pareto.test.js`, `docs/reference/components.md`
- Depends on: Task 1 — la línea base de `npm test` está en rojo hasta que `R21` acepte la evidencia
- Serves: R1, R5, R15

**Interfaces:**
`plugins/aether/lib/pareto.js`, cabecera de 2 líneas con `// Family: none.`, y su nombre añadido a la línea «Loose modules (no family)» de `docs/reference/components.md` (una sola línea más; no se toca otra cosa de la página).

```js
// rows: the rows of the pairs table (any harness). law: { candidateEfforts: string[], minJumpPoints: number }.
// Returns the ladder, lowest step first: [{ model, effort, intelligence, code }]. Pure: it reads no model name and
// changes neither argument.
function ladderFrom(rows, law)

// stored, computed: lists of { model, effort }. Returns the differences by position, [] when there are none:
//   `changed rung N: stored <model> <effort>, the law gives <model> <effort>`
//   `missing rung N: <model> <effort>`   (the law gives it, the stored ladder has no rung N)
//   `extra rung N: <model> <effort>`     (the stored ladder has it, the law gives no rung N)
function diffLadder(stored, computed)

module.exports = { ladderFrom, diffLadder }
```

La ley de `ladderFrom`, en este orden:
1. **Reserva:** las filas con `harness === 'claude'` cuyas cuatro cifras (`intelligence`, `costPerTaskUsd`, `code`, `codeCostPerTaskUsd`) son números finitos. Una fila sin alguna no entra ni descarta a nadie.
2. **Candidatos:** las filas de la reserva con `effort` en `law.candidateEfforts`.
3. **Descarte:** sale el candidato `c` si hay otra fila `o` de la reserva (`o !== c`, de cualquier modelo y esfuerzo) con `o.intelligence >= c.intelligence` y `o.costPerTaskUsd < c.costPerTaskUsd`, o con `o.code >= c.code` y `o.codeCostPerTaskUsd < c.codeCostPerTaskUsd`.
4. **Orden:** por `intelligence` ascendente; a igual cifra, por `costPerTaskUsd` ascendente.
5. **Salto mínimo:** se recorren en orden contra la lista `kept`. El nuevo `n` entra si no hay último, o si sube al menos `law.minJumpPoints` sobre el último `k` **en las dos cifras** (`intelligence` y `code`). Si no, queda el de menor `costPerTaskUsd` (a igual costo, el de más `intelligence`): si `n` es el elegido, sale `k` y `n` se compara con el nuevo último (repetir); si lo es `k`, sale `n`. Las diferencias se comparan en centésimas enteras (`Math.round(x * 100)`), de modo que 2,00 cuenta como 2.

**Tests (write first):**
`tests/pareto.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { ladderFrom, diffLadder } = require('../plugins/aether/lib/pareto.js')

const LAW = { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 }
const EVIDENCE = path.join(__dirname, '..', 'specs', '032-pareto-ladder', 'evidence', 'aa-pages-claude-2026-11-10.json')
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits
const names = (rungs) => rungs.map((rung) => `${rung.model} ${rung.effort}`)

// The table of the extract of 2026-11-10: the model and the effort come from the slug (claude-<model>-5-5[-<effort>];
// without an effort suffix the page is max); the code figure is the fraction times 100.
function tableOfEvidence() {
  const pages = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'))
  return Object.values(pages).map((page) => {
    const [, model, , , effort = 'max'] = page.slug.split('-')
    const code = page.evals['terminalbench-4-0']
    return {
      harness: 'claude', model, effort,
      intelligence: round(page.scalars.intelligenceIndex, 1),
      costPerTaskUsd: round(page.objects.intelligenceIndexCostPerTask.cost.total, 3),
      code: round(code.score * 100, 2),
      codeCostPerTaskUsd: round(code.costUsd, 3),
    }
  })
}

// A row of a sample table: model names that exist in no table of the project.
const row = (model, effort, intelligence, costPerTaskUsd, code, codeCostPerTaskUsd) =>
  ({ harness: 'claude', model, effort, intelligence, costPerTaskUsd, code, codeCostPerTaskUsd })
const BASE = [
  row('haiku-5', 'high', 20, 0.1, 10, 0.1),
  row('haiku-5', 'xhigh', 30, 0.2, 20, 0.2),
  row('sonnet-5', 'high', 40, 1, 35, 1),
  row('sonnet-5', 'xhigh', 50, 3, 45, 3),
]
const OPUS_6 = [row('opus-6', 'high', 62, 2, 60, 2.5), row('opus-6', 'xhigh', 70, 4, 66, 4.5)]

test('the law gives the five steps of the figures of 2026-11-10, each one up in code and in intelligence', () => {
  const rungs = ladderFrom(tableOfEvidence(), LAW)
  assert.deepEqual(names(rungs), ['haiku high', 'haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh'])
  for (let i = 1; i < rungs.length; i++) {
    assert.ok(rungs[i].code > rungs[i - 1].code, `code up at ${i}`)
    assert.ok(rungs[i].intelligence > rungs[i - 1].intelligence, `intelligence up at ${i}`)
  }
})

test('sonnet xhigh is out: opus high gives more intelligence for less cost per task, though sonnet xhigh gives more code', () => {
  const table = tableOfEvidence()
  const get = (model, effort) => table.find((r) => r.model === model && r.effort === effort)
  assert.ok(get('opus', 'high').intelligence > get('sonnet', 'xhigh').intelligence)
  assert.ok(get('opus', 'high').costPerTaskUsd < get('sonnet', 'xhigh').costPerTaskUsd)
  assert.ok(get('sonnet', 'xhigh').code > get('opus', 'high').code)
  assert.ok(!names(ladderFrom(table, LAW)).includes('sonnet xhigh'))
})

test('a new Opus before the new Sonnet gives a ladder with five steps, with no code change', () => {
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5 high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a new Sonnet before the new Opus gives another valid ladder, with four steps', () => {
  const table = [
    BASE[0], BASE[1],
    row('sonnet-6', 'high', 45, 1.2, 40, 1.2), row('sonnet-6', 'xhigh', 58, 2.5, 55, 2.8),
    row('opus-5', 'high', 52, 3.5, 50, 4), row('opus-5', 'xhigh', 57, 6, 54, 8),
  ]
  assert.deepEqual(names(ladderFrom(table, LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-6 high', 'sonnet-6 xhigh'])
})

test('a model with no code figures neither enters nor knocks anybody out, however good its intelligence', () => {
  const noCode = row('opus-7', 'high', 90, 0.5, null, null)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, noCode], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
  const rows = ladderFrom([noCode, { ...noCode, code: undefined }], LAW)
  assert.deepEqual(rows, [])
})

test('a pair that is not up by the minimum jump in both figures does not make a step of its own: the cheaper stays', () => {
  // Intelligence 39 and code 36 at cost 0.9 against sonnet-5 high at 40 and 35 at cost 1: one point apart, so the cheaper stays.
  const nearer = row('sonnet-5b', 'high', 39, 0.9, 36, 1.2)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, nearer], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5b high', 'opus-6 high', 'opus-6 xhigh'])
  // The minimum is data: with a minimum of 0.5 both stay, in the order of intelligence.
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, nearer], { ...LAW, minJumpPoints: 0.5 })),
    ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5b high', 'sonnet-5 high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a pair that goes up in one figure and down in the other is not a step above: the cheaper stays', () => {
  const sideways = row('zeta', 'high', 45, 1.5, 30, 0.5)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, sideways], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
})

test('the efforts that are candidates are data, and the law changes neither the table nor the law', () => {
  const table = Object.freeze([...BASE, ...OPUS_6].map((r) => Object.freeze({ ...r })))
  const law = Object.freeze({ candidateEfforts: Object.freeze(['xhigh']), minJumpPoints: 2 })
  assert.deepEqual(names(ladderFrom(table, law)), ['haiku-5 xhigh', 'opus-6 xhigh'])
})

test('rows of another harness are not read', () => {
  const other = { ...row('opus-6', 'high', 99, 0.1, 99, 0.1), harness: 'agy' }
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, other], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
})

test('diffLadder names the step that is missing, extra or changed, and is empty when the two agree', () => {
  const law = [{ model: 'a', effort: 'high' }, { model: 'b', effort: 'high' }, { model: 'b', effort: 'xhigh' }]
  assert.deepEqual(diffLadder(law, law), [])
  assert.deepEqual(diffLadder([law[0], law[2]], law), ['changed rung 2: stored b xhigh, the law gives b high', 'missing rung 3: b xhigh'])
  assert.deepEqual(diffLadder(law, [law[0]]), ['extra rung 2: b high', 'extra rung 3: b xhigh'])
})
```

**Acceptance:**
- `node --test tests/pareto.test.js` pasa; `npm test` pasa entero, incluidas las comprobaciones de `tests/guards.test.js` sobre el archivo nuevo y `docs/reference/components.md`.
- `pareto.js` no contiene ningún nombre de modelo (`haiku`, `sonnet`, `opus`) ni lee `config/`: recibe la tabla y la ley como argumentos.

---

### Task 3: Escribir las cifras de código de Claude en la tabla y quitar la lista de modelos

**Aether:**
- Area: pairs
- Owns: `plugins/aether/config/pairs.json`, `plugins/aether/lib/pairs.js`, `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/lane-pick.js`, `plugins/aether/lib/lane-delegate.js`, `tests/pairs.test.js`, `tests/pairs-claude.test.js`, `tests/superdelegation*.test.js`, `tests/lane-pick*.test.js`, `tests/lane-delegate*.test.js`, `tests/muse-spark.test.js`, `tests/seats.test.js`, `tests/seats-design.test.js`, `tests/seat-calls.test.js`, `tests/exam.test.js`
- Depends on: Task 1 — la línea base de `npm test` está en rojo hasta que `R21` acepte la evidencia
- Serves: R5, R9, R11, R13, R17, R19

**Interfaces:**
1. **`plugins/aether/config/pairs.json`.** Las 15 filas `claude/*` se reescriben con las cifras de `specs/032-pareto-ladder/evidence/aa-pages-claude-2026-11-10.json` (por su `slug`: `claude-<modelo>-5-5-<esfuerzo>`; el de `max` no lleva sufijo): `intelligence` (`scalars.intelligenceIndex`), `costPerTaskUsd` (`objects.intelligenceIndexCostPerTask.cost.total`), y tres campos nuevos de `evals['terminalbench-4-0']`: `code` (`score` por 100), `codeCostPerTaskUsd` (`costUsd`) y `codeMinutesPerTask` (`seconds` entre 60), con el redondeo de las restricciones globales. `fetchedAt` pasa a `"2026-11-10"`. `outputTokensPerSecond` y `timeToFirstTokenS` de esas filas quedan como están. Las 35 filas de los otros harness (también las `agy/claude-*`) no cambian ni en una cifra; el archivo conserva una fila por línea y su estilo. No hay llamada a la red: las cifras salen del extracto.
2. **`lib/pairs.js`.** Sale `NATIVE_MODELS` (y su comprobación del modelo en `validatePair`). `validatePair` exige en las filas con `harness === 'claude'` los tres campos nuevos: `code` número de 0 a 100 (`code must be a number from 0 to 100`), `codeCostPerTaskUsd` y `codeMinutesPerTask` números de al menos 0 (`<campo> must be a number of at least 0`); las filas de otros harness no los necesitan. Nueva exportación:
   ```js
   // The models of the Claude rows, in table order, without repeats.
   function nativeModels(pairs) // string[]
   ```
3. **`lib/lane-pick.js` y `lib/lane-delegate.js`.** `--model` de `aether-lane pick` y de `aether-lane delegate` se valida contra `nativeModels(<tabla cargada>)` y no contra una lista fija. El texto de uso de `DELEGATE_USAGE` puede seguir diciendo `<haiku|sonnet|opus>`. `reviewerReference` y el campo `ladder` del `graph.json` de `lane-delegate.js` no se tocan.
4. **`lib/superdelegation.js`.** `choose` ya no usa `NATIVE_MODELS` (las filas nativas son las del harness `claude`). Para `role === 'supervisor'`: (a) el suelo de las elecciones externas es **estricto**: `floor = tenths(requested)`, sin restar `TOLERANCE_TENTHS`; (b) `nativeFor` solo toma un reemplazo que no es autor si su `intelligence` es al menos la del par de referencia; si ninguno lo es, se conserva el par de referencia, marcado `none` como hoy cuando todos son autores. Para los demás roles nada cambia.

**Tests (write first):**
`tests/pairs-claude.test.js` (nuevo):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { loadPairs, nativeModels } = require('../plugins/aether/lib/pairs.js')

const EVIDENCE = path.join(__dirname, '..', 'specs', '032-pareto-ladder', 'evidence', 'aa-pages-claude-2026-11-10.json')
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits
const claudeRow = (over = {}) => ({
  id: 'claude/opus-6@high', slug: 'claude-opus-6-high', harness: 'claude', model: 'opus-6', family: 'claude-opus-6', effort: 'high', group: null,
  intelligence: 60, costPerTaskUsd: 3, outputTokensPerSecond: 70, timeToFirstTokenS: 9, code: 55, codeCostPerTaskUsd: 4, codeMinutesPerTask: 15, ...over,
})
const tableFile = (t, pairs) => {
  const file = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-11-10', pairs }))
  return file
}

test('the Claude rows carry the figures of the extract of 2026-11-10, with the code figures', () => {
  const pages = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'))
  const { fetchedAt, pairs } = loadPairs()
  assert.equal(fetchedAt, '2026-11-10')
  const claude = pairs.filter((pair) => pair.harness === 'claude')
  assert.equal(claude.length, 15)
  for (const pair of claude) {
    const page = pages[pair.slug]
    const code = page.evals['terminalbench-4-0']
    assert.deepEqual(
      [pair.intelligence, pair.costPerTaskUsd, pair.code, pair.codeCostPerTaskUsd, pair.codeMinutesPerTask],
      [round(page.scalars.intelligenceIndex, 1), round(page.objects.intelligenceIndexCostPerTask.cost.total, 3), round(code.score * 100, 2), round(code.costUsd, 3), round(code.seconds / 60, 1)],
      pair.id,
    )
  }
  const opusHigh = claude.find((pair) => pair.id === 'claude/opus@high')
  assert.deepEqual([opusHigh.intelligence, opusHigh.costPerTaskUsd, opusHigh.code], [51.8, 3.465, 56.57])
})

test('the rows of the other harnesses are as they were, with no code figures', () => {
  const others = loadPairs().pairs.filter((pair) => pair.harness !== 'claude')
  assert.equal(others.length, 35)
  assert.equal(others.find((pair) => pair.id === 'agy/claude-opus-5-5@high').intelligence, 51.7)
  assert.equal(others.find((pair) => pair.id === 'codex/gpt-6.1-sol@high').costPerTaskUsd, 0.591)
  assert.ok(others.every((pair) => !('code' in pair)))
})

test('a Claude row needs its three code figures, any model name goes, and another harness needs none', (t) => {
  assert.equal(loadPairs(tableFile(t, [claudeRow()])).pairs.length, 1)
  const rule = { code: /code must be a number from 0 to 100/, codeCostPerTaskUsd: /codeCostPerTaskUsd must be a number of at least 0/, codeMinutesPerTask: /codeMinutesPerTask must be a number of at least 0/ }
  for (const [field, pattern] of Object.entries(rule)) {
    const row = claudeRow()
    delete row[field]
    assert.throws(() => loadPairs(tableFile(t, [row])), pattern, field)
  }
  assert.throws(() => loadPairs(tableFile(t, [claudeRow({ code: 120 })])), /code must be a number from 0 to 100/)
  const outside = { ...claudeRow({ id: 'agy/x@high', harness: 'agy', model: 'x', family: 'x', group: 'g' }) }
  for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask']) delete outside[field]
  assert.equal(loadPairs(tableFile(t, [outside])).pairs.length, 1)
})

test('nativeModels lists the models of the Claude rows in table order, and the table names them, not a list in the code', () => {
  assert.deepEqual(nativeModels(loadPairs().pairs), ['haiku', 'sonnet', 'opus'])
  const rows = [claudeRow(), claudeRow({ id: 'claude/opus-6@xhigh', effort: 'xhigh', slug: 'claude-opus-6-xhigh' }), claudeRow({ id: 'claude/sonnet-6@high', model: 'sonnet-6', family: 'claude-sonnet-6', slug: 'claude-sonnet-6-high' })]
  assert.deepEqual(nativeModels(rows), ['opus-6', 'sonnet-6'])
  assert.equal(Object.hasOwn(require('../plugins/aether/lib/pairs.js'), 'NATIVE_MODELS'), false)
})
```

`tests/superdelegation-supervisor.test.js` (nuevo):

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { choose } = require('../plugins/aether/lib/superdelegation.js')

const claude = (model, effort, intelligence, costPerTaskUsd) =>
  ({ id: `claude/${model}@${effort}`, harness: 'claude', model, family: `claude-${model}`, effort, group: null, intelligence, costPerTaskUsd })
const outside = (model, intelligence, costPerTaskUsd) =>
  ({ id: `agy/${model}@high`, harness: 'agy', model, family: model, effort: 'high', group: 'g', intelligence, costPerTaskUsd })
const LANES = { harnesses: { agy: { models: { near: { roles: ['implementer', 'supervisor'] }, exact: { roles: ['implementer', 'supervisor'] } } } } }
const HEALTHY = { agy: { installed: true, groups: { g: { usable: true, unknown: false, mark: null, resetsAt: null } } } }
const ask = (pairs, role, more = {}) => choose({ pairs, reference: { model: 'opus', effort: 'high' }, harnesses: HEALTHY, role, lanes: LANES, ...more })

test('the supervisor floor is strict: a pair one tenth under the level is out, and the tolerance still serves the implementer', () => {
  const pairs = [claude('opus', 'high', 51.8, 3.465), outside('near', 51.3, 0.5)]
  assert.equal(ask(pairs, 'implementer').picked.id, 'agy/near@high')
  const supervisor = ask(pairs, 'supervisor')
  assert.equal(supervisor.picked, null)
  assert.equal(supervisor.native.id, 'claude/opus@high')
})

test('a pair at the level of the supervisor is a candidate for it', () => {
  const pairs = [claude('opus', 'high', 51.8, 3.465), outside('exact', 51.8, 0.5)]
  assert.equal(ask(pairs, 'supervisor').picked.id, 'agy/exact@high')
})

test('the replacement of an author model for the supervisor never gives fewer points than the level', () => {
  const pairs = [claude('opus', 'high', 51.8, 3.465), claude('sonnet', 'high', 41.5, 1.636)]
  const authors = ['claude-opus']
  assert.equal(ask(pairs, 'supervisor', { authors, nativeDiffers: true }).native.id, 'claude/opus@high')
  // Any other role keeps the replacement by closest points, as before.
  assert.equal(ask(pairs, 'reviewer', { authors, nativeDiffers: true }).native.id, 'claude/sonnet@high')
  // A replacement that is not weaker is taken.
  const stronger = [...pairs, claude('sonnet-6', 'high', 55, 2)]
  assert.equal(ask(stronger, 'supervisor', { authors, nativeDiffers: true }).native.id, 'claude/sonnet-6@high')
})
```
Las pruebas existentes de `pairs`, `superdelegation`, `lane-pick`, `muse-spark`, `seats`, `seats-design`, `seat-calls` y `exam` que fijan cifras de la tabla vieja (`51.7`, `41.1`, `49.6`, `58.4`, `53.6`…) se actualizan a las cifras nuevas: es el único cambio que se les permite, y sus aserciones de comportamiento no se relajan.

**Acceptance:**
- `npm test` pasa entero. `pairs.json` conserva una fila por línea, y las 35 filas ajenas a Claude quedan idénticas byte a byte.
- `grep -rn NATIVE_MODELS plugins/aether` no encuentra nada.
- `aether-lane pick --model <modelo de una fila de Claude de la tabla>` se acepta, y un modelo que no está en la tabla se rechaza con el mensaje de uso de siempre.

---

### Task 4: Guardar la escalera, subir un escalón por intento, frenar la causa repetida y dar el supervisor del escalón

**Aether:**
- Area: ladder
- Owns: `plugins/aether/lib/ladder.js`, `plugins/aether/config/ladder.json`, `plugins/aether/lib/wt-ladder.js`, `tests/ladder.test.js`, `tests/ladder-gate-cut.test.js`, `tests/ladder-one-source.test.js`, `tests/ladder-stored.test.js`, `tests/ladder-supervisor.test.js`, `tests/ladder-no-model-list.test.js`, `tests/copies-ladder.test.js`, `tests/wt-ladder.test.js`
- Depends on: Task 2 — `ladderFrom` y `diffLadder` para la comprobación de la escalera guardada
- Depends on: Task 3 — las filas de Claude de la tabla con las cifras de código y sin la lista de modelos
- Merges with: Task 5, Task 6, Task 8
- Serves: R2, R3, R6, R7, R8, R9, R10

**Interfaces:**
`plugins/aether/config/ladder.json` (los cinco escalones salen de la ley sobre `config/pairs.json`; los datos de la ley son los de la tarea):
```json
{
  "law": { "candidateEfforts": ["high", "xhigh"], "minJumpPoints": 2 },
  "supervisorFloor": 3,
  "repeatBlocked": 2,
  "rungs": [
    { "step": "haiku-high", "model": "haiku", "effort": "high" },
    { "step": "haiku-xhigh", "model": "haiku", "effort": "xhigh" },
    { "step": "sonnet-high", "model": "sonnet", "effort": "high" },
    { "step": "opus-high", "model": "opus", "effort": "high" },
    { "step": "opus-xhigh", "model": "opus", "effort": "xhigh" }
  ]
}
```
`plugins/aether/lib/ladder.js` (sigue siendo una función pura sobre ese archivo; ningún número ni nombre de la escalera escrito en el código):
```js
loadLadder(file?)            // { rungs: [{ step, model, effort }], repeatBlocked: int >= 1, supervisorFloor: int >= 1, law: { candidateEfforts, minJumpPoints } }
                             // throws `ladder: ...` on a rung with no step, model or effort, an effort not in low|medium|high|xhigh|max, a repeated step, or a bad count
newState(ladder, step = null) // { step, attempts: 0, repeats: 0, lastKeys: null, blockedKey: null, blockedCount: 0, status: 'open' }
effortFor(ladder, step)       // the effort of the rung (no launch kind any more)
supervisorOf(ladder, step)    // { step, model, effort }: the rung that supervises an author on `step`
judge(state, verdict, ladder) // same verdict kinds as today: approve | fix | infeasible | attempt
stateOf(inputs, ladder, step = null)
module.exports = { loadLadder, newState, parseFinding, findingKey, effortFor, supervisorOf, judge, stateOf, GATE_CUT }
```
`supervisorOf`: con `i` el índice del escalón y `n` los escalones, el supervisor es el escalón `max(min(i + 1, n - 1), min(supervisorFloor, n) - 1)`: el siguiente (el último se supervisa a sí mismo), nunca bajo el escalón de piso (`supervisorFloor` cuenta posiciones desde 1).

Política de `judge`:
- `approve`: como hoy (`status: 'approved'`).
- `fix` (con hallazgos concretos, como hoy) e `infeasible` (con motivo): suben **un** escalón: `next = { step, kind: 'rise', cause: 'failed' | 'infeasible', effort: effortFor(ladder, step), carry }`, `attempts + 1`. Del último escalón, `status: 'exhausted'` y `next = { step: null, kind: 'exhausted', cause: 'exhausted', effort: null, carry }`. Salen `correctionsUsed`, el tope de correcciones, `effort.first/retry` y la subida `repeated`.
- **El freno** (`repeatBlocked`, hoy 2): los mismos cambios fuera de `Owns` repetidos (las reglas de `isOutsideOwns` y `fileKey` de hoy) bloquean la tarea **en el escalón en que está** (`status: 'blocked'`, `next.kind: 'blocked'`, `cause: 'blocked-outside-owns'`); lo mismo, un intento `kind: 'attempt'` con `status: 'BLOCKED'` y el mismo motivo (`blocked-same-cause`). Las cuentas (`repeats`, `lastKeys`, `blockedKey`, `blockedCount`) **pasan de un escalón al siguiente**: una subida no las reinicia. Un corte de la compuerta (`GATE_CUT`, #112) no cuenta como causa repetida ni la rompe, como hoy.

`plugins/aether/lib/wt-ladder.js`: `ladderCommand` sigue igual de firma y la vista queda así (`supervisor` y `position`/`of` nuevos; salen `corrections` y `correctionsUsed`):
```js
{ task, status, step, model, effort, supervisor: { model, effort } | null, position, of, kind, cause, reason?, attempts, blockedCount? }
// position: 1-based index of the rung; of: number of rungs; step, model, effort, supervisor, position are null when the task is not open
```
`initialRecord` arranca en el primer escalón con `kind: 'first'` y el esfuerzo de ese escalón.

**Tests (write first):**
`tests/ladder.test.js` se reescribe a este contrato (los casos de correcciones y de subida por hallazgos repetidos salen). Con la escalera de las pruebas definida en el archivo, no leída de `config/`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLadder, newState, effortFor, judge, stateOf } = require('../plugins/aether/lib/ladder.js')

const L = {
  law: { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 },
  supervisorFloor: 3,
  repeatBlocked: 2,
  rungs: [
    { step: 'haiku-high', model: 'haiku', effort: 'high' },
    { step: 'haiku-xhigh', model: 'haiku', effort: 'xhigh' },
    { step: 'sonnet-high', model: 'sonnet', effort: 'high' },
    { step: 'opus-high', model: 'opus', effort: 'high' },
    { step: 'opus-xhigh', model: 'opus', effort: 'xhigh' },
  ],
}
const fix = (file, what) => ({ kind: 'fix', findings: [{ file, what }] })
const OUT = (file) => fix(file, 'changes outside Owns')

test('every rejected attempt rises one rung with that rung\'s effort, and the fifth leaves the task exhausted', () => {
  let state = newState(L)
  const seen = []
  for (let n = 1; n <= 5; n++) {
    const answer = judge(state, fix(`src/f${n}.js`, `missing case ${n}`), L)
    assert.equal(answer.accepted, true)
    state = answer.state
    seen.push([answer.next.kind, answer.next.cause, answer.next.step, answer.next.effort])
  }
  assert.deepEqual(seen, [
    ['rise', 'failed', 'haiku-xhigh', 'xhigh'], ['rise', 'failed', 'sonnet-high', 'high'], ['rise', 'failed', 'opus-high', 'high'],
    ['rise', 'failed', 'opus-xhigh', 'xhigh'], ['exhausted', 'exhausted', null, null],
  ])
  assert.deepEqual([state.status, state.attempts], ['exhausted', 5])
  assert.equal(judge(state, { kind: 'approve' }, L).accepted, false)
})

test('the same findings twice are two rises, not a block: there is no rise by repeated findings any more', () => {
  const a = judge(newState(L), fix('src/a.js', 'missing case'), L)
  const b = judge(a.state, fix('src/a.js', 'missing case'), L)
  assert.deepEqual([a.next.step, b.next.step, b.next.cause], ['haiku-xhigh', 'sonnet-high', 'failed'])
})

test('infeasible with a reason rises one rung; without a reason it is refused', () => {
  assert.equal(judge(newState(L), { kind: 'infeasible' }, L).accepted, false)
  const answer = judge(newState(L), { kind: 'infeasible', reason: 'the brief asks for a file nobody owns' }, L)
  assert.deepEqual([answer.next.kind, answer.next.cause, answer.next.step], ['rise', 'infeasible', 'haiku-xhigh'])
})

test('the same change outside Owns twice blocks the task on the rung it is on, across a rise', () => {
  const first = judge(newState(L), OUT('tests/x.test.js'), L)
  assert.equal(first.next.kind, 'rise')
  const second = judge(first.state, OUT('tests/x.test.js'), L)
  assert.deepEqual([second.next.kind, second.next.cause, second.state.status, second.state.step], ['blocked', 'blocked-outside-owns', 'blocked', 'haiku-xhigh'])
  assert.match(second.next.reason, /outside Owns/)
})

test('a change outside Owns in two different files is two rises, and the repeat count is data', () => {
  const first = judge(newState(L), OUT('tests/x.test.js'), L)
  assert.equal(judge(first.state, OUT('tests/y.test.js'), L).next.kind, 'rise')
  const loose = { ...L, repeatBlocked: 3 }
  const a = judge(newState(loose), OUT('tests/x.test.js'), loose)
  const b = judge(a.state, OUT('tests/x.test.js'), loose)
  assert.equal(b.next.kind, 'rise')
  assert.equal(judge(b.state, OUT('tests/x.test.js'), loose).next.kind, 'blocked')
})

test('the same reason in two BLOCKED attempt reports blocks the task, with a rise between them', () => {
  const attempt = { kind: 'attempt', status: 'BLOCKED', reason: 'the test I cannot touch fails' }
  const first = judge(newState(L), attempt, L)
  assert.equal(first.next, null)
  const risen = judge(first.state, fix('src/a.js', 'missing case'), L)
  assert.equal(risen.next.step, 'haiku-xhigh')
  const second = judge(risen.state, attempt, L)
  assert.deepEqual([second.next.kind, second.next.cause, second.state.status, second.state.step], ['blocked', 'blocked-same-cause', 'blocked', 'haiku-xhigh'])
})

test('the effort of a rung is the rung\'s, and stateOf folds the recorded verdicts from the rung a task starts on', () => {
  assert.equal(effortFor(L, 'sonnet-high'), 'high')
  assert.throws(() => effortFor(L, 'nope'), /unknown step nope/)
  const state = stateOf([fix('src/a.js', 'one'), fix('src/b.js', 'two')], L, 'sonnet-high')
  assert.deepEqual([state.step, state.attempts, state.status], ['opus-xhigh', 2, 'open'])
})

test('loadLadder reads the stored ladder and refuses a rung with no effort, an effort that does not exist and a repeated step', () => {
  const shipped = loadLadder()
  assert.deepEqual(shipped.rungs.map((r) => r.step), ['haiku-high', 'haiku-xhigh', 'sonnet-high', 'opus-high', 'opus-xhigh'])
  assert.deepEqual([shipped.repeatBlocked, shipped.supervisorFloor, shipped.law.minJumpPoints], [2, 3, 2])
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const write = (data) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-ladder-')), 'ladder.json')
    fs.writeFileSync(file, JSON.stringify(data))
    return file
  }
  assert.throws(() => loadLadder(write({ ...L, rungs: [{ step: 'a', model: 'a' }] })), /ladder: rungs\[0\]/)
  assert.throws(() => loadLadder(write({ ...L, rungs: [{ step: 'a', model: 'a', effort: 'huge' }] })), /effort/)
  assert.throws(() => loadLadder(write({ ...L, rungs: [L.rungs[0], L.rungs[0]] })), /same step/)
  assert.throws(() => loadLadder(write({ ...L, supervisorFloor: 0 })), /supervisorFloor/)
})
```
`tests/ladder-gate-cut.test.js` se adapta: un veredicto que es solo un corte de la compuerta (`GATE_CUT`) sube un escalón como cualquier intento fallido, y dos cortes seguidos no bloquean ni cuentan como causa repetida.

`tests/ladder-supervisor.test.js` (nuevo):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { supervisorOf } = require('../plugins/aether/lib/ladder.js')

const RUNGS = [
  { step: 'haiku-high', model: 'haiku', effort: 'high' }, { step: 'haiku-xhigh', model: 'haiku', effort: 'xhigh' },
  { step: 'sonnet-high', model: 'sonnet', effort: 'high' }, { step: 'opus-high', model: 'opus', effort: 'high' },
  { step: 'opus-xhigh', model: 'opus', effort: 'xhigh' },
]
const ladder = (over = {}) => ({ law: {}, repeatBlocked: 2, supervisorFloor: 3, rungs: RUNGS, ...over })
const of = (l, step) => { const s = supervisorOf(l, step); return `${s.model} ${s.effort}` }

test('with the ladder of today the supervisor of each step is the card\'s: Sonnet high, Sonnet high, Opus high, Opus xhigh, Opus xhigh', () => {
  assert.deepEqual(RUNGS.map((r) => of(ladder(), r.step)), ['sonnet high', 'sonnet high', 'opus high', 'opus xhigh', 'opus xhigh'])
})

test('with another ladder the supervisor is the next step, never under the floor, and the last supervises itself', () => {
  assert.deepEqual(RUNGS.map((r) => of(ladder({ supervisorFloor: 1 }), r.step)), ['haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh', 'opus xhigh'])
  const short = ladder({ rungs: RUNGS.slice(3) })
  assert.deepEqual(short.rungs.map((r) => of(short, r.step)), ['opus xhigh', 'opus xhigh'])
})

test('the supervisor is never weaker than the author, on any ladder and any floor', () => {
  for (const supervisorFloor of [1, 2, 3, 4, 5, 9]) {
    const l = ladder({ supervisorFloor })
    for (const [i, rung] of RUNGS.entries()) assert.ok(RUNGS.findIndex((r) => r.step === supervisorOf(l, rung.step).step) >= i, `${supervisorFloor}/${rung.step}`)
  }
})
```

`tests/ladder-stored.test.js` (nuevo; es la comprobación sin modelo que corre dentro de `npm test`):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { ladderFrom, diffLadder } = require('../plugins/aether/lib/pareto.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')

const names = (rungs) => rungs.map((r) => `${r.model} ${r.effort}`)

test('the stored ladder is what the law gives on the table of today: five rungs', () => {
  const ladder = loadLadder()
  const computed = ladderFrom(loadPairs().pairs, ladder.law)
  assert.deepEqual(names(computed), ['haiku high', 'haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh'])
  assert.deepEqual(diffLadder(ladder.rungs, computed), [])
})

test('an edit of the stored ladder or of the table fails the check, and the message names the rung', () => {
  const ladder = loadLadder()
  const { pairs } = loadPairs()
  const edited = ladder.rungs.map((r) => (r.step === 'opus-high' ? { ...r, model: 'sonnet', effort: 'xhigh' } : r))
  assert.deepEqual(diffLadder(edited, ladderFrom(pairs, ladder.law)), ['changed rung 4: stored sonnet xhigh, the law gives opus high'])
  assert.deepEqual(diffLadder(ladder.rungs.slice(0, 4), ladderFrom(pairs, ladder.law)), ['missing rung 5: opus xhigh'])
  // Sonnet xhigh made cheaper than Opus high comes in and Opus high goes out: the stored ladder no longer matches the table.
  const cheaper = pairs.map((p) => (p.id === 'claude/sonnet@xhigh' ? { ...p, costPerTaskUsd: 3 } : p))
  assert.ok(diffLadder(ladder.rungs, ladderFrom(cheaper, ladder.law)).length > 0)
})
```

`tests/ladder-no-model-list.test.js` (nuevo):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'plugins', 'aether')
const FILES = [
  'lib/pareto.js', 'lib/ladder.js', 'lib/wt-ladder.js', 'lib/pairs.js', 'lib/superdelegation.js', 'lib/lane-pick.js',
  'lib/delegate-task.js', 'lib/delegate-authorize.js', 'lib/delegate-report.js', 'workflows/run.workflow.js', 'hooks/ops-command.mjs',
]
const LIST = /\[\s*['"`](haiku|sonnet|opus)['"`]\s*,/
const NAMES_AS_CONSTANT = /\b(NATIVE_MODELS|TIERS)\b/

test('no code, workflow or hook of the ladder keeps a list of model names that decides a step', () => {
  for (const file of FILES) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.doesNotMatch(text, LIST, file)
    assert.doesNotMatch(text, NAMES_AS_CONSTANT, file)
  }
})
```

`tests/wt-ladder.test.js` se reescribe a la vista nueva, con sus fixtures (`setup`, `carry`, `judged`, `view`):
```js
test('a unit with no state starts on the first rung, and its view names the rung, its place and its supervisor', (t) => {
  const s = setup(t)
  assert.deepEqual(view(s), {
    task: 'task-1', status: 'open', step: 'haiku-high', model: 'haiku', effort: 'high', supervisor: { model: 'sonnet', effort: 'high' },
    position: 1, of: 5, kind: 'first', cause: null, attempts: 0,
  })
  assert.ok(fs.existsSync(path.join(s.args.runDir, 'ladder', 'task-1.json')))
})

test('every rejected attempt moves the unit one rung up with the supervisor of that rung, and the fifth leaves it exhausted', (t) => {
  const s = setup(t)
  const seen = []
  for (let n = 1; n <= 5; n++) {
    const a = judged(s, 'fix', fix(`missing case ${n}`))
    seen.push([a.step, a.effort, a.supervisor && `${a.supervisor.model} ${a.supervisor.effort}`, a.status])
  }
  assert.deepEqual(seen, [
    ['haiku-xhigh', 'xhigh', 'sonnet high', 'open'], ['sonnet-high', 'high', 'sonnet high', 'open'], ['opus-high', 'high', 'opus high', 'open'],
    ['opus-xhigh', 'xhigh', 'opus xhigh', 'open'], [null, null, null, 'exhausted'],
  ])
})
```
El resto de `tests/wt-ladder.test.js` (verbo y verificación del digest, `attempt`, `resetSpent`, bloqueos) se porta al contrato nuevo sin relajar ninguna aserción de comportamiento.

`tests/ladder-one-source.test.js`: «un número cambiado en una escalera cambia el enjambre y los delegados a la vez» pasa a «una escalera más corta cambia el enjambre y los delegados a la vez»: con `SHORT = { ...L, rungs: L.rungs.slice(2) }` (`sonnet-high`, `opus-high`, `opus-xhigh`), una tarea de enjambre que falla dos veces corre en `[sonnet, opus, opus]` y un delegado con dos veredictos `fix` pasa por `['opus-high', 'opus-xhigh']`; con la escalera de `config/` corre en `[haiku, haiku, sonnet]` y `['haiku-xhigh', 'sonnet-high']`. Y la prueba de claves: `Object.keys(ladder).sort()` es `['law', 'repeatBlocked', 'rungs', 'supervisorFloor']`.

`tests/copies-ladder.test.js`: la prueba «ningún archivo de `lib/` ni `hooks/` repite un escalón» busca ahora `\bsupervisorFloor\s*[:=]\s*\d|\bminJumpPoints\s*[:=]\s*[\d.]|\brepeatBlocked\s*[:=]\s*\d|\bcorrections\s*[:=]\s*\d` fuera de `lib/ladder.js` y de `lib/pareto.js`; y la de los datos exige las cuatro claves y los cinco escalones de la tarea.

**Acceptance:**
- Esta tarea se construye junto con las tareas 5, 6 y 8 como **una sola unidad** (`Merges with`): al fusionarse, `npm test` pasa entero con los cuatro lados cambiados (escalera, delegados, enjambre y el texto que las pruebas atan a `config/ladder.json`). Ninguna prueba de este `Owns` queda en rojo o saltada.
- `config/ladder.json` tiene exactamente las cuatro claves y los cinco escalones de arriba; `tests/ladder-stored.test.js` pasa; editar a mano un escalón o una cifra de `config/pairs.json` lo hace fallar con el mensaje de `diffLadder`.
- Ningún nombre de modelo ni número de la escalera está escrito en `lib/ladder.js` ni en `lib/wt-ladder.js`; `tests/ladder-no-model-list.test.js` pasa.

---

### Task 5: Delegados y autorizaciones sobre la escalera nueva

**Aether:**
- Area: delegates
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/delegate-authorize.js`, `plugins/aether/lib/delegate-report.js`, `plugins/aether/lib/observe-baseline.js`, `plugins/aether/lib/observe-detect.js`, `plugins/aether/lib/observe-calibrate.js`, `tests/delegate-*.test.js`, `tests/lane-delegate-ladder.test.js`, `tests/lane-delegate-scenarios.test.js`, `tests/observe-baseline.test.js`, `tests/observe-detect.test.js`, `tests/observe-calibrate.test.js`, `tests/spend-ladder.test.js`, `tests/install-dirs.test.js`, `tests/retired-journal.test.js`
- Depends on: Task 3 — las filas `claude/<modelo>@<esfuerzo>` de la tabla son los pares de referencia de cada escalón
- Merges with: Task 4
- Serves: R6, R7, R9, R10, R11, R18

**Interfaces:**
`lib/delegate-task.js`:
- `begin` y `verdict` leen la escalera con `loadLadder()` (o `deps.ladder`) y usan el esfuerzo del escalón: `effortFor(ladder, step)`. Un lanzamiento es `first`, `rise` o `unjudged`; un veredicto `fix` o `infeasible` hace que el siguiente lanzamiento sea `rise` (el tipo `fix` desaparece). Un lanzamiento sin veredicto del anterior (`unjudged`) repite el escalón y su esfuerzo.
- El esfuerzo de una tarea colocada por el dueño sigue como hoy (`coveredEffort`): el primer lanzamiento corre al esfuerzo que el dueño autorizó, aunque sea menor; un lanzamiento `unjudged` no baja del esfuerzo del escalón ni del del dueño; una `rise` vuelve al esfuerzo del escalón.
- El par de referencia que se pide a `pickPair` es `{ model: <modelo del escalón>, effort: <esfuerzo del escalón> }` (antes `{ model: step, effort }`): se elige por los puntos de ese par, como hoy, y el orden entre harness no cambia. El par de «misma familia con un esfuerzo más» de una corrección (`sameModelPair`) solo se aplica a un lanzamiento `unjudged`; una subida no fija ningún par.
- El resultado de `verdict` pierde `corrections`; conserva `ok, task, verdict, step, next`. El mensaje de una tarea agotada deja de hablar de «correcciones»: `Aether delegate task <id> is exhausted: every step of the ladder was tried, and there is no other step. Do not do any work. Answer only that the task is exhausted, and that the Lead must defer it or take it to the owner's list.`

`lib/delegate-authorize.js`:
```js
// The rung an owner's placement names: the rung of that model with that effort; when no effort is named, or the effort is not
// a rung of the model, the first rung of that model; null when the model has no rung in the ladder.
function rungFor(ladder, model, effort)
module.exports = { ..., rungFor }
```
- `authorize` rechaza el modelo sin escalón, sin escribir nada: `<model> has no step in the ladder: the models with a step are <m1>, <m2>` (los modelos de los escalones sin repetir, en orden de escalera). Un modelo del primer escalón sin esfuerzo sigue rechazándose con `<model> is the first rung: it needs no authorization`; con un esfuerzo que lo coloca en un escalón por encima del primero, se acepta.
- `begin` coloca el primer lanzamiento de una tarea cubierta por una autorización en `rungFor(ladder, <modelo de la llamada>, <esfuerzo de la autorización>)`, y de ahí sube un escalón por intento hasta el último; los intentos son los escalones que quedan. `coverOf`, `holds` y `startStepOf` comparan escalones por posición en la escalera y siguen verificando la cita contra la transcripción.

`lib/delegate-report.js`: el informe por escalón (`ladder.steps`) usa los escalones de `loadLadder()` (`step`, `model`, `effort`, `tasks`, `attempts`, `approved`, `rises`, `infeasible`); `rises` cuenta las causas `failed` e `infeasible`; sale `corrections`. La fila de una tarea (`rowOfTask`) toma el modelo de Claude del **escalón** del lanzamiento (no el `step` entero) para `ranOn.model`. `lib/observe-baseline.js`, `lib/observe-detect.js` (las causas legítimas de una subida son `failed` e `infeasible`, y también `exhausted` y `repeated`, que son las de los registros escritos antes de esta spec y no se reescriben) y `lib/observe-calibrate.js` se adaptan a los identificadores de escalón nuevos y a las causas nuevas; ninguna de las tres pierde una comprobación.

**Tests (write first):**
`tests/delegate-five-rungs.test.js` (nuevo):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')
const delegates = require('../plugins/aether/lib/delegate-task.js')

const L = loadLadder()
const SESSION = 's1'
const world = (t, settings = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }) => {
  const dataDir = tempDir(t, 'aether-data-')
  const asked = []
  let n = 0
  return {
    asked,
    deps: { dataDir, cwd: dataDir, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, ladder: L, pickPair: async (reference) => (asked.push(reference), { pick: null, quota: [] }) },
  }
}
const call = (id, owns = null) => ({ session: SESSION, event: { subagent_type: 'general-purpose', description: 'd', prompt: `AETHER-TASK: ${id}\n${owns ? `AETHER-OWNS: ${owns}\n` : ''}Do the work.` } })
const ran = (plan) => `${plan.step} ${plan.args.model} ${plan.args.effort}`
const fixOf = (n) => `src/f${n}.js:${n}: missing case ${n}`
const judge = (id, verdict, extra = {}) => ({ task: id, verdict, session: SESSION, ...extra })

for (const [name, owns] of [['an editing delegate', 'src/a.js'], ['a read-only delegate', null]]) {
  test(`${name} climbs one rung per rejected attempt and is exhausted and deferred after the fifth`, async (t) => {
    const w = world(t)
    const id = owns ? 'e1' : 'r1'
    const seen = [ran(await delegates.begin(call(id, owns), w.deps))]
    for (let n = 1; n <= 5; n++) {
      const v = await delegates.verdict(judge(id, 'fix', { findings: [fixOf(n)] }), w.deps)
      assert.equal(v.ok, true, v.error)
      assert.equal('corrections' in v, false)
      if (n < 5) {
        assert.deepEqual([v.verdict, v.next.kind, v.next.cause], ['fix', 'rise', 'failed'])
        seen.push(ran(await delegates.begin(call(id, owns), w.deps)))
      } else {
        assert.equal(v.verdict, 'exhausted')
      }
    }
    assert.deepEqual(seen, ['haiku-high haiku high', 'haiku-xhigh haiku xhigh', 'sonnet-high sonnet high', 'opus-high opus high', 'opus-xhigh opus xhigh'])
    assert.match(JSON.stringify(await delegates.begin(call(id, owns), w.deps)), /is exhausted/)
  })
}

test('the same change outside Owns twice blocks the task on its rung; infeasible with a reason rises', async (t) => {
  const w = world(t)
  await delegates.begin(call('b1', 'src/a.js'), w.deps)
  const out = 'tests/x.test.js: changes outside Owns'
  assert.equal((await delegates.verdict(judge('b1', 'fix', { findings: [out] }), w.deps)).next.kind, 'rise')
  await delegates.begin(call('b1', 'src/a.js'), w.deps)
  const blocked = await delegates.verdict(judge('b1', 'fix', { findings: [out] }), w.deps)
  assert.deepEqual([blocked.next.kind, blocked.next.cause, blocked.step], ['blocked', 'blocked-outside-owns', 'haiku-xhigh'])

  await delegates.begin(call('i1'), w.deps)
  const rose = await delegates.verdict(judge('i1', 'infeasible', { reason: 'the brief asks for a file nobody owns' }), w.deps)
  assert.deepEqual([rose.next.kind, rose.next.cause, rose.step], ['rise', 'infeasible', 'haiku-xhigh'])
  assert.equal((await delegates.verdict(judge('i1', 'infeasible'), w.deps)).ok, false)
})

test('a task that runs on another harness is chosen by the points of the reference pair of its rung', async (t) => {
  const w = world(t, { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } })
  await delegates.begin(call('o1', 'src/a.js'), w.deps)
  await delegates.verdict(judge('o1', 'fix', { findings: [fixOf(1)] }), w.deps)
  await delegates.begin(call('o1', 'src/a.js'), w.deps)
  assert.deepEqual(w.asked, [{ model: 'haiku', effort: 'high' }, { model: 'haiku', effort: 'xhigh' }])
})
```
En `tests/delegate-authorize.test.js` (con sus `world`, `transcripts`, `call`, `authorized`), nuevas, además de portar las existentes:
```js
const OPUS_XHIGH_WORDS = 'despliega un agente que lo haga en Opus con esfuerzo xhigh, en español natural'
const OPUS_MEDIUM_WORDS = 'despliega un agente que lo haga en Opus con esfuerzo medium, en español natural'
const ranOn = (plan) => `${plan.step} ${plan.args.model} ${plan.args.effort}`

test('R18: Opus without an effort places the task on step 4, then step 5, and after it the task is exhausted', async (t) => {
  const w = world(t)
  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'p1' }).ok, true)
  const seen = [ranOn(await task.begin(call(BRIEF('p1'), { model: 'opus' }), w.deps))]
  assert.equal((await task.verdict({ task: 'p1', verdict: 'fix', findings: [F(1)], session: SESSION }, w.deps)).next.step, 'opus-xhigh')
  seen.push(ranOn(await task.begin(call(BRIEF('p1'), { model: 'opus' }), w.deps)))
  assert.equal((await task.verdict({ task: 'p1', verdict: 'fix', findings: [F(2)], session: SESSION }, w.deps)).verdict, 'exhausted')
  assert.deepEqual(seen, ['opus-high opus high', 'opus-xhigh opus xhigh'])
})

test('R18: Opus at xhigh places the task on step 5; an effort that is not a step takes the first step of the model at the owner\'s effort', async (t) => {
  const w = world(t, { sessions: { [SESSION]: [OPUS_XHIGH_WORDS, OPUS_MEDIUM_WORDS] } })
  assert.equal(authorized(w, { model: 'opus', effort: 'xhigh', quote: OPUS_XHIGH_WORDS, task: 'p2' }).ok, true)
  assert.equal(ranOn(await task.begin(call(BRIEF('p2'), { model: 'opus' }), w.deps)), 'opus-xhigh opus xhigh')
  assert.equal(authorized(w, { model: 'opus', effort: 'medium', quote: OPUS_MEDIUM_WORDS, task: 'p3' }).ok, true)
  assert.equal(ranOn(await task.begin(call(BRIEF('p3'), { model: 'opus' }), w.deps)), 'opus-high opus medium')
  assert.equal((await task.verdict({ task: 'p3', verdict: 'fix', findings: [F(1)], session: SESSION }, w.deps)).next.step, 'opus-xhigh')
})

test('R18: a model with no step in the ladder is refused, naming the models that have one, and nothing is written', (t) => {
  const w = world(t)
  const noSonnet = { ...ladderLib.loadLadder(), rungs: ladderLib.loadLadder().rungs.filter((r) => r.model !== 'sonnet') }
  const answer = auth.authorize({ session: SESSION, model: 'sonnet', quote: SONNET_WORDS, task: 'p4' }, { dataDir: w.dataDir, configDir: w.configDir, now: () => 500, ladder: noSonnet })
  assert.deepEqual([answer.ok, answer.error], [false, 'sonnet has no step in the ladder: the models with a step are haiku, opus'])
  assert.equal(authorizeLines(w.dataDir).length, 0)
})

test('R18: the first model needs no authorization without an effort, and with an effort above its first step it is a placement', (t) => {
  const w = world(t, { sessions: { [SESSION]: ['hazlo en Haiku con esfuerzo xhigh, por favor gracias'] } })
  const refused = authorized(w, { model: 'haiku', quote: 'hazlo en Haiku con esfuerzo xhigh, por favor gracias', task: 'p5' })
  assert.deepEqual([refused.ok, refused.error], [false, 'haiku is the first rung: it needs no authorization'])
  assert.equal(authorized(w, { model: 'haiku', effort: 'xhigh', quote: 'hazlo en Haiku con esfuerzo xhigh, por favor gracias', task: 'p5' }).ok, true)
})
```
Las pruebas existentes de `tests/delegate-*.test.js`, `tests/lane-delegate-ladder.test.js`, `tests/lane-delegate-scenarios.test.js`, `tests/observe-*.test.js` y `tests/spend-ladder.test.js` que fijan pasos `haiku`/`sonnet`/`opus`, correcciones o la subida `repeated` se portan al contrato nuevo (`haiku-high`…, `failed`); en `tests/delegate-report.test.js` el informe por escalón se comprueba con los cinco escalones y sin `corrections`.

**Acceptance:**
- Se construye en una sola unidad con las tareas 4, 6 y 8; al fusionarse, `npm test` pasa entero.
- Un delegado de edición y uno de solo lectura recorren los mismos cinco escalones; tras el rechazo del quinto, la tarea queda agotada y diferida; la autorización de Opus sin esfuerzo coloca la tarea en el escalón 4 y el siguiente intento en el 5.
- Ningún nombre de modelo ni cuenta de correcciones queda escrito en `delegate-task.js`, `delegate-authorize.js` ni `delegate-report.js`.

---

### Task 6: Enjambre: supervisor por escalón, causas de subida e informe

**Aether:**
- Area: swarm
- Owns: `plugins/aether/workflows/run.workflow.js`, `plugins/aether/agents/supervisor.md`, `plugins/aether/lib/report.js`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/ops.test.ts`, `tests/workflow*.test.js`, `tests/workflow-harness.js`, `tests/report.test.js`, `tests/report-ladder.test.js`, `tests/report-fixtures.js`, `tests/report-relaunch.test.js`, `tests/spend-prune.test.js`, `tests/swarm-ladder-agents.test.js`, `tests/agents.test.js`, `tests/ops-command*.test.js`
- Depends on: Task 3 — `aether-lane pick` acepta como `--model` el modelo de cualquier fila de Claude de la tabla
- Merges with: Task 4
- Serves: R6, R7, R8, R9, R10

**Interfaces:**
`workflows/run.workflow.js`:
- Sale `TIERS`. La comprobación de `decide` de que el par nativo de una decisión es usable valida el modelo con la expresión `/^[a-z][a-z0-9-]*$/` (el flujo no conoce los nombres) y el esfuerzo con `EFFORTS`.
- `supervise()` lanza el supervisor con `view.supervisor` (la vista que da `aether-wt ladder`): `role: 'supervisor'`, `model: view.supervisor.model`, `effort: <el mayor de view.supervisor.effort y task.review>` (el de `EFFORTS` de mayor índice; `task.review` es `high` por defecto, así que sin `Review` el esfuerzo es el del nivel). Con superdelegación, el par de referencia de `aether-lane pick --role supervisor` es ese mismo (`--model`, `--effort`). El modelo nativo de respaldo, cuando no hay par externo, es el que devuelve la decisión.
- `unit.ladder` pasa a `{ steps, firstTry, rises: { failed: 0, infeasible: 0 }, gateRejections, filled }`: sale `corrections`. `step()` cuenta `rises[cause]` en cada subida; `isFirstTry` exige `rises.failed === 0`, `rises.infeasible === 0` y `gateRejections === 0`, además de lo que ya exige.
- El texto `## Ladder` del mensaje del supervisor pasa a: `Rung ${view.position} of ${view.of}: ${view.step}, on ${view.model} ${view.effort}. A failed attempt rises one rung; the last rung's failure ends the unit.`
- Las causas de bloqueo que da la escalera (`blocked-outside-owns`, `blocked-same-cause`) se tratan como hoy.

`agents/supervisor.md`: salen `model: sonnet` y `effort: high` de su cabecera (el flujo da siempre modelo y esfuerzo), y el párrafo final («The ladder raises the model by itself: when the corrections of the rung are spent, when the same findings come back, or when you rule escalate with a reason…») pasa a decir que la escalera sube un escalón tras cada intento fallido, que el mismo cambio fuera de `Owns` o el mismo motivo bloqueado repetido bloquean la unidad en su escalón, y que `escalate` con un motivo declara la tarea inviable y sube un escalón.

`lib/report.js` (`ladderOf`): `rises` pasa a `{ failed, infeasible }` y sale `corrections` del resumen de la escalera de la corrida y de cada unidad.

`hooks/ops-command.mjs`: sale su `TIERS`; `--model` de `aether-lane pick` se valida con la expresión `/^[a-z][a-z0-9-]*$/` (el cierre de la lista de comandos del mod se mantiene: cada token sigue validado).

**Tests (write first):**
En `tests/workflow-ladder.test.js` (con sus ayudantes `build`, `one`, `retry`, `rungs`, `supervisions`, `unitOf`), nuevas; las existentes se portan al contrato (los intentos de `FIRST`/`RETRY` por rung de correcciones salen):
```js
const level = (run, unitId = 'task-1') => supervisions(run, unitId).map((c) => `${c.model} ${c.effort}`)
const failing = (run) => (call, approve) => (call.n <= 4 ? retry(`gap ${call.n}`) : approve(call))

test('a unit that fails four times climbs the five rungs, and its supervisor follows the author: Sonnet high, Sonnet high, Opus high, Opus xhigh, Opus xhigh', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n <= 4 ? retry(`gap ${call.n}`) : approve(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run), ['haiku high', 'haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh'])
  assert.deepEqual(level(run), ['sonnet high', 'sonnet high', 'opus high', 'opus xhigh', 'opus xhigh'])
  assert.deepEqual(unitOf(run).ladder.rises, { failed: 4, infeasible: 0 })
  assert.equal('corrections' in unitOf(run).ladder, false)
})

test('a unit that fails five times is blocked with the ladder spent, and no sixth attempt runs', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: (call) => retry(`gap ${call.n}`) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(rungs(run).length, 5)
  assert.equal(unitOf(run).status, 'blocked')
  assert.match(unitOf(run).reason, /the ladder is spent \(exhausted\)/)
})

test('the same change outside Owns twice blocks the unit on its second rung and spends no costlier one', async (t) => {
  const outside = () => ({ ...retry('changes outside Owns'), findings: [{ severity: 'important', title: 'changes outside Owns', file: 'tests/x.test.js', evidence: 'x' }] })
  const run = await runWorkflow(one(t), { supervisor: () => outside() })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run), ['haiku high', 'haiku xhigh'])
  assert.equal(unitOf(run).status, 'blocked')
})

test('a task whose Review is xhigh is supervised at xhigh on every rung; a Review under the level changes nothing', async (t) => {
  const high = await runWorkflow(one(t, { review: 'xhigh' }), { supervisor: (call, approve) => (call.n <= 4 ? retry(`gap ${call.n}`) : approve(call)) })
  assert.deepEqual(level(high), ['sonnet xhigh', 'sonnet xhigh', 'opus xhigh', 'opus xhigh', 'opus xhigh'])
  const plain = await runWorkflow(one(t, { review: 'high' }), { supervisor: (call, approve) => (call.n <= 4 ? retry(`gap ${call.n}`) : approve(call)) })
  assert.deepEqual(level(plain), ['sonnet high', 'sonnet high', 'opus high', 'opus xhigh', 'opus xhigh'])
})
```
En `tests/agents.test.js`, la comprobación de la cabecera del supervisor pasa de «`effort` es `high`» a «la cabecera del supervisor no fija `model` ni `effort`». Las pruebas de `tests/workflow*.test.js` que fijan que el supervisor corre en `sonnet` al esfuerzo de la tarea, las que cuentan `corrections` y las de `rises.exhausted`/`rises.repeated` se portan al contrato nuevo; las de `tests/report.test.js`, `tests/report-ladder.test.js` y `tests/report-fixtures.js` pasan a `rises: { failed, infeasible }` sin `corrections`. `tests/ops-command-lanes.test.js`: `aether-lane pick … --model opus` y un modelo nuevo con la forma de un nombre (`--model opus-6`) se aceptan; `--model 'op us'` y `--model Opus;rm` se rechazan; `plugins/aether/hooks/ops.test.ts` se adapta igual.

**Acceptance:**
- Se construye en una sola unidad con las tareas 4, 5 y 8; al fusionarse, `npm test` pasa entero y `npm run test:mod` también.
- Con superdelegación apagada y encendida, el supervisor de cada escalón corre en el par que dice la tarjeta (Sonnet `high`, Sonnet `high`, Opus `high`, Opus `xhigh`, Opus `xhigh`), nunca bajo el del autor.
- `run.workflow.js` no contiene lista de nombres de modelo que decida un escalón ni el nombre `TIERS`; `tests/ladder-no-model-list.test.js` pasa.

---

### Task 7: Refresco de cifras desde las páginas de modelo y resumen de la escalera

**Aether:**
- Area: refresh
- Owns: `scripts/refresh-lanes.js`, `.claude/skills/artificial-analysis/aa-api.js`, `.claude/skills/artificial-analysis/SKILL.md`, `tests/refresh-lanes.test.js`, `tests/aa-api.test.js`, `tests/aa-page-fixtures.js`
- Depends on: Task 2 — `ladderFrom` y `diffLadder` para el resumen
- Depends on: Task 3 — los campos `code`, `codeCostPerTaskUsd` y `codeMinutesPerTask` de la tabla
- Depends on: Task 4 — `config/ladder.json` con `law` y los escalones guardados
- Serves: R4, R12, R13, R14

**Interfaces:**
`.claude/skills/artificial-analysis/aa-api.js` pasa a ser el lector de páginas de modelo (sin clave y sin la dirección `/api/v2/data/llms/models`):
```js
const PAGE_URL = 'https://artificialanalysis.ai/models/'
// The figures of the page of `slug` (the page embeds the data of the models it compares, as JSON inside a script: read the block of
// the page's own model, as aa-pages.js does). Null when the page has no block for the slug or no code figure. Rounding: intelligence 1
// decimal, costs 3, code 2 (the fraction by 100), minutes 1 (seconds / 60).
function figuresOf(html, slug) // { intelligence, costPerTaskUsd, code, codeCostPerTaskUsd, codeMinutesPerTask } | null
// One request per page, one pause between two requests, no headers. A page that does not answer ok gives { error: 'the page answered <status>' }.
async function readPages(slugs, { fetch = globalThis.fetch, pause = (ms) => new Promise((r) => setTimeout(r, ms)), pauseMs = 1200 } = {}) // Map slug -> figures | { error } | null
module.exports = { PAGE_URL, figuresOf, readPages }
```
La línea de comandos del archivo (`node aa-api.js <slug>...`) imprime esas cifras por slug; sin clave. El script no corre solo: solo cuando el dueño lo pide.

`scripts/refresh-lanes.js`: `node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]` (por defecto `plugins/aether/config/pairs.json` y `plugins/aether/config/ladder.json`). Lee y escribe **solo las filas `claude/*`** de la tabla, por su `slug`: `intelligence`, `costPerTaskUsd`, `code`, `codeCostPerTaskUsd` y `codeMinutesPerTask`; las demás filas quedan idénticas byte a byte (se reescribe la línea de cada fila de Claude, una por línea, con el mismo estilo). Ya no toca `config/lanes.json`, ya no pide `ARTIFICIAL_ANALYSIS_API_KEY` y salen `refresh`, `keyFrom`, `keyFile`, `envFileFor`, `KEY` y `MODELS_URL`. `main(argv, { fetch, now, pause })` devuelve `{ exitCode, stdout }`: las líneas de cifras que cambian (`<id>: <campo> <antes> → <ahora>`, con `none` cuando el campo no estaba), `<id>: slug <slug> not found` o `<id>: slug <slug> has no code figure` (la fila no se toca) o `<id>: the page answered <status>`; al final, con `--write`, `written to <ruta>` y `fetchedAt` de la tabla a la fecha de `now`; y siempre el resumen de la escalera:
```
Recalculated ladder: <m1> <e1> > <m2> <e2> > ...
Stored ladder: unchanged
```
o, cuando `diffLadder(<guardada>, <recalculada>)` no es vacío:
```
Recalculated ladder: <...>
Stored ladder: changed
  <cada línea de diffLadder, con dos espacios>
The stored ladder was not written: to approve the recalculated one, edit <ruta de ladder.json> in a commit.
```
`exitCode` 1 si alguna página no respondió, 0 si no. **Nunca escribe `ladder.json`.**

**Tests (write first):**
`tests/aa-page-fixtures.js` (nuevo, ayudante):
```js
'use strict'

// A model block of a model page, in the shape of the page's embedded JSON, and a page that holds some blocks (the page also embeds the
// models it compares). The quotes are escaped, as in the page.
const block = (slug, f) => `{"slug":"${slug}","name":"Model ${slug}","shortName":"Model ${slug}","scalars":{"intelligenceIndex":${f.intelligence},"terminalBench40":${f.code}},"intelligenceIndexCostPerTask":{"cost":{"total":${f.cost}}},"evals":[{"slug":"terminalbench-4-0","score":${f.code},"outputTokensPerTask":1000.5,"costPerTask":${f.codeCost},"timePerTask":${f.seconds}}],"briefcaseBreakdown":{"overall":{"elo":1100,"lower95ci":1,"upper95ci":2},"rubricPassRate":0.3,"analyticalQuality":{"elo":1200,"lower95ci":1,"upper95ci":2},"presentation":{"elo":990}}}`
const page = (...blocks) => `<html><body><script>self.__next_f.push([1,"${blocks.join(',').replace(/"/g, '\\"')}"])</script></body></html>`
module.exports = { block, page }
```
`tests/aa-api.test.js` (nuevo):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { figuresOf, readPages, PAGE_URL } = require('../.claude/skills/artificial-analysis/aa-api.js')
const { block, page } = require('./aa-page-fixtures.js')

const OWN = { intelligence: 51.8421, cost: 3.4646622, code: 0.565656565656566, codeCost: 5.118905, seconds: 955.9325 }
const NEIGHBOUR = { intelligence: 10, cost: 9, code: 0.9, codeCost: 9, seconds: 9 }

test('figuresOf reads the block of the page\'s own model, not its neighbours\', rounded as the table keeps them', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN), block('claude-next-5-5', NEIGHBOUR))
  assert.deepEqual(figuresOf(html, 'claude-opus-5-5-high'), { intelligence: 51.8, costPerTaskUsd: 3.465, code: 56.57, codeCostPerTaskUsd: 5.119, codeMinutesPerTask: 15.9 })
  assert.equal(figuresOf(html, 'claude-missing-5-5'), null)
  assert.equal(figuresOf(page(block('claude-opus-5-5-high', OWN).replace('terminalbench-4-0', 'other-bench')), 'claude-opus-5-5-high'), null)
})

test('readPages asks one page per slug with a pause between two, sends no key, and reports a page that does not answer', async () => {
  const asked = []
  const pauses = []
  const pages = { [`${PAGE_URL}a`]: page(block('a', OWN)), [`${PAGE_URL}b`]: page(block('b', OWN)) }
  const fetch = async (url, options) => {
    asked.push([url, options])
    return url in pages ? { ok: true, status: 200, text: async () => pages[url] } : { ok: false, status: 404, text: async () => '' }
  }
  const result = await readPages(['a', 'b', 'c'], { fetch, pause: async (ms) => pauses.push(ms), pauseMs: 1200 })
  assert.deepEqual(asked.map(([url]) => url), [`${PAGE_URL}a`, `${PAGE_URL}b`, `${PAGE_URL}c`])
  assert.deepEqual(pauses, [1200, 1200])
  assert.deepEqual([...result.keys()], ['a', 'b', 'c'])
  assert.equal(result.get('a').code, 56.57)
  assert.deepEqual(result.get('c'), { error: 'the page answered 404' })
  for (const [, options] of asked) assert.equal(JSON.stringify(options ?? {}).includes('key'), false)
})
```
`tests/refresh-lanes.test.js` se reescribe (las pruebas de la clave, de `config/lanes.json` y de `refreshPairs` por la API salen):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { main } = require('../scripts/refresh-lanes.js')
const { block, page } = require('./aa-page-fixtures.js')

const row = (id, over = {}) => {
  const [harness, rest] = id.split('/')
  const [model, effort] = rest.split('@')
  return { id, slug: `${harness}-${model}-${effort}`, harness, model, family: `${harness}-${model}`, effort, group: harness === 'claude' ? null : 'g', intelligence: 20, costPerTaskUsd: 0.1, outputTokensPerSecond: 90, timeToFirstTokenS: 2, ...over }
}
const CLAUDE_HIGH = row('claude/a@high', { code: 10, codeCostPerTaskUsd: 0.1, codeMinutesPerTask: 5 })
const CLAUDE_XHIGH = row('claude/a@xhigh', { intelligence: 30, costPerTaskUsd: 0.2, code: 20, codeCostPerTaskUsd: 0.2, codeMinutesPerTask: 8 })
const OTHER = row('agy/b@high', { intelligence: 44.4, costPerTaskUsd: null })
const LADDER = { law: { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 }, supervisorFloor: 1, repeatBlocked: 2, rungs: [{ step: 'a-high', model: 'a', effort: 'high' }, { step: 'a-xhigh', model: 'a', effort: 'xhigh' }] }

function setup(t) {
  const dir = tempDir(t, 'aether-refresh-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const lines = [CLAUDE_HIGH, CLAUDE_XHIGH, OTHER].map((r) => `    ${JSON.stringify(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  return files
}
const NOW = () => Date.UTC(2026, 10, 12)
const serve = (figures) => async (url) => {
  const slug = url.split('/').pop()
  return figures[slug] ? { ok: true, status: 200, text: async () => page(block(slug, figures[slug])) } : { ok: false, status: 404, text: async () => '' }
}
const fig = (intelligence, cost, code, codeCost, seconds) => ({ intelligence, cost, code, codeCost, seconds })
const GOOD = { 'claude-a-high': fig(21, 0.11, 0.11, 0.12, 330), 'claude-a-xhigh': fig(31, 0.21, 0.22, 0.22, 500) }
const run = (files, fetch, extra = []) => main(['--pairs', files.pairs, '--ladder', files.ladder, ...extra], { fetch, now: NOW, pause: async () => {} })

test('the refresh writes the code figures of the Claude rows, shows the ladder, and says it did not change', async (t) => {
  const files = setup(t)
  const out = await run(files, serve(GOOD), ['--write'])
  assert.equal(out.exitCode, 0)
  assert.match(out.stdout, /claude\/a@high: intelligence 20 → 21/)
  assert.match(out.stdout, /claude\/a@high: code none → 11/)
  assert.match(out.stdout, /Recalculated ladder: a high > a xhigh\nStored ladder: unchanged\n/)
  const table = JSON.parse(fs.readFileSync(files.pairs, 'utf8'))
  const high = table.pairs.find((p) => p.id === 'claude/a@high')
  assert.deepEqual([high.intelligence, high.costPerTaskUsd, high.code, high.codeCostPerTaskUsd, high.codeMinutesPerTask], [21, 0.11, 11, 0.12, 5.5])
  assert.equal(table.fetchedAt, '2026-11-12')
})

test('a ladder that changed is shown with what enters and leaves, and the stored ladder stays as it was, even with --write', async (t) => {
  const files = setup(t)
  const before = fs.readFileSync(files.ladder, 'utf8')
  // a@xhigh is now 0.5 points above a@high in code: not a step of its own, and the cheaper (a@high) stays.
  const out = await run(files, serve({ ...GOOD, 'claude-a-xhigh': fig(31, 0.21, 0.115, 0.22, 500) }), ['--write'])
  assert.match(out.stdout, /Recalculated ladder: a high\nStored ladder: changed\n  extra rung 2: a xhigh\n/)
  assert.match(out.stdout, /The stored ladder was not written: to approve the recalculated one, edit .*ladder\.json in a commit\./)
  assert.equal(fs.readFileSync(files.ladder, 'utf8'), before)
})

test('without --write nothing is written, and the rows of the other harnesses are left byte for byte', async (t) => {
  const files = setup(t)
  const before = fs.readFileSync(files.pairs, 'utf8')
  const dry = await run(files, serve(GOOD))
  assert.equal(fs.readFileSync(files.pairs, 'utf8'), before)
  assert.match(dry.stdout, /claude\/a@xhigh: intelligence 30 → 31/)
  await run(files, serve(GOOD), ['--write'])
  const after = fs.readFileSync(files.pairs, 'utf8').split('\n')
  assert.ok(after.includes(`    ${JSON.stringify(OTHER)}`))
  assert.equal(after.filter((line) => line.includes('"harness":"claude"')).length, 2)
})

test('a page with no code figure leaves its row alone, and a page that does not answer is reported with exit code 1', async (t) => {
  const files = setup(t)
  const out = await run(files, serve({ 'claude-a-high': GOOD['claude-a-high'] }), ['--write'])
  assert.equal(out.exitCode, 1)
  assert.match(out.stdout, /claude\/a@xhigh: the page answered 404/)
  const table = JSON.parse(fs.readFileSync(files.pairs, 'utf8'))
  assert.equal(table.pairs.find((p) => p.id === 'claude/a@xhigh').intelligence, 30)
})

test('the refresh needs no key and sends none, and no longer reads or writes the lane table', async (t) => {
  const files = setup(t)
  const seen = []
  const env = process.env.ARTIFICIAL_ANALYSIS_API_KEY
  delete process.env.ARTIFICIAL_ANALYSIS_API_KEY
  t.after(() => { if (env !== undefined) process.env.ARTIFICIAL_ANALYSIS_API_KEY = env })
  await main(['--pairs', files.pairs, '--ladder', files.ladder], { fetch: async (url, options) => (seen.push([url, options]), serve(GOOD)(url)), now: NOW, pause: async () => {} })
  assert.equal(seen.length, 2)
  assert.ok(seen.every(([url, options]) => url.startsWith('https://artificialanalysis.ai/models/') && !JSON.stringify(options ?? {}).includes('key')))
  assert.equal((await main(['--config', 'x'], { fetch: async () => { throw new Error('no') } })).exitCode, 2)
})
```
`.claude/skills/artificial-analysis/SKILL.md`: la sección de cómo se vuelven a leer las cifras dice que se leen las páginas de modelo (`aa-api.js`, `scripts/refresh-lanes.js`), solo cuando el dueño lo pide, sin clave, y que la escalera guardada solo cambia con el visto bueno del dueño.

**Acceptance:**
- `npm test` pasa entero. `node scripts/refresh-lanes.js --help`-style: con un argumento desconocido (`--config`) sale con código 2 y la línea de uso `usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]`.
- `grep -rn "api/v2/data/llms" scripts .claude/skills/artificial-analysis/aa-api.js` no encuentra nada, y ningún archivo de esta tarea menciona `ARTIFICIAL_ANALYSIS_API_KEY`.
- Ninguna prueba hace una petición de red; el refresco real no se ejecuta en esta construcción.

---


### Task 8: Describir la ley, la escalera y el supervisor en las reglas del Lead y las guías que las pruebas atan a `config/ladder.json`

**Aether:**
- Area: docs-ladder
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/models/SKILL.md`, `docs/guide/delegates.md`, `docs/guide/models-by-role.md`, `docs/reference/components.md`, `tests/delegates-docs.test.js`, `tests/delegate-docs.test.js`, `tests/models-by-role-docs.test.js`, `tests/swarm-ladder-docs.test.js`, `tests/using-aether-030.test.js`, `tests/components-docs.test.js`, `tests/docs-facts.test.js`
- Depends on: Task 2 — la ley que el texto describe
- Merges with: Task 4
- Serves: R16

**Interfaces:**
Solo texto y las pruebas que lo sujetan; tiene que ir en la misma unidad que el cambio de `config/ladder.json` porque esas pruebas leen el archivo (la tabla de escalones de la guía y las frases de las reglas del Lead). Qué debe decir cada página, en su idioma:
- **`skills/using-aether/SKILL.md`** (las reglas del Lead; sus partes de `aether-session-start` siguen en 9.800 caracteres o menos y el total en el límite de `tests/using-aether-030.test.js`): la escalera se calcula con una ley fija sobre las cifras de Artificial Analysis (la frontera de Pareto de calidad y costo: un candidato que otro par iguala o supera por menos costo sale; los demás se ordenan por inteligencia y cada escalón sube al menos 2 puntos en código y en inteligencia) y se guarda en `config/ladder.json`; hoy son cinco escalones (Haiku `high`, Haiku `xhigh`, Sonnet `high`, Opus `high`, Opus `xhigh`); un intento rechazado sube un escalón y tras el quinto la tarea queda agotada y diferida; el mismo cambio fuera de `Owns` o el mismo motivo bloqueado repetido bloquean la tarea en su escalón; `infeasible` con motivo sube; el Lead no nombra modelo ni esfuerzo salvo el que el dueño colocó con sus palabras, que corre en el escalón con ese modelo (Opus sin esfuerzo, escalón 4) y de ahí sube. Salen las frases de «correcciones por escalón», «el esfuerzo de corrección» y «subir cuando los hallazgos se repiten».
- **`skills/swarm/SKILL.md`:** el enjambre usa la misma escalera; el supervisor corre en Sonnet `high` (escalones 1 y 2), Opus `high` (3) y Opus `xhigh` (4 y 5), calculado por el sistema; el bloque `ladder` de cada unidad es `{ steps, firstTry, rises: { failed, infeasible }, gateRejections, filled }`; las causas del bloqueo por escalera agotada o repetida.
- **`docs/guide/delegates.md`:** la tabla de escalones lista cada escalón de `config/ladder.json` (`step`, modelo, esfuerzo); la ley y por qué Sonnet `xhigh` no está hoy; la colocación por palabra del dueño («Placing a task»): Opus sin esfuerzo corre en el escalón 4, con `xhigh` en el 5, un esfuerzo que no es escalón en el primero del modelo, y un modelo sin escalón se rechaza; el supervisor del enjambre.
- **`skills/models/SKILL.md`, `docs/guide/models-by-role.md` y `docs/reference/components.md`:** las frases que repiten la escalera de tres escalones con correcciones por modelo pasan a la escalera de la ley; la tabla de la escalera de `models-by-role.md` sale de `config/ladder.json`; `components.md` describe `aether-delegate` y `aether-report` sin «correcciones».

**Tests (write first):**
Las pruebas que fijan la escalera vieja se reescriben a la nueva; las que fijan otra cosa no se relajan:
```js
// tests/delegates-docs.test.js: the table of steps is config/ladder.json
test('the table of steps is config/ladder.json: each step, its model and its effort', () => {
  const rows = stepRows(read('docs', 'guide', 'delegates.md'))   // the rows of the guide's table of steps (the helper the file has)
  assert.equal(rows.length, ladder.rungs.length, 'one row per step')
  ladder.rungs.forEach((rung, index) => {
    const [, step, model, effort] = rows[index]
    assert.deepEqual([step, model.toLowerCase(), effort], [rung.step, rung.model, `\`${rung.effort}\``], `row ${index + 1}`)
  })
})

test('the guide says what makes a task rise, be blocked or be exhausted, with the words of the new policy', () => {
  const text = read('docs', 'guide', 'delegates.md')
  for (const needed of ['Pareto', 'one step', 'outside Owns', 'infeasible', 'a reason', 'from scratch', 'exhausted', 'defer']) assert.ok(text.includes(needed), needed)
})
```
`tests/models-by-role-docs.test.js` (la tabla de la escalera es `config/ladder.json`, una fila por escalón con modelo y esfuerzo), `tests/swarm-ladder-docs.test.js` (la regla de la skill del enjambre y la guía dicen que el enjambre usa la misma escalera y el supervisor por escalón), `tests/using-aether-030.test.js` (las fichas de reglas del Lead que nombraban «el esfuerzo de corrección del escalón» nombran la escalera de la ley y el escalón siguiente), `tests/components-docs.test.js` y `tests/docs-facts.test.js` (la línea 853 y las que citan la frase vieja) se adaptan igual.

**Acceptance:**
- Se construye en una sola unidad con las tareas 4, 5 y 6; al fusionarse, `npm test` pasa entero, con las partes del bootstrap de 9.800 caracteres o menos.
- Ninguna frase de las reglas del Lead, la skill del enjambre ni la guía de delegados habla de correcciones por modelo ni de subida por hallazgos repetidos.
- No se toca `docs/decisions.md`, el changelog ni la versión: son de la tarea 9.

---

### Task 9: Registrar la decisión A121, el changelog y el resto del texto que repite la escalera vieja

**Aether:**
- Area: docs
- Owns: `docs/*.md`, `docs/guide/*.md`, `docs/reference/*.md`, `CLAUDE.md`, `tests/docs-*.test.js`, `tests/lanes-docs.test.js`, `tests/observe-docs.test.js`, `tests/spend-docs.test.js`
- Depends on: Task 4 — la escalera, la ley y el supervisor que el texto describe (la unidad de las tareas 4, 5, 6 y 8)
- Depends on: Task 7 — el refresco que el texto describe
- Serves: R16

**Interfaces:**
Solo texto y las pruebas que lo sujetan:
- **`docs/decisions.md`:** una decisión nueva, `A121`, con las palabras del dueño que cita el spec en sus criterios («como lo trasladamos como ley o puntaje o regla o benchmark para nuestero proyecto», «194: necesitamos diseñar un buen sistema de escalada», «cada modelo que continúa tiene una mejor calidad de trabajo», «como resolvemos tambien lo de los supervisores», «nuestra uncia fuente de info vaa ser artifial analysys», «leelo directamente en la pagina no uses la api gratuita la pagina tiene mas info»), y el cierre «Decided 2026-11-10; spec 032». `docs/index.md` pasa el rango a `A1–A121`.
- **`docs/changelog.md`:** una entrada «sin publicar» sobre la escalera de Pareto, sin tocar la línea `Version 0.36.0:` ni el número de versión en ningún lado.
- **`CLAUDE.md`:** corrige las frases de «Delegates» y «Config» (cada delegado empieza en Haiku y sube por correcciones agotadas o hallazgos repetidos; `config/ladder.json` «the steps of the delegate ladder and their corrections»), la de `scripts/refresh-lanes.js` («needs `ARTIFICIAL_ANALYSIS_API_KEY`») y la de las pruebas del enjambre que digan «Haiku first» con correcciones.
- **El resto de `docs/`** (`guide/ops.md`, `guide/lanes.md`, `guide/observe.md`, `guide/troubleshooting.md`, `guide/design-seats.md`, `methodology.md`, `purpose.md` y cualquier página que repita la escalera de tres escalones con correcciones o diga que el refresco usa la API o la clave): se corrige a lo que hace el código; `docs/handoff/` y las versiones ya publicadas del changelog son historia y no se tocan.

**Tests (write first):**
`tests/docs-032.test.js` (nuevo):
```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const RULES = ['plugins/aether/skills/using-aether/SKILL.md', 'plugins/aether/skills/swarm/SKILL.md', 'docs/guide/delegates.md', 'CLAUDE.md']
const OLD = /corrections? (of|per|on|for) (the|each|its|a|every) (step|rung|model)|corrections of (its|the|each) step|the same findings (return|come back)|spent its corrections|at the step's correction effort|rise only after the step/i

test('the Lead\'s rules, the swarm skill, the delegates guide and CLAUDE.md describe the ladder of the law, and no longer the corrections per model (R16)', () => {
  for (const file of RULES) assert.doesNotMatch(read(file), OLD, file)
  assert.match(read('docs/guide/delegates.md'), /Pareto/)
  assert.match(read('plugins/aether/skills/swarm/SKILL.md'), /Sonnet `high`.*Opus `high`.*Opus `xhigh`/is)
})

test('decision A121 is recorded with the owner\'s words, and the index names the range (R16)', () => {
  const decisions = read('docs/decisions.md')
  assert.match(decisions, /^\| A121 \|/m)
  assert.match(decisions, /como lo trasladamos como ley o puntaje o regla o benchmark/)
  assert.match(decisions, /Decided 2026-11-10; spec 032/)
  assert.match(read('docs/index.md'), /A1–A121/)
})

test('the changelog has an unreleased entry about the ladder and the version stays 0.36.0 (R16)', () => {
  const changelog = read('docs/changelog.md')
  assert.match(changelog, /Pareto/)
  assert.match(changelog.split('\n').find((line) => /^Version \d/.test(line)), /^Version 0\.36\.0:/)
  assert.equal(JSON.parse(read('plugins/aether/.claude-plugin/plugin.json')).version, '0.36.0')
})

test('CLAUDE.md no longer says the refresh needs the API key', () => {
  assert.doesNotMatch(read('CLAUDE.md'), /needs `ARTIFICIAL_ANALYSIS_API_KEY`/)
})
```
En `tests/docs-facts.test.js`, `LAST_DECISION` pasa de 120 a 121 y el título de la prueba (`A50 to A120`) a `A50 to A121`; las pruebas de las otras páginas de `docs/` que fijan frases viejas se adaptan sin relajar las que fijan otra cosa.

**Acceptance:**
- `npm run check` pasa (`npm test`, `npm run test:mod`, `npm run validate`), incluidos `tests/docs-facts.test.js` (enlaces, anclas, front matter, rango de decisiones) y las partes del bootstrap de 9.800 caracteres o menos.
- Ninguna frase de `docs/` (salvo las decisiones y las versiones del changelog ya publicadas, y `docs/handoff/`) habla de correcciones por modelo ni de la subida por hallazgos repetidos, ni dice que el refresco usa la API o su clave.
- La versión no cambia en ningún lugar.
