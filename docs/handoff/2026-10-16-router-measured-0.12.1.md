# Handoff: the delegate router measured with real models, and released as 0.12.1

- **Date:** 2026-10-16. It follows [the 0.12.0 handoff](2026-10-16-delegate-router-0.12.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in the same session as 0.12.0, after the owner woke up and wrote «La clBd anotas en un env, apruebo los gastos de prueba, usa la dsiones reales y termina lo pendiente». Read as: the OpenRouter key goes in an env file, the test spending is approved, use the real sessions, and finish what the 0.12.0 brief left pending.
- **To:** the next session.
- **Repository state:** `main` holds 0.12.1 through its pull request, and the tag is `aether--v0.12.1`. The installed plugin is 0.12.1 once `claude plugin update aether@aether-plugin` has run (§5). The local worktrees and branches of feature 006 are gone; the branches stay merged on GitHub.

## 1. What was done

| What | Detail |
|---|---|
| **The key** | The owner's OpenRouter key is in `~/.claude/plugins/data/aether-aether-plugin/.env`, mode 600, outside every repository: the place the router already reads. The owner kept it instead of rotating it. It also remains in the text of the 0.12.0 session's transcript, and it has no spend limit on OpenRouter. |
| **The paid replay** | `aether-route replay --projects ~/.claude/projects --decider <haiku\|jev> --paid` over 327 real delegations, with both deciders: [the measures](../../specs/006-delegate-router/evidence/real/README.md) §1. Haiku decided 317 (10 fell to the fallback) with a median call of 2.1 s; Jev decided all 327. They agree on the level in 73 % and within one level in 97.5 %. Each would change about 70 % of the Lead's choices; at list prices the delegations that have a cost would be 31 % (Haiku) and 25 % (Jev) cheaper. |
| **Six real sessions** | A real Lead, in `record` (the installed 0.12.0), `advise` and `command`, with Haiku and with Jev: three parallel launches, a background delegate, one with `isolation: "worktree"`, and a read-only delegate on a real Grok 4.7. The usage meter shows each delegate on the model and effort the router decided. US$ 0.85 in all ([measures](../../specs/006-delegate-router/evidence/real/README.md) §2). |
| **A fix** | Jev could not decide: it answers a yes/no question with the probability alone and the router asked for a confidence ([issue 024](https://github.com/DarkArty07/aether-plugin/issues/46), decision A56). Fixed, with a test that reads a reply saved from the real API. |
| **The records** | 0.12.1 in the four places, the changelog, the guide's viability table with the measures, the roadmap, [issue 025](https://github.com/DarkArty07/aether-plugin/issues/35). Issues 021, 022, 023 and 025 are on GitHub as #32, #33, #34 and #35. The 11 worktrees and 12 branches of feature 006 were removed. |

## 2. Found in this session

- **Jev never worked in 0.12.0** (issue 024). The tests gave Jev's yes/no answers a confidence that the real service does not send. Nobody had `decider=jev`.
- **`command` waits 3 s for agy** (issue 025). A read-only delegate waits the whole quota limit for a reading that takes 5 s and that cannot change the choice. Grok's renewal takes 0.7 s and fits.
- **`record` is not free.** With `lanes` on and agy among the `harnesses`, a decision with an expired reading starts `agy -p /usage` in the background. The decider's own Haiku call is not metered by `aether-report`.
- **Grok is off by default.** `harnesses` ships as `agy`, and the owner's configuration does not change it, so the router does not use Grok until `grok` is added, though its weekly window is the one that renews first (95 % free, 17.8 hours).
- **A saved option wins over the environment.** In a session with `--plugin-dir`, `lanes` stayed `true` against `CLAUDE_PLUGIN_OPTION_LANES=false`, because the owner saved it for `aether@inline`.

## 3. What is left

- **Not measured:** a delegate on a real agy (its Gemini group has the swarm's dry mark until 2026-10-22; its Claude group serves no level); the real failure of an external delegate in a real session (quota, time limit), tested only with simulated harnesses; and weeks of use, which is the only way to see whether the cheaper rung does the work as well.
- **Minor findings, deferred** from 0.12.0: their titles are in `.aether/autonomy/auto-20261016-001558-1884/menores-diferidos.md` (local, not in git).
- **The Proposals of spec 006 and the six other uses:** none is built. One more came out of the replay: a regression on real data. The router's regression decides from the answers, not from the brief text, so a set of recorded answers of real delegations, with no text of any brief, would guard the criterion on real data without the anonymizing that real briefs need.

## 4. What waits for the owner

- **Which mode.** The numbers do not say whether the decisions are right, only that the router works and what it would change. A prudent path: `advise` with the Haiku decider for some sessions, reading `aether-report --delegates`, then `command`. Haiku keeps the briefs inside Claude, fails to the fallback in 3 % of the cases and takes about 1.5 to 2 s in a session; Jev fails in none and takes under 1 s, but sends each brief to a third party, which matters for projects with client or medical data.
- **Grok.** To let the router use it, add `grok` to the `harnesses` option (`claude plugin configure aether@aether-plugin`). It runs without permission prompts in a disposable worktree (see Containment in [Lanes](../guide/lanes.md#lanes)).
- **The OpenRouter key.** A spend limit can be set on it in OpenRouter's settings.
- **Decisions:** the quota order (the owner's literal rule, or A49's balance per hour); whether to build the regression on real recorded answers; whether the swarm and the seats recognize agy's refusal ([issue 021](https://github.com/DarkArty07/aether-plugin/issues/32)); whether to fix the wait of issue 025 now; and an `off` mode.

## 5. How to run things

As in [the previous handoff](2026-10-16-delegate-router-0.12.0.md) §5. To move the installed plugin to 0.12.1, run `claude plugin marketplace update aether-plugin`, then `claude plugin update aether@aether-plugin`, then start a new session with `aether-lead`. To go back, install the tag `aether--v0.12.0`. To repeat the measures, [the measures](../../specs/006-delegate-router/evidence/real/README.md) §5 has the commands (`real-session.js` and `compare.js` are in that folder); a paid replay takes about half an hour for Haiku and two minutes for Jev.
