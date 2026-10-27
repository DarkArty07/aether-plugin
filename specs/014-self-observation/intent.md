# Tarjeta de intención: el plugin se observa a sí mismo

- **Dueño:** Christopher
- **Fecha:** 2026-10-23
- **Origen:** la conversación del dueño antes de una pausa de unas semanas en el desarrollo. Los issues abiertos (#88, #81, #80, #78, #75, #50, #6, #1) no son su origen y no se tocan aquí.
- **Confirmada por el dueño:** el Lead escribió de vuelta lo que entendía en dos rondas. En la segunda, el dueño eligió la opción A de la separación entre versión estándar y de desarrollo («con dos metodos de instalacion»), dejó la B al diseño («Eso lo tienes que diseñar tu») y pidió «una propuesta», porque le «aprece que ya entendiste» lo que necesita (cita 4). No dio permiso para trabajar por horas: no es una corrida autónoma, el diseño se detiene en el plan y la construcción espera su sí.

## 1. Las palabras del dueño

1. «quiero detener el desarrollo por el moento hasta aqui en funcionalidades, ya me canse y dentendre unas semanas el desarrollo de mi plugin. Quiero meter una update antes del descanso que sea para calibrar el sistema, meter hooks, observacion o deteccion automaitca de bugs que el lead los detecter automaticamente, para que pueda usarlo e ir recompilando informaicon de suso, asi cuando vuelva a trbajarlo activamente pueda saber en que comenzar, y tambien calibracion por si algun rol esta desfasado y hace falta calibracion o cosas por ele estilo, me explico?»
2. «mas o menos. /aether:onboard enfoacte en la observalidad para mejroar el plugin, hacer calibraciones etc etc»
3. «siento que tu propuesta esta muy generica. lo que quiero son hooks de automejora, pero no necesariamente automejora siginifca que cambie su propio codigo en ese instante, si no que el plugin identificque errores, y vaya recopilando informacion de uso, quiza esto es agresivo porque hasta pdoria leer las conversaciones, asi que epsnaba hacer un dev version y una estadnar version, para no filtrar informacion de usuario, actualment esolo lo uso yo pero creo que entiendes la idea»
4. «A: con dos metodos de instalacion B: Eso lo tienes que diseñar tu. Comienza a diseñarlo, necesito que me hagas una propuesta, me aprece que ya entendiste lo que ncesito»

## 2. La intención, en una frase

Que **el plugin se vigile solo mientras se usa: que identifique sus errores y vaya reuniendo información de uso con hooks, sin cambiar su propio código, y que señale con evidencia qué rol o ajuste parece desfasado**, para que el dueño, al volver de su pausa, sepa por dónde empezar; y que esto exista en **dos versiones de instalación, una estándar que nunca toca las conversaciones del usuario y una de desarrollo, la del dueño**.

## 3. Lo que ya se supuso (los puntos que el dueño dejó pasar), del más al menos probable de vetar

- **S1. «Automejora» es identificar y reunir, no modificar.** Nada se reescribe ni se reconfigura solo: el plugin no cambia su código, ni `ladder.json`, ni `pairs.json`, ni los Tier de los roles. Propone, con números y evidencia, y el dueño decide. Es reversible: modificar solo se podría añadir después (cita 3, «no necesariamente»).
- **S2. Lo que reúne la versión de desarrollo de las conversaciones lo diseña el Lead, con una guía:** solo lo que hace falta para entender un fallo o una fricción (el fragmento alrededor, no la conversación entera), con claves y tokens borrados antes de guardar. El diseño puede proponer otra cosa si la justifica (cita 4, B).
- **S3. Nada sale de la máquina del dueño en ninguna versión.** Lo reunido queda en el directorio de datos local. Un issue de GitHub, con los hallazgos redactados, solo se abre con el sí del dueño, porque es una acción hacia fuera.
- **S4. La versión estándar lo demuestra, no lo promete.** Su garantía de no leer conversaciones se comprueba con una prueba (una conversación falsa con una frase marcada que no debe aparecer en nada de lo que se escribe), y el diseño decide si además basta que el código que las lee no viaje en esa instalación.
- **S5. Lo reunido sobrevive a la pausa.** Hoy la poda de 30 días borra el uso y el registro de lanes, y la pausa dura semanas. Lo que sirva para calibrar queda en un resumen propio que la poda no borra, como ya hace el gasto (A76).
- **S6. Los valores actuales no se cambian en esta actualización.** Los topes de la escalera (5, 2 y 1), los pares y los Tier se calibran desde el uso después de la pausa. Lo que sí entra es una primera lectura de los registros que ya existen, como línea base.
- **S7. Corrida aparte, sin chocar.** Trabaja en su propia rama (`feat/self-observation`) y su propio worktree. No toca el checkout principal ni el plugin instalado (0.19.2), no sube nada y no se funde en `main` sin el sí del dueño. El número de decisión se toma al fundir (issue #50). La versión que saldría es la 0.20.0.

## 4. Lo que se midió (2026-10-23, en el código y en los datos reales)

- **Los hooks de hoy son dos:** `SessionStart` (`aether-session-start`) y `PreToolUse` (`aether-guard`). Todo lo demás vive en el mod (`hooks/register.js` y los `.mjs`), que mide cada petición de modelo, entrega las llamadas `Agent` a la escalera, corre el freno de cuota y dibuja `/spend` y `/harnesses`. Ambos solo actúan en una sesión del Lead; en una sesión normal duermen, y eso es una invariante del diseño medida en `docs/reference/components.md`.
- **El mod está hecho para no estorbar y por eso calla.** Tiene unos 30 `catch` (25 en `register.js`, 5 en `delegate.mjs`, 1 en `quota-brake.mjs`) y su cabecera dice que un fallo suyo «nunca cambia, retrasa ni bloquea» una petición. No se auditó cuántos de esos `catch` dejan rastro. Hay un precedente de rastro: `prune-failures.json` de la poda del gasto.
- **Lo que ya se registra, y se lee solo a mano:** el uso por petición (`usage/`, 44 sesiones), el registro de delegados (`delegates/log.jsonl`, 75 líneas, sin poda), el registro de lanes por sesión y sus marcas de cuota (30 días), `runs.jsonl` (33 líneas, 7 corridas terminadas con 6 a 37 dólares a precio de lista y una mediana de unos 19.5), la lista del guard (`.aether/pending.jsonl`, 7 comandos) y los exámenes. Se leen con `aether-report --delegates`, `--spend`, `--seats`, `/spend` y `/harnesses`. Nada vigila anomalías ni compara la configuración con lo ocurrido.
- **Hay un precedente de leer conversaciones:** `lib/voice.js` (`aether-voice`) lee del transcript local los mensajes que el dueño escribió (`~/.claude/projects/<carpeta>/<sesión>.jsonl`).
- **El mercado tiene hoy un solo plugin,** `aether` (`.claude-plugin/marketplace.json`). Una segunda instalación es una decisión de empaquetado que el diseño debe resolver, con las pruebas de documentos del repositorio (`tests/docs-facts.test.js`), la validación `--strict` y la tabla de opciones (`plugin.json` `userConfig` frente a `docs/guide/options.md`).
- **Lo que pide mirar el último handoff** (2026-10-22, escalera de delegados), que esta actualización debería poder responder sin leer a mano: que un delegado real en otro harness se vea en la barra de agentes todo su recorrido, que las líneas de latido no confundan al Lead, si empezar en Haiku cuesta más de lo que ahorra (cuántas veces aprueba cada escalón) y si un pair sin cuota manda todos los delegados a Claude (muchos `no-candidate`).
- **Fallos que el Lead ya cometió y que el sistema habría podido señalar:** programar un `ScheduleWakeup` para esperar un delegado (issue #89, ya corregido a mano) y las reglas del bootstrap que se rompen sin que nada lo registre.

**Queda por medir (es trabajo de la spec y de la prueba):** qué eventos de hook ofrece esta versión de Claude Code además de los dos usados (por ejemplo fin de turno, fin de sesión, fallo de una herramienta, parada de un subagente); cuántos de los `catch` del mod hoy no dejan rastro; y cuánto pesaría guardar un resumen durable.

## 5. Fuera de alcance

- **Funcionalidades nuevas de trabajo** del Lead, del diseño o del enjambre (cita 1: «detener el desarrollo [...] en funcionalidades»).
- **Cambiar políticas o valores** de la superdelegación, la escalera, los pares, los precios o los Tier (S6).
- **Que el plugin se modifique solo** (S1).
- **Mandar datos a un servidor, a otra persona o a GitHub sin el sí del dueño** (S3).
- **Leer conversaciones en la versión estándar,** en cualquier forma (cita 3).
- **Los issues abiertos:** #88, #81, #80, #78, #75, #50, #6 y #1 no se tocan aquí.
- **Subir, publicar, fundir en `main` o actualizar el plugin instalado:** nada de eso sin el sí del dueño.

## 6. Criterios (qué y por qué, sin el cómo)

- **C1.** El plugin identifica sus propios errores por sí solo, sin que el dueño lo pida y sin gastar un modelo: los fallos que hoy pasan en silencio dejan rastro, y los comportamientos que indican un error (una tarea que sube de escalón sin razón, un pair que falla una y otra vez, una regla del Lead que se rompe, un comando bloqueado por error) quedan señalados. Por: cita 1 («deteccion automaitca de bugs [...] automaticamente») y cita 3 («que el plugin identificque errores»).
- **C2.** El plugin va reuniendo información de uso mientras se usa, con hooks, sin que nadie tenga que acordarse. Por: cita 1 («ir recompilando informaicon de suso») y cita 3 («vaya recopilando informacion de uso»).
- **C3.** El plugin señala qué rol o ajuste parece desfasado (un escalón que casi nunca aprueba, un pair o un modelo que ya no rinde como su ficha, un rol del diseño que pide demasiadas rondas, un costo estimado que no coincide con el real) y propone el ajuste con números y evidencia, sin aplicarlo. Por: cita 1 («si algun rol esta desfasado y hace falta calibracion») y S1.
- **C4.** El dueño, al volver, encuentra un solo lugar que le dice por dónde empezar: una lista ordenada de lo observado, cada elemento con su evidencia y, si es un fallo, un issue ya redactado. Por: cita 1 («pueda saber en que comenzar»).
- **C5.** Lo reunido sobrevive a una pausa de semanas y a la poda de 30 días. Por: cita 1 («dentendre unas semanas») y S5.
- **C6.** Hay dos instalaciones: la estándar y la de desarrollo. Por: cita 4 («A: con dos metodos de instalacion»).
- **C7.** La instalación estándar no reúne, guarda ni escribe nada del contenido de una conversación (lo que el usuario escribe, lo que el modelo contesta, el contenido de archivos): solo cuentas, identificadores, nombres de modelo, duraciones y códigos de error. Esto se demuestra con una prueba. Por: cita 3 («para no filtrar informacion de usuario») y S4.
- **C8.** La instalación de desarrollo puede reunir, además, lo que haga falta de las conversaciones para entender un fallo o una fricción, con claves y tokens borrados antes de guardar, y lo que reúne lo fija el diseño. Por: cita 3 («hasta pdoria leer las conversaciones») y cita 4 (B).
- **C9.** Nada de lo reunido sale de la máquina del dueño; un issue se abre solo con su sí. Por: cita 3 («no filtrar informacion de usuario») y S3.
- **C10.** Los hooks y detectores actúan solo en una sesión del Lead; en una sesión normal no hacen nada, y esa huella dormida se sigue midiendo en la documentación. Por: la invariante del diseño del repositorio.
- **C11.** El dueño puede ver qué reunió el plugin, por ejemplo con un comando de resumen, y puede borrarlo. Por: cita 3 (el dueño nombró el riesgo de privacidad, así que debe poder verlo y quitarlo).
- **C12.** Una primera lectura de los registros que ya existen (línea base) forma parte del resultado, sin cambiar ningún valor. Por: cita 1 («calibrar el sistema») y S6.
- **C13.** Nada de esto afecta a las otras sesiones: no cambia el plugin instalado ni el checkout principal; las pruebas corren en repositorios desechables; el trabajo queda en su rama. Por: S7.

## 7. Respuestas a las preguntas aclaratorias

- ¿Cómo se separan la versión de desarrollo y la estándar? Con dos métodos de instalación (cita 4, A). Cómo se empaquetan es parte del diseño.
- ¿Qué lee la versión de desarrollo de las conversaciones? Lo decide el diseño (cita 4, B), con la guía de S2.
- ¿«Automejora» cambia el código? No: identifica y reúne (cita 3, S1).
- ¿Quién usa hoy la versión de desarrollo? Solo el dueño (cita 3), así que su plugin instalado pasaría a ella cuando él lo diga.
- ¿Se empieza a construir tras el diseño? No: se detiene en el plan y espera su sí (esta corrida no es autónoma).
