# Brief: extract Artificial Analysis figures by script

You work in the repository of the Aether plugin, at its root (the folder that holds plugins/aether/). The owner is choosing which Claude model and effort each role of the plugin runs on, to spend the least dollars per task for the points the role needs. His Claude plan has one limit, spent by the dollar cost of each model, so dollars per task is the measure. You gather the figures. You decide nothing and change no tracked file.

## What to read, and the rules

1. **The API first.** `https://artificialanalysis.ai/api/v2/data/llms/models`, header `x-api-key`. The key is `ARTIFICIAL_ANALYSIS_API_KEY`, in the environment or in `~/.local/share/aether-plugin/.env`. Never print it, never write it into a file. `node .claude/skills/artificial-analysis/aa-api.js` lists what it gives (intelligence, Terminal-Bench 4.0, LCR, HLE, SciCode, price per token, speed).
2. **The model pages only for what the API lacks** (cost per task and its split by token type, tokens per task, AA-Briefcase, the cost and time of each benchmark, the hallucination rate, the capability indexes). AA's terms of use forbid automated requests to its website (section 3.3 (b)(vi); see `docs/reference/artificial-analysis.md`). The owner has approved ONE pass for this, and you may not widen it: one request per slug, at least 1.5 s apart, every page saved in a cache folder so that a parser change never costs a request, an honest user agent, no retries in a loop, stop at the first 403 or 429 and report it.
3. Never run the pages step twice on the same slug. If a cache folder already holds the page, parse it from there.

## How

`node .claude/skills/artificial-analysis/aa-extract.js [slug ...] --cache <dir> --out <file>` does it. With no slug it reads every slug of `plugins/aether/config/pairs.json` (22 pages). Put the cache and the output in a folder you create outside the repository, or in `specs/<feature>/evidence/` if the owner names a feature; never in a tracked folder you were not given.

A page embeds, as JSON in a script, the data of the 27 models it compares. Each model object starts at `"slug":"<slug>","name":"…","shortName":"…"` and runs to the next such start. The page's own model is the one whose `"briefcaseBreakdown":{"overall":{"elo":` block follows the page's slug: never take the first block of the page. The page of a model at `max` has no effort suffix (`claude-sonnet-5-5`). If the script fails on a field, fix the parser and run it again from the cache.

## What to check before you report

- The cost per task of each page (`objects.intelligenceIndexCostPerTask.cost.total`) equals `costPerTaskUsd` of `plugins/aether/config/pairs.json` for each pair that has one; list any that differ.
- The Terminal-Bench, LCR and HLE of each page equal the API's for the same model and effort.
- List every field that is null, and for which pages.

## What to report (short, in Spanish)

Where the cache and the JSON are; how many requests you made; the checks above, each with its result; the fields that are null; and, per model and effort, the figures the owner asked for in a plain list: intelligence, Terminal-Bench 4.0 with its cost per task, AA-Briefcase (Elo, rubric pass rate, analytical quality), LCR, HLE, the hallucination rate of AA-Omniscience, the cost per index task split by token type, and the time per task. Say what you could not read, and why.
