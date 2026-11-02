---
name: onboard
description: Get oriented in a project at the start of a session: what it is, where the last work stopped and what is open. Read-only.
argument-hint: "[topic]"
disable-model-invocation: true
---

# Onboard

The person called this at the start of a session so that you understand the project before they ask for anything. You only read: you change nothing, start no work, ask nothing before the brief, and run no `git fetch` or `git pull`. You end with a short brief in the person's language.

If they named a topic after the command, as in `/aether:onboard router`, read the same things and go deeper only on what touches it.

**Read, in one parallel round.** Skip what does not exist, and never stop because something is missing.
1. **What the project is:** the README, `CLAUDE.md` or `AGENTS.md` (if they are already in your context, do not read them again), and the manifest (`package.json`, `pyproject.toml`) for the stack and the test command.
2. **Where the last work stopped:** `git status --short --branch`, `git log --oneline -15`, and the newest file of `docs/handoff/`, or the project's equivalent (a handoff, a changelog, a roadmap). Read that file whole: it is the only one that says why.
3. **What is open:** `git branch -vv`, `git worktree list`, `git stash list`, `gh pr list` when `gh` answers, the feature that `.specify/feature.json` points to (which of `intent.md`, `spec.md`, `plan.md` and `tasks.md` exist, and the tasks left unchecked), and, in a git repository, `aether-autonomy status`, which reads the main checkout's `.aether/` even from a linked worktree.
4. **What binds the work:** what `CLAUDE.md` and your memory require, above all where you may not write and what needs the person's yes.

**Check, do not trust.** A handoff is a snapshot and git is the present. Confirm that each branch, file, version or command you will mention exists. Where they disagree, say so and go by git. Before you say that something is missing, look in the other branches and worktrees.

**An open run may not be yours.** `aether-autonomy status` prints the run's `session` and `idleMinutes`. When the session is not this one's `$CLAUDE_CODE_SESSION_ID`, the run belongs either to an earlier session, which session start tells you to resume, or to another session still at work, and the id does not tell which. Report the run, its session and how long it has been idle; do not write its diary or continue it from here: the person decides.

**The brief,** 5 to 8 lines, in plain words, with no tables:
- what the project is, in one line;
- where it stopped: the last thing done, with its commit or handoff;
- what is open: branches, pull requests, runs, the feature under way;
- what is left undone, or waits for the person's decision;
- the likely next step, said as a guess;
- what you did not look at (no network, no handoff, a large repository).

Close by asking what they want to do.
