# Design: a read-only delegate on another harness reads what the Lead could read (issues #198 and #185)

- **Feature:** `specs/033-open-issues-a`
- **Author:** the Lead (Fable 5.2), 2026-11-11.
- **Route:** short design. It sends uncommitted files of the owner's checkout to another provider's model, so it touches security, and it copies a tree the Lead may be editing, so it touches concurrency.
- **Scope:** read-only delegates of the Lead on agy, codex, grok and muse (`plugins/aether/lib/delegate-calls.js`). Editing delegates, swarm units and design seats are out: they build on a commit and are merged from it.

## The owner's words

Session of 2026-11-11, about issue #198, after the two options were explained (only count the refusals in the report, or make the copy carry the uncommitted changes):

«necesitamos que lean lo mismo que tu podrias leer porque si leen cosas que no estan al dia es un fallo grave de diseño. que sugeuires aqui para rediseñar esto»

The Lead proposed A (a faithful snapshot), B (what the snapshot cannot show stays on Claude) and C (run the harness on the real disk mounted read-only). The owner answered: «adelante esta bien eso, C suena mucha sobre ingenieria». So A and B are built and C is not.

## What happens today, read against 0.37.0 (`69d185a`)

- `runDelegate` in `lib/delegate-calls.js` runs the harness's CLI in a disposable worktree made of the `HEAD` of the Lead's current checkout (`git worktree add --detach <worktree> <HEAD>`), judges it from outside (`worktreeChanges(worktree, start)`: any change undoes the answer) and removes the worktree.
- Step 2 of `runDelegate`: when the checkout has uncommitted paths (`uncommittedPaths`, from `git status --porcelain`), it returns the outcome `dirty` before anything is read or launched, and the task runs on Claude. Issue #198 measured 43 `dirty` outcomes in 127 read-only tasks; in 27 of them the only uncommitted file was `CLAUDE.md`. Nothing stale is read, but one read in three goes back to Claude's quota.
- The copy is always of the checkout the Lead's shell is in. Issue #185: a brief that said to work in another worktree was answered about the Lead's current one (an inventory of release 0.25.1 that read as complete), and a brief about folders outside the repository was answered about the copy only. That second case is the stale read the owner calls a serious design flaw.
- Every harness but Codex runs with its approvals off and no sandbox (`--dangerously-skip-permissions` in agy, `--disable-approval` in muse, `--force` in cursor), so the disposable copy is what keeps a delegate from writing in the owner's checkout. That protection stays.

## Criteria

- **C1** A read-only delegate is launched on another harness when the checkout has uncommitted work, and its copy holds that work: the changed content of tracked files, staged changes, new files that git does not ignore, and no file that was deleted.
- **C2** Files that git ignores are never in the copy, and neither is a new file whose name is `.env` or begins with `.env.`, ignored or not.
- **C3** Taking the copy changes nothing of the Lead's: its working tree, its index, its stash, its branches and its `git status` are the same before and after.
- **C4** A brief can name the tree it is about with a line `AETHER-TREE: <path>`: a worktree of the same repository. The copy is then of that tree, with its uncommitted work. Without the line, the copy is of the Lead's current checkout, as today.
- **C5** A brief whose subject the copy cannot hold is not sent out: it names an existing path outside the tree being copied, or an existing path inside it that git ignores. The task runs on Claude, which reads the real paths, and the delegate log says why. No partial answer that reads as complete.
- **C6** A delegate that changes its copy still has its answer undone, measured from the copy as it was given.
- **C7** `npm test` and `npm run test:mod` pass. The existing tests that pin the `dirty` refusal are rewritten to the new behaviour, and only those.

## Design

**D1. The copy is a snapshot commit, built with a temporary index.** In the tree to copy: copy that tree's index file to a temporary path (so the stat cache is kept and only changed files are hashed), then, with `GIT_INDEX_FILE` set to that path, `git add -A`, `git write-tree` and `git commit-tree <tree> -p HEAD`. The disposable worktree is added detached at that commit. `git add -A` honours `.gitignore` and `info/exclude`, so ignored files stay out by git's own rule. No ref points at the snapshot commit: it leaves with the worktree and git prunes it later. When the tree has no uncommitted path the snapshot is `HEAD` itself and no commit is made. The temporary index is deleted in the same `finally` that removes the worktree.

**D2. `.env` files stay out.** Before `write-tree`, every path in the temporary index that is not in `HEAD` and whose base name is `.env` or starts with `.env.` is removed from the temporary index (`git rm --cached` under `GIT_INDEX_FILE`). A tracked `.env` file travels as it does today, because it is already in the commit. The outcome's detail names how many files were left out, never their content.

**D3. The check measures from the snapshot.** `start`, which `worktreeChanges(worktree, start)` compares with, is the snapshot commit. Nothing else of the judging changes.

**D4. The tree.** `AETHER-TREE:` is parsed next to `AETHER-TASK:` in `lib/delegate-task.js` and reaches `runDelegate` as the directory to copy. A path that is not a worktree of the same repository (`git worktree list --porcelain` from the Lead's checkout) refuses the launch with a message that names the worktrees, as an unknown skill in `AETHER-SKILLS:` does. A task with `AETHER-OWNS:` ignores the line: this design is for read-only tasks.

**D5. What the copy cannot hold.** Before the quota is read, the brief's text is scanned for path-like words:
- an absolute path, or one that starts with `~/`, that exists on disk and is not inside the tree being copied;
- a relative path that exists inside the tree being copied and that `git check-ignore -q` says is ignored.

Either one gives the outcome `outside`, with the first such path in its detail. A word that does not exist on disk is not a path for this rule, which keeps a URL's path and a command such as `/aether:run` from matching. `outside` is handled wherever `dirty` is handled today: nothing is launched, no quota is read, and the task runs on Claude at its step's model. `runDelegate` no longer returns `dirty`; readers of old log lines keep understanding it.

**D6. What the delegate is told.** `DELEGATE_NOTE` says the current directory is a snapshot of the tree taken at launch, with its uncommitted changes, without the files git ignores, and that an absolute path of the brief under that tree is under the current directory.

**D7. Records.** The launch line of the delegate log gets the snapshot's facts (the tree, whether it carried uncommitted work, how many `.env` files were left out). `docs/guide/delegates.md` says what a read-only delegate on another harness reads. The Lead's bootstrap rules get no new text: the system decides, not the Lead.

## Accepted limits

- The snapshot is of the moment of launch. What the Lead edits while the delegate reads is not seen. A file being written at that instant may be copied half written.
- A new file that is not ignored and is not a `.env` file travels to the other provider, whatever it holds. Today the same file travels once it is committed.
- The path scan of D5 is by words: a brief that describes a place without writing its path is not caught.

## Tests

In the style of `tests/delegate-calls.test.js` (throwaway repositories from `tests/helpers.js`, a fake adapter, no real CLI), written first and seen failing:
1. A checkout with a changed tracked file, a staged file, a new file, a deleted file, an ignored file and a new `.env.local`: the delegate is launched, and its copy holds the first three as they are on disk, lacks the deleted, the ignored and the `.env.local`.
2. The Lead's `git status --porcelain`, the hash of its index file and its stash list are equal before and after.
3. A clean checkout: the copy is at `HEAD` and no commit is made.
4. `AETHER-TREE:` with another worktree of the repository: the copy is of that worktree. With a path that is not one: the launch is refused and names the worktrees.
5. A brief that names an existing path outside the tree, and one that names an existing ignored path inside it: outcome `outside`, the adapter is never called, no quota is read. A brief with a URL and with `/aether:run`: launched.
6. A delegate that edits its copy: `violation`, with the files it touched, measured from the snapshot.
