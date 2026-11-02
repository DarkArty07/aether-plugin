**Veredicto del grupo B:** hay texto repetido y algunas incoherencias concretas; el problema no es el largo. El grupo suma 58337 B: siete agentes (33109), cuatro skills (12023) y el preset (13205).

- **Copias:** cada skill y su comando del preset tienen el cuerpo idéntico byte a byte. Son 11915 B repetidos que no gastan contexto, porque Aether nunca carga el preset.
- **Reducción posible:** de los 45132 B que llegan a modelos se pueden quitar ~3100 B (~7 %) sin cambiar lo que se ordena ni tocar tests, y ~5400 B (~12 %) cambiando tests.
- **Mensajes de los workflows:** cada mensaje repite entre 0,3 y 1,5 KB del cuerpo del agente que lo recibe, y hay tests que fijan las dos copias.
- **Incoherencias:** verifiqué 16 en el árbol; tres pueden hacer que un modelo actúe mal (n.º 1 a 3 de la lista final).

## Por archivo, de mayor a menor

**agents/writer.md (8221 B).** Es el prompt de sistema del Writer en cada ronda de `/aether:design`. En un asiento externo, el cuerpo abre el prompt (lib/seats.js:552) y `seatNote` añade las skills pegadas (seats.js:506-541).
- **Tests que lo fijan:**
  - agents.test.js:49-70: sonnet, high, 60, siete tools con `Skill`; «`aether:plan`», «`aether:tasks`», «**Aether:**», «## Aether Execution», «aether-plan check», «Task N — reason», «specs/NNN-<topic>/tasks.md».
  - agents-design.test.js:13-14 (SCOPE entero) y :31-34: «When the message asks you to revise a document after the Judge's verdict», «load the skill `aether:specify`», «skip its steps 1 and 2», «## Gate», «## Complexity», «`- Serves: R1, R3`», «disagreements».
  - swarm-ladder-agents.test.js:12-31: prohíbe `Tier:`, `**Tier**` y `Ladder:`; exige «- Max agents: 200», «- Test command:», «The swarm starts every task on the cheapest model…», «Every task is one module and one concern…», «only where a mistake would reach user data, security or concurrency, and say which.» y «**Review**».
  - speckit.test.js:123-138: /runs at `high`|is `high` without it/.
  - models-by-role-docs.test.js:43-51.
- **Incoherencias:** n.º 2, 4, 6, 7 y 15.
- **Redundancia:**
  - L48-83 (~2800 B) repite tasks SKILL:18-66 y plan SKILL:23-41, que el Writer carga en esa misma ronda.
  - L19 repite lo que dicen L42-43.
  - L44 repite lo que dicen L111-112.
- **Ambiguo:**
  - L66 dice «Independence is the default», pero plan.js:211 da error si falta `Depends on`.
  - L63 pone `high` entre los valores que solo se nombran por riesgo, y `high` ya es el valor por defecto (plan.js:9).
- **Reducción:** ~900 B sin tocar tests. Llega a ~3200 B si L48-83 queda solo en las skills, pero eso exige cambiar los tests citados y resolver la corrección nativa (L40-46), que hoy no carga ninguna skill.

**agents/examiner.md (5921 B).** Se usa una vez por diseño completo, nativo o externo; el Lead puede relanzarlo (using-aether:161).
- **Tests que lo fijan:**
  - agents.test.js:84-99: opus, high, 40, seis tools; «**Never read `tasks.md`**», «- Write only under `.aether-exam/`.», «**One command per test,** run from the repository root», «`.aether-exam/exam.json`».
  - agents-design.test.js:13-14 (SCOPE).
  - agents-design.test.js:42-53: «tolerant of markdown», «bold, backticks, line breaks, plural and inflected forms», «compare on the text with the markup stripped», «any line or sentence of the document», «never the first line that matches», «which of its checks are about wording».
- **Incoherencias:** n.º 3, 5, 9 y 13.
- **Redundancia:** «nunca leas tasks.md» aparece en L23 y L72, y «solo bajo .aether-exam/» en L25 y L70. Esas dos reglas y las de prosa (L41-45, 864 B) están también en design.workflow.js:771-776, y los tests fijan ambos lados (workflow-design.test.js:286 y :305-316).
- **Reducción:** ~350 B.
- **No tocar:** L36 (`NODE_TEST_CONTEXT`: sin esa regla, un test anidado nunca falla).

**agents/judge.md (5378 B).** Se usa en cada revisión (hasta 3 por documento, design.workflow.js:50), nativa o externa, y en una llamada directa del Lead (using-aether:137).
- **Tests que lo fijan:**
  - agents.test.js:21-47: opus, high, 30, Read/Grep/Glob; «## Verdict», «## Findings», «## Open questions», «approve | revise | reject», «[blocking | major | minor]», «A false approval costs 10-100x more than a false rejection.», «at most 10 findings and 400 words».
  - agents-design.test.js:17-29: la línea de hallazgo completa, «## Finding types», los tres tipos, «What goes beyond the owner's intent is a defect…», L33 entera, «check each row of the Complexity table», «duplicates, ambiguity, requirements without a measure, and contradictions».
  - agents-design.test.js:55-61 (#91 y #92).
- **Incoherencias:** n.º 1, 5 y 15.
- **Redundancia:**
  - L33-34 (948 B) aparece casi literal en design.workflow.js:646-655.
  - L43-48 equivale a `FINDING_FIELDS` (:606).
  - L35 y L60 dicen dos veces que sin evidencia no hay hallazgo.
  - El formato de L64-73 solo sirve en una llamada directa (el workflow pide esquema y lo reconstruye en :336), pero los tests lo fijan.
- **Reducción:** ~250 B en el cuerpo. En el mensaje caben ~1250 B menos por ronda si el cuerpo queda como única fuente, lo que cambia workflow-design.test.js:283-303.

**agents/supervisor.md (4557 B).** Se usa en cada intento. Corre en Sonnet con la effort de `Review` (run.workflow.js:1178). Con superdelegation puede ir a otro harness, o a Opus si el autor es Sonnet (superdelegation.js:109-117).
- **Tests que lo fijan:**
  - swarm-ladder-agents.test.js:33-41: «Every finding of a retry names a file and what is missing.», «the Gate evidence section of your message shows their result» y L78 entera; prohíbe «You cannot run commands.» y «The workflow enforces the ladder».
  - evidence.test.js:11-26: «VERIFIED, PARTIAL or MISSING», «are not evidence», «**Flags**», «A flag you accept needs one line in your ruling that says why.».
  - roles.test.js:13.
- **Incoherencia:** n.º 11.
- **Ambiguo:**
  - L25 dice «Those context lines are the changed files.» sin decir qué hacer con eso.
  - L63-64 manda escalar si se repiten los errores, y L78 dice que la escalera ya sube sola (`repeatFindings: 2`). No queda claro si ante una repetición toca retry o escalate.
- **Reducción:** ~200 B. L46 casi sobra, porque la compuerta lo filtra antes (run.workflow.js:1364), salvo cuando no corrió.

**agents/implementer.md (4185 B).** Se usa en cada intento, con el modelo y la effort de la escalera. En un carril recibe cuerpo + nota + mensaje (lane-calls.js:85). Los tests de carriles reconocen cada turno por los primeros 120 caracteres del cuerpo (lane-delegate.test.js:50), así que esos caracteres deben seguir siendo distintos entre roles.
- **Tests que lo fijan:** agents.test.js:78 y aether-lane.test.js:208.
- **Incoherencia:** n.º 14.
- **Ambiguo:**
  - L51 («unsure whether your approach is correct») manda BLOCKED o NEEDS_CONTEXT, y L69 define DONE_WITH_CONCERNS como «finished, with doubts about correctness». Un trabajo terminado con dudas cabe en ambos, y uno lleva a escalar y el otro a aprobar.
  - L26 («whole test command once before you commit») frente a run.workflow.js:659-660 («Run it … before you commit» y «a commit after each part that passes»): no queda claro si hay que correr la suite completa antes de cada commit.
- **Redundancia:** L16 es igual a run.workflow.js:668, y L31 casi igual a :674. L33-35 sobra en el agente nativo (no tiene la herramienta Agent), pero sirve en carriles.
- **Reducción:** ~400 B.

**agents/reviewer.md (4131 B).** Hace la revisión final; su modelo lo elige run.workflow.js:1644-1653. El Lead también lo llama directo (swarm SKILL:124).
- **Tests que lo fijan:**
  - roles.test.js:14-15.
  - agents-design.test.js:36-39: «- **Extra:** features nobody asked for, or over-engineering.», cuatro etiquetas en negrita, «## Declined to judge», «Return the structured report the workflow asks for».
  - evidence.test.js.
- **Ambiguo:**
  - L37 («That expectation is a requirement») choca con L48 (lo que nadie pidió es hallazgo) y con L61 (apartarlo «as outside the plan or spec»). Algo que la spec no nombra puede leerse como requisito, como extra o como declinado.
  - L46 pide calificar cada criterio y cada aceptación, y L30 limita a seis las afirmaciones que se comprueban.
- **Redundancia:** L26-31 (467 B) es igual a run.workflow.js:753-757 y no lo fija ningún test; L18 casi igual a :791.
- **Reducción:** ~500 B.

**agents/ops.md (716 B).** Casi nunca llega a un modelo: el mod responde sin modelo (ops-command.mjs:1-5). Lo fija agents.test.js:79. Incoherencia: n.º 10.
- **No tocar:** L15, que es la defensa contra inyección, ni `opsPrompt`, que el mod compara literal (ops-command.mjs:11-16).

**skills/tasks (4536 B; copia de 4511).** El Writer la carga en cada ronda de plan.
- **Tests que la fijan:**
  - speckit.test.js:70-81 (copia exacta y prefijo «Aether mode: »).
  - speckit.test.js:102-121: 13 cadenas, entre ellas «Tests are required» y «Tasks of the same wave must not own overlapping paths.».
  - speckit.test.js:123-138, templates-design.test.js:41-50 y swarm-ladder-agents.test.js:12-31.
  - plan-warnings.test.js:28-38 (la frase de Max agents).
- **Incoherencias:** n.º 4, 6 y 12.
- **Comprobado correcto contra plan.js:** Review, Area, Owns, una línea por dependencia, numeración sin huecos, la línea en blanco que cierra el bloque, Max agents sin contar ops (run.workflow.js:227) y Serves.
- **Reducción:** ~150 B (L58 y L64 repiten «in full»).

**skills/specify (3928 B; copia de 3901).** Se usa en la ronda de spec.
- **Tests que la fijan:** speckit.test.js:84-100 (las siete cabeceras y «Sirve a: C2») y templates-design.test.js:12-24 (ocho frases).
- **Incoherencia:** n.º 8.
- **Ambiguo:** L40 dice «give its class» sin nombrar las clases (`push`, `merge-main`, `publish`, `deploy`, `delete`, `credentials`, `paid-call`).
- **Reducción:** ~250 B (L39 repite L14).

**skills/plan (2517 B; copia de 2493).**
- **Tests que la fijan:** templates-design.test.js:26-39, incluida «The gate must pass before the design.».
- **Incoherencias:** n.º 2 y 7.
- **Ambiguo:** L24 dice «must pass» y L29 «keep the violation and justify it».
- **Reducción:** ~50 B.

**skills/constitution (1042 B; copia de 1010).**
- **Tests que la fijan:** solo speckit.test.js:70-81.
- **Redundancia:** L16 y L20 repiten lo mismo.
- **Ambiguo (inferido):** L14 manda «choose a reasonable principle» donde el dueño calla. Cada principio se vuelve un chequeo de la Gate (plan SKILL:25), y eso choca con judge.md:50.
- **Reducción:** ~60 B.

**speckit/preset.yml (1290 B).** Lo fija speckit.test.js:46-61. Incoherencia: n.º 16.

## Duplicados entre archivos y fuente única propuesta

1. **Skills y preset.**
   - **Qué se repite:** los cuerpos son idénticos; solo cambian `name:` y el prefijo «Aether mode: ».
   - **Quién lo exige:** speckit.test.js:70-81 y, otra vez, templates-design.test.js:45-50.
   - **Costo:** 11915 B y doble mantenimiento. En contexto solo pesan las descripciones de las cuatro skills: 459 caracteres en la lista de skills de toda sesión, también fuera de Aether (components.md:77).
   - **Fuente propuesta:** las skills, porque las carga el Writer y las pega seats.js:406.
2. **writer.md:48-83 y las skills tasks/plan.** Fuente propuesta: las skills; falta cubrir la corrección nativa.
3. **Cuerpo del agente y mensaje del workflow.**
   - **Pares duplicados:**
     - judge.md:33-34 con design.workflow.js:646-655.
     - examiner.md L23, L25 y L41-45 con :771-776.
     - reviewer.md:26-31 con run.workflow.js:753-757.
     - implementer.md:16 y 31 con :668 y 674.
     - supervisor.md:78 con :740.
     - writer.md:42 con `EDIT_ONLY` (design.workflow.js:734, seats.js:487; fijado en seats.test.js:702 y workflow-design.test.js:538).
     - SCOPE, en tres cuerpos y en cada mensaje de diseño (design.workflow.js:30; workflow-design.test.js:281).
   - **Fuente propuesta:** el cuerpo, porque llega siempre: nativo, en asiento externo y en llamada directa del Lead. Por la misma razón, el plan de lectura del Judge (design.workflow.js:663-667) debería vivir en el cuerpo.
4. **Ronda de spec.** «Saltar los pasos 1 y 2», «commit solo de spec.md» y la regla del valor por defecto reversible están tres veces: writer.md:24-29, specify SKILL:14, 16 y 47, y design.workflow.js:621-623.

## Incoherencias, de la más grave a la menos grave

1. **Alta: el Judge puede quedarse sin veredicto.** judge.md:30 manda «Verify every claim about the code … by reading the source» (y L34 lo pide para cada test y cada tarea). design.workflow.js:666 limita a «Verify at most six claims against the code» en 30 turnos. Tiene razón el plan de lectura: se añadió porque la lectura libre terminó dos veces sin veredicto (:661-662).
2. **Alta: el Writer puede detenerse a mitad de ronda.** writer.md:123 dice «stop and tell the Lead instead of guessing». plan SKILL:14 dice «Never stop to ask» y SKILL:20 «If it is wrong, say so under Risks». Tiene razón la skill, porque las preguntas viajan en `questions`. Inferido del código y sin prueba: si el Writer no escribe el plan, `aether-plan check` falla (:789) y a la segunda falla el diseño.
3. **Media: dos órdenes de respuesta chocan en el Examiner.** examiner.md:58-65 pide «Exactly this, and nothing before or after it». El workflow pide siempre `EXAMINER_SCHEMA` (design.workflow.js:868). judge.md:75 y writer.md:89 tienen la frase que conecta ambos formatos; examiner.md no la tiene. Tiene razón el esquema.
4. **Media: dato de costo viejo y costo mayor omitido.** writer.md:63 y tasks SKILL:45 dicen «about 2.3 times more». pairs.json da US$ 1.636 y 4.092 (2,50×), y models-by-role.md:67 ya dice 2.5; el 2.3 es del 2026-10-26 (A93 J3). Además omiten que `Review: xhigh|max` en cualquier unidad sube la revisión final a Opus xhigh (run.workflow.js:1646-1647, A97 D7): US$ 6.047 frente a 3.465.
5. **Baja-media: quién escribe la spec.** judge.md:12 dice «The Lead writes specs» y examiner.md:12 «The Lead wrote the spec». writer.md:12, design.workflow.js:617 y using-aether:47 dicen que la escribe el Writer.
6. **Baja-media: el área no tiene supervisor propio.** writer.md:64 y tasks SKILL:46 dicen «Each area has its own supervisor». En run.workflow.js:228 el área es solo una memoria compartida de fallos, y :1174 lanza un supervisor por intento.
7. **Baja-media: qué filas lleva la tabla Complexity.** writer.md:50 dice «each piece of complexity the plan adds» y design.workflow.js:634 «beyond the spec»; plan SKILL:36 dice «each violation the gate kept … or "None."». Ningún código lee plan.md, así que esto lo decide el dueño.
8. **Baja-media: la trazabilidad puede apagarse en silencio.** specify SKILL:37 dice «numbered R1 to Rn», pero el parser solo lee ítems «- R1» bajo un «## Requirements» exacto (plan.js:22 y :297). Con otra forma, la trazabilidad se omite sin aviso (plan.js:310).
9. **Baja: quién guarda el examen.** examiner.md:73 dice «the Lead stores the exam». Lo guarda el workflow (design.workflow.js:867-877).
10. **Baja: ops también sirve a aether:design.** ops.md:3 dice «…the aether:run workflow gives it». También lo usan aether:design, aether-plan y aether-exam (design.workflow.js:461-483 y :874; ops-command.mjs:3-4).
11. **Baja: falta definir `critical`.** supervisor.md:55-57 define solo Important y Minor, pero L61, L78 y el esquema usan `critical` (lane-schemas.js:15; run.workflow.js:29).
12. **Baja: `[US1]` remite a algo que no existe.** tasks SKILL:29-30 dice que `[US1]` «names the user story», pero la spec no numera historias (specify SKILL:36).
13. **Baja: ayuda de un comando que aún no existe.** examiner.md:37 menciona «the built command's help» y L35 dice «The feature is not built yet».
14. **Baja: vocabulario y orden viejos en el implementer.** implementer.md:3 dice «the tier», término retirado por A97 D6. L35 dice «a supervisor reads your diff as soon as you report», pero antes corre la compuerta (run.workflow.js:1364).
15. **Baja: afirmaciones sobre el modelo propio.** judge.md:16 dice «You run on Opus», writer.md:124 «billed at Sonnet prices» y las descripciones «The Lead starts it on…». Son falsas cuando la ronda va a otro harness (seats.js:552), y a estos agentes los lanza el workflow.
16. **Baja: versión del preset congelada.** preset.yml:6 tiene `version: "0.8.0"` desde ebb72a5 (2026-10-10), aunque los comandos cambiaron en 7 commits (el último, bf2bf43, del 2026-10-28).

## Lo que no pude verificar

- Si Claude Code respeta `maxTurns` y `effort` del front matter cuando el workflow pasa modelo y effort; lo supuse.
- Cómo resuelve el modelo el choque n.º 3: inferí que gana la herramienta forzada, pero no leí transcripciones.
- Si el n.º 1 sigue causando revisiones sin veredicto; no leí `runs.jsonl`.
- Qué hace el CLI de Spec Kit con `version` y con `speckit_version`.
- Si `.aether-exam/` queda fuera de git en proyectos de terceros.
- Fuera del grupo, pero lo lee el Writer: plan.js:436 cita «decision D6», que no está en docs/decisions.md.