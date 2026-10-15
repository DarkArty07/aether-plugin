# agy does not offer Gemini 4 Argon, so every external design seat fails and falls back to the native agent

**Type:** bug (design seats, lane models)
**Date:** 2026-10-15
**Found in:** the design of spec 005, in the Lead's session 777d41c2; the same failure appears in session 5ef557b7 (spec 004)
**Status:** open
**GitHub:** [#20](https://github.com/DarkArty07/aether-plugin/issues/20) (private repository)

## What happened

With `seats: balanced`, the Judge and the Examiner seats pick `agy/gemini-4-argon` first. In the lane log of session 5ef557b7 (`lanes/5ef557b7-….jsonl`), six seat calls on `gemini-4-argon-high` failed within 6 to 8 seconds, with the same answer from agy 1.3.5:

```
exit 1: invalid model selection (--model "gemini-4-argon-high" --effort ""): model gemini-4-argon-high is not recognized as a known model or custom model in settings
Available models:
  Gemini 3.8 Flash (High)
  Gemini 3.8 Flash (Medium)
  Gemini 3.8 Flash (Low)
  Claude Opus 5.5 (Low)
  Claude Opus 5.5 (Medium)
  Claude Opus 5.5 (High)
  Claude So…
```

In session 777d41c2, four Judge seat rounds (07:44 to 08:34 UTC) failed with the same answer and ended with exit 4. The Examiner seat found no usable external model and ended with exit 3. Each time, the native agent took the round.

## Acceptance

A seat that names a model the harness does not offer is never tried. `aether-lane quota`, or the seat's choice, reads the harness's list of models, and a seat with no offered model ends with exit 3 and a reason that says so.

## Impact

- With agy, the `balanced` and `robust` seats are native in practice, while the documentation promises a stronger model in each round.
- Each failed attempt costs a few seconds and a log line. It also sets up odd readings like the one in issue 015.

## Proposals

- Check the harness's model list before a seat uses a model.
- Or change `config/lanes.json` to models agy 1.3.5 offers.
- Which model the design seats use is the owner's call.

Related: issue 015.
