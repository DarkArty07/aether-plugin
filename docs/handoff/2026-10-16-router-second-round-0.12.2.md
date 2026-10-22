# Handoff: the router and the whole of Aether tested in real sessions, and released as 0.12.2

- **Date:** 2026-10-16. It follows [the 0.12.1 handoff](2026-10-16-router-measured-0.12.1.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in the same session, after the owner wrote «sigue probando el sistema y verifica que funcione».
- **To:** the next session.
- **Repository state:** `main` holds 0.12.2 through its pull request, and the tag is `aether--v0.12.2`. The installed plugin is 0.12.2 once `claude plugin update aether@aether-plugin` has run (§5).

## 1. What was done

Eighteen more real sessions with the installed 0.12.1, US$ 4.68 in all by the CLI's count, besides four lane calls on agy. [The measures](../../specs/006-delegate-router/evidence/real/README.md) §6 has each one; in short:

| What | Result |
|---|---|
| **Fallbacks** | A decider without a key, with a rejected key and past its time; a Grok whose command fails; an agy refusal with the real words: every one ended on Claude at the level of the decision. The refusal left the router's mark for 2 h 10 min, and the next decision skipped agy though its reading showed 99 %. |
| **The override** | At `xhigh` the Lead wrote `ROUTER-OVERRIDE` with its reason and the choice was kept. At `low` it did not, and it told the owner a delegate ran at an effort it did not run at. |
| **The quota rule** | With agy and Grok together, real readings put Grok first (95 % left, its weekly window renews in 16.8 h) and agy-Gemini second (99.5 %, 155.9 h); with the real dry mark, agy-Gemini was out. |
| **agy and Grok, real** | Read-only delegates ran on both and their answers reached the Lead. agy took 13 to 19 s for a lookup at `low` (four at once, 0.7 % of its weekly window between them) and 148 s for a summary at `medium` (0.16 %); Grok took 10 to 17 s. |
| **Concurrency** | Eight decisions at once with an expired agy reading: one renewal, an intact log, all eight answers right. |
| **The whole of Aether** | An autonomous run with the router on went through the intent card, `/aether:design`, the swarm, the exam and the report, in 14.6 minutes and US$ 2.66. I ran the code it built: 22 of 22 tests and the examples of the request. The router left the design seats and the swarm alone. |
| **The rest** | The guard refused `aether-route replay --paid` as `paid-call`; the launcher `aether-lead` starts; the hidden exam gives 15 of 15 on `main`; the journal replay moves with an edited criterion. |

Two defects came out and are fixed in 0.12.2 ([issue 026](https://github.com/DarkArty07/aether-plugin/issues/47)): the note for a replaced choice, and the answer of an external delegate, which now says where it came from and why Claude Code lists 0 tool uses for it. The installed 0.12.1 matched the tag, file by file.

## 2. Found in this round, not changed

- **The swarm's lanes spend agy's weekly quota.** The four lane calls of a two-task toy run took agy's Claude and GPT group from 45.4 % to 32.9 % left. That is the design (use the quota that would be lost at its reset), but a toy run is not free in that currency.
- **The router replaces the model of a named agent that fixes its own.** A `doc-checker` with `model: opus` ran on Sonnet `high`. It touches 29 of the 382 delegations in the owner's history, US$ 1.33 of what is known; whether it should leave them alone is the owner's call.
- **Parallel external delegates see each other's quota.** Each reads its group's window before and after, so four at once each report the spending of all four (0.7 % each, 0.7 % in all). `aether-report --delegates` shows those figures per delegation.
- **A timeout is labeled `empty`.** A Haiku decider past its limit is recorded as `decider: empty` because the engine's reason has no «time» in it. The fallback is right; only the label is vague.
- **The router's own Haiku calls are still not metered** (0.12.1 handoff §2), and **`command` still waits 3 s for an agy reading** ([issue 025](https://github.com/DarkArty07/aether-plugin/issues/35)): in the eight-at-once test, four decisions waited the whole limit and went to Claude.

## 3. What is left

- **Not measured:** weeks of use, which show whether the cheaper rung does the work as well; a real CLI that fails on its own (the failures here were a simulated `grok` and `agy` with the shape of the real ones); and a Lead at `low` that writes the override (the note now tells it how).
- **Minor findings, deferred** from 0.12.0: their titles are in `.aether/autonomy/auto-20261016-001558-1884/menores-diferidos.md` (local, not in git).
- **Proposals, none built:** those of spec 006 and the 0.12.1 handoff (a regression on recorded real answers, with no text of any brief).

## 4. What waits for the owner

As in [the 0.12.1 handoff](2026-10-16-router-measured-0.12.1.md) §4, with one more decision: whether the router should leave alone the named agents that fix their own model. And one more reason to add `grok` to the `harnesses` option rather than rely on agy: for the same lookup it took 10 to 17 s against agy's 13 to 148 s, and its window renews first.

## 5. How to run things

As in [the previous handoff](2026-10-16-router-measured-0.12.1.md) §5. To move the installed plugin to 0.12.2, run `claude plugin marketplace update aether-plugin`, then `claude plugin update aether@aether-plugin`, then start a new session with `aether-lead`. To go back, install the tag `aether--v0.12.1`. The runner of the real sessions, its prompts and the shims are in [the evidence folder](../../specs/006-delegate-router/evidence/real/README.md) §5.
