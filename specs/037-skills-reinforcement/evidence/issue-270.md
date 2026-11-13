# #270 El aviso de hallazgo repetido nunca salta: compara el texto exacto y solo dentro de una sesión

Parte de #269.

## Qué pasa

El aviso de la spec 030 R31 («tras un veredicto, un hook avisa al Lead cuando el mismo hallazgo ya salió en otra tarea») nunca ha salido en una sesión real.

## Evidencia (2026-11-13, 0.42.0)

- `lib/skill-repeat.js` compara con `findingKey` de `lib/ladder.js`, que es `archivo|texto completo`, y lee solo las entradas de la sesión (`readEntries(dataDir, { session })`).
- Desde el 2026-11-07 hubo 35 veredictos `fix` con hallazgos, en 12 sesiones: ninguno repite el texto exacto entre tareas; solo un caso repite el archivo en dos tareas de la misma sesión.
- En las conversaciones de esos días, el texto del aviso («already came up in») solo aparece en pruebas, nunca en una sesión real.

Un error que se repite casi nunca se escribe con las mismas palabras, así que el disparador de «crear una skill cuando un error se repite» no llega al Lead.

## Arreglo propuesto

Comparar por archivo y por parecido de palabras (no por el texto exacto), sobre las sesiones del mismo proyecto y no solo la actual. El umbral de parecido es dato, en `config/`, no código.

