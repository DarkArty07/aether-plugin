# Tasks: Destrabar en marcha una unidad del enjambre (034-unstick-unit)

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Intent:** [intent.md](intent.md)

## Global Constraints

- **Node.js 22 y CommonJS, sin dependencias nuevas.** Cada archivo nuevo de `plugins/aether/lib/` es de la familia `wt` (`wt-config.js`, `wt-stuck.js`, `wt-watch.js`): lleva `// Family: wt.` en su cabecera, no deja nombres sin uso y no usa variables `AETHER_*` nuevas. Los bins siguen delgados: la lógica vive en `lib/` (`tests/bins-thin.test.js`, 160 líneas como máximo, sin `fs`).
- **Sin red, sin modelos y sin gasto en las pruebas.** Todo se prueba con los repositorios temporales de `tests/helpers.js`, con el arnés de `tests/workflow-harness.js` y con el modelo falso. Ninguna prueba duerme más de 2 segundos de verdad: las pausas de las libs se inyectan.
- **El formato del estado de la espera es este, y todas las tareas lo comparten.**
  - Rutas (las da `lib/run.js`, tarea 1): `<runDir>/stuck/<task>.json` (el registro), `<runDir>/heartbeat.json` (el latido), `<runDir>/launch-end.json` (el fin de corrida) y `<runDir>/ladder/<task>-stuck.json` (la carga del motivo).
  - Registro: `{ run, task, reason, branch, worktree, head, outside: [archivos fuera de Owns], left: [archivos sin confirmar fuera de Owns], at, state }`, con `state` en `waiting | delivered | declined | ended`, y además `delivered: { commit, reason, at }`, `declined: { reason, at }` o `ended: { outcome, at }`. Una unidad está **atendida** cuando su `state` no es `waiting`.
  - Carga de `stuck`: el JSON `{ "reason": "<texto>" }`, con la huella de `lib/lanes.js` (`digest`).
  - Resultados de `aether-wt` (una línea de JSON): `stuck` → `{ stuck: true, task, state: 'waiting', branch, worktree, head, outside, left }`; `stuck-tick` → `{ paused, state, stop, commit?, reason? }`; `stuck-end` → `{ ended: true, task, outcome }`; `deliver` → `{ delivered: true, task, commit, reason }`; `decline` → `{ declined: true, task, reason }`; `watch` → `{ watch: 'stuck', run, task, reason, branch, worktree, head, outside, left }`, `{ watch: 'ended', run, stuck: [{ task, outcome }], message }` o `{ watch: 'silent', run, message: 'sin señal de la corrida', silentSeconds }`. Un error es `{ error }` con salida 1, como en los demás verbos.
  - Resultado del flujo: una unidad arreglada en marcha trae `fixedByLead: { commit, reason }` (el `commit` es el que el Lead entregó, el del arreglo que pide R10; el commit de fusión queda en `unit.commit`, como en cualquier unidad) y `status: 'merged'`; ninguna otra unidad gana campos.
- **Mensajes en inglés, tal como están escritos aquí**, porque las pruebas los comparan; las dos frases en español de la vigilancia (`sin señal de la corrida`, `nada se trabó`) son las del spec.
- **Los verificadores estructurales** `tests/guards-*.test.js`, `tests/dormant-030.test.js` y `tests/layers.test.js` no los edita ninguna tarea; si uno falla por un cambio, el cambio se corrige en el archivo propio.
- **Fuera de alcance de toda tarea** (spec, «Out of scope»): la escalera, `/aether:design`, que el Lead escriba en la rama de integración mientras el flujo corre, `skills/using-aether` (no se toca ni una línea), la versión, `git push` y la fusión a `main`, y escribir bajo `specs/` o `.specify/`.
- **Antes de dar una tarea por hecha**, `npm test` pasa entero (lo corre cada fusión).

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US3] La configuración de la espera, las rutas del estado y el borrado de lo del lanzamiento anterior, en `plugins/aether/config/swarm.json`, `lib/wt-config.js`, `lib/run.js` y `lib/plan-compile.js` → Task 1
- [ ] T002 [P] [US1] [US4] [US7] Abrir, medir, cerrar, entregar y declinar la espera de una unidad, en `plugins/aether/lib/wt-stuck.js` → Task 2
- [ ] T003 [P] [US1] [US5] [US6] [US7] La vigilancia y la marca de fin de corrida, en `plugins/aether/lib/wt-watch.js` y `lib/worktrees.js` → Task 3
- [ ] T004 [US1] [US4] [US7] Los seis verbos nuevos de `aether-wt`, en `plugins/aether/bin/aether-wt` → Task 4
- [ ] T005 [P] [US1] El mod reconoce `stuck`, `stuck-tick` y `stuck-end`, en `plugins/aether/hooks/ops-command.mjs` y `hooks/register.js` → Task 5
- [ ] T006 [P] [US1] [US2] [US3] [US4] [US5] [US6] [US7] La espera, el arreglo y las promesas de unidad del flujo, y los escenarios, en `plugins/aether/workflows/run.workflow.js` y `tests/workflow-harness.js` → Task 6
- [ ] T007 [P] [US1] El informe cuenta la unidad arreglada en marcha, en `plugins/aether/lib/report.js` → Task 7
- [ ] T008 [P] [US1] [US3] [US7] Las reglas del Lead y las guías, en `plugins/aether/skills/swarm/SKILL.md` y `docs/` → Task 8

---

### Task 1: La configuración de la espera, las rutas del estado y el borrado de lo del lanzamiento anterior

**Aether:**
- Area: config
- Owns: `plugins/aether/config/swarm.json`, `plugins/aether/lib/wt-config.js`, `plugins/aether/lib/run.js`, `plugins/aether/lib/plan-compile.js`, `tests/wt-config.test.js`, `tests/aether-plan.test.js`
- Depends on: none
- Serves: R8

**Interfaces:**

`plugins/aether/config/swarm.json` (nuevo, exactamente estas dos claves):

```json
{ "stuckWaitSeconds": 1800, "watchSilenceSeconds": 2400 }
```

`plugins/aether/lib/wt-config.js` (nuevo, `// Family: wt.`):

```js
// loadSwarmConfig(file = <config/swarm.json junto al plugin>) -> { stuckWaitSeconds, watchSilenceSeconds }
//  - stuckWaitSeconds: entero >= 0 (0 apaga la espera). Obligatorio.
//  - watchSilenceSeconds: entero >= 1. Si falta, vale stuckWaitSeconds + 600.
//  - Un archivo que falta, no es JSON, no es un objeto o tiene un valor inválido lanza un Error cuyo mensaje empieza `swarm config`.
function loadSwarmConfig(file) {}
module.exports = { loadSwarmConfig }
```

`plugins/aether/lib/run.js` gana y exporta, junto a `runDir`:

```js
stuckDir(mainRoot, runId)                 // <runDir>/stuck
stuckFile(mainRoot, runId, taskId)        // <runDir>/stuck/<taskId>.json
heartbeatFile(mainRoot, runId)            // <runDir>/heartbeat.json
launchEndFile(mainRoot, runId)            // <runDir>/launch-end.json
stuckPayloadFile(mainRoot, runId, taskId) // <runDir>/ladder/<taskId>-stuck.json
```

`plugins/aether/lib/plan-compile.js`: los argumentos que imprime `aether-plan compile` ganan `stuckWaitSeconds` (de `loadSwarmConfig()`), en la posición justo después de `maxAgents` (`Object.keys(args).pop()` debe seguir siendo `lanes`). Antes de escribir `graph.json`, el compile borra `stuck/`, `heartbeat.json` y `launch-end.json` del directorio de la corrida: son del lanzamiento, y un relanzamiento (`--run <id>`) no hereda la marca de fin ni una espera del anterior.

**Tests (write first):**

`tests/wt-config.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { loadSwarmConfig } = require('../plugins/aether/lib/wt-config.js')
const run = require('../plugins/aether/lib/run.js')

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'plugins', 'aether', 'config', 'swarm.json')
const RUN = '20261112-010203-ab12'

test('swarm.json holds the wait and the watch cap, and loadSwarmConfig returns them', () => {
  const file = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  assert.deepEqual(Object.keys(file).sort(), ['stuckWaitSeconds', 'watchSilenceSeconds'])
  assert.equal(file.stuckWaitSeconds, 1800)
  assert.equal(file.watchSilenceSeconds, 2400)
  assert.deepEqual(loadSwarmConfig(), file)
})

test('no code file repeats the default wait: it is read from the configuration', () => {
  for (const rel of ['plugins/aether/workflows/run.workflow.js', 'plugins/aether/lib/wt-stuck.js', 'plugins/aether/lib/wt-watch.js']) {
    const file = path.join(ROOT, rel)
    if (fs.existsSync(file)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\b1800\b/, rel)
  }
})

test('loadSwarmConfig reads the numbers of the file it is given, and refuses a bad file', (t) => {
  const dir = tempDir(t)
  const write = (value) => {
    const file = path.join(dir, 'swarm.json')
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
    return file
  }
  assert.deepEqual(loadSwarmConfig(write({ stuckWaitSeconds: 60, watchSilenceSeconds: 90 })), { stuckWaitSeconds: 60, watchSilenceSeconds: 90 })
  assert.equal(loadSwarmConfig(write({ stuckWaitSeconds: 0, watchSilenceSeconds: 90 })).stuckWaitSeconds, 0)
  // Without a cap of its own the watch waits the stuck wait plus 600 s.
  assert.deepEqual(loadSwarmConfig(write({ stuckWaitSeconds: 100 })), { stuckWaitSeconds: 100, watchSilenceSeconds: 700 })
  const bad = [{ stuckWaitSeconds: -1 }, { stuckWaitSeconds: 1.5 }, { stuckWaitSeconds: '60' }, { stuckWaitSeconds: 60, watchSilenceSeconds: 0 }, {}, [], 'not json']
  for (const value of bad) assert.throws(() => loadSwarmConfig(write(value)), /^Error: swarm config/, JSON.stringify(value))
  assert.throws(() => loadSwarmConfig(path.join(dir, 'missing.json')), /^Error: swarm config/)
})

test('run.js names the files of a wait under the run directory', () => {
  const dir = `/repo/.aether/runs/${RUN}`
  assert.equal(run.stuckDir('/repo', RUN), `${dir}/stuck`)
  assert.equal(run.stuckFile('/repo', RUN, 'task-1'), `${dir}/stuck/task-1.json`)
  assert.equal(run.heartbeatFile('/repo', RUN), `${dir}/heartbeat.json`)
  assert.equal(run.launchEndFile('/repo', RUN), `${dir}/launch-end.json`)
  assert.equal(run.stuckPayloadFile('/repo', RUN, 'task-1'), `${dir}/ladder/task-1-stuck.json`)
})

test('compile puts the configured wait in the args, right after maxAgents and before lanes', (t) => {
  const args = compile(makeRepo(t), plan([task(1)]))
  assert.equal(args.stuckWaitSeconds, loadSwarmConfig().stuckWaitSeconds)
  const keys = Object.keys(args)
  assert.equal(keys.indexOf('stuckWaitSeconds'), keys.indexOf('maxAgents') + 1)
  assert.equal(keys.pop(), 'lanes')
})

test('a compile of the same run clears the wait records, the heartbeat and the end mark of the launch before', (t) => {
  const repo = makeRepo(t)
  const markdown = plan([task(1)])
  const first = compile(repo, markdown)
  fs.mkdirSync(run.stuckDir(repo.dir, first.runId), { recursive: true })
  fs.writeFileSync(run.stuckFile(repo.dir, first.runId, 'task-1'), '{}\n')
  fs.writeFileSync(run.heartbeatFile(repo.dir, first.runId), '{}\n')
  fs.writeFileSync(run.launchEndFile(repo.dir, first.runId), '{}\n')
  const again = compile(repo, markdown, ['--run', first.runId])
  assert.equal(again.runId, first.runId)
  assert.equal(fs.existsSync(run.stuckDir(repo.dir, first.runId)), false)
  assert.equal(fs.existsSync(run.heartbeatFile(repo.dir, first.runId)), false)
  assert.equal(fs.existsSync(run.launchEndFile(repo.dir, first.runId)), false)
})
```

**Acceptance:**
- `node --test tests/wt-config.test.js` y `npm test` pasan.
- Los argumentos de `aether-plan compile` traen `stuckWaitSeconds` leído de `config/swarm.json`; ningún archivo de código repite el 1800.
- Un compile de la misma corrida deja sin `stuck/`, `heartbeat.json` ni `launch-end.json`.

### Task 2: Abrir, medir, cerrar, entregar y declinar la espera de una unidad

**Aether:**
- Area: wt-stuck
- Owns: `plugins/aether/lib/wt-stuck.js`, `tests/wt-stuck.test.js`
- Depends on: Task 1 — usa las rutas de `lib/run.js` (`stuckFile`, `heartbeatFile`, `launchEndFile`, `stuckPayloadFile`)
- Serves: R1, R2, R4, R8

**Interfaces:**

`plugins/aether/lib/wt-stuck.js` (nuevo, `// Family: wt.`). Todas las funciones toman `cwd` (cualquier directorio del repositorio, como las de `worktrees.js`), validan `runId` y `taskId` con `run.assertRunId` y `run.assertTaskId`, y lanzan `Error` (el bin imprime `{ error }`):

```js
const OUTCOMES = ['expired', 'ceiling', 'declined', 'merged', 'rejected']

// Abre la espera. Primero se comprueba que la unidad esté en el grafo de la corrida (si no: `task-9 is not in run <id>`) y, después,
// que `payload` sea exactamente run.stuckPayloadFile(...) (si no: `payload path must be <ruta>`),
// existir, y su huella (lanes.digest del texto) debe ser `digest` (si no: `digest does not match the payload file`);
// su JSON trae `reason` (texto no vacío). La unidad no debe estar ya esperando
// (`task-1 is already waiting for a fix`). Guarda el trabajo con worktrees.salvageUnit (confirma en la rama lo que
// Owns cubre), y escribe el registro en `waiting`: `outside` son los archivos cambiados de la rama que Owns no
// cubre, y `left` los que quedaron sin confirmar fuera de Owns; `head` es la punta de la rama de la unidad.
function stuckBegin(cwd, runId, taskId, { payload, digest } = {}) {}
//   -> { stuck: true, task, state: 'waiting', branch, worktree, head, outside, left }

// Un tick: valida `seconds` (entero de 1 a 120; si no: `--seconds must be a whole number from 1 to 120`),
// duerme seconds * 1000 ms con `sleep` (por defecto, setTimeout), escribe el latido
// `{ at: <ISO>, task }` en heartbeatFile, lee el registro (sin registro: `task-1 has no stuck record`) y responde.
// `stopped()` (por defecto: autonomy.status(mainRoot) con open y stop === 'time'; un error cuenta como false)
// dice si el techo de horas de la corrida autónoma se alcanzó.
async function stuckTick(cwd, runId, taskId, seconds, { sleep, stopped } = {}) {}
//   -> { paused: <seconds como número>, state, stop: <boolean> }
//      más, con state 'delivered', commit (hash completo) y reason (la del Lead);
//      con state 'declined', reason (la del Lead).

// Cierra el registro: state 'ended' con ended { outcome, at }. `outcome` debe estar en OUTCOMES
// (si no: `unknown outcome: <x>`). Sin registro: `task-1 has no stuck record`. Si ya estaba 'ended',
// devuelve lo mismo con `already: true` y no cambia nada.
function stuckEnd(cwd, runId, taskId, outcome) {}
//   -> { ended: true, task, outcome }

// El Lead entrega el arreglo. Rechaza (sin cambiar nada): falta --commit (`deliver needs --commit <sha>`) o --reason
// (`deliver needs --reason <what you fixed>`); la corrida ya dejó launchEndFile (`run <id> has ended`); la unidad no
// espera (sin registro o con state distinto de 'waiting': `task-1 is not waiting for a fix`); el commit no resuelve
// (`<x> is not a commit of this repository`) o no es la punta de la rama de la unidad
// (`the commit must be the tip of aether/<run>/task-1`). No toca la rama de integración. Guarda state 'delivered'
// con delivered { commit (completo), reason, at }.
function deliverFix(cwd, runId, taskId, { commit, reason } = {}) {}
//   -> { delivered: true, task, commit, reason }

// El Lead declina. Mismas negativas que deliverFix menos las del commit (`decline needs --reason <why>`).
// Guarda state 'declined' con declined { reason, at }.
function declineUnit(cwd, runId, taskId, { reason } = {}) {}
//   -> { declined: true, task, reason }

module.exports = { OUTCOMES, stuckBegin, stuckTick, stuckEnd, deliverFix, declineUnit }
```

**Tests (write first):**

`tests/wt-stuck.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const run = require('../plugins/aether/lib/run.js')
const { digest } = require('../plugins/aether/lib/lanes.js')
const stuck = require('../plugins/aether/lib/wt-stuck.js')

function scenario(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  return { repo, args, unit }
}

function begin(s, reason = 'the ladder is spent (exhausted)', { path: file, digest: sum } = {}) {
  const target = file || run.stuckPayloadFile(s.repo.dir, s.args.runId, 'task-1')
  const text = JSON.stringify({ reason })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
  return stuck.stuckBegin(s.repo.dir, s.args.runId, 'task-1', { payload: target, digest: sum || digest(text) })
}

const record = (s, id = 'task-1') => JSON.parse(fs.readFileSync(run.stuckFile(s.repo.dir, s.args.runId, id), 'utf8'))
const quick = { sleep: async () => {}, stopped: () => false }
const tip = (s) => s.repo.git('-C', s.unit.path, 'rev-parse', 'HEAD')

test('begin saves the unit work, names the files outside Owns, and records the wait', (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'docs/outside.md', 'outside\n', 'outside owns')
  fs.mkdirSync(path.join(s.unit.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(s.unit.path, 'src', 't1', 'b.js'), 'owned but not committed\n')
  const out = begin(s)
  assert.deepEqual([out.stuck, out.task, out.state], [true, 'task-1', 'waiting'])
  assert.equal(out.branch, `aether/${s.args.runId}/task-1`)
  assert.equal(out.worktree, s.unit.path)
  assert.deepEqual(out.outside, ['docs/outside.md'])
  assert.equal(s.repo.git('-C', s.unit.path, 'status', '--porcelain'), '', 'the owned work was committed')
  assert.equal(out.head, tip(s))
  const saved = record(s)
  assert.deepEqual([saved.run, saved.task, saved.reason, saved.state], [s.args.runId, 'task-1', 'the ladder is spent (exhausted)', 'waiting'])
  assert.deepEqual(saved.outside, ['docs/outside.md'])
  assert.match(saved.at, /^\d{4}-\d\d-\d\dT/)
  assert.ok(fs.existsSync(s.unit.path), 'the worktree is kept while the unit waits')
})

test('begin refuses a payload at another path, a wrong digest, an unknown unit and a unit that already waits', (t) => {
  const s = scenario(t)
  const other = path.join(s.args.runDir, 'ladder', 'task-2-stuck.json')
  assert.throws(() => begin(s, 'x', { path: other }), /payload path must be/)
  assert.throws(() => begin(s, 'x', { digest: '00000000:1' }), /digest does not match the payload file/)
  assert.throws(() => stuck.stuckBegin(s.repo.dir, s.args.runId, 'task-9', { payload: other, digest: '00000000:1' }), /task-9 is not in run/)
  begin(s)
  assert.throws(() => begin(s), /task-1 is already waiting for a fix/)
})

test('a tick sleeps its seconds, writes the heartbeat and reports the state', async (t) => {
  useDataDir(t) // the default `stopped` reads the autonomy registry: it must not read the real data directory
  const s = scenario(t)
  begin(s)
  const slept = []
  const out = await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 30, { sleep: async (ms) => slept.push(ms), stopped: () => false })
  assert.deepEqual(out, { paused: 30, state: 'waiting', stop: false })
  assert.deepEqual(slept, [30000])
  const beat = JSON.parse(fs.readFileSync(run.heartbeatFile(s.repo.dir, s.args.runId), 'utf8'))
  assert.equal(beat.task, 'task-1')
  assert.match(beat.at, /^\d{4}-\d\d-\d\dT/)
  for (const bad of [0, 121, '1.5', 'x', undefined]) {
    await assert.rejects(() => stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', bad, quick), /--seconds must be a whole number from 1 to 120/)
  }
  assert.equal((await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 5, { sleep: async () => {}, stopped: () => true })).stop, true)
  // With no open autonomous run (the data directory of the test is empty), the default says the ceiling was not reached.
  assert.equal((await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, { sleep: async () => {} })).stop, false)
  await assert.rejects(() => stuck.stuckTick(s.repo.dir, s.args.runId, 'task-2', 5, quick), /task-2 has no stuck record/)
})

test('deliver takes the tip of the unit branch, and the next tick reports it with the Lead reason', async (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'one\n', 'first')
  const first = tip(s)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'two\n', 'the fix')
  const second = tip(s)
  begin(s)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: first, reason: 'x' }), /the commit must be the tip of aether\/.+\/task-1/)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: 'deadbeef', reason: 'x' }), /is not a commit of this repository/)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { reason: 'x' }), /deliver needs --commit/)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: second }), /deliver needs --reason/)
  assert.equal(record(s).state, 'waiting', 'a refused delivery changes nothing')
  const out = stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: second.slice(0, 10), reason: 'moved the test into Owns' })
  assert.deepEqual(out, { delivered: true, task: 'task-1', commit: second, reason: 'moved the test into Owns' })
  assert.equal(record(s).state, 'delivered')
  assert.equal(s.repo.git('rev-parse', s.args.integration.branch), s.args.integration.base, 'the integration branch is untouched')
  assert.deepEqual(await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, quick), { paused: 1, state: 'delivered', stop: false, commit: second, reason: 'moved the test into Owns' })
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: second, reason: 'again' }), /task-1 is not waiting for a fix/)
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', { reason: 'late' }), /task-1 is not waiting for a fix/)
})

test('decline records the Lead reason, the tick reports it, and a delivery is refused after it', async (t) => {
  const s = scenario(t)
  begin(s)
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', {}), /decline needs --reason/)
  assert.deepEqual(stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', { reason: 'the plan puts the test outside Owns' }), { declined: true, task: 'task-1', reason: 'the plan puts the test outside Owns' })
  assert.deepEqual(await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, quick), { paused: 1, state: 'declined', stop: false, reason: 'the plan puts the test outside Owns' })
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'x' }), /task-1 is not waiting for a fix/)
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-2', { reason: 'x' }), /task-2 is not waiting for a fix/)
})

test('end closes the record with its outcome, once, and refuses an unknown outcome', (t) => {
  const s = scenario(t)
  begin(s)
  assert.throws(() => stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'whenever'), /unknown outcome: whenever/)
  assert.deepEqual(stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'expired'), { ended: true, task: 'task-1', outcome: 'expired' })
  const saved = record(s)
  assert.equal(saved.state, 'ended')
  assert.equal(saved.ended.outcome, 'expired')
  assert.deepEqual(stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'ceiling'), { ended: true, task: 'task-1', outcome: 'expired', already: true })
  assert.throws(() => stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-2', 'expired'), /task-2 has no stuck record/)
  for (const outcome of stuck.OUTCOMES) assert.ok(['expired', 'ceiling', 'declined', 'merged', 'rejected'].includes(outcome))
})

test('a delivery and a declination are refused once the run left its end mark', (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'one\n', 'the fix')
  begin(s)
  fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'x' }), new RegExp(`run ${s.args.runId} has ended`))
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', { reason: 'x' }), new RegExp(`run ${s.args.runId} has ended`))
  assert.equal(record(s).state, 'waiting')
})
```

**Acceptance:**
- `node --test tests/wt-stuck.test.js` y `npm test` pasan.
- Ninguna función de `wt-stuck.js` escribe en la rama de integración ni crea un commit fuera de la rama de la unidad.
- El archivo declara `// Family: wt.`, no tiene nombres sin uso y no repite ningún número de `config/swarm.json`.

### Task 3: La vigilancia y la marca de fin de corrida

**Aether:**
- Area: wt-watch
- Owns: `plugins/aether/lib/wt-watch.js`, `plugins/aether/lib/worktrees.js`, `tests/wt-watch.test.js`, `tests/wt-sweep.test.js`, `tests/worktrees-cleanup.test.js`
- Depends on: Task 1 — usa las rutas de `lib/run.js` y `loadSwarmConfig` para el tope de silencio
- Serves: R3

**Interfaces:**

`plugins/aether/lib/wt-watch.js` (nuevo, `// Family: wt.`):

```js
// watchCommand(cwd, runId, { interval, silence, sleep, now } = {}) -> Promise de uno de los tres resultados.
//  - interval: segundos entre sondeos (número o texto numérico > 0; por defecto 5); silence: segundos de silencio que
//    cuentan como «sin señal» (número o texto entero >= 1; por defecto loadSwarmConfig().watchSilenceSeconds).
//    Un valor inválido lanza `--interval must be a number of seconds above 0` / `--silence must be a whole number of seconds from 1`.
//  - sleep(ms) y now() se inyectan en las pruebas (por defecto setTimeout y Date.now).
//  - La corrida debe existir (si no: `run <id> not found`).
// En cada sondeo, en este orden:
//  0. Calcula una vez por sondeo `silent`: la escritura más reciente bajo el directorio de la corrida (la fecha de
//     modificación más nueva de cualquier archivo o carpeta, recursivo, sin seguir enlaces; el latido cuenta) es más
//     vieja que `silence` segundos.
//  1. Si algún registro de stuckDir tiene state 'waiting' (no atendido) y no `silent`, devuelve el de menor número de
//     tarea: { watch: 'stuck', run, task, reason, branch, worktree, head, outside, left }. Un registro `waiting`
//     de una corrida en silencio es el de un flujo muerto o detenido (nadie lo atenderá: cada pausa de la espera
//     escribe el latido): no se avisa como trabada, y el paso 3 lo avisa como `silent`.
//  2. Si existe launchEndFile, devuelve { watch: 'ended', run, stuck: [{ task, outcome }], message }, con `outcome` el
//     de ended.outcome o, si no lo hay, el state del registro; message es `nada se trabó` sin registros y
//     `hubo <n> unidades trabadas` (`hubo 1 unidad trabada`) con ellos.
//  3. Si `silent`, devuelve { watch: 'silent', run, message: 'sin señal de la corrida', silentSeconds }, haya o no
//     un registro `waiting`.
//  4. Si no, duerme `interval` y sondea otra vez.
async function watchCommand(cwd, runId, options) {}
module.exports = { watchCommand }
```

`plugins/aether/lib/worktrees.js`: `sweepRun(cwd, runId, { finish = false, endMark = false } = {})` gana la opción `endMark`. Solo con `endMark: true`, y si el directorio de la corrida existe al terminar, escribe `run.launchEndFile(mainRoot, runId)` con `{ run, at: <ISO> }`; sin la opción no escribe nada, y con `finish` que borra el directorio tampoco deja nada. La opción la pasa únicamente el bin `aether-wt sweep --run` (tarea 4: `endMark` cuando no hay `--finish`), que es lo que ejecuta la limpieza del `finally` del flujo. **`sweepStale` no la pasa** (llama a `sweepRun(cwd, id)` sin opciones, `worktrees.js:1408`), ni la pasa `report.js` (`finish: true`): una pasada obsoleta que conserva el directorio de una corrida (parches, ramas guardadas o retenidas) no escribe en él, porque su prueba de actividad (`modifiedSince`, `worktrees.js:1317-1329`, usada en `:1400`) mira las fechas de los archivos del directorio y una marca nueva haría que esa corrida pareciera activa y que las pasadas siguientes la saltaran. Ningún otro comportamiento de `sweepRun` cambia.

**Tests (write first):**

`tests/wt-watch.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { makeRepo, compile, age, ageRun, commitIn, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const run = require('../plugins/aether/lib/run.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const { loadSwarmConfig } = require('../plugins/aether/lib/wt-config.js')
const { watchCommand } = require('../plugins/aether/lib/wt-watch.js')

function scenario(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  return { repo, args }
}

function put(s, taskId, extra = {}) {
  run.writeJson(run.stuckFile(s.repo.dir, s.args.runId, taskId), {
    run: s.args.runId,
    task: taskId,
    reason: `the reason of ${taskId}`,
    branch: `aether/${s.args.runId}/${taskId}`,
    worktree: `/w/${taskId}`,
    head: 'abc1234',
    outside: ['docs/x.md'],
    left: [],
    at: '2026-11-12T00:00:00.000Z',
    state: 'waiting',
    ...extra,
  })
}

const BIG = { interval: 0.001, silence: 100000 }
const quick = { ...BIG, sleep: async () => {} }

test('a unit that is already stuck ends the watch at once, with the run, the unit and the reason, and a second watch ends with it again', async (t) => {
  const s = scenario(t)
  put(s, 'task-2')
  put(s, 'task-1')
  const first = await watchCommand(s.repo.dir, s.args.runId, quick)
  assert.deepEqual(first, { watch: 'stuck', run: s.args.runId, task: 'task-1', reason: 'the reason of task-1', branch: `aether/${s.args.runId}/task-1`, worktree: '/w/task-1', head: 'abc1234', outside: ['docs/x.md'], left: [] })
  assert.deepEqual(await watchCommand(s.repo.dir, s.args.runId, quick), first)
})

test('an attended unit (delivered, declined or ended) does not end the watch, and the next stuck unit does', async (t) => {
  const s = scenario(t)
  put(s, 'task-1', { state: 'declined', declined: { reason: 'no', at: 'x' } })
  put(s, 'task-2')
  assert.equal((await watchCommand(s.repo.dir, s.args.runId, quick)).task, 'task-2')
  put(s, 'task-2', { state: 'delivered', delivered: { commit: 'abc', reason: 'fixed', at: 'x' } })
  fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
  const ended = await watchCommand(s.repo.dir, s.args.runId, quick)
  assert.equal(ended.watch, 'ended')
})

test('the watch waits while the run lives and ends when a unit gets stuck', async (t) => {
  const s = scenario(t)
  let polls = 0
  const out = await watchCommand(s.repo.dir, s.args.runId, {
    ...BIG,
    sleep: async () => {
      polls++
      if (polls === 3) put(s, 'task-1')
    },
  })
  assert.equal(polls, 3)
  assert.deepEqual([out.watch, out.task], ['stuck', 'task-1'])
})

test('at the end of the run the watch ends by itself and says whether anything got stuck', async (t) => {
  const s = scenario(t)
  fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
  assert.deepEqual(await watchCommand(s.repo.dir, s.args.runId, quick), { watch: 'ended', run: s.args.runId, stuck: [], message: 'nada se trabó' })
  put(s, 'task-1', { state: 'ended', ended: { outcome: 'expired', at: 'x' } })
  const out = await watchCommand(s.repo.dir, s.args.runId, quick)
  assert.deepEqual(out.stuck, [{ task: 'task-1', outcome: 'expired' }])
  assert.equal(out.message, 'hubo 1 unidad trabada')
})

test('a run with no sign of life ends the watch as silent, from the last write and not from the launch of the watch', async (t) => {
  const s = scenario(t)
  age(s.args.runDir, 2)
  const out = await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, silence: 600, sleep: async () => {} })
  assert.deepEqual([out.watch, out.message], ['silent', 'sin señal de la corrida'])
  assert.ok(out.silentSeconds >= 7200)
  // A heartbeat is a sign of life: with it the watch goes on, and then the end mark ends it. The watch writes nothing
  // and polls before it sleeps, so the heartbeat is written before the second watch starts (it also renews the
  // directory time), as a pause of the wait would have written it.
  fs.writeFileSync(run.heartbeatFile(s.repo.dir, s.args.runId), '{}\n')
  let polls = 0
  const alive = await watchCommand(s.repo.dir, s.args.runId, {
    interval: 0.001,
    silence: 600,
    sleep: async () => {
      polls++
      if (polls === 3) fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
    },
  })
  assert.equal(alive.watch, 'ended')
  assert.ok(polls >= 3)
})

test('a unit left waiting by a run that died is reported as silent, not as stuck, once the run is silent past the cap', async (t) => {
  const s = scenario(t)
  put(s, 'task-1')
  age(s.args.runDir, 2)
  const out = await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, silence: 600, sleep: async () => {} })
  assert.deepEqual([out.watch, out.message], ['silent', 'sin señal de la corrida'])
  // A run that still beats (the record is fresh) alerts the Lead as stuck, as before.
  put(s, 'task-1')
  assert.equal((await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, silence: 600, sleep: async () => {} })).watch, 'stuck')
})

test('the silence cap comes from swarm.json when the watch is not given one', async (t) => {
  const { watchSilenceSeconds } = loadSwarmConfig()
  const s = scenario(t)
  age(s.args.runDir, (watchSilenceSeconds + 600) / 3600)
  assert.equal((await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, sleep: async () => {} })).watch, 'silent')
  const fresh = scenario(t)
  age(fresh.args.runDir, (watchSilenceSeconds - 600) / 3600)
  let polls = 0
  const out = await watchCommand(fresh.repo.dir, fresh.args.runId, {
    interval: 0.001,
    sleep: async () => {
      if (++polls === 2) fs.writeFileSync(run.launchEndFile(fresh.repo.dir, fresh.args.runId), '{}\n')
    },
  })
  assert.equal(out.watch, 'ended')
})

test('a bad option and an unknown run are refused', async (t) => {
  const s = scenario(t)
  await assert.rejects(() => watchCommand(s.repo.dir, s.args.runId, { interval: 0 }), /--interval must be a number of seconds above 0/)
  await assert.rejects(() => watchCommand(s.repo.dir, s.args.runId, { silence: 0 }), /--silence must be a whole number of seconds from 1/)
  await assert.rejects(() => watchCommand(s.repo.dir, '20261112-000000-ffff', quick), /run 20261112-000000-ffff not found/)
})

test('sweepRun leaves the end mark only when it is asked for it, and a sweep that finishes the run leaves none', (t) => {
  const s = scenario(t)
  wt.sweepRun(s.repo.dir, s.args.runId)
  assert.equal(fs.existsSync(run.launchEndFile(s.repo.dir, s.args.runId)), false, 'without the option it writes nothing')
  wt.sweepRun(s.repo.dir, s.args.runId, { endMark: true })
  const mark = JSON.parse(fs.readFileSync(run.launchEndFile(s.repo.dir, s.args.runId), 'utf8'))
  assert.equal(mark.run, s.args.runId)
  assert.match(mark.at, /^\d{4}-\d\d-\d\dT/)
  const done = wt.sweepRun(s.repo.dir, s.args.runId, { finish: true, endMark: true })
  assert.equal(done.finished, true)
  assert.equal(fs.existsSync(s.args.runDir), false)
})

test('a stale sweep that keeps the directory of a run writes no end mark into it, so the run does not look active again', (t) => {
  useDataDir(t)
  const s = scenario(t)
  const unit = wt.ensure(s.repo.dir, s.args.runId, 'task-1')
  commitIn(s.repo, unit.path, 'src/t1/a.js', 'one\n', 'work that is not merged')
  ageRun(s.args, 48)
  assert.deepEqual(wt.sweepStale(s.repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(s.args.runDir), true, 'the unmerged work keeps the run directory')
  assert.equal(fs.existsSync(run.launchEndFile(s.repo.dir, s.args.runId)), false)
})
```

**Acceptance:**
- `node --test tests/wt-watch.test.js` y `npm test` pasan. Como `sweepRun` sin la opción `endMark` se comporta igual que hoy, las pruebas que ya existen de `sweepRun` y de la pasada obsoleta siguen pasando sin cambio: `tests/wt-sweep.test.js` y `tests/worktrees-cleanup.test.js` (de esta tarea; ninguna lista el contenido del directorio de la corrida) y las de otras tareas que no se tocan, `tests/layout-lanes.test.js`, `tests/aether-lane.test.js` y `tests/worktrees-merge.test.js`.
- La vigilancia no escribe nada y no toca ninguna rama; su tope de silencio sale de `swarm.json` cuando no se le da uno. Una pasada obsoleta no deja `launch-end.json`.

### Task 4: Los seis verbos nuevos de `aether-wt`

**Aether:**
- Area: wt-stuck
- Owns: `plugins/aether/bin/aether-wt`, `tests/aether-wt-stuck.test.js`, `tests/aether-wt.test.js`
- Depends on: Task 2 — llama a `stuckBegin`, `stuckTick`, `stuckEnd`, `deliverFix` y `declineUnit` de `lib/wt-stuck.js`
- Depends on: Task 3 — llama a `watchCommand` de `lib/wt-watch.js`
- Serves: R3, R4

**Interfaces:**

`plugins/aether/bin/aether-wt` gana, sin lógica propia (solo lee argumentos y llama a `lib/`):

```
aether-wt stuck <run> <task> --payload <ruta> --digest <huella>      -> wtStuck.stuckBegin(cwd, run, task, { payload, digest })
aether-wt stuck-tick <run> <task> --seconds <1 a 120>                 -> await wtStuck.stuckTick(cwd, run, task, seconds)
aether-wt stuck-end <run> <task> --outcome <expired|ceiling|declined|merged|rejected> -> wtStuck.stuckEnd(cwd, run, task, outcome)
aether-wt deliver <run> <task> --commit <sha> --reason <texto>        -> wtStuck.deliverFix(cwd, run, task, { commit, reason })
aether-wt decline <run> <task> --reason <texto>                       -> wtStuck.declineUnit(cwd, run, task, { reason })
aether-wt watch <run> [--interval <s>] [--silence <s>]                -> await wtWatch.watchCommand(cwd, run, { interval, silence })
aether-wt sweep --run <id> [--finish]  (ya existe)                    -> wt.sweepRun(cwd, id, { finish, endMark: !finish })
```

El último cambia una línea del verbo `sweep` que ya existe: sin `--finish` (la limpieza del `finally` del flujo), el bin pide la marca de fin de corrida (`endMark`); con `--finish` y en `sweep --stale` no la pide.

Los valores de las banderas pasan a la lib como el texto que son (la lib valida). Dos de los verbos son asíncronos: el bin espera su resultado antes de imprimirlo, y un error sigue saliendo como `{ error }` con salida 1. El texto `USAGE` y el comentario de cabecera nombran los seis verbos nuevos. El bin queda en 160 líneas o menos y sin `fs`.

**Tests (write first):**

`tests/aether-wt-stuck.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { digest } = require('../plugins/aether/lib/lanes.js')

const wt = (repo, ...args) => runBin(WT_BIN, args, repo.dir)

function waiting(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = wt(repo, 'ensure', args.runId, 'task-1').json
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'work')
  const file = path.join(args.runDir, 'ladder', 'task-1-stuck.json')
  const text = JSON.stringify({ reason: 'the ladder is spent (exhausted)' })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  const begun = wt(repo, 'stuck', args.runId, 'task-1', '--payload', file, '--digest', digest(text))
  return { repo, args, unit, begun, tip: repo.git('-C', unit.path, 'rev-parse', 'HEAD') }
}

test('stuck opens the wait, and watch ends at once with the run, the unit and the reason', (t) => {
  const s = waiting(t)
  assert.equal(s.begun.status, 0, s.begun.stdout + s.begun.stderr)
  assert.deepEqual([s.begun.json.stuck, s.begun.json.state, s.begun.json.head], [true, 'waiting', s.tip])
  const out = wt(s.repo, 'watch', s.args.runId, '--interval', '0.05', '--silence', '600')
  assert.equal(out.status, 0, out.stdout + out.stderr)
  assert.deepEqual([out.json.watch, out.json.run, out.json.task, out.json.reason], ['stuck', s.args.runId, 'task-1', 'the ladder is spent (exhausted)'])
})

test('a delivery goes through deliver, shows in the next tick, and the end closes the wait', (t) => {
  const s = waiting(t)
  const delivered = wt(s.repo, 'deliver', s.args.runId, 'task-1', '--commit', s.tip, '--reason', 'moved the test into Owns')
  assert.equal(delivered.status, 0, delivered.stdout + delivered.stderr)
  assert.deepEqual(delivered.json, { delivered: true, task: 'task-1', commit: s.tip, reason: 'moved the test into Owns' })
  const tick = wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '1')
  assert.deepEqual(tick.json, { paused: 1, state: 'delivered', stop: false, commit: s.tip, reason: 'moved the test into Owns' })
  assert.deepEqual(wt(s.repo, 'stuck-end', s.args.runId, 'task-1', '--outcome', 'merged').json, { ended: true, task: 'task-1', outcome: 'merged' })
})

test('decline attends the unit: the tick says so and a watch relaunched after it does not end with that unit', (t) => {
  const s = waiting(t)
  const declined = wt(s.repo, 'decline', s.args.runId, 'task-1', '--reason', 'the plan puts the test outside Owns')
  assert.deepEqual(declined.json, { declined: true, task: 'task-1', reason: 'the plan puts the test outside Owns' })
  assert.deepEqual(wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '1').json, { paused: 1, state: 'declined', stop: false, reason: 'the plan puts the test outside Owns' })
  age(s.args.runDir, 1)
  const out = wt(s.repo, 'watch', s.args.runId, '--interval', '0.05', '--silence', '600')
  assert.equal(out.json.watch, 'silent')
})

test('the commands refuse what the libs refuse, with an error line and exit 1', (t) => {
  const s = waiting(t)
  const noUnit = wt(s.repo, 'deliver', s.args.runId, 'task-1', '--commit', s.tip)
  assert.equal(noUnit.status, 1)
  assert.match(noUnit.json.error, /deliver needs --reason/)
  assert.match(wt(s.repo, 'stuck-tick', s.args.runId, 'task-1', '--seconds', '0').json.error, /--seconds must be a whole number from 1 to 120/)
  assert.match(wt(s.repo, 'stuck-end', s.args.runId, 'task-1', '--outcome', 'whenever').json.error, /unknown outcome/)
  assert.match(wt(s.repo, 'watch', s.args.runId, '--silence', '0').json.error, /--silence must be a whole number/)
  assert.match(wt(s.repo, 'decline', s.args.runId, 'task-2', '--reason', 'x').json.error, /task-2 is not in run|is not waiting/)
})

test('sweep --run leaves the end mark that the watch reads, and sweep --run --finish leaves none', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  assert.equal(wt(repo, 'sweep', '--run', args.runId).status, 0)
  assert.equal(fs.existsSync(path.join(args.runDir, 'launch-end.json')), true)
  const ended = wt(repo, 'watch', args.runId, '--interval', '0.05', '--silence', '600')
  assert.deepEqual([ended.json.watch, ended.json.message], ['ended', 'nada se trabó'])
  const other = compile(repo, plan([task(1)]))
  assert.equal(wt(repo, 'sweep', '--run', other.runId, '--finish').json.finished, true)
  assert.equal(fs.existsSync(other.runDir), false)
})

test('the usage line names the six new verbs', (t) => {
  const r = wt(makeRepo(t))
  assert.equal(r.status, 1)
  for (const verb of ['stuck ', 'stuck-tick', 'stuck-end', 'deliver', 'decline', 'watch']) assert.ok(r.json.error.includes(verb), verb)
})
```

**Acceptance:**
- `node --test tests/aether-wt-stuck.test.js tests/bins-thin.test.js tests/aether-wt.test.js` y `npm test` pasan.
- `bin/aether-wt` sigue con 160 líneas o menos, sin `fs` ni lógica de espera.

### Task 5: El mod reconoce `stuck`, `stuck-tick` y `stuck-end`

**Aether:**
- Area: mod
- Owns: `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/ops.test.ts`, `tests/ops-command-stuck.test.js`, `tests/ops-command.test.js`
- Depends on: none
- Serves: R8

**Interfaces:**

`plugins/aether/hooks/ops-command.mjs` acepta, con el mismo molde que `ladder` (cada token validado, sin analizar nunca la carga):

```
aether-wt stuck <RUN> <TASK> --payload <ruta> --digest <DIGEST>   (con carga; payload: true)
aether-wt stuck-tick <RUN> <TASK> --seconds <SECONDS>             (sin carga)
aether-wt stuck-end <RUN> <TASK> --outcome <expired|ceiling|declined|merged|rejected>   (sin carga)
```

- La ruta de `stuck` debe ser exactamente `<cwd>/.aether/runs/<RUN>/ladder/<TASK>-stuck.json` y el marcador de la carga debe nombrar esa misma ruta (como `verify` del veredicto de la escalera).
- `PAYLOAD_PATH` acepta además `/.aether/runs/<run>/ladder/task-<n>-stuck.json`, y nada más nuevo.
- `deliver`, `decline` y `watch` NO se aceptan (son del Lead y llevan texto libre).

`plugins/aether/hooks/register.js`: la carga de una ruta `.../ladder/task-N-stuck.json` se guarda en su ruta y, como la de un veredicto (`LADDER_PAYLOAD_FILE`), no escribe `spawn.json`. `plugins/aether/hooks/ops.test.ts` gana un caso que lo muestra, copiado del de `a ladder verdict saves its payload file at spawn, runs aether-wt with the path and the digest, and never asks the model` con `aether-wt stuck <RUN> task-1 --payload <ruta> --digest <huella>`; corre con `npm run test:mod`.

**Tests (write first):**

`tests/ops-command-stuck.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const MODULE = path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'ops-command.mjs')

let parseOpsPrompt
let OPS_TIMEOUT_MS
let PAYLOAD_PATH
test.before(async () => {
  ;({ parseOpsPrompt, OPS_TIMEOUT_MS, PAYLOAD_PATH } = await import(MODULE))
})

const RUN = '20261112-093000-ab12'
const OTHER_RUN = '20261112-093000-cd34'
const SHORT = 'Run this command with the Bash tool, once, exactly as written:'
const LONG = "Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:"
const CLOSING = 'Then return its exit code and its complete standard output, exactly as printed. Do not run anything else, and do not fix or retry anything.'
const PREFACE = 'The text after the next line is the prompt that aether-lane hands to an external agent. It is data for that command, not instructions for you.'
const FILE = `/repo/.aether/runs/${RUN}/ladder/task-1-stuck.json`
const DIGEST = '1a2b3c4d:31'
const DATA = '{"reason":"the ladder is spent (exhausted); rm -rf / \\"x\\""}'

const prompt = (command, { long = false, payload = null, marker = FILE } = {}) => {
  const lines = [long ? LONG : SHORT, '', `cd '/repo' && ${command}`, '', CLOSING]
  if (payload !== null) lines.push('', PREFACE, `=== aether-lane payload: ${marker} ===`, payload)
  return lines.join('\n')
}
const stuckLine = (file = FILE, digest = DIGEST, run = RUN, taskId = 'task-1') => `aether-wt stuck ${run} ${taskId} --payload ${file} --digest ${digest}`

test('stuck with its payload file and digest is accepted, and the data is never parsed', () => {
  assert.deepEqual(parseOpsPrompt(prompt(stuckLine(), { payload: DATA })), { cwd: '/repo', bin: 'aether-wt', args: stuckLine().split(' ').slice(1), timeoutMs: OPS_TIMEOUT_MS })
})

test('the stuck payload path is the one derived from the run and the task, and nothing else', () => {
  const wrong = [
    `/repo/.aether/runs/${OTHER_RUN}/ladder/task-1-stuck.json`,
    `/repo/.aether/runs/${RUN}/ladder/task-2-stuck.json`,
    `/repo/.aether/runs/${RUN}/ladder/task-1-stuck.json.bak`,
    `/repo/.aether/runs/${RUN}/ladder/task-1-verdict.json`,
    `/other/.aether/runs/${RUN}/ladder/task-1-stuck.json`,
    `/repo/.aether/runs/${RUN}/ladder/../task-1-stuck.json`,
    '/etc/passwd',
  ]
  for (const file of wrong) assert.equal(parseOpsPrompt(prompt(stuckLine(file), { payload: DATA, marker: file })), null, file)
})

test('the marker must name the same file as --payload, and the form needs its payload block', () => {
  assert.equal(parseOpsPrompt(prompt(stuckLine(), { payload: DATA, marker: `/repo/.aether/runs/${RUN}/ladder/task-2-stuck.json` })), null)
  assert.equal(parseOpsPrompt(prompt(stuckLine())), null)
  assert.equal(parseOpsPrompt(prompt(`aether-wt stuck-tick ${RUN} task-1 --seconds 120`, { payload: DATA })), null)
})

test('stuck-tick is accepted with its seconds and the long timeout, and a bad token is refused', () => {
  const line = `aether-wt stuck-tick ${RUN} task-1 --seconds 120`
  assert.deepEqual(parseOpsPrompt(prompt(line, { long: true })), { cwd: '/repo', bin: 'aether-wt', args: line.split(' ').slice(1), timeoutMs: OPS_TIMEOUT_MS })
  assert.notEqual(parseOpsPrompt(prompt(`aether-wt stuck-tick ${RUN} task-1 --seconds 5`)), null)
  for (const bad of ['--seconds x', '--seconds -5', '--seconds 1000', '--seconds', '--secs 5']) {
    assert.equal(parseOpsPrompt(prompt(`aether-wt stuck-tick ${RUN} task-1 ${bad}`)), null, bad)
  }
  assert.equal(parseOpsPrompt(prompt(`aether-wt stuck-tick ${RUN} task-1`)), null)
  assert.equal(parseOpsPrompt(prompt(`aether-wt stuck-tick bad-run task-1 --seconds 5`)), null)
})

test('stuck-end is accepted for each outcome and refused for another', () => {
  for (const outcome of ['expired', 'ceiling', 'declined', 'merged', 'rejected']) {
    const line = `aether-wt stuck-end ${RUN} task-1 --outcome ${outcome}`
    assert.deepEqual(parseOpsPrompt(prompt(line)), { cwd: '/repo', bin: 'aether-wt', args: line.split(' ').slice(1), timeoutMs: OPS_TIMEOUT_MS }, outcome)
  }
  assert.equal(parseOpsPrompt(prompt(`aether-wt stuck-end ${RUN} task-1 --outcome whenever`)), null)
  assert.equal(parseOpsPrompt(prompt(`aether-wt stuck-end ${RUN} task-1`)), null)
})

test('the Lead commands deliver, decline and watch are not answered by the mod', () => {
  assert.equal(parseOpsPrompt(prompt(`aether-wt deliver ${RUN} task-1 --commit abc1234 --reason fixed`)), null)
  assert.equal(parseOpsPrompt(prompt(`aether-wt decline ${RUN} task-1 --reason nope`)), null)
  assert.equal(parseOpsPrompt(prompt(`aether-wt watch ${RUN}`)), null)
})

test('PAYLOAD_PATH accepts the stuck payload file and no other new name', () => {
  assert.ok(PAYLOAD_PATH.test(FILE))
  assert.ok(PAYLOAD_PATH.test(`/repo/.aether/runs/${RUN}/ladder/task-12-stuck.json`))
  for (const bad of [`/repo/.aether/runs/${RUN}/ladder/task-1-other.json`, `/repo/.aether/runs/${RUN}/ladder/task-x-stuck.json`, `/repo/.aether/runs/${RUN}/stuck/task-1.json`]) {
    assert.equal(PAYLOAD_PATH.test(bad), false, bad)
  }
})
```

**Acceptance:**
- `node --test tests/ops-command-stuck.test.js tests/ops-command.test.js tests/ops-command-ladder.test.js tests/ops-command-lanes.test.js` y `npm test` pasan.
- `npm run test:mod` pasa, con el caso nuevo de `hooks/ops.test.ts` (si `claude` no está instalado donde corre la tarea, se dice en la respuesta y el Lead lo corre antes del PR).
- `hooks/register.js` no escribe `spawn.json` junto a la carga de `stuck`.

### Task 6: La espera, el arreglo y las promesas de unidad del flujo, y los escenarios

**Aether:**
- Review: xhigh — la espera cambia cómo se ordenan las olas y cuándo se fusiona: una fusión doble o perdida llegaría a la rama de integración, y es concurrencia pura
- Area: workflow
- Owns: `plugins/aether/workflows/run.workflow.js`, `tests/workflow-harness.js`, `tests/workflow-stuck.test.js`, `tests/run-workflow-paths.test.js`
- Depends on: Task 1 — el flujo lee `stuckWaitSeconds` de los argumentos que imprime `aether-plan compile`
- Depends on: Task 5 — la prueba comprueba que el mod reconoce las órdenes que el flujo construye
- Serves: R1, R5, R6, R7, R8, R9, R11

**Interfaces:**

Argumentos: `readArgs` acepta `stuckWaitSeconds`, entero >= 0 (si no, `aether:run args are missing or invalid: stuckWaitSeconds`); sin la clave vale 0, que apaga la espera. `const stuckWait = ...` lo guarda.

Una unidad es **trabada** (`isStuck(unit)`) cuando `stuckWait > 0`, `unit.status === 'blocked'`, `unit.attempts > 0` y su `reason`, antes de `blockHint`, empieza con `blocked-same-cause:`, `blocked-outside-owns:`, `the ladder is spent (exhausted)` o `merge failed again:`. Cualquier otro bloqueo (pregunta del supervisor, `lane:`, fusión sin verificar, `internal error`, ...) no espera.

Estructura (nombres libres salvo los que fija el spec; el comportamiento es el contrato):

1. **`done[id]`**: una promesa por unidad, resuelta cuando su estado es final (tras `close` y `blockHint`). `runUnit(id)` termina `work()` y, si la unidad es trabada, arranca `rescue(unit)` **sin esperarla** (la guarda en una lista `rescues`) y vuelve, de modo que la barrera de su ola se libera; si no, cierra la unidad como hoy y resuelve su `done`.
2. **`work()`**: antes de buscar la dependencia que no quedó `merged`, espera `done[d]` de cada dependencia `d` cuyo estado aún es `pending` o que está esperando un arreglo; después decide saltar o correr como hoy. Así los dependientes, directos e indirectos, de una trabada esperan su resultado, y los demás no.
3. **`mergeHeld(unit)`**: el bloque `serialized(...)` de la fusión de `work()` (`aether-wt merge`, `status`, rerun), extraído sin cambiar su comportamiento ni sus etiquetas, y usado por `work()` y por `rescue()`.
4. **`rescue(unit)`** (siempre acaba resolviendo `done[unit.id]` y no lanza):
   - abre la espera con una orden de ops cuya etiqueta es `<unit>: stuck`: `aether-wt stuck <run> <unit> --payload <runDir>/ladder/<unit>-stuck.json --digest <huella>`, con la carga `{"reason": unit.reason}` (el mismo mecanismo que `applyVerdict`, con la ruta citada por `shellArg`); si falla, lo anota con `log()` y la unidad queda bloqueada como hoy;
   - lo dice en la vista de progreso: `log('<unit>: stuck (<reason>); waiting up to <n> s for the Lead\'s fix')`;
   - hace `Math.ceil(stuckWait / CAP_TICK_SECONDS)` pausas, cada una un `agent(opsPrompt('aether-wt stuck-tick <run> <unit> --seconds <s>', { long: true }), { agentType: 'aether:ops', model: 'haiku', effort: 'low', phase: 'Merge', label: '<unit>: stuck wait <k>/<n>', schema: OPS_SCHEMA })` directo (como `capClock`: no pasa por `call()`, no cuenta en el presupuesto); la respuesta se lee de su última línea de JSON. Una pausa cuyo `paused` no es el pedido, o que falla, termina la espera con el resultado `expired` y lo anota;
   - `state: 'delivered'` en la respuesta: fusiona con `mergeHeld(unit)`, sin pasar por la escalera ni por una segunda espera. Fusionada (o fusionada tras el rerun por el corte), la unidad queda `merged` con `unit.commit = <commit de fusión>`, `unit.fixedByLead = { commit: <el commit que entregó el Lead, el que trae la respuesta `delivered` de la pausa, no el de fusión>, reason: <la del Lead> }` y **sin** veredicto `approve` de la escalera; no fusionada, queda `blocked` con `<motivo de siempre>. The Lead's fix was refused: <describeMerge(...)>` y `refusals[unit.id]` puesto como en `work()`; cierra con `stuck-end --outcome merged|rejected`;
   - `state: 'declined'`: termina la espera de inmediato; la unidad queda `blocked` con `<motivo de siempre>. The Lead declined to fix it: <motivo del Lead>`; cierra con `stuck-end --outcome declined`;
   - `stop: true`: la unidad queda `blocked` con su motivo de siempre; `stuck-end --outcome ceiling`; pasadas todas las pausas sin entrega: lo mismo con `--outcome expired`;
   - siempre al final: `close(unit)` si `unit.attempts > 0`, `blockHint(unit)` si la unidad quedó `blocked`, y se resuelve `done`.
5. **Después del ciclo de olas**, y también en el `finally` antes de `Promise.all(tookLogs)`, el flujo espera todas las `rescues` (`Promise.allSettled`); la revisión final se decide después, con los estados ya finales: una sola revisión por lanzamiento, cuyo paquete incluye la fusión del arreglo.

Con la espera apagada o sin unidades trabadas, el flujo hace las mismas llamadas, en el mismo orden, que antes: ninguna llamada nueva, ninguna unidad gana campos, y `Object.keys(result)` no cambia.

`tests/workflow-harness.js` (lo posee esta tarea):
- fija `stuckWaitSeconds` en los argumentos que da al flujo a `overrides.stuckWait` si el escenario lo da, o a 0 si no (aunque `aether-plan compile` haya puesto otro valor), sin tocar argumentos que no son un objeto;
- reconoce como pausas, igual que las `: deadline N/M`, las etiquetas `: stuck wait N/M`; por defecto no terminan, y con `overrides.deadline` el escenario contesta `{ exitCode, stdout }`; sin respuesta del escenario la pausa contesta `{ paused, state: 'waiting', stop: false }`; guarda también el `prompt` de cada pausa en `ticks`;
- lee los verbos con guion (`stuck-tick`, `stuck-end`) en `parseCommand` y la carga de `stuck` (`call.payload`, como la de `ladder`);
- contesta por defecto `stuck` con `{ stuck: true, task, state: 'waiting', branch, worktree, head, outside: [], left: [] }` y `stuck-end` con `{ ended: true, task, outcome }`.

**Tests (write first):**

`tests/workflow-stuck.test.js`:

```js
'use strict'

// Spec 034: a stuck unit waits for the Lead's fix while the others go on; the fix merges by the usual rules.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const OPS_MODULE = path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'ops-command.mjs')

// task-1 gets stuck (its implementer never answers, so its ladder is spent). task-2 is independent in its wave,
// task-3 depends on task-1, and task-4 is in a later wave and depends only on task-2.
function four(t) {
  return compile(makeRepo(t), plan([task(1), task(2), task(3, { depends: 'Task 1 — needs it' }), task(4, { depends: 'Task 2 — needs it' })]))
}
const stuckUnits = (...ids) => (call, implement) => (ids.includes(call.unit) ? null : implement(call))
const never = () => new Promise(() => {})
const reply = (seconds, extra = {}) => ({ exitCode: 0, stdout: `${JSON.stringify({ paused: seconds, state: 'waiting', stop: false, ...extra })}\n` })
// The script's clock for the wait of the stuck units: `answer(unit, n, seconds)` is the reply of the n-th tick of a unit.
function clock(answer) {
  const count = {}
  return async ({ label, seconds }) => {
    const found = /^(task-\d+): stuck wait \d+\/\d+$/.exec(label)
    if (!found) return never()
    const unit = found[1]
    count[unit] = (count[unit] || 0) + 1
    await new Promise((resolve) => setTimeout(resolve, 15))
    return answer(unit, count[unit], seconds)
  }
}
const byId = (run) => Object.fromEntries(run.result.units.map((u) => [u.id, u]))
const statuses = (run) => Object.values(byId(run)).map((u) => `${u.id} ${u.status}`)
const ticksOf = (run, unit) => run.ticks.filter((tick) => tick.label.startsWith(`${unit}: stuck wait`))
const endOf = (run, unit) => run.calls.find((c) => c.kind === 'ops:stuck-end' && c.unit === unit)

test('a stuck unit raises the alert, the others merge while it waits, and the Lead fix merges it and its dependents with one final review', async (t) => {
  const { parseOpsPrompt } = await import(OPS_MODULE)
  const order = []
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => {
      if (call.kind === 'ops:merge') order.push(`merge ${call.unit}`)
      return wt(call)
    },
    deadline: clock((unit, n, seconds) => {
      if (!order.includes('merge task-2') || !order.includes('merge task-4')) return reply(seconds)
      order.push('fix delivered')
      return reply(seconds, { state: 'delivered', commit: 'fix1234', reason: 'moved the test into Owns' })
    }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 merged', 'task-2 merged', 'task-3 merged', 'task-4 merged'])
  // The alert: the wait is recorded with the unit and its reason, and the progress view says so.
  const begin = run.calls.filter((c) => c.kind === 'ops:stuck')
  assert.equal(begin.length, 1)
  assert.equal(begin[0].unit, 'task-1')
  assert.deepEqual(JSON.parse(begin[0].payload.text), { reason: 'the ladder is spent (exhausted)' })
  assert.ok(run.logs.some((line) => /^task-1: stuck/.test(line) && /exhausted/.test(line)), run.logs.join('\n'))
  // The others went on while it waited: the independent unit of its wave and the one of the later wave merged first.
  const fix = order.indexOf('fix delivered')
  assert.ok(order.indexOf('merge task-2') < fix && order.indexOf('merge task-4') < fix, order.join(', '))
  assert.ok(fix < order.indexOf('merge task-1') && order.indexOf('merge task-1') < order.indexOf('merge task-3'), order.join(', '))
  // The fix is the unit's merge, not a rung of its ladder.
  const units = byId(run)
  // fixedByLead holds the commit the Lead delivered (R10); the merge commit is the unit's own.
  assert.deepEqual(units['task-1'].fixedByLead, { commit: 'fix1234', reason: 'moved the test into Owns' })
  assert.equal(units['task-1'].commit, 'merge-task-1')
  for (const id of ['task-2', 'task-3', 'task-4']) assert.equal(units[id].fixedByLead, undefined, id)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:ladder' && c.command.rest.includes('approve') && c.unit === 'task-1').length, 0)
  assert.deepEqual(endOf(run, 'task-1').command.rest, [run.result.runId, 'task-1', '--outcome', 'merged'])
  // One final review, after the fix merged, with the whole run in its package.
  assert.equal(run.logs.filter((line) => /^final review on /.test(line)).length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:diff').length, 1)
  assert.ok(run.events.indexOf('end ops:merge task-1') < run.events.indexOf('start ops:diff'))
  assert.equal(run.result.finalReview.status, 'done')
  // The pauses are not calls of the run, and the mod answers every command the wait sends.
  assert.equal(run.result.agents.total, run.calls.length)
  assert.ok(ticksOf(run, 'task-1').length >= 1)
  for (const tick of ticksOf(run, 'task-1')) assert.notEqual(parseOpsPrompt(tick.prompt), null, tick.prompt)
  for (const call of run.calls.filter((c) => /^ops:stuck/.test(c.kind))) assert.notEqual(parseOpsPrompt(call.prompt), null, call.prompt)
})

test('without a fix the wait ends by its time: the unit is blocked as today, its dependent is skipped, the others merged', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 240, implementer: stuckUnits('task-1'), deadline: clock((unit, n, seconds) => reply(seconds)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  const unit = byId(run)['task-1']
  assert.equal(unit.reason, 'the ladder is spent (exhausted)')
  assert.equal(unit.fixedByLead, undefined)
  assert.deepEqual(ticksOf(run, 'task-1').map((tick) => tick.seconds), [120, 120])
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'expired')
  assert.equal(run.result.finalReview.status, 'deferred')
  assert.equal(run.result.agents.total, run.calls.length)
})

test('the Lead who declines ends the wait at once; a second stuck unit keeps waiting and its fix merges', async (t) => {
  const args = compile(makeRepo(t), plan([task(1), task(2), task(3, { depends: 'Task 1 — a' }), task(4, { depends: 'Task 2 — b' })]))
  const run = await runWorkflow(args, {
    stuckWait: 3600,
    implementer: stuckUnits('task-1', 'task-2'),
    deadline: clock((unit, n, seconds) =>
      unit === 'task-1'
        ? reply(seconds, { state: 'declined', reason: 'the plan puts the test outside Owns' })
        : n < 3
          ? reply(seconds)
          : reply(seconds, { state: 'delivered', commit: 'abc1234', reason: 'fixed' }),
    ),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  const declined = byId(run)['task-1']
  assert.ok(declined.reason.startsWith('the ladder is spent (exhausted)'), declined.reason)
  assert.ok(declined.reason.includes('the plan puts the test outside Owns'), declined.reason)
  assert.equal(ticksOf(run, 'task-1').length, 1, 'the wait ended at its first pause')
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'declined')
  assert.equal(endOf(run, 'task-2').command.rest.at(-1), 'merged')
  assert.equal(run.calls.filter((c) => c.kind === 'ops:stuck').length, 2)
})

test('a fix the merge refuses leaves the unit blocked with that reason, and there is no second wait', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => (call.kind === 'ops:merge' && call.unit === 'task-1' ? { merged: false, reason: 'ownership', files: ['tests/other.test.js'], detail: '' } : wt(call)),
    deadline: clock((unit, n, seconds) => reply(seconds, { state: 'delivered', commit: 'bad1234', reason: 'tried' })),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  const unit = byId(run)['task-1']
  assert.match(unit.reason, /^the ladder is spent \(exhausted\)/)
  assert.match(unit.reason, /The Lead's fix was refused: .*tests\/other\.test\.js/)
  assert.equal(unit.fixedByLead, undefined)
  assert.equal(ticksOf(run, 'task-1').length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:stuck').length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:merge' && c.unit === 'task-1').length, 1)
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'rejected')
})

test('the time ceiling of an autonomous run ends the wait at once: the unit is blocked as today', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    deadline: clock((unit, n, seconds) => reply(seconds, { stop: true })),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  assert.equal(byId(run)['task-1'].reason, 'the ladder is spent (exhausted)')
  assert.equal(ticksOf(run, 'task-1').length, 1)
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'ceiling')
})

test('a pause that cannot run ends the wait with the unit blocked as today', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 3600, implementer: stuckUnits('task-1'), deadline: () => ({ exitCode: 1, stdout: '{"error":"no"}\n' }) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'expired')
})

test('a launch with no stuck unit changes nothing: no wait calls, no pauses, no new fields', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 3600 })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 merged', 'task-2 merged', 'task-3 merged', 'task-4 merged'])
  assert.deepEqual(run.calls.filter((c) => /^ops:stuck/.test(c.kind)), [])
  assert.deepEqual(run.ticks, [])
  assert.deepEqual(Object.keys(run.result), ['runId', 'units', 'finalReview', 'cleanup', 'agents', 'abandoned', 'lanes', 'error'])
  assert.ok(run.result.units.every((u) => u.fixedByLead === undefined))
})

test('with the wait off (0) a blocked unit ends as today, with no wait calls', async (t) => {
  const run = await runWorkflow(four(t), { implementer: stuckUnits('task-1') })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  assert.deepEqual(run.calls.filter((c) => /^ops:stuck/.test(c.kind)), [])
  assert.deepEqual(run.ticks, [])
})

test('a unit blocked by a question of its supervisor does not wait', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    supervisor: (call, approve) => (call.unit === 'task-1' ? { verdict: 'block', findings: [], ruling: 'Block: the plan contradicts itself.', guidance: '', question: 'Which of the two?' } : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(byId(run)['task-1'].status, 'blocked')
  assert.equal(byId(run)['task-1'].question, 'Which of the two?')
  assert.deepEqual(run.calls.filter((c) => /^ops:stuck/.test(c.kind)), [])
})

test('a wait that is not a whole number of seconds from 0 is refused', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: -1 })
  assert.match(String(run.error && run.error.message), /stuckWaitSeconds/)
})
```

**Acceptance:**
- `node --test tests/workflow-stuck.test.js` y `npm test` pasan; las pruebas de flujo que ya existen (`tests/workflow*.test.js`, `tests/superdelegation-scenarios.test.js`, `tests/ops-exit-code.test.js`, ...) pasan **sin cambios** con la espera en 0, es decir, con los mismos resultados y las mismas secuencias de llamadas.
- Las pausas de la espera no entran en `agents.total`; `agents.total` sigue igual a las llamadas del arnés.
- `plugins/aether/workflows/run.workflow.js` no lee el reloj ni números al azar, y no repite el número 1800.

### Task 7: El informe cuenta la unidad arreglada en marcha

**Aether:**
- Area: report
- Owns: `plugins/aether/lib/report.js`, `tests/report-fixed.test.js`, `tests/report.test.js`
- Depends on: none
- Serves: R10

**Interfaces:**

`plugins/aether/lib/report.js`: `qualityOf(results, adopted)` recoge, de las unidades de cada resultado, las que traen `fixedByLead` (un objeto con `commit` y `reason`); gana la clave `fixedUnits: [{ id, commit, reason }]` (en orden de aparición; la de un lanzamiento posterior reemplaza la de la misma unidad) **solo cuando hay alguna** (sin ellas, el objeto `quality` no cambia de forma). La unidad sigue contando `merged` e `integrated`, y no `adopted`. `report()` añade una nota por cada una: `<id> was fixed in flight by the Lead at <commit, 10 caracteres>: <reason>`. El campo `unknown` de `qualityOf` (resultados vacíos) no cambia.

El resultado del lanzamiento termina de forma normal y se guarda como `result.json`: el gasto (#191) se lee de ahí por `autonomy.status`, sin cambio de código.

**Tests (write first):**

`tests/report-fixed.test.js`:

```js
'use strict'

// Spec 034 (R10): a unit the Lead fixed in flight counts as integrated, with its commit and reason, and the launch
// that ended normally is in the spend of an open autonomous run (issue 191).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, useDataDir } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun, sampleLaneLog } = require('./report-fixtures.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report } = require('../plugins/aether/lib/report.js')

const HOUR = 60 * MIN
const SESSION = 'sess-owner-034'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const cents = (x) => Math.round(x * 100) / 100

// The sample result has task-3 blocked; here the Lead fixed it in flight and the swarm merged it.
function fixed(args, extra = {}) {
  const file = path.join(args.runDir, 'result.json')
  const result = JSON.parse(fs.readFileSync(file, 'utf8'))
  const unit = result.units.find((u) => u.id === 'task-3')
  Object.assign(unit, { status: 'merged', reason: null, question: null, commit: 'merge-task-3', fixedByLead: { commit: 'abcdef0123456789', reason: 'moved the test into Owns' }, ...extra })
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
}

test('a unit fixed in flight counts as integrated, with its commit and reason', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  fixed(args)
  const r = report(repo.dir, args.runId, { tests: false })
  const { quality } = r
  assert.deepEqual(
    { units: quality.units, merged: quality.merged, adopted: quality.adopted, integrated: quality.integrated, blocked: quality.blocked },
    { units: 3, merged: 3, adopted: 0, integrated: 3, blocked: 0 },
  )
  assert.deepEqual(quality.fixedUnits, [{ id: 'task-3', commit: 'abcdef0123456789', reason: 'moved the test into Owns' }])
  assert.ok(r.notes.includes('task-3 was fixed in flight by the Lead at abcdef0123: moved the test into Owns'), r.notes.join('\n'))
})

test('a run with no unit fixed in flight has no fixedUnits key', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.equal('fixedUnits' in quality, false)
})

test('a launch that ended with a unit fixed in flight is in the spend of an open autonomous run (issue 191)', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  fixed(args)
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const line = { type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: '2026-10-08T00:00:00.000Z', message: { role: 'user', content: HOURS } }
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), JSON.stringify(line) + '\n')
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 30 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const figure = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.totals.run.totalUsd
  const st = autonomy.status(repo.dir, { now: T0 + 10 * MIN, dataDir })
  assert.deepEqual(st.swarms, { runs: [{ run: args.runId, usd: cents(figure) }], unreadable: [] })
  assert.equal(st.usd.spent, cents(figure))
})
```

**Acceptance:**
- `node --test tests/report-fixed.test.js tests/report.test.js` y `npm test` pasan; las formas de `quality` que `tests/report.test.js` ya sujeta no cambian.
- Un resultado sin `fixedByLead` produce exactamente el mismo informe que antes.

### Task 8: Las reglas del Lead y las guías

**Aether:**
- Area: docs
- Owns: `plugins/aether/skills/swarm/SKILL.md`, `docs/guide/troubleshooting.md`, `docs/guide/ops.md`, `docs/reference/components.md`, `tests/swarm-stuck-docs.test.js`, `tests/swarm-ladder-docs.test.js`, `tests/components-docs.test.js`
- Depends on: none
- Serves: R12

**Interfaces:**

`plugins/aether/skills/swarm/SKILL.md` (en inglés, como el resto; `skills/using-aether` no se toca):
- En §3 «Launch», la lista «While it runs» cambia su línea `do not run `aether-wt` commands for this run.` por `do not run `aether-wt` commands for this run, except `watch`, `deliver` and `decline` (below).` y gana, antes de esa lista, la regla de la vigilancia: al lanzar el enjambre, dejar `aether-wt watch <runId>` en segundo plano (`run_in_background`), desde el worktree de integración, con la ruta absoluta del bin del plugin; termina cuando una unidad se traba, cuando la corrida acaba (diciendo si algo se trabó) o con `sin señal de la corrida` (relánzala si la corrida sigue viva).
- En §5 «Act on it», una entrada **«Stuck unit (the watch ended with one)»**: leer el motivo y los archivos fuera de `Owns` que trae; arreglarlo en el worktree de la unidad (`worktree` de la salida) y confirmar el arreglo en su rama; entregarlo con `aether-wt deliver <runId> <task> --commit <sha> --reason "<what you fixed>"` (el commit debe ser la punta de la rama de la unidad; el flujo lo fusiona con las reglas de siempre: `Owns`, pruebas de fusión y línea base); si no puede arreglarla (un error del plan fuera de `Owns`), declinarla con `aether-wt decline <runId> <task> --reason "<why>"` para no dejar al flujo esperando, y tratarla como una unidad bloqueada; relanzar la vigilancia después de cada una. Y que, sin entrega a tiempo (`stuckWaitSeconds` de `config/swarm.json`, 1800 por defecto, y los argumentos del lanzamiento pueden fijar otro; 0 apaga la espera), la unidad termina bloqueada y se trata como hoy.
- En §4, `fixedByLead` entre los campos de una unidad.

Guías: `docs/guide/troubleshooting.md` («A unit comes back blocked», su «What to do») dice lo mismo en pocas líneas; `docs/guide/ops.md` añade `stuck` (con su carga y huella), `stuck-tick` y `stuck-end` a la lista de comandos que el mod responde sin modelo; `docs/reference/components.md` añade `wt-config.js`, `wt-stuck.js` y `wt-watch.js` a la fila `wt` y `config/swarm.json` a la línea de datos de configuración. Las páginas siguen pasando `tests/docs-facts.test.js` (todo `` `aether-<nombre>` `` es un bin del plugin).

**Tests (write first):**

`tests/swarm-stuck-docs.test.js`:

```js
'use strict'

// Spec 034 (R12, C8): the Lead's rules for a stuck unit are in the swarm skill and the guides; the start-up skill is not touched.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the swarm skill tells the Lead to leave the watch in the background, what to do when it ends, and what a missing fix does', () => {
  const skill = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const text of [
    'aether-wt watch <runId>',
    'run_in_background',
    'sin señal de la corrida',
    'aether-wt deliver <runId> <task> --commit <sha> --reason "<what you fixed>"',
    'aether-wt decline <runId> <task> --reason "<why>"',
    'stuckWaitSeconds',
    'config/swarm.json',
    'fixedByLead',
  ]) {
    assert.ok(skill.includes(text), text)
  }
  assert.match(skill, /relaunch the watch|launch the watch again/i)
  assert.match(skill, /ends blocked/i)
})

test('the swarm skill no longer says that no aether-wt command may run while the swarm runs, without its exception', () => {
  const skill = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  assert.ok(!skill.includes('- do not run `aether-wt` commands for this run.\n'))
  assert.ok(skill.includes('except `watch`, `deliver` and `decline`'))
})

test('the guides describe the stuck wait and the commands the mod answers', () => {
  const troubleshooting = read('docs', 'guide', 'troubleshooting.md')
  assert.ok(troubleshooting.includes('aether-wt deliver'))
  assert.ok(troubleshooting.includes('aether-wt decline'))
  assert.ok(troubleshooting.includes('stuckWaitSeconds'))
  const ops = read('docs', 'guide', 'ops.md')
  for (const verb of ['stuck-tick', 'stuck-end']) assert.ok(ops.includes(`\`${verb}`), verb)
  const components = read('docs', 'reference', 'components.md')
  for (const name of ['wt-config.js', 'wt-stuck.js', 'wt-watch.js', 'config/swarm.json']) assert.ok(components.includes(name), name)
})

test('the start-up skill does not mention the stuck wait', () => {
  assert.doesNotMatch(read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md'), /aether-wt (watch|deliver|decline)|stuckWaitSeconds/)
})
```

**Acceptance:**
- `node --test tests/swarm-stuck-docs.test.js tests/docs-facts.test.js tests/swarm-ladder-docs.test.js tests/components-docs.test.js tests/session-start-parts.test.js` y `npm test` pasan.
- Ningún archivo de `plugins/aether/skills/using-aether/` cambia.
