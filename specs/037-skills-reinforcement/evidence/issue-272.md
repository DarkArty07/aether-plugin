# #272 El registro de skills cuenta como creadas las copias y ediciones en worktrees

Parte de #269.

## Qué pasa

`skills/created.jsonl` cuenta como skills creadas las copias y ediciones que aparecen en worktrees.

## Evidencia (2026-11-13, 0.42.0)

- 8 líneas, 3 skills reales: `artificial-analysis` aparece 4 veces (worktrees de delegados y de una corrida, la skill ya existía desde 0.28.0) y `diseno-de-juego` 2 veces (el checkout y un worktree).
- `lib/skill-review.js` (`posttool`) anota cuando no encuentra el mismo `name` con el mismo `path`; cada worktree tiene otra ruta, así que cada edición en un worktree es una «creación».

Esto infla el conteo y alimenta mal el aviso de skills sin uso (#269).

## Arreglo propuesto

Identificar la skill por nombre y raíz del repositorio principal (`repoPaths(...).mainRoot`), no por la ruta del worktree, y no anotar como creación la edición de una skill que ya estaba en git.

