---
title: Self-observation
description: How the plugin watches its own use in a Lead session, what the standard and the development installations gather, the five hooks and the five verbs of aether-observe, and the promise that nothing leaves your machine
order: 17
---

# Self-observation

Aether watches its own use so that its faults and its settings can be found without you asking. While a Lead session runs, five hooks leave a trace of what failed, and when the session ends the plugin reads what it gathered and lists what looks wrong. It calls no model for this, and it applies nothing: it only points out. The design is [spec 014](../../specs/014-self-observation/spec.md).

## The two installations

The same code runs in both; what differs is how much of a conversation it may keep.

| Installation | How it starts | What it gathers |
|---|---|---|
| `standard` | `claude plugin install aether@aether-plugin`, the install of [Getting started](../getting-started.md) | Identifiers, classes, model names, durations, counts and dates: the event of each hook, the silent faults of the mod, the digest of each session. It never reads or keeps what you type, what the model answers or what a file holds |
| `dev` | From a clone of the repository, `AETHER_OBSERVE=dev scripts/aether-lead --plugin-dir <tree>/plugins/aether` | What `standard` gathers, plus a short fragment of the conversation around a failure, and the moments you corrected the Lead. Keys and tokens are erased before anything is saved |

The `dev` installation is a clone, or a worktree of it, launched with `--plugin-dir`; it is not the plugin you installed. It writes in the data directory `aether-inline`, not in the one of the installed plugin (`aether-aether-plugin`), unless the command sets `AETHER_DATA_DIR` to that one.

The variable `AETHER_OBSERVE` changes nothing in the marketplace install: the plugin is `dev` only when the variable is exactly `dev` and the plugin runs from the repository tree. An install from the marketplace lives in Claude Code's cache, so it is `standard` whatever the variable says.

## What it does on its own

The handler is `aether-observe hook`, and five hooks call it:
- `PostToolUse`, only for `ScheduleWakeup`, which the Lead must not use to wait for a delegate;
- `PostToolUseFailure`, when a tool call fails;
- `StopFailure`, when a turn ends on an API error;
- `PreCompact`, when the context is compacted;
- `SessionEnd`, when the session ends.

Each one writes one line to `observe/events.jsonl` with its time, the session, the kind of event and an identifier or a class, never a message. In a session that is not the Lead's they write and print nothing. `aether-observe hook` prints nothing ever and always exits 0, so it cannot slow or break a request.

The detection runs by itself when a Lead session ends: the `SessionEnd` hook digests the session into the durable summary and reads what was gathered. `aether-observe read` only repeats that reading by hand, whenever you want to see it.

## What it points out

The reading is an ordered list of findings, each with its evidence and its numbers. A finding is one of three kinds:
- a **failure**, such as a task that climbs a step with no reason, a pair that fails run after run, a rule of the Lead that is broken, a command blocked by mistake, or a silent fault of the mod that now leaves a trace; for each one the reading drafts the text of an issue under `observe/issues/`, not opened;
- a **calibration**, such as a step that almost never approves, a pair or a model that no longer performs as its record says, a design role that asks for too many rounds, or an estimated cost far from the real one; it proposes the adjustment with its numbers and applies none of it: `config/ladder.json`, `config/pairs.json` and the other tables are never changed by the plugin;
- a **friction**, such as a tool that keeps failing or a context that is compacted again and again.

The thresholds are data in `config/observe.json`.

## The commands

All of them run from any shell, like `aether-report`; each verb but `hook` prints one JSON line.

| Command | What it does |
|---|---|
| `aether-observe hook` | The handler of the five hooks above. It reads the hook's JSON from its input and prints nothing |
| `aether-observe read` | Prints the ordered findings and drafts the issue of each failure |
| `aether-observe baseline` | Prints the numbers that the data directory already holds, as a reference, and saves them in `observe/baseline.json`; `--from <dir>` reads another data directory, in read-only, such as the installed plugin's |
| `aether-observe status` | Shows what is kept under `observe/`, by class and size |
| `aether-observe forget --yes` | Deletes `observe/` and nothing else; without `--yes` it deletes nothing |

## What is kept, and for how long

The raw files (the events, the files of faults, the dev fragments) are pruned after 30 days. Before a prune, the plugin digests each session into `observe/summary.json`, the durable summary, which holds only figures and is never pruned. A pause of weeks loses no figure: the next reading uses the summary.

## What never leaves your machine

Nothing gathered here leaves your machine. The hooks, the detectors and the summary open no connection and start no `gh`. A drafted issue is only a text file under `observe/issues/`: an issue is opened only with your yes.

## Conversation content, and its three exemptions

The standard installation does not read, keep or write conversation content: what you type, what the model answers (with the prompts and commands it writes) and what a file holds. From the files that already exist it reads fields only (identifiers, classes, dates and counts) and compares commands by a fingerprint, without copying their text.

Three functions of Aether that existed before the observation are exempt, because each one is a thing you use by hand and not observation, and none was removed:
- `aether-voice` and `aether-autonomy start --quote` read the transcript only when you give the command, to check a quote of your own words;
- the full prompt of a delegate, which `aether-delegate` writes in `delegates/briefs/` and in `external/*.json`, is the task itself that is handed over;
- `.aether/pending.jsonl` keeps the command that the guard blocked, which is your list of irreversible steps to approve.
