---
title: Autonomy
description: How the Lead works as the owner's delegate, what it decides alone, what waits for the owner, and how an autonomous run is kept in check
order: 13
---

# Autonomy

Autonomy is how the Lead works for hours on the owner's permission, with standing authorizations for irreversible actions and a brief at the end.

## How the Lead works on its own

### Autonomy

The Lead decides as the owner's delegate, and the owner's reviews are two: the permission to work at the start, and the brief at the end. See the autonomy spec.

- **Deciding.** The Lead closes what the owner's intent covers, and rules on the Judge's findings within it. Only what the intent does not cover, what conflicts with it, and irreversible actions that no grant covers reach the owner, as one list at the top of the brief («Espera tu sí»). Failures with a defined fallback, such as a lane out of quota, never do.
- **Standing authorizations.** When the owner authorizes a class of irreversible action in general words, the Lead records it with `aether-autonomy grant`, quoting the owner. The quote is checked against the owner's own messages in the session's transcript, and checked again when read. The classes are `merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials` and `paid-call`. Everything local and reversible proceeds without asking.
- **Irreversible commands.** In an Aether session, aether-guard reads every Bash command, the agents' included. A push, a `gh pr merge`, a publish, a deploy, a forced delete or a credentials command that no grant covers is appended to `.aether/pending.jsonl`, the owner's list, with secrets in its arguments redacted. A local `git merge` is not recorded: git undoes it, and the push that would publish it is recorded. By default it only records them, while the guard is being proven; with `AETHER_IRREVERSIBLE=enforce` in the shell that starts Claude Code, it also refuses them.
- **Autonomous runs.** The owner's permission to work for hours starts a run (`aether-autonomy start`); the Lead loads the skill `autonomous-runs`, which holds the procedure, and session start names that skill when it finds a run open. The ceilings are 8 hours and US$ 50 unless the owner names others. The Lead keeps a diary, keeps working while work remains, stops when done, at a ceiling or honestly, and writes a brief: what it did, decided and found, what waits for the owner's yes, what it did not finish, proposals, and time and cost.
- **The quota brake.** The five-hour window of your Claude account is the one quota an autonomous run cannot replace. At the percent of the `quotabrake` option the plugin warns you; in an autonomous run the Lead also stops in order — nothing new starts, what is running is stopped and every swarm unit's work is committed on its own branch — and the run pauses rather than ends. When the window resets, the plugin wakes the Lead, which reads the diary and relaunches the same run from the saved branches, without repeating the units already merged. A closed session finds the paused run at its next start. The seven-day window at the same percent, and any Lead session with no run open, only warn. Only your own recorded words turn the brake off, for that run. The saved branches stay local unless `brakepush` is on and a recorded `push` permission covers the push (see [Options](options.md#options)).
- **Cost.** A run's ceiling figure covers the swarm and the lanes, as `aether-report` prices them, and does not add the Lead's own turns. The time ceiling is the real guard. Apart from the ceiling, `aether-report --spend` gives the list-price spend of the whole session: the Lead's turns, the agents', split by model, effort and role, plus the calls to other harnesses. That figure is not the ceiling. The closing report carries it, and [the /spend panel](lanes.md#the-spend-panel) shows it for this session.
- **Permissions.** A permission prompt stops a run like a question. Start a session meant for an autonomous run with a permission mode or allow rules that cover its tools. The plugin never turns permissions off; `scripts/aether-lead` starts the session with them bypassed, and with irreversible commands refused (see [Start](../getting-started.md#start)). The exception is the workflow's own `aether-wt` and `aether-lane` commands, which the mod runs without the session's permission rules (see [Ops without a model](ops.md)).
- **Files.** `.aether/autonomy/` in the repository's main checkout holds `grants.json`, and for each run `run.json`, `diary.md` and `brief.md`. Only `aether-autonomy` writes `grants.json` and `run.json`.
