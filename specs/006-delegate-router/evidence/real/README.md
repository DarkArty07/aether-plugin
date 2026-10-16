# Evidencia medida con modelos reales: el replay pagado y dos rondas de sesiones del Lead

Medida el 2026-10-16 (hora local) con Claude Code 2.1.301, el plugin 0.12.0 instalado y el árbol de 0.12.1, Sonnet 5.5 como Lead, Haiku 5.5 y `typesafe/jev-1.14-20261014` como decisores, agy 1.4.0 y grok 1.0.60. El dueño aprobó el gasto de prueba («apruebo los gastos de prueba»), anotó su llave de OpenRouter en el `.env` del directorio de datos del plugin y pidió usar las sesiones reales. Esto cierra lo que `../README.md` §1 daba por «No cubierto» y lo que el diseño dejó para el dueño (C5, C8 y C11).

**Qué no es:** no hay una respuesta de referencia para saber si un decisor acierta. La exactitud que se mide aquí es el acuerdo entre los dos decisores y con lo que eligió el Lead. Los dólares son a precios de lista; el medidor de Aether cuenta cada petición una vez (la corrección del 2026-10-16 de `../README.md`).

## 1. El replay pagado sobre las delegaciones reales

375 delegaciones de 11 proyectos del dueño (30 sesiones tienen delegados que el router enrutaría); 48 son agentes `aether:*` (el router no los enruta) y 327 se decidieron. Ninguna se descartó por parecer un secreto. Se corrió con `aether-route replay --projects ~/.claude/projects --decider <haiku|jev> --paid`, una delegación tras otra.

| | Haiku bajo (`claude -p`) | Jev (OpenRouter) |
|---|---|---|
| Decididas | 317 de 327 | 327 de 327 |
| Cayeron al respaldo | 10 (4 ilegibles, 6 incoherentes) | 0 |
| Latencia de la llamada | mediana 2.1 s, p90 4.8 s, máx 13.5 s (la duración que reporta el CLI) | 0.5 a 0.9 s dentro de sesiones reales (mediana 0.29 s en la medida del diseño) |
| Costo de las llamadas | US$ 0.278 en 327 llamadas (US$ 0.00085 cada una, con el arranque de `claude -p`) | ≈ US$ 0.03 en total (US$ 0.00003 a 0.0001 cada una) |
| Tiempo del replay | 28 min | menos de 2 min |
| Nivel decidido (A, B, C, D) | 9, 85, 208, 15 | 6, 46, 256, 19 |
| Compuerta (`audit`, `evaluate`) | 152 | 168 |
| Confianza baja | 8 | 30 |
| Cambiarían lo que eligió el Lead | 233 de 317 (73.5 %) | 229 de 327 (70.0 %) |
| Costo de lo que corrió el Lead / al peldaño decidido | US$ 384.45 / US$ 265.04 en 247 con costo (31.1 % menos) | US$ 392.74 / US$ 294.46 en 255 con costo (25.0 % menos) |

- **Acuerdo entre los dos** en las 317 que ambos decidieron: mismo nivel en 232 (73.2 %), a lo más un nivel de distancia en 309 (97.5 %), mismo eje en 287 (90.5 %). De las 85 que difieren, Haiku queda más bajo en 68 y más alto en 17. La diferencia mayor es Haiku B contra Jev C en 53 casos.
- **Donde se alejan dos o más niveles (8 de 317):** tareas de revisar referencias que Haiku trata como auditoría con riesgo alto y Jev como búsqueda (A), una corrección de medicamentos que Jev sube a D por riesgo médico, y dos ediciones mecánicas que Jev lee como implementación de muchos pasos.
- **Lo que el Lead eligió** quedó igual en 84 de 317 (26.5 %) con Haiku y en 98 de 327 (30.0 %) con Jev.
- **El ahorro es del pasado, no una promesa:** supone que un peldaño más barato hace el mismo trabajo. Eso solo lo muestra `advise`, y luego `command`, en uso. De las seis delegaciones más caras, una cambia mucho: «Reescribir lore y misiones» (Opus `xhigh`, US$ 14.41) pasa a Sonnet `high` con Haiku y a Haiku `high` con Jev. Las otras cinco quedan en el mismo modelo con los dos decisores, por la compuerta o por el nivel C, salvo que Jev sube el esfuerzo de la redacción de un plan de Sonnet `xhigh` a `max`.

## 2. Seis sesiones reales del Lead

Cada una es un `claude -p --agent aether:lead` con el modelo y el login reales, en un repositorio git desechable de una librería pequeña y un directorio de datos desechable (la llave, por un enlace al `.env` real; nunca copiada). Lo que corrió se lee del medidor de uso del plugin (`usage/`), que registra el modelo y el esfuerzo de cada petición de cada agente, y lo que decidió el router, del registro `router/decisions.jsonl` y de `aether-report --delegates`. Los dólares del Lead son el `total_cost_usd` que reporta el CLI (incluye a sus delegados).

| | Plugin y modo | Qué lanzó el Lead | Qué corrió (medidor) | Espera del lanzamiento | Resultado |
|---|---|---|---|---|---|
| S0 | 0.12.0 instalado, `record`, Haiku | 1 delegado de lectura | Heredó Sonnet `low`, como lo mandó el Lead; el router anotó en segundo plano lo que habría elegido: Haiku `low`, nivel A (`lookup` 0.8) | 0: el decisor tardó 1.65 s en segundo plano | Respuesta correcta; US$ 0.159 |
| S1 | árbol, `command`, Haiku | 3 en paralelo en un mensaje: listar exportaciones, añadir `getWithRetry` con su prueba, auditar el manejo de errores | Haiku `high`, Haiku `high` y Sonnet `high` (la auditoría, por la compuerta) | 1.7 s, 4.7 s y 4.6 s (decisor 1.6 a 1.7 s; cuota 0, 3.0 y 3.0 s) | `npm test` pasó (4 pruebas); la auditoría halló 7 huecos; US$ 0.213 |
| S2 | árbol, `command`, Haiku | 2: un resumen y un delegado con `isolation: "worktree"` que añade 3 pruebas | Haiku `high` los dos | 1.7 s y 4.5 s | 6 de 6 pruebas en su propio worktree; el repositorio principal quedó intacto; US$ 0.120 |
| S3 | árbol, `command`, Haiku, `lanes` y `harnesses=grok` | 1 delegado de solo lectura | Grok 4.7 `low` en Grok real: 10.2 s, 32 539 tokens de entrada, 418 de salida | 1.9 s (la lectura de cuota estaba renovada; Grok la renueva en 0.7 s) | La respuesta de Grok llegó al Lead como la del agente; US$ 0.093 del Lead |
| S4 | árbol, `command`, Jev | 2: una con `run_in_background: true`, otra que edita | Haiku `high` los dos | 3.9 s (lectura; decisor 0.85 s) y 0.5 s (edita; decisor 0.49 s) | Los dos terminaron; el que edita añadió 2 pruebas y `npm test` pasó; US$ 0.119 |
| S5 | árbol, `advise`, Haiku | 1 delegado de lectura | Heredó lo del Lead | 4.7 s | El Lead recibió la nota «router: I would run this task on claude haiku high. Level B (general): shape explore (0.5); stakes 0; base B. The call runs as you sent it.»; US$ 0.141 |

Total de las seis, lo que cuenta el CLI: US$ 0.845.

**Lo que esto cierra de `../README.md` §1 («No cubierto»):** lanzamientos en paralelo (S1), `isolation: "worktree"` (S2), un modelo real (todas), el directorio en que el motor arranca el comando de un delegado externo (S3: Grok leyó los archivos del commit en su copia), un delegado en segundo plano con `command` (S4) y el orden `tool.call`, `agent.spawn` con varios delegados a la vez (cada `spawn` quedó con el agente de su descripción; el reporte les puso su costo).

## 3. Lo que apareció

- **Jev no podía decidir (arreglado en 0.12.1).** La primera llamada real dio `decider: unreadable`: una pregunta de sí o no trae solo la probabilidad, sin `confidence`, y el router la exigía. Las pruebas usaban una respuesta de Jev escrita a mano. Incidencia [024](../../../../docs/issues/024-jev-answers-to-yes-no-questions-have-no-confidence-and-every-jev-reply-was-unreadable.md), decisión A56.
- **`command` espera 3 s a una lectura de agy que tarda 5 s (abierta).** Cada decisión de solo lectura con la lectura de agy vencida espera todo el límite de cuota (3.002 a 3.004 s en las cuatro de S1, S2 y S4) y agy no puede servirla de todos modos. Con Grok la espera fue 0. Incidencia [025](../../../../docs/issues/025-command-waits-3-seconds-for-an-agy-reading-that-takes-5-and-agy-cannot-serve-the-task.md).
- **`record` lanza procesos.** Con `lanes` y agy activos (la configuración del dueño), cada decisión con la lectura vencida arrancó `agy -p /usage` en segundo plano (S0). No es una llamada a un modelo.
- **Grok no se usa solo.** La opción `harnesses` trae `agy` y la configuración del dueño no la cambia: Grok figuró «not-enabled» hasta que S3 puso `harnesses=grok`. Es la ventana semanal que se renueva primero (95 % libre, 17.8 h), así que por la regla del dueño sería la primera.
- **Las llamadas de Haiku del router no se miden.** Ni el medidor ni `aether-report --delegates` ven la llamada del decisor (`deciderCost` es nulo con Haiku); la de Jev sí trae su costo.
- **Una opción guardada gana al entorno.** En las sesiones con `--plugin-dir`, `lanes` quedó en `true` aunque se pasó `CLAUDE_PLUGIN_OPTION_LANES=false`: Claude Code usa lo que el dueño guardó en `pluginConfigs["aether@inline"]`.

## 4. Lo que sigue sin medirse

- Semanas de uso: si el peldaño más barato hace el trabajo igual de bien. Es lo que `advise` y `command` muestran, delegación por delegación, en `aether-report --delegates`.
- El fallo de un harness externo con el CLI real: la segunda ronda (§6) lo probó con un `grok` y un `agy` simulados que fallan o rechazan con la forma del real; ningún CLI real falló por sí solo.
- Un Lead que escribe la anulación a `low`: a `xhigh` lo hizo bien, a `low` no (§6).

## 5. Cómo repetirlo

```
# replay pagado, uno por decisor (clase paid-call). Jev lee la llave del entorno o del .env del directorio de datos
node plugins/aether/bin/aether-route replay --projects ~/.claude/projects --decider haiku --paid > haiku-full.json
AETHER_DATA_DIR=~/.claude/plugins/data/aether-aether-plugin node plugins/aether/bin/aether-route replay --projects ~/.claude/projects --decider jev --paid > jev-full.json
node compare.js haiku-full.json jev-full.json compare.json

# una sesión real; --plugin installed usa el plugin instalado; los prompts p-s0 a p-s4 son los de arriba
node real-session.js --tag s1 --plugin <árbol>/plugins/aether --options '{"router":"command","decider":"haiku"}' --prompt-file p-s1.txt --effort low --budget 3
node real-session.js --tag s3 --plugin <árbol>/plugins/aether --options '{"router":"command","lanes":"true","harnesses":"grok"}' --prewarm grok --prompt-file p-s3.txt
```

Los prompts `p-t*.txt` son los de §6 (`p-t13` necesita el agente de `agent-doc-checker.md` en `.claude/agents/` del repositorio de la prueba, y `p-t5b` va con los `shims/`). `inspect-world.js` imprime lo que hizo el router en un mundo desechable (lo llama `real-session.js` al terminar); `--key none|bad`, `--seed-lanes`, `--launcher` y `--env NOMBRE=valor` de `real-session.js` son de la segunda ronda, y `shims/` guarda el `grok` y el `agy` que fallan (se usan con `--env AETHER_LANES_CONFIG=<tabla con sus rutas>`). `replay-summary.json` guarda los totales de los dos replays y el acuerdo. Las salidas completas (`haiku-full.json`, `jev-full.json`) llevan el título de cada delegación del dueño y no se guardan en el repositorio.

## 6. Segunda ronda: fallos, anulación, la regla de cuota, agy real y una corrida completa (0.12.1 instalada)

Dieciocho sesiones más, todas con el plugin 0.12.1 instalado (la mayoría con el Lead en `low`; las del lanzador `aether-lead`, en `xhigh`, como las usa el dueño), US$ 4.68 en total según el CLI (la corrida completa, US$ 2.66), más cuatro llamadas de lanes a agy.

| Prueba | Qué se hizo | Resultado |
|---|---|---|
| T1a, T1b, T1c, T1d | `command` con el decisor roto: Jev sin llave, Jev con una llave rechazada, Haiku con un límite de 0.2 s, y Jev sin llave con `fallback=haiku:medium` | Respaldo en las cuatro: `decider: no-key`, `http`, `empty` (el motor no dijo «timeout») y `no-key`; el delegado corrió en Sonnet `high` (por defecto) o en Haiku `medium` (la opción); el lanzamiento no esperó más de 0.4 s |
| T2, T2x | Pedir al Lead que anule el router | A `low`, el Lead pasó `model` y `effort` sin la línea `ROUTER-OVERRIDE`, el router los reemplazó (Haiku `high`) y el Lead dijo al dueño que había corrido en `medium`. A `xhigh` escribió la línea con su razón, el router la registró (`applied: kept`, sin llamar al decisor) y corrió en Haiku `medium`. Arreglo de la nota en 0.12.2 (incidencia 026) |
| T3, T3b | `command` con agy y grok juntos | Con las marcas reales sembradas, agy-Gemini queda excluido por la marca aunque tiene 99.5 % de saldo, y gana Grok. Sin marcas, Grok es el rango 0 (95 %, se renueva en 16.8 h) y agy-Gemini el rango 1 (99.5 %, 155.9 h): la ventana semanal que se renueva primero. Los delegados corrieron en Grok real (16.8 s y 12.9 s) |
| T4 | Solo agy | Un delegado real en `gemini-3.8-flash` `medium`: 148 s, 149 mil tokens de entrada, 0.16 % del semanal. La respuesta llegó al Lead |
| T12 | Ocho decisiones a la vez con la lectura de agy vencida | Una renovación (`started`) y tres `running`: la cerradura funcionó. Cuatro decisiones esperaron los 3 s y fueron a Claude; cuatro encontraron la lectura renovada y fueron a agy `gemini-3.8-flash` `low`, y los cuatro terminaron ok en 13 a 19 s. Cada uno reporta 0.7 % del semanal gastado, pero cada llamada lee la ventana antes y después y las cuatro corrieron a la vez, así que cada una ve el gasto de las otras: ese 0.7 % es el de las cuatro juntas. Las ocho respuestas llegaron bien al Lead y el registro quedó íntegro |
| T5a | Un `grok` cuyo delegado falla (simulado) | Falla a los 171 ms; el delegado corrió en Claude Haiku `high`, el peldaño Claude del mismo nivel; sin marca (no es un rechazo de cuota) |
| T5c | Un `agy` que rechaza como el real (JSON con `error` por stdout, `exit 3`, «Resets in 2h10m»), con dos delegados seguidos | El primero fue a agy, recibió el rechazo, dejó la marca del router por 2 h 10 min y corrió en Claude. El segundo ni lo intentó: agy-Gemini «excluded (mark)» con 99.3 % de saldo. Una primera simulación puso el rechazo en stderr y el router no lo reconoció; el agy real lo da por stdout |
| T13 | Un agente con nombre propio y `model: opus` en su definición | El router decidió Sonnet `high` (compuerta de auditoría) y lo reemplazó; el agente corrió en Sonnet. De 382 delegaciones del historial del dueño, 29 son de agentes con nombre ajenos a Aether (US$ 1.33 de lo que se conoce) |
| T9 | El Lead corre `aether-route replay --paid` con `AETHER_IRREVERSIBLE=enforce` | La guarda lo clasificó `paid-call`, lo rechazó y lo anotó en `.aether/pending.jsonl`; el Lead lo informó sin rodearlo |
| T10, T7 | El lanzador `aether-lead -p` con el plugin instalado: «ok», y un pedido natural en español | Arranca sin errores (US$ 0.06). Ante el pedido de tres cosas en un repositorio de 32 líneas, el Lead las hizo él, sin subagentes («escribir un brief habría costado más»), con un informe que abre con Espera tu sí y Supuestos |
| T11, T6 | El examen oculto y el replay del registro | 15 de 15 sobre `main`. El replay del registro de tres sesiones reales no cambia nada, y con el criterio editado en una copia (`explore` a D, `implement` a A) mueve 2 de 3 delegaciones |

### La corrida completa (T8)

Un `aether-lead -p` en `xhigh` con el permiso «Trabaja por horas, no cuentes conmigo hasta acabar» y un tope de 1 hora y US$ 8, `router=command`, `seats=native`, y las marcas reales sembradas: tarjeta de intención, `/aether:design` (spec y plan, cada uno con una revisión y una aprobación del Juez, 9 min), el Examinador nativo (6 pruebas ocultas), `/aether:run` con dos tareas (4.8 min, 2 intentos, sin subidas), revisión final `ready` con un hallazgo menor, el examen 6 de 6, el informe de la corrida y el brief. Duró 14.6 min y quedó en `done`. Lo comprobé por mi cuenta: 22 de 22 pruebas en la rama de integración, `formatPercent(0.256)` da `"25.6%"`, `parseMoney("$1,234.50")` da `123450`, `pluralize(3, "person", "people")` da `"3 people"`, y el README tiene su sección. La fusión a `main` quedó esperando el visto bueno del dueño, como debe.

- **Costo:** el enjambre US$ 1.01 (nativo 0.46, lanes 0.55); la sesión US$ 2.80 a precio de lista. Las cuatro llamadas de lanes fueron a agy `claude-sonnet-5-5` y bajaron el semanal del grupo Claude de agy de 45.4 % a 32.9 %; la tarea 2 corrió nativa porque el grupo Gemini tenía la marca de agotado.
- **El router no se metió:** no hubo entradas en su registro (el Lead no lanzó delegados propios), y los agentes `aether:*` del diseño y del enjambre quedaron como estaban.
