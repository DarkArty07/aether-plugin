---
title: What Aether adds
description: Everything the Aether plugin adds to your Claude Code, point by point and grouped by use, with a cheat sheet of "I want this, do that"
order: 100
---

# What Aether adds

This page is for someone who has installed Aether. It lists, point by point, what the plugin adds to your Claude Code, grouped by use, and ends with a cheat sheet. Each item says what it is, what it is for and how you use it. The inventory of every file is [Components](reference/components.md), and the install is [Install and start](tutorials/install-and-start.md). Esta página también está en español: [Qué agrega Aether](es/que-agrega-aether.md).

## Commands you type

- `/aether:setup`: the guided setup. Run it once after installing: it checks your machine, asks only what it cannot detect (how `aeth` handles permissions and, if it finds other harnesses installed, whether to send work to them), saves your options, installs `aeth` and ends on a screen that says what to type. Run it again to change your choices.
- `/aether:doctor`: a read-only check of the install (Claude Code, Node, git, the `aeth` command, workflows, harnesses). Type it when something fails: it prints what it checked, what failed and the exact fix, and changes nothing.
- `/aether:help [topic]`: a map of what Aether adds, organized by what you want to do, with the command of each thing and the guide to read. `/aether:help spend` answers one topic.
- `/aether:onboard [topic]`: have the Lead understand the project before you ask for anything. It only reads (the README, `CLAUDE.md`, git, the newest handoff, the open feature) and ends with a brief of 5 to 8 lines.
- `/aether:design`: the design workflow. It turns the Lead's intent card into an approved spec, plan and tasks, plus a hidden exam, and ends in one result: `approved`, `clarify`, `dispute` or `failed`. The Lead launches it for you; it needs Claude Code's Workflow tool.
- `/aether:run`: the swarm workflow. It builds an approved plan in parallel waves, with a merge queue and a final review. The Lead launches it when the plan has three or more tasks.
- `/aether:specify`: Spec Kit's command, adapted: writes `spec.md` from the intent you confirmed.
- `/aether:plan`: writes `plan.md` for an approved spec.
- `/aether:tasks`: writes `tasks.md` for an approved plan, with the fields the swarm builds from.
- `/aether:constitution`: creates or updates the principles every spec, plan and task follows. The Lead and the Writer normally use these four through the design; type one to write that document by hand.
- `/harnesses`: a read-only panel of the delegation settings and the quota of each harness. `r` renews the readings, `Esc` or `x` closes it. It calls no model (see [the panel](guide/lanes.md#the-harnesses-panel)).
- `/spend`: a read-only panel of this session's list-price spend, by model, effort and role, plus the calls to other harnesses (see [the panel](guide/lanes.md#the-spend-panel)). `/harnesses` and `/spend` exist only in an Aether session.

## The short command, `aeth`

- `aeth`: starts Aether mode in the folder you are in: the Lead, at `xhigh` effort, with the Aether theme and the permission mode you chose in `/aether:setup`. The Lead opens with a welcome line that names `/aether:help`. It is a small command that `/aether:setup` puts in a folder of your `PATH`, under the name you choose, and it never replaces a file that is not its own.
- `aeth -c`: continues the last conversation. `aeth --resume` lets you pick an older one.
- `aeth -p "<task>"`: runs one task and prints the result, with no screen.
- The long form, `claude --agent aether:lead --effort xhigh`, starts the same Lead with no setup and without the launcher's extras, so Claude Code's own permission mode applies. Use it to be asked before each tool, or before running `/aether:setup`.

## The agents

Who does what, in Aether mode ([Components](reference/components.md) has the models and efforts):
- `aether:lead`: the Lead, the main session you talk to. It is not a subagent. It writes the intent card, launches the design, chooses how to build, judges the results and writes the brief.
- `aether:writer`: writes the spec from the intent card, and the plan and the tasks from the approved spec.
- `aether:judge`: reads a spec, a plan or tasks and rules `approve`, `revise` or `reject`; what goes beyond your intent counts as a defect. Read-only.
- `aether:examiner`: writes the hidden acceptance exam of an approved spec and plan.
- `aether:implementer`: builds one task of the plan in its own worktree, test first. It starts on Haiku and rises only when it must.
- `aether:supervisor`: reviews each attempt of an implementer and rules `approve`, `retry`, `escalate` or `block`. Read-only.
- `aether:reviewer`: reviews everything a swarm run merged, as one change, against the plan and the spec. Read-only.
- `aether:ops`: runs one `aether-wt` or `aether-lane` command and returns its output. With the `ops` option on, the mod answers those commands itself, without a model.

## What protects you

- `aether-guard`: a hook that acts only in an Aether session. It keeps specs, plans, tasks and the constitution writable only by the Lead and the Writer, and the Examiner inside `.aether-exam/`. Before each Bash command it recognizes the irreversible classes (`push`, `merge-main`, `publish`, `deploy`, `delete`, `credentials`): with no grant of yours it records the command in your list, `.aether/pending.jsonl`, and the launcher makes it refuse the command. In any other session it allows everything.
- «Espera tu sí»: the first list of every brief: what only you can decide and the irreversible actions nobody authorized, each with why, what happens if you say no, how to undo it and the exact command. You answer in plain words; a general «sí» also records a standing grant (see [Autonomy](guide/autonomy.md)).
- The hidden exam: the Examiner writes it after the design is approved and keeps it outside the repository. The swarm never sees it, so a mistake that the swarm's tests share with its code does not hide from it.
- The quota brake: near the limit of your account's five-hour window, it warns you once, and in an autonomous run it stops in order, saves the work and resumes by itself when the window resets.

## The options

Eight options, set at install or later in `/plugin` → Installed → aether → Configure options. The one table, with how to set each, is [Options](guide/options.md#options). In short:
- `superdelegation`, off by default: sends the work that is not the Lead's to other coding harnesses while their quota lasts.
- `harnesses`, `agy` by default: which harnesses it may use (`agy`, `codex`, `grok`, `cursor`, `muse`).
- `ops`, on by default: lets the mod run the swarm's own `aether-wt` and `aether-lane` commands without a model.
- `deadlines`, `quota=3` by default: how many seconds a delegate task waits for the quota decision.
- `quotabrake`, `95` by default: the percent of the five-hour window at which the brake acts.
- `brakepush`, off by default: also pushes the unit branches an interrupted workflow saved, when your recorded `push` permission covers it.
- `observedev`, off by default: development mode of self-observation, which keeps redacted conversation fragments.
- `autoissue`, off by default: in development mode only, opens an issue on the plugin's own repository for each failure found.

## Commands for the terminal or the Lead

These are on the Bash tool's `PATH` in a session with the plugin, so the Lead runs them for you; from a shell outside a session, run the file by its path (see [Getting started](getting-started.md)).
- `aether-doctor`: the check that `/aether:doctor` runs; it prints one JSON object and exits 1 when a check is an error.
- `aether-report --spend`: the list-price spend of one session, in dollars; the same figure as `/spend`.
- `aether-plan check`: checks a plan's `tasks.md` and prints its waves; it says what to fix when the plan is not sound.
- `aether-autonomy status`: the state of the autonomous run that is open, with its ceilings.

## What Aether does not do

- Plain `claude` stays normal mode. The plugin is dormant there: its hooks do nothing, nothing is recorded, and `/harnesses`, `/spend` and the agents are not offered (the measured footprint is in [Components](reference/components.md#what-aether-adds-to-a-normal-session)).
- Nothing leaves your machine, except the automatic issues of the development mode, with `autoissue` on, which go to the plugin's own repository and never carry conversation text (see [Self-observation](guide/observe.md#what-never-leaves-your-machine)).
- `/aether:setup` edits no shell file, and replaces no file that is not its own.
- It does not push, merge to `main`, publish or deploy without your yes or a standing grant you gave.

## Cheat sheet: I want to…

| I want to… | Do this |
|---|---|
| Start Aether mode in my project | Open a terminal in the project folder and type `aeth` ([guide](tutorials/install-and-start.md)) |
| Continue yesterday's conversation | `aeth -c`; to pick an older one, `aeth --resume` |
| Run one task and get the answer in the terminal | `aeth -p "<task>"` |
| Start without the short command | `claude --agent aether:lead --effort xhigh` |
| Find out why something fails | `/aether:doctor` |
| Change my permissions, harnesses or the command's name | Run `/aether:setup` again |
| See what Aether can do | `/aether:help`; add a topic, as in `/aether:help spend` |
| Have the Lead learn the project first | `/aether:onboard` |
| Ask for a first piece of work | Tell the Lead in your own words ([guide](tutorials/first-request.md)) |
| Get a whole feature built | Say what you want and answer its questions; it designs, builds and reports ([guide](tutorials/whole-feature.md)) |
| Let it work for hours | Say «trabaja autónomamente» or «trabaja por horas» ([guide](tutorials/work-for-hours.md)) |
| Know what needs my decision | Read «Espera tu sí» first in the brief ([guide](tutorials/read-the-brief.md)) |
| Send work to Codex or another harness | Run `/aether:setup` again and choose it ([guide](tutorials/other-harnesses.md)) |
| See what I have spent | `/spend` in the session, or `aether-report --spend` ([guide](tutorials/see-the-spend.md)) |
| See the quota of my other harnesses | `/harnesses` |
| Update Aether | `claude plugin update aether@aether-plugin`, then start a new session ([guide](tutorials/update-and-uninstall.md)) |
| Uninstall Aether | `claude plugin uninstall aether@aether-plugin`; add `--keep-data` to keep its data ([guide](tutorials/update-and-uninstall.md)) |
| Work in plain Claude Code | Type `claude`: Aether stays dormant |
