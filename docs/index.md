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

## If you use Aether

- [Options](guide/options.md): every option the plugin has, its default and how to set it.
- [Lanes](guide/lanes.md): delegating volume to other harnesses and their models, and how the quota is spent.
- [Delegate router](guide/router.md): how the router picks the model, effort and harness of the Lead's delegate tasks, in which mode, by which criterion and quota rule, and what can and cannot be done as asked.
- [Design seats](guide/design-seats.md): which model sits in the Judge, the Writer and the Examiner seats, and how to choose.
- [Autonomy](guide/autonomy.md): how much the Lead does without asking, and the owner's grants that widen it.
- [Ops](guide/ops.md): the work that runs as plain code with no model call.
- [Maintenance](guide/maintenance.md): the platforms, updating, pinning, rolling back and uninstalling, where the data lives and upgrading from 0.6.
- [Troubleshooting](guide/troubleshooting.md): what to check when something does not work as the guide says.
- [Components](reference/components.md): the agents, skills, commands, hooks and workflows the plugin ships.

## If you contribute

- [Contributing](contributing.md): the development setup, the tests and the release steps.
- [Changelog](changelog.md): what changed in each version of the plugin.
- [Roadmap](roadmap.md): what is built, what is open and what waits for the owner.

## The design record

- [RADAR roadmap](roadmap/2026-10-10-radar.md): the five goals, the owner's list, and the phases of version 0.8.
- [Design spec](superpowers/specs/2026-10-07-aether-plugin-design.md): components, the swarm executor, routing, cleanup and measurement.
- [Specs](superpowers/specs/) and [plans](superpowers/plans/) up to 0.7, written with superpowers: the foundation, the swarm and measurement plans, the lanes, the Lead and the Designer, the installable plugin, the autonomy and the separation, each with its review and execution record. New work goes to `specs/NNN-<topic>/`.
- [Evaluations](evaluations/): the trials against normal mode, with their fixtures, harnesses and results, and the later checks of the installable plugin, ops in the mod and the super Lead. Trial 2 keeps both builds, playable.
- [Claude Code research](claude-code-research.md): the verified capabilities and limits this design relies on, and the prices.
- [Decisions](decisions.md): D1–D15 from the first design session, with their updates, and A1–A74 from the specs and the RADAR roadmap.
- [Spec 001, design seats](../specs/001-design-seats/spec.md) and its [plan](../specs/001-design-seats/plan.md): the seats of the Judge, the Writer and the Examiner, open to any harness, with the native agent as the fallback.
- [Evaluation of the design seats](evaluations/seats/README.md): how an external model is compared with the native agent of a seat, and the harness that runs it.
- [Aether Agents retrospective](aether-retrospective.md): what Aether was, and what failed and why.
- [Models](models/README.md): the index of the models the harnesses offer, from Artificial Analysis and the harnesses' own listings, with what each is for.
- [Issues](https://github.com/DarkArty07/aether-plugin/issues): the bugs, observations and requests for improvement found by using Aether, each with its evidence and status. They are the only list: the files that once recorded them are now issues #1 to #68.
