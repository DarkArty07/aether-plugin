# Superdelegación: tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual. Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice. El plan, `plan.md`, dice por qué cada pieza existe: léelo antes de empezar.
- **Idioma.** El código, los comentarios, los mensajes y los documentos del repositorio van en inglés; este archivo y el plan, en español. Un texto que un test fija (mensaje, línea de uso, frase) va exactamente como lo escribe el test.
- **Estilo.** Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma ni dependencias de npm; los `.mjs` son ESM. Los bins son finos y la lógica vive en `plugins/aether/lib/`. Las funciones de `lib/` son puras o reciben sus dependencias (reloj, adaptadores, directorio de datos) por parámetro.
- **Primero los tests.** Cada tarea escribe sus tests (rojo), implementa y deja `npm test` verde completo antes de reportar. Cada fusión corre `npm test` entero: una tarea no puede dejar rota una prueba que no es suya, y por eso lo viejo se retira solo en la tarea que dice que lo retira (plan, D15). Los tests existentes que una tarea cambia son los de su `Owns`; ninguna otra aserción existente cambia.
- **Sin llamadas pagadas ni de red.** Los tests usan tablas fijas, `tests/fixtures/fake-agy.js`, `fake-grok*.js` y el arnés de workflows con agentes simulados. Nadie corre `claude`, `agy`, `codex`, `grok` ni `cursor-agent` con un prompt real. La medición del cupo y la corrida real las hace el Lead con el permiso `paid-call`; ninguna tarea las hace.
- **Nadie escribe bajo `specs/` ni `.specify/`** (aether-guard lo rechaza a los implementadores). Tampoco se sube la versión, se toca el changelog, se empuja, se abre un pull request ni se fusiona.
- **La frase de alcance, idéntica donde un archivo la lleve:** `Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.`
- **Muse sigue entero.** Muse Code (0.13.0, A64) es un harness más de la regla (spec C16, R24, R25). Ninguna tarea toca su adaptador (`plugins/aether/lib/harness/muse.js`) ni sus fixtures, y ninguna deja una lista de harness sin Muse: `tests/harness-lists.test.js` busca en todos los archivos rastreados una línea que nombre tres de `agy`, `codex`, `grok` y `cursor` sin `muse`, o que cuente «cuatro harnesses»; `tests/muse-docs.test.js`, `tests/muse-docs-overview.test.js`, `tests/muse-skills.test.js` y `tests/lanes-docs.test.js` piden que las guías, el README, la metodología, el propósito y las skills `using-aether` y `swarm` listen a Muse con los otros, y que `docs/guide/lanes.md` conserve su sección `## Muse`. Lo nuevo que escriba una tarea (código, comentarios, páginas, la web) lista los cinco harness o nombra menos de tres.
- **Formas compartidas entre tareas** (las fija el test de la tarea que las produce; las demás las importan):
  - **Par** (`Pair`, una fila de `plugins/aether/config/pairs.json`, escrita por la Task 1): `{ id: '<harness>/<model>@<effort>', slug: string, harness: 'claude'|'agy'|'grok'|..., model: string, family: string, effort: 'low'|'medium'|'high'|'xhigh'|'max', group: string|null, intelligence: number, costPerTaskUsd: number|null, outputTokensPerSecond: number|null, timeToFirstTokenS: number|null, ownerDecision?: string }`. `ownerDecision` es opcional, solo está en el par que entra por decisión del dueño (hoy el de Muse) y trae sus palabras; ese par trae `intelligence` numérica y puede traer `costPerTaskUsd: null`. En Claude `model` es el alias `haiku|sonnet|opus` y `group` es `null`; en un externo `model` es el id de `config/lanes.json` y `group` su cuota. `slug` es el slug de Artificial Analysis del par (`claude-sonnet-5-5-high`, `gemini-3-8-flash-low`, ...), el de la evidencia; el par de Claude dentro de agy lleva el `slug` del par nativo de su mismo modelo y effort, y `scripts/refresh-lanes.js` refresca la inteligencia de cada fila por él. `family` es la identidad del modelo: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `gemini-4-argon`, `gemini-3.8-flash`, `grok-4.7`, `muse-wonder-full-1.0`; el mismo modelo dentro de agy y nativo comparte `family`.
  - **Decisión** (`Decision`, lo que `choose` devuelve y `aether-lane pick` imprime, más `call` y `role` en el comando): `{ requested: number, reference: { id, model, effort, intelligence }, picked: Pair | null, native: { id, model, effort, family, intelligence }, candidates: [{ id, harness, group, intelligence, costPerTaskUsd, rank: number|null, outcome: 'picked'|'next'|'passed', why: null|'harness-off'|'not-installed'|'excluded'|'author'|'dry'|'no-cost'|'dominated'|'below' }], reason: string }`. `no-cost` es solo del par sin costo y sin `ownerDecision`. `rank` es la posición (desde 1) de un candidato en el orden; `why` sigue esa precedencia cuando varias razones valen.
  - **Vista de cuotas** (la entrada `harnesses` de `choose`): `{ [harness]: { installed: boolean, groups: { [group]: { usable?: boolean, unknown?: boolean, mark?: object|null, resetsAt?: string|null } } } }`, solo con los harness habilitados; es la forma de `lib/lane-quota.js` `harnessView`. Un harness que falta es `harness-off`; un grupo que falta es una cuota sin lectura (compite, después de las legibles); `usable === false` o una `mark` es una cuota seca (`dry`).
  - **Entradas del log de lanes** (las escribe la Task 3, las lee la Task 5): `{ kind: 'choice', time, session: null, run, design: null, call, role, requested, reference: { id, model, effort, intelligence }, picked: { id, harness, model, effort, group, family, intelligence, costPerTaskUsd } | null, native: { id, model, effort, family, intelligence }, reason, candidates: [{ id, outcome, why }] }` y `{ kind: 'took', time, session: null, run, call, by: 'native' | '<harness>:<model>', cause: 'chosen'|'no-candidate'|'wait-limit'|'failed' }`. Una `kind: 'seat'` del diseño suma `reference` y `reason`.
  - **Comandos de `aether-lane`** (los escribe la Task 3; la Task 6 los envía):
    `aether-lane pick <run> <call> --role <implementer|supervisor|reviewer> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> [--exclude <id>[,<id>...]] [--author <family>]`
    `aether-lane took <run> <call> --by <native|harness:model> --cause <chosen|no-candidate|wait-limit|failed>`
    `aether-lane pause --seconds <1 a 120>`
    Con `--exclude` y `--author` juntos, `--exclude` va primero. `<call>` es `task-N-M-implement`, `task-N-M-supervise` o `final-review`.
  - **Argumentos de la corrida** (`lanes` de `aether-plan compile`, que escribe la Task 15 y lee la Task 6): `null`, o `{ superdelegation: true, harnesses: string[], maxParallelByHarness: { [harness]: number }, waits: { implementer: number, supervisor: number, reviewer: number }, cupo: { polls: number, pollSeconds: number } }`.
  - **Variables de sesión** (las exporta la Task 4; la Task 12 y la Task 13 leen la misma regla de `resolveOption`): `AETHER_SUPERDELEGATION=on|off`, `AETHER_SUPERDELEGATION_LEGACY=<fichas separadas por comas>` y `AETHER_LANE_HARNESSES=<lista>`. Las fichas son `lanes-as-on`, `lanes-ignored` y `seats-ignored`. `AETHER_LANES` y `AETHER_SEATS` dejan de existir.
  - **Argumentos del diseño** (`/aether:design`, que escribe la Task 16 y lanzan las skills de la Task 10): `{ feature, session, repoRoot, superdelegation: 'on'|'off', harnesses }`, y `seat-start ... --superdelegation <on|off> --harnesses <h1,h2> --digest <digest>` en lugar de `--seats` y `--lanes`.
  - **Pares de referencia del diseño:** Judge y Examiner `{ model: 'opus', effort: 'high' }`; Writer `{ model: 'sonnet', effort: 'high' }`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [E2] La tabla única de pares y su carga in plugins/aether/config/pairs.json → Task 1
- [ ] T002 [P] [E2] La función de elección, el interruptor y los argumentos de la corrida in plugins/aether/lib/superdelegation.js → Task 1
- [ ] T003 [P] [E5] La rampa de medición del cupo y su escritura en la tabla in plugins/aether/lib/lane-cupo.js → Task 2
- [ ] T004 [P] [E5] El script de la medición in scripts/lane-cupo.js → Task 2
- [ ] T005 [E2] Los comandos `pick`, `took` y `pause` y las vistas de cuota in plugins/aether/lib/lane-pick.js → Task 3
- [ ] T006 [E2] Las formas nuevas de la lista cerrada del mod in plugins/aether/hooks/ops-command.mjs → Task 3
- [ ] T007 [P] [E8] El arranque de la sesión y la migración in plugins/aether/bin/aether-session-start → Task 4
- [ ] T008 [P] [E9] El informe por llamada y las cifras de RADAR in plugins/aether/lib/report.js → Task 5
- [ ] T009 [E1] El swarm sobre `pick`, el cupo, el reintento y el retiro de la regla copiada in plugins/aether/workflows/run.workflow.js → Task 6
- [ ] T010 [P] [E7] Los asientos del diseño sobre `choose`, la revisión cruzada y el nativo de la decisión in plugins/aether/lib/seats.js → Task 7
- [ ] T011 [P] [E9] La regla escrita y las guías in docs/guide/lanes.md → Task 8
- [ ] T012 [E1] El retiro del comando `choice` in plugins/aether/lib/lane-choice.js → Task 9
- [ ] T013 [P] [E1] Las skills del Lead lanzan el diseño con `superdelegation` in plugins/aether/skills/using-aether/SKILL.md → Task 10
- [ ] T014 [E3] Las pruebas de escenario sin cuota y la búsqueda de lo que desaparece in tests/superdelegation-scenarios.test.js → Task 11
- [ ] T015 [P] [E8] El ajuste `lanes` del router sobre el mismo interruptor in plugins/aether/lib/session.js → Task 12
- [ ] T016 [P] [E1] El panel in plugins/aether/hooks/panel-view.mjs → Task 13
- [ ] T017 [E1] La opción `superdelegation`, las claves heredadas y la tabla de opciones in plugins/aether/.claude-plugin/plugin.json → Task 14
- [ ] T018 [P] [E2] `aether-plan compile` y los argumentos de la corrida in plugins/aether/bin/aether-plan → Task 15
- [ ] T019 [E7] El workflow de diseño y la lista cerrada del mod in plugins/aether/workflows/design.workflow.js → Task 16
- [ ] T020 [E9] El README y las demás páginas in README.md → Task 17
- [ ] T021 [E9] La web, la decisión y las pruebas de cierre de los documentos in site/index.html → Task 18
- [ ] T022 [E1] `status` sin orden y la ejecución sin tabla de equivalencias in plugins/aether/lib/lane-calls.js → Task 19
- [ ] T023 [P] [E1] El índice de modelos y el refresco de la inteligencia in scripts/build-models-index.js → Task 20
- [ ] T024 [E1] El retiro de `levels` y los perfiles en la tabla de lanes in plugins/aether/config/lanes.json → Task 21
- [ ] T025 [E1] El retiro del orden por candidatos in plugins/aether/lib/lane-order.js → Task 22
- [ ] T026 [P] [E10] Las pruebas de Muse sobre la regla in tests/muse-lane.test.js → Task 23

### Task 1: La tabla de pares y la función de elección

**Aether:**
- Tier: opus high — la regla de elección es el núcleo de la tarea: tolerancia, dominancia, orden por cuota, revisión cruzada y migración de opciones, con varios bordes que las pruebas fijan caso por caso
- Review: xhigh — un borde mal puesto (el 1 punto inclusivo, el orden de una ventana ilegible, el empate) elige mal sin que ninguna prueba del repositorio lo vea
- Area: core
- Owns: `plugins/aether/config/pairs.json`, `plugins/aether/lib/pairs.js`, `plugins/aether/lib/superdelegation.js`, `tests/pairs.test.js`, `tests/superdelegation.test.js`, `tests/helpers.js`, `tests/lane-fixtures.js`
- Depends on: none
- Serves: R1, R2, R4, R5, R7, R8, R9, R10, R11, R13, R16, R17, R19, R22, R24

**Interfaces:**

`plugins/aether/lib/pairs.js`:

```js
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const NATIVE_MODELS = ['haiku', 'sonnet', 'opus']
pairsPath(env = process.env) // AETHER_PAIRS_CONFIG, else plugins/aether/config/pairs.json
loadPairs(file = pairsPath()) // -> { fetchedAt: string, pairs: Pair[] }; throws Error('pairs config <file>: <problem>'), also for a row with no `slug` (a non-empty string) and for an `ownerDecision` that is not a non-empty string
pairId(harness, model, effort) // -> `${harness}/${model}@${effort}`
referenceOf(pairs, { model, effort }) // -> the Pair of harness 'claude'; throws Error(`no reference pair for ${model} ${effort}`)
```

`plugins/aether/config/pairs.json`: `{ "fetchedAt": "2026-10-19", "source": "specs/009-superdelegation/evidence/aa-pairs-2026-10-19.json", "pairs": [Pair, ...] }`. Los 22 pares de `specs/009-superdelegation/evidence/aa-pairs-2026-10-19.json` (mismo `slug`, misma inteligencia, mismo costo, `null` donde la evidencia no lo trae; `model` Claude como alias, externos con el id de `config/lanes.json`: `gemini-4-argon`, `gemini-3.8-flash`, `grok-4.7`; `group` `gemini` para los dos Gemini y `grok` para Grok), más seis pares de agy con `family` `claude-sonnet-5-5` y `claude-opus-5-5`, `group: "claude"`, `low`, `medium` y `high`, con el `slug` y las cifras del par nativo del mismo modelo y effort, y, como última fila, el par de Muse: `harness: "muse"`, `model` y `family: "muse-wonder-full-1.0"`, `effort: "high"`, `group: "muse"`, `slug` el de la fila `claude/opus@high` (`claude-opus-5-5-high`), `intelligence` la de esa misma fila (53.6), `costPerTaskUsd`, `outputTokensPerSecond` y `timeToFirstTokenS` `null`, y `ownerDecision` con las palabras de la cita 16 de la tarjeta: «si deja entrar a musewonder full es uno d elos mejores modelos que tiene el harness, ... esta anivel de opus segun yo». 29 filas. El orden de las filas es el orden de desempate. Cada fila trae `outputTokensPerSecond` y `timeToFirstTokenS` de la evidencia (`null` si no la trae), solo informativos.

`plugins/aether/lib/superdelegation.js`:

```js
const TOLERANCE_POINTS = 1
const CUPO = { waitSeconds: 600, pollSeconds: 60 }

enabled(env = process.env, platform = process.platform) // -> { on: boolean, reason: null | 'option' | 'platform' }; on only if env.AETHER_SUPERDELEGATION === 'on' and platform === 'linux'
resolveOption(env) // env: CLAUDE_PLUGIN_OPTION_SUPERDELEGATION, _LANES, _SEATS -> { on: boolean, source: 'superdelegation'|'lanes'|'default', legacy: string[] }
legacyNotes(tokens) // -> string[], one text per token
choose({ pairs, reference: { model, effort }, harnesses, exclude = [], authors = [], nativeDiffers = false }) // -> Decision
runArgs(config, pairs, { installed, enabled }) // -> the `lanes` args of the run, or null
idleHarnesses(config, pairs, { installed, enabled }) // -> [{ name, reason }]
```

Reglas de `choose` (la política, plan D2 a D4):
- `requested` es la inteligencia del par de referencia (`referenceOf`). Es candidato un par externo (harness distinto de `claude`) cuyo harness está en `harnesses` e instalado, con `intelligence` numérica y `costPerTaskUsd` numérico (o nulo, si su fila trae `ownerDecision`), que no está en `exclude`, cuyo `family` no está en `authors`, cuya cuota no está seca, cuya inteligencia llega a `requested - 1` y que no está dominado por otro candidato de la llamada. Las comparaciones de puntos se hacen en décimas enteras (`Math.round(x * 10)`), con el 1 punto inclusivo.
- Dominado: dentro de la misma cuota (mismo harness y mismo grupo), un par P con costo numérico lo está si otro par Q de la cuota con costo numérico cuesta menos y la inteligencia de P no pasa en más de 1 punto la de Q (R9). Q debe ser candidato de esa misma llamada, esto es, pasar todo lo demás (harness habilitado e instalado, no excluido, no autor, cuota no seca, inteligencia que llega a `requested - 1`): un Q excluido por un reintento, un Q que no llega a lo pedido y un Q de una cuota seca no dominan. Un par sin costo ni es dominado ni domina. Por eso el conjunto de pares usables de una cuota sí depende de lo que se pide y de lo que un reintento excluye.
- Orden de los candidatos: la cuota con `resetsAt` menor primero (un `resetsAt` ausente o ilegible va después de los legibles); dentro de la cuota, menor costo por tarea, con el par sin costo después de los que lo tienen; con el mismo costo, más puntos; después, el orden de la tabla. `candidates` lista todos los pares externos de la tabla: primero los candidatos, en su orden, con `rank` (desde 1) y `outcome` `picked` (el primero) o `next`; después los demás, en el orden de la tabla, con `rank: null`, `outcome: 'passed'` y su `why`. Precedencia de `why`: `harness-off`, `not-installed`, `excluded`, `author`, `dry`, `no-cost` (sin costo y sin `ownerDecision`), `dominated`, `below`. Solo un par que llega a `requested - 1` puede recibir `dominated`; uno que no llega recibe `below`.
- `native` es el par de referencia. Con `nativeDiffers` y la `family` de la referencia en `authors`, es el par de Claude de otro modelo, al mismo effort, con la inteligencia más cercana a `requested` (el más fuerte si hay empate); si los tres modelos son autores queda la referencia y `reason` dice `no other Claude model`.
- La velocidad (`outputTokensPerSecond`, `timeToFirstTokenS`) no se lee en ningún paso.
- `reason` nombra el id del par elegido, o dice `native` y por qué (sin candidato, o toda cuota elegible seca con la palabra `dry`).
- `choose` no muta sus entradas.

Textos de `legacyNotes` (exactos): `lanes-as-on` → `The lanes option is on and superdelegation is not set, so superdelegation counts as on. Set superdelegation to choose it yourself.`; `lanes-ignored` → `The lanes option is ignored: superdelegation is set.`; `seats-ignored` → `The seats option no longer exists (native, balanced and robust are gone): its value is ignored.`

`resolveOption`: `CLAUDE_PLUGIN_OPTION_SUPERDELEGATION` `'true'` o `'false'` manda (`source: 'superdelegation'`); vacía o ausente cuenta como no puesta y manda `lanes` (`'true'` es encendido con la ficha `lanes-as-on`, `source: 'lanes'`; si no, apagado con `source: 'default'`); un `seats` no vacío, incluso `native`, suma `seats-ignored`; un `lanes` `'true'` con `superdelegation` puesta suma `lanes-ignored`.

`runArgs`: devuelve `{ superdelegation: true, harnesses, maxParallelByHarness, waits, cupo: { polls: CUPO.waitSeconds / CUPO.pollSeconds, pollSeconds: CUPO.pollSeconds } }` con los harness de `enabled` (en ese orden) que están en `config.harnesses`, instalados (`installed(name, harness)`) y con al menos un par externo en `pairs`; `waits[role]` es el máximo, entre esos harness, de `Math.ceil(timeouts[role] / waitSeconds) + 1`. `null` si ninguno cumple. `idleHarnesses` da, para cada harness de `enabled` que no entra, la razón: `has no entry in the lane table`, `is not installed: <command> was not found`, `has no models in the lane table yet` o `has no pairs in the pairs table yet`, en ese orden de precedencia.

`tests/helpers.js` y `tests/lane-fixtures.js`: donde fijan `AETHER_LANES: 'on'`, fijan también `AETHER_SUPERDELEGATION: 'on'` (la Task 21 quita la vieja).

**Tests (write first):**

`tests/pairs.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { loadPairs, pairsPath, pairId, referenceOf } = require('../plugins/aether/lib/pairs.js')

const EVIDENCE = path.join(__dirname, '..', 'specs', '009-superdelegation', 'evidence', 'aa-pairs-2026-10-19.json')
const NATIVE = { Haiku: 'haiku', Sonnet: 'sonnet', Opus: 'opus' }
const EXTERNAL = { 'Gemini 4 Argon': 'gemini-4-argon', 'Gemini 3.8 Flash': 'gemini-3.8-flash', 'Grok 4.7': 'grok-4.7' }

function modelOf(name) {
  const native = Object.keys(NATIVE).find((word) => name.startsWith(`Claude ${word}`))
  if (native) return NATIVE[native]
  return EXTERNAL[Object.keys(EXTERNAL).find((word) => name.startsWith(word))]
}

test('the table holds the 22 pairs of the evidence with the same figures, six Claude pairs for agy and the pair of Muse', () => {
  const { pairs } = loadPairs()
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')).pairs
  assert.equal(evidence.length, 22)
  for (const row of evidence) {
    const found = pairs.find((p) => p.harness === row.harness && p.model === modelOf(row.name) && p.effort === row.effort)
    assert.ok(found, `${row.name} is in the table`)
    assert.equal(found.slug, row.slug, row.name)
    assert.equal(found.intelligence, row.intelligence, row.name)
    assert.equal(found.costPerTaskUsd, row.costPerTaskUsd ?? null, row.name)
    assert.equal(found.id, pairId(found.harness, found.model, found.effort))
  }
  assert.equal(pairs.length, 29)
  assert.equal(pairs.filter((p) => p.harness === 'agy' && p.family.startsWith('claude-')).length, 6)
  assert.equal(pairs.filter((p) => p.harness === 'muse').length, 1)
  assert.equal(new Set(pairs.map((p) => p.id)).size, 29)
})

test('the Claude pairs of agy carry the figures of the native pair of the same model and effort', () => {
  const { pairs } = loadPairs()
  for (const pair of pairs.filter((p) => p.harness === 'agy' && p.family.startsWith('claude-'))) {
    const native = pairs.find((p) => p.harness === 'claude' && p.family === pair.family && p.effort === pair.effort)
    assert.ok(native, pair.id)
    assert.equal(pair.slug, native.slug, pair.id)
    assert.equal(pair.intelligence, native.intelligence, pair.id)
    assert.equal(pair.costPerTaskUsd, native.costPerTaskUsd, pair.id)
    assert.equal(pair.group, 'claude')
  }
})

test('every native pair has no group and every external pair has one', () => {
  for (const pair of loadPairs().pairs) assert.equal(pair.group === null, pair.harness === 'claude', pair.id)
})

test('C16: the Muse pair has the figure of Opus high, no cost and the owner words, and no other pair has an owner decision', () => {
  const { pairs } = loadPairs()
  const pair = pairs.find((p) => p.harness === 'muse')
  const opus = referenceOf(pairs, { model: 'opus', effort: 'high' })
  assert.equal(pair.id, 'muse/muse-wonder-full-1.0@high')
  assert.deepEqual([pair.model, pair.family, pair.effort, pair.group, pair.costPerTaskUsd], ['muse-wonder-full-1.0', 'muse-wonder-full-1.0', 'high', 'muse', null])
  assert.deepEqual([pair.slug, pair.intelligence], [opus.slug, opus.intelligence])
  assert.match(pair.ownerDecision, /anivel de opus/)
  assert.deepEqual(pairs.filter((p) => p.ownerDecision !== undefined).map((p) => p.id), [pair.id])
  assert.deepEqual(pairs.filter((p) => p.costPerTaskUsd === null).map((p) => p.id).sort(), ['agy/gemini-3.8-flash@low', pair.id])
})

test('referenceOf gives the native pair of a model and effort, and throws for any other', () => {
  const { pairs } = loadPairs()
  assert.equal(referenceOf(pairs, { model: 'sonnet', effort: 'xhigh' }).intelligence, 51.9)
  assert.equal(referenceOf(pairs, { model: 'opus', effort: 'max' }).id, 'claude/opus@max')
  assert.throws(() => referenceOf(pairs, { model: 'gpt', effort: 'high' }), /no reference pair for gpt high/)
})

test('AETHER_PAIRS_CONFIG names another table, and a table that breaks a rule is refused', (t) => {
  const dir = tempDir(t)
  const good = JSON.parse(fs.readFileSync(pairsPath({}), 'utf8'))
  const write = (name, value) => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, JSON.stringify(value))
    return file
  }
  assert.equal(pairsPath({ AETHER_PAIRS_CONFIG: '/x/pairs.json' }), '/x/pairs.json')
  assert.equal(loadPairs(write('ok.json', good)).pairs.length, 29)
  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(good))
    fn(copy)
    return write(`bad-${Math.random()}.json`, copy)
  }
  assert.throws(() => loadPairs(mutate((c) => c.pairs.push({ ...c.pairs[0] }))), /pairs config .*duplicate/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs.find((p) => p.harness === 'grok').group = null })), /pairs config .*group/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs[0].effort = 'ultra' })), /pairs config .*effort/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs[0].intelligence = '40' })), /pairs config .*intelligence/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs[0].slug = '' })), /pairs config .*slug/)
  assert.throws(() => loadPairs(mutate((c) => { delete c.pairs[1].slug })), /pairs config .*slug/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs.find((p) => p.harness === 'muse').ownerDecision = '' })), /pairs config .*ownerDecision/)
  assert.throws(() => loadPairs(path.join(dir, 'missing.json')), /pairs config/)
})
```

`tests/superdelegation.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { choose, enabled, resolveOption, legacyNotes, runArgs, idleHarnesses, TOLERANCE_POINTS, CUPO } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const { pairs } = loadPairs()
const DAY = 24 * 3600 * 1000
const at = (days) => new Date(Date.UTC(2026, 9, 20) + days * DAY).toISOString()
const open = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: days === null ? null : at(days) })
const dry = { usable: false, unknown: false, mark: null, resetsAt: at(1) }
const world = ({ gemini = open(2), claude = open(3), grok = open(1) } = {}) => ({
  agy: { installed: true, groups: { gemini, claude } },
  grok: { installed: true, groups: { grok } },
})
const ask = (model, effort, more = {}) => choose({ pairs, reference: { model, effort }, harnesses: world(), ...more })
const why = (decision, id) => decision.candidates.find((c) => c.id === id).why
const pickedId = (decision) => (decision.picked ? decision.picked.id : null)

// A small table for the borders: native haiku, sonnet and opus at high, and the externals a test adds.
const row = (id, over = {}) => {
  const [harness, rest] = id.split('/')
  const [model, effort] = rest.split('@')
  return { id, harness, model, family: over.family ?? model, effort, group: harness === 'claude' ? null : (over.group ?? harness), intelligence: 40, costPerTaskUsd: 1, outputTokensPerSecond: 100, timeToFirstTokenS: 1, ...over }
}
const natives = (haiku = 37.8, sonnet = 46.8, opus = 53.6) => [
  row('claude/haiku@high', { family: 'claude-haiku-5-5', intelligence: haiku, costPerTaskUsd: 0.08 }),
  row('claude/sonnet@high', { family: 'claude-sonnet-5-5', intelligence: sonnet, costPerTaskUsd: 0.88 }),
  row('claude/opus@high', { family: 'claude-opus-5-5', intelligence: opus, costPerTaskUsd: 1.82 }),
]
const only = (...names) => Object.fromEntries(names.map((name) => [name, { installed: true, groups: { [name]: open(1) } }]))

const MUSE = 'muse/muse-wonder-full-1.0@high'
const onlyMuse = (days = 2) => ({ muse: { installed: true, groups: { muse: open(days) } } })
const withMuse = (days, base = world()) => ({ ...base, ...onlyMuse(days) })

test('C4: a call asks for the points of its reference pair, never for a model name alone', () => {
  assert.equal(ask('sonnet', 'xhigh').requested, 51.9)
  assert.equal(ask('sonnet', 'high').requested, 46.8)
  assert.equal(ask('haiku', 'high').reference.id, 'claude/haiku@high')
  assert.equal(ask('opus', 'max').requested, 57.6)
  assert.throws(() => choose({ pairs, reference: { model: 'gpt', effort: 'high' }, harnesses: world() }), /no reference pair/)
  assert.equal(TOLERANCE_POINTS, 1)
})

test('E2: a Haiku high call takes the cheapest pair of the quota that renews first', () => {
  const d = ask('haiku', 'high')
  assert.equal(pickedId(d), 'grok/grok-4.7@low')
  assert.equal(d.candidates[0].id, 'grok/grok-4.7@low')
  assert.deepEqual([d.candidates[0].outcome, d.candidates[0].rank], ['picked', 1])
  assert.match(d.reason, /grok\/grok-4\.7@low/)
  assert.equal(d.native.id, 'claude/haiku@high')
  // With grok dry, the next quota to renew is gemini, and its cheapest pair that reaches 36.8 is Flash medium (39.8).
  const next = ask('haiku', 'high', { harnesses: world({ grok: dry }) })
  assert.equal(pickedId(next), 'agy/gemini-3.8-flash@medium')
  assert.equal(why(next, 'grok/grok-4.7@low'), 'dry')
})

test('E3: with only Grok healthy, a Sonnet xhigh call runs native and nothing is asked of the owner', () => {
  const d = ask('sonnet', 'xhigh', { harnesses: world({ gemini: dry, claude: dry }) })
  assert.equal(d.picked, null)
  assert.equal(d.native.id, 'claude/sonnet@xhigh')
  assert.equal(why(d, 'grok/grok-4.7@high'), 'below')
  assert.equal(why(d, 'grok/grok-4.7@xhigh'), 'below')
  assert.match(d.reason, /native/)
})

test('E4 and C6: the quota that renews first takes the call, at the cheapest pair of that quota, even when the other has a cheaper pair', () => {
  assert.equal(pickedId(ask('sonnet', 'xhigh')), 'agy/gemini-4-argon@high')
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: world({ claude: open(1) }) })), 'agy/claude-opus-5-5@medium')
  // gemini renews first: Argon (1.99) wins although Opus medium of the other quota costs 1.34.
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: world({ gemini: open(0), claude: open(1) }) })), 'agy/gemini-4-argon@high')
})

test('C6: Grok, which reaches 46.4, never receives a Sonnet xhigh or an Opus call, even when its quota renews first', () => {
  const harnesses = world({ grok: open(-5) })
  for (const [model, effort] of [['sonnet', 'xhigh'], ['sonnet', 'max'], ['opus', 'high'], ['opus', 'xhigh'], ['opus', 'max']]) {
    const d = ask(model, effort, { harnesses })
    assert.notEqual(d.picked && d.picked.harness, 'grok', `${model} ${effort}`)
    for (const c of d.candidates.filter((x) => x.harness === 'grok')) assert.ok(['below', 'dominated'].includes(c.why), `${model} ${effort} ${c.id}`)
  }
})

test('C5: a pair reaches a call at the points asked minus 1, inclusive, and not 0.1 below', () => {
  const table = [...natives(), row('x/a@high', { intelligence: 45.8, costPerTaskUsd: 3 }), row('y/b@high', { intelligence: 45.7, costPerTaskUsd: 0.5 })]
  const d = choose({ pairs: table, reference: { model: 'sonnet', effort: 'high' }, harnesses: only('x', 'y') })
  assert.equal(pickedId(d), 'x/a@high')
  assert.equal(why(d, 'y/b@high'), 'below')
})

test('C5: a pair with no cost per task is never a candidate, and Flash low is one of them', () => {
  const real = ask('haiku', 'low')
  assert.equal(why(real, 'agy/gemini-3.8-flash@low'), 'no-cost')
  const table = [...natives(), row('a/flash@high', { intelligence: 40, costPerTaskUsd: null })]
  const d = choose({ pairs: table, reference: { model: 'haiku', effort: 'high' }, harnesses: only('a') })
  assert.equal(d.picked, null)
  assert.equal(why(d, 'a/flash@high'), 'no-cost')
})

test('C5 and R9: within a quota a pair that gives no more points than a cheaper candidate of the same call is never used: Grok xhigh against Grok high', () => {
  assert.equal(why(ask('sonnet', 'high'), 'grok/grok-4.7@xhigh'), 'dominated')
  // haiku asks 46.8, sonnet 47.4, opus 50.9 in this table.
  const table = [
    ...natives(46.8, 47.4, 50.9),
    row('g/m@high', { intelligence: 46.3, costPerTaskUsd: 2.73 }),
    row('g/m@xhigh', { intelligence: 46.4, costPerTaskUsd: 3.74 }),
    row('g/m@max', { intelligence: 50, costPerTaskUsd: 9 }),
  ]
  const reach = (model, more = {}) => choose({ pairs: table, reference: { model, effort: 'high' }, harnesses: only('g'), ...more })
  // haiku asks 46.8: high (46.3) and xhigh (46.4) are both candidates, high is cheaper and gives at least 46.4 - 1, so it dominates xhigh and wins.
  const haiku = reach('haiku')
  assert.equal(pickedId(haiku), 'g/m@high')
  assert.equal(why(haiku, 'g/m@xhigh'), 'dominated')
  // max gives clearly more points than high, so the cheaper high does not dominate it: it stays as the next candidate.
  assert.equal(why(haiku, 'g/m@max'), null)
  assert.equal(haiku.candidates.find((c) => c.id === 'g/m@max').outcome, 'next')
  // sonnet asks 47.4: only xhigh (46.4) reaches 46.4. High is not a candidate of this call, so it does not dominate xhigh, and xhigh is picked.
  const sonnet = reach('sonnet')
  assert.equal(pickedId(sonnet), 'g/m@xhigh')
  assert.equal(why(sonnet, 'g/m@high'), 'below')
  // opus asks 50.9: only max reaches 49.9.
  assert.equal(pickedId(reach('opus')), 'g/m@max')
  // a retry that excluded high: it no longer dominates, so xhigh is picked for the call that asked 46.8.
  const retry = reach('haiku', { exclude: ['g/m@high'] })
  assert.equal(pickedId(retry), 'g/m@xhigh')
  assert.equal(why(retry, 'g/m@high'), 'excluded')
})

test('C7: changing the speeds of the table changes no choice', () => {
  const faster = pairs.map((p, i) => ({ ...p, outputTokensPerSecond: i % 2 ? 1 : 1000, timeToFirstTokenS: i % 3 ? 300 : 0.1 }))
  for (const model of ['haiku', 'sonnet', 'opus']) {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const a = choose({ pairs, reference: { model, effort }, harnesses: world() })
      const b = choose({ pairs: faster, reference: { model, effort }, harnesses: world() })
      assert.deepEqual([pickedId(a), a.candidates.map((c) => c.id)], [pickedId(b), b.candidates.map((c) => c.id)], `${model} ${effort}`)
    }
  }
})

test('C8: no pair is ever picked below the points asked minus 1, and a Sonnet xhigh call never lands on high', () => {
  const worlds = [world(), world({ gemini: dry }), world({ claude: dry }), world({ grok: dry }), world({ gemini: dry, claude: dry, grok: dry }), world({ gemini: open(null) })]
  for (const harnesses of worlds) {
    for (const model of ['haiku', 'sonnet', 'opus']) {
      for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
        const d = choose({ pairs, reference: { model, effort }, harnesses })
        if (d.picked) assert.ok(Math.round(d.picked.intelligence * 10) >= Math.round(d.requested * 10) - 10, `${model} ${effort} -> ${d.picked.id}`)
        assert.equal(d.native.id, d.reference.id)
      }
    }
  }
  const xhigh = ask('sonnet', 'xhigh')
  assert.ok(xhigh.picked.intelligence >= 50.9)
  assert.equal(ask('opus', 'max').picked, null)
  assert.equal(ask('sonnet', 'max').picked, null)
})

test('C11: with every eligible quota dry the call runs native, in its reference pair; with one dry and one healthy it goes to the healthy', () => {
  const none = ask('sonnet', 'xhigh', { harnesses: world({ gemini: dry, claude: dry, grok: dry }) })
  assert.equal(none.picked, null)
  assert.equal(none.native.id, 'claude/sonnet@xhigh')
  assert.match(none.reason, /dry/)
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: world({ gemini: dry }) })), 'agy/claude-opus-5-5@medium')
  // a live mark holds a quota as a dry reading does
  const marked = ask('sonnet', 'xhigh', { harnesses: world({ gemini: { usable: true, unknown: false, mark: { until: at(1) }, resetsAt: at(0) } }) })
  assert.equal(why(marked, 'agy/gemini-4-argon@high'), 'dry')
})

test('C16: Muse as the only healthy harness takes a call up to Opus high by the owner decision, and nothing above it', () => {
  const high = ask('opus', 'high', { harnesses: onlyMuse() })
  assert.equal(pickedId(high), MUSE)
  assert.equal(high.requested, 53.6)
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: onlyMuse() })), MUSE)
  assert.equal(pickedId(ask('haiku', 'high', { harnesses: onlyMuse() })), MUSE)
  for (const [model, effort] of [['opus', 'xhigh'], ['opus', 'max'], ['sonnet', 'max']]) {
    const d = ask(model, effort, { harnesses: onlyMuse() })
    assert.equal(d.picked, null, `${model} ${effort}`)
    assert.equal(why(d, MUSE), 'below')
    assert.equal(d.native.id, `claude/${model}@${effort}`)
  }
})

test('C16: the quota of Muse competes by its window like any other, and a dry or missing one does not', () => {
  assert.equal(pickedId(ask('opus', 'high', { harnesses: withMuse(-5) })), MUSE)
  assert.notEqual(pickedId(ask('opus', 'high', { harnesses: withMuse(5) })), MUSE)
  assert.notEqual(pickedId(ask('opus', 'high', { harnesses: withMuse(null) })), MUSE)
  assert.equal(why(ask('opus', 'high', { harnesses: { ...world(), muse: { installed: true, groups: { muse: dry } } } }), MUSE), 'dry')
  assert.equal(why(ask('opus', 'high', { harnesses: { ...world(), muse: { installed: false, groups: {} } } }), MUSE), 'not-installed')
})

test('C5 and C16: without the owner decision a pair with no cost does not enter; with it, it goes last within its quota and neither dominates nor is dominated', () => {
  const bare = pairs.map((p) => {
    if (p.id !== MUSE) return p
    const { ownerDecision, ...rest } = p
    return rest
  })
  const d = choose({ pairs: bare, reference: { model: 'opus', effort: 'high' }, harnesses: onlyMuse() })
  assert.equal(d.picked, null)
  assert.equal(why(d, MUSE), 'no-cost')
  const table = [
    ...natives(),
    row('m/a@high', { intelligence: 53.6, costPerTaskUsd: null, ownerDecision: 'the owner said so' }),
    row('m/b@high', { intelligence: 56, costPerTaskUsd: 9 }),
    row('m/c@high', { intelligence: 53.6, costPerTaskUsd: 2 }),
  ]
  const ordered = choose({ pairs: table, reference: { model: 'opus', effort: 'high' }, harnesses: only('m') })
  assert.deepEqual(ordered.candidates.filter((c) => c.rank !== null).map((c) => c.id), ['m/c@high', 'm/b@high', 'm/a@high'])
})

test('a quota whose window cannot be read competes after the ones that can, and one that is known dry does not compete', () => {
  const table = [...natives(), row('x/a@high', { intelligence: 47, costPerTaskUsd: 0.1 }), row('y/b@high', { intelligence: 47, costPerTaskUsd: 5 })]
  const harnesses = { x: { installed: true, groups: { x: open(null) } }, y: { installed: true, groups: { y: open(4) } } }
  const ref = { model: 'sonnet', effort: 'high' }
  assert.equal(pickedId(choose({ pairs: table, reference: ref, harnesses })), 'y/b@high')
  assert.equal(pickedId(choose({ pairs: table, reference: ref, harnesses: { ...harnesses, y: { installed: true, groups: { y: dry } } } })), 'x/a@high')
})

test('the same cost within a quota goes to the pair with more points, then to the table order', () => {
  const table = [...natives(), row('x/a@high', { intelligence: 47, costPerTaskUsd: 1 }), row('x/b@high', { intelligence: 49, costPerTaskUsd: 1 }), row('x/c@high', { intelligence: 49, costPerTaskUsd: 1 })]
  const d = choose({ pairs: table, reference: { model: 'sonnet', effort: 'high' }, harnesses: only('x') })
  assert.deepEqual(d.candidates.filter((c) => c.rank !== null).map((c) => c.id), ['x/b@high', 'x/c@high', 'x/a@high'])
})

test('a retry excludes the pair that failed, and a harness that is off or not installed is never a candidate', () => {
  const d = ask('sonnet', 'xhigh', { exclude: ['agy/gemini-4-argon@high'] })
  assert.equal(pickedId(d), 'agy/claude-opus-5-5@medium')
  assert.equal(why(d, 'agy/gemini-4-argon@high'), 'excluded')
  const off = choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses: { agy: world().agy } })
  assert.equal(why(off, 'grok/grok-4.7@low'), 'harness-off')
  const missing = choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses: { agy: { installed: false, groups: {} }, grok: world().grok } })
  assert.equal(why(missing, 'agy/gemini-3.8-flash@medium'), 'not-installed')
})

test('C12: nobody reviews its own work, with an external pair and with the native fallback', () => {
  const sonnetAuthor = ask('sonnet', 'high', { authors: ['claude-sonnet-5-5'], nativeDiffers: true })
  assert.equal(why(sonnetAuthor, 'agy/claude-sonnet-5-5@high'), 'author')
  assert.notEqual(sonnetAuthor.picked && sonnetAuthor.picked.family, 'claude-sonnet-5-5')
  const allDry = world({ gemini: dry, claude: dry, grok: dry })
  const judge = ask('opus', 'high', { authors: ['claude-opus-5-5'], nativeDiffers: true, harnesses: allDry })
  assert.equal(judge.picked, null)
  assert.deepEqual([judge.native.model, judge.native.effort, judge.native.family], ['sonnet', 'high', 'claude-sonnet-5-5'])
  // not a review: the native pair is the reference whatever the authors
  assert.equal(ask('opus', 'high', { authors: ['claude-opus-5-5'], harnesses: allDry }).native.model, 'opus')
  // a tie in distance goes to the stronger model
  const tie = choose({ pairs: natives(45, 50, 55), reference: { model: 'sonnet', effort: 'high' }, harnesses: {}, authors: ['claude-sonnet-5-5'], nativeDiffers: true })
  assert.equal(tie.native.model, 'opus')
  // all three are authors: the reference stays and the decision says so
  const all = choose({ pairs: natives(), reference: { model: 'sonnet', effort: 'high' }, harnesses: {}, authors: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], nativeDiffers: true })
  assert.equal(all.native.model, 'sonnet')
  assert.match(all.reason, /no other Claude model/)
})

test('choose does not change what it is given', () => {
  const freeze = (value) => {
    if (value && typeof value === 'object') Object.values(value).forEach(freeze)
    return Object.freeze(value)
  }
  const frozenPairs = freeze(JSON.parse(JSON.stringify(pairs)))
  const harnesses = freeze(JSON.parse(JSON.stringify(world())))
  assert.doesNotThrow(() => choose({ pairs: frozenPairs, reference: { model: 'sonnet', effort: 'xhigh' }, harnesses, exclude: Object.freeze([]), authors: Object.freeze([]) }))
})

test('enabled: on only when the session exports on, on Linux', () => {
  assert.deepEqual(enabled({ AETHER_SUPERDELEGATION: 'on' }, 'linux'), { on: true, reason: null })
  assert.deepEqual(enabled({ AETHER_SUPERDELEGATION: 'on' }, 'darwin'), { on: false, reason: 'platform' })
  assert.deepEqual(enabled({ AETHER_SUPERDELEGATION: 'off' }, 'linux'), { on: false, reason: 'option' })
  assert.deepEqual(enabled({}, 'linux'), { on: false, reason: 'option' })
})

test('C1 and E8: superdelegation is off by default, lanes on counts as on, seats is ignored, and a set value wins', () => {
  assert.deepEqual(resolveOption({}), { on: false, source: 'default', legacy: [] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: '' }), { on: false, source: 'default', legacy: [] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }), { on: true, source: 'superdelegation', legacy: [] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_LANES: 'true' }), { on: true, source: 'lanes', legacy: ['lanes-as-on'] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_LANES: 'false' }), { on: false, source: 'default', legacy: [] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_LANES: 'true', CLAUDE_PLUGIN_OPTION_SEATS: 'native' }), { on: true, source: 'lanes', legacy: ['lanes-as-on', 'seats-ignored'] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', CLAUDE_PLUGIN_OPTION_LANES: 'true' }), { on: false, source: 'superdelegation', legacy: ['lanes-ignored'] })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', CLAUDE_PLUGIN_OPTION_SEATS: 'robust' }), { on: true, source: 'superdelegation', legacy: ['seats-ignored'] })
})

test('legacyNotes tells the owner what was ignored or read as on', () => {
  assert.deepEqual(legacyNotes(['lanes-as-on', 'lanes-ignored', 'seats-ignored']), [
    'The lanes option is on and superdelegation is not set, so superdelegation counts as on. Set superdelegation to choose it yourself.',
    'The lanes option is ignored: superdelegation is set.',
    'The seats option no longer exists (native, balanced and robust are gone): its value is ignored.',
  ])
  assert.deepEqual(legacyNotes([]), [])
})

const harness = (maxParallel) => ({ command: 'x', maxParallel, waitSeconds: 540, timeouts: { implementer: 2700, supervisor: 900, reviewer: 1200 }, groups: {}, models: { m: {} } })

test('runArgs: the harnesses that are enabled, installed and have pairs, their caps, the waits and the cupo wait', () => {
  const config = { harnesses: { agy: harness(4), grok: harness(2), codex: { ...harness(2), models: {} }, cursor: harness(2), muse: harness(2) } }
  const args = runArgs(config, pairs, { installed: (name) => name !== 'cursor', enabled: ['agy', 'grok', 'codex', 'cursor', 'muse'] })
  assert.deepEqual(args, {
    superdelegation: true,
    harnesses: ['agy', 'grok', 'muse'],
    maxParallelByHarness: { agy: 4, grok: 2, muse: 2 },
    waits: { implementer: 6, supervisor: 3, reviewer: 4 },
    cupo: { polls: 10, pollSeconds: 60 },
  })
  assert.deepEqual(CUPO, { waitSeconds: 600, pollSeconds: 60 })
  assert.equal(runArgs(config, pairs, { installed: () => false, enabled: ['agy'] }), null)
  assert.equal(runArgs(null, pairs, { installed: () => true, enabled: ['agy'] }), null)
})

test('idleHarnesses names why an enabled harness gives the run nothing', () => {
  const config = { harnesses: { agy: harness(4), codex: { ...harness(2), models: {} }, cursor: harness(2) } }
  const idle = idleHarnesses(config, pairs, { installed: (name) => name !== 'cursor', enabled: ['agy', 'codex', 'cursor', 'ghost'] })
  assert.deepEqual(idle, [
    { name: 'codex', reason: 'has no models in the lane table yet' },
    { name: 'cursor', reason: 'is not installed: x was not found' },
    { name: 'ghost', reason: 'has no entry in the lane table' },
  ])
})
```

**Acceptance:**
- `config/pairs.json` tiene las 29 filas (la última, la de Muse con las palabras del dueño) y pasa `tests/pairs.test.js`; `lib/pairs.js` rechaza una tabla que rompe una regla con un mensaje que empieza por `pairs config <archivo>:`.
- `choose` cumple `tests/superdelegation.test.js` sin leer la velocidad, sin tocar el disco, la red ni el reloj, y sin mutar sus entradas.
- `lib/superdelegation.js` no importa `lib/lanes.js` (para no crear un ciclo cuando `lanes.js` lo use); lee la tabla de lanes solo como el argumento `config`.
- Los archivos que ya existen y no son de esta tarea no cambian; `npm test` queda verde completo.

### Task 2: La medición del cupo

**Aether:**
- Tier: haiku high — una rampa con reglas exactas que las pruebas fijan, sobre una función de llamada simulada
- Review: xhigh — el script lanza procesos y escribe un archivo de datos, y ninguna prueba lo corre de verdad
- Area: cupo
- Owns: `plugins/aether/lib/lane-cupo.js`, `scripts/lane-cupo.js`, `tests/lane-cupo.test.js`
- Depends on: none
- Serves: R23

**Interfaces:**

```js
// plugins/aether/lib/lane-cupo.js
const CEILING = 8
const MAX_CEILING = 16
const SLOWDOWN = 2
parseArgs(argv) // -> { harness, ceiling, write }; throws Error(USAGE)
USAGE // 'usage: node scripts/lane-cupo.js <harness> [--ceiling <1-16>] [--write]'
async ramp({ run, ceiling = CEILING }) // run(n) resolves to n results { ok: boolean, ms: number }
  // -> { maxParallel: number, limited: boolean, ceiling: number, steps: [{ n, ms, failed }], reason: string }
writeCupo(file, harness, result, { now = Date.now() }) // edits the text of config/lanes.json in place; returns nothing
```

`ramp` lanza 1, 2, 3, … llamadas a la vez, hasta `ceiling`. `steps[i].ms` es la duración de la más lenta del paso y `failed` cuántas no fueron `ok`. El primer paso fija la línea base (`ms` de la llamada sola). Un paso con alguna llamada no `ok`, o con una más lenta que `SLOWDOWN` veces la línea base (estrictamente más), da el tope: `maxParallel` es el `n` anterior y `limited` es `true`, y la rampa se detiene. Si ningún paso lo da, `maxParallel` es `ceiling` y `limited` es `false`. Si la llamada sola falla, `maxParallel` es 0, `limited` es `true` y `reason` lo dice.

`writeCupo` no reescribe el JSON entero (`config/lanes.json` lleva objetos en una línea): reemplaza la línea `"maxParallel": N,` del bloque del harness y deja, justo debajo, la línea `"maxParallelMeasured": { "at": "<ISO>", "ceiling": N, "limited": true|false },` (la reemplaza si ya está). Rechaza un resultado con `maxParallel` menor que 1 y un harness que no está en el archivo.

`scripts/lane-cupo.js <harness> [--ceiling N] [--write]` es un envoltorio fino: para cada paso lanza `n` procesos `node scripts/lane-smoke.js <harness> --effort low` a la vez (`child_process.spawn`), toma de cada uno su código de salida y los `seconds` de su línea JSON, imprime una línea JSON `{ harness, maxParallel, limited, ceiling, steps, reason }` y, con `--write`, llama a `writeCupo` sobre `plugins/aether/config/lanes.json`. Sale con 2 ante un uso incorrecto.

**Tests (write first):**

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { ramp, writeCupo, parseArgs, CEILING, SLOWDOWN, USAGE } = require('../plugins/aether/lib/lane-cupo.js')

const clean = (n, ms = 1000) => Array.from({ length: n }, () => ({ ok: true, ms }))

test('a harness that shows no limit reads as the ceiling and is not marked limited', async () => {
  const seen = []
  const r = await ramp({ ceiling: 4, run: async (n) => (seen.push(n), clean(n)) })
  assert.deepEqual(seen, [1, 2, 3, 4])
  assert.deepEqual([r.maxParallel, r.limited, r.ceiling], [4, false, 4])
  assert.deepEqual(r.steps.map((s) => s.n), [1, 2, 3, 4])
})

test('the ceiling is 8 by default and 2 is the slowdown that counts as a delay', async () => {
  assert.equal(CEILING, 8)
  assert.equal(SLOWDOWN, 2)
  const seen = []
  await ramp({ run: async (n) => (seen.push(n), clean(n)) })
  assert.equal(seen.length, 8)
})

test('a call the harness rejects at n ends the ramp at n - 1', async () => {
  const seen = []
  const r = await ramp({ ceiling: 8, run: async (n) => (seen.push(n), n === 3 ? [{ ok: true, ms: 1000 }, { ok: false, ms: 200 }, { ok: true, ms: 1000 }] : clean(n)) })
  assert.deepEqual(seen, [1, 2, 3])
  assert.deepEqual([r.maxParallel, r.limited], [2, true])
  assert.equal(r.steps[2].failed, 1)
})

test('a step more than twice as slow as the single call is a delay; exactly twice is not', async () => {
  const slow = await ramp({ ceiling: 8, run: async (n) => clean(n, n === 3 ? 2500 : 1000) })
  assert.deepEqual([slow.maxParallel, slow.limited], [2, true])
  const exact = await ramp({ ceiling: 3, run: async (n) => clean(n, n === 3 ? 2000 : 1000) })
  assert.deepEqual([exact.maxParallel, exact.limited], [3, false])
})

test('a single call that fails gives 0 and says why', async () => {
  const r = await ramp({ ceiling: 4, run: async () => [{ ok: false, ms: 10 }] })
  assert.deepEqual([r.maxParallel, r.limited], [0, true])
  assert.match(r.reason, /single call/)
})

const TABLE = `{
  "harnesses": {
    "agy": {
      "command": "agy",
      "maxParallel": 4,
      "waitSeconds": 540
    },
    "grok": {
      "command": "grok",
      "maxParallel": 2,
      "waitSeconds": 540
    }
  }
}
`

test('writeCupo edits only the lines of the harness and replaces its own earlier measurement', (t) => {
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, TABLE)
  const now = Date.parse('2026-10-20T00:00:00.000Z')
  writeCupo(file, 'grok', { maxParallel: 5, limited: false, ceiling: 8 }, { now })
  const once = fs.readFileSync(file, 'utf8')
  assert.equal(
    once,
    TABLE.replace('"maxParallel": 2,', '"maxParallel": 5,\n      "maxParallelMeasured": { "at": "2026-10-20T00:00:00.000Z", "ceiling": 8, "limited": false },'),
  )
  writeCupo(file, 'grok', { maxParallel: 3, limited: true, ceiling: 8 }, { now: now + 1000 })
  const twice = fs.readFileSync(file, 'utf8')
  assert.equal((twice.match(/maxParallelMeasured/g) || []).length, 1)
  assert.ok(twice.includes('"maxParallel": 3,\n      "maxParallelMeasured": { "at": "2026-10-20T00:00:01.000Z", "ceiling": 8, "limited": true },'))
  assert.ok(twice.includes('"maxParallel": 4,\n      "waitSeconds": 540'), 'agy is untouched')
  assert.doesNotThrow(() => JSON.parse(twice))
})

test('writeCupo refuses a result of 0 and a harness that is not in the file', (t) => {
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, TABLE)
  assert.throws(() => writeCupo(file, 'grok', { maxParallel: 0, limited: true, ceiling: 8 }), /at least 1/)
  assert.throws(() => writeCupo(file, 'nope', { maxParallel: 2, limited: true, ceiling: 8 }), /nope/)
  assert.equal(fs.readFileSync(file, 'utf8'), TABLE)
})

test('parseArgs takes a harness, an optional ceiling from 1 to 16 and --write', () => {
  assert.deepEqual(parseArgs(['agy']), { harness: 'agy', ceiling: 8, write: false })
  assert.deepEqual(parseArgs(['grok', '--ceiling', '3', '--write']), { harness: 'grok', ceiling: 3, write: true })
  for (const bad of [[], ['agy', '--ceiling'], ['agy', '--ceiling', '0'], ['agy', '--ceiling', '17'], ['agy', '--ceiling', 'x'], ['agy', 'grok'], ['agy', '--nope']]) {
    assert.throws(() => parseArgs(bad), new RegExp(USAGE.replace(/[[\]().|<>]/g, '\\$&')), JSON.stringify(bad))
  }
})
```

**Acceptance:**
- `tests/lane-cupo.test.js` pasa; `scripts/lane-cupo.js` sin argumentos imprime el uso y sale con 2 sin lanzar nada.
- Ninguna prueba lanza `lane-smoke.js` ni un harness; el script no se corre en `npm test`.
- Con `--write`, un `git diff` de `config/lanes.json` muestra solo las dos líneas por harness, también en el bloque de `muse` (que `scripts/lane-smoke.js muse` ya sabe llamar).

### Task 3: Los comandos pick, took y pause, y las vistas de cuota

**Aether:**
- Tier: sonnet high — integración entre la tabla de lanes, las vistas de cuota existentes, el log y la lista cerrada del mod, con la forma exacta fijada por pruebas
- Review: xhigh — una forma de la lista cerrada mal puesta deja pasar un comando que no debe, o rechaza el que el workflow envía, y el mod no lo prueba contra el bin
- Area: lane-commands
- Owns: `plugins/aether/lib/lane-pick.js`, `plugins/aether/lib/lane-calls.js`, `plugins/aether/bin/aether-lane`, `plugins/aether/hooks/ops-command.mjs`, `tests/lane-pick.test.js`, `tests/ops-command-lanes.test.js`, `tests/ops-command.test.js`, `tests/workflow-harness.js`
- Depends on: Task 1 — `pick` llama a `choose` y carga `pairs.json` con `loadPairs`
- Serves: R5, R10, R12, R14, R15, R18, R19, R24

**Interfaces:**

```js
// plugins/aether/lib/lane-pick.js
harnessViews(config, enabled, { dataDir = run.dataDir(), now = Date.now(), latest = {}, onRead = null })
  // -> the Vista de cuotas of the enabled harnesses: lib/lane-quota.js harnessView(name, settings, { reserve: config.reserve, now, dataDir, fresh: false, latest: latest[name] ?? null, onRead }) -> { installed, groups }
async latestReadings(config, enabled, { dataDir = run.dataDir(), now = Date.now(), createAdapter, refreshStale = quota.refreshStale } = {})
  // -> { [harness]: reading }: the reading harnessView takes as `latest` for each enabled harness that has a refresher (grok today)
async pickCommand(cwd, runId, call, flags, { now = Date.now() } = {}) // -> Decision & { call, role }
tookCommand(cwd, runId, call, flags, { now = Date.now() } = {}) // -> { logged: true }
async pauseCommand(seconds, { sleep } = {}) // -> { paused: seconds }
```

`latestReadings` es la única que renueva la lectura de Grok, y la guarda, porque cada `aether-lane pick` es un proceso nuevo y `refreshStale` solo da la lectura nueva a quien la pide (su refresco por ACP no deja huella en el registro de Grok, así que `needsRefresh` seguiría siendo verdadero en el proceso siguiente). Pasos: (1) `peekReadings({ dataDir, config, harnesses: enabled, now, createAdapter })` y `staleHarnesses({ readings, config, harnesses: enabled, now })` de `lib/router-quota.js`; (2) para los harness con lectura vigente y con refrescador, `latest[harness]` es la lectura de su primer grupo (la que dejó un proceso anterior en `<dataDir>/router/readings/<harness>.json`, el archivo del router, o la del registro del harness si es la más nueva); (3) para los viejos, `refreshStale({ config, enabled: <los viejos>, dataDir, now: () => now })`, y cada lectura nueva se guarda de forma atómica en `readingFile(dataDir, harness)` con la forma que escribe `renewReading` (`{ readAt: now, groups: { [grupo]: { ...lectura } } }`, un grupo por cada grupo de la tabla) y es el `latest` de ese harness. Así, mientras dure `quotaLifeMinutes`, ningún otro `pick` (ni ninguna ronda del diseño, Task 7) lanza el refresco. Nunca lanza: una lectura que no llega deja ese harness sin `latest`.

`pickCommand`: valida el id de la corrida, `call` (`task-N-M-implement`, `task-N-M-supervise` o `final-review`) y las banderas (`--role`, `--model`, `--effort` obligatorias; `--exclude` una lista de ids `<harness>/<modelo>@<effort>`; `--author` una `family`); carga la tabla de lanes y la de pares; toma los harness habilitados con `enabledFor` (de `lib/lane-calls.js`, que esta tarea exporta); obtiene las lecturas con `latestReadings` y las pasa como `latest`; calcula las vistas con `harnessViews`; llama a `choose` con `reference = { model, effort }`, `exclude`, `authors = [author]` y `nativeDiffers = role !== 'implementer'`; escribe en el log de lanes (`lanes.appendLog(dataDir, null, entry)`) la entrada `choice` de las formas compartidas y devuelve la decisión con `call` y `role`. `tookCommand` escribe la entrada `took` tras validar `--by` (`native` o `<harness>:<modelo>`) y `--cause`. `pauseCommand` espera `seconds` (entero de 1 a 120) y devuelve `{ paused: seconds }`; con otra cosa lanza un error.

`bin/aether-lane`: `pick` y `took` entran en el mapa `COMMANDS` con las formas de las formas compartidas; `pause` se atiende en `main` como `quota`, sin corrida. Los comandos `status`, `choice`, `start`, `wait`, `result`, `stop` y los de los asientos no cambian en esta tarea.

`hooks/ops-command.mjs`: las formas de `pick` (sin opcionales, con `--exclude`, con `--author`, con ambos en ese orden), de `took` y de `pause` en la lista cerrada, con estas fichas: el id de par `^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*@(low|medium|high|xhigh|max)$`, una lista de ellos separada por comas, la `family` `^[a-z][a-z0-9.-]*$`, `--by` `^(native|[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*)$`, `--cause` uno de `chosen`, `no-candidate`, `wait-limit`, `failed`, y `--seconds` `^\d{1,3}$`. Las formas viejas (`choice`, `status`) se quedan.

`tests/workflow-harness.js`: el manejador por defecto de `aether-lane` responde `pick` con una decisión nativa (`picked: null`, `native` con el `model` y el `effort` de las banderas, `id` `claude/<model>@<effort>` y `family` `claude-<model>-5-5`), `took` con `{ logged: true }` y `pause` con `{ paused: <segundos> }`. Un `overrides.lane` puede responder los tres.

**Tests (write first):**

`tests/lane-pick.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { PLUGIN, runBin, tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { latestReadings } = require('../plugins/aether/lib/lane-pick.js')
const { readingFile } = require('../plugins/aether/lib/router-quota.js')
const fx = require('./lane-fixtures.js')

const LANE_BIN = path.join(PLUGIN, 'bin', 'aether-lane')
const HOUR = 3600 * 1000
const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
// agy's quota as the fake reports it (tests/lane-status.test.js): [5 h remaining, weekly remaining, null, weekly reset]
const claudeFirst = { 'Gemini Models': [0.9, 0.9, null, inHours(200)], 'Claude and GPT models': [0.9, 0.9, null, inHours(40)] }
const geminiFirst = { 'Gemini Models': [0.9, 0.9, null, inHours(40)], 'Claude and GPT models': [0.9, 0.9, null, inHours(200)] }
const bothDry = { 'Gemini Models': [0.9, 0.02, null, inHours(40)], 'Claude and GPT models': [0.9, 0.02, null, inHours(40)] }
const CALL = 'task-1-1-implement'
const SONNET_XHIGH = ['--role', 'implementer', '--model', 'sonnet', '--effort', 'xhigh']
const pick = (args, env, flags, call = CALL) => fx.lane(args, 'pick', [call, ...flags], env)
const logged = (env, kind) => lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === kind)

test('pick gives the pair of the quota that renews first, asks the points of the reference pair and logs the choice', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { quota: claudeFirst })
  const r = pick(args, env, SONNET_XHIGH)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.requested, 51.9)
  assert.equal(r.json.reference.id, 'claude/sonnet@xhigh')
  assert.equal(r.json.picked.id, 'agy/claude-opus-5-5@medium')
  assert.equal(r.json.native.id, 'claude/sonnet@xhigh')
  assert.deepEqual([r.json.call, r.json.role], [CALL, 'implementer'])
  const [entry] = logged(env, 'choice')
  assert.deepEqual([entry.run, entry.call, entry.role, entry.requested, entry.picked.id], [args.runId, CALL, 'implementer', 51.9, 'agy/claude-opus-5-5@medium'])
  assert.equal(typeof entry.reason, 'string')
  assert.ok(Array.isArray(entry.candidates) && entry.candidates.every((c) => c.id && c.outcome))
  assert.equal(pick(args, fx.laneEnv(t, { quota: geminiFirst }), SONNET_XHIGH).json.picked.id, 'agy/gemini-4-argon@high')
})

test('pick with every quota dry gives no pair and the native pair of the reference, and logs it', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { quota: bothDry })
  const r = pick(args, env, SONNET_XHIGH)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.picked, null)
  assert.equal(r.json.native.id, 'claude/sonnet@xhigh')
  assert.equal(logged(env, 'choice')[0].picked, null)
})

test('pick excludes the pairs it is told, and a review never lands on the author model', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { quota: claudeFirst })
  const next = pick(args, env, [...SONNET_XHIGH, '--exclude', 'agy/claude-opus-5-5@medium,agy/gemini-4-argon@high'])
  assert.equal(next.json.picked.id, 'agy/claude-opus-5-5@high')
  const review = fx.laneEnv(t, { quota: bothDry })
  const judge = pick(args, review, ['--role', 'supervisor', '--model', 'opus', '--effort', 'high', '--author', 'claude-opus-5-5'], 'task-1-1-supervise')
  assert.equal(judge.json.picked, null)
  assert.equal(judge.json.native.model, 'sonnet')
  const implementer = pick(args, review, ['--role', 'implementer', '--model', 'opus', '--effort', 'high', '--author', 'claude-opus-5-5'])
  assert.equal(implementer.json.native.model, 'opus')
})

test('pick refuses what it cannot read, with exit 1 and an error', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { quota: claudeFirst })
  for (const flags of [
    ['--role', 'implementer', '--model', 'gpt', '--effort', 'high'],
    ['--role', 'implementer', '--model', 'sonnet', '--effort', 'ultra'],
    ['--role', 'judge', '--model', 'sonnet', '--effort', 'high'],
    ['--role', 'implementer', '--model', 'sonnet'],
    [...SONNET_XHIGH, '--exclude', 'agy/x'],
    [...SONNET_XHIGH, '--author', 'Bad Family'],
  ]) {
    const r = pick(args, env, flags)
    assert.equal(r.status, 1, JSON.stringify(flags))
    assert.equal(typeof r.json.error, 'string', JSON.stringify(flags))
  }
  assert.equal(pick(args, env, SONNET_XHIGH, 'not-a-call').status, 1)
})

test('took logs who ran the call and why, and refuses a cause it does not know', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const ok = fx.lane(args, 'took', [CALL, '--by', 'agy:claude-opus-5-5', '--cause', 'chosen'], env)
  assert.deepEqual(ok.json, { logged: true })
  const native = fx.lane(args, 'took', ['final-review', '--by', 'native', '--cause', 'no-candidate'], env)
  assert.deepEqual(native.json, { logged: true })
  const entries = logged(env, 'took')
  assert.deepEqual(entries.map((e) => [e.run, e.call, e.by, e.cause]), [[args.runId, CALL, 'agy:claude-opus-5-5', 'chosen'], [args.runId, 'final-review', 'native', 'no-candidate']])
  assert.equal(fx.lane(args, 'took', [CALL, '--by', 'native', '--cause', 'because'], env).status, 1)
  assert.equal(fx.lane(args, 'took', [CALL, '--by', 'agy claude', '--cause', 'chosen'], env).status, 1)
})

test('the refreshed reading of grok is saved, so a later pick within its life does not refresh it again', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const config = { reserve: 0.05, harnesses: { grok: { command: 'grok', quotaLifeMinutes: 30, groups: { grok: 'Grok' }, models: {} } } }
  const NEW = { windows: {}, source: { method: 'acp', ageMinutes: 0 } }
  let asked = 0
  const deps = {
    dataDir,
    createAdapter: () => ({ quotaCost: 'log', quota: () => ({ groups: { grok: { unknown: true, windows: {} } } }) }),
    refreshStale: async () => (asked++, { grok: { refreshed: true, method: 'acp', reading: NEW } }),
  }
  const now = Date.now()
  assert.deepEqual(await latestReadings(config, ['grok'], { ...deps, now }), { grok: NEW })
  assert.equal(asked, 1)
  assert.ok(fs.existsSync(readingFile(dataDir, 'grok')), 'the reading is saved where the router reads it')
  assert.deepEqual(await latestReadings(config, ['grok'], { ...deps, now: now + 10 * 60 * 1000 }), { grok: NEW })
  assert.equal(asked, 1, 'a second process within quotaLifeMinutes does not refresh again')
  await latestReadings(config, ['grok'], { ...deps, now: now + 31 * 60 * 1000 })
  assert.equal(asked, 2, 'past its life it is refreshed again')
})

test('C16: pick gives the Muse pair, by the owner decision, to an Opus high call, and nothing to an Opus xhigh one', (t) => {
  const FAKE_MUSE = path.join(__dirname, 'fixtures', 'fake-muse.js')
  fs.chmodSync(FAKE_MUSE, 0o755)
  const { args } = fx.laneRun(t)
  const env = { ...fx.laneEnv(t, { mutate: (config) => { config.harnesses.muse.command = FAKE_MUSE } }), AETHER_LANE_HARNESSES: 'muse' }
  const file = path.join(env.AETHER_DATA_DIR, 'lanes', 'quota', 'muse-observed.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ observedAt: Date.now(), window: { usedPercent: 10, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: 10, resetsAtMs: Date.now() + 5 * 24 * HOUR } }))
  const high = pick(args, env, ['--role', 'implementer', '--model', 'opus', '--effort', 'high'])
  assert.equal(high.status, 0, high.stdout + high.stderr)
  assert.deepEqual([high.json.requested, high.json.picked.id], [53.6, 'muse/muse-wonder-full-1.0@high'])
  const xhigh = pick(args, env, ['--role', 'implementer', '--model', 'opus', '--effort', 'xhigh'])
  assert.equal(xhigh.json.picked, null)
  assert.equal(xhigh.json.native.id, 'claude/opus@xhigh')
})

test('pause waits the seconds it is given, from 1 to 120, and refuses any other value', (t) => {
  const env = fx.laneEnv(t)
  const started = Date.now()
  const r = runBin(LANE_BIN, ['pause', '--seconds', '1'], process.cwd(), env)
  assert.deepEqual(r.json, { paused: 1 })
  assert.ok(Date.now() - started >= 900)
  for (const bad of ['0', '121', 'x', '-1', '1.5']) assert.equal(runBin(LANE_BIN, ['pause', '--seconds', bad], process.cwd(), env).status, 1, bad)
  assert.equal(runBin(LANE_BIN, ['pause'], process.cwd(), env).status, 1)
})
```

`tests/ops-command-lanes.test.js` (casos nuevos; los de `choice` se quedan; usa el `prompt`, `RUN`, `CALL`, `parseOpsPrompt` y `OPS_TIMEOUT_MS` del archivo):

```js
const PAIR = 'agy/claude-opus-5-5@medium'

test('pick, took and pause parse to their argument vectors', () => {
  const forms = [
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort xhigh`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort xhigh --exclude ${PAIR}`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort xhigh --exclude ${PAIR},grok/grok-4.7@low,muse/muse-wonder-full-1.0@high`,
    `aether-lane pick ${RUN} task-1-1-supervise --role supervisor --model sonnet --effort high --author claude-sonnet-5-5`,
    `aether-lane pick ${RUN} final-review --role reviewer --model opus --effort max --exclude ${PAIR} --author gemini-4-argon`,
    `aether-lane took ${RUN} ${CALL} --by agy:claude-opus-5-5 --cause chosen`,
    `aether-lane took ${RUN} final-review --by native --cause wait-limit`,
    `aether-lane took ${RUN} ${CALL} --by muse:muse-wonder-full-1.0 --cause chosen`,
    'aether-lane pause --seconds 60',
  ]
  for (const command of forms) {
    assert.deepEqual(parseOpsPrompt(prompt(command)), { cwd: '/repo', bin: 'aether-lane', args: command.split(' ').slice(1), timeoutMs: OPS_TIMEOUT_MS }, command)
  }
})

test('pick, took and pause refuse a value or an order they do not take', () => {
  const refused = [
    `aether-lane pick ${RUN} ${CALL} --role judge --model sonnet --effort high`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model gpt --effort high`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort ultra`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort high --exclude agy/x`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort high --author A;B`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort high --author gemini-4-argon --exclude ${PAIR}`,
    `aether-lane pick ${RUN} bad-call --role implementer --model sonnet --effort high`,
    `aether-lane took ${RUN} ${CALL} --by native --cause because`,
    `aether-lane took ${RUN} ${CALL} --cause chosen --by native`,
    'aether-lane pause --seconds -1',
    'aether-lane pause --seconds 1000',
    'aether-lane pause 60',
  ]
  for (const command of refused) assert.equal(parseOpsPrompt(prompt(command)), null, command)
})
```

**Acceptance:**
- `tests/lane-pick.test.js` y los casos nuevos de `tests/ops-command-lanes.test.js` pasan; los tests existentes de `aether-lane` (`status`, `choice`, `start`, `wait`, `result`, `stop`, asientos) y de la lista cerrada pasan sin cambios.
- `pick` no escribe nada más que la entrada `choice` en el log, y la lectura renovada de Grok en `readingFile` (la de `latestReadings`); no arranca ninguna llamada externa.
- `lib/lane-calls.js` solo gana la exportación de `enabledFor`.
- El uso (`USAGE`) de `aether-lane` y el comentario de cabecera de `bin/aether-lane` listan los comandos nuevos.

### Task 4: El arranque de la sesión

**Aether:**
- Tier: sonnet high — un bin con textos y variables que las pruebas fijan, sobre una migración de valores
- Review: xhigh — lectura de variables de entorno y migración de valores del dueño: un caso mal leído apaga o enciende la superdelegación sin que él lo sepa
- Area: options
- Owns: `plugins/aether/bin/aether-session-start`, `tests/session-start.test.js`, `tests/session-start-autonomy.test.js`, `tests/bootstrap-names.test.js`
- Depends on: Task 1 — usa `resolveOption` y `legacyNotes` de `lib/superdelegation.js`
- Serves: R1, R2, R4

**Interfaces:**

`bin/aether-session-start`: `passLanes()` escribe en `CLAUDE_ENV_FILE`, en este orden y con estas líneas exactas, `export AETHER_SUPERDELEGATION=<on|off>\nexport AETHER_SUPERDELEGATION_LEGACY=<fichas separadas por comas>\nexport AETHER_LANE_HARNESSES=<lista>\n`, con `resolveOption(process.env)` y `enabledHarnesses`. Ya no escribe `AETHER_LANES` ni `AETHER_SEATS`; se quitan `seatsNote` y su uso de `seatsChoice`. El contexto de la sesión suma, una por ficha de `legacy`, el texto de `legacyNotes`, y si no se pudo escribir el archivo: `Aether could not pass the superdelegation option to this session's commands, so superdelegation is off.`

En `tests/session-start.test.js` y `tests/session-start-autonomy.test.js`, `hookEnv` borra también `CLAUDE_PLUGIN_OPTION_SUPERDELEGATION`, `CLAUDE_PLUGIN_OPTION_SEATS`, `AETHER_SUPERDELEGATION` y `AETHER_SUPERDELEGATION_LEGACY` del entorno que hereda. `tests/bootstrap-names.test.js` (su lista de variables que borra del entorno, hoy `CLAUDE_ENV_FILE`, `CLAUDE_PLUGIN_OPTION_LANES`, `CLAUDE_PLUGIN_OPTION_HARNESSES`, `CLAUDE_PLUGIN_OPTION_OPS` y `AETHER_LANES`) cambia `AETHER_LANES` por `CLAUDE_PLUGIN_OPTION_SUPERDELEGATION`, `CLAUDE_PLUGIN_OPTION_SEATS`, `AETHER_SUPERDELEGATION` y `AETHER_SUPERDELEGATION_LEGACY`.

**Tests (write first):**

`tests/session-start.test.js` (reemplazan las pruebas de `AETHER_LANES` y `AETHER_SEATS`; usa su `start`, `hookEnv`, `makeRepo`, `tempDir`):

```js
function exported(t, extra = {}) {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t, 'aether-env-'), 'env')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, ...extra } })
  assert.equal(r.status, 0, r.stderr)
  return { text: fs.readFileSync(envFile, 'utf8'), context: r.out.hookSpecificOutput.additionalContext }
}

test('C1: with nothing set, superdelegation is off and nothing is ignored', (t) => {
  const { text, context } = exported(t)
  assert.equal(text, 'export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=\nexport AETHER_LANE_HARNESSES=agy\n')
  assert.doesNotMatch(context, /seats option|lanes option/)
})

test('C1: a set superdelegation wins, true or false', (t) => {
  assert.ok(exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }).text.startsWith('export AETHER_SUPERDELEGATION=on\n'))
  assert.ok(exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', CLAUDE_PLUGIN_OPTION_LANES: 'true' }).text.startsWith('export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=lanes-ignored\n'))
})

test('E8: lanes on with superdelegation unset counts as on, and seats native is ignored, and the owner is told both', (t) => {
  const { text, context } = exported(t, { CLAUDE_PLUGIN_OPTION_LANES: 'true', CLAUDE_PLUGIN_OPTION_SEATS: 'native' })
  assert.equal(text, 'export AETHER_SUPERDELEGATION=on\nexport AETHER_SUPERDELEGATION_LEGACY=lanes-as-on,seats-ignored\nexport AETHER_LANE_HARNESSES=agy\n')
  assert.ok(context.includes('The lanes option is on and superdelegation is not set, so superdelegation counts as on. Set superdelegation to choose it yourself.'))
  assert.ok(context.includes('The seats option no longer exists (native, balanced and robust are gone): its value is ignored.'))
})

test('the harness list is still the option, or agy', (t) => {
  assert.match(exported(t, { CLAUDE_PLUGIN_OPTION_HARNESSES: 'grok, AGY,nope' }).text, /export AETHER_LANE_HARNESSES=grok,agy\n$/)
})

test('without CLAUDE_ENV_FILE the context says superdelegation is off', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' } })
  assert.ok(r.out.hookSpecificOutput.additionalContext.includes("Aether could not pass the superdelegation option to this session's commands, so superdelegation is off."))
})
```

**Acceptance:**
- Una prueba con las opciones sin configurar ve `superdelegation` apagada; una con `lanes` encendido y sin `superdelegation` la ve encendida y el arranque lo dice; una con `seats` (también `native`) lo ve ignorado y el arranque lo dice.
- `aether-session-start` ya no escribe `AETHER_LANES` ni `AETHER_SEATS` ni nombra `seatsChoice`.
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 5: El informe por llamada y las cifras de RADAR

**Aether:**
- Tier: sonnet high — cruza las entradas del log con el resultado de la corrida y el uso, sobre un informe que ya tiene su estructura
- Review: high — la lógica es de lectura y suma, y las pruebas fijan las formas
- Area: report
- Owns: `plugins/aether/lib/report.js`, `plugins/aether/bin/aether-report`, `tests/report.test.js`, `tests/report-fixtures.js`, `tests/aether-report.test.js`
- Depends on: Task 1 — repite lo que ignoró la sesión con `legacyNotes`
- Serves: R2, R12, R18

**Interfaces:**

`report(cwd, runId, { dataDir, tests, env = process.env })` (la firma de hoy, más `env`) mantiene su resultado y cambia estas partes:

- `lanes.run.choices`: una entrada por llamada, ordenada por la hora de su primera `choice`: `{ call, role, reference, requested, picked, by, cause, reason, ms, candidates }`. `reference`, `requested`, `picked`, `reason` y `candidates` son los de la última entrada `choice` de la llamada (pueden ser varias si un arranque no disponible repitió el `pick`); `by` y `cause` los de su entrada `took` (`null` sin ella); `ms` es la hora de la `took` menos la de la primera `choice` (`null` sin `took`). Una `choice` de otra corrida, o fuera de la ventana de la corrida, no cuenta.
- `radar.delegation.work`: `{ calls, external, native, externalShare }` con una llamada por cada `took` de la corrida (`external` las que no son `native`; `externalShare` es `external / calls`, `null` sin llamadas). `radar.delegation.quotaByHarness`: `{ [harness]: { [window]: { consumed, resets } } }`, sumando las ventanas de los grupos que usaron las llamadas de ese harness (cada llamada del log trae su `harness` y su `group`). Los dólares a precio de lista (`lanesUsd`, `nativeUsd`, `laneShare`) no cambian.
- `superdelegation`: `{ on: boolean | null, legacy: string[] }` con `on` de `env.AETHER_SUPERDELEGATION` (`null` si no está) y `legacy` los textos de `legacyNotes` para las fichas de `env.AETHER_SUPERDELEGATION_LEGACY`.
- Las entradas `choice` con la forma vieja (`tier`, `candidates` con `state`) no rompen el informe: sus campos nuevos quedan en `null`.

**Tests (write first):**

En `tests/report.test.js` (usa sus propias `useDataDir`, `finishedRun`, `appendLog`, `T0`, `MIN`; `choiceEntry` se reescribe a la forma nueva y la prueba de `choices` de hoy se reemplaza por esta):

```js
function choiceEntry(runId, minutes, fields) {
  return { kind: 'choice', time: T0 + minutes * MIN, session: null, run: runId, design: null, requested: 46.8, reference: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }, native: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', family: 'claude-sonnet-5-5', intelligence: 46.8 }, ...fields }
}
const tookEntry = (runId, minutes, fields) => ({ kind: 'took', time: T0 + minutes * MIN, session: null, run: runId, ...fields })
const OPUS_MEDIUM = { id: 'agy/claude-opus-5-5@medium', harness: 'agy', model: 'claude-opus-5-5', effort: 'medium', group: 'claude', family: 'claude-opus-5-5', intelligence: 51.2, costPerTaskUsd: 1.34 }

test('report lists, per call, the reference pair, the pair that took it, why, and how long it took', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  const candidates = [{ id: OPUS_MEDIUM.id, outcome: 'picked', why: null }, { id: 'grok/grok-4.7@high', outcome: 'passed', why: 'below' }]
  appendLog(dataDir, null, choiceEntry(args.runId, 12, { call: 'task-1-1-supervise', role: 'supervisor', picked: null, reason: 'native: every eligible quota is dry', candidates: [] }))
  appendLog(dataDir, null, choiceEntry(args.runId, 4, { call: 'task-1-1-implement', role: 'implementer', picked: OPUS_MEDIUM, reason: 'took agy/claude-opus-5-5@medium', candidates }))
  appendLog(dataDir, null, tookEntry(args.runId, 9, { call: 'task-1-1-implement', by: 'agy:claude-opus-5-5', cause: 'chosen' }))
  appendLog(dataDir, null, tookEntry(args.runId, 14, { call: 'task-1-1-supervise', by: 'native', cause: 'no-candidate' }))
  // Another run's, and one after the run ended, are not this run's.
  appendLog(dataDir, null, choiceEntry('20261001-000000-aaaa', 5, { call: 'task-1-1-implement', role: 'implementer', picked: null, reason: 'x', candidates: [] }))
  appendLog(dataDir, null, choiceEntry(args.runId, 45, { call: 'task-3-1-implement', role: 'implementer', picked: null, reason: 'late', candidates: [] }))
  const { lanes, radar } = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(lanes.run.choices, [
    { call: 'task-1-1-implement', role: 'implementer', reference: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }, requested: 46.8, picked: OPUS_MEDIUM, by: 'agy:claude-opus-5-5', cause: 'chosen', reason: 'took agy/claude-opus-5-5@medium', ms: 5 * MIN, candidates },
    { call: 'task-1-1-supervise', role: 'supervisor', reference: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }, requested: 46.8, picked: null, by: 'native', cause: 'no-candidate', reason: 'native: every eligible quota is dry', ms: 2 * MIN, candidates: [] },
  ])
  assert.deepEqual(radar.delegation.work, { calls: 2, external: 1, native: 1, externalShare: 0.5 })
  assert.equal(report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false }).lanes.run.choices.length, 0)
})

test('a call whose pick was repeated keeps the last choice and the first time; a call with no took has no duration', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, null, choiceEntry(args.runId, 3, { call: 'task-1-1-implement', role: 'implementer', picked: OPUS_MEDIUM, reason: 'first', candidates: [] }))
  appendLog(dataDir, null, choiceEntry(args.runId, 5, { call: 'task-1-1-implement', role: 'implementer', picked: null, reason: 'second', candidates: [] }))
  appendLog(dataDir, null, tookEntry(args.runId, 8, { call: 'task-1-1-implement', by: 'native', cause: 'failed' }))
  appendLog(dataDir, null, choiceEntry(args.runId, 6, { call: 'final-review', role: 'reviewer', picked: null, reason: 'open', candidates: [] }))
  const { choices } = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run
  assert.deepEqual(choices.map((c) => [c.call, c.reason, c.by, c.cause, c.ms]), [['task-1-1-implement', 'second', 'native', 'failed', 5 * MIN], ['final-review', 'open', null, null, null]])
})

test('the RADAR figures say how much of the work left Claude and what each harness quota consumed', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  appendLog(dataDir, null, tookEntry(args.runId, 5, { call: 'task-1-1-implement', by: 'agy:gemini-3.8-flash', cause: 'chosen' }))
  appendLog(dataDir, null, tookEntry(args.runId, 6, { call: 'task-2-1-implement', by: 'native', cause: 'no-candidate' }))
  appendLog(dataDir, null, tookEntry(args.runId, 7, { call: 'task-3-1-implement', by: 'native', cause: 'wait-limit' }))
  const { radar } = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(radar.delegation.work, { calls: 3, external: 1, native: 2, externalShare: 1 / 3 })
  assert.ok(radar.delegation.quotaByHarness.agy['5h'].consumed > 0)
  assert.equal(typeof radar.delegation.lanesUsd, 'number')
})

test('the report repeats what the session ignored or read as on', (t) => {
  const { repo, args } = finishedRun(t)
  const env = { AETHER_SUPERDELEGATION: 'on', AETHER_SUPERDELEGATION_LEGACY: 'lanes-as-on,seats-ignored' }
  const { superdelegation } = report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false, env })
  assert.equal(superdelegation.on, true)
  assert.deepEqual(superdelegation.legacy, [
    'The lanes option is on and superdelegation is not set, so superdelegation counts as on. Set superdelegation to choose it yourself.',
    'The seats option no longer exists (native, balanced and robust are gone): its value is ignored.',
  ])
  assert.deepEqual(report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false, env: {} }).superdelegation, { on: null, legacy: [] })
})

test('a choice written in the old shape does not break the report', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, null, { kind: 'choice', time: T0 + 4 * MIN, session: null, run: args.runId, design: null, call: 'task-1-1-implement', role: 'implementer', tier: 'haiku', effort: 'xhigh', picked: { harness: 'grok', model: 'grok-4.7' }, candidates: [], reason: 'old' })
  const [choice] = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run.choices
  assert.deepEqual([choice.call, choice.reason, choice.reference, choice.requested, choice.ms], ['task-1-1-implement', 'old', null, null, null])
})
```

**Acceptance:**
- Los tests nuevos pasan y los demás de `tests/report*.test.js` y `tests/aether-report.test.js` pasan sin cambiar, salvo la prueba de `choices` y `choiceEntry` que esta tarea reescribe.
- `aether-report --run <id>` imprime los campos nuevos (`lanes.run.choices` con `ms`, `radar.delegation.work`, `radar.delegation.quotaByHarness`, `superdelegation`) sin cambiar los que ya tenía.
- Una llamada de `muse-wonder-full-1.0` (sin precio en `config/prices.json`) suma 0 dólares a `lanesUsd` y el informe lo anota una vez (`no price for lane model muse-wonder-full-1.0`, `laneDollars` de `lib/report.js`), como hoy; esta tarea no lo cambia.
- `aether-report --seats` sigue igual; muestra, además, el `reference` y el `reason` de cada ronda cuando la entrada `seat` los trae (Task 7).

### Task 6: El swarm sobre pick

**Aether:**
- Tier: opus high — concurrencia (cola de `pick`, cupo por harness, espera con límite) y una reescritura del camino de las llamadas externas de un workflow largo, con la regla copiada que se retira
- Review: xhigh — el estado compartido de las llamadas en vuelo y los reintentos son concurrencia: un lugar mal contado deja una llamada esperando de más o saltándose el cupo
- Area: swarm
- Owns: `plugins/aether/workflows/run.workflow.js`, `tests/workflow-superdelegation.test.js`, `tests/workflow-lanes.test.js`, `tests/workflow-order.test.js`, `tests/workflow.test.js`, `tests/workflow-salvage.test.js`, `tests/workflow-harness.js`, `tests/ops-command.test.js`
- Depends on: Task 3 — envía `pick`, `took` y `pause`, que la lista cerrada del mod acepta desde esa tarea
- Depends on: Task 15 — lee los argumentos de la corrida que `aether-plan compile` escribe
- Serves: R4, R5, R6, R14, R15, R16, R17, R19, R20, R22

**Base: lo que ya trae `run.workflow.js` de `fix/bug-issues` (fusionada, `888cb78`) y se conserva.** El `binDir` de los args y su `wtBin` (issue 008); el reintento único del paso `ops` cuando la respuesta dice que no corrió el comando (004); la consulta `aether-wt status` antes de bloquear una unidad por un merge ilegible (002); `modelAgentsSpent()`, que hace que el presupuesto cuente solo agentes con modelo (013); `READING_PLAN` y la revisión final por rebanadas de hasta tres unidades de un área (011, 022), que corre nativa porque una llamada de lane tiene el id fijo `final-review`; las etiquetas `<tarea>: implement via <harness> <modelo> on <rung> (attempt n)` y la línea de progreso `ran on <harness> <modelo> · N tok` (032). Sus pruebas están en `tests/workflow.test.js`, `tests/workflow-lanes.test.js` y `tests/workflow-order.test.js`: la reescritura de la ruta de las llamadas externas las conserva verdes, y una que deba cambiar porque `pick` cambia el orden o la etiqueta se actualiza con su razón, no se borra.

**Interfaces:**

`run.workflow.js` lee `input.lanes` con la forma de los argumentos de la corrida (`null` o `{ superdelegation: true, harnesses, maxParallelByHarness, waits, cupo }`; `harnesses` una lista no vacía de nombres, `maxParallelByHarness`, `waits` y `cupo` obligatorios, con enteros de al menos 1; un `lanes` de otra forma lanza `aether:run args: lanes is invalid`). Con `lanes` nulo no hay ninguna llamada a `aether-lane` y todo corre nativo, como hoy.

Cada llamada de implementador, supervisor y revisión final pasa por una función `decide({ role, model, effort, id, exclude, author })` que, con `lanes`, envía por el ops agent `aether-lane pick <run> <id> --role <rol> --model <alias> --effort <effort> [--exclude <ids>] [--author <family>]` (los `pick` van por una cola: uno a la vez) y devuelve la decisión. Con `picked` nulo la llamada corre en el agente nativo con `decision.native.model` y `decision.native.effort`. Con un par elegido:
1. si el pool de su harness está lleno (`maxParallelByHarness[harness]` llamadas en vuelo) espera: hasta `cupo.polls` rondas de `aether-lane pause --seconds <cupo.pollSeconds>`, mirando el pool antes de cada ronda; con lugar, arranca (el lugar se toma de forma síncrona, antes de cualquier `await`, como hoy); si se agotan las rondas, corre nativa, en el par `decision.native` (su `model` y su `effort`);
2. `aether-lane start <run> <id> --role <rol> [--task <task>] --model <modelo del par> --effort <effort del par> --digest <digest>` con el prompt como carga, y espera con `wait`/`result` como hoy (`waits[role]` rondas);
3. un `start` `unavailable` repite `decide` con ese par en `exclude`, hasta que `picked` sea nulo; la llamada que sigue nativa usa el `decision.native` del último `pick`.
Al terminar la llamada, sea cual sea el camino, envía `aether-lane took <run> <id> --by <native|harness:modelo> --cause <chosen|no-candidate|wait-limit|failed>` (sin esperarlo; el workflow no termina sin que todas las `took` hayan acabado): `no-candidate` si el primer `pick` no dio par, `wait-limit` si se agotó la espera, `failed` si el par externo falló o no arrancó y la llamada siguió nativa, `chosen` si corrió en el par elegido.

**El agente nativo.** Toda llamada que cae a nativo, sea `no-candidate`, `wait-limit` o `failed` (incluido el par externo que arrancó y falló, que no repite el `pick`), corre en el `model` y el `effort` de `decision.native` de su `pick` (el último, si hubo un `start` no disponible): nunca en un modelo que el workflow calcule por su cuenta ni en la referencia sin mirar la decisión. Esa decisión ya difiere del autor en un supervisor y en la revisión final (C12, R17), así que el workflow no vuelve a comprobarlo.

Referencias: implementador, `{ model: tier del escalón, effort: effortFor(...) }`; supervisor, `{ model: 'sonnet', effort: task.review }`; revisión final, `{ model, effort }` de `reviewPlan()`. `max` pasa por `pick` como cualquier effort. `--author` del supervisor es la `family` de quien corrió el intento que revisa (`decision.picked.family` si corrió un par, si no `decision.native.family`); `--author` de la revisión final es la `family` que implementó más unidades fusionadas (con empate, la de la unidad de menor número). Un implementador no lleva `--author`.

Reintentos: un intento que sigue a uno que no aprobó (`retry`, `escalate`, un implementador sin informe, un fallo de fusión) lleva `--exclude` con el id del par donde corrió el intento anterior, si fue externo.

El resultado `lanes` de la corrida conserva `{ calls, ok, failed, quota, violation, blocked, unavailable, overflow }` con `overflow` = las llamadas que agotaron la espera de cupo, y pierde `dry`. Desaparecen `laneWalk`, `orderOf`, `exclusionOf`, `rankOf`, `unavailableOutcome`, `logChoice`, `choiceLogs`, `readQuota`, `groupViews`, `notInstalled`, `dryInRun`, `candidatesFor`, `plannedLanes`, `harnessNames` y `groupLabel`, y la salida `effort === 'max'`.

`tests/workflow-harness.js`: la etapa de cuota por ola (`status`) y `choice` ya no tienen manejador por defecto; `pick`, `took` y `pause` conservan los de la Task 3.

**Tests (write first):**

`tests/workflow-superdelegation.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')

const LANES = { superdelegation: true, harnesses: ['agy'], maxParallelByHarness: { agy: 1 }, waits: { implementer: 3, supervisor: 2, reviewer: 2 }, cupo: { polls: 3, pollSeconds: 60 } }
const FLASH = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', model: 'gemini-3.8-flash', family: 'gemini-3.8-flash', effort: 'medium', group: 'gemini', intelligence: 39.8, costPerTaskUsd: 0.93 }
const OPUS = { id: 'agy/claude-opus-5-5@medium', harness: 'agy', model: 'claude-opus-5-5', family: 'claude-opus-5-5', effort: 'medium', group: 'claude', intelligence: 51.2, costPerTaskUsd: 1.34 }
const FAMILY = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

const argsOf = (t, tasks = [task(1)], lanes = LANES) => ({ ...compile(makeRepo(t), plan(tasks)), lanes })
const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
const verbs = (run, verb) => run.calls.filter((c) => c.kind === `ops:lane-${verb}`)
const flagsOf = (call) => ({ ...call.lane })
const natives = (run, role) => run.calls.filter((c) => c.role === role)
const starts = (run, role) => verbs(run, 'start').filter((c) => c.lane.role === role).length

// A decision for a pick's flags: `pairs[call]` gives the pair that call takes, or none (native).
function decision(call, picked) {
  const f = call.lane
  const native = { id: `claude/${f.model}@${f.effort}`, model: f.model, effort: f.effort, family: FAMILY[f.model], intelligence: 40 }
  return { call: f.call, role: f.role, requested: 40, reference: native, picked, native, reason: picked ? `took ${picked.id}` : 'native: test', candidates: [] }
}
const lane = (pairs = {}) => (call, fallback) => {
  if (call.command.verb === 'pick') return decision(call, pairs[call.lane.call] ?? null)
  return fallback(call)
}

test('without lanes the run never calls aether-lane and every round is native', async (t) => {
  for (const lanes of [null, undefined]) {
    const args = argsOf(t, [task(1)], lanes)
    if (lanes === undefined) delete args.lanes
    const run = await runWorkflow(args)
    ok(run)
    assert.equal(run.calls.some((c) => c.command && c.command.tool === 'aether-lane'), false)
    assert.equal(run.result.lanes, null)
  }
})

test('lanes of the wrong shape are refused before any agent starts', async (t) => {
  const bad = [{ superdelegation: true }, { ...LANES, maxParallelByHarness: { agy: 0 } }, { ...LANES, cupo: { polls: 0, pollSeconds: 60 } }, { ...LANES, waits: {} }, { ...LANES, harnesses: [] }]
  for (const lanes of bad) {
    const run = await runWorkflow(argsOf(t, [task(1)], lanes))
    assert.equal(run.error && run.error.message, 'aether:run args: lanes is invalid')
    assert.equal(run.calls.length, 0)
  }
})

test('C3: each call asks pick for the pair of its reference, and a pair that takes it runs on aether-lane start at the pair effort', async (t) => {
  const args = argsOf(t)
  const run = await runWorkflow(args, { lane: lane({ 'task-1-1-implement': FLASH, 'task-1-1-supervise': OPUS, 'final-review': OPUS }) })
  ok(run)
  const picks = verbs(run, 'pick').map((c) => c.lane)
  assert.deepEqual(picks.map((p) => [p.call, p.role, p.model, p.effort]), [
    ['task-1-1-implement', 'implementer', 'haiku', 'xhigh'],
    ['task-1-1-supervise', 'supervisor', 'sonnet', 'high'],
    ['final-review', 'reviewer', 'sonnet', 'high'],
  ])
  assert.equal(picks[0].author, undefined)
  assert.equal(picks[1].author, 'gemini-3.8-flash')
  assert.equal(picks[2].author, 'gemini-3.8-flash')
  const started = verbs(run, 'start').map((c) => [c.lane.call, c.lane.model, c.lane.effort])
  assert.deepEqual(started, [['task-1-1-implement', 'gemini-3.8-flash', 'medium'], ['task-1-1-supervise', 'claude-opus-5-5', 'medium'], ['final-review', 'claude-opus-5-5', 'medium']])
  assert.equal(verbs(run, 'status').length + run.calls.filter((c) => c.kind === 'ops:lane-choice').length, 0)
  assert.equal(natives(run, 'implementer').length + natives(run, 'supervisor').length + natives(run, 'reviewer').length, 0)
  assert.deepEqual(verbs(run, 'took').map((c) => [c.lane.call, c.lane.by, c.lane.cause]), [
    ['task-1-1-implement', 'agy:gemini-3.8-flash', 'chosen'],
    ['task-1-1-supervise', 'agy:claude-opus-5-5', 'chosen'],
    ['final-review', 'agy:claude-opus-5-5', 'chosen'],
  ])
})

test('C11: a call with no pair runs native in the native pair of the decision, and took says no-candidate', async (t) => {
  const run = await runWorkflow(argsOf(t), {
    lane: (call, fallback) => {
      if (call.command.verb !== 'pick') return fallback(call)
      const d = decision(call, null)
      if (call.lane.role === 'supervisor') d.native = { ...d.native, model: 'opus', effort: 'high', id: 'claude/opus@high', family: FAMILY.opus }
      return d
    },
  })
  ok(run)
  assert.equal(verbs(run, 'start').length, 0)
  const [supervisor] = natives(run, 'supervisor')
  assert.deepEqual([supervisor.model, supervisor.effort], ['opus', 'high'])
  assert.deepEqual([...new Set(verbs(run, 'took').map((c) => c.lane.cause))], ['no-candidate'])
  assert.ok(verbs(run, 'took').every((c) => c.lane.by === 'native'))
})

test('C12: a supervisor review names the family that implemented the attempt, and the native fallback is the family the pick gave', async (t) => {
  const run = await runWorkflow(argsOf(t), { lane: lane() })
  ok(run)
  const supervise = verbs(run, 'pick').find((c) => c.lane.role === 'supervisor').lane
  assert.equal(supervise.author, 'claude-haiku-5-5')
})

test('max goes through pick like any other effort', async (t) => {
  const run = await runWorkflow(argsOf(t, [task(1, { tier: 'haiku max — a reason' })]), { lane: lane() })
  ok(run)
  assert.equal(verbs(run, 'pick')[0].lane.effort, 'max')
})

test('C9: the attempt after one that did not approve is picked with its own reference and without the pair that failed', async (t) => {
  const retry = { verdict: 'retry', findings: [{ severity: 'important', title: 'gap', file: 'src/t1/a.js:1', evidence: 'x' }], ruling: 'Retry: gap.', guidance: 'fix', question: '' }
  let reviews = 0
  const run = await runWorkflow(argsOf(t), {
    lane: lane({ 'task-1-1-implement': FLASH }),
    supervisor: () => (++reviews === 1 ? retry : { verdict: 'approve', findings: [], ruling: 'ok', guidance: '', question: '' }),
  })
  ok(run)
  const implementers = verbs(run, 'pick').filter((c) => c.lane.role === 'implementer').map((c) => c.lane)
  assert.equal(implementers.length, 2)
  assert.equal(implementers[0].exclude, undefined)
  assert.deepEqual([implementers[1].call, implementers[1].model, implementers[1].effort, implementers[1].exclude], ['task-1-2-implement', 'haiku', 'xhigh', FLASH.id])
})

test('a start that is not available repeats the pick without that pair, and the call ends native', async (t) => {
  const run = await runWorkflow(argsOf(t), {
    lane: (call, fallback) => {
      if (call.command.verb === 'pick') return decision(call, call.lane.role === 'implementer' && !call.lane.exclude ? FLASH : null)
      if (call.command.verb === 'start' && call.lane.role === 'implementer') return { unavailable: 'quota' }
      return fallback(call)
    },
  })
  ok(run)
  const picks = verbs(run, 'pick').filter((c) => c.lane.role === 'implementer')
  assert.deepEqual(picks.map((c) => c.lane.exclude), [undefined, FLASH.id])
  assert.equal(natives(run, 'implementer').length, 1)
  const took = verbs(run, 'took').find((c) => c.lane.call === 'task-1-1-implement')
  assert.deepEqual([took.lane.by, took.lane.cause], ['native', 'failed'])
})

test('C10: a full harness makes the call wait, one pause per round, and the call starts when there is room', async (t) => {
  const args = argsOf(t, [task(1), task(2)], { ...LANES, cupo: { polls: 40, pollSeconds: 60 } })
  const open = new Set()
  let peak = 0
  const run = await runWorkflow(args, {
    lane: (call, fallback) => {
      const verb = call.command.verb
      if (verb === 'pick') return decision(call, call.lane.role === 'implementer' ? FLASH : null)
      if (verb === 'start') {
        open.add(call.lane.call)
        peak = Math.max(peak, open.size)
      }
      const answer = fallback(call)
      if (verb === 'wait' || verb === 'result') open.delete(call.lane.call)
      return answer
    },
  })
  ok(run)
  assert.equal(peak, 1)
  assert.ok(verbs(run, 'pause').length >= 1)
  assert.ok(verbs(run, 'pause').every((c) => c.command.rest.join(' ') === '--seconds 60'))
  assert.equal(starts(run, 'implementer'), 2)
})

test('C10 and C11: when the wait runs out the call runs native, in the native pair its pick gave, and the run counts it as overflow', async (t) => {
  const args = argsOf(t, [task(1), task(2)], { ...LANES, waits: { implementer: 20, supervisor: 2, reviewer: 2 }, cupo: { polls: 2, pollSeconds: 60 } })
  let waits = 0
  const run = await runWorkflow(args, {
    lane: (call, fallback) => {
      if (call.command.verb === 'pick') {
        const d = decision(call, call.lane.role === 'implementer' ? FLASH : null)
        return call.lane.role === 'implementer' ? { ...d, native: { ...d.native, model: 'sonnet', effort: 'xhigh', id: 'claude/sonnet@xhigh', family: FAMILY.sonnet } } : d
      }
      // the first call stays in flight for many rounds
      if (call.command.verb === 'wait' && call.lane.role === 'implementer' && waits++ < 15) return { done: false }
      return fallback(call)
    },
  })
  ok(run)
  assert.equal(run.result.lanes.overflow, 1)
  const limited = verbs(run, 'took').filter((c) => c.lane.cause === 'wait-limit')
  assert.equal(limited.length, 1)
  assert.equal(limited[0].lane.by, 'native')
  const [overflowed] = natives(run, 'implementer')
  assert.equal(natives(run, 'implementer').length, 1)
  assert.deepEqual([overflowed.model, overflowed.effort], ['sonnet', 'xhigh'])
})

test('C12 and C11: a supervisor whose pair ran and failed runs in the native pair its pick gave, and took says failed', async (t) => {
  const run = await runWorkflow(argsOf(t), {
    lane: (call, fallback) => {
      if (call.command.verb === 'pick') {
        const d = decision(call, call.lane.role === 'supervisor' ? OPUS : null)
        return call.lane.role === 'supervisor' ? { ...d, native: { ...d.native, model: 'opus', effort: 'high', id: 'claude/opus@high', family: FAMILY.opus } } : d
      }
      if (call.command.verb === 'wait' && call.lane.call === 'task-1-1-supervise') return laneAnswer({ status: 'failed', detail: 'exit 1', lane: laneOf(call.started) })
      return fallback(call)
    },
  })
  ok(run)
  const [supervisor] = natives(run, 'supervisor')
  assert.deepEqual([supervisor.model, supervisor.effort], ['opus', 'high'])
  const took = verbs(run, 'took').find((c) => c.lane.call === 'task-1-1-supervise')
  assert.deepEqual([took.lane.by, took.lane.cause], ['native', 'failed'])
})

```

Además esta tarea reescribe, en `tests/ops-command.test.js`, la prueba «every ops prompt of a real workflow run parses to the command the harness read from it», que corre el workflow de verdad y hoy usa `LANES` con la forma vieja (`harness`, `maxParallel`, `calls`) y espera `aether-lane choice` y `aether-lane status`:

```js
const LANES = { superdelegation: true, harnesses: ['agy'], maxParallelByHarness: { agy: 4 }, waits: { implementer: 3, supervisor: 2, reviewer: 2 }, cupo: { polls: 2, pollSeconds: 60 } }
const FLASH = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', model: 'gemini-3.8-flash', family: 'gemini-3.8-flash', effort: 'medium', group: 'gemini', intelligence: 39.8, costPerTaskUsd: 0.93 }
// inside the loop of the test, the `lane` handler answers a pick of an implementer with an external pair, so the workflow also sends start, wait, result and stop:
const lane = (call, fallback) => {
  if (call.command.verb === 'pick' && call.lane.role === 'implementer') {
    const f = call.lane
    const native = { id: `claude/${f.model}@${f.effort}`, model: f.model, effort: f.effort, family: `claude-${f.model}-5-5`, intelligence: 40 }
    return { call: f.call, role: f.role, requested: 40, reference: native, picked: FLASH, native, reason: `took ${FLASH.id}`, candidates: [] }
  }
  // ...the handler of today (the first started call returns a result whose digest does not match) follows unchanged
}
// and the list the test expects of the commands the workflow sent:
assert.deepEqual([...seen].sort(), [
  'aether-lane pick',
  'aether-lane result',
  'aether-lane start',
  'aether-lane stop',
  'aether-lane took',
  'aether-lane wait',
  'aether-wt diff',
  'aether-wt merge',
  'aether-wt remove',
  'aether-wt sweep',
])
```

(`aether-lane pause` no sale aquí: con `maxParallelByHarness.agy` en 4 el cupo no se llena. El resto de la prueba, incluido el lazo `for (const lanes of [null, LANES])`, no cambia.)

Además esta tarea reescribe `tests/workflow-lanes.test.js` a los argumentos y los comandos nuevos (conserva las pruebas de lo que no cambia: las llamadas que fallan en la infraestructura siguen nativas en el mismo intento, el cambio fuera de `Owns`, el bloqueo por `blocked`, la carga y el resumen del prompt, la parada de lo que el script abandona), borra `tests/workflow-order.test.js` (probaba la copia de la regla que se retira) y quita del arnés y de `tests/workflow.test.js` y `tests/workflow-salvage.test.js` lo que mencionaba `status` y `choice`.

**Acceptance:**
- `tests/workflow-superdelegation.test.js` pasa; sin `lanes` ninguna prueba ve un `aether-lane`.
- `run.workflow.js` ya no contiene `groupViews`, `readQuota`, `exclusionOf`, `orderOf`, `laneWalk` ni la salida `effort === 'max'`, y sigue empezando por `export const meta = {`, sin imports, sin `Date` y sin azar (el arnés lo comprueba).
- Todas las órdenes que el workflow envía las acepta la lista cerrada del mod: la prueba «every ops prompt of a real workflow run parses» de `tests/ops-command.test.js` pasa con los argumentos de la corrida nuevos y la lista de órdenes de arriba (`pick`, `took`, `start`, `wait`, `result`, `stop`; ya no `choice` ni `status`).
- La escalera, el bloqueo de la unidad con `the ladder is spent`, la fusión y el resumen siguen como estaban.

### Task 7: El diseño sobre la misma función: los asientos

**Aether:**
- Tier: sonnet xhigh — integración entre `seats.js`, `seat-calls.js` y las pruebas de las rondas, con la revisión cruzada de un Judge y un Examiner nativos
- Review: xhigh — rondas que corren procesos externos en worktrees descartables y escriben documentos del Lead: una ronda mal elegida cambia un documento aprobado
- Area: seats
- Owns: `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js`, `tests/seats.test.js`, `tests/seats-design.test.js`, `tests/seats-harness.test.js`, `tests/seat-calls.test.js`, `tests/exam.test.js`, `tests/lane-refusal.test.js`
- Depends on: Task 3 — usa `harnessViews` y `latestReadings` de `lib/lane-pick.js`
- Serves: R3, R4, R5, R6, R16, R17, R19, R20, R22, R24

**Base: lo que ya trae `seats.js` de `fix/bug-issues` (fusionada, `888cb78`) y se conserva (issue 016).** `offeredByListing(harnessName, model, level, listing)` y el parámetro `offered` de `chooseSeat`: un modelo que el listado capturado del harness (`config/models/harness-models.json`) no ofrece al nivel del esfuerzo del asiento se pasa por alto con la razón `not-offered`, y un harness sin listado no rechaza nada. El `chooseSeat` nuevo excluye un par cuyo modelo no ofrece el listado a su effort, con esa razón en `tried` y en `decision`; `offeredByListing` sigue exportada y `seatCommand` la pasa. Los casos de `tests/seats.test.js` de `offered` y `not-offered` se conservan, adaptados a pares: un par de Argon que el listado no ofrece no se elige aunque su cuota sea la que se renueva antes, y el asiento sin par ofrecido termina en el mismo exit 3 `no-external` con los pares probados y sus razones.

**Interfaces:**

`lib/seats.js`:

```js
const REFERENCE = { judge: { model: 'opus', effort: 'high' }, writer: { model: 'sonnet', effort: 'high' }, examiner: { model: 'opus', effort: 'high' } }
const NATIVE = { judge: { agent: 'aether:judge', ...REFERENCE.judge, id: 'claude-opus-5-5' }, writer: { agent: 'aether:writer', ...REFERENCE.writer, id: 'claude-sonnet-5-5' }, examiner: { agent: 'aether:examiner', ...REFERENCE.examiner, id: 'claude-opus-5-5' } }
chooseSeat({ config, pairs, seat, author = null, harnesses }) // harnesses: the Vista de cuotas
  // -> { external: { harness, model, group, effort, level: effort, timeoutSeconds, quotaBefore, pair }, tried, decision }
  //  | { native: { agent, model, effort, id, family }, tried, decision }
```

`chooseSeat` llama a `choose` con `reference = REFERENCE[seat]`, `authors = author ? [authorModel(author)] : []` y `nativeDiffers = seat !== 'writer'`: el Judge y el Examiner revisan lo que otro hizo, y su agente nativo tampoco puede ser el modelo del autor (C12, R17); el Writer escribe y no revisa. `EXTERNAL_EFFORT`, `SEAT_CHOICES` y toda lectura de `designSeats` y de `seatsChoice` desaparecen; el Examiner ya no tiene estado apagado. `seatCommand` lee el interruptor de `AETHER_SUPERDELEGATION` (`superdelegation.enabled`); apagado, o sin tabla de lanes, no hay candidato: llama a `choose` con `harnesses: {}` y el autor de la ronda, y devuelve exit 3 con el `native` de esa decisión (`unavailable: 'superdelegation-off'` o `'no-table'`), así que un Judge o un Examiner con la superdelegación apagada tampoco cae en el modelo del autor; encendido, obtiene las lecturas con `latestReadings` de `lib/lane-pick.js` (el mismo refresco guardado que usa `pick`), calcula las vistas con `harnessViews`, elige y corre como hoy.

**Muse en un asiento.** Con la regla, el par de Muse puede tomar una ronda del diseño (hasta Opus `high`: el Judge, el Examiner y el Writer). `runRound` lee hoy la cuota del grupo (`adapter.quota()`) antes de analizar la salida (`adapter.parse`), y Muse guarda en `parse` la cuota que la llamada informó (`lanes/quota/muse-observed.json`): la ronda vería la cuota de la llamada anterior. Como `runCall` de `lib/lane-calls.js` desde la 0.13.0, `runRound` analiza la salida primero y lee la cuota después; para los demás harness el orden no cambia nada.

**El agente nativo de toda respuesta sale de la decisión.** El `native` de exit 3 (cualquier causa: `superdelegation-off`, `no-table`, `no-external`, un par que no arranca) y el de exit 4 (la ronda externa falló, violó o dio una respuesta inválida) es `{ agent: NATIVE[seat].agent, ...decision.native }`, con `decision` junto a él; nunca `NATIVE[seat]` sin mirar al autor. La ronda externa corre al `effort` del par. Las entradas `seat` del log suman `reference` y `reason` de la decisión. `lib/seat-calls.js`: las banderas de `seat-start` son `--superdelegation <on|off>` y `--harnesses`, en lugar de `--seats` y `--lanes`, y el ejecutor recibe `AETHER_SUPERDELEGATION` y `AETHER_LANE_HARNESSES`. El mod (`hooks/ops-command.mjs`) y el workflow de diseño los cambia la Task 16.

**Tests (write first):**

En `tests/seats.test.js` (se reescribe la parte de `chooseSeat`; usa `pairs` de `loadPairs()`):

```js
const { chooseSeat, NATIVE } = require('../plugins/aether/lib/seats.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { pairs } = loadPairs()
const open = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: new Date(Date.UTC(2026, 9, 20) + days * 86400000).toISOString() })
const dry = { usable: false, unknown: false, mark: null, resetsAt: '2026-10-21T00:00:00.000Z' }
const world = (g = open(2), c = open(3)) => ({ agy: { installed: true, groups: { gemini: g, claude: c } } })
const config = { harnesses: { agy: { command: 'agy', maxParallel: 4, waitSeconds: 540, timeouts: { implementer: 1, supervisor: 1, reviewer: 1, judge: 1200, writer: 2700, examiner: 1800 }, groups: {}, models: {} } } }
const choose = (seat, more = {}) => chooseSeat({ config, pairs, seat, harnesses: world(), ...more })

test('the Judge asks the points of Opus high and the cheapest pair of the quota that renews first takes it', () => {
  const chosen = choose('judge')
  assert.equal(chosen.decision.requested, 53.6)
  assert.equal(chosen.external.pair.id, 'agy/gemini-4-argon@high')
  assert.deepEqual([chosen.external.harness, chosen.external.model, chosen.external.effort, chosen.external.level, chosen.external.timeoutSeconds], ['agy', 'gemini-4-argon', 'high', 'high', 1200])
})

test('the Writer asks Sonnet high (46.8), and its external effort is the pair effort, never a translated one', () => {
  const chosen = choose('writer', { harnesses: world(dry, open(3)) })
  assert.equal(chosen.decision.requested, 46.8)
  assert.equal(chosen.external.effort, chosen.external.pair.effort)
})

test('with every quota dry the native agent of the seat takes it; the Examiner has no off state', () => {
  for (const seat of ['judge', 'writer', 'examiner']) {
    const chosen = choose(seat, { harnesses: world(dry, dry) })
    assert.equal(chosen.external, undefined)
    assert.equal(chosen.native.agent, NATIVE[seat].agent)
    assert.equal('off' in chosen, false)
  }
})

test('C12: a Judge never takes the model that wrote the document, external or native', () => {
  const external = choose('judge', { author: 'gemini-4-argon' })
  assert.notEqual(external.external.pair.family, 'gemini-4-argon')
  const native = choose('judge', { author: 'opus', harnesses: world(dry, dry) })
  assert.notEqual(native.native.model, 'opus')
  assert.notEqual(choose('examiner', { author: 'opus', harnesses: world(dry, dry) }).native.model, 'opus')
  assert.equal(choose('writer', { author: 'sonnet', harnesses: world(dry, dry) }).native.model, 'sonnet')
})

test('the seat module no longer holds the retired names', () => {
  const seats = require('../plugins/aether/lib/seats.js')
  assert.equal('EXTERNAL_EFFORT' in seats, false)
})
```

En `tests/seats.test.js`, la prueba del interruptor (usa `makeRepo` y `tempDir` de `./helpers.js`):

```js
const { seatCommand } = require('../plugins/aether/lib/seats.js')

test('C2: with superdelegation off the seat command hands the round to the native agent and runs no harness', async (t) => {
  const repo = makeRepo(t)
  const env = { ...process.env, AETHER_SUPERDELEGATION: 'off', AETHER_DATA_DIR: tempDir(t, 'aether-data-') }
  for (const [seat, model] of [['judge', 'opus'], ['writer', 'sonnet'], ['examiner', 'opus']]) {
    const feature = seat === 'judge' ? [] : ['--feature', 'specs/007-demo']
    const { exitCode, value } = await seatCommand([seat, '--session', 's1', ...feature], { input: 'x', env, cwd: repo.dir })
    assert.equal(exitCode, 3, seat)
    assert.equal(value.unavailable, 'superdelegation-off')
    assert.deepEqual([value.native.model, value.native.effort], [model, 'high'])
  }
  for (const seat of ['judge', 'examiner']) {
    const feature = seat === 'judge' ? [] : ['--feature', 'specs/007-demo']
    const { value } = await seatCommand([seat, '--session', 's1', '--author', 'opus', ...feature], { input: 'x', env, cwd: repo.dir })
    assert.notEqual(value.native.model, 'opus', `${seat}, off, does not fall on the author model`)
  }
})

test('E7: when the external round of a Judge fails, the native Judge handed back is not the author model', (t) => {
  const repo = seatRepo(t)
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE, '--author', 'opus'], laneEnv(t), 'FAKE-AGY: exit-error\n')
  assert.equal(r.status, 4, r.stdout + r.stderr)
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.notEqual(r.json.native.model, 'opus')
})
```

En `tests/seats-design.test.js` (usa su `seatRepo`, `seat`, `FEATURE`, `laneEnv`, `lanes`, `fs`, `path`):

```js
test('C16: a Muse round reads the quota after it parses the output, so the allowance of that very round is the quota after it', (t) => {
  const FAKE_MUSE = path.join(__dirname, 'fixtures', 'fake-muse.js')
  fs.chmodSync(FAKE_MUSE, 0o755)
  const repo = seatRepo(t)
  const now = Date.now()
  const record = (type, payload) => JSON.stringify({ schema_version: 1, id: type, stream: { kind: 'session', id: 's1' }, sequence: 1, recorded_at: 1, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
  const answer = JSON.stringify({ verdict: 'approve', findings: [], openQuestions: [] })
  const allowance = { tier: 'power', window: { usedPercent: 72, resetsAtMs: now + 3 * 3600000, windowDurationMins: 300 }, weekly: { usedPercent: 40, resetsAtMs: now + 5 * 86400000 } }
  const stdout = `${[
    record('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text: answer }),
    record('run.usage', { kind: 'run_usage', allowance, calls: 1, completed_calls: 1, failed_calls: 0, cancelled_calls: 0, children_included: false, models: [{ model: 'muse-wonder-full-1.0', calls: 1, input_tokens: 10, output_tokens: 2, cached_tokens: 0, reasoning_tokens: 0 }] }),
  ].join('\n')}\n`
  const env = { ...laneEnv(t, { mutate: (config) => { config.harnesses.muse.command = FAKE_MUSE } }), AETHER_SUPERDELEGATION: 'on', AETHER_LANE_HARNESSES: 'muse', AETHER_FAKE_MUSE_SCRIPT: JSON.stringify({ stdout }) }
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], env, 'Review it.')
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.harness, 'muse')
  const call = lanes.readLog(env.AETHER_DATA_DIR).find((entry) => entry.kind === 'call' && entry.harness === 'muse')
  assert.ok(Math.abs(call.quotaAfter.windows.weekly.remaining - 0.6) < 1e-9, JSON.stringify(call.quotaAfter))
})
```

En `tests/seat-calls.test.js`: las banderas de `seat-start` son `--superdelegation <on|off>` y `--harnesses`; `--seats native` y `--lanes on` se rechazan; el ejecutor de la ronda recibe `AETHER_SUPERDELEGATION` y `AETHER_LANE_HARNESSES`. En `tests/exam.test.js`, `tests/lane-refusal.test.js`, `tests/seats-design.test.js` y `tests/seats-harness.test.js`: las rondas se arrancan con `AETHER_SUPERDELEGATION: 'on'` en lugar de `AETHER_LANES` y `AETHER_SEATS`, y los asientos se eligen con el nuevo `chooseSeat`.

**Acceptance:**
- Una ronda de Muse analiza la salida antes de leer la cuota (la prueba de arriba); para los demás harness nada cambia.
- Sin superdelegación, ninguna ronda de asiento llama a un harness externo; con ella y las cuotas sanas, el Judge, el Writer y el Examiner van al par que `choose` da, y solo la ronda sin candidato corre nativa.
- Un Judge o un Examiner que cae a nativo, por cualquiera de las causas de exit 3 o por un fallo de exit 4, corre en un modelo que no es el del autor.
- `EXTERNAL_EFFORT`, `designSeats`, `seatsChoice` y `seatList` ya no los usa `lib/seats.js` ni `lib/seat-calls.js` (la Task 21 los quita de `lib/lanes.js`).
- `npm test` queda verde completo; el workflow de diseño y la lista cerrada del mod, que cambia la Task 16, no se tocan aquí.

### Task 8: La regla escrita y las guías

**Aether:**
- Tier: sonnet high — prosa técnica en español e inglés que las pruebas de hechos sostienen contra el árbol
- Review: high — las pruebas de documentos fijan los hechos comprobables; lo demás es redacción
- Area: docs
- Owns: `docs/guide/lanes.md`, `docs/guide/design-seats.md`, `docs/guide/options.md`, `docs/guide/router.md`, `tests/lanes-docs.test.js`, `tests/router-docs.test.js`
- Depends on: Task 14 — la tabla de opciones y el manifiesto ya tienen su forma final
- Serves: R19, R21, R25

**Interfaces:**

- `docs/guide/lanes.md` es la regla de superdelegación, escrita una vez: el interruptor y su migración (`lanes` encendido cuenta como encendido, `seats` se ignora); qué pide cada llamada (los puntos de inteligencia de Artificial Analysis de su par de Claude: modelo y effort); quién es candidato (el 1 punto); el orden (la cuota cuya ventana semanal se renueva antes, y dentro de ella el menor costo por tarea; Grok no recibe una llamada que no alcanza); que la velocidad no decide; el fallback nativo sin preguntar al dueño; la revisión cruzada; el cupo de llamadas a la vez y la espera de 10 minutos; el reintento; qué dice el informe; cómo se mide el cupo (`scripts/lane-cupo.js`). La tabla de pares se cita como `plugins/aether/config/pairs.json`. El ancla `#lanes` que enlazan otras páginas se conserva (no se renombra), porque las páginas de la Task 17 la enlazan.
- `docs/guide/options.md` (sin la tabla de opciones, que ya es de la Task 14), `docs/guide/design-seats.md` y `docs/guide/router.md` dicen lo mismo: un interruptor, `superdelegation`, apagado por defecto; ya no hay `native`, `balanced` ni `robust`. `docs/guide/design-seats.md` describe los tres asientos y su par de referencia, y remite a `lanes.md` para la regla en lugar de repetirla.
- No se crea una página nueva, y la lista de páginas de `tests/docs-facts.test.js` no cambia.
- **Muse en la regla escrita.** `docs/guide/lanes.md` conserva su sección `## Muse` (la última de la página, con `muse exec --json`, `contributor`, `sandbox`, `META_API_KEY`, `authRequired`, `environmentError`, `native` y `lane-smoke`, que `tests/muse-docs.test.js` pide), las listas `agy, codex, grok, cursor, muse` y `Codex, Grok, Cursor and Muse` (`tests/lanes-docs.test.js`) y la lista de Muse con otros dos harness en esta página, en `docs/guide/ops.md`, en `docs/guide/troubleshooting.md` y en `docs/getting-started.md`. Se ajusta a la regla lo que esa sección dice de lo que desaparece: la llamada lleva `--reasoning-effort` con el effort del par, no con «un nivel de la tabla»; el modelo entra por la decisión del dueño como el par `muse/muse-wonder-full-1.0@high` con los 53.6 de Opus `high` y sin costo por tarea (va último en su cuota, y toma llamadas hasta Opus `high`, no las de Opus `xhigh`); ya no dice que el `xhigh` de Aether corre en el `high` de Muse; sigue diciendo que el 55.8 de Artificial Analysis es de `max`, que la CLI no toma, y que la entrada de la tabla lleva las palabras del dueño en `ownerDecision`. `tests/muse-docs.test.js` y `tests/muse-docs-overview.test.js` pasan sin cambios.
- `docs/guide/lanes.md` y `docs/guide/options.md` son las únicas páginas que pueden nombrar `lanes` y `seats` como claves heredadas (la migración).
- Ninguna de estas páginas dice ya que un modelo externo «reemplaza» a uno de Claude por una clave `replaces` de la tabla (la clave se va, Task 21): `docs/guide/lanes.md` (la lista de claves de «Adding a harness», que pasa a `group`, `roles` y `aa`; «Who takes a call»; y en la sección `## Muse`, «It replaces Opus … by the owner's decision», que pasa a decir que su par se puntúa como Opus `high` por decisión del dueño), `docs/guide/router.md` (las frases del eje de `replaces`, que pasan a hablar de los puntos de inteligencia del par) y `docs/guide/design-seats.md`.

**Tests (write first):**

En `tests/lanes-docs.test.js` y `tests/router-docs.test.js` (con su `fs` y su `path`, o los que ya importen):

```js
test('R21: lanes.md holds the rule: the switch, the points, the tolerance, the order, the cupo wait and the report', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', 'lanes.md'), 'utf8')
  for (const fragment of ['`superdelegation`', 'off by default', 'plugins/aether/config/pairs.json', '1 point', 'weekly', 'cost per task', '10 minutes', 'aether-report']) assert.ok(text.includes(fragment), `lanes.md says ${fragment}`)
})

test('R21: the guide pages of this task name neither the retired profiles nor the retired variables', () => {
  for (const page of ['lanes', 'design-seats', 'options', 'router']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', `${page}.md`), 'utf8')
    // The same patterns as Task 18's GONE; lanes.md and options.md alone may name `seats` (the migration says it is ignored).
    const gone = [/`balanced`/, /`robust`/, /\bseats option\b/, /--seats\b/, /AETHER_SEATS/, /AETHER_LANES\b/]
    if (!['lanes', 'options'].includes(page)) gone.push(/`seats`/)
    for (const pattern of gone) assert.doesNotMatch(text, pattern, `${page}.md still says ${pattern}`)
  }
})
```

`tests/router-docs.test.js` y `tests/lanes-docs.test.js`: sus aserciones sobre `lanes` y los perfiles pasan a `superdelegation`.

**Acceptance:**
- `tests/lanes-docs.test.js`, `tests/router-docs.test.js` y `tests/docs-facts.test.js` pasan con el texto nuevo: los enlaces y anclas de estas páginas resuelven, cada `` `aether-<nombre>` `` es un archivo de `bin/`.
- La regla está escrita en un solo documento y las demás páginas de la guía remiten a él en lugar de repetirla.
- Ningún archivo fuera de `Owns` cambia; no se sube la versión ni se toca el changelog.

### Task 9: El retiro del comando choice

**Aether:**
- Tier: sonnet high — borrar un comando del bin, de la lista cerrada del mod y de sus pruebas sin dejar rota ninguna otra
- Review: high — la lista cerrada del mod decide qué órdenes corre sin modelo: una forma que sobra o que falta cambia lo que el workflow puede enviar
- Area: lane-commands
- Owns: `plugins/aether/lib/lane-choice.js`, `plugins/aether/bin/aether-lane`, `plugins/aether/hooks/ops-command.mjs`, `tests/lane-choice.test.js`, `tests/ops-command-lanes.test.js`, `tests/lane-status.test.js`
- Depends on: Task 6 — el workflow del swarm ya no envía `choice`
- Depends on: Task 16 — edita la misma lista cerrada del mod, después de ella, y el diseño ya no envía `--seats` ni `--lanes`
- Serves: R20

**Base: lo que ya trae `ops-command.mjs` de `fix/bug-issues` (fusionada, `888cb78`) y se conserva.** La forma `cd '<repo>' && PATH='<bin>':"$PATH" aether-…` que `COMMAND_LINE` acepta (issue 008) y la forma `aether-wt status <run> <task>` (002). Solo se retira la forma de `choice`; sus pruebas en `tests/ops-command.test.js` y `tests/ops-command-lanes.test.js` quedan verdes.

**Interfaces:**

- `lib/lane-choice.js` se borra, con el comando `choice` de `bin/aether-lane` (su uso y su cabecera) y su forma y sus fichas en `hooks/ops-command.mjs`; los tests de `choice` se borran con él. En la cabecera de `bin/aether-lane`, la línea de `seat-start` pasa de `--seats <native|balanced|robust> --lanes <on|off> --harnesses <h1,h2> --digest <digest>` a `--superdelegation <on|off> --harnesses <h1,h2> --digest <digest>`.
- `tests/ops-command-lanes.test.js` pierde las formas de `choice` y conserva las de `pick`, `took` y `pause`; `tests/lane-status.test.js` pierde la prueba del comando `choice` y gana la de abajo (lo de `order` de ese archivo lo quita la Task 19).

**Tests (write first):**

```js
// tests/lane-status.test.js, replaces 'choice logs the choice in the lane log through the bin, and refuses a bad one'
test('choice is no longer a command: the bin refuses it and logs nothing', (t) => {
  const { args, env } = statusEnv(t)
  const r = runBin(fx.LANE_BIN, ['choice', args.runId, 'task-1-1-implement', '--role', 'implementer', '--tier', 'haiku', '--effort', 'xhigh', '--pick', 'native', '--order', 'a:b:1:picked'], args.repoRoot, env)
  assert.equal(r.status, 1)
  assert.equal(lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'choice').length, 0)
})
```

**Acceptance:**
- `aether-lane choice` ya no existe: `lib/lane-choice.js` no está, y ni `bin/aether-lane` ni `hooks/ops-command.mjs` lo nombran.
- Los comandos `pick`, `took`, `pause`, `status`, `start`, `wait`, `result`, `stop` y los de los asientos siguen como estaban; la cabecera de `bin/aether-lane` ya no nombra `--seats` ni `--lanes`.
- `npm test` queda verde completo.

### Task 10: Las skills del Lead

**Aether:**
- Tier: haiku high — texto de skills que las pruebas de arranque fijan por frases
- Review: high — el Lead lee estas skills para lanzar el diseño y el swarm, y un argumento mal escrito rompe el lanzamiento
- Area: skills
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/autonomous-runs/SKILL.md`, `tests/bootstrap-design.test.js`, `tests/agents-design.test.js`, `tests/templates-design.test.js`, `tests/autonomous-runs-skill.test.js`, `tests/roles.test.js`
- Depends on: Task 6 — describe el resultado `lanes` del swarm sin `dry`
- Depends on: Task 16 — describe los argumentos del diseño
- Serves: R3, R5, R21

**Interfaces:**

- `using-aether/SKILL.md`: el Lead lanza `/aether:design` leyendo `echo "$CLAUDE_CODE_SESSION_ID $AETHER_SUPERDELEGATION $AETHER_LANE_HARNESSES"` y escribiendo `{"feature": "specs/NNN-<topic>", "session": "<CLAUDE_CODE_SESSION_ID>", "repoRoot": "<the checkout>", "superdelegation": "<AETHER_SUPERDELEGATION>", "harnesses": "<AETHER_LANE_HARNESSES>"}`; no nombra `AETHER_SEATS` ni `AETHER_LANES`. Dice, en una frase, qué hace la superdelegación y que el dueño la enciende con la opción `superdelegation`.
- `swarm/SKILL.md`: el resultado `lanes` es `{ calls, ok, failed, quota, violation, blocked, unavailable, overflow }` y se explica `overflow` como las llamadas que agotaron la espera de cupo; ya no dice `dry`.
- `autonomous-runs/SKILL.md`: donde mencione `lanes` o `seats` como opciones, nombra `superdelegation`.
- `swarm/SKILL.md`, el párrafo `- **Lanes.**` (que la 0.13.0 amplió con Muse): pasa a hablar de la opción `superdelegation` y de la regla, conserva la lista `agy, codex, grok, cursor and muse` y la frase de que un fallo de Muse corre nativo sin preguntar al dueño (`tests/muse-skills.test.js`), y las frases que `tests/lanes-docs.test.js` busca en la skill (`each call to the candidate whose quota is most at risk of being lost first`, `` `aether-lane status <runId>` ``, `its `balance``, `what every call chose (`run.choices`)`, `Lanes (grok)`). El texto exacto es este, y es el que `tests/roles.test.js` fija, carácter por carácter, en lugar del párrafo de hoy:

  ```
  - **Lanes.** When the owner turned on the plugin's `superdelegation` option, on Linux, the run sends every call that is not the Lead's to the external harnesses that the `harnesses` option enables (agy, codex, grok, cursor and muse; agy is the default), when the harness's CLI is installed and while its quota lasts. A call asks for the intelligence points of the Claude pair (model and effort) the plan gives it and takes a pair that reaches them minus 1 point, each call to the candidate whose quota is most at risk of being lost first and, inside that quota, the cheapest per task (`docs/guide/lanes.md` has the rule). Muse is a lane like the others: its pair, `muse-wonder-full-1.0` at `high`, is there by the owner's decision, and any failure of a Muse call runs on the native agent without asking the owner. `${CLAUDE_PLUGIN_ROOT}/config/pairs.json` lists the pairs and `${CLAUDE_PLUGIN_ROOT}/config/lanes.json` each harness's models. These CLIs run without permission prompts (agy with `--dangerously-skip-permissions`) in the unit's transactional worktree, with the owner's git, GitHub, registry and cloud credentials kept out of their environment. Otherwise every call is native, and `aether-plan compile` says why on stderr; it also names each enabled harness that takes no call, and why. `aether-plan compile <plan.md> --no-lanes` runs everything native. `aether-lane quota` shows the readings, and `aether-lane status <runId>` the quota of each group and the dry marks. A call whose chosen pair is unavailable asks again without that pair; the native agent takes it only when no pair is left.
  ```
- `using-aether/SKILL.md` conserva la lista de la línea de «Other CLIs» (`agy, codex, grok, cursor, muse`) y `You start on Sonnet at `xhigh``.

**Tests (write first):**

```js
// tests/bootstrap-design.test.js
test('the bootstrap launches /aether:design with superdelegation and the harness list, and never with seats or lanes', () => {
  assert.ok(BOOTSTRAP.includes('$AETHER_SUPERDELEGATION $AETHER_LANE_HARNESSES'))
  assert.ok(BOOTSTRAP.includes('"superdelegation": "<AETHER_SUPERDELEGATION>"'))
  for (const gone of ['AETHER_SEATS', 'AETHER_LANES', '"seats"', '"lanes"', 'balanced', 'robust']) assert.ok(!BOOTSTRAP.includes(gone), `gone: ${gone}`)
})

// tests/autonomous-runs-skill.test.js
test('the swarm skill reads the lanes counts without dry groups', () => {
  const swarm = fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')
  assert.ok(swarm.includes('`overflow`'))
  assert.ok(!/each wave's `dry` groups/.test(swarm))
})
```

**Acceptance:**
- Las pruebas de arranque y de skills pasan; el bootstrap sigue pasando las pruebas que ya lo sostienen (nombres, tamaño, secciones) sin otro cambio que el de arriba.
- Ninguna skill menciona `AETHER_SEATS`, `AETHER_LANES`, `balanced` ni `robust`.
- `tests/muse-skills.test.js`, `tests/lanes-docs.test.js` y `tests/roles.test.js` pasan (esta última con el párrafo de arriba).

### Task 11: Las pruebas de escenario sin cuota y la búsqueda de lo que desaparece

**Aether:**
- Tier: sonnet high — pruebas que cruzan la tabla real, el workflow y el arnés, escritas contra comportamientos ya fijados
- Review: high — son pruebas de aceptación: lo que importa es que prueben lo que dicen
- Area: scenarios
- Owns: `tests/superdelegation-scenarios.test.js`, `tests/superdelegation-gone.test.js`
- Depends on: Task 1 — usa `choose` y la tabla real de pares
- Depends on: Task 6 — corre el workflow del swarm en el arnés
- Depends on: Task 16 — corre el workflow de diseño en el arnés
- Depends on: Task 21 — la búsqueda exige que la tabla de lanes y `lib/lanes.js` ya no tengan lo viejo
- Depends on: Task 22 — la búsqueda exige que `lib/lane-order.js` ya no tenga `candidatesOf` ni `orderCandidates`
- Depends on: Task 10 — la búsqueda mira también las skills del plugin
- Depends on: Task 20 — la búsqueda exige que el índice de modelos y `scripts/build-models-index.js` ya no escriban `replaces`
- Serves: R20, R22

**Interfaces:**

Dos archivos de prueba nuevos y ningún código de producto.

**Tests (write first):**

`tests/superdelegation-scenarios.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const { pairs } = loadPairs()
const WEEK = 7 * 24 * 3600 * 1000
const group = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: new Date(Date.UTC(2026, 9, 20) + days * 24 * 3600 * 1000).toISOString() })
const dry = { usable: false, unknown: false, mark: null, resetsAt: '2026-10-21T00:00:00.000Z' }
const healthy = { agy: { installed: true, groups: { gemini: group(2), claude: group(3) } }, grok: { installed: true, groups: { grok: group(1) } } }
const sick = { agy: { installed: true, groups: { gemini: dry, claude: dry } }, grok: { installed: true, groups: { grok: dry } } }
const oneDry = { ...healthy, grok: { installed: true, groups: { grok: dry } }, agy: { installed: true, groups: { gemini: dry, claude: group(3) } } }
const ask = (harnesses, model = 'sonnet', effort = 'high') => choose({ pairs, reference: { model, effort }, harnesses })

test('C15, no quota spent: with every quota healthy the Sonnet-level work leaves native Claude', () => {
  for (const [model, effort] of [['sonnet', 'high'], ['sonnet', 'xhigh'], ['opus', 'high']]) {
    const d = ask(healthy, model, effort)
    assert.ok(d.picked, `${model} ${effort}`)
    assert.notEqual(d.picked.harness, 'claude')
  }
})

test('C15, no quota spent: with every eligible quota dry the work falls to native, in its reference pair', () => {
  for (const [model, effort] of [['haiku', 'high'], ['sonnet', 'high'], ['sonnet', 'xhigh'], ['opus', 'high']]) {
    const d = ask(sick, model, effort)
    assert.equal(d.picked, null)
    assert.equal(d.native.id, `claude/${model}@${effort}`)
  }
})

test('C15, no quota spent: with one quota dry and another healthy the call goes to the healthy one', () => {
  const d = ask(oneDry, 'sonnet', 'xhigh')
  assert.equal(d.picked.group, 'claude')
})

test('C16, no quota spent: with only Muse healthy an Opus high call goes to Muse by the owner decision, and an Opus xhigh call falls to native', () => {
  const onlyMuse = { muse: { installed: true, groups: { muse: group(2) } } }
  assert.equal(ask(onlyMuse, 'opus', 'high').picked.id, 'muse/muse-wonder-full-1.0@high')
  const d = ask(onlyMuse, 'opus', 'xhigh')
  assert.equal(d.picked, null)
  assert.equal(d.native.id, 'claude/opus@xhigh')
})

test('C15 through the swarm: a unit runs on the pair pick gives when quotas are healthy, and native when they are dry', async (t) => {
  const lanes = { superdelegation: true, harnesses: ['agy'], maxParallelByHarness: { agy: 2 }, waits: { implementer: 3, supervisor: 2, reviewer: 2 }, cupo: { polls: 2, pollSeconds: 60 } }
  const args = { ...compile(makeRepo(t), plan([task(1, { tier: 'sonnet high — a reason' })])), lanes }
  const withViews = (views) => async (call, fallback) => {
    if (call.command.verb !== 'pick') return fallback(call)
    const f = call.lane
    const d = choose({ pairs, reference: { model: f.model, effort: f.effort }, harnesses: views, authors: f.author ? [f.author] : [], nativeDiffers: f.role !== 'implementer' })
    return { call: f.call, role: f.role, ...d }
  }
  const external = await runWorkflow(args, { lane: withViews(healthy) })
  assert.equal(external.error, null)
  assert.ok(external.calls.some((c) => c.kind === 'ops:lane-start'))
  assert.equal(external.calls.filter((c) => c.role === 'implementer').length, 0)
  const native = await runWorkflow(args, { lane: withViews(sick) })
  assert.equal(native.error, null)
  assert.equal(native.calls.some((c) => c.kind === 'ops:lane-start'), false)
  assert.ok(native.calls.some((c) => c.role === 'implementer'))
})
```

`tests/superdelegation-gone.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const FILES = (dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !e.parentPath.includes('node_modules')).map((e) => path.join(e.parentPath, e.name))
const SOURCE = [...FILES('plugins/aether'), ...FILES('scripts')].filter((file) => /\.(js|mjs|jsx|json|md)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file) && !file.includes(`${path.sep}.claude-plugin${path.sep}types`))
const text = new Map(SOURCE.map((file) => [file, fs.readFileSync(file, 'utf8')]))
const found = (pattern) => [...text].filter(([, body]) => pattern.test(body)).map(([file]) => path.relative(ROOT, file))

// R20: what the plan lists as gone (plan.md, D14), by name.
const GONE = [
  [/\bEXTERNAL_EFFORT\b/, 'the hand-written effort of an external round'],
  [/\bdesignSeats\b/, 'the seat profiles of the lane table'],
  [/\bSEAT_CHOICES\b|\bDEFAULT_SEATS\b|\bseatsChoice\b|\bseatList\b|\bvalidateSeats\b/, 'the seat profiles in code'],
  [/\bAETHER_SEATS\b|--seats\b/, 'the seats variable and flag'],
  [/\bAETHER_LANES\b(?!_CONFIG)/, 'the old lanes variable'],
  [/\bnativeRevision\b|with no seat round/, 'the native correction by rule'],
  [/\bgroupViews\b|\breadQuota\b|\bexclusionOf\b|\bdryInRun\b|\bunavailableOutcome\b/, 'the second quota rule of the swarm'],
  [/\blaneWalk\b|effort === 'max'\) return null|!lanes \|\| effort === 'max'/, 'the fixed rule for max'],
  [/\blanesEnabled\b|\blanesArgs\b|\blaneFor\b|\borderCandidates\b|\bcandidatesOf\b/, 'the old lane arguments and order'],
  [/aether-lane choice\b/, 'the choice command'],
]

for (const [pattern, what] of GONE) {
  test(`R20: ${what} is gone from the plugin and the scripts`, () => {
    assert.deepEqual(found(pattern), [], `${pattern} is still in these files`)
  })
}

test('R20: no file of the plugin config, lib or workflows, nor of scripts, names the replaces field of the lane table', () => {
  const field = /"replaces"\s*:|\.replaces\b|\breplaces\s*:/
  const scope = /^(plugins\/aether\/(config|lib|workflows)|scripts)\//
  assert.deepEqual(found(field).filter((file) => scope.test(file)), [], 'the replaces field is still in these files')
})

test('R20: the lane table has no hand-written level map', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/config/lanes.json'), 'utf8'))
  for (const harness of Object.values(config.harnesses)) for (const model of Object.values(harness.models)) for (const gone of ['levels', 'replaces']) assert.equal(Object.hasOwn(model, gone), false, gone)
  assert.equal(Object.hasOwn(config, 'designSeats'), false)
})

test('R19: the swarm and the design both reach the one choice function, and neither has a rule of its own', () => {
  const lanePick = text.get(path.join(ROOT, 'plugins/aether/lib/lane-pick.js'))
  const seats = text.get(path.join(ROOT, 'plugins/aether/lib/seats.js'))
  assert.match(lanePick, /require\('\.\/superdelegation\.js'\)/)
  assert.match(seats, /require\('\.\/superdelegation\.js'\)/)
  const callers = found(/\bchoose\(/).filter((file) => file.startsWith('plugins/'))
  assert.deepEqual(callers.sort(), ['plugins/aether/lib/lane-pick.js', 'plugins/aether/lib/seats.js', 'plugins/aether/lib/superdelegation.js'])
})
```

**Acceptance:**
- Las dos pruebas pasan: la de escenarios no gasta cuota ni tokens (todo con tablas fijas y agentes simulados), y la de búsqueda no halla ninguno de los nombres que el plan (D14) dice que desaparecen.
- Si la búsqueda halla un nombre, la tarea lo dice con el archivo y se detiene: no edita un archivo que no es suyo.
### Task 12: El ajuste `lanes` del router sobre el mismo interruptor

**Aether:**
- Tier: haiku high — un cambio de una línea en `lib/session.js` que una tabla de valores fija
- Review: high — es la misma migración de valores del dueño que lee el arranque de la sesión
- Area: options
- Owns: `plugins/aether/lib/session.js`, `tests/session.test.js`, `tests/router-settings.test.js`
- Depends on: Task 1 — usa `resolveOption` de `lib/superdelegation.js`
- Serves: R1, R2

**Interfaces:**

`lib/session.js`: la opción `lanes` de los ajustes del router (`routerSettingsFrom`) es `resolveOption(env).on` (con `require('./superdelegation.js')`, que no importa `lib/lanes.js`); el resto de los ajustes no cambia. Así Aether tiene un solo criterio para «encendido». `tests/session.test.js` solo cambia si una aserción suya fijaba `lanes` por `CLAUDE_PLUGIN_OPTION_LANES` a solas.

**Tests (write first):**

En `tests/router-settings.test.js` (con su `session`):

```js
test('routerSettingsFrom takes lanes from the one superdelegation switch', () => {
  const lanes = (env) => session.routerSettingsFrom(env).lanes
  assert.equal(lanes({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }), true)
  assert.equal(lanes({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', CLAUDE_PLUGIN_OPTION_LANES: 'true' }), false)
  assert.equal(lanes({ CLAUDE_PLUGIN_OPTION_LANES: 'true' }), true)
  assert.equal(lanes({ CLAUDE_PLUGIN_OPTION_LANES: 'yes' }), false)
  assert.equal(lanes({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: '', CLAUDE_PLUGIN_OPTION_LANES: 'true' }), true)
  assert.equal(lanes({}), false)
})
```

**Acceptance:**
- La prueba nueva pasa y las demás de `tests/router-settings.test.js` y `tests/session.test.js` pasan sin cambiar.
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 13: El panel

**Aether:**
- Tier: sonnet high — dos copias del mod que tienen que coincidir con la lógica de `lib/` y que una prueba de conformidad sostiene
- Review: xhigh — el panel muestra al dueño si la superdelegación está encendida: una copia que difiere de `lib/session.js` le dice lo contrario de lo que hace Aether
- Area: panel
- Owns: `plugins/aether/hooks/panel-view.mjs`, `plugins/aether/hooks/panel-layout.mjs`, `plugins/aether/hooks/panel.test.tsx`, `tests/panel-conformance.test.js`, `tests/panel-view.test.js`, `tests/panel-layout.test.js`
- Depends on: Task 12 — la prueba de conformidad compara la copia del mod con `routerSettingsFrom` de `lib/session.js`
- Serves: R1, R3

**Interfaces:**

`hooks/panel-view.mjs` y `hooks/panel-layout.mjs` (el mod no puede importar `lib/`; la copia debe coincidir con `resolveOption` de `lib/superdelegation.js`, y `tests/panel-conformance.test.js` la sostiene): `settingsOf` lee `superdelegation` y `lanes` de las opciones del mod y da `lanes` booleano con la misma regla que `routerSettingsFrom` (`superdelegation` puesta, `true` o `false`, manda; si no, `lanes` `true` es encendido; lo demás, apagado); el ajuste `seats` y `SEAT_CHOICES` desaparecen; la parte de la cabecera dice `superdelegation ON` (ok) o `superdelegation OFF` (warn) donde decía `lanes ON/OFF`, y el aviso de apagado nombra la superdelegación. `hooks/panel.jsx` no cambia.

**Tests (write first):**

`tests/panel-conformance.test.js`: ya no compara `seats` con el manifiesto ni con `lanes.seatsChoice` (se quitan las pruebas y las aserciones de los asientos del panel, y el campo `seats` de la prueba del producto de las tablas); lo que compara del manifiesto (router, decider) no cambia. La prueba del interruptor pasa a:

```js
const SUPERDELEGATION = [true, false, 'true', 'false', '', undefined]

test('the switch the panel shows is the one the router settings hold, for every pair of superdelegation and lanes', () => {
  for (const sd of SUPERDELEGATION) {
    for (const old of LANES) {
      const used = session.routerSettingsFrom({ ...env('CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', sd), ...env('CLAUDE_PLUGIN_OPTION_LANES', old) })
      assert.equal(view.settingsOf({ superdelegation: sd, lanes: old }).lanes, used.lanes, `superdelegation ${JSON.stringify(sd)}, lanes ${JSON.stringify(old)}`)
    }
  }
})
```

`tests/panel-view.test.js`, `tests/panel-layout.test.js` y `hooks/panel.test.tsx`: los ajustes ya no traen `seats`; la parte de cabecera es `superdelegation ON`/`superdelegation OFF`; el ajuste sale encendido con `superdelegation` `true`, o con `lanes` `true` y `superdelegation` no puesta, y apagado en lo demás.

**Acceptance:**
- `tests/panel-conformance.test.js`, `tests/panel-view.test.js` y `tests/panel-layout.test.js` pasan; `npm run test:mod` pasa con `hooks/panel.test.tsx` cambiado (la tarea lo corre).
- El panel no nombra `seats`, `SEAT_CHOICES`, `balanced` ni `robust`; sigue nombrando a Muse (`HARNESS_NAMES`, `READ_TIMEOUT_MS`), y las pruebas que la 0.13.0 le añadió (Muse dibujado como agy, `muse` en la tabla de harness de la prueba de conformidad) pasan sin más cambio que el texto de la cabecera.
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 14: El manifiesto y la tabla de opciones

**Aether:**
- Tier: sonnet high — un manifiesto cuyas claves y textos fijan varias pruebas, y una tabla de la guía que otra prueba compara con él
- Review: xhigh — el manifiesto decide qué valores guardados del dueño llegan a la sesión: una clave mal puesta deja sin leer su `lanes` o su `seats`
- Area: options
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `tests/manifest.test.js`, `tests/launcher.test.js`, `docs/guide/options.md`, `tests/docs-facts.test.js`
- Depends on: Task 13 — la prueba de conformidad del panel ya no compara `seats` con el manifiesto
- Serves: R1, R3, R21

**Interfaces:**

`plugin.json` `userConfig`:
- `superdelegation`: `{ "type": "boolean", "title": "Superdelegation", "description": "Send everything that is not the Lead to other harnesses (agy, grok, ...) while their quota lasts; native Claude is the fallback. Off by default: the external CLIs run without permission prompts and spend other plans' quota. Linux only. Replaces the lanes and seats options." }`, sin `default`.
- `lanes`: título `Lanes (legacy)`, descripción `Replaced by superdelegation. Read only when superdelegation is not set: on counts as superdelegation on.`, `default: false`.
- `seats`: título `Design seats (legacy)`, tipo `string`, descripción `Ignored. The design seats follow superdelegation now; native, balanced and robust no longer exist.`, sin `options` y sin `default`.
- `harnesses`, `ops`, `router`, `decider`, `fallback` y `deadlines` no cambian, salvo la descripción de `harnesses`, que pasa a (conserva la lista de cinco con `muse`, y quita la frase del orden de la opción, que la regla ya no usa): `The external harnesses superdelegation may use, comma-separated: agy, codex, grok, cursor, muse. The quota decides the order of the candidates, then the cost per task. Default: agy. Each one runs its CLI without permission prompts in Aether's transactional worktree, with your git, GitHub, package-registry and cloud credentials kept out of its environment. Turn one on only once you accept that risk.` `tests/manifest.test.js` fija esa cadena entera en lugar de la de hoy, y `docs/guide/options.md` conserva la lista `agy, codex, grok, cursor, muse` donde la nombra.
- La `description` del plugin cambia las dos frases de las lanes y de la opción `seats` por una: `With superdelegation on, everything that is not the Lead runs first on the quota of other harnesses, such as agy or grok, and native Claude is the fallback.` `tests/launcher.test.js` (líneas 140 y 141) pasa a comprobar `/With superdelegation on, everything that is not the Lead runs first on the quota of other harnesses/` y `/native Claude is the fallback/` en lugar de las dos frases viejas.

`docs/guide/options.md` y `tests/docs-facts.test.js`: la tabla de opciones gana la fila de `superdelegation` (por defecto `off`) y pierde las filas `lanes` y `seats`; el texto que cuenta «eight options» pasa a la cuenta real; la prueba R11 compara la tabla con las opciones del manifiesto cuyo título no termina en `(legacy)`, y toma una opción booleana sin `default` como `off`. Los demás textos de la guía los reescribe la Task 8.

**Tests (write first):**

`tests/manifest.test.js` (se reescribe la parte de `userConfig`):

```js
test('superdelegation is a boolean with no default, and lanes and seats stay only as legacy keys', () => {
  const { userConfig } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  assert.equal(userConfig.superdelegation.type, 'boolean')
  assert.equal(userConfig.superdelegation.title, 'Superdelegation')
  assert.equal('default' in userConfig.superdelegation, false)
  assert.match(userConfig.superdelegation.description, /^Send everything that is not the Lead to other harnesses/)
  assert.match(userConfig.superdelegation.description, /Off by default/)
  assert.equal(userConfig.lanes.title, 'Lanes (legacy)')
  assert.equal(userConfig.lanes.default, false)
  assert.equal(userConfig.seats.title, 'Design seats (legacy)')
  assert.equal(userConfig.seats.type, 'string')
  assert.equal('options' in userConfig.seats, false)
  assert.equal('default' in userConfig.seats, false)
  assert.deepEqual(Object.keys(userConfig).sort(), ['deadlines', 'decider', 'fallback', 'harnesses', 'lanes', 'ops', 'router', 'seats', 'superdelegation'])
})
```

`tests/launcher.test.js` y `tests/docs-facts.test.js`: lo dicho arriba (las frases de la descripción del plugin y la prueba R11 de la tabla de opciones).

**Acceptance:**
- `lanes`, `seats` y los perfiles no figuran como opciones elegibles: ni en la tabla de `docs/guide/options.md`, ni con selector en el manifiesto.
- `npm run validate` pasa con el manifiesto nuevo (la tarea lo corre; si Claude Code rechaza un booleano sin `default`, se detiene y lo dice).
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 15: aether-plan compile y los argumentos de la corrida

**Aether:**
- Tier: sonnet high — un bin que cambia de fuente (`runArgs` en lugar de `lanesArgs`), con avisos exactos que las pruebas fijan
- Review: xhigh — los argumentos de la corrida deciden si el swarm sale a otros harness: un caso mal leído manda un plan nativo al exterior o uno externo a Claude sin avisar
- Area: plan-cli
- Owns: `plugins/aether/bin/aether-plan`, `tests/aether-plan.test.js`
- Depends on: Task 1 — usa `enabled`, `runArgs` e `idleHarnesses` de `lib/superdelegation.js` y `loadPairs`
- Serves: R4, R5, R15

**Interfaces:**

`bin/aether-plan compile`: usa `enabled()` de `lib/superdelegation.js` en lugar de `lanes.lanesEnabled()`, y `runArgs(config, pairs, { installed })` e `idleHarnesses` con `loadPairs()` en lugar de `lanes.lanesArgs`/`lanes.idleHarnesses`; `--no-lanes` se queda. Los avisos de la salida de error: `aether-plan: superdelegation is off: superdelegation needs Linux\n`, `aether-plan: superdelegation is off: the aether plugin's superdelegation option is not on\n` y, por harness ocioso, `aether-plan: superdelegation: <name> is enabled but <razón>\n`. El resultado de `compile` lleva `lanes` con la forma de los argumentos de la corrida, y el `graph.json` lo guarda igual.

**Tests (write first):**

`tests/aether-plan.test.js` (reemplaza las pruebas de `lanesArgs`; usa su `laneTable`, `executable`, `onPath`, `runBin`, `PLAN_BIN`, `loadConfig`, `writePlan`, `plan`, `task`):

```js
const { runArgs } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

test('compile gives the run its lanes when superdelegation is on and the harness is there, and none with --no-lanes', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  const on = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(on.status, 0, on.stdout + on.stderr)
  assert.deepEqual(on.json.lanes, runArgs(loadConfig(file), loadPairs().pairs, { installed: () => true, enabled: ['agy'] }))
  assert.deepEqual(Object.keys(on.json.lanes), ['superdelegation', 'harnesses', 'maxParallelByHarness', 'waits', 'cupo'])
  assert.deepEqual(on.json.lanes.cupo, { polls: 10, pollSeconds: 60 })
  assert.equal(Object.keys(on.json).pop(), 'lanes')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(on.json.runDir, 'graph.json'), 'utf8')).lanes, on.json.lanes)
  const off = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(off.status, 0, off.stdout + off.stderr)
  assert.equal(off.json.lanes, null)
})

test('compile names each enabled harness that gives no call, and why, on stderr', (t) => {
  // the setup of the test it replaces: stubs for codex and grok, a PATH of the stubs and git alone, AETHER_LANE_HARNESSES codex,agy,cursor
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, env)
  assert.deepEqual(r.json.lanes.harnesses, ['agy'])
  assert.ok(r.stderr.includes('aether-plan: superdelegation: codex is enabled but has no models in the lane table yet\n'), r.stderr)
  assert.ok(r.stderr.includes('aether-plan: superdelegation: cursor is enabled but is not installed: cursor-agent was not found\n'), r.stderr)
  assert.ok(!/superdelegation: (grok|agy) /.test(r.stderr), r.stderr)
})

test('compile runs native, and says why on stderr, when superdelegation is off', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  for (const value of ['off', '']) {
    const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_SUPERDELEGATION: value })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.json.lanes, null)
    assert.ok(r.stderr.includes("aether-plan: superdelegation is off: the aether plugin's superdelegation option is not on\n"), r.stderr)
  }
  const quiet = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_SUPERDELEGATION: 'off' })
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr)
  assert.ok(!quiet.stderr.includes('superdelegation is off'), quiet.stderr)
})
```

El aviso de plataforma, `aether-plan: superdelegation is off: superdelegation needs Linux\n`, se prueba donde hoy se prueba el de `lanes need Linux`, si el archivo tiene esa prueba.

**Acceptance:**
- Los tres textos de la salida de error son los de arriba, y `lanes` del resultado y de `graph.json` es `null` o la forma de los argumentos de la corrida (`superdelegation`, `harnesses`, `maxParallelByHarness`, `waits`, `cupo`).
- `aether-plan check` y el resto de `compile` no cambian; los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 16: El diseño sobre la misma función: el workflow y la lista cerrada

**Aether:**
- Tier: sonnet xhigh — integración entre el workflow de diseño, la lista cerrada del mod y las respuestas de los asientos, con las correcciones por ronda
- Review: xhigh — rondas que escriben documentos del Lead: una corrección mal enrutada cambia un documento aprobado
- Area: design
- Owns: `plugins/aether/workflows/design.workflow.js`, `plugins/aether/hooks/ops-command.mjs`, `tests/workflow-design.test.js`, `tests/ops-command-design.test.js`
- Depends on: Task 7 — el workflow lee el `native` y el `decision` de la respuesta del asiento y envía las banderas nuevas de `seat-start`
- Depends on: Task 3 — edita la misma lista cerrada del mod, después de ella
- Serves: R3, R4, R5, R6, R17, R19, R20, R22

**Base: lo que ya trae `design.workflow.js` de `fix/bug-issues` (fusionada, `888cb78`) y se conserva.** El `binDir` opcional de los args y su uso en el prefijo `PATH=` de los comandos (issue 008), `JUDGE_READING_PLAN` en el mensaje del Judge (022) y la línea de progreso `ran on <proveedor> · <lane>` de cada ronda (032). Sus pruebas en `tests/workflow-design.test.js` quedan verdes.

**Interfaces:**

`hooks/ops-command.mjs`: las dos formas de `seat-start` (juez/examinador con `--author`; escritor con `--doc`) cambian `--seats <native|balanced|robust> --lanes <on|off>` por `--superdelegation <on|off>`; el resto de la forma no cambia. `--seats` y `--lanes` se rechazan.

`design.workflow.js`: los argumentos son `{ feature, session, repoRoot, superdelegation, harnesses, ... }` (`superdelegation` `on` u `off`; `seats` y `lanes` ya no existen y no se aceptan). Se quitan `SEAT_CHOICES`, `NATIVE` como tabla propia de modelos (el agente nativo de una ronda sale de `value.native` de la respuesta del asiento, y si no la hay, de `REFERENCE` del workflow: Judge y Examiner Opus `high`, Writer Sonnet `high`), el estado `off` del Examiner y `nativeRevision` con su texto `the native Writer corrects the document, with no seat round`. Una corrección del Writer (`corrector`) es una `seatRound` del Writer con `writes` el documento (`spec` o `plan`), el mensaje de la corrección y el esquema del documento (`SPEC_WRITER_SCHEMA` o `WRITER_SCHEMA`); si el asiento queda nativo, el agente nativo responde con `REVISION_SCHEMA` (`seatRound` recibe `nativeSchema`, que por defecto es `schema`). Una ronda nativa de Judge o de Writer usa el `model` y el `effort` de `value.native`.

**Tests (write first):**

En `tests/workflow-design.test.js` se rehacen las pruebas de los argumentos, del Examiner y de las correcciones con los ayudantes del archivo (`go`, `ARGS`, `startOf`, `opsCalls`, `flag`, `waitFor`, `nativeSeat`, `handedBack`, `finding`, `nativeCalls`). `ARGS` pasa a `{ feature: FEATURE, session: 'sess-1', repoRoot: '/repo', superdelegation: 'off', harnesses: 'agy' }`, y `handedBack('examiner')` es un `nativeSeat('examiner')` (el Examiner ya no tiene estado apagado, y el diseño sin superdelegación lo corre nativo y guarda su examen). Las pruebas nuevas:

```js
test('a seat round is started with --superdelegation and --harnesses, and never with --seats or --lanes', async () => {
  const run = await go({ ...ARGS, superdelegation: 'on' })
  assert.equal(run.error, null, run.error && run.error.stack)
  for (const seat of ['writer', 'judge', 'examiner']) {
    const start = startOf(run, seat)
    assert.equal(flag(start, '--superdelegation'), 'on', seat)
    assert.equal(flag(start, '--harnesses'), 'agy', seat)
    assert.equal(start.command.rest.includes('--seats') || start.command.rest.includes('--lanes'), false, seat)
  }
})

test('args with seats or lanes, or a superdelegation that is neither on nor off, are refused before any agent starts', async () => {
  for (const bad of [{ seats: 'balanced' }, { lanes: 'on' }, { superdelegation: 'maybe' }, { superdelegation: undefined }]) {
    const run = await go({ ...ARGS, superdelegation: 'on', ...bad })
    assert.ok(run.error, JSON.stringify(bad))
    assert.equal(run.calls.length, 0, JSON.stringify(bad))
  }
})

test('E7: a Judge handed back to the native agent runs in the model and effort the seat reply names', async () => {
  const reply = { unavailable: 'no-external', seat: 'judge', native: { ...seats.NATIVE.judge, model: 'sonnet', effort: 'high' }, tried: [] }
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops: waitFor('judge', () => ({ done: true, exitCode: 3, value: reply })) })
  assert.equal(run.error, null, run.error && run.error.stack)
  for (const call of run.calls.filter((c) => c.role === 'judge')) assert.deepEqual([call.model, call.effort], ['sonnet', 'high'], call.label)
})

test('C3: the corrections of the Writer are seat rounds too, and fall to the native agent with the revision schema only when the seat is handed back', async () => {
  let n = 0
  const revise = (call, fallback) => (++n === 1 ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { judge: revise })
  assert.equal(run.error, null, run.error && run.error.stack)
  const writers = opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'writer')
  assert.deepEqual(writers.map((c) => flag(c, '--doc')), ['spec', 'spec', 'plan'])
  assert.ok(writers[1].payload.text.includes("Revise "), 'the second round of the Writer carries the correction message')
  assert.deepEqual(run.calls.find((c) => c.label === 'spec: writer revision 1').schema, schemas.REVISION_SCHEMA)
})

test('the design workflow holds no copy of the seat profiles and no native correction by rule', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  for (const gone of ['SEAT_CHOICES', 'nativeRevision', 'with no seat round', "'balanced'", "'robust'", 'input.seats', 'input.lanes']) assert.equal(source.includes(gone), false, gone)
})
```

En `tests/ops-command-design.test.js`: las formas de `seat-start` llevan `--superdelegation <on|off>` y `--harnesses`; `--seats native` y `--lanes on` se rechazan.

**Acceptance:**
- Sin superdelegación, ninguna ronda del diseño llama a un harness externo; con ella y las cuotas sanas, el Judge, el Writer (incluidas sus correcciones) y el Examiner van al par que `choose` da, y solo la ronda sin candidato corre nativa, en el `model` y el `effort` del `native` que el asiento devuelve.
- `design.workflow.js` ya no contiene `SEAT_CHOICES`, `nativeRevision`, `balanced` ni `robust`, y sigue sin imports, sin `Date` y sin azar.
- La lista cerrada del mod acepta las formas nuevas de `seat-start` y rechaza `--seats` y `--lanes`; `npm test` queda verde completo.

### Task 17: El README y las demás páginas

**Aether:**
- Tier: sonnet high — prosa técnica en español e inglés que `tests/docs-facts.test.js` sostiene contra el árbol
- Review: high — las pruebas de documentos fijan los hechos comprobables; lo demás es redacción
- Area: docs-pages
- Owns: `README.md`, `docs/getting-started.md`, `docs/guide/troubleshooting.md`, `docs/reference/components.md`, `docs/methodology.md`, `docs/purpose.md`, `tests/launcher.test.js`
- Depends on: Task 8 — remiten a la regla de `docs/guide/lanes.md` en lugar de repetirla
- Serves: R21, R25

**Interfaces:**

- `README.md`, `docs/getting-started.md`, `docs/guide/troubleshooting.md`, `docs/reference/components.md`, `docs/methodology.md` y `docs/purpose.md` dicen lo mismo que la regla: un interruptor, `superdelegation`, apagado por defecto; ya no hay `native`, `balanced` ni `robust`, ni la opción `seats`, ni las variables `AETHER_SEATS` y `AETHER_LANES`. Cuando una página repite el valor por defecto de la opción, dice `off`. Remiten a `docs/guide/lanes.md` (ancla `#lanes`) en lugar de repetir la regla.
- La frase del README y de `docs/getting-started.md` que dice `--config lanes=true` pasa a `--config superdelegation=true` («`superdelegation`, off by default»), y `tests/launcher.test.js` (la lista de cadenas que el README debe tener, línea 70) cambia `'--config lanes=true'` por `'--config superdelegation=true'`. La otra cadena `--config lanes=true` de ese archivo (línea 123) es de «Upgrading from 0.6» en `docs/guide/maintenance.md`, que no cambia: `lanes` sigue siendo una clave heredada.
- **Muse.** Estas páginas siguen listando a Muse con los otros harness donde ya lo hacen (README, metodología, propósito, `docs/getting-started.md`, `docs/guide/troubleshooting.md`; `tests/muse-docs.test.js`, `tests/muse-docs-overview.test.js`, `tests/harness-lists.test.js`), el README sigue en 160 líneas o menos, y ninguna cuenta los harness como cuatro.
- No se crea una página nueva, no se sube la versión ni se toca el changelog.

**Tests (write first):**

Esta tarea no añade un archivo de pruebas: las pruebas que sostienen sus páginas ya existen (`tests/docs-facts.test.js`: el README de a lo más 160 líneas y sus partes en orden, una sola línea `Version`, los enlaces y anclas que resuelven, cada `` `aether-<nombre>` `` un archivo de `bin/`), y la prueba de cierre sobre todas las páginas la añade la Task 18. El contrato de esta tarea es esta búsqueda, que no debe dar ninguna línea antes de reportar:

```bash
grep -nE 'balanced|robust|AETHER_SEATS|AETHER_LANES\b|--seats|`seats`|seats option' README.md docs/getting-started.md docs/guide/troubleshooting.md docs/reference/components.md docs/methodology.md docs/purpose.md
```

**Acceptance:**
- La búsqueda de arriba no halla nada y `tests/docs-facts.test.js` sigue pasando (`npm test` verde completo).
- Ningún archivo fuera de `Owns` cambia.

### Task 18: La web, la decisión y las pruebas de cierre de los documentos

**Aether:**
- Tier: sonnet high — HTML y JS sin compilación, en español e inglés, más pruebas de hechos sobre todas las páginas
- Review: high — `tests/site.test.js` y `tests/docs-facts.test.js` fijan los hechos comprobables; lo demás es redacción
- Area: site
- Owns: `site/**`, `tests/site.test.js`, `docs/decisions.md`, `docs/index.md`, `tests/docs-facts.test.js`
- Depends on: Task 17 — las pruebas de cierre miran todas las páginas, y las de la guía y las demás ya están escritas
- Serves: R19, R21, R25

**Interfaces:**

- La web (`site/index.html`, `site/app.js`, en español e inglés) dice `superdelegation` donde decía `lanes` y los perfiles. No hay `balanced` ni `AETHER_SEATS` en ella.
- `docs/decisions.md` gana la decisión **A65** (A63 y A64 ya existen) con el interruptor, la tolerancia de 1 punto, la regla de la cuota y la entrada de Muse por la decisión del dueño. `docs/index.md` sigue enlazando todas las páginas. La prueba «R15: the decisions A50 to A64…» de `tests/docs-facts.test.js` pasa a:

  ```js
  test('R15: the decisions A50 to A65 are recorded and the changelog opens with 0.13.0 and its handoff', () => {
    const decisions = read('docs/decisions.md')
    const LAST_DECISION = 65
    for (let n = 50; n <= LAST_DECISION; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
    const line = (n) => decisions.split('\n').find((row) => row.startsWith(`| A${n} |`))
    assert.ok(/Muse Code/.test(line(64)) && /fifth lane harness/.test(line(64)))
    assert.ok(/superdelegation/i.test(line(65)))
    // the rest of the test (A50, the changelog's first line) stays as it is
  })
  ```
- **Muse.** La web sigue nombrando a Muse donde lista los harness, en español e inglés (`tests/site.test.js`: `order = ['agy', 'grok', 'codex', 'cursor', 'muse']` en `site/app.js`, ninguna cuenta de «cuatro harnesses», ninguna lista `agy, codex, grok, cursor` sin Muse).
- No se crea una página nueva, y la lista de páginas de `tests/docs-facts.test.js` no cambia.

**Tests (write first):**

En `tests/docs-facts.test.js`, que ya tiene `FILES`, `read`, `proseLines` y `repeatedDefaults`:

```js
const GONE = [/`balanced`/, /`robust`/, /\bseats option\b/, /`seats`/, /--seats\b/, /AETHER_SEATS/, /AETHER_LANES\b/]
const HISTORY = ['docs/changelog.md', 'docs/contributing.md', 'docs/roadmap.md'] // name what was retired as history (roadmap.md: the 0.12.3 summary says `seats` selectors)
const MIGRATION = ['docs/guide/lanes.md', 'docs/guide/options.md'] // the only two pages that may name the legacy keys `lanes` and `seats`: the migration says what becomes of them
const prose = (rel) => proseLines(read(rel)).join('\n')

test('R21: no page of the guide or the README names the retired profiles or the retired variables', () => {
  for (const rel of FILES.filter((p) => !HISTORY.includes(p))) {
    for (const pattern of GONE.filter((g) => !MIGRATION.includes(rel) || g.source !== '`seats`')) assert.doesNotMatch(prose(rel), pattern, `${rel} still says ${pattern}`)
  }
})

test('R21: every page that gives the default of superdelegation in the form of R6 gives off', () => {
  let seen = 0
  for (const rel of FILES) {
    for (const { option, value } of repeatedDefaults(read(rel))) {
      if (option !== 'superdelegation') continue
      seen++
      assert.equal(value, false, rel)
    }
  }
  assert.ok(seen > 0, 'a page repeats the default of superdelegation')
})
```

(`GONE` no se aplica a `docs/changelog.md`, `docs/contributing.md` ni `docs/roadmap.md`, que nombran lo retirado como historia (el resumen de 0.12.3 del roadmap dice `seats`); `` `seats` `` se admite solo en `docs/guide/lanes.md` y `docs/guide/options.md`, por su migración (la prueba lo dice en `MIGRATION`); los patrones son los mismos que usa la Task 8 sobre las páginas de la guía; `docs/decisions.md` es historia pero su prosa no repite esos nombres fuera de la tabla de decisiones, y si lo hace la tarea lo exceptúa con su razón en la cabecera de la prueba.) En `tests/site.test.js`:

```js
test('R21: the site says superdelegation where it said lanes and the profiles, and names no retired profile', () => {
  for (const rel of ['site/index.html', 'site/app.js']) {
    const text = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
    for (const pattern of [/\bbalanced\b/, /AETHER_SEATS/]) assert.doesNotMatch(text, pattern, `${rel} still says ${pattern}`)
    assert.match(text, /superdelegation/i, `${rel} says superdelegation`)
  }
})
```

**Acceptance:**
- `tests/docs-facts.test.js` y `tests/site.test.js` pasan con el texto nuevo: el README tiene a lo más 160 líneas y sus partes en orden, los enlaces y anclas resuelven, cada `` `aether-<nombre>` `` es un archivo de `bin/`, y la tabla de opciones coincide con el manifiesto.
- Ningún archivo fuera de `Owns` cambia; no se sube la versión ni se toca el changelog.

### Task 19: status sin orden y la ejecución sin tabla de equivalencias

**Aether:**
- Tier: sonnet high — la traducción del effort se quita de la ruta de las llamadas externas, con pruebas que usan harness simulados
- Review: xhigh — `laneModel` decide con qué effort corre una llamada externa: una traducción que sobrevive rebaja un effort en silencio (C8)
- Area: lane-commands
- Owns: `plugins/aether/lib/lane-calls.js`, `tests/lane-status.test.js`, `tests/lane-start-marks.test.js`, `tests/aether-lane.test.js`
- Depends on: Task 6 — el workflow del swarm ya no usa `status` por ola ni los candidatos por rol
- Depends on: Task 9 — `choice` ya no existe y `tests/lane-status.test.js` ya perdió su prueba
- Depends on: Task 23 — `tests/muse-lane.test.js` ya no espera que `laneModel` traduzca `xhigh` a `high`
- Serves: R13, R20

**Base: lo que ya trae `lane-calls.js` de `fix/bug-issues` (fusionada, `888cb78`) y se conserva (issue 015).** En `judge()`, `isModelOrArgumentError(parsed)` se comprueba antes de la lectura de cuota: un error de modelo o de argumento (`model not found` y los suyos) es `failed` diga lo que diga la lectura. Quitar la traducción del effort no la toca, y sus pruebas en `tests/lane-start-marks.test.js` y `tests/aether-lane.test.js` quedan verdes.

**Interfaces:**

`lib/lane-calls.js`: `laneModel` ya no traduce el effort ni mira `levels` ni `roles`: devuelve `{ group, id, level: effort }` para un modelo de la tabla y un effort válido (`low` a `max`); `status` ya no trae `order` ni `orderOf`. `tests/lane-status.test.js` pierde lo de `order`; `tests/lane-start-marks.test.js` se ajusta a lo mismo.

**Tests (write first):**

```js
// tests/aether-lane.test.js
test('start passes the effort of the pair to the harness as it is, xhigh included, and refuses an effort that does not exist', (t) => {
  // a start of grok-4.7 at xhigh runs the fake grok with --reasoning-effort xhigh; an unknown effort is `unavailable: 'role'`
})
```

(El cuerpo lo escribe la tarea con los ayudantes de su archivo; lo que fija está dicho arriba y en Acceptance.)

**Acceptance:**
- Un `start` pasa el effort del par al harness tal cual, `xhigh` incluido, y un effort que no existe es `unavailable: 'role'`.
- `aether-lane status` no trae `order`; los demás campos y los demás comandos siguen como estaban.
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 20: El índice de modelos y el refresco de la inteligencia

**Aether:**
- Tier: sonnet high — dos scripts que generan datos, con una restricción dura (el router no cambia)
- Review: xhigh — el índice de modelos lo lee el router: un campo cambiado de más cambia el router sin que ningún test del repositorio lo diga
- Area: tables
- Owns: `scripts/build-models-index.js`, `scripts/refresh-lanes.js`, `plugins/aether/config/models/**`, `docs/models/**`, `tests/models-index.test.js`, `tests/lane-table-index.test.js`, `tests/refresh-lanes.test.js`
- Depends on: Task 1 — lee `config/pairs.json` y su `slug`
- Serves: R7, R13, R20, R24

**Interfaces:**

- `scripts/build-models-index.js`: los modelos no listados por el harness toman sus efforts de las filas de `config/pairs.json` (los de su harness y modelo), no de `levels`, y el detalle del índice pierde `levels`; `plugins/aether/config/models/**` y `docs/models/**` se regeneran con `node scripts/build-models-index.js`. `plugins/aether/config/router/rungs.json` debe quedar byte a byte igual (la tarea lo comprueba con `git diff --exit-code`). `config/lanes.json` no se toca aquí: sus `levels` los quita la Task 21.
- `scripts/refresh-lanes.js`: además de los `aa` de la tabla de lanes, refresca la inteligencia de `config/pairs.json` por el campo `slug` de cada fila (que la Task 1 ya escribió), y no toca el costo por tarea ni los demás campos. La fila de Muse tiene el `slug` de Opus `high`: queda igual a esa fila, y la cifra propia de Artificial Analysis para Muse (55.8 a `max`) sigue solo en el `aa` de su entrada de la tabla de lanes.
- `scripts/build-models-index.js` también deja de escribir `replaces`: se quita de `harnessEntries` el campo `replaces: entry?.replaces ?? null` del detalle y de `laneOf` (línea `const laneOf = …`) el `replaces`, que queda `entry.inLaneTable ? { roles: entry.roles } : null`. `config/models/models.json` se regenera sin `lane.replaces` (los seis que hoy trae); `docs/models/README.md` se regenera con el mismo script y no lo muestra. `roles` se queda: el router lo lee (`lib/router-rungs.js`).
- `tests/models-index.test.js`: las aserciones `{ roles: ['implementer'], replaces: 'sonnet' }` (en `acme.lane` y `agy.lane`) pasan a `{ roles: ['implementer'] }`; en el detalle esperado se quitan `replaces: 'sonnet'` y `replaces: null`; y las tablas sintéticas (`LANES`, `NATIVE_LANES`) pierden su `replaces`. Ninguna otra aserción cambia.
- `tests/lane-table-index.test.js` (lo escribió Muse en la 0.13.0 con la excepción de `ownerDecision`, que se conserva entera): su función `problems(config, index)` lee `entry.levels` para saber qué efforts pide la tabla, y la Task 21 quita `levels`. Pasa a `problems(config, index, pairs)`: los efforts que la tabla pide de un modelo son los de sus filas en `pairs` (las de ese `harness` y ese `model`), no los de su `levels`; los casos sintéticos (`TABLE`, `wide`) llevan al lado una lista `pairs` con las filas `{ harness, model, effort }` que antes decía su `levels` (`flash`: `low`, `medium`, `high`; `grok-9`: `low`, `medium`, `high`, `xhigh`; `wide`: `high`); la prueba de la tabla real usa `loadPairs().pairs`. Además deja de comparar `replaces`: se quitan las dos comprobaciones `the index says it replaces … and the table …`, el segundo parámetro de `lane(roles, replaces)` y los `replaces` de `TABLE` y de `wide`; del caso «His words do not excuse…» se quita la línea que cambia el `lane` a `sonnet` y su mensaje esperado, y el bloque `moved` (el índice dice que reemplaza a otro modelo) de «a model without a profile, a superseded model and an effort the harness does not take…» se borra. Se conservan entera la excepción de `ownerDecision` y las demás comprobaciones (perfil, efforts, superseded), y la del modelo de Muse (en `withoutFigures`, con `ownerDecision`, effort `high`) sigue pasando con la tabla de hoy y con la de la Task 21.

**Tests (write first):**

```js
// tests/models-index.test.js / tests/lane-table-index.test.js
test('the index of models is built without levels, and its efforts for a model the harness does not list come from the pairs table', () => {})
test('config/router/rungs.json is unchanged by the new index', () => {
  const r = spawnSync('git', ['diff', '--exit-code', '--', 'plugins/aether/config/router/rungs.json'], { cwd: ROOT })
  assert.equal(r.status, 0)
})

// tests/refresh-lanes.test.js
test('refresh-lanes refreshes the intelligence of the pairs by slug and leaves their cost per task alone', async (t) => {})
```

(Los cuerpos de los casos vacíos los escribe la tarea con los ayudantes de su archivo; lo que fijan está dicho arriba y en Acceptance.)

**Acceptance:**
- `git diff --exit-code plugins/aether/config/router/rungs.json` pasa, y las pruebas del router pasan sin cambiar.
- El índice y `docs/models/**` regenerados no traen `levels`; `refresh-lanes` actualiza `intelligence` por `slug` y deja intactos `costPerTaskUsd` y las demás columnas.
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 21: El retiro de la tabla de equivalencias y de los perfiles en la tabla de lanes

**Aether:**
- Tier: sonnet high — una limpieza que cruza la tabla de lanes y `lib/lanes.js`, con la restricción de que el router y el índice de modelos siguen leyendo lo que queda
- Review: xhigh — borra datos de una tabla que el router y el índice de modelos leen: un campo quitado de más cambia el router sin que ningún test del repositorio lo diga
- Area: tables
- Owns: `plugins/aether/config/lanes.json`, `plugins/aether/lib/lanes.js`, `tests/lanes.test.js`, `tests/lane-models.test.js`, `tests/helpers.js`, `tests/lane-fixtures.js`
- Depends on: Task 4 — el arranque de la sesión ya no escribe `AETHER_LANES` ni `AETHER_SEATS`
- Depends on: Task 15 — `aether-plan compile` ya no usa `lanesEnabled`, `lanesArgs` ni `idleHarnesses` de `lib/lanes.js`
- Depends on: Task 7 — los asientos ya no leen `designSeats`, `seatsChoice` ni `EXTERNAL_EFFORT`
- Depends on: Task 13 — la prueba de conformidad del panel ya no usa `seatsChoice`
- Depends on: Task 19 — `laneModel` ya no lee `levels`
- Depends on: Task 20 — el índice de modelos ya no lee `levels` ni escribe `replaces`, y `tests/lane-table-index.test.js` ya no los lee
- Depends on: Task 23 — `tests/muse-lane.test.js` ya no usa `lanesArgs` ni `idleHarnesses`, y ya no depende de que `levels` se traduzca a un effort; su `museEntry` conserva `levels` y `replaces` (Task 23), que el validador de la Task 21 ignora (`lib/lanes.js` no comprueba claves desconocidas)
- Serves: R3, R20, R25

**Interfaces:**

- `config/lanes.json`: se quitan `designSeats` y las claves `levels` y `replaces` de cada modelo; se quitan también los campos que solo servían a ellos. Se quedan `reserve`, `dryMarkMinutes`, y por harness `command`, `maxParallel` (la medición del Lead puede añadir `maxParallelMeasured`), `waitSeconds`, `quotaLifeMinutes`, `timeouts`, `groups` y `models`, y por modelo `group`, `roles`, `aa`, `ownerDecision` y `note`: el router, el índice de modelos y la comprobación de la tabla los leen.
- `lib/lanes.js`: se quitan `SEAT_CHOICES`, `DEFAULT_SEATS`, `seatsChoice`, `seatList`, `validateSeats`, `lanesEnabled`, `laneFor`, `lanesArgs` e `idleHarnesses`, la validación de `levels` y de `replaces` (la que pedía `haiku`, `sonnet` u `opus` a todo modelo de enjambre) en `validateModel`, con la variable `NATIVE_MODELS` si nada más la usa, y `LEVEL_NAMES`/`LEVEL_VALUES` si nada más los usa. `seatTimeout`, `SEATS`, `enabledHarnesses`, `loadConfig`, el log y las marcas se quedan.
- `tests/helpers.js` y `tests/lane-fixtures.js`: se quita `AETHER_LANES: 'on'`; queda `AETHER_SUPERDELEGATION: 'on'` (y lo que Muse añadió a `laneEnv`, `config.harnesses.muse.command = '/nowhere/muse'`, se queda).
- **La entrada de Muse** (`harnesses.muse.models["muse-wonder-full-1.0"]`) pierde `levels` y `replaces`. Conserva `group`, `roles`, `aa` (el 55.8 de `max`), `ownerDecision` y `note` (de la nota sale la frase «Aether's xhigh runs at Muse's high.», que deja de ser cierta, y entra «Its pair, muse/muse-wonder-full-1.0@high, is in config/pairs.json.»), y el harness conserva `command`, `maxParallel`, `waitSeconds`, `quotaLifeMinutes`, `timeouts` y `groups`. `validateModel` sigue pidiendo `group` y `roles`. `tests/lane-table-index.test.js` pasa (ya no compara `replaces`, Task 20). `tests/lane-models.test.js`, que la Task 21 cambia: `checkMuseModels` deja de pedir `typeof entry.replaces === 'string'` (queda `!entry.aa || typeof entry.aa.slug !== 'string' || !Number.isFinite(entry.aa.intelligence)`), el mensaje pasa de `no Artificial Analysis measurement behind its replaces` a `no Artificial Analysis measurement behind its entry` (en la función y en la aserción de la prueba «the rules fail for a model…»), y la `entry()` sintética pierde `replaces: 'sonnet'`; las demás reglas (modelo listado por la CLI, última generación, perfil, contributor, no es de código) no cambian.
- **Las pruebas de Muse en `tests/lanes.test.js`** (la Task 21 es la dueña del archivo): «the shipped lane table has a muse harness…» cambia `assert.deepEqual(wonder.levels, …)` por `assert.equal('levels' in wonder, false)` y `assert.equal(JSON.stringify(config.designSeats).includes('muse'), false, …)` por `assert.equal('designSeats' in config, false)`, y conserva el resto (comando, `maxParallel` 2, `quotaLifeMinutes` 30, `waitSeconds` 540, `timeouts`, `groups`, el único modelo, `group`, `roles`, `aa.slug`, `ownerDecision`) y añade `assert.equal('replaces' in wonder, false)`; en esa misma prueba, `[wonder.group, wonder.replaces, wonder.roles]` pasa a `[wonder.group, wonder.roles]`, `['muse', ['implementer', 'reviewer']]`; «the Muse model of the shipped table gives the swarm an Opus candidate…» se borra con `lanesArgs` (lo cubren `tests/superdelegation.test.js` y `tests/lane-pick.test.js`); «muse is a valid value of the harnesses option…» se queda; el cambio de Muse en «a role left out of a model turns that lane off» se va con `laneFor`. También salen de ese archivo la aserción de `m.levels` y de `designSeats` de «the shipped table names one lane model per native model…», los casos de `levels` y de `replaces` (`replaces = 'gpt'`) de «loadConfig refuses a table it cannot trust…», y de «loadConfig refuses design seats…» todos los casos de `designSeats` y los dos de `replaces` de `gemini-4-argon`, con lo que queda un caso (`timeouts.judge = 0`) que se conserva en una prueba de `timeouts`. Las tablas sintéticas de `tests/lanes.test.js` (`gpt-codex`, `gpt-mini`, y la de `claude-opus-5-5` en `codex`) pierden `replaces`.

**Tests (write first):**

```js
// tests/lanes.test.js
test('the lane table holds neither the hand-written level map nor the seat profiles', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  assert.equal('designSeats' in config, false)
  for (const harness of Object.values(config.harnesses)) for (const model of Object.values(harness.models)) assert.equal('levels' in model, false)
  assert.doesNotThrow(() => loadConfig(CONFIG_FILE))
})

test('lib/lanes.js no longer exports the retired names', () => {
  const lanes = require('../plugins/aether/lib/lanes.js')
  for (const gone of ['seatsChoice', 'seatList', 'SEAT_CHOICES', 'lanesEnabled', 'laneFor', 'lanesArgs', 'idleHarnesses']) assert.equal(gone in lanes, false, gone)
})
```

`tests/lanes.test.js` pierde las pruebas de `laneFor`, `lanesArgs`, `idleHarnesses`, `seatsChoice` y `seatList`, que ya cubren `tests/superdelegation.test.js` y `tests/seats.test.js`.

**Acceptance:**
- `config/lanes.json` no tiene `levels`, `replaces` ni `designSeats`, y `lib/lanes.js` no exporta los nombres de arriba ni valida `replaces`; la entrada de Muse conserva todo lo demás.
- `git diff --exit-code plugins/aether/config/router/rungs.json` pasa, y las pruebas del router pasan sin cambiar.
- `npm test` queda verde completo; `npm run validate` pasa.

### Task 22: El retiro del orden por candidatos

**Aether:**
- Tier: haiku high — borrar dos funciones y sus casos de prueba, con las que se quedan fijadas por las pruebas que ya existen
- Review: high — `groupView` y `readingUsable` los leen el router y las vistas de cuota: no deben cambiar
- Area: lane-commands
- Owns: `plugins/aether/lib/lane-order.js`, `tests/lane-order.test.js`, `tests/lane-order-cases.js`, `tests/lane-quota.test.js`, `tests/router-quota.test.js`
- Depends on: Task 19 — `lane-calls.js` y `aether-lane status` ya no usan `orderCandidates` ni `candidatesOf`
- Depends on: Task 9 — `lib/lane-choice.js` ya no existe
- Depends on: Task 23 — `tests/muse-lane.test.js` ya no llama a `orderCandidates`
- Serves: R19, R20

**Interfaces:**

`lib/lane-order.js`: se quitan `candidatesOf` y `orderCandidates`; `groupView` y `readingUsable` se quedan. `tests/lane-order.test.js` y `tests/lane-order-cases.js` pierden los casos de `orderCandidates` y `candidatesOf` y conservan los de `groupView` y `readingUsable` (y su comentario de cabecera deja de nombrar la copia del workflow); `tests/lane-quota.test.js` pierde el caso que llama a `order.orderCandidates`; `tests/router-quota.test.js` conserva su comprobación de que el código del router no nombra `orderCandidates`.

**Tests (write first):**

```js
// tests/lane-order.test.js
test('lib/lane-order.js keeps the group view and no longer holds the order of candidates', () => {
  const order = require('../plugins/aether/lib/lane-order.js')
  for (const kept of ['groupView', 'readingUsable']) assert.equal(typeof order[kept], 'function', kept)
  for (const gone of ['candidatesOf', 'orderCandidates']) assert.equal(gone in order, false, gone)
})
```

**Acceptance:**
- `lib/lane-order.js` no exporta `candidatesOf` ni `orderCandidates`; las pruebas del router y de las vistas de cuota pasan sin cambiar salvo lo dicho arriba.
- Los archivos de `Owns` son los únicos que cambian; `npm test` queda verde completo.

### Task 23: Las pruebas de Muse sobre la regla

**Aether:**
- Tier: haiku high — reescribir tres trozos de una prueba contra una función y una tabla que los tests de la Task 1 ya fijan
- Review: high — la prueba de Muse es la que dice que Muse se trata como los demás harness; debe seguir diciéndolo con la regla nueva
- Area: muse
- Owns: `tests/muse-lane.test.js`
- Depends on: Task 1 — usa `choose`, `runArgs` e `idleHarnesses` de `lib/superdelegation.js` y `loadPairs`
- Serves: R24, R25

**Interfaces:**

`tests/muse-lane.test.js` (la escribió Muse en la 0.13.0) llama hoy a `lanes.lanesArgs`, `lanes.idleHarnesses` y `order.orderCandidates`, y pide que un `--effort xhigh` llegue a la CLI como `--reasoning-effort high` por el `levels` de la tabla. Las Tasks 19, 21 y 22 retiran esas cuatro cosas, y dependen de esta tarea para que `npm test` siga verde en cada fusión. La tarea cambia solo estos trozos, a una forma que vale con el código de hoy y con el retirado, y no toca ninguna otra aserción de Muse:

- Los `require`: se quita `lane-order.js` y se añaden `const { choose, runArgs, idleHarnesses } = require('../plugins/aether/lib/superdelegation.js')` y `const { loadPairs } = require('../plugins/aether/lib/pairs.js')`.
- `flags()` pide `--effort high`, y la aserción de la primera prueba dice `'the effort of the pair goes as it is'` en lugar de «xhigh goes as the level the table maps it to» (sigue esperando `high`). `museEntry` conserva `levels` y `replaces` (el validador de hoy los pide; el de la Task 21 los ignora) y su comentario deja de decir que `xhigh` se mapea a `high`.

**Tests (write first):**

En «a muse that is not installed starts no call…» (US4), las líneas desde `const installed = …` hasta el final pasan a:

```js
  const { pairs } = loadPairs()
  const installed = (name, harness) => lanes.commandInstalled(harness.command)
  const config = lanes.loadConfig(env.AETHER_LANES_CONFIG)
  assert.equal(runArgs(config, pairs, { installed, enabled: ['muse'] }), null)
  const [idle] = idleHarnesses(config, pairs, { installed, enabled: ['muse'] })
  assert.equal(idle.name, 'muse')
  assert.match(idle.reason, /is not installed/)

  // The same table with the fake muse gives the harness its calls.
  const present = lanes.loadConfig(museEnv(t, {}).AETHER_LANES_CONFIG)
  assert.deepEqual(runArgs(present, pairs, { installed, enabled: ['muse'] }).harnesses, ['muse'])
```

La prueba «the order treats Muse as it treats the other harnesses…» (US2, R15) se reemplaza por esta (usa `museEnv`, `observedFile`, `writeObserved`, `marks`, `runBin`, `fx`, `tempDir`, `fs`, `path`, `HOUR`, `DAY`):

```js
test('the choice treats Muse as it treats the other harnesses: the window of its quota, the reserve, a mark and the installation (US2, R15)', (t) => {
  const env = museEnv(t, {}, { models: false })
  const cwd = tempDir(t)
  const { pairs } = loadPairs()
  const MUSE_PAIR = 'muse/muse-wonder-full-1.0@high'
  const unread = { unknown: true, usable: true, mark: null, resetsAt: null }
  const agy = { installed: true, groups: { gemini: unread, claude: unread } }
  const choice = (environment = env) => {
    const report = runBin(fx.LANE_BIN, ['quota', '--json', 'muse'], cwd, environment).json
    return choose({ pairs, reference: { model: 'opus', effort: 'high' }, harnesses: { agy, muse: report.harnesses.muse } })
  }
  const why = (decision) => decision.candidates.find((c) => c.id === MUSE_PAIR).why
  const observe = (used) => writeObserved(env, { observedAt: Date.now(), window: { usedPercent: used, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: used, resetsAtMs: Date.now() + 5 * DAY } })

  // 28% left with the reset far off: Muse has a window and agy has none, so Muse goes first.
  observe(72)
  assert.equal(choice().picked.id, MUSE_PAIR)

  // 3% left is under the reserve of 5%.
  observe(97)
  let decision = choice()
  assert.equal(why(decision), 'dry')
  assert.equal(decision.picked.harness, 'agy')

  // A live mark holds the group whatever else is known.
  fs.rmSync(observedFile(env))
  marks.markDry(env.AETHER_DATA_DIR, { harness: 'muse', group: 'muse', reserve: 0.05, now: Date.now() })
  assert.equal(why(choice()), 'dry')

  // A command that is not installed.
  const absent = museEnv(t, {}, { models: false, command: path.join(tempDir(t), 'no-muse') })
  decision = choice(absent)
  assert.equal(why(decision), 'not-installed')
  assert.equal(decision.picked.harness, 'agy')
})
```

**Acceptance:**
- `tests/muse-lane.test.js` pasa con el código de hoy y sigue pasando después de las Tasks 19, 21 y 22; ya no nombra `lanesArgs`, `idleHarnesses` de `lib/lanes.js`, `orderCandidates` ni espera que `xhigh` se traduzca.
- Los demás tests de ese archivo (la unidad en su worktree, el revisor estructurado, los seis fallos, la cuota que deja la marca de 60 minutos, `aether-lane quota`, `stop`, `lane-smoke`) no cambian.
- Solo cambia `tests/muse-lane.test.js`; `npm test` queda verde completo.
