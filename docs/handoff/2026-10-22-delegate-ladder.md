# Handoff: the delegate ladder, without the router (spec 013)

- **Date:** 2026-10-22. It follows [the 0.18.0 handoff](2026-10-22-design-decisions-0.18.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in an autonomous run (`auto-20261022-142451-4317`) that the owner started with «no estare disponible corres en modo autonomo cuando llegue el diseño lo pasas a implementar».
- **To:** the next session.
- **Repository state:** built and checked on the branch `feat/delegate-ladder` (worktree `.worktrees/delegate-ladder`), with `main` merged into it. **Not merged into `main`, not pushed, not published, and the installed plugin is still 0.18.0**: each of those waits for the owner's yes (section 5).

## 1. What was asked

The owner said the router «no me ha servido, es muy simple, la mayoria de las veces me router siempre a sonnet» and asked to drop it for a ladder: a delegate starts on Haiku, a bad result is corrected by the same model on top of its own work, and only an inadequate model is replaced by the next one, which receives the work and the findings. The Lead judges. He also wanted every delegate, even one that edits on another harness, to show as an agent in the bar below the chat (issue 74), and the numbers (Haiku 5 corrections, Sonnet 2, Opus 1) left to calibrate later.

## 2. What was decided and built

Two decisions, [A85](../decisions.md) and [A86](../decisions.md):

- **A85, the ladder.** `lib/ladder.js` is the policy over `config/ladder.json`; `bin/aether-delegate` (`begin`, `verdict`, `start`, `run`, `wait`, `answer`, `renew`) holds each task's step; the checks that need no model run before the Lead's verdict; every launch, result, outcome, verdict, relaunch and answer is a line of `<data dir>/delegates/log.jsonl`, which `aether-report --delegates`, `/spend` and the `/harnesses` panel read. The router's decider, its modes, its replay and the options `router`, `decider` and `fallback` are removed; the choice of the pair (superdelegation), its marks and the quota brake are unchanged. Guide: [Delegates](../guide/delegates.md).
- **A86, delegates as agents.** The mod answers the `Agent` call and waits for the detached delegate without a model. **Measured, [evidence](../evidence/013-delegate-ladder.md):** the engine kills an agent whose step emits nothing for 600 s; a text event after each 540 s wait keeps it alive (18 minutes, visible in the agent bar at every reading, no model request, `isolation: worktree` reaches the call). The step yields `[Aether: the delegate is still working, N min so far]` after each wait, and those lines open the answer the Lead reads.

## 3. How it was built and checked

- **Design:** `/aether:design` on [the intent card](../../specs/013-delegate-ladder/intent.md) ended in a `dispute` at the plan stage after three Judge rounds (merge-order traps: a unit's merge is undone when the whole test command fails), was fixed and approved in short mode, and ran again in short mode after the wait measurement. Every round ran on the native agent (Sonnet writer, Opus judge) because every external pair was dry: agy refused Gemini 4 Argon with «Individual quota reached», Grok had 3 %, Muse 8 %.
- **Build:** the swarm in four launches, 13 units merged and 6 adopted by hand (`aether-wt adopt`: Tasks 2, 8, 12, 13, 14, 19). Each adopted unit's supervisor had approved its work or named a plan defect: a brief's test that contradicted the spec's rules (Task 2), a merge gate that a file outside the task's Owns made red (Tasks 8, 14), and three units that each made a test of the others red until all were in (Tasks 12, 13, 19, applied together and tested once). Task 17, the wait measurement, was the Lead's.
- **Checks:** `npm run check` on the merged tree: 1828 tests, 104 of the mod, validation of the plugin and the marketplace. The hidden exam: 18 of 18 (it first failed 2: the proving tests named the retired command, now built from parts, and the guide's diff sentence did not name the checks). The final review (Opus): `ready-with-fixes`, one important finding (`docs/methodology.md` still said the Lead picks a delegate's model), fixed.
- **Cost:** the swarm US$ 40.92 at list price (native US$ 37.23, agy lanes US$ 3.69); the whole session US$ 64.28.

## 4. What is open

- **The real session of C12** (a delegate that edits, through `Agent`, on another harness, seen in the agent bar), which spends other plans' quota; the exact command is in the evidence file. It also checks two things nobody measured: the model's answer after the mod's heartbeats (R14), and a foreground `Agent` call.
- **Deferred minor findings of the final review:** `docs/getting-started.md` step 8 still says «a delegate task on a model it names» (a phrase `tests/launcher.test.js` pins); some `lib/delegate-*.js` headers still say «the router chose»; two tests hold separate lists of the retired identifiers; `docs/roadmap.md` is outside the search; the search can pass on an empty scan. From Task 10: a stale `run` of the same id can write its result after a new `start`, a reused pid keeps `wait` waiting, and the `renew` verb has no test of its own.
- **Two plan defects to file as issues** (found here): `Max agents` in `tasks.md` is the run's total budget of model agents, not its parallelism, and the Writer and the Judge read it as parallelism (a plan with 4 left four units `not-run`); and the merge gate cannot take a group of units that each break a test of another, so five of 21 units needed a hand merge.
- **The numbers 5, 2 and 1** are in `config/ladder.json`: read `aether-report --delegates` after some use and calibrate.

## 5. Release, when the owner says yes

The grants (`merge-main`, `push`, `publish`, `delete`, `paid-call`) are none. In order, each action with its own grant call, as the memory says:

1. Merge into `main` from the main checkout: `git merge --no-ff feat/delegate-ladder` (if `main` moved again, merge it into the branch first and run `npm run check`). If `main` took decision numbers A85 or A86 meanwhile, renumber the two rows here.
2. The release (full steps in [contributing](../contributing.md)): version 0.19.0 in `plugin.json`, the pin in `tests/launcher.test.js`, the README's `Version` line and the changelog's first `Version` line; the changelog entry; `npm run check`; `claude plugin tag plugins/aether`.
3. Push `main` and the tag, then `claude plugin update aether@aether-plugin`.
4. Close issues 51 and 74 (commands in the evidence file), and delete what is left: `.aether/spike-wait/`, the Orca terminal titled `spike-wait-013`, the worktree `.worktrees/delegate-ladder` and the branch.

## 6. What the next session has to watch

That a real delegate on another harness shows in the agent bar for its whole run; that the heartbeat lines at the top of the answer do not confuse the Lead; that the ladder's Haiku start does not cost more than it saves (the log says how many times each step approves); and that a pair whose quota is dry does not send every delegate to Claude, which would show as many `no-candidate` outcomes.
