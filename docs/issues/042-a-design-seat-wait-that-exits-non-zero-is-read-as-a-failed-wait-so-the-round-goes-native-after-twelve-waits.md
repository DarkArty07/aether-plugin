# A design seat wait that reports a non-zero exit is read as a failed wait, so the round goes native after twelve waits

**Type:** bug (design; design seats)
**Date:** 2026-10-21
**Found in:** the design run `wf_17e65d33-e4f` of spec 010, in the Lead's session 7c77db6f
**Status:** fixed in 0.14.5 (2026-10-21), branch `fix/external-seats`, decision [A70](../decisions.md)
**GitHub:** none yet. This file is the local record.

## What happened

The record of the run listed five rounds as «the seat round did not finish after 12 waits of 540 s, and was stopped», although each had a `result.json` written within a minute: the Judge rounds that ended `no-external` (exit 3) and the Examiner's, which Argon refused for quota (exit 4). The ops agent had run `aether-lane seat-wait` and returned `exitCode: 3` for it, the round's own exit, which is the field the JSON carries; the bin's process exits 0. `ops()` of `workflows/design.workflow.js` turns a non-zero exit into an error unless the call passes `anyExit`, and `awaitSeat` did not, so the first wait, which held the answer, was thrown away, the next eleven did the same, and the round was stopped and handed to the native agent with a note that did not say why.

Two effects. Every round that did not answer cost twelve Haiku calls. And a round that failed (exit 4) never reached the retry added in [issue 040](040-a-design-seat-that-fails-goes-to-the-native-agent-without-trying-the-next-pair.md), which reads the exit of the reply: the next-pair rule worked in the tests, whose stubs returned the process exit 0, and not in a real run (the first Writer, refused by Argon, went to the native Writer with Grok and Muse still ranked).

## Fix

`awaitSeat` passes `anyExit: true` to the wait: the JSON the wait prints says whether the round is done and how it ended, and the process exit counts for nothing. `tests/workflow-design.test.js` has a case in which the ops agent reports the round's exit: it fails on the old code (60 waits, where each of the five rounds is read once) and passes on the new.

## Impact

With the installed plugin's mod answering the ops commands itself, the exit comes out 0 and the fault does not show; it shows when the ops agent runs the command (a `binDir` the mod does not read, or any form it does not know). The fault hid in the run that built the design of spec 010: the Judge's rounds went native for the right reason (no external pair reached the points: Argon was dry and Muse had written the document) but at twelve waits each.
