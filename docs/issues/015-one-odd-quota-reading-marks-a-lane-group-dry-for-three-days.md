# 015: one odd quota reading marks a lane group dry for three days, and healthy readings do not lift it

- **Date:** 2026-10-15
- **Found by:** the Lead in session 777d41c2, while reading the result of run `20261015-024936-ee31` (spec 005).
- **Status:** open (test phase: recorded, not fixed).

## What happened

Run `20261015-024936-ee31` had agy lanes on, and it made no lane call. Every wave listed both of agy's groups as dry. The Claude group was dry for a real reason: its weekly window was spent until 2026-10-16 04:41 UTC. The Gemini group was dry because of a mark:

```
lanes/marks/agy__gemini.json
{"harness":"agy","group":"gemini","at":1792048957677,"until":1792308122406,"confirmed":true,"resetsAt":"2026-10-18T07:22:02.406Z"}
```

The mark comes from one call in run `20261015-012236-5c85` (session 5ef557b7), logged in `lanes/unknown.jsonl`:

```
"call":"task-1-1-implement","model":"gemini-3.8-flash-high","effort":"xhigh","status":"quota","durationMs":513,
"detail":"exit 1: model not found: gemini-3.8-flash-high",
"quotaAfter":{"windows":{"weekly":{"remaining":0.01,"resetsAt":"2026-10-18T07:22:02.406Z"},"5h":{"remaining":0.9,"resetsAt":"2026-10-09T05:53:31Z"}}}
```

The reading after the call is odd. It shows 1 % weekly with a reset three days later, and its 5-hour window resets six days in the past. The reading taken 100 seconds earlier said 97.8 % weekly and 99.6 % for 5 hours. `judge()` in `lib/lane-calls.js` (about line 421) turned the failure into `quota` because that one reading was under the reserve. `markDry` in `lib/lane-marks.js` then confirmed a mark until the reading's reset.

Every reading since then says the group is healthy: at 09:48 UTC, `aether-lane status` showed 97.4 % weekly and 97.9 % for 5 hours. `liveMark` keeps the mark anyway until its `until`, so the group stays out of every run until 2026-10-18 07:22 UTC.

## Expected

- A call that failed with `model not found` is `failed`, not `quota`.
- A reading whose window resets in the past is not a confirmed reading.
- A later reading that shows the group above the reserve lifts the mark.

## Impact

For three days no Gemini lane runs, for any run or seat, while the plan has 97 % of its weekly quota to spend. In this run the cost was small: the five haiku-tier units ran on native Haiku, and Haiku cost US$ 0.14 for the whole run. On a run with Sonnet-tier work and a healthy Claude group, the same kind of mark would move paid work back to native.

## Workaround

None used. Deleting `lanes/marks/agy__gemini.json` lifts the mark. That is a file outside the run, so it waits for the owner.

## Fix idea (not done)

- `judge()` checks the failure reason before the reading: a model or argument error is `failed`.
- `markDry` refuses a reading with a window whose `resetsAt` is in the past.
- The quota step lifts a live mark when a fresh reading shows every window above the reserve.

Related: issue 016 (agy does not offer Gemini 4 Argon).
