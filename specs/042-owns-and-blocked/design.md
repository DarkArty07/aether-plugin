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
- Este repositorio estrena el archivo con sus reglas: archivo nuevo en `plugins/aether/lib/` → `docs/reference/components.md`; archivo nuevo en `plugins/aether/bin/` → `docs/reference/components.md`; cambio en `docs/decisions.md` → `docs/index.md`, `tests/docs-032.test.js` y `tests/docs-facts.test.js`.
- El verbo nuevo de un bin que ya existe no se puede deducir de `Owns`. Se cubre con texto: la skill de tareas y el texto del Writer ya piden «include tests for global rules (such as a caller per verb…)»; se añade que lean `.specify/plan-rules.json` cuando existe y que el registro de lo que una tarea crea va en esa misma tarea. El Judge lo comprueba en su paso de tareas.

### P2. El aviso de pruebas también mira comodines y carpetas (#266)

- Las fuentes de `testWarnings` incluyen los archivos que hoy existen y coinciden con un comodín o una carpeta de `Owns`. El resto del aviso no cambia.

### P3. Dos veces las mismas pruebas ajenas en rojo paran la unidad (#266)

- Cuando el gate de una unidad queda en rojo y **ninguna** de las pruebas que fallan es de un archivo que la unidad posee, la causa es ajena. La segunda vez seguida con el mismo conjunto de pruebas ajenas, la unidad deja de subir y espera al Lead, como ya hace con `blocked-same-cause`, con un motivo que nombra las pruebas y la ruta del parche guardado.
- Cómo se sabe de quién es una prueba: por la ubicación que da el corredor de pruebas cuando la da (`node --test` la da); si no, buscando el nombre de la prueba en los archivos de prueba que la unidad posee. Si no se puede saber, la unidad sigue como hoy.
- Una prueba propia en rojo sigue subiendo la escalera como hoy: un modelo más capaz puede arreglarla.

### P4. Un `BLOCKED` de un delegado vuelve al Lead (#294)

- En una tarea delegada que edita en otro harness, un `BLOCKED` o un `NEEDS_CONTEXT` del implementador termina el intento: el resultado vuelve al Lead con la pregunta y el parche de lo hecho. No se prueba otro par ni el respaldo en Claude, que chocarían con lo mismo.
- El Lead contesta relanzando la misma tarea con el alcance corregido, o con `fix`.
- Un fallo del par que no es una respuesta del implementador (cuota, tiempo, arranque) sigue como hoy: se prueba el par siguiente.

### P5. El Lead sabe dónde está el parche (#266)

- El motivo de una unidad que para por P3 o por `blocked-outside-owns` nombra la ruta del parche guardado. La skill del enjambre dice el camino: aplicar el parche en el worktree de la unidad, hacer el commit y entregarlo con `aether-wt deliver --widen`. No hay verbo nuevo.

## Qué queda fuera

- Deducir solo las reglas de registro leyendo las pruebas del proyecto.
- Un verbo que integre un parche.
- Cambiar cuántos escalones tiene la escalera o cuándo sube una prueba propia.
- Que la cadena de un delegado se detenga con el freno de cuota (#295).

## Supuestos del Lead

1. Las reglas del proyecto viven en `.specify/plan-rules.json`, junto a `feature.json`. Reversible.
2. Los avisos de las reglas son como los demás avisos de `check`: bloquean hasta que el Lead mete el archivo en `Owns` o escribe por qué no aplica.
3. P3 usa el mismo tiempo de espera que las demás unidades atascadas (`stuckWaitSeconds`).

## Cómo se comprueba

- P1: un plan de prueba con una tarea que añade `lib/x.js` sin poseer el archivo de registro da el aviso con el porqué; con el archivo en `Owns`, o en una tarea de la que depende, no lo da; sin `plan-rules.json` no hay avisos nuevos; un `plan-rules.json` roto es un error que lo nombra.
- P2: una tarea que posee `lib/foo-*.js` recibe el aviso de la prueba que importa `lib/foo-a.js`.
- P3: en el workflow con agentes simulados, una unidad con una prueba ajena en rojo dos veces seguidas queda esperando con el motivo nuevo y no pasa del segundo escalón; con una prueba propia en rojo sube como hoy.
- P4: una llamada simulada que contesta `BLOCKED` termina el intento con una sola llamada y el resultado lleva la pregunta; una llamada que falla por cuota sigue probando el par siguiente.
- `npm run check` pasa.
