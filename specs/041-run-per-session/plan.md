# Plan: una corrida autónoma por sesión (Spec 041)

**Spec:** [spec.md](spec.md)
**Intent:** [intent.md](intent.md)

## Technical context

- **Runtime:** Node.js 22, CommonJS (`'use strict'`), sin dependencias (`node:fs`, `node:path`, `node:test`, `node:assert/strict`).
- **Dónde vive hoy la corrida** (leído en `fix/open-issues-9`, 0.44.0):
  - `plugins/aether/lib/autonomy.js`: `runs()` lee cada carpeta `.aether/autonomy/<id>/run.json`; `findOpenRun` devuelve la última sin cerrar sin mirar la sesión; `start` rechaza si hay cualquiera abierta (`run <id> is already open`); `launchRefusal`, `status`, `spend`, `end`, `extend`, `brakeOff`, `brakeSettings`, `recordCrossing` y `recordSaved` actúan sobre esa «la» corrida. `run.json` ya guarda `session`. `swarmSpend` suma todo enjambre cuya `compiledAt` cae en la ventana de la corrida.
  - `plugins/aether/lib/autonomy-command.js`: despacha los verbos de `aether-autonomy`; `status`, `spend` y `end` hoy no reciben la sesión; `quota-brake` usa `autonomy.openRun`.
  - Quien lanza ya pasa su sesión a `launchRefusal`: `lib/delegate-task.js:611` (`begin`), `lib/plan-compile.js:319` (`CLAUDE_CODE_SESSION_ID`) y `lib/seat-calls.js:108` (el diseño). No hay que tocarlos.
  - `lib/session-start.js` `autonomyNote(cwd)` escribe el aviso de la corrida abierta; `lib/wt-stuck.js` `defaultStopped` llama a `autonomy.status(mainRoot)` desde el proceso del mod, que no tiene la sesión exportada.
  - El diario de delegadas (`delegates/log.jsonl`) ya guarda `session` en cada línea (`delegate-task.js:322` y `:711`). El estado de un enjambre (`.aether/runs/<id>/state.json`, escrito por `plan-compile.js` y `lane-delegate.js`) y su registro final en `runs.jsonl` (`report.js` `finalize`) no guardan la sesión: hoy solo hay `compiledAt`.
  - El mod (`hooks/register.js`) llama a `brake-settings` y `brake-crossing` con `--session <id de la sesión>` y arma el despertar con el `run` que devuelve `brake-crossing`; nunca importa `lib/`.
- **Pruebas:** `npm test` (`node --test "tests/*.test.js"`) sobre repositorios temporales (`tests/helpers.js`: `makeRepo`, `tempDir`, `useDataDir`, `runBin`). `tests/session-start-parts.test.js` (R32) fija que cada parte del arranque de `skills/using-aether/SKILL.md` no crezca sobre la base de 0.41.0.

## Gate

- **Constitución (`.specify/memory/constitution.md`):** pass — el repositorio no tiene constitución; rigen `AGENTS.md` y `CLAUDE.md`: Node 22 CommonJS sin dependencias, bins delgados y lógica en `lib/`, huella dormida fuera de una sesión del Lead, partes del arranque dentro de 9.800 caracteres, docs sujetas a `tests/docs-facts.test.js`. El plan no añade bins, hooks ni opciones.
- **Nothing speculative, and nothing for a hypothetical need:** pass — cada cambio sirve a un criterio C1 a C6 del spec (ver `Sirve a` en cada decisión).
- **No abstraction, option, file or dependency that no requirement asks for:** pass — ningún módulo de producto nuevo, ninguna opción de usuario, ninguna dependencia. Lo único nuevo en los datos es el campo `session` de `state.json` y de `runs.jsonl`, que pide R7 («guardan la sesión que los lanzó»). `tests/run-session-fixture.js` es soporte de pruebas, no producto.

## Design

### D1. Una corrida es de la sesión que la abre; un solo selector decide cuál es «la» corrida de quien llama — Sirve a: C1, C2, C3, C6 (R1, R2, R4, R5, R5b, R6, R12)

`lib/autonomy.js` gana dos funciones de lectura y un selector; todo verbo que hoy usa `findOpenRun` pasa por él.

- `openRuns(mainRoot)` devuelve cada corrida sin cerrar (`{ run, paths }`, por orden de carpeta).
- `selectRun(mainRoot, { session, id })` decide, sin escribir nada, con estas reglas (en este orden):
  1. Con `id`: la corrida abierta con ese id, **sin ninguna comprobación de quién la abrió** (R6, R13). Un id de una corrida cerrada da `not-open`; uno que no existe, `unknown-id`.
  2. Sin corridas abiertas: `no-run`.
  3. Con `session` conocida: la corrida abierta cuya `run.session` es esa. Si no tiene propia: una única corrida abierta **sin** sesión registrada (formato anterior) se trata como hoy (R12, supuesto 6); si todas las abiertas carecen de sesión y hay varias, `ambiguous`; en cualquier otro caso `foreign` (R5b), con la corrida en `item` cuando es la única abierta (solo `status` la usa).
  4. Con `session` desconocida: una sola abierta, esa; varias, `ambiguous` (R5).
- Los rechazos devuelven un mensaje ya escrito que lista cada corrida abierta como `<id> (session <sid>)` y, en `foreign`, los pasos de R5b con el id concreto de cada una: `aether-autonomy continue <id>` si es la propia de una sesión reiniciada, `aether-autonomy end <id> --outcome incomplete` si no. Nunca un `end` sin nombre cuando otra sesión tiene una corrida abierta (R6).
- `start` rechaza solo si **esa sesión** ya tiene una corrida abierta, con el texto de hoy `run <id> is already open` (R2); otra sesión con corrida abierta no estorba (R1). El resto de `start` (carpeta, topes, diario, comprobación de la cita y del `ExitPlanMode`) no cambia: cada sesión comprueba la cita en sus mensajes (supuesto 5).
- `status`, `spend`, `end`, `extend` y `brakeOff` reciben `session` (y `status` y `end` también `id`) y actúan solo sobre la corrida que `selectRun` devuelve. Con `no-run` conservan los mensajes de hoy (`no open run`); con `ambiguous` o `foreign` no modifican nada y devuelven el mensaje (los que lanzan, lanzan; `extend` y `brakeOff` devuelven `{ ok: false, reason, code }`). `status` con una `foreign` única muestra esa corrida con `foreign: true`; con varias, `{ open: true, selected: false, code, runs, message }`.
- Con una sola sesión y una sola corrida nada cambia: las claves de `status`, `start` y `run.json` son las de hoy, y `run.json` solo gana campos nuevos tras `continue`.
- Alternativa descartada: elegir en silencio «la última abierta» (C2 lo prohíbe) o llevar un puntero `current` en un archivo del proyecto (otro estado que se desincroniza; `run.session` ya es la verdad).

### D2. Los topes frenan solo a su sesión — Sirve a: C2 (R3)

`launchRefusal(cwd, { session })` llama a `selectRun` y solo actúa sobre un resultado `ok`; `foreign`, `ambiguous` y `no-run` no rechazan nada. Así el tope vencido de A no rechaza a B ni a una sesión sin corrida. Los tres que lanzan (`delegate begin`, `aether-plan compile`, el diseño) ya pasan la sesión. El mensaje de la pausa de cuota (autonomy.js:917) conserva su texto cuando la corrida es la única abierta; cuando otra sesión tiene una abierta, termina nombrando `aether-autonomy end <id> --outcome incomplete` con el id de esa otra corrida (R6). `lib/wt-stuck.js` deja de parar a un enjambre por el tope de otra corrida: toma la sesión del `state.json` del enjambre (D4) y la pasa a `status`, ignorando una corrida `foreign` (el mod no tiene `CLAUDE_CODE_SESSION_ID`).

### D3. Alcanzar la corrida de otra sesión y continuar la propia tras un reinicio — Sirve a: C3, C6 (R6, R13, R15)

- `status <id>` y `end <id> --outcome …` actúan sobre la corrida nombrada, sin comprobación de dueño, cita ni permiso nuevo.
- `continue <id>` (`continueRun` en `lib/autonomy.js`, verbo nuevo en `autonomy-command.js`): la corrida abierta nombrada pasa a ser de la sesión que llama. Guarda `run.session = <sesión nueva>`, añade la anterior (si existía) a `run.previousSessions`, anota en el diario `## Continuación <iso>` con el id nuevo y el anterior y escribe `run.json` con la escritura atómica de siempre. Se rechaza con mensaje si la sesión que llama no se conoce, si ya tiene otra corrida abierta, o si la corrida nombrada no está abierta; si ya es suya, no cambia nada y lo dice. No toca topes, pausa ni gasto, y no pide cita (el mismo camino sin comprobación de dueño que `end <id>`).
- Alternativa descartada: reasignar la corrida al vuelo cuando la sesión nueva llama a cualquier verbo (sería elegir en silencio, contra C2) o leer los reinicios del transcript (no hay un enlace fiable entre ids).

### D4. El gasto cuenta el trabajo de la sesión de cada corrida — Sirve a: C4 (R7, R8)

- **Quién lanzó el trabajo.** `plan-compile.js` y `lane-delegate.js` escriben `session` en `state.json` (la sesión de la primera compilación; un relanzamiento la conserva); `report.js` `finalize` copia esa `session` al registro de `runs.jsonl`. Las líneas del diario de delegadas ya la traen.
- **Cómo se suma.** `swarmSpend` conserva la ventana de tiempo de hoy y añade un filtro: un enjambre con sesión registrada cuenta en una corrida solo si esa sesión es `run.session` o está en `run.previousSessions`; un enjambre sin sesión registrada (anterior al cambio) se cuenta por la ventana como hoy (R8), y una corrida sin `session` cuenta todo como hoy. El informe del enjambre se pide con la sesión registrada (`report(..., { session })`) para que sus solicitudes nativas sean las de esa sesión; si su uso no se encuentra, se pide como hoy.
- Alternativa descartada: partir el gasto de una ventana compartida por proporción de solicitudes (inexacto) o un archivo nuevo de atribución (el campo `session` en lo que ya se escribe basta).

### D5. El freno de cuota vale para todas las corridas; cada una se reanuda sola — Sirve a: C5 (R9, R14)

En `lib/autonomy.js`: `recordCrossing` recorre todas las corridas abiertas y aplica a cada una la lógica de hoy (pausa nueva, pausa duplicada por `resetsAt`, o cruce sin detención si esa corrida tiene `brakeOff`); devuelve el resultado de la corrida de la sesión que llama (o la primera abierta si no se conoce) con las mismas claves de hoy, más `runs` con el de cada una, así que el mod sigue armando su despertar con `run` y `resumeAt`. `brakeOff` ya es por corrida (D1) y se queda para esa corrida el resto de la corrida (supuesto 10); cada corrida se reanuda con su `brake-off` o al llegar su `resumeAt`, porque `status` ya mide la pausa por corrida. `brakeSettings` informa de la pausa de la corrida de la sesión que llama y, si la sesión no se conoce, de pausada cuando alguna lo está. `recordSaved` anota las unidades guardadas en la corrida de la sesión que lanzó el enjambre (la `session` de su `state.json`, incluidas las sesiones previas de la corrida), y si no hay sesión, en las corridas abiertas cuya ventana contiene el `compiledAt` del enjambre; si no puede atribuirse, no anota y dice `no-attribution` (supuesto 9). En `autonomy-command.js`, `quota-brake` guarda los enjambres en vuelo desde el inicio de la corrida abierta más antigua y los anota con `recordSaved`; ninguna orden del freno pide nombre de corrida.

### D6. Comandos y avisos — Sirve a: C2, C3, C6 (R4, R5, R6, R10, R15)

- `autonomy-command.js`: `status [<id>]`, `end [<id>] --outcome …`, `continue <id>`, y `--session` opcional en `status`, `spend`, `end` (hoy solo `CLAUDE_CODE_SESSION_ID`); `brake-crossing` pasa `--session` al lib; el texto de `USAGE` se actualiza. El id posicional se valida con el mismo patrón `auto-…` de `quarantine`.
- `session-start.js` `autonomyNote(cwd, session)`: si la sesión tiene corrida (propia, o una única sin sesión registrada), escribe la frase de hoy sin cambios (más la pausa de cuota de esa corrida); si otras sesiones tienen corridas abiertas, añade aparte y solo como información cuáles son (id y sesión) y `aether-autonomy continue <id>` para la propia de un reinicio; sin otras corridas el aviso no cambia (R10). Sigue siendo lo último del contexto del arranque.

### D7. Reglas del Lead y guía — Sirve a: C6 (R11)

`skills/using-aether/SKILL.md` (la sección «Autonomous runs»), `skills/autonomous-runs/SKILL.md` («Ceilings», «The quota brake», «Resuming»), `docs/guide/autonomy.md`, `docs/es/guias/trabajar-horas.md` y `docs/reference/components.md` dicen que la corrida es por sesión, cómo alcanzar la de otra (`status <id>`, `end <id>`) y cómo continuar la propia (`continue <id>`). El texto añadido a `using-aether` se paga acortando su vecindad, porque R32 de `tests/session-start-parts.test.js` fija que ninguna parte crezca sobre la base de 0.41.0 y que el arranque se quede en 9.800 caracteres por parte.

## Files

- `plugins/aether/lib/autonomy.js`: D1, D2, D3, D4 (filtro), D5 (cruces, ajustes, guardados).
- `plugins/aether/lib/autonomy-command.js`: D3, D5 (`quota-brake`), D6.
- `plugins/aether/lib/plan-compile.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/report.js`: D4, el campo `session` del estado y del registro final.
- `plugins/aether/lib/wt-stuck.js`: D2, sesión del enjambre.
- `plugins/aether/lib/session-start.js`: D6, el aviso.
- `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/autonomous-runs/SKILL.md`, `docs/guide/autonomy.md`, `docs/es/guias/trabajar-horas.md`, `docs/reference/components.md`: D7.
- Pruebas nuevas: `tests/run-session-fixture.js` (soporte), `tests/autonomy-per-session.test.js`, `tests/autonomy-quota-sessions.test.js`, `tests/autonomy-spend-sessions.test.js`, `tests/run-session-stamp.test.js`, `tests/aether-autonomy-sessions.test.js`, `tests/session-start-sessions.test.js`, `tests/wt-stuck-sessions.test.js`, `tests/run-per-session-docs.test.js`. Pruebas existentes que fijan lo que cambia: `tests/autonomy.test.js`, `tests/autonomy-refusal.test.js`, `tests/aether-autonomy.test.js`, `tests/quota-brake*.test.js`, `tests/autonomy-spend-once.test.js`, `tests/autonomy-swarm-spend.test.js`, `tests/autonomy-abandoned-run.test.js`, `tests/session-start-autonomy.test.js`, `tests/wt-stuck.test.js`, `tests/aether-plan.test.js`, `tests/report.test.js`, `tests/lane-delegate.test.js`, `tests/autonomous-runs-skill.test.js`.

## Verification

Comando: `npm test`. Además `npm run check` antes de la PR (valida el plugin y el mod, que no cambian).

- **C1:** `tests/autonomy-per-session.test.js` abre dos corridas del mismo proyecto con cada una su `run.json` y su diario, y rechaza la tercera de A nombrando la suya.
- **C2:** la misma prueba con A de tope vencido (`launchRefusal` rechaza a A y no a B ni a una sesión sin corrida); cada verbo cambia solo la corrida de quien llama; con una sesión conocida sin corrida propia, `spend`, `extend`, `end` y `brake-off` no cambian ningún archivo y nombran la corrida y su sesión; con quien llama desconocido y dos corridas, ninguna cambia; `tests/aether-autonomy-sessions.test.js` lo repite por el bin.
- **C3:** `status` y `end` por id desde una sesión sin transcript ni marca; los mensajes de `foreign` y de la pausa de cuota traen el id; `continue` sin cita.
- **C4:** `tests/autonomy-spend-sessions.test.js`: dos corridas, un enjambre de cada sesión en la misma ventana, la cifra de cada una suma solo el suyo; el registro final y el relanzamiento conservan la sesión; un enjambre sin sesión cuenta por ventana; tras `continue` cuenta el trabajo de la sesión anterior. `tests/run-session-stamp.test.js` fija el campo `session`.
- **C5:** `tests/autonomy-quota-sessions.test.js`: el cruce pausa las dos; el `brake-off` de una la reanuda y deja pausada la otra; `quota-saved` por sesión y por ventana; `brake-settings`.
- **C6:** `tests/session-start-sessions.test.js` (una y varias corridas, reinicio con otro id), las salidas de una sola sesión con las claves de hoy y una corrida de formato anterior en `tests/autonomy-per-session.test.js`, el reinicio completo (continuar, lanzar, anotar gasto, ampliar y cerrar) en la misma prueba, y `tests/run-per-session-docs.test.js` más `tests/autonomous-runs-skill.test.js` para la guía y las skills.

## Assumptions

1. `run.previousSessions` (lista de ids) es el nombre del campo de las sesiones previas de R15; solo existe tras un `continue`. Reversible.
2. `continue` sobre una corrida que ya es de la sesión que llama no cambia nada y lo dice (no es un rechazo). Reversible.
3. Un enjambre conserva la sesión de su primera compilación aunque otra sesión lo relance con `aether-plan compile --run`; si esa otra sesión es la que continuó la corrida, sigue contando en ella porque la sesión original queda en `previousSessions`. Reversible.
4. Los rechazos de selección usan el código de salida 1 y `{ error: <mensaje>, runs }` en el bin; `extend` y `brake-off` los distinguen de `{ verified: false }` (código 2, cita no válida). Reversible.
5. `spend` sin sesión conocida y con varias corridas pide pasar `--session <id>` (R4: `spend` no se ofrece por id, supuesto 7 del spec). Reversible.
6. No se sube la versión ni se escribe una entrada en `docs/decisions.md`: no los pide el spec. Si se quiere, es un paso de release aparte.

## Risks

- **R5b en la tarjeta y el verificador.** El spec numera `R5b`, pero `aether-plan check` solo reconoce ids `R<número>` (`lib/plan.js:24`): ninguna tarea puede declararlo en `Serves`. Lo sirve la tarea que sirve `R5`, y su prueba lo nombra. No se cambia el spec.
- **Un `run.json` ilegible bloquea a todas las sesiones.** `runs()` lee todas las carpetas y lanza si una no se puede leer, y `launchRefusal` ya convierte ese error en un rechazo; con varias corridas, el estropeo de una frenaría los lanzamientos de las demás. Hoy pasa igual con una; la salida ya existe (`aether-autonomy quarantine run <id>`). No se amplía.
- **Un enjambre sin sesión registrada cuenta en todas las corridas cuya ventana lo contiene (R8).** Es la regla del spec; solo afecta a enjambres anteriores al cambio que coincidan con dos corridas abiertas a la vez.
- **Un reinicio sin `continue` lanza sin topes.** Hasta que la sesión nueva continúa su corrida, `launchRefusal` no la frena (R3 y supuesto 8 del spec). El aviso de inicio y la guía piden continuar primero; no hay un enlace fiable entre ids para hacerlo solo.
- **Carrera al escribir `run.json`.** Dos sesiones escriben cada una su archivo, pero el cruce de cuota escribe en todos. `writeJsonFile` es atómico (temporal y `rename`); la carrera de leer-modificar-escribir sobre una misma corrida existe hoy y el spec deja fuera el candado (#223 es del registro de permisos).
- **R32 de las partes del arranque.** Añadir texto a `using-aether` puede romper el tope; la tarea 9 lo mide y acorta lo de al lado.
- **El mod no cambia.** `hooks/register.js` ya pasa `--session` y lee `run`, `resumeAt` y `duplicate` del resultado de `brake-crossing`; D5 conserva esas claves. Si el resultado de varias corridas las cambiara, `npm run test:mod` lo vería.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| None. | — | — |
