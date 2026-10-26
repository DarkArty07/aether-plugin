# Tareas: dejar el proyecto limpio y coherente antes de hacerlo público

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, sin dependencias nuevas. Las rutas son relativas a la raíz del repositorio. Cada tarea deja `npm test` en verde: la fusión corre el comando completo, y una prueba que falla fuera de los `Owns` de la tarea bloquea su unidad y todo lo que depende de ella. Si un cambio rompe una prueba que la tarea no posee, la tarea no lo hace: lo dice en su informe y deja el código como estaba.
- **Es una refactorización que conserva el comportamiento visible (R24)** salvo lo que C1 retira (tareas 3 y 8) y el límite de `roles` de C2 (tarea 10). Las pruebas existentes no cambian de sentido; las que fijaban lo retirado se borran o se reescriben en la tarea que lo retira. No se añade ninguna función, opción ni comando.
- **`binDir` y `firstBase` de `aether-plan` y `run.workflow.js` no se tocan** (A4 de la spec). Los adaptadores de `codex` y `cursor` no cambian de comportamiento (R20): sus pruebas pasan sin cambiar su sentido.
- **Los nombres retirados no aparecen literales en `tests/`.** La lista cerrada de la spec la arma `tests/retired-patterns.js` por concatenación de fragmentos; una prueba que necesita poner la variable, crear el archivo o el diario viejo, o definir su propio patrón, concatena (`'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'`, `'.' + 'router' + '.json'`) o pide el patrón a ese ayudante. Ningún archivo de `tests/` contiene un patrón retirado entero, ni `tests/retired-patterns.js` mismo.
- **Los comentarios del código y las páginas de `docs/` van en inglés.** Los archivos de `specs/` no se tocan (los escribe solo el Lead); `scripts/`, `.specify/` y `.claude/` tampoco, salvo que un `Owns` los nombre.
- **El módulo de un barrido (tareas 13 a 18 y 20 a 28) sigue estas reglas**, que cada barrido cita por su número y que su prueba de grupo (`checkGroup` de `tests/guards-helpers.js`) comprueba:
  1. **Cabecera.** El primer bloque de comentario del archivo (después de `#!` y de `'use strict'`) dice en una o dos frases qué es el módulo y a qué lo llaman. En `plugins/aether/lib/**` el bloque lleva además una línea `// Family: <familia>.`: la familia es el prefijo del archivo antes del primer `-` (`lane`, `delegate`, `observe`, `seat`, `spend`, `plan`, `session`), `harness` para `lib/harness/*`, y para un archivo sin guion la que `docs/reference/components.md` (sección «Library families») le declara (`lane` para `lanes.js`, `seat` para `seats.js`, …); `none` si ahí está en la lista de módulos sueltos, que vale también para un archivo con guion sin hermanos (`first-setup.js`, `quota-refusal.js`). En `bin/` y en `hooks/` no hay línea de familia: la cabecera dice qué comando o qué pieza del mod es (en un bin, a qué `lib/` llama).
  2. **Comentarios.** Se lee cada comentario contra el código que describe y se reescribe o se borra el que cuenta una conducta que ya no existe (las opciones `lanes` y `seats`, el decider y `aether-route`, el diario del router, los formatos viejos, un nombre viejo de archivo o de función). Cada cita `A<n>`/`D<n>` (de `docs/decisions.md`) o `spec <NNN>`/`specs/<NNN>-` (una carpeta de `specs/`) nombra un número que existe y cuyo texto trata de lo que el comentario dice. Esto último lo decide la revisión módulo a módulo del supervisor, no una búsqueda.
  3. **Helpers repetidos (solo `lib/**`).** Una función que `checkGroup` informa como repetida se sustituye por un `require('./common.js')` (con un alias si el nombre local difiere) y se borra la definición local; si una prueba que el barrido no posee la importa de este módulo, el módulo conserva una línea que la reexporta. Los hooks del mod no importan `lib/`: R15 no los mide.
  4. **Nada sin uso.** Se borran los nombres de nivel superior que nadie usa en el archivo ni exporta, y los `require` sin uso.
  5. **Compatibilidad con formatos viejos (R4).** Una rama que lee un formato que ningún código del árbol escribe (se comprueba buscando quién lo escribe) se borra, con las pruebas que solo la fijaban si el barrido las posee; si no las posee, se deja y se dice en el informe.
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
- [ ] T003 [P] [US1] Las opciones `lanes` y `seats`, el legado de superdelegación, `.router.json` y los formatos viejos salen, con `tests/retired-patterns.js` → Task 3
- [ ] T004 [P] [US5] `tests/copies.test.js`, las copias declaradas y la coherencia de Muse entre las cuatro tablas de `config/` → Task 4
- [ ] T005 [US7] `waitForDelegate`, `lineText`, `LANE_NOTES`, los fixtures del router viejo y los imports sin uso → Task 5
- [ ] T006 [P] [US10] Las rutas personales de las fixtures del panel → Task 6
- [ ] T007 [US10] Los docs históricos salen del árbol; la sección «Library families» → Task 7
- [ ] T008 [P] [US2] El diario viejo del router no se lee en `/spend` ni en `aether-report` → Task 8
- [ ] T009 [US8] Los comandos sin llamador salen → Task 9
- [ ] T010 [P] [US3] `choose` solo da un modelo cuya lista `roles` permite el rol → Task 10
- [ ] T011 [US6] Se rompe el ciclo `lanes.js` ↔ `spend.js` con `lane-process.js` y `spend-tokens.js` → Task 11
- [ ] T012 [US6] Los bins solo leen argumentos y llaman a `lib/` → Task 12
- [ ] T013 [P] [US4] Barrido de `worktrees`, `globs`, `git`, `run` y `baseline` → Task 13
- [ ] T014 [P] [US4] Barrido de `lane-calls`, `lane-work`, `lane-schemas`, `lane-readings` y `lane-order` → Task 14
- [ ] T015 [P] [US4] Barrido de `observe`, `observe-calibrate`, `observe-detect`, `observe-redact` y `observe-baseline` → Task 15
- [ ] T016 [P] [US4] Barrido de `autonomy`, `guard`, `first-setup`, `voice` y `session` → Task 16
- [ ] T017 [P] [US4] Barrido de los hooks `register`, `ops-command`, `fault-trace`, `quota-brake` y `spend-view` → Task 17
- [ ] T018 [P] [US4] Barrido de los hooks `delegate`, `delegate-wait`, `panel-layout` y `panel-view` → Task 18
- [ ] T019 [US6] `router-*` pasa a `delegate-*` → Task 19
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
- [ ] T032 [US11] `tests/guards.test.js`: cabeceras, citas, capas, helpers, familias, nombres retirados en los docs y datos personales, sobre todo el árbol → Task 32

### Task 1: `lib/common.js`, el sitio de los helpers genéricos repetidos

**Aether:**
- Tier: haiku high — cuerpos que se copian tal cual de sus definiciones actuales y pruebas que fijan cada uno
- Area: lib-common
- Owns: `plugins/aether/lib/common.js`, `tests/common.test.js`
- Depends on: none
- Serves: R15

**Interfaces:** un módulo CommonJS sin dependencias de `lib/` salvo `./git.js` (para `removeWorktree`). Cada función toma su cuerpo, **copiado sin cambios**, de una de las definiciones repetidas actuales (para que `tests/guards-helpers.js` vea el cuerpo igual y los barridos puedan quitar las copias): `isObject(value)` (de `lanes.js`), `isNumber(value)` (de `pairs.js`), `numberOrZero(value)` (de `lanes.js`), `isText(value)` (de `delegate-run.js`), `messageOf(err)` (de `delegate-run.js`), `readJson(file)` (de `run.js`), `readJsonOrNull(file)` (de `lane-calls.js`), `readTextOrEmpty(file)` (de `lane-calls.js`), `parseJson(text)` (de `observe.js`; devuelve `undefined` si no es JSON), `writeAtomic(targetPath, content)` (de `lane-marks.js`), `writeFileAtomic(file, text)` (de `observe-digest.js`), `exists(target)` (de `lane-work.js`), `isExecutableFile(file)` (de `lanes.js`), `pidAlive(pid)` (de `delegate-run.js`), `killGroup(pid)` (de `delegate-calls.js`), `sleep(ms)` (de `lane-calls.js`, devuelve una promesa), `sleepSync(ms)` (de `lanes.js`), `nulEntries(text)` (de `worktrees.js`), `removeWorktree(mainRoot, worktree)` (de `seats.js`), `finishedResult(paths)` (de `lane-calls.js`). Exporta exactamente esos veinte nombres.

**Tests (write first):** `tests/common.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const common = require('../plugins/aether/lib/common.js')

test('common exports exactly the twenty helpers', () => {
  assert.deepEqual(Object.keys(common).sort(), ['exists', 'finishedResult', 'isExecutableFile', 'isNumber', 'isObject', 'isText', 'killGroup', 'messageOf', 'nulEntries', 'numberOrZero', 'parseJson', 'pidAlive', 'readJson', 'readJsonOrNull', 'readTextOrEmpty', 'removeWorktree', 'sleep', 'sleepSync', 'writeAtomic', 'writeFileAtomic'])
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

test('finishedResult returns the result only when done is true', (t) => {
  const dir = tempDir(t)
  const result = path.join(dir, 'result.json')
  assert.equal(common.finishedResult({ result }), null)
  fs.writeFileSync(result, '{"done":false}')
  assert.equal(common.finishedResult({ result }), null)
  fs.writeFileSync(result, '{"done":true,"value":1}')
  assert.deepEqual(common.finishedResult({ result }), { done: true, value: 1 })
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
- Tier: sonnet high — diseña las medidas de R7, R8, R14 y R15 y deja la forma que los barridos repiten; las pruebas fijan los casos pero no la forma
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

### Task 3: los nombres y registros retirados de C1 (opciones, legado, `.router.json`, formatos viejos)

**Aether:**
- Tier: sonnet high — toca el manifiesto, las dos copias de `resolveOption`, el bin de arranque y unos veinte archivos de prueba que ponían los nombres viejos como entrada
- Review: high — que el mod y la lib sigan iguales entre sí (`tests/panel-conformance.test.js`)
- Area: retire
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/session.js`, `plugins/aether/lib/run.js`, `plugins/aether/lib/report.js`, `plugins/aether/bin/aether-session-start`, `plugins/aether/hooks/panel-view.mjs`, `tests/retired-patterns.js`, `tests/retired-options.test.js`, `tests/helpers.js`, `tests/manifest.test.js`, `tests/docs-facts.test.js`, `tests/superdelegation.test.js`, `tests/superdelegation-gone.test.js`, `tests/panel-conformance.test.js`, `tests/panel-view.test.js`, `tests/delegate-settings.test.js`, `tests/session.test.js`, `tests/session-start.test.js`, `tests/session-start-autonomy.test.js`, `tests/quota-brake-settings.test.js`, `tests/report.test.js`, `tests/aether-report.test.js`, `tests/bootstrap-design.test.js`, `tests/bootstrap-names.test.js`, `tests/delegates-docs.test.js`, `tests/lanes-docs.test.js`, `tests/site.test.js`, `tests/spend-prune.test.js`, `tests/trim-router.test.js`
- Depends on: none
- Serves: R1, R2, R3, R4, R20

**Interfaces:**

- `tests/retired-patterns.js` exporta `GROUPS` (`{ options: RegExp[], journal: RegExp[], leftovers: RegExp[] }`) y `hits(groups, { docs = false } = {}): { file, line, text }[]`. Los patrones son los de la spec, armados con `new RegExp(['\\bCLAUDE_PLUGIN_OPTION_', 'LANES\\b'].join(''))` y similares (ningún fragmento forma un nombre retirado). Grupo `options`: (a) `CLAUDE_PLUGIN_OPTION_LANES`, `AETHER_LANES(?!_CONFIG)`, `lanes-as-on`, `lanes-ignored`, `source:\s*'lanes'`, `given\.lanes`; (b) `CLAUDE_PLUGIN_OPTION_SEATS`, `AETHER_SEATS`, `seats-ignored` y la expresión de perfil `\b(?:seats|AETHER_SEATS|CLAUDE_PLUGIN_OPTION_SEATS|--seats)["']?\s*(?:[:=]|\s)\s*["']?(?:robust|balanced|native)\b`; (c) `AETHER_SUPERDELEGATION_LEGACY`, `LEGACY_NOTES`, `legacyNotes`. Grupo `journal`: `\.router\.json\b`, `router/decisions\.jsonl`, los segmentos `'router', 'decisions.jsonl'`, `journalFile`, `readJournal`, `router-log`. Grupo `leftovers`: `waitForDelegate`, `lineText`, `LANE_NOTES`. `hits` busca en el árbol buscado: `plugins/aether/**`, `tests/**`, `scripts/**` (de `git ls-files`, sin binarios) y, con `docs: true`, también `README.md`, `CLAUDE.md`, `site/**` y `docs/**`; no entra `specs/**`, ni `docs/changelog.md`, ni los archivos de `docs/` que R21 retira (que la tarea 7 borra). `aether-report --seats` (el modo propio del informe, en `bin/aether-report` y `lib/report.js`) no es un acierto: la expresión de `--seats` solo acierta con un perfil dado como valor.
- Después de la tarea: `resolveOption(env)` devuelve `{ on: boolean, source: 'superdelegation' | 'default' }` (sin campo `legacy`), `lib/superdelegation.js` no exporta `legacyNotes`, y `settingsOf(options)` de `hooks/panel-view.mjs` ya no acepta `lanes` como entrada (sigue devolviendo `{ lanes: <el interruptor resuelto>, harnesses }`). `bin/aether-session-start` escribe en `CLAUDE_ENV_FILE` solo `export AETHER_SUPERDELEGATION=<on|off>\nexport AETHER_LANE_HARNESSES=<lista>\n`, y no añade nota de legado al contexto. `lib/session.js` ya no borra `<id>.router.json` ni acepta `haiku=` y `jev=` en `deadlines`; `lib/run.js` ya no reescribe `LEGACY_EXCLUDES`; `lib/report.js` ya no lee `AETHER_SUPERDELEGATION_LEGACY` ni lleva `legacyNotes`. De `report.js` `LEGACY_HARNESS` y de las demás ramas de compatibilidad que se encuentren: regla 5 de Global Constraints (se quitan solo si ningún código escribe ya la forma antigua; se comprueba con `git grep` del escritor).
- `plugin.json` pierde `lanes` y `seats` de `userConfig`; la descripción de `superdelegation` pierde «Replaces the lanes and seats options.»; la de `harnesses` gana, al final, la frase exacta `Codex and Cursor are not tested with a real account.`; `docs/guide/options.md` pierde las filas de las dos opciones y repite esa frase en la fila de `harnesses`.

**Tests (write first):** `tests/retired-options.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')
const { resolveOption } = require('../plugins/aether/lib/superdelegation.js')

const ROOT = path.join(__dirname, '..')
const LANES = 'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'
const SEATS = 'CLAUDE_PLUGIN_OPTION_' + 'SEA' + 'TS'
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))

test('no retired option name is in the searched tree (a, b, c)', () => {
  assert.deepEqual(hits(['options']), [])
})

test('the manifest declares neither retired option, and the option table has no row for them', () => {
  for (const key of ['lan' + 'es', 'sea' + 'ts']) {
    assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8'), new RegExp('^\\| `' + key + '` \\|', 'm'))
  }
  assert.doesNotMatch(manifest.userConfig.superdelegation.description, /Replaces the/)
})

test('a configuration that names the retired options has no effect', () => {
  assert.deepEqual(resolveOption({ [LANES]: 'true' }), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ [LANES]: 'true', [SEATS]: 'robust' }), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', [LANES]: 'false' }), { on: true, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', [LANES]: 'true' }), { on: false, source: 'superdelegation' })
  assert.equal(Object.hasOwn(resolveOption({ [LANES]: 'true' }), 'legacy'), false)
})

test("the mod's copy of the resolution ignores lanes as input and carries no legacy", async () => {
  const { settingsOf } = await import('../plugins/aether/hooks/panel-view.mjs')
  assert.equal(settingsOf({ ['lan' + 'es']: true }).lanes, false)
  assert.equal(settingsOf({ superdelegation: 'true', ['lan' + 'es']: 'false' }).lanes, true)
  assert.deepEqual(Object.keys(settingsOf({})).sort(), ['harnesses', 'lanes'])
})

test('codex and cursor are said to be untested with a real account, in the manifest and in the option table', () => {
  const sentence = 'Codex and Cursor are not tested with a real account.'
  assert.ok(manifest.userConfig.harnesses.description.includes(sentence))
  assert.ok(fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8').includes(sentence))
})
```

Pruebas existentes que cambian (cada una pierde la entrada vieja o la reconstruye por concatenación; ninguna aserción sobre lo vivo cambia): `tests/superdelegation.test.js` (se borran los casos de `resolveOption` con la opción vieja y `legacyNotes`), `tests/superdelegation-gone.test.js` (su lista de patrones literales pasa a `hits(['options'])`), `tests/manifest.test.js` (la desestructuración y las dos pruebas de `lanes` y `seats` se van; la lista de claves es `superdelegation, harnesses, ops, deadlines, quotabrake, brakepush, observedev`), `tests/docs-facts.test.js` (`GONE` por concatenación), `tests/session-start.test.js` y `tests/session-start-autonomy.test.js` y `tests/spend-prune.test.js` y `tests/bootstrap-names.test.js` (el archivo de entorno ya no lleva la línea del legado, y las listas de variables que se limpian pierden la de `LANES`), `tests/quota-brake-settings.test.js` (el texto exacto del archivo de entorno), `tests/helpers.js` (`AETHER_VARIABLES` pierde `AETHER_SUPERDELEGATION_LEGACY`; `tests/env-scrub.test.js` sigue en verde), `tests/session.test.js` y `tests/trim-router.test.js` (no se prueba ya el borrado del `.router.json`: la prueba nueva crea ese archivo, con el nombre armado por concatenación, y comprueba que el arranque lo deja donde está), `tests/delegate-settings.test.js`, `tests/panel-conformance.test.js` y `tests/panel-view.test.js` (la tabla ya no tiene entradas `lanes`), `tests/report.test.js` y `tests/aether-report.test.js` (el informe ya no nombra el legado), `tests/bootstrap-design.test.js`, `tests/delegates-docs.test.js`, `tests/lanes-docs.test.js` y `tests/site.test.js` (sus listas de nombres prohibidos se arman por concatenación).

**Acceptance:** `npm test` en verde; `hits(['options'])` da `[]`; `binDir` y `firstBase` siguen en `bin/aether-plan` y `workflows/run.workflow.js`; el manifiesto y la tabla de opciones coinciden (la prueba de `docs-facts` sigue en verde); la tarea cuenta en su informe cada rama de compatibilidad que encontró y si la quitó.

### Task 4: las copias declaradas y los datos de Muse

**Aether:**
- Tier: sonnet high — hay que leer las cuatro tablas y decidir, dato por dato, cuál es la fuente y cuál es una copia que una prueba guarda; la lista de abajo es el punto de partida y no está cerrada
- Area: data
- Owns: `tests/copies.test.js`, `plugins/aether/config/prices.json`, `plugins/aether/config/pairs.json`, `plugins/aether/config/lanes.json`, `plugins/aether/config/models/models.json`, `tests/muse-prices.test.js`, `tests/pairs.test.js`, `tests/prices.test.js`, `tests/lane-models.test.js`
- Depends on: none
- Serves: R9, R10, R11, R12

**Interfaces:** `tests/copies.test.js` lleva un arreglo `COPIES` de objetos `{ datum, source, copy, read, why }` (`source` y `copy` son archivos y `read` una función que saca el valor de cada uno: `require` cuando es un módulo CommonJS, el JSON, o una expresión regular sobre el texto de un `.mjs`, `.tsx` o una página) y una prueba por entrada que compara lo leído de la fuente con lo de la copia. Entradas de partida, que la tarea completa o corrige leyendo el código:

1. **harnesses**: `HARNESS_NAMES` de `lib/harness/index.js` (fuente) contra la copia de `hooks/panel-view.mjs`, la de `hooks/panel.test.tsx` (`NAMES`), las claves de `harnesses` de `config/lanes.json`, el campo `harnesses` de `config/models/models.json` (que añade `claude` al principio), la lista de la descripción de `harnesses` del manifiesto y la de `scripts/build-models-index.js`.
2. **clases irreversibles**: `CLASSES` de `lib/autonomy.js` (fuente) contra las clases que `lib/guard.js` detecta y contra la lista de `docs/guide/autonomy.md`.
3. **plazos**: `DEFAULT_DEADLINES.quotaMs` y `MAX_DEADLINE_MS` de `lib/session.js` (fuente) contra el valor por defecto `quota=3` del manifiesto y el tope «above 10 counts as 10» de su descripción y de `docs/guide/options.md`.
4. **esfuerzo de la escalera**: `effort.retry` de `config/ladder.json` contra lo que hace `effortFor` de `workflows/run.workflow.js` (lo que se puede comparar: el reintento de `haiku`). Los intentos por defecto del swarm, `DEFAULT_LADDER` de `lib/plan.js` (haiku 2, sonnet 2, opus 1), son otro dato que la escalera de delegates; se declaran como copia de lo que dicen `skills/tasks/SKILL.md` y `speckit/` (`Ladder: haiku 2, sonnet 2, opus 1`).
5. **Muse**: `config/prices.json`, `config/pairs.json`, `config/lanes.json` y `config/models/models.json` se comparan por el modelo `muse-wonder-full-1.0`: cada cifra (puntos de inteligencia, `terminalBench`, `slug`, precio) vive en una fuente o está declarada. La divergencia que ya tiene explicación del dueño (el par usa los puntos de Opus, 53,6, y `lanes.json` guarda 55,8 con su `ownerDecision`; el modelo no tiene precio de lista, `muse-wonder-1.0` y `muse-spark-1.3` son otros modelos) se declara con su razón en la entrada. Lo que diverge sin explicación se corrige en el archivo de `config/` que no es la fuente.

**Tests (write first):** `tests/copies.test.js`:

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

const COPIES = [
  { datum: 'the harness names, in the mod', source: () => require('../plugins/aether/lib/harness/index.js').HARNESS_NAMES,
    copy: () => quoted(read('plugins/aether/hooks/panel-view.mjs').match(/export const HARNESS_NAMES = \[([^\]]*)\]/)[1]),
    why: 'the mod never imports lib/' },
  { datum: 'the harness names, in the lane table', source: () => require('../plugins/aether/lib/harness/index.js').HARNESS_NAMES,
    copy: () => Object.keys(json('plugins/aether/config/lanes.json').harnesses), sort: true,
    why: 'one entry per harness the table knows' },
  // ... one entry for each of the data listed under Interfaces, 2 to 5, with its own source, copy and reason
]

for (const entry of COPIES) {
  test(`copy of ${entry.datum} equals its source`, () => {
    const a = entry.source()
    const b = entry.copy()
    assert.deepEqual(entry.sort ? [...b].sort() : b, entry.sort ? [...a].sort() : a)
  })
}

test('every declared copy says why it is a copy', () => {
  for (const entry of COPIES) assert.ok(typeof entry.why === 'string' && entry.why.length > 10, entry.datum)
})

test('a copy that drifts makes its test fail', () => {
  const drifted = { source: () => ['a', 'b'], copy: () => ['a'] }
  assert.throws(() => assert.deepEqual(drifted.copy(), drifted.source()))
})

test('Muse: the figures of muse-wonder-full-1.0 agree across the four tables, or the difference is declared', () => {
  const lanes = json('plugins/aether/config/lanes.json').harnesses.muse.models['muse-wonder-full-1.0']
  const pair = json('plugins/aether/config/pairs.json').pairs.find((p) => p.model === 'muse-wonder-full-1.0')
  const model = json('plugins/aether/config/models/models.json').models.find((m) => m.harness === 'muse' && m.model === 'muse-wonder-full-1.0')
  assert.ok(lanes && pair && model)
  assert.equal(pair.model, 'muse-wonder-full-1.0')
  // The declared differences: the pair carries Opus's points by the owner's decision (pair.ownerDecision, lanes ownerDecision).
  assert.ok(typeof pair.ownerDecision === 'string' && pair.ownerDecision.length > 0)
  assert.ok(typeof lanes.ownerDecision === 'string' && lanes.ownerDecision.length > 0)
  assert.equal(json('plugins/aether/config/prices.json').models['muse-wonder-full-1.0'], undefined, 'no list price: subscription only, say so in prices.json basis or sources')
})
```

(las entradas 2 a 5 se completan con el mismo molde; la prueba de Muse se ajusta a lo que la lectura de las cuatro tablas dé, y cada diferencia que se deja se escribe en la prueba con su razón.)

**Acceptance:** `node --test tests/copies.test.js tests/muse-prices.test.js tests/pairs.test.js tests/prices.test.js tests/lane-models.test.js` pasa; `COPIES` cubre las cinco clases de datos de C4 (precios y cifras de Muse, escalera de delegates, lista de harnesses, clases irreversibles, plazos); la escalera de delegates se lee solo de `config/ladder.json` (nada más en `lib/` ni en `hooks/` repite sus rungs, y la prueba lo busca); ninguna cifra de `config/` cambia salvo la que la tarea declara incoherente sin explicación y dice en su informe.

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
- Tier: sonnet high — repara enlaces, pruebas y citas de unas veinte páginas a la vez, y escribe la tabla de familias de la arquitectura
- Area: docs-remove
- Owns: `docs/handoff/**`, `docs/superpowers/**`, `docs/evaluations/**`, `docs/roadmap/**`, `docs/evidence/**`, `README.md`, `CLAUDE.md`, `docs/*.md`, `docs/guide/*.md`, `docs/reference/components.md`, `site/app.js`, `site/index.html`, `plugins/aether/skills/onboard/SKILL.md`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/docs-facts.test.js`, `tests/harness-lists.test.js`, `tests/launcher.test.js`, `tests/seats-harness.test.js`, `tests/components-docs.test.js`
- Depends on: Task 3 — `docs/guide/options.md`, `tests/docs-facts.test.js` y `tests/lanes-docs.test.js` los cambió la tarea 3
- Serves: R16, R21

**Interfaces:** salen del árbol (`git rm -r`) `docs/superpowers/`, `docs/evaluations/`, `docs/roadmap/`, `docs/evidence/`, y los archivos de `docs/handoff/` salvo `2026-10-26-model-effort-policy.md` (el último). Se queda todo lo demás de `docs/` (Assumptions 1 del plan). Cada enlace, cita en código entre comillas inversas, referencia de la prueba y entrada del índice que nombraba un documento retirado se repara: el enlace se quita (el texto queda) o apunta a lo que lo reemplaza; `docs/index.md` pierde la sección «The design record» salvo lo que sigue existiendo (`decisions.md`, `claude-code-research.md`, `aether-retrospective.md`, `models/README.md`, `specs/…`) y los enlaces a `specs/NNN-…/evidence/` del changelog y de `decisions.md` pasan a texto. `docs/changelog.md` solo cambia en esos enlaces. `tests/docs-facts.test.js` pierde de su lista los documentos retirados y su prueba R15 de la entrada del changelog deja de exigir el enlace a un handoff que salió (los encabezados de versión siguen fijando versión y orden); `tests/seats-harness.test.js` se borra (medía `docs/evaluations/seats/harness`), `tests/launcher.test.js` y `tests/harness-lists.test.js` pierden lo que fijaba esos documentos. `README.md`, `CLAUDE.md` y los textos de `site/` pierden las menciones a lo retirado. `docs/reference/components.md` gana, después de «The pieces», la sección `## Library families` con la tabla `| Family | Prefix | Members | Orchestrator or table |` y la línea `Loose modules (no family): …`, escritas **para la arquitectura final** de este plan (aunque algún archivo aún no exista): `lane` (`lane-`, orquestador `lanes.js`), `delegate` (`delegate-`, tabla `ladder.js`, con `delegate-marks`, `-pick`, `-quota`, `-renewal` y `-slow` que vienen de `router-*`), `observe` (`observe.js`), `seat` (`seat-`, `seats.js`), `spend` (`spend-`, `spend.js`, con `spend-archive.js` y `spend-tokens.js`), `plan` (`plan-`, `plan.js`, con `plan-compile.js`), `session` (`session-`, `session.js`, con `session-start.js`), `harness` (`lib/harness/`, `index.js`), y como módulos sueltos `autonomy.js`, `autonomy-command.js`, `baseline.js`, `common.js`, `exam.js`, `first-setup.js`, `git.js`, `globs.js`, `guard.js`, `pairs.js`, `pending.js`, `prices.js`, `quota-refusal.js`, `report.js`, `run.js`, `superdelegation.js`, `voice.js` y `worktrees.js`; `lane-command.js` es un miembro de `lane`. (`autonomy-command.js` queda declarado suelto: su prefijo no es una familia con más miembros.) La sección dice también que los datos de `<dataDir>/router/` conservan ese nombre aunque sus módulos sean `delegate-*`.

**Tests (write first):** `tests/components-docs.test.js` gana:

```js
test('components.md declares the library families, the orchestrator of each and the loose modules (R16)', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'components.md'), 'utf8')
  const section = text.split(/^## /m).find((part) => part.startsWith('Library families'))
  assert.ok(section, 'a section "Library families"')
  assert.match(section, /^\| Family \| Prefix \| Members \| Orchestrator or table \|$/m)
  for (const family of ['lane', 'delegate', 'observe', 'seat', 'spend', 'plan', 'session', 'harness']) assert.match(section, new RegExp(`^\\| ${family} \\|`, 'm'), family)
  assert.match(section, /^Loose modules \(no family\):.*`common\.js`/m)
})
```

y `tests/docs-facts.test.js` cambia lo que pinaba los documentos retirados (la lista de enlaces del índice, y la prueba de «la entrada del changelog con su handoff»). Después de la tarea: `git ls-files docs | grep -E "^docs/(handoff|superpowers|evaluations|roadmap|evidence)/"` da solo `docs/handoff/2026-10-26-model-effort-policy.md`.

**Acceptance:** `npm test` en verde (en particular `docs-facts`: enlaces, anclas, páginas enlazadas desde `docs/index.md`, rutas de código entre comillas existentes); ningún archivo fuera de los `Owns` cambia; la tarea necesita que el Lead haya quitado `specs/{006,008,009}/…/evidence` antes de la ola (paso L1 del plan) y lo dice en su informe si no.

### Task 8: el diario viejo del router no se lee

**Aether:**
- Tier: sonnet high — quita un lector del gasto de `/spend` y de `aether-report` y las pruebas que lo pinaban sin dejar la suma de otra fuente cambiada
- Area: retire
- Owns: `plugins/aether/lib/router-log.js`, `plugins/aether/lib/spend.js`, `plugins/aether/lib/delegate-report.js`, `tests/router-log.test.js`, `tests/no-router.test.js`, `tests/router-removed.test.js`, `tests/trim-router.test.js`, `tests/delegate-chain.test.js`, `tests/delegate-log.test.js`, `tests/delegate-report.test.js`, `tests/spend-fixtures.js`, `tests/spend-ladder.test.js`, `tests/spend-prune.test.js`, `tests/spend.test.js`, `tests/retired-journal.test.js`
- Depends on: Task 3 — `tests/retired-patterns.js`, y `tests/spend-prune.test.js` y `tests/trim-router.test.js`, que la tarea 3 ya cambió
- Serves: R3, R17

**Interfaces:** `lib/router-log.js` se borra; `lib/spend.js` ya no pide `./router-log.js` ni lee `<dataDir>/router/decisions.jsonl` (`readOutcomesIn(journalFile(…))` sale y el gasto de un id es el de las fuentes actuales: `usage/`, `lanes/` y el registro de delegates); `lib/delegate-report.js` ya no pide `readJournal` ni las filas del diario (`rowsOfJournal` sale con lo que solo él usaba). Ningún archivo `.router.json` ni `router/decisions.jsonl` se lee ni se borra.

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

**Acceptance:** `npm test` en verde; `hits(['journal'])` da `[]` salvo `.router.json`, que ya no aparece desde la tarea 3.

### Task 9: los comandos que ningún flujo llama

**Aether:**
- Tier: sonnet high — hay que decidir verbo por verbo con la lista cerrada de llamadores, leyendo las llamadas que se arman con variables
- Review: xhigh — quitar un verbo que un workflow, un hook o una skill sí llama rompe una corrida entera sin que el árbol lo diga
- Area: commands
- Owns: `plugins/aether/bin/*`, `tests/aether-autonomy.test.js`, `tests/aether-lane.test.js`, `tests/aether-plan.test.js`, `tests/aether-report.test.js`, `tests/aether-wt.test.js`, `tests/observe-bin.test.js`, `tests/spend-bin.test.js`, `tests/start-command.test.js`, `tests/commands.test.js`, `docs/guide/observe.md`, `docs/guide/delegates.md`, `docs/guide/lanes.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `tests/observe-docs.test.js`, `tests/delegate-docs.test.js`, `tests/quota-brake-docs.test.js`
- Depends on: Task 3 — `bin/aether-session-start`, `tests/aether-report.test.js` y los archivos de entorno
- Depends on: Task 5 — `tests/aether-lane.test.js`
- Depends on: Task 7 — las páginas de `docs/guide/` y su índice
- Serves: R19

**Interfaces:** «comando» es cada bin de `plugins/aether/bin/`, cada verbo que un bin expone (la línea `// aether-<bin> <verbo> …` de su cabecera de uso) y `scripts/aether-lead`. Cada uno se conserva solo si lo llama una fuente de la lista cerrada (workflows, `hooks.json`, `hooks/*.js` y `*.mjs`, `skills/**`, `agents/**`, `scripts/`), si es de los que quedan por nombre (`aether-report` entero, `aether-guard`, `aether-session-start`, `aether-observe hook`), o si es `aether-lead`. **Los verbos internos que un verbo conservado lanza en otro proceso** (`aether-lane _runner` y `_seat` los lanzan `start` y `seat-start`; `aether-delegate run` lo lanza `start`) forman parte de ese verbo: se conservan, y la prueba los declara en `INTERNAL`. Los candidatos que el plan midió sin llamador a la vista, que la tarea comprueba **leyendo el código que arma las llamadas** y no por texto: `aether-lane result`, `aether-observe read|baseline|status|forget`, `aether-delegate renew`, `aether-exam list`, `aether-autonomy brake-crossing`. `aether-delegate verdict --from-scratch` se conserva (lo usa el Lead por sus reglas). Un verbo quitado pierde su rama en el bin, su línea de la cabecera de uso y de `USAGE`, y la prueba de la rama; la función de `lib/` que solo él llamaba **no** se borra aquí (la borra el barrido del módulo): se lista en el informe. Las líneas de las páginas de `docs/guide/` y de sus pruebas que nombraban el verbo quitado se corrigen.

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
const INTERNAL = { 'aether-lane _runner': 'aether-lane start', 'aether-lane _seat': 'aether-lane seat-start', 'aether-delegate run': 'aether-delegate start' }

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
const callerText = CALLERS.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')

function verbsOf(bin) {
  const lines = fs.readFileSync(path.join(PLUGIN, 'bin', bin), 'utf8').split('\n').slice(0, 60)
  const verbs = new Set()
  for (const line of lines) {
    const m = line.match(new RegExp(`^//\\s+${bin}\\s+([_a-z][a-z-]*)`))
    if (m) verbs.add(m[1])
  }
  return [...verbs]
}

test('every bin has a caller of the closed list, or is kept by name', () => {
  for (const bin of fs.readdirSync(path.join(PLUGIN, 'bin'))) {
    assert.ok(BY_NAME.has(bin) || new RegExp(`\\b${bin}\\b`).test(callerText), `${bin} has no caller`)
  }
})

test('every verb of every bin has a caller of the closed list, is kept by name, or is internal to a verb that stays', () => {
  for (const bin of fs.readdirSync(path.join(PLUGIN, 'bin'))) {
    if (BY_NAME.has(bin)) continue
    for (const verb of verbsOf(bin)) {
      const name = `${bin} ${verb}`
      if (BY_NAME.has(name)) continue
      if (INTERNAL[name]) { assert.ok(callerText.includes(INTERNAL[name]) || INTERNAL[name].split(' ')[1], name); continue }
      assert.ok(new RegExp(`${bin}[^\\n]{0,80}\\b${verb}\\b`).test(callerText) || new RegExp(`['"\`]${verb}['"\`]`).test(callerText), `${name} has no caller`)
    }
  }
})

test('aether-delegate verdict --from-scratch stays (the Lead uses it by its rules)', () => {
  assert.match(fs.readFileSync(path.join(PLUGIN, 'bin', 'aether-delegate'), 'utf8'), /--from-scratch/)
})

test('scripts/aether-lead stays', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'aether-lead')))
})
```

(la tarea cierra el segundo caso a lo que el código dé: si una llamada se arma por variable —`aether-delegate ${verbo}`, un arreglo de verbos de `ops-command.mjs`— el verbo se admite y el arreglo o la variable se cita en el comentario del caso.)

**Acceptance:** `npm test` en verde; la lista de verbos quitados y la de funciones de `lib/` que quedaron sin llamador están en el informe; ninguna skill, agente, workflow ni hook nombra un verbo que ya no existe.

### Task 10: `choose` solo da un modelo cuyo `roles` permite el rol

**Aether:**
- Tier: opus high — es la función de la que cuelgan todas las llamadas externas y cuatro llamadores con roles distintos; un error manda una llamada a un modelo que no debía recibirla
- Review: xhigh — la elección decide qué CLI externa corre sin avisos de permiso con las credenciales del dueño fuera del entorno
- Area: roles
- Owns: `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/lane-pick.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/seats.js`, `plugins/aether/lib/router-pick.js`, `tests/superdelegation.test.js`, `tests/superdelegation-scenarios.test.js`, `tests/lane-pick.test.js`, `tests/lane-delegate.test.js`, `tests/lane-delegate-ladder.test.js`, `tests/lane-delegate-scenarios.test.js`, `tests/router-pick.test.js`, `tests/seats.test.js`, `tests/seats-design.test.js`, `tests/seat-partial.test.js`, `tests/seat-calls.test.js`, `tests/lane-fixtures.js`, `tests/workflow-superdelegation.test.js`, `tests/workflow-lanes.test.js`, `tests/workflow-final-slices.test.js`, `tests/workflow-design.test.js`, `tests/workflow-next-pair.test.js`
- Depends on: Task 3 — `lib/superdelegation.js` y `tests/superdelegation.test.js` los cambió la tarea 3
- Serves: R5, R6

**Interfaces:** `choose({ pairs, reference, harnesses, exclude = [], authors = [], nativeDiffers = false, authorRule = 'bar', role, lanes })` (`lib/superdelegation.js`). `role` es uno de `implementer`, `supervisor`, `reviewer`, `judge`, `writer`, `examiner` (obligatorio: otro valor, o ninguno, lanza `Error('role must be one of implementer, supervisor, reviewer, judge, writer, examiner, not <valor>')`); `lanes` es la tabla cargada (`lanes.loadConfig(...)`: `{ harnesses: { <harness>: { models: { <id>: { roles: string[] } } } } }`). Un par externo solo es candidato si `lanes.harnesses[par.harness].models[par.model].roles` incluye `role`; el que no lo cumple queda con `why: 'role'` (se evalúa después de `excluded` y antes de `author`) y sale en `candidates` como `outcome: 'passed'`. Un par externo sin entrada en la tabla no tiene lista y queda con `why: 'role'`. Los pares nativos no tienen lista `roles` y no se miran. Cuando ningún par externo de la tabla permite `role`, `picked` es `null`, `native` es el par nativo de la llamada y `reason` es exactamente `native <id del nativo>: no external model allows the role <role>` (más los sufijos de autor de hoy, si los hay); si algún externo permite el rol y los demás motivos lo dejan fuera, la razón es la de hoy. El rol de cada llamador: `lib/lane-pick.js` `pickCommand` pasa su `--role` (`implementer|supervisor|reviewer`); `lib/lane-delegate.js` pasa el `role` de `runLoop`; `lib/seats.js` `seatChoice` pasa el nombre del asiento (`judge|writer|examiner`); `lib/router-pick.js` `pairStep` pasa `reviewer` (un delegate de solo lectura: Assumptions 3 del plan). Cada uno pasa la tabla de lanes que ya tiene cargada.

**Tests (write first):** en `tests/superdelegation.test.js` (se dan los casos nuevos; los viejos pasan a llamar con `role` y `lanes`):

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
    const decision = call(role, ['implementer', 'supervisor', 'reviewer'].concat(role === 'judge' ? [] : []))
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
})
test('a missing or unknown role is an error', () => {
  assert.throws(() => choose({ pairs: [NATIVE], reference: { model: 'sonnet', effort: 'high' }, harnesses: {}, lanes: TABLE([]) }), /role must be one of/)
  assert.throws(() => call('nobody', ['implementer']), /role must be one of/)
})
```

Y, en cada llamador, una prueba en su archivo existente con las fixtures que ya tiene: `tests/lane-pick.test.js` (`pickCommand` con `--role supervisor` y una tabla donde el único externo lista solo `implementer`: `picked` es `null` y la razón nombra `supervisor`), `tests/seats-design.test.js` (el asiento `examiner` con un externo cuya lista no lo tiene: el asiento lo toma el par nativo y la razón nombra `examiner`; con la lista que sí lo tiene, el externo), `tests/lane-delegate.test.js` (un `reviewer` con un externo cuya lista no lo tiene: la llamada va al nativo), `tests/router-pick.test.js` (`pairStep` con un externo que solo lista `implementer`: `pick` es `null`).

**Acceptance:** `npm test` en verde; ningún `choose(` del árbol se llama sin `role`; `config/lanes.json` no cambia; el informe lista cada par que dejó de ser candidato con un rol que antes tomaba.

### Task 11: se rompe el ciclo `lanes.js` ↔ `spend.js`

**Aether:**
- Tier: opus high — es una capa que atraviesa nueve módulos y cuatro bins; un `require` perezoso mal movido cambia cuándo se lee la tabla
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
- Tier: sonnet high — mueve cuatro bloques de lógica a `lib/` sin cambiar una salida; las pruebas de los bins fijan el resultado pero no la forma
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
- Tier: sonnet high — comentarios que hay que leer contra un archivo de 1285 líneas y cuatro más
- Area: sweep-core
- Owns: `plugins/aether/lib/worktrees.js`, `plugins/aether/lib/globs.js`, `plugins/aether/lib/git.js`, `plugins/aether/lib/run.js`, `plugins/aether/lib/baseline.js`, `tests/guards-wt.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 3 — `lib/run.js`
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
- Tier: sonnet high — 1633 líneas de comentarios sobre llamadas a CLIs externas
- Area: sweep-lane
- Owns: `plugins/aether/lib/lane-calls.js`, `plugins/aether/lib/lane-work.js`, `plugins/aether/lib/lane-schemas.js`, `plugins/aether/lib/lane-readings.js`, `plugins/aether/lib/lane-order.js`, `tests/guards-lane-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 5 — `LANE_NOTES` salió de `lane-calls.js`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** los módulos de la lista, según las reglas 1 a 6, con `Family: lane.`. Las funciones repetidas que van a `common.js`: `readTextOrEmpty`, `readJsonOrNull`, `sleep`, `finishedResult`, `killGroup` (`killAgyGroup` es la misma función con otro nombre), `exists`. **`hasReset` (de `lane-readings.js`) y `loadTable` (de `lane-calls.js`) son los hogares de sus grupos:** se quedan aquí y se exportan; las copias de `router-quota.js` (tarea 19) y de `lane-pick.js` (tarea 24) los piden. Si `aether-lane result` salió (tarea 9) y `result` de `lane-calls.js` solo lo llamaba ese verbo, se lista en el informe.

**Tests (write first):** `tests/guards-lane-1.test.js`: `checkGroup('lane-1', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde; `hasReset` y `loadTable` están exportados.

### Task 15: barrido de `observe`, `observe-calibrate`, `observe-detect`, `observe-redact` y `observe-baseline`

**Aether:**
- Tier: sonnet high — módulos que deciden qué se guarda de una sesión; un comentario falso sobre qué se retiene engaña a quien audita la privacidad
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
- Tier: sonnet high — `guard.js` y `autonomy.js` deciden qué se rechaza; sus comentarios son la documentación de esas reglas
- Area: sweep-core
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/guard.js`, `plugins/aether/lib/first-setup.js`, `plugins/aether/lib/voice.js`, `plugins/aether/lib/session.js`, `tests/guards-core-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 3 — `lib/session.js`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6. `Family: none.` (`autonomy.js`, `guard.js`, `first-setup.js`, `voice.js` están declarados sueltos; `session.js` es el orquestador de `session`, `Family: session.`). `isExecutableFile` (en `first-setup.js`) sale a `common.js`. `guard.js` no cambia de comportamiento: su cabecera dice qué rutas protege hoy (specs, planes, tareas, constitución y, mientras exista la regla, la carpeta `docs/superpowers/`; el comentario lo dice como regla que sigue viva aunque la carpeta ya no esté) y qué clases de comando registra, y coincide con `CLASSES` de `autonomy.js`.

**Tests (write first):** `tests/guards-core-1.test.js`: `checkGroup('core-1', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde (`tests/guard.test.js` sin cambios).

### Task 17: barrido de los hooks `register`, `ops-command`, `fault-trace`, `quota-brake` y `spend-view`

**Aether:**
- Tier: sonnet high — piezas del mod que hacen llamadas sin modelo; los comentarios son su único contrato
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
- Tier: sonnet high — piezas del mod con copias declaradas de la lib
- Area: sweep-hooks
- Owns: `plugins/aether/hooks/delegate.mjs`, `plugins/aether/hooks/delegate-wait.mjs`, `plugins/aether/hooks/panel-layout.mjs`, `plugins/aether/hooks/panel-view.mjs`, `tests/guards-hooks-2.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 3 — `hooks/panel-view.mjs`
- Depends on: Task 5 — `delegate-wait.mjs` y `panel-layout.mjs`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — los verbos de `aether-delegate` que `delegate.mjs` llama
- Serves: R7, R8, R18

**Interfaces:** reglas 1, 2, 4, 5 y 6; no se importa `lib/`. El comentario de `panel-view.mjs` que cuenta cómo el mod copia la lista de harnesses y la regla del interruptor se reescribe para lo que hace hoy (sin la opción `lanes`) y dice que `tests/copies.test.js` y `tests/panel-conformance.test.js` la comparan.

**Tests (write first):** `tests/guards-hooks-2.test.js`: `checkGroup('hooks-2', [<las cuatro rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 19: las piezas `router-*` pasan a `delegate-*`

**Aether:**
- Tier: sonnet high — renombres de cinco módulos con sus pruebas y tres importadores, más el barrido de esos cinco
- Area: delegate-family
- Owns: `plugins/aether/lib/router-marks.js`, `plugins/aether/lib/router-pick.js`, `plugins/aether/lib/router-quota.js`, `plugins/aether/lib/router-renewal.js`, `plugins/aether/lib/router-slow.js`, `plugins/aether/lib/delegate-marks.js`, `plugins/aether/lib/delegate-pick.js`, `plugins/aether/lib/delegate-quota.js`, `plugins/aether/lib/delegate-renewal.js`, `plugins/aether/lib/delegate-slow.js`, `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/delegate-chain.js`, `plugins/aether/lib/lane-pick.js`, `plugins/aether/bin/aether-delegate`, `tests/router-marks.test.js`, `tests/router-pick.test.js`, `tests/router-quota.test.js`, `tests/router-renewal.test.js`, `tests/router-slow.test.js`, `tests/delegate-marks.test.js`, `tests/delegate-pick.test.js`, `tests/delegate-quota.test.js`, `tests/delegate-renewal.test.js`, `tests/delegate-slow.test.js`, `tests/delegate-chain.test.js`, `tests/lane-pick.test.js`, `tests/lane-refusal.test.js`, `tests/no-router.test.js`, `tests/router-removed.test.js`, `tests/superdelegation-gone.test.js`, `tests/guards-delegate-family.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de la familia `delegate`
- Depends on: Task 10 — `router-pick.js` y `lane-pick.js` ya pasan el rol a `choose`
- Depends on: Task 12 — `bin/aether-delegate` ya es el bin delgado
- Depends on: Task 14 — `hasReset` queda exportado de `lane-readings.js`
- Serves: R16, R7, R8, R15

**Interfaces:** `git mv` de `lib/router-marks.js`, `-pick.js`, `-quota.js`, `-renewal.js`, `-slow.js` a `lib/delegate-marks.js`, `-pick.js`, `-quota.js`, `-renewal.js`, `-slow.js` (mismos nombres de función exportada), de `tests/router-<parte>.test.js` a `tests/delegate-<parte>.test.js`, y cada `require` de ellos en `delegate-task.js`, `delegate-chain.js`, `lane-pick.js`, `bin/aether-delegate` y las pruebas que nombran `router-*` por su archivo. Los datos en disco **no** cambian de lugar: `<dataDir>/router/…` y `source: 'router'` se quedan, y la cabecera de cada módulo dice el nombre de la carpeta. Los cinco módulos se barren aquí (reglas 1 a 6, `Family: delegate.`; `hasReset` de `router-quota.js` pasa a pedirse a `./lane-readings.js`; `writeAtomic` de `delegate-marks.js` y `delegate-slow.js` es la de `common.js`; `pidAlive` de `delegate-renewal.js` también); de `delegate-task.js`, `delegate-chain.js` y `lane-pick.js` solo cambian las líneas `require` (sus barridos son las tareas 24, 25 y 26). `tests/no-router.test.js` y `tests/router-removed.test.js` pasan a mirar los nombres nuevos y siguen diciendo que el decider y `aether-route` no existen.

**Tests (write first):** `tests/guards-delegate-family.test.js`:

```js
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const test = require('node:test')
const { checkGroup } = require('./guards-helpers.js')

const NEW = ['marks', 'pick', 'quota', 'renewal', 'slow'].map((part) => `plugins/aether/lib/delegate-${part}.js`)
checkGroup('delegate-family', NEW)

test('no router-* module is left and nothing asks for one', () => {
  for (const part of ['marks', 'pick', 'quota', 'renewal', 'slow']) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', `router-${part}.js`)), false, part)
  }
  for (const file of NEW) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /require\('\.\/router-/)
})
```

**Acceptance:** `npm test` en verde; ningún archivo de `lib/` se llama `router-*`; el informe da la lista de archivos que cambió solo por la línea `require`.

### Task 20: barrido de los adaptadores `agy`, `codex`, `cursor`, `grok`, `structured` e `index`

**Aether:**
- Tier: sonnet high — los adaptadores de `codex` y `cursor` no se pueden probar con cuentas reales: el cambio es solo de importación y de comentario, y hay que demostrarlo
- Area: sweep-harness
- Owns: `plugins/aether/lib/harness/agy.js`, `plugins/aether/lib/harness/codex.js`, `plugins/aether/lib/harness/cursor.js`, `plugins/aether/lib/harness/grok.js`, `plugins/aether/lib/harness/structured.js`, `plugins/aether/lib/harness/index.js`, `tests/guards-harness-a.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup` y `adapterProblems`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 11 — `lib/lane-process.js`
- Serves: R14, R20, R7, R8, R15

**Interfaces:** cada adaptador pide `commandInstalled` a `../lane-process.js` y no pide `../lanes.js`; `defaultExec` de `agy.js` es la de `structured.js` (el hogar de su grupo); las demás reglas 1 a 6 con `Family: harness.` Las pruebas `tests/harness-agy.test.js`, `-codex.test.js`, `-cursor.test.js`, `-grok.test.js`, `-structured.test.js`, `-index.test.js` pasan **sin cambiar** (R20).

**Tests (write first):** `tests/guards-harness-a.test.js`: `checkGroup('harness-a', [<las seis rutas>])` (incluye `adapterProblems` para cada una).

**Acceptance:** `npm test` en verde; ninguna de las pruebas `tests/harness-*.test.js` aparece en `git diff --stat`.

### Task 21: barrido de `grok-acp`, `grok-quota` y `muse`

**Aether:**
- Tier: sonnet high — adaptadores con procesos y bloqueos; el cambio es de importación y comentario
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
- Tier: sonnet high — de aquí salen las cifras de `/spend` y del informe; un comentario falso sobre qué fuentes se leen engaña al dueño
- Area: sweep-spend
- Owns: `plugins/aether/lib/spend.js`, `plugins/aether/lib/spend-archive.js`, `plugins/aether/lib/report.js`, `plugins/aether/lib/prices.js`, `tests/guards-spend.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 3 — `lib/report.js`
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
- Tier: sonnet high — `plan.js` y `superdelegation.js` son contratos con el swarm; sus comentarios dicen cómo se lee un plan y cómo se elige un par
- Area: sweep-core
- Owns: `plugins/aether/lib/plan.js`, `plugins/aether/lib/pairs.js`, `plugins/aether/lib/superdelegation.js`, `plugins/aether/lib/quota-refusal.js`, `plugins/aether/lib/pending.js`, `tests/guards-core-2.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 10 — `lib/superdelegation.js` ya lleva `role`
- Serves: R4, R7, R8, R15

**Interfaces:** reglas 1 a 6. `plan.js` es el orquestador de `plan` (`Family: plan.`); `pairs.js`, `superdelegation.js`, `quota-refusal.js` y `pending.js` son sueltos. La cabecera de `plan.js` ya no dice que lee «un plan de superpowers más viejo» si ningún código ni prueba lo exige (regla 5: se comprueba con `git grep` de quién escribe ese formato); `DEFAULT_LADDER` y `MAX_AGENTS` son los de hoy. La cabecera de `superdelegation.js` dice la regla de elección con el límite de `roles` (R5, R6) y sus pruebas la fijan. `isNumber`/`isPoints` de `pairs.js` y `superdelegation.js` son `isNumber` de `common.js`.

**Tests (write first):** `tests/guards-core-2.test.js`: `checkGroup('core-2', [<las cinco rutas>])`.

**Acceptance:** `npm test` en verde (`tests/plan*.test.js` y `tests/aether-plan.test.js` sin cambiar su sentido).

### Task 24: barrido de `lane-delegate`, `lane-marks`, `lane-pick` y `lane-quota`

**Aether:**
- Tier: sonnet high — la elección de lanes y la edición de delegates en un worktree: comentarios que describen decisiones de varias specs
- Area: sweep-lane
- Owns: `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/lane-marks.js`, `plugins/aether/lib/lane-pick.js`, `plugins/aether/lib/lane-quota.js`, `tests/guards-lane-2.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 10 — `lane-pick.js` y `lane-delegate.js` ya pasan el rol
- Depends on: Task 14 — `loadTable` y `hasReset` ya tienen su hogar en `lane-calls.js` y `lane-readings.js`
- Depends on: Task 19 — `lane-pick.js` ya pide `delegate-quota.js`
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6 con `Family: lane.`; `loadTable` de `lane-pick.js` es la de `lane-calls.js` (la pide), `excludeList` de `lane-pick.js` **se queda como hogar** y se exporta (la copia de `seats.js` la quita la tarea 27); `writeAtomic` de `lane-pick.js` no es un grupo repetido si su cuerpo difiere (la medida decide), `writeAtomic` y `sleep` de `lane-marks.js` son los de `common.js`; `wait` es `sleep`.

**Tests (write first):** `tests/guards-lane-2.test.js`: `checkGroup('lane-2', [<las cuatro rutas>])`.

**Acceptance:** `npm test` en verde; `excludeList` está exportada de `lane-pick.js`.

### Task 25: barrido de `delegate-calls`, `-chain`, `-checks`, `-limits`, `-log` y `-report`

**Aether:**
- Tier: sonnet high — las seis piezas del registro y de la corrida de los delegates, con comentarios de tres specs
- Area: sweep-delegate
- Owns: `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/delegate-chain.js`, `plugins/aether/lib/delegate-checks.js`, `plugins/aether/lib/delegate-limits.js`, `plugins/aether/lib/delegate-log.js`, `plugins/aether/lib/delegate-report.js`, `tests/guards-delegate-1.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 8 — `lib/delegate-report.js` ya no lee el diario viejo
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 19 — las importaciones `delegate-*` de `delegate-chain.js`
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6 con `Family: delegate.`; `delegate-log.js` es el hogar de `isLaunch` (de `delegate-task.js`) y `isAttempt` (de `delegate-report.js`), que son el mismo predicado: una sola definición exportada de `delegate-log.js`; `removeWorktree`, `killGroup`, `readTextOrEmpty`, `nulEntries` de estos módulos son los de `common.js`.

**Tests (write first):** `tests/guards-delegate-1.test.js`: `checkGroup('delegate-1', [<las seis rutas>])`.

**Acceptance:** `npm test` en verde; `isLaunch` está exportado de `delegate-log.js`.

### Task 26: barrido de `delegate-run`, `delegate-task` y `ladder`

**Aether:**
- Tier: sonnet high — la escalera de delegates, con su decisión y su estado, en archivos de 558 y 350 líneas
- Area: sweep-delegate
- Owns: `plugins/aether/lib/delegate-run.js`, `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/ladder.js`, `tests/guards-delegate-2.test.js`
- Depends on: Task 25 — `isLaunch` queda exportado de `delegate-log.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 19 — las importaciones `delegate-*` de `delegate-task.js`
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6; `ladder.js` es la tabla de la familia `delegate` (`Family: delegate.`), lee `config/ladder.json` y ninguna otra fuente; `delegate-run.js` y `delegate-task.js` llevan `Family: delegate.`. `isLaunch` se pide a `delegate-log.js`; `isText`, `messageOf`, `pidAlive`, `sleep` (`realSleep`) son los de `common.js`.

**Tests (write first):** `tests/guards-delegate-2.test.js`: `checkGroup('delegate-2', [<las tres rutas>])`.

**Acceptance:** `npm test` en verde (`tests/ladder.test.js`, `tests/delegate-task.test.js` y `tests/delegate-run.test.js` sin cambiar su sentido).

### Task 27: barrido de `seats`, `seat-calls` y `exam`

**Aether:**
- Tier: sonnet high — `seats.js` tiene 1110 líneas de comentarios sobre los asientos de diseño
- Area: sweep-seat
- Owns: `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js`, `plugins/aether/lib/exam.js`, `tests/guards-seat.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `checkGroup`
- Depends on: Task 7 — la declaración de familias
- Depends on: Task 9 — lo que dejó sin llamador la retirada de verbos
- Depends on: Task 10 — `seats.js` ya pasa el rol
- Depends on: Task 24 — `excludeList` queda exportada de `lane-pick.js`
- Serves: R7, R8, R15, R18

**Interfaces:** reglas 1 a 6; `seats.js` es el orquestador de `seat` (`Family: seat.`), `seat-calls.js` lleva `Family: seat.` y `exam.js` es suelto (`Family: none.`). `excludeList` de `seats.js` se pide a `lane-pick.js`; `removeWorktree`, `killGroup`, `readTextOrEmpty`, `readJsonOrNull`, `finishedResult` y `sleep` son los de `common.js`. La cabecera de `seats.js` ya no cuenta los perfiles `native`, `balanced` y `robust` ni la opción `seats`.

**Tests (write first):** `tests/guards-seat.test.js`: `checkGroup('seat', [<las tres rutas>])`.

**Acceptance:** `npm test` en verde.

### Task 28: barrido de `observe-dev`, `observe-digest`, `observe-hook` y `observe-read`

**Aether:**
- Tier: sonnet high — `observe-dev.js` es el único archivo que lee una conversación: su cabecera debe decirlo con exactitud
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
- Tier: sonnet high — hay que leer cada decisión contra el código y la decisión que la reemplazó
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
- Tier: sonnet high — las afirmaciones se verifican contra el código y la configuración vigentes, una por una
- Area: docs-truth
- Owns: `README.md`, `CLAUDE.md`, `docs/reference/components.md`, `docs/guide/*.md`, `tests/docs-claims.test.js`
- Depends on: Task 7 — los enlaces y la sección «Library families»
- Depends on: Task 9 — los comandos y verbos que quedan
- Depends on: Task 10 — cómo elige modelo un rol (R5, R6)
- Depends on: Task 11 — las capas
- Depends on: Task 12 — los bins delgados y los módulos nuevos
- Depends on: Task 19 — las familias `delegate-*`
- Serves: R20, R22

**Interfaces:** se corrigen las afirmaciones de las clases que R22 nombra, en estos archivos: qué hace el guard y cada bin y verbo (las líneas «Entry and dormancy», «Bins are thin» y «`aether-guard` shapes…» de `CLAUDE.md`, y la tabla de comandos de `docs/reference/components.md`); qué opciones existen y su efecto (`CLAUDE.md` dice hoy que `lanes` y `seats` «stay only as legacy keys»; `docs/getting-started.md` queda para la tarea 31); cómo elige un modelo un rol y el repliegue nativo (`docs/guide/lanes.md`, `docs/guide/delegates.md`, `docs/guide/design-seats.md`, `docs/guide/models-by-role.md`: dicen que un modelo externo solo toma los roles de su lista `roles` y que, si ninguno lo permite, la llamada la toma el par nativo); qué fuentes lee el gasto (`docs/guide/maintenance.md`, `docs/guide/troubleshooting.md` y `CLAUDE.md`: ya no el diario del router); qué familias y capas hay (la arquitectura de `CLAUDE.md` y `components.md`: `lane-process`, `spend-tokens`, `plan-compile`, `session-start`, `autonomy-command`, `lane-command`, `common.js`, `delegate-*`); qué harnesses están probados (`docs/guide/lanes.md` y `docs/guide/options.md`: `codex` y `cursor` no están probados con una cuenta real, con la frase `Codex and Cursor are not tested with a real account.`). Toda cita a una decisión o spec nombra una que existe. Cada documento conserva sus anclas y enlaces.

**Tests (write first):** `tests/docs-claims.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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

test('no remaining document names a delegate file the way it was before the rename', () => {
  for (const rel of ['CLAUDE.md', 'README.md', 'docs/reference/components.md', ...fs.readdirSync(path.join(ROOT, 'docs/guide')).map((f) => `docs/guide/${f}`)]) {
    assert.doesNotMatch(read(rel), /router-(marks|pick|quota|renewal|slow)\.js/, rel)
  }
})
```

**Acceptance:** `npm test` en verde (`docs-facts` incluido); el informe lista cada afirmación que cambió, con el archivo de código que la verifica.

### Task 31: los demás documentos de `docs/` y el texto del sitio dicen lo que el código hace

**Aether:**
- Tier: sonnet high — las mismas afirmaciones en los documentos de método y en el sitio
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
- Tier: sonnet high — junta las medidas de la spec sobre todo el árbol y decide qué excepciones, con razón, quedan
- Area: guards
- Owns: `tests/guards.test.js`
- Depends on: Task 1 — `lib/common.js`
- Depends on: Task 2 — `tests/guards-helpers.js`
- Depends on: Task 4 — `tests/copies.test.js`
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
- Depends on: Task 19 — la familia `delegate`
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
- Serves: R7, R8, R14, R15, R16, R17, R18, R23, R24

**Interfaces:** `tests/guards.test.js` aplica las medidas de `tests/guards-helpers.js` a **todo** el árbol (no a un grupo) y añade las dos búsquedas de la spec que no son de un grupo; lo que no cumpla se arregla en el archivo que lo causa si está en los `Owns` de otra tarea ya fusionada, y si no se puede se deja como excepción con su razón en el propio test (nombre de la prueba que da un resultado distinto, en el caso de un grupo repetido) y se dice en el informe. No cambia ningún otro archivo.

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

test('R15: no helper is defined twice in lib/', () => {
  assert.deepEqual(g.duplicateGroups(LIB, {}), [])
})

test('R18: nothing defined or required is left unused', () => {
  const dead = FILES.flatMap((f) => g.deadNames(f, {}).map((name) => `${f}: ${name}`))
  assert.deepEqual(dead, [])
})

test('R16: every file of lib/ is in a family of the scheme or declared loose, and no family mixes two prefixes', () => {
  const names = LIB.map((f) => path.basename(f))
  const loose = declared.loose
  for (const f of LIB) {
    const family = g.expectedFamily(f, declared)
    assert.ok(typeof family === 'string', `${f}: ${family && family.problem}`)
  }
  for (const name of names) assert.doesNotMatch(name, /^(router|seats)-/, name)
  for (const [family, { orchestrator }] of declared.families) {
    if (orchestrator && orchestrator !== 'none') assert.ok(names.includes(orchestrator), `${family}: ${orchestrator} is not in lib/`)
    if (family !== 'harness') for (const name of names) if (name.startsWith(`${family}-`)) assert.ok(!loose.has(name), name)
  }
})

test('R17 and C1: no retired name is in the searched tree, with the documents that remain', () => {
  assert.deepEqual(hits(['options', 'journal', 'leftovers'], { docs: true }), [])
})

test('R23: no tracked file holds the owner\'s home folder or email', () => {
  const personal = [new RegExp('/home/' + 'dark' + 'arty'), new RegExp('christopher\\.hdez\\.10' + '@' + 'gmail')]
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
  const found = []
  for (const file of tracked) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz)$/i.test(file) || !fs.existsSync(path.join(ROOT, file))) continue
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const pattern of personal) if (pattern.test(text)) found.push(file)
  }
  assert.deepEqual(found, [])
})

test('R21: the retired document folders are gone and the last handoff stays', () => {
  const tracked = execFileSync('git', ['ls-files', 'docs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  assert.deepEqual(tracked.filter((f) => /^docs\/(superpowers|evaluations|roadmap|evidence)\//.test(f)), [])
  assert.deepEqual(tracked.filter((f) => f.startsWith('docs/handoff/')), ['docs/handoff/2026-10-26-model-effort-policy.md'])
  const specs = execFileSync('git', ['ls-files', 'specs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  assert.deepEqual(specs.filter((f) => /\/evidence\//.test(f)), [])
})
```

**Acceptance:** `npm test` en verde; el informe da, por cada prueba, cuántos archivos revisó; las excepciones que dejó, cada una con su razón, están en el propio archivo y en el informe. El Lead corre `npm run check` después de fusionar (R24).
