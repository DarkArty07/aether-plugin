# Tarjeta de intención: el gasto de una sesión completa

- **Dueño:** Christopher
- **Fecha:** 2026-10-22
- **Origen:** la pregunta del dueño sobre cómo bajar los costos de modelos y el issue [#73](https://github.com/DarkArty07/aether-plugin/issues/73), que tiene las pruebas de lo que sigue.
- **Confirmada por el dueño:** el Lead escribió de vuelta lo que entendía (dólares o cuota, dónde se ve, sesiones bifurcadas) y el dueño respondió las tres preguntas y dio el permiso para diseñar e implementar sin él (citas abajo). Las sesiones bifurcadas las dejó a elección del Lead: ver S1.

## 1. Las palabras del dueño

1. «La unica manera de mejorar el gasto es rastrear el gasto de cada sesion completa desde que la incio hasta que la termino, y si la decido recontinuar despues de cerrarla el gasto se sigue sumando».
2. «hemos estado registrando los gastos por sesion? tenemos algo asi como un chekout que nos diga cuanto hemos estado gastando por sesion completa aunque haya varios swarms etc».
3. «Los dolares proque si te fijas unicamente por cuota de subcricpion no sabes que gasto atribuirle a cada sesion si hay diferentes sesiones trbajando al mismo tiempo».
4. «uy un comando asi como harnesses seria muy bueno, y en el informe final de cierre de sesion tambien seria bueno, en el momento en que el lead tiene que comenzar a borrar worktres tmp y pushear».
5. «sesioens bifurcadas? no se aqui te dejo escoger lo mejor».
6. «comienza a trbajar en esto pero hay mas sesiones trbajando entocnes haz lo encesario para no chocar. Diseña, implementa de manera autonoma no estare disponible».

## 2. La intención, en una frase

Que el dueño pueda ver **cuánto ha gastado una sesión de Aether en total, en dólares a precio de lista, desde que empezó, aunque haya tenido varios swarms, diseños y delegaciones, y aunque se cierre y se reanude después**, con un comando al estilo de `/harnesses` y con la misma cifra en el informe final, justo antes de que el Lead borre worktrees y temporales y suba.

## 3. Lo que ya se supuso (los puntos que el dueño dejó pasar)

- **S1. Sesiones bifurcadas (elección del Lead).** Cada id de sesión es una sesión. `/resume` y `/compact` conservan el id y suman solos; un `--fork-session` o un `/clear` es una sesión nueva y **no se enlaza** a la anterior, porque Claude Code no le da al hook un id padre y inventar el enlace daría cifras dudosas.
- **S2.** Los dólares son los **del precio de lista** de `config/prices.json`, para los tokens de Claude, y los que el informe ya calcula para las llamadas a otros harness. Una petición de un modelo sin precio se lista como **sin precio**, nunca como cero. No es lo que cobra una suscripción.
- **S3.** Solo se mide una **sesión de Aether**; en una sesión normal el plugin no registra nada y no cambia (la huella dormida es una invariante).
- **S4.** La orden es una opción nueva de `aether-report` (no un bin nuevo) y el comando del mod se llama `/spend` (no `/cost`, que es de Claude Code).
- **S5.** «Reanudaciones» se cuenta por los huecos de más de una hora entre dos peticiones de la misma sesión; es una cifra aproximada y así se rotula.
- **S6.** Esta corrida trabaja en su propia rama y su propio worktree, fuera de las otras sesiones, y no sube nada ni se funde en `main` sin el sí del dueño.

## 4. Lo que se midió (2026-10-22, en el código y en los datos reales)

- **El medidor ya guarda el gasto por id de sesión y suma al reanudar.** `hooks/register.js` escribe cada petición al modelo de una sesión de Aether en `<datos>/usage/<sesión>/<n>.json` (hasta 1000 entradas por parte) y un módulo recargado empieza después de las partes que hay en disco. La sesión `252123d1` tiene partes 0 a 2 del 21 y 22 de octubre y la parte 3 empieza a las 08:43 del 22, cinco horas después de la última petición y con otra versión de Claude Code (2.1.306 a 2.1.308); la `010621c2` hizo lo mismo. Los agentes de todos los swarms, diseños y delegaciones de una sesión están en las mismas entradas (`agent` los nombra).
- **El medidor no cuenta dos veces.** En la `010621c2`, contra su transcript y los de sus subagentes: 647 entradas del medidor frente a 643 mensajes distintos, y 1,605,187 tokens de salida frente a 1,601,901 (0.3 %). El «1.8 veces» de `docs/guide/router.md` venía de contar líneas del transcript, que repiten un mensaje.
- **El registro de lanes ya trae el id de sesión** en cada llamada (`lanes/<sesión>.jsonl`, campo `session`), así que las llamadas a otros harness se pueden unir a la sesión.
- **Nada suma una sesión.** `aether-report` informa de una corrida (`--run`), de los asientos del diseño (`--seats`) y de las delegaciones (`--delegates`). La guía de autonomía dice que los turnos del Lead no se suman.
- **La poda olvida.** `pruneUsage` (en `lib/report.js`) borra las partes de una sesión 30 días después de su última escritura; una sesión reanudada después de ese plazo pierde lo gastado.
- **Un cálculo suelto sobre las 37 sesiones del medidor, a precio de lista:** US$ 1,289 en total; el Lead US$ 520 y los agentes US$ 768; Sonnet US$ 863, Opus US$ 423, Haiku US$ 3. Las 11 sesiones de US$ 50 o más suman US$ 1,079. Sirve de cifra de control para la prueba real (C7).
- **El comando se hace como `/harnesses`:** `hooks/panel.jsx` registra el comando con `$.command.register`, abre un panel con `$.ui.open`, ejecuta los bins con `$.process.run` y no llama a ningún modelo ni escribe en la transcripción.
- **Otras sesiones trabajan a la vez** en este repositorio (cuatro Lead abiertos y un swarm con llamadas a Grok en `.aether/worktrees/`). El estado de la corrida autónoma está en el `.aether/` del checkout principal, que es compartido.

**Queda por medir (es trabajo de la spec y de la prueba):** cuánto pesa leer todas las partes de una sesión muy larga (la mayor tiene 3,005 peticiones en 4 partes) en un comando que dibuja un panel; y qué hace el panel cuando el id de la sesión actual aún no tiene partes escritas (el medidor vuelca cada 20 pasos).

## 5. Fuera de alcance

- El **porcentaje de cuota** por sesión: el dueño lo descartó, porque no se puede atribuir a una sesión cuando hay varias a la vez.
- **Enlazar** sesiones bifurcadas o limpiadas (S1).
- Medir las sesiones que no son de Aether.
- Presupuestos o topes de gasto por sesión: se anota como propuesta, no se trabaja.
- Cambiar qué modelo hace cada rol: es la conversación de fondo, y esta tarjeta solo le da el dato.

## 6. Criterios (qué y por qué, sin el cómo)

- **C1.** Una orden de `aether-report` da, para una sesión (por defecto la que escribió por última vez), el total en dólares a precio de lista de toda la sesión: lo del Lead, lo de los agentes, repartido por modelo y esfuerzo y por rol (el tipo de agente que el medidor guarda en cada petición, como `aether:judge` o `aether:implementer`); con la primera y la última petición y un número aproximado de reanudaciones. Por: «cuanto hemos estado gastando por sesion completa aunque haya varios swarms».
- **C2.** Las llamadas a otros harness de la sesión se suman a esa cifra, aparte, con sus llamadas y sus dólares a precio de lista. Por: lo mismo; sin ellas la cifra de una sesión con superdelegación quedaría corta.
- **C3.** Una sesión reanudada suma al total anterior, aunque se haya cerrado y haya pasado tiempo. Por: «si la decido recontinuar despues de cerrarla el gasto se sigue sumando».
- **C4.** La poda de los 30 días no olvida el gasto: una sesión podada conserva su total en un registro propio, y si se reanuda después, el total es lo archivado más lo nuevo. Por: lo mismo.
- **C5.** Dos sesiones que escriben o leen a la vez no se pisan ni se mezclan: la cifra de una cuenta solo las peticiones de su id, y ningún archivo compartido se corrompe por una escritura simultánea. Por: «hay mas sesiones trbajando entocnes haz lo necesario para no chocar» y «diferentes sesiones trabajando al mismo tiempo».
- **C6.** Un comando `/spend` de una sesión de Aether, al estilo de `/harnesses`, muestra esa cifra en un panel, sin llamar a un modelo ni escribir en la transcripción. En una sesión que no es de Aether no existe. Por: «un comando asi como harnesses» y la invariante de la huella dormida.
- **C7.** La cifra es la correcta: contra una sesión real conocida, el total de la orden coincide con el cálculo suelto del apartado 4 (la `010621c2` y la `252123d1` son las de control), y en las pruebas, con datos de un directorio desechable. No se gasta cuota para verificarlo. Por: «el dolar» como única manera de atribuir.
- **C8.** El informe final del Lead, justo antes de empezar a borrar worktrees y temporales y a subir, lleva la cifra de la sesión: el total, lo del Lead, lo de los agentes. La regla está en las instrucciones del Lead y en el formato del informe. Por: «en el informe final de cierre de sesion ... cuando el lead tiene que comenzar a borrar worktres tmp y pushear».
- **C9.** La documentación dice cómo se usa y las pruebas del repositorio pasan (`npm run check`). Por: la regla de «los docs se sostienen con pruebas» del repositorio.

## 7. Decisiones del Lead tras la primera vuelta del diseño (2026-10-22)

El primer diseño (`wf_51f96e77-46c`) terminó en `dispute`: tres rondas del Juez sobre el spec, de dos hallazgos mayores a uno mayor, y el spec había crecido a 18 requisitos y 13 escenarios. Lo que seguía abriendo huecos era la poda (los tramos archivados) y el reparto por clase de trabajo. El dueño no está; el Lead decide como su delegado, de forma reversible, y lo anota en el diario:

- **D-a. Un resumen se suma, no se reemplaza.** Si una sesión ya tiene un resumen de una poda anterior, la poda siguiente suma lo que archiva al resumen que ya hay (dólares y desgloses sumados; primera hora la menor, última la mayor) y nunca lo reescribe. La poda de las partes del medidor y la del registro de lanes corren por separado, y cada una archiva solo lo suyo. Viene del Juez, ronda 3: sin esto C4 se rompe en la segunda poda.
- **D-b. Las reanudaciones y las horas son informativas.** Son una cifra aproximada y se rotulan así. Tras una poda, las reanudaciones son las del resumen más los huecos de lo que sigue en disco, sin reglas de unión entre tramos. Ningún criterio depende de su valor exacto, y el dueño no pidió exactitud en ellas.
- **D-c. El reparto es por rol, no por clase de trabajo.** Ver C1. No se decide qué es swarm, diseño o delegación: el tipo de agente ya lo dice. Un `aether:reviewer` o un `aether:writer` que el Lead arranca fuera de un swarm aparece con su tipo y nada más; no hay regla de `spawn` ni cubo «sin asignar». Responde a la pregunta del Writer y al hallazgo menor de la ronda 3.
- **D-d. Las delegaciones del router cuentan.** El diario del router (`outcome`) es una fuente más de llamadas a otros harness, junto al registro de lanes. Un modelo cuyo nombre no coincide con la tabla de precios va a «sin precio» y se lista; no se cuenta como cero. Viene del Juez, ronda 1.
- **D-e. La comprobación real lee el directorio de datos del plugin instalado,** `~/.claude/plugins/data/aether-aether-plugin/`, nombrado de forma explícita y no `aether-inline`. Si las dos sesiones de control ya no están en él, se dice con la prueba. Viene del Juez, ronda 1.
- **D-f. Tamaño.** El spec lleva solo lo que un criterio pide: nada de requisitos ni escenarios para casos que ningún criterio nombra. Cuando un caso límite no tiene una respuesta obvia, se anota en las suposiciones con la elección más simple y reversible, y no se convierte en un requisito más.
