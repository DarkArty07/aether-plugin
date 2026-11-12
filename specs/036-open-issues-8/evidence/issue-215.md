<!-- Copia del cuerpo del issue #215 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

Higiene de los textos de los seis agentes (`agents/*.md`) frente a cómo los llaman los dos workflows y qué leen de sus respuestas.

## Se pide y nadie lo lee

1. **Supervisor: calificar cada criterio** como `VERIFIED`, `PARTIAL` o `MISSING` (`agents/supervisor.md:38`). La respuesta no tiene campo para eso (`workflows/run.workflow.js:85-95`).
2. **Supervisor: comparar el `Head` del paquete con el commit que informó el implementador** y mandar `retry` si no coinciden (`agents/supervisor.md:29`). El código nunca los compara, y en otro plan el commit sale de git, no del informe (`lib/lane-calls.js:477-481`).
3. **Implementador: evidencia en rojo y luego en verde,** con comando y salida de cada una (`agents/implementer.md:77-78`). El campo `tests` es un texto libre y nada comprueba que el rojo existió.
4. **Revisor: el arreglo de cada hallazgo** (`agents/reviewer.md:67`). El esquema de hallazgos no tiene ese campo (`workflows/run.workflow.js:57-69`).
5. **Writer: las rutas `spec`, `plan`, `tasks` y la salida de `check`** en su respuesta (`agents/writer.md:87-104`). El workflow usa sus rutas fijas y corre él mismo la comprobación (`workflows/design.workflow.js:857-875`); de la respuesta lee `proposals` (`:962`) y `complexity` (`:978`).

## Presupuestos de turnos que ningún código cuenta

- Judge: 30 turnos, 20 de lectura como máximo, veredicto antes del 28 y 6 afirmaciones comprobadas (`agents/judge.md:41-44`).
- Revisor: 30 turnos, 20 de lectura y 6 afirmaciones (`agents/reviewer.md:28-30`).
- Implementador: parar «by about turn 45 of a 60-turn budget» (`agents/implementer.md:31`).
- En otro plan, el del Judge se cambia por tiempo: «Your limit here is the round's time, not the 30 turns» (`lib/seats.js:658`).

## Cifras sin fuente

- «A false approval costs 10-100x more than a false rejection» (`agents/judge.md:14`).
- «`xhigh` costs about 2.5 times more than `high`» (`agents/writer.md:64` y `skills/tasks/SKILL.md:45`). La regla 3 del índice de modelos pide no dar una cifra de un modelo sin su fuente.

## Copias que se mantienen a mano

- El localizador de hallazgos y el brief de corrección están en `lib/seats.js:559-563` y `634-643` y otra vez en `workflows/design.workflow.js:779-781` y `816-823`. Un workflow no puede importar `lib/`, así que son copias a propósito.
- El brief de una corrección se arma en tres sitios: `workflows/run.workflow.js:672-701`, `lib/delegate-task.js:219-243` y `lib/lane-delegate.js:127-128` (ver #202).

## Lo que está bien

- Las palabras de cada veredicto son listas cerradas en el código, y una palabra desconocida cae del lado seguro: el supervisor a `retry` (`workflows/run.workflow.js:1420-1422`) y el revisor a `not-ready`.
- Un modelo de otro plan recibe el mismo texto del agente más una nota: «Every other rule of your role holds» (`lib/lane-calls.js:55-59`).
- No se encontró ninguna contradicción entre los textos de los agentes y los mensajes de los workflows.
- La aprobación con un hallazgo crítico o importante se convierte en `retry` por código (`workflows/run.workflow.js:1428-1430`), como dice el texto.

## Buenas prácticas

> «finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome» — Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

## Opciones sin funciones nuevas

Para cada punto del 1 al 5: quitar la petición del texto o darle un campo que alguien lea. Para las cifras: poner la fuente o quitarlas.

---
Segunda vuelta de la revisión de diseño, 2026-11-09, versión 0.35.0 (`c95b9da`), de solo lectura. Datos: `runs.jsonl` (17 corridas finalizadas del 2026-10-15 al 2026-11-07, 15 en este repositorio), los registros de llamadas a otros planes (`lanes/*.jsonl`, 1.271 llamadas) y los 40 informes de corridas autónomas de este repositorio. No se hizo ninguna medición de pago ni se corrió ninguna prueba. Índice de esta vuelta: #216. Índice de la primera: #207.

