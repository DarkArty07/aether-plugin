# Tareas: dejar el proyecto limpio y coherente antes de hacerlo público

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, sin dependencias nuevas. Las rutas son relativas a la raíz del repositorio. Cada tarea deja `npm test` en verde: la fusión corre el comando completo, y una prueba que falla fuera de los `Owns` de la tarea bloquea su unidad y todo lo que depende de ella. Si un cambio rompe una prueba que la tarea no posee, la tarea no lo hace: lo dice en su informe y deja el código como estaba.
- **Es una refactorización que conserva el comportamiento visible (R24)** salvo lo que C1 retira (tareas 3, 8, 33, 34, 35, 36 y 37) y el límite de `roles` de C2 (tareas 10, 43, 44, 45 y 46). Las pruebas existentes no cambian de sentido; las que fijaban lo retirado se borran o se reescriben en la tarea que lo retira. No se añade ninguna función, opción ni comando.
- **`binDir` y `firstBase` de `aether-plan` y `run.workflow.js` no se tocan** (A4 de la spec). Los adaptadores de `codex` y `cursor` no cambian de comportamiento (R20): sus pruebas pasan sin cambiar su sentido.
- **Los nombres retirados no aparecen literales en `tests/`.** La lista cerrada de la spec la arma `tests/retired-patterns.js` por concatenación de fragmentos; una prueba que necesita poner la variable, crear el archivo o el diario viejo, o definir su propio patrón, concatena (`'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'`, `'.' + 'router' + '.json'`) o pide el patrón a ese ayudante. Ningún archivo de `tests/` contiene un patrón retirado entero, ni `tests/retired-patterns.js` mismo.
- **Los comentarios del código y las páginas de `docs/` van en inglés.** Los archivos de `specs/` no se tocan (los escribe solo el Lead); `scripts/`, `.specify/` y `.claude/` tampoco, salvo que un `Owns` los nombre.
- **El módulo de un barrido (tareas 13 a 28) sigue estas reglas**, que cada barrido cita por su número y que su prueba de grupo (`checkGroup` de `tests/guards-helpers.js`) comprueba:
  1. **Cabecera.** El primer bloque de comentario del archivo (después de `#!` y de `'use strict'`) dice en una o dos frases qué es el módulo y a qué lo llaman. En `plugins/aether/lib/**` el bloque lleva además una línea `// Family: <familia>.`: la familia es el prefijo del archivo antes del primer `-` (`lane`, `router`, `delegate`, `observe`, `seat`, `spend`, `plan`, `session`), `harness` para `lib/harness/*`, y para un archivo sin guion la que `docs/reference/components.md` (sección «Library families») le declara (`lane` para `lanes.js`, `seat` para `seats.js`, …); `none` si ahí está en la lista de módulos sueltos, que vale también para un archivo con guion sin hermanos (`first-setup.js`, `quota-refusal.js`). En `bin/` y en `hooks/` no hay línea de familia: la cabecera dice qué comando o qué pieza del mod es (en un bin, a qué `lib/` llama).
  2. **Comentarios.** Se lee cada comentario contra el código que describe y se reescribe o se borra el que cuenta una conducta que ya no existe (las opciones `lanes` y `seats`, el decider y `aether-route`, el diario del router, los formatos viejos, un nombre viejo de archivo o de función). Cada cita `A<n>`/`D<n>` (de `docs/decisions.md`) o `spec <NNN>`/`specs/<NNN>-` (una carpeta de `specs/`) nombra un número que existe y cuyo texto trata de lo que el comentario dice. Esto último lo decide la revisión módulo a módulo del supervisor, no una búsqueda.
  3. **Helpers repetidos (solo `lib/**`).** Una función que `checkGroup` informa como repetida se sustituye por un `require('./common.js')` (con un alias si el nombre local difiere) y se borra la definición local; si una prueba que el barrido no posee la importa de este módulo, el módulo conserva una línea que la reexporta. Los hooks del mod no importan `lib/`: R15 no los mide.
  4. **Nada sin uso.** Se borran los nombres de nivel superior que nadie usa en el archivo ni exporta, y los `require` sin uso.
  5. **Compatibilidad con formatos viejos (R4).** Una rama que lee un formato que ningún código del árbol escribe (se comprueba buscando quién lo escribe) se borra, con las pruebas que solo la fijaban si el barrido las posee; si no las posee, se deja y se dice en el informe. Decirlo no la admite: la tarea 32 busca el grupo `formats` (`LEGACY_EXCLUDES`, `LEGACY_HARNESS`, `haiku=`, `jev=`) y, si la rama sigue, la prueba queda en rojo y el informe nombra la tarea cuyo `Owns` incluye el archivo.
  6. **El comportamiento no cambia.** Solo comentarios, cabeceras, imports y borrados de lo que nada usa.
- **Nombre de la prueba de grupo y plantilla.** Cada barrido crea `tests/guards-<grupo>.test.js` con dos líneas: `const { checkGroup } = require('./guards-helpers.js')` y `checkGroup('<grupo>', [<las rutas de sus módulos>])`. `checkGroup` registra cuatro pruebas por llamada: cabecera (regla 1), citas (regla 2, la parte que una búsqueda decide), helpers repetidos y nombres sin uso (reglas 3 y 4), y, en `lib/harness/`, que el adaptador solo pide módulos hermanos, `../common.js`, `../lane-process.js`, `../lane-schemas.js` y `../run.js`.
- **Documentación.** Cada página de `docs/` tiene `title`, `description` y un `order` entero en su encabezado y está enlazada desde `docs/index.md`; cada enlace relativo y cada ancla resuelven; un código entre comillas `` `aether-<nombre>` `` es un archivo de `plugins/aether/bin/`. `tests/docs-facts.test.js` lo comprueba.
- **Cada tarea cuenta en su informe lo que dejó sin hacer y por qué** (una función que una prueba ajena usa, una afirmación de un documento que no sabe verificar).

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 400

## Checklist

- [ ] T001 [P] [US6] El módulo `lib/common.js` con los helpers genéricos repetidos y su prueba → Task 1
- [ ] T002 [P] [US4] `tests/guards-helpers.js`: las medidas de cabecera, citas, repetidos, sin uso y capas, con su prueba → Task 2
- [ ] T003 [P] [US1] El manifiesto y la tabla de opciones pierden `lanes` y `seats`; `tests/retired-patterns.js` arma los patrones, grupo `formats` incluido → Task 3
- [ ] T004 [P] [US5] Las cifras de Muse entre las cuatro tablas de `config/`, y las claves de primer nivel de esas cuatro con su lector → Task 4
- [ ] T005 [US7] `waitForDelegate`, `lineText`, `LANE_NOTES`, los fixtures del router viejo y los imports sin uso → Task 5
- [ ] T006 [P] [US10] Las rutas personales de las fixtures del panel → Task 6
- [ ] T007 [US10] Los docs históricos salen del árbol; la sección «Library families» → Task 7
- [ ] T008 [P] [US2] El diario viejo del router no se lee en `/spend` ni en `aether-report` → Task 8
- [ ] T009 [US8] Los comandos sin llamador salen → Task 9
- [ ] T010 [US3] `choose` filtra por `role` cuando se lo pasan, y sin `role` se queda como hoy → Task 10
- [ ] T011 [US6] Se rompe el ciclo `lanes.js` ↔ `spend.js` con `lane-process.js` y `spend-tokens.js` → Task 11
- [ ] T012 [US6] Los bins solo leen argumentos y llaman a `lib/` → Task 12
- [ ] T013 [P] [US4] Barrido de `worktrees`, `globs`, `git`, `run` y `baseline` → Task 13
- [ ] T014 [P] [US4] Barrido de `lane-calls`, `lane-work`, `lane-schemas`, `lane-readings` y `lane-order` → Task 14
- [ ] T015 [P] [US4] Barrido de `observe`, `observe-calibrate`, `observe-detect`, `observe-redact` y `observe-baseline` → Task 15
- [ ] T016 [P] [US4] Barrido de `autonomy`, `guard`, `first-setup`, `voice` y `session` → Task 16
- [ ] T017 [P] [US4] Barrido de los hooks `register`, `ops-command`, `fault-trace`, `quota-brake` y `spend-view` → Task 17
- [ ] T018 [P] [US4] Barrido de los hooks `delegate`, `delegate-wait`, `panel-layout` y `panel-view` → Task 18
- [ ] T019 [US6] Barrido de los cinco `router-*`, que se quedan y son la familia `router` → Task 19
- [ ] T020 [P] [US6] Barrido de los adaptadores `agy`, `codex`, `cursor`, `grok`, `structured` e `index` → Task 20
- [ ] T021 [P] [US6] Barrido de `grok-acp`, `grok-quota` y `muse` → Task 21
- [ ] T022 [P] [US4] Barrido de `spend`, `spend-archive`, `report` y `prices` → Task 22
- [ ] T023 [P] [US4] Barrido de `plan`, `pairs`, `superdelegation`, `quota-refusal` y `pending` → Task 23
- [ ] T024 [US4] Barrido de `lane-delegate`, `lane-marks`, `lane-pick` y `lane-quota` → Task 24
- [ ] T025 [US4] Barrido de `delegate-calls`, `-chain`, `-checks`, `-limits`, `-log` y `-report` → Task 25
- [ ] T026 [US4] Barrido de `delegate-run`, `delegate-task` y `ladder` → Task 26
- [ ] T027 [US4] Barrido de `seats`, `seat-calls` y `exam` → Task 27
- [ ] T028 [US4] Barrido de `observe-dev`, `-digest`, `-hook` y `-read` → Task 28
- [ ] T029 [P] [US9] Las decisiones D3, D4, D9, D10, A28, A40, A55, A61 y A62 dicen lo que es cierto → Task 29
- [ ] T030 [US9] `CLAUDE.md`, el README, las guías y la referencia dicen lo que el código hace → Task 30
- [ ] T031 [P] [US9] Los demás documentos de `docs/` y el texto del sitio dicen lo que el código hace → Task 31
- [ ] T032 [US11] `tests/guards.test.js`: cabeceras, citas, capas, helpers, familias, nombres retirados en los docs, formatos viejos, claves de configuración y datos personales, sobre todo el árbol → Task 32
- [ ] T033 [US1] `resolveOption` deja de leer las opciones viejas, y `report.js` pierde `LEGACY_HARNESS` y las notas de legado → Task 33
- [ ] T034 [US1] `aether-session-start` ya no escribe la línea de legado → Task 34
- [ ] T035 [US1] `settingsOf` del mod ignora `lanes` como entrada → Task 35
- [ ] T036 [US1] `session.js` ya no borra `.router.json` ni tiene una rama `haiku=`/`jev=` → Task 36
- [ ] T037 [P] [US1] `run.js` ya no reescribe `LEGACY_EXCLUDES` → Task 37
- [ ] T038 [US5] La lista de harnesses del código, copia por copia → Task 38
- [ ] T039 [US5] La lista de harnesses en la configuración, el manifiesto y el script del índice → Task 39
- [ ] T040 [US5] Las clases irreversibles, fuente y copias → Task 40
- [ ] T041 [US5] Los plazos, fuente y copias → Task 41
- [ ] T042 [US5] Los rungs de la escalera de delegates viven solo en `config/ladder.json` → Task 42
- [ ] T043 [P] [US3] `lane-pick.js` pasa a `choose` el rol del swarm → Task 43
- [ ] T044 [P] [US3] `lane-delegate.js` pasa a `choose` el rol del bucle → Task 44
- [ ] T045 [P] [US3] `seats.js` pasa a `choose` el nombre del asiento → Task 45
- [ ] T046 [P] [US3] `router-pick.js`: la decisión pasa `reviewer`, la sonda de `serving` no pasa rol → Task 46
- [ ] T047 [US1] Las pruebas que nadie más posee dejan de llevar un nombre retirado literal → Task 47
- [ ] T048 [P] [US5] La frase de los intentos por defecto del swarm coincide en la skill, speckit y el agente writer → Task 48
- [ ] T049 [P] [US7] Las claves de primer nivel de `autonomy.json`, `observe.json`, `profiles.json` y `harness-models.json`, cada una con su lector → Task 49

### Task 1: `lib/common.js`, el sitio de los helpers genéricos repetidos

**Aether:**
- Tier: haiku high — cuerpos que se copian tal cual de sus definiciones actuales y pruebas que fijan cada uno
- Area: lib-common
- Owns: `plugins/aether/lib/common.js`, `tests/common.test.js`
- Depends on: none
- Serves: R15

**Interfaces:** un módulo CommonJS sin dependencias de `lib/` salvo `./git.js` (para `removeWorktree`). Cada función toma su cuerpo, **copiado sin cambios**, de una de las definiciones repetidas actuales (para que `tests/guards-helpers.js` vea el cuerpo igual y los barridos puedan quitar las copias): `isObject(value)` (de `lanes.js`), `isNumber(value)` (de `pairs.js`), `numberOrZero(value)` (de `lanes.js`), `isText(value)` (de `delegate-run.js`), `messageOf(err)` (de `delegate-run.js`), `readJson(file)` (de `run.js`), `readJsonOrNull(file)` (de `lane-calls.js`), `readTextOrEmpty(file)` (de `lane-calls.js`), `parseJson(text)` (de `observe.js`; devuelve `undefined` si no es JSON), `writeAtomic(targetPath, content)` (de `lane-marks.js`), `writeFileAtomic(file, text)` (de `observe-digest.js`), `exists(target)` (de `lane-work.js`), `isExecutableFile(file)` (de `lanes.js`), `pidAlive(pid)` (de `delegate-run.js`), `killGroup(pid)` (de `delegate-calls.js`), `sleep(ms)` (de `lane-calls.js`, devuelve una promesa), `sleepSync(ms)` (de `lanes.js`), `nulEntries(text)` (de `worktrees.js`), `removeWorktree(mainRoot, worktree)` (de `seats.js`). `finishedResult` no está aquí: su único hogar es `lane-calls.js` (tarea 14); la copia de `seat-calls.js` la quita la tarea 27. Exporta exactamente esos diecinueve nombres.

**Tests (write first):** `tests/common.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const common = require('../plugins/aether/lib/common.js')

test('common exports exactly the nineteen helpers', () => {
  assert.deepEqual(Object.keys(common).sort(), ['exists', 'isExecutableFile', 'isNumber', 'isObject', 'isText', 'killGroup', 'messageOf', 'nulEntries', 'numberOrZero', 'parseJson', 'pidAlive', 'readJson', 'readJsonOrNull', 'readTextOrEmpty', 'removeWorktree', 'sleep', 'sleepSync', 'writeAtomic', 'writeFileAtomic'])
})

test('the predicates', () => {
  assert.equal(common.isObject({}), true)
  for (const value of [null, [], 'x', 3, undefined]) assert.equal(common.isObject(value), false)
  assert.equal(common.isNumber(1.5), true)
  for (const value of [NaN, Infinity, '1', null]) assert.equal(common.isNumber(value), false)
  assert.equal(common.numberOrZero(4), 4)
  for (const value of ['4', NaN, undefined, null]) assert.equal(common.numberOrZero(value), 0)
  assert.equal(common.isText(' a '), true)
  for (const value of ['', '  ', 3, null]) assert.equal(common.isText(value), false)
  assert.equal(common.messageOf(new Error('boom')), 'boom')
  assert.equal(common.messageOf('plain'), 'plain')
})

test('reading: readJson throws, the others fall back', (t) => {
  const dir = tempDir(t)
  const good = path.join(dir, 'a.json')
  fs.writeFileSync(good, '{"a":1}')
  assert.deepEqual(common.readJson(good), { a: 1 })
  assert.throws(() => common.readJson(path.join(dir, 'missing.json')))
  assert.deepEqual(common.readJsonOrNull(good), { a: 1 })
  assert.equal(common.readJsonOrNull(path.join(dir, 'missing.json')), null)
  assert.equal(common.readTextOrEmpty(path.join(dir, 'missing.json')), '')
  assert.equal(common.readTextOrEmpty(good), '{"a":1}')
  assert.deepEqual(common.parseJson('[1]'), [1])
  assert.equal(common.parseJson('not json'), undefined)
})

test('writing is atomic and leaves no temporary file', (t) => {
  const dir = tempDir(t)
  const one = path.join(dir, 'deep', 'one.txt')
  common.writeAtomic(one, 'a')
  common.writeAtomic(one, 'b')
  assert.equal(fs.readFileSync(one, 'utf8'), 'b')
  const two = path.join(dir, 'deeper', 'two.txt')
  common.writeFileAtomic(two, 'c')
  assert.equal(fs.readFileSync(two, 'utf8'), 'c')
  for (const folder of ['deep', 'deeper']) assert.deepEqual(fs.readdirSync(path.join(dir, folder)).filter((name) => name.endsWith('.tmp')), [])
})

test('files and processes', (t) => {
  const dir = tempDir(t)
  const script = path.join(dir, 'run.sh')
  fs.writeFileSync(script, '#!/bin/sh\n')
  assert.equal(common.exists(script), true)
  assert.equal(common.exists(path.join(dir, 'nope')), false)
  assert.equal(common.isExecutableFile(script), false)
  fs.chmodSync(script, 0o755)
  assert.equal(common.isExecutableFile(script), true)
  assert.equal(common.isExecutableFile(dir), false)
  assert.equal(common.pidAlive(process.pid), true)
  assert.equal(common.pidAlive(2 ** 22 + 12345), false)
  assert.doesNotThrow(() => common.killGroup(2 ** 22 + 12345))
  assert.deepEqual(common.nulEntries('a\0b\0\0c\0'), ['a', 'b', 'c'])
  const started = Date.now()
  common.sleepSync(30)
  assert.ok(Date.now() - started >= 25)
})

test('sleep resolves later', async () => {
  const started = Date.now()
  await common.sleep(30)
  assert.ok(Date.now() - started >= 25)
})

test('removeWorktree removes a worktree and its folder', (t) => {
  const repo = makeRepo(t)
  const worktree = path.join(tempDir(t), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'unit/x', worktree)
  assert.equal(fs.existsSync(worktree), true)
  common.removeWorktree(repo.dir, worktree)
  assert.equal(fs.existsSync(worktree), false)
  assert.equal(repo.git('worktree', 'list').split('\n').length, 1)
})
```

**Acceptance:** `node --test tests/common.test.js` pasa; `lib/common.js` tiene una cabecera que dice qué es y `// Family: none.`; ningún otro archivo cambia; los demás módulos de `lib/` siguen definiendo sus copias (los barridos las quitan).

### Task 2: `tests/guards-helpers.js`, las medidas de la spec como programa

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — diseña las medidas de R7, R8, R14 y R15 y deja la forma que los barridos repiten; las pruebas fijan los casos pero no la forma
- Area: guards
- Owns: `tests/guards-helpers.js`, `tests/guards-helpers.test.js`
- Depends on: none
- Serves: R7, R8, R14, R15, R18

**Interfaces:** `tests/guards-helpers.js` exporta, todo con `root` opcional (por defecto la raíz del repositorio) para poder probarse sobre un árbol falso:

- `ROOT: string`.
- `moduleFiles({ root }): string[]` las rutas relativas, ordenadas, de `plugins/aether/lib/**/*.js`, de cada archivo regular de `plugins/aether/bin/` y de `plugins/aether/hooks/*.js` y `*.mjs` (sin `*.test.*`).
- `firstCommentBlock(text): string` el texto del primer bloque de comentario (líneas `//` seguidas, o un `/* */`) que sigue a un `#!` y a `'use strict'`; `''` si no hay.
- `declaredFamilies(markdown): { families: Map<string, { orchestrator: string | null }>, loose: Set<string> }` lee la sección `## Library families` de `docs/reference/components.md`: una tabla `| Family | Prefix | Members | Orchestrator or table |` (la última celda es un nombre de archivo entre comillas inversas o `none`) y una línea que empieza por `Loose modules` con los archivos entre comillas inversas.
- `expectedFamily(rel, declared): string | { problem: string }` la regla de R8: `'none'` si el archivo está en `loose` (también uno con guion que no tiene hermanos, como `first-setup.js`); `harness` para `lib/harness/*`; el prefijo antes del primer `-` para un archivo de `lib/` con guion; para uno sin guion, la familia de la que `declared` lo nombra orquestador, o un `problem` si no está declarado; `null` fuera de `lib/` (no se exige).
- `headerProblems(rel, { root, declared }): string[]` vacío cuando el primer bloque tiene al menos seis palabras y, en `lib/**`, una línea `// Family: <familia>` cuyo nombre es el esperado.
- `citationsOf(text): { decisions: string[], specs: string[] }` toma solo texto de comentario: `\b[AD]\d{1,3}\b` y `spec(?:s)? ?\/?(\d{3})\b` (`spec 013`, `specs/013-…`).
- `citationProblems(rel, { root }): string[]` una decisión `A<n>` existe como fila `| A<n> |` de `docs/decisions.md`, una `D<n>` como encabezado `## D<n>.`, una spec como carpeta `specs/<NNN>-*`.
- `definitionsOf(text): { name: string, body: string }[]` las funciones de nivel superior (`function nombre(…) {…}` y `const nombre = (…) =>` desde la columna 0, con llaves emparejadas o hasta el fin de la línea), con el cuerpo sin comentarios ni espacios; se descartan los de menos de 8 caracteres.
- `duplicateGroups(files, { root, among }): { names: string[], files: string[] }[]` agrupa por cuerpo normalizado las definiciones de `among` (por defecto toda `lib/**`) y devuelve los grupos con más de una definición en los que interviene un archivo de `files`, menos los de `EXEMPT_GROUPS` (arreglo exportado, vacío; cada exención es `{ names, test }` con el nombre de la prueba que da un resultado distinto para esas definiciones).
- `deadNames(rel, { root }): string[]` nombres de nivel superior (`const`, `let`, `function`, `class`) con una sola aparición en el texto sin comentarios y que no están en `module.exports`, y nombres importados con `require` (con o sin desestructurar) que no se usan.
- `requireGraph({ root }): Map<string, string[]>` las aristas entre archivos de `lib/` por cada `require('./…')` o `require('../…')` resuelto, donde sea que aparezca en el archivo.
- `findCycles(graph): string[][]`.
- `adapterProblems(rel, { root }): string[]` para un archivo de `lib/harness/`: pide algo que no sea un hermano, `../common.js`, `../lane-process.js`, `../lane-schemas.js` o `../run.js`.
- `checkGroup(name, files, { root }): void` registra con `node:test` las cuatro pruebas de la plantilla de Global Constraints: `"<name>: each module says what it is and its family"`, `"<name>: every decision and spec cited exists"`, `"<name>: no helper is defined twice"` (con `adapterProblems` para `lib/harness/`), `"<name>: nothing is defined or required and left unused"`.

**Tests (write first):** `tests/guards-helpers.test.js` arma un árbol falso en un directorio desechable y llama cada medida. Casos, cada uno una prueba:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const g = require('./guards-helpers.js')

function tree(t, files) {
  const root = tempDir(t)
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  return root
}
const LIB = 'plugins/aether/lib/'
const FAMILIES = ['## Library families', '', '| Family | Prefix | Members | Orchestrator or table |', '| --- | --- | --- | --- |',
  '| lane | `lane-` | `lane-calls.js` | `lanes.js` |', '| spend | `spend-` | `spend-archive.js` | `spend.js` |', '', 'Loose modules (no family): `common.js`, `git.js`, `first-setup.js`.', ''].join('\n')

test('declaredFamilies reads the table and the loose list', () => {
  const d = g.declaredFamilies(FAMILIES)
  assert.equal(d.families.get('lane').orchestrator, 'lanes.js')
  assert.equal(d.families.get('spend').orchestrator, 'spend.js')
  assert.deepEqual([...d.loose].sort(), ['common.js', 'first-setup.js', 'git.js'])
})

test('expectedFamily follows the tree: prefix, harness, declared orchestrator, loose', () => {
  const d = g.declaredFamilies(FAMILIES)
  assert.equal(g.expectedFamily(`${LIB}lane-calls.js`, d), 'lane')
  assert.equal(g.expectedFamily(`${LIB}harness/muse.js`, d), 'harness')
  assert.equal(g.expectedFamily(`${LIB}lanes.js`, d), 'lane')
  assert.equal(g.expectedFamily(`${LIB}git.js`, d), 'none')
  assert.equal(g.expectedFamily(`${LIB}first-setup.js`, d), 'none')
  assert.ok(g.expectedFamily(`${LIB}mystery.js`, d).problem)
  assert.equal(g.expectedFamily('plugins/aether/bin/aether-plan', d), null)
})

test('headerProblems asks for what it is, and in lib/ for the family', (t) => {
  const root = tree(t, {
    'docs/reference/components.md': FAMILIES,
    [`${LIB}lane-calls.js`]: "'use strict'\n\n// The calls of a lane: start, wait, result and stop of one external harness call.\n// Family: lane.\n\nconst x = 1\n",
    [`${LIB}lane-bad.js`]: "'use strict'\n\n// Short.\n\nconst x = 1\n",
    [`${LIB}lane-wrong.js`]: "'use strict'\n\n// The calls of a lane, written down here in full words.\n// Family: spend.\n",
    'plugins/aether/bin/aether-x': "#!/usr/bin/env node\n'use strict'\n\n// aether-x does one thing and calls lib/x.js to do it, nothing else here.\n",
  })
  const declared = g.declaredFamilies(fs.readFileSync(path.join(root, 'docs/reference/components.md'), 'utf8'))
  assert.deepEqual(g.headerProblems(`${LIB}lane-calls.js`, { root, declared }), [])
  assert.ok(g.headerProblems(`${LIB}lane-bad.js`, { root, declared }).length >= 1)
  assert.ok(g.headerProblems(`${LIB}lane-wrong.js`, { root, declared }).some((p) => /Family/.test(p)))
  assert.deepEqual(g.headerProblems('plugins/aether/bin/aether-x', { root, declared }), [])
})

test('citations name numbers that exist', (t) => {
  const root = tree(t, {
    'docs/decisions.md': '## D3. x\n\n| A12 | text | Decided |\n',
    'specs/013-delegate-ladder/spec.md': 'x',
    [`${LIB}a.js`]: '// See A12, D3 and spec 013 (specs/013-delegate-ladder).\nconst x = 1\n',
    [`${LIB}b.js`]: '// See A99, D77, spec 777 and specs/888-none.\nconst A99 = 1\n',
  })
  assert.deepEqual(g.citationsOf('// A12 and spec 013\ncode A5\n').decisions, ['A12'])
  assert.deepEqual(g.citationProblems(`${LIB}a.js`, { root }), [])
  assert.equal(g.citationProblems(`${LIB}b.js`, { root }).length, 4)
})

test('duplicate groups are found by normalized body, name or not, and a different body is not a duplicate', (t) => {
  const root = tree(t, {
    [`${LIB}one.js`]: 'function isObject(value) {\n  // a comment\n  return value !== null && typeof value === "object"\n}\nmodule.exports = { isObject }\n',
    [`${LIB}two.js`]: 'const isPlain = (value) => {\n  return value !== null &&   typeof value === "object"\n}\nmodule.exports = { isPlain }\n',
    [`${LIB}three.js`]: 'function other(value) {\n  return Array.isArray(value) && value.length > 3\n}\nmodule.exports = { other }\n',
  })
  const groups = g.duplicateGroups([`${LIB}one.js`], { root })
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].names.sort(), ['isObject', 'isPlain'])
  assert.deepEqual(g.duplicateGroups([`${LIB}three.js`], { root }), [])
})

test('deadNames finds an unused constant and an unused require, and spares exported and used names', (t) => {
  const root = tree(t, {
    [`${LIB}d.js`]: "const fs = require('node:fs')\nconst { join, sep } = require('node:path')\nconst UNUSED = 1\nconst USED = 2\nfunction exported() { return USED + join('a') }\nmodule.exports = { exported }\n",
  })
  assert.deepEqual(g.deadNames(`${LIB}d.js`, { root }).sort(), ['UNUSED', 'fs', 'sep'])
})

test('the require graph finds a cycle, even one asked for inside a function', (t) => {
  const root = tree(t, {
    [`${LIB}a.js`]: "const b = require('./b.js')\n",
    [`${LIB}b.js`]: "function late() { return require('./a.js') }\n",
    [`${LIB}c.js`]: "const a = require('./a.js')\n",
  })
  const cycles = g.findCycles(g.requireGraph({ root }))
  assert.equal(cycles.length, 1)
  assert.deepEqual([...cycles[0]].sort(), [`${LIB}a.js`, `${LIB}b.js`])
})

test('adapterProblems refuses an adapter that asks for the module that runs it', (t) => {
  const root = tree(t, {
    [`${LIB}harness/ok.js`]: "const s = require('./structured.js')\nconst c = require('../common.js')\n",
    [`${LIB}harness/bad.js`]: "const lanes = require('../lanes.js')\n",
  })
  assert.deepEqual(g.adapterProblems(`${LIB}harness/ok.js`, { root }), [])
  assert.equal(g.adapterProblems(`${LIB}harness/bad.js`, { root }).length, 1)
})

test('moduleFiles lists lib, bin and hooks, and not tests', (t) => {
  const root = tree(t, { [`${LIB}a.js`]: '', [`${LIB}harness/b.js`]: '', 'plugins/aether/bin/aether-x': '', 'plugins/aether/hooks/h.mjs': '', 'plugins/aether/hooks/h.test.ts': '', 'plugins/aether/hooks/hooks.json': '' })
  assert.deepEqual(g.moduleFiles({ root }), [`${LIB}a.js`, `${LIB}harness/b.js`, 'plugins/aether/bin/aether-x', 'plugins/aether/hooks/h.mjs'])
  assert.equal(typeof g.checkGroup, 'function')
})
```

**Acceptance:** `node --test tests/guards-helpers.test.js` pasa; el ayudante no tiene ninguna dependencia fuera de `node:` y `./helpers.js`; ningún `.test.js` nuevo carga `lib/common.js` (no existe aún en la rama del que lo corre sin la tarea 1).

### Task 3: el manifiesto, la tabla de opciones y los patrones retirados

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — quita dos claves del manifiesto y dos filas de la tabla, y arma por concatenación los patrones que las tareas 8, 32, 33 a 37 y 47 buscan
- Area: retire
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `tests/retired-patterns.js`, `tests/retired-options.test.js`, `tests/manifest.test.js`, `tests/superdelegation-gone.test.js`
- Depends on: none
- Serves: R1, R2, R4, R20

**Interfaces:**

- `tests/retired-patterns.js` exporta `GROUPS` (`{ options: RegExp[], journal: RegExp[], leftovers: RegExp[], formats: RegExp[] }`) y `hits(groups, { docs = false } = {}): { file, line, text }[]`. Los patrones son los de la spec, armados con `new RegExp(['\\bCLAUDE_PLUGIN_OPTION_', 'LANES\\b'].join(''))` y similares (ningún fragmento forma un nombre retirado). Grupo `options`: (a) `CLAUDE_PLUGIN_OPTION_LANES`, `AETHER_LANES(?!_CONFIG)`, `lanes-as-on`, `lanes-ignored`, `source:\s*'lanes'`, `given\.lanes`; (b) `CLAUDE_PLUGIN_OPTION_SEATS`, `AETHER_SEATS`, `seats-ignored` y la expresión de perfil `\b(?:seats|AETHER_SEATS|CLAUDE_PLUGIN_OPTION_SEATS|--seats)["']?\s*(?:[:=]|\s)\s*["']?(?:robust|balanced|native)\b`; (c) `AETHER_SUPERDELEGATION_LEGACY`, `LEGACY_NOTES`, `legacyNotes`. Grupo `journal`: `\.router\.json\b`, `router/decisions\.jsonl`, los segmentos `'router', 'decisions.jsonl'`, `journalFile`, `readJournal`, `router-log`. Grupo `leftovers`: `waitForDelegate`, `lineText`, `LANE_NOTES`. Grupo `formats`, medida de R4 para las ramas que el plan nombra, también por concatenación: `new RegExp(['LEGACY_', 'EXCLUDES'].join(''))`, `new RegExp(['LEGACY_', 'HARNESS'].join(''))`, `new RegExp(['haiku', '='].join(''))`, `new RegExp(['jev', '='].join(''))`. `hits` busca en el árbol buscado: `plugins/aether/**`, `tests/**`, `scripts/**` (de `git ls-files`, sin binarios) y, con `docs: true`, también `README.md`, `CLAUDE.md`, `site/**` y `docs/**`; no entra `specs/**`, ni `docs/changelog.md`, ni los archivos de `docs/` que R21 retira (que la tarea 7 borra). `aether-report --seats` (el modo propio del informe, en `bin/aether-report` y `lib/report.js`) no es un acierto: la expresión de `--seats` solo acierta con un perfil dado como valor. Esta tarea no afirma que `hits` dé `[]` sobre el árbol: eso queda en rojo hasta las tareas 33 a 37 y 47, y lo repite la 32.
- `plugin.json` pierde `lanes` y `seats` de `userConfig`. Las claves que quedan, cada una con su lector, son `superdelegation` (`lib/superdelegation.js`), `harnesses` (`lib/session.js`), `ops` (`bin/aether-session-start`), `deadlines` (`lib/session.js`), `quotabrake` (`lib/session.js`), `brakepush` (`lib/session.js`) y `observedev` (`lib/observe.js`). La descripción de `superdelegation` pierde «Replaces the lanes and seats options.»; la de `harnesses` gana, al final, la frase exacta `Codex and Cursor are not tested with a real account.`; `docs/guide/options.md` pierde las filas de las dos opciones y repite esa frase en la fila de `harnesses`. `binDir` y `firstBase` no se tocan. Quién deja de leer cada forma vieja es la tarea de ese archivo (33 a 37), no esta.
- `tests/superdelegation-gone.test.js` lee hoy `manifest.userConfig.seats` (su prueba «the retired seats profiles are not a value of the seats option»): la parte que lee esa clave se borra, porque la clave ya no existe; el resto del archivo no cambia aquí (sus patrones literales los reescribe la tarea 47).

**Tests (write first):** `tests/retired-options.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { GROUPS } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
const READERS = {
  superdelegation: 'plugins/aether/lib/superdelegation.js',
  harnesses: 'plugins/aether/lib/session.js',
  ops: 'plugins/aether/bin/aether-session-start',
  deadlines: 'plugins/aether/lib/session.js',
  quotabrake: 'plugins/aether/lib/session.js',
  brakepush: 'plugins/aether/lib/session.js',
  observedev: 'plugins/aether/lib/observe.js',
}

test('the manifest declares neither retired option, and the option table has no row for them', () => {
  for (const key of ['lan' + 'es', 'sea' + 'ts']) {
    assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8'), new RegExp('^\\| `' + key + '` \\|', 'm'))
  }
  assert.doesNotMatch(manifest.userConfig.superdelegation.description, /Replaces the/)
  assert.deepEqual(Object.keys(manifest.userConfig).sort(), Object.keys(READERS).sort())
})

test('each remaining userConfig key is named by its reader', () => {
  for (const [key, file] of Object.entries(READERS)) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    const env = 'CLAUDE_PLUGIN_OPTION_' + key.toUpperCase()
    assert.ok(text.includes(key) || text.includes(env), `${key} has no reader in ${file}`)
  }
})

test('the formats group exists and is built for the four compatibility branches', () => {
  assert.equal(GROUPS.formats.length, 4)
  for (const pattern of GROUPS.formats) assert.ok(pattern instanceof RegExp)
})

test('codex and cursor are said to be untested with a real account, in the manifest and in the option table', () => {
  const sentence = 'Codex and Cursor are not tested with a real account.'
  assert.ok(manifest.userConfig.harnesses.description.endsWith(sentence))
  assert.ok(fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8').includes(sentence))
})
```

`tests/manifest.test.js` pierde la desestructuración y las dos pruebas de las opciones retiradas; la lista de claves es `superdelegation, harnesses, ops, deadlines, quotabrake, brakepush, observedev`. Ningún otro archivo de prueba cambia aquí.

**Acceptance:** `npm test` en verde; el manifiesto y la tabla de opciones coinciden (la prueba de `docs-facts` sigue en verde, porque las dos cambian juntas); `binDir` y `firstBase` siguen donde están; `GROUPS` tiene `options`, `journal`, `leftovers` y `formats`.

### Task 4: las cifras de Muse y las claves de las cuatro tablas

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — compara cifras que el dueño dejó divergir a propósito y borra tres claves de primer nivel que ningún lector usa
- Area: data
- Owns: `tests/copies-muse.test.js`, `plugins/aether/config/prices.json`, `plugins/aether/config/pairs.json`, `plugins/aether/config/lanes.json`, `plugins/aether/config/models/models.json`
- Depends on: none
- Serves: R9, R12, R18

**Interfaces:** `tests/copies-muse.test.js` es un archivo nuevo. Cubre solo el dato Muse (R9) y el inventario de claves de primer nivel de los cuatro JSON que posee (R18). Las otras copias de C4 son las tareas 38 a 42 y 48, cada una con su prueba, y el resto de los JSON de `config/` es la tarea 49. Cifras de `muse-wonder-full-1.0`, cerradas: el par `muse/muse-wonder-full-1.0@high` de `pairs.json` tiene `intelligence` 53.6, `costPerTaskUsd` null y `ownerDecision` presente; `lanes.json` en `harnesses.muse.models['muse-wonder-full-1.0']` tiene `aa.intelligence` 55.8, `aa.terminalBench` 0.57, `aa.checked` `2026-10-19` y `ownerDecision` presente; `models.json` tiene `profile.price` null y la nota `offered, with no Artificial Analysis entry, so no figures`; `prices.json` no tiene la clave `muse-wonder-full-1.0` (`muse-wonder-1.0` y `muse-spark-1.3` son otros modelos). Esa divergencia queda declarada en la prueba y no se «corrige». Claves de primer nivel que se quedan, con su lector: `prices.json` `basis`, `snapshot`, `per`, `cacheWriteTtl` y `models` las lee `lib/prices.js`, y `sources` la lee `tests/prices.test.js`; `pairs.json` `fetchedAt` y `pairs` las lee `lib/pairs.js`; `lanes.json` `reserve`, `dryMarkMinutes` y `harnesses` las lee `lib/lanes.js`; `models.json` `generatedAt`, `source`, `harnesses`, `since`, `listedOn`, `rules`, `models`, `excluded`, `notOffered`, `withoutFigures`, `superseded` y `outOfScope` las escribe `scripts/build-models-index.js` (el campo `harnesses` es `["claude","agy","grok","muse"]`, el `DEFAULT_HARNESSES` de ese script; la tarea 39 lo compara con la lista de harnesses). Se borran, porque nada las lee: `prices.json` `checked` y `currency` (el de primer nivel; el `checked` de un modelo se queda), y `pairs.json` `source`.

**Tests (write first):** `tests/copies-muse.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
const KEYS = {
  'plugins/aether/config/prices.json': ['basis', 'snapshot', 'per', 'sources', 'cacheWriteTtl', 'models'],
  'plugins/aether/config/pairs.json': ['fetchedAt', 'pairs'],
  'plugins/aether/config/lanes.json': ['reserve', 'dryMarkMinutes', 'harnesses'],
  'plugins/aether/config/models/models.json': ['generatedAt', 'source', 'harnesses', 'since', 'listedOn', 'rules', 'models', 'excluded', 'notOffered', 'withoutFigures', 'superseded', 'outOfScope'],
}
const READER = {
  'plugins/aether/config/prices.json': 'plugins/aether/lib/prices.js',
  'plugins/aether/config/pairs.json': 'plugins/aether/lib/pairs.js',
  'plugins/aether/config/lanes.json': 'plugins/aether/lib/lanes.js',
  'plugins/aether/config/models/models.json': 'scripts/build-models-index.js',
}

test('Muse: the declared figures of muse-wonder-full-1.0 stay as the owner left them', () => {
  const lanes = json('plugins/aether/config/lanes.json').harnesses.muse.models['muse-wonder-full-1.0']
  const pair = json('plugins/aether/config/pairs.json').pairs.find((p) => p.id === 'muse/muse-wonder-full-1.0@high')
  const model = json('plugins/aether/config/models/models.json').withoutFigures.find((m) => m.harness === 'muse' && m.model === 'muse-wonder-full-1.0')
  assert.equal(pair.intelligence, 53.6)
  assert.equal(pair.costPerTaskUsd, null)
  assert.ok(pair.ownerDecision.length > 0)
  assert.equal(lanes.aa.intelligence, 55.8)
  assert.equal(lanes.aa.terminalBench, 0.57)
  assert.equal(lanes.aa.checked, '2026-10-19')
  assert.ok(lanes.ownerDecision.length > 0)
  assert.equal(model.profile.price, null)
  assert.equal(model.note, 'offered, with no Artificial Analysis entry, so no figures')
  assert.equal(json('plugins/aether/config/prices.json').models['muse-wonder-full-1.0'], undefined)
})

test('each top-level key of the four tables is the closed list, and its reader names it', () => {
  for (const [file, keys] of Object.entries(KEYS)) {
    assert.deepEqual(Object.keys(json(file)).sort(), [...keys].sort(), file)
    const reader = fs.readFileSync(path.join(ROOT, READER[file]), 'utf8')
    for (const key of keys) {
      if (file.endsWith('prices.json') && key === 'sources') {
        assert.match(fs.readFileSync(path.join(ROOT, 'tests/prices.test.js'), 'utf8'), /prices\.sources/)
      } else {
        assert.ok(reader.includes(key), `${file} ${key}`)
      }
    }
  }
})
```

`tests/prices.test.js` y `tests/muse-prices.test.js` siguen en verde: no leen `checked` ni `currency` de primer nivel, ni el `source` de `pairs.json`.

**Acceptance:** `node --test tests/copies-muse.test.js tests/muse-prices.test.js tests/pairs.test.js tests/prices.test.js tests/lane-models.test.js` pasa; ninguna otra cifra de los cuatro JSON cambia; `prices.json` no tiene `checked` ni `currency` de primer nivel y `pairs.json` no tiene `source`.

### Task 5: los restos de C6

**Aether:**
- Tier: haiku high — borrados que nombra la spec, con las pruebas que los sostenían y una búsqueda que lo comprueba
- Area: leftovers
- Owns: `plugins/aether/hooks/delegate-wait.mjs`, `tests/delegate-wait.test.js`, `plugins/aether/hooks/panel-layout.mjs`, `tests/panel-layout.test.js`, `plugins/aether/lib/lane-calls.js`, `tests/aether-lane.test.js`, `tests/fixtures/router/**`, `tests/lane-quota.test.js`, `tests/lane-refusal.test.js`, `tests/retired-leftovers.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js` y su grupo `leftovers` los escribe la tarea 3
- Serves: R17, R18

**Interfaces:** `waitForDelegate` sale de `hooks/delegate-wait.mjs` (y con él lo que solo él usaba: `STALL_MS` y `heartbeatText` si nada más los lee); `lineText` sale de `hooks/panel-layout.mjs`; `LANE_NOTES` sale de `lib/lane-calls.js` y de su `module.exports`; `tests/fixtures/router/` (`briefs.json`, `jev-reply.json`) se borra cuando nada de `tests/` los lee; los imports sin uso de `tests/lane-quota.test.js` (`tempDir`, `createAgy`, `readGrokQuota`) y de `tests/lane-refusal.test.js` (`tempDir`) se quitan. `tests/panel-layout.test.js` define su propio ayudante de texto de línea si lo necesitaba; `tests/aether-lane.test.js` compara el texto de la nota con el literal de `buildPrompt` en lugar de con `LANE_NOTES`.

**Tests (write first):** `tests/retired-leftovers.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')

test('waitForDelegate, lineText and LANE_NOTES are not in the searched tree', () => {
  assert.deepEqual(hits(['leftovers']), [])
})

test('the fixtures of the old router are gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'router')), false)
})

test('the two tests that imported what they never used no longer do', () => {
  for (const [file, names] of [['tests/lane-quota.test.js', ['createAgy', 'readGrokQuota', 'tempDir']], ['tests/lane-refusal.test.js', ['tempDir']]]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\/.*$/gm, '')
    for (const name of names) assert.ok((text.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length !== 1, `${file} still imports ${name} without using it`)
  }
})
```

**Acceptance:** `npm test` en verde (las pruebas de `delegate-wait` y de `panel-layout` que solo fijaban lo borrado se van con él; las demás quedan igual); `hits(['leftovers'])` da `[]`.

### Task 6: las rutas personales de las fixtures del panel

**Aether:**
- Tier: haiku high — sustituir una ruta por otra en seis archivos de datos y una prueba de entrada
- Area: privacy
- Owns: `tests/fixtures/panel/*.json`, `plugins/aether/hooks/panel.test.tsx`, `tests/privacy-fixtures.test.js`
- Depends on: none
- Serves: R23

**Interfaces:** cada `path` de `tests/fixtures/panel/quota-*.json` y de las lecturas incrustadas en `hooks/panel.test.tsx` que empieza por la carpeta personal del dueño (`/home/<usuario>/.local/bin/<comando>`) pasa a `/home/user/.local/bin/<comando>`. Nada más cambia en esos archivos.

**Tests (write first):** `tests/privacy-fixtures.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
// The owner's home folder, built from parts so that this file does not contain it.
const PERSONAL = new RegExp('/home/' + 'dark' + 'arty')
const FILES = [...fs.readdirSync(path.join(ROOT, 'tests/fixtures/panel')).map((name) => `tests/fixtures/panel/${name}`), 'plugins/aether/hooks/panel.test.tsx']

test('the panel fixtures hold no path of the owner\'s home folder', () => {
  for (const file of FILES) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), PERSONAL, file)
})
```

**Acceptance:** `node --test tests/privacy-fixtures.test.js tests/panel-view.test.js tests/panel-layout.test.js tests/panel-conformance.test.js` pasa; si la CLI `claude` existe en el entorno, `npm run test:mod` pasa también; si no, la tarea lo dice en su informe.

### Task 7: los docs históricos salen del árbol y las familias quedan escritas

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — repara enlaces, pruebas y citas de unas veinte páginas a la vez, y escribe la tabla de familias de la arquitectura
- Area: docs-remove
- Owns: `docs/handoff/**`, `docs/superpowers/**`, `docs/evaluations/**`, `docs/roadmap/**`, `docs/evidence/**`, `README.md`, `CLAUDE.md`, `docs/*.md`, `docs/guide/*.md`, `docs/reference/components.md`, `site/app.js`, `site/index.html`, `plugins/aether/skills/onboard/SKILL.md`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/docs-facts.test.js`, `tests/harness-lists.test.js`, `tests/launcher.test.js`, `tests/seats-harness.test.js`, `tests/components-docs.test.js`
- Depends on: Task 3 — `docs/guide/options.md` lo cambió la tarea 3, y esta tarea posee `docs/guide/*.md`
- Serves: R16, R21

**Interfaces:** salen del árbol (`git rm -r`) `docs/superpowers/`, `docs/evaluations/`, `docs/roadmap/`, `docs/evidence/`, y los archivos de `docs/handoff/` salvo `2026-10-26-model-effort-policy.md` (el último). Se queda todo lo demás de `docs/` (Assumptions 1 del plan). Cada enlace, cita en código entre comillas inversas, referencia de la prueba y entrada del índice que nombraba un documento retirado se repara: el enlace se quita (el texto queda) o apunta a lo que lo reemplaza; `docs/index.md` pierde la sección «The design record» salvo lo que sigue existiendo (`decisions.md`, `claude-code-research.md`, `aether-retrospective.md`, `models/README.md`, `specs/…`) y los enlaces a `specs/NNN-…/evidence/` del changelog y de `decisions.md` pasan a texto. `docs/changelog.md` solo cambia en esos enlaces. `tests/docs-facts.test.js` pierde de su lista los documentos retirados y su prueba R15 de la entrada del changelog deja de exigir el enlace a un handoff que salió (los encabezados de versión siguen fijando versión y orden); además sus expresiones `GONE` (las de `AETHER_SEATS` y `AETHER_LANES`) se arman por concatenación, para que el archivo no contenga el patrón retirado entero. `tests/seats-harness.test.js` se borra (medía `docs/evaluations/seats/harness`), `tests/launcher.test.js` y `tests/harness-lists.test.js` pierden lo que fijaba esos documentos. `README.md`, `CLAUDE.md` y los textos de `site/` pierden las menciones a lo retirado. `docs/reference/components.md` gana, después de «The pieces», la sección `## Library families` con la tabla `| Family | Prefix | Members | Orchestrator or table |` y la línea `Loose modules (no family): …`, escritas **para la arquitectura final** de este plan (aunque algún archivo aún no exista): `lane` (`lane-`, orquestador `lanes.js`), `router` (`router-`, sin orquestador: `router-marks.js`, `router-pick.js`, `router-quota.js`, `router-renewal.js`, `router-slow.js`), `delegate` (`delegate-`, tabla `ladder.js`), `observe` (`observe.js`), `seat` (`seat-`, `seats.js`), `spend` (`spend-`, `spend.js`, con `spend-archive.js` y `spend-tokens.js`), `plan` (`plan-`, `plan.js`, con `plan-compile.js`), `session` (`session-`, `session.js`, con `session-start.js`), `harness` (`lib/harness/`, `index.js`), y como módulos sueltos `autonomy.js`, `autonomy-command.js`, `baseline.js`, `common.js`, `exam.js`, `first-setup.js`, `git.js`, `globs.js`, `guard.js`, `pairs.js`, `pending.js`, `prices.js`, `quota-refusal.js`, `report.js`, `run.js`, `superdelegation.js`, `voice.js` y `worktrees.js`; `lane-command.js` es un miembro de `lane`. (`autonomy-command.js` queda declarado suelto: su prefijo no es una familia con más miembros.) La sección dice también que `<dataDir>/router/` y `source: 'router'` conservan ese nombre, el mismo de la familia.

**Tests (write first):** `tests/components-docs.test.js` gana:

```js
test('components.md declares the library families, the orchestrator of each and the loose modules (R16)', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'components.md'), 'utf8')
  const section = text.split(/^## /m).find((part) => part.startsWith('Library families'))
  assert.ok(section, 'a section "Library families"')
  assert.match(section, /^\| Family \| Prefix \| Members \| Orchestrator or table \|$/m)
  for (const family of ['lane', 'router', 'delegate', 'observe', 'seat', 'spend', 'plan', 'session', 'harness']) assert.match(section, new RegExp(`^\\| ${family} \\|`, 'm'), family)
  assert.match(section, /^\| router \| `router-` \|.*\| `none` \|/m)
  assert.match(section, /^Loose modules \(no family\):.*`common\.js`/m)
})
```

y `tests/docs-facts.test.js` cambia lo que pinaba los documentos retirados (la lista de enlaces del índice, y la prueba de «la entrada del changelog con su handoff»). Después de la tarea: `git ls-files docs | grep -E "^docs/(handoff|superpowers|evaluations|roadmap|evidence)/"` da solo `docs/handoff/2026-10-26-model-effort-policy.md`.

**Acceptance:** `npm test` en verde (en particular `docs-facts`: enlaces, anclas, páginas enlazadas desde `docs/index.md`, rutas de código entre comillas existentes); ningún archivo fuera de los `Owns` cambia; las carpetas `evidence/` de las specs 006, 008 y 009 y la ruta personal de la 009 ya las quitó el Lead (commit 82194d9); si el árbol aún las tuviera, la tarea lo dice en su informe.

### Task 8: el diario viejo del router no se lee

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — quita un lector del gasto de `/spend` y de `aether-report` y las pruebas que lo pinaban sin dejar la suma de otra fuente cambiada
- Area: retire
- Owns: `plugins/aether/lib/router-log.js`, `plugins/aether/lib/spend.js`, `plugins/aether/lib/delegate-report.js`, `tests/router-log.test.js`, `tests/no-router.test.js`, `tests/router-removed.test.js`, `tests/trim-router.test.js`, `tests/delegate-chain.test.js`, `tests/delegate-log.test.js`, `tests/delegate-report.test.js`, `tests/spend-fixtures.js`, `tests/spend-ladder.test.js`, `tests/spend-prune.test.js`, `tests/spend.test.js`, `tests/retired-journal.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`
- Depends on: Task 36 — `lib/session.js` ya no borra el archivo de sesión viejo, así que la prueba del diario puede exigir que siga en disco, y la tarea 36 ya cambió `tests/trim-router.test.js`
- Serves: R3, R17

**Interfaces:** `lib/router-log.js` se borra; `lib/spend.js` ya no pide `./router-log.js` ni lee `<dataDir>/router/decisions.jsonl` (`readOutcomesIn(journalFile(…))` sale y el gasto de un id es el de las fuentes actuales: `usage/`, `lanes/` y el registro de delegates); `lib/delegate-report.js` ya no pide `readJournal` ni las filas del diario (`rowsOfJournal` sale con lo que solo él usaba). Ningún archivo `.router.json` ni `router/decisions.jsonl` se lee ni se borra. En `tests/spend-prune.test.js`, las dos listas que hacen `delete env[key]` (las de «session start archives a session before it prunes it» y «session start leaves a trace when its prune fails») dejan de contener los literales `'CLAUDE_PLUGIN_OPTION_LANES'` y `'CLAUDE_PLUGIN_OPTION_SEATS'`: cada nombre se arma por concatenación (`'CLAUDE_PLUGIN_OPTION_' + 'LANES'` y `'CLAUDE_PLUGIN_OPTION_' + 'SEATS'`) y el `delete` sigue igual.

**Tests (write first):** `tests/retired-journal.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')
const { tempDir } = require('./helpers.js')
const spend = require('../plugins/aether/lib/spend.js')
const { buildReport } = require('../plugins/aether/lib/delegate-report.js')

const OLD = path.join('router', 'dec' + 'isions.jsonl')

test('the old journal and its reader are not in the searched tree (d)', () => {
  assert.deepEqual(hits(['journal']), [])
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-' + 'log.js')), false)
})

test('an old journal and an old session file on disk change no figure and are not deleted', (t) => {
  const dataDir = tempDir(t)
  fs.mkdirSync(path.join(dataDir, 'router'), { recursive: true })
  const journal = path.join(dataDir, OLD)
  fs.writeFileSync(journal, JSON.stringify({ kind: 'outcome', id: 'x', time: Date.now(), session: 's', model: 'sonnet', tokens: { input: 1e6, output: 1e6 } }) + '\n')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  const stale = path.join(dataDir, 'sessions', 's1.' + 'router' + '.json')
  fs.writeFileSync(stale, '{}')
  const before = spend.summarize ? spend.summarize(dataDir, 's') : null
  assert.deepEqual(buildReport({ dataDir, session: 's' }).delegations ?? [], [])
  assert.ok(fs.existsSync(journal))
  assert.ok(fs.existsSync(stale))
  if (before) assert.deepEqual(spend.summarize(dataDir, 's'), before)
})
```

(la tarea ajusta los nombres de `spend` y de `delegate-report` a lo que esos módulos exportan; lo que se prueba es: con el diario viejo presente, el gasto y el informe son los de las fuentes actuales y los archivos siguen en su sitio.) Las pruebas que solo sostenían el lector (`tests/router-log.test.js` entera, la parte del diario de `tests/trim-router.test.js`, `tests/spend-ladder.test.js` y `tests/spend.test.js` donde sembraban `router/decisions.jsonl` con `tests/spend-fixtures.js`) se borran; `tests/no-router.test.js` y `tests/router-removed.test.js` pierden la entrada `router-log`.

**Acceptance:** `npm test` en verde; `hits(['journal'])` da `[]`.

### Task 9: los comandos que ningún flujo llama

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — hay que decidir verbo por verbo con la lista cerrada de llamadores, leyendo las llamadas que se arman con variables
- Review: xhigh — quitar un verbo que un workflow, un hook o una skill sí llama rompe una corrida entera sin que el árbol lo diga
- Area: commands
- Owns: `plugins/aether/bin/*`, `tests/aether-autonomy.test.js`, `tests/aether-lane.test.js`, `tests/aether-plan.test.js`, `tests/aether-report.test.js`, `tests/aether-wt.test.js`, `tests/observe-bin.test.js`, `tests/spend-bin.test.js`, `tests/start-command.test.js`, `tests/commands.test.js`, `docs/guide/observe.md`, `docs/guide/delegates.md`, `docs/guide/lanes.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `tests/observe-docs.test.js`, `tests/delegate-docs.test.js`, `tests/quota-brake-docs.test.js`, `tests/exam.test.js`, `tests/observe-read.test.js`, `tests/observe-guarantees.test.js`, `tests/observe-corrections.test.js`, `tests/components-docs.test.js`, `plugins/aether/lib/observe-baseline.js`, `tests/observe-baseline.test.js`
- Depends on: Task 34 — `bin/aether-session-start` lo cambió la tarea 34
- Depends on: Task 33 — `tests/aether-report.test.js` lo cambió la tarea 33
- Depends on: Task 5 — `tests/aether-lane.test.js`
- Depends on: Task 7 — las páginas de `docs/guide/` y su índice
- Serves: R19

**Interfaces:** «comando» es cada bin de `plugins/aether/bin/`, cada verbo que un bin expone (la línea `// aether-<bin> <verbo> …` de su cabecera de uso, y cada verbo separado por `|` en esa línea) y `scripts/aether-lead`. Cada uno se conserva solo si lo llama una fuente de la lista cerrada (workflows, `hooks.json`, `hooks/*.js` y `*.mjs`, `skills/**`, `agents/**`, `scripts/`), si es de los que quedan por nombre (`aether-report` entero, `aether-guard`, `aether-session-start`, `aether-observe hook`), o si es `aether-lead`. **Los verbos internos que un verbo conservado lanza en otro proceso** (`aether-lane _runner` y `_seat` los lanzan `start` y `seat-start`; `aether-delegate run` lo lanza `start`; `aether-delegate renew` lo lanza `begin`, porque el arranque llama a `startRenewal` de `lib/router-renewal.js`, que abre otro proceso con `aether-delegate renew`) se conservan solo si ese verbo lanzador está en la misma cabecera de uso y tiene su propio llamador concreto; la prueba los declara en `INTERNAL`, `renew` incluido. Los candidatos que el plan midió sin llamador a la vista se miden igual que el resto, por `concreteCaller`, y salen si ningún archivo de la lista cerrada los nombra: `aether-lane result`, `aether-observe read|baseline|status|forget`, `aether-exam list`, `aether-autonomy brake-crossing`. `aether-delegate verdict --from-scratch` se conserva (lo usa el Lead por sus reglas). Un verbo cuenta como llamado por un arreglo solo si está escrito entre comillas **dentro de un arreglo literal** (`[ … ]`) de un archivo que también nombra el bin; una llamada armada solo con una variable, sin el verbo escrito junto al bin ni dentro de ese arreglo, no cuenta. Un verbo quitado pierde su rama en el bin, su línea de la cabecera de uso y de `USAGE`, y la prueba de la rama; la función de `lib/` que solo él llamaba **no** se borra aquí (la borra el barrido del módulo): se lista en el informe. Las líneas de las páginas de `docs/guide/` y de sus pruebas que nombraban el verbo quitado se corrigen. Quitar `aether-exam list` y `aether-observe read|baseline|status|forget` corrige también las pruebas que los invocan y que esta tarea posee: `tests/exam.test.js`, `tests/observe-bin.test.js`, `tests/observe-read.test.js`, `tests/observe-guarantees.test.js`, `tests/observe-corrections.test.js` y `tests/components-docs.test.js`. `plugins/aether/lib/observe-baseline.js` pierde su único consumidor, la rama `baseline` de `bin/aether-observe` (la llamada a `baseline` de la línea 60); esta tarea posee ese módulo y `tests/observe-baseline.test.js`, no lo borra y lo lista en el informe para el barrido de la tarea 15, que ya depende de esta. Una prueba de esa lista que no invoca el verbo quitado no cambia de sentido.

**Tests (write first):** `tests/commands.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
// Kept by name (R19 b): the whole of aether-report, the hook entry points, and the verb hook of aether-observe.
const BY_NAME = new Set(['aether-report', 'aether-guard', 'aether-session-start', 'aether-observe hook'])
// Internal verbs: launched in a process of their own by a verb that stays (the caller is that verb).
const INTERNAL = { 'aether-lane _runner': 'aether-lane start', 'aether-lane _seat': 'aether-lane seat-start', 'aether-delegate run': 'aether-delegate start', 'aether-delegate renew': 'aether-delegate begin' }

function files(dir, keep) {
  return execFileSync('git', ['ls-files', dir], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && keep(f))
}
const CALLERS = [
  ...files('plugins/aether/workflows', (f) => f.endsWith('.js')),
  ...files('plugins/aether/hooks', (f) => /\.(js|mjs|json)$/.test(f) && !/\.test\./.test(f)),
  ...files('plugins/aether/skills', () => true),
  ...files('plugins/aether/agents', () => true),
  ...files('scripts', () => true),
]
function callerTextOf(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}
const callerText = CALLERS.map(callerTextOf).join('\n')

// One file of the closed list. A verb counts only when that file names it next to its bin, or quoted inside a literal array of verbs in a file that also names the bin.
function concreteCaller(bin, verb) {
  const near = new RegExp(`${bin}[^\\n]{0,80}\\b${verb}\\b`)
  const inArray = new RegExp(`\\[[^\\]]*['"\`]${verb}['"\`][^\\]]*\\]`)
  const namesBin = new RegExp(`\\b${bin}\\b`)
  return CALLERS.find((file) => {
    const text = callerTextOf(file)
    return near.test(text) || (namesBin.test(text) && inArray.test(text))
  })
}

function headerOf(bin, body = fs.readFileSync(path.join(PLUGIN, 'bin', bin), 'utf8')) {
  return body.split('\n').slice(0, 60).join('\n')
}

// `body` is the text of the bin; a test passes a sample text of its own, so that it does not depend on the verbs this task removes from the real file.
function verbsOf(bin, body = fs.readFileSync(path.join(PLUGIN, 'bin', bin), 'utf8')) {
  const token = '[_a-z][a-z-]*'
  const verbs = new Set()
  const dispatch = new Set()
  for (const hit of body.matchAll(new RegExp(`(?:\\bverb\\b|argv\\[0\\])\\s*===\\s*['"\`](${token})['"\`]`, 'g'))) dispatch.add(hit[1])
  // Keys of `const COMMANDS = { … }` only: a word after `{` or `,`, not a word inside a usage string (`|harness:model`).
  for (const table of body.matchAll(/const COMMANDS = \{([^}]*)\}/g)) {
    for (const key of table[1].matchAll(new RegExp(`(?:^|[{,])\\s*(${token})\\s*:`, 'g'))) dispatch.add(key[1])
  }
  for (const line of headerOf(bin, body).split('\n')) {
    const m = line.match(new RegExp(`^//\\s+${bin}\\s+(.*)$`))
    if (!m) continue
    const parts = m[1].split('|')
    const first = parts[0].trim().match(new RegExp(`^(${token})\\b`))
    if (first) verbs.add(first[1])
    for (const part of parts.slice(1)) {
      const verb = part.trim().match(new RegExp(`^(${token})\\b`))
      if (verb && dispatch.has(verb[1])) verbs.add(verb[1])
    }
  }
  for (const verb of dispatch) verbs.add(verb)
  return [...verbs]
}

test('every bin has a caller of the closed list, or is kept by name', () => {
  for (const bin of fs.readdirSync(path.join(PLUGIN, 'bin'))) {
    assert.ok(BY_NAME.has(bin) || new RegExp(`\\b${bin}\\b`).test(callerText), `${bin} has no caller`)
  }
})

test('every verb of every bin has a concrete caller of the closed list, is kept by name, or is internal to a verb that stays', () => {
  for (const bin of fs.readdirSync(path.join(PLUGIN, 'bin'))) {
    if (BY_NAME.has(bin)) continue
    for (const verb of verbsOf(bin)) {
      const name = `${bin} ${verb}`
      if (BY_NAME.has(name)) continue
      if (INTERNAL[name]) {
        const launchVerb = INTERNAL[name].split(' ')[1]
        assert.match(headerOf(bin), new RegExp(`^//\\s+${bin}\\s+${launchVerb}\\b`, 'm'), `${name}: ${launchVerb} is not in the same usage header`)
        assert.ok(concreteCaller(bin, launchVerb), `${name}: ${INTERNAL[name]} has no concrete caller`)
        continue
      }
      assert.ok(concreteCaller(bin, verb), `${name} has no concrete caller`)
    }
  }
})

test('a verb nobody writes next to its bin or in a verb array has no concrete caller', () => {
  assert.equal(concreteCaller('aether-lane', 'no-such-verb'), undefined)
})

test('aether-delegate verdict --from-scratch stays (the Lead uses it by its rules)', () => {
  assert.match(fs.readFileSync(path.join(PLUGIN, 'bin', 'aether-delegate'), 'utf8'), /--from-scratch/)
})

test('scripts/aether-lead stays', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'aether-lead')))
})

test('a pipe-separated usage line yields every verb, crossed with the dispatch branches', () => {
  // A sample text, not the real bin: this task itself removes read, baseline, status and forget from plugins/aether/bin/aether-observe.
  const sample = [
    '// aether-observe hook | read | baseline [--from <dir>] | status | forget [--yes]',
    "if (verb === 'hook') {}",
    "if (verb === 'read') {}",
    "if (verb === 'baseline') {}",
    "if (verb === 'status') {}",
    "if (verb === 'forget') {}",
  ].join('\n')
  assert.deepEqual([...verbsOf('aether-observe', sample)].sort(), ['baseline', 'forget', 'hook', 'read', 'status'])
})
```

**Acceptance:** `npm test` en verde; cada verbo que queda tiene un archivo concreto de la lista cerrada, o es interno de un verbo de la misma cabecera que sí lo tiene; la lista de verbos quitados y la de funciones de `lib/` que quedaron sin llamador están en el informe; ninguna skill, agente, workflow ni hook nombra un verbo que ya no existe.

### Task 10: `choose` filtra por `role` solo cuando se lo pasan

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: opus high — es la función de la que cuelgan todas las llamadas externas; un error manda una llamada a un modelo que no debía recibirla
- Review: xhigh — la elección decide qué CLI externa corre sin avisos de permiso con las credenciales del dueño fuera del entorno
- Area: roles
- Owns: `plugins/aether/lib/superdelegation.js`, `tests/superdelegation.test.js`, `tests/superdelegation-scenarios.test.js`
- Depends on: Task 33 — `lib/superdelegation.js` y `tests/superdelegation.test.js` ya no leen la opción vieja
- Serves: R5, R6

**Interfaces:** `choose({ pairs, reference, harnesses, exclude = [], authors = [], nativeDiffers = false, authorRule = 'bar', role, lanes })` (`lib/superdelegation.js`). `role` y `lanes` son opcionales. `role`, cuando viene, es uno de `implementer`, `supervisor`, `reviewer`, `judge`, `writer`, `examiner`. **Un `role` ausente no lanza** (R6: no se crea un error nuevo): el filtro no se aplica y la elección es la de hoy, aunque `lanes` venga o no. Un valor que no es uno de los seis tampoco lanza: ningún modelo lo permite, `picked` es `null`, `native` es el par nativo y `reason` es exactamente `native <id del nativo>: no external model allows the role <role>` (más los sufijos de autor de hoy, si los hay). Con `role` presente, `lanes` es la tabla cargada (`{ harnesses: { <harness>: { models: { <id>: { roles: string[] } } } } }`); un par externo solo es candidato si `lanes.harnesses[par.harness].models[par.model].roles` incluye `role`; el que no lo cumple, y el que no tiene entrada, quedan con `why: 'role'` (después de `excluded` y antes de `author`) y salen en `candidates` como `outcome: 'passed'`. Si `role` viene y `lanes` no, todo par externo queda con `why: 'role'`. Los pares nativos no se miran. Cuando ningún par externo permite el rol, `picked` es `null` y la razón es la de arriba; si algún externo lo permite y los demás motivos lo dejan fuera, la razón es la de hoy. Esta tarea no cambia ningún llamador. Los siete sitios `choose` (la definición y seis llamadas de los cuatro llamadores) quedan así (las tareas 43 a 46 pasan el argumento):

1. `lib/superdelegation.js` `function choose` — la definición; no impone `role`.
2. `lib/lane-pick.js` `pickCommand`, el `choose` de la decisión del swarm — `role` es el `--role` (`implementer|supervisor|reviewer`); `nativeDiffers` sigue siendo `role !== 'implementer'`; `lanes` es `config`. Tarea 43.
3. `lib/lane-delegate.js` `runLoop`, el `choose` del par fijado — `role` es el `role` de `runLoop` (`implementer` si edita, `reviewer` si solo lee); `nativeDiffers: false`; `lanes` es `ctx.config`. Tarea 44.
4. `lib/lane-delegate.js` `runLoop`, el `choose` de la tabla entera — el mismo `role`; `nativeDiffers: role !== 'implementer'`. Tarea 44.
5. `lib/seats.js` `seatChoice`, el único `choose` — `role` es el nombre del asiento. Lo llaman `reservedPair` como `'judge'`, `reservedPair` como `'writer'` (dos veces) y `chooseSeat` con el asiento pedido; `authorRule: 'reserve'`; `nativeDiffers: seat !== 'writer'`; `lanes` es el `config` de `chooseSeat` (`reservedPair` lo recibe como argumento nuevo). Tarea 45.
6. `lib/router-pick.js` `pairStep`, el `choose` que arma `serving` (línea 88) — no recibe `role` ni `lanes` (Assumptions 10 del plan): omitirlo deja las renovaciones y las esperas como hoy. Tarea 46.
7. `lib/router-pick.js` `pairStep`, el `choose` de la decisión (línea 118) — `role: 'reviewer'` y `lanes: config` (un delegate de solo lectura; Assumptions 3 del plan). Tarea 46.

**Tests (write first):** en `tests/superdelegation.test.js` (se dan los casos nuevos; los viejos que no pasan `role` siguen eligiendo como hoy):

```js
const NATIVE = { id: 'claude/sonnet@high', harness: 'claude', model: 'sonnet', effort: 'high', family: 'claude-sonnet', group: null, intelligence: 50, costPerTaskUsd: 2 }
const EXT = (model, intelligence, cost) => ({ id: `agy/${model}@high`, harness: 'agy', model, effort: 'high', family: 'gemini', group: 'flash', intelligence, costPerTaskUsd: cost })
const VIEWS = { agy: { installed: true, groups: { flash: {} } } }
const TABLE = (roles) => ({ harnesses: { agy: { models: { 'gem-a': { group: 'flash', roles }, 'gem-b': { group: 'flash', roles: ['judge', 'writer', 'examiner'] } } } } })
const call = (role, roles) => choose({ pairs: [NATIVE, EXT('gem-a', 50, 1), EXT('gem-b', 50, 5)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role, lanes: TABLE(roles) })

for (const role of ['implementer', 'supervisor', 'reviewer']) {
  test(`E3 (${role}): a model whose roles list lacks the role is not chosen and gets no call`, () => {
    const others = ['implementer', 'supervisor', 'reviewer'].filter((r) => r !== role)
    const decision = call(role, others)
    assert.equal(decision.picked, null)
    assert.equal(decision.native.id, 'claude/sonnet@high')
    assert.equal(decision.reason, 'native claude/sonnet@high: no external model allows the role ' + role)
    assert.ok(decision.candidates.filter((c) => c.outcome !== 'passed').length === 0)
    assert.equal(decision.candidates.find((c) => c.id === 'agy/gem-a@high').why, 'role')
  })
}
for (const role of ['judge', 'writer', 'examiner']) {
  test(`E3b (${role}): a seat takes no model whose roles list lacks it`, () => {
    const decision = call(role, ['implementer', 'supervisor', 'reviewer'])
    assert.equal(decision.picked.id, 'agy/gem-b@high')
    const none = choose({ pairs: [NATIVE, EXT('gem-a', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role, lanes: TABLE(['implementer']) })
    assert.equal(none.picked, null)
    assert.match(none.reason, new RegExp(`no external model allows the role ${role}$`))
  })
}
test('a model whose list has the role is chosen as before', () => {
  assert.equal(call('implementer', ['implementer']).picked.id, 'agy/gem-a@high')
})
test('a pair with no entry in the lane table has no roles and is not chosen', () => {
  const decision = choose({ pairs: [NATIVE, EXT('unlisted', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role: 'implementer', lanes: TABLE(['implementer']) })
  assert.equal(decision.picked, null)
  assert.equal(decision.candidates.find((c) => c.id === 'agy/unlisted@high').why, 'role')
})
test('a missing role does not throw and does not filter', () => {
  const decision = choose({ pairs: [NATIVE, EXT('gem-a', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, lanes: TABLE(['judge']) })
  assert.equal(decision.picked.id, 'agy/gem-a@high')
  assert.equal(decision.candidates.find((c) => c.id === 'agy/gem-a@high').why, null)
})
test('an unknown role does not throw: the native pair takes the call and the reason names the role', () => {
  const decision = call('nobody', ['implementer'])
  assert.equal(decision.picked, null)
  assert.equal(decision.native.id, 'claude/sonnet@high')
  assert.equal(decision.reason, 'native claude/sonnet@high: no external model allows the role nobody')
})
test('a set role with no lane table excludes every external pair for role', () => {
  const decision = choose({ pairs: [NATIVE, EXT('gem-a', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role: 'implementer' })
  assert.equal(decision.picked, null)
  assert.equal(decision.candidates.find((c) => c.id === 'agy/gem-a@high').why, 'role')
})
```

**Acceptance:** `npm test` en verde; `choose` no lanza por un `role` ausente ni por uno desconocido; `config/lanes.json` no cambia; ningún llamador cambia en esta tarea.

### Task 11: se rompe el ciclo `lanes.js` ↔ `spend.js`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: opus high — es una capa que atraviesa nueve módulos y cuatro bins; un `require` perezoso mal movido cambia cuándo se lee la tabla
- Area: layers
- Owns: `plugins/aether/lib/lanes.js`, `plugins/aether/lib/lane-process.js`, `plugins/aether/lib/spend-tokens.js`, `plugins/aether/lib/spend.js`, `tests/layers.test.js`, `tests/guards-layers.test.js`, `tests/lanes.test.js`
- Depends on: Task 1 — `lib/common.js` (`isObject`, `numberOrZero`, `isExecutableFile`, `sleepSync`)
- Depends on: Task 2 — `tests/guards-helpers.js`
- Depends on: Task 7 — la sección «Library families» de `docs/reference/components.md`
- Depends on: Task 8 — `lib/spend.js` ya no pide `router-log`
- Serves: R14, R7, R8, R15

**Interfaces:** `lib/lane-process.js` (familia `lane`) exporta `commandPath(command, env)`, `commandInstalled(command, env)`, `laneEnv(env, marker)`, `killGroup(pidFile or pid)` y `killMarked(marker)` con los cuerpos de `lanes.js` (los nombres y firmas de hoy); `lib/spend-tokens.js` (familia `spend`) exporta `laneTokens(usage)` con el cuerpo de hoy. `lib/lanes.js` pide ambos y **reexporta** esos seis nombres (`module.exports` los sigue teniendo), de modo que sus llamadores y pruebas no cambian; `lib/spend.js` pide `laneTokens` a `./spend-tokens.js` y no a `./lanes.js`; `lanes.js` sigue pidiendo `./spend.js` y `./spend-archive.js` donde hoy, pero ahora sin ciclo. `lanes.js` sustituye sus copias de `isObject`, `numberOrZero`, `isExecutableFile` y `sleepSync` por las de `./common.js` (reglas 1 a 6 de Global Constraints para `lanes.js`, `lane-process.js`, `spend-tokens.js`).

**Tests (write first):** `tests/layers.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { requireGraph, findCycles } = require('./guards-helpers.js')

test('lib/ has no cycle', () => {
  assert.deepEqual(findCycles(requireGraph({})), [])
})

test('the lane process helpers and the token counter are leaves the orchestrators ask for', () => {
  const graph = requireGraph({})
  const edges = (name) => (graph.get(`plugins/aether/lib/${name}`) || []).map((f) => f.replace('plugins/aether/lib/', ''))
  assert.ok(!edges('spend.js').includes('lanes.js'))
  assert.ok(edges('lanes.js').includes('lane-process.js'))
  assert.deepEqual(edges('lane-process.js').filter((f) => !['common.js', 'run.js'].includes(f)), [])
  assert.deepEqual(edges('spend-tokens.js'), [])
})

test('lanes.js still exposes the process helpers its callers use', () => {
  const lanes = require('../plugins/aether/lib/lanes.js')
  const proc = require('../plugins/aether/lib/lane-process.js')
  for (const name of ['commandPath', 'commandInstalled', 'laneEnv', 'killGroup', 'killMarked']) assert.equal(lanes[name], proc[name], name)
  assert.equal(lanes.laneTokens, require('../plugins/aether/lib/spend-tokens.js').laneTokens)
})
```

`tests/guards-layers.test.js`: `const { checkGroup } = require('./guards-helpers.js')` y `checkGroup('layers', ['plugins/aether/lib/lanes.js', 'plugins/aether/lib/lane-process.js', 'plugins/aether/lib/spend-tokens.js'])`.

**Acceptance:** `npm test` en verde; `tests/layers.test.js` y `tests/guards-layers.test.js` pasan; `lanes.js` conserva sus exportaciones; ningún bin ni hook cambia de comportamiento (el informe da `git diff --stat`).

### Task 12: los bins solo leen argumentos y llaman a `lib/`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — mueve cuatro bloques de lógica a `lib/` sin cambiar una salida; las pruebas de los bins fijan el resultado pero no la forma
- Area: bins
- Owns: `plugins/aether/bin/*`, `plugins/aether/lib/plan-compile.js`, `plugins/aether/lib/session-start.js`, `plugins/aether/lib/autonomy-command.js`, `plugins/aether/lib/lane-command.js`, `tests/bins-thin.test.js`, `tests/guards-bins.test.js`
- Depends on: Task 1 — `lib/common.js` para las lecturas que se muevan
- Depends on: Task 2 — `tests/guards-helpers.js` (`checkGroup`)
- Depends on: Task 7 — la sección «Library families» (la familia de los módulos nuevos)
- Depends on: Task 9 — las ramas de los bins que la tarea 9 deja o quita
- Serves: R13, R7, R8

**Interfaces:** `lib/plan-compile.js` (familia `plan`) exporta `main(argv, { cwd, stdout })` para `check` y `compile` de `aether-plan`, con la lógica de `load`, `compile`, `baselineMessage` y las llamadas a `spawnSync`, `repoPaths`, `currentBranch` y `head` que hoy viven en `bin/aether-plan` (287 líneas); `lib/session-start.js` (familia `session`) exporta `main({ input, env, cwd, stdout })` con lo que hoy hace `bin/aether-session-start`; `lib/autonomy-command.js` y `lib/lane-command.js` (suelto y familia `lane`, respectivamente, como declara la sección «Library families») exportan `main(argv, …)` con el reparto de verbos de `aether-autonomy` y de `aether-lane`. Cada bin queda en: la línea `#!`, `'use strict'`, la cabecera (qué comando es y a qué `lib/` llama), un `require('node:path')`, el `require` de su módulo de `lib/` y una llamada a `main` con `process.argv`/stdin/`process.exit`. Salidas, códigos de salida y mensajes no cambian. `tests/bins-thin.test.js` fija la medida (Assumptions 5 del plan): un bin pide solo `node:path` y archivos de `lib/`; usa `fs` solo para leer su stdin (`readFileSync(0` o `'/dev/stdin'`); no pasa de 160 líneas. Los comentarios de los bins y de los cuatro módulos nuevos siguen las reglas 1 y 2 de Global Constraints (la familia `Family:` va en los de `lib/`).

**Tests (write first):** `tests/bins-thin.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin')
const MAX_LINES = 160

for (const name of fs.readdirSync(BIN)) {
  const text = fs.readFileSync(path.join(BIN, name), 'utf8')
  const code = text.replace(/^\s*\/\/.*$/gm, '')
  test(`${name} only reads arguments and calls lib/`, () => {
    const requires = [...code.matchAll(/require\(([^)]*)\)/g)].map((m) => m[1].trim())
    for (const spec of requires) {
      assert.ok(/^'node:path'$/.test(spec) || /lib/.test(spec), `${name} requires ${spec}`)
    }
    for (const forbidden of ['node:fs', 'node:child_process', 'node:os', 'node:crypto']) assert.ok(!code.includes(`'${forbidden}'`), `${name} requires ${forbidden}`)
    assert.ok(!/\bfs\./.test(code.replace(/readFileSync\((0|'\/dev\/stdin')/g, '')), `${name} uses fs for more than stdin`)
    assert.ok(text.split('\n').length <= MAX_LINES, `${name} has ${text.split('\n').length} lines`)
  })
}
```

(si la tarea 9 deja que un bin necesite `node:fs` para su stdin, la prueba lo admite solo para eso.) `tests/guards-bins.test.js`: `checkGroup('bins', [<cada bin>, 'plugins/aether/lib/plan-compile.js', 'plugins/aether/lib/session-start.js', 'plugins/aether/lib/autonomy-command.js', 'plugins/aether/lib/lane-command.js'])` con la lista de bins que quedan tras la tarea 9.

**Acceptance:** `npm test` en verde (las pruebas de los bins `tests/aether-*.test.js`, `tests/start-command.test.js`, `tests/session-start*.test.js` pasan sin cambiar su sentido); `bin/aether-plan` conserva `binDir` y `firstBase` en lo que emite; el informe da las líneas de cada bin antes y después.

### Task 13: barrido de `worktrees`, `globs`, `git`, `run` y `baseline`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — comentarios que hay que leer contra un archivo de 1285 líneas y cuatro más
- Area: sweep-core
- Owns: `plugins/aether/lib/worktrees.js`, `plugins/aether/lib/globs.js`, `plugins/aether/lib/git.js`, `plugins/aether/lib/run.js`, `plugins/aether/lib/baseline.js`, `tests/guards-wt.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 37 — `lib/run.js` ya no reescribe el formato viejo de exclusiones
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** los módulos de la lista, según las reglas 1 a 6 de Global Constraints. Familias: `worktrees.js`, `git.js`, `globs.js`, `run.js` y `baseline.js` son sueltos (`Family: none.`). `worktrees.js`: `processAlive`, `nulEntries`, `sleepSync` y la copia de `exists` pasan a `common.js`; si la tarea 9 dejó `adoptUnit`, `removeUnit` o `salvageUnit` sin llamador fuera de sus pruebas, se listan en el informe y no se borran. `run.js`: `readJson` es la de `common.js` (reexportada, porque otros la importan de `run.js`).

**Tests (write first):** `tests/guards-wt.test.js`:

```js
const { checkGroup } = require('./guards-helpers.js')
checkGroup('wt', ['plugins/aether/lib/worktrees.js', 'plugins/aether/lib/globs.js', 'plugins/aether/lib/git.js', 'plugins/aether/lib/run.js', 'plugins/aether/lib/baseline.js'])
```

**Acceptance:** `npm test` en verde; el informe lista cada comentario cuyo texto cambió por describir una conducta ya reemplazada y las citas que corrigió.

### Task 14: barrido de `lane-calls`, `lane-work`, `lane-schemas`, `lane-readings` y `lane-order`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — 1633 líneas de comentarios sobre llamadas a CLIs externas
- Area: sweep-lane
- Owns: `plugins/aether/lib/lane-calls.js`, `plugins/aether/lib/lane-work.js`, `plugins/aether/lib/lane-schemas.js`, `plugins/aether/lib/lane-readings.js`, `plugins/aether/lib/lane-order.js`, `tests/guards-lane-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 5 — `LANE_NOTES` salió de `lane-calls.js`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** los módulos de la lista, según las reglas 1 a 6, con `Family: lane.`. Las funciones repetidas que van a `common.js`: `readTextOrEmpty`, `readJsonOrNull`, `sleep`, `killGroup` (`killAgyGroup` es la misma función con otro nombre), `exists`. **`finishedResult` no va a `common.js`: se queda en `lane-calls.js` y se exporta** (su único hogar; la copia de `seat-calls.js` la quita la tarea 27 pidiéndola aquí). **`hasReset` (de `lane-readings.js`) y `loadTable` (de `lane-calls.js`) son los hogares de sus grupos:** se quedan aquí y se exportan; las copias de `router-quota.js` (tarea 19) y de `lane-pick.js` (tarea 24) los piden. Si `aether-lane result` salió (tarea 9) y `result` de `lane-calls.js` solo lo llamaba ese verbo, se lista en el informe.

**Tests (write first):** `tests/guards-lane-1.test.js`: `checkGroup('lane-1', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde; `hasReset`, `loadTable` y `finishedResult` están exportados de su hogar.

### Task 15: barrido de `observe`, `observe-calibrate`, `observe-detect`, `observe-redact` y `observe-baseline`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — módulos que deciden qué se guarda de una sesión; un comentario falso sobre qué se retiene engaña a quien audita la privacidad
- Area: sweep-observe
- Owns: `plugins/aether/lib/observe.js`, `plugins/aether/lib/observe-calibrate.js`, `plugins/aether/lib/observe-detect.js`, `plugins/aether/lib/observe-redact.js`, `plugins/aether/lib/observe-baseline.js`, `tests/guards-observe-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — los verbos `aether-observe read|baseline|status|forget` que la tarea 9 pudo quitar
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6; `observe.js` es el orquestador de la familia `observe` (`Family: observe.`) y los demás llevan `Family: observe.`. `parseJson` sale a `common.js`; `isNumber`, `numberOrZero` también. **`cleanText` de `observe.js` es el hogar del grupo `identifier`/`cleanText`** (la copia de `observe-read.js` la quita la tarea 28). Si la tarea 9 quitó un verbo de `aether-observe` y su función (`status`, `forget`, `baseline`) solo la llamaba él, se lista en el informe. Los comentarios del archivo cumplen R10 de la spec 014 (el modo estándar no lee ni guarda texto de conversación): cada uno que lo afirme se comprueba contra el código.

**Tests (write first):** `tests/guards-observe-1.test.js`: `checkGroup('observe-1', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 16: barrido de `autonomy`, `guard`, `first-setup`, `voice` y `session`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — `guard.js` y `autonomy.js` deciden qué se rechaza; sus comentarios son la documentación de esas reglas
- Area: sweep-core
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/guard.js`, `plugins/aether/lib/first-setup.js`, `plugins/aether/lib/voice.js`, `plugins/aether/lib/session.js`, `tests/guards-core-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 36 — `lib/session.js` ya no borra el archivo de sesión viejo ni nombra las claves viejas de `deadlines`
- Depends on: Task 41 — `lib/session.js` ya comparó los plazos con el manifiesto
- Depends on: Task 40 — `lib/autonomy.js` y `lib/guard.js` ya compararon las clases irreversibles
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6. `Family: none.` (`autonomy.js`, `guard.js`, `first-setup.js`, `voice.js` están declarados sueltos; `session.js` es el orquestador de `session`, `Family: session.`). `isExecutableFile` (en `first-setup.js`) sale a `common.js`. `guard.js` no cambia de comportamiento: su cabecera dice qué rutas protege hoy (specs, planes, tareas, constitución y, mientras exista la regla, la carpeta `docs/superpowers/`; el comentario lo dice como regla que sigue viva aunque la carpeta ya no esté) y qué clases de comando registra, y coincide con `CLASSES` de `autonomy.js`.

**Tests (write first):** `tests/guards-core-1.test.js`: `checkGroup('core-1', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde (`tests/guard.test.js` sin cambios).

### Task 17: barrido de los hooks `register`, `ops-command`, `fault-trace`, `quota-brake` y `spend-view`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — piezas del mod que hacen llamadas sin modelo; los comentarios son su único contrato
- Area: sweep-hooks
- Owns: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/fault-trace.mjs`, `plugins/aether/hooks/quota-brake.mjs`, `plugins/aether/hooks/spend-view.mjs`, `tests/guards-hooks-1.test.js`
- Depends on: Task 1 — la prueba de grupo pide que `tests/guards-helpers.js` y `lib/common.js` existan
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — los verbos de bin que `ops-command.mjs` y `register.js` llaman
- Serves: R7, R8, R18

**Interfaces:** reglas 1, 2, 4, 5 y 6 (no hay familia en `hooks/` y no se importa `lib/`: la regla 3 no se aplica). La cabecera dice qué pieza del mod o del registro de la sesión es. Cada comentario que dice qué comandos corre el mod sin modelo se comprueba contra la lista de `ops-command.mjs` y de lo que `bin/` expone tras la tarea 9.

**Tests (write first):** `tests/guards-hooks-1.test.js`: `checkGroup('hooks-1', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 18: barrido de los hooks `delegate`, `delegate-wait`, `panel-layout` y `panel-view`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — piezas del mod con copias declaradas de la lib
- Area: sweep-hooks
- Owns: `plugins/aether/hooks/delegate.mjs`, `plugins/aether/hooks/delegate-wait.mjs`, `plugins/aether/hooks/panel-layout.mjs`, `plugins/aether/hooks/panel-view.mjs`, `tests/guards-hooks-2.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 35 — `hooks/panel-view.mjs` ya no lee `lanes` como entrada
- Depends on: Task 38 — `hooks/panel-view.mjs` ya comparó la lista de harnesses
- Depends on: Task 5 — `delegate-wait.mjs` y `panel-layout.mjs`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — los verbos de `aether-delegate` que `delegate.mjs` llama
- Serves: R7, R8, R18

**Interfaces:** reglas 1, 2, 4, 5 y 6; no se importa `lib/`. El comentario de `panel-view.mjs` que cuenta cómo el mod copia la lista de harnesses y la regla del interruptor se reescribe para lo que hace hoy (sin la opción `lanes`) y dice que `tests/copies-harness.test.js` y `tests/panel-conformance.test.js` la comparan.

**Tests (write first):** `tests/guards-hooks-2.test.js`: `checkGroup('hooks-2', [<las cuatro rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 19: barrido de los cinco `router-*`, que se quedan

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — comentarios y cabeceras de cinco módulos que se quedan con su nombre; la familia `router` ya está declarada
- Area: sweep-router
- Owns: `plugins/aether/lib/router-marks.js`, `plugins/aether/lib/router-pick.js`, `plugins/aether/lib/router-quota.js`, `plugins/aether/lib/router-renewal.js`, `plugins/aether/lib/router-slow.js`, `tests/guards-router.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la sección «Library families» declara la familia `router`
- Depends on: Task 14 — `hasReset` queda exportado de `lane-readings.js`
- Depends on: Task 46 — `router-pick.js` ya pasa `reviewer` solo en el `choose` de la decisión
- Serves: R7, R8, R15, R16

**Interfaces:** No hay `git mv`. Los cinco archivos siguen llamándose `router-marks.js`, `router-pick.js`, `router-quota.js`, `router-renewal.js` y `router-slow.js`. Se barren aquí según las reglas 1 a 6 de Global Constraints, con la línea `Family: router.`. `<dataDir>/router/` y `source: 'router'` no cambian de nombre, y la cabecera de cada módulo dice que la carpeta se llama así. `hasReset` de `router-quota.js` se pide a `./lane-readings.js`. `writeAtomic` y `pidAlive`, donde la medida de repetidos los señale, se piden a `./common.js`. Ningún `require` se reescribe para apuntar a un `delegate-marks.js` ni a otro nombre nuevo: esos módulos no se crean.

**Tests (write first):** `tests/guards-router.test.js`:

```js
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const test = require('node:test')
const { checkGroup } = require('./guards-helpers.js')

const FIVE = ['marks', 'pick', 'quota', 'renewal', 'slow'].map((part) => `plugins/aether/lib/router-${part}.js`)
checkGroup('router', FIVE)

test('the five router modules stay, and nothing requires a renamed replacement', () => {
  for (const file of FIVE) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', file)), true, file)
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /require\('\.\/delegate-(marks|pick|quota|renewal|slow)'\)/)
  }
})
```

**Acceptance:** `npm test` en verde; los cinco archivos siguen llamándose `router-*`; ningún archivo cambia solo para retargetar un `require` de un módulo renombrado; `<dataDir>/router/` y `source: 'router'` siguen igual.

### Task 20: barrido de los adaptadores `agy`, `codex`, `cursor`, `grok`, `structured` e `index`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — los adaptadores de `codex` y `cursor` no se pueden probar con cuentas reales: el cambio es solo de importación y de comentario, y hay que demostrarlo
- Area: sweep-harness
- Owns: `plugins/aether/lib/harness/agy.js`, `plugins/aether/lib/harness/codex.js`, `plugins/aether/lib/harness/cursor.js`, `plugins/aether/lib/harness/grok.js`, `plugins/aether/lib/harness/structured.js`, `plugins/aether/lib/harness/index.js`, `tests/guards-harness-a.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup` y `adapterProblems`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 11 — `lib/lane-process.js`
- Depends on: Task 38 — `lib/harness/index.js` es la fuente de la lista de harnesses
- Serves: R14, R20, R7, R8, R15

**Interfaces:** cada adaptador pide `commandInstalled` a `../lane-process.js` y no pide `../lanes.js`; `defaultExec` de `agy.js` es la de `structured.js` (el hogar de su grupo); las demás reglas 1 a 6 con `Family: harness.` Las pruebas `tests/harness-agy.test.js`, `-codex.test.js`, `-cursor.test.js`, `-grok.test.js`, `-structured.test.js`, `-index.test.js` pasan **sin cambiar** (R20).

**Tests (write first):** `tests/guards-harness-a.test.js`: `checkGroup('harness-a', [<las seis rutas>])` (incluye `adapterProblems` para cada una).

**Acceptance:** `npm test` en verde; ninguna de las pruebas `tests/harness-*.test.js` aparece en `git diff --stat`.

### Task 21: barrido de `grok-acp`, `grok-quota` y `muse`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — adaptadores con procesos y bloqueos; el cambio es de importación y comentario
- Area: sweep-harness
- Owns: `plugins/aether/lib/harness/grok-acp.js`, `plugins/aether/lib/harness/grok-quota.js`, `plugins/aether/lib/harness/muse.js`, `tests/guards-harness-b.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup` y `adapterProblems`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 11 — `lib/lane-process.js`
- Serves: R14, R7, R8, R15

**Interfaces:** `grok-acp.js` y `grok-quota.js` piden `commandPath`, `laneEnv` y `killMarked` a `../lane-process.js`; `muse.js` pide `commandInstalled` a `../lane-process.js`. `alive` y `sleep` de `grok-quota.js` son `pidAlive` y `sleep` de `../common.js`. Reglas 1 a 6 con `Family: harness.`

**Tests (write first):** `tests/guards-harness-b.test.js`: `checkGroup('harness-b', [<las tres rutas>])`.

**Acceptance:** `npm test` en verde; `tests/grok-acp.test.js`, `tests/grok-quota.test.js`, `tests/harness-muse.test.js` y `tests/muse-*.test.js` no cambian.

### Task 22: barrido de `spend`, `spend-archive`, `report` y `prices`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — de aquí salen las cifras de `/spend` y del informe; un comentario falso sobre qué fuentes se leen engaña al dueño
- Area: sweep-spend
- Owns: `plugins/aether/lib/spend.js`, `plugins/aether/lib/spend-archive.js`, `plugins/aether/lib/report.js`, `plugins/aether/lib/prices.js`, `tests/guards-spend.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 33 — `lib/report.js` ya no lee el harness de legado
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 8 — `lib/spend.js`
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 11 — `lib/spend.js` ya pide `spend-tokens.js`
- Serves: R3, R7, R8, R15

**Interfaces:** reglas 1 a 6; `spend.js` es el orquestador de `spend` (`Family: spend.`) y `spend-archive.js` lleva `Family: spend.`; `report.js` y `prices.js` son sueltos (`Family: none.`). `newestIn` de `spend.js` y `lastWritten` de `report.js` son el mismo cuerpo: una sola definición, en `spend.js`, que `report.js` pide. Las cabeceras de `spend.js`, `report.js` y de `aether-report` dicen qué fuentes lee hoy el gasto (`usage/`, `lanes/`, el registro de delegates) y que ya no lee el diario viejo del router.

**Tests (write first):** `tests/guards-spend.test.js`: `checkGroup('spend', [<las cuatro rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 23: barrido de `plan`, `pairs`, `superdelegation`, `quota-refusal` y `pending`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — `plan.js` y `superdelegation.js` son contratos con el swarm; sus comentarios dicen cómo se lee un plan y cómo se elige un par
- Area: sweep-core
- Owns: `plugins/aether/lib/plan.js`, `plugins/aether/lib/pairs.js`, `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/quota-refusal.js`, `plugins/aether/lib/pending.js`, `tests/guards-core-2.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 10 — `lib/superdelegation.js` ya lleva `role`
- Depends on: Task 42 — `lib/plan.js` ya declaró `DEFAULT_LADDER` como otro dato
- Serves: R4, R7, R8, R15

**Interfaces:** reglas 1 a 6. `plan.js` es el orquestador de `plan` (`Family: plan.`); `pairs.js`, `superdelegation.js`, `quota-refusal.js` y `pending.js` son sueltos. La cabecera de `plan.js` ya no dice que lee «un plan de superpowers más viejo» si ningún código ni prueba lo exige (regla 5: se comprueba con `git grep` de quién escribe ese formato); `DEFAULT_LADDER` y `MAX_AGENTS` son los de hoy. La cabecera de `superdelegation.js` dice la regla de elección con el límite de `roles` (R5, R6) y sus pruebas la fijan. `isNumber`/`isPoints` de `pairs.js` y `superdelegation.js` son `isNumber` de `common.js`.

**Tests (write first):** `tests/guards-core-2.test.js`: `checkGroup('core-2', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde (`tests/plan*.test.js` y `tests/aether-plan.test.js` sin cambiar su sentido).

### Task 24: barrido de `lane-delegate`, `lane-marks`, `lane-pick` y `lane-quota`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — la elección de lanes y la edición de delegates en un worktree: comentarios que describen decisiones de varias specs
- Area: sweep-lane
- Owns: `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/lane-marks.js`, `plugins/aether/lib/lane-pick.js`, `plugins/aether/lib/lane-quota.js`, `tests/guards-lane-2.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 43 — `lane-pick.js` ya pasa el rol de su `choose`
- Depends on: Task 44 — `lane-delegate.js` ya pasa el rol de sus dos `choose`
- Depends on: Task 14 — `loadTable` y `hasReset` ya tienen su hogar en `lane-calls.js` y `lane-readings.js`
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6 con `Family: lane.`; `loadTable` de `lane-pick.js` es la de `lane-calls.js` (la pide), `excludeList` de `lane-pick.js` **se queda como hogar** y se exporta (la copia de `seats.js` la quita la tarea 27); `writeAtomic` de `lane-pick.js` no es un grupo repetido si su cuerpo difiere (la medida decide), `writeAtomic` y `sleep` de `lane-marks.js` son los de `common.js`; `wait` es `sleep`.

**Tests (write first):** `tests/guards-lane-2.test.js`: `checkGroup('lane-2', [<las cuatro rutas>])`.

**Acceptance:** `npm test` en verde; `excludeList` está exportada de `lane-pick.js`.

### Task 25: barrido de `delegate-calls`, `-chain`, `-checks`, `-limits`, `-log` y `-report`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — las seis piezas del registro y de la corrida de los delegates, con comentarios de tres specs
- Area: sweep-delegate
- Owns: `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/delegate-chain.js`, `plugins/aether/lib/delegate-checks.js`, `plugins/aether/lib/delegate-limits.js`, `plugins/aether/lib/delegate-log.js`, `plugins/aether/lib/delegate-report.js`, `tests/guards-delegate-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 8 — `lib/delegate-report.js` ya no lee el diario viejo
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6 con `Family: delegate.`; `delegate-log.js` es el hogar de `isLaunch` (de `delegate-task.js`) y `isAttempt` (de `delegate-report.js`), que son el mismo predicado: una sola definición exportada de `delegate-log.js`; `removeWorktree`, `killGroup`, `readTextOrEmpty`, `nulEntries` de estos módulos son los de `common.js`.

**Tests (write first):** `tests/guards-delegate-1.test.js`: `checkGroup('delegate-1', [<las seis rutas>])`.

**Acceptance:** `npm test` en verde; `isLaunch` está exportado de `delegate-log.js`.

### Task 26: barrido de `delegate-run`, `delegate-task` y `ladder`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — la escalera de delegates, con su decisión y su estado, en archivos de 558 y 350 líneas
- Area: sweep-delegate
- Owns: `plugins/aether/lib/delegate-run.js`, `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/ladder.js`, `tests/guards-delegate-2.test.js`
- Depends on: Task 25 — `isLaunch` queda exportado de `delegate-log.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6; `ladder.js` es la tabla de la familia `delegate` (`Family: delegate.`), lee `config/ladder.json` y ninguna otra fuente; `delegate-run.js` y `delegate-task.js` llevan `Family: delegate.`. `isLaunch` se pide a `delegate-log.js`; `isText`, `messageOf`, `pidAlive`, `sleep` (`realSleep`) son los de `common.js`.

**Tests (write first):** `tests/guards-delegate-2.test.js`: `checkGroup('delegate-2', [<las tres rutas>])`.

**Acceptance:** `npm test` en verde (`tests/ladder.test.js`, `tests/delegate-task.test.js` y `tests/delegate-run.test.js` sin cambiar su sentido).

### Task 27: barrido de `seats`, `seat-calls` y `exam`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — `seats.js` tiene 1110 líneas de comentarios sobre los asientos de diseño
- Area: sweep-seat
- Owns: `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js`, `plugins/aether/lib/exam.js`, `tests/guards-seat.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 45 — `seats.js` ya pasa el nombre del asiento
- Depends on: Task 14 — `finishedResult` queda exportado de `lane-calls.js`
- Depends on: Task 24 — `excludeList` queda exportada de `lane-pick.js`
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6; `seats.js` es el orquestador de `seat` (`Family: seat.`), `seat-calls.js` lleva `Family: seat.` y `exam.js` es suelto (`Family: none.`). `excludeList` de `seats.js` se pide a `lane-pick.js`; `finishedResult` de `seat-calls.js` se pide a `lane-calls.js` (allí se exporta; no hay copia en `common.js`); `removeWorktree`, `killGroup`, `readTextOrEmpty`, `readJsonOrNull` y `sleep` son los de `common.js`. La cabecera de `seats.js` ya no cuenta los perfiles `native`, `balanced` y `robust` ni la opción `seats`.

**Tests (write first):** `tests/guards-seat.test.js`: `checkGroup('seat', [<las tres rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 28: barrido de `observe-dev`, `observe-digest`, `observe-hook` y `observe-read`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — `observe-dev.js` es el único archivo que lee una conversación: su cabecera debe decirlo con exactitud
- Area: sweep-observe
- Owns: `plugins/aether/lib/observe-dev.js`, `plugins/aether/lib/observe-digest.js`, `plugins/aether/lib/observe-hook.js`, `plugins/aether/lib/observe-read.js`, `tests/guards-observe-2.test.js`
- Depends on: Task 15 — `cleanText` queda exportado de `observe.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — los verbos de `aether-observe` que la tarea 9 pudo quitar
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6 con `Family: observe.`; `identifier` de `observe-read.js` es `cleanText` de `observe.js` (el mismo cuerpo); `writeAtomic` de `observe-read.js` es la de `observe-digest.js` o `writeFileAtomic` de `common.js` (la medida decide cuál); `isNumber`, `count` y `tokens` son de `common.js`.

**Tests (write first):** `tests/guards-observe-2.test.js`: `checkGroup('observe-2', [<las cuatro rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 29: las decisiones que ya no son ciertas

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — hay que leer cada decisión contra el código y la decisión que la reemplazó
- Area: docs-truth
- Owns: `docs/decisions.md`, `tests/docs-decisions.test.js`
- Depends on: Task 3 — los nombres retirados que `docs/decisions.md` aún nombra
- Depends on: Task 7 — los enlaces de `docs/decisions.md` a documentos que salieron
- Serves: R22

**Interfaces:** las decisiones D3, D4, D9, D10, A28, A40, A55, A61 y A62 de `docs/decisions.md` dicen lo que es cierto hoy: cada una (su encabezado `## D<n>.` o su fila `| A<n> |`) conserva su texto como historia y añade, al final de su entrada, una línea que empieza por `**Superseded**` o `**Updated**`, con la fecha y una cita (`A<n>`, `D<n>` o `spec <NNN>`) de la decisión que la reemplaza o la corrige, que existe. D3, D4, D9 y D10 (el «Aether Router» y el pase de suscripción, que no se construyeron: los modelos de otros proveedores corren por harnesses) apuntan a la decisión de superdelegación; A28 y A40 (las opciones `lanes` y `seats`) a la que las reemplazó por `superdelegation`; A55 y A62 (el decider de delegates y su `inheritedEffort`) a la escalera de delegates (spec 013); A61 (el Lead en `max`) a lo que dice hoy `lib`/`agents/lead.md` y la política de modelo y esfuerzo (spec 016). Ninguna de las nueve entradas, ni el resto del archivo, contiene un patrón retirado de la spec (el nombre de la opción retirada se escribe «the old lanes option» y no como variable ni como `` `lanes` `` de la tabla).

**Tests (write first):** `tests/docs-decisions.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const TEXT = fs.readFileSync(path.join(__dirname, '..', 'docs', 'decisions.md'), 'utf8')
const entryOf = (id) => {
  const lines = TEXT.split('\n')
  const own = id.startsWith('D')
    ? lines.findIndex((line) => line.startsWith(`## ${id}.`))
    : lines.findIndex((line) => line.startsWith(`| ${id} |`))
  assert.ok(own >= 0, id)
  if (id.startsWith('A')) return lines[own]
  const end = lines.findIndex((line, i) => i > own && line.startsWith('## '))
  return lines.slice(own, end === -1 ? undefined : end).join('\n')
}
const exists = (ref) => (ref.startsWith('D') ? new RegExp(`^## ${ref}\\.`, 'm').test(TEXT) : new RegExp(`^\\| ${ref} \\|`, 'm').test(TEXT))

for (const id of ['D3', 'D4', 'D9', 'D10', 'A28', 'A40', 'A55', 'A61', 'A62']) {
  test(`${id} says it was superseded or updated, and by what that exists`, () => {
    const entry = entryOf(id)
    const m = entry.match(/\*\*(Superseded|Updated)\*\*[^\n]*?\b([AD]\d{1,3}|spec \d{3})\b/)
    assert.ok(m, `${id} has no Superseded/Updated line that cites its replacement`)
    if (/^[AD]/.test(m[2])) assert.ok(exists(m[2]), `${id} cites ${m[2]}, which does not exist`)
    else assert.ok(fs.existsSync(path.join(__dirname, '..', 'specs')) && fs.readdirSync(path.join(__dirname, '..', 'specs')).some((d) => d.startsWith(m[2].slice(5) + '-')), m[2])
  })
}

test('docs/decisions.md names no retired option, journal or legacy variable', () => {
  const found = hits(['options', 'journal'], { docs: true }).filter((hit) => hit.file === 'docs/decisions.md')
  assert.deepEqual(found, [])
})
```

**Acceptance:** `npm test` en verde (`tests/docs-facts.test.js` incluido: el rango de decisiones sigue hasta A93 y los enlaces resuelven).

### Task 30: `CLAUDE.md`, el README, las guías y la referencia dicen lo que el código hace

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — las afirmaciones se verifican contra el código y la configuración vigentes, una por una
- Area: docs-truth
- Owns: `README.md`, `CLAUDE.md`, `docs/reference/components.md`, `docs/guide/*.md`, `tests/docs-claims.test.js`
- Depends on: Task 7 — los enlaces y la sección «Library families»
- Depends on: Task 9 — los comandos y verbos que quedan
- Depends on: Task 10 — cómo elige modelo un rol (R5, R6)
- Depends on: Task 11 — las capas
- Depends on: Task 12 — los bins delgados y los módulos nuevos
- Depends on: Task 41 — `docs/guide/options.md` y `plugin.json` ya los comparó la tarea 41
- Depends on: Task 19 — la familia `router` ya está barrida
- Serves: R20, R22

**Interfaces:** se corrigen las afirmaciones de las clases que R22 nombra, en estos archivos: qué hace el guard y cada bin y verbo (las líneas «Entry and dormancy», «Bins are thin» y «`aether-guard` shapes…» de `CLAUDE.md`, y la tabla de comandos de `docs/reference/components.md`); qué opciones existen y su efecto (`CLAUDE.md` dice hoy que `lanes` y `seats` «stay only as legacy keys»; `docs/getting-started.md` queda para la tarea 31); cómo elige un modelo un rol y el repliegue nativo (`docs/guide/lanes.md`, `docs/guide/delegates.md`, `docs/guide/design-seats.md`, `docs/guide/models-by-role.md`: dicen que un modelo externo solo toma los roles de su lista `roles` y que, si ninguno lo permite, la llamada la toma el par nativo); qué fuentes lee el gasto (`docs/guide/maintenance.md`, `docs/guide/troubleshooting.md` y `CLAUDE.md`: ya no el diario del router); qué familias y capas hay (la arquitectura de `CLAUDE.md` y `components.md`: `lane-process`, `spend-tokens`, `plan-compile`, `session-start`, `autonomy-command`, `lane-command`, `common.js`, y la familia `router` con los nombres que sus archivos tienen hoy); qué harnesses están probados (`docs/guide/lanes.md` y `docs/guide/options.md`: `codex` y `cursor` no están probados con una cuenta real, con la frase `Codex and Cursor are not tested with a real account.`). Toda cita a una decisión o spec nombra una que existe. Cada documento conserva sus anclas y enlaces. Las pruebas de documentos de otras tareas (`tests/lanes-docs.test.js`, `tests/delegates-docs.test.js`, `tests/models-by-role-docs.test.js`) pasan sin cambiar su sentido.

**Tests (write first):** `tests/docs-claims.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const { CLASSES } = require('../plugins/aether/lib/autonomy.js')

test('CLAUDE.md lists exactly the irreversible classes the guard and the grants know', () => {
  const line = read('CLAUDE.md').split('\n').find((l) => l.includes('aether-guard') && l.includes('irreversible'))
  assert.ok(line)
  for (const cls of CLASSES) assert.ok(line.includes(`\`${cls}\``), cls)
})

test('every bin of plugins/aether/bin is named by docs/reference/components.md', () => {
  const text = read('docs/reference/components.md')
  for (const bin of fs.readdirSync(path.join(ROOT, 'plugins/aether/bin'))) assert.ok(text.includes(bin), bin)
})

test('CLAUDE.md no longer says the old options stay as legacy keys, and names the modules the layers added', () => {
  const text = read('CLAUDE.md')
  assert.doesNotMatch(text, /legacy keys/)
  for (const name of ['common.js', 'lane-process.js', 'plan-compile.js']) assert.ok(text.includes(name) || read('docs/reference/components.md').includes(name), name)
})

test('the lanes guide says codex and cursor are not tested with a real account, and that a model only takes the roles of its list', () => {
  const guide = read('docs/guide/lanes.md')
  assert.ok(guide.includes('Codex and Cursor are not tested with a real account.'))
  assert.match(guide, /roles/)
  assert.match(guide, /native/)
})

test('the README, CLAUDE.md, the guides and the reference name no retired option, journal or legacy variable', () => {
  const files = ['README.md', 'CLAUDE.md', 'docs/reference/components.md', ...fs.readdirSync(path.join(ROOT, 'docs/guide')).map((f) => `docs/guide/${f}`)]
  assert.deepEqual(hits(['options', 'journal'], { docs: true }).filter((hit) => files.includes(hit.file)), [])
})
```

**Acceptance:** `npm test` en verde (`docs-facts` incluido); el informe lista cada afirmación que cambió, con el archivo de código que la verifica.

### Task 31: los demás documentos de `docs/` y el texto del sitio dicen lo que el código hace

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — las mismas afirmaciones en los documentos de método y en el sitio
- Area: docs-truth
- Owns: `docs/index.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md`, `docs/contributing.md`, `docs/roadmap.md`, `docs/claude-code-research.md`, `docs/aether-retrospective.md`, `docs/models/README.md`, `site/app.js`, `site/index.html`, `tests/docs-claims-rest.test.js`
- Depends on: Task 7 — los enlaces y el índice
- Depends on: Task 9 — los comandos y verbos que quedan
- Depends on: Task 10 — cómo elige modelo un rol
- Serves: R22

**Interfaces:** `docs/getting-started.md` ya no dice que `lanes` y `seats` existan (la lista de «the plugin's seven options» sigue siendo la del manifiesto), `docs/methodology.md`, `docs/purpose.md`, `docs/contributing.md` y `docs/roadmap.md` no describen lo retirado como vigente y su línea «Now» sigue la versión del manifiesto, y los textos de `site/app.js` y `site/index.html` no afirman nada que el código desmienta (`tests/site.test.js` lo comprueba por sus referencias). `docs/contributing.md` no menciona CI (el plan de la spec lo deja fuera) ni rutas personales (A9).

**Tests (write first):** `tests/docs-claims-rest.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')
const FILES = ['docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/contributing.md', 'docs/roadmap.md', 'docs/claude-code-research.md', 'docs/aether-retrospective.md', 'docs/models/README.md', 'site/app.js', 'site/index.html']

test('none of these documents names a retired option, journal or legacy variable', () => {
  assert.deepEqual(hits(['options', 'journal'], { docs: true }).filter((hit) => FILES.includes(hit.file)), [])
})

test("the getting-started page counts the manifest's options", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
  const count = Object.keys(manifest.userConfig).length
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/getting-started.md'), 'utf8'), new RegExp(`${words[count]} options`))
})

test('the docs index still links every page that remains', () => {
  const index = fs.readFileSync(path.join(ROOT, 'docs/index.md'), 'utf8')
  for (const file of ['getting-started.md', 'purpose.md', 'methodology.md', 'contributing.md', 'changelog.md', 'roadmap.md', 'decisions.md']) assert.ok(index.includes(`(${file})`) || index.includes(`](${file}`), file)
})
```

**Acceptance:** `npm test` en verde (`docs-facts`, `site` y `launcher` incluidos).

### Task 32: las pruebas globales de la limpieza

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — junta las medidas de la spec sobre todo el árbol; no corrige nada ajeno ni deja excepciones
- Area: guards
- Owns: `tests/guards.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `tests/guards-helpers.js`
- Depends on: Task 4 — `tests/copies-muse.test.js` y las cuatro tablas
- Depends on: Task 6 — las fixtures del panel
- Depends on: Task 8 — el diario viejo
- Depends on: Task 11 — las capas
- Depends on: Task 12 — los bins
- Depends on: Task 13 — barrido de `worktrees` y compañeros
- Depends on: Task 14 — barrido de lane 1
- Depends on: Task 15 — barrido de observe 1
- Depends on: Task 16 — barrido de core 1
- Depends on: Task 17 — barrido de hooks 1
- Depends on: Task 18 — barrido de hooks 2
- Depends on: Task 19 — barrido de los cinco `router-*`
- Depends on: Task 20 — adaptadores a
- Depends on: Task 21 — adaptadores b
- Depends on: Task 22 — barrido de spend
- Depends on: Task 23 — barrido de core 2
- Depends on: Task 24 — barrido de lane 2
- Depends on: Task 25 — barrido de delegate 1
- Depends on: Task 26 — barrido de delegate 2
- Depends on: Task 27 — barrido de seat
- Depends on: Task 28 — barrido de observe 2
- Depends on: Task 29 — las decisiones
- Depends on: Task 30 — las guías y la referencia
- Depends on: Task 31 — los demás documentos
- Depends on: Task 47 — las pruebas que nadie más posee
- Depends on: Task 48 — la frase de los intentos del swarm
- Depends on: Task 49 — las claves de las demás tablas de `config/`
- Serves: R7, R8, R14, R15, R16, R17, R18, R23, R24, R4

**Interfaces:** `tests/guards.test.js` aplica las medidas de `tests/guards-helpers.js` a **todo** el árbol (no a un grupo) y añade las búsquedas de la spec que no son de un grupo. **Esta tarea solo posee `tests/guards.test.js` y no corrige nada ajeno ni deja excepciones** (`EXEMPT_GROUPS` queda vacío): si una prueba suya falla por un archivo que posee otra tarea (un helper repetido que un barrido dejó, un nombre muerto, una rama de formato viejo, una clave de configuración sin lector), la tarea no lo cambia: termina bloqueada y su informe da, por cada fallo, la medida, el archivo y la tarea cuyo `Owns` lo incluye (la de la lista de `Depends on` que lo toca); el Lead devuelve el fallo a esa tarea y relanza esta.

**Tests (write first):** `tests/guards.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const g = require('./guards-helpers.js')
const { hits } = require('./retired-patterns.js')

const ROOT = g.ROOT
const FILES = g.moduleFiles({})
const LIB = FILES.filter((f) => f.startsWith('plugins/aether/lib/'))
const declared = g.declaredFamilies(fs.readFileSync(path.join(ROOT, 'docs/reference/components.md'), 'utf8'))
const tracked = (...dirs) => execFileSync('git', ['ls-files', '-z', ...dirs], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)

test('R7 and R8: every module of the closed list says what it is and, in lib/, its family', () => {
  assert.deepEqual(FILES.flatMap((f) => g.headerProblems(f, { declared })), [])
})

test('R7: every decision and spec cited in a comment exists', () => {
  assert.deepEqual(FILES.flatMap((f) => g.citationProblems(f, {})), [])
})

test('R14: lib/ has no cycle and no adapter asks for the module that runs it', () => {
  assert.deepEqual(g.findCycles(g.requireGraph({})), [])
  assert.deepEqual(LIB.filter((f) => f.includes('/harness/')).flatMap((f) => g.adapterProblems(f, {})), [])
})

test('R15: no helper is defined twice in lib/, and no exemption is left', () => {
  assert.deepEqual(g.EXEMPT_GROUPS, [])
  assert.deepEqual(g.duplicateGroups(LIB, {}), [])
})

test('R18: nothing defined or required is left unused', () => {
  const dead = FILES.flatMap((f) => g.deadNames(f, {}).map((name) => `${f}: ${name}`))
  assert.deepEqual(dead, [])
})

test('R16: every file of lib/ is in a declared family of the scheme or declared loose, and each orchestrator exists', () => {
  const names = LIB.map((f) => path.basename(f))
  for (const f of LIB) {
    const family = g.expectedFamily(f, declared)
    assert.ok(typeof family === 'string', `${f}: ${family && family.problem}`)
    assert.ok(family === 'none' || family === 'harness' || declared.families.has(family), `${f}: the family ${family} is not declared in components.md`)
  }
  for (const [family, { orchestrator }] of declared.families) {
    if (orchestrator && orchestrator !== 'none') assert.ok(names.includes(orchestrator), `${family}: ${orchestrator} is not in lib/`)
    if (family !== 'harness') for (const name of names) if (name.startsWith(`${family}-`)) assert.ok(!declared.loose.has(name), `${name} is both in the ${family} family and declared loose`)
  }
})

test('R17, R4 and C1: no retired name, journal, leftover or compatibility branch is in the searched tree, with the documents that remain', () => {
  assert.deepEqual(hits(['options', 'journal', 'leftovers', 'formats'], { docs: true }), [])
})

test('R18: every top-level key of every config JSON is read by a file of the plugin, the scripts or the tests', () => {
  const readers = tracked('plugins/aether/lib', 'plugins/aether/bin', 'plugins/aether/hooks', 'plugins/aether/workflows', 'scripts', 'tests')
    .filter((f) => !f.endsWith('.json') && !/\.(png|jpe?g|gif|webp|ico)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n')
  const unread = []
  for (const file of tracked('plugins/aether/config').filter((f) => f.endsWith('.json'))) {
    for (const key of Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')))) {
      if (!new RegExp(`\\b${key}\\b`).test(readers)) unread.push(`${file}: ${key}`)
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
  for (const key of Object.keys(manifest.userConfig)) {
    if (!readers.includes('CLAUDE_PLUGIN_OPTION_' + key.toUpperCase()) && !new RegExp(`\\b${key}\\b`).test(readers)) unread.push(`plugin.json userConfig: ${key}`)
  }
  assert.deepEqual(unread, [])
})

test('R23: no tracked file holds the owner\'s home folder or email', () => {
  const personal = [new RegExp('/home/' + 'dark' + 'arty'), new RegExp('christopher\\.hdez\\.10' + '@' + 'gmail')]
  const found = []
  for (const file of tracked()) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz)$/i.test(file) || !fs.existsSync(path.join(ROOT, file))) continue
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const pattern of personal) if (pattern.test(text)) found.push(file)
  }
  assert.deepEqual(found, [])
})

test('R21: the retired document folders are gone and the last handoff stays', () => {
  const docs = tracked('docs')
  assert.deepEqual(docs.filter((f) => /^docs\/(superpowers|evaluations|roadmap|evidence)\//.test(f)), [])
  assert.deepEqual(docs.filter((f) => f.startsWith('docs/handoff/')), ['docs/handoff/2026-10-26-model-effort-policy.md'])
  assert.deepEqual(tracked('specs').filter((f) => /\/evidence\//.test(f)), [])
})
```

**Acceptance:** `npm test` en verde; el informe da, por cada prueba, cuántos archivos revisó; si una prueba falla por un archivo de otra tarea, la tarea termina bloqueada con el informe del archivo y de la tarea dueña (no deja excepciones, no edita ese archivo). El Lead corre `npm run check` después de fusionar (R24).

### Task 33: `resolveOption` deja de leer las opciones viejas, y `report.js` pierde el legado

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — dos reglas cambian y las cifras de las pruebas del informe no pueden moverse
- Area: retire-options
- Owns: `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/report.js`, `tests/superdelegation.test.js`, `tests/report.test.js`, `tests/aether-report.test.js`, `tests/delegate-settings.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`
- Depends on: Task 34 — `bin/aether-session-start` ya no pide `legacy` ni `legacyNotes`
- Depends on: Task 36 — `tests/delegate-settings.test.js` ya lo cambió la tarea 36
- Serves: R1, R4

**Interfaces:** `resolveOption(env)` (`lib/superdelegation.js`) lee solo `CLAUDE_PLUGIN_OPTION_SUPERDELEGATION` y devuelve `{ on: boolean, source: 'superdelegation' | 'default' }`: `on` es verdadero solo con `'true'`; `'false'`, vacío o ausente es `false`. Sin campo `legacy`. `LEGACY_NOTES` y `legacyNotes` salen del módulo y de su `module.exports`. `lib/report.js`: `superdelegationOf(env)` devuelve `{ on: true | false | null }` (`on` de `AETHER_SUPERDELEGATION`), sin `legacy` y sin leer `AETHER_SUPERDELEGATION_LEGACY`; `LEGACY_HARNESS` sale: una llamada del registro de lanes, o una lectura, que no nombra `harness` queda fuera de las cifras por harness (`quotaByHarness`, `byHarness`, `versionsOf`) en lugar de contarse como `agy` (Assumptions 11 del plan). `resolveOption` lo sigue usando `lib/session.js` (`delegateSettingsFrom`, solo `.on`): ese archivo no cambia aquí. Las pruebas que sembraban una llamada o una lectura sin `harness` para contarla como `agy` le ponen `harness: 'agy'` y **ninguna cifra cambia**: en `tests/report.test.js`, la llamada `task-3-1-supervise` de «report splits the lane calls by harness…» y la lectura `reading(1, { version: '1.2.0' })` de «a lane reading that names no harness is agy's…» (esa prueba cambia de título: la lectura nombra `agy`). En `tests/aether-report.test.js` la prueba que pasaba `AETHER_SUPERDELEGATION_LEGACY` y miraba `superdelegation.legacy.length` pierde esa variable y esa afirmación. En `tests/delegate-settings.test.js` la prueba «with the legacy lanes option still read» pasa a «the old lanes option counts as nothing».

**Tests (write first):**

`tests/superdelegation.test.js` (reemplaza las pruebas de `resolveOption` y de `legacyNotes`; el `require` de la línea 5 pierde `legacyNotes`):

```js
const OLD_LANES = 'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'
const OLD_SEATS = 'CLAUDE_PLUGIN_OPTION_' + 'SEA' + 'TS'

test('resolveOption reads only the superdelegation option', () => {
  assert.deepEqual(resolveOption({}), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: '' }), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }), { on: true, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false' }), { on: false, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ [OLD_LANES]: 'true', [OLD_SEATS]: 'robust' }), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', [OLD_LANES]: 'true' }), { on: false, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', [OLD_SEATS]: 'robust' }), { on: true, source: 'superdelegation' })
})

test('the notes about the old options are gone from the module', () => {
  assert.equal(require('../plugins/aether/lib/superdelegation.js')['legacy' + 'Notes'], undefined)
})
```

`tests/delegate-settings.test.js`:

```js
test('the superdelegation option decides the switch, and the old lanes option counts as nothing', () => {
  const settings = (env) => session.delegateSettingsFrom(env)
  assert.equal(settings({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }).lanes, true)
  assert.equal(settings({ ['CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES']: 'true' }).lanes, false, 'the old lanes option does not turn the switch on')
  assert.equal(settings({}).lanes, false)
})
```

`tests/report.test.js` (reemplaza «the report repeats what the session ignored or read as on»):

```js
test('the report says whether superdelegation was on, and nothing about old options', (t) => {
  const { repo, args } = finishedRun(t)
  const read = (env) => report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false, env }).superdelegation
  assert.deepEqual(read({ AETHER_SUPERDELEGATION: 'on' }), { on: true })
  assert.deepEqual(read({ AETHER_SUPERDELEGATION: 'off' }), { on: false })
  assert.deepEqual(read({}), { on: null })
})

test('a lane call or reading that names no harness is counted by no harness', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  const before = report(repo.dir, args.runId, { dataDir, tests: false })
  appendLog(dataDir, 'run-session', { kind: 'call', time: T0 + 40 * MIN, startedAt: T0 + 39 * MIN, session: 'run-session', run: args.runId, design: null, role: 'implementer', task: 'task-9', model: HAIKU, group: 'gemini', effort: 'high', durationMs: MIN, usage: { input: 0, output: 1e6, thinking: 0, cacheRead: 0, total: 1e6 }, conversation: 'c', quotaBefore: null, quotaAfter: null, detail: '', call: 'task-9-1-implement', status: 'ok' })
  appendLog(dataDir, 'run-session', { kind: 'reading', time: T0 + 41 * MIN, run: args.runId, design: null, groups: {}, version: '9.9.9' })
  const after = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(after.lanes.run.byHarness, before.lanes.run.byHarness)
  assert.deepEqual(after.lanes.versions, before.lanes.versions)
  assert.deepEqual(after.radar.delegation.quotaByHarness, before.radar.delegation.quotaByHarness)
})
```

**Acceptance:** `npm test` en verde; `hits(['options'])` y `hits(['formats'])` no dan ningún acierto en `lib/superdelegation.js`, `lib/report.js` ni en las cuatro pruebas que la tarea posee; el informe dice qué otros archivos (fuera de sus `Owns`) siguen nombrando la forma vieja, para la tarea 47.

### Task 34: `aether-session-start` ya no escribe la línea de legado

**Aether:**
- Tier: haiku high — dos bloques que se quitan del bin y las líneas de prueba que los fijaban
- Area: retire-options
- Owns: `plugins/aether/bin/aether-session-start`, `tests/session-start.test.js`, `tests/quota-brake-settings.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`
- Depends on: Task 36 — `tests/session-start.test.js` ya lo cambió la tarea 36 (el archivo `.router.json`)
- Serves: R1

**Interfaces:** `passSuperdelegation` del bin escribe en `CLAUDE_ENV_FILE` exactamente `export AETHER_SUPERDELEGATION=<on|off>\nexport AETHER_LANE_HARNESSES=<lista>\n` (sin la línea de legado); `resolveOption(process.env).on` es lo único que usa. `legacyContext` y su uso en el contexto que el bin imprime salen. El bin no pide `legacyNotes`. Cada prueba que miraba el texto del archivo de entorno (`tests/session-start.test.js` líneas 179, 192, 203, 213, 228 y 244, y `tests/quota-brake-settings.test.js` línea 81) pierde `export AETHER_SUPERDELEGATION_LEGACY=…\n`; la que daba `lanes-as-on,seats-ignored` pasa a la prueba de abajo.

**Tests (write first):** en `tests/session-start.test.js`:

```js
const OLD_LANES = 'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'
const OLD_SEATS = 'CLAUDE_PLUGIN_OPTION_' + 'SEA' + 'TS'

test('the environment file has the switch and the harness list, and no line about old options', (t) => {
  const on = exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', CLAUDE_PLUGIN_OPTION_HARNESSES: 'agy' })
  assert.equal(on.text, 'export AETHER_SUPERDELEGATION=on\nexport AETHER_LANE_HARNESSES=agy\n')
  const off = exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', [OLD_LANES]: 'true', [OLD_SEATS]: 'robust' })
  assert.equal(off.text, 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n')
})

test('an old lanes or seats option changes nothing and the start says nothing about it', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { [OLD_LANES]: 'true', [OLD_SEATS]: 'robust' } })
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /counts as on|is ignored|no longer exists/)
})
```

**Acceptance:** `npm test` en verde; `hits(['options'])` no da ningún acierto en `bin/aether-session-start`, `tests/session-start.test.js` ni `tests/quota-brake-settings.test.js`.

### Task 35: `settingsOf` del mod ignora `lanes` como entrada

**Aether:**
- Tier: haiku high — una expresión del mod y las pruebas que la comparan con la de la lib
- Area: retire-mod
- Owns: `plugins/aether/hooks/panel-view.mjs`, `tests/panel-view.test.js`, `tests/panel-conformance.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`
- Serves: R1

**Interfaces:** en `settingsOf(options)` de `hooks/panel-view.mjs`, el interruptor es `String(given.superdelegation) === 'true'`: ninguna otra opción lo reemplaza (`given.lanes` sale). La salida sigue siendo `{ lanes: boolean, harnesses: string[] }` (el campo `lanes` es el interruptor resuelto, mostrado como superdelegación). El comentario de la función deja de decir que la opción vieja `lanes` sustituye a una `superdelegation` sin fijar (la tarea 18 revisa el resto del comentario). Es la misma regla que `resolveOption` (tarea 33), y `tests/panel-conformance.test.js` las compara.

**Tests (write first):** en `tests/panel-view.test.js` (reemplaza la prueba «the switch is on with superdelegation true, or with lanes true and superdelegation not set…» y la afirmación de la línea 94, que pasa a la forma concatenada):

```js
const OLD_LANES = 'lan' + 'es'
const OLD_SEATS = 'sea' + 'ts'

test('the switch is on with superdelegation true and off otherwise: no other option stands in for it', () => {
  for (const superdelegation of [true, 'true']) assert.equal(view.settingsOf({ superdelegation }).lanes, true, String(superdelegation))
  for (const value of [false, 'false', 'on', 1, undefined, null, '']) assert.equal(view.settingsOf({ superdelegation: value }).lanes, false, String(value))
  assert.equal(view.settingsOf({ [OLD_LANES]: true }).lanes, false)
  assert.equal(view.settingsOf({ superdelegation: false, [OLD_LANES]: true }).lanes, false)
  assert.equal(view.settingsOf({ superdelegation: true, [OLD_LANES]: false }).lanes, true)
})

test('the old seats option is not a setting', () => {
  assert.ok(!(OLD_SEATS in view.settingsOf({ [OLD_SEATS]: 'rob' + 'ust' })))
})
```

y en `tests/panel-conformance.test.js` la prueba «the switch the panel shows is the one the delegate settings hold…» (líneas 33 a 40) pasa a recorrer solo los valores de `superdelegation` (los nombres de módulo son los que el archivo ya usa para `view` y para `lib/session.js`):

```js
test('the switch the panel shows is the one the delegate settings hold, for every value of superdelegation', () => {
  for (const sd of [undefined, 'true', 'false', '', 'on', 'TRUE', 'yes']) {
    const used = session.delegateSettingsFrom(sd === undefined ? {} : { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: sd })
    assert.equal(view.settingsOf(sd === undefined ? {} : { superdelegation: sd }).lanes, used.lanes, `superdelegation ${JSON.stringify(sd)}`)
  }
})
```

(la prueba de la línea 57 a 63, que cruzaba `superdelegation`, el valor viejo y `harnesses`, pierde el valor viejo.) El comentario de la cabecera de `tests/panel-conformance.test.js` deja de nombrar la opción vieja.

**Acceptance:** `npm test` en verde (`tests/panel-view.test.js`, `tests/panel-conformance.test.js`, `tests/panel-layout.test.js`); `hits(['options'])` no da ningún acierto en `hooks/panel-view.mjs` ni en las dos pruebas; si la CLI `claude` existe, `npm run test:mod` pasa.

### Task 36: `session.js` ya no borra `.router.json` ni nombra `haiku=`/`jev=`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — quita dos borrados de archivos del dueño y una rama de lectura, y reescribe cuatro pruebas que fijaban las dos
- Area: retire-session
- Owns: `plugins/aether/lib/session.js`, `tests/session.test.js`, `tests/session-start.test.js`, `tests/trim-router.test.js`, `tests/delegate-settings.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`
- Serves: R3, R4

**Interfaces:** `markSession` ya no borra `<id>.router.json` (la línea final de `markSession` sale y su comentario deja de decirlo); `pruneSessions` ya no borra `<id>.router.json` de una sesión que envejeció: un archivo así que alguien tenga en disco queda donde está, como pide R3. `parseDeadlines` sigue leyendo solo `quota=` (hoy `DEADLINE_KEYS` ya solo tiene `quota`: una clave que no es `quota` se ignora como cualquier otra desconocida) y sus comentarios (el de `parseDeadlines` y el de `delegateSettingsFrom`) dejan de nombrar `haiku=` y `jev=`: dicen que cualquier clave distinta de `quota` se ignora. Las pruebas que fijaban el borrado se reescriben así: `tests/session.test.js` «markSession removes any stale router file…», `tests/session-start.test.js` «session start takes away the router file an older version left…» y `tests/trim-router.test.js` «pruneSessions removes the delegate file and an old router file…» pasan a comprobar que el archivo viejo **sigue en disco**; `tests/delegate-settings.test.js`, `tests/session-start.test.js` y `tests/trim-router.test.js` cambian los valores `haiku=5,jev=3,quota=2` por `other=5,quota=2`, y la prueba «…haiku= and jev= alone change nothing» de `tests/delegate-settings.test.js` pasa a «a key other than quota alone changes nothing» con `'other=5,another=2'` en lugar de `'haiku=5,jev=2'`. Los literales `s1.router.json` que solo comprobaban que no existía se quitan o se arman con `'.' + 'router' + '.json'`.

**Tests (write first):** en `tests/session.test.js` (reemplaza la prueba del borrado):

```js
const OLD_FILE = (id) => id + '.' + 'router' + '.json'

test('markSession leaves a router file an older version wrote where it is', (t) => {
  const data = tempDir(t)
  markSession(data, 's1', 1)
  const stale = path.join(data, 'sessions', OLD_FILE('s1'))
  fs.writeFileSync(stale, '{}')
  markSession(data, 's1', 2)
  assert.equal(fs.existsSync(stale), true)
})

test('pruneSessions leaves a router file of an older version, and removes the files it still knows', (t) => {
  const data = tempDir(t)
  markSession(data, 'old', 1, { delegate: { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } } })
  fs.writeFileSync(path.join(data, 'sessions', OLD_FILE('old')), '{}')
  const past = new Date(Date.now() - 40 * 24 * 3600 * 1000)
  fs.utimesSync(markerFile(data, 'old'), past, past)
  assert.deepEqual(pruneSessions(data, { days: 30 }), ['old'])
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')), [OLD_FILE('old')])
})

test('parseDeadlines reads quota and ignores every other key', () => {
  assert.equal(parseDeadlines('other=5,quota=2').quotaMs, 2000)
  assert.equal(parseDeadlines('other=5,another=2').quotaMs, 3000)
})
```

(`pruneSessions`, `markerFile` y `parseDeadlines` ya los exporta `lib/session.js`; la prueba usa los nombres con que el archivo ya los importa.)

**Acceptance:** `npm test` en verde; `hits(['journal', 'formats'])` no da ningún acierto en `lib/session.js` ni en las cinco pruebas que la tarea posee (salvo lo que la tarea 8 aún cambia en `tests/trim-router.test.js`: el diario viejo).

### Task 37: `run.js` ya no reescribe `LEGACY_EXCLUDES`

**Aether:**
- Tier: haiku high — una constante y una línea de `map`, y la prueba que fijaba el reescrito
- Area: retire-excludes
- Owns: `plugins/aether/lib/run.js`, `tests/run.test.js`, `tests/retired-excludes.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`
- Serves: R4

**Interfaces:** `ensureExcluded(gitCommonDir)` de `lib/run.js` deja de reescribir las líneas sin ancla que escribían versiones viejas (`LEGACY_EXCLUDES` y el `map` que la usa salen): conserva cada línea que encuentra tal cual y añade al final las que faltan de `EXCLUDES` (`/.aether/`, `/.aether-tmp/`, `/.aether-exam/`), una vez. La prueba «ensureExcluded anchors the unanchored patterns that earlier versions wrote» de `tests/run.test.js` se borra y se reemplaza por la de abajo.

**Tests (write first):** `tests/retired-excludes.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { ensureExcluded } = require('../plugins/aether/lib/run.js')
const { hits } = require('./retired-patterns.js')

test('an unanchored line an earlier version wrote is kept as it is, and the anchored ones are added after it', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'info'))
  fs.writeFileSync(path.join(dir, 'info', 'exclude'), 'node_modules\n.aether/\n.aether-tmp/\n')
  ensureExcluded(dir)
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), 'node_modules\n.aether/\n.aether-tmp/\n/.aether/\n/.aether-tmp/\n/.aether-exam/\n')
})

test('the compatibility branch for the old exclude lines is not in lib/run.js', () => {
  assert.deepEqual(hits(['formats']).filter((hit) => hit.file === 'plugins/aether/lib/run.js'), [])
})
```

**Acceptance:** `npm test` en verde (`tests/run.test.js`: las dos pruebas de `ensureExcluded` que quedan pasan sin cambiar).

### Task 38: la lista de harnesses del código, copia por copia

**Aether:**
- Tier: haiku high — una fuente y tres copias, cada una con su lector escrito en la prueba
- Area: copies-harness
- Owns: `tests/copies-harness.test.js`, `plugins/aether/hooks/panel-view.mjs`
- Depends on: Task 35 — `hooks/panel-view.mjs` lo cambió la tarea 35
- Serves: R11, R12

**Interfaces:** dato: los nombres de harness. **Fuente:** `HARNESS_NAMES` de `lib/harness/index.js` (`agy`, `codex`, `grok`, `cursor`, `muse`). **Copias, cada una con su lector:** (1) `export const HARNESS_NAMES = [...]` de `hooks/panel-view.mjs`, leída con una expresión regular sobre el texto (el mod no importa `lib/`); la corrige esta tarea si diverge; (2) `const NAMES = [...]` de `plugins/aether/hooks/panel.test.tsx` (la posee la tarea 6: si diverge, el informe lo dice y nombra esa tarea); (3) `const NAMES = [...]` de `tests/panel-layout.test.js` (la posee la tarea 5: ídem). Hoy las tres son iguales a la fuente y a su orden. La prueba no cambia ninguna copia que no posea.

**Tests (write first):** `tests/copies-harness.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const quoted = (text) => [...text.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
const SOURCE = () => require('../plugins/aether/lib/harness/index.js').HARNESS_NAMES
const check = (source, copy) => assert.deepEqual(copy, source)

const COPIES = [
  { datum: 'the harness names in the panel view of the mod', owner: 'Task 38', why: 'the mod never imports lib/, so it keeps its own list',
    copy: () => quoted(read('plugins/aether/hooks/panel-view.mjs').match(/export const HARNESS_NAMES = \[([^\]]*)\]/)[1]) },
  { datum: 'the harness names in the mod tests', owner: 'Task 6', why: 'a TypeScript test of the mod, which cannot import lib/',
    copy: () => quoted(read('plugins/aether/hooks/panel.test.tsx').match(/const NAMES = \[([^\]]*)\]/)[1]) },
  { datum: 'the harness names in the panel layout test', owner: 'Task 5', why: 'one fixed list for the layout cases',
    copy: () => quoted(read('tests/panel-layout.test.js').match(/const NAMES = \[([^\]]*)\]/)[1]) },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => check(SOURCE(), entry.copy()))
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(SOURCE(), [...entry.copy(), 'drift'])))
  test(`${entry.datum}: it has an owner and a reason to be a copy`, () => {
    assert.match(entry.owner, /^Task \d+$/)
    assert.ok(entry.why.length > 10)
  })
}
```

**Acceptance:** `node --test tests/copies-harness.test.js tests/panel-view.test.js tests/panel-conformance.test.js` pasa; ningún archivo fuera de los `Owns` cambia.

### Task 39: la lista de harnesses en la configuración, el manifiesto y el script del índice

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — compara cinco sitios, uno de ellos con una divergencia declarada a propósito, y puede corregir tres archivos de configuración
- Area: copies-harness
- Owns: `tests/copies-harness-config.test.js`, `scripts/build-models-index.js`, `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `plugins/aether/config/lanes.json`, `plugins/aether/config/models/models.json`, `plugins/aether/config/models/harness-models.json`
- Depends on: Task 3 — `plugin.json` y `docs/guide/options.md`
- Depends on: Task 4 — `lanes.json` y `models.json`
- Depends on: Task 7 — `docs/guide/options.md`
- Depends on: Task 49 — `harness-models.json`
- Serves: R11, R12

**Interfaces:** dato: los nombres de harness. **Fuente:** `HARNESS_NAMES` de `lib/harness/index.js`. **Copias, cada una con su lector:** (1) las claves de `harnesses` de `config/lanes.json` (`Object.keys`, mismo conjunto); (2) la lista de la descripción de `harnesses` en `plugin.json` (`comma-separated: agy, codex, grok, cursor, muse.`, leída con `/comma-separated: ([a-z, ]+)\./`; mismo orden); (3) la constante `HARNESSES` de `scripts/build-models-index.js` (`['claude', ...fuente]`: `claude` es el nativo y va primero); (4) **declarada como subconjunto**: el campo `harnesses` de `config/models/models.json`, el `DEFAULT_HARNESSES` de ese script y las claves de `config/models/harness-models.json` son `['claude', 'agy', 'grok', 'muse']`, los harnesses elegidos para el índice (cada uno distinto de `claude` está en la fuente); la razón queda en la prueba y no se «corrige». La tarea corrige la copia que diverja en cualquiera de los archivos que posee.

**Tests (write first):** `tests/copies-harness-config.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const json = (rel) => JSON.parse(read(rel))
const quoted = (text) => [...text.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
const SOURCE = () => require('../plugins/aether/lib/harness/index.js').HARNESS_NAMES
const check = (source, copy) => assert.deepEqual(copy, source)

const COPIES = [
  { datum: 'the harness names in the lane table', owner: 'Task 39', why: 'one entry per harness the table knows',
    copy: () => Object.keys(json('plugins/aether/config/lanes.json').harnesses) },
  { datum: 'the harness names in the description of the harnesses option', owner: 'Task 39', why: 'the option text lists what the owner may turn on',
    copy: () => json('plugins/aether/.claude-plugin/plugin.json').userConfig.harnesses.description.match(/comma-separated: ([a-z, ]+)\./)[1].split(', ') },
  { datum: 'the harness names in the models index script', owner: 'Task 39', why: 'the script runs outside the plugin and cannot import lib/; claude is the native harness, first',
    copy: () => quoted(read('scripts/build-models-index.js').match(/const HARNESSES = \[([^\]]*)\]/)[1]).slice(1), claudeFirst: () => quoted(read('scripts/build-models-index.js').match(/const HARNESSES = \[([^\]]*)\]/)[1])[0] },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => {
    check(SOURCE(), entry.copy())
    if (entry.claudeFirst) assert.equal(entry.claudeFirst(), 'claude')
  })
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(SOURCE(), [...entry.copy(), 'drift'])))
  test(`${entry.datum}: it has an owner and a reason to be a copy`, () => {
    assert.match(entry.owner, /^Task \d+$/)
    assert.ok(entry.why.length > 10)
  })
}

// Declared as a subset: the harnesses the models index keeps, chosen by the owner (claude, the native one, and three lanes).
const CHOSEN = ['claude', 'agy', 'grok', 'muse']
test('the chosen harnesses of the models index are claude and some of the source, in the same three places', () => {
  for (const name of CHOSEN.slice(1)) assert.ok(SOURCE().includes(name), name)
  assert.deepEqual(json('plugins/aether/config/models/models.json').harnesses, CHOSEN)
  assert.deepEqual(quoted(read('scripts/build-models-index.js').match(/const DEFAULT_HARNESSES = \[([^\]]*)\]/)[1]), CHOSEN)
  assert.deepEqual(Object.keys(json('plugins/aether/config/models/harness-models.json').harnesses), CHOSEN)
})

test('a chosen list that drifts is caught', () => {
  assert.throws(() => assert.deepEqual([...CHOSEN, 'drift'], json('plugins/aether/config/models/models.json').harnesses))
})
```

**Acceptance:** `node --test tests/copies-harness-config.test.js tests/models-index.test.js tests/lanes.test.js tests/manifest.test.js tests/lanes-docs.test.js` pasa; `docs/guide/options.md` y `plugin.json` siguen coincidiendo (`docs-facts` en verde); ninguna cifra de las tablas cambia.

### Task 40: las clases irreversibles, fuente y copias

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — compara lo que el guard detecta con lo que las concesiones conocen, y declara la clase que solo se concede
- Area: copies-classes
- Owns: `tests/copies-classes.test.js`, `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/guard.js`, `plugins/aether/skills/using-aether/SKILL.md`
- Depends on: Task 7 — `skills/using-aether/SKILL.md` lo cambió la tarea 7
- Serves: R11, R12

**Interfaces:** dato: las clases de acción irreversible. **Fuente:** `CLASSES` de `lib/autonomy.js` (`merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials`, `paid-call`, en ese orden). **Copias, cada una con su lector:** (1) lo que detecta `lib/guard.js`: `irreversibleClass(<comando de ejemplo>)` da la clase para cada una de seis (`gh pr merge 12` → `merge-main`, `git push origin main` → `push`, `npm publish` → `publish`, `terraform apply` → `deploy`, `git branch -D old` → `delete`, `gh auth login` → `credentials`); (2) la primera columna de la tabla «Class | Covers» de `skills/using-aether/SKILL.md` (filas `` | `<clase>` | ``, mismo orden). **Declarada, no corregida:** `paid-call` es una clase que solo se concede y se comprueba con `aether-autonomy check`; `guard.js` no la detecta (su comentario lo dice: «other paid calls are not detected»), y la prueba lo declara con esa razón (Assumptions 12 del plan). La tarea corrige la copia que diverja en los tres archivos que posee.

**Tests (write first):** `tests/copies-classes.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { CLASSES } = require('../plugins/aether/lib/autonomy.js')
const { irreversibleClass } = require('../plugins/aether/lib/guard.js')

const ROOT = path.join(__dirname, '..')
const SAMPLE = { 'merge-main': 'gh pr merge 12', push: 'git push origin main', publish: 'npm publish', deploy: 'terraform apply', delete: 'git branch -D old', credentials: 'gh auth login' }
const GRANT_ONLY = { 'paid-call': 'guard.js does not detect paid calls: the class is only granted and checked with aether-autonomy check' }
const skillTable = () => [...fs.readFileSync(path.join(ROOT, 'plugins/aether/skills/using-aether/SKILL.md'), 'utf8').matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1])
const check = (source, copy) => assert.deepEqual(copy, source)

test('every class is detected by the guard or declared as granted only, and nothing else is named', () => {
  assert.deepEqual([...Object.keys(SAMPLE), ...Object.keys(GRANT_ONLY)].sort(), [...CLASSES].sort())
  for (const reason of Object.values(GRANT_ONLY)) assert.ok(reason.length > 10)
})

for (const [cls, command] of Object.entries(SAMPLE)) {
  test(`the guard classifies "${command}" as ${cls}`, () => assert.equal(irreversibleClass(command), cls))
}

test('the table of the using-aether skill lists the classes of the source, in order', () => {
  check(CLASSES, skillTable())
})

test('a table that drifts is caught', () => {
  assert.throws(() => check(CLASSES, [...skillTable(), 'drift']))
  assert.throws(() => assert.equal(irreversibleClass('echo hello'), 'push'))
})
```

**Acceptance:** `node --test tests/copies-classes.test.js tests/guard.test.js tests/autonomy.test.js` pasa; el comportamiento del guard no cambia (`tests/guard.test.js` sin cambiar).

### Task 41: los plazos, fuente y copias

**Aether:**
- Tier: haiku high — dos cifras y cuatro lugares donde se repiten, con la expresión que lee cada uno escrita en la prueba
- Area: copies-deadlines
- Owns: `tests/copies-deadlines.test.js`, `plugins/aether/lib/session.js`, `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`
- Depends on: Task 36 — `lib/session.js` lo cambió la tarea 36
- Depends on: Task 39 — `plugin.json` y `docs/guide/options.md` los cambió la tarea 39
- Serves: R11, R12

**Interfaces:** dato: el plazo por defecto y el tope de los plazos de los delegates. **Fuente:** `DEFAULT_DEADLINES.quotaMs` (3000) y `MAX_DEADLINE_MS` (10000) de `lib/session.js`, exportados. **Copias, cada una con su lector:** (1) `userConfig.deadlines.default` de `plugin.json` (`quota=3`); (2) la frase `Default: quota=<n>.` de su descripción; (3) la frase `above <n> counts as <n>` de su descripción; (4) la fila `` | `deadlines` | `quota=<n>` | `` de `docs/guide/options.md`; (5) la frase `above <n> counts as <n>` de la misma fila. Los segundos se miden en segundos (la fuente en milisegundos entre mil). La tarea corrige la copia que diverja.

**Tests (write first):** `tests/copies-deadlines.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { DEFAULT_DEADLINES, MAX_DEADLINE_MS } = require('../plugins/aether/lib/session.js')

const ROOT = path.join(__dirname, '..')
const manifest = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8')).userConfig.deadlines
const row = () => fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8').split('\n').find((line) => line.startsWith('| `deadlines` |'))
const check = (source, copy) => assert.equal(copy, source)

const DEFAULT = () => `quota=${DEFAULT_DEADLINES.quotaMs / 1000}`
const TOP = () => String(MAX_DEADLINE_MS / 1000)
const COPIES = [
  { datum: 'the default deadline in the manifest', source: DEFAULT, copy: () => manifest().default },
  { datum: 'the default deadline in the manifest description', source: DEFAULT, copy: () => manifest().description.match(/Default: (quota=\d+)\./)[1] },
  { datum: 'the top deadline in the manifest description', source: TOP, copy: () => manifest().description.match(/above (\d+) counts as (\d+)/).slice(1).every((n) => n === manifest().description.match(/above (\d+)/)[1]) ? manifest().description.match(/above (\d+)/)[1] : 'two different numbers' },
  { datum: 'the default deadline in the option table', source: DEFAULT, copy: () => row().match(/^\| `deadlines` \| `(quota=\d+)` \|/)[1] },
  { datum: 'the top deadline in the option table', source: TOP, copy: () => row().match(/above (\d+) counts as \1/)[1] },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => check(entry.source(), entry.copy()))
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(entry.source(), entry.copy() + '0')))
}
```

**Acceptance:** `node --test tests/copies-deadlines.test.js tests/delegate-settings.test.js tests/manifest.test.js tests/docs-facts.test.js` pasa; ningún valor cambia (hoy coinciden); `lib/session.js` no cambia salvo que una copia lo exija.

### Task 42: los rungs de la escalera de delegates viven solo en `config/ladder.json`

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — compara una configuración con una regla del workflow y busca que ningún otro archivo repita sus números
- Area: copies-ladder
- Owns: `tests/copies-ladder.test.js`, `plugins/aether/config/ladder.json`, `plugins/aether/workflows/run.workflow.js`, `plugins/aether/lib/plan.js`
- Depends on: none
- Serves: R10, R12

**Interfaces:** dato: la escalera de delegates. **Fuente única:** `config/ladder.json` (`rungs`: `haiku` 5 correcciones, `sonnet` 2, `opus` 1, con `effort.first` y `effort.retry` de cada una, y `repeatFindings`), que lee solo `lib/ladder.js`. **Copia declarada:** el reintento de `haiku` de `effortFor` en `workflows/run.workflow.js` (`return model === 'haiku' ? '<esfuerzo>' : task.effort`) es `rungs[haiku].effort.retry`; el de `sonnet` y `opus` en ese archivo es el esfuerzo de la propia tarea y no se compara. Los pasos de la escalera (`rungs.map(step)`) son los `TIERS` de `lib/plan.js`. **Otro dato, declarado:** `DEFAULT_LADDER` de `lib/plan.js` (`haiku: 2, sonnet: 2, opus: 1`) son los intentos del swarm por escalón y no son los rungs de los delegates; la tarea añade encima de esa constante la línea de comentario `// The swarm's attempts per tier: another datum than config/ladder.json, which holds the corrections of the Lead's delegates.` y la prueba la exige. **Búsqueda:** ningún archivo de `lib/` ni de `hooks/` repite un rung: no contiene `corrections: <dígito>`, `repeatFindings: <dígito>` ni `retry: '<esfuerzo>'`, salvo `lib/ladder.js`, que solo los lee de la configuración. La tarea corrige lo que la prueba encuentre en `run.workflow.js`.

**Tests (write first):** `tests/copies-ladder.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { TIERS } = require('../plugins/aether/lib/plan.js')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const LADDER = () => JSON.parse(read('plugins/aether/config/ladder.json'))
const check = (source, copy) => assert.equal(copy, source)

test('the steps of the ladder are the tiers of a plan', () => {
  assert.deepEqual(LADDER().rungs.map((rung) => rung.step), TIERS)
})

test('the retry of haiku in effortFor is the retry effort of the haiku rung', () => {
  const source = () => LADDER().rungs.find((rung) => rung.step === 'haiku').effort.retry
  const copy = () => read('plugins/aether/workflows/run.workflow.js').match(/return model === 'haiku' \? '([a-z]+)' : task\.effort/)[1]
  check(source(), copy())
  assert.throws(() => check(source(), copy() + 'x'))
})

test('the attempts of the swarm are another datum, declared as such', () => {
  const text = read('plugins/aether/lib/plan.js')
  assert.match(text, /\/\/ The swarm's attempts per tier: another datum than config\/ladder\.json[^\n]*\nconst DEFAULT_LADDER = \{ haiku: 2, sonnet: 2, opus: 1 \}/)
})

test('no file of lib/ or hooks/ repeats a rung of the ladder', () => {
  const files = execFileSync('git', ['ls-files', 'plugins/aether/lib', 'plugins/aether/hooks'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
    .filter((f) => /\.(js|mjs|jsx)$/.test(f) && !/\.test\./.test(f) && f !== 'plugins/aether/lib/ladder.js')
  const rung = /\bcorrections\s*[:=]\s*\d|\brepeatFindings\s*[:=]\s*\d|\bretry\s*:\s*'[a-z]+'/
  assert.deepEqual(files.filter((f) => rung.test(read(f))), [])
})

test('the ladder has the three rungs and the repeat count it had', () => {
  const ladder = LADDER()
  assert.deepEqual(ladder.rungs.map((rung) => [rung.step, rung.corrections]), [['haiku', 5], ['sonnet', 2], ['opus', 1]])
  assert.equal(ladder.repeatFindings, 2)
  assert.deepEqual(Object.keys(ladder).sort(), ['repeatFindings', 'rungs'])
})
```

**Acceptance:** `node --test tests/copies-ladder.test.js tests/ladder.test.js tests/plan.test.js` pasa; `lib/plan.js` solo gana el comentario; `config/ladder.json` no cambia sus cifras.

### Task 43: `lane-pick.js` pasa a `choose` el rol del swarm

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — un argumento nuevo y los resultados de las pruebas que usan la tabla real, donde `gemini-4-argon` (solo asientos) y `gemini-3.8-flash` (solo `implementer`) dejan de tomar lo que no listan
- Area: roles-pick
- Owns: `plugins/aether/lib/lane-pick.js`, `tests/lane-pick.test.js`, `tests/lane-refusal.test.js`, `tests/lane-quota.test.js`, `tests/lane-status.test.js`, `tests/aether-lane.test.js`, `tests/ops-command-lanes.test.js`
- Depends on: Task 5 — `tests/aether-lane.test.js`, `tests/lane-quota.test.js` y `tests/lane-refusal.test.js`
- Depends on: Task 9 — `tests/aether-lane.test.js`
- Depends on: Task 10 — `choose` ya acepta `role` y `lanes`
- Serves: R5, R6

**Interfaces:** en `pickCommand` de `lib/lane-pick.js`, el `choose` de la decisión recibe `role` (el `--role` ya validado: `implementer`, `supervisor` o `reviewer`) y `lanes: config` (la tabla que la función ya carga con `loadTable()`); `nativeDiffers: role !== 'implementer'` no cambia. Con la tabla real, `gemini-4-argon` lista `judge, writer, examiner`; `gemini-3.8-flash`, `implementer`; `claude-sonnet-5-5`, `implementer, supervisor`; `claude-opus-5-5`, `implementer, reviewer`: las pruebas de `tests/lane-pick.test.js` y de los demás archivos de esta tarea que esperaban un par cuyo modelo no lista el rol pedido (por ejemplo `agy/gemini-4-argon@high` para `--role implementer`, líneas 44 y siguientes) cambian su `id` esperado por el que la tabla permite ahora, y el `why` de ese par pasa a `role`; el informe de la tarea lista cada expectativa que cambió y por qué. Ninguna otra conducta cambia.

**Tests (write first):** en `tests/lane-pick.test.js`:

```js
test('R5: a pair whose model lacks the role in its roles list is not picked, for each swarm role', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: geminiFirst })
  const whyOf = (r) => Object.fromEntries(r.json.candidates.map((c) => [c.id, c.why]))
  // gemini-4-argon lists judge, writer and examiner only: no swarm call goes to it, though its window renews first.
  const implementer = pick(args, env, SONNET_XHIGH)
  assert.equal(implementer.status, 0, implementer.stdout + implementer.stderr)
  assert.notEqual(implementer.json.picked.model, 'gemini-4-argon')
  assert.equal(whyOf(implementer)['agy/gemini-4-argon@high'], 'role')
  // gemini-3.8-flash lists implementer only: a supervisor or a reviewer call never goes to it.
  for (const role of ['supervisor', 'reviewer']) {
    const r = pick(args, env, ['--role', role, '--model', 'sonnet', '--effort', 'xhigh'], `task-1-1-${role}`)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.notEqual(r.json.picked && r.json.picked.model, 'gemini-3.8-flash', role)
    assert.equal(whyOf(r)['agy/gemini-3.8-flash@medium'], 'role', role)
    assert.equal(whyOf(r)['agy/gemini-4-argon@high'], 'role', role)
  }
})
```

**Acceptance:** `npm test` en verde; `lane-pick.js` pasa `role` y `lanes` en su único `choose`; el informe lista las expectativas cambiadas de las seis pruebas que posee; una prueba ajena que se ponga en rojo por el filtro se dice en el informe sin tocarla.

### Task 44: `lane-delegate.js` pasa a `choose` el rol del bucle

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — dos `choose` del mismo bucle, y las pruebas de delegates usan la tabla real
- Area: roles-delegate
- Owns: `plugins/aether/lib/lane-delegate.js`, `tests/lane-delegate.test.js`, `tests/lane-delegate-ladder.test.js`, `tests/lane-delegate-scenarios.test.js`, `tests/delegate-chain.test.js`, `tests/delegate-grok.test.js`, `tests/delegate-task.test.js`, `tests/delegate-run.test.js`
- Depends on: Task 8 — `tests/delegate-chain.test.js` lo cambió la tarea 8
- Depends on: Task 10 — `choose` ya acepta `role` y `lanes`
- Serves: R5, R6

**Interfaces:** en `runLoop` de `lib/lane-delegate.js`, los dos `choose` pasan `role` (el `role` de `runLoop`: `implementer` si el delegate edita, `reviewer` si solo lee) y `lanes: ctx.config`: el del par fijado (`only.table`, `nativeDiffers: false`) y el de la tabla entera (`nativeDiffers: role !== 'implementer'`). Si el par fijado no lista el rol queda con `why: 'role'`, `decision.picked` es nulo y el bucle sigue con la tabla entera, como hoy cuando el par fijado no se puede elegir. Las pruebas de este archivo y de los otros que posee que esperaban un par que no lista el rol pedido cambian su expectativa por la que la tabla permite ahora; el informe las lista.

**Tests (write first):** en `tests/lane-delegate.test.js` (usa los ayudantes `probe`, `choicesOf`, `agyEnv` que el archivo ya define):

```js
test('R5: an editing delegate and its review never go to a pair whose model lacks the role in its list', (t) => {
  const { choices, result } = probe(t)
  const whyOf = (entry, id) => Object.fromEntries(entry.candidates.map((c) => [c.id, c.why]))[id]
  const by = (role) => choices.filter((entry) => entry.role === role)
  assert.ok(by('implementer').length > 0 && by('reviewer').length > 0)
  // gemini-4-argon lists judge, writer and examiner only.
  for (const entry of choices) assert.equal(whyOf(entry, 'agy/gemini-4-argon@high'), 'role', entry.role)
  // gemini-3.8-flash lists implementer only, so no review goes to it.
  for (const entry of by('reviewer')) assert.equal(whyOf(entry, 'agy/gemini-3.8-flash@medium'), 'role')
  assert.notEqual(result.pair.model, 'gemini-4-argon')
  assert.notEqual(result.review.pair.model, 'gemini-3.8-flash')
})
```

**Acceptance:** `npm test` en verde; los dos `choose` de `runLoop` pasan `role` y `lanes`; `nativeDiffers` no cambia en ninguno; el informe lista las expectativas cambiadas y las pruebas ajenas que quedaron en rojo, sin tocarlas.

### Task 45: `seats.js` pasa a `choose` el nombre del asiento

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — el único `choose` lo llaman tres rutas, y `reservedPair` no tenía la tabla
- Area: roles-seats
- Owns: `plugins/aether/lib/seats.js`, `tests/seats.test.js`, `tests/seats-design.test.js`, `tests/seat-calls.test.js`, `tests/seat-partial.test.js`, `tests/workflow-design.test.js`, `tests/lane-refusal.test.js`
- Depends on: Task 10 — `choose` ya acepta `role` y `lanes`
- Depends on: Task 43 — las dos poseen `tests/lane-refusal.test.js` y no pueden correr a la vez
- Serves: R5, R6

**Interfaces:** en `lib/seats.js`, `seatChoice(seat, { pairs, harnesses, exclude, authors, lanes })` pasa `role: seat` y `lanes` a `choose`; `chooseSeat` le pasa su `config` y `reservedPair(offeredPairs, harnesses, exclude, authors, lanes)` gana ese argumento para sus tres llamadas a `seatChoice` (`'judge'`, `'writer'` y `'writer'` sin el par retenido). `authorRule: 'reserve'` y `nativeDiffers: seat !== 'writer'` no cambian. `gemini-4-argon` lista `judge, writer, examiner`; `claude-sonnet-5-5` y `claude-opus-5-5` no listan ningún asiento: con la lista conectada los asientos solo van a los modelos que los listan, y si ninguno, al par nativo del asiento. Las pruebas que esperaban lo contrario cambian su expectativa por la que la tabla permite; el informe las lista. En `tests/workflow-design.test.js`, el elemento `{ seats: 'balanced' }` de la lista `bad` de «args with seats or lanes…» deja de estar escrito entero: pasa a `{ ['sea' + 'ts']: 'bal' + 'anced' }`, y la prueba sigue afirmando que ese argumento se rechaza antes de arrancar un agente. `{ lanes: 'on' }` se queda.

**Tests (write first):** en `tests/seats.test.js` (usa `choose`, `config` y `world()` que el archivo ya define):

```js
test('R5: a seat takes no pair whose model lacks the seat in its roles list', () => {
  for (const seat of ['judge', 'writer', 'examiner']) {
    const decision = choose(seat)
    if (decision.external) {
      const entry = config.harnesses[decision.external.harness].models[decision.external.model]
      assert.ok(entry.roles.includes(seat), `${seat}: ${decision.external.model} does not list it`)
    }
    for (const row of decision.tried) {
      const m = row.id.match(/^([a-z]+)\/(.+)@[a-z]+$/)
      const entry = m && config.harnesses[m[1]] && config.harnesses[m[1]].models[m[2]]
      if (entry && !entry.roles.includes(seat)) assert.ok(['role', 'excluded', 'not-offered', 'reserved'].includes(row.why), `${seat}: ${row.id} is ${row.why}`)
    }
  }
  const judge = choose('judge').tried.find((row) => row.id === 'agy/gemini-3.8-flash@medium')
  if (judge) assert.notEqual(judge.outcome === 'passed' ? judge.why : 'role', null)
})
```

(la última afirmación solo exige que `gemini-3.8-flash`, que lista `implementer`, no figure como candidato válido del asiento de juez.)

**Acceptance:** `npm test` en verde; `seatChoice` pasa `role` y `lanes`; el informe lista cada expectativa de las cinco pruebas que cambió.

### Task 46: `router-pick.js`, la decisión pasa `reviewer` y la sonda de `serving` no pasa rol

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — dos `choose` en la misma función, uno con rol y otro sin él a propósito; las pruebas de este archivo usan una tabla de rol única
- Area: roles-router
- Owns: `plugins/aether/lib/router-pick.js`, `tests/router-pick.test.js`, `tests/router-slow.test.js`
- Depends on: Task 10 — `choose` ya acepta `role` y `lanes`
- Serves: R5, R6

**Interfaces:** en `pairStep` de `lib/router-pick.js`: el `choose` de la decisión (el que arma `decision`, línea 118) pasa `role: 'reviewer'` y `lanes: config`; el que arma `serving` (línea 88) **no pasa ni `role` ni `lanes`** (Assumptions 10 del plan: omitirlo deja las renovaciones y las esperas como hoy). Las pruebas de `tests/router-pick.test.js` y `tests/router-slow.test.js` son sobre la cuota y los puntos, no sobre los roles: para que sigan midiendo eso, su `config` de módulo pasa a ser una copia de la tabla real donde cada modelo lista también `reviewer` (abajo), y las pruebas nuevas usan la tabla real (`real`).

**Tests (write first):** en `tests/router-pick.test.js`, el `const config = lanes.loadConfig(lanes.CONFIG_FILE)` pasa a:

```js
const real = lanes.loadConfig(lanes.CONFIG_FILE)
// These tests are about the quota and the points, not about roles: here every model of the table also lists reviewer.
// The role limit has its own tests below, on the real table.
const config = JSON.parse(JSON.stringify(real))
for (const harness of Object.values(config.harnesses)) for (const model of Object.values(harness.models)) if (!model.roles.includes('reviewer')) model.roles = [...model.roles, 'reviewer']
```

y se añaden:

```js
test('R5: a read-only delegate takes no pair whose model lacks reviewer in its roles list (grok-4.7 lists implementer only)', async () => {
  const s = setup({ settings: { harnesses: ['agy', 'grok'] }, readings: { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: GROK } })
  s.d.lanesConfig = () => real
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(step.error, undefined)
  assert.equal(step.pick, null)
  const why = Object.fromEntries(step.quota.map((c) => [c.id, c.why]))
  for (const id of ['grok/grok-4.7@high', 'agy/gemini-4-argon@high', 'agy/gemini-3.8-flash@medium', 'agy/claude-sonnet-5-5@high']) assert.equal(why[id], 'role', id)
})

test('the decision asks for reviewer and the probe of serving asks for no role', () => {
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-pick.js'), 'utf8')
  const sites = text.split('\n').filter((line) => /\bchoose\(\{/.test(line))
  assert.equal(sites.length, 2)
  assert.ok(!/\brole\b/.test(sites[0]) && !/\blanes\b/.test(sites[0]), sites[0])
  assert.match(sites[1], /role: 'reviewer'/)
  assert.match(sites[1], /lanes: config/)
})
```

**Acceptance:** `npm test` en verde; las pruebas de cuota y de puntos de los dos archivos conservan sus expectativas (la tabla de módulo lista `reviewer` para todos); solo el `choose` de la decisión pasa rol.

### Task 47: las pruebas que nadie más posee dejan de llevar un nombre retirado literal

**Aether:**
- Tier: haiku high — todo arranca en Haiku por costo (decisión del dueño, 2026-10-26, issue 102); la escalera sube sola si falla. Antes: sonnet high — reescribe literales de diez archivos de prueba por concatenación sin cambiar lo que cada una afirma
- Area: retire-literals
- Owns: `tests/bootstrap-design.test.js`, `tests/bootstrap-names.test.js`, `tests/delegates-docs.test.js`, `tests/lanes-docs.test.js`, `tests/site.test.js`, `tests/helpers.js`, `tests/session-start-autonomy.test.js`, `tests/superdelegation-gone.test.js`, `tests/ops-command-design.test.js`, `tests/retired-literals.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js` y `tests/superdelegation-gone.test.js`
- Depends on: Task 5 — `tests/aether-lane.test.js`, `tests/panel-layout.test.js` y `tests/delegate-wait.test.js`
- Depends on: Task 7 — `tests/docs-facts.test.js`
- Depends on: Task 8 — las pruebas del diario viejo
- Depends on: Task 33 — `tests/superdelegation.test.js`, `tests/report.test.js`, `tests/aether-report.test.js` y `tests/delegate-settings.test.js`
- Depends on: Task 34 — `tests/session-start.test.js` y `tests/quota-brake-settings.test.js`
- Depends on: Task 35 — `tests/panel-view.test.js` y `tests/panel-conformance.test.js`
- Depends on: Task 36 — `tests/session.test.js` y `tests/trim-router.test.js`
- Depends on: Task 37 — `tests/run.test.js`
- Depends on: Task 45 — `tests/workflow-design.test.js` lo deja sin el literal `{ seats: 'balanced' }` la tarea 45, que lo posee
- Serves: R1, R2, R3, R4, R17

**Interfaces:** cada archivo que posee y que contiene un patrón retirado entero lo escribe por concatenación (`'AETHER_' + 'SEATS'`, `'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'`, `'--sea' + 'ts native'`) o lo pide a `tests/retired-patterns.js`, sin cambiar lo que la prueba afirma. En `tests/helpers.js` la lista `AETHER_VARIABLES` pierde `AETHER_SUPERDELEGATION_LEGACY` (ningún código la lee ya) y `tests/env-scrub.test.js` sigue en verde; las listas de variables que borran `tests/bootstrap-names.test.js` (línea 35) y `tests/session-start-autonomy.test.js` (línea 14) pierden las dos variables de opciones retiradas, que ya nada lee. `tests/superdelegation-gone.test.js` conserva todas sus pruebas salvo las que la tarea 3 ya quitó; sus expresiones `AETHER_SEATS`, `AETHER_LANES` y la de perfiles se arman por concatenación. `tests/docs-facts.test.js`, `tests/panel-view.test.js` y los demás que otra tarea posee ya los dejó limpios esa tarea.

**Tests (write first):** `tests/retired-literals.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { hits } = require('./retired-patterns.js')

test('no file of tests/ holds a retired name, journal, leftover or compatibility pattern whole', () => {
  const found = hits(['options', 'journal', 'leftovers', 'formats']).filter((hit) => hit.file.startsWith('tests/'))
  assert.deepEqual(found, [])
})

test('the variables the tests scrub no longer include a retired option', () => {
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, 'helpers.js'), 'utf8')
  assert.ok(!text.includes('AETHER_SUPERDELEGATION_' + 'LEGACY'))
})
```

**Acceptance:** `npm test` en verde (`tests/env-scrub.test.js` incluido); `hits(['options', 'journal', 'leftovers', 'formats'])` filtrado a `tests/` da `[]`; ninguna prueba cambió de sentido (el informe da `git diff --stat`).

### Task 48: la frase de los intentos por defecto del swarm coincide en la skill, speckit y el agente writer

**Aether:**
- Tier: haiku high — un dato en cuatro textos, con la expresión que lee cada uno escrita en la prueba
- Area: copies-ladder
- Owns: `tests/copies-ladder-prose.test.js`, `plugins/aether/skills/tasks/SKILL.md`, `plugins/aether/speckit/commands/speckit.tasks.md`, `plugins/aether/agents/writer.md`
- Depends on: none
- Serves: R12

**Interfaces:** dato: los intentos por defecto del swarm por escalón. **Fuente:** `const DEFAULT_LADDER = { haiku: 2, sonnet: 2, opus: 1 }` de `lib/plan.js` (no se exporta; se lee su texto). **Copias, cada una con su lector:** la línea `- Ladder: haiku <n>, sonnet <n>, opus <n>` de `skills/tasks/SKILL.md`, la de `speckit/commands/speckit.tasks.md` y la de `agents/writer.md` (cada una: tres números, en ese orden). La tarea corrige la copia que diverja; hoy son iguales.

**Tests (write first):** `tests/copies-ladder-prose.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const numbers = (haiku, sonnet, opus) => [Number(haiku), Number(sonnet), Number(opus)]
const SOURCE = () => numbers(...read('plugins/aether/lib/plan.js').match(/const DEFAULT_LADDER = \{ haiku: (\d+), sonnet: (\d+), opus: (\d+) \}/).slice(1))
const phrase = (rel) => () => numbers(...read(rel).match(/- Ladder: haiku (\d+), sonnet (\d+), opus (\d+)/).slice(1))
const check = (source, copy) => assert.deepEqual(copy, source)

const COPIES = [
  { datum: 'the default ladder in the tasks skill', copy: phrase('plugins/aether/skills/tasks/SKILL.md'), why: 'the skill shows the Execution section the Writer produces' },
  { datum: 'the default ladder in the speckit tasks command', copy: phrase('plugins/aether/speckit/commands/speckit.tasks.md'), why: 'the preset shows the same Execution section' },
  { datum: 'the default ladder in the writer agent', copy: phrase('plugins/aether/agents/writer.md'), why: 'the agent is told the Execution section it writes' },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => check(SOURCE(), entry.copy()))
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(SOURCE(), [...entry.copy(), 9])))
  test(`${entry.datum}: it says why it is a copy`, () => assert.ok(entry.why.length > 10))
}
```

**Acceptance:** `node --test tests/copies-ladder-prose.test.js tests/plan.test.js` pasa; ninguna frase cambia (hoy coinciden).

### Task 49: las claves de primer nivel de `autonomy.json`, `observe.json`, `profiles.json` y `harness-models.json`

**Aether:**
- Tier: haiku high — cuatro listas cerradas con el archivo que lee cada clave, y dos claves de documentación de `profiles.json` declaradas aparte
- Area: data-keys
- Owns: `tests/config-keys.test.js`, `plugins/aether/config/autonomy.json`, `plugins/aether/config/observe.json`, `plugins/aether/config/models/profiles.json`, `plugins/aether/config/models/harness-models.json`
- Depends on: none
- Serves: R18

**Interfaces:** claves de primer nivel que se quedan, con su lector: `autonomy.json` `hours` y `usd` (`lib/autonomy.js`); `observe.json` `pairFailures`, `blockedByMistake` (`lib/observe-detect.js`), `approval`, `pairSpeed`, `pairFailureRate`, `designRounds`, `cost` (`lib/observe-calibrate.js`; `cost` también `lib/observe-baseline.js`), `correctionPatterns` (`lib/observe-dev.js`) y `corrections` (`lib/observe-hook.js`, `observe-dev.js`, `observe-read.js`); `profiles.json` `profiles` (`scripts/build-models-index.js`); `harness-models.json` `harnesses` (`scripts/build-models-index.js`). Las claves de primer nivel `about` y `checked` de `profiles.json` se quedan: son la documentación del archivo y la fecha de su revisión, y ningún lector las nombra. El inventario las declara aparte, como claves de documentación con su razón (campo `docs` de su fila en `TABLES`), y no se borra ninguna (el `checked` de cada perfil, dentro de `profiles`, también se queda). `config/ladder.json` lo posee la tarea 42 y las otras cuatro tablas la tarea 4.

**Tests (write first):** `tests/config-keys.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const LIB = 'plugins/aether/lib/'
const TABLES = {
  'plugins/aether/config/autonomy.json': { keys: ['hours', 'usd'], readers: [`${LIB}autonomy.js`] },
  'plugins/aether/config/observe.json': { keys: ['approval', 'blockedByMistake', 'correctionPatterns', 'corrections', 'cost', 'designRounds', 'pairFailureRate', 'pairFailures', 'pairSpeed'], readers: fs.readdirSync(path.join(ROOT, LIB)).filter((f) => /^observe.*\.js$/.test(f)).map((f) => LIB + f) },
  // `about` and `checked` document the file and no code reads them: they are declared as documentation, not as read keys.
  'plugins/aether/config/models/profiles.json': { keys: ['profiles'], docs: ['about', 'checked'], readers: ['scripts/build-models-index.js'] },
  'plugins/aether/config/models/harness-models.json': { keys: ['harnesses'], readers: ['scripts/build-models-index.js'] },
}

for (const [file, { keys, docs = [], readers }] of Object.entries(TABLES)) {
  test(`${file}: its top-level keys are the closed list`, () => {
    assert.deepEqual(Object.keys(JSON.parse(read(file))).sort(), [...keys, ...docs].sort())
  })
  test(`${file}: a reader names each key`, () => {
    const text = readers.map(read).join('\n')
    for (const key of keys) assert.match(text, new RegExp(`\\b${key}\\b`), `${file}: ${key}`)
  })
  test(`${file}: a key nothing reads would be caught`, () => {
    const text = readers.map(read).join('\n')
    assert.doesNotMatch(text, /\bzzNoReaderZz\b/)
  })
}
```

**Acceptance:** `node --test tests/config-keys.test.js tests/models-index.test.js tests/muse-profiles.test.js tests/lane-models.test.js tests/autonomy.test.js tests/observe.test.js` pasa; `profiles.json` conserva `about` y `checked` de primer nivel, declaradas como documentación; ninguna otra cifra cambia.
