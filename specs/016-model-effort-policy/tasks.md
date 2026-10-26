# Tareas: el modelo y el esfuerzo de cada rol, lo más barato que alcance

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, sin dependencias nuevas. Las rutas son relativas a la raíz del repositorio. Cada tarea deja `npm test` en verde: la fusión corre el comando completo, y una prueba que falla fuera de los `Owns` de la tarea la bloquea, así que la tarea cambia **todas** las afirmaciones que su cambio rompe dentro de sus `Owns` y avisa de las que quedan fuera.
- Cada prueba corre en directorios desechables (`tempDir`, `makeRepo` de `tests/helpers.js`); ninguna usa la red, un modelo ni el directorio de datos real.
- **Solo cambia lo que la tarea nombra.** No se tocan el Lead, el Writer, el Judge ni el Examiner (modelo ni esfuerzo), `lib/superdelegation.js`, `lib/ladder.js`, `config/pairs.json`, `config/prices.json`, `config/lanes.json`, los números de la escalera (5, 2 y 1 correcciones; `repeatFindings` 2; la escalera del plan, Haiku 2, Sonnet 2, Opus 1) ni el modelo con que empieza cada unidad.
- No se toca `specs/`, `.specify/`, `.claude/` ni nada fuera de los `Owns` de la tarea. Los comentarios van en inglés, como los del código y las páginas que se editan.
- **Documentación.** Cada página de `docs/` tiene `title`, `description` y un `order` entero en su encabezado y está enlazada desde `docs/index.md`; cada enlace relativo y cada ancla resuelven; un código entre comillas con la forma `aether-<nombre>` debe ser un archivo de `plugins/aether/bin/`. Las cifras de Artificial Analysis que se citan son las de la tabla de abajo (su API y `config/pairs.json`) y nada más: no se lee ninguna página de su web ni se copian datos de ellas.
- **Las cifras que la documentación puede citar** (puntos de inteligencia y costo por tarea del índice, de `config/pairs.json`, leídos el 2026-10-26; puntos en Terminal-Bench 4.0, la prueba de código en terminal, de la API de Artificial Analysis, el mismo día): Haiku `high` 37.8, US$0.08, 22; Haiku `xhigh` 41.2, US$0.12, 29; Sonnet `high` 46.8, US$0.88, 44; Sonnet `xhigh` 51.9, US$2.01, 57; Sonnet `max` 56.0, US$5.46, 64; Opus `medium` 51.2, US$1.34, 53; Opus `high` 53.6, US$1.82, 57; Opus `xhigh` 56.0, US$3.46, 60; Opus `max` 57.6, US$5.98, 60. Lectura de texto largo (LCR) de Opus: `medium` 84, `high` 83, `xhigh` 85.
- **El gasto de las 8 corridas terminadas** (`runs.jsonl`, a precio de lista): US$165.00 en total y US$141.75 fuera del Lead (implementers 43 %, supervisores 30 %, revisión final 19 %, Examiner 6 %); US$96 de esos US$142 en `xhigh` (68 %); Opus US$70.33 (43 %): revisión final 38 %, supervisor 25 %, implementers 23 %, Examiner 12 %, Judge 2 %. El estimado de lo que ahorra el cambio, como máximo: de US$165.00 a US$114.44, y el gasto en Opus de US$70.33 a US$50.62.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [US1] La escalera de los delegados sube a Sonnet y a Opus en `high`: `config/ladder.json`, la tabla de `docs/guide/delegates.md` y sus pruebas → Task 1
- [ ] T002 [US2] El swarm: `effortFor`, el log y la sección Ladder, `reviewPlan`, `reviewerReference` y `agents/supervisor.md`, con las pruebas del workflow → Task 2
- [ ] T003 [US5] El esfuerzo por defecto de una tarea es `high`: `lib/plan.js`, `agents/implementer.md` y sus pruebas → Task 3
- [ ] T004 [P] [US9] La guía del Writer: `agents/writer.md`, `skills/tasks/SKILL.md` y `speckit/commands/speckit.tasks.md`, con una prueba → Task 4
- [ ] T005 [US10] La página `docs/guide/models-by-role.md` con su prueba y su enlace del índice → Task 5
- [ ] T006 [P] [US10] La decisión A93, las notas de A18, A36 y A87, el índice y `docs-facts` → Task 6
- [ ] T007 [P] [US10] Metodología, roadmap, propósito y la entrada «Unreleased» del changelog, con una prueba → Task 7

### Task 1: La escalera de los delegados sube a Sonnet y a Opus en `high`

**Aether:**
- Tier: haiku high — dos números de datos, y las pruebas y la tabla que los fijan están dadas
- Review: high — que no se toque nada más del archivo
- Area: ladder
- Owns: `plugins/aether/config/ladder.json`, `tests/ladder.test.js`, `tests/delegate-*.test.js`, `tests/delegates-docs.test.js`, `docs/guide/delegates.md`
- Depends on: none
- Serves: R1, R6

**Interfaces:**

`plugins/aether/config/ladder.json`: en el escalón `sonnet` y en el escalón `opus`, `effort.retry` pasa de `"xhigh"` a `"high"`. Nada más cambia: `haiku` queda con `first: "high"`, `retry: "xhigh"`; los `first` de los tres son `"high"`; las correcciones son 5, 2 y 1; `repeatFindings` es 2. `lib/ladder.js` no cambia: su `EFFORT_KEY` ya manda una corrección (`fix`) y una subida (`rise`) al esfuerzo `retry`.

`docs/guide/delegates.md`: la tabla de la sección «The ladder» queda así, y justo debajo de la tabla va el párrafo de abajo (sin enlaces nuevos):

```markdown
| Step | Corrections | Effort at first | Effort on a correction or a rise |
|---|---|---|---|
| Haiku | 5 | `high` | `xhigh` |
| Sonnet | 2 | `high` | `high` |
| Opus | 1 | `high` | `high` |

In Sonnet and Opus a correction and a rise run at `high`, the same effort as at first: there a correction changes what the model knows (its own earlier work and the Lead's findings), not how hard it thinks. The next effort costs 2.3 times more in Sonnet and 1.9 times more in Opus (the cost per task of the Artificial Analysis index, in `config/pairs.json`) for 13 and 3 more points in code (Terminal-Bench 4.0). So the ladder allows no effort above `high` for a correction in those two steps, and a correction keeps the effort. This is the one place where a correction does not raise the effort, as decision A87 said it does; it is two numbers of `config/ladder.json` and is reverted there.
```

**Tests (write first):**

`tests/ladder.test.js`, en la prueba «the shipped file holds the numbers the owner approved» (cerca de la línea 26), cambia la afirmación de la subida de Sonnet y añade las demás:

```js
assert.equal(effortFor(L, 'haiku', 'first'), 'high')
assert.equal(effortFor(L, 'haiku', 'fix'), 'xhigh')
assert.equal(effortFor(L, 'sonnet', 'fix'), 'high')
assert.equal(effortFor(L, 'sonnet', 'rise'), 'high')
assert.equal(effortFor(L, 'opus', 'fix'), 'high')
assert.equal(effortFor(L, 'opus', 'rise'), 'high')
```

(usa el nombre con que el archivo ya importa `effortFor` y el ladder cargado: `L`). En la prueba «Haiku has five corrections, and the step rises right after the fifth» (cerca de la línea 38), la subida a Sonnet aterriza en `high`: `assert.equal(answers[5].next.effort, 'high')`.

`tests/delegate-task.test.js`: en la prueba «five corrections of Haiku, and the sixth failure rises to Sonnet…» (cerca de la línea 78) el esfuerzo de la subida es `'high'`: `['sonnet', 'rise', 'sonnet', 'high']`; en la prueba «each step asks the pair of the points of its own model, and a correction keeps the model and raises the effort a step» (cerca de la línea 265) la tercera petición, la de Sonnet, es `{ model: 'sonnet', effort: 'high' }`. Si otra prueba de `tests/delegate-*.test.js` nombra el esfuerzo de una corrección o de una subida de Sonnet o de Opus, también pasa a `high`.

`tests/delegates-docs.test.js`, una prueba nueva (usa los `fs`, `path` y la raíz que el archivo ya declara):

```js
test('the table of steps shows the effort of ladder.json at first and on a correction or a rise', () => {
  const ladder = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'ladder.json'), 'utf8'))
  const page = fs.readFileSync(path.join(ROOT, 'docs', 'guide', 'delegates.md'), 'utf8')
  for (const rung of ladder.rungs) {
    const name = rung.step[0].toUpperCase() + rung.step.slice(1)
    const row = page.split('\n').find((line) => line.startsWith(`| ${name} |`))
    assert.ok(row, `${name} has a row`)
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim().replace(/`/g, ''))
    assert.deepEqual(cells.slice(2), [rung.effort.first, rung.effort.retry], name)
  }
})
```

**Acceptance:**

- `config/ladder.json` tiene el aspecto de arriba y `git diff` de ese archivo cambia solo esas dos líneas.
- La tabla y el párrafo de `docs/guide/delegates.md` son los de arriba; el resto de la página no cambia.
- `npm test` pasa entero.

### Task 2: El swarm sube de modelo en `high`, no sube el reintento en Sonnet y en Opus, y la revisión final

**Aether:**
- Tier: sonnet high — lógica del workflow y reescritura de muchas expectativas que hay que leer una a una
- Review: high — que cada esfuerzo del log, del mensaje del supervisor y de la revisión final salga de la misma función
- Area: swarm
- Owns: `plugins/aether/workflows/run.workflow.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/agents/supervisor.md`, `tests/workflow*.test.js`, `tests/lane-delegate.test.js`
- Depends on: Task 1 — las pruebas de ambas tareas se nombran con patrones de archivos que el chequeo del plan trata como solapados, así que no corren en la misma ola
- Serves: R3, R4, R5, R6

**Interfaces:**

En `plugins/aether/workflows/run.workflow.js`:

1. `effortFor(task, model, attempt)` pasa a ser (con el comentario de arriba reescrito en inglés para que diga lo mismo):

```js
// The task's own effort applies on the task's model: the first attempt, and a retry on a Sonnet or Opus task.
// A retry on a Haiku task runs at xhigh, or at the task's effort when that is max. An attempt on a model the
// unit escalated to runs at high.
function effortFor(task, model, attempt) {
  if (model === task.tier) {
    if (task.effort === 'max' || attempt === 1) return task.effort
    return model === 'haiku' ? 'xhigh' : task.effort
  }
  return 'high'
}
```

2. Toda cadena fija «`xhigh`» que nombra el esfuerzo de una subida se calcula con `effortFor(task, next, 1)` (que da `'high'` para un modelo que no es el de la tarea): el log `escalating from … to …` (hoy cerca de las líneas 1174 y 1316), y `ladderOutlook` (cerca de la 741: la `retryRung` de una subida y la `outlook('Escalate', …)`). El resto de `ladderOutlook` no cambia.
3. `reviewPlan()` (cerca de la 1420): se quita la regla `deep` (la que subía a Opus `xhigh` por una Review en `xhigh` o `max`) y se reescribe el comentario de arriba para que diga: Opus en `xhigh` solo cuando una unidad fundida es de Tier Opus; Sonnet `high` para una corrida pequeña de Haiku con Reviews `high`; Opus `high` en lo demás, y una relanzada nunca es Sonnet. La regla `opus` (`reason: \`${opus.id} is tier opus\``), la de la relanzada y la de la corrida pequeña no cambian.

En `plugins/aether/lib/lane-delegate.js`, `reviewerReference(model)`: para `'opus'` devuelve `{ model: 'opus', effort: 'high' }` (hoy `xhigh`); los otros dos casos no cambian.

En `plugins/aether/agents/supervisor.md` (cerca de las líneas 78 y 79), las dos viñetas dicen:

```markdown
- a retry stays on the same model while the model has attempts left: at `xhigh` on a Haiku task, at the task's own effort on a Sonnet or Opus task, or at `max` when the task asked for it;
- a retry past the model's attempts, and an escalation, move to the next model with attempts, at `high`;
```

**Tests (write first):**

Las pruebas del workflow no pueden depender del esfuerzo por defecto de una tarea, que la Tarea 3 cambia de `xhigh` a `high`: en cada prueba de `tests/workflow*.test.js` cuya tarea no nombra su esfuerzo y cuya expectativa lo contiene (`'haiku xhigh'`, `['haiku xhigh', 'sonnet xhigh']`, etiquetas como `task-1: implement on haiku xhigh (attempt 1)`), la tarea del fixture nombra `effort: 'xhigh'` (o la línea `Tier: … xhigh`), de modo que la expectativa sea la misma antes y después de la Tarea 3.

Reescribe estas pruebas de `tests/workflow.test.js` (los nombres actuales entre comillas; cámbialos para que describan lo nuevo) con estas expectativas, que son los escenarios E2, E3, E4 y E6 de la spec:

| Fixture (Tier, esfuerzo, escalera) | Intento 1 | Reintento | Subida |
|---|---|---|---|
| `haiku`, `high`, Haiku 2 | `haiku high` | `haiku xhigh` | `sonnet high` |
| `sonnet`, `high`, Sonnet 2 | `sonnet high` | `sonnet high` | `opus high` |
| `sonnet`, `xhigh`, Sonnet 2 | `sonnet xhigh` | `sonnet xhigh` | `opus high` |
| `opus`, `max` | `opus max` | `opus max` | (no hay) |

- «a retry runs at xhigh on the same model, and an escalation runs the next model at xhigh»: los tres primeros renglones de la tabla.
- «the supervisor's Ladder section names the rung a retry and an escalation would run»: para el renglón 1 el mensaje dice `A retry runs on haiku xhigh. Escalate runs on sonnet high.`; para el renglón 2, `A retry runs on sonnet high. Escalate runs on opus high.`
- «a task's effort applies only on its own model: with no Haiku attempts, a haiku medium task starts on sonnet xhigh»: una tarea `haiku medium` cuya escalera da 0 intentos a Haiku empieza en `sonnet high`.
- «a unit the supervisor sends back twice on haiku escalates to sonnet and merges»: la lista `unit.tiers` sigue los intentos reales con las reglas de arriba (el primero y el reintento de Haiku al esfuerzo del fixture y a `xhigh`, y el de Sonnet a `high`).
- Revisión final (E6): la prueba «every call passes its effort…» (cerca de la 712), donde una tarea pide una Review `xhigh` sin ser Tier Opus, espera ahora `['opus high']` (antes `['opus xhigh']`); la prueba «the final review runs on Opus at xhigh when a merged task reviews at xhigh or max» pasa a ser «… at high when a merged task reviews at xhigh or max, and no task is tier opus» con `['opus high']`; la de «a merged task is tier opus» sigue esperando `['opus xhigh']` con la razón `…is tier opus`; la de la corrida relanzada con una tarea de Tier Opus sigue en `xhigh`, y la de una relanzada con una tarea Haiku de Review `xhigh` espera `opus high` con la razón de la relanzada; la corrida pequeña de Haiku con Review `high` sigue en `sonnet high`.

`tests/lane-delegate.test.js`, en la prueba «reviewerReference gives the three derived references, and the reviewer choice asks for them» (cerca de la 392): `reviewerReference('opus')` es `{ model: 'opus', effort: 'high' }`, y la elección del revisor para una carga de Opus pide esa referencia (`reference: { model: 'opus', effort: 'high' }`).

Una prueba nueva en `tests/workflow.test.js`, que fija que el workflow ya no nombra un esfuerzo de subida fijo:

```js
test('the workflow no longer hard-codes an xhigh rung for an escalation', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'workflows', 'run.workflow.js'), 'utf8')
  assert.doesNotMatch(source, /to \$\{next\} xhigh/)
  assert.doesNotMatch(source, /\$\{up\} xhigh/)
})
```

(con los `fs`, `path` y `PLUGIN` que el archivo ya tenga; si no los importa, los añade).

**Acceptance:**

- Cada fila de la tabla se cumple en una prueba, y `tests/workflow*.test.js` y `tests/lane-delegate.test.js` pasan.
- En `run.workflow.js` queda «`xhigh`» solo en `effortFor` (el reintento de Haiku) y en `reviewPlan` (la regla del Tier Opus), más los textos de las cadenas que ya lo calculan con `effortFor`; no queda ninguna cadena fija de una subida.
- `npm test` pasa entero.

### Task 3: El esfuerzo por defecto de una tarea es `high`

**Aether:**
- Tier: haiku high — una constante, un campo y las expectativas que cambian, dadas una a una
- Review: high — que el brief y el compilador den lo mismo
- Area: plan
- Owns: `plugins/aether/lib/plan.js`, `plugins/aether/agents/implementer.md`, `tests/plan.test.js`, `tests/aether-plan.test.js`, `tests/agents.test.js`
- Depends on: Task 2 — las pruebas del workflow ya no dependen del esfuerzo por defecto, que este cambio mueve
- Serves: R2, R6

**Interfaces:**

`plugins/aether/lib/plan.js`: `const DEFAULT_EFFORT = 'high'` (hoy `'xhigh'`, línea 10). `DEFAULT_REVIEW` sigue en `'high'`. Lo demás usa la constante (la tarea sin esfuerzo en `buildGraph`, y la línea `Tier:` que escribe `renderBrief`), así que no cambia. `plugins/aether/agents/implementer.md`: en el encabezado, `effort: high` (hoy `xhigh`); el resto del archivo no cambia.

**Tests (write first):**

- `tests/plan.test.js`: en la prueba «plan.js exports the effort levels in order and the two defaults», `assert.equal(DEFAULT_EFFORT, 'high')`; en la de «buildGraph resolves each task to its effort and review, with xhigh and high as the defaults» (cambia el nombre a «… with high and high as the defaults»), las filas que esperaban `['haiku', 'xhigh', 'high']` y `['sonnet', 'xhigh', 'high']` esperan `['haiku', 'high', 'high']` y `['sonnet', 'high', 'high']`; en la de «renderBrief names the starting rung on its Tier line», `/^- Tier: haiku high — complete code$/m`.
- `tests/aether-plan.test.js`: en la prueba «compile gives every task its effort and review, and the brief its starting rung», las filas y la línea del brief con el valor por defecto (`['haiku', 'xhigh', 'high']`, `/^- Tier: haiku xhigh — complete code$/m`) pasan a `high`; la fila de una tarea que nombra su esfuerzo (`['sonnet', 'high', 'xhigh']`) no cambia.
- `tests/agents.test.js`: la prueba «the swarm agents run at their set effort: implementers at xhigh, ops at low, reviews at high» pasa a «… implementers at high …» y espera `'high'` para el `effort` de `implementer`.

**Acceptance:**

- `DEFAULT_EFFORT` es `'high'` y `node plugins/aether/bin/aether-plan compile` de un plan sin esfuerzo en su línea Tier da `effort: "high"` para esa tarea.
- Ninguna otra constante de `plan.js` cambia (`DEFAULT_REVIEW`, `DEFAULT_LADDER`, `DEFAULT_MAX_AGENTS`).
- `npm test` pasa entero. Si una prueba fuera de los `Owns` falla por el esfuerzo por defecto, la tarea lo dice en su reporte con el archivo y no la toca.

### Task 4: La guía del Writer

**Aether:**
- Tier: haiku high — el texto exacto está dado, y una prueba lo fija
- Review: high — que los tres archivos digan lo mismo
- Area: guidance
- Owns: `plugins/aether/agents/writer.md`, `plugins/aether/skills/tasks/SKILL.md`, `plugins/aether/speckit/commands/speckit.tasks.md`, `tests/speckit.test.js`
- Depends on: Task 2 — corre después de la tarea que tiene el patrón de pruebas del workflow, porque un patrón de archivos no comparte ola con otra tarea que posea archivos de `tests/`
- Serves: R2, R5

**Interfaces:**

En `skills/tasks/SKILL.md` (cerca de la línea 44) y en `speckit/commands/speckit.tasks.md` (cerca de la 43), en la viñeta **Tier**, la frase «The effort defaults to `xhigh`. Name a lower effort only where the tests pin the work down completely, such as `haiku high`. Sonnet and Opus never run below `high`. Name `max` only with a reason.» se reemplaza por:

> The effort defaults to `high`. Name `xhigh` only where the tests cannot pin the behavior down and a mistake would cost more than the extra effort: it costs about 2.3 times more on Sonnet and 1.9 times more on Opus than `high`. Haiku may run at `low` or `medium` where the tests pin the work down completely. Sonnet and Opus never run below `high`. Name `max` only with a reason: on Opus it gives what `xhigh` gives.

En la viñeta **Review** (cerca de la 45 y de la 44), la frase «Use `xhigh` where behavior beyond the tests matters: UI states, input parsing, the file system, security, data loss or concurrency.» se reemplaza por:

> `xhigh` costs about 2.3 times more than `high` on Sonnet, and the supervisor of Sonnet's work runs on Opus: name it only where a mistake would reach user data, security or concurrency, and say which.

El ejemplo de la línea `- Review: xhigh — malformed input that the tests do not list` (en `SKILL.md` cerca de la 37, en `speckit.tasks.md` cerca de la 36 y en `agents/writer.md` cerca de la 56) pasa a `- Review: xhigh — a failed parse deletes the user's file`. La línea de ejemplo `- Tier: haiku high — a mechanical parser that exact tests pin down` no cambia.

En `agents/writer.md` (cerca de las líneas 62 a 72), las reglas del esfuerzo dicen lo mismo que las dos viñetas anteriores, y estas dos oraciones quedan literalmente así:

- la primera viñeta de esfuerzo: «- **The effort** is `high` when the Tier line names none. Weigh each task's complexity, and name an effort only when it should differ:»
- la oración «A failed attempt runs again at `xhigh`, so a lowered effort costs one attempt at most.» (cerca de la 71) se reemplaza entera por: «A failed attempt on Haiku runs again at `xhigh`; on Sonnet and Opus it runs again at the task's own effort, and a unit that moves up a model starts there at `high`, so a task named at `xhigh` pays that cost on every attempt.»

La viñeta de la Review del Writer (cerca de la 72) dice que sin la línea el supervisor corre en `high` y que `xhigh` se reserva como arriba; lo demás de esa viñeta no cambia. Si algún otro texto de esos tres archivos dice que el esfuerzo por defecto es `xhigh`, se corrige igual.

**Tests (write first):**

`tests/speckit.test.js`, una prueba nueva (usa los `fs`, `path` y `PLUGIN` que el archivo ya tenga, o los añade):

```js
test('the guidance the Writer reads says the effort defaults to high and keeps xhigh for named risk', () => {
  const files = [
    path.join(PLUGIN, 'skills', 'tasks', 'SKILL.md'),
    path.join(PLUGIN, 'speckit', 'commands', 'speckit.tasks.md'),
    path.join(PLUGIN, 'agents', 'writer.md'),
  ]
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /effort(?:\*\*)? (?:defaults to|is) `high`/, file)
    assert.doesNotMatch(text, /defaults to `xhigh`|is `xhigh` when the Tier line names none/, file)
    assert.doesNotMatch(text, /malformed input that the tests do not list/, file)
  }
  for (const file of files.slice(0, 2)) {
    assert.match(fs.readFileSync(file, 'utf8'), /only where a mistake would reach user data, security or concurrency/, file)
  }
})
```

**Acceptance:**

- La prueba nueva pasa y `tests/speckit.test.js` entero también (el ejemplo de tareas que genera sigue pasando `aether-plan check`).
- Los tres archivos dicen lo mismo del esfuerzo y de la Review; ninguno dice que el esfuerzo por defecto es `xhigh`.
- `npm test` pasa entero.

### Task 5: La página de la guía, con su prueba

**Aether:**
- Tier: sonnet high — redactar una página que una prueba ata al árbol, con tablas y cifras que hay que citar bien
- Review: high — que cada cifra tenga su fuente y la página no prometa lo que no se midió
- Area: docs
- Owns: `docs/guide/models-by-role.md`, `tests/models-by-role-docs.test.js`, `docs/index.md`
- Depends on: Task 1 — la tabla de la escalera de la página es el archivo ya cambiado
- Depends on: Task 2 — la página describe la regla del swarm y la revisión final ya construidas
- Depends on: Task 3 — la página dice el esfuerzo por defecto ya cambiado
- Serves: R7, R8

**Interfaces:**

`docs/guide/models-by-role.md`, en inglés, con este encabezado exacto (el `order` 8 está libre):

```markdown
---
title: Models by role
description: Which model and effort each role of Aether runs on, how a task climbs from one to the next, what each costs, why it is set this way and how to tell whether it should change.
order: 8
---
```

Secciones, con estos títulos (la prueba busca los que están en negrita):

1. `# Models by role`, un párrafo: qué dice la página y que su tabla de la escalera, su esfuerzo por defecto y el modelo y el esfuerzo de cada agente los fija una prueba; la medida es el dólar por tarea, porque el límite de Claude es uno solo para todos los modelos y se gasta por el costo del modelo; las cifras son las de Artificial Analysis (https://artificialanalysis.ai), por su API y por `config/pairs.json`, leídas el 2026-10-26.
2. **`## Each role, before and after`**, una tabla con las columnas `| Role | Before | After | Why |` y estas filas, con el modelo y el esfuerzo de «After» entre comillas inversas en la forma `` `modelo esfuerzo` ``: **Lead** (`sonnet xhigh` antes y después; lo fija el lanzador, y no cambia); **Writer** (`sonnet high`); **Judge** (`opus high`); **Examiner** (`opus high`); **Implementer, first attempt** (el Tier del plan al esfuerzo `xhigh` antes, al `high` después); **Implementer, a retry** (en Sonnet y Opus `xhigh` antes, el esfuerzo de la tarea después; en Haiku, `xhigh` los dos); **Implementer, after a rise** (`xhigh` antes, `high` después); **Supervisor** (antes `sonnet xhigh` en 7 de las 8 corridas por la Review del plan, después `sonnet high`); **Supervisor of Sonnet's work** (antes `opus xhigh`, después `opus high`; sigue siendo Opus porque nadie revisa su propio trabajo); **Final review** (antes `opus xhigh`, después `opus high`, y `opus xhigh` solo si una unidad es de Tier Opus); **Ops** (`haiku low`). La columna «Why» da la razón en una frase. Las filas de **Writer, Judge, Examiner, Supervisor, Final review y Ops** tienen en «After» exactamente el modelo y el esfuerzo del `model` y el `effort` de `agents/writer.md`, `judge.md`, `examiner.md`, `supervisor.md`, `reviewer.md` y `ops.md`.
3. **`## The ladder`**, la tabla de `docs/guide/delegates.md` tal cual: `| Step | Corrections | Effort at first | Effort on a correction or a rise |` con las filas `| Haiku | 5 | \`high\` | \`xhigh\` |`, `| Sonnet | 2 | \`high\` | \`high\` |` y `| Opus | 1 | \`high\` | \`high\` |`; después, la línea `**Default effort of a plan task:** \`high\`` escrita exactamente como `Default effort of a plan task: \`high\`` dentro de esa línea; y dos párrafos: cómo sube una tarea de delegado (empieza en Haiku `high`; una corrección sube a `xhigh` en Haiku y se queda en `high` en Sonnet y Opus; una subida pasa al modelo siguiente y llega en `high`), y cómo el swarm hace lo mismo (primer intento al esfuerzo de la tarea; un reintento en Haiku en `xhigh` y en Sonnet u Opus al esfuerzo de la tarea; una subida de modelo en `high`; cada unidad empieza en el modelo que le fija el plan).
4. **`## Where the spend went`**: las cifras del gasto de las 8 corridas de las restricciones globales, y el estimado como máximo (de US$165.00 a US$114.44; el gasto en Opus de US$70.33 a US$50.62) con lo que lo compone (Sonnet de `xhigh` a `high` en implementer y supervisor, US$31; revisión final, hasta US$12; supervisor en Opus de `xhigh` a `high`, US$6.70; implementers en Opus, US$1.30) y lo que no cuenta (empezar en Haiku, los reintentos que podría añadir, el costo de cada corrección para el Lead).
5. **`## Why`**: J1 a J6 del diseño, cada hallazgo con su fuente: la medida es el dólar por tarea; el gasto está en `xhigh`; los esfuerzos no valen igual (la tabla de cifras de las restricciones globales); dónde Opus se justifica; la escalera ponía a Sonnet y a Opus siempre en `xhigh`; la revisión final y el supervisor subían a `xhigh` por costumbre. Enlace relativo a `../../specs/016-model-effort-policy/design.md` para la justificación completa.
6. **`## Where Opus stays`**: una lista con cada uso que queda y su razón: último escalón de una tarea que Haiku y Sonnet no resolvieron (`opus high`: 57 en código contra 44 de Sonnet `high`); Judge y Examiner (el Judge es el rol de más riesgo y casi no gasta; del Examiner no hay evidencia en ningún sentido; con superdelegación van primero a otro harness); revisión final (la última red; `xhigh` solo con Tier Opus); supervisor de un autor Sonnet (solo por la regla de que nadie revisa su propio trabajo). Y dos que no se usan: Opus `xhigh` y `max` fuera de ese caso (3 puntos más en código por casi el doble, y `max` da lo que `xhigh`).
7. **`## How to tell if it worked`**: qué medir en las dos corridas siguientes de un swarm con `aether-report`: el gasto por rol, modelo y esfuerzo; `quality.attempts`, `climbed` y `escalated`; los hallazgos de los supervisores y los de la revisión final; el veredicto de la revisión final; los fallos del examen; y, con `superdelegation` activo, qué pares externos tomaron las llamadas (el par de referencia baja y puede cambiar quién las toma). La línea base son las 8 corridas. **Cuándo deshacer:** si en esas dos corridas la revisión final o el examen encuentran, en promedio por corrida, más hallazgos `critical` o `important` de unidades que su supervisor había aprobado que el promedio de la línea base (1.7 por corrida: 2, 1 y 2 en las tres corridas con dato), o si las unidades de Sonnet que en el primer intento piden un segundo pasan del 33 % (el 17 % fue en `high` y el 33 % en `xhigh`). **Qué se toca para deshacer, en cinco lugares:** `config/ladder.json`, `DEFAULT_EFFORT` de `lib/plan.js`, `effortFor` y `reviewPlan` de `workflows/run.workflow.js`, y `reviewerReference` de `lib/lane-delegate.js`. Lo que no se puede medir hoy: las corridas no guardan lo que cada supervisor aprobó o rechazó por intento, solo totales.
8. **`## What did not change`**: el Lead, el Writer, el Judge y el Examiner; la regla de que nadie revisa su propio trabajo; los números de la escalera; la escalera del plan (Haiku 2, Sonnet 2, Opus 1); el modelo con que empieza cada unidad; el orden de los asientos de diseño.

Los enlaces relativos de la página a otras páginas (`delegates.md`, `options.md`, `design-seats.md`, `../methodology.md`) deben existir. La página no enlaza `docs/reference/artificial-analysis.md` (no existe en esta rama).

`docs/index.md`: en la lista de la guía, una línea nueva con el mismo estilo que las demás, después de la de Delegates: `- [Models by role](guide/models-by-role.md): which model and effort each role runs on, how a task climbs, what each costs, why it is set this way and how to tell whether it should change.`

**Tests (write first):**

`tests/models-by-role-docs.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(PLUGIN, '..', '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const page = read('docs/guide/models-by-role.md')
const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim())
const front = (text, key) => (new RegExp(`^${key}: (.*)$`, 'm').exec(text) || [])[1]

test('the page has its front matter and the index links it', () => {
  assert.match(page, /^---\ntitle: .+\ndescription: .+\norder: \d+\n---\n/)
  assert.match(read('docs/index.md'), /\]\(guide\/models-by-role\.md\)/)
})

test('every relative link of the page resolves', () => {
  for (const m of page.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'guide', m[1])), m[1])
  }
})

test('the ladder table is config/ladder.json', () => {
  const ladder = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'ladder.json'), 'utf8'))
  for (const rung of ladder.rungs) {
    const name = rung.step[0].toUpperCase() + rung.step.slice(1)
    const row = page.split('\n').find((line) => line.startsWith(`| ${name} |`))
    assert.ok(row, `${name} has a row`)
    const [, corrections, first, retry] = cells(row)
    assert.equal(Number(corrections), rung.corrections, name)
    assert.equal(first.replace(/`/g, ''), rung.effort.first, name)
    assert.equal(retry.replace(/`/g, ''), rung.effort.retry, name)
  }
})

test('the default effort of a plan task is the one of lib/plan.js', () => {
  const { DEFAULT_EFFORT } = require(path.join(PLUGIN, 'lib', 'plan.js'))
  assert.ok(page.includes(`Default effort of a plan task: \`${DEFAULT_EFFORT}\``))
})

test('the After column names the model and effort of each agent file', () => {
  const roles = { Writer: 'writer', Judge: 'judge', Examiner: 'examiner', Supervisor: 'supervisor', 'Final review': 'reviewer', Ops: 'ops' }
  for (const [label, file] of Object.entries(roles)) {
    const agent = read(`plugins/aether/agents/${file}.md`)
    const pair = `\`${front(agent, 'model')} ${front(agent, 'effort')}\``
    const row = page.split('\n').find((line) => line.startsWith(`| ${label} |`))
    assert.ok(row, `${label} has a row`)
    assert.ok(cells(row)[2].includes(pair), `${label}: After holds ${pair}`)
  }
})

test('the page says where Opus stays, what to measure and when to undo', () => {
  for (const heading of ['## Each role, before and after', '## The ladder', '## Where the spend went', '## Why', '## Where Opus stays', '## How to tell if it worked', '## What did not change']) {
    assert.ok(page.includes(heading), heading)
  }
  for (const word of ['quality.attempts', 'climbed', 'escalated', 'config/ladder.json', 'DEFAULT_EFFORT', 'effortFor', 'reviewPlan', 'reviewerReference']) {
    assert.ok(page.includes(word), word)
  }
})
```

**Acceptance:**

- La página existe con ese encabezado, esas secciones y esas tablas, y `tests/models-by-role-docs.test.js` pasa.
- Cada cifra de la página está en las restricciones globales de este documento; ninguna viene de otra fuente. La página no dice «Briefcase» ni cita datos de las páginas de modelos de Artificial Analysis.
- `docs/index.md` enlaza la página y su descripción no pasa de una frase; el resto del índice no cambia (la línea de «Decisions» la cambia la Tarea 6).
- `npm test` pasa entero.

### Task 6: La decisión A93 y las pruebas de documentos

**Aether:**
- Tier: sonnet high — una decisión larga con su justificación completa, y tres notas en filas que ya existen
- Review: high — que la decisión cite cada cifra con su fuente y diga lo que se descartó
- Area: decisions
- Owns: `docs/decisions.md`, `docs/index.md`, `tests/docs-facts.test.js`
- Depends on: Task 5 — el índice ya enlaza la página nueva y su línea de decisiones se cambia aquí
- Serves: R7

**Interfaces:**

`docs/decisions.md`: una fila nueva `| A93 | … | … |` después de la A92, con el mismo estilo (título en negrita que es una frase completa, y una última celda `Decided 2026-10-26; …`). El título contiene la frase `cheapest model and effort` (por ejemplo: «**Each role runs on the cheapest model and effort that does its work, and a task climbs effort first and then model.**»). El texto, en inglés, dice: las palabras del dueño tal como están en la tarjeta (`specs/016-model-effort-policy/intent.md`); qué se decidió, D1 a D8 de `specs/016-model-effort-policy/design.md` en una frase cada una; la justificación J1 a J7 con sus cifras, sus fuentes (la API de Artificial Analysis y `config/pairs.json`, leídas el 2026-10-26, y `runs.jsonl`) y que la medida es el dólar por tarea; la prueba de código usada (`Terminal-Bench`); las alternativas descartadas (corregir en `xhigh` como hoy; empezar el swarm en Haiku; Opus `medium` en el supervisor; Sonnet en la revisión final; dejar `xhigh` y bajar solo las subidas); lo que ahorra (como máximo US$50 de US$165, 31 %) y lo que arriesga (J7 y los riesgos del diseño); que se aparta de A87 y por qué, y que se revierte con dos números; la nota del número (A93 es provisional hasta fundir; el issue 50); y que se mide con D8 y se deshace en cinco lugares. La última celda enlaza `[the page](guide/models-by-role.md)` y `[the design](../specs/016-model-effort-policy/design.md)`.

Notas de actualización, una oración que empieza con `**Update (A93):**` al final del texto de la fila (como A32 y A53 ya hacen con sus notas):
- **A18** (el esfuerzo por tarea): `**Update (A93):** the default is now high, a retry on Sonnet or Opus keeps the task's effort, and a unit that moves up a model runs at high; only Haiku retries at xhigh.`
- **A36** (la revisión final por riesgo): `**Update (A93):** the final review rises to Opus xhigh only when a merged unit is of Tier Opus; a Review at xhigh or max no longer raises it.`
- **A87** (la corrección sube un escalón de esfuerzo): `**Update (A93):** in Sonnet and Opus the ladder's effort for a correction is high, so a correction there keeps the effort; Haiku still raises it from high to xhigh.`

`docs/index.md`: la línea de «Decisions» pasa de «A1–A92» a «A1–A93» (el resto de la línea no cambia).

**Tests (write first):**

`tests/docs-facts.test.js`: en la prueba «R15: the decisions A50 to A92 are recorded and the changelog opens with 0.20.1…» cambia el nombre a «A50 to A93», `const LAST_DECISION = 93`, y añade después de la afirmación de `line(92)`:

```js
assert.ok(/cheapest model and effort/.test(line(93)) && /Terminal-Bench/.test(line(93)) && /A87/.test(line(93)))
for (const n of [18, 36, 87]) assert.ok(/Update \(A93\)/.test(line(n)), `A${n} has its update note`)
```

La prueba «R12: the range of decisions the pages name runs to the last decision» no se cambia: pasa sola cuando el índice dice `A1–A93`. Las demás afirmaciones sobre el changelog (la primera línea `Version 0.20.1:`) no cambian.

**Acceptance:**

- `docs/decisions.md` tiene la fila A93 y las tres notas; el resto de las filas no cambia.
- `tests/docs-facts.test.js` pasa entero con `LAST_DECISION = 93`.
- `npm test` pasa entero.

### Task 7: Las páginas corregidas y el changelog

**Aether:**
- Tier: sonnet high — reescribir afirmaciones en cuatro páginas sin dejar una vieja
- Review: high — que ninguna página siga diciendo que el esfuerzo por defecto es `xhigh` ni que todo reintento va a `xhigh`
- Area: docs-pages
- Owns: `docs/methodology.md`, `docs/roadmap.md`, `docs/purpose.md`, `docs/changelog.md`, `tests/effort-policy-docs.test.js`
- Depends on: Task 5 — el changelog y la metodología enlazan la página nueva
- Serves: R7, R9

**Interfaces:**

`docs/methodology.md` (cerca de las líneas 22, 123, 133 y 134):

- En la viñeta de **la tarea en el plan** (cerca de la 123): «The effort defaults to `xhigh`, and is lowered only where the tests pin the work down completely.» pasa a «The effort defaults to `high`, and is raised to `xhigh` only where the tests cannot pin the behavior down and a mistake would cost more than the extra effort.»; y la frase «The first attempt runs at the task's effort; a retry on the task's own Tier runs at `xhigh`, or at `max` when the task asked for `max`, and every attempt on a model the unit moved up to runs at `xhigh`.» pasa a «The first attempt runs at the task's effort; a retry on the task's own Tier runs at `xhigh` on Haiku and at the task's effort on Sonnet and Opus (or at `max` when the task asked for `max`), and every attempt on a model the unit moved up to runs at `high`.»
- En la línea de esfuerzos (cerca de la 133), Sonnet y Opus quedan en `high`, con `xhigh` solo donde un error costaría más que el esfuerzo, y `max` solo con una razón.
- En la viñeta de la escalera de los delegados (cerca de la 134), una oración: «In Sonnet and Opus a correction and a rise run at `high`.»
- En la de la revisión final (cerca de la 22), «on Opus or Sonnet by the run's risk» queda como «on Opus, or on Sonnet for a small all-Haiku run, at `high`, and at `xhigh` only when a unit is of Tier Opus».
- Un enlace a `guide/models-by-role.md` en la sección donde se habla del modelo y el esfuerzo de cada rol.

`docs/roadmap.md`, sección «Effort» (líneas 13 a 15): «The default is `xhigh` on every model. The Writer lowers it where the tests pin the work, and names `max` only with a reason.» pasa a «The default is `high` on every model. The Writer raises it where a mistake would cost more than the extra effort, and names `max` only with a reason.»; y «A failed attempt runs again at `xhigh`, then moves up the ladder.» pasa a «A failed attempt on Haiku runs again at `xhigh`; on Sonnet and Opus it runs again at the task's effort, and a unit that moves up a model starts there at `high`.» Las demás líneas no cambian, y no se toca la línea «Now».

`docs/purpose.md` (línea 39): «A failed attempt runs again at `xhigh`, and then on a stronger model.» pasa a «A failed attempt runs again, at a higher effort on Haiku and at the same effort on Sonnet and Opus, and then on a stronger model.»

`docs/changelog.md`: una sección nueva `## Unreleased` entre `# Changelog` y `## Status`, con una entrada que no empieza con `Version X.Y.Z:` y que dice, en inglés: qué cambia (el esfuerzo por defecto, la escalera de los delegados y la del swarm, la revisión final, la guía del Writer y la referencia del revisor), por qué en una frase (el gasto está en `xhigh` y los esfuerzos no valen igual), el ahorro como máximo (US$50 de US$165), la nota de que se aparta de A87, los enlaces `[decisions](decisions.md) A93`, `[Models by role](guide/models-by-role.md)` y `[the design](../specs/016-model-effort-policy/design.md)`, y una oración que dice que el encabezado `Version X.Y.Z:` se escribe al publicar. La sección `## Status` y sus líneas no cambian.

**Tests (write first):**

`tests/effort-policy-docs.test.js`, completo:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(PLUGIN, '..', '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the methodology says the effort of a task defaults to high and how a retry and a rise run', () => {
  const text = read('docs/methodology.md')
  assert.doesNotMatch(text, /The effort defaults to `xhigh`/)
  assert.match(text, /The effort defaults to `high`/)
  assert.match(text, /a retry on the task's own Tier runs at `xhigh` on Haiku and at the task's effort on Sonnet and Opus/)
  assert.match(text, /every attempt on a model the unit moved up to runs at `high`/)
  assert.match(text, /models-by-role\.md/)
})

test('the roadmap and the purpose page no longer say every retry runs at xhigh', () => {
  const roadmap = read('docs/roadmap.md')
  const purpose = read('docs/purpose.md')
  assert.doesNotMatch(roadmap, /The default is `xhigh` on every model/)
  assert.match(roadmap, /The default is `high` on every model/)
  assert.doesNotMatch(roadmap, /A failed attempt runs again at `xhigh`, then moves up the ladder/)
  assert.doesNotMatch(purpose, /A failed attempt runs again at `xhigh`, and then on a stronger model/)
})

test('the changelog has an Unreleased entry that does not start a version line', () => {
  const text = read('docs/changelog.md')
  const at = text.indexOf('## Unreleased')
  assert.ok(at > -1, 'an Unreleased heading')
  const next = text.indexOf('\n## ', at + 5)
  const entry = text.slice(at, next > -1 ? next : undefined)
  for (const word of ['xhigh', 'A93', 'models-by-role.md']) assert.ok(entry.includes(word), word)
  assert.doesNotMatch(entry, /^Version \d+\.\d+\.\d+: /m)
  assert.ok(text.indexOf('## Status') > at, 'Unreleased comes before Status')
})
```

**Acceptance:**

- Las cuatro páginas dicen lo nuevo y `tests/effort-policy-docs.test.js` pasa.
- `docs/changelog.md`: su primera línea `Version X.Y.Z:` sigue siendo la `Version 0.20.1:` y `tests/docs-facts.test.js` pasa sin cambio (R11 y R15).
- Ninguna tarea de esta corrida funde en `main`, sube ni publica (R9): el trabajo de cada unidad queda en la rama de integración de la corrida.
- `npm test` pasa entero.
