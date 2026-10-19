# Tarjeta de intención: Muse Code como harness (0.13.0)

- **Dueño:** Christopher
- **Fecha:** 2026-10-19
- **Confirmada por el dueño** con «necesito que lo planees y lo impeolmentes neceistamos usar muse code trbaja autonomamente», que también abre la corrida autónoma `auto-20261019-145237-9fff` con los techos por defecto (8 h y US$ 50), porque el dueño no dijo números.
- **Lo medido en la sesión** (la CLI instalada, el protocolo, los docs de Meta, los metadatos de la cuenta del dueño, el repositorio): [evidence/README.md](evidence/README.md). No es parte de los criterios.

## 1. Las palabras del dueño

1. «la siguiente update se viene algo grande. va a ser la 0.13.0 y vamos a incluir un nuevo harness, vamos a incluir a muse code»
2. «necesito que lo planees y lo impeolmentes neceistamos usar muse code trbaja autonomamente»
3. Dicho antes por el dueño y registrado en el arranque del Lead: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño».
4. Dicho antes por el dueño, el 2026-10-19 en otra sesión, sobre las llamadas reales de prueba: «necesito que que el el lead lo haga, si me va estar pidiendo que haga cosas se pierde la autonomia».
5. Dicho antes por el dueño, el 2026-10-16 (memoria del Lead): «apruebo los gastos de prueba, usa las sesiones reales». No autoriza nada en esta sesión: dice qué espera de una verificación.

## 2. Lo que el dueño confirmó

La 0.13.0 es la versión que el dueño tenía reservada, y lo «grande» que lleva es un harness nuevo: **Muse Code**, la CLI `muse` de Meta (la 1.4.10 está instalada en su máquina). Quiere que el Lead lo planee y lo implemente solo, hasta dejarlo usable: «neceistamos usar muse code».

- **Qué es «incluirlo»:** Muse pasa a ser un harness de lanes, como agy, codex, grok y cursor. El dueño lo activa en la opción `harnesses`, el swarm le manda unidades mientras su cuota dure, y cuando no esté instalado, no tenga sesión, se agote o falle, la llamada corre en el agente nativo sin preguntarle (3).
- **«Usar» incluye probarlo de verdad:** el dueño espera que el Lead haga las llamadas reales de validación, no que se las pida (4, 5). Para gastar en ellas hace falta que las autorice con sus palabras: hoy no hay concesión (§5-8).
- **Modo de trabajo:** autónomo, hasta que esté diseñado, construido, examinado y listo para publicar. Publicar es del dueño.

**Lo que el dueño no dijo y el Lead leyó en su cuenta** (no es una cita suya; ver §5-1): Muse está instalado y con la sesión iniciada por dispositivo en una suscripción, y el dueño ya usó `muse-wonder-1.0` y `muse-wonder-full-1.0`, que Meta da solo en los planes Power y Maximum.

## 3. Criterios

Cada criterio dice qué y por qué, y se ata a una cita de la sección 1.

- **C1. Muse Code es un harness más de Aether.** El dueño puede elegir `muse` en la opción `harnesses` junto a agy, codex, grok y cursor, y el plugin sabe si está instalado y qué versión es. *Por qué:* es el contenido de la actualización. (1)
- **C2. Las llamadas que le tocan corren en Muse y vuelven como las de los otros harness.** Una unidad del swarm que el orden de cuota manda a Muse se ejecuta con `muse`, en su propio worktree, y devuelve una respuesta limpia o la razón del fallo, más el uso; si la unidad pide una salida estructurada, la recibe. *Por qué:* «neceistamos usar muse code» solo se cumple si trabaja. (1, 2)
- **C3. Siempre con fallback hacia nosotros.** Si `muse` no está instalado, no tiene sesión, su cuota se agotó o la llamada falla, la llamada corre en el agente nativo y el dueño no recibe nada que tenga que contestar. *Por qué:* preguntarlo sería una falla de diseño. (3)
- **C4. Muse entra en el orden de cuota.** El sistema sabe cuánto queda de la suscripción de Muse y la gasta con el orden y la reserva que ya rigen a los otros harness; un rechazo por cuota deja una marca que se cura sola. *Por qué:* RADAR, Delegación: el trabajo va a otros harness mientras dure su cuota. (1)
- **C5. El dueño ve a Muse donde ve a los otros harness.** `aether-lane quota`, el panel `/harnesses`, el índice de modelos (con el precio y el perfil de cada modelo), las opciones, la documentación y la web lo muestran con el mismo trato, y ninguna lista fija de harnesses queda sin él. *Por qué:* una actualización a medias miente. (1)
- **C6. Los modelos de Muse entran por las reglas de siempre.** Un modelo de Muse se usa solo si la propia CLI lo lista, es la generación más nueva de su línea y tiene su perfil escrito desde las páginas de Meta; en la tabla de lanes queda con el nivel de Claude que sustituye según lo medido, o no entra. *Por qué:* son las tres reglas del índice de modelos, y Muse llega a un sistema que ya las cumple. (1)
- **C7. Se prueba con Muse de verdad, y lo hace el Lead.** Antes de cerrar queda constancia de al menos una llamada real a Muse hecha a través de Aether que vuelve limpia, de lo que gastó de la cuota y de la forma real de lo que Muse devuelve, que reemplaza lo supuesto desde su esquema donde difiera. *Por qué:* «neceistamos usar muse code»; el dueño pidió que el Lead haga las llamadas. (2, 4, 5)
- **C8. La 0.13.0 queda lista para publicar.** El manifiesto, el README, el changelog, el handoff, las decisiones y las pruebas dicen 0.13.0 y todo pasa (`npm run check`); publicar queda para el dueño. *Por qué:* «va a ser la 0.13.0», y lo irreversible no está autorizado. (1, 2)
- **C9. Lo que Muse trae de más queda anotado, no construido.** Otras oportunidades que el diseño encuentre se anotan como Propuestas. *Por qué:* hacer lo pedido y decir lo demás. (2)

## 4. Fuera de alcance

- El pago por token con `META_API_KEY`: la cuenta del dueño es una suscripción, Meta no documenta un tope de gasto y `laneEnv` borra las variables con `KEY` en el nombre.
- El modo contributor de Muse, en cualquier forma, incluida una opción para encenderlo.
- Muse en el router de delegados (hoy solo agy y grok) y como asiento de diseño (Judge, Writer, Examiner): Propuestas.
- Muse como modelo del Lead o de los agentes `aether:*`.
- Los modelos que no son de código (`muse-image`, `muse-voice-transcribe`, `sam`) y las funciones de Muse que Aether no usa: voz, skills, plugins, MCP y sus propios subagentes.
- Cambiar el comportamiento de agy, codex, grok o cursor más allá de lo que obligue sumar un harness a las listas.
- Medir a Muse contra el agente nativo (`docs/evaluations`): Propuesta.
- Publicar: el merge a `main`, el push, el tag `aether--v0.13.0` y `claude plugin update`.
- Leer o guardar credenciales de Muse.

## 5. Respuestas a las preguntas aclaratorias

| # | Pregunta | Respuesta | Origen |
|---|---|---|---|
| 1 | ¿Cómo paga el dueño Muse: suscripción o llave por token? | **Suscripción.** El dueño no contestó. El Lead lo leyó en los metadatos de sus sesiones de Muse de hoy: `session.login.completed` con `method: device_code` y `subscribed: true`, ninguna `META_API_KEY` en el entorno, y uso de `muse-wonder-full-1.0`, solo disponible en los planes Power y Maximum. Se diseña para la ventana de 5 h y la semanal. Reversible: el pago por token sería otra lane. | Hallazgo y supuesto del Lead (inferido, probabilidad de veto baja) |
| 2 | ¿Qué se hace con el modo contributor y las reglas personales del dueño? | **Supuesto:** cada llamada de Aether a Muse sale con el modo contributor apagado y sin cargar las reglas, skills ni memorias que el dueño tiene para otras herramientas; no hay opción para encenderlo. Base: Meta dice que en Muse Code el contributor viene encendido por defecto para suscriptores y que a cambio entrena con el contenido, y Muse lee por defecto skills de `~/.claude` y `$CODEX_HOME`. El spec lo trae como requisito y no solo como supuesto, para que el examen lo compruebe. Reversible: la opción se añade después. | Supuesto del Lead (probabilidad de veto media: renuncia a «más uso») |
| 3 | ¿Qué papel tiene Muse? | **Supuesto:** lane del swarm, con los roles que la tabla le dé a cada modelo. No es asiento de diseño ni entra al router de delegados (C9). Reversible. | Supuesto del Lead |
| 4 | ¿Qué modelos? | **Supuesto:** los que la CLI liste y sean la generación más nueva de su línea: hoy `muse-spark-1.3`, `muse-wonder-1.0` y `muse-wonder-full-1.0` (este solo con plan Power o Maximum; si la cuenta no lo da, no se usa). Nunca los `-contributor`. Qué nivel de Claude sustituye cada uno lo dice la medición de Artificial Analysis o, sin ella, ninguno: la clave `ARTIFICIAL_ANALYSIS_API_KEY` no está en esta sesión y los puntajes publicados por Meta y por terceros no coinciden. | Supuesto del Lead |
| 5 | ¿Con qué seguridad corre la llamada? | **Supuesto:** sin aprobaciones, con el sandbox de Muse encendido y el workspace sin confianza salvo lo que el diseño justifique. Si el sandbox no arranca en esta máquina (WSL), la lane se marca no disponible y la llamada corre en el agente nativo: no se baja la seguridad en silencio. Reversible. | Supuesto del Lead |
| 6 | ¿Cuánto puede gastar una llamada? | **Supuesto:** con tope de pasos del modelo y con el tiempo límite de las otras lanes, porque `--max-model-steps` es el único freno que documenta Meta y los observadores y subagentes de Muse hacen llamadas propias. Reversible. | Supuesto del Lead |
| 7 | ¿Cómo se lee la cuota? | **Abierto para el diseño.** El esquema de Muse define `usage/read` y `usage/changed` (ventana de 5 h y semanal con `usedPercent` y `resetsAtMs`) y `quota` en el fallo de un turno; `exec --json` trae `allowance` en `run.usage`, cuya forma solo se ve con una llamada real. El plan elige y dice qué queda sin medir. | Hallazgo |
| 8 | ¿Gastos de prueba? | **No autorizados en esta sesión:** `aether-autonomy check paid-call` da `covered: false`. Va a «Espera tu sí» con el comando exacto, y todo lo que no depende de ello sigue. | Dueño (reglas) |
| 9 | ¿Qué lleva la 0.13.0 además de Muse? | **Nada.** «Algo grande» se lee como el harness mismo. Si el dueño tenía más, lo dirá; mientras tanto, Propuestas. | Supuesto del Lead |
| 10 | ¿Dónde se trabaja? | En la rama `feat/muse-harness`, worktree `.worktrees/muse-harness`, desde `main` en `3cafbce`. Otra sesión del dueño sigue activa en este repo (en esta sesión `main` avanzó de #42 a #43): la numeración de decisiones (A63) y de issues se vuelve a comprobar antes de cerrar. | Supuesto del Lead |
