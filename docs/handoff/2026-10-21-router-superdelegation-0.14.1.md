# Handoff: superdelegation reaches the Lead's delegate tasks (0.14.1)

- **Date:** 2026-10-21. It follows [the 0.14.0 handoff](2026-10-20-superdelegation-0.14.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5.
- **To:** the next session.
- **Repository state:** published on the owner's word of 2026-10-21 («manda todo a main push limpia lo que debas includio el worktree y actulzia local»): merged to `main` (`9683a52`), tagged `aether--v0.14.1`, pushed, and his plugin updated from 0.14.0 (a restart applies it). The branch and its worktree are gone. Section 4 says what is open.

## 1. What was asked

The owner asked whether the router's delegates always fall to Claude (they nearly always did: 13 of 15 recorded delegations), and then: «eso haria homogeneo la delegacion de todo el sistema superdelegacion SI O NO. y no habria tantas configs particulares no?», confirmed «lo que supones es lo que quiero», and «contruyes esa, quiero que en las sigueintes sesiones tambien el trafico de los agetnes delegados se vyaa a otros harness». The rule stays the one of A65: the points of the Claude pair, then the quota that renews first, then the cheapest per task.

## 2. What was done

| Where | What |
|---|---|
| `lib/router-pick.js` (new) | `pairStep`: the router gives the Claude rung the call would run on, and the function of `lib/superdelegation.js` returns the external pair. It builds the quota views from the readings the router already has (a hook never starts a quota call), renews a stale reading in the background and waits for it only for a harness that has a pair able to take the task. |
| `lib/route.js` | The quota step and `chooseHarness` are gone; `conclude` asks `pairStep`; the rescue rung of an external delegate is the call's own Claude rung; the decision keeps `choice`, the words of the function, and the journal's `quota` keeps its candidates. |
| `lib/router-quota.js` | Only the readings stay (`peekReadings`, `staleHarnesses`, `readingFile`, `lifeMs`). `chooseHarness`, `servableHarnesses` and the order by balance are retired. |
| `lib/delegate-calls.js` | A delegate may run on agy, grok or muse. |
| `lib/session.js`, `hooks/panel-view.mjs`, `plugin.json` | The router option has a new value, `auto`, its default: `command` with superdelegation on and `record` with it off. The text of `superdelegation` says what it covers. |
| `lib/router-replay.js` | An external pick is compared by its level and the Claude rung it falls back to, which is now the call's rung. |
| `docs/guide/router.md`, `options.md`, `components.md`, `changelog.md`, `decisions.md` (A66) | The router guide has one quota rule. |
| `tests/router-pick.test.js` (new) and the router tests | The scenarios of R20 to R23 now run over the pairs: renewal, wait, marks, lift, Muse, the call that no pair reaches. |

## 3. What the owner decided, in his words

- «contruyes esa, quiero que en las sigueintes sesiones tambien el trafico de los agetnes delegados se vyaa a otros harness».
- «lo que supones es lo que quiero» (the points A to C of the Lead's message: delegates that edit are a spec of their own, with a feasibility check of the ten minutes of the engine first).

## 4. Open

- **Delegates that edit files still stay on Claude.** An external delegate works on a copy that is thrown away. The next spec: a unit worktree made by `aether-wt`, the result back as a branch that the Lead reviews and merges, the fallback on Claude on another pair, and the limit of ten minutes of `$.process.run` (it needs a check: can the mod leave the call running and give the result later?). 13 of the 15 delegations recorded between 19 and 21 October ran on Claude; the two that left were read-only research.
- **The card for that spec is written:** [specs/010-delegates-that-edit/intent.md](../../specs/010-delegates-that-edit/intent.md), with the owner's words, the assumptions he confirmed and what to measure first.
- **Delegates do not count against the cupo.** A delegate runs outside a run, so the `maxParallel` of a harness (agy 8, grok 2, muse 2) does not limit them; several at once on Muse or Grok would pass the number that was measured.
- **Real calls.** The tests run with fake CLIs. A real read-only delegate through the router on Muse has not been run; it spends the owner's Muse quota and needs his word.
- **The router's old rungs for agy and Grok** stay in `config/router/rungs.json` and `scripts/build-router-rungs.js`; nothing reads them for an external choice now. They can leave in a later version.
- **Unchanged from 0.14.0:** the proposals of the final review by slices on lanes, a Writer seat for `design.md` and the effort guide by cost per task.

## 5. Release

Version 0.14.1 is in the four places the contributing guide names, and `npm run check` passed (1459 tests, 69 of the mod, the strict validation). The merge, the tag `aether--v0.14.1` and the push were made on the owner's word, and `claude plugin update aether@aether-plugin` took his installed plugin from 0.14.0 to 0.14.1.

## 6. What the next session has to watch

The delegation is the thing to watch in the first sessions with 0.14.1: whether the Lead's read-only delegates really leave Claude, to which pair and why. `aether-report --delegates` shows, per delegation, the pair asked, the pair that ran it and the candidates; the router's journal keeps the words of the function in `decision.choice`. A delegate that edits files stays on Claude by design (spec 010).
