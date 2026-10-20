# Tarjeta de intención: superdelegación

- **Dueño:** Christopher
- **Fecha:** 2026-10-19 (tercera versión, el mismo día; la segunda trataba la velocidad como meta, el "cercano" por niveles y la cuota por saldo entre horas, y el dueño la corrigió punto por punto)
- **Issue de origen:** [031](../../docs/issues/031-almost-no-work-leaves-claude-because-the-lane-table-and-the-seat-profiles-give-other-harnesses-no-permission.md). El dueño dijo «issue 032» al abrir la sesión, pero describió lo del 031; el 032 (la ventana del workflow que muestra Haiku con 0 tokens) es otro y queda fuera.
- **Confirmada por el dueño:** el Lead escribió de vuelta la intención y la política; el dueño respondió «lo que disjite esta bien pensado a mi aprcer», decidió los puntos abiertos (sección 5) y preguntó «algo mas que necesites de mi? o ya me entendiste?». Después pidió adaptarla a Muse (14) y dio permiso para implementarla solo y para las pruebas reales (15). Ese permiso llegó mientras el Lead trabajaba y `aether-autonomy start` no lo reconoce (solo lee los mensajes normales del chat), así que la corrida no quedó abierta en el registro: el Lead trabaja con las palabras del dueño y los topes por defecto (8 h, US$ 50).
- **Evidencia:** las cifras de Artificial Analysis por par de modelo y effort, leídas el 2026-10-19: [evidence/README.md](evidence/README.md).
- **Otra sesión** trabaja Muse Code como harness (`specs/008-muse-harness`, rama `feat/muse-harness`). Esta tarjeta es la 009 para no chocar con la 008.

## 1. Las palabras del dueño

1. «en esta sesion vamos a trbajaar el issue 032. COnsidero muy confuso de lo native balanced y robust. Tengo una propuesta que va a ser mas facil de entender. Una config de superdelegacion. superdelegacion = true false. Si esta activo todo lo que no sea agente lead ira a otros harness. si esta desacticada todo cae a claude code nativo. Obviamente esocvjemos los modelos para cada tarea como emos hecho. Escogiendo velocidad, costo y capacidad. Considerando los efforts eso define que modelo hace que cosa. [...] ya sabes que estamos considerando artificial analysys para los puntos de intlegiecnia»
2. «se que inteleigencia y temrianl bench es distitno paero para no sobrecomplicar nosotros solo usaremos la de intelgiencia, la idea es usar los modelos de los ahrness adecuados y mas cercanos o proximos a haiku sonnet y opus. Pero no todos los los efforts valen igual. La idea es que si ya estan las cuotas de los otros harness el trabajo de redirgija ahi el trafico para poder agotar las cuotas que la picnipal de claude code»
3. «pero estas considerando costo y velocidad?» y luego «investiga bien el plugin fijate que es loq ue busca con radar».
4. «tambien tenemos que formalizar mas esa politica osea loq ue quiero es el modelo mas adecuado para una tarea, con el precio adecuado, con la velocidad adecuada y que si esta activado prefiera usar defitinivamente los harness externos para cabar las cuotas y dejar claude code nativo como fallback. otros harness pueden ofrecer modelos mas capaces pero hayq ue considerar costos y velocidad. Por eso tomamos Haiku Sonnet y opus como referencia. Es importnate consolidar esto porque varias veces lo he expolciado anteriormente y sseguimos sin poder lograrlo de manera definitvia»
5. «el tema es que no todos los efforts valen por igual, entocnes que effort de claude decidimos usar? o como podemos conjugarlo con los efforts»
6. «1: La cuota y el costo 2: si apruiebo la tolerancia pero como vamos a deifnir cual modelos es mejor para cada cosa, vamos a usar haiku sonnet y opus como referencia pero en base a que, y como resolvemos lo de que no todos los efforts valen igual.»
7. «Con velocidad no me referia prihibir a los modelos lentos tomar tareas. me referia mas que nada a un explorador debe ser rapido no? pero ahora que lo pienso si es una contradiccion esta bien dejar fuera lo de la velocidad. apagado por defecto lo de las lanes esta bien.»
8. «sobre que cuota se usa primero me gustaria agotar primero las ventanas que se van a renovar a mas proximidad, pero no todos los ahrness valen por giaul por ejemplo grok no tiene modelos a nivel argon, como resolvemos esto?»
9. «1: Si debemos de medir el cupo real no creo que haya cupo eh normalemnte no lo hay 2: reitnentos esta biem 3: van los tres»
10. RADAR, dicho por el dueño el 2026-10-10 (`docs/roadmap/2026-10-10-radar.md` §0): «barato por eso se busca optimizar agentes modelos y efforts»; y «La quinta meta era superdelegacion. Delegar trabajo a otros harness».
11. Dicho antes por el dueño, el 2026-10-19 en la sesión de Muse (issue 031): «la diea es que los harness externos ocupen todas las tareas que no sean lead. Asi se promueve que se gasten primero la cutoa de los harness externos».
12. Dicho antes por el dueño sobre el router: «lo del router si esta bien ese no hay que moverlo».
13. Dicho antes por el dueño y registrado en el arranque del Lead: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño».
14. «le pedi a la otra sesion que lo mande a main lo publicque y lo pase a local entonces ahi va a estar velo revisando y haz las adpataciones necesarias a este nuevo harness»
15. «no estare dispnble trabaja autonomamente impelmetnandolo apruebo purbas reales»
16. Dicho por el dueño en la sesión de Muse sobre `muse-wonder-full-1.0`, tal como lo guarda `config/lanes.json` (`ownerDecision`): «si deja entrar a musewonder full es uno d elos mejores modelos que tiene el harness, ... esta anivel de opus segun yo».

## 2. Lo que el dueño confirmó

La política de superdelegación, tal como el Lead la escribió de vuelta y el dueño la aprobó:

1. **Un solo interruptor, `superdelegation`, apagado por defecto.** Reemplaza a `lanes`, a `seats` y a sus tres perfiles (`native`, `balanced`, `robust`).
2. **Apagado:** todo lo que no es el Lead corre en Claude nativo.
3. **Encendido:** todo lo que no es el Lead va primero a harness externos para agotar sus cuotas: implementadores, supervisores, revisión final, el Writer (borradores y correcciones), el Judge y el Examiner. Claude nativo es solo el respaldo, y entra sin preguntar al dueño.
4. **Qué necesita cada llamada:** los puntos de inteligencia de Artificial Analysis del par de Claude (modelo y effort) que hoy le toca. Nunca el nombre del modelo solo: Sonnet vale de 35.9 a 56 según el effort, y cruza los rangos de Haiku y de Opus. Haiku, Sonnet y Opus son la referencia porque el plan se escribe en ellos, están medidos en cada effort y son el respaldo.
5. **Quién la hace:** cualquier par externo (un modelo a un effort) que llegue a esos puntos menos 1. Cada par tiene sus propios puntos, su costo por tarea y su cuota; el effort del externo viene con el par elegido.
6. **El orden, cuota y costo:** primero la cuota cuya ventana se renueva antes; dentro de esa cuota, el par más barato por tarea. Un harness solo compite por las llamadas que sus modelos alcanzan: Grok, que llega a 46.4, nunca recibe una llamada de nivel Sonnet `xhigh` u Opus.
7. **La velocidad no decide.**
8. **Nadie revisa lo suyo.**
9. **Formalizada una vez:** una regla escrita y un solo mecanismo para el swarm y el diseño, con pruebas.

## 3. Criterios

Cada criterio dice qué y por qué, y se ata a una cita de la sección 1.

- **C1. Un solo interruptor, apagado por defecto.** El dueño elige `superdelegation` encendido o apagado, y eso reemplaza a elegir entre `lanes` y los perfiles `native`, `balanced` y `robust`. Viene apagado porque encenderlo acepta CLIs que corren sin pedir permisos y gastan otros planes. Lo que el dueño ya configuró no se rompe en silencio. *Por qué:* hoy no lo entiende. (1, 7)
- **C2. Apagado, todo es Claude nativo.** Ninguna llamada de un agente que no sea el Lead sale a otro harness, ni en el swarm ni en el diseño. (1)
- **C3. Encendido, todo lo que no es el Lead sale primero.** Cada llamada del swarm (implementador, supervisor, revisión final) y cada ronda del diseño (borradores y correcciones del Writer, el Judge, el Examiner) va a un harness externo siempre que haya un par que cumpla C4; el agente nativo solo toma la que ninguno puede. *Por qué:* «prefiera usar defitinivamente los harness externos [...] y dejar claude code nativo como fallback». (1, 4, 11)
- **C4. Cada llamada pide los puntos de su par de referencia.** El par de referencia es el de Claude que hoy le toca: en el swarm, el que el plan da a la tarea (o el del intento, en un reintento); en el diseño, el del agente nativo de cada asiento. Su inteligencia de Artificial Analysis a ese effort es lo que la llamada pide. *Por qué:* «no todos los los efforts valen igual»; «vamos a usar haiku sonnet y opus como referencia pero en base a que». (2, 5, 6)
- **C5. Candidato es cualquier par externo que llega.** Un par externo (un modelo a un effort de su harness) puede tomar la llamada si su inteligencia llega a la pedida menos 1 punto. Un par sin inteligencia o sin costo por tarea medido no entra, salvo que el dueño haya decidido que entra: entonces entra con sus palabras y el valor que se le asigna, y sin costo va último dentro de su cuota (C16). Dentro de una misma cuota, un par que no da más puntos que otro y cuesta más por tarea nunca se usa. *Por qué:* «otros harness pueden ofrecer modelos mas capaces pero hayq ue considerar costos». (4, 6)
- **C6. Cuota y costo deciden el orden.** Entre los candidatos va primero el de la cuota cuya ventana se renueva antes; dentro de esa cuota, el más barato por tarea. Un harness compite solo por las llamadas que sus pares alcanzan. *Por qué:* «agotar primero las ventanas que se van a renovar a mas proximidad, pero no todos los ahrness valen por giaul»; «La cuota y el costo». (6, 8)
- **C7. La velocidad no decide.** Ningún par se elige ni se descarta por rápido o lento; el informe muestra cuánto tardó cada llamada. *Por qué:* «esta bien dejar fuera lo de la velocidad». (7)
- **C8. Ningún effort se rebaja en silencio.** Un par externo corre al effort de su par, y una llamada nunca toma un effort con menos puntos que los que pide sin que la regla lo haya decidido. *Por qué:* «no todos los efforts valen por igual». (5)
- **C9. Un reintento sigue la misma regla.** El intento que sigue a un fallo pide los puntos de su propio par de referencia y no corre en el mismo par que acaba de fallar; al acabarse la escalera, corre nativo. *Por qué:* «reitnentos esta biem». (9)
- **C10. Un cupo externo lleno no manda la llamada a Claude.** Una llamada que encuentra lleno el cupo de llamadas a la vez de un harness espera a que se libere, con un límite de espera; el cupo de cada harness se mide de verdad. *Por qué:* «Si debemos de medir el cupo real no creo que haya cupo eh normalemnte no lo hay». (9)
- **C11. Siempre con fallback hacia nativo.** Sin candidato, sin cuota, con el límite de espera agotado o con un fallo, la llamada corre en el agente nativo, en su par de referencia, sin que el dueño reciba nada que contestar. (13)
- **C12. Nadie revisa lo suyo.** Un supervisor, un Judge o un revisor no es el mismo modelo que hizo lo que revisa. *Por qué:* es la regla vigente de los asientos y no se pierde al quitar los perfiles; se extiende al swarm.
- **C13. El dueño ve por qué.** El informe dice, por llamada, su par de referencia, el par que la tomó y por qué, y cuánto tardó; y las cifras de RADAR: la parte del trabajo que salió de Claude, la cuota usada por harness y los dólares a precio de lista. (11)
- **C14. Queda formalizado de una vez.** La política vive en una regla escrita y en un solo mecanismo que usan el swarm y el diseño, sostenidos por pruebas; desaparece lo que hoy la reparte (la tabla de equivalencias escrita a mano, los tres perfiles de asientos, la regla fija de `max`, las correcciones del Writer nativas por regla y la segunda regla de cuota del swarm). Las opciones, el README, la guía y la web dicen lo mismo. *Por qué:* «varias veces lo he expolciado anteriormente y sseguimos sin poder lograrlo de manera definitvia». (4)
- **C15. Se prueba de verdad.** Antes de cerrar hay una prueba que no gasta cuota (todas las cuotas sanas: el trabajo de nivel Sonnet sale de Claude; una cuota seca: cae a nativo) y una corrida real corta hecha por el Lead, que mide el cupo real de cada harness y la parte delegada. La corrida real la autorizó el dueño: «apruebo purbas reales». *Por qué:* «debemos de medir el cupo real». (9, 15)
- **C16. Muse entra por la misma regla.** Muse Code (0.13.0, A64) es un harness más: su cuota compite como las otras y sus pares se juzgan igual. `muse-wonder-full-1.0`, el único modelo que la CLI de Muse ofrece a la cuenta del dueño, no tiene cifra de Artificial Analysis a un effort que la CLI tome (solo a `max`) ni costo publicado, y entra por la decisión del dueño (16) con el valor que la sección 5 dice. Lo que Muse trajo a `main` (su adaptador, su entrada en la tabla de lanes con `ownerDecision`, sus pruebas y sus páginas) se adapta a la regla sin perder nada de lo que Muse ya hace. *Por qué:* «haz las adpataciones necesarias a este nuevo harness». (14, 16)

## 4. Fuera de alcance

- **El router de delegados** y los delegados del Lead, incluida la velocidad de un explorador: quedan como están (7, 12).
- **El Lead.** Sigue en Claude.
- **Terminal-bench** como segunda medida (2).
- **Muse Code**: lo trabaja la otra sesión. Cuando llegue a `main`, sus pares entran por esta misma regla, con sus cifras de Artificial Analysis.
- **La opción `harnesses`** (qué CLI puede correr sin pedir confirmaciones): sigue siendo decisión del dueño, aparte del interruptor.
- **Qué par elige el Writer para cada tarea** (la guía de efforts del plan). Ver Propuestas.
- **El issue 032** (la ventana del workflow).
- Publicar: el merge a `main`, el push, el tag y `claude plugin update`.

## 5. Respuestas a las preguntas aclaratorias

| # | Pregunta | Respuesta | Origen |
|---|---|---|---|
| 1 | ¿Tolerancia bajo los puntos pedidos? | 1 punto. | El dueño (6) |
| 2 | ¿Manda la cuota o el costo? | Los dos: primero la cuota cuya ventana se renueva antes, y dentro de ella el más barato por tarea. | El dueño (6, 8) |
| 3 | ¿Qué ventana cuenta? | **Supuesto:** la semanal. La de 5 horas se renueva cada pocas horas y siempre ganaría; solo dice si la cuota se puede usar en ese momento. Es la regla A4 del spec 002 y la que el router ya usa (R21): Aether queda con una sola regla de cuota. Reversible. | Supuesto del Lead, sobre decisiones del dueño |
| 4 | ¿La velocidad cuenta? | No decide; el informe la muestra. | El dueño (7) |
| 5 | ¿Encendido o apagado por defecto? | Apagado. | El dueño (7) |
| 6 | ¿Qué pasa con un cupo lleno? | Se espera un cupo, con un límite, y se mide el cupo real. **Hallazgo:** el 4 de agy es lo que se probó que funciona, nunca se probó más; el 2 de Grok no tiene prueba; hoy un cupo lleno manda la llamada a nativo de inmediato (`docs/superpowers/specs/2026-10-08-lanes-design.md`). | El dueño (9); medido en el código |
| 7 | ¿Reintentos? | Misma regla con su par de referencia, nunca en el par que falló; al final, nativo. | El dueño (9) |
| 8 | ¿Un par sin costo por tarea publicado? | No se usa hasta tener el dato (hoy Gemini 3.8 Flash `low`). | El dueño (9) |
| 9 | ¿De dónde salen las cifras? | **Hallazgo:** la API de Artificial Analysis da inteligencia, precio por token, velocidad y primer token, pero no costo, tiempo ni tokens por tarea (revisados sus 706 modelos). La página de cada modelo imprime el costo por tarea y los tokens del índice. Las cifras de los 22 pares que se usan están en `evidence/`. | Medido el 2026-10-19 |
| 10 | ¿Cuáles son los pares de referencia del diseño y del swarm hoy? | **Hallazgo:** Judge y Examiner, Opus `high` (53.6); Writer, Sonnet `high` (46.8) (`lib/seats.js`, `NATIVE`); supervisor, Sonnet al effort de la línea Review de la tarea, `high` por defecto; revisión final, Sonnet `high`, Opus `high` u Opus `xhigh` según el riesgo de la corrida; implementador, el par de la línea Tier de la tarea. | Medido en el código |
| 11 | ¿Claude dentro de agy tiene cifras? | **Supuesto:** hereda las del nativo, porque es el mismo modelo; el índice hoy no lo mide aparte y sin esto quedaría fuera. Hoy agy da Sonnet y Opus solo hasta `high`. | Supuesto del Lead (veto probable: bajo) |
| 12 | ¿Qué pasa con `max`? | Pasa por la misma regla. Hoy ningún externo llega a 56, así que queda nativo por resultado, no por regla (A21). | Supuesto del Lead |
| 13 | ¿Qué pasa con `lanes` y `seats` ya configurados? | **Supuesto:** si `superdelegation` no está puesto, un `lanes` encendido cuenta como encendido y `seats` se ignora; el valor nuevo manda cuando existe. | Supuesto del Lead (veto probable: bajo) |
| 15 | ¿Con qué valor entra `muse-wonder-full-1.0`? | **Supuesto:** el de Opus `high` (53.6), en el par Muse `high`, que es el effort al que la otra sesión lo probó de verdad (su tabla corre el `xhigh` de Aether en `high`). Toma así las llamadas hasta nivel Opus `high`, pero no las de Opus `xhigh` ni `max`: su 55.8 es de `max`, que la CLI no toma. El dueño no contestó cuál valor; dijo «esta anivel de opus segun yo». Reversible. | Supuesto del Lead sobre la decisión del dueño (16) (veto probable: medio) |
| 16 | ¿Qué son «los tres» de «3: van los tres»? | Las tres respuestas de las filas 6, 7 y 8: medir el cupo y esperar un cupo libre, los reintentos, y el par sin costo publicado. | Lectura del Lead, del orden en que se le preguntó (9) |
| 14 | ¿Hoy algún effort se rebaja en silencio? | **Hallazgo:** sí. La tabla de lanes traduce `xhigh` a `high` en agy, así que una tarea Sonnet `xhigh` (51.9) que cae en Claude dentro de agy corre a `high` (46.8). | Medido en `config/lanes.json` |

## 6. Propuestas (no se trabajan aquí)

- **La guía de efforts del plan, por costo por tarea.** Con el costo por tarea de Artificial Analysis, Opus `high` (53.6, US$ 1.82) supera a Sonnet `xhigh` (51.9, US$ 2.01), y Opus `xhigh` a Sonnet `max` con los mismos 56 puntos (US$ 3.46 contra 5.46). Si se confirma con las corridas de Aether (donde manda la lectura de contexto, no la salida), la guía con la que el Writer elige el par de cada tarea debería cambiar.
- **El costo por tarea medido por Aether** (`aether-report`, por modelo y effort) en lugar del de Artificial Analysis, cuando haya corridas suficientes.
