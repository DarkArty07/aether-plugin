# Superdelegación: un solo interruptor para que los otros harness tomen todo lo que no es el Lead

- Date: 2026-10-19
- Status: Draft
- Intent: [intent.md](intent.md), la tarjeta que el dueño confirmó el 2026-10-19 en su segundo mensaje, el que corrige un punto («solo usaremos la de intelgiencia») y repite la meta sin objetar el resto. Viene del [issue 031](../../docs/issues/031-almost-no-work-leaves-claude-because-the-lane-table-and-the-seat-profiles-give-other-harnesses-no-permission.md).

## Criteria

- **C1. Un solo interruptor.** «Una config de superdelegacion. superdelegacion = true false.»; «Considero muy confuso lo native balanced y robust.» Evidencia: `plugin.json` trae la opción `superdelegation` (sí o no) y ninguna otra opción hace falta para decidir qué sale de Claude; una prueba sobre el archivo comprueba que `seats` ya no está entre las opciones, y la guía de opciones lo dice.
- **C2. Apagado, todo es Claude nativo.** «si esta desacticada todo cae a claude code nativo.» Evidencia: pruebas del swarm y del diseño con harness simulados disponibles y `superdelegation` apagado comprueban que ninguna llamada de un agente que no es el Lead sale a otro harness.
- **C3. Encendido, todo lo que no es el Lead sale.** «Si esta activo todo lo que no sea agente lead ira a otros harness»; «la idea es que los harness externos ocupen todas las tareas que no sean lead.» Evidencia: pruebas con harness simulados y cuota disponible comprueban que el implementador, el supervisor, la revisión final y, en el diseño, los borradores y las correcciones del Writer, el Judge y el Examiner salen a un harness externo siempre que alguno cumple C4; solo toma la llamada el agente nativo cuando ninguno puede.
- **C4. La inteligencia decide qué modelo hace qué.** «la idea es usar los modelos de los ahrness adecuados y mas cercanos o proximos a haiku sonnet y opus. Pero no todos los los efforts valen igual»; «ya sabes que estamos considerando artificial analysys para los puntos de intlegiecnia»; «nosotros solo usaremos la de intelgiencia.» Evidencia: pruebas sobre el índice de modelos comprueban que, para cada pareja de modelo de Claude y esfuerzo, la elección toma el modelo externo y el esfuerzo suyo con los puntos de inteligencia más próximos a los de esa pareja, que un modelo o esfuerzo sin puntos medidos no se elige, y que ninguna elección usa terminal-bench.
- **C5. Se gasta primero la cuota de los otros harness.** «si ya estan las cuotas de los otros harness el trabajo de redirgija ahi el trafico para poder agotar las cuotas que la picnipal de claude code»; «Asi se promueve que se gasten primero la cutoa de los harness externos.» Evidencia: pruebas con lecturas de cuota simuladas comprueban que, con un harness externo por encima de su reserva, la llamada va a él antes que a Claude, que entre los modelos cercanos manda el orden de cuota vigente y que la velocidad y el precio solo desempatan.
- **C6. Siempre con fallback hacia nativo.** «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño.» Evidencia: una prueba por cada forma de falla (harness no instalado, no permitido por `harnesses`, sin cuota, que falla o que se cuelga) termina con la llamada corriendo en el agente nativo y sin pregunta al dueño.
- **C7. Nadie revisa lo suyo.** Viene de la regla que ya rige en los asientos y no de una cita nueva del dueño; lo más cercano es «siempre con fallback hacia nosotros», que pide que quitar los perfiles no deje un hueco. Evidencia: pruebas comprueban que ningún asiento de diseño ni revisión del swarm lo ocupa el modelo que escribió lo que revisa, con el Writer y el Judge en familias distintas.
- **C8. El dueño ve por qué.** «Asi se promueve que se gasten primero la cutoa de los harness externos.» Evidencia: una prueba sobre el informe de una corrida con decisiones simuladas comprueba que por cada llamada dice quién la tomó y la razón, incluida la de cada llamada que quedó nativa, y que dice la parte del trabajo que salió de Claude.
- **C9. Lo que el dueño lee dice lo mismo.** «Considero muy confuso lo native balanced y robust.» Evidencia: `tests/docs-facts.test.js` y pruebas del sitio comprueban que `superdelegation` está en la tabla de opciones, el README, la guía y la web (español e inglés), que `seats` y sus tres valores ya no se presentan como opción, y que una configuración previa no cambia en silencio lo que el dueño tenía.

## User scenarios

1. **Apagado.** Dado `superdelegation` apagado, agy y grok instalados, permitidos y con cuota, cuando corre un swarm y una ronda de diseño, entonces todas las llamadas corren en agentes nativos y el informe dice que ninguna salió de Claude porque el interruptor está apagado.
2. **Encendido, el implementador de nivel Sonnet.** Dado `superdelegation` encendido y una tarea con Tier `sonnet` y esfuerzo `high`, cuando hay un modelo externo con cuota cuyos puntos a un esfuerzo suyo son los más próximos a los de Sonnet `high`, entonces el implementador corre en ese modelo y a ese esfuerzo, y el informe dice los puntos de ambos.
3. **Los esfuerzos no valen igual.** Dado un modelo externo con puntos distintos a `medium` y a `high`, cuando se elige para una llamada de Sonnet `high`, entonces se toma el esfuerzo del modelo externo cuyos puntos están más cerca de los de Sonnet `high`, no el esfuerzo que se llama igual.
4. **Sin puntos medidos.** Dado un modelo externo instalado cuyo esfuerzo no tiene puntos de inteligencia medidos, cuando se buscan candidatos, entonces ese modelo y esfuerzo no se usan, y el informe dice «sin medida» si fue el único que habría servido.
5. **Nadie está cerca.** Dado un `max` de Claude (o cualquier pareja) sin modelo externo dentro de la tolerancia, cuando se elige, entonces la llamada es nativa y el informe dice que ninguno llegó a sus puntos.
6. **Manda la cuota.** Dados dos modelos externos igual de cercanos, uno en un grupo de cuota que se renueva antes, cuando se elige, entonces va al de cuota que se renueva antes (como rige hoy); con la misma cuota, desempata la velocidad y después el precio.
7. **El harness falla.** Dado que la elección fue grok y este no arranca o termina por cuota, cuando la llamada falla por infraestructura, entonces corre en el agente nativo, se registra el motivo y el dueño no recibe pregunta alguna.
8. **El Writer en un harness externo.** Dado el Writer en un modelo externo, cuando el diseño elige el Judge y el Examiner, entonces ninguno es ese modelo; si no hay otra familia externa que cumpla C4, esa ronda corre nativa.
9. **La corrección del Writer.** Dado un veredicto del Judge con hallazgos y `superdelegation` encendido, cuando el Writer corrige, entonces la corrección es una ronda más del diseño y puede salir a un harness externo bajo las mismas reglas; con el interruptor apagado sigue nativa.
10. **Lo que no cambia.** Dado `superdelegation` encendido, cuando el Lead delega a un agente que no es de Aether o corre un paso de `ops`, entonces el router decide como hasta hoy y `ops` sigue sin modelo.
11. **Configuración previa.** Dado un dueño con `lanes` encendido, `seats=balanced` y `superdelegation` sin puesto, cuando arranca una sesión, entonces cuenta como encendido, `seats` se ignora y el arranque lo dice; dado `superdelegation` puesto, manda el valor nuevo.
12. **El informe.** Dado el informe de una corrida con llamadas externas y nativas, cuando el dueño lo lee, entonces ve por llamada el modelo, el esfuerzo, quién la tomó y por qué, y el porcentaje de llamadas (y de trabajo) que salió de Claude.

## Requirements

El interruptor:
- R1. Existe la opción de usuario `superdelegation`, de tipo sí o no, y es la única que decide si lo que no es el Lead sale de Claude. La opción `seats` y sus valores `native`, `balanced` y `robust` dejan de ser opción. Sirve a: C1.
- R2. Con `superdelegation` apagado, ninguna llamada de un agente que no es el Lead (implementador, supervisor, revisión final, Writer, Judge, Examiner) sale a otro harness, ni en el swarm ni en el diseño, aunque haya harness instalados, permitidos y con cuota. Sirve a: C2.
- R3. Con `superdelegation` encendido, cada llamada de un agente que no es el Lead (del swarm: implementador, supervisor y revisión final; del diseño: cada borrador y cada corrección del Writer, el Judge y el Examiner) es candidata a un harness externo y sale a él cuando hay uno disponible que cumple R6 a R9; el agente nativo solo la toma cuando ninguno puede. Sirve a: C3.
- R4. Las correcciones del Writer son rondas del diseño como las demás: con el interruptor encendido pueden salir a un harness externo, y con él apagado corren nativas. Sirve a: C3, C2.
- R5. Quedan nativos, con el interruptor encendido, el Lead, los delegados del Lead (que sigue decidiendo el router sin cambios) y los pasos de `ops` (que no usan modelo). Sirve a: C3.
- R6. El interruptor no amplía la opción `harnesses`: un harness que esa opción no permite, o que no está instalado, no está disponible. Sirve a: C6.

Qué modelo hace qué:
- R7. Para cada llamada, con su modelo de Claude y su esfuerzo, el sistema elige el par de modelo externo y esfuerzo suyo cuyos puntos de inteligencia de Artificial Analysis son los más próximos a los de esa pareja de Claude. Sirve a: C4.
- R8. Los puntos son los de cada esfuerzo, no uno por modelo: el mismo nombre de esfuerzo en dos modelos puede tener puntos distintos y se compara por los puntos. Un modelo o un esfuerzo sin puntos medidos no se elige. Sirve a: C4.
- R9. La medida es solo la de inteligencia; terminal-bench no entra en ninguna elección. Sirve a: C4.
- R10. «Cercano» es una tolerancia por los dos lados, guardada en la tabla de lanes y cambiable sin tocar código: un modelo muy por debajo no se usa, uno muy por encima tampoco. Si ningún modelo externo cumple, la llamada es nativa. Sirve a: C4.
- R11. El esfuerzo `max` de Claude deja de ser nativo por regla: pasa por la misma comparación de puntos (R7 a R10) y sale a un harness externo solo si alguno llega a sus puntos. Sirve a: C4.
- R12. Los puntos que usa una elección salen de una sola fuente, el índice de modelos del plugin; la tabla de lanes no guarda otra copia que pueda contradecirlo. Sirve a: C4.
- R13. Los modelos externos nuevos (por ejemplo los de Muse Code cuando lleguen a `main`) entran a la elección solo por sus puntos medidos en el índice, sin cambiar esta regla. Sirve a: C4.

Cuota, fallback y revisión:
- R14. Entre los candidatos que cumplen R7 a R10, manda el orden de cuota que rige hoy (el grupo de cuota por encima de su reserva que se renueva antes); a igual orden, desempata la velocidad del modelo y después su precio. Sirve a: C5.
- R15. Un candidato externo con cuota por encima de su reserva toma la llamada antes que el agente nativo, aunque la cuota de Claude Code esté libre. Sirve a: C5.
- R16. Un harness no instalado, no permitido, sin cuota, que falla o que se cuelga pasa la llamada al agente nativo, con el mismo brief, sin pregunta al dueño y con el motivo registrado. Sirve a: C6.
- R17. Un asiento de diseño o una revisión del swarm no lo ocupa el modelo que escribió lo que revisa; si el único candidato que cumple R7 a R10 es ese modelo, se toma otro candidato o la ronda corre nativa. Sirve a: C7.

El informe:
- R18. El informe de una corrida dice, por llamada, el modelo y el esfuerzo que la tomaron, los puntos de inteligencia comparados y la razón; para una llamada nativa, la razón concreta (interruptor apagado, ninguno dentro de la tolerancia, sin medida, sin cuota, no permitido, falló, regla de no revisar lo propio). Sirve a: C8.
- R19. El informe dice qué parte de las llamadas y del trabajo salió de Claude, para comprobar que la cuota externa se gasta primero. Sirve a: C8, C5.

Lo que el dueño lee y lo que ya configuró:
- R20. `superdelegation` aparece en la tabla de opciones (`plugin.json`), en `docs/guide/options.md`, en el README, en la guía y en la web en español y en inglés, con lo que hace en una frase; `seats` y sus valores dejan de presentarse como opción. Sirve a: C9, C1.
- R21. Sin `superdelegation` puesto, un `lanes` encendido cuenta como encendido y `seats` se ignora; con `superdelegation` puesto manda el valor nuevo. El arranque de la sesión dice qué valor se aplicó y de dónde sale. Sirve a: C9.
- R22. El valor por defecto de `superdelegation` es apagado, como el de `lanes` hoy. Sirve a: C9, C2.

## Proposals

None.

## Assumptions

- **«Cercano» es una tolerancia por los dos lados, en la tabla de lanes.** Base: la tarjeta (pregunta 1) y «mas cercanos o proximos a haiku sonnet y opus». El diseño fija el número; el dueño puede cambiarlo en la tabla sin tocar código. Reversible.
- **`max` pasa por la misma comparación.** Base: tarjeta, pregunta 2. Hoy ningún externo llega a los puntos de `max` de Claude (el más próximo, Argon, 52.6 contra 56), así que en la práctica sigue nativo hasta que alguno llegue. Reversible volviendo a la regla de A21.
- **Configuración previa.** Base: tarjeta, pregunta 3. Sin `superdelegation` puesto, `lanes` encendido cuenta como encendido y `seats` se ignora. Reversible.
- **Apagado por defecto.** Base: `lanes` está apagado hoy porque agy corre con `--dangerously-skip-permissions` y gasta la cuota de otro plan; encenderlo sin que el dueño lo pida sería una sorpresa. El dueño ya lo tiene encendido por su configuración (R21) y puede cambiar el valor por defecto. Reversible.
- **La velocidad y el precio solo desempatan.** Base: «Escogiendo velocidad, costo y capacidad» junto con «agotar las cuotas». La cuota manda, la inteligencia acota y velocidad y precio desempatan, como dice la tarjeta (sección 2). Reversible.
- **Argon, Flash y Grok entran por sus puntos.** Base: tarjeta, pregunta 5. No hay lista fija de quién toma qué; el supervisor y el fallback acotan el riesgo de un implementador no medido contra Claude. Reversible con la tolerancia.
- **`lanes` deja de ser opción presentada** pero su comportamiento previo se conserva solo como lectura de configuración antigua (R21). Base: tarjeta, sección 3 C9 («los valores que sustituye dejan de confundir»). Reversible.

## Irreversible actions

- **paid-call:** una llamada real por harness para comprobar la elección en una sesión real, que el dueño o el Lead con un permiso suyo ejecutan a propósito: `node scripts/lane-smoke.js <harness>` (por ejemplo `agy` y `grok`). Gasta cuota de otro plan. La implementación y sus pruebas no la hacen.

## Out of scope

- El router de delegados y los delegados del Lead que editan (issue 028): quedan como están.
- El Lead: sigue en Claude.
- Terminal-bench como segunda medida.
- Muse Code: lo trabaja otra sesión (`specs/008-muse-harness`); sus modelos entrarán por la regla de medición (R13) sin cambio aquí.
- La opción `harnesses` (qué CLI puede correr sin pedir confirmaciones): sigue siendo decisión del dueño, aparte del interruptor.
- Las propuestas 5 y 6 del issue 031 (la velocidad como tope y una meta de cuota en `aether-report`), más allá de lo que piden R14 y R19.
- El issue 032 (la ventana del workflow que muestra Haiku con 0 tokens).
- Publicar: el merge a `main`, el push, el tag y `claude plugin update`.
