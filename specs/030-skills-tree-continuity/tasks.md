# Tasks: soporte formal de skills, un árbol de archivos ordenado y continuidad entre sesiones

**Spec:** [spec.md](spec.md)

## Global Constraints

- Esta sesión no tiene la herramienta Workflow: cada tarea la construye un delegado de la escalera, en su propia copia de trabajo, y el Lead las fusiona de una en una. Cada tarea cabe en un delegado: un área, un ciclo de editar y probar, entre 2 y 6 archivos de código con sus pruebas. Una tarea toca solo lo que dice su `Owns`; si una prueba de un archivo que no es suyo falla por culpa de su cambio, la tarea lo dice en su informe y no lo edita.
- Cada tarea empieza por las pruebas de su sección `Tests (write first)`: se escriben, se comprueba que fallan contra el código actual y solo entonces se escribe el código. Las pruebas de una tarea que ya existían y que cambian por el diseño nuevo se reescriben dentro de esa tarea.
- Antes de dar una tarea por terminada se corre `npm test` completo (es el comando de prueba de la corrida), y `npm run test:mod` cuando la tarea toca `hooks/*.mjs` o `hooks/*.test.ts`. Las pruebas de la tarea se corren con `node --test tests/<archivo>.test.js`.
- Cada módulo nuevo de `plugins/aether/lib/` empieza con un comentario de cabecera de al menos seis palabras que dice qué es y termina con la línea `// Family: <familia>.` (`continuity`, `tree`, `skill` o `tidy`, declaradas en `docs/reference/components.md` por la tarea 1). `lib/` no define un ayudante dos veces (`tests/guards.test.js`, R15), no deja nombres definidos o importados sin uso, no tiene ciclos y cada módulo se conserva en su capa (`tests/layers.test.js`). Un comentario no cita una decisión que `docs/decisions.md` aún no tiene (A111 y siguientes los escribe la tarea 38): cita «spec 030» y el número de requisito.
- Las pruebas usan `tests/helpers.js` (`tempDir`, `makeRepo`, `commitIn`, `useDataDir`) y repositorios, carpetas de memoria, `home`, `configDir`, `dataDir` y `procRoot` desechables, que reciben por parámetro o por el entorno de un proceso hijo. Ninguna prueba toca la red, llama a un modelo, lee o escribe un `.aether/` real, la memoria de Claude, `~/.agents/`, `~/.claude/` o una carpeta de proyecto del dueño. No se agrega ninguna variable de entorno `AETHER_*` (`tests/env-scrub.test.js`).
- Un hook o un bin nuevo sale con 0, sin salida y sin escribir ningún archivo cuando la sesión no es del Lead (`isAetherSession`, R40); nunca falla ni imprime por un error propio. Nada de lo que agrega esta tarea llama a un modelo (R41).
- Los textos que el código arma (avisos, mensajes de la guarda) van en inglés y en español cuando el aviso es para el dueño (`isSpanish` de `lib/continuity-store.js`, tarea 1); lo que lee el Lead va en inglés.
- Los bins de esta rama se llaman por su ruta (`node plugins/aether/bin/aether-<nombre>`), no por el `PATH`. Ninguna tarea toca un archivo bajo `specs/` ni `.specify/`, y ninguna ejecuta una acción irreversible (`merge-main`, `push`, `publish`, `deploy`, `delete`, `skill-install`, `paid-call`).
- Cada parte de `aether-session-start` queda en 9.800 caracteres o menos (`tests/session-start-parts.test.js`).
- Los nombres de los avisos y los límites son datos de un módulo (constantes exportadas), no números sueltos: 200 renglones de `CLAUDE.md` y `AGENTS.md` (A5), 24 horas de `tmp/` y 7 días de seats (A6), 30 días de notas (A6), 500 renglones por skill, 3 skills y 1.500 renglones pegados (A7), 12 horas de una marca vieja y 2 horas de actividad (A18).

## Aether Execution
- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [US1, US4] Guardar la nota de sesión, la carpeta de memoria y la identidad del proceso, en `plugins/aether/lib/continuity-store.js` → Task 1
- [ ] T002 [US1, US5] Guardar el repositorio, el proceso y la última actividad en la marca de sesión, en `plugins/aether/lib/session.js` → Task 2
- [ ] T003 [US1, US2, US3, US4] Escribir la nota con los hooks de `aether-continuity` y registrarlos en `plugins/aether/hooks/hooks.json` → Task 3
- [ ] T004 [P] [US1, US2, US5, US6] Componer las 3 a 5 líneas del aviso de continuidad, en `plugins/aether/lib/continuity-notice.js` → Task 4
- [ ] T005 [P] [US8] Despachar los PostToolUse y recordar que el estado va a la continuidad, en `plugins/aether/lib/continuity-posttool.js` → Task 5
- [ ] T006 [US1, US2, US3, US5, US6, US7] Abrir la nota, avisar y podar en `plugins/aether/lib/session-start.js` → Task 6
- [ ] T007 [P] [US9] Retirar `/aether:onboard` → Task 7
- [ ] T008 [US16, US17] Clasificar las rutas de `.claude` y dejar pasar `skills/` y `rules/` en `plugins/aether/lib/continuity-permission.js` → Task 8
- [ ] T009 [US10] Revisar `CLAUDE.md` y `AGENTS.md` tras editarlos, en `plugins/aether/lib/tree-check.js` → Task 9
- [ ] T010 [P] [US11] Llevar `AGENTS.md` en las llamadas a otros harness, en `plugins/aether/lib/lane-calls.js` → Task 10
- [ ] T011 [US16, US15] Rechazar escribir la configuración y los hooks de Claude Code y vigilar el examen en su lugar nuevo, en `plugins/aether/lib/guard.js` → Task 11
- [ ] T012 [US12] Mover lo temporal de las copias de trabajo a `.aether/tmp/`, en `lib/run.js`, `lib/worktrees.js` y `lib/lane-work.js` → Task 12
- [ ] T013 [US12] Mover el examen a `.aether/exam/`, en `lib/exam.js` y `lib/seats.js` → Task 13
- [ ] T014 [US12] Escribir el mapa `.aether/README.md` y comprobar que cada ruta está en él, en `plugins/aether/lib/tree-map.js` → Task 14
- [ ] T015 [US13] Limpiar el arranque y llevar el sello por proyecto, en `plugins/aether/lib/tree-clean.js` → Task 15
- [ ] T016 [US14] Migrar el estado viejo de `.aether/` sin perder trabajo, en `plugins/aether/lib/tree-migrate.js` → Task 16
- [ ] T017 [US12, US13, US14] Ordenar el arranque: decidir, mapa, limpieza y migración, en `plugins/aether/lib/session-start.js` → Task 17
- [ ] T018 [US18, US19, US20, US21] Clasificar las skills y las fuentes de instalación, en `plugins/aether/lib/skill-rules.js` → Task 18
- [ ] T019 [US19, US20, US21] Agregar la clase `skill-install` y el verbo `trust`, en `plugins/aether/lib/autonomy.js` → Task 19
- [ ] T020 [P] [US19] Llevar el registro de instalaciones y la comprobación del lock, en `plugins/aether/lib/skill-registry.js` → Task 20
- [ ] T021 [P] [US22, US23] Leer, comprobar y pegar las skills de un encargo, en `plugins/aether/lib/skill-brief.js` → Task 21
- [ ] T022 [US22, US23] Leer el campo `Skills:` de `tasks.md` y escribirlo en cada encargo, en `plugins/aether/lib/plan.js` → Task 22
- [ ] T023 [US22, US23] Leer `AETHER-SKILLS:` en el encargo del delegado, en `plugins/aether/lib/delegate-task.js` → Task 23
- [ ] T024 [US24] Revisar una skill recién creada, en `plugins/aether/lib/skill-review.js` → Task 24
- [ ] T025 [P] [US24] Avisar de un hallazgo repetido entre tareas, en `plugins/aether/lib/skill-repeat.js` → Task 25
- [ ] T026 [US18, US19, US20, US21, US24] Aplicar las reglas de skills en la guarda, en `plugins/aether/lib/guard.js` → Task 26
- [ ] T027 [US25] Hallar las skills sin uso, en `plugins/aether/lib/skill-idle.js` → Task 27
- [ ] T028 [US19, US24] Sumar el registro, la revisión y el hallazgo repetido al despachador de PostToolUse → Task 28
- [ ] T029 [P] [US26] Escribir las skills `aether:skills` y `aether:art-direction` y la línea del Writer → Task 29
- [ ] T030 [US24, US26] Escribir las reglas del Lead sobre skills, continuidad y orden, en `skills/using-aether/SKILL.md` → Task 30
- [ ] T031 [US27] Detectar el desorden de un proyecto, en `plugins/aether/lib/tidy-detect.js` → Task 31
- [ ] T032 [US28] Entregar el informe de `aether:tidy` con `aether-doctor tidy`, en `plugins/aether/lib/tidy-report.js` → Task 32
- [ ] T033 [US29] Frenar en la guarda los borrados que `aether:tidy` ordena, en `plugins/aether/lib/tidy-guard.js` → Task 33
- [ ] T034 [US28, US29] Escribir la skill `aether:tidy` → Task 34
- [ ] T035 [US25, US27] Avisar al arrancar de las skills sin uso y del desorden, en `plugins/aether/lib/session-start.js` → Task 35
- [ ] T036 [P] [US1, US10, US12, US18] Escribir la guía en inglés y en español, en `docs/guide/project-files-and-skills.md` → Task 36
- [ ] T037 [US6, US8, US12] Poner al día las páginas de rutas y hooks, medir la huella dormida y probar que nada corre fuera del Lead → Task 37
- [ ] T038 [US9] Registrar las decisiones A111 en adelante, en `docs/decisions.md` → Task 38
- [ ] T039 [US9] Subir la versión a 0.35.0 en todos los lugares donde vive y escribir el changelog → Task 39
- [ ] T040 [US12] Mover las copias de lanes a `.aether/worktrees/lanes/` y barrerlas en los dos lugares, en `lib/worktrees.js` y `lib/lane-work.js` → Task 40
- [ ] T041 [US12] Mover el trabajo de seats y delegados y el mensaje de una ronda a su lugar nuevo, en `lib/seats.js`, `lib/seat-calls.js` y `lib/delegate-calls.js` → Task 41

---

### Task 1: Guardar la nota de sesión, la carpeta de memoria y la identidad del proceso

**Aether:**
- Area: continuity
- Owns: `plugins/aether/lib/continuity-store.js`, `tests/continuity-store.test.js`, `docs/reference/components.md`, `tests/helpers.js`, `tests/session-start.test.js`, `tests/session-start-parts.test.js`, `tests/session-start-autonomy.test.js`, `tests/no-real-config.test.js`
- Depends on: none
- Serves: R1, R8, R44

**Interfaces:**

En `plugins/aether/lib/continuity-store.js` (`// Family: continuity.`), todo exportado:

- `NOTE_VERSION = 1`, `MAX_MESSAGE = 2000`, `MAX_SUMMARY = 8000`, `NOTE_DAYS = 30`.
- `isSpanish(env = process.env)`: `true` cuando el primero de `LC_ALL`, `LC_MESSAGES` y `LANG` que no está vacío empieza por `es` (sin distinguir mayúsculas).
- `memoryDir({ cwd, env = process.env, home = os.homedir() })`: la carpeta de memoria de Claude del proyecto, sin crearla. En este orden: (1) `autoMemoryDirectory` de `<configDir>/settings.json` (una ruta absoluta tal cual, o `~/…` bajo `home`); (2) `<configDir>/projects/<CLAUDE_CODE_PROJECT_DIR_NAME>/memory`; (3) `<configDir>/projects/<nombre>/memory`, con `nombre` la ruta principal del repositorio (`repoPaths(cwd).mainRoot`, o `path.resolve(cwd)` fuera de git) con cada carácter que no es letra ni dígito cambiado por `-`. `configDir` es `env.CLAUDE_CONFIG_DIR` o `<home>/.claude`.
- `continuityDir(options)` es `path.join(memoryDir(options), 'continuity')`.
- `claudeProcess({ procRoot = '/proc', from = process.ppid } = {})` devuelve `{ pid, start }` del primer proceso, subiendo desde `from` por `ppid`, cuyo `comm` es `claude` (`start` es el campo 22 de `<procRoot>/<pid>/stat`, un número), o `null` cuando no hay `/proc`, no hay proceso `claude` o la cadena se corta o da una vuelta.
- `processState(proc, { procRoot = '/proc' } = {})` devuelve `'unknown'` cuando `proc` es `null` o `procRoot` no existe, `'alive'` cuando `<procRoot>/<pid>/stat` existe y su hora de arranque es `proc.start`, y `'gone'` en cualquier otro caso (el proceso no existe o el id lo reutiliza otro).
- `noteFile(dir, sessionId)` es `path.join(dir, `${sessionId}.json`)`; lanza `invalid session id: …` con un id vacío, con `/`, `\`, `..` o que no es un texto.
- `writeNote(dir, note)` escribe la nota de forma atómica (`writeFileAtomic` de `lib/common.js`) con `version: NOTE_VERSION`, recorta `lastMessage` a `MAX_MESSAGE` y `compactSummary` a `MAX_SUMMARY` (si pasa el tope, `texto.slice(0, tope - 1) + '…'`), pone `updatedAt: Date.now()` si la nota no trae uno, y devuelve la ruta.
- `readNote(dir, sessionId)` devuelve la nota o `null` si no existe, no se puede leer o su `version` no es `NOTE_VERSION`.
- `updateNote(dir, sessionId, patch)` lee la nota, le mezcla `patch` (con `updatedAt: Date.now()` si `patch` no lo trae), la escribe y la devuelve; `null` si la nota no existe.
- `readNotes(dir)` devuelve las notas legibles de `dir` (`*.json` con la versión vigente), la más reciente primero por `updatedAt`; `[]` si `dir` no existe.
- `pruneNotes(dir, { cwd, now = Date.now(), days = NOTE_DAYS } = {})` borra las notas de más de `days` días y las de trabajo fusionado, nunca la más reciente, y devuelve los ids borrados. Una nota es de trabajo fusionado cuando existe otra más nueva y su `commit` es ancestro de la punta de la rama principal de `cwd` (`origin/HEAD` si existe; si no `main`; si no `master`), comprobado con `git merge-base --is-ancestor`; sin `commit` o sin rama principal no se tiene por fusionada.

**Aislamiento de las pruebas (antes de que exista ningún código de continuidad).** Las pruebas existentes pasan `process.env` a los hooks y a los bins, y desde la tarea 3 esos procesos escriben notas bajo `<configDir>/projects/…/memory/continuity/` y leen `~/.agents/`: sin cambio, una corrida de `npm test` escribiría en el `~/.claude/projects/` real. Por eso esta tarea hace que `tests/helpers.js`, igual que ya borra las variables `AETHER_*` y apunta `AETHER_LANES_CONFIG` a un archivo que falta, apunte por defecto `CLAUDE_CONFIG_DIR` y `HOME` a una carpeta temporal (`fs.mkdtempSync` en `os.tmpdir()`, creada al cargar el archivo y borrada al salir el proceso con `process.on('exit', …)`), exporte `REAL_HOME` (el `os.userInfo().homedir` de antes del cambio), apunte `GIT_CONFIG_GLOBAL` al `.gitconfig` global real (`$REAL_HOME/.gitconfig`, o el que `git config --global --show-origin --list` nombra) para que git se comporte como antes con el `HOME` temporal (nombre, correo, `init.defaultBranch`), y deje que una prueba que necesita otra carpeta las ponga a propósito. Los constructores de entorno de `tests/session-start.test.js` (`hookEnv`), `tests/session-start-parts.test.js` y `tests/session-start-autonomy.test.js` (y el `run` de `tests/helpers.js`) conservan esas dos variables: no las borran ni las vuelven a apuntar a la carpeta real. Las tareas siguientes cuentan con este aislamiento.

En `docs/reference/components.md`, la tabla «Library families» gana cuatro filas, con orquestador `none`: `continuity` (prefijo `continuity-`; miembros `continuity-store.js`, `continuity-hook.js`, `continuity-notice.js`, `continuity-posttool.js`, `continuity-permission.js`), `tree` (`tree-`; `tree-paths.js`, `tree-check.js`, `tree-map.js`, `tree-clean.js`, `tree-migrate.js`), `skill` (`skill-`; `skill-rules.js`, `skill-registry.js`, `skill-brief.js`, `skill-review.js`, `skill-repeat.js`, `skill-idle.js`) y `tidy` (`tidy-`; `tidy-detect.js`, `tidy-report.js`, `tidy-guard.js`). Ningún otro cambio en esa página.

**Tests (write first):**

`tests/continuity-store.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')

const encode = (p) => p.replace(/[^A-Za-z0-9]/g, '-')

// A fake /proc: one directory per process with comm and stat (the start time is field 22).
function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}

test('isSpanish reads LC_ALL, then LC_MESSAGES, then LANG', () => {
  assert.equal(store.isSpanish({ LANG: 'es_MX.UTF-8' }), true)
  assert.equal(store.isSpanish({ LC_ALL: 'en_US.UTF-8', LANG: 'es_MX.UTF-8' }), false)
  assert.equal(store.isSpanish({ LC_ALL: '', LANG: 'ES_ES' }), true)
  assert.equal(store.isSpanish({}), false)
})

test('memoryDir follows autoMemoryDirectory, then the project name variable, then the derived name; a worktree shares the main checkout memory (A15, R1)', (t) => {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-config-')
  const home = tempDir(t, 'aether-home-')
  const env = { CLAUDE_CONFIG_DIR: configDir }
  const derived = path.join(configDir, 'projects', encode(repo.dir), 'memory')
  assert.equal(store.memoryDir({ cwd: repo.dir, env, home }), derived)
  const copy = path.join(tempDir(t, 'aether-copy-'), 'wt')
  repo.git('worktree', 'add', '-q', copy, '-b', 'other')
  assert.equal(store.memoryDir({ cwd: copy, env, home }), derived)
  assert.equal(store.memoryDir({ cwd: repo.dir, env: { ...env, CLAUDE_CODE_PROJECT_DIR_NAME: 'named' }, home }), path.join(configDir, 'projects', 'named', 'memory'))
  fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ autoMemoryDirectory: '~/mem' }))
  assert.equal(store.memoryDir({ cwd: repo.dir, env: { ...env, CLAUDE_CODE_PROJECT_DIR_NAME: 'named' }, home }), path.join(home, 'mem'))
  fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ autoMemoryDirectory: '/abs/mem' }))
  assert.equal(store.memoryDir({ cwd: repo.dir, env, home }), '/abs/mem')
  assert.equal(store.continuityDir({ cwd: repo.dir, env, home }), path.join('/abs/mem', 'continuity'))
})

test('memoryDir outside git names the folder after the working directory', (t) => {
  const dir = tempDir(t)
  const configDir = tempDir(t, 'aether-config-')
  assert.equal(store.memoryDir({ cwd: dir, env: { CLAUDE_CONFIG_DIR: configDir }, home: configDir }), path.join(configDir, 'projects', encode(dir), 'memory'))
})

test('claudeProcess climbs the parents of the hook to the claude process; it is null without claude or without /proc (D2)', (t) => {
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, {
    300: { comm: 'node', ppid: 200, start: 9100 },
    200: { comm: 'bash', ppid: 100, start: 9000 },
    100: { comm: 'claude', ppid: 1, start: 555 },
    1: { comm: 'init', ppid: 0, start: 1 },
  })
  assert.deepEqual(store.claudeProcess({ procRoot: proc, from: 300 }), { pid: 100, start: 555 })
  assert.equal(store.claudeProcess({ procRoot: proc, from: 1 }), null)
  assert.equal(store.claudeProcess({ procRoot: path.join(proc, 'missing'), from: 300 }), null)
  fakeProc(proc, { 400: { comm: 'node', ppid: 401, start: 1 }, 401: { comm: 'node', ppid: 400, start: 2 } })
  assert.equal(store.claudeProcess({ procRoot: proc, from: 400 }), null, 'a cycle ends the climb')
})

test('processState: alive, gone, or unknown; a reused pid with another start time is gone (R6)', (t) => {
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  assert.equal(store.processState({ pid: 100, start: 555 }, { procRoot: proc }), 'alive')
  assert.equal(store.processState({ pid: 100, start: 556 }, { procRoot: proc }), 'gone')
  assert.equal(store.processState({ pid: 101, start: 1 }, { procRoot: proc }), 'gone')
  assert.equal(store.processState(null, { procRoot: proc }), 'unknown')
  assert.equal(store.processState({ pid: 100, start: 555 }, { procRoot: path.join(proc, 'nope') }), 'unknown')
})

test('writeNote, readNote, updateNote and readNotes keep one JSON file per session, clip long text and skip what cannot be read (R1)', (t) => {
  const dir = path.join(tempDir(t), 'continuity')
  const file = store.writeNote(dir, { session: 's1', updatedAt: 10, lastMessage: 'x'.repeat(5000), compactSummary: 'y'.repeat(9000), branch: 'main' })
  assert.equal(file, path.join(dir, 's1.json'))
  const note = store.readNote(dir, 's1')
  assert.equal(note.version, store.NOTE_VERSION)
  assert.equal(note.lastMessage.length, store.MAX_MESSAGE)
  assert.ok(note.lastMessage.endsWith('…'))
  assert.equal(note.compactSummary.length, store.MAX_SUMMARY)
  const merged = store.updateNote(dir, 's1', { branch: 'feat', updatedAt: 20 })
  assert.deepEqual([merged.branch, merged.updatedAt, merged.session], ['feat', 20, 's1'])
  assert.equal(store.updateNote(dir, 'nobody', { branch: 'x' }), null)
  store.writeNote(dir, { session: 's2', updatedAt: 30 })
  fs.writeFileSync(path.join(dir, 'bad.json'), '{')
  fs.writeFileSync(path.join(dir, 's3.json'), JSON.stringify({ version: 2, session: 's3', updatedAt: 99 }))
  assert.deepEqual(store.readNotes(dir).map((n) => n.session), ['s2', 's1'])
  assert.equal(store.readNote(dir, 's3'), null)
  assert.equal(store.readNote(dir, 'bad'), null)
  assert.deepEqual(store.readNotes(path.join(dir, 'missing')), [])
  for (const bad of ['', '../x', 'a/b', 'a\\b', null, 42]) assert.throws(() => store.noteFile(dir, bad), /invalid session id/, String(bad))
})

test('pruneNotes deletes notes of more than 30 days and of merged work with a newer note, and never the newest note (R8, A12)', (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', '-c', 'work')
  fs.writeFileSync(path.join(repo.dir, 'w.txt'), 'w')
  repo.git('add', 'w.txt')
  repo.git('commit', '-q', '-m', 'work')
  const unmerged = repo.git('rev-parse', 'HEAD')
  const dir = path.join(tempDir(t), 'continuity')
  const now = Date.parse('2026-11-07T12:00:00Z')
  const day = 86400000
  const put = (session, commit, age) => store.writeNote(dir, { session, commit, branch: 'x', updatedAt: now - age * day })
  put('old', unmerged, 31)
  put('merged', base, 2)
  put('open', unmerged, 1)
  put('newest', base, 0)
  assert.deepEqual(store.pruneNotes(dir, { cwd: repo.dir, now }).sort(), ['merged', 'old'])
  assert.deepEqual(store.readNotes(dir).map((n) => n.session), ['newest', 'open'])
  const alone = path.join(tempDir(t), 'continuity')
  store.writeNote(alone, { session: 'only', commit: base, updatedAt: now - 40 * day })
  assert.deepEqual(store.pruneNotes(alone, { cwd: repo.dir, now }), [], 'the only note of the project stays')
  assert.deepEqual(store.pruneNotes(path.join(alone, 'missing'), { cwd: repo.dir, now }), [])
})
```

`tests/no-real-config.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { REAL_HOME, SESSION_BIN, PLUGIN, LEAD_START, makeRepo, tempDir, runSessionStart } = require('./helpers.js')

const realProjects = path.join(REAL_HOME, '.claude', 'projects')
const continuityFiles = () => (fs.existsSync(realProjects) ? fs.readdirSync(realProjects, { recursive: true }).filter((e) => e.includes(`${path.sep}continuity${path.sep}`)).sort() : [])

test('a test run points the Claude config folder and the home at a temporary folder, not at the real ones', () => {
  assert.ok(REAL_HOME && REAL_HOME !== os.tmpdir())
  for (const name of ['CLAUDE_CONFIG_DIR', 'HOME']) {
    assert.ok(process.env[name] && process.env[name].startsWith(fs.realpathSync(os.tmpdir())) , `${name} is ${process.env[name]}`)
    assert.ok(!process.env[name].startsWith(REAL_HOME), `${name} is not under the real home`)
  }
  assert.equal(os.homedir(), process.env.HOME)
})

test('a Lead session started through the helpers writes nothing under the real ~/.claude/projects (R44)', (t) => {
  const before = continuityFiles()
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  const r = runSessionStart(repo.dir, env, { ...LEAD_START, session_id: 'isolation-check' })
  assert.equal(r.status, 0)
  assert.deepEqual(continuityFiles(), before)
  assert.ok(SESSION_BIN)
})
```

En `tests/components-docs.test.js` o `tests/docs-facts.test.js` no se agrega nada: las pruebas existentes de `docs/reference/components.md` (`tests/components-docs.test.js`, `tests/guards.test.js` R16) deben seguir pasando con las cuatro filas nuevas.

**Acceptance:**

- `node --test tests/continuity-store.test.js tests/no-real-config.test.js` pasa, y `npm test` completo pasa (en particular `tests/guards.test.js`: la cabecera, la familia declarada y los nombres sin uso).
- Después de esta tarea, ninguna prueba que herede el entorno de `tests/helpers.js` puede escribir bajo el `~/.claude/` real; `tests/no-real-config.test.js` lo comprueba y falla si una corrida lo hace.
- `continuity-store.js` no llama a un modelo, no lee la conversación y no escribe fuera de la carpeta que se le da. Todas sus funciones aceptan `procRoot` o `dir` por parámetro: ninguna prueba usa el `/proc` real ni una carpeta de memoria real.
- Las cuatro familias nuevas están en `docs/reference/components.md` con los miembros que nombra el plan.

---

### Task 2: Guardar el repositorio, el proceso y la última actividad en la marca de sesión

**Aether:**
- Area: session
- Owns: `plugins/aether/lib/session.js`, `tests/session.test.js`
- Depends on: Task 1 — `processState` de `lib/continuity-store.js` dice si el proceso de una marca sigue vivo
- Serves: R19, R6

**Interfaces:**

En `plugins/aether/lib/session.js`:

- `markSession(dataDir, sessionId, now = Date.now(), { opsInMod = true, delegate = null, brake = null, repo = null, claude = null } = {})`. Con `repo` (un texto) o `claude` (`{ pid, start }` o `null`) dados, la marca es `{ session, startedAt, repo, claude, lastActivity: now }`; sin ninguno de los dos, la marca sigue siendo exactamente `{ session, startedAt }` (la prueba que ya existe lo fija).
- `touchSession(dataDir, sessionId, now = Date.now())` pone `lastActivity: now` en la marca si existe y es legible (escritura atómica), devuelve `true`, y `false` en cualquier otro caso (id inválido, marca ausente o ilegible). Nunca lanza.
- `readMark(dataDir, sessionId)` devuelve el objeto de la marca o `null`; nunca lanza.
- `repoSessions(dataDir, repo, { except = null, exceptProcess = null, procRoot = '/proc' } = {})` devuelve, por cada marca con `repo` igual a `repo`, distinta de `except` y cuyo `claude` no es el mismo proceso que `exceptProcess` (`{ pid, start }`: `/clear` abre otro id de sesión en el mismo proceso `claude`, y esa marca no es «otra sesión»), `{ session, startedAt, lastActivity, claude, state }` con `state` el de `processState(claude, { procRoot })`, ordenadas por `lastActivity` (o `startedAt`) de la más reciente a la más antigua.
- `oldStyleMarks(dataDir, { now = Date.now(), maxAgeMs = OLD_MARK_MS } = {})` devuelve los ids de las marcas sin campo `repo` cuya fecha de modificación es de menos de `maxAgeMs` (exportado `OLD_MARK_MS = 12 * 3600 * 1000`), en orden alfabético.
- `pruneSessions` y el resto no cambian.

**Tests (write first):**

Agregar a `tests/session.test.js` (con `fs`, `path`, `tempDir` ya importados) estas pruebas, y cambiar su `require` para traer `touchSession, readMark, repoSessions, oldStyleMarks, OLD_MARK_MS`:

```js
function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}

test('markSession keeps the old marker without the new options, and with them adds the repository, the process and the last activity (R19)', (t) => {
  const data = tempDir(t)
  markSession(data, 's1', 1000)
  assert.deepEqual(readMark(data, 's1'), { session: 's1', startedAt: 1000 })
  markSession(data, 's2', 2000, { repo: '/work/app', claude: { pid: 100, start: 555 } })
  assert.deepEqual(readMark(data, 's2'), { session: 's2', startedAt: 2000, repo: '/work/app', claude: { pid: 100, start: 555 }, lastActivity: 2000 })
  markSession(data, 's3', 3000, { repo: '/work/app', claude: null })
  assert.deepEqual(readMark(data, 's3'), { session: 's3', startedAt: 3000, repo: '/work/app', claude: null, lastActivity: 3000 })
  assert.equal(readMark(data, 'missing'), null)
  assert.equal(readMark(data, '../x'), null)
})

test('touchSession refreshes lastActivity and never throws (R19)', (t) => {
  const data = tempDir(t)
  markSession(data, 's1', 1000, { repo: '/work/app', claude: null })
  assert.equal(touchSession(data, 's1', 5000), true)
  assert.equal(readMark(data, 's1').lastActivity, 5000)
  assert.equal(readMark(data, 's1').startedAt, 1000)
  assert.equal(touchSession(data, 'nobody', 5000), false)
  assert.equal(touchSession(data, '../x', 5000), false)
  fs.writeFileSync(path.join(data, 'sessions', 'bad.json'), '{')
  assert.equal(touchSession(data, 'bad', 5000), false)
})

test('repoSessions lists the marks of one repository with the state of their process, without the excluded session (R6, R19)', (t) => {
  const data = tempDir(t)
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 100: { comm: 'claude', ppid: 1, start: 555 }, 200: { comm: 'claude', ppid: 1, start: 777 } })
  markSession(data, 'alive', 1000, { repo: '/work/app', claude: { pid: 100, start: 555 } })
  markSession(data, 'reused', 2000, { repo: '/work/app', claude: { pid: 200, start: 1 } })
  markSession(data, 'gone', 3000, { repo: '/work/app', claude: { pid: 300, start: 1 } })
  markSession(data, 'unknown', 4000, { repo: '/work/app', claude: null })
  markSession(data, 'elsewhere', 5000, { repo: '/work/other', claude: { pid: 100, start: 555 } })
  markSession(data, 'plain', 6000)
  const listed = repoSessions(data, '/work/app', { except: 'unknown', procRoot: proc })
  assert.deepEqual(listed.map((s) => [s.session, s.state]), [['gone', 'gone'], ['reused', 'gone'], ['alive', 'alive']])
  assert.deepEqual(repoSessions(data, '/work/app', { procRoot: path.join(proc, 'nope') }).map((s) => s.state), ['unknown', 'unknown', 'unknown', 'unknown'])
  assert.deepEqual(repoSessions(tempDir(t), '/work/app'), [])
  const cleared = repoSessions(data, '/work/app', { except: 'unknown', exceptProcess: { pid: 100, start: 555 }, procRoot: proc })
  assert.deepEqual(cleared.map((s) => s.session), ['gone', 'reused'], 'a mark of the same claude process (a /clear) is not another session')
})

test('oldStyleMarks lists the marks without a repository that are younger than 12 hours (R19 b, A18)', (t) => {
  const data = tempDir(t)
  const now = Date.now()
  markSession(data, 'fresh', now)
  markSession(data, 'stale', now)
  markSession(data, 'modern', now, { repo: '/work/app', claude: null })
  const hours = (n) => new Date(now - n * 3600 * 1000)
  fs.utimesSync(markerFile(data, 'fresh'), hours(1), hours(1))
  fs.utimesSync(markerFile(data, 'stale'), hours(13), hours(13))
  assert.equal(OLD_MARK_MS, 12 * 3600 * 1000)
  assert.deepEqual(oldStyleMarks(data, { now }), ['fresh'])
  assert.deepEqual(oldStyleMarks(tempDir(t), { now }), [])
})
```

**Acceptance:**

- `node --test tests/session.test.js` pasa y `npm test` completo pasa.
- Una marca escrita sin las opciones nuevas es byte por byte la de antes; `pruneSessions` sigue borrando los archivos acompañantes.
- Ningún módulo de `lib/` queda con un ciclo: `session.js` pide `continuity-store.js` y `continuity-store.js` no pide `session.js`.

---

### Task 3: Escribir la nota con los hooks de `aether-continuity` y registrarlos en `hooks.json`

**Aether:**
- Review: xhigh — un hook que imprime o escribe de más en una sesión que no es del Lead rompe la huella dormida, y uno que lee la conversación o escribe en `MEMORY.md` rompe la regla de la memoria
- Area: continuity
- Owns: `plugins/aether/bin/aether-continuity`, `plugins/aether/lib/continuity-hook.js`, `plugins/aether/lib/continuity-posttool.js`, `plugins/aether/lib/continuity-permission.js`, `plugins/aether/hooks/hooks.json`, `tests/continuity-hook.test.js`, `tests/components-docs.test.js`, `tests/observe-bin.test.js`, `tests/docs-facts.test.js`, `docs/reference/components.md`
- Depends on: Task 1 — la nota, la carpeta de memoria y el proceso salen de `lib/continuity-store.js`
- Depends on: Task 2 — cada hook refresca la última actividad de la marca con `touchSession`
- Serves: R2, R3, R4, R16, R40

**Interfaces:**

`plugins/aether/bin/aether-continuity <verbo>`: un bin delgado, ejecutable, con la cabecera de uso en el formato de los demás (`// aether-continuity stop`, `// aether-continuity precompact`, `// aether-continuity postcompact`, `// aether-continuity stopfailure`, `// aether-continuity sessionend`, `// aether-continuity posttool`, `// aether-continuity permission`, cada una en su línea, para `tests/commands.test.js`). Lee JSON de la entrada estándar, comprueba `isAetherSession(dataDir(), input.session_id)` y, si no es del Lead, sale con 0 sin imprimir ni escribir. Siempre sale con 0; un error o una entrada ilegible no imprimen nada.

- `stop`, `precompact`, `postcompact`, `stopfailure`, `sessionend` llaman a `handle(verbo, input)` de `lib/continuity-hook.js` y no imprimen nada.
- `posttool` llama a `posttool(input, ctx)` de `lib/continuity-posttool.js`; cuando devuelve `{ additionalContext }` imprime una línea JSON `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":<texto>}}`; con `null`, nada.
- `permission` llama a `permission(input, ctx)` de `lib/continuity-permission.js`; cuando devuelve `true` imprime `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`; si no, nada.
- `ctx` es `{ env: process.env, home: os.homedir(), now: Date.now(), dataDir: dataDir() }`.

`plugins/aether/lib/continuity-hook.js` (`// Family: continuity.`):

- `handle(event, input, { env = process.env, home = os.homedir(), now = Date.now(), procRoot = '/proc', from = process.ppid } = {})` con `event` uno de `stop`, `precompact`, `postcompact`, `stopfailure`, `sessionend`. La nota es la de `input.session_id` en `continuityDir({ cwd: input.cwd, env, home })`; si no existe, la crea con `openNote`. Todos refrescan la marca con `touchSession(dataDir(env), input.session_id, now)`.
  - `stop`: `lastMessage` (de `input.last_assistant_message`, texto), `branch` y `commit` (con `git` en `input.cwd`; `null` si falla), `cwd`, `updatedAt`.
  - `precompact`: `branch`, `commit`, `updatedAt`; no imprime nada (la compactación no cambia).
  - `postcompact`: `compactSummary` (de `input.compact_summary`) y `compactAt`.
  - `stopfailure`: `cut: { at: now, reason: input.error }` y, si viene, `lastMessage` de `input.last_assistant_message`.
  - `sessionend`: solo `closed: { at: now, reason: input.reason }` y `updatedAt`. **No corre git, no lee `transcript_path` ni ningún archivo fuera de la nota y la marca.**
- `openNote(input, { env, home, now, procRoot, from, source = input.source, fork = false })` escribe (o reemplaza) la nota de la sesión con `{ session, source, fork, cwd, repo: mainRoot, branch, commit, startedAt: now, updatedAt: now, process: claudeProcess({ procRoot, from }), lastMessage: null, compactSummary: null, closed: null, cut: null }` y devuelve la nota. Fuera de git, `repo`, `branch` y `commit` son `null`. La llamará `lib/session-start.js` (tarea 6).

`plugins/aether/lib/continuity-posttool.js` y `plugins/aether/lib/continuity-permission.js` nacen aquí mínimos (`// Family: continuity.`): `posttool(input, ctx)` devuelve siempre `null` (con una lista `HANDLERS = []` por la que la tarea 5 agrega manejadores) y `permission(input, ctx)` devuelve siempre `false` (la tarea 8 lo llena). Las dos se exportan.

`plugins/aether/hooks/hooks.json`:

- `Stop`: una entrada con el comando `node "${CLAUDE_PLUGIN_ROOT}/bin/aether-continuity" stop`.
- `PreCompact`, `StopFailure` y `SessionEnd`: una entrada **más**, separada de la de `aether-observe` (que no cambia), con `precompact`, `stopfailure` y `sessionend`; la de `SessionEnd` sin `timeout` (el presupuesto de 1,5 s no se amplía).
- `PostCompact`: una entrada con `postcompact`.
- `PostToolUse`: una entrada más, con `"matcher": "Write|Edit|MultiEdit|Bash"` y el verbo `posttool`.
- `PermissionRequest`: una entrada con `"matcher": "Write|Edit|MultiEdit|NotebookEdit"` y el verbo `permission`.
- `SessionStart`: el `matcher` pasa a `startup|resume|clear|compact|fork`.
- La `description` del archivo nombra los hooks nuevos.

Conteo de comandos de `bin/`: pasan de catorce a quince. Cambian `docs/reference/components.md` (la frase «the fourteen commands of `bin/`» pasa a «the fifteen commands of `bin/`» y la tabla «The pieces» gana la fila de `aether-continuity`, que dice sus siete verbos, que actúa solo en una sesión del Lead, que su texto de conversación queda en la nota de la máquina del dueño y que el almacén de `aether-observe` no guarda texto), `tests/components-docs.test.js` (la frase y el número de archivos de `bin/`), `tests/observe-bin.test.js` (ídem) y `tests/docs-facts.test.js` (la lista `NUMBERS` gana `fifteen: 15` y la prueba de «fourteen commands» pasa a «fifteen»).

**Tests (write first):**

`tests/continuity-hook.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const hook = require('../plugins/aether/lib/continuity-hook.js')
const { markSession, readMark } = require('../plugins/aether/lib/session.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-continuity')
const VERBS = ['stop', 'precompact', 'postcompact', 'stopfailure', 'sessionend', 'posttool', 'permission']

function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  markSession(data, 's1', 1000, { repo: repo.dir, claude: null })
  const env = { CLAUDE_CONFIG_DIR: configDir }
  const dir = store.continuityDir({ cwd: repo.dir, env, home: configDir })
  return { repo, data, configDir, env, dir }
}
function run(w, verb, input, extra = {}) {
  return spawnSync(process.execPath, [BIN, verb], {
    input: JSON.stringify({ session_id: 's1', cwd: w.repo.dir, ...input }),
    encoding: 'utf8',
    env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.configDir, ...extra },
  })
}
const filesUnder = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }) : [])

test('stop writes the note: the last message, the branch, the commit, the time and the session (C1, H1 scenario 4)', (t) => {
  const w = world(t)
  const r = run(w, 'stop', { hook_event_name: 'Stop', last_assistant_message: 'I finished the first half.' })
  assert.deepEqual([r.status, r.stdout], [0, ''])
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.lastMessage, 'I finished the first half.')
  assert.equal(note.branch, 'feature/x')
  assert.equal(note.commit, w.repo.git('rev-parse', 'HEAD'))
  assert.equal(note.session, 's1')
  assert.ok(note.updatedAt > 0)
  const again = run(w, 'stop', { last_assistant_message: 'Second turn.' })
  assert.equal(again.status, 0)
  assert.equal(store.readNote(w.dir, 's1').lastMessage, 'Second turn.')
  assert.ok(readMark(w.data, 's1').lastActivity > 1000, 'each hook refreshes the last activity of the mark')
})

test('precompact prints nothing; postcompact keeps the summary; stopfailure keeps the reason of the cut (C1, H1 scenario 3)', (t) => {
  const w = world(t)
  const pre = run(w, 'precompact', { trigger: 'auto' })
  assert.deepEqual([pre.status, pre.stdout], [0, ''])
  const post = run(w, 'postcompact', { trigger: 'auto', compact_summary: 'We built the store.' })
  assert.deepEqual([post.status, post.stdout], [0, ''])
  assert.equal(store.readNote(w.dir, 's1').compactSummary, 'We built the store.')
  const failure = run(w, 'stopfailure', { error: 'rate_limit', last_assistant_message: 'Cut here.' })
  assert.equal(failure.status, 0)
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.cut.reason, 'rate_limit')
  assert.equal(note.lastMessage, 'Cut here.')
})

test('sessionend only marks the close and its reason, runs no git and reads no conversation (R3)', (t) => {
  const w = world(t)
  run(w, 'stop', { last_assistant_message: 'Before the end.' })
  const before = store.readNote(w.dir, 's1')
  const r = run(w, 'sessionend', { reason: 'prompt_input_exit', transcript_path: path.join(w.configDir, 'no-such-transcript.jsonl') }, { PATH: '' })
  assert.deepEqual([r.status, r.stdout], [0, ''])
  const note = store.readNote(w.dir, 's1')
  assert.equal(note.closed.reason, 'prompt_input_exit')
  assert.ok(note.closed.at > 0)
  assert.equal(note.lastMessage, before.lastMessage)
  assert.equal(note.commit, before.commit)
})

test('the SessionEnd part finishes in under 200 ms on a realistic note (R3)', (t) => {
  const w = world(t)
  store.writeNote(w.dir, { session: 's1', branch: 'feature/x', commit: 'a'.repeat(40), lastMessage: 'm'.repeat(2000), compactSummary: 's'.repeat(8000), startedAt: 1, process: null, closed: null, cut: null })
  const started = process.hrtime.bigint()
  hook.handle('sessionend', { session_id: 's1', cwd: w.repo.dir, reason: 'other' }, { env: { ...w.env, AETHER_DATA_DIR: w.data }, home: w.configDir, now: Date.now() })
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(ms < 200, `sessionend took ${ms} ms`)
  assert.ok(store.readNote(w.dir, 's1').closed)
})

test('openNote writes a complete note with the process of claude and says whether it is a fork', (t) => {
  const w = world(t)
  const proc = tempDir(t, 'aether-proc-')
  fs.mkdirSync(path.join(proc, '300'), { recursive: true })
  fs.writeFileSync(path.join(proc, '300', 'comm'), 'claude\n')
  fs.writeFileSync(path.join(proc, '300', 'stat'), ['300', '(claude)', 'S', '1', ...Array(17).fill('0'), '4242', '0'].join(' '))
  const note = hook.openNote({ session_id: 's2', cwd: w.repo.dir, source: 'fork' }, { env: w.env, home: w.configDir, now: 5000, procRoot: proc, from: 300, fork: true })
  assert.deepEqual([note.session, note.source, note.fork, note.startedAt, note.process, note.closed, note.cut], ['s2', 'fork', true, 5000, { pid: 300, start: 4242 }, null, null])
  assert.equal(note.repo, w.repo.dir)
  assert.deepEqual(store.readNote(w.dir, 's2'), note)
})

test('a session that is not the Lead writes nothing and prints nothing, for every verb (R40)', (t) => {
  const w = world(t)
  const before = filesUnder(w.data).sort()
  for (const verb of VERBS) {
    const r = run(w, verb, { session_id: 'someone-else', last_assistant_message: 'hello', reason: 'other', error: 'x', compact_summary: 'y' })
    assert.deepEqual([verb, r.status, r.stdout], [verb, 0, ''])
  }
  assert.deepEqual(filesUnder(w.configDir), [])
  assert.deepEqual(filesUnder(w.data).sort(), before)
})

test('a bad input or an unknown verb exits 0 and prints nothing', (t) => {
  const w = world(t)
  const bad = spawnSync(process.execPath, [BIN, 'stop'], { input: 'not json', encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data } })
  assert.deepEqual([bad.status, bad.stdout], [0, ''])
  const unknown = run(w, 'nonsense', {})
  assert.deepEqual([unknown.status, unknown.stdout], [0, ''])
  for (const verb of ['posttool', 'permission']) {
    const r = run(w, verb, { tool_name: 'Write', tool_input: { file_path: path.join(w.repo.dir, 'a.txt') } })
    assert.deepEqual([verb, r.status, r.stdout], [verb, 0, ''])
  }
})

test('the observation store keeps no text of the conversation: what continuity saves goes to the note only (R4)', (t) => {
  const w = world(t)
  run(w, 'stop', { last_assistant_message: 'SECRET-TEXT-4711' })
  run(w, 'postcompact', { compact_summary: 'SECRET-TEXT-4711' })
  assert.ok(JSON.stringify(store.readNote(w.dir, 's1')).includes('SECRET-TEXT-4711'))
  for (const entry of filesUnder(w.data)) {
    const file = path.join(w.data, entry)
    if (fs.statSync(file).isFile()) assert.ok(!fs.readFileSync(file, 'utf8').includes('SECRET-TEXT-4711'), `${entry} holds conversation text`)
  }
})

const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks
const entriesOf = (event) => (hooks[event] || []).flatMap((group) => group.hooks.map((h) => ({ ...h, matcher: group.matcher })))
const mine = (event) => entriesOf(event).filter((h) => h.command.includes('aether-continuity'))

test('hooks.json registers one aether-continuity entry per verb, apart from the entries of aether-observe (R2, R3)', () => {
  const verbs = { Stop: 'stop', PreCompact: 'precompact', PostCompact: 'postcompact', StopFailure: 'stopfailure', SessionEnd: 'sessionend', PostToolUse: 'posttool', PermissionRequest: 'permission' }
  for (const [event, verb] of Object.entries(verbs)) {
    assert.equal(mine(event).length, 1, event)
    assert.ok(mine(event)[0].command.endsWith(`/bin/aether-continuity" ${verb}`), event)
  }
  for (const event of ['PreCompact', 'StopFailure', 'SessionEnd']) assert.ok(entriesOf(event).some((h) => h.command.includes('aether-observe')), `${event} keeps the observation entry`)
  assert.equal(mine('SessionEnd')[0].timeout, undefined)
  assert.equal(mine('PostToolUse')[0].matcher, 'Write|Edit|MultiEdit|Bash')
  assert.equal(mine('PermissionRequest')[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit')
  assert.equal(hooks.SessionStart[0].matcher, 'startup|resume|clear|compact|fork')
  assert.equal(hooks.WorktreeCreate, undefined, 'Aether registers no WorktreeCreate hook: the copies of Claude Code stay in .claude/worktrees/ (R16)')
})

test('the bin has the fifteen commands the pages count and is executable', () => {
  assert.equal(fs.readdirSync(path.join(PLUGIN, 'bin')).length, 15)
  assert.ok(fs.statSync(BIN).mode & 0o111)
})
```

**Acceptance:**

- `node --test tests/continuity-hook.test.js` pasa, `npm test` completo pasa, `npm run validate` pasa: es `claude plugin validate --strict` local, sin llamada a un modelo, y comprueba que el matcher `fork` de SessionStart y la entrada `PermissionRequest` son válidos.
- Con una sesión que no es del Lead, cada verbo sale con 0, sin salida y sin escribir ningún archivo.
- `sessionend` no corre `git` (la prueba lo hace con `PATH` vacío) y no abre ningún archivo fuera de la nota y la marca.
- Ningún hook de esta tarea escribe en `MEMORY.md`, y el almacén de `aether-observe` no guarda texto de la conversación.

---

### Task 4: Componer las 3 a 5 líneas del aviso de continuidad

**Aether:**
- Area: continuity
- Owns: `plugins/aether/lib/continuity-notice.js`, `tests/continuity-notice.test.js`
- Depends on: Task 1 — lee las notas con `continuity-store`
- Depends on: Task 2 — nombra las sesiones activas con `repoSessions`
- Serves: R5, R6, R7

**Interfaces:**

En `plugins/aether/lib/continuity-notice.js` (`// Family: continuity.`):

- `notice({ cwd, session, source, dataDir, dir, env = process.env, now = Date.now(), procRoot = '/proc', selfProcess = null })` devuelve `{ lines }`, un arreglo de textos. `dir` es la carpeta de notas (`continuityDir`). Nunca lanza: ante cualquier error devuelve `{ lines: [] }`.
  - Con `source === 'compact'`, devuelve `{ lines: [] }` (A11).
  - La nota anterior es la más reciente de `readNotes(dir)` cuya `session` no es `session`. Sin ninguna (o con notas ilegibles solamente), devuelve exactamente una línea: `No earlier session in this project.` (`No hay una sesión anterior en este proyecto.` si `isSpanish(env)`).
  - Con nota anterior, devuelve de 3 a 5 líneas, en este orden:
    1. Dónde se quedó: `Last session (<id de 8 caracteres>, branch <rama>) stopped at: <último mensaje en una sola línea, hasta 160 caracteres, con «…» si se corta>` (`Última sesión (<id>, rama <rama>) se quedó en: …`). Sin mensaje, el texto es `no message saved` (`sin mensaje guardado`).
    2. Qué cambió en git desde entonces, con el repositorio de `cwd`: `Since then: <n> commit(s) and <m> file(s) changed on <rama actual>.` con singular y plural (`1 commit`, `2 commits`; `1 file`, `3 files`), ; sin cambios, `Since then: nothing changed in git.` (`Desde entonces: …`, `Desde entonces: nada cambió en git.`). En los dos casos, si la rama actual no es la de la nota, se agrega al final de la línea ` The branch moved from <rama de la nota> to <rama actual>.` (` La rama pasó de … a ….`). Con una nota sin `commit` o un commit que ya no existe: `Since then: the commit of that session is not in this repository.`
    3. El estado de esa sesión, por `processState(nota.process, { procRoot })`: con `nota.closed`, `The session ended normally.`; sin cierre y `gone`, `The session was cut off (<motivo de nota.cut.reason, o «no close mark»>): claude --resume <id completo>`; sin cierre y `alive`, `That session is still active in another window.`; sin cierre y `unknown`, `That session has no close mark; this machine cannot tell whether it was cut off.` (nunca el comando de retomar).
    4. Solo si hay algo: ramas con trabajo sin fusionar y delegados sin resultado en **una** línea: `Unmerged work: <rama>, <rama> (+<n> more). Delegates without a result: <tarea>, <tarea>.` (cada mitad solo si no está vacía; hasta 3 nombres y `(+n more)` el resto). Las ramas sin fusionar son las de `git for-each-ref refs/heads` que no están en la rama principal (`git branch --no-merged <principal>`; principal = `origin/HEAD`, si no `main`, si no `master`), y los delegados sin resultado son las tareas con un `launch` de la sesión anterior en `<dataDir>/delegates/log.jsonl` y ningún `result` de la misma tarea y el mismo `attempt` (se saltan las líneas que no son JSON).
    Una nota anterior cuyo `process` es el mismo que `selfProcess` (un `/clear`: otro id de sesión en el mismo proceso `claude`) no se llama activa ni cortada: la línea 3 dice `That session ended in this same window (it was cleared).` (`Esa sesión terminó en esta misma ventana (se limpió).`), y esa sesión no cuenta en la línea 5.
    5. Solo si hay otras sesiones activas (A17): `Other sessions active: <id de 8>, <id de 8>.` con las de `repoSessions(dataDir, repo, { except: session, procRoot })` en estado `alive`, y las notas de la misma carpeta que, sin marca, tienen `process` vivo; no incluye la anterior.
  - Cada línea tiene a lo más 300 caracteres.

**Tests (write first):**

`tests/continuity-notice.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const { notice } = require('../plugins/aether/lib/continuity-notice.js')

const EN = { LANG: 'en_US.UTF-8' }
const NOW = Date.parse('2026-11-07T12:00:00Z')

function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}

function world(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const dir = path.join(tempDir(t, 'aether-mem-'), 'continuity')
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 1: { comm: 'init', ppid: 0, start: 1 } })
  const base = repo.git('rev-parse', 'HEAD')
  const run = (extra = {}) => notice({ cwd: repo.dir, session: 'now-session', source: 'startup', dataDir, dir, env: EN, now: NOW, procRoot: proc, ...extra })
  const put = (note) => store.writeNote(dir, { session: 'prev-session', branch: 'feature/x', commit: base, updatedAt: NOW - 3600000, lastMessage: 'I am about to run the migration', process: { pid: 100, start: 555 }, closed: null, cut: null, ...note })
  return { repo, dataDir, dir, proc, base, run, put }
}

test('with no earlier note the notice is one line that says so, in English and in Spanish; an unreadable note is skipped (R7)', (t) => {
  const w = world(t)
  assert.deepEqual(w.run().lines, ['No earlier session in this project.'])
  assert.deepEqual(w.run({ env: { LANG: 'es_MX.UTF-8' } }).lines, ['No hay una sesión anterior en este proyecto.'])
  fs.mkdirSync(w.dir, { recursive: true })
  fs.writeFileSync(path.join(w.dir, 'bad.json'), '{')
  assert.deepEqual(w.run().lines, ['No earlier session in this project.'])
})

test('a session that was cut off says where it stopped, what changed in git and how to resume it, in 3 to 5 lines (C2, H1 scenario 1)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'a.txt'), 'a')
  w.repo.git('add', 'a.txt')
  w.repo.git('commit', '-q', '-m', 'a')
  w.put({ cut: { at: NOW - 3000000, reason: 'rate_limit' } })
  const { lines } = w.run()
  assert.ok(lines.length >= 3 && lines.length <= 5, lines.join('\n'))
  assert.ok(lines[0].includes('prev-ses') && lines[0].includes('feature/x') && lines[0].includes('I am about to run the migration'), lines[0])
  assert.ok(lines[1].startsWith('Since then: 1 commit and 1 file changed on feature/x'), lines[1])
  assert.ok(lines[2].includes('cut off (rate_limit)') && lines[2].includes('claude --resume prev-session'), lines[2])
})

test('a session that closed says so and gives no resume command; one still alive is named active; without /proc nothing is claimed (R6, H1 scenario 2)', (t) => {
  const w = world(t)
  w.put({ closed: { at: NOW - 1000, reason: 'prompt_input_exit' } })
  let text = w.run().lines.join('\n')
  assert.ok(text.includes('ended normally') && !text.includes('--resume') && !text.includes('cut off'))
  w.put({ closed: null })
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  text = w.run().lines.join('\n')
  assert.ok(text.includes('still active') && !text.includes('--resume'))
  text = w.run({ procRoot: path.join(w.proc, 'missing') }).lines.join('\n')
  assert.ok(text.includes('cannot tell') && !text.includes('--resume'))
})

test('a moved branch, an unmerged branch and a delegate without a result are named (C2, H1 scenario 1)', (t) => {
  const w = world(t)
  w.repo.git('switch', '-q', '-c', 'unmerged-work')
  fs.writeFileSync(path.join(w.repo.dir, 'u.txt'), 'u')
  w.repo.git('add', 'u.txt')
  w.repo.git('commit', '-q', '-m', 'u')
  w.repo.git('switch', '-q', 'main')
  w.put({ branch: 'feature/x' })
  fs.mkdirSync(path.join(w.dataDir, 'delegates'), { recursive: true })
  const log = [
    { kind: 'launch', session: 'prev-session', task: 't1', attempt: 1 },
    { kind: 'launch', session: 'prev-session', task: 't2', attempt: 1 },
    { kind: 'result', session: 'prev-session', task: 't2', attempt: 1 },
  ].map((e) => JSON.stringify(e)).join('\n')
  fs.writeFileSync(path.join(w.dataDir, 'delegates', 'log.jsonl'), `${log}\nnot json\n`)
  const { lines } = w.run()
  assert.ok(lines.length <= 5)
  assert.ok(lines[1].includes('The branch moved from feature/x to main'), lines[1])
  const work = lines.find((l) => l.startsWith('Unmerged work:'))
  assert.ok(work.includes('unmerged-work') && work.includes('Delegates without a result: t1') && !work.includes('t2'), work)
})

test('the other active sessions of the repository are named, from their marks, and the notice never passes 5 lines of 300 characters (C2, H1 scenario 5, R7)', (t) => {
  const w = world(t)
  fakeProc(w.proc, { 200: { comm: 'claude', ppid: 1, start: 20 }, 201: { comm: 'claude', ppid: 1, start: 21 } })
  markSession(w.dataDir, 'other-one', NOW, { repo: w.repo.dir, claude: { pid: 200, start: 20 } })
  markSession(w.dataDir, 'other-two', NOW, { repo: w.repo.dir, claude: { pid: 201, start: 21 } })
  markSession(w.dataDir, 'now-session', NOW, { repo: w.repo.dir, claude: null })
  w.put({ lastMessage: 'x'.repeat(900), cut: { at: NOW, reason: 'overloaded' } })
  const { lines } = w.run()
  const others = lines.find((l) => l.startsWith('Other sessions active:'))
  assert.ok(others.includes('other-on') && others.includes('other-tw') && !others.includes('now-ses'), others)
  assert.ok(lines.length <= 5 && lines.every((l) => l.length <= 300), lines.map((l) => l.length).join(','))
  assert.ok(lines[0].includes('…'))
})

test('after a /clear the previous session of the same claude process is not called active or cut, and is not listed as another active session (R6)', (t) => {
  const w = world(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.dataDir, 'prev-session', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  w.put({})
  const { lines } = w.run({ selfProcess: { pid: 100, start: 555 } })
  const text = lines.join('\n')
  assert.ok(text.includes('ended in this same window') && !text.includes('--resume') && !text.includes('still active') && !text.includes('Other sessions active'), text)
})

test('a compact adds no notice (A11)', (t) => {
  const w = world(t)
  w.put({})
  assert.deepEqual(w.run({ source: 'compact' }).lines, [])
})
```

**Acceptance:**

- `node --test tests/continuity-notice.test.js` pasa y `npm test` completo pasa.
- Nunca hay más de 5 líneas, y con una nota anterior nunca menos de 3. Sin `/proc` no se afirma un corte ni se da el comando de retomar. Nada se escribe: el módulo solo lee.
- El módulo no corre ningún proceso que no sea `git`.

---

### Task 5: Despachar los PostToolUse y recordar que el estado va a la continuidad

**Aether:**
- Area: continuity
- Owns: `plugins/aether/lib/continuity-posttool.js`, `tests/continuity-posttool.test.js`
- Depends on: Task 3 — el bin `aether-continuity` y el módulo mínimo `continuity-posttool.js` ya existen
- Serves: R9, R40

**Interfaces:**

En `plugins/aether/lib/continuity-posttool.js`:

- `HANDLERS`: arreglo de funciones `(input, ctx) => string | null`, ejecutadas en orden; hoy solo `memoryReminder`. Las tareas 9 y 28 agregan las suyas.
- `posttool(input, ctx = {})` corre cada manejador, ignora el que lanza, junta los textos no vacíos con una línea en blanco entre ellos y devuelve `{ additionalContext: texto }`, o `null` si ninguno dijo nada. No escribe ningún archivo.
- `memoryReminder(input, ctx)` devuelve un recordatorio cuando `input.tool_name` es `Write`, `Edit` o `MultiEdit` y su `tool_input.file_path` (resuelto contra `input.cwd`) queda dentro de `memoryDir({ cwd: input.cwd, env: ctx.env, home: ctx.home })` pero no dentro de su subcarpeta `continuity/`; en cualquier otro caso `null`. El texto en inglés es exactamente `Claude's memory keeps only what lasts: preferences and lessons. The state of a version, a branch or a task goes to the continuity note, which Aether writes by itself; do not record it in the memory.` y en español (`isSpanish(ctx.env)`) `La memoria de Claude guarda solo lo que dura: preferencias y lecciones. El estado de una versión, una rama o una tarea va a la nota de continuidad, que Aether escribe sola; no lo registres en la memoria.`

**Tests (write first):**

`tests/continuity-posttool.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const EN = "Claude's memory keeps only what lasts: preferences and lessons. The state of a version, a branch or a task goes to the continuity note, which Aether writes by itself; do not record it in the memory."
const ES = 'La memoria de Claude guarda solo lo que dura: preferencias y lecciones. El estado de una versión, una rama o una tarea va a la nota de continuidad, que Aether escribe sola; no lo registres en la memoria.'

function world(t) {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-config-')
  const data = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  const memory = store.memoryDir({ cwd: repo.dir, env, home: configDir })
  return { repo, configDir, data, env, memory }
}
const call = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: file } })

test('a write in the memory, outside continuity/, reminds the Lead that the state goes to the continuity note (R9, H1 scenario 8)', (t) => {
  const w = world(t)
  const ctx = { env: w.env, home: w.configDir }
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'version-state.md'), tool), ctx), { additionalContext: EN }, tool)
  }
  assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'MEMORY.md')), ctx), { additionalContext: EN })
  assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'x.md')), { ...ctx, env: { ...w.env, LANG: 'es_ES.UTF-8' } }), { additionalContext: ES })
})

test('no reminder for the continuity folder, for the repository, for other tools or for an unreadable input (R9)', (t) => {
  const w = world(t)
  const ctx = { env: w.env, home: w.configDir }
  assert.equal(posttool.posttool(call(w, path.join(w.memory, 'continuity', 's1.json')), ctx), null)
  assert.equal(posttool.posttool(call(w, path.join(w.repo.dir, 'a.md')), ctx), null)
  assert.equal(posttool.posttool({ ...call(w, path.join(w.memory, 'x.md')), tool_name: 'Bash', tool_input: { command: 'ls' } }, ctx), null)
  assert.equal(posttool.posttool(null, ctx), null)
  assert.equal(posttool.posttool({}, ctx), null)
})

test('a handler that throws does not stop the others, and the texts join with a blank line', () => {
  const saved = [...posttool.HANDLERS]
  posttool.HANDLERS.splice(0, posttool.HANDLERS.length, () => { throw new Error('boom') }, () => 'one', () => null, () => 'two')
  try {
    assert.deepEqual(posttool.posttool({}, {}), { additionalContext: 'one\n\ntwo' })
  } finally {
    posttool.HANDLERS.splice(0, posttool.HANDLERS.length, ...saved)
  }
})

test('through the bin: the reminder is the additionalContext of PostToolUse, and no hook of the feature touches MEMORY.md (C3)', (t) => {
  const w = world(t)
  markSession(w.data, 's1', 1000, { repo: w.repo.dir, claude: null })
  fs.mkdirSync(w.memory, { recursive: true })
  const index = path.join(w.memory, 'MEMORY.md')
  fs.writeFileSync(index, '- [One](one.md) — a lesson\n')
  const before = fs.statSync(index)
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const run = (verb, input) => spawnSync(process.execPath, [bin, verb], { input: JSON.stringify({ session_id: 's1', cwd: w.repo.dir, ...input }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.configDir, LANG: 'en_US.UTF-8' } })
  const out = run('posttool', { hook_event_name: 'PostToolUse', ...call(w, path.join(w.memory, 'state.md')) })
  assert.equal(out.status, 0)
  assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: EN } })
  for (const [verb, input] of [['stop', { last_assistant_message: 'hi' }], ['precompact', {}], ['postcompact', { compact_summary: 's' }], ['stopfailure', { error: 'x' }], ['sessionend', { reason: 'other' }]]) {
    assert.equal(run(verb, input).status, 0, verb)
  }
  assert.equal(fs.readFileSync(index, 'utf8'), '- [One](one.md) — a lesson\n')
  assert.equal(fs.statSync(index).mtimeMs, before.mtimeMs)
  assert.deepEqual(fs.readdirSync(w.memory).sort(), ['MEMORY.md', 'continuity'])
})
```

**Acceptance:**

- `node --test tests/continuity-posttool.test.js` pasa y `npm test` completo pasa.
- El recordatorio no bloquea ni cambia lo escrito (el hook de PostToolUse solo agrega contexto), y la salida del bin es una sola línea JSON con la forma de arriba.
- Ningún verbo de `aether-continuity` toca `MEMORY.md` (la prueba compara su contenido y su fecha).

---

### Task 6: Abrir la nota, avisar y podar al arrancar

**Aether:**
- Review: xhigh — un fallo aquí rompe el arranque de toda sesión del Lead, y la salida tiene un tope duro de caracteres
- Area: session
- Owns: `plugins/aether/lib/session-start.js`, `tests/session-start-continuity.test.js`, `tests/session-start.test.js`
- Depends on: Task 3 — abre la nota con `openNote` y los hooks y el matcher de `fork` ya están registrados
- Depends on: Task 4 — el aviso lo compone `notice`
- Serves: R5, R7, R8

**Interfaces:**

En `plugins/aether/lib/session-start.js` (`main` conserva su forma `main({ input, part, env, cwd, stdout })` y gana `procRoot = '/proc'`, `from = process.ppid`):

- `const NOTICE_SOURCES = ['startup', 'clear', 'fork']`. **`resume` no da aviso** (decisión del Lead: la conversación misma se restaura) y sigue sin imprimir nada, como hoy: las pruebas de `tests/session-start.test.js` de `resume` (`:261-270`, `:461-475`) no cambian. El comportamiento actual para `startup`, `clear` y `compact` (las partes del arranque, `pruneOldFiles`, `sweepNote`, `autonomyNote`) no cambia.
- En un arranque del Lead, tras marcar la sesión (la marca guarda ahora `repo: repoPaths(cwd).mainRoot` y `claude: claudeProcess({ procRoot, from })`, fuera de git `repo` es `null` y se escribe la marca de siempre), si `source` está en `NOTICE_SOURCES`:
  1. calcula `notice({ cwd, session: input.session_id, source, dataDir, dir: continuityDir(...), env, procRoot, selfProcess: claudeProcess({ procRoot, from }) })` **antes** de abrir la nota de esta sesión;
  2. abre la nota con `openNote(input, { env, procRoot, from, source, fork: source === 'fork' })` (en un `fork` no toca la nota de ninguna otra sesión);
  3. con `startup` y `clear`, poda las notas con `pruneNotes(dir, { cwd })` junto a las demás podas.
- Con `resume`, sin imprimir nada, la nota de la sesión se refresca para que su proceso sea el nuevo: `updateNote(dir, id, { source: 'resume', process: <el de ahora>, closed: null, cut: null })`, y se abre una si no existe (si no, la sesión retomada se vería como cortada en el arranque siguiente).
- Con `compact` no se calcula aviso ni se abre nota (la sesión es la misma).
- Las líneas del aviso se unen con saltos de línea. En `startup` y `clear` se agregan al final del `additionalContext` (después de las notas) y al `systemMessage`: en `startup` el `systemMessage` es la línea de bienvenida seguida de las líneas del aviso (el dueño las ve; `tests/session-start.test.js:388-390`, que hoy fija el `systemMessage` igual a la bienvenida sola, se reescribe: ahora debe empezar por la bienvenida y seguir con el aviso); en `clear` son solo las líneas. En `fork`, que no inyecta las partes, el hook imprime una sola línea JSON con `hookSpecificOutput.additionalContext` y `systemMessage` iguales a las líneas del aviso (y nada más: ni «Aether mode is active.» ni partes). Si la salida entera pasa de `PART_LIMIT`, se quitan líneas del final (nunca la primera) hasta que quepa.
- Una nota ilegible, un error de git o un fallo al abrir la nota no detienen el arranque ni se imprimen.

**Tests (write first):**

`tests/session-start-continuity.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const { PART_LIMIT } = require('../plugins/aether/lib/session-start.js')

function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  delete env.LC_ALL
  delete env.LC_MESSAGES
  delete env.CLAUDE_ENV_FILE
  fs.writeFileSync(path.join(repo.dir, 'ahead.txt'), 'ahead')
  repo.git('add', 'ahead.txt')
  repo.git('commit', '-q', '-m', 'ahead of main')
  const dir = store.continuityDir({ cwd: repo.dir, env, home: configDir })
  const start = (source, session = 'now-session', agent = 'aether:lead') => {
    const input = { hook_event_name: 'SessionStart', session_id: session, source, ...(agent ? { agent_type: agent } : {}) }
    const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, input: JSON.stringify(input), encoding: 'utf8', env })
    return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null }
  }
  const prior = (note = {}) => store.writeNote(dir, { session: 'prev-session', branch: 'feature/x', commit: repo.git('rev-parse', 'HEAD'), updatedAt: Date.now() - 3600000, lastMessage: 'I was refactoring the store', process: { pid: 2147483000, start: 1 }, closed: null, cut: null, ...note })
  return { repo, data, configDir, dir, start, prior }
}
const hasProc = fs.existsSync('/proc/self/stat')

test('startup shows the previous session in 3 to 5 lines, in the context and in the message to the person, and opens its own note (C2, H1 scenario 1)', { skip: !hasProc }, (t) => {
  const w = world(t)
  w.prior()
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.match(out.systemMessage, /^Aether /)
  assert.ok(out.systemMessage.includes('claude --resume prev-session') && out.systemMessage.includes('I was refactoring the store'))
  assert.ok(out.hookSpecificOutput.additionalContext.includes('claude --resume prev-session'))
  const lines = out.systemMessage.split('\n').slice(1)
  assert.ok(lines.length >= 3 && lines.length <= 5, lines.join('\n'))
  const mine = store.readNote(w.dir, 'now-session')
  assert.deepEqual([mine.source, mine.fork, mine.branch], ['startup', false, 'feature/x'])
})

test('the message of startup is the welcome line followed by the notice, never the welcome alone (R5)', (t) => {
  const w = world(t)
  const lines = w.start('startup').out.systemMessage.split('\n')
  assert.match(lines[0], /^Aether .*\/aether:help/)
  assert.ok(lines.length >= 2)
})

test('a first session in a project shows one line and fails nothing (H1 scenario 6)', (t) => {
  const w = world(t)
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.ok(out.systemMessage.split('\n').includes('No earlier session in this project.'))
})

test('a fork prints only the notice and opens its own note without touching the other; resume prints nothing and only refreshes its own note (A11, H1 scenario 5)', (t) => {
  const f = world(t)
  f.prior({ closed: { at: 1, reason: 'other' } })
  const before = fs.readFileSync(path.join(f.dir, 'prev-session.json'), 'utf8')
  const fork = f.start('fork', 's-fork')
  assert.equal(fork.status, 0)
  assert.equal(fork.out.hookSpecificOutput.additionalContext, fork.out.systemMessage)
  assert.ok(!fork.out.systemMessage.includes('Aether mode is active'))
  assert.ok(fork.out.systemMessage.includes('ended normally'))
  assert.equal(store.readNote(f.dir, 's-fork').fork, true)
  assert.equal(fs.readFileSync(path.join(f.dir, 'prev-session.json'), 'utf8'), before)
  const r = world(t)
  r.prior({ closed: { at: 1, reason: 'other' } })
  store.writeNote(r.dir, { session: 'now-session', branch: 'feature/x', commit: 'c', updatedAt: Date.now() - 1000, source: 'startup', process: { pid: 2147483000, start: 1 }, closed: { at: 5, reason: 'prompt_input_exit' }, cut: null })
  const resume = r.start('resume')
  assert.deepEqual([resume.status, resume.stdout], [0, ''])
  const note = store.readNote(r.dir, 'now-session')
  assert.deepEqual([note.source, note.closed, note.cut], ['resume', null, null])
})

test('a compact repeats no notice and opens no note (A11, H1 scenario 3)', (t) => {
  const w = world(t)
  w.prior()
  const { status, out } = w.start('compact')
  assert.equal(status, 0)
  assert.ok(!out.hookSpecificOutput.additionalContext.includes('Last session'))
  assert.equal(store.readNote(w.dir, 'now-session'), null)
})

test('startup prunes the notes of more than 30 days and keeps the newest (C3, H1 scenario 7)', (t) => {
  const w = world(t)
  const day = 86400000
  store.writeNote(w.dir, { session: 'ancient', commit: 'a'.repeat(40), updatedAt: Date.now() - 31 * day })
  w.prior()
  assert.equal(w.start('startup').status, 0)
  assert.deepEqual(store.readNotes(w.dir).map((n) => n.session).sort(), ['now-session', 'prev-session'])
})

test('the whole output stays within the limit even with a huge last message, and the first line stays (R7)', (t) => {
  const w = world(t)
  w.prior({ lastMessage: 'z'.repeat(2000) })
  const { stdout, out } = w.start('startup')
  assert.ok(stdout.length <= PART_LIMIT, `${stdout.length} characters`)
  assert.ok(out.systemMessage.includes('Last session'))
})

test('an unreadable or foreign note is skipped and the start goes on (R7)', (t) => {
  const w = world(t)
  fs.mkdirSync(w.dir, { recursive: true })
  fs.writeFileSync(path.join(w.dir, 'bad.json'), '{')
  fs.writeFileSync(path.join(w.dir, 'foreign.json'), JSON.stringify({ version: 9, session: 'foreign', updatedAt: Date.now() }))
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  assert.ok(out.systemMessage.includes('No earlier session in this project.'))
})

test('a session that is not the Lead prints nothing and writes nothing (R40)', (t) => {
  const w = world(t)
  w.prior()
  for (const source of ['startup', 'resume', 'fork']) {
    const r = w.start(source, 'plain', null)
    assert.deepEqual([r.status, r.stdout], [0, ''])
  }
  assert.deepEqual(fs.readdirSync(w.dir), ['prev-session.json'])
  assert.deepEqual(fs.existsSync(path.join(w.data, 'sessions')) ? fs.readdirSync(path.join(w.data, 'sessions')) : [], [])
})
```

**Acceptance:**

- `node --test tests/session-start-continuity.test.js` pasa; también pasan `tests/session-start.test.js`, `tests/session-start-parts.test.js` y `tests/session-start-autonomy.test.js` sin cambios (el aviso de continuidad se suma, no los reemplaza), y `npm test` completo pasa.
- En una sesión que no es del Lead nada cambia ni se escribe, y la marca de una sesión del Lead trae `repo` y `claude`.
- La salida de cada fuente cabe en `PART_LIMIT`.

---

### Task 7: Retirar `/aether:onboard`

**Aether:**
- Area: onboard
- Owns: `plugins/aether/skills/onboard/**`, `plugins/aether/skills/help/SKILL.md`, `tests/help.test.js`, `tests/audit-skill.test.js`, `tests/onboard-retired.test.js`, `tests/docs-facts.test.js`, `docs/reference/components.md`, `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md`, `docs/roadmap.md`
- Depends on: Task 3 — el mismo `docs/reference/components.md` y `tests/docs-facts.test.js` los cambia esa tarea antes
- Serves: R10

**Interfaces:**

- Se borra la carpeta `plugins/aether/skills/onboard/`.
- `plugins/aether/skills/help/SKILL.md` ya no lista `/aether:onboard` (la línea 56 y lo que la acompañe).
- `docs/reference/components.md` (la fila de la skill `onboard` y la frase del párrafo de huella que la nombra), `docs/what-aether-adds.md` (las líneas 16 y 91) y `docs/es/que-agrega-aether.md` (las líneas 16 y 91) y `docs/roadmap.md` ya no mencionan `/aether:onboard` ni la skill `onboard` como vigentes. `docs/changelog.md` y `docs/decisions.md` conservan su historia: **no se editan en esta tarea** (el texto del retiro lo escribe la tarea 39).
- `tests/docs-facts.test.js`: `RETIRED_NAMES` gana `onboard: ['docs/changelog.md', 'docs/decisions.md']` (la decisión A116 de la tarea 38 también lo nombra) y el comentario de su cabecera lista `aether:onboard` entre los nombres retirados que un registro conserva, con su motivo (la skill de 0.12.7 a 0.34.0, retirada en 0.35.0; el changelog conserva su nombre en las palabras de la versión que la publicó).
- `tests/help.test.js:71` y `tests/audit-skill.test.js` dejan de depender de `onboard` (la primera comprueba otra skill que existe, por ejemplo `audit`; la segunda cambia el nombre de la prueba y el comentario que dicen «the front matter of onboard» por «of the audit skill», sin cambiar lo que comprueba).

**Tests (write first):**

`tests/onboard-retired.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const ALLOWED = new Set(['docs/changelog.md', 'docs/decisions.md'])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue
      walk(full, out)
    } else if (/\.(md|js|mjs|json|ts|tsx|jsx|yml|yaml|html)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

test('/aether:onboard no longer exists and nothing names it as current (C4, H1 scenario 9)', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'plugins', 'aether', 'skills', 'onboard')), false)
  const files = [...walk(path.join(ROOT, 'plugins', 'aether')), ...walk(path.join(ROOT, 'docs')), path.join(ROOT, 'README.md')]
  const found = files.map((f) => path.relative(ROOT, f)).filter((rel) => !ALLOWED.has(rel) && /onboard/i.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')))
  assert.deepEqual(found, [])
})

test('the help does not list it and still lists the skills a person invokes (C4)', () => {
  const help = fs.readFileSync(path.join(ROOT, 'plugins', 'aether', 'skills', 'help', 'SKILL.md'), 'utf8')
  assert.ok(!/onboard/i.test(help))
  assert.ok(help.includes('/aether:audit') && help.includes('/aether:doctor'))
})
```

Más: cambiar `tests/help.test.js:71` para que compruebe `skills.includes('audit')`; el resto de las pruebas de `tests/help.test.js` y `tests/docs-facts.test.js` deben seguir pasando.

**Acceptance:**

- `node --test tests/onboard-retired.test.js tests/help.test.js tests/audit-skill.test.js tests/docs-facts.test.js` pasa y `npm test` completo pasa.
- `/aether:onboard` solo aparece en `docs/changelog.md` y `docs/decisions.md` (y en `specs/`, que no se lee); `tests/docs-facts.test.js` no tiene una excepción nueva sin motivo escrito.

---

### Task 8: Clasificar las rutas de `.claude` y dejar pasar `skills/` y `rules/`

**Aether:**
- Review: xhigh — dejar pasar una ruta de más permite escribir la configuración o los hooks de Claude Code sin que nadie lo pregunte
- Area: permissions
- Owns: `plugins/aether/lib/tree-paths.js`, `plugins/aether/lib/continuity-permission.js`, `tests/continuity-permission.test.js`
- Depends on: Task 6 — la historia H2 empieza cuando H1 está fusionada
- Depends on: Task 3 — el bin `aether-continuity` ya tiene el verbo `permission` y un `continuity-permission.js` mínimo
- Serves: R20, R40

**Interfaces:**

En `plugins/aether/lib/tree-paths.js` (`// Family: tree.`):

- `realResolve(file)` devuelve la ruta absoluta de `file` con los enlaces simbólicos de su ancestro más largo que existe resueltos y el resto sin tocar (sirve aunque el archivo aún no exista). Las demás tareas que necesiten la ruta real (la guarda, las skills) usan esta función y no escriben otra.
- `classifyClaudePath(file, { cwd, home = os.homedir() })` devuelve `{ kind, real }`. `file` es absoluto o relativo a `cwd`. `real` es la ruta resuelta siguiendo los enlaces simbólicos de su ancestro más largo que existe. `kind` es:
  - `'config'` cuando la ruta escrita o la real es `settings.json`, `settings.local.json` o algo dentro de `hooks/`, directamente dentro de un `.claude/` de un proyecto;
  - `'skills'` o `'rules'` cuando la ruta escrita está dentro de `.claude/skills/` o `.claude/rules/` de un proyecto y la ruta real también está dentro de esa misma carpeta (resuelta);
  - `'escape'` cuando la ruta escrita está dentro de `.claude/skills/` o `.claude/rules/` pero la real sale de ella (un `..` o un enlace) y no es `config`;
  - `'other'` en cualquier otro caso (incluido `~/.claude/`, que no es del proyecto: A13).
  - Los proyectos son el de `git rev-parse --show-toplevel` desde `cwd` y la raíz principal (`repoPaths(cwd).mainRoot`); fuera de git, solo `cwd`.

En `plugins/aether/lib/continuity-permission.js`:

- `permission(input, ctx)` devuelve `true` solo cuando `input.tool_name` es `Write`, `Edit`, `MultiEdit` o `NotebookEdit` (la ruta es `tool_input.file_path`, o `tool_input.notebook_path` en `NotebookEdit`) y `classifyClaudePath(...).kind` es `'skills'` o `'rules'`; en cualquier otro caso `false`. Nunca lanza.

**Tests (write first):**

`tests/continuity-permission.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { classifyClaudePath, realResolve } = require('../plugins/aether/lib/tree-paths.js')
const { permission } = require('../plugins/aether/lib/continuity-permission.js')
const { markSession } = require('../plugins/aether/lib/session.js')

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const outside = tempDir(t, 'aether-outside-')
  const claude = path.join(repo.dir, '.claude')
  for (const dir of ['skills', 'rules', 'hooks']) fs.mkdirSync(path.join(claude, dir), { recursive: true })
  fs.writeFileSync(path.join(claude, 'settings.json'), '{}')
  fs.symlinkSync('..', path.join(claude, 'skills', 'up'))
  fs.symlinkSync(outside, path.join(claude, 'skills', 'out'))
  fs.mkdirSync(path.join(repo.dir, '.agents', 'skills', 'linked'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'linked'), path.join(claude, 'skills', 'linked'))
  return { repo, home, outside, claude }
}
const kind = (w, file) => classifyClaudePath(file, { cwd: w.repo.dir, home: w.home }).kind
const input = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: tool === 'NotebookEdit' ? { notebook_path: file } : { file_path: file } })

test('skills/ and rules/ of the project are allowed, new files included, with absolute and relative paths (C7, H2 scenario 16)', (t) => {
  const w = world(t)
  for (const file of [path.join(w.claude, 'skills', 'x', 'SKILL.md'), path.join(w.claude, 'rules', 'y.md'), '.claude/rules/z.md', '.claude/skills/new/SKILL.md']) {
    assert.equal(permission(input(w, file), {}), true, file)
  }
  assert.equal(permission(input(w, path.join(w.claude, 'rules', 'n.ipynb'), 'NotebookEdit'), {}), true)
  for (const tool of ['Edit', 'MultiEdit']) assert.equal(permission(input(w, path.join(w.claude, 'rules', 'y.md'), tool), {}), true, tool)
  assert.equal(kind(w, path.join(w.claude, 'skills', 'x', 'SKILL.md')), 'skills')
  assert.equal(kind(w, path.join(w.claude, 'rules', 'y.md')), 'rules')
})

test('the settings, the hooks, the neighbours and every way out are not allowed (C7, R20, R21)', (t) => {
  const w = world(t)
  const refused = {
    [path.join(w.claude, 'settings.json')]: 'config',
    [path.join(w.claude, 'settings.local.json')]: 'config',
    [path.join(w.claude, 'hooks', 'pre.sh')]: 'config',
    [`${w.claude}/skills/../settings.json`]: 'config',
    [`${w.claude}/skills/x/../../hooks/h.sh`]: 'config',
    [path.join(w.claude, 'skills', 'up', 'settings.json')]: 'config',
    [path.join(w.claude, 'skills', 'out', 'x.md')]: 'escape',
    [path.join(w.claude, 'skills', 'linked', 'SKILL.md')]: 'escape',
    [path.join(w.claude, 'agents', 'a.md')]: 'other',
    [path.join(w.claude, 'agent-memory', 'm.md')]: 'other',
    [path.join(w.home, '.claude', 'skills', 'x', 'SKILL.md')]: 'other',
    [path.join(w.repo.dir, 'src', 'a.js')]: 'other',
  }
  for (const [file, expected] of Object.entries(refused)) {
    assert.equal(kind(w, file), expected, file)
    assert.equal(permission(input(w, file), {}), false, file)
  }
})

test('a copy of the working tree and a subdirectory use the .claude of their project; another repository does not (A13)', (t) => {
  const w = world(t)
  const copy = path.join(tempDir(t, 'aether-copy-'), 'wt')
  w.repo.git('worktree', 'add', '-q', copy, '-b', 'other')
  fs.mkdirSync(path.join(copy, '.claude', 'rules'), { recursive: true })
  assert.equal(permission({ tool_name: 'Write', cwd: copy, tool_input: { file_path: '.claude/rules/a.md' } }, {}), true)
  assert.equal(permission({ tool_name: 'Write', cwd: copy, tool_input: { file_path: path.join(w.claude, 'rules', 'a.md') } }, {}), true, 'the main checkout is the same project')
  fs.mkdirSync(path.join(w.repo.dir, 'src'), { recursive: true })
  assert.equal(permission({ tool_name: 'Write', cwd: path.join(w.repo.dir, 'src'), tool_input: { file_path: '../.claude/rules/a.md' } }, {}), true)
  const stranger = makeRepo(t)
  fs.mkdirSync(path.join(stranger.dir, '.claude', 'rules'), { recursive: true })
  assert.equal(permission(input(w, path.join(stranger.dir, '.claude', 'rules', 'a.md')), {}), false)
})

test('realResolve follows the links of the part that exists and keeps the rest (D10)', (t) => {
  const w = world(t)
  assert.equal(realResolve(path.join(w.claude, 'skills', 'up', 'settings.json')), path.join(w.claude, 'settings.json'))
  assert.equal(realResolve(path.join(w.claude, 'skills', 'out', 'not', 'yet.md')), path.join(w.outside, 'not', 'yet.md'))
  assert.equal(realResolve(path.join(w.repo.dir, 'missing', 'a.md')), path.join(w.repo.dir, 'missing', 'a.md'))
})

test('other tools and bad inputs are not allowed and never throw', (t) => {
  const w = world(t)
  assert.equal(permission({ tool_name: 'Bash', cwd: w.repo.dir, tool_input: { command: 'touch .claude/rules/a.md' } }, {}), false)
  assert.equal(permission({ tool_name: 'Write', cwd: w.repo.dir, tool_input: {} }, {}), false)
  assert.equal(permission(null, {}), false)
  assert.equal(permission({}, {}), false)
})

test('through the bin: the decision is allow for the Lead, and nothing for the settings or for a session that is not the Lead (C7, R40)', (t) => {
  const w = world(t)
  const data = tempDir(t, 'aether-data-')
  markSession(data, 's1', 1000, { repo: w.repo.dir, claude: null })
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const ask = (session, file) => spawnSync(process.execPath, [bin, 'permission'], { input: JSON.stringify({ hook_event_name: 'PermissionRequest', ...input(w, file), session_id: session }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: data } })
  const allowed = ask('s1', path.join(w.claude, 'skills', 'x', 'SKILL.md'))
  assert.equal(allowed.status, 0)
  assert.deepEqual(JSON.parse(allowed.stdout), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } })
  assert.deepEqual([ask('s1', path.join(w.claude, 'settings.json')).stdout, ask('s1', path.join(w.claude, 'settings.json')).status], ['', 0])
  const plain = ask('plain-session', path.join(w.claude, 'skills', 'x', 'SKILL.md'))
  assert.deepEqual([plain.status, plain.stdout], [0, ''])
})
```

**Acceptance:**

- `node --test tests/continuity-permission.test.js` pasa y `npm test` completo pasa.
- Solo `.claude/skills/` y `.claude/rules/` del proyecto de la sesión pasan; todo lo demás sigue su camino normal (el hook no imprime nada), y en una sesión que no es del Lead el hook no imprime ni escribe nada.
- `classifyClaudePath` no escribe nada y se puede reutilizar desde `lib/guard.js` (tarea 11).

---

### Task 9: Revisar `CLAUDE.md` y `AGENTS.md` tras editarlos

**Aether:**
- Area: tree
- Owns: `plugins/aether/lib/tree-check.js`, `plugins/aether/lib/continuity-posttool.js`, `tests/tree-check.test.js`
- Depends on: Task 5 — el despachador de PostToolUse y su lista de manejadores
- Depends on: Task 6 — la historia H2 empieza cuando H1 está fusionada
- Serves: R12, R40

**Interfaces:**

En `plugins/aether/lib/tree-check.js` (`// Family: tree.`):

- `MAX_LINES = 200`.
- `importsAgents(text)` devuelve `true` si alguna línea de `text`, fuera de un bloque de código con cercas, es `@AGENTS.md` o `@./AGENTS.md` (con espacios alrededor, o seguida de espacio y texto).
- `checkProjectFiles(root, { maxLines = MAX_LINES } = {})` mira `<root>/CLAUDE.md` y `<root>/AGENTS.md` y devuelve un arreglo de hallazgos `{ code, file, lines? }`: `claude-no-import` cuando existen los dos y `CLAUDE.md` no importa a `AGENTS.md`; `claude-too-long` (con `lines`) cuando `CLAUDE.md` tiene más de `maxLines` renglones; `agents-too-long` (con `lines`) cuando `AGENTS.md` tiene más de `maxLines` renglones. Los renglones son los de `text.split('\n')` sin contar el vacío final. Un archivo que falta o no se lee no da hallazgo.
- `findingText(finding, { spanish })` devuelve el texto del hallazgo. Inglés: `CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.`, `CLAUDE.md has <n> lines (the limit is 200): move what is not Claude-only to AGENTS.md or to .claude/rules/.`, `AGENTS.md has <n> lines (the limit is 200): split it and keep it a map.` Español: `CLAUDE.md no importa a AGENTS.md: agrega la línea @AGENTS.md a CLAUDE.md.`, `CLAUDE.md tiene <n> líneas (el tope es 200): pasa lo que no es solo de Claude a AGENTS.md o a .claude/rules/.`, `AGENTS.md tiene <n> líneas (el tope es 200): divídelo y déjalo como un mapa.` Con `maxLines` distinto de 200, el número del tope es el que se usó.
- `posttool(input, ctx)` es el manejador de PostToolUse: cuando `input.tool_name` es `Write`, `Edit` o `MultiEdit` y la ruta (resuelta contra `input.cwd`) es el `CLAUDE.md` o el `AGENTS.md` de la raíz de la copia de trabajo (`git rev-parse --show-toplevel`) o de la raíz principal, revisa esa raíz con `checkProjectFiles` y devuelve los textos de todos los hallazgos, uno por línea (con `isSpanish(ctx.env)`); sin hallazgos o con otra ruta, `null`. No cambia ningún archivo.

En `plugins/aether/lib/continuity-posttool.js`, `HANDLERS` gana `treeCheck.posttool` después del recordatorio de memoria.

**Tests (write first):**

`tests/tree-check.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const check = require('../plugins/aether/lib/tree-check.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
const put = (root, name, text) => fs.writeFileSync(path.join(root, name), text)

test('importsAgents sees @AGENTS.md as a line and not inside a code fence', () => {
  assert.equal(check.importsAgents('@AGENTS.md\n'), true)
  assert.equal(check.importsAgents('# Claude\n\n@AGENTS.md\n\nUse pnpm.\n'), true)
  assert.equal(check.importsAgents('  @./AGENTS.md  \n'), true)
  assert.equal(check.importsAgents('see @AGENTS.md for more\n'), false)
  assert.equal(check.importsAgents('```\n@AGENTS.md\n```\n'), false)
  assert.equal(check.importsAgents(''), false)
})

test('a CLAUDE.md of 74 lines that does not import a 161-line AGENTS.md is reported; a one-line @AGENTS.md is not (C5, H2 scenario 10)', (t) => {
  const dir = tempDir(t)
  put(dir, 'AGENTS.md', lines(161))
  put(dir, 'CLAUDE.md', lines(74))
  assert.deepEqual(check.checkProjectFiles(dir), [{ code: 'claude-no-import', file: 'CLAUDE.md' }])
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.deepEqual(check.checkProjectFiles(dir), [])
})

test('the limit of 200 lines applies to CLAUDE.md and to AGENTS.md, and only warns (A5, R12)', (t) => {
  const dir = tempDir(t)
  put(dir, 'CLAUDE.md', lines(201))
  assert.deepEqual(check.checkProjectFiles(dir), [{ code: 'claude-too-long', file: 'CLAUDE.md', lines: 201 }])
  put(dir, 'CLAUDE.md', lines(200))
  assert.deepEqual(check.checkProjectFiles(dir), [])
  put(dir, 'AGENTS.md', lines(1543))
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.deepEqual(check.checkProjectFiles(dir), [{ code: 'agents-too-long', file: 'AGENTS.md', lines: 1543 }])
  assert.deepEqual(check.checkProjectFiles(dir, { maxLines: 2000 }), [])
  assert.deepEqual(check.checkProjectFiles(path.join(dir, 'missing')), [])
})

test('findingText says what fails, in English and in Spanish', () => {
  assert.equal(check.findingText({ code: 'claude-no-import', file: 'CLAUDE.md' }, { spanish: false }), 'CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.')
  assert.equal(check.findingText({ code: 'claude-too-long', file: 'CLAUDE.md', lines: 250 }, { spanish: false }), 'CLAUDE.md has 250 lines (the limit is 200): move what is not Claude-only to AGENTS.md or to .claude/rules/.')
  assert.equal(check.findingText({ code: 'agents-too-long', file: 'AGENTS.md', lines: 1543 }, { spanish: true }), 'AGENTS.md tiene 1543 líneas (el tope es 200): divídelo y déjalo como un mapa.')
  assert.equal(check.findingText({ code: 'claude-no-import', file: 'CLAUDE.md' }, { spanish: true }), 'CLAUDE.md no importa a AGENTS.md: agrega la línea @AGENTS.md a CLAUDE.md.')
})

test('after the Lead edits either file, the dispatcher tells it what fails and changes nothing (R12)', (t) => {
  const repo = makeRepo(t)
  put(repo.dir, 'AGENTS.md', lines(161))
  put(repo.dir, 'CLAUDE.md', lines(74))
  const before = fs.readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8')
  const ctx = { env: { LANG: 'en_US.UTF-8' }, home: tempDir(t) }
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const out = posttool.posttool({ cwd: repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(repo.dir, name) } }, ctx)
    assert.equal(out.additionalContext, 'CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.', name)
  }
  assert.equal(fs.readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), before)
  assert.equal(posttool.posttool({ cwd: repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(repo.dir, 'README.md') } }, ctx), null)
  put(repo.dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.equal(posttool.posttool({ cwd: repo.dir, tool_name: 'Write', tool_input: { file_path: 'CLAUDE.md' } }, ctx), null)
})
```

**Acceptance:**

- `node --test tests/tree-check.test.js tests/continuity-posttool.test.js` pasa y `npm test` completo pasa.
- El manejador solo avisa: no cambia ni crea ningún archivo.
- `checkProjectFiles` y `findingText` quedan listos para que el detector de la tarea 31 los reutilice.

---

### Task 10: Llevar `AGENTS.md` en las llamadas a otros harness

**Aether:**
- Area: lanes
- Owns: `plugins/aether/lib/lane-calls.js`, `tests/lane-agents-md.test.js`
- Depends on: Task 6 — la historia H2 empieza cuando H1 está fusionada
- Serves: R13

**Interfaces:**

En `plugins/aether/lib/lane-calls.js`, `claudeMdSections(workdir, home)` sigue devolviendo un arreglo de secciones `## Instructions from <ruta>\n\n<contenido sin espacios finales>`, en este orden:

1. `<home>/.claude/CLAUDE.md`;
2. `<workdir>/CLAUDE.md`;
3. `<workdir>/.claude/CLAUDE.md`;
4. `<workdir>/AGENTS.md`;
5. el `AGENTS.md` de la raíz principal del repositorio de `workdir` (`git rev-parse --path-format=absolute --git-common-dir` desde `workdir`, su carpeta padre), solo cuando es otro archivo que el de `workdir` y su contenido es distinto.

Reglas: cuando un `CLAUDE.md` (el de `workdir` o el de `.claude/`) importa a `AGENTS.md` (`@AGENTS.md` o `@./AGENTS.md` en un renglón, fuera de cercas de código), se quita ese renglón de su sección; si lo que queda es solo espacio, su sección no se escribe; el contenido de `AGENTS.md` aparece **una sola vez**, en la sección 4 (y en la 5 solo si es otro). Lo que `CLAUDE.md` trae además de la importación se conserva. Un archivo que falta se salta. `buildPrompt` y `callPrompt` no cambian: reciben las secciones por esta función.

**Tests (write first):**

`tests/lane-agents-md.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const { claudeMdSections, buildPrompt } = require('../plugins/aether/lib/lane-calls.js')

const put = (dir, name, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
  fs.writeFileSync(path.join(dir, name), text)
}
const section = (file, text) => `## Instructions from ${file}\n\n${text}`

test('a CLAUDE.md alone gives its section as before (R13)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(home, '.claude/CLAUDE.md', 'personal rules\n')
  put(dir, 'CLAUDE.md', 'project rules\n')
  put(dir, '.claude/CLAUDE.md', 'more rules\n')
  assert.deepEqual(claudeMdSections(dir, home), [
    section(path.join(home, '.claude', 'CLAUDE.md'), 'personal rules'),
    section(path.join(dir, 'CLAUDE.md'), 'project rules'),
    section(path.join(dir, '.claude', 'CLAUDE.md'), 'more rules'),
  ])
  assert.deepEqual(claudeMdSections(tempDir(t), tempDir(t)), [])
})

test('an AGENTS.md alone gives its section, and one next to a CLAUDE.md that does not import it gives both (R13, C5)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'the map\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'AGENTS.md'), 'the map')])
  put(dir, 'CLAUDE.md', 'claude only\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'CLAUDE.md'), 'claude only'), section(path.join(dir, 'AGENTS.md'), 'the map')])
})

test('a CLAUDE.md that is only @AGENTS.md leaves the content of AGENTS.md once, and what else it says stays (R13, H2 scenario 11)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'the map\n')
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'AGENTS.md'), 'the map')])
  put(dir, 'CLAUDE.md', '@AGENTS.md\n\nUse pnpm, not npm.\n')
  const sections = claudeMdSections(dir, home)
  assert.equal(sections.length, 2)
  assert.ok(sections[0].startsWith(`## Instructions from ${path.join(dir, 'CLAUDE.md')}`) && sections[0].includes('Use pnpm, not npm.') && !sections[0].includes('@AGENTS.md'))
  assert.equal(sections[1], section(path.join(dir, 'AGENTS.md'), 'the map'))
  put(dir, 'CLAUDE.md', '@./AGENTS.md\n')
  assert.equal(claudeMdSections(dir, home).length, 1)
})

test('the prompt of a call carries the content of AGENTS.md exactly once when CLAUDE.md is only the import (C5)', (t) => {
  const dir = tempDir(t)
  put(dir, 'AGENTS.md', 'MAP-OF-THE-PROJECT-4711\n')
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  const prompt = buildPrompt({ role: 'implementer', message: 'do the task', workdir: dir, home: tempDir(t) })
  assert.equal(prompt.split('MAP-OF-THE-PROJECT-4711').length - 1, 1)
  assert.ok(prompt.endsWith('do the task'))
})

test('the AGENTS.md of the main checkout is added when a copy of the working tree has another one, and not when it is the same (R13)', (t) => {
  const repo = makeRepo(t)
  const home = tempDir(t)
  put(repo.dir, 'AGENTS.md', 'main map\n')
  repo.git('add', 'AGENTS.md')
  repo.git('commit', '-q', '-m', 'agents')
  const copy = path.join(tempDir(t), 'wt')
  repo.git('worktree', 'add', '-q', copy, '-b', 'unit')
  assert.deepEqual(claudeMdSections(copy, home), [section(path.join(copy, 'AGENTS.md'), 'main map')])
  put(copy, 'AGENTS.md', 'copy map\n')
  assert.deepEqual(claudeMdSections(copy, home), [section(path.join(copy, 'AGENTS.md'), 'copy map'), section(path.join(repo.dir, 'AGENTS.md'), 'main map')])
})
```

**Acceptance:**

- `node --test tests/lane-agents-md.test.js` pasa y `npm test` completo pasa (las pruebas de lanes que ya existen siguen verdes: sin `AGENTS.md` el resultado es el de antes).
- `AGENTS.md` nunca se pega dos veces, y el contenido de un `CLAUDE.md` más allá de la importación se conserva.

---

### Task 11: Rechazar escribir la configuración y los hooks de Claude Code y vigilar el examen en su lugar nuevo

**Aether:**
- Review: xhigh — la guarda es lo único que impide que un agente cambie la configuración o los hooks de Claude Code
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard-claude.test.js`, `tests/guard.test.js`
- Depends on: Task 8 — usa `classifyClaudePath` de `lib/tree-paths.js`
- Serves: R21, R15

**Interfaces:**

En `plugins/aether/lib/guard.js`:

- `decide(input)` (herramientas de archivos): después de la protección del registro de autonomía, si `classifyClaudePath(target, { cwd }).kind === 'config'`, devuelve `{ reason }` para cualquier agente (el Lead, el Writer, un implementador o la sesión principal). El texto empieza por `In Aether mode no agent writes Claude Code's settings or hooks` y nombra la ruta.
- `decideBash(input, env)`: antes de las clases irreversibles, si el comando nombra una de las rutas de configuración (`.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks` o algo dentro, con cualquier prefijo de ruta, también con `./` o `$PWD/`) y no es un comando de solo lectura (los de la lista `READ_COMMANDS` que ya usa la guarda: `echo`, `printf`, `cat`, `more`, `head`, `tail`, `grep`, `ls`, `stat`, `wc`, `diff`, `jq` y los demás de esa lista; `git status` no está en ella, y no nombra esas rutas, así que pasa por otra razón), devuelve `{ reason }` con el mismo texto. Un comando de solo lectura sobre esas rutas pasa. Una redirección `>` o `>>` a esas rutas se rechaza aunque el comando sea de lectura. Escribir en `.claude/skills/` o `.claude/rules/` por Bash pasa.
- El Examinador escribe solo bajo `.aether/exam/` en la raíz del repositorio, y también bajo `.aether-exam/` (el estado viejo): `EXAM_PATH` acepta los dos y el mensaje de rechazo nombra `.aether/exam/`. `tests/guard.test.js:50-59` fija el mensaje viejo («under .aether-exam/ at the repository root»): la tarea reescribe solo esa prueba para el mensaje nuevo y deja que acepte las dos carpetas; el resto del archivo no cambia.
- Lo demás de la guarda no cambia.

**Tests (write first):**

`tests/guard-claude.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const { decide, decideBash } = require('../plugins/aether/lib/guard.js')

function world(t) {
  const repo = makeRepo(t)
  const claude = path.join(repo.dir, '.claude')
  for (const dir of ['skills', 'rules', 'hooks']) fs.mkdirSync(path.join(claude, dir), { recursive: true })
  fs.symlinkSync('..', path.join(claude, 'skills', 'up'))
  return { repo, claude }
}
const WHO = [
  {},
  { agent_type: 'aether:lead' },
  { agent_type: 'aether:writer', agent_id: 'w1' },
  { agent_type: 'aether:implementer', agent_id: 'i1' },
  { agent_type: 'general-purpose', agent_id: 'g1' },
]
const file = (w, target, who = {}, tool = 'Write') => ({ hook_event_name: 'PreToolUse', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: target }, ...who })
const bash = (w, command) => decideBash({ hook_event_name: 'PreToolUse', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command }, session_id: 's1' }, {})
const REASON = /^In Aether mode no agent writes Claude Code's settings or hooks/

test('no agent writes the settings or the hooks of Claude Code with the file tools (C7, R21)', (t) => {
  const w = world(t)
  const targets = [
    path.join(w.claude, 'settings.json'),
    path.join(w.claude, 'settings.local.json'),
    path.join(w.claude, 'hooks', 'pre.sh'),
    `${w.claude}/skills/../settings.json`,
    path.join(w.claude, 'skills', 'up', 'settings.json'),
    '.claude/settings.json',
  ]
  for (const target of targets) {
    for (const who of WHO) for (const tool of ['Write', 'Edit', 'MultiEdit']) {
      const decision = decide(file(w, target, who, tool))
      assert.ok(decision && REASON.test(decision.reason), `${tool} ${target} ${JSON.stringify(who)}`)
    }
  }
  const notebook = decide({ cwd: w.repo.dir, tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(w.claude, 'hooks', 'n.ipynb') } })
  assert.ok(notebook && REASON.test(notebook.reason))
})

test('skills/, rules/ and their neighbours pass the guard, which only closes the settings and the hooks (R21)', (t) => {
  const w = world(t)
  for (const target of [path.join(w.claude, 'skills', 'x', 'SKILL.md'), path.join(w.claude, 'rules', 'y.md'), path.join(w.claude, 'agents', 'a.md'), path.join(w.claude, 'settings.json.bak'), path.join(w.repo.dir, 'src', 'a.js')]) {
    for (const who of WHO) assert.equal(decide(file(w, target, who)), null, `${target} ${JSON.stringify(who)}`)
  }
})

test('Bash commands that name the settings or the hooks and write are refused; reading and the skills folders are not (R21, A14)', (t) => {
  const w = world(t)
  for (const command of [
    "echo '{}' > .claude/settings.json",
    'echo x >> ./.claude/settings.local.json',
    "sed -i 's/a/b/' .claude/settings.json",
    'rm -f .claude/hooks/pre.sh',
    'cp /tmp/h .claude/hooks/h.sh',
    'tee .claude/settings.json < /tmp/x',
    'mv a $PWD/.claude/settings.json',
    `cat /tmp/a > ${path.join(w.claude, 'settings.json')}`,
    'cat .claude/settings.json > .claude/settings.local.json',
    "python3 -c \"open('.claude/settings.json','w').write('{}')\"",
  ]) {
    const decision = bash(w, command)
    assert.ok(decision && REASON.test(decision.reason), command)
  }
  for (const command of ['cat .claude/settings.json', 'ls .claude/hooks', 'grep -r x .claude/hooks', 'git status', 'ls .claude/skills', 'echo hi > .claude/skills/x/SKILL.md', 'cp a .claude/rules/b.md']) {
    assert.equal(bash(w, command), null, command)
  }
})

test('the Examiner writes under .aether/exam/ and under the old .aether-exam/, and nowhere else (R15)', (t) => {
  const w = world(t)
  const examiner = { agent_type: 'aether:examiner', agent_id: 'e1' }
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether', 'exam', 'c1.test.js'), examiner)), null)
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether', 'exam', 'exam.json'), examiner)), null)
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether-exam', 'c1.test.js'), examiner)), null)
  const refused = decide(file(w, path.join(w.repo.dir, 'src', 'a.js'), examiner))
  assert.ok(refused.reason.includes('.aether/exam/'))
  assert.ok(decide(file(w, path.join(w.repo.dir, '.aether', 'tmp', 'x'), examiner)))
  assert.equal(decide(file(w, path.join(w.repo.dir, '.aether', 'exam', 'c1.test.js'), { agent_type: 'aether:implementer', agent_id: 'i1' })), null, 'only the Examiner is limited to the exam folder')
})
```

**Acceptance:**

- `node --test tests/guard-claude.test.js` pasa y `npm test` completo pasa (en particular `tests/guard.test.js`, `tests/guards-bins.test.js` y las pruebas del Examinador).
- El límite A14 (un guion que arma la ruta en tiempo de ejecución) queda dicho en un comentario junto a la regla.

---

### Task 12: Mover lo temporal de las copias de trabajo a `.aether/tmp/`

**Aether:**
- Area: layout
- Owns: `plugins/aether/lib/run.js`, `plugins/aether/lib/worktrees.js`, `plugins/aether/lib/lane-work.js`, `plugins/aether/workflows/run.workflow.js`, `plugins/aether/agents/implementer.md`, `tests/layout-copies.test.js`, `tests/run.test.js`, `tests/worktrees-ensure.test.js`, `tests/lane-work.test.js`, `tests/lane-reviewer-unit.test.js`, `tests/workflow-lanes.test.js`, `tests/workflow-final-slices.test.js`, `tests/aether-lane.test.js`, `tests/lane-delegate.test.js`, `tests/retired-excludes.test.js`, `tests/fixtures/fake-agy.js`
- Depends on: Task 6 — la historia H2 empieza cuando H1 está fusionada
- Serves: R15

**Interfaces:**

Diseño D6 del plan, en la parte de «lo temporal» (las copias de lanes y los demás lugares los mueven las tareas 40, 13 y 41). En `plugins/aether/lib/run.js` (nuevas, exportadas; esta tarea define las cuatro, las demás las usan):

- `tmpDir(base)` → `<base>/.aether/tmp` (`base` es la raíz de un checkout o de una copia de trabajo).
- `laneCopiesDir(mainRoot)` → `<mainRoot>/.aether/worktrees/lanes`, `examCopiesDir(mainRoot)` → `<mainRoot>/.aether/worktrees/exams` y `workDir(mainRoot, kind, id)` → `<mainRoot>/.aether/work/<kind>/<id>` con `kind` `seats` o `delegates` (las usan las tareas 40, 13 y 41).
- `EXCLUDES` no cambia: `['/.aether/', '/.aether-tmp/', '/.aether-exam/']` (las dos últimas cubren el estado viejo).

Cambios de comportamiento de esta tarea:

- `lib/worktrees.js`: `ensure` crea `<copia>/.aether/tmp/` y no `.aether-tmp/`.
- `lib/lane-work.js`: `tmpDir(workdir)` es `<workdir>/.aether/tmp` (lo usan el implementador y las copias de lectura: `brief.md` y `package.diff`). Dónde está la copia de lectura no cambia aquí.
- `workflows/run.workflow.js` y `agents/implementer.md`: `.aether-tmp/brief.md`, `.aether-tmp/package.diff` y «the worktree's `.aether-tmp/` folder» pasan a `.aether/tmp/…`.
- Las pruebas de la lista de `Owns` que nombran `.aether-tmp` se actualizan al lugar nuevo sin perder lo que comprueban (`tests/worktrees-ensure.test.js`, `tests/lane-work.test.js`, `tests/aether-lane.test.js`, `tests/lane-delegate.test.js`, `tests/workflow-lanes.test.js`, `tests/workflow-final-slices.test.js`, `tests/lane-reviewer-unit.test.js`, `tests/fixtures/fake-agy.js`); `tests/run.test.js` y `tests/retired-excludes.test.js` siguen fijando las líneas de exclusión viejas.

**Tests (write first):**

`tests/layout-copies.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const run = require('../plugins/aether/lib/run.js')
const { ensure, diffPackage } = require('../plugins/aether/lib/worktrees.js')
const work = require('../plugins/aether/lib/lane-work.js')

test('run.js names the places of the new layout and keeps the old exclusions (R15)', () => {
  assert.equal(run.tmpDir('/r'), path.join('/r', '.aether', 'tmp'))
  assert.equal(run.laneCopiesDir('/r'), path.join('/r', '.aether', 'worktrees', 'lanes'))
  assert.equal(run.examCopiesDir('/r'), path.join('/r', '.aether', 'worktrees', 'exams'))
  assert.equal(run.workDir('/r', 'seats', 'judge-1'), path.join('/r', '.aether', 'work', 'seats', 'judge-1'))
  assert.equal(run.workDir('/r', 'delegates', 'd1'), path.join('/r', '.aether', 'work', 'delegates', 'd1'))
  assert.deepEqual(run.EXCLUDES, ['/.aether/', '/.aether-tmp/', '/.aether-exam/'])
})

test('a unit worktree keeps its temporary files in .aether/tmp and git does not see them (R15)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  assert.ok(fs.statSync(path.join(unit, '.aether', 'tmp')).isDirectory())
  assert.equal(fs.existsSync(path.join(unit, '.aether-tmp')), false)
  fs.writeFileSync(path.join(unit, '.aether', 'tmp', 'brief.md'), 'x')
  assert.equal(repo.git('-C', unit, 'status', '--porcelain'), '')
})

test('the brief of an implementer on another harness and the files of a reader copy live in .aether/tmp (R15)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const { workdir, brief } = work.prepareImplementer(repo.dir, args.runId, 'task-1')
  assert.equal(brief, path.join(workdir, '.aether', 'tmp', 'brief.md'))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  assert.deepEqual(fs.readdirSync(path.join(copy.workdir, '.aether', 'tmp')).sort(), ['brief.md', 'package.diff'])
  assert.equal(work.removeReader(repo.dir, args.runId, 'task-1-1-supervise'), true)
})

test('the run workflow and the implementer prompt name .aether/tmp/ and no longer .aether-tmp/ (R15)', () => {
  const plugin = path.join(__dirname, '..', 'plugins', 'aether')
  const flow = fs.readFileSync(path.join(plugin, 'workflows', 'run.workflow.js'), 'utf8')
  const prompt = fs.readFileSync(path.join(plugin, 'agents', 'implementer.md'), 'utf8')
  assert.ok(flow.includes('.aether/tmp/brief.md') && flow.includes('.aether/tmp/package.diff'))
  assert.ok(prompt.includes('.aether/tmp/'))
  assert.ok(!flow.includes('.aether-tmp') && !prompt.includes('.aether-tmp'))
})
```

**Acceptance:**

- `node --test tests/layout-copies.test.js` pasa y `npm test` completo pasa; todas las pruebas de `Owns` que cambiaron comprueban lo mismo que antes en el lugar nuevo.
- `git status` de una copia de unidad sigue limpio con `.aether/tmp/` dentro. La carpeta de las copias de lanes y los barridos no cambian en esta tarea.

---

### Task 13: Mover el examen a `.aether/exam/`

**Aether:**
- Area: layout
- Owns: `plugins/aether/lib/exam.js`, `plugins/aether/lib/seats.js`, `plugins/aether/lib/lane-schemas.js`, `plugins/aether/bin/aether-exam`, `plugins/aether/workflows/design.workflow.js`, `plugins/aether/agents/examiner.md`, `tests/layout-exam.test.js`, `tests/exam.test.js`, `tests/seat-partial.test.js`, `tests/workflow-design.test.js`, `tests/agents.test.js`, `tests/guards-bins.test.js`, `tests/launcher.test.js`
- Depends on: Task 12 — usa `run.examCopiesDir` que esa tarea define
- Serves: R15

**Interfaces:**

Diseño D6 del plan, en lo del examen:

- `lib/exam.js`: `EXAM_DIR` es `'.aether/exam'`; las copias donde corre el examen van en `run.examCopiesDir(mainRoot)`; `aether-exam store` toma por defecto `<raíz>/.aether/exam/`, y si no existe, la vieja `<raíz>/.aether-exam/`; `runExam` copia el examen guardado a `<copia>/.aether/exam/` y, cuando algún comando del examen guardado nombra `.aether-exam/` (un examen de una versión anterior), también a `<copia>/.aether-exam/`.
- `lib/seats.js`: `EXAM_DIR` es `'.aether/exam'` (solo esa constante: el trabajo de las rondas lo mueve la tarea 41).
- `workflows/design.workflow.js`: el Examinador escribe bajo `${repoRoot}/.aether/exam/`, y la validación de rutas del examen acepta `.aether/exam/` (y, al leer, `.aether-exam/`); la descripción de `files` («relative to .aether/exam/») en `lib/lane-schemas.js` y en el workflow. El mensaje de una ronda no cambia aquí.
- `agents/examiner.md`: todo `.aether-exam/` pasa a `.aether/exam/` (los comandos de ejemplo son `node --test .aether/exam/c1-login.test.js`). `bin/aether-exam`: su cabecera y su uso dicen la carpeta nueva.
- Las pruebas de la lista de `Owns` que nombran `.aether-exam` se actualizan al lugar nuevo, sin perder lo que comprueban.

**Tests (write first):**

`tests/layout-exam.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const exam = require('../plugins/aether/lib/exam.js')

test('the exam folder is .aether/exam, in the library and in the prompt of the Examiner (R15)', () => {
  assert.equal(exam.EXAM_DIR, '.aether/exam')
  assert.equal(exam.EXAM_FILE, 'exam.json')
  const examiner = fs.readFileSync(path.join(PLUGIN, 'agents', 'examiner.md'), 'utf8')
  assert.ok(examiner.includes('.aether/exam/') && !examiner.includes('.aether-exam'))
  const design = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  assert.ok(design.includes('.aether/exam/'))
  assert.ok(!/Write the exam under \$\{repoRoot\}\/\.aether-exam/.test(design))
})
```

Más: ampliar `tests/exam.test.js` con una prueba que guarda un examen cuyos comandos dicen `node --test .aether-exam/c1.test.js`, lo corre con `runExam` y comprueba que pasa (los archivos están también en `.aether-exam/` de la copia), y otra que guarda uno con comandos `.aether/exam/c1.test.js` y comprueba que pasa y que la copia está bajo `.aether/worktrees/exams/`.

**Acceptance:**

- `node --test tests/layout-exam.test.js tests/exam.test.js` pasa; `npm test` completo pasa.
- Un examen guardado por una versión anterior sigue corriendo; el Examinador nuevo escribe solo en `.aether/exam/`.

---

### Task 14: Escribir el mapa `.aether/README.md` y comprobar que cada ruta está en él

**Aether:**
- Area: layout
- Owns: `plugins/aether/lib/tree-map.js`, `tests/tree-map.test.js`
- Depends on: Task 12 — el mapa describe los lugares que esa tarea mueve
- Depends on: Task 13 — y los que mueve esta otra
- Depends on: Task 40 — y las copias de lanes
- Depends on: Task 41 — y los trabajos de seats y delegados
- Serves: R14

**Interfaces:**

En `plugins/aether/lib/tree-map.js` (`// Family: tree.`):

- `LAYOUT`: arreglo de entradas `{ path, what, writer, lasts, git, legacy }` (`git` es siempre `'never'`; `legacy` es `true` para los lugares viejos que el código nuevo solo lee). Las entradas, en este orden: `README.md`, `autonomy/`, `broken-runs/`, `pending.jsonl`, `runs/`, `worktrees/` (unidades de un run: `<run>/<task>`), `worktrees/lanes/`, `worktrees/exams/`, `work/seats/`, `work/delegates/`, `tmp/`, `exam/`, y las viejas `lanes/`, `exams/`, `seats/`, `delegates/` (con `legacy: true`). Cada una dice qué es, quién la escribe (`aether-autonomy`, `aether-plan`, `aether-wt`, `aether-lane`, `aether-delegate`, `aether-exam`, la guarda, el Examinador, el arranque), cuánto dura (por ejemplo `24 hours`, `7 days`, `until the run ends`) y que no va a git.
- `LAYOUT_NAMES`: `Set` de los nombres de primer nivel (`README.md`, `autonomy`, `broken-runs`, `pending.jsonl`, `runs`, `worktrees`, `work`, `tmp`, `exam`, `lanes`, `exams`, `seats`, `delegates`).
- `readmeText()` devuelve el texto de `.aether/README.md`, en inglés: un título, una frase de que es el estado local de Aether, fuera de git y distinto de `.claude/`, y una tabla con una fila por entrada de `LAYOUT` (`path`, qué es, quién la escribe, cuánto dura, `never` en git); termina diciendo que lo viejo se mueve solo, sin borrar nada, cuando ninguna sesión parece activa.
- `ensureReadme(mainRoot)` crea `<mainRoot>/.aether/` si falta y escribe `README.md` con `readmeText()` solo cuando falta o su contenido es otro (escritura atómica); devuelve `true` si escribió y `false` si no. Nunca lanza.

**Tests (write first):**

`tests/tree-map.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const map = require('../plugins/aether/lib/tree-map.js')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')

function sources(dir = PLUGIN, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'types'].includes(entry.name)) continue
      sources(full, out)
    } else if (/\.(js|mjs|md)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

test('every entry of the map says what it is, who writes it, how long it lasts and that git never has it (R14)', () => {
  assert.ok(map.LAYOUT.length >= 16)
  for (const entry of map.LAYOUT) {
    for (const key of ['path', 'what', 'writer', 'lasts']) assert.ok(typeof entry[key] === 'string' && entry[key].length > 3, `${entry.path} ${key}`)
    assert.equal(entry.git, 'never', entry.path)
  }
  assert.deepEqual(map.LAYOUT.filter((e) => e.legacy).map((e) => e.path).sort(), ['delegates/', 'exams/', 'lanes/', 'seats/'])
  assert.deepEqual([...map.LAYOUT_NAMES].sort(), ['README.md', 'autonomy', 'broken-runs', 'delegates', 'exam', 'exams', 'lanes', 'pending.jsonl', 'runs', 'seats', 'tmp', 'work', 'worktrees'])
})

test('every path that the code of Aether writes under .aether/ is in the map (C6)', () => {
  const names = new Map()
  for (const file of sources()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\.aether\/([A-Za-z][A-Za-z0-9_.-]*)/g)) names.set(m[1], file)
    for (const m of text.matchAll(/(?:aetherDir\([^)]*\)|['"]\.aether['"])\s*,\s*['"]([A-Za-z][A-Za-z0-9_.-]*)['"]/g)) names.set(m[1], file)
  }
  const unknown = [...names].filter(([name]) => !map.LAYOUT_NAMES.has(name)).map(([name, file]) => `${name} (${path.relative(PLUGIN, file)})`)
  assert.deepEqual(unknown, [])
})

test('the README lists every entry of the map and says it is never in git (R14, H2 scenario 12)', () => {
  const text = map.readmeText()
  for (const entry of map.LAYOUT) assert.ok(text.includes(`\`${entry.path}\``), entry.path)
  assert.match(text, /never/i)
  assert.match(text, /\.claude/)
})

test('ensureReadme creates .aether/ and the file once, and leaves a current file alone (R14)', (t) => {
  const root = tempDir(t)
  assert.equal(map.ensureReadme(root), true)
  const file = path.join(root, '.aether', 'README.md')
  assert.equal(fs.readFileSync(file, 'utf8'), map.readmeText())
  const stat = fs.statSync(file)
  assert.equal(map.ensureReadme(root), false)
  assert.equal(fs.statSync(file).mtimeMs, stat.mtimeMs)
  fs.writeFileSync(file, 'old text')
  assert.equal(map.ensureReadme(root), true)
  assert.equal(fs.readFileSync(file, 'utf8'), map.readmeText())
  assert.equal(map.ensureReadme(path.join(root, 'missing', 'deep')), true)
})
```

**Acceptance:**

- `node --test tests/tree-map.test.js` pasa y `npm test` completo pasa.
- La prueba de rutas falla si alguien escribe una carpeta nueva bajo `.aether/` sin ponerla en `LAYOUT` (el delegado la prueba agregando una a mano y quitándola).
- `ensureReadme` no toca el archivo cuando ya está al día.

---

### Task 15: Limpiar el arranque y llevar el sello por proyecto

**Aether:**
- Review: xhigh — borra carpetas del dueño: debe conservar toda copia con cambios sin guardar
- Area: layout
- Owns: `plugins/aether/lib/tree-clean.js`, `plugins/aether/lib/worktrees.js`, `tests/tree-clean.test.js`, `tests/wt-sweep.test.js`
- Depends on: Task 12 — comparten `lib/worktrees.js` y `tests/wt-sweep.test.js`, y los lugares nuevos
- Depends on: Task 13 — la limpieza no corre sobre un examen a medio mover
- Depends on: Task 40 — comparte `lib/worktrees.js` (el barrido de las copias de lanes) y su prueba
- Depends on: Task 41 — la limpieza barre `work/seats` y `work/delegates` de ese diseño
- Serves: R17, R18

**Interfaces:**

En `plugins/aether/lib/tree-clean.js` (`// Family: tree.`):

- `STAMP_INTERVAL_MS = 10 * 60 * 1000`, `TMP_HOURS = 24`, `WORK_DAYS = 7`.
- `stampFile(dataDir, mainRoot, kind)` → `<dataDir>/sweep/<sha1 de la ruta principal real, 16 caracteres>-<kind>.json` (`kind` es `stale` o `clean`).
- `stampDue(dataDir, mainRoot, kind, now)`: `true` si falta el sello, no se lee, es del futuro o tiene `STAMP_INTERVAL_MS` o más. `writeStamp(dataDir, mainRoot, kind, now)`: escribe `{ at: now }` de forma atómica, nunca lanza. Dos proyectos o dos clases nunca comparten archivo.
- `cleanProject(cwd, { now = Date.now(), dataDir = run.dataDir(), force = false } = {})` devuelve `{ ran, removed, kept }` (`removed` y `kept` son arreglos de `{ path, why }`). Sin `force`, solo corre si `stampDue(..., 'clean', now)`, y escribe el sello al terminar. Borra: (1) lo de `<raíz>/.aether/tmp/` y de la vieja `<raíz>/.aether-tmp/` cuya última modificación es de más de `TMP_HOURS` horas; (2) cada carpeta de `<raíz>/.aether/work/seats/`, `work/delegates/` y de las viejas `.aether/seats/` y `.aether/delegates/` cuya modificación más reciente (la carpeta y su primer nivel) es de más de `WORK_DAYS` días y que no tiene una copia de trabajo registrada con cambios sin guardar: una copia registrada y limpia se quita con `git worktree remove`, una no registrada se borra con su carpeta, y una con cambios se conserva (`kept`, motivo `unsaved changes`). Todo borrado se comprueba dentro de `<raíz>/.aether/` antes de hacerse. No toca `runs/`, `autonomy/`, `worktrees/`, `pending.jsonl` ni nada fuera de esas carpetas.
- En `lib/worktrees.js`, `sweepStale` usa `stampDue(dataDir, mainRoot, 'stale', now)` y `writeStamp(..., 'stale', now)` en vez del sello único `sweep-stale.json` (que ya no se lee ni se escribe). `SWEEP_STALE_INTERVAL_MS` sigue exportado con el mismo valor.

**Tests (write first):**

`tests/tree-clean.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { makeRepo, tempDir } = require('./helpers.js')
const clean = require('../plugins/aether/lib/tree-clean.js')

const NOW = Date.parse('2026-11-07T12:00:00Z')
const hours = (n) => new Date(NOW - n * 3600 * 1000)
const age = (target, n) => fs.utimesSync(target, hours(n), hours(n))
function file(p, text = 'x', n = 0) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
  age(p, n)
}

test('tmp/ and the old .aether-tmp/ lose what is older than 24 hours and keep what is newer (R17, A6)', (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  file(path.join(repo.dir, '.aether', 'tmp', 'seats', 's1', 'message.md'), 'm', 30)
  age(path.join(repo.dir, '.aether', 'tmp', 'seats', 's1'), 30)
  age(path.join(repo.dir, '.aether', 'tmp', 'seats'), 30)
  file(path.join(repo.dir, '.aether', 'tmp', 'fresh.md'), 'f', 2)
  file(path.join(repo.dir, '.aether-tmp', 'old.md'), 'o', 48)
  const result = clean.cleanProject(repo.dir, { now: NOW, dataDir })
  assert.equal(result.ran, true)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'tmp', 'seats')), false)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether-tmp', 'old.md')), false)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'tmp', 'fresh.md')), true)
})

test('finished seat and delegate work of more than 7 days goes, with a clean registered copy removed through git; newer work stays (R17, A6)', (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const oldSeat = path.join(repo.dir, '.aether', 'work', 'seats', 'judge-20261101-000000-aaaa')
  const newSeat = path.join(repo.dir, '.aether', 'work', 'seats', 'judge-20261107-000000-bbbb')
  const legacy = path.join(repo.dir, '.aether', 'seats', 'writer-20261001-000000-cccc')
  const delegate = path.join(repo.dir, '.aether', 'work', 'delegates', 'd-old')
  file(path.join(oldSeat, 'pair.json'), '{}', 24 * 9)
  repo.git('worktree', 'add', '-q', '--detach', path.join(oldSeat, 'wt'))
  file(path.join(newSeat, 'pair.json'), '{}', 24)
  file(path.join(legacy, 'pair.json'), '{}', 24 * 20)
  file(path.join(delegate, 'brief.md'), '{}', 24 * 8)
  age(oldSeat, 24 * 9)
  age(legacy, 24 * 20)
  age(delegate, 24 * 8)
  age(path.join(oldSeat, 'wt'), 24 * 9)
  const result = clean.cleanProject(repo.dir, { now: NOW, dataDir })
  for (const gone of [oldSeat, legacy, delegate]) assert.equal(fs.existsSync(gone), false, gone)
  assert.equal(fs.existsSync(newSeat), true)
  assert.ok(!repo.git('worktree', 'list', '--porcelain').includes('judge-20261101'))
  assert.ok(result.removed.length >= 3)
})

test('a seat copy with unsaved changes is never removed, however old (R17)', (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const seat = path.join(repo.dir, '.aether', 'work', 'seats', 'writer-20260101-000000-dddd')
  fs.mkdirSync(seat, { recursive: true })
  repo.git('worktree', 'add', '-q', '--detach', path.join(seat, 'wt'))
  fs.writeFileSync(path.join(seat, 'wt', 'partial-spec.md'), 'unsaved work')
  age(path.join(seat, 'wt', 'partial-spec.md'), 24 * 60)
  age(path.join(seat, 'wt'), 24 * 60)
  age(seat, 24 * 60)
  const result = clean.cleanProject(repo.dir, { now: NOW, dataDir })
  assert.equal(fs.readFileSync(path.join(seat, 'wt', 'partial-spec.md'), 'utf8'), 'unsaved work')
  assert.ok(result.kept.some((k) => k.path === seat && /unsaved/.test(k.why)))
})

test('nothing outside the cleaned folders is touched: runs, autonomy, pending and the units stay (R17)', (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const keep = [path.join(repo.dir, '.aether', 'runs', '20260101-000000-abcd', 'graph.json'), path.join(repo.dir, '.aether', 'autonomy', 'grants.json'), path.join(repo.dir, '.aether', 'pending.jsonl'), path.join(repo.dir, 'notes.txt')]
  for (const f of keep) file(f, 'keep', 24 * 90)
  clean.cleanProject(repo.dir, { now: NOW, dataDir })
  for (const f of keep) assert.equal(fs.readFileSync(f, 'utf8'), 'keep', f)
})

test('the stamp is of each project and each kind: a second project is cleaned in its own start (R18, issue 186, H2 scenario 13)', (t) => {
  const a = makeRepo(t)
  const b = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  assert.notEqual(clean.stampFile(dataDir, a.dir, 'clean'), clean.stampFile(dataDir, b.dir, 'clean'))
  assert.notEqual(clean.stampFile(dataDir, a.dir, 'clean'), clean.stampFile(dataDir, a.dir, 'stale'))
  assert.equal(clean.cleanProject(a.dir, { now: NOW, dataDir }).ran, true)
  assert.equal(clean.cleanProject(a.dir, { now: NOW + 60000, dataDir }).ran, false, 'within 10 minutes the same project is not cleaned again')
  assert.equal(clean.cleanProject(b.dir, { now: NOW + 120000, dataDir }).ran, true, 'the stamp of A does not leave B uncleaned')
  assert.equal(clean.cleanProject(a.dir, { now: NOW + clean.STAMP_INTERVAL_MS + 1, dataDir }).ran, true)
  assert.equal(clean.stampDue(dataDir, a.dir, 'clean', NOW - 3600000), true, 'a stamp from the future says due')
})

test('two writes of the stamp at the same time do not lose the stamp of another project (R18)', async (t) => {
  const a = makeRepo(t)
  const b = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const lib = path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'tree-clean.js')
  const writer = (root) => new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', `const c = require(${JSON.stringify(lib)}); for (let i = 0; i < 50; i++) c.writeStamp(${JSON.stringify(dataDir)}, ${JSON.stringify(root)}, 'stale', ${NOW} + i)`], { stdio: 'ignore' })
    child.on('exit', resolve)
  })
  await Promise.all([writer(a.dir), writer(b.dir)])
  for (const root of [a.dir, b.dir]) assert.equal(JSON.parse(fs.readFileSync(clean.stampFile(dataDir, root, 'stale'), 'utf8')).at, NOW + 49)
})
```

En `tests/wt-sweep.test.js`: las pruebas del sello cambian de `sweep-stale.json` al archivo por proyecto (`stampFile(dataDir, mainRoot, 'stale')`) y se agrega una con dos repositorios que comparten `dataDir`: el sello de uno no impide barrer el otro.

**Acceptance:**

- `node --test tests/tree-clean.test.js tests/wt-sweep.test.js` pasa y `npm test` completo pasa.
- La limpieza solo borra dentro de `<raíz>/.aether/` y de la vieja `.aether-tmp/`, nunca una copia registrada con cambios sin guardar, y deja una huella de lo que borró en su resultado.

---

### Task 16: Migrar el estado viejo de `.aether/` sin perder trabajo

**Aether:**
- Review: xhigh — mueve carpetas del dueño, entre ellas copias de trabajo con cambios sin guardar, y no debe romper una sesión que sigue escribiendo
- Area: layout
- Owns: `plugins/aether/lib/tree-migrate.js`, `tests/tree-migrate.test.js`
- Depends on: Task 2 — la puerta usa las marcas de sesión (`repoSessions`, `oldStyleMarks`)
- Depends on: Task 13 — la migración mueve hacia el diseño que cierran estas tareas
- Depends on: Task 40 — (las copias de lanes)
- Depends on: Task 41 — (los trabajos de seats y delegados y el mensaje)
- Serves: R19

**Interfaces:**

En `plugins/aether/lib/tree-migrate.js` (`// Family: tree.`):

- `ACTIVITY_MS = 2 * 3600 * 1000` (A18; las 12 horas de una marca vieja son `OLD_MARK_MS` de `lib/session.js`).
- `migrationGate(mainRoot, { dataDir, now = Date.now(), selfSession = null, selfProcess = null, procRoot = '/proc' })` devuelve `{ move, reasons }`. `reasons` contiene, sin repetir y en este orden, cada condición que se cumple: `live-session` (una marca de este repositorio, distinta de `selfSession` y que no es del mismo proceso `claude` que `selfProcess` —un `/clear` abre otro id en el mismo proceso—, cuyo proceso está vivo; `repoSessions(..., { except: selfSession, exceptProcess: selfProcess })` con `state === 'alive'`), `old-mark` (`oldStyleMarks(dataDir, { now })` no está vacío; una marca sin campo `repo` de menos de 12 horas, sin contar la de `selfSession`) y `recent-writes` (algún archivo o carpeta bajo `<mainRoot>/.aether/`, `.aether-tmp/` o `.aether-exam/`, a cualquier profundidad, tiene una modificación de las últimas `ACTIVITY_MS`, sin contar la propia carpeta raíz ni `.aether/README.md`). `move` es `reasons.length === 0`. No escribe nada.
- `migrate(mainRoot, { gate })` hace el movimiento solo si `gate.move`; si no, no cambia nada y devuelve `{ moved: [], kept: [], deferred: gate.reasons }`. Mueve, de `<mainRoot>`: `.aether/lanes` → `.aether/worktrees/lanes`, `.aether/exams` → `.aether/worktrees/exams`, `.aether/seats` → `.aether/work/seats`, `.aether/delegates` → `.aether/work/delegates`, `.aether-tmp` → `.aether/tmp`, `.aether-exam` → `.aether/exam`. Una carpeta vieja que el destino aún no tiene se mueve entera con `fs.renameSync`; si el destino existe, se mueven sus hijos que el destino no tiene. Una copia de trabajo registrada en git (cualquier carpeta que `git worktree list` nombra, a cualquier profundidad bajo la vieja) se mueve con `git worktree move <de> <a>`, así sigue registrada con sus cambios sin guardar. Lo que no se puede mover (un destino que ya tiene ese nombre, una copia bloqueada, un error de git o de sistema) se queda donde está y se anota en `kept` con el motivo, y `from` es la ruta más honda que no se pudo mover (un archivo cuyo nombre el destino ya tiene, o una copia de trabajo); lo demás de esa carpeta vieja se mueve igual. Una carpeta vieja que queda vacía se quita con `rmdir`. **No borra ningún archivo ni ninguna carpeta con contenido** y no toca los restos del CLI viejo ni `.aether/worktrees/<run>/<task>`. Devuelve `{ moved: [{ from, to }], kept: [{ from, why }], deferred: [] }`.

**Tests (write first):**

`tests/tree-migrate.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir } = require('./helpers.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const migrate = require('../plugins/aether/lib/tree-migrate.js')

const NOW = Date.now()
const hours = (n) => new Date(NOW - n * 3600 * 1000)

function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}
function quiet(root) {
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    const full = path.join(root, entry)
    try { fs.utimesSync(full, hours(5), hours(5)) } catch { /* gone */ }
  }
  fs.utimesSync(root, hours(5), hours(5))
}

// A project with the old state: seats with an unsaved copy, a lane copy, the old exam and tmp folders.
function oldState(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 1: { comm: 'init', ppid: 0, start: 1 } })
  const aether = path.join(repo.dir, '.aether')
  fs.mkdirSync(path.join(aether, 'seats', 'judge-1'), { recursive: true })
  fs.writeFileSync(path.join(aether, 'seats', 'judge-1', 'pair.json'), '{}')
  repo.git('worktree', 'add', '-q', '--detach', path.join(aether, 'seats', 'judge-1', 'wt'))
  fs.writeFileSync(path.join(aether, 'seats', 'judge-1', 'wt', 'unsaved.md'), 'unsaved work')
  fs.mkdirSync(path.join(aether, 'lanes', '20261101-000000-abcd'), { recursive: true })
  repo.git('worktree', 'add', '-q', '--detach', path.join(aether, 'lanes', '20261101-000000-abcd', 'task-1-1-supervise'))
  fs.mkdirSync(path.join(aether, 'delegates', 'd1'), { recursive: true })
  fs.writeFileSync(path.join(aether, 'delegates', 'd1', 'brief.md'), 'brief')
  fs.mkdirSync(path.join(repo.dir, '.aether-exam'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether-exam', 'c1.test.js'), 'exam')
  fs.mkdirSync(path.join(repo.dir, '.aether-tmp', 'seats', 's1'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether-tmp', 'seats', 's1', 'message.md'), 'message')
  fs.mkdirSync(path.join(aether, 'autonomy'), { recursive: true })
  fs.writeFileSync(path.join(aether, 'autonomy', 'grants.json'), '{}')
  fs.writeFileSync(path.join(aether, 'aether.db'), 'old cli')
  quiet(aether)
  quiet(path.join(repo.dir, '.aether-exam'))
  quiet(path.join(repo.dir, '.aether-tmp'))
  const gate = (extra = {}) => migrate.migrationGate(repo.dir, { dataDir, now: NOW, procRoot: proc, ...extra })
  const tree = () => fs.readdirSync(repo.dir, { recursive: true }).filter((e) => !e.startsWith('.git' + path.sep) && e !== '.git').sort()
  return { repo, dataDir, proc, aether, gate, tree }
}

test('a mark of this repository with a live process defers the move, and the starting session does not count itself (R19 a)', (t) => {
  const w = oldState(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.dataDir, 'other', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  assert.deepEqual(w.gate(), { move: false, reasons: ['live-session'] })
  assert.deepEqual(w.gate({ selfSession: 'other' }), { move: true, reasons: [] })
  assert.deepEqual(w.gate({ selfSession: 'cleared-new-id', selfProcess: { pid: 100, start: 555 } }), { move: true, reasons: [] }, 'a /clear: the mark of the same claude process is not another session')
  markSession(w.dataDir, 'dead', NOW, { repo: w.repo.dir, claude: { pid: 999, start: 1 } })
  markSession(w.dataDir, 'elsewhere', NOW, { repo: '/another/repo', claude: { pid: 100, start: 555 } })
  assert.deepEqual(w.gate({ selfSession: 'other' }), { move: true, reasons: [] })
})

test('a mark of the old version without a repository, younger than 12 hours, defers the move; an older one does not (R19 b, A18)', (t) => {
  const w = oldState(t)
  markSession(w.dataDir, 'old-style', NOW)
  fs.utimesSync(path.join(w.dataDir, 'sessions', 'old-style.json'), hours(1), hours(1))
  assert.deepEqual(w.gate(), { move: false, reasons: ['old-mark'] })
  fs.utimesSync(path.join(w.dataDir, 'sessions', 'old-style.json'), hours(13), hours(13))
  assert.deepEqual(w.gate(), { move: true, reasons: [] })
})

test('a write under .aether/, .aether-tmp/ or .aether-exam/ in the last 2 hours defers the move; the README does not count (R19 c)', (t) => {
  const w = oldState(t)
  for (const target of [path.join(w.aether, 'runs', 'x', 'graph.json'), path.join(w.repo.dir, '.aether-tmp', 'seats', 's1', 'new.md'), path.join(w.repo.dir, '.aether-exam', 'new.test.js')]) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'now')
    assert.deepEqual(w.gate(), { move: false, reasons: ['recent-writes'] }, target)
    for (const dir of [w.aether, path.join(w.repo.dir, '.aether-tmp'), path.join(w.repo.dir, '.aether-exam')]) quiet(dir)
  }
  fs.writeFileSync(path.join(w.aether, 'README.md'), 'map')
  assert.deepEqual(w.gate(), { move: true, reasons: [] })
})

test('while the gate says no, nothing on disk changes at all (R19)', (t) => {
  const w = oldState(t)
  markSession(w.dataDir, 'old-style', NOW)
  const before = w.tree()
  const gate = w.gate()
  assert.equal(gate.move, false)
  assert.deepEqual(migrate.migrate(w.repo.dir, { gate }), { moved: [], kept: [], deferred: ['old-mark'] })
  assert.deepEqual(w.tree(), before)
})

test('a later start, with no session active, moves the old folders, deletes nothing and keeps the copy with unsaved work registered (R19, H2 scenario 14)', (t) => {
  const w = oldState(t)
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.deepEqual(result.kept, [])
  assert.ok(result.moved.length >= 1)
  const aether = w.aether
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'seats', 'judge-1', 'wt', 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'seats', 'judge-1', 'pair.json'), 'utf8'), '{}')
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'delegates', 'd1', 'brief.md'), 'utf8'), 'brief')
  assert.equal(fs.readFileSync(path.join(aether, 'exam', 'c1.test.js'), 'utf8'), 'exam')
  assert.equal(fs.readFileSync(path.join(aether, 'tmp', 'seats', 's1', 'message.md'), 'utf8'), 'message')
  const listed = w.repo.git('worktree', 'list', '--porcelain')
  assert.ok(listed.includes(path.join(aether, 'work', 'seats', 'judge-1', 'wt')))
  assert.ok(listed.includes(path.join(aether, 'worktrees', 'lanes', '20261101-000000-abcd', 'task-1-1-supervise')))
  assert.ok(!listed.includes(path.join(aether, 'seats')))
  for (const gone of ['seats', 'lanes', 'delegates']) assert.equal(fs.existsSync(path.join(aether, gone)), false, gone)
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether-exam')), false)
  assert.equal(fs.readFileSync(path.join(aether, 'aether.db'), 'utf8'), 'old cli', 'the leftovers of the old CLI are not touched')
  assert.equal(fs.readFileSync(path.join(aether, 'autonomy', 'grants.json'), 'utf8'), '{}')
  assert.equal(w.repo.git('-C', path.join(aether, 'work', 'seats', 'judge-1', 'wt'), 'status', '--porcelain'), '?? unsaved.md')
})

test('what cannot be moved stays where it is and is reported: a locked copy and a file whose name the destination already has (R19)', (t) => {
  const w = oldState(t)
  w.repo.git('worktree', 'lock', path.join(w.aether, 'seats', 'judge-1', 'wt'))
  fs.mkdirSync(path.join(w.aether, 'work', 'delegates', 'd1'), { recursive: true })
  fs.writeFileSync(path.join(w.aether, 'work', 'delegates', 'd1', 'brief.md'), 'new place')
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.ok(result.kept.some((k) => k.from.endsWith(path.join('seats', 'judge-1', 'wt'))))
  assert.equal(fs.readFileSync(path.join(w.aether, 'seats', 'judge-1', 'wt', 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.ok(result.kept.some((k) => k.from.endsWith(path.join('delegates', 'd1', 'brief.md'))))
  assert.equal(fs.readFileSync(path.join(w.aether, 'delegates', 'd1', 'brief.md'), 'utf8'), 'brief')
  assert.equal(fs.readFileSync(path.join(w.aether, 'work', 'delegates', 'd1', 'brief.md'), 'utf8'), 'new place')
})
```

**Acceptance:**

- `node --test tests/tree-migrate.test.js` pasa y `npm test` completo pasa.
- La migración nunca borra un archivo, una copia de trabajo movida sigue registrada en git con sus cambios sin guardar, y lo que no se puede mover queda donde está y en el resultado.
- La puerta no escribe nada, y una sesión de la versión nueva con el proceso vivo, una marca vieja de menos de 12 horas y una escritura de las últimas 2 horas la defieren cada una por separado.

---

### Task 17: Ordenar el arranque: decidir, mapa, limpieza y migración

**Aether:**
- Review: xhigh — el orden de estos pasos decide si la migración mueve el estado de una sesión que sigue escribiendo
- Area: session
- Owns: `plugins/aether/lib/session-start.js`, `tests/session-start-tree.test.js`
- Depends on: Task 6 — extiende el arranque que esa tarea reordena
- Depends on: Task 14 — escribe el mapa con `ensureReadme`
- Depends on: Task 15 — corre `cleanProject`
- Depends on: Task 16 — corre la puerta y `migrate`
- Serves: R14, R17, R19

**Interfaces:**

En `plugins/aether/lib/session-start.js`, en un arranque del Lead que corre las podas (`startup`, `clear`, `compact`), el orden es este y una prueba lo fija:

1. **Antes de que esta sesión escriba nada** (ni la marca, ni el mapa, ni el sello, ni la limpieza): `gate = migrationGate(mainRoot, { dataDir, now, selfSession: input.session_id, selfProcess: claudeProcess({ procRoot, from }), procRoot })`.
2. `mark(...)` (la marca de la sesión), `passSuperdelegation`.
3. Si `gate.move`, `migrate(mainRoot, { gate })`; la nota de arranque dice `Aether moved the old state of .aether/ to its new places (<n> folders).` (y `Aether left <k> old folder(s) of .aether/ where they are: <motivos>.` si hubo `kept`). Si `!gate.move` y existe alguna carpeta vieja, `Aether left the old state of .aether/ where it is for now: <motivos>.` (las razones, separadas por comas). Sin estado viejo, ninguna nota.
4. `ensureReadme(mainRoot)`.
5. `cleanProject(cwd, { dataDir, now })`; si borró algo, `Aether cleaned <n> old item(s) of .aether/.`
6. Las podas y el barrido que ya hay (`pruneOldFiles`, `sweepNote`).
- `main` acepta `procRoot` (y lo pasa a la puerta y a la marca). Fuera de git ninguno de estos pasos corre y no hay error. Una excepción de cualquiera de ellos no detiene el arranque.

**Tests (write first):**

`tests/session-start-tree.test.js` (corre `main` en el proceso, con `stdout` capturado):

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { main } = require('../plugins/aether/lib/session-start.js')
const { markSession, readMark } = require('../plugins/aether/lib/session.js')

const NOW = Date.now()
const hours = (n) => new Date(NOW - n * 3600 * 1000)

function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}
function quiet(dir) {
  for (const entry of fs.readdirSync(dir, { recursive: true })) try { fs.utimesSync(path.join(dir, entry), hours(5), hours(5)) } catch { /* gone */ }
  fs.utimesSync(dir, hours(5), hours(5))
}
function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 1: { comm: 'init', ppid: 0, start: 1 }, 300: { comm: 'claude', ppid: 1, start: 4242 }, 301: { comm: 'node', ppid: 300, start: 4243 } })
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'CLAUDE_ENV_FILE']) delete env[key]
  fs.mkdirSync(path.join(repo.dir, '.aether', 'seats', 'judge-1'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'seats', 'judge-1', 'pair.json'), '{}')
  fs.mkdirSync(path.join(repo.dir, '.aether-tmp'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether-tmp', 'old.md'), 'x')
  quiet(path.join(repo.dir, '.aether'))
  quiet(path.join(repo.dir, '.aether-tmp'))
  const start = (session, source = 'startup', extra = {}) => {
    let out = ''
    main({ input: { hook_event_name: 'SessionStart', session_id: session, source, agent_type: 'aether:lead' }, env, cwd: repo.dir, procRoot: proc, from: 301, stdout: { write: (s) => { out += s } }, ...extra })
    return out === '' ? null : JSON.parse(out)
  }
  return { repo, data, proc, env, start }
}

test('a quiet project: the decision comes before the starting session writes anything, so the old state moves, and the README and the mark follow (R19, C6)', (t) => {
  const w = world(t)
  const out = w.start('s1')
  const aether = path.join(w.repo.dir, '.aether')
  assert.ok(out.hookSpecificOutput.additionalContext.includes('moved the old state of .aether/'))
  assert.equal(fs.existsSync(path.join(aether, 'seats')), false)
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'seats', 'judge-1', 'pair.json'), 'utf8'), '{}')
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether-tmp')), false)
  assert.ok(fs.readFileSync(path.join(aether, 'README.md'), 'utf8').includes('`work/seats/`'))
  assert.deepEqual(readMark(w.data, 's1').claude, { pid: 300, start: 4242 })
  assert.equal(readMark(w.data, 's1').repo, w.repo.dir)
})

test('the starting session does not count its own mark as a live session, and a /clear (a new session id in the same claude process) does not count the mark of the one it cleared (R19)', (t) => {
  const w = world(t)
  w.start('s1')
  fs.mkdirSync(path.join(w.repo.dir, '.aether', 'delegates', 'd9'), { recursive: true })
  fs.writeFileSync(path.join(w.repo.dir, '.aether', 'delegates', 'd9', 'brief.md'), 'b')
  quiet(path.join(w.repo.dir, '.aether'))
  const again = w.start('s2', 'clear')
  assert.ok(again.hookSpecificOutput.additionalContext.includes('moved the old state'))
  assert.equal(fs.readFileSync(path.join(w.repo.dir, '.aether', 'work', 'delegates', 'd9', 'brief.md'), 'utf8'), 'b')
  assert.deepEqual(readMark(w.data, 's1').claude, readMark(w.data, 's2').claude, 'both marks name the same claude process')
})

test('another session of the repository with a live process defers the move and says so; the README is still written (R19 a)', (t) => {
  const w = world(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.data, 'other', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  const out = w.start('s2')
  assert.ok(out.hookSpecificOutput.additionalContext.includes('left the old state of .aether/ where it is for now: live-session'))
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether', 'seats', 'judge-1', 'pair.json')), true)
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether', 'README.md')), true)
})

test('recent activity defers the move and says so; with nothing old to move there is no note (R19 c)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, '.aether', 'seats', 'judge-1', 'pair.json'), 'written just now')
  assert.ok(w.start('s3').hookSpecificOutput.additionalContext.includes('recent-writes'))
  const clean = world(t)
  fs.rmSync(path.join(clean.repo.dir, '.aether'), { recursive: true })
  fs.rmSync(path.join(clean.repo.dir, '.aether-tmp'), { recursive: true })
  const ctx = clean.start('s4').hookSpecificOutput.additionalContext
  assert.ok(!ctx.includes('old state of .aether/'))
})

test('the cleanup runs once per project and removes old temporary files after the move (R17, R18)', (t) => {
  const w = world(t)
  fs.mkdirSync(path.join(w.repo.dir, '.aether', 'tmp'), { recursive: true })
  const stale = path.join(w.repo.dir, '.aether', 'tmp', 'stale.md')
  fs.writeFileSync(stale, 'x')
  fs.utimesSync(stale, hours(48), hours(48))
  fs.utimesSync(path.join(w.repo.dir, '.aether', 'tmp'), hours(5), hours(5))
  const out = w.start('s5')
  assert.equal(fs.existsSync(stale), false)
  assert.ok(out.hookSpecificOutput.additionalContext.includes('cleaned'))
  assert.ok(fs.readdirSync(path.join(w.data, 'sweep')).length >= 1)
})

test('outside git nothing of this runs and the start does not fail', (t) => {
  const dir = tempDir(t)
  const data = tempDir(t, 'aether-data-')
  let out = ''
  main({ input: { hook_event_name: 'SessionStart', session_id: 's9', source: 'startup', agent_type: 'aether:lead' }, env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }, cwd: dir, stdout: { write: (s) => { out += s } } })
  assert.ok(JSON.parse(out).hookSpecificOutput.additionalContext.startsWith('Aether mode is active.'))
  assert.equal(fs.existsSync(path.join(dir, '.aether')), false)
})
```

**Acceptance:**

- `node --test tests/session-start-tree.test.js` pasa; también pasan las demás pruebas de `session-start*`, y `npm test` completo pasa.
- La decisión de migrar se toma antes de la primera escritura de la sesión; una prueba la rompe si alguien mueve la puerta después del mapa o de la marca.
- En una sesión que no es del Lead no corre nada de esto.

---

### Task 18: Clasificar las skills y las fuentes de instalación

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-rules.js`, `tests/skill-rules.test.js`
- Depends on: Task 17 — la historia H3 empieza cuando H2 está fusionada
- Depends on: Task 8 — usa `realResolve` de `lib/tree-paths.js`
- Serves: R22, R23, R24, R25

**Interfaces:**

En `plugins/aether/lib/skill-rules.js` (`// Family: skill.`), todo exportado:

- `ALIASES = { 'vercel-labs/vercel-skills': 'vercel-labs/agent-skills', 'coinbase/agentwallet': 'coinbase/agentic-wallet-skills' }` (los dos alias de skills.sh, con el primero en minúsculas).
- `trustedFile(dataDir)` → `<dataDir>/skills/trusted.json`. `readTrusted(dataDir)` → arreglo de autores en minúsculas de `{ "authors": [...] }`; `[]` si el archivo falta, no se lee o no tiene esa forma.
- `authorOf(source)`: el autor de una fuente de skills.sh, en minúsculas, o `null` cuando no tiene: el primer segmento de `owner/repo`, `owner/repo/ruta`, `owner/repo@skill` y `owner/repo#ref`, de `github:owner/repo` y `gitlab:owner/repo` y de una URL de `github.com` o `gitlab.com`; después de resolver `ALIASES` (el alias cambia el repositorio, el autor sigue siendo el primer segmento de lo resuelto). Una ruta local (`./x`, `../x`, `/x`, `~/x`) y una URL de otro sitio dan `null`.
- `parseInstall(command)` devuelve `null` cuando el comando no instala, y si instala `{ launcher, sources, authors, global }`: busca, en cada segmento del comando (separado por `&&`, `||`, `;`, `|` y saltos de línea, sin leer dentro de comillas), una instalación `npx [-y|--yes] skills[@versión] add …`, `bunx skills add …`, `pnpm dlx skills add …` o `skills add …` (el comando `skills` solo), y toma como `sources` las palabras que siguen a `add` y no son una opción; `-g` y `--global` ponen `global: true`; `-s`, `--skill`, `-a`, `--agent` y `--ref` toman el valor siguiente y no son una fuente. `authors` es `sources.map(authorOf)`. `find`, `list`, `update`, `remove` y un `add` dentro de otro comando (`echo "npx skills add a/b"`) no son una instalación.
- `installClass(command, { dataDir })` devuelve `'skill-install'` cuando `parseInstall` encuentra una instalación y no se cumple que todos los autores sean de confianza (`readTrusted(dataDir)`) y que no sea global; si no, `null`. Una fuente sin autor, `-g` y una lista vacía dan siempre `'skill-install'`. Sin fuentes (`npx skills add` solo) da `'skill-install'`.
- `classifySkillPath(file, { cwd, home = os.homedir(), pluginRoots = [defaultPluginRoot], dataDir })` devuelve `null` si la ruta no está en una carpeta de skills, y si lo está `{ type, name, dir, real, editable, grant }`: `dir` es la carpeta de la skill (la que sigue a la carpeta de skills), `real` la ruta real de `file` (con `realResolve`), y se clasifica **por la ruta real**:
  - `aether`: dentro de `<raíz de plugin>/skills/` de `pluginRoots` (por defecto la carpeta del plugin de este código y `CLAUDE_PLUGIN_ROOT` si está) o dentro de `<home>/.claude/plugins/cache/`. `editable: false`, salvo cuando la ruta real queda dentro del repositorio de la sesión (`git rev-parse --show-toplevel` desde `cwd`): entonces `editable: true` (se está desarrollando Aether; D11).
  - `downloaded`: dentro de `.agents/skills/` del proyecto (o de su raíz principal) y listada en el `skills-lock.json` de esa raíz, o dentro de `<home>/.agents/skills/` y listada en `<home>/.agents/.skill-lock.json` (en los dos, bajo la clave `skills`). `editable: false`.
  - `project`: dentro de `.agents/skills/` o de `.claude/skills/` (carpeta real, no enlace) del proyecto y no listada en un lock. `editable: true`.
  - `owner`: dentro de `<home>/.agents/skills/` o `<home>/.claude/skills/` y no listada. `editable: true` y `grant: 'skill-install'` (la guarda pide el permiso); en los demás, `grant: null`.
- `copyAdvice(info)` devuelve el mensaje de la guarda para `aether` y `downloaded`. Para `aether`: `This is a skill of Aether, and Aether's skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r <dir> .agents/skills/<name>-mine).` Para `downloaded`: `This skill was downloaded from the internet, and downloaded skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r <dir> .agents/skills/<name>-mine).` con `<dir>` y `<name>` los de `info`.

**Tests (write first):**

`tests/skill-rules.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const rules = require('../plugins/aether/lib/skill-rules.js')

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

test('authorOf takes the first segment in lowercase, resolves the two aliases and gives null without an author (R25, C9)', () => {
  const cases = {
    'anthropics/skills@pdf': 'anthropics',
    'Anthropics/Skills': 'anthropics',
    'vercel-labs/agent-skills/skills/web': 'vercel-labs',
    'owner/repo#v2': 'owner',
    'github:owner/repo': 'owner',
    'gitlab:Group/repo': 'group',
    'https://github.com/owner/repo': 'owner',
    'https://gitlab.com/group/repo.git': 'group',
    'vercel-labs/vercel-skills': 'vercel-labs',
    'coinbase/agentWallet': 'coinbase',
    './local/skills': null,
    '../up/skills': null,
    '/abs/skills': null,
    '~/skills': null,
    'https://example.com/skills.git': null,
    'git@example.com:me/skills.git': null,
  }
  for (const [source, author] of Object.entries(cases)) assert.equal(rules.authorOf(source), author, source)
})

test('parseInstall reads each launcher, the sources, the author and -g, and ignores what does not install (R25)', () => {
  const same = { sources: ['anthropics/skills@pdf'], authors: ['anthropics'], global: false }
  for (const [command, launcher] of [
    ['npx skills add anthropics/skills@pdf', 'npx'],
    ['npx -y skills add anthropics/skills@pdf', 'npx'],
    ['npx skills@latest add anthropics/skills@pdf', 'npx'],
    ['bunx skills add anthropics/skills@pdf', 'bunx'],
    ['pnpm dlx skills add anthropics/skills@pdf', 'pnpm dlx'],
    ['skills add anthropics/skills@pdf', 'skills'],
    ['cd app && npx skills add anthropics/skills@pdf --skill pdf', 'npx'],
  ]) assert.deepEqual(rules.parseInstall(command), { launcher, ...same }, command)
  assert.equal(rules.parseInstall('npx skills add -g anthropics/skills@pdf').global, true)
  assert.equal(rules.parseInstall('npx skills add anthropics/skills --global').global, true)
  assert.deepEqual(rules.parseInstall('npx skills add a/b c/d').authors, ['a', 'c'])
  assert.deepEqual(rules.parseInstall('npx skills add ./local').authors, [null])
  assert.deepEqual(rules.parseInstall('npx skills add anthropics/skills -s pdf -a claude-code').sources, ['anthropics/skills'])
  for (const command of ['npx skills find react', 'npx skills list', 'npx skills update', 'npx skills remove pdf', 'echo "npx skills add a/b"', 'ls', 'npx other add a/b', '']) assert.equal(rules.parseInstall(command), null, command)
})

test('installClass lets a trusted author through for the project and holds everything else; an empty list holds all (R25, R47, H3 scenarios 19 to 21)', (t) => {
  const data = tempDir(t, 'aether-data-')
  const hold = (command) => rules.installClass(command, { dataDir: data })
  assert.equal(rules.readTrusted(data).length, 0)
  assert.equal(hold('npx skills add anthropics/skills@pdf'), 'skill-install', 'the list starts empty')
  put(rules.trustedFile(data), JSON.stringify({ authors: ['Anthropics', 'vercel-labs'], log: [] }))
  assert.deepEqual(rules.readTrusted(data), ['anthropics', 'vercel-labs'])
  assert.equal(hold('npx skills add anthropics/skills@pdf'), null)
  assert.equal(hold('bunx skills add vercel-labs/agent-skills'), null)
  assert.equal(hold('npx skills add someone/skills'), 'skill-install')
  assert.equal(hold('npx skills add -g anthropics/skills@pdf'), 'skill-install')
  assert.equal(hold('npx skills add anthropics/skills someone/skills'), 'skill-install')
  assert.equal(hold('npx skills add ./local'), 'skill-install')
  assert.equal(hold('npx skills add https://example.com/x.git'), 'skill-install')
  assert.equal(hold('npx skills add'), 'skill-install')
  assert.equal(hold('npx skills find pdf'), null)
  fs.writeFileSync(rules.trustedFile(data), '{ not json')
  assert.deepEqual(rules.readTrusted(data), [])
  assert.deepEqual(rules.readTrusted(path.join(data, 'missing')), [])
})

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const plugin = path.join(tempDir(t, 'aether-plugin-'), 'plugin')
  put(path.join(plugin, 'skills', 'tidy', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'mine', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills', computedHash: 'x' } } }))
  fs.mkdirSync(path.join(repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'mine'), path.join(repo.dir, '.claude', 'skills', 'mine'))
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'pdf'), path.join(repo.dir, '.claude', 'skills', 'pdf'))
  put(path.join(repo.dir, '.claude', 'skills', 'local-only', 'SKILL.md'))
  put(path.join(home, '.agents', 'skills', 'mine-global', 'SKILL.md'))
  put(path.join(home, '.agents', 'skills', 'globalpdf', 'SKILL.md'))
  put(path.join(home, '.agents', '.skill-lock.json'), JSON.stringify({ version: 3, skills: { globalpdf: { source: 'anthropics/skills' } } }))
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(home, '.agents', 'skills', 'mine-global'), path.join(home, '.claude', 'skills', 'mine-global'))
  put(path.join(home, '.claude', 'skills', 'real-dir', 'SKILL.md'))
  put(path.join(home, '.claude', 'plugins', 'cache', 'mk', 'aether', '0.35.0', 'skills', 'plan', 'SKILL.md'))
  return { repo, home, plugin, opts: { cwd: repo.dir, home, pluginRoots: [plugin] } }
}
const typeOf = (w, ...parts) => {
  const info = rules.classifySkillPath(path.join(...parts), w.opts)
  return info && [info.type, info.name, info.editable, info.grant]
}

test('the four types are told by the real path, also when the path goes through the link of .claude/skills/ (C8, R22, R23)', (t) => {
  const w = world(t)
  const r = w.repo.dir
  assert.deepEqual(typeOf(w, r, '.agents', 'skills', 'mine', 'SKILL.md'), ['project', 'mine', true, null])
  assert.deepEqual(typeOf(w, r, '.claude', 'skills', 'mine', 'SKILL.md'), ['project', 'mine', true, null])
  assert.deepEqual(typeOf(w, r, '.claude', 'skills', 'local-only', 'SKILL.md'), ['project', 'local-only', true, null])
  assert.deepEqual(typeOf(w, r, '.agents', 'skills', 'pdf', 'SKILL.md'), ['downloaded', 'pdf', false, null])
  assert.deepEqual(typeOf(w, r, '.claude', 'skills', 'pdf', 'SKILL.md'), ['downloaded', 'pdf', false, null])
  assert.deepEqual(typeOf(w, w.home, '.agents', 'skills', 'mine-global', 'SKILL.md'), ['owner', 'mine-global', true, 'skill-install'])
  assert.deepEqual(typeOf(w, w.home, '.claude', 'skills', 'mine-global', 'SKILL.md'), ['owner', 'mine-global', true, 'skill-install'])
  assert.deepEqual(typeOf(w, w.home, '.claude', 'skills', 'real-dir', 'SKILL.md'), ['owner', 'real-dir', true, 'skill-install'])
  assert.deepEqual(typeOf(w, w.home, '.agents', 'skills', 'globalpdf', 'SKILL.md'), ['downloaded', 'globalpdf', false, null])
  assert.deepEqual(typeOf(w, w.plugin, 'skills', 'tidy', 'SKILL.md'), ['aether', 'tidy', false, null])
  assert.deepEqual(typeOf(w, w.home, '.claude', 'plugins', 'cache', 'mk', 'aether', '0.35.0', 'skills', 'plan', 'SKILL.md'), ['aether', 'plan', false, null])
  assert.deepEqual(typeOf(w, r, '.agents', 'skills', 'new-skill', 'SKILL.md'), ['project', 'new-skill', true, null], 'a skill that does not exist yet')
  assert.equal(typeOf(w, r, 'src', 'a.js'), null)
  assert.equal(typeOf(w, r, 'README.md'), null)
})

test('a skill of Aether inside the repository of the session is editable, so that Aether can be developed (D11, P7)', (t) => {
  const w = world(t)
  const inside = path.join(w.repo.dir, 'plugins', 'aether')
  put(path.join(inside, 'skills', 'plan', 'SKILL.md'))
  const info = rules.classifySkillPath(path.join(inside, 'skills', 'plan', 'SKILL.md'), { ...w.opts, pluginRoots: [inside] })
  assert.deepEqual([info.type, info.editable], ['aether', true])
  const outside = rules.classifySkillPath(path.join(w.plugin, 'skills', 'tidy', 'SKILL.md'), w.opts)
  assert.deepEqual([outside.type, outside.editable], ['aether', false])
})

test('copyAdvice tells how to copy an Aether skill and a downloaded one, with another name into .agents/skills/ (C8, H3 scenario 18)', () => {
  const dir = '/x/skills/pdf'
  assert.equal(rules.copyAdvice({ type: 'aether', name: 'tidy', dir: '/p/skills/tidy' }), "This is a skill of Aether, and Aether's skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r /p/skills/tidy .agents/skills/tidy-mine).")
  assert.equal(rules.copyAdvice({ type: 'downloaded', name: 'pdf', dir }), 'This skill was downloaded from the internet, and downloaded skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r /x/skills/pdf .agents/skills/pdf-mine).')
})
```

**Acceptance:**

- `node --test tests/skill-rules.test.js` pasa y `npm test` completo pasa.
- Ninguna función escribe nada ni toca la red, y ninguna prueba lee las carpetas personales reales (`home` y `pluginRoots` se dan por parámetro).
- `realResolve` no se define otra vez: se importa de `lib/tree-paths.js`.

---

### Task 19: Agregar la clase `skill-install` y el verbo `trust`

**Aether:**
- Review: xhigh — la lista de autores de confianza decide qué skills de internet se instalan sin preguntar, y solo las palabras verificadas del dueño pueden escribirla
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/autonomy-command.js`, `plugins/aether/bin/aether-autonomy`, `tests/autonomy.test.js`, `tests/autonomy-trust.test.js`, `tests/copies-classes.test.js`, `CLAUDE.md`, `plugins/aether/skills/using-aether/SKILL.md`
- Depends on: Task 17 — la historia H3 empieza cuando H2 está fusionada
- Serves: R25, R47

**Interfaces:**

- `CLASSES` de `lib/autonomy.js` pasa a `['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call', 'skill-install']`. `grant`, `revoke`, `check` y `list` la aceptan como a las demás.
- `trustAuthor(dataDir, { author, quote, session, remove = false }, { configDir, now = Date.now() } = {})` en `lib/autonomy.js`: verifica `quote` con `verifyQuote(session, quote, { configDir, allowNegation: remove })` (quitar a un autor admite una frase negada: «ya no confío en …»; agregar no), valida el autor (`/^[A-Za-z0-9][A-Za-z0-9-]*$/`, de a lo más 39 caracteres; se guarda en minúsculas), y escribe de forma atómica `<dataDir>/skills/trusted.json` con la forma `{ "authors": [..sin repetir, en orden de alta..], "log": [{ "action": "add"|"remove", "author", "quote", "session", "time", "added" }] }`. Devuelve `{ ok: true, authors }` o `{ ok: false, reason }` (el motivo de la verificación, o `invalid author: <texto>`). Quitar a quien no está es un éxito sin cambios.
- `aether-autonomy trust --author <autor> --quote <texto> [--session <id>] [--remove]`: imprime `{ "trusted": { "authors": [...] } }` y sale con 0; una verificación que falla imprime `{ "verified": false, "reason": … }` y sale con 2; un autor inválido o un uso incorrecto imprime `{ "error": … }` y sale con 1. Funciona fuera de un repositorio git (no lee ni escribe `.aether/`). El texto de uso (`USAGE`) y la cabecera de `bin/aether-autonomy` y de `lib/autonomy-command.js` lo listan (`// aether-autonomy trust …`).
- `CLAUDE.md`: la línea que lista las clases irreversibles de `aether-guard` incluye `` `skill-install` ``. En `skills/using-aether/SKILL.md` la tabla de clases gana la fila `| `skill-install` | installing a skill from the internet from an author that is not trusted, or for all projects, and writing a permanent skill in `~/.agents/skills/` or `~/.claude/skills/` |` al final, y el texto de esa sección que cuenta las clases dice ocho; no se cambia nada más de esa skill en esta tarea (la tarea 30 escribe las reglas).
- `tests/copies-classes.test.js`: `GRANT_ONLY` gana `'skill-install': 'the guard detects it from the install command in task 26; until then it is only granted and checked with aether-autonomy check'` (la tarea 26 lo mueve a `SAMPLE`).

**Tests (write first):**

En `tests/autonomy.test.js`, la prueba de la línea 51 pasa a:

```js
assert.deepEqual(autonomy.CLASSES, ['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call', 'skill-install'])
```

y se agrega:

```js
test('skill-install is granted and checked like the other classes (R25)', (t) => {
  const quote = 'apruebo instalar skills en esta ocasion y en todas las futuras ocasiones'
  const { configDir, mainRoot } = setup(t, { [SESSION]: [human(quote, '2026-10-09T19:32:31.611Z')] })
  assert.equal(autonomy.grant(mainRoot, { class: 'skill-install', quote, session: SESSION }, { configDir }).ok, true)
  assert.equal(autonomy.check(mainRoot, 'skill-install', { configDir }).status, 'verified')
  assert.equal(autonomy.check(mainRoot, 'push', { configDir }), null)
})
```

`tests/autonomy-trust.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-trust-1'
const human = (text, time) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })
const TRUST = 'confio en anthropics y en vercel-labs como autores de skills'
const NEGATED = 'no confio en anthropics todavia'

function world(t, lines = [human(TRUST, '2026-11-07T10:00:00.000Z'), human(NEGATED, '2026-11-07T11:00:00.000Z')]) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), lines.join('\n') + '\n')
  const data = tempDir(t, 'aether-data-')
  const file = path.join(data, 'skills', 'trusted.json')
  const run = (args) => {
    const r = spawnSync(process.execPath, [BIN, 'trust', ...args], { cwd: tempDir(t), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_SESSION_ID: '' } })
    return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) }
  }
  return { configDir, data, file, run }
}

test('trust writes an author after verifying the owner words, in lowercase and without repeats, outside any repository (R47)', (t) => {
  const w = world(t)
  const first = w.run(['--author', 'Anthropics', '--quote', 'confio en anthropics', '--session', SESSION])
  assert.deepEqual([first.status, first.json], [0, { trusted: { authors: ['anthropics'] } }])
  const second = w.run(['--author', 'vercel-labs', '--quote', 'vercel-labs como autores de skills', '--session', SESSION])
  assert.deepEqual(second.json.trusted.authors, ['anthropics', 'vercel-labs'])
  assert.deepEqual(w.run(['--author', 'anthropics', '--quote', 'confio en anthropics', '--session', SESSION]).json.trusted.authors, ['anthropics', 'vercel-labs'])
  const saved = JSON.parse(fs.readFileSync(w.file, 'utf8'))
  assert.deepEqual(saved.authors, ['anthropics', 'vercel-labs'])
  assert.equal(saved.log[0].action, 'add')
  assert.equal(saved.log[0].session, SESSION)
  assert.equal(saved.log[0].quote, 'confio en anthropics')
})

test('words that are not the owner, too short, or in a negated clause are refused and nothing is written (R47)', (t) => {
  const w = world(t)
  for (const quote of ['esto nunca lo dijo el dueño', 'corto', 'confio en anthropics y en nadie mas que el dueño no dijo']) {
    const r = w.run(['--author', 'anthropics', '--quote', quote, '--session', SESSION])
    assert.equal(r.status, 2, quote)
    assert.equal(r.json.verified, false)
  }
  const negated = w.run(['--author', 'anthropics', '--quote', 'confio en anthropics todavia', '--session', SESSION])
  assert.equal(negated.status, 2)
  assert.equal(fs.existsSync(w.file), false)
})

test('an invalid author or a wrong use is an error and writes nothing; --remove takes a name out and accepts a negated quote (R47)', (t) => {
  const w = world(t)
  for (const author of ['../x', 'a b', '', '-bad', 'x'.repeat(40)]) {
    const r = w.run(['--author', author, '--quote', 'confio en anthropics', '--session', SESSION])
    assert.equal(r.status, 1, author)
    assert.ok(r.json.error)
  }
  assert.equal(w.run(['--quote', 'confio en anthropics', '--session', SESSION]).status, 1)
  assert.equal(fs.existsSync(w.file), false)
  w.run(['--author', 'anthropics', '--quote', 'confio en anthropics', '--session', SESSION])
  const removed = w.run(['--author', 'anthropics', '--quote', 'no confio en anthropics todavia', '--session', SESSION, '--remove'])
  assert.deepEqual([removed.status, removed.json], [0, { trusted: { authors: [] } }])
  assert.equal(JSON.parse(fs.readFileSync(w.file, 'utf8')).log.at(-1).action, 'remove')
  assert.equal(w.run(['--author', 'ghost', '--quote', 'no confio en anthropics todavia', '--session', SESSION, '--remove']).status, 0)
})

test('trustAuthor is the function behind the verb and returns the reason when it refuses (R47)', (t) => {
  const w = world(t)
  const refused = autonomy.trustAuthor(w.data, { author: 'anthropics', quote: 'nadie dijo esto jamas', session: SESSION }, { configDir: w.configDir })
  assert.equal(refused.ok, false)
  assert.ok(refused.reason.length > 0)
  const bad = autonomy.trustAuthor(w.data, { author: 'a b', quote: 'confio en anthropics', session: SESSION }, { configDir: w.configDir })
  assert.deepEqual(bad, { ok: false, reason: 'invalid author: a b' })
})
```

Más: `tests/autonomy.test.js` y `tests/docs-claims.test.js` (la línea de `CLAUDE.md` con `` `skill-install` ``) pasan; `tests/copies-classes.test.js` pasa con la fila de la tabla de la skill.

**Acceptance:**

- `node --test tests/autonomy.test.js tests/autonomy-trust.test.js tests/copies-classes.test.js tests/docs-claims.test.js tests/commands.test.js` pasa y `npm test` completo pasa (el verbo `trust` tiene un llamador en `lib/autonomy-command.js` y en el uso del bin; si `tests/commands.test.js` pide un llamador concreto de una skill, la tarea 29 lo da y esta tarea lo deja anotado en su informe).
- Solo `aether-autonomy trust` escribe `trusted.json`; la lista empieza vacía.

---

### Task 20: Llevar el registro de instalaciones y la comprobación del lock

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-registry.js`, `tests/skill-registry.test.js`
- Depends on: Task 17 — la historia H3 empieza cuando H2 está fusionada
- Serves: R26

**Interfaces:**

En `plugins/aether/lib/skill-registry.js` (`// Family: skill.`):

- `computedHash(dir)`: SHA-256 en hexadecimal del algoritmo `computedHash` de skills.sh: los archivos de la skill ordenados por ruta relativa (con `/`), y para cada uno `hash.update(rutaRelativa)` y luego `hash.update(bytes)`; sin `.git`, sin `node_modules`, sin enlaces simbólicos.
- `installsFile(dataDir)` → `<dataDir>/skills/installs.jsonl`. `recordInstall(dataDir, entry)` agrega una línea JSON (solo se agrega, una escritura por línea con `fs.appendFileSync`) con `{ time, session, source, scope: 'project'|'global', repo, name, path, hash }` (`repo` es la raíz principal para `project` y `null` para `global`); devuelve `true` y nunca lanza. `readInstalls(dataDir)` devuelve las entradas legibles.
- `posttool(input, ctx)` es el manejador de PostToolUse (`ctx = { env, home, now, dataDir }`): solo actúa cuando `input.tool_name` es `Bash` y `parseInstall(input.tool_input.command)` (de `lib/skill-rules.js`) es una instalación. Para una de proyecto mira `<raíz principal>/skills-lock.json` (clave `skills`) y registra cada skill de esa lista que existe en `<raíz>/.agents/skills/<nombre>/` y aún no está en `installs.jsonl` para ese `path`, con `source` del lock (o la fuente del comando) y `hash: computedHash(carpeta)`; para una global (`-g`) lo mismo con `<home>/.agents/.skill-lock.json` y `<home>/.agents/skills/`, con `scope: 'global'`. Devuelve un texto cuando algo falla (una línea por problema) y `null` cuando todo coincide: `The skill "<nombre>" is not in skills-lock.json after the install.` (cuando el comando nombra `@<nombre>` y el lock no lo trae), `The fingerprint of the skill "<nombre>" differs from skills-lock.json (<huella del lock> in the lock, <la nuestra> on disk): read it again before using it.` (cuando el lock trae `computedHash` y no es igual al calculado). La huella global no se compara con la del registro global de skills.sh (es otra clase de huella).

**Tests (write first):**

`tests/skill-registry.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const bash = (repo, command, session = 's1') => ({ session_id: session, cwd: repo.dir, tool_name: 'Bash', tool_input: { command } })

test('computedHash is SHA-256 over the files sorted by relative path, the path and then the bytes, without .git, node_modules or links (R26)', (t) => {
  const dir = tempDir(t)
  put(path.join(dir, 'b.md'), 'bee')
  put(path.join(dir, 'a', 'x.txt'), 'ex')
  put(path.join(dir, '.git', 'config'), 'ignored')
  put(path.join(dir, 'node_modules', 'm', 'i.js'), 'ignored')
  fs.symlinkSync(path.join(dir, 'b.md'), path.join(dir, 'link.md'))
  const expected = crypto.createHash('sha256')
  expected.update('a/x.txt')
  expected.update(Buffer.from('ex'))
  expected.update('b.md')
  expected.update(Buffer.from('bee'))
  assert.equal(reg.computedHash(dir), expected.digest('hex'))
  put(path.join(dir, 'b.md'), 'changed')
  assert.notEqual(reg.computedHash(dir), expected.digest('hex'))
})

test('recordInstall only appends, one line per installation, with the fields of R26', (t) => {
  const data = tempDir(t, 'aether-data-')
  assert.equal(reg.recordInstall(data, { time: 1, session: 's1', source: 'a/b', scope: 'project', repo: '/r', name: 'pdf', path: '/r/.agents/skills/pdf', hash: 'h1' }), true)
  assert.equal(reg.recordInstall(data, { time: 2, session: 's1', source: 'a/c', scope: 'global', repo: null, name: 'x', path: '/h/.agents/skills/x', hash: 'h2' }), true)
  assert.deepEqual(reg.readInstalls(data).map((e) => [e.time, e.scope, e.name, e.hash]), [[1, 'project', 'pdf', 'h1'], [2, 'global', 'x', 'h2']])
  assert.equal(fs.readFileSync(reg.installsFile(data), 'utf8').split('\n').filter(Boolean).length, 2)
})

function project(t, { lockHash = 'same', lockName = 'pdf' } = {}) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: Use for pdf.\n---\nBody\n')
  const hash = reg.computedHash(path.join(repo.dir, '.agents', 'skills', 'pdf'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { [lockName]: { source: 'anthropics/skills', sourceType: 'github', computedHash: lockHash === 'same' ? hash : lockHash } } }))
  return { repo, home, data, hash, ctx: { env: {}, home, now: 5000, dataDir: data } }
}

test('after a project install the skill is recorded once with its source and its fingerprint, and a matching lock says nothing (C9, H3 scenario 19)', (t) => {
  const w = project(t)
  assert.equal(reg.posttool(bash(w.repo, 'npx skills add anthropics/skills@pdf'), w.ctx), null)
  const [entry, ...rest] = reg.readInstalls(w.data)
  assert.deepEqual(rest, [])
  assert.deepEqual([entry.session, entry.source, entry.scope, entry.repo, entry.name, entry.path, entry.hash], ['s1', 'anthropics/skills', 'project', w.repo.dir, 'pdf', path.join(w.repo.dir, '.agents', 'skills', 'pdf'), w.hash])
  assert.equal(entry.time, 5000)
  assert.equal(reg.posttool(bash(w.repo, 'npx skills add anthropics/skills@pdf'), w.ctx), null)
  assert.equal(reg.readInstalls(w.data).length, 1, 'the same skill is not recorded twice')
})

test('a lock entry that is missing or has another fingerprint is reported (R26)', (t) => {
  const different = project(t, { lockHash: 'f'.repeat(64) })
  const message = reg.posttool(bash(different.repo, 'npx skills add anthropics/skills@pdf'), different.ctx)
  assert.ok(message.includes('The fingerprint of the skill "pdf" differs from skills-lock.json'), message)
  const missing = project(t, { lockName: 'other' })
  fs.rmSync(path.join(missing.repo.dir, '.agents', 'skills', 'pdf'), { recursive: true })
  const text = reg.posttool(bash(missing.repo, 'npx skills add anthropics/skills@pdf'), missing.ctx)
  assert.ok(text.includes('The skill "pdf" is not in skills-lock.json after the install.'), text)
})

test('a global install is recorded from the owner lock file, with our own fingerprint and no comparison (R26)', (t) => {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  put(path.join(home, '.agents', 'skills', 'globalpdf', 'SKILL.md'), '---\nname: globalpdf\ndescription: d\n---\n')
  put(path.join(home, '.agents', '.skill-lock.json'), JSON.stringify({ version: 3, skills: { globalpdf: { source: 'anthropics/skills', skillFolderHash: 'tree-sha' } } }))
  assert.equal(reg.posttool(bash(repo, 'npx skills add -g anthropics/skills@globalpdf'), { env: {}, home, now: 9, dataDir: data }), null)
  const [entry] = reg.readInstalls(data)
  assert.deepEqual([entry.scope, entry.repo, entry.name, entry.hash], ['global', null, 'globalpdf', reg.computedHash(path.join(home, '.agents', 'skills', 'globalpdf'))])
})

test('other commands, other tools and a failed lookup record nothing and never throw', (t) => {
  const w = project(t)
  for (const input of [bash(w.repo, 'npx skills find pdf'), bash(w.repo, 'ls'), { ...bash(w.repo, 'npx skills add a/b'), tool_name: 'Write' }, null, {}]) assert.equal(reg.posttool(input, w.ctx), null)
  assert.deepEqual(reg.readInstalls(w.data), [])
  assert.deepEqual(reg.readInstalls(path.join(w.data, 'missing')), [])
})
```

**Acceptance:**

- `node --test tests/skill-registry.test.js` pasa y `npm test` completo pasa.
- `installs.jsonl` solo se agrega y la prueba no toca la red.

---

### Task 21: Leer, comprobar y pegar las skills de un encargo

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-brief.js`, `tests/skill-brief.test.js`
- Depends on: Task 17 — la historia H3 empieza cuando H2 está fusionada
- Serves: R27, R29, R45

**Interfaces:**

En `plugins/aether/lib/skill-brief.js` (`// Family: skill.`), todo exportado:

- `MAX_SKILLS = 3`, `MAX_SKILL_LINES = 500`, `MAX_TOTAL_LINES = 1500`, `MAX_NAME = 64`, `MAX_DESCRIPTION = 1024` (A7).
- `parseSkillNames(text)` devuelve los nombres de un valor como `erebus-ui, patron-api` o `erebus-ui patron-api` (separados por comas o espacios), sin repetir, en orden; acepta que el texto empiece por `AETHER-SKILLS:` o `Skills:` (se quita). `''` da `[]`.
- `resolveSkill(name, { cwd, home = os.homedir(), pluginRoot = <plugins/aether> })` devuelve `{ name, file, dir }` o `null`. Busca, en este orden, `<raíz del proyecto>/.agents/skills/<n>/SKILL.md`, `<raíz>/.claude/skills/<n>/SKILL.md`, `<home>/.agents/skills/<n>/SKILL.md`, `<home>/.claude/skills/<n>/SKILL.md` y `<pluginRoot>/skills/<n>/SKILL.md`; el nombre puede venir como `aether:<n>` (solo en la carpeta del plugin). La raíz del proyecto es `git rev-parse --show-toplevel` desde `cwd` (y, si no está ahí, la raíz principal), o `cwd` fuera de git. Un nombre con `/`, `\`, `..` o vacío da `null`.
- `checkSkillFile(dir)` devuelve la lista de problemas de `<dir>/SKILL.md` (`[]` si no hay): `SKILL.md has <n> lines (at most 500)`, `the name "<nombre>" is not lowercase letters, digits and dashes of at most 64 characters` (el nombre del front matter debe cumplir `^[a-z0-9]+(-[a-z0-9]+)*$`), `the name "<nombre>" is not the name of its folder "<carpeta>"`, `no description` y `the description has <n> characters (at most 1024)`. Los renglones son los del archivo entero.
- `loadSkills(names, options)` devuelve `{ ok: true, skills: [{ name, file, text, lines }] }` o `{ ok: false, error }`, con el primer error: `too many skills: <n> (at most 3)`, `skill "<n>" does not exist`, `skill "<n>" is invalid: <problema>` y `the skills total <n> lines (at most 1500)` (el total cuenta los renglones del texto que `skillsSection` pega, con sus encabezados). Nunca recorta un contenido.
- `skillsSection(skills)` devuelve `## Skills for this task\n\n` y, por cada skill, `### <nombre>\n\n<texto sin espacios finales>\n\n`; `''` sin skills.
- `usesFile(dataDir)` → `<dataDir>/skills/uses.jsonl`. `recordUse(dataDir, { session, kind, run = null, task, skills, time = Date.now() })` agrega una línea `{ time, session, kind, run, task, skills }` (`kind` es `run` o `delegate`); devuelve `true`, nunca lanza.

**Tests (write first):**

`tests/skill-brief.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const sb = require('../plugins/aether/lib/skill-brief.js')

function skill(root, name, { body = 5, description = 'Use for the work.', frontName = name, where = '.agents/skills' } = {}) {
  const dir = path.join(root, where, name)
  fs.mkdirSync(dir, { recursive: true })
  const front = ['---', `name: ${frontName}`, ...(description === null ? [] : [`description: ${description}`]), '---']
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [...front, ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
  return dir
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const plugin = tempDir(t, 'aether-plugin-')
  return { repo, home, plugin, opts: { cwd: repo.dir, home, pluginRoot: plugin } }
}

test('parseSkillNames reads commas or spaces, drops repeats and the label (R27)', () => {
  assert.deepEqual(sb.parseSkillNames('AETHER-SKILLS: erebus-ui, patron-api'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames('Skills: erebus-ui patron-api erebus-ui'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames('erebus-ui,patron-api'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames(''), [])
  assert.deepEqual(sb.parseSkillNames('AETHER-SKILLS:'), [])
})

test('resolveSkill looks in the project, then the personal folders, then Aether, and refuses a name that leaves the folder (R27)', (t) => {
  const w = world(t)
  skill(w.repo.dir, 'both', { body: 1 })
  skill(w.repo.dir, 'both', { body: 2, where: '.claude/skills' })
  skill(w.home, 'both', { body: 3 })
  skill(w.home, 'personal', { where: '.claude/skills' })
  skill(w.plugin, 'tidy', { where: 'skills' })
  assert.equal(sb.resolveSkill('both', w.opts).dir, path.join(w.repo.dir, '.agents', 'skills', 'both'))
  assert.equal(sb.resolveSkill('personal', w.opts).dir, path.join(w.home, '.claude', 'skills', 'personal'))
  assert.equal(sb.resolveSkill('aether:tidy', w.opts).dir, path.join(w.plugin, 'skills', 'tidy'))
  assert.equal(sb.resolveSkill('tidy', w.opts).dir, path.join(w.plugin, 'skills', 'tidy'))
  for (const bad of ['nope', '../x', 'a/b', '', '..']) assert.equal(sb.resolveSkill(bad, w.opts), null, bad)
})

test('loadSkills gives the content of 0, 1 and 3 skills, and says the problem of 4, of one that does not exist and of one that is too big (C10, H3 scenario 23)', (t) => {
  const w = world(t)
  for (const name of ['one', 'two', 'three', 'four']) skill(w.repo.dir, name)
  skill(w.repo.dir, 'big', { body: 600 })
  assert.deepEqual(sb.loadSkills([], w.opts), { ok: true, skills: [] })
  const one = sb.loadSkills(['one'], w.opts)
  assert.equal(one.ok, true)
  assert.ok(one.skills[0].text.includes('rule 1 of one') && one.skills[0].lines >= 6)
  assert.equal(sb.loadSkills(['one', 'two', 'three'], w.opts).skills.length, 3)
  assert.deepEqual(sb.loadSkills(['one', 'two', 'three', 'four'], w.opts), { ok: false, error: 'too many skills: 4 (at most 3)' })
  assert.deepEqual(sb.loadSkills(['one', 'ghost'], w.opts), { ok: false, error: 'skill "ghost" does not exist' })
  const big = sb.loadSkills(['big'], w.opts)
  assert.equal(big.ok, false)
  assert.match(big.error, /^skill "big" is invalid: SKILL\.md has 60\d lines \(at most 500\)$/)
})

test('three skills of 500 lines are over the total that is pasted, and an invalid name or description is refused, never cut (A7, C10)', (t) => {
  const w = world(t)
  for (const name of ['a1', 'a2', 'a3']) skill(w.repo.dir, name, { body: 496 })
  const over = sb.loadSkills(['a1', 'a2', 'a3'], w.opts)
  assert.equal(over.ok, false)
  assert.match(over.error, /^the skills total \d+ lines \(at most 1500\)$/)
  for (const name of ['b1', 'b2', 'b3']) skill(w.repo.dir, name, { body: 480 })
  assert.equal(sb.loadSkills(['b1', 'b2', 'b3'], w.opts).ok, true)
  skill(w.repo.dir, 'Bad_Name', { frontName: 'Bad_Name' })
  assert.match(sb.loadSkills(['Bad_Name'], w.opts).error, /is invalid: the name "Bad_Name" is not lowercase letters, digits and dashes of at most 64 characters/)
  skill(w.repo.dir, 'wrong', { frontName: 'other-name' })
  assert.match(sb.loadSkills(['wrong'], w.opts).error, /is invalid: the name "other-name" is not the name of its folder "wrong"/)
  skill(w.repo.dir, 'nodesc', { description: null })
  assert.match(sb.loadSkills(['nodesc'], w.opts).error, /is invalid: no description/)
  skill(w.repo.dir, 'longdesc', { description: 'd'.repeat(1025) })
  assert.match(sb.loadSkills(['longdesc'], w.opts).error, /is invalid: the description has 1025 characters \(at most 1024\)/)
})

test('checkSkillFile lists every problem of a skill, and nothing for a good one (R32)', (t) => {
  const w = world(t)
  assert.deepEqual(sb.checkSkillFile(skill(w.repo.dir, 'good')), [])
  const bad = sb.checkSkillFile(skill(w.repo.dir, 'bad', { body: 600, description: null, frontName: 'Other' }))
  assert.equal(bad.length, 4)
})

test('skillsSection pastes each skill under its own heading, and nothing without skills (R27)', () => {
  assert.equal(sb.skillsSection([]), '')
  const text = sb.skillsSection([{ name: 'erebus-ui', text: 'RULES A\n' }, { name: 'patron-api', text: 'RULES B' }])
  assert.equal(text, '## Skills for this task\n\n### erebus-ui\n\nRULES A\n\n### patron-api\n\nRULES B\n\n')
})

test('recordUse only appends one line with the time, the session, the kind, the run, the task and the skills (R29)', (t) => {
  const data = tempDir(t, 'aether-data-')
  assert.equal(sb.recordUse(data, { session: 's1', kind: 'run', run: '20261107-120000-abcd', task: 'task-3', skills: ['erebus-ui'], time: 7 }), true)
  assert.equal(sb.recordUse(data, { session: 's1', kind: 'delegate', task: 't1', skills: ['a', 'b'], time: 8 }), true)
  const lines = fs.readFileSync(sb.usesFile(data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(lines, [
    { time: 7, session: 's1', kind: 'run', run: '20261107-120000-abcd', task: 'task-3', skills: ['erebus-ui'] },
    { time: 8, session: 's1', kind: 'delegate', run: null, task: 't1', skills: ['a', 'b'] },
  ])
})
```

**Acceptance:**

- `node --test tests/skill-brief.test.js` pasa y `npm test` completo pasa.
- Un contenido pasado de los límites se rechaza con el motivo; nunca se recorta. `uses.jsonl` solo se agrega.

---

### Task 22: Leer el campo `Skills:` de `tasks.md` y escribirlo en cada encargo

**Aether:**
- Area: plan
- Owns: `plugins/aether/lib/plan.js`, `plugins/aether/lib/plan-groups.js`, `plugins/aether/lib/plan-compile.js`, `tests/aether-plan-skills.test.js`
- Depends on: Task 21 — usa `parseSkillNames`, `loadSkills`, `skillsSection` y `recordUse`
- Serves: R28, R45

**Interfaces:**

- `lib/plan.js`, `parseAetherFields`: la línea `- Skills: a, b` del bloque **Aether** guarda `task.skills = parseSkillNames(valor)` (un arreglo; `[]` sin la línea). No agrega errores: la comprobación es de `check`.
- `lib/plan-groups.js`: la tarea de un grupo (`Merges with`) lleva la unión, sin repetir y en orden, de las `skills` de sus miembros.
- `lib/plan-compile.js`, `check`: por cada tarea con `skills`, agrega a los errores `Task <N>: Skills lists <n> skills (at most 3).` cuando son más de 3 y `Task <N>: skill "<nombre>" does not exist.` por cada nombre que `resolveSkill` no halla (desde `cwd` y el `home` del proceso); sin el campo se comporta como antes.
- `compile`: por cada unidad con `skills`, carga las skills con `loadSkills` (un error de carga es un error de `compile` con su mensaje, que sale con el mismo formato que los demás), pasa a `renderBrief` el arreglo cargado, y agrega una línea a `uses.jsonl` con `recordUse(dataDir, { session: process.env.CLAUDE_CODE_SESSION_ID || null, kind: 'run', run: <id del run>, task: <id de la unidad, p. ej. task-3>, skills })`. Una unidad sin skills no escribe nada en `uses.jsonl`.
- `lib/plan.js`, `renderBrief(task, { planPath, spec, globalConstraints, objective = null, skills = [] })`: con `skills` no vacío, agrega después de la línea `- Owns: …` la línea `- AETHER-SKILLS: a, b` y, antes de `## Task`, la sección de `skillsSection(skills)`. Sin `skills`, el encargo es el de antes, byte por byte.

**Tests (write first):**

`tests/aether-plan-skills.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, tempDir, writePlan, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

function skill(root, name, body = 3) {
  const dir = path.join(root, '.agents', 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${name}`, 'description: Use for the work.', '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
}
const withSkills = (n, names) => task(n).replace(/- Depends on: none\n/, `- Depends on: none\n- Skills: ${names}\n`)
function setup(t) {
  const repo = makeRepo(t)
  return { repo, home: tempDir(t, 'aether-home-'), data: tempDir(t, 'aether-data-') }
}
const env = (w) => ({ HOME: w.home, AETHER_DATA_DIR: w.data, CLAUDE_CODE_SESSION_ID: 'sess-1' })

test('check rejects more than 3 skills and a skill that does not exist, and a plan without the field is as before (R28, H3 scenario 23)', (t) => {
  const w = setup(t)
  for (const name of ['erebus-ui', 'patron-api', 'three', 'four']) skill(w.repo.dir, name)
  const four = runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, patron-api, three, four')]))], w.repo.dir, env(w))
  assert.equal(four.status, 1)
  assert.ok(JSON.stringify(four.json).includes('Task 1: Skills lists 4 skills (at most 3).'), four.stdout)
  const ghost = runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, ghost')]))], w.repo.dir, env(w))
  assert.equal(ghost.status, 1)
  assert.ok(JSON.stringify(ghost.json).includes('Task 1: skill "ghost" does not exist.'), ghost.stdout)
  const ok = runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, patron-api')]))], w.repo.dir, env(w))
  assert.equal(ok.status, 0, ok.stdout)
  assert.equal(runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([task(1)]))], w.repo.dir, env(w)).status, 0)
})

test('compile writes AETHER-SKILLS and the content of the skills in the brief of the unit and one line of uses.jsonl, for the swarm and the external lanes (C10, R45, H3 scenario 22)', (t) => {
  const w = setup(t)
  skill(w.repo.dir, 'erebus-ui')
  skill(w.repo.dir, 'patron-api')
  const r = runBin(PLAN_BIN, ['compile', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, patron-api'), task(2)]))], w.repo.dir, env(w))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const brief = fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8')
  assert.match(brief, /^- AETHER-SKILLS: erebus-ui, patron-api$/m)
  assert.ok(brief.indexOf('## Skills for this task') < brief.indexOf('## Task'))
  assert.ok(brief.includes('rule 1 of erebus-ui') && brief.includes('rule 3 of patron-api'))
  const plain = fs.readFileSync(r.json.tasks['task-2'].brief, 'utf8')
  assert.ok(!plain.includes('AETHER-SKILLS') && !plain.includes('## Skills for this task'))
  const uses = fs.readFileSync(path.join(w.data, 'skills', 'uses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(uses.length, 1)
  assert.deepEqual([uses[0].session, uses[0].kind, uses[0].run, uses[0].task, uses[0].skills], ['sess-1', 'run', r.json.runId, 'task-1', ['erebus-ui', 'patron-api']])
})

test('compile refuses a skill that is missing or too many, with the message of the problem, and writes no brief for it (R28)', (t) => {
  const w = setup(t)
  skill(w.repo.dir, 'erebus-ui')
  const r = runBin(PLAN_BIN, ['compile', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, ghost')]))], w.repo.dir, env(w))
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('skill "ghost" does not exist'))
  assert.equal(fs.existsSync(path.join(w.data, 'skills', 'uses.jsonl')), false)
})

test('the skills of the members of a unit that builds several tasks together are the union of theirs (R45)', (t) => {
  const w = setup(t)
  for (const name of ['a1', 'a2']) skill(w.repo.dir, name)
  const md = plan([withSkills(1, 'a1').replace('- Depends on: none\n', '- Depends on: none\n- Merges with: Task 2\n'), withSkills(2, 'a1, a2')])
  const r = runBin(PLAN_BIN, ['compile', writePlan(w.repo.dir, md)], w.repo.dir, env(w))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const unit = Object.values(r.json.tasks)[0]
  assert.match(fs.readFileSync(unit.brief, 'utf8'), /^- AETHER-SKILLS: a1, a2$/m)
})
```

**Acceptance:**

- `node --test tests/aether-plan-skills.test.js` pasa; `tests/aether-plan.test.js` y las demás pruebas de `aether-plan` siguen verdes sin cambios; `npm test` completo pasa.
- Un `tasks.md` sin el campo produce los mismos encargos que antes, byte por byte.

---

### Task 23: Leer `AETHER-SKILLS:` en el encargo del delegado

**Aether:**
- Review: xhigh — todo encargo de un delegado del Lead pasa por `begin`: un fallo aquí lanza mal o deja de lanzar a todos los delegados
- Area: delegates
- Owns: `plugins/aether/lib/delegate-task.js`, `tests/delegate-task.test.js`, `tests/delegate-skills.test.js`
- Depends on: Task 21 — usa `loadSkills`, `skillsSection` y `recordUse`
- Serves: R27, R29

**Interfaces:**

En `plugins/aether/lib/delegate-task.js`:

- `parseBrief(prompt)` devuelve ahora `{ task, owns, tests, skills }`; `skills` sale de la primera línea que empieza por `AETHER-SKILLS:` (`parseSkillNames`), `[]` sin ella. La prueba que ya existe del `deepEqual` de `parseBrief` gana `skills: []`.
- `begin(input, deps)`: `deps` acepta `home` (por defecto `os.homedir()`) y `pluginRoot` (por defecto la carpeta del plugin). Con `brief.skills` no vacío, antes de elegir el par: `loadSkills(brief.skills, { cwd: r.cwd, home, pluginRoot })`.
  - Con error, **no lanza la tarea**: devuelve la misma clase de plan que una tarea rechazada (`kind: 'refused'`, el llamado más barato que solo dice por qué, y un registro `launch` con `launchKind: 'refused'`), con el texto `Aether delegate task <id> was not launched: <error>. Fix the AETHER-SKILLS line and call again.`
  - Sin error, pega `skillsSection(skills)` al final del encargo en los tres textos que `begin` arma (el de Claude, el del par externo y el de su archivo de encargo), agrega `skills: [..nombres]` al registro `launch` y una línea de `recordUse(r.dataDir, { session, kind: 'delegate', task: id, skills })`. Una corrección de la misma tarea que trae otra vez `AETHER-SKILLS:` pega las mismas skills.
  - Sin `AETHER-SKILLS:` nada cambia (el `prompt` de los argumentos queda como estaba, sin la sección).

**Tests (write first):**

En `tests/delegate-task.test.js`, las dos aserciones de `parseBrief` pasan a `{ task: 't-1', owns: ['src/**', 'tests/a.test.js'], tests: 'npm test', skills: [] }` y `{ task: null, owns: [], tests: null, skills: [] }`.

`tests/delegate-skills.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }

function skill(root, name, body = 3) {
  const dir = path.join(root, '.agents', 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${name}`, 'description: Use for the work.', '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
}
function world(t, { settings = NATIVE, pick = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const cwd = tempDir(t, 'aether-cwd-')
  const home = tempDir(t, 'aether-home-')
  let n = 0
  const deps = { dataDir, cwd, home, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async () => ({ pick, quota: [] }) }
  return { dataDir, cwd, deps }
}
const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const BRIEF = (id, skills) => `AETHER-TASK: ${id}\n${skills === undefined ? '' : `AETHER-SKILLS: ${skills}\n`}Do the work.`
const entries = (dataDir, id) => log.readEntries(dataDir, { task: id })
const uses = (dataDir) => (fs.existsSync(path.join(dataDir, 'skills', 'uses.jsonl')) ? fs.readFileSync(path.join(dataDir, 'skills', 'uses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])

test('parseBrief reads the skills of the first AETHER-SKILLS line (R27)', () => {
  assert.deepEqual(task.parseBrief('AETHER-TASK: t1\nAETHER-SKILLS: erebus-ui, patron-api\nAETHER-SKILLS: other\nbody').skills, ['erebus-ui', 'patron-api'])
  assert.deepEqual(task.parseBrief('AETHER-TASK: t1\nbody').skills, [])
})

test('a task with two skills gets their content in its brief, in the launch record and in the uses record (C10, R29, H3 scenario 22)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'erebus-ui')
  skill(w.cwd, 'patron-api')
  const plan = await task.begin(call(BRIEF('t1', 'erebus-ui, patron-api')), w.deps)
  assert.equal(plan.kind, 'first')
  assert.ok(plan.args.prompt.includes('## Skills for this task') && plan.args.prompt.includes('rule 1 of erebus-ui') && plan.args.prompt.includes('rule 3 of patron-api'))
  assert.ok(plan.args.prompt.startsWith('AETHER-TASK: t1'))
  const launch = entries(w.dataDir, 't1').find((e) => e.kind === 'launch')
  assert.deepEqual(launch.skills, ['erebus-ui', 'patron-api'])
  assert.deepEqual(uses(w.dataDir).map((u) => [u.session, u.kind, u.task, u.skills]), [['s1', 'delegate', 't1', ['erebus-ui', 'patron-api']]])
})

test('the same content reaches an external harness, in its brief file (C10, R29)', async (t) => {
  const w = world(t, { settings: EXTERNAL, pick: GROK })
  skill(w.cwd, 'erebus-ui')
  const plan = await task.begin(call(`${BRIEF('t2', 'erebus-ui')}\nAETHER-OWNS: src/**`), w.deps)
  assert.ok(plan.external)
  const briefs = path.join(w.dataDir, 'delegates', 'briefs')
  const text = fs.readFileSync(path.join(briefs, fs.readdirSync(briefs)[0]), 'utf8')
  assert.ok(text.includes('## Skills for this task') && text.includes('rule 2 of erebus-ui'))
})

test('a task without skills is as before: the call is not changed and nothing is recorded (R29)', async (t) => {
  const w = world(t)
  const plan = await task.begin(call(BRIEF('t3')), w.deps)
  assert.equal(plan.args.prompt, undefined)
  assert.equal(entries(w.dataDir, 't3').find((e) => e.kind === 'launch').skills, undefined)
  assert.deepEqual(uses(w.dataDir), [])
})

test('four skills, a skill that does not exist and a skill that is too big are not launched, and the message says which problem it is (R29, H3 scenario 23)', async (t) => {
  const w = world(t)
  for (const name of ['a', 'b', 'c', 'd']) skill(w.cwd, name)
  skill(w.cwd, 'big', 600)
  const cases = [['four', 'a, b, c, d', 'too many skills: 4 (at most 3)'], ['ghost', 'a, ghost', 'skill "ghost" does not exist'], ['big', 'big', 'has 60']]
  for (const [id, skills, text] of cases) {
    const plan = await task.begin(call(BRIEF(id, skills)), w.deps)
    assert.equal(plan.kind, 'refused', id)
    assert.ok(plan.args.prompt.startsWith(`Aether delegate task ${id} was not launched: `) && plan.args.prompt.includes(text) && plan.args.prompt.endsWith('Fix the AETHER-SKILLS line and call again.'), plan.args.prompt)
    assert.equal(entries(w.dataDir, id).find((e) => e.kind === 'launch').launchKind, 'refused')
  }
  assert.deepEqual(uses(w.dataDir), [])
})

test('a correction that repeats the AETHER-SKILLS line pastes the same skills again (R29)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'erebus-ui')
  await task.begin(call(BRIEF('t4', 'erebus-ui')), w.deps)
  await task.verdict({ task: 't4', verdict: 'fix', findings: ['src/a.js:3: the empty case is missing'] }, w.deps)
  const again = await task.begin(call(BRIEF('t4', 'erebus-ui')), w.deps)
  assert.equal(again.kind, 'fix')
  assert.ok(again.args.prompt.includes('rule 1 of erebus-ui') && again.args.prompt.includes('## Findings to fix'))
})
```

**Acceptance:**

- `node --test tests/delegate-skills.test.js tests/delegate-task.test.js` pasa; `npm test` y `npm run test:mod` completos pasan (`hooks/delegate.test.ts` no cambia).
- Una tarea sin `AETHER-SKILLS:` se comporta byte por byte como antes; una con un problema no se lanza y el mensaje lo dice; nunca se recorta un contenido.

---

### Task 24: Revisar una skill recién creada

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-review.js`, `tests/skill-review.test.js`
- Depends on: Task 18 — clasifica la ruta con `classifySkillPath`
- Depends on: Task 20 — compara por huella con `computedHash`
- Depends on: Task 21 — comprueba tamaño, nombre y descripción con `checkSkillFile`
- Serves: R32, R33

**Interfaces:**

En `plugins/aether/lib/skill-review.js` (`// Family: skill.`):

- `reviewSkill(dir, { cwd, home = os.homedir() })` devuelve la lista de problemas (`[]` si no hay): los de `checkSkillFile(dir)` y, por duplicados dentro de las carpetas de skills del proyecto (`.agents/skills/` y `.claude/skills/`) y las personales (`<home>/.agents/skills/`, `<home>/.claude/skills/`), `a skill with the same name exists at <ruta>` y `the same content as the skill "<otra>" at <ruta>` (misma huella `computedHash`, otro nombre). Un enlace que lleva a la misma carpeta real no es un duplicado.
- `createdFile(dataDir)` → `<dataDir>/skills/created.jsonl`: una línea `{ time, session, repo, name, path, type }` por skill creada (solo se agrega).
- `posttool(input, ctx)` es el manejador de PostToolUse (`ctx = { env, home, now, dataDir }`; usa `ctx.home` para las carpetas personales): cuando `input.tool_name` es `Write`, `Edit` o `MultiEdit` y la ruta (resuelta contra `input.cwd`) está en una carpeta de skills de tipo `project` u `owner` (`classifySkillPath`), revisa la carpeta de esa skill; la primera vez que ve esa skill (mismo `name` y `path` aún no en `created.jsonl`) agrega la línea de `created.jsonl` (`repo` es la raíz principal para `project`, `null` para `owner`); devuelve `Skill "<nombre>": <problema>` por cada problema, una línea cada uno, o `null` si no hay. No cambia la skill.

**Tests (write first):**

`tests/skill-review.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const review = require('../plugins/aether/lib/skill-review.js')

function skill(root, name, { where = '.agents/skills', body = 5, description = 'Use for the work.', frontName = name, extra = '' } = {}) {
  const dir = path.join(root, where, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${frontName}`, ...(description === null ? [] : [`description: ${description}`]), '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1}${extra}`)].join('\n') + '\n')
  return dir
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  return { repo, home, data, opts: { cwd: repo.dir, home }, ctx: { env: {}, home, now: 5000, dataDir: data } }
}
const write = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: file } })

test('a good skill has no problem; size, name and description are checked (R32)', (t) => {
  const w = world(t)
  assert.deepEqual(review.reviewSkill(skill(w.repo.dir, 'good'), w.opts), [])
  const problems = review.reviewSkill(skill(w.repo.dir, 'bad', { body: 600, description: null, frontName: 'Other' }), w.opts)
  assert.equal(problems.length, 4)
  assert.ok(problems.some((p) => p.includes('has 6') && p.includes('lines (at most 500)')))
  assert.ok(problems.includes('no description'))
})

test('a skill with the same name in a personal folder, or with the same content under another name, is a duplicate; a link to the same folder is not (R32, A8)', (t) => {
  const w = world(t)
  const mine = skill(w.repo.dir, 'erebus-ui')
  skill(w.home, 'erebus-ui', { where: '.agents/skills', extra: ' (other text)' })
  assert.ok(review.reviewSkill(mine, w.opts).some((p) => p.startsWith('a skill with the same name exists at ') && p.endsWith(path.join(w.home, '.agents', 'skills', 'erebus-ui'))))
  const copy = skill(w.repo.dir, 'erebus-ui-copy', { frontName: 'erebus-ui-copy' })
  const twin = skill(w.repo.dir, 'erebus-twin', { frontName: 'erebus-ui-copy' })
  fs.writeFileSync(path.join(twin, 'SKILL.md'), fs.readFileSync(path.join(copy, 'SKILL.md')))
  assert.ok(review.reviewSkill(twin, w.opts).some((p) => p.startsWith('the same content as the skill "erebus-ui-copy" at ')))
  const solo = skill(w.repo.dir, 'solo')
  fs.mkdirSync(path.join(w.repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(solo, path.join(w.repo.dir, '.claude', 'skills', 'solo'))
  assert.deepEqual(review.reviewSkill(solo, w.opts), [])
})

test('after the Lead writes a skill the handler names its problems, records it as created once, and changes nothing (C11, H3 scenario 24)', (t) => {
  const w = world(t)
  const dir = skill(w.repo.dir, 'long-one', { body: 600 })
  const before = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
  const text = review.posttool(write(w, path.join(dir, 'SKILL.md')), w.ctx)
  assert.ok(text.startsWith('Skill "long-one": SKILL.md has 6') && text.includes('(at most 500)'))
  assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), before)
  review.posttool(write(w, path.join(dir, 'SKILL.md'), 'Edit'), w.ctx)
  const created = fs.readFileSync(review.createdFile(w.data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(created.length, 1, 'the second edit does not record it again')
  assert.deepEqual([created[0].session, created[0].repo, created[0].name, created[0].path, created[0].type, created[0].time], ['s1', w.repo.dir, 'long-one', dir, 'project', 5000])
  const good = skill(w.repo.dir, 'fine')
  assert.equal(review.posttool(write(w, path.join(good, 'SKILL.md')), w.ctx), null)
})

test('a permanent skill is recorded without a repository, and writes outside the skill folders are ignored (R32)', (t) => {
  const w = world(t)
  const dir = skill(w.home, 'owner-one', { where: '.agents/skills' })
  assert.equal(review.posttool(write(w, path.join(dir, 'SKILL.md')), w.ctx), null)
  const created = fs.readFileSync(review.createdFile(w.data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual([created[0].repo, created[0].type], [null, 'owner'])
  for (const input of [write(w, path.join(w.repo.dir, 'src', 'a.js')), { ...write(w, path.join(dir, 'SKILL.md')), tool_name: 'Bash' }, null, {}]) assert.equal(review.posttool(input, w.ctx), null)
  assert.equal(fs.readFileSync(review.createdFile(w.data), 'utf8').trim().split('\n').length, 1)
})
```

**Acceptance:**

- `node --test tests/skill-review.test.js` pasa y `npm test` completo pasa.
- El manejador solo avisa: no cambia la skill; `created.jsonl` solo se agrega.

---

### Task 25: Avisar de un hallazgo repetido entre tareas

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-repeat.js`, `tests/skill-repeat.test.js`
- Depends on: Task 17 — la historia H3 empieza cuando H2 está fusionada
- Serves: R31

**Interfaces:**

En `plugins/aether/lib/skill-repeat.js` (`// Family: skill.`):

- `repeatedFindings(dataDir, { session, task })` lee `delegates/log.jsonl` (con `readEntries(dataDir, { session })` de `lib/delegate-log.js`) y devuelve `[{ finding, tasks }]`: por cada hallazgo del último veredicto `fix` de `task` (`entry.kind === 'verdict'`, `entry.input.kind === 'fix'`, `entry.input.findings` con `{ file, line, what }`), si otra tarea de la misma sesión tuvo un veredicto `fix` con un hallazgo de la misma clave (`ladder.findingKey`, A10), `finding` es el texto `<archivo>: <qué>` y `tasks` los ids de las otras tareas (sin repetir, en orden). Sin repetidos, `[]`.
- `posttool(input, ctx)` es el manejador de PostToolUse (`ctx = { env, home, now, dataDir }`): cuando `input.tool_name` es `Bash` y el comando contiene `aether-delegate verdict` con `--task <id>`, calcula `repeatedFindings(ctx.dataDir, { session: input.session_id, task: <id> })` y devuelve, por cada uno, `The finding "<finding>" already came up in <task|tasks> <t1, t2>. Consider a skill for it: load aether:skills.` (una línea cada uno); `null` si no hay. No escribe nada.

**Tests (write first):**

`tests/skill-repeat.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const repeat = require('../plugins/aether/lib/skill-repeat.js')

const verdict = (data, session, task, findings, kind = 'fix') =>
  log.appendEntry(data, { kind: 'verdict', time: Date.now(), session, task, attempt: 1, step: 'haiku', verdict: kind, input: { kind, findings: findings.map(([file, line, what]) => ({ file, line, what })), reason: null, fromScratch: false } })
const bash = (command, session = 's1') => ({ session_id: session, cwd: '/repo', tool_name: 'Bash', tool_input: { command } })

test('a finding of the last verdict that another task of the session already had is reported with the tasks (R31, A10, H3 scenario 24)', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 's1', 't1', [['src/a.js', 3, 'the empty case is missing'], ['src/b.js', 9, 'unrelated']])
  verdict(data, 's1', 't3', [['SRC/a.js', 40, 'The empty case is missing']])
  verdict(data, 's1', 't2', [['src/a.js', 7, 'the empty case is missing'], ['src/c.js', 1, 'new one']])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't2' }), [{ finding: 'src/a.js: the empty case is missing', tasks: ['t1', 't3'] }])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't1' }), [{ finding: 'src/a.js: the empty case is missing', tasks: ['t3', 't2'] }])
})

test('another session, an approve and a task with no verdict give nothing (R31)', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 'other', 't1', [['src/a.js', 3, 'the empty case is missing']])
  verdict(data, 's1', 't2', [['src/a.js', 7, 'the empty case is missing']])
  verdict(data, 's1', 't3', [], 'approve')
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't2' }), [])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 't3' }), [])
  assert.deepEqual(repeat.repeatedFindings(data, { session: 's1', task: 'nobody' }), [])
  assert.deepEqual(repeat.repeatedFindings(tempDir(t), { session: 's1', task: 't2' }), [])
})

test('after aether-delegate verdict the handler says the finding already came up, and says nothing for other commands (R31)', (t) => {
  const data = tempDir(t, 'aether-data-')
  verdict(data, 's1', 't1', [['src/a.js', 3, 'the empty case is missing']])
  verdict(data, 's1', 't2', [['src/a.js', 7, 'the empty case is missing']])
  const ctx = { env: {}, home: '/h', now: 1, dataDir: data }
  const text = repeat.posttool(bash('aether-delegate verdict --task t2 --verdict fix --finding "src/a.js:7: the empty case is missing"'), ctx)
  assert.equal(text, 'The finding "src/a.js: the empty case is missing" already came up in task t1. Consider a skill for it: load aether:skills.')
  verdict(data, 's1', 't3', [['src/a.js', 1, 'the empty case is missing']])
  assert.match(repeat.posttool(bash('node /p/bin/aether-delegate verdict --task t3 --verdict fix'), ctx), /already came up in tasks t1, t2\./)
  for (const command of ['ls', 'aether-delegate begin --session s1 --input x', 'aether-delegate verdict --verdict fix']) assert.equal(repeat.posttool(bash(command), ctx), null, command)
  assert.equal(repeat.posttool({ ...bash('aether-delegate verdict --task t2'), tool_name: 'Write' }, ctx), null)
  assert.equal(repeat.posttool(null, ctx), null)
})
```

**Acceptance:**

- `node --test tests/skill-repeat.test.js` pasa y `npm test` completo pasa.
- Usa el mismo criterio de «mismo hallazgo» que la escalera (`ladder.findingKey`), no uno propio; no escribe nada.

---

### Task 26: Aplicar las reglas de skills en la guarda

**Aether:**
- Review: xhigh — la guarda decide qué skills se editan, cuáles se instalan sin preguntar y quién toca la lista de confianza
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard-skills.test.js`, `tests/copies-classes.test.js`
- Depends on: Task 11 — extiende `guard.js` después de esa tarea
- Depends on: Task 18 — usa `classifySkillPath`, `copyAdvice` e `installClass`
- Depends on: Task 19 — usa la clase `skill-install` y `trusted.json`
- Serves: R23, R25, R30, R47

**Interfaces:**

En `plugins/aether/lib/guard.js` (`decide(input, env = process.env)` gana el segundo parámetro; `irreversibleClasses(command, cwd, env = process.env)` también):

- Herramientas de archivos (`decide`): si `classifySkillPath(target, { cwd, home, dataDir })` da `aether` o `downloaded` con `editable: false`, devuelve `{ reason: copyAdvice(info) }` para cualquier agente; `project` y `aether` editable pasan; `owner` (con `grant: 'skill-install'`) se trata como una clase irreversible: sin permiso (`autonomy.check(mainRoot, 'skill-install', { session })`) se anota en `.aether/pending.jsonl` con `command` `Write <ruta>` y, con `AETHER_IRREVERSIBLE=enforce`, se rechaza con el texto que ya usa la guarda para las demás clases; con permiso, pasa. La lógica de «anotar y rechazar si no hay permiso» que hoy vive en `decideBash` se comparte con esta rama (una sola función, no copiada).
- Bash (`decideBash` y `irreversibleClasses`): un comando de instalación es `skill-install` cuando `installClass(command, { dataDir })` lo dice; y todo comando que no es de solo lectura y nombra una ruta dentro de `~/.agents/skills/` o `~/.claude/skills/` (con `~`, `$HOME`, `${HOME}` o la ruta absoluta del `home`), o que redirige a ella, es `skill-install`. Un comando de solo lectura sobre esas rutas no.
- `trusted.json` (`<datos>/skills/trusted.json`): la guarda rechaza que cualquier agente lo edite con las herramientas de archivos (`{ reason }` que dice que solo lo escribe `aether-autonomy trust`) y con Bash que lo nombra y escribe (como rechaza `grants.json`); `aether-autonomy trust …` no se rechaza.
- El resto (autonomía, intención, Examinador, `.claude`) no cambia.
- `tests/copies-classes.test.js`: `skill-install` sale de `GRANT_ONLY` y entra en `SAMPLE` con `'npx skills add someone/skills'`.

**Tests (write first):**

`tests/guard-skills.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir, PLUGIN } = require('./helpers.js')
const { decide, decideBash, irreversibleClasses } = require('../plugins/aether/lib/guard.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const ROOT = path.join(__dirname, '..')
const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const human = (text, time) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = useDataDir(t)
  const configDir = tempDir(t, 'aether-claude-')
  const previous = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR }
  process.env.HOME = home
  process.env.CLAUDE_CONFIG_DIR = configDir
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  put(path.join(repo.dir, '.agents', 'skills', 'mine', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills' } } }))
  fs.mkdirSync(path.join(repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'pdf'), path.join(repo.dir, '.claude', 'skills', 'pdf'))
  put(path.join(home, '.agents', 'skills', 'owner-one', 'SKILL.md'))
  const enforce = { ...process.env, AETHER_IRREVERSIBLE: 'enforce' }
  const file = (target, who = { agent_type: 'aether:lead' }, tool = 'Write') => ({ hook_event_name: 'PreToolUse', cwd: repo.dir, session_id: 's1', tool_name: tool, tool_input: { file_path: target }, ...who })
  const bash = (command, env = enforce) => decideBash({ hook_event_name: 'PreToolUse', cwd: repo.dir, session_id: 's1', tool_name: 'Bash', tool_input: { command } }, env)
  const trust = (...authors) => put(path.join(data, 'skills', 'trusted.json'), JSON.stringify({ authors }))
  const allow = (quote) => {
    put(path.join(configDir, 'projects', '-p', 's1.jsonl'), human(quote, '2026-11-07T10:00:00.000Z') + '\n')
    return autonomy.grant(repo.dir, { class: 'skill-install', quote, session: 's1', scope: 'session' }, { configDir })
  }
  return { repo, home, data, configDir, enforce, file, bash, trust, allow }
}

test('an Aether skill and a downloaded skill are not edited, also through the link of .claude/skills/, and the message says how to copy it (C8, H3 scenario 18)', (t) => {
  const w = world(t)
  for (const who of [{ agent_type: 'aether:lead' }, { agent_type: 'aether:implementer', agent_id: 'i1' }, {}]) {
    for (const target of [path.join(w.repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'), path.join(w.repo.dir, '.claude', 'skills', 'pdf', 'SKILL.md')]) {
      const d = decide(w.file(target, who), w.enforce)
      assert.ok(d && d.reason.startsWith('This skill was downloaded from the internet, and downloaded skills are not edited') && d.reason.includes('.agents/skills/'), target)
    }
  }
  const plugin = decide(w.file(path.join(PLUGIN, 'skills', 'plan', 'SKILL.md')), w.enforce)
  assert.ok(plugin.reason.startsWith("This is a skill of Aether, and Aether's skills are not edited"))
})

test('a project skill is edited without asking, and an Aether skill inside the repository of the session too, to develop Aether (C11, D11)', (t) => {
  const w = world(t)
  assert.equal(decide(w.file(path.join(w.repo.dir, '.agents', 'skills', 'mine', 'SKILL.md')), w.enforce), null)
  assert.equal(decide(w.file(path.join(w.repo.dir, '.agents', 'skills', 'brand-new', 'SKILL.md')), w.enforce), null)
  assert.equal(readPending(w.repo.dir).length, 0)
  const inRepo = { ...w.file(path.join(PLUGIN, 'skills', 'plan', 'SKILL.md')), cwd: ROOT }
  assert.equal(decide(inRepo, w.enforce), null)
})

test('a permanent skill waits for the owner: held under enforce and recorded, and allowed with the grant of the session (R30, H3 scenario 24)', (t) => {
  const w = world(t)
  const target = path.join(w.home, '.agents', 'skills', 'owner-one', 'SKILL.md')
  const held = decide(w.file(target), w.enforce)
  assert.ok(held && held.reason.includes('skill-install'))
  assert.deepEqual(readPending(w.repo.dir).map((e) => e.class), ['skill-install'])
  assert.equal(decide(w.file(path.join(w.home, '.claude', 'skills', 'new', 'SKILL.md')), w.enforce).reason.includes('skill-install'), true)
  assert.equal(decide(w.file(target), { ...w.enforce, AETHER_IRREVERSIBLE: 'log' }), null, 'logged only without enforce')
  assert.equal(w.allow('apruebo instalar esta skill permanente para todos mis proyectos').ok, true)
  assert.equal(decide(w.file(target), w.enforce), null)
})

test('npx skills add with each launcher and source: trusted authors pass for the project; everything else is held (C9, R25, H3 scenarios 19 to 21)', (t) => {
  const w = world(t)
  const cwd = w.repo.dir
  const classes = (command) => irreversibleClasses(command, cwd, w.enforce)
  assert.deepEqual(classes('npx skills add anthropics/skills@pdf'), ['skill-install'], 'the list starts empty')
  w.trust('anthropics')
  for (const launcher of ['npx', 'bunx', 'pnpm dlx', '']) assert.deepEqual(classes(`${launcher} skills add anthropics/skills@pdf`.trim()), [], launcher)
  assert.deepEqual(classes('npx skills add someone/skills'), ['skill-install'])
  assert.deepEqual(classes('npx skills add -g anthropics/skills@pdf'), ['skill-install'])
  assert.deepEqual(classes('npx skills add ./local/skills'), ['skill-install'])
  assert.deepEqual(classes('npx skills add https://example.com/skills.git'), ['skill-install'])
  assert.deepEqual(classes('npx skills find pdf'), [])
  assert.equal(w.bash('npx skills add anthropics/skills@pdf'), null)
  assert.equal(readPending(cwd).length, 0)
  const held = w.bash('npx skills add someone/skills')
  assert.ok(held && held.reason.includes('skill-install'))
  assert.deepEqual(readPending(cwd).map((e) => e.class), ['skill-install'])
})

test('with the permission of the session an untrusted source passes, recorded as the owner said (R25)', (t) => {
  const w = world(t)
  assert.ok(w.bash('npx skills add someone/skills'))
  assert.equal(w.allow('apruebo instalar skills de someone para esta sesion').ok, true)
  assert.equal(w.bash('npx skills add someone/skills'), null)
  assert.equal(w.bash('npx skills add -g anthropics/skills@pdf'), null)
})

test('a command that writes into the personal skill folders is held; one that only reads is not (R30)', (t) => {
  const w = world(t)
  for (const command of ['cp -r /tmp/s ~/.agents/skills/new', `mv a ${path.join(w.home, '.claude', 'skills', 'x')}`, 'echo x > $HOME/.agents/skills/a/SKILL.md', 'ln -s a ${HOME}/.claude/skills/b', 'rm -rf ~/.agents/skills/old']) {
    assert.deepEqual(irreversibleClasses(command, w.repo.dir, w.enforce).includes('skill-install'), true, command)
  }
  for (const command of ['ls ~/.agents/skills', 'cat ~/.claude/skills/x/SKILL.md', 'cp a .agents/skills/b']) assert.equal(irreversibleClasses(command, w.repo.dir, w.enforce).includes('skill-install'), false, command)
})

test('trusted.json is written only by aether-autonomy trust: edits are refused, the command is not (R47)', (t) => {
  const w = world(t)
  const list = path.join(w.data, 'skills', 'trusted.json')
  for (const who of [{ agent_type: 'aether:lead' }, { agent_type: 'aether:implementer', agent_id: 'i1' }, {}]) {
    const d = decide(w.file(list, who), w.enforce)
    assert.ok(d && d.reason.includes('aether-autonomy trust'), JSON.stringify(who))
  }
  for (const command of [`echo '{"authors":["x"]}' > ${list}`, `sed -i s/a/b/ ${list}`, `cp /tmp/t ${list}`]) assert.ok(w.bash(command)?.reason.includes('aether-autonomy trust'), command)
  assert.equal(w.bash('aether-autonomy trust --author anthropics --quote "confio en anthropics" --session s1'), null)
  assert.equal(w.bash(`cat ${list}`), null)
})
```

**Acceptance:**

- `node --test tests/guard-skills.test.js tests/copies-classes.test.js tests/guard-claude.test.js` pasa; `tests/guard.test.js` y las demás de la guarda siguen verdes; `npm test` completo pasa.
- Una skill de proyecto se edita sin preguntar; instalar o escribir una permanente sin el sí del dueño se rechaza bajo `enforce` y queda en `pending.jsonl`; el límite A14 (un guion que arma la ruta) se dice en un comentario.

---

### Task 27: Hallar las skills sin uso

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-idle.js`, `tests/skill-idle.test.js`
- Depends on: Task 20 — lee `installs.jsonl` con `readInstalls`
- Depends on: Task 24 — lee `created.jsonl`
- Serves: R33

**Interfaces:**

En `plugins/aether/lib/skill-idle.js` (`// Family: skill.`):

- `IDLE_DAYS = 30`.
- `idleSkills(dataDir, { repo, now = Date.now(), days = IDLE_DAYS })` devuelve `[{ name, path, since }]`, ordenado por nombre: las skills que el Lead creó (`created.jsonl`) o bajó (`installs.jsonl`) que son de este repositorio (`repo` igual al de la línea) o permanentes (`repo` `null`), cuya última aparición en esos registros tiene más de `days` días, cuya carpeta (`path`) aún existe y que ninguna línea de `uses.jsonl` nombra en sus `skills` con `time` dentro de los últimos `days` días. Nunca lanza; sin registros, `[]`.
- `idleLine(names, { spanish })` devuelve `Skills nobody used in 30 days: <a, b>. Consider removing them, with the owner's yes (aether:skills).` o `Skills que nadie usó en 30 días: <a, b>. Considera quitarlas, con el sí del dueño (aether:skills).`; `''` si `names` está vacío.

**Tests (write first):**

`tests/skill-idle.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const idle = require('../plugins/aether/lib/skill-idle.js')

const NOW = Date.parse('2026-11-07T12:00:00Z')
const DAY = 86400000
const lines = (file, entries) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
}

function world(t) {
  const data = tempDir(t, 'aether-data-')
  const skills = tempDir(t, 'aether-skills-')
  const dir = (name) => {
    const d = path.join(skills, name)
    fs.mkdirSync(d, { recursive: true })
    return d
  }
  return { data, dir, created: (e) => lines(path.join(data, 'skills', 'created.jsonl'), e), installs: (e) => lines(path.join(data, 'skills', 'installs.jsonl'), e), uses: (e) => lines(path.join(data, 'skills', 'uses.jsonl'), e) }
}

test('a skill the Lead created or downloaded, older than 30 days and used by no task in 30 days, is idle; the rest is not (R33, A9, H3 scenario 25)', (t) => {
  const w = world(t)
  const old = NOW - 40 * DAY
  w.created([
    { time: old, session: 's', repo: '/r', name: 'unused', path: w.dir('unused'), type: 'project' },
    { time: old, session: 's', repo: '/r', name: 'used-lately', path: w.dir('used-lately'), type: 'project' },
    { time: NOW - 5 * DAY, session: 's', repo: '/r', name: 'young', path: w.dir('young'), type: 'project' },
    { time: old, session: 's', repo: '/other', name: 'elsewhere', path: w.dir('elsewhere'), type: 'project' },
    { time: old, session: 's', repo: '/r', name: 'gone', path: path.join(w.dir('x'), 'gone'), type: 'project' },
    { time: old, session: 's', repo: null, name: 'permanent', path: w.dir('permanent'), type: 'owner' },
  ])
  w.installs([{ time: old, session: 's', source: 'a/b', scope: 'project', repo: '/r', name: 'fetched', path: w.dir('fetched'), hash: 'h' }, { time: old, session: 's', source: 'a/c', scope: 'global', repo: null, name: 'global-fetched', path: w.dir('global-fetched'), hash: 'h' }])
  w.uses([{ time: NOW - 10 * DAY, session: 's', kind: 'delegate', run: null, task: 't', skills: ['used-lately'] }, { time: NOW - 50 * DAY, session: 's', kind: 'run', run: 'x', task: 'task-1', skills: ['unused'] }])
  assert.deepEqual(idle.idleSkills(w.data, { repo: '/r', now: NOW }).map((s) => s.name), ['fetched', 'global-fetched', 'permanent', 'unused'])
  assert.equal(idle.idleSkills(w.data, { repo: '/r', now: NOW })[0].path.endsWith('fetched'), true)
})

test('no records, unreadable lines and a missing data folder give nothing and never throw (R33)', (t) => {
  const w = world(t)
  assert.deepEqual(idle.idleSkills(w.data, { repo: '/r', now: NOW }), [])
  fs.mkdirSync(path.join(w.data, 'skills'), { recursive: true })
  fs.writeFileSync(path.join(w.data, 'skills', 'created.jsonl'), 'not json\n')
  assert.deepEqual(idle.idleSkills(w.data, { repo: '/r', now: NOW }), [])
  assert.deepEqual(idle.idleSkills(path.join(w.data, 'missing'), { repo: '/r', now: NOW }), [])
})

test('idleLine names the skills in English and in Spanish, and says nothing for none (R33)', () => {
  assert.equal(idle.idleLine(['a', 'b'], { spanish: false }), "Skills nobody used in 30 days: a, b. Consider removing them, with the owner's yes (aether:skills).")
  assert.equal(idle.idleLine(['a'], { spanish: true }), 'Skills que nadie usó en 30 días: a. Considera quitarlas, con el sí del dueño (aether:skills).')
  assert.equal(idle.idleLine([], { spanish: false }), '')
})
```

**Acceptance:**

- `node --test tests/skill-idle.test.js` pasa y `npm test` completo pasa.
- El módulo solo lee; proponer quitar una skill no la quita.

---

### Task 28: Sumar el registro, la revisión y el hallazgo repetido al despachador de PostToolUse

**Aether:**
- Area: continuity
- Owns: `plugins/aether/lib/continuity-posttool.js`, `tests/continuity-posttool-skills.test.js`
- Depends on: Task 9 — esa tarea deja la lista de manejadores con el de `tree-check`
- Depends on: Task 20 — el registro de instalaciones
- Depends on: Task 24 — la revisión de una skill
- Depends on: Task 25 — el hallazgo repetido
- Serves: R26, R31, R32

**Interfaces:**

En `plugins/aether/lib/continuity-posttool.js`, `HANDLERS` queda, en este orden: `memoryReminder`, `treeCheck.posttool`, `skillRegistry.posttool`, `skillReview.posttool`, `skillRepeat.posttool`. El resto del módulo no cambia.

**Tests (write first):**

`tests/continuity-posttool-skills.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')
const reg = require('../plugins/aether/lib/skill-registry.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  return { repo, home, data, ctx: { env: { LANG: 'en_US.UTF-8' }, home, now: 5000, dataDir: data } }
}

test('the dispatcher runs the three skill handlers: a lock that disagrees, a skill with problems and a finding that came back (R26, R31, R32)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: Use for pdf.\n---\nBody\n')
  put(path.join(w.repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills', computedHash: 'f'.repeat(64) } } }))
  const install = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command: 'npx skills add anthropics/skills@pdf' } }, w.ctx)
  assert.ok(install.additionalContext.includes('differs from skills-lock.json'))
  assert.equal(reg.readInstalls(w.data).length, 1)

  const long = path.join(w.repo.dir, '.agents', 'skills', 'long-one')
  put(path.join(long, 'SKILL.md'), ['---', 'name: long-one', 'description: d', '---', ...Array.from({ length: 600 }, (_, i) => `rule ${i}`)].join('\n'))
  const review = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: path.join(long, 'SKILL.md') } }, w.ctx)
  assert.ok(review.additionalContext.startsWith('Skill "long-one": SKILL.md has 6'))

  for (const [task, line] of [['t1', 3], ['t2', 7]]) {
    log.appendEntry(w.data, { kind: 'verdict', time: 1, session: 's1', task, attempt: 1, step: 'haiku', verdict: 'fix', input: { kind: 'fix', findings: [{ file: 'src/a.js', line, what: 'the empty case is missing' }], reason: null, fromScratch: false } })
  }
  const repeat = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Bash', tool_input: { command: 'aether-delegate verdict --task t2 --verdict fix --finding "src/a.js:7: the empty case is missing"' } }, w.ctx)
  assert.ok(repeat.additionalContext.includes('already came up in task t1'))
})

test('a write in the memory, a CLAUDE.md and a skill each get their own notice, and an ordinary edit gets none (R9, R12, R32)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), 'claude only\n')
  const claude = posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'CLAUDE.md') } }, w.ctx)
  assert.ok(claude.additionalContext.includes('CLAUDE.md does not import AGENTS.md'))
  assert.equal(posttool.posttool({ session_id: 's1', cwd: w.repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(w.repo.dir, 'src', 'a.js') } }, w.ctx), null)
})

test('through the bin the notices of the skills reach the Lead as additionalContext, and a plain session gets nothing (R40)', (t) => {
  const w = world(t)
  markSession(w.data, 's1', 1000, { repo: w.repo.dir, claude: null })
  const long = path.join(w.repo.dir, '.agents', 'skills', 'long-one')
  put(path.join(long, 'SKILL.md'), ['---', 'name: long-one', 'description: d', '---', ...Array.from({ length: 600 }, (_, i) => `rule ${i}`)].join('\n'))
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const ask = (session) => spawnSync(process.execPath, [bin, 'posttool'], { input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, cwd: w.repo.dir, tool_name: 'Write', tool_input: { file_path: path.join(long, 'SKILL.md') } }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.home, HOME: w.home } })
  const lead = JSON.parse(ask('s1').stdout)
  assert.equal(lead.hookSpecificOutput.hookEventName, 'PostToolUse')
  assert.ok(lead.hookSpecificOutput.additionalContext.includes('long-one'))
  const plain = ask('plain')
  assert.deepEqual([plain.status, plain.stdout], [0, ''])
  assert.equal(fs.existsSync(path.join(w.data, 'skills', 'created.jsonl')), true)
  assert.equal(fs.readdirSync(path.join(w.data, 'skills')).length, 1, 'the plain session wrote nothing')
})
```

**Acceptance:**

- `node --test tests/continuity-posttool-skills.test.js tests/continuity-posttool.test.js tests/tree-check.test.js` pasa y `npm test` completo pasa.
- Cada manejador sigue ignorado si lanza; el despachador sigue imprimiendo una sola línea JSON.

---

### Task 29: Escribir las skills `aether:skills` y `aether:art-direction` y la línea del Writer

**Aether:**
- Area: skills-docs
- Owns: `plugins/aether/skills/skills/SKILL.md`, `plugins/aether/skills/art-direction/SKILL.md`, `plugins/aether/agents/writer.md`, `plugins/aether/skills/plan/SKILL.md`, `plugins/aether/speckit/commands/speckit.plan.md`, `tests/new-skills.test.js`, `tests/help.test.js`, `tests/agents.test.js`
- Depends on: Task 17 — la historia H3 empieza cuando H2 está fusionada
- Depends on: Task 19 — la skill nombra `aether-autonomy trust` y la clase `skill-install`
- Depends on: Task 7 — comparten `tests/help.test.js`, que esa tarea cambia antes
- Depends on: Task 13 — comparten `tests/agents.test.js`
- Serves: R34, R35, R46

**Interfaces:**

- `plugins/aether/skills/skills/SKILL.md`: front matter `name: skills`, `description` que empieza por `Use` (de a lo más 300 caracteres: cuándo buscar, bajar, crear o mantener una skill, o dársela a una tarea) y sin `disable-model-invocation` (el Lead la carga con la herramienta Skill). Escrita en inglés. Contenido obligatorio, con estas expresiones literales: los cuatro tipos con su lugar (Aether, que no se edita; permanentes del dueño en `~/.agents/skills/`; de proyecto en `.agents/skills/`, en git; bajadas, que no se editan y se copian con otro nombre), `.claude/skills/` como enlace a la copia real de `.agents/skills/`, `npx skills find` y `npx skills add`, la regla de leer la skill completa antes de instalarla («read the whole skill»), la lista de autores de confianza (`<data dir>/skills/trusted.json`, empieza vacía, solo `aether-autonomy trust`), que `-g` y una fuente sin autor esperan el sí del dueño (`skill-install`), la revisión antes de instalar (qué mirar: scripts, permisos que pide, a quién se le da la skill), `skills-lock.json` y `uses.jsonl`, cuándo crear una skill (error que se repite, método propio del proyecto, el dueño lo pide) y a qué nivel (proyecto sola; permanente con el sí), el límite de 500 renglones y «at most 3» skills por tarea, el campo `Skills:` de `tasks.md` y la línea `AETHER-SKILLS:` del encargo, y cómo anotar en el `AGENTS.md` del proyecto una skill que sirve a todas las tareas de un rol (R46: una sección corta «Skills» con qué skills recibe cada clase de tarea; el Lead la lee al escribir los encargos y ningún hook la inyecta).
- `plugins/aether/skills/art-direction/SKILL.md`: `name: art-direction`, `description` que empieza por `Use` (cuándo el Writer especifica una feature visual), sin `disable-model-invocation`. Dice el método: antes del plan de una feature visual, el Writer escribe `specs/NNN-<topic>/art-direction.md` con la intención del aspecto, la paleta, la tipografía, el espaciado y la composición, el movimiento, los estados y las cosas que no se hacen; el plan la lee.
- `plugins/aether/agents/writer.md`: en «When the message asks for the plan and the tasks», un paso nuevo antes de escribir `plan.md`: cuando la feature es visual (una interfaz, una página, una pieza gráfica), carga `aether:art-direction` y escribe `specs/NNN-<topic>/art-direction.md`; sin feature visual, no. `plugins/aether/skills/plan/SKILL.md` y `plugins/aether/speckit/commands/speckit.plan.md` (que las pruebas de `tests/speckit.test.js` mantienen iguales a la skill) dicen que `plan.md` lee `art-direction.md` cuando existe.
- `tests/help.test.js`: `EXCLUDED` gana `skills` y `art-direction` con su motivo (las carga el Lead y el Writer, nadie las invoca por su nombre).

**Tests (write first):**

`tests/new-skills.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  assert.ok(m, 'front matter')
  return Object.fromEntries(m[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim().replace(/^"|"$/g, '')]))
}

test('aether:skills has its cover and can be loaded by the Lead (C12, R34)', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  const front = frontMatter(text)
  assert.equal(front.name, 'skills')
  assert.ok(front.description.startsWith('Use ') && front.description.length <= 300)
  assert.equal(front['disable-model-invocation'], undefined)
})

test('aether:skills teaches the four types, where to find and download, what to review, when to create and how to give skills to a task (R34, R46, C12)', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  for (const token of ['~/.agents/skills/', '.agents/skills/', '.claude/skills/', 'skills-lock.json', 'uses.jsonl', 'npx skills find', 'npx skills add', 'aether-autonomy trust', 'trusted.json', 'skill-install', 'AETHER-SKILLS:', 'Skills:', 'AGENTS.md', 'at most 3', '500 lines']) {
    assert.ok(text.includes(token), `the skill names ${token}`)
  }
  const lower = text.toLowerCase()
  for (const phrase of ['read the whole skill', 'downloaded', 'aether', 'project', 'permanent', 'copy it with another name', '-g']) assert.ok(lower.includes(phrase), phrase)
  assert.ok(!/onboard/i.test(text))
})

test('aether:art-direction names the file the Writer writes before the plan (R34, R35)', () => {
  const text = read('skills', 'art-direction', 'SKILL.md')
  const front = frontMatter(text)
  assert.equal(front.name, 'art-direction')
  assert.ok(front.description.startsWith('Use ') && front.description.length <= 300)
  assert.equal(front['disable-model-invocation'], undefined)
  assert.ok(text.includes('specs/NNN-<topic>/art-direction.md'))
  for (const word of ['palette', 'typography', 'spacing', 'motion', 'states']) assert.ok(text.toLowerCase().includes(word), word)
})

test('the Writer and the plan skill name the art direction before the plan; there is no hook for it (R35, H3 scenario 26)', () => {
  const writer = read('agents', 'writer.md')
  assert.ok(writer.includes('aether:art-direction') && writer.includes('art-direction.md'))
  assert.ok(writer.indexOf('aether:art-direction') < writer.indexOf('Write `plan.md`, then `tasks.md`') || writer.indexOf('art-direction.md') < writer.indexOf('Run `aether-plan check'))
  assert.ok(read('skills', 'plan', 'SKILL.md').includes('art-direction.md'))
  assert.ok(read('speckit', 'commands', 'speckit.plan.md').includes('art-direction.md'))
  const hooks = fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')
  assert.ok(!/art-direction/.test(hooks))
})
```

**Acceptance:**

- `node --test tests/new-skills.test.js tests/help.test.js tests/agents.test.js tests/speckit.test.js` pasa, `npm test` y `npm run validate` completos pasan (`claude plugin validate --strict` acepta las skills nuevas).
- Ninguna de las dos skills nombra `onboard`. No se agrega ningún hook para la dirección de arte.
- `tests/commands.test.js` encuentra un llamador concreto de `aether-autonomy trust` en la skill `skills`.

---

### Task 30: Escribir las reglas del Lead sobre skills, continuidad y orden

**Aether:**
- Area: lead-rules
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/hooks/hooks.json`, `CLAUDE.md`, `tests/using-aether-030.test.js`, `tests/session-start-parts.test.js`, `tests/copies-classes.test.js`, `tests/roles.test.js`
- Depends on: Task 29 — las reglas nombran las skills `aether:skills` y `aether:art-direction`
- Depends on: Task 26 — las reglas describen lo que la guarda hace con las skills
- Depends on: Task 28 — y los avisos que los hooks dan tras escribir
- Serves: R30, R34, R35

**Interfaces:**

`plugins/aether/skills/using-aether/SKILL.md` (el bootstrap, que se entrega en partes de a lo más 9.800 caracteres; se sigue dividiendo por encabezados de sección) gana, en su estilo de reglas cortas y con estas expresiones literales:

- **Skills.** El Lead crea skills para los agentes por su cuenta (cuando un error se repite, cuando el proyecto tiene un método propio, cuando el dueño lo pide): las de proyecto en `.agents/skills/` sin pedir permiso y las cuenta en el brief; las permanentes en `~/.agents/skills/` esperan el sí del dueño (clase `skill-install`). No edita una skill de Aether ni una bajada: la copia con otro nombre a `.agents/skills/`. Solo el Lead busca y baja (`aether:skills`); de un autor de la lista de confianza baja sin preguntar, y lo demás (`-g`, un autor fuera de la lista, una fuente sin autor) espera el sí. Elige hasta 3 skills por tarea con el campo `Skills:` de `tasks.md` o la línea `AETHER-SKILLS:` del encargo. Cuando un hook le avisa de un hallazgo repetido o de una skill sin uso, lo considera. Carga `aether:skills` antes de buscar, bajar o crear una.
- **Continuidad.** El aviso de arranque de 3 a 5 líneas dice dónde se quedó el trabajo; si dice que la sesión anterior se cortó, ofrece `claude --resume <id>` al dueño; no escribe el estado de una versión en la memoria de Claude, porque la nota de continuidad lo guarda sola.
- **Orden del proyecto.** `AGENTS.md` es el mapa y `CLAUDE.md` es `@AGENTS.md` más lo que es solo de Claude; si el aviso de arranque nombra desorden, ofrece `aether:tidy` y no mueve ni borra nada sin el sí del dueño.
- **Rutas.** Los lugares de `.aether/` que el texto actual nombra pasan a los nuevos: `.aether/tmp/` en lugar de `.aether-tmp/` y `.aether/exam/` en lugar de `.aether-exam/`, y se agrega que `.aether/README.md` es el mapa.
- Una feature visual: el Writer escribe `art-direction.md` antes del plan (una línea; la regla es de la skill `plan` y del Writer).
- **Herramientas (issue #187, palabras del dueño: «no puede vovler a pasar que el lead no trabje con todas sus herramientas que se necesita»).** Una sección nueva `## Tools` del bootstrap, en inglés como el resto: al empezar una sesión, y antes de cualquier diseño o corrida autónoma, el Lead comprueba que tiene todas las herramientas que el método necesita, `Workflow` primero (`/aether:design` y `/aether:run`) y `Agent` (las tareas delegadas); si falta una, se lo dice al dueño en su primera respuesta («first reply»), en palabras simples y antes de cualquier plan («before any plan»), con el arreglo (Dynamic workflows en `/config` y una sesión nueva; una corrida se retoma desde su diario), y espera su respuesta («wait for the owner's answer») en lugar de planear alrededor. La frase actual del punto `failed` de «Designing» («When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session.») se cambia por un remite corto a «Tools». En `plugins/aether/skills/swarm/SKILL.md`, el punto **Workflows** deja de ofrecer construir tarea por tarea mientras tanto: dice que el Lead avisa como dice «Tools» de `using-aether`, espera la respuesta del dueño, y solo si el dueño lo pide construye el plan tarea por tarea con delegados. `tests/roles.test.js:50` fija esa línea palabra por palabra: la tarea reescribe solo la constante `workflows` de esa prueba con el texto nuevo y conserva el orden que comprueba `:55` (Workflows antes de Lanes).

`CLAUDE.md` cambia solo si esta tarea agrega `--part 6` a `hooks/hooks.json`: entonces su frase «`--part 1` to `--part 5`» pasa a nombrar las seis partes.

**Tests (write first):**

`tests/using-aether-030.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const { bootstrapParts, PART_LIMIT } = require('../plugins/aether/lib/session-start.js')

const text = fs.readFileSync(path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md'), 'utf8')

test('the rules tell the Lead how to handle skills, continuity and the order of a project (R30, R34, C11)', () => {
  for (const token of ['aether:skills', 'aether:tidy', 'aether:art-direction', 'skill-install', '.agents/skills/', '~/.agents/skills/', 'AETHER-SKILLS:', 'Skills:', 'claude --resume', 'AGENTS.md', '@AGENTS.md', 'art-direction.md', '.aether/README.md', '.aether/tmp/', '.aether/exam/']) {
    assert.ok(text.includes(token), `the rules name ${token}`)
  }
  assert.ok(!text.includes('.aether-tmp') && !text.includes('.aether-exam'), 'the old folders are not named as the places to use')
  assert.ok(!/onboard/i.test(text))
})

test('the Lead checks its tools first and waits for the owner when one is missing (issue 187)', () => {
  const tools = text.split(/\n(?=## )/).find((section) => section.startsWith('## Tools'))
  assert.ok(tools, 'the bootstrap has a ## Tools section')
  for (const token of ['`Workflow`', '`Agent`', 'first reply', 'before any plan', "wait for the owner's answer", '/config', 'new session']) {
    assert.ok(tools.includes(token), `the Tools section names ${token}`)
  }
  assert.ok(!text.includes('When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session.'), 'the old footnote sentence is gone')
  const swarm = fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')
  assert.ok(!swarm.includes('offer to build it meanwhile task by task'), 'the swarm skill no longer plans around a missing Workflow tool')
  assert.ok(/Tools/.test(swarm) && /using-aether/.test(swarm), 'the swarm skill points at the Tools rule')
})

test('the bootstrap goes in as many parts as hooks.json has commands for, each whole output within the limit, also from a long install path (R44)', () => {
  const root = path.join('/', 'x'.repeat(400), 'plugins', 'aether')
  const parts = bootstrapParts(root)
  const { PART_COMMANDS } = require('./helpers.js')
  assert.ok(parts.length >= 1 && parts.length <= PART_COMMANDS.length, `${parts.length} parts for ${PART_COMMANDS.length} commands`)
  for (const part of parts) assert.ok(part.output.length <= PART_LIMIT, `part of ${part.output.length} characters`)
})
```

**Cuántas partes.** La tarea mide el bootstrap con `tests/session-start-parts.test.js` (el tamaño de cada parte contra 9.800 caracteres, también desde una ruta de instalación de 400). Si las reglas nuevas caben en cinco partes, no toca `hooks.json`. Si no caben, esta tarea también agrega la entrada `node "${CLAUDE_PLUGIN_ROOT}/bin/aether-session-start" --part 6` a `hooks/hooks.json`, y ajusta lo que cuenta las partes (el encabezado `Aether mode, part k of n.`, `tests/session-start-parts.test.js` y `tests/helpers.js` leen las órdenes de `hooks.json`), y deja dicho en su informe que `docs/reference/components.md` («k from 1 to 5») lo corrige la tarea 37. `tests/copies-classes.test.js` (la tabla de clases de la skill sigue igual que `CLASSES`) pasa.

**Acceptance:**

- `node --test tests/using-aether-030.test.js tests/session-start-parts.test.js tests/copies-classes.test.js` pasa y `npm test` completo pasa.
- Ninguna parte pasa de 9.800 caracteres, y hay una orden `--part k` en `hooks.json` por cada parte que el bootstrap tiene (cinco, o seis si hizo falta).

---

### Task 31: Detectar el desorden de un proyecto

**Aether:**
- Area: tidy
- Owns: `plugins/aether/lib/tidy-detect.js`, `tests/tidy-detect.test.js`
- Depends on: Task 30 — la historia H4 empieza cuando H3 está fusionada
- Depends on: Task 9 — reusa `checkProjectFiles` y `findingText` de `lib/tree-check.js`
- Depends on: Task 20 — reusa `computedHash` de `lib/skill-registry.js`
- Serves: R36

**Interfaces:**

En `plugins/aether/lib/tidy-detect.js` (`// Family: tidy.`):

- `OLD_CLI_NAMES = ['aether.db', 'aether.db-wal', 'aether.db-shm', 'project.toml', 'CONTEXT.md', 'objective-contracts', 'drafts', 'locks']` y `OLD_CLI_PATTERNS = [/\.draft\.md$/, /\.lock$/]`: los restos del CLI viejo `aether` (Python/Hermes) que están directamente dentro de `<raíz>/.aether/`.
- `oldCliLeftovers(root)` devuelve los nombres (relativos a `.aether/`, en orden alfabético) de lo que hay en `<root>/.aether/` y coincide con esa lista; `[]` si no hay `.aether/`.
- `duplicateSkills(root, { home = os.homedir() })` devuelve `[{ name, paths, by }]`: las skills duplicadas dentro del proyecto (`.agents/skills/*` y `.claude/skills/*`, un enlace a la misma carpeta real cuenta una vez) y entre el proyecto y las carpetas personales (`<home>/.agents/skills/*`, `<home>/.claude/skills/*`): `by: 'name'` cuando dos carpetas reales distintas tienen el mismo nombre, y `by: 'hash'` cuando tienen la misma huella `computedHash` con nombres distintos (`name` es entonces los nombres unidos por `=`).
- `detect(root, { home = os.homedir() })` devuelve `{ findings }`, con un hallazgo `{ kind, count, items }` por cada clase con `count > 0`, en este orden: `claude-no-import` (`items: ['CLAUDE.md']`), `too-long` (`items`: `CLAUDE.md (<n> lines)` y `AGENTS.md (<n> lines)`; `count` es cuántos), `old-cli` (`items`: los nombres), `duplicate-skills` (`items`: `<nombre>: <ruta1> = <ruta2>`). Usa `checkProjectFiles(root)` de `lib/tree-check.js` para las dos primeras. Nunca lanza y solo lee.
- `noticeLines(findings, { spanish })` devuelve las líneas del aviso de arranque, de a lo más 5 y vacío sin hallazgos: una línea por clase con su cuenta y, al final, una que nombra `aether:tidy`. Inglés: `Tidy: CLAUDE.md does not import AGENTS.md.`, `Tidy: CLAUDE.md or AGENTS.md over 200 lines: <n>.`, `Tidy: leftovers of the old aether CLI in .aether/: <n>.`, `Tidy: duplicate skills: <n>.` y la última `Run aether:tidy to order this: it first reports what it would move or delete, and nothing changes without the owner's yes.` Español: `Orden: CLAUDE.md no importa a AGENTS.md.`, `Orden: CLAUDE.md o AGENTS.md de más de 200 líneas: <n>.`, `Orden: restos del CLI viejo aether en .aether/: <n>.`, `Orden: skills duplicadas: <n>.` y la última `Corre aether:tidy para ordenarlo: primero informa lo que movería o borraría, y nada cambia sin el sí del dueño.`

**Tests (write first):**

`tests/tidy-detect.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const detect = require('../plugins/aether/lib/tidy-detect.js')

const put = (file, text = 'x\n') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
const skill = (root, where, name, body = 'rules\n') => put(path.join(root, where, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n${body}`)

test('a clean project has no finding and no notice (C13)', (t) => {
  const root = tempDir(t)
  put(path.join(root, 'AGENTS.md'), lines(50))
  put(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n')
  assert.deepEqual(detect.detect(root, { home: tempDir(t) }), { findings: [] })
  assert.deepEqual(detect.noticeLines([], { spanish: false }), [])
})

test('each disorder is found with its count: a CLAUDE.md that does not import, files over 200 lines, leftovers of the old CLI and duplicate skills (C13, H4 scenario 27)', (t) => {
  const root = tempDir(t)
  const home = tempDir(t)
  put(path.join(root, 'AGENTS.md'), lines(1543))
  put(path.join(root, 'CLAUDE.md'), lines(250))
  for (const name of ['aether.db', 'project.toml', 'CONTEXT.md', 'run.draft.md', 'x.lock']) put(path.join(root, '.aether', name))
  put(path.join(root, '.aether', 'objective-contracts', 'a.json'))
  for (const name of ['README.md', 'runs', 'worktrees']) put(path.join(root, '.aether', name, 'keep'))
  skill(root, '.agents/skills', 'erebus-ui')
  skill(home, '.agents/skills', 'erebus-ui', 'other rules\n')
  skill(root, '.agents/skills', 'twin-a', 'same\n')
  skill(root, '.claude/skills', 'twin-b', 'same\n')
  const { findings } = detect.detect(root, { home })
  assert.deepEqual(findings.map((f) => [f.kind, f.count]), [['claude-no-import', 1], ['too-long', 2], ['old-cli', 6], ['duplicate-skills', 2]])
  assert.deepEqual(findings[1].items, ['CLAUDE.md (250 lines)', 'AGENTS.md (1543 lines)'])
  assert.deepEqual(detect.oldCliLeftovers(root), ['CONTEXT.md', 'aether.db', 'objective-contracts', 'project.toml', 'run.draft.md', 'x.lock'])
  assert.ok(findings[3].items.some((i) => i.startsWith('erebus-ui: ')))
  assert.ok(findings[3].items.some((i) => i.startsWith('twin-a=twin-b: ') || i.startsWith('twin-b=twin-a: ')))
})

test('a skill linked from .claude/skills/ to .agents/skills/ is one skill, not a duplicate (C13)', (t) => {
  const root = tempDir(t)
  skill(root, '.agents/skills', 'mine')
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(root, '.agents', 'skills', 'mine'), path.join(root, '.claude', 'skills', 'mine'))
  assert.deepEqual(detect.duplicateSkills(root, { home: tempDir(t) }), [])
})

test('the notice has one line per disorder with its count, names aether:tidy and keeps within 5 lines, in both languages (R36)', (t) => {
  const findings = [{ kind: 'claude-no-import', count: 1, items: ['CLAUDE.md'] }, { kind: 'too-long', count: 2, items: [] }, { kind: 'old-cli', count: 6, items: [] }, { kind: 'duplicate-skills', count: 2, items: [] }]
  assert.deepEqual(detect.noticeLines(findings, { spanish: false }), [
    'Tidy: CLAUDE.md does not import AGENTS.md.',
    'Tidy: CLAUDE.md or AGENTS.md over 200 lines: 2.',
    'Tidy: leftovers of the old aether CLI in .aether/: 6.',
    'Tidy: duplicate skills: 2.',
    "Run aether:tidy to order this: it first reports what it would move or delete, and nothing changes without the owner's yes.",
  ])
  const es = detect.noticeLines(findings.slice(0, 1), { spanish: true })
  assert.deepEqual(es, ['Orden: CLAUDE.md no importa a AGENTS.md.', 'Corre aether:tidy para ordenarlo: primero informa lo que movería o borraría, y nada cambia sin el sí del dueño.'])
  assert.ok(t)
})

test('a folder that does not exist or cannot be read gives no finding and does not throw', (t) => {
  assert.deepEqual(detect.detect(path.join(tempDir(t), 'missing'), { home: tempDir(t) }), { findings: [] })
  assert.deepEqual(detect.oldCliLeftovers(path.join(tempDir(t), 'missing')), [])
})
```

**Acceptance:**

- `node --test tests/tidy-detect.test.js` pasa y `npm test` completo pasa.
- El detector solo lee, y no cuenta como desorden nada del diseño nuevo de `.aether/` (`README.md`, `runs/`, `worktrees/`, …).

---

### Task 32: Entregar el informe de `aether:tidy` con `aether-doctor tidy`

**Aether:**
- Area: tidy
- Owns: `plugins/aether/lib/tidy-report.js`, `plugins/aether/bin/aether-doctor`, `tests/tidy-report.test.js`
- Depends on: Task 31 — usa el detector
- Depends on: Task 14 — y `LAYOUT_NAMES` para hallar lo suelto de `.aether/`
- Serves: R37, R39

**Interfaces:**

En `plugins/aether/lib/tidy-report.js` (`// Family: tidy.`):

- `report(roots, { home = os.homedir() })` devuelve `{ projects, stray, crossDuplicates }`, sin escribir nada:
  - `projects`: un `{ path, findings, actions }` por raíz. `actions` son `{ action, path, to?, why }` con `action` `edit`, `move` o `delete`: `edit` de `CLAUDE.md` (`add the line @AGENTS.md`) por `claude-no-import`, `edit` por `too-long` (`split it: keep AGENTS.md a map`), `delete` de cada resto del CLI viejo (`leftover of the old aether CLI`), `move` de cada carpeta vieja (`.aether/lanes` → `.aether/worktrees/lanes`, `.aether/exams` → `.aether/worktrees/exams`, `.aether/seats` → `.aether/work/seats`, `.aether/delegates` → `.aether/work/delegates`, `.aether-tmp` → `.aether/tmp`, `.aether-exam` → `.aether/exam`) y `delete` de la copia de una skill duplicada que no es la primera (`duplicate of <ruta>; keep one`). Las rutas son relativas a la raíz del proyecto.
  - `stray`: `[{ project, path }]` con lo que hay directamente en `<proyecto>/.aether/` y no está en `LAYOUT_NAMES` de `lib/tree-map.js` ni es un resto del CLI viejo (en este repositorio, los tres comprimidos del experimento del #125 y `runs-local/`).
  - `crossDuplicates`: `[{ name, projects }]`: las skills de proyecto que están en más de una de las raíces, por nombre o por huella.
- `projectsIn(folder)` devuelve las subcarpetas inmediatas de `folder` que no empiezan por `.`, en orden alfabético.

`bin/aether-doctor`: gana el verbo `tidy`. `aether-doctor tidy [--projects <carpeta>] [<proyecto>...]` imprime una línea JSON `{ "tidy": { projects, stray, crossDuplicates } }`, sale con 0 y **no escribe nada**; sin argumentos informa del directorio actual; con `--projects` informa de cada subcarpeta (`projectsIn`); una ruta que no es una carpeta imprime `{ "error": … }` y sale con 2. La cabecera del bin gana la línea `// aether-doctor tidy [--projects <folder>] [<project>...]`. El resto de `aether-doctor` (`--name`) no cambia.

**Tests (write first):**

`tests/tidy-report.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const { report, projectsIn } = require('../plugins/aether/lib/tidy-report.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-doctor')
const put = (file, text = 'x\n') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
const skill = (root, name) => put(path.join(root, '.agents', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nrules\n`)

// A folder with three projects: A is untidy, B shares a skill with A, C is clean.
function projects(t) {
  const folder = tempDir(t, 'aether-projects-')
  const a = path.join(folder, 'a')
  put(path.join(a, 'AGENTS.md'), lines(161))
  put(path.join(a, 'CLAUDE.md'), lines(74))
  put(path.join(a, '.aether', 'aether.db'))
  put(path.join(a, '.aether', 'seats', 'judge-1', 'pair.json'))
  put(path.join(a, '.aether', 'experiment-125.tar.gz'))
  put(path.join(a, '.aether', 'runs-local', 'x.txt'))
  put(path.join(a, '.aether-tmp', 'old.md'))
  skill(a, 'erebus-ui')
  put(path.join(folder, 'b', 'AGENTS.md'), lines(10))
  skill(path.join(folder, 'b'), 'erebus-ui')
  put(path.join(folder, 'c', 'AGENTS.md'), lines(10))
  put(path.join(folder, 'c', 'CLAUDE.md'), '@AGENTS.md\n')
  return { folder, a, b: path.join(folder, 'b'), c: path.join(folder, 'c') }
}
// A listing of every file with its size, its time and a digest of its content, to compare before and after.
function snapshot(root) {
  return fs.readdirSync(root, { recursive: true }).sort().map((entry) => {
    const full = path.join(root, entry)
    const stat = fs.lstatSync(full)
    return [entry, stat.isFile() ? stat.size : 'dir', stat.mtimeMs, stat.isFile() ? crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex') : '']
  })
}

test('the report lists, for each project, what would move, be deleted or edited, the loose files and the skills repeated between projects (C13, R37, R39)', (t) => {
  const p = projects(t)
  const home = tempDir(t)
  const out = report([p.a, p.b, p.c], { home })
  const a = out.projects.find((x) => x.path === p.a)
  const has = (action, file, to) => a.actions.some((x) => x.action === action && x.path === file && (to === undefined || x.to === to))
  assert.ok(has('edit', 'CLAUDE.md'))
  assert.ok(has('delete', path.join('.aether', 'aether.db')))
  assert.ok(has('move', path.join('.aether', 'seats'), path.join('.aether', 'work', 'seats')))
  assert.ok(has('move', '.aether-tmp', path.join('.aether', 'tmp')))
  assert.deepEqual(out.projects.find((x) => x.path === p.c).actions, [])
  assert.deepEqual(out.stray.map((s) => [s.project, s.path]).sort(), [[p.a, path.join('.aether', 'experiment-125.tar.gz')], [p.a, path.join('.aether', 'runs-local')]].sort())
  assert.deepEqual(out.crossDuplicates.map((d) => [d.name, d.projects.sort()]), [['erebus-ui', [p.a, p.b].sort()]])
})

test('projectsIn lists the folders of a directory, without hidden ones and in order (R39)', (t) => {
  const p = projects(t)
  fs.mkdirSync(path.join(p.folder, '.hidden'))
  put(path.join(p.folder, 'file.txt'))
  assert.deepEqual(projectsIn(p.folder), [p.a, p.b, p.c])
})

test('aether-doctor tidy prints one JSON line, changes nothing and leaves the tree and git status identical (R37, R39)', (t) => {
  const p = projects(t)
  const home = tempDir(t)
  spawnSync('git', ['init', '-q'], { cwd: p.a })
  const before = snapshot(p.folder)
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: p.a, encoding: 'utf8' }).stdout
  const run = (args) => spawnSync(process.execPath, [BIN, 'tidy', ...args], { cwd: p.folder, encoding: 'utf8', env: { ...process.env, HOME: home } })
  const all = run(['--projects', p.folder])
  assert.equal(all.status, 0, all.stderr)
  assert.deepEqual(JSON.parse(all.stdout).tidy.projects.map((x) => x.path), [p.a, p.b, p.c])
  const one = run([p.a])
  assert.equal(one.status, 0)
  assert.deepEqual(JSON.parse(one.stdout).tidy.projects.map((x) => x.path), [p.a])
  assert.equal(run([path.join(p.folder, 'file-that-is-missing')]).status, 2)
  assert.deepEqual(snapshot(p.folder), before)
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: p.a, encoding: 'utf8' }).stdout, status)
})

test('aether-doctor without tidy still checks the machine as before (R37)', () => {
  const r = spawnSync(process.execPath, [BIN, '--name', 'claude'], { encoding: 'utf8' })
  assert.ok(JSON.parse(r.stdout.trim().split('\n').pop()))
})
```

**Acceptance:**

- `node --test tests/tidy-report.test.js tests/doctor.test.js` pasa y `npm test` completo pasa (`tests/commands.test.js` pide un llamador de `aether-doctor tidy`: la tarea 34 lo da en la skill `tidy`; si falla hasta entonces, queda anotado en el informe).
- El informe no escribe nada: el árbol y el `git status` son idénticos antes y después.

---

### Task 33: Frenar en la guarda los borrados que `aether:tidy` ordena

**Aether:**
- Review: xhigh — es la guarda que impide borrar o mover archivos del dueño sin su sí
- Area: guard
- Owns: `plugins/aether/lib/tidy-guard.js`, `plugins/aether/lib/guard.js`, `tests/guard-tidy.test.js`
- Depends on: Task 26 — extiende `guard.js` después de esa tarea
- Depends on: Task 31 — usa la lista de restos del CLI viejo (`OLD_CLI_NAMES`, `OLD_CLI_PATTERNS`)
- Serves: R38

**Interfaces:**

En `plugins/aether/lib/tidy-guard.js` (`// Family: tidy.`):

- `tidyTargets(command, { cwd, home = os.homedir() })` devuelve las rutas que `rm`, `mv`, `git rm`, `git mv`, `rmdir` o `unlink` (con cualquier opción, también tras `sudo`, `env` y `nohup` y dentro de `bash -c`/`eval`, con el mismo análisis de líneas que ya usa la guarda) nombran y que son archivos que `aether:tidy` ordena: los restos del CLI viejo directamente dentro de `.aether/` (`OLD_CLI_NAMES` y `OLD_CLI_PATTERNS`), cualquier `CLAUDE.md` o `AGENTS.md`, y las carpetas de skills o lo que hay dentro de `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/` y `~/.agents/skills/` (con `~`, `$HOME`, `${HOME}` o ruta absoluta). Una ruta que no es de esa lista (`notes`, `src/a.js`, `.aether/runs`) no cuenta; `cp`, `ls`, `cat` y `git status` no cuentan.
- `emptiesTidyFile(input)` es `true` cuando `input.tool_name` es `Write` y el archivo (por su nombre base) es `CLAUDE.md` o `AGENTS.md` y `tool_input.content` es vacío o solo espacio.

En `plugins/aether/lib/guard.js`: `irreversibleClasses(command, cwd, env)` agrega `delete` cuando `tidyTargets` no es vacío (la regla de hoy, `rm` con `-r` y `-f` sobre un destino riesgoso, no cambia: `tests/guard.test.js:414-417` sigue pasando porque `notes` no está en la lista), y `decide(input, env)` trata un Write que deja vacío `CLAUDE.md` o `AGENTS.md` como la clase `delete` con la misma lógica compartida de anotar y rechazar sin permiso que la tarea 26 dejó (el permiso `delete` del dueño o `AETHER_IRREVERSIBLE` distinto de `enforce` lo deja pasar, como en las demás clases).

**Tests (write first):**

`tests/guard-tidy.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir } = require('./helpers.js')
const { decide, decideBash, irreversibleClasses } = require('../plugins/aether/lib/guard.js')
const { tidyTargets, emptiesTidyFile } = require('../plugins/aether/lib/tidy-guard.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const human = (text, time) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  useDataDir(t)
  const configDir = tempDir(t, 'aether-claude-')
  const previous = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR }
  process.env.HOME = home
  process.env.CLAUDE_CONFIG_DIR = configDir
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  const enforce = { ...process.env, AETHER_IRREVERSIBLE: 'enforce' }
  const bash = (command) => decideBash({ cwd: repo.dir, session_id: 's1', tool_name: 'Bash', tool_input: { command } }, enforce)
  const write = (file, content) => decide({ cwd: repo.dir, session_id: 's1', tool_name: 'Write', tool_input: { file_path: file, content } }, enforce)
  const allow = (quote) => {
    const dir = path.join(configDir, 'projects', '-p')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 's1.jsonl'), human(quote, '2026-11-07T10:00:00.000Z') + '\n')
    return autonomy.grant(repo.dir, { class: 'delete', quote, session: 's1', scope: 'session' }, { configDir })
  }
  return { repo, home, enforce, bash, write, allow, opts: { cwd: repo.dir, home } }
}

test('rm, mv, git rm, git mv, rmdir and unlink on the files aether:tidy orders are named; other paths and other commands are not (C13, R38)', (t) => {
  const w = world(t)
  const named = (command) => tidyTargets(command, w.opts)
  for (const command of [
    'rm .aether/aether.db', 'rm -rf .aether/objective-contracts', 'rm .aether/project.toml .aether/CONTEXT.md', 'rm .aether/run.draft.md',
    'git rm CLAUDE.md', 'git mv AGENTS.md docs/AGENTS.md', 'mv CLAUDE.md CLAUDE.old', 'rm sub/AGENTS.md',
    'rm -r .agents/skills/x', 'rmdir .claude/skills/x', 'unlink .claude/skills/x', 'rm -r ~/.agents/skills/x', `mv ${path.join(w.home, '.claude', 'skills', 'x')} /tmp/x`, 'rm -rf $HOME/.claude/skills/old', 'sudo rm CLAUDE.md', 'bash -c "rm AGENTS.md"',
  ]) assert.ok(named(command).length > 0, command)
  for (const command of ['rm -r notes', 'rm -f notes', 'rm src/a.js', 'rm -rf .aether/runs', 'cp CLAUDE.md x', 'ls CLAUDE.md', 'cat AGENTS.md', 'git status', 'git rm src/a.js', 'echo CLAUDE.md']) assert.deepEqual(named(command), [], command)
})

test('the guard classes them as delete: held without the owner permission, recorded and allowed with it, and the rule of today does not change (C13, R38, H4 scenario 29)', (t) => {
  const w = world(t)
  assert.deepEqual(irreversibleClasses('rm .aether/aether.db', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('git mv AGENTS.md docs/AGENTS.md', w.repo.dir, w.enforce), ['delete'])
  assert.deepEqual(irreversibleClasses('rm -r notes', w.repo.dir, w.enforce), [])
  assert.deepEqual(irreversibleClasses('rm -f notes', w.repo.dir, w.enforce), [])
  assert.deepEqual(irreversibleClasses('rm -rf ~', w.repo.dir, w.enforce), ['delete'], 'a risky target is still delete')
  const held = w.bash('mv CLAUDE.md CLAUDE.old')
  assert.ok(held && held.reason.includes('delete'))
  assert.deepEqual(readPending(w.repo.dir).map((e) => e.class), ['delete'])
  assert.equal(w.allow('apruebo borrar y mover estos archivos de orden que me muestres en la lista').ok, true)
  assert.equal(w.bash('mv CLAUDE.md CLAUDE.old'), null)
})

test('without the permission nothing is moved or deleted by the guard: only a report is possible (C13, R38)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'CLAUDE.md'), 'rules\n')
  for (const command of ['rm CLAUDE.md', 'git rm CLAUDE.md', 'mv CLAUDE.md x', 'unlink CLAUDE.md']) assert.ok(w.bash(command), command)
  assert.equal(readPending(w.repo.dir).length, 4)
  assert.equal(w.bash('aether-doctor tidy'), null)
  assert.equal(w.bash('cat CLAUDE.md'), null)
})

test('a Write that leaves CLAUDE.md or AGENTS.md empty is a delete; one with content is not (C13, R38)', (t) => {
  const w = world(t)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/CLAUDE.md', content: '  \n' } }), true)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/AGENTS.md', content: '' } }), true)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/AGENTS.md', content: '@x' } }), false)
  assert.equal(emptiesTidyFile({ tool_name: 'Write', tool_input: { file_path: '/p/README.md', content: '' } }), false)
  assert.equal(emptiesTidyFile({ tool_name: 'Edit', tool_input: { file_path: '/p/CLAUDE.md', content: '' } }), false)
  const held = w.write(path.join(w.repo.dir, 'CLAUDE.md'), '')
  assert.ok(held && held.reason.includes('delete'))
  assert.equal(w.write(path.join(w.repo.dir, 'CLAUDE.md'), '@AGENTS.md\n'), null)
  assert.equal(w.write(path.join(w.repo.dir, 'notes.md'), ''), null)
})
```

**Acceptance:**

- `node --test tests/guard-tidy.test.js tests/guard.test.js tests/copies-classes.test.js` pasa; `npm test` completo pasa.
- Sin el permiso `delete` del dueño, esos borrados y movimientos quedan en `.aether/pending.jsonl` y se rechazan bajo `enforce`; con un `rm -r notes` nada cambia.

---

### Task 34: Escribir la skill `aether:tidy`

**Aether:**
- Area: skills-docs
- Owns: `plugins/aether/skills/tidy/SKILL.md`, `plugins/aether/skills/help/SKILL.md`, `tests/tidy-skill.test.js`, `tests/help.test.js`
- Depends on: Task 32 — la skill corre `aether-doctor tidy`
- Depends on: Task 33 — y cuenta que la guarda frena lo que no está en la lista aprobada
- Serves: R37

**Interfaces:**

- `plugins/aether/skills/tidy/SKILL.md`: front matter `name: tidy`, `description` de a lo más 200 caracteres que dice que ordena un proyecto y que solo informa sin el sí del dueño, `argument-hint: "[project or folder]"` y `disable-model-invocation: true` (lo invoca la persona con `/aether:tidy`; el Lead lo ofrece cuando el aviso de arranque nombra desorden). En inglés. Dice, con estas expresiones literales: corre `aether-doctor tidy` (con `--projects <carpeta>` para una carpeta de proyectos, sobre la que también busca skills duplicadas entre proyectos); muestra al dueño la lista de lo que movería o borraría por proyecto, con las reglas que la sostienen (`AGENTS.md` es el mapa y `CLAUDE.md` es `@AGENTS.md` más lo solo de Claude, `.aether/README.md` es el mapa de `.aether/`, los cuatro tipos de skill); pide el sí del dueño a una lista, y aplica **solo** esa lista, con `git mv`, `git rm` o `mv` y `rm` (la guarda frena cualquier otro borrado o movimiento de esos archivos, y el sí se registra con `aether-autonomy grant --class delete` con sus palabras); no toca los restos del CLI viejo sin ese sí; no mueve `.aether/` (eso lo hace la migración del arranque); y termina diciendo qué cambió.
- `plugins/aether/skills/help/SKILL.md` lista `/aether:tidy` (una línea, con la descripción de qué hace, en el estilo de las demás entradas) y sigue sin nombrar `onboard`.
- `tests/help.test.js`: `tidy` ya sale como skill que la persona invoca y debe estar en la ayuda; no se agrega a `EXCLUDED`.

**Tests (write first):**

`tests/tidy-skill.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const text = fs.readFileSync(path.join(PLUGIN, 'skills', 'tidy', 'SKILL.md'), 'utf8')
const help = fs.readFileSync(path.join(PLUGIN, 'skills', 'help', 'SKILL.md'), 'utf8')

test('the cover of aether:tidy is that of a skill the person invokes (R37)', () => {
  const front = Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(text)[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim().replace(/^"|"$/g, '')]))
  assert.equal(front.name, 'tidy')
  assert.ok(front.description.length > 0 && front.description.length <= 200)
  assert.equal(front['argument-hint'], '[project or folder]')
  assert.equal(front['disable-model-invocation'], 'true')
})

test('it reports first with aether-doctor tidy, asks the yes to a list and applies only that list (C13, R37, H4 scenarios 28 and 29)', () => {
  for (const token of ['aether-doctor tidy', '--projects', 'aether-autonomy grant --class delete', 'git mv', 'git rm', '@AGENTS.md', '.aether/README.md', 'skills-lock.json']) assert.ok(text.includes(token), token)
  const lower = text.toLowerCase()
  for (const phrase of ['only the list', 'without the owner', 'old aether cli', 'duplicate']) assert.ok(lower.includes(phrase), phrase)
  assert.ok(!/onboard/i.test(text))
})

test('the help lists /aether:tidy and nothing about onboard (R37, R10)', () => {
  assert.ok(help.includes('/aether:tidy'))
  assert.ok(!/onboard/i.test(help))
})
```

**Acceptance:**

- `node --test tests/tidy-skill.test.js tests/help.test.js tests/commands.test.js` pasa; `npm test` y `npm run validate` completos pasan.
- `tests/commands.test.js` encuentra la skill `tidy` como llamador concreto de `aether-doctor tidy`.

---

### Task 35: Avisar al arrancar de las skills sin uso y del desorden

**Aether:**
- Area: session
- Owns: `plugins/aether/lib/session-start.js`, `tests/session-start-tidy.test.js`
- Depends on: Task 27 — usa `idleSkills` e `idleLine`
- Depends on: Task 31 — y `detect` y `noticeLines`
- Depends on: Task 17 — extiende el arranque que esa tarea ordena
- Serves: R33, R36

**Interfaces:**

En `plugins/aether/lib/session-start.js`, en un arranque del Lead con `source` `startup` o `clear` (no en `compact`), después de las notas actuales y del aviso de continuidad, se agregan al `additionalContext` (no al `systemMessage`) las líneas de `noticeLines(detect(<raíz de la copia de trabajo>, { home }).findings, { spanish })` (R36) y la de `idleLine(idleSkills(dataDir, { repo: mainRoot, now }).map((s) => s.name), { spanish })` (R33), cada una solo cuando no está vacía. Fuera de git se usa `cwd` para el detector y no hay skills sin uso. Si el `additionalContext` entero pasa de `PART_LIMIT`, se quitan primero las líneas de desorden y de skills sin uso (nunca el aviso de continuidad). Un error de cualquiera no detiene el arranque.

**Tests (write first):**

`tests/session-start-tidy.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { PART_LIMIT } = require('../plugins/aether/lib/session-start.js')

const put = (file, text = 'x\n') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const home = tempDir(t, 'aether-home-')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, HOME: home, LANG: 'en_US.UTF-8' }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'CLAUDE_ENV_FILE']) delete env[key]
  const start = (source, agent = 'aether:lead') => {
    const input = { hook_event_name: 'SessionStart', session_id: 's1', source, ...(agent ? { agent_type: agent } : {}) }
    const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, input: JSON.stringify(input), encoding: 'utf8', env })
    return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null }
  }
  return { repo, data, home, start }
}

test('a project with leftovers of the old CLI and a CLAUDE.md that does not import AGENTS.md gets a short notice that names aether:tidy (C13, H4 scenario 27)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), 'claude only\n')
  put(path.join(w.repo.dir, '.aether', 'aether.db'))
  put(path.join(w.repo.dir, '.aether', 'project.toml'))
  const { status, out } = w.start('startup')
  assert.equal(status, 0)
  const context = out.hookSpecificOutput.additionalContext
  assert.ok(context.includes('Tidy: CLAUDE.md does not import AGENTS.md.'))
  assert.ok(context.includes('Tidy: leftovers of the old aether CLI in .aether/: 2.'))
  assert.ok(context.includes('Run aether:tidy to order this'))
  assert.ok(!out.systemMessage.includes('Tidy:'), 'the person sees the continuity notice, not this one')
  assert.equal(w.start('clear').out.hookSpecificOutput.additionalContext.includes('Run aether:tidy'), true)
  assert.equal(w.start('compact').out.hookSpecificOutput.additionalContext.includes('Run aether:tidy'), false)
})

test('a tidy project gets no notice (R36)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, 'AGENTS.md'), 'map\n')
  put(path.join(w.repo.dir, 'CLAUDE.md'), '@AGENTS.md\n')
  assert.ok(!w.start('startup').out.hookSpecificOutput.additionalContext.includes('Tidy:'))
})

test('a skill the Lead created more than 30 days ago that no task received is named, with the proposal to remove it, and is not removed (R33, A9, H3 scenario 25)', (t) => {
  const w = world(t)
  const dir = path.join(w.repo.dir, '.agents', 'skills', 'old-method')
  put(path.join(dir, 'SKILL.md'), '---\nname: old-method\ndescription: d\n---\nrules\n')
  put(path.join(w.data, 'skills', 'created.jsonl'), JSON.stringify({ time: Date.now() - 40 * 86400000, session: 'x', repo: w.repo.dir, name: 'old-method', path: dir, type: 'project' }) + '\n')
  const context = w.start('startup').out.hookSpecificOutput.additionalContext
  assert.ok(context.includes("Skills nobody used in 30 days: old-method. Consider removing them, with the owner's yes (aether:skills)."))
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md')), true)
})

test('the notices stay within the limit and never push out the continuity notice (R36, R7)', (t) => {
  const w = world(t)
  for (let i = 0; i < 40; i++) put(path.join(w.repo.dir, '.aether', `old-${i}.lock`))
  const { stdout, out } = w.start('startup')
  assert.ok(stdout.length <= PART_LIMIT, `${stdout.length} characters`)
  assert.ok(out.systemMessage.includes('No earlier session in this project.'))
})

test('a session that is not the Lead prints nothing (R40)', (t) => {
  const w = world(t)
  put(path.join(w.repo.dir, '.aether', 'aether.db'))
  const r = w.start('startup', null)
  assert.deepEqual([r.status, r.stdout], [0, ''])
})
```

**Acceptance:**

- `node --test tests/session-start-tidy.test.js` pasa; las demás pruebas de `session-start*` siguen verdes; `npm test` completo pasa.
- Las líneas de desorden y de skills sin uso salen solo en `startup` y `clear`, y solo al `additionalContext`.

---

### Task 36: Escribir la guía en inglés y en español

**Aether:**
- Area: docs
- Owns: `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md`, `docs/index.md`, `docs/es/index.md`, `tests/docs-facts.test.js`, `tests/project-files-docs.test.js`
- Depends on: Task 30 — la guía describe las reglas que el Lead sigue
- Depends on: Task 34 — y el ordenado
- Depends on: Task 35 — y los avisos de arranque
- Serves: R11, R14, R22, R43

**Interfaces:**

- `docs/guide/project-files-and-skills.md` (inglés) y `docs/es/guias/archivos-skills-y-continuidad.md` (español), con front matter `title`, `description` y `order` entero (como las demás páginas), enlazadas desde `docs/index.md` y `docs/es/index.md`, y agregadas a la lista `PAGES` de `tests/docs-facts.test.js`. Cada una tiene cinco secciones, en este orden: la regla de los archivos (`AGENTS.md` es el mapa que lee cualquier agente; `CLAUDE.md` es la línea `@AGENTS.md` más lo que es solo de Claude; `.claude/rules/` guarda reglas de Claude que cargan según el archivo que toca; el tope de 200 renglones que solo avisa), el mapa de `.aether/` (la tabla de `LAYOUT` de `lib/tree-map.js`: cada carpeta y archivo, quién lo escribe, cuánto dura y que nunca va a git; la limpieza de arranque y la migración que no pierde trabajo), los cuatro tipos de skill (con su lugar, cuáles se editan y cómo se copia una que no se edita, dónde se bajan, la lista de autores de confianza que empieza vacía y la clase `skill-install`, cómo se dan hasta 3 skills a una tarea con `Skills:` y `AETHER-SKILLS:`), la continuidad (la nota de sesión en `memory/continuity/`, qué guarda, que guarda texto de la conversación solo en la máquina del dueño, el aviso de 3 a 5 líneas, `claude --resume <id>`, la poda de 30 días) y el ordenado con `/aether:tidy`. Las dos páginas enlazan a `components.md`, a `autonomy.md` y entre sí.
- El mapa de la guía copia el nombre de cada entrada de `LAYOUT`.

**Tests (write first):**

`tests/project-files-docs.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { LAYOUT } = require('../plugins/aether/lib/tree-map.js')

const ROOT = path.join(__dirname, '..')
const EN = 'docs/guide/project-files-and-skills.md'
const ES = 'docs/es/guias/archivos-skills-y-continuidad.md'
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('both guides exist with their front matter and are linked from their index and listed by the docs test (R43)', () => {
  for (const rel of [EN, ES]) {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(read(rel))[1]
    assert.match(front, /^title: .+$/m, rel)
    assert.match(front, /^description: .+$/m, rel)
    assert.match(front, /^order: \d+$/m, rel)
  }
  assert.ok(read('docs/index.md').includes('guide/project-files-and-skills.md'))
  assert.ok(read('docs/es/index.md').includes('guias/archivos-skills-y-continuidad.md'))
  const facts = read('tests/docs-facts.test.js')
  assert.ok(facts.includes(`'${EN}'`) && facts.includes(`'${ES}'`))
})

test('the guide states the rule of the files, and a test holds it (R11, C5)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    for (const token of ['`AGENTS.md`', '`CLAUDE.md`', '@AGENTS.md', '`.claude/rules/`', '200']) assert.ok(text.includes(token), `${rel} has ${token}`)
  }
  const en = read(EN).toLowerCase()
  assert.ok(en.includes('the map') && en.includes('only claude'))
})

test('the map of .aether/ in the guide names every entry of the map of the code (R14, C6)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    for (const entry of LAYOUT) assert.ok(text.includes(`\`${entry.path}\``), `${rel} names ${entry.path}`)
  }
})

test('the guide gives the four kinds of skill, where they are downloaded, the trust list, continuity and tidy (R22, R43)', () => {
  for (const rel of [EN, ES]) {
    const text = read(rel)
    for (const token of ['`~/.agents/skills/`', '`.agents/skills/`', '`.claude/skills/`', '`skills-lock.json`', '`npx skills add`', '`aether-autonomy trust`', '`skill-install`', '`Skills:`', '`AETHER-SKILLS:`', '`memory/continuity/`', '`claude --resume <id>`', '`/aether:tidy`', '`.aether/README.md`']) {
      assert.ok(text.includes(token), `${rel} has ${token}`)
    }
  }
  assert.ok(read(ES).includes('empieza vacía'))
  assert.ok(read(EN).includes('starts empty'))
})
```

**Acceptance:**

- `node --test tests/project-files-docs.test.js tests/docs-facts.test.js` pasa y `npm test` completo pasa (los enlaces y los anclajes relativos de las dos páginas resuelven, y ningún código `aether-…` fuera de `bin/` aparece sin excepción).
- Ninguna de las dos páginas nombra `onboard`.

---

### Task 37: Poner al día las páginas de rutas y hooks, medir la huella dormida y probar que nada corre fuera del Lead

**Aether:**
- Area: docs
- Owns: `docs/reference/components.md`, `docs/guide/maintenance.md`, `docs/guide/troubleshooting.md`, `docs/guide/observe.md`, `docs/guide/delegates.md`, `docs/guide/autonomy.md`, `docs/guide/design-seats.md`, `docs/methodology.md`, `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md`, `tests/docs-030.test.js`, `tests/dormant-030.test.js`, `tests/components-docs.test.js`, `tests/observe-docs.test.js`, `tests/delegate-docs.test.js`, `tests/lanes-docs.test.js`, `tests/docs-claims.test.js`, `tests/docs-facts.test.js`
- Depends on: Task 36 — la guía ya existe y las páginas la enlazan; comparten `tests/docs-facts.test.js`
- Depends on: Task 7 — comparten `docs/reference/components.md` y las páginas de qué agrega Aether
- Serves: R40, R41, R42, R43, R44

**Interfaces:**

- `docs/reference/components.md`: la tabla «The pieces» gana las filas de las skills `skills`, `art-direction` y `tidy` (`aether:skills`, `aether:art-direction`, `aether:tidy`, con qué hacen y que `tidy` y `skills` no agregan entrada a la lista de skills si fijan `disable-model-invocation`, según corresponda a lo que las skills fijan de verdad), la fila de `aether-continuity` ya existe (tarea 3) y se completa con `posttool` y `permission` y con los manejadores de PostToolUse; la fila de «SessionStart hook» dice que ahora corre también en `resume` y `fork`, abre la nota, avisa y limpia; el párrafo «What Aether adds to a normal session» gana un párrafo con la huella dormida de 0.35.0 **medida** (ver abajo); la lista de clases irreversibles que `components.md` repita incluye `skill-install`; las familias están declaradas (tarea 1).
- Medición de la huella dormida (método que la tabla ya usa: procesos `node` por evento y su costo local, en una sesión que no es del Lead). El delegado corre, con una entrada de una sesión que no es del Lead y un directorio de datos desechable, cada verbo de `aether-continuity` y las seis órdenes de `aether-session-start`, 20 veces cada una, y escribe en `components.md` un párrafo con esta forma, con los números que midió: `Version 0.35.0 adds seven hook entries that run \`aether-continuity\` (Stop, PreCompact, PostCompact, StopFailure, SessionEnd, PostToolUse of Write, Edit, MultiEdit and Bash, and PermissionRequest of the file tools), and SessionStart also runs on fork. In a session that is not the Lead's each one finds no Lead and exits with no output and no file, as tests/dormant-030.test.js proves; measured on <fecha>, on <Node y sistema>, a call took a median of <n> ms (<min> to <max> ms in 20 runs), so one Write adds about <n> ms of process time and a turn about <n> ms. This is a local measurement, not a real session.`
- `docs/guide/maintenance.md` (dónde están los datos: las notas de continuidad en `memory/continuity/` y su poda de 30 días, `.aether/README.md`, el diseño nuevo de `.aether/`, la limpieza por proyecto y su sello, la migración y cuándo se aplaza), `docs/guide/troubleshooting.md` (la clase `skill-install` y su lista en `.aether/pending.jsonl`; qué hacer cuando una sesión muestra `where it is for now`; `claude --resume <id>`; que una guarda rechaza editar skills de Aether o bajadas), `docs/guide/observe.md` (una frase: la nota de continuidad guarda texto de la conversación, en la máquina del dueño, y la observación sigue sin guardarlo), `docs/guide/delegates.md` (la línea `AETHER-SKILLS:` del encargo y que `uses.jsonl` y el registro `launch` anotan las skills), `docs/guide/autonomy.md` (ocho clases, `skill-install` y `aether-autonomy trust`), `docs/guide/design-seats.md` y `docs/methodology.md` (`.aether/exam/` y `.aether/tmp/` en lugar de `.aether-exam/` y `.aether-tmp/`), `docs/what-aether-adds.md` y `docs/es/que-agrega-aether.md` (lo nuevo: la continuidad, el ordenado con `/aether:tidy` y las skills; **no nombran `/aether:onboard`**: solo el changelog y `docs/decisions.md` lo nombran, como historia, C4). `docs/guide/options.md` no cambia: no hay opciones nuevas.

**Tests (write first):**

`tests/dormant-030.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')

const HOOKS = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks
const commands = Object.values(HOOKS).flat().flatMap((group) => group.hooks.map((h) => h.command)).filter((c) => c.includes('aether-continuity') || c.includes('aether-session-start'))
const SOURCES = ['startup', 'resume', 'clear', 'compact', 'fork']

const listing = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).sort() : [])

test('every hook of the feature, in a session that is not the Lead, exits 0, prints nothing and writes nothing (C14, R40)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const home = tempDir(t, 'aether-home-')
  const watched = [repo.dir, data, configDir, home]
  const before = watched.map(listing)
  assert.ok(commands.length >= 13, `${commands.length} commands`)
  for (const command of commands) {
    const args = command.replace(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\//, '').replace(/"/g, '').split(/\s+/)
    for (const source of SOURCES) {
      const input = { hook_event_name: 'X', session_id: 'a-plain-session', source, cwd: repo.dir, reason: 'other', error: 'x', last_assistant_message: 'hello', compact_summary: 's', trigger: 'auto', tool_name: 'Write', tool_input: { file_path: path.join(repo.dir, '.claude', 'skills', 'x', 'SKILL.md'), command: 'npx skills add a/b' } }
      const r = spawnSync(process.execPath, [path.join(PLUGIN, args[0]), ...args.slice(1)], { cwd: repo.dir, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, HOME: home } })
      assert.deepEqual([command, source, r.status, r.stdout], [command, source, 0, ''])
    }
  }
  assert.deepEqual(watched.map(listing), before)
})

test('aether-doctor tidy and aether-autonomy trust act only when called and write nothing on their own (R40)', (t) => {
  const dir = tempDir(t)
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-doctor'), 'tidy', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.deepEqual(listing(dir), [])
})

test('nothing the feature adds calls a model: its modules start no model, harness or lane process (R41)', () => {
  const lib = path.join(PLUGIN, 'lib')
  const files = fs.readdirSync(lib).filter((f) => /^(continuity|tree|skill|tidy)-.*\.js$/.test(f))
  assert.ok(files.length >= 18, files.join(', '))
  for (const file of files) {
    const text = fs.readFileSync(path.join(lib, file), 'utf8')
    assert.ok(!/require\('\.\/(lane|lanes|harness|superdelegation|seats|delegate-run)[^']*'\)/.test(text), `${file} asks for a module that calls a model`)
    assert.ok(!/(spawn|spawnSync|execFile|execFileSync|exec)\(\s*['"`](claude|aether-lane|agy|codex|grok|muse|cursor-agent)\b/.test(text), `${file} starts a harness`)
  }
})
```

`tests/docs-030.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

test('the components page names the new skills, the new bin and the measured dormant footprint of 0.35.0 (R42, R43)', () => {
  const components = read('docs/reference/components.md')
  for (const token of ['`aether:skills`', '`aether:art-direction`', '`aether:tidy`', '`aether-continuity`', '`skill-install`']) assert.ok(components.includes(token), token)
  assert.match(components, /Version 0\.35\.0 adds seven hook entries that run `aether-continuity`[^\n]*median of \d+(\.\d+)? ms/)
  assert.match(components, /tests\/dormant-030\.test\.js/)
})

test('the guides say where things live now and what changed (R43)', () => {
  assert.ok(read('docs/guide/maintenance.md').includes('`.aether/README.md`') && read('docs/guide/maintenance.md').includes('`memory/continuity/`'))
  const troubleshooting = read('docs/guide/troubleshooting.md')
  assert.ok(troubleshooting.includes('`skill-install`') && troubleshooting.includes('where it is for now') && troubleshooting.includes('`claude --resume <id>`'))
  assert.ok(read('docs/guide/observe.md').includes('continuity note'))
  assert.ok(read('docs/guide/delegates.md').includes('`AETHER-SKILLS:`'))
  const autonomy = read('docs/guide/autonomy.md')
  assert.ok(autonomy.includes('`skill-install`') && autonomy.includes('`aether-autonomy trust`'))
  assert.ok(read('docs/guide/design-seats.md').includes('.aether/exam/'))
  for (const rel of ['docs/what-aether-adds.md', 'docs/es/que-agrega-aether.md']) assert.ok(read(rel).includes('/aether:tidy') && !/onboard/i.test(read(rel)), rel)
})

test('no page gives the old folders as the place to use (R15, R43)', () => {
  for (const rel of ['docs/guide/design-seats.md', 'docs/methodology.md', 'docs/guide/maintenance.md', 'docs/what-aether-adds.md', 'docs/es/que-agrega-aether.md']) {
    const text = read(rel).split('\n').filter((line) => /\.aether-(tmp|exam)\//.test(line) && !/(old|older|before|antes|viej)/i.test(line))
    assert.deepEqual(text, [], rel)
  }
})
```

**Acceptance:**

- `node --test tests/dormant-030.test.js tests/docs-030.test.js tests/components-docs.test.js tests/docs-facts.test.js` pasa y `npm test` completo pasa; las pruebas de documentos que fijaban frases que esta tarea cambia se actualizan dentro de `Owns`.
- La huella dormida de 0.35.0 la mide el delegado (20 corridas de cada verbo, números en el párrafo), no la estima.
- `docs/guide/options.md` queda igual.

---

### Task 38: Registrar las decisiones A111 en adelante

**Aether:**
- Area: docs
- Owns: `docs/decisions.md`, `tests/docs-facts.test.js`
- Depends on: Task 37 — comparten `tests/docs-facts.test.js` y las decisiones citan las páginas ya escritas
- Serves: R43

**Interfaces:**

`docs/decisions.md` gana seis filas de la tabla, `A111` a `A116`, en el formato de las anteriores (`| A111 | **<título>.** <cuerpo> |`), en inglés, con las palabras del dueño citadas donde aplica (las de la tarjeta, sección 1) y con estas expresiones literales (cada fila las contiene):

- **A111**, la nota de continuidad: `continuity note`, `memory/continuity/`, `outside the index`, `its own hook entries`, `200 ms`, y la cita «sobre la contuidad es un archivo de memoria no?».
- **A112**, el diseño nuevo de `.aether/` y su migración: `.aether/README.md`, `worktrees/lanes`, `work/seats`, `.aether/tmp/`, `.aether/exam/`, `three conditions`, `git worktree move`, `per project`, `issue #186`.
- **A113**, las skills: `four kinds`, `.agents/skills/`, `trusted authors`, `starts empty`, `skill-install`, `aether-autonomy trust`, `skills.sh`.
- **A114**, las skills de una tarea: `AETHER-SKILLS:`, `Skills:`, `aether-plan compile`, `at most 3`, `uses.jsonl`.
- **A115**, escribir en `.claude`: `PermissionRequest`, `skills/ and rules/`, `settings.json`, `never`, `PreToolUse`.
- **A116**, ordenar y retirar onboard: `aether:tidy`, `delete`, `/aether:onboard`, `retired`, `the automatic note`.

`tests/docs-facts.test.js`: `LAST_DECISION` pasa a `116`, el título de la prueba dice «A50 to A116», y se agregan al final de sus aserciones de decisiones las de cada fila nueva, con las expresiones de arriba (por ejemplo `assert.ok(/continuity note/.test(line(111)) && /memory\/continuity\//.test(line(111)) && /200 ms/.test(line(111)))`). No se toca el changelog en esta tarea (la 39 lo escribe).

**Tests (write first):**

En `tests/docs-facts.test.js`, dentro de la prueba `R15: the decisions A50 to A116 …`:

```js
  assert.ok(/continuity note/.test(line(111)) && /memory\/continuity\//.test(line(111)) && /outside the index/.test(line(111)) && /its own hook entries/.test(line(111)) && /200 ms/.test(line(111)) && /contuidad/.test(line(111)))
  assert.ok(/\.aether\/README\.md/.test(line(112)) && /worktrees\/lanes/.test(line(112)) && /work\/seats/.test(line(112)) && /three conditions/.test(line(112)) && /git worktree move/.test(line(112)) && /per project/.test(line(112)) && /issue #186/.test(line(112)))
  assert.ok(/four kinds/.test(line(113)) && /\.agents\/skills\//.test(line(113)) && /trusted authors/.test(line(113)) && /starts empty/.test(line(113)) && /skill-install/.test(line(113)) && /aether-autonomy trust/.test(line(113)) && /skills\.sh/.test(line(113)))
  assert.ok(/AETHER-SKILLS:/.test(line(114)) && /Skills:/.test(line(114)) && /aether-plan compile/.test(line(114)) && /at most 3/.test(line(114)) && /uses\.jsonl/.test(line(114)))
  assert.ok(/PermissionRequest/.test(line(115)) && /skills\/ and rules\//.test(line(115)) && /settings\.json/.test(line(115)) && /never/.test(line(115)) && /PreToolUse/.test(line(115)))
  assert.ok(/aether:tidy/.test(line(116)) && /`delete`/.test(line(116)) && /\/aether:onboard/.test(line(116)) && /retired/.test(line(116)) && /the automatic note/.test(line(116)))
```

y `const LAST_DECISION = 116`.

**Acceptance:**

- `node --test tests/docs-facts.test.js` pasa y `npm test` completo pasa.
- Las seis decisiones cuentan lo que se construyó (no una propuesta) y citan las palabras del dueño; `docs/decisions.md` sigue con las filas A50 a A110 intactas.

---

### Task 39: Subir la versión a 0.35.0 en todos los lugares donde vive y escribir el changelog

**Aether:**
- Area: release
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `tests/launcher.test.js`, `README.md`, `docs/changelog.md`, `docs/roadmap.md`, `site/index.html`, `tests/codex-release.test.js`, `tests/docs-facts.test.js`
- Depends on: Task 38 — el changelog cita las decisiones A111 a A116 y comparten `tests/docs-facts.test.js`
- Serves: R10, R43, R44

**Interfaces:**

- `plugins/aether/.claude-plugin/plugin.json`: `"version": "0.35.0"`. `tests/launcher.test.js` (la prueba «the manifest is version…» y su fijación), `tests/codex-release.test.js` (las aserciones de la versión, del README, del changelog y de la hoja de ruta), `README.md` (las líneas 14 y 16: la insignia `version-0.35.0` y `Version 0.35.0 ([changelog](docs/changelog.md))`; el README sigue con a lo más 160 líneas y sus partes en orden), `docs/roadmap.md` (la descripción y la línea `**Now:**` dicen `version 0.35.0` y lo que trae), `site/index.html` (las líneas 86 y 413: `v0.35.0`).
- `docs/changelog.md`: una entrada nueva, la primera del archivo (antes de la de 0.34.0), con esta primera línea, completa: `Version 0.35.0: skills with a place and a rule, an ordered tree of files for Aether's own state, a note of continuity between sessions, and the order of existing projects (issues 125 and 186, decisions A111 to A116). What changed since 0.34.0:` y una viñeta por cambio: la continuidad (hooks `Stop`, `PreCompact`, `PostCompact`, `StopFailure`, `SessionEnd` de `aether-continuity`, la nota en `memory/continuity/`, el aviso de 3 a 5 líneas, la poda); el diseño nuevo de `.aether/` con su mapa y la migración que no pierde trabajo y el sello por proyecto (issue 186); el hook de permisos de `.claude/skills/` y `.claude/rules/` y el rechazo de la configuración y los hooks; las cuatro clases de skill, la clase `skill-install` y la lista de autores de confianza, `aether-autonomy trust`; las skills de una tarea (`Skills:` y `AETHER-SKILLS:`); `aether:skills`, `aether:art-direction` y `aether:tidy`; `AGENTS.md` en las llamadas a otros harness; y **el retiro de `/aether:onboard`: la nota automática hace lo que él hacía; para ir a fondo, el dueño se lo pide al Lead con palabras.** Las entradas anteriores no se tocan.
- `tests/docs-facts.test.js`: la prueba de las decisiones y del changelog dice «the changelog opens with 0.35.0, then 0.34.0, …», los índices de `allVersions` se corren uno (la nueva es `allVersions[0]`: `startsWith('Version 0.35.0: ')` y contiene `issues 125 and 186`, `A111` y `A116`; 0.34.0 pasa a `allVersions[1]`, y así hasta la última que fijaba), y el cálculo de `versions` (`allVersions.slice(9)`) pasa a `slice(10)`.

**Tests (write first):**

En `tests/launcher.test.js` y `tests/codex-release.test.js`, las aserciones que decían `0.34.0` pasan a `0.35.0`, y en `tests/codex-release.test.js` la de la primera versión del changelog pasa a:

```js
  assert.ok(firstVersion.startsWith('Version 0.35.0: ') && /issues 125 and 186/.test(firstVersion), firstVersion)
```

y se agrega a `tests/docs-facts.test.js`:

```js
test('the changelog says that /aether:onboard was retired and why, and keeps the history of the release before (R10, C4)', () => {
  const changelog = read('docs/changelog.md')
  const first = changelog.split('\n').filter((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(first[0].startsWith('Version 0.35.0: ') && first[1].startsWith('Version 0.34.0: '))
  const entry = changelog.slice(changelog.indexOf('Version 0.35.0: '), changelog.indexOf('Version 0.34.0: '))
  assert.ok(entry.includes('`/aether:onboard`') && /retired/.test(entry) && /the automatic note/.test(entry) && /ask the Lead/.test(entry))
  for (const word of ['skill-install', 'aether-continuity', 'aether:tidy', '.aether/README.md']) assert.ok(entry.includes(word), word)
})
```

**Acceptance:**

- `npm test`, `npm run test:mod`, `npm run validate` y `npm run check` completos pasan.
- La versión es 0.35.0 en `plugin.json`, `tests/launcher.test.js`, `README.md`, `docs/changelog.md`, `docs/roadmap.md`, `site/index.html`, `tests/codex-release.test.js` y `tests/docs-facts.test.js`; `grep -rn "0\.34\.0"` solo la deja en el changelog, en el historial y en los documentos de `specs/` y `docs/handoff/`.
- El changelog dice que `/aether:onboard` se retiró y por qué.

---

### Task 40: Mover las copias de lanes a `.aether/worktrees/lanes/` y barrerlas en los dos lugares

**Aether:**
- Area: layout
- Owns: `plugins/aether/lib/worktrees.js`, `plugins/aether/lib/lane-work.js`, `tests/layout-lanes.test.js`, `tests/lane-work.test.js`, `tests/worktrees-cleanup.test.js`, `tests/wt-sweep.test.js`
- Depends on: Task 12 — comparten `lib/worktrees.js`, `lib/lane-work.js` y `tests/lane-work.test.js`, y usa `run.laneCopiesDir`
- Serves: R15

**Interfaces:**

- `lib/worktrees.js`: `laneCopiesRoot(mainRoot)` pasa a `run.laneCopiesDir(mainRoot)` (`.aether/worktrees/lanes`); `sweepStale` y `sweepRun` hallan y barren las copias de lanes del lugar nuevo y también las del viejo `.aether/lanes/<run>` (se lee el viejo, se escribe solo el nuevo); una copia bajo `worktrees/lanes/` o `worktrees/exams/` no se cuenta como copia de unidad (`lanes` y `exams` no son ids de run, y `aetherWorktrees` y el barrido de ids las ignoran).
- `lib/lane-work.js`: `readerDir(mainRoot, runId, call)` es `<raíz>/.aether/worktrees/lanes/<run>/<call>`.
- Las pruebas de `Owns` que nombran `.aether/lanes` (`tests/worktrees-cleanup.test.js:285-286` y `:317`, `tests/lane-work.test.js:166`, `tests/wt-sweep.test.js`) se actualizan al lugar nuevo, y una comprueba además el viejo.

**Tests (write first):**

`tests/layout-lanes.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, diffPackage, sweepStale } = require('../plugins/aether/lib/worktrees.js')
const work = require('../plugins/aether/lib/lane-work.js')

test('the copy of a read-only lane lives under .aether/worktrees/lanes/<run>/<call> (R15)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  assert.equal(copy.workdir, path.join(repo.dir, '.aether', 'worktrees', 'lanes', args.runId, 'task-1-1-supervise'))
  assert.equal(copy.workdir, work.readerDir(repo.dir, args.runId, 'task-1-1-supervise'))
  assert.equal(work.removeReader(repo.dir, args.runId, 'task-1-1-supervise'), true)
  assert.equal(fs.existsSync(copy.workdir), false)
})

test('sweepStale finds a lane copy left in the old .aether/lanes folder and one in the new place, and removes both (R15, R19)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const call = work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  const old = path.join(repo.dir, '.aether', 'lanes', args.runId, 'task-1-9-leftover')
  fs.mkdirSync(old, { recursive: true })
  fs.writeFileSync(path.join(old, 'junk.txt'), 'x')
  const aged = new Date(Date.now() - 48 * 3600 * 1000)
  for (const dir of [args.runDir, path.join(repo.dir, '.aether', 'worktrees', args.runId), path.join(repo.dir, '.aether', 'lanes', args.runId), old, call.workdir]) {
    for (const entry of fs.readdirSync(dir, { recursive: true })) try { fs.utimesSync(path.join(dir, entry), aged, aged) } catch { /* a link that is gone */ }
    fs.utimesSync(dir, aged, aged)
  }
  sweepStale(repo.dir, { dataDir: tempDir(t, 'aether-stamp-'), now: Date.now() })
  assert.equal(fs.existsSync(old), false)
  assert.equal(fs.existsSync(call.workdir), false)
})
```

**Acceptance:**

- `node --test tests/layout-lanes.test.js` pasa y `npm test` completo pasa.
- Con el estado viejo en disco (`.aether/lanes/<run>/…`), el código nuevo lo lee y lo barre; solo escribe en el lugar nuevo.

---

### Task 41: Mover el trabajo de seats y delegados y el mensaje de una ronda a su lugar nuevo

**Aether:**
- Area: layout
- Owns: `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js`, `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/lane-command.js`, `plugins/aether/workflows/design.workflow.js`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/ops.test.ts`, `tests/layout-work.test.js`, `tests/seats.test.js`, `tests/seat-calls.test.js`, `tests/seat-partial.test.js`, `tests/ops-command-design.test.js`, `tests/workflow-design.test.js`, `tests/delegate-calls.test.js`, `tests/delegate-chain.test.js`
- Depends on: Task 13 — comparten `lib/seats.js`, `workflows/design.workflow.js` y sus pruebas, y el examen ya está en su lugar
- Depends on: Task 12 — usa `run.workDir` que esa tarea define
- Serves: R15

**Interfaces:**

- `lib/seats.js` (`runRound`): el trabajo de una ronda va en `run.workDir(mainRoot, 'seats', id)` (con su copia `wt`).
- `lib/delegate-calls.js`: el trabajo de un delegado va en `run.workDir(mainRoot, 'delegates', id)`; `TMP_DIR` es `'.aether/tmp/'`.
- `lib/seat-calls.js`: `messageFile(top, session)` es `<top>/.aether/tmp/seats/<session>/message.md`; `workflows/design.workflow.js`: `MESSAGE_PATH` bajo `.aether/tmp/seats/…`.
- `hooks/ops-command.mjs`: `PAYLOAD_PATH` acepta `…/.aether/tmp/seats/<…>/message.md` y también la ruta vieja `…/.aether-tmp/seats/<…>/message.md`; el resto de lo que acepta no cambia. `hooks/register.js` y `lib/lane-command.js` actualizan sus comentarios.
- Las pruebas de `Owns` que nombran `.aether-tmp/seats`, `.aether/seats` o `.aether/delegates` se actualizan al lugar nuevo, sin perder lo que comprueban; `hooks/ops.test.ts` gana el caso de la ruta nueva y conserva el de la vieja.

**Tests (write first):**

`tests/layout-work.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')
const seatCalls = require('../plugins/aether/lib/seat-calls.js')

test('the message of a design round is inside .aether/tmp/ (R15)', () => {
  assert.equal(seatCalls.messageFile('/repo', 'sess-1'), path.join('/repo', '.aether', 'tmp', 'seats', 'sess-1', 'message.md'))
  const design = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  assert.ok(design.includes('.aether/tmp/seats/') && !design.includes('.aether-tmp/seats'))
})

test('the mod accepts the message of a round in the new place and in the old one, and nothing else changes (R15, R19)', async () => {
  const { PAYLOAD_PATH } = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'ops-command.mjs')).href)
  const SESSION = 'abc-123'
  assert.ok(PAYLOAD_PATH.test(`/repo/.aether/tmp/seats/${SESSION}/message.md`))
  assert.ok(PAYLOAD_PATH.test(`/repo/.aether-tmp/seats/${SESSION}/message.md`))
  assert.ok(!PAYLOAD_PATH.test(`/repo/.aether/tmp/seats/${SESSION}/other.md`))
  assert.ok(!PAYLOAD_PATH.test('/repo/.aether/tmp/x/message.md'))
})

test('the work of a round and of a delegate is named in .aether/work/ and no code writes the old seats and delegates folders (R15)', () => {
  const lib = path.join(PLUGIN, 'lib')
  for (const file of ['seats.js', 'delegate-calls.js']) {
    const text = fs.readFileSync(path.join(lib, file), 'utf8')
    assert.ok(/workDir\(/.test(text), `${file} uses run.workDir`)
    assert.ok(!/aetherDir\(mainRoot\), '(seats|delegates)'/.test(text), `${file} no longer builds the old folder`)
  }
})
```

**Acceptance:**

- `node --test tests/layout-work.test.js` pasa; `npm test` y `npm run test:mod` completos pasan.
- Ninguna ruta de seats, delegados o mensajes queda escrita en `.aether/seats`, `.aether/delegates` ni `.aether-tmp/` por código nuevo (solo se leen los lugares viejos).
