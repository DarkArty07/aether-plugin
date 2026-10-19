# Muse Code como harness de Aether (0.13.0)

- Date: 2026-10-19
- Status: Draft
- Intent: [intent.md](intent.md), la tarjeta que el dueño confirmó el 2026-10-19 con «necesito que lo planees y lo impeolmentes neceistamos usar muse code trbaja autonomamente». Lo medido en la sesión está en [evidence/README.md](evidence/README.md) y no es parte de los criterios.

## Criteria

- **C1. Muse Code es un harness más de Aether.** «la siguiente update se viene algo grande. va a ser la 0.13.0 y vamos a incluir un nuevo harness, vamos a incluir a muse code». Evidence: una prueba muestra que `muse` se acepta en la opción `harnesses` junto a agy, codex, grok y cursor, y que el plugin dice si está instalado y su versión (con una `muse` simulada que contesta `--version`).
- **C2. Las llamadas que le tocan corren en Muse y vuelven como las de los otros harness.** «neceistamos usar muse code»; «vamos a incluir un nuevo harness». Evidence: con una `muse` simulada, una unidad que el orden de cuota manda a Muse corre `muse exec` en su propio worktree y devuelve una respuesta limpia o la razón del fallo, más el uso; con una unidad que pide salida estructurada, devuelve el objeto pedido.
- **C3. Siempre con fallback hacia nosotros.** «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño». Evidence: una prueba por cada forma de falla (no instalado, sin sesión, cuota agotada, sandbox que no arranca, tiempo vencido, salida ilegible, modelo que la cuenta no da) termina con la llamada corriendo en el agente nativo y sin ninguna pregunta al dueño.
- **C4. Muse entra en el orden de cuota.** «vamos a incluir un nuevo harness» (como los otros: el swarm le manda unidades mientras su cuota dure, RADAR, Delegación). Evidence: con lecturas simuladas de la ventana de 5 h y la semanal de Muse, el orden lo sitúa con la misma regla y la misma reserva que a los otros harness; un rechazo por cuota deja una marca que una lectura sana levanta.
- **C5. El dueño ve a Muse donde ve a los otros harness.** «vamos a incluir un nuevo harness, vamos a incluir a muse code». Evidence: `aether-lane quota`, el panel `/harnesses`, el índice de modelos (con precio y perfil por modelo), las opciones, la documentación y la web muestran a Muse, y una prueba falla si una lista fija de harnesses del repositorio no lo nombra sin una excepción con motivo.
- **C6. Los modelos de Muse entran por las reglas de siempre.** «vamos a incluir un nuevo harness» a un sistema que ya tiene las tres reglas del índice de modelos. Evidence: la prueba del índice de modelos (que hoy no lee `config/lanes.json`) cruza la tabla de lanes con `harness-models.json` y `profiles.json` y comprueba, por cada modelo de Muse de la tabla, que la CLI lo lista, que es la generación más nueva de su línea y que tiene su perfil; el nivel de Claude que sustituye viene de una medición, o el modelo no entra.
- **C7. Se prueba con Muse de verdad, y lo hace el Lead.** «neceistamos usar muse code»; «necesito que que el el lead lo haga, si me va estar pidiendo que haga cosas se pierde la autonomia»; «apruebo los gastos de prueba, usa las sesiones reales» (esto último solo dice qué espera de una verificación y no autoriza gasto en esta sesión). Evidence: queda constancia en `evidence/` de al menos una llamada real a Muse hecha a través de Aether que vuelve limpia, de lo que gastó de la cuota y de la forma real de lo que Muse devolvió; las pruebas del adaptador usan esa forma.
- **C8. La 0.13.0 queda lista para publicar.** «va a ser la 0.13.0»; «trbaja autonomamente». Evidence: el manifiesto, el README, el changelog, el handoff, las decisiones y las pruebas dicen 0.13.0 y `npm run check` pasa; ningún merge a `main`, push, tag ni `claude plugin update` ocurrió.
- **C9. Lo que Muse trae de más queda anotado, no construido.** «necesito que lo planees y lo impeolmentes» (se hace lo pedido y se dice lo demás). Evidence: `## Proposals` de este spec y del plan listan cada oportunidad hallada, y ningún archivo del plugin las construye.

## User scenarios

1. **Elegir Muse.** Dado un dueño que pone `harnesses` en `agy,muse`, cuando arranca una sesión con lanes, entonces `muse` es un harness habilitado detrás de agy, se muestra con su versión instalada, y un nombre desconocido en la lista sigue descartándose.
2. **Una unidad corre en Muse.** Dados Muse instalado, con sesión y cuota sobre la reserva, y un modelo de Muse en la tabla que sirve el nivel de la unidad, cuando el orden de cuota manda la unidad a Muse, entonces `muse exec` corre sin interfaz en el worktree de la unidad y vuelve una respuesta limpia con el uso.
3. **Salida estructurada.** Dada una unidad que pide un objeto con campos requeridos, cuando Muse responde con ese objeto, entonces la respuesta es limpia y trae el objeto; cuando responde sin un campo requerido o con texto que no es el objeto, entonces no es limpia y la razón lo dice.
4. **Muse no está instalado.** Dado el harness habilitado y ningún `muse` en el `PATH`, cuando el orden ordena, entonces Muse queda fuera del orden con la razón «no instalado» y la unidad corre en el agente nativo, sin pregunta.
5. **Sin sesión.** Dado `muse` instalado sin inicio de sesión, cuando la llamada falla con `authRequired`, entonces la unidad corre en el agente nativo, no se inicia ningún flujo de inicio de sesión y no se espera ninguna respuesta del dueño.
6. **Cuota agotada.** Dada una llamada a Muse que termina con un fallo de cuota (`quota` presente en el fallo), cuando la llamada vuelve, entonces el grupo de Muse queda marcado, la unidad corre en el agente nativo sin gastar un intento de la escalera, y una lectura sana más reciente levanta la marca.
7. **Lectura de cuota.** Dada una lectura de Muse con 72 % usado en la ventana de 5 h y 40 % en la semanal, cuando se corre `aether-lane quota`, entonces Muse sale con el saldo de cada ventana y la hora de reinicio, como los otros harness; con una lectura ilegible, sale desconocido y no se rompe.
8. **El sandbox no arranca.** Dado WSL u otro entorno en que el sandbox de Muse falla con `environmentError`, cuando la llamada falla así, entonces esa llamada corre en el agente nativo, sin marca en disco, y Aether no repite la llamada con el sandbox apagado.
9. **Un modelo que la cuenta no da.** Dado `muse-wonder-full-1.0` en la tabla y una cuenta cuyo plan no lo da, cuando Muse lo rechaza, entonces esa llamada corre en el agente nativo y el rechazo queda en el registro de la lane.
10. **Tiempo vencido y tope de pasos.** Dada una llamada que pasa del tiempo límite de la lane o llega al tope de pasos del modelo (`stepLimit`), cuando vence, entonces el proceso y sus hijos terminan, la respuesta no es limpia con la razón, y la unidad corre en el agente nativo.
11. **Privacidad.** Dada cualquier llamada de Aether a Muse, cuando se arma su línea de órdenes, entonces el modo contributor va apagado, no se cargan reglas, skills ni memorias personales de otras herramientas, el modelo no es uno `-contributor`, y no hay `--yolo`.
12. **Modelo sin medida.** Dado un modelo de Muse listado por la CLI para el que no hay medición de Artificial Analysis, cuando se arma la tabla de lanes, entonces el modelo no entra; con ningún modelo en la tabla, Muse sigue siendo un harness registrado, visible y con cuota leída, y el script de prueba real puede llamarlo dándole el modelo explícito.
13. **Ver a Muse.** Dado Muse habilitado, cuando el dueño abre `/harnesses`, corre `aether-lane quota`, lee las opciones o abre la documentación y la web, entonces ve a Muse con el mismo trato que a cada harness.
14. **La prueba real.** Dada la concesión `paid-call` vigente, cuando el Lead corre la llamada real a través de Aether, entonces la constancia registra que la respuesta volvió limpia, la cuota antes y después, la forma real del uso y del fallo, y el adaptador y sus pruebas siguen esa forma; sin la concesión, el comando exacto va a «Espera tu sí» y el resto del trabajo sigue.
15. **Lista para publicar.** Dado el trabajo terminado, cuando se corre `npm run check`, entonces pasa y todos los lugares de la versión dicen 0.13.0, y el informe deja para el dueño el merge, el push, el tag y `claude plugin update`.

## Requirements

El harness:
- R1. `muse` es un nombre válido de la opción `harnesses`, en el mismo trato que agy, codex, grok y cursor: se respeta el orden de la lista, se descartan duplicados y nombres desconocidos, y sin lista válida el estándar no cambia. Sirve a: C1.
- R2. El plugin sabe si `muse` está instalado y su versión, y lo muestra donde muestra el de los otros harness. Sirve a: C1.

La llamada:
- R3. Una unidad que el orden de cuota manda a Muse corre `muse exec` sin interfaz y sin aprobaciones interactivas, con el worktree de la unidad como workspace, con el prompt de la unidad y con el modelo y el esfuerzo que la tabla de lanes da a ese nivel. Sirve a: C2.
- R4. La respuesta vuelve con la misma forma que la de los otros harness: limpia o no, la razón, el objeto estructurado si se pidió, y el uso. Es limpia solo si el turno terminó completo y el texto final no está vacío; un turno fallido, cancelado, con tope de pasos o con salida distinta de 0 no es limpio y su razón dice qué clase de fallo fue. Sirve a: C2.
- R5. Cuando la unidad pide salida estructurada, Muse recibe el esquema para dar forma a su respuesta final, y la respuesta solo es limpia si trae los campos requeridos. Sirve a: C2.
- R6. El uso de cada llamada trae los tokens por modelo (entrada, salida, caché y razonamiento) y lo que Muse informe de lo gastado de la cuota, y `aether-report` los precia con el precio por token de los modelos de Muse que Meta publica (`muse-spark-1.3`, `muse-wonder-1.0`); un modelo exclusivo de suscripción sin precio por token publicado (`muse-wonder-full-1.0`) se reporta a $0 con la nota «no price for lane model». Sirve a: C2.
- R7. Cada llamada tiene el tiempo límite de las otras lanes y un tope de pasos del modelo; al vencer, el proceso y sus hijos terminan. Las llamadas de fondo propias de Muse (recordatorios, observadores) y sus subagentes propios no corren en las llamadas de Aether. Sirve a: C2.
- R8. La tabla declara cuántas llamadas a Muse pueden correr a la vez, con el valor más bajo hasta que se mida que dos `muse exec` en worktrees distintos conviven. Sirve a: C2.
- R9. Cada llamada de Aether a Muse sale con el modo contributor apagado, sin cargar reglas, skills ni memorias personales de otras herramientas, y sin un modelo `-contributor`; ninguna opción del plugin puede encender el modo contributor. Sirve a: C2.
- R10. Cada llamada corre con el sandbox de Muse encendido y el workspace sin confianza, sin `--yolo` ni `--disable-sandbox`, salvo lo que el plan justifique por escrito con una medición. Sirve a: C2.

El fallback:
- R11. Cada forma de falla (Muse no instalado, sin sesión, cuota agotada, sandbox que no arranca, tiempo vencido, tope de pasos, salida ilegible o sin campos requeridos, modelo que la cuenta no da, salida distinta de 0) termina con la misma llamada corriendo en el agente nativo al nivel pedido, sin pregunta al dueño y, en los fallos de infraestructura o de cuota, sin gastar un intento de la escalera, como con los otros harness. Sirve a: C3.
- R12. Aether nunca inicia un inicio de sesión de Muse ni espera entrada interactiva de Muse; la falta de sesión se sabe por el fallo de la llamada o de la lectura, no por abrir los archivos de Muse. Aether no lee ni guarda credenciales de Muse, no usa `META_API_KEY` y no ofrece el pago por token. Sirve a: C3.
- R13. Un `environmentError` del sandbox es un fallo de infraestructura de esa llamada, como los demás de R11: la llamada corre en el agente nativo y no repite la llamada con la seguridad rebajada. No deja una marca de cuota en disco: las marcas de R16 se curan con una lectura sana de cuota, que no dice nada del sandbox, y un `environmentError` no se cuenta ni se muestra como agotamiento de cuota. Cada unidad siguiente que el orden mande a Muse prueba el sandbox de nuevo y, si falla, corre en el agente nativo. Sirve a: C3.

La cuota:
- R14. `aether-lane quota` lee la cuota de suscripción de Muse, con la ventana de 5 horas y la semanal (porcentaje usado y hora de reinicio), y la da con la misma forma que la de los otros harness: un grupo con el saldo de cada ventana. Una lectura ausente o ilegible da un grupo desconocido, que el orden trata como a los otros desconocidos. Sirve a: C4.
- R15. El orden de cuota sitúa a Muse con las reglas vigentes de los otros harness: prioridad por saldo y horas al reinicio, reserva de 5 %, y exclusión por no instalado, marca vigente, marca seca o saldo bajo la reserva. Sirve a: C4.
- R16. Un fallo de cuota de Muse (reconocido por el dato de cuota del fallo y no por el texto del mensaje) deja una marca que se cura con una lectura sana más reciente, con la misma vida de marca que a los otros harness. Sirve a: C4.

La visibilidad:
- R17. El panel `/harnesses` muestra a Muse con sus grupos de cuota; la copia de la lista de harnesses del panel sigue igual al registro del plugin, y la prueba de conformidad lo comprueba. Sirve a: C5.
- R18. El índice de modelos incluye a Muse con el precio y el perfil de cada uno de sus modelos admitidos, y `config/prices.json` trae el precio por token de los modelos cuyo precio publica Meta en sus páginas (`muse-spark-1.3`, `muse-wonder-1.0`). Un modelo exclusivo de suscripción sin precio por token publicado (`muse-wonder-full-1.0`) lleva `price: null` en su perfil de `profiles.json` (se muestra como «price: the host's») y no tiene fila de precio. Sirve a: C5.
- R19. La descripción de la opción `harnesses` del manifiesto y la página de opciones nombran a Muse, y las dos siguen iguales entre sí. Sirve a: C5.
- R20. La documentación (README, guías de lanes, opciones, ops y primeros pasos, `CLAUDE.md`, los skills `using-aether` y `swarm`) y la web, en español y en inglés, nombran a Muse donde listan harnesses y donde dicen cuántos son. Sirve a: C5.
- R21. Una prueba recorre el repositorio y falla si una lista fija de los harness (sus nombres, o un número que los cuente) no incluye a Muse, salvo las excepciones nombradas con su motivo: el router de delegados, los asientos de diseño y los textos que dicen «otro harness» en genérico. Sirve a: C5.

Los modelos:
- R22. Un modelo de Muse entra en la tabla de lanes solo si la CLI lo lista a esa cuenta, es la generación más nueva de su línea y su perfil está escrito desde las páginas de Meta, comprobado por la prueba del índice de modelos, que para eso lee `config/lanes.json` (hoy no lo lee). Como los modelos de Muse sin datos de Artificial Analysis entran en `withoutFigures` y `markCurrent` solo agrupa las familias que Artificial Analysis devuelve, la generación más nueva de su línea se comprueba sobre lo que lista la CLI en `harness-models.json` (la línea es el nombre sin el número de versión; gana el número mayor), y el plan decide si lo hace la prueba o el script del índice. Sirve a: C6.
- R23. Cada modelo de Muse de la tabla lleva el nivel de Claude que sustituye según una medición de Artificial Analysis; un modelo sin medición no entra, y con ninguno en la tabla Muse sigue siendo un harness registrado, visible y con cuota leída, que el script de llamada real puede llamar con el modelo explícito como argumento. Sirve a: C6.
- R24. Ningún modelo `-contributor`, de imagen, de voz ni `sam` entra en la tabla. Sirve a: C6.
- R25. Un modelo de la tabla que la cuenta no puede usar (por ejemplo `muse-wonder-full-1.0` sin plan Power o Maximum) no se usa: la llamada que lo rechaza corre en el agente nativo (R11). Sirve a: C6.

La prueba real:
- R26. El Lead hace, a través de Aether, al menos una llamada real a Muse que vuelve limpia, y deja en `specs/008-muse-harness/evidence/` la constancia: el comando exacto, la respuesta, el uso, la cuota antes y después y la forma real de lo que Muse devolvió (incluido `allowance`, el `reason` de un fallo y si las herramientas salen en `--json`), con lo que no se pudo medir dicho aparte. Sirve a: C7.
- R27. Donde la forma real difiera de la supuesta desde el esquema, el adaptador y sus pruebas siguen la real, y una captura sin credenciales ni texto de conversación ajeno sirve de fixture de las pruebas del adaptador. Sirve a: C7.
- R28. La llamada real la hace el Lead sin pedir al dueño que la haga, y solo cuando la concesión `paid-call` la cubre (`aether-autonomy check paid-call` da `covered: true`); sin concesión, el comando exacto queda en «Espera tu sí» y todo lo que no depende de la llamada sigue. Sirve a: C7.

La versión:
- R29. La versión 0.13.0 está en `plugin.json`, la fijación de `tests/launcher.test.js`, la línea `Version` del README y la primera línea `Version X.Y.Z:` del changelog; las pruebas que clavan 0.12.5 (incluida la R15 de `tests/docs-facts.test.js` y el nombre del handoff) pasan a 0.13.0 con un handoff nuevo, y la decisión de Muse queda en `docs/decisions.md` con el número libre al cerrar. Sirve a: C8.
- R30. `npm run check` pasa. Sirve a: C8.
- R31. El trabajo no hace merge a `main`, push, tag, publicación ni `claude plugin update`; el informe final los deja al dueño. Sirve a: C8.

Las propuestas:
- R32. Cada oportunidad que el diseño o el plan encuentren fuera de estos requisitos se anota en `## Proposals` del plan y no se construye. Sirve a: C9.

## Proposals

Ninguna se construye. Salen de lo que la tarjeta deja fuera de alcance y de lo medido; el plan añade las que halle.

- P1. Muse como destino de los delegados de solo lectura del router (hoy solo agy y grok). Por qué: otra cuota que gastar para el Lead; requiere decidir el orden entre tres grupos.
- P2. Muse como asiento de diseño (Judge, Writer, Examiner). Por qué: el mismo argumento, con el esfuerzo fijo de los asientos externos.
- P3. Medir a Muse contra el agente nativo (`docs/evaluations`). Por qué: la tabla de lanes sustituye por medición publicada y no por el desempeño real en unidades de Aether.
- P4. Una opción para encender el modo contributor. Por qué: da más uso a cambio de que Meta entrene con el contenido; es una decisión de privacidad del dueño y hoy no se ofrece.
- P5. Una lane de pago por token con `META_API_KEY`. Por qué: serviría a un dueño sin suscripción, pero Meta no documenta un tope de gasto y `laneEnv` borra las variables con `KEY`.

## Assumptions

Cada una es reversible por el dueño con una frase; la base de cada una está en la sección 5 de la tarjeta o en la evidencia.

- A-1. **Suscripción, no llave por token.** Base: los metadatos de las sesiones de Muse de hoy (`device_code`, `subscribed: true`, ninguna `META_API_KEY`, uso de `muse-wonder-full-1.0`). Se diseña para la ventana de 5 h y la semanal. Si es falso, el pago por token sería otra lane (P5).
- A-2. **Contributor apagado y sin contexto personal ajeno en todas las llamadas (R9).** Base: Meta lo trae encendido por defecto para suscriptores a cambio de entrenar con el contenido, y Muse lee por defecto skills de `~/.claude` y `$CODEX_HOME`. Renuncia a «más uso». El dueño puede revertirlo pidiendo la opción (P4).
- A-3. **Muse es una lane del swarm con los roles que la tabla le dé a cada modelo.** Ni asiento de diseño ni router de delegados (P1, P2). El dueño puede ampliarlo después.
- A-4. **Modelos candidatos:** los que la CLI liste y sean la generación más nueva de su línea; hoy `muse-spark-1.3`, `muse-wonder-1.0` y `muse-wonder-full-1.0`. Sin `ARTIFICIAL_ANALYSIS_API_KEY` en esta sesión no hay puntajes, y los publicados por Meta y por terceros no coinciden; si no hay medición, la tabla queda sin modelos de Muse, como codex y cursor (A37), y Muse se prueba con el script de llamada real, que con la tabla sin modelos pide el modelo como segundo argumento. Es reversible, pero `scripts/refresh-lanes.js` no añade modelos: solo refresca las cifras `aa` de los modelos que ya están en `config/lanes.json` (con `ARTIFICIAL_ANALYSIS_API_KEY`, que lee del `.env` del directorio de datos), así que añadir un modelo de Muse es editar la tabla con su `aa.slug` y luego refrescar.
- A-5. **Seguridad (R10):** sin aprobaciones, con el sandbox de Muse encendido y el workspace sin confianza. Base: `--yolo` y `--disable-sandbox` quitan la única barrera de una llamada que escribe en un worktree. Si el sandbox no arranca en WSL, esa llamada corre en el agente nativo (R13).
- A-6. **Tope de gasto por llamada (R7):** tope de pasos del modelo más el tiempo límite de las otras lanes; sus valores los fija el plan. Base: `--max-model-steps` es el único freno que documenta Meta.
- A-7. **Una sola lane de Muse en paralelo hasta medir (R8).** Base: no se midió si dos `muse exec` conviven con el índice SQLite compartido. Subir el valor es un cambio de la tabla.
- A-8. **Un grupo de cuota para la suscripción de Muse**, no uno por modelo, porque la cuota de Meta es de la suscripción y no del modelo; si la prueba real muestra otra cosa, el plan lo cambia.
- A-9. **Cómo se lee la cuota queda para el plan** (`usage/read` de `muse serve`, `allowance` de `exec --json` u otra), con lo que quede sin medir dicho en la constancia (R26). Hasta una lectura real, una lectura ausente cuenta como desconocida (R14).
- A-10. **La 0.13.0 no lleva nada más que Muse**: «algo grande» se lee como el harness. Si el dueño tenía más, lo dirá; mientras tanto, Propuestas.
- A-11. **Se trabaja en la rama `feat/muse-harness`, desde `main` en `3cafbce`.** Otra sesión del dueño sigue activa en el repositorio: el número de decisión (A63) y el de los issues se vuelven a comprobar antes de cerrar.
- A-12. **La concesión `paid-call` hoy no existe** (`aether-autonomy check paid-call` da `covered: false`). El Lead no la inventa: la llamada real queda para cuando el dueño la dé con sus palabras (R28).

## Irreversible actions

- Llamada real a Muse a través de Aether, que gasta la cuota de la suscripción del dueño (clase `paid-call`): `node scripts/lane-smoke.js muse <modelo>`, con el modelo explícito (por ejemplo `muse-spark-1.3`) mientras `config/lanes.json` no tenga modelos de Muse; sin él el script termina con error. La hace el Lead, no el dueño, cuando la concesión la cubre; las pruebas del repositorio usan una `muse` simulada y no gastan nada.
- Una unidad real del swarm que el orden mande a Muse, si el Lead la usa para la constancia (clase `paid-call`): `aether-lane start <unidad>` con `muse` habilitado. Solo es posible cuando la tabla ya tiene un modelo de Muse que sirva el nivel de la unidad; con la tabla sin modelos no hay unidad que el orden mande a Muse y la constancia sale de `lane-smoke.js`. Misma regla.

Publicar queda para el dueño y este trabajo no lo hace: `git merge` de la rama a `main` (clase `merge-main`), `git push` (clase `push`), `claude plugin tag plugins/aether` (clase `publish`) y `claude plugin update` (clase `publish`). Ningún borrado de datos ni uso de credenciales lo exige.

## Out of scope

- El pago por token con `META_API_KEY`.
- El modo contributor de Muse, en cualquier forma, incluida una opción para encenderlo.
- Muse en el router de delegados y como asiento de diseño (Judge, Writer, Examiner).
- Muse como modelo del Lead o de los agentes `aether:*`.
- Los modelos que no son de código (`muse-image`, `muse-voice-transcribe`, `sam`) y las funciones de Muse que Aether no usa: voz, skills, plugins, MCP y sus propios subagentes.
- Cambiar el comportamiento de agy, codex, grok o cursor más allá de lo que obligue sumar un harness a las listas.
- Medir a Muse contra el agente nativo.
- Publicar: el merge a `main`, el push, el tag `aether--v0.13.0` y `claude plugin update`.
- Leer o guardar credenciales de Muse.
