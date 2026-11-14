---
name: skills
description: "Use when searching, finding, downloading, reviewing, creating, or maintaining skills, or assigning skills to delegate tasks and swarm units in a plan."
---

## User Input

```text
$ARGUMENTS
```

## Overview

Skills provide targeted domain knowledge, procedures, and rules for agents. Only the Lead finds, downloads, or creates skills.

## The Four Types of Skills

Every skill belongs to one of four types, each with its designated location and editing policy:

1. **Aether skills:** Canonical skills provided by the Aether plugin (such as `aether:plan` or `aether:skills`). These are built-in and read-only. Never edit an aether skill in place; to adapt one, copy it with another name into a project or permanent directory.
2. **Permanent skills:** The owner's personal skills stored in `~/.agents/skills/`. They apply across all projects. Creating or editing permanent skills requires the owner's consent.
3. **Project skills:** Stored in `.agents/skills/` within the repository and tracked in git. The directory `.claude/skills/` acts as a symlink pointing to the real copy in `.agents/skills/`. The Lead creates and updates project skills autonomously.
4. **Downloaded skills:** Third-party skills installed into `.agents/skills/`. Never edit downloaded skills in place; to modify or customize them, copy it with another name.

## Finding and Downloading Skills

Search for a skill when the visible-signals notice fires (on the first Aether startup in a new project, or when writing `specs/NNN-<topic>/intent.md`) or whenever the Lead enters a new practical topic where step-by-step operational procedures matter (such as Machine Learning or Google Colab).

Skills are for practical processes and repeatable procedures. The API documentation of a library is looked up with Context7, not by installing a skill.

The Lead searches and installs external skills using the `skills.sh` ecosystem:
- Search for available skills: `npx skills find <query>`
- Download and install a skill: `npx skills add <source>`

### The Review Rule

Always read the whole skill before installing it. Inspect:
- Any scripts or executable code contained within the skill directory.
- The permissions and tools requested by the skill.
- Which agents will receive the skill and whether its instructions alter established constraints.

### Trust and the `skill-install` Class

Installing skills is governed by the `skill-install` irreversible autonomy class:
- The trusted authors list is stored at `<data dir>/skills/trusted.json`. It starts empty.
- To trust an author, the owner runs or authorizes:
  ```bash
  aether-autonomy trust --author <author> --quote "<their words>"
  ```
  Only `aether-autonomy trust` writes to `trusted.json`, verifying the owner's exact words.
- When downloading from an author in `trusted.json` into a project, `npx skills add` proceeds without interactive confirmation.
- Any installation using `-g` (global), or from an authorless source (a local directory path or an external URL), or when the author is not trusted, is classified as `skill-install` and requires the owner's explicit confirmation.
- Each project installation is tracked in `skills-lock.json`. Every skill invocation and usage is recorded in `<data dir>/skills/uses.jsonl`.

## When to Create a Skill

The Lead creates skills in three circumstances:
1. When an error repeats across multiple tasks.
2. When the project requires a custom method, framework pattern, or specialized workflow.
3. When the owner explicitly requests it.

If searching returns no suitable skill, or none passes review, the Lead writes the project skill in `.agents/skills/<name>/SKILL.md` (with its symlink in `.claude/skills/<name>`) with what it learned.

Scope determines where to create the skill:
- **Project level (`.agents/skills/`):** Created autonomously by the Lead without prompting the owner; reported in the run brief.
- **Permanent level (`~/.agents/skills/`):** Requires the owner's prior approval under `skill-install`.

If a skill proves ineffective or obsolete over time, the Lead proposes removing it.

## Limits and Assigning Skills to Tasks

Skills loaded into an agent context must stay focused:
- **Size limit:** Each `SKILL.md` must not exceed 500 lines.
- **Task limit:** Each task receives at most 3 skills, with a total combined size of at most 1,500 lines.

### In Plans (`tasks.md`)
In `tasks.md`, specify skills using the `Skills:` field in the task's Aether metadata block:
```markdown
**Aether:**
- Review: high
- Area: frontend
- Owns: src/components/**
- Skills: ui-patterns, design-tokens
- Depends on: none
- Serves: R1
```

### In Assignments
The Lead or workflow compiler renders the skills for the unit brief using the `AETHER-SKILLS:` line:
```text
AETHER-SKILLS: ui-patterns, design-tokens
```
The exact skill contents are appended to the assignment brief.

### Project-wide Role Skills in `AGENTS.md`

To assign a skill to every task of a given role across the project (R46):
- Add a short `## Skills` section to the project's `AGENTS.md`.
- In that section, list which skills each task class or role receives by default.
- The Lead reads this section when drafting task assignments and compiles them into the `Skills:` field and `AETHER-SKILLS:` line. No automatic hook injects them.
