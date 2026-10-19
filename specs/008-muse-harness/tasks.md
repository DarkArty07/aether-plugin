# Muse Code como harness de Aether (0.13.0): tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual (`feat/muse-harness`). Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice. El plan es [plan.md](plan.md); lo medido, [evidence/](evidence/README.md).
- **Idioma.** El código, los comentarios, los mensajes y los documentos del repositorio van en inglés; este archivo y el plan, en español. Un texto que un test fija (razón de un fallo, línea de órdenes, frase) va exactamente como la tarea lo escribe. La web va en español y en inglés, como ya está.
- **Estilo.** Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma ni dependencias de npm; los `.mjs` son ESM. Se copia el estilo de `lib/harness/cursor.js`, `codex.js` y `structured.js` (comentario de cabecera, funciones pequeñas, `module.exports` al final).
- **Primero los tests.** Cada tarea escribe sus tests (rojo), implementa y deja `npm test` verde completo antes de reportar. Los tests existentes que una tarea cambia son los que dice; ninguna otra aserción existente cambia. Una tarea posee las pruebas que su propio cambio rompe.
- **Sin llamadas reales.** Nadie corre `muse`, `agy`, `codex`, `grok` ni `cursor` de verdad, ni lee `~/.config/muse`, ni usa `META_API_KEY`. Los tests usan `tests/fixtures/fake-muse.js` o un `exec` inyectado. La llamada real es del Lead (plan D13) y no es una tarea.
- **La forma supuesta.** Todo nombre de campo de la salida de `muse exec --json` que [evidence/README.md](evidence/README.md) §7 dice que no se midió (`allowance`, el objeto del fallo de `run.terminal.failed`) lleva el comentario `// Assumed from the MSP schema, not yet seen in a real call (spec R27).` junto al código que lo lee.
- **Seguridad de la llamada (R9, R10, R12).** Ningún código del plugin pasa `--yolo`, `--disable-sandbox`, `--trust-workspace`, `--api-key-stdin` ni `--contributor-mode on`; ninguno lanza `muse login` ni abre archivos de credenciales de Muse. Un modelo `-contributor` no entra en la tabla ni se llama.
- **El orden de los harness** es `agy, codex, grok, cursor, muse` en toda lista fija que los nombre. Las palabras «other harness» / «otro harness» en genérico no se tocan.
- **Lo que no se toca.** El comportamiento de agy, codex, grok y cursor; el router de delegados (`router-*.js`, `delegate-calls.js`, `aether-route`); los asientos de diseño (`seats.js`, `designSeats`); `lane-order.js`, `lane-marks.js`, `lane-readings.js` y `lane-quota.js` (la tarea 8 los toca solo si una de sus pruebas muestra un fallo de Muse que no tiene otra salida).
- **Nadie escribe bajo `specs/` ni `.specify/`** (aether-guard lo rechaza a los implementadores). Tampoco se publica: ni merge a `main`, ni push, ni tag, ni `claude plugin update`; la versión solo la sube la tarea 10.
- **Vínculo con los requisitos.** Cada tarea lleva `- Serves: R<n>, ...` en su bloque Aether. `[USn]` en la lista es el escenario `n` de la spec. R26 a R28, R31 y R32 no son de ninguna tarea: son del Lead y del plan (plan D13, Proposals).
- **Formas compartidas entre tareas** (las fija la tarea que las produce; las demás las importan):
  - **Adaptador.** `createMuse({ command = 'muse', groups = {}, exec = defaultExec, env = process.env, dataDir = null, now = Date.now })` en `plugins/aether/lib/harness/muse.js`; `dataDir` nulo significa `require('../run.js').dataDir()` al usarlo.
  - **Observación de cuota.** Archivo `<dataDir>/lanes/quota/muse-observed.json` con exactamente las claves `observedAt` (ms), `window` y `weekly` (cada una `{ usedPercent, resetsAtMs }` o `null`) y `exhaustedUntilMs` (ms o `null`).
  - **Lectura de cuota.** `{ groups: { <clave>: { windows: { '5h': { remaining, resetsAt }, weekly: { remaining, resetsAt } }, source: { command: 'muse exec --json', ts, ageMinutes } } } }`; sin lectura, `{ unknown: true, windows: {} }`; con un límite agotado, una sola ventana `limit` con `remaining: 0`.
  - **Razones.** `quota: muse <limitKind>, resets <ISO>` (solo con el dato `quota` del fallo), `muse <kind>: <message>`, `muse failed: <texto>`, `muse cancelled`, `exit <n>[: <línea de stderr>]`, `exit unknown`, `unreadable output`, `no result`, `no structured output`, `missing <campo>`.
  - **La `muse` simulada.** `tests/fixtures/fake-muse.js`, ejecutable, que la tarea 1 escribe y la tarea 8 usa (contrato en la tarea 1).
  - **Línea de órdenes de Muse** (la fija la tarea 1): `muse exec --json --provider meta --model <model> [--reasoning-effort <level>] [--output-schema <file>] --contributor-mode off --no-foreign-personal-context --disable-approval --disable-reminders --disable-request-user-input --max-model-steps 200 <prompt>`.
- **La frase de alcance, idéntica donde un archivo la lleve:** `Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for.`

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [US2] El adaptador `createMuse`: línea de órdenes, `installed`, `version`, `modelArg`, `usageDelta` in plugins/aether/lib/harness/muse.js → Task 1
- [ ] T002 [P] [US3] [US4] [US5] [US8] [US9] [US10] El `parse` de los registros JSONL: limpia solo con turno completo, razón por clase de fallo, salida estructurada y uso in plugins/aether/lib/harness/muse.js → Task 1
- [ ] T003 [P] [US6] [US7] La observación de cuota y `quota()` in plugins/aether/lib/harness/muse.js → Task 1
- [ ] T004 [P] [US11] La privacidad y la seguridad de la línea de órdenes, fijadas por prueba in tests/harness-muse.test.js → Task 1
- [ ] T005 [P] [US2] La `muse` simulada y la captura real del proveedor `echo` in tests/fixtures/fake-muse.js → Task 1
- [ ] T006 [P] [US12] La regla de los modelos de Muse sobre la tabla: listado de la CLI, generación más nueva, perfil, medición, sin `-contributor` in tests/lane-models.test.js → Task 2
- [ ] T007 [P] [US12] El nombre `muse` en el script del índice de modelos in scripts/build-models-index.js → Task 2
- [ ] T008 [P] [US13] Perfiles de los tres modelos de Muse in plugins/aether/config/models/profiles.json → Task 3
- [ ] T009 [P] [US2] Precios por token de `muse-spark-1.3` y `muse-wonder-1.0`, y el modelo sin precio in plugins/aether/config/prices.json → Task 3
- [ ] T010 [P] [US13] Muse en la documentación in docs/guide/lanes.md → Task 4
- [ ] T011 [P] [US13] Muse en la web, en español y en inglés in site/index.html → Task 5
- [ ] T012 [US1] `muse` en el registro de harnesses in plugins/aether/lib/harness/index.js → Task 6
- [ ] T013 [US13] Muse en el panel `/harnesses` in plugins/aether/hooks/panel-view.mjs → Task 6
- [ ] T014 [US1] [US2] La entrada `muse` de la tabla de lanes, la descripción de `harnesses` y la página de opciones in plugins/aether/config/lanes.json → Task 7
- [ ] T015 [US2] [US3] [US4] [US5] [US6] [US7] [US8] [US9] [US10] [US11] Las formas de falla y la cuota de punta a punta con el runner real in tests/muse-lane.test.js → Task 8
- [ ] T016 [US13] La prueba que falla si una lista fija de harnesses no nombra a Muse in tests/harness-lists.test.js → Task 9
- [ ] T017 [P] [US13] Muse en los skills `using-aether` y `swarm` in plugins/aether/skills/using-aether/SKILL.md → Task 11
- [ ] T018 [US15] La versión 0.13.0, el changelog, el handoff y la decisión in plugins/aether/.claude-plugin/plugin.json → Task 10

### Task 1: El adaptador de Muse y su `muse` simulada

**Aether:**
- Tier: sonnet — formas de salida que las pruebas fijan con una forma supuesta, parseo tolerante y banderas de seguridad
- Review: xhigh — entrada malformada que las pruebas no listan, y la privacidad y el sandbox de la línea de órdenes
- Area: harness
- Owns: `plugins/aether/lib/harness/muse.js`, `tests/harness-muse.test.js`, `tests/fixtures/fake-muse.js`, `tests/fixtures/muse/**`
- Depends on: none
- Serves: R2, R3, R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R16, R24

**Interfaces:**

```js
// plugins/aether/lib/harness/muse.js
function createMuse({ command = 'muse', groups = {}, exec = defaultExec, env = process.env, dataDir = null, now = Date.now } = {}) -> adapter
// adapter:
//   name: 'muse'                         (no schemaInPrompt, no quotaCost)
//   installed(): boolean                 commandInstalled(command, env)
//   version(): string|null               first x.y.z of `<command> --version` ("Muse Code 1.4.11 (1.4.11-R6667.1)" -> "1.4.11"); null on a non-zero exit, a throw or no match
//   quota(): { groups }                  never throws; reads <dataDir>/lanes/quota/muse-observed.json (shapes in Global Constraints)
//   modelArg({ model, level }): string   the bare model id
//   argv({ model, level, schemaFile, timeoutSeconds, prompt }): string[]   throws on a model matching /contributor/ or an empty model
//   parse({ stdout, stderr, exitCode }, { required = [] } = {}): { clean, reason, structured, usage, conversation: null }
//   usageDelta(previous, current): current
module.exports = { createMuse }
```

- `argv`: `[command, 'exec', '--json', '--provider', 'meta', '--model', model, ...(level ? ['--reasoning-effort', level] : []), ...(schemaFile ? ['--output-schema', schemaFile] : []), '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders', '--disable-request-user-input', '--max-model-steps', '200', prompt]`. Nunca otra bandera.
- `parse` sigue las reglas de plan D3: el último registro con `payload_type` que empieza por `run.terminal.` decide el turno (`completed` o no); `run.usage` da el uso; la razón de un fallo sale por la primera regla que se cumple, en este orden: dato `quota` del fallo (`reason.quota` o `error.quota`), turno no completo, salida distinta de 0, sin registro terminal, texto vacío, sin objeto, falta un campo. El objeto del fallo vive en `payload.reason` o en `payload.error`, como objeto, como cadena JSON o como cadena suelta. `usage` es `{ input, output, thinking, cacheRead, total, models: [{ model, calls, input, output, thinking, cacheRead }], allowance }` (`total` = entrada + salida; sin registro `run.usage`, ceros, `models: []` y `allowance: null`). Cada `parse` guarda la observación (aun si el turno falló); un fallo de escritura nunca lanza.
- `tests/fixtures/fake-muse.js` (ejecutable, `#!/usr/bin/env node`, sin dependencias): con `--version` imprime `Muse Code 1.4.11 (1.4.11-R6667.1)` y sale 0. Con `exec`, lee el guion JSON de `AETHER_FAKE_MUSE_SCRIPT` (`{ stdout?, stderr?, exit?, files?: { <ruta relativa al cwd>: <texto> }, sleepMs?, child?: boolean }`); añade a `AETHER_FAKE_MUSE_LOG` una línea JSON `{ argv, cwd, metaApiKey: Boolean(process.env.META_API_KEY), home: process.env.HOME }`; escribe `files`; si `child`, lanza un hijo desprendido (`node -e "setInterval(()=>{},1000)"`) y escribe su pid en `AETHER_FAKE_MUSE_CHILD_PID`; espera `sleepMs`; imprime `stdout` y `stderr`; sale con `exit` (0 por defecto). Con otra cosa sale 2 con `unknown command` en stderr.
- `tests/fixtures/muse/exec-json-echo.jsonl`: copia exacta de `specs/008-muse-harness/evidence/exec-json-echo.jsonl` (la salida medida del proveedor `echo`).

**Tests (write first):** `tests/harness-muse.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const { createMuse } = require('../plugins/aether/lib/harness/muse.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-muse.js')
const GROUPS = { muse: 'Muse subscription' }
const SCHEMA = '/r/schema.json'
const NOW = Date.UTC(2026, 9, 19, 18, 0, 0)
const HOUR = 3600000
const REQUIRED = ['verdict', 'summary']
const ANSWER = '{"verdict":"approve","summary":"done"}'
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)

let n = 0
const rec = (type, payload, stream = 'session') =>
  JSON.stringify({ schema_version: 1, id: `id-${++n}`, stream: { kind: stream, id: 's1' }, sequence: n, recorded_at: n, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
const completed = (text) => rec('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text })
const failed = (reason, terminal = 'failed') => rec(`run.terminal.${terminal}`, { kind: 'run_terminal', terminal, reason, text: null })
const usage = (allowance = null, models = [{ model: 'muse-spark-1.3', calls: 1, input_tokens: 1000, output_tokens: 200, cached_tokens: 300, reasoning_tokens: 50 }]) =>
  rec('run.usage', { kind: 'run_usage', allowance, calls: 1, completed_calls: 1, failed_calls: 0, cancelled_calls: 0, children_included: false, models }, 'exec.usage')
const out = (...lines) => `${lines.join('\n')}\n`
const allowance = (used5, usedWeek) => ({ tier: 'power', window: { usedPercent: used5, resetsAtMs: NOW + 3 * HOUR, windowDurationMins: 300 }, weekly: { usedPercent: usedWeek, resetsAtMs: NOW + 5 * 24 * HOUR } })

function build(t, extra = {}) {
  const dataDir = tempDir(t, 'muse-data-')
  return { dataDir, muse: createMuse({ groups: GROUPS, dataDir, now: () => NOW, ...extra }) }
}
const run = (muse, stdout, exitCode = 0, stderr = '') => muse.parse({ stdout, stderr, exitCode }, { required: REQUIRED })
const observedFile = (dataDir) => path.join(dataDir, 'lanes', 'quota', 'muse-observed.json')

test('muse is the adapter named muse, takes the schema as a flag and reads no quota by itself', (t) => {
  const { muse } = build(t)
  assert.equal(muse.name, 'muse')
  assert.notEqual(muse.schemaInPrompt, true)
  assert.equal(muse.quotaCost, undefined)
  assert.equal(muse.modelArg({ model: 'muse-spark-1.3', level: 'high' }), 'muse-spark-1.3')
  assert.equal(muse.usageDelta({ input: 5 }, { input: 9 }).input, 9)
})

test('argv is one headless, sandboxed, privacy-safe exec turn, and nothing else', (t) => {
  const { muse } = build(t, { command: '/opt/muse' })
  assert.deepEqual(muse.argv({ model: 'muse-spark-1.3', level: 'high', schemaFile: SCHEMA, timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/muse', 'exec', '--json', '--provider', 'meta', '--model', 'muse-spark-1.3', '--reasoning-effort', 'high', '--output-schema', SCHEMA,
    '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders', '--disable-request-user-input',
    '--max-model-steps', '200', 'P',
  ])
  const bare = createMuse({ groups: GROUPS }).argv({ model: 'muse-wonder-1.0', prompt: 'P' })
  assert.equal(bare[0], 'muse')
  assert.equal(bare.includes('--reasoning-effort'), false)
  assert.equal(bare.includes('--output-schema'), false)
  assert.equal(bare.at(-1), 'P')
})

test('argv never turns the sandbox, the approval of the workspace or the contributor mode the wrong way, and never logs in', (t) => {
  const { muse } = build(t)
  const argv = muse.argv({ model: 'muse-wonder-1.0', level: 'low', schemaFile: SCHEMA, prompt: 'P' })
  for (const flag of ['--yolo', '--disable-sandbox', '--trust-workspace', '--api-key-stdin', '--prompt-file', '--workspace', '--base-url', '--disable-write', '--disable-shell']) {
    assert.equal(argv.includes(flag), false, flag)
  }
  assert.equal(argv[argv.indexOf('--contributor-mode') + 1], 'off')
  assert.equal(argv.filter((item) => /^(login|logout|auth)$/.test(item)).length, 0)
})

test('a contributor model or an empty model has no command line', (t) => {
  const { muse } = build(t)
  assert.throws(() => muse.argv({ model: 'muse-spark-1.3-contributor', prompt: 'P' }), /contributor/)
  assert.throws(() => muse.argv({ model: '', prompt: 'P' }), /model/)
})

test('installed and version come from the command, and a version that cannot be read is null', (t) => {
  fs.chmodSync(FAKE, 0o755)
  assert.equal(createMuse({ command: FAKE }).installed(), true)
  assert.equal(createMuse({ command: path.join(tempDir(t), 'muse') }).installed(), false)
  const answer = (value) => () => value
  assert.equal(createMuse({ exec: answer({ status: 0, stdout: 'Muse Code 1.4.11 (1.4.11-R6667.1)\n', stderr: '' }) }).version(), '1.4.11')
  assert.equal(createMuse({ exec: answer({ status: 1, stdout: '', stderr: 'x' }) }).version(), null)
  assert.equal(createMuse({ exec: answer({ status: 0, stdout: 'no number here', stderr: '' }) }).version(), null)
  assert.equal(createMuse({ exec: () => { throw new Error('ENOENT') } }).version(), null)
})

test('the fake muse answers --version', () => {
  fs.chmodSync(FAKE, 0o755)
  const r = spawnSync(FAKE, ['--version'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'Muse Code 1.4.11 (1.4.11-R6667.1)')
})

test('a completed turn with the object and every required field is clean, with its usage', (t) => {
  const { muse } = build(t)
  const clean = run(muse, out(rec('run.output.delta', { text: 'x' }), completed(ANSWER), usage()))
  assert.deepEqual([clean.clean, clean.reason, clean.structured, clean.conversation], [true, null, { verdict: 'approve', summary: 'done' }, null])
  assert.deepEqual(clean.usage, {
    input: 1000, output: 200, thinking: 50, cacheRead: 300, total: 1200,
    models: [{ model: 'muse-spark-1.3', calls: 1, input: 1000, output: 200, thinking: 50, cacheRead: 300 }],
    allowance: null,
  })
  const prose = run(muse, out(completed(`Done.\n\`\`\`json\n${ANSWER}\n\`\`\``), usage()))
  assert.equal(prose.clean, true)
})

test('the usage of several models is summed, and a run with no usage record is zeros', (t) => {
  const { muse } = build(t)
  const models = [
    { model: 'a', calls: 1, input_tokens: 10, output_tokens: 1, cached_tokens: 2, reasoning_tokens: 3 },
    { model: 'b', calls: 2, input_tokens: 20, output_tokens: 4, cached_tokens: 0, reasoning_tokens: 0 },
  ]
  const summed = run(muse, out(completed(ANSWER), usage(null, models))).usage
  assert.deepEqual([summed.input, summed.output, summed.thinking, summed.cacheRead, summed.total, summed.models.length], [30, 5, 3, 2, 35, 2])
  assert.deepEqual(run(muse, out(completed(ANSWER))).usage, { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0, models: [], allowance: null })
})

const CASES = [
  ['authRequired', { kind: 'authRequired', message: 'sign in first', retryable: false }, 'muse authRequired: sign in first'],
  ['environmentError', { kind: 'environmentError', message: 'bwrap: no permissions', retryable: false }, 'muse environmentError: bwrap: no permissions'],
  ['stepLimit', { kind: 'stepLimit', message: 'reached 200 steps', retryable: false }, 'muse stepLimit: reached 200 steps'],
  ['a model the account does not give', { kind: 'modelError', message: 'muse-wonder-full-1.0 needs the Power plan', retryable: false }, 'muse modelError: muse-wonder-full-1.0 needs the Power plan'],
  ['a failure object written as a JSON string', JSON.stringify({ kind: 'authRequired', message: 'sign in first' }), 'muse authRequired: sign in first'],
  ['a failure that is a plain string', 'boom', 'muse failed: boom'],
]
for (const [name, reason, expected] of CASES) {
  test(`a failed turn is not clean and says its class: ${name}`, (t) => {
    const { muse } = build(t)
    const result = run(muse, out(failed(reason), usage()), 1, 'warning: x')
    assert.deepEqual([result.clean, result.reason, result.structured], [false, expected, null])
    assert.equal(result.reason.startsWith('quota: '), false, 'only the quota data of a failure makes a quota reason')
    assert.equal(result.usage.input, 1000, 'the usage is kept')
  })
}

test('a cancelled turn is not clean', (t) => {
  const { muse } = build(t)
  const result = run(muse, out(failed(null, 'cancelled')), 130)
  assert.deepEqual([result.clean, result.reason], [false, 'muse cancelled'])
})

test('a failure is a quota failure only by its quota data, never by the words of its message', (t) => {
  const { muse } = build(t)
  const resets = NOW + 4 * HOUR
  const quota = { kind: 'modelError', message: 'limit reached', retryable: false, quota: { limitKind: 'tierLimit', resetsAtMs: resets } }
  const expected = `quota: muse tierLimit, resets ${new Date(resets).toISOString()}`
  assert.equal(run(muse, out(failed(quota)), 1).reason, expected)
  assert.equal(run(muse, out(failed(JSON.stringify(quota))), 1).reason, expected)
  const words = run(muse, out(failed({ kind: 'modelError', message: 'your quota of file handles is low and the rate limit is 429', retryable: false })), 1)
  assert.equal(words.reason.startsWith('quota: '), false)
  assert.match(words.reason, /^muse modelError: /)
})

test('a run with no record or a bad exit says so', (t) => {
  const { muse } = build(t)
  assert.equal(run(muse, out(completed(ANSWER)), 1).reason, 'exit 1')
  assert.equal(run(muse, '', 2, 'error: bad flag\nmore').reason, 'exit 2: error: bad flag')
  assert.equal(run(muse, '', null).reason, 'exit unknown')
  assert.equal(run(muse, 'hello, not records\n', 0).reason, 'unreadable output')
  assert.equal(run(muse, out(completed('   ')), 0).reason, 'no result')
  assert.equal(run(muse, out(completed('I am done.')), 0).reason, 'no structured output')
  assert.equal(run(muse, out(completed('{"verdict":"approve"}')), 0).reason, 'missing summary')
})

test('the real capture of the echo provider reads: a completed turn whose text is not an object', (t) => {
  const { muse } = build(t)
  const capture = fs.readFileSync(path.join(__dirname, 'fixtures', 'muse', 'exec-json-echo.jsonl'), 'utf8')
  const result = muse.parse({ stdout: capture, stderr: '', exitCode: 0 }, { required: [] })
  assert.deepEqual([result.clean, result.reason], [false, 'no structured output'])
  assert.deepEqual([result.usage.input, result.usage.total, result.usage.allowance], [0, 0, null])
})

test('quota is unknown until a call has brought an allowance, and never throws', (t) => {
  const { dataDir, muse } = build(t)
  assert.deepEqual(muse.quota(), { groups: { muse: { unknown: true, windows: {} } } })
  fs.mkdirSync(path.dirname(observedFile(dataDir)), { recursive: true })
  fs.writeFileSync(observedFile(dataDir), '{not json')
  assert.deepEqual(muse.quota(), { groups: { muse: { unknown: true, windows: {} } } })
  run(muse, out(completed(ANSWER), usage('not an allowance')))
  assert.equal(muse.quota().groups.muse.unknown, true)
  run(muse, out(completed(ANSWER), usage({ window: { usedPercent: 'a', resetsAtMs: 'b' } })))
  assert.equal(muse.quota().groups.muse.unknown, true)
})

test('72 % used in the 5 h window and 40 % in the weekly one read as 28 % and 60 % left, with their resets', (t) => {
  const { dataDir, muse } = build(t)
  run(muse, out(completed(ANSWER), usage(allowance(72, 40))))
  const reading = muse.quota().groups.muse
  near(reading.windows['5h'].remaining, 0.28)
  near(reading.windows.weekly.remaining, 0.6)
  assert.equal(reading.windows['5h'].resetsAt, new Date(NOW + 3 * HOUR).toISOString())
  assert.equal(reading.windows.weekly.resetsAt, new Date(NOW + 5 * 24 * HOUR).toISOString())
  assert.deepEqual([reading.source.command, reading.source.ageMinutes], ['muse exec --json', 0])
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(observedFile(dataDir), 'utf8'))).sort(), ['exhaustedUntilMs', 'observedAt', 'weekly', 'window'])
  // The reading ages with the clock.
  const later = createMuse({ groups: GROUPS, dataDir, now: () => NOW + 7 * 60000 })
  assert.equal(later.quota().groups.muse.source.ageMinutes, 7)
})

test('an allowance in snake_case reads the same, over 100 % is nothing left, and a window whose reset has passed is dropped', (t) => {
  const { dataDir, muse } = build(t)
  run(muse, out(completed(ANSWER), usage({ window: { used_percent: 150, resets_at_ms: NOW + HOUR }, weekly: { used_percent: 10, resets_at_ms: NOW + 24 * HOUR } })))
  const reading = muse.quota().groups.muse
  assert.equal(reading.windows['5h'].remaining, 0)
  near(reading.windows.weekly.remaining, 0.9)
  const afterFive = createMuse({ groups: GROUPS, dataDir, now: () => NOW + 2 * HOUR })
  assert.deepEqual(Object.keys(afterFive.quota().groups.muse.windows), ['weekly'])
  const afterAll = createMuse({ groups: GROUPS, dataDir, now: () => NOW + 25 * HOUR })
  assert.deepEqual(afterAll.quota(), { groups: { muse: { unknown: true, windows: {} } } })
})

test('a quota failure reads as a limit with nothing left until its reset, and a later healthy allowance replaces it', (t) => {
  const { dataDir, muse } = build(t)
  const resets = NOW + 4 * HOUR
  run(muse, out(failed({ kind: 'modelError', message: 'limit', retryable: false, quota: { limitKind: 'tierLimit', resetsAtMs: resets } })), 1)
  const reading = muse.quota().groups.muse
  assert.deepEqual(Object.keys(reading.windows), ['limit'])
  assert.deepEqual([reading.windows.limit.remaining, reading.windows.limit.resetsAt], [0, new Date(resets).toISOString()])
  const after = createMuse({ groups: GROUPS, dataDir, now: () => resets + 1 })
  assert.deepEqual(after.quota(), { groups: { muse: { unknown: true, windows: {} } } })
  run(muse, out(completed(ANSWER), usage(allowance(10, 10))))
  assert.deepEqual(Object.keys(muse.quota().groups.muse.windows), ['5h', 'weekly'])
})

test('an environmentError or an authRequired failure leaves no exhausted reading', (t) => {
  const { muse } = build(t)
  run(muse, out(failed({ kind: 'environmentError', message: 'bwrap failed', retryable: false })), 1)
  run(muse, out(failed({ kind: 'authRequired', message: 'sign in', retryable: false })), 1)
  assert.equal(muse.quota().groups.muse.unknown, true)
})
```

**Acceptance:**
- `npm test` está verde; `tests/harness-muse.test.js` pasa entero y `plugins/aether/lib/harness/muse.js` no abre ningún archivo fuera de `dataDir` ni nombra `META_API_KEY`, `login` ni `~/.config/muse`.
- `tests/fixtures/fake-muse.js` es ejecutable y cumple el contrato de arriba (la tarea 8 lo usa sin cambiarlo).
- `lib/harness/index.js` no se toca (lo hace la tarea 6): la prueba importa `muse.js` directamente.

### Task 2: Los modelos de Muse entran por las tres reglas

**Aether:**
- Tier: sonnet high — una prueba nueva con lógica de línea de modelos y un cambio de dos constantes en el script, fijados por las pruebas
- Area: models
- Owns: `tests/lane-models.test.js`, `scripts/build-models-index.js`, `tests/models-index.test.js`
- Depends on: none
- Serves: R22, R23, R24

**Interfaces:**

```js
// scripts/build-models-index.js
const HARNESSES = ['claude', 'agy', 'codex', 'grok', 'cursor', 'muse']   // muse added last
const CAPTURE = { …, muse: 'with the model/list method of `muse serve` (no model call; the ids it lists, newest first)' }
// DEFAULT_HARNESSES stays ['claude', 'agy', 'grok'] (plan D8: muse enters it once its listing is captured).
```

```js
// tests/lane-models.test.js: helpers it defines for itself (no change to the script)
// lineOf(id): the model id without its version number, e.g. 'muse-spark-1.3' -> 'muse-spark', 'muse-wonder-full-1.0' -> 'muse-wonder-full'
// versionOf(id): the version as an array of integers, e.g. 'muse-spark-1.3' -> [1, 3]
// checkMuseModels({ lanes, listings, profiles }) -> string[]   one message per breach; [] when none
```

**Tests (write first):** `tests/lane-models.test.js`, completo. Las pruebas del archivo existente `tests/models-index.test.js` cambian solo en lo que nombra la lista de harnesses del script (añadir `muse` donde el test compara `HARNESSES`/`CAPTURE`) y un caso nuevo: `main` con `--harnesses claude,muse` y un listado sin `muse` imprime `no listing captured for muse: capture it with the model/list method of \`muse serve\` (no model call; the ids it lists, newest first) and add it to harness-models.json`.

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const NOT_CODE = /(^|-)(image|voice|transcribe|sam)(-|$)/

const idOf = (listed) => (typeof listed === 'string' ? listed : listed.id)
const versionOf = (id) => (/-(\d+(?:\.\d+)*)$/.exec(id)?.[1] ?? '0').split('.').map(Number)
const lineOf = (id) => id.replace(/-\d+(?:\.\d+)*$/, '')
const newer = (a, b) => {
  const x = versionOf(a)
  const y = versionOf(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

// One message for each way a Muse model of the lane table breaks the three rules, the contributor ban and the measurement.
function checkMuseModels({ lanes, listings, profiles }) {
  const problems = []
  const models = lanes.harnesses?.muse?.models ?? {}
  const listed = (listings.harnesses?.muse?.models ?? []).map(idOf)
  for (const [id, entry] of Object.entries(models)) {
    if (/contributor/.test(id)) problems.push(`${id}: a contributor model never enters the table`)
    if (NOT_CODE.test(id)) problems.push(`${id}: not a coding model`)
    if (!listed.includes(id)) problems.push(`${id}: the Muse CLI does not list it (harness-models.json)`)
    const line = listed.filter((other) => !/contributor/.test(other) && lineOf(other) === lineOf(id))
    if (line.some((other) => newer(other, id))) problems.push(`${id}: not the newest generation of its line`)
    const key = id.replace(/\./g, '-')
    if (!profiles.profiles?.[key] && !profiles.profiles?.[id]) problems.push(`${id}: no profile in profiles.json`)
    if (typeof entry.replaces !== 'string' || !entry.aa || typeof entry.aa.slug !== 'string' || !Number.isFinite(entry.aa.intelligence)) {
      problems.push(`${id}: no Artificial Analysis measurement behind its replaces`)
    }
  }
  return problems
}

test('the committed lane table passes the three rules for every Muse model it lists (none while there is no measurement)', () => {
  const lanes = read('lanes.json')
  const listings = read('models', 'harness-models.json')
  assert.deepEqual(checkMuseModels({ lanes, listings, profiles: read('models', 'profiles.json') }), [])
})

test('the rules fail for a model the CLI does not list, an older generation, a model with no profile or no measurement, and a contributor model', () => {
  const entry = (extra = {}) => ({ group: 'muse', replaces: 'sonnet', roles: ['implementer'], levels: { low: 'low' }, aa: { slug: 's', intelligence: 40 }, ...extra })
  const listings = { harnesses: { muse: { models: [{ id: 'muse-spark-1.3' }, 'muse-spark-1.2', 'muse-spark-1.3-contributor', 'muse-wonder-1.0'] } } }
  const profiles = { profiles: { 'muse-spark-1-3': {}, 'muse-spark-1-2': {} } }
  const check = (models) => checkMuseModels({ lanes: { harnesses: { muse: { models } } }, listings, profiles })
  assert.deepEqual(check({ 'muse-spark-1.3': entry() }), [])
  assert.deepEqual(check({ 'muse-spark-1.2': entry() }), ['muse-spark-1.2: not the newest generation of its line'])
  assert.deepEqual(check({ 'muse-spark-9.9': entry() }), ['muse-spark-9.9: the Muse CLI does not list it (harness-models.json)', 'muse-spark-9.9: no profile in profiles.json'])
  assert.deepEqual(check({ 'muse-wonder-1.0': entry() }), ['muse-wonder-1.0: no profile in profiles.json'])
  assert.deepEqual(check({ 'muse-spark-1.3': entry({ aa: undefined }) }), ['muse-spark-1.3: no Artificial Analysis measurement behind its replaces'])
  assert.ok(check({ 'muse-spark-1.3-contributor': entry() }).some((message) => /contributor model never enters/.test(message)))
  assert.ok(check({ 'muse-image-1': entry() }).some((message) => /not a coding model/.test(message)))
})

test('a line is the id without its version number, and the larger number wins', () => {
  assert.equal(lineOf('muse-spark-1.3'), 'muse-spark')
  assert.equal(lineOf('muse-wonder-full-1.0'), 'muse-wonder-full')
  assert.equal(newer('muse-spark-1.10', 'muse-spark-1.9'), true)
  assert.equal(newer('muse-spark-1.2', 'muse-spark-1.3'), false)
})
```

**Acceptance:**
- `tests/lane-models.test.js` pasa con la tabla actual (que todavía no tiene la entrada `muse`: la añade la tarea 7, que también añade a esta prueba la aserción de que la tabla la tiene) y falla, como las pruebas de arriba lo muestran, con un modelo sin listar, viejo, sin perfil, sin medición o `-contributor`.
- `scripts/build-models-index.js` conoce `muse` en `HARNESSES` y `CAPTURE` y no cambia `DEFAULT_HARNESSES`; `npm test` está verde, con `tests/models-index.test.js` (el committed `models.json` no cambia).

### Task 3: Perfiles y precios de los modelos de Muse

**Aether:**
- Tier: haiku high — datos que las pruebas fijan campo por campo, copiados de la evidencia
- Area: models
- Owns: `plugins/aether/config/models/profiles.json`, `plugins/aether/config/prices.json`, `tests/prices.test.js`, `tests/muse-profiles.test.js`, `tests/muse-prices.test.js`
- Depends on: none
- Serves: R6, R18

**Interfaces:**

- `profiles.json` gana tres claves (la convención del archivo: la clave es la familia con puntos cambiados por guiones, como `grok-4-7`): `muse-spark-1-3`, `muse-wonder-1-0`, `muse-wonder-full-1-0`. Cada perfil tiene los campos de los existentes: `name`, `maker` (`Meta`), `purpose` (cita de Meta), `contextTokens` (1048576), `maxOutputTokens` (`null`), `inputs`, `outputs`, `defaultEffort`, `efforts`, `price`, `knowledgeCutoff` (`null` si Meta no lo dice), `availability`, `caveats`, `sources` (URLs `https://dev.meta.ai/docs/...` de [evidence/README.md](evidence/README.md) §8), `checked` (`2026-10-19`).
  - `muse-spark-1-3`: `purpose` «latest version», «Recommended for new work», para trabajo «high-volume or cost-sensitive»; todos los esfuerzos hasta `max`; `price: { input: 1.25, output: 4.25, note: "per million tokens on the Meta API; cached input 0.15" }`.
  - `muse-wonder-1-0`: preview, esfuerzos `minimal` a `max`, para «complex multi-file changes» y trabajo agéntico largo; sin modo contributor; `price: { input: 4, output: 20, note: "per million tokens on the Meta API; cached input 0.20" }`.
  - `muse-wonder-full-1-0`: no es un modelo de la API, solo en Muse Code con planes Power o Maximum; **`price: null`**.
- `prices.json`: en `models`, dos filas nuevas: `muse-spark-1.3` → `{ ids: ['muse-spark-1.3'], input: 1.25, output: 4.25, cacheRead: 0.15, cacheWrite5m: 1.25, cacheWrite1h: 1.25 }` y `muse-wonder-1.0` → `{ ids: ['muse-wonder-1.0'], input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 4, cacheWrite1h: 4 }` (Meta no publica precio de escritura de caché: se iguala a la entrada y el uso de las lanes no la lleva). En `sources`, dos claves nuevas con las URLs de Meta (`https://dev.meta.ai/docs/pricing-rate-limits`). `muse-wonder-full-1.0` no tiene fila. `basis` pasa a decir que las filas de Muse son precios de lista de Meta.

**Tests (write first):**

`tests/muse-prices.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadPrices, ratesFor, priceEntry } = require('../plugins/aether/lib/prices.js')

const prices = loadPrices()
const MILLION = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0 }

test('the models whose token price Meta publishes have a row, per million tokens', () => {
  assert.deepEqual(prices.models['muse-spark-1.3'], { ids: ['muse-spark-1.3'], input: 1.25, output: 4.25, cacheRead: 0.15, cacheWrite5m: 1.25, cacheWrite1h: 1.25 })
  assert.deepEqual(prices.models['muse-wonder-1.0'], { ids: ['muse-wonder-1.0'], input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 4, cacheWrite1h: 4 })
  assert.ok(prices.sources['muse-spark-1.3'].startsWith('https://dev.meta.ai/') && prices.sources['muse-wonder-1.0'].startsWith('https://dev.meta.ai/'))
})

test('a lane call of a priced Muse model costs its tokens, and the subscription-only model has no price', () => {
  assert.equal(ratesFor(prices, 'muse-spark-1.3').family, 'muse-spark-1.3')
  assert.ok(Math.abs(priceEntry({ model: 'muse-spark-1.3', agent: 'lane', ...MILLION }, prices) - (1.25 + 4.25 + 0.15)) < 1e-9)
  assert.ok(Math.abs(priceEntry({ model: 'muse-wonder-1.0', agent: 'lane', ...MILLION }, prices) - (4 + 20 + 0.2)) < 1e-9)
  assert.equal(ratesFor(prices, 'muse-wonder-full-1.0'), null)
  assert.equal(priceEntry({ model: 'muse-wonder-full-1.0', agent: 'lane', ...MILLION }, prices), null)
})
```

`tests/muse-profiles.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'profiles.json'), 'utf8')).profiles
const KEYS = ['muse-spark-1-3', 'muse-wonder-1-0', 'muse-wonder-full-1-0']

test('each Muse model has a profile written from Meta pages, with its sources and the day they were read', () => {
  for (const key of KEYS) {
    const profile = profiles[key]
    assert.ok(profile, key)
    assert.equal(profile.maker, 'Meta', key)
    assert.ok(typeof profile.purpose === 'string' && profile.purpose !== '', key)
    assert.ok(Array.isArray(profile.sources) && profile.sources.length > 0 && profile.sources.every((url) => url.startsWith('https://dev.meta.ai/')), key)
    assert.equal(profile.checked, '2026-10-19', key)
    for (const field of ['name', 'contextTokens', 'defaultEffort', 'efforts', 'price', 'availability', 'caveats']) assert.ok(field in profile, `${key}: ${field}`)
    assert.equal(profile.contextTokens, 1048576, key)
  }
})

test('the two priced models carry their token price, and the subscription-only model has price null', () => {
  assert.deepEqual([profiles['muse-spark-1-3'].price.input, profiles['muse-spark-1-3'].price.output], [1.25, 4.25])
  assert.deepEqual([profiles['muse-wonder-1-0'].price.input, profiles['muse-wonder-1-0'].price.output], [4, 20])
  assert.equal(profiles['muse-wonder-full-1-0'].price, null)
  assert.match(profiles['muse-wonder-full-1-0'].availability, /Power|Maximum/)
})
```

En `tests/prices.test.js`, la aserción `Object.values(prices.sources).every((url) => url.startsWith('https://openrouter.ai/'))` pasa a aceptar también `https://dev.meta.ai/` (única edición de ese archivo).

**Acceptance:**
- `npm test` está verde, incluida la prueba del índice committed (`tests/models-index.test.js`), que no debe cambiar: los perfiles nuevos no están en `models.json`.
- Ningún precio ni perfil se inventa: todo sale de la evidencia §4 y §8; lo que Meta no dice va como `null` y, en `caveats`, la frase `Prices come from a summary of Meta's pages, to be checked against the page.`

### Task 4: Muse en la documentación

**Aether:**
- Tier: sonnet high — prosa técnica que debe coincidir con lo que el código hace, y varias pruebas de documentos que la sujetan
- Review: xhigh — cada afirmación del texto debe ser cierta respecto del adaptador y de la spec (privacidad, sandbox, fallbacks, cuota)
- Area: docs
- Owns: `README.md`, `CLAUDE.md`, `docs/guide/lanes.md`, `docs/guide/ops.md`, `docs/getting-started.md`, `docs/models/README.md`, `tests/muse-docs.test.js`, `tests/lanes-docs.test.js`
- Depends on: none
- Serves: R20

**Interfaces:**

- Toda lista fija de harnesses de los archivos de arriba (los skills son de la tarea 11) pasa de `agy, codex, grok, cursor` a `agy, codex, grok, cursor, muse` (y «Agy, Codex, Grok and Cursor» a «Agy, Codex, Grok, Cursor and Muse»); todo número que los cuente («four harnesses», «cuatro») pasa a cinco o se reescribe sin número. Los puntos exactos están en [evidence/repo-map.md](evidence/repo-map.md) §5: `README.md:33`, `CLAUDE.md:30`, `docs/guide/lanes.md:15,19,33,47`, `docs/guide/ops.md:20`, `docs/getting-started.md:20`, `docs/models/README.md:16` (solo la parte a mano, nunca lo que está entre `<!-- models-index:start -->` y `<!-- models-index:end -->`).
- `docs/guide/lanes.md` gana una sección `## Muse` (en inglés) que dice, de lo que el código hace: Muse Code es la CLI `muse` de Meta; corre `muse exec --json` sin aprobaciones y con el sandbox de Muse encendido y el workspace sin confianza; el modo contributor va apagado y no hay opción para encenderlo (Meta entrena con el contenido si está encendido); no carga reglas, skills ni memorias personales de otras herramientas; Aether no inicia sesión ni lee credenciales de Muse ni usa `META_API_KEY`; la cuota de suscripción (ventana de 5 h y semanal) se conoce por lo que Muse informa en la última llamada, y antes de ella es desconocida; cada forma de falla (no instalado, `authRequired`, cuota, `environmentError`, tiempo, `stepLimit`, salida ilegible, modelo que la cuenta no da) hace que la llamada corra en el agente nativo sin preguntar; un `environmentError` del sandbox no deja marca y la siguiente unidad lo prueba de nuevo; `maxParallel` es 1 hasta medir; la tabla de Muse no tiene modelos mientras no haya medición de Artificial Analysis, y `scripts/lane-smoke.js muse <modelo>` lo llama con el modelo explícito.
- No se inventan nombres: todo `` `aether-<nombre>` `` en un code span es un archivo de `plugins/aether/bin/` (lo exige `tests/docs-facts.test.js`), el README no pasa de 160 líneas y la línea `Version` de `README.md` no se toca (la tarea 10 la sube).

**Tests (write first):** `tests/muse-docs.test.js`, completo; y en `tests/lanes-docs.test.js` (línea 70) la aserción que fija la lista de cuatro pasa a la de cinco.

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const FIVE = /agy, codex, grok, cursor,? (?:and )?muse/i

test('every guide that lists the harnesses lists Muse with them', () => {
  for (const file of ['README.md', 'CLAUDE.md', 'docs/guide/lanes.md', 'docs/guide/ops.md', 'docs/getting-started.md']) {
    assert.match(read(file), FIVE, file)
  }
  assert.match(read('docs/models/README.md'), /muse/i)
})

test('no page counts the harnesses as four any more', () => {
  for (const file of ['README.md', 'CLAUDE.md', 'docs/guide/lanes.md', 'docs/guide/ops.md', 'docs/getting-started.md']) {
    assert.doesNotMatch(read(file), /\b(four|4) (external )?harnesses\b/i, file)
  }
})

test('the lanes guide has a Muse section that says how a call runs, what it protects and where it falls back', () => {
  const lanes = read('docs/guide/lanes.md')
  const at = lanes.indexOf('\n## Muse')
  assert.notEqual(at, -1, 'a "## Muse" heading')
  const section = lanes.slice(at)
  for (const text of ['muse exec --json', 'contributor', 'sandbox', 'META_API_KEY', 'authRequired', 'environmentError', 'native', 'lane-smoke']) {
    assert.ok(section.includes(text), text)
  }
  assert.doesNotMatch(section, /--yolo[^.\n]*(pass|use)/i, 'the guide never says Aether passes --yolo')
})

test('the README stays within its limits', () => {
  assert.ok(read('README.md').split('\n').length <= 160)
})
```

**Acceptance:**
- `npm test` está verde, con `tests/docs-facts.test.js` sin cambios.
- Las afirmaciones de la sección Muse coinciden con [plan.md](plan.md) D2 a D5 y con la spec; ninguna afirma lo que no se midió (la cuota antes de la primera llamada, el sandbox en WSL2) como hecho.

### Task 5: Muse en la web

**Aether:**
- Tier: sonnet high — HTML, texto y datos de la web en dos idiomas, sin forma exacta que una prueba pueda fijar del todo
- Area: site
- Owns: `site/**`, `tests/site.test.js`
- Depends on: none
- Serves: R20

**Interfaces:**

- `site/index.html` (líneas ~137 y ~448 según [repo-map.md](evidence/repo-map.md) §5) y `site/app.js` (líneas ~42, 150, 205, 313 y 906, con el orden de nodos `order=['agy','grok','codex','cursor']` que pasa a `order=['agy','grok','codex','cursor','muse']`) nombran a Muse donde listan harnesses y donde dicen cuántos son, en español y en inglés. Si el diagrama de la web tiene un nodo por harness, Muse tiene el suyo con el mismo trato visual; `site/style.css` solo cambia si el nodo nuevo lo exige. La web sigue siendo HTML, CSS y JS sin construcción, y abre desde `file://`.

**Tests (write first):** en `tests/site.test.js`, un caso nuevo (que usa las funciones de lectura que el archivo ya tiene o `fs`):

```js
test('the site names Muse wherever it lists the harnesses, in both languages, and counts none as four', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8')
  const app = fs.readFileSync(path.join(__dirname, '..', 'site', 'app.js'), 'utf8')
  assert.match(app, /order\s*=\s*\['agy',\s*'grok',\s*'codex',\s*'cursor',\s*'muse'\]/)
  assert.ok(/muse/i.test(html), 'index.html names Muse')
  for (const text of [html, app]) {
    assert.doesNotMatch(text, /\b(four|cuatro|4) (external |otros? )?harnesses\b/i)
    assert.doesNotMatch(text, /agy,? (?:codex,? )?grok,? (?:and |y )?cursor\b(?!,? (?:and |y )?muse)/i)
  }
  const spanish = html.slice(html.indexOf('lang="es"') === -1 ? 0 : html.indexOf('lang="es"'))
  assert.ok(/muse/i.test(spanish))
})
```

**Acceptance:**
- `npm test` está verde, con las demás pruebas de `tests/site.test.js` sin cambios de aserción.
- La web abre desde `file://` sin errores de consola (el implementador lo comprueba con `python3 -m http.server -d site` y lo dice en su informe).

### Task 6: `muse` en el registro de harnesses y en el panel

**Aether:**
- Tier: sonnet high — cambios en varios archivos del registro y del panel, atados por la prueba de conformidad
- Review: xhigh — el panel tiene estados (cargando, listo, sin instalar) que las pruebas no cubren todos
- Area: harness
- Owns: `plugins/aether/lib/harness/index.js`, `tests/harness-index.test.js`, `plugins/aether/hooks/panel-view.mjs`, `plugins/aether/hooks/panel-layout.mjs`, `plugins/aether/hooks/panel.jsx`, `plugins/aether/hooks/panel.test.tsx`, `tests/panel-view.test.js`, `tests/panel-layout.test.js`, `tests/panel-conformance.test.js`, `tests/fixtures/panel/**`
- Depends on: Task 1 — `createAdapter('muse', …)` carga `lib/harness/muse.js` y `createMuse`, que la tarea 1 escribe
- Serves: R1, R17

**Interfaces:**

```js
// plugins/aether/lib/harness/index.js
const HARNESS_NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']
const FACTORY = { agy: 'createAgy', codex: 'createCodex', grok: 'createGrok', cursor: 'createCursor', muse: 'createMuse' }
// plugins/aether/hooks/panel-view.mjs
export const HARNESS_NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']
export const READ_TIMEOUT_MS = { agy: 75000, grok: 45000, codex: 20000, cursor: 20000, muse: 20000 }
```

- `panel.jsx` cambia su comentario «four harnesses» por «the harnesses» y no tiene otra lógica nueva (recorre `HARNESS_NAMES`). `panel-layout.mjs` pinta la lista sin cambios de lógica (`HARNESS_NAMES`); si algún ancho o recorte supone cuatro, se ajusta.
- Fixtures: `tests/fixtures/panel/quota-muse.json` nuevo, con la forma exacta de `aether-lane quota --json muse` (como `quota-codex.json`, con el grupo `muse` de etiqueta `Muse subscription`, ventanas `5h` con `remaining 0.28` y `weekly` con `remaining 0.6`, `source: { command: 'muse exec --json', ts, ageMinutes: 4, stale: false }`); `quota-missing.json` gana la entrada `muse` (`command: "muse"`, `installed: false`, `groups: {}`).

**Tests (write first):** cambios de aserción, exactos:
- `tests/harness-index.test.js:13`: `assert.deepEqual(harnesses.HARNESS_NAMES, ['agy', 'codex', 'grok', 'cursor', 'muse'])`; caso nuevo: `createAdapter('muse', { command: 'muse', groups: { muse: 'Muse subscription' } }).name === 'muse'`, y que `createAdapter('muse', …)` con `registerAdapter('muse', …)` usa el registrado (como el caso de los demás).
- `tests/panel-layout.test.js:30`: `const NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']`; el helper `quota()` lee `quota-${name}.json` de las cinco; un caso nuevo dibuja el panel con `settings({ harnesses: 'agy,muse' })` y el fixture `quota-muse.json`, y comprueba que hay una línea con el nombre `muse` y las líneas de sus ventanas `5h` y `weekly` con el mismo formato que el panel da a las de `agy` (el implementador toma el texto exacto de los casos vecinos de `agy`).
- `tests/panel-view.test.js:159`: el caso «the real output of the bins reads» añade `muse`: `view.parseHarness(printed('quota-muse.json'), 'muse')` es `ok`, con `version` `1.4.11`, grupo `muse` con ventanas `[['5h', 0.28], ['weekly', 0.6]]` y `source` `{ ageMinutes: 4, stale: false }`.
- `tests/panel-conformance.test.js`: sin cambio de aserción (`view.HARNESS_NAMES` igual a `harness.HARNESS_NAMES` ya fija el cinco); el caso de `HARNESSES` en el entorno gana `'agy,muse'` y `'MUSE,agy'` (válidos, en ese orden) y `'muse,muse'` (una vez).
- `plugins/aether/hooks/panel.test.tsx`: `NAMES` y `TIMEOUTS` con `muse`, y `REAL.muse` (el contenido de `quota-muse.json`) y la entrada `muse` en `MISSING`. Se corre además con `npm run test:mod` si Claude Code está disponible; si no, se dice en el informe.

**Acceptance:**
- `npm test` está verde (conformidad incluida). `lanes.harnessNames('agy,muse')` da `['agy', 'muse']`, descarta un nombre desconocido y los duplicados.
- El panel muestra a Muse con sus grupos de cuota igual que a los otros harness: habilitado y sin instalar, habilitado y leído, y no habilitado.

### Task 7: La entrada de Muse en la tabla de lanes, el manifiesto y las opciones

**Aether:**
- Tier: haiku high — una entrada de tabla y dos textos iguales entre sí, que las pruebas fijan
- Review: xhigh — la tabla es la entrada de todo el orden de cuota y de los tiempos límite
- Area: config
- Owns: `plugins/aether/config/lanes.json`, `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `tests/manifest.test.js`, `tests/lanes.test.js`, `tests/lane-models.test.js`
- Depends on: Task 6 — `lanes.js` valida los nombres de harness contra `HARNESS_NAMES` y `createAdapter('muse')` debe existir para que `aether-lane quota` lea la entrada
- Serves: R8, R19, R2

**Interfaces:**

- `config/lanes.json`, `harnesses.muse` (al final de `harnesses`):

```json
"muse": {
  "command": "muse",
  "maxParallel": 1,
  "waitSeconds": 540,
  "quotaLifeMinutes": 30,
  "timeouts": { "implementer": 2700, "supervisor": 900, "reviewer": 1200 },
  "groups": { "muse": "Muse subscription" },
  "models": {}
}
```

- `plugin.json`, `userConfig.harnesses.description`: la lista pasa a `agy, codex, grok, cursor, muse`; el resto del texto no cambia. `docs/guide/options.md` (líneas ~28 y ~52): la fila de `harnesses` y el texto que la repite pasan a nombrar a Muse con la misma lista; `tests/manifest.test.js:44` compara los dos textos y la tarea los deja iguales.
- `tests/lane-models.test.js` (de la tarea 2): la primera prueba gana `assert.ok(lanes.harnesses.muse, 'the table has a muse harness')` justo después de leer la tabla.

**Tests (write first):** en `tests/lanes.test.js` un caso nuevo (con las funciones que el archivo ya importa de `lanes.js`; los nombres exactos de los ayudantes los toma de los casos vecinos):

```js
test('the shipped lane table has a muse harness with one lane at a time and no models until Artificial Analysis measures one', () => {
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  const muse = config.harnesses.muse
  assert.deepEqual([muse.command, muse.maxParallel, muse.quotaLifeMinutes, muse.waitSeconds], ['muse', 1, 30, 540])
  assert.deepEqual(muse.timeouts, { implementer: 2700, supervisor: 900, reviewer: 1200 })
  assert.deepEqual(muse.groups, { muse: 'Muse subscription' })
  assert.deepEqual(muse.models, {})
  assert.equal(JSON.stringify(config.designSeats).includes('muse'), false, 'Muse takes no design seat')
})

test('muse is a valid value of the harnesses option, in the owner order, without duplicates or unknown names', () => {
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'agy,muse' }), ['agy', 'muse'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: ' MUSE , agy, muse, gork ' }), ['muse', 'agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'gork' }), ['agy'])
})

test('a Muse model of a synthetic table gives the swarm a candidate after agy, in the order enabled', () => {
  const config = JSON.parse(JSON.stringify(lanes.loadConfig(lanes.CONFIG_FILE)))
  config.harnesses.muse.models = { 'muse-spark-1.3': { group: 'muse', replaces: 'sonnet', roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' } } }
  const args = lanes.lanesArgs(config, { installed: () => true, enabled: ['agy', 'muse'] })
  assert.deepEqual(args.harnesses, ['agy', 'muse'])
  assert.deepEqual(args.calls.implementer.sonnet.map((c) => c.harness), ['agy', 'muse'])
  assert.equal(args.maxParallelByHarness.muse, 1)
})
```

**Acceptance:**
- `npm test` está verde; `tests/manifest.test.js` pasa con la lista nueva en el manifiesto y en `options.md`, que quedan iguales.
- `node plugins/aether/bin/aether-lane quota muse` con `muse` en el `PATH` (o sin él) corre sin romperse: sin él dice `not installed`; con él, el grupo `muse` sale desconocido.

### Task 8: Las formas de falla y la cuota de Muse, de punta a punta con el runner real

**Aether:**
- Tier: sonnet — pruebas de integración sobre el runner, la tabla, las marcas y el orden con procesos reales
- Review: xhigh — procesos, archivos y marcas en disco: lo que las pruebas no listan puede dejar una marca falsa o una pregunta
- Area: harness
- Owns: `tests/muse-lane.test.js`, `plugins/aether/lib/lane-calls.js`, `plugins/aether/lib/lane-quota.js`, `plugins/aether/lib/lane-order.js`, `plugins/aether/lib/lane-marks.js`, `plugins/aether/lib/lane-readings.js`
- Depends on: Task 1 — usa `createMuse` y `tests/fixtures/fake-muse.js`
- Depends on: Task 7 — usa la entrada `muse` de la tabla real, que la prueba copia y cambia
- Serves: R3, R4, R7, R11, R13, R14, R15, R16, R25

**Interfaces:**

- Esta tarea es de pruebas. Los archivos `lib/lane-*.js` que posee son solo para corregir un fallo que una de sus pruebas muestre en Muse y que no tenga otra salida (el plan no espera ninguno: `judge`, `holdDry`, `liftIfHealthy` y el orden ya cumplen R11, R13 y R15 con la razón que el adaptador da). Cualquier cambio ahí se explica en el informe.
- Ayudantes de la prueba (los define el archivo): `museEnv(t, script, { models = true } = {})` → toma `fx.laneEnv(t, { mutate })` con `config.harnesses.muse = { ...config.harnesses.muse, command: FAKE_MUSE, waitSeconds: 60, timeouts: { implementer: 60, supervisor: 60, reviewer: 60 }, models: { 'muse-spark-1.3': { group: 'muse', replaces: 'sonnet', roles: ['implementer', 'supervisor', 'reviewer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' } } } }`, `AETHER_LANE_HARNESSES: 'muse'`, `AETHER_FAKE_MUSE_SCRIPT` (el guion escrito en un archivo), `AETHER_FAKE_MUSE_LOG`, y `META_API_KEY: 'secret-key'` en el entorno del llamador. `runImplementer(t, script)` → `fx.laneRun(t)`, `fx.writePrompt`, `start` con `--role implementer --task task-1 --model muse-spark-1.3 --effort xhigh --digest …`, `fx.waitDone`. El patrón es el de `tests/lane-start-marks.test.js` (`flags`, `IMPLEMENT`, `DONE`).

**Tests (write first):** `tests/muse-lane.test.js` cubre, cada uno en su propia prueba con la `muse` simulada:

1. **Una unidad corre en Muse (US2, R3, R4).** Guion: `files: { 'src/t1/a.js': 'x' }`, `stdout` = turno completado con el objeto `DONE` del implementador y un `run.usage` con `allowance` 72 % y 40 %. Se espera `start.json.started === true`, `done.status === 'ok'`, el registro de la `muse` simulada tiene `cwd` igual al worktree de la unidad (`workdir` de `call.json`), `argv` contiene `exec`, `--json`, `--contributor-mode`, `off`, `--max-model-steps`, `200`, no contiene `--yolo` ni `--disable-sandbox` ni `--trust-workspace`, y `metaApiKey === false` (el entorno del runner no lleva la llave). `done.lane.usage.input` y `.total` son los del guion.
2. **Salida estructurada (US3).** Un revisor: guion con el objeto del `REVIEW_SCHEMA` completo → `ok`; el mismo con un campo requerido menos → `failed` y `detail` que casa `/missing /`; con texto que no es el objeto → `failed` y `detail` `no structured output`.
3. **No instalado (US4).** `command` apunta a un archivo que no existe → `start` da `{ unavailable: 'not-installed' }` y no se lanzó ningún proceso (el registro no existe); además `lanes.lanesArgs(config, { installed: (name, h) => lanes.commandInstalled(h.command), enabled: ['muse'] })` es `null` y `lanes.idleHarnesses(...)` dice `is not installed`.
4. **Una prueba por forma de falla (US5, US8, US9, US10; R11, R13).** Para `authRequired`, `environmentError`, `stepLimit`, `modelError` (la cuenta no da `muse-wonder-full-1.0`), salida distinta de 0 sin registros (`exit: 2`, stderr `error: bad flag`) y salida ilegible (`stdout: 'hello'`, exit 0): `done.status === 'failed'`, `done.detail` casa la razón del adaptador (`muse authRequired: …`, `muse environmentError: …`, `muse stepLimit: …`, `muse modelError: …`, `exit 2: error: bad flag`, `unreadable output`), **no existe archivo de marca** bajo `lanes/marks/` para el grupo `muse`, y la `muse` simulada se lanzó una sola vez (no se repite la llamada, ni con el sandbox apagado: el registro tiene una línea y ningún `--disable-sandbox`). `authRequired` no deja ningún proceso de inicio de sesión (el registro solo tiene `exec`).
5. **Cuota agotada (US6, R16).** Guion con `failed({ kind: 'modelError', message: 'limit', quota: { limitKind: 'tierLimit', resetsAtMs: <ahora + 4 h> } })`, exit 1: `done.status === 'quota'`, existe la marca `lanes/marks/muse__muse.json` (no confirmada, 60 min). Un `start` siguiente da `{ unavailable: 'quota' }` (la observación dice agotado hasta el reinicio). Después se escribe `muse-observed.json` con `observedAt: Date.now()`, `window: { usedPercent: 10, resetsAtMs: <+3 h> }`, `weekly: { usedPercent: 10, resetsAtMs: <+5 d> }`, `exhaustedUntilMs: null`: el siguiente `start` da `started: true` y la marca ya no existe (una lectura sana más reciente que la marca la levantó). Un guion cuyo mensaje dice «quota» y «429» pero sin dato `quota` da `failed`, no `quota`, y no deja marca.
6. **Lectura de cuota (US7, R14).** Con una observación de 72 % y 40 % escrita, `aether-lane quota --json muse` (`runBin` del bin con el entorno de `museEnv`) da `harnesses.muse.installed === true`, `version === '1.4.11'`, `groups.muse.windows['5h'].remaining` ≈ 0.28 y `weekly.remaining` ≈ 0.6 con `resetsAt` y `resetsLocal`, y `groups.muse.source.command === 'muse exec --json'`; sin observación, `groups.muse.unknown === true` y el texto de `aether-lane quota muse` (sin `--json`) dice `unknown, used until a call fails for quota`; con la observación corrupta, lo mismo y el bin sale con 0.
7. **El orden la trata como a los otros (US2, R15).** `order.orderCandidates` con dos candidatos `agy` y `muse` y las lecturas de `quotaReport`: con Muse al 28 % y un reinicio lejano, y agy sin lectura, Muse va primero (tiene lectura); con Muse al 97 % usado (`remaining` 0.03 < reserva 0.05) queda excluido con motivo `reserve`; con una marca viva queda excluido con motivo `marked`; con `installed: false`, `not-installed`. Los motivos exactos son los que `lane-order.js` ya devuelve para los otros harness.
8. **Tiempo vencido (US10, R7).** Con `child: true` y `sleepMs: 120000`, `fx.lane(args, 'stop', [IMPLEMENT], env)` termina a la `muse` simulada y a su hijo: el pid de `AETHER_FAKE_MUSE_CHILD_PID` deja de estar vivo (`fx.alive`) y el registro de la llamada dice `stopped`. (El corte por tiempo límite es el del runner, ya probado para agy en `tests/aether-lane.test.js`; esta prueba comprueba que el grupo de Muse muere con sus hijos.)
9. **La prueba real puede llamarlo (US12, R23).** `scripts/lane-smoke.js muse muse-spark-1.3` con un directorio en el `PATH` que contiene un enlace `muse` a la simulada (guion: crea `hello.txt` con `lane ok` y responde `{"status":"done","file":"hello.txt"}`) imprime `"ok":true` y sale 0; sin el segundo argumento sale 2 y dice `has no models in the lane table: give one as the second argument`.

**Acceptance:**
- `npm test` está verde, con `tests/muse-lane.test.js` entero; ninguna prueba toca el `~/.config/muse` ni la red.
- Cada forma de falla de la spec (R11) tiene su prueba, y ninguna deja una marca salvo la de cuota con su dato.

### Task 9: La prueba que falla si una lista fija de harnesses no nombra a Muse

**Aether:**
- Tier: sonnet high — una regla sobre archivos del repositorio con excepciones escritas con motivo
- Review: xhigh — una regla que no encuentra una lista (falso negativo) deja el defecto que R21 quiere cerrar
- Area: harness
- Owns: `tests/harness-lists.test.js`
- Depends on: Task 4 — la documentación ya nombra a Muse en sus listas
- Depends on: Task 5 — la web ya nombra a Muse
- Depends on: Task 6 — el registro y el panel ya incluyen a Muse
- Depends on: Task 7 — el manifiesto y las opciones ya incluyen a Muse
- Depends on: Task 11 — los skills ya nombran a Muse
- Serves: R21

**Interfaces:**

```js
// tests/harness-lists.test.js (all inside the file)
const NAMES = ['agy', 'codex', 'grok', 'cursor']        // the harnesses a list must be completed with 'muse'
// listedFiles(): string[]            tracked text files: `git ls-files -z`, minus binary extensions (.png .jpg .jpeg .gif .webp .ico .woff .woff2 .zip .gz)
// breaches(file, text): { file, line, text, why }[]
//   (a) a line that names at least three of NAMES as whole words (a list) and not 'muse' (any case)
//   (b) a line that counts harnesses with a number: /\b(four|cuatro|4)\s+(external\s+)?harnesses\b/i
// EXCEPTIONS: { match: (file, line) => boolean, why: string }[]   every one with a reason
```

- Excepciones obligatorias, cada una con su motivo escrito en la propia prueba: los registros históricos (`docs/decisions.md` salvo la fila de Muse, `docs/changelog.md` por debajo de la primera línea `Version `, `docs/handoff/`, `docs/issues/`, `docs/roadmap.md`, `docs/roadmap/`, `docs/evaluations/`, `specs/` salvo `specs/008-muse-harness/`), los fixtures capturados (`tests/fixtures/`), las pruebas de los otros adaptadores que nombran a los cuatro en una aserción del propio adaptador (`tests/harness-agy*.test.js`, `harness-codex`, `harness-grok`, `harness-cursor`), y esta propia prueba. Cualquier otra excepción que haga falta la escribe la tarea con su motivo en su informe; ninguna silencia un archivo entero sin motivo.
- El router, los asientos y los delegados nombran a lo sumo dos harnesses (agy y grok), así que no entran por la regla (a) y no necesitan excepción; el texto «other harness» / «otro harness» no nombra a ninguno.

**Tests (write first):** `tests/harness-lists.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const NAMES = ['agy', 'codex', 'grok', 'cursor']
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz)$/i
const COUNT = /\b(four|cuatro|4)\s+(external\s+)?harnesses\b/i

const EXCEPTIONS = [
  { match: (file) => file.startsWith('docs/handoff/') || file.startsWith('docs/issues/') || file.startsWith('docs/evaluations/'), why: 'records of what was true on their date' },
  { match: (file) => file === 'docs/roadmap.md' || file.startsWith('docs/roadmap/'), why: 'the roadmap records plans as they were written' },
  { match: (file) => file.startsWith('specs/') && !file.startsWith('specs/008-muse-harness/'), why: 'earlier specs, plans and tasks are frozen with the harnesses of their time' },
  { match: (file, line) => file === 'docs/decisions.md' && !/muse/i.test(line), why: 'a decision records what was decided then; A37 lists four harnesses because there were four' },
  { match: (file) => file.startsWith('tests/fixtures/'), why: 'captured output of the CLIs' },
  { match: (file) => /^tests\/harness-(agy|codex|grok|cursor)/.test(file), why: 'the tests of one adapter name the others in their own assertions' },
  { match: (file) => file === 'tests/harness-lists.test.js', why: 'this file names the harnesses to look for them' },
]

function tracked() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.split('\0').filter((file) => file !== '' && !BINARY.test(file) && fs.existsSync(path.join(ROOT, file)))
}

const namesIn = (line) => NAMES.filter((name) => new RegExp(`(^|[^A-Za-z0-9_-])${name}($|[^A-Za-z0-9_-])`, 'i').test(line))

// The first line of docs/changelog.md that starts a version: what is above the second such line is the current entry.
function changelogLimit(lines) {
  const starts = lines.map((line, i) => (/^Version \d+\.\d+\.\d+: /.test(line) ? i : -1)).filter((i) => i !== -1)
  return starts.length > 1 ? starts[1] : lines.length
}

function breaches(file, text) {
  const found = []
  const lines = text.split('\n')
  const historyFrom = file === 'docs/changelog.md' ? changelogLimit(lines) : Infinity
  lines.forEach((line, i) => {
    if (i >= historyFrom) return
    const why = []
    if (namesIn(line).length >= 3 && !/muse/i.test(line)) why.push('lists the harnesses without Muse')
    if (COUNT.test(line)) why.push('counts the harnesses as four')
    if (why.length === 0) return
    if (EXCEPTIONS.some((exception) => exception.match(file, line))) return
    found.push({ file, line: i + 1, text: line.trim().slice(0, 160), why: why.join('; ') })
  })
  return found
}

test('the rule finds a list of the harnesses without Muse and a count of four, and lets the harnesses with Muse and a generic phrase pass', () => {
  assert.equal(breaches('README.md', 'agy, codex, grok, cursor').length, 1)
  assert.equal(breaches('README.md', 'The four harnesses are listed').length, 1)
  assert.equal(breaches('README.md', 'cuatro harnesses').length, 1)
  assert.equal(breaches('README.md', 'agy, codex, grok, cursor, muse').length, 0)
  assert.equal(breaches('README.md', 'Agy, Codex, Grok, Cursor and Muse').length, 0)
  assert.equal(breaches('README.md', 'a call on another harness runs the same').length, 0)
  assert.equal(breaches('README.md', 'the router sends it to agy or grok').length, 0)
  assert.equal(breaches('docs/handoff/x.md', 'agy, codex, grok, cursor').length, 0)
  assert.equal(breaches('docs/changelog.md', 'Version 0.13.0: x\nagy, codex, grok, cursor\nVersion 0.12.5: y\nagy, codex, grok, cursor').length, 1)
})

test('no fixed list of the harnesses in the repository leaves Muse out, except the ones named with a reason', () => {
  const found = tracked().flatMap((file) => breaches(file, fs.readFileSync(path.join(ROOT, file), 'utf8')))
  assert.deepEqual(found, [])
  assert.ok(EXCEPTIONS.every((exception) => typeof exception.why === 'string' && exception.why !== ''))
})
```

**Acceptance:**
- `npm test` está verde con las tareas 4 a 7 integradas; si la prueba encuentra una lista que esas tareas no cubrieron, la tarea **no la edita** (no la posee): la añade como excepción solo si es un registro histórico con motivo, y en otro caso lo dice en su informe para que el Lead la corrija.
- La regla se ejercita con casos que deben fallar (primera prueba) además del recorrido del repositorio.

### Task 10: La versión 0.13.0, el changelog, el handoff y la decisión

**Aether:**
- Tier: sonnet high — registros que resumen el trabajo y pruebas de versión que los sujetan
- Review: xhigh — la versión vive en cuatro lugares más una prueba, y un número de decisión que otra sesión puede haber tomado
- Area: release
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `tests/launcher.test.js`, `tests/docs-facts.test.js`, `README.md`, `docs/changelog.md`, `docs/decisions.md`, `docs/handoff/2026-10-19-muse-harness-0.13.0.md`
- Depends on: Task 7 — `plugin.json` ya tiene la descripción nueva de `harnesses`
- Depends on: Task 4 — el README ya nombra a Muse en su lista
- Serves: R29, R30

**Interfaces:**

- `plugin.json` `version`: `0.13.0`. `tests/launcher.test.js:136`: `assert.equal(manifest.version, '0.13.0')` y el nombre del caso («the manifest is version 0.13.0»); las líneas `Version 0.12.x:` del changelog que la prueba exige siguen presentes.
- `README.md`: la línea `Version 0.13.0` (la única `Version`) y la insignia de la línea ~14 con 0.13.0.
- `docs/changelog.md`: una entrada nueva primera, `Version 0.13.0: Muse Code, the fifth lane harness ([handoff](handoff/2026-10-19-muse-harness-0.13.0.md), [guide](guide/lanes.md#muse), [decisions](decisions.md) A<n>). What changed since 0.12.5:` con viñetas (en inglés) de lo hecho: el harness `muse`, la cuota por observación, el fallback en todas las formas de falla, la privacidad (contributor apagado, sin contexto ajeno), el sandbox encendido, `maxParallel` 1, la tabla sin modelos hasta una medición, los perfiles y precios, la regla de las listas (R21), y **qué no cambió** (los otros harness, el router, los asientos, las opciones salvo la descripción de `harnesses`); y la frase de que publicar es del dueño. No afirma la llamada real: si el Lead la hace después, añade su constancia.
- `docs/decisions.md`: una fila nueva `| A<n> | **Muse Code is the fifth lane harness.** … |` con el siguiente número libre: se lee la última fila (`A62` hoy) y se usa la siguiente (`A63`); si otra sesión ya tomó el número en `main`, se usa el siguiente libre y se dice. La fila resume las decisiones del plan: suscripción y no llave (A-1), contributor apagado y sin contexto ajeno (R9), sandbox encendido (R10), cuota por observación (D4), tabla sin modelos hasta una medición (R23), lista de harnesses comprobada por una prueba (R21).
- `docs/handoff/2026-10-19-muse-harness-0.13.0.md`: el estado al cerrar (qué quedó hecho, qué falta del Lead —L1 a L4 del plan—, lo no medido y cómo seguir), con el front matter que `docs-facts` exige a las páginas de `docs/` si lo exige a los handoffs (se copia el de `2026-10-19-lanes-marks-lead-max-0.12.5.md`).
- `tests/docs-facts.test.js`: el caso `R15: the decisions A50 to A61 are recorded and the changelog opens with 0.12.5 and its handoff` pasa a abrir con 0.13.0 y su handoff: el rango de decisiones llega a la de Muse, y `first.startsWith('Version 0.13.0: ')` y `first.includes('handoff/2026-10-19-muse-harness-0.13.0.md')`.

**Tests (write first):** los dos archivos de prueba cambian primero y fallan; la verdad se escribe después.

```js
// tests/docs-facts.test.js: the case at line ~540 becomes
test('R15: the decisions A50 to A<n> are recorded and the changelog opens with 0.13.0 and its handoff', () => {
  const decisions = read('docs/decisions.md')
  for (let n = 50; n <= LAST_DECISION; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
  const a50 = decisions.split('\n').find((line) => line.startsWith('| A50 |'))
  assert.ok(a50.includes('specs/005-aether-design/spec.md') && a50.includes('Workflow tool'))
  const muse = decisions.split('\n').find((line) => line.startsWith(`| A${LAST_DECISION} |`))
  assert.ok(/Muse Code/.test(muse) && /fifth lane harness/.test(muse))
  const first = read('docs/changelog.md').split('\n').find((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(first.startsWith('Version 0.13.0: ') && first.includes('handoff/2026-10-19-muse-harness-0.13.0.md'), first)
})
```

donde `LAST_DECISION` es la constante numérica del número libre que la tarea usó (63 si sigue libre). En `tests/launcher.test.js` el caso del manifiesto aserta `manifest.version === '0.13.0'`.

**Acceptance:**
- `npm test` está verde; `plugin.json`, la fijación de `tests/launcher.test.js`, la línea `Version` del README y la primera línea `Version X.Y.Z:` del changelog dicen 0.13.0; `grep -rn "0\.12\.5" tests plugins README.md` solo encuentra registros históricos.
- Nada de merge, push, tag, publicación ni `claude plugin update`. El Lead corre después `npm run check` (plan D13, L4).

### Task 11: Muse en los skills `using-aether` y `swarm`

**Aether:**
- Tier: sonnet high — el bootstrap del Lead es prosa que otras pruebas fijan, y cada frase debe seguir siendo cierta
- Review: xhigh — el skill `using-aether` se inyecta en cada sesión del Lead: un cambio equivocado ahí llega a todas
- Area: docs
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `tests/muse-skills.test.js`, `tests/roles.test.js`
- Depends on: none
- Serves: R20

**Interfaces:**

- `skills/using-aether/SKILL.md` (línea ~121) y `skills/swarm/SKILL.md` (línea ~28) pasan la lista de harnesses a `agy, codex, grok, cursor, muse` (o «Agy, Codex, Grok, Cursor and Muse»); en `swarm`, una frase dice que Muse es una lane como las otras (la cuota decide el orden y cualquier fallo corre en el agente nativo sin preguntar). Nada más cambia: ni el resto del bootstrap ni otro skill. `tests/roles.test.js:52` fija el párrafo entero del skill de swarm: la aserción pasa al párrafo con la lista de cinco.

**Tests (write first):** `tests/muse-skills.test.js`, completo; y la aserción de `tests/roles.test.js:52` primero (rojo).

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const skill = (name) => fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'skills', name, 'SKILL.md'), 'utf8')
const FIVE = /agy, codex, grok, cursor,? (?:and )?muse/i

test('the bootstrap and the swarm skill list Muse with the other lane harnesses, and count none as four', () => {
  for (const name of ['using-aether', 'swarm']) {
    const text = skill(name)
    assert.match(text, FIVE, name)
    assert.doesNotMatch(text, /\b(four|4) (external )?harnesses\b/i, name)
  }
})

test('the swarm skill says a Muse call falls back to the native agent without asking', () => {
  assert.match(skill('swarm'), /muse/i)
  assert.match(skill('swarm'), /native/i)
})
```

**Acceptance:**
- `npm test` está verde; los demás skills y el resto de `using-aether` quedan byte a byte iguales (`git diff` solo toca esas líneas).
