# #271 El aviso de skills sin uso solo cuenta a los agentes: propondrá quitar skills que el Lead usa

Parte de #269.

## Qué pasa

El aviso de arranque «Skills que nadie usó en 30 días» (spec 030 R33) solo cuenta los usos de los agentes. Las skills que el Lead carga él mismo cuentan como abandonadas.

## Evidencia (2026-11-13, 0.42.0)

- `lib/skill-idle.js` lee `skills/uses.jsonl`, que solo escriben `recordUse` desde `lib/delegate-task.js:717` (un brief con `AETHER-SKILLS:`) y `lib/plan-compile.js:431` (una tarea con `Skills:`).
- `uses.jsonl` no existe: ninguna tarea ni ningún delegado ha recibido skills.
- Mientras tanto, el Lead cargó `criterio-del-dueno` 10 veces, `diseno-de-juego` 5 y `direccion-de-arte` 4 entre el 2026-11-08 y el 2026-11-13.
- Hacia el 2026-12-08 el aviso propondrá quitar `direccion-de-arte` y `criterio-del-dueno`.

## Arreglo propuesto

Anotar en `uses.jsonl` cada carga de una skill por el Lead (herramienta `Skill`). El hook `PostToolUse` de `aether-continuity posttool` hoy escucha `Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash`; habría que sumar `Skill`.

**Por verificar:** que `PostToolUse` se dispare para la herramienta `Skill` en Claude Code 2.1.325. Fuente: ninguna todavía (2026-11-13); se comprueba con una prueba local del hook, sin llamadas pagadas.

