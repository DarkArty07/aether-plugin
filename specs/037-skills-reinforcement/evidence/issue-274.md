# #274 Las skills de proyecto quedan fuera de .agents/skills cuando el Lead no carga aether:skills

Parte de #269.

## Qué pasa

Cuando el Lead crea una skill de proyecto sin cargar antes `aether:skills`, la deja fuera de `.agents/skills/`, contra la regla de la spec 030 (la copia real en `.agents/skills/` y un enlace en `.claude/skills/`).

## Evidencia (2026-11-13, 0.42.0)

- De 3 skills creadas, 2 quedaron como carpetas reales en `.claude/skills/` (2026-11-08 y 2026-11-09), en sesiones que no cargaron `aether:skills`. En uno de esos proyectos `.claude/skills/` ya existía antes de la 0.35.0.
- La única sesión que cargó `aether:skills` (2026-11-11 09:46:09 UTC) creó `diseno-de-juego` un minuto después en `.agents/skills/` con su enlace en `.claude/skills/`: el procedimiento funciona cuando se carga.
- `lib/skill-review.js` revisa tamaño, nombre, descripción y duplicados (R32), no el lugar.

## Arreglo propuesto

La revisión que ya corre tras crear o cambiar una skill avisa al Lead (sin bloquear) cuando una skill de proyecto es una carpeta real fuera de `.agents/skills/`, y cuando no se cargó `aether:skills` en la sesión, con lo que debe hacer.

