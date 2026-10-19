# Handoff: the /harnesses panel, released as 0.12.3

- **Date:** 2026-10-17. It follows [the 0.12.2 handoff](2026-10-16-router-second-round-0.12.2.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, after the owner asked for a way to see, inside Claude Code, the delegation settings and the quota of each harness, «como un panel de información», and said «lo vamos a llevar en un fix, no lo vamos a llevar en una minor».
- **To:** the next session.
- **Repository state:** the work is on the branch `feat/harness-panel`, from `main` at 55baf05 (0.12.2), in the worktree `.worktrees/harness-panel` of the repository (local, not in git). Until the pull request is merged and the tag is made, `main` and the installed plugin are 0.12.2 (§5).

## 1. What was done

- **The `/harnesses` panel** ([guide](../guide/lanes.md#the-harnesses-panel), [A57 and A58](../decisions.md)). A slash command of the Aether mod (`plugins/aether/hooks/panel.jsx`, with `panel-view.mjs`) that opens a pane inside Claude Code with the options line (`lanes`, `router`, `decider`, `seats` and `harnesses`, as the session really uses them), each harness's version and quota groups, and the five newest delegations of the router log. It prints nothing to the transcript, calls no model and works while the Lead is mid-turn; `Esc` or `x` closes it and `r` renews the readings. It is read-only and has no toggle button.
- **Only in an Aether session.** In any other session the command is not declared and nothing of it runs; the dormant footprint is unchanged, and nothing new happens at session start ([components](../reference/components.md#what-aether-adds-to-a-normal-session)). It uses Claude Code's plugin UI API for mods, which is early access. It was checked on Claude Code 2.1.302.
- **It fits its room.** From 110 columns in the fullscreen layout it docks to the right of the transcript; below that it sits above the prompt. When the full layout does not fit, it drops detail in steps and always keeps the title, the options line, the buttons and one line per enabled harness group.
- **Its data is the existing bins:** `aether-lane quota --json <harness>`, once per harness and in parallel, and `aether-report --delegates --since <7 days>`. `r` reads with `--refresh`, and a Grok reading older than 30 minutes is renewed once by itself.
- **Selectors.** `router`, `decider` and `seats` declare their values in `plugin.json`, so `/plugin configure aether@aether-plugin` and `/config` show them as selectors. The defaults do not change.
- **A patch on purpose,** by the owner's word (A57).

## 2. How it was verified

- **Real Claude Code sessions** (tmux, 2.1.302), at 60, 80 and 150 columns and in a 22-row terminal; with no harness installed; with a broken lanes config; with repeated keys; after `/clear`; and in a session without Aether, where the command is not offered. The captures of those sessions were not kept in the repository, and no separate evidence page was written.
- **`npm run check`:** the tests, the mod's tests through `claude plugin test`, and `claude plugin validate --strict` on the plugin and the marketplace.

## 3. Found, not changed

- **A dry mark is by group and a refusal was by model.** A quota refusal of one model, Gemini 4 Argon (the design-seat Judge: «Individual quota reached… Resets in 163h»), leaves a dry mark on the whole Gemini group of agy until that reset, 22 October 23:46 UTC in the owner's data. That mark also keeps `gemini-3.8-flash` out, though Flash answered real calls the same day. The panel shows the mark as `dry until`. No issue file is written for it yet: the next session should write it (the next number in `docs/issues/`) and decide whether a refusal that names a model should mark only that model.
- **The panel's API is early access.** If a Claude Code release changes it, the panel stops drawing and nothing else of Aether is affected; the fix would be in `hooks/panel.jsx`.

## 4. What is left, and what waits for the owner

- **Not measured:** the panel on a terminal with Codex or Cursor installed (the real sessions had agy and Grok at most), and on a Claude Code release other than 2.1.302.
- **The owner's decisions of the 0.12.2 handoff** ([§4](2026-10-16-router-second-round-0.12.2.md)) are as they were.

## 5. How to run things

- **Release steps, for the Lead (none has been run):** merge `feat/harness-panel` through its pull request; on `main`, check that the version is 0.12.3 in the four places (`plugin.json`, the pin in `tests/launcher.test.js`, the README's `Version` line and the changelog's first `Version` line); run `npm run check`; tag with `claude plugin tag plugins/aether` (`aether--v0.12.3`); push the tag.
- **To move the installed plugin to 0.12.3,** run `claude plugin marketplace update aether-plugin`, then `claude plugin update aether@aether-plugin`, then start a new session with `aether-lead` and type `/harnesses`. To go back, install the tag `aether--v0.12.2`.
- **To try the branch without installing it:** `scripts/aether-lead --plugin-dir <worktree>/plugins/aether`, in the worktree `.worktrees/harness-panel`. The rest is as in [the previous handoff](2026-10-16-router-second-round-0.12.2.md) §5.
