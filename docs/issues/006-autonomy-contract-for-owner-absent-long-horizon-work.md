# There is no autonomy contract, so long-horizon work across sessions stops at every gate when the owner is not present

**Type:** feature request and design gap (the agenda for the next working session)
**Date:** 2026-10-09
**Found in:** an overnight trial with two Lead sessions on two projects, while the owner slept
**Status:** partly addressed in 0.5.0 (2026-10-09). Done, in a lean form: standing authorizations recorded from the owner's verified quotes, with a session or repository scope; the three classes of action; a run state with a diary; ceilings of time and cost; the morning brief; resuming after a compaction; fallbacks that never reach the owner; the Lead as the owner's delegate. Not done, on purpose: enforcing the classes in a hook (proposal 2). Open: Telegram alerts (sub-project 3), the peer protocol and parallel Leads (sub-project 4), health checks on shared services, an append-only ledger shared by every session.

## What the owner wants

Run long tasks across several sessions and projects without being present: the Lead orchestrates other sessions and subagents, keeps going for hours, and leaves one clear report for the morning. The owner said it in these words: «no cuentes conmigo hasta acabar». The plugin should make that safe, not just possible.

## What happened

- Every gate that needs the owner (understanding, design, spec, plan, real model calls, merge, deploy) was enforced by the cooperation of whichever agent held it. Authorizations did not travel: the owner delegated the design gates to the first Lead, and the second session still asked for each one in its own terminal.
- This cost, in one night: the second session stopped at its first gate for about 20 minutes until the owner typed in its terminal (issue 001), then waited again for the plan's execution method, and at the end refused to run the authorized smoke call because the authorization had been given in the other session.
- The gates are only advisory. After the owner said «fusiona el del router» in the first session, the first Lead merged the router's pull request itself with `gh`. The second session's rule («merge only with the owner's OK in my terminal») did not and could not stop it. So the system stops the honest agent that asks, and not the one that acts, and the owner cannot tell which gates are real.
- There was no place to record what had been authorized, with what limits and by whom. The Lead kept it in its own notes. A restart of the Lead, or a second Lead, would not have known.

## Proposals

1. **An autonomy contract file**, written by the owner through a trusted command run in the owner's own terminal (for example `/aether:autonomy`), not by any agent. It lists standing authorizations as data:
   - an action class (`design-gate`, `real-model-call`, `merge-to-integration`, `merge-to-main`, `deploy`, `restart-service`, `spend`);
   - a scope (repositories, branches, services, model names);
   - a ceiling (number of calls, USD, wall clock) and an expiry;
   - the sessions it applies to.
2. **Enforcement in a hook, not in the prompt.** A `PreToolUse` hook in every Aether session checks an action against the contract and the ledger, and refuses what is not covered. An agent that "acts directly" with `gh` or `git push` meets the same hook.
3. **A ledger of actions taken under the contract**, append-only, readable by every session, with the session, the time and the contract line used. The morning report is built from it.
4. **Three classes of action:** reversible (proceed), costly (proceed within the ceiling), outward or irreversible (needs a standing line in the contract or the owner). The default for anything not listed is "stop and put it in the morning batch".
5. **A morning-batch report as a first-class output:** what was done, what is waiting for the owner and why, the exact commands to approve each item, and what it cost.
6. **Long-horizon support:** a durable run state any new Lead can resume from (plan, units, authorizations used, open questions), checkpoints, a health check on shared services (for example the router) after every deployment, and rules for who owns a plan when several sessions work in parallel.
7. **A peer protocol** with typed messages and the contract id attached, so a session can verify that a request comes with a valid grant (see issue 001).

## Acceptance

- A plan that needs real calls, a merge and a deploy runs overnight with the owner away, inside a contract that allows exactly those, and ends with a report and a ledger.
- The same run with a narrower contract stops at the first uncovered action and lists it, without any session acting around the hook.
- A session started from scratch can read the run state and the ledger and continue.

## Related

Issues 001 (delegation across sessions), 002 and 004 (the ops agent), 003 (large units) and 005 (reporting).
