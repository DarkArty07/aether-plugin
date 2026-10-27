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
- [Delegates](guide/delegates.md): how a delegate task of the Lead starts on Haiku and climbs to Sonnet and Opus, how a correction works on the work done, who judges it, where it runs and which pair is chosen, and the log.
- [Models by role](guide/models-by-role.md): which model and effort each role runs on, how a task climbs, what each costs, why it is set this way and how to tell whether it should change.
- [Design seats](guide/design-seats.md): which model sits in the Judge, the Writer and the Examiner seats, and how to choose.
- [Autonomy](guide/autonomy.md): how much the Lead does without asking, and the owner's grants that widen it.
- [Ops](guide/ops.md): the work that runs as plain code with no model call.
- [Maintenance](guide/maintenance.md): the platforms, updating, pinning, rolling back and uninstalling, where the data lives and upgrading from 0.6.
- [Self-observation](guide/observe.md): how the plugin finds its own faults and out-of-date settings in a Lead session, what the standard and the development installations gather, the `aether-observe` commands, and why nothing leaves your machine.
- [Troubleshooting](guide/troubleshooting.md): what to check when something does not work as the guide says.
- [Components](reference/components.md): the agents, skills, commands, hooks and workflows the plugin ships.

## If you contribute

- [Contributing](contributing.md): the development setup, the tests and the release steps.
- [Changelog](changelog.md): what changed in each version of the plugin.
- [Roadmap](roadmap.md): what is built, what is open and what waits for the owner.

## The design record

- [Claude Code research](claude-code-research.md): the verified capabilities and limits this design relies on, and the prices.
- [Decisions](decisions.md): D1–D15 from the first design session, with their updates, and A1–A96 from the specs and the RADAR roadmap.
- [Spec 001, design seats](../specs/001-design-seats/spec.md) and its [plan](../specs/001-design-seats/plan.md): the seats of the Judge, the Writer and the Examiner, open to any harness, with the native agent as the fallback.
- [Aether Agents retrospective](aether-retrospective.md): what Aether was, and what failed and why.
- [Models](models/README.md): the index of the models the harnesses offer, from Artificial Analysis and the harnesses' own listings, with what each is for.
- [Issues](https://github.com/DarkArty07/aether-plugin/issues): the bugs, observations and requests for improvement found by using Aether, each with its evidence and status. They are the only list: the files that once recorded them are now issues #1 to #68.
