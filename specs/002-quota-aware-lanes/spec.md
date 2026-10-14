# Lanes por cuota: primero el cómputo que se perdería

- Date: 2026-10-13
- Status: Draft, revision 3 (after the Judge's `revise` of revisions 1 and 2)
- Intent: que cada llamada del swarm que un lane puede tomar vaya primero a la cuota externa que más riesgo corre de perderse en su reinicio, leída por Aether sin preguntar, como diseño sostenible del plugin: la superdelegación de RADAR (C3). En palabras del dueño:
  - «La cuenta que se debe de usar primero es la más próxima a vencerse, es decir, en esto usualmente dan por semana. Si el reinicio semanal de una cuenta viene antes que el de otra pero no se ha gastado, se tiene que usar la que podría desperdiciar cómputo.»
  - «tú mismo respóndete, entre grok y agy dime cuál cuota se reinicia antes»
  - «Hay que diseñar esto para el plugin de una buena manera y sostenible, al final es super delegación.»
  - «porcentajes iguales sí»
  - «hay que hacer un script que cuando el que necesite saber el dato de la cuota pueda saber el dato abriendo la interfaz y así, mientras buscamos otro método.»
- Decidido con el dueño el 2026-10-13: la prioridad es el saldo semanal entre las horas que faltan para su reinicio; Aether lee la cuota de cada plan por su cuenta; las fracciones de planes distintos se comparan iguales; la cuota de Grok se lee, por ahora, abriendo su interfaz sin prompt, mientras se busca otro método.
- Supersedes: A21 («the one external model that may replace it»: ahora puede haber varios por rol y nivel), el orden fijo de A37 (la opción `harnesses` deja de ser el orden principal y queda como desempate y como orden de los grupos sin lectura), y el paso de A20 de una cuota agotada al nativo (ahora pasa al siguiente candidato, y al nativo solo cuando no queda ninguno).

## Context

Hoy la lane de una llamada se fija al compilar: `lanesArgs` (`plugins/aether/lib/lanes.js`) guarda una sola lane por rol y nivel nativo, `lanes.calls[role][tier]`, la del primer harness habilitado en el orden de `harnesses`, y `validLanes` (`plugins/aether/workflows/run.workflow.js:114-126`) solo acepta esa forma. En la corrida:
- `readQuota` (run.workflow.js:311-327) lee `aether-lane status` al empezar cada ola y arma `dryGroups` en memoria.
- `laneFor` (run.workflow.js:331-341) toma la lane de `lanes.calls`, la descarta si su grupo está en `dryGroups`, y si el pool de su harness está lleno la llamada va al nativo (`overflow`).
- `laneCall` ocupa el lugar en el pool antes de `start` (run.workflow.js:351-352) y pasa `--model <lane model>`; `start` (`plugins/aether/lib/lane-calls.js:245-270`) saca el harness del modelo, lee la cuota de ese grupo y, si está bajo `reserve` (5%), devuelve `unavailable: 'quota'`; la llamada va entonces al nativo, aunque otra lane del mismo nivel tenga cuota de sobra.

Solo agy informa su cuota (`agy -p /usage --output-format json`: grupos con ventanas `weekly` y `5h`, cada una con `remaining_fraction` y `reset_time`); grok, codex y cursor la dan como desconocida.

Lo que se encontró el 2026-10-13/14:
- **agy:** «Gemini Models» semanal 100%, se reinicia el 2026-10-21 03:35 UTC; «Claude and GPT models» semanal 0.2%, se reinicia el 2026-10-16 04:41 UTC; las dos ventanas de 5 h al 100%.
- **grok:** `grok -p /usage` no da la cuota (manda el texto al modelo). Al abrir su interfaz, grok escribe en `~/.grok/logs/unified.jsonl` líneas `billing: fetched credits config` con `pid`, `ts` y `currentPeriod` (`USAGE_PERIOD_TYPE_WEEKLY`, del 2026-10-10 09:08:51 UTC al 2026-10-17 09:08:51 UTC; el ancla es el sábado 09:08:51 UTC desde el 5 de septiembre). En grok 1.0.13 traían `creditUsagePercent` (21, 22, 23 y 100); las dos lecturas de 1.0.41 no lo traen. grok busca actualizaciones al arrancar salvo con `GROK_DISABLE_AUTOUPDATER`.
- Con esas lecturas el orden correcto para una llamada de nivel haiku es Grok 4.7 (≈0.013 por hora), luego Gemini 3.8 Flash (≈0.006 por hora); la de nivel sonnet u opus va al nativo hasta el 16, porque Claude en agy está bajo la reserva.

Los modelos de la tabla de lanes siguen las tres reglas del índice de modelos (`docs/models/models.json`): solo la generación más nueva de cada línea, solo lo que el CLI del harness lista, y cada modelo con su perfil escrito desde las páginas de su fabricante.

## Criteria

- **C1 · Delegación (C3 de RADAR).** Cada llamada del swarm que un lane puede tomar va a la lane cuyo grupo de cuota tiene más saldo semanal por hora restante hasta su reinicio, entre las usables. Evidencia: tests con lecturas simuladas eligen la lane esperada; con las lecturas del 2026-10-14, una llamada de implementer de nivel haiku va a Grok 4.7 y no a Gemini 3.8 Flash, y una de nivel sonnet va al nativo. Que estos tests pasen sobre los fixtures no resuelve A3: el 0% usado de Grok se comprueba aparte.
- **C2 · Autónomo.** Aether lee la cuota y el reinicio de cada plan por su cuenta; nunca le pide al dueño una fecha, un saldo o un presupuesto. Evidencia: los lectores de agy y grok funcionan sobre salidas reales guardadas como fixtures, y `aether-lane quota` y `aether-lane status` muestran cada grupo con su lectura y su fuente.
- **C3 · Robusto y sostenible.** La regla es una sola y no cambia al agregar un harness o cambiar un plan: cada harness aporta su lector de cuota. Una lectura que falla nunca rompe una llamada ni una corrida. Evidencia: un harness con lector simulado entra en el orden sin tocar la regla; un test por cada forma de falla de lectura y de arranque termina en el siguiente candidato o en el nativo.
- **C4 · Robusto, sin bajar la calidad.** La cuota solo elige entre lanes equivalentes: el mismo rol y el mismo nivel nativo, con modelos que el índice da como vigentes, ofrecidos y con perfil. Nunca se sube ni se baja de nivel por cuota. Evidencia: un test sobre los archivos del repo comprueba la tabla contra el índice (R17); un test de selección comprueba que sin candidato del nivel la llamada va al nativo de ese nivel.
- **C5 · Rápido.** Elegir la lane no frena la corrida. Evidencia: con reloj simulado, un grupo no se lee más de una vez dentro de la vida de su lectura; elegir con lecturas vigentes no lanza ningún proceso; abrir la interfaz de grok nunca ocurre mientras una llamada ocupa un lugar en un pool.
- **C6 · Visible.** El dueño y el Lead ven qué cuota se gastó y por qué; el brief reporta la Delegación, como pide RADAR para cada brief. Evidencia: `aether-lane quota`, `aether-lane status`, el diario de lanes, `aether-report` y el brief dan por grupo el saldo, el reinicio y las llamadas, y por llamada el orden de candidatos y la razón de la elección.

## User scenarios

1. **Las lecturas de hoy.** Dados agy con «Gemini Models» al 100% (reinicio el 21) y «Claude and GPT models» al 0.2% (reinicio el 16), grok al 0% usado (reinicio el 17), y los lanes con `harnesses` `agy,grok`, cuando el swarm pide un implementer de nivel haiku, entonces la llamada corre en `grok-4.7`, y el diario registra el orden Grok, Gemini con la prioridad de cada uno. Cuando pide un implementer de nivel sonnet, entonces la llamada va al nativo, y el diario dice que el único candidato, Claude en agy, está bajo la reserva.
2. **Un grupo se agota a mitad de corrida.** Dado el escenario 1, cuando una llamada en Grok termina con motivo `quota`, entonces Grok queda marcado como agotado en disco; como su lectura no trae saldo explícito, la marca vence a los 60 minutos y se renueva si Grok vuelve a terminar por cuota. Mientras dura, la llamada siguiente de nivel haiku va a Gemini 3.8 Flash, la que estaba en curso no se mueve, y una lectura de grok sin `creditUsagePercent` no quita la marca.
3. **Un arranque que falla.** Dado el escenario 1, cuando `start` en Grok devuelve `unavailable` por cualquier motivo (no instalado, workspace, cuota), entonces el swarm prueba la misma llamada en Gemini 3.8 Flash, y solo si tampoco arranca va al nativo.
4. **Pool lleno.** Dado que el pool de grok está lleno, cuando el swarm pide un implementer de nivel haiku, entonces la llamada va al siguiente candidato con lugar libre, y cuenta como `overflow` solo si no queda ninguno.
5. **Tras un reinicio.** Dado que el 16 a las 04:41 UTC Claude en agy vuelve al 100% con reinicio el 23, cuando el swarm pide un implementer de nivel sonnet, entonces la llamada va a Claude Sonnet 5.5 en agy.
6. **Lectura vieja de grok.** Dado que la última lectura de grok tiene más de 30 minutos o es de un periodo terminado, cuando empieza una ola, entonces la lectura conserva su lugar en el orden mientras su periodo siga en curso, y el paso de cuota de la ola abre la interfaz de grok sin prompt (a lo sumo 20 segundos), lee la línea nueva y la usa. Si no consigue una, sigue con la lectura anterior del periodo en curso; solo si no hay ninguna del periodo en curso, grok queda como desconocido y se ordena después de los grupos con lectura.
7. **Un harness sin lector.** Dado codex habilitado con modelos en la tabla y sin lector de cuota, cuando el swarm pide una llamada de su nivel, entonces codex va después de los grupos usables con lectura, en el orden de `harnesses`, y antes del nativo.
8. **Nada usable.** Dado que ningún candidato del nivel es usable ni desconocido, cuando el swarm pide la llamada, entonces corre en el nativo, sin preguntar al dueño y sin cambiar de nivel.
9. **Para quien necesite el dato.** Dado el dueño o el Lead en una terminal, cuando corren `aether-lane quota --refresh`, entonces ven, por harness y grupo, el saldo, el reinicio en UTC y en hora local, las horas que faltan, la prioridad, si es usable, la fuente y la edad de la lectura.

## Requirements

Lectura de cuota:
- R1. Cada adaptador de harness informa la cuota de cada grupo como ventanas con `remaining` (de 0 a 1) y `resetsAt` (UTC), o como `unknown`. Sirve a: C2, C3.
- R2. El lector de agy sigue siendo `agy -p /usage --output-format json`, con sus ventanas `weekly` y `5h`. Sirve a: C2.
- R3. El lector de grok toma, de los últimos 1 MB de `~/.grok/logs/unified.jsonl`, la línea `billing: fetched credits config` más nueva por `ts`: una ventana `weekly` con `remaining` = 1 − `creditUsagePercent`/100 y `resetsAt` = `currentPeriod.end`. Tolera una última línea cortada y las líneas de una sesión de grok que el dueño tenga abierta. Una lectura cuyo periodo ya terminó no vale. Una del periodo en curso vale para ordenar hasta que ese periodo termina, con su edad a la vista: nunca pasa a `unknown` por vieja. Dentro de una corrida, la lectura del paso de cuota de una ola vale para toda la ola, y el paso de la ola siguiente la refresca si tiene más de 30 minutos. Sirve a: C1, C2, C3.
- R4. Un `creditUsagePercent` ausente en una lectura que trae `currentPeriod` cuenta como 0% usado, con una marca `usedPercentAbsent` que la sigue a todas partes (estado, diario, reporte). Sirve a: C1, C2.
- R5. Refrescar la lectura de grok (provisional, mientras se busca otro método): Aether abre la interfaz de grok con `script(1)` de util-linux (sin dependencias de npm; los lanes ya son solo de Linux), en un directorio temporal nuevo y vacío, con el entorno de las lanes (`laneEnv`) más `GROK_DISABLE_AUTOUPDATER=1`, sin prompt y sin flags de aprobación, en su propio grupo de procesos. Reconoce la lectura nueva por un `ts` posterior al arranque (la prueba principal; el `pid` de la línea es el del proceso de grok que lanza `script`, no el de `script`, y solo sirve como prueba adicional); en cuanto aparece, o a los 20 segundos, mata el grupo de procesos (TERM y, a los 2 segundos, KILL) y borra el directorio. Un candado hace que varios refrescos a la vez esperen al que corre y usen su resultado. Si no aparece una lectura nueva, el grupo es `unknown`. Sirve a: C2, C3, C5.
- R6. El refresco de R5 corre solo en el paso de cuota de la ola y en `aether-lane quota --refresh`; nunca dentro de `start` ni mientras una llamada ocupa un lugar en un pool. Sirve a: C5.
- R7. `aether-lane quota [<harness>...] [--refresh] [--json]`, sin corrida, muestra por harness y grupo el saldo de cada ventana, el reinicio en UTC y en hora local, las horas que faltan, la prioridad, si es usable sobre `reserve`, la fuente y la edad de la lectura. Es el camino para que el dueño o el Lead sepan el dato. Sirve a: C2, C6.
- R8. Una lectura que falla, que no se entiende o que tarda más que su límite deja el grupo en `unknown` y nunca hace fallar la llamada ni la corrida. Sirve a: C3.

Orden y elección:
- R9. La prioridad de un grupo usable es el `remaining` de su ventana más larga (la de `resetsAt` más lejano) dividido entre las horas que faltan para ese reinicio, con un mínimo de una hora. Las fracciones de planes distintos se comparan iguales. Sirve a: C1.
- R10. Un grupo es usable cuando todas sus ventanas tienen `remaining` por encima de `reserve`, como hoy, y no tiene una marca de agotado vigente (R14). Sirve a: C1, C4.
- R11. Compile guarda, por rol y nivel, todos los candidatos: las lanes de los harnesses habilitados e instalados cuyo modelo sirve el rol y reemplaza ese nivel (`replaces`). El workflow sigue aceptando los args compilados antes de este cambio (una lane por rol y nivel), leídos como una lista de un candidato. Sirve a: C1, C3, C4.
- R12. El orden de los candidatos es: primero los de grupo usable con lectura, por prioridad descendente (en un empate, el reinicio más cercano, y luego el orden de `harnesses`); después los de grupo `unknown`, en el orden de `harnesses`; los de grupo no usable quedan fuera. Sirve a: C1, C3, C4.
- R13. Para cada llamada, el workflow recorre los candidatos en ese orden: toma el primero cuyo pool tiene lugar; si su `start` devuelve `unavailable` por cualquier motivo, libera el lugar y prueba el siguiente; la llamada va al nativo de su nivel solo cuando no queda candidato, y cuenta como `overflow` solo si fue por pools llenos. El orden se calcula con las lecturas de la ola y con la lectura que cada llamada toma al terminar (`quotaAfter`), sin lanzar procesos. Sirve a: C1, C3, C4, C5.
- R14. Una llamada que termina con motivo `quota`, o un `start` que devuelve `unavailable: 'quota'`, deja una marca de agotado para su grupo en el directorio de datos de Aether, que sobrevive a las olas y a las corridas. La marca vence en el `resetsAt` del grupo solo cuando una lectura con saldo explícito confirma que el grupo está bajo la reserva. En cualquier otro caso (un límite de ritmo como un 429, un grupo sin lectura, o una lectura de grok con `usedPercentAbsent`), la marca vence a los 60 minutos, y se renueva si la llamada siguiente en ese grupo vuelve a terminar por cuota. Una lectura con `usedPercentAbsent` nunca quita una marca antes de que venza. Sirve a: C1, C3.

Visibilidad:
- R15. `aether-lane status` muestra, por grupo, lo mismo que R7 más su marca de agotado, y, por rol y nivel, el orden de candidatos que resulta. Sirve a: C2, C6.
- R16. Cada llamada registra en el diario de lanes el orden de candidatos con su prioridad y la razón por la que se eligió el suyo, o por la que fue al siguiente o al nativo. Sirve a: C6.
- R17. Un test sobre los archivos del repo comprueba que cada modelo de la tabla de lanes con un rol del swarm (implementer, supervisor, reviewer) está en `docs/models/models.json` como vigente, ofrecido por su harness y con perfil; y que cada modelo que solo nombran los asientos de diseño (`designSeats`) está ahí como modelo en uso o en `notOffered`, con perfil. Sirve a: C4.
- R18. `aether-report` y el brief dan, por grupo, las llamadas de la corrida, el saldo al empezar y al terminar y su próximo reinicio: es la cifra de Delegación que RADAR pide en cada brief. Sirve a: C6.

Sostenibilidad y pruebas:
- R19. Agregar un harness es agregar su adaptador con su lector de cuota (o `unknown`) y su entrada en la tabla; la regla de orden no cambia. La documentación de lanes lo explica, y dice que el lector de grok es provisional. Sirve a: C3.
- R20. Los lectores se prueban con salidas reales guardadas como fixtures: la de `agy /usage` del 2026-10-14, una línea del log de grok 1.0.41 sin `creditUsagePercent` y una de 1.0.13 con él. El refresco de R5 se prueba con un proceso simulado: se detiene con la línea nueva, mata el grupo, vence a los 20 segundos, el candado hace que un segundo pedido use el resultado del primero, y el directorio temporal desaparece. Sirve a: C2, C3, C5.

## Proposals

- **Otro método para la cuota de Grok** sin abrir su interfaz, como pidió el dueño («mientras buscamos otro método»): probar si el protocolo de agente (`grok agent stdio`, ACP) expone la facturación en `initialize` o en un método `x.ai/*`, o si grok publica un comando o un archivo de estado con ella.
- Que la suscripción nativa de Claude Code entre en el orden: también tiene límites semanales, pero hoy no hay un lector conocido de su cuota.
- Un presupuesto de llamadas por ventana, puesto en la tabla, para un harness sin lector (el 2b.4 del roadmap). El dueño prefiere que Aether lea la cuota por su cuenta, así que solo entraría si un harness no deja leerla de ninguna forma.
- Lectores de cuota para codex y cursor, cuando esos harnesses entren en uso.

## Assumptions

- **A1 · Decidido por el dueño (2026-10-13).** Las fracciones de planes distintos se comparan iguales («porcentajes iguales sí»).
- **A2 · Decidido por el dueño (2026-10-13).** La cuota de Grok se lee abriendo su interfaz sin prompt, con las salvaguardas de R5, mientras se busca otro método (ver Proposals).
- **A3 · Para el dueño.** Un `creditUsagePercent` ausente es 0% usado (R4). Base: las lecturas de 1.0.13 lo traían cuando era 21, 22, 23 o 100, y el formato del log omite los campos en cero; las dos lecturas de 1.0.41 no lo traen. Riesgo: si 1.0.41 lo quitó para siempre, Grok se leería siempre al 100% y siempre iría primero; R14 evita que una lectura así borre una marca de agotado, y que un límite de ritmo deje a Grok fuera por días. Se comprueba con una lectura de 1.0.41 tomada después de gastar cuota de Grok de verdad: si el campo no aparece, el lector pasa a dar el saldo de Grok como desconocido y solo su reinicio como conocido. Reversible.
- **A4.** La ventana que define el riesgo de pérdida es la más larga (la semanal); la de 5 horas solo cuenta para saber si el grupo es usable. Base: el dueño habló de la cuota semanal. Reversible.
- **A5.** Los grupos sin lectura van después de los grupos con lectura, en el orden de `harnesses`. Base: sin lectura no se sabe si hay cómputo en riesgo. Reversible.
- **A6.** La vida de una lectura es de 10 minutos para agy y de 30 para grok; el mínimo de horas en la prioridad es 1; una marca de agotado que ninguna lectura con saldo explícito confirma vence a los 60 minutos. Base: agy tarda segundos en dar su lectura, grok necesita abrir su interfaz. Reversible en la tabla.
- **A7.** La reserva sigue en 5% (`reserve` de la tabla). Base: es la de hoy. Reversible.
- **A8.** La hora local de `aether-lane quota` y `aether-lane status` es la del reloj de la máquina (hoy UTC−6). Reversible.
- **A9.** Un `start` que no arranca prueba el siguiente candidato antes del nativo (R13), en lugar de ir directo al nativo como decía A20. Base: la intención es no desperdiciar cómputo, y otro candidato del mismo nivel es equivalente. Reversible.

## Irreversible actions

- **Una llamada real por harness para validar** (clase: llamada pagada, contra la cuota del plan, unos $0.03 en grok): `node scripts/lane-smoke.js grok grok-4.7`. La corre el dueño con `!`, porque el clasificador de permisos de Claude Code bloquea lanzar grok con aprobación total.
- **Push y pull request de la rama** (clase: publicación): `git push -u origin <rama>` y `gh pr create`. Son decisión del dueño.
- **Merge a main** (clase: merge a main): el dueño lo hace en GitHub.

## Out of scope

- **Los asientos de diseño** (`designSeats`: Judge, Writer, Examinador). Sus listas son preferencias de calidad que eligió el dueño (A39–A43), no modelos equivalentes de un nivel, así que la cuota no las reordena; un asiento sigue saltando a su siguiente opción o al nativo cuando su grupo no tiene cuota, como hoy.
- Lectores de cuota de codex y cursor: esos harnesses no están en uso (regla 2 del índice).
- La cuota de la suscripción nativa de Claude Code.
- Mover una llamada en curso a otra lane.
- Cambiar de nivel por cuota, o cambiar qué modelo de la tabla reemplaza a qué nivel: eso es trabajo del índice y de la tabla de lanes.
- Gemini 4 Argon como modelo del swarm: agy no lo ofrece todavía en el plan del dueño; sigue en `designSeats` y en `notOffered` del índice.
