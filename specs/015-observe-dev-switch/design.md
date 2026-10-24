# Diseño corto: el modo de desarrollo de la observación es un parámetro

Corrige la decisión A88 de la [spec 014](../014-self-observation/spec.md). Toca la frontera de privacidad de la observación (qué instalación puede leer una conversación), por eso pasa por el Judge.

## Lo que pidió el dueño

Con la 0.20.0 publicada, el dueño preguntó cómo se elige el modo al instalar. Hoy no se elige: la instalación del mercado es siempre estándar y el modo de desarrollo solo existe al correr desde un clon con `--plugin-dir` y `AETHER_OBSERVE=dev` (A88). Sus palabras, tal como las dio el 2026-10-24:

- «normalmente siempre arranco con aether-lead.»
- «Necesito algo comodo, veo dos manera que la gente isntlae la version dev o estndar. O que la version dev sea un parametro.»
- Ante la recomendación del parámetro, `aether-lead --dev` y una opción, contestó: «Si que vaya con el parametro dev, hay que meter el fix. a mi me dejas activado el parametro dev para que siempre con aether-lead pueda entrar a la version dev, hasta seria bueno meter como config true false».

La alternativa de dos plugins con nombres distintos se descartó: duplicaría agentes, skills y hooks, y dos plugins no pueden llamarse los dos `aether` en el mercado.

## Decisiones

**D1. Tres formas de encender el modo de desarrollo, la instalación del mercado incluida.**
1. El parámetro `aether-lead --dev`: el lanzador (`plugins/aether/launcher/aether-lead`) lo reconoce como propio, lo quita de los argumentos que pasa a `claude` y exporta `AETHER_OBSERVE=dev` para esa sesión. `scripts/aether-lead` ya reenvía al lanzador y no cambia.
2. La variable `AETHER_OBSERVE`, que ya existe: `dev` enciende, `standard` apaga.
3. Una opción nueva de `plugin.json` `userConfig`, booleana, `observedev`, apagada por defecto, que se pone con `--config observedev=true` al instalar o en `/plugin` → Installed → aether → Configure options. Llega a los hooks como `CLAUDE_PLUGIN_OPTION_OBSERVEDEV`, igual que `ops` llega a `aether-session-start` como `CLAUDE_PLUGIN_OPTION_OPS` (`bin/aether-session-start`).

Precedencia, en `observeMode(env)` de `lib/observe.js`: `AETHER_OBSERVE=standard` da estándar, `AETHER_OBSERVE=dev` da desarrollo, y sin la variable manda la opción (`CLAUDE_PLUGIN_OPTION_OBSERVEDEV === 'true'`); sin nada es estándar. La variable da desarrollo solo con el valor exacto `dev` y estándar solo con el valor exacto `standard`; cualquier otro valor (`Dev `, vacío) cuenta como no puesta y manda la opción. Así el dueño, con la opción encendida, apaga una sesión con `AETHER_OBSERVE=standard aether-lead`.

**D2. Se quita la comprobación de «árbol del repositorio».** `observeMode` ya no mira si el plugin corre desde un clon: la copia de la caché de Claude Code puede ser de desarrollo. Esto invierte la regla de A88 y de la spec 014 (R11 y A4: «la copia del mercado queda estándar aunque la variable valga `dev`»). Lo que se mantiene es la garantía de la estándar: sin el interruptor, nada lee una conversación, y lo demuestra la misma prueba de la frase marcada. `lib/observe-dev.js` sigue siendo el único archivo que nombra una conversación y solo se carga en modo de desarrollo.

**D3. Un solo directorio de datos y un solo juego de opciones.** Como el modo de desarrollo corre con el plugin instalado, usa `aether-aether-plugin` y las opciones de `aether@aether-plugin`. Ya no hace falta lanzar con `--plugin-dir` ni fijar `AETHER_DATA_DIR`, y no se parte el historial ni las opciones del dueño. El modo de desarrollo desde un clon sigue funcionando igual (la variable o la opción).

**D4. Lo que no cambia.** Qué guarda cada modo, los fragmentos y las correcciones (A90), el borrado de claves, los detectores, la calibración y el resumen durable. La versión y la decisión nueva (A92) se fijan al publicar.

## Archivos

`plugins/aether/lib/observe.js` (`observeMode`), `plugins/aether/launcher/aether-lead` (la bandera y su comentario de cabecera, que dice «the README's start command and nothing else» y «Every argument goes on to claude»: se añade la línea `aether-lead --dev` y se aclara que `--dev` es la única bandera que el lanzador quita), `plugins/aether/.claude-plugin/plugin.json` (la opción), `docs/guide/options.md` (la fila y el párrafo de la opción, que una prueba exige iguales a `plugin.json`), `docs/guide/observe.md` (las dos instalaciones pasan a ser «estándar» y «de desarrollo, con `--dev`, la variable o la opción»), `docs/getting-started.md` (el recuento «the plugin's seven options», el nombre `observedev` y, en la línea 137, la mención de `aether-lead --plugin-dir` junto a `--dev`) y `README.md` (el recuento «seven options»), la línea `- **Config.**` de `CLAUDE.md` (que pasa a nombrar `observedev`) y su línea `- **Self-observation.**` (que hoy dice `AETHER_OBSERVE=dev` con `--plugin-dir`), y las pruebas que fijaban la regla vieja o el recuento: `tests/observe.test.js`, `tests/observe-guarantees.test.js`, `tests/observe-corrections.test.js`, `tests/observe-hook.test.js`, `tests/observe-docs.test.js` y `tests/components-docs.test.js` (`options.length` pasa de 6 a 7). `tests/helpers.js` borra también `CLAUDE_PLUGIN_OPTION_OBSERVEDEV` del entorno de los procesos que lanza, junto a los `AETHER_*` que ya borra, para que la opción del dueño no llegue a la prueba de «sin variable ni opción».

## Pruebas

- `observeMode`: sin variable ni opción es estándar; con `AETHER_OBSERVE=dev` es desarrollo desde cualquier raíz, incluida una copia en la caché; con `AETHER_OBSERVE=standard` es estándar aunque la opción valga `true`; con solo `CLAUDE_PLUGIN_OPTION_OBSERVEDEV=true` es desarrollo; con `false` o cualquier otro valor es estándar; con `AETHER_OBSERVE=Dev ` (otro valor que `dev` o `standard`) y sin opción es estándar, y con ese valor y la opción en `true` es desarrollo (la variable no cuenta).
- La garantía de la estándar sigue en pie: una copia en la caché, sin variable ni opción, no abre el transcript y no escribe la frase marcada, ni en `observe/` ni en ningún otro archivo; y la misma copia con la variable o con la opción sí guarda el fragmento y la corrección.
- El lanzador, en `tests/start-command.test.js` (que ya corre el lanzador contra un `claude` falso y mira el orden de los argumentos; el falso imprime `AETHER_OBSERVE`): `aether-lead --dev` exporta `AETHER_OBSERVE=dev` a `claude` y no le pasa `--dev`; sin la bandera no exporta nada; los demás argumentos llegan intactos y en orden (`-p "x" --dev --resume`).
- La opción: `plugin.json` la declara booleana con valor por defecto `false` y la tabla de `docs/guide/options.md` la nombra (la prueba de opciones existente).

## Fuera del repositorio

Después de publicar la versión, y con el sí del dueño porque toca su plugin instalado: poner `observedev=true` en su `aether@aether-plugin` (`claude plugin configure aether@aether-plugin` o `/plugin` → Configure options) y comprobar con él que `aether-lead` abre en modo de desarrollo (`aether-observe status`). Es lo que pidió: «a mi me dejas activado el parametro dev». Ninguna tarea del repositorio lo hace.

## Riesgos y lo que no se verifica

- **La privacidad ahora depende de un interruptor, no del empaquetado.** El código que lee conversaciones viaja en la instalación del mercado, apagado por defecto. Hoy solo lo usa el dueño. Si algún día lo usa más gente, se puede volver a cerrar con una nueva decisión.
- **No se vio en una sesión real** que Claude Code entregue `CLAUDE_PLUGIN_OPTION_OBSERVEDEV` a un hook de comando. Lo respalda `ops`, que llega así a `aether-session-start`, pero es un hook distinto. Si faltara, quedaría la bandera y la variable, y la opción no tendría efecto.
- **Con `--plugin-dir`** el plugin es el «inline» y sus opciones pueden no ser las de `aether@aether-plugin`: no se verificó de dónde llega `CLAUDE_PLUGIN_OPTION_OBSERVEDEV` en ese caso. Allí valen la bandera y la variable; la opción del dueño puede no aplicar.
- **Una sesión que arrancó antes de cambiar la opción** conserva el modo con que arrancó.

## Fuera de alcance

Un segundo plugin, una bandera `--standard` (la variable lo cubre), cambiar qué se guarda, y cualquier otra opción de la observación.
