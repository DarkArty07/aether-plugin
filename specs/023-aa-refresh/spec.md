# Especificación: la tabla de modelos sigue las cifras nuevas de AA (0.28.0)

- **Intención:** [intent.md](intent.md)
- **Plan:** [plan.md](plan.md); **tareas:** [tasks.md](tasks.md)

## Requisitos

- **R1.** `config/pairs.json` y `config/lanes.json` llevan, en cada fila con `slug` y en cada modelo con `aa`, las cifras de la API de AA del 2026-10-29 (inteligencia y Terminal-Bench). *(Hecho por `scripts/refresh-lanes.js --write`, commit e73cf6c.)* Serves: C2.
- **R2.** Las filas `muse/muse-spark-1.3@low`, `@medium`, `@high` y `@xhigh` son estimaciones sobre la escala nueva, con el método de A96: la forma de las curvas de Haiku 5.5 y Sonnet 5.5 (cada esfuerzo como parte de su máximo, promedio de las dos) aplicada al máximo medido de Spark (36.4). Valen 17.8, 22.5, 28.7 y 33.9, cada fila lo dice en su `ownerDecision`, y sus costos no cambian. *(Hecho, commit e73cf6c.)* Serves: C2.
- **R3.** `config/models/models.json` y `docs/models/README.md` están regenerados por `scripts/build-models-index.js` con la lista de AA del día. *(Hecho.)* Serves: C4.
- **R4.** Para cada pedido de Haiku, Sonnet u Opus a cada esfuerzo, lo que `choose()` elige sobre la tabla nueva es lo del plan D2, y una prueba lo fija. Serves: C3.
- **R5.** Toda prueba del repositorio que fijaba una cifra de la escala vieja, un escalón de Codex anterior o una elección que depende de ellos dice ahora lo que la tabla nueva da, **conservando lo que la prueba afirmaba**. Si la premisa de una prueba ya no es cierta en la escala nueva (por ejemplo «ningún pedido nativo alcanza a Luna»), se reescribe con la premisa verdadera y el informe de la tarea lo dice. Serves: C4.
- **R6.** Las guías (`lanes.md`, `models-by-role.md`, `delegates.md`) citan los puntos nuevos y los escalones nuevos de Codex; la tabla de `models-by-role.md` dice que los puntos son de 2026-10-29 y los costos de 2026-10-26. Serves: C4, C5.
- **R7.** El gate de unidad (`lib/wt-gate.js`) busca los fallos conocidos en toda la salida de las pruebas. *(Hecho, #134, commit e73cf6c.)* Serves: C6.
- **R8.** Las skills `artificial-analysis` y `new-harness` dicen que la tabla de pares es de una sola escala desde el 2026-10-30. Serves: C4. *(Lo hace el Lead al cerrar.)*
- **R9.** La versión 0.28.0, el changelog, la decisión A101 y el handoff. Serves: C7. *(Lo hace el Lead al cerrar.)*

## Propuestas

- Que `aether-plan` trate como error, no como aviso, que una tarea rompa pruebas que nadie posee: esta spec asigna las 18 pruebas en rojo una por una, que es lo que ese aviso pedía.
- Releer los costos por tarea de AA después del re-puntaje, con el permiso del dueño para leer sus páginas o con una captura suya, porque la API no los da.
- Que la regla de elección mire también Terminal-Bench cuando dos pares empatan en inteligencia, porque Terra low (15.2 %) rinde mucho menos en código que Haiku high (21.7 %) con 29.2 y 29.6 puntos.
