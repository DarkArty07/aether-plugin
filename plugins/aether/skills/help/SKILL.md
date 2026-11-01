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
- Each item has the shape: what you can do, then the exact command or words, then the guide to read.
- With no topic, open with one line on what Aether is (an opt-in mode where the Lead turns a request into a reviewed spec and plan, builds it and reports in one brief; plain `claude` stays normal mode), then give the sections as "if you want to…" lines, and end by asking what they want to try. With a topic, answer only the section or sections that touch it.
- Use short lists, no tables. Link one guide per item: the Spanish page when you answer in Spanish, the English one otherwise.
- Name only what is in this map. Before you name a skill that is not here, list `${CLAUDE_PLUGIN_ROOT}/skills/` to confirm it exists. For a topic the map does not cover, say so and offer the nearest section; invent nothing.

## Start and resume
- Start Aether mode: `aeth` in a terminal, in the project folder (or the name the person chose). Plain `claude` is not Aether mode.
- Continue the last conversation: `aeth -c`. Pick an older one: `aeth --resume`. One task without a session: `aeth -p "<task>"`.
- Set up or change the choices (permissions, harnesses, command name): `/aether:setup`. It can be run again.
- Something fails or is missing (Claude Code, Node, git, the command, the workflows): `/aether:doctor`.
- The long form, with no setup: `claude --agent aether:lead --effort xhigh`.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/install-and-start.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/instalar-y-arrancar.md (Spanish)

## Ask for work
- Say it to the Lead in your own words, as you would to a colleague. A first request: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/first-request.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/primera-peticion.md (Spanish)
- The Lead picks one of three paths and says why: direct (the Lead itself, a small reversible change), a delegate task (one subagent, starts on Haiku and rises only when it must), or the swarm (`/aether:run`, three or more tasks in parallel).
- A big request goes in order: the Lead writes back what it understood, asks at most five questions, writes the intent card, runs `/aether:design` (spec, plan, tasks and a hidden exam, reviewed by a Judge), builds, and ends with a brief.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/whole-feature.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/feature-completa.md (Spanish)

## Read and answer the brief
- The brief starts with the result (`cumplida`, `parcial` or `no terminada`), then «Espera tu sí» (what only you can decide, and the irreversible actions nobody authorized) and «Supuestos» (what the Lead assumed, most likely to be vetoed first). Read those two first.
- Answer an item in plain words: «sí» runs that action once; a general «sí, todos los merges a main» also records a standing grant; «no» makes the Lead go on with what does not depend on it. Each item says how to undo it and the exact command.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/read-the-brief.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/leer-el-brief.md (Spanish)

## Work for hours
- Say it in your own words, for example «trabaja autónomamente» or «trabaja por horas». The Lead starts a run, keeps a diary, works while work remains and writes the brief at the end.
- The ceilings are 8 hours and US$ 50 unless you name others: say a number and it is used.
- The quota brake: at 95% of your five-hour window (the `quotabrake` option) it warns you and pauses the run until the window resets, then resumes on its own.
- A push, a merge to `main`, a publish or a deploy still waits for your yes in the brief, unless you authorized that class of action.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/work-for-hours.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/trabajar-horas.md (Spanish)

## Use other harnesses (superdelegation)
- Send the work that is not the Lead's to other coding CLIs you already pay for, while their quota lasts: turn on the `superdelegation` option and list them in `harnesses` (`agy`, `codex`, `grok`, `cursor`, `muse`). It is off by default; native Claude is the fallback.
- See the settings and each harness's quota: `/harnesses`.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/other-harnesses.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/otros-harnesses.md (Spanish)

## See the spend
- This session's list-price spend, by model, effort and role, plus the calls to other harnesses: `/spend`. From a shell: `aether-report --spend`. The delegate tasks and how each climbed: `aether-report --delegates`.
- Guide: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/see-the-spend.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/ver-el-gasto.md (Spanish)

## Get oriented in a project
- At the start of a session, so the Lead knows the project before you ask for anything: `/aether:onboard`, or `/aether:onboard <topic>` to go deeper on one thing. It only reads and ends with a short brief.

## Spec Kit skills and workflows
- Write a spec by hand: `/aether:specify`, then `/aether:plan`, then `/aether:tasks`. The project's principles: `/aether:constitution`. The Lead usually does these through the design.
- Design from an intent card: `/aether:design`. Build an approved plan with the swarm: `/aether:run`. Both are workflows and need the Workflow tool; `/aether:doctor` says whether it is on.

## Options
- The plugin has eight options (`superdelegation`, `harnesses`, `ops`, `deadlines`, `quotabrake`, `brakepush`, `observedev`, `autoissue`). Change them with `/plugin` → Installed → aether → Configure options, or with `/aether:setup` for the common ones.
- Guide (English only): https://github.com/DarkArty07/aether-plugin/blob/main/docs/guide/options.md

## Everything Aether adds, and keeping it current
- Every command, agent, panel and option, and a "I want X, do Y" sheet: https://github.com/DarkArty07/aether-plugin/blob/main/docs/what-aether-adds.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/que-agrega-aether.md (Spanish)
- Update or uninstall: https://github.com/DarkArty07/aether-plugin/blob/main/docs/tutorials/update-and-uninstall.md (English), https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/actualizar-y-desinstalar.md (Spanish)
