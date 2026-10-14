# Models released since 2026-01

The LLMs our harnesses offer, from Artificial Analysis (AA) figures and the harnesses' own listings, so a session reads this folder and not an API. [`models.json`](models.json) is the list an orchestrator reads: each model in use with its harness, the id to pass to the CLI, its efforts, its scores and its profile. The rest of this page is its reading copy.

## Refresh

```
node scripts/build-models-index.js --write                  # AA API: ARTIFICIAL_ANALYSIS_API_KEY, or .env in ~/.local/share/aether-plugin
node scripts/build-models-index.js --from raw.json --write  # a saved AA answer, no network
```

It rewrites `models.json` and the generated part below, and exits 1 when a model has no profile. Grouping: an AA slug ending in an effort (`-low`, `-high`, `-max`, `-reasoning`...) joins the slug without it when AA's name names that effort; a date or any other word makes a family of its own.

## Add a harness

1. Capture its listing into `harness-models.json` (`listedBy`, `effortVia`: `id` when the effort is part of the id, `flag` when it is a flag, `models`): agy `agy models`, grok `grok models`, cursor `cursor-agent --list-models`, codex the `models` of `~/.codex/models_cache.json`.
2. Add it to `DEFAULT_HARNESSES` in the script (or try it with `--harnesses agy,grok,codex`); without a listing the script says so.
3. Write a profile for each new model in `profiles.json` from its maker's pages, then refresh.

<!-- models-index:start -->
## Rules

1. Only the newest generation of each line is used (Sonnet 5.5, not Sonnet 5); the older ones are superseded.
2. Only a model the CLI of a chosen harness lists is in, whatever Artificial Analysis lists; a model only the lane table names is not offered.
3. Every model has a profile written from its maker's pages, with its sources and the date checked; without one the build exits 1.

## Models in use

| Model | Harness | Efforts taken | Intelligence | Terminal-bench | $/M in/out | Tokens/s |
|---|---|---|---:|---:|---:|---:|
| Claude Sonnet 5.5 `claude-sonnet-5-5` | agy* | low, medium, high | 46.8 | 0.439 | 2 / 10 | 89.6 |
| Claude Opus 5.5 `claude-opus-5-5` | agy* | low, medium, high | 53.6 | 0.566 | 4 / 20 | 69.3 |
| Gemini 3.8 Flash `gemini-3.8-flash` | agy* | low, medium, high | 40.9 | 0.197 | 0.75 / 3.75 | 137.9 |
| Grok 4.7 `grok-4.7` | grok* | low, medium, high, xhigh | 46.4 | 0.258 | 2 / 6 | 62.9 |

Generated on 2026-10-13 from https://artificialanalysis.ai/api/v2/data/llms/models; the harnesses' listings are of 2026-10-13. Scores are at the highest effort the harness takes that AA scored (`models.json` has each effort); `*`: in the lane table.

## What each is for (`profiles.json`, from the maker's pages)

- **Claude Sonnet 5.5** `claude-sonnet-5-5` (agy), Anthropic: "The best combination of speed and intelligence." Comparative latency: fast. context 1M, output 128K; default effort high; $2 / $10 per M; cutoff 2026-06. Claude API id claude-sonnet-5-5; not retired before 2027-09-28. Through agy it takes low, medium and high only. Adaptive thinking: the model decides how much to think, steered by effort. (checked 2026-10-13)
- **Claude Opus 5.5** `claude-opus-5-5` (agy), Anthropic: "For long-running agentic coding and knowledge work." Anthropic's advice: start here for most workloads, and move to Fable 5.1 when evals on Opus 5.5 at higher effort still fall short. Comparative latency: moderate. context 1M, output 128K; default effort medium; $4 / $20 per M; cutoff 2026-06. Claude API id claude-opus-5-5; not retired before 2027-09-22. Through agy it takes low, medium and high only. Thinking is always on (adaptive). (checked 2026-10-13)
- **Gemini 3.8 Flash** `gemini-3.8-flash` (agy), Google: "Google's most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows." context 1.05M, output 66K; default effort –; $0.75 / $3.75 per M; cutoff –. Gemini API id gemini-3.8-flash, stable. On agy it is offered at low, medium and high. The effort `minimal` is not supported and returns an error. Knowledge cutoff and price are not on Google's model page. (checked 2026-10-13)
- **Grok 4.7** `grok-4.7` (grok), xAI (SpaceXAI): "Frontier model, built for coding, agentic tasks, and knowledge work." The default model of Grok Build. context 500K, output –; default effort high; $2 / $6 per M; cutoff 2026-05. xAI API (id grok-4.7), Grok Build (default), Cursor on all plans, OpenRouter, Vercel and Cloudflare gateways. The docs say there is no text output limit. Artificial Analysis measured low, high and xhigh, not medium. (checked 2026-10-13)
- **Grok 4.7 Fast** `grok-4.7-build-fast` (grok, no figures), xAI (SpaceXAI): The same Grok 4.7 served on faster infrastructure: faster and dearer, not a different or smaller model. context 500K, output –; default effort high; $4 / $12 per M; cutoff 2026-05. Only in Cursor and Grok Build, billed through the plan there; not in Grok Build's free tier; not on the public xAI API. Not a cheap lane: it is billed through the plan at twice the token price of Grok 4.7, and the lane table does not list it. xAI's page does not give the model id and does not mention `build-fast`: that this id is the Fast variant rests on the owner's word and on `grok models` listing it. The docs do not state the speed multiple; third-party sites say about 2x output speed. Artificial Analysis has no entry for it, so it has no scores here; its quality is Grok 4.7's. (checked 2026-10-13)
- **Gemini 4 Argon** `gemini-4-argon` (agy, not offered), Google: A flagship reasoning model, with a unified 1M context window and long decodes up to 1M tokens. context 1M, output 1M; default effort –; $2 / $10 per M; cutoff –. Stable in the Gemini API (id gemini-4-argon). Rolled out on 2026-10-13 to Google AI Pro and Ultra in the Gemini app. In Antigravity (agy) the press says AI Ultra only; `agy models` does not list it on the owner's plan (Pro). The owner expects it for Pro soon. Not offered on agy yet, so the design seats that name it fall back to the native agent. Inputs, outputs, effort levels and cutoff are not on the pages read. (checked 2026-10-13)

## Left out

- Not offered: agy `gemini-4-argon` (judge, writer, examiner): named by the lane table, and not listed by agy models.
- No figures: grok `grok-4.7-build-fast`: offered, with no Artificial Analysis entry, so no figures; not a lane: the lane table does not list it.
- Superseded, not to be used: grok `grok-4.6`, `grok-4.5` by `grok-4.7`.
- Out of scope: agy `gpt-oss-120b`: Artificial Analysis lists gpt-oss-120b, released 2025-08-05, before 2026-01-01.
<!-- models-index:end -->
