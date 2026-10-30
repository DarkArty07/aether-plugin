---
name: new-harness
description: Use when a new harness (an external coding CLI such as Codex, Muse or Grok) is to be added to Aether, or when the models, tiers or quota of one already in are to be redone. Gives the order of the choices (list, compare with the native tiers, leave out, cost, quota, isolation, real calls, lists to touch) that Codex followed so the mistakes of Muse do not repeat.
---

# New harness

The owner's rule (2026-10-29, spec 022): «así como escogiste todas estas opciones ASÍ TIENES QUE ESCOGER siempre que hagamos un harness nuevo, que no vuelva a pasar lo de Muse». Do the steps in this order, write each result in `specs/NNN-<harness>/evidence/` with its date and source, and bring the owner the table of step 4 before you build.

## What went wrong with Muse (issue #108, A96)

- It used 2 of the 4 models the CLI listed, and few of their efforts: the listing was captured once, on the day, and never again.
- No pair existed below `high` for Wonder Full or below `xhigh` for Spark, so a Haiku-level call had no cheap Muse pair to land on.
- Its balance came from a call made hours earlier (85 % used against 94 % real). The CLI has no free reading and the adapter pretended it had.
- Pairs had no cost per task, so they sort after every pair with one, and Spark never won until its costs were estimated.
- Its models entered one by one, each by an `ownerDecision`, as the owner noticed the gaps.

## The steps

1. **List everything the CLI gives to the owner's account.** Every model and every effort, from the CLI itself (`harness-models.json` says which command per harness; Codex: the `models` of `~/.codex/models_cache.json`), not from docs or memory. Note hidden models, plan limits and the CLI version. Capture it into `harness-models.json` with the day.
2. **Read Artificial Analysis once, the same day, for every listed model at every effort** (`artificial-analysis` skill, `aa-api.js`). Never set a new row against `pairs.json` or `lanes.json` without checking their date: AA re-scored almost every model between 2026-10-26 and 2026-10-29. If the scales differ, say so, keep the new rows on their own dated figures, and bring the owner the measured size of the refresh.
3. **Decide what stays out, and write why.** Only the newest generation of each line; no hidden or internal models; no effort AA does not measure; and the **top tier waits for its next generation** when a much cheaper model reaches nearly the same points (Fable 5.1, GPT-6 Astra: the owner's rule, in the `artificial-analysis` skill). Every exclusion goes to `excluded` with the reason, the owner's words and the model whose release reopens it. Every other listed model enters, at every effort AA measures: leaving a model out because nobody asked for it is Muse's mistake. Ask the owner only about the top tier and about a model AA cannot place.
4. **Map the tiers before you build.** Take the steps of `config/ladder.json` (today Haiku high with xhigh as its correction, Sonnet high, Opus high) and, for each, the pair of the new harness that the rule of `lib/superdelegation.js` would pick: the asked points minus 1, then the cheapest in the quota. Show intelligence **and** Terminal-Bench 4.0 side by side with the native tier's, because the rule reads only intelligence and a pair can pass on points and still code worse (Terra low passes Haiku high at 29.2, and codes 15 % against 21.7 %). Say which model is a tier of its own and which is not a starting step (Luna max is 1.8 points and 9 code points below Haiku high). The owner approves this table.
5. **Get a cost per task for every pair.** The API does not give it; the owner's AA chart does, and the model pages do, but a program reads those only with the owner's yes (the terms are in `docs/reference/artificial-analysis.md`). Until then estimate with the curve method of A96 and mark every estimate in its row. A pair with no cost never wins.
6. **Look for a free, live reading of the quota before you accept anything else.** Order: a command or protocol method that reads the balance without a model (Codex: `account/rateLimits/read` of `codex app-server`), then a log the CLI writes, then, only if there is nothing, the observation of a minimal call (Muse). Read both windows, keep the reset time, never open credentials, and never let a reading older than its life decide. The quota refusal is recognised by a datum of the failure, not by message text.
7. **Keep the owner's personal setup out of the call.** Find the CLI's flags for ignoring user config, rules, hooks, memory and session files, keep its sandbox on, and pass no flag that skips approvals beyond what the call needs. Never read or copy the CLI's credentials, and never use an API key in place of the owner's subscription.
8. **The Lead makes the real calls** (`scripts/lane-smoke.js <harness>`, under a `paid-call` the owner's words cover): at least one per model, one structured answer, the quota read before and after, and a failure if one can be caused. The real event shapes replace every assumed field; write the assumed ones with a comment until then. Record what each call spent.
9. **Touch every list that names the harnesses.** The fixed lists are array literals (or a `Set` of one) assigned in `plugins/aether/lib/**/*.js`, `plugins/aether/hooks/*.mjs` and `scripts/*.js`. `tests/harness-lists.test.js` fails when one of them omits the new harness without a reason. These are all of them:

<!-- lists:start -->
plugins/aether/lib/harness/index.js HARNESS_NAMES
plugins/aether/lib/delegate-calls.js HARNESSES
plugins/aether/lib/router-pick.js DELEGATE_HARNESSES
plugins/aether/lib/router-quota.js EXTERNAL
plugins/aether/lib/router-renewal.js RENEWABLE
plugins/aether/lib/lane-delegate.js ALLOWED_HARNESSES
plugins/aether/lib/lane-pick.js REFRESHABLE — Codex stays out: its reading is free and the adapter takes it, so it has no refresher
plugins/aether/hooks/panel-view.mjs HARNESS_NAMES
scripts/build-models-index.js HARNESSES
scripts/build-models-index.js DEFAULT_HARNESSES
<!-- lists:end -->

   What is not an array literal, and still has to be touched: the `harnesses` option in `plugin.json` and `docs/guide/options.md`, the guides (`lanes`, `ops`, `troubleshooting`, `delegates`, `getting-started`), `docs/models/README.md`, the site, the README, the skills `using-aether` and `swarm`, and `tests/harness-lists.test.js`.
10. **Release.** Four places carry the version (see CLAUDE.md); the merge to `main`, the push, the tag and `claude plugin update` are the owner's.

## The top tier waits for its next generation

The top tier of a line waits for the next generation of that tier while a much cheaper model reaches almost the same points. The examples are Fable 5.1 (A43) and GPT-6 Astra. On the 2026-10-29 figures, Astra max is 56.9 against Sol max 54.5 at five times the price per token. It re-enters with GPT-6.1 Astra and is then measured like any new model. Read the owner's `artificial-analysis` skill too when it is present; it is not part of this repository.

## The scales move

AA re-measured almost every model between 2026-10-26 and 2026-10-29: Haiku high 37.8 to 29.6, Sonnet high 46.8 to 41.1, Opus high 53.6 to 51.7. A new row is not compared with an old one without saying the date. The table of pairs was refreshed on 2026-10-30 (spec 023) and is on one scale, the one of 2026-10-29. When AA moves its scores again, refresh the whole table before adding a row: `node scripts/refresh-lanes.js --write`, then `node scripts/build-models-index.js --write`, then redo the estimated rows (Muse Spark's, with the method of A96), and then run `choose()` over the fifteen asks of Haiku, Sonnet and Opus. The pairs the rule gives move with the scale: the four steps of Codex went from Terra medium, Terra high, Sol medium and Sol max to Terra low, Terra medium, Terra high and Terra max, and the Judge and the Examiner went back to native Opus because Argon fell under their floor. Say so to the owner before the refresh is merged. Read the owner's `artificial-analysis` skill too when it is present.

## Related

`artificial-analysis` (how to read the figures, the traps, the top-tier rule), `docs/models/README.md` (the index and its three rules), `docs/guide/lanes.md`, specs 008 (Muse) and 022 (Codex) as worked examples.
