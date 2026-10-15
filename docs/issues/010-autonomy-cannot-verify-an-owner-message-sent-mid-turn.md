# 010: aether-autonomy cannot verify an owner's message sent mid-turn

- **Date:** 2026-10-15
- **Found by:** the Lead in session 777d41c2, while preparing spec 005.
- **Status:** open (test phase: recorded, not fixed).

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

## Expected

A message the owner sends mid-turn counts as the owner's words, for `aether-autonomy start` and for `grant`.

## Impact

The most natural way to grant a run cannot start one: typing «I'm going to sleep, work on your own» while the Lead is busy. The Lead has to keep a manual diary and count the ceilings by hand.

## Workaround used

- A manual diary at `.aether/autonomy/manual-20261015/diary.md`.
- The default ceilings, counted by hand.
- No irreversible action without the owner's yes.

## Fix idea (not done)

`lib/voice.js` reads `queued_command` attachments as owner messages too, with their text and timestamp.
