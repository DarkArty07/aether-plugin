<!-- Copia del cuerpo del issue #232 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

Lo que quedó sin trabajar al cerrar la spec 031 (versión 0.36.0, `ea5fde0`). Viene de #228, que se cierra con la publicación. Nada de esto bloquea: son hallazgos menores de la primera revisión final y comprobaciones que solo se pueden hacer en una sesión real.

## Menores diferidos de la revisión final

- La detección de Bash falla con globs, `~` y `git -C`, y el destino de cp/mv puede ser una redirección (`plugins/aether/lib/continuity-posttool.js:78`)
- La continuidad pasa a depender de las funciones internas del guard de PreToolUse (`plugins/aether/lib/guard.js:1459`)
- Un rechazo por tope o pausa sigue lanzando un agente Haiku, también durante la pausa por cuota (`plugins/aether/lib/delegate-task.js:334`)
- Una llamada sin AETHER-TASK rechazada por tope le pide al Lead dar veredicto a una tarea que nunca corrió (`plugins/aether/lib/delegate-task.js:442`)
- La prueba de `aether-plan compile` solo compila desde la raíz principal y no comprueba el id en el caso de cuota (`tests/baseline.test.js:227`)
- `compile` mezcla dos fuentes para la sesión: el `env` recibido y `process.env` (`plugins/aether/lib/plan-compile.js:317`)
- La prueba de `compile` está en `tests/baseline.test.js`, un archivo sobre firmas de fallos (`tests/baseline.test.js:201`)
- Un estado `failed` con tres formas distintas (`plugins/aether/workflows/design.workflow.js:863`)
- Un rechazo en el Examinador convierte un diseño ya aprobado en `failed`, y el comentario de `examine` quedó desfasado (`plugins/aether/workflows/design.workflow.js:955`)
- Una ronda rechazada queda en `rounds` con `provider: 'native'` aunque no corrió nada (`plugins/aether/workflows/design.workflow.js:638`)
- Las pruebas del workflow no cubren el modo corto ni las correcciones, y una de ellas no comprueba lo que dice su título (`tests/workflow-design.test.js:1497`)
- Los comentarios de cabecera y de `seatRound` no describen la ruta de rechazo (`plugins/aether/workflows/design.workflow.js:615`)
- An unreadable run.json makes launchRefusal throw, and its callers handle the throw differently (`plugins/aether/lib/autonomy.js:566`)
- The not-a-repository git probe lives in autonomy.js instead of git.js, and its tests monkeypatch child_process and require.cache (`plugins/aether/lib/autonomy.js:569`)
- The missing and unreadable transcript cases pass through verifyQuote, not the gate, and `found` is never used (`tests/autonomy.test.js:1541`)
- `aether-autonomy start` recibe la carpeta de datos del entorno del comando, pero no la de configuración (`plugins/aether/lib/autonomy-command.js:156`)
- Falta una prueba con el lanzamiento y el resultado en dos instalaciones distintas (`tests/delegate-report.test.js`)

## Sin comprobar en una sesión real

- Que Claude Code entregue al Lead el `additionalContext` de un hook `Stop` y continúe el turno una vez (leído en la documentación de hooks el 2026-11-09, no probado).
- Que `ExitPlanMode` no pueda darse por aprobado sin el dueño, por ejemplo en modo `bypassPermissions`. Si pudiera, el Lead cumpliría la compuerta por sí mismo.
- Que `PostToolUse` reciba `prompt_id` en la versión instalada; si no, el contador se reinicia solo con la nota de continuidad.
- Que las tres partes de las reglas lleguen enteras y que el aviso de la décima lectura aparezca con `Read`, `Grep` y `Glob` reales. La versión instalada entrega las tres partes al correr sus comandos a mano (8.999, 8.944 y 7.058 caracteres), pero no se abrió una sesión nueva para verlo.

## Otras notas de la corrida final

- No se compararon frase por frase las reglas recortadas de `using-aether` con las de la 0.35.0. La revisión final encontró una regla perdida (no pasar modelo ni esfuerzo a los agentes de Aether) y se restauró.
- `specs/031-lead-behavior/tasks.md:1272` conserva la frase equivocada de `aether-wt settle`; la skill ya la tiene bien.

---
Corridas `auto-20261109-164519-c3e5`, `auto-20261109-224747-760f` y `auto-20261110-141002-ac0f`.

