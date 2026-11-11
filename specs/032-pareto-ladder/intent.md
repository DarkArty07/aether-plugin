# Tarjeta de intención: la escalera de Pareto (parte 1, Claude)

- **Dueño:** Christopher
- **Fecha:** 2026-11-10
- **Issues:** cierra #194 y #233. Prepara #195, que se cierra en la parte 2. Toca #202 y #203. Evidencia y palabras del dueño: comentarios de #194 y #233.
- **Confirmada por el dueño:** aprobó el plan en modo plan el 2026-11-10, sin cambios, tras pedir «hazme la propeusta» (sesión f742ba88, corrida auto-20261110-203937-355d).
- **Base:** versión 0.36.0, `main` en `ea5fde0`.

## 1. Las palabras del dueño

1. «194: necesitamos diseñar un buen sistema de escalada.»
2. «podemos quitar los putnos que yo di, eran mas una sugerencia para que te dieras una diea que una peticion, ademas recuerda que nostoros trabjamos con radar. buscamos esas 5 misiones»
3. «es que no estoy tan de acuerdo con lo intenro porque eso va a generar muchos cambios y va a ser difciol de mantener, hoy en dia ya tenemos la extension de codex y de muse y de cursor porque pago esas subcirpciones pero el dia que lo deje de pagar? nuestra uncia fuente de info vaa ser artifial analysys»
4. «vamos primero a trabajar con modelos de claude y despues lo después lo replicamos para otros harnes pero aquí lo importante es diseñar primero cómo podemos hacer este puntaje interno para que nosotros sepamos que modelo es apto para cada tarea sin afectar lo que la calidad porque o sea nosotros seguimos una escalera de calidad donde seguimos jaikus o medio pus porque sabemos que cada modelo que continúa tiene una mejor calidad de trabajo.»
5. «leelo directamente en la pagina no uses la api gratuita la pagina tiene mas info https://artificialanalysis.ai/models»
6. «Es que eso que dices esta bien estoy de acuerdo, pero como lo trasladamos como ley o puntaje o regla o benchmark para nuestero proyecto. me imagino algo asi "Si artifiail analñysys dice que en costo tarea bla bla escoger este para los 5 escalones.". No se si me explico y que sean reglas replicables por harness»
7. «frontera de pareto me agrada. A ver entonces como se aplica para el swarm y para los delegados que tenemos? como aseguramos su replciacion con el tiempo por si sale opus 5.6 antes que sonnet 5.6 o viceversa»
8. «como resolvemos tambien lo de los supervisores y cuantos de los issues que tenemos resovleria o ayudaria esto»
9. «La cuota que se termina antes sigue siendo primero»
10. «Favor 5.2 se queda fuera por el momento porque aplica solamente para las cuentas Max y Ultra de Cloud Code» (mensaje dictado: habla de Fable 5.2 y de Claude Code)
11. «Mira necesito que vayas delegando el arreglo y nossotros vamos conversando, decidimos delgas y cotninuamos con el sisgueinte»

## 2. Lo que el dueño confirmó

**El problema.** Una tarea delegada o una unidad del enjambre que sale mal se repite en el mismo modelo: hasta 5 correcciones en Haiku, 2 en Sonnet y 1 en Opus (`config/ladder.json`). En 359 tareas reales la escalera nunca subió sola: las 9 subidas las declaró el Lead a mano (#194). Los escalones están escritos a mano y nada revisa si siguen siendo buena elección. La API vieja de Artificial Analysis se retiró el 2026-11-04 y el script que refresca las cifras recibe 410 (#233).

**La decisión.** No hay puntaje interno ni historial propio que decida: la única fuente son las cifras de Artificial Analysis, sin mezclarlas en un número (palabras 2 y 3). La escalera deja de escribirse a mano y **se calcula** de esas cifras con reglas fijas, la frontera de Pareto de calidad y costo (palabras 6 y 7). El dueño llamó a esto «frontera de pareto».

**La ley, para Claude, que es el patrón:**

1. **Candidatos:** de cada modelo de Claude en uso, solo los esfuerzos `high` y `xhigh`.
2. **Descarte:** sale el candidato al que otro modelo de Claude, con cualquier esfuerzo, iguala o supera por menos costo por tarea, en la cifra de código o en la de inteligencia.
3. **Orden:** los que quedan, de menor a mayor calidad, son los escalones. Cada escalón sube en las dos cifras.
4. **Subida:** un intento por escalón. Si falla, el siguiente intento va al escalón siguiente sin que nadie lo decida. Tras el último, la tarea queda agotada y se difiere, como hoy.
5. **Freno:** si se repite una causa que ningún modelo puede arreglar (un plan malo, una prueba que la tarea no puede tocar), la tarea se bloquea y no sube. Es el freno que ya existe y se conserva.
6. **Supervisor:** quien revisa nunca es más débil que quien hizo el trabajo.

**Lo que la ley da con las cifras del 2026-11-10** (sección 6):

1. Haiku `high` → 2. Haiku `xhigh` → 3. Sonnet `high` → 4. Opus `high` → 5. Opus `xhigh`

La regla 2 saca a Sonnet `xhigh`: Opus `high` da más inteligencia por menos costo por tarea.

**Supervisor del enjambre según el escalón del autor:** escalones 1 y 2, Sonnet `high`, igual que hoy; escalón 3, Opus `high`; escalones 4 y 5, Opus `xhigh`.

**Se aplica igual a los delegados y al enjambre** (palabra 7): los dos leen ya la misma escalera con la misma función.

**Se mantiene en el tiempo** (palabra 7): cuando sale un modelo nuevo, entra a la tabla con sus cifras, la generación anterior de esa línea sale, y las mismas reglas recalculan la escalera, que puede quedar con más o menos escalones. El sistema avisa del cambio y el dueño lo aprueba; la escalera nunca cambia sola. Mientras Artificial Analysis no publique las cifras de un modelo, ese modelo no entra.

## 3. Criterios

1. **La escalera sale de la ley.** Con la tabla de hoy, la ley da exactamente los cinco escalones de la sección 2, y algo falla de forma visible cuando la escalera guardada no coincide con lo que da la ley sobre la tabla. Por qué: «como lo trasladamos como ley [...] para nuestero proyecto» (6).
2. **Sube sola.** Un delegado y una unidad del enjambre que fallan suben un escalón por intento sin intervención del Lead; son tantos intentos como escalones (cinco hoy) y al agotarse quedan diferidos. Por qué: «necesitamos diseñar un buen sistema de escalada» (1) y «cada modelo que continúa tiene una mejor calidad de trabajo» (4).
3. **Subir no tapa un plan malo.** Una causa repetida que no depende del modelo bloquea la tarea en vez de subirla. Por qué: «sin afectar lo que la calidad» (4); una unidad que falla por una prueba que no puede tocar no debe gastar los escalones caros (#188, #208).
4. **El supervisor no es más débil que el autor.** El supervisor del enjambre corre en el nivel que dice la sección 2 para cada escalón. Por qué: «como resolvemos tambien lo de los supervisores» (8).
5. **Las cifras se pueden volver a leer.** El refresco de la tabla vuelve a funcionar contra Artificial Analysis, guarda para cada modelo con esfuerzo la cifra de código con el costo y el tiempo de una tarea de código, y al terminar muestra la escalera recalculada y si cambió. No la cambia solo. Por qué: «nuestra uncia fuente de info vaa ser artifial analysys» (3) y «la pagina tiene mas info» (5).
6. **Ningún nombre de modelo escrito a mano decide.** Con una tabla de ejemplo en la que sale un Opus nuevo antes que el Sonnet nuevo, y con otra al revés, la escalera se recalcula sin tocar código. Por qué: «por si sale opus 5.6 antes que sonnet 5.6 o viceversa» (7).
7. **El texto dice lo que hace el código.** Las reglas del Lead, la guía de delegados, las decisiones y el changelog describen la ley y la escalera nueva, y la comprobación completa del repositorio pasa. Por qué: es la regla de trabajo del proyecto, y el Lead actúa por lo que lee.

## 4. Lo que queda fuera

- **Los otros harness (parte 2, otra tarjeta):** el equivalente de cada escalón en Codex, Grok, Gemini y Muse por la cifra de código o de inteligencia, la regla del modelo repetido, los asientos de diseño y el cierre de #195. Hasta entonces los otros harness se eligen como hoy, por los puntos de inteligencia del par de referencia del escalón (palabra 4: «primero [...] claude y despues [...] otros harnes»).
- **Un puntaje interno o el historial propio como criterio.** El registro de delegados sigue como está, para los informes (palabras 2 y 3).
- **El orden entre harness.** La cuota que se renueva antes sigue primero (palabra 9).
- **Fable 5.2.** Sigue fuera (palabra 10). Su precio en la tabla de precios es #205.
- **El modelo de arranque del Lead** (#234) y los modelos de los demás agentes fijos, salvo el supervisor.
- **El veredicto de las tareas de solo lectura** (#193) y el revisor de las ediciones hechas en Claude (#196).
- **Publicar una versión.** La fusión a `main`, la subida y la versión esperan el sí del dueño.

## 5. Supuestos que el dueño aprobó con el plan

1. Esta corrida es solo la parte 1.
2. Regla 1: solo cuentan `high` y `xhigh`. Es lo que hace que la ley dé la escalera de hoy más Opus `xhigh`.
3. Regla 2: se exige ser buena compra en las dos cifras, código e inteligencia.
4. Salto mínimo de 2 puntos entre escalones, como dato que el dueño puede cambiar, para que un modelo nuevo no deje dos escalones casi iguales. Con las cifras de hoy no quita ninguno: el salto menor es de 3,0 puntos de código, de Opus `high` a Opus `xhigh`.
5. La escalera nunca cambia sola: al refrescar las cifras el sistema avisa y el dueño aprueba.
6. Se conservan el veredicto `infeasible` del Lead y el freno por causa repetida. Salen el contador de correcciones por modelo y la subida por hallazgos repetidos, que en 359 tareas nunca actuaron.
7. Las lecturas siguen la misma escalera que las ediciones.
8. El refresco lee las páginas de modelo de Artificial Analysis, una petición por página y con pausa, cuando el dueño lo pida.
9. No se publica versión en esta corrida.

## 6. Hechos y evidencia

**Cifras de Claude 5.5**, leídas el 2026-11-10 de las páginas de modelo de Artificial Analysis (`https://artificialanalysis.ai/models/<slug>`), con `.claude/skills/artificial-analysis/aa-extract.js`. El extracto completo está en `specs/032-pareto-ladder/evidence/aa-pages-claude-2026-11-10.json`; el de los otros harness, para la parte 2, en `evidence/aa-pages-other-harnesses-2026-11-10.json`. Código es Terminal-Bench 4.0.

| Par | Inteligencia | US$ por tarea | Min por tarea | Código | US$ por tarea de código | Min por tarea de código |
|---|---|---|---|---|---|---|
| Haiku `low` | 18,6 | 0,044 | 2,1 | 12,6 % | 0,119 | 5,4 |
| Haiku `medium` | 24,6 | 0,092 | 3,9 | 15,2 % | 0,194 | 7,9 |
| Haiku `high` | 29,9 | 0,159 | 6,4 | 21,7 % | 0,331 | 12,1 |
| Haiku `xhigh` | 34,6 | 0,248 | 9,6 | 29,3 % | 0,460 | 16,3 |
| Haiku `max` | 36,5 | 0,411 | 14,8 | 32,8 % | 0,652 | 22,7 |
| Sonnet `low` | 25,6 | 0,511 | 2,5 | 20,7 % | 1,285 | 4,8 |
| Sonnet `medium` | 30,8 | 0,781 | 3,7 | 29,8 % | 1,578 | 6,2 |
| Sonnet `high` | 41,5 | 1,636 | 6,9 | 43,9 % | 2,186 | 9,1 |
| Sonnet `xhigh` | 49,9 | 4,092 | 14,7 | 57,1 % | 6,078 | 23,0 |
| Sonnet `max` | 54,5 | 10,021 | 31,0 | 63,6 % | 12,646 | 41,5 |
| Opus `low` | 34,8 | 0,976 | 2,9 | 31,3 % | 2,078 | 5,8 |
| Opus `medium` | 48,2 | 2,451 | 7,1 | 52,5 % | 4,043 | 12,2 |
| Opus `high` | 51,8 | 3,465 | 9,6 | 56,6 % | 5,119 | 15,9 |
| Opus `xhigh` | 57,4 | 6,047 | 15,9 | 59,6 % | 8,778 | 26,0 |
| Opus `max` | 59,1 | 10,036 | 24,7 | 59,6 % | 13,109 | 36,1 |

- Cuestan más sin dar más inteligencia que otro par: Sonnet `low`, `medium`, `xhigh` y `max`, y Opus `low`.
- Cuestan más sin dar más en código que otro par: Sonnet `low` y `medium`, Opus `low` y Opus `max`.
- Candidatos de la regla 1: seis. La regla 2 saca solo a Sonnet `xhigh`.

**Artificial Analysis hoy** (comprobado el 2026-11-10, detalle en #233):

- La dirección `/api/v2/data/llms/models` contesta 410 desde el 2026-11-04. La gratuita nueva es `/api/v2/language/models/free`, con la misma clave y la cabecera `x-api-key`, paginada (`?page=N`, 200 por página, 734 modelos) y con `x-ratelimit-limit: 100`.
- La gratuita da el índice de inteligencia, el costo por tarea (`artificial_analysis_intelligence_index_cost.cost_per_task.total_cost`), los precios y la velocidad. No da la cifra de código: `artificial_analysis_coding_index` viene en `null` en los 734 modelos y Terminal-Bench no viene.
- Las páginas de modelo sí traen Terminal-Bench 4.0 con el costo y el tiempo de una tarea, y el tiempo por tarea del índice. Cada página trae completo su propio modelo y los que el sitio muestra por defecto.

**El código hoy (0.36.0):**

- `plugins/aether/config/ladder.json`: tres escalones por nombre de modelo (`haiku` 5 correcciones con esfuerzo `high` y `xhigh` al corregir, `sonnet` 2, `opus` 1), `repeatFindings: 2`, `repeatBlocked: 2`.
- `plugins/aether/lib/ladder.js`: la política, función pura sobre ese archivo. La usan los delegados (`lib/delegate-task.js`) y el enjambre (`lib/wt-ladder.js`).
- `plugins/aether/workflows/run.workflow.js:24`: `const TIERS = ['haiku', 'sonnet', 'opus']`, una lista fija de nombres.
- `plugins/aether/agents/supervisor.md`: `model: sonnet`, `effort: high`, fijo sea cual sea el escalón del autor.
- `plugins/aether/config/pairs.json`: por par, `intelligence`, `costPerTaskUsd`, `outputTokensPerSecond` y `timeToFirstTokenS`; no tiene cifra de código.
- `plugins/aether/lib/superdelegation.js`: ya descarta, dentro de una cuota, el par al que otro iguala en puntos por menos costo.
- `scripts/refresh-lanes.js:18` y `.claude/skills/artificial-analysis/aa-api.js:16`: la dirección retirada.

**Del registro real** (#194, 359 tareas del 2026-10-23 al 2026-11-07): de las aprobadas, 244 necesitaron un intento, 51 dos, 11 tres y 2 cuatro; 9 subidas, todas por `infeasible`; ninguna por correcciones agotadas ni por hallazgos repetidos.

## 7. Preguntas aclaratorias

No quedó ninguna abierta. Lo que se conversó y decidió está en las secciones 2, 4 y 5, con las palabras del dueño de la sección 1.
