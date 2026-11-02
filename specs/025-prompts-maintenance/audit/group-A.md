**Veredicto.** El grupo no está limpio. Es largo, se repite entre archivos y tiene incoherencias que harían actuar mal al Lead. Total: 61.830 bytes (U 29.901 · S 20.466 · R 11.291 · L 172). Hay 24 incoherencias o datos viejos. Cinco son de gravedad media o alta: cerrar una corrida pausada por cuota, concederse un `merge-main` sin palabras del dueño, pasarle al dueño una validación que el dueño pidió que hiciera el Lead, elegir el modelo de un delegado, y apartar todas las corridas al arreglar `grants.json`. Hay 12 bloques duplicados entre archivos. Se pueden quitar unos 4,7–5,8 KB (8–9 %) sin cambiar ninguna orden, y unos 0,5 KB más de texto viejo cuyo borrado corrige al Lead. L no se toca.

Claves: U = `skills/using-aether/SKILL.md`, S = `skills/swarm/SKILL.md`, R = `skills/autonomous-runs/SKILL.md`, L = `agents/lead.md`. «U:107» es archivo y línea; «I3» remite a la lista ordenada del final.

### U — using-aether (29.901 B)

**Hechos.** `lib/session-start.js` lo inyecta solo al Lead (`agent_type` `aether:lead`), en `startup`, `clear` y `compact`. En `resume` no da salida (`tests/session-start.test.js:444`). Lo inyecta sin front matter y con `${CLAUDE_PLUGIN_ROOT}` resuelto. Son 29.379 caracteres, casi el triple del corte de 10.000: el Lead recibe una vista previa de unos 2 KB (F21, `docs/claude-code-research.md`) y luego lee el archivo con Read. Por eso cada byte se paga en cada arranque, `/clear` y compactación, y ningún recorte razonable lo baja de 10.000. Le quedan 99 bytes bajo el tope de 30.000 de los tests.

**Pines.**
- `tests/bootstrap-names.test.js`:
  - :213, nueve frases en los primeros 1.800 caracteres («Read this whole bootstrap before you act», «You start on Sonnet», «**Direct:**»…).
  - :266, «You start on Sonnet» debe coincidir con el `model:` de L.
  - :220, el orden route → three paths → delegate ladder → Models → Designing, y /Pass neither `model` nor `effort`/.
  - :173-192, las celdas 1, 2 y 4 de la tabla de modelos se comparan con `config/prices.json` y con `profile.purpose`. La última columna se puede quitar; la de velocidad no, salvo moviendo la cita.
  - :238, trece frases literales, entre ellas «record the `merge-main` grant when it is `main` or `master`» (I2).
  - :259, los flags de `verdict`.
  - :104-149, que existan los nombres y las rutas que cita.
- `tests/bootstrap-design.test.js:20-64`: las frases de Designing, la frase SCOPE (U:51) y tres regex de U:55-60.
- `tests/delegate-skill.test.js:10-40`: «AETHER-TASK:», /after Opus[^.\n]*(defer|owner's list)/, /schedule no wakeup[^.\n]*ScheduleWakeup/ y otras.
- `tests/copies-classes.test.js`: la tabla U:225-233, en el orden de `CLASSES`.
- `tests/spend-skills.test.js:20`: U:186 literal, antes de «## The owner's list».

**Incoherencias:** I2, I3, I4 (nace en U:119, U:121 y la columna «Use it for» de U:131-133), I6, I7, I8, I9, I21.

**Redundancia interna (≈1,3 KB).**
- U:176 repite U:147 (≈150 B).
- Los tres caminos se cuentan en U:15-18 (fijado), U:82-86 y U:255-259 (≈350 B). Hay que conservar «Plan tasks you build as delegate tasks follow "The delegate ladder"».
- La regla de qué preguntar al dueño aparece en U:30, U:57, U:145 y U:182 (≈250 B).
- U:24 resume U:160 (≈200 B).
- U:204 es una referencia interna (≈95 B).

**Redacción ambigua.**
- U:145 «at most five questions» frente a U:60 «while they explore… ask one question», que no pone tope. No dice si cuentan las preguntas para entender la intención.
- U:73 da `design.md` a todo cambio acotado, con Juez solo si hay riesgo. U:168 reserva el diseño corto a los cambios de riesgo. Un cambio acotado sin riesgo queda sin regla.
- U:180 manda los supuestos a «## Assumptions» del spec. Pero un spec aprobado solo cambia por diseño corto (U:170), y en una corrida U:162 los manda a la tarjeta.
- U:245 «record…, run the action, then revoke» no dice que la concesión y la acción van en llamadas separadas. El guard juzga el comando entero antes de que corra (inferido).
- U:147 no da la clave `feature_directory`, y U:161 no da el formato de `exam.json` (está en `agents/examiner.md:47`).

**Reducción.** Segura: ≈1,6–2,0 KB (5–7 %). U:3 (406 B) no llega al modelo por el hook; si `disable-model-invocation` también la saca de la lista de skills (inferido), sobra.

No tocar: los primeros 1.800 caracteres, el orden de secciones, las celdas fijadas, la tabla de clases, U:186-192, la frase SCOPE, las trece frases y los resultados de `/aether:design` (U:160-166), con los que el Lead actúa.

### S — swarm (20.466 B)

Lo invoca el modelo. Su descripción (201 B) está en la lista de skills, y el Lead lo carga al correr el swarm (U:259).

**Pines.**
- `tests/roles.test.js:47` fija literalmente S:27 y S:28 (1.604 B), en ese orden. :11-45 fija «You stay the Lead», «have the Writer fix the plan task», «Defer the minor ones» y seis frases más.
- `autonomous-runs-skill.test.js:25-38`: «as the `aether:autonomous-runs` skill says» (está en S:44, ver I1) y el bloque de S:71.
- `quota-brake-docs.test.js:31`: S:131 y S:137 literales.
- `swarm-ladder-docs.test.js`: S:8 literal y los nombres de S:59.
- `spend-skills.test.js:38`: S:148 debe ir antes de «aether-report finalize».
- Una frase cada uno: `lanes-docs.test.js:151`, `launcher.test.js:35`, `workflow-review-once.test.js:157`, `workflow-split.test.js:325` y `codex-docs.test.js:37`.
- `bootstrap-names.test.js:149` exige que algún texto nombre `config/lanes.json`; hoy solo lo nombra S:28.

**Incoherencias:** I1, I4, I10, I11, I13, I14, I15, I16, I17, I19, I20.

**Redundancia interna (≈1,2 KB).**
- S:108 y S:116 terminan con las mismas dos frases (≈320 B).
- «deferred» se explica seis veces, en S:13, S:68, S:80, S:119, S:124 y S:145 (≈500 B, respetando los pines).
- S:110 y S:114 describen el mismo bloqueo (≈150 B).
- S:44 y S:139 repiten R:36 (≈150 B).
- S:24-26 se solapa con R:17 (≈150 B).

**Reducción.** Segura: ≈1,5–2,0 KB (8–10 %). No tocar sin cambiar los tests: S:8, S:27 y S:28, aunque S:28 contiene I10, I11, I13 e I16. Tampoco la plantilla S:97-103 ni los campos del resultado (S:57-82), que el Lead lee para actuar.

### R — autonomous-runs (11.291 B)

Lo invoca el modelo; el comienzo de su descripción está fijado (`autonomous-runs-skill.test.js:12`). El Lead lo carga al recibir el permiso (U:221) o por la nota de `lib/session-start.js` cuando hay una corrida abierta.

**Pines.**
- `autonomous-runs-skill.test.js:19`: los títulos en negrita, «# Brief: <run id>» y «/aether:design reports in "rounds"».
- `quota-brake-docs.test.js:15-30`: siete frases de R:36-38 y la de R:50, literales.
- `spend-skills.test.js:29`: R:78 y R:79 dentro de «## Tiempo y costo», y «aether-report --spend --session», que solo está en R:83.
- `lanes-docs.test.js:157`: R:67.

**Incoherencias:** I1 (R tiene el lado correcto), I5, I12, I15, I18, I22, I23, I24.

**Redundancia.** R:8 dice que lo común está en U, y luego lo repite:
- R:10 ≈ U:219 (367 B).
- R:87 = U:249, literal (392 B).
- R:81 está contenido en U:249 (≈90 B).
- R:85 ≈ U:240-245 (≈600 de sus 758 B).
- R:24 ≈ U:198 y R:59 (≈100 B).
- R:83 repite U:186-190 en español (≈200 B; hay que conservar el pin).

**Reducción.** Segura: ≈1,6–1,8 KB (≈15 %). No tocar la plantilla del brief ni las frases del freno de cuota.

### L — agents/lead.md (172 B)

Solo tiene front matter, sin cuerpo, para conservar el system prompt de Claude Code. `tests/manifest.test.js:83` lo fija byte a byte. Sin incoherencias. Reducción: 0.

### Duplicados entre archivos y fuente única propuesta

1. Permiso para trabajar horas: U:219 y R:10 → U, porque decide si se carga R.
2. Apertura del brief y brief corto: U:249, R:81 y R:87 → U.
3. Un «sí» con `enforce` activo: U:245 y R:85 → U.
4. Ítem de la lista del dueño: U:198, R:24 y R:59 → U:198 fuera de corrida y R:59 dentro; R:24 remite.
5. Línea de gasto de la sesión: U:190, R:79, R:83 y S:147-148 → U. R:79 y S:148 se quedan por los pines.
6. Gasto de los asientos en una corrida: U:172 y R:42 → R. U conserva la frase de `--seats`.
7. Gasto del swarm en una corrida: R:41 y S:84-88 → R. S conserva el comando fijado.
8. Control de topes antes de lanzar: R:36, S:44 y S:139 → R.
9. Workflows apagados: U:164 y S:27 → U (S:27 está fijado).
10. Escalera del swarm: U:86 y S:8, ambas fijadas.
11. Permisos: S:24-26 y R:17 → S.
12. Orden de cuota: U:138 («weekly window renews first») y S:28 («most at risk of being lost first») dicen la misma regla (`lib/superdelegation.js:101-104`) con dos redacciones distintas.

### Incoherencias, de más a menos grave

- **I1 (alta).** S:44: «When its `stop` is not null, launch nothing, and end the run as the `aether:autonomous-runs` skill says.» R:38: «the run is paused, not ended: never run `aether-autonomy end --outcome ceiling` for it». Tiene razón R:38: `lib/autonomy.js:340` da `stop: "quota"` con `paused: true`, y el mod reanuda la corrida (`hooks/register.js:331-349`). Siguiendo S, el Lead cierra una corrida que solo estaba pausada.
- **I2 (alta).** U:107, «record the `merge-main` grant when it is `main` or `master`», suena a paso de rutina. Una concesión exige palabras del dueño que nombren la acción (U:239-243, S:151). Pero `lib/autonomy.js:62-68` solo comprueba que la cita esté en sus mensajes: cualquier frase suya de 12 caracteres le basta al Lead para fusionar en `main`.
- **I3 (media-alta).** U:139: «A real call to validate one is a `paid-call`: give the owner the exact command to run with `!`.» Choca con U:233-237 («Exit 0: it is covered. Act») y con la decisión del dueño en `specs/022-codex-harness/spec.md:19` (C9: «necesito que el lead lo haga») y :89 (la llamada queda cubierta por `aether-autonomy check paid-call`). Lo correcto: con concesión, la llamada la hace el Lead con las herramientas de Aether; llamar la CLI directamente sigue prohibido. U:139 viene de `specs/003-super-lead/spec.md:180`.
- **I4 (media-alta).** S:108 y S:116 dicen «on the model the `using-aether` Models section picks», y S:128 dice «(on Opus when Sonnet already failed at it)». Contradicen U:98 («Every delegate starts on Haiku. Pass neither `model` nor `effort`») y U:115 («never raise a model on your own reason alone»). El código ignora la petición y la anota (`lib/delegate-task.js:392`). El origen está en U:119 («Choose every model on purpose»), en U:121 y en la columna «Use it for».
- **I5 (media).** R:52, cuando `grants.json` no se puede leer: «Move the named folder aside». La carpeta de ese archivo es `.aether/autonomy/` (`lib/autonomy.js:88-94`), que guarda todas las corridas, incluida la abierta.
- **I6 (media-baja).** U:108 dice que una corrección sube «one effort up when its harness has one». En `config/ladder.json` solo sube Haiku (de `high` a `xhigh`); Sonnet y Opus tienen `"retry": "high"`. En otro harness sí sube un esfuerzo, con ese `retry` como tope (`lib/delegate-task.js:353-365`).
- **I7 (media-baja).** U:202: «`log`, the default while the guard is being proven». `lib/guard.js:735` da `log` solo cuando falta la variable; el lanzador que se distribuye (`launcher/aether-lead:31`) pone `enforce`.
- **I8 (media-baja).** U:43, «Every brief reports the five», frente a U:249, «the RADAR lines that apply».
- **I9 (baja).** U:24: «a Judge or an Examiner is never the model that wrote the document». En cambio, `lib/seats.js:50-51` (issue 64) lo admite: «the same family that wrote the document judged it: no other external pair could».
- **I10 (baja).** S:28 habla de un solo par de Muse («its pair, `muse-wonder-full-1.0` at `high`»). `config/pairs.json` tiene siete: Spark 1.3 de low a max, Wonder Full 1.0 en high y Wonder 1.0 en max (A94, A96).
- **I11 (baja).** S:28 y S:30 dicen que un fallo de Muse o de Codex «runs on the native agent». Pero S:64, `run.workflow.js:39` (`MAX_PAIR_TRIES = 3`) y `config/lanes.json` prueban antes el par siguiente.
- **I12 (baja).** R:10 remite a «"Writing and judging"», sección que ya no existe (`bootstrap-design.test.js:22`). U:219 remite a «"Designing"», que es la correcta.
- **I13 (baja).** S:28, «the Claude pair (model and effort) the plan gives it»: el plan ya no da modelo, y `lib/plan.js:168-169` ignora `Tier`.
- **I14 (baja).** S:68, «at most three haiku tasks that review at `high`»: `run.workflow.js:1641-1652` exige de 1 a 3 unidades con Review `high`, y nunca en un relanzamiento.
- **I15 (baja-media).** `<plan.md>` en S:19, S:36, S:135, S:137 y R:38 corresponde a `tasks.md` en Spec Kit (U:253). `lib/plan.js:107` falla si falta «## Aether Execution». Está fijado en `quota-brake-docs.test.js`.
- **I16 (baja).** S:28 nombra `docs/guide/lanes.md`, que el plugin instalado no incluye.
- **I17 (baja).** S:147 añade «y no es la cifra del tope» también fuera de corrida, donde no hay tope; U:190 no lo añade.
- **I18 (baja).** R:17, «Aether never turns permissions off»: el lanzador usa `bypassPermissions` salvo que `/aether:setup` haya elegido otro modo.
- **I19 (baja).** S:110 cita «`ladder spent`»; la razón real es «the ladder is spent (exhausted)» (`run.workflow.js:451`).
- **I20 (baja).** S:149, «and agy's when an agy lane ran»: `lib/report.js:806-808` guarda la versión de cada harness, no solo la de agy.
- **I21 (baja).** U:111, «or goes to the owner's list, by the repetition rule»: esa regla (U:247) solo dice diferir.
- **I22 (baja).** R:50, «session start re-arms the resume»: lo rearma el mod en el primer paso (`hooks/register.js:422`).
- **I23 (baja, inferida).** R:30 cuenta «a lane call» como algo pendiente que despierta al Lead; desde U:91, el Lead no lanza llamadas de lane.
- **I24 (baja).** R:44, «the 8-hour ceiling»: 8 h es solo el valor por defecto (`config/autonomy.json`).

### Lo que no pude verificar

- Si Claude Code le muestra al modelo la descripción de un skill con `disable-model-invocation: true` (U:3).
- Que las descripciones de L, S y R estén en toda sesión que tenga el plugin. Lo infiero de F21, medido en la versión 0.6.0.
- Que `grant … && acción` en una sola llamada se rechace. Lo infiero de que PreToolUse corre antes del comando.
- No ejecuté bins ni tests: leí las líneas de uso en el código. Tampoco medí el corte de 10.000 caracteres en la versión actual de Claude Code.
- Cursor tiene `"models": {}` en `config/lanes.json` y ningún par en `config/pairs.json`, así que nunca toma una llamada, aunque U:139 y S:28 lo nombran (lo fija `muse-skills.test.js`). No sé si es intencional.
- Mi 5–7 % para U es menor que el 8,8 % de la primera auditoría porque solo cuento recortes que no cambian órdenes, y asigno a R los duplicados que comparte con U.