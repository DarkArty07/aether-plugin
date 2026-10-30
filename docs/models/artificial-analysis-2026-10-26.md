---
title: Artificial Analysis comparison, 2026-10-26
description: The 28 models of the owner's Artificial Analysis chart with the figures of its free API and of its website, including the cost, tokens and time per task of the Intelligence Index
order: 22
---

# Artificial Analysis comparison, 2026-10-26

The 28 models of the chart "Intelligence Index vs. Cost per Task" on [artificialanalysis.ai](https://artificialanalysis.ai), with their figures from two sources. Credit: Artificial Analysis.

- **The free API** (`https://artificialanalysis.ai/api/v2/data/llms/models`, asked on 2026-10-26): the first two tables. What it returns, and what it does not, is in [Artificial Analysis data](../reference/artificial-analysis.md).
- **The website**: the last four tables, which the API does not have. They come from the data the chart page itself carries (one page load of the owner's chart URL, plus one load of the page of `claude-opus-5-5-high`, which the chart page does not carry), captured once on 2026-10-26 because the owner asked for them. No script of this repository reads the website and the plugin reads none of this. Whether Artificial Analysis's terms allow keeping them is open in [issue 97](https://github.com/DarkArty07/aether-plugin/issues/97).

How to read it. The models are ordered by intelligence index, highest first. `–` is a figure Artificial Analysis does not have. A price of `0` is what the API returns for a model it has no price for, such as `muse-wonder-full`, which is not sold by the token; for the speed and latency, a `0` means not measured. Prices are US dollars per million tokens, speed is median output tokens per second, latency is in seconds at a prompt of about 1,000 tokens, and benchmark scores are shown as percent. The name of an entry says its effort, and a Claude entry says `Default Fallback`: it is the same model, with the fallback Artificial Analysis assumed.

## Intelligence, price, speed and latency (API)

| Model | Slug | Creator | Released | Intelligence | Coding | In | Out | Blended 3:1 | Tokens/s | First token | First answer token |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude Opus 5.5 (Max, Default Fallback) | `claude-opus-5-5` | Anthropic | 2026-09-22 | 57.6 | – | 4 | 20 | 8 | 94.1 | 521.31 | 521.31 |
| Claude Sonnet 5.5 (Max, Default Fallback) | `claude-sonnet-5-5` | Anthropic | 2026-09-28 | 56 | – | 2 | 10 | 4 | 141 | 280.48 | 280.48 |
| Muse Wonder Full (Max) | `muse-wonder-full` | Meta | 2026-10-12 | 55.8 | – | 0 | 0 | 0 | – | – | – |
| Kimi K3.1 Pro | `kimi-k3-1-pro` | Kimi | 2026-10-23 | 55.1 | – | 2 | 10 | 4 | 48.3 | 2 | 43.44 |
| Claude Opus 5.5 (High, Default Fallback) | `claude-opus-5-5-high` | Anthropic | 2026-09-22 | 53.6 | – | 4 | 20 | 8 | 66.2 | 14.16 | 14.16 |
| Claude Fable 5.1 (Max, Default Fallback) | `claude-fable-5-1` | Anthropic | 2026-09-01 | 53.4 | 81.6 | 10 | 50 | 20 | 67.9 | 148.19 | 148.19 |
| GPT-6 Astra (Max) | `gpt-6-astra` | OpenAI | 2026-09-03 | 52.7 | 76.9 | 10 | 50 | 20 | 63 | 166.2 | 166.2 |
| Gemini 4 Argon (High) | `gemini-4-argon` | Google | 2026-09-30 | 52.6 | – | 2 | 10 | 4 | 76.5 | 35.24 | 35.24 |
| Muse Wonder (Max) | `muse-wonder` | Meta | 2026-10-12 | 52.4 | – | 4 | 20 | 8 | 117 | 25.28 | 42.37 |
| GPT-6.1 Sol (Max) | `gpt-6-1-sol` | OpenAI | 2026-09-29 | 51.8 | – | 2 | 10 | 4 | 57.7 | 145.66 | 145.66 |
| Grok 4.7 (Xhigh) | `grok-4-7` | SpaceXAI | 2026-09-21 | 46.4 | – | 2 | 6 | 3 | 73.8 | 13.16 | 13.16 |
| MiMo-V2.6-Pro | `mimo-v2-6-pro` | Xiaomi | 2026-09-21 | 46.3 | – | 0.43 | 0.87 | 0.54 | 45.6 | 2.4 | 46.27 |
| Qwen3.8 Max (0902) | `qwen3-8-max` | Alibaba | 2026-09-02 | 45.4 | 76.2 | 2 | 6 | 3 | 39.9 | 1.85 | 51.94 |
| DeepSeek V4.1 Flash 1017 (Max) | `deepseek-v4-1-flash-1017` | DeepSeek | 2026-10-17 | 45.1 | – | 0.3 | 1.2 | 0.53 | 153.7 | 0.98 | 14 |
| GLM-5.3 (Max) | `glm-5-3` | Z AI | 2026-08-18 | 44.8 | 74.8 | 1.4 | 4.4 | 2.15 | 85.8 | 2.24 | 25.54 |
| Step 5 Preview | `step-5` | StepFun | 2026-09-18 | 43.7 | – | 1 | 2.7 | 1.43 | 205 | 1.01 | 10.76 |
| Claude Haiku 5.5 (Max) | `claude-haiku-5-5` | Anthropic | 2026-10-07 | 43.4 | – | 0.1 | 0.5 | 0.2 | 235.1 | 242.05 | 242.05 |
| MiniMax-M3.1-Flash | `minimax-m3-1-flash` | MiniMax | 2026-10-19 | 42.7 | – | 0.15 | 0.6 | 0.26 | 105.1 | 0.97 | 20 |
| GLM-5.3-Flash | `glm-5-3-flash` | Z AI | 2026-08-26 | 41.8 | 71.5 | 0.15 | 0.5 | 0.24 | 65.3 | 2.6 | 33.23 |
| Gemini 3.8 Flash (High) | `gemini-3-8-flash` | Google | 2026-09-02 | 40.9 | 76.3 | 0.75 | 3.75 | 1.5 | 120.2 | 17.22 | 17.22 |
| Muse Spark Open (Xhigh) | `muse-spark-open` | Meta | 2026-10-15 | 38.9 | – | 1.25 | 4.25 | 2 | 161.8 | 0.6 | 12.97 |
| Mistral Large 4 Preview | `mistral-large-4` | Mistral | 2026-10-06 | 38.4 | – | 1.36 | 4.18 | 2.06 | 118.2 | 0.81 | 17.73 |
| GPT-6 Luna (Max) | `gpt-6-luna` | OpenAI | 2026-09-22 | 38.1 | – | 0.1 | 0.5 | 0.2 | 122.6 | 81.44 | 81.44 |
| Qwen3.8 27B (Xhigh) | `qwen3-8-27b` | Alibaba | 2026-08-14 | 33.7 | 68.1 | 0.5 | 3 | 1.13 | 40.8 | 1.19 | 50.23 |
| K2 Horizon 375B A23B | `k2-horizon-375b-a23b` | Institute of Foundation Models | 2026-09-03 | 30.5 | 61.5 | 0 | 0 | 0 | 447.8 | 1.69 | 6.15 |
| Beam 1.0 | `reflection-beam` | Reflection | 2026-10-16 | 30.3 | – | 0.4 | 1.2 | 0.6 | 356.5 | 0.51 | 6.12 |
| Nemotron 3.5 Super VL | `nemotron-3-5-super-vl` | NVIDIA | 2026-10-15 | 26.5 | – | 0.23 | 0.57 | 0.31 | 455.4 | 0.52 | 4.91 |
| Inkling (Xhigh) | `inkling` | Thinking Machines | 2026-07-15 | 25 | 52.1 | 1 | 4.05 | 1.76 | 174 | 1.98 | 13.47 |

## Benchmarks (API)

The API returns no score for any of the 28 on IFBench, tau2, TB hard, MMLU-Pro, LiveCode, AIME 25, AIME, MATH-500 or the math index, so they have no column.

| Model | HLE | GPQA | SciCode | LCR | tau banking | TB v2.1 | TB v4 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Claude Opus 5.5 (Max, Default Fallback) | 61.4 | – | 66.9 | 84.7 | – | – | 59.6 |
| Claude Sonnet 5.5 (Max, Default Fallback) | 55.0 | – | 61.0 | 82.7 | – | – | 63.6 |
| Muse Wonder Full (Max) | 53.6 | – | 62.6 | 83.7 | – | – | 57.1 |
| Kimi K3.1 Pro | 52.5 | – | 60.8 | 86.3 | – | – | 67.2 |
| Claude Opus 5.5 (High, Default Fallback) | 55.6 | – | 60.4 | 82.7 | – | – | 56.6 |
| Claude Fable 5.1 (Max, Default Fallback) | 59.1 | 93.7 | 63.1 | 85.3 | 47.2 | 91.4 | 52.0 |
| GPT-6 Astra (Max) | 54.7 | 96.1 | 56.5 | 80.7 | 41.4 | 88.4 | 59.1 |
| Gemini 4 Argon (High) | 57.1 | – | 61.8 | 79.7 | – | – | 57.1 |
| Muse Wonder (Max) | 50.1 | – | 60.3 | 80.7 | – | – | 52.0 |
| GPT-6.1 Sol (Max) | 52.9 | – | 54.2 | 83.0 | – | – | 56.1 |
| Grok 4.7 (Xhigh) | 43.1 | – | 57.4 | 76.7 | – | – | 25.8 |
| MiMo-V2.6-Pro | 49.4 | – | 60.9 | 86.3 | – | – | 34.8 |
| Qwen3.8 Max (0902) | 43.1 | 92.8 | 52.1 | 80.3 | 47.8 | 88.8 | 38.9 |
| DeepSeek V4.1 Flash 1017 (Max) | 43.3 | – | 55.9 | 82.7 | – | – | 33.8 |
| GLM-5.3 (Max) | 42.3 | 91.7 | 59.0 | 79.7 | 50.3 | 83.9 | 41.9 |
| Step 5 Preview | 46.5 | – | 58.9 | 88.3 | – | – | 33.3 |
| Claude Haiku 5.5 (Max) | 44.4 | – | 55.0 | 82.7 | – | – | 32.8 |
| MiniMax-M3.1-Flash | 48.0 | – | 53.4 | 79.7 | – | – | 25.8 |
| GLM-5.3-Flash | 39.9 | 91.2 | 51.6 | 80.0 | 47.2 | 84.3 | 32.8 |
| Gemini 3.8 Flash (High) | 47.8 | 95.3 | 56.6 | 81.3 | 44.9 | 87.6 | 19.7 |
| Muse Spark Open (Xhigh) | 43.9 | 89.0 | 58.4 | 78.3 | – | 76.4 | 8.1 |
| Mistral Large 4 Preview | 35.0 | – | 54.2 | 81.3 | – | – | 26.8 |
| GPT-6 Luna (Max) | 38.5 | – | 54.6 | 83.3 | – | – | 12.6 |
| Qwen3.8 27B (Xhigh) | 33.9 | 90.5 | 46.6 | 82.0 | 48.0 | 79.8 | 5.6 |
| K2 Horizon 375B A23B | 32.0 | 87.3 | 42.9 | 80.0 | 34.2 | 71.9 | 1.5 |
| Beam 1.0 | 34.7 | – | 48.5 | 78.0 | – | – | 3.0 |
| Nemotron 3.5 Super VL | 30.7 | – | 47.8 | 69.0 | – | – | 0.0 |
| Inkling (Xhigh) | 31.9 | 87.2 | 47.0 | 77.3 | 29.1 | 55.1 | 1.0 |

## Cost, tokens and time per task of the Intelligence Index (website)

This is the chart's second axis. The cost per task is the cost of one task of the Intelligence Index, weighted across its evaluations, in US dollars; it is the figure of `costPerTaskUsd` in `plugins/aether/config/pairs.json`. The cost of one task of a single benchmark is not weighted and is several times larger, so never compare the two. *Cache* is the share of the cost that goes to reading and writing the cache. *Output tokens per task* are the reasoning and the answer together, and *of them reasoning* only the reasoning. *Time per task* is a bare number in the page's data, read here as seconds and shown in minutes, because minutes would make a task last hours. *Whole index* is what running all of the Intelligence Index costs and how many output tokens it takes, in millions. Inkling and Muse Wonder Full have no cost, and K2 Horizon has no price, so its cost would be 0.

| Model | Intelligence | Cost per task, $ | of it input | of it output | Cache | Output tokens per task | of them reasoning | Time per task, min | Whole index, $ | Whole index, M output tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude Opus 5.5 (Max, Default Fallback) | 57.6 | 5.98 | 3.60 | 2.38 | 58% | 119,166 | 83,929 | 13 | 8,708 | 260 |
| Claude Sonnet 5.5 (Max, Default Fallback) | 56 | 5.46 | 3.49 | 1.97 | 63% | 197,430 | 146,633 | 15.4 | 7,260 | 416 |
| Muse Wonder Full (Max) | 55.8 | – | – | – | – | 53,754 | 29,163 | – | – | 135 |
| Kimi K3.1 Pro | 55.1 | 2.11 | 1.56 | 0.552 | 72% | 55,195 | 34,883 | 15.6 | 3,117 | 148 |
| Claude Opus 5.5 (High, Default Fallback) | 53.6 | 1.82 | 1.11 | 0.712 | 55% | 35,584 | 18,237 | 4.7 | 2,172 | 53 |
| Claude Fable 5.1 (Max, Default Fallback) | 53.4 | 7.63 | 3.73 | 3.90 | 45% | 78,111 | 47,240 | 12 | 13,129 | 188 |
| GPT-6 Astra (Max) | 52.7 | 3.26 | 1.90 | 1.36 | 52% | 27,206 | 16,691 | 6.7 | 5,324 | 60 |
| Gemini 4 Argon (High) | 52.6 | 1.99 | 1.37 | 0.616 | 65% | 61,558 | 35,546 | 12.1 | 2,407 | 113 |
| Muse Wonder (Max) | 52.4 | 4.54 | 3.45 | 1.09 | 74% | 54,477 | 28,800 | 4.7 | 5,787 | 135 |
| GPT-6.1 Sol (Max) | 51.8 | 0.724 | 0.343 | 0.381 | 41% | 38,128 | 25,190 | 10.2 | 1,082 | 67 |
| Grok 4.7 (Xhigh) | 46.4 | 3.74 | 3.25 | 0.483 | 86% | 80,561 | 58,544 | 15.6 | 4,967 | 240 |
| MiMo-V2.6-Pro | 46.3 | 0.133 | 0.077 | 0.056 | 55% | 64,276 | 37,520 | 17.2 | 207 | 144 |
| Qwen3.8 Max (0902) | 45.4 | 5.41 | 4.76 | 0.646 | 87% | 107,730 | 70,830 | 34 | 4,935 | 192 |
| DeepSeek V4.1 Flash 1017 (Max) | 45.1 | 0.262 | 0.155 | 0.107 | 58% | 89,495 | 59,243 | 6.5 | 445 | 211 |
| GLM-5.3 (Max) | 44.8 | 2.01 | 1.69 | 0.313 | 84% | 71,128 | 48,730 | 9.5 | 2,503 | 209 |
| Step 5 Preview | 43.7 | 1.03 | 0.853 | 0.173 | 82% | 64,144 | 43,448 | 4.4 | 1,190 | 156 |
| Claude Haiku 5.5 (Max) | 43.4 | 0.213 | 0.132 | 0.081 | 61% | 162,164 | 129,047 | 7.1 | 330 | 435 |
| MiniMax-M3.1-Flash | 42.7 | 0.220 | 0.173 | 0.047 | 77% | 78,612 | 54,668 | 9.6 | 283 | 183 |
| GLM-5.3-Flash | 41.8 | 0.284 | 0.249 | 0.034 | 87% | 68,673 | 46,649 | 12.2 | 306 | 181 |
| Gemini 3.8 Flash (High) | 40.9 | 1.24 | 0.977 | 0.266 | 78% | 71,003 | 42,727 | 9 | 1,623 | 172 |
| Muse Spark Open (Xhigh) | 38.9 | 0.844 | 0.672 | 0.172 | 77% | 40,399 | 18,400 | 4.2 | 1,185 | 106 |
| Mistral Large 4 Preview | 38.4 | 1.13 | 0.844 | 0.290 | 72% | 69,496 | 52,118 | 9.1 | 1,608 | 200 |
| GPT-6 Luna (Max) | 38.1 | 0.068 | 0.043 | 0.025 | 60% | 50,012 | 38,890 | 6.1 | 122 | 144 |
| Qwen3.8 27B (Xhigh) | 33.7 | 1.01 | 0.807 | 0.200 | 79% | 66,783 | 47,692 | 20.4 | 1,336 | 198 |
| K2 Horizon 375B A23B | 30.5 | – | – | – | – | 51,517 | 35,768 | 0.7 | – | 126 |
| Beam 1.0 | 30.3 | 0.226 | 0.195 | 0.032 | 84% | 26,315 | 19,478 | 0.9 | 319 | 79 |
| Nemotron 3.5 Super VL | 26.5 | 0.188 | 0.160 | 0.028 | 83% | 49,174 | 35,598 | 1.6 | 286 | 172 |
| Inkling (Xhigh) | 25 | – | – | – | – | 34,656 | 23,399 | 2.9 | – | 137 |

## The models themselves (website)

The context window is in tokens. Parameters are in billions, total and active, where the maker discloses them. *Weights* is how Artificial Analysis classifies the model. The Openness Index is Artificial Analysis's score from 0 to 100 for how open a model is, which it gives for 10 of the 28. The two times are in seconds: the whole response to a task and the wait for the first token of the answer. The knowledge cutoff is given for 1 of the 28 and is left out.

| Model | Context | Parameters | Active | Weights | Openness | Response time, s | First answer token, s |
|---|---:|---:|---:|---|---:|---:|---:|
| Claude Opus 5.5 (Max, Default Fallback) | 1M | – | – | proprietary | – | 681.9 | 676.8 |
| Claude Sonnet 5.5 (Max, Default Fallback) | 1M | – | – | proprietary | – | 392.5 | 388.9 |
| Muse Wonder Full (Max) | 1M | – | – | proprietary | – | – | – |
| Kimi K3.1 Pro | 1M | 2800 | 104 | proprietary | – | 50.9 | 41.3 |
| Claude Opus 5.5 (High, Default Fallback) | 1M | – | – | proprietary | – | 37.6 | 31.3 |
| Claude Fable 5.1 (Max, Default Fallback) | 1M | – | – | proprietary | – | 187.6 | 180.5 |
| GPT-6 Astra (Max) | 1M | – | – | proprietary | – | 285.7 | 278.2 |
| Gemini 4 Argon (High) | 1M | – | – | proprietary | – | 63.2 | 57 |
| Muse Wonder (Max) | 1.05M | – | – | proprietary | – | 43.6 | 41 |
| GPT-6.1 Sol (Max) | 1M | – | – | proprietary | – | 254.7 | 246.6 |
| Grok 4.7 (Xhigh) | 500K | – | – | proprietary | – | 47.5 | 41.8 |
| MiMo-V2.6-Pro | 1M | 1020 | 42 | permissive (MIT) | 53 | 48 | 39 |
| Qwen3.8 Max (0902) | 984K | – | – | proprietary | – | 64.1 | 51.8 |
| DeepSeek V4.1 Flash 1017 (Max) | 1M | 552 | 16 | permissive (MIT) | 44 | 16 | 13 |
| GLM-5.3 (Max) | 1M | 753 | 40 | commercial-license (GLM-5.3 License) | 33 | 27.8 | 22.7 |
| Step 5 Preview | 1M | 600 | 27 | commercial-license (StepFun Model License 1.0) | 33 | 12.6 | 10.3 |
| Claude Haiku 5.5 (Max) | 1M | – | – | proprietary | – | 327.9 | 325.8 |
| MiniMax-M3.1-Flash | 1M | – | – | proprietary | – | 22.6 | 18.3 |
| GLM-5.3-Flash | 1M | 320 | 18 | permissive (MIT) | 44 | 36.9 | 30 |
| Gemini 3.8 Flash (High) | 1M | – | – | proprietary | – | 30.3 | 26.5 |
| Muse Spark Open (Xhigh) | 1.05M | 816 | 42 | commercial-license (Muse Model License) | 28 | 15.9 | 12.9 |
| Mistral Large 4 Preview | 524K | 1000 | 49 | proprietary | – | 23.8 | 19.4 |
| GPT-6 Luna (Max) | 1M | – | – | proprietary | – | 88.5 | 84.8 |
| Qwen3.8 27B (Xhigh) | 256K | 27 | – | permissive (Apache 2.0) | 39 | 60.7 | 49.4 |
| K2 Horizon 375B A23B | 524K | 375 | 23 | permissive (Apache 2.0) | – | 4.9 | 4.4 |
| Beam 1.0 | 1.05M | 501 | 23 | permissive (Apache 2.0) | 39 | 7.6 | 6.2 |
| Nemotron 3.5 Super VL | 1M | 120 | 12 | permissive (OpenMDW-1.1) | 83 | 6.2 | 5.1 |
| Inkling (Xhigh) | 1M | 975 | 41 | permissive (Apache 2.0) | 39 | 17.5 | 14.4 |

## Benchmarks the API does not return, for work (website)

Scores are in percent and the Elo ratings are plain numbers.

| Model | Briefcase Elo | Briefcase rubric pass % | Briefcase analytical Elo | Briefcase presentation Elo | Briefcase cost to run, $ | GDPval-AA Elo | GDP-PDF all-pass % | Analyst Agent % | AutomationBench % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude Opus 5.5 (Max, Default Fallback) | 1801 | 61.2 | 2138 | 1715 | 1,915 | 1866 | 26.2 | 56.3 | 69.5 |
| Claude Sonnet 5.5 (Max, Default Fallback) | 1816 | 65.2 | 2111 | 1716 | 1,863 | 1838 | 25.8 | 57.5 | 71.8 |
| Muse Wonder Full (Max) | 1729 | 61.3 | 2116 | 1524 | – | 1857 | 32.6 | – | 71.3 |
| Kimi K3.1 Pro | 1678 | 50.4 | 1995 | 1666 | 657 | 1846 | 31.4 | 38.8 | 73.3 |
| Claude Opus 5.5 (High, Default Fallback) | 1683 | 58.9 | 1976 | 1551 | 571 | 1704 | 28.8 | – | 63.2 |
| Claude Fable 5.1 (Max, Default Fallback) | 1671 | 61.5 | 1963 | 1491 | 2,067 | 1755 | 26.2 | 57.5 | 59.4 |
| GPT-6 Astra (Max) | 1568 | 52.0 | 1756 | 1548 | 865 | 1574 | 31.0 | 51.2 | 68.5 |
| Gemini 4 Argon (High) | 1486 | 64.6 | 1559 | 1304 | 530 | 1624 | 21.8 | 48.8 | 77.5 |
| Muse Wonder (Max) | 1659 | 61.2 | 1962 | 1476 | 1,133 | 1770 | 30.6 | – | 68.1 |
| GPT-6.1 Sol (Max) | 1555 | 55.7 | 1770 | 1447 | 210 | 1596 | 31.0 | 50.0 | 64.9 |
| Grok 4.7 (Xhigh) | 1639 | 55.4 | 1939 | 1501 | 847 | 1714 | 20.0 | 52.5 | 65.6 |
| MiMo-V2.6-Pro | 1512 | 54.7 | 1795 | 1296 | 35 | 1683 | 19.2 | 37.5 | 58.6 |
| Qwen3.8 Max (0902) | 1611 | 58.0 | 1948 | 1383 | 1,781 | 1666 | 22.8 | 45.0 | 56.2 |
| DeepSeek V4.1 Flash 1017 (Max) | 1570 | 47.5 | 1766 | 1602 | 62 | 1746 | 17.2 | – | 66.6 |
| GLM-5.3 (Max) | 1505 | 51.3 | 1765 | 1351 | 514 | 1649 | 11.2 | 38.8 | 62.2 |
| Step 5 Preview | 1423 | 47.8 | 1540 | 1390 | 216 | 1587 | 14.8 | 35.0 | 51.0 |
| Claude Haiku 5.5 (Max) | 1575 | 52.3 | 1898 | 1431 | 61 | 1619 | 20.8 | 53.8 | 35.4 |
| MiniMax-M3.1-Flash | 1473 | 47.8 | 1649 | 1426 | 48 | 1458 | 20.8 | – | 72.5 |
| GLM-5.3-Flash | 1452 | 46.4 | 1627 | 1408 | 90 | 1642 | 15.4 | 25.0 | 60.4 |
| Gemini 3.8 Flash (High) | 1202 | 42.1 | 1138 | 1223 | 246 | 1436 | 21.0 | 46.3 | 59.9 |
| Muse Spark Open (Xhigh) | 1279 | 45.7 | 1256 | 1300 | 133 | 1401 | 18.6 | – | 49.7 |
| Mistral Large 4 Preview | 1391 | 45.2 | 1509 | 1356 | 217 | 1422 | 18.6 | – | 59.9 |
| GPT-6 Luna (Max) | 1336 | 41.2 | 1376 | 1394 | 15 | 1433 | 22.8 | 43.8 | 53.2 |
| Qwen3.8 27B (Xhigh) | 1394 | 47.8 | 1564 | 1286 | 257 | 1419 | 16.4 | – | 48.2 |
| K2 Horizon 375B A23B | 1294 | 41.6 | 1379 | 1254 | 0 | 1358 | 7.4 | – | 37.2 |
| Beam 1.0 | 976 | 31.4 | 983 | 856 | 34 | 1177 | 11.6 | – | 48.5 |
| Nemotron 3.5 Super VL | 999 | 26.9 | 997 | 998 | 47 | 1162 | 8.0 | – | 14.8 |
| Inkling (Xhigh) | 832 | 19.3 | 742 | 870 | – | 1072 | 12.8 | 23.8 | 5.0 |

## Benchmarks the API does not return, for knowledge and science (website)

| Model | Omniscience index | Omniscience accuracy % | Omniscience hallucination % | CritPt % | FrontierCode % | TB Science % | MMMU-Pro % | MLCR % | AA-3D Elo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude Opus 5.5 (Max, Default Fallback) | 46.4 | 66.2 | 58.6 | 31.7 | 52.2 | 59.0 | 87.7 | 27.8 | 1196 |
| Claude Sonnet 5.5 (Max, Default Fallback) | 32.3 | 53.9 | 47.0 | 31.4 | 45.8 | 53.3 | – | 41.7 | 1199 |
| Muse Wonder Full (Max) | 30.1 | 43.2 | 23.0 | 32.9 | 44.9 | 37.1 | – | – | – |
| Kimi K3.1 Pro | 29.5 | 51.0 | 43.9 | 24.6 | 47.1 | 34.3 | 83.9 | – | 1110 |
| Claude Opus 5.5 (High, Default Fallback) | 40.6 | 64.6 | 67.6 | 30.9 | 54.0 | 49.0 | 85.8 | 15.0 | – |
| Claude Fable 5.1 (Max, Default Fallback) | 43.5 | 67.2 | 72.6 | 29.7 | 49.0 | 43.3 | – | 15.6 | 1135 |
| GPT-6 Astra (Max) | 43.4 | 62.6 | 51.3 | 31.7 | 47.0 | 63.3 | 86.9 | 41.7 | 1164 |
| Gemini 4 Argon (High) | 42.4 | 49.9 | 15.1 | 27.1 | 43.5 | 52.9 | – | 13.9 | 1153 |
| Muse Wonder (Max) | 25.5 | 41.1 | 26.5 | 28.3 | 46.5 | 25.7 | – | 22.2 | – |
| GPT-6.1 Sol (Max) | 41.5 | 62.1 | 54.3 | 31.7 | 49.1 | 58.1 | 86.0 | 38.3 | 1119 |
| Grok 4.7 (Xhigh) | 32 | 47.4 | 29.3 | 17.7 | 33.8 | 4.8 | – | 20.0 | 995 |
| MiMo-V2.6-Pro | 8.4 | 34.8 | 40.6 | 26.6 | 45.4 | 5.7 | – | 12.8 | 983 |
| Qwen3.8 Max (0902) | 12 | 31.7 | 28.8 | 17.7 | 43.2 | 11.9 | 82.8 | 20.0 | 945 |
| DeepSeek V4.1 Flash 1017 (Max) | 4.7 | 42.9 | 66.8 | 24.0 | 43.7 | 12.9 | 80.6 | 26.7 | – |
| GLM-5.3 (Max) | 14.3 | 33.9 | 29.6 | 19.1 | 40.1 | 9.5 | – | 17.2 | 783 |
| Step 5 Preview | 16.4 | 41.5 | 43.0 | 20.9 | 38.4 | 2.4 | 76.4 | 18.3 | 854 |
| Claude Haiku 5.5 (Max) | 10.7 | 36.4 | 40.4 | 18.9 | 41.8 | 20.0 | – | 35.0 | 998 |
| MiniMax-M3.1-Flash | 15.6 | 56.2 | 92.8 | 22.3 | 38.6 | 3.3 | 79.1 | 16.7 | – |
| GLM-5.3-Flash | 7.5 | 27.5 | 27.6 | 15.4 | 41.0 | 4.8 | – | 11.7 | 937 |
| Gemini 3.8 Flash (High) | 29.6 | 54.6 | 55.2 | 18.3 | 36.4 | 10.0 | 85.6 | 10.6 | 966 |
| Muse Spark Open (Xhigh) | 24.6 | 39.3 | 24.1 | 14.9 | 27.6 | 1.9 | 80.9 | 7.8 | – |
| Mistral Large 4 Preview | -5.3 | 25.8 | 41.9 | 10.6 | 41.5 | 4.8 | 76.4 | 7.8 | 870 |
| GPT-6 Luna (Max) | 0.7 | 43.8 | 76.7 | 19.4 | 41.9 | 8.6 | 79.7 | 26.1 | 1000 |
| Qwen3.8 27B (Xhigh) | -10 | 15.6 | 30.3 | 5.4 | 34.2 | 0.5 | 76.3 | 22.8 | – |
| K2 Horizon 375B A23B | -3 | 18.2 | 25.9 | 4.6 | 32.1 | 0.0 | – | 12.2 | – |
| Beam 1.0 | 1.5 | 33.1 | 47.2 | 13.1 | 24.3 | 0.5 | – | 17.8 | – |
| Nemotron 3.5 Super VL | -4.2 | 23.3 | 35.8 | 10.6 | 25.5 | 0.0 | – | 13.3 | – |
| Inkling (Xhigh) | 2 | 41.5 | 67.7 | 5.4 | 15.8 | 0.0 | 73.5 | 6.1 | 583 |

The page also carries itBenchSre (9 of 28), apexAgents (2 of 28), enterpriseOpsGym (6 of 28), which cover too few of the 28 to compare, and a personality benchmark that is not a score of quality.
