# Diseño corto: un lanzamiento rechazado por tope o pausa no arranca ningún agente (#232 3)

- **Fecha:** 2026-11-12
- **Issue:** #232, hallazgo 3 (copia en `evidence/issue-232.md`; revisión en `evidence/triage-232-236.md`).
- **Palabras del dueño:** a la pregunta «un lanzamiento rechazado durante la pausa de cuota todavía arranca un Haiku que no hace nada. Si quieres evitarlo, es un cambio del mod con diseño aparte», respondió «si a todo esto» (sesión 75906934, 2026-11-13).
- **Base:** rama `fix/open-issues-8`, en `3ebe58a`.

## El problema

Cuando una corrida autónoma está detenida por tope de horas, por tope de costo o por pausa de cuota, `aether-delegate begin` rechaza la tarea delegada (`autonomy.launchRefusal`, en `plugins/aether/lib/delegate-task.js:602-603`). Hoy el rechazo es un plan (`autonomyRefusedPlan`, `delegate-task.js:350-353`) que reescribe la llamada a `Agent` hacia Haiku a esfuerzo `low` (`REFUSED_ARGS`, `delegate-task.js:47`), con un prompt que dice «Do not do any work. Tell the Lead why the launch was refused.».

Así arranca un agente de Claude que solo devuelve el motivo. Durante una pausa de cuota, eso gasta la cuota que la pausa quiere proteger, y además deja en el registro un lanzamiento que no hizo nada.

## Lo que el mod ya permite

El contrato de `toolCall` para `Agent` admite que el hook conteste sin llamar a `next`, con `{ deny: reason }`. En ese caso no arranca nada y el modelo ve el texto como el error de la herramienta (`AgentSpawnResult`, en los tipos que Claude Code genera para el mod: «Refuses the spawn, so nothing starts; the model sees the text as the Agent tool's error»). Hoy `hooks/delegate.mjs:256-260` solo propaga un `deny` que viene de `next`.

## El cambio

1. **`lib/delegate-task.js`:** `autonomyRefusedPlan` devuelve un plan con un campo nuevo, `deny`, que lleva el motivo para el Lead. Por ejemplo: `Aether delegate task <id> was not launched: <refusal.message>. Nothing was started.`
   - Conserva `stop` y `run`, como hoy.
   - No trae `args`, así que no hay reescritura.
   - **`notes`:** el texto del rechazo, que hoy va en `notes` (`delegate-task.js:328-329`, `351-352`), pasa a `deny` y deja de ir en `notes`; `notes` conserva solo lo que ya traía `ctx.notes` (por ejemplo el aviso del id nuevo). Con `deny` el mod no agrega contexto, así que repetir el texto en `notes` no llegaría a nadie.
   - **`refusedLaunchPlan` ya no sirve a este caso.** Hoy arma `args` con `REFUSED_ARGS`, y de ahí salen `requestedOf` y el `effort` de la línea del registro (`delegate-task.js:321-326`). Se extrae de él un ayudante que solo escribe la línea `launch` (`logRefusedLaunch(r, ctx, { effort, requested, ignored })`); `refusedLaunchPlan` lo llama con `effort: args.effort` y el `requested`/`ignored` de `requestedOf`, como hoy, y `autonomyRefusedPlan` lo llama sin pasar por `refusedLaunchPlan`, y arma su plan sin `args`.
   - **La línea `launch` con `launchKind: 'refused'` se sigue escribiendo** en `delegates/log.jsonl`, porque la observación y los informes la leen. Sin `args`: `effort: null` (no arranca ningún modelo), `requested` es lo que la llamada pidió (`{ model, effort }` con lo que `event` trae, o `null` si no pidió nada) y `ignored: false`, porque no se lanzó nada que pudiera ignorarlo. Ningún lector se rompe con `effort: null`: `delegate-report.js:33` ya lo lee con `latest.effort ?? null`, `spend.js` lo lee con `|| null`, y los lectores de la observación (`observe-calibrate.js:17`, `observe-detect.js:201`) y de los informes (`delegate-log.js:140`) apartan las líneas `refused` antes de mirar el esfuerzo. Los datos de prueba de `tests/delegate-report.test.js:105,112` que usan `effort: 'low'` no cambian.
2. **`hooks/delegate.mjs`:** en `toolCall`, la rama del `deny` va justo después de `if (plan === null) return next(e)` (`delegate.mjs:245`) y antes de `rewriteOf` y `remember`. Cuando `plan.deny` es un texto no vacío, el hook devuelve `{ deny: plan.deny }` sin llamar a `next`, sin reescribir y sin `remember`. Un `deny` que no es texto (vacío o de otro tipo) no activa la rama: sigue el camino de hoy. Nada arranca y no hay contexto que agregar. El mod sigue sin importar `lib/`: el `deny` le llega en el JSON de `begin`.
   - **Contrato de la plataforma, por comprobar.** Que `tool.call` admita un `{ deny }` devuelto sin llamar a `next` se tomó de los tipos que Claude Code genera para el mod (`AgentSpawnResult`: «Refuses the spawn, so nothing starts; the model sees the text as the Agent tool's error»). Esos tipos están en `.gitignore` y no hay copia en el árbol, y `delegate.mjs:256-260` solo prueba que `next` puede devolver `deny`. Antes de apoyarse en él, la tarea lo confirma con un `claude plugin test` real (la prueba de abajo, con la instalada, Claude Code 2.1.296): que `toolCall` devuelva `{ deny }` sin llamar a `next` es aceptado y no arranca ningún agente. Si no lo acepta, se detiene y se lo dice al Lead, y no se cambia el diseño a mano.
3. **Sin cambio en los otros rechazos.** Las tareas ya aprobadas o agotadas (`refusedPlan`) y los rechazos por `AETHER-SKILLS` o `AETHER-TREE` siguen como hoy. El dueño preguntó por el tope y la pausa, y esos otros rechazos le dan al Lead un texto que lo guía para la siguiente llamada.
4. **Otros que llaman a `launchRefusal`.** `lib/seat-calls.js:107` (los asientos del diseño) y `lib/plan-compile.js:319` (`aether-plan compile`) no pasan por una llamada a `Agent` del Lead ni reescriben nada hacia Haiku: devuelven su propio error. Quedan fuera a propósito.
5. **Documentación:** ningún documento describe la reescritura hacia Haiku del lanzamiento rechazado: `docs/guide/autonomy.md:23`, `docs/reference/components.md` y la skill `autonomous-runs` (línea 35) solo dicen que se «rechaza empezar trabajo nuevo», y eso sigue siendo cierto. No cambia ningún documento. Si al construir aparece una frase que sí describa la reescritura, se corrige solo esa.

## Riesgos

- **El Lead ve un error de la herramienta y no un resultado de agente.** Las reglas ya dicen qué hacer cuando un lanzamiento se rechaza por tope: no empezar nada nuevo («Ceilings» de `aether:autonomous-runs`). El texto del `deny` nombra la corrida y la causa, así que el Lead sabe por qué.
- **Fallo del mod.** Si `begin` falla o devuelve algo ilegible, el mod deja la llamada como está (`plan === null → next(e)`). Ese comportamiento a prueba de fallos no cambia.
- **La observación** cuenta los lanzamientos `refused` por su línea del registro, y esa línea sigue escribiéndose (con `effort: null`, arriba).
- **Un `deny` del mod puede contar como falla de herramienta.** `observe-hook.js:14` atiende `PostToolUseFailure` y `observe-read.js:174` convierte cualquier falla repetida de una herramienta en un hallazgo `tool-failures:<herramienta>`; `config/observe.json` no fija umbral para eso. No se sabe si Claude Code dispara `PostToolUseFailure` por un `deny` del mod. La tarea lo comprueba en la misma prueba real que el contrato de arriba. Si lo dispara, varias negativas de una corrida en pausa pueden dar un hallazgo `tool-failures:Agent` de fricción; no se cambia la observación en esta tarea, se lo dice al Lead con la evidencia para que decida (un cambio ahí es otra decisión del dueño).

## Pruebas

- `tests/delegate-task.test.js` (lib), el bloque de `:657-700`, es una prueba que la tarea edita: las tres afirmaciones `byTime.notes.join('\n')` (`:662`), `byQuota.notes…` (`:685`) y `byCost.notes…` (`:700`) pasan a leer `plan.deny` (el texto con `aether-autonomy end --outcome ceiling|incomplete` ahora vive ahí). Para cada una de `time`, `quota` y `cost`, `begin` devuelve un plan con `deny` de texto, `stop` y `run`, `args === null` (sin reescritura), y la línea `launchKind: 'refused'` en el registro con `effort: null` e `ignored: false`. Las tareas aprobadas o agotadas, y los rechazos por `AETHER-SKILLS` y `AETHER-TREE`, siguen devolviendo su plan de Haiku, sin `deny`.
- `plugins/aether/hooks/delegate.test.ts` (mod, con `claude plugin test`; el stub de `tool.call` de `:61-64` registra `toolCalls`): con un plan que trae `deny` de texto, `toolCall` devuelve exactamente `{ deny: <texto> }` y `toolCalls.length === 0`. Con un `deny` que no es texto (vacío o no cadena), o sin `deny`, todo sigue como hoy: se reescribe, se llama a `next` y se recuerda la llamada.
- `npm run check` pasa.

## Fuera

- Cambiar los otros rechazos.
- Cambiar los topes, la pausa o el freno de cuota.
- Cualquier llamada de pago.
