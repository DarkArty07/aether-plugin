# Evidencia medida con modelos reales: el replay pagado y seis sesiones del Lead

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

- Un delegado real en agy (su grupo Gemini tiene la marca de agotado del enjambre hasta 2026-10-22 y su grupo Claude no sirve ningún nivel).
- El fallo real de un delegado externo en una sesión real (cuota, límite de tiempo): el respaldo a Claude se probó con harness simulados.
- Semanas de uso: si el peldaño más barato hace el trabajo igual de bien. Es lo que `advise` y `command` muestran, delegación por delegación, en `aether-report --delegates`.

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

`replay-summary.json` guarda los totales de los dos replays y el acuerdo. Las salidas completas (`haiku-full.json`, `jev-full.json`) llevan el título de cada delegación del dueño y no se guardan en el repositorio.
