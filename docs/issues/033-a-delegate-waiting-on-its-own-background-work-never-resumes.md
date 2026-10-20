# A delegate task that stops "waiting on its own background work" never resumes, and the Lead idles until the run's ceiling

**Type:** bug (autonomy, delegate tasks)
**Date:** 2026-10-16
**Found in:** the Lead's session dd183371, run `auto-20261016-001335-f0d5` (LANDING PAGE DRA)
**Status:** the Aether side is fixed in 0.14.0 (2026-10-20), built on branch `fix/bug-issues`: the autonomous-runs skill no longer counts such a delegate as something pending that will wake the Lead, and names the fallback wakeup and the check on waking; `aether-autonomy status` flags a run whose diary and state have been quiet for 30 minutes (`idle`, `idleMinutes`). Open: the Claude Code side, a subagent that is promised a resume that never comes (reported through /feedback).
**GitHub:** [#31](https://github.com/DarkArty07/aether-plugin/issues/31) (private repository). This file is the local record, written from that issue when its Aether side was fixed.

## What happened

The Lead delegated the page work to a background `general-purpose` subagent (Sonnet 5.5, xhigh), task `a6551c4b166c3b114`. The subagent started its final checks under a Monitor and ended its turn. Claude Code then sent a notification saying the agent was waiting on its own background work and might resume when that work completed.

The subagent never resumed: its transcript ends at 06:54:58Z, and no further notification arrived. The Lead read the note as "something pending will wake me", which is the condition the autonomous-runs skill accepts for ending a turn, and ended its turn. Nothing woke it. The session sat idle for about 8 hours, until the owner wrote at 15:07Z. By then the run had passed its 8-hour ceiling (8.9 h elapsed, about 40 minutes of real work) and closed with `outcome: ceiling`.

The work itself was finished: when the Lead checked by hand, the tests and checks all passed.

## Two causes

1. **Claude Code:** a subagent that stops "waiting on its own background work" is promised a resume that did not happen. (Reported separately through /feedback.)
2. **Aether:** the "Keep going" rule counted a delegate task as pending when its last notification said it was waiting. Nothing in Aether covered a delegate that never comes back: no timeout, no fallback wakeup, no check of the task's output.

## Acceptance

- A delegate task whose last notification is "waiting on its own background work" does not count, alone, as something pending that will wake the Lead. *(Done: the skill says so.)*
- In that case the Lead starts a fallback wakeup (for example a background `sleep` of 15 to 20 minutes), and on waking checks the task: if it has not reported, it resumes it with a message or does the remaining step itself. *(Done: the skill names both.)*
- `aether-autonomy status` (or the session-start notice) flags a run that has had no activity for longer than a set time. *(Done in `status`: `idle` and `idleMinutes`, from the diary's and the run state's modification times. The session-start notice already sends the Lead to `aether-autonomy status` first.)*

## Impact

A night's run did 40 minutes of work and spent the rest of its time ceiling idle. The owner found it unfinished the next morning.
