# Plan: aether:design

**Spec:** [spec.md](spec.md) (aprobada por el Juez en la revisión 2; la revisión 3 aplica sus tres hallazgos menores: R2, R11 y la clase de la etiqueta)

## Technical context

- **Stack.** Node.js CommonJS sin dependencias en `plugins/aether/`; el mod de ops es ESM (`hooks/*.mjs`, `hooks/register.js`); skills, agentes y plantillas son Markdown. Los tests son `node --test` (`npm test`). Un workflow no importa módulos y no usa `Date` ni `Math.random`: el arnés `tests/workflow-harness.js` hace fallar el test si lo hace.
- **Base.** Se construye sobre `main` después de que entre la spec 004 (A2). Las páginas de documentación son las de 004 (`README.md` corto, `docs/getting-started.md`, `docs/methodology.md`, `docs/guide/*.md`, `docs/reference/components.md`, `docs/changelog.md`, `docs/roadmap.md`) y su prueba de hechos `tests/docs-facts.test.js`. Si 004 no ha entrado, la tarea de documentación se detiene y lo dice.
- **Dónde está cada cosa hoy.**
  - Diseño: lo conduce el Lead con `aether-lane seat` (`lib/seats.js`, síncrono, hasta 2700 s). Ningún workflow lanza `aether:judge`, `aether:writer` ni `aether:examiner`.
  - `workflows/run.workflow.js`: `ops()` espera 600000 ms y trata un código distinto de 0 como error (`:229`, `:264`). No cambia.
  - `hooks/ops-command.mjs`: lista cerrada de comandos del mod (solo `aether-wt` y `aether-lane`); `hooks/register.js` guarda el payload solo en rutas de `lanes/` (`PAYLOAD_PATH`).
  - `lib/seats.js:96` saca el esfuerzo del Writer externo y del nativo de la misma tabla (`NATIVE`); `:169` limita al Writer externo a `plan.md` y `tasks.md`.
  - `lib/lanes.js:150`: `seatsChoice` lee `AETHER_SEATS`. El mod de ops corre los bins en el entorno propio de Claude Code, que no recibe los exports de la sesión (A30).
  - `lib/plan.js` y `bin/aether-plan`: `check` y `compile` comparten los errores del parser (`:70`, `:111`); no hay vínculo tarea a requisito.
  - `lib/guard.js:59-61`: el Lead y el Writer escriben specs, planes y tareas. Nada cubre un archivo de intención.
  - `skills/using-aether/SKILL.md`: 29,470 bytes; "Writing and judging" y "The design seats" conducen el diseño y "Autonomous runs" lleva todo el procedimiento.
- **Qué falta, contra R1 a R15.** El workflow `design`, la ronda de asiento por pasos, las formas nuevas del mod, la tarjeta y su guard, los frenos (plantillas, Juez, `check`, revisión final, instrucción de alcance), el Writer en `high`, la partición del bootstrap con su skill, y la versión 0.11.0 con la documentación.

## Gate

*Debe pasar antes del diseño.*

- **Constitución.** El repositorio no tiene `.specify/memory/constitution.md`: no hay principios que comprobar.
- **Nada especulativo ni para necesidades hipotéticas.** Pasa. P1 a P7 no se construyen; el workflow no reanuda a medias, no lleva `constraints` ni topes de tamaño por clase de tarea (A5); el único modo extra del workflow es el diseño corto, que R1 pide.
- **Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida.** Pasa con las ocho filas de "Complexity", cada una con el requisito que la pide y la alternativa simple descartada. Ninguna otra pieza sale del spec.

## Design

Cada decisión dice a qué sirve.

**D1 · `/aether:design` es un workflow nuevo, `workflows/design.workflow.js`; `run.workflow.js` no se toca.** El workflow corre en orden: el Writer escribe la spec, el Juez la revisa (a lo más dos revisiones), el Writer escribe plan y tareas, `aether-plan check` pasa, el Juez los revisa (a lo más dos revisiones) y el Examinador escribe el examen. Un diseño corto corre solo las rondas del Juez, con el Writer nativo para corregir. Un agente que termina sin respuesta se reintenta una vez desde los archivos; la segunda vez, `failed`. Sirve a: C1, C3, R1, R3, R13.

**D2 · Una ronda de asiento externo es un proceso aparte con tres verbos nuevos, `aether-lane seat-start`, `seat-wait` y `seat-stop`; el comando `seat` no cambia de semántica.** `seat-start` valida, copia el mensaje a la carpeta de la ronda (`.aether/seats/<id>/`) y lanza un runner desprendido (`_seat`) que llama a `seatCommand` con el `env` que ya recibe. `seat-wait` espera a lo más 540 s por paso (cabe en los 600000 ms de ops) y devuelve `{ done: false }` o `{ done: true, exitCode, value }`: los códigos 0, 3, 4 y 1 son datos de la ronda, nunca errores de ops (R2). Un runner muerto sin resultado se informa como código 1. `seat-stop` termina el runner. Sirve a: C1, R2, R3.

**D3 · Cómo llega la opción de asientos: banderas de `seat-start`, no un prefijo de entorno (R2).** `--seats`, `--lanes` y `--harnesses` que el Lead lee de su propio entorno (`AETHER_SEATS`, `AETHER_LANES`, `AETHER_LANE_HARNESSES`) y pasa en los args de `/aether:design`, junto con `session` (`CLAUDE_CODE_SESSION_ID`) y `repoRoot`. El runner las convierte en el `env` de `seatCommand`. Razón: la lista cerrada del mod no acepta prefijos de entorno y su entorno no tiene los exports de la sesión. Un asiento solo corre con lanes encendidas y su harness habilitado, así que `lanes` y `harnesses` viajan con la opción. El mensaje de la ronda viaja como payload a `<repoRoot>/.aether-tmp/seats/<session>/message.md`, que el mod ya sabe guardar si la ruta es de las que acepta (`PAYLOAD_PATH`). Sirve a: R2.

**D4 · El workflow no decide quién se sienta: lanza la ronda y, con 3, 4, 1 o un asiento que no termina, corre al agente nativo con el mismo mensaje.** Los nativos llevan modelo y esfuerzo explícitos (juez `opus high`, Writer `sonnet high`, examinador `opus high`), copiados de sus archivos de agente porque un workflow no tiene módulos; un test iguala las constantes con los frontmatter y con `seats.NATIVE`. Un asiento nunca toma el modelo del autor (A41): el workflow pasa `--author` con el modelo que escribió el documento. Sirve a: C1, R2, R11.

**D5 · El Writer externo escribe solo lo de su ronda.** `aether-lane seat writer --doc spec|plan` (por defecto `plan`): con `spec`, solo `spec.md`, con la skill `specify` en su prompt y sin `aether-plan check`; con `plan`, como hoy. Un esquema nuevo `SPEC_WRITER_SCHEMA` y campos opcionales (`complexity`, `disagreements`) llevan al workflow lo que R3 devuelve (marcas, Propuestas, tabla, posiciones). `--id` deja que el runner fije el id de la ronda. Sirve a: R2, R3.

**D6 · El esfuerzo del Writer nativo y el del externo se separan.** `NATIVE.writer.effort` pasa a `high`; una tabla `EXTERNAL_EFFORT` conserva `xhigh` para el Writer externo, y `chooseSeat` la lee. `agents/writer.md` arranca en `high`. Sirve a: C2, R11.

**D7 · La tarjeta es `specs/NNN-<topic>/intent.md` y el guard la deja escribir solo al Lead (y a la sesión principal).** Sirve a: C1, C2, R4.

**D8 · Los frenos son texto de plantillas y agentes, y cada uno tiene un test de contenido.** `specify`: qué y por qué, nunca cómo; `[NEEDS CLARIFICATION]` solo para lo difícil de revertir; cada criterio sale de una cita de la tarjeta. `plan`: una compuerta antes del diseño y una tabla de complejidad de tres columnas al final, cada fila con el requisito que la pide. `tasks`: cada tarea lleva `- Serves: R1, R3`. Juez: tipo `missing | extra | wrong` en cada hallazgo; lo que va más allá de la intención es un defecto. Writer, Juez, Examinador y bootstrap llevan la misma frase de alcance. Sirve a: C2, R6, R7, R9, R10.

**D9 · La trazabilidad vive en `aether-plan check`, no en `compile`.** `parsePlan` guarda `task.serves` sin agregar errores; `check` falla con una tarea que no sirve a ningún requisito o que nombra uno que la spec no tiene, y avisa de un requisito sin tarea. Si la spec no se encuentra o no tiene requisitos `R<n>`, no traza nada. Sirve a: C2, C3, R8.

**D10 · La revisión final gana una línea "Extra" y nada más.** Sirve a: C2, C3, R12.

**D11 · El bootstrap se parte.** "Writing and judging" y "The design seats" se cambian por una sección "Designing" (preguntas de aclaración, tarjeta, lanzamiento y los cuatro resultados); el procedimiento de la corrida autónoma pasa a la skill `autonomous-runs`. Se quedan las clases irreversibles con `aether-autonomy check`, el registro de autorizaciones, la regla de repetición y el brief corto. La skill se carga cuando el dueño da permiso de trabajar por horas o cuando session start avisa de una corrida abierta. Sirve a: C4, R14.

**D12 · El mod de ops gana cinco formas cerradas** (`seat-start`, con dos variantes de banderas, `seat-wait`, `seat-stop`, `aether-plan check` y `aether-exam store`, cada argumento verificado) y exporta `PAYLOAD_PATH` para que un test lo pruebe. Sirve a: C1, R1, R2.

**D13 · Versión y documentación en una sola tarea tardía,** que también actualiza la prueba de hechos de 004 (`design` es un workflow conocido, las skills y el workflow nuevos están en `components.md`) y las aserciones de versión. Sirve a: C5, R15.

## Files

| Archivo | Qué | Tarea |
|---|---|---|
| `plugins/aether/lib/plan.js`, `bin/aether-plan` | `serves`, `requirementsOf`, `traceability`; `check` las usa | 1 |
| `plugins/aether/lib/guard.js` | la tarjeta solo del Lead | 2 |
| `plugins/aether/lib/seats.js`, `lib/lane-schemas.js` | `--doc`, `--id`, `EXTERNAL_EFFORT`, `type` del hallazgo, `SPEC_WRITER_SCHEMA` | 3 |
| `plugins/aether/lib/seat-calls.js`, `bin/aether-lane` | `seat-start`, `seat-wait`, `seat-stop`, `_seat` | 4 |
| `plugins/aether/hooks/ops-command.mjs`, `hooks/register.js` | formas nuevas y `PAYLOAD_PATH` | 5 |
| `plugins/aether/workflows/design.workflow.js`, `tests/workflow-harness.js` | el workflow y su arnés | 6 |
| `plugins/aether/agents/{writer,judge,examiner,reviewer}.md` | alcance, tipos, `high`, línea Extra | 7 |
| `plugins/aether/skills/{specify,plan,tasks}/`, `speckit/commands/` | qué/por qué, compuerta y tabla, `Serves` | 8 |
| `plugins/aether/skills/autonomous-runs/`, `bin/aether-session-start`, `skills/swarm/SKILL.md` | la skill, el aviso, dos referencias | 9 |
| `plugins/aether/skills/using-aether/SKILL.md` y sus tests | el bootstrap partido | 10 |
| `plugins/aether/.claude-plugin/plugin.json`, `README.md`, `docs/`, `tests/docs-facts.test.js`, `tests/launcher.test.js` | 0.11.0 y documentación | 11 |
| tests nuevos | uno por tarea (ver `tasks.md`) | 1 a 11 |

No se toca `run.workflow.js`, `agents/implementer.md`, `agents/supervisor.md`, `agents/ops.md` ni ninguna prueba `tests/workflow*.test.js` existente (R13); ninguna tarea es dueña de `specs/` ni de `.specify/`.

## Verification

- **Comando:** `npm test`. Antes del pull request el Lead corre además `npm run check` (pruebas del mod y `claude plugin validate --strict`), que no está en el comando del swarm.
- **C1.** `tests/workflow-design.test.js` corre el workflow con el arnés de agentes falsos (sin llamadas pagadas) de una tarjeta a un plan aprobado, a una disputa, a un `clarify` y a un `failed`, con los códigos 3, 4 y 1 como resultados de la ronda; `tests/seat-calls.test.js` prueba los pasos contra el agy falso; `tests/bootstrap-design.test.js` prueba que el bootstrap manda lanzar `/aether:design` y ya no describe rondas ni códigos.
- **C2.** `tests/plan-trace.test.js` (E5), `tests/templates-design.test.js` (`[NEEDS CLARIFICATION]`, compuerta, tabla), `tests/agents-design.test.js` (tipos del Juez, Writer en `high`, alcance), `tests/seats-design.test.js` (R11 y R9 en el asiento externo), `tests/guard-intent.test.js` (R4).
- **C3.** Las pruebas `tests/workflow*.test.js` existentes pasan sin cambios, y `tests/agents-design.test.js` prueba la línea Extra de `agents/reviewer.md`.
- **C4.** `tests/bootstrap-design.test.js` (lo que salió, lo que se queda, el peso menor de 29,470 bytes), `tests/autonomous-runs-skill.test.js` y `tests/session-start-autonomy.test.js` (el aviso nombra la skill).
- **C5.** `tests/launcher.test.js` (manifiesto 0.11.0) y `tests/docs-facts.test.js` (versión en README, changelog y roadmap, skills y workflow en `components.md`), con `npm test` en verde.
- **Lo que ningún test prueba:** que el runtime del workflow aplique `model` y `effort` explícitos, y que el mod cree la carpeta del payload. La primera corrida real de `/aether:design` es una `paid-call` del dueño.

## Deployment

Se publica al fusionar a `main`, porque la instalación sigue `ref: main`, y se etiqueta. Es una acción irreversible y el spec la lista en "Irreversible actions": subir la rama y abrir el pull request (`push`), fusionar (`merge-main`) y etiquetar `aether--v0.11.0` (`push`). El swarm no ejecuta ninguna: el Lead las corre con la autorización del dueño. Comprobación: `npm test` y `npm run check` en la rama antes del pull request, y `git ls-remote --tags origin aether--v0.11.0` después de la etiqueta.

## Assumptions

- **A1. El workflow se llama `design`:** el archivo `workflows/design.workflow.js` da `/aether:design`, como `run.workflow.js` da `/aether:run`. Reversible.
- **A2. Los args son JSON:** `feature`, `session`, `repoRoot`, `seats`, `lanes`, `harnesses`, y para el diseño corto `mode: "short"`, `document`, `intent` y `author`. El Lead lee `CLAUDE_CODE_SESSION_ID`, `AETHER_SEATS`, `AETHER_LANES` y `AETHER_LANE_HARNESSES` de su entorno. Reversible.
- **A3. "La opción de asientos" incluye `lanes` y `harnesses`,** porque sin ellos `seatCommand` devuelve siempre `lanes-off`. Base: A30. Reversible.
- **A4. Una bandera, no un prefijo de entorno** (R2): la lista cerrada del mod no acepta prefijos. Reversible.
- **A5. El diseño corto vive en `specs/NNN-<topic>/design.md`,** para que el chequeo de "sin confirmar" de los asientos externos lo cubra; el Writer nativo corrige sus revisiones. La spec no dice dónde. Reversible.
- **A6. Un agente que termina sin respuesta (tope de turnos o caída) se reintenta una vez; la segunda vez termina con `failed`.** Cubre "el tope de turnos" y "la misma falla dos veces seguidas" de R3. Reversible.
- **A7. `/aether:design` siempre parte del primer paso:** tras `clarify`, `dispute` o `failed` el Lead relanza y se reescribe la spec. Sin reanudación (YAGNI). Reversible.
- **A8. Con workflows apagados el Lead se lo dice al dueño** y no diseña a mano: R2 pide que el Lead no conduzca rondas. Reversible.
- **A9. El hallazgo del Juez lleva `type`: `missing`, `extra` o `wrong`** (falta, sobra, error), obligatorio en el esquema del asiento externo. Reversible.
- **A10. El resultado de `approved` lleva además `rounds` (modelo, id y línea `- Lane:` de cada ronda) y `exam`:** el Lead ya no ve las líneas de las rondas y las necesita para el costo. Reversible.
- **A11. La skill nueva se llama `autonomous-runs`** (`aether:autonomous-runs`). Reversible.
- **A12. El peso del bootstrap se prueba contra los 29,470 bytes del spec,** sin un tope más estricto que el spec no da. Reversible.
- **A13. La regla de trazabilidad no traza si la spec no se encuentra o no tiene requisitos `R<n>`,** para que los planes sin spec y las pruebas existentes sigan pasando `check`. Reversible.
- **A14. Decisiones nuevas A50 a A54:** el workflow y la ronda por pasos, la tarjeta y las preguntas, los frenos, el Writer en `high`, la partición del bootstrap. Reversible.

## Risks

- **El runtime del workflow puede no aplicar `model` y `effort` explícitos como `run.workflow.js` supone, o el mod puede no crear la carpeta del payload.** Ninguna prueba lo ve. Respuesta: `seat-start` devuelve `unavailable: message` si no halla el mensaje, y el workflow corre al agente nativo; la primera corrida real es del dueño (`paid-call`).
- **Un Writer que deja una marca `[NEEDS CLARIFICATION]` sin listarla en `clarify`.** Respuesta: el mensaje del Juez de la spec pide reportar una marca restante como hallazgo `wrong`.
- **El Lead pierde una regla al encogerse el bootstrap.** Respuesta: el test de C4 lista lo que se queda.
- **La trazabilidad se omite en silencio si la spec no se halla** (A13). Respuesta: el Juez revisa la coherencia de spec, plan y tareas (R9).
- **La tarea de documentación depende del orden de páginas de 004.** Respuesta: si faltan, se detiene y lo dice.
- **El diseño corto con Lead en Opus y Juez nativo en Opus** repite el modelo (A41): `rounds` marca la ronda y el Lead lo dice en "Qué no verifiqué".

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Tres verbos nuevos de `aether-lane` y un runner desprendido (`lib/seat-calls.js`) | R2: una ronda externa dura hasta 2700 s y una llamada de ops espera 600 s | Llamar `aether-lane seat` por ops: se corta a los 600 s y sus códigos 3, 4 y 1 serían errores de ops, que R2 y R3 prohíben |
| Cinco formas nuevas en la lista cerrada del mod (`seat-*`, `aether-plan check`, `aether-exam store`) y `PAYLOAD_PATH` exportado | R1 pasos 3 y 5: el plan pasa `check` y el examen queda fuera del repositorio sin turnos del Lead; R2: el mensaje llega a la ronda | Que los agentes corran `check` y `store`: un informe no prueba que el plan pase ni que el examen se guardó, y sin la ruta del payload el asiento externo nunca recibe su mensaje |
| `rounds` y `exam` en el resultado, que R3 no lista | R14 (registro del costo de los asientos) y R1 paso 5: sin ellos el Lead ya no ve las líneas `- Lane:` ni sabe si hubo examen | Omitirlos: el costo de los asientos externos queda sin registrar |
| `SPEC_WRITER_SCHEMA` y campos opcionales del Writer (`complexity`, `disagreements`) | R3: `clarify`, la tabla, las Propuestas y las posiciones de una disputa salen de la respuesta del Writer; R2: la ronda de la spec no tiene plan ni tareas | Que el workflow lea los archivos: no tiene sistema de archivos |
| Modelo y esfuerzo de los nativos copiados en el workflow | R11 y la regla de que un workflow no tiene módulos | Omitirlos y confiar en el frontmatter: ninguna prueba vería que el Writer arranca en `high`; un test iguala las constantes con los agentes |
| El modo `short` del workflow | R1, último párrafo: el diseño corto corre solo las rondas del Juez | Otro workflow: duplica el control de rondas |
| `--doc` e `--id` en `aether-lane seat` | R2: el Writer externo escribe solo `spec.md` en la ronda de la spec; el runner necesita el id de su carpeta | Variables de entorno: el mod no las acepta |
| La trazabilidad solo en `check` y sin trazar sin requisitos | R8: `compile` debe seguir corriendo planes sin vínculos, y R13 | Hacerla en el parser: rompería los planes del swarm y sus pruebas |
