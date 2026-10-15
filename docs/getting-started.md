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
- for lanes, the CLI of each harness you turn on: `agy`, `codex`, `grok` or `cursor-agent`.

### Install

```
claude plugin install aether --marketplace DarkArty07/aether-plugin
```

Add `--config lanes=true` to turn the lanes on (see [Options](guide/options.md#options)). In a session, `/plugin install aether --marketplace DarkArty07/aether-plugin` does the same and lets you choose the scope.

Aether 0.8 no longer needs superpowers. If you keep it for other work, it still enters every session where it is enabled and asks for its own skills, so turn it off for an Aether session:

```
claude --agent aether:lead --effort xhigh --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'
```

`scripts/aether-lead` runs that command for you, with permissions bypassed (see [Start](#start)).

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

It shows the plugin's four options, `lanes`, `harnesses`, `ops` and `seats`, and says which you have set. An option you have not set uses its default (the table is in [Options](guide/options.md#options)); the install prints a notice that some options are not yet set, and that is expected.

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
claude --agent aether:lead --effort xhigh
```

The Lead is the agent `aether:lead`, which starts on Sonnet; the owner may switch with `/model`. `--effort xhigh` sets its effort, because a plugin cannot. The command is the same in every shell.

To type less, `scripts/aether-lead` in a clone of this repository runs the command of Install, with superpowers turned off for the session, and passes on every argument. It also starts the session with `--permission-mode bypassPermissions`, so neither the Lead nor the swarm's agents stop at a permission prompt. With no prompts, aether-guard is the only check left on a push, a `gh pr merge` or a forced delete, so the launcher sets `AETHER_IRREVERSIBLE=enforce`: the guard refuses an irreversible command that no grant covers, instead of only recording it. A value already set in your shell is kept, so `AETHER_IRREVERSIBLE=log aether-lead` only records them. For a session that asks before each tool call, run the command of Install instead. The launcher is one `exec claude` after that default, with no setup of its own, so it is the same in bash, fish and zsh. Link it once, under any name on your `PATH`:

```
ln -s "$PWD/scripts/aether-lead" ~/.local/bin/aether-lead
```

Then `aether-lead` starts Aether mode, `aether-lead --resume` resumes a session and `aether-lead -p "<task>"` runs one task. Without a clone, a shell alias of the same command does the same.

To make Aether mode the default in one repository, put this in its `.claude/settings.local.json`:

```
{ "agent": "aether:lead", "effortLevel": "xhigh" }
```

Plain `claude` then starts Aether mode there, and `claude --agent claude` starts normal mode, with the repository's `effortLevel`.

Plain `claude` stays normal mode: the plugin is dormant there. Its hooks do nothing, its usage meter records nothing, and its agents are not offered.

## Your first request

Tell the Lead what you want. What it does with the request depends on its size, and for work that needs a design it goes in this order:

1. **It writes back its understanding.** The Lead explores the context, asks you only what the code cannot answer, one question at a time, and writes back what it understood, keeping what you said apart from what it assumes. It waits for your confirmation, for example «sí, es buena idea». A correction that leaves your intent as it was goes into the note; one that changes it gets a new note, written back once more. (`using-aether`, «Understanding the intent».)
2. **It tells you what is worth knowing.** Before a spec and a plan it names a better option if it sees one, the scope, and the estimated cost and time from the runs finished so far, or says there is no history yet. (`using-aether`, «The route by size and risk».)
3. **It writes the spec.** The Lead writes `specs/NNN-<topic>/spec.md` and commits it. A small or reversible change needs no document: the Lead does it itself, or hands it to one delegate. (`using-aether`, «The route by size and risk» and «Writing and judging».)
4. **The Judge reviews the spec.** The Judge, on Opus and read-only, rules `approve`, `revise` or `reject`. With `seats`, `balanced` by default, and the lanes on, a stronger model of another harness may take the seat; otherwise the native Judge does (see [Design seats](guide/design-seats.md#design-seats)). A document gets at most two revisions; after that the Lead puts both positions on your list instead of overriding the Judge. (`using-aether`, «Writing and judging» and «The design seats».)
5. **The Writer writes the plan and the tasks, and the Judge reviews them.** The plan and the tasks follow Spec Kit's layout, with the Aether fields on every task, and the Writer checks them with `aether-plan check`. (`using-aether`, «Writing and judging» and «Plans».)
6. **The Lead chooses how to build it, and says why.** The direct path, the Lead itself, for a very bounded change; a delegate task, one subagent on a model the Lead names with its reason, for real but bounded work and for a plan of one or two tasks; or the swarm, `/aether:run`, for a plan of three or more tasks or one with a task on Opus. (`using-aether`, «The three paths».)
7. **It stops at the plan with a short brief.** Without your permission to work for hours, the Lead stops here. The brief opens with what waits for your yes, and recommends how to build it: itself, a delegate task on a model it names, or the swarm. Your yes starts the build. (`using-aether`, «Autonomous runs» and «The execution method».)

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
- **It starts a run** with `aether-autonomy start --quote "<your permission>"`. The quote is checked against your own messages in the session, and needs at least 12 of your characters.
- **It keeps to two ceilings,** 8 hours and US$ 50, unless you name others: say a number and it is used.
- **It keeps a diary** at `.aether/autonomy/<run id>/diary.md`, and updates it after every decision.
- **It keeps working** while work remains, and does not end a turn with nothing pending.
- **It stops** when the work is done, when it reaches a ceiling, or honestly, when everything left waits for your yes or repeated without progress.
- **It writes the brief** at `.aether/autonomy/<run id>/brief.md` and shows it in chat.

Irreversible actions, such as a push, a merge to `main`, a publish or a deploy, are not covered by the permission to work for hours. They wait on your list in the brief unless you authorized that class of action in general words, which the Lead records as a standing grant.

The dollar figure of a run covers the swarm, the lanes and the external seats; the Lead's own turns are not added up, so the time ceiling is the real guard.

A permission prompt of Claude Code stops a run like a question: the session waits at it. Start a session meant for a run with a permission mode or allow rules that cover its tools, or with `scripts/aether-lead`, which bypasses permissions and refuses irreversible commands that no grant covers (see [Start](#start)). The plugin itself never turns permissions off.

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

- **The swarm does not start, and the session has no `Workflow` tool.** The swarm is a dynamic workflow, and workflows are off. Turn on Dynamic workflows in `/config` and start a new session. Meanwhile the Lead can build the plan task by task, each as a delegate task.
- **The session stops and waits, and nothing is running.** A permission prompt of Claude Code is waiting for you, and a run waits at it like at a question. Answer it, and start the next session with a permission mode or allow rules that cover the tools, or with `scripts/aether-lead`.
- **A command was refused, or it is on your list.** With `AETHER_IRREVERSIBLE=enforce`, aether-guard refuses a `git push`, a `gh pr merge`, a publish, a deploy, a forced delete or a credentials command that no grant covers, and appends it to `.aether/pending.jsonl`. It reaches you in the brief's «Espera tu sí»; answer it there. With `AETHER_IRREVERSIBLE=log` the command ran and was only recorded. A local `git merge` is not recorded either way: git undoes it, and the push that would publish it is recorded.
- **`aether-plan check` prints `"ok":false`.** Its `errors` name the task and the rule: a missing `**Aether:**` block, a missing `## Aether Execution` section or `Test command`, or two tasks that run at the same time and own the same file. Fix what it names, and run it again.
- **Nothing happens that looks like Aether.** The session was started with plain `claude`, where the plugin is dormant: its hooks do nothing and its agents are not offered. Start it with `claude --agent aether:lead --effort xhigh`, or with `scripts/aether-lead`.
