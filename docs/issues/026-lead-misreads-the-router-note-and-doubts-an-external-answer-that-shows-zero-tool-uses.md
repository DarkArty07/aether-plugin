# A Lead told the owner a delegate ran on a rung the router had replaced, and doubted an external answer that showed 0 tool uses

**Type:** bug (router notes, `command` mode and external delegates)
**Date:** 2026-10-16
**Found in:** the second round of real sessions of the router, the Lead's session 56b71739
**Status:** fixed in 0.12.2
**GitHub:** not filed (found and fixed in the same session)

## What happened

- **The replaced choice.** In `command` mode, a Lead at `low` effort was asked to override the router. It passed `model: haiku` and `effort: medium` but did not write the `ROUTER-OVERRIDE: <reason>` line, so the router replaced them with its own rung, Haiku `high`, and sent the note «router: this task runs on claude haiku high. Level B (general): shape explore (0.6); stakes 0; base B. You asked haiku medium.». The Lead read the last sentence as what ran and told the owner «El subagente corrió en Haiku con esfuerzo medio, como pediste». The usage meter showed Haiku `high`. The same session at `xhigh`, the Lead's usual effort, wrote the line and the choice was kept.
- **The answer with 0 tool uses.** Claude Code lists no tool uses and no tokens for an agent that the mod answers without a model request, which is how an external delegate on Grok or agy reaches the Lead. In three of five real sessions the Lead noticed `tool_uses: 0`, said it could not confirm the delegate had read any file, and told the owner to treat the summary with caution. The answers were right (the delegate had read the files in its own copy).

## What the fix does

- The note for a replaced choice says so: «You asked haiku medium, and the router replaced it; this delegate runs as this note says. A choice of yours holds only with the line ROUTER-OVERRIDE: <reason> in the brief and model and effort passed.» A choice that matches the decision, and every note in `advise`, keep the short form.
- `aether-route delegate` returns an `attribution` with the model, the effort and the harness, and the mod puts it before the answer: «Aether router: this answer is from grok-4.7 at low on grok, run in a disposable copy of the checkout. Claude Code lists no tool uses or tokens for it because Aether handed you the answer without a Claude request.»
- Both have a test that fails on the 0.12.1 code.

## Impact

- The owner could be told a delegate ran at an effort it did not run at, and an honest external answer was presented as unverified. Neither changed what ran or what it cost.

## Proposals

1. The bootstrap line for `command` could say what the note will say when a choice is replaced. The note now carries it at the moment the Lead needs it, so this is optional.

## Acceptance

- A Lead that passes `model` and `effort` in `command` without the line is told that the router replaced them, and how to keep them.
- The Lead sees where an external answer came from, and why its tool uses show 0.

## Environment

Claude Code 2.1.301, Aether plugin 0.12.1, Sonnet 5.5 as the Lead, Grok 4.7 and agy `gemini-3.8-flash` as the delegates, Linux (WSL2).
