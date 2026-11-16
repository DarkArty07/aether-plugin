---
title: Plan rules
description: How a project declares which files a task must own when it adds or changes a pattern, and the warnings aether-plan check prints for each rule
order: 9
---

# Plan rules

A project may declare, in `.specify/plan-rules.json`, that a task which adds or changes a file of a given pattern must also own other files: the registration that keeps documentation and tests beside the code they pin. `aether-plan check` and `aether-plan compile` print one warning per rule that a task, together with the tasks it depends on, does not meet. The warnings do not fail the check: they tell the Writer what `Owns` is missing before the swarm is compiled. The check's other messages are in [Troubleshooting](troubleshooting.md).

## The file

`.specify/plan-rules.json` holds an array of rules. Each rule is an object with either `adds` or `changes`, an `owns` array of required registration paths, and a `why` string:

- `adds` names literal paths in `Owns` that do not exist in the tree yet: a task that creates one of them must own the registration.
- `changes` names existing files in `Owns`, including globs and folders: a task that edits one of them must own the registration.
- `owns` lists the paths the task, or a task it depends on, must own alongside.
- `why` says what the registration keeps true.

A file that is not valid JSON, or a rule without exactly these keys, is an error naming `.specify/plan-rules.json`, and the check stops there. A project without the file gets no new warning.

## The warning

For each task that adds or changes a file a rule covers, and none of the task and its dependencies own what the rule requires, the check prints one warning of the form `Task N adds <files> without owning <missing> (nor a task it depends on): <why>`, or the same with `changes`. The merge refuses a unit that edits a file outside its `Owns`, so a warning left standing leaves the registration out of reach: add the missing paths to the task's `Owns`, or make the task that owns them a dependency.

## The three rules of this repository

This repository declares three rules in `.specify/plan-rules.json`:

- A task that adds under `plugins/aether/lib/` must own `docs/reference/components.md`: every new module is declared there, in a family or loose.
- A task that adds under `plugins/aether/bin/` must own `docs/reference/components.md`: every new command is listed there.
- A task that changes `docs/decisions.md` must own `docs/index.md`, `tests/docs-032.test.js` and `tests/docs-facts.test.js`: a new decision moves the range the index and the document tests pin.

See [Decisions](../decisions.md) for the record they keep, and [Components](../reference/components.md) for the registration of modules and commands.
