---
title: Methodology
description: The Aether method from the intent of the owner to the brief, covering who does what, the three paths, the route by size and risk, and how models and harnesses are chosen.
order: 3
---

# Methodology

This page describes how Aether turns an intent into a reviewed spec, a plan, a build and one brief: who takes part, in what order, and on which model. It matches the `using-aether` skill that the plugin hands to the Lead at the start of every Aether session, and the agent definitions in `plugins/aether/agents/`.

## Who does what

- **The Lead** is the main session, starting on Sonnet at `xhigh` (the owner may switch with `/model` or `/effort`), and the owner's right hand, not a messenger. It owns the outcome: a good design, a correct implementation and a correct deployment. It understands the intent, asks the clarifying questions, writes the intent card, launches `/aether:design` and acts on its result, decides as the owner's delegate, chooses the path of each piece of work (direct, a delegate task or the swarm), judges the result of every delegate task, and tells the owner of better options, scope and costs. Its work shows in its briefs and reports.
- **The Writer** (`aether:writer`, Sonnet at `high`) writes the spec from the intent card, and the plan and the tasks from the approved spec. It marks a choice the card does not settle and that is hard to reverse as `[NEEDS CLARIFICATION]`, and records every other gap as a reversible default under Assumptions.
- **The Judge** (`aether:judge`, Opus at `high`, read-only) reviews the spec, the plan and the tasks, and rules `approve`, `revise` or `reject`, with at most ten findings, each typed `missing`, `extra` or `wrong`. Sonnet writes; Opus decides.
- **The Examiner** (`aether:examiner`, Opus at `high`) writes the hidden acceptance exam of an approved spec and plan, from the spec and the plan's public interfaces and never from `tasks.md`. The exam is kept outside the repository, so the swarm never sees it, and a failing test is a blocking finding of the brief.
- **The swarm:** when parallel work pays off, the Lead hands the plan to `/aether:run`. In the swarm:
  - an implementer starts on the Tier its plan task names, Haiku for work that exact tests and interfaces pin down and that touches few files, and climbs the ladder to Sonnet and Opus when its attempts fail;
  - a supervisor on Sonnet reviews every attempt, and grades each criterion from evidence;
  - approved units merge one at a time, and only a test failure that is new undoes a merge;
  - a unit whose supervisor returns the same findings three times, or that ends twice without its report, stops, and asks for a split or a redesign;
  - a final review, by `aether:reviewer`, on Opus, or on Sonnet for a small all-Haiku run, at `high`, and at `xhigh` only when a unit is of Tier Opus, covers the whole run;
  - the workflow's own `aether-wt` and `aether-lane` commands go to an `ops` agent on Haiku at `low`, which the mod answers without a model request while `ops` is on (`ops`, on by default; see [Ops without a model](guide/ops.md));
  - code deletes every unit worktree and branch as soon as it is no longer used.
- **Superdelegation** runs everything that is not the Lead, in the swarm and in the design, on other coding harnesses while their quota lasts, with native Claude as the fallback: agy today, and Codex, Grok, Cursor and Muse once the owner turns each one on. `superdelegation`, off by default; the [Lanes](guide/lanes.md#lanes) guide has the rule.
- **`/aether:design`** is the workflow that runs the design: it takes the intent card to an approved spec, plan and tasks with the Writer, the Judge and the Examiner, and gives the Lead one result. It needs the Workflow tool.
- **The design seats** let the Judge, the Writer and the Examiner each be taken, one round at a time, by a pair of another harness that reaches the points of the native agent, with Aether's own agent as the fallback. The [Design seats](guide/design-seats.md#design-seats) guide has the rule.

The owner sits above all of them: they confirm the Lead's understanding of what they want, may give permission to work for hours, answer one list of what only they can decide, and review the brief at the end. The [Autonomy](guide/autonomy.md#autonomy) guide covers that permission, the ceilings and the list.

## The method, end to end

1. **The intent.** The owner states what they want. The Lead explores the context, asks only what the code cannot answer, and writes back its understanding, keeping what the owner said apart from what it assumes. The owner confirms it, for example with «sí, es buena idea», or with permission to work for hours. From then on the Lead works on its own, and records what the intent does not cover as an assumption instead of asking. How far it goes on its own depends on that permission: step 6 says where the work waits for the owner.
2. **The route.** The Lead chooses how much design the change needs (see [The route by size and risk](#the-route-by-size-and-risk)). Who builds it, one of the three paths below, is chosen at step 6 once the plan is approved, or at once when the route needs no design.
3. **The questions and the card.** Before anything is written, the Lead asks the owner at most five clarifying questions, one at a time, only about a choice that is hard to reverse, surprising or a real trade-off, and then writes the intent card, `specs/NNN-<topic>/intent.md`: the owner's words, the understanding they confirmed, the criteria (what and why, each tied to a quote), what is out, and the answers. Only the Lead writes it, and it commits the folder.
4. **The design.** The Lead launches `/aether:design`, and the workflow runs without a Lead turn: the Writer writes `spec.md` from the card and the Judge reviews it; on `approve`, the Writer writes `plan.md` and `tasks.md`, with the Aether fields, and checks them with `aether-plan check`, and the Judge reviews them the same way; each document gets at most two revisions. The workflow ends with one result: `approved`, `clarify`, `dispute` or `failed` (see [The brakes and the four results](#the-brakes-and-the-four-results)).
5. **The exam.** With the plan approved, the Examiner writes the hidden exam, inside `/aether:design`, on another harness's model when `superdelegation` is on, and on Opus when it is off.
6. **The build.** Here the owner's permission decides. Without permission to work for hours there is no run: the Lead goes through the design of steps 3 to 5 and stops at the plan with a short brief, in which "Espera tu sí" holds the plan's execution with the path the Lead recommends, and why. The owner's yes starts the build. With the permission (see [Autonomy](guide/autonomy.md#autonomy)), the Lead chooses the path itself, notes it in its diary, and goes on, within the ceilings, to the build, the exam and the brief. Either way the build takes one of the three paths below: the Lead works directly, starts a delegate task, or runs the swarm.
7. **The examination and the brief.** When the build ends, `aether-exam run` runs the hidden exam on the branch that holds the build, and the Lead gives the owner one brief that opens with "Espera tu sí", the list of what waits for their yes, and "Supuestos".

**The three paths.** The Lead takes one of three paths for each piece of work. A delegate task starts on Haiku and climbs a ladder of models that the system holds, not the Lead (the [Delegates](guide/delegates.md) guide has it):
- **Direct:** a very bounded change, about five tool calls and no edit-test-fix loop. The Lead does it inline, on the model it runs on.
- **Delegate task:** bounded work that is still a real task, such as an edit-test-fix loop, a cleanup, a research sweep, or each task of a plan of one or two tasks. One subagent in the background, with a self-contained brief, that starts on Haiku. The system holds its step; the Lead judges the result and cannot skip a step. It is never inherited from the session.
- **Swarm:** long, costly or complex work: an approved plan of three or more tasks, or with a task of Tier opus. `/aether:run`, with each task on its Tier.

```text
owner ── states the intent, may give permission to work for hours, answers one list, reviews the brief
  │
Lead (main session, starts on Sonnet, xhigh): the intent, the card, the route and the path (direct, delegate task, swarm), decisions as the owner's delegate, the outcome
  │  specs/NNN-<topic>/intent.md
  ▼
/aether:design (dynamic workflow, no Lead turn): approved, clarify, dispute or failed
  │  Writer (aether:writer, Sonnet, high) ⇄ Judge (aether:judge, Opus, high, read-only)
  │  each seat native, or, with superdelegation on, on a model of another harness (aether-lane seat-start, seat-wait)
  │  spec.md, then plan.md and tasks.md, with Aether fields: tier and effort, area, owned files, dependencies, Serves
  │  aether-plan check / compile (and the run's test baseline)
  │  Examiner (aether:examiner, Opus, high): the hidden exam, kept outside the repository (aether-exam store)
  ▼
/aether:run (dynamic workflow)
  ├─ wave 1: units in parallel, each in its own git worktree, native or on another harness
  │    implementer (haiku → sonnet → opus) ⇄ supervisor (sonnet): approve, retry, escalate or block
  │    the same findings three times, or two attempts without a report, stop the unit
  ├─ merges, one at a time; only a test failure outside the baseline undoes one
  ├─ wave 2 …
  ├─ final review of everything merged (opus, or sonnet for a small all-haiku run)
  └─ cleanup: no unit worktree or aether/* branch is left behind
  │
aether-exam run: the hidden exam on the integration branch; a failing test is a blocking finding
  │
aether-report: speed, cost (OpenRouter prices), quality, calls by harness, and the RADAR figures
aether-report finalize: a record in runs.jsonl, and the run's directory deleted
```

The diagram shows the swarm path. The Judge reviews the spec before the plan is written, and again the plan and the tasks the Writer produces, all inside `/aether:design`; a delegate task replaces the `/aether:run` box when the plan has one or two tasks, none of them of Tier opus.

Specs, plans and tasks follow the layout of [GitHub Spec Kit](https://github.com/github/spec-kit), `specs/NNN-<topic>/`, through an Aether preset shipped in the plugin. Spec Kit's own CLI is not required, and neither is superpowers. Plain `claude` stays normal mode, unless a repository makes `aether:lead` its default agent (see [Start](getting-started.md#start)). Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.

## The route by size and risk

The route says how much design a change needs; [the three paths](#the-method-end-to-end) say who builds it.

| Route | When | Design, then the build |
|---|---|---|
| No design | A small or reversible change | No document: the direct path, or a delegate task |
| Short design | A bounded change | The Lead writes a short design; `/aether:design` runs the Judge's rounds on it, in short mode, when it touches security or auth, data migrations or destructive operations, concurrency, or core architecture; then a delegate task or the swarm builds it |
| Spec and plan | Architectural work | The Lead writes the intent card; `/aether:design` has the Writer write the spec, the plan and the tasks and the Judge review them; the swarm builds them, or delegate tasks when the plan is small (see [the three paths](#the-method-end-to-end)) |

Before a spec and a plan, the Lead tells the owner what is worth knowing: a better option, the scope, and the estimated cost and time, taken from the finalized runs in `runs.jsonl` in the plugin's data directory, or that there is no history yet. When the confirmed intent already covers the work, the Lead does not wait for an answer.

## Whoever writes does not judge

A seat never takes the model that wrote what its round reviews or builds on (decision A41). The workflow names that model with `--author` when it starts a seat: `/aether:design` passes the model that wrote the document: the Writer's for the spec and the plan, and, for a short design, the model the Lead runs on. The Judge therefore passes over the Writer's model, and the Examiner over the plan's author. When only the native agent of that same model is left, it takes the seat, and the answer says so; the Lead then reports it under "Qué no verifiqué".

Reviews are bounded:
- the Judge rules on each document with at most ten findings;
- a document gets at most two revisions. When a third review still does not approve, `/aether:design` ends with a `dispute` that holds both positions; when the Judge rejects the approach, it holds the Judge's direction. The Lead rethinks the card, or puts both positions and their cost into the owner's list and goes on with the work that does not depend on them. The Lead never silently overrides the Judge;
- a later change to a spec, a plan or tasks goes through `/aether:design` in short mode on the changed document, and a plan that changes after its exam was written gets a new exam.

Only the Lead and the Writer write specs, plans and tasks, and only the Lead writes the intent card: aether-guard refuses every other writer. The Examiner writes only under `.aether-exam/`.

## The brakes and the four results

The design is held to what the owner asked. The brakes are in the documents and in `aether-plan`, so no one has to remember them:
- **Traceability.** Each criterion of the spec comes from the owner's words, each requirement serves a criterion, and each task names the requirements it serves in a `- Serves: R1` line of its Aether block. `aether-plan check` fails a task that serves no requirement, or names one the spec lacks, and warns about a requirement with no task; `aether-plan compile` does not enforce it, so a plan without the links still compiles and runs.
- **The gate and the `Complexity` table.** The plan's gate checks the constitution's principles, if the project has one, and two of Aether's: nothing speculative, and no abstraction, option, file or dependency that no requirement asks for. A violation that the plan keeps goes into the `Complexity` table: the violation, why it is needed, and the simpler alternative rejected because.
- **`[NEEDS CLARIFICATION]`.** A choice the card does not settle and that is hard to reverse, surprising or a real trade-off is marked `[NEEDS CLARIFICATION]` in the spec and not guessed. Every other gap gets a reversible default, recorded under Assumptions.
- **Typed findings.** Each finding of the Judge is `missing` (the intent is not covered), `extra` (a criterion, requirement, task, abstraction or file that nobody asked for) or `wrong` (incorrect, unsafe or untestable). The final review of `/aether:run` also flags what is extra.
- **Scope.** The Writer, the Judge, the Examiner and the Lead's bootstrap carry one instruction: deliver what was asked, at the scope asked, and say at the end what would help instead of doing it. The native Writer runs at `high`, because Sonnet 5.5 adds unasked work at every effort level and more at higher effort; an external Writer keeps its own level.

`/aether:design` ends on its own, at the limit of two revisions of a document, at a `reject`, at an agent's turn limit, or at the same failure twice in a row, and it returns one result:
- **`approved`:** the paths of the spec, the plan and the tasks, each verdict of the Judge as given, the `Complexity` table and the proposals. The Lead reads the verdicts and the table, then chooses the path to build.
- **`clarify`:** the `[NEEDS CLARIFICATION]` marks the Writer could not settle from the card. The Lead asks the owner, writes the answers into the card and launches again; inside an autonomous run it takes the reversible side as an assumption and puts the question in «Espera tu sí».
- **`dispute`:** both positions after a third review that did not approve, or the Judge's verdict and direction after a `reject`.
- **`failed`:** the step and the reason.

The design needs the Workflow tool: with workflows off, the Lead tells the owner to turn on Dynamic workflows in `/config` and does not design by hand.

## How the model and the harness are chosen

The Lead chooses every model on purpose, for quality, cost and speed together, from a models index. The [Models by role](guide/models-by-role.md) guide lists the model and the effort of each role, what each costs and why each is set as it is.

- **The index.** `plugins/aether/config/models/models.json` lists each model Aether uses, native and on the lanes: its harness, the id or alias to pass, the efforts its harness takes, its scores at those efforts, its price and its profile. Its `excluded` list says which models are left out, and why. Three rules govern it: only the newest generation of each line is used (Sonnet 5.5, not Sonnet 5); only a model its harness's own CLI lists is used; and each model in use has a profile written from its maker's pages, so a model's purpose, tier or price is never inferred from its name.
- **The task's model, in a plan.** Each plan task carries a Tier (`haiku`, `sonnet` or `opus`) and an effort, with the reason, and an optional Review that raises its supervisor's effort from `high`. The effort defaults to `high`, and is raised to `xhigh` only where the tests cannot pin the behavior down and a mistake would cost more than the extra effort. The swarm runs a unit on its Tier and climbs a ladder when an attempt fails: by default Haiku 2 attempts, Sonnet 2, Opus 1, then blocked. The first attempt runs at the task's effort; a retry on the task's own Tier runs at `xhigh` on Haiku and at the task's effort on Sonnet and Opus (or at `max` when the task asked for `max`), and every attempt on a model the unit moved up to runs at `high`.
- **A delegate task's model.** The system holds it, not the Lead. A delegate task starts on Haiku; a correction goes to the same model with its own work and concrete findings; it rises to Sonnet and then Opus only when the corrections of its step are spent, the same findings come back, or the Lead declares it infeasible for that model and writes the reason. The Lead does not name its model, it is never inherited from the session, and a fork, which ignores `model`, is never used. The [Delegates](guide/delegates.md) guide has the ladder.

  | Model | Price in USD per million tokens, input / output | Speed | Use it for |
  |---|---|---|---|
  | Haiku 5.5, `haiku` | 0.10 / 0.50 | fastest | listings, lookups, explorers, mechanical edits |
  | Sonnet 5.5, `sonnet` | 2 / 10 | fast | bounded coding with tests and a precise brief, cleanups, docs: the default |
  | Opus 5.5, `opus` | 4 / 20 | moderate | hard debugging, a final review, or a task Sonnet already failed |
  | Fable 5.1 | 10 / 50 | slower | not used until Fable 5.5 (decision A43) |

  Efforts: Haiku `medium` for listings and lookups, `high` for mechanical edits; Sonnet and Opus `high`, with `xhigh` only where a mistake would cost more than the extra effort. `max` only with a reason the task needs it.
- **Climbing.** The swarm climbs its own ladder, above. A delegate task climbs the ladder of [Delegates](guide/delegates.md), held by the system: Haiku 5 corrections, Sonnet 2, Opus 1 (`config/ladder.json`), and each rise carries the work done and the findings. In Sonnet and Opus a correction and a rise run at `high`. After Opus, the Lead defers the task.
- **Aether's own agents** keep the model and effort of their definition: the Lead passes neither when it starts `aether:judge`, `aether:writer`, `aether:examiner` or `aether:reviewer`. The swarm's agents take their task's Tier and Review from the workflow.
- **Superdelegation.** It spends other plans' quota. A call asks for the points of its native reference pair, and any external pair that reaches them is a candidate; the quota whose weekly window renews first goes first, then the lower cost per task, never speed. A call runs native only when no candidate is left. The [Lanes](guide/lanes.md#lanes) guide has the rule: the order, the reserve and the fallbacks.
- **Design seats.** A seat is a call like the others, with the reference pair of its native agent (Opus `high` for the Judge and the Examiner, Sonnet `high` for the Writer), under the same rule, and the model that wrote a document never reviews it. With `superdelegation` off every seat is the native agent. The [Design seats](guide/design-seats.md#design-seats) guide says how a round is taken, and the full table of options and their defaults is in [Options](guide/options.md#options).
