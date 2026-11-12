# Tarjeta de intención: issues abiertos, tanda 8

- **Fecha:** 2026-11-12
- **Issues:** cierra los urgentes #257, #255 y #235, y los no urgentes #256, #236, #232, #215, #209, #224, #136, #203 y #201.
- **Confirmada por el dueño:** aprobó en modo plan la corrida `auto-20261112-130719-ffd5` (sesión 75906934), con este alcance y la división que se le propuso.
- **Base:** versión 0.41.0, `origin/main` en `6b31c62`.
- **Evidencia:** el cuerpo de cada issue está copiado en `evidence/issue-NNN.md`. Lee esas copias; cada criterio de abajo nombra su issue.

## 1. Las palabras del dueño

1. «arreglas los urgentes unicamente d emanera autonome y los no urgentes que no necesitan de mi atenciones. todo d emanera autonoma»
2. Antes de eso, al ver la lista: «mejor ciera los tres urgentes y los que no neciestan trabjado de manera autonoma trabajjalos en corregirlos».

## 2. Lo que el dueño confirmó

- **Urgentes:** fallos que hoy rompen o confunden una corrida del enjambre o la elección de pares: #257, #255 y #235.
- **No urgentes que no necesitan su atención:** hallazgos menores diferidos de las specs 031, 032 y 034 (#232, #236, #256); la higiene de los textos de los agentes (#215); el tiempo de una corrida (#209); las propuestas de calibración que nadie ve (#224); una sola lista de harness (#136); una sola preparación de datos y un solo almacén de marcas para elegir el par (#203); y dos procedimientos fijos convertidos en comandos (#201).
- Todo se trabaja de forma autónoma y nada se publica sin su sí.

## 3. Criterios

**Urgentes** (palabra 1, «arreglas los urgentes»):

- **C1, #257. El enjambre no se traba por una nota del agente ops.** Si el agente ops devuelve la línea JSON del bin y después agrega texto propio, el flujo lee esa línea JSON y la unidad sigue. Vale en `run.workflow.js` y en `design.workflow.js`. Una salida sin ninguna línea JSON se sigue tratando como hoy.
- **C2, #255. Un commit sobre HEAD desacoplado no se pierde.** Cuando un implementador de otro harness deja su trabajo en un commit sobre HEAD desacoplado, el resultado, la revisión y la fusión ven ese trabajo, o el intento se rechaza con un motivo claro que nombra la causa, nunca con una rama vacía. El resultado nombra la rama y su commit tal como están. Además, nada en lo que el sistema o las reglas del Lead ponen en el brief de un delegado de otro harness le pide `checkout --detach`.
- **C3, #235. Refrescar las cifras no cambia, sin que nadie lo decida, qué par sirve cada escalón.** El refresco de `config/pairs.json` deja la tabla con una sola fecha para todas las filas que tienen página en Artificial Analysis. Las filas estimadas, que no tienen página (Muse Spark de `low` a `xhigh`), guardan su distancia con su referencia de Claude, así que un movimiento parejo de la escala no las saca ni las mete en un escalón.

**No urgentes** (palabra 1, «los no urgentes que no necesitan de mi atenciones»):

- **C4, #256, #236 y #232. Menores diferidos.** Cada hallazgo menor queda arreglado, o se descarta en la spec con su motivo (ya resuelto en 0.40 o 0.41, o ya no aplica). Las dudas de #236 ya se decidieron (están en su issue) y no se reabren. Las comprobaciones de #232 que solo se pueden hacer en una sesión real quedan fuera.
- **C5, #215. Los textos de los agentes piden solo lo que alguien lee.** Para cada uno de los puntos 1 a 5 del issue, la petición se quita del texto del agente o recibe un campo que el workflow lee. Las cifras sin fuente se quitan o llevan su fuente. Los presupuestos de turnos que ningún código cuenta se presentan como guía o se quitan, sin contradecir lo que hace `lib/seats.js` en otro harness.
- **C6, #209. El informe de una corrida dice en qué se fue el tiempo.** Registra la duración de cada pasada del gate, de las pruebas de cada fusión, de la línea base y de las esperas (de cuota y de una unidad trabada), para que el tiempo sin ningún modelo trabajando tenga nombre.
- **C7, #224. Las propuestas de calibración se ven.** Un comando muestra la última lectura de la observación (propuestas de calibración y fricciones). El aviso de arranque dice en una línea cuántas propuestas hay y nombra ese comando. La calibración sigue sin cambiar la configuración por su cuenta.
- **C8, #136. Una sola lista de harness.** Los nombres de los harness y su orden viven en un solo sitio de `lib/`. Las listas fijas de hoy, las líneas de uso y los mensajes de error la leen de ahí, y las pruebas también. `tests/harness-lists.test.js` sigue como guardián de que nadie la vuelva a escribir a mano. El comportamiento no cambia.
- **C9, #203. Una sola preparación de datos y un solo almacén de marcas para elegir el par.** Los delegados, el enjambre y los asientos de diseño preparan con un mismo código los datos que van a `choose`, y las marcas viven en un solo almacén sin perder ninguna de las que ya existen. Las reglas del Lead dicen que leer la cuota de Muse gasta una llamada real. La elección de par no cambia.
- **C10, #201. Dos procedimientos fijos son un comando.** El freno de cuota (parar, guardar cada corrida del enjambre, registrar `quota-saved` y, si toca, el push) y aprobar una edición (veredicto, fusión y prueba en la rama, con la comprobación del permiso cuando la rama es `main` o `master`) son cada uno un solo comando de un bin que ya existe. Las skills nombran el comando en lugar de contar los pasos. Las demás secuencias de #201 quedan fuera.

**Para todo:**

- **C11, probado sin gastar tokens.** Cada criterio tiene pruebas en `npm test` o en el mod, y `npm run check` pasa.
- **C12, el arranque no crece.** Las partes del arranque (`skills/using-aether`) están en su límite de tamaño (#241): ningún cambio las hace crecer, y donde un comando reemplaza prosa, deben encoger.

## 4. Qué queda fuera

- Los issues que el dueño tiene que decidir: #193, #195, #196, #197, #210, #212, #213, #223, #234, #1, #103, #202, #220, #222, #226, #132 y #262. Tampoco entran los que solo registran datos: #147, #207, #211, #216, #218, #219 y #225.
- Cambiar la escalera, sus escalones o la regla de repetición.
- Leer de verdad las páginas de Artificial Analysis o hacer cualquier llamada de pago: las pruebas del refresco usan páginas simuladas.
- Publicar una versión, fusionar a `main` o hacer push.

## 5. Respuestas y supuestos

- **Supuesto del Lead, #235:** una sola fecha para las filas con página, y las filas estimadas guardan su distancia con su referencia de Claude. Es la propuesta que se le hizo al dueño antes de que dijera «todo d emanera autonoma». Es reversible.
- **Supuesto del Lead, #255:** si HEAD está desacoplado y por delante de la rama de la unidad, la rama avanza a HEAD; si HEAD no desciende de la rama, el intento se rechaza con su motivo. El Writer comprueba en el código de dónde salió la línea `checkout --detach` del brief. Es reversible.
- **Supuesto del Lead, #224:** el comando es un verbo nuevo de `aether-observe`, y el aviso va en las notas de arranque, no en las partes del arranque. Es reversible.
- **Supuesto del Lead, #203:** el almacén que queda lo elige el Writer; las marcas del otro se migran o se siguen leyendo hasta que caduquen, sin perder ninguna. Es reversible.
- **Supuesto del Lead, #201:** el comando de aprobar una edición nunca fusiona en `main` o `master` sin el permiso que hoy exige `aether-autonomy check merge-main`. Es reversible.
