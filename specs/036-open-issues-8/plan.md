# Plan 036: issues abiertos, tanda 8

**Spec:** [spec.md](spec.md). Los hallazgos menores ya están clasificados en `evidence/triage-256.md` y `evidence/triage-232-236.md` (base 0.41.0, `6b31c62`); este plan los usa tal cual.

## Technical context

- Node.js 22, CommonJS, sin dependencias. El plugin es `plugins/aether/`; las pruebas, `npm test` (`node --test "tests/*.test.js"`), sin tokens ni red. `npm run check` (pruebas, mod y validación) corre al final.
- Código tocado: `lib/lane-work.js`, `lane-calls.js`, `lane-delegate.js`, `delegate-run.js`, `delegate-task.js` (#255); los dos `workflows/*.workflow.js` (#257 y menores); `scripts/refresh-lanes.js` y `config/pairs.json` (#235); `lib/wt-*.js`, `worktrees.js`, `report.js`, `plan-compile.js`, `autonomy*.js` (menores y #209); `lib/observe-*.js` y `bin/aether-observe` (#224); los módulos del router y de los asientos (#136, #203); `bin/aether-autonomy` y `bin/aether-delegate` (#201); `agents/*.md` y las skills (#215, #201).
- Las pruebas usan repositorios desechables (`tests/helpers.js`) y el arnés de flujos con agentes simulados (`tests/workflow-harness.js`).

## Gate

- Nothing speculative, and nothing for a hypothetical need. Pass: cada tarea sirve a un requisito de la spec; los menores se arreglan solo si la clasificación dice `applies`.
- No abstraction, option, file or dependency that no requirement asks for. Pass con tres archivos nuevos de `lib/` que piden requisitos: `run-timings.js` (R18), `harness-names.js` (R23) y la preparación común de R25; más `bash-parse.js` (#232 2, R12) y `delegate-approve.js` (R29). Ninguno agrega opción ni dependencia.
- Constitución: el proyecto no tiene `.specify/memory/constitution.md`; no hay principios que comprobar.
- Reglas del proyecto: el arranque no crece (C12). Pass si T21 mide cada parte antes y después.

## Design

1. **#257, una sola lectura de la respuesta ops** (Task 1). En `run.workflow.js` y `design.workflow.js` una función `lastJsonObject(text)` recorre las líneas desde la última hacia arriba y devuelve el primer objeto JSON; `opsOnce`, `ops`, `paused` y `tick` la usan. Sin línea JSON queda el mismo error. Serves: C1.
2. **#255, la rama sigue al HEAD desacoplado en `lib/lane-work.js`** (Task 2). Un paso nuevo `reattachDetached(worktree, branch)` corre antes de `checkOwns` y de `finishImplementer`: HEAD desacoplado, por delante y descendiente de la rama avanza la rama a HEAD (`git branch -f`) y deja el worktree en la rama (`git checkout <rama>`), así un HEAD desacoplado con archivos sin commitear termina entero (el commit de `finishImplementer` cae sobre la rama, no sobre HEAD suelto: esto responde al menor (a) del Judge; R8 lo prueba); HEAD que no desciende se rechaza con un motivo que nombra el commit y la rama. `head` que se entrega a `lib/lane-delegate.js`, `delegate-run.js` (`editsText`) y a `finishImplementer` es el commit de la rama. Las dos rutas (delegado y enjambre) llaman al mismo paso. Serves: C2.
3. **#255, el brief del par externo** (Task 3). `externalPrompt` ya no recibe `startSection`; una guarda de regresión lo prueba y una nota al Lead sale de `aether-delegate begin` cuando el prompt trae `checkout --detach`. El prompt del Lead no se reescribe (Proposals de la spec). Serves: C2.
4. **#235, distancia guardada** (Task 4). Las filas estimadas guardan `estimateOf` y `estimateDistance` y su cifra se calcula en el refresco como referencia más distancia; el refresco recorre todas las filas con página y escribe una sola fecha. La escalera sigue sin guardarse. Se actualizan `ownerDecision`, `AGENTS.md`, `docs/guide/lanes.md`, `docs/contributing.md` y `docs/reference/artificial-analysis.md:52` (menor (b) del Judge). Serves: C3.
5. **Duraciones de la corrida** (#209; Tasks 7, 5, 9). Un módulo nuevo `lib/run-timings.js` anota líneas `{class, ms, at}` en `<runDir>/timings.jsonl`; los bins que ya miden el trabajo la llenan por su cuenta (el gate en `wt-gate.js`, la espera de cuota en `lane-command.js pause`, las pruebas de cada fusión y la espera de una unidad trabada en `worktrees.js` y `wt-watch.js`, la línea base en `plan-compile.js`). El workflow no necesita reloj ni cambio: no tiene `Date.now`. `report.js` suma por clase y marca cuánto del reloj no fue ningún modelo; sin `timings.jsonl` el informe es el de hoy. Las clases son `gate`, `merge-tests`, `baseline`, `wait-quota`, `wait-stuck`. Serves: C6.
6. **Menores de #256 por área** (Tasks 5, 6, 7, 8, 9, 10). Vigilancia (`wt-watch`, `worktrees`), estancadas (`wt-stuck`), informe (`report`), documentación de la skill del enjambre, compilación y rescate del flujo, cada una con su prueba. El rescate del flujo depende de la guarda de `stuckEnd` (Task 6). Serves: C4.
7. **Menores de #232 y #236** (Tasks 4, 7, 9, 11, 12, 13, 14). #232 3 se descarta con el motivo de la duda decidida de #236 (`haiku` fijo en `REFUSED_ARGS` no decide un escalón). Serves: C4.
8. **#215** (Task 15): se quitan de los textos de los agentes las peticiones que ningún campo recibe (R14); no se agregan campos al esquema. Una prueba lee `agents/*.md` y los esquemas de `lib/lane-schemas.js` y de los workflows. Serves: C5.
9. **#224** (Task 16): verbo `aether-observe proposals`, solo lectura, y una línea en las notas de arranque (`observe-notice.js`), no en las partes del arranque. Serves: C7.
10. **#136** (Task 17): `lib/harness-names.js` exporta `HARNESS_NAMES` y las cinco listas se leen de ahí. Serves: C8.
11. **#203** (Task 18): una función `lib/pick-data.js` (`pickData`) prepara los datos de `choose`; un solo almacén de marcas, `<dataDir>/lanes/marks/`: las marcas de `router/lanes/marks/` se leen y se migran al primer uso (el almacén lo elige el Writer, supuesto de la spec). Serves: C9.
12. **#201** (Tasks 19, 20, 21): `aether-autonomy quota-brake` y `aether-delegate approve`; las skills nombran los comandos y las partes no crecen. Serves: C10, C12.

Orden: cada archivo compartido tiene un solo dueño por onda. `run.workflow.js`: Task 1 → Task 10. `design.workflow.js`: Task 1 → Task 11. `lane-delegate.js` y `lane-calls.js`: Task 2 → Task 17 → Task 18. `delegate-task.js`: Task 3 → Task 18, Task 20. `autonomy-command.js`: Task 13 → Task 19. `worktrees.js`: Task 5 (después de Task 7, que crea `run-timings.js`). `swarm/SKILL.md` y `autonomous-runs/SKILL.md`: Task 8 → Task 21. Las once tareas de la onda 1 que no comparten nada (1, 2, 3, 4, 7, 8, 12, 13, 14, 15, 16) corren juntas; las urgentes (1 a 4) no dependen de ninguna otra.

## Files

Por tarea, en `tasks.md` (campo `Owns`). Archivos nuevos: `lib/run-timings.js`, `lib/bash-parse.js`, `lib/harness-names.js`, `lib/pick-data.js`, `lib/delegate-approve.js`, y las pruebas nuevas que cada tarea nombra. No se toca `docs/changelog.md` ni la versión (publicar es del dueño).

## Verification

- Comando: `npm test`; al final `npm run check` (R31). Cada tarea corre además sus archivos con `node --test <archivos>`.
- C1: `tests/ops-note.test.js` (nota antes y después; sin JSON). C2: `tests/detached-head.test.js`, `lane-work`, `delegate-run`, `delegate-task`. C3: `refresh-lanes`, `pairs`. C4: una prueba por hallazgo arreglado, en las tareas 4 a 14. C5: `tests/agent-outputs.test.js`. C6: `tests/report-timings.test.js`. C7: `observe-bin`, `observe-notice`. C8: `harness-lists`. C9: `lane-marks`, `router-marks`, `seats`, `pick-data`. C10: `tests/quota-brake-command.test.js`, `tests/delegate-approve.test.js`. C11: ninguna prueba hace llamadas de red ni de pago. C12: `tests/session-start-parts.test.js`, con el tamaño de cada parte contra la base 0.41.0.

## Assumptions

- Las duraciones de #209 se anotan en `timings.jsonl` de la carpeta de la corrida (formato del plan, supuesto de la spec). Reversible.
- Los menores de #256 14 y 17 (cargadores y recorrido duplicados) se arreglan moviendo uno de los dos al otro módulo; el dueño del código es la Task 5.
- #256 6: se corrige la skill (el valor de `stuckWaitSeconds` está en `config/swarm.json`; no existe un argumento de lanzamiento), no el código. Reversible.
- #215: se quitan las peticiones, no se agregan campos al esquema (R14 permite las dos). Reversible.
- #232 3 se descarta (ver abajo): `REFUSED_ARGS` fija `haiku` porque ese lanzamiento rechazado no hace trabajo.
- `aether-autonomy quota-brake` lee de `aether-wt save` el `saved.json` de cada corrida abierta y hace el push solo si `brake-settings` lo dice y `check push` lo cubre.
- Las tareas 5 y 9 usan `run-timings.js` de la Task 7. Si la Task 7 falla, estas dos esperan.
- Descartes de C4: ver la sección de la spec; son 15.

## Risks

- **Rama que se mueve (Task 2).** Mover una rama por un `git branch -f` puede perder trabajo si la comprobación de «desciende» falla; la tarea lleva `Review: xhigh` y una prueba de HEAD fuera de la rama.
- **Archivos compartidos.** Si dos tareas deben cambiar el mismo archivo y no hay dependencia, `aether-plan check` lo dice; las dependencias de arriba ya resuelven las conocidas.
- **Pruebas que fijan texto viejo.** Cada tarea nombra en `Owns` las pruebas que sospecha; el implementador busca con `grep` en `tests/` el texto viejo antes de terminar y, si una prueba no listada lo fija, lo dice en su informe.
- **Tamaño del arranque (C12).** La Task 21 mide las partes antes y después; si una crece, se acorta la prosa.
- **Spec:** sin contradicciones; R13 no tiene tarea propia porque el plan la cumple en la spec.
- **El número de tareas** es 21: pasa de 20 porque #201 pide dos comandos y las reglas.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Módulo nuevo `lib/run-timings.js` | R18 y R19: un solo lugar donde cinco recolectores anotan y el informe lee | Anotar en cada bin su propio archivo obligaría al informe a leer cinco formatos |
| Módulo nuevo `lib/harness-names.js` | R23: las cinco listas leen de un solo lugar | Seguir con las cinco listas es el defecto de #136 |
| Módulo nuevo `lib/pick-data.js` | R25: una preparación de datos para los tres que piden un par | Dejar `viewOf`, `harnessView` y la envoltura de `seats.js` es el defecto de #203 |
| Módulo nuevo `lib/bash-parse.js` | R12 (#232 2): el analizador de Bash no tiene casa fuera del guard | Dejarlo en `guard.js` obliga a `continuity-posttool.js` a importar el guard |
| Módulo nuevo `lib/delegate-approve.js` | R29: un comando que da veredicto, fusiona y corre la prueba | Agregarlo a `delegate-task.js` (879 líneas) mezcla dos asuntos en un archivo que la Task 3 y la Task 18 ya tocan |
