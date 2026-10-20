# aether-autonomy cannot verify an owner's message sent mid-turn

**Type:** bug (autonomy, verifying the owner's words)
**Date:** 2026-10-15
**Found in:** the Lead's session 777d41c2, while preparing spec 005
**Status:** fixed in 0.14.0 (2026-10-20), and seen working: `aether-autonomy start` and `grant` verified the owner's message sent in the middle of a turn that opened the autonomous run of this release.
**Update 2026-10-19, branch `fix/bug-issues`:** fixed: `lib/voice.js` reads an `attachment` record whose `queued_command` has `commandMode: 'prompt'` as an owner message, with its text and timestamp, in transcript order. Other queued commands (task notifications), `queue-operation` records and sidechains stay out — the shapes are the ones of session 777d41c2's own transcript, and `tests/voice.test.js` covers them. `aether-autonomy start` and `grant` verify such a message.
**GitHub:** [#18](https://github.com/DarkArty07/aether-plugin/issues/18) (private repository)

## What happened

The owner typed «… ire a dormir trbaja autonomamente» while the Lead was in a turn. Claude Code delivered the message inside the running turn. In the transcript it appears as an `attachment` of type `queued_command`, plus a `queue-operation` enqueue and remove at 2026-10-15T08:31:44Z. It is not recorded as a `user` message.

`aether-voice` lists only `user` messages. So this command:

```
aether-autonomy start --quote "ire a dormir trbaja autonomamente"
```

answered:

```
{"verified":false,"reason":"the quote is not in the owner's messages of session 777d41c2-c46b-4e00-88a8-0cf950221da2"}
```

## Acceptance

A message the owner sends mid-turn counts as the owner's words, for `aether-autonomy start` and for `grant`.

## Impact

The most natural way to grant a run cannot start one: typing «I'm going to sleep, work on your own» while the Lead is busy. The Lead has to keep a manual diary and count the ceilings by hand.

## Workaround used

- A manual diary at `.aether/autonomy/manual-20261015/diary.md`.
- The default ceilings, counted by hand.
- No irreversible action without the owner's yes.

## Proposals

`lib/voice.js` reads `queued_command` attachments as owner messages too, with their text and timestamp.
