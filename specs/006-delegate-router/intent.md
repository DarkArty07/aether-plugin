# Tarjeta de intención: el router de delegados

- **Dueño:** Christopher
- **Fecha:** 2026-10-15
- **Confirmada por el dueño** con «aja, es muy improtnate que en abse a las ventanas semanalaes mas proximas a renovarse use los mdoelos adecuados de ese ahrness ya comeinza a diseñar esto, a ver si se puede hacer como queremos o vamos a tener que hacer ajustes».
- **Lo medido en la sesión** (motor, Jev, historial, niveles, cuota): [evidence/README.md](evidence/README.md). No es parte de los criterios.

## 1. Las palabras del dueño

1. «estoy viendo en una sesion de aether-lead de easclepio ecgia que el el lead decidio desplegar algunos subagentes en opus y en sonnet pero nunca se le ocurrio hacerlo en haiku. Para costos siento que eso no esta tan bien entonces se me esta ocurriendo tomar como idea las crecieintes arqueoicturas basadas en modelos de desiciones como jev, que decida que modelos usa el sistema en cada rol, posición o tarea.»
2. «Actualemtne teneos tres niveles con efforts dinamicos y distintos harness. pero basicamente se basan en, nivel Opus, nivel Sonnet, Nivel Haiku. Y si un hook o un proceso de modelo de desicion como jec, en nuestro caso usaramos Haiku Low, decidiera que es mejor para cada tarea?»
3. «como hacemos que el hook con haiku low o jev. SEPA COMO ROUTEAR?»
4. «esto solo aplicaria a la delegacion de subagentes verdad, para el swarm no aplica porque el swarm ya tiene definido que usa no?»
5. «esto serviria para quitarle el peso al lead tener que escoger que modleo apra que cosa no? que es lo unico que el lead tendria que hacer?»
6. «necesito tambien otra cosa que los agentes de delegate se apliquen tmabiena otros harness, tienes la api de artifiail analysis. Necesito que revises los modelos disponibles y a que me refiero con nivel haiku sonnet y opus, en sus distintos efforts. Agy que modelos nos da y Grok que modelos nos da, ese trabajo aparentemente ya estaba estaba hecho en el pasado esa invesigacion buscala»
7. «tambien tenemos que aplicar la poltiica de se gasta primero elque la ventana de cuota se renueve mas proximamente. por el momento solo agy y grok.»
8. «y el router tambien debe de manejar los efforts porque no todos los efforts valen igual no?»
9. «por el momento vamos a manejar dos proveedores el estadnar haiku low y jev de openrouter»
10. «porque estas usando jev router si nosotros tenemos que usar typesafe/jev-1.14»
11. «digo haiku low porque jev haria un dependencia de api extenr que lo que claude ya ofrece claude ya ofrece opus sonnet haiku, por eso decia haiku low. Con posibilidad de exteneder a jev y meter una api.»
12. «puedes mandar y usar jev lo que quieras necesitamos ver como potenciar nuestro plugin actual con estas nuevas arqueicturas desicions»
13. «es muy improtnate que en abse a las ventanas semanalaes mas proximas a renovarse use los mdoelos adecuados de ese ahrness ya comeinza a diseñar esto, a ver si se puede hacer como queremos o vamos a tener que hacer ajustes»
14. Dicho antes por el dueño y registrado en el arranque del Lead: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño».

## 2. Lo que el dueño confirmó

Quiere que el plugin **deje de depender de la costumbre del Lead** para decidir con qué corre cada delegado. Un *router* mira cada delegación justo antes de lanzarla y decide en qué **peldaño** corre: harness, modelo y esfuerzo. El Lead solo describe la tarea.

- **El problema que vio:** el Lead de Asclepio lanzó delegados en Sonnet y Opus y nunca en Haiku; por costo eso le pareció mal, y quiere una arquitectura de decisión en lugar de la elección a ojo.
- **Cómo "sabe" rutear:** no es un modelo entrenado. A cada decisión se le da un criterio explícito: qué se pregunta de la tarea, cómo las respuestas se vuelven un peldaño y la tabla de niveles por modelo y esfuerzo.
- **Dos decisores intercambiables:** Haiku con esfuerzo bajo, el estándar y sin dependencia externa, y `typesafe/jev-1.14` por OpenRouter. Se puede añadir otro.
- **El Lead:** escribe el brief, deja `model` y `effort` en manos del router y verifica el resultado. Solo anula, con motivo.
- **Alcance:** solo los delegados del Lead. El swarm sigue con el Tier y la escalera de su plan; los asientos de diseño no cambian.
- **Niveles:** «nivel Haiku, Sonnet u Opus» es capacidad medida con Artificial Analysis por modelo y esfuerzo, no un nombre; los esfuerzos no valen igual, y el router decide también el esfuerzo.
- **Otros harness:** los delegados también corren en **agy y grok** (solo estos por ahora), con Claude nativo de reserva.
- **Cuota, y es muy importante:** se gasta primero el harness cuya **ventana semanal se renueva antes**, y en él se usan los modelos adecuados al nivel.
- **Además:** ver cómo potenciar el resto del plugin con este tipo de arquitectura, y si lo pedido se puede hacer tal cual o requiere ajustes.

## 3. Criterios

Cada criterio dice qué y por qué, y se ata a una cita de la sección 1.

- **C1. Un decisor elige con qué corre cada delegado.** Para cada tarea que el Lead delega, el sistema decide el peldaño (harness, modelo y esfuerzo) a partir de lo que la tarea pide y no de la costumbre del Lead. *Por qué:* el costo se resiente cuando se elige por costumbre. (1, 2)
- **C2. Sabe rutear porque se le da el criterio.** La decisión descansa en un criterio explícito, que el dueño puede leer, probar y cambiar: qué se pregunta de la tarea, cómo las respuestas se vuelven un peldaño y cuánto se confía en ellas. *Por qué:* que el decisor «SEPA COMO ROUTEAR». (3)
- **C3. El Lead solo describe la tarea.** Para lanzar un delegado el Lead no escoge modelo ni esfuerzo; puede anular la decisión diciendo por qué. *Por qué:* quitarle el peso de escoger qué modelo para qué cosa. (5)
- **C4. Solo los delegados del Lead.** El swarm, los asientos de diseño y los agentes propios de Aether (Writer, Judge, Examiner, revisores) conservan su modelo y esfuerzo. *Por qué:* ya tienen definido qué usan. (4)
- **C5. Dos decisores intercambiables.** El estándar es Haiku con esfuerzo bajo; el segundo, `typesafe/jev-1.14` por OpenRouter. Se elige cuál se usa, y otro puede añadirse. *Por qué:* no depender de una API externa por defecto y poder meterla. (9, 10, 11)
- **C6. Los niveles son capacidad medida.** Un nivel es lo que mide Artificial Analysis para un modelo a un esfuerzo, en cualquier harness; las decisiones se expresan en niveles y los modelos de otros harness se ubican donde miden. *Por qué:* los nombres y los esfuerzos no equivalen entre modelos ni entre harness. (2, 6)
- **C7. El esfuerzo también se decide.** El decisor elige el esfuerzo junto con el modelo. *Por qué:* un mismo nombre de esfuerzo no vale igual en cada modelo. (8)
- **C8. Los delegados corren también en otros harness.** Además de Claude, en agy y grok, con los modelos de cada harness que sirven al nivel pedido. *Por qué:* RADAR, Delegación: el trabajo va a otros harness mientras dure su cuota. (6, 7)
- **C9. Manda la ventana semanal que se renueva antes.** Entre los harness que pueden servir el nivel y tienen cuota que gastar, se usa primero el de la ventana semanal más próxima a renovarse, con sus modelos adecuados al nivel. *Por qué:* lo que no se gasta antes del reinicio se pierde, y el dueño lo marcó como muy importante. (7, 13)
- **C10. Siempre con fallback hacia nosotros.** Si el decisor, el harness o la cuota fallan, el delegado corre en Claude al nivel pedido, sin preguntarle al dueño. *Por qué:* preguntarlo sería una falla de diseño. (14)
- **C11. Se comprueba antes de darle mando.** Con datos reales se puede ver qué habría decidido el decisor frente a lo que decidió el Lead y a lo que costó, y el sistema conserva ese registro. *Por qué:* saber si se puede hacer como se quiere. (13)
- **C12. El diseño dice qué se puede y qué requiere ajustes.** Cada parte de lo pedido queda marcada como viable tal cual o como viable con un ajuste, y el ajuste se nombra. *Por qué:* «a ver si se puede hacer como queremos o vamos a tener que hacer ajustes». (13)
- **C13. Se ve lo decidido.** El dueño y el Lead pueden ver qué peldaño se eligió, por qué y qué cuota gastó, en el reporte y en el diario. *Por qué:* comprobar el sistema sin abrir sus tripas. (13)
- **C14. Las demás oportunidades quedan anotadas.** Otros usos de esta arquitectura que el diseño encuentre se anotan como Propuestas, sin construirlos. *Por qué:* ver cómo potenciar el plugin. (12)

## 4. Fuera de alcance

- El swarm (`/aether:run`), los asientos de diseño (`/aether:design`) y los agentes `aether:*`.
- El modelo y el esfuerzo del propio Lead.
- Bajar de modelo una compuerta de calidad (una revisión, un juez) sin validarlo antes.
- `typesafe/jev-router` de OpenRouter (otro producto: elige y ejecuta).
- Los harness codex y cursor, por ahora.
- Entrenar o ajustar Jev con datos propios.
- Guardar la llave de OpenRouter en el repositorio.
- Construir los demás usos de la arquitectura de decisión (segunda capa del guard, lint de planes, graders): solo Propuestas.

## 5. Respuestas a las preguntas aclaratorias

| # | Pregunta | Respuesta | Origen |
|---|---|---|---|
| 1 | ¿Qué es el éxito: costo, alivio del Lead o uso de las cuotas externas? | El dueño puso el énfasis en las ventanas semanales (13) y en quitarle el peso al Lead (5); el costo es el origen (1). Los datos dicen que bajar a Haiku ahorra poco hoy (≈1.6 %): el valor está en el Lead libre y en las cuotas. | Dueño y datos |
| 2 | ¿El decisor aconseja o manda? | **Supuesto:** primero solo registra, después avisa y manda cuando sus aciertos estén comprobados (C11); el Lead anula con motivo. Reversible: es una opción. | Supuesto del Lead |
| 3 | ¿Qué delegados van primero a otro harness? | **Supuesto:** los de solo lectura (investigar, auditar), porque no tocan el repositorio; los que editan, después y en su propio worktree. Reversible: es el orden de entrega. | Supuesto del Lead |
| 4 | ¿La regla literal «el que se renueva antes» o A49? | El dueño: la ventana semanal más próxima (13). **Supuesto:** A49 (usa la ventana más larga y descarta el grupo sin saldo sobre la reserva) con la ventana semanal como criterio, porque la regla literal elegiría un grupo con 0 % de saldo. Reversible: es una política. | Dueño y supuesto |
| 5 | ¿Qué entra en este diseño? | Router, esfuerzo, otros harness, cuota y los dos decisores. Lo demás: Propuestas (C14). | Supuesto del Lead |
| 6 | ¿Qué pasa con la llave de OpenRouter y los briefs? | **Supuesto:** el proveedor Jev se activa a propósito; la llave se lee del entorno o de un `.env` del directorio de datos, nunca del repositorio; los briefs salen a un tercero solo con ese proveedor activo. Reversible. | Supuesto del Lead |
| 7 | ¿Y si ningún harness elegible sirve el nivel? | Claude nativo al nivel pedido (C10). | Dueño |
