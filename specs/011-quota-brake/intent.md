# Tarjeta de intención: el freno de la cuota de 5 horas y el trabajo que no se pierde

- **Dueño:** Christopher
- **Fecha:** 2026-10-21
- **Origen:** la corrida autónoma `auto-20261021-000725-3cae` se paró cuando se acabó el límite de sesión de Claude: el enjambre de la 010 perdió su lectura de las lanes (los 66 ayudantes de comandos corren en Claude), el reloj de la corrida contó 6.4 horas de nada, y el trabajo que las lanes habían escrito solo se recuperó porque el Lead lo buscó a mano al volver el dueño. Ver el [handoff de la 0.15.0](../../docs/handoff/2026-10-21-delegates-that-edit-0.15.0.md), sección 3.
- **Confirmada por el dueño:** el Lead escribió de vuelta lo que entendía en puntos numerados (el freno, qué se detiene, cómo se retoma, cómo se apaga, el 95 % como opción, la ventana semanal, y el guardado del trabajo de un workflow interrumpido) y el dueño respondió «Comienza a trabajar automáticamente en el freno». Una pregunta quedó sin respuesta (si las ramas de trabajo pueden subir a GitHub): se tomó lo más seguro, ver la suposición S4.

## 1. Las palabras del dueño

1. «necesito un cambio o una funcionalidad, como podrás ver cuando se acabó la cuota interrumpió la autonomía hasta que desperté me gustaría un freno que cuando la cuota de 5 hrs llegue al 95 porciento de su límite te avise y detengas todos los procesos para asegurar la continuidad de los trabajos autónomos cuando regrese la ventana de 5hr y se reinicie continúes trabajando . A menos que con petición explícita mis continúes trabajando hasta acabar».
2. «También tenemos que hacer que si un workflow se interrumpe no se pierda el trabajo primero pusheas borra el worktree y cambio local lo que habías hecho».
3. «Comienza a trabajar automáticamente en el freno».
4. Antes, sobre la política de fondo: «si la de claude code se acabo el lead no puede seguir trabajando porque depende de su cuota» (la cuota de Claude es el punto único de falla de una corrida autónoma).

## 2. La intención, en una frase

En una corrida autónoma, cuando la ventana de 5 horas de Claude llega al 95 % usado, el Lead **avisa al dueño y se detiene en orden** (nada nuevo, los workflows que corren terminan o se guardan, todo anotado), y **cuando la ventana se reinicia retoma solo**, sin perder trabajo; solo las palabras explícitas del dueño («sigue hasta acabar aunque se acabe la cuota») apagan el freno.

## 3. Lo que ya se supuso (los puntos que el dueño dejó pasar)

- **S1.** El freno vale para las **corridas autónomas**. En una sesión normal, con el dueño presente, solo avisa al 95 %.
- **S2.** El **95 %** es una opción del plugin (por defecto 95), que el dueño puede cambiar. Se mide sobre la ventana de 5 horas de toda su cuenta de Claude, no solo de esta sesión.
- **S3.** La ventana **semanal** al 95 % solo avisa: esperar su reinicio tardaría días y no es lo que el dueño pidió.
- **S4.** El trabajo de un workflow interrumpido se guarda en **ramas locales** de trabajo (un commit por unidad con lo que haya, `aether-wt salvage` ya hace algo parecido). **Subir esas ramas a `origin` es opcional** (un ajuste que el dueño enciende), porque subir es una acción que sale del equipo y no respondió si las quería en GitHub.
- **S5.** Se apaga **con las palabras del dueño**, citadas y registradas, al empezar la corrida o durante ella; sin ellas, el freno manda. Los permisos de la corrida los guarda el registro del dueño (`aether-autonomy`), que ningún agente edita a mano.
- **S6.** Retomar es **automático**: un aviso programado a la hora de reinicio de la ventana (más un margen) despierta al Lead, que lee el diario y relanza lo que quedó, con la misma corrida (`aether-plan compile --run`). Si la sesión se cerró, la siguiente lo encuentra en el diario (como ya hace `aether-autonomy` al empezar una sesión).

## 4. Lo que se midió (2026-10-21, en el código y en los tipos de la API del mod)

Los tipos de la API del mod los escribe Claude Code al cargar el mod (`plugins/aether/.claude-plugin/types/`, fuera de git); lo que sigue es lo que dicen.

- **El mod puede leer la ventana.** `$.session.usage()` trae `rateLimits`: una lista de `SessionRateLimit` con `kind` (`five_hour`, `seven_day`, o `spend_limit` de una pasarela), `percentUsed` (0 a 100, un decimal) y `resetsAt` (ISO 8601). Son «las ventanas que la última respuesta de la API reportó»; **vacía si ninguna trae lectura** (una cuenta sin ventanas, o antes de la primera respuesta). Cuándo se refresca más allá de «la última respuesta» no está escrito.
- **El mod puede mirar tras cada paso.** `register.js` ya engancha `on('turn.step')` (`meteredStep`: después de `yield* next(e)` registra el uso de ese paso y vuelca cada 20 pasos y en `turn.complete` y `session.end`), así que es el sitio donde mirar `rateLimits`. Escribe estado con `$.fs` bajo el directorio de datos (`dataDirFrom`, `readDataDir`), y sabe si la sesión es del Lead (`isAether`: el agente `aether:lead` o una marca `<datos>/sessions/<id>.json` que solo escribe `aether-session-start`).
- **El mod puede avisar al dueño y despertar al Lead.** `$.ui.notify(text, { title })` envía una notificación (resuelve `{ isSent, channel }` o `{ isSent: false, reason }`: `disabled`, `no-channel`, `no-surface`, `refused`) y `$.ui.toast`; `$.clock.after(ms, fn)` y `$.clock.every(ms, fn)` son temporizadores del mod; `$.prompt.submit({ text })` mete un prompt en la sesión «una vez ociosa», con origen `{ kind: 'plugin', name }`, que el modelo lee con el marco «el plugin X envió un mensaje» (el campo `asUser` lo haría pasar por palabras del dueño: **no se usa**, el aviso va con su marco). Un temporizador vive lo que vive la sesión.
- **El mod no tiene una API para listar o detener workflows.** Detener lo que corre lo hace el Lead (`TaskStop`, `aether-lane stop`), o los workflows mismos se detienen entre pasos mirando el freno.
- **`aether-autonomy status` calcula su `stop`** en `lib/autonomy.js` (`statusOfRun`): `null`, `'time'` si pasaron las horas del tope, `'cost'` si el gasto llegó al tope; no se guarda, se calcula. El registro (`grants.json`, `run.json`) solo lo escribe el bin (`aether-guard` lo exige). Las reglas lo leen en `skills/autonomous-runs/SKILL.md` («when `stop` is not null, start nothing new»; terminar con `end --outcome ceiling`), no en `using-aether`. Un `stop` nuevo es una rama más ahí y un texto en esa skill; **el resultado `ceiling` no sirve para el freno**, porque termina la corrida y el freno no debe: es una pausa, no un fin.
- **Lo que pasa hoy con un workflow interrumpido** (la corrida de la 010): las lanes siguieron y dejaron sus commits en las ramas de las unidades; el workflow murió con los ayudantes de comandos; un relanzamiento con `aether-plan compile --run <id>` retomó las unidades de sus ramas (el implementador las vio y las revisó). Lo que se perdió fue el **estado en memoria** del workflow (rondas, fallos, intentos) y el **reloj**; y de un agente nativo a medias, lo que no había guardado.
- **Un ayudante de comandos es una llamada a Claude** cuando el mod no lo contesta (una rama probada desde una sesión con el plugin instalado): al 95 % cada paso de un workflow gasta lo poco que queda.

**Queda por medir (es trabajo de la spec y de la prueba):** una lectura real de `rateLimits` (la prueba C7 la deja anotada); si un `$.prompt.submit` de un temporizador despierta de verdad una sesión ociosa; y qué estado de un workflow conviene guardar para que el relanzamiento no repita.

## 5. Fuera de alcance

- El freno de las **otras** cuotas (agy, grok, muse): ya se marcan secas y la elección las evita (A60, A68).
- Cambiar qué trabajo va a otros harness: es la política de A65 a A72.
- Que el dueño pueda pausar a mano una corrida (un comando suyo): se anota como propuesta.

## 6. Criterios (qué y por qué, sin el cómo)

- **C1.** En una corrida autónoma, al llegar la ventana de 5 horas al umbral, el dueño recibe un aviso y el Lead no empieza nada nuevo, los workflows en marcha se detienen sin perder trabajo y todo queda en el diario. Por: «te avise y detengas todos los procesos».
- **C2.** Cuando la ventana se reinicia, la corrida continúa sola desde el diario y el trabajo guardado, sin que el dueño haga nada. Por: «cuando regrese la ventana ... continúes trabajando».
- **C3.** Solo las palabras explícitas del dueño apagan el freno, y quedan citadas en el registro. Por: «A menos que con petición explícita ... continúes trabajando hasta acabar».
- **C4.** Un workflow interrumpido, por el freno, el límite de sesión, una caída o el dueño, deja el trabajo de cada unidad guardado en una rama, y un relanzamiento de la misma corrida continúa de ahí sin recuperación a mano. Por: «si un workflow se interrumpe no se pierda el trabajo».
- **C5.** El umbral es una opción del plugin con 95 por defecto; la semanal solo avisa; fuera de una corrida autónoma solo avisa. Por: S1 a S3.
- **C6.** En una sesión que no es del Lead de Aether el freno no hace nada (la huella dormida del plugin no cambia). Por: la invariante de `docs/reference/components.md`.
- **C7.** La prueba: pruebas automáticas con una lectura simulada del 95 %, y una lectura **real** de `rateLimits` en una sesión, anotada. No se gasta cuota real para llegar al 95 %. Por: el método de verificar en sesiones reales sin quemar la cuota del dueño.
