# El router de delegados: un decisor elige con qué corre cada delegado

- Date: 2026-10-15
- Status: Draft
- Intent: [intent.md](intent.md), la tarjeta que el dueño confirmó el 2026-10-15 con «aja, es muy improtnate que en abse a las ventanas semanalaes mas proximas a renovarse use los mdoelos adecuados de ese ahrness ya comeinza a diseñar esto, a ver si se puede hacer como queremos o vamos a tener que hacer ajustes». Lo medido en la sesión está en [evidence/README.md](evidence/README.md); no es parte de los criterios.

## Criteria

- **C1. Un decisor elige con qué corre cada delegado.** «estoy viendo en una sesion de aether-lead de easclepio ecgia que el el lead decidio desplegar algunos subagentes en opus y en sonnet pero nunca se le ocurrio hacerlo en haiku»; «que decida que modelos usa el sistema en cada rol, posición o tarea.» Evidencia: pruebas con tareas de ejemplo comprueban que cada delegación recibe un peldaño (harness, modelo y esfuerzo) que sale de lo que la tarea pide; el replay sobre el historial real (C11) muestra la decisión frente a lo que decidió el Lead.
- **C2. Sabe rutear porque se le da el criterio.** «como hacemos que el hook con haiku low o jev. SEPA COMO ROUTEAR?» Evidencia: el criterio (preguntas, cómo las respuestas se vuelven un peldaño y cuánto se confía en ellas) está en un archivo que el dueño puede leer; una prueba de regresión con briefs reales y sus hechos esperados falla cuando se cambia el criterio y la decisión se mueve.
- **C3. El Lead solo describe la tarea.** «esto serviria para quitarle el peso al lead tener que escoger que modleo apra que cosa no? que es lo unico que el lead tendria que hacer?» Evidencia: una delegación sin `model` ni `effort` sale con un peldaño decidido; una con anulación y motivo conserva lo que el Lead pidió y el motivo queda registrado.
- **C4. Solo los delegados del Lead.** «esto solo aplicaria a la delegacion de subagentes verdad, para el swarm no aplica porque el swarm ya tiene definido que usa no?» Evidencia: pruebas muestran que el swarm, los asientos de diseño y los agentes `aether:*` corren con el mismo modelo y esfuerzo con el router activo que sin él.
- **C5. Dos decisores intercambiables.** «por el momento vamos a manejar dos proveedores el estadnar haiku low y jev de openrouter»; «jev haria un dependencia de api extenr que lo que claude ya ofrece [...] Con posibilidad de exteneder a jev y meter una api.» Evidencia: la misma prueba pasa con un decisor Haiku bajo y con un decisor Jev simulado; con la opción en su valor por defecto no sale ninguna petición fuera de Claude; un tercer decisor simulado se añade sin tocar la política.
- **C6. Los niveles son capacidad medida.** «Necesito que revises los modelos disponibles y a que me refiero con nivel haiku sonnet y opus, en sus distintos efforts.» Evidencia: una prueba sobre los archivos del repositorio comprueba que cada peldaño de la tabla tiene su nivel derivado de las medidas de Artificial Analysis del índice de modelos, y que un modelo de agy o grok se ubica donde mide.
- **C7. El esfuerzo también se decide.** «y el router tambien debe de manejar los efforts porque no todos los efforts valen igual no?» Evidencia: la decisión de toda delegación trae esfuerzo explícito; una prueba muestra que el mismo nombre de esfuerzo en dos modelos distintos resuelve a niveles distintos.
- **C8. Los delegados corren también en otros harness.** «necesito tambien otra cosa que los agentes de delegate se apliquen tmabiena otros harness [...] Agy que modelos nos da y Grok que modelos nos da». Evidencia: un delegado de solo lectura corre en agy y otro en grok con harness simulados y vuelve su resultado al Lead; una llamada real por harness queda para el dueño (Irreversible actions).
- **C9. Manda la ventana semanal que se renueva antes.** «tambien tenemos que aplicar la poltiica de se gasta primero elque la ventana de cuota se renueve mas proximamente. por el momento solo agy y grok»; «es muy improtnate que en abse a las ventanas semanalaes mas proximas a renovarse use los mdoelos adecuados de ese ahrness». Evidencia: con lecturas simuladas de agy y grok, el delegado de un nivel va al harness que el orden de cuota pone primero y con un modelo que sirve ese nivel; con las lecturas del 2026-10-15 de la evidencia (marca seca vieja en el grupo Gemini) el grupo con saldo vuelve a ser candidato.
- **C10. Siempre con fallback hacia nosotros.** «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño.» Evidencia: una prueba por cada forma de falla (decisor caído o lento, llave ausente, respuesta ilegible, harness no instalado, cuota agotada) termina con el delegado corriendo en Claude, sin pregunta al dueño.
- **C11. Se comprueba antes de darle mando.** «a ver si se puede hacer como queremos o vamos a tener que hacer ajustes»; «puedes mandar y usar jev lo que quieras necesitamos ver como potenciar nuestro plugin». Evidencia: el comando de replay sobre el historial real da, por delegación, lo que el decisor habría elegido, lo que eligió el Lead y el costo de cada uno; el registro de decisiones sobrevive entre sesiones.
- **C12. El diseño dice qué se puede y qué requiere ajustes.** «a ver si se puede hacer como queremos o vamos a tener que hacer ajustes». Evidencia: el diseño trae una tabla por cada parte de lo pedido (C1 a C10) marcada «viable tal cual» o «viable con ajuste», y cada ajuste nombrado.
- **C13. Se ve lo decidido.** «ya comeinza a diseñar esto, a ver si se puede hacer como queremos». Evidencia: el reporte de la corrida y el diario de delegaciones dan, por delegación, el peldaño elegido, la razón, la confianza y la cuota que gastó.
- **C14. Las demás oportunidades quedan anotadas.** «necesitamos ver como potenciar nuestro plugin actual con estas nuevas arqueicturas desicions». Evidencia: `## Proposals` de este spec y el diseño listan cada uso hallado, con su medición, y ningún archivo del plugin los construye.

## User scenarios

1. **El Lead describe, el router decide.** Dado el router en modo «manda» y un Lead que delega «auditar el uso de la API en `src/`» sin `model` ni `effort`, cuando lanza el delegado, entonces el delegado corre con el peldaño que el decisor eligió, el Lead recibe el aviso con harness, modelo, esfuerzo y razón, y el registro conserva la decisión.
2. **Antes de mandar, solo registra.** Dado el router en modo «registra» (el estándar), cuando el Lead lanza un delegado, entonces corre exactamente como lo pidió el Lead, y el registro guarda lo que el decisor habría elegido, para el replay.
3. **Avisa.** Dado el modo «avisa», cuando el decisor difiere de lo que pidió el Lead, entonces el Lead recibe la decisión como aviso antes de seguir y el delegado corre como el Lead lo pidió.
4. **Anulación con motivo.** Dado el modo «manda», cuando el Lead lanza un delegado y declara «anulo: requiere Opus por el contrato legal», entonces el delegado corre como pidió el Lead y el motivo queda en el registro; sin motivo, decide el router.
5. **El Lead pasó un modelo sin motivo.** Dado el modo «manda», cuando el Lead pasa `model: opus` y ningún motivo, entonces decide el router y el registro marca que el Lead pidió Opus.
6. **Lo que no se toca.** Dado el router activo, cuando el swarm lanza un implementer, el diseño un asiento, o el Lead un agente `aether:judge`, entonces corre con el modelo y esfuerzo que ya tenía.
7. **Una compuerta de calidad no baja.** Dado el modo «manda» y una delegación de revisión, cuando el decisor propondría un nivel menor que el pedido por el Lead, entonces la revisión corre al nivel que el Lead pidió.
8. **Gana la ventana que vence antes.** Dado un delegado de solo lectura de nivel B, agy con el grupo Gemini al 100 % semanal y grok con 95 % semanal que se renueva antes, y ambos sobre la reserva, cuando el router elige harness, entonces el orden de cuota decide el primero, el modelo es el de ese harness que sirve el nivel B, y el registro dice qué ventana, qué saldo y qué prioridad.
9. **Nivel que solo Claude sirve.** Dado un delegado de nivel D y ningún modelo de agy o grok que lo sirva, cuando el router decide, entonces corre en Claude al nivel pedido.
10. **El decisor cae.** Dado el decisor Jev sin llave, con timeout o con una respuesta ilegible, cuando el Lead lanza un delegado, entonces corre en Claude (el peldaño que pidió el Lead o, si no pidió, el del estándar), sin pregunta al dueño ni demora mayor que el límite del decisor.
11. **El harness falla.** Dado que el router eligió grok y este no arranca o termina por cuota, cuando el delegado falla por infraestructura, entonces el mismo delegado corre en Claude al nivel pedido y se registra el motivo.
12. **Cambiar el criterio.** Dado el archivo del criterio, cuando el dueño cambia la respuesta que vale una pregunta, entonces el replay muestra qué decisiones cambian y la regresión sobre los briefs reales lo dice.
13. **Replay.** Dado el historial real de delegaciones, cuando el dueño corre el replay, entonces ve por delegación lo que decidió el Lead, lo que habría decidido el decisor, el costo de cada uno y cuántas decisiones cayeron en el fallback.
14. **Cambiar de decisor.** Dado el decisor estándar, cuando el dueño activa Jev con su llave (en el entorno o en el `.env` del directorio de datos), entonces las decisiones nuevas salen de Jev y los briefs salen a OpenRouter solo desde ese momento.
15. **Brief vago.** Dado un brief como «Thoughts?», cuando el decisor responde con confianza baja, entonces la decisión no baja de nivel y el registro marca la baja confianza.
16. **Marca seca vieja.** Dado un grupo de agy con una marca seca anterior y una lectura nueva con saldo, cuando el router ordena, entonces el grupo vuelve a ser candidato.

## Requirements

Decisión:
- R1. Antes de lanzar cada delegado del Lead a un agente que no es de Aether, el sistema produce una decisión con harness, modelo, esfuerzo, razón y confianza, a partir de lo que la tarea pide. Sirve a: C1.
- R2. La decisión se expresa como un peldaño de la tabla de niveles; el decisor elige un nivel y un esfuerzo, y el sistema los traduce al modelo y al harness. Sirve a: C1, C6.
- R3. El criterio de decisión está en un archivo legible del plugin, no en el código: las preguntas que se hacen de la tarea, cómo las respuestas se vuelven un nivel y un esfuerzo, y el umbral de confianza. Cambiar el archivo cambia la decisión sin tocar código. Sirve a: C2.
- R4. Bajo el umbral de confianza, o con una respuesta incoherente, la decisión no baja de nivel respecto de lo que pidió el Lead (o respecto del peldaño estándar si no pidió nada) y el registro lo marca. Sirve a: C2.
- R5. El plugin trae briefs reales con los hechos esperados de cada uno y una prueba de regresión del criterio sobre ellos. Sirve a: C2.
- R6. Una delegación de revisión, de juicio o de otra compuerta de calidad nunca baja del nivel que pidió el Lead. Sirve a: C2.

El Lead y el alcance:
- R7. El Lead lanza un delegado con solo la descripción y el brief; sin `model` ni `effort` la delegación sale con el peldaño decidido, nunca con el modelo o el esfuerzo heredados del Lead o de la sesión. Sirve a: C3, C7.
- R8. El Lead puede anular la decisión declarando el motivo; con la anulación, el delegado corre como el Lead lo pidió y el motivo queda en el registro. Un `model` o `effort` sin motivo no anula. Sirve a: C3.
- R9. El router actúa solo sobre las delegaciones del Lead a agentes que no son de Aether; los workflows `/aether:run` y `/aether:design` y los agentes `aether:*` conservan su modelo y esfuerzo, y el modelo y esfuerzo del propio Lead no cambian. Sirve a: C4.

Decisores:
- R10. Hay un solo contrato de decisor (entrada: la tarea; salida: nivel, esfuerzo, confianza y razón) y dos decisores que lo cumplen: Haiku con esfuerzo bajo, el estándar y sin dependencia externa, y `typesafe/jev-1.14` por OpenRouter. Un tercero se añade sin cambiar el criterio ni la política de cuota. Sirve a: C5.
- R11. Una opción del plugin elige el decisor (con la llave de OpenRouter para Jev) y otra el modo (registra, avisa, manda); el estándar es el decisor Haiku bajo y el modo «registra». La tabla de opciones de `docs/guide/options.md` coincide con `plugin.json`. Sirve a: C5, C11.
- R12. El decisor Jev se activa a propósito; su llave se lee del entorno o de un `.env` del directorio de datos del plugin, nunca del repositorio; los briefs salen a un tercero solo con ese decisor activo. Sirve a: C5.

Niveles y esfuerzo:
- R13. Hay una tabla de peldaños (harness, modelo, esfuerzo) con el nivel de cada uno derivado de las medidas de Artificial Analysis del índice de modelos, regenerable cuando el índice cambia, y con cada peldaño marcado como medido o sin medir. Sirve a: C6.
- R14. El nivel de un peldaño se mide con el eje que la tarea pide (código o inteligencia general), no con uno solo. Sirve a: C6.
- R15. Un modelo servido por otro harness se ubica por lo que mide; cuando la medida es de otra forma de servirlo (la API nativa de Claude para lo que agy sirve con el mismo nombre) o no hay medida en ese esfuerzo, el peldaño se marca «sin medir en este harness» y solo sirve al nivel que sí tiene medida. Sirve a: C6.
- R16. El esfuerzo que el decisor elige se traduce al esfuerzo del peldaño por su puntaje medido y no por su nombre; un esfuerzo que el harness no ofrece o que no tiene medida no se elige. Sirve a: C7.
- R17. Toda delegación decidida sale con esfuerzo explícito. Sirve a: C7.

Otros harness y cuota:
- R18. Un delegado decidido para agy o grok corre allí con el modelo de ese harness que sirve el nivel, sin necesitar una corrida (`run`) del swarm, y su resultado vuelve al Lead como el de un delegado normal. Sirve a: C8.
- R19. Los delegados de solo lectura (investigar, auditar) son los primeros que corren en otro harness; los que editan quedan fuera hasta que corran en su propio worktree. Sirve a: C8.
- R20. Los únicos harness elegibles son agy y grok, habilitados e instalados; codex y cursor no lo son. Sirve a: C8.
- R21. Entre los harness elegibles que pueden servir el nivel y tienen cuota sobre la reserva, el router usa primero el de mejor prioridad por la política de cuota vigente (A49: la ventana semanal, su saldo entre las horas que faltan para el reinicio), con los modelos adecuados al nivel y al esfuerzo decididos. Sirve a: C9.
- R22. Un grupo con una marca de agotado queda fuera solo mientras ninguna lectura posterior con saldo la desmienta; una lectura posterior con saldo levanta la marca. Sirve a: C9.
- R23. La decisión de cuota usa las lecturas ya disponibles y no lanza un proceso que frene el lanzamiento del delegado más allá de un límite fijo. Sirve a: C9, C10.

Fallback:
- R24. Si el decisor, la llave, el harness o la cuota fallan, o la respuesta no se puede leer, el delegado corre en Claude: con lo que pidió el Lead, o con el peldaño estándar de la opción si no pidió nada. No se pregunta al dueño. Sirve a: C10.
- R25. El fallback no añade una llamada a un modelo, y una falla del router nunca impide que el delegado arranque. Sirve a: C10.
- R26. Si un delegado en otro harness termina por infraestructura o por cuota, el mismo delegado corre en Claude al nivel pedido, sin gastar la escalera de intentos. Sirve a: C10.

Comprobación y visibilidad:
- R27. Cada decisión se conserva en un registro que sobrevive entre sesiones, con la tarea, lo que pidió el Lead, la decisión, la razón, la confianza, el decisor, el modo, el estado de cuota de los grupos, y lo que corrió y costó. Sirve a: C11, C13.
- R28. Un comando de replay lee el historial real de delegaciones y da, por delegación, lo que el decisor habría elegido, lo que eligió el Lead, el costo estimado de cada uno y cuántas cayeron en el fallback. Sirve a: C11.
- R29. En el modo «avisa» y en el «manda», el Lead recibe la decisión (peldaño y razón) en el lanzamiento. Sirve a: C3, C11, C13.
- R30. `aether-report` y el diario muestran, por delegación, el peldaño elegido, la razón, la confianza, el decisor y la cuota gastada, y por corrida cuántas se decidieron, anularon y cayeron en fallback. Sirve a: C13.

Diseño y propuestas:
- R31. El diseño marca cada parte de lo pedido (C1 a C10) como «viable tal cual» o «viable con ajuste», y nombra cada ajuste, entre ellos los que ya se conocen: la herramienta de lanzamiento permite reescribir `model` y `effort`, pero el gancho de lanzamiento del agente no ve ni reescribe el esfuerzo; el lanzamiento de un delegado en otro harness exige una llamada sin corrida; las marcas secas obsoletas; la tabla de reemplazos hoy mide un solo eje; la precisión de Haiku bajo como decisor no está medida. Sirve a: C12.
- R32. Cada otro uso hallado de esta arquitectura se anota en `## Proposals` con su medición, y no se construye. Sirve a: C14.

## Proposals

Cada uno nace de lo que el dueño pidió en «necesitamos ver como potenciar nuestro plugin actual con estas nuevas arqueicturas desicions». No se construyen (R32); el diseño las lleva con su medición.
- Segunda capa del guard con un decisor sobre los comandos que las reglas de `aether-guard` no detectan (medido: reglas 45 % de 57 comandos; reglas más Jev, 28 de 31 peligrosos con 0 falsos positivos). Para comandos conviene Haiku bajo, que no los saca de la máquina.
- Lint de planes que contraste el Tier de cada tarea con el decisor (medido: coincide con el Writer y el Judge en 55 %; solo valdría para subir de nivel).
- Graders: un A/B antes de bajar los graders de entrevista, que fueron el 53 % del gasto (≈$255 en 98 tareas).
- Un registro de aciertos del decisor que sirva a la segunda capa y al lint, una vez que C11 exista.

## Assumptions

Cada uno es reversible: el dueño puede cambiarlo sin rehacer el diseño.
- **A-1. El decisor primero registra, luego avisa, luego manda.** Base: la tarjeta (respuesta 2) y que la precisión de Haiku bajo no está medida. El estándar es «registra»; es una opción (R11).
- **A-2. Delegados de solo lectura primero a otro harness.** Base: la tarjeta (respuesta 3); no tocan el repositorio. Es el orden de entrega (R19).
- **A-3. La cuota sigue la política A49** con la ventana semanal como criterio, no la regla literal «el que se renueva antes». Base: la tarjeta (respuesta 4); la regla literal elegiría un grupo con 0 % de saldo. Es una política.
- **A-4. El fallback usa lo que el Lead pidió, o un peldaño estándar si no pidió nada.** Base: la tarjeta pide «Claude al nivel pedido» y, con el Lead sin elegir (C3), no hay nivel pedido. El peldaño estándar inicial es Sonnet con esfuerzo alto, por ser la ruta intermedia; se cambia en la opción.
- **A-5. El eje de un peldaño tiene un valor por tipo de tarea en el criterio** (código para tareas que editan o prueban, inteligencia general para investigar o juzgar). Base: la evidencia (sección 4, «El eje importa»). Se cambia en el archivo del criterio.
- **A-6. El decisor Jev se llama por la interfaz nativa de TypeSafe de OpenRouter**, no por chat, y el tiempo límite del decisor es corto (del orden de unos segundos). Base: la evidencia (sección 3; mediana 0.29 s, máximo 1.1 s). Se ajusta con la opción.
- **A-7. El Lead declara la anulación en el brief del lanzamiento** con una forma fija legible por el router. Base: la tarjeta (C3) exige «diciendo por qué». La forma exacta se escoge en el plan.
- **A-8. Las respuestas del decisor se piden en español o inglés según el brief**, y la baja de confianza en español se trata como cualquier baja de confianza (R4). Base: la evidencia (sección 3, «Español»).
- **A-9. Los briefs reales de R5 se toman del historial de las máquinas del dueño y se guardan sin datos de clientes.** Base: la evidencia usa briefs de proyectos de trabajo. Se sustituyen por briefs sintéticos si el dueño lo prefiere.

## Irreversible actions

- Llamadas pagadas reales a OpenRouter para comprobar el decisor Jev y el replay (clase `paid-call`, con la llave del dueño): `curl -X POST https://openrouter.ai/api/v1/systemone -H "Authorization: Bearer $OPENROUTER_API_KEY"` (≈US$0.00008 por brief). No corren en las pruebas del repositorio, que usan un decisor simulado.
- Una llamada real por harness externo, que gasta cuota (clase `paid-call`): `node scripts/lane-smoke.js agy` y `node scripts/lane-smoke.js grok`. Las hace el dueño a propósito.
- Una llamada real al decisor Haiku bajo para medir su precisión (clase `paid-call`): la hace el dueño a propósito con el comando de replay de R28.

Ningún merge a `main`, publicación ni borrado de datos lo exige este trabajo.

## Out of scope

- El swarm (`/aether:run`), los asientos de diseño (`/aether:design`) y los agentes `aether:*`.
- El modelo y el esfuerzo del propio Lead.
- Bajar de modelo una compuerta de calidad (una revisión, un juez) sin validarlo antes.
- `typesafe/jev-router` de OpenRouter (otro producto: elige y ejecuta).
- Los harness codex y cursor, por ahora.
- Entrenar o ajustar Jev con datos propios.
- Guardar la llave de OpenRouter en el repositorio.
- Construir los demás usos de la arquitectura de decisión (segunda capa del guard, lint de planes, graders): solo Propuestas.
