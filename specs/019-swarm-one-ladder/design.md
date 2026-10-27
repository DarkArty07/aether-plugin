# Diseño corto: una sola escalera para los delegados y el swarm, y todo arranca en Haiku (issue #102)

Toca la arquitectura central del swarm (cómo arranca una unidad, quién la sube de esfuerzo, de modelo o la bloquea, y qué evidencia ve el supervisor). Sustituye la escalera propia del swarm por la de los delegados (`lib/ladder.js`, `config/ladder.json`), pone una revisión automática antes de cada supervisor y cambia la señal que decide cuándo la revisión final sube a Opus.

## Lo que pidió el dueño

- «Necesito que todo arranque en haiku por costo. 37 tareas a sonnet son mucho costo. Que todo arranque en haiku.» y «crei que la regla barato primero ya habia quedado entendida aqui tambien» (2026-10-26, issue #102).
- «Podemos hacer una ladder en lugqar de dos. Es decir ancalarnos de la ladder que existe para no tener que maneter otra funcion y hacer mas simple el codigo sin perder funcionlidad» (2026-10-27).
- «Como podriamos cambiar el del swarm para seugir la filosofia barato primeor. Y un modelo barato se hace bueno gracias a un buen supervisor» (2026-10-27).
- «hay que trbajar en un worktree y corremos una prueba de impelmetnaicon con swarm con sueprdelegation off para que consuma solamente la cutoa d eclaude [...] si empezamos con el modelo barato ahrora tiempo y dinero ahciendo la misma tarea» (2026-10-27): la prueba se hizo.
- «No veo una perdida de calidad muy considerable y si veo ahorro en dineor, esto no se va a beneficiar pro tareas cortas si no por tareas largas de muchos implementers. A mi parecer el cambio esta jsutificado. Como hariamos el cmabio?» (2026-10-27).
- «Analiza los alcances diseña y entregame el diseño que es lo que aprobamos y como comepsamos el modelo barato apra aumentar la calidad» (2026-10-27).

## Lo medido

**El historial** (`runs.jsonl`, las 8 ejecuciones del swarm anteriores: 104 tareas, US$ 166.87 de Claude a precio de lista, US$ 1.60 por tarea, 6.0 minutos por tarea). El gasto fuera del Lead se reparte así (`docs/guide/models-by-role.md`): implementadores 43 %, supervisores 30 %, revisión final 19 %, Examiner 6 %.

**El experimento limpio del 2026-10-27** (un juego de serpiente en Three.js, 10 tareas con sus pruebas completas, el mismo punto de partida, `superdelegation` apagado para que corriera solo Claude, una ejecución por modo; la solución se juzgó con 17 pruebas de aceptación que el swarm no veía, validadas antes con una solución de referencia). Los archivos están en `.worktrees/exp-snake/evidence/`.

- Mezcla de modelos como la habría puesto el Escritor (6 tareas en Haiku, 4 en Sonnet): US$ 3.60 de Claude, 7.6 minutos.
- Todo en Haiku: US$ 2.96 de Claude (−18 %), 10.2 minutos (+34 %).
- Las dos: 10 de 10 unidades unidas al primer intento, ninguna subida de esfuerzo ni de modelo, 17 de 17 pruebas de aceptación. Hallazgos de la revisión final: 0 críticos, 2 importantes y 19 menores en la mezcla; 0, 3 y 15 en Haiku. Los supervisores no encontraron ningún importante en ninguna.
- Dónde está el dinero: implementadores US$ 0.62 → 0.14 (−77 %); supervisores 0.61 → 0.59 (diez rondas, unos US$ 0.06 cada una); revisión final en Opus `high` 2.04 → 2.05 (idéntica); el Lead 0.33 → 0.19. En una ejecución pequeña el gasto fijo (revisión final y supervisores) es el 57 % al 69 % de la factura, por eso el ahorro total es chico.
- Dónde se pierde el tiempo: en las 4 tareas de integración (máquina de estados, escena, sincronización de mallas, cableado) Sonnet tardó 183 s y costó US$ 0.57, y Haiku tardó 359 s y costó US$ 0.08. Haiku es más rápido por token (223 contra 137 tokens por segundo) pero escribió de 2 a 3 veces más (34 mil contra 12 mil tokens en la máquina de estados), y esas tareas están en el camino crítico.
- No se ejercitó la escalera: ninguna tarea necesitó una corrección. Durante las ejecuciones no se abrió el juego en un navegador; después se abrieron los dos en un Chromium real y cargan sin errores de consola y se pueden jugar.

**La ejecución de la spec 017** (49 tareas, todas en Haiku, pero ejecutadas por otros planes, no por Claude Haiku): 39 de 49 al primer intento, ninguna subida de modelo, 6.7 horas. No sirve para medir el modelo, solo prueba que el arranque barato no rompió el trabajo.

## Hoy: cómo decide el swarm

- El Escritor pone a cada tarea un `Tier` (haiku, sonnet u opus) y un esfuerzo, y una línea `Ladder: haiku 2, sonnet 2, opus 1` por plan. El script (`run.workflow.js`: `let model = task.tier`, `nextTier`, `effortFor`, `ladderOutlook`) arranca ahí.
- Tras cada intento, un supervisor dictamina `approve`, `retry`, `escalate` o `block`. El script sube de modelo cuando se acaban los intentos de ese modelo o cuando el supervisor dice `escalate`; los mismos hallazgos tres veces bloquean la unidad.
- Los delegados usan otra política (`lib/ladder.js`): arrancan en Haiku, 5 correcciones en Haiku, 2 en Sonnet, 1 en Opus, los mismos hallazgos dos veces suben, y un veredicto sin hallazgos concretos (archivo y qué falta) se rechaza.
- El supervisor del swarm no puede ejecutar nada: recibe commits, resumen y diff, y las pruebas solo corren al unir, después de aprobar.
- La revisión final sube a Opus `xhigh` cuando una unidad unida es `Tier: opus`.

## Por qué: cómo se hace bueno el modelo barato

Un modelo barato acierta cuando el trabajo está bien acotado y cuando cada error se detecta pronto y con precisión. No se compensa con un modelo más caro de arranque, sino con estas piezas, y el diseño le da a cada una un dueño:

1. **Un encargo que se puede verificar.** La tarea trae interfaces exactas y sus pruebas completas, y Haiku las convirtió en código al primer intento en las 10 unidades del experimento. El Escritor las sigue escribiendo, y su regla pasa a ser: una tarea es un módulo y una sola preocupación; si no se puede fijar con pruebas, se divide. (Ya existe; cambia la guía.)
2. **Pruebas primero.** El implementador ve rojo y luego verde. (Ya existe.)
3. **Una puerta automática antes del supervisor.** Después de cada intento, el sistema corre las pruebas y comprueba que no se tocó nada fuera de `Owns`, sin gastar un modelo. Si falla, el intento vuelve al implementador con la salida del fallo y no se gasta una ronda de supervisor. Si pasa, el supervisor recibe esa evidencia en vez de confiar en el informe. (Nuevo en el swarm; lo hacen los delegados.)
4. **Un supervisor fuerte y distinto del autor, con hallazgos concretos.** Cada hallazgo dice archivo, línea y qué falta; el supervisor mantiene la memoria de las decisiones del área. (El supervisor ya existe; el formato de hallazgo se vuelve obligatorio.)
5. **La corrección conserva lo hecho.** Una corrección vuelve al mismo modelo con su trabajo y los hallazgos, y en Haiku el reintento sube de esfuerzo `high` a `xhigh`. (Ya existe en los dos caminos.)
6. **Subir solo con evidencia.** El modelo sube cuando se agotan las correcciones de ese peldaño, cuando vuelven los mismos hallazgos dos veces, o cuando el supervisor declara la tarea inviable con una razón. Antes, el swarm subía por contar intentos y bloqueaba a la tercera repetición. (Pasa a la política de los delegados.)
7. **El riesgo se marca, no se adivina.** El Escritor pone `Review: xhigh` o `max` en las unidades donde un error llegaría a datos, seguridad o concurrencia; esa unidad tiene un supervisor más fuerte y sube la revisión final. Reemplaza la señal `Tier: opus`.
8. **La red final.** La revisión final de todo lo unido y el examen oculto del Examiner. (Ya existen.)
9. **Medir para poder deshacer.** El informe cuenta, por ejecución, las unidades aprobadas al primer intento, las correcciones, las subidas y su causa, y los rechazos de la puerta.

## Decisiones

**D1. Toda unidad arranca en el primer peldaño de `config/ladder.json`** (hoy Haiku `high`). El plan no elige modelo ni esfuerzo de arranque.

**D2. Una sola política.** El swarm usa `lib/ladder.js`. Se borran del script `nextTier`, `effortFor`, `ladderOutlook`, los contadores `used` y la regla de las tres repeticiones; los números (5, 2 y 1 correcciones, esfuerzos, dos repeticiones) siguen en `config/ladder.json` y se ajustan en un solo lugar.

**D3. Un verbo nuevo de `aether-wt`, `aether-wt ladder <run> <task>`.** Sin más argumentos devuelve el peldaño actual de la unidad (modelo y esfuerzo) y crea su estado en el primer peldaño. Con `--verdict approve|fix|infeasible --payload <runDir>/ladder/<task>-verdict.json --digest <sha256>` aplica `judge` de `lib/ladder.js`, guarda el estado en `<runDir>/ladder/<task>.json` y devuelve el siguiente paso (`step`, `kind`, `cause`, `effort`, `carry`). El estado vive en el disco del run, así que un relanzamiento o una reanudación lo recuperan. Los hallazgos (`archivo[:línea]: qué falta`) y la razón son texto libre, y la línea de comandos del mod solo admite fichas de `[A-Za-z0-9._:=@/,-]+`, sin comillas ni espacios; por eso el veredicto viaja como un archivo de carga, igual que los avisos de `aether-lane`: el script lo escribe en una ruta cerrada bajo el directorio del run, `<runDir>/ladder/<task>-verdict.json` (se añade una alternativa a `PAYLOAD_PATH` en `hooks/ops-command.mjs`, que no admite ninguna otra ruta), y la línea lleva solo fichas fijas, la ruta y el `--digest` del archivo, que el verbo comprueba antes de leerlo. El mod deja pasar el verbo sin modelo, como ya hace con `aether-wt` y `aether-lane`: se añade su forma exacta a `hooks/ops-command.mjs`, con sus pruebas.

**D4. El supervisor se traduce a la escalera.** `approve` es `approve`; `retry` es `fix` con sus hallazgos; `escalate` es `infeasible` con el `ruling` como razón; `block` termina la unidad y queda fuera de la escalera, como hoy. El esquema del supervisor exige `file` y `what` en cada hallazgo de un `retry`; si un `retry` llega sin ellos, el script pone la primera ruta de `Owns` y el `ruling`, lo cuenta en el informe y no se detiene. Un fallo de unión sigue reintentándose una vez fuera de la escalera, y un par que falla al arrancar se reemplaza sin gastar una corrección. Los resultados que no llegan a un veredicto también tienen destino, porque `lib/ladder.js` solo avanza con `judge` y los contadores `used` ya no existen: un implementador que falla o se abandona, o un carril que falla fuera de `Owns`, es un `fix` con un hallazgo sintético (`<primera ruta de Owns>: el intento no terminó (<causa>)`, o `<ruta tocada>: fuera de Owns`) y gasta una corrección; un fallo del agente supervisor se reintenta fuera de la escalera hasta dos veces y, si persiste, la unidad se bloquea con esa causa; una respuesta de `judge` con `accepted:false` (veredicto sin hallazgos concretos) se trata como fallo del supervisor, porque el relleno de arriba ya vuelve concretos los hallazgos de un `retry`; y `kind: exhausted` bloquea la unidad con la causa de la escalera. Ninguno de esos caminos puede repetirse sin fin: o gasta una corrección o tiene su propio tope.

**D5. La puerta automática, `aether-wt gate <run> <task>`.** Corre en el worktree de la unidad, sin modelo, y el script la envía con `long: true` (el límite del mod es de 600 s, `OPS_TIMEOUT_MS`): (a) los archivos cambiados contra `Owns`, con el código de `lib/delegate-checks.js`; (b) el comando de pruebas del plan, con la línea base del run (un fallo conocido no bloquea). Devuelve `{pass, findings}`. Si falla, el script la trata como un veredicto `fix` con esos hallazgos (`archivo: qué falló`; para pruebas, la ruta del archivo de prueba que falla y su nombre, y si no se puede leer, `npm test: salió con N` con el final de la salida), relanza al implementador sin llamar al supervisor y gasta una corrección. Si pasa, el supervisor recibe `Checks: pass` y el resumen de las pruebas como evidencia, y su prompt deja de decir que no puede confiar en las pruebas. Una puerta cortada a los 600 s cuenta como un fallo de la puerta: es un `fix` con el hallazgo `npm test: superó el tiempo límite` y gasta una corrección, como cualquier otro fallo. La puerta corre también sobre un intento rescatado sin informe.

**D6. El plan deja de elegir modelo.** `aether-plan check` y `compile` leen pero ignoran `Tier` y `Ladder`, con una advertencia («ignorado: el swarm arranca todas las tareas en Haiku y usa la escalera de los delegados»), para que los planes existentes sigan siendo válidos. La salida del compilador deja de llevar `tier`, `effort` y `ladder`. Se conservan `Review`, `Max agents` y `Test command`.

**D7. La revisión final cambia de señal.** Opus `xhigh` cuando alguna unidad unida tiene `Review: xhigh` o `max` (antes: `Tier: opus`); Sonnet `high` en una ejecución de hasta tres unidades que piden todas `Review: high` (antes: de hasta tres tareas Haiku); Opus `high` en el resto y en un relanzamiento, como hoy.

**D8. El Escritor.** La habilidad `aether:tasks` y su gemela de Spec Kit dejan de pedir `Tier` y `Ladder`; piden `Review` donde un error llegaría a datos, seguridad o concurrencia, una tarea por módulo y una sola preocupación, y siguen pidiendo interfaces exactas y pruebas completas. `Max agents` sigue siendo el presupuesto total de agentes.

**D9. El informe.** `aether-report` cuenta por unidad los peldaños recorridos, las correcciones, las subidas por causa (correcciones agotadas, hallazgos repetidos, inviable), los rechazos de la puerta y los `retry` sin hallazgo con archivo. Lo viejo de `runs.jsonl` sigue siendo legible.

**D10. Documentación.** Las guías (`models-by-role`, `delegates`), `components.md`, las habilidades `swarm` y `using-aether`, la decisión A97 y el historial de cambios dicen la regla nueva, y el issue #102 se cierra.

## Archivos

- **Script y comandos:** `plugins/aether/workflows/run.workflow.js` (1 666 líneas, 34 referencias a tier o ladder), `lib/worktrees.js` y `bin/aether-wt` (los verbos `ladder` y `gate`), `lib/delegate-checks.js` (se comparte, no se copia), `lib/plan.js`, `lib/plan-compile.js`, `lib/report.js`, `hooks/ops-command.mjs` con sus pruebas del mod.
- **Agentes y habilidades:** `agents/supervisor.md`, `agents/implementer.md`, `agents/writer.md`, `skills/tasks`, `skills/swarm`, `skills/using-aether`, `speckit/commands/speckit.tasks.md`.
- **Pruebas que cambian:** las de `workflow*` (siete archivos), `aether-plan`, `plan`, `plan-fixtures`, `aether-report`, `report`, `speckit`, `ops-command-lanes`, las de documentación que fijan la regla, y pruebas nuevas de los dos verbos, de la puerta y de la señal `Review`.
- **No se toca:** `lib/ladder.js` ni `config/ladder.json` (se usan tal cual), el enrutador de pares y los lanes, el modelo ni el esfuerzo del supervisor, la política de la revisión final fuera de su señal, las fusiones una por una ni el presupuesto de agentes.

## Pruebas

- **De unidad:** `aether-wt ladder` (arranque, fix, repetidos, agotadas, inviable, sin estado previo, estado que persiste); `aether-wt gate` (cambio fuera de `Owns`, prueba que falla, fallo conocido de la línea base, éxito); la forma exacta de los dos verbos en `ops-command` y en las pruebas del mod (`npm run test:mod`), incluida una línea malformada que debe rechazarse.
- **Del script, con agentes simulados:** toda unidad arranca en Haiku aunque el plan diga otra cosa; un `retry` con hallazgos sube el esfuerzo de Haiku y no el modelo; los mismos hallazgos dos veces suben a Sonnet; una puerta que falla no llama al supervisor y gasta una corrección; una puerta que pasa sí lo llama y le pasa la evidencia; `escalate` sin razón se corrige; cada resultado sin veredicto de D4 (implementador fallido o abandonado, carril fuera de `Owns`, fallo del supervisor, `accepted:false`, `exhausted`) y una puerta cortada por el límite de tiempo; `Review: xhigh` sube la revisión final.
- **Del examen oculto de la función:** el Examiner escribe pruebas de aceptación de los criterios.
- **De regresión en vivo:** se repite el juego de la serpiente con el swarm nuevo (el plan de `.worktrees/exp-snake/evidence/`, solo Claude) y se compara con las dos ejecuciones del 2026-10-27: debe pasar las 17 pruebas de aceptación, costar como máximo US$ 3.24 de Claude (la mezcla del experimento, 3.60, menos un 10 %) y no tardar más de 12 minutos (el tiempo de Haiku en el experimento, 10.2, más un 15 %). Los dos techos se fijan aquí, antes de correr.

## Riesgos

1. **La puerta corre todo el comando de pruebas en cada intento.** En un proyecto con un conjunto largo de pruebas duplica el costo de tiempo del intento. Se acepta para la primera versión; si aparece, el siguiente paso es un comando de pruebas por tarea.
2. **Haiku más lento en tareas de integración**, medido en el experimento (+34 % de tiempo en una ejecución chica). Este diseño no lo ataca; se mide en cada ejecución con el informe nuevo.
3. **El mod admite una línea más.** Hay que cuidar que la forma de `aether-wt ladder` solo admita fichas fijas y la ruta cerrada del archivo de carga, y que los hallazgos y la razón pasen como datos en ese archivo, nunca en la línea de comandos.
4. **El estado de la escalera en disco.** Un relanzamiento con `--only` no debe reiniciarlo; no hay ningún modo de reiniciar la escalera de una unidad salvo borrar el estado del run.
5. **Un `retry` sin archivo.** Se corrige con el relleno de D4, pero si pasa mucho, el supervisor necesita un prompt mejor; el informe lo cuenta.
6. **Los planes en curso o archivados con `Tier`.** Se ignoran con una advertencia; si alguien quería Sonnet de arranque en una tarea, ya no lo consigue en la primera versión.
7. **Cinco correcciones de Haiku por tarea** cuestan hasta cinco rondas de supervisor. Hoy una ronda cuesta unos US$ 0.06; la regla de dos repeticiones corta antes. El número queda en `config/ladder.json`.

## El ahorro esperado

- **Medido:** −77 % en el gasto de los implementadores y −18 % en la factura total de una ejecución de 10 tareas pequeñas, con el mismo resultado en las pruebas de aceptación.
- **Proyectado, no medido:** el ahorro crece con la parte de la factura que son implementadores. En las 8 ejecuciones del historial eran el 43 %; si ese gasto bajara como en el experimento, la factura bajaría cerca de un 33 % (43 % × 77 %). No se afirma hasta medirlo en una ejecución larga.
- **En tiempo no hay ahorro medido:** hubo +34 % en la ejecución pequeña, por las tareas de integración en el camino crítico.

## Cuándo se deshace

- Más de la mitad de las tareas salen de Haiku en una ejecución.
- Los hallazgos importantes de la revisión final o del examen, por tarea, superan en más de un 50 % el promedio del historial (0.15 por tarea en la revisión final) en dos ejecuciones seguidas.
- El tiempo por tarea sube más de un 50 % respecto del historial en dos ejecuciones seguidas sin que el costo por tarea de Claude baje al menos un 15 %.

Para deshacerlo basta devolver `lib/plan-compile.js`, `lib/plan.js`, las habilidades del Escritor (D8) y el script a su versión anterior (los planes nuevos no llevan `Tier`, y el `lib/plan.js` viejo los rechaza con `missing Tier`); la escalera de los delegados no cambia.

## Supuestos (reversibles)

1. Cinco correcciones de Haiku en el swarm, como en los delegados.
2. Un fallo de la puerta gasta una corrección y no llama al supervisor.
3. Los planes con `Tier` y `Ladder` se ignoran con una advertencia, no se rechazan.
4. El supervisor sigue fuerte (Sonnet `high`, o el par que le alcance) y la revisión final no cambia salvo por su señal.
5. No hay una anulación por tarea para arrancar en un modelo más alto: el riesgo se cubre con `Review`.
6. La puerta usa el comando de pruebas del plan entero.

## Fuera

Bajar la revisión final a Sonnet, un comando de pruebas por tarea, atacar la lentitud de Haiku en integración, el modelo del supervisor, y un paralelismo distinto: cada uno es un cambio aparte que se decide con medidas.
