# Tareas: `/aether:audit`, una auditoría del proyecto que entrega una lista ordenada por urgencia

**Spec:** [spec.md](spec.md)

El plan está en [plan.md](plan.md). Este plan se construye con tareas delegadas, una por worktree, integradas una a una; no con el enjambre. La Tarea 1 la escribe el Lead (el texto del skill, que las rondas de R29 corrigen); las demás, delegados. Las rondas de R29 no son tareas (ninguna tarea posee archivos bajo `specs/`): las corre el Lead después de la Tarea 5 y antes de la Tarea 6.

## Global Constraints

- **Pila.** Node.js 22, CommonJS, sin dependencias. Linux y macOS (los comandos del proyecto auditado se corren con `sh -c`).
- **Una familia nueva en `lib/`: `audit`.** Todo archivo `plugins/aether/lib/audit-*.js` y `audit.js` empieza con un comentario de cabecera de seis palabras o más y lleva la línea `// Family: audit.` dentro de ese comentario. `audit.js` es el orquestador de la familia. Reutilizar `lib/git.js`, `lib/common.js`, `lib/run.js` y `lib/lane-process.js`: ninguna función auxiliar se define dos veces en `lib/`, ningún nombre se deja sin usar y `lib/` no tiene ciclos (`tests/guards*.test.js`). Los módulos de subcomando nunca hacen `require('./audit.js')`.
- **El bin es delgado.** `plugins/aether/bin/aether-audit` solo pide `node:path` y un archivo de `lib/`, tiene menos de 160 líneas y lleva su comentario de uso con una línea `// aether-audit <verbo> ...` por cada verbo (`analyze`, `candidates`, `verdicts`, `clean`, `triage`, `report`), como el de `aether-plan` (`tests/bins-thin.test.js`, `tests/commands.test.js`).
- **Una línea JSON por llamada.** Salida `0` bien, `1` error (`{"ok":false,"error":"..."}`), `2` uso incorrecto. Nada se escribe dentro del proyecto auditado. No se llama a la red ni a un modelo en ninguna prueba.
- **Las pruebas** usan `tests/helpers.js` (`makeRepo`, `tempDir`, `runBin`, `useDataDir`, `commitIn`), repositorios git desechables y un ejecutor `exec` falso; ninguna prueba necesita `gh`, `npm`, `pip-audit` ni la red. Los valores falsos de secretos se arman en la prueba con `join`/`+` para que ningún archivo del repositorio los contenga enteros. Ningún archivo menciona la carpeta personal del dueño ni su correo (`tests/guards.test.js`, R23).
- **El ejecutor inyectable.** Los módulos que llaman a un programa externo (`audit-github.js`, `audit-tools.js`) reciben `exec` en su `ctx`. `exec(file, args, { cwd, env, timeoutMs })` devuelve una promesa de `{ status, stdout, stderr, timedOut, error? }`, donde `error` es `{ code, message }` cuando el programa no existe (`code: 'ENOENT'`). El de producción es `runCommand` de `audit-exec.js`. `git` se llama siempre con `lib/git.js`.
- **Formas compartidas.** Todas las tareas las siguen.
  - `Check` (una revisión del análisis): `{ state: 'result' | 'not-applicable' | 'could-not', reason?: string, notRun?: true, ...datos }`. `reason` es obligatorio cuando `state` no es `result`. Una revisión que no se pudo nunca es `result`.
  - `Location`: `{ file, line }` (entero ≥ 1) o `{ file, commit }` (hexadecimal de 7 a 40 caracteres).
  - `Candidate` (lo que devuelve un revisor): `{ id, topic, title, claim, location: Location, type, trigger, evidence, impact }`. `topic` es uno de `TOPICS`, `type` uno de `TYPES` (vocabulario de `audit-common.js`).
  - `Verdict` (lo que devuelve un verificador): `{ id, verdict, rootCause, trigger, impact, evidence, reproduction?, ranOn, exhausted?, reason? }`. `verdict` es uno de `VERDICTS`; `ranOn` es `'claude'` o el nombre del harness.
  - `Finding` (un candidato establecido): el `Candidate` más `{ verification: 'proven' | 'read-confirmed' | 'proposal' | 'unverified', status: 'verified' | 'unverified', rootCause, causeKey?, coveredBy?, reason?, reproduction?, ranOn? }`. Después de `clean`: más `locations: Location[]`, `mergedFrom: string[]` y `mark: 'new' | 'still' | null`.
  - `Judgment` (lo que el Lead decide, por id): `{ severity, priority, reason, size, how, regression, waitCost }` con `severity` ∈ `SEVERITIES`, `priority` ∈ `PRIORITIES`, `size` ∈ `SIZES`, `waitCost` ∈ `WAIT_COSTS`, `regression` booleano, `reason` y `how` textos.
  - Salida de `candidates`: `{ accepted: Candidate[], discarded: Discard[], counts: { candidates } }`. Salida de `verdicts`: `{ findings: Finding[], discarded: Discard[], counts: { candidates, verified } }`. Salida de `clean`: `{ findings (verificados), unverified, discarded, counts, issueComparison, sinceLast }`. Salida de `triage`: la de `clean` más `list` (numerada) y `unverified` reducido. `Discard` es `{ id, title?, topic?, reason, ...extras }`.
  - `report.json` (lo que guarda `report --save`): `{ project, date, meta: { durationSeconds, costUsd, topics, leftOut }, counts, list, unverified, sinceLast, discarded: { total, byReason, items }, issueComparison, notCovered, waits, assumptions, radar, cost, sections }`.
- **Las razones de descarte** son: `no-location`, `no-evidence`, `unknown-topic`, `unknown-type`, `missing-field:<campo>`, `duplicate-id`, `refuted`, `merged`, `covered-by-issue`.
- **Lo que las tareas no hacen.** No instalar herramientas, no tocar la versión ni el changelog (son del dueño), no escribir bajo `specs/` ni `.specify/`.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [US1] [US2] [US3] [US4] [US5] [US6] [US7] [US8] El skill `audit`, su catálogo de doce temas, su mención en `/aether:help` y su prueba, en `plugins/aether/skills/audit/` → Task 1
- [ ] T002 [US1] El bin `aether-audit`, `audit.js`, `audit-common.js`, `audit-exec.js`, `audit-store.js` y `audit-report.js`, la fila de la familia `audit` y los conteos de catorce comandos, en `plugins/aether/lib/` → Task 2
- [ ] T003 [P] [US3] [US8] La lectura del repositorio: fotografías, secretos sin valor, TODO, ramas, hotspots, issues y PR, en `audit-snapshot.js`, `audit-scan.js` y `audit-github.js` → Task 3
- [ ] T004 [P] [US3] [US8] Los comandos propios del proyecto (lectura del comando, tests, linter, dependencias) y el comando `analyze`, en `audit-risk.js`, `audit-tools.js` y `audit-analyze.js` → Task 4
- [ ] T005 [P] [US5] [US6] La compuerta de candidatos, el establecimiento de veredictos, la limpieza y el triaje, en `audit-verify.js`, `audit-clean.js` y `audit-triage.js` → Task 5
- [ ] T006 [US1] [US2] La guía en inglés y en español, la fila de la tabla de componentes, la nota de la huella en reposo y la mención en `/aether:help`, en `docs/` → Task 6

### Task 1: El skill `audit` (lo escribe el Lead)

**Aether:**
- Area: audit-skill
- Owns: `plugins/aether/skills/audit/**`, `plugins/aether/skills/help/SKILL.md`, `tests/audit-skill.test.js`, `docs/reference/components.md`
- Depends on: none
- Serves: R1, R2, R3, R9, R10, R11, R12, R14, R22, R25, R26, R28

Esta tarea la escribe el Lead, no un delegado: las rondas de R29 corrigen su texto. Va primero porque `tests/commands.test.js` exige que cada verbo de cada bin tenga un llamador en un skill (el texto del skill nombra `aether-audit <verbo>` en una sola línea), y porque `tests/docs-facts.test.js` (R15) exige que `components.md` nombre cada skill.

**Interfaces:**

Archivos que crea o cambia:

- `plugins/aether/skills/audit/SKILL.md`, en inglés (como los demás skills), con esta portada exacta y estas claves en este orden:
  ```
  ---
  name: audit
  description: Audit the project and get a list of what is pending, ordered from most to least urgent. Reads only; fixes nothing.
  argument-hint: "[topics] [--no-tests]"
  disable-model-invocation: true
  ---
  ```
- `plugins/aether/skills/audit/topics.md`: la tabla del catálogo, con una fila por tema y estas columnas: `| id | name | what to look for | sources |`. Los ids son exactamente `bugs`, `security`, `dependencies`, `tests`, `reliability`, `performance`, `accessibility`, `architecture`, `docs`, `releases`, `hygiene`, `opportunities`. Las fuentes de cada fila son direcciones que están textualmente en `specs/026-project-audit/research.md`:
  - `bugs`: `https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md`, `https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html`
  - `security`: `https://asvs.owasp.org/`, `https://owasp.org/www-project-code-review-guide/`
  - `dependencies`: `https://github.com/ossf/scorecard/blob/main/docs/checks.md`
  - `tests`: `https://pitest.org/quickstart/basic_concepts/`, `https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html`
  - `reliability`: `https://sre.google/sre-book/launch-checklist/`
  - `performance`: `https://www.iso.org/standard/78176.html`
  - `accessibility`: `https://www.iso.org/standard/78176.html`
  - `architecture`: `https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html`, `https://martinfowler.com/bliki/TechnicalDebtQuadrant.html`
  - `docs`: `https://www.writethedocs.org/guide/tools/testing/`, `https://www.diataxis.fr/start-here/`
  - `releases`: `https://semver.org/`, `https://keepachangelog.com/en/1.1.0/`
  - `hygiene`: `https://www.chaoss.community/kb/metric-issue-age/`
  - `opportunities`: `https://jules.google/docs/suggested-tasks/`
- `plugins/aether/skills/help/SKILL.md`: una sección «Audit a project» con `/aether:audit [topics] [--no-tests]` (sin enlace a la guía todavía: la Tarea 6 lo agrega) y que no cambia nada del proyecto.
- `docs/reference/components.md`: la fila de la tabla `| `audit` skill | ... |`, como la de `onboard`. **No** menciona `aether-audit` en un código en línea (el bin llega en la Tarea 2).

El texto de `SKILL.md` debe contener, y las pruebas lo fijan:

1. Las siete fases como encabezados `## 1. Automated analysis`, `## 2. Topic question`, `## 3. Discovery`, `## 4. Verification`, `## 5. Cleanup`, `## 6. Triage`, `## 7. Delivery`, en ese orden.
2. En la fase 1: `aether-audit analyze --out <file>` (los archivos de trabajo se escriben en un directorio de `mktemp -d` fuera del proyecto), `--no-tests`, `--tests-command` (el Lead lo usa con un comando del README solo cuando ningún manifiesto declara tests), que el análisis no instala ni corrige nada, y que el valor de un secreto nunca se imprime ni se cita.
3. En la fase 2: una sola pregunta, en una sola llamada, con la forma de `specs/026-project-audit/prototype.md` (el resumen del análisis, los temas propuestos con su razón, los dejados fuera con la suya, el estimado de `analysis.estimate` o «aún no hay historial», y la invitación a confirmar, quitar o agregar); terminar el turno ahí y no empezar sin una respuesta nueva; con temas en la invocación no hay pregunta, un tema desconocido se dice y se ignora, y si ninguno es del catálogo se hace la pregunta; `--no-tests` no es un tema; rendimiento y accesibilidad solo se proponen cuando el análisis muestra que aplican.
4. En la fase 3: un revisor por tema confirmado, todos en paralelo y en segundo plano, cada uno un delegado de solo lectura con la herramienta `Agent` (`run_in_background`), sin `AETHER-OWNS`, sin la conversación de la persona y **sin escoger su modelo**; recibe su tema, el resumen del análisis y los hotspots, empieza por ellos, trabaja sobre un alcance acotado y devuelve candidatos con la forma `Candidate` y lo que no miró. El skill dice que no necesita la herramienta Workflow, que funciona igual con o sin ella y que nunca pide encenderla. Una sesión headless que termina antes que sus delegados se retoma con `--resume`, y se relanza cada delegado que no respondió.
5. En la fase 4: `aether-audit candidates <file>`, luego cada candidato aceptado pasa a un verificador de solo lectura en un contexto nuevo (recibe la afirmación y la ubicación, **no** el razonamiento del revisor); un verificador puede tomar hasta cuatro candidatos de la misma zona, cada uno juzgado por separado, porque cada delegado tiene un costo fijo de arranque y cada resultado es un turno más del Lead, y con 40 candidatos serían 40 delegados (decisión del Lead, plan D6), que reescribe la afirmación (causa raíz, disparador, impacto), intenta refutarla y reproduce solo en un directorio de `mktemp -d` fuera del proyecto; la forma `Verdict`; un verificador que corre en otro harness no reproduce; y `aether-audit verdicts <file> <verdicts-file>`. Un hallazgo cuya verificación falla es «sin verificar», nunca verificado.
6. En la fase 5: el Lead agrega `causeKey` a cada hallazgo (la causa raíz; reusa la de la auditoría anterior cuando es el mismo problema) y `coveredBy` cuando un issue abierto lo cubre; `aether-audit clean <file> --analysis <file> --topics <a,b,c>`.
7. En la fase 6: el archivo de juicios (`Judgment` por id), con gravedad y prioridad por separado, la razón en una frase, el tamaño grueso, si es regresión, el costo de esperar y cómo se haría; la edad de un issue, una rama o un TODO es un motivo para mirar, no una gravedad; los cuatro niveles P0 a P3; `aether-audit triage <file> <judgments-file>`.
8. En la fase 7: el archivo `meta` (fecha, temas, temas dejados fuera con su razón, duración, costo de `aether-report --spend` o `readable: false`, «Espera tu sí», «Supuestos», lo que cada revisor no miró y los revisores agotados, el RADAR), `aether-audit report --meta <file> --analysis <file> --triage <file> --lang <es|en> --save`, la entrega con la forma del prototipo en el idioma de la persona (para otro idioma que `es` o `en`, el Lead traduce la salida) y la pregunta final de cuáles toma.
9. Reglas que cruzan las fases: la auditoría no cambia nada del proyecto (ni `git fetch`, `git pull`, `--fix`, commits, ramas, stash o worktrees); no crea issues por su cuenta; solo **después** de que la persona elige puntos, y solo si el proyecto usa GitHub y `gh` responde, crea un issue por punto con `gh issue create` y su evidencia, y si no entrega los puntos elegidos como texto; responde en el idioma de la persona.

**Tests (write first):**

`tests/audit-skill.test.js`:

```js
'use strict'

// Spec 026 (R1, R2, R9, R26, R28): the skill audit has the front matter of onboard, names the seven phases and the twelve topics
// of its catalog (each with a source that research.md holds), does not depend on the Workflow tool, and the help names it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
const skill = read('plugins', 'aether', 'skills', 'audit', 'SKILL.md')
const topics = read('plugins', 'aether', 'skills', 'audit', 'topics.md')
const research = read('specs', '026-project-audit', 'research.md')
const help = read('plugins', 'aether', 'skills', 'help', 'SKILL.md')

const TOPIC_IDS = ['bugs', 'security', 'dependencies', 'tests', 'reliability', 'performance', 'accessibility', 'architecture', 'docs', 'releases', 'hygiene', 'opportunities']
const VERBS = ['analyze', 'candidates', 'verdicts', 'clean', 'triage', 'report']

function frontMatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(block, 'the skill starts with front matter')
  return Object.fromEntries(block[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]))
}

test('the front matter is the one of onboard: name, description, argument-hint and disable-model-invocation (R1, R28)', () => {
  const front = frontMatter(skill)
  assert.deepEqual(Object.keys(front), ['name', 'description', 'argument-hint', 'disable-model-invocation'])
  assert.equal(front.name, 'audit')
  assert.ok(front.description.length > 0 && front.description.length <= 200)
  assert.equal(front['argument-hint'], '"[topics] [--no-tests]"')
  assert.equal(front['disable-model-invocation'], 'true')
  assert.doesNotMatch(front.description, /workflow/i)
})

test('the seven phases are headings, in the order of R2', () => {
  const names = ['Automated analysis', 'Topic question', 'Discovery', 'Verification', 'Cleanup', 'Triage', 'Delivery']
  const at = names.map((name, i) => skill.search(new RegExp(`^## ${i + 1}\\. ${name}\\s*$`, 'm')))
  assert.ok(at.every((position) => position > -1), `a phase is missing: ${names.filter((_, i) => at[i] === -1)}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at)
})

test('the catalog has the twelve topics, each with sources that research.md holds (R9, C3)', () => {
  for (const id of TOPIC_IDS) {
    const row = topics.split('\n').find((line) => line.startsWith(`| ${id} |`))
    assert.ok(row, `topics.md has a row for ${id}`)
    const urls = [...row.matchAll(/https?:\/\/[^\s|)>\]]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''))
    assert.ok(urls.length >= 1, `${id} has a source`)
    for (const url of urls) assert.ok(research.includes(url), `${id}: ${url} is not in research.md`)
  }
  assert.equal(topics.split('\n').filter((line) => /^\| [a-z]+ \|/.test(line) && !line.startsWith('| id |')).length, 12)
})

test('it does not need the Workflow tool and says so (R26)', () => {
  assert.match(skill, /does not need the Workflow tool/i)
  assert.doesNotMatch(skill, /allowed-tools|^tools:/m)
  assert.match(skill, /run_in_background/)
  assert.match(skill, /mktemp -d/)
})

test('it names every subcommand of aether-audit next to the bin, as tests/commands.test.js reads it', () => {
  for (const verb of VERBS) assert.match(skill, new RegExp(`aether-audit[^\\n]{0,80}\\b${verb}\\b`), verb)
})

test('it holds the rules that cross the phases: one question, no changes, secrets, issues only after the choice', () => {
  assert.match(skill, /one question/i)
  assert.match(skill, /--no-tests/)
  assert.match(skill, /--tests-command/)
  assert.match(skill, /read-only/i)
  assert.match(skill, /never (print|quote|copy|repeat)[^.\n]*value of a secret/i)
  assert.match(skill, /gh issue create/)
  assert.match(skill, /only after the person (chooses|picks|takes)/i)
  assert.match(skill, /(not|never) (choose|pick|name) (a|the|any) model|does not choose the model/i)
  assert.match(skill, /not the reviewer's reasoning|without the reviewer's reasoning/i)
})

test('the help names /aether:audit, with its argument and the fact that it changes nothing in the project', () => {
  assert.match(help, /\/aether:audit/)
  assert.match(help, /\/aether:audit \[topics\] \[--no-tests\]/)
  const section = help.slice(help.indexOf('## Audit a project'))
  assert.ok(section.length > 0 && help.includes('## Audit a project'))
  assert.match(section.split(/\n## /)[0], /(changes nothing|does not change)/i)
})

test('the plugin has the skill in the folder that the other skills use', () => {
  assert.ok(fs.existsSync(path.join(PLUGIN, 'skills', 'audit', 'SKILL.md')))
})
```

**Acceptance:**

- `node --test tests/audit-skill.test.js` pasa, y también `tests/help.test.js`, `tests/commands.test.js` (cuando el bin aún no existe, el skill ya nombra cada verbo) y `tests/docs-facts.test.js` (la fila de `components.md` nombra `audit`).
- El skill no depende de la herramienta Workflow y no escoge el modelo de ningún delegado.
- `npm test` pasa.

### Task 2: El bin, el orquestador, el almacén y el reporte

**Aether:**
- Area: audit-core
- Owns: `plugins/aether/bin/aether-audit`, `plugins/aether/lib/audit.js`, `plugins/aether/lib/audit-common.js`, `plugins/aether/lib/audit-exec.js`, `plugins/aether/lib/audit-store.js`, `plugins/aether/lib/audit-report.js`, `docs/reference/components.md`, `tests/audit-foundation.test.js`, `tests/docs-facts.test.js`, `tests/components-docs.test.js`, `tests/observe-bin.test.js`
- Depends on: Task 1 — `tests/commands.test.js` exige un llamador del bin en un skill y `docs-facts` que `components.md` nombre el skill; ambos llegan con la Tarea 1
- Serves: R3, R10, R21, R22, R23, R24, R25, R27

Crea la familia `audit` (R16 de `tests/guards.test.js`): el orquestador, los módulos que todos comparten, el reporte y su guardado. Los módulos de las Tareas 3, 4 y 5 los carga `audit.js` cuando se pide su subcomando.

**Interfaces:**

`plugins/aether/lib/audit-common.js` (hoja: no pide ningún archivo de `lib/` ni de `node:` salvo lo que necesite):

```js
const TOPICS = ['bugs', 'security', 'dependencies', 'tests', 'reliability', 'performance', 'accessibility', 'architecture', 'docs', 'releases', 'hygiene', 'opportunities']
const TYPES = ['bug', 'risk', 'debt', 'docs', 'opportunity', 'other']
const VERDICTS = ['proven', 'read-confirmed', 'proposal', 'refuted', 'unverified']
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const SEVERITIES = ['critical', 'high', 'medium', 'low']
const SIZES = ['S', 'M', 'L']
const WAIT_COSTS = ['high', 'medium', 'low']
const CHECK_STATES = ['result', 'not-applicable', 'could-not']
// An Error whose exitCode is 2: the bin prints it as a usage mistake.
function usageError(message) {}
// spec = { values: ['out'], booleans: ['save'], positionals: [min, max] }
// -> { values: { out: 'x' }, booleans: { save: true }, positionals: ['a'] }; values and booleans hold only the flags that were given.
// Throws usageError for an unknown flag, a value flag with no value (or whose value starts with `--`), a flag given twice,
// and a number of positionals outside [min, max].
function parseArgs(args, spec) {}
```

`plugins/aether/lib/audit-exec.js`:

```js
// Runs file with args; never throws. Stdin is closed (or is `input`). The child is a process-group leader: on timeoutMs the whole group is killed with killGroup of lib/common.js.
// -> Promise<{ status: number | null, stdout: string, stderr: string, timedOut: boolean, error?: { code: string, message: string } }>
// stdout and stderr are cut at 8 MB each. A program that does not exist gives status null and error.code 'ENOENT'.
async function runCommand(file, args, { cwd, env, timeoutMs = 300000, input = null } = {}) {}
// A copy of env without the names that look like secrets (/TOKEN|SECRET|PASSW(OR)?D|API_?KEY|ACCESS_KEY|CREDENTIAL|PRIVATE/i), with CI=true, GIT_TERMINAL_PROMPT=0 and NO_COLOR=1.
function projectEnv(env) {}
```

`plugins/aether/lib/audit-store.js`:

```js
// 'https://user:tok@GitHub.com/Owner/Repo.git', 'git@github.com:Owner/Repo.git', 'ssh://git@github.com/Owner/Repo.git/' -> 'github.com/owner/repo'
// Rule: drop the protocol, drop the user info, turn the scp-like `host:path` (only when the text had no `://`) into `host/path`, drop a trailing `.git` and `/`, lowercase.
function normalizeRemote(url) {}
// -> { identity, remote, root, name, key }. remote is the origin URL (or the first remote's) with the user info removed, or null.
// identity is normalizeRemote(remote) or, with no remote, the real path of the main checkout's root (repoPaths(cwd).mainRoot of lib/git.js, through safeRealpath).
// name is the last segment of identity; key is projectKey(identity).
function identityOf(cwd) {}
// `${toId(last segment of identity)}-${first 12 hex digits of sha256(identity)}`; toId from lib/run.js.
function projectKey(identity) {}
// The folder of the next audit: <dataDir>/audits/<key>/<date>, or <date>-2, <date>-3 ... when that one exists. Does not create it.
function nextReportDir(dataDir, key, date) {}
// Creates dir and writes report.json (JSON.stringify(data, null, 2)) and report.md (markdown) with writeAtomic of lib/common.js.
function writeReport(dir, data, markdown) {}
// The latest saved audit of the project (by date, then by suffix), or null: { dir, date, report }. Skips a folder whose report.json cannot be read.
function previousReport(dataDir, key) {}
// From the saved audits of every project (<dataDir>/audits/*/*/report.json): the range per topic of what an audit cost.
// -> { samples: 0 } with none; else { samples, perTopic: { minutes: [min, max], usd: [min, max] } }, rounded to 2 decimals.
// An audit counts when meta.durationSeconds > 0 and meta.topics has at least one topic; usd counts only when meta.costUsd is a number.
// minutes = durationSeconds / 60 / topics.length, usd = costUsd / topics.length. samples = audits that counted for minutes. When no audit has a cost, usd is null.
function estimate(dataDir) {}
```

`plugins/aether/lib/audit-report.js`:

```js
// input = { meta, analysis, triage } as in Global Constraints and below; lang is 'es' or anything else (anything else is English).
// -> { data, markdown }; data is the report.json object; data.sections is the ids in order:
//    ['header', 'waits', 'assumptions', 'list', 'unverified', 'sinceLast', 'discarded', 'notCovered', 'radar', 'cost', 'question']
// options.savedTo (optional) is the folder where the report is saved.
function render(input, lang, options = {}) {}
// ctx = { cwd, env, subcommand: 'report' }; args = --meta <file> --analysis <file> --triage <file> [--lang <l>] [--save]
// -> { code: 0, result: { ok: true, lang, sections, markdown, saved? }, summary: { sections: 11, saved? } }
// With --save: dir = nextReportDir(dataDir of lib/run.js for ctx.env, analysis.project.key, meta.date), render with savedTo = dir, writeReport. saved is dir.
async function command(args, ctx) {}
```

Forma de la entrada de `render`:

```
meta     = { date, topics: [id], leftOut: [{ topic, reason }], durationSeconds, costUsd: number | null, waits: [text], assumptions: [text],
             reviewers: { notLooked: [{ topic, items: [text] }], exhausted: [topic] }, radar: text, cost: { readable: boolean, text?: text } }
analysis = { project: { name, key, identity, remote, root }, checks: { tests, lint, dependencies, secrets, todos, branches, issues, prs, hotspots },
             changes: { changed, attributed, unattributable: [{ between: [a, b], items: [{ kind, files? }] }] } }
triage   = { counts: { candidates, verified }, list: [item], unverified: [item], sinceLast: { previous: null | { date }, resolved: [{ causeKey, title, topic }], notReaudited: [...] },
             discarded: [{ id, reason, ... }], issueComparison: { state: 'done' | 'could-not', reason?, removed }, ... }
item (list)       = { number, id, topic, type, verification, title, claim, locations, causeKey, mark, priority, severity, reason, size, how, regression, waitCost }
item (unverified) = { id, topic, title, claim, locations, reason }
```

El texto de cada sección (la forma del prototipo). Español; las etiquetas entre llaves salen de las tablas de abajo.

```
**Auditoría de {name} · {date} · {n} temas · {candidates} hallazgos, {verified} sobrevivieron la verificación**     (la primera línea)
**Espera tu sí**
- {wait}                                  (sin elementos: - (nada))
**Supuestos**
- {assumption}                            (sin elementos y sin cambios no atribuibles: - (nada))
- Cambio no atribuible durante la auditoría (entre {a} y {b}): {archivos separados por coma}      (uno por cada analysis.changes.unattributable)
**P0 · Urge ya**                          (solo los niveles que tienen puntos; en este orden P0, P1, P2, P3)
1. **[{tema} · {verificación}]** {title}
   `{file}:{line}` · {tipo} — {claim}      (una ubicación con commit: `{file}` (commit `{commit}`); varias ubicaciones: separadas por coma)
   *Por qué P0:* {reason} · {tamaño} · {how}{ · nuevo | · sigue}
**Sin verificar (no los ordené)**
- **[{tema}]** {title} (`{file}:{line}`): {reason}
**Desde la última auditoría ({previous.date}):** {nuevos} nuevos, {siguen} siguen, {resueltos} resueltos (ya no aparecen y su código cambió).{ {n} no se volvieron a encontrar, pero su código no cambió.}{ {k} sin revisar esta vez, porque sus temas quedaron fuera.}     (las dos frases finales solo cuando sinceLast.notFoundAgain o sinceLast.notReaudited tienen elementos; después, una línea `- No se volvieron a encontrar: {títulos separados por «; »}` con a lo más diez títulos y `, y {m} más`; en inglés `{r} resolved (no longer found, and their code changed).`, ` {n} not found again, though their code did not change.`, ` {k} not re-audited, because their topics were left out.`, `- Not found again: {titles}`, `, and {m} more`; sin anterior: **Desde la última auditoría:** no hay una auditoría anterior.)
**Descartados:** {total} ({razón}: {n}, ...).{ No pude comparar con los issues abiertos ({reason}).}{ La lista completa está en el reporte guardado: {savedTo}}
**No cubrí:**
- {línea}                                 (sin líneas: - (nada))
**RADAR:** {radar}
{cost.text}                               (cost.readable falso: No pude leer el costo de la sesión; no pongo una cifra.)
**¿Cuáles tomas?** Por ejemplo: «1, 2 y 3».     (los primeros hasta tres números de la lista; con una lista vacía: **¿Cuáles tomas?** No hay hallazgos verificados para tomar.)
```

Etiquetas en español: tema (bugs Bug, security Seguridad, dependencies Dependencias, tests Tests, reliability Fiabilidad, performance Rendimiento, accessibility Accesibilidad, architecture Arquitectura, docs Docs, releases Versiones, hygiene Higiene, opportunities Oportunidad); verificación (proven comprobado, read-confirmed confirmado leyendo, proposal propuesta); tipo (bug Bug, risk Riesgo, debt Deuda, docs Docs, opportunity Oportunidad, other Otro); tamaño (S Pequeño, M Mediano, L Grande); marca (new nuevo, still sigue); niveles (P0 `Urge ya`, P1 `Pronto`, P2 `Programable`, P3 `Cuando puedas / ideas`); razones de descarte, en este orden: refuted `refutados`, covered-by-issue `cubiertos por un issue`, merged `repetidos`, no-location `sin ubicación`, no-evidence `sin evidencia`, y cualquier otra con su id; revisiones del análisis (tests Tests, lint Linter, dependencies Dependencias, secrets Secretos, todos TODO y FIXME, branches Ramas, issues Issues, prs Pull requests, hotspots Hotspots).

Líneas de «No cubrí», en este orden: por cada revisión del análisis que no sea `result` (en el orden de la tabla anterior): `{revisión}: no se corrió: {reason}` si `notRun`, `{revisión}: no aplica: {reason}` si `not-applicable`, `{revisión}: no se pudo: {reason}` si `could-not`; por cada revisión `result` con `truncated: true`: `{revisión}: se leyó solo una parte`; por cada `meta.leftOut`: `{tema}: tema fuera: {reason}`; por cada `meta.reviewers.notLooked`: `{tema}: no miré {items separados por coma}`; por cada `meta.reviewers.exhausted`: `Revisor agotado: {tema}`.

Inglés (cualquier `lang` que no empiece por `es`): `**Audit of {name} · {date} · {n} topics · {candidates} findings, {verified} survived verification**`, `**Awaiting your yes**`, `**Assumptions**`, `- (none)`, `- Unattributable change during the audit (between {a} and {b}): {files}`, `**P0 · Now**`, `**P1 · Soon**`, `**P2 · Schedulable**`, `**P3 · When you can / ideas**`, `*Why P0:*`, `**Unverified (not ranked)**`, `**Since the last audit ({date}):** {n} new, {s} still open, {r} resolved.` / `**Since the last audit:** there is no earlier audit.`, `**Discarded:** {total} ({reason}: {n}, ...).`, ` I could not compare with the open issues ({reason}).`, ` The full list is in the saved report: {savedTo}`, `**Not covered:**`, `{check}: not run: {reason}` / `not applicable:` / `could not:` / `only part was read` / `{topic}: left out: {reason}` / `{topic}: I did not look at {items}` / `Reviewer ran out: {topic}`, `**RADAR:** {radar}`, `I could not read the session cost; I give no figure.`, `**Which do you take?** For example: «1, 2 and 3».` / `**Which do you take?** There are no verified findings to take.`, tamaños Small, Medium, Large, marcas new y still, verificación proven, confirmed by reading, proposal, descarte `refuted`, `covered by an issue`, `merged`, `no location`, `no evidence`; temas Bug, Security, Dependencies, Tests, Reliability, Performance, Accessibility, Architecture, Docs, Releases, Hygiene, Opportunity; tipos Bug, Risk, Debt, Docs, Opportunity, Other.

`data` (lo que guarda `report.json`): `{ project: analysis.project, date: meta.date, meta: { durationSeconds, costUsd, topics, leftOut }, counts: triage.counts, list: triage.list, unverified: triage.unverified, sinceLast: triage.sinceLast, discarded: { total, byReason: { <razón>: n }, items: triage.discarded }, issueComparison: triage.issueComparison, notCovered: [las líneas de «No cubrí»], waits, assumptions, radar, cost: meta.cost, sections }`.

`plugins/aether/lib/audit.js` (orquestador de la familia):

```js
// -> Promise<number>: the exit code. Writes one JSON line to stdout.
// 1. Takes `--out <file>` out of argv. When given, the file must be outside the audited project: the root of the git worktree of cwd
//    (git rev-parse --show-toplevel, through lib/git.js; no root, no check); inside it, the exit code is 2 and the error says
//    "--out must be outside the audited project". This check comes before the subcommand runs.
// 2. Loads the module of the subcommand when it is asked for, with a literal require inside a function per subcommand:
//    analyze -> audit-analyze.js, candidates and verdicts -> audit-verify.js, clean -> audit-clean.js, triage -> audit-triage.js, report -> audit-report.js.
//    Each exports command(args, ctx) -> Promise<{ code?: number, result: object, summary?: object }> and gets ctx = { cwd, env, subcommand, now: () => new Date() }.
// 3. Prints the result; with --out writes the result there (writeAtomic) and prints { ok: true, out, summary } instead.
// An error with exitCode 2 (usageError) gives exit 2; any other error gives { ok: false, error } and exit 1; an unknown or missing subcommand gives exit 2 and an error that names the six subcommands.
async function main(argv, { cwd = process.cwd(), env = process.env, stdout = process.stdout } = {}) {}
```

`plugins/aether/bin/aether-audit`: cabecera de uso con una línea `// aether-audit <verbo> ...` por verbo; llama a `main(process.argv.slice(2), { cwd: process.cwd(), env: process.env, stdout: process.stdout })` y fija `process.exitCode` con el resultado.

Otros cambios:
- `docs/reference/components.md`: una fila de la tabla de piezas para `aether-audit` (qué hace cada verbo, en una frase cada uno), una fila de la tabla de familias `| audit | `audit-` | `audit-common.js`, `audit-exec.js`, `audit-store.js`, `audit-report.js` | `audit.js` |` y el cambio de «the thirteen commands of `bin/`» a «the fourteen commands of `bin/`».
- `tests/docs-facts.test.js`: la lista de textos que exige a `components.md` pasa de `'thirteen commands of `bin/`'` a `'fourteen commands of `bin/`'` y `NUMBERS` recibe `fourteen: 14`.
- `tests/components-docs.test.js` y `tests/observe-bin.test.js`: «thirteen» pasa a «fourteen» y `13` a `14` en sus conteos de `bin/`.

**Tests (write first):**

`tests/audit-foundation.test.js`:

```js
'use strict'

// Spec 026 (R3, R10, R21 to R25, R27): the bin, the shared vocabulary, the runner, the store and the report of the audit.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const common = lib('audit-common.js')
const exec = lib('audit-exec.js')
const store = lib('audit-store.js')
const report = lib('audit-report.js')

const SECTIONS = ['header', 'waits', 'assumptions', 'list', 'unverified', 'sinceLast', 'discarded', 'notCovered', 'radar', 'cost', 'question']

test('the vocabularies are closed, and the twelve topics are the catalog of R9', () => {
  assert.deepEqual(common.TOPICS, ['bugs', 'security', 'dependencies', 'tests', 'reliability', 'performance', 'accessibility', 'architecture', 'docs', 'releases', 'hygiene', 'opportunities'])
  assert.deepEqual(common.TYPES, ['bug', 'risk', 'debt', 'docs', 'opportunity', 'other'])
  assert.deepEqual(common.VERDICTS, ['proven', 'read-confirmed', 'proposal', 'refuted', 'unverified'])
  assert.deepEqual(common.PRIORITIES, ['P0', 'P1', 'P2', 'P3'])
  assert.deepEqual(common.SEVERITIES, ['critical', 'high', 'medium', 'low'])
  assert.deepEqual(common.SIZES, ['S', 'M', 'L'])
  assert.deepEqual(common.WAIT_COSTS, ['high', 'medium', 'low'])
  assert.deepEqual(common.CHECK_STATES, ['result', 'not-applicable', 'could-not'])
})

test('parseArgs reads flags with values, boolean flags and positionals, and refuses the rest with exit code 2', () => {
  const spec = { values: ['out', 'lang'], booleans: ['save'], positionals: [1, 2] }
  assert.deepEqual(common.parseArgs(['a.json', '--lang', 'es', '--save'], spec), { values: { lang: 'es' }, booleans: { save: true }, positionals: ['a.json'] })
  for (const bad of [[], ['a', 'b', 'c'], ['a', '--nope'], ['a', '--lang'], ['a', '--lang', '--save'], ['a', '--lang', 'es', '--lang', 'en']]) {
    assert.throws(() => common.parseArgs(bad, spec), (err) => err.exitCode === 2, JSON.stringify(bad))
  }
  assert.equal(common.usageError('x').exitCode, 2)
})

test('runCommand gives output and status, closes stdin, kills the whole process group on the cap, and reports a missing program', async (t) => {
  const dir = tempDir(t)
  const base = { cwd: dir, env: process.env, timeoutMs: 5000 }
  const done = await exec.runCommand('sh', ['-c', 'echo out; echo err 1>&2; exit 3'], base)
  assert.equal(done.status, 3)
  assert.equal(done.stdout.trim(), 'out')
  assert.equal(done.stderr.trim(), 'err')
  assert.equal(done.timedOut, false)
  const closed = await exec.runCommand('sh', ['-c', 'cat; echo done'], base)
  assert.equal(closed.stdout.trim(), 'done')
  const slow = await exec.runCommand('sh', ['-c', 'sleep 30 & echo $! > pidfile; wait'], { ...base, timeoutMs: 400 })
  assert.equal(slow.timedOut, true)
  assert.equal(slow.status, null)
  const pid = Number(fs.readFileSync(path.join(dir, 'pidfile'), 'utf8'))
  let alive = true
  for (let i = 0; i < 40 && alive; i++) {
    try { process.kill(pid, 0); await new Promise((resolve) => setTimeout(resolve, 50)) } catch { alive = false }
  }
  assert.equal(alive, false, 'the grandchild died with the group')
  const missing = await exec.runCommand('definitely-not-a-command-xyz', [], base)
  assert.equal(missing.status, null)
  assert.equal(missing.error.code, 'ENOENT')
})

test('projectEnv drops what looks like a secret and sets CI', () => {
  const env = exec.projectEnv({ PATH: '/usr/bin', HOME: '/home/x', EDITOR: 'vi', NPM_TOKEN: 'a', MY_SECRET: 'b', DB_PASSWORD: 'c', AWS_ACCESS_KEY_ID: 'd', STRIPE_API_KEY: 'e', GOOGLE_APPLICATION_CREDENTIALS: 'f', SSH_PRIVATE: 'g' })
  assert.deepEqual(Object.keys(env).sort(), ['CI', 'EDITOR', 'GIT_TERMINAL_PROMPT', 'HOME', 'NO_COLOR', 'PATH'])
  assert.equal(env.CI, 'true')
})

test('the bin with no arguments or with an unknown subcommand exits 2 and names the six subcommands', (t) => {
  const repo = makeRepo(t)
  for (const args of [[], ['frobnicate']]) {
    const r = runBin(BIN, args, repo.dir)
    assert.equal(r.status, 2)
    assert.equal(r.json.ok, false)
    for (const name of ['analyze', 'candidates', 'verdicts', 'clean', 'triage', 'report']) assert.ok(r.json.error.includes(name), name)
  }
})

test('--out inside the audited project is refused with exit 2 and writes nothing', (t) => {
  const repo = makeRepo(t)
  const inside = path.join(repo.dir, 'out.json')
  const r = runBin(BIN, ['report', '--out', inside], repo.dir)
  assert.equal(r.status, 2)
  assert.match(r.json.error, /outside the audited project/)
  assert.equal(fs.existsSync(inside), false)
})

test('the identity of a project is its normalized remote, or the real path of its root; a linked worktree has the same key', (t) => {
  for (const form of ['https://github.com/Owner/Repo.git', 'git@github.com:Owner/Repo.git', 'ssh://git@github.com/Owner/Repo.git/', 'https://user:s3cr3t-token@github.com/Owner/Repo/']) {
    assert.equal(store.normalizeRemote(form), 'github.com/owner/repo', form)
  }
  const repo = makeRepo(t)
  const bare = store.identityOf(repo.dir)
  assert.equal(bare.remote, null)
  assert.equal(bare.identity, fs.realpathSync(repo.dir))
  repo.git('remote', 'add', 'origin', 'https://user:s3cr3t-token@github.com/Owner/Repo.git')
  const remote = store.identityOf(repo.dir)
  assert.equal(remote.identity, 'github.com/owner/repo')
  assert.equal(remote.name, 'repo')
  assert.equal(remote.root, fs.realpathSync(repo.dir))
  assert.equal(remote.key, store.projectKey('github.com/owner/repo'))
  assert.ok(!JSON.stringify(remote).includes('s3cr3t-token'))
  const other = makeRepo(t)
  const linked = path.join(tempDir(t), 'linked')
  other.git('worktree', 'add', '-q', '-b', 'linked-branch', linked)
  assert.equal(store.identityOf(linked).key, store.identityOf(other.dir).key)
})

test('the key is a slug and 12 hex digits of the identity', () => {
  const key = store.projectKey('github.com/owner/repo')
  assert.match(key, /^repo-[0-9a-f]{12}$/)
  assert.equal(store.projectKey('github.com/owner/repo'), key)
  assert.notEqual(store.projectKey('github.com/other/repo'), key)
  assert.match(store.projectKey('/home/a/My Project'), /^My-Project-[0-9a-f]{12}$/)
})

test('an audit is saved under the project key and the date, the next one the same day gets a suffix, and the latest is found', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const key = 'repo-0123456789ab'
  const first = store.nextReportDir(dataDir, key, '2026-10-12')
  assert.equal(first, path.join(dataDir, 'audits', key, '2026-10-12'))
  assert.equal(fs.existsSync(first), false, 'nextReportDir does not create the folder')
  store.writeReport(first, { list: [{ causeKey: 'x' }] }, '# md a')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first, 'report.json'), 'utf8')).list, [{ causeKey: 'x' }])
  assert.equal(fs.readFileSync(path.join(first, 'report.md'), 'utf8'), '# md a')
  const second = store.nextReportDir(dataDir, key, '2026-10-12')
  assert.equal(second, `${first}-2`)
  store.writeReport(second, { list: [] }, '# md b')
  const third = store.nextReportDir(dataDir, key, '2026-11-04')
  store.writeReport(third, { list: [{ causeKey: 'y' }] }, '# md c')
  const previous = store.previousReport(dataDir, key)
  assert.equal(previous.dir, third)
  assert.equal(previous.date, '2026-11-04')
  assert.deepEqual(previous.report.list, [{ causeKey: 'y' }])
  assert.equal(store.previousReport(dataDir, 'other-000000000000'), null)
  assert.equal(store.previousReport(tempDir(t), key), null)
})

test('the estimate is the range per topic of the saved audits of any project, and says there is no history when there is none (R10)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  assert.deepEqual(store.estimate(dataDir), { samples: 0 })
  const save = (key, date, meta) => store.writeReport(store.nextReportDir(dataDir, key, date), { meta }, '')
  save('a-000000000001', '2026-10-01', { durationSeconds: 600, costUsd: 2.5, topics: ['bugs', 'tests', 'docs', 'security', 'hygiene'] })
  save('b-000000000002', '2026-10-02', { durationSeconds: 1800, costUsd: 5.4, topics: ['bugs', 'tests', 'docs', 'security', 'hygiene', 'releases', 'reliability', 'architecture', 'dependencies'] })
  save('c-000000000003', '2026-10-03', { durationSeconds: 300, costUsd: null, topics: ['bugs'] })
  save('d-000000000004', '2026-10-04', { topics: [] })
  assert.deepEqual(store.estimate(dataDir), { samples: 3, perTopic: { minutes: [2, 5], usd: [0.5, 0.6] } })
})

const location = (file, line) => ({ file, line })

function fixture() {
  const item = (over) => ({
    number: 1, id: 'F1', topic: 'bugs', type: 'bug', verification: 'proven', title: 'A payment slower than 30 s is charged twice', claim: 'the retry sends no idempotency key',
    locations: [location('src/payments/charge.js', 88)], causeKey: 'charge-no-idempotency', mark: 'new', priority: 'P0', severity: 'critical',
    reason: 'charges real customers on every provider outage', size: 'S', how: 'one agent', regression: false, waitCost: 'high', ...over,
  })
  return {
    meta: {
      date: '2026-11-04', topics: ['bugs', 'security', 'tests'], leftOut: [{ topic: 'accessibility', reason: 'it has no interface' }], durationSeconds: 1560, costUsd: 2.84,
      waits: ['Choose which ones you take, by number.'], assumptions: ['I treated the 2 red tests as outdated tests.'],
      reviewers: { notLooked: [{ topic: 'bugs', items: ['src/legacy/'] }], exhausted: ['tests'] },
      radar: 'Fast 26 min · Delegation 31 of 40 calls · Affordable', cost: { readable: true, text: 'Session 8a00: US$ 2.84 at list price.' },
    },
    analysis: {
      project: { name: 'tienda-api', key: 'tienda-api-0123456789ab', identity: 'github.com/o/tienda-api', remote: 'https://github.com/o/tienda-api.git', root: '/x' },
      checks: {
        tests: { state: 'could-not', notRun: true, reason: '`npm test` reaches `db:seed` through `pretest`: it seeds data' },
        lint: { state: 'not-applicable', reason: 'no linter declared' },
        dependencies: { state: 'result' }, secrets: { state: 'result', truncated: false }, todos: { state: 'result' }, branches: { state: 'result' },
        issues: { state: 'could-not', reason: 'gh is not installed' }, prs: { state: 'not-applicable', reason: 'the remote is not GitHub' }, hotspots: { state: 'result' },
      },
      changes: { changed: false, attributed: [], unattributable: [{ between: ['tests', 'lint'], items: [{ kind: 'status', files: ['notes.txt'] }] }] },
    },
    triage: {
      counts: { candidates: 47, verified: 19 },
      list: [
        item({}),
        item({ number: 2, id: 'F2', topic: 'security', type: 'risk', verification: 'read-confirmed', title: 'A live key is in the history', locations: [{ file: 'config/dev.env', commit: '4f2a91c' }], causeKey: 'key', mark: 'still', reason: 'anyone with the repo can read it', how: 'you and one agent' }),
        item({ number: 3, id: 'F3', topic: 'tests', title: 'CI has been red for 9 days', priority: 'P1', size: 'M', causeKey: 'ci' }),
        item({ number: 4, id: 'F4', topic: 'docs', type: 'docs', title: 'README names a script that is gone', priority: 'P2', size: 'S', mark: null, causeKey: 'readme' }),
        item({ number: 5, id: 'F5', topic: 'opportunities', type: 'opportunity', verification: 'proposal', title: 'Export orders to CSV', priority: 'P3', size: 'L', causeKey: 'csv' }),
      ],
      unverified: [{ id: 'F6', topic: 'bugs', title: 'Possible stock race', claim: 'two buyers of the last item', locations: [location('src/orders/stock.js', 30)], reason: 'the verifier could not reproduce or rule it out' }],
      sinceLast: { previous: { date: '2026-10-12' }, resolved: [{ causeKey: 'old', title: 'An old bug', topic: 'bugs' }], notReaudited: [] },
      discarded: [{ id: 'D1', reason: 'refuted' }, { id: 'D2', reason: 'refuted' }, { id: 'D3', reason: 'covered-by-issue', issue: 41 }, { id: 'D4', reason: 'merged', into: 'F1' }, { id: 'D5', reason: 'no-location' }],
      issueComparison: { state: 'could-not', reason: 'gh is not installed', removed: [] },
    },
  }
}

const between = (md, from, to) => md.slice(md.indexOf(from), to ? md.indexOf(to) : undefined)

test('the Spanish report has the eleven sections of R21 in order, with the shape of the prototype (C5)', () => {
  const out = report.render(fixture(), 'es')
  assert.deepEqual(out.data.sections, SECTIONS)
  const md = out.markdown
  assert.match(md.split('\n')[0], /tienda-api.*2026-11-04.*3 temas.*47 hallazgos.*19 sobrevivieron/)
  const order = ['**Espera tu sí**', '**Supuestos**', '**P0 · Urge ya**', '**P1 · Pronto**', '**P2 · Programable**', '**P3 · Cuando puedas / ideas**', '**Sin verificar', '**Desde la última auditoría', '**Descartados', '**No cubrí', '**RADAR', '**¿Cuáles tomas?**']
  let at = -1
  for (const label of order) {
    const i = md.indexOf(label)
    assert.ok(i > at, `${label} is missing or out of order`)
    at = i
  }
  assert.ok(md.includes('1. **[Bug · comprobado]** A payment slower than 30 s is charged twice'))
  assert.ok(md.includes('`src/payments/charge.js:88` · Bug — the retry sends no idempotency key'))
  assert.ok(md.includes('*Por qué P0:* charges real customers on every provider outage · Pequeño · one agent · nuevo'))
  assert.ok(md.includes('2. **[Seguridad · confirmado leyendo]** A live key is in the history'))
  assert.ok(md.includes('`config/dev.env` (commit `4f2a91c`)'))
  assert.ok(md.includes('· sigue'))
  assert.ok(md.includes('*Por qué P3:*'))
  assert.ok(md.includes('5. **[Oportunidad · propuesta]**'))
  assert.deepEqual([...md.matchAll(/^(\d+)\. \*\*\[/gm)].map((m) => Number(m[1])), [1, 2, 3, 4, 5])
  assert.ok(md.endsWith('**¿Cuáles tomas?** Por ejemplo: «1, 2 y 3».') || md.trimEnd().endsWith('**¿Cuáles tomas?** Por ejemplo: «1, 2 y 3».'))
})

test('what is unverified has no level and no number, and the since-last, discarded and not-covered sections say what R21 and R22 ask', () => {
  const md = report.render(fixture(), 'es').markdown
  const unverified = between(md, '**Sin verificar', '**Desde la última auditoría')
  assert.ok(unverified.includes('Possible stock race') && unverified.includes('`src/orders/stock.js:30`'))
  assert.doesNotMatch(unverified, /\bP[0-3]\b/)
  assert.doesNotMatch(unverified, /^\d+\./m)
  assert.ok(md.includes('**Desde la última auditoría (2026-10-12):** 3 nuevos, 1 siguen, 1 resueltos.'))
  const discarded = between(md, '**Descartados', '**No cubrí')
  assert.ok(discarded.includes('**Descartados:** 5 (refutados: 2, cubiertos por un issue: 1, repetidos: 1, sin ubicación: 1).'))
  assert.ok(discarded.includes('No pude comparar con los issues abiertos (gh is not installed).'))
  assert.ok(!discarded.includes('reporte guardado'))
  const notCovered = between(md, '**No cubrí', '**RADAR')
  for (const line of ['Tests: no se corrió: `npm test` reaches `db:seed`', 'Linter: no aplica: no linter declared', 'Issues: no se pudo: gh is not installed', 'Pull requests: no aplica: the remote is not GitHub', 'Accesibilidad: tema fuera: it has no interface', 'Bug: no miré src/legacy/', 'Revisor agotado: Tests']) {
    assert.ok(notCovered.includes(line), line)
  }
  assert.ok(!notCovered.includes('Dependencias') && !notCovered.includes('Secretos'), 'a check that gave a result is not listed as not covered')
  const assumptions = between(md, '**Supuestos**', '**P0')
  assert.ok(assumptions.includes('I treated the 2 red tests as outdated tests.'))
  assert.ok(assumptions.includes('Cambio no atribuible durante la auditoría (entre tests y lint): notes.txt'))
})

test('the radar and the cost come from meta; an unreadable cost is said and no figure is invented (R23)', () => {
  const md = report.render(fixture(), 'es').markdown
  const tail = between(md, '**RADAR')
  assert.ok(tail.includes('Fast 26 min') && tail.includes('Session 8a00: US$ 2.84 at list price.'))
  const unreadable = fixture()
  unreadable.meta.radar = 'Rápido 26 min'
  unreadable.meta.cost = { readable: false }
  unreadable.meta.costUsd = null
  const out = report.render(unreadable, 'es')
  const after = between(out.markdown, '**RADAR')
  assert.ok(after.includes('No pude leer el costo de la sesión; no pongo una cifra.'))
  assert.doesNotMatch(after, /US\$/)
  assert.equal(out.data.meta.costUsd, null)
})

test('the first audit says there is no earlier one, a band with no points is left out, and an empty list says so', () => {
  const first = fixture()
  first.triage.sinceLast = { previous: null, resolved: [], notReaudited: [] }
  assert.ok(report.render(first, 'es').markdown.includes('**Desde la última auditoría:** no hay una auditoría anterior.'))
  const empty = fixture()
  empty.triage.list = []
  const out = report.render(empty, 'es')
  assert.deepEqual(out.data.sections, SECTIONS)
  assert.doesNotMatch(out.markdown, /\*\*P[0-3] ·/)
  assert.ok(out.markdown.includes('**¿Cuáles tomas?** No hay hallazgos verificados para tomar.'))
  const oneBand = fixture()
  oneBand.triage.list = oneBand.triage.list.filter((entry) => entry.priority === 'P1')
  const md = report.render(oneBand, 'es').markdown
  assert.ok(md.includes('**P1 · Pronto**') && !md.includes('**P0 ·') && !md.includes('**P2 ·'))
  assert.ok(md.includes('**¿Cuáles tomas?** Por ejemplo: «3».') || md.includes('«1».'))
})

test('the line since the last audit counts the items not re-audited because their topics were left out, in Spanish and in English', () => {
  const later = fixture()
  later.triage.sinceLast = { previous: { date: '2026-10-12' }, resolved: [], notReaudited: [{ causeKey: 'doc', title: 'Doc drift', topic: 'docs' }, { causeKey: 'rel', title: 'Two versions', topic: 'releases' }] }
  assert.ok(report.render(later, 'es').markdown.includes('3 nuevos, 1 siguen, 0 resueltos. 2 sin revisar esta vez, porque sus temas quedaron fuera.'))
  assert.ok(report.render(later, 'en').markdown.includes('3 new, 1 still open, 0 resolved. 2 not re-audited, because their topics were left out.'))
  assert.doesNotMatch(report.render(fixture(), 'es').markdown, /sin revisar esta vez/)
})

test('the path of the saved report is said only when there is one', () => {
  const withPath = report.render(fixture(), 'es', { savedTo: '/data/audits/k/2026-11-04' }).markdown
  assert.ok(withPath.includes('La lista completa está en el reporte guardado: /data/audits/k/2026-11-04'))
})

test('the English report has the same sections with English labels, and any other language gets English (R3)', () => {
  const md = report.render(fixture(), 'en').markdown
  assert.match(md.split('\n')[0], /tienda-api.*2026-11-04.*3 topics.*47 findings.*19 survived verification/)
  const order = ['**Awaiting your yes**', '**Assumptions**', '**P0 · Now**', '**P1 · Soon**', '**P2 · Schedulable**', '**P3 · When you can / ideas**', '**Unverified (not ranked)**', '**Since the last audit', '**Discarded', '**Not covered', '**RADAR', '**Which do you take?**']
  let at = -1
  for (const label of order) {
    const i = md.indexOf(label)
    assert.ok(i > at, `${label} is missing or out of order`)
    at = i
  }
  assert.ok(md.includes('1. **[Bug · proven]**'))
  assert.ok(md.includes('*Why P0:* charges real customers on every provider outage · Small · one agent · new'))
  assert.equal(report.render(fixture(), 'fr').markdown, md)
  assert.equal(report.render(fixture(), 'es-MX').markdown, report.render(fixture(), 'es').markdown)
})

function writeInputs(dir, fx) {
  const files = {}
  for (const [name, value] of [['meta', fx.meta], ['analysis', fx.analysis], ['triage', fx.triage]]) {
    files[name] = path.join(dir, `${name}.json`)
    fs.writeFileSync(files[name], JSON.stringify(value))
  }
  return files
}

test('report --save writes report.json and report.md under the data directory, says the path, and leaves the project untouched (R24, C6)', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const files = writeInputs(work, fixture())
  const args = ['report', '--meta', files.meta, '--analysis', files.analysis, '--triage', files.triage, '--lang', 'es']
  const env = { AETHER_DATA_DIR: dataDir }
  const unsaved = runBin(BIN, args, repo.dir, env)
  assert.equal(unsaved.status, 0, unsaved.stdout + unsaved.stderr)
  assert.equal(unsaved.json.saved, undefined)
  assert.equal(fs.existsSync(path.join(dataDir, 'audits')), false)
  const r = runBin(BIN, [...args, '--save'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const dir = path.join(dataDir, 'audits', 'tienda-api-0123456789ab', '2026-11-04')
  assert.equal(r.json.saved, dir)
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'))
  assert.equal(saved.list.length, 5)
  assert.equal(saved.list[0].causeKey, 'charge-no-idempotency')
  assert.equal(saved.meta.durationSeconds, 1560)
  assert.deepEqual(saved.meta.topics, ['bugs', 'security', 'tests'])
  assert.deepEqual(saved.sections, SECTIONS)
  const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8')
  assert.equal(md, r.json.markdown)
  assert.ok(md.includes(`La lista completa está en el reporte guardado: ${dir}`))
  assert.equal(repo.git('status', '--porcelain'), '')
  const again = runBin(BIN, [...args, '--save'], repo.dir, env)
  assert.equal(again.json.saved, `${dir}-2`)
  assert.equal(store.previousReport(dataDir, 'tienda-api-0123456789ab').dir, `${dir}-2`)
  assert.equal(store.estimate(dataDir).samples, 2)
})

test('--out writes the whole result outside the project and prints a summary; a missing flag is exit 2 and a missing file is exit 1', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const files = writeInputs(work, fixture())
  const out = path.join(work, 'report-out.json')
  const r = runBin(BIN, ['report', '--meta', files.meta, '--analysis', files.analysis, '--triage', files.triage, '--lang', 'en', '--out', out], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.out, out)
  assert.equal(r.json.summary.sections, 11)
  const written = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(written.sections, SECTIONS)
  assert.ok(written.markdown.includes('**Awaiting your yes**'))
  assert.equal(runBin(BIN, ['report', '--meta', files.meta], repo.dir).status, 2)
  const missing = runBin(BIN, ['report', '--meta', path.join(work, 'nope.json'), '--analysis', files.analysis, '--triage', files.triage], repo.dir)
  assert.equal(missing.status, 1)
  assert.match(missing.json.error, /nope\.json/)
})
```

**Acceptance:**

- `node --test tests/audit-foundation.test.js` pasa; `tests/bins-thin.test.js`, `tests/commands.test.js`, `tests/guards.test.js` (cabecera y familia de cada archivo, sin funciones repetidas ni nombres sin uso), `tests/docs-facts.test.js`, `tests/components-docs.test.js`, `tests/docs-claims.test.js` y `tests/observe-bin.test.js` pasan con el bin nuevo; `npm test` pasa.
- `aether-audit report` imprime una sola línea JSON; con `--save` el reporte queda en `<directorio de datos>/audits/<clave>/<fecha>` y nunca dentro del proyecto.
- El orden, las etiquetas y los textos de arriba son los del prototipo y de R21 a R23; el texto fijo de cada sección está en una tabla por idioma, no en el cuerpo de las funciones.

### Task 3: La lectura del repositorio

**Aether:**
- Review: xhigh — a leaked secret value or a missed change to the user's project would reach user data and security
- Area: audit-scan
- Owns: `plugins/aether/lib/audit-snapshot.js`, `plugins/aether/lib/audit-scan.js`, `plugins/aether/lib/audit-github.js`, `plugins/aether/lib/run.js`, `tests/audit-scan.test.js`
- Depends on: Task 2 — la familia `audit` y `audit-exec.js` los crea la Tarea 2
- Serves: R4, R5, R6, R7, R8, R27

Lee el repositorio sin modelos y sin tocarlo: las fotografías de R6, los secretos de R7, los TODO, las ramas, los hotspots de R8 y los issues y PR de `gh`. Cada revisión devuelve un `Check`. En `lib/run.js` solo se agrega `EXCLUDES` a las exportaciones (la lista de las tres líneas de exclusión de Aether, `['/.aether/', '/.aether-tmp/', '/.aether-exam/']`, que ya existe en el archivo).

**Interfaces:**

`plugins/aether/lib/audit-snapshot.js`:

```js
// snapshot(root) -> {
//   head: string,                                   // git rev-parse HEAD
//   branch: string,                                 // the current branch, '' when detached
//   status: [{ path, code, hash }],                 // git status --porcelain=v1 -z --untracked-files=all (ignored files are not listed);
//                                                   // hash = sha1 of the file's bytes, null when the file does not exist; paths under .aether/, .aether-tmp/ and .aether-exam/ are left out
//   worktrees: string[],                            // the paths of git worktree list --porcelain
//   branches: { [refname]: sha },                   // git for-each-ref refs/heads refs/remotes
//   stash: string[],                                // git stash list --format=%gd %H
//   exclude: string[],                              // the lines of <git-common-dir>/info/exclude, without the lines of EXCLUDES of lib/run.js
// }
function snapshot(root) {}
// diffSnapshots(a, b) -> { changed: boolean, items: [{ kind, files?, before?, after? }] }
// kind is one of 'head' (HEAD or the current branch moved), 'status' (files = the paths whose code or hash differ, or that appear or disappear),
// 'worktrees', 'branches', 'stash', 'exclude'. changed is items.length > 0.
function diffSnapshots(a, b) {}
// steps = [{ name, run: async () => value }]. Takes exactly one snapshot before and one after each step with snapshotFn (default: snapshot), in that order, and runs the steps in order.
// A step must not throw. -> Promise<{ results: value[], changes: {
//   changed: boolean,                                                  // diffSnapshots(first snapshot, last snapshot).changed
//   attributed: [{ step, items }],                                     // the diff of the snapshots around a step, when it has items
//   unattributable: [{ between: [stepA, stepB], items }],              // the diff between the snapshot after stepA and the one before stepB, when it has items
// } }>
async function withSnapshots(root, steps, { snapshotFn = snapshot } = {}) {}
```

`plugins/aether/lib/audit-scan.js` (todas devuelven un `Check`; `secrets` es asíncrona porque lee un flujo; las demás son síncronas):

```js
// The secret patterns are a table of data: [{ type, pattern, confidence }] with these types:
//   aws-access-key-id  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/            high
//   github-token       /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/   high
//   stripe-live-key    /\b[rs]k_live_[0-9A-Za-z]{24,}\b/          high
//   slack-token        /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/         high
//   google-api-key     /\bAIza[0-9A-Za-z_-]{35}\b/                high
//   private-key-block  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/   high
//   generic-assignment /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"'\s]{12,}["']/i   low
// redact(text) -> text with every match replaced by `[redacted <type>]`.
function redact(text) {}
// secrets(root, { maxHistoryBytes = 200 * 1024 * 1024, timeoutMs = 60000 } = {}) -> Promise<Check>
//   { state: 'result', findings: [{ type, file, line, commit, inTree, confidence }], truncated }
// Reads the tracked files of HEAD (git ls-files, line numbers) and the added lines of the history of EVERY branch
// (git log --all -p -U0 --format='commit %H', read as a stream: track the commit and the file of each hunk). One finding per (type, file):
// inTree true with its line when the value is in the tree now (line null otherwise), commit = the commit that first added it (full sha) or null,
// confidence from the table. The value of a match is NEVER stored: no field, no message, no error text holds it or a part of it.
// truncated is true when the history was cut by maxHistoryBytes or timeoutMs.
async function secrets(root, options) {}
// todos(root, { max = 200 } = {}) -> Check { state: 'result', total, items: [{ file, line, tag: 'TODO' | 'FIXME', text }], truncated }
// git grep -n -I -E '\b(TODO|FIXME)\b' over the tracked files; text is the trimmed line cut at 160 characters, passed through redact().
function todos(root, options) {}
// hotspots(root, { top = 10, months = 12 } = {}) -> Check { state: 'result', items: [{ file, changes, lines, score }] }
// changes = the commits of the last `months` months that touched the file (git log --since --name-only --format=), lines = its line count at HEAD
// (files that no longer exist, binary files and generated or vendored paths -- lock files, *.min.js, node_modules/, vendor/, dist/, build/ -- are left out).
// score = changes * Math.log2(lines + 1); only files with changes >= 2; sorted by score descending, then by path; the first `top`.
function hotspots(root, options) {}
// branches(root, { now = new Date(), staleDays = 60 } = {}) -> Check
//   { state: 'result', default: string, stale: number, items: [{ name, kind: 'local' | 'remote', lastCommit: ISO string, ageDays, aheadOfDefault, merged, stale }] }
// default = the branch origin/HEAD points to, else 'main', else 'master', else the current branch. ageDays = floor((now - committer date) / 86400000).
// stale = ageDays >= staleDays and not the default branch. aheadOfDefault = commits not in the default branch. merged = the tip is in the default branch.
function branches(root, options) {}
```

`plugins/aether/lib/audit-github.js`:

```js
// ctx = { exec, env, now = new Date() }. Both return Promise<Check>.
// not-applicable ("the remote is not GitHub" / "no remote") unless the origin (or first) remote's host is github.com.
// Runs: gh issue list --state open --limit 200 --json number,title,createdAt,labels,url
//       gh pr list --state open --limit 200 --json number,title,createdAt,isDraft,headRefName,url        (cwd = root, env = ctx.env)
// exec error ENOENT -> could-not "gh is not installed"; status != 0 -> could-not `gh failed: <first line of stderr>`; stdout that is not JSON -> could-not "gh output not understood".
// issues -> { state: 'result', open: [{ number, title, createdAt, ageDays, labels: [name], url }], olderThan90: n }
// prs    -> { state: 'result', open: [{ number, title, createdAt, ageDays, draft, branch, url }] }
async function issues(root, ctx) {}
async function prs(root, ctx) {}
```

**Tests (write first):**

`tests/audit-scan.test.js`:

```js
'use strict'

// Spec 026 (R4 to R8, R27): the reading of the repository: snapshots, secrets without their values, TODO, branches, hotspots, issues and PR.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, makeRepo, tempDir, commitIn } = require('./helpers.js')

const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const snap = lib('audit-snapshot.js')
const scan = lib('audit-scan.js')
const github = lib('audit-github.js')

// Fake values, built here so that no file of the repository holds one whole.
const STRIPE = ['sk', 'live', 'a1B2c3D4e5F6g7H8i9J0k1L2m3'].join('_')
const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE'
const GITHUB = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const leaks = (text, value) => {
  for (let i = 0; i + 8 <= value.length; i++) if (text.includes(value.slice(i, i + 8))) return true
  return false
}

function commitOn(repo, file, content, message, isoDate) {
  fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, file), content)
  repo.git('add', file)
  const r = spawnSync('git', ['commit', '-q', '-m', message], { cwd: repo.dir, encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: isoDate, GIT_AUTHOR_DATE: isoDate } })
  assert.equal(r.status, 0, r.stderr)
}
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString()
const fake = (reply) => {
  const calls = []
  const exec = async (file, args, opts) => { calls.push([file, ...args]); return typeof reply === 'function' ? reply(file, args, opts) : reply }
  exec.calls = calls
  return exec
}

test('a snapshot of a quiet repository equals the next one, and the lines and the folder of Aether do not count (R6, R25)', (t) => {
  const repo = makeRepo(t)
  const before = snap.snapshot(repo.dir)
  assert.equal(snap.diffSnapshots(before, snap.snapshot(repo.dir)).changed, false)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'state.json'), '{}')
  assert.equal(snap.diffSnapshots(before, snap.snapshot(repo.dir)).changed, false, 'the folder .aether/ does not count even before its exclude lines')
  const exclude = path.join(repo.dir, '.git', 'info', 'exclude')
  fs.mkdirSync(path.dirname(exclude), { recursive: true })
  fs.appendFileSync(exclude, '/.aether/\n/.aether-tmp/\n/.aether-exam/\n')
  assert.equal(snap.diffSnapshots(before, snap.snapshot(repo.dir)).changed, false, 'the three exclude lines of Aether do not count')
  fs.appendFileSync(exclude, '/private-notes/\n')
  assert.deepEqual(snap.diffSnapshots(before, snap.snapshot(repo.dir)).items.map((i) => i.kind), ['exclude'])
})

test('a change to a tracked file counts, also when it was already modified; an ignored file does not; a new untracked file does (R6)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, '.gitignore', 'coverage/\n', 'ignore coverage')
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'a\n')
  const one = snap.snapshot(repo.dir)
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'b\n')
  const two = snap.snapshot(repo.dir)
  const d = snap.diffSnapshots(one, two)
  assert.equal(d.changed, true)
  assert.deepEqual(d.items.map((i) => [i.kind, i.files]), [['status', ['README.md']]])
  fs.mkdirSync(path.join(repo.dir, 'coverage'))
  fs.writeFileSync(path.join(repo.dir, 'coverage', 'lcov.info'), 'x')
  assert.equal(snap.diffSnapshots(two, snap.snapshot(repo.dir)).changed, false)
  fs.writeFileSync(path.join(repo.dir, 'notes.txt'), 'x')
  assert.deepEqual(snap.diffSnapshots(two, snap.snapshot(repo.dir)).items.map((i) => i.files), [['notes.txt']])
})

test('a commit, a branch, a stash and a worktree are changes of their own kind (R6)', (t) => {
  const repo = makeRepo(t)
  const kinds = (fn) => {
    const before = snap.snapshot(repo.dir)
    fn()
    return snap.diffSnapshots(before, snap.snapshot(repo.dir)).items.map((i) => i.kind)
  }
  assert.ok(kinds(() => commitIn(repo, repo.dir, 'a.txt', 'a', 'a')).includes('head'))
  assert.ok(kinds(() => repo.git('branch', 'other')).includes('branches'))
  assert.ok(kinds(() => { fs.appendFileSync(path.join(repo.dir, 'a.txt'), 'x'); repo.git('stash', 'push', '-q', '-m', 'wip') }).includes('stash'))
  assert.ok(kinds(() => repo.git('worktree', 'add', '-q', '-b', 'wt', path.join(tempDir(t), 'wt'))).includes('worktrees'))
})

test('withSnapshots attributes a change to the step that made it and calls a change between two steps unattributable (R6)', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, '.gitignore', 'coverage/\n', 'ignore coverage')
  const steps = [
    { name: 'tests', run: async () => { fs.mkdirSync(path.join(repo.dir, 'coverage')); fs.writeFileSync(path.join(repo.dir, 'coverage', 'lcov.info'), 'x') } },
    { name: 'lint', run: async () => { fs.appendFileSync(path.join(repo.dir, 'README.md'), 'fixed\n'); return 'lint done' } },
    { name: 'dependencies', run: async () => 'ok' },
  ]
  let calls = 0
  const snapshotFn = (root) => {
    calls++
    if (calls === 5) fs.writeFileSync(path.join(root, 'other-session.txt'), 'x\n') // another session, after the second step and before the third
    return snap.snapshot(root)
  }
  const out = await snap.withSnapshots(repo.dir, steps, { snapshotFn })
  assert.equal(calls, 6, 'one snapshot before and one after each step')
  assert.deepEqual(out.results, [undefined, 'lint done', 'ok'])
  assert.equal(out.changes.changed, true)
  assert.deepEqual(out.changes.attributed.map((a) => a.step), ['lint'])
  assert.deepEqual(out.changes.attributed[0].items[0].files, ['README.md'])
  assert.deepEqual(out.changes.unattributable.map((u) => u.between), [['lint', 'dependencies']])
  assert.deepEqual(out.changes.unattributable[0].items[0].files, ['other-session.txt'])
})

test('secrets: the tree and the history of every branch are read and no value is ever printed (R4, R7, scenario 8)', async (t) => {
  const repo = makeRepo(t)
  commitOn(repo, 'config/dev.env', `STRIPE_KEY=${STRIPE}\n`, 'add dev env', daysAgo(30))
  const oldCommit = repo.git('rev-parse', 'HEAD')
  repo.git('rm', '-q', 'config/dev.env')
  repo.git('commit', '-q', '-m', 'remove dev env')
  commitOn(repo, 'src/config.js', `// config\nconst id = '${AWS}'\n`, 'add config', daysAgo(10))
  repo.git('switch', '-q', '-c', 'side')
  commitOn(repo, 'leak.txt', `token ${GITHUB}\n`, 'leak on a side branch', daysAgo(5))
  repo.git('switch', '-q', 'feature/x')
  const result = await scan.secrets(repo.dir)
  assert.equal(result.state, 'result')
  assert.equal(result.truncated, false)
  const byFile = Object.fromEntries(result.findings.map((f) => [f.file, f]))
  assert.deepEqual([byFile['config/dev.env'].type, byFile['config/dev.env'].inTree, byFile['config/dev.env'].commit, byFile['config/dev.env'].line], ['stripe-live-key', false, oldCommit, null])
  assert.deepEqual([byFile['src/config.js'].type, byFile['src/config.js'].inTree, byFile['src/config.js'].line], ['aws-access-key-id', true, 2])
  assert.match(byFile['src/config.js'].commit, /^[0-9a-f]{40}$/)
  assert.deepEqual([byFile['leak.txt'].type, byFile['leak.txt'].inTree], ['github-token', false])
  assert.match(byFile['leak.txt'].commit, /^[0-9a-f]{40}$/)
  const text = JSON.stringify(result)
  for (const value of [STRIPE, AWS, GITHUB]) assert.equal(leaks(text, value), false, `a part of ${value.slice(0, 6)}... is in the result`)
})

test('secrets: an assignment of a long literal is a low-confidence finding, an environment read and a short literal are not, and a clean repository has none', async (t) => {
  const repo = makeRepo(t)
  commitOn(repo, 'a.py', 'password = "hunter2hunter2hunter2"\ntoken = os.environ["TOKEN"]\nsecret = "short"\n', 'assignments', daysAgo(1))
  const result = await scan.secrets(repo.dir)
  assert.deepEqual(result.findings.map((f) => [f.type, f.file, f.line, f.confidence]), [['generic-assignment', 'a.py', 1, 'low']])
  assert.equal(leaks(JSON.stringify(result), 'hunter2hunter2hunter2'), false)
  const clean = await scan.secrets(makeRepo(t).dir)
  assert.deepEqual([clean.state, clean.findings], ['result', []])
})

test('secrets: a history larger than the cap is read in part and says so', async (t) => {
  const repo = makeRepo(t)
  commitOn(repo, 'big.txt', 'x\n'.repeat(5000), 'big', daysAgo(1))
  const result = await scan.secrets(repo.dir, { maxHistoryBytes: 100 })
  assert.equal(result.state, 'result')
  assert.equal(result.truncated, true)
})

test('redact replaces every secret-looking value by its type', () => {
  assert.equal(scan.redact(`a ${AWS} b`), 'a [redacted aws-access-key-id] b')
  assert.equal(scan.redact('nothing here'), 'nothing here')
})

test('todos: TODO and FIXME of the tracked files, with file and line, the text redacted (R4)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'src/a.js', 'one\ntwo\n// TODO: fix the retry\n', 'a')
  commitIn(repo, repo.dir, 'src/b.py', '# FIXME later\nx = 1\n', 'b')
  commitIn(repo, repo.dir, 'src/c.js', `// TODO use ${AWS}\n`, 'c')
  fs.writeFileSync(path.join(repo.dir, 'untracked.js'), '// TODO not tracked\n')
  const r = scan.todos(repo.dir)
  assert.equal(r.state, 'result')
  assert.equal(r.total, 3)
  const by = Object.fromEntries(r.items.map((i) => [i.file, i]))
  assert.deepEqual([by['src/a.js'].line, by['src/a.js'].tag, by['src/a.js'].text], [3, 'TODO', '// TODO: fix the retry'])
  assert.deepEqual([by['src/b.py'].line, by['src/b.py'].tag], [1, 'FIXME'])
  assert.equal(leaks(JSON.stringify(r), AWS), false)
  assert.ok(by['src/c.js'].text.includes('[redacted aws-access-key-id]'))
  assert.equal(by['untracked.js'], undefined)
})

test('hotspots: ordered by how much a file changes and how big it is, and a big file that hardly changes stays below one that changes a lot (R8)', (t) => {
  const repo = makeRepo(t)
  const body = (lines, tag) => 'x\n'.repeat(lines - 1) + `// ${tag}\n`
  commitIn(repo, repo.dir, 'big.js', body(400, 0), 'big once')
  for (let i = 0; i < 2; i++) commitIn(repo, repo.dir, 'big2.js', body(400, i), `big2 ${i}`)
  for (let i = 0; i < 6; i++) commitIn(repo, repo.dir, 'hot.js', body(20, i), `hot ${i}`)
  for (let i = 0; i < 3; i++) commitIn(repo, repo.dir, 'mid.js', body(20, i), `mid ${i}`)
  const r = scan.hotspots(repo.dir)
  assert.equal(r.state, 'result')
  assert.deepEqual(r.items.map((i) => i.file), ['hot.js', 'big2.js', 'mid.js'])
  assert.deepEqual([r.items[0].changes, r.items[0].lines], [6, 20])
  assert.equal(typeof r.items[0].score, 'number')
  assert.ok(r.items[0].score > r.items[1].score && r.items[1].score > r.items[2].score)
})

test('branches: the age, the lead over the default branch and whether each is merged; a branch is stale after 60 days (R4)', (t) => {
  const repo = makeRepo(t)
  repo.git('switch', '-q', 'main')
  repo.git('switch', '-q', '-c', 'old')
  commitOn(repo, 'old.txt', 'x', 'old work', daysAgo(100))
  repo.git('switch', '-q', 'main')
  repo.git('branch', 'merged')
  const r = scan.branches(repo.dir, { now: new Date() })
  assert.equal(r.state, 'result')
  assert.equal(r.default, 'main')
  const by = Object.fromEntries(r.items.map((i) => [i.name, i]))
  assert.deepEqual([by.old.stale, by.old.merged, by.old.aheadOfDefault, by.old.kind], [true, false, 1, 'local'])
  assert.ok(by.old.ageDays >= 100 && by.old.ageDays < 101)
  assert.deepEqual([by.merged.stale, by.merged.merged, by.merged.aheadOfDefault], [false, true, 0])
  assert.equal(by.main.stale, false)
  assert.equal(r.stale, 1)
})

const issuesJson = JSON.stringify([{ number: 41, title: 'Export CSV', createdAt: daysAgo(100), labels: [{ name: 'enhancement' }], url: 'https://github.com/o/r/issues/41' }])
const prsJson = JSON.stringify([{ number: 7, title: 'Fix stock', createdAt: daysAgo(3), isDraft: true, headRefName: 'fix/stock', url: 'https://github.com/o/r/pull/7' }])

test('github: a GitHub remote and a gh that answers give the open issues and PR with their age (R4, R17)', async (t) => {
  const repo = makeRepo(t)
  repo.git('remote', 'add', 'origin', 'git@github.com:o/r.git')
  const exec = fake((file, args) => ({ status: 0, stdout: args[0] === 'issue' ? issuesJson : prsJson, stderr: '', timedOut: false }))
  const issues = await github.issues(repo.dir, { exec, env: {} })
  assert.equal(issues.state, 'result')
  assert.deepEqual(issues.open.map((i) => [i.number, i.labels]), [[41, ['enhancement']]])
  assert.ok(issues.open[0].ageDays >= 100)
  assert.equal(issues.olderThan90, 1)
  assert.deepEqual(exec.calls[0].slice(0, 3), ['gh', 'issue', 'list'])
  assert.ok(exec.calls[0].includes('--state') && exec.calls[0].includes('open'))
  const prs = await github.prs(repo.dir, { exec, env: {} })
  assert.equal(prs.state, 'result')
  assert.deepEqual(prs.open.map((p) => [p.number, p.draft, p.branch]), [[7, true, 'fix/stock']])
  assert.deepEqual(exec.calls[1].slice(0, 3), ['gh', 'pr', 'list'])
})

test('github: no GitHub remote is not applicable, a missing gh and a failing gh could not be read, and nothing runs without a GitHub remote', async (t) => {
  const never = fake({ status: 0, stdout: '[]', stderr: '', timedOut: false })
  const none = makeRepo(t)
  const a = await github.issues(none.dir, { exec: never, env: {} })
  assert.equal(a.state, 'not-applicable')
  none.git('remote', 'add', 'origin', 'https://gitlab.com/o/r.git')
  const b = await github.prs(none.dir, { exec: never, env: {} })
  assert.equal(b.state, 'not-applicable')
  assert.match(b.reason, /not GitHub/)
  assert.equal(never.calls.length, 0)
  const repo = makeRepo(t)
  repo.git('remote', 'add', 'origin', 'https://github.com/o/r.git')
  const missing = await github.issues(repo.dir, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: 'ENOENT', message: 'spawn gh ENOENT' } }), env: {} })
  assert.deepEqual([missing.state, missing.reason], ['could-not', 'gh is not installed'])
  const failing = await github.issues(repo.dir, { exec: fake({ status: 1, stdout: '', stderr: 'HTTP 401: bad credentials\nmore', timedOut: false }), env: {} })
  assert.equal(failing.state, 'could-not')
  assert.match(failing.reason, /gh failed: HTTP 401: bad credentials/)
  const garbage = await github.prs(repo.dir, { exec: fake({ status: 0, stdout: 'not json', stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([garbage.state, garbage.reason], ['could-not', 'gh output not understood'])
})
```

**Acceptance:**

- `node --test tests/audit-scan.test.js` pasa; `tests/guards*.test.js` y `tests/layers.test.js` pasan con los módulos nuevos; `npm test` pasa.
- Ninguna salida de `secrets`, `todos` ni de un error contiene el valor de un secreto ni una parte de él; el ejecutor de producción nunca se llama con un comando que corrija (`audit-github.js` solo corre `gh issue list` y `gh pr list`).
- `snapshot` no escribe nada en el repositorio (solo lee con `git` y el sistema de archivos).

### Task 4: Los comandos propios del proyecto y el comando `analyze`

**Aether:**
- Review: xhigh — a pattern the reader misses runs a deploy, a migration or a publish of the user's own project (R4)
- Area: audit-tools
- Owns: `plugins/aether/lib/audit-risk.js`, `plugins/aether/lib/audit-tools.js`, `plugins/aether/lib/audit-analyze.js`, `tests/audit-analyze.test.js`
- Depends on: Task 2 — `audit-exec.js`, `audit-store.js` y `audit.js` (el despacho de `analyze`) los crea la Tarea 2
- Depends on: Task 3 — `analyze` junta las fotografías, `audit-scan.js` y `audit-github.js` de la Tarea 3, y `audit-tools.js` redacta con `redact`
- Serves: R4, R5, R6, R7, R10, R27

Lee el comando de tests (y el del linter y el de la auditoría de dependencias) antes de correrlo, los corre con tope de tiempo y sin instalar nada, y arma el análisis completo. La decisión de profundidad de la lectura está en `plan.md`, D3.

**Interfaces:**

`plugins/aether/lib/audit-risk.js`:

```js
// assess(root, commandLine) -> { runnable: boolean, reasons: [{ id, via: string[], text }] }
// Reads what commandLine would run, WITHOUT running anything. commandLine is what a person types: `npm test`, `pnpm test`, `yarn test`,
// `bun run test`, `npm run lint`, `make test`, `composer test`, `tox`, `pytest`, `cargo test`, `go test ./...`, or any `sh -c` line.
// Split the line on &&, ||, ;, | and newlines. For each segment:
//  - npm/pnpm/yarn/bun [run|run-script] <name>, `npm test|t|start|stop|restart`, `npm <name>` for those builtin names: resolve <name> in package.json "scripts",
//    plus its hooks `pre<name>` and `post<name>`; run-s / run-p / npm-run-all with names or globs (`test:*`): every matching script.
//  - make <target>: the recipe lines of the target in the Makefile and, recursively, its prerequisites and `$(MAKE) x` / `make x`.
//  - composer <name> / composer run-script <name>: composer.json scripts (a string or an array; `@name` refers to another script).
//  - tox: the `commands`, `commands_pre` and `commands_post` lines of every [testenv...] section of tox.ini.
//  - a local script file named in a segment (`sh x.sh`, `bash x.sh`, `./x.sh`, `node x.js`, `python x.py`, a path inside root): its text is read one level
//    (up to 64 KB and 400 lines) and scanned with the same patterns, and not followed further.
// `via` is the chain of names from the requested one to the culprit, for example ['npm test', 'pretest', 'db:seed'] or ['npm test', 'ci/test.sh'].
// Limits: at most 5 levels (the requested script is level 1) and 40 scripts; cycles are cut with a visited set.
// Reasons (id): 'deploys', 'migrates', 'seeds', 'live-e2e', 'credentials', 'fixes', 'installs' (the RISKS table below), 'too-deep', 'too-wide',
//   'computed' (a script name that is `$VAR`, `$(...)` or a backtick expression), 'unresolved' (a named script that the manifest does not define).
// Fail closed: any reason makes runnable false. text says it in a sentence, e.g. "`npm test` reaches `db:seed` through `pretest`: it seeds data".
function assess(root, commandLine) {}
// The table of data, one row per class, applied to the NAME of each script and to the TEXT of each segment and file:
//   deploys     name /(^|[:_-])(deploy|release|publish|rollout)\b/ ; text /npm publish|yarn publish|pnpm publish|docker push|kubectl (apply|delete|rollout)|helm (install|upgrade)|terraform (apply|destroy)|pulumi up|serverless deploy|sls deploy|vercel\b|netlify deploy|firebase deploy|gh release|git push|twine upload|cargo publish|gem push|fly deploy|heroku\b/
//   migrates    name /migrat|db:push/ ; text /\bmigrate\b|prisma (migrate|db push)|knex migrate|sequelize db:migrate|alembic upgrade|manage\.py migrate|flyway|liquibase|typeorm migration:run/
//   seeds       name /\bseed|fixtures:load/ ; text /\bseed(s|ing)?\b|db:seed|fixtures:load/
//   live-e2e    name /\be2e\b|end-to-end|:live\b|smoke/ ; text /cypress (run|open)|playwright test|selenium|puppeteer|detox|appium/
//   credentials text /\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|PRIVATE_KEY)[A-Za-z0-9_]*\}?|--token\b|--password\b|\b(aws|gcloud)\s|az login|aws-vault|vault (read|login)|op (run|read)|doppler run/
//   fixes       text /--fix\b|--write\b|audit fix|git (fetch|pull|push|commit|add|checkout|reset|clean|stash|merge|rebase|worktree|branch)\b/
//   installs    text /\b(npm|pnpm|yarn|bun) (i|install|ci|add)\b|pip install|poetry install|bundle install|composer install|go get|cargo install/
const RISKS = [ /* one { id, name, text } row per class above */ ]
```

`plugins/aether/lib/audit-tools.js`:

```js
// ctx = { exec, env, timeoutMs = 300000, noTests = false, testsCommand = null }. Every runner returns Promise<Check>.
// discoverTests(root, { testsCommand }) -> { found: true, command, source } | { found: false, reason }
//   1. testsCommand given -> { command: testsCommand, source: 'given by the Lead' }
//   2. package.json scripts.test (not the npm placeholder `echo "Error: no test specified" && exit 1`): `pnpm test` with pnpm-lock.yaml, `yarn test` with yarn.lock, `bun run test` with bun.lock or bun.lockb, else `npm test`; source 'package.json scripts.test'
//   3. composer.json scripts.test -> `composer test`
//   4. a Makefile with a `test:` target -> `make test`
//   5. tox.ini with a [testenv -> `tox`; else pytest.ini, a [tool.pytest section in pyproject.toml, or a [tool:pytest] section in setup.cfg -> `python -m pytest`
//   6. Cargo.toml -> `cargo test`; go.mod -> `go test ./...`; a *.sln or *.csproj in root -> `dotnet test`
//   none -> reason 'no manifest or build file declares tests'
// discoverLint(root) -> same shape: package.json scripts.lint -> `<pm> run lint`; composer scripts.lint -> `composer lint`; a Makefile `lint:` target -> `make lint`;
//   ruff.toml, .ruff.toml or a [tool.ruff section in pyproject.toml -> `ruff check .`; a .flake8 file -> `flake8`; none -> reason 'no linter declared'
// discoverAudit(root) -> { found: true, command, tool, ecosystem } | { found: false, reason }
//   package-lock.json -> `npm audit --json`; pnpm-lock.yaml -> `pnpm audit --json`; node without a lockfile -> reason 'package.json has no lockfile';
//   requirements*.txt or pyproject.toml -> `pip-audit -f json`; composer.lock -> `composer audit --format=json`; Cargo.lock -> `cargo audit --json`; none -> reason 'no supported dependency manifest'
// runTests(root, ctx) -> Check:
//   noTests -> not-applicable "the person skipped the tests with --no-tests"; nothing found -> not-applicable (the reason of discoverTests);
//   a package.json with dependencies or devDependencies and no node_modules folder -> could-not "dependencies are not installed (node_modules is missing); the audit never installs";
//   assess() not runnable -> { state: 'could-not', notRun: true, command, reason: <the texts of the reasons joined with '; '> } and exec is NOT called;
//   else exec('sh', ['-c', command], { cwd: root, env: projectEnv(ctx.env), timeoutMs }):
//     timedOut -> could-not `the tests ran past the cap of <n> s` with timedOut: true; error ENOENT -> could-not "the tool is not installed";
//     else { state: 'result', command, source, exitCode, passed: exitCode === 0, durationMs, output } where output is the last 40 lines of stdout then stderr, passed through redact().
// runLint(root, ctx) -> Check, the same flow ({ state: 'result', command, exitCode, passed, durationMs, output }); a lint command that assess() refuses (for example `eslint --fix .`) is could-not with notRun.
// runAudit(root, ctx) -> Check { state: 'result', tool, counts: { critical, high, moderate, low, unknown, total }, top: [{ name, severity }] } (top: up to 10, by severity).
//   It reads the JSON that the tool prints, whatever the exit code (npm audit exits 1 when it finds something). Parsers:
//   npm/pnpm: { vulnerabilities: { <name>: { severity } } } (info counts as low); pip-audit: { dependencies: [{ name, vulns: [...] }] } (severity unknown, one entry per package that has vulns);
//   composer: { advisories: { <package>: [{ severity? }] } }; cargo: { vulnerabilities: { list: [{ package: { name } }] } } (severity unknown).
//   No JSON and stderr or stdout that mentions ENOTFOUND, EAI_AGAIN, ECONNREFUSED, ETIMEDOUT or "network" -> could-not "no network"; ENOENT -> could-not "the tool is not installed";
//   anything else that is not understood -> could-not "output not understood".
async function runTests(root, ctx) {}
async function runLint(root, ctx) {}
async function runAudit(root, ctx) {}
```

`plugins/aether/lib/audit-analyze.js`:

```js
// analyze(root, opts = { noTests, testsCommand, timeoutSeconds }, ctx = { exec, env, now, dataDir }) -> Promise<analysis>
// analysis = { ok: true, version: 1, generatedAt, project: { name, key, identity, remote, root, defaultBranch },
//   checks: { tests, lint, dependencies, secrets, todos, branches, issues, prs, hotspots },   // each a Check
//   changes: { changed, attributed, unattributable },                                            // withSnapshots of audit-snapshot.js
//   selfFindings: [Finding], estimate: store.estimate(dataDir) }
// The project's own tools (runTests, runLint, runAudit) run as the three steps of withSnapshots, in that order, even when a step is not applicable.
// The other checks only read. project comes from identityOf(root); defaultBranch from the branches check.
// selfFindings: one per attributed step, shaped as an established Finding:
//   { id: 'AUDIT-<n>', topic: 'hygiene', title: `Running the ${label} changed the project`, claim, location: { file: <first changed file, or '.git'>, line: 1 }, type: 'risk',
//     trigger: `the audit ran ${command or step}`, evidence: <the kinds and files of the diff>, impact, rootCause, verification: 'proven', status: 'verified',
//     causeKey: `audit-changed-project-${step}`, source: 'analysis' }   with label tests -> 'tests', lint -> 'linter', dependencies -> 'dependency audit'.
async function analyze(root, opts, ctx) {}
// command(args, ctx): flags --no-tests, --tests-command <cmd>, --timeout-seconds <n> (an integer from 1 to 1800; otherwise a usage error).
// The root is the top of the git worktree of ctx.cwd (an error "not a git repository" when there is none). The exec is runCommand of audit-exec.js.
// -> { code: 0, result: analysis, summary: { states: { <check>: state }, changed, selfFindings: n } }
async function command(args, ctx) {}
```

**Tests (write first):**

`tests/audit-analyze.test.js`:

```js
'use strict'

// Spec 026 (R4 to R7, R10, R27): the reading of a command before it runs, the project's own tools, and the analysis as a whole.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin, commitIn } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const risk = lib('audit-risk.js')
const tools = lib('audit-tools.js')
const analyze = lib('audit-analyze.js')
const store = lib('audit-store.js')

const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE'
const pkg = (scripts, extra = {}) => JSON.stringify({ name: 'x', scripts, ...extra })
function projectDir(t, files) {
  const dir = tempDir(t)
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}
const fake = (reply) => {
  const calls = []
  const exec = async (file, args, opts) => { calls.push({ file, args, opts }); return typeof reply === 'function' ? reply(file, args, opts) : reply }
  exec.calls = calls
  return exec
}
const OK = { status: 0, stdout: 'all good\n', stderr: '', timedOut: false }
const never = async () => { throw new Error('no external command should run') }

const CASES = [
  ['a harmless script', { 'package.json': pkg({ test: 'node --test', lint: 'eslint .', build: 'tsc' }) }, 'npm test', null],
  ['pretest reaches a seed script', { 'package.json': pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node scripts/seed.js' }) }, 'npm test', 'seeds'],
  ['a migration in the body', { 'package.json': pkg({ test: 'prisma migrate deploy && node --test' }) }, 'npm test', 'migrates'],
  ['posttest publishes', { 'package.json': pkg({ test: 'node --test', posttest: 'npm publish' }) }, 'npm test', 'deploys'],
  ['a deploy by name', { 'package.json': pkg({ test: 'npm run deploy:staging && node --test', 'deploy:staging': 'echo staged' }) }, 'npm test', 'deploys'],
  ['end to end by glob', { 'package.json': pkg({ test: 'run-s test:*', 'test:unit': 'node --test', 'test:e2e': 'playwright test' }) }, 'npm test', 'live-e2e'],
  ['credentials by variable', { 'package.json': pkg({ test: 'node --test --token=$NPM_TOKEN' }) }, 'npm test', 'credentials'],
  ['credentials by tool', { 'package.json': pkg({ test: 'aws s3 ls && node --test' }) }, 'npm test', 'credentials'],
  ['a fixing lint', { 'package.json': pkg({ lint: 'eslint --fix .' }) }, 'npm run lint', 'fixes'],
  ['git fetch in a script', { 'package.json': pkg({ test: 'git fetch && node --test' }) }, 'npm test', 'fixes'],
  ['an install in a script', { 'package.json': pkg({ test: 'npm ci && node --test' }) }, 'npm test', 'installs'],
  ['a computed script name', { 'package.json': pkg({ test: 'npm run $TARGET' }) }, 'npm test', 'computed'],
  ['a script the manifest does not define', { 'package.json': pkg({ test: 'npm run nope' }) }, 'npm test', 'unresolved'],
  ['a script file that deploys', { 'package.json': pkg({ test: 'bash ci/test.sh' }), 'ci/test.sh': '#!/bin/sh\nkubectl apply -f k8s.yaml\n' }, 'npm test', 'deploys'],
  ['a makefile prerequisite that seeds', { Makefile: 'test: seed\n\tnode --test\n\nseed:\n\tnode seed.js\n' }, 'make test', 'seeds'],
  ['a composer script that migrates', { 'composer.json': JSON.stringify({ scripts: { test: ['@migrate', 'phpunit'], migrate: 'php artisan migrate' } }) }, 'composer test', 'migrates'],
  ['a tox command that migrates', { 'tox.ini': '[testenv]\ncommands_pre = python manage.py migrate\ncommands = pytest\n' }, 'tox', 'migrates'],
  ['a raw command that deploys', {}, 'make deploy', 'deploys'],
]

for (const [label, files, command, expected] of CASES) {
  test(`assess reads the whole chain: ${label}`, (t) => {
    const out = risk.assess(projectDir(t, files), command)
    assert.equal(out.runnable, expected === null, JSON.stringify(out.reasons))
    if (expected !== null) {
      assert.ok(out.reasons.some((r) => r.id === expected), `${expected} is not among ${out.reasons.map((r) => r.id)}`)
      assert.ok(out.reasons.every((r) => Array.isArray(r.via) && typeof r.text === 'string' && r.text.length > 0))
    }
  })
}

test('assess names the path through pretest to the script that seeds', (t) => {
  const out = risk.assess(projectDir(t, { 'package.json': pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node scripts/seed.js' }) }), 'npm test')
  const seeds = out.reasons.find((r) => r.id === 'seeds')
  assert.deepEqual(seeds.via, ['npm test', 'pretest', 'db:seed'])
  assert.match(seeds.text, /db:seed/)
})

test('assess reads five levels and 40 scripts, cuts cycles, and does not run what is deeper or wider (D3)', (t) => {
  const chain = (levels) => {
    const scripts = { test: 'npm run s0' }
    for (let i = 0; i < levels; i++) scripts[`s${i}`] = i === levels - 1 ? 'node --test' : `npm run s${i + 1}`
    return { 'package.json': pkg(scripts) }
  }
  assert.equal(risk.assess(projectDir(t, chain(4)), 'npm test').runnable, true, 'test plus four more is five levels')
  const deep = risk.assess(projectDir(t, chain(5)), 'npm test')
  assert.equal(deep.runnable, false)
  assert.ok(deep.reasons.some((r) => r.id === 'too-deep'))
  const names = Array.from({ length: 45 }, (_, i) => `a${i}`)
  const wide = { test: `run-s ${names.join(' ')}`, ...Object.fromEntries(names.map((n) => [n, 'node --test'])) }
  const out = risk.assess(projectDir(t, { 'package.json': pkg(wide) }), 'npm test')
  assert.ok(out.reasons.some((r) => r.id === 'too-wide'))
  assert.equal(risk.assess(projectDir(t, { 'package.json': pkg({ a: 'npm run b', b: 'npm run a', test: 'npm run a' }) }), 'npm test').runnable, true)
})

test('discoverTests picks the declared command in a fixed order, the Lead\'s command first, and says why when there is none (R4)', (t) => {
  const find = (files, options = {}) => tools.discoverTests(projectDir(t, files), options)
  assert.deepEqual(find({ 'package.json': pkg({ test: 'node --test' }) }), { found: true, command: 'npm test', source: 'package.json scripts.test' })
  assert.equal(find({ 'package.json': pkg({ test: 'vitest' }), 'pnpm-lock.yaml': '' }).command, 'pnpm test')
  assert.equal(find({ 'package.json': pkg({ test: 'vitest' }), 'yarn.lock': '' }).command, 'yarn test')
  assert.equal(find({ 'package.json': pkg({ test: 'echo "Error: no test specified" && exit 1' }) }).found, false)
  assert.equal(find({ 'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-q"\n' }).command, 'python -m pytest')
  assert.equal(find({ 'tox.ini': '[testenv]\ncommands = pytest\n' }).command, 'tox')
  assert.equal(find({ Makefile: 'test:\n\tnode --test\n' }).command, 'make test')
  assert.equal(find({ 'Cargo.toml': '[package]\nname = "x"\n' }).command, 'cargo test')
  assert.equal(find({ 'go.mod': 'module x\n' }).command, 'go test ./...')
  assert.equal(find({ 'composer.json': JSON.stringify({ scripts: { test: 'phpunit' } }) }).command, 'composer test')
  assert.equal(find({ 'app.csproj': '<Project />' }).command, 'dotnet test')
  assert.deepEqual(find({}), { found: false, reason: 'no manifest or build file declares tests' })
  assert.deepEqual(find({ 'package.json': pkg({ test: 'node --test' }) }, { testsCommand: 'make check' }), { found: true, command: 'make check', source: 'given by the Lead' })
})

test('discoverLint and discoverAudit read what the project declares and nothing more', (t) => {
  const lint = (files) => tools.discoverLint(projectDir(t, files))
  assert.equal(lint({ 'package.json': pkg({ lint: 'eslint .' }) }).command, 'npm run lint')
  assert.equal(lint({ 'ruff.toml': 'line-length = 100\n' }).command, 'ruff check .')
  assert.equal(lint({ '.flake8': '[flake8]\n' }).command, 'flake8')
  assert.deepEqual(lint({}), { found: false, reason: 'no linter declared' })
  const audit = (files) => tools.discoverAudit(projectDir(t, files))
  assert.equal(audit({ 'package.json': pkg({}), 'package-lock.json': '{}' }).command, 'npm audit --json')
  assert.equal(audit({ 'package.json': pkg({}), 'pnpm-lock.yaml': '' }).command, 'pnpm audit --json')
  assert.equal(audit({ 'package.json': pkg({}) }).reason, 'package.json has no lockfile')
  assert.equal(audit({ 'requirements.txt': 'flask\n' }).command, 'pip-audit -f json')
  assert.equal(audit({ 'composer.lock': '{}' }).command, 'composer audit --format=json')
  assert.equal(audit({ 'Cargo.lock': '' }).command, 'cargo audit --json')
  assert.equal(audit({}).found, false)
})

test('runTests runs the declared command through sh with an environment without secrets and a cap, and reports pass or fail (R4)', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ test: 'node --test' }), 'package-lock.json': '{}' })
  const exec = fake(OK)
  const env = { PATH: '/usr/bin', HOME: '/home/x', NPM_TOKEN: 'secret-token-value' }
  const check = await tools.runTests(dir, { exec, env, timeoutMs: 1000 })
  assert.deepEqual([check.state, check.command, check.passed, check.exitCode, typeof check.durationMs], ['result', 'npm test', true, 0, 'number'])
  assert.equal(exec.calls.length, 1)
  const call = exec.calls[0]
  assert.deepEqual([call.file, call.args, call.opts.cwd, call.opts.timeoutMs], ['sh', ['-c', 'npm test'], dir, 1000])
  assert.equal(call.opts.env.CI, 'true')
  assert.equal(call.opts.env.NPM_TOKEN, undefined)
  assert.equal(call.opts.env.PATH, '/usr/bin')
  const failing = await tools.runTests(dir, { exec: fake({ ...OK, status: 1, stdout: 'not ok 1' }), env, timeoutMs: 1000 })
  assert.deepEqual([failing.state, failing.passed, failing.exitCode], ['result', false, 1])
})

test('runTests does not run a command whose chain seeds, migrates or publishes, and says it was not run (R4, R5)', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node scripts/seed.js' }) })
  const check = await tools.runTests(dir, { exec: never, env: {}, timeoutMs: 1000 })
  assert.deepEqual([check.state, check.notRun, check.command], ['could-not', true, 'npm test'])
  assert.match(check.reason, /db:seed/)
  assert.match(check.reason, /pretest/)
})

test('runTests: --no-tests, no tests declared, missing dependencies, a cap that ran out and a missing tool each end in their own state', async (t) => {
  const declared = projectDir(t, { 'package.json': pkg({ test: 'node --test' }) })
  const skipped = await tools.runTests(declared, { exec: never, env: {}, noTests: true })
  assert.equal(skipped.state, 'not-applicable')
  assert.match(skipped.reason, /--no-tests/)
  const empty = await tools.runTests(projectDir(t, {}), { exec: never, env: {} })
  assert.deepEqual([empty.state, empty.reason], ['not-applicable', 'no manifest or build file declares tests'])
  const needs = projectDir(t, { 'package.json': pkg({ test: 'node --test' }, { devDependencies: { mocha: '1.0.0' } }) })
  const missingDeps = await tools.runTests(needs, { exec: never, env: {} })
  assert.equal(missingDeps.state, 'could-not')
  assert.match(missingDeps.reason, /node_modules/)
  fs.mkdirSync(path.join(needs, 'node_modules'))
  const timedOut = await tools.runTests(needs, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: true }), env: {}, timeoutMs: 300000 })
  assert.deepEqual([timedOut.state, timedOut.timedOut], ['could-not', true])
  assert.match(timedOut.reason, /300/)
  const noTool = await tools.runTests(needs, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: 'ENOENT', message: 'spawn sh ENOENT' } }), env: {} })
  assert.equal(noTool.state, 'could-not')
  assert.match(noTool.reason, /not installed/)
})

test('runTests redacts a secret that the test output prints (R7)', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({ test: 'node --test' }) })
  const check = await tools.runTests(dir, { exec: fake({ ...OK, stdout: `loaded key ${AWS}\n` }), env: {} })
  assert.equal(check.state, 'result')
  assert.ok(check.output.includes('[redacted aws-access-key-id]'))
  assert.ok(!check.output.includes(AWS))
})

test('runLint runs the linter, and does not run one that fixes', async (t) => {
  const ok = await tools.runLint(projectDir(t, { 'package.json': pkg({ lint: 'eslint .' }) }), { exec: fake(OK), env: {} })
  assert.deepEqual([ok.state, ok.command, ok.passed], ['result', 'npm run lint', true])
  const fixing = await tools.runLint(projectDir(t, { 'package.json': pkg({ lint: 'eslint --fix .' }) }), { exec: never, env: {} })
  assert.deepEqual([fixing.state, fixing.notRun], ['could-not', true])
  assert.match(fixing.reason, /fix/)
  assert.equal((await tools.runLint(projectDir(t, {}), { exec: never, env: {} })).state, 'not-applicable')
})

test('runAudit counts what the ecosystem tool prints, whatever its exit code, and never runs a fix (R4, R6)', async (t) => {
  const npm = JSON.stringify({ vulnerabilities: { jsonwebtoken: { name: 'jsonwebtoken', severity: 'high' }, lodash: { name: 'lodash', severity: 'low' } }, metadata: { vulnerabilities: { total: 2 } } })
  const exec = fake({ status: 1, stdout: npm, stderr: '', timedOut: false })
  const dir = projectDir(t, { 'package.json': pkg({}), 'package-lock.json': '{}' })
  const a = await tools.runAudit(dir, { exec, env: {} })
  assert.deepEqual([a.state, a.tool, a.counts], ['result', 'npm audit', { critical: 0, high: 1, moderate: 0, low: 1, unknown: 0, total: 2 }])
  assert.deepEqual(a.top.map((x) => [x.name, x.severity]), [['jsonwebtoken', 'high'], ['lodash', 'low']])
  assert.ok(exec.calls[0].args.join(' ').includes('npm audit --json'))
  assert.ok(!exec.calls[0].args.join(' ').includes('fix'))
  const pip = JSON.stringify({ dependencies: [{ name: 'flask', version: '0.5', vulns: [{ id: 'PYSEC-1' }] }, { name: 'ok', version: '1', vulns: [] }] })
  const b = await tools.runAudit(projectDir(t, { 'requirements.txt': 'flask\n' }), { exec: fake({ status: 1, stdout: pip, stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([b.counts.total, b.counts.unknown, b.top[0].name], [1, 1, 'flask'])
  const composer = JSON.stringify({ advisories: { 'vendor/pkg': [{ advisoryId: 'PKSA-1', title: 'RCE', severity: 'high' }] } })
  const c = await tools.runAudit(projectDir(t, { 'composer.lock': '{}' }), { exec: fake({ status: 1, stdout: composer, stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([c.counts.total, c.counts.high], [1, 1])
  const cargo = JSON.stringify({ vulnerabilities: { found: true, count: 1, list: [{ advisory: { id: 'RUSTSEC-2020-1' }, package: { name: 'time' } }] } })
  const d = await tools.runAudit(projectDir(t, { 'Cargo.lock': '' }), { exec: fake({ status: 1, stdout: cargo, stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([d.counts.total, d.top[0].name], [1, 'time'])
})

test('runAudit: no network, a missing tool, output it does not understand and no lockfile each end in their own state', async (t) => {
  const dir = projectDir(t, { 'package.json': pkg({}), 'package-lock.json': '{}' })
  const net = await tools.runAudit(dir, { exec: fake({ status: 1, stdout: '', stderr: 'npm ERR! code ENOTFOUND\nnpm ERR! network request failed', timedOut: false }), env: {} })
  assert.deepEqual([net.state, net.reason], ['could-not', 'no network'])
  const missing = await tools.runAudit(dir, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: 'ENOENT', message: 'x' } }), env: {} })
  assert.deepEqual([missing.state, missing.reason], ['could-not', 'the tool is not installed'])
  const odd = await tools.runAudit(dir, { exec: fake({ status: 0, stdout: 'hello', stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([odd.state, odd.reason], ['could-not', 'output not understood'])
  const none = await tools.runAudit(projectDir(t, { 'package.json': pkg({}) }), { exec: never, env: {} })
  assert.equal(none.state, 'not-applicable')
})

function ctxFor(t, exec, extra = {}) {
  return { exec, env: { PATH: '/usr/bin' }, now: () => new Date('2026-11-04T12:00:00Z'), dataDir: tempDir(t, 'aether-data-'), ...extra }
}

test('analyze of a repository with nothing in it: every project tool is not applicable, nothing external runs, it does not fail (scenario 3, R5)', async (t) => {
  const repo = makeRepo(t)
  const ctx = ctxFor(t, never)
  store.writeReport(store.nextReportDir(ctx.dataDir, 'other-000000000000', '2026-10-01'), { meta: { durationSeconds: 600, costUsd: 2.5, topics: ['bugs', 'tests', 'docs', 'security', 'hygiene'] } }, '')
  const a = await analyze.analyze(repo.dir, {}, ctx)
  assert.equal(a.ok, true)
  assert.equal(a.generatedAt, '2026-11-04T12:00:00.000Z')
  const states = Object.fromEntries(Object.entries(a.checks).map(([name, check]) => [name, check.state]))
  assert.deepEqual(states, { tests: 'not-applicable', lint: 'not-applicable', dependencies: 'not-applicable', secrets: 'result', todos: 'result', branches: 'result', issues: 'not-applicable', prs: 'not-applicable', hotspots: 'result' })
  for (const check of Object.values(a.checks)) assert.ok(check.state === 'result' || (typeof check.reason === 'string' && check.reason.length > 0))
  assert.equal(a.project.remote, null)
  assert.equal(a.project.key, store.projectKey(a.project.identity))
  assert.equal(a.changes.changed, false)
  assert.deepEqual(a.selfFindings, [])
  assert.deepEqual(a.estimate, { samples: 1, perTopic: { minutes: [2, 2], usd: [0.5, 0.5] } })
})

test('analyze: a test command that writes a tracked file is a finding of the audit, an ignored file is not, and the step is named (R6)', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, '.gitignore', 'coverage/\n', 'ignore coverage')
  commitIn(repo, repo.dir, 'package.json', pkg({ test: 'node --test' }), 'manifest')
  const exec = async (file, args, opts) => {
    if (args[1] === 'npm test') {
      fs.appendFileSync(path.join(opts.cwd, 'README.md'), 'changed by the tests\n')
      fs.mkdirSync(path.join(opts.cwd, 'coverage'), { recursive: true })
      fs.writeFileSync(path.join(opts.cwd, 'coverage', 'lcov.info'), 'x')
    }
    return OK
  }
  const a = await analyze.analyze(repo.dir, {}, ctxFor(t, exec))
  assert.equal(a.checks.tests.state, 'result')
  assert.equal(a.changes.changed, true)
  assert.deepEqual(a.changes.attributed.map((x) => x.step), ['tests'])
  assert.deepEqual(a.changes.attributed[0].items[0].files, ['README.md'])
  assert.equal(a.selfFindings.length, 1)
  const f = a.selfFindings[0]
  assert.deepEqual([f.verification, f.status, f.topic, f.location.file, f.location.line], ['proven', 'verified', 'hygiene', 'README.md', 1])
  assert.match(f.title, /tests/)
})

test('analyze: a test command that would seed data is not run, and the analysis says so', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'package.json', pkg({ pretest: 'npm run db:seed', test: 'node --test', 'db:seed': 'node seed.js' }), 'manifest')
  const a = await analyze.analyze(repo.dir, {}, ctxFor(t, never))
  assert.deepEqual([a.checks.tests.state, a.checks.tests.notRun], ['could-not', true])
})

test('analyze: --tests-command gives the Lead a way to name a test command when no manifest declares one, and it is read like any other', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'Makefile', 'check:\n\tnode --test\n\ndeploy:\n\tgit push origin main\n', 'makefile')
  const exec = fake(OK)
  const a = await analyze.analyze(repo.dir, { testsCommand: 'make check' }, ctxFor(t, async (...args) => exec(...args)))
  assert.equal(a.checks.tests.state, 'result')
  assert.equal(a.checks.tests.command, 'make check')
  assert.equal(a.checks.tests.source, 'given by the Lead')
  assert.ok(exec.calls.some((c) => c.args.join(' ').includes('make check')), 'the command the Lead gave was run')
  const risky = await analyze.analyze(repo.dir, { testsCommand: 'make deploy' }, ctxFor(t, never))
  assert.deepEqual([risky.checks.tests.state, risky.checks.tests.notRun], ['could-not', true])
})

test('the analyze command through the bin, with a fake npm: it runs, writes outside the project, and leaves the project untouched (R4, R6, C6)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'package.json', pkg({ test: 'node --test' }), 'manifest')
  commitIn(repo, repo.dir, 'package-lock.json', '{}', 'lock')
  const fakeBin = tempDir(t, 'aether-fakebin-')
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const mark = path.join(work, 'mark')
  fs.writeFileSync(path.join(fakeBin, 'npm'), [
    '#!/bin/sh',
    'case "$1" in',
    '  test) echo "fake tests ran"; echo called >> "$AUDIT_MARK"; exit 0;;',
    '  audit) echo \'{"vulnerabilities":{},"metadata":{"vulnerabilities":{"total":0}}}\'; exit 0;;',
    'esac',
    'exit 9',
    '',
  ].join('\n'), { mode: 0o755 })
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, AETHER_DATA_DIR: dataDir, AUDIT_MARK: mark }
  const out = path.join(work, 'analysis.json')
  const r = runBin(BIN, ['analyze', '--out', out], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.out, out)
  const analysis = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual([analysis.checks.tests.state, analysis.checks.tests.passed, analysis.checks.tests.command], ['result', true, 'npm test'])
  assert.deepEqual([analysis.checks.dependencies.state, analysis.checks.dependencies.counts.total], ['result', 0])
  assert.equal(fs.readFileSync(mark, 'utf8').trim(), 'called')
  assert.equal(repo.git('status', '--porcelain'), '')
  const skipped = runBin(BIN, ['analyze', '--no-tests', '--out', path.join(work, 'skipped.json')], repo.dir, env)
  assert.equal(skipped.status, 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'skipped.json'), 'utf8')).checks.tests.state, 'not-applicable')
  assert.equal(fs.readFileSync(mark, 'utf8').trim().split('\n').length, 1, 'the tests did not run again')
})

test('the analyze command refuses a folder that is not a git repository and a bad cap', (t) => {
  const outside = runBin(BIN, ['analyze'], tempDir(t))
  assert.equal(outside.status, 1)
  assert.match(outside.json.error, /git repository/)
  const repo = makeRepo(t)
  assert.equal(runBin(BIN, ['analyze', '--timeout-seconds', '0'], repo.dir).status, 2)
  assert.equal(runBin(BIN, ['analyze', '--timeout-seconds', 'soon'], repo.dir).status, 2)
})
```

**Acceptance:**

- `node --test tests/audit-analyze.test.js` pasa; `npm test` pasa.
- `analyze` sale con 0 aunque todas las revisiones sean `not-applicable`; una revisión `could-not` nunca se cuenta como limpia; el análisis nunca instala nada, no corre `git fetch` ni `pull` ni un comando con `--fix`.
- Un comando rechazado por `assess` no llega a `exec`; el motivo nombra la cadena (`pretest`, `db:seed`).
- La tabla de patrones de `audit-risk.js` es datos (una fila por clase) y cada clase tiene su caso en las pruebas.
- Ninguna salida contiene el valor de un secreto.

### Task 5: La compuerta, los veredictos, la limpieza y el triaje

**Aether:**
- Area: audit-pipeline
- Owns: `plugins/aether/lib/audit-verify.js`, `plugins/aether/lib/audit-clean.js`, `plugins/aether/lib/audit-triage.js`, `tests/audit-pipeline.test.js`
- Depends on: Task 2 — `audit-common.js` (vocabularios y `parseArgs`), `audit-store.js` (la auditoría anterior) y el despacho de `audit.js` los crea la Tarea 2
- Serves: R13, R14, R15, R16, R17, R18, R19, R20, R27

Las partes de R13 a R20 que son código: el Lead decide qué es la misma causa, qué issue cubre qué y cómo se juzga cada hallazgo (`plan.md`, D1); este código las valida, las aplica y ordena. Ninguna de estas funciones llama a un modelo ni a la red.

**Interfaces:**

`plugins/aether/lib/audit-verify.js`:

```js
// gate(candidates: Candidate[]) -> { accepted: Candidate[], discarded: Discard[], counts: { candidates: n } }
// Each candidate is checked in this order and goes to discarded with the first reason that fails (Discard = { id, topic, title, reason }):
//   'no-location'          location is not { file: non-empty string, line: integer >= 1 } and not { file, commit: 7 to 40 hex characters }
//   'no-evidence'          evidence is not a non-empty string (after trim)
//   'unknown-topic'        topic not in TOPICS            'unknown-type'   type not in TYPES
//   'missing-field:<name>' id, title, claim, trigger or impact missing or blank (the first missing one, in that order)
//   'duplicate-id'         the id was already used by an earlier candidate of the list
// counts.candidates is the length of the input.
function gate(candidates) {}
// settle({ accepted, discarded, counts }, verdicts: Verdict[]) -> { findings: Finding[], discarded: Discard[], counts: { candidates, verified } }
// For each accepted candidate, the verdict with its id (a verdict with no candidate is ignored). The finding keeps the candidate's fields and adds
// verification, status, rootCause, trigger and impact (the verifier's restatement replaces the candidate's trigger and impact), verifierEvidence (the verifier's evidence), reproduction, ranOn.
//   verdict 'proven' | 'read-confirmed' | 'proposal' that passes the rules below -> status 'verified', verification = the verdict.
//   verdict 'refuted' with non-empty evidence -> not a finding; goes to discarded as { id, topic, title, reason: 'refuted' }.
//   EVERYTHING else -> status 'unverified', verification 'unverified', reason = why. The rules that fail a verdict are, with their reason text:
//     no verdict record for the id                                   'no verdict from the verifier'
//     verdict not one of the five                                    'the verdict is not one of the five'
//     verdict 'unverified' (or exhausted: true)                      the verifier's own reason, or 'the verifier could not decide'
//     empty evidence (including a 'refuted' without evidence)         'the verdict has no evidence'
//     rootCause, trigger or impact missing or blank                   'the verifier did not restate the claim (cause, trigger and impact)'
//     'proven' with ranOn other than 'claude'                         'a verifier on another harness does not reproduce'
//     'proven' without a non-empty reproduction                       'a proven verdict needs its reproduction'
//     'proposal' on a candidate whose type is not 'opportunity'       'a proposal is only for opportunities'
// A verified finding is never produced by anything else. counts.verified = the findings with status 'verified'; counts.candidates is carried from the input.
// The discarded of the input are carried to the output, followed by the refuted ones.
function settle(gated, verdicts) {}
// command(args, ctx): ctx.subcommand is 'candidates' (args: <candidates.json>) or 'verdicts' (args: <candidates-output.json> <verdicts.json>).
// A file that does not exist or is not JSON of the right type is an Error that names the file (exit 1).
// -> { code: 0, result: <the output of gate or settle>, summary: { accepted, discarded } | { findings, verified, unverified, discarded } }
async function command(args, ctx) {}
```

`plugins/aether/lib/audit-clean.js`:

```js
// clean(settled, analysis, { topics, dataDir }) -> { findings, unverified, discarded, counts, issueComparison, sinceLast }
// settled = the output of verdicts, with the fields the Lead added to each finding: causeKey (default: the id) and coveredBy (an issue number, optional).
// analysis = the output of analyze (only project.key, checks.issues, selfFindings and, for the date of the audit, generatedAt are read).
// 0. The audit's own findings (R6): each of analysis.selfFindings (already established by the analysis: status 'verified', verification 'proven', source 'analysis')
//    is appended to the settled findings before step 1, and counts.candidates and counts.verified each grow by their number. A missing selfFindings is [].
// 1. Merge (R16): findings with the same causeKey AND the same status become one. The survivor is the first in the input; it gets locations (the unique locations of all, as Location[]),
//    mergedFrom (the ids, in order), verification = the strongest (proven > read-confirmed > proposal; for unverified findings 'unverified'), and the others go to discarded as
//    { id, title, topic, reason: 'merged', into: <survivor id> }. A verified and an unverified finding never merge. Every finding, merged or not, has locations (at least its own location) and mergedFrom.
// 2. Issues (R17): when analysis.checks.issues.state is 'result', a finding (or merged group) with coveredBy that is the number of an issue in analysis.checks.issues.open is removed and goes to
//    discarded as { id, title, topic, reason: 'covered-by-issue', issue: <number> }. A coveredBy that is not an open issue keeps the finding and adds note: `issue #<n> is not open`.
//    issueComparison = { state: 'done', removed: [{ id, issue }] }; when the check is not 'result': { state: 'could-not', reason: <its reason>, removed: [] } and nothing is removed.
// 3. Previous audit (R18): previousReport(dataDir, analysis.project.key) of audit-store.js. With none, sinceLast = { previous: null, resolved: [], notReaudited: [] } and every mark is null.
//    With one, each verified finding gets mark 'still' when its causeKey is a causeKey of the previous report's list, else 'new'. sinceLast = { previous: { date }, resolved, notReaudited }:
//    resolved = the previous list items whose causeKey is not among the current verified findings, nor among the ones removed for an open issue, and whose topic is in `topics`;
//    notReaudited = the previous list items whose topic is not in `topics`. Each item is { causeKey, title, topic }. A previous item whose causeKey is
//    `audit-changed-project-<step>` (the audit's own; step is tests, lint or dependencies) counts as re-audited, whatever `topics` says, only when this analysis's
//    checks[<step>].state is 'result': then it is resolved or still, never notReaudited. When that step did not run (--no-tests, a refused chain, no linter), it is notReaudited.
// Output: findings = the verified ones that remain; unverified = the unverified ones that remain (no mark); discarded = the input's discarded then merged then covered ones;
// counts = the input's counts.
function clean(settled, analysis, options) {}
// command(args, ctx): <settled.json> --analysis <file> --topics <a,b,c>; the data directory is run.dataDir(ctx.env). --topics is required; every name must be in TOPICS (usage error otherwise).
async function command(args, ctx) {}
```

`plugins/aether/lib/audit-triage.js`:

```js
// order(items) -> items sorted by: regression first, then waitCost (high, medium, low), then size (S, M, L), then the position they had. Stable.
function order(items) {}
// triage(cleaned, judgments: { [id]: Judgment }) -> { ok: true, list, unverified, ...the rest of cleaned (counts, discarded, sinceLast, issueComparison) }
//                                                   | { ok: false, incomplete: [{ id, missing: string[] }] }
// For each verified finding of cleaned.findings, its judgment is required. missing lists what is wrong: 'judgment' (none for the id), or each of severity, priority, size, waitCost
// (not in its vocabulary), reason, how (blank) and regression (not a boolean). If any is incomplete the result is { ok: false, incomplete } and nothing else.
// A finding whose verification is 'proposal' gets priority 'P3' whatever its judgment says. The bands are P0 to P3; inside a band `order` decides. list is numbered 1..n over the bands in order and
// each item is the finding plus { number, priority, severity, reason, size, how, regression, waitCost } and keeps its mark and causeKey.
// unverified = cleaned.unverified reduced to { id, topic, title, claim, locations, reason }: no priority, severity or number, even if a judgment exists for it.
function triage(cleaned, judgments) {}
// command(args, ctx): <cleaned.json> <judgments.json> -> { code: 0 | 1, result, summary: { listed, unverified } }; code 1 when incomplete (the result names the ids).
async function command(args, ctx) {}
```

**Tests (write first):**

`tests/audit-pipeline.test.js`:

```js
'use strict'

// Spec 026 (R13 to R20, R27): the gate of candidates, the settling of verdicts, the cleanup and the triage, with simulated findings and verifiers.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-audit')
const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const verify = lib('audit-verify.js')
const clean = lib('audit-clean.js')
const triage = lib('audit-triage.js')
const store = lib('audit-store.js')

const cand = (id, over = {}) => ({
  id, topic: 'bugs', title: `Title ${id}`, claim: `Claim ${id}`, location: { file: `src/${id}.js`, line: 10 }, type: 'bug',
  trigger: 'the provider times out', evidence: `src/${id}.js:10 posts without a key`, impact: 'customers are charged twice', ...over,
})
const verdict = (id, over = {}) => ({
  id, verdict: 'read-confirmed', rootCause: 'no idempotency key', trigger: 'a timeout of 30 s', impact: 'double charge', evidence: `src/${id}.js:10`, ranOn: 'claude', ...over,
})

test('the gate discards a candidate with no valid location, no evidence, a field out of its vocabulary or a repeated id, with the reason (R13)', () => {
  const out = verify.gate([
    cand('F1'),
    cand('F2', { location: { file: 'a.js' } }),
    cand('F3', { location: { file: 'a.js', line: 0 } }),
    cand('F4', { evidence: '   ' }),
    cand('F5', { topic: 'nope' }),
    cand('F6', { type: 'weird' }),
    cand('F7', { title: '' }),
    cand('F1'),
    cand('F8', { location: { file: 'a.js', commit: '4f2a91c' } }),
    cand('F9', { location: { file: 'a.js', commit: 'xyz' } }),
  ])
  assert.deepEqual(out.accepted.map((c) => c.id), ['F1', 'F8'])
  assert.deepEqual(out.discarded.map((d) => [d.id, d.reason]), [['F2', 'no-location'], ['F3', 'no-location'], ['F4', 'no-evidence'], ['F5', 'unknown-topic'], ['F6', 'unknown-type'], ['F7', 'missing-field:title'], ['F1', 'duplicate-id'], ['F9', 'no-location']])
  assert.equal(out.counts.candidates, 10)
})

test('a verdict that holds verifies; a failed verification is "unverified" with its reason and is never kept as verified (R14, R15, scenario 5)', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const accepted = ids.map((id) => (id === 'I' ? cand(id, { topic: 'opportunities', type: 'opportunity' }) : cand(id)))
  const verdicts = [
    verdict('A', { verdict: 'proven', reproduction: 'node /tmp/x/repro.js exits 1' }),
    verdict('B'),
    verdict('C', { verdict: 'refuted', evidence: 'charge.js:88 does send the key' }),
    verdict('D', { verdict: 'proven', reproduction: 'ran it', ranOn: 'codex' }),
    verdict('E', { verdict: 'proven' }),
    verdict('F', { verdict: 'maybe' }),
    verdict('G', { evidence: '' }),
    verdict('H', { verdict: 'proposal' }),
    verdict('I', { verdict: 'proposal' }),
    // J: no record at all
    verdict('K', { verdict: 'unverified', exhausted: true, reason: 'ran out of time' }),
    verdict('L', { rootCause: '' }),
    verdict('ZZ'),
  ]
  const out = verify.settle({ accepted, discarded: [{ id: 'X', reason: 'no-location' }], counts: { candidates: 13 } }, verdicts)
  const by = Object.fromEntries(out.findings.map((f) => [f.id, f]))
  assert.deepEqual(Object.keys(by).sort(), ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
  assert.deepEqual([by.A.status, by.A.verification], ['verified', 'proven'])
  assert.deepEqual([by.B.status, by.B.verification], ['verified', 'read-confirmed'])
  assert.deepEqual([by.I.status, by.I.verification], ['verified', 'proposal'])
  assert.equal(by.A.rootCause, 'no idempotency key')
  assert.equal(by.A.trigger, 'a timeout of 30 s', 'the restatement replaces the claim\'s trigger')
  for (const [id, reason] of [['D', /other harness/], ['E', /reproduction/], ['F', /one of the five/], ['G', /evidence/], ['H', /opportunities/], ['J', /no verdict/], ['K', /ran out of time/], ['L', /restate/]]) {
    assert.deepEqual([by[id].status, by[id].verification], ['unverified', 'unverified'], id)
    assert.match(by[id].reason, reason, id)
  }
  for (const f of out.findings) if (f.status === 'verified') assert.ok(['proven', 'read-confirmed', 'proposal'].includes(f.verification))
  assert.deepEqual(out.discarded.map((d) => [d.id, d.reason]), [['X', 'no-location'], ['C', 'refuted']])
  assert.deepEqual(out.counts, { candidates: 13, verified: 3 })
})

const fnd = (id, over = {}) => ({ ...cand(id), status: 'verified', verification: 'read-confirmed', rootCause: `rc ${id}`, causeKey: `cause-${id}`, ...over })
const analysisWith = (issues, key = 'repo-0123456789ab') => ({ generatedAt: '2026-11-04T12:00:00.000Z', project: { key }, checks: { issues } })
const OPEN = { state: 'result', open: [{ number: 41, title: 'Timeouts' }] }
const settled = (findings, discarded = []) => ({ findings, discarded, counts: { candidates: findings.length + discarded.length, verified: findings.filter((f) => f.status === 'verified').length } })

test('the cleanup merges findings of the same cause and status, with all their locations, and never merges across statuses (R16)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const input = settled([
    fnd('F1', { causeKey: 'no-timeout', verification: 'proven' }),
    fnd('F2', { causeKey: 'no-timeout', location: { file: 'src/other.js', line: 3 } }),
    fnd('F3', { causeKey: 'no-timeout', status: 'unverified', verification: 'unverified', reason: 'x' }),
    fnd('F4', {}),
    fnd('F5', { causeKey: undefined }),
  ])
  const out = clean.clean(input, analysisWith(OPEN), { topics: ['bugs'], dataDir })
  assert.deepEqual(out.findings.map((f) => f.id), ['F1', 'F4', 'F5'])
  const merged = out.findings[0]
  assert.deepEqual(merged.mergedFrom, ['F1', 'F2'])
  assert.deepEqual(merged.locations, [{ file: 'src/F1.js', line: 10 }, { file: 'src/other.js', line: 3 }])
  assert.equal(merged.verification, 'proven')
  assert.deepEqual(out.findings[1].mergedFrom, ['F4'])
  assert.deepEqual(out.findings[1].locations, [{ file: 'src/F4.js', line: 10 }])
  assert.deepEqual(out.unverified.map((f) => f.id), ['F3'])
  assert.deepEqual(out.discarded.filter((d) => d.reason === 'merged'), [{ id: 'F2', title: 'Title F2', topic: 'bugs', reason: 'merged', into: 'F1' }])
})

test('the cleanup removes what an open issue covers and says which, and says it could not compare when gh did not answer (R17)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const input = settled([fnd('F4', { coveredBy: 41 }), fnd('F5', { coveredBy: 99 }), fnd('F6')])
  const out = clean.clean(input, analysisWith(OPEN), { topics: ['bugs'], dataDir })
  assert.deepEqual(out.findings.map((f) => f.id), ['F5', 'F6'])
  assert.match(out.findings[0].note, /#99/)
  assert.deepEqual(out.issueComparison, { state: 'done', removed: [{ id: 'F4', issue: 41 }] })
  assert.deepEqual(out.discarded.filter((d) => d.reason === 'covered-by-issue').map((d) => [d.id, d.issue]), [['F4', 41]])
  const blind = clean.clean(input, analysisWith({ state: 'could-not', reason: 'gh is not installed' }), { topics: ['bugs'], dataDir })
  assert.deepEqual(blind.findings.map((f) => f.id), ['F4', 'F5', 'F6'])
  assert.deepEqual(blind.issueComparison, { state: 'could-not', reason: 'gh is not installed', removed: [] })
})

test('the cleanup takes in the analysis's own findings as verified findings, so a change the audit made reaches the list (R6)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const self = {
    id: 'AUDIT-1', topic: 'hygiene', title: 'Running the tests changed the project', claim: 'the test command wrote notes.txt', location: { file: 'notes.txt', line: 1 },
    type: 'risk', trigger: 'the audit ran npm test', evidence: 'status: notes.txt', impact: 'the audit changed the project', rootCause: 'the test command writes a tracked file',
    verification: 'proven', status: 'verified', causeKey: 'audit-changed-project-tests', source: 'analysis',
  }
  const out = clean.clean(settled([fnd('F1')]), { ...analysisWith(OPEN), selfFindings: [self] }, { topics: ['bugs'], dataDir })
  assert.deepEqual(out.findings.map((f) => f.id), ['F1', 'AUDIT-1'])
  assert.equal(out.findings[1].status, 'verified')
  assert.deepEqual(out.findings[1].locations, [{ file: 'notes.txt', line: 1 }])
  assert.deepEqual([out.counts.candidates, out.counts.verified], [2, 2])
  const none = clean.clean(settled([fnd('F1')]), analysisWith(OPEN), { topics: ['bugs'], dataDir })
  assert.deepEqual(none.findings.map((f) => f.id), ['F1'])
})

test('the cleanup compares with the previous audit of the same project: new, still, resolved, and topics not reviewed this time (R18, scenario 6)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const key = 'repo-0123456789ab'
  const first = clean.clean(settled([fnd('F1')]), analysisWith(OPEN, key), { topics: ['bugs'], dataDir })
  assert.deepEqual(first.sinceLast, { previous: null, resolved: [], notReaudited: [] })
  assert.equal(first.findings[0].mark, null)
  store.writeReport(store.nextReportDir(dataDir, key, '2026-10-12'), {
    list: [
      { causeKey: 'cause-F1', title: 'Double charge', topic: 'bugs' },
      { causeKey: 'old-fixed', title: 'Old fixed bug', topic: 'bugs' },
      { causeKey: 'cause-F4', title: 'Covered since', topic: 'bugs' },
      { causeKey: 'other-topic', title: 'Doc drift', topic: 'docs' },
    ],
  }, '')
  store.writeReport(store.nextReportDir(dataDir, 'other-000000000000', '2026-10-30'), { list: [{ causeKey: 'cause-F1', title: 'not this project', topic: 'bugs' }] }, '')
  const out = clean.clean(settled([fnd('F1'), fnd('F9'), fnd('F4', { coveredBy: 41 })]), analysisWith(OPEN, key), { topics: ['bugs', 'tests'], dataDir })
  assert.deepEqual(out.findings.map((f) => [f.id, f.mark]), [['F1', 'still'], ['F9', 'new']])
  assert.equal(out.sinceLast.previous.date, '2026-10-12')
  assert.deepEqual(out.sinceLast.resolved, [{ causeKey: 'old-fixed', title: 'Old fixed bug', topic: 'bugs' }])
  assert.deepEqual(out.sinceLast.notReaudited, [{ causeKey: 'other-topic', title: 'Doc drift', topic: 'docs' }])
})

test('an earlier item of the audit's own counts as re-audited only when this analysis ran the same step (R18)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const key = 'repo-0123456789ab'
  store.writeReport(store.nextReportDir(dataDir, key, '2026-10-12'), {
    list: [
      { causeKey: 'audit-changed-project-tests', title: 'Running the tests changed the project', topic: 'hygiene' },
      { causeKey: 'audit-changed-project-lint', title: 'Running the linter changed the project', topic: 'hygiene' },
    ],
  }, '')
  const analysis = { ...analysisWith(OPEN, key), checks: { issues: OPEN, tests: { state: 'result' }, lint: { state: 'not-applicable', reason: 'no linter declared' } } }
  const out = clean.clean(settled([fnd('F1')]), analysis, { topics: ['bugs'], dataDir })
  assert.deepEqual(out.sinceLast.resolved.map((r) => r.causeKey), ['audit-changed-project-tests'])
  assert.deepEqual(out.sinceLast.notReaudited.map((r) => r.causeKey), ['audit-changed-project-lint'])
})

const judgment = (over = {}) => ({ severity: 'high', priority: 'P1', reason: 'a reason', size: 'S', how: 'one agent', regression: false, waitCost: 'medium', ...over })
const cleaned = (findings, unverified = []) => ({
  findings: findings.map((f) => ({ ...f, locations: [f.location], mergedFrom: [f.id], mark: null })),
  unverified, discarded: [{ id: 'D1', reason: 'refuted' }], counts: { candidates: 9, verified: findings.length },
  issueComparison: { state: 'done', removed: [] }, sinceLast: { previous: null, resolved: [], notReaudited: [] },
})

test('the order inside a level is regression first, then the cost of waiting, then the cost of doing it, then arrival (R20, C5)', () => {
  const findings = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].map((id) => fnd(id))
  const judgments = {
    F1: judgment({ waitCost: 'low', size: 'S' }),
    F2: judgment({ waitCost: 'high', size: 'L' }),
    F3: judgment({ waitCost: 'high', size: 'S' }),
    F4: judgment({ waitCost: 'low', size: 'L', regression: true }),
    F5: judgment({ priority: 'P0', waitCost: 'low', size: 'L' }),
    F6: judgment({ priority: 'P2' }),
    F7: judgment({ priority: 'P3' }),
    F8: judgment({ waitCost: 'high', size: 'S' }),
  }
  const out = triage.triage(cleaned(findings), judgments)
  assert.equal(out.ok, true)
  assert.deepEqual(out.list.map((i) => [i.number, i.id, i.priority]), [[1, 'F5', 'P0'], [2, 'F4', 'P1'], [3, 'F3', 'P1'], [4, 'F8', 'P1'], [5, 'F2', 'P1'], [6, 'F1', 'P1'], [7, 'F6', 'P2'], [8, 'F7', 'P3']])
  assert.deepEqual(out.counts, { candidates: 9, verified: 8 })
  assert.deepEqual(out.discarded, [{ id: 'D1', reason: 'refuted' }])
  assert.deepEqual(triage.order([{ id: 'a', regression: false, waitCost: 'low', size: 'S' }, { id: 'b', regression: true, waitCost: 'low', size: 'L' }]).map((i) => i.id), ['b', 'a'])
})

test('severity and priority are separate; a proposal is P3 whatever is said; what is unverified gets no level and no number (R19, scenario 5)', () => {
  const findings = [fnd('F1'), fnd('F2', { verification: 'proposal', type: 'opportunity', topic: 'opportunities' })]
  const unverified = [{ ...fnd('F3', { status: 'unverified', verification: 'unverified', reason: 'could not reproduce' }), locations: [{ file: 'src/F3.js', line: 10 }] }]
  const out = triage.triage(cleaned(findings, unverified), { F1: judgment({ severity: 'low', priority: 'P0' }), F2: judgment({ priority: 'P0' }), F3: judgment({ priority: 'P0' }) })
  assert.deepEqual(out.list.map((i) => [i.id, i.severity, i.priority]), [['F1', 'low', 'P0'], ['F2', 'high', 'P3']])
  assert.deepEqual(out.unverified, [{ id: 'F3', topic: 'bugs', title: 'Title F3', claim: 'Claim F3', locations: [{ file: 'src/F3.js', line: 10 }], reason: 'could not reproduce' }])
  assert.ok(!out.list.some((i) => i.id === 'F3'))
})

test('a verified finding with no judgment, or with a judgment out of its vocabulary, stops the triage and names what is missing (R19)', () => {
  const findings = [fnd('F1'), fnd('F2'), fnd('F3')]
  const out = triage.triage(cleaned(findings), { F1: judgment(), F2: judgment({ priority: 'P9', size: 'XL', reason: ' ', regression: 'no' }) })
  assert.equal(out.ok, false)
  assert.deepEqual(out.incomplete, [{ id: 'F2', missing: ['priority', 'size', 'reason', 'regression'] }, { id: 'F3', missing: ['judgment'] }])
  assert.equal(out.list, undefined)
})

test('the four stages chain through files and the bin: candidates, verdicts, clean and triage (R13 to R20)', (t) => {
  const repo = makeRepo(t)
  const work = tempDir(t, 'aether-work-')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { AETHER_DATA_DIR: dataDir }
  const write = (name, value) => { const file = path.join(work, name); fs.writeFileSync(file, JSON.stringify(value)); return file }
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
  const step = (args, out) => {
    const r = runBin(BIN, [...args, '--out', path.join(work, out)], repo.dir, env)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.json.ok, true)
    return read(path.join(work, out))
  }
  const gated = step(['candidates', write('cands.json', [cand('A'), cand('B'), cand('C', { location: { file: 'x' } })])], 'gated.json')
  assert.deepEqual(gated.accepted.map((c) => c.id), ['A', 'B'])
  const done = step(['verdicts', path.join(work, 'gated.json'), write('verdicts.json', [verdict('A', { verdict: 'proven', reproduction: 'r' }), verdict('B', { verdict: 'refuted', evidence: 'e' })])], 'settled.json')
  assert.deepEqual(done.findings.map((f) => f.id), ['A'])
  assert.deepEqual(done.discarded.map((d) => d.reason), ['no-location', 'refuted'])
  done.findings[0].causeKey = 'k'
  write('settled2.json', done)
  const analysis = write('analysis.json', analysisWith({ state: 'result', open: [] }))
  const cleanedOut = step(['clean', path.join(work, 'settled2.json'), '--analysis', analysis, '--topics', 'bugs'], 'cleaned.json')
  assert.deepEqual(cleanedOut.findings.map((f) => [f.id, f.mark]), [['A', null]])
  const final = step(['triage', path.join(work, 'cleaned.json'), write('judgments.json', { A: judgment({ priority: 'P0' }) })], 'triaged.json')
  assert.deepEqual(final.list.map((i) => [i.number, i.id, i.priority]), [[1, 'A', 'P0']])
  assert.equal(final.counts.candidates, 3)
  assert.equal(runBin(BIN, ['clean', path.join(work, 'settled2.json'), '--analysis', analysis], repo.dir, env).status, 2, '--topics is required')
  const incomplete = runBin(BIN, ['triage', path.join(work, 'cleaned.json'), write('none.json', {})], repo.dir, env)
  assert.equal(incomplete.status, 1)
  assert.deepEqual(incomplete.json.incomplete, [{ id: 'A', missing: ['judgment'] }])
  assert.equal(repo.git('status', '--porcelain'), '')
})
```

**Acceptance:**

- `node --test tests/audit-pipeline.test.js` pasa; `npm test` pasa.
- Un hallazgo no llega a `verified` por ningún camino que no sea un veredicto válido de `verdicts`; `proposal` solo en oportunidades; `proven` solo con reproducción de un verificador de Claude.
- `clean` y `triage` no leen ni escriben dentro del proyecto auditado; `clean` solo lee la auditoría anterior de su propio proyecto.
- Los vocabularios vienen de `audit-common.js`; ningún módulo los repite.

### Task 6: La documentación

**Aether:**
- Area: audit-docs
- Owns: `docs/guide/audit.md`, `docs/es/guias/auditar-un-proyecto.md`, `docs/index.md`, `docs/es/index.md`, `docs/reference/components.md`, `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md`, `plugins/aether/skills/help/SKILL.md`, `tests/docs-facts.test.js`, `tests/audit-docs.test.js`
- Depends on: Task 4 — la guía describe `analyze`, y el Lead no la lanza hasta que las rondas de R29 hayan dejado `specs/026-project-audit/rounds/round-1.md`
- Depends on: Task 5 — la guía describe la limpieza, el triaje y el reporte
- Serves: R30, R31

Documenta lo que la skill hace al final de las rondas. El Lead lanza esta tarea después de la ronda 1 (la guía nombra `specs/026-project-audit/rounds/`, que debe existir para que `tests/docs-facts.test.js` pase).

**Interfaces:**

- `docs/guide/audit.md`, con portada `title: Audit a project`, `description` de una línea y `order: 18`. Secciones, con estos encabezados: `## What it audits` (los doce temas, de qué fuente sale cada uno y que rendimiento y accesibilidad solo se proponen cuando aplican), `## How it runs` (las siete fases, la pregunta única de temas, `/aether:audit docs bugs` sin pregunta, `--no-tests`, delegados en segundo plano que no necesitan la herramienta Workflow), `## What it does not do` (no cambia el proyecto, no arregla, no crea issues hasta que eliges, no instala herramientas, ejecuta los tests del proyecto con los riesgos y las salvaguardas de la spec), `## Without a network, tests or GitHub` (cada revisión es resultado, «no aplica» o «no se pudo», y el reporte lo dice), `## Where the report is saved` (`<directorio de datos>/audits/<proyecto>/<fecha>`, con `report.json` y `report.md`, y cómo la auditoría siguiente lo usa), `## What you take` (la lista P0 a P3, «sin verificar», y que cada punto elegido se vuelve un issue solo en un proyecto con GitHub) y `## The test rounds` (enlace a `../../specs/026-project-audit/rounds/round-1.md` y a la carpeta). Los comandos van en código en línea, y `aether-audit` con la ruta del bin como lo dicen las otras guías.
- `docs/es/guias/auditar-un-proyecto.md`, con portada `title: Auditar un proyecto`, `description` de una línea y `order: 210`, el equivalente en español, con los encabezados `## Qué audita`, `## Cómo corre`, `## Qué no hace`, `## Sin red, sin tests o sin GitHub`, `## Dónde se guarda el reporte`, `## Qué tomas`, `## Las rondas de prueba`.
- `docs/index.md`: una línea para cada guía (la inglesa en «If you use Aether», la española en «Guías en español»). `docs/es/index.md`: la línea de la guía en «Guías paso a paso» (la lista numerada pasa a nueve) o en una sección propia.
- `docs/reference/components.md`: la fila `audit` skill y la fila `aether-audit` completas (las que escribieron las Tareas 1 y 2), la lista de miembros de la familia `audit` (`audit-analyze.js`, `audit-clean.js`, `audit-common.js`, `audit-exec.js`, `audit-github.js`, `audit-report.js`, `audit-risk.js`, `audit-scan.js`, `audit-snapshot.js`, `audit-store.js`, `audit-tools.js`, `audit-triage.js`, `audit-verify.js`), y la nota de la huella en reposo: «The `audit` skill sets the same field, so it too adds no entry to the skills list, runs no hook and adds no command; `aether-audit` is one more file on the Bash tool's `PATH` and runs only when called; this is read from the plugin, not measured.»
- `plugins/aether/skills/help/SKILL.md`: en la sección «Audit a project», los enlaces a las dos guías (`https://github.com/DarkArty07/aether-plugin/blob/main/docs/guide/audit.md` y `.../docs/es/guias/auditar-un-proyecto.md`), con la misma regla que las otras secciones.
- `docs/what-aether-adds.md` y `docs/es/que-agrega-aether.md`: una viñeta de `/aether:audit [topics] [--no-tests]` en la lista de comandos y una fila en la hoja de atajos («Know what is pending, most urgent first» / «Saber qué está pendiente, lo más urgente primero»).
- `tests/docs-facts.test.js`: las dos páginas nuevas entran a la lista `PAGES`.

**Tests (write first):**

`tests/audit-docs.test.js`:

```js
'use strict'

// Spec 026 (R30): the guide of the audit exists in English and Spanish with the sections the spec asks for, the index links both,
// the components page names the skill, the bin and the family, and the help links the guides.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const GUIDES = [
  ['docs/guide/audit.md', ['## What it audits', '## How it runs', '## What it does not do', '## Without a network, tests or GitHub', '## Where the report is saved', '## What you take', '## The test rounds']],
  ['docs/es/guias/auditar-un-proyecto.md', ['## Qué audita', '## Cómo corre', '## Qué no hace', '## Sin red, sin tests o sin GitHub', '## Dónde se guarda el reporte', '## Qué tomas', '## Las rondas de prueba']],
]

test('both guides exist with their front matter and their sections, in order', () => {
  for (const [rel, headings] of GUIDES) {
    const text = read(rel)
    const front = text.match(/^---\n([\s\S]*?)\n---\n/)
    assert.ok(front, `${rel} has front matter`)
    assert.match(front[1], /^title: .+$/m)
    assert.match(front[1], /^description: .+$/m)
    assert.match(front[1], /^order: \d+$/m)
    let at = -1
    for (const heading of headings) {
      const i = text.indexOf(`\n${heading}\n`)
      assert.ok(i > at, `${rel}: ${heading} is missing or out of order`)
      at = i
    }
  }
})

test('the guides name the rounds folder, the command, the topics argument and the report folder', () => {
  for (const [rel] of GUIDES) {
    const text = read(rel)
    assert.ok(text.includes('specs/026-project-audit/rounds/'), `${rel} names the rounds folder`)
    assert.ok(text.includes('/aether:audit'), `${rel} names the command`)
    assert.ok(text.includes('--no-tests'), `${rel} names --no-tests`)
    assert.ok(text.includes('report.json'), `${rel} names the saved report`)
    assert.ok(text.includes('aether-audit'), `${rel} names the bin`)
  }
})

test('docs/index.md links both guides and the Spanish index links the Spanish one', () => {
  const index = read('docs/index.md')
  assert.ok(index.includes('](guide/audit.md)'))
  assert.ok(index.includes('](es/guias/auditar-un-proyecto.md)'))
  assert.ok(read('docs/es/index.md').includes('](guias/auditar-un-proyecto.md)'))
})

test('the components page names the skill, the bin and the family, and says the skill adds nothing to a plain session', () => {
  const components = read('docs/reference/components.md')
  assert.ok(components.includes('`audit` skill'))
  assert.ok(components.split('\n').some((line) => line.startsWith('| `aether-audit` |')))
  const family = components.split('\n').find((line) => line.startsWith('| audit |'))
  assert.ok(family)
  for (const name of ['audit-analyze.js', 'audit-clean.js', 'audit-common.js', 'audit-exec.js', 'audit-github.js', 'audit-report.js', 'audit-risk.js', 'audit-scan.js', 'audit-snapshot.js', 'audit-store.js', 'audit-tools.js', 'audit-triage.js', 'audit-verify.js']) {
    assert.ok(family.includes(`\`${name}\``), name)
    assert.ok(fs.existsSync(path.join(ROOT, 'plugins', 'aether', 'lib', name)), `${name} exists`)
  }
  assert.match(components, /The `audit` skill sets the same field/)
})

test('the help links the two guides and both what-aether-adds pages name the command', () => {
  const help = read('plugins/aether/skills/help/SKILL.md')
  assert.ok(help.includes('https://github.com/DarkArty07/aether-plugin/blob/main/docs/guide/audit.md'))
  assert.ok(help.includes('https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/auditar-un-proyecto.md'))
  assert.ok(read('docs/what-aether-adds.md').includes('/aether:audit'))
  assert.ok(read('docs/es/que-agrega-aether.md').includes('/aether:audit'))
})
```

**Acceptance:**

- `node --test tests/audit-docs.test.js` pasa; `tests/docs-facts.test.js` y `tests/help.test.js` pasan con las páginas nuevas (enlaces, anclas, portadas y código en línea resueltos); `npm test` y `npm run validate` pasan (R31).
- La guía dice lo que audita, lo que no hace, qué pasa sin red, sin tests o sin GitHub, dónde se guarda el reporte y que las rondas de prueba están en `specs/026-project-audit/rounds/`.
- No cambia la versión ni el changelog: el release es del dueño.
