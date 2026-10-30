# Tarjeta de intención: Codex como harness de trabajo (0.27.0)

- **Dueño:** Christopher
- **Fecha:** 2026-10-29
- **Confirmada por el dueño** con «Me agrada. … Comeinza a trabajar autonomamente» (3), que también abre la corrida autónoma `auto-20261029-185517-6665` con los techos por defecto (8 h y US$ 50), porque el dueño no dijo números.
- **Lo medido en la sesión** (la lista de modelos de Codex, la API de Artificial Analysis, la lectura de cuota, la línea de órdenes instalada): [evidence/README.md](evidence/README.md). No es parte de los criterios.

## 1. Las palabras del dueño

1. «Ahora si ya tengo una cuenta de codex para poder realziar las pruebas, mira que modelos hay comparalo con artifiail analysys y comeinza a ver como vamos a hacer la impelemtnaicon de codex porque ahora si necesito comenzar a trabjar con codex asi como se trbaja con los demas harness»
2. «justo esos modelos que escogiste son los que quiero. Ene ste caso astra se queda en el mismo caso que fable 5.1, como un modleo mucho mas barato anterior lo ancanza casi, no lo vamos a usar hasta que salga astra 6.1 haz una skill o ampl.ia las que ya tenemos con esta filosofia porque es importante.»
3. «Me agrada. Asi como escogiste todas estas opciones ASI TIENES QUE ESCOGER siempre que hagamos un harness nuevo que no vuelva a pasar lo de musecode, amplia el conocimeitno con skills no se si tienes que hacer una nueva o editar una ya existente. Comeinza a trabajar autonomamente»
4. Preguntas del dueño entre medias, contestadas con las cifras de AA del 2026-10-29: «Entonces me recomeindarias comenzar la ladder en luna o en terra» y «si empezamos en terra medium como quedarian los tiers en comapracion con los de claude code nativo». La tabla que se le dio, y que aprobó con (3), es la de §2.
5. Dicho antes por el dueño sobre Muse (A96, 2026-10-27): «No usamos todos los modelos disponibles, esa implemtnacion de muse spark esta mal hecha necesitamos resolverlo» y «consutlamos el saldo de mala manera».
6. Dicho antes por el dueño: «siempre con fallback hacia nosotros» y «necesito que que el el lead lo haga, si me va estar pidiendo que haga cosas se pierde la autonomia» (sobre las llamadas reales de prueba).
7. Dicho antes por el dueño, spec 010: «codex y cursor por el momento no los adoptamos». Las palabras (1) lo cambian para Codex.

## 2. Lo que el dueño confirmó

Codex pasa de tener un adaptador sin usar a ser un harness de trabajo, **como agy, grok y Muse**: el swarm le manda unidades, el router de delegados le manda tareas de lectura y de edición, la cuota decide el orden con la regla de siempre y todo lo que falle corre en el agente nativo sin preguntarle (6). La cuenta es de ChatGPT Plus (lo dice la propia lectura de cuota de Codex).

**Los modelos son estos tres, en los cinco esfuerzos que AA mide** (low, medium, high, xhigh, max): **GPT-6.1 Sol** (`gpt-6.1-sol`), **GPT-6.1 Terra** (`gpt-6.1-terra`) y **GPT-6 Luna** (`gpt-6-luna`). **GPT-6 Astra se queda fuera** hasta que salga GPT-6.1 Astra, igual que Fable 5.1 hasta Fable 5.5 (A43): Astra max saca 56.9 contra 54.5 de Sol max, y Sol cuesta una quinta parte por token (2). Quedan fuera también las generaciones anteriores (`gpt-6-sol`, `gpt-5.6-*`), los modelos que Codex oculta (`gpt-reserve`, `codex-auto-review`) y el esfuerzo `ultra`, que AA no mide.

**Los escalones**, con la tabla que el dueño aprobó (4) (inteligencia / Terminal-Bench de AA, 2026-10-29):

| Escalón nativo | Su equivalente en Codex |
|---|---|
| 1. Haiku high (29.6 / 21.7 %) | **Terra medium** (38.1 / 32.3 %) |
| 1, corrección: Haiku xhigh (34.3 / 29.3 %) | **Terra high** (42.3 / 41.9 %) |
| 2. Sonnet high (41.1 / 43.9 %) | **Sol medium** (46.1 / 48.0 %) |
| 3. Opus high (51.7 / 56.6 %) | **Sol max** (54.5 / 56.1 %) |

Luna max (27.8 / 12.6 %) queda 1.8 puntos de inteligencia y 9 de código por debajo de Haiku high: entra a la tabla, pero no es un escalón de inicio; el sistema, no el Lead, decide si gana alguna llamada.

**El método de elegir queda escrito** en skills, para que el próximo harness se elija igual y no pase «lo de Muse» (3, 5): listar todo lo que la CLI da a la cuenta, compararlo con AA el mismo día contra los escalones nativos, aplicar la regla del modelo de arriba (2), leer la cuota sin gastar si se puede, y validar con llamadas reales antes de dar nada por hecho.

**Modo de trabajo:** autónomo, hasta que esté diseñado, construido, examinado y listo para publicar. Publicar es del dueño.

## 3. Criterios

Cada criterio dice qué y por qué, y se ata a una cita de la sección 1.

- **C1. Codex es un harness más de Aether.** El dueño lo elige en la opción `harnesses`, junto a agy, grok y Muse, y el plugin sabe si está instalado y qué versión es. *Por qué:* «necesito comenzar a trabajar con codex así como se trabaja con los demás harness». (1)
- **C2. Las llamadas que le tocan corren en Codex y vuelven como las de los otros harness.** Una unidad del swarm o un delegado que el orden de cuota manda a Codex se ejecuta con `codex exec`, en su propio worktree, con el modelo y el esfuerzo del par, y devuelve una respuesta limpia o la razón del fallo, más el uso; si pide una salida estructurada, la recibe. *Por qué:* sin eso no se «trabaja con codex». (1)
- **C3. Siempre con fallback hacia nosotros.** Si `codex` no está instalado, no tiene sesión, su cuota se agotó o la llamada falla, la llamada corre en el agente nativo y el dueño no recibe nada que tenga que contestar. *Por qué:* preguntarlo sería una falla de diseño. (6)
- **C4. La cuota de Codex se lee bien.** El sistema lee la ventana de 5 horas y la semanal de Codex con `account/rateLimits/read`, sin llamar a ningún modelo ni leer credenciales, la gasta con el orden y la reserva que ya rigen a los otros harness, y un rechazo por cuota deja una marca que se cura sola. *Por qué:* con Muse «consultamos el saldo de mala manera»; con Codex hay una lectura gratis y real. (1, 5)
- **C5. Se usan todos los modelos que el dueño quiere, y los que no, quedan fuera con su razón.** Sol, Terra y Luna están en la tabla de lanes, en la tabla de pares (un par por esfuerzo, con las cifras de AA de su fecha), en los perfiles, en los precios y en el índice de modelos. Astra, las generaciones anteriores, los modelos ocultos y `ultra` están en la lista de excluidos con la razón; la de Astra nombra el modelo cuya salida reabre la pregunta (GPT-6.1 Astra). *Por qué:* «No usamos todos los modelos disponibles» fue la falla de Muse, y Astra es el caso de Fable. (2, 5)
- **C6. Los escalones quedan como el dueño los aprobó.** Con la tabla tal como se entrega, la regla de la superdelegación pone el primer escalón en Terra medium, su corrección en Terra high, el escalón de Sonnet high en Sol medium y el de Opus high en Sol max, y una prueba lo fija. Si los costos hacen que otro par gane, el brief lo dice con sus cifras. *Por qué:* es la tabla que aprobó. (4, 3)
- **C7. La llamada no hereda la configuración personal del dueño.** `codex exec` no carga el `config.toml`, el `AGENTS.md`, las reglas ni los hooks de `~/.codex`, no guarda archivos de sesión, corre con el sandbox encendido y sin aprobaciones, y nadie abre `auth.json`. *Por qué:* su Codex pesa 36 KB de configuración y 25 KB de `AGENTS.md`; sin esto cada llamada cargaría el entorno de otra herramienta. (1, 6)
- **C8. Codex toma delegados.** El router de delegados y `aether-lane delegate` lo cuentan junto a agy, grok y Muse, para lectura y para edición, con la misma cuota y el mismo fallback. *Por qué:* «así como se trabaja con los demás harness»; la decisión de la spec 010 («por el momento no») la cambian sus palabras de ahora. (1, 7)
- **C9. Se prueba con Codex de verdad, y lo hace el Lead.** Antes de cerrar queda constancia de llamadas reales a Sol, Terra y Luna a través de Aether que vuelven limpias, de lo que gastaron de la cuota, y de la forma real de los eventos de `codex exec --json`, que reemplaza lo supuesto de Spec Kit donde difiera. *Por qué:* «ya tengo una cuenta de codex para poder realizar las pruebas», y el Lead hace las llamadas. (1, 6)
- **C10. El método de elegir un harness queda en skills.** Hay una skill para dar de alta un harness nuevo (qué listar, cómo compararlo con AA, la regla del modelo de arriba, la cuota, las llamadas reales, las listas que hay que tocar) y la skill de AA recoge la regla del modelo de arriba y la trampa de las escalas. *Por qué:* «ASÍ TIENES QUE ESCOGER siempre que hagamos un harness nuevo». (3, 2)
- **C11. La 0.27.0 queda lista para publicar.** El manifiesto, el README, el changelog, el handoff, las decisiones (A100) y las pruebas dicen 0.27.0 y todo pasa (`npm run check`); publicar queda para el dueño. *Por qué:* lo irreversible no está autorizado. (1)
- **C12. Lo que Codex trae de más queda anotado, no construido.** Otras oportunidades que el diseño encuentre se anotan como Propuestas. *Por qué:* hacer lo pedido y decir lo demás. (3)

## 4. Fuera de alcance

- GPT-6 Astra, hasta GPT-6.1 Astra; `gpt-6-sol` y los `gpt-5.6-*`; `gpt-reserve` y `codex-auto-review`; el esfuerzo `ultra`.
- Refrescar toda la tabla de pares con las cifras de AA de hoy (casi todas bajaron entre 3 y 12 puntos desde el 26-oct: [evidence/README.md](evidence/README.md) §3): cambia el reparto de los otros harness y obliga a rehacer las estimaciones de Muse. Propuesta, con la diferencia medida.
- Codex como asiento de diseño (Judge, Writer, Examiner): solo agy los tiene hoy y hacerlo exige medirlo. Propuesta.
- Codex como modelo del Lead o de los agentes `aether:*`.
- Pago por token con `OPENAI_API_KEY` y cualquier lectura o copia de las credenciales de Codex (`auth.json`).
- Las funciones de Codex que Aether no usa: nube, plugins, MCP, subagentes propios, `review`, `resume`.
- Cambiar el comportamiento de agy, grok, Muse y Cursor más allá de lo que obligue sumar un harness a las listas.
- Leer las páginas de AA con un programa: solo la API.
- Publicar: el merge a `main`, el push, el tag `aether--v0.27.0` y `claude plugin update`.

## 5. Respuestas a las preguntas aclaratorias

| # | Pregunta | Respuesta | Origen |
|---|---|---|---|
| 1 | ¿Suscripción o llave por token? | **Suscripción** (plan Plus: la lectura de cuota de Codex da `planType: plus`, ventanas de 300 y 10080 minutos). Sin `OPENAI_API_KEY`. | Hallazgo |
| 2 | ¿Qué hacer con que AA movió todas sus cifras entre el 26 y el 29-oct? | **Supuesto:** las filas de Codex llevan las cifras de la API de AA de su fecha (2026-10-29) y las demás filas quedan como están hasta que el dueño decida el refresco de toda la tabla. La mezcla de escalas subvalora a Codex (nunca lo sobrevalora) y los cuatro escalones de §2 siguen cumpliéndose con la tabla mezclada. Reversible. | Supuesto del Lead |
| 3 | ¿Y el costo por tarea de cada esfuerzo? | **Supuesto:** la API de AA no lo da. Donde AA no lo ha medido, se estima con el método de A96 (razón entre esfuerzos de las curvas medidas), se marca como estimación en la fila y el dueño puede reemplazarlo con su gráfico de AA. Un par sin costo se ordena al final y nunca gana. Reversible. | Supuesto del Lead |
| 4 | ¿Qué roles tiene cada modelo? | **Supuesto:** `implementer` para los tres; `supervisor` para Terra y Sol; `reviewer` para Sol; ninguno de los asientos de diseño. Lo que juzga «lo que falta» no lo mide AA: se decide con los casos de Aether, y mientras no haya medición el rol queda con la regla de Muse. Reversible. | Supuesto del Lead |
| 5 | ¿Cómo se pasa el esfuerzo? | **Supuesto:** `-c model_reasoning_effort=<nivel>` con el mismo nombre del par; la llamada real confirma que Codex acepta `max`. | Supuesto del Lead |
| 6 | ¿Gastos de prueba? | **Cubiertos:** `aether-autonomy check paid-call` da `covered: true` por una concesión del repositorio del 2026-10-27 («Apruebo hgasto»). Las llamadas reales son pocas y mínimas, y se anota lo que gastan de la cuota Plus. Las concesiones de push, merge, publish y delete de esa misma sesión **no se usan**: son de otra obra. | Dueño (1), registro |
| 7 | ¿Qué lleva la 0.27.0 además de Codex? | **Nada.** | Supuesto del Lead |
| 8 | ¿Dónde se trabaja? | En la rama `feat/codex-harness`, worktree `.worktrees/codex-harness`, desde `main` en `5df3b86`. Otras sesiones pueden mover `main`: la numeración de decisiones (A100) y de issues se vuelve a comprobar antes de cerrar. | Supuesto del Lead |
