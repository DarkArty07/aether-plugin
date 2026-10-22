# Tasks: la escalera de los delegados, sin router

**Spec:** [spec.md](spec.md)

## Global Constraints

- Se trabaja solo en la rama `feat/delegate-ladder` y su worktree. No se toca el checkout principal, el plugin instalado, `.aether/worktrees/` de otras sesiones, `.aether/pending.jsonl` ni los registros de otras ids (R21). No se lee ni se escribe el estado de otra sesión.
- Node.js 22, CommonJS, sin dependencias. Los bins son delgados y `lib/` tiene la lógica. El mod (`hooks/*.mjs`) no importa `lib/`: habla con los bins por `$.process.run`.
- Las pruebas corren en repositorios y directorios de datos desechables (`tests/helpers.js`: `tempDir`, `makeRepo`, `useDataDir`), con harness y modelos simulados. Ninguna prueba gasta cuota ni llama a un modelo.
- Los nombres de este plan son fijos: el bin `plugins/aether/bin/aether-delegate`; los datos de la escalera `plugins/aether/config/ladder.json`; la bitácora `<dataDir>/delegates/log.jsonl`; los archivos de cada lanzamiento bajo `<dataDir>/delegates/` (`external/<id>.json`, `briefs/`, `results/<id>.json`, `patches/`, `answers/`, `run/<id>.json`, `in/`).
- Ningún número de la escalera (5, 2, 1, 2 hallazgos repetidos, `high`, `xhigh`) va escrito en el código: salen de `config/ladder.json` (R15).
- La bitácora es de solo agregar y una escritura por línea (R16). Un valor de texto de más de 4000 caracteres se recorta antes de escribirlo.
- Un veredicto que no pasa por `aether-delegate verdict` no cuenta (R7). Un `approve` con una comprobación objetiva fallida se rechaza (R6).
- Las formas de las entradas de la bitácora son estas, y todas las tareas las usan tal cual (cada una lleva `time` y `session`):
  - `launch`: `{ kind, task, step, attempt, launchKind: 'first'|'fix'|'rise'|'unjudged'|'refused', effort, edits, owns, tests, description, requested: {model, effort}|null, ignored, pin, base: <HEAD de cwd>|null, dirty: { [archivo]: <sha1 del contenido, o 'absent'> }|null }` (`dirty`: solo en un intento en Claude de solo lectura, los archivos ya cambiados al lanzar, cada uno con el hash de su contenido en ese momento);
  - `result`: `{ kind, task, attempt, ok, status, pair: {id, harness, model, effort}|null, branch, worktree, base, head, patch, answer, checks, review }`;
  - `outcome`: `{ kind, id: <task>, attempt: <número corrido de los outcome de la tarea>, status, harness, model, effort, durationMs, usage, quotaSpent, detail, markedUntil }`;
  - `verdict`: `{ kind, task, attempt, step, verdict: 'approved'|'fix'|'infeasible'|'exhausted', input: {kind, findings, reason, fromScratch}, reason, cause, next: {step, kind, cause, effort, carry} }`;
  - `relaunch`: `{ kind, task, of }`;
  - `answer`: `{ kind, task, attempt, text }` (la respuesta final de un delegado de solo lectura que corrió en Claude: la escribe `aether-delegate answer`, que el mod llama; `text` puede ser vacío).
- Una tarea no toca `specs/`, `.specify/`, `docs/decisions.md` ni `docs/changelog.md`. La numeración de la decisión se toma al fundir.
- Las tareas 17 y 21 (`Area: lead`) son pasos del Lead, no del enjambre: las hace el Lead a mano y las excluye de `aether-plan compile` con `--only` (la lista de las demás); solo ellas escriben `docs/evidence/`. La Task 17 va antes de lanzar las Tasks 10 y 11: el Lead compila en dos tandas: las Tasks 1 a 9 y la 18 (con la 17 a mano al terminar la 1) y, hecha la 17, todas las demás menos la 21.
- Las guías y el código nuevos están en inglés, como el resto del plugin; los mensajes que una prueba fija se escriben tal cual abajo.
- Los identificadores que salen (C7): las opciones `router`, `decider` y `fallback`, `CLAUDE_PLUGIN_OPTION_ROUTER`, `CLAUDE_PLUGIN_OPTION_DECIDER`, `CLAUDE_PLUGIN_OPTION_FALLBACK`, el comando `aether-route`, la marca `ROUTER-OVERRIDE` y los modos `record`, `advise` y `command` del router. Una tarea que los encuentra en un archivo que posee los quita.

## Aether Execution

- Test command: `npm test && npm run test:mod`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 4

El tope es 4, no 200: el dueño avisó que hay agentes trabajando en otras sesiones (intent, cita 11) y las notas de la intención dicen que la máquina tenía 9,9 GB disponibles de 32 y una carga de 8,6. La onda más ancha que corre el enjambre tiene 6 tareas (la primera, Tasks 1 a 6), así que el tope las parte en tandas. El Lead no lo sube sin mirar `free -m`.

## Checklist

- [ ] T001 [P] [US10] Bucle de espera del mod sin modelo, con la prueba corta de R20, en plugins/aether/hooks/delegate-wait.mjs → Task 1
- [ ] T002 [P] [US3] Política de la escalera y sus datos en plugins/aether/lib/ladder.js y plugins/aether/config/ladder.json → Task 2
- [ ] T003 [P] [US5] Bitácora de delegados en plugins/aether/lib/delegate-log.js → Task 3
- [ ] T004 [P] [US3] Banderas --pair, --carry y --findings de aether-lane delegate en plugins/aether/lib/lane-delegate.js → Task 4
- [ ] T005 [P] [US9] Comprobaciones objetivas sin modelo en plugins/aether/lib/delegate-checks.js → Task 5
- [ ] T006 [P] [US12] Ajustes de la sesión sin las opciones del decisor en plugins/aether/lib/session.js → Task 6
- [ ] T007 [US1] Begin y verdict de una tarea de delegado en plugins/aether/lib/delegate-task.js → Task 7
- [ ] T008 [P] [US5] Informe de delegados por escalón en plugins/aether/lib/delegate-report.js → Task 8
- [ ] T009 [P] [US13] Gasto con la bitácora nueva y el diario viejo en plugins/aether/lib/spend.js → Task 9
- [ ] T010 [US10] Lanzar, ejecutar y esperar un delegado, y el bin aether-delegate, en plugins/aether/lib/delegate-run.js y plugins/aether/bin/aether-delegate → Task 10
- [ ] T011 [US1] El mod entrega las llamadas Agent con la escalera en plugins/aether/hooks/delegate.mjs → Task 11
- [ ] T012 [P] [US8] La guía del Lead describe la escalera en plugins/aether/skills/using-aether/SKILL.md → Task 12
- [ ] T013 [US12] Retirar el decisor del router, su código, sus datos y sus pruebas → Task 13
- [ ] T014 [US12] La guía de los delegados describe la escalera en docs/guide/delegates.md → Task 14
- [ ] T015 [US12] Prueba que busca los identificadores retirados en tests/no-router.test.js → Task 15
- [ ] T016 [US12] Recortar la sesión, el guard y el lector del diario viejo en plugins/aether/lib/session.js → Task 16
- [ ] T017 [US10] Paso del Lead: la prueba de espera en el motor real, en docs/evidence/013-delegate-ladder.md → Task 17
- [ ] T018 [US12] El panel de /harnesses sin el decisor en plugins/aether/hooks/panel-view.mjs → Task 18
- [ ] T019 [US12] El manifiesto y la tabla de opciones sin el decisor en plugins/aether/.claude-plugin/plugin.json → Task 19
- [ ] T020 [US12] Los recuentos y los resúmenes de la documentación en docs/reference/components.md → Task 20
- [ ] T021 [US12] Paso del Lead al terminar: fundir main, la sesión real, la evidencia y el cierre de los issues, en docs/evidence/013-delegate-ladder.md → Task 21

### Task 1: El bucle de espera del mod y su prueba corta

**Aether:**
- Tier: sonnet high — semántica del motor del mod que las pruebas simuladas solo aproximan
- Review: xhigh — límite de 10 minutos del motor, reintentos y tiempos
- Area: mod
- Owns: `plugins/aether/hooks/delegate-wait.mjs`, `tests/delegate-wait.test.js`
- Depends on: none
- Serves: R12, R20

**Interfaces:**

```js
// plugins/aether/hooks/delegate-wait.mjs  (ES module, sin imports de lib/)
export const WAIT_SECONDS = 540        // lo que una llamada de `wait` bloquea como máximo
export const WAIT_TIMEOUT_MS = 570000  // timeoutMs de cada $.process.run: bajo los 600000 del motor
export const MAX_WAIT_MS = 3600000     // lo más que se espera a un delegado en total

// Repite `node <root>/bin/aether-delegate wait --id <id> --seconds 540` hasta que el delegado termina.
// `$` solo necesita $.process.run(argv, { timeoutMs }) y $.clock.now().
// Cada llamada imprime una última línea JSON: { done: false } o { done: true, ok, status, text }.
// Devuelve { ok, status, text }: lo que dijo `done: true`; { ok: false, status: 'wait-failed', text: null }
// cuando dos llamadas seguidas fallan (se reintenta una vez); { ok: false, status: 'timeout', text: null }
// cuando se pasa MAX_WAIT_MS medido con $.clock.now(). Nunca lanza.
export async function waitForDelegate($, { root, id, session }) {}
```

**Tests (write first):** `tests/delegate-wait.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let mod
test.before(async () => {
  mod = await import(path.join(HOOKS, 'delegate-wait.mjs'))
})

// `answers` is what each `aether-delegate wait` prints, in order; an Error is a run that fails. The clock is
// simulated: a wait that answers { done: false } lasted the seconds it asked for.
function make(answers) {
  const state = { now: 0, runs: [] }
  const queue = [...answers]
  const $ = {
    clock: { now: async () => state.now },
    process: {
      run: async (argv, init) => {
        state.runs.push({ argv, init })
        const next = queue.shift()
        if (next === undefined) throw new Error('no more answers')
        if (next instanceof Error) throw next
        if (next.done === false) state.now += Number(argv[argv.indexOf('--seconds') + 1]) * 1000
        return { exitCode: 0, stdout: `noise\n${JSON.stringify(next)}\n`, stderr: '' }
      },
    },
  }
  return { $, state }
}
const CTX = { root: '/plugin', id: 'task-a', session: 's1' }
const DONE = { done: true, ok: true, status: 'ok', text: 'branch aether/x/task-1' }

test('a delegate of more than 10 minutes is waited for with waits that each stay under the engine limit (R20)', async () => {
  const { $, state } = make([{ done: false }, { done: false }, { done: false }, DONE])
  const result = await mod.waitForDelegate($, CTX)
  assert.deepEqual(result, { ok: true, status: 'ok', text: 'branch aether/x/task-1' })
  assert.equal(state.runs.length, 4)
  assert.ok(state.now > 600000, 'the simulated delegate outlasted the 10 minutes of one command')
  for (const run of state.runs) {
    assert.ok(run.init.timeoutMs < 600000, `timeoutMs ${run.init.timeoutMs}`)
    assert.deepEqual(run.argv.slice(0, 3), ['node', '/plugin/bin/aether-delegate', 'wait'])
    assert.equal(run.argv[run.argv.indexOf('--id') + 1], 'task-a')
  }
})

test('one failed wait is retried', async () => {
  const { $, state } = make([new Error('boom'), DONE])
  assert.equal((await mod.waitForDelegate($, CTX)).ok, true)
  assert.equal(state.runs.length, 2)
})

test('two failed waits in a row end the wait without throwing', async () => {
  const { $ } = make([new Error('a'), new Error('b')])
  assert.deepEqual(await mod.waitForDelegate($, CTX), { ok: false, status: 'wait-failed', text: null })
})

test('a delegate that never ends is given up on after MAX_WAIT_MS', async () => {
  const { $, state } = make(Array.from({ length: 100 }, () => ({ done: false })))
  const result = await mod.waitForDelegate($, CTX)
  assert.deepEqual(result, { ok: false, status: 'timeout', text: null })
  assert.ok(state.now >= mod.MAX_WAIT_MS)
  assert.ok(state.runs.length <= Math.ceil(mod.MAX_WAIT_MS / (mod.WAIT_SECONDS * 1000)) + 1)
})

test('a delegate that ended without an answer says so as it is', async () => {
  const { $ } = make([{ done: true, ok: false, status: 'no-candidate', text: null }])
  assert.deepEqual(await mod.waitForDelegate($, CTX), { ok: false, status: 'no-candidate', text: null })
})

test('the constants stay under the ten minutes of $.process.run', () => {
  assert.ok(mod.WAIT_TIMEOUT_MS < 600000)
  assert.ok(mod.WAIT_SECONDS * 1000 < mod.WAIT_TIMEOUT_MS)
})
```

**Acceptance:** `node --test tests/delegate-wait.test.js` pasa. Es la prueba corta de R20: demuestra que el bucle espera a un delegado simulado de más de 10 minutos sin un modelo y sin una llamada de más de 570000 ms. El archivo no importa nada de `lib/`. Con el reloj simulado la prueba pasaría con cualquier bucle: no decide R20 por sí sola; la medición en el motor real es la Task 17.

### Task 2: La política de la escalera y sus datos

**Aether:**
- Tier: sonnet high — varias reglas que se cruzan (topes, repetición, inviable, empezar de cero) que las pruebas fijan caso por caso
- Review: xhigh — el borde entre «corregir» y «subir» decide el gasto
- Area: ladder
- Owns: `plugins/aether/config/ladder.json`, `plugins/aether/lib/ladder.js`, `tests/ladder.test.js`
- Depends on: none
- Serves: R1, R2, R3, R4, R5, R15, R22

**Interfaces:**

`plugins/aether/config/ladder.json` (datos; los valores iniciales son los que el dueño aprobó y los de D7 de la spec):

```json
{
  "rungs": [
    { "step": "haiku", "model": "haiku", "corrections": 5, "effort": { "first": "high", "retry": "xhigh" } },
    { "step": "sonnet", "model": "sonnet", "corrections": 2, "effort": { "first": "high", "retry": "xhigh" } },
    { "step": "opus", "model": "opus", "corrections": 1, "effort": { "first": "high", "retry": "xhigh" } }
  ],
  "repeatFindings": 2
}
```

```js
// plugins/aether/lib/ladder.js
// Finding: { file: string, line: number|null, what: string }
// Verdict input: { kind: 'approve'|'fix'|'infeasible', findings: Finding[], reason: string|null, fromScratch: boolean }
// State: { step: string, attempts: number, correctionsUsed: number, repeats: number, lastKeys: string[]|null,
//          status: 'open'|'approved'|'exhausted' }
// Next: { step: string|null, kind: 'fix'|'rise'|'exhausted'|'done', cause: 'fix'|'exhausted'|'repeated'|'infeasible'|null,
//         effort: string|null, carry: boolean }

loadLadder(file = <plugin>/config/ladder.json) // -> { rungs, repeatFindings }; lanza si falta un paso, un tope no es un entero >= 0 o un esfuerzo no es low|medium|high|xhigh|max
newState(ladder)                                // -> estado abierto en el primer paso
parseFinding(text)                              // 'src/a.js:12: falta el caso vacío' -> { file, line: 12, what }; 'src/a.js: falta X' -> line null; sin archivo o sin qué falta -> null
findingKey(finding)                             // 'archivo|qué falta' en minúsculas y con espacios colapsados; la línea no cuenta
effortFor(ladder, step, launchKind)             // 'first' -> effort.first; 'fix' | 'rise' | 'unjudged' -> effort.retry
judge(state, verdict, ladder)                   // -> { accepted: true, state, next } | { accepted: false, error }
stateOf(inputs, ladder)                         // pliega la lista de entradas de verdict (campo `input`) con judge y devuelve el estado
```

Reglas de `judge`: un estado que no está `open` rechaza todo. `approve` cierra la tarea (`next.kind 'done'`, estado `approved`). `fix` exige al menos un hallazgo con `file` y `what` no vacíos (`line` puede ser null). En un `fix`, el conjunto de claves de los hallazgos igual al del veredicto anterior del mismo escalón cuenta como repetición; cuando las repeticiones seguidas llegan a `repeatFindings`, sube (`rise`, causa `repeated`) aunque queden correcciones. Si no, cuando las correcciones gastadas del escalón ya son las del tope, sube (causa `exhausted`); si no, es `fix` y gasta una corrección. `infeasible` exige `reason` con texto y sube (causa `infeasible`). `fromScratch` exige `reason` y pone `carry: false` en la subida o la corrección que sigue; si no, `carry: true`. Una subida pasa al paso siguiente y pone en cero las correcciones gastadas y las repeticiones. Una subida desde el último paso es `exhausted` (`step: null`, estado `exhausted`). `next.effort` es `effortFor` del paso siguiente y de `fix` o `rise`.

**Tests (write first):** `tests/ladder.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const ladder = require('../plugins/aether/lib/ladder.js')

const L = ladder.loadLadder()
const F = (n) => ({ file: `src/f${n}.js`, line: n, what: `missing case ${n}` })
const fix = (...ns) => ({ kind: 'fix', findings: ns.map(F), reason: null, fromScratch: false })
const APPROVE = { kind: 'approve', findings: [], reason: null, fromScratch: false }

// Judges the verdicts in order, each on the state the one before left; returns every answer.
function run(verdicts, ladderValue = L) {
  let state = ladder.newState(ladderValue)
  return verdicts.map((verdict) => {
    const answer = ladder.judge(state, verdict, ladderValue)
    if (answer.accepted) state = answer.state
    return answer
  })
}

test('the shipped file holds the numbers the owner approved (R15, D1, D7)', () => {
  assert.deepEqual(L.rungs.map((r) => [r.step, r.model, r.corrections]), [['haiku', 'haiku', 5], ['sonnet', 'sonnet', 2], ['opus', 'opus', 1]])
  assert.equal(L.repeatFindings, 2)
  assert.equal(ladder.effortFor(L, 'haiku', 'first'), 'high')
  assert.equal(ladder.effortFor(L, 'haiku', 'fix'), 'xhigh')
  assert.equal(ladder.effortFor(L, 'sonnet', 'rise'), 'xhigh')
})

test('Haiku has five corrections, and the step rises right after the fifth (C2)', () => {
  const answers = run([1, 2, 3, 4, 5, 6].map((n) => fix(n)))
  assert.deepEqual(answers.slice(0, 5).map((a) => [a.next.kind, a.next.step]), Array(5).fill(['fix', 'haiku']))
  assert.equal(answers[4].state.correctionsUsed, 5)
  assert.deepEqual([answers[5].next.kind, answers[5].next.step, answers[5].next.cause], ['rise', 'sonnet', 'exhausted'])
  assert.equal(answers[5].next.effort, 'xhigh')
  assert.equal(answers[5].next.carry, true)
})

test('Sonnet has two corrections and Opus one; after Opus there is no fourth step (C2, C5, E8)', () => {
  const answers = run(Array.from({ length: 11 }, (_, n) => fix(n + 1)))
  assert.equal(answers[5].next.step, 'sonnet')
  assert.deepEqual(answers.slice(6, 8).map((a) => a.next.kind), ['fix', 'fix'])
  assert.deepEqual([answers[8].next.kind, answers[8].next.step], ['rise', 'opus'])
  assert.deepEqual([answers[9].next.kind, answers[9].next.step], ['fix', 'opus'])
  assert.deepEqual([answers[10].next.kind, answers[10].next.step, answers[10].state.status], ['exhausted', null, 'exhausted'])
  assert.equal(ladder.judge(answers[10].state, fix(12), L).accepted, false)
})

test('the same findings twice in a row rise, though corrections are left (C3, E4)', () => {
  const [first, second] = run([fix(1), fix(1)])
  assert.equal(first.next.kind, 'fix')
  assert.deepEqual([second.next.kind, second.next.step, second.next.cause], ['rise', 'sonnet', 'repeated'])
  assert.equal(second.state.correctionsUsed, 0)
})

test('the same findings in another order or on another line are the same; one more finding is not', () => {
  assert.equal(run([fix(1, 2), fix(2, 1)])[1].next.cause, 'repeated')
  const moved = { ...fix(1), findings: [{ ...F(1), line: 99 }] }
  assert.equal(run([fix(1), moved])[1].next.cause, 'repeated')
  assert.equal(run([fix(1), fix(1, 2)])[1].next.kind, 'fix')
})

test('an infeasible declaration needs a written reason; without one it is rejected and the step does not move (C3, E6)', () => {
  const none = { kind: 'infeasible', findings: [], reason: null, fromScratch: false }
  const blank = { ...none, reason: '   ' }
  const [a, b, ok] = run([none, blank, { ...none, reason: 'the design is wrong for this model' }])
  assert.equal(a.accepted, false)
  assert.equal(b.accepted, false)
  assert.match(a.error, /reason/)
  assert.deepEqual([ok.accepted, ok.next.kind, ok.next.step, ok.next.cause], [true, 'rise', 'sonnet', 'infeasible'])
})

test('starting from scratch needs a reason and drops the carry; a plain rise carries the work (C4, E7)', () => {
  const scratch = { kind: 'infeasible', findings: [], reason: 'wrong approach', fromScratch: true }
  const [rejected, accepted] = run([{ ...scratch, reason: null }, scratch])
  assert.equal(rejected.accepted, false)
  assert.equal(accepted.next.carry, false)
  assert.equal(run([{ ...scratch, fromScratch: false }])[0].next.carry, true)
})

test('a finding with no file or no what is not a correction (R2)', () => {
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [{ file: '', line: 1, what: 'x' }] }, L).accepted, false)
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [{ file: 'a.js', line: null, what: '' }] }, L).accepted, false)
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [] }, L).accepted, false)
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [{ file: 'a.js', line: null, what: 'no line is fine' }] }, L).accepted, true)
})

test('parseFinding', () => {
  assert.deepEqual(ladder.parseFinding('src/a.js:12: missing check'), { file: 'src/a.js', line: 12, what: 'missing check' })
  assert.deepEqual(ladder.parseFinding('src/a.js: missing check'), { file: 'src/a.js', line: null, what: 'missing check' })
  assert.equal(ladder.parseFinding('missing check'), null)
  assert.equal(ladder.parseFinding('src/a.js:12:'), null)
})

test('approve closes the task and nothing is accepted after it', () => {
  const [done, after] = run([APPROVE, fix(1)])
  assert.deepEqual([done.accepted, done.next.kind, done.state.status], [true, 'done', 'approved'])
  assert.equal(after.accepted, false)
})

test('the caps come from the file: a ladder with one correction each rises on the second fix (C11)', (t) => {
  const file = path.join(tempDir(t), 'ladder.json')
  const small = { rungs: L.rungs.map((r) => ({ ...r, corrections: 1 })), repeatFindings: 3 }
  fs.writeFileSync(file, JSON.stringify(small))
  const loaded = ladder.loadLadder(file)
  const [first, second] = run([fix(1), fix(2)], loaded)
  assert.deepEqual([first.next.kind, second.next.kind, second.next.cause], ['fix', 'rise', 'exhausted'])
  assert.equal(run([fix(1), fix(1)], loaded)[1].next.kind, 'fix', 'repeatFindings 3 does not rise on two')
})

test('a ladder file with a missing step or a bad cap is refused', (t) => {
  const dir = tempDir(t)
  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, JSON.stringify({ rungs: [{ step: 'haiku', model: 'haiku', corrections: -1, effort: { first: 'high', retry: 'xhigh' } }], repeatFindings: 2 }))
  assert.throws(() => ladder.loadLadder(bad))
})

test('stateOf folds the recorded inputs to the state the judging left', () => {
  const inputs = [1, 2, 3, 4, 5, 6, 7].map((n) => fix(n))
  const direct = run(inputs).at(-1).state
  assert.deepEqual(ladder.stateOf(inputs, L), direct)
  assert.equal(ladder.stateOf(inputs, L).step, 'sonnet')
})
```

**Acceptance:** `node --test tests/ladder.test.js` pasa; `lib/ladder.js` no tiene un solo número de la escalera escrito (los lee de `config/ladder.json`); `loadLadder()` sin argumento lee el archivo del plugin.

### Task 3: La bitácora de delegados

**Aether:**
- Tier: haiku high — un módulo pequeño con pruebas exactas
- Review: xhigh — el sistema de archivos y la escritura a la vez de varias sesiones
- Area: ladder
- Owns: `plugins/aether/lib/delegate-log.js`, `tests/delegate-log.test.js`
- Depends on: none
- Serves: R16, R22

**Interfaces:**

```js
// plugins/aether/lib/delegate-log.js
const MAX_TEXT = 4000
logFile(dataDir)                                  // -> <dataDir>/delegates/log.jsonl
appendEntry(dataDir, entry)                       // -> boolean. Una sola fs.appendFileSync de JSON.stringify(entry) + '\n'; crea la carpeta.
                                                  //    Los valores de texto de más de MAX_TEXT se recortan a MAX_TEXT con '…' al final (a cualquier profundidad).
                                                  //    Nunca lanza: false cuando no se puede escribir.
readEntries(dataDir, { task = null, session = null, since = 0 } = {})  // -> entradas en el orden del archivo, con time >= since;
                                                  //    `task` iguala el campo `task` o el campo `id`; `session` iguala el campo `session`.
                                                  //    Una línea que no se lee se salta; sin archivo es [].
```

**Tests (write first):** `tests/delegate-log.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const LIB = path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'delegate-log.js')

test('an entry is appended as one line and read back in order', (t) => {
  const dir = tempDir(t)
  assert.equal(log.appendEntry(dir, { kind: 'launch', task: 'a', session: 's1', time: 10 }), true)
  assert.equal(log.appendEntry(dir, { kind: 'verdict', task: 'a', session: 's1', time: 20 }), true)
  assert.equal(log.logFile(dir), path.join(dir, 'delegates', 'log.jsonl'))
  assert.deepEqual(log.readEntries(dir).map((e) => e.kind), ['launch', 'verdict'])
  assert.equal(fs.readFileSync(log.logFile(dir), 'utf8').split('\n').filter(Boolean).length, 2)
})

test('the filters: task (the task or the id field), session and since', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, { kind: 'launch', task: 'a', session: 's1', time: 10 })
  log.appendEntry(dir, { kind: 'outcome', id: 'a', session: 's1', time: 15 })
  log.appendEntry(dir, { kind: 'launch', task: 'b', session: 's2', time: 20 })
  assert.deepEqual(log.readEntries(dir, { task: 'a' }).map((e) => e.kind), ['launch', 'outcome'])
  assert.deepEqual(log.readEntries(dir, { session: 's2' }).map((e) => e.task), ['b'])
  assert.equal(log.readEntries(dir, { since: 16 }).length, 1)
})

test('no file reads as an empty log, and a broken line is skipped', (t) => {
  const dir = tempDir(t)
  assert.deepEqual(log.readEntries(dir), [])
  log.appendEntry(dir, { kind: 'launch', task: 'a', time: 1 })
  fs.appendFileSync(log.logFile(dir), '{not json\n')
  log.appendEntry(dir, { kind: 'verdict', task: 'a', time: 2 })
  assert.deepEqual(log.readEntries(dir).map((e) => e.kind), ['launch', 'verdict'])
})

test('a long text is cut so that a line stays small', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, { kind: 'outcome', id: 'a', time: 1, detail: 'x'.repeat(9000), nested: { more: 'y'.repeat(9000) } })
  const [entry] = log.readEntries(dir)
  assert.ok(entry.detail.length <= log.MAX_TEXT + 1 && entry.detail.endsWith('…'))
  assert.ok(entry.nested.more.length <= log.MAX_TEXT + 1)
})

test('an entry that cannot be written gives false, never an error', (t) => {
  const dir = tempDir(t)
  fs.writeFileSync(path.join(dir, 'delegates'), 'a file where the folder should be')
  assert.equal(log.appendEntry(dir, { kind: 'launch', task: 'a', time: 1 }), false)
})

test('twenty processes appending at once leave twenty whole lines (R16)', async (t) => {
  const dir = tempDir(t)
  const children = Array.from({ length: 20 }, (_, n) => new Promise((resolve, reject) => {
    const script = `require(${JSON.stringify(LIB)}).appendEntry(${JSON.stringify(dir)}, { kind: 'outcome', id: 't', time: Date.now(), n: ${n}, detail: 'x'.repeat(3000) })`
    const child = spawn(process.execPath, ['-e', script])
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  }))
  await Promise.all(children)
  const lines = fs.readFileSync(log.logFile(dir), 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, 20)
  assert.deepEqual(lines.map((line) => JSON.parse(line).n).sort((a, b) => a - b), [...Array(20).keys()])
})
```

**Acceptance:** `node --test tests/delegate-log.test.js` pasa. El módulo exporta también `MAX_TEXT`. No lee ni escribe `router/decisions.jsonl`.

### Task 4: Las banderas de `aether-lane delegate` para una corrección

**Aether:**
- Tier: sonnet high — integración con el ciclo de pairs y los worktrees de `lane-delegate.js`
- Review: xhigh — el sistema de archivos, el parche que se aplica y el pair fijo
- Area: lane
- Owns: `plugins/aether/lib/lane-delegate.js`, `plugins/aether/bin/aether-lane`, `tests/lane-delegate-ladder.test.js`
- Depends on: none
- Serves: R2, R4, R11, R13, R22

**Interfaces:**

`DELEGATE_USAGE` queda: `delegate --brief <file> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> --owns <glob>[,<glob>...] [--tests <command>] [--pair <pair id>] [--carry <patch file>] [--findings <file>] [--session <id>]`. El comentario de uso de `bin/aether-lane` lo repite.

- `--pair <id>`: el primer intento corre en ese pair de la tabla de pairs, sin pedirle los puntos de la referencia: el ciclo elige sobre `table.filter(p => p.id === pair)` con la referencia más baja de Claude, de modo que cuenten solo su cuota y sus marcas. Si ese pair no se puede elegir (cuota, marca, no instalado) o falla, el ciclo sigue como hoy con la tabla entera, sin ese pair. Un id que no está en la tabla es el error de uso.
- `--carry <patch>`: el archivo con el parche del trabajo anterior es la `offer` inicial de `runLoop` del implementador; la aceptan o la rechazan las mismas guardas (`assessCarry`, dentro de lo que `--owns` permite) y, si se aplica, el prompt lleva `CONTINUATION_BLOCK`. Un archivo que no existe es el error de uso.
- `--findings <file>`: su texto se agrega al prompt del implementador en una sección `## Findings to fix` (después de `## Tests`). Un archivo que no existe es el error de uso.
- El resultado `done` agrega `base`: el `head` del checkout al empezar (el campo `base` que `lane-delegate.js` ya calcula). Nada más cambia en el resultado.

**Tests (write first):** `tests/lane-delegate-ladder.test.js` (copia de `tests/lane-delegate.test.js` solo lo que necesita: `agyEnv`, `briefLines`, la forma de armar el repositorio y el fake de agy; no importa de ese archivo)

```js
// Cada prueba arma lo mismo que las de tests/lane-delegate.test.js: un repositorio desechable con makeRepo, un
// directorio de datos y una tabla de lanes de agy con el fake (tests/lane-fixtures.js), y llama
// delegate.delegateCommand(repo.dir, flags, { env }) con un brief que dice qué escribir (líneas FAKE-AGY).
test('--findings puts a "## Findings to fix" section with the file text in the prompt of the implementer', async (t) => {
  // flags: { brief, model: 'haiku', effort: 'high', owns: 'src/**', findings: <archivo con 'src/new.js:1: say goodbye'> }
  // assert: result.status === 'done'; el prompt del intento (.aether/runs/<run>/lanes/task-1-1-implement/prompt.md)
  //         incluye '## Findings to fix' y 'src/new.js:1: say goodbye'.
})
test('--carry offers the earlier patch: the attempt starts from that work and the prompt says to continue', async (t) => {
  // el parche crea src/old.js dentro de --owns; assert: result.continued === true, el prompt incluye la frase
  // 'Its uncommitted work, if any, is in the worktree. Continue from it.' y src/old.js está en el worktree de la unidad.
})
test('--carry with a patch that touches files outside --owns is not applied', async (t) => {
  // assert: result.continued === false y result.carry es un texto con la razón; el intento corre desde el árbol limpio.
})
test('--pair runs the first attempt on that pair, and the pair after it when it fails', async (t) => {
  // tabla con dos pairs de agy; --pair del que la elección pondría segundo: el primer 'choice' del log lo tiene como
  // picked.id; con un fake que hace fallar ese modelo, el segundo intento va a otro pair y nunca al mismo.
})
test('the done result carries base, the head the checkout had when the delegate began', async (t) => {
  // assert: result.base === repo.git('rev-parse', 'HEAD') tomado antes de llamar.
})
test('a --pair that is not in the pairs table, and a --carry or --findings file that does not exist, are the usage error', async (t) => {
  // assert.rejects(..., /usage: aether-lane delegate/)
})
```

**Acceptance:** `node --test tests/lane-delegate-ladder.test.js tests/lane-delegate.test.js tests/lane-delegate-scenarios.test.js` pasa: las pruebas viejas de `aether-lane delegate` pasan sin cambios y las banderas nuevas son opcionales. El checkout del Lead no cambia con ninguna bandera (`git status` limpio después de cada prueba).

### Task 5: Las comprobaciones objetivas, sin un modelo

**Aether:**
- Tier: haiku high — funciones de git y de globs con pruebas exactas
- Review: xhigh — el sistema de archivos, los archivos sin seguimiento y los globs de lo permitido
- Area: ladder
- Owns: `plugins/aether/lib/delegate-checks.js`, `tests/delegate-checks.test.js`
- Depends on: none
- Serves: R6, R22

**Interfaces:**

```js
// plugins/aether/lib/delegate-checks.js  (usa lib/globs.js: matchesAny)
changedFiles(worktree, base)                      // -> string[] ordenado: lo que cambió desde `base` en `worktree`, entre commits, modificados y
                                                  //    archivos nuevos sin seguimiento (no ignorados). Las rutas son relativas a la raíz del worktree.
runTests(worktree, command, { timeoutMs = 900000 } = {})
                                                  // -> { command, exitCode, passed, timedOut, outputTail }  (shell, últimos 4000 caracteres)
checkEdits({ files, owns, tests })                // tests: { passed: boolean } | null
                                                  // -> { kind: 'edits', ok, empty, outside: string[], tests: 'pass'|'fail'|'none', reasons: string[] }
                                                  //    ok = !empty && outside.length === 0 && tests !== 'fail'. Sin tests ('none') no falla.
checkReadOnly({ answer, files })                  // -> { kind: 'read-only', ok, empty, outside: files, reasons }
                                                  //    ok = answer con texto && files.length === 0 (cualquier archivo tocado está fuera de lo permitido).
                                                  //    `answer` omitido (undefined) no se comprueba y `empty` es false; Task 7 siempre la pasa: la de un delegado en Claude es la que el mod anota con `aether-delegate answer`.
```

**Tests (write first):** `tests/delegate-checks.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo } = require('./helpers.js')
const checks = require('../plugins/aether/lib/delegate-checks.js')

function repoWithChanges(t) {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  repo.git('add', 'src/a.js')
  repo.git('commit', '-q', '-m', 'add a')
  fs.writeFileSync(path.join(repo.dir, 'docs', 'x.md'), 'untracked\n')
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'more\n')
  return { repo, base }
}

test('changedFiles sees committed, modified and untracked files, sorted', (t) => {
  const { repo, base } = repoWithChanges(t)
  assert.deepEqual(checks.changedFiles(repo.dir, base), ['README.md', 'docs/x.md', 'src/a.js'])
  assert.deepEqual(checks.changedFiles(repo.dir, repo.git('rev-parse', 'HEAD')), ['README.md', 'docs/x.md'])
})

test('a file outside Owns fails the check, with the files named (E9)', () => {
  const result = checks.checkEdits({ files: ['src/a.js', 'docs/x.md'], owns: ['src/**'], tests: { passed: true } })
  assert.deepEqual([result.ok, result.empty, result.outside, result.tests], [false, false, ['docs/x.md'], 'pass'])
  assert.match(result.reasons.join(' '), /docs\/x\.md/)
})

test('an empty task fails the check (E9)', () => {
  const result = checks.checkEdits({ files: [], owns: ['src/**'], tests: null })
  assert.deepEqual([result.ok, result.empty], [false, true])
})

test('failing tests fail the check; no tests do not', () => {
  assert.equal(checks.checkEdits({ files: ['src/a.js'], owns: ['src/**'], tests: { passed: false } }).ok, false)
  assert.equal(checks.checkEdits({ files: ['src/a.js'], owns: ['src/**'], tests: { passed: false } }).tests, 'fail')
  const none = checks.checkEdits({ files: ['src/a.js'], owns: ['src/**'], tests: null })
  assert.deepEqual([none.ok, none.tests], [true, 'none'])
})

test('a read-only delegate must leave the checkout alone and answer something (R6)', () => {
  assert.equal(checks.checkReadOnly({ answer: 'found it', files: [] }).ok, true)
  assert.deepEqual(checks.checkReadOnly({ answer: '  ', files: [] }).empty, true)
  const touched = checks.checkReadOnly({ answer: 'x', files: ['src/a.js'] })
  assert.deepEqual([touched.ok, touched.outside], [false, ['src/a.js']])
  // With no answer given, only the files are checked.
  assert.deepEqual([checks.checkReadOnly({ files: [] }).ok, checks.checkReadOnly({ files: [] }).empty], [true, false])
  assert.equal(checks.checkReadOnly({ files: ['src/a.js'] }).ok, false)
})

test('runTests runs the command in the worktree and reports the exit code', (t) => {
  const { repo } = repoWithChanges(t)
  const pass = checks.runTests(repo.dir, 'node -e "process.exit(0)"')
  assert.deepEqual([pass.passed, pass.exitCode, pass.timedOut], [true, 0, false])
  const fail = checks.runTests(repo.dir, 'node -e "console.log(\'boom\'); process.exit(3)"')
  assert.deepEqual([fail.passed, fail.exitCode], [false, 3])
  assert.match(fail.outputTail, /boom/)
  assert.equal(checks.runTests(repo.dir, 'node -e "setTimeout(() => {}, 5000)"', { timeoutMs: 200 }).timedOut, true)
})
```

**Acceptance:** `node --test tests/delegate-checks.test.js` pasa. Ninguna función llama a un modelo ni al checkout del Lead: solo lee el worktree que se le da.

### Task 6: Los ajustes de la sesión

**Aether:**
- Tier: sonnet — varios archivos ligados (sesión, arranque, pruebas) que las pruebas sujetan
- Review: high — la compatibilidad con valores ya guardados
- Area: settings
- Owns: `plugins/aether/lib/session.js`, `plugins/aether/bin/aether-session-start`, `tests/session.test.js`, `tests/session-start.test.js`, `tests/router-settings.test.js`, `tests/delegate-settings.test.js`
- Depends on: none
- Serves: R9, R22

**Interfaces:**

```js
// plugins/aether/lib/session.js
delegateSettingsFrom(env = process.env)   // -> { lanes: boolean, harnesses: string[], deadlines: { quotaMs: number } }
                                          //    lanes = resolveOption(env).on; harnesses = enabledHarnesses(...) como hoy;
                                          //    deadlines: solo la clave `quota` de CLAUDE_PLUGIN_OPTION_DEADLINES (segundos, máximo 10, por defecto 3);
                                          //    las claves haiku= y jev= se aceptan y se ignoran.
delegateFile(dataDir, sessionId)          // -> <dataDir>/sessions/<id>.delegate.json
readDelegateSettings(dataDir, sessionId)  // -> los ajustes del archivo, o null si falta, no se lee o no es válido
markSession(dataDir, sessionId, now, { opsInMod, delegate, router, brake })   // `delegate` escribe o borra delegateFile; `router` queda aceptado hasta Task 16
// pruneSessions borra también <id>.delegate.json (y sigue borrando <id>.router.json si lo encuentra, de una versión vieja).
// routerSettingsFrom, readRouterSettings, routerFile y parseFallback se quedan exportados hasta Task 16, que los retira junto con lib/route.js
// (lo único que todavía los lee); nada del plugin que corre en una sesión los llama ya.
```

- `bin/aether-session-start`: pasa `delegate: delegateSettingsFrom(process.env)` a `markSession`; se quita `ROUTER_NOTES` y `routerNote()` y la nota que daban (el bootstrap de Task 12 cubre a los delegados).
- El manifiesto, la tabla de opciones y el panel los cambian Task 19 y Task 18: esta tarea no toca `plugin.json`.

**Tests (write first):** `tests/delegate-settings.test.js` (nuevo; `tests/router-settings.test.js` se borra) y los ajustes de `tests/session.test.js` y `tests/session-start.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const session = require('../plugins/aether/lib/session.js')

test('the settings of a session are superdelegation, harnesses and the quota deadline, and nothing of the removed options (E12)', () => {
  const env = {
    CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true',
    CLAUDE_PLUGIN_OPTION_HARNESSES: 'grok',
    CLAUDE_PLUGIN_OPTION_DEADLINES: 'haiku=5,jev=3,quota=2',
    CLAUDE_PLUGIN_OPTION_ROUTER: 'command',
    CLAUDE_PLUGIN_OPTION_DECIDER: 'jev',
    CLAUDE_PLUGIN_OPTION_FALLBACK: 'opus:max',
  }
  assert.deepEqual(session.delegateSettingsFrom(env), { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 2000 } })
})

test('the quota deadline defaults to 3 s and counts 10 s at most', () => {
  assert.equal(session.delegateSettingsFrom({}).deadlines.quotaMs, 3000)
  assert.equal(session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_DEADLINES: 'quota=99' }).deadlines.quotaMs, 10000)
})

test('markSession writes the delegate file, and removes a stale one when given none; readDelegateSettings reads it back', (t) => {
  const dir = tempDir(t)
  const settings = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 3000 } }
  session.markSession(dir, 's1', 1, { delegate: settings })
  assert.deepEqual(session.readDelegateSettings(dir, 's1'), settings)
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 's1.delegate.json')))
  session.markSession(dir, 's1', 2, { delegate: null })
  assert.equal(session.readDelegateSettings(dir, 's1'), null)
})

test('an invalid delegate file reads as null', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'sessions'))
  fs.writeFileSync(path.join(dir, 'sessions', 's1.delegate.json'), '{"lanes":"yes"}')
  assert.equal(session.readDelegateSettings(dir, 's1'), null)
})
```

**Acceptance:** `node --test tests/delegate-settings.test.js tests/session.test.js tests/session-start.test.js` y `npm test` pasan. `bin/aether-session-start` ya no escribe el archivo del router ni nombra `ROUTER_NOTES`. Las pruebas del viejo `router-settings` se borran junto con su archivo; lo que todavía necesite `lib/route.js` de `session.js` queda en pie hasta Task 16.

### Task 7: Begin y verdict de una tarea de delegado

**Aether:**
- Tier: opus high — el corazón del sistema: junta la escalera, la bitácora, las comprobaciones y la elección del pair
- Review: xhigh — el borde entre aprobar, corregir y subir; datos de las otras sesiones
- Area: ladder
- Owns: `plugins/aether/lib/delegate-task.js`, `tests/delegate-task.test.js`
- Depends on: Task 2 — usa `ladder.judge`, `effortFor`, `parseFinding` y la configuración
- Depends on: Task 3 — escribe y lee la bitácora
- Depends on: Task 5 — corre las comprobaciones de un veredicto `approve`
- Depends on: Task 6 — lee los ajustes de la sesión con `readDelegateSettings`
- Serves: R1, R2, R3, R4, R5, R6, R7, R8, R11, R14, R22

**Interfaces:**

```js
// plugins/aether/lib/delegate-task.js
parseBrief(prompt)   // -> { task: string|null, owns: string[], tests: string|null }
                     //    líneas 'AETHER-TASK: <id>' (letras, dígitos, - y _), 'AETHER-OWNS: a/**, b.js' (lista separada por comas, sin vacíos),
                     //    'AETHER-TESTS: <comando>'. La primera de cada una gana.

// deps (todas opcionales, para las pruebas): { dataDir, cwd = process.cwd(), now = Date.now, settings, ladder, newId,
//   pickPair(reference) -> Promise<{ pick: Pair|null, quota: [], error?: string }> }
// Por defecto: settings = session.readDelegateSettings(dataDir, session); ladder = loadLadder();
//   pickPair = pairStep de lib/router-pick.js con las dependencias que hoy arma lib/route.js `resolve` (sin criterion, rungs ni deciders):
//   lanesConfig, pairs, marks, slow, readings, renew, lift, installed, sleep.
begin({ session, event }, deps)    // -> Promise<Plan>, y no lanza: un error interno es un plan con `error` y `args: null`
// Plan: { id, skip, step, kind, attempt, args, notes, external, answerOf, error? }
//   args: { model, effort, prompt?, isolation? } | null  — lo que el mod pone en la llamada Agent (isolation: 'worktree' cuando la tarea edita)
//   external: { id, edits, timeoutMs, pin } | null — cuando un pair de otro harness toma el intento
//   answerOf: { task, attempt } | null — solo en un intento en Claude de solo lectura (sin `external`, sin `AETHER-OWNS` y no agotado): el mod anota su respuesta final con `aether-delegate answer`

verdict({ task, verdict, reason, findings, fromScratch, worktree }, deps)
// verdict: 'approve' | 'fix' | 'infeasible'; findings: string[] ('archivo[:línea]: qué falta'); worktree: ruta, solo para un intento en Claude que edita.
// -> Promise<{ ok, task, verdict, step, next, corrections: { used, cap }, error? }>   no lanza.
```

Lo que hace `begin`:

1. Id de la tarea: el de `AETHER-TASK:`, o uno que da `newId` (nota: «Aether delegate task <id>: pass it to aether-delegate verdict»). Si la tarea no tiene entradas es `first`, en el primer paso. Si el último `launch` no tiene `verdict` después, es `unjudged` en el mismo paso. Si el último `verdict` tiene `next`, el lanzamiento es `next.kind` (`fix` o `rise`) en `next.step`. Si la tarea está agotada, no se abre un escalón: el plan lleva `args: { model: 'haiku', effort: 'low', prompt: <un texto que dice que la tarea está agotada, que no hay otro escalón y que el Lead debe aplazarla o llevarla a la lista del dueño> }`, `external: null`, y se registra un `launch` con `launchKind: 'refused'`.
2. El modelo y el esfuerzo de `args` son los del paso y de `effortFor(ladder, step, launchKind)`, siempre; lo que `event.model` o `event.effort` traiga distinto se registra en el `launch` como `requested` con `ignored: true`. Si la tarea edita (hay `AETHER-OWNS`), `args` lleva además `isolation: 'worktree'`, sea cual sea quien tome el intento: un intento externo que cae a Claude (`yield* next(e)`) ya trabaja aislado, y un intento en Claude no toca el checkout del Lead.
3. Un id nuevo cuyas `owns` y `tests` (los mismos conjuntos) coinciden con los de una tarea de la misma sesión que no terminó aprobada registra `{ kind: 'relaunch', task, of }`.
4. Las secciones del brief de un intento que sigue a un veredicto: `## Findings to fix` (los hallazgos del veredicto, uno por línea), `## Reason` (la razón de la subida, cuando la hay) y, si `carry` es verdadero, `## Your previous work` con la ruta del parche del último `result` (tarea que edita) o el texto de la respuesta guardada (solo lectura). Con `fromScratch`, solo la razón. Cuando el intento corre en Claude, `args.prompt` es el prompt del Lead más esas secciones; cuando corre en otro harness, se escribe `<dataDir>/delegates/briefs/<id>-<attempt>.md` con las mismas y `external` las usa.
5. El pair: `pickPair({ model: step, effort })`. Si hay `pick`, escribe `<dataDir>/delegates/external/<id>.json` con `{ id, session, cwd, attempt, step, effort, launchKind, edits, owns, tests, brief, findings, carry, pin, base, harness, rung: {model, effort, group}, task: {description, prompt}, alternates, timeoutMs }` y devuelve `external: { id, edits, timeoutMs, pin }`; `edits` es verdadero cuando hay `AETHER-OWNS`. En una corrección (`fix` o `unjudged`) `pin` es el `pair.id` del último `result`; en la subida y el primer intento es null. `base` es el `HEAD` de `cwd` al lanzar. Sin `pick` (o sin superdelegación, o un agente con nombre que no es `general-purpose` ni `Explore`) `external` es null y la tarea corre en Claude, en el modelo del paso (R14).
6. El `launch` lleva `base` (el `HEAD` de `cwd` al lanzar) y, en un intento en Claude de solo lectura (sin `external` y sin `AETHER-OWNS`), `dirty`: un objeto con los archivos que `changedFiles(cwd, base)` ya veía cambiados en ese momento, cada uno con el hash de su contenido (`sha1` en hexadecimal de sus bytes, o `'absent'` si el archivo no existe). El plan lleva `answerOf: { task, attempt }` en ese mismo intento, y null en cualquier otro. Si `cwd` no es un repositorio, `base` y `dirty` son null y no se lanza nada.
7. Escribe el `launch` y devuelve la nota: el id, el paso, el intento y, si corre en otro harness, el pair.

Lo que hace `verdict`:

1. Rechaza una tarea que no conoce (`error: 'unknown task'`), un `fix` sin hallazgos válidos (`error` con el texto del hallazgo que no se aceptó), un `infeasible` o un `fromScratch` sin razón. Un veredicto rechazado no cambia el paso: responde `{ ok: false, error }` y no se escribe en la bitácora.
2. Un `approve` corre antes la comprobación, según cómo corrió el último intento. Con un `result` de ese intento (un delegado externo) es la suya (`checks`, que `run` calcula al terminar). En Claude y la tarea edita: `checkEdits` con `changedFiles(worktree, base)` (la `base` del último `launch`) y `runTests(worktree, tests)`; sin `worktree` y sin un `result` se rechaza con `error: 'approve needs the worktree of the attempt (--worktree) or the checks of its result'`, y nada se aprueba sin comprobar. En Claude y la tarea solo lee: `checkReadOnly({ answer, files })`, con `answer` el `text` de la última entrada `answer` de ese intento y `files` los archivos tocados desde el `launch`: los que `changedFiles(cwd, base)` da y `dirty` no tenía, y los que `dirty` tenía y ya no tienen el mismo hash (un archivo ya sucio que el delegado volvió a editar, o que dejó como estaba en `base`, cuenta como tocado). Sin ninguna entrada `answer` del intento se rechaza con `error: 'approve needs the answer of the attempt: the mod records it when the delegate ends; wait for the agent to end, or judge it fix or infeasible'`. Si la comprobación no está bien, `{ ok: false, error: 'checks failed: <razones>' }` y no se cierra la tarea.
3. Llama a `ladder.judge` con las entradas anteriores de la tarea (`stateOf`), escribe el `verdict` con su `input`, su razón, la causa y `next`, y responde con el paso siguiente y las correcciones gastadas y el tope.

**Tests (write first):** `tests/delegate-task.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }
const FINDING = 'src/a.js:3: the empty case is missing'
const F = (n) => `src/f${n}.js:${n}: missing case ${n}`

function world(t, { settings = NATIVE, pick = null, cwd = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const asked = []
  let n = 0
  const deps = { dataDir, cwd: cwd ?? dataDir, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async (reference) => (asked.push(reference), { pick, quota: [] }) }
  return { dataDir, deps, asked }
}
const call = (prompt, extra = {}) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt, ...extra } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`
const entries = (dataDir, id) => log.readEntries(dataDir, { task: id })

test('parseBrief reads the task id, the owned paths and the tests; the first line of each wins', () => {
  assert.deepEqual(task.parseBrief('AETHER-TASK: t-1\nAETHER-OWNS: src/**, tests/a.test.js\nAETHER-TESTS: npm test\nAETHER-TASK: t-2\nbody'), { task: 't-1', owns: ['src/**', 'tests/a.test.js'], tests: 'npm test' })
  assert.deepEqual(task.parseBrief('just a brief'), { task: null, owns: [], tests: null })
})

test('every delegate of every task starts on Haiku, whatever the Lead asks (C1, E1, E2)', async (t) => {
  const { deps, dataDir } = world(t)
  const plans = []
  for (const id of ['a', 'b', 'c']) plans.push(await task.begin(call(BRIEF(id)), deps))
  for (const plan of plans) assert.deepEqual([plan.step, plan.kind, plan.args.model, plan.args.effort], ['haiku', 'first', 'haiku', 'high'])
  const asked = await task.begin(call(BRIEF('d'), { model: 'opus', effort: 'max' }), deps)
  assert.deepEqual([asked.args.model, asked.args.effort, asked.step], ['haiku', 'high', 'haiku'])
  const launch = entries(dataDir, 'd').find((e) => e.kind === 'launch')
  assert.deepEqual([launch.ignored, launch.requested], [true, { model: 'opus', effort: 'max' }])
})

test('a call with no AETHER-TASK gets a generated id and says so', async (t) => {
  const { deps } = world(t)
  const plan = await task.begin(call('Do the work.'), deps)
  assert.match(plan.id, /^gen-/)
  assert.ok(plan.notes.join(' ').includes(plan.id))
})

test('a correction goes to the same step with its findings and the xhigh effort; the step does not move (C2, E3)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const answer = await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  assert.deepEqual([answer.ok, answer.next.kind, answer.next.step, answer.corrections], [true, 'fix', 'haiku', { used: 1, cap: 5 }])
  const again = await task.begin(call(BRIEF('t1')), deps)
  assert.deepEqual([again.step, again.kind, again.args.model, again.args.effort], ['haiku', 'fix', 'haiku', 'xhigh'])
  assert.ok(again.args.prompt.includes('## Findings to fix') && again.args.prompt.includes(FINDING))
})

test('the correction receives the earlier work: the patch path of its last result, or the earlier answer (C2, C4)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const patch = path.join(dataDir, 'delegates', 'patches', 't1-1.patch')
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch, answer: null, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const again = await task.begin(call(BRIEF('t1')), deps)
  assert.ok(again.args.prompt.includes('## Your previous work') && again.args.prompt.includes(patch))
})

test('five corrections of Haiku, and the sixth failure rises to Sonnet with the work and the findings (C3, E5)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  for (let n = 1; n <= 5; n++) assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: [F(n)] }, deps)).next.kind, 'fix')
  const sixth = await task.verdict({ task: 't1', verdict: 'fix', findings: [F(6)] }, deps)
  assert.deepEqual([sixth.next.kind, sixth.next.step, sixth.next.cause], ['rise', 'sonnet', 'exhausted'])
  const plan = await task.begin(call(BRIEF('t1')), deps)
  assert.deepEqual([plan.step, plan.kind, plan.args.model, plan.args.effort], ['sonnet', 'rise', 'sonnet', 'xhigh'])
  assert.ok(plan.args.prompt.includes(F(6)))
})

test('the same findings twice rise to Sonnet though Haiku has corrections left (E4)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const second = await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  assert.deepEqual([second.next.kind, second.next.cause], ['rise', 'repeated'])
})

test('an infeasible declaration without a reason is rejected and the step stays; with one it rises and the log keeps the reason (C3, E6)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const rejected = await task.verdict({ task: 't1', verdict: 'infeasible' }, deps)
  assert.equal(rejected.ok, false)
  assert.match(rejected.error, /reason/)
  assert.equal((await task.begin(call(BRIEF('t1')), deps)).step, 'haiku')
  const ok = await task.verdict({ task: 't1', verdict: 'infeasible', reason: 'wrong layer for this model' }, deps)
  assert.deepEqual([ok.ok, ok.next.step, ok.next.cause], [true, 'sonnet', 'infeasible'])
  assert.equal(entries(dataDir, 't1').find((e) => e.kind === 'verdict' && e.verdict === 'infeasible').reason, 'wrong layer for this model')
})

test('starting from scratch drops the earlier work and keeps the reason in the log (C4, E7)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const patch = path.join(dataDir, 'delegates', 'patches', 't1-1.patch')
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'infeasible', reason: 'the approach is wrong', fromScratch: true }, deps)
  const plan = await task.begin(call(BRIEF('t1')), deps)
  assert.equal(plan.args.prompt.includes(patch), false)
  assert.ok(plan.args.prompt.includes('the approach is wrong'))
  assert.equal(entries(dataDir, 't1').find((e) => e.kind === 'verdict').input.fromScratch, true)
})

test('after Opus nothing opens a fourth step: the task is exhausted (C5, E8)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  let last
  for (let n = 1; n <= 11; n++) last = await task.verdict({ task: 't1', verdict: 'fix', findings: [F(n)] }, deps)
  assert.deepEqual([last.next.kind, last.next.step], ['exhausted', null])
  const plan = await task.begin(call(BRIEF('t1')), deps)
  assert.deepEqual([plan.args.model, plan.args.effort, plan.external], ['haiku', 'low', null])
  assert.match(plan.args.prompt, /exhausted/)
  assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: [F(12)] }, deps)).ok, false)
})

test('a finding with no file or no what is not accepted as a correction (R2)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: ['the code is bad'] }, deps)).ok, false)
  assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: [] }, deps)).ok, false)
  assert.equal((await task.verdict({ task: 'nope', verdict: 'approve' }, deps)).error, 'unknown task')
})

test('approve is refused when an objective check fails: a file outside Owns, an empty task or failing tests (C6, E9)', async (t) => {
  const repo = makeRepo(t)
  const { deps } = world(t, { cwd: repo.dir })
  const owns = 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n'
  await task.begin(call(BRIEF('out', owns)), deps)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(repo.dir, 'docs', 'x.md'), 'x\n')
  const outside = await task.verdict({ task: 'out', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(outside.ok, false)
  assert.match(outside.error, /docs\/x\.md/)
  const body = await task.verdict({ task: 'out', verdict: 'fix', findings: ['docs/x.md: do not touch it'] }, deps)
  assert.equal(body.ok, true, 'a correction needs no passing check')

  const clean = makeRepo(t)
  const world2 = world(t, { cwd: clean.dir })
  await task.begin(call(BRIEF('empty', owns)), world2.deps)
  const empty = await task.verdict({ task: 'empty', verdict: 'approve', worktree: clean.dir }, world2.deps)
  assert.equal(empty.ok, false)
  assert.match(empty.error, /empty|no changes/)

  const failing = makeRepo(t)
  const world3 = world(t, { cwd: failing.dir })
  await task.begin(call(BRIEF('red', 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(1)"\n')), world3.deps)
  fs.mkdirSync(path.join(failing.dir, 'src'))
  fs.writeFileSync(path.join(failing.dir, 'src', 'a.js'), 'a\n')
  assert.match((await task.verdict({ task: 'red', verdict: 'approve', worktree: failing.dir }, world3.deps)).error, /tests/)

  const good = makeRepo(t)
  const world4 = world(t, { cwd: good.dir })
  await task.begin(call(BRIEF('green', owns)), world4.deps)
  fs.mkdirSync(path.join(good.dir, 'src'))
  fs.writeFileSync(path.join(good.dir, 'src', 'a.js'), 'a\n')
  const approved = await task.verdict({ task: 'green', verdict: 'approve', worktree: good.dir }, world4.deps)
  assert.equal(approved.ok, true)
  assert.equal(entries(world4.dataDir, 'green').at(-1).verdict, 'approved')
})

test('a task that edits is launched with isolation worktree, whoever takes the attempt; a read-only one is not (R13, S9)', async (t) => {
  const more = 'AETHER-OWNS: src/**\n'
  const native = world(t)
  assert.equal((await task.begin(call(BRIEF('e1', more)), native.deps)).args.isolation, 'worktree')
  assert.equal((await task.begin(call(BRIEF('r1')), native.deps)).args.isolation, undefined)
  const external = world(t, { settings: EXTERNAL, pick: GROK })
  assert.equal((await task.begin(call(BRIEF('e2', more)), external.deps)).args.isolation, 'worktree')
})

test('an approve of an attempt on Claude that edits is refused with no worktree and no checks of a result (S9)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)
  const refused = await task.verdict({ task: 'e1', verdict: 'approve' }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /worktree/)
  assert.equal(entries(dataDir, 'e1').some((e) => e.kind === 'verdict'), false)
})

test('a read-only delegate on Claude is approved only with its answer, not empty, and a checkout that did not change since begin; a file dirty before counts when its content changed (R6)', async (t) => {
  const repo = makeRepo(t)
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'dirty before the delegate\n')
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  const said = (id, text) => log.appendEntry(dataDir, { kind: 'answer', task: id, attempt: 1, session: 's1', time: 5000, text })
  const plan = await task.begin(call(BRIEF('r1')), deps)
  assert.deepEqual(plan.answerOf, { task: 'r1', attempt: 1 })
  assert.equal((await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)).answerOf, null, 'a task that edits has no answer to record')
  const none = await task.verdict({ task: 'r1', verdict: 'approve' }, deps)
  assert.deepEqual([none.ok, /answer/.test(none.error)], [false, true], 'no answer recorded: not approved')
  said('r1', '   ')
  assert.equal((await task.verdict({ task: 'r1', verdict: 'approve' }, deps)).ok, false, 'an empty answer is not approved')
  said('r1', 'found it')
  assert.equal((await task.verdict({ task: 'r1', verdict: 'approve' }, deps)).ok, true, 'what was dirty before and was not touched does not count')
  await task.begin(call(BRIEF('r2')), deps)
  said('r2', 'found it')
  fs.writeFileSync(path.join(repo.dir, 'touched.js'), 'x\n')
  const refused = await task.verdict({ task: 'r2', verdict: 'approve' }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /touched\.js/)
  assert.equal((await task.verdict({ task: 'r2', verdict: 'fix', findings: ['touched.js: do not create files'] }, deps)).ok, true)
  await task.begin(call(BRIEF('r3')), deps)
  said('r3', 'found it')
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'the delegate edited it again\n')
  const again = await task.verdict({ task: 'r3', verdict: 'approve' }, deps)
  assert.equal(again.ok, false)
  assert.match(again.error, /README\.md/, 'a file that was dirty at begin counts when its content changed')
})

test('an approve of an external result uses the checks its run recorded (C6)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1', 'AETHER-OWNS: src/**\n')), deps)
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, checks: { ok: false, reasons: ['tests failed'] } })
  const refused = await task.verdict({ task: 't1', verdict: 'approve' }, deps)
  assert.deepEqual([refused.ok, /tests failed/.test(refused.error)], [false, true])
})

test('a new id with the same owns and tests as a task of the session that did not end approved is a relaunch (R1)', async (t) => {
  const { deps, dataDir } = world(t)
  const more = 'AETHER-OWNS: src/**\nAETHER-TESTS: npm test\n'
  await task.begin(call(BRIEF('t1', more)), deps)
  await task.begin(call(BRIEF('t2', more)), deps)
  assert.deepEqual(log.readEntries(dataDir).filter((e) => e.kind === 'relaunch').map((e) => [e.task, e.of]), [['t2', 't1']])
  await task.begin(call(BRIEF('t3', 'AETHER-OWNS: other/**\nAETHER-TESTS: npm test\n')), deps)
  assert.equal(log.readEntries(dataDir).filter((e) => e.kind === 'relaunch').length, 1)
})

test('each step asks the pair of the points of its own model, and a correction keeps the pair it had (C8, R11)', async (t) => {
  const { deps, asked, dataDir } = world(t, { settings: EXTERNAL, pick: GROK })
  const more = 'AETHER-OWNS: src/**\nAETHER-TESTS: npm test\n'
  const first = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[0], { model: 'haiku', effort: 'high' })
  assert.deepEqual([first.external.id, first.external.edits, first.external.pin], ['t1', true, null])
  assert.deepEqual(first.args, { model: 'haiku', effort: 'high', isolation: 'worktree' }, 'the rescue on Claude is the same step, isolated because the task edits')
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', 't1.json'), 'utf8'))
  assert.deepEqual([file.edits, file.owns, file.tests, file.step, file.harness], [true, ['src/**'], 'npm test', 'haiku', 'grok'])
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: GROK, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const fixed = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[1], { model: 'haiku', effort: 'xhigh' })
  assert.equal(fixed.external.pin, GROK.id)
  await task.verdict({ task: 't1', verdict: 'infeasible', reason: 'too hard for Haiku' }, deps)
  const risen = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[2], { model: 'sonnet', effort: 'xhigh' })
  assert.equal(risen.external.pin, null)
})

test('a read-only task has no edits; with no pair it runs on Claude at the model of its step (E11, R14)', async (t) => {
  const readOnly = world(t, { settings: EXTERNAL, pick: GROK })
  assert.equal((await task.begin(call(BRIEF('r1')), readOnly.deps)).external.edits, false)
  const none = world(t, { settings: EXTERNAL, pick: null })
  const plan = await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), none.deps)
  assert.deepEqual([plan.external, plan.args.model], [null, 'haiku'])
})

test('a named agent that is not a plain one stays on Claude', async (t) => {
  const { deps } = world(t, { settings: EXTERNAL, pick: GROK })
  const plan = await task.begin(call(BRIEF('t1'), { subagent_type: 'aether:judge' }), deps)
  assert.equal(plan.skip, true)
})
```

**Acceptance:** `node --test tests/delegate-task.test.js` pasa. `lib/delegate-task.js` no tiene un solo número de la escalera. No importa `lib/route.js` ni ninguno de los módulos del decisor. Las llamadas a `aether:*` se saltan (`skip: true`).

### Task 8: El informe de delegados por escalón

**Aether:**
- Tier: sonnet high — junta la bitácora con el panel que ya lee `--delegates`
- Review: high — la forma de las filas que el panel lee no puede cambiar
- Area: report
- Owns: `plugins/aether/lib/delegate-report.js`, `plugins/aether/bin/aether-report`, `tests/delegate-report.test.js`, `tests/aether-report.test.js`, `tests/lane-delegate-scenarios.test.js`
- Depends on: Task 3 — lee la bitácora
- Serves: R17, R22

**Interfaces:**

```js
// plugins/aether/lib/delegate-report.js
delegatesReport({ dataDir = run.dataDir(), session = null, since = 0 } = {})
// -> {
//   delegations: [{ id, time, session, description, applied: 'external'|'rewritten', ranOn: {harness, model, effort}, fallback: string|null,
//                   step, attempts }],   // una fila por tarea, con el `time` de su primer lanzamiento, y una por cada `decision` del diario viejo: lo que `hooks/panel-view.mjs` lee
//   ladder: {
//     steps: [{ step, tasks, attempts, corrections, approved,
//               rises: { exhausted, repeated, infeasible },
//               infeasible: [{ task, reason }] }],   // un elemento por paso de config/ladder.json, en su orden
//     relaunches: [{ task, of }]
//   }
// }
```

Los conteos por escalón: `tasks` son las tareas con algún `launch` en ese paso; `attempts` los `launch` del paso; `corrections` los `launch` con `launchKind: 'fix'`; `approved` los `verdict` `approved` del paso; `rises` cuenta, por causa, los `verdict` cuyo `next.kind` es `rise` desde ese paso; `infeasible` lista los `verdict` `infeasible` con su razón. `aether-report --delegates [--session <id>] [--since <ms>]` imprime ese objeto. Además de las tareas de la bitácora nueva, `delegations` trae una fila por cada entrada `decision` del diario viejo (`readJournal(dataDir, { since, session })` de `lib/router-log.js`, solo lectura, R18: `aether-report --delegates` ya lo leía por `lib/router-report.js` y el panel lo muestra; si el `id` ya es una tarea de la bitácora nueva, gana la nueva): `{ id, time, session, description, applied, fallback, ranOn, step: null, attempts }`, con `ranOn` y `fallback` como los calculaba el informe viejo: el último `outcome` del `id` decide dónde corrió (`{ harness, model, effort }`); si no terminó `ok`, corrió en el `rescue` de la decisión y `fallback` es `external <estado>`; `attempts` es cuántos `outcome` tiene. Los conteos de `ladder` son solo de la bitácora nueva. Del informe viejo se quitan `editsOnClaudeWithoutNoCandidate` y `outsideMeasure` (medían lo que el decisor no registraba) y `costUsd`: lo calculaba con el `agentId` que `aether-route spawn` anotaba, que sale con el decisor; ningún requisito lo pide, el panel no lo lee y el gasto de los delegados lo da `aether-report --spend` (R18). `lib/router-report.js` y `tests/router-report.test.js` no se tocan aquí: `bin/aether-report` deja de usarlos, pero `tests/router-route.test.js` (:518) todavía exige `lib/router-report.js` hasta que la Task 13 lo borre con ellos. `tests/lane-delegate-scenarios.test.js` corre el bin `aether-report` y la prueba «the measure by the real path: only the editing delegation on Claude with no no-candidate behind it is listed (R16, R18)» comprueba `editsOnClaudeWithoutNoCandidate` y `outsideMeasure`, que este informe quita: esta tarea borra esa prueba y la constante `OUTSIDE_MEASURE` del archivo, y no cambia nada más de él (la Task 13 lo reescribe después).

**Tests (write first):** `tests/delegate-report.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const fs = require('node:fs')
const log = require('../plugins/aether/lib/delegate-log.js')
const { journalFile } = require('../plugins/aether/lib/router-log.js')
const { delegatesReport } = require('../plugins/aether/lib/delegate-report.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-report')
let clock = 0
const at = (entry) => ({ session: 's1', time: (clock += 10), ...entry })
const launch = (task, step, attempt, launchKind) => at({ kind: 'launch', task, step, attempt, launchKind, description: `d-${task}`, effort: 'high', edits: false })
const verdict = (task, step, attempt, v, next, extra = {}) => at({ kind: 'verdict', task, step, attempt, verdict: v, next, reason: null, cause: next.cause ?? null, input: { kind: 'x', findings: [], reason: null, fromScratch: false }, ...extra })

function world(t) {
  const dataDir = tempDir(t, 'aether-data-')
  const add = (...entries) => entries.forEach((e) => log.appendEntry(dataDir, e))
  add(launch('t1', 'haiku', 1, 'first'), verdict('t1', 'haiku', 1, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t2', 'haiku', 1, 'first'), verdict('t2', 'haiku', 1, 'fix', { step: 'haiku', kind: 'fix', cause: 'fix' }),
    launch('t2', 'haiku', 2, 'fix'), verdict('t2', 'haiku', 2, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t3', 'haiku', 1, 'first'), verdict('t3', 'haiku', 1, 'infeasible', { step: 'sonnet', kind: 'rise', cause: 'infeasible' }, { reason: 'wrong layer' }),
    launch('t3', 'sonnet', 2, 'rise'), verdict('t3', 'sonnet', 2, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t4', 'haiku', 1, 'first'), at({ kind: 'relaunch', task: 't4', of: 't3' }))
  return dataDir
}

test('per step: the tasks, the attempts, the corrections, the approved, the rises with their cause and the infeasible with their reason (C11, R17)', (t) => {
  const { ladder } = delegatesReport({ dataDir: world(t) })
  const [haiku, sonnet, opus] = ladder.steps
  assert.deepEqual([haiku.step, haiku.tasks, haiku.attempts, haiku.corrections, haiku.approved], ['haiku', 4, 5, 1, 2])
  assert.deepEqual(haiku.rises, { exhausted: 0, repeated: 0, infeasible: 1 })
  assert.deepEqual(haiku.infeasible, [{ task: 't3', reason: 'wrong layer' }])
  assert.deepEqual([sonnet.tasks, sonnet.attempts, sonnet.approved], [1, 1, 1])
  assert.deepEqual([opus.step, opus.tasks, opus.attempts], ['opus', 0, 0])
})

test('a relaunch under another id shows linked to the first task (R1)', (t) => {
  assert.deepEqual(delegatesReport({ dataDir: world(t) }).ladder.relaunches, [{ task: 't4', of: 't3' }])
})

test('the rows keep the fields the /harnesses panel reads', (t) => {
  const { delegations } = delegatesReport({ dataDir: world(t) })
  assert.equal(delegations.length, 4)
  const row = delegations.find((d) => d.id === 't3')
  assert.equal(row.description, 'd-t3')
  assert.equal(typeof row.time, 'number')
  assert.deepEqual([row.applied, row.ranOn.harness, row.ranOn.model], ['rewritten', 'claude', 'sonnet'])
})

test('the rows of the old journal are read too, read only, and the ladder counts only the new log (R18)', (t) => {
  const dataDir = world(t)
  const file = journalFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const lines = [
    { kind: 'decision', id: 'old-1', time: 5, session: 's1', description: 'old one', applied: 'external', ranOn: null, rescue: { harness: 'claude', model: 'sonnet', effort: 'high' } },
    { kind: 'outcome', id: 'old-1', time: 6, session: 's1', status: 'ok', harness: 'agy', model: 'm-a', effort: 'low' },
    { kind: 'decision', id: 'old-2', time: 7, session: 's1', description: 'old two', applied: 'external', ranOn: null, rescue: { harness: 'claude', model: 'sonnet', effort: 'high' } },
    { kind: 'outcome', id: 'old-2', time: 8, session: 's1', status: 'failed', harness: 'agy', model: 'm-a', effort: 'low' },
  ]
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const before = fs.readFileSync(file, 'utf8')
  const { delegations, ladder } = delegatesReport({ dataDir })
  assert.equal(delegations.length, 6)
  const one = delegations.find((d) => d.id === 'old-1')
  assert.deepEqual([one.description, one.applied, one.ranOn.harness, one.fallback, one.attempts], ['old one', 'external', 'agy', null, 1])
  const two = delegations.find((d) => d.id === 'old-2')
  assert.deepEqual([two.ranOn.model, two.fallback], ['sonnet', 'external failed'])
  assert.equal(ladder.steps[0].tasks, 4)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('session and since filter the report', (t) => {
  const dataDir = world(t)
  log.appendEntry(dataDir, { kind: 'launch', task: 'z', session: 'other', time: 1, step: 'haiku', attempt: 1, launchKind: 'first', description: 'z' })
  assert.equal(delegatesReport({ dataDir, session: 's1' }).delegations.length, 4)
  assert.equal(delegatesReport({ dataDir, session: 'other' }).delegations.length, 1)
})

test('aether-report --delegates prints the report as one JSON line', (t) => {
  const dataDir = world(t)
  const out = spawnSync(process.execPath, [BIN, '--delegates', '--session', 's1'], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dataDir } })
  assert.equal(out.status, 0)
  assert.equal(JSON.parse(out.stdout.trim()).ladder.steps.length, 3)
})
```

**Acceptance:** `node --test tests/delegate-report.test.js tests/aether-report.test.js` pasa, con un diario viejo en disco y sin escribirlo (las pruebas viejas del informe de lanes, sellos y `--spend` siguen pasando; las del decisor se quitan). `bin/aether-report` ya no requiere `lib/router-report.js`, que sigue en el árbol, con su prueba, hasta la Task 13. `node --test tests/lane-delegate-scenarios.test.js` pasa sin la prueba de la medida. `hooks/panel-view.mjs` `parseDelegates` lee las filas nuevas sin cambios.

### Task 9: El gasto con la bitácora nueva y el diario viejo

**Aether:**
- Tier: sonnet high — lectura de dos fuentes de gasto sin contar dos veces
- Review: xhigh — cifras de dinero, líneas rotas y el diario de otras sesiones
- Area: spend
- Owns: `plugins/aether/lib/spend.js`, `tests/spend-ladder.test.js`, `tests/spend.test.js`, `tests/spend-prune.test.js`, `tests/spend-bin.test.js`, `tests/spend-fixtures.js`
- Depends on: Task 3 — lee la bitácora nueva
- Serves: R18, R22

**Interfaces:**

`readOutcomeEvents(dataDir, id, { prices })` (en `lib/spend.js`) lee los `outcome` de la sesión `id` de las dos fuentes: el diario viejo (`journalFile(dataDir)`, sin escribirlo) y la bitácora nueva (`delegate-log.logFile(dataDir)`), con la misma regla de línea rota para las dos (solo hace incompleta a la sesión la línea que cae dentro de su lapso). Una pareja `id` e `attempt` que aparece en las dos fuentes cuenta una sola vez (gana la de la bitácora nueva); una entrada sin `attempt` cuenta como `attempt` indefinido. No cambia nada más de la forma ni de las cifras de `spendReport`. El freno por cuota no lee el diario (comprobado al planificar: lee las ventanas de la sesión), así que no cambia. El panel de harness lee `aether-report --delegates`, que sí leía el diario por `lib/router-report.js`: Task 8 hace que siga leyéndolo, solo lectura.

**Tests (write first):** `tests/spend-ladder.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useDataDir } = require('./helpers.js')
const { PRICES, T0, MIN, outcome, journalLine } = require('./spend-fixtures.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const { journalFile } = require('../plugins/aether/lib/router-log.js')

const spend = (dataDir) => spendReport({ dataDir, session: 'sess', prices: PRICES })
const journalEntry = (dataDir) => JSON.parse(fs.readFileSync(journalFile(dataDir), 'utf8').trim().split('\n')[0])

test('a session with a delegate in the new log and one in the old journal adds the two (E13, R18)', (t) => {
  const dataDir = useDataDir(t)
  const dollars = outcome(dataDir, 'sess', 1, 'm-a')
  const old = journalEntry(dataDir)
  log.appendEntry(dataDir, { ...old, id: 'task-new', attempt: 1, time: T0 + 2 * MIN })
  const report = spend(dataDir)
  assert.equal(report.harness.calls, 2)
  assert.ok(Math.abs(report.usd - 2 * dollars) < 1e-9)
})

test('the same id and attempt in both sources count once', (t) => {
  const dataDir = useDataDir(t)
  const dollars = outcome(dataDir, 'sess', 1, 'm-a')
  log.appendEntry(dataDir, journalEntry(dataDir))
  const report = spend(dataDir)
  assert.equal(report.harness.calls, 1)
  assert.ok(Math.abs(report.usd - dollars) < 1e-9)
})

test('the same id with another attempt is another call', (t) => {
  const dataDir = useDataDir(t)
  outcome(dataDir, 'sess', 1, 'm-a')
  log.appendEntry(dataDir, { ...journalEntry(dataDir), attempt: 2 })
  assert.equal(spend(dataDir).harness.calls, 2)
})

test('a session that only has the new log is recorded', (t) => {
  const dataDir = useDataDir(t)
  log.appendEntry(dataDir, { kind: 'outcome', id: 't', attempt: 1, session: 'sess', time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1e6 } })
  const report = spend(dataDir)
  assert.deepEqual([report.recorded, report.harness.calls], [true, 1])
})

test('a broken line of the new log inside the span of the session makes it incomplete; one outside does not', (t) => {
  const dataDir = useDataDir(t)
  log.appendEntry(dataDir, { kind: 'outcome', id: 't1', attempt: 1, session: 'sess', time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1 } })
  fs.appendFileSync(log.logFile(dataDir), '{"time":' + (T0 + MIN) + ', broken\n')
  log.appendEntry(dataDir, { kind: 'outcome', id: 't2', attempt: 1, session: 'sess', time: T0 + 2 * MIN, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1 } })
  assert.equal(spend(dataDir).complete, false)
})

test('the old journal is only read, never written (D4)', (t) => {
  const dataDir = useDataDir(t)
  journalLine(dataDir, { kind: 'outcome', id: 'd-1', time: T0, session: 'sess', status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1e6 }, attempt: 1 })
  const before = fs.readFileSync(journalFile(dataDir), 'utf8')
  spend(dataDir)
  assert.equal(fs.readFileSync(journalFile(dataDir), 'utf8'), before)
})
```

**Acceptance:** `node --test tests/spend-ladder.test.js tests/spend.test.js tests/spend-prune.test.js tests/spend-bin.test.js tests/spend-view.test.js tests/spend-docs.test.js tests/spend-skills.test.js` pasa: las pruebas de gasto y de poda siguen pasando con un diario viejo en disco. `lib/spend.js` ya no escribe ni importa `appendEntry`.

### Task 10: Lanzar, ejecutar y esperar un delegado, y el bin `aether-delegate`

**Aether:**
- Tier: opus high — procesos desacoplados, esperas y el camino que edita con su rama
- Review: xhigh — concurrencia (un proceso que muere, un resultado que llega tarde) y el sistema de archivos
- Area: run
- Owns: `plugins/aether/lib/delegate-run.js`, `plugins/aether/bin/aether-delegate`, `plugins/aether/lib/delegate-chain.js`, `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/router-renewal.js`, `tests/delegate-run.test.js`, `tests/delegate-chain.test.js`, `tests/delegate-calls.test.js`, `tests/router-renewal.test.js`, `tests/aether-route.test.js`, `tests/docs-facts.test.js`, `docs/reference/components.md`
- Depends on: Task 3 — escribe `result` y `outcome` en la bitácora
- Depends on: Task 4 — llama a `delegateCommand` con `--pair`, `--carry` y `--findings`
- Depends on: Task 5 — calcula las comprobaciones al terminar
- Depends on: Task 7 — lee el archivo `external/<id>.json` que `begin` escribe y expone `begin` y `verdict` en el bin
- Depends on: Task 17 — la prueba de espera en el motor real decide si `start` y `wait` son lo que el mod usa, o si se pasa al respaldo
- Serves: R6, R8, R12, R13, R16, R22

**Interfaces:**

```js
// plugins/aether/lib/delegate-run.js
start({ id, cwd, dataDir }, { spawn = child_process.spawn, binPath } = {})
  // -> { started: true, id, pid }. Borra results/<id>.json, lanza `node <binPath> run --id <id>` desacoplado (detached, stdio a
  //    <dataDir>/delegates/run/<id>.log, unref) y escribe run/<id>.json = { pid, startedAt }. Vuelve enseguida.
runTask({ id, cwd, dataDir, now = Date.now }, { delegateCommand = laneDelegate.delegateCommand, runChain = delegateChain.runChain } = {})
  // -> Promise<Result>; lee external/<id>.json; si `edits`: delegateCommand(cwd, { brief, model: step, effort, owns: owns.join(','), tests?, session, pair?: pin,
  //    carry?: <patch del último result si carry>, findings?: <archivo con los hallazgos> }), con `model` del paso y `effort` del intento;
  //    si no, runChain({ cwd, id, session, external, config, dataDir }) sobre el delegado de solo lectura.
  //    Escribe results/<id>.json y, en la bitácora, un `result` y los `outcome` de la cadena (attempt corrido por tarea).
  // Result: { ok, status, text, checks, attempt }. `text` es lo que el Lead lee: la atribución o el nombre del pair, la rama, el head, el worktree, los tests
  //    que corrió, la revisión de otro pair (veredicto y hallazgos), las comprobaciones, la línea `aether-wt merge <run> task-1` y la línea
  //    `Judge it: aether-delegate verdict --task <id> --verdict approve|fix|infeasible`. `ok` es false cuando la cadena o el comando no entregan trabajo
  //    (status 'no-candidate', 'failed', ...): `text` es null y el mod deja el intento a Claude en el modelo del paso.
  // checks: checkEdits({ files: changedFiles(worktree, base), owns, tests }) para edits; checkReadOnly({ answer, files: changed }) para solo lectura,
  //    con `changed` los archivos que el delegado tocó en la copia desechable: `delegate-calls.js` ya detecta un cambio (`worktreeChanges`) y lo devuelve como
  //    status 'violation'; ahora ese resultado lleva `changed: changes.files`, `runChain` lo devuelve como `changed` (el del último intento, o []) y
  //    una violación da `ok: false`, `text: null` y `checks.outside = changed`.
  // El camino que edita escribe un `result` y ningún `outcome`: su gasto ya lo cuenta el registro de lanes de `aether-lane delegate`, y un `outcome` más
  //    lo contaría dos veces en `aether-report --spend`. Solo la cadena de solo lectura escribe `outcome`.
  // Guarda el parche del trabajo (git diff base..head del worktree, más lo no confirmado) en patches/<id>-<attempt>.patch y la respuesta de un delegado de
  //    solo lectura en answers/<id>-<attempt>.md; sus rutas van en el `result` (campos patch y answer). Nunca funde ni toca el checkout del Lead.
recordAnswer({ task, attempt, text, session, dataDir, now = Date.now })
  // -> { recorded: true }. Agrega a la bitácora `{ kind: 'answer', task, attempt, session, time, text }`: la respuesta final de un delegado de solo lectura que
  //    corrió en Claude, que el mod ve en el último paso del agente (R6: el `approve` de la Task 7 la lee). `text` puede ser vacío. Nunca lanza: { recorded: false }
  //    cuando no se puede escribir.
wait({ id, dataDir, seconds, now = Date.now, sleep, alive = pidAlive })
  // -> Promise<{ done: false } | { done: true, ok, status, text }>. Sondea results/<id>.json cada 250 ms hasta `seconds` (máximo 540). Sin resultado y
  //    con run/<id>.json cuyo pid ya no vive: { done: true, ok: false, status: 'died', text: null }. Sin run/<id>.json ni resultado: status 'unknown'.
```

`bin/aether-delegate` (usa `lib/` por ruta, imprime una línea JSON y sale 0, salvo un uso mal hecho o un error propio: `{ error }` y 1):

- `begin --session <id> --input <file>` → `delegate-task.begin({ session, event }, { dataDir })` con el evento leído del archivo.
- `verdict --task <id> --verdict approve|fix|infeasible [--reason <text>] [--finding <archivo[:línea]: qué falta>]... [--from-scratch] [--worktree <path>] [--session <id>]` → `delegate-task.verdict(...)`. Cuando `--verdict` es `approve` en un intento en otro harness, la comprobación es la del `result`.
- `start --id <id>`, `run --id <id>`, `wait --id <id> --seconds <n>` → las tres de arriba (`start` y `run` usan `process.cwd()`).
- `answer --session <id> --task <id> --attempt <n> --text <text>` → `delegate-run.recordAnswer(...)`; `--text` puede ser una cadena vacía; sin `--task` o sin `--attempt` es un uso mal hecho (`{ error }` y 1).
- `renew --harness <agy|grok>` → lo que hacía `aether-route renew` (`lib/router-renewal.js` `renewReading`), y `renewalArgv` de `router-renewal.js` apunta a `bin/aether-delegate renew`.
- `lib/delegate-chain.js` escribe sus `outcome` con `delegate-log.appendEntry` (forma de las Global Constraints: `id` de la tarea y `attempt` corrido por tarea), ya no con `router-log`.

**El recuento de los bins (esta tarea lo sube a doce, la Task 13 lo devuelve a once).** Agregar `bin/aether-delegate` mientras `bin/aether-route` sigue ahí deja doce archivos en `bin/`, y tres lugares cuentan once: `tests/aether-route.test.js` (la prueba «the executable bit is set and the commands page counts the bins»: `assert.equal(count, 11)` y `includes('the eleven commands of `bin/`')`), `tests/docs-facts.test.js` (la frase `'eleven commands of `bin/`'` de la lista que exige `docs/reference/components.md`, y la prueba que lee cada «N commands of `bin/`» y la compara con `bins().size`, que ya conoce `twelve`) y `docs/reference/components.md` (línea 46: «the eleven commands of `bin/`»). El merge de esta tarea corre `npm test && npm run test:mod` y un merge rojo se deshace, así que esta tarea cambia, en el mismo commit que agrega el bin, `eleven` por `twelve` y `11` por `12` en esos tres sitios. La Task 13, que borra `bin/aether-route` y deja otra vez once, los vuelve a `eleven` en `tests/docs-facts.test.js` y en `docs/reference/components.md` (`tests/aether-route.test.js` lo borra). Ni la Task 14 ni la 20 tocan ese recuento.

**Tests (write first):** `tests/delegate-run.test.js` y los ajustes de `tests/delegate-chain.test.js` y `tests/router-renewal.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const dr = require('../plugins/aether/lib/delegate-run.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
const PAIR = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high' }
const OK_TESTS = { command: 'npm test', exitCode: 0, passed: true, timedOut: false, outputTail: '' }

// An external file as `begin` writes it, over a repository whose worktree already holds the delegate's work.
function world(t, extra = {}) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const base = repo.git('rev-parse', 'HEAD')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'new.js'), 'hello\n')
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, 'Write src/new.js.')
  const file = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ id: 't1', session: 's1', cwd: repo.dir, attempt: 1, step: 'haiku', effort: 'high', launchKind: 'first', edits: true, owns: ['src/**'], tests: 'npm test', brief, findings: null, carry: null, pin: null, base, harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' }, task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000, ...extra }))
  const done = { status: 'done', id: 'run1', run: 'run1', branch: 'aether/run1/task-1', worktree: repo.dir, head: 'abc', base, pair: PAIR, summary: 'wrote it', tests: OK_TESTS, review: { status: 'done', pair: PAIR, verdict: 'ready', findings: [], summary: 'fine' }, merge: 'aether-wt merge run1 task-1' }
  return { repo, dataDir, base, done }
}

test('an editing delegate runs aether-lane delegate with the step model and effort, and comes back as a branch with tests, review and checks (C10, E1)', async (t) => {
  const { repo, dataDir, done } = world(t)
  const seen = []
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async (cwd, flags) => (seen.push({ cwd, flags }), done) })
  assert.equal(seen.length, 1)
  assert.deepEqual([seen[0].flags.model, seen[0].flags.effort, seen[0].flags.owns, seen[0].flags.tests, seen[0].flags.session], ['haiku', 'high', 'src/**', 'npm test', 's1'])
  assert.equal(seen[0].flags.pair, undefined)
  assert.equal(result.ok, true)
  for (const part of ['aether/run1/task-1', 'ready', 'aether-wt merge run1 task-1', 'aether-delegate verdict --task t1']) assert.ok(result.text.includes(part), part)
  assert.equal(result.checks.ok, true)
  const written = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.deepEqual([written.ok, written.pair.id, written.branch, written.base], [true, PAIR.id, 'aether/run1/task-1', done.base])
  assert.ok(fs.readFileSync(written.patch, 'utf8').includes('src/new.js'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), 'utf8')).ok, true)
  assert.equal(log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind === 'outcome').length, 0, 'the lane log already counts its spend')
})

test('a correction passes the pair, the earlier patch and the findings on to the lane command (R2, R4)', async (t) => {
  const patch = path.join(tempDir(t), 'old.patch')
  fs.writeFileSync(patch, 'diff')
  const findings = path.join(tempDir(t), 'findings.md')
  fs.writeFileSync(findings, 'src/a.js:3: empty case')
  const { repo, dataDir, done } = world(t, { launchKind: 'fix', pin: PAIR.id, carry: patch, findings })
  const seen = []
  await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async (cwd, flags) => (seen.push(flags), done) })
  assert.deepEqual([seen[0].pair, seen[0].carry, seen[0].findings, seen[0].effort], [PAIR.id, patch, findings, 'high'])
})

test('a result that touches files outside Owns, or changes nothing, is marked and never approvable (E9)', async (t) => {
  const outside = world(t)
  fs.mkdirSync(path.join(outside.repo.dir, 'docs'))
  fs.writeFileSync(path.join(outside.repo.dir, 'docs', 'x.md'), 'x\n')
  const r1 = await dr.runTask({ id: 't1', cwd: outside.repo.dir, dataDir: outside.dataDir }, { delegateCommand: async () => outside.done })
  assert.deepEqual([r1.checks.ok, r1.checks.outside], [false, ['docs/x.md']])
  const empty = world(t)
  fs.rmSync(path.join(empty.repo.dir, 'src'), { recursive: true })
  const r2 = await dr.runTask({ id: 't1', cwd: empty.repo.dir, dataDir: empty.dataDir }, { delegateCommand: async () => empty.done })
  assert.deepEqual([r2.checks.ok, r2.checks.empty], [false, true])
})

test('no pair at all is an answer without text, so the mod leaves the attempt to Claude (R14)', async (t) => {
  const { repo, dataDir } = world(t)
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => ({ status: 'no-candidate', cause: 'dry', reason: 'all dry', tried: [] }) })
  assert.deepEqual([result.ok, result.status, result.text], [false, 'no-candidate', null])
  assert.equal(log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result').ok, false)
})

test('a read-only delegate runs the chain; its answer is saved and an empty one fails the check (R6)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  const chain = async ({ external }) => ({ ok: true, status: 'ok', text: 'the answer', attribution: 'Aether: this answer is from grok-4.7 at high', attempts: [], journaled: true, external })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.ok(result.text.includes('the answer') && result.text.includes('this answer is from'))
  assert.equal(result.checks.ok, true)
  const saved = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.equal(fs.readFileSync(saved.answer, 'utf8'), 'the answer')
  const blank = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: async () => ({ ok: true, status: 'ok', text: '  ', attribution: 'a', attempts: [], journaled: true }) })
  assert.deepEqual([blank.checks.ok, blank.checks.empty], [false, true])
})

test('a read-only delegate that touched the copy comes back marked with the files it touched, never with an answer (R6)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  const chain = async () => ({ ok: false, status: 'violation', text: null, changed: ['src/a.js'], attempts: [], journaled: true })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.deepEqual([result.ok, result.text, result.checks.ok, result.checks.outside], [false, null, false, ['src/a.js']])
})

test('wait: not done while the delegate lives; its result once written; died when the pid is gone without one (R12)', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const runFile = path.join(dataDir, 'delegates', 'run', 't1.json')
  fs.mkdirSync(path.dirname(runFile), { recursive: true })
  fs.writeFileSync(runFile, JSON.stringify({ pid: process.pid, startedAt: 1 }))
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0.3 }), { done: false })
  fs.mkdirSync(path.join(dataDir, 'delegates', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), JSON.stringify({ ok: true, status: 'ok', text: 'branch' }))
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0.3 }), { done: true, ok: true, status: 'ok', text: 'branch' })
  fs.rmSync(path.join(dataDir, 'delegates', 'results', 't1.json'))
  const died = await dr.wait({ id: 't1', dataDir, seconds: 0.3, alive: () => false })
  assert.deepEqual(died, { done: true, ok: false, status: 'died', text: null })
  assert.equal((await dr.wait({ id: 'never-started', dataDir, seconds: 0.1 })).status, 'unknown')
})

test('start launches the run as a detached process of its own and returns at once', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launched = []
  const fakeSpawn = (command, args, options) => (launched.push({ command, args, options }), { pid: 4242, unref() { this.unrefed = true } })
  const out = dr.start({ id: 't1', cwd: dataDir, dataDir }, { spawn: fakeSpawn, binPath: BIN })
  assert.deepEqual(out, { started: true, id: 't1', pid: 4242 })
  assert.deepEqual(launched[0].args.slice(-3), ['run', '--id', 't1'])
  assert.equal(launched[0].options.detached, true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'run', 't1.json'), 'utf8')).pid, 4242)
})

test('answer records what a delegate on Claude ended with, even an empty text, through the bin (R6)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  assert.deepEqual(dr.recordAnswer({ task: 't1', attempt: 2, text: 'found it', session: 's1', dataDir, now: () => 7 }), { recorded: true })
  assert.deepEqual(log.readEntries(dataDir, { task: 't1' }).map((e) => [e.kind, e.attempt, e.text, e.session, e.time]), [['answer', 2, 'found it', 's1', 7]])
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', 's1', '--task', 't1', '--attempt', '3', '--text', ''], { encoding: 'utf8', env })
  assert.deepEqual(JSON.parse(out.stdout.trim()), { recorded: true })
  const last = log.readEntries(dataDir, { task: 't1' }).at(-1)
  assert.deepEqual([last.kind, last.attempt, last.text], ['answer', 3, ''])
  assert.equal(spawnSync(process.execPath, [BIN, 'answer', '--task', 't1'], { encoding: 'utf8', env }).status, 1)
})

test('the bin: an unknown verb is an error, wait on an id never started says unknown, verdict needs its flags', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const bad = spawnSync(process.execPath, [BIN, 'bogus'], { encoding: 'utf8', env })
  assert.equal(bad.status, 1)
  assert.ok(JSON.parse(bad.stdout.trim()).error)
  const waited = spawnSync(process.execPath, [BIN, 'wait', '--id', 'nope', '--seconds', '1'], { encoding: 'utf8', env })
  assert.equal(JSON.parse(waited.stdout.trim()).status, 'unknown')
  assert.equal(spawnSync(process.execPath, [BIN, 'verdict', '--task', 'x'], { encoding: 'utf8', env }).status, 1)
})
```

`tests/delegate-chain.test.js`: las pruebas existentes se ajustan para leer los `outcome` de `delegate-log.readEntries` (campo `id` de la tarea, `attempt` corrido), y una prueba nueva: un intento con status `violation` hace que `runChain` devuelva `changed` con los archivos que `runDelegate` dijo. `tests/delegate-calls.test.js`: el resultado `violation` de un delegado que cambió un archivo trae `changed` con ese archivo. `tests/router-renewal.test.js`: la prueba de `renewalArgv` espera `bin/aether-delegate` y el verbo `renew`.

**Acceptance:** `node --test tests/delegate-run.test.js tests/delegate-chain.test.js tests/router-renewal.test.js tests/delegate-calls.test.js tests/delegate-limits.test.js` pasa. `bin/aether-delegate` existe, es ejecutable y no importa nada de `lib/route.js`. Con doce archivos en `bin/` pasan `node --test tests/aether-route.test.js tests/docs-facts.test.js`, y `docs/reference/components.md` dice «the twelve commands of `bin/`». Ningún camino de `run` funde, hace `push` ni escribe en el checkout del Lead.

### Task 11: El mod entrega las llamadas `Agent` con la escalera

**Aether:**
- Tier: sonnet — integración del mod con el motor, que las pruebas simuladas sujetan solo en parte
- Review: xhigh — el motor decide qué ve el Lead; fallo del mod no debe romper la llamada
- Area: mod
- Owns: `plugins/aether/hooks/delegate.mjs`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/router.mjs`, `tests/delegate-mod.test.js`, `tests/router-mod.test.js`, `tests/docs-facts.test.js`
- Depends on: Task 1 — usa `waitForDelegate`
- Depends on: Task 10 — llama a los verbos `begin`, `start` y `wait` de `aether-delegate`
- Depends on: Task 17 — la prueba en el motor real dice si el bucle de espera y el `isolation` puestos por el mod valen
- Serves: R12, R13, R14, R20, R22

**Interfaces:**

```js
// plugins/aether/hooks/delegate.mjs  (reemplaza hooks/router.mjs; mismos cuatro métodos que hooks/register.js ya usa)
import { waitForDelegate } from './delegate-wait.mjs'
export function createDelegates() -> { toolCall($, e, next, ctx), bind($, e, agentId, ctx), has(agentId), async *step($, e, next, ctx), drain() }
// ctx = { session, dataDir, root }. `$` solo tiene $.clock.now, $.fs.write y $.process.run (ningún $.model).
```

- `toolCall`: una llamada cuyo `subagent_type` empieza con `aether:` pasa sin tocarse. Para las demás escribe el evento en `<dataDir>/delegates/in/<tiempo>-<n>.json` (campos `subagent_type`, `description`, `prompt`, `model`, `effort`, `run_in_background`, `isolation`) y corre `node <root>/bin/aether-delegate begin --session <session> --input <archivo>` (límite 25000 ms). Con el plan: `args` (`model`, `effort` y, si vienen, `prompt` e `isolation`) se pone sobre la llamada que sigue a `next`; las `notes` se agregan al `context` del resultado (nunca a una llamada rechazada); si el plan tiene `external`, la llamada se recuerda por su prompt final (el reescrito, si hay) con el `external`. Cualquier falla (excepción, salida distinta de 0, línea que no es JSON, `skip`) deja la llamada como la hizo el Lead.
- `bind`: al `agent.spawn` liga la llamada por su prompt al agente; un agente con `external` queda para su primer paso, y uno con `answerOf` (un delegado de solo lectura en Claude) queda para su último. `has(agentId)` es verdadero para los dos.
- `step`: en el paso 0 de un agente con `external`, corre `aether-delegate start --id <id>` (límite 15000 ms) y después `waitForDelegate`; con `ok` y texto no vacío entrega `{ kind: 'text', index: 0, text }` y `{ kind: 'stop', stopReason: 'end_turn', usage: null }` sin pasar por el modelo; con cualquier otra cosa sigue con `yield* next(e)` (el modelo del plan, que ya es el del escalón). En un agente con `answerOf` cada paso pasa por `yield* next(e)` sin cambios y, cuando el resultado de un paso trae `stopReason` distinto de `'tool_use'` y `answer` de tipo texto, corre `node <root>/bin/aether-delegate answer --session <session> --task <task> --attempt <attempt> --text <answer recortado a 4000 caracteres>` (límite 15000 ms; cualquier falla se ignora y el paso vuelve igual): es la respuesta que `verdict` comprueba (R6). `toolCall` recuerda `answerOf` del plan junto con la llamada, como recuerda `external`.
- `hooks/register.js`: importa `createDelegates` de `./delegate.mjs` en lugar de `createRouter` de `./router.mjs`, y renombra sus ayudantes (`routerCalls`, `routerContext`) a `delegateCalls` y `delegateContext`; la lista de llamadas que el mod hace es `$.clock.now`, `$.fs.write` y `$.process.run` (se quita `$.model.complete`). El encabezado de `register.js` describe la escalera, no el router.
- Se borra `hooks/router.mjs` y `tests/router-mod.test.js`.

**`tests/docs-facts.test.js` (esta tarea agrega una excepción; la Task 13 y la 14 lo tocan después).** Esta tarea borra `hooks/router.mjs`, y `docs/guide/router.md` (línea 16) lo nombra con su ruta en un código; la prueba C3 («the repository paths in code spans exist») se pondría roja en este merge, y un merge rojo se deshace. Por eso esta tarea agrega a `PATH_EXCEPTIONS` `'plugins/aether/hooks/router.mjs': 'the retired router mod, removed in spec 013; named by the router guide until docs/guide/delegates.md replaces it'` y la nombra en el comentario del encabezado de la prueba. Es la única ruta que se borra antes de la Task 13 y aparece en un código de las páginas que lee `tests/docs-facts.test.js` (`README.md` y `PAGES`): se buscaron también `lib/router-report.js` y `tests/router-report.test.js` (Task 8), `tests/router-settings.test.js` (Task 6) y `tests/router-mod.test.js` (esta tarea) y ninguna está nombrada en esas páginas (solo en `docs/handoff/`, que la prueba no lee). La excepción queda mientras la guía vieja exista; la Task 14 la deja o la quita, y ninguna de las dos cosas rompe la prueba.

**Tests (write first):** `tests/delegate-mod.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let createDelegates
test.before(async () => {
  ;({ createDelegates } = await import(path.join(HOOKS, 'delegate.mjs')))
})

const CTX = { session: 's1', dataDir: '/data', root: '/plugin' }
const out = (value) => ({ exitCode: 0, stdout: `log line\n${JSON.stringify(value)}\n`, stderr: '' })
const EV = { subagent_type: 'general-purpose', description: 'Fix it', prompt: 'AETHER-TASK: t1\nAETHER-OWNS: src/**\nFix it.', model: 'opus', effort: 'max' }
const PLAN = { id: 't1', skip: false, step: 'haiku', kind: 'first', attempt: 1, args: { model: 'haiku', effort: 'high' }, notes: ['Aether delegate task t1: step haiku, attempt 1'], external: null }
const EXTERNAL = { id: 't1', edits: true, timeoutMs: 570000, pin: null }

// `verbs` answers each verb (argv[2]) from a queue. Every `wait` that says { done: false } moves the clock 540 s.
function make(verbs) {
  const calls = { runs: [], writes: [] }
  const queues = Object.fromEntries(Object.entries(verbs).map(([verb, list]) => [verb, [...list]]))
  const state = { now: 1000 }
  const $ = {
    clock: { now: async () => state.now },
    fs: { write: async (file, text) => { calls.writes.push({ file, text }) } },
    process: {
      run: async (argv, init) => {
        calls.runs.push({ argv, init })
        const next = queues[argv[2]]?.shift()
        if (next === undefined) throw new Error(`no answer for ${argv[2]}`)
        if (next instanceof Error) throw next
        if (argv[2] === 'wait' && next.done === false) state.now += 540000
        return out(next)
      },
    },
  }
  return { $, calls, state }
}
const recorder = () => { const seen = []; return { seen, next: async (event) => (seen.push(event), { model: 'x', agentId: 'agent-1' }) } }
const collect = async (generator) => {
  const chunks = []
  let step = await generator.next()
  while (step.done !== true) { chunks.push(step.value); step = await generator.next() }
  return { chunks, result: step.value }
}

test('an aether agent is not touched and nothing runs', async () => {
  const { $, calls } = make({})
  const { seen, next } = recorder()
  await createDelegates().toolCall($, { ...EV, subagent_type: 'aether:judge' }, next, CTX)
  assert.deepEqual(seen, [{ ...EV, subagent_type: 'aether:judge' }])
  assert.equal(calls.runs.length + calls.writes.length, 0)
})

test('the plan decides the model and effort, whatever the Lead asked; its notes reach the Lead (C1, E2)', async () => {
  const { $, calls } = make({ begin: [PLAN] })
  const { seen, next } = recorder()
  const result = await createDelegates().toolCall($, EV, async (event) => (seen.push(event), { context: ['earlier'] }), CTX)
  assert.deepEqual([seen[0].model, seen[0].effort], ['haiku', 'high'])
  assert.deepEqual(result.context, ['earlier', PLAN.notes[0]])
  assert.deepEqual(calls.runs[0].argv.slice(0, 3), ['node', '/plugin/bin/aether-delegate', 'begin'])
  assert.ok(calls.writes[0].file.startsWith('/data/delegates/in/'))
  void next
})

test('a plan that rewrites the prompt (a correction on Claude) puts the new prompt on the call', async () => {
  const { $ } = make({ begin: [{ ...PLAN, args: { ...PLAN.args, prompt: 'Fix it.\n## Findings to fix\nsrc/a.js:3: empty case' } }] })
  const { seen, next } = recorder()
  await createDelegates().toolCall($, EV, next, CTX)
  assert.ok(seen[0].prompt.includes('## Findings to fix'))
})

test('the isolation of the plan lands on the call when the task edits (R13)', async () => {
  const { $ } = make({ begin: [{ ...PLAN, args: { ...PLAN.args, isolation: 'worktree' } }] })
  const { seen, next } = recorder()
  await createDelegates().toolCall($, EV, next, CTX)
  assert.equal(seen[0].isolation, 'worktree')
})

test('a failing or skipped begin leaves the call as the Lead made it', async () => {
  for (const verbs of [{ begin: [new Error('boom')] }, { begin: [{ id: null, skip: true, args: null, notes: [], external: null }] }]) {
    const { $ } = make(verbs)
    const { seen, next } = recorder()
    await createDelegates().toolCall($, EV, next, CTX)
    assert.deepEqual(seen, [EV])
  }
})

test('an external delegate is the first step of its agent: started, waited for, and answered with no model request (C9, E10)', async () => {
  const { $, calls, state } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: false }, { done: false }, { done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }] })
  const delegates = createDelegates()
  const { next } = recorder()
  await delegates.toolCall($, EV, next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  assert.equal(delegates.has('agent-1'), true)
  let asked = 0
  const { chunks, result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return {} }, CTX))
  assert.equal(asked, 0, 'no model request')
  assert.deepEqual(chunks.map((c) => c.kind), ['text', 'stop'])
  assert.equal(chunks[0].text, 'branch aether/r/task-1')
  assert.equal(result.answer, 'branch aether/r/task-1')
  assert.deepEqual(calls.runs.map((r) => r.argv[2]), ['begin', 'start', 'wait', 'wait', 'wait'])
  assert.ok(state.now - 1000 > 600000, 'the simulated delegate took more than 10 minutes')
  for (const run of calls.runs) assert.ok(run.init.timeoutMs < 600000)
})

test('an external delegate that does not deliver is left to the model, at the model of the plan (R14)', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'no-candidate', text: null }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return { answer: 'from the model' } }, CTX))
  assert.equal(asked, 1)
})

test('a read-only delegate on Claude goes through the model untouched, and its last answer is recorded with no model request of the mod (R6)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, answerOf: { task: 't1', attempt: 1 } }], answer: [{ recorded: true }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  assert.equal(delegates.has('agent-1'), true)
  let asked = 0
  const step = (index, result) => collect(delegates.step($, { index, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return result }, CTX))
  const tool = await step(0, { answer: '', stopReason: 'tool_use' })
  assert.equal(tool.result.stopReason, 'tool_use')
  assert.deepEqual(calls.runs.map((r) => r.argv[2]), ['begin'], 'a step that calls a tool records nothing')
  const last = await step(1, { answer: 'found it', stopReason: 'end_turn' })
  assert.equal(last.result.answer, 'found it')
  assert.equal(asked, 2, 'every step still goes to the model')
  const run = calls.runs.at(-1)
  assert.deepEqual(run.argv.slice(2, 4), ['answer', '--session'])
  assert.deepEqual(run.argv.slice(run.argv.indexOf('--task')), ['--task', 't1', '--attempt', '1', '--text', 'found it'])
  assert.ok(run.init.timeoutMs <= 15000)
})

test('a failing answer record never breaks the step of a read-only delegate on Claude', async () => {
  const { $ } = make({ begin: [{ ...PLAN, answerOf: { task: 't1', attempt: 1 } }], answer: [new Error('boom')] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const { result } = await collect(delegates.step($, { index: 3, agentId: 'agent-1', turnId: 't' }, async function* () { return { answer: 'found it', stopReason: 'end_turn' } }, CTX))
  assert.equal(result.answer, 'found it')
})

test('a later step of the same agent is never taken over', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  await collect(delegates.step($, { index: 1, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return {} }, CTX))
  assert.equal(asked, 1)
})
```

**Acceptance:** `node --test tests/delegate-mod.test.js` y `npm run test:mod` pasan. `hooks/delegate.mjs` no importa nada de `lib/` ni llama a `$.model`. `hooks/router.mjs` y `tests/router-mod.test.js` ya no existen, y `node --test tests/docs-facts.test.js` pasa con la excepción de `plugins/aether/hooks/router.mjs`. Lo que el motor hace con el primer paso de más de 10 minutos y con un `isolation` puesto por el mod lo mide la Task 17, antes de esta tarea; lo que hace con un `prompt` reescrito queda para la sesión real (C12).

### Task 12: La guía del Lead describe la escalera

**Aether:**
- Tier: sonnet — prosa que el Lead sigue y que las pruebas fijan solo por sus frases
- Review: high — la regla de repetición y la excepción de A72 no se pueden contradecir
- Area: guide
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `tests/delegate-skill.test.js`, `tests/bootstrap-design.test.js`, `tests/bootstrap-names.test.js`
- Depends on: Task 10 — nombra los verbos de `aether-delegate`
- Serves: R5, R19, R7, R8

**Interfaces:**

`skills/using-aether/SKILL.md` cambia donde habla de los delegados:

- Quita la regla «Climb on failure: ... run it again one model up» y la de «Router in `command`» y la de pasar `model` y `effort` en cada llamada `Agent`.
- Pone la escalera: un delegado empieza siempre en Haiku y lo fija el sistema (el Lead no pasa `model` ni `effort`; lo que pase se ignora); cada llamada lleva `AETHER-TASK: <id>` y, si edita, `AETHER-OWNS: <globs>` y `AETHER-TESTS: <command>` (sin ellas la tarea es de solo lectura); un delegado que edita en Claude lleva `isolation: "worktree"` (el sistema lo pone en la llamada) y el Lead pasa a `verdict` la ruta de ese worktree con `--worktree`, porque sin ella o sin las comprobaciones de un resultado un `approve` se rechaza; el resultado ya trae las comprobaciones y la revisión de otro pair; el Lead juzga con `${CLAUDE_PLUGIN_ROOT}/bin/aether-delegate verdict --task <id> --verdict approve|fix|infeasible` (`--finding 'archivo:línea: qué falta'`, `--reason`, `--from-scratch`, `--worktree <ruta>`); corrige sobre lo hecho con hallazgos concretos; sube solo cuando se agotan las correcciones, vuelven los mismos hallazgos o declara inviable con razón; los topes están en `config/ladder.json`; después de Opus la tarea se aplaza o va a la lista del dueño según la regla de repetición.
- Conserva la excepción de A72: un pair que falla al arrancar por cuota o por tiempo se reemplaza y no se repite; no es una corrección.
- No lee el diff entero cuando las comprobaciones y la revisión de otro pair bastan; lo lee solo cuando se contradicen o faltan.
- La línea sobre los delegados que editan en otro harness deja de mandar a `aether-lane delegate` por Bash: ahora van por `Agent`; `aether-lane delegate` queda como lo que usa el sistema.
- La línea de «Autonomous runs» (`a delegate task that fails: run it again one model up`) apunta a la escalera.

**Tests (write first):** `tests/delegate-skill.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SKILL = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'skills', 'using-aether', 'SKILL.md'), 'utf8')

test('the bootstrap describes the ladder (R19, C2, C3, C5)', () => {
  for (const phrase of ['AETHER-TASK:', 'AETHER-OWNS:', 'AETHER-TESTS:', 'aether-delegate verdict', 'config/ladder.json', '--from-scratch', 'isolation: "worktree"']) {
    assert.ok(SKILL.includes(phrase), phrase)
  }
  assert.match(SKILL, /always start on Haiku|starts on Haiku/i)
  assert.match(SKILL, /after Opus[^.\n]*(defer|owner's list)/i)
  assert.match(SKILL, /same findings/i)
})

test('the old rules are gone', () => {
  for (const gone of ['ROUTER-OVERRIDE', 'Router in `command`', 'run it again one model up', 'relaunch it one model up']) assert.equal(SKILL.includes(gone), false, gone)
})

test('the exception of A72 stays: a pair that fails at its start is replaced, never repeated, and that is not a correction', () => {
  assert.match(SKILL, /quota[^.\n]*(replaced|replace)[^.\n]*never repeated|never repeated[^.\n]*quota/i)
})

test('the Lead does not read the whole diff when the checks and the other pair review are enough', () => {
  assert.match(SKILL, /do not read the whole diff|not read the diff/i)
})

test('an editing delegate is launched with Agent, not with Bash', () => {
  assert.equal(/aether-lane delegate --brief[^\n]*in the background/i.test(SKILL), false)
})
```

**Acceptance:** `node --test tests/delegate-skill.test.js tests/bootstrap-design.test.js tests/bootstrap-names.test.js tests/agents.test.js` pasa. La skill sigue dentro del tamaño que `tests/bootstrap-design.test.js` fija. No aparecen los números 5, 2 y 1 como reglas: remite a `config/ladder.json`.

### Task 13: Retirar el decisor del router: su código, sus datos y sus pruebas

**Aether:**
- Tier: sonnet — muchos archivos que se borran, sin romper lo que se queda
- Review: xhigh — un borrado: no puede arrastrar las marcas, la elección del pair ni el lector del diario
- Area: removal
- Owns: `plugins/aether/bin/aether-route`, `plugins/aether/lib/route.js`, `plugins/aether/lib/router-criterion.js`, `plugins/aether/lib/router-deciders.js`, `plugins/aether/lib/router-replay.js`, `plugins/aether/lib/router-rungs.js`, `plugins/aether/lib/router-reference.js`, `plugins/aether/lib/router-report.js`, `plugins/aether/config/router`, `scripts/build-router-rungs.js`, `tests/lane-delegate-scenarios.test.js`, `tests/router-report.test.js`, `tests/aether-route.test.js`, `tests/router-aether-task.test.js`, `tests/router-criterion.test.js`, `tests/router-deciders.test.js`, `tests/router-regression.test.js`, `tests/router-replay.test.js`, `tests/router-route.test.js`, `tests/router-rungs.test.js`, `tests/router-surface.test.js`, `tests/router-removed.test.js`, `tests/docs-facts.test.js`, `docs/reference/components.md`
- Depends on: Task 7 — `begin` y `verdict` reemplazan a `lib/route.js`
- Depends on: Task 8 — el informe nuevo reemplaza a `lib/router-report.js`, que ya no usa `bin/aether-report`, y esa tarea quitó la prueba de la medida de `tests/lane-delegate-scenarios.test.js`
- Depends on: Task 10 — `aether-delegate` reemplaza a `aether-route`, y `renew` y la cadena ya no usan `router-log`
- Depends on: Task 11 — el mod nuevo reemplaza a `hooks/router.mjs`, que usa `aether-route`
- Serves: R9, R11, R22

**Interfaces:**

Se borran: `bin/aether-route`, `lib/route.js`, `lib/router-criterion.js`, `lib/router-deciders.js`, `lib/router-replay.js`, `lib/router-rungs.js`, `lib/router-reference.js`, `lib/router-report.js`, la carpeta `config/router/` y `scripts/build-router-rungs.js`, y las pruebas de lo borrado (`aether-route`, `router-aether-task`, `router-criterion`, `router-deciders`, `router-regression`, `router-replay`, `router-route`, `router-rungs`, `router-surface`, `router-report`). Se conservan, sin cambios de nombre ni de resultado, `lib/router-marks.js`, `router-slow.js`, `router-quota.js`, `router-pick.js` y `router-renewal.js` y sus pruebas. Si otro archivo del plugin importa un módulo borrado, esta tarea lo corrige o lo quita. `tests/lane-delegate-scenarios.test.js` (:17) requiere `lib/route.js` y lo usa por `route.begin` y `route.finish` en `go` y en E6 (`ROUTER-OVERRIDE` ya no existe): esta tarea lo reescribe, porque es el único archivo de `tests/` fuera de las pruebas borradas que importa un módulo borrado. E6 conserva lo que prueba de `aether-lane delegate` con la superdelegación apagada (el estado `off`, sin turnos, sin run y sin entradas nuevas en la bitácora de lanes) y quita lo que prueba del decisor (el plan de `go`, el `journal` del diario del router); se borran `routerDeps`, `answers`, `readOnlyAnswer`, `editsAnswer`, `go` y `journal`, los ajustes `router` de `session.markSession` (:130-133), la constante `READINGS` y sus ayudas `win`, `weekly`, `gemini` y `geminiKeys` si ya nada las usa, y los `require` de `route.js` y de `router-log.js` cuando quedan sin uso. Las demás pruebas del archivo (E1 a E5, E7, E8) corren sin cambios. (`lib/session.js`, `lib/guard.js` y `lib/router-log.js` los recorta Task 16.)

**`tests/docs-facts.test.js` (esta tarea lo toca, y la Task 14 después).** Al borrar `bin/aether-route` y los archivos del decisor, `docs/changelog.md` (que ninguna tarea edita, es historia) y las guías que la Task 14 todavía no cambió siguen nombrándolos, y la prueba R11 («every aether-* command in position is a file of bin/») y la C3 («the repository paths in code spans exist») se pondrían rojas. Esta tarea agrega, con su razón cada una, y las nombra en el comentario del encabezado de la prueba:

- a `EXCEPTIONS`: `'aether-route': 'the retired decider command, named as history by docs/changelog.md (the pages that still name it are changed by tasks of spec 013)'`;
- a `PATH_EXCEPTIONS`: `'plugins/aether/config/router/criterion.json': 'the decider's criterion, removed in spec 013; the changelog keeps the words of the release that shipped it'`, y dos que solo nombra `docs/guide/router.md` hasta que la Task 14 lo reemplaza: `'plugins/aether/config/router/rungs.json'` y `'scripts/build-router-rungs.js'` (misma razón: removed in spec 013, named by the router guide until it is replaced). La excepción de `'plugins/aether/hooks/router.mjs'` ya la puso la Task 11, que borra ese archivo; esta tarea no la repite.

**El recuento de los bins vuelve a once.** Esta tarea borra `bin/aether-route` y deja once archivos en `bin/` (la Task 10 los había subido a doce con `bin/aether-delegate`): en `tests/docs-facts.test.js` la frase `'twelve commands of `bin/`'` vuelve a `'eleven commands of `bin/`'`, y en `docs/reference/components.md` (línea 46) «the twelve commands of `bin/`» vuelve a «the eleven commands of `bin/`». `tests/aether-route.test.js`, que contaba los bins, se borra con el resto.

No cambia nada más de la prueba: la lista `PAGES` sigue nombrando `docs/guide/router.md` hasta la Task 14. `docs/roadmap.md` no nombra `aether-route` ni enlaza `guide/router.md` (su línea 9 solo dice «the router» en prosa), y `docs/contributing.md` tampoco: no hay nada que excepcionar en ellos.

**Tests (write first):** `tests/router-removed.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const exists = (...parts) => fs.existsSync(path.join(...parts))

test('the decider, its command, its data and its script are gone (R9)', () => {
  for (const file of ['bin/aether-route', 'lib/route.js', 'lib/router-criterion.js', 'lib/router-deciders.js', 'lib/router-replay.js', 'lib/router-rungs.js', 'lib/router-reference.js', 'lib/router-report.js', 'hooks/router.mjs', 'config/router']) {
    assert.equal(exists(PLUGIN, file), false, file)
  }
  assert.equal(exists(ROOT, 'scripts', 'build-router-rungs.js'), false)
})

test('the marks, the quota, the renewal and the pair step stay and load (R11)', () => {
  for (const name of ['router-marks', 'router-slow', 'router-quota', 'router-pick', 'router-renewal', 'router-log']) {
    assert.doesNotThrow(() => require(path.join(PLUGIN, 'lib', `${name}.js`)), name)
  }
})

test('no file of the plugin requires a module that is gone', () => {
  const gone = /require\([^)]*(['"/])(route|router-criterion|router-deciders|router-replay|router-rungs|router-reference|router-report)(\.js)?['"]\)/
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
  for (const file of walk(path.join(PLUGIN, 'lib')).concat(walk(path.join(PLUGIN, 'bin')))) {
    assert.equal(gone.test(fs.readFileSync(file, 'utf8')), false, file)
  }
})
```

**Acceptance:** `npm test && npm run test:mod` pasa con todo lo borrado ausente; las pruebas de la elección del pair, de las marcas, de la renovación, de la cuota y de `aether-lane` pasan sin cambiar su resultado (C8). `grep -r "aether-route" plugins/aether/bin plugins/aether/lib plugins/aether/hooks scripts` no da nada, salvo `lib/guard.js`, que recorta Task 16. `node --test tests/docs-facts.test.js` pasa con `aether-route` y las tres rutas de esta tarea (`config/router/criterion.json`, `config/router/rungs.json` y `scripts/build-router-rungs.js`) como excepciones, más la de `hooks/router.mjs` que puso la Task 11, cada una con su razón en el encabezado de la prueba, y con once archivos en `bin/` y «the eleven commands of `bin/`» en `docs/reference/components.md`.

### Task 14: La guía de los delegados describe la escalera

**Aether:**
- Tier: sonnet — prosa que el árbol y `docs-facts` sujetan
- Review: high — los enlaces y las anclas que las pruebas leen
- Area: docs
- Owns: `docs/guide/router.md`, `docs/guide/delegates.md`, `docs/index.md`, `docs/guide/lanes.md`, `docs/guide/troubleshooting.md`, `docs/guide/maintenance.md`, `tests/docs-facts.test.js`, `tests/router-docs.test.js`, `tests/delegates-docs.test.js`, `tests/delegate-docs.test.js`, `tests/lanes-docs.test.js`
- Depends on: Task 19 — la tabla de opciones ya coincide con el manifiesto
- Depends on: Task 10 — describe los verbos de `aether-delegate`
- Depends on: Task 11 — describe el mod nuevo
- Depends on: Task 12 — enlaza la guía del Lead
- Depends on: Task 13 — el decisor ya no existe, y las guías no lo nombran
- Serves: R10, R22

**Interfaces:**

- `docs/guide/router.md` se renombra `docs/guide/delegates.md` (front matter con `title`, `description` y `order` enteros, el mismo orden) y describe la escalera: empieza en Haiku, el sistema fija el escalón, la corrección sobre lo hecho, las tres causas de subida, «empezar de cero», después de Opus, quién juzga y las comprobaciones primero, `aether-delegate`, las líneas `AETHER-TASK:`, `AETHER-OWNS:` y `AETHER-TESTS:`, la bitácora (`<dataDir>/delegates/log.jsonl`), `config/ladder.json`, `aether-report --delegates` y el delegado que edita visible como agente. Conserva lo que ya explica de la elección del pair, el comando `aether-lane delegate` y los fallos de A72.
- `docs/index.md`, `docs/guide/lanes.md`, `docs/guide/troubleshooting.md` y `docs/guide/maintenance.md` apuntan a `guide/delegates.md` y dejan de nombrar las tres opciones, `aether-route` y los tres modos. `docs/reference/components.md`, `docs/getting-started.md`, `README.md` y `CLAUDE.md` los cambia la Task 20.
- `tests/docs-facts.test.js`: la lista `PAGES` nombra `docs/guide/delegates.md` en lugar de `docs/guide/router.md`. El `docs/changelog.md`, que ninguna tarea edita, enlaza `guide/router.md` (con las anclas `#fallback` y `#quota`) en las líneas 59, 65, 71, 144, 148 y 153, y la prueba R10 (enlaces que resuelven) las pondría rojas: se agrega una excepción de enlaces, `LINK_EXCEPTIONS = { 'docs/changelog.md': ['guide/router.md'] }` (la razón: el registro histórico enlaza la guía como era cuando salió cada versión, y la página pasó a `guide/delegates.md`), y la prueba R10 salta, en ese archivo, un enlace cuyo archivo es uno de la lista, con o sin ancla; el encabezado de la prueba la nombra con su razón. Se quitan de `PATH_EXCEPTIONS` las tres rutas que solo nombraba la guía vieja (`plugins/aether/hooks/router.mjs`, `plugins/aether/config/router/rungs.json`, `scripts/build-router-rungs.js`): la guía ya no existe y nada más las nombra; `plugins/aether/config/router/criterion.json` y `aether-route` se quedan, porque el registro de cambios las nombra.
- `tests/router-docs.test.js` se borra y `tests/delegates-docs.test.js` lo reemplaza.

**Tests (write first):** `tests/delegates-docs.test.js` (nuevo) y los cambios de `tests/docs-facts.test.js`, `tests/delegate-docs.test.js` y `tests/lanes-docs.test.js` que apuntan a `delegates.md`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
const page = read('docs', 'guide', 'delegates.md')

test('the guide of the delegates describes the ladder (R10)', () => {
  for (const needed of ['AETHER-TASK:', 'AETHER-OWNS:', 'AETHER-TESTS:', 'aether-delegate', 'config/ladder.json', 'Haiku', 'Sonnet', 'Opus', 'aether-report --delegates', 'from scratch']) {
    assert.ok(page.includes(needed), needed)
  }
})

test('the guide keeps the choice of the pair and the failures of A72', () => {
  assert.ok(page.includes('aether-lane delegate'))
  assert.match(page, /never repeated|not repeated/)
})

test('the page has its front matter and the index links it', () => {
  assert.match(page, /^---\ntitle: .+\ndescription: .+\norder: \d+\n/)
  assert.ok(read('docs', 'index.md').includes('guide/delegates.md'))
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'docs', 'guide', 'router.md')), false)
})
```

**Acceptance:** `node --test tests/docs-facts.test.js tests/delegates-docs.test.js tests/delegate-docs.test.js tests/lanes-docs.test.js` pasa. `docs/guide/router.md` ya no existe. Los enlaces y las anclas pasan `tests/docs-facts.test.js` sin más excepción nueva que la de los enlaces del registro de cambios a `guide/router.md`.

### Task 15: La prueba que busca lo retirado

**Aether:**
- Tier: haiku high — una prueba de búsqueda con identificadores exactos que la spec fija
- Review: high — que no deje pasar una mención ni marque una palabra común
- Area: final
- Owns: `tests/no-router.test.js`, `tests/lane-delegate-scenarios.test.js`, `plugins/aether/lib/lane-pick.js`
- Depends on: Task 13 — el decisor ya no existe
- Depends on: Task 14 — las guías ya no lo nombran
- Depends on: Task 16 — la sesión, el guard y el diario ya no lo nombran
- Depends on: Task 18 — el panel ya no lo nombra
- Depends on: Task 19 — el manifiesto y la tabla de opciones ya no lo nombran
- Depends on: Task 20 — el README, el CLAUDE.md y la referencia ya no lo nombran
- Serves: R9, R10, R22

**Interfaces:**

`tests/no-router.test.js` busca, en `plugins/aether/`, `docs/guide/`, `docs/reference/`, `docs/index.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md`, `docs/contributing.md`, `README.md`, `CLAUDE.md`, `scripts/` y `tests/` (menos el archivo mismo), estos identificadores exactos de C7: `aether-route` (palabra completa), `ROUTER-OVERRIDE`, `CLAUDE_PLUGIN_OPTION_ROUTER`, `CLAUDE_PLUGIN_OPTION_DECIDER`, `CLAUDE_PLUGIN_OPTION_FALLBACK`, las formas `--config router=`, `--config decider=` y `--config fallback=`, el código `` `router` `` o `` `decider` `` como nombre de opción, las claves `router`, `decider` y `fallback` en el `userConfig` del manifiesto y en la tabla de `docs/guide/options.md`, y una línea que junte `record` o `advise` con `router` o `decider` como modos. Las excepciones, cada una con su razón: `docs/decisions.md`, `docs/changelog.md` y `docs/handoff/` (registro histórico, fuera del escaneo); `tests/docs-facts.test.js` y `tests/router-removed.test.js` (la primera guarda `aether-route` como excepción por el registro de cambios y la segunda prueba que el decisor ya no está: Task 13); `plugins/aether/lib/router-log.js` y `plugins/aether/lib/spend.js` (el lector del diario viejo, R18); los archivos de las marcas de pairs agotados o lentos (R11): `router-marks.js`, `router-slow.js`, `router-quota.js`, `router-pick.js`, `router-renewal.js`. Las palabras comunes (`fallback` o `command` en otro sentido, `native fallback`, `openrouter`) no cuentan. El otro archivo de `tests/` que todavía puede mencionar `aether-route` (`tests/lane-delegate-scenarios.test.js`: la Task 13 ya lo reescribió sin `lib/route.js` ni el decisor, y aquí solo se corrige lo que aún lo nombre, por ejemplo en un comentario del encabezado) se revisa aquí. `lib/lane-pick.js` tiene un comentario (líneas 58 a 61: «the router's file or the harness's record ... where the router reads it») que la última de esas formas leería como un modo del router, y no está en la lista de excepciones: se reescribe sin juntar `router` y `record` en una línea (por ejemplo «the readings file of the quota module or the harness's own record»), sin cambiar una línea de código.

**Tests (write first):** `tests/no-router.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SCAN = ['plugins/aether', 'docs/guide', 'docs/reference', 'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/contributing.md', 'README.md', 'CLAUDE.md', 'scripts', 'tests']
// The files that may keep a name or a word, each with its reason (spec 013, C7).
const ALLOWED = {
  'plugins/aether/lib/router-log.js': 'the reader of the old journal (R18)',
  'plugins/aether/lib/spend.js': 'reads the old journal (R18)',
  'plugins/aether/lib/router-marks.js': 'the marks of exhausted pairs (R11)',
  'plugins/aether/lib/router-slow.js': 'the marks of slow pairs (R11)',
  'plugins/aether/lib/router-quota.js': 'the readings the pair choice uses (R11)',
  'plugins/aether/lib/router-pick.js': 'the pair step (R11)',
  'plugins/aether/lib/router-renewal.js': 'the renewal of readings (R11)',
  'tests/no-router.test.js': 'this test',
  'tests/docs-facts.test.js': 'keeps aether-route as an exception: the changelog names it as history (Task 13)',
  'tests/router-removed.test.js': 'proves that the decider and its command are gone (Task 13)',
}
const IDENTIFIERS = [
  /\baether-route\b/,
  /ROUTER-OVERRIDE/,
  /CLAUDE_PLUGIN_OPTION_(ROUTER|DECIDER|FALLBACK)/,
  /--config (router|decider|fallback)=/,
  /`(router|decider)`/,
  /\b(record|advise)\b.*\b(router|decider)\b|\b(router|decider)\b.*\b(record|advise)\b/,
]

function files(entry) {
  const full = path.join(ROOT, entry)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [entry]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((child) => {
    if (['node_modules', '.git', 'types'].includes(child.name)) return []
    return files(path.posix.join(entry, child.name))
  })
}

test('the identifiers of the decider appear nowhere but where C7 allows (C7, R9, R10)', () => {
  const found = []
  for (const file of SCAN.flatMap(files)) {
    if (Object.hasOwn(ALLOWED, file) || !/\.(js|mjs|jsx|ts|tsx|json|md|sh)$|\/aether-[a-z-]+$/.test(file)) continue
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    lines.forEach((line, n) => {
      if (/openrouter/i.test(line) && !IDENTIFIERS.slice(0, 5).some((id) => id.test(line))) return
      for (const id of IDENTIFIERS) if (id.test(line)) found.push(`${file}:${n + 1}: ${line.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(found, [])
})

test('the manifest declares none of the three options and the options table lists none (C7, E12)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
  for (const key of ['router', 'decider', 'fallback']) assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
  const table = fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8')
  for (const key of ['router', 'decider', 'fallback']) assert.equal(new RegExp(`^\\| \`${key}\` \\|`, 'm').test(table), false, key)
})

test('a user value saved in the three removed options changes nothing in the session settings (E12)', () => {
  const session = require('../plugins/aether/lib/session.js')
  const base = session.delegateSettingsFrom({})
  const saved = session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_ROUTER: 'advise', CLAUDE_PLUGIN_OPTION_DECIDER: 'jev', CLAUDE_PLUGIN_OPTION_FALLBACK: 'opus:max' })
  assert.deepEqual(saved, base)
})
```

**Acceptance:** `npm run check` pasa (`npm test`, `npm run test:mod` y `npm run validate`). `tests/no-router.test.js` no encuentra un identificador de C7 fuera de las excepciones nombradas, y cada excepción tiene su razón. `tests/lane-delegate-scenarios.test.js` ya no nombra `aether-route`. `lib/lane-pick.js` queda igual salvo ese comentario, y las pruebas de la elección del pair pasan sin cambios.

### Task 16: Recortar la sesión, el guard y el lector del diario

**Aether:**
- Tier: haiku high — recortes pequeños con pruebas exactas
- Review: xhigh — el diario viejo solo se lee, y el guard no puede perder otras clases
- Area: removal-trim
- Owns: `plugins/aether/lib/session.js`, `plugins/aether/lib/guard.js`, `plugins/aether/lib/router-log.js`, `tests/guard.test.js`, `tests/router-log.test.js`, `tests/superdelegation-gone.test.js`, `tests/session.test.js`, `tests/trim-router.test.js`
- Depends on: Task 13 — `lib/route.js`, lo único que todavía lee lo que se recorta, ya no existe
- Serves: R9, R11, R18, R22

**Interfaces:**

- `lib/router-log.js`: queda como lector del diario viejo, `{ journalFile, readJournal }`; sale `appendEntry` (R18, D4).
- `lib/guard.js`: sale la entrada `['paid-call', 'aether-route replay', ...]` y su comentario; `tests/guard.test.js` quita la prueba de ese comando.
- `lib/session.js`: salen `routerSettingsFrom`, `readRouterSettings`, `routerFile`, `parseFallback`, el parámetro `router` de `markSession`, `ROUTER_MODES`, `ROUTER_DECIDERS` y lo que solo ellos usaban (`FALLBACK_*`, `DEFAULT_FALLBACK`); `parseDeadlines` conserva solo `quota` (acepta y deja pasar `haiku=` y `jev=`); `pruneSessions` sigue borrando `<id>.router.json` de una versión vieja.
- `tests/superdelegation-gone.test.js`: la lista de quién llama a la función única de elección ya no nombra `lib/route.js`.

**Tests (write first):** `tests/trim-router.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const lib = (name) => require(path.join(PLUGIN, 'lib', `${name}.js`))

test('the old journal is only read: router-log has no way to write it (R18, D4)', () => {
  const journal = lib('router-log')
  assert.equal(journal.appendEntry, undefined)
  assert.equal(typeof journal.readJournal, 'function')
  assert.equal(typeof journal.journalFile, 'function')
})

test('the guard no longer knows aether-route', () => {
  assert.notEqual(lib('guard').irreversibleClass('aether-route replay --projects p --decider haiku --paid'), 'paid-call')
})

test('the session settings of the decider are gone, and a deadlines value with the old keys still parses (E12)', () => {
  const session = lib('session')
  for (const name of ['routerSettingsFrom', 'readRouterSettings', 'routerFile', 'parseFallback']) assert.equal(session[name], undefined, name)
  assert.equal(session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_DEADLINES: 'haiku=5,jev=3,quota=2' }).deadlines.quotaMs, 2000)
})

test('pruneSessions removes the delegate file and an old router file of a session that aged out', (t) => {
  const session = lib('session')
  const dir = tempDir(t)
  const sessions = path.join(dir, 'sessions')
  fs.mkdirSync(sessions)
  const files = ['old.json', 'old.delegate.json', 'old.router.json'].map((name) => path.join(sessions, name))
  for (const file of files) {
    fs.writeFileSync(file, '{}')
    fs.utimesSync(file, new Date(Date.now() - 40 * 86400000), new Date(Date.now() - 40 * 86400000))
  }
  session.pruneSessions(dir, { days: 30 })
  for (const file of files) assert.equal(fs.existsSync(file), false, file)
})
```

**Acceptance:** `npm test` pasa; la prueba de la pareja `id` e `attempt` de gasto (Task 9) y las pruebas de las marcas siguen verdes. `grep -rn "appendEntry" plugins/aether/lib/router-log.js` no da nada y `grep -rn "aether-route" plugins/aether/lib` no da nada.

### Task 17: La prueba de espera en el motor real (paso del Lead)

**Aether:**
- Tier: opus high — lo hace el Lead a mano, no el enjambre: decide entre el bucle del mod y el respaldo de Haiku (R20)
- Review: xhigh — la decisión depende de lo que el motor haga de verdad, no de lo que las pruebas simuladas aproximan
- Area: lead
- Owns: `docs/evidence/013-delegate-ladder.md`
- Depends on: Task 1 — usa `hooks/delegate-wait.mjs`, ya fundido
- Serves: R12, R20

**Interfaces:**

Es un paso del Lead (ver Global Constraints): se corre después de fundir la Task 1 y antes de lanzar las Tasks 10 y 11. No gasta cuota de otro plan (ni `aether-lane` ni un harness externo); gasta unas pocas peticiones de Claude, en Haiku, de los agentes de prueba, y la sesión interactiva necesita unos 20 minutos.

1. Un plugin desechable en `.aether/spike-wait/` (git-ignorado): una copia de `plugins/aether/` donde `hooks/router.mjs` se reemplaza por un mod mínimo. Su `toolCall` pone `model: 'haiku'`, `effort: 'low'` e `isolation: 'worktree'` en toda llamada `Agent` cuyo prompt tenga la línea `SPIKE-WAIT`, y su primer `step` corre `aether-delegate start` y `waitForDelegate` (el de la Task 1) y entrega el texto que reciba, sin pasar por el modelo. El `bin/aether-delegate` de esa copia es este, solo para la prueba:

```js
#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const counter = path.join(__dirname, '.waits')
const verb = process.argv[2]
// `start` resets the counter, so a rerun of the test begins from zero
if (verb === 'start') {
  fs.writeFileSync(counter, '0')
  console.log(JSON.stringify({ started: true, id: 'spike', pid: process.pid }))
} else if (verb === 'wait') {
  const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0
  fs.writeFileSync(counter, String(n + 1))
  const seconds = Number(process.argv[process.argv.indexOf('--seconds') + 1])
  // two waits of 540 s: the delegate lasts 18 minutes, more than the 10 of one command
  if (n < 2) setTimeout(() => console.log(JSON.stringify({ done: false })), seconds * 1000)
  else console.log(JSON.stringify({ done: true, ok: true, status: 'ok', text: 'SPIKE-OK' }))
}
```

   El mismo mod de prueba, en el `step` de un agente cuyo prompt tenga la línea `SPIKE-ANSWER`, hace `yield* next(e)` sin cambiar nada y escribe con `$.fs.write` en `.aether/spike-wait/seen.json` el `stopReason` y el `answer` de cada paso que ve (para la comprobación e).

2. Una sesión **interactiva** con ese plugin (`scripts/aether-lead --plugin-dir <worktree>/.aether/spike-wait/aether`): la barra de agentes y `/agents` no existen en `claude -p`, y la comprobación b las necesita. Si el dueño no está, el Lead la abre en una terminal de Orca (`$ORCA_WSL_CLI_DIR/orca-ide terminal create ... --command` con ese comando), comprueba que el comando corrió, le pide la llamada a `Agent` por esa terminal y lee la pantalla con `orca-ide terminal read`. Le pide dos llamadas a `Agent` con Haiku: una con la línea `SPIKE-WAIT` y otra con la línea `SPIKE-ANSWER` cuyo prompt dice «answer exactly SPIKE-ANSWER-OK and nothing else». Mientras la primera corre, el Lead mira cada minuto la lista de agentes de la sesión (la barra de agentes o `/agents`) y anota la hora.

3. Lo que se comprueba y se anota en `docs/evidence/013-delegate-ladder.md` (sección «Prueba de espera, R20»):
   - a. el primer paso del agente sobrevive 18 minutos o más: la respuesta del agente es exactamente `SPIKE-OK` y llega sin error;
   - b. el agente aparece como activo en cada lectura de la lista, hasta que termina;
   - c. no hay una petición de modelo del agente (el registro de uso de la sesión no trae una del agente de la prueba);
   - d. el `isolation: 'worktree'` que puso el mod llegó a la llamada: existe un worktree del agente bajo `.claude/worktrees/` mientras corre (esto responde si un `toolCall` del mod puede poner `isolation`);
   - e. el `step` del mod ve la respuesta final de un agente que corre en Claude: `seen.json` tiene un paso con `stopReason` distinto de `tool_use` y `answer` igual a `SPIKE-ANSWER-OK` (esto responde si la comprobación de la respuesta vacía de R6 puede correr sobre lo que el mod anota con `aether-delegate answer`).

4. Decisión, escrita en el mismo archivo:
   - a, b y c se cumplen: se queda el bucle del mod (S1), y las Tasks 10 y 11 siguen como están.
   - a o b falla: el Lead revisa el plan (Design 7, S1, Tasks 10 y 11) para el respaldo (un agente de Haiku con solo Bash que lanza `aether-delegate start` y repite `wait`), y mide ahí cuántas peticiones de Haiku cuesta (D8), antes de lanzar esas dos tareas.
   - e falla: el mod no ve la respuesta de un delegado en Claude y R6 («su respuesta no está vacía») no se puede comprobar ahí: el Lead lo lleva al dueño como un cambio de la spec (R6: en un delegado en Claude, la respuesta vacía la ve el Lead) y, con su sí, quita el verbo `answer` de la Task 10, el paso que lo llama en la Task 11 y la regla de `answer` del `approve` de solo lectura de la Task 7 (y `answerOf`), antes de lanzar las Tasks 10 y 11; la Task 7, si ya se fundió, la corrige el Lead con una revisión de ese plan.
   - d falla: el mod no puede poner `isolation`; la red de la Task 7 sigue (un `approve` de un intento en Claude que edita se rechaza sin `--worktree` ni comprobaciones) y la guía de la Task 12 es quien lo pide; se quita `isolation` de lo que la Task 11 pone sobre la llamada.

**Tests (write first):** ninguno de `tests/`: es una medición del motor. Su registro es la sección del archivo de evidencia, con las horas de cada lectura y la decisión.

**Acceptance:** `docs/evidence/013-delegate-ladder.md` tiene la sección «Prueba de espera, R20» con a, b, c, d, e y la decisión, antes de que se lance la Task 10. `.aether/spike-wait/` no se sube.

### Task 18: El panel de `/harnesses` sin el decisor

**Aether:**
- Tier: sonnet high — el panel del mod y sus pruebas, que fijan cada línea
- Review: high — el panel y el informe que lee no pueden cambiar de cifras (R18)
- Area: panel
- Owns: `plugins/aether/hooks/panel-view.mjs`, `plugins/aether/hooks/panel-layout.mjs`, `plugins/aether/hooks/panel.test.tsx`, `tests/panel-view.test.js`, `tests/panel-layout.test.js`, `tests/panel-conformance.test.js`, `tests/fixtures/panel/delegates.json`, `tests/fixtures/panel/delegates-empty.json`
- Depends on: Task 6 — compara con `delegateSettingsFrom`
- Serves: R9, R10, R18, R22

**Interfaces:**

- `hooks/panel-view.mjs` `settingsOf(options)` devuelve `{ lanes: boolean, harnesses: string[] }`: sin `router` ni `decider`, y se quitan `ROUTER_MODES` y `ROUTER_DECIDERS`. La superdelegación y los harness se leen como hoy (el mod no importa `lib/`; el comentario que lo explica nombra `delegateSettingsFrom`). Los valores guardados en `router` o `decider` se ignoran.
- `hooks/panel-layout.mjs` `optionsLines`: la línea de opciones es `superdelegation ON · harnesses agy, grok`, sin `router ...` ni `decider ...`.
- `hooks/panel.test.tsx`: las tres comprobaciones que esperan `router command`, `router record` o `decider jev` esperan la línea nueva; la prueba «the options shown are the ones the session uses» pasa solo `superdelegation` y `harnesses`. La parte `delegates` del panel no cambia: lee las filas que la Task 8 imprime (`id`, `time`, `session`, `description`, `applied`, `ranOn`, `fallback`).
- `tests/fixtures/panel/delegates.json`, `delegates-empty.json` (y la constante `DELEGATES` de `panel.test.tsx`): filas con la forma nueva de la Task 8, sin `mode`, `decider`, `decision`, `agentId` ni `costUsd`.
- `tests/panel-conformance.test.js`: se quitan las pruebas del manifiesto, del router y del decisor; las del interruptor y de los harness comparan `settingsOf` con `session.delegateSettingsFrom` (`lanes`, `harnesses`).

**Tests (write first):** los cambios de `tests/panel-view.test.js`, `tests/panel-layout.test.js`, `tests/panel-conformance.test.js` y `hooks/panel.test.tsx`; de `tests/panel-view.test.js`:

```js
test('the panel settings are the switch and the harnesses, and a saved router or decider changes nothing (E12)', () => {
  assert.deepEqual(view.settingsOf({}), { lanes: false, harnesses: ['agy'] })
  assert.deepEqual(view.settingsOf({ superdelegation: true, harnesses: 'agy,grok' }), { lanes: true, harnesses: ['agy', 'grok'] })
  assert.deepEqual(view.settingsOf({ superdelegation: true, router: 'command', decider: 'jev', harnesses: 'gork' }), { lanes: true, harnesses: ['agy'] })
})
```

**Acceptance:** `node --test tests/panel-view.test.js tests/panel-layout.test.js tests/panel-conformance.test.js` y `npm run test:mod` pasan. `hooks/panel-view.mjs` y `hooks/panel-layout.mjs` ya no nombran `router` ni `decider`.

### Task 19: El manifiesto y la tabla de opciones sin el decisor

**Aether:**
- Tier: sonnet high — un manifiesto y una tabla que `docs-facts` compara
- Review: high — la compatibilidad con valores ya guardados
- Area: options
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `docs/getting-started.md`, `tests/manifest.test.js`, `tests/quota-brake-docs.test.js`
- Depends on: Task 18 — el panel y la prueba de conformidad ya no leen del manifiesto esas opciones
- Serves: R9, R10, R22

**Interfaces:**

- `plugin.json`: se quitan las opciones `router`, `decider` y `fallback`; `deadlines` queda con título «Delegate time limits», descripción que habla solo de la espera de cuota (`quota=3`, un valor de más de 10 cuenta 10) y por defecto `quota=3`. Un valor que un usuario ya guardó en las tres opciones no da error: nada lo lee.
- `docs/guide/options.md`: la tabla y la lista de opciones coinciden con el manifiesto (sin las tres opciones; `deadlines` con su nuevo texto y valor por defecto `quota=3`) y se quitan las frases sobre `router` y `decider` como selectores. `docs/getting-started.md` y `tests/quota-brake-docs.test.js` cuentan seis opciones: `superdelegation`, `harnesses`, `ops`, `deadlines`, `quotabrake` y `brakepush`, con las dos claves viejas.

**Tests (write first):** un caso nuevo en `tests/manifest.test.js` y el recuento de `tests/quota-brake-docs.test.js`

```js
test('the manifest no longer declares router, decider or fallback, and deadlines is the quota deadline alone (C7)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  for (const key of ['router', 'decider', 'fallback']) assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
  assert.equal(manifest.userConfig.deadlines.default, 'quota=3')
})
```

**Acceptance:** `node --test tests/manifest.test.js tests/quota-brake-docs.test.js tests/docs-facts.test.js` y `npm test` pasan, con la tabla de `docs/guide/options.md` igual al `userConfig` (la prueba R11 de `tests/docs-facts.test.js` sigue verde sin tocarla).

### Task 20: Los recuentos y los resúmenes de la documentación

**Aether:**
- Tier: sonnet — prosa y recuentos que el árbol y `docs-facts` sujetan
- Review: high — los conteos que las pruebas leen
- Area: docs-counts
- Owns: `docs/reference/components.md`, `docs/getting-started.md`, `README.md`, `CLAUDE.md`, `tests/harness-lists.test.js`, `tests/components-docs.test.js`
- Depends on: Task 13 — los recuentos de componentes y de la huella dormida son los del árbol final
- Depends on: Task 14 — enlazan `guide/delegates.md`
- Depends on: Task 19 — `docs/getting-started.md` ya cuenta seis opciones
- Serves: R10, R22

**Interfaces:**

- `docs/getting-started.md`, `README.md` y `CLAUDE.md` apuntan a `guide/delegates.md` y dejan de nombrar las tres opciones, `aether-route` y los tres modos; el `CLAUDE.md` describe `aether-delegate`, `lib/ladder.js`, `config/ladder.json` y la bitácora.
- `docs/reference/components.md`: la fila de `aether-route` pasa a `aether-delegate`; los recuentos de comandos, opciones, skills y huella dormida coinciden con el árbol; la fila del mod ya no dice que llama al router.
- `tests/harness-lists.test.js`: las listas que apuntaban a `router.md` apuntan a `delegates.md`.

**Tests (write first):** `tests/components-docs.test.js` (nuevo) y los cambios de `tests/harness-lists.test.js`

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the components page names aether-delegate and no aether-route (R10)', () => {
  const components = read('docs', 'reference', 'components.md')
  assert.ok(components.includes('`aether-delegate`'))
  assert.equal(components.includes('`aether-route`'), false)
})

test('the README and the CLAUDE.md name no aether-route and point to the delegates guide (R10)', () => {
  for (const file of ['README.md', 'CLAUDE.md']) assert.equal(read(file).includes('aether-route'), false, file)
  assert.ok(read('CLAUDE.md').includes('aether-delegate'))
})
```

**Acceptance:** `node --test tests/docs-facts.test.js tests/components-docs.test.js tests/harness-lists.test.js tests/quota-brake-docs.test.js` pasa y `npm test` sigue entero. Los recuentos pasan `tests/docs-facts.test.js` sin una excepción nueva.

### Task 21: Los pasos del Lead al terminar (R21, R23)

**Aether:**
- Tier: opus high — lo hace el Lead a mano, no el enjambre: fundir, gastar cuota de otros planes y cerrar issues son acciones sin vuelta atrás que piden permiso registrado
- Review: xhigh — cada paso es irreversible o toca a otras sesiones
- Area: lead
- Owns: `docs/evidence/013-delegate-ladder.md`
- Depends on: Task 15 — todo lo del enjambre está fundido y `npm run check` pasa
- Depends on: Task 17 — la prueba de espera ya dejó su sección en el archivo de evidencia
- Depends on: Task 20 — la documentación está al día
- Serves: R21, R23

**Interfaces:**

Pasos del Lead (ver Global Constraints), en este orden. Cada acción irreversible se registra con `aether-autonomy` con las palabras del dueño en su propia llamada, y se corre en la siguiente.

1. R21, el solapamiento con `fix/quick-issues`: si esa rama ya entró en `main`, `git merge main` dentro de `feat/delegate-ladder`, se resuelven los conflictos (`docs/decisions.md`, `docs/reference/components.md`, `bin/aether-session-start`, los agentes `examiner` y `reviewer`, las skills) y se vuelve a pasar `npm run check`. Si no, el brief final nombra el conflicto esperado. La corrida no toca esa rama, no sube ni se funde en `main`.
2. R21 y C13: se compara lo anotado al empezar y al terminar en el archivo de evidencia: `git status` del checkout principal y de cada worktree de otra sesión sin cambios, el plugin instalado en 0.18.0, y todo el trabajo en `feat/delegate-ladder` (`git log main..feat/delegate-ladder`). No se lee ni se escribe el estado de otra sesión.
3. R23, la sesión real de C12 (`paid-call`): con un permiso registrado, `scripts/aether-lead --plugin-dir <worktree>/plugins/aether` en un repositorio desechable con `superdelegation=true` y `harnesses=grok`; se pide una tarea con `AETHER-TASK:`, `AETHER-OWNS:` y `AETHER-TESTS:` y se comprueba que `aether-lane delegate`, por la llamada `Agent`, corre mientras la barra de agentes lo muestra. Sin permiso, el comando exacto queda en la lista del dueño.
4. R23, la evidencia (captura o transcripción) o la nota de pendiente con el comando exacto, en una sección de `docs/evidence/013-delegate-ladder.md` que se confirma en la rama.
5. R23, los issues: `gh issue close 51` y `gh issue close 74`, con un comentario que cita la evidencia, con el permiso registrado (`credentials`) con las palabras del dueño (cita 10 de la spec). El 74 espera además la evidencia de la sesión real: si queda pendiente en la lista del dueño, se cierra cuando llegue.

**Tests (write first):** ninguno de `tests/`: son acciones del Lead sobre el repositorio y `gh`. Su registro es el archivo de evidencia y el brief final.

**Acceptance:** `docs/evidence/013-delegate-ladder.md` tiene, por R21 y C13, el antes y el después de los worktrees ajenos y del plugin instalado, y, por R23, la evidencia de C12 o su pendiente con el comando exacto. Los issues 74 y 51 están cerrados con la cita, o quedan en la lista del dueño con la razón. `npm run check` pasa.
