# Handoff: quota-aware lanes built, reviewed and released as 0.10.0

- **Date:** 2026-10-14, the third session of the day. It follows [the second handoff](2026-10-14-super-lead-built.md) and finishes its §3.
- **From:** the Lead, Claude Code on Opus 5.5 at `xhigh`, in a plain session. The owner asked that every delegate in it run on Sonnet or Haiku, never Opus, to save the plan's quota.
- **To:** the next session.
- **Repository state:**
  - `feat/quota-aware-lanes` (spec 002's build, the review's fixes and the 0.10.0 bump) holds `feat/grok-lane`, and goes to `main` through this release's pull request, tagged `aether--v0.10.0`.
  - Its checks: 882 unit tests, 35 mod tests, both manifests valid, and spec 002's hidden exam 14 of 14, at `b30c5d1`.
- **Installed plugin:** 0.9.0 until the marketplace updates from `main`.

## 1. What was done

| Commits | What |
|---|---|
| `a08e741` … `b17d58e` | **Spec 002 built by the swarm**, in a headless Aether session started by the second session (`aether-lead -p --plugin-dir …`): autonomy run `auto-20261014-105023-a8bf`, swarm run `20261014-105117-b854`. 15 of 15 tasks merged at the first attempt, with no climb, 75 agents in 58.6 minutes, US$ 21.47 at list prices (US$ 18.96 native, US$ 2.51 on 6 agy calls to Gemini 3.8 Flash). The swarm's own final review failed on a 388 KB package; the Lead reviewed it in three slices (ready, ready with fixes, ready). |
| `c89a3a4`, `02e125c` | **The Lead's fixes.** A table group that agy's `/usage` does not list is unknown, not absent. The exam was 12 of 14: `c6-visible` was a test defect (a log entry and `result.json` in the same millisecond), and for `c3-acp-timeout` the Judge ruled the build right, so R5 and R20 now say the 10 and 20 seconds count the end of the group. The Examiner aligned both tests: 14 of 14. |
| `fc453ba` … `ea9c07a` | **An independent review by risk lens**, each finding checked by a reproducer and a skeptic, and two lenses rerun after the plan's session limit stopped them. Seven delegate tasks on Sonnet fixed what it confirmed, each test first: the report's balance (only the run's readings, and the groups it read but never called); the order rule (a window under the reserve holds its group even when another window has no balance; agy's group with no buckets is unknown; no priority without the longest window's reset); the runner's data directory under `CLAUDE_CONFIG_DIR`; marks written under a lock and bounded to 8 days; a kept reading not served after a reset; model ids the lane choice can log; grok's ACP answer used by the wave's quota step; a log line from the future ignored; a refresh ended by a signal cleans up; eight documentation fixes; and the tests the workflow's walk lacked. |
| `4fd3ba3` | [Issue 008](../issues/008-development-tree-bash-path-runs-the-installed-release-bins.md): with `--plugin-dir`, the Bash `PATH` runs the installed release's bins. |
| `afaacca` | **0.10.0**: the manifest, the README's Status, and A48 and A49 built in 0.10.0. |

**The live check (§3.2 of the second handoff):** `aether-lane quota grok --refresh` on grok 1.0.52 got grok's answer to `_x.ai/billing` in 1.0 s, with no UI and no model call, and left no process, temp directory or session folder.

## 2. Found in this session

- **A3 is settled.** With 1% of the week used, grok's answer carries `creditUsagePercent: 1`. So an absent field means 0% used, as R4 reads it.
- **The swarm's final review cannot take a large build.** A 388 KB package ended the Opus reviewer without its answer (issue 005's open part, no chunking). Three reviewers on slices of the units worked.
- **The Examiner tests the spec's letter and does not read `tasks.md`.** Both of its failing tests came from places where the approved plan read the spec more precisely; the Judge settled one, and the spec was clarified.
- **agy does not offer Gemini 4 Argon yet.** The Examiner and Judge seats exited 4, and the native agents took their rounds.
- **The plan's session limit stops a session's background work with it.** The review workflow lost two lenses and its critic, and the headless Lead stopped before closing its run.

## 3. What is left

- `specs/002-quota-aware-lanes/tasks.md` (around its lines 66-68 and 100) still says a reading with a window with no balance is usable. `a428655` follows R10 instead: a known window under the reserve holds the group.
- Minor findings kept for later: the 32 the swarm's supervisors deferred (`.aether/autonomy/auto-20261014-105023-a8bf/evidence/deferred-minors.md`), and a harness name outside the lane choice's grammar (`[a-z][a-z0-9-]*`), which the table does not check yet.
- From the earlier list: Codex and Cursor in the index and the lanes, Gemini 4 Argon when agy offers it, GitHub issues #1 and #6, the Proposals of specs 002 and 003, and issue 008's proposals.

## 4. What waits for the owner

- **Grok in the lanes.** The `harnesses` option is `agy` by default, so no lane uses Grok yet. With `agy,grok`, a Haiku implementer call takes Grok 4.7 while its weekly quota is the one most at risk. Turn it on only once you accept the risk the README's Lanes section describes.
- **Leftovers:**
  - the second session's review checkout: `git worktree remove /tmp/claude-1000/-home-darkarty-Desktop-03-PROYECTOS-01-ACTIVOS-aether-plugin/a6dffa7c-8a4d-4d8e-887f-0089a160e771/scratchpad/review-002`;
  - after the release, the integration worktree and the merged local branches: `git worktree remove .worktrees/quota-aware-lanes && git branch -d feat/quota-aware-lanes feat/grok-lane fix/open-issues-0.9.1` (from `main`).

## 5. How to run things

As in [the second handoff](2026-10-14-super-lead-built.md) §5. `aether-lane quota grok --refresh` now asks grok over ACP, and opens its UI only if that gives nothing.
