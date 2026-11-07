---
name: tidy
description: Tidy a project or folder by reporting what to move or delete, and changing nothing without the owner's yes.
argument-hint: "[project or folder]"
disable-model-invocation: true
---

# Tidy

The person called `/aether:tidy [project or folder]`, or the Lead offered it when startup notices flagged project disorder. You inspect project files and skills layout, report what should be moved or deleted, ask the owner's approval, and apply only the list the owner confirms. You change nothing without the owner's yes.

## 1. Run the Inspection

Run `aether-doctor tidy` on the target path:
- For a single project:
  ```bash
  aether-doctor tidy [project]
  ```
- For a folder containing multiple projects (for example, the owner's projects directory):
  ```bash
  aether-doctor tidy --projects <folder>
  ```
  Running with `--projects` inspects every project in that folder and finds duplicate skills across projects (by identical name or content hash).

## 2. Present the Report

Display the list of proposed changes per project to the owner, explaining the rules behind each recommendation:

- **Project instructions:** `AGENTS.md` is the map read by all agents. `CLAUDE.md` must be `@AGENTS.md` plus Claude-only instructions. If `CLAUDE.md` does not import `@AGENTS.md`, or if either file exceeds the size limit, report the edit needed to keep `AGENTS.md` a clean map.
- **Project state:** `.aether/README.md` is the map of `.aether/`. It specifies what each file and folder is, who writes it, and its retention. Do not move `.aether/` itself; migration of legacy `.aether` layouts is performed by session startup.
- **Old CLI leftovers:** Leftovers of the old Aether CLI (such as `aether.db`, `project.toml`, `CONTEXT.md`, drafts, locks, and `objective-contracts`) should be deleted, but never touch leftovers of the old Aether CLI without the owner's yes.
- **The four types of skills:**
  1. *Aether built-in skills:* shipped with the plugin; never edited in place.
  2. *Permanent skills:* in `~/.agents/skills/`.
  3. *Project skills:* in `.agents/skills/`, tracked in git, with `.claude/skills/` symlinking to them.
  4. *Downloaded skills:* listed in `skills-lock.json`.
  Report any duplicate skill directories (same name or same hash within the project or across projects) so duplicate copies can be removed.

## 3. Ask for Approval

Present the concrete list of actions (files to delete or move) and ask the owner for their explicit consent:
- Never execute changes without the owner's approval.
- The owner may approve all proposed actions or select only a subset.

When the owner approves in their own words (e.g. "approve deleting and moving these tidy files"), record the permission:
```bash
aether-autonomy grant --class delete "<owner's exact words>"
```
Aether's guard enforces this: the guard intercepts and stops any deletion or movement of these files without a grant.

## 4. Apply Only the Approved List

Apply only the list approved by the owner:
- For tracked files in git repositories, use `git mv` and `git rm`.
- For untracked files or directories outside git, use `mv` and `rm`.
- Do not touch or modify any file outside the approved list.
- Do not touch leftovers of the old Aether CLI without that yes.
- Do not move `.aether/`.

## 5. Report Changes

Finish by reporting a clear summary of what changed: which files were moved, which files were deleted, and any remaining warnings or manual steps.
