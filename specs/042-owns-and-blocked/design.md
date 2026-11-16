# Diseño corto 042: lo que un plan no ve fuera de Owns, y qué pasa cuando una unidad choca con ello

Issues: #263, #266 y #294. Es un diseño corto: cinco cambios acotados, sin módulos, bins ni opciones nuevas, salvo un archivo de datos opcional por proyecto.

## Palabras del dueño

1. «quiero que resuelvas todos los issues de manera autonoma» (2026-11-16).
2. «ese no lo quiero es sobre ingneieria» (2026-11-12, decisión A123): nada que no haga falta.

## El problema, con lo que hoy hace el código (rama `fix/open-issues-9`, 2026-11-16)

Una unidad del enjambre, o una tarea delegada, no puede terminar porque lo que le falta está en un archivo fuera de su `Owns`. Gasta intentos, modelos caros y horas contra la misma pared.

- **El plan no lo ve (#263).** `aether-plan check` solo avisa de pruebas que nombran o importan un archivo literal de `Owns` (`plugins/aether/lib/plan-warnings.js`, `testWarnings`) y de documentos citados por pruebas (`plugins/aether/lib/plan-compile.js`, `docWarnings`). No sabe que en este repositorio un archivo nuevo de `plugins/aether/lib/` exige una línea en `docs/reference/components.md`, que un verbo nuevo de un bin exige quien lo nombre, ni que una decisión nueva mueve el rango de `docs/index.md` y de dos pruebas. Ningún proyecto puede declarar reglas así: son constantes en el código.
- **Tampoco ve un archivo que entra por comodín (#266).** Las fuentes del aviso son solo los `Owns` literales; un comodín o una carpeta no se mira.
- **El enjambre sube la escalera contra pruebas ajenas (#266).** Una prueba roja de un archivo que la unidad no posee se anota como «la prueba falló» y sube un escalón cada vez (`plugins/aether/lib/ladder.js`, `judgeFix`), hasta agotar los cinco. Solo se corta al segundo `BLOCKED` del implementador con las mismas pruebas (`blocked-same-cause`) o al segundo cambio fuera de `Owns` con los mismos archivos (`blocked-outside-owns`). El 2026-11-16, en el enjambre de la spec 041, dos unidades con su trabajo completo subieron tres escalones cada una por una prueba ajena.
- **Un delegado en otro harness que contesta `BLOCKED` no vuelve al Lead (#294).** `plugins/aether/lib/lane-delegate.js` lo cuenta como fallo del par, excluye el par y elige otro, sin tope. El 2026-11-16 fueron 15 llamadas y 2 h 25 min para una pregunta que la primera llamada ya había hecho.
- **El parche fuera de Owns no se pierde**: queda en la carpeta del run, en `patches/<task>.patch` (`plugins/aether/lib/worktrees.js`, `removeUnit` y `writePatch`). Lo que el issue vio perderse era un archivo temporal del implementador. Falta decirle al Lead dónde está.

## Qué se construye

### P1. Reglas de registro que un proyecto declara (#263)

- Un archivo opcional de datos, `.specify/plan-rules.json`: una lista de reglas. Cada regla dice: cuando una tarea **añade** un archivo que coincide con un comodín, o **cambia** uno que coincide, debe poseer (ella o una tarea de la que depende) estos archivos; y el porqué, en una frase.
- `aether-plan check` y `compile` leen ese archivo si existe y dan un aviso por cada regla que una tarea no cumple, con el porqué de la regla. Sin el archivo, nada cambia. Un archivo mal escrito es un error que nombra el archivo, no un aviso.
- «Añade» significa: la ruta está en `Owns` como ruta literal y no existe en el árbol al compilar. «Cambia» significa: la ruta está en `Owns`, literal o por comodín, y existe.
- Este repositorio estrena el archivo con sus reglas: archivo nuevo en `plugins/aether/lib/` → `docs/reference/components.md`; archivo nuevo en `plugins/aether/bin/` → `docs/reference/components.md`; cambio en `docs/decisions.md` → `docs/index.md`, `tests/docs-032.test.js` y `tests/docs-facts.test.js`. Esta última regla avisa por cualquier edición del archivo, no solo por una decisión nueva (solo una decisión nueva mueve el rango A1–A127 que fija `tests/docs-032.test.js`); su porqué dice «si añade una decisión» y el Lead descarta el aviso de una corrección de errata. Es un falso aviso aceptado: `Owns` no distingue una edición de otra.
- El verbo nuevo de un bin que ya existe no se puede deducir de `Owns`. Se cubre con texto: la skill de tareas y el texto del Writer ya piden «include tests for global rules (such as a caller per verb…)»; se añade que lean `.specify/plan-rules.json` cuando existe y que el registro de lo que una tarea crea va en esa misma tarea. El Judge lo comprueba en su paso de tareas.

### P2. El aviso de pruebas también mira comodines y carpetas (#266)

- Las fuentes de `testWarnings` incluyen los archivos que hoy existen y coinciden con un comodín o una carpeta de `Owns`. El resto del aviso no cambia.

### P3. Dos veces las mismas pruebas ajenas en rojo paran la unidad (#266)

- Cuando el gate de una unidad queda en rojo y **ninguna** de las pruebas que fallan es de un archivo que la unidad posee, la causa es ajena. La segunda vez seguida con el mismo conjunto de pruebas ajenas, la unidad deja de subir y espera al Lead, como ya hace con `blocked-same-cause`.
- **Quién decide de quién es cada prueba: `plugins/aether/lib/wt-gate.js`**, que ya conoce `Owns` (`task.owns`) y el worktree. Cada hallazgo de prueba que arma lleva un campo nuevo `own`: `false` cuando el corredor da la ubicación de la prueba (`node --test` la da en la línea `location:` del bloque TAP de cada fallo) y esa ruta no coincide con `Owns`; `true` cuando coincide, o cuando el nombre de la prueba aparece en un archivo de prueba que `Owns` cubre; `null` cuando no se puede saber. Un hallazgo sin `own` (un fallo que no es de prueba, como un cambio fuera de `Owns`) no es ajeno.
- `wt-gate.js` lee la línea `location:` del bloque TAP por sí mismo: `failureSignatures` (`baseline.js`) lee solo el nombre de `not ok N - <nombre>` y ningún código lee hoy esa línea. Solo se tiene `outputTail`, que puede cortar el bloque: una cola truncada da `own: null` y la unidad sube como hoy.
- **Quién cuenta las dos veces: el workflow** (`plugins/aether/workflows/run.workflow.js`), junto al uso de `gateFindingsOf` en `work()`. Una función nueva y pequeña devuelve el conjunto ordenado de nombres cuando **todos** los hallazgos del gate tienen `own === false`, y `null` en otro caso. La unidad guarda el último conjunto; si el nuevo es igual, la unidad termina en `blocked` con el motivo `blocked-foreign-tests: <pruebas>; …` y no llama al supervisor ni a `judgeFix`, que sigue siendo una función pura que no recibe `Owns` y no cambia. El prefijo `blocked-foreign-tests:` se añade a `STUCK_REASONS` (`run.workflow.js`, línea 263), así que la unidad espera al Lead con `stuckWaitSeconds`. Un gate sin conjunto ajeno borra el último conjunto guardado.
- Una prueba propia en rojo sigue subiendo la escalera como hoy: un modelo más capaz puede arreglarla.

### P4. Un `BLOCKED` de un delegado vuelve al Lead (#294)

- En una tarea delegada que edita en otro harness, un `BLOCKED` o un `NEEDS_CONTEXT` del implementador termina el intento: el resultado vuelve al Lead con la pregunta entera y la ruta del parche de lo hecho. No se prueba otro par ni el respaldo en Claude, que chocarían con lo mismo.
- **El resultado que devuelve** (tres capas). La pregunta y la ruta del parche viajan en `text`, que `finished` (`delegate-run.js`, el resultado de `aether-delegate wait`) y `waitSteps` (`hooks/delegate-wait.mjs`) ya dejan pasar junto a `ok`, `status` y `reason`: no hay ningún campo nuevo que llevar por esas dos capas.
  1. `plugins/aether/lib/lane-delegate.js`: el bucle del implementador, en cuanto la llamada contesta `blocked` o `needs-context`, anota el intento en `tried` (con su `patch`, que `salvagePatch` ya guarda) y termina con `{ status: 'blocked', cause, question, reason, tried, callCount }`, en lugar de excluir el par y elegir otro. `question` es la pregunta del implementador. El comando `delegate`, que hoy envuelve un bucle sin resultado como `no-candidate` (alrededor de la línea 502), deja pasar `status: 'blocked'`, `question` y `tried` tal cual. El bucle del revisor no cambia.
  2. `plugins/aether/lib/delegate-run.js`: hoy todo estado distinto de `done` es `ok: false` sin texto. Un estado `blocked` pasa a ser `{ ok: false, status: 'blocked', text, reason }`. `text` lleva la pregunta entera del implementador y, en una línea aparte, la ruta del último `tried[].patch` cuando existe. `reason` es esa misma pregunta por `reasonOf`, cortada a 300 caracteres como toda razón: el corte se acepta porque la pregunta entera va en `text`. El registro del intento guarda `patch` con esa ruta. Los demás estados no cambian.
  3. `plugins/aether/hooks/delegate.mjs`: en `runExternal`, un fin con `status: 'blocked'` no va a `runAnswering` ni a `rescueLine`. `endOf` conserva solo `status` y `reason`, así que `runExternal` lee `done.text` para este caso. El hook entrega al Lead, como respuesta de la tarea, un texto que dice que el delegado en `<par>` contestó `BLOCKED` y que ningún otro par ni Claude lo intentó, seguido de ese `text` (la pregunta y la ruta del parche). Cualquier otro fin que no entrega sigue al respaldo en Claude como hoy.
- El Lead contesta relanzando la misma tarea con el alcance corregido, sin veredicto: el relanzamiento toma `owns` del encargo nuevo (`delegate-task.js`). Es un relanzamiento como los de hoy. El resultado `blocked` no guarda par, así que el sistema elige el par como en un primer intento de ese escalón: este diseño no promete el mismo modelo ni un esfuerzo más alto. Un `fix` o un `infeasible` por `aether-delegate verdict` cuentan en la escalera como hoy. Un `BLOCKED` en sí no es un veredicto (supuesto 4).
- Un resultado `BLOCKED` es un resultado sin veredicto: el aviso de `aether-continuity` al cerrar el turno lo nombra como a cualquier otro, hasta que el Lead lo relanza o lo juzga. Eso no cambia.
- Un fallo del par que no es una respuesta del implementador (cuota, tiempo, arranque) sigue como hoy: se prueba el par siguiente.
- Hay que actualizar la frase de `docs/guide/delegates.md` («An external delegate fails in any other way… runs on Claude»), que hoy no distingue este caso.

### P5. El Lead sabe dónde está el parche (#266)

- Cuándo existe cada cosa (`run.workflow.js`, `rescue` y `close`; `worktrees.js`, `removeUnit`): mientras la unidad espera al Lead, su trabajo está en su worktree y **no hay parche todavía**; el parche `patches/<task>.patch` lo escribe `removeUnit`, que `close` llama cuando la espera termina, y esa misma llamada borra el worktree y la rama.
- El motivo de una unidad que para por P3 (`blocked-foreign-tests:`) o por `blocked-outside-owns:` termina con una frase que dice las dos cosas en ese orden: durante la espera, el trabajo está en el worktree de la unidad (el campo `worktree` de la salida de `aether-wt watch`); si la espera termina sin entrega, queda en `<runDir>/patches/<task>.patch`.
- La skill del enjambre (`skills/swarm/SKILL.md`, «Stuck unit») ya dice el camino de la espera: editar el archivo ajeno en el worktree de la unidad, hacer el commit y entregarlo con `aether-wt deliver --commit <sha> --reason … --widen <rutas>`. Se añade que este camino vale también para `blocked-foreign-tests:`, y, para después de la espera, `git apply <parche>` en el worktree de integración y `aether-wt adopt`, el camino que el workflow ya escribe en `blockHint`. No hay verbo nuevo.

## Qué queda fuera

- Deducir solo las reglas de registro leyendo las pruebas del proyecto.
- Un verbo que integre un parche.
- Cambiar cuántos escalones tiene la escalera o cuándo sube una prueba propia.
- Un archivo nuevo que entra bajo un comodín o una carpeta de `Owns`: P1 solo lo ve como «añade» si la ruta está en `Owns` como ruta literal. Los archivos creados bajo un comodín no activan ninguna regla de registro; el Writer y el Judge los cubren con el texto de P1.
- Que la cadena de un delegado se detenga con el freno de cuota (#295).

## Supuestos del Lead

1. Las reglas del proyecto viven en `.specify/plan-rules.json`, junto a `feature.json`. Reversible.
2. Los avisos de las reglas son como los demás avisos de `check` y de `compile`: salen en `warnings` con `ok: true` y no impiden compilar (`plan-compile.js`, `warnings` de la salida). Quien los lee, el Lead o el Judge en su paso de tareas, mete el archivo en `Owns` o escribe por qué no aplica; nada lo impone por código.
3. P3 usa el mismo tiempo de espera que las demás unidades atascadas (`stuckWaitSeconds`).
4. Un `BLOCKED` de un delegado no es un veredicto y no cuenta en la escalera de delegados. El relanzamiento con el alcance corregido es un relanzamiento sin veredicto como los de hoy, y este diseño no dice en qué par corre. Reversible.

## Cómo se comprueba

- P1: un plan de prueba con una tarea que añade `lib/x.js` sin poseer el archivo de registro da el aviso con el porqué; con el archivo en `Owns`, o en una tarea de la que depende, no lo da; sin `plan-rules.json` no hay avisos nuevos; un `plan-rules.json` roto es un error que lo nombra.
- P1, límite: una tarea que posee `lib/*.js` y crea un archivo nuevo bajo ese comodín no recibe aviso de registro.
- P2: una tarea que posee `lib/foo-*.js` recibe el aviso de la prueba que importa `lib/foo-a.js`.
- P3: en una prueba de `wt-gate`, una prueba roja de un archivo que `Owns` no cubre lleva `own: false`, una de un archivo propio `own: true`, y una sin ubicación `own: null`. En el workflow con agentes simulados, una unidad con una prueba ajena en rojo dos veces seguidas queda esperando con `blocked-foreign-tests:` y no pasa del segundo escalón; con una prueba propia en rojo, o con un conjunto ajeno que cambia entre las dos vueltas, sube como hoy.
- P4: una llamada simulada a `lane-delegate` que contesta `BLOCKED` termina el intento con una sola llamada y devuelve `status: 'blocked'` con la pregunta y `tried`, también a través del comando `delegate` (no `no-candidate`); una que falla por cuota sigue probando el par siguiente. Una prueba de `delegate-run` con ese resultado, y con una pregunta de más de 300 caracteres, comprueba `ok: false`, `status: 'blocked'`, que `text` lleva la pregunta entera y la ruta del parche, que `reason` es su corte, que el registro del intento guarda `patch`, y que `wait` devuelve ese `text`. Una prueba del mod (`hooks/delegate.test.ts`) con un fin `blocked` comprueba que el hook entrega el texto con la pregunta y la ruta del parche y que **ningún** paso de Claude corre después; con un fin `failed` el respaldo en Claude corre como hoy (las pruebas de rescate existentes).
- P5: en el workflow con agentes simulados, el motivo de una unidad que para por `blocked-foreign-tests:` o `blocked-outside-owns:` nombra el worktree y la ruta `patches/<task>.patch`, y una prueba de la skill o del texto del enjambre comprueba que dice `deliver --widen` para la espera y `git apply` para después de ella.
- `npm run check` pasa.
