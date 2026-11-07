---
title: Maintenance
description: Platforms Aether runs on, how to update, pin, roll back and uninstall it, where its data lives, and how to leave 0.6
order: 15
---

# Maintenance

This page covers what keeping an installed Aether running involves: where it runs, how its version moves, where it keeps its data, and how to leave 0.6. The options it mentions are in [Options](options.md#options), and the lanes in [Lanes](lanes.md#lanes).

## Keep Aether running

### Platforms

| Platform | Status | What degrades |
|---|---|---|
| Linux, WSL included | Supported, verified | Nothing. Lanes run when the option is on and a harness's CLI is installed |
| macOS | Supported by design: Aether needs only Node.js 22 and git. Not verified on a Mac | Lanes stay off: they read `/proc` |
| Windows, native | Not verified, not claimed. Hooks run through Git Bash | Lanes stay off |

### Update, pin, roll back and uninstall

- **Update:** `claude plugin update aether@aether-plugin`, then start a new session. To update on its own, turn on auto-update for the `aether-plugin` marketplace in `/plugin` → Marketplaces.
- **Pin a release, or roll back:** in `~/.claude/settings.json`, give the marketplace's source a `ref`, a release tag:

      "extraKnownMarketplaces": {
        "aether-plugin": { "source": { "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v0.7.0" } }
      }

  Edit that entry in place: after an install Claude Code adds `enabledPlugins` and the official marketplace to the same file, and replacing the file would drop them. Then start a session, which fetches that tag, and run `claude plugin update aether@aether-plugin`. Set the `ref` to a newer tag, or remove it, to move forward again.
  - **The session must have network traffic on.** In Aether's acceptance runs, a session started with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` did not fetch a changed `ref`, and the same session without that variable did at once. The variable is the probable cause; the runs did not isolate it. If the update does not move the plugin, start one session with the variable unset and run `claude plugin update` again.
- **Never remove the marketplace to change versions:** removing it uninstalls Aether and deletes its data.
- **Uninstall:** `claude plugin uninstall aether@aether-plugin` also deletes Aether's data directory. Add `--keep-data` to keep it. It leaves `aeth`, the command that `/aether:setup` wrote in a folder of your `PATH`; [Update and uninstall](../tutorials/update-and-uninstall.md) shows how to find it and remove it.

### Data

Aether keeps its data in `~/.claude/plugins/data/aether-aether-plugin/`. Set `AETHER_DATA_DIR` to use another directory. The default follows `CLAUDE_CONFIG_DIR` when that is set, and a session that loads the plugin with `--plugin-dir` uses `aether-inline` there instead. A run relaunched from the other install keeps its records in that install's directory, so the reports and `/spend` read both directories and count a record that is in both once. A writer, and the prune, touch only the directory of the install they run in.
- `usage/<session>/` holds the usage meter's files, kept for 30 days;
- `runs.jsonl` holds one record per finalized or abandoned run;
- the lane log is kept for 30 days;
- `spend/<id>.json`, in each install's data directory, holds a summary of that session's spend. The 30-day prune writes the summary before it deletes that session's usage files or lane log, and it does not delete the summary. What was archived is added to what the same id writes later if the session resumes;
- `delegates/` holds the delegate log, `delegates/log.jsonl`, and the files of each launch (briefs, results, patches, answers). The log is shared by every session and kept for 30 days of inactivity per session: before a session's lines are pruned, its `outcome` lines are archived in `spend/<id>.outcomes.jsonl`, and launch files older than 30 days are deleted too. `aether-report --spend` and `/spend` read `usage/`, `lanes/`, this delegate log and `spend/<id>.outcomes.jsonl` in every install's directory (`plugins/aether/lib/spend.js`); they do not read an older router journal. See [Delegates](delegates.md#the-log);
- `sessions/` marks the Aether sessions, kept for 30 days;
- `exams/` holds the Examiner's hidden exams, one folder per repository and feature, so uninstalling without `--keep-data` deletes them;
- `lanes/` also holds the dry marks (`lanes/marks/`) and the kept quota readings (`lanes/quota/`);
- continuity notes live in the project's Claude memory directory under `memory/continuity/` (one JSON file per session, recording the last assistant message, branch, commit, compaction summary, cuts and closures). Old notes not touched for 30 days and notes belonging to branches already merged into the main branch are pruned automatically on SessionStart; they are never kept in `MEMORY.md`.

A swarm run's final review is `deferred` until it runs. It runs when a launch ends with every unit of that launch merged, once, on the whole change. [The final review has not run](troubleshooting.md#the-final-review-has-not-run) says how that looks and how the review is run on what is already merged.

Project state lives in the repository itself under `.aether/` in its main checkout:
- `.aether/README.md` documents the `.aether/` directory layout and retention policies; `aether-session-start` writes and maintains it;
- `autonomy/`: the autonomy registry (`grants.json`) and run states (`run.json`, `diary.md`, `brief.md`);
- `pending.jsonl`: the owner's list of irreversible commands waiting for authorization;
- `runs/`: state directories for active and completed runs;
- `broken-runs/`: quarantined corrupted or interrupted runs;
- `worktrees/`: unit worktrees (`worktrees/<run>/<task>`), lane worktrees (`worktrees/lanes/`), and exam worktrees (`worktrees/exams/`);
- `work/`: design seat rounds (`work/seats/`) and harness delegates (`work/delegates/`), kept for 7 days;
- `tmp/`: temporary briefs, packages and seat messages, kept for 24 hours;
- `exam/`: hidden acceptance exam while drafted by the Examiner.

Per-project cleaning and migration:
- **Per-project cleaning:** SessionStart cleans temporary and stale project items every 10 minutes, tracked by a timestamp stamp in the data directory (`clean` stamp). It removes temporary files in `.aether/tmp/` older than 24 hours and finished seats/delegates in `.aether/work/` older than 7 days, never touching uncommitted work or registered worktrees.
- **Migration:** Legacy folders from earlier releases (`.aether-tmp`, `.aether-exam`, and old `.aether/` folders like `.aether/lanes`, `.aether/exams`, `.aether/seats`, `.aether/delegates`) migrate automatically into `.aether/tmp/`, `.aether/exam/`, `.aether/worktrees/`, and `.aether/work/`. Migration is deferred when a live session is detected, when old-style session marks exist, or when any write occurred under the roots in the last 2 hours (`recent-writes`).

### Upgrading from 0.6

Version 0.6 ran from `aether-mode`, a fish function that loaded a copy installed by `scripts/aether-install.js` under `~/.local/share/aether-plugin/installed/`. Both are gone from the repository, and your installed 0.6 copy keeps working until you remove it.

- **Installing from your clone's path works, but is not a release:** `claude plugin marketplace add <clone>` loads the working tree in place. Every edit or branch switch changes Aether at the next session, and a path cannot be pinned to a tag.
- **A pinned copy from your clone, with no push:** once the release is merged and tagged locally (`claude plugin tag plugins/aether`), add to `~/.claude/settings.json`:

      "extraKnownMarketplaces": {
        "aether-plugin": {
          "source": { "source": "git", "url": "file:///path/to/aether-plugin", "ref": "aether--v0.7.0" }
        }
      }

  Start a `claude` session with network traffic on (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` unset), which clones it, then run:

      claude plugin install aether@aether-plugin --config lanes=true

  Move between releases by changing `ref`, as in [Update, pin, roll back and uninstall](#update-pin-roll-back-and-uninstall). Once the repository is pushed, the source may become `{ "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v<version>" }`.
- **Meanwhile `aether-mode` keeps loading 0.6:** it passes `--plugin-dir`, which replaces the installed plugin for that session.
- **Your history stays in `~/.local/share/aether-plugin/`:** `runs.jsonl`, `usage/` and the lane log. Move them into `~/.claude/plugins/data/aether-aether-plugin/` to keep one history.
- **Removing the old copy is your call:** delete `~/.config/fish/functions/aether-mode.fish` and `~/.local/share/aether-plugin/installed/` when you no longer need them.
- **The advisor:** `aether-mode` turned it off for Aether sessions. If you configured an advisor, run `/advisor off`.
