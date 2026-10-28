---
title: Self-observation
description: How the plugin watches its own use in a Lead session, what the standard and the development installations gather, the five hooks and the one verb of aether-observe, and the promise that nothing leaves your machine
order: 17
---

# Self-observation

Aether watches its own use so that its faults and its settings can be found without you asking. While a Lead session runs, five hooks leave a trace of what failed, and when the session ends the plugin reads what it gathered and lists what looks wrong. It calls no model for this, and it applies nothing: it only points out. The design is [spec 014](../../specs/014-self-observation/spec.md).

## The two modes

The same code runs in both; what differs is how much of a conversation it may keep. The two modes are standard and development, turned on with `aether-lead --dev`, the variable or the `observedev` option.

| Mode | How it starts | What it gathers |
|---|---|---|
| `standard` | `claude plugin install aether@aether-plugin`, the install of [Getting started](../getting-started.md) (the default mode) | Identifiers, classes, model names, durations, counts and dates: the event of each hook, the silent faults of the mod, the digest of each session. It never reads or keeps what you type, what the model answers or what a file holds |
| `dev` | `aether-lead --dev`, `AETHER_OBSERVE=dev`, `--config observedev=true`, or `scripts/aether-lead --plugin-dir <tree>/plugins/aether` | What `standard` gathers, plus a short fragment of the conversation around a failure, and the moments you corrected the Lead. Keys and tokens are erased before anything is saved |

Development mode is turned on with `aether-lead --dev`, the environment variable `AETHER_OBSERVE=dev` (or turned off with `AETHER_OBSERVE=standard`), or the `observedev` option. Precedence goes to `AETHER_OBSERVE` when set to `dev` or `standard`, then the `observedev` option. Running from a clone of the repository with `scripts/aether-lead --plugin-dir <tree>/plugins/aether` is just another way to run it; it writes in the data directory `aether-inline`, not in the one of the installed plugin (`aether-aether-plugin`), unless the command sets `AETHER_DATA_DIR` to that one.

## What it does on its own

The handler is `aether-observe hook`, and five hooks call it:
- `PostToolUse`, only for `ScheduleWakeup`, which the Lead must not use to wait for a delegate;
- `PostToolUseFailure`, when a tool call fails;
- `StopFailure`, when a turn ends on an API error;
- `PreCompact`, when the context is compacted;
- `SessionEnd`, when the session ends.

Each one writes one line to `observe/events.jsonl` with its time, the session, the kind of event and an identifier or a class, never a message. In a session that is not the Lead's they write and print nothing. `aether-observe hook` prints nothing ever and always exits 0, so it cannot slow or break a request.

The silent faults of the mod (the usage meter, the delegate ladder and the spawn of an agent) are kept apart, in `observe/faults/<session>.json`: for each one its time, the place where it happened (`source`), its class (`class`) and, where the mod caught an error in place, the kind of that error (`kind`). The kind is the name of the error's class when it is `Error`, `TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `URIError` or `EvalError`, and `other` for anything else; the message is never kept, because it can carry paths or text. A fault recorded from a `.catch` handler has no kind, since that handler is not given the error. The first 100 faults are kept, and the count goes on.

The detection runs by itself when a Lead session ends: the `SessionEnd` hook digests the session into the durable summary and reads what was gathered.

## What it points out

The reading is an ordered list of findings, each with its evidence and its numbers. A finding is one of three kinds:
- a **failure**, such as a task that climbs a step with no reason, a pair that fails run after run, a rule of the Lead that is broken, a command blocked by mistake, or a silent fault of the mod that now leaves a trace; for each one the reading drafts the text of an issue under `observe/issues/`, not opened;
- a **calibration**, such as a step that almost never approves, a pair or a model that no longer performs as its record says, a design role that asks for too many rounds, or an estimated cost far from the real one; it proposes the adjustment with its numbers and applies none of it: `config/ladder.json`, `config/pairs.json` and the other tables are never changed by the plugin;
- a **friction**, such as a tool that keeps failing or a context that is compacted again and again.

The thresholds are data in `config/observe.json`.

## The command

| Command | What it does |
|---|---|
| `aether-observe hook` | The handler of the five hooks above. It reads the hook's JSON from its input and prints nothing |

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

## What the development installation keeps about your corrections

The development installation also looks for the moments when you correct the Lead. When a Lead session ends, it reads once the messages you typed in that session's conversation file and keeps those that contain a phrase of the `correctionPatterns` lists in `config/observe.json` (Spanish and English, for example "eso no", "te dije", "that's not", "i said"; edit the lists as you like). It is a heuristic of words, not a judgment: some matches are not corrections, and some corrections have none of those words. For each match, up to 20 per session, it keeps your message cut to 400 characters and the last 400 characters of what the Lead had said just before it, both with keys and tokens removed, in `observe/dev/<session>/corrections.json` (mode 600). The file is rewritten at each session end and deleted after 30 days like the other development fragments. The reading at session end never shows that text: it reports only an `owner-correction` item with the count, the first and last time and the file name; the text is not copied into the summary or into an issue draft. The standard installation never reads what you type. To delete it all, delete the `observe/` folder of the data directory.
