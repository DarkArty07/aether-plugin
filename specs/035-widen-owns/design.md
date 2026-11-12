# Diseño corto: una entrega del Lead puede ampliar `Owns` (issue #258)

- **Fecha:** 2026-11-12
- **Base:** versión 0.40.0, `origin/main` en `6cce126`; sigue a la spec 034 (#238).
- **Ruta:** diseño corto, porque toca la fusión del enjambre, que corre una a la vez mientras el flujo sigue. Después lo construye una tarea delegada.

## Intención del dueño

- Pregunta del brief de la corrida `auto-20261112-015910-9484`: «#238: ¿una entrega del Lead puede ampliar `Owns`? Hoy no puede: si el arreglo toca un archivo fuera de `Owns`, el Lead declina y lo integra a mano con `aether-wt adopt`.»
- Respuesta del dueño: «si a todo esto y ademas borra lo que ya no se usa». El «sí» respondió a esta pregunta. «Borra lo que ya no se usa» pedía limpiar los worktrees, las ramas y los stashes que ya no se usaban; esa limpieza se hizo el 2026-11-12 y no es parte de este diseño.
- El dueño leyó la explicación (una tarea se traba porque una prueba que no es suya revisa un texto que cambió; hoy el Lead la suelta, el enjambre termina sin ella ni sus dependientes, y después se integra a mano y se relanza) y dijo: «hazlo».

## Criterios

- **C1.** Cuando el arreglo de una unidad trabada necesita archivos fuera de su `Owns`, el Lead los nombra al entregar y el flujo en curso fusiona el arreglo con esos archivos, sin declinar ni integrar a mano. Sus dependientes corren en el mismo lanzamiento. Cita: «hazlo», sobre «ampliar `Owns`».
- **C2.** La fusión acepta solo los archivos nombrados. Cualquier otro archivo fuera de `Owns` se sigue rechazando como hoy.
- **C3.** No se puede ampliar hacia un archivo que está en el `Owns` de otra unidad de la corrida que todavía no se fusionó, para que dos unidades no editen lo mismo.
- **C4.** Las pruebas de fusión, la línea base, el turno de fusión de una a la vez y la revisión final no cambian.
- **C5.** El informe muestra los archivos ampliados junto al commit y el motivo del arreglo.
- **C6.** La skill `swarm` dice cuándo ampliar y cuándo declinar. El arranque (`skills/using-aether`) no crece.
- **C7.** El texto que esta función deja viejo se reescribe. Hoy la skill `swarm` (§5, «if you cannot fix it (for example, a plan error outside `Owns`)») y la frase de `docs/guide/troubleshooting.md` que empieza «The Lead then delivers a fix with `aether-wt deliver …`» presentan declinar e integrar a mano como el único camino cuando el arreglo toca un archivo fuera de `Owns`. Después, declinar queda solo para los casos que `--widen` no cubre: otra unidad sin fusionar posee el archivo, o el error del plan es mayor. `aether-wt adopt`, `declineUnit` y `deliverFix` sin `--widen` siguen como hoy.
- **C8.** Todo se prueba sin tokens: pruebas de las libs y un escenario del arnés de workflows con agentes simulados.

## Diseño

1. **El comando.** `aether-wt deliver <run> <task> --commit <sha> --reason "…" [--widen <ruta>[,<ruta>…]]`, en `bin/aether-wt` y `lib/wt-stuck.js` (`deliverFix`). Sin `--widen`, todo queda como hoy.
2. **Validación al entregar** (`deliverFix`). Si alguna ruta falla, la entrega se rechaza entera con un error que la nombra, y la unidad sigue esperando:
   - la ruta es una cadena no vacía, relativa al repositorio, escrita como la devuelve `changedFiles`: sin `/` ni letra de unidad al inicio (no absoluta), sin prefijo `./`, sin `\`, sin `/` al final (no es un directorio), sin segmento `..` y sin caracteres de glob (`*`, `?`, `[`). La comparación con `changedFiles`, con `Owns` y con la lista de `widen` es siempre contra esas cadenas exactas, sin normalizar;
   - la ruta no está ya en el `Owns` de la unidad (si lo está, no hay nada que ampliar);
   - la rama de la unidad cambia esa ruta respecto de su base (`changedFiles` de `lib/worktrees.js` entre `unitBase` y la rama), para atrapar un nombre mal escrito;
   - ninguna otra unidad de la corrida tiene la ruta en su `Owns` (`matchesAny`) sin estar fusionada. El `Owns` de cada unidad sale de `loadTasks` de `lib/wt-stuck.js` (el grafo más `run.readUnits`), que incluye unidades de lanzamientos anteriores aunque un relanzamiento con `--only` las haya sacado del grafo del último. El estado de fusión sale de `mergedUnits(cwd, runId)` de `lib/worktrees.js`, no de `unitStatus(...).merged`: este da `false` para una unidad fusionada cuya rama ya se quitó (`close(unit)` corre `aether-wt remove`), y `mergedUnits` también lee los asuntos de los commits de fusión y `adopted.json`. El error nombra la unidad dueña.
   La entrega válida guarda `delivered.widen` (lista ordenada, sin duplicados) en el registro de la unidad (`run.stuckFile`).
3. **La fusión** (`mergeUnit` de `lib/worktrees.js`, donde hoy `outside` da `reason: 'ownership'`). Antes de ese rechazo, si el registro de espera de la misma unidad está en estado `delivered` y tiene `delivered.widen`, esas rutas exactas se quitan de `outside`. Lo demás no cambia: conflicto, pruebas, línea base y marcador sin verificar. El flujo no cambia su llamada a `aether-wt merge`, y el mod tampoco cambia.
   Cuando la espera termina (`stuck-end`), el estado pasa a `ended` y la ampliación ya no vale para una fusión posterior ni para un relanzamiento: la fusión solo mira registros en estado `delivered`, y una entrega sin `widen` no quita nada de `outside`.
4. **El aviso al flujo.** `stuckTick` devuelve también `widen` cuando la entrega lo trae. El flujo (`workflows/run.workflow.js`, donde hoy pone `unit.fixedByLead = { commit, reason }`) agrega `widened` con esa lista solo cuando no está vacía.
5. **El informe.** `lib/report.js` copia `widened` a la entrada de `fixedUnits` cuando existe, y la nota de texto que se lee (`was fixed in flight by the Lead at <commit>: <reason>`, hoy en `report.js` junto a `fixedUnits`) agrega los archivos cuando `widened` no está vacía: `… <reason> (widened: <ruta>, <ruta>)`. Sin `widened`, la nota queda igual.
6. **Las reglas del Lead.** En la skill `swarm`, §5 «Stuck unit»: si el arreglo necesita archivos fuera de `Owns` que ninguna unidad sin fusionar posee, entregar con `--widen <rutas>` y decir en `--reason` por qué; si otra unidad pendiente los posee, o el error del plan es más grande, declinar como hoy. `docs/guide/troubleshooting.md` nombra `--widen` en la misma frase que ya habla de `deliver`. La línea de uso de `bin/aether-wt` también lo incluye.

## Pruebas

- `tests/wt-stuck.test.js`: la entrega con `--widen` válida guarda `delivered.widen`; se rechazan una ruta con glob, con `..`, una absoluta, una con prefijo `./x`, una con `\`, una con `/` al final, una que ya está en `Owns`, una que la rama no cambia y una que está en el `Owns` de otra unidad sin fusionar; se acepta la misma ruta cuando esa otra unidad ya está fusionada con su rama ya quitada (`aether-wt remove`), que es el caso que una implementación con `unitStatus` rechazaría por error; se rechaza cuando la unidad dueña no está en el grafo del último lanzamiento (relanzamiento con `--only`) pero sí en `readUnits` y sin fusionar.
- La prueba de la fusión: una unidad entregada con `widen` se fusiona con el archivo ampliado; la misma unidad con otro archivo fuera de `Owns` que no está en `widen` se sigue rechazando con `ownership`; un registro en estado `ended` con `delivered.widen` presente da `ownership` (la ampliación muere con la espera); una entrega sin `widen` no quita nada y da `ownership` como hoy.
- `tests/workflow-stuck.test.js`: un escenario en que la unidad trabada recibe una entrega con `widen`, se fusiona, sus dependientes corren en el mismo lanzamiento, hay una sola revisión final y `fixedByLead.widened` lleva la lista.
- La prueba del informe: `fixedUnits` muestra `widened`, y la línea de nota `was fixed in flight by the Lead at <commit>: <reason> (widened: …)` lleva los archivos; sin `widened`, la nota es la de hoy.
- `tests/swarm-stuck-docs.test.js`: la skill nombra `--widen` y cuándo declinar; la skill y `docs/guide/troubleshooting.md` ya no presentan declinar como único camino para un arreglo fuera de `Owns` (C7): la frase exacta «for example, a plan error outside `Owns`» ya no está en la skill, y la frase de `troubleshooting.md` nombra `--widen`; las aserciones que ya existen sobre `aether-wt decline` (`swarm-stuck-docs.test.js:19` y `:39`) se mantienen; las pruebas de tamaño del arranque siguen pasando.

## Fuera de alcance

- Ampliar `Owns` de una unidad que no está trabada, o durante sus intentos normales.
- Globs en `--widen`.
- Cambiar `tasks.md` o el plan de la corrida.
- Una segunda espera cuando la fusión del arreglo se rechaza: sigue habiendo una espera por unidad.

## Supuestos

- **Rutas separadas por comas en un solo `--widen`.** Así funciona hoy `flag()` de los bins. Una ruta con coma no se puede ampliar. Reversible.
- **Rechazar una ruta que ya está en `Owns`** en vez de ignorarla: un error claro es mejor que una lista que no dice lo que hace. Reversible.
- **La regla de C3 mira solo las unidades sin fusionar.** Una unidad ya fusionada no choca: las fusiones van de una a la vez y git detecta el conflicto como hoy. Una unidad bloqueada u omitida cuenta como sin fusionar, porque su trabajo puede volver en un relanzamiento. Reversible.

- **Sin cruce con `outside` de la unidad trabada.** Esa lista sale del rescate y puede estar vieja cuando el Lead arregla; basta la comprobación contra `changedFiles` de la rama. Reversible.

## Acciones irreversibles

Ninguna. Publicar la versión que lo incluya espera el sí del dueño.
