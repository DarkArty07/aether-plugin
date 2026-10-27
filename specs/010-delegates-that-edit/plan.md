# Los delegados que editan salen primero a otros harness: plan

**Spec:** [spec.md](spec.md)

## Technical context

- **Stack.** Node.js 22 CommonJS sin dependencias; los bins son finos y `plugins/aether/lib/` guarda la lógica. Las pruebas son `node --test "tests/*.test.js"` (`npm test`); el mod tiene las suyas en `plugins/aether/hooks/*.test.ts` (`npm run test:mod`), que esta obra no toca.
- **Lo que existe y se reutiliza, sin cambiarlo.** La regla única es `choose` en `plugins/aether/lib/superdelegation.js` sobre la tabla de `plugins/aether/config/pairs.json`; `lib/lane-pick.js` ya exporta `harnessViews` y `latestReadings` (las vistas de cuota que `choose` lee, con el refresco de Grok). `lib/lane-calls.js` arranca, espera y juzga una llamada externa (`start`, `wait`, `result`, con `harness.timeouts[role]` como límite del CLI, el entorno sin credenciales de `lanes.laneEnv` y, para el implementador, el worktree de unidad de `lib/lane-work.js`, la comprobación de Owns y el paquete del diff). `lib/worktrees.js` da `ensure`, `merge` (la fusión de a una, con el comando de pruebas del grafo), `removeUnit` (que guarda el parche en `runs/<run>/patches/<task>.patch`) y `diffPackage`. `lib/run.js` da los ids de corrida y las rutas. El router (`lib/route.js`) ya busca `ROUTER-OVERRIDE:` línea a línea en el brief entero, ya clasifica si la tarea edita (la respuesta `edits_files` del criterio, que guarda como `decision.readOnly` en la entrada de su diario, `lib/router-log.js`) y ya salta los agentes `aether:*` sin escribir entrada. El informe de delegados (`aether-report --delegates`, `lib/router-report.js`) ya une ese diario con el uso.
- **El hueco, medido en la tarjeta (sección 7).** `aether-lane start` exige una corrida compilada (id, `graph.json`, briefs) y ningún comando parte de un encargo suelto; el cupo `maxParallel` solo se cuenta en memoria dentro del workflow (`workflows/run.workflow.js`), así que un proceso suelto no lo ve; el rol `reviewer` de una lane solo sabe revisar lo ya fusionado (lee `packages/final.diff` sobre una copia de la rama de integración), no la unidad todavía sin fusionar de un delegado suelto.
- **Estructura nueva.** Un comando, `aether-lane delegate`, en `plugins/aether/lib/lane-delegate.js` (el bin solo lo despacha). Nada más: ninguna tabla, opción ni workflow nuevos.
- **Sin constitución.** `.specify/memory/constitution.md` no existe.
- **Pruebas sin cuota.** Todo se prueba con `tests/helpers.js` (`makeRepo`, `runBin`), `tests/lane-fixtures.js` (`laneEnv`, con la tabla real de lanes apuntando a los CLI simulados) y `tests/fixtures/fake-agy.js` (directivas `FAKE-AGY:` en el prompt), `fake-grok.js` y `fake-muse.js`. Nada de `npm test` llama a un harness real.

## Gate

- Nothing speculative, and nothing for a hypothetical need. **Pass.** Cada decisión de abajo sirve a un requisito nombrado. No se construye el rechazo en el router (la propuesta de la spec), ni un estado consultable del comando en marcha (R6 lo descarta), ni la revisión final en rebanadas por lane (fuera de alcance), ni soporte para codex o cursor.
- No abstraction, option, file or dependency that no requirement asks for. **Fail, kept and justified in Complexity.** La spec pide el comando, el cupo, la revisión con el rol `reviewer` y la medida, pero no nombra: el grafo de una unidad que el comando escribe, los huecos atómicos del cupo entre procesos, el `reviewer` con tarea en `lib/lane-calls.js`, ni los campos nuevos del registro de lanes y del diario del router. Cada uno nace de una restricción medida arriba y la sección Complexity dice qué requisito lo pide y por qué la alternativa simple es peor.

## Design

Cada decisión dice a qué requisitos sirve. Las formas exactas (comando, resultado, entradas de registro) se fijan aquí una vez y `tasks.md` las repite en sus Global Constraints.

**D1. El comando es `aether-lane delegate`, síncrono, en un módulo nuevo.**

```
aether-lane delegate --brief <file> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> --owns <glob>[,<glob>...] [--tests <command>] [--session <id>]
```

El rol del que edita es siempre `implementer` (R1), así que no es un flag. `--brief` es el archivo con el encargo entero (objetivo, archivos, qué es terminar): por archivo, no por la línea de órdenes, porque un encargo real no cabe en un flag sin entrecomillado frágil. `--model` y `--effort` son el par de Claude que le tocaría a la tarea (la tabla de delegados del Lead, o el peldaño del router en `command`): el Lead los pasa, el comando no los adivina. El comando corre entero en su proceso y no se desprende (R6): el segundo plano es el Bash del Lead. Imprime un JSON y termina con código 0 en los tres estados (`done`, `no-candidate`, `off`); un error de uso o de infraestructura sigue el patrón del bin (`{ error }`, código 1). La lógica vive en `lib/lane-delegate.js`:

```js
delegateCommand(cwd, flags, deps = {}) // flags: { brief, model, effort, owns, tests?, session? }
// -> DelegateResult (D5). deps inyectables para las pruebas: { env, now, newRunId, wait, isAlive }; wait es calls.wait si falta
reviewerReference(model) // -> { model, effort } (D4)
acquireSlot(dataDir, harness, maxParallel, { pid, isAlive, liveExternal = 0, runId = null }) // -> { slot } | null; el hueco guarda pid y runId (D3)
releaseSlot(dataDir, harness, slot)
liveLaneCalls(mainRoot, harness, { dataDir = null, excludeRun = null, isAlive } = {}) // -> número de llamadas de lane vivas de ese harness que ningún hueco en pie ya cuenta (D3)
```

*Serves: R1, R6; C1, C2, C3.*

**D2. Una corrida de una unidad, escrita por el comando, sin `aether-plan compile`.** El comando crea un id de corrida con `run.newRunId()` y escribe el mismo `graph.json` que `aether-plan compile` escribe, con una sola tarea, para que `aether-wt ensure`, la comprobación de Owns, el paquete y `aether-wt merge` funcionen tal cual:

```js
{ runId, binDir, repoRoot: mainRoot, runDir, plan: null, spec: null,
  integration: { branch: <la rama actual del worktree desde el que se lanza>, worktree: <ese worktree>, base: <su HEAD>, firstBase: <su HEAD> },
  testCommand: <el --tests del encargo, o 'true' cuando la tarea no trae comando>,
  ladder: { haiku: 2, sonnet: 2, opus: 1 }, maxAgents: 1, waves: [['task-1']],
  tasks: { 'task-1': { number: 1, title: 'delegate', tier: <model del encargo>, tierReason: 'delegate', effort: <effort del encargo>,
    review: 'high', area: 'delegate', owns: [...], dependsOn: [], brief: <runDir>/briefs/task-1.md } },
  lanes: <superdelegation.runArgs con los harness habilitados restringidos a agy, grok y muse> }
```

y el brief en `briefs/task-1.md`, con el texto del encargo. No hay línea de base de pruebas: grabarla correría el comando de pruebas en el checkout del dueño antes de delegar, y `merge` sin baseline ya juzga conservador (solo pasa si las pruebas pasan). El id de la tarea para R9, R14, R18 y R19 **es el id de la corrida** (`AETHER-TASK: <runId>`): ya es único, ya es un token válido y une el registro de lanes, el brief nativo y la rama `aether/<runId>/task-1` sin un segundo identificador. *Serves: R1, R4, R5, R9; C2.*

**D3. La elección, el reintento y el cupo viven en un solo bucle, en el propio proceso.** Para cada intento el comando compone lo que `aether-lane pick` hace como proceso —`latestReadings` y `harnessViews` de `lib/lane-pick.js`, y `choose` de `lib/superdelegation.js` con la tabla de pares—, lo registra con la misma entrada `choice` del registro de lanes, y:

1. Si el par elegido es de un harness con el cupo lleno —contado como abajo: los huecos `delegate` en pie más las llamadas de lane ya vivas de ese harness que ningún hueco en pie ya cuenta llegan a `maxParallel`—, ese harness queda excluido **para esta tarea** —se excluyen todos sus pares— y se vuelve a elegir. Un cupo lleno nunca cuenta como intento ni como fallo de un par (R3, R13).
2. Si hay par y lugar, se reserva el hueco, se escribe el prompt del intento (el brief, con el comando de pruebas y las rutas que posee nombrados) en `runs/<run>/lanes/<call>/prompt.md` más su `spawn.json` con la sesión, y se llama a `calls.start` y a la espera inyectable `wait` (D1; en producción, `calls.wait`) con `maxSeconds` de `harness.timeouts[role] + 180`: el límite del CLI es el de la tabla de lanes (2700 s para el implementador), nunca el de 360/570 s de `lib/delegate-limits.js`, que este camino no importa (R7). Las llamadas se nombran `task-1-<intento>-implement` y `task-1-review-<intento>`.
3. Un intento falla cuando `start` devuelve `unavailable`, cuando el resultado de la lane no es `ok` (`quota`, `failed`, `violation`, `blocked`), o cuando el implementador responde `NEEDS_CONTEXT` o `BLOCKED`. Al fallar: `removeUnit(run, task-1, { keepPatch: true })` guarda el trabajo como parche y deshace worktree y rama; el comando renombra ese parche a `patches/task-1-attempt-<intento>.patch` para que el siguiente intento no lo pise; anota `{ pair, cause, patch }` en `tried` y sigue con ese par excluido, nunca el mismo (R8).
4. Sin par en la primera elección, o agotados los candidatos entre fallos y cupos, el resultado es `no-candidate` (D5) y el comando escribe en el registro de lanes, con el mismo id, `{ kind: 'delegate', time, session, run, id, status: 'no-candidate', cause, tried }` (R9). `cause` es `no-pair` cuando ningún par llega a los puntos, `dry` cuando toda cuota que llega está seca, `cupo` cuando lo único que lo impidió fueron cupos llenos, y `failed` cuando al menos un par se intentó y falló; `tried` lleva el detalle de cada uno mezclado.

El cupo se cuenta contra las llamadas reales del harness, no solo entre procesos `delegate` (R13), y sin contar dos veces la llamada de otro delegado: su hueco ya la cuenta. Para eso cada hueco guarda, junto al pid del proceso `delegate`, un archivo `run` con el id de la corrida que lo tiene (el comando lo pasa como `runId` al reservar). Antes de reservar, el comando cuenta las llamadas de lane ya vivas de ese harness con `liveLaneCalls(mainRoot, harness, { dataDir, excludeRun: <la corrida propia>, isAlive })`: una llamada viva es un `call.json` bajo `<mainRoot>/.aether/runs/*/lanes/*/` cuyo campo `harness` es ese harness, sin un `result.json` terminado (`done: true`) en su carpeta y con el pid de su runner (el archivo `pid` de la carpeta) todavía vivo; y la cuenta salta las llamadas cuya corrida tiene un hueco en pie de ese harness —el archivo `run` del hueco la nombra y el pid del hueco vive—, porque ese hueco ya ocupa su lugar. Un hueco cuyo pid ya no vive no excluye a nadie: si su llamada sigue viva, vuelve a contar aquí. Esa cuenta entra en `acquireSlot` como `liveExternal`, con lo que la capacidad que queda para delegados es `maxParallel - liveExternal`, y un harness que el enjambre ya tiene lleno (2 en grok y muse, según `config/lanes.json`) no recibe además un delegado, mientras que dos delegados sí comparten un harness de `maxParallel` 2 ocupando un hueco cada uno. Los huecos siguen siendo la reserva entre procesos `delegate`, que el conteo por sí solo no da: `<dataDir>/lanes/cupo/<harness>/slot-<i>/`, uno por cada `i` de `0` a `maxParallel - 1`, creados con `mkdir` (atómico) y con el pid del proceso `delegate` y su archivo `run` dentro, y la reserva solo prospera mientras los huecos en pie no lleguen a esa capacidad restante. Reservar es quedarse con el primer hueco libre; un hueco cuyo pid ya no vive se reclama; soltar es borrar el hueco, siempre en un `finally`. La cuenta de vivas se repite en cada reserva, también la del revisor (D4), que reserva igual en su harness. *Serves: R2, R3, R7, R8, R9, R13; C1, C3, C4.*

**D4. La revisión del diff es una lane `reviewer` sobre la unidad, y para eso la lane aprende un caso.** Hoy `start` con rol `reviewer` ignora `--task` y prepara la copia de la revisión final. El cambio, solo en `lib/lane-calls.js`: un `reviewer` **con** `--task` prepara la copia de la rama de la unidad con su brief y su paquete (`prepareReader` con tarea, que `lib/lane-work.js` ya sabe hacer), la foto previa y la comprobación de unidad intacta se hacen también para él, y su nota de lane es una variante de la del `reviewer` que dice que corre sobre una copia de la rama de la unidad, con `brief.md` y `package.diff` en la carpeta `.aether-tmp` —la nota de hoy («Aether final reviewer», copia de la rama de integración) describiría mal su carpeta—. Sin `--task` sigue siendo la revisión final de hoy, con su nota byte a byte. El comando deriva el par de referencia del revisor como dice R1 —`reviewerReference(model)`: `opus → { opus, xhigh }`, `haiku → { sonnet, high }`, cualquier otro → `{ opus, high }`— y corre el mismo bucle de D3 con el rol `reviewer`, excluyendo el par que escribió y cada revisor ya probado (sin lista de autores: R10 excluye el par, no la familia). La revisión corre siempre que la primera elección del revisor dé un par; si no da ninguno no se lanza y el resultado lo dice (R10). Un revisor que no devuelve resultado `ok` es un revisor sin veredicto: el esquema de la lane ya convierte una respuesta sin veredicto en `failed`, así que «falla» y «no devuelve veredicto» son el mismo caso observable, y ninguno descarta ni repite el trabajo del que escribió. *Serves: R10, R11; C5.*

**D5. El resultado lleva todo lo que el Lead decide con él, y no fusiona.**

```js
// status: 'done'
{ status, id, run, branch: 'aether/<run>/task-1', worktree, head,
  pair: { id, harness, model, effort }, reason,           // el par que escribió y por qué (la razón de choose)
  summary, implementer: { status, tests, concerns, question },
  tests: { command, exitCode, passed, timedOut, outputTail } | null,   // null: la tarea no trae comando (R11)
  review: { status: 'done', pair, verdict, findings, summary }
        | { status: 'none', cause: 'no-pair' | 'dry' | 'cupo' }
        | { status: 'no-verdict', tried: [{ pair, cause }] },
  tried: [{ pair, cause, patch }],                        // los intentos fallidos del que escribió
  merge: 'aether-wt merge <run> task-1' }
// status: 'no-candidate'  { status, id, run, cause, reason, tried }
// status: 'off'           { status, reason: 'option' | 'platform' }
```

Cuando el implementador termina `ok`, la lane ya dejó el trabajo comiteado en la rama de la unidad (`finishImplementer`); el comando corre entonces el comando de pruebas **dentro del worktree de la unidad** (15 minutos de tope, la cola de la salida recortada a 4000 caracteres, como `merge`) y luego la revisión de D4. Unas pruebas que fallan no reintentan en otro par ni borran la rama: el resultado las trae y decide el Lead (R5, R12). Con `superdelegation` apagado, el comando no lee tablas, no crea corrida ni llama a nadie: devuelve `off`, que no se anota como `no-candidate` en ningún registro (R20). *Serves: R5, R10, R11, R20; C1, C2, C5.*

**D6. La captura de R19 son dos campos en la entrada que el router ya escribe.** `aetherTaskOf(prompt)`, al lado de `overrideOf` en `lib/route.js`, busca línea a línea en el brief entero una línea `AETHER-TASK: <id>` (prefijo fijo, id con la forma de los ids del router) y la devuelve o `null`. Toda entrada `decision` del diario gana `aetherTask` (ese id o `null`) y `taskClass`: `'edits'` cuando la clasificación dice que no es de solo lectura, `'read-only'` cuando dice que sí, y `null` —sin clase— cuando no hubo clasificación: el camino de `ROUTER-OVERRIDE:`, un fallo del decider y un error interno. Nada más cambia: los agentes `aether:*` siguen sin entrada y sin ajustes del router no hay entrada, como R19 fija. *Serves: R19; C6.*

**D7. La medida de R18 vive en el informe que ya une el diario: `aether-report --delegates`.** `delegatesReport` (`lib/router-report.js`) gana dos campos: `editsOnClaudeWithoutNoCandidate`, una fila por delegación con `taskClass: 'edits'` que corrió en Claude y sin una entrada `delegate` de `no-candidate` en el registro de lanes con el id de su `aetherTask` (sin `aetherTask` no hay unión posible: también se lista), cada fila `{ id, time, session, description, aetherTask, ranOn }`; y `outsideMeasure`, el texto fijo que dice, donde se presenta la lista, qué vías quedan fuera (agentes `aether:*` sin entrada, `ROUTER-OVERRIDE:` sin clase, sesiones sin ajustes del router). «Corrió en Claude» incluye el `ranOn: null` de una entrada que no fue externa: en los modos `record` y `advise`, cuando el Lead no pasó modelo y effort, `ranOnOf` (`lib/route.js`) no puede nombrar el par heredado y guarda `null`, pero la llamada fue nativa en Claude, y R19 manda que la captura valga en los tres modos; contar solo un `ranOn` presente dejaría fuera justamente esos delegados que editan en Claude. Una fila externa (`applied: 'external'` o con intentos `outcome`) con `ranOn: null` no es ese caso y no se trata como Claude. La fila de la lista conserva su `ranOn` tal cual (`null`: el par heredado no quedó registrado). La unión pura se exporta para probarla: `editsWithoutNoCandidate(delegations, noCandidateIds)`. *Serves: R18, R19; C6.*

**D8. La regla escrita del Lead, en los tres sitios que la spec nombra.** En `plugins/aether/skills/using-aether/SKILL.md`: la ruta «delegate task», la tabla de modelos de un delegado y «The execution method» dicen que, con la superdelegación encendida, el trabajo que edita sale primero por `aether-lane delegate` lanzado con Bash en segundo plano, que el Lead no espera, que decide la fusión con el veredicto de la revisión y las pruebas del resultado (y lee el diff él solo en los casos de R10 y R11), que fusiona con `aether-wt merge` comprobando la rama y el permiso, que tras fusionar corre las pruebas una vez en su rama cuando la tarea las trae, que Claude nativo queda solo para los casos de R3 y entonces el brief lleva la línea `AETHER-TASK: <id>`, que una salida `{ error }` del comando (de uso o de infraestructura, según D1, como un HEAD desprendido o una tabla de lanes que falta) no es un `no-candidate`: el Lead corrige la causa cuando es suya y lo lanza otra vez, y si no puede ahora, corre la tarea en nativo sin detener el trabajo (C4) y lo dice; y que el Lead mismo sigue en Claude. El texto exacto lo fija `tasks.md`; tiene que caber en el tope de 29 470 bytes del bootstrap (hoy 25 460). *Serves: R6, R12, R14; C3, C4, C5, C6.*

**D9. La documentación de usuario dice lo mismo y deja de decir lo contrario.** `docs/guide/lanes.md` (la regla de la superdelegación) gana el delegado que edita; `docs/guide/options.md` corrige su frase «a task that edits files stays on Claude»; `docs/guide/router.md` gana la captura y la medida con sus dos vías fuera; `docs/reference/components.md` nombra el comando en la fila de `aether-lane`. Sin página nueva, para no tocar la lista de `docs/index.md`. *Serves: R15; C6.*

**D10. El orden deja el árbol verde en cada fusión.** Ola 1, independiente: el `reviewer` con tarea (Task 1), la captura del router (Task 2), la regla del Lead (Task 5) y los documentos (Task 6) —estos dos últimos solo nombran el comando, cuya forma D1 ya fija—. Ola 2: el comando (Task 3, sobre Task 1) y la medida (Task 4, sobre Task 2 solamente: la forma de la entrada `delegate` del registro ya está fijada en las Global Constraints de `tasks.md` y su test la escribe con `lanes.appendLog`, así que la medida no espera al comando). Ola 3: las pruebas de escenario E1 a E8 por el camino real (Task 7). La corrida real de R17 no es una tarea del swarm: la hace el Lead después, como dice Verification.

## Files

| Archivo | Qué y por qué |
|---|---|
| `plugins/aether/lib/lane-delegate.js` (nuevo) | El comando entero: corrida de una unidad, bucle de elección/cupo/reintento, pruebas en el worktree, revisión, resultado (D1 a D5). |
| `plugins/aether/bin/aether-lane` | Despacha el verbo `delegate` y su línea de uso. |
| `plugins/aether/lib/lane-calls.js` | El `reviewer` con `--task` sobre la unidad; sin tarea, como hoy (D4). |
| `plugins/aether/lib/route.js` | `aetherTaskOf` y los campos `aetherTask` y `taskClass` de la entrada del diario (D6). |
| `plugins/aether/lib/router-report.js` | La medida de R18 y el texto de las vías fuera (D7). |
| `plugins/aether/skills/using-aether/SKILL.md` | La regla del Lead en los tres sitios (D8). |
| `docs/guide/lanes.md`, `docs/guide/options.md`, `docs/guide/router.md`, `docs/reference/components.md` | Lo mismo para el usuario, y quitar lo que hoy dice lo contrario (D9). |
| `tests/lane-reviewer-unit.test.js`, `tests/router-aether-task.test.js`, `tests/lane-delegate.test.js`, `tests/lane-delegate-scenarios.test.js`, `tests/delegate-docs.test.js` (nuevos); `tests/router-report.test.js`, `tests/bootstrap-names.test.js` | Las pruebas de cada tarea; las de escenario cubren E1 a E8 y la medida por el camino real (R16), y las de documentos fijan lo que las páginas de usuario dicen del delegado (R15). |

No se toca: `lib/superdelegation.js` ni `config/pairs.json` (la regla y sus tablas, fuera de alcance), `workflows/run.workflow.js` (el enjambre espera con el cupo lleno como hoy; esta spec invierte eso solo en el comando nuevo), el mod (`hooks/`), `lib/delegate-limits.js` ni el camino de los delegados de solo lectura del router.

## Verification

- **Comando de prueba:** `npm test`.
- **Qué prueba cada criterio:**

| Criterio | Prueba |
|---|---|
| C1 | `tests/lane-delegate.test.js` (sale a un par externo, grande o pequeña la tarea; `no-pair`, `dry` y `cupo`, este también cuando lo ocupan llamadas de lane vivas de otra corrida, y dos delegados comparten un harness de `maxParallel` 2 sin que la llamada del que ya tiene hueco se cuente otra vez; apagado no sale nada), `tests/lane-delegate-scenarios.test.js` (E1, E4, E6, E7) |
| C2 | `tests/lane-delegate.test.js` (checkout intacto, rama y worktree de unidad, resumen/rama/pruebas; entorno sin credenciales), escenarios E1 y E8; la fusión con `aether-wt merge` en la corrida real |
| C3 | `tests/lane-delegate.test.js` (con la espera inyectada, `maxSeconds` es `harness.timeouts[role] + 180` para el que escribe y para el revisor; el `timeoutSeconds` de la llamada es el de la tabla, 2700; el módulo no requiere `delegate-limits`; y un CLI simulado que duerme más que el tope escalado termina con su resultado); el segundo plano, el texto de la regla y la corrida real |
| C4 | `tests/lane-delegate.test.js` (cada causa: cuota, modelo, error, tiempo; nunca el mismo par; el parche por intento), escenario E3 |
| C5 | `tests/lane-reviewer-unit.test.js`, `tests/lane-delegate.test.js` (revisión siempre que hay par distinto, con su par derivado; revisor que falla pasa al siguiente; `none` y `no-verdict`; tarea sin pruebas con y sin revisor), escenario E5 |
| C6 | `tests/bootstrap-names.test.js` y el tope de `tests/bootstrap-design.test.js`; `tests/delegate-docs.test.js` y `tests/docs-facts.test.js`; `tests/router-aether-task.test.js`, `tests/router-report.test.js` (también el `ranOn: null` de `record`/`advise`) y la medida por el camino real en escenarios (lista solo el que edita en Claude sin `no-candidate`; fuera el agente `aether:*` y el `ROUTER-OVERRIDE:`) |
| C7 | `npm test` verde, y la corrida real de abajo |

- **La corrida real (R17), del Lead, con el permiso `paid-call`.** No es una tarea del swarm. Con todo fusionado y `npm test` verde, el Lead registra el permiso con las palabras del dueño, lo comprueba y lanza un delegado real corto en segundo plano, con los bins del árbol por ruta:

  ```
  node plugins/aether/bin/aether-autonomy grant --class paid-call --quote "autorizo gasto no hay problema"
  node plugins/aether/bin/aether-autonomy check paid-call
  node plugins/aether/bin/aether-lane delegate --brief <un encargo real corto en un archivo> --model sonnet --effort high --owns <una ruta acotada> --tests "npm test" --session "$CLAUDE_CODE_SESSION_ID"
  ```

  El brief de la corrida dice la tarea, el par, el motivo y la rama que el comando devolvió. La fusión de esa rama, si se hace, es la de las acciones irreversibles de la spec: comprobar la rama, y si es `main` o `master`, el permiso `merge-main` antes de `aether-wt merge`.

## Assumptions

- **El nombre y la interfaz del comando** (la spec deja el nombre al plan): `aether-lane delegate`, encargo en un archivo `--brief` y el resto en flags, rol fijo `implementer`, estados `done | no-candidate | off` siempre con código 0. Reversible: es solo un nombre y una forma.
- **El id de un «sin candidato» es el id de la corrida** que el comando creó. Una invocación con la superdelegación apagada no crea corrida ni registro, así que nunca puede contar como «sin candidato» (R20). Reversible.
- **Qué cuenta como intento fallido:** un `unavailable` de `start`, un resultado de lane que no es `ok` y un implementador `NEEDS_CONTEXT` o `BLOCKED`. Unas pruebas que fallan detrás de un implementador `ok` no reintentan en otro par: la rama vuelve con ese resultado y decide el Lead, como R5 y R12 ya reparten. Reversible.
- **El revisor excluye pares, no familias.** R10 excluye «el par que escribió» y los revisores probados; no se pasa el autor a `choose`, así que el mismo modelo en otro harness podría revisar. Es la lectura literal de la spec; endurecerla es una línea en el bucle.
- **El cupo se cuenta contra las llamadas vivas del harness al reservar.** Un delegado no arranca sobre un harness cuyas llamadas de lane ya en vuelo, más los huecos `delegate` en pie, llegan a `maxParallel` (D3), sin contar dos veces la llamada de una corrida cuyo hueco en pie ya la cuenta (su archivo `run`). El conteo de vivas vale para el repositorio desde el que se lanza, que es donde viven las carpetas de llamada; lo que el conteo no cierra queda en Risks, no escondido aquí. Reversible el día que el workflow y los demás caminos lean los mismos huecos.
- **La Task 3 queda como una sola unidad.** Los huecos, el conteo de vivas y el despacho del bin no se parten en tareas propias: ninguno tiene otro consumidor que este comando, partirlos crearía un módulo que ningún requisito pide (o dos tareas en serie sobre el mismo archivo), y el despacho solo no llena una fusión, que corre `npm test` entero. La tarea va en `opus high` con revisión `xhigh` por ese tamaño. Reversible: partirla es mecánica, sin cambio de interfaz, si el Lead lo prefiere.
- **Sin línea de base y con `testCommand: 'true'` cuando la tarea no trae pruebas**, para que `aether-wt merge` no corra nada ni bloquee la fusión de una tarea sin pruebas (R11 la acepta con el veredicto). La rama de integración del grafo es en la que está el Lead al lanzar, como dice el supuesto de fusión de la spec. Reversible.
- **Las pruebas en el worktree tienen 15 minutos de tope**, el mismo que `merge` y `aether-report` usan. Un comando de pruebas más largo vuelve `timedOut: true` en el resultado, con la rama intacta.
- **La medida se presenta en `aether-report --delegates`**, el informe que ya une el diario del router por sesión, y no también en el informe de corrida: un delegado suelto no pertenece a ninguna corrida del enjambre. C6 pide el informe (`aether-report`), no una de sus formas.
- **R17 no tiene tarea que la sirva**: es una acción del Lead con un permiso, no trabajo del swarm; `aether-plan check` lo dirá como aviso, y queda dicho aquí.

## Risks

- **El dueño puede estar en `main` al delegar.** El comando no fusiona, así que el riesgo es solo de la fusión posterior; la regla (Task 5) manda comprobar la rama y el permiso antes, y el resultado nombra la rama de integración con la que se creó la corrida.
- **Dos `delegate` a la vez sobre la misma rama de integración.** Cada uno tiene su corrida y su worktree de unidad, y las fusiones siguen siendo de a una (el candado de `merge` es por corrida, pero el Lead fusiona en serie por la regla). Un checkout con cambios sin comitear no contamina la unidad, que nace del HEAD.
- **Un hueco de cupo huérfano** si un proceso `delegate` muere sin su `finally`: el pid muerto se reclama en la siguiente reserva, así que el daño es como mucho un hueco ocupado hasta el próximo delegado de ese harness.
- **La carrera inversa del cupo y los caminos sin carpeta de llamada.** El conteo de D3 es al reservar: una llamada del enjambre que arranque después no lee los huecos `delegate`, porque cuenta las suyas en memoria (su runtime), y puede completar el harness por encima junto al delegado ya reservado; cerrarla pide tocar el workflow, que la spec deja fuera («el enjambre, que ya usa la regla»). Los asientos de diseño y los delegados de solo lectura del router tampoco dejan guardado su harness en una carpeta de llamada mientras duran, así que `liveLaneCalls` no los ve. Si el dueño quiere que también esos cuenten al reservar, hace falta que esa lectura quede en la spec y que esos caminos registren su harness en vuelo, y este plan no los toca: la pregunta va al Lead.
- **El worktree de unidad dentro del checkout del dueño** (`.aether/worktrees/`), el aviso que `aether-plan compile` ya da: un comando de pruebas que rastree todo el árbol puede correr también las pruebas del worktree. Es el comportamiento de hoy para el enjambre; esta obra no lo cambia.
- **La revisión consume cuota dos veces** cuando el revisor va probando candidatos. Es lo que R10 pide (nunca dejar al Lead sin veredicto habiendo pares), y cada intento queda en `review.tried`.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| El comando escribe un `graph.json` de una unidad y su brief, igual que un plan compilado (D2) | R1, R4, R5: `aether-wt ensure`/`merge`, la comprobación de Owns y el paquete leen ese grafo, y la spec pide un encargo suelto sin plan | Generar un `tasks.md` temporal y compilarlo de verdad: grabaría la línea de base corriendo las pruebas en el checkout del dueño, rechazaría la rama `main` sin un flag y dejaría un plan falso en el árbol |
| Huecos atómicos de cupo en el directorio de datos, reclamados por pid muerto y con el id de la corrida dueña dentro, y el conteo de las llamadas de lane ya vivas de ese harness al reservar, saltando las que un hueco en pie ya cuenta (D3) | R13, R3: el delegado corre fuera de una corrida, en procesos Bash separados que no comparten memoria, y cuenta contra el mismo `maxParallel` que el enjambre ya puede tener lleno | Huecos solos, contando solo entre procesos `delegate`: un delegado arrancaría sobre un harness que el enjambre ya tiene en su `maxParallel`. El conteo solo, sin huecos: entre la lectura de las carpetas de llamada y el arranque no hay reserva, y dos delegados a la vez pasarían el cupo. Los dos conteos sin unirlos por el id de la corrida: la llamada de un delegado contaría por su hueco y otra vez como viva, y dos delegados nunca compartirían un harness de `maxParallel` 2 |
| Un `reviewer` con `--task` en `lib/lane-calls.js` que revisa la copia de la unidad (D4) | R10: la revisión es con el rol `reviewer` (su timeout, su esquema) sobre el diff de la unidad antes de fusionar | Reusar el rol `supervisor` para ejecutarla y pedir el par como `reviewer`: la llamada correría con el timeout, el agente y el esquema del supervisor, contra lo que R10 y R1 fijan, y el `reviewer` de hoy no sirve porque lee el paquete de lo ya fusionado |
| Una entrada `kind: 'delegate'` en el registro de lanes y dos campos (`aetherTask`, `taskClass`) en la entrada del diario del router (D3, D6, D7) | R9, R18, R19: la medida une el id con el «sin candidato» y la clase con la llamada, buscados en el brief entero | Releer el extracto de 400 caracteres del diario o deducir la clase de `decision.readOnly` al informar: la spec lo descarta (la línea puede ir más allá del extracto) y las entradas sin decisión quedarían clasificadas por adivinación |
