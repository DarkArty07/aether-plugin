# Superdelegación: un interruptor que manda todo lo que no es el Lead a otros harness

- **Date:** 2026-10-19
- **Status:** Draft
- **Intent:** [intent.md](intent.md), tercera versión, confirmada por el dueño el 2026-10-19. Cifras de Artificial Analysis: [evidence/README.md](evidence/README.md).

## Criteria

Cada criterio cita las palabras del dueño (los números son los de la sección 1 de la tarjeta) y nombra la evidencia que lo prueba.

- C1. **Un solo interruptor, apagado por defecto.** El dueño elige `superdelegation` encendido o apagado, y eso reemplaza a elegir entre `lanes` y los perfiles `native`, `balanced` y `robust`. Lo que el dueño ya configuró no se rompe en silencio. «Considero muy confuso de lo native balanced y robust. Tengo una propuesta que va a ser mas facil de entender. Una config de superdelegacion. superdelegacion = true false.» «apagado por defecto lo de las lanes esta bien.» Evidencia: una prueba lee las opciones sin configurar y ve `superdelegation` apagado; una prueba con `lanes` o `seats` ya puestos y sin `superdelegation` ve que el valor viejo se respeta; `lanes`, `seats` y los tres perfiles ya no figuran como opciones elegibles.
- C2. **Apagado, todo es Claude nativo.** Ninguna llamada de un agente que no sea el Lead sale a otro harness, ni en el swarm ni en el diseño. «si esta desacticada todo cae a claude code nativo.» Evidencia: pruebas del swarm y del diseño con el interruptor apagado y todas las cuotas sanas: no hay ninguna llamada a un harness externo.
- C3. **Encendido, todo lo que no es el Lead sale primero.** Cada llamada del swarm (implementador, supervisor, revisión final) y cada ronda del diseño (borradores y correcciones del Writer, el Judge, el Examiner) va a un harness externo siempre que haya un par que cumpla C4 y C5; el agente nativo solo toma la que ninguno puede. «Si esta activo todo lo que no sea agente lead ira a otros harness.» «que si esta activado prefiera usar defitinivamente los harness externos para cabar las cuotas y dejar claude code nativo como fallback.» «la idea es que los harness externos ocupen todas las tareas que no sean lead.» Evidencia: pruebas del swarm y del diseño con el interruptor encendido y cuotas sanas: cada rol sale a un par externo cuando existe uno que llega, y solo corre nativo la llamada sin candidato.
- C4. **Cada llamada pide los puntos de su par de referencia.** El par de referencia es el par de Claude (modelo y effort) que hoy le toca: en el swarm, el que el plan da a la tarea (o el del intento, en un reintento); en el diseño, el del agente nativo de cada asiento. La inteligencia de Artificial Analysis de ese par es lo que la llamada pide; nunca el nombre del modelo solo. «Considerando los efforts eso define que modelo hace que cosa.» «no todos los efforts valen igual.» «vamos a usar haiku sonnet y opus como referencia pero en base a que.» Evidencia: una prueba por rol comprueba los puntos pedidos (por ejemplo, Sonnet `xhigh` pide 51.9 y Sonnet `high` pide 46.8).
- C5. **Candidato es cualquier par externo que llega.** Un par externo (un modelo a un effort de su harness) puede tomar la llamada si su inteligencia llega a la pedida menos 1 punto. Un par sin inteligencia o sin costo por tarea medido no entra. Dentro de una misma cuota, un par que no da más puntos que otro y cuesta más por tarea nunca se usa. «otros harness pueden ofrecer modelos mas capaces pero hayq ue considerar costos.» «si apruiebo la tolerancia.» «Obviamente escogemos los modelos para cada tarea [...] escogiendo velocidad, costo y capacidad.» Evidencia: pruebas con una tabla de pares fija: el que llega por 1 punto entra y el que queda a más de 1 no; Gemini 3.8 Flash `low`, sin costo por tarea, no entra; Grok `xhigh` (46.4, US$ 3.74) nunca gana a Grok `high` (46.3, US$ 2.73) dentro de su cuota.
- C6. **Cuota y costo deciden el orden.** Entre los candidatos va primero el de la cuota cuya ventana se renueva antes; dentro de esa cuota, el más barato por tarea. Un harness compite solo por las llamadas que sus pares alcanzan. «agotar primero las ventanas que se van a renovar a mas proximidad, pero no todos los ahrness valen por giaul por ejemplo grok no tiene modelos a nivel argon, como resolvemos esto?» «La cuota y el costo.» Evidencia: pruebas con dos cuotas de ventanas distintas: va primero la que se renueva antes; con una llamada de nivel Sonnet `xhigh` u Opus, Grok (máximo 46.4) no recibe nada aunque su cuota se renueve antes.
- C7. **La velocidad no decide.** Ningún par se elige ni se descarta por rápido o lento; el informe muestra cuánto tardó cada llamada. «si es una contradiccion esta bien dejar fuera lo de la velocidad.» Evidencia: una prueba cambia las velocidades de la tabla y la elección no cambia; el informe de una corrida trae el tiempo de cada llamada.
- C8. **Ningún effort se rebaja en silencio.** Un par externo corre al effort de su par, y una llamada nunca toma un effort con menos puntos que los que pide sin que la regla lo haya decidido. «no todos los efforts valen por igual, entocnes que effort de claude decidimos usar?» Evidencia: una prueba donde Sonnet `xhigh` (51.9) cae a Claude dentro de agy comprueba que corre a `xhigh` o que no es candidato, nunca a `high` (46.8) sin que la regla lo diga.
- C9. **Un reintento sigue la misma regla.** El intento que sigue a un fallo pide los puntos de su propio par de referencia y no corre en el mismo par que acaba de fallar; al acabarse la escalera, corre nativo. «reitnentos esta biem.» Evidencia: pruebas con un par que falla: el reintento cambia de par, pide los puntos de su escalón, y tras el último escalón corre nativo.
- C10. **Un cupo externo lleno no manda la llamada a Claude.** Una llamada que encuentra lleno el cupo de llamadas a la vez de un harness espera a que se libere, con un límite de espera; el cupo de cada harness se mide de verdad. «Si debemos de medir el cupo real no creo que haya cupo eh normalemnte no lo hay.» Evidencia: una prueba con cupo lleno ve la espera y la llamada que sale al liberarse, y otra ve el límite agotado; la corrida real de C15 deja el cupo medido de cada harness.
- C11. **Siempre con fallback hacia nativo.** Sin candidato, sin cuota, con el límite de espera agotado o con un fallo, la llamada corre en el agente nativo, en su par de referencia, sin que el dueño reciba nada que contestar. «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño.» Evidencia: pruebas de cada una de las cuatro causas: la llamada corre nativa, en su par de referencia, y ningún paso pide respuesta al dueño.
- C12. **Nadie revisa lo suyo.** Un supervisor, un Judge o un revisor no es el mismo modelo que hizo lo que revisa. Es la regla vigente de los asientos; no se pierde al quitar los perfiles y se extiende al swarm. Evidencia: pruebas con el interruptor encendido y apagado: el modelo que revisa difiere del que escribió, también cuando un solo harness sería el más barato.
- C13. **El dueño ve por qué.** El informe dice, por llamada, su par de referencia, el par que la tomó y por qué, y cuánto tardó; y las cifras de RADAR: la parte del trabajo que salió de Claude, la cuota usada por harness y los dólares a precio de lista. «barato por eso se busca optimizar agentes modelos y efforts.» «La quinta meta era superdelegacion. Delegar trabajo a otros harness.» Evidencia: una prueba de `aether-report` sobre una corrida con llamadas externas y nativas ve las tres cifras y las líneas por llamada.
- C14. **Queda formalizado de una vez.** La política vive en una regla escrita y en un solo mecanismo que usan el swarm y el diseño, sostenidos por pruebas. Desaparece lo que hoy la reparte: la tabla de equivalencias escrita a mano, los tres perfiles de asientos, la regla fija de `max`, las correcciones del Writer nativas por regla y la segunda regla de cuota del swarm. Las opciones, el README, la guía y la web dicen lo mismo. «Es importnate consolidar esto porque varias veces lo he expolciado anteriormente y sseguimos sin poder lograrlo de manera definitvia.» Evidencia: una sola función de elección usada por el swarm y por el diseño, con sus pruebas; una búsqueda en el árbol no halla lo que desaparece; las pruebas de documentos (`tests/docs-facts.test.js` y `tests/site.test.js`) pasan con el texto nuevo.
- C15. **Se prueba de verdad.** Antes de cerrar hay una prueba que no gasta cuota (todas las cuotas sanas: el trabajo de nivel Sonnet sale de Claude; una cuota seca: cae a nativo) y una corrida real corta hecha por el Lead, que mide el cupo real de cada harness y la parte delegada. La corrida real necesita el permiso `paid-call` del dueño. «debemos de medir el cupo real.» Evidencia: la prueba sin cuota pasa en `npm test`; el informe de la corrida real muestra el cupo medido por harness y la parte delegada.

## User scenarios

- **E1. Apagado por defecto.** Dado un dueño que instala Aether sin configurar nada, cuando corre un swarm, entonces todo agente que no es el Lead corre en Claude nativo y no se llama a ningún harness externo.
- **E2. Encendido, un implementador de nivel Haiku.** Dado `superdelegation` encendido, cuotas sanas y una tarea Haiku `high` (37.8), cuando corre el implementador, entonces toma el par externo más barato por tarea, de la cuota que se renueva antes, cuya inteligencia llega a 36.8 o más.
- **E3. Encendido, una tarea de nivel Sonnet `xhigh`.** Dado `superdelegation` encendido y una tarea Sonnet `xhigh` (51.9), cuando el único harness que queda sano es Grok (máximo 46.4), entonces la llamada corre nativa, en Sonnet `xhigh`, sin preguntar al dueño.
- **E4. Cuota que se renueva antes.** Dado dos harness con candidatos para la misma llamada, cuando la ventana semanal de uno se renueva antes, entonces la llamada va a ese, al par más barato por tarea de su cuota, aunque el otro tenga un par más barato.
- **E5. Cupo lleno.** Dado el cupo de llamadas a la vez de un harness lleno, cuando llega una llamada que ese harness podría tomar, entonces espera a que se libere; si el límite de espera se agota, corre nativa.
- **E6. Reintento.** Dado un implementador cuyo par externo falló, cuando corre el intento siguiente, entonces pide los puntos de su propio par de referencia, no corre en el par que falló y, agotada la escalera, corre nativo.
- **E7. Nadie revisa lo suyo.** Dado un Judge que revisa un borrador del Writer, cuando el par más barato es el mismo modelo que escribió, entonces el Judge corre en otro modelo.
- **E8. Configuración previa.** Dado un dueño con `lanes` encendido y sin `superdelegation` puesto, cuando arranca una corrida, entonces cuenta como encendido y `seats` se ignora; si luego pone `superdelegation`, ese valor manda.
- **E9. El informe.** Dado una corrida terminada con llamadas externas y nativas, cuando el dueño lee el informe, entonces ve por llamada el par de referencia, el par que la tomó, el motivo y el tiempo, y la parte del trabajo que salió de Claude, la cuota usada por harness y los dólares a precio de lista.

## Requirements

- R1. Existe una opción `superdelegation`, booleana, apagada por defecto, y es la única que decide si lo que no es el Lead sale a otros harness. Sirve a: C1, C2, C3
- R2. Si `superdelegation` no está puesta, un `lanes` encendido cuenta como encendido y `seats` se ignora; si está puesta, su valor manda. Sirve a: C1
- R3. `lanes`, `seats` y los perfiles `native`, `balanced` y `robust` dejan de ser opciones que el dueño elige. Sirve a: C1, C14
- R4. Con `superdelegation` apagada, ninguna llamada de un agente que no sea el Lead, en el swarm o en el diseño, sale a otro harness. Sirve a: C2
- R5. Con `superdelegation` encendida, cada llamada del swarm (implementador, supervisor, revisión final) y cada ronda del diseño (borradores y correcciones del Writer, Judge, Examiner) pasa por la misma regla de elección antes de correr; el Lead no pasa por ella. Sirve a: C3, C14
- R6. Cada llamada tiene un par de referencia de Claude (modelo y effort): en el swarm, el que da el plan a la tarea o el del intento en un reintento (para el supervisor, el effort de la línea Review de la tarea, `high` si no la trae; para la revisión final, el que fija el riesgo de la corrida); en el diseño, el del agente nativo de cada asiento. Sirve a: C4
- R7. Los puntos que pide una llamada son la inteligencia de Artificial Analysis de su par de referencia, leída de una tabla de datos única de pares (modelo y effort) con inteligencia y costo por tarea. Sirve a: C4, C14
- R8. Un par externo es candidato si su inteligencia es mayor o igual que los puntos pedidos menos 1. Un par sin inteligencia o sin costo por tarea en la tabla no es candidato. Sirve a: C5
- R9. Dentro de una misma cuota, se descarta el par que no da más puntos que otro y cuesta más por tarea. Sirve a: C5
- R10. Entre los candidatos se elige primero el de la cuota cuya ventana semanal se renueva antes y, dentro de esa cuota, el de menor costo por tarea. Un harness solo compite por las llamadas que alguno de sus pares alcanza. Sirve a: C6
- R11. La elección no usa la velocidad ni el primer token de ningún par. Sirve a: C7
- R12. El informe de una corrida muestra el tiempo de cada llamada. Sirve a: C7, C13
- R13. Un par externo corre al effort de su par en la tabla. La regla no traduce un effort a otro menor en silencio; si un harness no admite el effort que un par necesita, ese par no es candidato. Sirve a: C8
- R14. Un reintento aplica la regla con los puntos de su propio par de referencia, excluye el par que acaba de fallar y, agotada la escalera, corre en el agente nativo. Sirve a: C9
- R15. Antes de dar una llamada a un harness, se mide su cupo de llamadas a la vez; si está lleno, la llamada espera a que se libere hasta un límite de espera. Sirve a: C10
- R16. Sin candidato, sin cuota, con el límite de espera agotado o con un fallo del harness, la llamada corre en el agente nativo, en su par de referencia, y ningún paso de la regla pide una respuesta al dueño. Sirve a: C11
- R17. La regla garantiza que el modelo que revisa (supervisor, Judge, revisor de la revisión final) no es el modelo que hizo lo que revisa, en el swarm y en el diseño, con la opción encendida o apagada. Sirve a: C12
- R18. El informe dice, por llamada, el par de referencia, el par que la tomó y el motivo; y resume la parte del trabajo que salió de Claude, la cuota usada por harness y los dólares a precio de lista. Sirve a: C13
- R19. La política es una regla escrita en un documento y un solo mecanismo en el código; el swarm y el diseño lo llaman y ninguno tiene su propia regla. Sirve a: C14
- R20. Desaparecen del árbol la tabla de equivalencias escrita a mano, los tres perfiles de asientos, la regla fija de `max`, la regla que deja nativas las correcciones del Writer y la segunda regla de cuota del swarm. Sirve a: C14
- R21. Las opciones del plugin, el README, la guía de opciones y la web dicen lo mismo que la regla, en español e inglés donde ya existen los dos. Sirve a: C14
- R22. Hay pruebas del mecanismo que no gastan cuota ni tokens: apagado, encendido con cuotas sanas, cuota seca, cupo lleno, límite de espera agotado, reintento y revisión cruzada, además de las pruebas de ambos flujos de trabajo con agentes simulados. Sirve a: C15, C14
- R23. Una corrida real corta con la opción encendida, hecha por el Lead con el permiso `paid-call`, mide el cupo real de cada harness y la parte delegada, y queda en el informe. Sirve a: C15, C10

## Proposals

- Cambiar la guía de efforts con la que el Writer elige el par de cada tarea, para que use el costo por tarea (Opus `high`, 53.6 a US$ 1.82, supera a Sonnet `xhigh`, 51.9 a US$ 2.01; Opus `xhigh` iguala a Sonnet `max` con 56 puntos a US$ 3.46 contra US$ 5.46). No sirve a ningún criterio de esta tarjeta; se confirma antes con corridas de Aether.
- Medir el costo por tarea con `aether-report` (por modelo y effort) en lugar del de Artificial Analysis, cuando haya corridas suficientes.

## Assumptions

Cada uno es reversible: el dueño puede cambiarlo sin rehacer el diseño.

- **Ventana de cuota: la semanal.** La de 5 horas se renueva cada pocas horas y siempre ganaría; solo dice si la cuota puede usarse en ese momento. Es la regla A4 del spec 002 y la que el router ya usa (R21), así Aether queda con una sola regla de cuota. Base: tarjeta, sección 5, punto 3.
- **Claude dentro de agy hereda las cifras del nativo** (mismo modelo; el índice no lo mide aparte). Hoy agy da Sonnet y Opus solo hasta `high`. Base: tarjeta, sección 5, punto 11.
- **`max` pasa por la misma regla.** Hoy ningún externo llega a 56, así que queda nativo por resultado, no por regla. Base: tarjeta, sección 5, punto 12, y A21.
- **Migración de `lanes` y `seats`:** ver R2. Base: tarjeta, sección 5, punto 13.
- **El 1 punto de tolerancia es inclusivo** (llega con pedida menos 1 exacto) y se mide sobre la inteligencia tal como la publica Artificial Analysis, con un decimal. Base: la respuesta del dueño «1 punto».
- **Desempate:** con el mismo costo por tarea dentro de una cuota, gana el par con más puntos y, si siguen empatados, el orden fijo de la tabla. Base: C5 ya descarta lo dominado; solo falta fijar el empate.
- **Una cuota cuya ventana no se puede leer** compite después de las que sí se leen, y una cuota que se sabe seca no compite. Base: spec 002 de cuotas por lane; la tarjeta no la contradice.
- **«Cupo» es el número de llamadas a la vez de un harness, y «cuota» la ventana de uso del plan.** Son dos límites distintos. Base: tarjeta, C10 y C6.
- **El límite de espera por un cupo lo fija el plan con un valor por defecto de minutos, no de horas,** y es una constante del mecanismo que el dueño puede cambiar. Base: el dueño aprobó «con un límite» sin dar la cifra.
- **Las cifras de la tabla de pares son las de `evidence/` del 2026-10-19** (22 pares) y se actualizan cuando el dueño corre el script que ya las refresca. Base: tarjeta, sección 5, punto 9.
- **Los pares de referencia del diseño y del swarm** son los de hoy: Judge y Examiner, Opus `high` (53.6); Writer, Sonnet `high` (46.8); supervisor, Sonnet al effort de la línea Review de la tarea, `high` por defecto; revisión final, Sonnet `high`, Opus `high` u Opus `xhigh` según el riesgo de la corrida; implementador, el par de la línea Tier. Base: tarjeta, sección 5, punto 10.
- **La opción `harnesses` sigue decidiendo qué CLI puede correr sin pedir confirmaciones;** un harness que ese ajuste no permite no es candidato. Base: tarjeta, sección 4.

## Irreversible actions

- **paid-call.** La corrida real de C15 llama a los harness externos con los planes del dueño: `node scripts/lane-smoke.js agy`, `node scripts/lane-smoke.js grok` (una llamada real por harness para medir el cupo) y un `/aether:run` corto con `superdelegation` encendida. Necesita el permiso `paid-call` del dueño, registrado antes con `aether-autonomy`, en una llamada aparte de la que ejecuta la acción. El Lead decide la orden exacta en el plan; esas son las órdenes que la prueba necesita.

Publicar (merge a `main`, push, tag, `claude plugin update`) queda fuera de alcance; no se hace aquí.

## Out of scope

- El router de delegados y los delegados del Lead, incluida la velocidad de un explorador.
- El Lead: sigue en Claude.
- Terminal-bench como segunda medida de inteligencia.
- Muse Code como harness (spec 008, otra sesión). Cuando llegue a `main`, sus pares entran por esta misma regla con sus cifras.
- La opción `harnesses`: sigue siendo decisión del dueño, aparte del interruptor.
- Qué par elige el Writer para cada tarea (la guía de efforts del plan); ver Proposals.
- El issue 032 (la ventana del workflow que muestra Haiku con 0 tokens).
- Publicar: el merge a `main`, el push, el tag y `claude plugin update`.
