# Tarjeta de intención: superdelegación

- **Dueño:** Christopher
- **Fecha:** 2026-10-19
- **Issue de origen:** [031](../../docs/issues/031-almost-no-work-leaves-claude-because-the-lane-table-and-the-seat-profiles-give-other-harnesses-no-permission.md). El dueño dijo «issue 032» al abrir la sesión, pero describió lo del 031; el 032 (la ventana del workflow que muestra Haiku con 0 tokens) es otro y queda fuera.
- **Confirmada por el dueño** en su segundo mensaje, que corrige un punto (solo inteligencia) y repite la meta sin objetar el resto de lo que el Lead le escribió de vuelta. No abre una corrida autónoma: se diseña y se detiene en el plan con el resumen corto.
- **Otra sesión** trabaja Muse Code como harness (`specs/008-muse-harness`, rama `feat/muse-harness`). Esta tarjeta es la 009 para no chocar con la 008.

## 1. Las palabras del dueño

1. «en esta sesion vamos a trbajaar el issue 032. COnsidero muy confuso de lo native balanced y robust. Tengo una propuesta que va a ser mas facil de entender. Una config de superdelegacion. superdelegacion = true false. Si esta activo todo lo que no sea agente lead ira a otros harness. si esta desacticada todo cae a claude code nativo. Obviamente esocvjemos los modelos para cada tarea como emos hecho. Escogiendo velocidad, costo y capacidad. Considerando los efforts eso define que modelo hace que cosa. [...] ya sabes que estamos considerando artificial analysys para los puntos de intlegiecnia»
2. «se que inteleigencia y temrianl bench es distitno paero para no sobrecomplicar nosotros solo usaremos la de intelgiencia, la idea es usar los modelos de los ahrness adecuados y mas cercanos o proximos a haiku sonnet y opus. Pero no todos los los efforts valen igual. La idea es que si ya estan las cuotas de los otros harness el trabajo de redirgija ahi el trafico para poder agotar las cuotas que la picnipal de claude code»
3. Dicho antes por el dueño, el 2026-10-19 en la sesión de Muse (issue 031): «yo lo que quiero es una plitica de superdelagcion total no se si hay que meter configs o politicas, o que acciones podamos tomar, la diea es que los harness externos ocupen todas las tareas que no sean lead. Asi se promueve que se gasten primero la cutoa de los harness externos».
4. Dicho antes por el dueño sobre el router: «lo del router si esta bien ese no hay que moverlo».
5. Dicho antes por el dueño y registrado en el arranque del Lead: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño».

## 2. Lo que el dueño confirmó

Hoy, para decidir qué trabajo sale de Claude, el dueño tiene tres perfiles de asientos (`native`, `balanced`, `robust`) y un interruptor de lanes aparte, y no entiende qué hace cada uno (1). Quiere **un solo interruptor, `superdelegation`, sí o no**:

- **Apagado:** todo lo que no es el Lead cae a Claude Code nativo.
- **Encendido:** todo lo que no es el Lead va a otros harness, para gastar primero la cuota de los otros harness y no la de Claude Code (2, 3).
- **Qué modelo hace qué** lo define la inteligencia: a cada tarea se le da, entre los modelos de los harness externos, el más cercano en puntos de inteligencia de Artificial Analysis a Haiku, Sonnet u Opus, y como no todos los esfuerzos valen igual, cada esfuerzo cuenta con sus propios puntos (1, 2). Solo se usa la inteligencia, no terminal-bench (2).
- **Velocidad y costo** siguen entrando en la elección entre los modelos cercanos (1).

## 3. Criterios

Cada criterio dice qué y por qué, y se ata a una cita de la sección 1.

- **C1. Un solo interruptor.** El dueño elige `superdelegation` encendido o apagado, y eso reemplaza a elegir entre `native`, `balanced` y `robust`. *Por qué:* hoy no lo entiende. (1)
- **C2. Apagado, todo es Claude nativo.** Ninguna llamada de un agente que no sea el Lead sale a otro harness, ni en el swarm ni en el diseño. *Por qué:* es lo que él describe para el estado apagado. (1)
- **C3. Encendido, todo lo que no es el Lead sale.** Cada llamada del swarm (implementador, supervisor, revisión final) y cada ronda del diseño (borradores y correcciones del Writer, el Judge, el Examiner) va a un harness externo siempre que haya uno disponible que cumpla C4; el agente nativo solo toma la que ninguno puede. *Por qué:* «todas las tareas que no sean lead». (1, 3)
- **C4. La inteligencia decide qué modelo hace qué.** Para cada llamada, con su modelo de Claude (Haiku, Sonnet u Opus) y su esfuerzo, se toma el modelo externo cuyos puntos de inteligencia, a un esfuerzo suyo, sean los más próximos a los de esa pareja de modelo y esfuerzo. Los puntos son los de Artificial Analysis a cada esfuerzo, no uno por modelo. Un modelo o un esfuerzo sin puntos medidos no se usa. *Por qué:* «mas cercanos o proximos a haiku sonnet y opus. Pero no todos los efforts valen igual». (1, 2)
- **C5. Se gasta primero la cuota de los otros harness.** Cuando un harness externo tiene cuota disponible, el trabajo va ahí antes que a la cuota de Claude Code; entre los modelos cercanos manda la cuota (la más ociosa o a punto de reiniciarse, como rige hoy) y la velocidad y el precio desempatan. *Por qué:* «agotar las cuotas que la principal de claude code». (2, 3)
- **C6. Siempre con fallback hacia nativo.** Un harness no instalado, sin cuota o que falla pasa la llamada al agente nativo sin que el dueño reciba nada que contestar. *Por qué:* es regla vigente del dueño. (5)
- **C7. Nadie revisa lo suyo.** Un asiento no lo ocupa el modelo que escribió lo que revisa. *Por qué:* es la regla que ya rige en los asientos y no se pierde al quitar los perfiles. No es una cita nueva.
- **C8. El dueño ve por qué.** El informe de una corrida dice, por llamada, quién la tomó y por qué, y qué parte del trabajo salió de Claude, para poder comprobar que la cuota externa se gasta primero. *Por qué:* «Asi se promueve que se gasten primero la cutoa de los harness externos». (3)
- **C9. Lo que el dueño lee dice lo mismo.** La opción nueva está en las opciones, el README, la guía y la web; las opciones y los valores que sustituye dejan de confundir, y lo que el dueño ya configuró no se rompe en silencio. *Por qué:* lo que lo confunde hoy es cómo está presentado. (1)

## 4. Fuera de alcance

- **El router de delegados** y los delegados del Lead que editan (issue 028): quedan como están (4).
- **El Lead.** Sigue en Claude.
- **Terminal-bench** como segunda medida (2).
- **Muse Code**: lo trabaja la otra sesión. Cuando llegue a `main`, sus modelos entrarán por esta misma regla de medición, sin cambio aquí.
- **La opción `harnesses`** (qué CLI puede correr sin pedir confirmaciones): sigue siendo decisión del dueño, aparte del interruptor.
- **Las propuestas 5 y 6 del issue 031** (la velocidad como tope y una meta de cuota en `aether-report`) más allá de lo que piden C5 y C8.
- **El issue 032** (la ventana del workflow).
- Publicar: el merge a `main`, el push, el tag y `claude plugin update`.

## 5. Respuestas a las preguntas aclaratorias

El Lead no hizo preguntas al dueño: lo que el código responde lo leyó, y lo demás es un supuesto.

| # | Pregunta | Respuesta | Origen |
|---|---|---|---|
| 1 | ¿Qué es «cercano»? | **Supuesto:** cercano por los dos lados, dentro de una tolerancia que vive en la tabla de lanes y que el diseño fija; un modelo muy por debajo no se usa (calidad) y uno muy por encima tampoco (gasta cuota y tiempo en una tarea chica). Si nadie está dentro, la llamada es nativa. Reversible. | Supuesto del Lead (veto probable: medio) |
| 2 | ¿Qué pasa con `max`? | **Supuesto:** deja de ser nativo por regla (A21) y pasa por la misma comparación de puntos: sale a un externo solo si alguno llega a los puntos de `max` de Claude (hoy ninguno; el más próximo es Argon con 52.6 contra 56). Reversible. | Supuesto del Lead |
| 3 | ¿Qué pasa con `lanes` y `seats` ya configurados? | **Supuesto:** si `superdelegation` no está puesto, un `lanes` encendido cuenta como encendido y `seats` se ignora; el valor nuevo manda cuando existe. Los dos salen de las opciones que se documentan. Reversible. | Supuesto del Lead (veto probable: bajo) |
| 4 | ¿Los puntos de dónde salen? | **Hallazgo:** el índice de modelos (`config/models/models.json`) ya trae los puntos de inteligencia por esfuerzo, y la tabla de lanes guarda otra copia de un solo esfuerzo que ningún código usa. Hay una sola fuente. | Medido en el código |
| 5 | ¿Argon, Flash y Grok entran como implementadores? | **Hallazgo de las cifras:** Argon (52.6) cae entre Sonnet xhigh (51.9) y Opus high (53.6); Grok 4.7 high (46.3) casi iguala a Sonnet high (46.8) y rinde menos en terminal-bench, que el dueño decidió no usar. Con C4 entran por sus puntos; el supervisor y el fallback acotan el riesgo. | Medido en el índice; decisión del dueño (2) |
