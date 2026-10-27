# Tarjeta de intención: una sola escalera para los delegados y el swarm, todo arrancando en Haiku

Issue #102. El diseño corto aprobado por el dueño y revisado por el Juez es [design.md](design.md): es el entendimiento confirmado, y la especificación, el plan y las tareas parten de él.

## Lo que dijo el dueño

- «Necesito que todo arranque en haiku por costo. 37 tareas a sonnet son mucho costo. Que todo arranque en haiku.» (2026-10-26)
- «crei que la regla barato primero ya habia quedado entendida aqui tambien» (2026-10-26)
- «Si todas las tareas del plan empeizan en haiku. pero Quien decide si sube el effort o sube el modleo o sube la tarea, hay supervisores?» (2026-10-27)
- «Podemos hacer una ladder en lugqar de dos. Es decir ancalarnos de la ladder que existe para no tener que maneter otra funcion y hacer mas simple el codigo sin perder funcionlidad» (2026-10-27)
- «Como podriamos cambiar el del swarm para seugir la filosofia barato primeor. Y un modelo barato se hace bueno gracias a un buen supervisor» (2026-10-27)
- «No veo una perdida de calidad muy considerable y si veo ahorro en dineor, esto no se va a beneficiar pro tareas cortas si no por tareas largas de muchos implementers. A mi parecer el cambio esta jsutificado. Como hariamos el cmabio?» (2026-10-27)
- «Analiza los alcances diseña y entregame el diseño que es lo que aprobamos y como comepsamos el modelo barato apra aumentar la calidad» y, sobre el diseño entregado, «Adleantre aprobado» (2026-10-27)

## El entendimiento que el dueño confirmó

El swarm y los delegados dejan de tener dos escaleras: el swarm usa la de los delegados (`lib/ladder.js`, `config/ladder.json`). Toda tarea arranca en el primer peldaño, Haiku `high`. Antes de cada supervisor, el sistema comprueba sin modelo los archivos cambiados y corre las pruebas; lo que falla vuelve al implementador sin gastar al supervisor. El supervisor sigue fuerte y sus hallazgos dicen archivo y qué falta. El plan deja de elegir el modelo de arranque. El detalle está en `design.md` (D1 a D10).

## Criterios (qué y por qué, nunca cómo)

1. **Toda tarea de un swarm arranca en Haiku, diga lo que diga el plan.** Por costo («Necesito que todo arranque en haiku por costo»).
2. **El swarm y los delegados usan una sola política de subir de esfuerzo, de modelo o bloquear, y sus números viven en un solo archivo.** Para no mantener dos funciones («una ladder en lugar de dos»).
3. **Después de cada intento y antes del supervisor, el sistema comprueba sin modelo que no se tocó nada fuera de lo permitido y que pasan las pruebas del plan; un intento que falla vuelve al implementador con el error y no gasta una ronda de supervisor.** Para que el modelo barato mejore con evidencia y el supervisor no revise trabajo roto («un modelo barato se hace bueno gracias a un buen supervisor»).
4. **Los hallazgos con los que un supervisor pide reintentar dicen archivo y qué falta; la tarea sube de modelo solo cuando se agotan las correcciones, vuelven los mismos hallazgos o el supervisor la declara inviable con una razón.** Para subir con evidencia y no por contar intentos.
5. **El plan ya no elige el modelo ni el esfuerzo de arranque, los planes existentes con esas líneas siguen siendo válidos, y la revisión final sube a Opus cuando una unidad pide `Review: xhigh` o `max`.** Para que el riesgo se marque y no se adivine.
6. **No cambia lo demás:** las fusiones de a una, el presupuesto de agentes, el enrutador de pares y los lanes, el modelo y el esfuerzo del supervisor, y los comandos y el historial de los delegados.
7. **El informe de una ejecución cuenta las tareas aprobadas al primer intento, las correcciones, las subidas con su causa y los rechazos de la puerta.** Para saber si el cambio se deshace («No veo una perdida de calidad muy considerable»).
8. **La regla nueva está dicha en las habilidades, las guías y la decisión A97, y el issue #102 se cierra.**
9. **La función se prueba repitiendo el juego de la serpiente con el swarm nuevo, solo con Claude:** pasa las 17 pruebas de aceptación; el costo y el tiempo se miden contra las dos ejecuciones del 2026-10-27 (techo de US$ 3.24 de Claude y de 12 minutos) y se informan.

## Qué queda fuera

Bajar la revisión final a Sonnet; un comando de pruebas por tarea; atacar la lentitud de Haiku en las tareas de integración; cambiar el modelo del supervisor; una anulación por tarea para arrancar más arriba; cambiar el paralelismo.

## Respuestas a las preguntas del Escritor (supuestos míos, reversibles)

1. **¿La carpeta de la unidad tiene lo que necesita el comando de pruebas?** La puerta corre en la misma carpeta donde el implementador ya corre las pruebas; si ahí no hay lo que el comando necesita, el implementador ya fallaría. Se documenta, no se añade nada.
2. **¿La repetición en vivo del juego es una puerta de lanzamiento?** Las 17 pruebas de aceptación sí lo son; el costo y el tiempo se miden y se comparan con los criterios para deshacer, y los decide el dueño.
3. **¿Importa que el hallazgo de relleno rara vez se repita?** No: el tope de cinco correcciones de Haiku acota el ciclo, y los hallazgos concretos del supervisor son los que hacen subir por repetición.

## Restricciones técnicas que dejó el Juez (para el plan)

El mod solo admite líneas de comando con fichas fijas, sin comillas ni espacios; los hallazgos y la razón de un veredicto pasan como datos en un archivo de carga bajo la carpeta del run, con una ruta que el verbo deriva de la ejecución y la tarea, y con el resumen de verificación que el mod ya usa. La puerta se envía con el tiempo largo (límite de 600 s) y debe decir qué es un corte por tiempo. Cada resultado sin veredicto (implementador que falla o se abandona, fallo de un lane, fallo del supervisor, respuesta no aceptada de la escalera) tiene un destino en la escalera y su prueba.
