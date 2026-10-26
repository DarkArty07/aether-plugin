# Handoff: each role on the cheapest model and effort that does its work (spec 016)

- **Date:** 2026-10-26. It follows [the self-observation handoff](2026-10-23-self-observation.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, session `d8729560`, in an autonomous run (`auto-20261026-031440-d7ca`) that the owner opened with «trbaja autonomamente. Quiero TODO DOCUMENTADO, no estare disponible».
- **To:** the owner, and the next session.
- **Repository state:** built and checked on the branch `feat/model-effort-policy` (worktree `.worktrees/model-effort-policy`), **not merged, not pushed, not published**; `main` is still 0.20.1 and the owner's installed plugin is still 0.20.1. Nothing irreversible was done.

## 1. What was asked

After a conversation of questions about which role uses which model and how many points, the owner asked for a cheapest-first policy in the manner of the delegate ladder, with less Opus, to make his one Claude limit last longer: «lo que busco es minimizar el costo de computo que la cuota se agste menos rapido», «quiero usar menos opus porque opus gasta el doble de sonnet», «no todos los efforts valen igual». He also asked that nothing be built before it was investigated (issue [96](https://github.com/DarkArty07/aether-plugin/issues/96)), that a skill explain how to read Artificial Analysis, and, when he left: «Quiero TODO DOCUMENTADO, no estare disponible. y Pero es importante la jsutifciaicon de porque hacemos estos cambios». [The intent card](../../specs/016-model-effort-policy/intent.md) has his 14 quotes, the criteria C1 to C9 and the assumptions.

## 2. What was built

[The design](../../specs/016-model-effort-policy/design.md) holds the justification (J1 to J7) and the decisions (D1 to D8); [the spec](../../specs/016-model-effort-policy/spec.md), [the plan](../../specs/016-model-effort-policy/plan.md) and [the tasks](../../specs/016-model-effort-policy/tasks.md) turn it into seven tasks. In short:

- **The delegate ladder** (`config/ladder.json`): the effort of a correction and of a rise in Sonnet and Opus is `high`, not `xhigh`. Haiku is unchanged (`high`, then `xhigh`).
- **The swarm** (`workflows/run.workflow.js`, `effortFor`): a retry on a Sonnet or Opus task keeps the task's effort, a retry on a Haiku task runs at `xhigh`, and a unit that moves up a model runs at `high`. The log of the escalation and the supervisor's *Ladder* section name those efforts from the same function.
- **The final review** (`reviewPlan`): Opus `xhigh` only when a merged unit is Tier Opus; a Review at `xhigh` or `max` no longer raises it. `reviewerReference('opus')` of `lib/lane-delegate.js` is Opus `high`.
- **The default effort of a plan task** is `high` (`lib/plan.js`, `agents/implementer.md`), and the guide the Writer reads (`agents/writer.md`, `skills/tasks/SKILL.md`, `speckit/commands/speckit.tasks.md`) reserves `xhigh` and `Review: xhigh` for where an error would reach data, security or concurrency.
- **Documentation:** the page [Models by role](../guide/models-by-role.md) (each role before and after, the ladder, where the spend went, why, where Opus stays and how to tell whether it worked) with a test that holds it to `config/ladder.json`, `DEFAULT_EFFORT` and `agents/*.md`; decision A93 with update notes in A18, A36 and A87; the delegates, methodology, roadmap and purpose pages corrected; an «Unreleased» entry in the changelog.

What did **not** change: the Lead, the Writer, the Judge and the Examiner; `lib/superdelegation.js` and `lib/ladder.js`; the numbers of the ladder (5, 2 and 1 corrections; the plan's 2, 2 and 1); the model each unit starts on.

## 3. How it was checked

- `npm run check`: 1950 tests, the mod's tests and the `--strict` validation of the plugin and the marketplace, all passing.
- The hidden exam (9 tests, written by an Examiner on Muse): 9 of 9. It first failed 3, and each was fixed in the document, not in the exam: the Writer's guide said «The effort** is `high`» with markdown bold in the middle of a sentence the exam's pattern could not read (reworded to «defaults to `high`»); the models page's first line about the default effort did not say which one; the purpose page said nothing of `high`. A fourth, the page never named the reviewer agent, was found on the rerun.
- The swarm: 7 units, 7 merged at the first attempt, none climbed, final review `ready-with-fixes` (0 critical, 1 important, 18 minor). The important one, `skills/swarm/SKILL.md` still giving the old final-review rule and an escalation rung that no longer happens, was in no task's `Owns` and was fixed by the Lead; so were five minor ones that made a sentence false (the delegates page's «one place where a correction does not raise the effort» and its «Opus at `xhigh`» example; the supervisor on Opus, which holds only with `superdelegation` on; the saving, US$50.56, not «US$50»).
- The swarm cost US$5.43 at list price in Claude (Opus `high` reviewer US$4.13, Sonnet `high` supervisors US$0.76, ops US$0.20, the Lead's turns US$0.34); the external seats and implementers ran on Muse, which prices no call, and agy, which had no quota for Opus or Argon.

## 4. What is open

- **A question for the owner:** that in Sonnet and Opus a correction keeps the effort `high` goes against his decision A87 («una corrección sube un escalón de esfuerzo»). He did not answer; the run assumed it. It is two numbers in `config/ladder.json` and a line in `effortFor`.
- **Nothing of the new rules has run in a real swarm.** This swarm was built by the 0.20.1 workflow. Whether a lower effort lets more through (J7) is measured by the two next swarm runs, as [the page](../guide/models-by-role.md#how-to-tell-if-it-worked) says, against the baseline of the 8 earlier runs.
- **The saving is a maximum:** up to US$50.56 of US$165 (31 %), because the final review stays at `xhigh` for a Tier Opus unit, and it counts neither Haiku-first nor the cost of a correction to the Lead. In the swarm that built this change, the supervisors ran on Sonnet because the implementers were Muse and Gemini, not Claude: the supervisor on Opus (rule A41) appears only when a Claude model wrote the work and no other harness takes the review.
- **Deferred minor findings of the final review** (13 of the 18; none blocks): a test that pins the `## Unreleased` heading the release removes; the A93 row is one cell of about 9,000 characters; the page test does not tie the Implementer and Lead rows to the tree; the page says nothing of the small all-Haiku run on Sonnet `high`; the undo list names five places and a full revert also touches `implementer.md` and the guide; no test pins that an external-pair correction in Sonnet and Opus is capped at `high`; the `opus max` swarm row is tested with a ladder of two Opus attempts; and others of wording.
- **Proposals (not worked):** start the swarm in Haiku (measure how many Tier Sonnet units Haiku approves first); Opus `medium` for the supervisor, with a `nativeFor` that picks the cheapest pair that reaches the points asked at any effort; Sonnet `max` as the last rung of the hardest tasks; keep, per attempt, what each supervisor approved or rejected.
- **Two findings, filed as issues:** [98](https://github.com/DarkArty07/aether-plugin/issues/98), the plan check calls a glob and an unrelated file in the same folder an overlap, which forces waves of one task; and [99](https://github.com/DarkArty07/aether-plugin/issues/99), an exam test can fail a correct build on the formatting of a document.

## 5. Release (waiting for the owner)

The branch is ready. In this order, each step with the owner's yes:

1. Merge `feat/model-effort-policy` into `main` (class `merge-main`). The main checkout holds uncommitted changes of another session (`docs/index.md` and two pages on Artificial Analysis): commit or move them first, because this branch also changes `docs/index.md`.
2. Fix what the release needs: the decision number (A93 may be taken: issue [50](https://github.com/DarkArty07/aether-plugin/issues/50)), the version in its four places (`plugin.json`, the pin in `tests/launcher.test.js`, the README's `Version` line, the changelog's first `Version X.Y.Z:` line), the «Unreleased» entry turned into that line, and the tests that name the old ones (`tests/docs-facts.test.js` R12, R15 and the first changelog line; `tests/effort-policy-docs.test.js`, which pins the `## Unreleased` heading).
3. `npm run check`, then `claude plugin tag plugins/aether` (class `publish`), the push of `main` and the tag (class `push`), and `claude plugin update aether@aether-plugin` (class `deploy`).

The skill `.claude/skills/artificial-analysis/` (with its scripts, which read the website that Artificial Analysis' terms forbid reading by code, and the 22 pages read once on 2026-10-26 by the owner's order) is untracked on purpose and is not in the branch.
