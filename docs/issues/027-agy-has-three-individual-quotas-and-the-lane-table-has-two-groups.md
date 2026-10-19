# agy has three individual quotas and the lane table has two groups, so one exhausted model can leave the others out

**Type:** bug (lanes, quota, router)
**Date:** 2026-10-19
**Found in:** the owner's question of why a read-only delegate went to neither agy nor grok, in the Lead's session e591573c
**Status:** fixed on the branch `worktree-agent-a53e7f9e50ca97646`, not released (decision A60). The origin of the mark found in the owner's session was not traced; the fix removes the shared unit, not that mark.
**GitHub:** not filed

## What happened

- The owner, who knows the agy plan: «agy tiene 3 cuotas en realidad. 1: Argon 2: Flash 3: Opus Sonnet. Eso sí es un bug nuestro, el código no está adaptado». Of those, he wants to spend Argon and Flash: «no me interesan la cuota de esos modelos [Claude en agy] porque agy da muy poquito de modelos claude, me interesa mucho gastar la cuota de Argon y Flash».
- `aether-lane quota agy --json` (2026-10-19 19:06 UTC) reports two groups, `gemini` («Gemini Models») and `claude` («Claude and GPT models»), each with a weekly and a 5-hour window. Argon and Flash cannot be told apart in the reading.
- `config/lanes.json` gives both `gemini-3.8-flash` and `gemini-4-argon` the group `gemini`. A mark is one file per harness and group (`lanes/marks/agy__gemini.json`), so it holds both.
- That file says `at` 2026-10-16 06:17 UTC, `until` 2026-10-22 23:46 UTC, `confirmed: false`. Four Judge-seat calls on `gemini-4-argon-high` were refused on 2026-10-16 between 04:23 and 04:49 UTC with `Individual quota reached... Resets in 163h` while the group read 99 % (issue 021). The mark's date and length are not those refusals', and the log line that wrote it was not found: its origin is not traced.
- A read-only delegate (explore, level B) with `lanes` on stayed on Claude Haiku `high`. The router's quota step listed `agy gemini-3.8-flash medium` as `excluded`, why `mark`, note «marca vigente; la lectura con saldo no la desmiente», and the agy `claude` group as `unserved`, `no-rung`.

## Why

The group is at once the unit of the reading, of the mark and of the order. With one reading for two quotas, one refusal or one odd reading takes both out for days (issue 015 is the same shape).

## Impact

- `gemini-3.8-flash`, the only agy rung of level B that the router can use, and the swarm's Haiku implementer lane, are out whenever Argon, the design seats' model, is out, and the other way round.
- No quota of the owner's other plans is spent on those calls; they run on Claude. Nothing is lost.

## Proposals

1. Three table groups, `argon`, `flash` and `claude`. The `groups` map keeps saying which `/usage` group a key reads, so `argon` and `flash` both read «Gemini Models» and show the same windows. Marks, order and choice stay per key.
2. A refusal marks the group of the model it refused until the reset it states (the second half of issue 021).
3. An existing mark file of a group that is no longer in the table is ignored without error.
4. The `claude` group stays as it is. The router already leaves its rungs out (`native-measure-only`) and the owner does not want that quota spent.

## Acceptance

- A refusal of Argon leaves `gemini-3.8-flash` usable, and the other way round.
- Two keys can read one `/usage` group.
- The old `agy__gemini.json` is ignored by `aether-lane quota`, `status` and the router.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.2 installed, Sonnet 5.5 as the Lead, agy 1.4.2, Linux (WSL2).
