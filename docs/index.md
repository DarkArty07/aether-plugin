---
title: Aether documentation
description: Every page of the Aether documentation, grouped by who reads it, and the design record behind the plugin
order: 0
---

# Aether documentation

This is where the pages of Aether live, grouped by who is reading. The [README](../README.md) is the front door: what Aether is, how to install it and where to go next.

## If you just installed Aether

- [Getting started](getting-started.md): the requirements, the install, and what happens on your first request.
- [Purpose](purpose.md): why Aether exists, what it is for and the principles it follows.
- [Methodology](methodology.md): how Aether works, from the owner's request to a merged result.

## Step-by-step guides

- [Install and start Aether](tutorials/install-and-start.md): install the plugin, answer two questions and open Aether mode with a short command, in four steps.
- [Your first request](tutorials/first-request.md): give the Lead a small task and follow it from your message to the short brief at the end.
- [A whole feature](tutorials/whole-feature.md): ask for a bigger piece of work and follow it through the questions, the design, the build and the brief.
- [Read the brief](tutorials/read-the-brief.md): read the brief that ends a job in the right order, and answer what waits for your yes.
- [Work for hours](tutorials/work-for-hours.md): give the Lead permission to work on its own, know its ceilings and the quota brake, and read the brief it leaves when it stops.
- [Other harnesses](tutorials/other-harnesses.md): send work to agy, Codex, Grok, Cursor or Muse while their quota lasts, and check it with the `/harnesses` panel.
- [See the spend](tutorials/see-the-spend.md): read what a session cost at list price with the `/spend` panel and `aether-report`.
- [Update and uninstall](tutorials/update-and-uninstall.md): update Aether, change your setup answers, pin or roll back a release, and uninstall the plugin and the `aeth` command.
- [What Aether adds](what-aether-adds.md): every command, agent and option of the plugin, point by point, and a cheat sheet of what to ask for.
- [En español](es/index.md): las mismas guías y «Qué agrega Aether», en español.

## Guías en español

- [Qué agrega Aether](es/que-agrega-aether.md): todo lo que el plugin agrega a tu Claude Code, punto por punto, con una hoja de atajos.
- [Instalar y arrancar Aether](es/guias/instalar-y-arrancar.md): instala el plugin, contesta dos preguntas y abre el modo Aether con un comando corto.
- [Tu primera petición](es/guias/primera-peticion.md): dale al Lead una tarea pequeña y síguela hasta el brief corto del final.
- [Una feature completa](es/guias/feature-completa.md): pide un trabajo más grande y síguelo por las preguntas, el diseño, la construcción y el brief.
- [Leer el brief](es/guias/leer-el-brief.md): lee en el orden correcto el brief que termina un trabajo y contesta lo que espera tu sí.
- [Trabajar por horas](es/guias/trabajar-horas.md): dale al Lead permiso para trabajar por su cuenta, conoce sus topes y el freno de cuota.
- [Otros harnesses](es/guias/otros-harnesses.md): manda trabajo a agy, Codex, Grok, Cursor o Muse mientras dure su cuota.
- [Ver el gasto](es/guias/ver-el-gasto.md): lee lo que costó una sesión a precio de lista con el panel `/spend` y `aether-report`.
- [Actualizar y desinstalar](es/guias/actualizar-y-desinstalar.md): actualiza Aether, cambia lo que elegiste, fija o revierte una versión, y desinstala el plugin y el comando `aeth`.

## If you use Aether

- [Options](guide/options.md): every option the plugin has, its default and how to set it.
- [Lanes](guide/lanes.md): delegating volume to other harnesses and their models, and how the quota is spent.
- [Delegates](guide/delegates.md): how a delegate task of the Lead starts on Haiku and climbs to Sonnet and Opus, how a correction works on the work done, who judges it, where it runs and which pair is chosen, and the log.
- [Models by role](guide/models-by-role.md): which model and effort each role runs on, how a task climbs, what each costs, why it is set this way and how to tell whether it should change.
- [Design seats](guide/design-seats.md): which model sits in the Judge, the Writer and the Examiner seats, and how to choose.
- [Autonomy](guide/autonomy.md): how much the Lead does without asking, and the owner's grants that widen it.
- [Ops](guide/ops.md): the work that runs as plain code with no model call.
- [Maintenance](guide/maintenance.md): the platforms, updating, pinning, rolling back and uninstalling, where the data lives and upgrading from 0.6.
- [Self-observation](guide/observe.md): how the plugin finds its own faults and out-of-date settings in a Lead session, what the standard and the development installations gather, the `aether-observe` commands, and why nothing leaves your machine, but for the automatic issues of its development mode.
- [Troubleshooting](guide/troubleshooting.md): what to check when something does not work as the guide says.
- [Components](reference/components.md): the agents, skills, commands, hooks and workflows the plugin ships.

## If you contribute

- [Contributing](contributing.md): the development setup, the tests and the release steps.
- [Changelog](changelog.md): what changed in each version of the plugin.
- [Roadmap](roadmap.md): what is built, what is open and what waits for the owner.

## The design record

- [Claude Code research](claude-code-research.md): the verified capabilities and limits this design relies on, and the prices.
- [Decisions](decisions.md): D1–D15 from the first design session, with their updates, and A1–A104 from the specs and the RADAR roadmap.
- [Spec 001, design seats](../specs/001-design-seats/spec.md) and its [plan](../specs/001-design-seats/plan.md): the seats of the Judge, the Writer and the Examiner, open to any harness, with the native agent as the fallback.
- [Aether Agents retrospective](aether-retrospective.md): what Aether was, and what failed and why.
- [Models](models/README.md): the index of the models the harnesses offer, from Artificial Analysis and the harnesses' own listings, with what each is for.
- [Artificial Analysis data](reference/artificial-analysis.md): what its free API returns field by field, what its website shows that the API does not, what its terms of use allow, and where each figure lives in the plugin.
- [Artificial Analysis comparison](models/artificial-analysis-2026-10-26.md): the 28 models of the owner's chart with the figures of the API and of the website, among them the cost, tokens and time per task, dated 2026-10-26.
- [Issues](https://github.com/DarkArty07/aether-plugin/issues): the bugs, observations and requests for improvement found by using Aether, each with its evidence and status. They are the only list: the files that once recorded them are now issues #1 to #68.
