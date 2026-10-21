# Handoff: a delegate task that edits files goes first to another harness (0.15.0)

- **Date:** 2026-10-21. It follows [the 0.14.5 handoff](2026-10-21-external-seats-0.14.5.md) and [the 0.14.4 one](2026-10-21-split-argon-flash-0.14.4.md), whose section 3 is the owner's policy: read it first.
- **From:** the Lead, Claude Code on Sonnet 5.5, in the same long session, in two autonomous runs («necesito que trabjes en lo que conversmaos, continua implementandolo» and, after the first reached its time ceiling, «Hola? Continua»), with «autorizo gasto no hay problema».
- **To:** the next session.
- **Repository state:** built on the branch `feat/delegates-that-edit` (worktree `.worktrees/delegates-that-edit`), which holds `fix/external-seats` (0.14.4, 0.14.5 and the swarm fix) and spec 010. Nothing is merged, tagged, pushed or installed: the releases wait for the owner's word.

## 1. What was asked

The three changes of the owner's policy: the Lead's rule, spec 010 (delegates that edit go first to other harnesses) and the swarm's final review on lanes. All three exist now.

## 2. What was done

- **Spec 010, designed and built.** `/aether:design` approved the spec and the plan (Muse wrote them; the exam is stored, 8 tests). The swarm built it on lanes: Muse implemented the core (`aether-lane delegate`, Opus tier) and the reviewer-with-task, Flash the router capture, the Lead's rule and the pages, and Muse supervised. The hidden exam passes 8 of 8; the suite, 1580 tests, and the strict validation pass.
- **What the command does and what the Lead's rule says:** [decision A72](../decisions.md) and [the lanes guide](../guide/lanes.md).
- **A real call:** `aether-lane delegate` in a scratch project ran a Gemini 3.8 Flash implementer (39.8 points for 37.8 asked), its tests in the unit worktree, a Muse review that found an unrequested file, and `aether-wt merge`; the project's tests passed after the merge (7 min 46 s, spent from the owner's paid-call grant, which is revoked).
- **The swarm and the slices** ([A71](../decisions.md), [issue 041](../issues/041-a-swarm-lane-call-that-fails-goes-native-without-trying-the-next-pair.md)): a lane call that began and failed asks for the next pair, up to three, before Claude; the sliced final review offers each slice to the pairs. Muse built both tasks. The call id of a slice had to be added to the three closed lists that name call ids, which the unit could not own.
- **The design workflow** read a wait that reported the round's own exit as a failed wait ([issue 042](../issues/042-a-design-seat-wait-that-exits-non-zero-is-read-as-a-failed-wait-so-the-round-goes-native-after-twelve-waits.md)); fixed in 0.14.5.
- **The final reviews found, and the Lead fixed:** a delegate run was blocked whenever the Lead edited its own checkout (the integration check now skips the status for a delegate, `watched: false`); an incoherent decider answer was tagged `edits`; a killed command left its detached runner spending quota (now it stops its calls); the option text, `router.md` and the bootstrap's execution method still said an editing task stays on Claude.

## 3. Corrections and things the next session must know

- **Why the first swarm of the 010 failed:** Claude's own session limit ran out. The workflow's ops agents (Haiku, 66 of 74 agents) are Claude calls, and the mod answers them without a model only when `binDir` is the plugin it loaded (`hooks/register.js`, `binDir !== ${$.plugin.root}/bin`). Testing a branch from a session on the installed plugin therefore costs a Haiku call per command, and a dry Claude quota stops the swarm although the lanes finish and commit. The lanes' work was in the unit branches: relaunching the same run (`aether-plan compile … --run <id>`) picked it up. **Start such a session with `scripts/aether-lead --plugin-dir <worktree>/plugins/aether`**, so the mod answers.
- **Two swarms at once slow the merges:** the merge of one hit the ten minutes of the ops command while the other ran the suite. Run one at a time, or give the merge more room.
- **The Judge of the 010 ran on Claude Opus in six of seven rounds** for a good reason: Argon was dry, and Muse, the only other pair that reaches the Judge's points, had written the document and the author rule keeps the writer out. With Argon back, or a Writer that is not Muse, the Judge can leave Claude.
- **The autonomous run's clock counted 6.4 hours in which nothing could wake the Lead** (the session limit). A ceiling brief and a second run were the way out.

## 4. Open

- **Nothing of 0.14.2 to 0.15.0 has run in a normal session** (the real call above ran from a branch bin in a scratch project).
- **The final review of a whole package** runs on Claude when no pair reaches the points of its model (Opus at xhigh). That is the rule.
- **The router does not refuse an editing Agent call** (R18 of the first design); `aether-report --delegates` makes the miss visible.
- **`lib/report.js`** counts the shared Gemini window twice (0.14.4); **three tests** read the shell's Aether variables; the minor findings of the final reviews are not worked (the list is in the run results of `20261021-033256-1728`).
- **Cleanup:** the worktrees `.worktrees/split-argon-flash`, `external-seats`, `delegates-that-edit` and `swarm-next-pair` and their branches stay until the releases.

## 5. Release

Three versions wait, in order: 0.14.4 (`fix/split-argon-flash`), 0.14.5 (`fix/external-seats`, which holds 0.14.4) and 0.15.0 (`feat/delegates-that-edit`, which holds both). Merging `feat/delegates-that-edit` into `main` releases all of it as 0.15.0. Version 0.15.0 is in the four places the contributing guide names, with the roadmap and the badge. **It waits for the owner's word.**

## 6. What the next session has to watch

That the first editing delegate of a normal session goes out: `aether-report --delegates` lists no editing delegation on Claude without a `no-candidate`; that a pair that refuses is replaced and not repeated; that the Lead merges on the branch it launched from; and the share of delegations that leave Claude, by kind.
