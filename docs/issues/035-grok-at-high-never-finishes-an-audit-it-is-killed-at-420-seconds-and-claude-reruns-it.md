# Grok 4.7 at high never finishes an audit: it is killed at 420 seconds and Claude reruns it

**Type:** bug (design; delegate router)
**Date:** 2026-10-21
**Found in:** the first two sessions with 0.14.1 and 0.14.2, watching the router (sessions 7c77db6f and 7cb8acca)
**Status:** fixed in 0.14.3 (2026-10-21), branch `fix/delegate-time-limits`, decision [A68](../decisions.md): the brief bounds the work and a pair that ran out of time is out for 60 minutes
**GitHub:** none yet. This file is the local record.

## What happened

With Argon out of quota, every read-only delegate of level C (an audit: «review this file for defects») was routed to `grok/grok-4.7@high`. Four of four ended the same way: exit 137 at 420 s (the 360 s CLI limit plus the 60 s grace, then the process group is killed), 0 tokens recorded, and the agent reran on Claude Sonnet high for US$ 0.18 to 0.27. Ids: `r-mvhltwwu-3848`, `r-mvhnejd2-1ade`, `r-mvhnel3n-6b00`, `r-mvhnemn9-f248`. The five lookups and explorations of the same session ran fine on Grok 4.7 at `low`, in 12 to 60 s.

Grok's own log shows those three runs were not stuck: they were still working after 12 to 18 inferences and 33 to 42 tool calls, with prompts of up to 106 000 tokens. An audit has no end of its own, and nothing in the delegate's brief bounds it.

## Cause

1. The brief of an external delegate (`delegatePrompt`, `lib/delegate-calls.js`) says nothing about how much work to do, and `lib/harness/grok.js` passes no time limit to the CLI, so the only end is the kill at 420 s, which throws the answer away.
2. A pair that has just run out of time stays a candidate. The router picks it again for the next audit, which loses 7 minutes again before the Claude rerun. Muse, ranked next, never gets the task, because a timeout is not a refusal at the start.

## Acceptance

- The brief of every external delegate bounds the work (a number of tool calls) and asks for the best answer found so far, saying what was not checked.
- A pair whose delegate ran out of time (killed at the limit) is kept out of the router's choice for 60 minutes, so the next delegate of that level goes to the next candidate or to Claude at once. A timeout never counts as a refusal at the start.
- The journal says the outcome timed out and until when the pair is out; the decision's candidate list shows the pair as excluded.
- Documented, with a decision and tests.

## Impact

While Argon is dry, every audit costs 7 minutes of waiting and a Claude rerun on top of the failed external call. Delegation, the D of RADAR, saves nothing there, and speed, the R, loses.
