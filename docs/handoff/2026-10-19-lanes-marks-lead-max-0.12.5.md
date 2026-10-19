# Handoff: agy's quota marks heal by themselves, and the Lead starts at `max` (0.12.5)

- **Date:** 2026-10-19. It follows [the 0.12.4 handoff](2026-10-19-first-setup-0.12.4.md).
- **From:** the Lead, Claude Code on Sonnet 5.5 (session e591573c), with the router in `command` and three delegates: one for the lanes fix, one for the `max` change, and an explorer.
- **To:** the next session.
- **Repository state:** `main` has pull requests 40 (the marks, A60) and 41 (the Lead at `max`, A61), and this release is 0.12.5. The tag `aether--v0.12.5` is made after this branch is merged. The owner's installed plugin is 0.12.4 until they run `claude plugin update aether@aether-plugin`; their `aether-lead` command runs the launcher of the newest installed release, so it starts at `max` after that update and not before.

## 1. What was done

| Where | What |
|---|---|
| `lib/quota-refusal.js`, `lib/lane-marks.js`, `lib/lane-calls.js`, `lib/seats.js`, `lib/router-marks.js` | One reader of agy's «Individual quota reached» for the swarm, the seats and the router. A refusal marks the group for `dryMarkMinutes` (60), whatever reset agy states; the stated reset stays in the mark as `statedResetMs`. A seat reads a marked group before it skips it. |
| `lib/lane-marks.js`, `lib/lane-quota.js`, `lib/router-quota.js`, `lib/route.js` | A mark that came from a reading is lifted by a fresh healthy reading taken after it (issue 015, third proposal); an unconfirmed mark is read as ending at most 60 minutes after `at`; a mark of a key the table does not have is ignored. The router now deletes a swarm mark file when it lifts it, which R9 of spec 006 said it never writes. |
| `lib/harness/agy.js`, `config/lanes.json` | Several table keys may read one `/usage` group. The table is back to `gemini` and `claude`. |
| `scripts/lane-smoke.js` | The CLI gets `laneEnv`, and the model name is no longer built twice. |
| `plugins/aether/launcher/aether-lead` and the texts that say how the Lead starts | `--effort max` (A61). |
| `docs/issues/027` to `030`, A60, A61 | The record of the session. |

## 2. What the owner decided, in their words

- «agy tiene 3 cuotas en realidad [...] Eso sí es un bug nuestro, el código no está adaptado». It was true on 2026-10-16 and not on 2026-10-19: agy 1.4.2 puts Argon in the Gemini quota. Real calls and the owner's screen showed it.
- «necesito que que el el lead lo haga, si me va estar pidiendo que haga cosas se pierde la autonomia»: the Lead makes the real validation calls under a `paid-call` grant. It did, with `scripts/lane-smoke.js`: Flash, and Argon at low and at high, answered.
- «eso debería ser automático [...] porque a veces llegan los resets de los proveedores y no avisan»: the marks heal.
- «mi intención no es hacer exigente los procesos a lo estúpido [...] que entre más use el sistema Aether más mejore el proyecto en lugar de solo sobrecomplicarlo»: issue 029 keeps its proposals light and optional.
- «ahora lead debe usar sonnet max en lugar de xhigh»: A61.
- «la 13 la tengo reservada para otra cosa. publica el sigueinte fix»: 0.12.5, a patch.

## 3. Open

- **The `max` of the Lead has not been seen in a real session.** The repository measured `--effort xhigh` on the main session (F3 of `docs/claude-code-research.md`); `max` is the documented path. The first session with the new launcher is the test, and A61 asks to compare its time and cost with the runs of 0.12.
- **`inheritedEffort` of the router stays `xhigh`.** At `max`, four router tests move and a Sonnet delegate that passes no effort would have its floor go from level C to D. The Lead always passes an effort, so it is left for a decision.
- **Issue 028:** a delegate task leaves Claude only when it is read-only, and Gemini 4 Argon has no role that lets it take one. The owner wants the quota of Argon and Flash spent in delegate, swarm and design.
- **Issue 029:** the owner's words stay in the chat for small fixes; decision numbers collide across worktrees (A59 did); a fix about a third party starts with a dated probe, which the Lead can now make.
- **Issue 030:** three router questions are asked and do not move the level; the climb-on-failure rule has not been tried in `command`.
- **Spec 006 R9** still says the router never writes the swarm's marks.
- **A real refusal leaving a mark with real agy** is tested only with the fake agy.
- **The decider:** Haiku at low effort is in use; Jev was not compared with it.
- **Leftovers:** the branches `fix/agy-quota-marks` and `feat/lead-max` on GitHub, and local worktrees and branches of the session, are the owner's to delete.

## 4. On the owner's machine

- The Gemini mark that held a working group out was moved aside with the owner's yes («esta bien borrar la marca vieja»); the installed plugin showed the group usable right after.
- The router option is `command`, and `harnesses` is `agy,grok` since this session.
