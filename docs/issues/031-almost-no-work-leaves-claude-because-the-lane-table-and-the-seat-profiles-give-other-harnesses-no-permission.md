# Almost no work leaves Claude: the lane table and the seat profiles give the other harnesses no permission to take it

**Type:** improvement (lanes, design seats, RADAR C3 Delegación)
**Date:** 2026-10-19
**Found in:** the owner's questions in the Lead's session 4cb63536, during the autonomous run `auto-20261019-145237-9fff` (spec 008, Muse Code)
**Status:** fixed in 0.14.0 (2026-10-20), by superdelegation (A65, spec `specs/009-superdelegation/`). See the Update below.
**GitHub:** not filed

**Update 2026-10-20, 0.14.0:** fixed. One option, `superdelegation`, off by default, replaces `lanes` and the three seat profiles (proposal 1: one rule for the seats, no profiles). A call asks for the Artificial Analysis intelligence of its reference pair, and any external pair within one point may take it, by measurement and not by a hand-written table (proposal 2); the Writer's corrections are seat rounds (proposal 3); `max` is no special case: it goes to a pair that reaches its points, and none does today (proposal 4); speed decides nothing, by the owner's word, not as a cap (proposal 5, left out); the report names, per call, the pair asked, the pair that took it and why (proposal 6, without a target). Seen in a real run of three tasks on 2026-10-20: four of seven calls went to other harnesses, three supervisors on Grok and a Haiku implementer on Gemini Flash; the two Sonnet implementers were picked on Gemini 4 Argon, which refused for its individual quota, and ran native. The acceptance's last line holds: the `seats` option no longer asks the owner to choose between sides.

## What happened

- The owner's intent, as given: «una plitica de superdelagcion total ... la diea es que los harness externos ocupen todas las tareas que no sean lead. Asi se promueve que se gasten primero la cutoa de los harness externos». Earlier, in issue 028: «los procesos que no hace el agente principal los puede tomar otro harness». The router is fine as it is and stays out of this («lo del router si esta bien ese no hay que moverlo»).
- **Options are already at their top position.** The owner runs `lanes` on, `harnesses=agy,grok`, `seats=balanced` and `router=command`. There are three switches and eight positions in all (`lanes` 2, `seats` 3, `router` 3, plus `decider` 2 inside the router), and none is a «total» mode.
- **The swarm.** In the three finalized runs with lane decisions (004, 005, 006) there were 104 decisions and 1 went to another harness: 64 stayed native as «under the reserve» and 39 as «marked dry». In 94 of the 104 the only external candidate was agy's Claude model, whose quota was empty. In the 008 swarm so far: 4 external calls, 2 ok and 2 refused for quota (agy's Claude group at 0 % weekly, dry mark for 60 minutes); 7 implementers and all 8 supervisors ran native.
- **Why the idle pools stay idle.** The table lets a model take a call only if its entry has the call's role, `replaces` the call's native model and declares the call's effort in `levels` (`lane-calls.js:158`). Today: Gemini 3.8 Flash and grok-4.7 replace Haiku as implementers only; Gemini 4 Argon has seat roles only; codex and cursor have no models; Muse has none until step L3 of spec 008. The pools with quota (agy Gemini at 95–97 % weekly, Grok) can therefore take almost nothing; the only pool allowed to take Sonnet and Opus work is the one that is empty. The owner knows the agy plan and has said he wants Argon and Flash spent (issue 027).
- **The design.** In the 008 design, 4 Judge rounds and the Examiner ran on Argon; the 4 Writer runs ran native. Two of those are first drafts and need only configuration: `designSeats.balanced.writer` is `[]`. Two are corrections, hard-wired to the native Writer (`nativeRevision`, `design.workflow.js:422`, a rule of the bootstrap). A Writer on Argon forces the Judge off Argon (the author is skipped, `seats.js` `chooseSeat`), so it needs a second external family in the Judge and Examiner lists, and those models must list `judge` and `examiner` in their `roles` (`lanes.js` `validateSeats`). The `seats` option accepts only `native`, `balanced` and `robust` (`SEAT_CHOICES`); the owner finds the three profiles confusing and against superdelegation.
- **How a model is chosen today.** Artificial Analysis decides which external model stands for which native one (the `aa` fields of the table; the router's levels) and Muse enters only with a measurement. It does not choose the Tier or the effort of a plan task (the Writer does, by the guide in `speckit.tasks.md`) or the seat occupants (Argon as Judge entered on the owner's rule to go back to Opus if quality drops). Cost does not count (the plans are quota, not dollars). Among candidates of one level the quota decides the order. Speed is not used, although Argon's rounds took 7 to 12 minutes each.
- **Not external by rule or by missing mechanism:** the Lead; calls at `max` (no model declares a `max` key, A21); `ops` (no model); the Writer's corrections; delegates that edit and delegates of level C (issue 028, left alone by the owner's decision).

## Impact

- The plans other than Claude are spent almost only by the design Judge and Examiner and a few Haiku-level calls. Sonnet-level implementers and every supervisor run on Claude whenever agy's Claude quota is gone, which is most of the time. RADAR C3 (the share the plans cover) reads 0–12 % in the finalized runs.

## Proposals

1. **One rule for the seats, no profiles:** every seat tries its external models first, Claude last, and nobody reviews its own work. Fill the three lists; reduce the `seats` option to two values (external-first or all native). The lists are configuration; the option is small code.
2. **Give the idle pools permission, by measurement:** Argon (measured level C, the same as Sonnet `xhigh`) as implementer and supervisor of Sonnet level; the Muse models by their Artificial Analysis measurement; Flash and Grok stay at Haiku level. Add Argon's `reviewer` role for the final review as `design-seats.md` already describes. Argon as an implementer is unmeasured against Claude: the supervisor and the fallback to native bound the risk.
3. **The Writer's corrections as seat rounds,** with the same author rule: code in `design.workflow.js`, its tests and the bootstrap sentence that says a correction is always native.
4. **Decide on `max`:** a `max` key in a model's `levels` makes the call eligible (Muse has `max`); A21 says `max` is always native, so it is a decision, not an oversight.
5. **Speed as a cap, not a score:** keep a model much slower than the native one off the tasks that block the others, and use it where waiting costs nothing, such as the final review.
6. **A target:** state the share the plans should cover and have `aether-report` flag a run below it with the reasons already in `lanes.run.choices`.
7. **Two traps for whoever edits the table:** `validateModel` takes only `low`, `medium` or `high` as values of `levels` (so a Muse model maps `xhigh` to `high`), and a seat model must list the seat in `roles`.

## Acceptance

- In a swarm with every external pool above its reserve, the Sonnet-level implementers and the supervisors go to a harness other than Claude, and the report says each reason when one does not.
- With a Writer on one external family, the Judge and the Examiner are on another, and no seat is occupied by the model that wrote what it reviews.
- The `seats` option no longer needs the owner to choose between sides.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.5 installed, Sonnet 5.5 as the Lead, agy 1.4.2, grok 1.0.62, muse 1.4.10, Linux (WSL2). Data: `runs.jsonl` of the plugin data directory (runs 002, 004, 005, 006), the session's lane log, and the 008 design and swarm workflows.
