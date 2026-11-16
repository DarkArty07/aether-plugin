---
title: Artificial Analysis data
description: What Aether takes from Artificial Analysis model pages field by field, what the website shows that pages do not, what the terms of use allow, and where each figure lives in the plugin
order: 21
---

# Artificial Analysis data

Aether picks models and efforts with the figures of [Artificial Analysis](https://artificialanalysis.ai) (AA), who measure them and are the source of every quality, price and speed figure it keeps. This page says what those figures are, which ones Aether takes from model pages field by field, what the website shows that pages do not, what the terms of use allow, and where each figure lives in the plugin. Checked on 2026-10-26 and 2026-11-14.

## Figures taken from model pages

Aether reads model pages directly from the website without an API key. Each page provides quality, price and speed measurements for a model or a model effort. The reader extracts the following figures:

| Figure | Source on page | Rounding |
|---|---|---|
| `intelligence` | `intelligenceIndex` | 1 decimal |
| `costPerTaskUsd` | `intelligenceIndexCostPerTask.cost.total` | 3 decimals |
| `terminalBench` | score of `terminalbench-4-0` (fraction); otherwise `terminalBench40` | 3 decimals |
| `briefcaseElo` | `briefcaseBreakdown.overall.elo` | 0 decimals |
| `briefcaseRubricPassRate` | `briefcaseBreakdown.rubricPassRate` | 3 decimals |
| `hallucinationRate` | `omniscienceHallucinationRate` | 3 decimals |
| `timePerTaskSeconds` | `intelligenceIndexTimePerTask` | 0 decimals |
| `priceInput` | `price1mInputTokens` | 4 decimals |
| `priceOutput` | `price1mOutputTokens` | 4 decimals |
| `cacheReadPrice` | `cacheHitPrice` | 4 decimals |
| `outputTokensPerSecond` | `medianOutputSpeed`; otherwise `headline.outputSpeed` | 1 decimal |
| `timeToFirstTokenS` | `medianTimeToFirstAnswerToken`; otherwise `headline.timeToFirstAnswerToken` | 2 decimals |

**Efforts.** Each effort of a model is an entry of its own, with its own slug: for example, `claude-opus-5-5-high` or `claude-opus-5-5-xhigh`. The slug with no effort is the highest one AA measured: `Max` for Claude models, `Xhigh` for `grok-4-7`, `High` for `gemini-4-argon`. The index of the models in use ([models](../models/README.md)) joins the efforts of a model and keeps those its harness takes.

**Page changes of 2026-11-14.** On that date, model pages no longer included the `terminalbench-4-0` eval object with `costPerTask` and `timePerTask`, nor `briefcaseBreakdown.rubricPassRate`. They report Terminal-Bench 4.0 as `terminalBench40` and speeds in `headline`. When a page omits these fields, the snapshot keeps them absent (or preserves their previous values) and records them under missing fields.

## What the website shows and pages do not

The chart page of 2026-10-26, captured in [the comparison](../models/artificial-analysis-2026-10-26.md), shows the following, and the evidence file of the 13 model pages read on 2026-11-13 (`specs/038-aa-pages-hydrogen/evidence/aa-extract-2026-11-13.json`) has no field for them:

- The parameters of each model, total and active, where the maker discloses them.
- The weights classification and the Openness Index (given for 10 of the 28 models of the chart).
- The knowledge cutoff (given for 1 of the 28).

The same chart shows the reasoning part of the output tokens per task. The field of the pages for it, `reasoningTokens`, was empty on all 13 pages.

The 13 pages also carry fields that Aether does not read (not read by Aether): the context window (`contextWindowTokens`, on all 13), the output tokens of each eval (`outputTokens`, on 12 of the 13 pages), the six sector scores (`financeAndAccounting`, `strategyAndOps`, `legal`, `healthcareAndMedical`, `engineering` and `economics`), the evals other than `terminalbench-4-0` (for example `hle-diamond`, `critpt-v2-hard` and `gdp-pdf`), the cache write price, the discount on cache hits and the blended price (`cacheWritePrice`, `cacheHitDiscountPercent`, `price1mBlended7To2To1`), and the total cost of the briefcase with its parts `analyticalQuality` and `presentation`.

Empty on those 13 pages: `reasoningTokens`, `medianOutputSpeed`, `medianTimeToFirstChunk`, `medianTimeToFirstAnswerToken` and `medianEndToEndResponseTime`. For the speed and the first token the reader falls back to `headline` when the field is empty; the evidence file does not keep `headline`.

Aether takes the cost per task and not the output tokens per task. A price per million tokens only becomes a cost with the tokens a task spends, and models of similar intelligence can spend very different amounts of tokens, which is why the Pareto ladder uses the cost per task.

## What the terms of use allow

The [Terms of Use](https://artificialanalysis.ai/terms-of-use) were reviewed on 2026-10-26 (this is a reading and not legal advice):

- Section 2.1 licenses the site "solely for your own personal, noncommercial use".
- Section 3.3 (b)(vi) forbids "automated searches, requests, or queries to (or to strip, scrape, or mine data from) the Site".
- Section 2.2 (d) says "no part of the Site may be copied, reproduced, distributed, republished, downloaded, displayed".

Because section 3.3 (b)(vi) prohibits automated queries and scraping, Aether performs no automated polling or background scraping. Instead, reading model pages is triggered strictly at the owner's explicit request: the owner directed «leeremos la pagina directamente», so `scripts/aa-pages.js read` runs only on demand, throttled with pauses between requests. The captured figures are preserved in a tracked snapshot file so that table updates run completely offline without contacting the network.

`plugins/aether/config/pairs.json` is rebuilt from the snapshot `plugins/aether/config/models/aa-pages.json` rather than copied by hand; whether keeping those figures in the repository is allowed is open in [issue 97](https://github.com/DarkArty07/aether-plugin/issues/97).

## Where each figure lives

- `plugins/aether/config/models/aa-pages.json`: the snapshot holding the extracted figures for each model page slug, with each figure stamped with the date it was observed (`on`) and the entry with its latest read date (`readOn`).
- `scripts/aa-pages.js`: the single page reader. `node scripts/aa-pages.js read` fetches the model pages on the owner's request, one request per page with a pause of 1.5 seconds between requests, and writes the snapshot. It reads the page slugs given on the command line or, when none is given, the slugs of `config/pairs.json`; with no slug given, `--harness <name>` keeps the rows of that harness and the Claude rows; `--pairs <file>` names another table to read the slugs from; `--snapshot <file>` the snapshot it merges into and writes; `--cache <dir>` a folder of saved pages, where a page already saved is read with no request and a page read from the network is saved (by default, a folder under the system temp directory). It stops at the first 403 or 429 answer and writes nothing.
- `scripts/refresh-lanes.js`: reads the snapshot `aa-pages.json` without network access and patches `config/pairs.json` with the intelligence and cost per task of every row with a page in one run; it displays the recalculated ladder and does not save it.
- `scripts/build-models-index.js`: rebuilds `plugins/aether/config/models/models.json` from the snapshot and harness listings without network access.
- `plugins/aether/config/models/models.json`: keeps, for each model in use and each effort its harness takes: intelligence, Terminal-Bench v4, input and output prices, tokens per second, and time to first token.
- `plugins/aether/config/pairs.json` and `plugins/aether/config/lanes.json`: keep the intelligence of each pair, and `pairs.json` the cost per task. Terminal-Bench in the snapshot is information that nothing requires and nothing chooses with (A127).
- [Artificial Analysis comparison, 2026-10-26](../models/artificial-analysis-2026-10-26.md): holds historical figures captured on 2026-10-26 for the 28 models of the owner's chart, as a document and not as data the plugin reads.
