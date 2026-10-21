# A delegate or a seat round that loses its pair mid-task is redone from scratch, not continued

**Type:** gap (delegates that edit; design seats; the owner's rule that quota running out must not lose the work)
**Date:** 2026-10-21
**Found in:** the owner's question during the build of spec 011: «es importante que cuando se acabe la cuota a la mitad de otra tarea otro harness si es que esta permitido o el fallback lo retome y no pierda el trabajo, tenemos algo asi implementando?»
**Status:** open
**GitHub:** none yet. This file is the local record.

## What exists (0.15.0)

- **A swarm unit** whose lane call fails or ends for quota after it started: the next pair that reaches the points takes it (up to three pairs, [A71](../decisions.md)), then the native agent. The unit's worktree keeps the partial work uncommitted, and the next agent's prompt says «its uncommitted work, if any, is in the worktree. Continue from it». This is continuation. Tested with stubs; not yet seen live.
- **A delegate that edits** (`aether-lane delegate`, [A72](../decisions.md)): the next pair that reaches the points takes the task and the failed attempt's work is saved as a patch (`runs/<id>/patches/task-1-attempt-<n>.patch`). The next pair gets a clean worktree and the original brief, **not the patch**: it redoes the task from the start. The work is kept, not reused.
- **A design seat round** that fails: the next pair redoes the round from the same message ([A70](../decisions.md)); an external seat works in a transactional worktree that is undone on failure, so nothing partial is kept.
- **Claude's own quota** running out mid-task has no fallback: a native agent's partial work stays in its worktree, and spec 011 (the 5-hour brake, in build) stops the run before the window ends and saves each unit's work on its branch.

## The gap

A delegate or a seat round that loses its pair at minute 15 of 20 costs the next pair the whole 20 minutes again. The work is not lost, but it is not used. The measured times (issue 043: Writer rounds of 8 to 29 minutes; a Flash implementer took 6.6 minutes for a one-function change) make this expensive.

## Ideas

For a delegate: apply the saved patch of the failed attempt to the next pair's worktree and add to its prompt the line the swarm already uses («an earlier agent began this task; its work is in the worktree; continue from it»), as the swarm does for its units, with a guard that the patch applies cleanly and stays within the paths the charge owns. For a seat round: keep the partial document the Writer had committed in its disposable worktree and hand it to the next Writer. Both are small once 011's `save` exists; both need a test with a pair that dies after it has written a file.

## Impact

Time and quota of the next pair on every mid-task failure; the owner's rule is that a harness running out must not stop or repeat the work.
