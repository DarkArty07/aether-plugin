---
name: tasks
description: "Aether mode: Write tasks.md for an approved plan: a checklist index and contract tasks with Aether fields that the swarm can build."
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
   - `## Aether Execution`, with these two lines. Take the test command from the plan's Verification section.
     ```text
     - Test command: `<command>`
     - Max agents: 200
     ```
     Max agents is the total of model agents of the whole run, retries and supervisors included; it does not limit how many run at once.
   - `## Checklist`: Spec Kit's index, one line per step, in this form:
     `- [ ] T001 [P] [US1] <description> in <path> → Task <N>`
     `[P]` marks a step that can run in parallel. `[US1]` names the scenario the step serves: US1 is the first of the spec's `## User scenarios`. `→ Task <N>` names the swarm unit that does the step.
   - One `### Task N: <title>` section for each swarm unit. Number them from 1, with no gaps.

3. Write each task section in this order. It starts with the Aether block, right after its heading:
   ```markdown
   **Aether:**
   - Review: xhigh — a failed parse deletes the user's file
   - Area: backend
   - Owns: `src/api/**`, `tests/api.test.js`
   - Depends on: none
   - Serves: R1, R3
   ```
   The swarm starts every task on the cheapest model and raises it by itself: do not name a model or an effort for the implementer. Every task is one module and one concern; when tests cannot pin it down, split it.

   The fields are:
   - **Review:** optional. `high`, `xhigh` or `max`, then " — " and the reason. Without it, the review runs at `high`. `xhigh` costs about 2.5 times more than `high` on Sonnet; a task with `xhigh` or `max` also raises the run's final review to Opus `xhigh`, about 1.7 times the cost of Opus `high`; and, with `superdelegation` on, the supervisor of Sonnet's work can run on Opus. Name **Review** `xhigh` or `max` only where a mistake would reach user data, security or concurrency, and say which.
   - **Area:** a lowercase slug of letters, digits and dashes. The supervisors of one area share its latest rulings.
   - **Owns:** the paths or globs (`*`, `**`, `?`) that the task may change, separated by commas. Use relative paths only. Owns also lists every existing test that pins what the task changes: for each phrase, string or entry a task changes or removes, search `tests/` for a fragment of the old text; for each file or folder it adds or removes, search for code that lists that folder (`readdirSync`); and include tests for global rules (such as a caller per verb or a page that names every skill). If such a test belongs to another task of the same wave, move the change or add a dependency.
   - **Depends on:** required. `none` for an independent task, or one line per dependency in the form `- Depends on: Task N — reason`. Every dependency needs its reason.
   - **Merges with:** optional, `none` or a list such as `- Merges with: Task 13, Task 19`; naming it on one side is enough. Use it only when the tasks cannot be green alone, because each changes something that a test owned by another still holds: `aether-plan` builds them as one unit, which one agent builds in sequence. Otherwise give one task the file and its test, and make the other depend on it.
   - **Serves:** the requirements of the spec that the task builds, such as `- Serves: R1, R3`. Every task serves at least one requirement of the spec, and every requirement has a task. aether-plan check fails on a task that serves none, and on one that names a requirement the spec does not have. It warns about a requirement that no task serves.

   The fields are one list with no blank line between them. A blank line ends the block.

   After a blank line, write these three parts. Each one is a bold label on its own line, followed by its text. They are not list items.

   **Interfaces:** the exact names, signatures and types the task builds or uses.

   **Tests (write first):** the failing tests, in full.

   **Acceptance:** what must be true when the task is done.

   Where the exact text is the requirement, such as a message, a command line or a prompt, write it in full.

   Tests are required in every task. The implementer writes the code.

4. A unit may cover several checklist lines. Each merge runs the whole test command, so a unit must be large enough to be worth one. Tasks of the same wave must not own overlapping paths.

5. Run `aether-plan check <folder>/tasks.md` until it passes. Fix each error it reports.

6. Commit `tasks.md` with a message such as `docs(specs): add the NNN-<topic> tasks`.
