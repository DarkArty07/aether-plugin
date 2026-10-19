# Tarjeta de intención: superdelegación

- **Dueño:** Christopher
- **Fecha:** 2026-10-19 (segunda versión, el mismo día: la primera trataba la velocidad y el costo como desempate y el dueño lo corrigió con RADAR)
- **Issue de origen:** [031](../../docs/issues/031-almost-no-work-leaves-claude-because-the-lane-table-and-the-seat-profiles-give-other-harnesses-no-permission.md). El dueño dijo «issue 032» al abrir la sesión, pero describió lo del 031; el 032 (la ventana del workflow que muestra Haiku con 0 tokens) es otro y queda fuera.
- **Confirmada por el dueño:** la meta (un interruptor, solo inteligencia, gastar primero la cuota de los otros harness) con su segundo mensaje. **Falta su sí** a C4, C5 y C6 de esta versión, que bajan RADAR a reglas. No abre una corrida autónoma: se diseña y se detiene en el plan con el resumen corto.
- **Otra sesión** trabaja Muse Code como harness (`specs/008-muse-harness`, rama `feat/muse-harness`). Esta tarjeta es la 009 para no chocar con la 008.

## 1. Las palabras del dueño

1. «en esta sesion vamos a trbajaar el issue 032. COnsidero muy confuso de lo native balanced y robust. Tengo una propuesta que va a ser mas facil de entender. Una config de superdelegacion. superdelegacion = true false. Si esta activo todo lo que no sea agente lead ira a otros harness. si esta desacticada todo cae a claude code nativo. Obviamente esocvjemos los modelos para cada tarea como emos hecho. Escogiendo velocidad, costo y capacidad. Considerando los efforts eso define que modelo hace que cosa. [...] ya sabes que estamos considerando artificial analysys para los puntos de intlegiecnia»
2. «se que inteleigencia y temrianl bench es distitno paero para no sobrecomplicar nosotros solo usaremos la de intelgiencia, la idea es usar los modelos de los ahrness adecuados y mas cercanos o proximos a haiku sonnet y opus. Pero no todos los los efforts valen igual. La idea es que si ya estan las cuotas de los otros harness el trabajo de redirgija ahi el trafico para poder agotar las cuotas que la picnipal de claude code»
3. «pero estas considerando costo y velocidad?» y, a la respuesta del Lead: «investiga bien el plugin fijate que es loq ue busca con radar».
4. RADAR, dicho por el dueño el 2026-10-10 (`docs/roadmap/2026-10-10-radar.md` §0): «barato por eso se busca optimizar agentes modelos y efforts, rápido porque para eso se buscan modelos rápidos que hagan el granel y que el sistema no itere infinitamente sin parar»; y «La quinta meta era superdelegacion. Delegar trabajo a otros harness».
5. Dicho antes por el dueño, el 2026-10-19 en la sesión de Muse (issue 031): «yo lo que quiero es una plitica de superdelagcion total no se si hay que meter configs o politicas, o que acciones podamos tomar, la diea es que los harness externos ocupen todas las tareas que no sean lead. Asi se promueve que se gasten primero la cutoa de los harness externos».
6. Dicho antes por el dueño sobre el router: «lo del router si esta bien ese no hay que moverlo».
7. Dicho antes por el dueño y registrado en el arranque del Lead: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño».

## 2. Lo que el dueño confirmó

Hoy, para decidir qué trabajo sale de Claude, el dueño tiene tres perfiles de asientos (`native`, `balanced`, `robust`) y un interruptor de lanes aparte, y no entiende qué hace cada uno (1). Quiere **un solo interruptor, `superdelegation`, sí o no**:

- **Apagado:** todo lo que no es el Lead cae a Claude Code nativo.
- **Encendido:** todo lo que no es el Lead va a otros harness, para gastar primero la cuota de los otros harness y no la de Claude Code (2, 5).
- **Qué modelo hace qué** lo define la inteligencia de Artificial Analysis, con cada esfuerzo valiendo lo suyo: a cada tarea le toca un modelo externo cercano al Haiku, Sonnet u Opus que le tocaría (1, 2). Solo inteligencia, no terminal-bench (2).
- **Velocidad y costo no son un desempate: son dos de las cinco metas de RADAR (3, 4).** Cada rol corre en el modelo y el esfuerzo más baratos que lo hacen bien (`docs/purpose.md`), y los modelos rápidos hacen el grueso. La capacidad pone el piso; sobre ese piso se busca lo más barato y lo más rápido, y entre los harness externos manda la cuota.

## 3. Criterios

Cada criterio dice qué y por qué, y se ata a una cita de la sección 1.

- **C1. Un solo interruptor.** El dueño elige `superdelegation` encendido o apagado, y eso reemplaza a elegir entre `native`, `balanced` y `robust`. *Por qué:* hoy no lo entiende. (1)
- **C2. Apagado, todo es Claude nativo.** Ninguna llamada de un agente que no sea el Lead sale a otro harness, ni en el swarm ni en el diseño. *Por qué:* es lo que él describe para el estado apagado. (1)
- **C3. Encendido, todo lo que no es el Lead sale.** Cada llamada del swarm (implementador, supervisor, revisión final) y cada ronda del diseño (borradores y correcciones del Writer, el Judge, el Examiner) va a un harness externo siempre que haya uno disponible que cumpla C4; el agente nativo solo toma la que ninguno puede. *Por qué:* «todas las tareas que no sean lead». (1, 5)
- **C4. La inteligencia pone el piso, y el esfuerzo cuenta.** Cada llamada tiene un modelo de Claude (Haiku, Sonnet u Opus) a un esfuerzo, y esa pareja vale unos puntos de inteligencia de Artificial Analysis. Un modelo externo solo puede tomarla si, a algún esfuerzo suyo, llega a ese valor; nunca por debajo. Un modelo o un esfuerzo sin puntos medidos no se usa. *Por qué:* «mas cercanos o proximos a haiku sonnet y opus. Pero no todos los los efforts valen igual». (1, 2)
- **C5. Sobre el piso, lo más barato y lo más rápido.** Entre los modelos que llegan al piso, no se gasta más fuerza de la necesaria: va primero el más cercano al valor de la llamada, y dentro de él el esfuerzo más bajo que alcanza y el más barato a precio de lista. Un modelo mucho más lento que el de Claude no toma las tareas que otras esperan, sí las que no bloquean a nadie. *Por qué:* «barato por eso se busca optimizar agentes modelos y efforts, rápido porque para eso se buscan modelos rápidos que hagan el granel». (1, 3, 4)
- **C6. Se gasta primero la cuota de los otros harness.** Cuando un harness externo tiene cuota disponible, el trabajo va ahí antes que a la cuota de Claude Code; entre varios externos que cumplen C4 y C5, va primero el de la cuota más ociosa o a punto de reiniciarse, como rige hoy. *Por qué:* «agotar las cuotas que la picnipal de claude code». (2, 5)
- **C7. Siempre con fallback hacia nativo.** Un harness no instalado, sin cuota o que falla pasa la llamada al agente nativo sin que el dueño reciba nada que contestar. *Por qué:* es regla vigente del dueño. (7)
- **C8. Nadie revisa lo suyo.** Un asiento no lo ocupa el modelo que escribió lo que revisa. *Por qué:* es la regla que ya rige en los asientos y no se pierde al quitar los perfiles. No es una cita nueva.
- **C9. El dueño ve por qué y cuánto movió.** El informe de una corrida dice, por llamada, quién la tomó y por qué, y muestra las cifras de RADAR que esto mueve: la parte del trabajo que salió de Claude, los dólares a precio de lista y el tiempo. *Por qué:* «Asi se promueve que se gasten primero la cutoa de los harness externos». (4, 5)
- **C10. Lo que el dueño lee dice lo mismo.** La opción nueva está en las opciones, el README, la guía y la web; las opciones y los valores que sustituye dejan de confundir, y lo que el dueño ya configuró no se rompe en silencio. *Por qué:* lo que lo confunde hoy es cómo está presentado. (1)

## 4. Fuera de alcance

- **El router de delegados** y los delegados del Lead que editan (issue 028): quedan como están (6).
- **El Lead.** Sigue en Claude.
- **Terminal-bench** como segunda medida (2).
- **Muse Code**: lo trabaja la otra sesión. Cuando llegue a `main`, sus modelos entrarán por esta misma regla de medición, sin cambio aquí.
- **La opción `harnesses`** (qué CLI puede correr sin pedir confirmaciones): sigue siendo decisión del dueño, aparte del interruptor.
- **Una meta de cuota con aviso en `aether-report`** (propuesta 6 del issue 031) más allá de las cifras de C9.
- **El issue 032** (la ventana del workflow).
- Publicar: el merge a `main`, el push, el tag y `claude plugin update`.

## 5. Respuestas a las preguntas aclaratorias

El Lead no hizo preguntas al dueño: lo que el código responde lo leyó, y lo demás es un supuesto.

| # | Pregunta | Respuesta | Origen |
|---|---|---|---|
| 1 | ¿Qué es «cercano»? | **Hallazgo y supuesto:** el router ya resuelve esto con niveles A a D que salen de los puntos de Artificial Analysis (`config/router/rungs.json`, generado del índice de modelos): toma un nivel igual o mayor al de la llamada, nunca menor, el más cercano primero, y dentro del nivel lo más barato y el esfuerzo más bajo. Se toma esa misma idea para el swarm y los asientos. Reversible. | Medido en el código; supuesto del Lead (veto probable: medio) |
| 2 | ¿Qué pasa con `max`? | **Supuesto:** deja de ser nativo por regla (A21) y pasa por la misma comparación: sale a un externo solo si alguno llega a ese nivel. Hoy ninguno: Sonnet `max`, Opus `xhigh` y Opus `max` están en D y el externo más alto, Argon, en C. Reversible. | Supuesto del Lead |
| 3 | ¿Qué pasa con `lanes` y `seats` ya configurados? | **Supuesto:** si `superdelegation` no está puesto, un `lanes` encendido cuenta como encendido y `seats` se ignora; el valor nuevo manda cuando existe. Los dos salen de las opciones que se documentan. Reversible. | Supuesto del Lead (veto probable: bajo) |
| 4 | ¿De dónde salen los puntos y el equivalente de cada modelo? | **Hallazgo:** hoy el swarm usa una tabla escrita a mano (`replaces` en `config/lanes.json`: qué modelo externo sustituye a Haiku, Sonnet u Opus) y los puntos de ahí no los lee ningún código. El router, en cambio, ya tiene su tabla de niveles generada del índice (`config/models/models.json`, con puntos por esfuerzo). Hay una sola fuente que debe quedar. | Medido en el código |
| 5 | ¿Cómo se mide «barato» si la cuota de un plan no son dólares? | **Supuesto:** con el precio de lista por token del índice, que es lo que `aether-report` ya usa para la meta Asequible, como medida de cuota gastada por trabajo. Dentro de un mismo plan no importa el precio si la cuota se va a perder al reiniciarse: por eso manda primero la cuota (C6). Reversible. | Supuesto del Lead |
| 6 | ¿Cómo se mide «rápido»? | **Supuesto:** con los tokens por segundo y el primer token de Artificial Analysis cuando existen, y con los tiempos de las llamadas del registro de lanes cuando no (Argon no tiene medida y sus rondas tardaron de 7 a 12 minutos). Sin ninguna, no hay tope. El esfuerzo más bajo que alcance el piso ya es la palanca principal de velocidad. Reversible. | Hallazgo en el índice; supuesto del Lead |
| 7 | ¿Hay dos reglas de cuota? | **Hallazgo:** sí. El swarm ordena por saldo entre las horas que faltan al reinicio; el router toma el grupo cuya ventana semanal se reinicia antes (R21). Se mantiene la del swarm (C6, «como rige hoy») y el router no se toca (6). | Medido en el código |
| 8 | ¿Argon, Flash y Grok entran como implementadores? | **Hallazgo de las cifras:** Argon (52.6) cae en el nivel C, el de Sonnet `high` y `xhigh` y el de Opus `medium` y `high`; Grok 4.7 `high` (46.3) también está en C por inteligencia y rinde menos en terminal-bench, que el dueño decidió no usar. Con C4 entran por su nivel; el supervisor y el fallback acotan el riesgo. | Medido en el índice; decisión del dueño (2) |
