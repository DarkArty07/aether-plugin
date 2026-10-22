# El gasto de una sesión completa: plan

**Spec:** [spec.md](spec.md)

## Technical context

- **Pila.** Node.js 22, CommonJS, sin dependencias (`CLAUDE.md`). Los bins son finos y la lógica vive en `plugins/aether/lib/`. El mod (`plugins/aether/hooks/`) es ESM con JSX, probado con `claude plugin test`; su parte pura (`*.mjs`) también la importa `node --test`.
- **Lo que ya existe y se reutiliza.**
  - `lib/prices.js` (`loadPrices`, `priceEntry`): el precio de lista de una petición, con la tarifa de escritura de caché de la sesión principal frente a la de un agente.
  - `lib/lanes.js` (`laneTokens`, `appendLog`, `pruneLog`): el registro de lanes `lanes/<id>.jsonl`.
  - `lib/router-log.js` (`journalFile`): el diario `router/decisions.jsonl`, un solo archivo para todas las sesiones, que nadie poda.
  - `lib/report.js` (`pruneUsage`, `lastWritten`): las partes del medidor `usage/<id>/<n>.json` y su poda de 30 días.
  - `hooks/panel.jsx`, `hooks/panel-view.mjs`: el panel `/harnesses`, con `aetherSession($)` de `register.js`, `readJson`, `clean`, `cells` y `clip`.
  - `bin/aether-session-start`: ya llama a `pruneUsage` y `pruneLog` al empezar una sesión del Lead.
- **Lo que mide la tarjeta y manda sobre cualquier idea previa.** El medidor ya guarda cada petición de la sesión, suma al reanudar (arranca tras las partes que hay en disco) y el registro de lanes ya trae el id de sesión. Nada suma la sesión entera, y `pruneUsage` borra las partes 30 días después de la última escritura. `readUsage` descarta en silencio una parte ilegible y una sesión sin entradas, así que no sirve para esta cifra (R9).
- **Estructura nueva.** Ningún bin nuevo. `lib/spend.js` (la cifra), `lib/spend-archive.js` (el resumen de la poda), `hooks/spend-view.mjs` y `hooks/spend-panel.jsx` (el panel). El resumen vive en `<dataDir>/spend/<id>.json`.
- **Estado y dormancia.** Un directorio de datos desechable en las pruebas. En una sesión que no es de Aether no se registra `/spend`, el medidor no escribe y el plugin no añade estado (R10): el panel pregunta a `aetherSession($)` al usarse, nunca al empezar la sesión, como `/harnesses`.

## Gate

La constitución del proyecto, `.specify/memory/constitution.md`, no existe: no hay principios que comprobar.

- Nada especulativo, ni para una necesidad hipotética: **pasa.** Cada pieza sirve a un requisito (la tabla de Files lo dice). No hay tope, presupuesto ni enlace entre sesiones bifurcadas: están fuera de alcance.
- Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida: **pasa, con tres filas en Complexity.** Los archivos nuevos son `spend.js`, `spend-archive.js`, `spend-view.mjs` y `spend-panel.jsx`; el resumen con marca de agua (`through`) y la separación de `spend-archive.js` de `spend.js` tienen su justificación en la última sección. No hay opción de `plugin.json`, ni bin, ni dependencia nueva.

## Design

**D1. La orden es una opción de `aether-report`, y la cifra es una función de `lib/spend.js`.** `aether-report --spend [--session <id>]` valida sus argumentos de forma estricta (solo esas dos formas; cualquier otra cosa es un mal uso con la línea de uso y código distinto de cero) y llama a `spendReport`. El `--spend` se revisa antes que `price`, `--delegates` y `--seats`, para que `--spend --seats` sea un mal uso y no una lectura de asientos. Los demás modos no se tocan. Serves: C1, C5, R1, R11.

**D2. Un solo acumulador, el `Tally`, sirve al informe y al resumen.** Cada petición del medidor, cada `kind: "call"` del registro de lanes y cada `kind: "outcome"` del diario se vuelve un evento `{ source, time, model, effort, usd, role?, lead? }` ya puesto a precio con `priceEntry` (el de un agente usa la tarifa de agente; el de otro harness se pone a precio como `{ model, ...laneTokens(usage), agent: 'lane' }`, la misma regla de `report.js`, pero un modelo sin precio da `null`, no 0). `tallyOf(events, prices)` los suma en: `usd`, `leadUsd`, `agentsUsd`, `byModel`, `byEffort`, `byRole`, `harness`, `unpriced`, `first`, `last`, `resumptions` y `complete`. `mergeTallies(a, b)` suma dólares y conteos, une `unpriced`, toma la menor primera hora y la mayor última, y **suma las reanudaciones sin añadir el hueco del corte** (R7, R8). Así el resumen de la poda es un `Tally` guardado, y «resumen más lo que sigue en disco» es un `mergeTallies`. Serves: C1, C2, R2 a R5, R7.

**D3. Se lee cada fuente por su cuenta, sin `readUsage` ni `readLog`.** Las partes se leen una a una (`usage/<id>/<n>.json`, ordenadas por número): una que no se puede leer deja `complete` en falso y se sigue con las demás. El registro de lanes de una id es solo `lanes/<id>.jsonl`. Una entrada sin `session` (campo ausente o `null`) toma la id de su archivo, como ya hace `readLog` (`entry.session ??` el nombre del archivo). Solo una entrada cuyo `session` es explícitamente otro id no cuenta. `unknown.jsonl` no se abre nunca. El diario se lee línea a línea, con la posición de cada una, para aplicar R9. El rol de una petición es `main` sin id de agente y, con él, el `type` que el medidor guardó (`agent` si no hay tipo). Serves: C1, C2, C5, R3, R4, R9.

**D4. La sesión por defecto sale de los archivos propios, con la hora de escritura.** `latestSession(dataDir)` mira `usage/<id>/` (la hora más nueva del directorio y sus partes, como `lastWritten`), `lanes/<id>.jsonl` y `spend/<id>.json`, solo con nombres que cumplen `^[A-Za-z0-9_-]+$` y no son `unknown`; el empate lo gana la id mayor como texto. Del resumen cuenta `writtenAt`, la hora en que se escribió por última vez la sesión que archiva, y no la hora de la poda: así la poda que corre al empezar una sesión no vuelve «la última» a una sesión de hace 30 días. Serves: C1, R1.

**D5. El resumen: un archivo por id, escrito antes de borrar, con una marca de agua.** `<dataDir>/spend/<id>.json` guarda `{ version, session, writtenAt, through: { usage, lanes }, tally }`. `through.usage` y `through.lanes` son la mayor hora de lo ya archivado de cada fuente. El lector ignora, de lo que sigue en disco, todo evento con hora `<= through` de su fuente. Eso hace que **un archivado repetido de la misma fuente, un borrado que falló y una lectura entre el archivado y el borrado cuenten cada evento una sola vez**, sin un candado. No cierra la ventana en que el renombre de la otra fuente cae entre la relectura y el renombre de esta: ese caso queda en Risks. Se escribe a un temporal del mismo directorio y se renombra: el archivo queda entero o ausente. Un archivo por id no lo comparten dos sesiones. Serves: C3, C4, C5, R6, R8, R9.

**D6. Las podas que ya existen archivan solas.** `pruneUsage` (`report.js`) y `pruneLog` (`lanes.js`) llaman a `archiveSpend(dataDir, id, 'usage' | 'lanes', { prices })` antes de borrar a una sesión con id; si archivar falla, esa sesión no se borra y la siguiente poda lo reintenta. Un nombre que no es una id, y `unknown`, se borran como hasta hoy y no dejan resumen. Ambas aceptan `prices` (por defecto `loadPrices()`) para que las pruebas usen su tabla. Así `aether-session-start` no cambia y cualquier otro llamador también conserva el gasto. `lanes.js` pide `spend-archive.js` dentro de la función (`spend-archive.js` pide `spend.js`, que ya pide `lanes.js`, y un `require` al cargar sería circular). Ese `require` perezoso es lo que evita el ciclo, no el archivo aparte: si `archiveSpend` viviera en `spend.js`, pedirlo dentro de la función tampoco cargaría el ciclo al arrancar. El archivo aparte deja al lector separado del escritor, que es lo que justifica la fila de Complexity. Sus devoluciones siguen siendo `{ pruned }`. El diario no se poda ni se copia al resumen. Ninguna otra poda toca `spend/`. Serves: C4, R8.

**D7. «Incompleto» es solo lo que el código puede señalar.** `complete` es falso cuando una parte, el resumen o un archivo de lanes de esa id está en disco y no se pudo leer, y cuando una línea ilegible del diario cae en el tramo de esa sesión (R9: por su hora, si se le puede sacar de la línea rota; si no, por su sitio en el archivo). Una línea ilegible del registro de lanes se omite como lo hace `readLog`. `usd` es la suma de lo leído. Serves: C5, C7, R9.

**D8. `/spend` repite `/harnesses` con un panel más simple.** `hooks/spend-panel.jsx` exporta `registerSpend(on)`, que `register.js` llama junto a `registerPanel`. Declara `spend` en el SessionStart del Lead (`immediate: true`, descripción `Show the list-price spend of this Aether session`); al usarse, si `aetherSession($)` es nulo pasa a lo de abajo con `next(e)`; si no, abre el panel `spend` y corre `aether-report --spend --session <id de esta sesión>` con `$.process.run` (límite de 120 s; el tiempo de la orden no es un plazo de la spec, es el tiempo máximo que el mod espera). El panel dice `Reading…` hasta que la orden vuelve, y no llama a un modelo ni escribe en la transcripción en ningún momento. `hooks/spend-view.mjs` es puro (lectura del JSON con `readJson` de `panel-view.mjs`, texto y líneas) para probarlo con `node --test`. Los dólares se muestran con dos decimales, redondeo mitad alejándose de cero, sobre el decimal más corto que `toString` escribe (el texto que se lee, `1.005` y `2.675`), no sobre el valor binario exacto ni con `Math.round(valor * 100)`. El doble guardado de esos dos literales queda un poco por debajo de la mitad: redondear ese valor exacto da `1.00` y `2.67`, y la prueba pide `1.01` y `2.68`. Se toma el signo, se parte el texto absoluto en parte entera y fracción (si viene en forma `e`, se expande a decimal llano antes de partirlo), se conservan los dos primeros decimales y, si el primer dígito que se descarta es 5 o más, se suma una centésima alejándose de cero, con acarreo. Un valor que no es un número finito se muestra `—`. Serves: C6, R10.

**D9. El informe de cierre: la regla en `using-aether`, el formato en las skills de corrida y de enjambre.** El texto es el de R13, palabra por palabra. Lo comprueban pruebas del repositorio. Serves: C8, R13.

**D10. La documentación explica el uso.** La página de autonomía (el costo que hoy no suma los turnos del Lead), la sección del panel `/harnesses` (que gana la de `/spend`), la entrada de problemas del panel, la página de componentes y la de mantenimiento (la poda conserva el total). No hay página nueva. Serves: C9, R14.

**D11. R12 la hace el Lead, no el enjambre.** Después de fusionar todo, el Lead corre `aether-report --spend --session 010621c2` y `--session 252123d1` con `AETHER_DATA_DIR=~/.claude/plugins/data/aether-aether-plugin`, hace la suma independiente de esos mismos archivos y anota las dos cifras y el tiempo de la sesión más grande. La nota queda en el diario de la corrida, `.aether/autonomy/<id de la corrida>/diary.md`, como evidencia de C7, y en el informe de cierre; fuera de una corrida, donde no hay diario, queda en el informe de cierre. Ninguna tarea toca el directorio de datos del dueño, y la suite tampoco. El detalle de la pasada está en tasks.md, sección «Lead, después de fusionar». Serves: C7, R12.

## Files

| Archivo | Qué y por qué | Sirve a |
| --- | --- | --- |
| `plugins/aether/lib/spend.js` (nuevo) | `Tally`, lectores de las tres fuentes, el resumen leído, `latestSession`, `spendReport` | R1 a R7, R9 |
| `plugins/aether/bin/aether-report` | La opción `--spend`, su uso y su validación estricta | R1 |
| `plugins/aether/lib/spend-archive.js` (nuevo) | `archiveSpend`: suma el tramo que una poda va a borrar al resumen de la id | R8 |
| `plugins/aether/lib/report.js`, `plugins/aether/lib/lanes.js` | `pruneUsage` y `pruneLog` archivan antes de borrar | R8 |
| `plugins/aether/hooks/spend-view.mjs`, `spend-panel.jsx` (nuevos), `register.js` | El panel `/spend` y su registro | R10 |
| `plugins/aether/skills/using-aether/SKILL.md`, `autonomous-runs/SKILL.md`, `swarm/SKILL.md` | La regla de cierre y la línea del informe | R13 |
| `docs/guide/autonomy.md`, `lanes.md`, `troubleshooting.md`, `maintenance.md`, `docs/reference/components.md` | Cómo se usa, qué es precio de lista, la poda | R14 |
| `tests/spend-fixtures.js`, `spend.test.js`, `spend-bin.test.js`, `spend-prune.test.js`, `spend-view.test.js`, `spend-skills.test.js`, `spend-docs.test.js`, `plugins/aether/hooks/spend-panel.test.tsx` (nuevos) | Pruebas de E1 a E9 con directorio y tabla de precios desechables | R11 |

## Verification

- **Comando.** `npm test` (los bins, las libs y las pruebas de documentos), `npm run test:mod` para el panel y `npm run check` antes de dar por cerrado.
- **C1, E1:** `tests/spend.test.js` y `tests/spend-bin.test.js` comparan el total, Lead, agentes y los repartos contra una suma que la prueba hace desde los tokens y su tabla, y el defecto de la sesión (con `unknown.jsonl` y nombres que no son id).
- **C2, E2:** la misma prueba con llamadas y `outcome`, uno con precio y uno sin precio.
- **C3, E3:** dos tandas de la misma id separadas por horas dan un solo total y las reanudaciones; otra id no recibe lo de la anterior.
- **C4, E4:** `tests/spend-prune.test.js`: la sesión podada da la misma cifra; la segunda poda suma; el `outcome` no se copia; el borrado se omite si archivar falla; `aether-session-start` archiva.
- **C5, E5:** aislamiento por id, lectura mientras otro proceso escribe, y cuatro podas simultáneas con un resumen legible y sin temporales.
- **C6, C7, E6, E7:** `spend-panel.test.tsx` (declara, abre, no llama a un modelo, la sesión normal no lo tiene) y `spend-view.test.js`.
- **C7, E8:** 3.005 peticiones en 4 partes contra la suma independiente; ninguna prueba hace una llamada de pago.
- **C7 con datos reales (R12):** la pasada del Lead sobre `010621c2` y `252123d1` en el directorio del plugin instalado. La nota queda en el diario de la corrida y en el informe de cierre (D11).
- **C8, E9:** `tests/spend-skills.test.js` falla si falta la frase o la línea en las tres skills.
- **C9:** `tests/spend-docs.test.js`, `tests/docs-facts.test.js` y `npm run check`.

## Assumptions

- **El resumen guarda los dólares al precio de la tabla del día de la poda.** Una tabla de precios que cambie después no recalcula lo archivado. Es lo que permite no guardar tokens. Reversible: guardar también los tokens.
- **`writtenAt` del resumen es la última escritura de la sesión que archiva**, no la hora de la poda (D4). Reversible: usar la hora del archivo.
- **Un archivo de lanes que no se puede leer deja la cifra incompleta**, igual que una parte ilegible, y una línea rota dentro de un archivo legible se omite como hace `readLog`. R9 nombra las partes, el resumen y el diario; esto lo extiende al registro de lanes de la misma id.
- **Las listas de `unpriced` van ordenadas alfabéticamente**, para que el resumen y el informe den el mismo JSON.
- **Una entrada del registro de lanes sin hora numérica cuenta en los dólares** y no mueve la primera ni la última hora (R3); si un resumen existe y no se borró el crudo, esa entrada se cuenta de nuevo. Es un caso que no ocurre con entradas bien escritas.
- **El panel espera hasta 120 s al bin**; después muestra el motivo. No es un plazo de la orden.
- **No se publica nada.** No hay sección `## Deployment`: la spec no pide una versión, un changelog, un push ni una publicación.
- **El diario del router y el resumen de una id sin archivos propios.** Una sesión que solo tiene entradas `outcome` no sale como defecto de la orden; con `--session` sí se lee (spec, Assumptions).
- **El redondeo a centavos usa el decimal que `toString` escribe**, mitad alejándose de cero, no el valor binario exacto (D8). Es lo que hace que `1.005` se muestre `1.01` y `2.675` se muestre `2.68`. Reversible: redondear el valor exacto, y entonces esas dos pruebas cambian.
- **La nota de R12 vive en el diario de la corrida y en el informe de cierre.** La spec pide que quede anotada y no nombra el archivo. En una corrida, `.aether/autonomy/<id>/diary.md` es donde va la evidencia de cada criterio, y el informe de cierre la repite. Fuera de una corrida no hay diario y la nota queda solo en el informe. Reversible: anotarla en otro sitio.

## Risks

- **Una poda que corre justo mientras la sesión vieja se reanuda.** La poda solo actúa sobre sesiones con 30 días sin escribir, y el mod arranca en la parte que sigue a las que hay. Si el mod escribe una parte nueva entre la lectura y el borrado de la poda, esa parte se perdería. La marca de agua no lo evita (el borrado es de todo el directorio); se acepta por improbable y queda anotado, y no se añade un candado que ningún requisito pide.
- **Dos podas de la misma id, una por fuente, en la ventana entre releer y renombrar.** Justo antes de renombrar, `archiveSpend` vuelve a leer el resumen y no escribe si `through` de su propia fuente ya es mayor o igual que la marca que iba a dejar. No compara la otra fuente. Si el renombre de la otra fuente cae entre esa relectura y este renombre, este archivo pisa el tramo que la otra acaba de archivar, y los crudos de esa otra fuente ya están borrados. La marca de agua no cierra esa ventana. Se acepta por la misma razón que la carrera del medidor: las dos podas de una id tienen que cruzarse en ese instante, y no se añade un candado que ningún requisito pide.
- **El borrado que falla después de archivar.** La marca de agua hace que el siguiente archivado y la lectura ignoren lo ya contado; el crudo se borra en la poda siguiente.
- **Una sesión muy larga.** 3.005 peticiones en 4 partes se leen enteras en memoria; no hay un plazo. La prueba comprueba la cifra, no los segundos, y la pasada real anota el tiempo.
- **El panel y la API de mods, que es de acceso anticipado.** Se sigue el patrón de `/harnesses`, que ya se probó en sesiones reales; si Claude Code cambia la API, el panel puede dejar de dibujar y nada más de Aether depende de él.
- **Dos copias de la regla de redondeo y de la forma del JSON** (el panel y las skills leen lo mismo). El JSON de R1 es el contrato; las pruebas del panel usan el JSON tal cual.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| El resumen guarda una marca de agua, `through.usage` y `through.lanes`, y el lector ignora lo anterior a ella | R8 y R9: «cada evento una vez» y «dos sesiones que escriben o leen a la vez no se pisan» incluso si la misma fuente se archiva dos veces, si el borrado falla o si se lee entre el archivado y el borrado. La ventana entre dos fuentes distintas queda en Risks: la marca de agua no la cierra | Un candado de archivo o «borrar y confiar» deja un caso que cuenta dos veces o que pierde el tramo, y un candado añade un estado que hay que limpiar |
| `lib/spend-archive.js` aparte de `lib/spend.js` | R8: la poda escribe el resumen y la orden solo lo lee. `archiveSpend` queda fuera de `spend.js` para que el módulo de la cifra, que la orden y las pruebas importan, no sea también el que reescribe el resumen justo antes de borrar | Meter `archiveSpend` en `spend.js` no crea una carga circular: el `require` perezoso de D6 también la evitaría ahí. Se rechaza porque el lector y el escritor quedarían en el mismo módulo, y la orden cargaría el código que reescribe el resumen aunque nunca archive |
| `hooks/spend-view.mjs` aparte de `spend-panel.jsx` | R10: el texto y el redondeo del panel se prueban con `node --test` sin el motor de mods, como hace `/harnesses` con `panel-view.mjs` | Todo en el `.jsx` solo se prueba con `claude plugin test`, que es más lento y no cubre bien los casos de redondeo y de nombres con caracteres de control |
