# The ops commands of a branch run are Haiku calls, and a merge has ten minutes

**Type:** performance (workflows; the mod; `aether-wt merge`)
**Date:** 2026-10-21
**Found in:** the swarm runs of specs 010 and of the swarm fix, and the design run of spec 011
**Status:** open
**GitHub:** none yet. This file is the local record.

## What happened

- **Every command of a workflow is a Haiku call when the workflow is a branch's.** The mod runs an ops command without a model only when `binDir` is the bin of the plugin it loaded (`hooks/register.js`, `binDir !== ${$.plugin.root}/bin` returns null). Testing a branch from a session on the installed plugin therefore makes each `aether-wt`, `aether-lane` and `aether-plan` command a Haiku agent: 71 of 80 agents in the second launch of the 010 swarm, 11 of 12 and 17 of 19 in the two launches of the swarm fix, 42 of 49 so far in the 011 design. Each adds the latency of an agent turn, and on 2026-10-21 they also stopped the swarm when Claude's session limit ran out (the lanes had finished).
- **A merge has ten minutes.** `aether-wt merge` runs the plan's test command in the integration worktree, inside an ops command whose Bash timeout is 600,000 ms. The suite takes 47 seconds alone; with another swarm running the suite at once, the first merge of the swarm fix did not finish, the unit was `blocked` with «unreadable output ... The command did not finish within its 600000 ms timeout» and the Lead had to adopt it.

## Ideas

Open sessions that test a branch with `scripts/aether-lead --plugin-dir <worktree>/plugins/aether` (documented in the 0.15.0 handoff), so the mod answers; let the mod accept the `binDir` of a branch that the session was started with, or let the workflow run its commands with no agent; give a merge a timeout of its own or a way to continue past it; and do not run two swarms at once.

## Impact

Minutes per workflow, a Claude dependency in the middle of a run that should depend on none, and one unit lost to a timeout.
