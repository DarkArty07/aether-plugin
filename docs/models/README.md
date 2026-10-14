# Models released since 2026-01

An offline index of the new-generation models Artificial Analysis (AA) lists, with every effort variant of each and the harness models of ours that reach it, so people and scripts look a model up here instead of calling the AA API. The data is [`index.json`](index.json); this page is its reading copy.

## How to refresh

```
node scripts/build-models-index.js --write                   # asks the AA API: ARTIFICIAL_ANALYSIS_API_KEY, or .env in ~/.local/share/aether-plugin
node scripts/build-models-index.js --from raw.json --write   # from a saved answer of the same API, with no network
```

The tables below and `index.json` are rewritten; the text outside the generated part (this intro and the observations) is not, so re-read the observations after a refresh. The harness side is [`harness-models.json`](harness-models.json), a snapshot of what each CLI listed on 2026-10-13: refresh it with `agy models`, `grok models` and `cursor-agent --list-models` (listing commands, no model is called) and, for codex, which has no command that lists models, from the `models` its `~/.codex/models_cache.json` keeps; then run the script. A harness model no family took is listed at the end, so none is lost silently.

## What the index holds

- **A family** is one base model: `family` (its slug), `name`, `creator`, `releaseDate` (the earliest of its variants) and `variants`, one per effort. Only variants released since the `--since` date (default 2026-01-01) are in. Families are newest first and variants go from the least effort to the most.
- **Grouping rule.** A slug ending in `-minimal`, `-low`, `-medium`, `-high`, `-xhigh`, `-max`, `-adaptive`, `-reasoning` or `-non-reasoning` joins the family of the slug without it when its name names that effort in parentheses. A date stamp or any other word stays in the family slug, so `deepseek-v4-flash-0420` and `deepseek-v4-flash` are two families, and `qwen3-7-max` (a tier, not an effort) is its own. When the slug without the suffix is another model's, the variant joins the one entry with its own name (`hy3-non-reasoning` goes with `hy3-preview`, not `hy3`).
- **Effort** is read from AA's own name. The bare slug is the variant AA names in its parentheses, not a "default": `claude-opus-5-5` is `(Max)`, `gemini-3-8-flash` is `(High)`, `gpt-5-5` is `(Xhigh)`; the lane table's `claude-sonnet-5-5-high` scores 46.8 and 0.439, the bare `claude-sonnet-5-5` is the Max variant at 56 and 0.636. `default` is a reasoning model with no level named. `non-reasoning` is AA's non-reasoning build, with its level when it has one (`non-reasoning-high`). `label` keeps AA's parentheses (`Max, Default Fallback`).
- **Available** lists, per family, each harness model (agy, codex, grok, cursor) that reaches it: `model` as the harness names it, `match` (`exact`, `normalized` for dots to dashes and a dropped `-thinking`, `guess` for a rewritten name such as `cursor-grok-4.6` or `claude-4.6-opus`), the `efforts` it takes, `ids` (agy and Cursor put the effort in the id), `listing` (`listed`, `hidden` in codex, `not-listed` when the lane table names a model the CLI does not list), and `inLaneTable` with its `roles`, `levels` and `aaSlug`.
- **Nulls.** `intelligence` and `coding` are AA's indexes, `terminalBench` its `terminalbench_v4_0` score (between 0 and 1). A `null` is "AA gave nothing". A 0 for tokens per second, time to first token or price is AA's way of saying it has no data, so it is `null` here (on the 2026-10-13 snapshot, of 317 variants, 191 have no speed and 67 no price). A terminal-bench of 0 is kept as 0: AA reports it for 38 variants, and a real zero cannot be told from a failed run. Time to first token is AA's median and includes the reasoning, so it grows with effort (Claude Opus 5.5: 2.8 s at low, 480 s at max).

<!-- models-index:start -->
## Families by creator

190 families and 317 variants released since 2026-01-01, generated on 2026-10-13 from https://artificialanalysis.ai/api/v2/data/llms/models; harness models as listed on 2026-10-13. Best intelligence and best terminal-bench name the effort that scored it (the lowest, on a tie). Price and tokens/s are of the best-intelligence variant when it has them, else of the highest effort that does. `*` after a harness: the model is in the lane table.

| AI9Stars (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| G9v3-39A5B `g9v3-39a5b` | 2026-08-20 | default | 21.8 | – | – | – | – |
| G9v3-3B `g9v3-3b` | 2026-07-23 | default | 10.8 | – | – | – | – |

| Alibaba (23) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Qwen3.8 Max (0902) `qwen3-8-max` | 2026-09-02 | default | 45.4 | 0.389 | 2 / 6 | 40 | – |
| Qwen3.8-Flash-Next `qwen3-8-flash-next` | 2026-08-26 | default | 39.8 | 0.253 | 0.15 / 0.47 | 53.1 | – |
| Qwen3.8 27B `qwen3-8-27b` | 2026-08-14 | non-reasoning, low, medium, xhigh | 33.7 (xhigh) | 0.056 (xhigh) | 0.5 / 3 | 46.6 | – |
| Qwen3.8 2.4T A95B `qwen3-8-2-4t-a95b` | 2026-08-12 | default | 39.9 | 0.111 | 2 / 6 | 40.8 | – |
| Qwen3.8 Max `qwen3-8-max-0803` | 2026-08-03 | default | 40.2 | 0.187 | 2 / 6 | – | – |
| Qwen3.7 Plus `qwen3-7-plus` | 2026-06-01 | default | 25.2 | 0.01 | 0.4 / 1.6 | 55.3 | – |
| Qwen3.7 Max `qwen3-7-max` | 2026-05-19 | default | 29.5 | 0.015 | 2.5 / 7.5 | – | – |
| Qwen3.6 27B `qwen3-6-27b` | 2026-04-22 | non-reasoning, default | 21.4 (default) | 0 (default) | 0.6 / 3.6 | – | – |
| Qwen3.6 Max Preview `qwen3-6-max` | 2026-04-20 | default | 28.4 | – | – | – | – |
| Qwen3.6 35B A3B `qwen3-6-35b-a3b` | 2026-04-16 | non-reasoning, default | 18.2 (default) | 0 (default) | 0.375 / 2.25 | 135.1 | – |
| Qwen3.6 Plus `qwen3-6-plus` | 2026-04-02 | default | 27 | – | 0.5 / 3 | – | – |
| Qwen3.5 Omni Flash `qwen3-5-omni-flash` | 2026-03-30 | default | 12.5 | – | 0.1 / 0.8 | 224.6 | – |
| Qwen3.5 Omni Plus `qwen3-5-omni-plus` | 2026-03-30 | default | 20.4 | – | 0.4 / 4.8 | 86.1 | – |
| Qwen3.5 0.8B `qwen3-5-0-8b` | 2026-03-02 | non-reasoning, default | 6.1 (default) | – | – | – | – |
| Qwen3.5 2B `qwen3-5-2b` | 2026-03-02 | non-reasoning, default | 6.9 (default) | – | – | – | – |
| Qwen3.5 4B `qwen3-5-4b` | 2026-03-02 | non-reasoning, default | 13.1 (default) | – | 0.03 / 0.15 | 28.5 | – |
| Qwen3.5 9B `qwen3-5-9b` | 2026-03-02 | non-reasoning, default | 13.3 (non-reasoning) | 0.005 (default) | 0.17 / 0.25 | 96.3 | – |
| Qwen3.5 122B A10B `qwen3-5-122b-a10b` | 2026-02-24 | non-reasoning, default | 17.7 (non-reasoning) | 0 (default) | 0.4 / 3.2 | 147 | – |
| Qwen3.5 27B `qwen3-5-27b` | 2026-02-24 | non-reasoning, default | 22.9 (default) | – | 0.3 / 2.4 | – | – |
| Qwen3.5 35B A3B `qwen3-5-35b-a3b` | 2026-02-24 | non-reasoning, default | 19.3 (default) | – | 0.25 / 2 | – | – |
| Qwen3.5 397B A17B `qwen3-5-397b-a17b` | 2026-02-16 | non-reasoning, default | 21.4 (non-reasoning) | 0 (default) | 0.6 / 3.6 | 57.1 | – |
| Qwen3 Coder Next `qwen3-coder-next` | 2026-02-03 | default | 9.2 | 0 | 0.5 / 1.2 | 77.2 | – |
| Qwen3 Max Thinking `qwen3-max-thinking` | 2026-01-26 | default | 21.3 | – | – | – | – |

| Allen Institute for AI (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Olmo 3.1 32B Instruct `olmo-3-1-32b-instruct` | 2026-01-13 | default | 6.5 | – | – | – | – |

| Anthropic (11) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Claude Haiku 5.5 `claude-haiku-5-5` | 2026-10-07 | low, medium, high, xhigh, max | 43.4 (max) | 0.328 (max) | 0.1 / 0.5 | 239.3 | cursor |
| Claude Sonnet 5.5 `claude-sonnet-5-5` | 2026-09-28 | low, medium, high, xhigh, max | 56 (max) | 0.636 (max) | 2 / 10 | 133.1 | agy*, cursor |
| Claude Opus 5.5 `claude-opus-5-5` | 2026-09-22 | low, medium, high, xhigh, max | 57.6 (max) | 0.596 (xhigh) | 4 / 20 | 96.4 | agy*, cursor |
| Claude Fable 5.1 `claude-fable-5-1` | 2026-09-01 | low, medium, high, xhigh, max | 53.4 (max) | 0.551 (xhigh) | 10 / 50 | 65.1 | cursor |
| Claude Opus 5 `claude-opus-5` | 2026-07-24 | low, medium, high, xhigh, max | 50.8 (max) | 0.49 (max) | 5 / 25 | – | cursor |
| Claude Sonnet 5 `claude-sonnet-5` | 2026-06-30 | non-reasoning-high, low, medium, high, xhigh, max | 38.2 (max) | 0.141 (max) | 2 / 10 | – | cursor |
| Claude Fable 5 `claude-fable-5` | 2026-06-09 | max | 49.6 | 0.424 | 10 / 50 | – | cursor |
| Claude Opus 4.8 `claude-opus-4-8` | 2026-05-28 | max | 41.8 | 0.217 | 5 / 25 | – | cursor |
| Claude Opus 4.7 `claude-opus-4-7` | 2026-04-16 | non-reasoning-high, max | 40.7 (max) | – | 5 / 25 | – | cursor |
| Claude Sonnet 4.6 `claude-sonnet-4-6` | 2026-02-17 | non-reasoning-low, non-reasoning-high, max | 30.1 (max) | 0.03 (max) | 3 / 15 | – | cursor |
| Claude Opus 4.6 `claude-opus-4-6` | 2026-02-05 | non-reasoning-high, max | 31.9 (max) | – | 5 / 25 | – | cursor |

| Apodex (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Apodex 1.1 `apodex-1-1` | 2026-08-30 | default | 26.4 | 0 | 0.3 / 3 | – | – |

| Arcee AI (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Trinity Large Thinking `trinity-large-thinking` | 2026-04-01 | default | 10.8 | 0.005 | 0.25 / 0.8 | 367 | – |

| Celeris (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Celeris-1 `celeris-1` | 2026-07-24 | default | 6.3 | 0 | 0.2 / 0.7 | 1777.8 | – |

| China Mobile (3) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| JT-4.1 Flash 236B A21B `jt-4-1-flash-236b-a21b` | 2026-07-09 | non-reasoning, default | 33.9 (default) | 0.03 (default) | – | – | – |
| JT-35B-Flash `jt-35b-flash` | 2026-05-14 | default | 18.7 | – | – | – | – |
| JT-MINI `jt-mini` | 2026-04-15 | default | 12.2 | – | – | – | – |

| Cohere (3) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| North Mini Code `north-mini-code` | 2026-06-09 | default | 9.9 | 0.005 | – | 86.4 | – |
| Command A+ `command-a-plus` | 2026-05-20 | default | 13.1 | 0.005 | – | 186.6 | – |
| Tiny Aya Global `tiny-aya-global` | 2026-02-17 | default | 4.8 | – | – | 130.9 | – |

| DeepSeek (6) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| DeepSeek V4.1 Flash `deepseek-v4-1-flash` | 2026-09-10 | non-reasoning, max | 39.5 (max) | 0.268 (max) | 0.3 / 1.2 | 183.6 | – |
| DeepSeek V4 Flash Vision `deepseek-v4-flash-vision` | 2026-08-21 | max | 34.8 | 0.121 | 0.44 / 1.32 | 172.7 | – |
| DeepSeek V4 Pro 0813 `deepseek-v4-pro` | 2026-08-13 | non-reasoning, max | 36 (max) | 0.141 (max) | 1.32 / 3.96 | 95.2 | – |
| DeepSeek V4 Flash 0731 `deepseek-v4-flash` | 2026-07-31 | max | 34.3 | 0.121 | 0.44 / 1.32 | – | – |
| DeepSeek V4 Flash 0420 `deepseek-v4-flash-0420` | 2026-04-24 | non-reasoning, high, max | 24.4 (high) | 0.03 (high) | 0.112 / 0.234 | – | – |
| DeepSeek V4 Pro 0424 `deepseek-v4-pro-0424` | 2026-04-24 | non-reasoning, high, max | 30.4 (max) | 0.146 (max) | 0.435 / 0.87 | – | – |

| Google (15) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Gemini 4 Argon `gemini-4-argon` | 2026-09-30 | high | 52.6 | 0.571 | 2 / 10 | – | agy*, cursor |
| Gemini 3.8 Flash `gemini-3-8-flash` | 2026-09-02 | low, medium, high | 40.9 (high) | 0.197 (medium) | 0.75 / 3.75 | 137.9 | agy*, cursor |
| Gemini 3.7 Flash `gemini-3-7-flash` | 2026-08-13 | low, medium, high | 39.6 (medium) | 0.136 (high) | 0.75 / 3.75 | – | cursor |
| Gemini 3.5 Flash-Lite `gemini-3-5-flash-lite` | 2026-07-21 | default | 22.2 | 0.01 | 0.3 / 2.5 | 392.6 | – |
| Gemini 3.6 Flash `gemini-3-6-flash` | 2026-07-21 | high | 34 | 0.071 | 0.75 / 3.75 | – | cursor |
| DiffusionGemma 26B A4B `diffusiongemma-26b-a4b` | 2026-06-10 | default | 9.5 | – | – | – | – |
| Gemma 4 12B `gemma-4-12b` | 2026-06-03 | non-reasoning, default | 14.2 (default) | – | 0.1 / 0.3 | 147.1 | – |
| Gemini 3.5 Flash `gemini-3-5-flash` | 2026-05-19 | minimal, medium, high | 33.6 (medium) | 0.066 (high) | 1.5 / 9 | – | cursor |
| Gemma 4 E4B `gemma-4-e4b` | 2026-04-03 | non-reasoning, default | 8.9 (default) | 0 (default) | 0.02 / 0.1 | 34.9 | – |
| Gemma 4 26B A4B `gemma-4-26b-a4b` | 2026-04-02 | non-reasoning, default | 16.7 (default) | – | 0.1 / 0.4 | 64.8 | – |
| Gemma 4 31B `gemma-4-31b` | 2026-04-02 | non-reasoning, default | 14.7 (default) | 0 (default) | 0.165 / 0.4 | 35.5 | – |
| Gemma 4 E2B `gemma-4-e2b` | 2026-04-02 | non-reasoning, default | 7.8 (default) | – | – | – | – |
| Gemini 3.1 Flash-Lite `gemini-3-1-flash-lite-preview` | 2026-03-03 | default | 15.6 | 0.005 | 0.25 / 1.5 | – | – |
| Gemini 3.1 Pro Preview `gemini-3-1-pro-preview` | 2026-02-19 | default | 29.7 | 0.04 | 2 / 12 | 135.4 | cursor |
| Gemini 3 Deep Think `gemini-3-deep-think` | 2026-02-05 | default | – | – | – | – | – |

| IBM (6) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Granite 4.2 30B `granite-4-2-30b` | 2026-08-25 | default | 12.7 | 0 | 0.16 / 0.65 | 78.1 | – |
| Granite 4.2 3B `granite-4-2-3b` | 2026-08-25 | default | 9.1 | 0 | 0.03 / 0.12 | 229 | – |
| Granite 4.2 8B `granite-4-2-8b` | 2026-08-25 | default | 11.1 | 0 | 0.06 / 0.25 | 62.3 | – |
| Granite 4.1 30B `granite-4-1-30b` | 2026-04-29 | default | 7.4 | – | – | – | – |
| Granite 4.1 3B `granite-4-1-3b` | 2026-04-29 | default | 5.9 | – | – | – | – |
| Granite 4.1 8B `granite-4-1-8b` | 2026-04-29 | default | 6.6 | – | – | – | – |

| Inception (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Mercury 2.5 `mercury-2-5` | 2026-09-08 | default | 12.3 | 0 | 0.25 / 0.75 | 736.1 | – |
| Mercury 2 `mercury-2` | 2026-02-20 | default | 13.8 | 0 | 0.25 / 0.75 | – | – |

| InclusionAI (8) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Ling 3.1 Flash `ling-3-1-flash` | 2026-10-01 | default | 41.1 | 0.333 | 0.3 / 0.9 | 216 | – |
| Ling-3.0-flash-Fin `ling-3-0-flash-fin` | 2026-09-11 | default | 22.6 | 0 | 0.075 / 0.22 | 285.9 | – |
| Ling-3.0-flash-VL `ling-3-0-flash-vl` | 2026-09-10 | default | 24.6 | 0 | – | – | – |
| Ling 3.0 Tiny `ling-3-0-tiny` | 2026-08-06 | default | 11.1 | 0 | – | 16.1 | – |
| Ling 3.0 Flash `ling-3-0-flash` | 2026-08-04 | default | 20.1 | 0 | 0.075 / 0.22 | – | – |
| Ring-2.6-1T `ring-2-6-1t` | 2026-05-08 | default | 16.6 | 0.005 | 0.3 / 2.5 | 122.2 | – |
| Ling-2.6-1T `ling-2-6-1t` | 2026-04-23 | default | 17 | – | 0.3 / 2.5 | – | – |
| Ling 2.6 Flash `ling-2-6-flash` | 2026-04-21 | default | 9.7 | – | – | – | – |

| Institute of Foundation Models (5) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| K2 Horizon 0.9B `k2-horizon-0-9b` | 2026-09-03 | default | 3 | 0 | – | – | – |
| K2 Horizon 3.7B `k2-horizon-3-7b` | 2026-09-03 | default | 15.6 | 0 | – | – | – |
| K2 Horizon 375B A23B `k2-horizon-375b-a23b` | 2026-09-03 | default | 30.5 | 0.015 | – | 110.1 | – |
| K2 Horizon 7B `k2-horizon-7b` | 2026-09-03 | default | 20.6 | 0.01 | – | – | – |
| K2 Horizon MoVA 36B A4B `k2-horizon-mova-36b-a4b` | 2026-09-03 | default | 25.3 | 0 | – | – | – |

| Kimi (4) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Kimi K3 `kimi-k3` | 2026-07-16 | low, max | 43.6 (max) | 0.126 (low) | 3 / 15 | 46.7 | cursor |
| Kimi K2.7 Code `kimi-k2-7-code` | 2026-06-12 | default | 25.8 | 0.01 | 0.95 / 4 | 58.6 | cursor |
| Kimi K2.6 `kimi-k2-6` | 2026-04-20 | non-reasoning, default | 27 (default) | 0.005 (default) | 0.95 / 4 | – | – |
| Kimi K2.5 `kimi-k2-5` | 2026-01-27 | non-reasoning, default | 23.5 (default) | – | 0.6 / 2.75 | – | – |

| KwaiKAT (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| KAT Coder Pro V2 `kat-coder-pro-v2` | 2026-03-27 | default | 21.7 | – | 0.3 / 1.2 | – | – |

| LG AI Research (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| K-EXAONE 2.0 0803 `k-exaone-2-0-0803` | 2026-08-12 | default | 19.7 | – | – | – | – |
| EXAONE 4.5 33B `exaone-4-5-33b` | 2026-04-09 | non-reasoning, default | 13.2 (default) | – | – | – | – |

| Liquid AI (6) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| LFM2.5-2.6B `lfm2-5-2-6b` | 2026-08-04 | default | 8.4 | – | – | – | – |
| LFM2.5-8B-A1B `lfm2-5-8b-a1b` | 2026-05-28 | default | 7.2 | – | – | – | – |
| LFM2 24B A2B `lfm2-24b-a2b` | 2026-02-25 | default | 5.9 | – | – | – | – |
| LFM2.5-1.2B-Thinking `lfm2-5-1-2b-thinking` | 2026-01-20 | default | 5.2 | – | – | – | – |
| LFM2.5-1.2B-Instruct `lfm2-5-1-2b-instruct` | 2026-01-05 | default | 5.2 | – | – | – | – |
| LFM2.5-VL-1.6B `lfm2-5-vl-1-6b` | 2026-01-05 | default | 4.8 | – | – | – | – |

| LongCat (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| LongCat 2.0 `longcat-2-0` | 2026-06-29 | default | 19.1 | 0 | 0.75 / 2.95 | 67 | – |
| LongCat Flash Lite `longcat-flash-lite` | 2026-01-28 | default | 11.5 | – | – | – | – |

| Meta (7) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Muse Wonder `muse-wonder` | 2026-10-12 | max | 52.4 | 0.52 | 4 / 20 | 116.8 | – |
| Muse Wonder Full `muse-wonder-full` | 2026-10-12 | max | 55.8 | 0.571 | – | – | – |
| Muse Spark 1.3 `muse-spark-1-3` | 2026-09-02 | xhigh, max | 48.1 (max) | 0.333 (max) | 1.25 / 4.25 | 111.6 | cursor |
| Muse Glimmer `muse-glimmer` | 2026-08-10 | high | 17.5 | 0.005 | 0.3 / 1.2 | 139.6 | – |
| Muse Spark 1.2 `muse-spark-1-2` | 2026-08-05 | xhigh | 39.6 | 0.071 | 1.25 / 4.25 | – | – |
| Muse Spark 1.1 `muse-spark-1-1` | 2026-07-09 | xhigh | 33.7 | 0.061 | 1.25 / 4.25 | – | – |
| Muse Spark `muse-spark` | 2026-04-08 | default | 31.3 | – | – | – | – |

| MiniMax (3) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| MiniMax-M3 `minimax-m3` | 2026-06-01 | default | 29.2 | 0.02 | 0.3 / 1.2 | 100.6 | – |
| MiniMax-M2.7 `minimax-m2-7` | 2026-03-18 | default | 22.8 | 0 | 0.3 / 1.2 | – | – |
| MiniMax-M2.5 `minimax-m2-5` | 2026-02-12 | default | 22.8 | – | 0.3 / 1.2 | – | – |

| Mistral (3) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Mistral Large 4 Preview `mistral-large-4` | 2026-10-06 | default | 38.4 | 0.268 | 1.36 / 4.18 | – | – |
| Mistral Medium 3.5 `mistral-medium-3-5` | 2026-04-29 | default | 14.2 | 0 | 1.5 / 7.5 | 165.3 | – |
| Mistral Small 4 `mistral-small-4` | 2026-03-16 | non-reasoning, default | 11.3 (default) | 0 (default) | 0.15 / 0.6 | 181.7 | – |

| Motif Technologies (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Motif 3 `motif-3` | 2026-08-12 | default | 33.6 | – | – | – | – |
| Motif 3 (Beta) `motif-0714` | 2026-07-14 | default | 32.3 | – | – | – | – |

| Multiverse Computing (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Quasar 438B `quasar-438b` | 2026-08-10 | max | 26.7 | 0.01 | 0.6 / 1.8 | 144.2 | – |
| HyperNova 60B 2605 `hypernova-60b` | 2026-05-26 | high | 11.7 | 0 | – | – | – |

| Nanbeige (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Nanbeige4.1-3B `nanbeige4-1-3b` | 2026-02-11 | default | 8.4 | – | – | – | – |

| Nex AGI (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Nex-N2-Pro (Based on Qwen3.5-397B-A17B) `nex-n2-pro` | 2026-06-02 | default | 28.2 | – | – | – | – |

| NVIDIA (6) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Nemotron 3.5 Lightning `nemotron-3-5-lightning` | 2026-08-11 | default | 12.9 | 0.005 | 0.06 / 0.2 | 299.5 | – |
| Nemotron 3 Ultra 550B A55B `nvidia-nemotron-3-ultra-550b-a55b` | 2026-06-04 | default | 22.9 | 0.005 | 0.6 / 2.5 | 151.7 | – |
| Nemotron 3 Nano Omni 30B A3B Reasoning `nemotron-3-nano-omni-30b-a3b` | 2026-04-29 | default | 10.3 | – | 0.3 / 0.9 | 239.5 | – |
| Nemotron Cascade 2 30B A3B `nemotron-cascade-2-30b-a3b` | 2026-03-19 | default | 11.7 | – | – | – | – |
| NVIDIA Nemotron 3 Nano 4B `nvidia-nemotron-3-nano-4b` | 2026-03-16 | default | 4.8 | 0 | – | – | – |
| Nemotron 3 Super 120B A12B `nvidia-nemotron-3-super-120b-a12b` | 2026-03-11 | default | 12.8 | 0 | 0.3 / 0.9 | 151.6 | – |

| OpenAI (17) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| GPT-6.1 Sol `gpt-6-1-sol` | 2026-09-29 | low, medium, high, xhigh, max | 51.8 (max) | 0.561 (max) | 2 / 10 | 56 | codex |
| GPT-6 Luna `gpt-6-luna` | 2026-09-22 | non-reasoning, low, medium, high, xhigh, max | 38.1 (max) | 0.126 (max) | 0.1 / 0.5 | 128.2 | codex |
| GPT-6 Sol `gpt-6-sol` | 2026-09-22 | non-reasoning, low, medium, high, xhigh, max | 47.6 (max) | 0.439 (max) | 2 / 10 | – | codex |
| GPT-6 Sol `gpt-6-sol-daybreak-blue` | 2026-09-22 | max | – | – | 2 / 10 | – | – |
| GPT-6 Astra `gpt-6-astra` | 2026-09-03 | low, medium, high, xhigh, max | 52.7 (max) | 0.596 (xhigh) | 10 / 50 | 53 | codex |
| GPT-5.6 Luna `gpt-5-6-luna` | 2026-07-09 | non-reasoning, low, medium, high, xhigh, max | 37.3 (max) | 0.116 (max) | 0.2 / 1.2 | – | codex, cursor |
| GPT-5.6 Sol `gpt-5-6-sol` | 2026-07-09 | non-reasoning, low, medium, high, xhigh, max | 47 (max) | 0.399 (max) | 4 / 20 | – | codex, cursor |
| GPT-5.6 Terra `gpt-5-6-terra` | 2026-07-09 | non-reasoning, low, medium, high, xhigh, max | 42.1 (max) | 0.354 (max) | 2 / 12 | 106.2 | codex, cursor |
| GPT-5.5 Instant (June 2026) `gpt-5-5-instant-06-26` | 2026-06-25 | default | 26 | 0.126 | 5 / 30 | 157.5 | – |
| GPT-5.5 Instant (May 2026) `gpt-5-5-instant-05-26` | 2026-05-05 | default | 22.7 | – | 5 / 30 | – | – |
| GPT-5.5 `gpt-5-5` | 2026-04-23 | non-reasoning, low, medium, high, xhigh | 38.4 (xhigh) | 0.146 (xhigh) | 5 / 30 | – | codex, cursor |
| GPT-5.5 Pro `gpt-5-5-pro` | 2026-04-23 | xhigh | – | – | – | – | – |
| GPT-5.4 mini `gpt-5-4-mini` | 2026-03-17 | non-reasoning, medium, xhigh | 24.1 (xhigh) | 0.02 (xhigh) | 0.75 / 4.5 | – | cursor |
| GPT-5.4 nano `gpt-5-4-nano` | 2026-03-17 | non-reasoning, medium, xhigh | 20.7 (xhigh) | 0.005 (xhigh) | 0.2 / 1.25 | – | cursor |
| GPT-5.4 `gpt-5-4` | 2026-03-05 | non-reasoning, low, xhigh | 39 (xhigh) | – | 2.5 / 15 | – | cursor |
| GPT-5.4 Pro `gpt-5-4-pro` | 2026-03-05 | xhigh | – | – | 30 / 180 | – | – |
| GPT-5.3 Codex `gpt-5-3-codex` | 2026-02-05 | xhigh | 32.5 | – | 1.75 / 14 | 92.4 | cursor |

| OpenBMB (3) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| MiniCPM5-2B `minicpm5-2b` | 2026-09-07 | default | 12.5 | 0 | – | – | – |
| MiniCPM5-1B `minicpm5-1b` | 2026-05-25 | non-reasoning, default | 8.8 (default) | – | – | – | – |
| MiniCPM-V 4.6 1.3B `minicpm-v4-6-1-3b` | 2026-05-11 | default | 5.7 | – | – | – | – |

| Sapiens AI (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Agnes 2.5 Pro Beta `agnes-2-5-pro-beta` | 2026-08-26 | default | 35.2 | – | 0.1 / 0.3 | 125.2 | – |

| Sarvam (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Sarvam 105B `sarvam-105b` | 2026-03-06 | high | 8.8 | – | 0.042 / 0.17 | – | – |
| Sarvam 30B `sarvam-30b` | 2026-03-06 | high | 6.6 | – | 0.026 / 0.11 | – | – |

| SK Telecom (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| A.X-K2 `a-x-k2` | 2026-08-12 | default | 21.5 | 0 | – | – | – |

| SpaceXAI (7) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Grok 4.7 `grok-4-7` | 2026-09-21 | low, high, xhigh | 46.4 (xhigh) | 0.258 (xhigh) | 2 / 6 | 62.9 | grok, cursor |
| Grok 4.6 `grok-4-6` | 2026-08-12 | low, medium, high, xhigh | 44.3 (high) | 0.212 (high) | 2 / 6 | – | grok, cursor |
| Grok 4.5 `grok-4-5` | 2026-07-08 | high | 38.8 | 0.106 | 2 / 6 | – | grok, cursor |
| Grok Build 0.1 0616 `grok-build-0-1-06-16` | 2026-06-16 | default | 27.2 | – | 1 / 2 | – | – |
| Grok 4.3 `grok-4-3` | 2026-04-30 | non-reasoning, low, medium, high | 24.9 (high) | 0 (non-reasoning) | 1.25 / 2.5 | – | – |
| Grok 4.20 0309 v2 `grok-4-20` | 2026-04-07 | non-reasoning, default | 25.7 (default) | – | 1.25 / 2.5 | – | – |
| Grok 4.20 0309 `grok-4-20-0309` | 2026-03-10 | non-reasoning, default | 25.2 (default) | – | 2 / 6 | – | – |

| StepFun (5) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Step 5 Preview `step-5` | 2026-09-18 | default | 43.7 | 0.333 | 1 / 2.7 | 87.4 | – |
| Step 3.7 Flash `step-3-7-flash` | 2026-05-29 | default | 19.5 | – | 0.2 / 1.15 | – | – |
| Step 3.5 Flash 2603 `step-3-5-flash` | 2026-04-02 | default | 17 | – | 0.1 / 0.3 | – | – |
| Step 3.5 Flash `step-3-5-flash-0202` | 2026-02-02 | default | 16.6 | – | 0.1 / 0.3 | – | – |
| Step3 VL 10B `step-3-vl-10b` | 2026-01-20 | default | 7.7 | – | – | – | – |

| Tencent (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Hy3 `hy3` | 2026-07-06 | default | 25.3 | 0.005 | 0.136 / 0.555 | 90.3 | – |
| Hy3-preview `hy3-preview` | 2026-04-23 | non-reasoning, default | 22.7 (default) | – | 0.063 / 0.21 | – | – |

| Thinking Machines (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Inkling Small `inkling-small` | 2026-07-30 | default | 25.7 | 0.01 | 0.3 / 1.2 | 185.7 | – |
| Inkling `inkling` | 2026-07-15 | xhigh | 25 | 0.01 | 1 / 4.05 | 210.5 | – |

| TII UAE (1) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Falcon-H1R-7B `falcon-h1r-7b` | 2026-01-04 | default | 7.8 | – | – | – | – |

| Trillion Labs (2) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Tri-21B-think Preview `tri-21b-think-preview` | 2026-02-10 | default | 9.6 | – | – | – | – |
| Tri-21B-Think `tri-21b-think-v0-5` | 2026-02-10 | default | 9 | – | – | – | – |

| Upstage (4) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| Solar Mini 4 `solar-mini4` | 2026-09-22 | default | 24.1 | 0.01 | 0.1 / 0.4 | 77.8 | – |
| Solar Open2 250B `solar-open2-250b` | 2026-08-12 | default | 24.7 | – | – | – | – |
| Solar Pro 4 `solar-pro4` | 2026-08-06 | default | 28.2 | 0.005 | 0.3 / 1.2 | 88.3 | – |
| Solar Pro 3 `solar-pro-3` | 2026-04-06 | default | 7.8 | 0 | 0.15 / 0.6 | – | – |

| Xiaomi (7) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| MiMo-V2.6-Flash `mimo-v2-6-flash` | 2026-09-21 | default | 37.9 | 0.227 | 0.14 / 0.28 | 50.5 | – |
| MiMo-V2.6-Pro `mimo-v2-6-pro` | 2026-09-21 | default | 46.3 | 0.348 | 0.435 / 0.87 | 37.8 | – |
| MiMo-V2.5 `mimo-v2-5-0424` | 2026-04-22 | default | 25.2 | 0 | 0.14 / 0.28 | – | – |
| MiMo-V2.5-Pro `mimo-v2-5-pro` | 2026-04-22 | non-reasoning, default | 26 (default) | 0 (default) | 0.435 / 0.87 | – | – |
| MiMo-V2-Omni-0327 `mimo-v2-omni-0327` | 2026-03-27 | default | 25.1 | – | – | – | – |
| MiMo-V2-Omni `mimo-v2-omni` | 2026-03-19 | default | 23.9 | – | – | – | – |
| MiMo-V2-Pro `mimo-v2-pro` | 2026-03-18 | default | 28.6 | – | – | – | – |

| Z AI (8) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |
|---|---|---|---:|---:|---:|---:|---|
| GLM-5.3-Flash `glm-5-3-flash` | 2026-08-26 | default | 41.8 | 0.328 | 0.15 / 0.5 | 61.4 | – |
| GLM-5.3 `glm-5-3` | 2026-08-18 | low, max | 44.8 (max) | 0.419 (max) | 1.4 / 4.4 | 68.9 | – |
| GLM-5.2 `glm-5-2` | 2026-06-16 | non-reasoning, max | 33.7 (max) | 0.01 (max) | 1.4 / 4.4 | – | cursor |
| GLM-5.1 `glm-5-1` | 2026-04-07 | non-reasoning, default | 26.1 (default) | 0.02 (default) | 1.285 / 4.07 | – | – |
| GLM 5V Turbo `glm-5v-turbo` | 2026-04-01 | default | 23.5 | – | – | – | – |
| GLM-5-Turbo `glm-5-turbo` | 2026-03-15 | default | 26.6 | – | – | – | – |
| GLM-5 `glm-5` | 2026-02-11 | non-reasoning, default | 27.9 (default) | – | 1 / 3.2 | – | – |
| GLM-4.7-Flash `glm-4-7-flash` | 2026-01-19 | non-reasoning, default | 14.9 (default) | – | 0.07 / 0.4 | – | – |

## Reachable through our harnesses

36 of the 190 families, newest first, with each harness model and the efforts it takes. `*` is in the lane table. A match is exact unless it says otherwise: `~` is a guess (a rewritten name), and a note says when the CLI does not list the model. On agy and Cursor the effort is part of the id (`ids` in index.json has each one); on codex and grok it is a flag.

- Claude Haiku 5.5 `claude-haiku-5-5`: cursor `claude-haiku-5-5` low/medium/high/xhigh/max; cursor `claude-haiku-5-5-thinking` low/medium/high/xhigh/max
- Gemini 4 Argon `gemini-4-argon`: agy* `gemini-4-argon` (not listed by the CLI) low/medium/high; cursor `gemini-4-argon` low/medium/high
- GPT-6.1 Sol `gpt-6-1-sol`: codex `gpt-6.1-sol` low/medium/high/xhigh/max/ultra
- Claude Sonnet 5.5 `claude-sonnet-5-5`: agy* `claude-sonnet-5-5` low/medium/high; cursor `claude-sonnet-5-5` low/medium/high/xhigh/max
- Claude Opus 5.5 `claude-opus-5-5`: agy* `claude-opus-5-5` low/medium/high; cursor `claude-opus-5-5` +fast low/medium/high/xhigh/max
- GPT-6 Luna `gpt-6-luna`: codex `gpt-6-luna` low/medium/high/xhigh/max
- GPT-6 Sol `gpt-6-sol`: codex `gpt-6-sol` low/medium/high/xhigh/max/ultra
- Grok 4.7 `grok-4-7`: grok `grok-4.7` low/medium/high/xhigh; cursor `grok-4.7` +fast low/medium/high/xhigh
- GPT-6 Astra `gpt-6-astra`: codex `gpt-6-astra` low/medium/high/xhigh/max/ultra
- Gemini 3.8 Flash `gemini-3-8-flash`: agy* `gemini-3.8-flash` low/medium/high; cursor `gemini-3.8-flash` low/medium/high
- Muse Spark 1.3 `muse-spark-1-3`: cursor `muse-spark-1.3` minimal/low/medium/high/xhigh/max
- Claude Fable 5.1 `claude-fable-5-1`: cursor `claude-fable-5-1` low/medium/high/xhigh/max; cursor `claude-fable-5-1-thinking` low/medium/high/xhigh/max
- Gemini 3.7 Flash `gemini-3-7-flash`: cursor `gemini-3.7-flash` low/medium/high
- Grok 4.6 `grok-4-6`: grok `grok-4.6` low/medium/high/xhigh; cursor `cursor-grok-4.6`~ +fast low/medium/high/xhigh
- Claude Opus 5 `claude-opus-5`: cursor `claude-opus-5` +fast low/medium/high; cursor `claude-opus-5-thinking` +fast low/medium/high/xhigh/max
- Gemini 3.6 Flash `gemini-3-6-flash`: cursor `gemini-3.6-flash` minimal/low/medium/high
- Kimi K3 `kimi-k3`: cursor `kimi-k3` low/high/max
- GPT-5.6 Luna `gpt-5-6-luna`: codex `gpt-5.6-luna` low/medium/high/xhigh/max; cursor `gpt-5.6-luna` +fast none/low/medium/high/xhigh/max
- GPT-5.6 Sol `gpt-5-6-sol`: codex `gpt-5.6-sol` low/medium/high/xhigh/max/ultra; cursor `gpt-5.6-sol` +fast none/low/medium/high/xhigh/max
- GPT-5.6 Terra `gpt-5-6-terra`: codex `gpt-5.6-terra` low/medium/high/xhigh/max/ultra; cursor `gpt-5.6-terra` +fast none/low/medium/high/xhigh/max
- Grok 4.5 `grok-4-5`: grok `grok-4.5` low/medium/high/xhigh; cursor `cursor-grok-4.5`~ +fast low/medium/high
- Claude Sonnet 5 `claude-sonnet-5`: cursor `claude-sonnet-5` low/medium/high/xhigh/max; cursor `claude-sonnet-5-thinking` low/medium/high/xhigh/max
- GLM-5.2 `glm-5-2`: cursor `glm-5.2` high/max
- Kimi K2.7 Code `kimi-k2-7-code`: cursor `kimi-k2.7-code` default
- Claude Fable 5 `claude-fable-5`: cursor `claude-fable-5` low/medium/high/xhigh/max; cursor `claude-fable-5-thinking` low/medium/high/xhigh/max
- Claude Opus 4.8 `claude-opus-4-8`: cursor `claude-opus-4-8` +fast low/medium/high/xhigh/max; cursor `claude-opus-4-8-thinking` +fast low/medium/high/xhigh/max
- Gemini 3.5 Flash `gemini-3-5-flash`: cursor `gemini-3.5-flash` default
- GPT-5.5 `gpt-5-5`: codex `gpt-5.5` (hidden) low/medium/high/xhigh; cursor `gpt-5.5` +fast none/low/medium/high/xhigh
- Claude Opus 4.7 `claude-opus-4-7`: cursor `claude-opus-4-7` +fast low/medium/high/xhigh/max; cursor `claude-opus-4-7-thinking` +fast low/medium/high/xhigh/max
- GPT-5.4 mini `gpt-5-4-mini`: cursor `gpt-5.4-mini` none/low/medium/high/xhigh
- GPT-5.4 nano `gpt-5-4-nano`: cursor `gpt-5.4-nano` none/low/medium/high/xhigh
- GPT-5.4 `gpt-5-4`: cursor `gpt-5.4` +fast low/medium/high/xhigh
- Gemini 3.1 Pro Preview `gemini-3-1-pro-preview`: cursor `gemini-3.1-pro`~ default
- Claude Sonnet 4.6 `claude-sonnet-4-6`: cursor `claude-4.6-sonnet`~ medium; cursor `claude-4.6-sonnet-thinking`~ medium
- Claude Opus 4.6 `claude-opus-4-6`: cursor `claude-4.6-opus`~ high/max; cursor `claude-4.6-opus-thinking`~ high/max
- GPT-5.3 Codex `gpt-5-3-codex`: cursor `gpt-5.3-codex` +fast default/low/high/xhigh

## Harness models no family took

- agy: released before 2026-01-01: `gpt-oss-120b`
- codex: no AA entry: `codex-auto-review`, `gpt-reserve`
- grok: no AA entry: `grok-4.7-build-fast`
- cursor: no AA entry: `auto`, `composer-2.5`; released before 2026-01-01: `claude-4-sonnet`, `claude-4-sonnet-thinking`, `claude-4.5-opus`, `claude-4.5-opus-thinking`, `claude-4.5-sonnet`, `claude-4.5-sonnet-thinking`, `gemini-3-flash`, `gpt-5-mini`, `gpt-5.1`, `gpt-5.2`
<!-- models-index:end -->

## Observations (written by hand from the 2026-10-13 snapshot)

- Effort moves the score most for Claude Sonnet 5.5: intelligence 35.9 at low and 56 at max, terminal-bench 0.207 to 0.636; GPT-5.6 Luna and Terra gain 21 to 22 points of intelligence from non-reasoning to max, and Claude Opus 5.5 gains 15.3 (42.3 to 57.6), but the top is flat: Opus 5.5 scores 0.596 terminal-bench at both xhigh and max, Grok 4.7 scores 46.3 at high and 46.4 at xhigh, and Gemini 3.8 Flash has 0.197 at both medium and high.
- The best terminal-bench in the index is Claude Sonnet 5.5 at max, 0.636 at $2/$10, ahead of Opus 5.5 (0.596 at $4/$20) and GPT-6 Astra (0.591 to 0.596 at $10/$50), but its median time to first token is 272 s at max against 16.7 s at xhigh, where it scores 0.571.
- Per dollar (terminal-bench over the 3:1 blended price) Claude Haiku 5.5 at max leads: 0.328 for $0.20 per million tokens, 1.64 per dollar, ahead of GLM-5.3-Flash (1.38) and MiMo-V2.6-Flash (1.30), which no harness of ours reaches.
- agy's lane table maps xhigh to high, so on agy Claude Opus 5.5 and Sonnet 5.5 run at low, medium or high only (intelligence 53.6 and 46.8 at high), never at xhigh or max (56 and 51.9; 57.6 and 56); Cursor lists all five efforts for both, but the plugin's cursor harness does not pass an effort yet.
- AA has no data in many places: no terminal-bench for 129 of 317 variants (77 of 190 families), no speed for 191, no price for 67 (60 families have no price in any variant); Gemini 4 Argon has a price ($2/$10) and 0.571 terminal-bench but no speed.
- Our harnesses reach 36 of the 190 families (Cursor 32, codex 8, agy 4, grok 3); of the 12 best variants by terminal-bench only Muse Wonder Full is out of reach, and agy's `gemini-4-argon` is in the lane table but not in what `agy models` lists.
