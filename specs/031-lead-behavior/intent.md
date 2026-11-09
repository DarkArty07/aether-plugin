# Tarjeta de intención: corregir cómo se comporta el Lead

- **Dueño:** Christopher
- **Fecha:** 2026-11-09
- **Issues:** cierra #192, #199 y #217; avanza #200; corrige las frases de #204 y #214. Índices de la revisión de diseño de la que sale: #207, #216 y #225. Sugerencias: #206.
- **Confirmada por el dueño:** aprobó el plan en modo plan el 2026-11-09, sin cambios, tras su permiso «vas a corregir como se comprota el lead autnoamente» (sesión f3edb3f3, corrida auto-20261109-164519-c3e5).
- **Base:** versión 0.35.0, `origin/main` en `c95b9da`.

## 1. Las palabras del dueño

1. «vas a corregir como se comprota el lead autnoamente, hazme la propuesta y el plan. Lo demas ya vere»
2. «si lo que dijiste esta bien, basicmaente le quiero dar higieien al comportamiento del lead a los prompts etc catalgoar y ñistar comportamientos esperados por si alguno no se cumple por ingeneiria de prompts y buscar sobreingenieria en los procesos de delegacion que se poueden optimziar para buscar un mejor radar»
3. «si quisiera que hicieses un analisis para buscar mejorar y estabilizar lo que tenemos mejorarlo con buenas practicas etc pero sin agregar funcinaluidades nuevas que no conozca o si se necesitan funcinaldiades nuevas y me las sugieras las que podrian ir incluidas, como te lo tendria que pedir?»
4. «no tanto de bugs, si no de arqueictura el lead sus comprotameintos, como delega y porque etc. como te lo podria pedir?»

## 2. Lo que el dueño confirmó

La revisión de diseño midió al Lead en 58 sesiones. El patrón: **el Lead cumple las reglas que dicen qué entregar y falla las que le piden acordarse de un paso o medirse a sí mismo.** La propuesta que el dueño aprobó es dejar de pedirle memoria: lo que hoy depende de que se acuerde pasa a que el sistema lo haga o lo avise, y el texto de las reglas se corrige y se aligera. Son ocho puntos en cuatro paquetes.

**Paquete 1. Lo que pide acordarse pasa al sistema**

1. **Aviso de tareas sin veredicto** (comportamiento nuevo: un aviso). Si el Lead cierra un turno con resultados de delegados sin juzgar, el sistema se lo dice una vez y las nombra. También salen en `aether-report --delegates`. Cierra #192.
2. **Los topes los consulta el sistema** (comportamiento nuevo: un rechazo). Con una corrida abierta, `aether-delegate begin` y `aether-plan compile` miran los topes; si se pasó el de horas o el de dólares, o hay pausa por cuota, no lanzan y dicen por qué. Lo mismo al lanzar `/aether:design`. Se quita de las reglas la frase que pide correr `aether-autonomy status` antes de cada lanzamiento.
3. **Modo plan antes de una corrida** (comportamiento nuevo: un rechazo). En una sesión interactiva, `aether-autonomy start` pide que haya un plan aprobado en la conversación. No aplica a `claude -p` ni al reanudar.

**Paquete 2. Lo que pide medirse tiene un número y un aviso**

4. **Número contable en la regla.** En «The three paths», «about five tool calls» pasa a ser: a la tercera edición propia de código o pruebas en un turno, o a la décima lectura, el trabajo va a un delegado. Las pruebas que la regla pide tras una fusión no cuentan.
5. **Aviso al pasar el número** (comportamiento nuevo: un aviso), una vez por turno. Cierra #217.

**Paquete 3. Las reglas llegan bien y pesan menos**

6. **Partes que no dependen del orden.** Cada parte se corta en un límite de sección y empieza con el mismo marco de dos líneas: quién eres, y que son N partes que se leen todas antes de actuar. Se quita la quinta entrada sobrante de `hooks/hooks.json`. Cierra #199.
7. **Lo que solo hace falta a veces sale del texto de siempre.** La mecánica de «Designing» y la tabla de «Models» pasan a dos skills que se cargan al diseñar y al nombrar un modelo: dos skills nuevas con texto movido, sin comportamiento nuevo. Para que no dependa de acordarse, el resultado del workflow de diseño dice qué skill leer. Meta: de 33.950 a unos 24.000 caracteres. Avanza #200.

**Paquete 4. El texto y el código dicen lo mismo**

8. **Corregir las frases de #204 y #214** que no coinciden con el código (la lista está en la sección 6).

**Comportamientos nuevos, y ninguno más:** el aviso de tareas sin veredicto, el rechazo por topes, el plan obligatorio para abrir una corrida y el aviso de ciclo propio.

**Supuestos que el dueño aprobó con el plan:**

1. Los avisos avisan y no bloquean. Solo rechazan los topes y el plan de corrida, que es lo que las reglas ya piden.
2. Los números son 3 ediciones y 10 lecturas por turno.
3. Mover «Designing» y «Models» a dos skills nuevas es aceptable porque es texto movido.
4. El trabajo termina en una rama; la versión 0.36.0 espera su sí.
5. Los issues que cierra este trabajo se cierran cuando el arreglo esté fusionado.

## 3. Criterios

- **C1.** Ninguna tarea delegada queda con un resultado sin veredicto sin que el Lead reciba un aviso que la nombre, y el informe de delegados las lista. Así un resultado ya no depende de que el Lead se acuerde de juzgarlo. (Punto 1; cita 2: «comportamientos esperados por si alguno no se cumple por ingeneiria de prompts».)
- **C2.** Con una corrida abierta y un tope pasado, o una pausa por cuota, no se lanza nada nuevo aunque el Lead no consulte: ni una tarea delegada, ni un enjambre, ni un diseño. El rechazo dice qué corrida, qué tope y qué hacer. Sin corrida abierta nada cambia. Las reglas ya no piden consultar antes de cada lanzamiento y dicen qué hace el Lead cuando el sistema rechaza. (Punto 2; cita 2.)
- **C3.** En una sesión interactiva no se abre una corrida sin un plan aprobado en modo plan; en una sesión sin terminal se abre como hoy, y reanudar una corrida abierta no pide nada. (Punto 3; cita 2.)
- **C4.** La regla del camino directo dice un número que se puede contar, igual en todos los lugares donde hoy dice «about five tool calls» o «many reads of your own», y el Lead recibe un aviso, una vez por turno, al pasarlo. El aviso no impide seguir. (Puntos 4 y 5; cita 2: «buscar sobreingenieria en los procesos de delegacion»; cita 4.)
- **C5.** Las reglas se entienden en cualquier orden de llegada, ninguna entrada de arranque corre sin entregar nada, y el texto de cada sesión pesa menos que hoy: de 33.950 a unos 24.000 caracteres. (Puntos 6 y 7; cita 2: «higieien … a los prompts».)
- **C6.** Ninguna frase señalada en #204 y #214 contradice el código. (Punto 8; cita 2.)
- **C7.** No aparece ningún comportamiento que no esté en la lista de cuatro, y fuera de una sesión del Lead nada cambia. (Cita 3: «sin agregar funcinaluidades nuevas que no conozca».)
- **C8.** `npm run check` pasa entero: las pruebas, las pruebas del mod y la validación estricta. (Cita 3: «mejorar y estabilizar lo que tenemos».)

## 4. Fuera de alcance

El dueño dijo «Lo demas ya vere» (cita 1). Queda fuera:

- El dinero: #218, #211, #213, #223 y #205.
- Delegar y elegir modelo: #193 a #198, #202 y #203. En particular, los delegados de solo lectura siguen pidiendo veredicto (#193).
- Enjambre y diseño: #208 a #212. De #214, los puntos 2, 3 y 4 piden código y no entran.
- Lo que rodea al Lead: #220 a #225.
- Los textos de los otros agentes (#215) y el aviso de herramienta faltante (#187).
- Compactar la conversación por iniciativa del sistema (#226).
- Rechazar por código una llamada `fork`, o un relanzamiento sin juzgar el intento anterior: serían comportamientos nuevos. Aquí solo se corrige la frase.
- Subir la versión, el changelog de la 0.36.0, fusionar a `main`, subir, publicar e instalar: esperan el sí del dueño.

## 5. Respuestas a las preguntas

El Lead no hizo preguntas de aclaración: el dueño aprobó el plan entero, con sus cinco supuestos (sección 2). Donde el plan deja margen, estas son **lecturas del Lead, no palabras del dueño**; todas son reversibles y el diseño puede proponer otra con su razón:

- **«Se lo dice una vez» (punto 1):** un aviso por resultado. El mismo resultado sin juzgar no se vuelve a avisar en cada cierre de turno; sí sigue saliendo en el informe de delegados. Solo cuentan las tareas de la propia sesión con un resultado ya llegado; las que siguen corriendo no.
- **A quién aplica el rechazo por topes (punto 2):** hoy una corrida es del repositorio, no de una sesión (sección 6). El dueño trabaja con varias sesiones a la vez en el mismo repositorio. El diseño decide a qué sesiones aplica, con dos condiciones: una corrida que quedó abierta y vieja no deja al repositorio sin poder lanzar nada y sin salida clara, y el mensaje de rechazo dice el comando para cerrarla.
- **Qué plan cuenta (punto 3):** uno aprobado en esa conversación para esta corrida. Una aprobación que ya sirvió para abrir otra corrida no sirve para la siguiente.
- **Qué cuenta como edición propia y como lectura (puntos 4 y 5):** una edición del propio Lead, no de un agente, a un archivo de código o de pruebas; no cuentan el diario, la tarjeta, los specs, la documentación ni la memoria. Una lectura es leer un archivo o buscar en el código. Correr pruebas no suma.
- **Qué se queda en las reglas de siempre (punto 7):** las prohibiciones y lo que hace falta en cualquier sesión, por ejemplo no correr las CLI de otros harness, no leer sus credenciales y no pasar modelo ni esfuerzo a los agentes de Aether. Se mueve el procedimiento y la referencia: el JSON de argumentos y los cuatro resultados de `/aether:design`, el diseño corto, los cambios posteriores, el examen, las reglas del índice de modelos y la tabla de precios.
- **`--allow-main` (punto 8):** la skill del enjambre dice que la opción existe, sin invitar a usarla: la regla de no correr el enjambre en `main` sigue.

## 6. Hechos comprobados para el diseño

No son palabras del dueño. Cada uno lleva su fuente y su fecha.

**Claude Code** (versión en uso 2.1.319; documentación de hooks leída el 2026-11-09 en `https://code.claude.com/docs/en/hooks`; nada de esto se probó con una sesión real, porque no se hacen llamadas de pago):

- El hook `Stop` recibe `stop_hook_active`, `last_assistant_message`, `background_tasks` y `session_crons`. Si devuelve `hookSpecificOutput.additionalContext`, es «Non-error feedback for Claude. The conversation continues so Claude can act on it»; `decision: "block"` con `reason` también continúa, pero se muestra como error del hook. La salida normal de `Stop` no llega al modelo. Tras ocho continuaciones seguidas Claude Code cierra el turno. `Stop` no corre cuando el dueño interrumpe.
- Los hooks de un mismo evento corren en paralelo, y la salida de cada uno tiene un tope de 10.000 caracteres.
- Los hooks reciben `session_id`, `transcript_path`, `cwd` y `prompt_id` («UUID identifying the user prompt currently being processed», ausente hasta el primer mensaje), y `agent_id` y `agent_type` cuando corren dentro de un subagente. El transcript se escribe con retraso («may lag the in-memory conversation»).
- `PostToolUse` entrega `additionalContext` junto al resultado de la herramienta. `PostToolBatch` corre «once after every tool call in a batch has resolved», recibe `tool_calls` con `tool_name`, `tool_input` y `tool_response`, no tiene matcher y puede devolver `additionalContext`.
- No se averiguó desde qué versión de Claude Code existen `additionalContext` en `Stop` y el evento `PostToolBatch`.

**Los archivos de conversación** (esta máquina, 2026-11-09, solo cuentas):

- Cada línea lleva `entrypoint`: `cli` en las sesiones con terminal (112 archivos) y `sdk-cli` en las sesiones sin terminal (266 archivos). No se observaron otros valores, como los de la app de escritorio o las extensiones.
- Un plan aprobado es un `tool_use` de `ExitPlanMode` seguido de su `tool_result` sin `is_error`, con un texto que empieza por «User has approved your plan.» (31 casos en 26 conversaciones). Un rechazo llega con `is_error: true` y «The user doesn't want to proceed with this tool use.» (7 casos).
- En modo `bypassPermissions`, el sistema le indica al Lead leer y editar por `Bash` (`cat`, `sed`, heredocs) en vez de `Read`, `Edit` y `Write` (visto en la sesión f3edb3f3). Contar solo esas herramientas dejaría fuera ediciones y lecturas. `lib/guard.js` ya saca de un comando `Bash` las rutas que escribe (`redirectTargets`, `writeTargets`) y tiene la lista de comandos que solo leen (`READ_COMMANDS`).

**El código hoy** (0.35.0, `c95b9da`; rutas dentro de `plugins/aether/`):

- Una corrida es del repositorio: `findOpenRun(mainRoot)` (`lib/autonomy.js:353`), y el aviso de inicio la anuncia a toda sesión del Lead de ese repositorio (`lib/session-start.js:143-148`). `statusOfRun` (`lib/autonomy.js:470`) da `stop`: `quota`, `time` o `cost`.
- Un lanzamiento de delegado rechazado no falla la llamada: lanza un agente en Haiku que solo dice por qué no se lanzó (`refusedLaunchPlan`, `lib/delegate-task.js`).
- `aether-plan compile` acepta `--run` y `--only`; ni él ni los workflows miran hoy los topes.
- `aether-autonomy start` ya lee la conversación para comprobar la cita del dueño (`lib/voice.js`, `lib/autonomy.js:138-166`).
- El hook `Stop` corre `aether-continuity stop` (`lib/continuity-hook.js`) y no mira los delegados. El aviso de inicio ya calcula «Delegados sin resultado» (`lib/continuity-notice.js:117-132`) a partir del registro (`lib/delegate-log.js`).
- Tras cada `Write`, `Edit`, `MultiEdit` y `Bash` corre la lista `HANDLERS` de `lib/continuity-posttool.js`, con cinco avisos. `Read`, `Grep` y `Glob` no disparan ningún hook del plugin.
- Las reglas se cortan en `splitParts` (`lib/session-start.js:60-101`), con un límite de 9.800 caracteres por parte. `hooks/hooks.json` tiene una entrada para las notas y cinco de parte, y el texto actual cabe en cuatro.
- `agents/lead.md` no tiene cuerpo y no se usa para el marco: un cuerpo no vacío reemplaza el prompt por defecto de Claude Code (dato de la revisión, sin comprobar aquí).

**Lo medido en la revisión** (evidencia completa en cada issue):

- #192: 37 de 359 tareas delegadas sin ningún veredicto, en 14 sesiones; otras 4 se relanzaron sin juzgar el intento anterior.
- #217: en 58 sesiones, 30 turnos con un ciclo propio (tres ediciones o más y al menos una pasada de pruebas) y 91 turnos con diez lecturas o más.
- #199: en la sesión f3edb3f3 las partes llegaron en el orden 2, 3, 1, 4. En 25 entregas medidas ninguna llegó en orden, y en 12 la parte 1 no fue la primera (#219).
- #200: 33.950 caracteres; «Designing» pesa 5.386 y «Models» 2.472.

**Las frases del punto 8:**

De #204:
1. El esfuerzo de una corrección: la regla dice «one effort up but never above its step's correction effort»; el código la corre al esfuerzo de corrección del escalón (`lib/ladder.js:61-65`, `config/ladder.json`).
2. «A delegate task is never a fork»: no hay código que lo impida; una llamada `fork` se trata como un agente con nombre, pero la herramienta ignora el modelo y correría en el modelo del Lead con toda su conversación (`lib/delegate-task.js:42`, `272-276`).
3. Toda llamada a `Agent` que no sea `aether:*` es una tarea delegada (`lib/delegate-task.js:429`): `Plan`, `claude-code-guide` y los demás entran en la escalera y esperan veredicto. Las reglas no lo dicen.
4. `verdict --ignore <glob>` existe (`lib/delegate-task.js:585-590`) y las reglas no lo nombran.
5. `skills/skills/SKILL.md:44` escribe `aether-autonomy trust <author>`; el comando pide `trust --author <author> --quote <text>` (`lib/autonomy-command.js:89-91`).
6. `aether-exam store` aparece en «Designing» sin la carpeta de la spec, que es su argumento.
7. Cinco entradas de parte para cuatro partes (lo resuelve el punto 6).
8. Relanzar un id ya aprobado o agotado no rechaza la llamada: lanza un agente en Haiku que solo dice que no hay nada que hacer (`lib/delegate-task.js:44`, `301-326`). Las reglas no lo dicen.
9. Un nombre desconocido en `AETHER-SKILLS` rechaza el lanzamiento entero (`lib/delegate-task.js:449-454`). Las reglas solo dicen «up to 3 skills».

De #214 (skill del enjambre):
1. «In an autonomous run, run `aether-autonomy status` first»: lo resuelve el punto 2.
5. `--allow-main`: la skill dice «Never run the swarm on `main`» y el código lo permite con esa opción (`lib/plan-compile.js:318-319`).
6. `aether-wt settle`: es la salida de una fusión cortada a los 600 segundos y solo aparece en el texto del rechazo (`workflows/run.workflow.js:820-822`).
7. El supervisor: la skill dice que bloquea «three times without a valid verdict»; en el código un veredicto inválido cuenta como `retry` (`workflows/run.workflow.js:1420-1430`) y lo que bloquea son tres veces sin respuesta (`:1403`, `:1501`).
8. El segundo y el tercer intento del supervisor corren siempre en Claude (`workflows/run.workflow.js:1178-1179`), y un supervisor o revisor de Claude callado 900 segundos se abandona (`:53`).
9. Un hallazgo sin archivo recibe el primero del `Owns` de la tarea (`workflows/run.workflow.js:1466-1468`).

**Condiciones de la construcción** (del plan aprobado y de sus recursos):

- Una prueba nueva por cada comportamiento, escrita antes que el código.
- Unas 10 tareas para el enjambre. Cada tarea lleva en su `Owns` las pruebas que fijan lo que cambia: 31 archivos de `tests/` nombran las reglas o el arranque, tres fijan la ruta de la skill (`codex-docs.test.js`, `docs-facts.test.js`, `copies-classes.test.js`), y una prueba fuera del `Owns` fue el fallo más repetido del enjambre (#208).
- Cada tarea deja de acuerdo el texto y el código que cambia: la corrida tiene un tope de US$ 50 y puede cortarse entre una tanda de tareas y la siguiente (`aether-plan compile --only`).
- Los avisos nuevos van en inglés y en español, como los que ya existen, actúan solo en una sesión del Lead y nunca dentro de un subagente. Lo que cueste en una sesión normal queda medido en `docs/reference/components.md`.
- La documentación está sujeta al árbol por pruebas (`tests/docs-facts.test.js`): las guías que describen lo que cambia se actualizan, y cada comportamiento nuevo lleva su entrada en `docs/decisions.md` con las palabras del dueño.
- No se sube la versión ni se escribe el changelog de la 0.36.0.
