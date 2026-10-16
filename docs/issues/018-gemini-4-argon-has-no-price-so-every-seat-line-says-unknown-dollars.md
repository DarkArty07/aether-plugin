# Gemini 4 Argon has no entry in prices.json, so every Argon seat line says `$?` and its spend is never recorded

**Type:** bug (prices, lane records)
**Date:** 2026-10-15
**Found in:** the Argon seat check of the Lead's session e328a606, after agy 1.3.6 began to offer the model
**Status:** fixed in PR #27, not released yet. `config/prices.json` has `gemini-4-argon` at OpenRouter's rates (2 input, 10 output, 0.1 cache read, 0.1875 cache write, per million tokens), and `tests/prices.test.js` covers its id and a priced seat line. Google's pricing page doubles the rates from 2026-12-01 and the file holds one set: change the entry then.
**GitHub:** [#24](https://github.com/DarkArty07/aether-plugin/issues/24) (private repository)

## What happened

`config/prices.json` lists `opus`, `sonnet`, `haiku` and `gemini-3.8-flash`, and no Gemini 4 Argon. `priceEntry` therefore returns `null` for `gemini-4-argon-high`, while the same call prices the other agy models (1 000 000 input and 100 000 output tokens: `gemini-3.8-flash-high` 1.125, `claude-opus-5-5-high` 6, `gemini-4-argon-high` null).

The six rounds of the check (three Judge rounds of the seats harness, then a Judge, an Examiner and a Writer through `seat-start`) all ended with no dollars: the harness recorded `usd: null` for its three, and the lane lines of the other three say `$? at list price`, for 64 198, 194 941 and 277 841 tokens.

## Acceptance

A seat round on Argon ends with a lane line that gives dollars at list price, from an entry in `config/prices.json` with its source.

## Impact

- The owner's yardstick is cost at list prices, and the Argon seats have none: Asequible cannot be judged for a design that runs on Argon.
- In an autonomous run, a `$?` line records nothing with `aether-autonomy spend`, so the run's ceiling does not see the Argon rounds.
- The Examiner round of the check used 194 941 tokens and the Writer round 277 841 for a three-task project, which makes the missing price matter.

## Proposals

- Add `gemini-4-argon` to `prices.json` with the figures of its profile in `models.json`: 2 input and 10 output per million tokens through 2026-11-30, and, by press reports only, double from 2026-12-01. The cache prices are not on the pages read.
- Add its source next to the others, and let `tests/prices.test.js` cover the id.

Related: issue 019.
