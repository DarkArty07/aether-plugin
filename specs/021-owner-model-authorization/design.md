# Diseño corto: el dueño coloca un delegado en un modelo más alto (spec 021)

Toca la escalera de los delegados (`lib/delegate-task.js`, `lib/ladder.js`) y añade una autorización que depende de las palabras del dueño. Es un permiso, y un error aquí gasta Opus sin que el dueño lo haya pedido o ignora una orden suya, por eso pasa por el Juez.

## Lo que pidió el dueño

- «El estándar que todos empiecen en modelos haiku level. Lo que yo quiero es que con autorización expresa del dueño el lead pueda escalar de modelos. Por ejemplo "Necesito que redactes ese archivo de nuevo en español natural, despliega un agente que lo haga en opus". Y así el lead puede escalar modelos.» (2026-10-29)
- «De manera autónoma el lead tendría que dar razones, aunque no sé si de manera autónoma sería buena idea. Qué opinas.» El Lead respondió que no lo haría solo con razones, porque una razón escrita no cuesta nada y nadie la comprueba.
- «El permiso vale para una tarea y para toda la sesión, depende de lo que diga. No hay techo para corridas autónomas. Comienza a diseñarlo e implementarlo de manera autónoma.»

## Lo que se entendió

1. Todo delegado sigue empezando en Haiku. Eso no cambia.
2. Con palabras del dueño que nombran un modelo, el Lead puede arrancar un delegado en ese modelo (Sonnet u Opus) en lugar de Haiku.
3. El permiso es de una tarea o de toda la sesión, según lo que el dueño diga.
4. El Lead no sube de modelo por su cuenta con solo una razón. Hoy ya puede declarar una tarea inviable con su razón y subir un escalón; eso sigue igual. «No hay techo para corridas autónomas» se lee así: no se construye ningún tope que dé al Lead permiso para saltar solo; sin palabras del dueño no hay salto. (Supuesto 1.)

## Hoy

`begin` (`lib/delegate-task.js`) arranca toda tarea en el primer escalón de `config/ladder.json` y descarta el `model` que el Lead pone en la llamada: lo anota en el registro como `requested` con `ignored: true`. El Lead no puede obedecer una orden como «hazlo en Opus»: la orden se pierde. El único camino hacia arriba son las tres causas de subida (correcciones gastadas, mismos hallazgos, inviable con razón), empezando siempre en Haiku.

## Decisión

### 1. Registrar la autorización: `aether-delegate authorize`

    aether-delegate authorize --model <modelo> --quote <palabras del dueño> (--task <id> | --scope session) [--session <id>]

- `--model` es el modelo de un escalón de `config/ladder.json` que no es el primero. Haiku, otro nombre o ninguno se rechazan (el primer escalón no necesita permiso).
- Exactamente uno de `--task <id>` (el permiso vale para esa tarea) o `--scope session` (vale para las tareas de esta sesión). Ninguno o los dos se rechazan. El id sigue `[A-Za-z0-9_-]+`.
- `--session` por defecto es `CLAUDE_CODE_SESSION_ID`; sin sesión se rechaza.
- La cita se verifica igual que las concesiones de `aether-autonomy`: `autonomy.verifyQuote` (al menos `MIN_QUOTE` caracteres, y que esté en los mensajes que el dueño escribió en el transcript de la sesión). Además, **la cita tiene que nombrar el modelo** (el nombre del escalón, sin mayúsculas ni acentos, como palabra): «pon el más fuerte» no autoriza Opus. Es lo que hace que la autorización sea expresa y que no se pueda justificar con cualquier frase del dueño.
- Si pasa, escribe una línea `kind: 'authorize'` en `<data dir>/delegates/log.jsonl`: `{ time, session, scope: 'task'|'session', task, model, quote, quoteTime }`, y responde `{ ok: true, authorized: <la línea> }`. Si no, `{ ok: false, error }` y no escribe nada. Salida y códigos como los otros verbos de `aether-delegate` (una línea JSON, exit 0; error de uso, exit 1).

El Lead decide cuál de los dos alcances usar con las palabras del dueño, como ya hace con `aether-autonomy grant`: palabras sobre una cosa concreta («redáctalo de nuevo en Opus») son de esa tarea; palabras generales o de la sesión («en esta sesión usa Opus para los delegados de redacción») son de la sesión.

### 2. Usarla: el Lead pide el modelo en la llamada

Para un delegado cuyo modelo el dueño nombró, el Lead lo pone en el campo `model` de la llamada `Agent` (hoy se descarta) después de haber registrado la autorización. En `begin`, en el **primer lanzamiento** de una tarea (`launchKind` `first`), si `event.model` nombra un escalón por encima del primero (igual al modelo del escalón, o conteniéndolo como palabra, p. ej. `claude-opus-5-5`):

1. `coverOf` busca en el registro de la sesión la última línea `authorize` que cubra la llamada: de alcance `task` con ese id, o de alcance `session`, y cuyo modelo esté en el mismo escalón o más arriba que el pedido (un permiso de Opus cubre pedir Sonnet; uno de Sonnet no cubre Opus).
2. Si hay cobertura: la tarea arranca en el escalón pedido, con el esfuerzo `first` de ese escalón; la línea `launch` lleva `authorized: { model, scope, task, quote, quoteTime }` y su `ignored` queda en `false` si el esfuerzo no se tocó; una nota para el Lead dice que el delegado corre en ese modelo por palabra del dueño.
3. Si no hay cobertura: todo igual que hoy (Haiku, el pedido anotado e ignorado), más una nota para el Lead que dice que ninguna autorización lo cubre, que la tarea arrancó en Haiku, y cómo registrarla (`aether-delegate authorize`).

Una autorización que se registra después de que la tarea ya tiene un lanzamiento no cambia nada para ella. Para mover una tarea ya empezada, el Lead lanza una tarea nueva (un id nuevo) con el trabajo anterior en el brief. (Fuera: mover un delegado a mitad de escalera por orden del dueño.)

### 3. La escalera sigue desde ahí

El escalón de arranque de una tarea es el `step` de su primer lanzamiento. `ladder.js` recibe ese escalón: `newState(ladder, step)` y `stateOf(inputs, ladder, step)` (el tercer parámetro es opcional; sin él, todo sigue igual y la escuadra `wt-ladder.js` no se toca). `begin` (`nextLaunch`) y `verdict` lo leen del registro y lo pasan. Las correcciones son las del escalón en que está, y sube por las mismas tres causas: Opus tiene una corrección y, gastada, la tarea queda `exhausted`; Sonnet tiene dos y luego sube a Opus. Si el escalón guardado no existe en la escalera, se usa el primero.

### 4. Corre en Claude, en ese modelo

Una tarea cuyo primer lanzamiento fue autorizado corre todos sus intentos en Claude, en el modelo del escalón: `begin` no pregunta por el par (no llama a `pickPair`), así que la superdelegación no la sustituye por un modelo de otro harness con puntos parecidos. El dueño nombró un modelo; una tarea que él no colocó sigue la regla de hoy. (Supuesto 2.)

### 5. Se ve en el informe y en las reglas del Lead

- `aether-report --delegates`: la fila de una tarea colocada por el dueño lleva `authorized: { model, scope }`. La clave solo aparece en esas filas.
- `using-aether` (lo que lee el Lead): pasar `model` en una llamada de delegado solo cuando el dueño nombró ese modelo y la autorización quedó registrada; el Lead nunca registra una autorización con palabras que no sean del dueño; los delegados colocados por el dueño se cuentan en la línea de Asequible del informe.
- Docs: `docs/guide/delegates.md` (la sección «What it does» y «What to know» dicen hoy que el modelo pedido se ignora), una decisión A99 en `docs/decisions.md`, la fila de `aether-delegate` y la familia delegate en `docs/reference/components.md`, y la línea de `aether-delegate` en `CLAUDE.md`.

## Supuestos

1. **«No hay techo para corridas autónomas» = no hay salto solo.** Es el que más probabilidad tiene de ser vetado por la otra lectura («sin tope en las corridas autónomas, el Lead puede subir libre»). Se tomó el lado reversible y seguro: sin palabras del dueño no hay salto; si el dueño quería lo otro, se añade un permiso y no hay que deshacer nada.
2. **Un modelo que el dueño nombra corre en ese modelo de Claude**, no en un par de otro harness con puntos parecidos. Razón: su ejemplo es redactar en español natural en Opus; un sustituto no es lo que pidió. Se paga en cuota de otros harness que no se aprovecha para esa tarea. Reversible: quitar la condición de `begin`.
3. **La cita tiene que nombrar el modelo.** Más estricto que `aether-autonomy` (que no mira el contenido). Si el dueño dice «el más fuerte» el Lead le pide que lo nombre.
4. **Solo Sonnet y Opus, por el modelo, sin esfuerzo.** El esfuerzo sigue el de la escalera. Pedir un esfuerzo concreto queda fuera.
5. **Solo los delegados del Lead.** El enjambre (`/aether:run`) y las plazas de diseño no cambian.
6. **Sin permiso permanente del repositorio.** Solo tarea y sesión, porque el dueño dijo solo esos dos.

## Lo que no cambia

- Todo delegado empieza en Haiku salvo una autorización que lo cubra.
- Las tres causas de subida, los números de `config/ladder.json`, el veredicto, las comprobaciones antes de aprobar, el reemplazo de un par que falla.
- `infeasible` con razón: el Lead sigue pudiendo subir un escalón por su cuenta, uno a la vez, y queda en el registro.
- El mod (`hooks/delegate.mjs`): ya aplica el modelo y el esfuerzo del plan a la llamada.

## Pruebas (en `tests/delegate-authorize.test.js` y las que ya existen)

1. `authorize` rechaza, sin escribir nada: una cita que no está en los mensajes del dueño, una cita de menos de 12 caracteres, una cita de otra sesión, una cita que no nombra el modelo, un modelo que es el primer escalón o que no existe, ni `--task` ni `--scope session`, los dos a la vez, un id con caracteres no válidos, y una llamada sin sesión.
2. `authorize` acepta una cita del dueño que nombra Opus (con otras mayúsculas, con «Opus 5.5»), y deja la línea con su alcance, su tarea, su cita y su hora.
3. Alcance de tarea: cubre esa tarea y no otra de la misma sesión. Alcance de sesión: cubre cualquier tarea de esa sesión y no las de otra sesión.
4. El primer lanzamiento cubierto arranca en el escalón pedido con el modelo y el esfuerzo `first` de su escalón, anota `authorized`, no llama a `pickPair` aunque la sesión tenga superdelegación y un par disponible, y deja `ignored: false`.
5. Un permiso de Opus cubre pedir Sonnet; uno de Sonnet no cubre pedir Opus (la tarea arranca en Haiku con la nota).
6. Sin cobertura, el pedido se ignora como hoy (Haiku, `ignored: true`) y la nota explica cómo registrar la autorización. Un pedido de `haiku` o de un modelo desconocido no genera la nota.
7. Una autorización posterior al primer lanzamiento no mueve la tarea.
8. Desde Opus: una corrección, y gastada, `exhausted`. Desde Sonnet: dos correcciones y luego sube a Opus; el veredicto informa del escalón y las correcciones del escalón en que arrancó.
9. Una tarea colocada por el dueño corre en Claude también en sus correcciones y subidas, con superdelegación activada.
10. `newState` y `stateOf` sin tercer parámetro dan lo mismo que hoy; con un escalón desconocido, el primero.
11. `aether-report --delegates`: `authorized` aparece en la fila de la tarea colocada y en ninguna otra.
12. La prueba del bin: `authorize` por la línea de comandos con un transcript falso en `CLAUDE_CONFIG_DIR`, y las frases que fijan `using-aether` y los documentos (`tests/bootstrap-names.test.js`, `tests/delegate-docs.test.js`, `tests/delegates-docs.test.js`, `tests/docs-facts.test.js`) siguen verdes con el texto nuevo.
13. Todo `npm test`, `npm run test:mod` y `npm run validate` siguen pasando.

## Riesgos

- Cuesta más: un Opus colocado gasta la cuota de Claude. Por eso hace falta la cita, el registro y la línea de Asequible en el informe.
- El Lead puede registrar una cita que el dueño dijo pero que no quería decir eso. La verificación comprueba que las palabras existan y nombren el modelo; juzgar si eran una orden es del Lead, y queda a la vista en el registro y en el informe.
- Quien lea el registro de un lanzamiento con `ignored: false` y un `requested` verá que se honró; antes `requested` siempre llevaba `ignored: true` cuando difería.
