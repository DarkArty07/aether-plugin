---
title: Project files, skills, and continuity
description: The rule of AGENTS.md and CLAUDE.md, the map of .aether/, the four kinds of skills, session continuity, and project tidying
order: 19
---

# Project files, skills, and continuity

This guide covers the file organization and continuity model of Aether: how project instructions are structured, the layout of the local `.aether/` directory, how skills are categorized and assigned, how session continuity keeps track of your work, and how project clutter is tidied.

## The rule of the files

Aether organizes project instructions into three distinct tiers so every coding harness and agent finds what it needs without context bloat:

1. `AGENTS.md` is the map that any agent reads when entering the project. It describes the project's purpose, architecture, working rules, and shared conventions across coding harnesses, delegates, and swarm units.
2. `CLAUDE.md` is the `@AGENTS.md` line plus instructions that are only Claude-specific (only claude). Any general rule belongs in `AGENTS.md` so external harnesses and other agents see it too; only tool-specific or Claude Code-specific directives belong in `CLAUDE.md`. When `CLAUDE.md` contains only `@AGENTS.md`, external harnesses receive `AGENTS.md` directly.
3. Path-specific rules live in `.claude/rules/`. These modular rules are loaded by Claude Code only when interacting with matching file paths, keeping instructions targeted and avoiding bloated system prompts.

Both `CLAUDE.md` and `AGENTS.md` observe a guideline limit of 200 lines. If either file exceeds 200 lines, the Lead's post-edit hook issues an advisory notification. This limit only warns and never blocks your work.

## The map of .aether/

All local runtime state, temporary briefs, and unit worktrees live inside the `.aether/` directory at the project root. This directory is entirely ignored by version control and never committed to git.

The state directory follows a documented layout maintained by `plugins/aether/lib/tree-map.js`. Every project where Aether runs includes a `.aether/README.md` file describing this structure:

| Path | What it holds | Writer | Duration | In Git |
|---|---|---|---|---|
| `README.md` | Map of the .aether state directory layout and policies | aether-session-start | permanent | never |
| `autonomy/` | Autonomy grants, runs, ceilings and diaries | aether-autonomy | permanent | never |
| `broken-runs/` | Quarantined state of corrupted or interrupted runs | aether-plan | until cleaned | never |
| `pending.jsonl` | Log of irreversible commands pending owner grant | aether-guard | permanent | never |
| `runs/` | State directories for active and completed runs | aether-plan | until cleaned | never |
| `worktrees/` | Unit worktrees for run tasks (<run>/<task>) | aether-wt | until the run ends | never |
| `worktrees/lanes/` | Disposable worktrees for read-only lane calls (<run>/<call>) | aether-lane | until the call ends | never |
| `worktrees/exams/` | Disposable worktrees where acceptance exams run (<feature>-<id>) | aether-exam | until the exam ends | never |
| `work/seats/` | Work and worktrees for design seat rounds (<id>/) | aether-lane | 7 days | never |
| `work/delegates/` | Work and worktrees for external harness delegates (<id>/) | aether-delegate | 7 days | never |
| `tmp/` | Temporary task briefs, packages and seat messages | aether-plan, aether-wt, aether-lane | 24 hours | never |
| `exam/` | Hidden acceptance exam while written by Examiner | Examiner | until the run ends | never |
| `lanes/` | Legacy read-only lane worktrees (migrated to worktrees/lanes/) | legacy | migrated on startup | never |
| `exams/` | Legacy exam worktrees (migrated to worktrees/exams/) | legacy | migrated on startup | never |
| `seats/` | Legacy design seat work (migrated to work/seats/) | legacy | migrated on startup | never |
| `delegates/` | Legacy delegate work (migrated to work/delegates/) | legacy | migrated on startup | never |

### Startup cleanup and migration

At session startup, Aether runs an automated cleanup:
- Ephemeral task briefs and messages in `tmp/` are purged after 24 hours.
- Completed design seat work in `work/seats/` and delegate runs in `work/delegates/` are retained for 7 days before removal.
- Stale continuity notes older than 30 days are pruned.

If an older installation layout is detected (such as legacy `lanes/`, `exams/`, `seats/`, or `delegates/` folders), Aether migrates them to their new locations during startup without deleting anything. Migration is deferred if an active session or recent disk write is detected, ensuring uncommitted work in progress is never lost.

## The four kinds of skills

Skills provide reusable domain knowledge, workflows, and tools for agents. In Aether, skills fall into four distinct categories:

1. **Plugin canonical skills:** Built into Aether (such as `aether:art-direction`, `aether:tidy`, and `aether:skills`). These are read-only and cannot be edited.
2. **Owner permanent skills:** Installed globally in `~/.agents/skills/`. Available across all projects on your machine.
3. **Project skills:** Stored in `.agents/skills/` inside the repository. Tracked in git and shared with your team. The Lead can create and edit project skills autonomously.
4. **Downloaded skills:** Fetched from public registries like skills.sh using `npx skills add`. These reside in `.agents/skills/` and are tracked in `skills-lock.json`. Downloaded skills are read-only to preserve package integrity. To modify a downloaded skill or a plugin skill, copy it to a new directory under `.agents/skills/` and edit the copy.

To ensure compatibility with Claude Code, `.claude/skills/` contains a symlink to each skill in `.agents/skills/` (or a directory copy if symlinks are unsupported).

### Downloading and trusted authors

Skills from internet registries are installed using `npx skills add`. To protect your environment against supply chain risks:
- The trusted authors registry starts empty.
- Until you add trusted authors using `aether-autonomy trust`, every skill download is classified as an irreversible action under the `skill-install` class.
- When `skill-install` is triggered, the action is logged to `pending.jsonl` and pauses until you explicitly approve it with your own words.
- Installing skills globally with `-g` or from arbitrary URLs always requires explicit owner confirmation, regardless of author trust.

### Assigning skills to tasks

The Lead can equip agents and external harness delegates with up to 3 relevant skills per task:
- In `tasks.md`, specify skills using the `Skills:` field (e.g., `Skills: erebus-ui, patron-api`).
- When compiling briefs or delegating tasks, the `AETHER-SKILLS:` line is injected, and the full content of each skill is embedded directly into the brief so any harness has access.

## Continuity

Aether provides seamless session continuity across restarts, compactions, and unexpected terminal closures.

### Session notes and privacy

During an active Lead session, every turn, context compaction, and session termination writes a session note to `memory/continuity/` inside the project's Claude memory directory.
- What it stores: the Lead's most recent response, the latest compaction summary, the current git branch and commit hash, session and process IDs, startup timestamp, and termination or interruption reasons.
- Privacy: conversation snippets and working notes remain exclusively on your local machine in `memory/continuity/`. They are never transmitted over the network or uploaded to external registries.

### Startup status notice

When starting a new Lead session, Aether reads the most recent session note and prints a concise 3-to-5-line status notice:
- Where work left off in the previous session.
- Git changes and commits made since the last note.
- Any branches with unmerged work or incomplete delegate tasks.
- If the previous session closed unexpectedly due to a terminal crash, the notice reports the interruption and provides the exact command to resume:
  `claude --resume <id>`

### 30-day pruning

Session notes do not accumulate indefinitely. On each startup, notes older than 30 days and notes corresponding to git branches that have already been merged into the default branch are automatically deleted, while always preserving the project's latest note.

## Tidying with /aether:tidy

Over time, projects accumulate stale configuration files, duplicated skills, and disorganized root directories. The `/aether:tidy` skill audits and cleans up this clutter safely.

When invoked, `/aether:tidy`:
- Identifies `CLAUDE.md` files that fail to import `AGENTS.md` or exceed 200 lines.
- Detects legacy files in `.aether/` and duplicated skills between `.agents/skills/` and global folders.
- In inspection mode, produces a clear read-only report detailing proposed changes without touching any files.
- Modifying or removing tracked project files requires owner approval under the `delete` irreversible action class, ensuring no work is removed without explicit consent.

## Related pages

- [Autonomy](autonomy.md): owner grants, ceilings, and irreversible action classes.
- [Components](../reference/components.md): full reference of agents, skills, hooks, and workflows.
- [Versión en español](../es/guias/archivos-skills-y-continuidad.md): esta misma guía traducida al español.
