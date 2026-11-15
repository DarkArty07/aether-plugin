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
| `code` | `terminalbench-4-0` score multiplied by 100; if the eval is absent, `terminalBench40` multiplied by 100 | 2 decimals |
| `codeCostPerTaskUsd` | `costPerTask` of the `terminalbench-4-0` eval on the page | 3 decimals |
| `codeMinutesPerTask` | `timePerTask` of the `terminalbench-4-0` eval on the page (`seconds` divided by 60) | 1 decimal |
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

The website overview, charts and leaderboards present comparison views and metadata that individual model pages do not provide or that vary over time:

- The chart of cost against intelligence, which plots models across both dimensions.
- Aggregate leaderboards and rankings across multiple benchmarks.
- Context window sizes, total and active parameter counts, knowledge cutoff dates, licenses, open weights flags, and the Openness Index breakdown.
- Detailed reasoning token breakdowns and full benchmark suite results not captured on single model pages.

The most critical figure for model selection remains output tokens per task and cost per task. A price per million tokens only translates to cost when combined with the tokens spent on a task. Models with comparable intelligence can spend vastly different amounts of tokens, which is why per-task cost figures are essential for the Pareto ladder.

## What the terms of use allow

The [Terms of Use](https://artificialanalysis.ai/terms-of-use) were reviewed on 2026-10-26 (this is a reading and not legal advice):

- Section 2.1 licenses the site "solely for your own personal, noncommercial use".
- Section 3.3 (b)(vi) forbids "automated searches, requests, or queries to (or to strip, scrape, or mine data from) the Site".
- Section 2.2 (d) says "no part of the Site may be copied, reproduced, distributed, republished, downloaded, displayed".

Because section 3.3 (b)(vi) prohibits automated queries and scraping, Aether performs no automated polling or background scraping. Instead, reading model pages is triggered strictly at the owner's explicit request: the owner directed «leeremos la pagina directamente», so `scripts/aa-pages.js read` runs only on demand, throttled with pauses between requests. The captured figures are preserved in a tracked snapshot file so that table updates run completely offline without contacting the network.

The cost per task of `plugins/aether/config/pairs.json` was copied by hand from the model pages on 2026-10-19; whether that is allowed is open in [issue 97](https://github.com/DarkArty07/aether-plugin/issues/97).

## Where each figure lives

- `plugins/aether/config/models/aa-pages.json`: the snapshot holding the extracted figures for each model page slug, with each figure stamped with the date it was observed (`on`) and the entry with its latest read date (`readOn`).
- `scripts/aa-pages.js`: the single page reader. Its `read` subcommand fetches model pages on demand and writes the snapshot, while its `extract` subcommand extracts figures from cached or provided HTML.
- `scripts/refresh-lanes.js`: reads the snapshot `aa-pages.json` without network access and patches `config/pairs.json` with the intelligence, cost per task and code figures of every row with a page in one run; it displays the recalculated ladder and does not save it.
- `scripts/build-models-index.js`: rebuilds `plugins/aether/config/models/models.json` from the snapshot and harness listings without network access.
- `plugins/aether/config/models/models.json`: keeps, for each model in use and each effort its harness takes: intelligence, the coding index when there is one, Terminal-Bench v4, input and output prices, tokens per second, and time to first token.
- `plugins/aether/config/pairs.json` and `plugins/aether/config/lanes.json`: keep the intelligence of each pair, and `pairs.json` the cost per task and code figures.
- [Artificial Analysis comparison, 2026-10-26](../models/artificial-analysis-2026-10-26.md): holds historical figures captured on 2026-10-26 for the 28 models of the owner's chart, as a document and not as data the plugin reads.
