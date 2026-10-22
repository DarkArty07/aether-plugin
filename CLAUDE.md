# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

The development repository of **Aether**, a Claude Code plugin that adds an opt-in "Aether mode": a Lead agent turns the owner's intent into a reviewed spec and plan, builds it itself, through delegate tasks or with a parallel swarm, and reports in one brief. The plugin is `plugins/aether/`; the root holds the marketplace (`.claude-plugin/marketplace.json`), the tests, `scripts/`, `docs/` and `specs/`. Node.js 22, CommonJS, **no dependencies**: the root `package.json` is private and only has scripts.

## Commands

```
npm test                                   # node --test "tests/*.test.js": bins, libs, workflow scenarios, docs facts
node --test tests/guard.test.js            # one file
node --test --test-name-pattern="R10" tests/docs-facts.test.js   # one test, by name
npm run test:mod                           # claude plugin test plugins/aether (the mod: hooks/*.test.ts)
npm run validate                           # claude plugin validate on the plugin and on the marketplace, --strict
npm run check                              # all three; run before a PR or a release
```

- **Try a branch:** `scripts/aether-lead --plugin-dir <worktree>/plugins/aether` (same as `claude --plugin-dir … --agent aether:lead --effort xhigh`). It loads the tree instead of the installed release and uses the data directory `~/.claude/plugins/data/aether-inline/`.
- **Run a branch's bin by path:** `node plugins/aether/bin/aether-plan check <plan.md>`. In a development tree the `aether-*` names on `PATH` are the *installed release's* bins (issue [#13](https://github.com/DarkArty07/aether-plugin/issues/13)).
- `node scripts/refresh-lanes.js [--write]` refreshes the lane table (needs `ARTIFICIAL_ANALYSIS_API_KEY`); `node scripts/build-models-index.js` rebuilds the models index; `node scripts/lane-smoke.js <harness>` makes one real, quota-spending call: run it on purpose.
- **Release** (full steps in `docs/contributing.md`): the version lives in four places, `plugin.json`, the pin in `tests/launcher.test.js`, the README's `Version X.Y.Z` line and the changelog's first `Version X.Y.Z:` line; tag with `claude plugin tag plugins/aether` (`aether--v<version>`) on `main`.

## Architecture

Read across files; none of this is in one place.

- **Entry and dormancy.** `hooks/hooks.json` runs `bin/aether-session-start` on SessionStart and `bin/aether-guard` before Write/Edit/Bash. Both act only in a session whose agent is `aether:lead` (or one marked in the data dir) and do nothing in a plain session; that dormant footprint is a design invariant, measured in `docs/reference/components.md`. The Lead's rules are the `skills/using-aether` skill, injected as the bootstrap.
- **Bins are thin, `lib/` holds the logic.** Each `bin/aether-*` parses arguments and calls `lib/*.js` by path. `aether-plan` checks and compiles a Spec Kit `tasks.md` into briefs and waves; `aether-wt` manages unit worktrees and one-at-a-time merges; `aether-lane` makes calls on other harnesses and runs design seats (adapters in `lib/harness/`: agy, codex, grok, cursor, muse); `aether-exam` keeps and runs the hidden acceptance exam; `aether-autonomy` holds the owner's grants and a run's ceilings; `aether-report` prices a run from `config/prices.json`.
- **Workflows.** `workflows/design.workflow.js` (`/aether:design`) and `workflows/run.workflow.js` (`/aether:run`) are scripts for Claude Code's Workflow tool. They call the agents in `agents/*.md` (lead, writer, judge, examiner, implementer, supervisor, reviewer, ops) and take their models and efforts from the plan's Tier, and, with `superdelegation` on, from the one choice function of `lib/superdelegation.js` (the swarm asks it through `aether-lane pick`, the design seats through `lib/seats.js`). Shell steps go to the `aether:ops` agent, which the mod answers itself without a model.
- **The mod.** `hooks/register.js` (with `ops-command.mjs`) records every model request of an Aether session for `aether-report` and runs the workflow's own `aether-wt` and `aether-lane` commands without a model call. It is TypeScript-tested through `claude plugin test`, not through `npm test`.
- **Config.** `plugin.json` `userConfig` (superdelegation, harnesses, ops, router, decider, fallback, deadlines; `lanes` and `seats` stay only as legacy keys) is the options table, and `docs/guide/options.md` must match it. `config/lanes.json`, `config/pairs.json` (the pairs of model and effort with their Artificial Analysis figures), `config/models/models.json`, `config/prices.json` and `config/autonomy.json` are data the libs read.
- **The website.** `site/` is the static landing page: vanilla HTML, CSS and JS with no build, in Spanish and English, opened from `file://` or served with `python3 -m http.server -d site`. `.github/workflows/pages.yml` deploys it to GitHub Pages on a push to `main` that touches it, and `tests/site.test.js` holds its references. The README's images are in `assets/readme/`.
- **Method and state.** Spec Kit's layout: each feature is `specs/NNN-<topic>/{intent,spec,plan,tasks}.md`, with `.specify/feature.json` pointing at the current one and the preset in `plugins/aether/speckit/` (also shipped as the `aether:specify`, `plan`, `tasks` and `constitution` skills). Runs write local state to `.aether/` (git-ignored) and, for the installed plugin, to `~/.claude/plugins/data/aether-aether-plugin/` (`runs.jsonl`, exams, lane logs).

## Working rules

- **Docs are held to the tree by tests.** `tests/docs-facts.test.js` fails a README of more than 160 lines or with its parts out of order, a second `Version` line, a `Version` that differs from `plugin.json`, a relative link or anchor that does not resolve, an `` `aether-<name>` `` code span that is not a file of `plugins/aether/bin/`, a page without `title`, `description` and an integer `order` in its front matter, and a page that `docs/index.md` does not link. Read its header comment before editing prose; exceptions are listed there with a reason.
- **`aether-guard` shapes what an Aether session may write.** Specs, plans, tasks and the constitution are writable only by the Lead and the Writer, the autonomy registry and run states by no agent, and the Examiner writes only under `.aether-exam/`. An irreversible command (`push`, `merge-main`, `publish`, `deploy`, `delete`, `credentials`, `paid-call`) with no grant is recorded in `.aether/pending.jsonl`, and refused when `AETHER_IRREVERSIBLE=enforce`, which `scripts/aether-lead` sets by default.
- **Tests run on throwaway git repos** built by `tests/helpers.js` (`tempDir`, `makeRepo`), which also points `AETHER_LANES_CONFIG` at a missing file so no lane exists unless a test names a table. Workflows are exercised in a harness with stubbed agents and the fake model, so they spend no tokens.
- **Records.** Decisions are numbered in `docs/decisions.md` (A1 onward); bugs, observations and requests for improvement are **GitHub issues**, the only list (`gh issue list`): when you find one, file an issue with the evidence and work from it later, never as a file in the tree. Older docs say «issue 008» with three digits: those were files of a former `docs/issues/` and are now GitHub issues whose body begins «Formerly `docs/issues/NNN-…`»; session handoffs are `docs/handoff/`, and the newest one holds the current state.
- **Do not commit:** `.worktrees/` and `.claude/worktrees/` (worktrees), `.aether/`, and `plugins/aether/tsconfig.json` and `plugins/aether/.claude-plugin/types/`, which Claude Code generates when it loads the mod.
