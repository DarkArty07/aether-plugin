---
title: Purpose
description: Why Aether exists, the five goals of RADAR, the principles that follow from them and what Aether is not
order: 2
---

# Purpose

This page says what problem Aether solves, what it is judged by and what it is not. To install it and start, go to [Getting started](getting-started.md); for how it works, go to [Methodology](methodology.md).

## The problem

A person with a coding plan wants to say what they need once, and get back reviewed, tested work, without watching it and without paying for a strong model on every step. Aether Agents, the project before this one, tried that and failed in the infrastructure, not in the method: its harness offered many equivalent tools, its autonomy had no hard budget, and blocked work failed in silence (the [Aether Agents retrospective](aether-retrospective.md) has the evidence, and [Lessons from Aether Agents](#lessons-from-aether-agents) the short list).

Aether is a plugin for Claude Code that adds an opt-in **Aether mode**: an accountable orchestrator, the Lead, that turns the owner's intent into a reviewed spec and plan, builds it with a parallel swarm of agents and with the other coding plans the owner pays for, and reports in one brief.

Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.

## RADAR

Aether serves five goals, **RADAR**:
- **Rápido** (fast): fast, cheap models do the bulk of the work, and nothing iterates without end;
  - measured by the time of a run, the calls per model and the repeats of one failure.
- **Autónomo** (autonomous): the owner is not asked about trivial things, and every irreversible step reaches them in one list;
  - measured by how many times the system interrupts the owner after they confirm the intent.
- **Delegación** (delegation): work goes to other coding harnesses (agy, Codex, Grok, Cursor, Muse) while their quota lasts;
  - measured by the calls and tokens that ran on other harnesses, and by the quotas that ran dry.
- **Asequible** (affordable): each role runs on the cheapest model and effort that does it well;
  - measured by the cost in US dollars at list price, per design and per run.
- **Robusto** (robust): quality code, checked by tests, evidence and independent reviews.
  - measured by the tests, the findings of the reviews, the exam and the Judge's verdicts.

Every brief the Lead writes reports the five, and `aether-report` prices a run and gathers its figures. The goals, their measures and the targets proposed for each are in [the RADAR roadmap](roadmap/2026-10-10-radar.md).

## Principles

1. **Mechanism in code, judgment in the model.** Anything that must always happen the same way (status, retries, budgets, cleanup) is code, never a prompt instruction.
2. **Bounded autonomy.** Every run has an agent budget and a verifiable definition of done. Work that hits a real question comes back blocked, with the question.
3. **The task chooses the model and its effort.** Each task's Tier line sets the start. A failed attempt runs again at `xhigh`, and then on a stronger model.
4. **Contracts first, then the swarm.** Plans give interfaces, failing tests and file ownership. Units are independent by default, and every dependency needs a reason.
5. **Sonnet writes, Opus decides, and a stronger model may take either seat.** The expensive model judges the spec, the plan and the work; the cheaper ones write them. Whoever writes a document never judges it.
6. **One list for the owner.** What is irreversible, and what only the owner can choose, waits for the owner's yes in one list. Everything else proceeds, and every failure with a fallback is handled without asking.
7. **RADAR.** Every change is weighed against the five goals: fast, autonomous, delegated, affordable and robust.

## Lessons from Aether Agents

What failed in [Aether Agents](https://github.com/DarkArty07/Aether-Agents), and how Aether Plugin answers it. The [retrospective](aether-retrospective.md) tells the whole story.

The method worked: specs, exploration notes, saved learnings and visible order. The infrastructure did not:
- A general personal-assistant harness offered many equivalent tools, so the model took a different path for the same request each time.
- Autonomy had no hard budget and no independent check of "done", and it turned into more than 20 hours of over-engineering.
- Blocked work failed silently.
- Each role had a fixed model, but critical units, especially frontend work, need a strong one.
- The supervisor chained its tasks, so the intended swarm never ran in parallel.

Aether Plugin answers each failure:
- Claude Code is the harness.
- The workflow enforces budgets, the ladder and serialized merges in code.
- Blocked units come back with their question.
- Each task's tier picks its model and its effort.
- `aether-plan` refuses chain-shaped plans.

## What Aether is not

- **It is not the normal way `claude` runs.** Aether mode is chosen per session, by starting the Lead, the agent `aether:lead`. In any other session the plugin sleeps: the SessionStart hook (`aether-session-start`) acts only when the session's agent is the Lead, and the usage meter in `plugins/aether/hooks/register.js` records nothing and offers none of the plugin's agents. Plain `claude` stays normal mode, unless a repository makes `aether:lead` its default agent (see [Start](getting-started.md#start)).
- **It does not require superpowers or Spec Kit's CLI.** `plugins/aether/.claude-plugin/plugin.json` declares no dependencies. Aether follows the layout of [GitHub Spec Kit](https://github.com/github/spec-kit), `specs/NNN-<topic>/`, through a preset shipped in the plugin, and the Lead is told not to use superpowers' skills if a session offers them.
- **It is not a service, and it changes nothing for a session that did not choose it.** It has no process of its own: it is hooks and a mod that Claude Code runs inside a session, and in a session that is not the Lead's they write no file and sweep nothing.
