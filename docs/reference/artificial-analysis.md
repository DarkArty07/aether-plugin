---
title: Artificial Analysis data
description: What Aether can take from Artificial Analysis field by field, what the website shows that the free API does not, what the terms of use allow, and where each figure lives in the plugin
order: 21
---

# Artificial Analysis data

Aether picks models and efforts with the figures of [Artificial Analysis](https://artificialanalysis.ai) (AA), who measure them and are the source of every quality, price and speed figure it keeps. This page says what those figures are, which ones Aether reads, which ones the website shows and the free API does not, and what the terms of use leave open. Checked on 2026-10-26.

## The free API

`GET https://artificialanalysis.ai/api/v2/data/llms/models`, with the key in the `x-api-key` header. AA documents 1,000 requests a day for the free tier. The answer has `status`, `prompt_options` (`parallel_queries: 1`, `prompt_length: 1000`: the speed and latency are measured with one query at a time and a prompt of about 1,000 tokens) and `data`, one entry for each model. On the day it was checked: 709 models, released from 2022-11-30 to 2026-10-23, 326 of them since 2026-01-01.

Each entry has these fields:

- **Identity:** `id`, `name`, `slug`, `release_date` and `model_creator` (`id`, `name`, `slug`).
- **Evaluations, 18 fields.** The intelligence, coding and math indices go from 0 to 100, and the 15 benchmarks from 0 to 1. `null` means AA has no score for that model, and most models lack several. Models with a value, out of 709: `artificial_analysis_intelligence_index` 698, `hle` 670, `gpqa` 617, `lcr` 581, `ifbench` 451, `tau2` 440, `terminalbench_hard` 432, `mmlu_pro` 349, `livecodebench` 343, `aime_25` 270, `artificial_analysis_math_index` 270, `artificial_analysis_coding_index` 258, `terminalbench_v2_1` 242, `scicode` 237, `terminalbench_v4_0` 226, `tau_banking` 209, `math_500` 202, `aime` 194. Opus 5.5 has no coding index.
- **Price,** in US dollars per million tokens: `price_1m_input_tokens`, `price_1m_output_tokens` and `price_1m_blended_3_to_1` (three input tokens for each output token).
- **Speed:** `median_output_tokens_per_second`.
- **Latency:** `median_time_to_first_token_seconds` and `median_time_to_first_answer_token` (the second counts the reasoning before the first token of the answer, so a model that thinks long has a large one).

A `0` in speed or latency means AA has no measurement: 544 of the 709 entries have it, among them `muse-wonder-full` and `claude-fable-5` on the day it was checked. Read a `0` as missing, never as instant.

**Efforts.** Each effort of a model is an entry of its own, with its own slug: `claude-opus-5-5-high`, `claude-opus-5-5-xhigh`. The slug with no effort is the highest one AA measured: `Max` for the Claude models, `Xhigh` for `grok-4-7`, `High` for `gemini-4-argon`. A Claude entry's name also says `Default Fallback` (or the model it falls back to): that is part of the name, not another field. The index of the models in use ([models](../models/README.md)) joins the efforts of a model and keeps those its harness takes.

## What the website shows and the free API does not

The page of a model on the website, and the chart of cost against intelligence, draw on about 96 fields for each model. The free API has none of these:

- **Cost per task** of running the Intelligence Index, with its split into input, cache and output; **time per task**; **output tokens per task**, with the reasoning and the answer apart; the token counts of the whole index run.
- The context window, the parameters (total and active), the knowledge cutoff, the license and whether the weights are open, and the Openness Index with its parts.
- The end-to-end response time, and the time to first answer token split into input and reasoning.
- Benchmarks the API does not return, among them GDPval, Omniscience, APEX-Agents, CritPt, MMMU-Pro and the AA-Briefcase, and the Elo of its 3D and personality benchmarks.

The one that matters most for choosing is the output tokens per task. A price per million tokens becomes a cost only with the tokens a model spends on a task, and models of the same intelligence spend very different amounts: that is why the chart of cost against intelligence spreads them so far apart. The free API gives the price and not the tokens, so it cannot say what a task costs.

## What the terms of use allow

I read the [Terms of Use](https://artificialanalysis.ai/terms-of-use) on 2026-10-26; this is a reading and not legal advice.

- Section 2.1 licenses the site "solely for your own personal, noncommercial use".
- Section 3.3 (b)(vi) forbids "automated searches, requests, or queries to (or to strip, scrape, or mine data from) the Site".
- Section 2.2 (d) says "no part of the Site may be copied, reproduced, distributed, republished, downloaded, displayed".

So no script of this repository reads the website, and the plugin keeps none of its per-task figures in a file it generates. One exception, made at the owner's request: the comparison linked below holds the website's figures for the 28 models of the owner's chart, captured once on 2026-10-26 as a document. The free API is the supported way to get data: AA asks to credit artificialanalysis.ai, not to put the key in client code and to cache the answers. The Data Platform Terms that the API documentation says also apply (a PDF, `ProDataPlatformTerms.pdf` on `artificialanalysiscdn.com`) could not be read when this was written, so what the free API allows about keeping its figures inside a distributed plugin is not verified. AA's commercial API, whose documentation is only for partners, is the legitimate source of the per-task figures.

The cost per task of `plugins/aether/config/pairs.json` was copied by hand from the model pages on 2026-10-19; whether that is allowed is open in [issue 97](https://github.com/DarkArty07/aether-plugin/issues/97).

## Where each figure lives

- `scripts/refresh-lanes.js` and `scripts/build-models-index.js` are the only code that asks the API. The key comes from `ARTIFICIAL_ANALYSIS_API_KEY` or from the `.env` of the data directory, and is never printed.
- `plugins/aether/config/models/models.json` keeps, for each model in use and each effort its harness takes: intelligence, the coding index when there is one, Terminal-Bench v4, the two prices, tokens per second and time to first token.
- `plugins/aether/config/pairs.json` and `plugins/aether/config/lanes.json` keep the intelligence of each pair, and `pairs.json` the cost per task (see above).
- [Artificial Analysis comparison, 2026-10-26](../models/artificial-analysis-2026-10-26.md) holds the figures of the API and of the website, among them the cost, tokens and time per task, for the 28 models of the owner's chart, as a document and not as data the plugin reads.
- Not kept anywhere: the other 15 evaluations (the math index and the benchmarks but Terminal-Bench v4), the blended price and the time to first answer token.
