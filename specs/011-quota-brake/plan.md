# El freno de la cuota de 5 horas y el trabajo que no se pierde: plan

**Spec:** [spec.md](spec.md)

## Technical context

- **Stack.** Node.js 22, CommonJS, sin dependencias; los bins `plugins/aether/bin/` son finos y la lógica vive en `plugins/aether/lib/`. Las pruebas son `node --test "tests/*.test.js"` (`npm test`, con repos desechables de `tests/helpers.js` y `tests/plan-fixtures.js`) y las del mod en `plugins/aether/hooks/*.test.ts` (`npm run test:mod`, con `claude-code/testing` y sus `mock`/stub por nombre de superficie, como `hooks/usage.test.ts` y `hooks/ops.test.ts`).
- **Lo medido en la tarjeta (sección 4) manda sobre el diseño.** El mod (`hooks/register.js`) lee `$.session.usage()` con `rateLimits` (`kind` `five_hour` | `seven_day` | `spend_limit`, `percentUsed`, `resetsAt`; lista vacía sin lectura) y engancha `on('turn.step')` en `meteredStep`, justo después de `yield* next(e)`. El mod puede `$.ui.notify(text, { title })` (resuelve `{ isSent, channel }` o `{ isSent: false, reason }`), programar con `$.clock.after(ms, fn)` (el temporizador vive lo que vive la sesión) y despertar al Lead con `$.prompt.submit({ text })` con el marco del plugin y sin `asUser`, que no se usa nunca. El mod no tiene una API para listar ni detener workflows: el Lead detiene lo que corre con `TaskStop` y `aether-lane stop`.
- **El estado de autonomía.** `aether-autonomy status` calcula su `stop` sin guardar (`statusOfRun` en `lib/autonomy.js`, sobre `<mainRoot>/.aether/autonomy/<runId>/run.json` y su `diary.md`). Es `null`, `'time'` o `'cost'`. El resultado `ceiling` termina la corrida y no sirve para una pausa. El bin es el único que escribe `grants.json` y `run.json`: `aether-guard` los protege con `AUTONOMY_PROTECTED` contra cualquier otra escritura de un agente. Las citas del dueño las comprueba `verifyQuote` contra su transcripción (así se apaga el freno, y por el mismo camino que el permiso de `push`, que ya existe).
- **El puente mod ↔ bin de hoy.** El código del mod no lee ficheros: comprueba su existencia con `$.fs.exists` (la marca de sesión que solo escribe `aether-session-start` define `isAether`; el router delegado lee su ajuste de `<dataDir>/sessions/<id>.router.json` en el lado bin, con `session.routerFile`/`readRouterSettings`) y llama a un bin suyo por `$.process.run` interpretando su línea JSON (el router llama así a `aether-route`; los agentes ops ponen las llamadas `aether-wt` y `aether-lane` del workflow en `hooks/ops-command.mjs`). El freno copia ese patrón: la decisión fina (pura) en un módulo nuevo del mod, y el estado y el diario en el bin.
- **Lo que ya hace `aether-wt` (leído en `lib/worktrees.js`).** `salvageUnit` comitea lo que una unidad dejó sin guardar, pero solo lo que el `Owns` de la tarea cubre, y lista lo demás en `left`. `ensure` reutiliza el worktree registrado con lo que hubiera dentro, sin comitear nada antes. `removeUnit` —el cierre de las unidades terminadas— salva el trabajo como parche (juntando también lo que está sin comitear, vía `git diff --cached` tras `add -A`, así que el parche es un fichero, no una rama) y borra la rama. `sweepRun` —el cierre de una corrida— hace lo mismo con cada unidad sin fusionar (parches que viven dentro de `runDir`) y borra sus ramas; `sweepStale` corre eso tras 24 h sin actividad y luego borra además el `runDir` con los parches. Así que hoy lo de un workflow interrumpido se salva como parche y una corrida relanzada lo ha de reaplicar a mano, y las unidades ya fusionadas se vuelven a relanzar con el resto (la skill del enjambre las nombra con `--only`, lo que solo funciona si el Lead sabe dónde se estaba, que es justo lo que perdió en la 010).
- **Sesión.** `aether-session-start` actúa solo para `aether:lead`, marca la sesión (`session.markSession`, que escribe el marker y los ficheros de ajuste por sesión), pasa las opciones del plugin por `CLAUDE_ENV_FILE` y trae el texto de `autonomyNote`, el que encuentra una corrida abierta.
- **Opciones.** `plugin.json`'s `userConfig` y `docs/guide/options.md` han de decir lo mismo opción a opción y defecto a defecto (`tests/docs-facts.test.js` R11).
- **Sin constitución.** `.specify/memory/constitution.md` no existe.

## Gate

- **Nothing speculative, and nothing for a hypothetical need. Pass.** Cada decisión de abajo sirve a un requisito nombrado y nada se construye «por si acaso». La ventana semanal y la sesión sin corrida solo avisan (R10, R11), una lectura que falta no detiene nada (R1), la lectura real de R17 no quema cuota (carga del Lead, no una tarea) y el freno no entra en las sesiones que no son del Lead (R12): el mod ya no hace nada ahí más allá del marcador, y ese marcador no se toca.
- **No abstraction, option, file or dependency that no requirement asks for. Fail, kept, and justified in Complexity.** Entran piezas que la spec exige como resultado pero no nombra: el estado de pausa en `run.json` con su parada `quota` (R4, R6), la llamada del mod al bin para esa pausa (el único camino que las reglas de guard permiten sobre `run.json`), un fichero de ajustes por sesión del que el mod lee el umbral y el `push` sin abrir ningún fichero (R2, R15) y un verbo `aether-wt save` que comitea cada unidad en su rama (R14, que `salvage` por sí solo no cumple: solo salva como parche lo que no cubre `Owns`, no toca las unidades ya cerradas y no se invoca por sí mismo ante una interrupción). Complexity dice qué requisito pide cada pieza, y por qué la alternativa simple pierde.

## Design

Cada decisión dice a qué sirve. Las formas exactas (comandos, salidas JSON, textos) se fijan aquí una vez y `tasks.md` las repite en sus Global Constraints.

**D1. Dos opciones del plugin y un fichero de ajuste por sesión para que el mod las lea sin abrir ningún fichero.** `plugin.json` gana dos entradas:

- `quotabrake`, un `string` (como `fallback` y `deadlines`, el plugin no usa números en `userConfig`), `'95'` por defecto, el porcentaje usado de la ventana de 5 horas en el que el freno actúa. Un valor que no sea un número finito con `0 < n ≤ 100` cae a 95 entero — igual que `parseFallback` cae a `sonnet:high` — para que cambiar la opción cambie el freno «sin cambiar nada más», en la forma en que las opciones de este plugin siempre han degradado.
- `brakepush`, un `boolean`, `false` por defecto: permite subir las ramas guardadas de un workflow interrumpido a `origin` (D5).

`lib/session.js` gana el mismo patrón que usa para el router:

```js
brakeFile(dataDir, sessionId)           // <dataDir>/sessions/<id>.brake.json
brakeSettingsFrom(env = process.env)    // -> { threshold: number, push: boolean }; CLAUDE_PLUGIN_OPTION_QUOTABRAKE / _BRAKEPUSH (un inválido es 95 y false)
readBrakeSettings(dataDir, sessionId)   // -> { threshold, push } o null si no se puede leer o no vale
```

`markSession` gana una opción `{ brake = null }` que escribe ese fichero (o borra el anterior con `null`, como hace con el del router), y `pruneSessions` lo borra con la marca. `aether-session-start` pasa `brakeSettingsFrom(process.env)` en la marca — la ruta y los valores con los que cualquier proceso de la sesión puede leerlos después — y añade al `CLAUDE_ENV_FILE`, como la superdelegación, `export AETHER_QUOTA_BRAKE=<umbral>` y `export AETHER_BRAKE_PUSH=on|off` para que el Lead los sepa en la skill de D7. *Sirve a: R2, R15; C1, C5.*

**D2. El estado vive en `lib/autonomy.js`, los verbos en `aether-autonomy`.** Tres registros nuevos en `run.json` (con los nombres que el resultado pide), escritos solo por estos verbos:

```js
run.brakeOff       = { quote, session, time, added } | null
run.quotaPauses[]  = { started, percentUsed, threshold, resetsAt, resumeAt, notify, savedUnits: [{ swarmRun, task, branch, head }] }
run.quotaCrossings[] = { at, percentUsed, threshold, resetsAt, notify }   // cruces con el freno apagado
```

`resumeAt` es el `resetsAt` más un margen fijo: `RESUME_MARGIN_MS = 120000` (dos minutos). La hora la reportó la última respuesta de la API y puede venir justa; dos minutos es el margen corto, y la hora exacta aparece en `status` y en el diario, así que un dueño que quiera otro es una línea (la spec lo deja a este plan).[1] `start()` escribe los tres; un `run.json` de antes de esta obra carece de ellos y las funciones lo tratan como vacío (el test lo fija, para que una instalación con una corrida abierta sobreviva la actualización).

```js
brakeSettings(mainRoot, { session, now, dataDir } = {})
// -> { threshold, push, openRun, brakeOff, paused: { run, resetsAt, resumeAt, percentUsed } | null,
//      notified: { five_hour: <resetsAt> | null, seven_day: <resetsAt> | null } }
recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify }, { now, dataDir } = {})
// cinco horas y con corrida abierta: { recorded: true, paused: true, run, resetsAt, resumeAt } (una pausa con el mismo resetsAt ya existe: mismo resultado más duplicate, y no se escribe dos veces)
// cinco horas con el freno apagado: { recorded: true, paused: false, brakeOff: true, run, quote }
// semanal: { recorded: false, paused: false, reason: 'weekly' }   sin corrida: { recorded: false, paused: false, reason: 'no-run' }
brakeOff(mainRoot, { quote, session }, { configDir, now } = {})
// -> { ok: true, brakeOff } o { ok: false, reason } como `grant`; ya apagado: escribe el nuevo registro verificado
recordSaved(mainRoot, saved, { now } = {})   // el mismo cuerpo JSON que escribe `aether-wt save` (D4)
// -> { recorded: true, run, savedUnits } | { recorded: false, reason: 'no-run' | 'no-pause' }
```

- `notified` es el último `resetsAt` avisado por cada ventana, en `<dataDir>/quota/state.json`, escrito y leído en el lado bin. Es lo que le falta al estado en memoria del mod cuando una sesión se cierra a mitad de pausa, para no volver a avisar de un cruce anterior al reinicio (R3).
- `recordCrossing` con `kind: 'seven_day'` no toca `run.json` (solo actualiza `notified`); una lectura de otro tipo es cosa del mod, que no la manda nunca. El bin valida `kind`, un `percentUsed` finito ≥ 0, un `resetsAt` y un `threshold` finito > 0, y cualquier otra forma sale como `{ error }`.
- El diario es del Lead, pero la entrada de la pausa la escribe el bin, al final de `diary.md` y por el camino que ya abre el diario en `start()`, porque el cruce puede suceder sin que el Lead esté en un turno:

```md

## Pausa de cuota {started}

- Ventana de 5 horas al {percent}% (umbral {threshold}%); reinicia {resetsAt}; la corrida se retoma {resumeAt}.
- Aviso al dueño: enviado.
```

La última línea es `- Aviso al dueño: no enviado ({reason}).` cuando `notify.sent` es falso. Un cruce con el freno apagado encabeza como `## Cruce de cuota sin detención {at}` y cierra diciendo cuál fue la cita que lo permitió:

```md
- El freno estaba apagado por las palabras del dueño: «{quote}».
```

`recordSaved` añade, para cada entrada que la unidad deje en su rama (las ya fusionadas se saltan, ya están en la historia), una línea pegada a la última pausa, plegada a la entrada de esa unidad (un repasar `save` la reemplaza en vez de apilarla):

```md
- Guardadas ({at}): `task-1` en `aether/{swarmRun}/task-1` ({head}), `task-2` en `aether/{swarmRun}/task-2` ({head}).
```

- `status` gana una parada y una sección. Sin nada sobre el umbral, nada cambia (el freno no detiene nada cuando falta la lectura: E9). El estatus con las tres palabras de hoy:

```js
status  = { open: true, id, diary, session, started,
            hours: { elapsed, ceiling, paused },   // `paused` en horas, ganado por las pausas
            usd: { spent, ceiling },
            idleMinutes, idle,
            stop: 'quota' | 'time' | 'cost' | null,
            quota: { paused, brakeOff, resetsAt, resumeAt, percentUsed } }
```

`hours.elapsed` es el tiempo trabajado: el de hoy menos el de las pausas acabadas y la porción ya vivida de la abierta.

- A un tiempo `now`, `stop` es `'quota'` mientras `now < resumeAt` y la pausa sigue abierta, y nunca `ceiling` por ella — el `end --outcome ceiling` sigue siendo solo para los topes de tiempo y de coste. Si además el gasto supera el tope **y** corre una pausa, la respuesta es `'quota'` primero (D2 sentencia: la pausa es la respuesta a la pregunta de la corrida — ¿sigo o sigo mirando? — y el tope se evaluará de nuevo en cuanto retome); `start nothing new` se mantiene en ambas lecturas. *Sirve a: R4, R6, R9; C1, C2, C3.*

**Los verbos del bin** (USAGE cambia, y el test del bin con él): `aether-autonomy brake-settings [--session <id>]`, `aether-autonomy brake-off --quote <text> [--session <id>]`, `aether-autonomy brake-crossing --kind five_hour|seven_day --percent <n> --resets-at <iso> --threshold <n> --notify sent|failed [--notify-reason <text>] [--session <id>]`, `aether-autonomy quota-saved --from <saved.json>`. Siguen la forma de salida del bin: los dos primeros y los dos últimos imprimen el resultado con código 0; `brake-off` sale con código 2 y `{ verified: false, reason }` cuando la cita no se verifica, como `grant`, y con `{ error: 'no open run' }` y código 1 sin una corrida abierta.

**D2′. La nota de sesión.** `autonomyNote()` de `aether-session-start` mantiene su frase actual, y cuando `status` de esa corrida dice `stop: 'quota'` le añade una segunda frase:

> `The run is paused by the quota brake: the five-hour window resets {resetsAt} and the run resumes {resumeAt}. Do not start anything of this run before then; Aether re-arms the resume in this session.`

Si `resumeAt` ya pasó, `status` ya no dice `'quota'`, así que la frase no se añade, y las pruebas de hoy no cambian. *Sirve a: R8; C2.*

**D3. El mod: un decisor puro, estado en la sesión, efectos tras cada paso.** Un fichero nuevo `plugins/aether/hooks/quota-brake.mjs` con solo funciones:

```js
initialBrakeState(settings)        // -> { five_hour: { above, resetsAt }, seven_day: { above, resetsAt } }
crossingsOf(rateLimits, threshold, state)
// -> { crossings: [{ kind, percentUsed, resetsAt }] | [], state }  (puro; state no se muta)
notifyFor(crossing, threshold)     // -> { title, text }
brakePromptFor({ percentUsed, threshold, resetsAt, run, resumeAt }) // -> string
resumePromptFor({ run, resumeAt }) // -> string
jsonFrom(stdout)                   // -> el objeto, o null
```

- **La regla de cruce, una por cada ventana.** Solo `five_hour` y `seven_day` entran; `spend_limit` y entradas sin `percentUsed` finito y un `resetsAt` en texto (o una `rateLimits` que no sea una lista) no producen cruce ni cambian nada (E9). Una ventana con `percentUsed ≥ threshold` cruza si no aparecía ya como cruzada con el MISMO `resetsAt`; una que baja por debajo del umbral deja de estar cruzada, así que un rebasar nuevo avisa otra vez (R3). El estado arranca con lo que `brake-settings` dice que ya se avisó: un `resetsAt` igual no repite el aviso ni en una sesión nueva. Sin lectura: `crossingsOf` devuelve `[]` y el estado sin tocar.
- **Los textos, exactos.** El aviso al dueño (única línea del cuerpo, título frente):

```text
title: Aether: freno de cuota
text: La ventana de 5 horas de Claude llegó al {percent}% (umbral {threshold}%) y se reinicia a las {resetsAt}.

(la semanal:)    La ventana semanal de Claude llegó al {percent}% (umbral {threshold}%) y se reinicia a las {resetsAt}. Es solo un aviso: nada se detiene.
```

El `{percent}` se escribe tal y como viene `percentUsed` (`95.4` sigue 95.4), igual que el umbral. Los prompts que el plugin somete (con su marco propio y sin `asUser`):

```text
Aether quota brake: the five_hour window is at {percent}% (threshold {threshold}%) and resets at {resetsAt}. Autonomous run {run} is now paused by the quota brake until {resumeAt}. Stop every running workflow, delegate task and lane call of this run now (TaskStop, aether-lane stop), save each swarm unit with aether-wt save and record it with aether-autonomy quota-saved, and start nothing new. Do not end the run: it resumes by itself after the reset.

Aether quota brake: the five_hour window has reset and autonomous run {run} was paused until {resumeAt}. Read the run's diary, run aether-autonomy status, and when its stop is no longer quota, relaunch the same swarm run from the saved branches (aether-plan compile --run with the same id, as the diary's Estado says) and continue the run.
```

- **El gancho en `register.js`.** El estado por sesión gana un campo `brake` (`undefined` | `null` | `{ settings, state, armedFor }`). El evento `turn.step` sigue siendo: `meteredStep` y, a su salida, `brakeStep($, state)`, y solo en esa rama (la respuesta de un ops elegido y la de un delegado externo no llegan aquí, y unos pasos sin `usage` llegan sin coste porque `brakeStep` no corre sin settings). En detalle:
  1. La primera vez, `$.process.run(['node', '<bin>/aether-autonomy', 'brake-settings', '--session', state.id])` se pide **una sola vez** y lo que salga se guarda (un fracaso deja `state.brake = null` y el freno inerte en esta sesión: el freno no entra por reintentar un spawn por cada paso). Al empezar, `settings.paused` rearma el resume (abajo) — así una sesión nueva, con la corrida ya en pausa, no espera al primer pase para aprenderlo (R8).
  2. Tras cada paso con `usage`, `$.session.usage()` se lee y `crossingsOf` decide por cada `rateLimits`. Un paso sin lectura (o un `usage()` que cae) no produce nada — el aviso nuevo solo llega de un cruce nuevo.
  3. Por cada cruce, en orden: `$.ui.notify` (el intento queda registrado en el campo `notify` que viaja al bin, su fracaso nunca lo impide), `$.process.run` con `brake-crossing`, y solo si la respuesta viene con `paused: true`, `$.prompt.submit({ text: brakePromptFor(...) })` (sin `asUser`) y `$.clock.after(ms, fn)` con ms hasta el `resumeAt` — y si ese ms ya es ≤ 0, el resume se somete en seguida. Lo mismo para armarlo al empezar: `armedFor` vale la identidad de la pausa armada, para no armarla dos veces.
  4. Todo el freno está envuelto en `try`/`catch`: un paso del modelo nunca se bloquea ni se retrasa por él, como hoy mide la superficie de meter (R12's dormant posture es ese mismo cuidado: solo una sesión de Aether llega a `brakeStep`).
- Todo ello sin tocar `hooks/ops-command.mjs`: `aether-autonomy` no es uno de los comandos de ops que el mod responde por el workflow, y el freno lo llama directo. *Sirve a: R1, R3, R7, R10, R11, R12; C1, C2, C5, C6.*

[1] El margen, con datos: la hora `resetsAt` la reportó la última respuesta de la API a más tardar en el paso que disparó el cruce, así que a lo sumo tiene un paso de antigüedad y, en una lectura real medida el 2026-10-21 (la primera antena de R17), poder que el reloj empleado del navegador entre con ±1 minuto de deriva tras varias semanas encendido. 120 segundos cubren sobrado una desviación reservada y la inexactitud del temporizador, y además encajan con la mecánica del dueño, que en el origen de la corrida contó 6.4 horas de nada; así, estirar el margen no tiene nada que ganar. Es solo un número: en `lib/autonomy.js` como `RESUME_MARGIN_MS`.

**D4. `aether-wt save <runId>` comitea cada unidad de un workflow interrumpido en su rama, y lo que borra lo hace después de comitearla.** Donde hoy el trabajo queda como parche y las ramas de una corrida relanzada lo ignoran, el guardado se hace por dentro:

```js
// lib/worktrees.js
saveRun(cwd, runId, { now = new Date() } = {})
// -> { run, at, path, units: [{ task, branch, head, merged, salvaged, committed, left }] }
mergedUnits(cwd, runId)   // los task-<n> cuyo trabajo ya está en la integración, en orden
```

- `saveRun` ordena el trabajo de cada tarea del `graph.json`: a una ya fusionada la marca sola, con la punta de su rama; a cualquier otra la pasa por la rutina que hoy vive detrás de `salvageUnit`, que comitea en su rama lo que esté sin guardar entre lo suyo (`Owns`) y nombra lo que el `Owns` no cubre en `left` — esos ficheros se dejan donde están, sin comitear, porque la sentencia de propiedad al fusionar manda sobre ellos —; sin rama, `branch: null`, `head: null`. Escribe el mismo cuerpo JSON (sin el camino) en `<runDir>/saved.json` y lo imprime (esa es la salida que `quota-saved` de D2 consume). `save` **no puede** empujar nada a `origin` — el plan no le da ningún verbo de empuje, y el empuje es la acción `push` (D5).
- `ensure()` deja de devolver el worktree con trabajo sin guardar: cuando un worktree registrado tiene trabajo sin guardar, primero lo comitea en la rama con la misma rutina que `salvageUnit` y la respuesta gana `salvaged: boolean`; cuando no hay trabajo sigue `salvaged: false`, y un `ensure` nuevo también. Así una unidad interrumpida y releída por una lane (que trabaja desde una copia de la rama) lo ve comiteado, lo que es justamente de lo que R14 se queja.
- `removeUnit` hace el mismo comiteado previo cuando va a borrar un worktree con trabajo sin guardar, para que el borrado que se le conoce — el ciclo de vida de las unidades terminadas, que la spec no toca — siempre sea un comiteado después. El parche de hoy sigue escribiéndose, así que el comportamiento de los flujos cerrados no cambia.
- `sweepRun` cambia donde hoy rompe con la spec: una unidad **sin fusionar** primero comitea su trabajo sin guardar en su rama, escribe su parche (como hoy) y **conserva la rama**, recogiéndola en un campo nuevo `savedBranches` — el cierre de una corrida interrumpida que una sesión nueva barre luego no pierde la ruta de reanudación. Las ya fusionadas y el resto de los campos, igual. `sweepRun` con `finish: true` solo borra el directorio de la corrida si `savedBranches` viene vacío (y responde `finished: boolean`). `sweepStale` recoge de ello: una corrida cuyas ramas guardadas quedaron en pie **no** se declara barrida ni pierde su `runDir` — se anota con un registro `status: 'interrupted-saved'` y se deja en su sitio para la próxima sesión.
- `mergedUnits` desciende de `unitStatus` (ya lo alimenta el grafo) y añade la historia de integración — el mensaje de la fusión ya es `Merge aether/<runId>/<taskId>` — y `adopted.json`, para que una rama cerrada y borrada antes de la interrupción no parezca nueva. Cada fuente que no puede responder aporta vacío. Sirve a D6.

*Sirve a: R14, R5; C4.*

**D5. Subir a `origin` es la opción y el permiso, por el camino de la skill.** No hay código de empuje. Cuando el ajuste esté encendido (`AETHER_BRAKE_PUSH=on` en el entorno de la sesión, D1), la skill de corridas autónomas le dice al Lead que después de un `aether-wt save` sí puede, cuando `aether-autonomy check push` responde cubierto, `git push origin <branch>` por cada rama guardada, y nunca si falta cualquiera de los dos. Es un texto de la skill, y el verbo `save` de D4 no conoce `origin`. *Sirve a: R15; C4.*

**D6. Un relanzamiento no repite las unidades ya fusionadas.** En `aether-plan compile <plan.md> --run <runId>`, cuando hay un `graph.json` anterior y ningún `--only`, las unidades que `mergedUnits` (D4) dice que ya están en la rama de integración se quedan fuera de la selección — es lo que la skill del enjambre hace a mano con `--only`, solo que sin necesitar que el Lead recuerde cuáles eran —, se anuncian por `stderr` una a una (`aether-plan: task-3 is already merged in run <runId>; it is not relaunched`), y el JSON que imprime gana un campo `alreadyMerged: ['task-3', ...]` (de paso, sus briefs no se vuelven a existir). Con todo mergeado, imprime `waves: []`, `tasks: {}` con su `alreadyMerged` y sale con código 0. Un `--only` explícito desactiva la exclusión: lo elegido a mano manda. *Sirve a: R14; C4 y C2.*

**D7. La regla escrita del Lead (skill y docs).** `plugins/aether/skills/autonomous-runs/SKILL.md` sustituye su párrafo `Ceilings` por los dos que `tasks.md` escribe exactos («Ceilings», donde `stop` `time`/`cost` conserva la regla *let what is running finish*, y «The quota brake», donde no: los workflows, las tareas delegadas y las llamadas de lane se detienen en cuanto el cruce vale, solo el paso atómico en curso y el propio guardado se terminan, entran los verbos `aether-wt save` y `aether-autonomy quota-saved`, la cita de `brake-off` y el empuje de D5) y su «Resuming» gana una frase para la sesión nueva: nombrar la hora, no empezar nada, dejar que la sesión rearme el resume. `plugins/aether/skills/swarm/SKILL.md` dice ahora que una `sweep` comitea el trabajo sin fusionar en su rama, y añade al final de la sección de relanzamiento la `save`-then-`compile --run` de D6. `docs/guide/options.md` (donde la tabla de `userConfig` se coteja en R11 de docs-facts con el manifiesto) y `docs/guide/autonomy.md` dicen lo mismo. *Sirve a: R5, R7, R8, R13, R15, R18; C1, C2, C4, C5.*

**D8. El orden deja el árbol verde a cada fusión.** Ola 1 (independientes): T1 (las dos opciones y el fichero de ajuste por sesión) y T4 (`aether-wt save`, `ensure`, `sweep` y `mergedUnits`). Ola 2: T2 (el freno en autonomía; sobre T1 para leer el umbral que imprime la marca), T5 (la exclusión al recompilar; sobre T4 por `mergedUnits`) y T6 (la skill y la página de autonomía; sobre T1, porque sus textos nombran las variables que la sesión pasa). Ola 3: T3 (el freno del mod; sobre T2 para llamar a los verbos). Ola 4: T7, las pruebas de escenario E1–E10 por el camino real, sobre T2, T3 y T4 (y toca D6 a través de T5). La lectura real de R17 no es una tarea del enjambre: la hace el Lead después, sobre el árbol ya fusionado, como en Verification. *Sirve a: R16.*

## Files

Todos los caminos vienen del repo actual (el plan no crea `specs/` más allá de este directorio).

| Archivo | Qué y por qué |
| --- | --- |
| `plugins/aether/.claude-plugin/plugin.json` | Dos entradas de `userConfig` (D1). |
| `plugins/aether/lib/session.js` | `brakeFile`, `brakeSettingsFrom`, `readBrakeSettings`; `markSession` y `pruneSessions` los tienen presentes (D1). |
| `plugins/aether/bin/aether-session-start` | La marca de D1 (T1) y la segunda frase de `autonomyNote` (D2′, T2 — fichero compartido en olas distintas). |
| `plugins/aether/lib/autonomy.js` | Los campos, `brakeSettings`, `recordCrossing`, `brakeOff`, `recordSaved`, la pausa en el diario y la sección `quota` de `status` (D2). |
| `plugins/aether/bin/aether-autonomy` | Los cuatro verbos nuevos (D2). |
| `plugins/aether/lib/worktrees.js` | `saveRun`, `mergedUnits`, `ensure` comiteando antes, `removeUnit` comiteando antes, `sweepRun` con `savedBranches`/`finished`, `sweepStale` honesto (D4). |
| `plugins/aether/bin/aether-wt` | Despacha `save` (D4). |
| `plugins/aether/bin/aether-plan` | La exclusión de las unidades ya fusionadas al recompilar con `--run` (D6). |
| `plugins/aether/hooks/quota-brake.mjs` (nuevo) | El decisor puro y los textos exactos (D3). |
| `plugins/aether/hooks/register.js` | `brakeStep` después de cada `meteredStep` (D3). |
| `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md` | La regla del Lead y la ruta de reanudación (D7). |
| `docs/guide/options.md` (Task 1, con el manifiesto) y `docs/guide/autonomy.md` (Task 6) | Las dos opciones y el comportamiento en las páginas de usuario (D7, R18). Con esto, todas las páginas que `docs-facts` exige `title`, `description` y `order` están contadas ya, sin tocar `docs/index.md`. |
| `tests/quota-brake-settings.test.js`, `tests/quota-brake.test.js`, `tests/wt-save.test.js`, `tests/plan-relaunch.test.js`, `tests/quota-brake-docs.test.js`, `tests/quota-brake-scenarios.test.js` (nuevos); `tests/aether-autonomy.test.js`, `tests/session-start-autonomy.test.js`, `tests/aether-wt.test.js`, `tests/worktrees-cleanup.test.js`, `tests/worktrees-ensure.test.js`, `tests/aether-plan.test.js` (ajustados) | Las pruebas de cada tarea. Las del mod viven en `plugins/aether/hooks/quota-brake.test.ts` (el sistema de mod las corre con `npm run test:mod`, no con `npm test`, y el plan Execution manda en ambas). |

No se toca: el router delegado ni sus opciones, `lib/superdelegation.js` ni los pares, `hooks/ops-command.mjs`, ni el barrido ni la adopción de las unidades cerradas (el ciclo de vida normal, que la spec da por bueno), ni las sesiones que no son del Lead (el marcador no se añade a ninguna). Sin despliegue: el plugin se prueba por `--plugin-dir` y se publica aparte; la sección de despliegue de la skill no aplica.

## Verification

- **Comando de prueba:** `npm test` en cada fusión, y `npm run test:mod` para la tarea del mod (T3), porque el test:mod es el único que ejecuta el sistema del mod.
- **Qué prueba cada criterio:**

| Criterio | Prueba |
| --- | --- |
| C1 | `tests/quota-brake.test.js` (el `stop: 'quota'`, la corrida sin cerrar, el diario con su hora de reinicio y el porcentaje que la causó, el `status` que ignora la pausa al contar horas) + `plugins/aether/hooks/quota-brake.test.ts` (la lectura simulada y el aviso único) + escenarios E1/E10 |
| C2 | `plugins/aether/hooks/quota-brake.test.ts` (el temporizador y los prompts en tiempo acelerado con `mock.clock`; el reloj de T2 dice sí vale ya la hora de la reanudación) + escenarios E2/E3 (el `status` pasado el `resumeAt`, el `paused` de `brake-settings`, la nota de sesión) |
| C3 | `tests/quota-brake.test.js` (la cita del dueño, su diario y su registro; los intentos no citados) + `plugins/aether/hooks/quota-brake.test.ts` (cruce con freno apagado: se avisa, no se somete nada) + escenarios E4 |
| C4 | `tests/wt-save.test.js` (la rama de cada unidad guarda lo suyo, el barrido y el `ensure` comitean antes de borrar, el `sweep --stale` honesto) + `tests/plan-relaunch.test.js` (la exclusión al recompilar) + escenarios E8 |
| C5 | `tests/quota-brake-settings.test.js` (el umbral que viene de la opción, con su marca) + `plugins/aether/hooks/quota-brake.test.ts` (semana, fuera de corrida, cuenta entera, margen) + `tests/quota-brake-docs.test.js` y `tests/docs-facts.test.js` (el `userConfig` y la página dicen lo mismo) + escenarios E5/E6 |
| C6 | `plugins/aether/hooks/quota-brake.test.ts` (no Aether: la medida de hoy y nada más) + escenarios E7 |
| C7 | La escena completa E1–E10 en `tests/quota-brake-scenarios.test.js` (fichero compartido de la ola 4, cosiendo T2, T3 y T4 por los bins) + las suites de npm y del mod y la lectura real de abajo |

Adicional a la tabla: E5 y E9 vienen en los textos de T3 (el decisor no produce nada sin cruce) y de T7 (la corrida sin abrir no se detiene ni se escribe). Y la lista de R16 encuentra su correspondencia uno a uno en los Tests de cada tarea: el cruce exacto y el justo por debajo (T3); el aviso una vez por cruce (T3); la pausa distinta de `ceiling` (T2); el resume a la hora con el margen en tiempo acelerado (T2, T3 y T7 E2); la sesión cerrada que se retoma (T2, T7 E3); la sesión reiniciada antes del reinicio que rearma y sigue sola (T3 el rearme al pedir settings, T7 E3); la tarea en marcha detenida ya (T3 el prompt del cruce, T4 el guardado); el freno apagado solo con la cita (T2, T3, T7 E4); la semanal y la sesión sin corrida que solo avisan (T3, T7 E5/E6); la que no es del Lead (T3, T7 E7); la falta de lectura (T3, T7 E9); el guardado por unidad y su relanzamiento sin repetir (T4, T5, T7 E8).

**La lectura real (R17), del Lead.** No es una tarea del enjambre; no se cuenta como paso de ninguna y `aether-plan check` la dejará como aviso. Con todo fusionado y `npm test` verde, el Lead arranca una sesión real con el árbol (`scripts/aether-lead --plugin-dir <árbol>/plugins/aether`) y anota en el brief de la compilación qué trae `rateLimits`: tipos, `percentUsed` y `resetsAt`, o que viene vacía — por medio del `state.json` del freno y el `brake-settings` de la nueva sesión, y de forma que cualquiera pueda anotar lo mismo (un procedimiento, no un juicio). En la misma visita comprueba que un `$.prompt.submit` programado con `$.clock.after` despierta una sesión ociosa: baja el umbral (`quotabrake` a `1`) y la lee. Quemar la cuota del dueño hasta el 95% para esto es justamente lo que las lecturas simuladas de R16 evitan, y así no sucede. Si la visita prueba que `$.prompt.submit` no despierta la sesión, el brief lo dice y lo deja abierto como hallazgo: el freno sigue deteniendo y registrando, y el resume es manual hasta que se cierre.

## Assumptions

- **El nombre y la forma de las dos opciones** (la spec lo deja abierto): `quotabrake` (una cadena, `'95'`) y `brakepush` (un booleano, `false`). Como `superdelegation`, `ops` y `lanes`, son minúsculas corridas y mapeadas invariablemente a `CLAUDE_PLUGIN_OPTION_QUOTABRAKE`/`_BRAKEPUSH`. Nombres intercambiables con un solo cambio en `session.brakeSettingsFrom` y en las docs.
- **Un umbral inválido es 95**, no «sin freno»: el dueño fijó el 95% como el valor de fábrica, y las opciones de este plugin no se invalidan por un valor mal escrito. Quien quiera otro lo escribe.
- **El ajuste de una sesión se pide una sola vez** (con la primera `brakeStep`, que la guarda): un plugin recompuesto con un umbral distinto se lee en la siguiente sesión. En fallo del bin, el freno queda inerte solo en esa sesión: nunca hay un spawn de Node por paso del modelo en bucle ni un paso bloqueado. Un Leitbild de severidad mayor sería reintentar, y es una línea si algún día el freno ha de ser obligatorio.
- **La salida del bin es la fuente del mod**: el mod no tiene API para leer el sistema de ficheros, y el patrón ya asentado en el router es `aether-route` vía `process.run`. El examen de cada paso carga así también con la valoración de sesión (`isAether`), que en esta obra no se toca.
- **La unidad que conserva un `left` lo deja sin comitear en el worktree**: la propiedad de `Owns` es la que decide lo que puede viajar en una fusión. El guardado pierde así el texto literal de «lo que haya», pero `left` sale en el resultado y en el diario, y la rama de la unidad no se borra en el barrido, de manera que el dueño lo encuentra. Si el dueño quiere que todo lo que esté vaya a la rama, el plan cambia en una línea: el comiteo previo en `ensure`, `removeUnit`, `sweepRun` y `salvageUnit` sería `add -A` sin la noción de `Owns`, y dejando la sentencia para el supervisor.
- **La pausa que se extiende cruza el reloj de la corrida**: `hours.elapsed` viene de `started`, con las pausas restadas. El tope de horas cuenta el tiempo trabajado y no el de la pausa, como dice R6.
- **El margen es 120 segundos**, fijo. Reversible: es un constante.
- **Lo que un `brake-settings` no encuentra, con la marca ausente, es `{ threshold: 95, push: false }`**: el bin corre igual y la sesión funciona con el valor por defecto si la marca no pudo escribirse (una sesión antigua o un `aether-session-start` que no llegó). Mejor que fallar el freno entero.
- **La página de opciones viaja con el manifiesto (T1)**: `docs/guide/options.md` se prueba con `tests/docs-facts.test.js` R11 contra el `userConfig` que está en la rama, así que las dos filas entran en la misma tarea y la misma fusión que las dos entradas del manifiesto; de otro modo cada puerta hasta la T6 daría un `npm test` rojo. La T6 conserva su dependencia de la T1 porque sus textos nombran las variables de entorno que la T1 pasa. [«Docs are held to the tree by tests» lo dice el `CLAUDE.md`.]

## Risks

- **`$.session.usage()`, `$.ui.notify`, `$.prompt.submit` y `$.clock.after` no se usan hoy en `plugins/aether/hooks/`** y el fichero de tipos del mod está fuera de git (la tarjeta lo midió sobre los tipos, no sobre el código). Los nombres de las superficies de test que la T3 registra (`session.usage`, `ui.notify`, `prompt.submit`, y el temporizador dentro de `mock.clock`) son los que da esa medición; si difieren, la tarea lo paga una vez en sus stubs, solo una línea suelta por nombre. La verificación real de que un `prompt.submit` programado despierta una sesión ociosa es parte de R17 (del Lead).
- **El freno suma un `$.session.usage()` por cada paso con `usage` en una sesión de Aether.** El metering promete que observar no retrasa; si la lectura cada paso resulta cara, el siguiente paso natural es cachearla (la lectura ya es «la de la última respuesta»). Es lectura pura, y si cuesta, la reducción es local a `brakeStep` sin tocar el resto del diseño.
- **El texto del prompt de `brakeStep` no se puede truncar** si es largo. Es un prompt de texto pequeño, dentro del límite que la plataforma mete (medido en otros prompts de control del plugin), y T3 lo fija completo en sus tests.
- **Dos sesiones del Lead en el mismo repo, con la corrida abierta en una**: ambas leen el mismo `run.json` y el mismo diario, y `sweepStale` trata a la corrida activa como quieta solo tras 24 h. `sweepRun` ya no borra las ramas sin fusionar, así que la segunda sesión no destruye el guardado de la primera; pero no hay ninguna cerradura de sesión hoy, y la spec no pide ninguna.
- **El aviso al dueño depende de su canal de Claude Code.** Con `isSent: false` reportado en el `recorded` que se ve en T3, la pausa ocurre igualmente (E10), el diario dice que el aviso no salió y qué canal falló, y el resume sigue programado. No se inventa un canal nuevo de notificación: avisa con el de la plataforma, o lo dice.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Un estado de pausa en `run.json` con su parada `quota` calculada en el bin y tres registros nuevos (D2) | R4/R6 piden la parada propia, distinta de `ceiling`, y con la hora de reinicio como campo, y R9 pide que la cita del apagado quede en el registro; la respuesta que lee `status` (y la que lee `aether-autonomy status` por la skill) está construida en el bin, no en el mod | El estado en memoria del mod no aparecería en `status` ni en el diario y moriría con la sesión. Escribir el diario a mano por el Lead no se puede (la pausa viene de un cruce a mitad de un paso, sin un turno del Lead que la vea) |
| El mod llama a `aether-autonomy` por `$.process.run` para leer los ajustes y registrar un cruce (D2/D3) | R3/R4/R9 obligan a que el estado viva en `run.json`/el registro del dueño y `aether-guard` reserva esos dos ficheros al bin; el mod no tiene acceso al sistema de ficheros más allá de `$.fs` con una ruta jaulada | El estado solo en memoria en el mod. El mod escribiendo `run.json` por su cuenta con `$.fs` (la ruta no es soluble para el mod: su directorio de datos es por plugin y el de autonomía por repo). El Lead interrumpiendo un turno para comprobarlo (no llega entre pasos) |
| Un fichero de ajuste `<id>.brake.json` en el directorio de datos, junto al del router (D1) | R2 pide que el umbral venga de una opción y R15 que el `push` también; el mod no puede leer el entorno de proceso ni el manifiesto | Poner el umbral en un fichero de texto simple y que el bin lo parsease de ahí cada vez (replicar el parser). Una opción con el valor a fuego en el prompt de la skill (entonces la opción no hace nada en el mod) |
| Un verbo `aether-wt save <run>` que comitea cada unidad en su rama y un barrido que conserva la rama (D4) | R14 y R5 piden el trabajo de cada unidad *en su rama*, para que un relanzamiento continúe de ahí sin recuperación a mano; hoy el guardado es un parche en disco que nada reaplica por sí mismo | Quedarse con los parches de `removeUnit`/`sweep`. Comitear solo con `--keep-patch` (sigue siendo un parche). Empujar a `origin` para que se pierda menos (una acción fuera del equipo, no aprobada) |
