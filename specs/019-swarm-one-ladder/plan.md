# Plan: una sola escalera para los delegados y el swarm, todo arrancando en Haiku

- **Spec:** [spec.md](spec.md) (criterios C1 a C9, requisitos R1 a R21). El diseño corto aprobado es [design.md](design.md); este plan dice cómo se construye y no repite lo que esos dos ya dicen.
- **Intent:** [intent.md](intent.md) (issue #102).

## Technical context

- **Pila.** Node.js 22, CommonJS, sin dependencias. El plugin es `plugins/aether/`; las pruebas son `tests/*.test.js` con `node:test`, y las del mod son `plugins/aether/hooks/*.test.ts` (`npm run test:mod`).
- **Lo que se reutiliza sin tocar.** `plugins/aether/lib/ladder.js` (`loadLadder`, `judge`, `effortFor`) y `plugins/aether/config/ladder.json` (R17). `lib/delegate-checks.js` (`changedFiles`, `runTests`, `checkEdits`) para la puerta. `lib/baseline.js` (`judge`, `failureSignatures`) y el `baseline.json` que `aether-plan compile` ya escribe en la carpeta de la ejecución. `lib/lanes.js` `digest` para la huella del archivo de carga.
- **Las piezas que cambian.**
  - `workflows/run.workflow.js` deja de tener política propia y llama a dos verbos nuevos de `aether-wt` a través del agente `ops` (que el mod responde sin modelo).
  - `lib/wt-ladder.js` y `lib/wt-gate.js` (nuevos) son esos dos verbos; `bin/aether-wt` solo los despacha.
  - `hooks/ops-command.mjs` admite sus formas exactas.
  - `lib/plan.js` y `lib/plan-compile.js` dejan de pedir y de emitir `Tier`, `effort` y `ladder`.
  - `lib/report.js` cuenta lo que el script informa.
  - Las habilidades, los agentes y la documentación dicen la regla nueva.
- **El contrato entre el script y los verbos** (lo comparten las tareas 1, 3, 5, 6 y 9; se fija aquí para que puedan avanzar sin esperarse):
  - `aether-wt ladder <run> <task>` imprime la vista `{ task, status, step, model, effort, kind, cause, attempts, correctionsUsed, corrections }`. Crea el estado en el primer peldaño si no existe.
  - `aether-wt ladder <run> <task> --verdict approve|fix|infeasible --payload <ruta> --digest <huella>` aplica `judge` y imprime `{ accepted: true, ...vista }`, o `{ accepted: false, rejection }` sin guardar nada.
  - `aether-wt gate <run> <task>` imprime `{ pass, checks, findings: [{ file, what }], detail, tests, knownFailures, timedOut, files }`.
  - `result.units[].ladder` es `{ steps, firstTry, corrections, rises: { exhausted, repeated, infeasible }, gateRejections, filled }`.
- **Qué hay en `.specify/memory/`:** no hay constitución; el Gate se limita a las dos comprobaciones del método.

## Gate

| Comprobación | Resultado |
| --- | --- |
| Constitución del proyecto (`.specify/memory/constitution.md`) | No existe: no hay principios que comprobar. Pasa. |
| Nothing speculative, and nothing for a hypothetical need. | Pasa. Cada pieza sirve a un requisito de la spec. Quedan fuera, por la spec, el comando de pruebas por tarea, la anulación de arranque por tarea y la revisión final en Sonnet. |
| No abstraction, option, file or dependency that no requirement asks for. | Pasa con cuatro violaciones que se justifican en `## Complexity`: dos archivos nuevos de `lib/` con su fila de familia, el archivo de carga del veredicto, el parámetro `tailChars` de `runTests` y la exportación de `readBaseline`. Ninguna es una opción nueva para el dueño. |

## Design

**D1. El primer peldaño no se elige, se lee.** Al empezar una unidad (y en un relanzamiento) el script pide `aether-wt ladder <run> <task>` y arranca con el modelo y el esfuerzo que devuelve. No hay `Tier` ni `effort` en lo que lee del plan, así que un plan antiguo que pida Sonnet u Opus arranca igual en Haiku `high`. *Serves: C1; R1.*

**D2. Una sola política: `lib/ladder.js`, a través de `lib/wt-ladder.js`.**
- `ladderCommand(cwd, runId, taskId, { verdict, payload, digest, ladder })` guarda `{ state, next }` en `<runDir>/ladder/<task>.json`, donde `state` es el de `lib/ladder.js` y `next` es el último `next` de `judge` (o el primer peldaño). Guardar `next` es lo que permite a un relanzamiento seguir en el peldaño y con el esfuerzo (primero o de corrección) en que quedó la unidad.
- Un veredicto que `judge` no acepta devuelve `{ accepted: false, rejection }` y no cambia el archivo.
- El parámetro `ladder` (ya cargado) existe por la misma razón que `deps.ladder` en `lib/delegate-task.js`: una prueba cambia un número sin tocar `config/ladder.json`. El arnés de pruebas del script lo pasa a `ladderCommand` (`runWorkflow(args, { ladder })`), así una misma escalera modificada llega al swarm y a los delegados en una sola prueba (`tests/ladder-one-source.test.js`).
- El script pierde `nextTier`, `effortFor`, `ladderOutlook`, los contadores `used`, la línea `Ladder:` y la regla de las tres repeticiones.

*Serves: C2; R2, R3, R6, R17.*

**D3. El veredicto del supervisor se traduce, y los resultados sin veredicto también.** En el script, una sola función `applyVerdict(unit, task, kind, body)` escribe el archivo de carga, lo envía con `ladder --verdict` y devuelve el siguiente paso o el bloqueo:

| Lo que ocurre | Veredicto a la escalera |
| --- | --- |
| `approve` | `approve` |
| `retry` con hallazgos | `fix` con esos hallazgos (`file` sin la `:línea`, `what` = título y evidencia) |
| `retry` sin hallazgos o con alguno sin archivo | `fix` con la primera entrada de `Owns` y el `ruling`; suma `ladder.filled` |
| `escalate` con `ruling` | `infeasible` con el `ruling` como razón |
| `escalate` sin `ruling` | la escalera lo rechaza: fallo del supervisor |
| `block` | termina la unidad, fuera de la escalera |
| implementador que falla o se abandona (`null`, o un lane que falla) | `fix` con `<Owns[0]>: el intento no terminó (<causa>)` |
| lane o merge que toca fuera de `Owns` | `fix` con `<ruta>: fuera de Owns` |
| merge `empty` | `fix` con `<Owns[0]>: el intento no cambió ningún archivo` |
| fallo del agente supervisor | se vuelve a llamar al supervisor, hasta dos veces; luego bloquea con esa causa |
| `accepted: false` | igual que un fallo del supervisor |
| `kind: exhausted` | bloquea con la causa que la escalera da |
| conflicto o pruebas en el merge | un reintento fuera de la escalera (sin cambio) |
| par que falla al arrancar | se reemplaza sin gastar corrección (sin cambio) |

- Cada fila o gasta una corrección o tiene su tope: nada puede repetirse sin fin.
- Un implementador que no entrega informe dos veces seguidas deja de bloquear la unidad por «demasiado grande»: los dos hallazgos sintéticos son iguales y la regla de repetición de la escalera la sube de modelo. `unit.failures` se queda solo para que el reintento parta el trabajo (issue 14) y para el aviso del prompt.

*Serves: C4; R4, R5, R6, R7.*

**D4. La puerta: `lib/wt-gate.js`, un verbo que corre en el worktree de la unidad.**
1. Compara los archivos cambiados con `Owns` (`changedFiles` contra `unitBase`, y `checkEdits`). Si falla, devuelve los hallazgos y **no corre las pruebas**: una prueba que se corre sobre archivos ajenos no dice nada útil.
2. Corre `graph.testCommand` con `runTests`, con un tope de 570 s, menor que el de 600 s del mod, para que el verbo diga él mismo el corte y no lo corte el mod.
3. `judge` de `lib/baseline.js` con el `baseline.json` de la ejecución: un fallo de la línea base no falla la puerta.
4. Hallazgos como objetos `{ file, what }`. Para las pruebas, si el nombre que falla parece una ruta, `{ file: <nombre>, what: 'la prueba falló' }`; si es otro nombre (un subtest de `node:test`), `{ file: <la primera firma con forma de ruta de la misma salida, o 'npm test'>, what: 'falló: <nombre>' }`; si no se puede leer ningún nombre, `{ file: 'npm test', what: 'salió con N' }` y el final de la salida en `detail`. Un corte es `{ file: 'npm test', what: 'superó el tiempo límite' }`. `detail` no entra en `what`, para que la repetición de hallazgos de la escalera compare textos estables.

En el script, la puerta corre después de cada intento (también uno rescatado sin informe y un reintento de merge), con `long: true`. Si falla, es un `fix` con esos hallazgos y no se llama al supervisor. Si pasa, el prompt del supervisor lleva `Checks: pass` y el resumen de las pruebas. Si el propio comando de la puerta falla (error del ops), el supervisor sigue y su prompt dice `Checks: not run (<causa>)`.

*Serves: C3; R8, R9, R10, R11, R12.*

**D5. El veredicto viaja como datos.** Los hallazgos y la razón son texto libre y la línea del mod solo admite fichas `[A-Za-z0-9._:=@/,-]+`. El script escribe `<runDir>/ladder/<task>-verdict.json` con el mecanismo de carga que ya existe (marcador `=== aether-lane payload: <ruta> ===` y `register.js`), y la línea lleva `--verdict`, `--payload <ruta>` y `--digest` (`lib/lanes.js` `digest` del texto). El verbo recalcula la ruta esperada, comprueba la huella y recién entonces lee. `hooks/ops-command.mjs` suma una alternativa a `PAYLOAD_PATH`, tres formas exactas (`ladder` de lectura, `ladder` con veredicto, `gate`) y comprueba que la ruta de la línea y la del marcador sean la derivada de la ejecución y la tarea. *Serves: C3, C4; R13.*

**D6. El plan deja de elegir.** `lib/plan.js` lee y descarta `Tier:` (en la tarea) y `Ladder:` (en la ejecución) con una advertencia; ya no exige `Tier`. `lib/plan-compile.js` no emite `tier`, `tierReason`, `effort` ni `ladder`; la ficha (`brief`) pierde su línea `- Tier:`. Se conservan `Review`, `Max agents` y `Test command`. La salida de `compile` y la del script son compatibles en los dos sentidos durante la transición: el script no lee esos campos y el compilador viejo los sigue emitiendo. *Serves: C5; R14.*

**D7. La revisión final cambia de señal.** `reviewPlan` lee solo `review`: Opus `xhigh` si alguna unidad unida tiene `Review: xhigh` o `max`; Sonnet `high` en una ejecución de hasta tres unidades que piden todas `Review: high`; Opus `high` en el resto y en un relanzamiento. *Serves: C5; R15.*

**D8. El informe.** El script entrega `units[].ladder` (arriba); `lib/report.js` lo suma entre lanzamientos en `quality.ladder` (`null` si ninguna unidad lo trae, que es el caso de un `result.json` anterior). `finalize` ya guarda `report` entero en `runs.jsonl`, así que las cuentas quedan ahí sin otro cambio y sobreviven al borrado de la carpeta de la ejecución; una línea anterior al cambio no las trae y sigue leyéndose. No se tocan `quality.climbed`, `quality.escalated` ni `radar`. *Serves: C7; R18.*

**D9. Las habilidades y los agentes.** `aether:tasks` y su gemela de Spec Kit, y el agente `writer`, dejan de pedir `Tier` y `Ladder`, y piden `Review` donde un error llegaría a datos, seguridad o concurrencia. El agente `supervisor` exige archivo y qué falta en cada hallazgo de un `retry`, sabe que recibe la evidencia de la puerta y que la escalera sube el modelo. *Serves: C5, C3, C4; R5, R11, R16.*

**D10. Documentación y cierre.** Las guías, `components.md` (con la fila de la familia nueva `wt`), las habilidades `swarm` y `using-aether`, el historial de cambios y la decisión A97 dicen la regla nueva; las pruebas de documentación que fijaban la anterior se actualizan. El issue #102 lo cierra el Lead con la entrega. *Serves: C8; R19.*

**D11. La repetición en vivo no es una tarea del swarm.** Gasta cuota de Claude del dueño (`paid-call`) y necesita su concesión; la hace el Lead cuando las tareas 1 a 9 están unidas. Ver `## Verification`. *Serves: C9; R21.*

## Files

| Archivo | Qué cambia y por qué |
| --- | --- |
| `plugins/aether/lib/wt-ladder.js` (nuevo) | El verbo `ladder` (D2, D5). Familia `wt`. |
| `plugins/aether/lib/wt-gate.js` (nuevo) | El verbo `gate` (D4). Familia `wt`. |
| `plugins/aether/bin/aether-wt` | Despacha `ladder` y `gate`; sigue delgado (`tests/bins-thin.test.js`). |
| `plugins/aether/lib/worktrees.js` | Exporta `readBaseline`, que ya existe; la puerta lo necesita y copiarlo duplicaría un ayudante (`tests/guards.test.js`, R15). |
| `plugins/aether/lib/delegate-checks.js` | `runTests` acepta `tailChars` opcional (por defecto 4000): la puerta necesita la salida completa para que `judge` lea los nombres de los fallos. |
| `plugins/aether/hooks/ops-command.mjs` | Las formas de D5. |
| `plugins/aether/workflows/run.workflow.js` | D1, D2, D3, D4, D7, D8 (el bloque `ladder` de cada unidad). |
| `plugins/aether/lib/plan.js`, `lib/plan-compile.js` | D6. |
| `plugins/aether/lib/report.js` | D8. |
| `plugins/aether/agents/writer.md`, `agents/supervisor.md`, `skills/tasks/SKILL.md`, `speckit/commands/speckit.tasks.md` | D9. |
| `plugins/aether/skills/swarm/SKILL.md`, `skills/using-aether/SKILL.md`, `docs/guide/models-by-role.md`, `docs/guide/delegates.md`, `docs/guide/ops.md`, `docs/reference/components.md`, `docs/changelog.md`, `docs/decisions.md`, `CLAUDE.md` | D10. `CLAUDE.md` dice que el swarm toma modelo y esfuerzo del `Tier` del plan; esa frase pasaría a ser falsa. |
| `tests/` | Nuevas: `wt-ladder`, `wt-gate`, `ops-command-ladder`, `report-ladder`, `swarm-ladder-agents`, `ladder-one-source`, `workflow-ladder`, `workflow-gate`, `swarm-ladder-docs`, y `hooks/ops-ladder.test.ts`. Cambian las que fijaban la regla anterior: los siete archivos `workflow*`, `workflow-harness.js`, `plan`, `aether-plan`, `plan-fixtures`, `copies-ladder`, `copies-ladder-prose` (se borra), `speckit`, `models-by-role-docs`, `effort-policy-docs`. |

No se tocan `lib/ladder.js` ni `config/ladder.json`, el enrutador de pares y los lanes, el modelo ni el esfuerzo del supervisor, las fusiones de a una ni el presupuesto de agentes (R17).

## Verification

- **Comando de pruebas:** `npm test`. Para el mod: `npm run test:mod` (la tarea 2 lo corre; si `claude` no está en la máquina del implementador, lo dice en su informe y la prueba de forma exacta de `tests/ops-command-ladder.test.js` la cubre en Node).

| Criterio | Qué lo prueba |
| --- | --- |
| C1 | `tests/workflow-ladder.test.js`: planes con `Tier: sonnet` y `Tier: opus` arrancan en `haiku high`. Repetición en vivo (C9). |
| C2 | `tests/workflow-ladder.test.js`: búsqueda en el script sin `nextTier`, `effortFor`, `ladderOutlook`, `used` ni la regla de las tres repeticiones. `tests/wt-ladder.test.js`: un número cambiado en la escalera cargada cambia el veredicto; el estado sobrevive a un nuevo proceso. `tests/ladder-one-source.test.js`: una misma escalera de prueba con un número cambiado hace que el swarm (por el arnés) y los delegados (`deps.ladder`) cambien de conducta a la vez. `tests/workflow-ladder.test.js`: un relanzamiento, también con `--only`, sigue en su peldaño. |
| C3 | `tests/wt-gate.test.js` (cambio ajeno, prueba que falla con ruta y con un nombre que no lo es, línea base, éxito, corte) y `tests/workflow-gate.test.js` (una puerta que falla no llama al supervisor y gasta una corrección; una que pasa le da la evidencia). |
| C4 | `tests/workflow-ladder.test.js`: un `retry` sube esfuerzo y no modelo; los mismos hallazgos dos veces suben; un `retry` sin archivo se completa y se cuenta; un `escalate` sin razón es fallo del supervisor; cada resultado sin veredicto tiene su prueba y su tope. |
| C5 | `tests/plan.test.js` y `tests/aether-plan.test.js` (advertencia, sin `tier`, `effort` ni `ladder`); `tests/workflow-ladder.test.js` (`Review` fija la revisión final); `tests/speckit.test.js` y `tests/swarm-ladder-agents.test.js` (las habilidades). |
| C6 | Las pruebas existentes de fusiones, presupuesto, lanes y delegados pasan sin cambiar de sentido; `git diff main -- plugins/aether/lib/ladder.js plugins/aether/config/ladder.json` vacío. |
| C7 | `tests/report-ladder.test.js`: las cuentas, un `result.json` sin `ladder` sigue leyéndose, y la línea de `runs.jsonl` lleva `report.quality.ladder` sin romper una línea anterior. |
| C8 | `tests/swarm-ladder-docs.test.js` y las pruebas de documentación existentes. `gh issue view 102` lo comprueba el Lead al cerrar. |
| C9 | Repetición en vivo, hecha por el Lead (abajo). |

**La repetición en vivo (C9, R21), con la concesión del dueño.** Cuando las tareas 1 a 9 estén unidas:
1. El Lead registra la concesión `paid-call` en una llamada propia y, en otra, abre `scripts/aether-lead --plugin-dir <worktree>/plugins/aether` con `superdelegation` apagado.
2. Desde una copia del commit `08f2b1e` (`.worktrees/exp-snake/base`), compila con el `aether-plan` de la rama (`node <worktree>/plugins/aether/bin/aether-plan compile .worktrees/exp-snake/evidence/tasks.haiku.md`) y lanza `/aether:run` con ese JSON. El plan lleva líneas `Tier`: se ignoran con una advertencia, que es lo que el escenario 1 pide ver.
3. Corre `SNAKE_ROOT=<árbol> node --test .worktrees/exp-snake/evidence/acceptance/*.test.js` y `aether-report --run <id>`.
4. Informa las 17 pruebas, el costo de Claude y los minutos, contra US$ 3.24 y 12 minutos, y contra las dos ejecuciones del experimento (US$ 3.60 y 7.6 minutos; US$ 2.96 y 10.2 minutos). Los techos están fijados en la spec y no se mueven.

## Assumptions

1. **Un fallo del comando de la puerta (error del agente `ops`) no detiene al supervisor.** El supervisor recibe `Checks: not run (<causa>)` y el merge corre las pruebas igual. Reversible: tratarlo como fallo de la puerta es un cambio de una rama en `run.workflow.js`.
2. **La puerta no corre las pruebas si el control de archivos ya falló.** Ahorra el costo de una corrida inútil; los dos hallazgos llegarían juntos solo en una segunda vuelta.
3. **Una puerta o un merge que ve «ningún archivo cambiado» es un `fix`** con `<Owns[0]>: el intento no cambió ningún archivo`. La spec no nombra este caso, pero la escalera ya no tiene el contador que lo absorbía.
4. **Los textos de los hallazgos sintéticos y la advertencia del compilador están en español,** como los da el diseño (`fuera de Owns`, `el intento no terminó (<causa>)`, `npm test: superó el tiempo límite`, `ignorado: el swarm arranca todas las tareas en Haiku y usa la escalera de los delegados`). El resto de los mensajes del script sigue en inglés; se unifican en otra decisión.
5. **El archivo de estado de la escalera es `<runDir>/ladder/<task>.json`** y el de carga `<runDir>/ladder/<task>-verdict.json`. No hay forma de reiniciar una escalera salvo borrar la carpeta de la ejecución (riesgo 4 del diseño).
6. **`firstTry` se calcula al unirse la unidad:** unida, sin intentos previos en la escalera (`attempts` del estado al empezar el lanzamiento es 0), sin correcciones, sin subidas y sin rechazos de la puerta.
7. **Las líneas `Tier` y `Ladder` siguen en este `tasks.md`** porque el compilador instalado las exige; la rama nueva las ignora. Todas las tareas dicen `haiku high`, por la orden del dueño («Que todo arranque en haiku»), y el riesgo de las tareas 2 y 5 se marca con `Review: xhigh`.
8. **Todos los supuestos de la spec (1 a 10) se heredan** sin cambios.

## Risks

1. **`run.workflow.js` es el archivo más grande del plugin y lo tocan dos tareas seguidas (la 5 y la 6).** Se ordenan en cadena con dependencias reales y cada una deja `npm test` en verde: la tarea 5 reemplaza la política, la 6 agrega la puerta. El `check` no lo trata como cadena porque las demás tareas corren en paralelo.
2. **Muchas pruebas existentes fijan la regla anterior** (siete archivos `workflow*`, `plan`, `copies-ladder*`, pruebas de documentación). Cada tarea es dueña de las que rompe y debe dejarlas en el sentido nuevo, sin borrar cobertura que sigue valiendo: la regla de «tres veces» pasa a ser «dos veces», y así.
3. **La puerta duplica el tiempo de pruebas por intento** (riesgo 1 del diseño). Se acepta; el informe lo mide.
4. **El mod admite tres formas nuevas.** El riesgo es una forma floja que deje pasar una línea de shell. Por eso la tarea 2 lleva revisión `xhigh` (su implementador arranca en Haiku, como toda tarea), y sus pruebas incluyen líneas malformadas, la ruta de otra ejecución y un marcador que no coincide con `--payload`.
5. **`aether-plan` instalado y el de la rama difieren durante la construcción.** Las tareas usan el de la rama por ruta (`node plugins/aether/bin/aether-plan …`), como dice `CLAUDE.md`.
6. **El tope de 570 s de la puerta contra 600 s del mod** deja 30 s de margen para el arranque y la salida. Un proyecto con pruebas más largas fallará la puerta siempre con «superó el tiempo límite» y gastará las correcciones; el informe lo muestra y el siguiente paso sería un comando de pruebas por tarea (fuera de alcance).
7. **La repetición en vivo puede no pasar los techos.** La spec dice que el costo y el tiempo se miden e informan y los decide el dueño; solo las 17 pruebas son la puerta de lanzamiento.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Dos archivos nuevos de `lib/` (`wt-ladder.js`, `wt-gate.js`) y la fila de la familia `wt` en `components.md` | R2 y R8: son los dos verbos que el script y el mod necesitan; `tests/guards.test.js` (R16) exige que un prefijo con guion sea una familia declarada y que no haya exportaciones sin uso, así que la fila y el despacho van en la misma entrega que los archivos. | Añadirlos a `worktrees.js` (1 250 líneas) lo agranda con una política que no es suya y mezcla dos verbos sin relación con las unidades. Un archivo único sin guion pediría la misma declaración como módulo suelto. |
| Archivo de carga del veredicto con ruta derivada y huella (`<runDir>/ladder/<task>-verdict.json`) y la alternativa en `PAYLOAD_PATH` | R13: los hallazgos y la razón son texto libre y la línea del mod no admite espacios ni comillas. | Pasarlos por la línea obligaría a escapar texto libre en una línea que el mod parsea sin modelo: es justo la superficie que R13 manda cerrar. |
| Parámetro opcional `tailChars` en `runTests` (`delegate-checks.js`) | R9: sin la salida completa, `judge` de la línea base no lee los nombres de los fallos y un fallo conocido haría fallar la puerta. | Copiar `runTests` en `wt-gate.js` duplica un ayudante (R15 de `tests/guards.test.js`); subir el recorte fijo de 4 000 caracteres cambiaría lo que ven los delegados (R17). |
| Exportar `readBaseline` desde `worktrees.js` | R9: la puerta lee la misma línea base que el merge. | Releer `baseline.json` en la puerta duplica el ayudante y puede divergir del que usa el merge. |
