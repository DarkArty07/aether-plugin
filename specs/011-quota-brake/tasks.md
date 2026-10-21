# El freno de la cuota de 5 horas y el trabajo que no se pierde: tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual. El plan, `plan.md`, dice por qué cada pieza existe (D1 a D8): léelo antes de empezar. Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice.
- **Idioma.** El código, los comentarios, los mensajes y los documentos del repositorio van en inglés; este archivo y el plan, en español. Un texto que un test fija va exactamente como lo escribe el test. Las excepciones son los textos del dueño: el aviso de Task 3 y las entradas del diario de Task 2, en el español literal de los tests.
- **Estilo.** Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma ni dependencias de npm; el mod (`plugins/aether/hooks/`) es ESM, como está. Los bins son finos y la lógica vive en `plugins/aether/lib/` o, para el mod, en su propio `.mjs`. Las funciones de `lib/` son puras o reciben sus dependencias por parámetro: reloj (`now`), `dataDir`, `configDir`, como los de hoy.
- **Primero los tests.** Cada tarea escribe sus tests (rojo), implementa y deja la suite verde antes de reportar. Cada fusión corre `npm test` entero: una tarea no deja rota una prueba que no es suya. Los tests existentes que una tarea ajusta son los de su `Owns` y solo donde la tarea lo dice; ninguna aserción existente cambia por otro motivo. La tarea del mod corre además `npm run test:mod`.
- **Sin cuota real.** Ningún test gasta la cuota de la cuenta: las lecturas de ventana son simuladas, los repos son desechables (`tests/helpers.js`, `tests/plan-fixtures.js`), los transcritos del dueño son ficheros de prueba y el tiempo del mod lo mueve `mock.clock`. La lectura real (R17) la hace el Lead después de fusionar todo; ninguna tarea la hace.
- **Guardas que no cambian.** Nadie escribe bajo `specs/` ni `.specify/`. Nadie sube la versión, toca el changelog, empuja, publica ni fusiona. Ningún fichero nuevo importa una dependencia.
- **La huella dormida (R12).** En una sesión que no es del Lead no se hace nada nuevo: ni leído, ni escrito, ni avisado. La marca de sesión (`aether-session-start`) no se añade a ninguna sesión nueva, y lo que el mod hace hoy en esas sesiones queda byte a byte.
- **Formas compartidas entre tareas** (las fija el test de la tarea que las produce; las demás las leen tal cual):
  - **Las opciones** (las escribe la Task 1): el `userConfig` de `plugins/aether/.claude-plugin/plugin.json` gana `quotabrake` (un `string`, por defecto `'95'`) y `brakepush` (un `boolean`, por defecto `false`), con los textos de `title`/`description` de la Task 1.
  - **El ajuste de sesión** (lo escribe la Task 1, lo lee la Task 2): `brakeSettingsFrom(env) -> { threshold: number, push: boolean }` con un inválido como `{ threshold: 95, push: false }`; `<dataDir>/sessions/<sessionId>.brake.json` guarda ese mismo objeto, y `readBrakeSettings(dataDir, sessionId)` lo devuelve o `null`. La sesión conoce también `AETHER_QUOTA_BRAKE=<threshold>` y `AETHER_BRAKE_PUSH=on|off` por `CLAUDE_ENV_FILE`.
  - **Los verbos de autonomía** (Task 2; la Task 3 llama a los dos primeros y la Task 7 a todos): `aether-autonomy brake-settings [--session <id>]`, `aether-autonomy brake-off --quote <text> [--session <id>]`, `aether-autonomy brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>]`, `aether-autonomy quota-saved --from <saved.json>`. Sus salidas son las de las formas de abajo, impresas tal cual por el bin.
  - **El ajuste que el mod lee** (`brakeSettings(mainRoot, opts)` de Task 2): `{ threshold, push, openRun: <runId | null>, brakeOff: boolean, paused: { run, resetsAt, resumeAt, percentUsed } | null, notified: { five_hour: <iso | null>, seven_day: <iso | null> } }`.
  - **El cruce registrado** (`recordCrossing(mainRoot, crossing, opts)` de Task 2): `{ recorded: true, paused: true, run, resetsAt, resumeAt }` (con `duplicate: true` añadido cuando la pausa con ese `resetsAt` ya existe, y el mismo `paused` que le corresponde a `now`); `{ recorded: true, paused: false, brakeOff: true, run, quote }` con el freno apagado; `{ recorded: false, paused: false, reason: 'weekly' }` para `seven_day`; `{ recorded: false, paused: false, reason: 'no-run' }` sin corrida abierta.
  - **La pausa en `status`** (Task 2; lo leen la skill de Task 6 y la nota de Task 2): `status` gana `quota: { paused, brakeOff, resetsAt, resumeAt, percentUsed }` siempre en una corrida abierta, `stop` puede valer `'quota'` y `hours.paused` es el tiempo pausado en horas, que `hours.elapsed` ya no cuenta. Con el freno apagado no hay parada `quota` ni con una pausa registrada.
  - **El guardado de una corrida** (`saveRun` de Task 4, consumido por `quota-saved` de Task 2 y por la Task 7): escribe `<runDir>/saved.json` con `{ run, at, units: [{ task, branch, head, merged, salvaged, committed, left }] }` (`branch` y `head` son `null` sin rama) e imprime lo mismo más `path`, la ruta de ese fichero.
  - **El margen tras el reinicio** (Task 2): `RESUME_MARGIN_MS = 120000`; `resumeAt = new Date(Date.parse(resetsAt) + RESUME_MARGIN_MS).toISOString()`.
  - **Los textos del dueño** (Task 3): el título del aviso es `Aether: freno de cuota`; el cuerpo de las 5 horas es `La ventana de 5 horas de Claude llegó al <percent>% (umbral <threshold>%) y se reinicia a las <resetsAt>.` y el de la semana `La ventana semanal de Claude llegó al <percent>% (umbral <threshold>%) y se reinicia a las <resetsAt>. Es solo un aviso: nada se detiene.`, con `<percent>` y `<threshold>` por `String(percentUsed)` y `String(threshold)`. Los prompts al Lead son los dos de la Task 3, palabra por palabra, escritos con su marco propio del plugin y sin `asUser`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [E5] Las opciones `quotabrake` y `brakepush` en el manifiesto, el ajuste por sesión y el pase por `CLAUDE_ENV_FILE` in plugins/aether/lib/session.js → Task 1
- [ ] T002 [P] [E5] Las dos filas y sus notas en la página de opciones in docs/guide/options.md → Task 1
- [ ] T003 [E1] El estado del freno, la parada `quota` y los verbos `brake-*` y `quota-saved` in plugins/aether/lib/autonomy.js → Task 2
- [ ] T004 [E1] La nota de la pausa de sesión in plugins/aether/bin/aether-session-start → Task 2
- [ ] T005 [E1] El decisor puro y `brakeStep` del mod in plugins/aether/hooks/quota-brake.mjs → Task 3
- [ ] T006 [P] [E8] `aether-wt save` y los comiteos previos al barrido y al `ensure` in plugins/aether/lib/worktrees.js → Task 4
- [ ] T007 [E8] La exclusión de las unidades ya fusionadas al recompilar con `--run` in plugins/aether/bin/aether-plan → Task 5
- [ ] T008 [E1] La regla del freno en las skills de autonomía y del enjambre in plugins/aether/skills/autonomous-runs/SKILL.md → Task 6
- [ ] T009 [E5] La página de usuario de la autonomía in docs/guide/autonomy.md → Task 6
- [ ] T010 [E1] Las pruebas de escenario E1 a E10 por los bins in tests/quota-brake-scenarios.test.js → Task 7

### Task 1: Las dos opciones del plugin y el ajuste por sesión

**Aether:**
- Tier: haiku high — mecánico y fijado al detalle, con un patrón idéntico ya en el fichero (el del router)
- Review: xhigh — una caída silenciosa a otro umbral o un ajuste que no se lee cambia el comportamiento sin que nadie lo vea
- Area: brake
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `plugins/aether/lib/session.js`, `plugins/aether/bin/aether-session-start`, `docs/guide/options.md`, `tests/quota-brake-settings.test.js`
- Depends on: none
- Serves: R2, R15

**Interfaces:**

En `plugins/aether/.claude-plugin/plugin.json`, el `userConfig` gana dos entradas con estos textos exactos:

```json
"quotabrake": {
  "type": "string",
  "title": "Quota brake",
  "description": "The percent of the five-hour window used at which the quota brake acts in a Lead session: it warns you and, in an autonomous run, pauses the run until the window resets, then resumes it. The seven-day window at the same percent only warns. Only your own words turn the brake off for a run. Default: 95.",
  "default": "95"
},
"brakepush": {
  "type": "boolean",
  "title": "Push saved unit branches",
  "description": "Also push the unit branches an interrupted workflow saved to origin. Off by default: saved work stays on its local branch. A push still needs your recorded push permission each time.",
  "default": false
}
```

En `plugins/aether/lib/session.js` (mismo patrón que `routerFile`/`routerSettingsFrom`/`readRouterSettings`):

```js
const DEFAULT_THRESHOLD = 95
brakeFile(dataDir, sessionId)            // <dataDir>/sessions/<id>.brake.json; mismo error que markerFile con id inválido
parseThreshold(value)                    // número finito, 0 < n <= 100 -> n; cualquier otra cosa -> 95
brakeSettingsFrom(env = process.env)
// -> { threshold: parseThreshold(env.CLAUDE_PLUGIN_OPTION_QUOTABRAKE), push: env.CLAUDE_PLUGIN_OPTION_BRAKEPUSH === 'true' }
readBrakeSettings(dataDir, sessionId)
// -> { threshold, push } solo si el fichero tiene un threshold como parseThreshold y un push booleano; si no, null
```

`markSession(dataDir, sessionId, now, { brake = null })` escribe ese fichero si le pasan un `brake`, y borra un `.brake.json` anterior con `null`, como hace con el del router; `pruneSessions` borra también `<id>.brake.json` al podar una marca.

En `plugins/aether/bin/aether-session-start`, y solo para el Lead:

- `mark()` pasa `brake: brakeSettingsFrom(process.env)` a `markSession`.
- El pase de entorno añade a `CLAUDE_ENV_FILE`, junto a las de superdelegación, las líneas exactas `export AETHER_QUOTA_BRAKE=<threshold>` y `export AETHER_BRAKE_PUSH=on` (u `off`).

Nada más cambia: la marca, las notas y el contenido para sesiones que no son del Lead quedan como están.

En `docs/guide/options.md`, la cuenta de opciones pasa de siete a nueve en sus dos sitios («The seven options of the Aether plugin» de la descripción y «Aether has seven options» de la introducción pasan a decir `nine`), la tabla de opciones gana estas dos filas (al final de la tabla) y las notas en viñeta de después de la tabla ganan estas dos, en este orden y con el defecto repetido en la forma que `tests/docs-facts.test.js` lee:

```markdown
| `quotabrake` | `95` | `--config quotabrake=90` at install, or `/plugin` → Installed → aether → Configure options later | Sets the percent of the five-hour window used at which the quota brake warns you, and pauses an autonomous run until the window resets: see [Autonomy](autonomy.md#autonomy) |
| `brakepush` | off | `--config brakepush=true` at install, or `/plugin` → Installed → aether → Configure options later | Also pushes the unit branches an interrupted workflow saved to origin, when your recorded push permission covers it; off keeps saved work on its local branch |
```

```markdown
- `quotabrake`, `95` by default, is the percent of your account's five-hour window used at which the quota brake acts in a Lead session: it warns you once per crossing and, in an autonomous run, pauses the run — nothing new starts, what is running is stopped and saved — until the window resets, then resumes the run on its own. The seven-day window at the same percent only warns, and so does a Lead session with no run open. Only your own recorded words turn the brake off, and only for that run. A value that is not a percent between 1 and 100 is `95`.
- `brakepush`, off by default, also pushes the unit branches an interrupted workflow saved to `origin`. The saved work is local either way; with this on, a saved branch is pushed only when your recorded `push` permission covers it, branch by branch.
```


**Tests (write first):**

El fichero nuevo `tests/quota-brake-settings.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, SESSION_BIN, makeRepo, tempDir } = require('./helpers.js')
const session = require('../plugins/aether/lib/session.js')

test('the manifest carries the two quota-brake options', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.userConfig.quotabrake.type, 'string')
  assert.equal(manifest.userConfig.quotabrake.default, '95')
  assert.equal(manifest.userConfig.quotabrake.title, 'Quota brake')
  assert.equal(manifest.userConfig.brakepush.type, 'boolean')
  assert.equal(manifest.userConfig.brakepush.default, false)
  assert.ok(manifest.userConfig.quotabrake.description.includes('five-hour window'))
  assert.ok(manifest.userConfig.brakepush.description.includes('origin'))
})

test('parseThreshold keeps a percent and falls back to 95 for anything else', () => {
  assert.equal(session.DEFAULT_THRESHOLD, 95)
  for (const good of ['95', '80', '92.5', ' 90 ', '1', '100']) assert.equal(session.parseThreshold(good), Number(good), good)
  for (const bad of [undefined, null, '', ' ', 'abc', '95%', '0', '-5', '100.1', '101', 'NaN', 'Infinity', 42, true]) {
    assert.equal(session.parseThreshold(bad), 95, String(bad))
  }
})

test('brakeSettingsFrom reads the plugin options and defaults both', () => {
  assert.deepEqual(session.brakeSettingsFrom({}), { threshold: 95, push: false })
  assert.deepEqual(session.brakeSettingsFrom({ CLAUDE_PLUGIN_OPTION_QUOTABRAKE: '87.5', CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'true' }), { threshold: 87.5, push: true })
  assert.deepEqual(session.brakeSettingsFrom({ CLAUDE_PLUGIN_OPTION_QUOTABRAKE: 'nope', CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'false' }), { threshold: 95, push: false })
  assert.deepEqual(session.brakeSettingsFrom({ CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'TRUE' }), { threshold: 95, push: false })
})

test('brakeFile sits beside the marker and refuses an id that could leave the directory', (t) => {
  const data = tempDir(t)
  assert.equal(session.brakeFile(data, 's1'), path.join(data, 'sessions', 's1.brake.json'))
  assert.throws(() => session.brakeFile(data, '../x'), /invalid session id/)
})

test('markSession writes the brake file, a null brake removes a stale one, and readBrakeSettings validates it', (t) => {
  const data = tempDir(t)
  session.markSession(data, 's1', 1234, { brake: { threshold: 88, push: true } })
  assert.deepEqual(session.readBrakeSettings(data, 's1'), { threshold: 88, push: true })
  session.markSession(data, 's1', 1235, { brake: null })
  assert.equal(fs.existsSync(session.brakeFile(data, 's1')), false)
  assert.equal(session.readBrakeSettings(data, 's1'), null)
  session.markSession(data, 's1', 1236)
  assert.equal(fs.existsSync(session.brakeFile(data, 's1')), false)
  for (const bad of [{ threshold: '88', push: true }, { threshold: 88 }, { threshold: 0, push: false }, { threshold: 88, push: 'yes' }, [1, 2], 'x']) {
    fs.mkdirSync(path.dirname(session.brakeFile(data, 's1')), { recursive: true })
    fs.writeFileSync(session.brakeFile(data, 's1'), JSON.stringify(bad))
    assert.equal(session.readBrakeSettings(data, 's1'), null, JSON.stringify(bad))
  }
  assert.equal(session.readBrakeSettings(data, '../x'), null)
})

test('pruneSessions deletes the brake file of a pruned session', (t) => {
  const data = tempDir(t)
  session.markSession(data, 's1', 1000, { brake: { threshold: 90, push: false } })
  const old = new Date(1000)
  fs.utimesSync(session.markerFile(data, 's1'), old, old)
  assert.deepEqual(session.pruneSessions(data, { days: 30, now: 1000 + 31 * 24 * 60 * 60 * 1000 }), ['s1'])
  assert.equal(fs.existsSync(session.brakeFile(data, 's1')), false)
})

test('session start writes the brake file and the env lines for the Lead, and nothing for anyone else', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t, 'aether-env-'), 'env')
  fs.writeFileSync(envFile, '')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_QUOTABRAKE: '90', CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'true' }
  const lead = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }
  let r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify(lead), env })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.brake.json'), 'utf8')), { threshold: 90, push: true })
  const written = fs.readFileSync(envFile, 'utf8')
  assert.ok(written.includes('export AETHER_QUOTA_BRAKE=90\n'), written)
  assert.ok(written.includes('export AETHER_BRAKE_PUSH=on\n'), written)
  r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify({ ...lead, session_id: 's2', agent_type: 'general-purpose' }), env })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's2.brake.json')), false)
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's2.json')), false)
})
```

**Acceptance:**

- Pasan `tests/quota-brake-settings.test.js`, `tests/session.test.js`, `tests/session-start.test.js`, `tests/session-start-autonomy.test.js` y `tests/docs-facts.test.js`: la página de opciones y el manifiesto dicen lo mismo desde esta misma fusión.
- Un umbral inválido da 95, nunca otro número ni un error; `brakepush` solo vale el literal `'true'` del entorno del plugin.
- En una sesión que no es del Lead no se escribe nada: ni marca, ni `.brake.json`, ni salida.

### Task 2: El estado del freno en autonomía y sus verbos

**Aether:**
- Tier: opus high — estado de la corrida y la verificación de la cita del dueño, el corazón del registro que aether-guard protege
- Review: xhigh — una pausa que terminara la corrida, una hora pausada contada o una cita no verificada que apagara el freno rompen C1 y C3 sin que los tests de hoy lo noten
- Area: brake
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/bin/aether-autonomy`, `plugins/aether/bin/aether-session-start`, `tests/quota-brake.test.js`, `tests/aether-autonomy.test.js`, `tests/session-start-autonomy.test.js`
- Depends on: Task 1 — el umbral y el `push` vienen de `readBrakeSettings`, y la nota de sesión y el `USAGE` comparten ficheros con la Task 1
- Serves: R3, R4, R6, R8, R9

**Interfaces:**

En `plugins/aether/lib/autonomy.js`:

```js
const RESUME_MARGIN_MS = 120000
brakeSettings(mainRoot, { session = null, now = Date.now(), dataDir } = {})
// threshold/push: readBrakeSettings(dataDir, session), o { threshold: 95, push: false } si session falta o no hay fichero válido
// openRun: el id abierto o null; brakeOff: run.brakeOff no nulo; paused: la última pausa con now < Date.parse(resumeAt)
//   y sin brakeOff, como { run, resetsAt, resumeAt, percentUsed }, o null
// notified: <dataDir>/quota/state.json -> { five_hour, seven_day } (ISO o null); dataDir por defecto lib/run.js dataDir()
recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify = { sent: false, reason: 'no-channel' } }, { now = Date.now(), dataDir } = {})
brakeOff(mainRoot, { quote, session }, { configDir, now = Date.now() } = {})
recordSaved(mainRoot, saved, { now = Date.now() } = {})
```

- `recordCrossing` valida y lanza con estos mensajes: `unknown window kind: <kind>`, `invalid percent: <v>`, `invalid resetsAt: <v>`, `invalid threshold: <v>`. Escribe antes que nada `notified[kind] = resetsAt` en `<dataDir>/quota/state.json` (con su `updatedAt`). Con `kind: 'seven_day'` no toca ningún `run.json`. Con `five_hour` se rige por el orden de las Global Constraints: sin corrida, con el freno apagado, el duplicado por el mismo `resetsAt` o la pausa nueva. La pausa que escribe es `{ started, percentUsed, threshold, resetsAt, resumeAt, notify: { sent, reason }, savedUnits: [] }` y su entrada en el diario es, palabra por palabra:

```text

## Pausa de cuota <started>

- Ventana de 5 horas al <percentUsed>% (umbral <threshold>%); reinicia <resetsAt>; la corrida se retoma <resumeAt>.
- Aviso al dueño: enviado.
```

con `- Aviso al dueño: no enviado (<reason>).` cuando `notify.sent` es falso (`reason` por defecto `error`). Un cruce con el freno apagado registra `{ at, percentUsed, threshold, resetsAt, notify }` en `quotaCrossings` y su entrada:

```text

## Cruce de cuota sin detención <at>

- Ventana de 5 horas al <percentUsed>% (umbral <threshold>%); reinicia <resetsAt>.
- Aviso al dueño: enviado.
- El freno estaba apagado por las palabras del dueño: «<quote>».
```

- `brakeOff` busca la corrida abierta como `spend`/`end` y, si no hay ninguna, devuelve `{ ok: false, reason: 'no open run' }`; si hay, verifica la cita con `verifyQuote` y escribe `run.brakeOff = { quote, session, time, added }` — reemplazando un apagado anterior verificado por el nuevo — solo por este camino: ningún otro fichero ni marca apaga nada.
- `recordSaved` valida el cuerpo (un objeto con `run` un run id válido y un array de `units`, o lanza `a saved record needs a run and its units`). Sin corrida devuelve el `no-run` de las Global Constraints; con corrida pero sin pausa, el `no-pause`. Toma las unidades con `branch` y `head` y sin `merged`, las funde en `savedUnits` de la última pausa (reemplazando la misma `swarmRun`+`task`) y añade al diario exactamente esta línea, una sola por llamada:

```text
- Guardadas (<saved.at>): `task-1` en `aether/<run>/task-1` (<head>), `task-2` en `aether/<run>/task-2` (<head>).
```

Si ninguna unidad deja nada, devuelve `{ recorded: true, run, savedUnits: [] }` sin tocar `run.json` ni el diario.

- `start()` escribe `brakeOff: null`, `quotaPauses: []` y `quotaCrossings: []`, y un `run.json` anterior que no los tenga se trata como con ellos vacíos en todas las lecturas.
- `statusOfRun`: el `elapsed` es trabajado. Para cada pausa, su intervalo vale del `started` al menor de `resumeAt` y `now` (nada si es posterior); `hours: { elapsed, ceiling, paused }` con todos en horas redondeadas como hoy (`round2`). La parada es `'quota'` primero: hay una pausa con `Date.parse(resumeAt) > now` y `run.brakeOff` es nulo; luego `'time'`, luego `'cost'`. La sección nueva siempre está presente en una corrida abierta:

```js
quota: { paused: stop === 'quota', brakeOff: Boolean(run.brakeOff), resetsAt, resumeAt, percentUsed }
// con los tres últimos de la última pausa, o null si no ha habido ninguna
```

En `plugins/aether/bin/aether-autonomy`, el nuevo `USAGE` exacto:

```text
usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] [--all] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | spend <usd> --source <label> | status | end --outcome done|ceiling|incomplete | brake-settings [--session <id>] | brake-off --quote <text> [--session <id>] | brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>] | quota-saved --from <saved.json>
```

- `brake-settings` imprime el resultado de `brakeSettings` con código 0 (el `AETHER_DATA_DIR` del proceso si lo hay, el de `run.dataDir()` si no).
- `brake-off`: `{ brakeOff }` y código 0 si la cita se verifica, `{ verified: false, reason }` y código 2 si no; el motivo `no open run` sale como `{ error: 'no open run' }` con código 1.
- `brake-crossing` monta `notify` desde el flag: `sent` es `{ sent: true, reason: null }`; `failed` es `{ sent: false, reason: <--notify-reason o 'no-channel'> }`; otra forma no existe. Imprime el resultado con código 0.
- `quota-saved` lee el fichero JSON de `--from` — un fichero que no se puede leer o no es JSON sale como `{ error }` con código 1 — y imprime el resultado con código 0.

En `plugins/aether/bin/aether-session-start`, `autonomyNote()` mantiene su frase y, cuando `status()` de la corrida abierta dice `stop: 'quota'`, añade exactamente esta frase: `The run is paused by the quota brake: the five-hour window resets <quota.resetsAt> and the run resumes <quota.resumeAt>. Do not start anything of this run before then; Aether re-arms the resume in this session.`

**Tests (write first):**

El fichero nuevo `tests/quota-brake.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-brake-1'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const UNLIMITED = 'sigue hasta acabar aunque se acabe la cuota'
const T0 = Date.parse('2026-10-21T10:00:00.000Z')
const RESET = '2026-10-21T12:00:00.000Z'
const RESUME = '2026-10-21T12:02:00.000Z'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function setup(t) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), [human(HOURS, '2026-10-21T09:00:00.000Z'), human(UNLIMITED, '2026-10-21T09:05:00.000Z')].join('\n') + '\n')
  const mainRoot = tempDir(t, 'aether-repo-')
  const dataDir = tempDir(t, 'aether-data-')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'sessions', `${SESSION}.brake.json`), JSON.stringify({ threshold: 90, push: true }) + '\n')
  return { configDir, mainRoot, dataDir }
}

const startRun = ({ mainRoot, configDir }) => {
  const r = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  assert.equal(r.ok, true, r.reason)
  return r
}

const diary = (mainRoot, id) => fs.readFileSync(autonomy.runPaths(mainRoot, id).diary, 'utf8')
const runJson = (mainRoot, id) => JSON.parse(fs.readFileSync(autonomy.runPaths(mainRoot, id).runFile, 'utf8'))

test('start writes the brake fields, and a run without them reads as empty', (t) => {
  const s = setup(t)
  const r = startRun(s)
  assert.deepEqual([r.run.brakeOff, r.run.quotaPauses, r.run.quotaCrossings], [null, [], []])
  const legacy = runJson(s.mainRoot, r.run.id)
  delete legacy.brakeOff
  delete legacy.quotaPauses
  delete legacy.quotaCrossings
  fs.writeFileSync(autonomy.runPaths(s.mainRoot, r.run.id).runFile, JSON.stringify(legacy))
  const st = autonomy.status(s.mainRoot, { now: T0 + 60000 })
  assert.equal(st.stop, null)
  assert.deepEqual(st.quota, { paused: false, brakeOff: false, resetsAt: null, resumeAt: null, percentUsed: null })
})

test('a five-hour crossing pauses the run: status says quota, the diary holds it, and the run stays open', (t) => {
  const s = setup(t)
  const r = startRun(s)
  const out = autonomy.recordCrossing(
    s.mainRoot,
    { kind: 'five_hour', percentUsed: 96.5, resetsAt: RESET, threshold: 95, notify: { sent: true, reason: null } },
    { now: T0, dataDir: s.dataDir },
  )
  assert.deepEqual(out, { recorded: true, paused: true, run: r.run.id, resetsAt: RESET, resumeAt: RESUME })
  const st = autonomy.status(s.mainRoot, { now: T0 + 3600000 })
  assert.equal(st.stop, 'quota')
  assert.equal(st.open, true)
  assert.deepEqual(st.quota, { paused: true, brakeOff: false, resetsAt: RESET, resumeAt: RESUME, percentUsed: 96.5 })
  assert.equal(st.hours.elapsed, 0)
  assert.equal(st.hours.paused, 1)
  assert.equal(runJson(s.mainRoot, r.run.id).ended, null)
  assert.equal(runJson(s.mainRoot, r.run.id).outcome, null)
  assert.ok(diary(s.mainRoot, r.run.id).includes(`## Pausa de cuota ${new Date(T0).toISOString()}`))
  assert.ok(diary(s.mainRoot, r.run.id).includes(`- Ventana de 5 horas al 96.5% (umbral 95%); reinicia ${RESET}; la corrida se retoma ${RESUME}.`))
  assert.ok(diary(s.mainRoot, r.run.id).includes('- Aviso al dueño: enviado.'))
  // Past the resume hour the quota stop lifts and the paused stretch never counted.
  const later = autonomy.status(s.mainRoot, { now: Date.parse(RESUME) + 3600000 })
  assert.equal(later.stop, null)
  assert.equal(later.hours.elapsed, 1)
  assert.equal(later.hours.paused, 2.03)
})

test('the same crossing twice records one pause, and a failed notice is in the diary', (t) => {
  const s = setup(t)
  const r = startRun(s)
  const crossing = { kind: 'five_hour', percentUsed: 97, resetsAt: RESET, threshold: 95, notify: { sent: false, reason: 'no-channel' } }
  assert.equal(autonomy.recordCrossing(s.mainRoot, crossing, { now: T0, dataDir: s.dataDir }).paused, true)
  const again = autonomy.recordCrossing(s.mainRoot, crossing, { now: T0 + 60000, dataDir: s.dataDir })
  assert.deepEqual(again, { recorded: true, paused: true, duplicate: true, run: r.run.id, resetsAt: RESET, resumeAt: RESUME })
  assert.equal(runJson(s.mainRoot, r.run.id).quotaPauses.length, 1)
  assert.equal(diary(s.mainRoot, r.run.id).split('## Pausa de cuota').length, 2)
  assert.ok(diary(s.mainRoot, r.run.id).includes('- Aviso al dueño: no enviado (no-channel).'))
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.dataDir, 'quota', 'state.json'), 'utf8')).five_hour, RESET)
})

test('a weekly crossing and a crossing with no open run write no pause', (t) => {
  const s = setup(t)
  const none = autonomy.recordCrossing(s.mainRoot, { kind: 'five_hour', percentUsed: 99, resetsAt: RESET, threshold: 95 }, { now: T0, dataDir: s.dataDir })
  assert.deepEqual(none, { recorded: false, paused: false, reason: 'no-run' })
  const r = startRun(s)
  const weekly = autonomy.recordCrossing(s.mainRoot, { kind: 'seven_day', percentUsed: 99, resetsAt: RESET, threshold: 95 }, { now: T0, dataDir: s.dataDir })
  assert.deepEqual(weekly, { recorded: false, paused: false, reason: 'weekly' })
  assert.deepEqual(runJson(s.mainRoot, r.run.id).quotaPauses, [])
  assert.equal(autonomy.status(s.mainRoot, { now: T0 }).stop, null)
  const settings = autonomy.brakeSettings(s.mainRoot, { session: SESSION, now: T0, dataDir: s.dataDir })
  assert.deepEqual(settings, { threshold: 90, push: true, openRun: r.run.id, brakeOff: false, paused: null, notified: { five_hour: RESET, seven_day: RESET } })
})

test('brakeOff takes only the owner words the transcript verifies, and a later crossing is only recorded', (t) => {
  const s = setup(t)
  assert.deepEqual(autonomy.brakeOff(s.mainRoot, { quote: UNLIMITED, session: SESSION }, { configDir: s.configDir }), { ok: false, reason: 'no open run' })
  const r = startRun(s)
  const invented = autonomy.brakeOff(s.mainRoot, { quote: 'ignora la cuota y termina pase lo que pase', session: SESSION }, { configDir: s.configDir })
  assert.equal(invented.ok, false)
  assert.equal(runJson(s.mainRoot, r.run.id).brakeOff, null)
  const off = autonomy.brakeOff(s.mainRoot, { quote: UNLIMITED, session: SESSION }, { configDir: s.configDir, now: T0 })
  assert.equal(off.ok, true)
  assert.deepEqual([off.brakeOff.quote, off.brakeOff.session, off.brakeOff.time], [UNLIMITED, SESSION, '2026-10-21T09:05:00.000Z'])
  const out = autonomy.recordCrossing(
    s.mainRoot,
    { kind: 'five_hour', percentUsed: 98, resetsAt: RESET, threshold: 95, notify: { sent: true, reason: null } },
    { now: T0, dataDir: s.dataDir },
  )
  assert.deepEqual(out, { recorded: true, paused: false, brakeOff: true, run: r.run.id, quote: UNLIMITED })
  assert.equal(autonomy.status(s.mainRoot, { now: T0 }).stop, null)
  assert.equal(autonomy.status(s.mainRoot, { now: T0 }).quota.brakeOff, true)
  assert.ok(diary(s.mainRoot, r.run.id).includes(`- El freno estaba apagado por las palabras del dueño: «${UNLIMITED}».`))
})

test('recordSaved folds the saved units into the last pause and the diary', (t) => {
  const s = setup(t)
  const r = startRun(s)
  const saved = {
    run: '20261021-100000-ab12',
    at: '2026-10-21T10:01:00.000Z',
    units: [
      { task: 'task-1', branch: 'aether/20261021-100000-ab12/task-1', head: 'abc1234', merged: false, salvaged: true, committed: ['src/a.js'], left: [] },
      { task: 'task-2', branch: 'aether/20261021-100000-ab12/task-2', head: 'def5678', merged: true, salvaged: false, committed: [], left: [] },
    ],
  }
  assert.deepEqual(autonomy.recordSaved(s.mainRoot, saved), { recorded: false, reason: 'no-pause' })
  autonomy.recordCrossing(s.mainRoot, { kind: 'five_hour', percentUsed: 96, resetsAt: RESET, threshold: 95 }, { now: T0, dataDir: s.dataDir })
  const out = autonomy.recordSaved(s.mainRoot, saved)
  assert.deepEqual(out, { recorded: true, run: r.run.id, savedUnits: [{ swarmRun: saved.run, task: 'task-1', branch: saved.units[0].branch, head: 'abc1234' }] })
  assert.deepEqual(runJson(s.mainRoot, r.run.id).quotaPauses[0].savedUnits, out.savedUnits)
  assert.ok(diary(s.mainRoot, r.run.id).includes(`- Guardadas (${saved.at}): \`task-1\` en \`aether/${saved.run}/task-1\` (abc1234).`))
  assert.throws(() => autonomy.recordSaved(s.mainRoot, { run: 'nope' }), /a saved record needs a run and its units/)
})

test('recordCrossing validates its input', (t) => {
  const s = setup(t)
  startRun(s)
  const at = (x) => () => autonomy.recordCrossing(s.mainRoot, x, { now: T0, dataDir: s.dataDir })
  assert.throws(at({ kind: 'spend_limit', percentUsed: 1, resetsAt: RESET, threshold: 95 }), /unknown window kind: spend_limit/)
  assert.throws(at({ kind: 'five_hour', percentUsed: NaN, resetsAt: RESET, threshold: 95 }), /invalid percent/)
  assert.throws(at({ kind: 'five_hour', percentUsed: -1, resetsAt: RESET, threshold: 95 }), /invalid percent/)
  assert.throws(at({ kind: 'five_hour', percentUsed: 96, resetsAt: 'soon', threshold: 95 }), /invalid resetsAt/)
  assert.throws(at({ kind: 'five_hour', percentUsed: 96, resetsAt: RESET, threshold: 0 }), /invalid threshold/)
})

test('the bin drives the brake verbs end to end', (t) => {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), [human(HOURS, '2026-10-21T09:00:00.000Z'), human(UNLIMITED, '2026-10-21T09:05:00.000Z')].join('\n') + '\n')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: dataDir }
  const cli = (args) => runBin(BIN, args, repo.dir, env)
  let r = cli(['brake-off', '--quote', UNLIMITED])
  assert.equal(r.status, 1)
  assert.deepEqual(r.json, { error: 'no open run' })
  r = cli(['start', '--quote', HOURS])
  assert.equal(r.status, 0, r.stdout)
  const runId = r.json.started.id
  r = cli(['brake-settings'])
  assert.deepEqual([r.json.threshold, r.json.push, r.json.openRun, r.json.brakeOff, r.json.paused], [95, false, runId, false, null])
  const resetsAt = new Date(Date.now() + 3600000).toISOString()
  r = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96.5', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'failed', '--notify-reason', 'disabled'])
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual([r.json.recorded, r.json.paused, r.json.run], [true, true, runId])
  r = cli(['status'])
  assert.equal(r.json.stop, 'quota')
  const savedFile = path.join(tempDir(t, 'aether-saved-'), 'saved.json')
  fs.writeFileSync(savedFile, JSON.stringify({ run: '20261021-100000-ab12', at: resetsAt, units: [{ task: 'task-3', branch: 'aether/20261021-100000-ab12/task-3', head: 'feed123', merged: false, salvaged: true, committed: ['x.js'], left: [] }] }))
  r = cli(['quota-saved', '--from', savedFile])
  assert.equal(r.json.recorded, true)
  assert.equal(r.json.savedUnits[0].task, 'task-3')
  r = cli(['brake-off', '--quote', 'palabras que el dueño nunca dijo en esta sesion'])
  assert.equal(r.status, 2)
  assert.equal(r.json.verified, false)
  r = cli(['brake-off', '--quote', UNLIMITED])
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.brakeOff.quote, UNLIMITED)
  r = cli(['status'])
  assert.equal(r.json.stop, null)
  assert.equal(r.json.quota.brakeOff, true)
})
```

En `tests/aether-autonomy.test.js`, el único cambio: la constante `USAGE` pasa a ser el texto exacto de Interfaces. En `tests/session-start-autonomy.test.js` se añade este test completo (y nada más):

```js
test('session start names the quota pause of the open run', (t) => {
  const repo = makeRepo(t)
  const diaryPath = writeRun(repo.dir, ID, null)
  const file = path.join(repo.dir, '.aether', 'autonomy', ID, 'run.json')
  const run = JSON.parse(fs.readFileSync(file, 'utf8'))
  const resetsAt = new Date(Date.now() + 3600000).toISOString()
  const resumeAt = new Date(Date.parse(resetsAt) + 120000).toISOString()
  run.brakeOff = null
  run.quotaPauses = [{ started: new Date().toISOString(), percentUsed: 96, threshold: 95, resetsAt, resumeAt, notify: { sent: true, reason: null }, savedUnits: [] }]
  run.quotaCrossings = []
  fs.writeFileSync(file, JSON.stringify(run))
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.includes(`Autonomous run ${ID} is open`), r.context.slice(-400))
  assert.ok(r.context.includes(`The run is paused by the quota brake: the five-hour window resets ${resetsAt} and the run resumes ${resumeAt}. Do not start anything of this run before then; Aether re-arms the resume in this session.`), r.context.slice(-400))
})
```

**Acceptance:**

- Pasan `tests/quota-brake.test.js`, `tests/aether-autonomy.test.js`, `tests/autonomy.test.js`, `tests/session-start-autonomy.test.js` y `tests/quota-brake-settings.test.js`.
- Una pausa nunca cierra la corrida: `ended` y `outcome` quedan en `null`, y `status` nunca devuelve `ceiling` por ella; pasado el `resumeAt` la parada se levanta sola y lo pausado nunca contó contra el tope de horas.
- Sin la cita verificada en la transcripción no existe apagado: `brakeOff` no escribe nada y `brake-settings` lo sigue diciendo falso.
- Un cruce semanal y uno sin corrida no escriben ningún `run.json`.

### Task 3: El freno en el mod

**Aether:**
- Tier: sonnet high — une cuatro superficies del mod que ningún fichero del repo usa hoy, y el aviso tiene que ser exactamente uno por cruce
- Review: xhigh — un `asUser` al someter, un aviso repetido, un freno en una sesión que no es del Lead o un paso del modelo bloqueado rompen R1, R7 y R12 sin tocar otro test
- Area: mod
- Owns: `plugins/aether/hooks/quota-brake.mjs`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/quota-brake.test.ts`
- Depends on: Task 2 — llama a los verbos `brake-settings` y `brake-crossing` por `$.process.run`
- Serves: R1, R3, R7, R10, R11, R12

**Interfaces:**

`plugins/aether/hooks/quota-brake.mjs` (nuevo, solo funciones):

```js
export function initialBrakeState(settings)
// -> { five_hour: { above: Boolean(settings?.notified?.five_hour), resetsAt: settings?.notified?.five_hour ?? null }, seven_day: { ... } }
export function crossingsOf(rateLimits, threshold, state)
// -> { crossings, state } (puro: no muta ni `state` ni `rateLimits`)
// Entradas válidas solo con kind 'five_hour' o 'seven_day', percentUsed finito y resetsAt texto; en ese orden (five_hour antes).
// percentUsed >= threshold y no es el mismo cruce de `state[kind]` (`above` ya con ese `resetsAt`) -> un cruce { kind, percentUsed, resetsAt }.
// percentUsed >= threshold -> estado { above: true, resetsAt }; por debajo -> { above: false, resetsAt }. Sin entrada de la ventana, el estado de esa ventana no cambia.
// rateLimits que no es lista (o vacía) -> { crossings: [], state } sin cambiar estado.
export function notifyFor(crossing, threshold)  // -> { title, text } como en las Global Constraints
export function brakePromptFor({ percentUsed, threshold, resetsAt, run, resumeAt })
export function resumePromptFor({ run, resumeAt })
export function jsonFrom(stdout)  // el objeto de la última línea, o null
```

`brakePromptFor` devuelve exactamente:

```text
Aether quota brake: the five_hour window is at {percentUsed}% (threshold {threshold}%) and resets at {resetsAt}. Autonomous run {run} is now paused by the quota brake until {resumeAt}. Stop every running workflow, delegate task and lane call of this run now (TaskStop, aether-lane stop), save each swarm unit with aether-wt save and record it with aether-autonomy quota-saved, and start nothing new. Do not end the run: it resumes by itself after the reset.
```

`resumePromptFor` devuelve exactamente:

```text
Aether quota brake: the five_hour window has reset and autonomous run {run} was paused until {resumeAt}. Read the run's diary, run aether-autonomy status, and when its stop is no longer quota, relaunch the same swarm run from the saved branches (aether-plan compile --run with the same id, as the diary's Estado says) and continue the run.
```

En `plugins/aether/hooks/register.js`:

- El mapa de estado de sesión gana `brake: undefined`, y `brakeStep($, state)` — envuelto entero en `try/catch`, observando solo — se invoca directamente tras `return yield* meteredStep($, state, e, next)` convertido en `const result = yield* meteredStep($, state, e, next)` / `await brakeStep($, state)` / `return result`, solo en esa rama de `turn.step`.
- La primera vez, `$.process.run(['node', `${$.plugin.root}/bin/aether-autonomy`, 'brake-settings', '--session', state.id], { timeoutMs: 10000 })` y `jsonFrom(stdout)` con `exitCode === 0` da el `settings` guardado en `state.brake = { settings, state: initialBrakeState(settings), armedFor: null }`; cualquier otra cosa deja `state.brake = null` y no vuelve a intentarse en esta sesión. Si `settings.paused` llega, arma el resume ya (abajo).
- Cada vez: `$.session.usage()` y su `rateLimits`; `crossingsOf(rateLimits, settings.threshold, state.brake.state)`; el estado nuevo se guarda antes de actuar. Por cada cruce, en orden:
  1. `$.ui.notify(n.text, { title: n.title })` con `n = notifyFor(crossing, settings.threshold)`; su resultado es `notify = result && result.isSent ? { sent: true, reason: null } : { sent: false, reason: (result && result.reason) || 'refused' }`, y un fallo es `{ sent: false, reason: 'error' }`.
  2. `$.process.run(['node', root + '/bin/aether-autonomy', 'brake-crossing', '--kind', crossing.kind, '--percent', String(crossing.percentUsed), '--resets-at', crossing.resetsAt, '--threshold', String(settings.threshold), '--notify', notify.sent ? 'sent' : 'failed', ...(!notify.sent && notify.reason ? ['--notify-reason', notify.reason] : []), '--session', state.id], { timeoutMs: 10000 })`.
  3. Si lo impreso cumple `paused === true` y trae `run` y `resumeAt`: `$.prompt.submit({ text: brakePromptFor({ ...crossing, threshold: settings.threshold, run: record.run, resumeAt: record.resumeAt }) })` — sin `asUser`, jamás — y arma el resume.
- Armar el resume: `armedFor` vale `${run}:${resumeAt}` y ya armado para esa pausa no se repite. Con `ms = Date.parse(resumeAt) - (await $.clock.now())`: si `ms <= 0` se somete el resume a continuación; si no, `$.clock.after(ms, async () => { try { await $.prompt.submit({ text: resumePromptFor({ run, resumeAt }) }) } catch {} })`.
- Nada fuera de una sesión de Aether: el mismo `aetherSession($)` de hoy lleva a `return yield* next(e)` antes de cualquier cosa del freno, así que en esas sesiones no hay petición de settings, ni lectura de uso, ni aviso, ni nada.

**Tests (write first):**

El fichero nuevo `plugins/aether/hooks/quota-brake.test.ts`, completo:

```ts
import { expect, mock, test } from 'claude-code/testing'

// Tests for the quota brake in quota-brake.mjs + register.js. Run with `claude plugin test plugins/aether`.

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 }
const NOW = Date.parse('2026-10-21T10:00:00.000Z')
const RESET = '2026-10-21T12:00:00.000Z'
const RESUME = '2026-10-21T12:02:00.000Z'
const RUN = 'auto-20261021-095000-aaaa'
const SETTINGS = { threshold: 95, push: false, openRun: RUN, brakeOff: false, paused: null, notified: { five_hour: null, seven_day: null } }
const PAUSED = { recorded: true, paused: true, run: RUN, resetsAt: RESET, resumeAt: RESUME }

type Run = { argv: string[] }

// Answers what the brake asks Claude Code for: settings and crossings come from `aether-autonomy` by process,
// the windows from `session.usage`, and every side effect is kept.
function stubs(on, { marked = true, settings = SETTINGS as any, crossing = PAUSED as any, notifyFails = false } = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  const writes: { path: string; text: string }[] = []
  const runs: Run[] = []
  const notes: { text: string; opts: any }[] = []
  const prompts: any[] = []
  let sessionUsage: any = { rateLimits: [] }
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.296', base: '2.1.296', builtAt: '2026-10-09T00:00:00Z' } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', ($, e) => ({ value: marked === true && e.path.endsWith('/sessions/s1.json') }))
  on('fs.write', ($, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('classic.SessionStart', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('agent.offer', () => ({ isOffered: true }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { ...USAGE, model: e.model } }
  })
  on('process.run', ($, e) => {
    runs.push({ argv: [...e.argv] })
    const verb = e.argv[2]
    return { value: { exitCode: 0, stdout: JSON.stringify(verb === 'brake-settings' ? settings : crossing) + '\n', stderr: '' } }
  })
  on('session.usage', () => ({ value: sessionUsage }))
  on('ui.notify', ($, e) => { notes.push({ text: e.text, opts: e.opts ?? e.init ?? e }); return { value: notifyFails ? { isSent: false, reason: 'disabled' } : { isSent: true, channel: 'test' } } })
  on('prompt.submit', ($, e) => { prompts.push(e); return { value: undefined } })
  return {
    clock, writes, runs, notes, prompts,
    setLimits(rateLimits: any) { sessionUsage = { rateLimits } },
    crossingRuns: () => runs.filter((r) => r.argv[2] === 'brake-crossing'),
  }
}

async function step($, fields: Record<string, unknown> = {}) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, ...fields })
  let s = await stream.next()
  while (s.done !== true) s = await stream.next()
  return s.value
}

test('a five-hour crossing warns once, records the pause and wakes the Lead after the reset', async ($, on) => {
  const s = stubs(on)
  s.setLimits([{ kind: 'five_hour', percentUsed: 96.5, resetsAt: RESET }])
  await step($)
  expect(s.notes.map((n) => n.text)).toEqual(['La ventana de 5 horas de Claude llegó al 96.5% (umbral 95%) y se reinicia a las ' + RESET + '.'])
  expect(s.notes[0].opts).toMatchObject({ title: 'Aether: freno de cuota' })
  expect(s.crossingRuns().map((r) => r.argv)).toEqual([
    ['node', expect.stringContaining('/bin/aether-autonomy'), 'brake-crossing', '--kind', 'five_hour', '--percent', '96.5', '--resets-at', RESET, '--threshold', '95', '--notify', 'sent', '--session', 's1'],
  ])
  expect(s.prompts.map((p) => p.text)).toEqual([
    `Aether quota brake: the five_hour window is at 96.5% (threshold 95%) and resets at ${RESET}. Autonomous run ${RUN} is now paused by the quota brake until ${RESUME}. Stop every running workflow, delegate task and lane call of this run now (TaskStop, aether-lane stop), save each swarm unit with aether-wt save and record it with aether-autonomy quota-saved, and start nothing new. Do not end the run: it resumes by itself after the reset.`,
  ])
  expect(s.prompts.every((p) => p.asUser === undefined)).toBe(true)
  // The same reading, and one just under the threshold after it: no second warning, no second recording.
  await step($)
  s.setLimits([{ kind: 'five_hour', percentUsed: 94.9, resetsAt: RESET }])
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(s.crossingRuns()).toHaveLength(1)
  // The resume hour comes: the plugin's own message, once.
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts.map((p) => p.text)).toContain(
    `Aether quota brake: the five_hour window has reset and autonomous run ${RUN} was paused until ${RESUME}. Read the run's diary, run aether-autonomy status, and when its stop is no longer quota, relaunch the same swarm run from the saved branches (aether-plan compile --run with the same id, as the diary's Estado says) and continue the run.`,
  )
})

test('crossingsOf crosses exactly at the threshold, ignores spend_limit and a missing reading, and crosses again after a dip', async () => {
  const { crossingsOf, initialBrakeState } = await import('./quota-brake.mjs')
  let state = initialBrakeState(null)
  assertBounds(state)
  let out = crossingsOf([], 95, state)
  expect(out.crossings).toEqual([])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 94.9, resetsAt: RESET }], 95, state)
  expect(out.crossings).toEqual([])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 95, resetsAt: RESET }, { kind: 'spend_limit', percentUsed: 100, resetsAt: RESET }], 95, out.state)
  expect(out.crossings).toEqual([{ kind: 'five_hour', percentUsed: 95, resetsAt: RESET }])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }], 95, out.state)
  expect(out.crossings).toEqual([])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 50, resetsAt: RESET }], 95, out.state)
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 98, resetsAt: RESET }], 95, out.state)
  expect(out.crossings).toHaveLength(1)
  // Already warned in an earlier session with the same reset does not warn again.
  state = initialBrakeState({ notified: { five_hour: RESET, seven_day: null } })
  expect(crossingsOf([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }], 95, state).crossings).toEqual([])

  function assertBounds(value: any) {
    expect(value).toEqual({ five_hour: { above: false, resetsAt: null }, seven_day: { above: false, resetsAt: null } })
  }
})

test('the weekly window and a Lead session with no open run only warn', async ($, on) => {
  const s = stubs(on, { crossing: { recorded: false, paused: false, reason: 'no-run' } })
  s.setLimits([{ kind: 'seven_day', percentUsed: 96, resetsAt: RESET }])
  await step($)
  expect(s.notes.map((n) => n.text)).toEqual([`La ventana semanal de Claude llegó al 96% (umbral 95%) y se reinicia a las ${RESET}. Es solo un aviso: nada se detiene.`])
  expect(s.crossingRuns()[0].argv).toContain('seven_day')
  expect(s.prompts).toEqual([])
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.notes).toHaveLength(2)
  expect(s.prompts).toEqual([])
})

test('a crossing with the brake off still warns once and stops nothing', async ($, on) => {
  const s = stubs(on, { crossing: { recorded: true, paused: false, brakeOff: true, run: RUN, quote: 'sigue hasta acabar aunque se acabe la cuota' } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(s.crossingRuns()).toHaveLength(1)
  expect(s.prompts).toEqual([])
})

test('a refused notice still records the pause and the resume', async ($, on) => {
  const s = stubs(on, { notifyFails: true })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.crossingRuns()[0].argv.join(' ')).toContain('--notify failed --notify-reason disabled')
  expect(s.prompts).toHaveLength(1)
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toHaveLength(2)
})

test('a paused run from an earlier session rearms its resume on the first step', async ($, on) => {
  const s = stubs(on, { settings: { ...SETTINGS, paused: { run: RUN, resetsAt: RESET, resumeAt: RESUME, percentUsed: 97 } } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.prompts).toEqual([])
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toHaveLength(1)
  expect(s.prompts[0].text).toContain('the five_hour window has reset')
})

test('a session that is not the Lead sees nothing of the brake', async ($, on) => {
  const s = stubs(on, { marked: false })
  s.setLimits([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }])
  await step($)
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1, isAborted: false, usage: null })
  expect(s.runs).toEqual([])
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  expect(s.writes).toEqual([])
})

test('a settings call that fails leaves the brake inert and the step untouched', async ($, on) => {
  const s = stubs(on, { settings: null })
  s.setLimits([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }])
  const value = await step($)
  expect(value.answer).toBe('ok')
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  // One settings attempt only, never one per step.
  await step($)
  expect(s.runs.filter((r) => r.argv[2] === 'brake-settings')).toHaveLength(1)
})
```

Un detalle del kit: los nombres de superficie de los stubs (`session.usage`, `ui.notify`, `prompt.submit`) son los medidos en los tipos del mod (la tarjeta, sección 4) y el temporizador va dentro de `mock.clock` como en `ops.test.ts`. Si el kit registrado los nombra de otra manera, los nombres de los stubs de este fichero se corrigen a los del kit y nada más cambia; el comportamiento que fija cada test es el contrato.

**Acceptance:**

- Pasa `plugins/aether/hooks/quota-brake.test.ts` con `npm run test:mod`, y las anteriores del mod (`usage.test.ts`, `ops.test.ts`, `panel.test.tsx`) siguen verdes.
- Un aviso por cruce, registrado con su suerte; un `prompt.submit` del cruce y otro del resume, ninguno con `asUser`.
- El freno nunca bloquea ni retrasa un paso: un bin caído o un `usage()` que falla dejan la respuesta del paso intacta.
- Sin lectura no hay aviso ni parada; en una sesión que no es del Lead no hay petición, lectura, aviso ni estado.

### Task 4: Guardar el trabajo de un workflow interrumpido en sus ramas

**Aether:**
- Tier: opus high — borra, comitea y conserva ramas y worktrees; un error aquí es perder el trabajo que la spec existe para guardar
- Review: xhigh — un camino que borrara antes de comitear, o que perdiera la rama, no lo ve ningún test de hoy fuera de esta tarea
- Area: worktrees
- Owns: `plugins/aether/lib/worktrees.js`, `plugins/aether/bin/aether-wt`, `tests/wt-save.test.js`, `tests/aether-wt.test.js`, `tests/worktrees-cleanup.test.js`, `tests/worktrees-ensure.test.js`
- Depends on: none
- Serves: R5, R14

**Interfaces:**

En `plugins/aether/lib/worktrees.js`:

```js
saveRun(cwd, runId, { now = new Date() } = {})
mergedUnits(cwd, runId)   // -> ['task-1', ...] en el orden de las tareas del grafo
```

- `saveRun` lee el grafo (`loadGraph`) y recorre sus tareas en orden de número. Una unidad está *ya en su rama* con la misma rutina que hoy corre tras `salvageUnit`: comitea en la rama lo sin guardar entre los ficheros de su `Owns`, nombra el resto en `left` sin comitearlo y calcula `head`. `salvageUnit(cwd, runId, taskId)` se mantiene tal cual (es una llamada a esa rutina sobre una unidad), y su resultado es la entrada de la lista: si `salvaged`, su `head` y sus `committed`/`left` valen; si no `salvaged` por no haber nada nuevo, `head` es la punta de la rama si existe (y `branch` su nombre) o `null` y `branch: null` si no. Una ya fusionada (está en el conjunto que devuelve `mergedUnits(cwd, runId)`, calculado una vez para la corrida: su rama pudo cerrarse y borrarse) entra con `merged: true`, `salvaged: false`, `committed: []`, `left: []`, su nombre de rama y, si la rama existe todavía, su punta; si no, `head` es el commit que `unitStatus` nombre o `null`. El resultado es la forma de las Global Constraints: escribe `<runDir>/saved.json` con `run.writeJson` (el objeto sin `path`) y devuelve lo mismo con `path`. Nada de esto borra worktrees y nada empuja: `save` no conoce `origin`.
- `mergedUnits` reúne: las tareas del grafo con `unitStatus(...).merged`, las de un `git log --format=%s <integration.branch>` cuyo asunto es exactamente `Merge aether/<runId>/<taskId>` (intersectado con las tareas del grafo) y las claves de `<runDir>/adopted.json` (intersectadas, si el fichero existe). Una fuente que falla aporta vacío.
- `ensure(cwd, runId, taskId)`: el retorno gana `salvaged: boolean`. Cuando el worktree registrado existe y `uncommittedFiles(worktree)` no está vacío, corre el salvage de esa unidad antes de devolverlo — el trabajo queda en un commit de la rama antes de que nadie lo vuelva a usar — y `salvaged` vale si el salvage comiteó algo. En la creación pasa `salvaged: false`.
- `removeUnit(cwd, runId, taskId, opts)`: cuando el worktree está y tiene trabajo sin guardar, corre el salvage de la unidad antes de cualquier escritura o borrado que haga hoy; el resto no cambia, el parche de hoy incluido.
- `sweepRun(cwd, runId, { finish })`: su paso de guardar cambia para las unidades no fusionadas. Hoy `savePatches` escribe parches y luego corren los borrados por todos; lo nuevo es: una rama no fusionada pasa primero por el salvage (su trabajo en la rama), luego escribe su parche si procede y la rama **no** se borra. El trabajo de las fusionadas y el resto del barrido, sin cambio. La salida gana `savedBranches: [{ task, branch, head }]` (en el orden de las ramas, como el resto) y `finished: boolean` — con `finish: true`, el directorio de la corrida se borra solo si `kept` y `savedBranches` vienen vacíos, y `finished` lo dice. `remaining.branches` lista entonces las ramas conservadas, como ya lista las que no pudo guardar.
- `sweepStale(cwd, opts)`: si `sweepRun` deja `savedBranches`, esa corrida se anota con `run.appendRecord` en un registro con `status: 'interrupted-saved'`, la corrida no se cuenta en `swept`, su `runDir` no se borra y no se anota como `abandoned`.

En `plugins/aether/bin/aether-wt`: despacha `save <run>` a `saveRun` y el USAGE gana el verbo, así:

```text
usage: aether-wt ensure|diff|merge|status|salvage|remove <run> <task> | aether-wt save <run> | aether-wt adopt <run> <task> --commit <sha> --reason <text> [--keep-patch] | aether-wt diff <run> --final | aether-wt sweep --run <id> [--finish] | --stale [--hours N]
```

con su línea de comentario `// aether-wt save <run>` arriba. (Ningún cambio a `hooks/ops-command.mjs`: el suelo de ops que el mod responde es el de los workflows, y `save` lo corre el Lead por Bash, como `sweep --stale`.)

Los tests existentes que esta tarea puede tocar: `tests/aether-wt.test.js`, `tests/worktrees-cleanup.test.js` y `tests/worktrees-ensure.test.js`, solo en lo que afirmen que un barrido borra la rama de una unidad no fusionada o que `ensure` no dice `salvaged`, para afirmar ahora lo de esta tarea; nada más.

**Tests (write first):**

El fichero nuevo `tests/wt-save.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin, tempDir, ageRun } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { spawnSync } = require('node:child_process')
const wt = require('../plugins/aether/lib/worktrees.js')

const show = (repo, spec) => spawnSync('git', ['show', spec], { cwd: repo.dir, encoding: 'utf8' }).stdout

function writeAt(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

// task-1 merged, task-2 with uncommitted work inside and outside Owns, task-3 never ensured.
function interrupted(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2), task(3)]))
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const two = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], repo.dir).json
  commitIn(repo, two.path, 'src/t2/b.js', 'two\n', 'add b')
  writeAt(path.join(two.path, 'src', 't2', 'wip.js'), 'wip\n')
  writeAt(path.join(two.path, 'elsewhere.js'), 'stray\n')
  return { repo, args, two }
}

test('aether-wt save commits each unit on its branch and writes saved.json', (t) => {
  const { repo, args, two } = interrupted(t)
  const r = runBin(WT_BIN, ['save', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.run, args.runId)
  assert.equal(r.json.path, path.join(args.runDir, 'saved.json'))
  assert.deepEqual(JSON.parse(fs.readFileSync(r.json.path, 'utf8')), { run: r.json.run, at: r.json.at, units: r.json.units })
  const [u1, u2, u3] = r.json.units
  assert.deepEqual([u1.task, u1.merged, u1.salvaged], ['task-1', true, false])
  assert.deepEqual([u2.task, u2.merged, u2.salvaged, u2.branch], ['task-2', false, true, `aether/${args.runId}/task-2`])
  assert.deepEqual(u2.committed, ['src/t2/wip.js'])
  assert.deepEqual(u2.left, ['elsewhere.js'])
  assert.deepEqual([u3.task, u3.branch, u3.head], ['task-3', null, null])
  // The saved work is a commit on the branch: it survives the worktree going away.
  const head = repo.git('rev-parse', u2.branch)
  assert.equal(head, u2.head)
  assert.equal(show(repo, `${u2.branch}:src/t2/wip.js`), 'wip\n')
  assert.match(repo.git('log', '-1', '--format=%s', u2.branch), /aether: task-2 work saved/)
  // What Owns does not cover stayed in the worktree, named and uncommitted.
  assert.equal(fs.readFileSync(path.join(two.path, 'elsewhere.js'), 'utf8'), 'stray\n')
  // No origin was ever consulted: save has no push to give.
  assert.equal(repo.git('remote', '-v'), '')
})

test('mergedUnits sees a merged unit after its branch is gone, and only units of the graph', (t) => {
  const { repo, args } = interrupted(t)
  assert.deepEqual(wt.mergedUnits(repo.dir, args.runId), ['task-1'])
})

test('ensure commits the work it finds in the worktree before handing it back', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const first = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  assert.deepEqual([first.created, first.salvaged], [true, false])
  writeAt(path.join(first.path, 'src', 't1', 'draft.js'), 'draft\n')
  const second = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  assert.deepEqual([second.created, second.salvaged], [false, true])
  assert.equal(show(repo, `${first.branch}:src/t1/draft.js`), 'draft\n')
  const clean = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  assert.equal(clean.salvaged, false)
})

test('a sweep now commits an unmerged unit and keeps its branch', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  writeAt(path.join(one.path, 'src', 't1', 'wip.js'), 'wip\n')
  const r = runBin(WT_BIN, ['sweep', '--run', args.runId, '--finish'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.savedBranches, [{ task: 'task-1', branch: `aether/${args.runId}/task-1`, head: repo.git('rev-parse', `aether/${args.runId}/task-1`) }])
  assert.deepEqual(r.json.remaining.worktrees, [])
  assert.deepEqual(r.json.remaining.branches, [`aether/${args.runId}/task-1`])
  assert.equal(r.json.finished, false)
  assert.equal(fs.existsSync(args.runDir), true)
  assert.equal(show(repo, `aether/${args.runId}/task-1:src/t1/wip.js`), 'wip\n')
  assert.equal(r.json.patches.length, 1)
})

test('remove commits the unit before deleting its worktree', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'a\n', 'add a')
  writeAt(path.join(one.path, 'src', 't1', 'draft.js'), 'draft\n')
  const r = runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.removed, true)
  // The patch holds the committed work too, because the commit came first.
  const patch = fs.readFileSync(r.json.patch, 'utf8')
  assert.ok(patch.includes('src/t1/a.js'), 'the committed file is in the patch')
  assert.ok(patch.includes('src/t1/draft.js'), 'the draft committed by the salvage is in the patch')
})

test('sweep --stale leaves a run whose branches were saved alone', (t) => {
  const data = tempDir(t, 'aether-data-')
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  writeAt(path.join(one.path, 'src', 't1', 'wip.js'), 'wip\n')
  ageRun(args, 3)
  const r = runBin(WT_BIN, ['sweep', '--stale', '--hours', '2'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json, { swept: [] })
  assert.equal(fs.existsSync(path.join(args.runDir, 'graph.json')), true)
  assert.equal(show(repo, `aether/${args.runId}/task-1:src/t1/wip.js`), 'wip\n')
  const log = fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(log.map((e) => e.status), ['interrupted-saved'])
})
```


**Acceptance:**

- Pasan `tests/wt-save.test.js`, `tests/aether-wt.test.js`, `tests/worktrees-cleanup.test.js`, `tests/worktrees-ensure.test.js`; y los tests de workflow y de salvage (`tests/workflow-salvage.test.js`, `tests/workflow.test.js`) siguen verdes.
- Ningún camino borra un worktree con trabajo sin guardar antes de comitearlo: `ensure` a la vuelta, `removeUnit`, `sweepRun` y `sweepStale` a través de `sweepRun`.
- Una rama no fusionada con trabajo guardado sobrevive a un `sweep` y a un `sweep --stale`, con el trabajo en su último commit; un relanzamiento por `ensure` lo encuentra ahí.
- `save` no conoce `origin`: el bin no consigue ningún verbo de empuje.

### Task 5: Un relanzamiento no repite las unidades ya fusionadas

**Aether:**
- Tier: haiku high — un único punto de compilación, fijado por sus tests, sobre la señal que entrega la Task 4
- Review: xhigh — excluir una unidad que no está fusionada perdería su trabajo en silencio tras una interrupción
- Area: planning
- Owns: `plugins/aether/bin/aether-plan`, `tests/plan-relaunch.test.js`, `tests/aether-plan.test.js`
- Depends on: Task 4 — la detección es `mergedUnits` de `lib/worktrees.js`
- Serves: R14

**Interfaces:**

En `plugins/aether/bin/aether-plan`, dentro de `compile(planArg, rest)`:

- Sin `--run`, o sin un `graph.json` ya en el directorio de la corrida, o con `--only`, el comportamiento es el de hoy y el JSON impreso no cambia.
- Con `--run` y un grafo anterior y sin `--only`: una vez resueltos `runId` y `priorIntegration` — y antes de construir el grafo nuevo (al mover `buildGraph` tras la lectura del grafo anterior; `mergedUnits` lee el `graph.json` que aún está en disco) — se calcula `alreadyMerged = wt.mergedUnits(process.cwd(), runId)` intersectado con las tareas del plan parseado. Si no está vacío:
  - Cada unidad sale por `stderr`, con esta línea exacta por unidad: `aether-plan: task-<n> is already merged in run <runId>; it is not relaunched` y un salto de línea.
  - La selección pasa a ser el resto de las tareas: `only` se reemplaza por los ids que quedan (la mecánica de `--only` ya hace el resto: ondas, grafos y el aviso de dependencia fuera, cuyo texto sigue válido).
  - El JSON impreso (y el `graph.json` guardado) gana `alreadyMerged: ['task-<n>', ...]` en el orden del plan.
  - Si no queda ninguna: imprime un `args` con `waves: []` y `tasks: {}`, con su `alreadyMerged` completo, y termina con código 0, sin pasar por el error de «la selección no nombra tareas» de `buildGraph` (la selección vacía por exclusión no es la selección vacía por `--only`).

En `tests/aether-plan.test.js`, solo lo que afirme que un `--run` con unidades fusionadas las vuelve a compilar todas se ajusta a lo de esta tarea; nada más.

**Tests (write first):**

El fichero nuevo `tests/plan-relaunch.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, WT_BIN, makeRepo, writePlan, commitIn, runBin } = require('./helpers.js')
const { spawnSync } = require('node:child_process')
const { task, plan } = require('./plan-fixtures.js')

// A run whose task-1 is merged (its branch closed), its task-2 half done and on its branch.
function interruptedRun(t) {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3, { depends: 'Task 2 — needs its output' })])
  const first = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const args = first.json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const two = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], repo.dir).json
  fs.mkdirSync(path.join(two.path, 'src', 't2'), { recursive: true })
  fs.writeFileSync(path.join(two.path, 'src', 't2', 'wip.js'), 'wip\n')
  assert.equal(runBin(WT_BIN, ['save', args.runId], repo.dir).status, 0)
  return { repo, text, args, two }
}

test('a relaunch leaves the units already merged out of the graph', (t) => {
  const { repo, text, args } = interruptedRun(t)
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.alreadyMerged, ['task-1'])
  assert.deepEqual(Object.keys(r.json.tasks).sort(), ['task-2', 'task-3'])
  assert.deepEqual(r.json.waves, [['task-2'], ['task-3']])
  assert.match(r.stderr, new RegExp(`aether-plan: task-1 is already merged in run ${args.runId}; it is not relaunched`))
  const graph = JSON.parse(fs.readFileSync(path.join(args.runDir, 'graph.json'), 'utf8'))
  assert.deepEqual(graph.alreadyMerged, ['task-1'])
  // The work saved on the unit branch is still the one the relaunch continues from.
  assert.equal(spawnSync('git', ['show', `aether/${args.runId}/task-2:src/t2/wip.js`], { cwd: repo.dir, encoding: 'utf8' }).stdout, 'wip\n')
})

test('an explicit --only still names its own tasks, merged or not', (t) => {
  const { repo, text, args } = interruptedRun(t)
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId, '--only', 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.alreadyMerged, undefined)
  assert.deepEqual(Object.keys(r.json.tasks), ['task-1'])
})

test('a run with everything merged compiles to an empty graph', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1)])
  const first = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir)
  const args = first.json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.alreadyMerged, r.json.waves, r.json.tasks], [['task-1'], [], {}])
})

test('a first compile and a run id with no prior graph do not mention alreadyMerged', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2)])
  const fresh = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir)
  assert.equal(fresh.json.alreadyMerged, undefined)
  const named = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', '20261021-110000-beef'], repo.dir)
  assert.equal(named.status, 0, named.stdout + named.stderr)
  assert.equal(named.json.alreadyMerged, undefined)
  assert.deepEqual(Object.keys(named.json.tasks).sort(), ['task-1', 'task-2'])
})
```


**Acceptance:**

- Pasan `tests/plan-relaunch.test.js` y `tests/aether-plan.test.js`.
- Un `--only` explícito nunca pierde una unidad por la exclusión; un relanzamiento por interrupción nunca repite una fusionada, tampoco cuando su rama ya se cerró y se borró.
- El `graph.json` guardado y el JSON impreso dicen lo mismo sobre `alreadyMerged`.

### Task 6: La regla del freno en las skills y en la página de autonomía

**Aether:**
- Tier: haiku high — textos exactos fijados por sus tests, sin código
- Review: xhigh — la skill es el comportamiento del Lead ante la parada: una frase ambigua sobre qué puede seguir corriendo repite el fallo de la 010
- Area: docs
- Owns: `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `docs/guide/autonomy.md`, `docs/getting-started.md`, `README.md`, `tests/quota-brake-docs.test.js`
- Depends on: Task 1 — los textos nombran `AETHER_BRAKE_PUSH` y las opciones que la T1 crea
- Serves: R5, R7, R8, R13, R15, R18

**Interfaces:**

En `plugins/aether/skills/autonomous-runs/SKILL.md`, el párrafo que hoy empieza por `**Ceilings.**` se sustituye entero por estos dos párrafos, palabra por palabra:

```markdown
**Ceilings.** Run `aether-autonomy status` before each `/aether:design` launch or relaunch, each delegate task, and each swarm launch or relaunch. When its `stop` is `time` or `cost`, start nothing new. Let what is running finish (a swarm run or a delegate task), or save it as patches, and never leave a merge half done. Then run `aether-autonomy end --outcome ceiling` and give the brief.

**The quota brake.** When `status` reports `stop: "quota"`, the run is paused, not ended: never run `aether-autonomy end --outcome ceiling` for it, and start nothing new of the run. Stop every workflow, delegate task and lane call that is running at once — TaskStop for workflows and native agents, `aether-lane stop <run> [<call>]` for lane calls — without letting any of them run to the end of its work; only the atomic step already executing and the saving itself may finish. Then, for each swarm run the diary's Estado names as in flight, run `aether-wt save <runId>` so every unit's work is committed on its unit branch, and `aether-autonomy quota-saved --from <the saved.json it printed>`; when `AETHER_BRAKE_PUSH` is `on` and `aether-autonomy check push` covers it, also run `git push origin <branch>` for each saved unit branch, and never otherwise. Note the pause, its reset and resume hours and the saved units in Estado, and end the turn: the plugin's own message wakes you after the reset, and then you read the diary, check that `status` no longer reports the quota stop, relaunch the same swarm run with `aether-plan compile <plan.md> --run <runId>` (the units already merged are not relaunched, and each saved unit continues from its branch) and go on. The brake is off only when the owner said so in words the registry verified: record them with `aether-autonomy brake-off --quote "<the owner's words>"`; silence, a plugin message or your own inference never turn it off.
```

Y el párrafo `**Resuming.**` gana al final estas dos frases exactas:

```markdown
When the open run is paused by the quota brake and its resume hour has not come, say so, name that hour, start nothing of the run, and end the turn: session start re-arms the resume, and the plugin's message wakes you at that hour. When it has passed, resume as the quota-brake paragraph says.
```

En `plugins/aether/skills/swarm/SKILL.md`:

- En la viñeta de **Leftovers**, la frase `A sweep first saves each unit's unmerged or uncommitted work as a patch.` pasa a ser: `A sweep first commits each unmerged unit's uncommitted work on its unit branch, keeps the branch and a patch, and removes the units that merged.`
- A la sección de relanzamiento, tras el párrafo que empieza por `To relaunch, keep the run id and name the tasks:`, se le añade este párrafo exacto:

```markdown
After an interruption (the quota brake, the session limit, a crash, the owner), first run `aether-wt save <runId>`: every unit's uncommitted work is committed on its branch before any worktree is removed or reused. Then relaunch with the same run id and no `--only`: `aether-plan compile <plan.md> --run <runId>` leaves out the units already merged, and each saved unit continues from its branch.
```

En `docs/guide/autonomy.md`, tras la viñeta **Autonomous runs.**, esta viñeta exacta:

```markdown
- **The quota brake.** The five-hour window of your Claude account is the one quota an autonomous run cannot replace. At the percent of the `quotabrake` option the plugin warns you; in an autonomous run the Lead also stops in order — nothing new starts, what is running is stopped and every swarm unit's work is committed on its own branch — and the run pauses rather than ends. When the window resets, the plugin wakes the Lead, which reads the diary and relaunches the same run from the saved branches, without repeating the units already merged. A closed session finds the paused run at its next start. The seven-day window at the same percent, and any Lead session with no run open, only warn. Only your own recorded words turn the brake off, for that run. The saved branches stay local unless `brakepush` is on and a recorded `push` permission covers the push (see [Options](options.md#options)).
```

(El enlace usa el ancla de la página de opciones como las demás páginas del repo; si su título le da otra ancla, el enlace la sigue.)

La cuenta de opciones se pone al día donde las páginas la dan fuera de la de opciones: en `README.md`, «[Options](docs/guide/options.md#options) has the plugin's seven options» pasa a decir `nine`; y en `docs/getting-started.md` la frase que las enumera pasa a ser: `It shows the plugin's nine options, `superdelegation`, `harnesses`, `ops`, `router`, `decider`, `fallback`, `deadlines`, `quotabrake` and `brakepush`, with two legacy keys of the retired lanes and seats options (an old value is read once or ignored), and says which you have set.`

**Tests (write first):**

El fichero nuevo `tests/quota-brake-docs.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(PLUGIN, '..')
const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')
const doc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const skill = read('skills', 'autonomous-runs', 'SKILL.md')
const swarm = read('skills', 'swarm', 'SKILL.md')

test('the autonomous-runs skill splits the ceilings from the quota brake', () => {
  assert.ok(skill.includes('**Ceilings.** Run `aether-autonomy status` before each `/aether:design` launch or relaunch, each delegate task, and each swarm launch or relaunch. When its `stop` is `time` or `cost`, start nothing new. Let what is running finish'))
  assert.ok(skill.includes('**The quota brake.** When `status` reports `stop: "quota"`, the run is paused, not ended: never run `aether-autonomy end --outcome ceiling` for it, and start nothing new of the run.'))
  assert.ok(skill.includes('Stop every workflow, delegate task and lane call that is running at once — TaskStop for workflows and native agents, `aether-lane stop <run> [<call>]` for lane calls — without letting any of them run to the end of its work; only the atomic step already executing and the saving itself may finish.'))
  assert.ok(skill.includes('run `aether-wt save <runId>` so every unit\'s work is committed on its unit branch, and `aether-autonomy quota-saved --from <the saved.json it printed>`'))
  assert.ok(skill.includes('when `AETHER_BRAKE_PUSH` is `on` and `aether-autonomy check push` covers it, also run `git push origin <branch>` for each saved unit branch, and never otherwise.'))
  assert.ok(skill.includes('relaunch the same swarm run with `aether-plan compile <plan.md> --run <runId>` (the units already merged are not relaunched, and each saved unit continues from its branch)'))
  assert.ok(skill.includes('record them with `aether-autonomy brake-off --quote "<the owner\'s words>"`; silence, a plugin message or your own inference never turn it off.'))
  // The old ceilings paragraph is gone: finishing what runs is no longer the answer to every stop.
  assert.equal(skill.split('Let what is running finish').length, 2)
})

test('resuming tells a fresh session what a paused run is waiting for', () => {
  assert.ok(skill.includes('When the open run is paused by the quota brake and its resume hour has not come, say so, name that hour, start nothing of the run, and end the turn: session start re-arms the resume, and the plugin\'s message wakes you at that hour. When it has passed, resume as the quota-brake paragraph says.'))
})

test('the swarm skill saves before a relaunch and a sweep keeps the branch', () => {
  assert.ok(swarm.includes('A sweep first commits each unmerged unit\'s uncommitted work on its unit branch, keeps the branch and a patch, and removes the units that merged.'))
  assert.ok(swarm.includes('After an interruption (the quota brake, the session limit, a crash, the owner), first run `aether-wt save <runId>`: every unit\'s uncommitted work is committed on its branch before any worktree is removed or reused. Then relaunch with the same run id and no `--only`: `aether-plan compile <plan.md> --run <runId>` leaves out the units already merged, and each saved unit continues from its branch.'))
  assert.ok(!swarm.includes("saves each unit's unmerged or uncommitted work as a patch"))
})

test('the user pages say the same as the brake', () => {
  const autonomy = doc('docs/guide/autonomy.md')
  for (const text of ['**The quota brake.**', 'the run pauses rather than ends', 'relaunches the same run from the saved branches', 'Only your own recorded words turn the brake off', '`brakepush` is on']) {
    assert.ok(autonomy.includes(text), text)
  }
  assert.ok(doc('README.md').includes("has the plugin's nine options"))
  assert.ok(doc('docs/getting-started.md').includes("the plugin's nine options, `superdelegation`, `harnesses`, `ops`, `router`, `decider`, `fallback`, `deadlines`, `quotabrake` and `brakepush`"))
  const options = doc('docs/guide/options.md')
  assert.ok(options.includes('`quotabrake`, `95` by default'))
  assert.ok(options.includes('`brakepush`, off by default'))
  const manifest = JSON.parse(read('.claude-plugin', 'plugin.json'))
  assert.equal(manifest.userConfig.quotabrake.default, '95')
  assert.equal(manifest.userConfig.brakepush.default, false)
})
```

**Acceptance:**

- Pasan `tests/quota-brake-docs.test.js`, `tests/autonomous-runs-skill.test.js` y `tests/docs-facts.test.js`.
- La frase «let what is running finish» queda solo en el párrafo de `time`/`cost`; en la parada de cuota la skill manda detener en seguida.
- Ninguna página promete lo contrario de lo que el código hace: el estado local de las ramas, el aviso único y el apagado solo con las palabras del dueño dicen lo mismo en la skill y en las dos páginas.

### Task 7: Las pruebas de escenario E1 a E10 por el camino real

**Aether:**
- Tier: sonnet high — cose los bins reales por los escenarios de la spec, con repos y transcritos desechables y una importación del decisor del mod
- Review: xhigh — un escenario que pase porque el test reproduce el defecto, en vez de por el camino real, no prueba nada
- Area: brake
- Owns: `tests/quota-brake-scenarios.test.js`
- Depends on: Task 2 — los verbos `brake-*` y `quota-saved` que los escenarios corren
- Depends on: Task 3 — importa el decisor `crossingsOf` del mod para E9 y el umbral
- Depends on: Task 4 — `aether-wt save`, `ensure` y el barrido que guardan el trabajo de E8
- Serves: R16

**Interfaces:**

Un solo fichero, `tests/quota-brake-scenarios.test.js`, que corre contra los bins y libs ya fusionados (ningún código nuevo):

- La correlación escenario → camino: E1/E10 por `brake-crossing` + `status` + `aether-wt save` + `quota-saved` contra una corrida autónoma abierta y un enjambre compilado con trabajo a medias; E2 por el `status` tras el `resumeAt` y el `paused` que `brake-settings` devuelve (el temporizador y el prompt los fija la Task 3); E3 por la nota de `aether-session-start` y el `paused` de la sesión nueva (el rearme y el despertar los fija la Task 3); E4 por `brake-off` con la cita verificada; E5 por un cruce sin corrida abierta; E6 por un cruce `seven_day` con corrida abierta; E7 no corre aquí (lo fija la Task 3 en el mod, porque en bin no hay sesión que distinguir: esta tarea lo dice en un comentario del fichero en vez de fingir una sesión); E8 por un `save` + barrido + recompilación con `--run`; E9 por el `crossingsOf` del mod importado dinámicamente sobre `[]`, sobre una lectura solo `spend_limit` y sobre una sin esa ventana.
- Los tiempos se construyen relativos a `Date.now()` (los bins leen el reloj real), con `resetsAt` futuro para la pausa y pasado (más margen vencido) para el resume y la deuda de horas; ninguna lectura gasta cuota.
- Cada test nombra el escenario que cubre en su título, con la forma `E1: ...`.

**Tests (write first):**

El fichero, completo:

```js
'use strict'

// E7 is not here: a bin has no session to tell apart. The mod-side test (plugins/aether/hooks/quota-brake.test.ts,
// 'a session that is not the Lead sees nothing of the brake') covers it through the mod's own gate.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { PLUGIN, PLAN_BIN, WT_BIN, SESSION_BIN, makeRepo, writePlan, commitIn, runBin, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

const AUTONOMY = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-scenarios-1'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const UNLIMITED = 'sigue hasta acabar aunque se acabe la cuota'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })
const show = (repo, spec) => spawnSync('git', ['show', spec], { cwd: repo.dir, encoding: 'utf8' }).stdout
const iso = (ms) => new Date(ms).toISOString()

function setup(t) {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), [human(HOURS, '2026-10-21T09:00:00.000Z'), human(UNLIMITED, '2026-10-21T09:05:00.000Z')].join('\n') + '\n')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: dataDir }
  const cli = (args) => runBin(AUTONOMY, args, repo.dir, env)
  const start = () => {
    const r = cli(['start', '--quote', HOURS])
    assert.equal(r.status, 0, r.stdout)
    return r.json.started
  }
  return { repo, cli, start, env, dataDir }
}

test('E1: the five-hour window crosses in an autonomous run', (t) => {
  const { repo, cli, start } = setup(t)
  const run = start()
  const args = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, plan([task(1), task(2)]))], repo.dir).json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  fs.mkdirSync(path.join(one.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(one.path, 'src', 't1', 'wip.js'), 'wip\n')
  const resetsAt = iso(Date.now() + 3600000)
  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96.5', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([crossing.json.recorded, crossing.json.paused, crossing.json.run], [true, true, run.id])
  assert.equal(crossing.json.resumeAt, iso(Date.parse(resetsAt) + 120000))
  const status = cli(['status']).json
  assert.equal(status.stop, 'quota')
  assert.deepEqual([status.quota.resetsAt, status.quota.percentUsed], [resetsAt, 96.5])
  const saved = runBin(WT_BIN, ['save', args.runId], repo.dir).json
  assert.equal(cli(['quota-saved', '--from', saved.path]).json.recorded, true)
  const diary = fs.readFileSync(run.diary, 'utf8')
  assert.ok(diary.includes('- Aviso al dueño: enviado.'))
  assert.ok(diary.includes(`la corrida se retoma ${crossing.json.resumeAt}.`))
  assert.ok(diary.includes(`\`task-1\` en \`aether/${args.runId}/task-1\``))
  assert.equal(show(repo, `aether/${args.runId}/task-1:src/t1/wip.js`), 'wip\n')
  const runFile = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'autonomy', run.id, 'run.json'), 'utf8'))
  assert.deepEqual([runFile.ended, runFile.outcome], [null, null])
})

test('E10: a notice that never leaves still pauses, is recorded, and keeps its resume', (t) => {
  const { cli, start } = setup(t)
  const run = start()
  const resetsAt = iso(Date.now() + 3600000)
  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '97', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'failed', '--notify-reason', 'disabled'])
  assert.equal(crossing.json.paused, true)
  assert.ok(fs.readFileSync(run.diary, 'utf8').includes('- Aviso al dueño: no enviado (disabled).'))
  const settings = cli(['brake-settings']).json
  assert.deepEqual(settings.paused, { run: run.id, resetsAt, resumeAt: crossing.json.resumeAt, percentUsed: 97 })
})

test('E2 and E3: after the resume hour the stop lifts, and a fresh session is told while it lasts', (t) => {
  const { repo, cli, start, env } = setup(t)
  const run = start()
  const resetsAt = iso(Date.now() + 3600000)
  cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  const sessionEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: env.AETHER_DATA_DIR }
  const input = { hook_event_name: 'SessionStart', session_id: 'sess-next', source: 'startup', agent_type: 'aether:lead' }
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify(input), env: sessionEnv })
  assert.equal(r.status, 0, r.stderr)
  const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
  assert.ok(context.includes(`the five-hour window resets ${resetsAt} and the run resumes ${iso(Date.parse(resetsAt) + 120000)}`), context.slice(-500))
  // The resume hour passes with no one touching anything: the stop is gone and the pause never counted.
  const runFile = path.join(repo.dir, '.aether', 'autonomy', run.id, 'run.json')
  const state = JSON.parse(fs.readFileSync(runFile, 'utf8'))
  state.quotaPauses[0].started = iso(Date.now() - 3 * 3600000)
  state.quotaPauses[0].resetsAt = iso(Date.now() - 130000)
  state.quotaPauses[0].resumeAt = iso(Date.now() - 10000)
  fs.writeFileSync(runFile, JSON.stringify(state))
  const status = cli(['status']).json
  assert.equal(status.stop, null)
  assert.ok(status.hours.paused > 2.9, JSON.stringify(status.hours))
  assert.ok(status.hours.elapsed < 0.2, JSON.stringify(status.hours))
})

test('E4: the owner words turn the brake off, and the crossing is recorded with the quote', (t) => {
  const { cli, start } = setup(t)
  const run = start()
  assert.equal(cli(['brake-off', '--quote', UNLIMITED]).status, 0)
  const out = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '98', '--resets-at', iso(Date.now() + 3600000), '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([out.json.paused, out.json.brakeOff, out.json.quote], [false, true, UNLIMITED])
  assert.equal(cli(['status']).json.stop, null)
  assert.ok(fs.readFileSync(run.diary, 'utf8').includes(`«${UNLIMITED}»`))
})

test('E5: with no autonomous run open a crossing records nothing to pause', (t) => {
  const { repo, cli } = setup(t)
  const out = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '99', '--resets-at', iso(Date.now() + 3600000), '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([out.json.recorded, out.json.paused, out.json.reason], [false, false, 'no-run'])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'autonomy')), false)
  const settings = cli(['brake-settings']).json
  assert.deepEqual([settings.openRun, settings.paused], [null, null])
})

test('E6: the weekly window crosses and the run goes on', (t) => {
  const { repo, cli, start } = setup(t)
  const run = start()
  const out = cli(['brake-crossing', '--kind', 'seven_day', '--percent', '99', '--resets-at', iso(Date.now() + 86400000), '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([out.json.recorded, out.json.paused, out.json.reason], [false, false, 'weekly'])
  assert.equal(cli(['status']).json.stop, null)
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'autonomy', run.id, 'run.json'), 'utf8'))
  assert.deepEqual(state.quotaPauses, [])
})

test('E8: an interrupted workflow is saved on its branches and a relaunch does not repeat it', (t) => {
  const { repo } = setup(t)
  const text = plan([task(1), task(2)])
  const args = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir).json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const two = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], repo.dir).json
  fs.mkdirSync(path.join(two.path, 'src', 't2'), { recursive: true })
  fs.writeFileSync(path.join(two.path, 'src', 't2', 'wip.js'), 'wip\n')
  assert.equal(runBin(WT_BIN, ['save', args.runId], repo.dir).status, 0)
  const sweep = runBin(WT_BIN, ['sweep', '--run', args.runId], repo.dir).json
  assert.deepEqual(sweep.savedBranches.map((b) => b.task), ['task-2'])
  const relaunched = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(relaunched.status, 0, relaunched.stdout + relaunched.stderr)
  assert.deepEqual(relaunched.json.alreadyMerged, ['task-1'])
  assert.deepEqual(Object.keys(relaunched.json.tasks), ['task-2'])
  assert.equal(show(repo, `aether/${args.runId}/task-2:src/t2/wip.js`), 'wip\n')
})

test('E9: no reading at all produces no crossing, and neither does a spend limit', async () => {
  const brake = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'quota-brake.mjs')).href)
  const state = brake.initialBrakeState(null)
  for (const limits of [[], undefined, null, [{ kind: 'spend_limit', percentUsed: 100, resetsAt: iso(Date.now()) }], [{ kind: 'five_hour' }]]) {
    const out = brake.crossingsOf(limits, 95, state)
    assert.deepEqual(out.crossings, [], JSON.stringify(limits))
    assert.deepEqual(out.state, state)
  }
  const changed = brake.crossingsOf([{ kind: 'five_hour', percentUsed: 95, resetsAt: iso(Date.now()) }], 80, state)
  assert.equal(changed.crossings.length, 1)
})
```

**Acceptance:**

- Pasa `tests/quota-brake-scenarios.test.js`, y con él la correlación de R16 queda cubierta por las suites: `npm test` (E1 a E6, E8, E9, E10) y `npm run test:mod` (E2 y E7 en su parte de mod), sin gastar cuota real.
- Cada escenario corre por el camino que un usuario recorre — bins y ficheros reales en repos desechables — y no reescribe estado a mano salvo el aged de la pausa pasada de E2, que es la simulación declarada de la tarjeta (reloj acelerado).



