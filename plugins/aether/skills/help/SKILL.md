---
name: help
description: Say what Aether adds and how to use it, organized by what you want to do.
argument-hint: "[topic]"
disable-model-invocation: true
---

# Help

The person called `/aether:help`, maybe with a topic, as in `/aether:help spend`. You answer from the map below. You change nothing and start no work.

**How to answer.**
- Answer in the person's language, short. Command names stay as they are.
- Each item has the shape: what you can do, then the exact command or words, then the guide to read when its section has one.
- With no topic, open with one line on what Aether is (an opt-in mode where the Lead turns a request into a reviewed spec and plan, builds it and reports in one brief; plain `claude` stays normal mode), then give the sections as "if you want to…" lines, and end by asking what they want to try. With a topic, answer only the section or sections that touch it.
- Use short lists, no tables. Link one guide per item: the Spanish page when you answer in Spanish, the English one otherwise (the Spanish pages are under `docs/es/`).
- Name only what is in this map. Asked about a skill it does not hold, list `${CLAUDE_PLUGIN_ROOT}/skills/` to confirm whether it exists; `using-aether`, `swarm` and `autonomous-runs` are the Lead's own, which it loads itself, not commands to type. For a topic the map does not cover, say so and offer the nearest section; invent nothing.

## Start and resume
- Start Aether mode: `aeth` in a terminal, in the project folder (or the name the person chose).
- Continue the last conversation: `aeth -c`. Pick an older one: `aeth --resume`. One task, with no screen: `aeth -p "<task>"`.
- Set up or change the choices (permissions, harnesses, command name): `/aether:setup`. It can be run again.
- Something fails or is missing (Claude Code, Node, git, the command, the workflows): `/aether:doctor`.
- Tidy a project: `/aether:tidy [project or folder]`. Reports what it would move or delete and changes nothing without your yes.
- The long form, with no setup: `claude --agent aether:lead --effort xhigh`. It lacks the launcher's extras: Claude Code's own permission mode applies, and aether-guard only records an irreversible command instead of refusing it.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/install-and-start.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/instalar-y-arrancar.md

## Ask for work
- Say it to the Lead in your own words, as you would to a colleague. A first request: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/first-request.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/primera-peticion.md
- The Lead picks one of three paths and says why: direct (the Lead itself, a very bounded change of a few tool calls), a delegate task (one subagent, starts on Haiku and rises only when it must, unless your own words place it on Sonnet or Opus), or the swarm (`/aether:run`, an approved plan of three or more tasks, in parallel).
- A big request goes in order: the Lead writes back what it understood, asks at most five questions, writes the intent card and runs `/aether:design` (spec, plan, tasks and a hidden exam, reviewed by a Judge). Then it stops at the plan with a brief that recommends how to build, and your yes starts the build; with permission to work for hours, it builds on its own.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/whole-feature.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/feature-completa.md

## Read and answer the brief
- Every brief opens with «Espera tu sí» (what only you can decide, and the irreversible actions nobody authorized) and «Supuestos» (what the Lead assumed, most likely to be vetoed first): read those two first. The brief of a run puts its result above them (`cumplida`, `parcial` or `no terminada`).
- Answer an item in plain words: «sí» authorizes that action once; a general «sí, todos los merges a main» also records a standing grant; «no» makes the Lead go on with what does not depend on it. Each item says how to undo it and the exact command.
- Under `aeth`, aether-guard refuses the action even after your «sí» until a grant covers it, so the Lead records your reply as a session grant, runs the action and revokes it; a reply under 12 characters gets the exact command in the brief, for you to run.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/read-the-brief.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/leer-el-brief.md

## Work for hours
- Say it in your own words, for example «trabaja autónomamente» or «trabaja por horas». The Lead starts a run, keeps a diary, works while work remains and writes the brief at the end.
- The ceilings are 8 hours and US$ 50 unless you name others: say a number and it is used.
- The quota brake: at 95% of your five-hour window (the `quotabrake` option) it warns you and pauses the run until the window resets, then resumes on its own.
- A push, a merge to `main`, a publish, a deploy, a delete or a change of credentials still waits for your yes in the brief, unless you authorized that class of action.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/work-for-hours.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/trabajar-horas.md

## Use other harnesses (superdelegation)
- Send the work that is not the Lead's to other coding CLIs you already pay for, while their quota lasts: turn on the `superdelegation` option and list them in `harnesses` (`agy`, `codex`, `grok`, `cursor`, `muse`). They run without permission prompts. It is off by default and works only on Linux; native Claude is the fallback.
- See the settings and each harness's quota: `/harnesses`.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/other-harnesses.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/otros-harnesses.md

## See the spend
- This session's list-price spend, by model, effort and role, plus the calls to other harnesses: `/spend`. As JSON: ask the Lead to run `aether-report --spend`; in a plain terminal it is not on the `PATH`, so run its file by the path the guide gives. The delegate tasks and how each climbed: `aether-report --delegates`, the same way.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/see-the-spend.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/ver-el-gasto.md

## Audit a project
- To learn what is pending in the project, from the most urgent to the least: `/aether:audit [topics] [--no-tests]`. The Lead runs the automated analysis (tests, dependencies, secrets, hotspots), asks once which topics to audit, reviews and verifies with read-only delegates, and hands back one list from P0 to P3 for you to choose from. It changes nothing in the project and fixes nothing; what you choose becomes a GitHub issue.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/guide/audit.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/auditar-un-proyecto.md

## Spec Kit skills and workflows
- Write a spec by hand: `/aether:specify`, then `/aether:plan`, then `/aether:tasks`. The project's principles: `/aether:constitution`. The Lead usually does these through the design.
- Design from an intent card: `/aether:design`. Build an approved plan with the swarm: `/aether:run`. Both are workflows and need the Workflow tool.

## Options
- The plugin has eight options (`superdelegation`, `harnesses`, `ops`, `deadlines`, `quotabrake`, `brakepush`, `observedev`, `autoissue`). Change them with `/plugin` → Installed → aether → Configure options; `/aether:setup` sets the first two.
- Guide (English only): https://github.com/DarkArty07/aether-plugin/blob/main/docs/guide/options.md

## Everything Aether adds, and keeping it current
- Every command, agent, panel and option, and a "I want X, do Y" sheet: https://github.com/DarkArty07/aether-plugin/blob/main/docs/what-aether-adds.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/que-agrega-aether.md
- Update or uninstall: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/update-and-uninstall.md, https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/actualizar-y-desinstalar.md
