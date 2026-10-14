# Lanes por cuota: primero el cómputo que se perdería

- Date: 2026-10-13
- Status: Draft
- Intent: que cada llamada que un lane puede tomar vaya primero a la cuota externa que más riesgo corre de perderse en su reinicio, leída por Aether sin preguntar, como diseño sostenible del plugin: la superdelegación de RADAR (C3). En palabras del dueño:
  - «La cuenta que se debe de usar primero es la más próxima a vencerse, es decir, en esto usualmente dan por semana. Si el reinicio semanal de una cuenta viene antes que el de otra pero no se ha gastado, se tiene que usar la que podría desperdiciar cómputo.»
  - «tú mismo respóndete, entre grok y agy dime cuál cuota se reinicia antes»
  - «Hay que diseñar esto para el plugin de una buena manera y sostenible, al final es super delegación.»
- Decidido con el dueño el 2026-10-13: la prioridad es el saldo semanal entre las horas que faltan para su reinicio (el ritmo al que habría que gastar para no perder nada); Aether lee la cuota de cada plan por su cuenta.

## Context

Hoy la lane de una llamada se fija al compilar: `lanesArgs` (`plugins/aether/lib/lanes.js`) da una sola lane por rol y nivel nativo, la del primer harness habilitado en el orden de la opción `harnesses`. Al arrancar la llamada, `aether-lane start` (`plugins/aether/lib/lane-calls.js`) lee la cuota de ese grupo y, si está bajo `reserve` (5%), devuelve `unavailable: 'quota'` y la llamada va al nativo, aunque otra lane del mismo nivel tenga cuota de sobra. La cuota solo se usa como filtro, nunca para elegir. Solo agy la informa (`agy -p /usage --output-format json`: grupos con ventanas `weekly` y `5h`, cada una con `remaining_fraction` y `reset_time`); grok, codex y cursor la dan como desconocida.

Lo que se encontró el 2026-10-13/14:
- **agy:** «Gemini Models» semanal 100%, se reinicia el 2026-10-21 03:35 UTC; «Claude and GPT models» semanal 0.2%, se reinicia el 2026-10-16 04:41 UTC; las dos ventanas de 5 h al 100%.
- **grok:** `grok -p /usage` no da la cuota (manda el texto al modelo). Al abrir su interfaz, grok escribe en `~/.grok/logs/unified.jsonl` una línea `billing: fetched credits config` con `currentPeriod` (`USAGE_PERIOD_TYPE_WEEKLY`, del 2026-10-10 09:08:51 UTC al 2026-10-17 09:08:51 UTC; el ancla es el sábado 09:08:51 UTC desde el 5 de septiembre) y `creditUsagePercent` (21, 22, 23 y 100 en lecturas viejas; ausente en la de hoy).
- Con esas lecturas el orden correcto para una llamada de nivel haiku es Grok 4.7 (≈0.013 por hora), luego Gemini 3.8 Flash (≈0.006 por hora); la de nivel sonnet u opus va al nativo hasta el 16, porque Claude en agy está bajo la reserva.

Los modelos de la tabla de lanes siguen las tres reglas del índice de modelos (`docs/models/`): solo la generación más nueva de cada línea, solo lo que el CLI del harness lista, y cada modelo con su perfil escrito desde las páginas de su fabricante.

## Criteria

- **C1 · Delegación (C3 de RADAR).** Cada llamada que un lane puede tomar va a la lane cuyo grupo de cuota tiene más saldo semanal por hora restante hasta su reinicio, entre las usables. Evidencia: tests con lecturas simuladas eligen la lane esperada; con las lecturas del 2026-10-14, una llamada de implementer de nivel haiku va a Grok 4.7 y no a Gemini 3.8 Flash, y una de nivel sonnet va al nativo.
- **C2 · Autónomo.** Aether lee la cuota y el reinicio de cada plan por su cuenta; nunca le pide al dueño una fecha, un saldo o un presupuesto. Evidencia: los lectores de agy y grok funcionan sobre salidas reales guardadas como fixtures, y `aether-lane status` muestra cada grupo con su lectura y su fuente.
- **C3 · Robusto y sostenible.** La regla es una sola y no cambia al agregar un harness o cambiar un plan: cada harness aporta su lector de cuota. Una lectura que falla nunca rompe una llamada ni una corrida. Evidencia: un harness con lector simulado entra en el orden sin tocar la regla; un test por cada forma de falla de lectura termina en el orden fijo o en el nativo.
- **C4 · Robusto, sin bajar la calidad.** La cuota solo elige entre lanes equivalentes: el mismo rol y el mismo nivel nativo, con modelos que el índice da como vigentes, ofrecidos y con perfil. Nunca se sube ni se baja de nivel por cuota. Evidencia: un test sobre los archivos del repo comprueba que cada modelo de la tabla de lanes está en el índice como vigente, ofrecido y con perfil; un test de selección comprueba que sin candidato usable del nivel la llamada va al nativo de ese nivel.
- **C5 · Rápido.** Elegir la lane no frena la corrida. Evidencia: con reloj simulado, un grupo no se lee más de una vez dentro de la vida de su lectura, y elegir con lecturas vigentes no lanza ningún proceso.
- **C6 · Visible.** El dueño y el Lead ven qué cuota se gastó y por qué. Evidencia: `aether-lane status`, el diario de lanes, `aether-report` y el brief dan por grupo el saldo, el reinicio y las llamadas, y por llamada el orden de candidatos y la razón de la elección.

## User scenarios

1. **Las lecturas de hoy.** Dados agy con «Gemini Models» al 100% (reinicio el 21) y «Claude and GPT models» al 0.2% (reinicio el 16), grok al 0% usado (reinicio el 17) y los lanes con `harnesses` `agy,grok`, cuando el swarm pide un implementer de nivel haiku, entonces la llamada corre en `grok-4.7`, y el diario registra el orden Grok, Gemini y la prioridad de cada uno. Cuando pide un implementer de nivel sonnet, entonces la llamada va al nativo, y el diario dice que el único candidato, Claude en agy, está bajo la reserva.
2. **Un grupo se agota a mitad de corrida.** Dado el escenario 1, cuando una llamada en Grok termina con motivo `quota`, entonces Grok queda no usable hasta su reinicio o hasta una lectura nueva, la llamada siguiente de nivel haiku va a Gemini 3.8 Flash, y la que estaba en curso no se mueve.
3. **Tras un reinicio.** Dado que el 16 a las 04:41 UTC Claude en agy vuelve al 100% con reinicio el 23, cuando el swarm pide un implementer de nivel sonnet, entonces la llamada va a Claude Sonnet 5.5 en agy.
4. **Lectura vieja de grok.** Dado que la última lectura de grok en su log tiene más de 30 minutos o es de otro periodo, cuando una llamada necesita la cuota de grok, entonces Aether abre la interfaz de grok sin prompt durante a lo sumo 20 segundos, vuelve a leer el log y usa la lectura nueva. Si no consigue una, grok queda como desconocido y se ordena después de los grupos con lectura.
5. **Un harness sin lector.** Dado codex habilitado con modelos en la tabla y sin lector de cuota, cuando el swarm pide una llamada de su nivel, entonces codex va después de los grupos usables con lectura, en el orden de `harnesses`, y antes del nativo.
6. **Nada usable.** Dado que ningún candidato del nivel es usable ni desconocido, cuando el swarm pide la llamada, entonces corre en el nativo, sin preguntar al dueño y sin cambiar de nivel.

## Requirements

- R1. Cada adaptador de harness informa la cuota de cada grupo como ventanas con `remaining` (de 0 a 1) y `resetsAt` (UTC), o como `unknown`. Sirve a: C2, C3.
- R2. El lector de agy sigue siendo `agy -p /usage --output-format json`, con sus ventanas `weekly` y `5h`. Sirve a: C2.
- R3. El lector de grok toma la última línea `billing: fetched credits config` de `~/.grok/logs/unified.jsonl`: una ventana `weekly` con `remaining` = 1 − `creditUsagePercent`/100 y `resetsAt` = `currentPeriod.end`. Un `creditUsagePercent` ausente en una lectura que trae `currentPeriod` cuenta como 0% usado. Una lectura cuyo periodo ya terminó no vale. Sirve a: C2.
- R4. Cuando la lectura de grok tiene más de 30 minutos, es de un periodo terminado o no existe, Aether la refresca abriendo la interfaz de grok en una pseudo-terminal, sin prompt y sin flags de aprobación, durante a lo sumo 20 segundos, y vuelve a leer el log. Si no aparece una lectura nueva, el grupo es `unknown`. Sirve a: C2, C3.
- R5. La prioridad de un grupo usable es el `remaining` de su ventana más larga (la de `resetsAt` más lejano) dividido entre las horas que faltan para ese reinicio, con un mínimo de una hora. Sirve a: C1.
- R6. Un grupo es usable cuando todas sus ventanas tienen `remaining` por encima de `reserve`, como hoy. Sirve a: C1, C4.
- R7. Los candidatos de una llamada son las lanes de los harnesses habilitados e instalados cuyo modelo sirve el rol de la llamada y reemplaza su nivel nativo (`replaces`). Compile guarda todos los candidatos por rol y nivel, no solo el primero. Sirve a: C1, C4.
- R8. El orden de los candidatos es: primero los de grupo usable con lectura, por prioridad descendente (en un empate, el reinicio más cercano, y luego el orden de `harnesses`); después los de grupo `unknown`, en el orden de `harnesses`; los de grupo no usable quedan fuera. Sin candidatos, la llamada va al nativo de su nivel. Sirve a: C1, C3, C4.
- R9. La elección se hace en cada llamada, cuando arranca, con lecturas de no más de 10 minutos para agy y 30 para grok; la lectura que cada llamada toma al terminar (`quotaAfter`) actualiza la de su grupo. Sirve a: C1, C5.
- R10. Una lectura que falla, que no se entiende o que tarda más que su límite deja el grupo en `unknown` y nunca hace fallar la llamada ni la corrida. Sirve a: C3.
- R11. Un grupo cuya llamada termina con motivo `quota` queda no usable hasta su `resetsAt` o hasta una lectura nueva que diga otra cosa. Sirve a: C1, C3.
- R12. `aether-lane status` muestra, por grupo, el saldo de cada ventana, el reinicio en UTC y en hora local, la prioridad, si es usable, la fuente y la edad de la lectura; y, por rol y nivel, el orden de candidatos que resulta. Sirve a: C2, C6.
- R13. Cada llamada registra en el diario de lanes el orden de candidatos con su prioridad y la razón por la que se eligió el suyo, o por la que fue al nativo. Sirve a: C6.
- R14. `aether-report` y el brief dan, por grupo, las llamadas de la corrida, el saldo al empezar y al terminar, y su próximo reinicio. Sirve a: C6.
- R15. Agregar un harness es agregar su adaptador con su lector de cuota (o `unknown`) y su entrada en la tabla; la regla de orden no cambia. La documentación de lanes lo explica. Sirve a: C3.
- R16. Los lectores se prueban con salidas reales guardadas como fixtures: la de `agy /usage` del 2026-10-14, una línea del log de grok 1.0.41 sin `creditUsagePercent` y una de 1.0.13 con `creditUsagePercent`. Sirve a: C2, C3.
- R17. Un test sobre los archivos del repo comprueba que cada modelo de la tabla de lanes está en el índice de modelos como vigente, ofrecido por su harness y con perfil. Sirve a: C4.
- R18. Con lecturas vigentes, elegir la lane no lanza ningún proceso; un grupo no se lee más de una vez dentro de la vida de su lectura, aunque varias llamadas arranquen a la vez. Sirve a: C5.

## Proposals

- Que la suscripción nativa de Claude Code entre en el orden: también tiene límites semanales, pero hoy no hay un lector conocido de su cuota.
- Ponderar la prioridad por la capacidad real de cada plan, cuando un plan la publique (ver la suposición A1).
- Un presupuesto de llamadas por ventana, puesto en la tabla, para un harness sin lector (el 2b.4 del roadmap). El dueño prefiere que Aether lea la cuota por su cuenta, así que solo entraría si un harness no deja leerla de ninguna forma.
- Lectores de cuota para codex y cursor, cuando esos harnesses entren en uso.

## Assumptions

- **A1 · Para el dueño.** Las fracciones de planes distintos se comparan tal cual: el 1% de Grok y el 1% de Gemini cuentan igual, aunque no sean el mismo cómputo. Base: ningún plan publica su capacidad en tokens. Reversible: un peso por grupo en la tabla, si un día se conoce.
- **A2 · Para el dueño.** Aether abre la interfaz de grok sin prompt hasta 20 segundos para refrescar su lectura (R4). Es el único camino encontrado: el modo headless no da la cuota. No manda prompt ni gasta cuota; abre y cierra una sesión vacía de grok. Reversible: una opción la apaga, y grok queda como desconocido.
- **A3.** Un `creditUsagePercent` ausente es 0% usado. Base: las lecturas viejas lo traían cuando era 21, 22, 23 o 100, y el formato del log omite los campos en cero. Reversible: el lector puede tratarlo como desconocido.
- **A4.** La ventana que define el riesgo de pérdida es la más larga (la semanal); la de 5 horas solo cuenta para saber si el grupo es usable. Base: el dueño habló de la cuota semanal. Reversible.
- **A5.** Los grupos sin lectura van después de los grupos con lectura, en el orden de `harnesses`. Base: sin lectura no se sabe si hay cómputo en riesgo. Reversible.
- **A6.** La vida de una lectura es de 10 minutos para agy y de 30 para grok, y el mínimo de horas en la prioridad es 1. Base: agy tarda segundos en dar su lectura, grok necesita abrir su interfaz. Reversible en la tabla.
- **A7.** La reserva sigue en 5% (`reserve` de la tabla). Base: es la de hoy. Reversible.
- **A8.** La hora local de `aether-lane status` es la del reloj de la máquina (hoy UTC−6). Reversible.

## Irreversible actions

- **Una llamada real por harness para validar** (clase: llamada pagada, contra la cuota del plan, unos $0.03 en grok): `node scripts/lane-smoke.js grok grok-4.7`. La corre el dueño con `!`, porque el clasificador de permisos de Claude Code bloquea lanzar grok con aprobación total.
- **Push y pull request de la rama** (clase: publicación): `git push -u origin <rama>` y `gh pr create`. Son decisión del dueño.
- **Merge a main** (clase: merge a main): el dueño lo hace en GitHub.

## Out of scope

- Lectores de cuota de codex y cursor: esos harnesses no están en uso (regla 2 del índice).
- La cuota de la suscripción nativa de Claude Code.
- Mover una llamada en curso a otra lane.
- Cambiar de nivel por cuota, o cambiar qué modelo de la tabla reemplaza a qué nivel: eso es trabajo del índice y de la tabla de lanes.
- Gemini 4 Argon: agy no lo ofrece todavía en el plan del dueño.
