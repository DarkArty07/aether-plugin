# El modelo y el esfuerzo de cada rol, lo más barato que alcance

- **Date:** 2026-10-26
- **Status:** Approved (el diseño corto, [design.md](design.md), lo aprobó el Judge en la segunda ronda; esta spec, el plan y las tareas lo bajan a requisitos sin cambiarlo)
- **Intent:** [intent.md](intent.md): 14 citas del dueño, nueve supuestos y lo medido el 2026-10-26. El dueño dio permiso para trabajar por horas («Quiero TODO DOCUMENTADO, no estare disponible»).

## Criteria

Cada criterio cita las palabras del dueño tal como están en la tarjeta y nombra la evidencia que lo prueba. Las pruebas corren en repositorios y directorios de datos desechables, con modelos y harness simulados: no gastan cuota.

- C1. **Cada rol corre en el modelo y el esfuerzo más baratos que hagan su trabajo.** «minimizar el costo de computo que la cuota se agste menos rapido». Evidencia: las pruebas fijan el esfuerzo por defecto, el del reintento y el de la revisión final, y la página de la guía los lista con su costo por tarea.
- C2. **Una tarea sube primero de esfuerzo y luego de modelo, y un modelo caro solo entra cuando el barato no bastó; la escalera de los delegados y la del swarm siguen esa forma.** «aplicar algo asi como la escalera que tenemos». Evidencia: las pruebas de la escalera (`ladder`, `delegate-task`) y las del workflow del swarm.
- C3. **Opus se usa solo donde su costo se justifica, y cada uso que queda tiene su razón escrita.** «quiero usar menos opus porque opus gasta el doble de sonnet». Evidencia: la página de la guía y la decisión nombran cada uso de Opus (último escalón, Judge, Examiner, revisión final, supervisor de un autor Sonnet) con su razón; las pruebas fijan la revisión final y la referencia del revisor.
- C4. **El esfuerzo se fija por rol y por modelo según lo que compra.** «no todos los efforts valen igual». Evidencia: la decisión cita el costo por tarea y los puntos de código de cada esfuerzo; la prueba de la página la ata a `config/pairs.json`.
- C5. **El Lead no cambia.** «el lead esta biena ctualmente». Evidencia: `agents/lead.md`, el lanzador y las pruebas del lanzador y del manifiesto no cambian.
- C6. **Cada cambio tiene su justificación por escrito:** la evidencia (cifras con su fuente y fecha), la alternativa descartada, lo que ahorra y lo que arriesga. «es importante la jsutifciaicon de porque hacemos estos cambios». Evidencia: la decisión y la página de la guía.
- C7. **Todo queda documentado,** con la manera del artifact. «Quiero TODO DOCUMENTADO» y «se puede incluir en la doc [...] la amnera». Evidencia: una página de la guía con una prueba que la ata al árbol, la decisión, las páginas corregidas, la entrada del changelog y el handoff.
- C8. **El cambio se puede juzgar después y deshacer.** La propuesta que el dueño aceptó: «lo haría reversible y mediría las dos corridas siguientes». Evidencia: la página dice qué medir, con qué campos del reporte y cuándo deshacer; los valores son datos o una función con su prueba.
- C9. **Nada irreversible sin el sí del dueño:** ni fundir en `main`, ni subir, ni publicar, ni actualizar el plugin instalado. Evidencia: `git status` del checkout principal sin cambios, la rama sin fundir, `claude plugin list` con 0.20.1.

## User scenarios

- **E1. Un delegado que Haiku no resuelve.** Dado una tarea de delegado que Haiku no resuelve tras sus cinco correcciones, cuando sube, entonces corre en Sonnet `high` con el trabajo anterior; si Sonnet agota sus dos correcciones, sube a Opus `high`; la corrección de Sonnet y la de Opus corren en `high`, y las de Haiku, en `xhigh`.
- **E2. Una unidad de Tier Sonnet que falla.** Dado una unidad del swarm de Tier Sonnet al esfuerzo `high`, cuando el supervisor la devuelve, entonces el reintento corre en `sonnet high`; si el reintento falla y la escalera sube, corre en `opus high`.
- **E3. Una unidad de Tier Haiku que falla.** Dado una unidad de Tier Haiku al esfuerzo `high`, cuando el supervisor la devuelve, entonces el reintento corre en `haiku xhigh`; si sube, corre en `sonnet high`.
- **E4. Una unidad con esfuerzo `xhigh` nombrado.** Dado una unidad de Tier Sonnet con `Tier: sonnet xhigh`, cuando se reintenta, entonces el reintento corre en `sonnet xhigh` (no baja ni sube); si sube, corre en `opus high`.
- **E5. Un plan sin esfuerzo.** Dado una tarea cuya línea Tier no nombra esfuerzo, cuando se compila el plan, entonces su esfuerzo es `high` y su brief dice `Tier: <modelo> high`.
- **E6. La revisión final.** Dado una corrida sin tareas de Tier Opus, cuando termina con todo fundido, entonces la revisión final corre en Opus `high`, aunque una tarea tenga una Review `xhigh`; dado una unidad de Tier Opus fundida, entonces corre en Opus `xhigh`, con la razón «<unidad> is tier opus»; dado una corrida pequeña de tareas Haiku con Review `high`, entonces corre en Sonnet `high`.
- **E7. El supervisor de un autor Sonnet.** Dado una unidad que Sonnet implementó y cuya Review es `high`, cuando la regla de que nadie revisa lo suyo cambia el supervisor a Opus, entonces corre en `opus high`.
- **E8. El revisor de un delegado de Opus en otro harness.** Dado una carga de Opus, cuando `aether-lane delegate` pide la referencia del revisor, entonces es `opus high`.
- **E9. La guía del Writer.** Dado el Writer que lee las reglas de las tareas, cuando una tarea no necesita más, entonces nombra `high` o nada; y reserva `Review: xhigh` para donde un error llegaría a datos, a seguridad o a concurrencia.
- **E10. La página no se desfasa.** Dado la página `docs/guide/models-by-role.md`, cuando alguien cambia `config/ladder.json`, el esfuerzo por defecto o el modelo o esfuerzo de un agente, entonces una prueba falla hasta que la página lo diga.
- **E11. Lo que no cambia.** Dado el Lead, el Writer, el Judge, el Examiner, los números de la escalera (cinco, dos y una correcciones; dos veces los mismos hallazgos), la escalera del plan (Haiku 2, Sonnet 2, Opus 1) y el modelo con que empieza cada unidad, cuando termina la corrida, entonces ninguno ha cambiado.

## Requirements

- R1. En `config/ladder.json`, el esfuerzo `retry` de los escalones `sonnet` y `opus` es `high`; el de `haiku` sigue en `xhigh`, y todos los `first`, las correcciones (5, 2 y 1) y `repeatFindings` (2) no cambian. Una subida a Sonnet o a Opus y toda corrección en ellos corren en `high`. La tabla de `docs/guide/delegates.md` es ese archivo. Sirve a: C2, C4
- R2. El esfuerzo por defecto de una tarea de plan es `high`: `DEFAULT_EFFORT` de `lib/plan.js`, la línea Tier de su brief, el `effort` de `agents/implementer.md`, y la guía que el Writer lee (`agents/writer.md`, `skills/tasks/SKILL.md`, `speckit/commands/speckit.tasks.md`), que reserva `xhigh` para donde las pruebas no fijan la conducta y un error costaría más que el esfuerzo. Sirve a: C1, C4
- R3. En el swarm, el primer intento corre al esfuerzo de la tarea (o `max` si lo pidió); un reintento en el modelo de la tarea corre en `xhigh` si es Haiku y al esfuerzo de la tarea si es Sonnet u Opus; un intento en un modelo al que la unidad subió corre en `high`. El log de la escalada y la sección *Ladder* del mensaje del supervisor nombran esos esfuerzos, calculados con la misma función, y `agents/supervisor.md` dice lo mismo. Sirve a: C1, C2, C4
- R4. La revisión final corre en Opus `xhigh` solo cuando una unidad fundida es de Tier Opus; una Review `xhigh` o `max` ya no la sube. Lo demás de `reviewPlan` no cambia (una corrida pequeña de Haiku con Review `high` va a Sonnet `high`; una relanzada y todo lo demás, a Opus `high`). Sirve a: C1, C3
- R5. `DEFAULT_REVIEW` sigue en `high`; el supervisor que la regla de que nadie revisa lo suyo cambia a Opus corre al esfuerzo de su par de referencia (`high` por defecto); `reviewerReference('opus')` de `lib/lane-delegate.js` es Opus `high`. Sirve a: C1, C3
- R6. No cambia: el Lead, el Writer, el Judge ni el Examiner (modelo y esfuerzo), `lib/superdelegation.js`, los números de la escalera de los delegados y del plan, ni el modelo con que empieza cada unidad. Sirve a: C5
- R7. Hay una página de la guía, `docs/guide/models-by-role.md`, con cada rol antes y después, la escalera paso a paso, dónde se iba el gasto, por qué (con las cifras de J1 a J6 del diseño, sus fuentes y su fecha), dónde queda Opus y por qué, y qué no cambia; una prueba la ata a `config/ladder.json`, a `DEFAULT_EFFORT` y a `agents/*.md`; está enlazada desde `docs/index.md`. Una decisión nueva en `docs/decisions.md` (A93) con la justificación completa, las alternativas descartadas, el ahorro y el riesgo, y una nota de actualización en A18, A36 y A87; `docs/delegates.md`, `docs/methodology.md`, `docs/roadmap.md` y `docs/purpose.md` dicen lo nuevo; el changelog tiene una entrada «Unreleased». Sirve a: C3, C6, C7
- R8. La página dice qué medir en las dos corridas siguientes de un swarm (los campos del reporte), la línea base de las 8 corridas, cuándo deshacer y qué cinco lugares se tocan para deshacerlo. Sirve a: C8
- R9. La corrida no ejecuta ninguna acción irreversible (C9). Sirve a: C9

## Proposals

- Empezar el swarm en Haiku (S2 de la tarjeta).
- Supervisor cambiado a Opus `medium`, con una `nativeFor` que elija el par que alcanza los puntos pedidos al menor costo en cualquier esfuerzo.
- Sonnet `max` como último escalón de las tareas más difíciles.
- Que el reporte guarde por intento lo que cada supervisor aprobó o rechazó.

## Assumptions

Los de la tarjeta, S1 a S9, sin cambio: la corrección en Sonnet y Opus no sube el esfuerzo (la tarjeta lo planteó como una desviación de A87; al revisar el código resultó que A87 sigue en pie, y lo que cambia es el tope del esfuerzo de una corrección en Sonnet y Opus, de `xhigh` a `high`; se revierte con dos números); el swarm sigue empezando en el modelo del Tier; el supervisor y la revisión final como en R4 y R5 (enmendadas en la tarjeta tras leer el código); el Lead, el Judge, el Examiner y el Writer no cambian; el esfuerzo por defecto baja a `high`; se mide con lo que el reporte ya tiene; la documentación es parte del trabajo; corrida aparte sin tocar el checkout principal.

Y tres que esta spec añade:

- **A1. La decisión se numera A93 ahora y se renumera al fundir si otra rama tomó ese número** (S9 y el issue #50). Base: la tabla de decisiones y las pruebas de documentos necesitan un número. Reversible.
- **A2. La entrada del changelog va bajo un encabezado «Unreleased»,** no bajo un `Version X.Y.Z:`, porque las pruebas atan la primera línea de versión al manifiesto y la versión se fija al publicar. Reversible.
- **A3. Las cifras de Artificial Analysis que la documentación cita son las de su API y el costo por tarea de `config/pairs.json`.** Nada que se haya leído de las páginas de sus modelos, y ningún volcado, entra en la rama. Base: `docs/reference/artificial-analysis.md` (en el checkout principal, sin commitear) dice que ningún script del repositorio lee su web.

## Irreversible actions

Ninguna se ejecuta en esta corrida sin el sí del dueño. Quedan nombradas para que el plan no las dé por concedidas:

- Fundir `feat/model-effort-policy` en `main`. Clase: `merge-main`. Comando: `git merge feat/model-effort-policy` sobre `main`.
- Subir la rama o `main`. Clase: `push`. Comando: `git push origin feat/model-effort-policy` o `git push origin main`.
- Publicar la versión (0.21.0 o la que toque), con la entrada «Unreleased» convertida en una línea `Version X.Y.Z:` y las cuatro versiones al día. Clase: `publish`. Comando: `claude plugin tag plugins/aether`.
- Actualizar el plugin instalado del dueño. Clase: `deploy`. Comando: `claude plugin update aether@aether-plugin`.

## Out of scope

- El modelo y el esfuerzo del Lead; el Judge, el Examiner y el Writer.
- La regla de que nadie revisa su propio trabajo (A41, A80) y el orden de los asientos de diseño.
- Empezar el swarm en Haiku, Opus `medium` en el supervisor, Sonnet `max` como escalón y la instrumentación nueva del reporte (las Proposals).
- Que el Lead investigue antes de implementar (issue #96).
- La skill de Artificial Analysis y sus scripts.
- Subir, publicar, fundir y actualizar el plugin instalado, y la versión.
