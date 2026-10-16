# The models index and the guides still say agy does not offer Gemini 4 Argon, while the seats run on it

**Type:** bug (models index, documentation)
**Date:** 2026-10-15
**Found in:** the Argon seat check of the Lead's session e328a606
**Status:** open
**GitHub:** [#25](https://github.com/DarkArty07/aether-plugin/issues/25) (private repository)

## What happened

On 2026-10-15, `agy models` (1.3.6) lists `gemini-4-argon-low`, `gemini-4-argon-medium` and `gemini-4-argon-high`, and the Judge, the Examiner and the Writer seats each ran a round on `gemini-4-argon-high` and answered (exit 0, lane group `gemini`). The plugin's data and text say the opposite in several places:

- `config/models/harness-models.json`: the agy capture is dated 2026-10-13 and has no Argon.
- `config/models/models.json`: Argon is in `notOffered`, with the reason "named by the lane table, and not listed by agy models"; its availability says `agy models` does not list it on the owner's plan (Pro), and its caveat says it is not offered on agy yet. The same text is in `profiles.json`.
- `config/lanes.json`: the note says the agy name and the quota group are not verified yet.
- `docs/guide/design-seats.md`: "On agy it needs Google AI Ultra. Its agy name and its quota group are not verified yet". `docs/guide/options.md` (line 43) says Google AI Ultra.
- `docs/evaluations/seats/README.md`: "Not yet measured … its name in agy and its quota group are not verified yet either".

The session's own rule, "only a model its harness's own CLI lists is used", is now met, but the index the Lead reads before it names a model still says it is not offered.

## Acceptance

The agy listing is captured again, the index is generated from it (the steps of `docs/models/README.md`) with Argon among the models in use, and the guides and notes above say what is verified: the name, the level mapping and the group `gemini`, and what is not (a measurement against the native Judge).

## Impact

- A Lead that reads `models.json` as the rule says concludes that Argon is not offered, and that the seats are native, when they are not.
- The guide tells the owner a plan that the check ran on is not enough.

## Proposals

- Capture `agy models` into `harness-models.json` and regenerate `models.json` and `profiles.json`.
- Edit the guide text in the same change, so the docs-facts test keeps them in step.

Related: issue 016, issue 018.
