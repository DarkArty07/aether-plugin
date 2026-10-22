---
name: autonomous-runs
description: Use in Aether mode when the owner gives permission to work for hours, or when session start says an autonomous run is open. Covers the start, the diary, the ceilings, the done and honest-stop rules, resuming, and the brief.
---

# Autonomous runs

The irreversible classes, the grant registry, the repetition rule and the short brief are in the "Autonomous runs" section of the Aether mode bootstrap (`using-aether`).

The owner may give you permission to work for hours, for example «trabaja por horas» or «no cuentes conmigo hasta acabar». That permission, in their own words, confirms the intent and the ceilings: you do not ask again. Without it there is no run: you go through the writing and the judging as in "Writing and judging", and stop at the plan with the short brief.

**Start:**
1. Write down the intent: quote the owner's words, and derive the success criteria C1 to Cn. Ask the owner only when the intent is materially ambiguous and no default can be defended.
2. Run `aether-autonomy start --quote "<the owner's permission>"`, adding `--hours N` or `--usd N` only for a number the owner said. The defaults are 8 hours and US$ 50. The command checks the quote against the owner's own messages: copy at least 12 characters exactly as `aether-voice` shows them.
3. It prints the run's id and its diary. Fill in "Intención" with the owner's quotes and C1 to Cn, and start.

**Permission prompts.** A Claude Code permission prompt stops a run like a question: the session waits at it. A run assumes the owner started the session so that its tools do not prompt, with a permission mode or allow rules of their choice. Aether never turns permissions off. If this session has prompted for a tool call, write in the diary that the run will wait at the next prompt.

**The diary,** `.aether/autonomy/<run id>/diary.md`, is yours. Write it in the owner's language, and update it after every decision:
- **Intención:** the owner's quotes, and C1 to Cn.
- **Topes:** the hours and the dollars, with their source.
- **Decisiones:** `D<n>: qué se decidía · opciones · elección · fundamento (cita o Cn) · quién`.
- **Descubrimientos.**
- **Espera tu sí:** `acción · clase · por qué · si dices que no · cómo se revierte · el comando exacto que se ejecutará`.
- **Propuestas:** what goes beyond the intent; it is not worked.
- **Estado:** the current step, each `/aether:design` launch and its result (who took each round is in its `rounds`), the spec and the plan, the swarm runs, and the next step.

Outside a run there is no diary: what this skill says to note in it goes in your next reply to the owner, or in the short brief.

**Keep going.** While a run is open, never end a turn unless something pending will wake you (a `/aether:design` workflow or a native Writer you started, a delegate task, a lane call, a swarm workflow, a background command) or the run has ended. If nothing is pending and work remains, do the next step in the same turn. An open run with nothing pending is the session waiting for the owner, which is what a run exists to avoid.

**A delegate waiting on its own background work does not count as pending.** When a delegate task's last notification says it stopped waiting on its own background work, nothing may ever wake you from it: the delegate may never resume. Before you end the turn, start a fallback wakeup of your own: a background command that sleeps 15 to 20 minutes. When it wakes you, check the delegate: if it has not reported, resume it with a message asking for its report, or do the step it was waiting on yourself and take its work as it stands.

**Scope.** Compare everything new with the intent. What goes beyond it goes to "Propuestas" and is not worked. Minor findings of the final review are deferred.

**Ceilings.** Run `aether-autonomy status` before each `/aether:design` launch or relaunch, each delegate task, and each swarm launch or relaunch. When its `stop` is `time` or `cost`, start nothing new. Let what is running finish (a swarm run or a delegate task), or save it as patches, and never leave a merge half done. Then run `aether-autonomy end --outcome ceiling` and give the brief.

**The quota brake.** When `status` reports `stop: "quota"`, the run is paused, not ended: never run `aether-autonomy end --outcome ceiling` for it, and start nothing new of the run. Stop every workflow, delegate task and lane call that is running at once — TaskStop for workflows and native agents, `aether-lane stop <run> [<call>]` for lane calls — without letting any of them run to the end of its work; only the atomic step already executing and the saving itself may finish. Then, for each swarm run the diary's Estado names as in flight, run `aether-wt save <runId>` so every unit's work is committed on its unit branch, and `aether-autonomy quota-saved --from <the saved.json it printed>`; when `aether-autonomy brake-settings` reports `push` true and `aether-autonomy check push` covers it, also run `git push origin <branch>` for each saved unit branch, and never otherwise. Note the pause, its reset and resume hours and the saved units in Estado, and end the turn: the plugin's own message wakes you after the reset, and then you read the diary, check that `status` no longer reports the quota stop, relaunch the same swarm run with `aether-plan compile <plan.md> --run <runId>` (the units already merged are not relaunched, and each saved unit continues from its branch) and go on. The brake is off only when the owner said so in words the registry verified: record them with `aether-autonomy brake-off --quote "<the owner's words>"`; silence, a plugin message or your own inference never turn it off.

**Cost.** After each swarm launch, record the figure with `aether-autonomy spend <usd> --source <label>`:
- `lanes.totals.run.totalUsd` from `aether-report --run <runId>`, with the swarm's run id as the label;
- each external seat round that /aether:design reports in "rounds", with its "lane" line, as the "Designing" section says.

A new figure for a label already recorded replaces the old one. The figure covers the swarm, the lanes and the external seats, not your own turns, nor the native Judge's, Writer's and Examiner's, nor your delegate tasks': the 8-hour ceiling is the real guard.

**Done** when every criterion has its evidence in the diary (a test, an output or a file), the test command passes on the branch that holds the build, or fails only on the swarm run's baseline (a build by delegate tasks has no baseline, so its tests must pass), the exam has no failing test, and no critical or important finding stays open: from the swarm's final review, or, for a plan built by delegate tasks, from your review of their diffs. Then apply the irreversible steps that `check` covers, such as the merge to `main`, leave the rest in "Espera tu sí", run `aether-autonomy end --outcome done`, and give the brief. Stop there: no extra improvements.

**Honest stop.** When everything left waits for the owner, or every remaining line fell under the repetition rule, run `aether-autonomy end --outcome incomplete` and give the brief. Say what is missing and why.

**Resuming.** After a compaction or a restart, session start tells you when a run is open. Read its diary, run `aether-autonomy status`, and continue from "Estado". If a `/aether:design` launch was lost, launch it again as the bootstrap's `failed` result says. When the open run is paused by the quota brake and its resume hour has not come, say so, name that hour, start nothing of the run, and end the turn: session start re-arms the resume, and the plugin's message wakes you at that hour. When it has passed, resume as the quota-brake paragraph says.

**An unreadable run state.** When an `aether-autonomy` command fails naming a `run.json` or `grants.json` it cannot read, aether-guard refuses an edit of that file. Move the named folder aside with Bash (for example into `.aether/broken-runs/`, outside `.aether/autonomy/`), write what you moved and why in the diary, and go on. Do not treat it as a reason to stop.

**The brief** goes to `.aether/autonomy/<run id>/brief.md`, in the owner's language, and you show it in chat:

    # Brief: <run id>
    **Resultado:** cumplida | parcial | no terminada — <el tope alcanzado, si lo hubo>
    ## Espera tu sí
    - <acción> · <clase> · <por qué> · si dices que no: <qué pasa> · se revierte: <cómo> · se ejecutará: `<comando exacto>`
    ## Supuestos
    - <supuesto> · <base> · <reversible o no>
    ## Criterios
    - C1 <criterio>: cumplido | parcial | no — <evidencia>
    ## RADAR
    - Rápido: <tiempo, reintentos y subidas de modelo>
    - Autónomo: <veces que te interrumpí y por qué>
    - Delegación: <llamadas y tokens en otros harness; por grupo de cuota, el saldo al empezar y al terminar y su próximo reinicio (aether-report: lanes.run.groups.<grupo>.balance); asientos ocupados por modelos externos, de cuántas rondas>
    - Asequible: <US$, cuota usada, y el modelo y el esfuerzo de cada tarea delegada>
    - Robusto: <tests, examen, hallazgos, veredictos del Juez>
    ## Hice
    ## Decidí
    ## Descubrí
    ## Qué no verifiqué
    ## No terminé
    ## Propuestas
    ## Tiempo y costo
    - Trabajó solo <h> h de <tope> h, y te consultó <n> veces.
    - US$ <gasto> de US$ <tope>. La cifra cubre el swarm, las lanes y los asientos externos; no cubre los turnos del Lead, ni los de los asientos nativos, ni los de las tareas delegadas.
    - Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>) y no es la cifra del tope.

Supuestos are ordered by how likely the owner is to veto them, the most likely first.

La línea de la sesión en Tiempo y costo sale de aether-report --spend --session <id de esta sesión>: los tres números y el de harness salen del JSON en dólares con dos decimales; cuando `recorded` es falso la línea es `Sesión <id>: todavía no hay gasto registrado.`; cuando `complete` es falso la línea termina con `El total está incompleto.`. La línea va en todo informe de cierre (cumplida, parcial, el tope o no terminada).

"Hice" names the branch and the commits. "Decidí" gives each decision with its grounds, above all where you departed from the Judge. "No terminé" says what was tried and why it stopped. The owner's «sí» to an item of "Espera tu sí" authorizes that action once, and you run it; if their words are general, also record a grant. When aether-guard enforces (`AETHER_IRREVERSIBLE=enforce`), it refuses even that action until a grant covers it: record the owner's reply as a session grant for its class (`aether-autonomy grant --class <class> --scope session --quote "<their words>"`), run the action, then revoke the grant. The quote needs at least 12 of their characters; when the reply is shorter, put the exact command in the brief for the owner to run.

**Every brief,** in a run or not, opens with "Espera tu sí" and "Supuestos". Outside a run the brief is short: the intent, the spec and plan paths with about five lines of each, the decisions, the list, the assumptions, what you did not verify, and the RADAR lines that apply. Outside a run you stop at the plan, and "Espera tu sí" holds the plan's execution with the method you recommend.
