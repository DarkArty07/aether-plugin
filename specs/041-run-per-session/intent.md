# Tarjeta de intención 041: una corrida autónoma por sesión

Issue: #262 («Solo cabe una corrida abierta por proyecto: una segunda sesión del Lead se queda sin la suya y trabaja sin topes»). El número es 041 porque la tarjeta de la spec 038 reserva 039 y 040 para los harnesses como extras.

## Palabras del dueño

1. «esto es un issue» (2026-11-12, al ver que una segunda sesión del Lead siguió trabajando sin corrida porque otra sesión del mismo proyecto tenía la suya abierta; issue #262).
2. «Me agrado en exceso esa paralelizacion y comunicación de trabajo hay que documentsr que ocurrió en aether plugin por si en el futuro decidimos formalizar está función» (2026-11-04, sobre tres sesiones del Lead trabajando a la vez en un mismo proyecto; issue #147).
3. «quiero que resuelvas todos los issues de manera autonoma» (2026-11-16, el encargo de esta corrida).
4. «hiciste muy pco presupeusto yo hbai leido que habias pedido mas horas y mas presupuesto» (2026-11-16, cuando una corrida paró por un tope que no era el que él había aprobado).
5. «ese no lo quiero es sobre ingneieria y va a ser que el lead no peuda ser controlado por un orquestador mas grande.» (2026-11-12, al rechazar una restricción que nadie había pedido; decisión A123).

## Entendimiento que el dueño confirmó

Aprobó dos veces en la página de plan, el 2026-11-16, el plan de esta corrida, cuyo primer supuesto dice: «#262 se arregla con una corrida por sesión, cada una con sus topes y su diario, en vez de una por proyecto. Base: usar varias sesiones a la vez es tu uso normal (#147). Reversible.»

En palabras llanas:

- Hoy un proyecto solo admite una corrida autónoma abierta. La segunda sesión del Lead que quiere abrir la suya recibe `run <id> is already open`, y sigue trabajando fuera de una corrida: sin topes de horas ni de dólares y sin diario.
- Lo que se quiere: cada sesión del Lead abre su propia corrida, con sus topes y su diario, aunque otra sesión del mismo proyecto tenga otra abierta.
- Los topes de una corrida frenan a la sesión que la abrió, y solo a esa.

## Hechos del código que la tarjeta da por sabidos

Leídos en `fix/open-issues-9` el 2026-11-16 (versión 0.44.0 más los arreglos de la rama):

- `plugins/aether/lib/autonomy.js`: `findOpenRun` devuelve la última carpeta de corrida sin cerrar, sin mirar la sesión; `start` se niega si hay cualquier corrida abierta. `run.json` ya guarda la sesión que abrió la corrida.
- El freno de un lanzamiento (`launchRefusal`) recibe la sesión que lanza, pero mira el tope de la corrida abierta del proyecto, sea de quien sea: hoy el tope de una sesión frena los lanzamientos de otra.
- `status`, `spend`, `end`, `extend`, `brake-off` y `quota-saved` actúan sobre «la» corrida abierta. Varios no reciben la sesión que los llama.
- La cifra en dólares de una corrida cuenta todo enjambre o tarea delegada que empezó dentro de su ventana de tiempo. Con dos corridas abiertas a la vez, el mismo trabajo contaría en las dos.
- El freno de cuota es de la cuenta entera. Hoy anota la pausa en una sola corrida.
- El aviso de inicio de sesión habla de «la» corrida abierta.

## Criterios

- **C1. Cada sesión abre su corrida.** Una sesión del Lead puede abrir una corrida autónoma aunque otra sesión del mismo proyecto tenga una abierta. Cada corrida tiene sus topes de horas y de dólares y su diario. Una misma sesión sigue sin poder tener dos abiertas a la vez. Por qué: palabras 1 y 2; trabajar con varias sesiones es el uso normal del dueño, y la que se queda sin corrida trabaja sin topes.
- **C2. Cada corrida frena solo a su sesión, y cada comando actúa sobre la corrida de quien lo llama.** Los lanzamientos de una sesión (tareas delegadas, compilar un plan, el diseño) se rechazan por los topes de su propia corrida y nunca por los de otra. Ver el estado, anotar gasto, ampliar los topes y cerrar actúan sobre la corrida de la sesión que llama, sin que haya que decir cuál. Nunca actúan en silencio sobre la corrida de otra sesión. Por qué: palabras 1 y 4; un tope tiene que ser el que el dueño dio a ese trabajo.
- **C3. La corrida de otra sesión se puede alcanzar nombrándola.** Ver el estado de la corrida de otra sesión y cerrarla siguen siendo posibles diciendo cuál es, por ejemplo para cerrar la que dejó abierta una sesión que murió, o para que un orquestador más grande dirija varias. No se añade ninguna restricción nueva sobre quién puede hacerlo. Por qué: palabra 5.
- **C4. El gasto de un trabajo cuenta en una sola corrida.** Un enjambre o una tarea delegada cuenta en la cifra en dólares de la corrida de la sesión que lo lanzó, y no en la de otra corrida abierta al mismo tiempo. Por qué: palabra 4; una cifra que suma el trabajo de otra sesión corta la corrida antes de tiempo.
- **C5. El freno de cuota vale para todas.** La cuota es una sola para la cuenta: cuando el freno salta, pausa todas las corridas abiertas del proyecto y cada una se reanuda por su cuenta. Ninguna se queda corriendo porque la pausa se anotó en la de otra sesión. Por qué: palabra 3; un trabajo de horas no puede perderse por una pausa mal anotada.
- **C6. Cada sesión sabe cuál es su corrida, y un proyecto con una sola sesión no nota el cambio.** Al empezar o reanudar una sesión, el aviso de inicio le dice cuál es su corrida abierta y, aparte y como información, qué corridas tienen abiertas otras sesiones. Las reglas del Lead y la guía dicen que la corrida es por sesión. Con una sola sesión todo sigue igual: los mismos comandos, los mismos archivos y las mismas salidas, y una corrida abierta con la versión anterior se puede seguir y cerrar. Por qué: palabras 1 y 3.

## Qué queda fuera

- Que un Lead abra o dirija a otro Lead con una sola aprobación del dueño (#1).
- El contrato de mensajes entre sesiones (#147).
- El candado del registro de permisos cuando dos sesiones lo escriben a la vez (#223). Los permisos siguen como están.
- Un tope común a todo el proyecto que sume las corridas de todas las sesiones. Cada corrida lleva los topes que el dueño le dio.
- Cualquier restricción nueva sobre qué sesión puede leer o cerrar la corrida de otra.

## Respuestas a las preguntas de aclaración

No se le preguntó nada al dueño: la corrida es autónoma y su aprobación del plan cubre el supuesto principal. Estos son supuestos del Lead, todos reversibles:

1. Una misma sesión no puede tener dos corridas abiertas a la vez; para abrir otra cierra antes la suya.
2. Cuando un comando no puede saber qué sesión lo llama y hay más de una corrida abierta, no elige una por su cuenta: dice cuáles hay y pide que se nombre una. Con una sola corrida abierta actúa sobre ella, como hoy.
3. El freno de cuota pausa todas las corridas abiertas, porque la cuota es de la cuenta.
4. Un enjambre o una tarea delegada pertenece a la corrida de la sesión que lo lanzó. El trabajo que no se pueda atribuir a una sesión cuenta como hoy, por la ventana de tiempo.
5. La misma cita del dueño puede abrir corridas en dos sesiones distintas: cada sesión comprueba la cita en sus propios mensajes, como hoy.
