# Evidencia medida para el diseño del router de delegados

Medida el 2026-10-15 (hora local) con Claude Code 2.1.301, `typesafe/jev-1.14-20261014` y los registros de la máquina del dueño. **No es parte de los criterios de la tarjeta:** es lo que el diseño puede dar por cierto, cómo se midió y qué falta. Las sondas (`probes/`) y el arnés de replay (`replay/`) la reproducen; no llevan datos ni llaves.

## 1. Lo que el motor permite (sondas, modelo falso, sin llamadas pagadas)

Un plugin desechable con un mod de cuatro ganchos, una sesión `claude -p` por caso, `HOME` y `CLAUDE_CONFIG_DIR` aislados y el modelo falso de `tests/fixtures/fake-model.js`, que registra el modelo y el esfuerzo de cada petición. `probes/run-probe.sh <modo>` repite cada fila.

| Pregunta | Resultado |
|---|---|
| ¿Qué ve el mod cuando el Lead lanza un delegado? | El gancho `tool.call` de `Agent` ve `description`, `prompt`, `subagent_type`, `model`, `effort` y `run_in_background`. `agent.spawn` ve `model` y `parentModel`, **pero no `effort`**. Orden: `tool.call`, `agent.spawn`, `turn.step`. |
| ¿Hereda el delegado el modelo del Lead si no se le pasa? | **Sí.** Sin `model` corrió en el modelo del padre (Opus en la sonda). Sin `effort`, en el esfuerzo de la sesión. |
| ¿Se puede reescribir `model`? | Sí, en `tool.call` y en `agent.spawn`, con el modelo explícito (pidió `sonnet`, corrió `haiku`) y con el modelo ausente. |
| ¿Se puede reescribir `effort`? | **Sí en `tool.call`** (pidió `sonnet xhigh`, corrió `haiku low`). **En `agent.spawn` se ignora sin error.** Un tipo de agente con `effort` fijo no gana al `effort` explícito de la llamada. |
| ¿Se puede avisar al Lead? | Sí. Un `context` devuelto por `tool.call` llega a la siguiente petición del Lead, con lanzamientos en primer y en segundo plano. Un `deny` con motivo llega como error de la herramienta y no arranca ningún subagente. |
| ¿Se puede contestar un delegado sin llamar a un modelo? | Sí. Contestando su primer `turn.step`, el delegado no hace ninguna petición al modelo y su texto vuelve al Lead como resultado del `Agent` (el mismo mecanismo que ya usa `aether:ops`). Si el mod no contesta, el delegado corre normal: el fallback nativo es gratis. |
| ¿Qué puede hacer el gancho por sí mismo? | `$.model.complete({ model: 'haiku', effort: 'low' })` (la petición salió con ese modelo y esfuerzo y volvió el texto), `$.http.fetch` (probado contra loopback), `$.fs.read` de una ruta absoluta fuera del plugin y `$.process.run`. |
| ¿Sigue vivo lo que el gancho inicia y no espera? | **Sí.** Con el gancho ya devuelto, un `$.clock.sleep` de 2.5 s escribió su archivo (2507 ms después) y un `$.model.complete` de Haiku bajo lanzado así salió al modelo y escribió su resultado. Modo `background` de las sondas; sostiene el modo «registra», que decide en segundo plano. |
| **No cubierto** | Lanzamientos en paralelo; `isolation: "worktree"`; un modelo real; que `tool.call` no se dispare para los agentes de un workflow (el tipo de `agent.spawn` dice que el contenido de un agente de workflow no es reescribible). |

## 2. La historia de delegaciones (replay con Jev)

232 delegaciones de cinco proyectos de trabajo (2026-10-05 a 10-16); 200 enrutables (no son agentes `aether:*`); costo real $480.70: 44 % escrituras de caché, 28 % salida, 28 % lecturas de caché.

- **Herencia.** 110 de 200 no pasaron `model` y heredaron el del Lead: $296.16 (62 %); solo Opus heredado fueron 89 delegaciones y $255.68. Desde 2026-10-14 (A48), 61 de 64 pasan `model`. Pero **53 de las 90 con modelo explícito no pasan `effort`** y heredan el de la sesión.
- **Graders.** 98 tareas "Calificar entrevista" suman $254.64 (53 %), casi todas en Opus heredado, con 22 a 33 vueltas cada una.
- **Reparto del gasto.** El 10 % de las delegaciones es el 30 % del gasto; la mayor parte está en delegaciones de 20 a 50 vueltas ($218). Más de 100 vueltas: 22 delegaciones, $131.
- **Solo lectura** (`edits_files` < 0.5): 132 de 200 ($327); en el régimen de hoy, 23 de 64 ($35 de $118).
- **Replay.** Una política con autoridad asimétrica (sube libre, baja solo en clases seguras, nunca una compuerta de calidad) ahorra 18 %. **Un baseline sin clasificador ("nunca heredar Opus, Sonnet por defecto") ahorra 27 %.** Bajar a Haiku en el régimen de hoy vale ≈$1.9 de $118. El valor del decisor no está en bajar de modelo.

## 3. Jev 1.14 por OpenRouter

- **Llamada:** `POST https://openrouter.ai/api/v1/systemone`, `Authorization: Bearer <llave de OpenRouter>`, cuerpo nativo de TypeSafe `{ model: "typesafe/jev-1.14", state, questions }` (`choice`, `score`, `noul`). La respuesta trae `answers` (probabilidades y confianza), `usage.cost` y `model: typesafe/jev-1.14-20261014`. No se llama por chat completions. `typesafe/jev-1.14` no sale en `/api/v1/models` por defecto, sí con `?output_modalities=all`. También existe `/api/alpha/decisions`.
- **Precio y contexto:** $0.042/M de entrada, salida gratis, 262K.
- **Operación:** unas 520 llamadas, 0 fallos, mediana 0.29 s (p90 0.37 s, máx 1.1 s), ≈$0.00008 por clasificar un brief de ~1K tokens con 7 preguntas.
- **Casi determinista:** el mismo brief tres veces dio `shape` .86–.90 y `stakes` 1.89–1.91.
- **La confianza sirve de compuerta:** un brief vago ("Thoughts?") dio confianza 0.20 en `stakes`; los claros dan ≥ 0.95. Con el rubric v1 la compuerta (`shape` < .5 o `stakes` < .4) dispara en 7 de 200.
- **Español:** baja la confianza de `shape` en categorías ambiguas (survey/explore: .90 en inglés, ≈.55 con confianza .48 en español); `stakes` no cambia; traducir el rubric no lo arregló.
- **El rubric se calibra contra briefs reales.** El v1 (`replay/q-v1.json`) detectó el brief legal de Asclepio (stakes 2.74, 78 % en el nivel 3; los otros siete, 2.0 a 2.3). Un v2 con las anclas reescritas lo destruyó (1.94, confianza 0.05). `has_exact_checks` formulada sobre el brief dispara (≈0.9) pero no distingue las tareas donde el Lead eligió Haiku de las de Sonnet.
- **`typesafe/jev-router` es otro producto** (elige modelo y esfuerzo y ejecuta la petición). Con el pool acotado a lo nuestro ignoró Haiku y Gemini 4 Argon (`models_ignored`), el mismo brief dio Flash medium u Opus high, tardó de 2 a 14 s con timeouts de más de 45 s y una vez devolvió el cuerpo vacío. No se usa.
- **La llave** se lee como la de Artificial Analysis (entorno o `.env` del directorio de datos), nunca del repositorio. El mod no hereda las variables que exporta SessionStart (F30 de `docs/claude-code-research.md`), por eso el `.env`.

## 4. Niveles y modelos por harness

Un nivel es la capacidad medida por Artificial Analysis (AA) para un modelo a un esfuerzo, no un nombre. AA intelligence / Terminal-Bench (TB) por peldaño, de `plugins/aether/config/models/models.json` (API de AA, 2026-10-15):

| Banda | AA intelligence / TB | Peldaños (salida $/M) |
|---|---|---|
| A | 29–36 / .10–.21 | haiku low y medium (0.5) · sonnet low (10) · gemini-3.8-flash low (3.75) |
| B | 38–43 / .16–.33 | haiku high, xhigh y max (0.5) · sonnet medium (10) · opus low (20) · gemini-3.8-flash medium y high · grok-4.7 low (6) |
| C | 46–54 / .25–.57 | sonnet high y xhigh (10) · opus medium y high (20) · gemini-4-argon high (10) · grok-4.7 high y xhigh (6, TB .25) |
| D | 56–58 / .59–.64 | sonnet max (10) · opus xhigh y max (20) |

- **Escalones entrelazados:** Haiku xhigh ≈ Sonnet medium ≈ Opus low. En esfuerzo, Opus gana casi todo de low a medium (+8.9 de intelligence) y de xhigh a max no gana TB; Sonnet sigue ganando hasta xhigh.
- **El eje importa.** `replaces` en `config/lanes.json` mide solo el eje de código: Grok 4.7 queda como "haiku" porque su TB (.258) está bajo Haiku xhigh (.293), pero su intelligence (46.4) iguala a Sonnet high (46.8). AA expone también `lcr`, `tau2`, `ifbench`, `hle`.
- **agy** (`agy models`, 13 ids, 2026-10-15): gemini-4-argon, gemini-3.8-flash, claude-opus-5-5 y claude-sonnet-5-5 en low, medium y high, y gpt-oss-120b medium (fuera de alcance). El `xhigh` de Aether se traduce a `high` por nombre (A21) y `max` es siempre nativo. **AA midió la API nativa de Claude, no lo que agy sirve bajo el mismo nombre.** Argon solo tiene `high` medido.
- **grok** (`grok models`, 2026-10-15): grok-4.7 (por defecto), grok-4.7-build-fast (sin cifras, no es lane), grok-4.6 y 4.5 (superados). Esfuerzos low a xhigh (la lista es la que usa Aether, no la que imprime el CLI); medium sin medir.
- **Fuera del índice, sin medir aquí:** codex (gpt-6.1-sol ≈ Sonnet por AA, a $2/$10; gpt-6-astra ≈ Opus, a $10/$50) y cursor.

## 5. Cuota

- **A49** (`docs/decisions.md`; `plugins/aether/lib/lane-order.js`): prioridad = parte restante de la ventana **más larga** (la semanal) ÷ horas hasta su reinicio (mínimo una hora); a igual prioridad, el reinicio más cercano; luego el orden de `harnesses`. Un grupo bajo la reserva (5 %) o con marca seca queda fuera. La regla literal "el que se renueva antes" difiere solo cuando la ventana próxima tiene poco saldo.
- **Lectura del 2026-10-15 21:32 (UTC-6)**, `aether-lane quota agy grok`:

| Grupo | Ventanas | Reinicia | Estado |
|---|---|---|---|
| agy · Gemini (Flash, Argon) | 5 h: 100 %, semanal: 100 % (lectura) | 5 h en 5 h | **fuera: marca seca, con razón** (las llamadas reales fueron rechazadas) |
| agy · Claude y GPT (Sonnet, Opus) | semanal: **0 %**, 5 h: ilegible | en 1.1 h | sin cuota |
| grok · Grok plan | semanal: 95 % | en 29.6 h | usable, prioridad 0.032 |

- **Hallazgo (corregido):** una marca seca del 2026-10-14 (confirmada, hasta 2026-10-17 22:08 UTC, en el directorio de datos de desarrollo `aether-inline`) se tomó primero por obsoleta, porque la lectura fresca decía 100 % en las dos ventanas. **Era al revés: la lectura miente.** Tres rondas reales del Judge del diseño (22:23, 22:25 y 22:27, con la release instalada y sin marca en su directorio de datos) llamaron a agy `gemini-4-argon` y las tres fueron rechazadas con `exit 3: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.` (después, 163h20m6s y 163h18m24s), mientras `aether-lane quota agy` marcaba 98–99 % libre en las ventanas de 5 h y semanal. `/usage` muestra el grupo; el rechazo habla de un límite individual que `/usage` no muestra, y su reinicio (≈6.8 días) no coincide con el de la lectura. Nadie reconoce ese mensaje: las llamadas de lane del swarm (`lane-calls.js`) juzgan la cuota por la lectura posterior o por un motivo que empiece con «quota: », y los asientos de diseño (`seat-calls.js`) no dejan marca. Las tres rondas reintentaron un grupo agotado y el directorio de datos de la release instalada sigue sin marcas. **La verdad sobre un grupo de agy es el rechazo de la llamada, y trae su propio reinicio.**
- Con el pool agy + grok, solo el nivel Haiku tiene dos grupos candidatos; Sonnet y Opus dependen del grupo Claude de agy (y de Argon, que hoy no es candidato fuera de los asientos de diseño).

## 6. Otros usos medidos (Propuestas, fuera del primer diseño)

- **Segunda capa del guard.** 57 comandos que etiquetó el Lead (31 peligrosos): las reglas de `aether-guard` detectan 14 (45 %) con 0 falsos positivos; reglas más Jev (`irreversible` ≥ 0.7), 28 con 0 falsos positivos; la clase de la `Choice` (p(none) ≤ 0.5), 31 con 2 falsos positivos (`rm -rf node_modules` y `./dist`). Para comandos conviene Haiku por defecto: no deben salir de la máquina.
- **Lint de planes.** Coincide con el Writer y el Judge en 55 % (22 de 40; 6 sin confianza); propone bajar 17 tareas porque faltan preguntas por criterio del Writer (concurrencia, seguridad, migraciones). Solo valdría subiendo.
- **Graders.** $255 en 98 tareas; hace falta un A/B (≈$10) antes de bajarlos.

## 7. Lo que falta o se espera ajustar

1. `aether-lane start` exige un `<run>`: un delegado en un lane necesita una llamada sin run (de solo lectura primero).
2. El rechazo explícito de cuota de agy, que nadie reconoce (sección 5): el router lo necesita para no reintentar un grupo agotado (R22b del spec).
3. `levels` de `config/lanes.json` pasa de traducir esfuerzos por nombre a hacerlo por puntaje de AA, y la tabla de reemplazos por eje.
4. Haiku low como decisor: solo se verificó que la llamada sale y vuelve; **su precisión no está medida** y su latencia tampoco en esta máquina: Artificial Analysis mide 3.84 s al primer token con esfuerzo bajo (6.69 s con medio).
5. Lanzamientos en paralelo, `isolation: "worktree"` y un modelo real (sección 1).
6. Fixtures de briefs reales con sus hechos esperados y una regresión de rubric (el replay las usa como base).
7. Una opción del plugin para el proveedor del decisor y la llave, y su fila en `docs/guide/options.md`.
