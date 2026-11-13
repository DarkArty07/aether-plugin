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
   - La línea `launch` con `launchKind: 'refused'` se sigue escribiendo en `delegates/log.jsonl`, porque la observación y los informes la leen. El `effort` de esa línea pasa a ser `null`, ya que no arranca ningún modelo.
2. **`hooks/delegate.mjs`:** en `toolCall`, cuando el plan trae un `deny` de texto, el hook devuelve `{ deny: plan.deny }` sin llamar a `next` y sin `remember`. Nada arranca y no hay contexto que agregar. El mod sigue sin importar `lib/`: el `deny` le llega en el JSON de `begin`.
3. **Sin cambio en los otros rechazos.** Las tareas ya aprobadas o agotadas (`refusedPlan`) y los rechazos por `AETHER-SKILLS` o `AETHER-TREE` siguen como hoy. El dueño preguntó por el tope y la pausa, y esos otros rechazos le dan al Lead un texto que lo guía para la siguiente llamada.
4. **Documentación:** se actualiza la frase que describe el rechazo en `docs/guide/delegates.md` (o donde la guía lo cuente) y en `docs/reference/components.md`, si lo nombran.

## Riesgos

- **El Lead ve un error de la herramienta y no un resultado de agente.** Las reglas ya dicen qué hacer cuando un lanzamiento se rechaza por tope: no empezar nada nuevo («Ceilings» de `aether:autonomous-runs`). El texto del `deny` nombra la corrida y la causa, así que el Lead sabe por qué.
- **Fallo del mod.** Si `begin` falla o devuelve algo ilegible, el mod deja la llamada como está (`plan === null → next(e)`). Ese comportamiento a prueba de fallos no cambia.
- **La observación** cuenta los lanzamientos `refused` por su línea del registro, y esa línea sigue igual.

## Pruebas

- `tests/` (lib): ante una corrida detenida por `time`, `cost` o `quota`, `begin` devuelve un plan con `deny`, sin `args` ni reescritura, y con la línea `refused` en el registro. Las tareas aprobadas o agotadas siguen devolviendo su plan de Haiku.
- `plugins/aether/hooks/delegate.test.ts` (mod, con `claude plugin test`): con un plan que trae `deny`, `toolCall` devuelve `{ deny }` y no llama a `next`. Con un plan sin `deny`, todo sigue como hoy.
- `npm run check` pasa.

## Fuera

- Cambiar los otros rechazos.
- Cambiar los topes, la pausa o el freno de cuota.
- Cualquier llamada de pago.
