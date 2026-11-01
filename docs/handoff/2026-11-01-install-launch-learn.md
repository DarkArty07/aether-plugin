# Handoff: install, start and learn Aether in four steps (spec 024, version 0.30.0)

- **Date:** 2026-11-01. It follows the handoff of the table of models on one scale (versions 0.28.0 and 0.29.0), which it leaves as it is.
- **From:** the Lead, Claude Code. This file is the draft of task T17 of spec 024, written on Haiku 5.5; the Lead reviews it before the release (T20).
- **To:** the owner, and the next session.
- **Repository state:** version 0.30.0 is on the branch `ccr-763bff04-p62mfq`, pushed to `origin`, with its code in commit `ec2faf6`. It is **not merged to `main`, not tagged and not released**. The owner merges it, then tags it with `claude plugin tag plugins/aether` on `main`, as in the earlier releases. The docs that close the release (section 5) are written on the same branch and are not committed by this draft.

## 1. What was asked

The owner wants the next release to be about the person who installs Aether, how they learn it and how they launch it: «en el siguiente release me quiero dedicar a […] la comodidad que tiene el plugin para la persona que lo instala y cómo lo aprende a usar y cómo lo lanza». He asked for guides «punto por punto» in English and Spanish, and for the plugin to be formalized, taking what oh-my-claudecode and everything-claude-code do well. He chose the version («Yo usaría también el 0.30.0»), the permission default («Permisos por defecto es sin pedir permisos como yo lo uso en mi instalación») and the way out of the terminal («me gustaría responder las preguntas y cerrar la terminal para abrir una nueva»). He also said «NO uses subagentes en opus». The intent card is [the intent](../../specs/024-install-launch-learn/intent.md); decision A103 in [the decisions](../decisions.md) records the result.

## 2. What was built

[The spec](../../specs/024-install-launch-learn/spec.md), [the plan](../../specs/024-install-launch-learn/plan.md) and [the tasks](../../specs/024-install-launch-learn/tasks.md).

- **The four steps.** One line installs the plugin and opens Claude Code with `/aether:setup`: `claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"`. Claude Code 2.1.316 lets a plugin run nothing at install, so the line chains the setup itself. The person answers the questions, closes the terminal, opens one in the project and types `aeth`. The README's Quick start and the installation section of the site carry the four steps in English and Spanish.
- **`/aether:setup`** (the skill `setup`, with `disable-model-invocation`) replaces the first-setup skill. It runs `aether-doctor`, asks in one AskUserQuestion call (the permissions always; the other harnesses only when `aether-doctor` finds one; a name only when `aeth` is taken), installs `aeth` with `aether-first-setup --permissions`, saves `superdelegation` and `harnesses` with `claude plugin configure aether@aether-plugin --values-stdin`, and ends on one screen. It writes no code, edits no file by hand and touches no shell file.
- **`aether-first-setup`** takes `--permissions autonomous|auto|ask` (default `autonomous`, which is `bypassPermissions`). The stub exports `AETHER_PERMISSION_MODE` unless the shell already sets it, and the launcher `plugins/aether/launcher/aether-lead` reads it, with `bypassPermissions` as the fallback. Without `--dir` the stub goes in `~/.local/bin` when that is on the `PATH`; else next to `claude` when that is inside `$HOME` and writable; else in `~/.local/bin` with the line that puts it on the `PATH`. A stub written by an earlier version is still recognized as Aether's own.
- **`aether-doctor`** prints `{ ok, version, checks }`. Its checks are pure functions in `lib/doctor.js` over what they are given (environment, command runner, filesystem), so they can be tested without network or model. Dynamic workflows are read from the settings files: off (`error`) when `CLAUDE_CODE_DISABLE_WORKFLOWS` or a settings file turns them off, which wins; on (`ok`) when `enableWorkflows` is true; otherwise `info`, since the plan decides. **`/aether:doctor`** shows the fixed report and changes nothing.
- **`/aether:help`** (the skill `help`) keeps its map in the skill itself, because the installed plugin does not ship `docs/` (decision D6). **The welcome line** is the `systemMessage` of the SessionStart hook, at `startup` and only in a Lead session.
- **The guides.** Eight in `docs/tutorials/` and the same eight in `docs/es/guias/`, plus `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md` and `docs/es/index.md`. The Quick start links the install guide in both languages.

## 3. How it was checked

- **By hand, on this container.** T1: a plugin skill passed as the prompt runs (`claude -p "/demo:hello"`, Claude Code 2.1.316). In interactive mode the folder-trust question stops it, and the container cannot answer it, so `claude "/aether:setup"` was tested only with `-p`. T2: `claude plugin configure --values-stdin` takes a JSON object of strings and refuses a value that is not a string; the Lead tried it on a throwaway configuration.
- **Tests written with the code** (commit `ec2faf6`): `tests/doctor.test.js`, `tests/first-setup.test.js`, `tests/help.test.js`, `tests/session-start.test.js`, `tests/launcher.test.js`, `tests/start-command.test.js` and `tests/site.test.js`. The version is 0.30.0 in `plugin.json`, in the pin of `tests/launcher.test.js` and in the README's Version line.
- **Still to run before the tag** (T18 to T20; this draft claims none of them as done): `npm test`; `npm run check` (the tests, the mod's tests and `validate --strict`); and the clean install in a throwaway `CLAUDE_CONFIG_DIR` (T19), which runs `aether-doctor`, `aether-first-setup`, `claude plugin configure` and checks that `aeth` starts the launcher.
- **The docs-facts test.** R15 holds the changelog's first line to version 0.30.0 and to decision A103, and the decisions table to the order of the releases. R11 holds the README's Version line and the changelog's first line to `plugin.json`.

## 4. The subagents

The owner's rule: subagents run on Sonnet or Haiku only, each with its model named in the call and never `fork`, which takes the model of the session (C7). The split of the plan, from [the tasks](../../specs/024-install-launch-learn/tasks.md):

| Who | Model | Tasks |
|---|---|---|
| Lead | the session's | T3 the spec, plan and tasks; T6 the `setup` skill; T10 the README; T20 the review, the version and the commits |
| Sonnet | code with its tests, and prose | T2; T4 `aether-doctor` and `/aether:doctor`; T5 `aether-first-setup` and the launcher; T8 `/aether:help`; T9 the welcome line; T11 `getting-started`; T12 and T13 the eight guides in both languages; T14 the two «what Aether adds» pages and the Spanish index; T15 the site; T19 the clean install |
| Haiku | checks and mechanical | T1; T16 the index, the docs-facts list and the components rows; T17 this draft; T18 the run of `npm test` |

The subagents do not commit. The Lead reviews what they return and makes the commits. The commit `ec2faf6` names Opus 5.5 in its co-author line; that is the Lead's session and not a subagent, but the Lead should confirm before the tag that no subagent of the release ran on Opus (T20).

## 5. What is open

- **For the owner (T21):** the four steps in an interactive session on his machine: the line; the answers to `/aether:setup`; closing the terminal; `aeth` in a new terminal in a project; one request to the Lead; `/aether:doctor` in that session; the welcome line; and the permission mode he chose. The container could not answer the folder-trust prompt, so the interactive run is his.
- **Then his word:** merge `ccr-763bff04-p62mfq` to `main` (a squash, as in 0.28.0 and 0.29.0); tag with `claude plugin tag plugins/aether` on `main`; then `claude plugin update`.
- **Before the tag, the Lead:** the pages still open on the branch (T11 and T16): `docs/getting-started.md` with the four steps (its `#start` anchor is linked from the roadmap's 0.12.4 entry, so keep the heading), the index `docs/index.md`, the rows of `docs/reference/components.md`, and the list of pages in `tests/docs-facts.test.js`. Then T18 to T20.
- **Proposals (spec 024, «Propuestas»), not built:** (1) a notice of a new version at the start of a Lead session, once a day, with a bounded `git ls-remote` and an option to turn it off; it needs the network, so it is not in 0.30.0. (2) `effort: xhigh` in the front matter of `aether:lead`, so that `claude --agent aether:lead` needs no `--effort`.

## 6. How to try the branch

`scripts/aether-lead --plugin-dir <worktree>/plugins/aether` loads the branch instead of the installed release, with the data directory `~/.claude/plugins/data/aether-inline/`. In a development tree the `aether-*` names on the `PATH` are the installed release's bins, so run the branch's bins by path: `node plugins/aether/bin/aether-doctor`, and `node plugins/aether/bin/aether-first-setup --check` to see what the stub would do without writing it.
