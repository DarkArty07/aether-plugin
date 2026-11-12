# Spec 036: issues abiertos, tanda 8

- **Date:** 2026-11-12
- **Status:** Draft
- **Intent:** `specs/036-open-issues-8/intent.md` (tarjeta confirmada por el dueño; la evidencia de cada issue está copiada en `specs/036-open-issues-8/evidence/issue-NNN.md`).

## Criteria

Urgentes:

- C1 (#257): El enjambre no se traba por una nota del agente ops. Si el agente ops devuelve la línea JSON del bin y después agrega texto propio, el flujo lee esa línea JSON y la unidad sigue, en `run.workflow.js` y en `design.workflow.js`; una salida sin ninguna línea JSON se trata como hoy. «arreglas los urgentes unicamente d emanera autonome». Evidence: pruebas de los dos flujos con un agente ops simulado que agrega una nota antes y después de la línea JSON, y una prueba de la salida sin JSON.
- C2 (#255): Un commit sobre HEAD desacoplado no se pierde. Si un implementador de otro harness deja su trabajo en un commit sobre HEAD desacoplado, el resultado, la revisión y la fusión ven ese trabajo, o el intento se rechaza con un motivo claro que nombra la causa, nunca con una rama vacía; el resultado nombra la rama y su commit tal como están; y nada de lo que el sistema o las reglas del Lead ponen en el brief de un delegado de otro harness le pide `checkout --detach`. «arreglas los urgentes unicamente d emanera autonome». Evidence: una prueba sobre un repositorio desechable con un implementador simulado que commitea sobre HEAD desacoplado (por delante de la rama y fuera de ella), y una prueba que busca `checkout --detach` en los briefs y en las skills.
- C3 (#235): Refrescar las cifras no cambia, sin que nadie lo decida, qué par sirve cada escalón. El refresco de `config/pairs.json` deja una sola fecha para todas las filas con página en Artificial Analysis, y las filas estimadas (Muse Spark de `low` a `xhigh`) guardan su distancia con su referencia de Claude. «arreglas los urgentes unicamente d emanera autonome». Evidence: pruebas del refresco con páginas simuladas: una pasada deja una sola fecha; subir 0,3 puntos la referencia de Claude no saca ni mete a Muse Spark en ningún escalón.

No urgentes:

- C4 (#256, #236, #232): Menores diferidos. Cada hallazgo menor queda arreglado o se descarta en esta spec con su motivo; las dudas de #236 ya decididas no se reabren y las comprobaciones de #232 que solo valen en una sesión real quedan fuera. «los no urgentes que no necesitan de mi atenciones». Evidence: una prueba por hallazgo arreglado y la lista de descartes de esta spec.
- C5 (#215): Los textos de los agentes piden solo lo que alguien lee. «los no urgentes que no necesitan de mi atenciones». Evidence: pruebas sobre `agents/*.md` y los campos que los workflows leen.
- C6 (#209): El informe de una corrida dice en qué se fue el tiempo. «los no urgentes que no necesitan de mi atenciones». Evidence: una corrida con el flujo simulado y su informe con las duraciones.
- C7 (#224): Las propuestas de calibración se ven. «los no urgentes que no necesitan de mi atenciones». Evidence: pruebas del verbo nuevo y de la nota de arranque.
- C8 (#136): Una sola lista de harness. «los no urgentes que no necesitan de mi atenciones». Evidence: `tests/harness-lists.test.js` y las pruebas de los bins, con el comportamiento sin cambios.
- C9 (#203): Una sola preparación de datos y un solo almacén de marcas para elegir el par. «los no urgentes que no necesitan de mi atenciones». Evidence: pruebas de los tres que piden un par y de las marcas.
- C10 (#201): Dos procedimientos fijos son un comando. «los no urgentes que no necesitan de mi atenciones». Evidence: pruebas de cada comando sobre repositorios desechables y de las skills.

Para todo:

- C11: Probado sin gastar tokens. «todo d emanera autonoma y nada se publica sin su sí» (la tarjeta, sección 2). Evidence: `npm run check` pasa; ninguna prueba hace una llamada de pago.
- C12: El arranque no crece. Las partes de `skills/using-aether` están en su límite (#241). Evidence: `tests/session-start-parts.test.js` pasa y el tamaño de cada parte no es mayor que el de la base 0.41.0; donde un comando reemplaza prosa, la parte es menor.

## User scenarios

1. **Nota del ops (C1).** Dado un agente ops que contesta `{"accepted":true,...}` seguido de «(Note: the command output did not print an exit code)», cuando la escalera de una unidad lee esa respuesta, entonces toma la línea JSON y la unidad sigue sin quedar bloqueada.
2. **Sin JSON (C1).** Dado un agente ops que contesta solo texto, cuando el flujo lo lee, entonces el resultado es el mismo error de salida ilegible de hoy.
3. **HEAD desacoplado por delante (C2).** Dado un implementador de muse que commitea sobre HEAD desacoplado, descendiente de la rama de su unidad, cuando termina el intento, entonces la rama de la unidad apunta a ese commit, el revisor recibe un paquete con ese trabajo, `aether-wt merge` fusiona y el resultado nombra la rama y ese commit.
4. **HEAD desacoplado fuera de la rama (C2).** Dado un commit sobre HEAD desacoplado que no desciende de la rama de la unidad, cuando termina el intento, entonces el intento se rechaza con un motivo que nombra la causa, y ni el revisor ni la fusión reciben una rama vacía.
5. **Brief de otro harness (C2).** Dado un delegado que edita en otro harness, cuando se arma su brief, entonces no contiene `checkout --detach`.
6. **Refresco (C3).** Dadas páginas simuladas con la escala de Claude 0,3 puntos más arriba, cuando se corre el refresco, entonces todas las filas con página llevan la misma fecha y Muse Spark `high` sigue sirviendo el mismo escalón que antes.
7. **Propuestas de calibración (C7).** Dada una lectura de la observación con 22 propuestas, cuando arranca una sesión del Lead, entonces las notas de arranque dicen en una línea que hay 22 y nombran el comando; y cuando se corre el comando, muestra las propuestas y las fricciones sin cambiar la configuración.
8. **Freno de cuota (C10).** Dada una corrida del enjambre abierta y una pausa por cuota, cuando el Lead corre el comando del freno, entonces guarda cada corrida, registra `quota-saved` y, si toca, hace el push, en una sola llamada.
9. **Aprobar una edición (C10).** Dada una tarea que edita, cuando el Lead corre el comando de aprobar, entonces se da el veredicto, se fusiona y se corre la prueba en la rama; si la rama es `main` o `master` y no hay permiso, no fusiona.

## Requirements

- R1: Una respuesta del agente ops se lee tomando, desde la última línea hacia arriba, la primera que empieza con `{` y se parsea como un objeto JSON; el texto antes y después se ignora. Vale en `opsOnce` de `run.workflow.js` y en la lectura equivalente de `design.workflow.js`, y en las demás lecturas de una respuesta ops de esos dos flujos. Sirve a: C1
- R2: Una respuesta ops sin ninguna línea que sea un objeto JSON da el mismo error y el mismo mensaje de salida ilegible que hoy. Sirve a: C1
- R3: Las pruebas de los flujos (`run.workflow.js` y `design.workflow.js`) cubren una nota del agente ops antes y después de la línea JSON, y la salida sin JSON. Sirve a: C1, C11
- R4: Después de un intento de un implementador de otro harness, si HEAD del worktree está desacoplado, por delante de la rama de la unidad y la rama es su ancestro, la rama avanza a HEAD antes de que se arme el resultado, el paquete de revisión y la fusión. Sirve a: C2
- R5: Si HEAD está desacoplado y no desciende de la rama de la unidad, el intento se rechaza con un motivo que nombra la causa (el commit y la rama); nunca se entrega al revisor ni a la fusión una rama sin commits propios cuando el trabajo existe en otro sitio. Sirve a: C2
- R6: El resultado de una unidad de otro harness nombra su rama y el commit en que la rama está, no el HEAD del worktree. Sirve a: C2
- R7: Ningún brief de un delegado de otro harness lleva la orden `checkout --detach`: ni el texto que `lib/delegate-task.js` arma (hoy, la sección «Where your worktree starts», que también lee un par externo en un rescate), ni las skills y reglas del Lead. El delegado de Claude conserva la indicación de su base. Sirve a: C2
- R8: `aether-wt` y los flujos tienen pruebas sobre repositorios desechables para R4, R5, R6 y R7. Sirve a: C2, C11
- R9: El refresco de `config/pairs.json` lee y escribe, en una misma corrida, las cifras de todas las filas que tienen página en Artificial Analysis, y deja una sola fecha en esas filas. Sirve a: C3
- R10: Una fila estimada, sin página, guarda en la tabla su distancia con su fila de Claude de referencia, y su cifra se obtiene de la referencia más esa distancia; un movimiento parejo de la escala de Claude mueve la fila estimada igual y no cambia qué par sirve cada escalón. Sirve a: C3
- R11: El refresco sigue sin escribir la escalera: muestra la recalculada y no la guarda, y solo corre cuando el dueño lo pide. Sus pruebas usan páginas simuladas y no hacen ninguna llamada de red. Sirve a: C3, C11
- R12: Cada hallazgo menor de `evidence/issue-256.md`, `evidence/issue-236.md` y `evidence/issue-232.md` (excepto las dudas ya decididas de #236 y las comprobaciones de #232 que solo valen en una sesión real) queda arreglado con una prueba que falla sin el arreglo, o se descarta con su motivo (ya resuelto en 0.40 o 0.41, o ya no aplica). Sirve a: C4, C11
- R13: Los descartes de R12 se anotan en esta spec, un hallazgo por línea con su motivo, en el apartado «Descartes de C4» de Assumptions, que el Writer llena al escribir el plan. Sirve a: C4
- R14: Para cada uno de los puntos 1 a 5 de `evidence/issue-215.md` (calificar cada criterio en el supervisor, comparar el `Head`, la evidencia roja y verde del implementador, el arreglo de cada hallazgo del revisor, las rutas y la salida de `check` del Writer), la petición se quita del texto del agente o recibe un campo del esquema de respuesta que el workflow lee. Sirve a: C5
- R15: Las cifras sin fuente de los textos de los agentes y de `skills/tasks/SKILL.md` («10-100x», «about 2.5 times») se quitan o llevan su fuente. Sirve a: C5
- R16: Los presupuestos de turnos de `agents/judge.md`, `agents/reviewer.md` y `agents/implementer.md` se presentan como guía o se quitan, y ninguno contradice lo que `lib/seats.js` dice del límite por tiempo en otro harness. Sirve a: C5
- R17: Una prueba lee `agents/*.md` y los esquemas de los workflows y falla si un texto de agente pide una salida que ningún campo recibe, para los puntos de R14. Sirve a: C5, C11
- R18: El informe de una corrida registra y muestra la duración de cada pasada del gate, de las pruebas de cada fusión, de la línea base (`aether-plan compile`) y de las esperas, con la espera de cuota y la espera de una unidad trabada por separado. Sirve a: C6
- R19: El informe totaliza esas duraciones para que se vea cuánto del reloj no fue ningún modelo; una corrida sin esos datos (registros antiguos) se informa como hoy, sin error. Sirve a: C6, C11
- R20: `aether-observe` tiene un verbo nuevo que muestra la última lectura (`observe/read.json`): las propuestas de calibración y las fricciones, sin contenido de conversaciones. Sirve a: C7
- R21: Las notas de arranque (no las partes del arranque) dicen en una línea cuántas propuestas de calibración hay y nombran ese comando; sin lectura o sin propuestas no dicen nada. Sirve a: C7, C12
- R22: La calibración sigue sin cambiar la configuración por su cuenta, y ver las propuestas no escribe nada. Sirve a: C7
- R23: Los nombres de los harness y su orden viven en un solo módulo de `lib/`. Las cinco listas fijas (`EXTERNAL`, `RENEWABLE`, `DELEGATE_HARNESSES`, `HARNESSES`, `ALLOWED_HARNESSES`), las líneas de uso y los mensajes de error de `aether-delegate renew` y de `renewReading` la leen de ahí. Sirve a: C8
- R24: Las pruebas toman la lista de ese módulo en lugar de repetirla, y `tests/harness-lists.test.js` sigue como guardián de que nadie la escribe a mano; el comportamiento (nombres, orden, mensajes) no cambia. Sirve a: C8, C11
- R25: Una sola función de `lib/` prepara los datos que van a `choose` de `lib/superdelegation.js` para los delegados, el enjambre y los asientos de diseño; `viewOf`, `harnessView` y la envoltura de `lib/seats.js` la usan. La elección de par no cambia. Sirve a: C9
- R26: Las marcas de par viven en un solo almacén. Cada marca que existe en `lanes/marks/` o en `router/lanes/marks/` se sigue leyendo o se migra, y ninguna se pierde ni cambia de efecto. Sirve a: C9
- R27: Las reglas del Lead dicen que leer la cuota de Muse gasta una llamada real. Sirve a: C9, C12
- R28: Un comando de un bin que ya existe hace el freno de cuota: para lo que corre, guarda cada corrida del enjambre (`aether-wt save`), registra `quota-saved` y, si toca, hace el push con su permiso. Sirve a: C10
- R29: Un comando de un bin que ya existe aprueba una edición: da el veredicto, fusiona y corre la prueba en la rama; cuando la rama es `main` o `master` comprueba el permiso (`aether-autonomy check merge-main`) y nunca fusiona sin él. Sirve a: C10
- R30: Las skills nombran cada comando en lugar de contar sus pasos; los demás procedimientos de #201 (el «sí» con el guard en `enforce`, la frase de gasto del cierre, `aether-autonomy status`, el lanzamiento del diseño) no cambian. Sirve a: C10, C12
- R31: Las pruebas de R1 a R30 corren en `npm test` o en el mod sin gastar tokens, y `npm run check` pasa. Sirve a: C11
- R32: Ninguna parte de `skills/using-aether` crece respecto de la base 0.41.0 y todas siguen dentro de 9.800 caracteres; las partes que un comando reemplaza (R28, R29) y las líneas que R27 agrega quedan, en suma, más cortas. Sirve a: C12

## Proposals

None.

## Assumptions

- #257: la lectura que busca la última línea JSON vale también para las otras lecturas de una respuesta ops de los dos flujos (`paused`, `tick`), no solo para `opsOnce`; es el mismo defecto. Reversible: limitar R1 a `opsOnce` y su copia.
- #255: si HEAD está desacoplado y por delante de la rama, la rama avanza a HEAD; si HEAD no desciende de la rama, se rechaza el intento con su motivo (supuesto del Lead). La línea `checkout --detach` sale de `startSection` en `lib/delegate-task.js`, que se agrega al prompt de la llamada (`claudePrompt`), el mismo que lee un par externo en un rescate; el delegado de Claude necesita esa línea y la conserva. Reversible.
- #235: una sola fecha para las filas con página y distancia guardada para las estimadas (supuesto del Lead). Reversible. La advertencia del resumen del refresco de que las otras filas conservan su fecha anterior deja de decirse, porque ya no es cierta.
- #224: el comando es un verbo nuevo de `aether-observe`, y el aviso va en las notas de arranque (supuesto del Lead). Reversible.
- #203: el almacén de marcas que queda lo elige el Writer en el plan; las marcas del otro se migran o se siguen leyendo hasta que caduquen (supuesto del Lead). Reversible.
- #201: el comando de aprobar una edición nunca fusiona en `main` o `master` sin el permiso de `aether-autonomy check merge-main` (supuesto del Lead). Reversible.
- #232, #236 y #256: los hallazgos que hoy ya no aplican se descartan en esta spec; los que son una duda decidida por el dueño o por el Lead no se reabren. Reversible: cualquiera de los descartes puede volver a ser un arreglo.
- #209: las duraciones se guardan en el registro de la corrida que ya existe y el informe las suma por clase; el formato es del plan. Reversible.
- Descartes de C4: se llena en la ronda del plan, un hallazgo por línea con su motivo (R13).

## Irreversible actions

None. La corrida no publica una versión, no fusiona a `main` y no hace push; esas acciones esperan el sí del dueño (tarjeta, sección 4). Las pruebas no hacen llamadas de pago.

## Out of scope

- Los issues que el dueño tiene que decidir (#193, #195, #196, #197, #210, #212, #213, #223, #234, #1, #103, #202, #220, #222, #226, #132, #262) y los que solo registran datos (#147, #207, #211, #216, #218, #219, #225).
- Cambiar la escalera, sus escalones o la regla de repetición.
- Leer de verdad las páginas de Artificial Analysis o hacer cualquier llamada de pago.
- Las comprobaciones de #232 que solo se pueden hacer en una sesión real, y las dudas de #236 ya decididas.
- Las demás secuencias de #201 fuera del freno de cuota y de aprobar una edición.
- Publicar una versión, fusionar a `main` o hacer push.
