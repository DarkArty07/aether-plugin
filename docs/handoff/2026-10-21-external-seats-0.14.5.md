# Handoff: Muse takes the schemas of the seats and the swarm, and a failed design seat asks for the next pair (0.14.5)

- **Date:** 2026-10-21. It follows [the 0.14.4 handoff](2026-10-21-split-argon-flash-0.14.4.md), whose section 3 is the owner's policy: read it first.
- **From:** the Lead, Claude Code on Sonnet 5.5, in the same long session, working autonomously on «necesito que trabjes en lo que conversmaos, continua implementandolo» with «autorizo gasto no hay problema».
- **To:** the next session.
- **Repository state:** built on the branch `fix/external-seats`, which holds the branch of 0.14.4 (Argon and Flash split) and the work of this version; section 6 says how it stands.

## 1. What was asked

To go on with the policy («prioridad a toda costa» for other harnesses, Claude's quota as the reserve) and the three changes: the Lead's rule, spec 010 (delegates that edit go external first) and the swarm's final review. The Lead started with spec 010: it wrote the card's update (words, measurements, criteria), and ran `/aether:design` on it with the owner's spending authorization.

## 2. What happened, and what was done

- **The design of 010 ended in `dispute`** (`wf_d46ae949-355`): three rounds of the Judge, all `revise`. The card is in the branch `feat/delegates-that-edit` (worktree `.worktrees/delegates-that-edit`, commit `9ecf64e`), with the spec the Writer wrote in the worktree.
- **The run itself exposed why the external route was not working,** and that became this version:
  - Muse failed every round it took (three Judge rounds, then the swarm's implementer, supervisors and final review), with `API error 400: 'additionalProperties' is required...`. A real Muse call showed that its provider wants a strict schema: every object closed and every property required. `strictSchema` and the adapter's `argv` fix it; all eight role schemas answered clean on real calls (issue 039, A70).
  - A design seat that failed (the Writer on Argon, refused) went to the native agent without trying the next pair. `seat-start` takes `--exclude` and `seatRound` asks for the next pair, up to three external tries (issue 040, A70).
- **How it was built:** a plan of three tasks (`.aether/plans/external-seats/tasks.md`, local) ran as a swarm (`wf_dda90a5c-3a4`, `wf_d77249a9-433`) with implementers on Grok and Muse. Task 1 merged; task 2 was blocked by a flaw of the plan (the brief asked to share `excludeList` of `lib/lane-pick.js`, a file the task did not own), and the Lead adopted its sound work with a copy of the validator in `seats.js`; task 3 merged on its second attempt. The final review (native Opus) found that Muse's strict copy was incomplete (the Writer schemas have optional keys), which the Lead verified with real calls and fixed directly. 1539 tests, 69 of the mod and the strict validation pass.
- The swarm still sent calls to Claude when a lane failed after it started or ended for quota (Muse before the fix, Argon's refusal for an implementer): issue 041, open.

## 3. Corrections to what was said earlier in the session

- The final review of the swarm already tries a lane first, as one call with the whole package, and only falls to native slices if no pair takes it or it fails; the 0.14.4 handoff said it ran on the native reviewer.

## 4. Where spec 010 stands, and the next step

The Judge's findings after three rounds, in short: a full cupo must try another harness before Claude; the review of the diff must always run when an external reviewer exists; the brief must carry the role, model and effort the choice needs; and R18, a requirement the Writer added (the router refuses an `Agent` call that edits when superdelegation is on) opened new findings every round: the `tool.call` event has no `workflow` field and `aether:*` agents are not routed. The Lead's decision (D5 of the run's diary): drop R18, let the guarantee rest on the Lead's rules plus a measure in the journal, and keep the router's refusal as a proposal. **Next:** rewrite the card without R18 and with the Judge's other findings as criteria, commit it in `.worktrees/delegates-that-edit`, and run `/aether:design` again in full mode, now with `binDir` pointing at the plugin of this branch and the design workflow of the branch (so that the Judge seat can run on Muse and a failed seat tries the next pair). Then build it with `/aether:run`; the Lead's rule (the first of the three changes) goes in the same work.

## 5. Open

- **Issue 041** (the swarm's failed lane call goes native without the next pair): the same fix as for the delegates and the seats, in `laneCall` of `workflows/run.workflow.js`.
- **The workflows loaded in a session are the installed ones:** until 0.14.5 is installed, a session that starts `/aether:design` or `/aether:run` runs the old workflow; pass `binDir` of the branch for the bins and use the branch's script path for the workflow.
- Nothing of 0.14.2 to 0.14.5 has been seen in a normal session; real Muse calls were made for the schemas only (the first Muse seat, a Judge-shaped call, answered clean).
- The `report.js` double count of the shared Gemini window (0.14.4) and the three tests that read the shell's Aether variables.

## 6. Release

Version 0.14.5 is in the four places the contributing guide names, with the roadmap and the badge. The branch holds 0.14.4 too. **Nothing is merged, tagged, pushed or installed: it waits for the owner's word.**

## 7. What the next session has to watch

That a design round that picks Muse answers; that a round whose first pair fails shows more than one try in its record and no native agent; and that, with the next step above done, the Judge of spec 010 is not Opus.
