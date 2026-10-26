---
description: "Write tasks.md for an approved plan: a checklist index and contract tasks with Aether fields that the swarm can build."
---

## User Input

```text
$ARGUMENTS
```

## Outline

Never stop to ask. Where a choice is open, pick a reasonable default and write it into Global Constraints, so that every task follows it.

1. **Find the feature folder.** Read `.specify/feature.json`, or use the folder the input names. Then read `<folder>/spec.md`, `<folder>/plan.md`, and `.specify/memory/constitution.md` when it exists.

2. Write `<folder>/tasks.md` in this order:
   - A title.
   - The line `**Spec:** [spec.md](spec.md)`.
   - `## Global Constraints`: the rules every task follows.
   - `## Aether Execution`, with these three lines. Take the test command from the plan's Verification section.
     ```text
     - Test command: `<command>`
     - Ladder: haiku 2, sonnet 2, opus 1
     - Max agents: 200
     ```
   - `## Checklist`: Spec Kit's index, one line per step, in this form:
     `- [ ] T001 [P] [US1] <description> in <path> → Task <N>`
     `[P]` marks a step that can run in parallel. `[US1]` names the user story the step serves. `→ Task <N>` names the swarm unit that does the step.
   - One `### Task N: <title>` section for each swarm unit. Number them from 1, with no gaps.

3. Write each task section in this order. It starts with the Aether block, right after its heading:
   ```markdown
   **Aether:**
   - Tier: haiku high — a mechanical parser that exact tests pin down
   - Review: xhigh — a failed parse deletes the user's file
   - Area: backend
   - Owns: `src/api/**`, `tests/api.test.js`
   - Depends on: none
   - Serves: R1, R3
   ```
   The fields are:
   - **Tier:** `haiku`, `sonnet` or `opus`, then an optional effort (`low`, `medium`, `high`, `xhigh` or `max`), then " — " and the reason. Use `haiku` for work that exact tests and interfaces pin down, and that touches few files. Use `sonnet` for frontend and UI work, for integration across several files, or for behavior the tests cannot pin down exactly. Use `opus` for security and auth, data migrations or destructive operations, concurrency, and core architecture. The effort defaults to `high`. Name `xhigh` only where the tests cannot pin the behavior down and a mistake would cost more than the extra effort: it costs about 2.3 times more on Sonnet and 1.9 times more on Opus than `high`. Haiku may run at `low` or `medium` where the tests pin the work down completely. Sonnet and Opus never run below `high`. Name `max` only with a reason: on Opus it gives what `xhigh` gives.
   - **Review:** optional. `high`, `xhigh` or `max`, then " — " and the reason. Without it, the review runs at `high`. `xhigh` costs about 2.3 times more than `high` on Sonnet, and, with `superdelegation` on, the supervisor of Sonnet's work can run on Opus: name it only where a mistake would reach user data, security or concurrency, and say which.
   - **Area:** a lowercase slug of letters, digits and dashes. Each area has its own supervisor.
   - **Owns:** the paths or globs (`*`, `**`, `?`) that the task may change, separated by commas. Use relative paths only.
   - **Depends on:** `none`, or one line per dependency in the form `- Depends on: Task N — reason`. Every dependency needs its reason.
   - **Serves:** the requirements of the spec that the task builds, such as `- Serves: R1, R3`. Every task serves at least one requirement of the spec, and every requirement has a task. aether-plan check fails on a task that serves none, and on one that names a requirement the spec does not have. It warns about a requirement that no task serves.

   The fields are one list with no blank line between them. A blank line ends the block.

   After a blank line, write these three parts. Each one is a bold label on its own line, followed by its text. They are not list items.

   **Interfaces:** the exact names, signatures and types the task builds or uses.

   **Tests (write first):** the failing tests, in full.

   **Acceptance:** what must be true when the task is done.

   Where the exact text is the requirement, such as a message, a command line or a prompt, write it in full.

   Tests are required: every task states its failing tests in full. The implementer writes the code.

4. A unit may cover several checklist lines. Each merge runs the whole test command, so a unit must be large enough to be worth one. Tasks of the same wave must not own overlapping paths.

5. Run `aether-plan check <folder>/tasks.md` until it passes. Fix each error it reports.

6. Commit `tasks.md` with a message such as `docs(specs): add the NNN-<topic> tasks`.
