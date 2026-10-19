---
title: Options
description: The eight options of the Aether plugin, their defaults, how to set each one, and the settings a plugin cannot make for you.
order: 10
---

# Options

Aether has eight options, set when you install the plugin or later, and a few settings that only you can make. This page holds the one table of options: the other pages link here for a default.

## Configure Aether

### Options

| Option | Default | Set it | What it does |
|---|---|---|---|
| `lanes` | off | `--config lanes=true` at install, or `/plugin` → Installed → aether → Configure options later | Runs Aether's calls on other coding harnesses while their quota lasts: see [Lanes](lanes.md#lanes) |
| `harnesses` | `agy` | `--config harnesses=agy,grok` at install, or `/plugin` → Installed → aether → Configure options later | Lists the harnesses lanes may use, comma-separated: see [Lanes](lanes.md#lanes) |
| `ops` | on | `--config ops=false` at install, or `/plugin` → Installed → aether → Configure options later | Lets the mod run the swarm's own `aether-wt` and `aether-lane` commands without a model: see [Ops without a model](ops.md) |
| `seats` | `balanced` | `--config seats=robust` at install, or `/plugin` → Installed → aether → Configure options later | Chooses who takes the Judge, the Writer and the Examiner: see [Design seats](design-seats.md#design-seats) |
| `router` | `record` | `--config router=command` at install, or `/plugin` → Installed → aether → Configure options later | Chooses who picks the model and effort of the Lead's delegate tasks: record, advise or command. It never routes the swarm, the design seats or the aether agents |
| `decider` | `haiku` | `--config decider=jev` at install, or `/plugin` → Installed → aether → Configure options later | Chooses what decides for the router: `haiku`, or `jev` on OpenRouter, which sends each delegate brief to a third party |
| `fallback` | `sonnet:high` | `--config fallback=opus:high` at install, or `/plugin` → Installed → aether → Configure options later | Sets the model and effort a delegate task runs on when the router cannot decide and the Lead asked for none, as alias:effort |
| `deadlines` | `haiku=8,jev=3,quota=3` | `--config deadlines=haiku=5,jev=3,quota=3` at install, or `/plugin` → Installed → aether → Configure options later | Sets how long the router waits, in seconds, for each decider and for the quota decision; a value above 10 counts as 10 |


- `lanes`, off by default, runs Aether's calls on other coding harnesses while their quota lasts. They work without permission prompts and spend another plan's quota, so you turn it on yourself. Lanes run only on Linux.
- `harnesses`, `agy` by default, lists the harnesses lanes may use, comma-separated: `agy`, `codex`, `grok`, `cursor`. The quota decides the order of the candidates; the order of this option breaks ties between equal priorities and orders the groups with no reading. Add one only once its models are in the lane table (see [Lanes](lanes.md#lanes)).
- `ops`, on by default, lets the mod run the swarm's own `aether-wt` and `aether-lane` commands without a model (see [Ops without a model](ops.md)). Turn it off when your project's test command needs your shell's environment: the Haiku `ops` agent then runs them with the Bash tool, as before 0.8.
- `seats`, `balanced` by default, chooses who takes the design seats: `native`, `balanced` or `robust` (see [Design seats](design-seats.md#design-seats)). An external model takes a seat only with `lanes` on.
- `router`, `record` by default, chooses who picks the model and effort of the Lead's delegate tasks: `record` leaves the choice to the Lead and records, in the background, what the decider would have chosen; `advise` also tells the Lead that choice after it launches the task; `command` lets the decider choose, unless the Lead puts a `ROUTER-OVERRIDE: <reason>` line in the brief. It applies only to the Lead's delegate tasks.
- `decider`, `haiku` by default, is what decides for the router: `haiku` runs Claude Haiku at low effort with no outside service; `jev` calls typesafe/jev-1.14 on OpenRouter, which sends each delegate brief to a third party and needs `OPENROUTER_API_KEY` in the environment or in the `.env` of the plugin data directory.
- `fallback`, `sonnet:high` by default, is the model and effort a delegate task runs on when the router cannot decide and the Lead asked for none, written as `alias:effort`. The aliases are `haiku`, `sonnet` and `opus`; the efforts are `low`, `medium`, `high`, `xhigh` and `max`. A value that does not say so is `sonnet:high`.
- `deadlines`, `haiku=8,jev=3,quota=3` by default, is how long the router waits, in seconds, for each decider and for the quota decision; a value above 10 counts as 10, and a key that is missing or wrong keeps its default. In `record` mode nothing waits, because the decider runs in the background.

`router`, `decider` and `seats` are selectors since 0.12.3: `/plugin configure aether@aether-plugin` and `/config` show their values to pick from (`Delegate router ◀ record ▶`) instead of a free text, and the defaults do not change. `harnesses`, `fallback` and `deadlines` stay free text. In an Aether session, the [`/harnesses` panel](lanes.md#the-harnesses-panel) shows the values the session uses for `lanes`, `router`, `decider`, `seats` and `harnesses`, with the same fallbacks as above for a value that is not valid.

Set them at install with `--config lanes=true`, or later in `/plugin` → Installed → aether → Configure options. `claude plugin configure aether@aether-plugin` shows the options and which are unset.

### What you set yourself

A plugin cannot set these, so you do:

| Need | Step |
|---|---|
| The Lead at `max` | `--effort max` in the start command; the settings file cannot hold `max` |
| Dynamic workflows, for `/aether:design` and the swarm | Nothing on most paid plans. On Pro, turn on Dynamic workflows in `/config` once |
| No advisor in Aether mode (each call rereads the whole conversation, uncached) | Nothing unless you configured one. If you did, run `/advisor off` |
| Permissions for the swarm | Allow rules for `git`, `aether-wt`, `aether-lane` and the test command, and edits under `.aether/worktrees/`; `scripts/aether-lead` bypasses permissions instead |
| superpowers off in Aether sessions, if you keep it for other work | `--settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'` in the start command |
| Irreversible commands refused, not only recorded | `AETHER_IRREVERSIBLE=enforce` in the shell that starts Claude Code; `scripts/aether-lead` sets it |
| Lanes on Codex, Grok or Cursor | Codex and Cursor: their models in your copy of the lane table, `AETHER_LANES_CONFIG` set to that copy, and the `harnesses` option. Grok: its model, `grok-4.7`, is already in the lane table, so it needs only `grok` in the `harnesses` option (see [Lanes](lanes.md#lanes)) |
| Gemini 4 Argon in the design seats | agy 1.3.6 or later, which lists it, and `lanes` on (see [Design seats](design-seats.md#design-seats)) |
