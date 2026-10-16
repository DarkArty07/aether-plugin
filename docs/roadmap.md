---
title: Roadmap
description: Where Aether stands at version 0.12.1, what waits for the owner, the effort rule per task and what is deferred.
order: 32
---

# Roadmap

**Now:** version 0.12.1 checks the [delegate router](guide/router.md) of 0.12.0 with real models, on top of 0.11.0's `/aether:design` and 0.10.0's quota-aware lanes and super Lead: the paid replay on the owner's real delegations with both deciders, and six real sessions of the Lead ([measures](../specs/006-delegate-router/evidence/real/README.md)). It also fixes the Jev decider, which could not read Jev's answers ([issue 024](issues/024-jev-answers-to-yes-no-questions-have-no-confidence-and-every-jev-reply-was-unreadable.md)). What it leaves for the owner: moving the router from `record` to `advise` and on to `command` (the replay and the sessions show it working, and each decider would change about 70 % of the Lead's choices; only use shows whether the cheaper rung does the work as well); adding `grok` to the `harnesses` option so the router can use it; confirming the quota order (the weekly window that renews first, as built, or A49's balance per hour); saying whether the regression briefs should be real ones instead of synthetic; ruling on whether the swarm and the design seats should also recognize agy's explicit refusal ([issue 021](issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md)); and the 3-second wait of `command` for an agy reading ([issue 025](issues/025-command-waits-3-seconds-for-an-agy-reading-that-takes-5-and-agy-cannot-serve-the-task.md)). What 0.11.0 left for the owner: turning Grok on in the lanes, since `harnesses`, `agy` by default, keeps every lane off Grok until the owner accepts the risk of a harness that runs without permission prompts (Grok with `--always-approve`; see Containment in [Lanes](guide/lanes.md#lanes); [handoff](handoff/2026-10-14-quota-lanes-0.10.0.md), section 4). What 0.9 left for the owner has not been done and moved to the later items of the same handoff, because agy does not offer Gemini 4 Argon yet (sections 2 and 3): the first real round of Argon on agy, which checks its name and quota group, and the seats' measurement ([evaluation](evaluations/seats/README.md)).

The [RADAR roadmap](roadmap/2026-10-10-radar.md): version 0.8 builds its phases 1, 2a and 2b. What remains waits for the owner: a real call per harness and role on Codex and Cursor, and turning each one on (Grok's one role was checked on 2026-10-13; turning it on is in Now above); a measured design session with the Writer and the Judge against the 0.7 Designer; and a rerun of trial 2 in Aether mode with [its techniques](evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost).

**Effort.** Since version 0.3.0, each plan task sets its implementer's effort on its Tier line, by the task's complexity ([spec](superpowers/specs/2026-10-08-effort-per-task-design.md)).
- The default is `xhigh` on every model. The Writer lowers it where the tests pin the work, and names `max` only with a reason.
- A failed attempt runs again at `xhigh`, then moves up the ladder.
- The supervisor reviews at `high`, and a task's Review line can raise it.
- `aether-report` shows the cost and the time of each role, model and effort. `scripts/check-effort.js` checks, from a session's transcripts, that each agent ran at the effort its call asked for.

These are deferred until the trials justify them:
- a second opinion from another provider on high-risk documents, and a rescue seat for a stopped unit;
- hiding the preset skills in normal sessions;
- notifications;
- several parallel attempts on critical units;
- marketplace publishing.
