# Evidencia de la spec 038

Leída el 2026-11-13.

## `aa-extract-2026-11-13.json`

Todos los campos de 13 páginas de Artificial Analysis (`https://artificialanalysis.ai/models/<slug>`), leídas una vez cada una con `.claude/skills/artificial-analysis/aa-extract.js`: 13 peticiones, ninguna fallida, y en las 13 el bloque leído es el del propio modelo.

Inteligencia, Terminal-Bench 4.0 y costo por tarea del índice (US$):

| Dirección | Inteligencia | Terminal-Bench 4.0 | US$/tarea |
|---|---|---|---|
| `claude-haiku-5-5-high` | 29,9 | 21,7 % | 0,159 |
| `claude-haiku-5-5-xhigh` | 34,6 | 29,3 % | 0,248 |
| `claude-sonnet-5-5-high` | 41,5 | 43,9 % | 1,636 |
| `claude-opus-5-5-high` | 51,8 | 56,6 % | 3,465 |
| `claude-opus-5-5-xhigh` | 57,4 | 59,6 % | 6,047 |
| `gemini-4-hydrogen-low` | 26,9 | 6,6 % | 0,292 |
| `gemini-4-hydrogen-medium` | 41,2 | 29,3 % | 0,798 |
| `gemini-4-hydrogen-high` | 50,8 | 54,0 % | 1,873 |
| `gemini-4-hydrogen` (xhigh) | 53,9 | 53,5 % | 3,160 |
| `gemini-3-8-flash-medium` | 30,1 | 19,7 % | 6,259 |
| `gemini-3-8-flash` (high) | 30,8 | 19,7 % | 7,766 |
| `gemini-4-argon-medium` | 47,6 | 55,1 % | 4,315 |
| `gemini-4-argon` (high) | 50,4 | 57,1 % | 4,973 |

El costo por tarea de esta tabla se leyó el mismo día en la lista gratis de la API, antes de que el dueño decidiera retirarla; el JSON trae el de la página en `objects.intelligenceIndexCostPerTask`.

AA-Briefcase (Elo y rúbricas aprobadas): Hydrogen high 1497 y 52,4 %; Hydrogen xhigh 1567 y 56,0 %; Argon high 1484 y 64,6 %; Sonnet high 1634 y 60,2 %; Opus high 1682 y 58,9 %.

## agy 1.5.8

`agy models` lista: `gemini-4-argon-medium`, `gemini-4-argon-high`, `gemini-4-argon-low`, `gemini-4-hydrogen-high`, `gemini-4-hydrogen-xhigh`, `gemini-4-hydrogen-medium`, `gemini-4-hydrogen-low`, `gemini-pro-orchestrator-g1-pro`, `gemini-3.8-flash-high`, `gemini-3.8-flash-medium`, `gemini-3.8-flash-low`, `claude-opus-5-5-low`, `claude-opus-5-5-medium`, `claude-opus-5-5-high`, `claude-sonnet-5-5-low`, `claude-sonnet-5-5-medium`, `claude-sonnet-5-5-high`, `gpt-oss-120b-medium`.

`aether-lane quota --json agy` informa dos grupos de cuota: «Gemini Models» (98,97 % libre en la ventana semanal, renueva el 2026-11-20) y «Claude and GPT models» (4,4 % libre, no usable).

Precio de Hydrogen en la lista: 1,5 y 7,5 dólares por millón de tokens de entrada y salida; lectura de caché 0,075. Fecha de salida: 2026-11-12.
