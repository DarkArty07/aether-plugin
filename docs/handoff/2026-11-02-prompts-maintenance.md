# Handoff: the Lead's rules whole, and every prompt audited and rewritten (spec 025, version 0.30.1)

- **Date:** 2026-11-02. It follows the handoff of 0.30.0 (install, start and learn in four steps).
- **From:** the Lead, Claude Code, on Sonnet. Every prompt was written by Opus at `high` through the `Agent` tool, each task placed by the owner's words (A99); the Judge (Opus) ruled the design three times.
- **To:** the owner, and the next session.
- **Repository state:** version 0.30.1 is on `main`, pushed. The work came in two merges, `ac05e91` (groups A, B and C of the prompts) and `0bac293` (the code prompts, issue 142 and the delivery of the rules), and a release commit. `npm run check` was green on the merged tree: 2632 tests, 109 of the mod, `claude plugin validate --strict` on the plugin and on the marketplace.

## 1. What was asked

The owner saw a clean-user test of 0.30.0 in which the Lead said that the hook had delivered its context truncated. They asked for an issue and a way for the hook to deliver the whole content, and, in the same breath, for the maintenance of every system prompt of the plugin («Para optimizar y eliminar incoherencias»), with one rule: **only Opus writes system prompts**. They asked for Opus at `max`, then at `xhigh`, then accepted `high` by `Agent` because the ladder fixes a delegate's effort (issue 141).

## 2. What was done

- **Delivery of the rules (issue 139).** The cut of Claude Code is 10,000 characters **per hook output**. The bootstrap (`skills/using-aether/SKILL.md`, 28,911 bytes) now goes out in consecutive parts of at most 9,800 characters of output, six commands in one SessionStart entry: `aether-session-start` (notes and side effects) and `--part 1` to `--part 5` (four are used). The design is `specs/025-prompts-maintenance/design.md`. The first design, the rules as the body of `agents/lead.md`, was refused: a body replaces Claude Code's own system prompt (F2), and the issue had wrongly said it did not.
- **Audits and rewrite (issue 140).** Four read-only audits are in `specs/025-prompts-maintenance/audit/` (24, 16, 12 incoherences and the code prompts). The Lead's rules, the agents, the Writer's skills, the skills a person types and the prompts of both workflows and the lanes were rewritten so that a rule lives in the body of its agent and the messages carry data. No test was weakened; the pins that held a rule on both sides now hold it once.
- **Issue 142.** A carried correction no longer tells the delegate to apply a patch that the lane applied; a refused patch is announced to the delegate and to the Lead.
- **Cost.** About US$ 81 at list price for the whole session (US$ 26.75 for the four audits, run from the shell with `claude -p` at Opus `max`, which the owner accepted once; US$ 54.38 for the session through the system).

## 3. Open

- **Issue 141:** `aether-delegate authorize --effort`, so that the owner's word can place Opus at `xhigh` or `max`. It is an exception to assumption (d) of spec 021; a new session sees it, not the one that is running.
- **Issue 143:** an editing delegate on Claude starts from the Lead's `HEAD` and the owns check measures against it, so it cannot build on a feature branch. A broad `Owns` works around it.
- **Issue 144:** `carryFile` and `previousWork` can take work from different attempts.
- **Not measured:** `/clear` and `/compact` with the parts, a hook process that fails, and any total above 30 KB. The order of the parts is not guaranteed (1, 2, 4, 3 once); each part carries its number.
- **Left as they are on the owner's «Si a todo»:** a 12-character quote is enough for a grant, Cursor has no models, the symbol of a `warn` differs in `setup` and `doctor`, the rows of the Complexity table, the version of the preset, and «Aether's tools» for a paid call. `findingTouch` to `revisionBrief` in `seats.js` have no production caller.

## 4. Lessons of the run

- A delegate's worktree starts from `main`; chain a verdict and a merge with an `if` on the output, never with `;`.
- `aether-autonomy spend` adds figures under different `--source` labels; reuse a label to replace one.
- `ps | grep -v grep` hides a process whose arguments contain «grep»; a waiter whose command contains the pattern it searches never ends.
- Test a tool with a cheap probe before saying what it cannot do (the `Agent` call does run Opus; only its effort is fixed).
