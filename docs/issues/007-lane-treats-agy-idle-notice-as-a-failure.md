# The lane classifies agy's "root agent idle" notice as a failure, so finished work is thrown away and redone natively

**Type:** bug (lane failure classification)
**Date:** 2026-10-09
**Found in:** the first swarm run of Aether 0.5.0 (plan: the Lead's autonomy, 9 tasks), with real agy
**Status:** open (2026-10-09). Sub-project 2.
**GitHub:** [#7](https://github.com/DarkArty07/aether-plugin/issues/7) (private repository)

## Summary

Of 6 lane calls to Gemini 3.8 Flash, 5 ended as `failed` with the reason `stderr: root agent idle; waiting up to 45m0s for N background task(s)`. That line is a notice agy prints when it has started background tasks, not an error. The lane runner treats any stderr warning as a failure (a rule taken from the spikes, where failures hid behind success), so the attempt falls back to the native agent.

## What happened

- The agy attempts had produced real work. For task 3 the native fallback agent reported that the guard change already existed as a commit made by "the interrupted agy attempt" and verified it instead of redoing it.
- The 5 failed calls still cost quota and money: 6 calls were priced at $1.58 at list price, and the native agents then ran on top of that.
- Only task 5 kept the lane's result (`provider: agy gemini-3.8-flash-high`).

## Impact

- The lane drains Gemini quota and still pays for a native attempt, which is the opposite of the owner's goal for lanes.
- `laneFailure` in the result is noise: it reads as an infrastructure fault when the work was fine.

## Proposals

1. Treat the `root agent idle; waiting up to ...` line as informational. Keep treating an empty response, a changed `conversation_id` on resume, and other warnings as failures.
2. Judge the call by what agy returned: `status`, a non-empty `structured_output`, and git's view of the worktree, not by the mere presence of stderr text.
3. Add a regression test with this exact stderr line and a good report.

## Acceptance

- A call whose only stderr is the idle notice, with a valid report and a clean worktree, is `ok` and keeps its provider.
- The fallback to native still happens for the failure shapes the spikes found.

## Environment

Claude Code 2.1.295, Aether plugin 0.4.0 running a 0.5.0 plan, agy 1.3.2, Linux (WSL2).
