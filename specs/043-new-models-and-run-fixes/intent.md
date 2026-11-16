# Tarjeta de intención 043: aviso de modelos nuevos y arreglos de las corridas largas

Issues: #267 (Aether no detecta los modelos nuevos de un harness), #293 (una corrida nace con los topes por defecto), #299 (el arranque borra los guiones de una corrida abierta), #295 (el freno de cuota no detiene la cadena de un delegado), #298 (`compile --run` ofrece tareas que nunca fueron de la corrida), #297 (el Examiner termina sin respuesta) y #300 (menores diferidos). El número 043 lo dio `aether-plan next-spec`. La tarjeta de la spec 038 reservó 039 y 040 para la etapa 2 de los harnesses como extras; esta tarjeta toma solo el aviso de modelos nuevos de esa etapa.

## Palabras del dueño

1. «sobre modelos nuevos es buena idea» (2026-11-13, en la aprobación de la spec 038, que dejó el aviso de modelos nuevos para la etapa 2).
2. «267 hay trabajar en hacerlo automático que avise» (2026-11-16).
3. «La B» (2026-11-16). Elegía entre dos opciones para después del aviso: a) solo avisar; b) avisar y que el Lead, en este repo, lea las páginas de Artificial Analysis del modelo nuevo, muestre dónde caería en la escalera y deje sus filas y su precio listos para el sí del dueño.
4. «Todos los demás creo que los puedes resolver solo no?» (2026-11-16, sobre #293, #299, #295, #298, #297 y #300).
5. «Cierra los con el argumento y ahora hazme la propuesta junto con lo que conversamos antes» (2026-11-16, el encargo de esta corrida).
6. «hiciste muy pco presupeusto yo hbai leido que habias pedido mas horas y mas presupuesto» (2026-11-16, comentario en #293, cuando una corrida paró por un tope que no era el que él había aprobado).
7. «la solución es leer directamente las páginas de AA y mantener la info» (2026-11-13, #268: las páginas de Artificial Analysis son la única fuente de cifras).

## Entendimiento que el dueño confirmó

Aprobó el 2026-11-16, en la página de plan, el plan de esta corrida, con topes de 10 h y US$ 300 que él mismo eligió. En palabras llanas:

- **Modelos nuevos (#267).** Aether compara por sí mismo los modelos que ofrece cada harness con su tabla. Cuando aparece uno nuevo, o desaparece uno que la tabla tiene, avisa al dueño al iniciar la sesión. En este repositorio, el Lead deja además listo el modelo nuevo para entrar en la tabla, y entra solo con el sí del dueño.
- **Los bugs.** Los cinco bugs de las corridas largas se arreglan sin preguntarle al dueño: la causa de cada uno está en su issue.
- **#300.** Lo que pedía una decisión va con la recomendación del Lead que el dueño aprobó en el plan (C8).

## Hechos del código que la tarjeta da por sabidos

Leídos en `main` (`b1b0061`, versión 0.45.0) el 2026-11-16:

- `plugins/aether/config/models/harness-models.json` guarda, por harness, `listedBy`, `capturedAt`, `models` y, en algunos, `superseded` y `outOfScope`. Cómo se capturó cada lista:
  - agy: `agy models` (agy 1.5.8);
  - grok: `grok models`;
  - Codex: `~/.codex/models_cache.json`, porque codex 0.166.0 no tiene comando que liste modelos;
  - Muse: `model/list` de `muse serve`, sin llamada al modelo;
  - Claude: a mano desde `claude --help`, porque no tiene comando que liste modelos.
  
  Cursor no tiene entrada.
- La opción `harnesses` de `plugin.json` dice qué harnesses están activos. `plugins/aether/lib/doctor.js` ya revisa esos harnesses (`namedHarnesses`, `harnessesCheck`) y no lee ni escribe nada.
- El aviso de las propuestas de calibración sirve de modelo para el de los modelos nuevos: la lectura la hace `SessionEnd` (`lib/observe-read.js`), y el arranque añade una línea con `require('./observe-notice.js').proposalsNote(...)` (`lib/session-start.js`, cerca de la línea 555).
- Las cifras de un modelo salen de `scripts/aa-pages.js read [slug ...] [--harness <name>]`. `scripts/refresh-lanes.js` sin `--write` muestra la escalera recalculada sin guardarla, y `scripts/build-models-index.js` rehace el índice a partir de la foto, sin red. Los precios están en `config/prices.json` y las filas en `config/pairs.json`.
- `aether-autonomy start` toma `--hours` y `--usd` solo de una cifra del dueño; si no la hay, usa 8 h y US$ 50. Ya lee la transcripción para exigir una aprobación de `ExitPlanMode`. En la versión instalada de Claude Code, el resultado de `ExitPlanMode` en la transcripción trae el texto del plan aprobado, bajo «## Approved Plan:».
- La limpieza de `.aether/tmp` está en `lib/tree-clean.js` (`TMP_HOURS = 24`) y la llama el paso 5 de `lib/session-start.js`.
- #295, #298, #297 y #300 traen en su cuerpo los archivos, las líneas y la evidencia.

## Criterios

- **C1. El aviso de modelos nuevos.** Como mucho una vez al día, Aether compara la lista de modelos que da hoy cada harness activo con la tabla. Un modelo que la tabla no tiene en ninguna de sus partes es nuevo; uno que la tabla tiene y el harness ya no ofrece es retirado. Al iniciar la sesión, una línea nombra los nuevos y los retirados, y `aether-doctor` muestra la comparación completa. La lectura no gasta cuota ni hace llamadas a un modelo. Si un harness falla o tarda, se salta sin estorbar a la sesión ni al cierre. Por qué: palabras 1 y 2.
- **C2. El modelo nuevo queda listo para el sí del dueño.** En este repositorio, el Lead tiene un procedimiento para un modelo nuevo: lee sus páginas de Artificial Analysis, muestra dónde caería en la escalera sin guardarla, y deja escritas para revisión sus filas de pares y su precio. Nada entra en la tabla sin el sí del dueño. Por qué: palabras 3 y 7.
- **C3. Los topes del plan aprobado son los de la corrida.** Cuando el dueño aprueba un plan que nombra los topes de una corrida, la corrida abre con esos topes, aunque el dueño no los haya escrito en un mensaje. Si una corrida abre con los topes por defecto cuando el plan aprobado nombraba otros, se avisa al abrirla. Por qué: palabra 6.
- **C4. El arranque no borra lo de una corrida abierta.** Mientras haya una corrida autónoma abierta en el proyecto, la limpieza del arranque no borra nada de su carpeta temporal. Cuando sí borra, el aviso dice qué borró. Las reglas de las corridas dicen dónde guardar lo que tiene que durar toda la corrida. Por qué: palabra 4; una corrida de horas no puede perder sus archivos a mitad de camino.
- **C5. El freno de cuota detiene la tarea entera.** Pausar por cuota, o parar el run de una tarea delegada, termina también la cadena de esa tarea: durante la pausa no se lanza ningún par nuevo, y el Lead no tiene que buscar ni matar procesos a mano. Por qué: palabra 4; el freno existe para que nada corra durante la pausa.
- **C6. Al reanudar se ofrece solo lo de la corrida.** Recompilar una corrida para reanudarla ofrece solo las tareas pendientes de las que formaban la corrida, y avisa si ese conjunto crece respecto al lanzamiento anterior. Por qué: palabra 4; reanudar no puede volver a construir trabajo ya hecho.
- **C7. Lo que el Examiner deja no se pierde.** El índice del examen se mantiene verdadero a medida que el Examiner termina cada prueba. Si el Examiner termina sin respuesta, el Lead recibe las pruebas que existen, marcando cuáles están en el índice y cuáles no. La regla del Lead dice que una prueba fuera del índice se corre antes de añadirla. Por qué: palabra 4; ya es la tercera vez que pasa (#76, #229, #297).
- **C8. Los menores de #300**, con la recomendación que el dueño aprobó en el plan. Por qué: palabras 4 y 5.
  1. Los dos cambios que no caben en la parte 2 de las reglas del Lead van a otro sitio, sin ocupar caracteres del arranque. El aviso de que, en un árbol de desarrollo, un nombre suelto corre el bin de la versión instalada va a `AGENTS.md`. Lo que hay que hacer cuando `aether-delegate approve` se niega en `main` por falta del permiso `merge-main` lo dice el propio mensaje de rechazo.
  2. Sale de la fila «Direct» de «The three paths» la frase sobre las pruebas que la regla pide tras una fusión, porque ninguna regla las pide ya. Se ajustan los documentos, el sitio y las pruebas que la fijan.
  3. Se registra como decisión en `docs/decisions.md` que los worktrees de las unidades atendidas quedan fuera de la señal de vida del watch.
  4. Las dos listas que se llaman `HARNESS_NAMES` dejan de llamarse igual.
  5. `skill-review.js` se parte por sus tres responsabilidades, y cada módulo nuevo queda en `docs/reference/components.md`.
  6. Una página de `docs/guide/` explica a quien usa el plugin las reglas del plan (`.specify/plan-rules.json`) y los avisos de `aether-plan check`.

## Qué queda fuera

- El resto de la etapa 2 de la spec 038: carpetas por harness, harnesses extra como plugins, panel.
- Detectar modelos nuevos de Claude y de Cursor: Claude no tiene comando que liste modelos y Cursor no tiene entrada en la tabla.
- Escribir filas de modelos en la tabla sin el sí del dueño.
- Cualquier llamada pagada o que gaste cuota de un harness.
- #1, #147, #223 y los análisis del 9 de noviembre (#193 a #226).

## Respuestas a las preguntas de aclaración

No se le preguntó nada más al dueño: aprobó el plan, y los topes los eligió él. Estos son supuestos del Lead, todos reversibles:

1. Los siete issues van en una sola spec. El diseño puede partirla si conviene.
2. La lectura de modelos se hace al cerrar una sesión del Lead, igual que la de las propuestas de calibración, y solo en los harnesses que la opción `harnesses` activa.
3. Para C4, cuenta como corrida abierta cualquiera del proyecto, sea de la sesión que sea.
4. Para C3, el texto del plan aprobado es la fuente de los topes. Si el plan no nombra ninguno, todo sigue como hoy: la cifra del dueño en un mensaje o los de defecto.
5. «Retirado» solo avisa: no saca ninguna fila de la tabla.
