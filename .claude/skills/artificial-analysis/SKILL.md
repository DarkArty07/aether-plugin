---
name: artificial-analysis
description: Use when a decision about which model or effort a role runs on needs figures: intelligence, cost per task, tokens per task, or a benchmark by effort. Says where Artificial Analysis (AA) keeps each figure (its API, its model pages, its website charts), what each source does not give, and how to read the figures for Aether's roles.
---

# Artificial Analysis

AA measures every model at every effort on the same tasks and publishes the intelligence index, the cost and the tokens of one task, and the score of each benchmark behind the index. It is the source of `config/pairs.json` and `config/models/models.json`. The owner reads it on the website and sends screenshots; this skill is how to read the same figures yourself.

**Terms of use.** `docs/reference/artificial-analysis.md` records that AA's terms (section 3.3 (b)(vi), read on 2026-10-26) forbid automated requests to its website. Only the API is the supported way for a script. The `pages` command below reads the model pages and was used once, on 2026-10-26, before that was seen; it is kept at the owner's request and must not be run again without the owner's yes. The figures it gave are saved in a text file listed at the end.

## Three sources, and what each gives

| Source | Gives | Does not give |
|---|---|---|
| **API** (`/api/v2/data/llms/models`, header `x-api-key`) | Intelligence index, Terminal-Bench 4.0, long-context reasoning (LCR), HLE, SciCode, price per token, speed, first-token time | Cost per task, tokens per task, AA-Briefcase, GDPval, CritPt, AA-Omniscience; the coding index, IFBench and TB hard are null for the 5.5 models |
| **Model pages** (`https://artificialanalysis.ai/models/<slug>`) | Per benchmark: score, output tokens and cost of one task; the cost of an index task split by token type (answer, reasoning, cache write, cache read, input); AA-Briefcase (Elo, rubric pass rate, analytical quality, presentation) | A figure for a model that AA does not publish at that effort (Gemini 3.8 Flash `low` has no cost; Muse is measured only at `max`) |
| **Website charts** (Intelligence, Capability Indexes, Benchmarks, Token Use, Cost, Speed, Latency) | The same figures for the 28 models the owner picks, and the Pareto line of each chart | Anything for a model that is not selected: the owner adds it with "Add model from specific provider" |

The key is `ARTIFICIAL_ANALYSIS_API_KEY`, in the environment or in the `.env` of `~/.local/share/aether-plugin/` (what `scripts/refresh-lanes.js` reads). Never print it.

## Run it

`node .claude/skills/artificial-analysis/aa-api.js ["name regex"] [--json]` lists what the API gives for the matching models (default: Claude 5.5). It reads the API only.

`node .claude/skills/artificial-analysis/aa-pages.js api ["name regex"]` does the same.

`node .claude/skills/artificial-analysis/aa-pages.js pages [slug ...] [--json]` reads the pages (default: every slug of `pairs.json`), 1.2 s apart, and prints Briefcase, Terminal-Bench and the cost split of each. See the terms of use above before you run it.

`node .claude/skills/artificial-analysis/aa-extract.js [slug ...] [--cache <dir>] [--out <file>]` reads every field a page carries about its own model (the capability indexes, the hallucination rate of AA-Omniscience, the cost split by token type, the cost and tokens of each benchmark, the time per task, the speeds, the prices of the cache) once, keeps each page in the cache and parses it from there, so a change to the parser never costs a new request. Same warning. `agent-prompt.md` is the brief for another agent to run it.

## Traps

- **Names.** The page slug of a model at `max` has no effort suffix (`claude-sonnet-5-5`); the others end in `-low`, `-medium`, `-high` or `-xhigh`. The Claude 5.5 models carry "(…, Default Fallback)" in their names. A slug of `pairs.json` is the page slug.
- **A page carries 27 models.** Its first AA-Briefcase block is not the page's own for the `max` pages. The script picks the block whose nearest `"slug"` before it is the page's slug; if it finds none it says "own block not found" and you must not take the first one.
- **Two costs.** The cost per index task (`costPerTaskUsd` of `pairs.json`) is weighted across all the evaluations of the index. The cost of one Terminal-Bench or Briefcase task is not weighted and is several times larger. Never compare one with the other.
- **Cache is most of the cost.** In an index task, cache reads and writes are about 52 to 67 % of the dollars; the effort changes the reasoning tokens and, through the longer loops, the cache too.
- **Units.** The API gives benchmark scores as fractions (Terminal-Bench 0.60), the pages too; Briefcase and GDPval are Elo.
- **Speed.** `max` efforts have first-token times of minutes (Sonnet `max` 322 s, Opus `max` 621 s, Haiku `max` 279 s). Speed is out of the policy, but a deadline can cut a call that is slow to start.
- **The page can change.** The data is a script's JSON, not a public contract. If a field is missing, say so, and say which source the figure came from.
- **The scores move.** AA re-scored its models between 2026-10-26 and 2026-10-29 (Haiku 5.5 `max` 43.4 to 36.2, GPT-6 Luna `max` 38.1 to 27.8, GPT-6 Astra `max` 52.7 to 56.9). Compare two models only with figures read on the same day from the same source; a row of `pairs.json` set against today's API is not a comparison.

## Reading it for a role

- **Code in a terminal (the implementer):** Terminal-Bench 4.0, with its cost.
- **Documents, analysis and reports (the Writer, the Judge):** AA-Briefcase, the rubric pass rate and the analytical-quality Elo.
- **Reading a long text:** LCR. It barely moves with the effort.
- **Nothing measures "finding what is missing"**, which is what the Judge, the supervisor and the final review do. Use Aether's own cases (the errors that went through) for that.
- **Compare by dollars per task for the points the role needs**, never by price per token: the owner's Claude plan has one limit, spent by the dollar cost of each model. A pair that costs more and gives no more points than another is dominated.
- **Efforts are not equal.** Look at each model's whole curve: Opus `max` gives what Opus `xhigh` gives in code, and Sonnet `max` beats Opus `max` at a lower price.

## The top tier waits for its next generation

The owner's rule (A43 for Fable, extended to GPT-6 Astra on 2026-10-29): the top model of a line stays out of use while a much cheaper model, from the same maker or another, reaches nearly the same points. It re-enters with the next generation of that top tier, not before, and then it is measured again like any new model.

- **Fable 5.1** is out until Fable 5.5. On 2026-10-26 Opus 5.5 `high` scored 53.6 against Fable's 53.4 at US$ 1.82 per index task against US$ 7.63 (`docs/models/artificial-analysis-2026-10-26.md`), and Opus `max` scored 57.6.
- **GPT-6 Astra** is out until GPT-6.1 Astra. On 2026-10-29 (API) Astra `max` scored 56.9 in intelligence and 59.1 % in Terminal-Bench 4.0 against GPT-6.1 Sol `max` at 54.5 and 56.1 %, a gap of 2.4 points, and Sol costs a fifth per token (2 / 10 against 10 / 50 US$/M).
- **How to apply it.** When a harness brings its models, set its top tier against the best cheaper model in reach with same-day figures, and write down the points and the dollars of both. If the cheaper one nearly matches it, the top tier goes to the `excluded` list of the harness (`harness-models.json`, then `models.json`) with the reason, the owner's words and the model whose release reopens the question. How near is "nearly" is the owner's call: bring him the gap and the price, not a threshold of your own.
- **What it is not.** It is not a ban on a line. The middle and low tiers (Sol, Terra and Luna; Sonnet and Haiku) are the ones Aether uses, and a top tier is measured at once when its next generation is listed.

Record the date and the source of every figure you use in the evidence folder of the feature (`specs/NNN-<topic>/evidence/`), as spec 009 did, and refresh the tables with `scripts/refresh-lanes.js`.

## The figures read on 2026-10-26

- `aa-extract-2026-10-26.json`: every field of the 22 pages of `pairs.json`, read once with `aa-extract.js` (22 requests). The cost per task of each page equals the `costPerTaskUsd` of `pairs.json` for all 21 pairs that have one.
- `aa-pages-extract-2026-10-26.txt`: the tables the first, partial reading printed, with its wrong rows marked. The JSON above replaces it.
