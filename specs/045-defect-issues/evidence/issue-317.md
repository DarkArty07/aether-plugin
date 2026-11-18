# #317: tests/seat-partial.test.js falla de forma intermitente con carga y atasca unidades sanas del enjambre

## Qué pasó

En la corrida del enjambre `20261117-151251-ad62` (spec 044, 2026-11-17), la tarea 11 cambió solo documentos (`docs/decisions.md`, `docs/index.md`, `docs/guide/delegates.md`, `AGENTS.md` y sus pruebas). Aun así, su fusión se paró dos veces seguidas con `blocked-foreign-tests` por esta prueba, que no es suya:

`tests/seat-partial.test.js:483`: «a stale partial from an earlier round is not loaded when the next round is killed before its signal handler, and the committed document stays (issue 68)».

## Evidencia

- La unidad no toca nada de lo que lee la prueba: su diff solo cambia documentos.
- Sola, en el worktree de la unidad (`7e678c7`), `node --test tests/seat-partial.test.js` pasó 3 de 3 veces.
- Falló mientras 11 unidades corrían y fusionaban en paralelo en la misma máquina. Es una prueba de tiempos de señales (mata la ronda antes de su manejador), así que la carga cambia el orden.
- La entregué tal cual con `aether-wt deliver 20261117-151251-ad62 task-11 --commit 7e678c7`, y se fusionó.

## Qué cuesta

Una unidad sana queda atascada hasta que el Lead la entrega a mano. En una corrida autónoma, eso consume la espera `stuckWaitSeconds` (1800 s) o un paso del Lead.

## Para arreglarlo

Hacer que la prueba no dependa del reparto de CPU: esperar una señal explícita, como un archivo o una línea en stdout, en vez de un plazo fijo antes de matar el proceso. Otra opción es subir su margen de tiempo.


## Comentarios



