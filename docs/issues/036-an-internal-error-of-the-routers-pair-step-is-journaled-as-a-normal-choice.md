# An internal error of the router's pair step is journaled as a normal choice

**Type:** bug (delegate router)
**Date:** 2026-10-21
**Found in:** the review of `lib/router-pick.js` made in the Lead's session 7c77db6f; the code was read, not run in a session
**Status:** fixed in 0.14.3 (2026-10-21), branch `fix/delegate-time-limits`, decision [A68](../decisions.md): the pair step's failure is journaled as `internal: …`
**GitHub:** none yet. This file is the local record.

## What happened

`pairStep` (`lib/router-pick.js`) never throws: when something inside it throws, it returns `{ pick: null, quota: null, reason: <the error's message> }`. `lib/route.js` stores that reason as the decision's `choice`, so the journal shows the raw message of an exception where a choice would be, with `quota: null` and no `fallback`. `docs/guide/router.md` says the opposite: an internal error «writes a decision entry whose fallback reads `internal: …`, so the report counts it and you can see that the router is broken».

## Acceptance

- When `pairStep` fails, the decision entry has `fallback: "internal: <message>"` and no `choice`; the call runs on the Claude rung the router decided; `aether-report --delegates` counts it as a fallback.
- A decision that simply has no pair for the task keeps saying why in `choice`, as today.
- Tests for both.

## Impact

A broken router looks like a router that chose Claude, so the failure the owner asked to watch for («el router deja un error interno») cannot be told from a normal decision.
