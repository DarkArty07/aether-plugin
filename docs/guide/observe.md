---
title: Self-observation
description: How the plugin watches its own use in a Lead session, what the standard and the development installations gather, the five hooks and the verbs of aether-observe, the automatic issues of the development mode, and the promise that nothing leaves your machine, with its one exception
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

The silent faults of the mod (the usage meter, the delegate ladder and the spawn of an agent) are kept apart, in `observe/faults/<session>-<start>.json` (one file per copy of the mod, so a reload starts its own): for each one its time, the place where it happened (`source`), its class (`class`) and, where the mod caught an error in place, the kind of that error (`kind`). The kind is the name of the error's class when it is `Error`, `TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `URIError` or `EvalError`, and `other` for anything else; the message is never kept, because it can carry paths or text. A fault recorded from a `.catch` handler has no kind, since that handler is not given the error. The first 100 faults are kept, and the count goes on. The kinds reach the reading too: the draft of a fault names them beside its class, counted (`TypeError ×2`), and the durable summary counts the kinds of each session, so the prune of the raw file loses none of them.

The detection runs by itself when a Lead session ends: the `SessionEnd` hook digests the session into the durable summary and reads what was gathered.

## What it points out

The reading is an ordered list of findings, each with its evidence and its numbers. A finding is one of three kinds:
- a **failure**, such as a task that climbs a step with no reason, a pair that fails run after run, a rule of the Lead that is broken, a command blocked by mistake, or a silent fault of the mod that now leaves a trace; for each one the reading drafts the text of an issue under `observe/issues/`, not opened by the reading (the development mode can file it, see below);
- a **calibration**, such as a step that almost never approves, a pair or a model that no longer performs as its record says, a design role that asks for too many rounds, or an estimated cost far from the real one; it proposes the adjustment with its numbers and applies none of it: `config/ladder.json`, `config/pairs.json` and the other tables are never changed by the plugin;
- a **friction**, such as a tool that keeps failing or a context that is compacted again and again.

The thresholds are data in `config/observe.json`.

## The command

| Command | What it does |
|---|---|
| `aether-observe hook` | The handler of the five hooks above. It reads the hook's JSON from its input and prints nothing |
| `aether-observe file-issues` | The worker of the automatic issues (see below). A Lead session that ends starts it by itself when `autoissue` is on; run by hand, it files the failures of the last reading now. It prints one JSON line. In the standard installation, or with `autoissue` off, it prints an error and does nothing |

## What is kept, and for how long

The raw files (the events, the files of faults, the dev fragments) are pruned after 30 days. Before a prune, the plugin digests each session into `observe/summary.json`, the durable summary, which holds only figures and is never pruned. A pause of weeks loses no figure: the next reading uses the summary.

## What never leaves your machine

Nothing leaves your machine, except one case. The standard installation never opens a connection or starts `gh`, and neither do the hooks, the detectors and the summary in the development installation. The one exception is the automatic issues of the development mode, with `autoissue` on, described in the next section. Everywhere else a drafted issue is only a text file under `observe/issues/`, and an issue is opened only with your yes.

## Opening issues by itself (development mode)

In the development installation, with the `autoissue` option on, a Lead session that ends files the failures its reading found as GitHub issues in the plugin's own repository, the `repository` of `plugin.json` (`DarkArty07/aether-plugin`). It never files them in the repository of the folder you work in. It is off by default, it has no effect in the standard installation, and a plain session runs none of it.

To turn it on, set the option (`--config autoissue=true` at install, or `/plugin` → Installed → aether → Configure options later), or set `AETHER_AUTOISSUE=on` in the shell that starts Claude Code. `AETHER_AUTOISSUE=off` turns it off whatever the option says; any other value counts as not set. It also needs the development mode (`aether-lead --dev`, `AETHER_OBSERVE=dev` or `observedev`): without it nothing is filed, whatever the option says. It needs `gh` installed and signed in.

What is sent is the title and the body that the reading already drafted for each failure: its figures, classes, names of files and hour. Before it leaves, the text is cleaned: each session becomes its first eight characters, each absolute path of your home directory becomes `~/…`, and `redact()` runs over the result; a body that `redact()` would change is not sent (its draft stays local and the run counts it as held). Only then does each name of a delegate task, which the Lead writes from your work in any project, become `task-` and eight characters of its hash, in the title, the body and the marker, so that no task name reaches a public repository. The footer names the plugin's version and the time, and a marker, `<!-- aether-observe:<id> -->`, names the finding. Conversation text is never sent: the worker does not read the fragments or your corrections, which stay on your machine. Only failures are filed. Calibrations, frictions and the owner-correction item are not.

Each issue gets the label `aether-observe`, which the worker creates when it is missing. Before it creates one, it lists the labelled issues, on GitHub, and looks for the marker of the finding; a finding that already has an issue, from this machine or another, is not filed again. The ledger `observe/issues-filed.json` keeps what was filed, finding by finding: the issue's number and address, the time, and whether it was created or found. A finding in the ledger is not sent or searched again, so a failure that returns after you closed its issue is not filed again.

Two caps, in `config/observe.json` under `autoIssue`, keep the tracker small: `maxPerSession` (3) limits the issues one run creates, and `maxOpen` (10) stops the creation while that many labelled issues are open. The run counts what a cap holds back as skipped. A lock, `observe/issues-filed.lock`, keeps two runs from working at once; a lock older than five minutes is taken over.

The session end does not wait for GitHub. The `SessionEnd` hook still prints nothing and exits 0. When `autoissue` is on, it starts `aether-observe file-issues` as a detached process with no output, and that process makes the calls to `gh`, each with a 20-second limit and 90 seconds for the whole run.

Its limits:
- it runs when a Lead session ends: a session that stops without ending files nothing until a later run;
- it needs `gh` installed and signed in; without it, nothing is sent, the drafts stay where they are, and the next run tries again;
- a failure that returns after its issue was closed is not filed again;
- a false positive stays open until you close it; the caps only bound how many there are;
- it has not been tried in a real session: the tests use a fake `gh`.

## Conversation content, and its three exemptions

The standard installation does not read, keep or write conversation content: what you type, what the model answers (with the prompts and commands it writes) and what a file holds. From the files that already exist it reads fields only (identifiers, classes, dates and counts) and compares commands by a fingerprint, without copying their text.

Three functions of Aether that existed before the observation are exempt, because each one is a thing you use by hand and not observation, and none was removed:
- `aether-voice` and `aether-autonomy start --quote` read the transcript only when you give the command, to check a quote of your own words;
- the full prompt of a delegate, which `aether-delegate` writes in `delegates/briefs/` and in `external/*.json`, is the task itself that is handed over;
- `.aether/pending.jsonl` keeps the command that the guard blocked, which is your list of irreversible steps to approve.

## What the development installation keeps about your corrections

The development installation also looks for the moments when you correct the Lead. When a Lead session ends, it reads once the messages you typed in that session's conversation file and keeps those that contain a phrase of the `correctionPatterns` lists in `config/observe.json` (Spanish and English, for example "eso no", "te dije", "that's not", "i said"; edit the lists as you like). It is a heuristic of words, not a judgment: some matches are not corrections, and some corrections have none of those words. For each match, up to 20 per session, it keeps your message cut to 400 characters and the last 400 characters of what the Lead had said just before it, both with keys and tokens removed, in `observe/dev/<session>/corrections.json` (mode 600). The file is rewritten at each session end and deleted after 30 days like the other development fragments. The reading at session end never shows that text: it reports only an `owner-correction` item with the count, the first and last time and the file name; the text is not copied into the summary or into an issue draft. The standard installation never reads what you type. To delete it all, delete the `observe/` folder of the data directory.
