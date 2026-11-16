# Spec 043: aviso de modelos nuevos y arreglos de las corridas largas

- **Date:** 2026-11-16
- **Status:** Draft
- **Intent:** `specs/043-new-models-and-run-fixes/intent.md` (tarjeta de los issues #267, #293, #299, #295, #298, #297 y #300; el dueño aprobó el 2026-11-16, en la página de plan, el plan de esta corrida, con topes de 10 h y US$ 300 que él mismo eligió).

## Criteria

- C1. Aether avisa solo de los modelos nuevos y retirados de un harness. Como mucho una vez al día compara la lista de modelos que da hoy cada harness activo con la tabla; un modelo que la tabla no tiene en ninguna de sus partes es nuevo, y uno que la tabla tiene y el harness ya no ofrece es retirado; al iniciar la sesión una línea nombra los nuevos y los retirados, y `aether-doctor` muestra la comparación completa. La lectura no gasta cuota ni llama a un modelo, y un harness que falla o tarda se salta sin estorbar a la sesión ni al cierre. «sobre modelos nuevos es buena idea» y «267 hay trabajar en hacerlo automático que avise». Evidence: pruebas con harnesses falsos que listan un modelo que la tabla no tiene, la tabla con un modelo que el harness ya no lista, un harness que falla y uno que no contesta: el aviso de inicio y la salida de `aether-doctor` dicen lo que toca, la sesión y el cierre terminan sin demora ni error, una segunda lectura el mismo día no vuelve a llamar a ningún harness, y una prueba comprueba que la lectura solo usa los medios de captura sin llamada al modelo.
- C2. El modelo nuevo queda listo para el sí del dueño. En este repositorio el Lead tiene un procedimiento para un modelo nuevo: lee sus páginas de Artificial Analysis, muestra dónde caería en la escalera sin guardarla y deja escritas para revisión sus filas de pares y su precio; nada entra en la tabla sin el sí del dueño. «La B» y «la solución es leer directamente las páginas de AA y mantener la info». Evidence: una prueba de documentos fija el procedimiento en el lugar que lee el Lead de este repositorio y que no lee un usuario del plugin; una prueba comprueba que el aviso y la lectura no escriben en `config/pairs.json`, `config/prices.json` ni `config/models/harness-models.json`.
- C3. Los topes del plan aprobado son los de la corrida. Cuando el dueño aprueba un plan que nombra los topes de una corrida, la corrida abre con esos topes aunque no los haya escrito en un mensaje, y si abre con los de defecto cuando el plan aprobado nombraba otros, se avisa al abrirla. «hiciste muy pco presupeusto yo hbai leido que habias pedido mas horas y mas presupuesto». Evidence: pruebas con una transcripción cuyo resultado de `ExitPlanMode` trae un plan con topes: `start` sin cifras abre con ellos; con un plan sin topes abre como hoy; con un plan cuyos topes no se pueden leer abre con los de defecto y avisa; una prueba de documentos sobre la skill de corridas autónomas.
- C4. El arranque no borra lo de una corrida abierta. Mientras haya una corrida autónoma abierta en el proyecto, la limpieza del arranque no borra nada de la carpeta temporal; cuando sí borra, el aviso dice qué borró; las reglas de las corridas dicen dónde guardar lo que tiene que durar toda la corrida. «Todos los demás creo que los puedes resolver solo no?» (sobre #299). Evidence: pruebas del arranque sobre un repositorio temporal con archivos de más de 24 horas, con y sin corrida abierta, y con corrida abierta de otra sesión; una prueba del texto del aviso; una prueba de documentos sobre la skill.
- C5. El freno de cuota detiene la tarea entera. Pausar por cuota, o parar el run de una tarea delegada, termina también la cadena de esa tarea: durante la pausa no se lanza ningún par nuevo, y el Lead no tiene que buscar ni matar procesos a mano. «Todos los demás creo que los puedes resolver solo no?» (sobre #295). Evidence: una prueba con una cadena de delegado en curso: tras `aether-lane stop` del run o `aether-autonomy quota-brake`, el proceso de la cadena termina y no se lanza ningún par más; una prueba con la pausa anotada en la que una cadena que está por lanzar su par siguiente no lo lanza; una prueba de documentos sobre la skill.
- C6. Al reanudar se ofrece solo lo de la corrida. Recompilar una corrida para reanudarla ofrece solo las tareas pendientes de las que formaban la corrida y avisa si ese conjunto crece respecto al lanzamiento anterior. «Todos los demás creo que los puedes resolver solo no?» (sobre #298). Evidence: una prueba que compila un plan de varias tareas con `--only` de pocas, fusiona casi todas y recompila con `--run` sin `--only`: ofrece solo la pendiente; una prueba en que el conjunto crece y sale el aviso por stderr.
- C7. Lo que el Examiner deja no se pierde. El índice del examen se mantiene verdadero a medida que el Examiner termina cada prueba; si el Examiner termina sin respuesta, el Lead recibe las pruebas que existen, marcando cuáles están en el índice y cuáles no; la regla del Lead dice que una prueba fuera del índice se corre antes de añadirla. «Todos los demás creo que los puedes resolver solo no?» (sobre #297; ya es la tercera vez, #76, #229, #297). Evidence: una prueba del flujo de diseño con un Examiner de mentira que escribe tres pruebas y termina sin respuesta: el resultado lista las tres con su marca y el índice guardado nombra las que el Examiner terminó; una prueba de documentos sobre la regla del Lead y el texto del Examiner.
- C8. Los menores de #300 quedan hechos con la recomendación que el dueño aprobó en el plan. «Todos los demás creo que los puedes resolver solo no?» y «Cierra los con el argumento y ahora hazme la propuesta junto con lo que conversamos antes». Evidence: una prueba o una comprobación por cada uno de los seis puntos, nombrados en R25 a R30.

## User scenarios

1. Given el harness `grok` activo que lista un modelo que la tabla no tiene en `models`, `superseded` ni `outOfScope`, When una sesión del Lead se cierra y otra empieza, Then el aviso de inicio nombra el modelo nuevo y el harness, y `aether-doctor` lo muestra en la comparación.
2. Given la tabla con un modelo que el harness ya no lista, When se lee, Then el aviso lo nombra como retirado y ninguna fila de la tabla cambia.
3. Given una lectura hecha hoy, When otra sesión se cierra el mismo día, Then no se llama a ningún harness.
4. Given un harness que falla o que no contesta a tiempo, When se lee, Then se salta, `aether-doctor` dice que no se pudo leer y la sesión y el cierre no se demoran ni fallan.
5. Given un harness que la opción `harnesses` no activa, Cursor o Claude, When se lee, Then no se lee ni se avisa de ellos.
6. Given un aviso de modelo nuevo en este repositorio, When el Lead lo atiende, Then lee las páginas de Artificial Analysis del modelo, muestra dónde caería en la escalera sin guardarla y deja escritas las filas de pares y el precio para revisión; Given que el dueño no ha dado el sí, Then la tabla, las filas y los precios no cambian.
7. Given una transcripción en la que el dueño aprobó con `ExitPlanMode` un plan que nombra 10 h y US$ 300 y no escribió ninguna cifra, When el Lead ejecuta `aether-autonomy start` sin `--hours` ni `--usd`, Then la corrida abre con 10 h y US$ 300 y lo dice.
8. Given esa misma aprobación y el dueño que escribe después en un mensaje otra cifra, When se abre la corrida, Then manda la cifra del mensaje.
9. Given una aprobación cuyo plan no nombra topes, When se abre la corrida, Then abre como hoy: la cifra del dueño en un mensaje o 8 h y US$ 50.
10. Given un plan aprobado que nombraba topes y que `start` no pudo leer, When la corrida abre con los de defecto, Then el aviso dice que el plan nombraba otros.
11. Given una corrida autónoma abierta en el proyecto y archivos de más de 24 horas en `.aether/tmp`, When empieza una sesión (inicio, `clear` o compactación), Then no se borra nada de esa carpeta.
12. Given ninguna corrida abierta y archivos viejos en `.aether/tmp`, When empieza una sesión, Then se borran y el aviso nombra las rutas borradas, las primeras y «y N más».
13. Given una corrida con una tarea delegada en una cadena de pares, When salta el freno de cuota y el Lead corre `aether-lane stop` y `aether-autonomy quota-brake`, Then el proceso de la cadena termina y no se lanza ningún par durante la pausa, sin que el Lead busque procesos.
14. Given una corrida pausada por cuota, When una cadena que sigue viva llega al momento de lanzar su par siguiente, Then no lo lanza.
15. Given una corrida compilada con `--only` de 10 tareas de un plan de 54, nueve fusionadas, When se recompila con `--run` y sin `--only`, Then ofrece solo la que falta.
16. Given una recompilación cuyo conjunto de tareas es mayor que el del lanzamiento anterior, When se ejecuta, Then sale un aviso por stderr que da las dos cifras.
17. Given un Examiner que termina sin respuesta con tres pruebas escritas y dos en el índice, When el diseño termina, Then el Lead recibe las tres con su marca (en el índice o fuera de él) y el índice guardado tiene las dos terminadas.
18. Given un diseño que terminó con `exam.status: failed` y una prueba fuera del índice, When el Lead la atiende, Then la corre antes de añadirla al índice.
19. Given un usuario del plugin que quiere declarar las reglas del plan, When abre la guía, Then encuentra una página que explica `.specify/plan-rules.json` y los avisos de `aether-plan check`.

## Requirements

- R1: Como mucho una vez al día, al cerrar una sesión del Lead, Aether lee la lista de modelos de cada harness activo según la opción `harnesses`, entre los que tienen medio de captura sin llamada al modelo (agy, grok, Codex y Muse), y guarda el resultado; una segunda lectura el mismo día no llama a ningún harness. La lectura no gasta cuota de ningún harness ni llama a un modelo. Sirve a: C1.
- R2: Un modelo es nuevo cuando el harness lo lista y la tabla no lo tiene en ninguna de sus partes (`models`, `superseded` y `outOfScope`); es retirado cuando la tabla lo tiene en `models` y el harness ya no lo lista. «Retirado» solo avisa: no cambia ninguna fila. Sirve a: C1.
- R3: Al iniciar una sesión del Lead, si la última lectura halló modelos nuevos o retirados que no se han avisado, el arranque añade una línea que los nombra por harness; sin diferencias o sin lectura no añade nada, y la línea cabe en los topes del arranque. Sirve a: C1.
- R4: `aether-doctor` muestra, por harness activo, la comparación completa (nuevos, retirados, cuándo se leyó y, si no se pudo leer, el motivo), sin escribir nada. Sirve a: C1.
- R5: Un harness que falla, que no está instalado o que no contesta dentro de un tiempo acotado se salta con su motivo anotado; la lectura entera tiene un tiempo máximo y nunca demora ni hace fallar al cierre de la sesión ni al arranque. Sirve a: C1.
- R6: Claude y Cursor no se leen, y los harnesses que la opción `harnesses` no activa tampoco; en una sesión que no es del Lead, la lectura y el aviso no hacen nada. Sirve a: C1.
- R7: Existe un procedimiento para el Lead de este repositorio (no para el usuario del plugin ni dentro de lo que el arranque inyecta) que, ante un aviso de modelo nuevo, manda leer las páginas de Artificial Analysis del modelo con las herramientas del repositorio, mostrar dónde caería en la escalera sin guardarla, y dejar escritas para revisión las filas de pares y el precio. Sirve a: C2.
- R8: Ni el aviso, ni la lectura, ni el procedimiento escriben en `config/pairs.json`, `config/prices.json` ni `config/models/harness-models.json`; el modelo entra en la tabla solo con el sí del dueño, dado en sus palabras. Sirve a: C2.
- R9: `aether-autonomy start` sin `--hours` ni `--usd` lee, del resultado de `ExitPlanMode` de la transcripción que ya consulta para la aprobación, los topes de horas y de dólares que el plan aprobado nombra, y abre la corrida con ellos; dice con qué topes abrió y de dónde salieron. Sirve a: C3.
- R10: Una cifra que el dueño escribió en un mensaje después de la aprobación manda sobre la del plan; un plan que no nombra ningún tope deja todo como hoy (la cifra del dueño en un mensaje o 8 h y US$ 50). Sirve a: C3.
- R11: Cuando la corrida abre con los topes de defecto y el plan aprobado nombraba otros, o los nombraba de una forma que `start` no pudo leer, `start` lo avisa al abrirla, con las cifras que el plan nombraba cuando las hay. Sirve a: C3.
- R12: La skill de corridas autónomas dice en qué forma debe nombrar el plan sus topes para que `start` los lea, y que la aprobación del plan que los nombra cuenta como la cifra del dueño. Sirve a: C3.
- R13: La limpieza de `.aether/tmp` del arranque no borra nada mientras haya una corrida autónoma abierta en el proyecto, sea de la sesión que sea, y no toca la carpeta de la corrida, `.aether/autonomy/<id>/`. Sirve a: C4.
- R14: Cuando la limpieza del arranque borra algo de `.aether`, el aviso nombra lo borrado: las rutas, las primeras y «y N más». Sirve a: C4.
- R15: La skill de corridas autónomas dice que lo que tiene que durar toda la corrida (guiones, marcadores) va en `.aether/autonomy/<id>/`, junto al diario, y no en `.aether/tmp`. Sirve a: C4.
- R16: Parar el run de una tarea delegada (`aether-lane stop`) termina también el proceso de la cadena de esa tarea, y `aether-autonomy quota-brake` hace lo mismo con la cadena de cada delegado en vuelo, sin que el Lead tenga que buscar procesos. Sirve a: C5.
- R17: Una cadena de delegado consulta la pausa de cuota antes de lanzar cada par y, con la pausa anotada, no lanza ninguno; la tarea queda en un estado desde el que se relanza al reanudar. Sirve a: C5.
- R18: La skill de corridas autónomas deja de pedir al Lead que busque y termine a mano los procesos `aether-delegate run` tras el freno, y dice que `quota-brake` y `aether-lane stop` terminan la cadena. Sirve a: C5.
- R19: `aether-plan compile <tasks.md> --run <runId>` sin `--only` conserva la selección con la que nació la corrida (la unión de los `--only` de sus lanzamientos) y ofrece solo lo pendiente de esa selección. Sirve a: C6.
- R20: Cuando un compile con `--run` ofrece un conjunto de tareas mayor que el del lanzamiento anterior de esa corrida, avisa por stderr con las dos cifras. Sirve a: C6.
- R21: La skill de corridas autónomas o la del enjambre dicen que reanudar una corrida es recompilar con `--run` y que el compile conserva la selección de la corrida. Sirve a: C6.
- R22: El Examiner deja el índice del examen (`exam.json`) verdadero tras cada prueba terminada y corrida: una entrada por prueba, escrita al terminar esa prueba. Sirve a: C7.
- R23: Cuando el Examiner termina sin respuesta que cumpla su esquema, el flujo de diseño devuelve al Lead las pruebas que hay en `.aether/exam/`, cada una marcada como «en el índice» o «escrita y fuera del índice», sin perder las que sí están en el índice. Sirve a: C7.
- R24: La regla del Lead para un `exam.status: failed` dice que una prueba fuera del índice se corre antes de añadirla al índice. Sirve a: C7.
- R25: Los dos cambios que no caben en la parte 2 de las reglas del Lead van a otro sitio, sin ocupar caracteres del arranque: el aviso de que, en un árbol de desarrollo, un nombre suelto de un bin corre el de la versión instalada va a `AGENTS.md`, y lo que hay que hacer cuando `aether-delegate approve` se niega en `main` por falta del permiso `merge-main` lo dice el propio mensaje de rechazo. La parte 2 del arranque no crece. Sirve a: C8.
- R26: La fila «Direct» de «The three paths» deja de decir que las pruebas que la regla pide tras una fusión no cuentan; la frase sale de la skill `using-aether`, `docs/methodology.md`, `docs/tutorials/first-request.md`, `site/app.js` y de las pruebas que la fijan (`tests/using-aether-030.test.js`, `tests/docs-facts.test.js`), que se ajustan. Sirve a: C8.
- R27: `docs/decisions.md` registra, con número, que los worktrees de las unidades atendidas quedan fuera de la señal de vida del watch, y el comentario de `lib/wt-watch.js` y su prueba apuntan a esa decisión. Sirve a: C8.
- R28: Las dos listas que hoy se llaman `HARNESS_NAMES` (`lib/harness-names.js` y `lib/harness/index.js`) dejan de llamarse igual; cada nombre dice qué contiene, y todo lo que las importa sigue funcionando con el mismo comportamiento. Sirve a: C8.
- R29: `lib/skill-review.js` se parte en tres módulos por sus tres responsabilidades (la revisión de una skill, el registro de cargas del Lead y el detector de temas), con el mismo comportamiento, y cada módulo nuevo queda en `docs/reference/components.md`. Sirve a: C8.
- R30: Una página de `docs/guide/` explica a quien usa el plugin las reglas del plan (`.specify/plan-rules.json`) y los avisos de `aether-plan check`, con `title`, `description` y `order` en su cabecera y enlazada desde `docs/index.md`. Sirve a: C8.
- R31: Todo lo nuevo de esta spec que sea un módulo, un verbo o una decisión queda registrado donde las pruebas de documentos lo exigen (`docs/reference/components.md`, la guía y el registro de decisiones), y las páginas que describen el arranque, el doctor, las corridas y el examen dicen lo nuevo. Sirve a: C1, C3, C4, C5, C7.

## Proposals

None.

## Assumptions

- Los siete issues van en una sola spec; el diseño puede partirla si conviene. Base: la tarjeta. El dueño puede revertirlo pidiendo specs separadas.
- La lectura de modelos se hace al cerrar una sesión del Lead, igual que la de las propuestas de calibración, y solo en los harnesses que la opción `harnesses` activa. Base: la tarjeta.
- Para C4 cuenta como corrida abierta cualquiera del proyecto, sea de la sesión que sea. Base: la tarjeta.
- Para C3 el texto del plan aprobado es la fuente de los topes; si no nombra ninguno, todo sigue como hoy. Base: la tarjeta.
- «Retirado» solo avisa y no saca ninguna fila de la tabla. Base: la tarjeta.
- El aviso de inicio se muestra una vez por diferencia hallada; `aether-doctor` la muestra siempre mientras dure. Base: evita repetir un aviso que el dueño ya vio y que puede decidir no atender. Se revierte haciendo que el arranque lo repita en cada inicio.
- Si el dueño escribe una cifra en un mensaje después de aprobar el plan, esa cifra manda sobre la del plan. Base: sus palabras directas pesan más que un texto que escribió el Lead. Se revierte haciendo que mande siempre el plan.
- «Tiempo acotado» de la lectura de cada harness y de la lectura entera son valores de configuración con un valor por defecto corto, no una cifra que el dueño haya dado. Se cambian en `config/`.
- Las filas y el precio de un modelo nuevo quedan escritos como borrador fuera de la tabla (en `.aether/`, que no se sube al repositorio), a la espera del sí del dueño. Se revierte pidiendo que el borrador vaya en un comentario del issue.
- Con la pausa de cuota anotada, la cadena que no lanza su par deja la tarea relanzable y no la declara fallida. Base: el freno existe para que nada corra y para reanudar después.
- La limpieza de `.aether/tmp` sigue con su umbral de 24 horas cuando no hay corrida abierta. Base: C4 pide no borrar solo mientras hay una corrida abierta.
- Si un plan nombra más de una cifra de horas o de dólares y no se puede saber cuál es el tope, `start` no elige: abre con los de defecto y lo avisa (R11). Se revierte tomando la mayor.

## Irreversible actions

None.

## Out of scope

- El resto de la etapa 2 de la spec 038: carpetas por harness, harnesses extra como plugins, panel.
- Detectar modelos nuevos de Claude y de Cursor: Claude no tiene comando que liste modelos y Cursor no tiene entrada en la tabla.
- Escribir filas de modelos en la tabla sin el sí del dueño.
- Cualquier llamada pagada o que gaste cuota de un harness.
- #1, #147, #223 y los análisis del 9 de noviembre (#193 a #226).
