# Spec 044: turnos del diseño, revisiones y fallas recientes

- **Date:** 2026-11-17
- **Status:** Draft
- **Intent:** `specs/044-design-turns-and-reviews/intent.md` (tarjeta de los issues #303, #301, #315, #210, #197, #193 y #196; el dueño aprobó el 2026-11-17, en la página de plan, el plan de esta corrida, con topes de 8 h y US$ 200).

## Criteria

- C1. Suben los topes de turnos del Writer y del Examiner: el Writer pasa de 60 a 100 y el Examiner de 40 a 80. «yo digo que subas los turnos y ademas le des el map de codigo y mas loq ue siferas». Evidence: una prueba lee `agents/writer.md` y `agents/examiner.md` y comprueba `maxTurns: 100` y `maxTurns: 80`.
- C2. El Writer del plan recibe un mapa del código en una spec grande. Cuando la spec aprobada tiene 15 requisitos o más, `/aether:design` produce antes del plan, sin escribir nada en el código, un mapa con el archivo y la línea donde se toca cada requisito, en el modelo más barato que la escalera (o el asiento, con superdelegación) permita, y se lo pasa al Writer del plan en su mensaje; en una spec más chica no hay mapa y el diseño hace lo mismo que hoy; si el mapa falla, el plan se escribe como hoy, sin mapa. «yo digo que subas los turnos y ademas le des el map de codigo y mas loq ue siferas». Evidence: pruebas del flujo de diseño con agentes de mentira: con una spec de 15 requisitos el paso del mapa corre una vez, antes del Writer del plan, en el modelo más barato que la escalera (o el asiento, con superdelegación) permita, y el mensaje del Writer lo contiene; con una de 14 no hay paso de mapa ni mapa en el mensaje; con un mapa que falla el plan se escribe, el resultado no cambia de forma y el registro del flujo dice que el mapa falló; una comprobación de que el paso del mapa no tiene herramientas de escritura.
- C3. El plan y las tareas salen en dos llamadas del Writer: primero `plan.md` y después `tasks.md`, que se escribe leyendo el plan; `aether-plan check` corre sobre las tareas con el mismo reintento de hoy y el Judge revisa las dos juntas como hoy. «yo digo que subas los turnos y ademas le des el map de codigo y mas loq ue siferas». Evidence: una prueba del flujo de diseño con un Writer de mentira que cuenta sus llamadas: el paso del plan hace dos, la segunda recibe la ruta del plan ya escrito; con un `check` que falla la primera vez, el reintento corre una vez con los errores; el Judge recibe `plan.md` y `tasks.md` en una sola ronda.
- C4. El Examiner que se queda sin turnos sigue solo. Si termina sin respuesta y dejó pruebas escritas, el flujo lo relanza una vez con esas pruebas, como ya hace cuando falla otro harness, para que escriba las que faltan; solo si la segunda vez tampoco termina, el Lead recibe lo que existe, como hoy. «yo digo que subas los turnos y ademas le des el map de codigo y mas loq ue siferas» (es la cuarta vez, #76, #229, #297, #303). Evidence: pruebas del flujo de diseño con un Examiner de mentira: que termina sin respuesta tras escribir pruebas y a la segunda completa, el flujo no devuelve control al Lead y el relanzamiento recibe las pruebas escritas; que no termina ninguna de las dos veces, el resultado lista las pruebas que existen marcando las del índice, y hubo un solo relanzamiento; que termina sin respuesta sin dejar pruebas, no hay relanzamiento.
- C5. El revisor puede decir «listo» y el Lead sabe qué hacer con cada veredicto. «Si a todo trabja autonomamente en resolverlo» (sobre #210 y #197, con las recomendaciones de los issues). Evidence: una prueba de documentos sobre `agents/reviewer.md` (qué hace falta para `ready`, tope de 10 menores), una prueba sobre `REVIEW_SCHEMA` y el flujo de la corrida (el arreglo de cada hallazgo llega al resultado), y una prueba de documentos sobre la regla del Lead (qué hacer con cada veredicto y el motivo de aprobar un `not-ready`) y sobre el tamaño de las partes del arranque.
- C6. Lo que sigue siendo falso o engaña del #301 se corrige. «Solo deja los utiles». Evidence: una comprobación por cada punto, R19 a R22.
- C7. Un delegado de solo lectura que salió bien se cierra solo. Cuando sus comprobaciones pasan, el sistema lo cierra como aprobado y el aviso de Stop no lo cuenta como pendiente; el Lead usa `aether-delegate verdict` con él solo para devolverlo (`fix`) o declararlo `infeasible`, y solo antes del cierre (con una comprobación en rojo por archivos que tocó otro escritor, `approve --ignore` sigue como hoy); una decisión nueva en `docs/decisions.md` reemplaza la frase de A85 sobre los veredictos para este caso y cita la palabra 3; los delegados que editan no cambian. «Si a todo trabja autonomamente en resolverlo» (sobre #193). Evidence: pruebas de `aether-delegate` con un delegado de solo lectura de mentira: con comprobaciones en verde el log trae su aprobación sin que nadie llame a `verdict` y `unverdictedDelegates` no lo lista; con una comprobación en rojo queda pendiente como hoy; con una comprobación en rojo por archivos de otro escritor, `approve --ignore` sigue aprobándolo; un delegado que edita sigue pidiendo `verdict`; una prueba de documentos sobre la decisión nueva y la regla del Lead.
- C8. Las ediciones de Haiku en Claude siguen sin revisor. «Si a todo trabja autonomamente en resolverlo» (sobre #196: «aceptar que no tenga revisor y cerrar»). Evidence: una prueba existente o nueva muestra que `aether-delegate approve` corre las pruebas de la tarea antes de dar la fusión por buena; el issue #196 se cierra con la palabra del dueño y esa evidencia; no se añade ningún revisor.
- C9. Una lectura no es una instalación. Un comando que solo lee y nombra una carpeta de skills personal no cuenta como `skill-install` ni va a la lista del dueño; una escritura en esas carpetas sigue contando; la protección de los ajustes de Claude no se debilita. «Si a todo trabja autonomamente en resolverlo» (sobre #315). Evidence: pruebas de `tests/guard.test.js`: un `find` sin acciones que escriban o borren y un `gh issue` o `gh pr` cuyo texto nombra la carpeta pasan; `cp`, `ln`, `mv`, `find -delete`, `find -exec` que escribe y una redirección a esa carpeta siguen marcados; los casos de escritura en los ajustes de Claude siguen refusados.
- C10. Calidad. `npm run check` pasa, cada criterio tiene su prueba y las reglas del Lead siguen cabiendo en las partes del arranque (#139). «Si a todo trabja autonomamente en resolverlo». Evidence: `npm run check` en verde y la prueba de tamaño de las partes del arranque en verde.

## User scenarios

1. Given una spec aprobada con 20 requisitos, When corre `/aether:design`, Then antes del Writer del plan un paso de solo lectura del flujo de diseño, en el modelo más barato que la escalera (o el asiento) permita, produce el mapa de archivo y línea por requisito, el Writer lo recibe en su mensaje y escribe `plan.md` y después `tasks.md` en dos llamadas.
2. Given una spec aprobada con 8 requisitos, When corre `/aether:design`, Then no hay paso de mapa y el Writer recibe el mismo mensaje que hoy.
3. Given una spec grande y un mapa que falla, When el diseño llega al plan, Then el Writer escribe el plan sin mapa y el diseño no se detiene.
4. Given un Examiner que llega a su tope tras escribir C1 a C4, When termina sin respuesta, Then el flujo lo relanza una vez con esas pruebas y el Lead no tiene que retomarlo.
5. Given un Examiner que tampoco termina la segunda vez, When el flujo acaba, Then el Lead recibe las pruebas que existen con su marca de índice.
6. Given una revisión final sin hallazgos críticos ni importantes y con 10 menores o menos, When el revisor contesta, Then puede decir `ready`, y cada hallazgo trae su arreglo.
7. Given un veredicto `ready-with-fixes` sin hallazgos importantes, When el Lead lo lee, Then aprueba; Given que alguno es importante o crítico, Then corrige con esos hallazgos; Given que el Lead aprueba un `not-ready`, Then escribe el motivo.
8. Given un delegado de solo lectura cuyas comprobaciones pasan, When termina, Then queda aprobado en el log y el aviso de Stop no lo menciona.
9. Given un delegado de solo lectura cuya respuesta está vacía, When termina, Then no se cierra solo y el Lead decide con `verdict` (`fix` o `infeasible`).
10. Given el comando `find ~/.claude/skills -name SKILL.md`, When el guard lo revisa, Then no es un `skill-install` y no va a la lista del dueño; Given `cp -r x ~/.claude/skills/`, Then sigue contando como `skill-install`.
11. Given una corrida autónoma abierta, When `aether-delegate approve` rechaza un `merge-main`, Then el mensaje dice que la fusión va a «Espera tu sí» y no manda a preguntarle al dueño en ese momento.

## Requirements

- R1: `agents/writer.md` declara `maxTurns: 100`. Serves: C1
- R2: `agents/examiner.md` declara `maxTurns: 80`. Serves: C1
- R3: Cuando la spec aprobada tiene 15 requisitos o más (el conteo de líneas `- Rn:` de `spec.md`), `/aether:design` corre un paso de mapa del código antes del Writer del plan; el umbral es un dato y no un número escrito en varios sitios. Serves: C2
- R4: El paso de mapa produce, por cada requisito de la spec, el archivo y la línea donde se toca; no escribe en el repositorio ni en `specs/`, y corre en el modelo más barato que la escalera (o el asiento, con superdelegación) permita. Serves: C2
- R5: El Writer del plan recibe el mapa en su mensaje; la spec de menos de 15 requisitos no corre el paso, no lo menciona en el mensaje y no cambia el número de pasos del diseño. Serves: C2
- R6: Si el paso de mapa falla, termina sin respuesta o devuelve algo vacío, el diseño sigue con el Writer del plan sin mapa y lo deja dicho en el registro del flujo (`log`); el resultado del diseño no cambia de forma. Serves: C2
- R7: El paso del plan hace dos llamadas al Writer: la primera escribe `plan.md` y la segunda escribe `tasks.md` leyendo ese plan; cada llamada tiene su propio esquema de respuesta (no el que exige `plan` y `tasks` juntos). Esto vale para el Writer nativo; un asiento externo del Writer (su esquema en `lib/lane-schemas.js` y el manejo de `keptPartial`) conserva su llamada única, como hoy. Serves: C3
- R8: `aether-plan check` corre sobre `tasks.md` después de la segunda llamada; si falla, la segunda llamada se repite una vez con los errores, como hoy; el Judge recibe `plan.md` y `tasks.md` en una sola ronda, como hoy. Serves: C3
- R9: Si el Examiner termina sin respuesta y dejó pruebas escritas, el flujo lo relanza una vez, con las pruebas que dejó, por el mismo camino que ya usa cuando un asiento de otro harness no terminó, para que escriba las que faltan. Serves: C4
- R10: Si el Examiner relanzado tampoco termina, o si el primero termina sin respuesta sin dejar pruebas, no hay relanzamiento: el Lead recibe lo que existe, con la marca de cuáles pruebas están en el índice, como hoy. Serves: C4
- R11: El texto de `agents/reviewer.md` dice que `ready` es no tener ningún hallazgo crítico ni importante, aunque queden menores. Serves: C5
- R12: El texto de `agents/reviewer.md` pone tope de 10 a los hallazgos menores. Serves: C5
- R13: Cada hallazgo del revisor final trae su arreglo: `REVIEW_SCHEMA` de `workflows/run.workflow.js` tiene un campo para el arreglo, el texto del revisor lo pide en cada hallazgo (no solo «when not obvious») y el resultado de la corrida lo entrega al Lead. Serves: C5
- R14: La regla del Lead dice qué hacer con cada veredicto, del revisor final y del revisor de un delegado: con `ready-with-fixes`, aprueba si ningún hallazgo es importante o crítico y, si alguno lo es, corrige los críticos e importantes (los menores quedan diferidos); `ready` se aprueba; `not-ready` no se aprueba sin escribir el motivo. Serves: C5
- R15: La regla de R14 dice también que los menores no se trabajan, con `ready` o con `ready-with-fixes`, como ya dice `skills/swarm/SKILL.md` («They are not worked»); no hay excepción para los menores. Serves: C5
- R16: La regla del Lead dice que aprobar un `not-ready` exige escribir antes el motivo, en el diario de la corrida autónoma (`.aether/autonomy/<run id>/diary.md`) o, fuera de una corrida, en su siguiente respuesta al dueño, que es donde ya registra sus decisiones según `skills/autonomous-runs/SKILL.md`; no se añade un comando ni una bandera. Serves: C5
- R17: La regla de R14 a R16 cabe en las partes del arranque de `skills/using-aether/SKILL.md` (cada parte con su salida completa dentro de 9.800 caracteres) o vive en otra skill que el Lead carga cuando la necesita, con un puntero corto en el arranque. Serves: C5, C10
- R18: La prueba existente `tests/session-start-parts.test.js` (cada parte del arranque dentro de 9.800 caracteres) sigue en verde con la regla nueva; no se añade otra. Serves: C10
- R19: El sitio (`site/app.js` `p.direct.a` y el `alt` de `site/index.html`, en español y en inglés) deja de decir «cinco llamadas a herramientas» y describe el camino directo con la regla de tres ediciones o diez lecturas; el `alt` nuevo dice la regla de tres ediciones o diez lecturas en ambos idiomas, y `tests/site.test.js` cambia su prueba «p.direct.a alt stays unchanged» (línea 391) para que compruebe el `alt` nuevo y queda en verde. Serves: C6
- R20: El mensaje de rechazo de `merge-main` de `aether-delegate approve` (`MERGE_MAIN` en `lib/delegate-approve.js`) no manda a preguntarle al dueño durante una corrida autónoma: dice que la fusión va a «Espera tu sí». Serves: C6
- R21: Una prueba muestra si `aether-autonomy quota-brake` detiene las cadenas de delegados de una corrida retomada con `aether-autonomy continue`; si no las detiene, se arregla en el código y la prueba lo fija. Serves: C6
- R22: `docs/guide/maintenance.md` y `docs/guide/troubleshooting.md` dejan de decir lo que el código no hace: la limpieza con una corrida abierta, «unread quota above» y la recompilación sin `--only`; una prueba o comprobación nombra cada una de esas frases. Serves: C6
- R23: Cuando un delegado de solo lectura termina y sus comprobaciones pasan (no se tocó ningún archivo y la respuesta no está vacía), el sistema registra su aprobación en el log de delegados sin que el Lead llame a `aether-delegate verdict`. Serves: C7
- R24: Un delegado de solo lectura con una comprobación en rojo no se cierra solo, y un delegado que edita sigue necesitando `aether-delegate verdict` y la aprobación con sus pruebas, como hoy. Serves: C7
- R25: `unverdictedDelegates` (`lib/delegate-report.js`) y el aviso de Stop `unverdictedStopMessage` no cuentan como pendiente un delegado de solo lectura cerrado por el sistema. Serves: C7
- R26: `aether-delegate verdict` acepta `fix` e `infeasible` para un delegado de solo lectura antes de que se cierre, y la regla del Lead dice que con un delegado de solo lectura cuyas comprobaciones pasaron solo se usa para eso. Un delegado de solo lectura con una comprobación en rojo por archivos que cambió otro escritor conserva `approve --ignore` (`lib/delegate-task.js`, issue 100), y `tests/delegate-task.test.js` (líneas 426 y 446) sigue en verde. Serves: C7
- R27: Una decisión nueva en `docs/decisions.md` (la siguiente después de A131) reemplaza para este caso la frase de A85 («solo cuenta el veredicto que pasa por `aether-delegate verdict`»), cita la palabra del dueño y deja a A85 en pie para los delegados que editan. Serves: C7
- R28: El issue #196 se cierra con la palabra del dueño y la prueba de que `approve` corre las pruebas de la tarea antes de fusionar; el código no añade ningún revisor a las ediciones de Haiku en Claude. Serves: C8
- R29: `isSkillInstallSegment` (o lo que `writeTargets` le entregue) no marca un segmento que solo lee: un `find` sin acciones que escriban o borren (`-delete`, `-exec`, `-execdir`, `-ok`, `-fprint*`) y el texto de un `gh issue` o `gh pr` que nombra una carpeta de skills personal. Serves: C9
- R30: Una escritura en una carpeta de skills personal sigue contando como `skill-install` y yendo a la lista del dueño: copiar, enlazar, mover, `find -delete` o `find -exec` con una escritura, y una redirección. Serves: C9
- R31: La protección de los ajustes de Claude (`claudeConfigWrite`, que usa los mismos destinos) no se debilita: cada caso que hoy refusa sigue refusado. Serves: C9
- R32: `npm run check` pasa, y cada requisito de R1 a R31 que cambia código o texto tiene al menos una prueba o comprobación que falla sin su cambio (R28 se comprueba con la prueba existente de `approve` y el cierre del issue). Serves: C10

## Proposals

None.

## Assumptions

- Umbral de 15 requisitos, topes de 100 y 80 turnos, un solo relanzamiento del Examiner y tope de 10 menores: cifras que fijó el Lead porque el dueño no dio números (la tarjeta lo dice). Son datos; el dueño puede cambiarlos.
- El paso del mapa es una llamada de agente del flujo de diseño, de solo lectura, no una tarea de `aether-delegate`: no cae bajo el cierre automático de C7 ni escribe en el log de delegados. Su texto vive en el flujo o en un agente sin herramientas de escritura; cómo se produce lo decide el plan, con la condición de que salga del modelo más barato que sirva y no escriba en el repositorio (la tarjeta lo dice).
- El mapa se pasa por el mensaje del Writer y no se guarda en `specs/`; si se guarda, es un archivo aparte que ningún criterio exige. Reversible.
- «Pruebas que dejó» el Examiner son las que `aether-exam recover` ya devuelve, con su marca de índice; no se define otro criterio.
- Un delegado de solo lectura es el que ya distinguen `lib/delegate-checks.js` y el log (el que no puede editar); «salió bien» es que esas comprobaciones pasen.
- Cerrar los demás menores del #301 con su motivo y cerrar #196 son acciones de GitHub que hace el Lead tras el arreglo; son reversibles (un issue se reabre), por eso no van en las acciones irreversibles.
- Para R16, el motivo del `not-ready` se escribe donde el Lead ya registra sus decisiones (el diario de la corrida autónoma o su respuesta), sin un comando nuevo; si el dueño quiere que el sistema lo exija, es otra spec.
- La división del Writer en dos llamadas (R7) es del Writer nativo; el asiento externo no cambia. Reversible.
- R21 es una prueba primero: si `quota-brake` ya detiene las cadenas de una corrida retomada, no hay cambio de código.

## Irreversible actions

None.

## Out of scope

- Darle revisor a las ediciones de Haiku en Claude (#196).
- Los otros menores del #301, que se cierran con su motivo.
- #314 (el comportamiento del Lead con las skills), #195 (el par más barato que falla) y #302 (Muse en el aviso de modelos nuevos).
- Subir la versión, publicar e instalar.
- Que la elección de pares aprenda del registro, y guardar qué se hizo con cada hallazgo importante (#206).
