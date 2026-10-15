# aether:design: el Lead entrega la intención y el diseño corre solo

- Date: 2026-10-15
- Status: Draft
- Intent: que el Lead deje de conducir el diseño. Que entregue la intención del dueño y que el diseño corra solo hasta el plan aprobado, como ya corre la construcción en `aether:run`, sin que vuelva la sobreingeniería. Sale en la versión siguiente. En palabras del dueño (2026-10-15):
  - «el agente principal se sautraba porque tneia que hacer todo entender al usuario orquestar saber que agente entra en cada cosa, y en la arqueictura te doy el trbajao organizate me ocurria que el swarm hacia sobreingnieria»
  - «mi idea original era el lead pasa la tarea el swarm se orgnaiza con supervisor designer judge etc etc. Pero no se si eso haria sobreingienria d eneuvo, lo que quiero es descargar al lead para evitar que falle, acutlmaente no ha fallado pero por experiencia ya me paso antes que el lead tenia tantas responsabilidades que incumnplia algunas»
  - «ya uso aether run y la implementacion comenzo a hacerse como queria autocordinada, entocnes el problema esta siendo hasta antes de aether run no?»
  - «es buena idea pero la necesito mas fundamentada»
  - «ve haciendo el plan y preparando todo porque esto si es necesario va a ser al neuva version sigueinte»
- Source: la conversación del 2026-10-15 en la sesión 777d41c2, que leyó en solo lectura la sesión 5ef557b7 e investigó las fuentes citadas abajo.

## Context

Lo que hay hoy, en `main` (122755a, 0.10.0):
- **El diseño pasa por el Lead.** Según "Writing and judging" y "The design seats" del bootstrap (`plugins/aether/skills/using-aether/SKILL.md:120-156`), el Lead escribe la spec y corre cada ronda con `aether-lane seat`. Lee el código de salida y, con 3, 4 o 1, lanza al agente nativo. También reanuda al Writer, cuenta las revisiones, lanza al Examinador y guarda el examen. Ningún workflow ni librería lanza a `aether:judge`, `aether:writer` ni `aether:examiner`: `workflows/run.workflow.js` solo lanza agentes `aether:${role}` para ops, implementer, supervisor y reviewer (línea 217).
- **`aether:run` es código.** Corre tandas de unidades en paralelo, con implementador y supervisor por intento, la escalera de modelos, merges de uno en uno, revisión final y limpieza, y le devuelve al Lead un resultado. El dueño lo vio coordinarse solo en la sesión 5ef557b7.
- **La sesión 5ef557b7** (Lead en Sonnet 5.5, de 23:26 a 01:00 hora local):
  - el contexto del Lead pasó de 48 mil a 500 mil tokens, sin compactar;
  - 148 llamadas a la API releyeron 49 millones de tokens, US$ 11.23 con `plugins/aether/config/prices.json`;
  - hizo más de 130 llamadas directas a herramientas contra 7 agentes;
  - la spec 004 necesitó tres rondas del Juez. Su primera versión ya exigía `tests/docs-facts.test.js`, que el dueño no pidió, como evidencia de su criterio C3. Su plan salió de 20 tareas y un `tasks.md` de 1,814 líneas;
  - el swarm que el dueño pidió a las 00:10 no había arrancado a la 01:00.
- **Los frenos de hoy.**
  - La plantilla de la spec manda a Propuestas el requisito que no sirve a ningún criterio (`plugins/aether/skills/specify/SKILL.md:35-36`), pero los criterios los escribe el Lead.
  - El Writer dice «YAGNI: plan what the spec asks for, and nothing more.» (`agents/writer.md:77`).
  - El supervisor marca «**Extra:** features nobody asked for, or over-engineering.» (`agents/supervisor.md:43`).
  - El Juez solo busca lo que falta (`agents/judge.md:31`) y solo bloquea lo que contradice la intención (`:36`); nada en él marca lo que sobra.
  - La revisión final dice «That expectation is a requirement; the spec's silence is not permission.» (`agents/reviewer.md:30`) y no tiene el chequeo de lo que sobra.
  - `aether-plan check` no relaciona tareas con requisitos. Su único aviso de tamaño es el de más de 6 rutas por tarea (`lib/plan.js:61`).
- **Spec Kit original** (github/spec-kit, rama main, leído el 2026-10-15) trae frenos que el preset no tiene:
  - `spec-driven.md`: «These gates prevent over-engineering by making the LLM explicitly justify any complexity», «No speculative or "might need" features», «Don't guess: If the prompt doesn't specify something, mark it» y «Focus on WHAT users need and WHY»;
  - en `templates/plan-template.md`, la compuerta «*GATE: Must pass before Phase 0 research.*» y la tabla «| Violation | Why Needed | Simpler Alternative Rejected Because |»;
  - `clarify`: hasta 5 preguntas antes del plan, con las respuestas escritas en la spec;
  - `analyze`: corre en solo lectura después de las tareas y busca «Requirements with zero associated tasks» y «Tasks with no mapped requirement/story».

  El preset solo trae `specify`, `plan`, `tasks` y `constitution` (`plugins/aether/speckit/commands/`). Buscar `simplicity`, `anti-abstraction`, `complexity tracking`, `NEEDS CLARIFICATION` y `speculative` en `speckit/`, `skills/` y `agents/` no da ninguna coincidencia.
- **La guía de Anthropic para los modelos que usa Aether** (platform.claude.com, leída el 2026-10-15):
  - Sonnet 5.5 «tends to add tests, documentation, and small supporting files that fit your repository's conventions, even when you don't ask for them. It does this at every effort level, and more at higher effort».
  - El remedio que da para Sonnet 5.5 es un párrafo: «When the work the user asked for is done and checked, stop and report. Don't add features, tests, files, docs or refactors that weren't asked for. If you think one would help, mention it at the end instead of doing it.». También recomienda «Reserve `xhigh` and `max` for work where you've measured a quality gain».
  - Opus 5 «can also expand the scope of a task, adding steps that weren't requested», y la guía da su propio párrafo de alcance.
  - Para revisiones con Opus 5: «ask it to report everything and filter in a separate pass instead».
  - El Lead arranca en `xhigh` (`scripts/aether-lead:15`; `plugins/aether/skills/using-aether/SKILL.md:13`) y el Writer también (`agents/writer.md:6`).
- **El guard y los asientos.** El guard ya deja al Writer escribir `spec.md` (`lib/guard.js:59-61`). Un Writer externo solo puede cambiar `plan.md` y `tasks.md` (`lib/seats.js:169`). Ninguna regla del guard cubre un archivo de intención.
- **El bootstrap** pesa 29,470 bytes. "Autonomous runs" (líneas 187-285) es cerca de un tercio.
- **La spec 004**, la conciliación de la documentación, la construye otra sesión en la rama `docs/reconcile-0.10.0`, y reorganiza `README.md` y `docs/`.

## Criteria

- C1 · Autónomo y Robusto. El Lead ya no conduce el diseño. Escribe la tarjeta de intención con el dueño, lanza `/aether:design` y recibe un solo resultado. Evidencia: una prueba con el arnés de workflows (`tests/workflow-harness.js`) y agentes falsos va de una tarjeta a un plan aprobado, y a una disputa, sin turnos del Lead en medio; un test comprueba que el bootstrap manda lanzar `/aether:design` y ya no describe las rondas ni los códigos de salida de los asientos.
- C2 · Robusto. El diseño no agrega lo que nadie pidió. Cada criterio sale de las palabras del dueño, cada requisito sirve a un criterio y cada tarea sirve a un requisito. La complejidad que va más allá se justifica o es un hallazgo. Evidencia: `aether-plan check` falla con una tarea que no sirve a ningún requisito; las plantillas tienen `[NEEDS CLARIFICATION]`, la compuerta y la tabla de complejidad; el formato del Juez distingue lo que falta, lo que sobra y lo que está mal; un test cubre cada cosa.
- C3 · Robusto. `aether:run` se coordina igual que en 0.10.0. Solo cambia que la revisión final también marca lo que sobra. Evidencia: las pruebas del swarm (`tests/workflow*.test.js`) pasan sin cambios; un test comprueba el chequeo de lo que sobra en `agents/reviewer.md`.
- C4 · Robusto. El Lead carga menos reglas todo el tiempo. El bootstrap ya no lleva las rondas del diseño, la mecánica de los asientos ni el procedimiento de las corridas autónomas, que se carga cuando hace falta. Evidencia: un test comprueba que esas secciones no están en el bootstrap, que la skill de corridas existe y que el aviso de session start de una corrida abierta la nombra; el bootstrap pesa menos que los 29,470 bytes de 0.10.0.
- C5 · Rápido. Sale como la versión siguiente, 0.11.0. Evidencia: los manifiestos dicen 0.11.0; `docs/decisions.md` registra las decisiones nuevas; la documentación de usuario describe el flujo nuevo; `npm test` pasa.

## User scenarios

- E1. Dado que el dueño confirmó la intención de un cambio de arquitectura, cuando el Lead escribe la tarjeta y lanza `/aether:design`, entonces el workflow corre al Writer, al Juez y al Examinador sin turnos del Lead en medio, y le devuelve el plan aprobado con cada veredicto del Juez tal cual. Sirve a: C1.
- E2. Dado que el Juez no aprueba el plan en la tercera revisión, cuando se agota el límite, entonces `/aether:design` termina y devuelve la disputa con las dos posiciones, y el Lead la pone en la lista del dueño. Sirve a: C1.
- E3. Dado que el asiento externo del Juez termina con el código 3, 4 o 1, cuando corre esa ronda, entonces el workflow corre al Juez nativo con el mismo mensaje y el Lead no interviene. Sirve a: C1.
- E4. Dado que la tarjeta no decide algo que cambia el trabajo, cuando el Writer escribe la spec, entonces lo marca `[NEEDS CLARIFICATION]` en vez de adivinar, y `/aether:design` le devuelve al Lead esas preguntas para el dueño. Sirve a: C2.
- E5. Dado un `tasks.md` con una tarea que no sirve a ningún requisito, cuando corre `aether-plan check`, entonces falla y nombra la tarea. Sirve a: C2.
- E6. Dado un plan con una abstracción, una opción o un archivo que ningún requisito pide, cuando el Juez lo revisa, entonces reporta un hallazgo de tipo «sobra», salvo que la tabla de complejidad lo justifique con el requisito que lo pide y la alternativa simple descartada. Sirve a: C2.
- E7. Dado un plan aprobado, cuando corre `/aether:run`, entonces sus unidades, la escalera, el supervisor, los merges y la limpieza se comportan como en 0.10.0. Sirve a: C3.
- E8. Dado que el dueño le da al Lead permiso de trabajar por horas, cuando el Lead arranca la corrida, entonces carga la skill de corridas autónomas y la sigue; y si una sesión arranca con una corrida abierta, el aviso de session start nombra esa skill. Sirve a: C4.

## Requirements

- R1. Existe `/aether:design`. Para una spec, parte de la tarjeta de intención de una carpeta `specs/NNN-<topic>/` y corre en este orden:
  1. el Writer escribe `spec.md` y el Juez la revisa;
  2. el Writer la corrige, como máximo dos veces, hasta que el Juez la aprueba;
  3. el Writer escribe `plan.md` y `tasks.md`, y `aether-plan check` pasa;
  4. el Juez los revisa y el Writer los corrige, también como máximo dos veces;
  5. cuando la opción de asientos lo corre, el Examinador escribe el examen y queda guardado fuera del repositorio.

  Para un diseño corto que escribió el Lead, corre solo las rondas del Juez. Sirve a: C1.
- R2. Cada ronda de `/aether:design` usa el orden de asientos de la opción `seats`: los modelos externos primero y el agente nativo al final. Con los códigos 3, 4 o 1 corre el agente nativo con el mismo mensaje, y un asiento nunca toma el modelo que escribió el documento (A41). El Writer de un asiento externo escribe la spec en su ronda, y solo la spec. El Lead no decide ni lanza ninguna ronda. Sirve a: C1.
- R3. `/aether:design` termina solo. Le devuelve al Lead uno de cuatro resultados:
  - `approved`: las rutas de la spec, el plan y las tareas, cada veredicto del Juez tal cual, la tabla de complejidad y las Propuestas;
  - `clarify`: las marcas `[NEEDS CLARIFICATION]` que el Writer no pudo resolver con la tarjeta;
  - `dispute`: las dos posiciones, cuando una tercera revisión no aprueba;
  - `failed`: el paso y la razón.

  Termina al llegar al límite de dos revisiones por documento, al tope de turnos de un agente o a la misma falla dos veces seguidas. Sirve a: C1.
- R4. La tarjeta de intención es `specs/NNN-<topic>/intent.md`, y aether-guard solo deja escribirla al Lead. Lleva:
  - las palabras del dueño tal cual;
  - el entendimiento que el dueño confirmó;
  - los criterios: qué y por qué, cada uno atado a una cita;
  - lo que queda fuera;
  - las respuestas a las preguntas de aclaración.

  Sirve a: C1, C2.
- R5. Antes de la tarjeta, el Lead le hace al dueño como máximo cinco preguntas, una a la vez, y solo las que cambiarían el trabajo de forma material. Las respuestas van a la tarjeta. Sirve a: C2.
- R6. En la plantilla de la spec, los criterios y los requisitos dicen qué y por qué, nunca cómo. La evidencia de un criterio puede decir cómo se comprueba el resultado. Una herramienta o una batería de pruebas nueva es un requisito propio y tiene que servir a un criterio que salga de las palabras del dueño. Lo que la tarjeta no decide y cambia el trabajo se marca `[NEEDS CLARIFICATION]`, sin adivinar. Sirve a: C2.
- R7. La plantilla del plan lleva una compuerta y una tabla de complejidad, como Spec Kit. La compuerta revisa los principios de la constitución del proyecto, si la hay, y dos de Aether:
  - nada especulativo ni para necesidades hipotéticas;
  - ninguna abstracción, opción, archivo o dependencia que ningún requisito pida.

  La tabla tiene tres columnas: violación, por qué hace falta y alternativa más simple descartada porque. Sirve a: C2.
- R8. Cada tarea de `tasks.md` dice qué requisitos de la spec sirve. `aether-plan check` falla cuando una tarea no sirve a ninguno o nombra uno que la spec no tiene, y avisa cuando un requisito no tiene tarea. Sirve a: C2.
- R9. Cada hallazgo del Juez lleva un tipo: falta, sobra o error. Lo que va más allá de la intención del dueño es un defecto igual que lo que falta.
  - En una spec, el Juez revisa que cada criterio salga de las palabras de la tarjeta.
  - En un plan, revisa cada fila de la tabla de complejidad y la coherencia entre spec, plan y tareas: duplicados, ambigüedad, requisitos sin medida y contradicciones.

  Sirve a: C2.
- R10. El Writer, el Juez, el Examinador y el bootstrap del Lead llevan una instrucción de alcance: entregar lo pedido, al alcance pedido. Lo que ayudaría y nadie pidió se menciona al final; no se hace. Sirve a: C2.
- R11. El Lead y el Writer arrancan en esfuerzo `high`, no en `xhigh`. Sirve a: C2.
- R12. La revisión final marca lo que sobra, como el supervisor: features que nadie pidió y sobreingeniería. Un comportamiento que la spec no dice va a «Declined to judge» para que el Lead decida, salvo que sea un bug, un problema de seguridad o una pérdida de datos. Sirve a: C2, C3.
- R13. Las unidades, la escalera, el supervisor, los merges y la limpieza de `aether:run` se comportan como en 0.10.0. Las pruebas del swarm pasan sin cambios. Sirve a: C3.
- R14. En el bootstrap, "Writing and judging" y "The design seats" se cambian por las preguntas de aclaración, la tarjeta, `/aether:design` y lo que el Lead hace con cada uno de sus cuatro resultados. El procedimiento de las corridas autónomas sale del bootstrap a una skill. El Lead la carga cuando el dueño le da permiso de trabajar por horas, o cuando session start le avisa de una corrida abierta. Sirve a: C4.
- R15. Se publica como 0.11.0:
  - los manifiestos dicen 0.11.0;
  - `docs/decisions.md` registra las decisiones nuevas;
  - la documentación de usuario describe `/aether:design`, la tarjeta y los frenos;
  - `npm test` pasa.

  Sirve a: C5.

## Proposals

- P1. Un hook que mida el contexto del Lead desde el transcript, contando cada mensaje una vez, y proponga un handoff al pasar de un umbral.
- P2. Un reporte de métricas del Lead por sesión: contexto por hora, llamadas directas contra agentes, minutos hasta que arranca `aether:run`, y tareas o archivos que nadie pidió.
- P3. Que el bootstrap quepa bajo los 10,000 caracteres que Claude Code inyecta completos, sin preview.
- P4. Un verificador para las tareas delegadas, para que el Lead lea un veredicto en vez del diff.
- P5. Un delegado persistente para el trabajo iterativo con el dueño, como el GIF de la mascota, continuado con SendMessage.
- P6. `clarify` y `analyze` como comandos del preset de Spec Kit y como skills, además de lo que ya harán el Lead, `aether-plan check` y el Juez.

## Assumptions

- A1. **Número 005, no 004.** La 004 la construye otra sesión en `docs/reconcile-0.10.0`. Base: los números en uso, contando esa rama. Reversible.
- A2. **Se construye sobre `main` después de que entre la 004.** Sus cambios de documentación siguen la organización de páginas de la 004. Al fusionar habrá un conflicto de una línea en `.specify/feature.json`, que se resuelve a favor de la 005. Base: «deja que acabe la sesion anterior». Reversible.
- A3. **Dentro de `/aether:design`, la spec la escribe el Writer.** El guard ya lo permite. Base: descargar al Lead; quien escribe la spec sigue sin juzgarla (A41). Reversible: el dueño puede volver a que la escriba el Lead.
- A4. **El Lead y el Writer en `high`.** Base: la guía de Anthropic para Sonnet 5.5 citada en Context. El dueño lo revierte con `/effort` o cambiando una línea. Reversible.
- A5. **Sin topes de tamaño por clase de tarea.** La investigación no encontró una fuente para topes fijos. Los frenos son la compuerta, la tabla de complejidad y la trazabilidad. Reversible.
- A6. **El implementador y el supervisor de `aether:run` no cambian.** La instrucción de alcance va a los agentes del diseño y a la revisión final. Base: el dueño dijo que `aether:run` ya trabaja como quería. Reversible.
- A7. **El efecto se mide a mano después de publicar.** Se compara una sesión de diseño con la 5ef557b7, usando el transcript y contando cada mensaje una vez: contexto del Lead por hora, llamadas directas contra agentes, minutos hasta `aether:run`, tareas o archivos que nadie pidió, rondas del Juez y dólares. No hay herramienta nueva (P2). Base: «la necesito mas fundamentada». Reversible.

## Irreversible actions

- Subir la rama y abrir el pull request · `push` · `git push -u origin feat/aether-design && gh pr create --base main --head feat/aether-design --title "aether:design: el Lead entrega la intención y el diseño corre solo (0.11.0)"`.
- Fusionar el pull request a `main`, que publica 0.11.0 porque la instalación sigue `ref: main` · `merge-main` · `gh pr merge <número> --merge`.

## Out of scope

- El comportamiento de `aether:run` (unidades, escalera, supervisor, merges y limpieza), salvo las reglas de la revisión final (R12).
- Los caminos directo y de tarea delegada.
- Las herramientas nuevas de medición (P1 y P2).
- Los modelos, los tiers y los efforts del swarm, y el índice de modelos.
- La reorganización de la documentación que hace la 004.
