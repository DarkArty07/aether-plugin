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

## Cierre: R21, C13 y R23

**Hecho:** 2026-10-22, por el Lead, en la corrida autónoma `auto-20261022-142451-4317`.

### Las otras sesiones y el plugin instalado (R21, C13)

| | Al empezar (2026-10-22, 19:30 UTC) | Al terminar |
|---|---|---|
| Checkout principal | limpio, en `main` (`db0cc63`) | limpio, en `main` (`f92f845`): otra sesión fundió ahí `fix/quick-issues` (issues 72, 76, 77 y 79) mientras esta corría; esta corrida no tocó el checkout principal |
| Worktrees de otras sesiones | `quick-fixes` (`fix/quick-issues`), `landing-clawd`, `onboard-skill`, dos worktrees de unidad de otra sesión en `.aether/worktrees/` y uno bloqueado en `.claude/worktrees/` | `landing-clawd` (`40484aa`) y `onboard-skill` (`04bd6f7`) limpios; los demás ya no aparecen en `git worktree list` (los quitó la otra sesión, no esta corrida) |
| Plugin instalado | 0.18.0 | 0.18.0: esta corrida no corrió `claude plugin update` |
| Este trabajo | la rama `feat/delegate-ladder`, su worktree `.worktrees/delegate-ladder` | 55 commits en `git log main..feat/delegate-ladder`; nada fuera de esa rama |

Esta corrida no leyó ni escribió el estado de otra sesión (`.aether/pending.jsonl`, sus registros, sus worktrees).

**El solapamiento con `fix/quick-issues` (R21):** la rama ya había entrado en `main`, así que `main` se fundió dentro de `feat/delegate-ladder` (commit `2c22b41`). Un solo conflicto, en la fila de SessionStart de `docs/reference/components.md`, resuelto uniendo la lista de opciones de esta rama con la descripción nueva de `main`; el merge dejó rota una prueba de `tests/spend-docs.test.js`, que nombraba la guía del router, y se corrigió (`d2e46ce`). Tras el merge: `npm run check` pasa (1828 pruebas, 104 del mod, validación del plugin y del marketplace) y el examen oculto da 18 de 18.

### La sesión real de C12 (R23): pendiente

Gasta cuota de otros planes (`paid-call`) y no hay un permiso registrado, así que no se hizo. Lo que ya se midió es la espera de 18 minutos, la barra de agentes, `isolation` y la respuesta final de un agente en Claude (arriba). Lo que la sesión real comprueba, y nada más lo prueba:

1. un delegado que edita, lanzado con `Agent`, corre en otro harness con `aether-lane delegate` y la barra de agentes lo muestra mientras trabaja;
2. cuando el delegado externo falla, el modelo contesta después de los latidos (R14);
3. lo mismo con una llamada `Agent` en primer plano, no solo en segundo plano.

Comando exacto (en una terminal tuya; usa tus opciones de plugin `superdelegation` y `harnesses`, y un harness con cuota):

```
cd $(mktemp -d) && git init -q -b main && git commit -q --allow-empty -m init && /home/darkarty/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin/scripts/aether-lead --plugin-dir /home/darkarty/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin/.worktrees/delegate-ladder/plugins/aether
```

En esa sesión se pide una tarea de delegado con un brief que lleve las líneas `AETHER-TASK: t1`, `AETHER-OWNS: <un archivo>` y `AETHER-TESTS: <un comando>`, y se mira la barra de agentes mientras corre; después se anota aquí con la hora y se cierra el issue 74.

### Los issues (R23)

Siguen abiertos, porque su arreglo está en una rama que aún no está en `main`: el 51 (el decisor y la regla de subir un modelo ya no existen) y el 74 (espera, además, la sesión real de arriba). Comandos, para cuando se funda: `gh issue close 51 --comment "Fixed by spec 013 (A85): the decider is gone and the ladder holds the climb."` y `gh issue close 74 --comment "Fixed by spec 013 (A86), evidence in docs/evidence/013-delegate-ladder.md."`.
