# Handoff: the plugin observes itself (spec 014)

- **Date:** 2026-10-23. It follows [the delegate ladder handoff](2026-10-22-delegate-ladder.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, session `d4a3d09c`.
- **To:** the next session, and the owner when the pause of a few weeks ends.
- **Repository state:** released as 0.20.0 on 2026-10-24, on the owner's word («Aorobado publicalo, a main, y actualiza mi plugin local. Borra lo que ya no se ocupe.»): `main` is at the release commit `1b3d024` (plus this note), pushed with the tag `aether--v0.20.0`, and the owner's installed plugin is updated (it takes effect when a session restarts). The branch `feat/self-observation` and its worktree were merged by fast-forward and deleted.

## 1. What was asked

Before a pause of a few weeks, the owner asked for an update that watches the plugin by itself: «hooks de automejora, pero no necesariamente automejora siginifca que cambie su propio codigo en ese instante, si no que el plugin identificque errores, y vaya recopilando informacion de uso», so that on return he knows where to begin, and that flags a role that has drifted. Because that could read conversations, a standard installation that never does, and a development one that may («dev version y una estadnar version, para no filtrar informacion de usuario»; «A: con dos metodos de instalacion»). Late in the session he added: the development installation should also detect his corrections to the Lead («Adelante implmentalo»).

## 2. What was built

[The intent card](../../specs/014-self-observation/intent.md), [the spec](../../specs/014-self-observation/spec.md), [the plan](../../specs/014-self-observation/plan.md) and [the tasks](../../specs/014-self-observation/tasks.md) hold the design. In short:

- `bin/aether-observe` (`hook`, `read`, `baseline`, `status`, `forget`) and five new hooks (`PostToolUse` of `ScheduleWakeup`, `PostToolUseFailure`, `StopFailure`, `PreCompact`, `SessionEnd`) that act only in a Lead session and keep identifiers, classes and counts. `SessionEnd` digests the session and runs the reading by itself.
- The 17 failures of the mod that were swallowed now leave a trace (`hooks/fault-trace.mjs`). One of them, the marker check, is the single exception to the meter's dormancy.
- Four detectors (a rise with no reason, a pair that keeps failing, a rule the Lead broke, a block the owner then allowed), five calibration signals that only propose, a durable summary that the 30-day prune keeps, and a baseline over the existing records. Thresholds are data in `config/observe.json`.
- The development installation (`AETHER_OBSERVE=dev` with `--plugin-dir`, from a clone) also keeps redacted fragments around failures and, at the end of a session, the owner's corrections found by a closed list of phrases (a word heuristic). `lib/observe-dev.js` is the only file that names a conversation.
- Guide: [Self-observation](../guide/observe.md).

## 3. How it was checked

- `npm run check`: 1938 tests, 106 of the mod, and the `--strict` validation of the plugin and the marketplace.
- The hidden exam: 18 of 18. It first failed 2: `forget` without `--yes` did not say what it would delete (fixed), and one exam test crashed on a clean file because it read `[0]` of a null match in its own failure message (the stored exam was corrected).
- The swarm: 13 tasks, 12 merged and 1 adopted by hand (task 4, see issue 92), climbed 2, final review `ready-with-fixes`; its two important findings (the durable summary losing counts across the prune cut, and the baseline joining outcomes to launches by a key the real log does not share) were fixed by two delegates and merged. The minor ones are [issue 93](https://github.com/DarkArty07/aether-plugin/issues/93).
- The baseline on the owner's real records (read only, written to the branch's data directory): Haiku launched 28 tasks and 15 were approved there; starting on Haiku saved about US$2.63 against US$0.02 spent on the redone steps (8 approved tasks have no outcome, so the figure covers a subset); **112 of 145 lane calls found no candidate pair**; 7 finalized runs cost US$6.14 to US$37.23 at list price (median US$19.52).

## 4. What is open

- **Nothing of this was seen in a real session.** The fields the hooks read (`is_interrupt`, `error`, `trigger`, `reason`), whether Claude Code honours `timeout: 30` of a plugin's SessionEnd hook (its default budget is 1500 ms, measured in the 2.1.309 binary), whether a resume keeps the session id, and whether the hooks of subagents carry the Lead's session id, are all unverified. It is the first thing to look at, in a session started as the development installation: `AETHER_OBSERVE=dev AETHER_DATA_DIR=~/.claude/plugins/data/aether-aether-plugin scripts/aether-lead --plugin-dir <clone>/plugins/aether`, and then `aether-observe status` and `aether-observe read`.
- **Issues filed from this session:** [90](https://github.com/DarkArty07/aether-plugin/issues/90) (`/aether:design` takes only a JSON object), [91](https://github.com/DarkArty07/aether-plugin/issues/91) (a design run ends in a dispute for one-line fixes), [92](https://github.com/DarkArty07/aether-plugin/issues/92) (a task's `Owns` omits a test its change breaks), [93](https://github.com/DarkArty07/aether-plugin/issues/93) (the minor findings of the final review), [94](https://github.com/DarkArty07/aether-plugin/issues/94) (a delegate's isolation worktree starts from `main`) and [95](https://github.com/DarkArty07/aether-plugin/issues/95) (the guard refuses a command for what a quoted body says).
- **Cleaned up on the owner's word** («Borra lo que ya no se ocupe»): the worktrees and branches of this feature and of the two delegates, the merged branches `feat/onboard-skill` and `fix/quick-issues` (their remote copies stay), the delegates' run folders under `.aether/`, and the temporary files of the session. Kept: `brand/clawd-aether-px` with its worktree (unpushed commits) and `brand/pixel-art-tool`.
- The defaults the build took, accepted with the approval to publish: that the development installation is a clone launched with `--plugin-dir` (a second plugin in the marketplace cannot be named `aether`); and that the readers that already exist (`aether-voice`, `aether-autonomy start --quote`, the delegate briefs, `pending.jsonl`) stay as they are in the standard installation. Still open: whether the reading should also run at session start if the SessionEnd hook turns out to be cut off.

## 5. Release (done)

Version 0.20.0 in the four places, the changelog entry, the roadmap's Now line and the decisions A88 to A91 (the two installations, the marker-check exception, the corrections detector, and "identifies and gathers, never changes the plugin by itself" with the baseline's join); `npm run check` (1938 tests, 106 of the mod, both validations); the fast-forward of `main`; the tag `aether--v0.20.0` with `claude plugin tag plugins/aether`; the push of `main` and the tag; and `claude plugin update aether@aether-plugin` (0.19.2 to 0.20.0). The Lead recorded session grants for `merge-main`, `push`, `publish` and `delete`, each in its own call, ran the actions in the next, and revoked them afterwards (the revoke takes a quote, so it used the same words).

## 6. What the next session has to watch

That the hooks really fire and write (`aether-observe status` after a session); that the first `read` is useful and not noise (a pair out of quota is still counted as failing, issue 93); that 112 of 145 lane calls with no candidate means the quotas were dry while the work was done, not a fault of the router; and that the delegate ladder's Haiku start keeps saving, which the baseline can answer again.
