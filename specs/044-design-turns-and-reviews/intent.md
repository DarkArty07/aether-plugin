# Tarjeta de intención 044: turnos del diseño, revisiones y fallas recientes

Issues:
- #303: el Writer del plan y el Examiner llegan a su tope de turnos en una spec grande.
- #301: menores diferidos de la spec 043; aquí solo entran los que se nombran abajo.
- #315: el guard toma por `skill-install` un comando que solo lee las carpetas de skills.
- #210: la revisión final nunca dice «ready».
- #197: «ready-with-fixes» no le dice al Lead qué hacer.
- #193: el veredicto obligatorio de los delegados de solo lectura casi nunca decide nada.
- #196: las ediciones de Haiku en Claude no tienen revisor.

El número 044 lo dio `aether-plan next-spec`.

## Palabras del dueño

1. «me itneresa las fallas y las revisiones a delhados siento que son los mas urgentes» (2026-11-17)
2. «yo digo que subas los turnos y ademas le des el map de codigo y mas loq ue siferas» (2026-11-17, sobre #303. Lo que el Lead le sugirió: un mapa del código antes del plan, el plan y las tareas en dos llamadas del Writer, y que el Examiner siga solo cuando se le acaban los turnos)
3. «Si a todo trabja autonomamente en resolverlo» (2026-11-17). Responde a la lista del Lead: #303, #301 y #315 los resuelve el Lead; para #210 y #197, #193 y #196 pidió su sí y lo recibió.
4. «Solo deja los utiles» (2026-11-17, sobre los issues de este tema)
5. Las recomendaciones de los issues que el dueño aprobó con la palabra 3:
   - #210: tope a los menores, qué hace falta para `ready`, y campo del arreglo;
   - #197: con `ready-with-fixes` se aprueba si ningún hallazgo es importante y se corrige si alguno lo es; aprobar un `not-ready` pide el motivo;
   - #193: un delegado de solo lectura con sus comprobaciones en verde se cierra solo, y el Lead usa `verdict` solo para devolverlo o declararlo `infeasible`;
   - #196: aceptar que no tenga revisor y cerrar.

## Entendimiento que el dueño confirmó

Aprobó el plan de esta corrida el 2026-11-17, en la página de plan, con topes de 8 h y US$ 200. En palabras llanas:

- **El diseño de una spec grande no se cae por turnos (#303).** Suben los topes de turnos del Writer y del Examiner. En una spec grande, el Writer del plan recibe un mapa del código ya hecho, para no gastar sus turnos explorando. El plan y las tareas salen en dos llamadas. El Examiner que se queda sin turnos con parte de las pruebas escritas sigue solo, sin que el Lead lo retome a mano.
- **El revisor puede decir «listo», y el Lead sabe qué hacer con cada veredicto (#210, #197).**
- **El Lead no gasta un paso en aprobar un delegado de solo lectura que salió bien (#193).**
- **Las ediciones de Haiku en Claude siguen sin revisor (#196).** Desde la 0.42.0, `aether-delegate approve` corre las pruebas de la tarea antes de dar la fusión por buena.
- **Del #301 solo se arregla lo que sigue siendo falso o engaña,** listado en C6; el resto se cierra con su motivo.
- **El guard deja de confundir una lectura con una instalación (#315).**

## Hechos del código que la tarjeta da por sabidos

Leídos en `main` (`1da5942`, versión 0.46.0 más la suite de evals) el 2026-11-17:

- **Topes de turnos:** `plugins/aether/agents/writer.md` tiene `maxTurns: 60` y `agents/examiner.md`, `maxTurns: 40`.
- **El Writer del plan, en `plugins/aether/workflows/design.workflow.js`:**
  - el paso 3 (`writePlan`, cerca de la línea 1022) escribe `plan.md` y `tasks.md` en una sola ronda, cuyo esquema `WRITER_SCHEMA` exige `plan` y `tasks`;
  - `checkedAfter` corre `aether-plan check` y repite el paso una vez con los errores;
  - un asiento empieza en otro harness cuando la superdelegación lo elige, y termina en el agente nativo cuando no.
- **El Examiner, en el mismo archivo:**
  - `examinerPartialForNative` (cerca de la línea 419) ya le pasa a un Examiner nativo las pruebas que dejó uno anterior en otro harness (cerca de las líneas 699 a 735);
  - después del Examiner, `aether-exam recover` devuelve las pruebas que existen, marcando cuáles están en el índice.
- **La corrida de la spec 043** (`auto-20261116-123722-dbbb`):
  - el Writer nativo del plan terminó dos veces sin respuesta, tras 65 llamadas a herramientas cada vez;
  - un delegado de solo lectura en Haiku hizo un mapa del código, con archivo y línea por requisito (unas 220 líneas);
  - con ese mapa, el Writer escribió `plan.md` y después `tasks.md`, en dos llamadas;
  - el Examiner se detuvo en su tope tras C1 a C4 y hubo que retomarlo a mano.
- **El revisor final (`plugins/aether/agents/reviewer.md`):**
  - define las severidades crítica, importante y menor;
  - no dice qué hace falta para contestar `ready` y no pone tope a los menores;
  - pide el arreglo de un hallazgo «when not obvious», pero `REVIEW_SCHEMA` de `workflows/run.workflow.js` (cerca de la línea 96) no tiene campo para el arreglo.
- **Los revisores de los delegados:** el revisor de otro par de un delegado ya marca cada hallazgo como `important` o `minor` desde la 0.44.0 (`lib/lane-schemas.js`).
- **Las reglas del Lead:**
  - `skills/swarm/SKILL.md` (cerca de la línea 144) dice de los menores: «They are not worked»;
  - las reglas del Lead no nombran los veredictos `ready`, `ready-with-fixes` ni `not-ready`.
- **Los delegados de solo lectura:**
  - hoy se cierran con `aether-delegate verdict --verdict approve`;
  - sus comprobaciones están en `plugins/aether/lib/delegate-checks.js` y miran que no se tocó ningún archivo y que la respuesta no está vacía;
  - el aviso de Stop por resultados sin veredicto es `unverdictedStopMessage`, en `lib/continuity-hook.js`, y lee `unverdictedDelegates` de `lib/delegate-report.js`;
  - la regla de que solo cuenta el veredicto que pasa por `aether-delegate verdict` está en la decisión A85 de `docs/decisions.md`, y la última decisión es A131.
- **El tamaño del arranque:** las reglas del Lead (`skills/using-aether/SKILL.md`) llegan en tres partes de hasta 9.800 caracteres cada una (#139). Una frase nueva tiene que caber o ir a otra skill que el Lead carga cuando la necesita.
- **El guard (#315):**
  - `isSkillInstallSegment` (`plugins/aether/lib/guard.js`, cerca de la línea 707) marca un segmento cuando uno de sus `writeTargets` es una carpeta de skills personal;
  - `writeTargets` (cerca de la línea 646) toma como destino cada palabra de un comando que no esté en `READ_COMMANDS` (cerca de la línea 499);
  - `find`, `node` y `gh` no están en esa lista;
  - `claudeConfigWrite` usa los mismos `writeTargets`.
- **Los textos de #301:**
  - `MERGE_MAIN`, en `plugins/aether/lib/delegate-approve.js:20`, dice «ask the owner for the merge»;
  - `site/app.js:71` (`p.direct.a`) y el `alt` de `site/index.html:223` dicen «cinco llamadas a herramientas»;
  - #301 nombra `docs/guide/maintenance.md:62` y `docs/guide/troubleshooting.md:52` y `:182`.

## Criterios

- **C1. Suben los topes de turnos del Writer y del Examiner.** El Writer pasa de 60 a 100 y el Examiner de 40 a 80. Por qué: palabra 2.
- **C2. El Writer del plan recibe un mapa del código en una spec grande.** Cuando la spec aprobada tiene 15 requisitos o más, `/aether:design` produce antes del plan, sin escribir nada en el código, un mapa con el archivo y la línea donde se toca cada requisito, en el modelo más barato que la escalera permita. El Writer del plan lo recibe en su mensaje. En una spec más chica no hay mapa, y el diseño tarda lo mismo que hoy. Si el mapa falla, el plan se escribe como hoy, sin mapa. Por qué: palabra 2; fue lo que sacó adelante el plan de la 043.
- **C3. El plan y las tareas salen en dos llamadas del Writer.** Primero `plan.md` y después `tasks.md`, que se escribe leyendo el plan. `aether-plan check` corre sobre las tareas, con el mismo reintento de hoy, y el Judge revisa las dos juntas como hoy. Por qué: palabra 2.
- **C4. El Examiner que se queda sin turnos sigue solo.** Si el Examiner termina sin respuesta y dejó pruebas escritas, el flujo lo relanza una vez con esas pruebas, como ya hace cuando falla otro harness, para que escriba las que faltan. Solo si la segunda vez tampoco termina, el Lead recibe lo que existe, como hoy. Por qué: palabra 2; es la cuarta vez que pasa (#76, #229, #297, #303).
- **C5. El revisor puede decir «listo», y el Lead sabe qué hacer con cada veredicto.** Por qué: palabras 3 y 5.
  1. El texto del revisor final dice que `ready` es no tener ningún hallazgo crítico ni importante.
  2. Ese texto pone tope de 10 a los hallazgos menores.
  3. Cada hallazgo trae su arreglo en la respuesta.
  4. La regla del Lead dice qué hacer con cada veredicto, tanto del revisor final como del revisor de un delegado:
     - con `ready-with-fixes`, aprueba si ningún hallazgo es importante (o crítico) y, si alguno lo es, corrige con esos hallazgos;
     - aprobar un `not-ready` pide escribir el motivo.
- **C6. Lo que sigue siendo falso o engaña del #301.** Por qué: palabras 3 y 4.
  1. El sitio deja de describir el camino directo como «cinco llamadas a herramientas» y lo describe con la regla de tres ediciones o diez lecturas.
  2. El mensaje de rechazo de `merge-main` de `aether-delegate approve` no manda a preguntarle al dueño durante una corrida autónoma: dice que va a «Espera tu sí».
  3. Una prueba muestra si `aether-autonomy quota-brake` detiene las cadenas de delegados de una corrida retomada con `aether-autonomy continue`, y si no las detiene, se arregla.
  4. `docs/guide/maintenance.md` y `docs/guide/troubleshooting.md` dejan de decir lo que el código no hace: la limpieza con una corrida abierta, «unread quota above» y la recompilación sin `--only`.
- **C7. Un delegado de solo lectura que salió bien se cierra solo.** Cuando sus comprobaciones pasan, el sistema lo cierra como aprobado, y el aviso de Stop no lo cuenta como pendiente. El Lead usa `aether-delegate verdict` con él solo para devolverlo (`fix`) o declararlo `infeasible`, y solo antes del cierre. Una decisión nueva en `docs/decisions.md` reemplaza la frase de A85 sobre los veredictos para este caso y cita la palabra 3. Los delegados que editan no cambian. Por qué: palabras 3 y 5.
- **C8. Las ediciones de Haiku en Claude siguen sin revisor.** No se añade un revisor. El issue #196 se cierra con la palabra 3 y la evidencia de que `approve` corre las pruebas antes de fusionar. Por qué: palabras 3 y 5.
- **C9. Una lectura no es una instalación.** Un comando que solo lee y nombra una carpeta de skills personal no cuenta como `skill-install` ni va a la lista del dueño. Por ejemplo, un `find` sin acciones que escriban o borren, o el texto de un `gh issue` o `gh pr`. Una escritura en esas carpetas sigue contando, igual que hoy: copiar, enlazar, mover, `find -delete` o una redirección. La protección de los ajustes de Claude, que usa los mismos destinos, no se debilita. Por qué: palabra 3; en esta sesión el guard frenó dos lecturas (#315).
- **C10. Calidad.** `npm run check` pasa. Cada criterio tiene su prueba, y las reglas del Lead siguen cabiendo en las partes del arranque (#139). Por qué: la regla de la casa.

## Qué queda fuera

- **#196:** darle revisor a las ediciones de Haiku en Claude.
- **#301:** sus otros menores, que se cierran con su motivo.
- **#314:** el comportamiento del Lead con las skills; se diseña aparte con el dueño.
- **#195:** el par más barato que falla, que espera una idea del dueño.
- **#302:** Muse en el aviso de modelos nuevos.
- Subir la versión, publicar e instalar.
- Que la elección de pares aprenda del registro, y guardar qué se hizo con cada hallazgo importante (#206).

## Respuestas a preguntas

- **Las cifras de turnos (100 y 80) y el umbral de 15 requisitos** los fija el Lead, porque el dueño no dio números. Son datos reversibles.
- **¿Quién hace el mapa del código?** Cómo se produce lo decide el plan, con una condición: debe salir del modelo más barato que sirva y no puede escribir en el repositorio.
