---
title: Getting started
description: Install Aether, start Aether mode, and learn what happens to your first request, how to let it work for hours and how to read its brief
order: 1
---

# Getting started

This guide is for someone who has just installed Aether, or is about to. At its end you will have Aether mode running, you will know what happens to your first request, and you will know how to read the brief that ends it.

## Use Aether mode

Aether mode is opt-in: you install the plugin once, and you choose Aether mode each time you start a session.

### Requirements

- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- for lanes, the CLI of each harness you turn on: `agy`, `codex`, `grok`, `cursor-agent` or `muse`.

### Install

```
claude plugin install aether --marketplace DarkArty07/aether-plugin
```

Add `--config lanes=true` to turn the lanes on (see [Options](guide/options.md#options)). In a session, `/plugin install aether --marketplace DarkArty07/aether-plugin` does the same and lets you choose the scope.

Then run `/aether:first-setup` once, in a session started with plain `claude`, to get a short command that starts Aether mode (see [Start](#start)).

Aether 0.8 no longer needs superpowers. If you keep it for other work, it still enters every session where it is enabled and asks for its own skills, so turn it off for an Aether session:

```
claude --agent aether:lead --effort max --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false},"theme":"custom:aether:aether"}'
```

The `theme` entry gives that session the plugin's own color theme, Aether, and nothing else changes in your settings (see [Start](#start)). The launcher runs that command for you, with permissions bypassed.

To install from a clone of this repository instead of GitHub, pass the clone's path to `--marketplace`: the plugin then loads from that folder, in place. To update, pin, roll back or uninstall it, see [Update, pin, roll back and uninstall](guide/maintenance.md#update-pin-roll-back-and-uninstall).

### Check that it worked

None of these checks needs a model.

To try the install without touching your own Claude Code configuration, run the install above and each command below with `CLAUDE_CONFIG_DIR` pointing at the same empty folder. A command run without it reads your own configuration, and one run with another folder finds nothing installed.

Outside a session, in any shell, ask Claude Code which plugins are installed:

```
claude plugin list
```

`aether@aether-plugin` is listed with its version, and its `Status:` is `enabled`.

Then, in the same shell, ask which options the plugin has:

```
claude plugin configure aether@aether-plugin
```

It shows the plugin's eight options, `lanes`, `harnesses`, `ops`, `seats`, `router`, `decider`, `fallback` and `deadlines`, and says which you have set. An option you have not set uses its default (the table is in [Options](guide/options.md#options)); the install prints a notice that some options are not yet set, and that is expected.

Last, check that the plan format Aether builds from reads correctly. Save this two-task plan as `tasks.md` anywhere. It is what the Writer produces for a plan, shortened: every task has the Aether fields, and there is an `## Aether Execution` section.

```
# Tasks: Greeting and farewell

## Task list

### Task 1: The greeting function

**Aether:**
- Tier: haiku high — a pure function with exact tests
- Area: greeting
- Owns: `src/greeting.js`, `test/greeting.test.js`
- Depends on: none

Write `greet(name)` in `src/greeting.js`. It returns `Hello, <name>!`.

### Task 2: The farewell function

**Aether:**
- Tier: haiku high — a pure function with exact tests
- Area: farewell
- Owns: `src/farewell.js`, `test/farewell.test.js`
- Depends on: none

Write `farewell(name)` in `src/farewell.js`. It returns `Goodbye, <name>!`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 20
```

Then run the plan checker on it. Inside a session it is on the `PATH`; outside one it is not, so use its path, as the paragraph after the output explains:

```
aether-plan check tasks.md
```

It prints one line of JSON and exits 0 when the plan is sound. For this plan it is:

```
{"ok":true,"tasks":2,"waves":[["task-1","task-2"]],"warnings":[]}
```

`waves` shows the swarm would run both tasks at the same time, because neither depends on the other and they own different files.

The commands of the plugin's `bin/` folder are on the `PATH` of the Bash tool in a session that has the plugin, so inside a session you type `aether-plan check tasks.md`. In a shell outside a session they are not on the `PATH`, and you run the file by its path. In a clone of this repository that is `node plugins/aether/bin/aether-plan check tasks.md`. If you installed from GitHub, the plugin's copy is in the Claude config dir, and the path is `node ~/.claude/plugins/cache/aether-plugin/aether/<version>/bin/aether-plan check tasks.md`, where `<version>` is the one `claude plugin list` shows. If you set `CLAUDE_CONFIG_DIR`, write that folder in place of `~/.claude`. If you installed from a clone's path, the plugin loads from the clone itself, so the clone's path above is the one.

### Start

Aether mode is chosen per session:

```
claude --agent aether:lead --effort max
```

The Lead is the agent `aether:lead`, which starts on Sonnet; the owner may switch with `/model`. `--effort max` sets its effort, because a plugin cannot. The settings file cannot hold `max`, so the command is the way to start the Lead at `max`. The command is the same in every shell.

To type less, the plugin ships a launcher that runs the command of Install, with superpowers turned off for the session, and passes on every argument. It also starts the session with `--permission-mode bypassPermissions`, so neither the Lead nor the swarm's agents stop at a permission prompt. With no prompts, aether-guard is the only check left on a push, a `gh pr merge` or a forced delete, so the launcher sets `AETHER_IRREVERSIBLE=enforce`: the guard refuses an irreversible command that no grant covers, instead of only recording it. A value already set in your shell is kept, so `AETHER_IRREVERSIBLE=log aether-lead` (or `AETHER_IRREVERSIBLE=log aeth`, below) only records them. For a session that asks before each tool call, run the command of Install instead. The launcher is one `exec claude` after that default, with no setup of its own, so it is the same in bash, fish and zsh.

To get it as a command, run `/aether:first-setup` once after installing the plugin. It runs `aether-first-setup`, which puts a small command, `aeth` unless you name another (`/aether:first-setup <name>`), in `~/.local/bin`. That command runs the launcher of the newest installed release each time, so a plugin update needs no second setup. Then `aeth` starts Aether mode, `aeth --resume` resumes a session and `aeth -p "<task>"` runs one task. What it will and will not do:
- It never replaces a file that is not its own. When the name is already a file in that directory, or a command on your `PATH`, it writes nothing and asks for another name; `aether-first-setup --name <name>` does the same from a shell. A name is letters, digits, `.`, `_` and `-`, at most 64 characters, and not `claude`, because the launcher runs `claude` and a command of that name would call itself.
- It replaces its own command, so running it again refreshes it.
- It edits no shell file. When `~/.local/bin` is not on your `PATH`, it prints the line to add for bash, zsh and fish, and you add it. It reads the `PATH` of the session that runs it, which may differ from your terminal's, so open a new terminal after the setup and type the command; if it is not found there, add the line. `aether-first-setup --check` says what it would do and writes nothing.

In a clone of this repository, `scripts/aether-lead` is the same launcher. Link it once under any name on your `PATH`, and the link keeps working because the script finds the launcher from its own resolved path:

```
ln -s "$PWD/scripts/aether-lead" ~/.local/bin/aether-lead
```

Then `aether-lead` does what `aeth` does, with the clone's launcher, and `aether-lead --plugin-dir <worktree>/plugins/aether` tries a development tree in place of the installed release.

To make Aether mode the default in one repository, put this in its `.claude/settings.local.json`:

```
{ "agent": "aether:lead" }
```

Plain `claude` then starts Aether mode there, and `claude --agent claude` starts normal mode. This file takes `xhigh` at most as `effortLevel`, so this route does not start the Lead at `max`; the command of Start does.

Plain `claude` stays normal mode: the plugin is dormant there. Its hooks do nothing, its usage meter records nothing, and its agents are not offered.

### The theme

The plugin ships a color theme, Aether (`plugins/aether/themes/aether.json`): the violet of Claude Aether in place of Claude's orange, a deep indigo for the messages, and a color for each permission mode and for each of the eight subagent colors. The command of Install and the launcher select it in the session's `--settings`, so it applies while that session runs and is never written to your settings files. A plain `claude` session keeps your own theme.

To have it in a repository where Aether mode is the default, add `"theme": "custom:aether:aether"` to the same `.claude/settings.local.json`. The `/theme` picker lists it as Aether, from aether; choosing it there sets it for every session of that account, which is what a session-only start avoids. The theme needs a terminal with true color. The syntax colors of code blocks and diffs are Claude Code's own and do not change with it.

## Your first request

Tell the Lead what you want. What it does with the request depends on its size, and for work that needs a design it goes in this order:

1. **It writes back its understanding.** The Lead explores the context, asks you only what the code cannot answer, and writes back what it understood, keeping what you said apart from what it assumes. It waits for your confirmation, for example «sí, es buena idea». A correction that leaves your intent as it was goes into the note; one that changes it gets a new note, written back once more. (`using-aether`, «Understanding the intent».)
2. **It asks the clarifying questions, at most five.** Before anything is written, one question at a time, and only about a choice that is hard to reverse, surprising or a real trade-off. What the intent leaves open and a default can settle, the Lead assumes and records, and does not ask. Your answers go into the intent card. (`using-aether`, «Designing» and «Assumptions instead of questions».)
3. **It tells you what is worth knowing.** Before a spec and a plan it names a better option if it sees one, the scope, and the estimated cost and time from the runs finished so far, or says there is no history yet. (`using-aether`, «The route by size and risk».)
4. **It writes the intent card.** `specs/NNN-<topic>/intent.md` holds your words as you said them, the understanding you confirmed, the criteria (what and why, each tied to a quote of yours), what is out, and your answers to the questions. Only the Lead writes the card. A small or reversible change needs no document: the Lead does it itself, or hands it to one delegate. (`using-aether`, «Designing» and «The route by size and risk».)
5. **`/aether:design` runs the design by itself.** The Lead launches this workflow with the card and has no turn until it ends. The Writer writes the spec and the Judge reviews it; the Writer then writes the plan and the tasks, `aether-plan check` passes and the Judge reviews them; last, the Examiner writes the hidden exam. A document gets at most two revisions. Each write of a document, each review and the exam go to the models of the `seats` option first, `balanced` by default, and to the native agent last, and a seat that cannot answer passes the round to the native agent without the Lead; a correction after a review is always the native Writer's (see [Design seats](guide/design-seats.md#design-seats)). It needs the Workflow tool (see [When something fails](#when-something-fails)).
6. **The Lead acts on one of four results.** `approved`: the paths of the spec, the plan and the tasks, each verdict of the Judge as given, the `Complexity` table and the proposals; the Lead then chooses how to build. `clarify`: questions the card did not settle, each marked `[NEEDS CLARIFICATION]`; the Lead asks you, writes your answers into the card and launches again. `dispute`: a third review that did not approve, or a `reject`, with both positions or the Judge's direction; the Lead rethinks the card or puts the dispute on your list, and never overrides the Judge. `failed`: the step and why. (`using-aether`, «Designing».)
7. **The Lead chooses how to build it, and says why.** The direct path, the Lead itself, for a very bounded change; a delegate task, one subagent on a model the Lead names with its reason, for real but bounded work and for a plan of one or two tasks; or the swarm, `/aether:run`, for a plan of three or more tasks or one with a task on Opus. (`using-aether`, «The three paths».)
8. **It stops at the plan with a short brief.** Without your permission to work for hours, the Lead stops here. The brief opens with what waits for your yes, and recommends how to build it: itself, a delegate task on a model it names, or the swarm. Your yes starts the build. (`using-aether`, «Autonomous runs» and «The execution method».)

**The brakes.** The design is held to what you asked, and the Lead does not conduct it, so its checks are in the documents:
- each criterion comes from your words, each requirement serves a criterion, and each task names the requirements it serves with a `Serves` line, which `aether-plan check` verifies;
- the plan has a gate, and a `Complexity` table that justifies anything beyond what a requirement asks, with the simpler alternative rejected;
- a choice your card does not settle and that is hard to reverse is marked `[NEEDS CLARIFICATION]` and returned to you as a question, not guessed;
- each finding of the Judge is `missing`, `extra` or `wrong`: what goes beyond your intent is a defect, as much as what is missing.

Give it permission to work for hours (see [Work for hours](#work-for-hours)), and it runs to the end, chooses the method itself, and gives you the brief.

The swarm needs:
- **a plan with Aether fields** on every task:

      **Aether:**
      - Tier: haiku high — exact tests and interfaces pin the task down
      - Area: backend
      - Owns: `src/api/**`, `test/api.test.js`
      - Depends on: none

- **an `## Aether Execution` section**, holding the test command, the ladder and the agent budget;
- **a separate integration worktree on a feature branch.** The Lead creates it with `git worktree add <path> -b <branch>`;
- **permissions that let the agents run `git`, `aether-wt`, `aether-lane` and the tests**, and edit files under `.aether/worktrees/`, without asking each time.

How the method works from end to end is in [Methodology](methodology.md); what Aether is for is in [Purpose](purpose.md). Lanes, the other coding plans a swarm can use, are in [Lanes](guide/lanes.md#lanes).

## Work for hours

Without your permission the Lead stops at the plan. With it, the Lead starts a run and works to the end of the job without asking you again. Give the permission in your own words, for example «trabaja por horas» or «no cuentes conmigo hasta acabar». That sentence also confirms your intent, so the Lead does not ask again.

What the Lead does then:
- **It loads the skill `autonomous-runs`** and follows it. A `clarify` result of the design does not stop it: the Lead takes the reversible side of each question as an assumption and puts the question in «Espera tu sí».
- **It starts a run** with `aether-autonomy start --quote "<your permission>"`. The quote is checked against your own messages in the session, and needs at least 12 of your characters.
- **It keeps to two ceilings,** 8 hours and US$ 50, unless you name others: say a number and it is used.
- **It keeps a diary** at `.aether/autonomy/<run id>/diary.md`, and updates it after every decision.
- **It keeps working** while work remains, and does not end a turn with nothing pending.
- **It stops** when the work is done, when it reaches a ceiling, or honestly, when everything left waits for your yes or repeated without progress.
- **It writes the brief** at `.aether/autonomy/<run id>/brief.md` and shows it in chat.

Irreversible actions, such as a push, a merge to `main`, a publish or a deploy, are not covered by the permission to work for hours. They wait on your list in the brief unless you authorized that class of action in general words, which the Lead records as a standing grant.

The dollar figure of a run covers the swarm, the lanes and the external seats; the Lead's own turns are not added up, so the time ceiling is the real guard.

A permission prompt of Claude Code stops a run like a question: the session waits at it. Start a session meant for a run with a permission mode or allow rules that cover its tools, or with the launcher, which bypasses permissions and refuses irreversible commands that no grant covers (see [Start](#start)). The plugin itself never turns permissions off.

The full contract, with the grants and the guard, is in [Autonomy](guide/autonomy.md#autonomy).

## Read the brief

The brief of a run has a fixed order. The first line under its title is the result: `**Resultado:**` with `cumplida`, `parcial` or `no terminada`, and the ceiling that was reached, if any. Then come the two sections that ask something of you, «Espera tu sí» and «Supuestos», then the criteria and the RADAR lines, and last the sections of reference. Read «Espera tu sí» first.

**«Espera tu sí»** is your list: what only you can decide, and the irreversible actions nobody authorized. Each item has the same six parts:

«acción · clase · por qué · si dices que no · cómo se revierte · el comando exacto»

Read it as: what the Lead wants to do, which class of irreversible action it is, why it is needed, what happens if you say no, how to undo it, and the exact command that will run. A failure that has a fallback, such as a lane out of quota, never reaches this list: the Lead handles it and records it.

**«Supuestos»** are what your intent did not cover and the Lead decided to assume: the assumption, its basis, and whether it can be reversed. They are ordered by how likely you are to veto them, the most likely first, so read from the top and stop when you agree with the rest.

After them come «Criterios», the criteria with their evidence, and the **RADAR** lines, one for each of Aether's five goals:
- **Rápido:** the time, the retries and the climbs to a stronger model;
- **Autónomo:** how many times the Lead interrupted you, and why;
- **Delegación:** the calls and tokens run on other harnesses, and the quota left;
- **Asequible:** the dollars, the quota used, and the model and effort of each delegated task;
- **Robusto:** the tests, the exam, the findings and the Judge's verdicts.

The brief goes on with what the Lead did (the branch and the commits), what it decided and why, what it found, **«Qué no verifiqué»** (what the Lead could not check, which is where to be skeptical), what it did not finish, proposals beyond your intent, and the time and cost. Outside a run the brief is short: the intent, the paths of the spec and the plan, the decisions, your list, the assumptions, what was not verified, and the RADAR lines that apply.

What to answer:
- **Say yes to an item** and the Lead runs that action, once. If your words are general («todos los merges a main», «siempre»), it also records a grant, so it does not ask again for that class.
- **Say no** and what the item's «si dices que no» part describes happens: the Lead goes on with what does not depend on it.
- **With `AETHER_IRREVERSIBLE=enforce`,** the guard refuses the action even after your yes until a grant covers it. The Lead records your reply as a grant for the session, runs the action, and revokes the grant. When your reply is shorter than 12 characters, the brief holds the exact command for you to run yourself.

## When something fails

The most common ones, each with its remedy. The full list is in [Troubleshooting](guide/troubleshooting.md).

- **The design or the swarm does not start, and the session has no `Workflow` tool.** `/aether:design` and the swarm are dynamic workflows, and workflows are off. Turn on Dynamic workflows in `/config` and start a new session. The Lead tells you this and does not design by hand. If you already have an approved plan, the Lead can build it task by task, each as a delegate task.
- **The session stops and waits, and nothing is running.** A permission prompt of Claude Code is waiting for you, and a run waits at it like at a question. Answer it, and start the next session with a permission mode or allow rules that cover the tools, or with the launcher (see [Start](#start)).
- **A command was refused, or it is on your list.** With `AETHER_IRREVERSIBLE=enforce`, aether-guard refuses a `git push`, a `gh pr merge`, a publish, a deploy, a forced delete or a credentials command that no grant covers, and appends it to `.aether/pending.jsonl`. It reaches you in the brief's «Espera tu sí»; answer it there. With `AETHER_IRREVERSIBLE=log` the command ran and was only recorded. A local `git merge` is not recorded either way: git undoes it, and the push that would publish it is recorded.
- **`aether-plan check` prints `"ok":false`.** Its `errors` name the task and the rule: a missing `**Aether:**` block, a missing `## Aether Execution` section or `Test command`, or two tasks that run at the same time and own the same file. Fix what it names, and run it again.
- **Nothing happens that looks like Aether.** The session was started with plain `claude`, where the plugin is dormant: its hooks do nothing and its agents are not offered. Start it with `claude --agent aether:lead --effort max`, or with the launcher (see [Start](#start)).
