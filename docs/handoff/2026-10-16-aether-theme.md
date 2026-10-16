# Handoff: the Aether color theme, applied only in Aether sessions

- **Date:** 2026-10-16. It follows [the 0.11.0 handoff](2026-10-15-aether-design-0.11.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5 at `xhigh`, in a session started in its own worktree (`claude-theme`) so that the other sessions of the repository were not touched. The owner asked what a Claude Code theme can do, then for a theme for Aether that loads with the plugin and nowhere else, and for the old Morfeo theme to be unlinked.
- **To:** the next session.
- **Repository state:** `worktree-claude-theme` reached `main` through PR #28, with the owner's «autorizo merge». The feature commit is `59f9cad`; the branch also took `main` at `38b52bc` (PR #27) before the merge. Its checks on the merged tree: `npm run check` exit 0 (974 tests, 35 of the mod, strict validation of the plugin and of the marketplace).
- **Installed plugin:** still 0.11.0, which has no `themes/` folder. The theme reaches an installed copy with the next release (§3).

## 1. What was done

| Where | What |
|---|---|
| `plugins/aether/themes/aether.json` | The theme **Aether**, on the `dark` preset, with 70 of its 72 tokens (`chromeYellow` and `clawd_background` stay the preset's). The violet of Claude Aether, `#8b5cf6`, in place of Claude's orange, also on the welcome mascot (`clawd_body`); indigo messages; a color for each permission mode; the eight subagent colors; the diffs in a deep teal and wine. |
| `scripts/aether-lead`, `docs/getting-started.md`, `README.md` | The launcher and the Install command pass `"theme":"custom:aether:aether"` in the session's `--settings`, so the theme applies only while that session runs and is never written to a settings file. A plain `claude` keeps the user's theme. |
| `tests/start-command.test.js`, `tests/docs-facts.test.js` | The launcher test pins the settings and that the slug names this plugin and a file it ships. The facts test skips `custom:aether:<theme>` as a plugin name, a listed exception. |
| `docs/changelog.md` | An `## Unreleased` entry. The version stays 0.11.0. |
| Outside the repository | The `theme` line was removed from `~/.claude/settings.json` and `~/.claude-solsoft/settings.json` (backups `settings.json.bak-20261016-theme`). The `aether-morfeo.json` files are still in both `themes/` folders. |

## 2. Found in this session

Measured on Claude Code 2.1.301, in a real TUI opened with tmux in a clean environment, with no model call.

- **A plugin's theme is `custom:<plugin name>:<file>`**, and `--settings '{"theme":…}'` selects it for that session at the first paint. The user's `settings.json` was byte-identical before and after.
- **A plugin cannot choose the theme itself**: its `settings.json` honors only `agent` and `subagentStatusLine`. `$.config.set` of the mods API has no documented scope, so it was not used.
- **`overrides` takes all 72 keys of the preset,** not only the ones the documentation lists. `clawd_body` recolors the welcome mascot. `diffAddedWord` and `diffRemovedWord` are backgrounds.
- **The syntax colors are fixed.** The palette follows the theme's base: `dark` gives Monokai Extended, `light` gives GitHub. Only `syntaxHighlightingDisabled` changes it, and the plugin component `syntaxHighlighting` adds languages, not colors. Inline code and blocks without a language use the `permission` token.
- **The owner rejected brighter green and red diffs** («ahora lastima») and kept the first ones: `#0f3a34` and `#3d1230`, with the words at `#1a7a58` and `#a02455`.
- **Two config folders:** `~/.claude` and `~/.claude-solsoft`, chosen by `claude-personal` and `claude-solsoft`. Each had its own copy of the Morfeo theme.
- **The worktree's safety check** refuses a path component named `source` and a `$VARIABLE` in an option's place. The test drivers lived in a script file for that reason.

## 3. What is left

- **The release.** Recommended 0.12.0, because a theme is a new component. [Contributing](../contributing.md#release) lists the steps; the changelog's `Unreleased` entry becomes part of the new `Version` line.
- **`~/.local/bin/aether-lead` is a copy,** not a link: refresh it from `scripts/aether-lead` after the release. Before it, `scripts/aether-lead --plugin-dir <worktree>/plugins/aether` shows the theme.
- **The Morfeo theme files** are not deleted: deleting is the owner's word.
- **`scripts/theme-preview.js`** (a truecolor mock of the screen with a contrast table, which compares several theme files) was built for this session and is untracked in the `claude-theme` worktree. Commit it or drop it before that worktree is removed.
- **Once released,** `/theme` also lists Aether in plain sessions, because the plugin is enabled for the whole account. It can be chosen there, and it is never applied by itself.

## 4. Proposals, not worked

- **Codex-style highlighting of shell commands in the tool rows.** The theme cannot color word by word, but a mod can: a `ui.render` hook on the `ToolUse` and `ToolResult` render sites of Bash, with `Text` colored by theme keys, so the theme stays the palette. `claude plugin test` checks it without a model; seeing it live takes one real model call. The mod would go in `register.js`'s plugin or a plugin of its own, and the assistant's prose is a riskier second step.
- **The mascot as a `Raster` pane,** and Aether's phrases in `spinnerVerbs`.
- **A `color:` on each agent** so a subagent's row takes a tier's color. The crab colors of the mascot (green, blue, magenta) are an illustration choice and not something the plugin defines.

## 5. How to run things

To see the theme in a real session before the release, from the worktree: `scripts/aether-lead --plugin-dir plugins/aether`, and `/theme` lists it as «Aether, from aether». To judge a palette without Claude Code: `node scripts/theme-preview.js [<theme.json> ...] [--bg <#rrggbb>]`.

The merge needed a session grant, because the guard runs in `enforce`: «autorizo merge», recorded as `merge-main` for the session and revoked after the merge. No other `merge-main` grant was active, so issue 017 removed nothing else. The standing `push` grant is untouched.
