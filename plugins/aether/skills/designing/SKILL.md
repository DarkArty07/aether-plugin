---
name: designing
description: "How the Lead prepares an intent card, runs /aether:design, and handles approved, clarify, dispute, and failed design outcomes, exams, and short designs. Load before writing intent.md, before running /aether:design, or when /aether:design returns."
---

## Designing

Design runs by itself, from the owner's intent to an approved plan. You hand over the intent card and get back one result. You decide no round, and you start no seat: `/aether:design` does.

**Ask only what matters.** Before the card, ask the owner at most five questions, one at a time, each about a choice that is hard to reverse, surprising, or a real trade-off. Their answers go into the card.

**Write the intent card.** Create `specs/NNN-<topic>/` (take NNN from `aether-plan next-spec`) and write `.specify/feature.json` with it. Then write `specs/NNN-<topic>/intent.md` in the owner's language. Only you write the card: aether-guard refuses every other writer. It lets only you and the Writer write specs, plans and tasks, and the Examiner only under `.aether/exam/`. The card holds:
- the owner's words, quoted as they said them;
- the understanding the owner confirmed;
- the criteria: what and why, never how, each tied to a quote;
- what is out;
- the answers to the clarifying questions.

Commit the folder and `.specify/feature.json`: an external seat reads the commit.

**Launch `/aether:design`** with the Workflow tool, in the background, with the JSON that `aether-plan design-args specs/NNN-<topic>` prints (in short mode, add `--short <document> --intent <text> --author <model>`).

It writes the spec, has the Judge review it, writes the plan and the tasks, has the Judge review them, and has the Examiner write the exam. At most two revisions per document. When the approved spec has 15 requirements or more, a code map runs before the plan: the mapper lists, for each requirement, the file and line the plan will touch, and the Writer of the plan receives that map in its message; a map that fails does not stop the design, and the plan is then written without a map. The native Writer writes the plan and the tasks in two calls, `plan.md` first and then `tasks.md` reading the plan (an external seat still answers the round at once). When the Examiner ends without an answer after writing tests, it is relaunched once with those tests. It ends with one result, in `status`:
- `approved`: the paths of the spec, plan and tasks, every verdict of the Judge as given, the Complexity table, the Proposals and the exam. Read the verdicts and the table, then choose the path to build it (see "The three paths"). The Proposals are not worked. An `approved` with `exam.status` `failed` is not done: when every criterion has a test, write `exam.json` from them and run `aether-exam store specs/NNN-<topic>`; when `.aether/exam/` holds tests that do not cover every criterion of the spec, the workflow already relaunched the Examiner once with the partial tests, so complete the exam yourself from the tests that exist or report it; do not start another Examiner on the same partial; if it holds none, start the Examiner once more. With `exam.status` `failed`, run a test that is outside the index before adding it to the index.
- `clarify`: questions the card did not settle, each marked `[NEEDS CLARIFICATION]`. Ask the owner these questions as one list, write the answers into the card, commit, and launch again. In an autonomous run a `clarify` does not stop the work: take the reversible side of each as an assumption, put the question in "Espera tu sí", write the side you took into the card's answers marked as your assumption, commit, and launch again.
- `dispute`: a third review that did not approve, with both positions, or a `reject`, with the Judge's direction. At the spec stage, rethink the card around the direction, or put both positions and cost in the owner's list; at the plan stage, change the plan or tasks and launch in short mode (see "Later changes"); when `mechanical` is true, fix the findings yourself. Never override the Judge silently.
- `failed`: the step and why. Launch again once (in full mode for a spec step, in short mode on the changed document for a plan step, so an approved spec is never rewritten). When the failed step is `plan-writer`, there is no plan to review yet: start the native Writer with the approved spec to write `plan.md` and `tasks.md`, then launch in short mode on `tasks.md`; the same failure twice follows the repetition rule of "Autonomous runs". When this session has no `Workflow` tool, workflows are off: see "Tools".

**Skills.** After the spec is approved and before the plan, `/aether:design` searches the skills of the card's topics, reviews the trusted ones, and installs them only in the project without committing; the rest stay on the owner's list. The approved result carries a `skills` field with what it installed, rejected, or left pending, and an untrusted author is recorded in `.aether/pending.jsonl` under the `skill-install` class.

**The Writer's questions.** Any result may carry `writerQuestions`: put them in the owner's list, or in "Espera tu sí" in a run.

**A short design** is for a bounded change that touches security or auth, data migrations or destructive operations, concurrency, or core architecture. Write it in `specs/NNN-<topic>/design.md`, commit it, and launch with `"mode": "short"`, `"document": "specs/NNN-<topic>/design.md"`, `"intent"` (the understanding the owner confirmed, with their words) and `"author"` (the model you run on) added to the args. Only the Judge's rounds run, and the Writer corrects.

**Later changes.** A later change to a spec, a plan or the tasks, and a fix after a stop at the plan stage, goes through `/aether:design` in short mode on the changed document: `"mode": "short"`, `"document"` set to its path (`specs/NNN-<topic>/spec.md`, `plan.md`, `tasks.md` or `design.md`), and `"intent"` and `"author"` as in a short design. You or the Writer make the change, and the Judge reviews it; `"author"` is the model that made it: yours, or `sonnet` for the Writer. A changed plan gets a new exam. A launch in full mode is only for a stop at the spec stage, so an approved spec is never rewritten.

**Records.** `aether-report --seats --session <session id>` counts the seats' rounds for the brief's Delegación line. In a run, record the rounds that spent another plan's quota as the `aether:autonomous-runs` skill says.

**The exam.** When the build ends, run `aether-exam run specs/NNN-<topic> --ref <the branch that holds the build>`. A test that fails is a blocking finding of the brief, with the criterion it proves, and goes into the next fix; a flaky one is minor. When you think a test is wrong, say why in "Decidí".

