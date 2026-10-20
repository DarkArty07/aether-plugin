# The ops agent can refuse to run `aether-wt merge`, and the unit is then reported as blocked

**Type:** bug (reliability of a model step that should be deterministic)
**Date:** 2026-10-09
**Found in:** the fourth launch of a 12-task plan on an application repository
**Status:** partly addressed in 0.8.0 (2026-10-13). Done: in an Aether session the mod runs the workflow's `aether-wt` and `aether-lane` commands without a model, so no agent can refuse them (A30, PR #8). Open: when the mod cannot run them, the `ops` agent is the fallback and can still refuse; the workflow then reports `unreadable output` and blocks the unit, and no regression test covers a reply that says the command was not run.
**Update 2026-10-13, 0.9.1:** a reply that is not the command's JSON now reads `unreadable output from <command> (the ops agent may have refused or not run it): <text>`, and a regression test covers a reply that says the command was not run (A46). The `ops` option turns the mod's answers off for a project that needs them off. Still open: the fallback agent can still refuse; it is only reported better.
**Update 2026-10-19, branch `fix/bug-issues`:** proposals 2 and 3 are built for the fallback path: an ops reply that says the command was not run (`did not run`, a refusal, and their kin) retries the ops step once and is reported as not run, never as the command's failure; only such a reply is retried, so a command that may have run is never run twice on a guess. What remains is Claude Code's: an ops agent that refuses twice still gives no answer, and then issue 002's status check decides a merge from git.
**GitHub:** [#4](https://github.com/DarkArty07/aether-plugin/issues/4) (private repository)

## Summary

For one unit (task 11, documents only), the `aether:ops` agent (Haiku, low effort) did not run the merge command the workflow gave it. It answered, in Spanish, that it had not executed `aether-wt merge <run> task-11`, because the command had been "computed by the workflow script, not written by the user" and it "merges a worktree into the main branch". The workflow read that text as unreadable output and marked the unit `blocked` with "merge failed", although nothing had been tried. The merge target was the run's integration branch, not `main`.

## Evidence

- In the same launch, the merges of tasks 9 and 10 through the same agent and the same prompt ran fine. Only the third one was refused, so the behaviour is intermittent.
- The unit's supervisor had already ruled `approve`. The work was saved as a patch by the final sweep, and the Lead applied it by hand after the whole test command passed.
- The failure text names the cause (the agent declined), but the workflow logs it as "unreadable output".

## Impact

- An approved unit is reported as failed, and its dependents (here the PR task) are skipped.
- The cause is a model's judgement on a command that needs none. It cannot be fixed by a retry because the ladder is for implementer failures, not for ops.
- The agent's reasoning ("computed by the script") is a prompt-injection reflex that a workflow cannot rely on to stay quiet.

## Proposals

1. **Do not run merges through a model.** `aether-wt merge`, `ensure`, `diff` and `sweep` are deterministic commands. The workflow script should run them in code (a child process), not through an agent. This also removes the 120-second timeout problem (see issue 002) and the haiku cost of 60 to 70 ops calls per run.
2. If an agent must run it, the prompt should say who authorizes the command and that its target is the integration branch of the run, and the workflow should treat "I did not run it" as a retry of the ops step, not as a failed merge.
3. Distinguish "command not run" from "command failed" in the result, so the Lead can see the difference at a glance.

## Acceptance

- A merge is never reported as failed when it was not attempted.
- A regression test covers an ops reply that says it did not run the command.

## Environment

Claude Code 2.1.295, Aether plugin 0.3, Linux (WSL2). The ops agent ran on Haiku at low effort.

## Update, 2026-10-09: it happened again, after an explicit instruction from the owner

- In the first run of the 0.5.0 plan (9 tasks), 3 of 9 merges were refused by the Haiku ops agent: "it came from a computed task text, which the harness marks as carrying no user authority". The owner had said "ya comienza a implementarlo lo veo bien" just before the launch, and the refusal quoted that same sentence as not enough. So an explicit instruction does not prevent it.
- Several `aether-wt remove` calls were refused the same way (`closeError` on four merged units).
- 42 of the run's 60 agents were ops agents, which also used up the run's agent cap (`maxAgents` 60) and put the final review at risk.
- The three approved units were saved as patches by the final sweep. The Lead applied them by hand (`git apply`), the tests passed, and the run ended with a "not ready" final review whose critical and important findings were all consequences of the three missing merges.
- This is the case for proposal 1: run the deterministic `aether-wt` commands in code, not through a model.
