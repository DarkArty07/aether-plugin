# Tarjeta de intención: la escalera de los delegados, sin router

- **Dueño:** Christopher
- **Fecha:** 2026-10-22
- **Origen:** la conversación del dueño sobre cómo bajar el gasto sin perder calidad, el issue [#74](https://github.com/DarkArty07/aether-plugin/issues/74) (los delegados que editan en otro harness no se ven como agentes) y el issue [#51](https://github.com/DarkArty07/aether-plugin/issues/51) (las preguntas del router que no mueven el nivel y la regla de subir un modelo frente al modo `command`).
- **Confirmada por el dueño:** el Lead escribió de vuelta lo que entendía (siete cosas que dijo el dueño y seis suposiciones) y el dueño respondió «Esta bien lo confirmo» (cita 11). No dio permiso para trabajar por horas: no es una corrida autónoma, el diseño se detiene en el plan y la construcción espera su sí.

## 1. Las palabras del dueño

1. «el router que tenemos no me ha servido es muy simple, la mayoria de las veces me router siempre a sonnet. Y necesito minimzar el gasto sin perder calidad en los proyectos.»
2. «Estaba pensnado quitar completamente el router y seguir una metodologia escalera [...]. Empezamos con el modelo mas barato nivel Haiku si la tarea estuvo bien ahi se queda realziada la tarea si la tarea esuvo mal se escala al modelo sonnet y si sigue mal se escala a opus.»
3. «la distincion que quiero hacer es que SI nosotros desechamos todo el trbajo anterior entre modelos el gasto de tiempo y de dinero se injsutificado, pero si nosotros dejamos el trabajo anterior mas las observaciones es probalble que el modelo nuevo pueda corregirlo muy bien.»
4. «para costos diria que en haiku siempre, como te digo sientoq ue hay probelma en saber sin experiencia como elegir cada modelo, si le das al sistema la psobilidad de brincar mdoelos simepre tomara el mas caro para garantoizar calidad, pero a veces eso no esta bien».
5. «Creo que entonces ya no necestiariamos nada del router y siento que fue un mal diseño nunca fuinciono bien realemtne veo mas factible hacer otra metodologia que un router. No cambismos la superldeagcion a otros harness solo cambiamos la polticia de empezar con modelos baratos y escalar.»
6. «SI se podria en lugar de escalar directamente pedir correcion al mismo modelo y si es compelmtnaete inviable porque se declaro inadecuado escalar. Esto para forzar lo mas posible codifciar con modelos cheap y mejorar el gasto.»
7. «Un modelo muy baratoc ordinado por un modelo caro se vuelve un modelo muy capaz, bajo esta filosofia necesitamos saber entocnes. Quien va a decidiri si los agentes que delegaste hicieorn buen trabajo o no. Tu?»
8. «quiero usar agent aunque sea en harness extenros proque agent me ayuda a ver si hay suabgentes trbajando, en la parte d eabajo del chat me aprece si hay.» Y en el issue 74: «no me gusta por bash porque agent sí me deja ver si hay agentes trabajando y bash no».
9. «creeme que quneuqe relances 20 veces a haiku en una misma tarea no se compara para nada en dinero respectoa mandar a opus directamente.»
10. «Aprovechamso para cerrar el issue 74 despues de implemenatrlo. Estan hbien esos numeros solo hay que tenerlos en observacion para calibrar el sistema a futuro si es necesario.» (Los números: Haiku hasta 5 correcciones, Sonnet 2, Opus 1.)
11. «Esta bien lo confirmo, tienes a agentes trabajdo en otras sesiones entonces considera eso».

## 2. La intención, en una frase

Que **los delegados del Lead empiecen siempre en el modelo más barato (Haiku) y suban solo cuando hace falta, corrigiendo sobre el trabajo ya hecho en lugar de desecharlo, con el Lead como juez y sin el router que decide el nivel**, y que **todo delegado, aunque corra en otro harness y aunque edite archivos, aparezca como agente trabajando** en Claude Code.

## 3. Lo que ya se supuso (los puntos que el dueño dejó pasar), del más al menos probable de vetar

- **S1. Un solo diseño, con la visibilidad dentro.** El issue 74 se cierra al terminar de implementar esto, no en una entrega aparte. La primera tarea del plan es una prueba corta: ¿puede el mod esperar un delegado largo (10 a 20 minutos) sin un modelo, contestando esperas de menos de 9 minutos una tras otra? Si no puede, el respaldo es un agente barato (Haiku) con solo Bash que lanza el delegado y espera hasta que termina. El resultado visible es el mismo; el plan debe funcionar con cualquiera de las dos.
- **S2. El Lead declara si una tarea edita.** Sin el decisor, la llamada al delegado dice si edita y qué puede tocar (líneas `AETHER-OWNS:` y `AETHER-TESTS:` en el brief); sin ellas la tarea es de solo lectura. Es reversible.
- **S3. En una corrección el mismo pair repite,** con su parche y los hallazgos. La regla de A72 («un pair que falla se reemplaza, nunca se repite») queda solo para los fallos de cuota, tiempo o arranque, no para una corrección que el Lead pide.
- **S4. Salen las opciones `router`, `decider` y `fallback`.** Un valor guardado por el usuario en esas opciones se ignora sin error. La guía del router se reescribe como la de los delegados.
- **S5. El mod conserva la entrega.** Lo que hoy intercepta las llamadas `Agent` y las corre en otro harness es lo que permite ver un delegado externo como agente: se queda. Lo que se va es lo que decide el nivel (el decisor, las siete preguntas, los niveles, los tres modos y el replay). Las marcas de pairs agotados o lentos y la elección del pair se quedan, y pueden cambiar de nombre.
- **S6. El issue 51 queda sin objeto** (el decisor y la regla de subir un modelo en `command` desaparecen) y se cierra al terminar, con la evidencia.
- **S7. Corrida aparte, sin chocar.** Esta corrida trabaja en su propia rama (`feat/delegate-ladder`) y su propio worktree. No toca el checkout principal ni el plugin instalado (0.18.0, que otras sesiones usan ahora), no sube nada y no se funde en `main` sin el sí del dueño. El número de decisión se toma al fundir, no antes (issue #50).

## 4. Lo que se midió (2026-10-22, en el código y en los datos reales)

- **El router casi siempre elige Sonnet.** En la bitácora `router/decisions.jsonl` (338 líneas), de las entradas con modelo unas 107 son Sonnet 5.5 y 9 Haiku; el resto va a Grok y Gemini. El decisor responde siete preguntas, y tres de ellas (`pinned_by_checks`, `needs_judgment`, `reads_a_lot`) no mueven el nivel (issue 51).
- **El enjambre ya tiene la escalera.** `workflows/run.workflow.js` define `TIERS = haiku, sonnet, opus`, un tope de intentos por escalón (`ladder`), `nextTier`, y un supervisor que juzga cada intento (`approve`, `retry`, `escalate` o `block`). El worktree conserva el trabajo de los intentos anteriores y el brief del siguiente dice «continúa desde ahí»; si los mismos hallazgos vuelven tres veces, la unidad se bloquea. El delegado no tiene nada de esto: la regla del bootstrap es «relánzalo un modelo arriba», que parte de cero.
- **La continuación existe solo para fallos de arranque.** `lib/lane-delegate.js` (A82) guarda el parche de un pair que falló y se lo da al siguiente pair, que no puede ser el mismo.
- **Los delegados de solo lectura ya son agentes en otro harness.** El mod (`hooks/router.mjs`, enganchado por `hooks/register.js` a `tool.call` de `Agent`, `agent.spawn` y `turn.step`) corre la llamada en Grok, Argon o Muse y le entrega al Lead el texto como respuesta del agente, sin una petición a Claude. El issue 74 cuenta 27 llamadas así el 2026-10-21.
- **Los que editan van por Bash, y por eso no se ven.** `aether-lane delegate` corre en segundo plano con Bash (A72). Lo que impide pasarlo a `Agent` (issue 74): el motor corta un comando a los 10 minutos (`$.process.run`, A30; un delegado externo tiene 570 s en total, `lib/delegate-limits.js`) y un delegado que edita tarda de 10 a 20; una llamada `Agent` no lleva qué archivos puede tocar ni qué tests correr; y necesita su propio worktree y volver como rama.
- **El revisor del delegado externo no gasta cuota de Claude.** `aether-lane delegate` revisa el diff con otro pair que no lo escribió, de solo lectura, y su veredicto viene en el resultado.
- **Precios (por millón de tokens, entrada y salida):** Haiku 5.5 0.10 y 0.50, Sonnet 5.5 2 y 10, Opus 5.5 4 y 20. Haiku es unas 40 veces más barato que Opus; su precio sube cinco veces con prompts de más de 100K tokens.
- **Otras sesiones trabajan a la vez en este repositorio (2026-10-22, 13:58).** Una tiene un delegado de `aether-lane delegate` corriendo (sobre el panel `/spend`, issue 77) con dos worktrees de unidad en `.aether/worktrees/`; la rama `fix/quick-issues` tiene su trabajo sin fundir y toca `docs/decisions.md`, `docs/reference/components.md`, `aether-session-start`, los agentes `examiner` y `reviewer` y las skills; la máquina tiene 9.9 GB disponibles de 32 y carga de 8.6.
- **Cuotas de otros harness (2026-10-22 19:58 UTC):** agy con Argon y Flash usables (76.9 % semanal); Grok con 3 %, sin uso; Muse con 8 %; la parte Claude de agy en 0 %.
- **Sin historial de costos.** `runs.jsonl` solo guarda corridas abandonadas: no hay cifras para estimar el costo de esta construcción.

**Queda por medir (es trabajo de la spec y de la prueba):** si un paso del mod puede contestar varias esperas seguidas; cuántas peticiones de Haiku cuesta el agente que espera; y cuántas veces aprueba cada escalón (los números se calibran después con la bitácora).

## 5. Fuera de alcance

- **La escalera y el supervisor del enjambre** no cambian: ya funcionan así.
- **La superdelegación:** la elección del pair por puntos, cuota y precio, y sus marcas, no cambian (cita 5).
- **Calibrar los números** (5, 2 y 1): se dejan en observación (cita 10).
- **Otros issues abiertos** (75, 78, 79, 77, 76, 72, 63, 50, 6, 1): no se tocan aquí.
- **Subir, publicar o fundir en `main`:** nada de eso sin el sí del dueño.
- **Cambiar la elección de modelos de los asientos del diseño** (Judge, Writer, Examiner): siguen con la superdelegación como hoy.

## 6. Criterios (qué y por qué, sin el cómo)

- **C1.** Todo delegado de una tarea empieza en Haiku, y el escalón lo fija el sistema, no el Lead: el Lead no puede saltar de modelo por su cuenta. Por: cita 4.
- **C2.** Cuando el trabajo salió mal, el mismo modelo corrige sobre lo hecho: recibe su trabajo y observaciones concretas (archivo, línea, qué falta). Cada modelo tiene sus correcciones (Haiku 5, Sonnet 2, Opus 1) antes de subir. Por: citas 3 y 6.
- **C3.** Solo se sube de modelo si la corrección no basta, si los mismos hallazgos vuelven dos veces o si el Lead declara la tarea inviable para ese modelo y deja la razón por escrito en el registro. Por: citas 4 y 6.
- **C4.** Al subir, el modelo siguiente recibe el trabajo anterior y las observaciones; el trabajo se descarta solo cuando se declara que hay que empezar de cero, con razón. Por: cita 3.
- **C5.** Después de Opus la tarea se aplaza o va a la lista del dueño, como dice la regla de repetición. Por: cita 2 («si sigue mal se escala a opus») y la regla vigente.
- **C6.** El Lead decide si el trabajo salió bien. Primero corren, sin modelo, las comprobaciones objetivas (los tests, los archivos fuera de lo permitido, la tarea vacía); después el veredicto del Lead es aprobar, corregir con hallazgos concretos o declarar inviable con razón. El Lead no lee diffs enteros cuando las comprobaciones o la revisión de otro pair bastan. Por: cita 7.
- **C7.** El decisor del router deja de existir: ni preguntas, ni niveles, ni los modos `record`, `advise` y `command`, ni replay, ni las opciones `router`, `decider` y `fallback`; la documentación y las pruebas ya no los mencionan. Por: cita 5.
- **C8.** La superdelegación sigue igual: cada escalón corre en el pair de otro harness más barato que alcance los puntos del modelo de ese escalón, y cae a Claude solo si ningún pair puede; las marcas de pairs agotados o lentos siguen. Por: cita 5 («No cambiamos la superdelegación»).
- **C9.** Todo delegado, de solo lectura o que edita, se lanza con `Agent` y aparece como agente trabajando mientras dura, aunque corra en otro harness y aunque pase de 10 minutos. Por: cita 8.
- **C10.** Un delegado que edita en otro harness conserva lo que ya garantiza A72: trabaja en su propio worktree, vuelve como rama con los tests que corrió y la revisión de otro pair, no toca el checkout del Lead y el Lead lo funde. Cae a Claude solo si ningún pair puede. Por: el criterio de aceptación del issue 74, que el dueño aceptó al decir «cerrar el issue 74».
- **C11.** La bitácora de delegados guarda, por tarea y por escalón, los intentos, el veredicto y su razón, de modo que `aether-report` muestre cuántas veces aprueba cada escalón. Los topes de correcciones viven en un archivo de configuración, no en el código. Por: cita 10 («tenerlos en observacion para calibrar»).
- **C12.** El issue 74 se comprueba en una sesión real: un delegado externo que edita se ve como agente mientras trabaja. Eso gasta cuota de otros planes (`paid-call`), así que va a la lista del dueño si no hay permiso. Por: cita 10.
- **C13.** Nada de esto afecta a las otras sesiones: no cambia el plugin instalado ni el checkout principal; las pruebas corren en repositorios desechables; el trabajo queda en su rama. Por: cita 11.

## 7. Respuestas a las preguntas aclaratorias

- ¿Quién juzga si un delegado hizo bien el trabajo? El Lead («Tu?», cita 7), con las comprobaciones primero y la revisión de otro pair como apoyo (el dueño no se opuso a esa combinación al confirmar).
- ¿En qué modelo empieza? Siempre en Haiku (cita 4).
- ¿Se conserva algo del router? No: se hace «otra metodología» (cita 5); la elección del pair de la superdelegación se queda (supuesto S5).
- ¿Corrección antes de escalar? Sí (cita 6), con los topes 5, 2 y 1 que el dueño aprobó (cita 10).
- ¿Un diseño o dos? Uno, con la visibilidad dentro (cita 10, supuesto S1).
- ¿El Lead declara si una tarea edita? Quedó como supuesto S2 y el dueño confirmó el conjunto (cita 11).
