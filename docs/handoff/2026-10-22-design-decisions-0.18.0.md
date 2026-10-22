# Handoff: the owner's design decisions of 2026-10-21, built (0.18.0)

- **Date:** 2026-10-22. It follows [the 0.17.0 handoff](2026-10-22-session-cost-0.17.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in one long session that went from «revisa los issues que hay abiertos» to a release.
- **To:** the next session.
- **Repository state:** published as 0.18.0 (merge into `main`, tag `aether--v0.18.0`, push, and the owner's plugin updated), on the owner's word quoted in section 5.

## 1. What was asked

The owner wanted GitHub issues to be the only list of bugs and improvements (the issue files that lived in the docs were moved to issues #1 to #68 and deleted), then asked for the bugs that need no design decision to be fixed, and then decided the design questions one by one («la opción recomendada»). The bugs fixed first went out in 0.17.0 (decisions A74 and A75). This release holds the design decisions.

## 2. What was decided and built

| Decision | Issues | What it does |
|---|---|---|
| A77 | [issue 2](https://github.com/DarkArty07/aether-plugin/issues/2) | A merge the mod cuts at 600 s counts as not merged until its tests pass: a marker before the tests, `unverified` in `aether-wt status`, a rerun of only the tests, and a safe stop (`unverified-other`) when it cannot be settled. |
| A78 | [issue 5](https://github.com/DarkArty07/aether-plugin/issues/5), [issue 33](https://github.com/DarkArty07/aether-plugin/issues/33) | The final review runs once per run, when a launch ends with every unit merged; otherwise `deferred`, or `review: true` to force it. |
| A79 | [issue 14](https://github.com/DarkArty07/aether-plugin/issues/14) | After a missing report the next pass is one sub-attempt per owned file. |
| A80 | [issue 64](https://github.com/DarkArty07/aether-plugin/issues/64) | The author rule is an order of reserve in the design seats and the Judge is chosen first; Grok stays out of the Judge's seat. |
| A81 | [issue 67](https://github.com/DarkArty07/aether-plugin/issues/67) | A correction round edits only what the Judge flagged. |
| A82 | [issue 68](https://github.com/DarkArty07/aether-plugin/issues/68) | A pair that takes over continues from the failed one's work (delegates and the Writer seat). |
| A83 | [issue 65](https://github.com/DarkArty07/aether-plugin/issues/65), [issue 51](https://github.com/DarkArty07/aether-plugin/issues/51) | No limit on two swarms; the router's criterion is postponed. |

Each decision is a row of [the decisions page](../decisions.md) with the owner's choice and the design.

## 3. How it was built and checked

Seven delegates on Grok and Gemini Flash built the changes in their own worktrees, with the tests first; Opus agents reviewed the work in four rounds. The first fix of [issue 2](https://github.com/DarkArty07/aether-plugin/issues/2) (reverts, rebases, a replay of dropped commits) and its second were thrown away because the reviews showed that machinery opened more cases than it closed, and a smaller design replaced them. `npm run check` passes (1797 tests and the validation of the plugin and the marketplace). A test with six flaws planted in a spec compared the Judge: Opus found 6 of 6, Grok 6, 4 and 5 of 6 in three runs (the table is in [issue 64](https://github.com/DarkArty07/aether-plugin/issues/64)).

## 4. What is open

- [issue 75](https://github.com/DarkArty07/aether-plugin/issues/75): a Muse 429 («Subscription quota exhausted») is a plain failure, so Muse is not marked dry and every delegate review fails on it.
- [issue 74](https://github.com/DarkArty07/aether-plugin/issues/74): a delegate on Bash does not show as an agent; the owner wants to see them working.
- [issue 78](https://github.com/DarkArty07/aether-plugin/issues/78): the rare edge cases of the unverified merge.
- [issue 51](https://github.com/DarkArty07/aether-plugin/issues/51) (the router's criterion, postponed), [issue 63](https://github.com/DarkArty07/aether-plugin/issues/63) (the reset that Muse states, left on purpose by A75).
- `maxTurns` of the reviewer and the Judge is 30 and two of six reviewers ran out of it; the owner was asked whether to raise it to 40 and has not answered.
- The changes of the merge, the final review, the split pass and the seats were verified with stubs and temporary repositories, not in a real swarm or a real design; only the delegate's continuation was seen in a real run.
- On 2026-10-22 Grok fell to 3 %, Argon was marked dry and Muse was exhausted; Gemini Flash still had 83 %, but it only reaches tasks asked at Haiku's points (40.9), so a delegate for it is launched with `--model haiku --effort xhigh`.

## 5. Release

Published as 0.18.0 on 2026-10-22 on the owner's word («Necesito que oush a main currers los issues acutlaices de mi versión de la máquina borres lo que ya no vas a ocupar incluído tmp»): the version in the four places, `npm run check`, the tag `aether--v0.18.0`, the push of `main` and the tag, `claude plugin update aether@aether-plugin`, and the deletion of the worktrees, branches and temporary files of the session. The grants (push, publish, delete) were session grants and were revoked afterwards. Another session of the owner published 0.17.0 and 0.17.1 on `main` while this one worked, so this batch took the decision numbers A77 to A83.

## 6. What the next session has to watch

That a swarm in a real session with a test command longer than ten minutes behaves as A77 says; that the final review of a launch with a blocked unit says `deferred` and that the Lead reads it as «not yet»; that a design whose Writer is Muse gets a Judge from another family or, failing that, from Muse itself, with the note that says so. The owner's other plans may be dry for days: check `aether-lane quota` before assuming a delegate will find a pair.
