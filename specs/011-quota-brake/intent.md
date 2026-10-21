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

## 4. Lo que hay que medir antes de escribir la spec

- **¿Puede el mod leer la ventana de 5 horas?** La API del mod trae `$.session.usage().rateLimits` (`five_hour`, `percentUsed`, `resetsAt`). Hay que ver cuándo se refresca (¿después de cada respuesta?), si viene vacía en alguna cuenta, y probarlo con una lectura real en una sesión.
- **¿Cómo se avisa al Lead y al dueño?** Un hook que ponga texto delante del modelo, una notificación al teléfono (`PushNotification`), el diario. Y **cómo despierta** el mod o el Lead a una hora dada.
- **¿Cómo se detiene "todo"?** Detener un workflow en marcha (`TaskStop`, el mod, o que el workflow mire el freno entre pasos), las llamadas de lane que siguen corriendo, y qué se pierde de un workflow detenido: el estado del script está en memoria, el de las unidades en sus worktrees y ramas.
- **¿Qué hace hoy un relanzamiento?** El de hoy (`--run <id>`) retomó cuatro unidades de sus ramas, pero solo porque el Lead lo supo hacer a mano.
- **El Lead pequeño:** al 95 % queda poca cuota para parar con orden; todo lo que el freno necesite del Lead debe ser pocas llamadas.

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
