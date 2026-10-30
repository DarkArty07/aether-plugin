# Codex como harness de trabajo (0.27.0): tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual (`feat/codex-harness`). El plan es [plan.md](plan.md); lo medido, [evidence/](evidence/README.md). Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice.
- **Idioma.** El código, los comentarios, los mensajes de error y los documentos del repositorio van en inglés; este archivo y el plan, en español. Un texto que una prueba fija (razón de un fallo, línea de órdenes, frase) va exactamente como la tarea lo escribe. La web va en español y en inglés, como ya está.
- **Estilo.** Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma ni dependencias de npm; los `.mjs` son ESM. Se copia el estilo de `lib/harness/muse.js`, `agy.js` y `structured.js` (comentario de cabecera con su línea `Family:`, funciones pequeñas, `module.exports` al final).
- **Primero los tests.** Cada tarea escribe sus pruebas (rojo), implementa y deja `npm test` verde completo antes de reportar. Los tests existentes que una tarea cambia son los que ella lista, con las aserciones que su propio cambio rompe; ninguna otra aserción existente cambia. Una tarea posee las pruebas de su cambio.
- **Ningún test usa el `codex` de verdad.** En la máquina del dueño `codex` está en el `PATH`. Toda prueba cuya tabla de lanes nombre a Codex pone su `command` en `tests/fixtures/fake-codex.js` o en una ruta que no existe (`/nowhere/codex`), y pasa `env` explícito donde un adaptador lo acepte. Nadie corre `codex`, `agy`, `grok`, `cursor-agent` ni `muse` de verdad, ni lee `~/.codex`, ni usa `OPENAI_API_KEY`. Las llamadas reales son del Lead (plan D0) y no son una tarea.
- **Seguridad de la llamada (R19).** Ningún código del plugin abre, lee, copia ni enlaza `auth.json`, ni usa `OPENAI_API_KEY` ni `CODEX_HOME`; ninguno pasa `--dangerously-bypass-approvals-and-sandbox`, `--dangerously-bypass-hook-trust`, `--full-auto`, `--approve-for-me`, `--add-dir`, `--oss`, `-p`/`--profile`, `--cd` ni `--worktree`. El orden de los harness en toda lista fija es el del registro: `agy, codex, grok, cursor, muse` (los de delegados, sin `cursor`).
- **Lo medido en el paso 0** (el Lead, 2026-10-29, `evidence/step0-findings.md`). Los eventos de `codex exec --json` son `thread.started`, `turn.started`, `item.completed` con `item.type` `agent_message` y `item.text`, y `turn.completed` con `usage` (`input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`): los nombres de Spec Kit eran correctos. `--disable hooks` y `-c approval_policy=never` se aceptan; `-c project_doc_max_bytes=0` no quita el `AGENTS.md` global del dueño y se sacó de la línea de órdenes. `max` y `--output-schema` se aceptan. El `AGENTS.md` global del dueño llega al modelo aunque se ignoren la configuración y las reglas: es un límite medido (R19), no una opción que falte, y el adaptador lo mitiga con una nota delante del prompt (tarea 1).
- **Nadie escribe bajo `specs/` ni `.specify/`** (aether-guard lo rechaza a los implementadores). Tampoco se publica: ni merge a `main`, ni push, ni tag, ni `claude plugin update`. La versión solo la sube la tarea 12.
- **Vínculo con los requisitos.** Cada tarea lleva `- Serves: R<n>, ...`. R19 (la medición), R21 (las llamadas reales), R26 y la parte de R6 que depende de la llamada real son del Lead y del plan (D0, `## Proposals`), no de una tarea.
- **Formas compartidas entre tareas** (las fija la tarea que las produce; las demás las importan):
  - **Adaptador.** `createCodex({ command = 'codex', groups = {}, exec = defaultExec, env = process.env } = {})` en `plugins/aether/lib/harness/codex.js`.
  - **Reglas de cuota.** El grupo se llama `codex`; las ventanas, `5h` y `weekly`; una lectura es `{ groups: { codex: { windows: { '5h': { remaining, resetsAt }, weekly: { remaining, resetsAt } } } } }` con `remaining = (100 - usedPercent) / 100` y `resetsAt` ISO. Sin `source`.
  - **El `codex` simulado.** `tests/fixtures/fake-codex.js` (ejecutable) y `tests/fixtures/codex/**`, que la tarea 1 escribe; contrato en la tarea 1.
  - **Los pares de Codex.** `codex/gpt-6.1-sol@<esfuerzo>`, `codex/gpt-6.1-terra@<esfuerzo>` y `codex/gpt-6-luna@<esfuerzo>`, con `<esfuerzo>` en `low, medium, high, xhigh, max`, grupo `codex`.
  - **Los precios.** `config/prices.json` tiene las claves `gpt-6.1-sol`, `gpt-6.1-terra` y `gpt-6-luna`, cada una con `input` y `output` por millón (la tarea 4 las escribe; la 3 las lee).
- **La frase de alcance, idéntica donde un archivo la lleve:** `Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for.`

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [US2] La línea de órdenes de `codex exec`: modelo, esfuerzo, `--json`, sandbox, esquema estricto y nada de la configuración del dueño in plugins/aether/lib/harness/codex.js → Task 1
- [ ] T002 [US3] [US4] `parseRun` sin cuota por texto y `parse` de Codex con los eventos reales in plugins/aether/lib/harness/structured.js → Task 1
- [ ] T003 [US2] El `codex` simulado (`--version`, `exec`, `app-server`) y su captura real in tests/fixtures/fake-codex.js → Task 1
- [ ] T004 [US5] El lector de `account/rateLimits/read` y la cuota del adaptador in plugins/aether/lib/harness/codex-quota.js → Task 2
- [ ] T005 [US6] Las 15 filas de pares de Codex, el costo estimado y los escalones in plugins/aether/config/pairs.json → Task 3
- [ ] T006 [US7] La lista de la CLI, los excluidos con su razón, los perfiles, los precios y el índice de modelos in plugins/aether/config/models/harness-models.json → Task 4
- [ ] T007 [US7] Los modelos de Codex y sus roles en la tabla de lanes in plugins/aether/config/lanes.json → Task 5
- [ ] T008 [US9] Codex en las listas fijas de los delegados y del router in plugins/aether/lib/router-pick.js → Task 6
- [ ] T009 [US2] Los cinco esfuerzos y `--raw` de la herramienta de humo in scripts/lane-smoke.js → Task 7
- [ ] T010 [US2] [US3] [US4] [US9] Punta a punta con el ejecutor real: unidad, fallos, cuota, marca y delegados in tests/codex-lane.test.js → Task 8
- [ ] T011 [US1] La descripción de `harnesses` y la detección de Codex in plugins/aether/.claude-plugin/plugin.json → Task 9
- [ ] T012 [US8] [US10] Codex en las guías, la web, el README y las skills del plugin in docs/guide/lanes.md → Task 10
- [ ] T013 [US10] El método en skills y las pruebas que lo atan al árbol in .claude/skills/new-harness/SKILL.md → Task 11
- [ ] T014 [US1] La versión 0.27.0, el changelog y A100 in docs/changelog.md → Task 12

### Task 1: El adaptador de `codex exec` y su `codex` simulado

**Aether:**
- Review: xhigh — la línea de órdenes decide si la configuración y las credenciales del dueño entran en la llamada
- Area: harness
- Owns: `plugins/aether/lib/harness/codex.js`, `plugins/aether/lib/harness/structured.js`, `tests/harness-codex.test.js`, `tests/harness-structured.test.js`, `tests/fixtures/fake-codex.js`, `tests/fixtures/codex/**`
- Depends on: none
- Serves: R4, R5, R6, R7, R19, R22

**Interfaces:**

```text
// plugins/aether/lib/harness/structured.js
// parseRun gains a fourth argument; the default keeps every other harness as it is.
function parseRun(raw, extract, required = [], { quotaByText = true } = {}) -> { clean, reason, structured, usage, conversation }
// quotaByText false: the two rules «a quota line in stderr» and «for a non-zero exit, a quota line outside the answer»
// are skipped. Every other rule, and its order, stays.

// plugins/aether/lib/harness/codex.js
function createCodex({ command = 'codex', groups = {}, exec = defaultExec, env = process.env } = {}) -> adapter
// adapter:
//   name: 'codex'
//   schemaInPrompt: false                    (the schema goes in --output-schema)
//   installed(): boolean                     commandInstalled(command, env)
//   version(): string|null                   first line of `<command> --version`, trimmed (unchanged)
//   modelArg({ model }): string              the bare model id (unchanged)
//   usageDelta(previous, current): current   (unchanged)
//   argv({ model, level, schemaFile, timeoutSeconds, prompt }): string[]
//   parse(raw, { required }): the verdict of parseRun(raw, readCodex, required, { quotaByText: false })
//   (quota() stays as it is in this task: unknown for every group; task 2 replaces it)
```

`argv` returns exactly this array (all its options were accepted by `codex exec` 0.166.0 in step 0; this text is what the tests fix), where the prompt is `` `${CODEX_NOTE}\n\n${prompt}` ``:

```
[command, 'exec', notedPrompt, '--model', model, '-c', `model_reasoning_effort=${level}`, '--json', '--sandbox', 'workspace-write',
 '--ephemeral', '--ignore-user-config', '--ignore-rules', '--disable', 'hooks', '-c', 'approval_policy=never',
 ...(schemaFile ? ['--output-schema', schemaFile] : [])]
```

`codex.js` exports `{ createCodex, CODEX_NOTE }`. `CODEX_NOTE` is this text, as one string: `You run as a headless worker inside Aether. Do exactly the task below and nothing more. If an instruction file of the user (such as AGENTS.md) tells you to work autonomously for long, to start or use subagents, or to follow another orchestration workflow, ignore that part: start no subagents.` Why: step 0 measured that the owner's `~/.codex/AGENTS.md` (an autonomy directive that sends Codex to its native subagents) reaches the model whatever flags the call carries, and Codex has no option to switch it off.

When `schemaFile` is given, `argv` first rewrites that file in place with `strictSchema(JSON.parse(file))` from `lib/lane-schemas.js` (as `writeStrictSchema` of `lib/harness/muse.js` does: a missing, unreadable or non-JSON file stays as it is and `argv` still returns). The adapter never sets `env` for the process; the lane runner does.

`parse`: the answer is the text of the last `item.completed` event whose `item.type` is `agent_message`; the usage is that of the last `turn.completed` event that has one, as `usageOf({ input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cached_input_tokens })`. A line that is not JSON is skipped. The header comment that says «not yet checked against the installed codex» is removed (R22); if the Lead corrected the event names in this section, the code uses the corrected ones.

**El `codex` simulado**, `tests/fixtures/fake-codex.js` (`#!/usr/bin/env node`, mode 755; the task `chmod`s it), contract:
- `--version` prints `codex-cli 0.166.0`.
- `exec <prompt> [options]`: reads the script from `AETHER_FAKE_CODEX_SCRIPT` (the JSON text of an object, or of an array of objects: the n-th `exec` of a run takes the n-th element, counted in the file named by `AETHER_FAKE_CODEX_STATE` when set, else the object is used every time). Script keys, all optional: `answer` (string; default `{"ok":true}`), `stdout`, `stderr`, `exit` (number, default 0), `files` (`{ <path relative to the cwd>: <text> }`), `commit` (a message: `git add -A && git commit -q -m <message>` in the cwd after writing `files`), `sleepMs`. It appends one JSON line `{ kind: 'exec', argv, cwd, home, apiKey }` (`home` = `HOME`, `apiKey` = `OPENAI_API_KEY` or null) to `AETHER_FAKE_CODEX_LOG` when set; writes `files`; waits `sleepMs`; prints `stdout`, or when absent these three events built from `answer`, one JSON object per line: `{"type":"thread.started","thread_id":"t1"}`, `{"type":"turn.started"}`, `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":<answer>}}`, `{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":800,"cache_write_input_tokens":0,"output_tokens":200,"reasoning_output_tokens":0}}` (four lines, the shape the real `codex exec --json` printed); prints `stderr`; exits with `exit`.
- `app-server`: reads JSON lines from stdin. It answers `{"id":<id>,"result":{"userAgent":"fake"}}` to `initialize`, nothing to the `initialized` notification, and to `account/rateLimits/read` `{"id":<id>,"result":<the JSON in the file named by AETHER_FAKE_CODEX_RATE_LIMITS>}`. It appends `{ kind: 'app-server', methods: [<every method received so far, in order>] }` to the log after each message. `AETHER_FAKE_CODEX_APPSERVER`: `error` answers the read with `{"id":<id>,"error":{"code":-32000,"message":"not signed in"}}`; `hang` never answers; `exit` exits 3 before reading anything. When `AETHER_FAKE_CODEX_PID` is set it writes its pid there.
- Any other command exits 2 with a message on stderr.
- `tests/fixtures/codex/rate-limits.json` is the result an `account/rateLimits/read` returns, in the protocol's own names: `{ "ordinaryUsageAllowed": true, "rateLimits": L, "rateLimitsByLimitId": { "codex": L } }` with `L = { "limitId": "codex", "limitName": null, "planType": "plus", "rateLimitReachedType": null, "primary": { "usedPercent": 6, "windowDurationMins": 300, "resetsAt": 1793337189 }, "secondary": { "usedPercent": 1, "windowDurationMins": 10080, "resetsAt": 1793923989 }, "credits": { "hasCredits": false, "unlimited": false, "balance": "0" } }`.
- `tests/fixtures/codex/exec-events.jsonl` is a copy of `specs/022-codex-harness/evidence/codex-exec-events.jsonl`, which the Lead left there in step 0 (the raw stdout of a real `codex exec --json` call on `gpt-6-luna` whose answer is the JSON object `{"ok":true}`; it has the four events above). Read the file; do not write under `specs/`. If it is missing, stop and say so.

**Tests (write first):**

`tests/harness-codex.test.js` is rewritten. These tests of the existing file stay as they are: «modelArg gives codex the bare model id…», «parse reads a clean run…», «parse finds the JSON in a fenced block inside prose», «parse fails a structured output that lacks a required field…», «parse fails a non-zero exit with the first non-empty stderr line…», «a clean answer stays clean…», «a non-zero codex run with no quota text gives its exit and the first stderr line», «parse without an exit code…», «parse fails empty output as no result…», «usage is read from the last turn…», «usageDelta gives the current usage…», «version gives the trimmed first line…», «installed follows the PATH» (with `GROUPS = { codex: 'Codex plan' }`). These are removed: «codex reports its quota as unknown for each group, without running the CLI» (task 2 covers the quota), «parse fails a quota message in stderr or stdout before any other rule» and «a non-zero codex run is a quota failure for a quota line on stderr or in an error event…» (they fixed the text rule). These are the new ones (the file imports `{ createCodex, CODEX_NOTE }` from `codex.js`):

```js
const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')
const CODE = path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'harness', 'codex.js')
const schemaIn = (t) => {
  const file = path.join(tempDir(t), 'schema.json')
  fs.writeFileSync(file, JSON.stringify({ type: 'object', properties: { answer: { type: 'string' }, extra: { type: 'string' } }, required: ['answer'] }))
  return file
}

test('argv runs one headless exec: the model and effort of the pair, JSON events, the sandbox on, no approvals, none of the owner\'s setup', (t) => {
  const schemaFile = schemaIn(t)
  const codex = createCodex({ command: '/opt/codex', groups: GROUPS })
  assert.deepEqual(codex.argv({ model: 'gpt-6.1-terra', level: 'medium', schemaFile, timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/codex', 'exec', `${CODEX_NOTE}\n\nP`, '--model', 'gpt-6.1-terra', '-c', 'model_reasoning_effort=medium', '--json', '--sandbox', 'workspace-write',
    '--ephemeral', '--ignore-user-config', '--ignore-rules', '--disable', 'hooks', '-c', 'approval_policy=never',
    '--output-schema', schemaFile,
  ])
  const bare = createCodex({ groups: GROUPS }).argv({ model: 'm', level: 'low', prompt: 'P' })
  assert.equal(bare[0], 'codex')
  assert.equal(bare.includes('--output-schema'), false)
})

test('the prompt carries the note that keeps the owner\'s AGENTS.md orders out, and nothing else changes in it', () => {
  const argv = createCodex({ groups: GROUPS }).argv({ model: 'm', level: 'low', prompt: 'DO THE TASK' })
  assert.equal(argv[2], `${CODEX_NOTE}\n\nDO THE TASK`)
  assert.match(CODEX_NOTE, /headless worker/)
  assert.match(CODEX_NOTE, /start no subagents/)
  assert.equal(argv.some((arg) => arg.startsWith('project_doc_max_bytes')), false, 'the option that did not work is gone')
})

test('the effort goes to codex under the name of the pair, for each of the five levels', () => {
  const codex = createCodex({ groups: GROUPS })
  for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.ok(codex.argv({ model: 'gpt-6-luna', level, prompt: 'P' }).includes(`model_reasoning_effort=${level}`), level)
  }
})

test('argv passes none of the flags that open the sandbox or reach the owner\'s setup', () => {
  const argv = createCodex({ groups: GROUPS }).argv({ model: 'm', level: 'high', prompt: 'P' })
  for (const flag of ['--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust', '--full-auto', '--approve-for-me', '--add-dir', '--oss', '--profile', '-p', '--cd', '--worktree']) {
    assert.equal(argv.includes(flag), false, flag)
  }
})

test('the schema file is rewritten strict for codex, and codex gets it in --output-schema, not in the prompt', (t) => {
  const schemaFile = schemaIn(t)
  const codex = createCodex({ groups: GROUPS })
  assert.equal(codex.schemaInPrompt, false)
  codex.argv({ model: 'm', level: 'low', schemaFile, prompt: 'P' })
  const written = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
  assert.equal(written.additionalProperties, false)
  assert.deepEqual(written.required, ['answer', 'extra'])
  const missing = path.join(tempDir(t), 'nope.json')
  assert.ok(codex.argv({ model: 'm', level: 'low', schemaFile: missing, prompt: 'P' }).includes(missing), 'a missing file does not stop argv')
})

test('a quota word is no quota failure by itself: only a datum or a reading makes one', () => {
  const codex = createCodex({ groups: GROUPS })
  const ok = jsonl(message(APPROVE), turn(CODEX_USAGE))
  assert.equal(codex.parse({ stdout: ok, stderr: 'ERROR: Rate limit reached\n', exitCode: 1 }).reason, 'exit 1: ERROR: Rate limit reached')
  assert.equal(codex.parse({ stdout: 'Error: usage limit reached\n', stderr: '', exitCode: 1 }).reason, 'exit 1')
  assert.equal(codex.parse({ stdout: jsonl({ type: 'error', message: 'usage limit reached' }), stderr: '', exitCode: 1 }).reason, 'exit 1')
  assert.equal(codex.parse({ stdout: jsonl({ type: 'turn.failed', error: { message: 'You have hit your usage limit' } }), stderr: '', exitCode: 1 }).reason, 'exit 1')
})

test('the fake codex runs the argv of the adapter in a working directory, and parse reads what it prints', (t) => {
  const cwd = tempDir(t)
  const log = path.join(tempDir(t), 'log')
  const env = { ...process.env, AETHER_FAKE_CODEX_LOG: log, AETHER_FAKE_CODEX_SCRIPT: JSON.stringify({ answer: APPROVE, files: { 'out.txt': 'x' } }) }
  const codex = createCodex({ command: FAKE, groups: GROUPS })
  const argv = codex.argv({ model: 'gpt-6-luna', level: 'low', prompt: 'P' })
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.readFileSync(path.join(cwd, 'out.txt'), 'utf8'), 'x')
  const parsed = codex.parse({ stdout: r.stdout, stderr: r.stderr, exitCode: r.status }, { required: ['verdict'] })
  assert.deepEqual([parsed.clean, parsed.structured, parsed.usage], [true, { verdict: 'approve', summary: 'done' }, USAGE])
  const [entry] = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(entry.kind, 'exec')
  assert.equal(fs.realpathSync(entry.cwd), fs.realpathSync(cwd))
})

test('the real events of codex exec --json, captured on 2026-10-29, read as a clean run', () => {
  const stdout = fs.readFileSync(path.join(__dirname, 'fixtures', 'codex', 'exec-events.jsonl'), 'utf8')
  const parsed = createCodex({ groups: GROUPS }).parse({ stdout, stderr: '', exitCode: 0 }, { required: [] })
  assert.equal(parsed.clean, true, parsed.reason)
  assert.deepEqual(parsed.structured, { ok: true })
  assert.ok(parsed.usage.input > 0 && parsed.usage.output > 0, JSON.stringify(parsed.usage))
})

test('no code of the adapter opens the owner\'s credentials or uses an API key, and the comment about unchecked events is gone', () => {
  const source = fs.readFileSync(CODE, 'utf8')
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  assert.equal(/auth\.json|OPENAI_API_KEY|CODEX_HOME/.test(code), false)
  assert.equal(/not yet checked against the installed codex/.test(source), false)
})
```

`tests/harness-structured.test.js` gains (the file already imports from `structured.js`; import `parseRun` if it does not):

```js
test('parseRun with quotaByText false gives a quota word no quota reason, and the default keeps it', () => {
  const extract = (stdout) => ({ answer: '', usage: {}, outside: stdout })
  const raw = { stdout: 'usage limit reached\n', stderr: 'Rate limit reached\n', exitCode: 1 }
  assert.equal(parseRun(raw, extract, []).reason, 'quota: Rate limit reached')
  assert.equal(parseRun(raw, extract, [], { quotaByText: false }).reason, 'exit 1: Rate limit reached')
  assert.equal(parseRun({ ...raw, stderr: '' }, extract, [], { quotaByText: false }).reason, 'exit 1')
})
```

**Acceptance:** `argv` gives the array above and writes the strict schema; `schemaInPrompt` is `false`; a quota word in a failure never yields a `quota:` reason from the Codex adapter; the real events of `tests/fixtures/codex/exec-events.jsonl` read as a clean run; `fake-codex.js` follows the contract; the other harnesses' tests pass unchanged; `npm test` is green.

### Task 2: La lectura de la cuota de Codex

**Aether:**
- Area: harness
- Owns: `plugins/aether/lib/harness/codex-quota.js`, `plugins/aether/lib/harness/codex.js`, `tests/harness-codex-quota.test.js`, `tests/lane-fixtures.js`
- Depends on: Task 1 — el `codex` simulado y `codex.js`, que esta tarea completa con `quota()`
- Serves: R9, R10, R11

**Interfaces:**

```text
// plugins/aether/lib/harness/codex-quota.js
const RATE_LIMITS_TIMEOUT_MS = 20000
// The pure part: the windows of an `account/rateLimits/read` result.
function windowsFrom(result) -> { '5h': { remaining, resetsAt }, weekly: { remaining, resetsAt } }
//   limit = result.rateLimitsByLimitId.codex when it exists, else result.rateLimits; its `primary` and `secondary` windows.
//   name: windowDurationMins 300 -> '5h', 10080 -> 'weekly', any other -> `${mins}m`; a window that is null or without usedPercent is skipped.
//   remaining = (100 - usedPercent) / 100, never below 0; resetsAt = new Date(resetsAt * 1000).toISOString().
//   result.ordinaryUsageAllowed === false puts every window at remaining 0.
//   throws Error('codex rate limits: no windows') when no window is left.
// The reading: synchronous for the caller.
function readCodexQuota({ command = 'codex', groups = {}, env = process.env, timeoutMs = RATE_LIMITS_TIMEOUT_MS } = {}) -> { groups: { <key>: { windows } } }
//   one copy of the windows for each key of `groups`. Throws Error(`codex rate limits: <cause>`) when the command cannot start,
//   the server errors (cause includes the server's message), exits, or does not answer within timeoutMs (cause includes `timed out`).
// Run as a script (`node codex-quota.js <command> <timeoutMs>`), the file does the asynchronous part: it starts `<command> app-server`
// (stdio), sends {id:1, method:'initialize', params:{clientInfo:{name:'aether', title:'aether', version:'0.0.0'}}}, then on its answer the
// notification {method:'initialized'} and {id:2, method:'account/rateLimits/read'}, prints ONE JSON line ({ok:true,result} or {ok:false,error}),
// kills the server (and itself ends) whichever way it ends, at timeoutMs included. readCodexQuota runs that script with
// spawnSync(process.execPath, [__filename, command, String(timeoutMs)], { env, encoding: 'utf8', timeout: timeoutMs + 5000 }).

// plugins/aether/lib/harness/codex.js (this task adds)
//   quotaCost: 'process'
//   quota(): readCodexQuota({ command, groups, env })
```

No `source` in a reading. No call to a model: the only methods sent are `initialize`, `initialized` and `account/rateLimits/read`. No code opens credentials or names `OPENAI_API_KEY`.

`tests/lane-fixtures.js` (shared by every test that goes through `laneEnv`): after the line `if (config.harnesses.muse) config.harnesses.muse.command = '/nowhere/muse'` (line 23) add `if (config.harnesses.codex) config.harnesses.codex.command = '/nowhere/codex'`, so that no test that uses `laneEnv` starts the real `codex` (with Task 2, `quota()` starts `codex app-server`). A test that needs the simulated one passes `mutate`, which runs after this line, as Task 9 does. No other line of the file changes; list the change in the report.

**Tests (write first):** `tests/harness-codex-quota.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { readCodexQuota, windowsFrom } = require('../plugins/aether/lib/harness/codex-quota.js')
const { createCodex } = require('../plugins/aether/lib/harness/codex.js')
const { readGroups } = require('../plugins/aether/lib/lane-readings.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')
const GROUPS = { codex: 'Codex plan' }
const iso = (seconds) => new Date(seconds * 1000).toISOString()
const MIN = 60 * 1000
const base = () => JSON.parse(fs.readFileSync(RATE_LIMITS, 'utf8'))
const envFor = (t, extra = {}) => ({ ...process.env, AETHER_FAKE_CODEX_LOG: path.join(tempDir(t), 'log'), AETHER_FAKE_CODEX_RATE_LIMITS: RATE_LIMITS, ...extra })
const appServerLog = (env) => fs.readFileSync(env.AETHER_FAKE_CODEX_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((entry) => entry.kind === 'app-server')

test('windowsFrom gives the two windows with the share left and the reset', () => {
  assert.deepEqual(windowsFrom(base()), { '5h': { remaining: 0.94, resetsAt: iso(1793337189) }, weekly: { remaining: 0.99, resetsAt: iso(1793923989) } })
})

test('windowsFrom: the limit of codex wins, a full window reads zero, a refused account reads empty, an odd window is named by its minutes', () => {
  const byId = base()
  byId.rateLimitsByLimitId.codex.primary.usedPercent = 50
  assert.equal(windowsFrom(byId)['5h'].remaining, 0.5)
  const plain = base()
  delete plain.rateLimitsByLimitId
  plain.rateLimits.primary.usedPercent = 100
  assert.equal(windowsFrom(plain)['5h'].remaining, 0)
  assert.equal(windowsFrom(plain).weekly.remaining, 0.99)
  const refused = { ...base(), ordinaryUsageAllowed: false }
  assert.deepEqual(Object.values(windowsFrom(refused)).map((w) => w.remaining), [0, 0])
  const odd = base()
  odd.rateLimitsByLimitId.codex.primary.windowDurationMins = 60
  assert.deepEqual(Object.keys(windowsFrom(odd)), ['60m', 'weekly'])
  assert.throws(() => windowsFrom({}), /codex rate limits: no windows/)
})

test('readCodexQuota reads the windows from account/rateLimits/read alone, once for each group of the table', (t) => {
  const env = envFor(t)
  const out = readCodexQuota({ command: FAKE, env, groups: { codex: 'Codex plan', other: 'Other' } })
  assert.deepEqual(Object.keys(out.groups), ['codex', 'other'])
  assert.deepEqual(out.groups.codex, { windows: windowsFrom(base()) })
  assert.deepEqual(out.groups.other, out.groups.codex)
  const methods = appServerLog(env).at(-1).methods
  assert.deepEqual(methods, ['initialize', 'initialized', 'account/rateLimits/read'], 'no model call, nothing else is asked')
})

test('a server that errors, exits, does not answer or is not there is a failure, never an invented reading, and a server that hangs is killed', (t) => {
  assert.throws(() => readCodexQuota({ command: FAKE, env: envFor(t, { AETHER_FAKE_CODEX_APPSERVER: 'error' }), groups: GROUPS }), /codex rate limits.*not signed in/)
  assert.throws(() => readCodexQuota({ command: FAKE, env: envFor(t, { AETHER_FAKE_CODEX_APPSERVER: 'exit' }), groups: GROUPS }), /codex rate limits/)
  assert.throws(() => readCodexQuota({ command: '/nowhere/codex', env: process.env, groups: GROUPS }), /codex rate limits/)
  const pidFile = path.join(tempDir(t), 'pid')
  const started = Date.now()
  assert.throws(() => readCodexQuota({ command: FAKE, env: envFor(t, { AETHER_FAKE_CODEX_APPSERVER: 'hang', AETHER_FAKE_CODEX_PID: pidFile }), groups: GROUPS, timeoutMs: 500 }), /codex rate limits.*timed out/)
  assert.ok(Date.now() - started < 6000)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  const deadline = Date.now() + 3000
  const alive = () => { try { process.kill(pid, 0); return true } catch { return false } }
  while (alive() && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  assert.equal(alive(), false, 'the server does not outlive the reading')
})

test('the adapter reads its quota through the reader and declares that a reading costs a process', (t) => {
  const codex = createCodex({ command: FAKE, groups: GROUPS, env: envFor(t) })
  assert.equal(codex.quotaCost, 'process')
  assert.deepEqual(codex.quota(), { groups: { codex: { windows: windowsFrom(base()) } } })
})

test('lane-readings keeps the reading for its life, and a reading older than its life is read again (R9)', (t) => {
  const env = envFor(t)
  const dataDir = tempDir(t)
  const codex = createCodex({ command: FAKE, groups: GROUPS, env })
  const settings = { groups: GROUPS, quotaLifeMinutes: 10 }
  const t0 = Date.parse('2026-10-29T21:00:00Z')
  assert.equal(readGroups(codex, { harness: 'codex', settings, dataDir, now: t0 }).cached, false)
  assert.equal(readGroups(codex, { harness: 'codex', settings, dataDir, now: t0 + 5 * MIN }).cached, true)
  assert.equal(readGroups(codex, { harness: 'codex', settings, dataDir, now: t0 + 11 * MIN }).cached, false)
  assert.equal(appServerLog(env).filter((entry) => entry.methods.length === 1).length, 2, 'two servers were started, not three')
})

test('the shared lane environment never names the real codex (Global Constraints)', (t) => {
  const env = require('./lane-fixtures.js').laneEnv(t)
  assert.equal(JSON.parse(fs.readFileSync(env.AETHER_LANES_CONFIG, 'utf8')).harnesses.codex.command, '/nowhere/codex')
})

test('no code of the reader opens the owner\'s credentials or names an API key', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'harness', 'codex-quota.js'), 'utf8')
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  assert.equal(/auth\.json|OPENAI_API_KEY|CODEX_HOME/.test(code), false)
})
```

**Acceptance:** both windows are read with their share left and reset, with only the three protocol methods; every failure of the server is an error naming `codex rate limits`; a server that hangs is killed within the timeout; the saved reading lives `quotaLifeMinutes` and not more; `laneEnv` points Codex at `/nowhere/codex`; `npm test` is green.

### Task 3: Los pares de Codex, el costo estimado y los escalones

**Aether:**
- Area: data
- Owns: `plugins/aether/config/pairs.json`, `plugins/aether/lib/pairs.js`, `tests/codex-pairs.test.js`, `tests/pairs.test.js`, `tests/seats.test.js`
- Depends on: none
- Merges with: Task 4, Task 5
- Serves: R12, R13, R17, R18

**Interfaces:**

15 rows in `config/pairs.json` (`pairs` array, after the Muse rows), shape of the existing external rows plus two optional fields:

```json
{ "id": "codex/gpt-6.1-terra@medium", "slug": "gpt-6-1-terra-medium", "harness": "codex", "model": "gpt-6.1-terra", "family": "gpt-6.1-terra", "effort": "medium", "group": "codex",
  "intelligence": 38.1, "costPerTaskUsd": 0.058, "outputTokensPerSecond": 91.1, "timeToFirstTokenS": 2.4,
  "checked": "2026-10-29", "costEstimate": "<the method of plan D5 in one sentence: the model's anchor, U(e) over U(max), and that Terra's anchor is Sol's times the output-price ratio>" }
```

The figures (AA of 2026-10-29; `slug` of the `max` row is the base slug; speed and time to first token come from `specs/022-codex-harness/evidence/aa-api-2026-10-29.json` (`tokens_per_s`, `ttft_s`; a 0 there is `null`), rounded to one decimal):

| id | slug | intelligence | tokens/s | TTFT s |
|---|---|---|---|---|
| `codex/gpt-6.1-sol@low` | `gpt-6-1-sol-low` | 34.5 | 57.0 | 1.9 |
| `codex/gpt-6.1-sol@medium` | `gpt-6-1-sol-medium` | 46.1 | 57.1 | 3.5 |
| `codex/gpt-6.1-sol@high` | `gpt-6-1-sol-high` | 50.2 | 67.7 | 27.8 |
| `codex/gpt-6.1-sol@xhigh` | `gpt-6-1-sol-xhigh` | 52.3 | 72.7 | 71.0 |
| `codex/gpt-6.1-sol@max` | `gpt-6-1-sol` | 54.5 | 83.5 | 183.4 |
| `codex/gpt-6.1-terra@low` | `gpt-6-1-terra-low` | 29.2 | 90.9 | 1.6 |
| `codex/gpt-6.1-terra@medium` | `gpt-6-1-terra-medium` | 38.1 | 91.1 | 2.4 |
| `codex/gpt-6.1-terra@high` | `gpt-6-1-terra-high` | 42.3 | 91.4 | 10.4 |
| `codex/gpt-6.1-terra@xhigh` | `gpt-6-1-terra-xhigh` | 45.0 | 90.9 | 35.8 |
| `codex/gpt-6.1-terra@max` | `gpt-6-1-terra` | 51.0 | 91.0 | 165.6 |
| `codex/gpt-6-luna@low` | `gpt-6-luna-low` | 9.7 | 114.6 | 2.7 |
| `codex/gpt-6-luna@medium` | `gpt-6-luna-medium` | 18.3 | null | null |
| `codex/gpt-6-luna@high` | `gpt-6-luna-high` | 21.4 | 113.8 | 12.0 |
| `codex/gpt-6-luna@xhigh` | `gpt-6-luna-xhigh` | 23.3 | 116.0 | 20.9 |
| `codex/gpt-6-luna@max` | `gpt-6-luna` | 27.8 | 109.2 | 96.2 |

`costPerTaskUsd` of every row is the cost of plan D5: `Math.round(anchor(model) * U(e) / U('max') * 1000) / 1000`, in that order of operations, where `U(e)` is the median, over the rows of `pairs.json` with `harness` `claude` or `grok` and a numeric `costPerTaskUsd` and the same effort, of `costPerTaskUsd / outputPrice(row.model)`, `outputPrice` is the `output` of `config/prices.json` for the model (`haiku`, `sonnet`, `opus`, `grok-4.7`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`), and `anchor` is 0.724 for `gpt-6.1-sol` and 0.068 for `gpt-6-luna` (the costs AA measured at `max` on 2026-10-26, `evidence/aa-cost-per-task-2026-10-26.md`) and `0.724 * outputPrice('gpt-6.1-terra') / outputPrice('gpt-6.1-sol')` for `gpt-6.1-terra`. The values are Sol 0.065, 0.115, 0.216, 0.38, 0.724; Terra 0.032, 0.058, 0.108, 0.19, 0.362; Luna 0.006, 0.011, 0.02, 0.036, 0.068 (low to max). The two `max` rows of Sol and Luna carry the measured cost and **no** `costEstimate`; the other 13 rows carry it. Do not adjust any value by hand. If the Lead removed the Sol max pair after step 0 (Codex rejects `max`), this task does not write the rows of that effort for the model Codex rejects and the tests below drop them.

`lib/pairs.js` `validatePair` accepts `checked` and `costEstimate` as optional fields, each a non-empty string when present, with the same message shape as `ownerDecision`: `<label>: checked must be a non-empty string when present`.

**Tests (write first):** `tests/codex-pairs.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const { pairs } = loadPairs()
const prices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'prices.json'), 'utf8'))
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const AA = {
  'gpt-6.1-sol': { base: 'gpt-6-1-sol', points: [34.5, 46.1, 50.2, 52.3, 54.5] },
  'gpt-6.1-terra': { base: 'gpt-6-1-terra', points: [29.2, 38.1, 42.3, 45.0, 51.0] },
  'gpt-6-luna': { base: 'gpt-6-luna', points: [9.7, 18.3, 21.4, 23.3, 27.8] },
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[middle - 1] + sorted[middle]) / 2
}
const outputPrice = (model) => prices.models[model].output
// What AA measured at `max` on 2026-10-26 (evidence/aa-cost-per-task-2026-10-26.md): these two rows carry it with no estimate mark.
const MEASURED = { 'codex/gpt-6.1-sol@max': 0.724, 'codex/gpt-6-luna@max': 0.068 }
const ANCHOR = { 'gpt-6.1-sol': 0.724, 'gpt-6-luna': 0.068, 'gpt-6.1-terra': 0.724 * outputPrice('gpt-6.1-terra') / outputPrice('gpt-6.1-sol') }

test('the table has the fifteen pairs of Sol, Terra and Luna with the figures of AA of 2026-10-29 and their date (R12)', () => {
  assert.equal(pairs.filter((pair) => pair.harness === 'codex').length, 15)
  for (const [model, { base, points }] of Object.entries(AA)) {
    EFFORTS.forEach((effort, i) => {
      const row = pairs.find((pair) => pair.id === `codex/${model}@${effort}`)
      assert.ok(row, `${model} at ${effort}`)
      assert.deepEqual([row.harness, row.group, row.family, row.model, row.effort], ['codex', 'codex', model, model, effort])
      assert.equal(row.slug, effort === 'max' ? base : `${base}-${effort}`)
      assert.equal(row.intelligence, points[i])
      assert.equal(row.checked, '2026-10-29')
      if (MEASURED[row.id] === undefined) assert.ok(typeof row.costEstimate === 'string' && row.costEstimate.length > 0, 'the estimate is marked in its row')
      else assert.equal(row.costEstimate, undefined, 'a measured cost carries no estimate mark')
      assert.equal(typeof row.costPerTaskUsd, 'number')
    })
  }
})

test('the cost of each pair is the measured one or the anchored estimate of the A96 curve method, recomputed from the table (R13)', () => {
  const units = pairs.filter((pair) => (pair.harness === 'claude' || pair.harness === 'grok') && typeof pair.costPerTaskUsd === 'number')
  const curve = Object.fromEntries(EFFORTS.map((effort) => [effort, median(units.filter((pair) => pair.effort === effort).map((pair) => pair.costPerTaskUsd / outputPrice(pair.model)))]))
  const expectedCurve = { low: 0.0375, medium: 0.067, high: 0.1255, xhigh: 0.2205, max: 0.42 }
  for (const effort of EFFORTS) assert.ok(Math.abs(curve[effort] - expectedCurve[effort]) < 1e-9, `${effort}: ${curve[effort]}`)
  for (const row of pairs.filter((pair) => pair.harness === 'codex')) {
    assert.equal(row.costPerTaskUsd, Math.round((ANCHOR[row.model] * curve[row.effort] / curve.max) * 1000) / 1000, row.id)
    if (MEASURED[row.id] !== undefined) assert.equal(row.costPerTaskUsd, MEASURED[row.id], `${row.id} keeps the cost AA measured`)
  }
})

// Every cupo renews at the same moment, so only the cost and the points decide.
const open = { usable: true, unknown: false, mark: null, resetsAt: '2026-10-30T00:00:00.000Z' }
const view = (group) => ({ installed: true, groups: { [group]: open } })
const CODEX_ONLY = { codex: view('codex') }
const ALL = { agy: { installed: true, groups: { argon: open, flash: open, claude: open } }, grok: view('grok'), muse: view('muse'), codex: view('codex') }
const picked = (model, effort, harnesses) => choose({ pairs, reference: { model, effort }, harnesses }).picked?.id ?? null

test('C6: with Codex alone the rule puts the first step on Terra medium, its correction on Terra high, Sonnet high on Sol medium and Opus high on Sol max (R17)', () => {
  assert.equal(picked('haiku', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@medium')
  assert.equal(picked('haiku', 'xhigh', CODEX_ONLY), 'codex/gpt-6.1-terra@high')
  assert.equal(picked('sonnet', 'high', CODEX_ONLY), 'codex/gpt-6.1-sol@medium')
  assert.equal(picked('opus', 'high', CODEX_ONLY), 'codex/gpt-6.1-sol@max')
})

test('R17: with the four harnesses open on the same reset, the pair the rule chooses by cost is fixed, for the brief to report', () => {
  assert.equal(picked('haiku', 'high', ALL), 'codex/gpt-6.1-terra@medium')
  assert.equal(picked('haiku', 'xhigh', ALL), 'codex/gpt-6.1-terra@high', '0.108 against agy Sonnet medium at 0.48')
  assert.equal(picked('sonnet', 'high', ALL), 'codex/gpt-6.1-sol@medium')
  assert.equal(picked('opus', 'high', ALL), 'codex/gpt-6.1-sol@max', '0.724 (measured) against agy Opus high at 1.82')
})

test('R18: Luna max is in the table and no native reference reaches it, so it never wins', () => {
  assert.ok(pairs.some((pair) => pair.id === 'codex/gpt-6-luna@max'))
  for (const reference of pairs.filter((pair) => pair.harness === 'claude')) {
    const id = picked(reference.model, reference.effort, CODEX_ONLY)
    assert.ok(id === null || !id.startsWith('codex/gpt-6-luna'), `${reference.id} -> ${id}`)
  }
})
```

`tests/pairs.test.js` changes with the 15 new rows (the table goes from 35 to 50 rows): at lines 32, 35 and 90 (`assert.equal(pairs.length, 35)`, `assert.equal(new Set(pairs.map((p) => p.id)).size, 35)` and `assert.equal(loadPairs(write('ok.json', good)).pairs.length, 35)`) change 35 to 50; rename the title of the first test (line 20) to end with "and the fifteen pairs of Codex"; and add to it `assert.equal(pairs.filter((p) => p.harness === 'codex').length, 15)`. It also gains (it already reads `config/pairs.json` through `loadPairs`; add the imports it lacks):

```js
test('checked and costEstimate are optional non-empty strings of a pair', (t) => {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json'), 'utf8'))
  const file = path.join(tempDir(t), 'pairs.json')
  for (const field of ['checked', 'costEstimate']) {
    for (const bad of ['', 3, null]) {
      const table = structuredClone(base)
      table.pairs.find((pair) => pair.harness === 'codex')[field] = bad
      fs.writeFileSync(file, JSON.stringify(table))
      assert.throws(() => loadPairs(file), new RegExp(`${field} must be a non-empty string when present`))
    }
  }
})
```

`tests/seats.test.js` (line 332, case `{ AETHER_LANE_HARNESSES: 'codex' }` of the test "nothing runs, and the native agent takes the seat, when the external one cannot"): once Codex pairs exist, `chooseSeat` no longer drops them all as `harness-off` or `not-offered` (the listing of Task 4 offers them; `laneEnv` of Task 2 points `codex` at `/nowhere/codex`, so they are barred as `not-installed`, or as `role` since the judge is not a Codex role). Change the check of `tried` to `tried.length > 0 && tried.every((entry) => ['harness-off', 'not-offered', 'not-installed', 'role'].includes(entry.why))`. Nothing else of the test changes: the native judge still takes the seat (`r.json.native.agent` is `aether:judge`) and no turn runs.

**Acceptance:** the table has the 15 rows with the figures above; every cost is the measured one (Sol max, Luna max) or the anchored estimate of the formula, marked in `costEstimate` (the test recomputes it); the four choices of each table in the tests above hold; the validation rejects an empty `checked` or `costEstimate`; the other pairs are untouched; `tests/pairs.test.js` and `tests/seats.test.js` hold with the 50 rows; with Tasks 4 and 5, `npm test` is green.

### Task 4: El índice de modelos de Codex: lista, excluidos, perfiles y precios

**Aether:**
- Area: data
- Owns: `plugins/aether/config/models/harness-models.json`, `plugins/aether/config/models/profiles.json`, `plugins/aether/config/models/models.json`, `plugins/aether/config/prices.json`, `docs/models/README.md`, `scripts/build-models-index.js`, `tests/codex-models.test.js`, `tests/models-index.test.js`, `tests/prices.test.js`, `tests/copies-harness-config.test.js`
- Depends on: none
- Merges with: Task 3, Task 5
- Serves: R14, R15, R16, R12

**Interfaces:**

`harness-models.json` `harnesses.codex` (new entry, after `agy`):

```json
{ "capturedAt": "2026-10-29", "listedBy": "models_cache.json of ~/.codex (codex 0.166.0 has no command that lists models)", "effortVia": "flag",
  "efforts": ["low", "medium", "high", "xhigh", "max"],
  "excludedEfforts": { "ultra": "<reason: Artificial Analysis does not measure it, so it has no figure to compare; the owner's words: “no efforts AA does not measure”>" },
  "note": "<the day, the version, the 10 models the account lists, plan Plus>",
  "models": [ "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna",
    { "id": "gpt-6-astra", "excluded": "<reason>" }, { "id": "gpt-6-sol", "excluded": "<reason>" }, { "id": "gpt-5.6-sol", "excluded": "<reason>" },
    { "id": "gpt-5.6-terra", "excluded": "<reason>" }, { "id": "gpt-5.6-luna", "excluded": "<reason>" },
    { "id": "gpt-reserve", "excluded": "<reason>" }, { "id": "codex-auto-review", "excluded": "<reason>" } ] }
```

The reasons: `gpt-6-astra` says the top tier waits for its next generation, quotes the owner («no lo vamos a usar hasta que salga astra 6.1»), says that GPT-6.1 Astra reopens the question as Fable 5.5 reopens Fable 5.1 (A43), and gives the figures (Astra max 56.9 against Sol max 54.5, at five times the price per token: 10/50 against 2/10); `gpt-6-sol` and `gpt-5.6-*` say that they are an older generation of the line (the newest of each line only); `gpt-reserve` and `codex-auto-review` say that Codex hides them (internal models). `gpt-6.1-sol`/`-terra` list `ultra` among the efforts Codex gives, which `excludedEfforts` leaves out. `capturedAt` and the ten ids come from `specs/022-codex-harness/evidence/codex-models-2026-10-29.json` (read it, do not write there).

`profiles.json`: one profile for every Codex model that appears in `models.json` (in use or excluded) with the shape of the existing ones (`name`, `maker: "OpenAI"`, `purpose` quoting Codex's own description from the evidence file (`«Latest workhorse model for coding and everyday work.»`, `«GPT-6.1 Terra Codex model.»`, `«Fast and affordable model for easier tasks.»`, …), `contextTokens` (Sol 500000, Terra 500000, Luna 272000, the others as the evidence file says), `efforts`, `price`, `sources` (the evidence file), `checked: "2026-10-29"`), keyed as the file says: the AA family key when there is one, else the harness model id.

`prices.json`: `models["gpt-6.1-sol"] = { ids: ["gpt-6.1-sol"], input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2, cacheWrite1h: 2, checked: "2026-10-29" }`, `models["gpt-6.1-terra"]` the same with 1, 5, 0.1, 1, 1, and `models["gpt-6-luna"]` with 0.1, 0.5, 0.01, 0.1, 0.1; `sources` for the three: `specs/022-codex-harness/evidence/aa-api-2026-10-29.json` (AA's `price_in` and `price_out`); the cache prices are a stated assumption (10 % of the input price for a read, the input price for a write), written in `basis` or in a `note`.

**Where the Terminal-Bench figure of each effort lives (R12):** in the `scores` of `models.json` (`terminalBench`, a share), which the script writes from the AA list; `config/pairs.json` has no such field and `lib/pairs.js` does not get one. `config/lanes.json` keeps the `max` figure in `aa.terminalBench` (Task 5). `tests/codex-models.test.js` asserts the 15 values.

`models.json` and the generated part of `docs/models/README.md`: produced by the script and **spliced**, not regenerated: run
`node scripts/build-models-index.js --from specs/022-codex-harness/evidence/aa-api-2026-10-29.json --harnesses claude,agy,codex,grok,muse --write --out <temp dir> --docs <temp dir 2>` and copy into the committed files only the records with `harness: "codex"` (the `models` and the `excluded` arrays), the name `codex` in the `harnesses` array, `listedOn.codex` (`"2026-10-29"`), and the rows and lines of Codex in the README between its markers. Every other record of both files stays byte for byte as it is (the AA figures of 2026-10-26 of the other harnesses are P1 of the plan and do not change here). `scripts/build-models-index.js`: `DEFAULT_HARNESSES = ['claude', 'agy', 'codex', 'grok', 'muse']`.

**Tests (write first):** `tests/codex-models.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { loadPrices, priceEntry, ratesFor } = require('../plugins/aether/lib/prices.js')

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const listing = read('models', 'harness-models.json').harnesses.codex
const index = read('models', 'models.json')
const profiles = read('models', 'profiles.json').profiles
const IN_USE = ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna']
const OUT = ['gpt-6-astra', 'gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-reserve', 'codex-auto-review']
const POINTS = {
  'gpt-6.1-sol': [34.5, 46.1, 50.2, 52.3, 54.5],
  'gpt-6.1-terra': [29.2, 38.1, 42.3, 45.0, 51.0],
  'gpt-6-luna': [9.7, 18.3, 21.4, 23.3, 27.8],
}
// Terminal-Bench 4.0 of AA (2026-10-29, evidence/README.md section 2, as a share: 30.8 % is 0.308), effort by effort.
const TERMINAL = {
  'gpt-6.1-sol': [0.308, 0.48, 0.515, 0.54, 0.561],
  'gpt-6.1-terra': [0.152, 0.323, 0.419, 0.465, 0.556],
  'gpt-6-luna': [0, 0.025, 0.045, 0.081, 0.126],
}
const idOf = (entry) => (typeof entry === 'string' ? entry : entry.id)

test('the listing of the CLI is captured on its day with the ten models, and everything left out has its reason (R16)', () => {
  assert.equal(listing.capturedAt, '2026-10-29')
  assert.deepEqual(listing.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(listing.models.map(idOf).sort(), [...IN_USE, ...OUT].sort())
  for (const entry of listing.models.filter((item) => OUT.includes(idOf(item)))) {
    assert.ok(typeof entry.excluded === 'string' && entry.excluded.length > 20, idOf(entry))
  }
  for (const id of IN_USE) assert.equal(typeof listing.models.find((item) => idOf(item) === id) === 'string' || !listing.models.find((item) => idOf(item) === id).excluded, true, id)
  const astra = listing.models.find((item) => idOf(item) === 'gpt-6-astra').excluded
  assert.ok(astra.includes('no lo vamos a usar hasta que salga astra 6.1'))
  assert.ok(/GPT-6\.1 Astra/.test(astra) && /Fable 5\.1/.test(astra) && /A43/.test(astra))
  assert.ok(/hidden|internal/i.test(listing.models.find((item) => idOf(item) === 'gpt-reserve').excluded))
  assert.ok(/hidden|internal/i.test(listing.models.find((item) => idOf(item) === 'codex-auto-review').excluded))
  assert.ok(/generation/i.test(listing.models.find((item) => idOf(item) === 'gpt-6-sol').excluded))
  assert.ok(typeof listing.excludedEfforts.ultra === 'string' && /Artificial Analysis/.test(listing.excludedEfforts.ultra))
})

test('the index lists Sol, Terra and Luna at the five efforts with the figures of AA of 2026-10-29, and the others as excluded with their reason (R12, R16)', () => {
  assert.ok(index.harnesses.includes('codex'))
  assert.equal(index.listedOn.codex, '2026-10-29')
  const used = index.models.filter((model) => model.harness === 'codex')
  assert.deepEqual(used.map((model) => model.model).sort(), [...IN_USE].sort())
  for (const model of used) {
    assert.deepEqual(model.scores.map((score) => score.effort), ['low', 'medium', 'high', 'xhigh', 'max'])
    assert.deepEqual(model.scores.map((score) => score.intelligence), POINTS[model.model])
    assert.deepEqual(model.scores.map((score) => score.terminalBench), TERMINAL[model.model], 'Terminal-Bench lives in the scores of the index, one figure for each effort')
  }
  const sol = used.find((model) => model.model === 'gpt-6.1-sol')
  assert.deepEqual([sol.scores[0].priceInput, sol.scores[0].priceOutput], [2, 10])
  const excluded = index.excluded.filter((entry) => entry.harness === 'codex')
  assert.deepEqual(excluded.map((entry) => entry.model).sort(), [...OUT].sort())
  assert.ok(excluded.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 20))
  const haiku = index.models.find((model) => model.harness === 'claude' && model.alias === 'haiku')
  assert.equal(haiku.scores.find((score) => score.effort === 'high').intelligence, 37.8, 'the figures of the other harnesses are not refreshed here')
})

test('every Codex model of the index has a profile of OpenAI with its context (R14)', () => {
  const context = { 'gpt-6.1-sol': 500000, 'gpt-6.1-terra': 500000, 'gpt-6-luna': 272000 }
  for (const model of index.models.filter((item) => item.harness === 'codex')) {
    assert.equal(model.profile.contextTokens, context[model.model], model.model)
    assert.equal(model.maker, 'OpenAI')
  }
  for (const entry of index.excluded.filter((item) => item.harness === 'codex')) assert.ok(entry.profile, entry.model)
  assert.ok(Object.keys(profiles).length > 0)
})

test('the prices per million tokens are Sol 2/10, Terra 1/5 and Luna 0.1/0.5, and a lane call is priced from them (R14)', () => {
  const prices = loadPrices()
  assert.deepEqual([prices.models['gpt-6.1-sol'].input, prices.models['gpt-6.1-sol'].output], [2, 10])
  assert.deepEqual([prices.models['gpt-6.1-terra'].input, prices.models['gpt-6.1-terra'].output], [1, 5])
  assert.deepEqual([prices.models['gpt-6-luna'].input, prices.models['gpt-6-luna'].output], [0.1, 0.5])
  assert.ok(ratesFor(prices, 'gpt-6.1-sol'))
  const MILLION = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0 }
  assert.ok(Math.abs(priceEntry({ model: 'gpt-6.1-sol', agent: 'lane', ...MILLION }, prices) - (2 + 10 + 0.2)) < 1e-9)
})

test('the script, run on the saved AA list, reproduces the committed Codex records and finds every model profiled (R14, R16)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-models-'))
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-models-docs-'))
  const run = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'build-models-index.js'),
    '--from', path.join(ROOT, 'specs', '022-codex-harness', 'evidence', 'aa-api-2026-10-29.json'),
    '--harnesses', 'claude,agy,codex,grok,muse', '--write', '--out', out, '--docs', docs,
  ], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const built = JSON.parse(fs.readFileSync(path.join(out, 'models.json'), 'utf8'))
  const ofCodex = (list) => list.filter((entry) => entry.harness === 'codex').sort((a, b) => a.model.localeCompare(b.model))
  assert.deepEqual(ofCodex(index.models), ofCodex(built.models))
  assert.deepEqual(ofCodex(index.excluded), ofCodex(built.excluded))
})
```

`tests/models-index.test.js`: the test «by default the native harness and the lanes agy and grok are read…» (line 244) and any other assertion on `DEFAULT_HARNESSES` or on the committed index that Codex's records break change only to say that Codex is read by default too; list the changed lines in the report. `tests/prices.test.js` changes only an assertion on the set of models/sources of `prices.json` if one breaks. `tests/copies-harness-config.test.js` pins `CHOSEN = ['claude', 'agy', 'grok', 'muse']` as the `harnesses` of `models.json`, as `DEFAULT_HARNESSES` of the script and as the keys of `harness-models.json` (lines 36 to 41): `CHOSEN` becomes `['claude', 'agy', 'codex', 'grok', 'muse']` and the comment «three lanes» says four; no other line of that file changes. List both changes in the report.

**Acceptance:** `harness-models.json` captures the ten models with the seven exclusions and `ultra` with their reasons; the three models have profiles and prices and their 15 Terminal-Bench figures in `models.json`; `models.json` and the README have the Codex records spliced and every other record unchanged; `tests/lane-table-index.test.js` (pairs and index agree) passes together with Tasks 3 and 5; `npm test` is green.

### Task 5: Los modelos de Codex en la tabla de lanes

**Aether:**
- Area: data
- Owns: `plugins/aether/config/lanes.json`, `tests/codex-lanes.test.js`
- Depends on: none
- Merges with: Task 3, Task 4
- Serves: R15, R12

**Interfaces:**

`config/lanes.json` `harnesses.codex.models` (today `{}`), same entry shape as the other models; the rest of the entry (`command`, `waitSeconds`, `quotaLifeMinutes`, `timeouts`, `groups`) does not change:

```json
"gpt-6.1-sol":   { "group": "codex", "roles": ["implementer", "supervisor", "reviewer"], "aa": { "slug": "gpt-6-1-sol",   "intelligence": 54.5, "terminalBench": 0.561, "checked": "2026-10-29" }, "note": "<one paragraph>" },
"gpt-6.1-terra": { "group": "codex", "roles": ["implementer", "supervisor"],             "aa": { "slug": "gpt-6-1-terra", "intelligence": 51.0, "terminalBench": 0.556, "checked": "2026-10-29" }, "note": "<one paragraph>" },
"gpt-6-luna":    { "group": "codex", "roles": ["implementer"],                           "aa": { "slug": "gpt-6-luna",    "intelligence": 27.8, "terminalBench": 0.126, "checked": "2026-10-29" }, "note": "<one paragraph>" }
```

The `note` of each says which tier of the ladder it serves (Terra medium and high: the first step and its correction; Sol medium: the step of Sonnet high; Sol max: the step of Opus high; Luna max is 1.8 points and 9 code points below Haiku high and is not a starting step), that the figures are the `max` row of AA of 2026-10-29 and that the table of pairs holds the other efforts, and that the roles follow plan D4 (nothing judges what AA does not measure; the seats Judge, Writer and Examiner are not given). The note of Sol also says that the models Codex lists and the exclusions are in `config/models/harness-models.json`.

**Tests (write first):** `tests/codex-lanes.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const lanes = require('../plugins/aether/lib/lanes.js')

const table = lanes.loadConfig(lanes.CONFIG_FILE)
const codex = table.harnesses.codex

test('the lane table gives Codex its three models in its one quota group (R15)', () => {
  assert.equal(codex.command, 'codex')
  assert.deepEqual(codex.groups, { codex: 'Codex plan' })
  assert.deepEqual(Object.keys(codex.models).sort(), ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6.1-terra'])
  for (const model of Object.values(codex.models)) {
    assert.equal(model.group, 'codex')
    assert.ok(typeof model.note === 'string' && model.note.length > 40)
    assert.equal(model.aa.checked, '2026-10-29')
  }
})

test('the roles follow the plan: Sol implements, supervises and reviews, Terra implements and supervises, Luna implements, and nobody takes a design seat (R15)', () => {
  assert.deepEqual(codex.models['gpt-6.1-sol'].roles, ['implementer', 'supervisor', 'reviewer'])
  assert.deepEqual(codex.models['gpt-6.1-terra'].roles, ['implementer', 'supervisor'])
  assert.deepEqual(codex.models['gpt-6-luna'].roles, ['implementer'])
  for (const model of Object.values(codex.models)) for (const seat of ['judge', 'writer', 'examiner']) assert.equal(model.roles.includes(seat), false, seat)
})

test('the figures of AA of the table are those of the max row of 2026-10-29', () => {
  assert.deepEqual(codex.models['gpt-6.1-sol'].aa, { slug: 'gpt-6-1-sol', intelligence: 54.5, terminalBench: 0.561, checked: '2026-10-29' })
  assert.deepEqual(codex.models['gpt-6.1-terra'].aa, { slug: 'gpt-6-1-terra', intelligence: 51, terminalBench: 0.556, checked: '2026-10-29' })
  assert.deepEqual(codex.models['gpt-6-luna'].aa, { slug: 'gpt-6-luna', intelligence: 27.8, terminalBench: 0.126, checked: '2026-10-29' })
})
```

If the Lead removed a model's `max` pair after step 0, the `aa` figures of that model are those of the highest effort that remains, and this test says so.

**Acceptance:** the table validates (`lanes.loadConfig`), has the three models with the roles above, and the other harnesses' entries are untouched; with Tasks 3 and 4, `tests/lane-table-index.test.js` and `npm test` are green.

### Task 6: Codex en las listas fijas de los delegados y del router

**Aether:**
- Area: router
- Owns: `plugins/aether/lib/router-quota.js`, `plugins/aether/lib/router-renewal.js`, `plugins/aether/lib/router-pick.js`, `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/bin/aether-delegate`, `tests/router-pick.test.js`, `tests/router-quota.test.js`, `tests/router-renewal.test.js`, `tests/delegate-calls.test.js`, `tests/codex-lists.test.js`
- Depends on: Task 1 — el `codex` simulado que usa la prueba del delegado de lectura
- Serves: R3, R20, R8, R10

**Interfaces:**

```text
// the five lists, in the order of the registry, without cursor
EXTERNAL            (lib/router-quota.js,   exported)  = ['agy', 'codex', 'grok', 'muse']
RENEWABLE           (lib/router-renewal.js, exported)  = ['agy', 'codex', 'grok', 'muse']
DELEGATE_HARNESSES  (lib/router-pick.js,    exported)  = ['agy', 'codex', 'grok', 'muse']
HARNESSES           (lib/delegate-calls.js, newly exported) = ['agy', 'codex', 'grok', 'muse']
ALLOWED_HARNESSES   (lib/lane-delegate.js,  exported)  = ['agy', 'codex', 'grok', 'muse']
```

Texts that change: the error of `renewReading` becomes `the router renews only agy, codex, grok or muse`; the usage of `bin/aether-delegate` becomes `renew --harness <agy|codex|grok|muse>` (its header comment and the line `// aether-delegate renew --harness <agy|codex|grok|muse>` too) and its error `--harness needs agy, codex, grok or muse`; the comments of `router-pick.js` (line 14) and `delegate-calls.js` (lines 3 and 24) that said «codex and cursor cannot» say that cursor cannot. `lib/lane-pick.js` `REFRESHABLE` is not touched: Codex's reading is free and the adapter takes it, so it has no refresher. Cursor stays out of every list.

**Tests (write first):**

`tests/codex-lists.test.js` (new):

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EXTERNAL } = require('../plugins/aether/lib/router-quota.js')
const { RENEWABLE } = require('../plugins/aether/lib/router-renewal.js')
const { DELEGATE_HARNESSES } = require('../plugins/aether/lib/router-pick.js')
const { HARNESSES } = require('../plugins/aether/lib/delegate-calls.js')
const { ALLOWED_HARNESSES } = require('../plugins/aether/lib/lane-delegate.js')

const WORKERS = ['agy', 'codex', 'grok', 'muse']

test('the five lists of the delegates and the router name Codex in the order of the registry, and cursor in none (R3, R20)', () => {
  for (const list of [EXTERNAL, RENEWABLE, DELEGATE_HARNESSES, HARNESSES, ALLOWED_HARNESSES]) assert.deepEqual(list, WORKERS)
})

test('aether-delegate renew names codex among the harnesses it renews (R20)', () => {
  const bin = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate'), 'utf8')
  assert.ok(bin.includes('renew --harness <agy|codex|grok|muse>'))
  assert.ok(bin.includes('--harness needs agy, codex, grok or muse'))
  assert.equal(/codex and cursor (cannot|are not)/.test(bin), false)
})
```

`tests/router-pick.test.js` (the file's own small `PAIRS` table and `setup`; `config` is a copy of the real lane table). Add after the `MUSE` constant and to `PAIRS`/`config`:

```js
// Codex: one model with the three roles in the copy of the table, one pair, and a reading whose weekly window renews in `hours`.
config.harnesses.codex.models = { 'gpt-6.1-sol': { group: 'codex', roles: ['implementer', 'supervisor', 'reviewer'] } }
const CODEX = (hours, remaining = 0.9) => ({ readAt: NOW - MIN, groups: { codex: { windows: { '5h': win(1, 5), weekly: win(remaining, hours) } } } })
// and in PAIRS, after the Muse rows:
//   external('codex', 'gpt-6.1-sol', 'medium', 'codex', 46.1, 0.115),
const ALL_FOUR = ['agy', 'codex', 'grok', 'muse']
const GOOD = { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: GROK, muse: MUSE }
```

Changed tests:
- «the harnesses a delegate may run on are agy, grok and muse, and codex and cursor are not» becomes «the harnesses a delegate may run on are agy, codex, grok and muse, and cursor is not» and asserts `assert.deepEqual(DELEGATE_HARNESSES, ['agy', 'codex', 'grok', 'muse'])`.
- «a harness that is not enabled or not installed gives nothing, and codex is never a candidate» becomes «…, and cursor is never a candidate»: its second part enables `['agy', 'codex', 'cursor']` with no Codex reading; it asserts `second.pick.harness === 'agy'`, that every `second.quota` harness is in `['agy', 'codex', 'grok', 'muse']`, that `second.quota.find((c) => c.harness === 'codex').why === 'no-reading'` and that grok is `harness-off`.

New tests:

```js
test('Codex takes a call when it is enabled and its quota is the one that renews first, at its pair that reaches the points (R20)', async () => {
  const s = setup({ settings: { harnesses: ALL_FOUR }, readings: { ...GOOD, codex: CODEX(10) } })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'codex/gpt-6.1-sol@medium')
  assert.deepEqual(s.renewed, [])
})

test('with Codex under the reserve, not installed or its reading missing, the next quota takes the call (R8, R20)', async () => {
  const dry = setup({ settings: { harnesses: ALL_FOUR }, readings: { ...GOOD, codex: CODEX(10, 0.02) } })
  const afterDry = await pairStep(dry.d, dry.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(afterDry), 'grok/grok-4.7@high')
  assert.equal(afterDry.quota.find((c) => c.harness === 'codex').why, 'dry')
  const gone = setup({ settings: { harnesses: ALL_FOUR }, readings: { ...GOOD, codex: CODEX(10) }, installed: (name) => name !== 'codex' })
  const afterGone = await pairStep(gone.d, gone.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(afterGone), 'grok/grok-4.7@high')
  assert.equal(afterGone.quota.find((c) => c.harness === 'codex').why, 'not-installed')
  const missing = setup({ settings: { harnesses: ALL_FOUR }, readings: { ...GOOD, codex: null } })
  const afterMissing = await pairStep(missing.d, missing.merged, { reference: SONNET_HIGH })
  assert.deepEqual(missing.renewed, ['codex'], 'a missing Codex reading is renewed once, like agy\'s')
  assert.equal(afterMissing.quota.find((c) => c.harness === 'codex').why, 'no-reading')
})
```

`tests/router-quota.test.js`: the assertion `staleHarnesses({ readings: { agy: null, muse: null }, config, harnesses: ['agy', 'codex', 'muse'], now: NOW })` now expects `['agy', 'codex', 'muse']` (message “only agy, codex, grok and muse are asked about”). `tests/router-renewal.test.js`: the assertion at line 19, `assert.deepEqual(renewal.RENEWABLE, ['agy', 'grok', 'muse'])`, now expects `['agy', 'codex', 'grok', 'muse']`; the title at line 89 «renews only agy, grok and muse» becomes «renews only agy, codex, grok and muse»; the assertion that `renewReading({ harness: 'codex', … })` rejects becomes `harness: 'cursor'` rejecting `/agy, codex, grok or muse/`; the list `['codex', 'cursor', '../agy', '']` of the test «a process that cannot start leaves no lock, and a harness that is not agy, grok or muse is never renewed» becomes `['cursor', '../agy', '']` (and the title «not agy, codex, grok or muse»); add, mirroring the existing `startRenewal` test of agy with a stub `spawn`, one for `harness: 'codex'` that starts a renewal.

`tests/delegate-calls.test.js`: add «a read-only delegate runs on codex with the model of the pair, and its answer comes back», a copy of the existing test «a read-only delegate runs on muse with the model of the pair, and its answer comes back» with Codex: the lane table of the test gets `config.harnesses.codex = { command: <fake-codex path>, groups: { codex: 'Codex plan' }, quotaLifeMinutes: 10, waitSeconds: 60, timeouts: { implementer: 60, supervisor: 60, reviewer: 60 }, models: { 'gpt-6.1-terra': { group: 'codex', roles: ['implementer', 'supervisor'] } } }`, the fake script is `{ answer: '{"answer":"audited"}' }` through `AETHER_FAKE_CODEX_SCRIPT`, `AETHER_FAKE_CODEX_RATE_LIMITS` is `tests/fixtures/codex/rate-limits.json`, and it asserts `status` `ok`, the text `audited`, that the fake logged one `exec` whose `--model` is `gpt-6.1-terra` and whose cwd is the delegate's worktree. The two existing `harness: 'codex'` calls of the tests «issue 035…» and «a harness that is not installed or has no such model is unavailable…» keep their assertions: their test table has no Codex command that exists (set it to `/nonexistent/codex` in their `setup` if the real table is copied there).

**Acceptance:** the five lists are the registry's order with Codex and without cursor; the router picks, renews and falls back with Codex as with agy; the delegate on Codex runs through `codex exec` in its worktree; the error and usage texts name Codex; `npm test` is green.

### Task 7: La herramienta de humo con los cinco esfuerzos y la salida cruda

**Aether:**
- Area: tools
- Owns: `scripts/lane-smoke.js`, `tests/codex-smoke.test.js`
- Depends on: Task 1 — el `codex` simulado
- Serves: R21, R6

**Interfaces:**

```
node scripts/lane-smoke.js <harness> [<model>] [--effort low|medium|high|xhigh|max] [--raw <file>]
```

`--effort` accepts the five levels (today three; the default stays `low`). With `--raw <file>` the script writes the raw `stdout` of the call, then a line `--- stderr ---`, then its raw `stderr`, to `<file>`, and the JSON line it prints gains `"raw": "<file>"`. Without `--raw` the printed line is exactly as today. The usage line becomes `usage: node scripts/lane-smoke.js <harness> [<model>] [--effort low|medium|high|xhigh|max] [--raw <file>]`. An unknown level or a missing value after `--raw` is a usage error (exit 2).

**Tests (write first):** `tests/codex-smoke.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const { tempDir } = require('./helpers.js')

const SMOKE = path.join(__dirname, '..', 'scripts', 'lane-smoke.js')
const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')

// A lane table whose codex is the fake, and a fake that writes the file the smoke call asks for.
function setup(t) {
  fs.chmodSync(FAKE, 0o755)
  const dir = tempDir(t)
  const config = JSON.parse(fs.readFileSync(lanes.CONFIG_FILE, 'utf8'))
  config.harnesses.codex.command = FAKE
  const file = path.join(dir, 'lanes.json')
  fs.writeFileSync(file, JSON.stringify(config))
  const log = path.join(dir, 'log')
  const env = {
    ...process.env,
    AETHER_LANES_CONFIG: file,
    AETHER_FAKE_CODEX_LOG: log,
    AETHER_FAKE_CODEX_SCRIPT: JSON.stringify({ answer: '{"status":"done","file":"hello.txt"}', files: { 'hello.txt': 'lane ok\n' } }),
  }
  return { dir, env, log }
}

test('the smoke call takes the five levels, passes the level to codex as it is, and keeps the raw output when asked (R21)', (t) => {
  const { dir, env, log } = setup(t)
  const raw = path.join(dir, 'raw.txt')
  const r = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--effort', 'max', '--raw', raw], { env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const line = JSON.parse(r.stdout.trim().split('\n').at(-1))
  assert.deepEqual([line.ok, line.harness, line.model, line.effort, line.raw], [true, 'codex', 'gpt-6-luna', 'max', raw])
  const text = fs.readFileSync(raw, 'utf8')
  assert.ok(text.includes('"type":"turn.completed"'), 'the raw stdout is there')
  assert.ok(text.includes('--- stderr ---'))
  const [call] = fs.readFileSync(log, 'utf8').trim().split('\n').map((entry) => JSON.parse(entry))
  assert.ok(call.argv.includes('model_reasoning_effort=max'))
})

test('without --raw the printed line is the one of today, and an unknown level or a bare --raw is a usage error', (t) => {
  const { env } = setup(t)
  const plain = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--effort', 'xhigh'], { env, encoding: 'utf8' })
  assert.equal(plain.status, 0, plain.stdout + plain.stderr)
  assert.equal('raw' in JSON.parse(plain.stdout.trim().split('\n').at(-1)), false)
  for (const args of [['--effort', 'ultra'], ['--raw']]) {
    const bad = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', ...args], { env, encoding: 'utf8' })
    assert.equal(bad.status, 2, args.join(' '))
    assert.match(bad.stderr, /usage: node scripts\/lane-smoke\.js/)
  }
})
```

**Acceptance:** the five efforts and `--raw` work as above; the printed line without `--raw` is unchanged; the Muse smoke test in `tests/muse-lane.test.js` still passes; `npm test` is green.

### Task 8: Codex de punta a punta con el ejecutor real

**Aether:**
- Area: harness
- Owns: `tests/codex-lane.test.js`
- Depends on: Task 1 — el adaptador y el `codex` simulado
- Depends on: Task 2 — la lectura de cuota
- Depends on: Task 5 — los modelos de la tabla de lanes
- Serves: R7, R8, R11, R20, R10

**Interfaces:** none new. The tests drive the real `aether-lane` runner and `aether-lane delegate` with the lane table of the repository (`lanes.CONFIG_FILE`) whose `codex.command` is `tests/fixtures/fake-codex.js`, `AETHER_LANE_HARNESSES=codex`, the fake's rate limits file as the quota, and `OPENAI_API_KEY=secret-key` in the environment of the caller. The structure copies `tests/muse-lane.test.js` (its `museEnv`, `runImplementer`, `finishImplementer`, `callInfo` and `markFiles` helpers, renamed for Codex) and `tests/lane-delegate.test.js` (`writeBrief`, `runDelegate`). No change to any file of `plugins/aether/`: if a test reveals a defect of the runner, stop and report it with the failing test instead of editing `lib/`.

**Tests (write first):** `tests/codex-lane.test.js`, with this skeleton and these tests (the helpers `setScript`, `codexEnv`, `codexCalls`, `startImplementer`, `finishImplementer` are the Muse ones with `FAKE_CODEX`, `AETHER_FAKE_CODEX_*`, `AETHER_LANE_HARNESSES: 'codex'`, `MODEL = 'gpt-6.1-terra'`, effort `medium`, plus `OPENAI_API_KEY: 'secret-key'` and `AETHER_FAKE_CODEX_RATE_LIMITS: <rate-limits.json>`; `limits(env, mutate)` rewrites that file from the fixture):

```js
const IMPLEMENT = 'task-1-1-implement'
const DONE = { status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' }
const READY = { verdict: 'ready', findings: [], declined: [], summary: 'Ready.' }
const answering = (answer, extra = {}) => ({ answer: JSON.stringify(answer), ...extra })

test('a unit runs in Codex in its own worktree, safely, and comes back with its usage and the quota that call left (R7)', (t) => {
  const { args, env, done } = runImplementer(t, answering(DONE, { files: { 'src/t1/a.js': 'x' } }))
  assert.equal(done.status, 'ok', done.detail)
  const [call, ...others] = codexCalls(env)
  assert.equal(others.length, 0)
  assert.equal(call.cwd, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1'))
  for (const word of ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--output-schema']) assert.ok(call.argv.includes(word), word)
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'gpt-6.1-terra')
  assert.ok(call.argv.includes('model_reasoning_effort=medium'), 'the effort of the pair goes as it is')
  assert.equal(call.apiKey, null, 'the key of the caller does not reach the call')
  assert.equal(done.lane.harness, 'codex')
  assert.deepEqual([done.lane.usage.input, done.lane.usage.total], [1000, 1200])
  assert.equal(done.lane.quota.unknown, false)
  near(done.lane.quota.remaining, 0.99, 'the weekly window, the longest')
})

test('a reviewer gets the structured object it asked for, and a missing field or prose is a failed call', (t) => {
  // as the Muse test «a reviewer gets the structured object…», on gpt-6.1-sol at high, with the three scripts
  // answering(READY) -> status ok and result READY; the answer without `summary` -> failed, detail /missing /; prose -> 'no structured output'
})

test('every way a call can fail ends as a failed call with its cause and no question for the owner (R8)', (t) => {
  // not installed: command '/nowhere/codex' -> start.json deepEqual { unavailable: 'not-installed' }, nothing logged
  // no session: { exit: 1, stderr: 'Not logged in. Run codex login.\n' } -> done.status 'failed', done.detail 'exit 1: Not logged in. Run codex login.', no mark file
  // died midway: { exit: 137, stdout: <only the thread.started line> } -> 'failed', detail starts with 'exit 137', no mark file
  // no answer: { stdout: '' } -> 'failed', detail 'no result'
  // in every case the result carries no `question` for the owner and the run log has one call entry with that status and detail
})

test('a refusal for quota is the reading, not the words: the same stderr is a plain failure while the reading is healthy, and a quota failure with a mark once it shows the window full (R11)', (t) => {
  const stderr = 'You have hit your usage limit. Try again later.\n'
  // healthy reading + exit 1 + that stderr -> status 'failed', detail 'exit 1: You have hit your usage limit. Try again later.', markFiles(env) is empty
  // reading with primary.usedPercent 100 + the same script -> status 'quota', markFiles(env) has 'codex__codex.json',
  //   marks.liveMark(env.AETHER_DATA_DIR, 'codex', 'codex', Date.now()) has confirmed === true and a reason other than 'quota refusal'
})

test('the mark heals by itself: a fresh healthy reading lifts it, and a reset that has passed ends it (R11)', (t) => {
  // make the mark as in the previous test; rewrite the rate-limits file healthy; run `aether-lane quota codex --json` (runBin(fx.LANE_BIN, ...));
  // the group's `mark` is null and the group is usable. Then a mark written with `until` in the past is no live mark (marks.liveMark returns null).
})

test('the quota view and the choice treat Codex as any harness (R10)', (t) => {
  // `aether-lane quota codex --json`: harnesses.codex.installed true, version 'codex-cli 0.166.0',
  //   groups.codex.windows has the keys ['5h', 'weekly'], remaining 0.94 and 0.99, usable true, source.command 'codex'.
  // runArgs(config, pairs, { installed: () => true, enabled: ['codex'] }) lists ['codex']; idleHarnesses(...) is [] (superdelegation.js).
  // With the shipped pairs table the choice for Sonnet high with codex alone open picks codex/gpt-6.1-sol@medium (the fake is installed, the reading is healthy).
})

test('an editing delegate runs on Codex in its own worktree and comes back as a unit branch the Lead merges, and its reviewer is another pair (R20)', (t) => {
  // lane table with codex.command = fake and AETHER_LANE_HARNESSES 'codex', the toy repository and brief of tests/lane-delegate.test.js
  // (writeBrief with Write src/new.js saying hello), script array [ answering(DONE, { files: { 'src/new.js': 'hello' }, commit: 'add new' }), answering(READY) ],
  // AETHER_FAKE_CODEX_STATE set to a file of the temp dir;
  // runDelegate(repo, env, { brief, tests: 'node -e "process.exit(0)"' }) -> json.status 'done', json.pair.harness 'codex', json.pair.id 'codex/gpt-6.1-terra@medium',
  //   repo.git('show', `${json.branch}:src/new.js`) is 'hello', the owner's checkout is clean, json.review.status 'done',
  //   json.review.pair.id !== json.pair.id (the reviewer is Sol), json.review.verdict 'ready'
})

test('with Codex failing, an editing delegate passes to the next pair or ends without a candidate, with no question for the owner (R8, R20)', (t) => {
  // script { exit: 1, stderr: 'Not logged in. Run codex login.\n' } for every call, harnesses 'codex' alone: json.status is 'failed' or 'no-candidate'
  // and the cause is in json (the failed attempt with 'exit 1: Not logged in…'), the owner's checkout is untouched, and no `question` field is in the result.
})
```

Write each commented test body in full following the pattern of the file it copies; the comments above are the assertions that must be there.

**Acceptance:** all the tests above pass against the real runner, the real adapter and the fake; no file outside `tests/codex-lane.test.js` changes; `npm test` is green.

### Task 9: La opción `harnesses` y la detección de Codex

**Aether:**
- Area: config
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `tests/manifest.test.js`, `tests/codex-detect.test.js`, `tests/retired-options.test.js`, `tests/no-router.test.js`, `tests/copies-harness-config.test.js`
- Depends on: Task 2 — el informe de cuota de `aether-lane quota codex` ya trae las dos ventanas
- Serves: R1, R2

**Interfaces:**

The `harnesses` option description in `plugin.json` (line 20) becomes exactly:

`The external harnesses superdelegation may use, comma-separated: agy, codex, grok, cursor, muse. The quota decides the order of the candidates, then the cost per task. Default: agy. Each one runs its CLI without permission prompts in Aether's transactional worktree, with your git, GitHub, package-registry and cloud credentials kept out of its environment. Turn one on only once you accept that risk. Cursor is not tested with a real account.`

`docs/guide/options.md` says the same as `plugin.json` for `harnesses` (the page is held equal to the manifest by the tests). Nothing else of the manifest changes in this task (the version is Task 12's).

**Tests (write first):**

`tests/manifest.test.js`: the expected description at line 41 becomes the text above. `tests/codex-detect.test.js` (new):

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runBin, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')

const quotaOf = (t, command) => {
  fs.chmodSync(FAKE, 0o755)
  const env = { ...fx.laneEnv(t, { mutate: (config) => (config.harnesses.codex.command = command) }), AETHER_FAKE_CODEX_RATE_LIMITS: RATE_LIMITS }
  return runBin(fx.LANE_BIN, ['quota', 'codex', '--json'], tempDir(t), env)
}

test('with a codex that exists the quota report says it is installed, its version, and both windows (R2)', (t) => {
  const r = quotaOf(t, FAKE)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const codex = r.json.harnesses.codex
  assert.deepEqual([codex.installed, codex.version], [true, 'codex-cli 0.166.0'])
  assert.deepEqual(Object.keys(codex.groups.codex.windows), ['5h', 'weekly'])
})

test('without a codex it says not installed, with no version and no groups, and nothing breaks (R2)', (t) => {
  const r = quotaOf(t, '/nowhere/codex')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.harnesses.codex.installed, r.json.harnesses.codex.version, r.json.harnesses.codex.groups], [false, null, {}])
})

test('the option says that only Cursor is untested, and the guide says what the manifest says (R1)', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', '.claude-plugin', 'plugin.json'), 'utf8'))
  const description = plugin.userConfig.harnesses.description
  assert.ok(description.includes('agy, codex, grok, cursor, muse'))
  assert.ok(description.endsWith('Cursor is not tested with a real account.'))
  assert.equal(/Codex and Cursor are not tested/.test(description), false)
  const options = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', 'options.md'), 'utf8')
  assert.ok(options.includes('Cursor is not tested with a real account.'))
  assert.equal(/Codex and Cursor/.test(options), false)
})
```

The tests that already exist and accept `codex` in the `harnesses` option and reject it misspelled are kept as they are.

**Acceptance:** the description and the page say that only Cursor is untested; detection reports installed and version with a `codex` and not installed without; the existing tests of Owns that pin the text of the option (`tests/retired-options.test.js`, `tests/no-router.test.js`, `tests/copies-harness-config.test.js`) change only the assertions that the new description breaks, and the report lists each; `npm test` is green.

### Task 10: Codex en las guías, la web, el README y las skills del plugin

**Aether:**
- Area: docs
- Owns: `docs/guide/lanes.md`, `docs/guide/ops.md`, `docs/guide/troubleshooting.md`, `docs/guide/delegates.md`, `docs/getting-started.md`, `docs/reference/components.md`, `README.md`, `site/index.html`, `site/app.js`, `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `tests/codex-docs.test.js`, `tests/docs-facts.test.js`, `tests/lanes-docs.test.js`, `tests/muse-docs.test.js`, `tests/muse-docs-overview.test.js`, `tests/muse-skills.test.js`, `tests/docs-claims.test.js`, `tests/docs-claims-rest.test.js`, `tests/site.test.js`, `tests/components-docs.test.js`, `tests/spend-docs.test.js`, `tests/swarm-ladder-docs.test.js`, `tests/bootstrap-design.test.js`, `tests/bootstrap-names.test.js`
- Depends on: Task 2 — qué lee la cuota
- Depends on: Task 5 — los modelos y los roles
- Depends on: Task 6 — los delegados con Codex
- Serves: R3, R19, R20, R25

**Interfaces:**

Plain prose, in English (the site in Spanish and English). What each text says:
- `docs/guide/lanes.md` gets a Codex section (the guide already has the sections of agy, Grok and Muse): Codex is a work harness like the others (`harnesses` option); the three models (GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Luna) at the five efforts with their roles; the tiers (Terra medium for the first step, Terra high for its correction, Sol medium for the step of Sonnet high, Sol max for the step of Opus high) and the sentence that the rule picks by cost, so another harness can win (the table of plan D6); the models left out with the reason (GPT-6 Astra waits for GPT-6.1 Astra like Fable 5.1 for Fable 5.5, `gpt-6-sol`, `gpt-5.6-*`, the hidden `gpt-reserve` and `codex-auto-review`, the effort `ultra`); the quota «is read with `account/rateLimits/read` of `codex app-server`, without calling a model» and without opening credentials, both windows (5 hours and weekly); a quota refusal is known by the reading, not by words; the command line (`codex exec` in the unit's worktree with `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, the sandbox on, no approvals, `--output-schema`) and what it keeps out (the owner's `config.toml`, rules, session files, `AGENTS.md` and hooks as far as the Lead measured: the Lead left the measured limit in `evidence/step0-findings.md` §3 and you write it here in the Codex section: the owner's global `~/.codex/AGENTS.md` still reaches the model with every flag the adapter passes (the note in front of the prompt asks Codex to ignore its orders), the owner's Orca hooks cannot act because the lane environment drops every `ORCA_*` variable, and the way to remove the limit, a private `CODEX_HOME` that holds the owner's session, touches credentials and waits for the owner); the fallback on the native agent without a question; the costs (Sol max and Luna max are the ones AA measured on 2026-10-26, the other 13 are estimates anchored on them, marked in each pair row, with the method of plan D5; Terra's rest on the assumption that it spends Sol's tokens); the plan is ChatGPT Plus.
- `docs/guide/ops.md`, `docs/guide/troubleshooting.md`, `docs/getting-started.md`, `docs/reference/components.md`, `README.md`, `site/index.html` and `site/app.js`: every place that lists the harnesses lists Codex with the others in the registry order and says nothing that makes Codex «not adopted» or «not tested».
- `docs/guide/delegates.md`: the delegates may run on agy, Codex, Grok or Muse (cursor cannot); the decision of spec 010 («codex y cursor por el momento no los adoptamos») is changed for Codex by the owner's words of 2026-10-29, which the page quotes with the date.
- `plugins/aether/skills/using-aether/SKILL.md` and `skills/swarm/SKILL.md`: Codex among the harnesses in the lists they already have; the swarm skill adds one sentence: Codex's quota is read without a model call and a failed Codex call runs on the native agent. Keep the additions short: `tests/bootstrap-names.test.js` and `tests/bootstrap-design.test.js` cap the size of the bootstrap.

**Tests (write first):** `tests/codex-docs.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const has = (file, phrases) => { const text = read(file); for (const phrase of phrases) assert.ok(text.includes(phrase), `${file} lacks: ${phrase}`) }

test('the guide of lanes tells what Codex is, what it uses, what it leaves out and how its quota is read (R19)', () => {
  has('docs/guide/lanes.md', [
    'GPT-6.1 Sol', 'GPT-6.1 Terra', 'GPT-6 Luna', 'Terra medium', 'Sol medium', 'Sol max', 'GPT-6 Astra', 'GPT-6.1 Astra', '`ultra`',
    'account/rateLimits/read', 'codex app-server', 'without calling a model', 'codex exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--output-schema',
    'AGENTS.md', 'hooks', 'ChatGPT Plus',
  ])
})

test('every place that lists the harnesses lists Codex, and none calls it unadopted or untested (R3)', () => {
  for (const file of ['README.md', 'docs/getting-started.md', 'docs/guide/ops.md', 'docs/guide/troubleshooting.md', 'docs/guide/lanes.md', 'docs/reference/components.md', 'site/index.html', 'plugins/aether/skills/using-aether/SKILL.md', 'plugins/aether/skills/swarm/SKILL.md']) {
    assert.ok(/codex/i.test(read(file)), file)
  }
  for (const file of ['README.md', 'docs/getting-started.md', 'docs/guide/ops.md', 'docs/guide/troubleshooting.md', 'docs/guide/lanes.md', 'docs/guide/options.md', 'site/index.html']) {
    assert.equal(/codex[^.\n]{0,40}(is|are) not (tested|adopted)|codex and cursor (are )?not (tested|adopted)/i.test(read(file)), false, file)
  }
})

test('the guide of delegates counts Codex among the harnesses a delegate may run on, and records the owner\'s change of 2026-10-29 (R20)', () => {
  const text = read('docs/guide/delegates.md')
  assert.ok(/agy, codex, grok or muse|agy, codex, grok and muse/i.test(text))
  assert.equal(/codex and cursor (cannot|are not)/i.test(text), false)
  assert.ok(text.includes('2026-10-29'))
})

test('the swarm skill says that Codex\'s quota is read without a model and that a failed call runs native (R3)', () => {
  const text = read('plugins/aether/skills/swarm/SKILL.md')
  assert.ok(/codex/i.test(text) && text.includes('without a model call'))
})
```

`tests/docs-facts.test.js` and the other existing tests of Owns that pin the text of these pages (`tests/lanes-docs.test.js`, `tests/muse-docs*.test.js`, `tests/muse-skills.test.js`, `tests/docs-claims*.test.js`, `tests/site.test.js`, `tests/components-docs.test.js`, `tests/spend-docs.test.js`, `tests/swarm-ladder-docs.test.js`, `tests/bootstrap-*.test.js`) change only the assertions that a text of this task breaks (a count of harnesses, a list of names), and the report lists each.

**Acceptance:** the pages say what the plan says; the README keeps its limits (160 lines, order of parts, links); `tests/docs-facts.test.js`, `tests/site.test.js` and the bootstrap-size tests pass; `npm test` is green.

### Task 11: El método de elegir un harness en skills, y las pruebas que lo atan al árbol

**Aether:**
- Area: skills
- Owns: `.claude/skills/new-harness/SKILL.md`, `tests/harness-lists.test.js`, `tests/harness-literals.js`, `tests/new-harness-skill.test.js`
- Depends on: Task 6 — las listas de los delegados ya llevan a Codex
- Depends on: Task 4 — `DEFAULT_HARNESSES` del índice ya lleva a Codex
- Serves: R3, R23, R24

**Interfaces:**

`tests/harness-literals.js` (a helper, not a test: no `.test.js` suffix so `node --test "tests/*.test.js"` does not run it):

```text
const NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']
// Every fixed list of harness names in the code: an array literal, or a `new Set([...])` of one, assigned with const/let/var/export const,
// whose quoted strings include two or more of NAMES. Looks in plugins/aether/lib/**/*.js, plugins/aether/hooks/*.mjs and scripts/*.js.
function fixedLists(root) -> [{ file: 'plugins/aether/lib/router-quota.js', name: 'EXTERNAL', items: ['agy', 'codex', 'grok', 'muse'] }, ...]   // sorted by file, then name
function listsIn(text, file) -> the same, for one text (so a test can feed it a sample)
module.exports = { NAMES, fixedLists, listsIn }
```

`.claude/skills/new-harness/SKILL.md` (the text of commit `80fb2a9` is the base; keep what it says and complete it):
- Front matter: `description` still says when it loads («a new harness … is to be added to Aether, or … the models, tiers or quota of one already in are to be redone») and mentions the words «new harness».
- The steps stay in the order `1 List`, `2 Artificial Analysis`, `3 Decide what stays out`, `4 Map the tiers`, `5 cost per task`, `6 free, live reading`, `7 personal setup`, `8 real calls`, `9 Touch every list`, `10 Release`, under the heading names the tests below look for; the «What went wrong with Muse» section stays and keeps `issue #108`.
- Step 9 ends in a machine-readable block that lists **every** fixed list the walker finds, one line each, `<path> <IDENTIFIER>` optionally followed by ` — <note>`:

```
<!-- lists:start -->
plugins/aether/lib/harness/index.js HARNESS_NAMES
plugins/aether/lib/delegate-calls.js HARNESSES
plugins/aether/lib/router-pick.js DELEGATE_HARNESSES
plugins/aether/lib/router-quota.js EXTERNAL
plugins/aether/lib/router-renewal.js RENEWABLE
plugins/aether/lib/lane-delegate.js ALLOWED_HARNESSES
plugins/aether/lib/lane-pick.js REFRESHABLE — Codex stays out: its reading is free and the adapter takes it, so it has no refresher
plugins/aether/hooks/panel-view.mjs HARNESS_NAMES
scripts/build-models-index.js HARNESSES
scripts/build-models-index.js DEFAULT_HARNESSES
<!-- lists:end -->
```

  (the block holds exactly the lists `fixedLists` finds: if the walker finds another one, the block names it with the reason it has or does not have the new harness; if it finds fewer, the block is cut to match.) Around the block, step 9 also names what is not an array literal: the `harnesses` option in `plugin.json` and `docs/guide/options.md`, the guides (`lanes`, `ops`, `troubleshooting`, `delegates`, `getting-started`), `docs/models/README.md`, the site, the README, the skills `using-aether` and `swarm`, and `tests/harness-lists.test.js`.

`.claude/skills/artificial-analysis/SKILL.md` is the owner's own skill: it is untracked on purpose (the owner keeps his Artificial Analysis files out of commits, and the repository is public), so **this task does not read, copy, edit or add it**, and nothing is written in the main repository (decision of the Lead; spec A10 allows it). The two lessons that skill holds travel in `new-harness/SKILL.md`, each in its own section: **"The top tier waits for its next generation"** (the top tier of a line waits for the next generation of that tier while a much cheaper model reaches almost the same points; examples Fable 5.1 (A43) and GPT-6 Astra, with the 2026-10-29 figures: Astra max 56.9 against Sol max 54.5 at five times the price per token; it re-enters with GPT-6.1 Astra and is then measured like any new model) and **"The scales move"** (AA re-measured almost every model between 2026-10-26 and 2026-10-29: Haiku high 37.8 to 29.6, Sonnet high 46.8 to 41.1, Opus high 53.6 to 51.7; a new row is not compared with an old one without saying the date; the project keeps the old rows until the owner decides the refresh, P1 of spec 022). The skill says to read the owner's `artificial-analysis` skill too when it is present.

**Tests (write first):**

`tests/new-harness-skill.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fixedLists } = require('./harness-literals.js')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const SKILL = read('.claude/skills/new-harness/SKILL.md')

function listedBlock() {
  const match = SKILL.match(/<!-- lists:start -->\n([\s\S]*?)\n<!-- lists:end -->/)
  assert.ok(match, 'the skill has its lists block')
  return match[1].split('\n').filter((line) => line.trim() !== '').map((line) => {
    const [file, name] = line.split(' — ')[0].trim().split(/\s+/)
    return { file, name }
  })
}

test('the description loads the skill when a new harness is asked for, and the steps come in the order of the method (R23)', () => {
  const description = SKILL.match(/^description: (.*)$/m)[1]
  assert.ok(/new harness/i.test(description) && /added to Aether/i.test(description))
  const order = ['List everything the CLI gives', 'Read Artificial Analysis once', 'Decide what stays out', 'Map the tiers', 'Get a cost per task', 'free, live reading', 'personal setup', 'The Lead makes the real calls', 'Touch every list', 'Release']
  const positions = order.map((phrase) => SKILL.indexOf(phrase))
  assert.ok(positions.every((position) => position > -1), `a step is missing: ${order.filter((_, i) => positions[i] === -1)}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the steps are in order')
})

test('the skill names the mistakes of Muse it avoids', () => {
  assert.ok(SKILL.includes('issue #108'))
  for (const mistake of ['2 of the 4 models', 'No pair existed below', 'balance came from a call made hours earlier', 'no cost per task', 'one by one']) assert.ok(SKILL.includes(mistake) || SKILL.toLowerCase().includes(mistake.toLowerCase()), mistake)
})

test('every list the skill tells to touch exists in the tree, and every fixed list of the code is named in the skill (R23)', () => {
  const named = listedBlock()
  for (const { file, name } of named) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} does not exist`)
    assert.ok(new RegExp(`(const|let|var)\\s+${name}\\s*=`).test(read(file)), `${file} has no ${name}`)
  }
  const found = fixedLists(ROOT).map(({ file, name }) => `${file} ${name}`)
  const have = named.map(({ file, name }) => `${file} ${name}`)
  assert.deepEqual(found.filter((entry) => !have.includes(entry)), [], 'a fixed list of the code the skill does not name')
  assert.deepEqual(have.filter((entry) => !found.includes(entry)), [], 'a list of the skill the code does not have')
})

test('the five lists of the delegates and the router are among the ones the skill names, ALLOWED_HARNESSES included (R23)', () => {
  const have = listedBlock().map(({ name }) => name)
  for (const name of ['HARNESSES', 'DELEGATE_HARNESSES', 'EXTERNAL', 'RENEWABLE', 'ALLOWED_HARNESSES']) assert.ok(have.includes(name), name)
})

test('the skill new-harness holds the rule of the top tier and the trap of the scales in their own sections (R24)', () => {
  const text = read('.claude/skills/new-harness/SKILL.md')
  assert.ok(text.includes('The top tier waits for its next generation') && text.includes('The scales move'), 'the two sections')
  for (const phrase of ['Fable 5.1', 'GPT-6 Astra', 'GPT-6.1 Astra', '2026-10-26', '2026-10-29', 'a new row']) assert.ok(text.includes(phrase), phrase)
  assert.ok(/waits for|next generation/i.test(text))
})
```

`tests/harness-lists.test.js` (existing; keep both of its tests unchanged) gains:

```js
const { fixedLists, listsIn } = require('./harness-literals.js')

test('the walker finds a fixed list of harness names, a Set of one, and nothing else', () => {
  const text = "const A = ['agy', 'grok']\nconst B = new Set(['codex', 'muse', 'x'])\nconst C = ['agy']\nconst D = ['red', 'green']\nexport const E = ['agy', 'codex', 'grok', 'cursor', 'muse']\n"
  assert.deepEqual(listsIn(text, 'f.js').map((list) => list.name), ['A', 'B', 'E'])
})

// A list of the code that does not name codex, with the reason.
const WITHOUT_CODEX = { 'plugins/aether/lib/lane-pick.js REFRESHABLE': 'Codex has no refresher: its reading is free and the adapter takes it' }

test('every fixed list of harness names in the code names codex, except the ones with a reason (R3)', () => {
  const missing = fixedLists(ROOT).filter((list) => !list.items.includes('codex') && !WITHOUT_CODEX[`${list.file} ${list.name}`]).map((list) => `${list.file} ${list.name}`)
  assert.deepEqual(missing, [])
  assert.ok(Object.values(WITHOUT_CODEX).every((why) => why !== ''))
})
```

**Acceptance:** the skill `new-harness` is complete and its lists block equals what the walker finds; the skill `new-harness` carries the two sections of the top tier and of the scales, and the owner's `artificial-analysis` skill is neither read nor copied nor added; a fixed list that omits Codex fails `tests/harness-lists.test.js`; `npm test` is green.

### Task 12: La versión 0.27.0, el changelog y A100

**Aether:**
- Area: release
- Owns: `plugins/aether/.claude-plugin/plugin.json`, `tests/launcher.test.js`, `README.md`, `docs/changelog.md`, `docs/decisions.md`, `docs/roadmap.md`, `tests/docs-facts.test.js`, `tests/codex-release.test.js`
- Depends on: Task 7 — la herramienta de humo, que el changelog nombra
- Depends on: Task 8 — la prueba punta a punta
- Depends on: Task 9 — `plugin.json` (la descripción de `harnesses`)
- Depends on: Task 10 — el README y las guías
- Depends on: Task 11 — las skills y las pruebas de listas
- Serves: R25

**Interfaces:**

- `plugin.json` `"version": "0.27.0"`; `tests/launcher.test.js` pins `0.27.0` (the test «the manifest is version 0.26.0, and the documents say so» becomes 0.27.0); the README keeps one line `Version 0.27.0 ([changelog](docs/changelog.md))` and its badge says 0.27.0.
- `docs/changelog.md`: a new first entry `Version 0.27.0: Codex is a work harness like agy, Grok and Muse (spec 022, decision A100). What changed since 0.26.0:` with bullets: the adapter and its command line (what it keeps out of the call); the free quota reading; the three models, the tiers and the estimated costs; the delegates; the fallback; the skill `new-harness` and the AA rule; `lane-smoke`; and `- **What did not change.**` (the other harnesses, the design seats, the table of pairs of the other harnesses, the figures of AA of 2026-10-26, the default of `harnesses`). It names A100.
- `docs/decisions.md`: a row `A100` after A99 in the same table format (`| A100 | **<the decision in one sentence>.** The owner's words, as given on 2026-10-29: «…» … What was decided: (1) … | Decided 2026-10-29; spec 022 |`). Check the last number in the file before writing it; if A100 is taken, use the next and tell the Lead. It quotes the owner's words of `intent.md` §1 (1, 2, 3, 6) and records: the three models and the five efforts; the exclusions and the rule of the top tier; the tiers and that the rule picks by cost; the free quota reading; `codex exec` with the owner's setup left out and the limit of R19 as the Lead measured it; Codex takes delegates (the decision of spec 010 is changed for Codex); the fallback; the method in skills.
- `docs/roadmap.md`: the **Now** line says `version 0.27.0` (Codex) before the 0.26.0 text, in the style of the previous entries. The reason: `tests/docs-facts.test.js` (line 459, «R12: the roadmap's Now line names the manifest's version») fails when the Now line does not include `version ` and the version of `plugin.json`.
- No handoff: `tests/guards.test.js` (R21) allows exactly one file in `docs/handoff/` and the Lead replaces it at the end. Do not create or edit anything under `docs/handoff/`.
- `tests/docs-facts.test.js`: the test «R15: the decisions A50 to A99 are recorded and the changelog opens with 0.26.0, then 0.25.1, …» (line 563) and its assertions (line 607 and following) become A50 to A100 and open with 0.27.0, then 0.26.0, and so on; list each changed line in the report.

**Tests (write first):** `tests/codex-release.test.js`.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('the manifest, the launcher pin, the README and the changelog all say 0.27.0 (R25)', () => {
  assert.equal(JSON.parse(read('plugins/aether/.claude-plugin/plugin.json')).version, '0.27.0')
  assert.ok(read('tests/launcher.test.js').includes("'0.27.0'"))
  const readme = read('README.md')
  assert.equal(readme.split('\n').filter((line) => /^Version \d/.test(line)).length, 1)
  assert.ok(readme.includes('Version 0.27.0 ('))
  const firstVersion = read('docs/changelog.md').split('\n').find((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(firstVersion.startsWith('Version 0.27.0: ') && firstVersion.includes('A100') && /Codex/.test(firstVersion), firstVersion)
})

test('the decisions record A100 with the owner\'s words and what was decided about Codex (R25)', () => {
  const row = read('docs/decisions.md').split('\n').find((line) => line.startsWith('| A100 |'))
  assert.ok(row, 'A100 is a row of the table')
  for (const phrase of ['Codex', '2026-10-29', 'spec 022', 'GPT-6.1 Sol', 'GPT-6 Astra', 'account/rateLimits/read', 'codex exec', 'fallback']) assert.ok(row.includes(phrase), phrase)
})

test('the guides say that Codex is a work harness, and the roadmap says what is now (R25)', () => {
  assert.ok(read('docs/roadmap.md').split('\n').find((line) => line.startsWith('**Now:**')).includes('version 0.27.0'))
  assert.ok(/codex/i.test(read('docs/reference/components.md')))
})
```

**Acceptance:** the four places say 0.27.0; A100 is recorded; the changelog opens with 0.27.0; `npm run check` passes (the tests, the mod tests and `claude plugin validate --strict`); no merge, push, tag or `claude plugin update` was made.
