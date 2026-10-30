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
| `superdelegation` | off | `--config superdelegation=true` at install, or `/plugin` → Installed → aether → Configure options later | Sends everything that is not the Lead to other coding harnesses while their quota lasts; native Claude is the fallback: see [Lanes](lanes.md#lanes) |
| `harnesses` | `agy` | `--config harnesses=agy,grok,muse` at install, or `/plugin` → Installed → aether → Configure options later | Lists the harnesses lanes may use, comma-separated: see [Lanes](lanes.md#lanes). Cursor is not tested with a real account. |
| `ops` | on | `--config ops=false` at install, or `/plugin` → Installed → aether → Configure options later | Lets the mod run the swarm's own `aether-wt` and `aether-lane` commands without a model: see [Ops without a model](ops.md) |
| `deadlines` | `quota=3` | `--config deadlines=quota=3` at install, or `/plugin` → Installed → aether → Configure options later | Sets how long a delegate task waits, in seconds, for the quota decision; a value above 10 counts as 10 |
| `quotabrake` | `95` | `--config quotabrake=90` at install, or `/plugin` → Installed → aether → Configure options later | Sets the percent of the five-hour window used at which the quota brake warns you, and pauses an autonomous run until the window resets: see [Autonomy](autonomy.md#autonomy) |
| `brakepush` | off | `--config brakepush=true` at install, or `/plugin` → Installed → aether → Configure options later | Also pushes the unit branches an interrupted workflow saved to origin, when your recorded push permission covers it; off keeps saved work on its local branch |
| `observedev` | off | `--config observedev=true` at install, or `/plugin` → Installed → aether → Configure options later | Turns development mode on for self-observation, which keeps redacted conversation fragments and owner corrections: see [Self-observation](observe.md) |
| `autoissue` | off | `--config autoissue=true` at install, or `/plugin` → Installed → aether → Configure options later | In development mode only, opens on GitHub, in the plugin's own repository, an issue for each failure the self-observation reading finds, when a Lead session ends: see [Opening issues by itself](observe.md#opening-issues-by-itself-development-mode) |


- `superdelegation`, off by default, sends everything that is not the Lead to other coding harnesses while their quota lasts, and leaves native Claude as the fallback. They work without permission prompts and spend another plan's quota, so you turn it on yourself. It runs only on Linux. The switch is this option alone: `resolveOption` in `plugins/aether/lib/superdelegation.js` turns it on only when the value is `true`, and a saved `lanes` or `seats` value is not read. The rule is written once, in [Lanes](lanes.md#lanes). A delegate task that only reads goes to the external pair the one rule picks; a task that edits files goes first through `aether-lane delegate`, to the pair the one rule picks, and runs on Claude only when that command finds no candidate.
- `harnesses`, `agy` by default, lists the harnesses superdelegation may use, comma-separated: `agy`, `codex`, `grok`, `cursor`, `muse`. The quota decides the order of the candidates, then the cost per task. Add one only once its models are in the lane table (see [Lanes](lanes.md#lanes)). Cursor is not tested with a real account.
- `ops`, on by default, lets the mod run the swarm's own `aether-wt` and `aether-lane` commands without a model (see [Ops without a model](ops.md)). Turn it off when your project's test command needs your shell's environment: the Haiku `ops` agent then runs them with the Bash tool, as before 0.8.
- `deadlines`, `quota=3` by default, is how long a delegate task waits, in seconds, for the quota decision; a value above 10 counts as 10, and a key that is missing or wrong keeps its default.
- `quotabrake`, `95` by default, is the percent of your account's five-hour window used at which the quota brake acts in a Lead session: it warns you once per crossing and, in an autonomous run, pauses the run — nothing new starts, what is running is stopped and saved — until the window resets, then resumes the run on its own. The seven-day window at the same percent only warns, and so does a Lead session with no run open. Only your own recorded words turn the brake off, and only for that run. A value that is not a finite number n with 0 < n <= 100 is `95`.
- `brakepush`, off by default, also pushes the unit branches an interrupted workflow saved to `origin`. The saved work is local either way; with this on, a saved branch is pushed only when your recorded `push` permission covers it, branch by branch.
- `observedev`, off by default, turns on development mode for self-observation: it also keeps redacted conversation fragments around failures and owner corrections to the Lead (see [Self-observation](observe.md)). Standard self-observation never reads or keeps conversation text.
- `autoissue`, off by default, works only in development mode (turned on by `observedev`, `AETHER_OBSERVE=dev` or `aether-lead --dev`). When a Lead session ends, it opens on GitHub, in the plugin's own repository and not in the folder you work in, an issue for each failure the reading found, with the evidence the reading already wrote; conversation text is never sent. It needs `gh` installed and signed in. `AETHER_AUTOISSUE=on` turns it on and `AETHER_AUTOISSUE=off` turns it off, whatever the option says; any other value counts as not set. It has no effect in the standard installation (see [Self-observation](observe.md#opening-issues-by-itself-development-mode)).

`harnesses` and `deadlines` are free text. In an Aether session, the [`/harnesses` panel](lanes.md#the-harnesses-panel) shows the values the session uses for `superdelegation` and `harnesses`, with the same fallbacks as above for a value that is not valid. A value you saved earlier for one of the three retired delegate-router options raises no error: nothing reads it.

Set them at install with `--config superdelegation=true`, or later in `/plugin` → Installed → aether → Configure options. `claude plugin configure aether@aether-plugin` shows the options and which are unset.

### What you set yourself

A plugin cannot set these, so you do:

| Need | Step |
|---|---|
| The Lead at `xhigh` | `--effort xhigh` in the start command; `effortLevel` in a settings file could also hold `xhigh`, but the launcher passes it explicitly |
| Dynamic workflows, for `/aether:design` and the swarm | Nothing on most paid plans. On Pro, turn on Dynamic workflows in `/config` once |
| No advisor in Aether mode (each call rereads the whole conversation, uncached) | Nothing unless you configured one. If you did, run `/advisor off` |
| Permissions for the swarm | Allow rules for `git`, `aether-wt`, `aether-lane` and the test command, and edits under `.aether/worktrees/`; `scripts/aether-lead` bypasses permissions instead |
| superpowers off in Aether sessions, if you keep it for other work | `--settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'` in the start command |
| Irreversible commands refused, not only recorded | `AETHER_IRREVERSIBLE=enforce` in the shell that starts Claude Code; `scripts/aether-lead` sets it |
| Superdelegation on Codex, Grok, Muse or Cursor | Codex, Grok and Muse: their models and pairs are already in the tables, so they need only their name in the `harnesses` option, and for Codex that you signed in to `codex` yourself (see [Lanes](lanes.md#lanes)). Cursor: its models in your copy of the lane table and its pairs in your copy of `plugins/aether/config/pairs.json`, `AETHER_LANES_CONFIG` and `AETHER_PAIRS_CONFIG` set to those copies, and the `harnesses` option |
| Gemini 4 Argon in the design seats | agy 1.3.6 or later, which lists it, and `superdelegation` on; on the scale of 2026-10-29 Argon is under the floor of the Judge and the Examiner, so their rounds run native until a pair with those roles reaches it (see [Design seats](design-seats.md#design-seats)) |
