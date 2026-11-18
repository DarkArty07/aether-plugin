# Plan 045: los cinco issues de fallos (#318, #317, #316, #314 y #302)

- **Spec:** `specs/045-defect-issues/spec.md` (R1 a R29, C1 a C6).
- **Evidencia:** `specs/045-defect-issues/evidence/` (los cinco issues y la consulta `model/list` de Muse, caso (1) de R13, ya hecha: no se repite).
- **Rama:** `fix/issues-fallos`, creada desde `feat/codex-gpt-6-2`. El enjambre construye aquí. No se fusiona a `main`, no se hace `push`, no se saca versión y no se instala el plugin ni una skill real (R28).

## Technical context

- Node.js 22, CommonJS, sin dependencias. Pruebas con `node --test "tests/*.test.js"` (`npm test`); `npm run check` suma `npm run test:mod` (los `hooks/*.test.ts` del mod) y `npm run validate`.
- Los flujos (`workflows/*.workflow.js`) no importan módulos, no leen el reloj ni el disco; sus pasos de shell van al agente `aether:ops` y el mod los contesta por la lista de formas de `hooks/ops-command.mjs`. Los esquemas del flujo de diseño son copias de `lib/lane-schemas.js`; `tests/aether-lane.test.js` mantiene iguales las copias de `REVIEW_SCHEMA`.
- Las partes del arranque del Lead salen de `skills/using-aether/SKILL.md`; cada parte pesa a lo sumo 9.800 caracteres (`tests/session-start-parts.test.js`, issue 139). Tocan ese archivo la Tarea 1 y la Tarea 13, en olas distintas.
- Reglas del proyecto (`.specify/plan-rules.json`): un módulo nuevo de `lib/` y un verbo nuevo de `bin/` se registran en `docs/reference/components.md`; una decisión nueva de `docs/decisions.md` obliga a tocar `docs/index.md`, `tests/docs-032.test.js` y `tests/docs-facts.test.js` (el rango `A1–A133`).
- Las pruebas corren en repos y registros de mentira (`tests/helpers.js`: `tempDir`, `makeRepo`, `useDataDir`), sin gastar fichas y sin red. Muse se prueba con un `muse serve` de mentira por `PATH`; el registro de skills, con un ejecutable de mentira.
- Estructura: libs en `plugins/aether/lib/`, bins en `plugins/aether/bin/`, agentes en `plugins/aether/agents/`, flujos en `plugins/aether/workflows/`, datos en `plugins/aether/config/`, skills en `plugins/aether/skills/`, docs en `docs/`, pruebas en `tests/`.

## Gate

El proyecto no tiene `.specify/memory/constitution.md`: no hay principios que contar.

- `Nothing speculative, and nothing for a hypothetical need.` Pasa. Cada pieza nueva la pide un requisito por su nombre: el lector MSP (R14), el buscador, el revisor y el instalador de skills (R22 a R25), el agente `skill-reviewer` (R23). Nada sirve a una necesidad futura.
- `No abstraction, option, file or dependency that no requirement asks for.` Pasa con las filas de `## Complexity`: dos módulos nuevos de skills, un agente, un módulo nuevo de Muse y una variable de prueba para el registro falso, todas con su requisito. No hay dependencia nueva.

## Design

### D1. Una tarea por módulo y por preocupación, en cinco olas

Los 29 requisitos y los 35 hallazgos de #316 se reparten en 14 tareas. Los archivos compartidos (`docs/decisions.md`, `docs/index.md`, `tests/docs-032.test.js`, `tests/docs-facts.test.js`, `docs/reference/components.md`, `design.workflow.js`, `plan-compile.js`, `bin/aether-plan`, `ops-command.mjs`, `using-aether/SKILL.md`) pasan por tareas de olas distintas; ningún par de tareas de una misma ola posee el mismo archivo.

- **Ola 1 (independientes):** T1 prosa (R1, R9), T2 pruebas (R2, R10), T3 motivo de parada (R3), T4 guard (R4), T5 verbo `aether-plan` y regla del mod (R6, R7), T6 revisión final (R8), T7 limpieza del flujo de diseño (R5, R12), T8 lector de Muse (R13 a R16), T9 emparejador de skills (R20).
- **Ola 2:** T10 reparto de skills a delegados y unidades (R18, R19, R21; depende de T9 por `skill-brief.js` y de T5 por `plan-compile.js`); T11 buscar, revisar e instalar skills (R22 a R25; depende de T5 por `bin/aether-plan` y de T8 por `components.md`).
- **Ola 3:** T12 el paso de skills en `/aether:design` (R22 a R25; depende de T7, T11 y T5).
- **Ola 4:** T13 decisiones y documentos que citan el código (R11, R12, R17, R26, R27, R28, R29; depende de T1, T3, T8, T10 y T12).
- **Ola 5:** T14 documentos de skills y del diseño (R11, R26; depende de T13, T10 y T12, porque comparte `tests/docs-facts.test.js` con T13).

### D2. #318 y la prosa (T1, R1, R9). Serves: C1, C3

`docs/guide/maintenance.md` (punto «Per-project cleaning») dice lo que hace `lib/tree-clean.js`: nunca toca trabajo sin guardar y un worktree registrado dentro de una carpeta vencida de `.aether/work/` se elimina solo cuando está limpio. Una prueba nueva fija la frase y falla si vuelve la anterior. Los hallazgos #11 a #14 son cambios de texto: la regla del swarm añade una frase a cada viñeta (sin tocar las frases que fijan las pruebas), el puntero pasa bajo «Verify before you relay», `approve` recupera `${CLAUDE_PLUGIN_ROOT}/bin/` y el recorte de la prueba termina en `- **Leftovers:**`.

### D3. #317 (T2, R2) y los controles de #316 (R10). Serves: C2, C3

La costura es un ejecutable `git` de prueba antepuesto a `PATH`, sin tocar `lib/` ni `bin/`: reenvía al `git` real salvo el `git rev-parse HEAD` que `lib/seats.js` hace justo después de escribir `pair.json` y antes de instalar el manejador de señales; en esa llamada crea un marcador y se bloquea. La prueba espera el marcador sin bucle ocupado y mata el grupo con `SIGKILL`. Si el `git` de prueba no llegara a esa llamada, la tarea elige otra costura equivalente de prueba y, si no hay ninguna, lo dice en su respuesta sin cambiar producción. La prueba de `quota-brake` añade la precondición de la pausa y un control negativo con una tercera sesión.

### D4. El motivo de parada (T3, R3). Serves: C3

Un solo contrato en cuatro puntos, sin tocar las formas que fijan las pruebas:

- `hooks/delegate.mjs` pasa `--stop-reason <valor>` a `aether-delegate answer`, antes de `--task`, solo cuando el motivo no es `end_turn`.
- `bin/aether-delegate answer` acepta `--stop-reason` y `recordAnswer` (`lib/delegate-run.js`) no llama a `closeReadOnly` cuando el motivo es una cadena no vacía distinta de `end_turn` y `tool_use`.
- `lib/harness/grok.js`: `parse()` añade la clave `stopReason` solo cuando el JSON de grok trae `stopReason` como cadena no vacía distinta de `end_turn`. `agy`, `codex` y `muse` no cambian.
- El motivo viaja de `lib/delegate-calls.js` a `lib/delegate-chain.js` y a `runReadOnly`, que emite la línea de pedir veredicto (`judgeLine`) en lugar de la de cierre automático y no llama a `closeReadOnly`. La tarea queda en `unverdictedDelegates` y en el aviso de Stop. `lib/delegate-task.js` no cambia (lo posee T10).

### D5. El guard (T4, R4). Serves: C3

`claudeConfigWrite` y `trustedWrite` pasan a ignorar un segmento de solo lectura: un `find` sin acciones de escritura y un `gh issue` o `gh pr`, cuando nada más en la línea escribe (la misma regla que `isReadOnlySegment` y `segmentsWrite` ya aplican a las carpetas personales de skills, spec 044 R29 y R30). Las redirecciones y cualquier escritura real siguen rechazadas. Las pruebas de `tests/guard-skills.test.js` cubren los bordes de #15.

### D6. `aether-plan` y el mod (T5, R6, R7). Serves: C3, C6

`plan-compile.js` exporta su `USAGE` único (con `aether-plan requirements <spec.md>`); `bin/aether-plan` lo importa de ahí, borra su copia y la rama `(check || compile) && !argv[1]`, y `requirements` sin argumento imprime ese mismo `USAGE`. `loadThreshold` lanza un error claro con `null` y con cualquier valor que no es un objeto. `SPEC` del mod se construye con el patrón de `TASKS`. `npm run test:mod` corre el caso de `ops.test.ts`.

### D7. La revisión final dividida (T6, R8). Serves: C3

El tope de 10 menores rige sobre la revisión completa: se conservan todos los críticos e importantes y los primeros 10 menores en orden de rebanada; si `K > 0` se recortan, `finalReview` lleva `minorsOmitted: K` y `summary` añade la nota. `REVIEW_FINDINGS` se construye extendiendo `FINDINGS` con `fix` en `workflows/run.workflow.js` y en `lib/lane-schemas.js`, con una prueba de consistencia dentro de cada archivo y entre ellos, y `tests/aether-lane.test.js` valida un hallazgo con `fix` y otro sin él.

### D8. El flujo de diseño, primera pasada (T7, R5, R12). Serves: C3

Retira de `agents/mapper.md` el contexto del plan que el mensaje no manda y nombra el campo `map`; la rama nativa reutiliza `checkedAfter`; `examine()` extrae `storeExam()`; se quita el `try/catch` inalcanzable del mapper; `message` de `seatRound` pasa a `nativeMessage`; `writePlan` deja de tener el respaldo muerto; `agents/writer.md` retira `disagreements` de las dos formas separadas; `tests/agent-turns.test.js` acota cada aserción a su encabezado; `tests/workflow-design.test.js` cubre las tres salidas de fallo de la ruta nativa. El hallazgo #24 ya no aplica (ver `## Hallazgos de #316`).

### D9. Muse (T8, R13 a R16). Serves: C4

Un módulo nuevo, `lib/muse-models.js`, habla MSP con `muse serve` por stdio y devuelve los ids de `model/list`. La respuesta real, registrada el 2026-11-17 en `evidence/muse-model-list-2026-11-17.md`, es el caso (1) de R13: 5 modelos, 2 mensajes, sin `run.usage`, sin turno y sin error de cuota; no se repite. El esquema MSP local (`muse schema generate-json-schema`, sin red ni modelo) dice que el id de cada fila es `modelId` (el registro lo muestra como `id`): el lector acepta `modelId` y, como respaldo, `id`.

- **Mensajes (JSON-RPC por líneas, `"jsonrpc":"2.0"`):** `initialize` con `params.clientInfo = { name: 'aether', version: <version del plugin> }`, la notificación `initialized` sin parámetros y `model/list` sin parámetros. La respuesta de éxito trae `result.models[]`.
- **Argumentos de `muse serve`:** `--no-session-log --disable-shell --disable-write`, los de la consulta registrada, sin prompt y sin sesión. El lector nunca lanza `muse exec` ni `refreshMuseQuota`.
- **Plazo y limpieza:** el proceso se cierra al recibir la respuesta, al fallar y al vencer el plazo (`SIGTERM`, y `SIGKILL` si no sale); sin procesos huérfanos.
- **Integración:** `config/model-watch.json` cambia `captureVia.muse` de `null` a `{ "msp": true }`; `listModels('muse', …)` llama al módulo; `runWatch` lee `muse` siempre al final de la ronda (después de los demás harness activos) y su motivo (`not-installed`, `failed`, `timeout`) queda anotado sin afectar a los demás; `aether-doctor` deja de decir «sin medio de captura» y muestra la comparación completa. Nada escribe en `harness-models.json`, `pairs.json` ni `prices.json`.

### D10. Skills, primera parte: el emparejador y el reparto (T9, T10; R18 a R21). Serves: C5

- **T9** reescribe la regla de `lib/skill-brief.js` (`matchDelegateSkills`) como dice R20: señales de dominio por nombre exacto, extensión o patrón de archivo con punto, partes de un nombre compuesto y palabras de longitud ≥ 4; la lista cerrada de `stopWords` se añade a `config/skills.json`; el umbral y el orden de relevancia con desempate alfabético. Reemplaza la expectativa de `tests/skill-brief.test.js:164-167` para `audio-fx`. `matchDelegateSkills` sigue devolviendo todas las coincidencias, ya ordenadas.
- **T10** añade en `lib/skill-brief.js` la selección que adjunta (`selectSkills`: las manuales primero con su validación estricta, las automáticas completan hasta 3 y 1.500 líneas y las inválidas se omiten) y las raíces de búsqueda de skills del proyecto (`projectSkillRoots`: árbol de integración, checkout principal y rutas de `installs.jsonl` de este repositorio que existan). `lib/delegate-task.js` (`begin`) y `lib/plan-compile.js` (`compile`) la usan, inyectan el contenido en el prompt o el brief y registran los nombres en `launch.skills` y `uses.jsonl`. El aviso `delegate-skill` deja de salir para las skills ya entregadas. Sustituye las expectativas de `tests/delegate-skills.test.js:98-101` y `:134-136`.

### D11. Skills, segunda parte: buscar, revisar e instalar en `/aether:design` (T11, T12; R22 a R25). Serves: C5

Como el flujo no lee el disco ni la red, el trabajo es un verbo de `aether-plan` que el mod contesta sin modelo, y el flujo solo lo ordena:

- **`lib/skill-design.js` (nuevo):** `aether-plan skills find <feature>` (descubre los temas de `intent.md` por las `words` de `config/skills.json`, descarta los cubiertos, busca con `npx skills@1.9.0 find <consulta>`, separa por autor de confianza, anota los demás en `.aether/pending.jsonl` clase `skill-install` sin duplicar, descarga una sola vez cada candidata de confianza a una carpeta temporal bajo `<data dir>/skills/review/<id>/`, calcula su SHA-256 y corre la etapa de código) y `aether-plan skills install <feature> <id>` / `aether-plan skills discard <id>`. Los tokens que cruzan el mod son un identificador `[a-z0-9]+(-[a-z0-9]+)*`, nunca una ruta.
- **`lib/skill-install.js` (nuevo):** la descarga (`npx skills@1.9.0 add <fuente> --skill <nombre>` con la carpeta temporal como directorio de trabajo), la etapa de código de R23 (a, b, c), el hash de la carpeta (`computedHash` de `skill-registry.js`) y la copia byte a byte a `.agents/skills/<nombre>/` con enlace en `.claude/skills/<nombre>`, la verificación del hash, `recordInstall` y la limpieza. Ningún `git add`, ningún `git commit`, ninguna escritura en `~/.agents/skills/`.
- **`agents/skill-reviewer.md` (nuevo):** agente de solo lectura (`tools: Read, Grep, Glob`) que lee todos los archivos de la carpeta temporal y responde `{ verdict: 'approved' | 'rejected', reasons: [] }`. Un rechazo, un fallo o una respuesta inválida rechaza la skill (fallo cerrado).
- **`workflows/design.workflow.js` (T12):** un paso `skillsStep()` entre la aprobación de la spec y el mapa (`planMap`): `aether-plan skills find`, una llamada `skill-reviewer` por candidata que pasó la etapa de código (`sonnet`, `high`), `skills install` para las aprobadas (tope 1 por tema y 3 por diseño) y `skills discard` para las rechazadas. Todo fallo, de red o de proceso, se anota con `log(...)` y el diseño sigue. El resultado `approved` lleva `skills: { installed, rejected, pending }`. `hooks/ops-command.mjs` acepta las tres formas.
- **Registro falso:** la variable `AETHER_SKILLS_BIN` apunta a un ejecutable que sustituye a `npx skills@1.9.0`; las pruebas la usan siempre y nunca instalan nada real ni tocan `~/.agents/skills/`.
- **El Writer externo** conoce las skills nuevas por el bloque `## Project skills` que `lib/seats.js` arma desde el checkout del Lead, y el enjambre las recibe por R19. Ningún worktree de asiento recibe copia.

### D12. Decisiones y documentos (T13, T14; R11, R12, R17, R26, R27, R28, R29). Serves: C1, C3, C4, C5, C6

- **A132** recibe una actualización fechada (sin revertirla) con la excepción de R3, conservando la frase `A read-only delegate whose checks pass is closed by the system when it answers`; y precisa qué ocurre antes y después de la fusión (hallazgo #21). La misma excepción, en la frase siguiente, va en `docs/guide/delegates.md`, `AGENTS.md` y el párrafo `**The verdict.**` de `using-aether/SKILL.md` (R29).
- **Filas nuevas, a partir de A134:** A134 (enmienda de A124 cláusula (5) por los topes de 100 y 80 turnos, con «yo digo que subas los turnos», y el mapa de código en Haiku nativo sin asiento externo, hallazgos #22 y #29), A135 (enmienda de A129: Muse se lee por `muse serve`, con las citas del dueño de #302) y A136 (enmienda de A125 cláusula (2): reparto automático, y búsqueda, revisión e instalación en `/aether:design`, con «Repartir e instalar» y «nuevamente no veo que el lead instale skills por su propia cuenta»). `docs/index.md`, `tests/docs-032.test.js` y `tests/docs-facts.test.js` pasan de `A1–A133` a `A1–A136`.
- **T13** además corrige `docs/guide/troubleshooting.md` (hallazgo #19 y la lectura de Muse, R17), cambia `tests/decision-044.test.js` (hallazgo #21) y fija las frases con una prueba de documentos nueva. **T14** actualiza `skills/skills/SKILL.md`, `skills/designing/SKILL.md` (hallazgo #20 y R26), `docs/guide/project-files-and-skills.md` y `docs/guide/design-seats.md`.

## Hallazgos de #316

Los 35 hallazgos tienen tarea o razón. «Cm» es un comentario; «G» es uno de los dos del guard.

| Hallazgo | Tarea | Qué se hace |
| --- | --- | --- |
| 1, 2 | T7 | `mapper.md`: se retira el contexto del plan y se nombra el campo `map`. |
| 3 | T5 | `SPEC` del mod con el patrón de `TASKS`. |
| 4, 5 | T5 | Un solo `USAGE` exportado de `plan-compile.js`; se borra la rama de rodeo. |
| 6 | T5 | `loadThreshold` con `null` y no objeto, con una prueba por rama. |
| 7 | T5 | `npm run test:mod` corre el caso de `ops.test.ts`. |
| 8, 9, 10 | T6 | Tope de menores sobre la revisión completa, `REVIEW_FINDINGS` extendido y dos casos de `REVIEW_SCHEMA`. |
| 11, 12, 13, 14 | T1 | Frases de `swarm/SKILL.md`, puntero bajo «Verify before you relay», prefijo de `approve` y recorte de la prueba. |
| 15 | T4 | Bordes de `find`, `sudo find`, `/usr/bin/find` y `$(cp ...)` en un cuerpo de `gh`. |
| 16 | T3 (código) y T13 (documentos) | El corte o rechazo informado queda pendiente; `agy`, `codex` y `muse` siguen cerrando (hueco al dueño). |
| 17, 18 | T2 | Precondición de la pausa y control negativo con una tercera sesión. |
| 19 | T13 | `troubleshooting.md` enlaza a la sección de abajo y separa las dos marcas. |
| 20 | T14 | `designing/SKILL.md`: el flujo ya relanzó al Examiner una vez. |
| 21 | T13 | `decision-044.test.js` fija la negativa de fusión; A132 dice qué pasa antes y después. |
| 22 | T13 | Enmienda de A124 cláusula (5) en A134. |
| 23, 26, 27, 28 | T7 | `checkedAfter`, `storeExam()`, sin `try/catch` inalcanzable, `nativeMessage`. |
| 24 | ninguna (ya no aplica) | `PLAN_WRITER_SCHEMA` y `TASKS_WRITER_SCHEMA` ya dicen `'your commit of plan.md'` y `'your commit of tasks.md'` desde `14f30c5`. T7 añade una aserción que lo fija. |
| 25 | T7 | Tres casos de falla de la ruta nativa. |
| 29 | T13 | Constancia en A134: el mapa corre en Haiku nativo. |
| 30 | ninguna (duplicado) | Duplicado exacto del 3: `ops-command.mjs` solo tiene una constante `SPEC`. |
| Cm 1, 3 | T7 | `writer.md` sin `disagreements` en las dos formas separadas; `agent-turns.test.js` acotado por encabezado. |
| Cm 2 | T7 | `writePlan` sin el respaldo muerto. |
| G `claudeConfigWrite`, G `trustedWrite` | T4 | Lecturas permitidas, escrituras rechazadas. |

## Files

| Archivo | Qué cambia y por qué |
| --- | --- |
| `docs/guide/maintenance.md`, `skills/swarm/SKILL.md`, `skills/using-aether/SKILL.md`, `tests/review-verdict-rule.test.js` | La frase de limpieza (R1) y las frases del swarm y del Lead (R9). T1. |
| `tests/seat-partial.test.js`, `tests/quota-brake-continued.test.js` | Sincronización explícita y controles (R2, R10). T2. |
| `hooks/delegate.mjs`, `bin/aether-delegate`, `lib/delegate-run.js`, `lib/delegate-chain.js`, `lib/delegate-calls.js`, `lib/harness/grok.js` | El motivo de parada (R3). T3. |
| `lib/guard.js` | Lecturas de `claudeConfigWrite` y `trustedWrite` (R4). T4. |
| `bin/aether-plan`, `lib/plan-compile.js`, `lib/plan-requirements.js`, `hooks/ops-command.mjs`, `hooks/ops.test.ts` | `USAGE`, `loadThreshold` y `SPEC` (R6, R7). T5. |
| `workflows/run.workflow.js`, `lib/lane-schemas.js` | Tope de menores y `REVIEW_FINDINGS` (R8). T6. |
| `workflows/design.workflow.js`, `agents/mapper.md`, `agents/writer.md` | Limpieza del flujo de diseño (R5, R12). T7. |
| `lib/muse-models.js` (nuevo), `lib/model-listing.js`, `lib/model-watch.js`, `lib/doctor.js`, `config/model-watch.json`, `docs/reference/components.md` | El lector MSP de Muse (R14 a R16, R27). T8. |
| `lib/skill-brief.js`, `config/skills.json` | El emparejador (R20). T9. |
| `lib/skill-brief.js`, `lib/delegate-task.js`, `lib/plan-compile.js` | La selección y el reparto (R18, R19, R21). T10. |
| `lib/skill-design.js` (nuevo), `lib/skill-install.js` (nuevo), `agents/skill-reviewer.md` (nuevo), `bin/aether-plan`, `docs/reference/components.md` | Buscar, revisar e instalar (R22 a R25, R27). T11. |
| `workflows/design.workflow.js`, `hooks/ops-command.mjs`, `hooks/ops.test.ts`, `docs/guide/ops.md` | El paso de skills del diseño (R22 a R25). T12. |
| `docs/decisions.md`, `docs/index.md`, `docs/guide/delegates.md`, `docs/guide/troubleshooting.md`, `AGENTS.md`, `skills/using-aether/SKILL.md` | Decisiones A134 a A136, A132 actualizada y las frases de documentos (R11, R12, R17, R26, R29). T13. |
| `skills/skills/SKILL.md`, `skills/designing/SKILL.md`, `docs/guide/project-files-and-skills.md`, `docs/guide/design-seats.md` | Documentos de skills y del diseño (R11, R26). T14. |
| Pruebas | Archivos nuevos `tests/defect-045-*.test.js` por tarea, y los existentes que cada tarea lista en su `Owns`. |

## Verification

Comando de pruebas: `npm test` (y `node --test tests/<archivo>.test.js` por tarea). Antes de cerrar: `npm run check` (`npm test`, `npm run test:mod`, `npm run validate`) en la rama `fix/issues-fallos`.

| Requisito | Qué lo comprueba (falla sin el cambio) |
| --- | --- |
| R1 | `tests/defect-045-prose.test.js`: la frase nueva y la ausencia de la anterior. |
| R2 | La prueba reescrita de `tests/seat-partial.test.js` pasa 20 de 20 con una carga ocupada por cada `os.availableParallelism()`; el número de núcleos, el comando y `20/20` van al comentario de cierre de #317 y al diario. |
| R3 | `tests/defect-045-stop-reason.test.js`, `tests/delegate-mod.test.js`, `hooks/delegate.test.ts`, `tests/harness-grok.test.js`: `max_tokens` y `refusal` en Claude, corte y rechazo en `grok` quedan pendientes y en el aviso de Stop; `end_turn` y sin motivo cierran (A132). |
| R4 | `tests/guard-skills.test.js` y `tests/guard.test.js`: lecturas que pasan, escrituras que siguen rechazadas, bordes de `find`. |
| R5, R12 | `tests/agent-mapper.test.js`, `tests/agent-turns.test.js`, `tests/workflow-design.test.js` (una prueba por refactor y las tres salidas de fallo). |
| R6, R7 | `tests/aether-plan.test.js`, `tests/plan-requirements.test.js`, `tests/ops-command-design.test.js` y `npm run test:mod`. |
| R8 | `tests/workflow-final-slices.test.js` (4 rebanadas de 6 menores y 1 importante: 4 importantes, 10 menores, `minorsOmitted: 14`), `tests/aether-lane.test.js`, `tests/lane-schemas.test.js`. |
| R9, R10 | `tests/review-verdict-rule.test.js`, `tests/session-start-parts.test.js`, `tests/quota-brake-continued.test.js`. |
| R11 | `tests/defect-045-docs.test.js` (troubleshooting, A132, A134), `tests/decision-044.test.js`, `tests/defect-045-skills-docs.test.js` (`designing/SKILL.md`). |
| R13 | `tests/defect-045-muse.test.js` lee `evidence/muse-model-list-2026-11-17.md` y verifica que el servidor de mentira responde con la misma forma; ninguna prueba llama al `muse` real. |
| R14, R15, R16 | `tests/muse-models.test.js`, `tests/model-watch.test.js`, `tests/model-listing.test.js`, `tests/doctor.test.js`, `tests/session-start-model-watch.test.js`. |
| R17 | `tests/defect-045-docs.test.js` sobre `troubleshooting.md` y A135. |
| R18, R19, R21 | `tests/delegate-skills.test.js`, `tests/aether-plan-skills.test.js`, `tests/plan-compile-env.test.js` (worktree enlazado A y de integración B). |
| R20 | `tests/skill-brief.test.js` (positivos y negativos de `pxl`, `new-harness`, `artificial-analysis`; `audio-fx`; extracción de `.ipynb` y `(.ipynb)`). |
| R22 a R25 | `tests/skill-design.test.js`, `tests/skill-install.test.js` (registro falso, hash idéntico, topes, rechazos, `pending.jsonl`, sin red), `tests/workflow-design.test.js` y `tests/ops-command-design.test.js`. |
| R26, R29 | `tests/defect-045-docs.test.js` y `tests/session-start-parts.test.js`. |
| R27 | `tests/components-docs.test.js`, `tests/docs-032.test.js`, `tests/docs-facts.test.js` y `npm run check`. |
| R28 | El Lead, al terminar: cierra los cinco issues con su evidencia y abre el issue nuevo del hueco de `agy`, `codex` y `muse`; no fusiona, no empuja, no saca versión. T13 deja el hueco escrito en A132. |

## Assumptions

- **Plan de olas:** 14 tareas en cinco olas; las dependencias son las de archivos compartidos, no de comportamiento. Reversible.
- **Modelo del revisor de skills:** `sonnet` `high`, nativo y sin asiento externo; es una puerta de seguridad con fallo cerrado y su etapa de código ya descartó lo obvio. Reversible en `SKILL_REVIEW_PAIR` del flujo.
- **Registro falso:** la variable `AETHER_SKILLS_BIN` (ejecutable que sustituye a `npx skills@1.9.0`) es la costura de las pruebas de R22 a R25. Sin ella el verbo usa `npx skills@1.9.0`.
- **Formato de `skills find`:** no se ha visto salida real (no se instala ni se consulta nada real). El analizador lee, sin colores ANSI, los tokens `owner/repo@skill` de cada línea de la salida y la fuente como `owner/repo`; una salida que no los trae es «respuesta inválida» y el diseño sigue. Reversible cuando el dueño pida una prueba real.
- **Esquema de Muse:** el lector usa el esquema local (`muse schema generate-json-schema`, sin red ni modelo; no es una consulta `model/list`): `modelId` de cada fila, con `id` de respaldo.
- **Archivos de prueba nuevos:** cada tarea añade `tests/defect-045-<tema>.test.js` salvo que ya exista un archivo propio del tema; así no se agrandan los archivos grandes.
- **Cierre del #316:** el hallazgo 16 cierra el issue solo en parte (R3); el hueco de `agy`, `codex` y `muse` es un issue nuevo y una entrada de la lista del dueño (R28, la hace el Lead).
- **Registros de `.aether/pending.jsonl`:** las skills de autores no confiables se anotan con `appendPending` y la clase `skill-install`, sin repetir una entrada con la misma fuente (spec, `## Assumptions`).

## Risks

- **`design.workflow.js` es el archivo más tocado (T7 y T12) y `tests/workflow-design.test.js` su prueba.** Mitigación: T12 depende de T7; el paso de skills es una función propia (`skillsStep`) llamada en un solo punto de `full()`, y las pruebas existentes del flujo reciben un servidor de ops de mentira que contesta `aether-plan skills find` con «sin candidatas», de modo que el resto no cambia.
- **El tiempo del mod para un paso de shell con red.** La búsqueda y la descarga pueden tardar; cada llamada del verbo lleva un plazo acotado propio y, vencido, es un fallo registrado (R25), no un freno del diseño.
- **Falsos positivos del emparejador (el motivo del #314).** Las reglas de R20 son una lista cerrada con pruebas negativas por skill; un caso nuevo de ruido se corrige añadiendo una palabra a `stopWords`, no cambiando la regla.
- **La parte 2 del arranque** deja 328 caracteres de margen: T1 mueve un puntero y añade un prefijo, T13 una frase; `tests/session-start-parts.test.js` lo detecta y se acorta una frase del mismo párrafo.
- **Hueco del hallazgo 16.** `agy`, `codex` y `muse` no informan motivo de parada: un corte o rechazo allí sigue aprobándose por sí solo, como decidió A132. La spec lo anota como decisión del dueño; el plan no lo ensancha.
- **`model/list` de Muse cambia de forma en otra versión.** El lector falla cerrado (`failed`) con una respuesta que no es una lista válida y los demás harness siguen leyéndose.
- **La spec no tiene contradicciones que cambiar.** Dos detalles que el plan decide: el hallazgo 24 ya no aplica y el 30 es duplicado del 3, como la spec dice.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Módulo nuevo `lib/muse-models.js` | R14: Muse se lee por `muse serve` (`model/list`) sin llamar a un modelo. | Meter el cliente MSP dentro de `lib/model-listing.js` mezcla dos preocupaciones en un módulo de 190 líneas y deja el lector sin una prueba propia con un servidor de mentira. |
| Módulos nuevos `lib/skill-design.js` y `lib/skill-install.js` | R22 a R24: descubrir, buscar y clasificar es una preocupación; descargar, revisar el código y copiar byte a byte es otra. | Un solo módulo de más de 600 líneas mezclaría la búsqueda en red con la copia al proyecto; el flujo no puede leer disco ni red, así que no puede hacer ninguna de las dos. |
| Agente nuevo `agents/skill-reviewer.md` | R23: la etapa del agente de solo lectura de la revisión completa. | Reusar `aether:reviewer` mezcla un cuerpo de revisor final con una revisión de seguridad; una llamada con herramientas restringidas por parámetro no existe. |
| Forma nueva `aether-plan skills find/install/discard` y sus tres formas en `ops-command.mjs` | R22, R23, R25: el flujo solo ordena pasos; la red, el disco y el hash viven en el verbo. | Un `bin/` nuevo exige otro registro y otra prueba de verbo; `aether-plan` ya es el verbo del diseño (`requirements`, `design-args`). |
| Variable de prueba `AETHER_SKILLS_BIN` | R25: toda prueba del buscador, revisor e instalador usa un registro falso local sin red. | Sustituir `PATH` con un `npx` falso afecta a todo el proceso y a otros pasos del flujo. |
| Prueba `git` de mentira antepuesta a `PATH` | R2: la interrupción debe caer siempre antes del manejador de señales, sin tocar producción. | Un `sleep` o una espera de tiempo es la carrera que el issue 317 pide quitar. |
