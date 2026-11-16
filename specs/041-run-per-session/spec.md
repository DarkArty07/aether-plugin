# Spec 041: una corrida autónoma por sesión

- **Date:** 2026-11-16
- **Status:** Draft
- **Intent:** `specs/041-run-per-session/intent.md` (tarjeta del issue #262; el dueño aprobó dos veces, el 2026-11-16, el plan de esta corrida con el supuesto «#262 se arregla con una corrida por sesión, cada una con sus topes y su diario, en vez de una por proyecto»).

## Criteria

- C1. Cada sesión abre su corrida. Una sesión del Lead puede abrir una corrida autónoma aunque otra sesión del mismo proyecto tenga una abierta; cada corrida tiene sus topes de horas y de dólares y su diario; una misma sesión no tiene dos abiertas a la vez. «esto es un issue» y «Me agrado en exceso esa paralelizacion y comunicación de trabajo». Evidence: una prueba abre una corrida en la sesión A y otra en la sesión B del mismo proyecto y las dos quedan abiertas, cada una con su `run.json` y su diario; una tercera apertura en la sesión A se rechaza.
- C2. Cada corrida frena solo a su sesión, y cada comando actúa sobre la corrida de quien lo llama. Los lanzamientos (tareas delegadas, compilar un plan, el diseño) se rechazan por los topes de su propia corrida y nunca por los de otra; ver el estado, anotar gasto, ampliar los topes y cerrar actúan sobre la corrida de la sesión que llama sin que haya que decir cuál, y nunca en silencio sobre la de otra. «hiciste muy pco presupeusto yo hbai leido que habias pedido mas horas y mas presupuesto». Evidence: pruebas con dos corridas abiertas, una con el tope vencido: la sesión de la otra lanza sin freno y la del tope vencido se rechaza; cada comando de la lista cambia solo la corrida de la sesión que lo llama.
- C3. La corrida de otra sesión se puede alcanzar nombrándola. Ver el estado y cerrar la corrida de otra sesión siguen siendo posibles diciendo cuál es, sin ninguna restricción nueva sobre quién puede hacerlo. «ese no lo quiero es sobre ingneieria y va a ser que el lead no peuda ser controlado por un orquestador mas grande.» Evidence: pruebas que ven el estado y cierran, desde una sesión, una corrida de otra sesión nombrada por su id, y una prueba de que no hay ninguna comprobación de dueño en esa ruta.
- C4. El gasto de un trabajo cuenta en una sola corrida. Un enjambre o una tarea delegada cuenta en los dólares de la corrida de la sesión que lo lanzó y no en la de otra corrida abierta al mismo tiempo. «hiciste muy pco presupeusto yo hbai leido que habias pedido mas horas y mas presupuesto». Evidence: una prueba con dos corridas abiertas y trabajo de cada sesión dentro de la misma ventana de tiempo: la cifra de cada corrida suma solo su trabajo.
- C5. El freno de cuota vale para todas. Cuando salta, pausa todas las corridas abiertas del proyecto y cada una se reanuda por su cuenta; ninguna sigue corriendo porque la pausa se anotó en la de otra sesión. «quiero que resuelvas todos los issues de manera autonoma». Evidence: una prueba con dos corridas abiertas: tras el freno las dos tienen la pausa; reanudar una deja la otra pausada.
- C6. Cada sesión sabe cuál es su corrida, y un proyecto con una sola sesión no nota el cambio. El aviso de inicio dice cuál es la corrida abierta de la sesión y, aparte, qué corridas tienen abiertas otras sesiones; las reglas del Lead y la guía dicen que la corrida es por sesión; con una sola sesión los comandos, los archivos y las salidas son los de hoy, y una corrida abierta con la versión anterior se puede seguir y cerrar. «esto es un issue» y «quiero que resuelvas todos los issues de manera autonoma». Evidence: pruebas del aviso de inicio con una y con varias corridas, una prueba de salidas idénticas a las de hoy con una sola corrida, una prueba que abre una corrida con un `run.json` del formato anterior y la sigue y cierra, y pruebas de docs sobre la guía y la skill `using-aether`.

## User scenarios

1. Given un proyecto donde la sesión A tiene una corrida abierta, When la sesión B abre la suya, Then se abre sin error, con sus propios topes y su propio diario, y la de A sigue abierta y sin cambios.
2. Given la sesión A con su corrida abierta, When A intenta abrir otra, Then se rechaza con un mensaje que nombra la corrida que ya tiene.
3. Given dos corridas abiertas y el tope de horas de la de A vencido, When la sesión B lanza una tarea delegada, compila un plan o inicia un diseño, Then no se frena por el tope de A; When lo hace A, Then se rechaza con el motivo del tope de A.
4. Given dos corridas abiertas, When la sesión B pide el estado, anota gasto, amplía topes o cierra sin nombrar corrida, Then el comando actúa solo sobre la corrida de B.
5. Given dos corridas abiertas y un comando que no sabe qué sesión lo llama, When se ejecuta sin nombrar corrida, Then no actúa sobre ninguna, lista las corridas abiertas y pide que se nombre una; Given una sola corrida abierta, Then actúa sobre ella como hoy.
6. Given una sesión que murió y dejó su corrida abierta, When otra sesión pide su estado y la cierra nombrándola, Then ambas acciones funcionan sin más permisos.
7. Given dos corridas abiertas con trabajo lanzado por cada sesión en la misma ventana de tiempo, When se pide el gasto de cada una, Then cada cifra suma solo el trabajo de su sesión.
8. Given dos corridas abiertas, When salta el freno de cuota, Then ambas quedan pausadas; When una se reanuda, Then la otra sigue pausada hasta que se reanude por su cuenta.
9. Given una sesión que empieza o se reanuda con otras corridas abiertas en el proyecto, When aparece el aviso de inicio, Then dice cuál es su corrida y, aparte y como información, cuáles tienen otras sesiones.
10. Given un proyecto con una sola sesión y una corrida abierta con la versión anterior, When se usan los comandos de siempre, Then las salidas y los archivos son los de hoy y la corrida se puede seguir y cerrar.

## Requirements

- R1: `aether-autonomy start` abre una corrida para la sesión que llama aunque otra sesión del mismo proyecto tenga una corrida abierta; cada corrida tiene su carpeta, sus topes y su diario. Sirve a: C1.
- R2: Una sesión que ya tiene una corrida abierta no puede abrir otra: `start` se rechaza con un mensaje que nombra esa corrida. Sirve a: C1.
- R3: Los lanzamientos de una sesión (`aether-delegate begin`, `aether-plan compile`, el diseño) se rechazan solo por los topes y la pausa de la corrida de esa sesión; el tope vencido de la corrida de otra sesión nunca los rechaza, y una sesión sin corrida no recibe el rechazo de la corrida de otra. Sirve a: C2.
- R4: `status`, `spend`, `extend`, `end`, `brake-off` y `quota-saved`, sin nombrar corrida, actúan sobre la corrida abierta de la sesión que llama y no modifican ninguna otra. Sirve a: C2.
- R5: Cuando un comando no puede saber qué sesión lo llama y hay más de una corrida abierta, no actúa sobre ninguna: lista las corridas abiertas (id y sesión) y pide que se nombre una; con una sola corrida abierta actúa sobre ella. Sirve a: C2.
- R6: `status` y `end` aceptan el id de una corrida y actúan sobre ella aunque la abriera otra sesión, sin ninguna comprobación de quién la abrió ni permiso nuevo. Sirve a: C3.
- R7: La cifra en dólares de una corrida suma solo los enjambres y tareas delegadas lanzados por la sesión de esa corrida; un trabajo que ya cuenta en una corrida no cuenta en otra. Sirve a: C4.
- R8: El trabajo que no se puede atribuir a una sesión se cuenta como hoy, por la ventana de tiempo de la corrida. Sirve a: C4.
- R9: Cuando salta el freno de cuota, la pausa se anota en todas las corridas abiertas del proyecto, y cada corrida se reanuda por su cuenta sin afectar la pausa de otra. Sirve a: C5.
- R10: El aviso de inicio de sesión dice cuál es la corrida abierta de esa sesión y, en un apartado aparte y solo informativo, qué corridas tienen abiertas otras sesiones; sin otras corridas, el aviso no cambia. Sirve a: C6.
- R11: Las reglas del Lead (`skills/using-aether`) y la guía de corridas autónomas dicen que la corrida es por sesión y cómo alcanzar la de otra, y el aviso de inicio sigue dentro de su límite de caracteres por parte. Sirve a: C6.
- R12: Con una sola sesión en el proyecto, los mismos comandos dan las mismas salidas y los mismos archivos que antes; una corrida abierta con la versión anterior se puede seguir y cerrar. Sirve a: C6.
- R13: Ninguna ruta nueva comprueba qué sesión puede leer o cerrar la corrida de otra, y no se añade ningún tope común al proyecto. Sirve a: C3.

## Proposals

None.

## Assumptions

1. Una misma sesión no puede tener dos corridas abiertas; para abrir otra cierra antes la suya. Base: la tarjeta (supuesto 1) y C1. El dueño puede revertirlo.
2. Con más de una corrida abierta y sin saber quién llama, un comando pide que se nombre una en vez de elegir. Base: la tarjeta (supuesto 2); elegir en silencio rompería C2. Reversible.
3. El freno de cuota pausa todas las corridas abiertas, porque la cuota es de la cuenta. Base: la tarjeta (supuesto 3). Reversible.
4. Un enjambre o tarea delegada pertenece a la corrida de la sesión que lo lanzó; lo no atribuible se cuenta por ventana de tiempo. Base: la tarjeta (supuesto 4). Reversible.
5. La misma cita del dueño puede abrir corridas en dos sesiones distintas; cada sesión comprueba la cita en sus propios mensajes, como hoy. Base: la tarjeta (supuesto 5). Reversible.
6. Una corrida del formato anterior sin sesión registrada se trata como una corrida más: se alcanza sin nombrar solo si es la única abierta, y nombrándola en los demás casos. Base: R12; el campo `session` de `run.json` existe hoy, pero no se asume en corridas viejas. Reversible.
7. `extend`, `spend`, `brake-off` y `quota-saved` solo actúan sobre la corrida de quien llama (o sobre la única abierta); nombrar la corrida de otra sesión se ofrece para `status` y `end`, que son lo que pide C3. Base: C3. Reversible.

## Irreversible actions

None.

## Out of scope

- Que un Lead abra o dirija a otro Lead con una sola aprobación del dueño (#1).
- El contrato de mensajes entre sesiones (#147).
- El candado del registro de permisos cuando dos sesiones lo escriben a la vez (#223); los permisos siguen como están.
- Un tope común a todo el proyecto que sume las corridas de todas las sesiones.
- Cualquier restricción nueva sobre qué sesión puede leer o cerrar la corrida de otra.
