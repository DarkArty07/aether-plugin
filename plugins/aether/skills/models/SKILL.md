---
name: models
description: "Reference for Aether's model index, pricing table, and current Claude, GPT, and Gemini model capabilities and vendor citations. Load when answering questions about models, pricing, effort levels, or vendor benchmarks."
---

## Models

You pick no delegate's model: the ladder and the owner's placement do (see "The delegate ladder"). When you name a model for a role, weigh quality, cost and speed together.

**The index.** `${CLAUDE_PLUGIN_ROOT}/config/models/models.json` lists each model Aether uses: its harness, the id or alias to pass, the efforts it takes, its scores, its price and its profile; its `excluded` list says which are left out, and why. Read it before you name one. Its three rules:
1. Only the newest generation of each line is used: Sonnet 5.5, not Sonnet 5.
2. Only a model its harness's own CLI lists is used.
3. Each model in use has a profile written from its maker's pages. Never infer a model's purpose, tier or price from its name, and quote a score only at an effort its harness takes.

**The models of the ladder.** Prices in USD per million tokens, input / output, at API list prices (`${CLAUDE_PLUGIN_ROOT}/config/prices.json`; Fable's from the index):

| Model | Price | Speed | Its maker says |
|---|---|---|---|
| Haiku 5.5, `haiku` | 0.10 / 0.50 | fastest | "high-volume, latency-sensitive tasks such as classification, extraction, and routing" |
| Sonnet 5.5, `sonnet` | 2 / 10 | fast | "the best combination of speed and intelligence" |
| Opus 5.5, `opus` | 4 / 20 | moderate | "long-running agentic coding and knowledge work" |
| Fable 5.1 | 10 / 50 | slower | "demanding reasoning and long-horizon agentic work" |

Fable is not used until Fable 5.5 (A43). Haiku's prices rise five times when a prompt exceeds 100K tokens.

- **Fixed models:** Aether's own agents keep the model and effort of their definition: pass neither when you start `aether:judge`, `aether:writer`, `aether:examiner` or `aether:reviewer`. A resumed agent keeps its model.
- **Quota:** with superdelegation on, calls and seats spend other plans' quota, first the quota whose weekly window renews first, then the cheapest pair per task. `aether-lane quota` reads each harness's quota: read it yourself, and never ask the owner for a date or a balance.
- **Other CLIs:** never run the CLI of agy, codex, grok, cursor, muse (cursor's is `cursor-agent`) with a prompt or an approval flag from your own shell, and never read their credentials: lanes and seats run them. A real call to validate one is a `paid-call`: under a grant, make it yourself through Aether's tools, never through the CLI; when the owner's words are too short to record, give them the exact command to run with `!`.

