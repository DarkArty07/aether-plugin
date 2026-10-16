# El router de delegados: plan

**Spec:** [spec.md](spec.md). La evidencia medida está en [evidence/README.md](evidence/README.md); este plan la cita por sección y no la repite.

## Technical context

- **Pila.** Node.js 22, CommonJS con `'use strict'`, sin dependencias de npm. Los archivos `.mjs` del mod son ESM. Las pruebas son `node --test` (`npm test`); las del mod con el motor real son `npm run test:mod` (`claude plugin test`) y este plan no depende de ellas.
- **Estructura que se toca.** `plugins/aether/lib/` (la lógica), `plugins/aether/bin/` (un bin nuevo, `aether-route`, y una bandera nueva de `aether-report`), `plugins/aether/config/router/` (el criterio y la tabla de peldaños), `plugins/aether/hooks/` (el mod: un módulo nuevo y tres ganchos en `register.js`), `.claude-plugin/plugin.json` (cuatro opciones), `scripts/` (el generador de la tabla), la skill `using-aether` y `docs/`.
- **Lo que se reutiliza sin cambiarlo.** `lib/lane-order.js` (solo `groupView`, la vista de cada grupo; el router **no** usa `orderCandidates`, que es la política A49 del swarm), `lib/lane-readings.js` (`cacheFile`), `lib/lane-marks.js` (`liveMarks`, `liveMark`, `markFile`, `MAX_MARK_MS`, solo para leer y dar forma; el router no llama a `markDry`), `lib/harness/*` (los adaptadores de agy y grok, que ya toman el esfuerzo nativo en `argv({ level })`), `lib/lanes.js` (`loadConfig`, `laneEnv`, `usable`), `lib/prices.js` y `lib/report.js` (`readUsage`), y el bin `aether-lane`, que el router ejecuta (`quota <harness> --refresh`) sin editarlo. Ningún archivo de esa lista se edita (R9, C4): `Owns` lo impide.
- **Lo que el motor permite** (evidencia §1, medido con el modelo falso): el gancho `tool.call` de `Agent` ve y reescribe `model` y `effort` y puede devolver un aviso al Lead; `agent.spawn` no ve ni reescribe `effort`; un delegado se puede contestar sin modelo desde su primer `turn.step`; el mod puede llamar `$.model.complete`, `$.process.run` y `$.fs`. Un gancho tiene 10 s de ejecución propia (`docs/claude-code-research.md`).
- **Datos.** `config/models/models.json` (medidas de Artificial Analysis por modelo y esfuerzo), `config/lanes.json` (harness, grupos, reserva de 5 %), `config/prices.json`. El directorio de datos (`run.dataDir()`) guarda lo nuevo: `router/decisions.jsonl` (el registro), `router/pending/`, `router/external/`, `router/in/`, `router/lanes/marks/` (las marcas del router), `router/renewing/` (el candado de cada renovación) y `sessions/<id>.router.json`.

## Gate

Este proyecto no tiene constitución (`.specify/memory/constitution.md` no existe), así que el gate trae las dos comprobaciones fijas.

| Comprobación | Resultado |
|---|---|
| Nada especulativo ni para una necesidad hipotética. | **Pasa.** Cada pieza sirve a un requisito de la spec (columna `Serves` de cada decisión). Quedan fuera por diseño: codex y cursor, delegados que editan en otro harness, la segunda capa del guard, el lint de planes y los graders (R19, R20, R32; sección Proposals). |
| Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida. | **Pasa con las filas de `## Complexity`.** Hay cuatro opciones (R11), un bin nuevo, un archivo de criterio, una tabla de peldaños generada, un protocolo de dos pasos entre el mod y el bin, un almacén de marcas propio con su reconocedor del rechazo (R22, R22b) y un candado de renovación (R23); cada uno se justifica allí con su requisito. No hay dependencias de npm. |

## Design

### D1. La decisión se separa en tres partes: cómo se pregunta, qué significa la respuesta, dónde corre

El decisor solo contesta preguntas sobre la tarea. El **criterio** (D2) vuelve esas respuestas en un nivel. La **tabla de peldaños** (D3) vuelve un nivel en modelo y esfuerzo. La **cuota** (D7) elige harness. Cada parte es un módulo puro con sus pruebas, y ninguna conoce el transporte del decisor. Así el criterio cambia sin tocar código (R3), un decisor nuevo no toca la política (R10) y la regla de cuota no depende de cómo se pregunta. Serves: C1, C2, C5.

### D2. El criterio es `config/router/criterion.json`, y es el único lugar que dice cómo se rutea

Lleva las siete preguntas de la evidencia §3 con la forma nativa de Jev (`choice`, `score`, `noul`), el eje por tipo de tarea (código para editar o probar, inteligencia general para investigar o juzgar: A-5, R14), el nivel base de cada tipo de trabajo, los ajustes (`stakes` ≥ 2.5 y `many_steps` ≥ 0.7 suben un nivel), las compuertas de calidad (`audit`, `evaluate`: nunca bajan del nivel que pidió el Lead, R6), los umbrales de confianza (`shape` 0.5, `stakes` 0.4: bajo ellos el nivel no baja de lo pedido, R4), y el esfuerzo que se supone heredado (`xhigh`, el de `scripts/aether-lead`). El peldaño estándar (A-4) y los tiempos límite (A-6) no están aquí: son opciones del plugin (R11, D11). Haiku y Jev reciben las mismas preguntas, por eso la misma prueba corre con los dos (C5). Una regresión sobre briefs con respuestas registradas falla cuando se cambia un valor del criterio y la decisión se mueve (R5, C2). Serves: C2, C5.

### D3. La tabla de peldaños se deriva de las medidas, con el eje y el estado de cada medida

`config/router/rungs.json` lo genera `scripts/build-router-rungs.js` desde `models.json` y `lanes.json`, y una prueba falla si el archivo difiere de lo que el índice deriva (R13). Cada peldaño (harness, modelo, esfuerzo nativo) lleva su nivel A a D **por eje** y un estado. Los niveles se asignan por **puntos de corte por eje** (R13): en inteligencia 37.5, 45 y 55; en Terminal-Bench 0.18, 0.35 y 0.58; son el borde inferior de B, C y D, de modo que los cuatro niveles no se traslapan y un valor igual a un corte va al nivel superior. Los rangos de la evidencia §4 describen a los miembros actuales de cada banda y no son los cortes (en Terminal-Bench se traslapan y en inteligencia dejan huecos: 37, 44–45, 55); los cortes de arriba los fija el plan, los lleva la tabla y los regenera el generador, y una prueba comprueba que los peldaños que nombran los escenarios 8, 17 y 18 caen en B. El estado es `measured`, o `unmeasured` con su razón: no hay medida a ese esfuerzo (grok `medium`) o la medida es de la API nativa de Claude y no de cómo lo sirve agy con el mismo nombre (R15, A-12). **Un peldaño `unmeasured` no sirve a ningún nivel y no se elige nunca**: hoy los `claude-sonnet-5-5` y `claude-opus-5-5` de agy, y esos niveles los sirve Claude nativo hasta que haya medida en agy. El esfuerzo del peldaño es el nombre nativo del índice (`entry.efforts`). El esfuerzo se traduce por el nivel medido del peldaño y no por su nombre: `high` es B en Haiku y C en Sonnet (C7, R16). La tabla no toca los `levels` de `lanes.json` que usa el swarm (R9). Serves: C6, C7.

### D4. El decisor elige un nivel; el esfuerzo sale del peldaño que lo mide

La spec dice que el decisor «elige un nivel y un esfuerzo» (R2). Aquí el decisor contesta sobre la tarea, el criterio produce un **nivel**, y el esfuerzo es el del peldaño que mide ese nivel: entre los peldaños elegibles del nivel más bajo que alcance el pedido, el de menor precio de salida y, a igual precio, el de menor esfuerzo. Es la lectura de C7 («no todos los efforts valen igual») y de los escenarios 8 y 18, donde el esfuerzo (`low`, `medium`) es consecuencia del nivel B. La decisión siempre nombra un esfuerzo explícito (R17). Se anota en `## Assumptions` (S4) para que el dueño la confirme. Serves: C1, C7.

### D5. El Lead describe; el router decide en el gancho `tool.call` de `Agent`

El gancho filtra por `subagent_type` (`aether:*` queda fuera, R9) y no depende de que el motor calle el gancho para los agentes de un workflow, que nadie ha comprobado (R31). Los tres modos (`record`, `advise`, `command`, la opción `router`) son:

- `record` (estándar, A-1): el delegado corre como lo lanzó el Lead (si no pasó `model` o `effort`, hereda como hoy, A-10) y el registro guarda lo que el decisor habría elegido. **El decisor corre en segundo plano** (R7): `begin` no lo espera, el mod deja salir la llamada y la decisión, con el paso de cuota, se cierra después; así ningún límite de A-6 demora un lanzamiento.
- `advise`: lo mismo, y el Lead recibe la decisión como aviso cuando difiere de lo que pidió. El lanzamiento espera la decisión, hasta el límite de su decisor.
- `command`: la delegación sale con el peldaño decidido y con esfuerzo explícito, y el Lead recibe el aviso (harness, modelo, esfuerzo, razón). El lanzamiento espera la decisión, hasta el límite de su decisor (Jev 3 s, Haiku bajo 8 s, A-6) más, a lo sumo, 3 s de cuota.

La anulación (A-7) es una línea del brief, `ROUTER-OVERRIDE: <motivo>`, que el router lee; con ella el delegado corre como el Lead lo pidió y el motivo queda en el registro. Un `model` o `effort` sin motivo no anula (R8). Si el nivel decidido coincide con el nivel de referencia (el pedido por el Lead o, si no pidió nada, el del peldaño estándar de la opción `fallback`), se queda el peldaño de referencia. Serves: C3, C4.

### D6. Dos pasos entre el mod y el bin, porque solo el mod llama a un modelo

El mod no importa `lib/` (el patrón del proyecto: el mod ejecuta bins con `$.process.run`, ver `ops-command.mjs`). El bin `aether-route begin` lee el evento (el mod lo deja en un archivo, sin límite de argumentos), arma la petición y, si el decisor es Haiku, devuelve un descriptor para `$.model.complete`; el mod llama al modelo y `aether-route finish` cierra la decisión. Con Jev, el propio bin llama a OpenRouter con `fetch` y la llave (entorno o `.env` del directorio de datos, nunca el repositorio, R12) no pasa por el mod: en `advise` y `command` `begin` devuelve la decisión completa; en `record`, `begin` devuelve enseguida `background` y `decide`, y el mod corre `aether-route decide --id <id>` en segundo plano. Cada decisor recibe su límite de la opción `deadlines` (`request(task, criterion, { timeoutMs })`). Un tercer decisor es un módulo que da `request` y `parse` (R10). Entre `begin` y `finish` (o `decide`) el estado está en `router/pending/<id>.json`. Serves: C5, C10.

### D7. Cuota: la regla del dueño sobre lecturas vigentes, y una lectura con saldo no levanta una marca

`lib/router-quota.js` agrupa por (harness, grupo) de `agy` y `grok` (R20) y decide cada grupo en este orden, la primera causa gana: harness no habilitado o no instalado; **marca vigente** (la del swarm o la del router: una lectura con saldo no la levanta, R22; el registro dice «marca vigente; la lectura con saldo no la desmiente»); **sin lectura vigente** (R23: el registro dice «sin lectura» y la edad de la última; el grupo queda fuera de esa decisión, nunca se ordena por el orden de `harnesses` ni por una lectura vencida); bajo la reserva de 5 % (el grupo sin saldo queda fuera, confirmado por el dueño, escenario 17); saldo ilegible; sin peldaño que sirva el nivel (R15). Entre los candidatos manda **la regla del dueño** (R21): se usa primero el grupo cuya ventana semanal se renueva antes (la ventana de reinicio más tardío del grupo, que `groupView` de `lane-order.js` nombra); a igual hora, el mayor saldo. El escenario 19 fija esa regla (agy con 10 % que se renueva en 10 h gana a grok con 95 % en 29.6 h). **No se usa `orderCandidates`**: el saldo de la ventana semanal entre las horas que faltan (A49) está pendiente de la confirmación del dueño, no se construye ni se prueba como política del router, y el swarm sigue con A49 sin cambios. Una lectura es vigente mientras tenga la vida que ya tiene (`quotaLifeMinutes` de `lanes.json`: 10 min agy, 30 min grok); `peekReadings` lee el archivo guardado de agy y el registro de grok y no lanza ningún proceso. Serves: C9, C10.

### D8. Un delegado de solo lectura corre en agy o grok sin una corrida del swarm

`aether-lane start` exige un `<run>` y un worktree de unidad (evidencia §7.1). `lib/delegate-calls.js` hace una llamada sin corrida, modelada en una ronda de asiento (`seats.js`): un worktree desechable, el adaptador del harness, un esquema `{ answer }`, y una comprobación de que no cambió ningún archivo (`violation` si cambió). El mod contesta el primer `turn.step` del delegado con ese texto; si la llamada falla por infraestructura o cuota, el mod no contesta y el delegado corre en Claude con el peldaño que `finish` ya puso en la llamada (R26): el fallback nativo es gratis y no gasta la escalera. Solo corren fuera los delegados con `edits_files` bajo 0.5 y confianza suficiente, sin `isolation`, y solo con la opción `lanes` activa y el harness en la opción `harnesses` (A-2, R19, R20). **El esfuerzo del router llega a agy o grok sin pasar por `levels`** (R16): `lane-calls.js` traduce el esfuerzo del swarm por nombre con `entry.levels[effort]`, pero el adaptador toma el esfuerzo nativo en `argv({ level })` (agy: `<modelo>-<esfuerzo>`; grok: `--reasoning-effort <esfuerzo>`); el peldaño trae el nombre nativo del índice (`efforts`) y `delegate-calls.js` lo pasa tal cual, de modo que ni `lanes.json` ni el swarm cambian. Serves: C7, C8, C10.

### D9. Fallback: nunca una pregunta al dueño, nunca una llamada más

Falla del decisor (sin llave, tiempo, HTTP, vacío, ilegible): el delegado corre con lo que pidió el Lead, o con el peldaño estándar de la opción `fallback` si no pidió nada, con esfuerzo explícito (R24, A-4). Falla el harness (no instalado, sin cuota, sin lectura vigente, con marca, o el delegado termina por infraestructura o por cuota): corre en Claude en el peldaño del nivel decidido, que es el «nivel pedido» de R26. Un error interno del router deja la llamada intacta. Ninguno añade una llamada a un modelo (R25). Serves: C10.

### D10. Un registro que sobrevive y se puede repetir

`router/decisions.jsonl` en el directorio de datos guarda, por delegación, una entrada `decision` (tarea, lo que pidió el Lead, respuestas, decisión, razón, confianza, decisor, modo, si corrió en segundo plano, estado de cuota de los grupos con la edad de su lectura, y los tiempos del decisor y de la cuota), una `spawn` (el id del agente, para unir el costo) y una `outcome` (lo que corrió fuera, la cuota gastada y la marca que dejó un rechazo). `aether-report --delegates` junta las tres con el medidor de uso y da el peldaño, la razón, la confianza, el decisor, el costo y la cuota por delegación, y por corrida cuántas se decidieron, anularon y cayeron en fallback (R27, R30). `aether-route replay` repite el historial: de las transcripciones de Claude Code (`~/.claude/projects`, con el filtro de secretos de la evidencia) o del propio registro con las respuestas guardadas, para ver qué cambia al cambiar el criterio (con el peldaño estándar de la opción `fallback`). Una llamada pagada exige `--paid`. Serves: C11, C13.

### D11. Cuatro opciones y un archivo de sesión

Las cuatro opciones de R11: `decider` (`haiku`, `jev`; estándar `haiku`), `router` (el modo: `record`, `advise`, `command`; estándar `record`), `fallback` (el peldaño estándar de A-4, escrito `alias:esfuerzo`; estándar `sonnet:high`) y `deadlines` (los tiempos límite de A-6, en segundos: `haiku=8,jev=3,quota=3`; un valor mayor que 10 cuenta como 10). Los nombres `fallback` y `deadlines` son una elección del plan (S2). `aether-session-start` guarda sus valores en `sessions/<id>.router.json` (el patrón del archivo `.ops-off`) porque el mod no ve las variables de la sesión (evidencia §3). La tabla de `docs/guide/options.md` y `plugin.json` coinciden (R11), y `docs-facts` lo comprueba. Serves: C5, C11.

### D12. La lectura que falta o venció se renueva en segundo plano, y la decisión espera a lo sumo 3 s (R23)

Una renovación no cabe en 3 s: la de grok espera hasta 10 s por ACP y hasta 20 s más por su UI; la de agy lanza `agy -p /usage` con tope de 60 s. Por eso el paso de cuota de `route` hace tres cosas: `startRenewal` lanza `aether-lane quota <harness> --refresh` suelto (el mismo paso que ese comando: grok por `refreshGrokQuota`, agy por una lectura cuya caché ya venció, que guarda la nueva) con un candado `router/renewing/<harness>.json`, de modo que **a lo sumo una renovación por harness corre a la vez** y una decisión que encuentra una en curso no inicia otra; `waitForReading` espera como mucho `deadlines.quotaMs` (3 s) a que la lectura sea vigente; y `chooseHarness` decide con lo que haya, de modo que un grupo sin lectura vigente queda fuera y el delegado corre en Claude (R24) si no queda ninguno. La siguiente decisión encuentra la lectura renovada. En `record` todo el paso corre en segundo plano (D5). El registro guarda por decisión `quota` (con la edad de la lectura, la nota «sin lectura» y el estado de la renovación), `quotaWaitMs`, `deciderMs` y `latencyMs`: con ellos el dueño mide, antes de que `command` sea el estándar (R31), la latencia real de Haiku bajo, cuánto tarda una renovación y con qué frecuencia una decisión encuentra la lectura todavía vigente. Serves: C9, C10, C12.

### D13. El rechazo explícito de agy deja una marca propia del router (R22, R22b)

La lectura de agy puede marcar saldo mientras la llamada es rechazada con «Individual quota reached … Resets in 163h22m27s.» (evidencia §5, A-11): la verdad sobre un grupo de agy es el rechazo. `lib/router-marks.js` trae `quotaRefusal(texto)`, que reconoce ese mensaje y da el reinicio, y `markRefusal`, que deja la marca del grupo en `router/lanes/marks/` (la misma forma que las del swarm, así `lane-marks.js` las lee) hasta ese reinicio, o por 60 minutos si el mensaje no lo dice, acotada a lo que `MAX_MARK_MS` (8 días) acepta. `readAllMarks` junta las marcas del swarm (solo lectura) y las del router. Quien deja la marca es `aether-route delegate`, con el `detail` de un delegado que el router mandó fuera y no terminó `ok`; ese mismo delegado corre entonces en Claude (R26). **Solo el router lo reconoce**: `lane-calls.js` y `seat-calls.js` no cambian, `markDry` tampoco, y que el swarm y los asientos no reconozcan el rechazo es la incidencia `docs/issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md` y una propuesta (R32). Serves: C9, C10.

## Viability

La tabla que pide C12 / R31: cada parte de lo pedido (C1 a C14, salvo C12), y el ajuste que la hace viable. La repite `docs/guide/router.md` en inglés.

| Parte | Veredicto | Ajuste |
|---|---|---|
| C1. Un decisor elige con qué corre cada delegado | viable con ajuste | `tool.call` reescribe `model` y `effort`; el gancho `agent.spawn` no ve `effort`, así que el router actúa en `tool.call` (evidencia §1). En `registra` el decisor corre en segundo plano y el motor no se probó con trabajo posterior al retorno del gancho; tampoco con lanzamientos en paralelo, `isolation: "worktree"` ni un modelo real. |
| C2. Sabe rutear porque se le da el criterio | viable tal cual | El criterio es un archivo legible y una regresión lo vigila (D2). |
| C3. El Lead solo describe la tarea | viable con ajuste | La anulación necesita una forma fija (`ROUTER-OVERRIDE: <motivo>`) que la skill enseña (A-7). |
| C4. Solo los delegados del Lead | viable con ajuste | El router filtra por `subagent_type`; que el gancho no se dispare para los agentes de un workflow queda sin comprobar, por eso C4 no depende de ello (R9). El reconocimiento del rechazo explícito de cuota es solo del router: el swarm y los asientos no cambian. |
| C5. Dos decisores intercambiables | viable con ajuste | La precisión de Haiku bajo como decisor y su latencia no están medidas: Artificial Analysis mide 3.84 s al primer token con esfuerzo bajo (6.69 s con medio), por eso el límite es por decisor (Jev 3 s, Haiku 8 s, A-6) y se mide la latencia real antes de que `command` sea el estándar. Jev está medido (mediana 0.29 s). |
| C6. Los niveles son capacidad medida | viable con ajuste | `replaces` de `lanes.json` mide un solo eje; la tabla nueva mide dos, con puntos de corte sin traslape, y marca lo sin medir: los peldaños de agy con nombre de Claude, que AA midió por la API nativa, no sirven a ningún nivel (D3, A-12). |
| C7. El esfuerzo también se decide | viable con ajuste | El esfuerzo se traduce por el nivel medido del peldaño, con una tabla del router aparte de los `levels` del swarm, y el esfuerzo nativo llega a agy y grok sin pasar por `levels` (D3, D4, D8). |
| C8. Los delegados corren también en otros harness | viable con ajuste | `aether-lane start` exige una corrida: hace falta una llamada sin corrida (D8), y solo de solo lectura. |
| C9. Manda la ventana semanal que se renueva antes | viable con ajuste | (a) El router usa la regla del dueño (la ventana semanal que se renueva antes, entre los grupos con saldo sobre la reserva); la alternativa A49 (saldo por hora) difiere entre dos grupos con saldo (escenario 19) y **queda pendiente de la confirmación del dueño**. (b) La lectura de agy no es fiable para el grupo Gemini (marcó 98 % mientras las llamadas eran rechazadas con «Individual quota reached», reinicio en 163 h): la verdad es el rechazo, que deja una marca propia del router; el swarm y los asientos no lo reconocen (incidencia 021). (c) Sin lectura vigente un grupo queda fuera; la renovación no cabe en 3 s y se hace en segundo plano. Antes de que `command` sea el estándar se miden cuánto tarda una renovación y con qué frecuencia una decisión encuentra una lectura todavía vigente (D12). |
| C10. Siempre con fallback hacia nosotros | viable tal cual | El fallback nativo es gratis: si el mod no contesta el delegado, corre normal (evidencia §1); lo que corre sin decisión es lo pedido o la opción `fallback`. |
| C11. Se comprueba antes de darle mando | viable con ajuste | El replay repite el historial y el registro sobrevive entre sesiones, pero medir la precisión de Haiku bajo exige una llamada pagada que hace el dueño con `--paid` (D10). |
| C13. Se ve lo decidido | viable tal cual | El registro y `aether-report --delegates` dan por delegación el peldaño, la razón, la confianza y la cuota gastada (D10). |
| C14. Las demás oportunidades quedan anotadas | viable tal cual | Las propuestas están en `## Proposals`, con su medición, y nada las construye. |

## Proposals

Cada uso hallado de esta arquitectura, con su medición. Ninguno se construye (R32, C14); `docs/guide/router.md` los repite.

1. **Segunda capa del guard.** De 57 comandos (31 peligrosos), las reglas de `aether-guard` detectan 14 (45 %) con 0 falsos positivos; reglas más Jev (`irreversible` ≥ 0.7), 28 de 31 con 0 falsos positivos. Para comandos conviene Haiku bajo, que no los saca de la máquina.
2. **Lint de planes.** El decisor coincide con el Writer y el Judge en 55 % (22 de 40; 6 sin confianza); propone bajar 17 tareas por falta de preguntas de concurrencia, seguridad y migraciones. Solo valdría para subir de nivel.
3. **Graders.** Las 98 tareas «Calificar entrevista» son 53 % del gasto (≈ US$255), casi todas en Opus heredado; hace falta un A/B (≈ US$10) antes de bajarlos. Por eso `evaluate` es una compuerta (R6).
4. **Registro de aciertos del decisor**, una vez que exista el replay (C11), para alimentar 1 y 2.
5. **Una lectura de cuota de agy que incluya el límite individual**, si algún comando de agy lo ofrece: hoy solo `/usage` muestra el grupo, y el grupo puede marcar saldo con el límite individual agotado.
6. **Que el swarm (`lane-calls.js`) y los asientos de diseño (`seat-calls.js`) reconozcan el rechazo explícito de agy** y dejen la marca hasta el reinicio que dice: incidencia `docs/issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md`; pide la confirmación del dueño porque cambia lo que el alcance confirmado excluye.

## Files

| Archivo | Qué hace |
|---|---|
| `plugins/aether/config/router/criterion.json` (nuevo) | El criterio (D2). |
| `plugins/aether/config/router/rungs.json` (nuevo, generado) | La tabla de peldaños (D3). |
| `scripts/build-router-rungs.js` (nuevo) | Genera y comprueba la tabla. |
| `plugins/aether/lib/router-criterion.js` (nuevo) | Carga y valida el criterio; `decide`, `axisOf`, `regress`. |
| `plugins/aether/lib/router-rungs.js` (nuevo) | Deriva la tabla; `levelOf`, `levelOfRung`, `pickRung`. |
| `plugins/aether/lib/router-quota.js` (nuevo) | Lecturas guardadas y su vigencia, y la elección de harness por la ventana semanal que se renueva antes (D7). |
| `plugins/aether/lib/router-marks.js` (nuevo) | El reconocedor del rechazo explícito de agy y las marcas propias del router (D13). |
| `plugins/aether/lib/router-renewal.js` (nuevo) | La renovación de una lectura en segundo plano, con su candado y su espera (D12). |
| `plugins/aether/lib/router-deciders.js` (nuevo) | Los decisores Haiku y Jev y el registro de decisores (D6). |
| `plugins/aether/lib/router-log.js`, `router-report.js` (nuevos) | El registro y el reporte por delegación (D10). |
| `plugins/aether/lib/delegate-calls.js` (nuevo) | Un delegado de solo lectura en otro harness (D8). |
| `plugins/aether/lib/route.js` (nuevo) | `begin` y `finish`: la política completa (D5, D9). |
| `plugins/aether/lib/router-replay.js` (nuevo) | Extracción del historial y replay (D10). |
| `plugins/aether/bin/aether-route` (nuevo) | Los verbos `begin`, `finish`, `delegate` y `replay`. |
| `plugins/aether/bin/aether-report` | La bandera `--delegates`. |
| `plugins/aether/lib/session.js`, `bin/aether-session-start`, `.claude-plugin/plugin.json` | Las cuatro opciones y su archivo de sesión (D11). |
| `plugins/aether/hooks/router.mjs` (nuevo), `hooks/register.js` | El mod: el gancho de `Agent`, el vínculo con el agente lanzado y la respuesta del delegado externo. |
| `plugins/aether/skills/using-aether/SKILL.md` | El Lead describe y no elige modelo cuando el modo es `command`; la anulación. |
| `docs/guide/router.md` (nuevo), `docs/guide/options.md`, `docs/index.md`, `docs/reference/components.md`, `README.md`, `docs/getting-started.md` | Documentación; los hechos que `tests/docs-facts.test.js` fija (opciones, cuenta de bins, enlaces). |
| `tests/router-*.test.js`, `tests/delegate-calls.test.js`, `tests/aether-route.test.js`, `tests/fixtures/router/briefs.json`, `tests/manifest.test.js`, `tests/docs-facts.test.js` | Las pruebas de cada tarea. |

No se tocan: `run.workflow.js`, `design.workflow.js`, `lane-calls.js`, `lane-order.js`, `lane-quota.js`, `lane-readings.js`, `lane-marks.js`, `seats.js`, `config/lanes.json` ni `agents/*.md`.

## Verification

Comando: `npm test` (corre `node --test "tests/*.test.js"`; incluye `tests/docs-facts.test.js`). Antes de un PR: `npm run check`. Ninguna prueba hace una llamada pagada: los decisores son simulados, los harness son `tests/fixtures/fake-agy.js` y adaptadores simulados.

| Criterio | Qué lo prueba |
|---|---|
| C1 | `tests/router-route.test.js`: cada delegación sale con un peldaño (harness, modelo, esfuerzo) de lo que la tarea pide; `tests/router-replay.test.js`: la decisión frente a lo que decidió el Lead. |
| C2 | `tests/router-criterion.test.js` y `tests/router-regression.test.js`: 14 briefs con respuestas registradas y su decisión esperada; la prueba falla con un criterio cambiado. |
| C3 | `tests/router-route.test.js`: en `command`, una delegación sin `model` ni `effort` sale con peldaño; en `record` y `advise` hereda, y en `record` `begin` no espera al decisor; la anulación con motivo conserva lo pedido y queda en el registro. `tests/router-mod.test.js`: en `record` el lanzamiento no espera. |
| C4 | `tests/router-route.test.js` (`aether:*` pasa de largo); `git diff` sin cambios en los archivos del swarm; el workflow y las pruebas de lanes existentes pasan sin cambios. |
| C5 | `tests/router-deciders.test.js`: Haiku y Jev dan las mismas respuestas normalizadas, cada uno con su límite; un tercero se registra sin tocar la política; con `haiku` ninguna petición sale de Claude. |
| C6 | `tests/router-rungs.test.js`: la tabla es la que el índice deriva; los cortes por eje no se traslapan y un valor igual a un corte va al nivel superior; los peldaños de los escenarios 8, 17 y 18 caen en B; un modelo de agy o de grok se ubica donde mide, y los de agy con nombre de Claude quedan sin medir. |
| C7 | `tests/router-rungs.test.js`: `high` es B en Haiku y C en Sonnet; `tests/router-route.test.js`: el esfuerzo es explícito en `command`. |
| C8 | `tests/delegate-calls.test.js` (agy simulado; el esfuerzo nativo llega al CLI sin pasar por `levels`), `tests/aether-route.test.js` y `tests/router-mod.test.js`: un delegado de solo lectura vuelve su resultado sin pasar por un modelo. Una llamada real por harness la hace el dueño (spec, Irreversible actions). |
| C9 | `tests/router-quota.test.js`: los escenarios 8, 9, 16, 17, 18 y 19 con lecturas vigentes simuladas (la regla del dueño, no A49), la lectura ausente o vencida que deja el grupo fuera y una lectura con saldo que no levanta una marca; `tests/router-marks.test.js`: el rechazo real («Individual quota reached … Resets in 163h22m27s.») se reconoce y deja la marca propia (R22b); `tests/router-renewal.test.js`: a lo sumo una renovación por harness y una espera de 3 s como mucho; `tests/router-route.test.js`: el paso de cuota y los escenarios 16 y 20; `tests/aether-route.test.js`: el escenario 20 de punta a punta; el orden de cuota del swarm sin cambios (sus pruebas existentes). |
| C10 | `tests/router-route.test.js`: una prueba por cada forma de falla, y todas terminan con el delegado en Claude; `tests/router-mod.test.js`: un bin que falla deja la llamada intacta. |
| C11 | `tests/router-replay.test.js` y `tests/aether-route.test.js`; `tests/router-log.test.js` (el registro sobrevive entre sesiones). |
| C12 | `tests/router-docs.test.js`: la tabla de viabilidad de `docs/guide/router.md` trae C1 a C14 salvo C12, con cada ajuste y las dos mediciones que se piden antes de dar mando (latencia de Haiku bajo; tiempo de una renovación y frecuencia de lecturas vigentes). |
| C13 | `tests/router-report.test.js`: el reporte da peldaño, razón, confianza, decisor y cuota por delegación. |
| C14 | `tests/router-docs.test.js`: la sección de propuestas (seis) con sus mediciones; ningún archivo del plugin las construye (esta tarea no crea ninguno). |

Lo que ninguna prueba del repositorio comprueba, y queda para el dueño antes de dar mando (`command` como estándar, R31): la precisión de Haiku bajo como decisor (`aether-route replay --decider haiku --paid`) y su **latencia real** frente al límite de 8 s (el registro guarda `deciderMs`); **cuánto tarda una renovación real** de la lectura de grok y de agy y **con qué frecuencia una decisión encuentra la lectura todavía vigente** (el registro guarda, por grupo, la edad de la lectura y `no-reading`, y `quotaWaitMs`); que el gancho `tool.call` se comporte en lanzamientos en paralelo y con `isolation: "worktree"`; que el motor deje terminar el trabajo en segundo plano que el mod inicia en `record` después de que el gancho devuelve; y que el motor no dispare el gancho para los agentes de un workflow.

## Assumptions

- **S1. Los valores de las opciones.** `router`: `record`, `advise`, `command` (los modos «registra», «avisa» y «manda» de la spec). `decider`: `haiku`, `jev`. Reversible: es el texto de las opciones.
- **S2. Los nombres, el formato y el tope de las otras dos opciones de R11.** `fallback` guarda el peldaño estándar de A-4 como `alias:esfuerzo` (estándar `sonnet:high`); `deadlines` guarda los tiempos de A-6 como `haiku=8,jev=3,quota=3` en segundos, y un valor mayor que 10 cuenta como 10 (el gancho que espera tiene 15 s para cerrar la decisión). La spec da el contenido de las opciones y no sus nombres: se pueden renombrar sin tocar la política.
- **S3. Un nivel A a D se calcula con puntos de corte por eje** (inteligencia 37.5, 45, 55; Terminal-Bench 0.18, 0.35, 0.58), el borde inferior de B, C y D, sin traslape y con el valor igual a un corte en el nivel superior (R13). Reproducen los miembros de las bandas de la evidencia §4, que no son los cortes. Están en el generador y en la propia tabla.
- **S4. El decisor produce el nivel y el esfuerzo es el del peldaño** (D4). Reversible: el criterio puede añadir una preferencia de esfuerzo sin tocar el contrato.
- **S5. Un peldaño `unmeasured` no es elegible** (R15, A-12): ni los de agy con nombre de Claude, medidos por la API nativa, ni los de un esfuerzo sin cifra. Reversible: se admite con una medida de agy.
- **S6. Un delegado va a otro harness solo con la opción `lanes` activa y el harness en `harnesses`.** Esos harness corren sin permisos (`--dangerously-skip-permissions`); es la misma condición del swarm. Reversible.
- **S7. «Nivel pedido» en el fallback de harness** es el nivel que la decisión pidió, en el peldaño de Claude más barato que lo mide; el fallback por falla del decisor usa lo que pidió el Lead o la opción `fallback` (D9).
- **S8. El esfuerzo supuesto de la sesión es `xhigh`** (`scripts/aether-lead --effort xhigh`) cuando el Lead pasa `model` sin `effort`, para calcular el nivel que pidió.
- **S9. Los briefs de R5 son sintéticos** (A-9 lo permite): el dueño los sustituye por los reales con el replay. Las respuestas registradas de cada brief son las que midió Jev en la evidencia §3, redondeadas.
- **S10. La forma de la anulación** (A-7): una línea del brief que empieza por `ROUTER-OVERRIDE: ` seguida de un motivo no vacío.
- **S11. El registro no se poda.** Es pequeño (una línea por delegación) y R27 pide que sobreviva; si crece, una poda es una tarea aparte.
- **S12. El «diario» de R30 es el registro `decisions.jsonl`** y su reporte `aether-report --delegates`; el diario de una corrida autónoma lo escribe el Lead y no se automatiza.
- **S13. Un delegado cuyo brief lleva `ROUTER-OVERRIDE` no llama al decisor** (ahorra la llamada); el registro dice que no hubo decisión.
- **S14. La ventana semanal de un grupo es la que se renueva más tarde** (la que `groupView` de `lane-order.js` nombra: `weekly` en agy y en grok). Entre dos grupos con la misma hora de reinicio manda el de mayor saldo.
- **S15. Una lectura es vigente mientras `ahora - readAt` sea menor que su vida** (`quotaLifeMinutes` de `lanes.json`: 10 min agy, 30 min grok; 10 si la tabla no dice). La edad de una lectura de grok es la mayor `source.ageMinutes` de su grupo.
- **S16. Un grupo con lectura vigente pero saldo ilegible queda fuera** (`no-balance`), en vez de ordenarse: la regla del dueño habla de grupos «con saldo».
- **S17. Un rechazo explícito sin reinicio en el mensaje deja la marca 60 minutos** (R22), y uno con un reinicio mayor que lo que `lane-marks.js` acepta (8 días) se acota a 8 días menos un minuto.
- **S18. El trabajo en segundo plano de `record` lo hace el mod después de dejar salir la llamada**, sin que el motor lo haya probado; si el motor lo cancela, `record` pierde un registro y el lanzamiento no se toca (R25).
- **S19. Una renovación suelta dura a lo sumo 120 s**: pasado ese tiempo, o si su proceso murió, su candado no impide la siguiente.

## Risks

- **Haiku bajo como decisor no está medido** (precisión y latencia, spec R31; Artificial Analysis da 3.84 s al primer token). Mitigación: el estándar es `record`, que no cambia nada y no espera al decisor; el replay mide a Haiku antes de dar mando; en `command` una falla por tiempo cae al fallback sin demora mayor que el límite de su decisor (8 s para Haiku, 3 s para Jev), más 3 s de cuota como mucho.
- **El motor no se probó con lanzamientos en paralelo, `isolation: "worktree"` ni un modelo real** (evidencia §1). Mitigación: el router nunca reescribe una llamada si su propio paso falla; las pruebas del mod usan un `$` simulado y el dueño comprueba con `npm run test:mod` y una sesión real antes de pasar a `command`.
- **El gancho puede dispararse para llamadas que no son del Lead** (agentes de un workflow, delegados que lanzan delegados). Mitigación: el filtro por `subagent_type` deja fuera `aether:*`; un delegado de otro tipo lanzado por otro delegado también se rutearía, y queda anotado.
- **El router usa la regla del dueño y A49 queda pendiente** (C9, R21, R31). El escenario 19 fija el comportamiento del dueño; si el dueño confirma el saldo por hora, se cambia solo el orden de `chooseHarness`, y la confirmación debe quedar antes en `intent.md`.
- **Con la vigencia obligatoria, agy se elegirá poco hasta medirlo.** Su lectura vive 10 minutos y renovarla puede tardar hasta 60 s, más que los 3 s de espera: la primera decisión tras un reposo deja a agy fuera y lanza la renovación; la siguiente la encuentra. Mitigación: el registro guarda la edad y `no-reading` por grupo, y la frecuencia con que una decisión encuentra la lectura vigente se mide antes de dar mando (R31); si resulta baja, el límite de 3 s se fija desde esa medida.
- **La lectura de agy miente para el grupo Gemini** (98 % con el límite individual agotado). Mitigación: el rechazo explícito deja una marca del router y ese mismo delegado corre en Claude; el swarm y los asientos siguen reintentando un grupo agotado hasta que se resuelva la incidencia 021 (fuera de alcance, Proposals).
- **El motor no se probó con trabajo en segundo plano después de que el gancho devuelve ni con esperas largas dentro de él.** El gancho tiene 10 s de ejecución propia y `$.process.run` no cuenta (F27), pero `$.model.complete` no está medido. Mitigación: `record` no espera nada; si el motor corta una espera en `advise` o `command`, el mod deja la llamada intacta (R25); se comprueba con `npm run test:mod` y una sesión real antes de pasar a `command`.
- **Un delegado en otro harness corre sin permisos.** Mitigación: solo lectura, en un worktree desechable, con comprobación de que no cambió nada, el entorno limpio de credenciales (`laneEnv`) y la condición S6.
- **Los briefs salen a un tercero con el decisor Jev.** Mitigación: Jev se activa a propósito, la llave nunca está en el repositorio, y el registro no guarda cabeceras ni la llave.
- **Un hallazgo para la spec:** R11 nombra las cuatro opciones por su contenido y no por su nombre; los nombres `fallback` y `deadlines` y sus formatos son del plan (S2). No bloquea.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Un bin nuevo, `aether-route`, en vez de verbos en `aether-lane` | R9: el router no puede cambiar `aether-lane` ni su lógica de cuota; R28 pide un comando de replay | Meter los verbos en `aether-lane` toca el archivo que usa el swarm y mezcla dos dueños; sube la cuenta de bins en la documentación, que `docs-facts` fija |
| `criterion.json` con preguntas, reglas y umbrales | R3: el criterio es un archivo legible y cambiarlo cambia la decisión sin tocar código | Reglas en el código no las puede leer ni cambiar el dueño, y R5 no tendría qué vigilar |
| Una tabla de peldaños generada (`rungs.json` y su generador) | R13, R14, R15, R16: el nivel de cada peldaño sale de las medidas, por eje, y es regenerable | Reusar `replaces` de `lanes.json` mide un solo eje, no marca lo prestado ni lo sin medir, y R9 prohíbe cambiar `levels` |
| El protocolo de dos pasos `begin`/`finish` con un archivo pendiente | R10 y A-6: el decisor estándar es Haiku, que solo el mod puede llamar; el bin no tiene modelo | Llamar a `claude -p` desde el bin añade 2 a 5 s y un proceso de Claude por delegación, contra el límite de 3 s (R23) |
| Un archivo de sesión `sessions/<id>.router.json` | R11: el mod no ve las opciones de la sesión (evidencia §3) | Leer las opciones desde el mod no se puede; el patrón del archivo `.ops-off` ya existe |
| Cuatro opciones (`router`, `decider`, `fallback`, `deadlines`) con dos de ellas de formato propio | R11: la spec pide el decisor, el modo, el peldaño estándar del fallback y los tiempos límite por decisor y de la cuota, todos cambiables por el dueño | Dejar el peldaño estándar y los tiempos en `criterion.json` los esconde del lugar donde el dueño ya configura el plugin, y los tiempos de A-6 «se ajustan con la opción» |
| Un almacén de marcas propio del router y su reconocedor del rechazo (`router-marks.js`) | R22 y R22b: el router deja una marca tras el rechazo explícito sin cambiar `markDry` ni las marcas del swarm (R9) | Escribir en el almacén compartido cambia el 60 minutos del swarm, que es alcance excluido; reconocer el rechazo en `lane-calls.js` es la incidencia 021 |
| Un candado y un proceso suelto de renovación de lecturas (`router-renewal.js`) | R23: la renovación no cabe en 3 s (grok 30 s, agy 60 s) y a lo sumo una por harness a la vez | Esperarla entera detiene el lanzamiento hasta 60 s; sin candado, dos decisiones lanzan dos `agy -p /usage` |
| `lib/delegate-calls.js`, una llamada sin corrida | R18: `aether-lane start` exige una corrida y un worktree de unidad; R26 pide el fallback sin gastar la escalera | Reusar `start` obliga a crear una corrida falsa por delegado; reusar `seats.js` mezcla el esquema y los finalizadores de los asientos |
| Un módulo `hooks/router.mjs` aparte de `register.js` | R9 y R25: `register.js` es el medidor y el ops; el router no debe poder romperlos | Meter la lógica en `register.js` la pone en el camino del medidor y la hace difícil de probar con un `$` simulado |
