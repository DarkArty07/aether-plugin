# Plan: el modelo y el esfuerzo de cada rol, lo más barato que alcance

**Spec:** [spec.md](spec.md). Este plan no repite sus criterios (C1 a C9), escenarios (E1 a E11) ni requisitos (R1 a R9): los cita. La justificación completa, con las cifras y sus fuentes, está en [design.md](design.md) (J1 a J7 y D1 a D8); este plan solo dice cómo se construye.

## Technical context

- **Stack.** Node.js 22, CommonJS, sin dependencias. Los bins son delgados y la lógica vive en `plugins/aether/lib/`. Las pruebas son `node --test "tests/*.test.js"` (`npm test`); las del mod (`.test.ts`) no se tocan.
- **Qué fija hoy un esfuerzo** (mapeado el 2026-10-26 por un explorador, con tres citas comprobadas): `config/ladder.json` y `EFFORT_KEY` de `lib/ladder.js` (la escalera de los delegados: una subida y una corrección usan el esfuerzo `retry` del escalón); `DEFAULT_EFFORT` y `DEFAULT_REVIEW` de `lib/plan.js`; `effortFor`, `ladderOutlook`, las cadenas del log de la escalada y `reviewPlan` de `workflows/run.workflow.js`; `reviewerReference` de `lib/lane-delegate.js`; el `effort` de `agents/*.md`; y el texto que lee el Writer en `agents/writer.md`, `skills/tasks/SKILL.md` y `speckit/commands/speckit.tasks.md`.
- **Las pruebas que fijan lo viejo** son las del diseño: `ladder`, `delegate-task`, `delegates-docs`, `plan`, `aether-plan`, `agents`, `speckit`, `lane-delegate`, `workflow*` y `docs-facts` (R12 y R15 nombran la última decisión y el primer `Version` del changelog).
- **El orden importa por una prueba compartida.** Cambiar `DEFAULT_EFFORT` rompe toda prueba del workflow cuya tarea no nombra su esfuerzo. Por eso la Tarea 2 (el swarm) hace que esas pruebas nombren el esfuerzo, y la Tarea 3 (el valor por defecto) va después y no toca el workflow.
- **No hay constitución** (`.specify/memory/constitution.md` no existe).

## Gate

- Nada especulativo. **Pasa.** Cada pieza sirve a un requisito: cuatro números o funciones (R1 a R5), la guía del Writer (R2, R5) y la documentación (R7, R8). No se añade ninguna opción, ningún bin ni ningún archivo de configuración.
- Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida. **Pasa**, con las dos piezas nuevas que la tabla de Complexity nombra.

## Design

El diseño aprobado es [design.md](design.md): D1 a D8. En orden de construcción:

1. **La escalera de los delegados (Tarea 1, R1).** Dos números de `config/ladder.json`, la tabla y una oración de `docs/guide/delegates.md`, y las cuatro afirmaciones de prueba que los fijan.
2. **El swarm (Tarea 2, R3, R4, R5).** `effortFor` con la regla de R3; las cadenas «`xhigh`» del log y de `ladderOutlook` calculadas con `effortFor`; `reviewPlan` sin la regla de la Review; `reviewerReference('opus')` en `high`; `agents/supervisor.md`. Las pruebas del workflow nombran el esfuerzo de cada tarea, y se reescriben las expectativas que cambian.
3. **El valor por defecto (Tarea 3, R2).** `DEFAULT_EFFORT` y el `effort` de `implementer.md`, con sus pruebas.
4. **La guía del Writer (Tarea 4, R2, R5).** El texto exacto que da la tarea, en los tres archivos que el Writer lee, con una prueba.
5. **La página de la guía (Tarea 5, R7, R8).** Una página con tablas que una prueba compara con `ladder.json`, `DEFAULT_EFFORT` y `agents/*.md`.
6. **La decisión y las pruebas de documentos (Tarea 6, R7).** A93 y las notas de A18, A36 y A87; `docs/index.md` pasa a «A1–A93»; `docs-facts` sigue la última decisión.
7. **Las páginas corregidas y el changelog (Tarea 7, R7).** Metodología, roadmap, propósito y una entrada «Unreleased».

## Files

- **Datos y código:** `plugins/aether/config/ladder.json`; `plugins/aether/lib/plan.js`; `plugins/aether/lib/lane-delegate.js`; `plugins/aether/workflows/run.workflow.js`; `plugins/aether/agents/implementer.md`, `supervisor.md` y `writer.md`; `plugins/aether/skills/tasks/SKILL.md`; `plugins/aether/speckit/commands/speckit.tasks.md`.
- **Pruebas:** `tests/ladder.test.js`, `tests/delegate-task.test.js`, `tests/delegates-docs.test.js`, `tests/plan.test.js`, `tests/aether-plan.test.js`, `tests/agents.test.js`, `tests/speckit.test.js`, `tests/lane-delegate.test.js`, `tests/workflow*.test.js`, `tests/docs-facts.test.js`; nuevas: `tests/models-by-role-docs.test.js` y `tests/effort-policy-docs.test.js`.
- **Documentación:** `docs/guide/models-by-role.md` (nueva), `docs/guide/delegates.md`, `docs/index.md`, `docs/decisions.md`, `docs/methodology.md`, `docs/roadmap.md`, `docs/purpose.md`, `docs/changelog.md`.
- **Fuera del swarm:** `docs/handoff/2026-10-26-model-effort-policy.md` lo escribe el Lead al cierre de la corrida, fuera del swarm; ninguna tarea lo tiene en sus `Owns`, porque un handoff cuenta la corrida ya terminada (C7).

## Verification

- Comando: `npm test`. Antes de cerrar: `npm run check` (incluye la prueba del mod y la validación `--strict` del plugin y del mercado).
- **C1, C2 / R1 a R5:** `ladder`, `delegate-task`, `delegates-docs` (la tabla es el archivo), `plan`, `aether-plan`, `agents`, `lane-delegate` y `workflow*` (cada esfuerzo del reintento, de la subida y de la revisión final, con los escenarios E1 a E8).
- **C3, C4 / R5, R7:** `models-by-role-docs` (la página es el árbol) y `docs-facts` (la decisión A93).
- **C5 / R6:** `agents`, `manifest` y `launcher` pasan sin cambio; `git diff main --stat` no nombra `agents/lead.md`, `agents/judge.md`, `agents/examiner.md`, `lib/superdelegation.js` ni `lib/ladder.js`.
- **C6, C7 / R7:** `models-by-role-docs`, `effort-policy-docs` y `docs-facts` (enlaces, `title`, `description` y `order`, la página enlazada desde el índice).
- **C8 / R8:** `models-by-role-docs` (la sección de la medición existe y nombra los campos del reporte).
- **C9 / R9:** `git status` del checkout principal sin cambios, la rama sin fundir, `claude plugin list` con 0.20.1.
- **No se verifica en esta corrida:** que un esfuerzo menor no deje pasar más (J7): lo mide D8 en las dos corridas siguientes de un swarm.

## Assumptions

Las de la spec (S1 a S9 de la tarjeta, A1 a A3).

## Risks

Los de [design.md](design.md): un esfuerzo menor deja pasar más; más correcciones al Lead; pruebas que fijaban lo viejo sin querer; las cifras de Artificial Analysis se mueven; y otros pares externos toman llamadas porque el par de referencia baja. Y uno del plan: la Tarea 6 toca `tests/docs-facts.test.js`, que otras ramas también cambian; el conflicto, si lo hay, se resuelve al fundir.

## Questions

- **Q1. ¿Acepta el dueño que en Sonnet y en Opus una corrección no suba el esfuerzo?** (S1, A87). La corrida sigue con el supuesto; va a «Espera tu sí».

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Una página nueva de la guía con una prueba que la ata al árbol | R7 y C7: el dueño pidió la manera del artifact en la documentación y que quede al día | Una sección dentro de `methodology.md`: ya es larga y no tiene una prueba que la ate; una página sin prueba se desfasa en la primera recalibración |
| Siete tareas en cinco olas (`[["task-1"],["task-2"],["task-3","task-4"],["task-5"],["task-6","task-7"]]`) | R2 y R3 y las dependencias reales: la Tarea 2 va tras la 1 (patrones de `Owns` que se solapan), las Tareas 3 y 4 tras la 2 (la 3 mueve el esfuerzo por defecto que la 2 ya desacopló de las pruebas del workflow), la Tarea 5 tras la 1, la 2 y la 3 (describe lo ya cambiado) y las Tareas 6 y 7 tras la 5 (enlazan la página nueva) | Una sola tarea con todo: pasa de 20 caminos y, según el issue 003, una tarea así suele acabar sin su reporte; fundir olas violaría esas dependencias o haría que dos tareas de una ola poseyeran el mismo camino |
