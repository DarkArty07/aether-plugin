# Plan: asientos de diseño

Spec: [`spec.md`](spec.md). Este plan no repite el spec: dice cómo se construye.

## Technical context

- **El plugin** es `plugins/aether`: Node 22, sin dependencias. Tests con `npm test` (`node --test tests/*.test.js`), el mod con `npm run test:mod` y los manifiestos con `npm run validate`; `npm run check` corre los tres.
- **La tabla de lanes:** `plugins/aether/lib/lanes.js` lee `config/lanes.json`. `ROLES` es `implementer`, `supervisor` y `reviewer`, y `validateModel` exige que cada modelo tenga `replaces` (haiku, sonnet u opus) y roles de esa lista. También tiene `usable` (cuota sobre la reserva), `laneEnv` (el entorno sin credenciales), `appendLog` y `enabledHarnesses`.
- **Los harnesses:** `lib/harness/index.js` construye cada adaptador con `createAdapter`, y los tests registran adaptadores falsos con `registerAdapter`. Un adaptador da `installed`, `quota`, `modelArg`, `argv`, `parse` y `usageDelta`, y Codex, Grok y Cursor piden el esquema en el prompt (`schemaInPrompt`).
- **Las llamadas de lanes** (`lib/lane-calls.js`) están atadas a una corrida del swarm: `runId`, worktree de integración y unidades. Los asientos corren fuera de una corrida, al diseñar, así que no se montan ahí.
- **El Designer de 0.7** (`lib/lane-design.js` en el tag `aether--v0.7.0`) ya resolvía una ronda transaccional: `changedPaths`, `saveRound`, `undoRound` y refs de respaldo `refs/aether/design/<id>/round-<n>`. Este plan recupera y generaliza ese patrón; no restaura el módulo, que dependía de superpowers y de la conversación de agy.
- **Las opciones del plugin** están en `plugins/aether/.claude-plugin/plugin.json` (`lanes`, `harnesses`). `bin/aether-session-start` las pasa a la sesión por `CLAUDE_ENV_FILE` como `AETHER_LANES` y `AETHER_LANE_HARNESSES`.
- **El guard** (`lib/guard.js`, registrado en `hooks/hooks.json` para Write, Edit, MultiEdit, NotebookEdit y Bash) deja escribir specs, planes y tareas solo al Lead y al Writer. No ve a los CLIs externos: la contención de un asiento externo es la revisión con git después de la ronda (R7).
- **El flujo del Lead** está en `skills/using-aether/SKILL.md`, pasos 1–6 de la ruta «Spec and plan».
- **El mod de ops del #8 no se toca:** los asientos los corre el Lead por Bash, no el workflow, así que heredan el entorno de la sesión y no entran en la lista cerrada de comandos ops.

## Design

**D1. Un módulo nuevo, `lib/seats.js`, aparte de `lane-calls.js`.** Reusa el registro de harnesses, los adaptadores, `lanes.usable`, `lanes.laneEnv`, `lanes.appendLog`, `schemas.validate`, `roleBody` y `claudeMdSections`. No reusa las llamadas del swarm, que necesitan una corrida. Sirve a: C1.

**D2. La tabla distingue roles del swarm y asientos.** `ROLES` sigue siendo los del swarm (`implementer`, `supervisor`, `reviewer`) y se suma `SEATS` (`judge`, `writer`, `examiner`). `replaces` solo es obligatorio para un modelo con algún rol del swarm. `timeouts` suma los asientos: judge 1200 s, writer 2700 s, examiner 1800 s. Se agrega un bloque `designSeats` en la raíz:

```json
"models": {
  "gemini-4-argon": {
    "group": "gemini",
    "roles": ["judge", "writer", "examiner"],
    "levels": { "low": "low", "medium": "medium", "high": "high", "xhigh": "high" }
  }
},
"designSeats": {
  "native":   { "judge": [],                     "writer": [],                     "examiner": false },
  "balanced": { "judge": ["agy/gemini-4-argon"], "writer": [],                     "examiner": ["agy/gemini-4-argon"] },
  "robust":   { "judge": [],                     "writer": ["agy/gemini-4-argon"], "examiner": [] }
}
```

`false` apaga el asiento; una lista vacía lo deja en el nativo. `validateConfig` rechaza una entrada de `designSeats` que nombre un harness o un modelo que la tabla no tiene, o un modelo que no declara ese asiento. Sirve a: C1, C3.

**D3. La selección es una función pura.** `chooseSeat(config, { choice, seat, author, enabled, installed, quota })` devuelve `{ external }`, `{ native }` o `{ off }`, con los modelos que pasó por alto y por qué. Recorre la lista de la elección (R4) y salta el modelo del autor (R5). Se prueba sin procesos ni red. Sirve a: C1, C4, C5.

**D4. Una ronda corre en un worktree desechable, nunca en el checkout del Lead.**
- `git worktree add --detach` del `HEAD` actual, bajo `.aether/seats/<id>/`, fuera de git como las corridas (`run.ensureExcluded`).
- El harness corre ahí con `laneEnv` y su timeout.
- Al terminar, `changedPaths` (de 0.7) compara contra lo permitido para el asiento.
- **Judge:** nada permitido.
- **Writer:** solo `specs/NNN-<tema>/plan.md` y `tasks.md`. En una ronda limpia, Aether copia esos dos archivos al checkout del Lead y hace el commit (`docs(specs): plan and tasks of NNN-<tema>, by <harness>/<model>`). Si esos archivos tienen cambios sin commit en el checkout del Lead, la ronda no empieza (salida 3, `dirty`).
- **Examinador:** solo `.aether-exam/`, que Aether mueve al almacén del examen (D7).
- Una violación guarda el worktree en `refs/aether/seat/<id>/round-<n>` con `saveRound`, y el worktree se borra siempre.

Así una falla nunca deja nada a medias en el checkout del Lead, y el undo de 0.7 en el sitio ya no hace falta. Sirve a: C4, C5.

**D5. El mismo formato de respuesta para el Lead, sea quien sea el ocupante.**
- El prompt externo se arma con el cuerpo de `agents/<asiento>.md`, una nota de asiento externo (como `LANE_NOTE_TEXT`, con `WORKDIR_RULE`), las secciones de CLAUDE.md, el mensaje, y la sección del esquema cuando el adaptador la pide.
- `aether-lane seat` imprime `{ seat, harness, model, answer, lane }`. `answer` es el texto en el mismo formato que da el agente nativo; el Judge, por ejemplo, devuelve el bloque `## Verdict / ## Findings / ## Open questions`.
- `lane` es la línea de costo o cuota, como la línea `- Lane:` del Designer de 0.7.

El Lead procesa igual las dos respuestas. Sirve a: C1, C4.

**D6. El Writer externo recibe sus skills en el prompt.** Un CLI externo no tiene la herramienta Skill. La nota del Writer externo incluye el texto de `skills/plan/SKILL.md` y `skills/tasks/SKILL.md`, leído en cada ronda de los mismos archivos (no hay copia que pueda quedar vieja), y la ruta absoluta de `aether-plan`. Después de la ronda, Aether corre `aether-plan check` sobre `tasks.md`; si falla, la ronda falla. Sirve a: C2, C4.

**D7. El Examinador y su almacén.**
- `agents/examiner.md` es el agente nativo: Opus `high`, herramientas Read, Grep, Glob y Write.
- Su entrada: el spec, las interfaces públicas del plan, y la regla de no leer `tasks.md`.
- Su salida: `tests: [{ id, criterion, command, files }]`.
- **Un comando por test,** y el código de salida decide. Así no depende del framework de tests del proyecto.
- **El almacén** es `<dataDir>/exams/<repo>/<NNN-tema>/`, con `exam.json` y los archivos.
- **`bin/aether-exam`:**
  - `store <NNN-tema> --from <dir>` guarda un examen;
  - `run <NNN-tema> --ref <commit>` lo copia a un worktree desechable de ese commit, corre cada comando con un timeout de 10 min, y repite una vez el test que falla: si pasa la segunda vez, se reporta como inestable, no como fallo;
  - `list` muestra los exámenes guardados.
- **El guard:** el Examinador nativo escribe solo en `.aether-exam/`, que `run.ensureExcluded` saca de git. Cambio frente al primer plan: no hay matcher de `Read|Grep|Glob`. El guard arranca un proceso en cada llamada que vigila, en cualquier sesión, así que un hook de lectura costaría en cada Read de cada sesión. El examen queda protegido por estar fuera del repositorio, de los worktrees y de los briefs (decisión A42).

Sirve a: C5, C6.

**D8. El flujo del Lead.** En `skills/using-aether/SKILL.md`, la ruta «Spec and plan» queda así:
1. Spec → `aether-lane seat judge` en segundo plano; con salida distinta de 0, el Judge nativo, con el mismo mensaje.
2. Plan → `aether-lane seat writer` con `--author` del spec. Con salida distinta de 0, el Writer nativo.
3. Revisión del plan → `aether-lane seat judge --author <modelo del Writer>`.
4. Con el plan aprobado y el Examinador encendido en la elección → `aether-lane seat examiner --author <modelo del Writer>`. Con salida distinta de 0, el Examinador nativo. Después, `aether-exam store`.
5. Swarm.
6. `aether-exam run <NNN-tema> --ref <HEAD de integración>`; los fallos van al brief y al siguiente arreglo.

El «Estado» del diario nombra al ocupante de cada asiento. El gasto en dólares de cada ronda se registra en `aether-autonomy` con la etiqueta `seat/<id>/<n>`, como se registraban las rondas de diseño en 0.7. Sirve a: C1, C4.

**D9. El reporte.**
- `lib/report.js` lee del log de los lanes las entradas con `seat` (y `run: null`).
- Agrega un bloque `seats`: por asiento, las rondas, cuántas cayeron al nativo y por qué, los modelos, y los dólares o la cuota.
- La línea Delegación del brief suma «asientos: <ocupados por externos>/<rondas>».

Sirve a: C1, C3.

**D10. La opción `seats`.** En `plugin.json`, como string, con valor por defecto `balanced`; una palabra en minúsculas, como `lanes`, cuyo nombre en el entorno está medido (F11). `aether-session-start` exporta `AETHER_SEATS`, y `lanes.seatsChoice(env)` la lee con la misma regla que `enabledHarnesses`; un valor desconocido toma `balanced`, y la sesión lo avisa. Sirve a: C3.

**D11. Orden de construcción.** Cada fase se fusiona con la suite en verde y entrega algo usable:
1. **Judge:** D2, D3, D10; `lib/seats.js` con `aether-lane seat judge` (D1, D4, D5); registro y reporte (D9); el paso del Judge en el skill (D8). Ya pone a Argon como Judge.
2. **Writer:** D6, el commit del plan, y los pasos 2–3 del skill.
3. **Examinador:** D7, `aether-exam` y el guard, y los pasos 4 y 6 del skill.
4. **Medición:** el harness de R16, en `docs/evaluations/seats/harness/`, construido y probado con modelos simulados. Correrlo con modelos reales es tuyo (acción irreversible del spec).
5. **Documentación:** README (asientos, elecciones, cómo poner a Argon de reviewer final), decisiones A39–A43 en `docs/decisions.md`, y la versión 0.9.0.

## Files

| Archivo | Cambio |
|---|---|
| `plugins/aether/lib/seats.js` | Nuevo: `chooseSeat`, la ronda en worktree desechable, el commit del Writer, el registro (D1, D3, D4, D5) |
| `plugins/aether/lib/lanes.js` | `SWARM_ROLES` y `SEATS`, `replaces` opcional para asientos, validación de `designSeats`, `seatsChoice`, `seatList`, `seatTimeout` (D2, D10) |
| `plugins/aether/config/lanes.json` | `gemini-4-argon` en agy, timeouts de los asientos, bloque `designSeats` (D2) |
| `plugins/aether/lib/lane-schemas.js` | `JUDGE_SCHEMA`, `WRITER_SCHEMA`, `EXAMINER_SCHEMA` (R8) |
| `plugins/aether/lib/lane-calls.js` | Exporta lo que `seats.js` reusa; las llamadas del swarm no cambian |
| `plugins/aether/bin/aether-lane` | El verbo `seat` y sus códigos de salida (R10) |
| `plugins/aether/bin/aether-exam` y `plugins/aether/lib/exam.js` | Nuevos: `store`, `run` y `list` (D7) |
| `plugins/aether/agents/examiner.md` | Nuevo: el Examinador nativo (D7) |
| `plugins/aether/agents/judge.md`, `agents/writer.md` | Una línea: su respuesta puede llegar de un asiento externo con el mismo formato; sin cambios de criterio |
| `plugins/aether/lib/guard.js`, `plugins/aether/hooks/hooks.json` | El Examinador escribe solo en `exams/`; los agentes del swarm no leen `exams/` (D7) |
| `plugins/aether/skills/using-aether/SKILL.md` | La ruta con asientos, los respaldos nativos y el examen (D8) |
| `plugins/aether/.claude-plugin/plugin.json`, `bin/aether-session-start` | La opción `seats` y `AETHER_SEATS` (D10); versión 0.9.0 |
| `plugins/aether/lib/report.js` | El bloque `seats` (D9) |
| `docs/evaluations/seats/harness/` | Nuevo: el harness de R16 y sus documentos con defectos sembrados |
| `README.md`, `docs/decisions.md` | Asientos, elecciones, Fable fuera hasta 5.5, decisiones A39–A43 |
| `tests/seats.test.js`, `tests/exam.test.js` | Nuevos |
| `tests/lanes.test.js`, `tests/aether-lane.test.js`, `tests/guard.test.js`, `tests/session-start.test.js`, `tests/report.test.js`, `tests/agents.test.js`, `tests/manifest.test.js`, `tests/launcher.test.js` | Casos nuevos y la versión |

## Verification

Comando: `npm run check`, con `CLAUDE_CONFIG_DIR` y `HOME` temporales para las partes que llaman a `claude`. Ningún test llama a agy, a Argon ni a un modelo real: los asientos externos corren con un adaptador falso registrado con `registerAdapter`.

| Criterio | Qué lo prueba |
|---|---|
| C1 | `seats.test.js`: el agy falso ocupa el Judge y el Writer, y `exam.test.js` el Examinador; `seat` imprime el formato nativo; `aether-report --seats` nombra al ocupante |
| C2 | La medición de R16 con modelos reales (tuya). Aquí: el harness corre de punta a punta con modelos simulados y cuenta bien los defectos sembrados |
| C3 | `session-start.test.js`: `AETHER_SEATS` y su valor por defecto; `seats.test.js`: `native` nunca elige un externo; el reporte de asientos da dólares (o anota el modelo sin precio) y cuota |
| C4 | `seats.test.js`, una por forma de falla: no instalado, sin cuota, salida distinta de 0, salida sucia, respuesta fuera del esquema, violación, timeout y checkout sucio; cada una sale con 3 o 4 y deja el checkout del Lead igual |
| C5 | `seats.test.js`: con `--author` igual al primero de la lista se elige el siguiente; el Examinador nunca es el Writer; `guard.test.js`: el Writer externo no puede tocar un archivo de código sin que la ronda se deshaga |
| C6 | `exam.test.js`: un repo de prueba con un defecto conocido; `aether-exam run` lo marca como fallo con su criterio, y un test inestable sale como inestable. `guard.test.js`: un implementer no lee `exams/` |

## Assumptions

1. Los worktrees de los asientos viven bajo `.aether/seats/<id>/`, que git no ve porque `run.ensureExcluded` pone `/.aether/` en `.git/info/exclude`, como para las corridas. Se borran al terminar cada ronda.
2. Los ids de asiento siguen la forma de los ids de corrida: `<asiento>-<yyyymmdd-hhmmss>-<4 hex>`.
3. Los timeouts de los asientos son 1200 s el Judge, 2700 s el Writer y 1800 s el Examinador, los del reviewer, el implementer y el Designer de 0.7.
4. Un test del examen que falla se repite una vez; si pasa, es inestable y no bloquea.
5. El Examinador nativo usa Opus `high`, igual que el Judge, para que la elección `native` lo pueda apagar sin otro agente.

## Risks

- **El nombre de Argon en agy no está verificado** (supuesto 3 del spec). Si es otro, la ronda falla en segundos y sigue el nativo. Se corrige en la tabla tras la primera llamada real.
- **Un harness externo envía al proveedor lo que lee.** Es el mismo riesgo que los lanes ya aceptan por harness: corre en un worktree desechable, con `WORKDIR_RULE` y sin credenciales. Cada harness sigue apagado hasta que lo enciendes.
- **El examen puede filtrarse.** Ningún hook vigila su lectura (D7): un agente que lo busque bajo tu `HOME` puede leerlo. Se documenta como protección contra accidentes, no contra un agente que lo busque, igual que la regla de los lanes sobre remotos.
- **Un test del examen puede estar mal.** Bloquearía un trabajo correcto. El Lead puede discutirlo en el brief con su razón (R13), nunca ignorarlo en silencio, y la repetición separa lo inestable de lo roto.
- **El examen escrito antes del código puede no compilar** si el plan cambia sus interfaces durante la corrida. El Examinador escribe contra las interfaces públicas del plan aprobado; un cambio del plan después de aprobado ya pasa por el Judge, y el paso 4 de D8 se repite con el plan nuevo.
- **La elección `balanced` cambia el Judge de quien ya tiene lanes y agy encendidos** (supuesto 1 del spec). Si su agy no ofrece Argon, la ronda sale con 3 y el Judge sigue nativo, con la demora de una lectura de cuota.
