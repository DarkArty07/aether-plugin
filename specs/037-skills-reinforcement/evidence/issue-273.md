# #273 El Writer no conoce el campo Skills: ningún plan ha llevado skills a una tarea

Parte de #269.

## Qué pasa

Ningún plan ha llevado skills a una tarea. El Writer, que escribe `tasks.md`, no sabe que existe el campo `Skills:`.

## Evidencia (2026-11-13, 0.42.0)

- `Skills:` aparece 0 veces en `agents/writer.md`, `skills/tasks/SKILL.md` y `skills/plan/SKILL.md`.
- Ningún `tasks.md` de los proyectos del dueño tiene el campo; `skills/uses.jsonl` no existe.
- La spec 030 R27 dice que «el Lead elige» las skills de cada tarea, pero el Lead no escribe `tasks.md`, y nada le pasa al Writer la lista de skills del proyecto. `aether-plan` sí lee y valida el campo (R28) y `aether-plan compile` sí lo pega en el brief (R45): la parte del código está, falta quien lo llene.

## Arreglo propuesto

`/aether:design` le pasa al Writer las skills del proyecto (nombre y descripción, de `.agents/skills/` y `.claude/skills/`). El Writer y la skill `tasks` ponen `Skills:` (hasta 3) en las tareas donde una sirve, y el Judge lo revisa como el resto del plan.

