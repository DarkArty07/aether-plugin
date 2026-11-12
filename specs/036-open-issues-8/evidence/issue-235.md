<!-- Copia del cuerpo del issue #235 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Qué se observó

En la corrida de la spec 032 (escalera de Pareto, parte 1; enjambre `20261110-212914-1918`, 2026-11-10) la unidad `task-3` agotó su escalera en siete intentos (Haiku `high`, Haiku `xhigh`, Sonnet `high` tres veces y Opus `high` dos, todos en Codex), con siete rechazos del gate. La tarea escribía en las filas de Claude de `config/pairs.json` las cifras leídas ese día, también la inteligencia.

- El piso con que se elige un par de otro harness sale de los puntos de inteligencia del par de Claude de referencia, menos 1 punto de tolerancia (`lib/superdelegation.js`).
- Con Haiku `high` de 29,6 (escala del 2026-10-29) a 29,9 (2026-11-10) el piso pasa de 28,6 a 28,9, y Muse Spark `high`, que está en 28,7 por una estimación aprobada por el dueño, deja de servir el escalón de Haiku. En su lugar entra Spark `xhigh`.
- Lo fijan `tests/muse-spark.test.js` (b) y (e). Los implementadores pararon ahí porque su brief solo dejaba cambiar números en las pruebas existentes, y tenían razón: era un cambio de comportamiento que la tarjeta dejaba fuera.

Es decir: actualizar las filas de Claude sin las demás deja la tabla con dos fechas, y un movimiento de 0,3 puntos en la escala de Artificial Analysis cambia qué modelos externos reciben trabajo, sin que nadie lo decida.

## Qué se hizo en la 032

La parte 1 añade a las filas de Claude solo las cifras de código y deja la inteligencia y el costo por tarea en la escala que la tabla ya tiene (spec 032, R17, commit `11ebf46`). El refresco, que en la parte 1 solo escribe las filas de Claude, avisa en su resumen de que las otras filas conservan su fecha anterior (R12).

## Qué queda por decidir (parte 2)

1. Que el refresco lea y escriba todas las filas el mismo día, para que la tabla tenga una sola fecha.
2. Qué pasa con las filas estimadas que no tienen página en Artificial Analysis (Muse Spark `low` a `xhigh`): siguen en la escala del día en que se estimaron y se quedan atrás en cada refresco.

Relacionado: #194 (escalera de Pareto), #195, #233. La skill `artificial-analysis` ya dice que dos modelos solo se comparan con cifras leídas el mismo día.
