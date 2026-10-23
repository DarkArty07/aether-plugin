# Plan: el plugin se observa a sí mismo

**Spec:** [spec.md](spec.md). Este plan no repite sus criterios (C1 a C13), escenarios (E1 a E14) ni requisitos (R1 a R17): los cita.

## Technical context

- **Stack.** Node.js 22, CommonJS, sin dependencias. El mod (`plugins/aether/hooks/*.mjs`, `register.js`) es ESM y no importa `lib/`. Las pruebas del repositorio son `node --test "tests/*.test.js"`; las del mod son `.test.ts` y corren con `claude plugin test plugins/aether`.
- **Estructura que se toca.** `bin/aether-*` son delgados y `lib/` tiene la lógica (CLAUDE.md). Hoy hay once bins; los hooks de comando son `SessionStart` y `PreToolUse` (`hooks/hooks.json`); el mod registra cada petición en `<data dir>/usage/<sesión>/`, y `aether-session-start` poda a 30 días `usage/`, `lanes/` y `sessions/`.
- **Datos que ya existen y que se leen sin cambiar** (campos, nunca texto): `delegates/log.jsonl` (sin poda; entradas `launch`, `result`, `outcome`, `verdict`, `answer`), `lanes/<sesión>.jsonl` (30 días; `lib/lanes.js` `readLog`), `runs.jsonl`, `<repo>/.aether/pending.jsonl` (`lib/pending.js`), `<repo>/.aether/autonomy/grants.json` (`lib/autonomy.js`), `config/ladder.json`, `config/pairs.json`, `config/prices.json`.
- **Medido en esta corrida (2026-10-23, Claude Code 2.1.309).** El binario nombra estos eventos de hook además de los dos de hoy: `PostToolUse`, `PostToolUseFailure`, `StopFailure`, `SubagentStop`, `SessionEnd`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `PermissionDenied`, `TaskCompleted` (búsqueda de cada nombre en el binario). El plan usa cinco: `PostToolUse` (solo `ScheduleWakeup`), `PostToolUseFailure`, `StopFailure`, `PreCompact` y `SessionEnd`. `UserPromptSubmit` queda fuera: su entrada es el texto del usuario.
- **Medido al revisar (2026-10-23).** `claude plugin validate --strict` acepta los cinco nombres en un `hooks.json` y rechaza uno inventado (`unknown hook event`). Un mercado no admite la ruta de un plugin con `..` (`Path contains ".."`): un segundo archivo de mercado dentro de este repositorio no alcanza `plugins/aether`, y el mercado de la raíz ya llama `aether` a su única entrada.
- **No hay constitución** (`.specify/memory/constitution.md` no existe).

## Gate

- Nada especulativo, y nada para una necesidad hipotética. **Pasa.** Cada pieza de abajo sirve a un requisito; el diseño no añade modificar el código propio (A1), ni canal de salida, ni más hooks de los cinco.
- Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida. **Pasa**, con las seis piezas que la tabla de Complexity nombra, cada una atada a un requisito. Sin dependencias nuevas.

## Design

### D1. Dos métodos de instalación, los dos desde este repositorio y los dos con el nombre `aether`. Serves: C6, C7, C8; R4, R9, R11

La tarjeta pide «dos metodos de instalacion» y deja el empaquetado al diseño. Un mercado con dos entradas `aether` no cabe y un segundo mercado no alcanza el plugin (medido arriba), así que el segundo método no es otro paquete del mercado: es el árbol del repositorio, que ya es como el dueño prueba una rama.

1. **Estándar:** `claude plugin marketplace add DarkArty07/aether-plugin` y `claude plugin install aether@aether-plugin`. Instala solo `plugins/aether/`. Reúne lo de D2 y nada de conversaciones.
2. **De desarrollo, desde el árbol:** un clon o un worktree del repositorio, lanzado con `AETHER_OBSERVE=dev scripts/aether-lead --plugin-dir <árbol>/plugins/aether` (el mismo lanzador de «Probar una rama» de `CLAUDE.md`; usa el directorio de datos `aether-inline`). Reúne todo lo de la estándar (A8) y, además, los fragmentos de D8.

La separación no es una opción que el usuario conmute en la instalación estándar: `observeMode(env, root)` devuelve `dev` solo si la variable vale exactamente `dev` **y** `root` (la raíz del plugin que corre) es un árbol del repositorio, es decir, existe `<root>/../../.claude-plugin/marketplace.json` y la carpeta madre de `root` se llama `plugins`. El plugin instalado desde el mercado vive en la caché de Claude Code, fuera de ese árbol: con la variable puesta sigue siendo estándar (una prueba lo copia a una carpeta así y lo comprueba). No hay opción nueva en `userConfig`. El código que lee conversaciones es **un solo archivo**, `lib/observe-dev.js`, cargado con `require` perezoso solo en `dev`; una prueba estática comprueba que ningún otro archivo de observación nombra `transcript`. Que ese archivo viaje en la instalación estándar (sin usarse) es lo que la pregunta Q1 deja al dueño. Cumple A4 con la prueba como garantía y no con el empaquetado.

**Lo que la instalación de desarrollo no es.** No es el plugin instalado del dueño: es un clon o un worktree lanzado con `--plugin-dir`, que sigue una rama y no una versión publicada. Y escribe en otro directorio de datos: `lib/run.js` `dataDir` da `aether-inline` a toda raíz fuera de la caché, mientras que el instalado usa `aether-aether-plugin`. Mientras el dueño use las dos, sus observaciones, delegados y lanes quedan repartidos en dos lugares y la «sola ubicación» de C4 vale para cada directorio de datos, no entre ambos. `dataDir` respeta `AETHER_DATA_DIR`, así que la orden de desarrollo puede llevarlo a su directorio real (`AETHER_DATA_DIR=~/.claude/plugins/data/aether-aether-plugin AETHER_OBSERVE=dev scripts/aether-lead --plugin-dir …`); este plan no lo pone por defecto y lo deja al dueño en Q1. La spec lo dice igual en A10.

### D2. Qué reúne la estándar: eventos con lista cerrada de campos. Serves: C2, C7; R3, R4, R10

Cinco hooks de comando nuevos en `hooks/hooks.json` llaman todos a `aether-observe hook`; el evento viene en `hook_event_name` de la entrada. Solo actúan en una sesión del Lead (la misma marca `sessions/<id>.json` que usa `aether-guard`, `isAetherSession`). Cada uno guarda **solo** estos campos, con estos nombres de entrada:

| Hook | Campos que se toman de la entrada |
|---|---|
| `PostToolUse` (matcher `ScheduleWakeup`) | `tool_name` |
| `PostToolUseFailure` | `tool_name`, `is_interrupt` |
| `StopFailure` | `error` (código de error) |
| `PreCompact` | `trigger` |
| `SessionEnd` | `reason` |

Más `session_id` y la hora (y, en `SessionEnd`, `cwd`, que solo dice dónde buscar `.aether/` para la lectura de D7 y no se guarda). `cleanEvent` es la lista cerrada: solo las claves `time, session, kind, tool, class, reason, trigger, interrupted`, y un valor solo si es una palabra de forma de identificador (`^[A-Za-z0-9_.:-]{1,64}$`); lo demás se cambia por `unclassified`. La entrada de un hook trae más (el texto del error, `tool_input`, `transcript_path`, el prompt): el bin la lee entera porque así la entrega Claude Code, toma los nombres de la tabla y no abre ningún archivo ni guarda otra clave. Las líneas van a `<data dir>/observe/events.jsonl`. El hook no escribe en pantalla nunca (ni en una sesión del Lead).

### D3. Los fallos silenciosos del mod dejan rastro (auditoría de R1). Serves: C1, C7; R1

Auditoría de los 31 `catch` (el conteo es `grep -c catch`: `register.js` 25, `delegate.mjs` 5, `quota-brake.mjs` 1). **Real** = el mod hoy traga un fallo que cambia lo que se midió o se ejecutó; **esperado** = una ausencia normal con valor de respaldo documentado.

| Archivo y sitio | Clase | Fuente del rastro / razón |
|---|---|---|
| `register.js` `readDataDir` lectura de variable de entorno | esperado | variable sin definir cuenta como no definida |
| `register.js` `readDataDir` `$.plugin.root`/`name` | esperado | valor ausente cuenta como indefinido |
| `register.js` `currentSession` | esperado | sin identificador de sesión no hay sesión que medir |
| `register.js` `isAether`, `fs.exists` de la marca | **real** | `register.marker-check`, clase `read-failed` (apaga el medidor sin decirlo) |
| `register.js` `init`, `fs.list` de partes | esperado | aún no hay partes |
| `register.js` `init`, `session.version` | esperado | `claudeCode` queda `null` |
| `register.js` `flush` | **real** | `register.flush`, `write-failed` |
| `register.js` `saveLanePayload` | **real** | `register.lane-payload`, `write-failed` |
| `register.js` `opsOff`, `fs.exists` | esperado | por defecto el mod corre las órdenes |
| `register.js` `opsCommand` | esperado | un prompt que no es de operaciones |
| `register.js` `delegateContext` | **real** | `register.delegate-context`, `read-failed` (la escalera se salta) |
| `register.js` `meteredStep` `clock.now` | esperado | `started` queda `null` |
| `register.js` `meteredStep` exterior | **real** | `register.meter-step`, `write-failed` (no queda el registro de la petición) |
| `register.js` `armResume` `prompt.submit` | esperado | la sesión terminó antes |
| `register.js` `brakeStepOnce` lectura de ajustes (dos sitios) | **real** | `register.brake-settings-start` y `register.brake-settings-recheck`, `settings-unreadable` |
| `register.js` `brakeStepOnce` `ui.notify` | esperado | el cruce ya guarda `notify.reason: 'error'` |
| `register.js` `brakeStepOnce` exterior | **real** | `register.brake-step`, `handler-threw` |
| `register.js` cuatro `.catch(($, e, next) => next(e))` (SessionStart, agent.offer, tool.call, agent.spawn) | **real** | `register.on-session-start`, `register.on-agent-offer`, `register.on-tool-call`, `register.on-agent-spawn`, `handler-threw` |
| `register.js` `turn.step` `clock.now` (dos sitios) | esperado | la hora queda `null` |
| `register.js` `turn.step` `process.run` | **real** (solo la rama que no es la de tiempo agotado) | `register.ops-run`, `spawn-failed` |
| `delegate.mjs` `step` (espera con latido) | **real** | `delegate.step`, `handler-threw` |
| `delegate.mjs` registro de la respuesta | **real** | `delegate.answer`, `write-failed` |
| `delegate.mjs` `begin` | **real** | `delegate.begin`, `handler-threw` (la llamada sale como el Lead la hizo, sin escalera) |
| `delegate.mjs` captura que relanza | esperado | no traga: relanza |
| `delegate.mjs` `bind` | **real** | `delegate.bind`, `handler-threw` |
| `quota-brake.mjs` `jsonFrom` | esperado | una línea que no es JSON es `null` |

Resultado: **17 reales y 14 esperados.** Un sitio real llama a `recordFault($, state, source, cls)` (en `delegate.mjs`, por `ctx.fault(source, cls)`, porque el contexto de la escalera ya llega ahí). `recordFault` no se espera con `await`, no lanza y escribe `<data dir>/observe/faults/<sesión>.json` = `{ session, count, faults: [{ time, source, class }] }` (hasta 100 entradas; `count` sigue). Solo guarda la fuente (una de las 17) y la clase (`write-failed`, `read-failed`, `settings-unreadable`, `handler-threw`, `spawn-failed`, otra cosa es `unclassified`); nunca el mensaje del error, que puede traer rutas o contenido. Dos pruebas fijan la auditoría: el conteo de `catch` por archivo y la presencia de las 17 fuentes. `delegate-wait.mjs` tiene 3 `catch` más y no está en la lista de R1; queda fuera (pregunta Q2).

### D4. Detectores puros sobre campos. Serves: C1; R2

`lib/observe-detect.js` son cuatro funciones puras que reciben entradas ya leídas y los umbrales, y devuelven hallazgos (forma de D7). Cuatro, cada una con su evidencia de identificadores, líneas y fechas:

- **Subida sin razón (E2).** Un `launch` con `launchKind: 'rise'` cuyo `verdict` anterior de la misma tarea no trae `next.kind: 'rise'` con una causa en `exhausted`, `repeated` o `infeasible`. Se prefiere esto a repetir el juicio de la escalera: no depende de que `ladder.json` siga como estaba cuando el dueño lo recalibre.
- **Pair que falla (E3).** Entradas `outcome` del registro de delegados, por `harness/model`, en orden de hora: una racha de al menos `pairFailures.consecutive` con estado distinto de `ok` en tareas distintas.
- **Regla rota (E4).** Un evento `PostToolUse` con `tool: ScheduleWakeup` de una sesión mientras una tarea de delegado de esa sesión está abierta (su última entrada antes de la hora no es un `verdict` `approved` ni `exhausted`).
- **Bloqueo por error (E5).** Una entrada de `pending.jsonl` (clase, hora y **huella** del comando) con una concesión posterior de la misma clase en `grants.json` (`added`), o la misma huella otra vez. La huella es `sha256` de las palabras del comando separadas por un espacio, 12 caracteres hex; se calcula en memoria al leer y es lo único que sale. Ni el comando ni la cita de la concesión se copian.

### D5. Calibración que solo propone. Serves: C3, C12; R5, R6

`lib/observe-calibrate.js`, también puro: `approvalByStep` (lanzamientos y aprobaciones por escalón del registro de delegados) y `calibrationSignals`, con cinco señales, cada una con `numbers` y una `proposal` en texto: escalón que casi nunca aprueba (`approval.lowRate` con al menos `approval.minAttempts` lanzamientos), pair con salida por segundo por debajo de `pairSpeed.ratio` de su ficha (`pairs.json` `outputTokensPerSecond`, buscada por `harness`, `group` y `effort`, que es lo que traen las llamadas de `lanes/`), pair con tasa de fallo mayor que `pairFailureRate.maxRate`, rol del diseño con más rondas que `designRounds.maxRounds` en un mismo diseño, y costo real contra `costPerTaskUsd` de la ficha fuera de la razón `cost.ratio` (real = tokens de la llamada con `prices.priceEntry`; un modelo sin precio se cuenta aparte y no entra). Ninguna función escribe: la prueba compara el contenido de `config/*.json` y `agents/*.md` antes y después (R6). Los umbrales viven en `config/observe.json` (A7).

### D6. El resumen durable y la poda. Serves: C2, C5; R3, R8

`lib/observe-digest.js` mantiene `<data dir>/observe/summary.json` = `{ version: 1, sessions: { <id>: entrada } }`, con la entrada de cada sesión de **solo conteos**: `first`, `last`, `events` por clase, `toolFailures` por herramienta, `faults` por fuente, `lanes` por `harness/group@effort` (`calls`, `ok`, `outputTokens`, `durationMs`, `usd`) y `seats` por `diseño/rol` (rondas). `digestSession` recalcula la entrada de una sesión desde lo que hay en disco y **nunca borra** una entrada existente cuyas fuentes ya no están; `digestAll` lo hace para cada sesión que aparece en eventos, fallos o `lanes/`. `pruneObserve` primero digiere, luego quita de `events.jsonl` las líneas de más de 30 días, y borra los archivos de fallos y los fragmentos de desarrollo de más de 30 días; el resumen no se poda (A5). Se digiere en tres lugares, para que ninguna fuente muera antes: `SessionEnd`; al empezar una sesión del Lead, **antes** de `pruneUsage`/`pruneLog` en `aether-session-start`; y dentro de la lectura (`readObservations` llama `digestAll` antes de leer, D7). Escritura atómica (archivo temporal y `rename`), como `spend-archive.js`.

### D7. Una lectura, hallazgos ordenados y el issue redactado. Serves: C1, C4, C9; R2, R7, R12, R13

`lib/observe-read.js` junta las fuentes de D4 y D5 (más el resumen durable para las sesiones cuyo registro ya se podó), corre detectores y calibración y devuelve la lista. Hallazgo: `{ id, kind: 'failure'|'calibration'|'friction', type, title, evidence: string[], numbers, firstTime, lastTime, sessions, proposal?, issue? }`. Los de clase `failure` (D4 y los fallos del mod de D3) llevan `issue: { title, body }` en Markdown con la evidencia; `friction` son los fallos de herramienta y las compactaciones por sesión. Orden: `failure`, luego `calibration`, luego `friction`; dentro de cada una, más evidencia primero, luego el más reciente, luego `id`. Los issues se escriben como texto en `<data dir>/observe/issues/<id>.md`, y la lista entera en `<data dir>/observe/read.json` (la última lectura: el lugar donde el dueño encuentra, al volver, lo que la lectura automática dejó). Cada lectura lo sobrescribe y sus hallazgos de comandos bloqueados (`pending.jsonl`, `grants.json`) cubren solo el repositorio de la sesión que la hizo; lo demás sale de `<data dir>` y no depende del repositorio). **La lectura corre sola:** el manejador de `SessionEnd` (D2) la llama después de digerir la sesión, con `repoRoot` igual al `mainRoot` de `repoPaths(cwd)` (`lib/git.js`) para el `cwd` de la entrada del hook, o `null` fuera de un repositorio, como el bin, porque `.aether/` vive en el checkout principal y no en un worktree, y por eso los hallazgos, la calibración y los issues redactados existen sin que el dueño corra ningún comando; el comando `read` (D10) solo la repite y la imprime. Como los detectores leen todo el historial y no solo la sesión, una sesión que murió sin `SessionEnd` queda cubierta por la siguiente. En una sesión que no es del Lead el manejador sale antes de todo y no lee nada (C10). Nada abre una conexión ni ejecuta `gh`; una prueba estática comprueba que los archivos de observación no usan módulos de red ni de procesos. En el modo `dev` el texto del issue puede nombrar el archivo del fragmento y no copiarlo (un issue es público).

### D8. Fragmentos de conversación en la de desarrollo, con claves borradas. Serves: C8; R11

`lib/observe-redact.js` (`redact`) y `lib/observe-dev.js` (`fragmentFrom`, `captureFragment`). Solo en modo `dev` y solo para `PostToolUseFailure`, `StopFailure` y `PostToolUse` de `ScheduleWakeup`, guarda los últimos 6 registros del transcript (rol, clase y texto recortado a 400 caracteres, ya redactado) en `observe/dev/<sesión>/<hora>-<evento>.json` con permisos `600`, hasta 50 por sesión; nunca la conversación entera. Redacta: claves de la forma `sk-…`, tokens `ghp_`/`gho_`/`github_pat_`/`xox?-`, `AKIA…`, JWT (`eyJ….….…`), `Authorization: Bearer …`, pares `nombre=valor`/`nombre: valor` donde el nombre contiene `key`, `token`, `secret`, `password` o `passwd`, bloques `-----BEGIN … PRIVATE KEY-----`, y cualquier tira de 32 o más caracteres de base64 o hex. Lo que no se reconoce no se arregla: por eso son 6 registros de 400 caracteres y no más.

### D9. Línea base. Serves: C12, C13; R6, R15

`lib/observe-baseline.js`: `baseline({ from, to, repoRoot })` lee el directorio `from` (por defecto el propio; para el real del dueño, `aether-aether-plugin`) en solo lectura y escribe `observe/baseline.json` solo en `to`. Lee las seis fuentes de R15, solo como campos y conteos: la bitácora de delegados y el registro de lanes (las tres respuestas de abajo), `runs.jsonl` (corridas terminadas y abandonadas, y el costo de lista de las terminadas, `report.cost.run.usd`, con su mínimo, mediana y máximo), `usage/` (sesiones y partes, sin abrir una petición), `exams/` (exámenes guardados) y `<repoRoot>/.aether/pending.jsonl` (entradas por clase; `repoRoot` es opcional y sin él cuenta cero). Responde con números: `approvalsByStep` (lanzamientos y aprobaciones por escalón), `noCandidate` (entradas `status: 'no-candidate'` y `took` con `cause: 'no-candidate'` de `lanes/`, contra el total de llamadas) y `haikuCost` con las dos sumas de R15 más `unpriced`: «cuesta» es el precio de los intentos de las tareas que subieron y quedaron por debajo del escalón que las aprobó; «ahorra» es, para las tareas aprobadas en Haiku, el precio de sus mismos tokens (`input`, `output`+`thinking`, `cacheRead`) al precio de `sonnet` de `prices.json` menos su precio real; un intento sin precio se cuenta en `unpriced` y no se inventa. Corre una vez sobre los registros reales como parte de la verificación (no entra en el árbol, A9).

### D10. Un solo bin `aether-observe`. Serves: C4, C11, C12; R3, R7, R13, R14, R15

Verbos: `hook` (los cinco hooks, sin salida; en `SessionEnd` digiere y corre la lectura de D7), `read` (repite la lectura de D7 y la imprime ordenada, una línea JSON), `baseline [--from <dir>]`, `status` (lo reunido por clase y tamaño: eventos, fallos, resumen, fragmentos, issues, lecturas) y `forget --yes` (borra `<data dir>/observe/` entero; sin `--yes` imprime qué borraría y no borra nada, y es la orden de clase `delete` que el dueño da a mano). Todos menos `hook` funcionan desde cualquier shell, como `aether-report`; `hook` actúa solo en una sesión del Lead.

### D11. Aislamiento de la corrida. Serves: C13; R17

Todo corre en la rama `feat/self-observation` y su worktree. Ninguna prueba toca el directorio de datos real: todas fijan `AETHER_DATA_DIR` a un directorio desechable. La única lectura del directorio real es la de la línea base, por `--from`, sin escribir. No se sube, no se publica, no se funde.

## Files

Todos bajo `plugins/aether/` salvo que se diga. «Prueba» es un archivo de `tests/`.

- `lib/observe.js`, `config/observe.json`: el almacén y los umbrales (D1, D2, D10).
- `lib/observe-detect.js`: los cuatro detectores (D4).
- `lib/observe-calibrate.js`: la calibración (D5).
- `hooks/fault-trace.mjs`, y los cambios en `hooks/register.js` y `hooks/delegate.mjs`: el rastro de los 17 sitios (D3). `hooks/quota-brake.mjs` no cambia: su único `catch` es esperado.
- `lib/observe-digest.js` y `bin/aether-session-start`: el resumen durable y su lugar en la poda (D6).
- `lib/observe-redact.js`, `lib/observe-dev.js`: la de desarrollo (D8).
- `lib/observe-baseline.js`: la línea base (D9).
- `lib/observe-read.js`: la lectura (D7).
- `lib/observe-hook.js`: el manejador de los cinco hooks y, en `SessionEnd`, la lectura automática (D2, D7).
- `bin/aether-observe`, `hooks/hooks.json`: el bin y el cableado (D10). Sin opción nueva en `plugin.json` (D1). Con ellos, lo que su cambio rompe: `tests/components-docs.test.js`, `tests/docs-facts.test.js` y la frase y la fila de `docs/reference/components.md` (once bins pasan a doce).
- `docs/guide/observe.md`, `docs/index.md`, `README.md`, `CLAUDE.md` y una frase nueva en `docs/reference/components.md`: la documentación nueva (R16).
- Pruebas nuevas: `tests/observe.test.js`, `observe-detect`, `observe-calibrate`, `fault-trace`, `fault-sites`, `observe-digest`, `observe-dev`, `observe-baseline`, `observe-read`, `observe-hook`, `observe-bin`, `observe-docs`, `observe-guarantees` (todas `.test.js`), y `hooks/fault.test.ts`.

## Verification

- Comando: `npm test`. Para el mod: `npm run test:mod`. Antes de cerrar: `npm run check` (incluye `npm run validate`, la validación `--strict` de la plugin y del mercado).
- **C1 / R1, R2:** `observe-detect` (cada comportamiento sobre registros falsos, cero llamadas a un modelo), `fault-trace`, `fault-sites` y `fault.test.ts` (cada fallo real deja rastro y la petición no cambia); `observe-hook` y `observe-guarantees` (un `SessionEnd` de una sesión del Lead deja los hallazgos y los issues redactados sin que se corra ningún comando, y en una sesión normal no deja nada).
- **C2 / R3:** `observe-hook` y `observe-bin`: una sesión simulada con la marca de Lead, sin orden del dueño, deja un evento nuevo y su entrada en el resumen; sobre el árbol de hoy la prueba falla. El fallo del mod de esa sesión lo cubre `fault.test.ts` (el mod no corre en las pruebas de Node), y `observe-digest` comprueba que la entrada del resumen cuenta los fallos del archivo de la sesión.
- **C3 / R5, R6:** `observe-calibrate`, con el contenido de `config/` y `agents/` comparado antes y después.
- **C4 / R7:** `observe-read` (orden, evidencia, texto del issue).
- **C5 / R8:** `observe-digest` (registros de más de 30 días, la poda, el resumen completo, y la lectura que lo usa en `observe-read`).
- **C6 / R9, R16:** `npm run validate` (plugin y mercado, `--strict`), `observe-bin` (los hooks) y `observe-docs` (los dos métodos, con sus órdenes); `observe.test.js` y `observe-guarantees` prueban cada método: dentro del árbol, con `AETHER_OBSERVE=dev`, la instalación guarda fragmentos; copiada a una carpeta de caché de Claude Code y con la misma variable, sigue siendo estándar.
- **C7 / R4, R10:** `observe-guarantees` (la frase marcada no aparece en nada de `observe/`, en las tres lecturas y en el bin; el barrido estático de `transcript`).
- **C8 / R11:** `observe-dev` y `observe-guarantees` (clave y token borrados, contexto presente).
- **C9 / R12:** `observe-guarantees` (barrido estático de módulos de red y procesos, y un `gh` falso que no se llama).
- **C10 / R13:** `observe-guarantees` (cada hook en una sesión sin marca: ni escritura ni salida) y `observe-docs` (la huella en `components.md`).
- **C11 / R14:** `observe.test.js` (`status`, `forget`) y `observe-bin`.
- **C12 / R15:** `observe-baseline` (las seis fuentes de R15), y una corrida real de `aether-observe baseline --from ~/.claude/plugins/data/aether-aether-plugin` en la verificación final, con sus números en el resumen del Lead.
- **C13 / R17:** `observe-guarantees` (un `HOME` desechable queda vacío) y, al terminar, `git status` del checkout principal y `claude plugin list` (0.19.2) sin cambio, y la rama sin fundir.
- **No se verifica en esta corrida:** el comportamiento de los cinco hooks dentro de una sesión real de Claude Code (la entrada de cada uno se simula con la forma documentada); queda como la primera cosa que mirar al usarlo (Q3).

## Assumptions

- **P1.** La variable que activa la de desarrollo se llama `AETHER_OBSERVE` y vale `dev`; el nombre es reversible y solo vive en `lib/observe.js` y en las órdenes de la documentación.
- **P2.** Los cinco eventos de D2 son suficientes; `SubagentStop`, `PostCompact`, `PermissionDenied` y `TaskCompleted` se pueden añadir después sin cambiar el formato.
- **P3.** El borrado es `aether-observe forget --yes`; sin `--yes` no borra.
- **P4.** Los fallos del mod: un archivo por sesión, 100 entradas como máximo con un contador total.
- **P5.** El resumen durable no se poda: una entrada pesa unas pocas centenas de bytes por sesión.
- **P6.** `read` imprime una línea JSON, como los demás bins; el Lead (o el dueño) la presenta.
- **P7.** Fragmentos de la de desarrollo: últimos 6 registros, 400 caracteres, hasta 50 por sesión, permisos `600`, poda a 30 días, sin entrar al resumen.
- **P8.** Para los fallos de un pair se agrupa por `harness/model` del registro de delegados; para compararlo con su ficha se busca por `harness`, `group` y `effort` de las llamadas de `lanes/`.
- **P9.** El costo estimado contra el real solo mira modelos con precio en `prices.json`; los demás se cuentan aparte.
- **P10.** Los umbrales iniciales de `config/observe.json`: `pairFailures.consecutive` 3; `approval.minAttempts` 5 y `lowRate` 0.2; `pairSpeed.minCalls` 5 y `ratio` 0.5; `pairFailureRate.minCalls` 5 y `maxRate` 0.4; `designRounds.maxRounds` 6; `cost.minCalls` 3 y `ratio` 2; `blockedByMistake.repeatBlocks` 2. Son datos, el dueño los cambia sin tocar código.
- **P11.** No se cambia el skill `using-aether`: la detección es automática (D7) y no necesita que el Lead conozca nada; el Lead no aprende los comandos `read`, `status` y `forget` en esta actualización, el dueño los corre o se los pide por su nombre (sugerencia al final).
- **P12.** Sin versión nueva ni decisión numerada en esta corrida (A10 y el issue #50).

## Risks

- **La entrada de un hook trae contenido.** El bin la lee entera y solo toma los campos de D2; el riesgo es una clave de más. La lista cerrada `cleanEvent` y la prueba de la frase marcada lo cubren, y la prueba estática impide que otro archivo abra `transcript_path`.
- **Un nombre de campo de hook distinto del medido** (`is_interrupt`, `error`, `trigger`, `reason`). Si falta, el campo se omite y el evento se guarda igual; Q3.
- **El rastro de un fallo del mod puede fallar a su vez** (mismo disco). Es un mejor esfuerzo: `recordFault` no lanza y no reintenta; un fallo que no se puede escribir sigue en silencio, y la prueba lo fija.
- **Los 5 hooks lanzan un proceso `node`** en una sesión que no es del Lead. Son eventos raros (fallo de herramienta, compactación, fin de sesión, `ScheduleWakeup`), cada uno sale sin escribir; `components.md` lo mide.
- **La lectura automática en cada `SessionEnd` recorre el historial.** Es de solo lectura y local, y sale antes de todo en una sesión que no es del Lead; si pesara, el umbral de `config/observe.json` puede añadir un mínimo de minutos entre lecturas sin cambiar el formato.
- **Claude Code corta un hook de `SessionEnd` a los 1500 ms si nadie le da más.** Medido en el binario 2.1.309: el presupuesto por omisión es 1500 ms, `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` lo cambia y el `timeout` del propio hook lo sube hasta un tope. La entrada de `SessionEnd` de `hooks.json` pide `timeout: 30` y una prueba lo fija; **no se midió** que Claude Code cuente el `timeout` de un hook de plugin (el código que lo suma lee los hooks de los ajustes), así que el hook puede morir a los 1500 ms. Si muere, nada se rompe en la sesión, pero si el corte es sistemático (el `timeout` de un hook de plugin no cuenta) se repetirá en cada `SessionEnd` y el siguiente no recupera nada. El dueño conserva entonces `aether-observe read` a mano, que corre la misma lectura fuera del hook, y el resumen que `aether-session-start` ya digiere al empezar una sesión del Lead. Es lo segundo que se mira en la primera sesión real (Q3).
- **La poda de 30 días contra el resumen:** el orden importa. Una sola prueba pone un registro viejo, corre el inicio de sesión y exige que el resumen conserve sus conteos.
- **El texto del issue en el modo `dev`:** el texto nombra el fragmento y no lo copia; si no, un issue público filtraría una conversación.
- **La spec fija «unos 31» `catch`:** el conteo real coincide (25, 5, 1); un `catch` nuevo falla `fault-sites` hasta que se clasifique.
- **Mismo cambio de una opción y un bin rompe pruebas de documentos existentes** (conteos y tabla de opciones): están en la tarea que los cambia, no en una posterior.

## Questions

- **Q1. ¿Basta que la instalación de desarrollo sea el árbol del repositorio, sin una entrada propia en el mercado?** Se construye así porque un segundo mercado no alcanza `plugins/aether` y la entrada `aether` ya existe (medido en Technical context). Se vuelve a abrir si el dueño exige que `lib/observe-dev.js` no viaje en la instalación estándar: habría que mover el archivo fuera de `plugins/aether/`, y la de desarrollo lo buscaría en el árbol. **También:** ¿es aceptable que «la instalación de desarrollo» sea un clon lanzado con `--plugin-dir`, que sigue una rama y no una versión, y que escribe en `aether-inline` y no en el directorio de datos del instalado? Si no, la orden documentada fija `AETHER_DATA_DIR` al directorio real del dueño (D1).
- **Q2. ¿Entra `hooks/delegate-wait.mjs` en la auditoría de R1?** Tiene 3 `catch` y la spec solo nombra `register.js`, `delegate.mjs` y `quota-brake.mjs`; queda fuera.
- **Q3. ¿Traen los cinco hooks los campos medidos dentro de una sesión real?** Los nombres `is_interrupt`, `error`, `trigger` y `reason` salen del binario y de la forma documentada, no de una sesión; si falta uno, el evento se guarda sin él. Es lo primero que se mira al usarlo, junto con el presupuesto de tiempo del hook de `SessionEnd` (Risks): si `observe/read.json` no se actualiza al cerrar una sesión, el hook muere a los 1500 ms.
- **Q4. ¿«Costo estimado» de C3 es `costPerTaskUsd` de la ficha o el costo del plan contra el real de `runs.jsonl`?** Se construye lo primero (P9, D5). Lo segundo se podría añadir como otra señal; `runs.jsonl` ya entra en la línea base (D9).
- **Q5. ¿`forget` debe borrar también `usage/`, `lanes/` y `delegates/`, que la observación lee?** No: E11 habla de «lo reunido», y esos tres son registros que el plugin ya tenía antes de esta corrida; `forget` borra solo `observe/` (D10). Si el dueño los quiere dentro, es otra orden de clase `delete`.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Un bin nuevo, `aether-observe` (12.º de `bin/`) con cinco verbos | R3 (el hook), R7 (la lectura), R14 (ver y borrar) y R15 (la línea base) | Añadir los verbos a `aether-report`: ese bin carga la lógica de gasto en cada llamada y el hook corre en cada fallo de herramienta; un bin propio arranca solo lo que usa y deja `aether-report` sin cambio |
| `observeMode(env, root)`: la variable `AETHER_OBSERVE` más la comprobación de que la raíz es un árbol del repositorio | R9 y R11: es lo que separa las dos instalaciones sin un segundo paquete | Dos plugins en el mercado: duplican agentes, skills y bins y chocan en `aether:`; una opción de `userConfig`: cualquiera la activa desde la instalación estándar y no hay dos métodos |
| Un resumen durable con su digestión (`observe-digest.js`) | R8: la poda de 30 días borra el uso y el registro de lanes, y la pausa dura semanas | Alargar la poda de `usage/` y `lanes/`: guarda las peticiones enteras y no conserva solo conteos |
| `config/observe.json` con los umbrales | R2 y R5, con la asunción A7: los umbrales son datos, como los de `ladder.json` | Constantes en el código: el dueño tendría que tocar código para recalibrar |
| `hooks/fault-trace.mjs` y 17 llamadas en `register.js` y `delegate.mjs` | R1: cada fallo real que el mod traga debe dejar rastro | Un único `catch` global: no distingue los 14 casos esperados y deja la lista de la auditoría sin prueba |
| La lista cerrada `cleanEvent` y el módulo `observe-dev.js` aparte | R4, R10 y R11: lo que la estándar guarda es demostrablemente un conjunto cerrado, y el código que lee conversaciones es un solo archivo | Guardar la entrada del hook y filtrar al leer: la frase marcada llegaría al disco; leer el transcript en el manejador del hook: no se puede probar que la estándar no lo hace |
