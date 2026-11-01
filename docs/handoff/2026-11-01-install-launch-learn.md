# Handoff: install, start and learn Aether in four steps (spec 024, version 0.30.0)

- **Date:** 2026-11-01. It follows the handoff of the table of models on one scale (versions 0.28.0 and 0.29.0), which it leaves as it is.
- **From:** the Lead, Claude Code. Task T17 drafted this file on Haiku; the Lead reviewed and completed it (T20).
- **To:** the owner, and the next session.
- **Repository state:** version 0.30.0 is on the branch `ccr-763bff04-p62mfq`, pushed to `origin`, in four commits from `ec2faf6`. It is **not merged to `main`, not tagged and not released**. The owner merges it, then tags it with `claude plugin tag plugins/aether` on `main`, as in the earlier releases.

## 1. What was asked

The owner wants the next release to be about the person who installs Aether, how they learn it and how they launch it: «en el siguiente release me quiero dedicar a […] la comodidad que tiene el plugin para la persona que lo instala y cómo lo aprende a usar y cómo lo lanza». They asked for guides «punto por punto» in English and Spanish, and for the plugin to be formalized, taking what oh-my-claudecode and everything-claude-code do well. They chose the version («Yo usaría también el 0.30.0»), the permission default («Permisos por defecto es sin pedir permisos como yo lo uso en mi instalación») and the way out of the terminal («me gustaría responder las preguntas y cerrar la terminal para abrir una nueva»). They also said «NO uses subagentes en opus». The intent card is [the intent](../../specs/024-install-launch-learn/intent.md); decision A103 in [the decisions](../decisions.md) records the result.

## 2. What was built

[The spec](../../specs/024-install-launch-learn/spec.md), [the plan](../../specs/024-install-launch-learn/plan.md) and [the tasks](../../specs/024-install-launch-learn/tasks.md).

- **The four steps.** One line installs the plugin and opens Claude Code with `/aether:setup`: `claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"`. Claude Code 2.1.316 lets a plugin run nothing at install, so the line chains the setup itself. The person answers the questions, closes the terminal, opens one in the project and types `aeth`. The README's Quick start and the installation section of the site carry the four steps in English and Spanish.
- **`/aether:setup`** (the skill `setup`, with `disable-model-invocation`) replaces the first-setup skill. It runs `aether-doctor`, asks in one AskUserQuestion call (the permissions always; the other harnesses only when `aether-doctor` finds one; a name only when `aeth` is taken), installs `aeth` with `aether-first-setup --permissions`, saves `superdelegation` and `harnesses` with `claude plugin configure aether@aether-plugin --values-stdin`, and ends on one screen. It writes no code, edits no file by hand and touches no shell file.
- **`aether-first-setup`** takes `--permissions autonomous|auto|ask` (default `autonomous`, which is `bypassPermissions`). The stub exports `AETHER_PERMISSION_MODE` unless the shell already sets it, and the launcher `plugins/aether/launcher/aether-lead` reads it, with `bypassPermissions` as the fallback. Without `--dir` the stub goes in `~/.local/bin` when that is on the `PATH`; else next to `claude` when that is inside `$HOME` and writable; else in `~/.local/bin` with the line that puts it on the `PATH`. A stub written by an earlier version is still recognized as Aether's own.
- **`aether-doctor`** prints `{ ok, version, installed, harnesses, options, command, checks }`; `harnesses` gives the names the option takes (`cursor`, not its CLI `cursor-agent`), read from the one list of `lib/harness/index.js`, so a new harness adds no list here. Its checks are pure functions in `lib/doctor.js` over what they are given (environment, command runner, filesystem), so they can be tested without network or model. Dynamic workflows are read from the settings files: off (`error`) when `CLAUDE_CODE_DISABLE_WORKFLOWS` or a settings file turns them off, which wins; on (`ok`) when `enableWorkflows` is true; otherwise `info`, since the plan decides. **`/aether:doctor`** shows the fixed report and changes nothing.
- **`/aether:help`** (the skill `help`) keeps its map in the skill itself, because the installed plugin does not ship `docs/` (decision D6). **The welcome line** is the `systemMessage` of the SessionStart hook, at `startup` and only in a Lead session.
- **The guides.** Eight in `docs/tutorials/` and the same eight in `docs/es/guias/`, plus `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md` and `docs/es/index.md`. The Quick start links the install guide in both languages.

## 3. How it was checked

- **By hand, on this container.** T1: a plugin skill passed as the prompt runs (`claude -p "/demo:hello"`, Claude Code 2.1.316). In interactive mode the folder-trust question stops it, and the container cannot answer it, so `claude "/aether:setup"` was tested only with `-p`. T2: `claude plugin configure --values-stdin` takes a JSON object of strings, keeps the other options and refuses a value that is not a string; the Lead tried it on a throwaway configuration.
- **`npm run check` passes:** 2,612 tests and 4 skipped, the mod's tests, and `claude plugin validate --strict` on the plugin and on the marketplace. Its one warning, that the plugin has no icon, is older than this release. The Lead ran `npm test` and fixed the ten structural failures itself (T18): `doctor.js` declared as a loose module, its two home helpers taken from `first-setup.js`, its list of harnesses taken from `lib/harness/index.js`, `AETHER_PERMISSION_MODE` scrubbed by `tests/helpers.js`, and the pins of the version and of the thirteen bins.
- **The clean install (T19)** in a throwaway `CLAUDE_CONFIG_DIR` and `HOME`: see section 6.

## 4. The subagents

The owner's rule: subagents run on Sonnet or Haiku only, each with its model named in the call and never `fork`, which takes the model of the session (C7).

| Who | Tasks |
|---|---|
| Lead | T3 the spec, plan and tasks; T6 the `setup` skill; T10 the README and its test; T18 the run of the tests and their fixes; T20 the review, the version, decision A103 and the commits |
| Sonnet | T2; T4 `aether-doctor` and `/aether:doctor`; T5 `aether-first-setup` and the launcher; T8 `/aether:help`; T9 the welcome line; T11 `getting-started`; T12 and T13 the eight guides in both languages; T14 the two «what Aether adds» pages and the Spanish index; T15 the site; T19 the clean install |
| Haiku | T1; T16 the index, the docs-facts list, the components rows and troubleshooting; T17 the draft of the changelog, the roadmap and this handoff |

No subagent of the release ran on Opus. Before the owner's rule, while the release was being proposed, three research subagents (oh-my-claudecode, everything-claude-code and the launch options of Claude Code) ran on the session's own model. The subagents did not commit; the Lead reviewed what they returned and made the commits.

## 5. What is open

- **For the owner (T21):** the four steps in an interactive session on their own machine: the line; the answers to `/aether:setup`; closing the terminal; `aeth` in a new terminal in a project; one request to the Lead; `/aether:doctor` in that session; the welcome line; and the permission mode chosen. The container could not answer the folder-trust prompt, so the interactive run is the owner's.
- **Then the owner's word:** merge `ccr-763bff04-p62mfq` to `main` (a squash, as in 0.28.0 and 0.29.0); tag with `claude plugin tag plugins/aether` on `main`; then `claude plugin update aether@aether-plugin`.
- **Proposals (spec 024, «Propuestas»), not built:** (1) a notice of a new version at the start of a Lead session, once a day, with a bounded `git ls-remote` and an option to turn it off; it needs the network, so it is not in 0.30.0. (2) `effort: xhigh` in the front matter of `aether:lead`, so that `claude --agent aether:lead` needs no `--effort`. (3) An icon for the plugin, the one warning of `claude plugin validate`.

## 6. The clean install (T19)

All eight steps passed on Sonnet, with no model call and nothing written outside a scratch directory, with `CLAUDE_CONFIG_DIR` and `HOME` pointing at empty folders:
1. `claude plugin install aether --marketplace <the clone>` installs 0.30.0, enabled, with the notice that 8 options are not yet set.
2. The installed `aether-doctor` reports 0.30.0, the `aether` check ok and the command not installed yet.
3. `aether-first-setup` with no `--dir`, `~/.local/bin` off the `PATH` and `claude` outside the home, chooses `~/.local/bin` and gives the `shellHint`, `autonomous` and `bypassPermissions`; `--permissions ask` replaces its own stub with `manual`; `--permissions nope` exits 2.
4. With `~/.local/bin` on the `PATH`, the `command` check is ok.
5. `aeth --resume` with a fake `claude` first on the `PATH` runs the installed launcher, which passes `--agent aether:lead --effort xhigh --permission-mode manual --settings … --resume` with `AETHER_IRREVERSIBLE=enforce`; a shell value of `AETHER_PERMISSION_MODE` wins; without it the launcher passes `bypassPermissions`.
6. `claude plugin configure --values-stdin` saves `superdelegation` and `harnesses` and keeps the other settings; `aether-doctor` then warns that the named harnesses are not installed; `{"superdelegation":"false"}` keeps `harnesses`; a value that is not a string exits 1.
7. `aether-session-start` gives the welcome line in Spanish with `LANG=es_MX.UTF-8` and in English with `en_US.UTF-8`, and nothing for a session that is not the Lead's.
8. No process was left running.

## 7. How to try the branch

`scripts/aether-lead --plugin-dir <worktree>/plugins/aether` loads the branch instead of the installed release, with the data directory `~/.claude/plugins/data/aether-inline/`. In a development tree the `aether-*` names on the `PATH` are the installed release's bins, so run the branch's bins by path: `node plugins/aether/bin/aether-doctor`, and `node plugins/aether/bin/aether-first-setup --check` to see what the stub would do without writing it.
