# #318: maintenance.md dice que la limpieza nunca toca worktrees registrados, pero quita los limpios de .aether/work vencido

## Qué pasó

`docs/guide/maintenance.md` (punto «Per-project cleaning») dice que la limpieza de SessionStart borra los asientos y delegados terminados de `.aether/work/` de más de 7 días «never touching uncommitted work or registered worktrees».

El código hace otra cosa: `plugins/aether/lib/tree-clean.js:247-275` busca los worktrees registrados que están dentro de una carpeta vencida de `.aether/work/`. Si todos están limpios (sin cambios en `git status --porcelain --untracked-files=all`), los quita con `git worktree remove --force` y, si queda algo, con `rmSync`. Si alguno tiene cambios, conserva la carpeta (`kept`, «unsaved changes»).

O sea, sí toca worktrees registrados: los limpios dentro de carpetas vencidas. Lo que nunca toca es el trabajo sin guardar.

## Origen

La revisión final de la corrida `20261117-151251-ad62` (spec 044) lo vio y lo dejó aparte, porque la tarea 12 solo debía corregir tres frases (R22) y este texto ya estaba antes. Comprobado contra el código en la rama `feat/044-design-turns-and-reviews` (`891c0f6`).

## Para arreglarlo

Cambiar la frase a «never touching uncommitted work; a registered worktree inside an expired folder is removed only when it is clean», y fijarla con una prueba en `tests/docs-facts.test.js` o en `tests/docs-030.test.js`.


## Comentarios



