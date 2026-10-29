Seen on 2026-10-28 in the frontend experiment (Snake 3D, 12 tasks, every call native), guided arm, run `20261028-170459-5fe2` (Aether 0.25.1 plus the branch `exp/frontend-guided`, which changes only agent prompts).

**What happened.** The run took four launches (units blocked by the ops fault of the companion issue). The last launch relaunched only `task-12` (Review `high`). Its final review:
- ran as **one** reviewer on **Opus `high`** (`reviewPlan()`: `isRelaunch()` → opus high), not sliced;
- listed only `task-12` under `## Units`, and only `task-12`'s deferred minor findings;
- cost US$ 0.65 (11 requests, 12.7k output tokens) and ruled `ready` with 4 minor findings.

The package itself was right: `final.diff` covers the whole run (base `40c634e`, head `1692904`). But earlier launches had merged `task-7`, `task-9` and `task-11`, whose Review is `xhigh`. Two sibling runs of the **same plan** that needed no relaunch (arms s2 and s3) got the review that risk asks for: Opus `xhigh` in 5 slices, US$ 4.91 and US$ 5.30, `ready-with-fixes` with 2 important findings each, which the Lead then fixed. So a relaunch turned a 5-slice xhigh review into a single high pass over the same diff.

**Why.** In `workflows/run.workflow.js`, `reviewPlan()`, `reviewSlices(merged)` and `reviewerPrompt()` read `units`, which holds only this launch's units. #5 made the package cover the earlier launches; the plan, the slices, the units list and the deferred minors still come from the launch.

**Proposal.** Build the final review's plan, slices, units list and deferred minors from the run's units across launches (the run's `state.json`/`units.json` hold them), so a relaunch reviews as the whole run would.

Evidence: `~/.cache/aether-exp-frontend/s4-guided/.aether/runs/20261028-170459-5fe2/` (result-1.json, result-2.json) and the run's line in `~/.cache/aether-exp-frontend/data-s4-guided/runs.jsonl` (cost by role: reviewer 0.65); the reviewer's prompt is in the session transcript under `~/.claude/projects/-home-darkarty--cache-aether-exp-frontend-s4-guided/`.
