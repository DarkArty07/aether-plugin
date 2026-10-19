# Evidencia: los pares modelo y effort según Artificial Analysis

Leído el 2026-10-19 por el Lead. La inteligencia, la velocidad y el primer token salen de la API; el costo por tarea y los tokens del índice, del texto de la página de cada modelo, porque la API no los da (sus 706 modelos traen solo inteligencia, terminal-bench, precio por token, velocidad y primer token). Datos completos: [aa-pairs-2026-10-19.json](aa-pairs-2026-10-19.json).

El índice de tiempo es tokens del índice (M) entre velocidad: compara pares, no son segundos.

| Par | Harness | Inteligencia | US$ por tarea | Tokens del índice (M) | Índice de tiempo |
|---|---|---:|---:|---:|---:|
| Claude Haiku 5.5 (Low) | claude | 29.5 | 0.02 | 32 | 0.22 |
| Claude Haiku 5.5 (Medium) | claude | 34.5 | 0.05 | 54 | 0.35 |
| Claude Haiku 5.5 (High) | claude | 37.8 | 0.08 | 97 | 0.59 |
| Claude Haiku 5.5 (Xhigh) | claude | 41.2 | 0.12 | 180 | 0.93 |
| Claude Haiku 5.5 (Max) | claude | 43.4 | 0.21 | 440 | 1.84 |
| Claude Sonnet 5.5 (Low) | claude | 35.9 | 0.35 | 23 | 0.25 |
| Claude Sonnet 5.5 (Medium) | claude | 40.8 | 0.48 | 31 | 0.34 |
| Claude Sonnet 5.5 (High) | claude | 46.8 | 0.88 | 52 | 0.53 |
| Claude Sonnet 5.5 (Xhigh) | claude | 51.9 | 2.01 | 110 | 1.13 |
| Claude Sonnet 5.5 (Max) | claude | 56 | 5.46 | 420 | 3.06 |
| Claude Opus 5.5 (Low) | claude | 42.3 | 0.55 | 20 | 0.27 |
| Claude Opus 5.5 (Medium) | claude | 51.2 | 1.34 | 38 | 0.52 |
| Claude Opus 5.5 (High) | claude | 53.6 | 1.82 | 53 | 0.72 |
| Claude Opus 5.5 (Xhigh) | claude | 56 | 3.46 | 100 | 1.31 |
| Claude Opus 5.5 (Max) | claude | 57.6 | 5.98 | 260 | 2.71 |
| Gemini 4 Argon (High) | agy | 52.6 | 1.99 | 110 | 1.36 |
| Gemini 3.8 Flash (Low) | agy | 33.5 | – | – | – |
| Gemini 3.8 Flash (Medium) | agy | 39.8 | 0.93 | 95 | – |
| Gemini 3.8 Flash (High) | agy | 40.9 | 1.24 | 170 | 1.21 |
| Grok 4.7 (Low) | grok | 42.2 | 1.25 | 75 | 1.23 |
| Grok 4.7 (High) | grok | 46.3 | 2.73 | 200 | 2.71 |
| Grok 4.7 (Xhigh) | grok | 46.4 | 3.74 | 240 | 3.32 |

Lo que muestran, en el costo por tarea:
- Un mismo modelo vale distinto en cada effort: Sonnet va de 35.9 a 56 puntos, y de US$ 0.35 a 5.46 por tarea.
- El precio por token engaña: Opus `high` (53.6, US$ 1.82, 53M tokens) cuesta menos por tarea que Sonnet `xhigh` (51.9, US$ 2.01, 110M tokens).
- Dentro de un mismo modelo hay pares que no aportan: Grok `xhigh` (46.4, US$ 3.74) da lo mismo que Grok `high` (46.3, US$ 2.73).
- Faltan el costo de Gemini 3.8 Flash `low` y la velocidad de Flash `medium`: Artificial Analysis no los publica.
