# Evidence of spec 013, the delegate ladder

## Prueba de espera, R20 (Task 17)

**Hecha:** 2026-10-22, por el Lead, en una sesión interactiva de Claude Code 2.1.308 (Sonnet 5.5, abierta en una terminal de Orca) con una copia desechable del plugin (`.aether/spike-wait/`, git-ignorada) donde `hooks/router.mjs` era un mod mínimo y `bin/aether-delegate` un delegado simulado que dura 18 minutos (dos esperas de 540 s y la tercera responde `SPIKE-OK`). No gastó cuota de otro plan: solo Claude (el Lead de la sesión de prueba y un agente de Haiku que el mod contestó sin modelo).

### Medida 1: la espera de 18 minutos sin latido

El primer paso del agente corrió `aether-delegate start` y el bucle de espera de la Task 1 (`waitForDelegate`), sin emitir nada entre esperas.

| Comprobación | Resultado | Cómo se vio |
|---|---|---|
| a. el primer paso sobrevive 18 minutos y responde `SPIKE-OK` | **falla** | A los 600 s exactos del primer paso (21:35:29 a 21:45:29 UTC) el motor mató al agente: «Agent stalled: no progress for 600s (stream watchdog did not recover)». La primera espera de 540 s terminó bien (21:44:29); la segunda empezó y quedó cortada. |
| b. el agente aparece activo en la lista hasta que termina | cumple | Diez lecturas de la barra de agentes, una por minuto, mostraron «◯ general-purpose …» con el tiempo corriendo, hasta que el motor lo mató. |
| c. ninguna petición de modelo del agente | cumple | El uso de la sesión no trae una entrada con el id del agente de espera. |
| d. el `isolation: 'worktree'` que puso el mod llegó | cumple | Existió `.claude/worktrees/agent-a642f9c7244ecf4c9` en el repositorio de prueba mientras corría, y desapareció al morir el agente. |
| e. el `step` del mod ve la respuesta final de un agente en Claude | cumple | `seen.json` del agente `SPIKE-ANSWER` (sin mod de espera): un paso con `stopReason: end_turn` y `answer: SPIKE-ANSWER-OK`. |

### Medida 2: la misma espera, con un latido tras cada espera

El primer paso emite un evento `{ kind: 'text', index: 0, text: '.' }` después de cada `wait` que no terminó (21:57:58 y 22:06:58 UTC), y entrega `SPIKE-OK` al final.

| Comprobación | Resultado | Cómo se vio |
|---|---|---|
| a. el primer paso sobrevive 18 minutos y responde `SPIKE-OK` | **cumple** | El agente vivió 18 min 1 s (21:48:58 a 22:07:00 UTC) y el Lead recibió su respuesta: «..SPIKE-OK». Los dos latidos quedan al principio de la respuesta. |
| b. el agente aparece activo en la lista hasta que termina | cumple | Diecinueve lecturas, una por minuto: activo en todas, con el tiempo corriendo, hasta que terminó. |
| c. ninguna petición de modelo del agente | cumple | Ninguna entrada del uso de la sesión con el id del agente. |
| d. el `isolation: 'worktree'` llegó | cumple | Existió `.claude/worktrees/agent-a7f58e602dedfecd9` en las lecturas mientras corría. |

### Decisión

El bucle del mod se queda (S1), con un latido. El motor mata un agente cuyo paso no emite nada en 600 s; un evento de texto cuenta como progreso. Cada espera dura 540 s, menos que el límite, así que un latido después de cada espera que no terminó basta. El respaldo (un agente de Haiku con solo Bash) no se construye.

Cambios que esta medida impone:

- `hooks/delegate-wait.mjs` (Task 1, ya fundida) agrega `waitSteps` (entrega `{ beat: true, waitedMs }` tras cada espera que no terminó), `heartbeatText` y `STALL_MS`; `waitForDelegate` sigue igual. Commit `a993273`.
- La Task 11 emite el latido en el paso del agente (`heartbeatText(waitedMs)` como evento de texto) y espera que la respuesta empiece con esos latidos. Se cambió su brief y su prueba en `tasks.md`, y `plan.md` (Design 7, S1 y el riesgo del primer paso).
- El latido no puede ser un punto: se escribe como `[Aether: the delegate is still working, N min so far]`, para que el Lead lo lea como el estado del delegado y no como ruido.

### Lo que no se midió

- Cuánto tarda el motor en cortar un paso sin eventos en otras versiones de Claude Code: la medida es de la 2.1.308.
- Si el texto de los latidos entra al contexto del Lead de la misma manera cuando el agente no corre en segundo plano (la prueba usó `run_in_background: true`).
- La respuesta de un agente en Claude en un paso con herramientas (el agente de la prueba respondió en un solo paso).
