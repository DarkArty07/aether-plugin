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
- **C2** Files that git ignores are never in the copy, and neither is any file whose name is `.env` or begins with `.env.`, tracked or not, changed or not, ignored or not.
- **C3** Taking the copy changes nothing of the Lead's: its working tree, its index, its stash, its branches and its `git status` are the same before and after.
- **C4** A brief can name the tree it is about with a line `AETHER-TREE: <path>`: a worktree of the same repository. The copy is then of that tree, with its uncommitted work. Without the line, the copy is of the Lead's current checkout, as today.
- **C5** A brief whose subject the copy cannot hold is not sent out: it names, in the Lead's own words, an existing path outside the tree being copied, or an existing path inside it (written absolute or relative) that the copy lacks: one that git ignores, or a `.env` file. The task runs on Claude, which reads the real paths, and the delegate log says why. No partial answer that reads as complete.
- **C6** A delegate that changes its copy still has its answer undone, measured from the copy as it was given.
- **C7** `npm test` and `npm run test:mod` pass. The existing tests that pin the `dirty` refusal are rewritten to the new behaviour, and only those.

## Design

**D1. The copy is a snapshot commit, built with a temporary index.** In the tree to copy: copy that tree's index file to a temporary path (so the stat cache is kept and only changed files are hashed), then, with `GIT_INDEX_FILE` set to that path, `git add -A`, `git write-tree` and `git commit-tree <tree> -p HEAD`. The disposable worktree is added detached at that commit. `git add -A` honours `.gitignore` and `info/exclude`, so ignored files stay out by git's own rule. No ref points at the snapshot commit: it leaves with the worktree and git prunes it later. The commit needs no identity of the machine: that one `commit-tree` call runs with fixed `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` (`aether-delegate`, `aether-delegate@localhost`) in its environment, so a machine without `user.name` or `user.email` still launches. When the tree has no uncommitted path and `HEAD` holds no `.env` file (D2), the snapshot is `HEAD` itself and no commit is made. The temporary index is deleted in the same `finally` that removes the worktree.

**D2. `.env` files stay out, tracked or not.** Before `write-tree`, every path in the temporary index whose base name is `.env` or starts with `.env.` is removed from it (`git rm --cached` under `GIT_INDEX_FILE`), whether `HEAD` tracks it, whether it has uncommitted edits, or whether it is new. The copy then lacks it, as the owner's words ask: «.env files always stay out». This changes today's behaviour, where a tracked `.env` file is in the `HEAD` copy; the delegate that needs one is a task for Claude (D5). The outcome's detail names how many files were left out, never their content.

**D3. The check measures from the snapshot.** `start`, which `worktreeChanges(worktree, start)` compares with, is the snapshot commit. Nothing else of the judging changes.

**D4. The tree.** `AETHER-TREE:` is parsed next to `AETHER-TASK:` in `lib/delegate-task.js`. `begin` writes it into the external file as its own field `tree`, apart from `cwd`: `cwd` stays the Lead's checkout, which `delegate-run.js` uses for the unit branch and the integration worktree, and `tree` is the directory to copy; `runReadOnly` hands `tree` (or `cwd` when there is none) to `runDelegate`. A path that is not a worktree of the same repository (`git worktree list --porcelain` from the Lead's checkout) refuses the launch with a message that names the worktrees, as an unknown skill in `AETHER-SKILLS:` does. A task with `AETHER-OWNS:` ignores the line: this design is for read-only tasks.

**D5. What the copy cannot hold.** `begin` decides this once, before it picks a pair, on the text of the Lead's own prompt: the brief as the Lead wrote it, without its `AETHER-` lines, and never `externalPrompt` (which adds the earlier-work sections, the findings and the bodies of the skills). The words are taken like this: split on white space; strip from each word the backticks, quotes, brackets and parentheses around it, trailing `.`, `,`, `;`, `:`, `!` and `?`, and a suffix `:LINE`, `:LINE:COL`, `:LINE-LINE` or `#LINE`. A word is a candidate when it starts with `/`, `~/`, `./` or `../`, or has a `/` inside it. A candidate is expanded (`~/` to the home directory, a relative one against the tree being copied) and counts only if it exists on disk. Then:
- an existing path that is not inside the tree being copied is `outside`;
- an existing path inside the tree, written absolute or relative, is turned into a path relative to the tree's root and is `outside` when `git check-ignore -q` says it is ignored (the case `<checkout>/.worktrees/x/...` of issue #185) or when its base name is a `.env` name (D2).

The first such path goes into the detail. A word that does not exist on disk is not a path for this rule, which keeps a URL's path and a command such as `/aether:run` from matching. When `begin` finds `outside`, nothing is launched on another harness and no quota is read: the task runs on Claude at its step's model, and the launch line of the log carries `outside: <path>`. `runDelegate` receives no such task, so it has nothing to decide per candidate pair. It no longer returns `dirty`; readers of old log lines keep understanding it.

**D6. What the delegate is told.** `DELEGATE_NOTE` says the current directory is a snapshot of the tree taken at launch, with its uncommitted changes, without the files git ignores, and that an absolute path of the brief under that tree is under the current directory.

**D7. Records.** The snapshot does not exist when `begin` writes the launch line, which `begin` writes before `runDelegate` runs, in another process. So the snapshot's facts (the tree, whether it carried uncommitted work, how many `.env` files were left out) go on the `outcome` entry that `delegate-chain.js` writes after the call. The launch line gets only what `begin` knows: `outside: <path>` when D5 applied, and the tree named by `AETHER-TREE:`. `docs/guide/delegates.md` says what a read-only delegate on another harness reads. The Lead's bootstrap gets one line, because the Lead learns the brief lines only from the list under `## The delegate ladder` of `skills/using-aether/SKILL.md`: «`AETHER-TREE: <path>`: a read-only task about another worktree of the repository; the delegate reads a copy of that tree with its uncommitted work.» Each part of the bootstrap stays within 9,800 characters, which the existing test of the parts holds; the system still decides what runs where, and the Lead only names the tree.

## Accepted limits

- The snapshot is of the moment of launch. What the Lead edits while the delegate reads is not seen. A file being written at that instant may be copied half written.
- A new file that is not ignored and is not a `.env` file travels to the other provider, whatever it holds. Today the same file travels once it is committed.
- The path scan of D5 is by words: a brief that describes a place without writing its path is not caught.
- A `.env` file never reaches another harness, even a tracked one: a read-only task about it runs on Claude only when the brief writes its path (D5).

## Tests

In the style of `tests/delegate-calls.test.js` (throwaway repositories from `tests/helpers.js`, a fake adapter, no real CLI), written first and seen failing:
Test 1 and the tests that look inside the copy use a new verb of `tests/fixtures/fake-agy.js`, `FAKE-AGY: export <absolute-dir>`, which copies the files of its current directory (not `.git`) to that absolute directory in the test's own temporary folder: `runDelegate` removes the copy in its `finally`, so the test reads what the fake exported.
1. A checkout with a changed tracked file, a staged file, a new file, a deleted file, an ignored file, a new `.env.local`, and a tracked `.env` with an uncommitted edit: the delegate is launched, and its exported copy holds the first three as they are on disk, lacks the deleted, the ignored, the `.env.local` and the tracked `.env`, and the outcome's detail counts two `.env` files left out. The same with `user.name` and `user.email` unset and `GIT_CONFIG_GLOBAL` pointing at an empty file.
2. The Lead's `git status --porcelain`, the hash of its index file and its stash list are equal before and after.
3. A clean checkout with no `.env` file: the copy is at `HEAD` and no commit is made. A clean checkout with a tracked `.env`: the copy lacks it.
4. `AETHER-TREE:` with another worktree of the repository: the copy is of that worktree. With a path that is not one: the launch is refused and names the worktrees.
5. In `begin`, with the Lead's brief naming: an existing path outside the tree; an existing ignored path inside it, relative and absolute (including `<checkout>/.worktrees/x/file`, with `.worktrees/` ignored); an existing `.env` path: each gives `outside`, the launch line records the path, the task is on Claude, no pair is picked and no quota is read. The same path written as `/x/a.js:120`, in backticks, in quotes, in parentheses and with a trailing full stop is found in the same way. A path that appears only in the earlier-work sections or a skill body does not give `outside`. A brief with a URL and with `/aether:run`: launched.
6. A delegate that edits its copy: `violation`, with the files it touched, measured from the snapshot.
7. The external file written by `begin` for a task with `AETHER-TREE:` holds `tree` and keeps `cwd` as the Lead's checkout. The snapshot's facts are on the `outcome` entry, not on the launch line.
