---
title: Qué agrega Aether
description: Todo lo que el plugin Aether agrega a tu Claude Code, punto por punto y agrupado por uso, con una hoja de atajos «quiero esto, haz esto»
order: 209
---

# Qué agrega Aether

Esta página es para quien ya instaló Aether. Enumera, punto por punto, lo que el plugin agrega a tu Claude Code, agrupado por uso, y termina con una hoja de atajos. Cada elemento dice qué es, para qué sirve y cómo se usa. El inventario de cada archivo está en [Components](../reference/components.md) (en inglés) y la instalación, en la guía [Instalar y arrancar](guias/instalar-y-arrancar.md). This page is also available in English: [What Aether adds](../what-aether-adds.md).

## Comandos que escribes

- `/aether:setup`: la configuración guiada. Córrela una vez después de instalar: revisa tu máquina, pregunta solo lo que no puede detectar (cómo maneja `aeth` los permisos y, si encuentra otros harnesses instalados, si les manda trabajo), guarda tus opciones, instala `aeth` y termina en una pantalla que dice qué escribir. Córrela otra vez para cambiar lo que elegiste.
- `/aether:doctor`: una revisión de solo lectura de la instalación (Claude Code, Node, git, el comando `aeth`, los workflows, los harnesses). Escríbela cuando algo falle: muestra qué revisó, qué falló y el arreglo exacto, y no cambia nada.
- `/aether:help [tema]`: un mapa de lo que agrega Aether, organizado por lo que quieres hacer, con el comando de cada cosa y la guía que leer. `/aether:help spend` responde un tema.
- `/aether:onboard [tema]`: haz que el Lead entienda el proyecto antes de pedirle nada. Solo lee (el README, `CLAUDE.md`, git, el handoff más reciente, la feature abierta) y termina con un brief de 5 a 8 líneas.
- `/aether:design`: el workflow de diseño. Convierte la tarjeta de intención del Lead en una spec, un plan y unas tareas aprobados, más un examen oculto, y termina en un solo resultado: `approved`, `clarify`, `dispute` o `failed`. El Lead lo lanza por ti; necesita la herramienta Workflow de Claude Code.
- `/aether:run`: el workflow del enjambre. Construye un plan aprobado en oleadas paralelas, con una cola de merges y una revisión final. El Lead lo lanza cuando el plan tiene tres tareas o más.
- `/aether:specify`: el comando de Spec Kit, adaptado: escribe `spec.md` desde la intención que confirmaste.
- `/aether:plan`: escribe `plan.md` para una spec aprobada.
- `/aether:tasks`: escribe `tasks.md` para un plan aprobado, con los campos desde los que construye el enjambre.
- `/aether:constitution`: crea o actualiza los principios que sigue toda spec, plan y tarea. El Lead y el Writer usan normalmente estos cuatro a través del diseño; escribe uno para redactar ese documento a mano.
- `/harnesses`: un panel de solo lectura con los ajustes de delegación y la cuota de cada harness. `r` renueva las lecturas; `Esc` o `x` lo cierra. No llama a ningún modelo (mira [el panel](../guide/lanes.md#the-harnesses-panel), en inglés).
- `/spend`: un panel de solo lectura con el gasto a precio de lista de esta sesión, por modelo, esfuerzo y rol, más las llamadas a otros harnesses (mira [el panel](../guide/lanes.md#the-spend-panel), en inglés). `/harnesses` y `/spend` existen solo en una sesión de Aether.

## El comando corto, `aeth`

- `aeth`: arranca el modo Aether en la carpeta donde estás: el Lead, con esfuerzo `xhigh`, el tema de Aether y el modo de permisos que elegiste en `/aether:setup`. El Lead abre con una línea de bienvenida que nombra `/aether:help`. Es un comando pequeño que `/aether:setup` deja en una carpeta de tu `PATH`, con el nombre que elijas, y nunca reemplaza un archivo que no sea suyo.
- `aeth -c`: continúa la última conversación. `aeth --resume` te deja elegir una más vieja.
- `aeth -p "<tarea>"`: corre una tarea y muestra el resultado, sin pantalla.
- La forma larga, `claude --agent aether:lead --effort xhigh`, arranca el mismo Lead sin configuración y sin los extras del lanzador, así que rige el modo de permisos propio de Claude Code. Úsala para que te pregunte antes de cada herramienta, o antes de correr `/aether:setup`.

## Los agentes

Quién hace qué en el modo Aether ([Components](../reference/components.md) trae los modelos y esfuerzos, en inglés):
- `aether:lead`: el Lead, la sesión principal con la que hablas. No es un subagente. Escribe la tarjeta de intención, lanza el diseño, elige cómo construir, juzga los resultados y escribe el brief.
- `aether:writer`: escribe la spec desde la tarjeta de intención, y el plan y las tareas desde la spec aprobada.
- `aether:judge`: lee una spec, un plan o unas tareas y dictamina `approve`, `revise` o `reject`; lo que va más allá de tu intención cuenta como defecto. Solo lectura.
- `aether:examiner`: escribe el examen de aceptación oculto de una spec y un plan aprobados.
- `aether:implementer`: construye una tarea del plan en su propio worktree, primero la prueba. Empieza en Haiku y sube solo cuando debe.
- `aether:supervisor`: revisa cada intento de un implementer y dictamina `approve`, `retry`, `escalate` o `block`. Solo lectura.
- `aether:reviewer`: revisa todo lo que fusionó una corrida del enjambre, como un solo cambio, contra el plan y la spec. Solo lectura.
- `aether:ops`: corre un comando de `aether-wt` o `aether-lane` y devuelve su salida. Con la opción `ops` encendida, el mod responde esos comandos por sí mismo, sin modelo.

## Lo que te protege

- `aether-guard`: un hook que actúa solo en una sesión de Aether. Deja las specs, los planes, las tareas y la constitución escribibles solo para el Lead y el Writer, y al Examiner dentro de `.aether-exam/`. Antes de cada comando de Bash reconoce las clases irreversibles (`push`, `merge-main`, `publish`, `deploy`, `delete`, `credentials`): sin un permiso tuyo registra el comando en tu lista, `.aether/pending.jsonl`, y el lanzador hace que lo rechace. En cualquier otra sesión lo permite todo.
- «Espera tu sí»: la primera lista de cada brief: lo que solo tú puedes decidir y las acciones irreversibles que nadie autorizó, cada una con por qué, qué pasa si dices que no, cómo se revierte y el comando exacto. Contestas con palabras normales; un «sí» general también registra un permiso permanente (mira [Autonomy](../guide/autonomy.md), en inglés).
- El examen oculto: el Examiner lo escribe cuando el diseño queda aprobado y lo guarda fuera del repositorio. El enjambre nunca lo ve, así que un error que las pruebas del enjambre comparten con su código no se le escapa.
- El freno de cuota: cerca del límite de la ventana de cinco horas de tu cuenta, te avisa una vez, y en una corrida autónoma se detiene en orden, guarda el trabajo y sigue solo cuando la ventana se reinicia.

## Las opciones

Ocho opciones, que se fijan al instalar o después en `/plugin` → Installed → aether → Configure options. La tabla única, con cómo fijar cada una, es [Options](../guide/options.md#options) (en inglés). En resumen:
- `superdelegation`, apagada por defecto: manda el trabajo que no es del Lead a otros harnesses de programación mientras dure su cuota.
- `harnesses`, `agy` por defecto: qué harnesses puede usar (`agy`, `codex`, `grok`, `cursor`, `muse`).
- `ops`, encendida por defecto: deja que el mod corra sin modelo los comandos `aether-wt` y `aether-lane` del propio enjambre.
- `deadlines`, `quota=3` por defecto: cuántos segundos espera una tarea delegada la decisión de cuota.
- `quotabrake`, `95` por defecto: el porcentaje de la ventana de cinco horas en que actúa el freno.
- `brakepush`, apagada por defecto: además sube las ramas de unidad que guardó un workflow interrumpido, cuando tu permiso de `push` registrado lo cubre.
- `observedev`, apagada por defecto: el modo de desarrollo de la autoobservación, que guarda fragmentos de conversación con los secretos borrados.
- `autoissue`, apagada por defecto: solo en el modo de desarrollo, abre un issue en el repositorio del propio plugin por cada falla encontrada.

## Comandos para la terminal o para el Lead

Están en el `PATH` de la herramienta Bash en una sesión con el plugin, así que el Lead los corre por ti; desde una shell fuera de una sesión, corre el archivo por su ruta (mira [Getting started](../getting-started.md), en inglés).
- `aether-doctor`: la revisión que corre `/aether:doctor`; imprime un objeto JSON y sale con 1 cuando una revisión es un error.
- `aether-report --spend`: el gasto a precio de lista de una sesión, en dólares; la misma cifra que `/spend`.
- `aether-plan check`: revisa el `tasks.md` de un plan e imprime sus oleadas; dice qué arreglar cuando el plan no es sólido.
- `aether-autonomy status`: el estado de la corrida autónoma que está abierta, con sus topes.

## Lo que Aether no hace

- El `claude` simple sigue siendo el modo normal. El plugin está dormido ahí: sus hooks no hacen nada, no se registra nada, y `/harnesses`, `/spend` y los agentes no se ofrecen (la huella medida está en [Components](../reference/components.md#what-aether-adds-to-a-normal-session)).
- Nada sale de tu máquina, salvo los issues automáticos del modo de desarrollo, con `autoissue` encendida, que van al repositorio del propio plugin y nunca llevan texto de la conversación (mira [Self-observation](../guide/observe.md#what-never-leaves-your-machine)).
- `/aether:setup` no edita ningún archivo de shell y no reemplaza un archivo que no sea suyo.
- No hace push, no fusiona a `main`, no publica ni despliega sin tu sí o sin un permiso permanente que tú diste.

## Hoja de atajos: quiero… → haz esto

| Quiero… | Haz esto |
|---|---|
| Arrancar Aether en mi proyecto | Abre una terminal en la carpeta del proyecto y escribe `aeth` ([guía](guias/instalar-y-arrancar.md)) |
| Continuar la conversación de ayer | `aeth -c`; para elegir una más vieja, `aeth --resume` |
| Correr una tarea y ver la respuesta en la terminal | `aeth -p "<tarea>"` |
| Arrancar sin el comando corto | `claude --agent aether:lead --effort xhigh` |
| Saber por qué algo falla | `/aether:doctor` |
| Cambiar mis permisos, mis harnesses o el nombre del comando | Corre `/aether:setup` otra vez |
| Ver qué puede hacer Aether | `/aether:help`; agrega un tema, como en `/aether:help spend` |
| Que el Lead conozca primero el proyecto | `/aether:onboard` |
| Pedir un primer trabajo | Díselo al Lead con tus palabras ([guía](guias/primera-peticion.md)) |
| Que se construya una feature completa | Di lo que quieres y contesta sus preguntas; diseña, construye y reporta ([guía](guias/feature-completa.md)) |
| Que trabaje durante horas | Di «trabaja autónomamente» o «trabaja por horas» ([guía](guias/trabajar-horas.md)) |
| Saber qué necesita mi decisión | Lee primero «Espera tu sí» en el brief ([guía](guias/leer-el-brief.md)) |
| Mandar trabajo a Codex u otro harness | Corre `/aether:setup` otra vez y elígelo ([guía](guias/otros-harnesses.md)) |
| Ver cuánto he gastado | `/spend` en la sesión, o `aether-report --spend` ([guía](guias/ver-el-gasto.md)) |
| Ver la cuota de mis otros harnesses | `/harnesses` |
| Actualizar Aether | `claude plugin update aether@aether-plugin` y abre una sesión nueva ([guía](guias/actualizar-y-desinstalar.md)) |
| Desinstalar Aether | `claude plugin uninstall aether@aether-plugin`; agrega `--keep-data` para conservar sus datos ([guía](guias/actualizar-y-desinstalar.md)) |
| Trabajar en Claude Code normal | Escribe `claude`: Aether queda dormido |
