# Diseño corto: en modo de desarrollo, la observación abre sola el issue de cada falla, si el dueño lo enciende

Corrige la promesa «un issue se abre solo con el sí del dueño» de la [spec 014](../014-self-observation/spec.md) (C9, R12, E12 y A3), con la concesión permanente que A3 ya preveía. Toca la frontera de privacidad de la observación (qué sale de la máquina del dueño), por eso pasa por el Judge.

## Lo que pidió el dueño

Sus palabras, tal como las dio el 2026-10-28:

- «Necesito un nuevo hook en forma de config para este proyecto. Que tenga la funcionalidad de que si detecta un bug automaticamente suba el issue al repo de github con la envidencia al momento.»
- Tras mi opinión (que el repo es público, que una evidencia mal limpia se vería, que un falso positivo repetido llenaría el tracker): «Lo que dices es cierto y por eso lo anclaria con el modo dev o la version dev. Que no sea algo que tenga la version normal, mee xplico pero configurbale».
- «Diseña e implementa esto de manera autonoma. no estare disponible».

Lo que entendí y él aceptó al seguir: el hook es una opción de configuración; solo actúa en modo de desarrollo; la instalación estándar queda como está; el destino del issue es el repo del plugin (no el de la carpeta donde corre); la evidencia es la que ya redacta la lectura (figuras, clases, nombres de archivo, hora y sesión), sin texto de conversación; el valor por defecto es apagado. No contestó mis tres preguntas una por una, así que lo que sigue en «Supuestos» lo asumo y es reversible.

## Decisiones

**D1. Una opción booleana, `autoissue`, apagada por defecto.** Es una opción nueva de `plugin.json` `userConfig` (la octava), que llega a los hooks como `CLAUDE_PLUGIN_OPTION_AUTOISSUE`, igual que `observedev`. Además, la variable `AETHER_AUTOISSUE`: `on` enciende y `off` apaga, solo con el valor exacto; otro valor cuenta como no puesta y manda la opción (la misma regla que `AETHER_OBSERVE`). La variable vale para quien corre con `--plugin-dir`, donde la opción puede no llegar (el riesgo que la 015 dejó anotado). Una función nueva `autoIssueOn(env)` en `lib/observe.js` decide.

**D2. El candado va en el código: sin modo de desarrollo no hay issue, valga lo que valga la opción.** `autoIssueOn(env)` es verdadera solo si `observeMode(env) === 'dev'` y la variable o la opción lo encienden. Con `AETHER_OBSERVE=standard` es falsa aunque `AETHER_AUTOISSUE=on`. El candado se comprueba tres veces: en el hook antes de lanzar nada, en el trabajador al empezar, y el trabajador es un archivo que la instalación estándar nunca carga (`lib/observe-issue.js`, que el hook pide con `require` solo si el candado está abierto, como `observe-dev.js`). Para el dueño la opción es el permiso permanente de A3, para esta sola acción: no concede la clase `push` ni ninguna otra, y no sirve a otro comando.

**D3. Qué se sube: solo las fallas, con el borrador que la lectura ya escribe.** De los hallazgos de `observe/read.json` se toman los de tipo `failure` que traen su `issue` (título y cuerpo de `issueOf`: evidencia, números y sesiones), en el orden en que la lectura los dio. Las calibraciones, las fricciones y el hallazgo `owner-correction` no se suben nunca. Los fragmentos de conversación y las correcciones del modo de desarrollo se quedan en la máquina: `observe-issue.js` no los lee, no importa `observe-dev.js` ni nombra una conversación (la prueba de «solo `observe-dev.js` nombra el transcript» sigue valiendo para todo el resto).

**D4. Limpieza antes de enviar, y ante la duda no se envía.** Al cuerpo se le aplica, en este orden: (1) cada sesión se escribe con sus 8 primeros caracteres; (2) cada ruta absoluta que empiece por el directorio del usuario o por `/home/<x>`, `/Users/<x>` o `/root` se vuelve `~/…` (el nombre del usuario no sale); (3) `redact()` de `lib/observe-redact.js`. Si el paso (3) cambia algo, el cuerpo traía una clave o un secreto: ese hallazgo **no se envía**, queda el borrador local y la corrida lo cuenta como `held`. El pie del cuerpo lleva «Abierto por aether-observe (autoissue, modo de desarrollo) · plugin <versión> · <fecha ISO>» y la marca `<!-- aether-observe:<id> -->`, con el `id` del hallazgo reducido a `[A-Za-z0-9_.:/-]` (cualquier otro carácter pasa a `_`) y a 120 caracteres.

**D5. Destino fijo: el repo del plugin.** El destino es el `repository` de `plugin.json` (`https://github.com/DarkArty07/aether-plugin`, convertido a `DarkArty07/aether-plugin`), nunca el repo de la carpeta donde corre la sesión: una sesión de desarrollo en otro proyecto no puede abrir issues en ese otro proyecto. La variable `AETHER_ISSUE_REPO=<dueño>/<nombre>` lo cambia (para un fork y para las pruebas); solo se acepta si cumple `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`, y si no, el trabajador no hace nada y lo dice.

**D6. Ni repetidos ni inundación.**
- Un libro de lo abierto, `observe/issues-filed.json`, guarda por `id` de hallazgo `{ number, url, time, via }` (`via` es `created` o `found`). Un `id` que está en el libro no se vuelve a subir ni a buscar.
- Antes de crear, el trabajador pide a GitHub los issues con la etiqueta `aether-observe` (`gh issue list --repo <repo> --label aether-observe --state all --limit 200 --json number,state,url,body`) y busca la marca del `id` en sus cuerpos: si está, lo anota en el libro como `found` y no crea otro. Así dos máquinas o dos directorios de datos no duplican.
- Dos topes, datos en `config/observe.json` (`autoIssue`): `maxPerSession` (3) issues creados por corrida y `maxOpen` (10) issues abiertos con la etiqueta; con el tope de abiertos alcanzado no se crea ninguno y la corrida lo dice. Una reaparición de una falla ya subida no añade nada (un comentario sobre la reaparición queda como propuesta).
- Un cerrojo `observe/issues-filed.lock` (creado con la bandera `wx`, tenido por vencido a los 5 minutos) evita que dos sesiones que terminan a la vez corran el trabajador juntas; si lo hay, la segunda corrida no hace nada.

**D7. Se envía fuera del hook, en un trabajador aparte.** El hook `SessionEnd` ya hace la lectura y su contrato dice que no imprime nada, siempre sale 0 y no puede frenar una petición. Una llamada de red dentro del hook rompería eso y un `SessionEnd` puede cortarse al cerrar Claude Code. Por eso, después de `readObservations`, si el candado está abierto, `endSession` pide a `observe-issue.js` que lance, desacoplado y sin salida (`spawn(process.execPath, [bin, 'file-issues'], { detached: true, stdio: 'ignore' }).unref()`, con el mismo entorno), el verbo nuevo `aether-observe file-issues`; cualquier fallo al lanzarlo se traga. El trabajador, con la lectura recién escrita:
1. comprueba el candado (D2) y el destino (D5); si algo falla imprime una línea JSON con el error y sale 1;
2. toma las fallas candidatas (D3), quita las del libro (D6) y, si no queda ninguna, sale 0 **sin llamar a `gh`**;
3. lista los issues etiquetados (D6); si `gh` falta, no está autenticado o no responde, no anota nada, deja los borradores como están, imprime `{"error":"gh-unavailable"}` y sale 0 (la próxima sesión vuelve a intentarlo);
4. crea la etiqueta `aether-observe` una vez, ignorando el error si ya existe, y por cada candidata que pase D4 y los topes corre `gh issue create --repo <repo> --title <título> --body-file - --label aether-observe` con el cuerpo por la entrada estándar, tomando el número y la dirección de la última línea de la salida, y escribe el libro (de forma atómica) después de cada creación;
5. imprime una línea JSON con `created`, `found`, `held` y `skipped`, y sale 0.
Cada llamada a `gh` lleva un tiempo máximo de 20 segundos y el trabajador entero de 90.

**D8. Lo que no cambia.** Los detectores, los borradores en `observe/issues/` (siguen escribiéndose igual, también con la opción apagada), qué guarda cada modo, los fragmentos y las correcciones, el resumen durable y la poda. La instalación estándar sigue sin abrir conexiones ni ejecutar `gh`. Un issue con el sí del dueño uno por uno sigue siendo el camino con la opción apagada (el Lead lo abre con el borrador). Y la regla A91 se mantiene: la observación propone, no cambia el plugin; abrir un issue es proponer.

## Archivos

- `plugins/aether/lib/observe-issue.js` (nuevo, familia observe): `launch({ dataDir, env })`, `fileIssues({ dataDir, env, now })`, la limpieza (D4), el libro y el cerrojo. Es el único archivo de la observación que ejecuta un proceso y el único que nombra `gh`.
- `plugins/aether/lib/observe.js`: `autoIssueOn(env)` (y se exporta).
- `plugins/aether/lib/observe-hook.js`: en `endSession`, tras `readObservations`, `if (autoIssueOn(env)) require('./observe-issue.js').launch({ dataDir, env })`, dentro del mismo `try`.
- `plugins/aether/bin/aether-observe`: el verbo `file-issues` (sin argumentos), el `USAGE` y la cabecera.
- `plugins/aether/config/observe.json`: `"autoIssue": { "maxPerSession": 3, "maxOpen": 10 }`.
- `plugins/aether/.claude-plugin/plugin.json`: la opción `autoissue` (booleana, por defecto `false`, con descripción que diga que solo vale en modo de desarrollo y que abre issues en el repo del plugin).
- Documentación, que las pruebas de documentación exigen coherente: `docs/guide/options.md` (la fila y el párrafo de `autoissue`; «seven options» pasa a «eight options» en el título y en la primera frase), `docs/guide/observe.md` (sección nueva «Opening issues by itself (development mode)»; las frases «the promise that nothing leaves your machine» y «Nothing gathered here leaves your machine… opens no connection and start no `gh`… an issue is opened only with your yes» se corrigen para nombrar la única excepción; el verbo `file-issues` en la tabla del comando), `docs/reference/components.md` (la fila de `aether-observe`, la fila de la familia `observe-` con `observe-issue.js`, y la frase de la huella dormida), `docs/getting-started.md` y `README.md` («seven options» pasa a «eight options» y el nombre `autoissue` en la lista), la línea `- **Config.**` y la línea `- **Self-observation.**` de `CLAUDE.md`, y `docs/decisions.md` con la decisión A98 (la versión se fija al publicar).
- Pruebas: `tests/observe-issue.test.js` (nueva), y los cambios mínimos en `tests/observe-guarantees.test.js` (la prueba «no observation file uses the network, a process or gh» pasa a una lista de una sola excepción, `observe-issue.js`, y comprueba además que ese archivo no contiene «transcript» ni pide `observe-dev.js`, y que la prueba del borrador local, con el `gh` falso, sigue sin llamarlo cuando la opción está apagada o el modo es estándar), `tests/observe-docs.test.js` (la frase de «nothing leaves your machine» según se reescriba), `tests/observe-bin.test.js` (el nuevo uso), `tests/components-docs.test.js` (`options.length` pasa de 7 a 8) y `tests/helpers.js` (borra `AETHER_AUTOISSUE`, `AETHER_ISSUE_REPO` y `CLAUDE_PLUGIN_OPTION_AUTOISSUE` del entorno de los procesos que lanza).

## Pruebas

Todas con un `gh` falso en un directorio temporal al frente de `PATH` (un script que anota sus argumentos y su entrada, y responde lo que cada caso pida); ninguna toca GitHub.
- `autoIssueOn`: es falsa sin variable ni opción; falsa en estándar con la opción en `true` y con `AETHER_AUTOISSUE=on`; falsa en desarrollo con la opción en `false`; verdadera en desarrollo con la opción en `true`; `AETHER_AUTOISSUE=off` gana a la opción; `AETHER_AUTOISSUE=On ` (otro valor) no cuenta.
- La garantía de la estándar: una sesión entera del Lead en estándar con la opción en `true` (la lectura da una falla): el `gh` falso no se llama y `observe-issue.js` no se carga ni se crea `issues-filed.json`.
- La garantía de la sesión normal: el hook en una sesión que no es del Lead no lanza nada.
- Desarrollo y opción encendida, con una falla en la lectura y una conversación falsa con una frase marcada, una clave y un token: el hook lanza el trabajador y, esperando el libro, `gh issue create` se llamó **una vez**, con `--repo DarkArty07/aether-plugin` aunque el `cwd` sea otro repo, con la etiqueta, y el cuerpo que recibió trae la evidencia y no trae la frase marcada, ni la clave, ni el token, ni la ruta del `HOME` de prueba; las sesiones salen de 8 caracteres.
- Un cuerpo que `redact()` cambia (una clave en la evidencia) no se envía: queda `held` y el borrador local.
- Duplicados: si `gh issue list` devuelve un issue cuyo cuerpo trae la marca, no se llama a `gh issue create`, el libro lo anota como `found`; con el `id` ya en el libro, no se llama a `gh` en absoluto.
- Topes: con más de `maxPerSession` fallas se crean solo `maxPerSession`; con `maxOpen` abiertos no se crea ninguno.
- `gh` ausente de `PATH` o que falla: el trabajador sale 0, el libro no cambia, el borrador sigue y una segunda corrida lo reintenta.
- `AETHER_ISSUE_REPO` inválido (`a b`, `../x`, vacío): el trabajador sale 1 sin llamar a `gh`; uno válido se usa en `--repo`.
- El cerrojo: con un `issues-filed.lock` reciente la corrida no hace nada; con uno de más de 5 minutos lo reemplaza.
- El hook sigue sin imprimir nada y saliendo 0, también cuando el lanzamiento del trabajador falla.
- La opción: `plugin.json` la declara booleana con valor por defecto `false` y la tabla de `docs/guide/options.md` la nombra (la prueba de opciones existente).

## Fuera del repositorio

- Ninguna prueba abre un issue de verdad. Una **prueba real** (poner `autoissue=true` en `aether@aether-plugin`, correr una sesión de desarrollo con una falla y ver el issue en `DarkArty07/aether-plugin`) crea un issue público, así que queda para el dueño, con su sí: el comando exacto va en el informe.
- La versión, la etiqueta de publicación, y el merge a `main` también esperan su sí.

## Riesgos y lo que no se verifica

- **Sale un dato de la máquina del dueño a un repo público.** Lo reducen: el candado de D2, la limpieza de D4 (sesiones cortas, rutas, `redact()` y «ante la duda no se envía») y que lo enviado es lo que la lectura ya redacta, hecho de identificadores, clases y conteos. Lo que no se puede asegurar: que un `id` de tarea o de modelo que el Lead nombró (por ejemplo, un nombre de tarea con una palabra sensible) no aparezca en la evidencia. Con la opción apagada, que es el valor por defecto, no sale nada.
- **No se vio en una sesión real** que Claude Code entregue `CLAUDE_PLUGIN_OPTION_AUTOISSUE` a un hook de comando (lo respalda `observedev`, que se entrega igual, pero no se probó en una sesión real), ni que el trabajador desacoplado sobreviva al cierre de la sesión. Si la opción no llegara, quedan la variable y el verbo manual.
- **`gh` hace falta y debe estar autenticado.** Sin él no se sube nada y los borradores quedan donde estaban.
- **Solo al terminar la sesión.** La lectura corre en `SessionEnd`, así que una sesión que se cae sin cerrar no sube su falla hasta la próxima corrida del verbo o de otra sesión. «Al momento» se entiende como «sin esperar al dueño, con la evidencia que la lectura tiene entonces»; subirlo en pleno fallo queda como propuesta.
- **Un issue falso positivo** queda publicado hasta que el dueño lo cierre; los topes lo acotan.

## Fuera de alcance

Un modo `ask` (preguntar al terminar la sesión: no hay a quién preguntar en un `SessionEnd`; con la opción apagada, el camino con su sí es el que ya existe), comentar en un issue existente ante una reaparición, subir en pleno fallo, subir calibraciones o fricciones, etiquetas por tipo, cerrar solos los issues, y cualquier cambio de los detectores.
