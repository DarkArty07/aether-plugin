# Handoff: aether:design built, reviewed and released as 0.11.0

- **Date:** 2026-10-15. It follows [the 0.10.0 handoff](2026-10-14-quota-lanes-0.10.0.md).
- **From:** the Lead, Claude Code on Opus 5.5 at `max`, in an Aether session on 0.10.0 that worked on its own overnight. The owner granted the run with «ire a dormir trbaja autonomamente», and asked that every delegate run on Sonnet or Haiku, never Opus. Aether's own agents ran on their definitions.
- **To:** the next session.
- **Repository state:**
  - `feat/aether-design` holds spec 005's design and build, the final review's fixes and the 0.11.0 bump. It also holds spec 004, the reconciled documentation (`docs/reconcile-0.10.0`, merged at `35bc7bb`), and issues 010 to 013 (`docs/issues-swarm-0.10.0`, merged at `d4e74dd`). It goes to `main` through this release's pull request, tagged `aether--v0.11.0`.
  - Its checks: `npm test` 971 of 971, `npm run check` exit 0, and spec 005's hidden exam 7 of 11 (see §2).
- **Installed plugin:** 0.10.0 until the marketplace updates from `main`.

## 1. What was done

| Commits | What |
|---|---|
| `a3fc941`, `54d2a1c` | **Spec 005's design**, conducted by the Lead with 0.10.0's rounds. The Judge approved the spec, and the plan with its 11 tasks, each at its second review. The Examiner's 11 tests are stored outside the repository. |
| `35bc7bb` | **Spec 004 as the base.** Session 5ef557b7's documentation reconciliation (the README from 451 to 54 lines, 15 pages under `docs/`, its exam 11 of 12) was merged before the build, so 0.11.0's documentation follows its layout. |
| `520147b` … `28281bf` | **Spec 005 built by the swarm**, run `20261015-024936-ee31`: 11 of 11 units merged in 12 attempts, one effort climb and no escalation, 79 agents in 56 minutes, US$ 13.5 at list prices, and no lane call (issue 015). `fba465e` is the 0.11.0 bump, with decisions A50 to A54. |
| `4ec1156`, `0394af7` (merged at `0e71bba`) | **The final review and its fixes.** The run's own final review ended at the reviewer's 30 turns on a 394 KB package (issue 011). Four `aether:reviewer` slices (the workflow, bins and libs, prompts, docs) found no critical finding and 8 important ones. Two delegate tasks on Sonnet fixed six: the bootstrap, the `autonomous-runs` and `swarm` skills, the docs, and `writerQuestions` in `/aether:design`'s result. One was accepted as a deviation, with its text corrected: in full mode the Writer's corrections stay native, as the plan says (proposal P8). One was regraded to minor. |
| `c4a9564`, `1e8b755`, `dfae969` | Issues 014 to 016, and the GitHub mirrors of 008 and 010 to 016 (#13 to #20). |

## 2. Found in this session

- **The hidden exam guesses interfaces the plan fixes.** Its 4 failing tests contradict the approved plan: a seat id `writer-round-1` where the plan fixes `<seat>-YYYYMMDD-HHMMSS-xxxx`, `PAYLOAD_PATH` looked for in `register.js` where the plan put it in `ops-command.mjs`, and wording and headings the plan fixed differently. With the two formats fixed in a copy of its harness, the workflow test passes 16 of 16. The build was not changed to pass a literal test.
- **A swarm's final review still does not fit in 30 turns** (issue 011). Slices with a turn budget in the message finished in 25 to 43 calls, in about 5 minutes and US$ 5.4 for the four.
- **The Writer at `xhigh` spent 60 turns and 420 thousand tokens without writing**, which supports A53.
- **The Lead on Opus 5.5 at `max` was the session's largest cost:** US$ 25 of about US$ 59 at list prices. Lowering the Lead's effort after measuring it stays a proposal (P7).
- [Issue 014](../issues/014-autonomy-cannot-verify-an-owner-message-sent-mid-turn.md): a message the owner sends mid-turn does not count for `aether-autonomy`, so this run kept a manual diary.
- [Issue 015](../issues/015-one-odd-quota-reading-marks-a-lane-group-dry-for-three-days.md): one odd reading marked agy's Gemini group dry for three days. The mark was deleted with the owner's yes.
- [Issue 016](../issues/016-agy-does-not-offer-gemini-4-argon-so-every-external-seat-falls-back.md): agy 1.3.5 does not offer Gemini 4 Argon, so the `balanced` seats are native in practice. agy moved to 1.3.6 the same day; whether it offers Argon is not checked.

## 3. What is left

- **Not verified:** a real `/aether:design` run with live agents (the workflow runtime honoring the explicit `model` and `effort`, and the ops mod creating the payload folder); the Lead's one question at a time (R5) and the Writer's judgment on `[NEEDS CLARIFICATION]`, reviewed only as text; and A7's measurement against session 5ef557b7, to be made by hand.
- The 31 minor findings the review slices deferred, in `.aether/autonomy/manual-20261015/menores-diferidos.md` (local, not in git).
- The Proposals of spec 005 (P1 to P8), and issues 008 and 010 to 016.

## 4. What waits for the owner

- **The first design on 0.11.0.** The next design request runs `/aether:design` for real. It is the test this build could not make.
- **Spec 004's last check:** follow [Getting started](../getting-started.md) with a real model. Its C1 stays partial until then.
- **Leftovers:**
  - the release's integration worktree, once its session ends: `git worktree remove .worktrees/aether-design && git branch -d feat/aether-design` (from `main`);
  - the local branch `brand/pixel-art-tool`: session 5ef557b7's pixel-art tool with its issue 009, kept out of `main` with the brand assets. Delete it with `git branch -D brand/pixel-art-tool` when it is no longer wanted.

## 5. How to run things

As in [the second handoff](2026-10-14-super-lead-built.md) §5. To move the installed plugin to the latest `main`, run `claude plugin marketplace update aether-plugin`, then `claude plugin update aether@aether-plugin`, then start a new session with `aether-lead`.
