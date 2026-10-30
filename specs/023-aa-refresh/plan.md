# Plan: la tabla de modelos sigue las cifras nuevas de AA (0.28.0)

**Spec:** [spec.md](spec.md)

## Decisiones

- **D1. Dónde.** Rama `feat/aa-refresh` en `.worktrees/aa-refresh`, a partir de `main` con los archivos de AA ya commiteados.
- **D2. Lo que la regla elige sobre la tabla nueva** (todas las cuotas abiertas con el mismo reinicio; con Codex solo da lo mismo, porque Codex es lo más barato). Medido con `choose()` sobre la tabla del commit e73cf6c:

| Pedido | Puntos | Antes (tabla mezclada) | Ahora |
|---|---|---|---|
| Haiku low | 18.6 | Terra low | Luna medium (18.3, US$ 0.011) |
| Haiku medium | 24.6 | Terra medium | Terra low (29.2, US$ 0.032) |
| **Haiku high** | 29.6 | Terra medium | **Terra low** (29.2, US$ 0.032) |
| **Haiku xhigh** | 34.3 | Terra high | **Terra medium** (38.1, US$ 0.058) |
| Haiku max | 36.2 | Sol medium | Terra medium (38.1, US$ 0.058) |
| Sonnet low | 25.3 | Terra medium | Terra low (29.2, US$ 0.032) |
| Sonnet medium | 30.3 | Terra high | Terra medium (38.1, US$ 0.058) |
| **Sonnet high** | 41.1 | Sol medium | **Terra high** (42.3, US$ 0.108) |
| Sonnet xhigh | 49.6 | Terra max | Sol high (50.2, US$ 0.216) |
| Sonnet max | 54.2 | nativo | Sol max (54.5, US$ 0.724) |
| Opus low | 34.5 | Terra high | Terra medium (38.1, US$ 0.058) |
| Opus medium | 48.1 | Sol high | Sol high (50.2, US$ 0.216) |
| **Opus high** | 51.7 | Sol max | **Terra max** (51.0, US$ 0.362) |
| Opus xhigh | 57 | nativo | nativo |
| Opus max | 58.4 | nativo | nativo |

  Los cuatro escalones que el dueño aprobó el 2026-10-29 (en negrita) se mueven: Sol sale de los cuatro y Terra los cubre todos. Es la consecuencia directa de poner todas las filas en una escala; no se fija a mano ninguno.
- **D3. Las estimaciones de Muse Spark** (R2): promedio de las dos curvas, Haiku 0.49 / 0.62 / 0.79 / 0.93 y Sonnet, de su máximo. Ninguna cambia una elección, porque cuestan de 0.19 a 1.1 por tarea contra 0.03 de Terra.
- **D4. Los costos por tarea no se tocan.** La API de AA no los da y leer sus páginas necesita el sí del dueño (`docs/reference/artificial-analysis.md`). Son los del 2026-10-26; que el re-puntaje no los moviera es un supuesto.
- **D5. Hecho antes del enjambre, por el Lead:** R1, R2, R3 y R7, en un commit (e73cf6c). Las 53 pruebas en rojo que eso deja son el trabajo del enjambre.
- **D6. Sin Juez ni Examinador.** El diseño completo consume la cuota de Claude (Opus nativo) y esta spec no decide nada nuevo: la regla y la tabla ya existen. La revisión independiente es la revisión final del enjambre.

## Reparto de las 53 pruebas en rojo

| Tarea | Archivos de prueba | En rojo |
|---|---|---|
| 1 | `pairs`, `lanes`, `copies-muse`, `muse-spark`, `models-index`, `codex-models` | 12 |
| 2 | `codex-pairs`, `codex-lanes`, `codex-lane` | 7 |
| 3 | `seats` | 12 |
| 4 | `seat-calls`, `seats-design`, `seat-partial`, `exam` | 8 |
| 5 | `superdelegation`, `lane-pick`, `lane-pick-slow`, `lane-refusal` | 14 |
| 6 | las pruebas de documentación (hoy en verde) y tres guías | 0 |

Ninguna tarea toca `tests/helpers.js`, `tests/lane-fixtures.js` ni `tests/plan-fixtures.js`: son genéricos y no fijan cifras.

## Riesgos

- **Terra decide los cuatro escalones y su costo es un supuesto** (A-P6: gasta los tokens de Sol a la mitad del precio de salida). Si la gráfica de AA del dueño dice otra cosa, cambia un dato y los escalones se recalculan.
- **Terminal-Bench.** Terra low rinde 15.2 % contra 21.7 % de Haiku high. La regla no lo mira (A65); queda como propuesta y se dice en el informe.
- **Pruebas que cambian de premisa.** Con la escala nueva Luna alcanza a Haiku low (Luna medium, 18.3), así que «Luna nunca gana» deja de ser cierto; la tarea 2 lo reescribe.
- **Mi error de la corrida anterior:** las pruebas sin dueño. Aquí cada archivo en rojo tiene una tarea, y el gate ya no pierde los fallos conocidos (#134).
