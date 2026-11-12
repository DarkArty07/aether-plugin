<!-- Copia del cuerpo del issue #236 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Qué es

Lo que la revisión final de la corrida de la spec 032 (enjambre `20261110-212914-1918`, 2026-11-11, veredicto `ready-with-fixes`, 0 críticos, 1 importante y 6 menores) dejó sin trabajar, por la regla de que los menores se difieren. El importante (la regla de repetición del Lead, que seguía hablando de «correcciones» y de «after Opus») se arregla en la misma corrida. Todo lo de abajo ocurre en la rama `feat/032-pareto-ladder`.

## Menores diferidos

1. **`plugins/aether/lib/ladder.js:36`**: `loadLadder` rellena en silencio lo que debe dar la configuración (`repeatBlocked` a 2, `supervisorFloor` a 1, `law` a `{}`), y `supervisorOf` y `judgeFix` tienen sus `?? 1` y `?? 2`. Un `config/ladder.json` al que le falte `supervisorFloor` cambiaría el supervisor del escalón 1 de Sonnet `high` a Haiku `xhigh` sin avisar, y una `law` ausente sale como `TypeError`. Debe exigir los tres y lanzar `ladder: …` como las demás comprobaciones.
2. **`plugins/aether/lib/wt-ladder.js:45`**: `buildView` hace `ladder.rungs[idx]` con `idx` de `findIndex(state.step)` sin comprobar `idx >= 0`. Un estado de unidad escrito con una escalera anterior (el flujo de R4: el dueño aprueba una escalera recalculada con escalones renombrados, o una actualización a mitad de corrida) hace que `aether-wt ladder` lance un `TypeError` en vez del error claro `ladder: unknown step` que da `rungIndex`.
3. **`scripts/refresh-lanes.js:81`**: la expresión del valor (`[^,}]+`) en `patchRowLine` se come el espacio antes de ` }` cuando un campo numérico de código es el último de la línea y rompe el estilo de una fila por línea (hoy no ocurre porque el último campo es `codeChecked`, un texto). Además, la línea `written to <ruta>` (≈173) se imprime siempre con `--write`, aunque no se haya parcheado ninguna fila.
4. **`.claude/skills/artificial-analysis/aa-api.js:72`**: exporta `cli`, que la Tarea 7 no pedía (solo `{ PAGE_URL, figuresOf, readPages }`). Nada lo usa.
5. **`plugins/aether/lib/delegate-log.js:107` y `lib/report.js`**: comentarios que siguen describiendo la política retirada («the earlier work a correction or a rise builds on», «corrections» entre lo que cuenta el resumen de la escalera).
6. **`docs/reference/artificial-analysis.md:52`**: dice en presente que la inteligencia y el costo por tarea de `pairs.json` «se refrescan en la parte 2»; la parte 2 no existe. `docs/contributing.md` lo dice bien, en futuro.

## Dudas que el revisor dejó al Lead, y qué se decidió

- **El campo `Review` de una tarea sube el esfuerzo del supervisor** por encima de la tabla de la tarjeta (`max(view.supervisor.effort, task.review)` en `run.workflow.js`). Decisión del Lead: se acepta; nunca baja del nivel de R8, así que el supervisor sigue sin ser más débil que el autor. Va a «Supuestos» del informe.
- **Una tabla de pares propia** (`AETHER_PAIRS_CONFIG`) con filas de Claude sin los campos de código ahora la rechaza `loadPairs`. Decisión: una frase de compatibilidad en el changelog (se hace en la misma corrida).
- **El refresco sale con código 0** cuando una página responde ok pero no trae cifra de código (solo una página que no responde ok da 1). Es lo que la Tarea 7 especificaba, con su prueba.
- **`haiku` fijo** en `REFUSED_ARGS` de `delegate-task.js` y en los ticks de `ops` y de plazo de `run.workflow.js`: no decide un escalón, y es anterior a la corrida.

## Lo que falta comprobar

La lectura real contra las páginas de Artificial Analysis nunca se ha corrido (por diseño: solo cuando el dueño lo pide). Las pruebas del refresco usan páginas simuladas que copian la forma que lee `aa-pages.js`. La parte 1 se comprobó contra las páginas guardadas el 2026-11-10 en `specs/032-pareto-ladder/evidence/`.

Relacionado: #194, #233, #235.
